# Data Model: F3 — soft-delete-infrastructure

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) §Key Entities + [`research.md`](./research.md) R1-R7

> F3 涉及 DB schema 改動（7 entity 加 `deleted_at`）+ Rust trait / struct / module 新增。本檔涵蓋兩個層級的 data model。

---

## E1. DB schema 改動（7 entity migration）

### Schema 變動模板（每 entity 通用）

每個 entity 一個 migration 檔，up 階段三步驟原子完成：

```sql
-- Step 1: 加 deleted_at column
ALTER TABLE <entity> ADD COLUMN deleted_at TIMESTAMP NULL;

-- Step 2: DROP 既有 UNIQUE constraint（每個 UNIQUE 欄位一條）
ALTER TABLE <entity> DROP CONSTRAINT <entity>_<column>_key;

-- Step 3: CREATE partial UNIQUE INDEX
CREATE UNIQUE INDEX <entity>_<column>_active_uidx 
  ON <entity> (<column>) 
  WHERE deleted_at IS NULL;
```

### 7 entity 具體 partial unique index 清單（per R1）

| Entity | UNIQUE columns | Partial index 數 | Migration 檔名 |
|---|---|---|---|
| `sys_user` | username, email, phone_number | 3 | `m20260514_a_add_soft_delete_to_sys_user.rs` |
| `sys_role` | code | 1 | `m20260514_b_add_soft_delete_to_sys_role.rs` |
| `sys_menu` | route_name | 1 | `m20260514_c_add_soft_delete_to_sys_menu.rs` |
| `sys_domain` | code | 1 | `m20260514_d_add_soft_delete_to_sys_domain.rs` |
| `sys_organization` | code | 1 | `m20260514_e_add_soft_delete_to_sys_organization.rs` |
| `sys_endpoint` | (無 UNIQUE 除 PK) | 0 | `m20260514_f_add_soft_delete_to_sys_endpoint.rs` |
| `sys_access_key` | access_key_id, access_key_secret | 2 | `m20260514_g_add_soft_delete_to_sys_access_key.rs` |

> Migration 檔名前綴 `m20260514_a..g` 用字母後綴而非數字 6 位、避免跟既有 `m20240815_*` / `m20241023_*` 格式混淆。具體前綴在 tasks 階段微調。

### down migration

每個 migration 的 `down()` 反向操作：DROP partial index → ADD UNIQUE constraint 回來 → DROP deleted_at column。

### entity Rust struct 對應修改

7 個 `rust-api/server/model/src/admin/entities/<entity>.rs` 內 `pub struct Model` 加新欄位：

```rust
#[sea_orm(column_type = "Timestamp", nullable)]
pub deleted_at: Option<DateTime>,
```

`Column` enum 隨 `DeriveEntityModel` macro 自動展開、含 `DeletedAt` variant（用於 trait 內 `DELETED_AT_COLUMN` constant）。

---

## E2. `Actor` 結構（audit 寫入時的 subject）

**Source**: spec.md §Key Entities `Actor` + R6 audit context

```rust
// server/core/src/web/audit.rs

use crate::web::auth::User;

/// 寫 audit 時的 actor 來源 — 一般 user / system actor 兩種建構途徑
#[derive(Clone, Debug)]
pub struct Actor {
    pub id: String,        // user_id (一般 caller) or system actor name
    pub username: String,
    pub domain: String,    // user.domain or "_system"
}

impl Actor {
    pub fn system(name: &str) -> Self {
        Self {
            id: name.to_string(),
            username: name.to_string(),
            domain: "_system".to_string(),
        }
    }
}

impl From<&User> for Actor {
    fn from(u: &User) -> Self {
        Self {
            id: u.user_id(),
            username: u.username(),
            domain: u.domain(),
        }
    }
}
```

注意：`User` 既有 `pub fn user_id(&self) -> String` / `pub fn username(&self) -> String` / `pub fn subject(&self) -> Vec<String>`、無 `domain()` getter（既有 `User` struct 確實有 `domain: String` private 欄位、需在實作階段加 `pub fn domain(&self) -> String` getter 才能完成 `impl From<&User>`、屬於小幅內擴）。

---

## E3. `AuditLogCtx` 結構（audit 寫入時的 payload）

**Source**: R6 sys_operation_log_service 擴增

```rust
// server/core/src/web/audit.rs

#[derive(Clone, Debug)]
pub struct AuditLogCtx<'a> {
    pub actor: &'a Actor,
    pub entity_type: &'static str,    // e.g. "sys_user"
    pub description: String,           // e.g. "SOFT_DELETE id=u-001"
    pub request_id: Option<String>,   // 從 axum Extension<RequestId> 透傳；service-level audit 可 None
}
```

---

## E4. `SoftDeletable` trait（簡化版、per R4 decision）

> **errata 041 (F3-N5)**：原 brainstorm 期推測 7 個 `impl SoftDeletable` block 落於 `server/core/src/db/soft_delete.rs`（trait def 處）；implementer 移到 `server/model/src/admin/soft_delete_impls.rs`（model crate、避循環依賴 per F3 R6）後未回 update 範例 comment、此 errata 補正下方第二段 code block 內 path comment。

**Source**: spec.md §Key Entities `SoftDeletable` + R4 simplification

```rust
// server/core/src/db/soft_delete.rs

use sea_orm::{EntityTrait, Select, ColumnTrait, QueryFilter};

pub trait SoftDeletable: EntityTrait {
    /// 對應 `deleted_at` column
    const DELETED_AT_COLUMN: Self::Column;
    
    /// audit log 用 — 寫入 sys_operation_log.module_name 的固定字串
    const ENTITY_TYPE: &'static str;
    
    /// SELECT 預設過濾掉軟刪 row
    fn find_active() -> Select<Self> {
        Self::find().filter(Self::DELETED_AT_COLUMN.is_null())
    }
    
    /// SELECT 含全部 row（active + soft-deleted）— admin 場景顯式使用
    fn find_with_deleted() -> Select<Self> {
        Self::find()
    }
    
    // 注：soft_delete_by_id / restore_by_id 在 facade module 自寫
    // （per R4 — 避免 PK generic noise）
}
```

7 entity 各自 impl：

```rust
// server/model/src/admin/soft_delete_impls.rs（model crate、避循環依賴 per F3 R6）
use server_model::admin::entities::{
    sys_user, sys_role, sys_menu, sys_domain, sys_organization, sys_endpoint, sys_access_key
};

impl SoftDeletable for sys_user::Entity {
    const DELETED_AT_COLUMN: Self::Column = sys_user::Column::DeletedAt;
    const ENTITY_TYPE: &'static str = "sys_user";
}
impl SoftDeletable for sys_role::Entity {
    const DELETED_AT_COLUMN: Self::Column = sys_role::Column::DeletedAt;
    const ENTITY_TYPE: &'static str = "sys_role";
}
// ... 同樣 7 個 impl block（剩 5 個 entity）
```

---

## E5. Facade module 範式（service code 入口、per R4 + R7）

**Source**: spec.md §Key Entities Facade module + R7 tree cascade

每個 entity 一個 facade module。範式有兩種：「非樹狀」（5 個 entity）與「樹狀」（sys_menu / sys_organization 各 1 個）。

### 範式 A — 非樹狀 entity facade（user / role / domain / endpoint / access_key）

```rust
// server/model/src/admin/facade/sys_user.rs

use crate::admin::entities::sys_user as _entity;
use crate::admin::audit_log;  // F3 新 audit helper (同 crate 內、避循環依賴 — per R6)
use sea_orm::{ConnectionTrait, DatabaseTransaction, Select, ColumnTrait, QueryFilter,
              EntityTrait, TransactionTrait, sea_query::Expr};
use server_core::db::soft_delete::SoftDeletable;
use server_core::web::{audit::{Actor, AuditLogCtx}, code, error::AppError};

// 公開 re-export（service 建 INSERT/UPDATE 必須）:
pub use _entity::{ActiveModel, Column, Model, Relation};
// pub use _entity::Entity;  ← 故意不 re-export

// SELECT 4-helper（delegate 到 trait）:
pub fn find_active() -> Select<_entity::Entity> {
    <_entity::Entity as SoftDeletable>::find_active()
}
pub fn find_with_deleted() -> Select<_entity::Entity> {
    <_entity::Entity as SoftDeletable>::find_with_deleted()
}

// soft_delete / restore（facade 自寫、per R4 + R6）:
pub async fn soft_delete_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: String, actor: &Actor,
) -> Result<(), AppError> {
    let txn = db.begin().await?;

    let res = _entity::Entity::update_many()
        .col_expr(_entity::Column::DeletedAt, Expr::current_timestamp().into())
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_null())
        .exec(&txn).await?;

    if res.rows_affected == 0 {
        return Err(AppError {
            code: code::CODE_BUSINESS_ENTITY_NOT_FOUND,
            message: format!("entity not found or already deleted: id={}", id),
        });
    }

    audit_log::write_in_txn(&txn, AuditLogCtx {
        actor,
        entity_type: "sys_user",
        description: format!("SOFT_DELETE id={}", id),
        request_id: None,
    }).await?;

    txn.commit().await?;
    Ok(())
}

pub async fn restore_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: String, actor: &Actor,
) -> Result<(), AppError> {
    let txn = db.begin().await?;

    let res = _entity::Entity::update_many()
        .col_expr(_entity::Column::DeletedAt, Expr::value(None::<chrono::NaiveDateTime>))
        .filter(_entity::Column::Id.eq(&id))
        .filter(_entity::Column::DeletedAt.is_not_null())
        .exec(&txn).await?;

    if res.rows_affected == 0 {
        return Err(AppError {
            code: code::CODE_BUSINESS_ENTITY_NOT_FOUND,
            message: format!("entity not found or already active: id={}", id),
        });
    }

    audit_log::write_in_txn(&txn, AuditLogCtx {
        actor,
        entity_type: "sys_user",
        description: format!("RESTORE id={}", id),
        request_id: None,
    }).await?;

    txn.commit().await?;
    Ok(())
}
```

### 範式 B — 樹狀 entity facade（sys_menu / sys_organization）

跟範式 A 大致相同，唯獨 `soft_delete_by_id` 在 UPDATE 前加 active children check（per R7 + FR-026）：

```rust
// sys_menu facade — 差別段落
pub async fn soft_delete_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: i32, actor: &Actor,
) -> Result<(), AppError> {
    let txn = db.begin().await?;
    
    // FR-026: 樹狀 entity active children check
    let active_children_count = _entity::Entity::find()
        .filter(_entity::Column::Pid.eq(id.to_string()))
        .filter(_entity::Column::DeletedAt.is_null())
        .count(&txn).await?;
    if active_children_count > 0 {
        return Err(AppError {
            code: code::CODE_BUSINESS_STATE_CONFLICT,
            message: format!("cannot delete: {} active children exist", active_children_count),
        });
    }
    
    // 之後同範式 A：UPDATE deleted_at + audit + commit
    // ... (剩餘邏輯同範式 A)
}
```

> 注：sys_menu 的 PK 型別是 `i32`、sys_organization 的 PK 是 `String`、面向 facade signature `id: i32` 或 `id: String`，每個 entity 個別判定。

`restore_by_id` 在樹狀 entity 內**不**加 active children check（per FR-027 — restore 屬資料修復、不約束樹狀完整性）。

### Facade module dir 結構

```text
rust-api/server/model/src/admin/facade/
├── mod.rs               # pub mod sys_user; pub mod sys_role; ... 7 lines
├── sys_user.rs          # 範式 A
├── sys_role.rs          # 範式 A
├── sys_menu.rs          # 範式 B (tree-cascade)
├── sys_domain.rs        # 範式 A
├── sys_organization.rs  # 範式 B (tree-cascade)
├── sys_endpoint.rs      # 範式 A
└── sys_access_key.rs    # 範式 A
```

---

## E6. FR-028 軟刪 user + 舊 JWT 處理（per R3）

**Source**: spec.md FR-028 + R3 middleware decision

`server/middleware/src/jwt.rs` 內 `jwt_auth_middleware` 在 token 驗證通過後加 `find_active` check：

```rust
// 既有路徑（token 驗證通過）後新增：
let claims = data.claims;
let user_id = claims.subject();  // claim.sub

// FR-028: 檢查 user 是否仍 active
use server_model::admin::facade::sys_user;
let active_user = sys_user::find_active()
    .filter(sys_user::Column::Id.eq(&user_id))
    .one(db).await?;

if active_user.is_none() {
    return Res::<String>::new_error(
        server_core::web::code::CODE_LOGOUT_SESSION_INVALIDATED,
        "session invalidated: user no longer active",
    ).into_response();
}

// 已有 user → 繼續原本 user extension 注入流程
let user = User::from(claims);
// ... (剩餘邏輯同既有)
```

> **db 來源**：middleware 內需取 DB connection。既有 `db_helper::get_db_connection().await?` pattern 可用、或從 axum state extract。tasks 階段量化。

> **CI lint 例外**: middleware 內 `use server_model::admin::facade::sys_user;` 走 facade、不踩 entities path、過 CI lint。

---

## E7. `server_model::admin::audit_log` 新模組（per R6）

**Source**: R6 + spec FR-020/021/022 — analyse phase 解 C3 循環依賴後的最終決策

新建 `rust-api/server/model/src/admin/audit_log.rs`（**在 server-model crate 而非 server-service** — 避免 facade dep service 形成循環）：

```rust
// rust-api/server/model/src/admin/audit_log.rs (NEW module)

use sea_orm::{ActiveModelTrait, DatabaseTransaction, Set};
use ulid::Ulid;
use chrono::Utc;
use server_core::web::{audit::AuditLogCtx, code, error::AppError};

use crate::admin::entities::sys_operation_log::ActiveModel as SysOperationLogActiveModel;

/// F3 service-level audit log writer.
///
/// 與既有 `sys_operation_log_service::handle_operation_log_event`（HTTP middleware
/// event 機制）解耦並存；F3 內部呼叫此 helper 同 transaction 寫 audit row。
///
/// `method="INTERNAL"` 標記 — grep `module_name=sys_<entity>` + `method=INTERNAL`
/// 即可挑出 F3 service-level audit row（vs middleware event audit row）。
pub async fn write_in_txn(
    txn: &DatabaseTransaction,
    ctx: AuditLogCtx<'_>,
) -> Result<(), AppError> {
    let now = Utc::now().naive_utc();
    let row = SysOperationLogActiveModel {
        id: Set(Ulid::new().to_string()),
        user_id: Set(ctx.actor.id.clone()),
        username: Set(ctx.actor.username.clone()),
        domain: Set(ctx.actor.domain.clone()),
        module_name: Set(ctx.entity_type.to_string()),
        description: Set(ctx.description.clone()),
        request_id: Set(ctx.request_id.clone().unwrap_or_default()),
        method: Set("INTERNAL".to_string()),
        url: Set(String::new()),
        ip: Set(String::new()),
        user_agent: Set(None),
        params: Set(None),
        response: Set(None),
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

`rust-api/server/model/src/admin/mod.rs` 加 `pub mod audit_log;`。

> sys_operation_log 表 schema 細節（欄位列表 / 型別）在現有 migration 已定義；F3 不改 sys_operation_log schema。F2 audit-log-infrastructure 未來擴 schema 時、F3 callsite 不需動（per FR-022）— `audit_log::write_in_txn` 內部封裝 schema 細節 + `AuditLogCtx` struct future-extensible。
>
> **既有 `sys_operation_log_service::handle_operation_log_event` 不動**（F3 不擴增 service）。兩個 audit 寫入路徑並存：HTTP middleware event 走 service trait method、F3 service-level audit 走 model 內 `audit_log::write_in_txn`。F2 階段可選統一兩條路徑。

---

## E8. 影響檔案清單（plan 階段確認 / `/speckit-tasks` 待 audit）

### Migration & entity（已確認）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/migration/src/schemas/m20260514_*_add_soft_delete_to_sys_*.rs` | **NEW × 7** | 每檔 ~40-80 行 |
| `rust-api/migration/src/schemas/mod.rs` | MODIFY | 7 行新增 |
| `rust-api/server/model/src/admin/entities/sys_user.rs` | MODIFY | 2 行新增（deleted_at field） |
| 其他 6 個 entity 檔 | MODIFY | 同上、各 2 行 |

### server-core（已確認）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/core/src/db/mod.rs` | **NEW** | 1 行 `pub mod soft_delete;` |
| `rust-api/server/core/src/db/soft_delete.rs` | **NEW** | ~80 行（trait + 7 impl） |
| `rust-api/server/core/src/web/audit.rs` | **NEW** | ~40 行（Actor + AuditLogCtx + impl From） |
| `rust-api/server/core/src/web/mod.rs` | MODIFY | 1 行 `pub mod audit;` |
| `rust-api/server/core/src/lib.rs` | MODIFY | 1 行 `pub mod db;` |
| `rust-api/server/core/src/web/auth.rs` | MODIFY | 加 `pub fn domain(&self) -> String` getter 在 User impl |

### server-model facade + audit_log（已確認）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/model/src/admin/audit_log.rs` | **NEW** | ~40 行（F3 audit helper、per R6）|
| `rust-api/server/model/src/admin/facade/mod.rs` | **NEW** | 7 行 |
| `rust-api/server/model/src/admin/facade/sys_user.rs` | **NEW** | ~90 行（範式 A） |
| `rust-api/server/model/src/admin/facade/sys_role.rs` | **NEW** | 同上 |
| `rust-api/server/model/src/admin/facade/sys_menu.rs` | **NEW** | ~110 行（範式 B + tree check） |
| `rust-api/server/model/src/admin/facade/sys_domain.rs` | **NEW** | 同範式 A |
| `rust-api/server/model/src/admin/facade/sys_organization.rs` | **NEW** | 同範式 B |
| `rust-api/server/model/src/admin/facade/sys_endpoint.rs` | **NEW** | 同範式 A |
| `rust-api/server/model/src/admin/facade/sys_access_key.rs` | **NEW** | 同範式 A |
| `rust-api/server/model/src/admin/mod.rs` | MODIFY | 2 行 `pub mod facade;` + `pub mod audit_log;` |

### server-service + middleware + Cargo.toml（量級 plan 階段抓、實作 task 階段量化）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/service/src/admin/sys_user_service.rs` 等 7+ 個 service | MODIFY | 每檔 5-15 處 callsite migrate |
| `rust-api/server/service/src/admin/sys_auth_service.rs` | MODIFY | login 改 find_active、軟刪 user case |
| `rust-api/server/service/src/admin/sys_operation_log_service.rs` | **不動** | F3 不擴增 service；audit_log helper 移到 server-model（per R6 + analyse C3） |
| `rust-api/server/middleware/src/jwt.rs` | MODIFY | ~15 行（FR-028 加 find_active check） |
| `rust-api/server/middleware/Cargo.toml` | MODIFY | 加 `server-model = { path = "../model" }` dep（jwt.rs 改動需要、per analyse C4） |
| `rust-api/server/api/src/admin/{sys_user,sys_role,sys_menu,sys_domain,sys_organization,sys_endpoint,sys_access_key}_api.rs` | MODIFY | 對每個 delete handler 加 `Actor::from(&user)` 並透傳給 service（具體 7 個 _api.rs 檔；per analyse M2） |

### CI lint

| 檔案 | 改動類型 |
|---|---|
| `rust-api/scripts/ci-soft-delete-lint.sh` | **NEW** |
| `.github/workflows/ci-soft-delete-lint.yml` | **NEW** |

---

**Phase 1 data-model 結論**：✅ Schema / Rust trait / facade module / Actor / AuditLogCtx / migration 範式 / 影響檔案清單全部就位。下一步進 contracts / quickstart。
