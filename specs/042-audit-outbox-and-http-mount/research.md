# Phase 0 Research — 042 audit-outbox-and-http-mount

**日期**：2026-05-24
**Phase**：Phase 0（research、resolve NEEDS CLARIFICATION + 驗 brainstorm 假設）
**前置**：[`spec.md`](./spec.md)（17/17 PASS、0 NEEDS CLARIFICATION）+ [`docs/superpowers/042-feature-audit-outbox-and-http-mount.md`](../../docs/superpowers/042-feature-audit-outbox-and-http-mount.md)（brainstorm 3 Q 拍板）

依 [`CLAUDE.md §3 Phase 0 research 紀律`](../../CLAUDE.md)（040 落地後加入）：必含實際 grep 結果、不信 brainstorm 階段的命名/抽象假設。

---

## R-1：`audit_log::write_in_txn` 真實 signature + 內部行為

**Decision**：refactor 內部目標從直接 INSERT sys_operation_log → INSERT sys_audit_outbox（audit_event_json JSONB column 序列化整個 `AuditEvent`）；caller signature 不變、030–040 全 callsite 0 改動。

**Rationale**（grep 確認）：
- `rust-api/server/model/src/admin/audit_log.rs:29-32`：
  ```rust
  pub async fn write_in_txn(
      txn: &DatabaseTransaction,
      event: AuditEvent<'_>,
  ) -> Result<(), AppError>
  ```
- 內部現行行為（lines 33-46）：將 `event.source` 拆成 `(method, url, ip, user_agent)` 4 個欄、然後 INSERT `sys_operation_log` 用 SysOperationLogActiveModel
- refactor 後內部行為：將整個 `event` serde_json::to_value(event)? → INSERT `sys_audit_outbox.audit_event_json`；method/url/ip/user_agent 也保留在 JSONB 內、drainer 階段拆成 sys_operation_log 各欄
- caller API 不變：`audit_log::write_in_txn(&txn, event)` signature + Result type 一樣；030–040 features 30+ callsite 0 改

**Alternatives considered**：
- caller API 改、要求 caller 直接寫 outbox：拒——影響面太大、與「F2.1 callsite 0 改動」承諾衝突
- 雙寫（既寫 sys_operation_log 又寫 outbox）：拒——破壞「outbox 為單一 sink」原則、複雜化 transactional semantics

---

## R-2：`OperationLogContext` 完整 fields + middleware 行為

**Decision**：middleware 既有 `OperationLogContext` 完整 fields 可重用、refactor 為「build context → tokio::spawn 寫 outbox」取代「build context → fire event」；URL→entity_type 規則移到 outbox-write helper 內（不在 middleware 主路徑、保持 middleware 輕量）。

**Rationale**（grep 確認）：
- `rust-api/server/global/src/global.rs:223-241`：
  ```rust
  pub struct OperationLogContext {
      pub user_id: Option<String>,
      pub username: Option<String>,
      pub domain: Option<String>,
      pub module_name: String,      // hardcode "TODO" placeholder
      pub description: String,      // hardcode "TODO" placeholder
      pub request_id: String,
      pub method: String,
      pub url: String,
      pub ip: String,
      pub user_agent: Option<String>,
      pub params: Option<Value>,
      pub body: Option<Value>,
      pub response: Option<Value>,
      pub start_time: NaiveDateTime,
      pub end_time: NaiveDateTime,
      pub duration: i32,
      pub created_at: NaiveDateTime,
  }
  ```
- middleware build context 邏輯（operation_log.rs:90-145）：完整且正確、含 user / request_id / ip / user_agent / params / body / response / duration 等
- 改點僅：line 145 `global::send_dyn_event(...)` 改為 `tokio::spawn(async move { audit_log::write_outbox_for_http(ctx).await })`；其他不動
- `module_name` / `description` 兩個 TODO placeholder：在 outbox-write helper 內依 URL 推導 entity_type 填 module_name；description 用 `format!("HTTP {} {}", method, url)` 統一

**Alternatives considered**：
- URL→entity_type 規則放在 middleware：拒——middleware 該保持薄、helper 集中規則便於 unit-test
- 完全重寫 OperationLogContext：拒——既有結構合理、改寫面積過大

---

## R-3：`apply_layers` 5 callsite + mount point

**Decision**：`OperationLogLayer` 在 `apply_layers` 函式末段（在 casbin / api_key / jwt 之後、但仍在 `apply_layers` 內）統一 mount；macro_rules `merge_router!` 內 2 處（None / Single）+ 直接 callsite 3 處（auth_router / protected_menu_router / system_manage_router）共 5 處全涵蓋。

**Rationale**（grep 確認 `rust-api/server/initialize/src/router_initialization.rs`）：
- Line 41-:  `async fn apply_layers<T: Send + Sync + 'static>(router, services, need_casbin, need_auth, api_validation, casbin, audience) -> Router`
- Line 165-179: macro_rules `merge_router!` 內 2 個 arm（None / Single）各呼叫 apply_layers
- Line 218-226: `let auth_router = apply_layers(auth_router, Services::None, true, true, None, casbin.clone(), audience)`
- Line 258-266: `let protected_menu_router = apply_layers(protected_menu_router, Services::None, true, true, None, casbin.clone(), audience)`
- Line 366-374: `let system_manage_router = apply_layers(system_manage_router, Services::None, true, true, None, casbin.clone(), audience)`

→ 5 mount point 全在 `apply_layers` 函式內統一加 1 line `router = router.layer(OperationLogLayer::new(true));` 即可涵蓋全 router。

**Layer 順序確認**（per Constitution Principle I）：
- 既有 apply_layers 順序：TraceLayer → RequestIdLayer → CasbinLayer → ApiKey middleware → JWT middleware
- OperationLogLayer 加在最後（最內層）：middleware 包在 casbin / api_key / jwt 之後、request 通過 enforce 才到 middleware
- 影響：audit row 的 user_id / domain 等 fields 已由前面 layer 寫入 extensions、middleware 可直接讀
- Casbin enforce 不被繞過、user 必須有 role 才到達 OperationLogLayer

**Alternatives considered**：
- 改各 router 自掛：拒——`apply_layers` 統一 mount 更乾淨、減少漏掛風險
- 在 axum::serve 前 wrap（同 NormalizePathLayer 041 處理）：拒——middleware 需要讀 request extensions（user / casbin info）、必須在 enforce 之後 + 在 routing 之內

---

## R-4：`sys_operation_log` entity schema 完整列 + outbox JSONB↔row mapping

**Decision**：drainer 從 outbox 讀 audit_event_json（JSONB） → deserialize 為 `AuditEvent` → 對應填 sys_operation_log 各欄 → INSERT。所有 sys_operation_log 欄位皆能從 AuditEvent 推導（無新欄需求）。

**Rationale**（grep 確認 `rust-api/server/model/src/admin/entities/sys_operation_log.rs`）：

sys_operation_log 完整 column 列：
| Column | Type | 來源（AuditEvent） |
|---|---|---|
| `id` | TEXT (PK, ULID) | drainer 生成 Ulid::new().to_string() |
| `user_id` | TEXT | event.actor.id |
| `username` | TEXT | event.actor.username |
| `domain` | TEXT | event.actor.domain |
| `module_name` | TEXT | event.entity_type |
| `description` | TEXT | event.description.unwrap_or(format!("{} {}", op, id)) |
| `request_id` | TEXT | event.request_id.unwrap_or("") |
| `method` | TEXT | source 拆出（HTTP→method、Internal→"INTERNAL"、Cleanup→"CLEANUP"）|
| `url` | TEXT | source 拆出（HTTP→url、Internal→""、Cleanup→""）|
| `ip` | TEXT | source 拆出（HTTP→ip、Internal→""、Cleanup→""）|
| `user_agent` | TEXT NULL | source 拆出（HTTP→user_agent）|
| `params` | JSONB NULL | HTTP middleware 額外塞、其他 None |
| `body` | JSONB NULL | HTTP middleware 額外塞、其他 None |
| `response` | JSONB NULL | HTTP middleware 額外塞、其他 None |
| `start_time` | TIMESTAMP | drainer：HTTP 用 ctx.start_time、Internal 用 now() |
| `end_time` | TIMESTAMP | drainer：HTTP 用 ctx.end_time、Internal 用 now() |
| `duration` | INT | drainer：HTTP 用 ctx.duration、Internal 用 0 |
| `created_at` | TIMESTAMP | drainer：Utc::now().naive_utc() |
| `operation` | TEXT | event.operation.as_str() |
| `entity_id` | TEXT NULL | event.entity_id |
| `payload_before` | JSONB NULL | event.payload_before |
| `payload_after` | JSONB NULL | event.payload_after |

**特殊處理**：
- HTTP source 的 params/body/response/start_time/end_time/duration 需從 OperationLogContext 提取；要包進 audit_event_json 才能讓 drainer 拿到 → audit_event_json schema 為 `{event: AuditEvent, http_extras: Option<HttpExtras>}`
- `HttpExtras` struct 含 params/body/response/start_time/end_time/duration、僅 HTTP source 有

**Alternatives considered**：
- 為 outbox 新增 columns 取代 JSONB：拒——schema 僵化、AuditEvent 演進每次都要 migration
- 為 sys_operation_log 加新欄：拒——FR-012 / SC-009 0 schema 改動

---

## R-5：`casbin_notify.rs` Redis publisher 體例 = `audit_publisher.rs` template

**Decision**：`audit_publisher.rs` 完全照 `casbin_notify.rs` 體例：fire-and-forget + Cluster 模式 graceful skip + Redis 未初始化/連線失敗 graceful skip + 失敗只 warn 不回 error。

**Rationale**（grep 確認 `rust-api/server/global/src/casbin_notify.rs`）：
- pub fn signature：`pub async fn notify_casbin_changed()` — 無 Result、不回 error、不阻塞 caller
- 3 段 guard：
  ```rust
  let client = {
      let guard = GLOBAL_PRIMARY_REDIS.read().await;
      match guard.as_ref() {
          Some(RedisConnection::Single(client)) => client.clone(),
          Some(RedisConnection::Cluster(_)) => { tracing::warn!(...); return; }
          None => { tracing::warn!(...); return; }
      }
  };
  let mut conn = match client.get_multiplexed_async_connection().await {
      Ok(conn) => conn,
      Err(err) => { tracing::warn!(...); return; }
  };
  let result: redis::RedisResult<()> = redis::cmd("PUBLISH")
      .arg(CASBIN_INVALIDATE_CHANNEL).arg(CASBIN_INVALIDATE_PAYLOAD)
      .query_async(&mut conn).await;
  if let Err(err) = result { tracing::warn!(...); }
  ```
- `audit_publisher.rs` template：相同結構、`redis::cmd("XADD")` 取代 `PUBLISH`、stream key `audit:events` 取代 channel name、MAXLEN ~ 10000 為 trim 上限

**Code snippet template**（implementer 直接 copy 後改）：
```rust
pub const AUDIT_STREAM_KEY: &str = "audit:events";
pub const AUDIT_STREAM_MAXLEN_APPROX: usize = 10000;

pub async fn publish_audit_event(audit_event_json: &serde_json::Value) {
    let client = { /* 3 段 guard 同 casbin_notify */ };
    let mut conn = match client.get_multiplexed_async_connection().await { /* 同 */ };
    let payload = audit_event_json.to_string();  // JSONB → String
    let result: redis::RedisResult<String> = redis::cmd("XADD")
        .arg(AUDIT_STREAM_KEY)
        .arg("MAXLEN").arg("~").arg(AUDIT_STREAM_MAXLEN_APPROX)
        .arg("*")  // auto-generate id
        .arg("event").arg(payload)
        .query_async(&mut conn).await;
    if let Err(err) = result {
        tracing::warn!(target: "[soybean-admin-rust]",
            "publish_audit_event: XADD 失敗: {}", err);
    }
}
```

**Alternatives considered**：
- 用 Redis Pub/Sub 而非 Streams：拒——Pub/Sub 不持久、subscriber 落後即遺失、無法支援 FR-006 fallback semantics
- Stream MAXLEN 用精確上限（不加 `~`）：拒——精確 trim 對 Redis 較貴、approximate 已足夠 retention 用途

---

## R-6：systemManage alias endpoint 完整清單 + entity_type 對應 table

**Decision**：URL→entity_type 規則 table 涵蓋全 native admin + 全 systemManage alias；表如下、規則 hard-code 在 `handle_operation_log_event` 或新 helper（pure fn、可 unit-test）。

**Rationale**（grep 確認 `rust-api/server/router/src/admin/sys_system_manage_route.rs`）：

systemManage alias write endpoint（GET 不算、per FR-015 GET skip audit）：
| Path | Method | entity_type |
|---|---|---|
| `/api/systemManage/addUser` | POST | sys_user |
| `/api/systemManage/updateUser` | POST | sys_user |
| `/api/systemManage/addMenu` | POST | sys_menu |
| `/api/systemManage/updateMenu` | POST | sys_menu |
| `/api/systemManage/deleteMenu/:id` | DELETE | sys_menu |
| `/api/systemManage/batchDeleteMenu` | DELETE | sys_menu |
| `/api/systemManage/addRole` | POST | sys_role |
| `/api/systemManage/updateRole` | POST | sys_role |
| `/api/systemManage/deleteRole/:id` | DELETE | sys_role |
| `/api/systemManage/batchDeleteRole` | DELETE | sys_role |
| `/api/systemManage/assignRoleMenus` | POST | sys_role |
| `/api/systemManage/updateRoleHome` | POST | sys_role |
| `/api/systemManage/assignRoleEndpoints` | POST | sys_role |

native admin router（per existing apply_layers 涵蓋的 router）：
| Path Prefix | entity_type |
|---|---|
| `/api/user` | sys_user |
| `/api/role` | sys_role |
| `/api/route` | sys_menu（per 041 發現、menu router 實 mount 在 `/route`）|
| `/api/domain` | sys_domain |
| `/api/organization` | sys_organization |
| `/api/api-endpoint` | sys_endpoint |
| `/api/access-key` | sys_access_key |
| `/api/authorization` | sys_role（assign-permission/assign-routes/assign-users 等 role-centric 操作）|

非 entity 寫入路徑：
| Path Prefix | entity_type |
|---|---|
| `/api/auth/*` | http_event（包括 login / changePassword / getUserInfo / 等）|
| 其他不 match | http_event（fallback sentinel、spec 003 Clarifications Q2 hybrid rule）|

**實作策略**：
- Pure fn `url_to_entity_type(url: &str) -> &'static str`、放在 `audit_log.rs` 或新 helper module
- 用 `if url.starts_with("/api/systemManage/addUser") || url.starts_with("/api/systemManage/updateUser")` 風格 match（順序：systemManage 先、native 後、fallback 最後）
- Unit-test：`tests/url_entity_type.rs` 含全 path 對應 assertion

**Alternatives considered**：
- Regex pattern：拒——startswith 已足、regex 過殺
- 從 router config 反推：拒——耦合過深、router 變更要連動規則表

---

## R-7：migration naming 慣例 + Migrator vec register pattern

**Decision**：新 migration 檔 `m20260524_e_audit_outbox_table.rs` 落 `schemas/`；無 datas（outbox 起始為空）；mod.rs 與 lib.rs 各 +1 line register。

**Rationale**（grep 確認）：
- 既有 schema migration 命名：`m<YYYYMMDD>_<letter>_<descriptive>.rs`（如 `m20260524_a_wfw6_add_home_to_sys_role.rs`、`m20260524_d_add_display_id_to_business_entities.rs`）
- 2026-05-24 已用 schema letters：a（W-FW6 role home）/ d（039 display_id）；datas 已用：b（wfw6 role_home_alias_seed）/ c（wfw8 endpoint_alias_seed）/ e（039 backfill_display_id）
- 下一個未用 schema letter：**e**（沒有衝突）
- `schemas/mod.rs`：`pub mod m20260524_e_audit_outbox_table;`（接續 line 末）
- `lib.rs::Migrator::migrations()`：在 vec 末加 `Box::new(schemas::m20260524_e_audit_outbox_table::Migration),`

**migration 檔結構** template（基於 `m20260524_a_wfw6_add_home_to_sys_role.rs` 體例）：

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

**注意點**：
- `execute_unprepared` 用法：039 落地時有教訓——multi-statement migration（CREATE + CREATE INDEX）必須用 `execute_unprepared` 一次跑、不能拆 prepared statement（per `chore fix 7518926` 039 落地 W-F11 教訓、見 INTEGRATION-CHECKLIST 039 entry）
- `idx_sys_audit_outbox_pending` partial index 只索引 `published_at IS NULL`、加速 drainer SELECT；已 published row 不入索引、不佔空間

**Alternatives considered**：
- 命名 `m20260524_f_*` 或 `_g_*`：拒——`e` 為 schemas/ 內次序未用、最對齊規則
- 用 sea-orm migration DSL（`Table::create()`）：拒——既有 m20260524 系列都用 `execute_unprepared` raw SQL（一致性 + 較簡）

---

## R-8：application.yaml 新增 `audit_outbox:` section

**Decision**：新增 yaml section、含 batch_size / sleep_interval_ms / max_retry 三個 key、走既有 EnvConfigLoader pattern。

**Rationale**（grep 確認 `rust-api/server/resources/application-test.yaml` 結構）：
- 既有 sections：`database:` / `server:` / `jwt:` / `redis:`
- 新增 section：
  ```yaml
  audit_outbox:
      drainer_batch_size: 100          # 一輪 SELECT 抓多少 row
      drainer_sleep_interval_ms: 100   # 空批 sleep 多久
      drainer_max_retry: 5             # 達 retry_count 上限後標 dead-letter
      redis_stream_maxlen_approx: 10000 # XADD MAXLEN ~ 10000
  ```
- env override 透過既有 `EnvConfigLoader` pattern（dot-key、如 `AUDIT_OUTBOX__DRAINER_BATCH_SIZE=200` override）

**新增 Rust config struct**（`server/config/src/model/audit_outbox_config.rs`、register 進 Config 主 struct）：
```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuditOutboxConfig {
    pub drainer_batch_size: u64,
    pub drainer_sleep_interval_ms: u64,
    pub drainer_max_retry: u32,
    pub redis_stream_maxlen_approx: usize,
}

impl Default for AuditOutboxConfig {
    fn default() -> Self {
        Self {
            drainer_batch_size: 100,
            drainer_sleep_interval_ms: 100,
            drainer_max_retry: 5,
            redis_stream_maxlen_approx: 10000,
        }
    }
}
```

**Alternatives considered**：
- hard-code 在 drainer 內：拒——違 FR-014（MUST 可配置）
- 用 env var only（無 yaml）：拒——既有所有 config 都進 yaml、一致性

---

## R-9：背景 task spawn pattern（drainer 啟動位置）

**Decision**：drainer `tokio::spawn` 在 `initialize/src/event_channel_initialization.rs::initialize_event_channel()` 函式末段（與既有 listener 同層）；確保 main.rs initialize 流程之內、在 Redis + DB 都已 init 之後。

**Rationale**（grep 確認）：
- 既有 listener spawn pattern：`server/global/src/global.rs:163-176`：`tokio::spawn(string_listener(string_rx))` / `tokio::spawn(listener(rx))`
- `initialize_event_channel()` 在 main.rs 已被呼叫（line 22）、時序在 init_primary_redis（line 24）之後
- Drainer 需要 DB + Redis 都 ready；目前 init 順序是 DB 先（line 19-20）、Redis 後（line 24-25）；initialize_event_channel 在 line 22、會在 DB ready 後、Redis ready 前

**重要**：drainer 需要 Redis ready 才能 XADD；故 spawn 點需在 `init_primary_redis().await` 之後。最妥 spawn 點為 `event_channel_initialization.rs::initialize_event_channel()` 函式內最後 spawn（initialize_event_channel 在 main.rs 由 caller 改順序確保在 Redis init 之後），或新增 `audit_outbox_initialization.rs` 在 main.rs 顯式 init_primary_redis 之後呼叫。

**推薦**：新 `initialize/src/audit_outbox_initialization.rs`、export `pub async fn initialize_audit_outbox_drainer()`；main.rs 在 line 25 `init_redis_pools().await` 之後呼叫。

**Code snippet**：
```rust
// server/initialize/src/audit_outbox_initialization.rs
pub async fn initialize_audit_outbox_drainer() {
    let config = get_audit_outbox_config().await;
    tokio::spawn(async move {
        run_drainer_loop(config).await;
    });
    tracing::info!("audit_outbox_drainer spawned (batch_size={}, sleep={}ms)",
        config.drainer_batch_size, config.drainer_sleep_interval_ms);
}

// service/src/admin/sys_audit_outbox_drainer.rs
pub async fn run_drainer_loop(config: AuditOutboxConfig) {
    loop {
        match drainer_one_batch(&config).await {
            Ok(n) if n == 0 => tokio::time::sleep(Duration::from_millis(config.drainer_sleep_interval_ms)).await,
            Ok(_) => {} // 有處理就立刻下一輪、不 sleep
            Err(err) => {
                tracing::error!("drainer batch error: {:?}", err);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
}
```

**Alternatives considered**：
- spawn 在 `event_channel_initialization` 內：可行但語意混亂（drainer 不是 event channel listener）
- 用獨立 binary（如 cleanup binary 模式）：拒——對 latency 不利、配置複雜

---

## R-10：multi-replica drainer `SELECT FOR UPDATE SKIP LOCKED` 驗證計畫

**Decision**：drainer SELECT 用 `FOR UPDATE SKIP LOCKED LIMIT N` pattern、每 row 只能被一個 replica 抓到；acceptance 階段用 `docker compose up -d --scale rust-api=2` 實機驗。

**Rationale**：
- PostgreSQL 12+ 支援 `FOR UPDATE SKIP LOCKED`、Standard pattern for task queue
- Sea-ORM 支援：`Entity::find().lock(LockType::Update).lock_with_behavior(LockBehavior::SkipLocked)` 或 raw SQL `query!("... FOR UPDATE SKIP LOCKED LIMIT $1")`
- 兩個 drainer 同時跑：transaction A 取得 row 1-50、B 取得 row 51-100、無重複
- batch 內 INSERT sys_operation_log + XADD Redis + UPDATE published_at 全在同一 txn、commit 為原子點

**Acceptance 驗證計畫**（per C-V7）：
```bash
# 1. dev stack scale rust-api=2
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --scale rust-api=2 --force-recreate --wait

# 2. 連發 100 個 admin write（POST /api/role 100 次）
for i in {1..100}; do curl -X POST ... ; done

# 3. 觀察 sys_audit_outbox 內 row 數（應 = 200，每 write 2 row）
psql ... -c "SELECT COUNT(*) FROM sys_audit_outbox WHERE published_at IS NOT NULL;"

# 4. 觀察 sys_operation_log 對應 row 數（應 = 200，無重複）
psql ... -c "SELECT COUNT(*) FROM sys_operation_log WHERE created_at > 'X';"

# 5. 觀察 Redis stream length（應 ~= 200）
redis-cli -p 16379 XLEN audit:events
```

**Alternatives considered**：
- Leader election via Redis lock：拒——SKIP LOCKED 已是 PG 標準解、不需額外 infra
- 單一 instance drainer：違 FR-010（W-F11 場景必須多 replica safe）

---

## Phase 0 結論

- 9 個 research item 全 PASS、無 NEEDS CLARIFICATION 殘留
- brainstorm 3 個 Q 拍板假設全與真實 codebase 對齊（grep 確認）
- 新檔 4 個（migration / entity / drainer / publisher / initialization）+ 改 5 既有檔 + config yaml 加 section + INTEGRATION-CHECKLIST 更新
- 0 schema 改動（除新 sys_audit_outbox 表）、0 新 crate dep、0 base-web 改動

Ready for Phase 1（data-model.md / contracts/verification-commands.md / quickstart.md）。
