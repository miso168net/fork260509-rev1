# Feature Specification: F3 — soft-delete-infrastructure

**Feature ID**: F3（per [`DESIGN-A`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1）
**Feature Branch**: TBD（spec-kit `/speckit-specify` 階段建立）
**Created**: 2026-05-14
**Status**: Draft（brainstorming 完成、待 spec-kit `/speckit-specify` 接手轉為正式 feature spec）
**Source**: superpowers:brainstorming 2026-05-14 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.5（soft delete + 全域 audit 原則）、§5.2.2（soft delete 衍生風險）、§6.1 F3、§6.2 依賴序
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md)（A/B 兩軌都需此基礎）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle II 全域 audit + Principle IV base 不改動 + 架構約束）
- [`docs/superpowers/001-feature-response-shape-alignment.md`](001-feature-response-shape-alignment.md)（F4，已完成；F3 與 F4 同為 P1 平行 feature、API 設計風格參考 F4）

**Input**：rust admin 後端全業務 entity 由「物理刪除」改為「軟刪除」基礎建設 — 一次性交付 (a) DB migration + partial unique index、(b) Sea-ORM trait + facade module API、(c) 既有 service code 一次 migrate、(d) Casbin orphan 處理規則、(e) audit log 整合、(f) Rust 類型系統 + CI 雙重 enforcement。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rust admin 業務 entity 全表面採軟刪 + 預設掩蔽 + audit 紀錄（Priority: P1，唯一 US）🎯 MVP

admin 對 rust 後端 7 個業務 entity（user / role / menu / domain / organization / endpoint / access_key）的 DELETE 操作，自此後**永遠**走軟刪路徑：DB row 不物理刪除、只標 `deleted_at`；所有 SELECT 預設**過濾掉**已軟刪的 row；軟刪事件**必寫**audit log（與業務變動同 transaction）。整個 codebase 內、service / handler 層**不可能**意外做硬刪或意外讀到軟刪 row — 由 Rust 類型系統 + facade module + CI grep 三重 enforcement 守護。

**Why this is the only US (P1，atomic infrastructure increment)**：

F3 的 6 個交付片段（migration / trait / facade module / service migration / Casbin 處理 / audit 整合）**並非獨立可交付**：

- 單獨建 trait + facade module → 沒做 migration 之前 entity 內無 deleted_at column → `find_active()` 跑 SQL error
- 單獨做 migration → 沒做 trait + facade → service code 仍 import 原 `entities::sys_user::Entity`、繼續硬刪 → migration 變裝飾性
- 單獨 migrate service code → 沒 audit 整合 → 軟刪 row 留下、無 audit row → 違反 §1.5「業務 + audit 同 transaction」總則
- 單獨補 Casbin orphan 處理 → 沒 facade module → service 透過 raw Entity API 仍可繞過 orphan handler → orphan 還是會發生

任一單一片段交付了、其他沒交付，整個 codebase 都處於「部分軟刪 / 部分硬刪 / 部分有 audit / 部分沒」的雜訊狀態。F3 是 **infrastructure 性質的原子 MVP increment** — 6 個片段是同一個 user story 的 6 個 acceptance dimensions。

**Independent Test**：base + rust + postgres + redis 起來，admin 透過 `/manage/user` delete user → DB `sys_user` row `deleted_at` 標非 null、`sys_operation_log` 含 SOFT_DELETE row、同 username 可再新增、軟刪 user `/auth/login` 拒絕；admin 透過 restore helper 還原 → `deleted_at = NULL`、原 user_role / casbin_rule 自動生效（join row 一直在）。

#### Acceptance Scenarios — Dimension A：DB schema + partial unique index（migration 落地）

1. **Given** F3 migration 已套用，**When** 查 7 個 entity 表的 schema，**Then** 每個表都有 `deleted_at TIMESTAMP NULL`欄位（與既有 `created_at` 同型別）；既有 row 全為 `deleted_at IS NULL`
2. **Given** `sys_user.username = "Alice"` 存在且 `deleted_at IS NULL`，**When** 嘗試新增另一個 `username = "Alice"`，**Then** 拒絕（partial unique index 仍 enforce active row 唯一性）
3. **Given** `sys_user.username = "Alice"` 已軟刪 (`deleted_at IS NOT NULL`)，**When** 新增另一個 `username = "Alice"`，**Then** 接受（partial unique index 只對 active row 約束、軟刪 row 不算）

#### Acceptance Scenarios — Dimension B：Sea-ORM trait + facade module API

4. **Given** service code透過 `use server_model::admin::facade::sys_user;` 取得 facade，**When** 呼叫 `sys_user::find_active().filter(...).all(db)`，**Then** 結果不含 `deleted_at IS NOT NULL` 的 row（隱含過濾）
5. **Given** admin 場景需看軟刪 row，**When** 呼叫 `sys_user::find_with_deleted().all(db)`，**Then** 結果含全部 row（active + soft-deleted）
6. **Given** service 呼叫 `sys_user::soft_delete_by_id(db, "u-001", &actor).await?`，**When** 完成，**Then** (a) DB row 的 `deleted_at = NOW()`、(b) `sys_operation_log` 有對應 SOFT_DELETE row（同 transaction）、(c) 後續 `find_active()` 找不到該 row
7. **Given** service 呼叫 `sys_user::restore_by_id(db, "u-001", &actor).await?` 對先前軟刪的 row，**When** 完成，**Then** (a) `deleted_at = NULL`、(b) `sys_operation_log` 有對應 RESTORE row、(c) 後續 `find_active()` 找得到該 row

#### Acceptance Scenarios — Dimension C：類型系統 + CI 雙重 enforcement + auth gate 行為

8. **Given** service code 嘗試 `use server_model::admin::entities::sys_user;`（繞過 facade），**When** CI pipeline 跑 grep lint，**Then** lint 失敗（fail）— import-level forbidden pattern 命中
9. **Given** F3 完成、`sys_user.id = "u-001"` 已軟刪，**When** 用該 user 的舊有 username/password 呼叫 `/auth/login`，**Then** rust 回 envelope `{code: 6001 (ENTITY_NOT_FOUND), success: false, ...}` — `pwd_login` 走 `sys_user::find_active()` 找不到該 user
10. **Given** sys_user 已軟刪、但 `sys_user_role` / `casbin_rule g` 規則仍在資料表，**When** 該軟刪 user 嘗試從**已有的 JWT** 呼叫 `/auth/getUserInfo`，**Then** rust 回拒絕 — `getUserInfo` 走 `find_active` 撈不到對應 row（auth gate 自然掩蔽 orphan join row）

### Edge Cases

- **既有 `created_at` 用 TIMESTAMP（無 TZ）**：F3 `deleted_at` 沿用同型別 `TIMESTAMP` 而非 §1.5 措詞 "TIMESTAMPTZ" — 工程層 entity 型別一致性優先於設計 doc 措詞；spec.md 註記此偏離理由
- **`built_in = true` 的 user / role 不可軟刪**：既有 service 已有 built_in 防護、F3 不改此邏輯；`soft_delete_by_id` 不檢查 `built_in`，built_in 防護仍由 caller 維護
- **Migration 順序**：每個 entity migration 內 (1) 加 `deleted_at` column → (2) DROP existing UNIQUE constraint → (3) CREATE partial UNIQUE INDEX `WHERE deleted_at IS NULL`；單一 migration 內三步驟原子完成
- **空表的處理**：rev1 大多 entity 為空 or test data，migration 跑得快；對 existing row 不動（所有現有 row `deleted_at IS NULL` = active）
- **ActiveModel.delete() 仍是 API 表面風險**：facade 不 re-export `Entity`、但 `ActiveModel` 必須 re-export（service 需要它建 INSERT / UPDATE）。`activeModel.delete(db).await` 仍是有效 API call — F3 在 ActiveModel 層**不能**用類型系統封死，靠 (a) 文件明示「不要這麼用」、(b) PR review、(c) callsite grep（lint 第二層）三重防護
- **Cleanup job (F12)** 是唯一可硬刪的合法路徑：F3 暴露 `pub(crate) hard_delete_where_deleted_before(threshold)` API、僅 `server::cleanup` module 可見；service / handler / 其他 module 透過 `crate::` 可見性無法引用
- **`find_active()` 對 LEFT JOIN 的 child 邊 case**：若 service 用 `find_active().join(...)` 串到 join 表（如 `sys_user_role`）、join 表 row 可能指向已軟刪 user — 此情況由 caller 自行處理（join + 再 filter parent.deleted_at IS NULL）；F3 不自動做雙重 filter
- **多次軟刪**：對已軟刪的 row 再呼叫 `soft_delete_by_id` — 返回 6001（entity_not_found）；只有 active row 可被軟刪。多次 RESTORE 同理（已 active row 不能 restore）
- **同 user 並發 soft_delete**：兩個 transaction 同時對同 user 跑 soft_delete — DB-level transaction 隔離保證只有一個成功；另一個 affected_rows = 0 → 返回 6001

---

## Requirements *(mandatory)*

### Functional Requirements

#### DB schema + migration（FR-001 ~ FR-006）

- **FR-001**：7 個業務 entity 表 (`sys_user`, `sys_role`, `sys_menu`, `sys_domain`, `sys_organization`, `sys_endpoint`, `sys_access_key`) MUST 各自加 `deleted_at` 欄位、型別與 sea-orm `DateTime`（postgres `TIMESTAMP WITHOUT TIME ZONE`）一致、nullable、預設 NULL
- **FR-002**：F3 migration MUST 對 7 entity 的 **每個現有 UNIQUE constraint** 做替換：DROP CONSTRAINT + CREATE UNIQUE INDEX `WHERE deleted_at IS NULL`（partial index）
- **FR-003**：3 個 join 表（`sys_user_role`, `sys_role_menu`, `casbin_rule`） MUST **不**加 `deleted_at`；維持既有 PK 唯一性語意
- **FR-004**：2 個 log 表（`sys_operation_log`, `sys_login_log`） MUST **不**加 `deleted_at`（§1.5 audit log 明示例外）
- **FR-005**：`sys_tokens` MUST **不**加 `deleted_at`（沿用既有 `status` 欄位表達 revoked）
- **FR-006**：Migration 必須原子套用（單一 migration 檔處理一個 entity 的所有變動）、可 down（reverse 路徑回得去）

#### Sea-ORM trait + facade module（FR-007 ~ FR-013）

- **FR-007**：F3 MUST 新增 trait `server_core::db::soft_delete::SoftDeletable: EntityTrait`，定義 4 個關聯項：`DELETED_AT_COLUMN: Self::Column`、`ENTITY_TYPE: &'static str`、`find_active() -> Select<Self>`、`find_with_deleted() -> Select<Self>`、`async fn soft_delete_by_id(db, id, &actor)`、`async fn restore_by_id(db, id, &actor)`
- **FR-008**：7 entity 各自 MUST `impl SoftDeletable for sys_<entity>::Entity { ... }`
- **FR-009**：F3 MUST 新增 `server_model::admin::facade::sys_<entity>` module（7 個 facade）— 對每個 entity facade：
  - re-export `Model`, `Column`, `ActiveModel`, `Relation`（service code 需要這些建 INSERT/UPDATE）
  - **不** re-export `Entity`（封死 `Entity::find()` / `Entity::delete_*()` 直接路徑）
  - 提供 bare 函式：`find_active()`, `find_with_deleted()`, `soft_delete_by_id(db, id, actor)`, `restore_by_id(db, id, actor)` — delegate 到 trait
- **FR-010**：F3 MUST 新增 `server_core::web::audit::Actor` 結構（id, username, domain）+ `impl From<&User>` + `Actor::system(name)` const builder
- **FR-011**：`soft_delete_by_id` / `restore_by_id` MUST 在**同一 transaction** 內 (a) UPDATE entity 表 deleted_at、(b) 寫 sys_operation_log row（透過 sys_operation_log_service）
- **FR-012**：若 UPDATE affected_rows = 0（target row 不存在或已是目標狀態） → 返回 `AppError::new(code::CODE_BUSINESS_ENTITY_NOT_FOUND, ...)`（6001、F4 envelope 對齊）
- **FR-013**：F3 MUST 暴露 `pub(crate) fn hard_delete_where_deleted_before(threshold)` 在 `server_core::db::soft_delete` 模組、僅可由 `server_core` crate 內部使用；F12 cleanup job 透過獨立 mechanism（細節 F12 階段定）使用

#### Existing service code migration（FR-014 ~ FR-016）

- **FR-014**：所有 `rust-api/server/service/` 內針對 7 entity 的 `Entity::find()` / `Entity::find_by_id()` / `Entity::delete_by_id()` / `Entity::delete_many()` / `model.delete()` callsite MUST migrate 到 facade API
  - `Entity::find()` → `sys_<entity>::find_active()`
  - admin scope 需看軟刪 row → `sys_<entity>::find_with_deleted()`
  - `Entity::delete_by_id()` / `model.delete()` → `sys_<entity>::soft_delete_by_id(db, id, actor)`
- **FR-015**：所有 `use server_model::admin::entities::sys_<entity>` import 在 service / handler / router 層 MUST 改為 `use server_model::admin::facade::sys_<entity>`（entities path 只允許在 facade 自身 + soft_delete trait impl 模組內使用）
- **FR-016**：service handler signature MUST 接受並透傳 `Actor`（從 `Extension<User>` 轉換來）— 至少 delete handler 必透傳

#### CI lint（FR-017 ~ FR-019）

- **FR-017**：CI pipeline MUST 加 grep-based lint step，檢查 `use server_model::admin::entities::sys_<entity>` pattern 在 `rust-api/server/{service,api,router}/` 內出現 → fail
- **FR-018**：CI lint 例外 whitelist：`rust-api/server/model/src/admin/facade/` + `rust-api/server/core/src/db/soft_delete.rs`（impl SoftDeletable 需要引 entities）
- **FR-019**：CI lint MUST 在 PR check 階段 block merge；具體執行載體（GitHub Action / cargo make / pre-commit）由 plan 階段拍板

#### Audit integration（FR-020 ~ FR-022）

- **FR-020**：`soft_delete_by_id` / `restore_by_id` 寫 audit row 時 MUST 經 `sys_operation_log_service::create_log()` 既有 API、不直接 SQL insert（保持 audit 寫入路徑單一）
- **FR-021**：audit row 欄位對應：
  - `user_id`, `username`, `domain` ← `actor` 對應欄位
  - `module_name` ← `ENTITY_TYPE`（如 `"sys_user"`）
  - `description` ← `"SOFT_DELETE id=<id>"` 或 `"RESTORE id=<id>"`
- **FR-022**：F2 audit-log-infrastructure 未來升級 sys_operation_log schema（如加 `operation` enum、`entity_id`、`payload_before` / `payload_after` 欄位）時、F3 helper callsite **不需改動** — sys_operation_log_service 內部封裝 schema 變動

#### 範圍邊界（FR-023 ~ FR-025）

- **FR-023**：F3 **不**包含 cleanup job 實作（cron / threshold / dry-run / actor=cleanup_job 寫 audit）— 留 F12
- **FR-024**：F3 **不**包含 restore HTTP endpoint（admin UI 暴露 restore 留 F7+ manage-crud-alignment feature）— F3 只提供 `restore_by_id` programmatic helper
- **FR-025**：F3 **不**改動 join 表（`sys_user_role` / `sys_role_menu` / `casbin_rule`） — 軟刪 user 後 join row 仍存在、由「`find_active` 預設掩蔽 + auth handler 取不到 row → 不發 JWT → Casbin enforce 不被觸發」三層保證

### Key Entities

#### `Actor` 結構（audit 寫入時的 subject）

`server_core::web::audit::Actor`（F3 新增）：

```rust
pub struct Actor {
    pub id: String,        // user_id（一般用戶）or system actor name (cleanup_job / migration / etc.)
    pub username: String,
    pub domain: String,    // user.domain or "_system" for system actors
}

impl From<&User> for Actor {
    fn from(u: &User) -> Self { ... }
}

impl Actor {
    pub fn system(name: &str) -> Self {
        Self { id: name.to_string(), username: name.to_string(), domain: "_system".into() }
    }
}
```

#### `SoftDeletable` trait（Sea-ORM 整合層）

`server_core::db::soft_delete::SoftDeletable: EntityTrait`：

```rust
pub trait SoftDeletable: EntityTrait
where
    Self::PrimaryKey: PrimaryKeyTrait,
{
    const DELETED_AT_COLUMN: Self::Column;
    const ENTITY_TYPE: &'static str;

    fn find_active() -> Select<Self> {
        Self::find().filter(Self::DELETED_AT_COLUMN.is_null())
    }
    fn find_with_deleted() -> Select<Self> {
        Self::find()
    }
    async fn soft_delete_by_id<C, I>(db: &C, id: I, actor: &Actor) 
        -> Result<(), AppError>
    where C: ConnectionTrait, I: Into<...> { ... }
    async fn restore_by_id<C, I>(db: &C, id: I, actor: &Actor) 
        -> Result<(), AppError>
    where C: ConnectionTrait, I: Into<...> { ... }
}
```

7 entity 的 impl 都很短：

```rust
impl SoftDeletable for sys_user::Entity {
    const DELETED_AT_COLUMN: Self::Column = sys_user::Column::DeletedAt;
    const ENTITY_TYPE: &'static str = "sys_user";
}
// ... 其他 6 個同樣 8 行 impl block
```

#### Facade module 結構（service code 的入口）

7 個 facade modules 在 `server_model::admin::facade::sys_<entity>`：

```rust
// server-model/src/admin/facade/sys_user.rs
use crate::admin::entities::sys_user as _entity;
use server_core::db::soft_delete::SoftDeletable;
use server_core::web::audit::Actor;
use server_core::web::error::AppError;
use sea_orm::{ConnectionTrait, Select};

// Re-exports (service 可用、Entity 故意不 re-export):
pub use _entity::{ActiveModel, Column, Model, Relation};
// pub use _entity::Entity;  ← 故意不 re-export

// Bare-function helpers (對應 trait 方法、wrapping for nicer ergonomics):
pub fn find_active() -> Select<_entity::Entity> {
    <_entity::Entity as SoftDeletable>::find_active()
}

pub fn find_with_deleted() -> Select<_entity::Entity> {
    <_entity::Entity as SoftDeletable>::find_with_deleted()
}

pub async fn soft_delete_by_id<C: ConnectionTrait>(
    db: &C, id: String, actor: &Actor,
) -> Result<(), AppError> {
    <_entity::Entity as SoftDeletable>::soft_delete_by_id(db, id, actor).await
}

pub async fn restore_by_id<C: ConnectionTrait>(
    db: &C, id: String, actor: &Actor,
) -> Result<(), AppError> {
    <_entity::Entity as SoftDeletable>::restore_by_id(db, id, actor).await
}
```

#### Migration 範式（每個 entity migration 通用骨架）

```rust
// migration/src/admin/m20260514_xxx_add_soft_delete_to_sys_user.rs

pub struct Migration;

impl MigrationName for Migration { fn name(&self) -> &str { ... } }

#[async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Step 1: add deleted_at column
        manager.alter_table(
            Table::alter().table(SysUser::Table)
                .add_column(ColumnDef::new(SysUser::DeletedAt).timestamp().null())
                .to_owned()
        ).await?;
        
        // Step 2: drop existing UNIQUE constraint on username
        manager.drop_index(
            Index::drop().table(SysUser::Table).name("sys_user_username_key").to_owned()
        ).await?;
        
        // Step 3: create partial UNIQUE INDEX
        manager.create_index(
            Index::create().table(SysUser::Table).name("sys_user_username_active_uidx")
                .col(SysUser::Username).unique()
                .and_where(Expr::col(SysUser::DeletedAt).is_null())
                .to_owned()
        ).await?;
        
        // Steps 4+5 repeat for email + phone_number (also have UNIQUE)
        ...
        Ok(())
    }
    
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // reverse: drop partial indexes, add back normal UNIQUE, drop deleted_at column
        ...
    }
}
```

每個 entity 一個 migration 檔；plan 階段量化各 entity 的具體 UNIQUE 欄位列表。

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：7 個業務 entity 表的 schema 都有 `deleted_at TIMESTAMP NULL` 欄位（psql `\d <table>` 驗、或 `cargo check` clean + sea-orm-cli verify）
- **SC-002**：每個 entity 既有 UNIQUE 欄位（e.g. sys_user.username/email/phone_number、sys_role.code 等）都被 partial unique index 取代（`WHERE deleted_at IS NULL`） — 驗：軟刪 row 後可新增同 unique value、不衝突
- **SC-003**：7 個 entity 的 `impl SoftDeletable for ::Entity { ... }` 都存在、CI cargo check 通過 — `grep -c 'impl SoftDeletable' rust-api/server/core/src/db/soft_delete.rs` ≥ 7
- **SC-004**：7 個 facade module 都存在、re-export 列表正確（`Entity` 不在）、bare-function helper 全 4 個都齊（`find_active` / `find_with_deleted` / `soft_delete_by_id` / `restore_by_id`） — 自動 grep 驗
- **SC-005**：CI lint pass — `grep -rE 'use server_model::admin::entities::sys_(user|role|menu|domain|organization|endpoint|access_key)' rust-api/server/{service,api,router} --include='*.rs'` 0 hit
- **SC-006**：軟刪 + restore + audit 整合 acceptance test 全 pass — 至少 4 test case（scenario 6, 7, 9, 10）覆蓋
- **SC-007**：軟刪 partial unique index acceptance test 全 pass — scenario 2 + 3 覆蓋
- **SC-008**：所有 7 entity 的 service code migrate 完成 — 自動 grep 驗 `Entity::find\(`、`Entity::find_by_id`、`Entity::delete_by_id`、`Entity::delete_many` 在 `rust-api/server/service/` 內對這 7 entity 的命中數 = 0

---

## Assumptions

- **既有 sys_operation_log_service 可用**：F3 透過既有 service API 寫 audit；若 service 內部行為與 F3 預期不符（如不支援 transaction 透傳），F3 在實作階段（plan / tasks）修正
- **F2 audit-log-infrastructure 升級 sys_operation_log schema 時不破壞 F3 接口契約**：F3 透過 `sys_operation_log_service::create_log()` 寫 audit、不直接 SQL — F2 內部換 schema、API 不變 → F3 helper 自動跟上
- **既有 service code 用 transaction 已是常態**：F3 helper 接 `&impl ConnectionTrait` — 支援 `&DbConn`（auto-transaction）也支援 `&DatabaseTransaction`（手動 transaction）；caller 視業務需求決定
- **rev1 dev 期間 entity 表多為空 or test data**：migration 跑得快、不需 backfill 既有 row（既有 row 自動 `deleted_at IS NULL` = active）
- **base-web 不感知軟刪實作**：base 透過 admin endpoint CRUD；軟刪是 rust 內部實作細節、回 base 的 response shape 與硬刪時代等價（DELETE 成功 → `{code: 0, ...}` envelope）；F3 不需動 base
- **`built_in = true` row 防護由 caller 維護**：F3 helper 不檢查 built_in flag；service handler（如 delete user handler）保留既有 `if user.built_in { return Err(...) }` 預檢
- **CI lint 失敗 = PR block**：CI 機制（GitHub Actions / cargo make / pre-commit）由 plan 階段拍板；無論用哪個、PR 必須 pass CI lint 才能 merge
- **Casbin orphan 處理策略已拍板**：軟刪 user / role 後**不**動 casbin_rule g/p rule（沿 §3.3 join row 不動策略）；orphan policy 永遠不會被觸發、靠 auth gate 自然掩蔽
- **F3 不涉及 nestjs / DESIGN-A 過渡邏輯**：F3 是 rust 側單服務基礎建設、A/B 兩軌都通用；nestjs 退場時 F3 helper 無需動
- **F12 cleanup job 將透過獨立 module / binary 取得 hard_delete API**：F3 在 `server_core::db::soft_delete` 內以 `pub(crate)` 暴露 `hard_delete_where_deleted_before(threshold)`；F12 啟動時透過 `server_core` 內適當 re-export 路徑使用、細節 F12 階段定
