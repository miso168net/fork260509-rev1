# Data Model: F2.1 — audit-log-infrastructure

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) §Key Entities + [`research.md`](./research.md) R1-R7

> F2.1 涵蓋 DB schema 擴充（4 新欄）+ Rust enum × 2 + Rust struct × 1 + Rust trait × 1 + 7 entity impl。本檔涵蓋兩個層級的 data model。

---

## E1. DB schema 改動（sys_operation_log 4 新欄）

### Schema 變動模板

單一 migration 檔 `m20260514_h_extend_sys_operation_log_audit_fields.rs`、`up()` 4 步驟：

```sql
-- Step 1: 加 operation 欄（NOT NULL DEFAULT 'LEGACY'、自動 backfill 既有 row）
ALTER TABLE sys_operation_log ADD COLUMN operation VARCHAR(20) NOT NULL DEFAULT 'LEGACY';

-- Step 2: 加 entity_id 欄
ALTER TABLE sys_operation_log ADD COLUMN entity_id TEXT NULL;

-- Step 3: 加 payload_before JSONB
ALTER TABLE sys_operation_log ADD COLUMN payload_before JSONB NULL;

-- Step 4: 加 payload_after JSONB
ALTER TABLE sys_operation_log ADD COLUMN payload_after JSONB NULL;
```

### down migration

```sql
ALTER TABLE sys_operation_log DROP COLUMN payload_after;
ALTER TABLE sys_operation_log DROP COLUMN payload_before;
ALTER TABLE sys_operation_log DROP COLUMN entity_id;
ALTER TABLE sys_operation_log DROP COLUMN operation;
```

### entity Rust struct 對應修改

`rust-api/server/model/src/admin/entities/sys_operation_log.rs` 內 `pub struct Model` 在 `created_at` 之後加 4 個 field：

```rust
#[sea_orm(column_type = "Text")]
pub operation: String,                          // NEW (NOT NULL，預設 "LEGACY" via migration backfill)
#[sea_orm(column_type = "Text", nullable)]
pub entity_id: Option<String>,                  // NEW
#[sea_orm(column_type = "JsonBinary", nullable)]
pub payload_before: Option<JsonValue>,          // NEW
#[sea_orm(column_type = "JsonBinary", nullable)]
pub payload_after: Option<JsonValue>,           // NEW
```

`Column` enum 隨 `DeriveEntityModel` macro 自動展開含 4 個 variant：`Operation`、`EntityId`、`PayloadBefore`、`PayloadAfter`。

### Backfill 行為

既有 N 筆 sys_operation_log row 的 4 新欄：
- `operation` = `'LEGACY'`（NOT NULL DEFAULT）
- `entity_id` = NULL
- `payload_before` = NULL
- `payload_after` = NULL

新寫入 row 由 F2.1 audit_log::write_in_txn 填充全部 4 欄（含 module_name = entity_type）。

---

## E2. `AuditOperation` enum（write 操作分類）

**Source**: spec.md §Key Entities + FR-005

```rust
// rust-api/server/core/src/web/audit.rs (擴 F3 既有 audit.rs)

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuditOperation {
    Insert,
    Update,
    SoftDelete,
    Restore,
    HardDelete,         // F2.1 預留 enum 值、實作留 F12 cleanup-job
}

impl AuditOperation {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuditOperation::Insert => "INSERT",
            AuditOperation::Update => "UPDATE",
            AuditOperation::SoftDelete => "SOFT_DELETE",
            AuditOperation::Restore => "RESTORE",
            AuditOperation::HardDelete => "HARD_DELETE",
        }
    }
}

// 用 Display 對應 format!("{} id={}") 自動 fallback description
impl std::fmt::Display for AuditOperation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
```

---

## E3. `AuditSource` enum（audit 來源視角）

**Source**: spec.md §Key Entities + FR-005

```rust
// rust-api/server/core/src/web/audit.rs

#[derive(Clone, Debug)]
pub enum AuditSource {
    Http {
        method: String,            // POST/PUT/PATCH/DELETE 等
        url: String,
        ip: String,
        user_agent: Option<String>,
    },
    Internal,                      // service-level audit (sys_user::soft_delete_by_id 等)
    Cleanup,                       // F12 cleanup-job (F2.1 預留 variant)
}
```

---

## E4. `AuditEvent<'a>` struct（audit 寫入單位）

**Source**: spec.md §Key Entities + FR-005、取代 F3 `AuditLogCtx`

```rust
// rust-api/server/core/src/web/audit.rs

use serde_json::Value as JsonValue;

#[derive(Clone, Debug)]
pub struct AuditEvent<'a> {
    pub actor: &'a Actor,
    pub operation: AuditOperation,
    pub entity_type: &'static str,         // e.g. "sys_user"
    pub entity_id: String,                 // sys_menu i32 用 id.to_string()
    pub payload_before: Option<JsonValue>,
    pub payload_after: Option<JsonValue>,
    pub description: Option<String>,       // None → 自動 "{operation} id={entity_id}"
    pub source: AuditSource,
    pub request_id: Option<String>,
}
```

### F3 過渡：`AuditLogCtx` deprecation

F3 既有 `AuditLogCtx` 標 `#[deprecated]` + 提供 `From<&AuditEvent>` shim：

```rust
#[deprecated(since = "F2.1", note = "use AuditEvent + audit_log::write_in_txn")]
#[derive(Clone, Debug)]
pub struct AuditLogCtx<'a> {
    pub actor: &'a Actor,
    pub entity_type: &'static str,
    pub description: String,
    pub request_id: Option<String>,
}

#[allow(deprecated)]
impl<'a, 'b: 'a> From<&'a AuditEvent<'b>> for AuditLogCtx<'a> {
    fn from(event: &'a AuditEvent<'b>) -> Self {
        Self {
            actor: event.actor,
            entity_type: event.entity_type,
            description: event.description.clone().unwrap_or_else(||
                format!("{} id={}", event.operation, event.entity_id)
            ),
            request_id: event.request_id.clone(),
        }
    }
}
```

> F2.1 內部所有 F3 callsite 改用 `AuditEvent`；F2.1 完成後 `AuditLogCtx` 0 active callsite、F2.2+ 可選 remove。

---

## E5. `AuditSerialize` trait + 7 entity impls（敏感欄位 redaction）

**Source**: spec.md §Key Entities + FR-008/009

```rust
// rust-api/server/model/src/admin/audit_serialize.rs (NEW)

use serde::Serialize;
use serde_json::Value as JsonValue;

pub trait AuditSerialize: Serialize {
    fn redacted_fields() -> &'static [&'static str] {
        &[]
    }
}

/// F2.1 audit payload snapshot helper — serialize model + shallow redact top-level field
pub fn audit_snapshot<M: AuditSerialize>(model: &M) -> JsonValue {
    let mut v = serde_json::to_value(model).unwrap_or(JsonValue::Null);
    if let Some(obj) = v.as_object_mut() {
        for field in M::redacted_fields() {
            if obj.contains_key(*field) {
                obj.insert(field.to_string(), JsonValue::String("<redacted>".to_string()));
            }
        }
    }
    v
}
```

7 entity 各自 impl（位於同檔或 `entities/` 同檔內，per analyse-style 拍板留 tasks 階段；建議**集中放 audit_serialize.rs**）：

```rust
// rust-api/server/model/src/admin/audit_serialize.rs（同檔）

use crate::admin::entities::{
    sys_access_key, sys_domain, sys_endpoint, sys_menu, sys_organization, sys_role, sys_user,
};

impl AuditSerialize for sys_user::Model {
    fn redacted_fields() -> &'static [&'static str] { &["password"] }
}

impl AuditSerialize for sys_access_key::Model {
    fn redacted_fields() -> &'static [&'static str] { &["access_key_secret"] }
}

impl AuditSerialize for sys_role::Model {}
impl AuditSerialize for sys_menu::Model {}
impl AuditSerialize for sys_domain::Model {}
impl AuditSerialize for sys_organization::Model {}
impl AuditSerialize for sys_endpoint::Model {}
```

> 注：rev1 admin entity Model 已含 `#[serde(rename_all = "camelCase")]`（F4 落地）— `redacted_fields()` 列出的 field 名是 **camelCase**（如 "password"、"accessKeySecret"）；具體 field 名 implementer 階段對應 entity field rename pattern 確認（plan-level note）。

`server/model/src/admin/mod.rs` 加 `pub mod audit_serialize;`。

---

## E6. `audit_log::write_in_txn` refactor（接 AuditEvent）

**Source**: spec.md FR-007、F3 既有 audit_log.rs 擴展

```rust
// rust-api/server/model/src/admin/audit_log.rs（refactor F3 既有檔）

use sea_orm::{ActiveModelTrait, DatabaseTransaction, Set};
use ulid::Ulid;
use chrono::Utc;
use server_core::web::{
    audit::{AuditEvent, AuditOperation, AuditSource},
    code, error::AppError,
};

use crate::admin::entities::sys_operation_log::ActiveModel as SysOperationLogActiveModel;

/// F2.1 unified audit log writer.
///
/// 所有 admin write 路徑（service-level + HTTP middleware + F12 cleanup-job）共用此入口、
/// 由 `AuditEvent::source` 區分視角。
pub async fn write_in_txn(
    txn: &DatabaseTransaction,
    event: AuditEvent<'_>,
) -> Result<(), AppError> {
    let now = Utc::now().naive_utc();

    // source 分支 → HTTP-視角欄位 mapping
    let (method, url, ip, user_agent) = match &event.source {
        AuditSource::Http { method, url, ip, user_agent } =>
            (method.clone(), url.clone(), ip.clone(), user_agent.clone()),
        AuditSource::Internal =>
            ("INTERNAL".to_string(), String::new(), String::new(), None),
        AuditSource::Cleanup =>
            ("CLEANUP".to_string(), String::new(), String::new(), None),
    };

    let row = SysOperationLogActiveModel {
        id: Set(Ulid::new().to_string()),
        // actor
        user_id: Set(event.actor.id.clone()),
        username: Set(event.actor.username.clone()),
        domain: Set(event.actor.domain.clone()),
        // entity
        module_name: Set(event.entity_type.to_string()),
        entity_id: Set(Some(event.entity_id.clone())),
        operation: Set(event.operation.as_str().to_string()),
        // payload
        payload_before: Set(event.payload_before.clone()),
        payload_after: Set(event.payload_after.clone()),
        // human-readable description（caller 不填則自動 "{operation} id={entity_id}"）
        description: Set(event.description.clone().unwrap_or_else(||
            format!("{} id={}", event.operation, event.entity_id)
        )),
        request_id: Set(event.request_id.clone().unwrap_or_default()),
        // HTTP-視角 metadata
        method: Set(method),
        url: Set(url),
        ip: Set(ip),
        user_agent: Set(user_agent),
        // F2.1 暫不使用 params / response / body 三欄（F2.2 HTTP middleware enrichment 範圍）
        params: Set(None),
        response: Set(None),
        body: Set(None),
        // 時間
        start_time: Set(now),
        end_time: Set(now),
        duration: Set(0),
        created_at: Set(now),
    };

    row.insert(txn).await
        .map_err(|e| AppError {
            code: code::CODE_SERVER_DB_ERROR,
            message: format!("audit log insert failed: {}", e),
        })?;
    Ok(())
}
```

---

## E7. F3 facade refactor 模式（soft_delete_by_id + restore_by_id）

**Source**: spec.md FR-012、F3 既有 facade 7 個檔

每 facade 內 2 個 method refactor 為走 `AuditEvent`：

```rust
// rust-api/server/model/src/admin/facade/sys_user.rs (sample, 沿 F3 既有 7 facade 同模式)

use crate::admin::audit_log;
use crate::admin::audit_serialize::audit_snapshot;
use crate::admin::entities::sys_user as _entity;
use server_core::web::audit::{AuditEvent, AuditOperation, AuditSource};

pub async fn soft_delete_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: String, actor: &Actor,
) -> Result<(), AppError> {
    let txn = db.begin().await.map_err(...)?;

    // F2.1 新增：fetch before snapshot for audit
    let before = _entity::Entity::find()
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_null())
        .one(&txn).await
        .map_err(...)?;

    let res = _entity::Entity::update_many()
        .col_expr(_entity::Column::DeletedAt, Expr::current_timestamp().into())
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_null())
        .exec(&txn).await
        .map_err(...)?;
    if res.rows_affected == 0 {
        return Err(AppError {
            code: code::CODE_BUSINESS_ENTITY_NOT_FOUND,
            message: format!("entity not found or already deleted: id={}", id),
        });
    }

    audit_log::write_in_txn(&txn, AuditEvent {
        actor,
        operation: AuditOperation::SoftDelete,
        entity_type: "sys_user",
        entity_id: id.clone(),
        payload_before: before.as_ref().map(audit_snapshot),   // active snapshot
        payload_after: None,                                    // 軟刪 = no after
        description: None,
        source: AuditSource::Internal,
        request_id: None,
    }).await?;

    txn.commit().await.map_err(...)?;
    Ok(())
}

pub async fn restore_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: String, actor: &Actor,
) -> Result<(), AppError> {
    let txn = db.begin().await.map_err(...)?;

    // before: 軟刪態 snapshot
    let before = _entity::Entity::find()
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_not_null())
        .one(&txn).await.map_err(...)?;

    let res = _entity::Entity::update_many()
        .col_expr(_entity::Column::DeletedAt, Expr::value(None::<chrono::NaiveDateTime>))
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_not_null())
        .exec(&txn).await.map_err(...)?;
    if res.rows_affected == 0 {
        return Err(AppError {
            code: code::CODE_BUSINESS_ENTITY_NOT_FOUND,
            message: format!("entity not found or already active: id={}", id),
        });
    }

    // after: active 態 snapshot
    let after = _entity::Entity::find()
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_null())
        .one(&txn).await.map_err(...)?;

    audit_log::write_in_txn(&txn, AuditEvent {
        actor,
        operation: AuditOperation::Restore,
        entity_type: "sys_user",
        entity_id: id.clone(),
        payload_before: before.as_ref().map(audit_snapshot),
        payload_after: after.as_ref().map(audit_snapshot),
        description: None,
        source: AuditSource::Internal,
        request_id: None,
    }).await?;

    txn.commit().await.map_err(...)?;
    Ok(())
}
```

7 個 facade 套同模式（sys_menu / sys_organization 樹狀 cascade check 不變、加在 UPDATE 之前）。

---

## E8. Service create_/update_ handler migration 模式

**Source**: spec.md FR-010/011、Scenario 10/11

```rust
// rust-api/server/service/src/admin/sys_user_service.rs (sample)

async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserWithoutPassword, AppError> {
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await.map_err(AppError::from)?;

    self.check_username_unique(&txn, &input.username).await?;

    let new_user = SysUserActiveModel {
        id: Set(Ulid::new().to_string()),
        username: Set(input.username.clone()),
        password: Set(SecureUtil::hash_password(&input.password)?),
        // ... 其他 fields
        ..Default::default()
    }.insert(&txn).await.map_err(AppError::from)?;

    audit_log::write_in_txn(&txn, AuditEvent {
        actor,
        operation: AuditOperation::Insert,
        entity_type: "sys_user",
        entity_id: new_user.id.clone(),
        payload_before: None,
        payload_after: Some(audit_snapshot(&new_user)),
        description: None,
        source: AuditSource::Internal,
        request_id: None,
    }).await?;

    txn.commit().await.map_err(AppError::from)?;
    Ok(UserWithoutPassword::from(new_user))
}

async fn update_user(&self, input: UpdateUserInput, actor: &Actor) -> Result<UserWithoutPassword, AppError> {
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await.map_err(AppError::from)?;

    let before = sys_user::find_active()
        .filter(SysUserColumn::Id.eq(&input.id))
        .one(&txn).await
        .map_err(AppError::from)?
        .ok_or_else(|| UserError::UserNotFound)?;

    let active_model = SysUserActiveModel {
        id: Set(input.id.clone()),
        nick_name: Set(input.nick_name.clone()),
        // ... 其他 update fields
        ..Default::default()
    };
    let updated = active_model.update(&txn).await.map_err(AppError::from)?;

    audit_log::write_in_txn(&txn, AuditEvent {
        actor,
        operation: AuditOperation::Update,
        entity_type: "sys_user",
        entity_id: updated.id.clone(),
        payload_before: Some(audit_snapshot(&before)),
        payload_after: Some(audit_snapshot(&updated)),
        description: None,
        source: AuditSource::Internal,
        request_id: None,
    }).await?;

    txn.commit().await.map_err(AppError::from)?;
    Ok(UserWithoutPassword::from(updated))
}
```

7 個 admin entity service 套同模式（sys_organization 若無 write method 跳過、sys_endpoint sync_endpoints 在 batch loop 內逐 entity 寫 audit）。

---

## E9. HTTP middleware refactor 模式（spec FR-014/015）

```rust
// rust-api/server/middleware/src/operation_log_middleware.rs (refactor)

use axum::{body::Body, extract::Request, middleware::Next, response::IntoResponse, http::Method};
use server_core::web::{
    audit::{Actor, AuditEvent, AuditOperation, AuditSource},
    auth::User,
};
use server_model::admin::audit_log;

pub async fn operation_log_middleware(req: Request<Body>, next: Next) -> impl IntoResponse {
    let method = req.method().clone();

    // GET / HEAD / OPTIONS / TRACE → 不寫 audit（read path）
    let operation = match method {
        Method::POST => AuditOperation::Insert,
        Method::PUT | Method::PATCH => AuditOperation::Update,
        Method::DELETE => AuditOperation::SoftDelete,
        _ => return next.run(req).await.into_response(),
    };

    let url = req.uri().path().to_string();
    let user_agent = req.headers().get("user-agent")
        .and_then(|v| v.to_str().ok()).map(String::from);
    let ip = req.headers().get("x-real-ip")
        .or_else(|| req.headers().get("x-forwarded-for"))
        .and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let user = req.extensions().get::<User>().cloned();
    // request_id: 從 axum Extension<RequestId> typed wrapper 取（rev1 既有 middleware
    // 注入、F4 spec 使用過）；具體 typed wrapper 命名 implementer 階段 grep 確認、
    // 若無 typed wrapper 則 fallback 用 axum-extra 內建 request_id middleware
    let request_id = req.extensions().get::<server_core::web::RequestId>()
        .map(|r| r.to_string());

    // Hybrid entity_type rule (per spec FR-015、clarify Q2)
    let entity_type: &'static str = if url.starts_with("/api/sys-user")              { "sys_user" }
        else if url.starts_with("/api/sys-role")                                     { "sys_role" }
        else if url.starts_with("/api/sys-menu")                                     { "sys_menu" }
        else if url.starts_with("/api/sys-domain")                                   { "sys_domain" }
        else if url.starts_with("/api/sys-organization")                             { "sys_organization" }
        else if url.starts_with("/api/sys-endpoint")                                 { "sys_endpoint" }
        else if url.starts_with("/api/sys-access-key")                               { "sys_access_key" }
        else                                                                         { "http_event" };

    let response = next.run(req).await.into_response();

    // Post-execution hook: write audit row (不 dedupe with service-level audit、per clarify Q1)
    if let Some(user) = user {
        let actor = Actor::from(&user);
        let db = server_global::global::GLOBAL_PRIMARY_DB.read().await.as_ref().cloned();
        if let Some(db) = db {
            let txn = db.begin().await;
            if let Ok(txn) = txn {
                let _ = audit_log::write_in_txn(&txn, AuditEvent {
                    actor: &actor,
                    operation,
                    entity_type,
                    entity_id: extract_entity_id_from_url(&url).unwrap_or_default(),
                    payload_before: None,    // middleware 看不到 SQL-level snapshot
                    payload_after: None,
                    description: Some(format!("HTTP {} {}", method, url)),
                    source: AuditSource::Http {
                        method: method.to_string(),
                        url: url.clone(),
                        ip,
                        user_agent,
                    },
                    request_id,
                }).await;
                let _ = txn.commit().await;
            }
        }
    }
    response
}

// 從 URL path 抽 entity_id（e.g. "/api/sys-user/u-001" → "u-001"）— 簡易實作、tasks 階段量化
fn extract_entity_id_from_url(url: &str) -> Option<String> {
    url.split('/').nth(3).map(String::from)
}
```

> **設計取捨**（per spec edge case + clarify Q1）：middleware audit write 失敗 走 log warn + 不影響 response（已 commit 業務）；不 dedupe 與 service-level audit；雙寫 row。`extract_entity_id_from_url` 是簡易版、tasks 階段可選擇 regex 強化。

---

## E10. CI lint script 範式

**Source**: spec.md FR-016/017

```bash
#!/usr/bin/env bash
# rust-api/scripts/ci-audit-coverage-lint.sh
# F2.1 守 service create_/update_ method 必有 audit_log::write_in_txn 或 AuditEvent 呼叫

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_API_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${RUST_API_ROOT}"

# 用 awk 在 sys_*_service.rs 內掃 create_<x> / update_<x> async fn block、檢查 block 內必有 write_in_txn / AuditEvent
MISSING=$(
  for f in server/service/src/admin/sys_*_service.rs; do
    awk '
      /async fn (create_|update_)[a-z_]+/ {
        method=$0; in_block=1; brace_depth=0; has_audit=0; line_start=NR; next
      }
      in_block && /\{/ { brace_depth += gsub(/\{/, "{") }
      in_block && /\}/ {
        brace_depth -= gsub(/\}/, "}")
        if (brace_depth == 0) {
          in_block=0
          if (!has_audit) {
            print FILENAME ":" line_start ": " method " — missing audit_log::write_in_txn or AuditEvent call"
          }
        }
      }
      in_block && /(audit_log::write_in_txn|AuditEvent)/ { has_audit=1 }
    ' "$f"
  done
)

if [ -n "${MISSING}" ]; then
  echo "❌ Service create_/update_ methods missing audit coverage:"
  echo "${MISSING}"
  exit 1
fi

echo "✅ ci-audit-coverage-lint pass"
```

> 注：awk pattern 跨行 brace depth 偵測 method block 範圍；對 trait method declaration（無 body）會 false-positive、tasks 階段微調為「fn body 至少一行」前提；具體 awk pattern 細節 tasks 階段量化（per research.md R5 outstanding item）。

---

## E11. 影響檔案清單

### Migration & entity（已確認）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/migration/src/schemas/m20260514_h_extend_sys_operation_log_audit_fields.rs` | **NEW** | ~80 行（up 4 ALTER + down 4 DROP） |
| `rust-api/migration/src/schemas/mod.rs` | MODIFY | 1 行 |
| `rust-api/migration/src/lib.rs` | MODIFY | 1 行（Migrator vec append、放在 m20260514_g 之後） |
| `rust-api/server/model/src/admin/entities/sys_operation_log.rs` | MODIFY | 4 行新增（4 field + macro auto-generate Column variants） |

### server-core::web::audit（擴 F3 既有）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/core/src/web/audit.rs` | MODIFY | ~60 行新增（AuditOperation + AuditSource + AuditEvent + From shim + AuditLogCtx deprecated）|

### server-model audit_serialize + audit_log refactor

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/model/src/admin/audit_serialize.rs` | **NEW** | ~30 行（trait + audit_snapshot helper + 7 entity impls）|
| `rust-api/server/model/src/admin/audit_log.rs` | MODIFY | refactor 既有 write_in_txn signature、~60 行調整（內部 source 分支 + 4 新欄 mapping）|
| `rust-api/server/model/src/admin/mod.rs` | MODIFY | 1 行（pub mod audit_serialize;）|

### Facade refactor（F3 既有 7 個）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/model/src/admin/facade/sys_user.rs` 等 7 個 | MODIFY | 每檔 ~20 行（soft_delete_by_id + restore_by_id 內加 fetch_before/fetch_after + AuditEvent 構造）|

### Service migration（7 個 admin entity service）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/service/src/admin/sys_user_service.rs` 等 5+ 個（含可能跳過 sys_organization）| MODIFY | 每 method ~15 行（fetch_before 對 update / audit call after insert/update）|

### Middleware refactor + API handler

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/middleware/src/operation_log_middleware.rs` | MODIFY | ~50 行 refactor（method 推導 + entity_type Hybrid rule + AuditEvent 構造） |
| `rust-api/server/api/src/admin/sys_*_api.rs` 5+ 個 | MODIFY | 每檔 create_/update_ handler 加 Extension<User> + Actor 透傳（同 F3 G8 模式）|

### CI lint

| 檔案 | 改動類型 |
|---|---|
| `rust-api/scripts/ci-audit-coverage-lint.sh` | **NEW** |
| `.github/workflows/ci-audit-coverage-lint.yml` | **NEW** |

---

**Phase 1 data-model 結論**：✅ Schema / Rust enum / struct / trait / refactor pattern / 影響檔案清單全部就位。下一步進 contracts / quickstart。
