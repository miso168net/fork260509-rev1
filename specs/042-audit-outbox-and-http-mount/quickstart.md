# Quickstart — 042 audit-outbox-and-http-mount

**Phase**：1（Design & Contracts、Phase 1 產出）
**Audience**：implementer（人或 AI）執行 042 的步驟手冊。

依執行順序：migration → helper refactor → middleware mount → drainer + publisher → acceptance → 兩段式 commit → backlog 清理。

---

## 前置假設

- dev stack 健康（5 service：postgres / redis / rust-api / front-nginx / base-web、見 [`CLAUDE.md §8.2`](../../CLAUDE.md)）
- 預設帳號可登入（`Soybean`/`123456` 等）
- outer branch 為 `042-audit-outbox-and-http-mount`、rust-api worktree branch 為 `rev1-admin-rust-api`、base-web 不動
- `PC` shell alias（建議）：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`
- `REDIS_PW` env：`export REDIS_PW=$(cat deploy/secrets/redis_password.txt)`

---

## Step 1 — Schema migration（新 sys_audit_outbox 表）

### 1.1 建 migration 檔

檔案：`rust-api/migration/src/schemas/m20260524_e_audit_outbox_table.rs`（NEW）

依 [`research.md R-7`](./research.md) template：

```rust
//! 042 audit-outbox-and-http-mount: 新增 sys_audit_outbox 表為 audit event 耐久暫存區
//! per spec 042 FR-002、SC-009、data-model.md §E1。

use sea_orm_migration::{prelude::*, sea_orm::ConnectionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(r#"
            CREATE TABLE sys_audit_outbox (
                id BIGSERIAL PRIMARY KEY,
                audit_event_json JSONB NOT NULL,
                published_at TIMESTAMPTZ NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX idx_sys_audit_outbox_pending
                ON sys_audit_outbox (id)
                WHERE published_at IS NULL;
        "#).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(r#"
            DROP TABLE IF EXISTS sys_audit_outbox;
        "#).await?;
        Ok(())
    }
}
```

### 1.2 註冊 mod + Migrator

檔案：`rust-api/migration/src/schemas/mod.rs` 末段加 `pub mod m20260524_e_audit_outbox_table;`

檔案：`rust-api/migration/src/lib.rs` `Migrator::migrations()` vec 末加：
```rust
Box::new(schemas::m20260524_e_audit_outbox_table::Migration),
```

### 1.3 跑 migration（dev stack）

```bash
$PC up -d migration --force-recreate --wait
$PC logs migration --tail 5
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_audit_outbox"
```

對應 C-V2。

### 1.4 加 Sea-ORM entity

檔案：`rust-api/server/model/src/admin/entities/sys_audit_outbox.rs`（NEW）

```rust
//! Sea-ORM entity for sys_audit_outbox table (042)
use sea_orm::entity::prelude::*;
use serde::Serialize;
use serde_json::Value as JsonValue;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize)]
#[sea_orm(table_name = "sys_audit_outbox")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub audit_event_json: JsonValue,
    pub published_at: Option<DateTimeWithTimeZone>,
    pub retry_count: i32,
    pub last_error: Option<String>,
    pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
```

檔案：`rust-api/server/model/src/admin/entities/mod.rs` 加 `pub mod sys_audit_outbox;`

檔案：`rust-api/server/model/src/admin/entities/prelude.rs` 加 `pub use super::sys_audit_outbox::Entity as SysAuditOutbox;`

---

## Step 2 — `audit_log::write_in_txn` 內部 refactor + 新 helper

### 2.1 內部目標改 outbox

檔案：`rust-api/server/model/src/admin/audit_log.rs`

改 `pub async fn write_in_txn(txn, event)` 內部：
- 移除 SysOperationLogActiveModel 直接 INSERT 邏輯
- 改：序列化 event 為 audit_event_json JSONB、INSERT 至 sys_audit_outbox（用同 txn）
- 增 `http_extras: None`（service-level INTERNAL 沒 HTTP-only fields）

```rust
use crate::admin::entities::sys_audit_outbox::ActiveModel as SysAuditOutboxActiveModel;

pub async fn write_in_txn(
    txn: &DatabaseTransaction,
    event: AuditEvent<'_>,
) -> Result<(), AppError> {
    let event_json = serde_json::to_value(AuditEventFull {
        event: &event,
        http_extras: None,
    }).map_err(|e| AppError::from(DbErr::Custom(format!("audit JSON error: {}", e))))?;

    let outbox_row = SysAuditOutboxActiveModel {
        audit_event_json: Set(event_json),
        ..Default::default()
    };
    outbox_row.insert(txn).await.map_err(AppError::from)?;
    Ok(())
}

#[derive(Serialize)]
struct AuditEventFull<'a, 'b> {
    #[serde(flatten)]
    event: &'b AuditEvent<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    http_extras: Option<HttpExtras>,
}

#[derive(Serialize, Deserialize)]
pub struct HttpExtras {
    pub params: Option<JsonValue>,
    pub body: Option<JsonValue>,
    pub response: Option<JsonValue>,
    pub start_time: NaiveDateTime,
    pub end_time: NaiveDateTime,
    pub duration: i32,
}
```

### 2.2 新 helper for HTTP middleware

同檔加 `pub async fn write_outbox_for_http(ctx: OperationLogContext)`：

```rust
pub async fn write_outbox_for_http(ctx: OperationLogContext) -> Result<(), AppError> {
    let entity_type = url_to_entity_type(&ctx.url);
    let actor = Actor {
        id: ctx.user_id.unwrap_or_default(),
        username: ctx.username.unwrap_or_default(),
        domain: ctx.domain.unwrap_or_default(),
    };
    let operation = match ctx.method.to_uppercase().as_str() {
        "POST" => AuditOperation::Insert,
        "PUT" | "PATCH" => AuditOperation::Update,
        "DELETE" => AuditOperation::SoftDelete,
        _ => return Ok(()),  // GET/HEAD/OPTIONS/TRACE skip per FR-015
    };
    let event = AuditEvent {
        actor: &actor,
        operation,
        entity_type,
        entity_id: extract_entity_id_from_url(&ctx.url),
        payload_before: None,
        payload_after: None,
        description: Some(format!("HTTP {} {}", ctx.method, ctx.url)),
        source: AuditSource::Http {
            method: ctx.method.clone(),
            url: ctx.url.clone(),
            ip: ctx.ip.clone(),
            user_agent: ctx.user_agent.clone(),
        },
        request_id: Some(ctx.request_id.clone()),
    };
    let event_json = serde_json::to_value(AuditEventFull {
        event: &event,
        http_extras: Some(HttpExtras {
            params: ctx.params,
            body: ctx.body,
            response: ctx.response,
            start_time: ctx.start_time,
            end_time: ctx.end_time,
            duration: ctx.duration,
        }),
    }).map_err(|e| AppError::from(DbErr::Custom(format!("audit JSON error: {}", e))))?;

    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await?;
    let outbox_row = SysAuditOutboxActiveModel {
        audit_event_json: Set(event_json),
        ..Default::default()
    };
    outbox_row.insert(&txn).await?;
    txn.commit().await?;
    Ok(())
}
```

### 2.3 pure fn `url_to_entity_type`

放 `audit_log.rs` 或新 `server/core/src/web/url_entity_type.rs`、unit-test 涵蓋（per data-model E2 完整 table）。

---

## Step 3 — OperationLogLayer mount + URL prefix 規則 update

### 3.1 apply_layers 加 mount

檔案：`rust-api/server/initialize/src/router_initialization.rs`

`apply_layers` 函式末段（per research R-3、在所有既有 layer 之後）加：
```rust
use server_core::web::operation_log::OperationLogLayer;
// ...
router = router.layer(OperationLogLayer::new(true));
```

### 3.2 移既有 per-route mount

檔案：`rust-api/server/router/src/admin/sys_menu_route.rs` line 16：

```diff
- get(SysMenuApi::get_constant_routes).layer(OperationLogLayer::new(true)),
+ get(SysMenuApi::get_constant_routes),
```

移除 use line：
```diff
- use server_core::web::operation_log::OperationLogLayer;
```

### 3.3 middleware refactor 從 fire event 改 spawn outbox-write

檔案：`rust-api/server/core/src/web/operation_log.rs` 改 `global::send_dyn_event(...)` 為：
```rust
// 改前：
// global::send_dyn_event(
//     SystemEvent::AuditOperationLoggedEvent.as_ref(),
//     Box::new(context),
// );
// 改後：
tokio::spawn(async move {
    if let Err(e) = server_model::admin::audit_log::write_outbox_for_http(context).await {
        tracing::warn!(target: "operation_log_middleware",
            error = ?e,
            "HTTP audit outbox write failed (response unaffected)");
    }
});
```

### 3.4 移除 event channel HTTP audit listener

檔案：`rust-api/server/initialize/src/event_channel_initialization.rs`：
```diff
  global::register_event_listeners(
      Box::new(|rx| Box::pin(jwt_created_listener(rx))),
      &[
          (SystemEvent::AuthLoggedInEvent.to_string(),
           Box::new(|rx| Box::pin(auth_login_listener(rx)))),
-         (SystemEvent::AuditOperationLoggedEvent.to_string(),
-          Box::new(|rx| Box::pin(sys_operation_log_listener(rx)))),
          (SystemEvent::AuthApiKeyValidatedEvent.to_string(),
           Box::new(|rx| Box::pin(api_key_validate_listener(rx)))),
      ],
  ).await;
```

`sys_operation_log_listener` 函式本身（`sys_operation_log_service.rs:193`）保留為「standby pattern」、加 `#[deprecated]` 或刪除（implementer 判斷）。

---

## Step 4 — Drainer + Redis publisher

### 4.1 audit_publisher.rs

檔案：`rust-api/server/global/src/audit_publisher.rs`（NEW、沿 `casbin_notify.rs` 體例）

per research R-5 template：
```rust
pub const AUDIT_STREAM_KEY: &str = "audit:events";
pub const AUDIT_STREAM_MAXLEN_APPROX: usize = 10000;

pub async fn publish_audit_event(audit_event_json: &serde_json::Value, maxlen: usize) {
    let client = {
        let guard = GLOBAL_PRIMARY_REDIS.read().await;
        match guard.as_ref() {
            Some(RedisConnection::Single(client)) => client.clone(),
            Some(RedisConnection::Cluster(_)) => {
                tracing::warn!("publish_audit_event: Cluster 不支援、略過");
                return;
            }
            None => {
                tracing::warn!("publish_audit_event: Redis 未初始化、略過");
                return;
            }
        }
    };
    let mut conn = match client.get_multiplexed_async_connection().await {
        Ok(conn) => conn,
        Err(err) => {
            tracing::warn!("publish_audit_event: 連線失敗、略過: {}", err);
            return;
        }
    };
    let payload = audit_event_json.to_string();
    let result: redis::RedisResult<String> = redis::cmd("XADD")
        .arg(AUDIT_STREAM_KEY)
        .arg("MAXLEN").arg("~").arg(maxlen)
        .arg("*")
        .arg("event").arg(payload)
        .query_async(&mut conn).await;
    if let Err(err) = result {
        tracing::warn!("publish_audit_event: XADD 失敗: {}", err);
    }
}
```

檔案：`rust-api/server/global/src/lib.rs` 加 `pub mod audit_publisher;`。

### 4.2 sys_audit_outbox_drainer.rs

檔案：`rust-api/server/service/src/admin/sys_audit_outbox_drainer.rs`（NEW）

```rust
use std::time::Duration;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set, TransactionTrait};
use server_config::model::AuditOutboxConfig;
use server_core::web::audit::{AuditEvent, AuditSource};
use server_global::{audit_publisher::publish_audit_event, project_error};
use server_model::admin::{
    audit_log::AuditEventFull,
    entities::{
        sys_audit_outbox::{self, ActiveModel as OutboxActiveModel, Entity as OutboxEntity},
        sys_operation_log::ActiveModel as OperationLogActiveModel,
    },
};
use ulid::Ulid;

use crate::helper::db_helper;

pub async fn run_drainer_loop(config: AuditOutboxConfig) {
    tracing::info!("audit_outbox_drainer started (batch_size={}, sleep_ms={}, max_retry={})",
        config.drainer_batch_size, config.drainer_sleep_interval_ms, config.drainer_max_retry);
    loop {
        match drainer_one_batch(&config).await {
            Ok(0) => tokio::time::sleep(Duration::from_millis(config.drainer_sleep_interval_ms)).await,
            Ok(_) => {} // 有處理就立刻下一輪
            Err(e) => {
                project_error!("drainer batch error: {:?}", e);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
}

async fn drainer_one_batch(config: &AuditOutboxConfig) -> Result<usize, AppError> {
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await?;

    // SELECT FOR UPDATE SKIP LOCKED LIMIT N
    let pending: Vec<sys_audit_outbox::Model> = OutboxEntity::find()
        .filter(sys_audit_outbox::Column::PublishedAt.is_null())
        .filter(sys_audit_outbox::Column::RetryCount.lt(config.drainer_max_retry as i32))
        .order_by_asc(sys_audit_outbox::Column::Id)
        .limit(config.drainer_batch_size)
        .lock_with_behavior(LockType::Update, LockBehavior::SkipLocked)
        .all(&txn).await?;

    let mut processed = 0;
    for row in pending {
        match process_one_row(&txn, &row, config).await {
            Ok(()) => {
                let mut active: OutboxActiveModel = row.into();
                active.published_at = Set(Some(Utc::now().into()));
                active.update(&txn).await?;
                processed += 1;
            }
            Err(e) => {
                let mut active: OutboxActiveModel = row.into();
                active.retry_count = Set(active.retry_count.unwrap() + 1);
                active.last_error = Set(Some(e.to_string()));
                active.update(&txn).await?;
            }
        }
    }

    txn.commit().await?;
    Ok(processed)
}

async fn process_one_row(
    txn: &DatabaseTransaction,
    row: &sys_audit_outbox::Model,
    config: &AuditOutboxConfig,
) -> Result<(), AppError> {
    // 1. publish to Redis stream（fire-and-forget、失敗只 warn 不 bail）
    publish_audit_event(&row.audit_event_json, config.redis_stream_maxlen_approx).await;

    // 2. INSERT sys_operation_log（從 audit_event_json deserialize）
    let full: AuditEventFull = serde_json::from_value(row.audit_event_json.clone())
        .map_err(|e| AppError::from(DbErr::Custom(format!("audit JSON deserialize: {}", e))))?;
    let log_row = build_operation_log_active_model(&full)?;
    log_row.insert(txn).await?;
    Ok(())
}

fn build_operation_log_active_model(full: &AuditEventFull) -> Result<OperationLogActiveModel, AppError> {
    let (method, url, ip, user_agent) = match &full.event.source {
        AuditSource::Http { method, url, ip, user_agent } =>
            (method.clone(), url.clone(), ip.clone(), user_agent.clone()),
        AuditSource::Internal => ("INTERNAL".into(), String::new(), String::new(), None),
        AuditSource::Cleanup => ("CLEANUP".into(), String::new(), String::new(), None),
    };
    Ok(OperationLogActiveModel {
        id: Set(Ulid::new().to_string()),
        user_id: Set(full.event.actor.id.clone()),
        username: Set(full.event.actor.username.clone()),
        domain: Set(full.event.actor.domain.clone()),
        module_name: Set(full.event.entity_type.to_string()),
        description: Set(full.event.description.clone().unwrap_or_else(|| format!("{} {}", full.event.operation.as_str(), full.event.entity_id))),
        request_id: Set(full.event.request_id.clone().unwrap_or_default()),
        method: Set(method),
        url: Set(url),
        ip: Set(ip),
        user_agent: Set(user_agent),
        params: Set(full.http_extras.as_ref().and_then(|e| e.params.clone())),
        body: Set(full.http_extras.as_ref().and_then(|e| e.body.clone())),
        response: Set(full.http_extras.as_ref().and_then(|e| e.response.clone())),
        start_time: Set(full.http_extras.as_ref().map(|e| e.start_time).unwrap_or_else(|| Utc::now().naive_utc())),
        end_time: Set(full.http_extras.as_ref().map(|e| e.end_time).unwrap_or_else(|| Utc::now().naive_utc())),
        duration: Set(full.http_extras.as_ref().map(|e| e.duration).unwrap_or(0)),
        created_at: Set(Utc::now().naive_utc()),
        operation: Set(full.event.operation.as_str().to_string()),
        entity_id: Set(Some(full.event.entity_id.clone())),
        payload_before: Set(full.event.payload_before.clone()),
        payload_after: Set(full.event.payload_after.clone()),
    })
}
```

### 4.3 spawn drainer

檔案：`rust-api/server/initialize/src/audit_outbox_initialization.rs`（NEW）

```rust
use crate::server_config::get_audit_outbox_config;
use server_service::admin::run_drainer_loop;

pub async fn initialize_audit_outbox_drainer() {
    let config = get_audit_outbox_config().await;
    tokio::spawn(async move {
        run_drainer_loop(config).await;
    });
    tracing::info!("audit_outbox_drainer spawned");
}
```

檔案：`rust-api/server/initialize/src/lib.rs` 加 `pub mod audit_outbox_initialization;`、`pub use audit_outbox_initialization::initialize_audit_outbox_drainer;`

檔案：`rust-api/server/bin/src/main.rs` 在 `init_redis_pools().await;`（line 25）之後加：
```rust
server_initialize::initialize_audit_outbox_drainer().await;
```

### 4.4 config（application.yaml）+ Rust config struct

依 research R-8。

---

## Step 5 — rust-api build + dev stack restart

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/

$PC up -d rust-api migration --force-recreate --wait
$PC ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}" | grep -E "rust-api|postgres|redis|front-nginx|base-web|migration"
# 預期 5 service + migration（exited）all healthy
```

對應 C-V1 + C-V2。

---

## Step 6 — 跑 acceptance（contracts/verification-commands.md C-V1~C-V11）

依 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 跑 C-V1 ~ C-V11。

順序建議：
- C-V1 / C-V2（build + migration）
- C-V3 / C-V4（雙視角 + 全 router）
- C-V5 / C-V6（drainer + Redis stream）
- C-V7 / C-V8（multi-replica + Redis 暫停）
- C-V9 / C-V11（URL prefix + R2 結案）
- C-V10（scope）

每 C-V 結果記錄；FAIL 則 debug、修、重跑該 C-V 直到全 PASS。

---

## Step 7 — 兩段式 commit（per CLAUDE.md §4.1）

### 7.1 第一段 — rust-api worktree

```bash
cd rust-api
git status  # 確認在 rev1-admin-rust-api 分支
git add migration/src/schemas/m20260524_e_audit_outbox_table.rs \
        migration/src/schemas/mod.rs \
        migration/src/lib.rs \
        server/core/src/web/operation_log.rs \
        server/model/src/admin/audit_log.rs \
        server/model/src/admin/entities/{mod.rs,prelude.rs,sys_audit_outbox.rs} \
        server/service/src/admin/{mod.rs,sys_audit_outbox_drainer.rs,sys_operation_log_service.rs} \
        server/global/src/{audit_publisher.rs,lib.rs} \
        server/initialize/src/{audit_outbox_initialization.rs,event_channel_initialization.rs,router_initialization.rs,lib.rs} \
        server/router/src/admin/sys_menu_route.rs \
        server/resources/application*.yaml \
        server/config/src/model/{audit_outbox_config.rs,mod.rs,config.rs} \
        server/bin/src/main.rs
git diff --staged --stat
git commit -m "$(cat <<'EOF'
feat(rust-api): audit outbox + HTTP middleware audit mount (042 R3+F2.2)

新增 sys_audit_outbox 表為 audit event 耐久暫存區、background drainer
推 Redis Stream `audit:events` + sys_operation_log。Pattern A unified
outbox-first：INTERNAL 與 HTTP audit 統一 sink、0-loss 保證、
multi-replica W-F11 safe (FOR UPDATE SKIP LOCKED)、Redis Cluster
graceful skip。spec 003 C8 期望（每 write 2 row）自動轉綠、R2 失敗登入
audit 自動結案。

- 新 migration: schemas/m20260524_e_audit_outbox_table.rs
- 新 entity: sys_audit_outbox (BIGSERIAL + JSONB + partial index)
- audit_log::write_in_txn 內部目標改 outbox（caller API 不變、030-040
  全 callsite 0 改）+ 新 write_outbox_for_http helper
- OperationLogLayer mount 進 apply_layers（5 處統一掛、移除既有 1 處
  per-route mount in sys_menu_route.rs:16）
- 新 audit_outbox_drainer 背景 task: FOR UPDATE SKIP LOCKED + INSERT
  sys_operation_log + XADD Redis Stream + UPDATE published_at
- 新 audit_publisher.rs (沿 casbin_notify.rs 體例 fire-and-forget +
  cluster skip)
- URL→entity_type 規則 fix：從 /api/sys-user 改 /api/user、加 systemManage
  alias 完整映射、pure fn url_to_entity_type unit-tested
- application.yaml 新 audit_outbox section + AuditOutboxConfig struct
- event-channel HTTP audit listener 退役（auth/jwt/api_key 其他 listener
  保留不動）

per spec 042-audit-outbox-and-http-mount 全 14 FR + 11 SC、C-V1~C-V11
全 PASS、Constitution v1.4.0 5/5 PASS（II audit 強化、其他不退化）
EOF
)"
git push origin rev1-admin-rust-api
cd ..
```

**Push 前需 user 同意**（per ~/.claude/CLAUDE.md §5）。

### 7.2 第二段 — outer rev1-admin-root（feature branch 042）

```bash
git branch --show-current  # 確認 042-audit-outbox-and-http-mount
git status  # 應看到：modified rust-api (new commits) + docs/INTEGRATION-CHECKLIST.md
git add rust-api docs/INTEGRATION-CHECKLIST.md
git commit -m "$(cat <<'EOF'
chore(submodule): bump rust-api 到 <SHA> — 042 audit-outbox-and-http-mount

- rust-api SHA pin 同步：feat(rust-api) audit outbox + HTTP middleware
  audit mount
- INTEGRATION-CHECKLIST: 移除 R2 / R3 / F2.2 (042 已處理)、加 042 entry
- spec 042 設計鏈：brainstorm + spec/plan/research/data-model/contracts/
  quickstart 全套

base-web 0 改動、0 nestjs、軌道外 rust-only
EOF
)"
```

**Push 前需 user 同意**。

### 7.3 Merge 回 default

acceptance 全 PASS 後：

```bash
git checkout rev1-admin-root
git merge --no-ff 042-audit-outbox-and-http-mount -m "Merge feature 042-audit-outbox-and-http-mount"
# 再次 push 前須 user 同意
git push origin rev1-admin-root  # 須 user OK
```

---

## Step 8 — backlog 清理（FR-013、SC-010）

依 spec FR-013、更新 `docs/INTEGRATION-CHECKLIST.md`：

### 8.1 從「衍生 follow-up」table 移除 2 row

- `R2 | F14 DESIGN-B cutover review | F5.1 登入失敗無 audit ...`
- `R3 | regression 2026-05-24 / F003 C-V8 | HTTP middleware audit gap ...`

### 8.2 從「規劃中 follow-up」table 移除 1 row

- `F2.2 | F2 拆分（F2.1 已交） | audit-log outbox + Redis subscriber TTL fallback ...`

### 8.3 「已完成里程碑」加 1 entry

按既有體例（每 feature 1 行、限 outer/merge/worktree SHA + spec 連結 + 一句話）：

```markdown
- [x] **042 audit-outbox-and-http-mount** ✅（2026-05-XX 完成；outer `<SHA>` + merge `<SHA>`、rust-api `<SHA>`、base-web 0 改動；spec `specs/042-audit-outbox-and-http-mount/`）— R3 + F2.2 + R2 bundled = 新 sys_audit_outbox 表為 audit event 耐久暫存區 + background drainer 推 Redis Stream + sys_operation_log；Pattern A unified outbox-first；HTTP middleware audit 補完 spec 003 C8 期望（每 write 2 row）+ R2 失敗登入 audit 自動結案；軌道外 rust-only + spec md
```

### 8.4 Current Focus 下一步

從「042 進行中」→「W-F12/13/14 observability（subscriber 即可消費 audit:events）」

---

## 收尾 checklist

- [ ] Step 1 migration + entity 完
- [ ] Step 2 audit_log refactor + write_outbox_for_http
- [ ] Step 3 OperationLogLayer mount + URL prefix 規則
- [ ] Step 4 drainer + publisher + spawn
- [ ] Step 5 build + dev stack restart 5 service healthy
- [ ] Step 6 C-V1~C-V11 全 PASS
- [ ] Step 7.1 第一段 rust-api commit + push（user 同意）
- [ ] Step 7.2 第二段 outer commit
- [ ] Step 7.3 merge 回 default（user 同意才 push）
- [ ] Step 8 backlog 清理完成（R2 / R3 / F2.2 row 移除、042 entry 加）
- [ ] 通知 user 進入下一 follow-up（W-F12/13/14 observability）
