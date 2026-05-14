# Research: F3 — soft-delete-infrastructure

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) + [`plan.md`](./plan.md) + 2026-05-14 rust-api / migration / service codebase audit

## Audit Summary（執行於 2026-05-14）

| Audit Item | 結果 |
|---|---|
| `sea_orm_migration::Index::create()...and_where(...)` | ✅ 支援。Postgres backend 下 generate `CREATE UNIQUE INDEX ... WHERE ...` 部分索引（sea-query 0.32 起穩定） |
| `sea_orm_migration` migration 註冊機制 | `migration/src/schemas/mod.rs` 內 `Migrator::migrations()` 回傳 `Vec<Box<dyn MigrationTrait>>`、按順序追加新 migration 即可 |
| sys_operation_log_service 既有 API | `handle_operation_log_event(event: &OperationLogContext)` — 不接 transaction、不接 actor、目的為 middleware-level event 處理 |
| OperationLogContext 結構 | 含 `user_id / username / domain / module_name / description / request_id / method / url / ip / user_agent / params / response / start_time / end_time / duration_ms / created_at` — 為 HTTP middleware 視角 |
| sys_operation_log entity Model | 對應 schema 含 `id / user_id / username / domain / module_name / description / request_id / method / url / ip / user_agent / params / response / start_time / end_time / duration / created_at` — F3 寫 audit 可直接 ActiveModel insert |
| 7 entity 的 UNIQUE 欄位列表 | 見 §R1 表 |
| sys_menu / sys_organization 樹狀結構 | 兩者都有 `pub pid: String` 欄位指向同表父節點 — 確認為樹狀（per spec FR-026 範圍） |
| ConnectionTrait + DatabaseTransaction | Sea-ORM `ConnectionTrait` 為 sealed trait、`&DatabaseConnection` 與 `&DatabaseTransaction` 都實作；F3 helper 接 `&impl ConnectionTrait` 可雙路徑接收 |
| jwt_auth_middleware 既有路徑 | `server/middleware/src/jwt.rs` — F4 已改 envelope code（5001 missing token / from JwtError per-variant）。F3 候選擴增點：token 驗證通過後加 `sys_user::find_active(claim.sub)` 檢查 |

---

## Resolved Decisions（R1 ~ R7）

### R1 — 每個 entity 的 UNIQUE constraint 列表（resolve FR-002 細節）

- **Decision**：F3 migration 對下列 UNIQUE 欄位逐一 DROP + CREATE partial index：

| Entity | UNIQUE columns (除 PK) | partial unique index 數 |
|---|---|---|
| `sys_user` | `username`, `email`, `phone_number` | 3 |
| `sys_role` | `code` | 1 |
| `sys_menu` | `route_name` | 1 |
| `sys_domain` | `code` | 1 |
| `sys_organization` | `code` | 1 |
| `sys_endpoint` | (無) | 0 |
| `sys_access_key` | `access_key_id`, `access_key_secret` | 2 |
| **合計** | | **9 個 partial unique index** |

- **Rationale**: grep audit 結果（rust entity `#[sea_orm(unique)]` attribute 計算）；plan / data-model 階段已精確列。
- **Alternatives considered**: 
  - 「同 username column 加上 `(username, deleted_at)` 複合 unique」— 工作量類似但 partial index 語意更乾淨（idiomatic Postgres）
  - 留現有 UNIQUE constraint 不動、靠 application 層去重 — 違反「DB 層 enforce 資料正確性」原則

### R2 — CI lint 執行載體（resolve FR-019）

- **Decision**：**Shell script 寫在 `rust-api/scripts/ci-soft-delete-lint.sh` + 由 GitHub Actions workflow 呼叫**
  - script: `grep -rE 'use server_model::admin::entities::sys_(user|role|menu|domain|organization|endpoint|access_key)\b' rust-api/server/{service,api,router} --include='*.rs'` → 若有 hit 則 print + `exit 1`
  - whitelist 透過 `--exclude-dir` flag：`server/model/src/admin/facade/`、`server/core/src/db/soft_delete.rs`
  - GitHub Actions: workflow file 路徑 `.github/workflows/ci-soft-delete-lint.yml`、trigger 為 PR + push、單一 job 呼叫 script
- **Rationale**:
  - **shell script + GitHub Actions**: 0 新依賴、script 純 grep + exit code、GitHub Actions 是現代 OSS workflow 標準、CLAUDE.md §1 預設整合方向（per `init-options.json` 顯示 ai: claude / integration: claude，仍可 hook GitHub Actions）
  - script 可 local 跑（`bash scripts/ci-soft-delete-lint.sh`）— developer 開 PR 前先驗
  - 與其他未來 lint（如 F2 audit transaction discipline lint）可累加同一 workflow
- **Alternatives considered**:
  - **cargo-deny custom check**: cargo-deny 主要面向 dependency audit、做 source code grep 是奇用法
  - **dylint plugin / clippy custom lint**: 高上限但維護成本爆炸；F3 grep 命中精準度已夠
  - **pre-commit hook**: 只在 local 生效、PR 從 fork 來不會跑、不能當 PR gate
  - **cargo make task**: 多一層工具相依、與 GitHub Actions 重複功能

### R3 — FR-028 實作位置（軟刪 user 持舊 JWT 的檢查點）

- **Decision**：**在 `jwt_auth_middleware` 內 token 驗證通過後加 `sys_user::find_active(claim.sub)` 檢查**。若返回 None → 直接構造 envelope `Res::<()>::new_error(code::CODE_LOGOUT_SESSION_INVALIDATED, "session invalidated: user no longer active")`、不繼續執行 handler。
- **Rationale**:
  - **中央化檢查**: middleware 是所有受 JWT 保護的 endpoint 必經之地、改一處所有 handler 自動 benefit、不需逐個 handler 加 check
  - **DB query 一次**: 每個 request 多一個 user lookup；rev1 admin-heavy 低 throughput 場景可接受；redis cache 為**未來優化點**、不阻礙 F3 落地
  - **跟既有 F4 envelope 行為一致**: F4 已調整 jwt middleware error 走 envelope；F3 補一個額外的「user not active」envelope path、不破壞 F4 設計
- **Alternatives considered**:
  - **FromRequest extractor (`User` extractor 加檢查)**: extractor 觸發於 handler 抓 User extension 時、跟 middleware 等價但時序晚一點；middleware 路徑更早（先擋掉就不進 handler）
  - **handler-level**: 需逐個 handler 加 boilerplate、有漏看風險、不符 spec 「全表面」要求
  - **redis cache** (user active flag): 為效能優化、實作期 F3 不必要、F12 / F13 階段再考慮

### R4 — Sea-ORM SoftDeletable trait 的 generic 約束

- **Decision**：trait 內 `soft_delete_by_id` / `restore_by_id` 用 `Where<I: Into<<<Self::PrimaryKey as PrimaryKeyTrait>::ValueType as IntoActiveValue<...>>` 太複雜、F3 採**簡化方案**：每個 entity 的 facade 內 bare function（如 `pub async fn soft_delete_by_id(db, id: String, actor)`）直接寫 SQL UPDATE、不透過 trait 內 generic method
  - trait 仍保留 `DELETED_AT_COLUMN` / `ENTITY_TYPE` 常數 + `find_active() / find_with_deleted()` provided methods（這 4 個是 statically 解決、無 PK generic 問題）
  - `soft_delete_by_id` / `restore_by_id` 改成「每個 entity facade 自寫」— 邏輯一致（同 transaction UPDATE + audit）、由共用 helper `audit::write_in_txn(txn, op, actor, entity_type, entity_id)` 處理 audit 寫入
- **Rationale**:
  - Sea-ORM PrimaryKey generic 在 trait method body 內處理會碰到大量 trait bounds noise；7 個 entity facade 各寫一個 8-10 行 function 反而清晰
  - facade 自寫也讓 sys_menu / sys_organization 的 tree-cascade check（FR-026）有自然 hook 點：在 UPDATE 前先查 active children、有就 return 6003
  - 共用 `audit::write_in_txn` helper 讓 audit 寫入路徑單一（FR-020）
- **Alternatives considered**:
  - **強行寫 generic trait method**: 可行但 trait bounds 大量、cargo expand 出來難讀
  - **macro generation**: 7 個 entity 各自展開、但 macro 與 sea-orm-codegen 衝突風險

### R5 — sea-orm-migration partial unique index 語法

- **Decision**：用 `Index::create()...col(Column).unique().and_where(Expr::col(Column).is_null())` 組裝。Migration 範例：

```rust
manager.create_index(
    Index::create()
        .name("sys_user_username_active_uidx")
        .table(SysUser::Table)
        .col(SysUser::Username)
        .unique()
        .and_where(Expr::col(SysUser::DeletedAt).is_null())
        .to_owned()
).await?;
```

- **Rationale**: sea-query 0.32+ 內 `IndexCreateStatement::and_where()` 直接 generate Postgres `WHERE` clause；既有 sea-orm-migration 已是支援版本
- **Alternatives considered**:
  - Raw SQL via `manager.get_connection().execute(...)` — 工作正確、但失去 sea-query 抽象、down migration 也得手寫
  - DROP UNIQUE constraint 不 explicit DROP、靠 sea-orm 自動處理 — 不可行、sea-orm 不自動處理 constraint metadata

### R6 — F3 audit 寫入 helper 放在哪一層 crate？（resolve FR-020 + 解循環依賴）

- **Decision**：**新增 helper `server_model::admin::audit_log::write_in_txn(txn, ctx)`、放在 server-model crate**（不是 server-service 擴增 method）。

```rust
// rust-api/server/model/src/admin/audit_log.rs (NEW module)
use sea_orm::{ActiveModelTrait, DatabaseTransaction, Set};
use ulid::Ulid;
use chrono::Utc;
use server_core::web::{audit::AuditLogCtx, code, error::AppError};
use crate::admin::entities::sys_operation_log::ActiveModel as SysOperationLogActiveModel;

/// F3 service-level audit log writer.
/// 與 sys_operation_log_service::handle_operation_log_event（HTTP middleware event 用）解耦並存。
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

新類型 `AuditLogCtx`（在 `server_core::web::audit::AuditLogCtx`）：
```rust
pub struct AuditLogCtx<'a> {
    pub actor: &'a Actor,
    pub entity_type: &'static str,  // e.g. "sys_user"
    pub description: String,         // e.g. "SOFT_DELETE id=u-001"
    pub request_id: Option<String>, // 從 axum Extension<RequestId> 透傳、可 None
}
```

- **Rationale（為什麼放 server-model 而非 server-service）**:
  - **避循環依賴**：facade 在 server-model；server-service 既有 dep server-model。若 helper 在 server-service、server-model facade dep server-service → 循環。Helper 在 server-model 內部、與 facade 同 crate → 無循環。
  - **依賴方向乾淨**：server-core ←（AuditLogCtx）—— server-model（audit_log helper + facade、用自己 entity） ←—— server-service (既有、不動)
  - 既有 `sys_operation_log_service::handle_operation_log_event`（為 middleware-level event 機制、不接 transaction）**不動**、與 F3 helper **並存**、語意分明
  - F2 audit-log-infrastructure 未來 schema 升級時、F3 callsite **不需動** — `write_in_txn` 內部封裝 schema 變動、`AuditLogCtx` 可 future-extensible（加新欄位）
  - method / url / ip / response 等 HTTP middleware 視角欄位、F3 內部呼叫填空字串 + `method: "INTERNAL"`、後續 grep `module_name + INTERNAL` 即可挑出 service-level audit row
- **Alternatives considered**:
  - **擴增 sys_operation_log_service::create_log_in_txn**: 引入循環依賴（**rejected** — analyse phase 發現的 CRITICAL issue C3）
  - **放 server-core::web::audit::write_in_txn**: 需 server-core dep server-model（為了取 sys_operation_log entity）— 反向 layering、層級被汙染
  - **F3 facade 直接 ActiveModel insert 繞過 helper**: 違反 spec FR-020「保持 audit 寫入路徑單一」、未來 F2 升級 schema 時要逐個 facade 改

### R7 — FR-026 tree-cascade check 實作

- **Decision**：sys_menu / sys_organization facade 的 `soft_delete_by_id` 內、UPDATE 前先查 active children：

```rust
// sys_menu facade
pub async fn soft_delete_by_id(
    db: &impl ConnectionTrait, id: i32, actor: &Actor,
) -> Result<(), AppError> {
    let txn = db.begin().await?;
    
    // FR-026: 樹狀 active children check
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
    
    // 主軟刪 UPDATE
    let res = _entity::Entity::update_many()
        .col_expr(_entity::Column::DeletedAt, Expr::current_timestamp().into())
        .filter(_entity::Column::Id.eq(id))
        .filter(_entity::Column::DeletedAt.is_null())
        .exec(&txn).await?;
    if res.rows_affected == 0 {
        return Err(AppError { code: code::CODE_BUSINESS_ENTITY_NOT_FOUND, message: "...".to_string() });
    }
    
    // audit
    SysOperationLogService::create_log_in_txn(&txn, AuditLogCtx {
        actor, entity_type: "sys_menu", 
        description: format!("SOFT_DELETE id={}", id),
        request_id: None,  // TODO: 從 axum Extension 透傳
    }).await?;
    
    txn.commit().await?;
    Ok(())
}
```

- **Rationale**:
  - 同 transaction 內查 children + UPDATE + audit → 並發安全（per spec edge case「同 user 並發 soft_delete」原理 — DB transaction isolation 保證一致）
  - check 用 `find().count()`、不撈 row data、輕量
  - 非樹狀 entity facade 不做此 check（user / role / domain / endpoint / access_key 的 facade 無 children check 邏輯）
- **Alternatives considered**:
  - **DB trigger**: postgres trigger 可做但維護負擔大、debug 困難、IDE 看不到
  - **SQL CTE 一次性**: 可以但 SQL 複雜度高、cargo-sqlx 風格、非 sea-orm idiom

---

## Outstanding Items（plan 階段未拍板、留 `/speckit-tasks` 階段處理）

| Item | 為何 defer | Owner phase |
|---|---|---|
| `request_id` 在 facade 內如何透傳 | service 內呼叫 facade 時、request_id 是 axum Extension、需 service 簽名加 Extension 透傳 — 機械工作、tasks 階段量化 callsite | `/speckit-tasks` 階段 |
| sys_endpoint 無 UNIQUE 的 migration 仍要建 | 雖然 0 partial index 但 deleted_at column 還是要加；migration 體積小 | `/speckit-tasks` 階段 |
| service code migration callsite 完整清單 | 需 grep 7 entity 在 service/ 內所有 callsite + 個別判讀 admin vs user scope（決定 find_active vs find_with_deleted） | `/speckit-tasks` 階段 |
| FR-028 在 middleware 加 DB query 的 perf impact 對 SC | rev1 dev 期低 throughput、現階段不訂 SLO；F12 / 後續 feature 階段可加 redis cache 優化 | F12+ 階段 |

---

**Phase 0 結論**：✅ 所有 [NEEDS CLARIFICATION] 都已 resolve 為具體 decision；codebase audit 已掌握實際改動範圍與既有對齊基礎。可進入 Phase 1 (data-model / contracts / quickstart)。
