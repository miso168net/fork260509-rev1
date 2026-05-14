# Internal API Contracts: F3 — soft-delete-infrastructure

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](../spec.md) §Acceptance Scenarios + [`data-model.md`](../data-model.md) E2-E7

> F3 不引入新 HTTP endpoint。本檔列出 **F3 新增的 Rust internal API surface**（trait + facade + service extension），供 implementation 階段對照與 acceptance test 撰寫。

---

## C1. `SoftDeletable` trait（Sea-ORM 整合層）

**Path**: `server_core::db::soft_delete::SoftDeletable`

**Trait contract**：

```rust
pub trait SoftDeletable: EntityTrait {
    const DELETED_AT_COLUMN: Self::Column;
    const ENTITY_TYPE: &'static str;
    fn find_active() -> Select<Self> { ... }       // 過濾 deleted_at IS NULL
    fn find_with_deleted() -> Select<Self> { ... } // 不過濾
}
```

**Implements**（7 個）：
- `impl SoftDeletable for sys_user::Entity`
- `impl SoftDeletable for sys_role::Entity`
- `impl SoftDeletable for sys_menu::Entity`
- `impl SoftDeletable for sys_domain::Entity`
- `impl SoftDeletable for sys_organization::Entity`
- `impl SoftDeletable for sys_endpoint::Entity`
- `impl SoftDeletable for sys_access_key::Entity`

**Caller contract**: 
- Service code 一般情況**不直接**呼叫 trait method、改用 facade module 的 bare-function helper
- Trait 用 callsite 僅限 facade module 內 + ad-hoc 場景（如 admin tooling）

---

## C2. Facade module — 範式 A（非樹狀 entity）

**Affected entities**: `sys_user`, `sys_role`, `sys_domain`, `sys_endpoint`, `sys_access_key`

**Path**: `server_model::admin::facade::<entity>`

### Re-exports

```rust
pub use _entity::{ActiveModel, Column, Model, Relation};
// pub use _entity::Entity;  ← 故意不 re-export
```

### Public API

```rust
pub fn find_active() -> Select<_entity::Entity>;
pub fn find_with_deleted() -> Select<_entity::Entity>;

pub async fn soft_delete_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: <PK type>, actor: &Actor,
) -> Result<(), AppError>;

pub async fn restore_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: <PK type>, actor: &Actor,
) -> Result<(), AppError>;
```

`<PK type>` 對應每 entity（sys_user/role/domain/endpoint/access_key 為 `String`、sys_menu 為 `i32`、sys_organization 為 `String`）。

### Behavior contract

| Method | Pre-condition | Post-condition | Error cases |
|---|---|---|---|
| `find_active()` | (任意) | 返回 `Select` builder、`exec` 時隱含 `WHERE deleted_at IS NULL` | (none — query 在 caller `.exec()` 處出錯) |
| `find_with_deleted()` | (任意) | 返回 `Select` builder、無過濾 | (同上) |
| `soft_delete_by_id(db, id, actor)` | row 存在且 `deleted_at IS NULL` | row `deleted_at = NOW()` + 寫 SOFT_DELETE audit row（同 transaction） | `code::CODE_BUSINESS_ENTITY_NOT_FOUND` (6001) 若 row 不存在或已軟刪 |
| `restore_by_id(db, id, actor)` | row 存在且 `deleted_at IS NOT NULL` | row `deleted_at = NULL` + 寫 RESTORE audit row（同 transaction） | 6001 若 row 不存在或已 active |

### Atomicity contract

`soft_delete_by_id` / `restore_by_id` 內部使用 `db.begin().await?` 開啟 transaction、UPDATE + audit 寫入後 `txn.commit()`。Caller 不需要 wrap。若 caller 已在 transaction 內、可改用 `... TransactionTrait`（具體簽名變化由 implementation 階段決議）。

---

## C3. Facade module — 範式 B（樹狀 entity）

**Affected entities**: `sys_menu`, `sys_organization`

跟範式 A 完全相同的 4 個 public API 簽名，唯一行為差異在 `soft_delete_by_id` 增加 FR-026 active children check：

### Tree-cascade behavior（FR-026）

```text
soft_delete_by_id(db, id, actor):
  1. begin transaction
  2. count active children: SELECT COUNT(*) FROM <entity> WHERE pid = id AND deleted_at IS NULL
  3. if count >= 1:
       return Err(AppError { code: 6003 STATE_CONFLICT, message: "cannot delete: {N} active children exist" })
  4. UPDATE <entity> SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL
  5. if rows_affected = 0:
       return Err(AppError { code: 6001 ENTITY_NOT_FOUND, ... })
  6. SysOperationLogService::create_log_in_txn(&txn, ctx for SOFT_DELETE)
  7. commit transaction
```

`restore_by_id` **不**加 children check（per FR-027）— 樹狀完整性由 caller / admin 自行維護。

---

## C4. `server_model::admin::audit_log::write_in_txn` — F3 audit helper（new module）

**Path**: `server_model::admin::audit_log::write_in_txn`

> Resolved per `/speckit-analyze` 階段 C3 — helper 放 server-model 而非 server-service、避循環依賴（facade in server-model + helper in server-service 會循環）。

**Signature**:

```rust
// rust-api/server/model/src/admin/audit_log.rs

pub async fn write_in_txn(
    txn: &DatabaseTransaction,
    ctx: AuditLogCtx<'_>,
) -> Result<(), AppError>;
```

**Where** `AuditLogCtx`:

```rust
// server/core/src/web/audit.rs
pub struct AuditLogCtx<'a> {
    pub actor: &'a Actor,
    pub entity_type: &'static str,
    pub description: String,
    pub request_id: Option<String>,
}
```

**Behavior contract**:
- 在 caller 傳入的 transaction 內 INSERT 一筆 `sys_operation_log` row
- Row 欄位填充 per data-model.md §E7 mapping（id ulid / method="INTERNAL" / 其他 HTTP-視角欄位空字串 / start_time=end_time=created_at=NOW / duration=0）
- Caller 不可在此 helper 內 commit（commit 由 caller 負責、保持 atomicity）
- 寫入失敗時返回 `AppError { code: CODE_SERVER_DB_ERROR (9001), ... }` — caller 應 rollback transaction

**Coexistence with existing service**: 既有 `sys_operation_log_service::handle_operation_log_event`（HTTP middleware event 機制）**不動**、與此 F3 helper **並存**、語意分明：
- middleware event audit → 經 sys_operation_log_service trait method、`method` 欄位填 actual HTTP method (GET / POST / ...)
- F3 service-level audit → 經 model 內 `audit_log::write_in_txn`、`method="INTERNAL"`

**Backward compatibility**: F2 audit-log-infrastructure 未來擴 sys_operation_log schema 時、F3 callsite 不需動（FR-022）— `AuditLogCtx` struct future-extensible；F2 階段可選將兩條 audit 路徑統一。

---

## C5. `Actor` 結構

**Path**: `server_core::web::audit::Actor`

**Signature**:

```rust
pub struct Actor {
    pub id: String,
    pub username: String,
    pub domain: String,
}

impl Actor {
    pub fn system(name: &str) -> Self { ... }
}

impl From<&User> for Actor { ... }
```

**Usage pattern**:

```rust
// Handler 場景: 從 axum Extension<User> 透傳
async fn delete_user_handler(
    Extension(user): Extension<User>,
    ...,
) -> Result<Res<()>, AppError> {
    let actor = Actor::from(&user);
    sys_user::soft_delete_by_id(&db, id, &actor).await?;
    ...
}

// System 場景:
let actor = Actor::system("cleanup_job");
sys_user::soft_delete_by_id(&db, id, &actor).await?;
```

---

## C6. FR-028 軟刪 user + 舊 JWT — JWT middleware extension

**Path**: `server_middleware::jwt::jwt_auth_middleware`

**Behavior change** (per R3):

token 驗證通過後、注入 `User` extension **之前**、增加 `find_active(claim.sub)` check。若 None → 構造 envelope error：

```rust
// Pseudo-code 流程:
match JwtUtils::validate_token(&token, audience).await {
    Ok(data) => {
        let claims = data.claims;
        
        // FR-028: 新增 active user check
        let user_id = /* extract from claims.sub */;
        if !is_user_active(&user_id).await? {
            return Res::<String>::new_error(
                code::CODE_LOGOUT_SESSION_INVALIDATED,  // 8888
                "session invalidated: user no longer active",
            ).into_response();
        }
        
        // 原本路徑繼續...
        let user = User::from(claims);
        req.extensions_mut().insert(user);
        // ...
    },
    Err(err) => AppError::from(err).into_response(),
}
```

`is_user_active` 為內部輔助函式、走 `sys_user::find_active().filter(Id.eq(user_id)).one(db).await`。

**Response contract**: 軟刪 user + 舊 JWT 場景的 response envelope:

```json
{
  "code": 8888,
  "data": null,
  "msg": "session invalidated: user no longer active",
  "success": false
}
```

base-web `.env` `VITE_SERVICE_LOGOUT_CODES=8888,8889` 已涵蓋 8888 → base 觸發 immediate logout flow（清 token + 跳 login）。

---

## C7. CI lint 契約

**Path**: `rust-api/scripts/ci-soft-delete-lint.sh` + `.github/workflows/ci-soft-delete-lint.yml`

**Script contract**:

```bash
#!/usr/bin/env bash
# CI lint: 拒絕 service / api / router 層直接 import entities::sys_<entity>
# 強制走 facade module
set -euo pipefail

FORBIDDEN=$(grep -rE 'use server_model::admin::entities::sys_(user|role|menu|domain|organization|endpoint|access_key)' \
  rust-api/server/{service,api,router} \
  --include='*.rs' \
  || true)

if [ -n "$FORBIDDEN" ]; then
  echo "❌ Direct entities import on SoftDeletable entity (use facade instead):"
  echo "$FORBIDDEN"
  exit 1
fi

echo "✅ ci-soft-delete-lint pass"
```

**Workflow contract**:

```yaml
name: ci-soft-delete-lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash rust-api/scripts/ci-soft-delete-lint.sh
```

**Whitelist 處理**: facade module 自身 + soft_delete trait impl 模組需要 import entities — 由於這兩處在 `server/model/` 與 `server/core/`、不在 grep 範圍（`server/{service,api,router}`），自然 whitelist。

---

## C8. 對外 HTTP API 影響（per FR-024）

F3 **不**新增 / 不變動 HTTP endpoint。具體影響表：

| 既有 endpoint | F3 變化 | 對 base 影響 |
|---|---|---|
| `POST /api/auth/login` | login service 改 `find_active`、若 user 軟刪則回 envelope `{code: 6001, msg: "entity not found", success: false}` | base 走 default error path 顯示 msg |
| `GET /api/auth/getUserInfo` | JWT middleware 加 FR-028 check、軟刪 user 持舊 JWT → 回 envelope `{code: 8888, ...}` | base 觸發 immediate logout flow |
| `DELETE /api/sys-user/:id`（其他 admin endpoint 類推） | service 改用 `sys_user::soft_delete_by_id` — 但 HTTP shape 不變、admin 拿到 envelope `{code: 0, ...}` 表 success | base UI 顯示「刪除成功」、不感知 soft 還是 hard |
| `DELETE /api/sys-menu/:id`（有 active children 時） | 回 envelope `{code: 6003 STATE_CONFLICT, msg: "cannot delete: {N} active children exist"}` | base default error path 顯示 msg |
| restore — **F3 不提供 HTTP endpoint**（per FR-024）| programmatic `restore_by_id` 可用、但無 HTTP route | F7+ manage view 補 admin restore UI 時加 |

---

**Contract testing**：每個 C1-C7 都有對應 acceptance scenario（spec.md scenarios 1-12 + clarifications）、`/speckit-tasks` 階段產出對應 cargo test 案例 + Sea-ORM live DB integration test。
