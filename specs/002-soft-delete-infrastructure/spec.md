# Feature Specification: F3 — soft-delete-infrastructure

**Feature Branch**: `002-soft-delete-infrastructure`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: "讀取 docs/superpowers/002-feature-soft-delete-infrastructure.md 的設計文件產出規格書"

**Source brainstorming**: [`docs/superpowers/002-feature-soft-delete-infrastructure.md`](../../docs/superpowers/002-feature-soft-delete-infrastructure.md)（2026-05-14 superpowers:brainstorming session 產出）

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.5（soft delete + 全域 audit 原則）、§5.2.2（衍生風險）、§6.1 F3、§6.2 依賴序
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md)（A/B 兩軌都需此基礎）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle II 全域 audit + 架構約束）
- [`specs/001-response-shape-alignment/spec.md`](../001-response-shape-alignment/spec.md)（F4，已完成；F3 與 F4 同為 P1 平行 feature、envelope code 6001/6002 等沿用 F4 namespace）

**Scope summary**：rust admin 7 個業務 entity（user / role / menu / domain / organization / endpoint / access_key）改為軟刪 — 一次性交付 (a) DB migration + partial unique index、(b) Sea-ORM trait + facade module API、(c) 既有 service code 一次 migrate、(d) Casbin orphan 處理（不動 join row）、(e) audit log 整合、(f) 類型系統 + CI 雙重 enforcement。一次性解決 [`DESIGN-A`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.5 + §5.2.2 全部要求。

## Clarifications

### Session 2026-05-14

- Q: 樹狀 entity（sys_menu / sys_organization）軟刪父節點、若 active 子節點存在時的行為？ → A: 擋下、返回 `code::CODE_BUSINESS_STATE_CONFLICT` (6003) + msg 標示 active children 數；admin 須先處理子節點才能刪父節點（不級聯、不留孤兒）
- Q: F12 cleanup job 用的 hard_delete API 是否在 F3 階段預留？ → A: 不預留。F3 完全不暴露硬刪 API；F12 在自己的 feature spec 階段獨立設計硬刪 surface。原 FR-013 移除
- Q: 已軟刪的 user 拿著仍有效的 JWT 打 API 時、rust 應返回哪個 envelope code？ → A: `code::CODE_LOGOUT_SESSION_INVALIDATED` (8888) — base `.env` `VITE_SERVICE_LOGOUT_CODES` 含 8888、會觸發 immediate logout flow；語意對齊 F4 §Key Entities「admin 強制踢除 / user banned」。具體實作位置（JWT middleware 加 find_active 檢查 vs FromRequest extractor vs handler-level）留 plan 階段拍板

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rust admin 業務 entity 全表面採軟刪 + 預設掩蔽 + audit 紀錄（Priority: P1）🎯 MVP

admin 對 rust 後端 7 個業務 entity 的 DELETE 操作，自此後**永遠**走軟刪路徑：DB row 不物理刪除、只標 `deleted_at`；所有 SELECT 預設**過濾掉**已軟刪的 row；軟刪事件**必寫**audit log（與業務變動同 transaction）。整個 codebase 內、service / handler 層**不可能**意外做硬刪或意外讀到軟刪 row — 由 Rust 類型系統 + facade module + CI grep 三重 enforcement 守護。

**Why this priority (P1，唯一 US，no further decomposition)**：

F3 的 6 個交付片段（migration / trait / facade module / service migration / Casbin 處理 / audit 整合）**並非獨立可交付**：

- 單獨建 trait + facade module → 沒做 migration 之前 entity 內無 `deleted_at` column → `find_active()` 跑 SQL error
- 單獨做 migration → 沒做 trait + facade → service code 仍 import 原 `entities::sys_user::Entity`、繼續硬刪 → migration 變裝飾性
- 單獨 migrate service code → 沒 audit 整合 → 軟刪 row 留下、無 audit row → 違反 §1.5「業務 + audit 同 transaction」總則
- 單獨補 Casbin orphan 處理 → 沒 facade module → service 透過 raw Entity API 仍可繞過 orphan handler → orphan 還是會發生

任一單一片段交付了、其他沒交付，整個 codebase 都處於「部分軟刪 / 部分硬刪 / 部分有 audit / 部分沒」的雜訊狀態。F3 是 **infrastructure 性質的原子 MVP increment** — 6 個片段是同一個 user story 的 6 個 acceptance dimensions、不是 6 個 user stories。

**Independent Test**：base + rust + postgres + redis 起來，admin 透過 `/manage/user` delete user → DB `sys_user` row `deleted_at` 標非 null、`sys_operation_log` 含 SOFT_DELETE row、同 username 可再新增、軟刪 user `/auth/login` 拒絕；admin 透過 restore helper 還原 → `deleted_at = NULL`、原 user_role / casbin_rule 自動生效（join row 一直在）。

**Acceptance Scenarios**:

#### Dimension A：DB schema + partial unique index（migration 落地）

1. **Given** F3 migration 已套用，**When** 查 7 個 entity 表的 schema，**Then** 每個表都有 `deleted_at TIMESTAMP NULL` 欄位（與既有 `created_at` 同型別）；既有 row 全為 `deleted_at IS NULL`
2. **Given** `sys_user.username = "Alice"` 存在且 `deleted_at IS NULL`，**When** 嘗試新增另一個 `username = "Alice"`，**Then** 拒絕（partial unique index 仍 enforce active row 唯一性）
3. **Given** `sys_user.username = "Alice"` 已軟刪 (`deleted_at IS NOT NULL`)，**When** 新增另一個 `username = "Alice"`，**Then** 接受（partial unique index 只對 active row 約束、軟刪 row 不算）

#### Dimension B：Sea-ORM trait + facade module API

4. **Given** service code 透過 `use server_model::admin::facade::sys_user;` 取得 facade，**When** 呼叫 `sys_user::find_active().filter(...).all(db)`，**Then** 結果不含 `deleted_at IS NOT NULL` 的 row（隱含過濾）
5. **Given** admin 場景需看軟刪 row，**When** 呼叫 `sys_user::find_with_deleted().all(db)`，**Then** 結果含全部 row（active + soft-deleted）
6. **Given** service 呼叫 `sys_user::soft_delete_by_id(db, "u-001", &actor).await?`，**When** 完成，**Then** (a) DB row 的 `deleted_at = NOW()`、(b) `sys_operation_log` 有對應 SOFT_DELETE row（同 transaction）、(c) 後續 `find_active()` 找不到該 row
7. **Given** service 呼叫 `sys_user::restore_by_id(db, "u-001", &actor).await?` 對先前軟刪的 row，**When** 完成，**Then** (a) `deleted_at = NULL`、(b) `sys_operation_log` 有對應 RESTORE row、(c) 後續 `find_active()` 找得到該 row

#### Dimension C：類型系統 + CI 雙重 enforcement + auth gate 行為

8. **Given** service code 嘗試 `use server_model::admin::entities::sys_user;`（繞過 facade），**When** CI pipeline 跑 grep lint，**Then** lint 失敗（fail）— import-level forbidden pattern 命中
9. **Given** F3 完成、`sys_user.id = "u-001"` 已軟刪，**When** 用該 user 的舊有 username/password 呼叫 `/auth/login`，**Then** rust 回 envelope `{code: 6001 (ENTITY_NOT_FOUND), success: false, ...}` — `pwd_login` 走 `sys_user::find_active()` 找不到該 user
10. **Given** sys_user 已軟刪、但 `sys_user_role` / `casbin_rule g` 規則仍在資料表，**When** 該軟刪 user 嘗試從**已有的 JWT** 呼叫 `/auth/getUserInfo`（或任意 admin endpoint），**Then** rust 回 envelope `{code: 8888 (LOGOUT_SESSION_INVALIDATED), data: null, msg: "session invalidated: user no longer active", success: false}` — base 收到 8888 → 觸發 immediate logout flow（per F4 base `.env` `VITE_SERVICE_LOGOUT_CODES=8888,8889`）（per Clarifications 2026-05-14 Q3）

#### Dimension D：樹狀 entity active-children 防護（per Clarifications 2026-05-14 Q1）

11. **Given** `sys_menu` 內 `id="m-001"` 有 active child（同表 `pid="m-001"` 且 `deleted_at IS NULL` ≥ 1 筆；注：rust entity 欄位名為 `pid`），**When** 呼叫 `sys_menu::soft_delete_by_id(db, "m-001", &actor)`，**Then** 返回 `AppError` with `code::CODE_BUSINESS_STATE_CONFLICT`（6003）+ msg `"cannot delete: <N> active children exist"`；`sys_menu.id="m-001"` 的 `deleted_at` 保持 NULL（無變動）；無 audit row 寫入
12. **Given** `sys_menu` 內 `id="m-001"` 所有 active 子節點都已先被軟刪（或無子），**When** 呼叫 `sys_menu::soft_delete_by_id(db, "m-001", &actor)`，**Then** 正常成功（per scenario 6 同邏輯）— `deleted_at = NOW()` + 寫 SOFT_DELETE audit row

### Edge Cases

- **既有 `created_at` 用 TIMESTAMP（無 TZ）**：F3 `deleted_at` 沿用同型別 `TIMESTAMP` 而非 §1.5 措詞 "TIMESTAMPTZ" — 工程層 entity 型別一致性優先於設計 doc 措詞
- **`built_in = true` 的 user / role 不可軟刪**：既有 service 已有 built_in 防護、F3 不改此邏輯；`soft_delete_by_id` 不檢查 `built_in`，built_in 防護仍由 caller 維護
- **Migration 順序**：每個 entity migration 內 (1) 加 `deleted_at` column → (2) DROP existing UNIQUE constraint → (3) CREATE partial UNIQUE INDEX `WHERE deleted_at IS NULL`；單一 migration 內三步驟原子完成
- **空表的處理**：rev1 大多 entity 為空 or test data，migration 跑得快；對 existing row 不動（所有現有 row `deleted_at IS NULL` = active）
- **ActiveModel.delete() 仍是 API 表面風險**：facade 不 re-export `Entity`、但 `ActiveModel` 必須 re-export（service 需要它建 INSERT / UPDATE）。`activeModel.delete(db).await` 仍是有效 API call — F3 在 ActiveModel 層**不能**用類型系統封死，靠 (a) 文件明示「不要這麼用」、(b) PR review、(c) callsite grep（lint 第二層）三重防護
- **Cleanup job (F12)** 是唯一可硬刪的合法路徑：F3 **不**預留硬刪 API（per Clarifications Q2）；F12 在自己的 feature spec 階段獨立設計硬刪 surface（位置、可見性、權限模式）
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
- **FR-006**：Migration MUST 原子套用（單一 migration 檔處理一個 entity 的所有變動）、可 down（reverse 路徑回得去）

#### Sea-ORM trait + facade module（FR-007 ~ FR-012）

- **FR-007**：F3 MUST 新增 trait `server_core::db::soft_delete::SoftDeletable: EntityTrait`，定義 **4 個關聯項**：(1) `const DELETED_AT_COLUMN: Self::Column`、(2) `const ENTITY_TYPE: &'static str`、(3) provided method `fn find_active() -> Select<Self>`（隱含 `deleted_at IS NULL` filter）、(4) provided method `fn find_with_deleted() -> Select<Self>`。`soft_delete_by_id` / `restore_by_id` **不在 trait 內**、由各 entity 對應的 facade module 自寫（per [`research.md`](./research.md) R4 — 避開 Sea-ORM PrimaryKey generic noise + 讓樹狀 entity 自然有 children-check hook 點）
- **FR-008**：7 entity 各自 MUST `impl SoftDeletable for sys_<entity>::Entity`，提供 `DELETED_AT_COLUMN` 與 `ENTITY_TYPE` 常數
- **FR-009**：F3 MUST 新增 `server_model::admin::facade::sys_<entity>` module（7 個 facade）— 對每個 entity facade：
  - re-export `Model`, `Column`, `ActiveModel`, `Relation`（service code 需要這些建 INSERT/UPDATE）
  - **不** re-export `Entity`（封死 `Entity::find()` / `Entity::delete_*()` 直接路徑）
  - 提供 bare 函式：`find_active()`, `find_with_deleted()`, `soft_delete_by_id(db, id, actor)`, `restore_by_id(db, id, actor)` — delegate 到 trait
- **FR-010**：F3 MUST 新增 `server_core::web::audit::Actor` 結構（id, username, domain）+ `impl From<&User>` + `Actor::system(name)` const builder
- **FR-011**：`soft_delete_by_id` / `restore_by_id` MUST 在**同一 transaction** 內 (a) UPDATE entity 表 deleted_at、(b) 寫 sys_operation_log row（透過 sys_operation_log_service）
- **FR-012**：若 UPDATE affected_rows = 0（target row 不存在或已是目標狀態）→ 返回 `AppError` with `code::CODE_BUSINESS_ENTITY_NOT_FOUND`（6001、F4 envelope 對齊）

> 註：原 FR-013（hard delete API 預留）per Clarifications 2026-05-14 Q2 移除 — F3 完全不暴露硬刪 API，F12 cleanup-job feature 自行設計。

#### Existing service code migration（FR-014 ~ FR-016）

- **FR-014**：所有 `rust-api/server/service/` 內針對 7 entity 的 `Entity::find()` / `Entity::find_by_id()` / `Entity::delete_by_id()` / `Entity::delete_many()` / `model.delete()` callsite MUST migrate 到 facade API：
  - `Entity::find()` → `sys_<entity>::find_active()`
  - admin scope 需看軟刪 row → `sys_<entity>::find_with_deleted()`
  - `Entity::delete_by_id()` / `model.delete()` → `sys_<entity>::soft_delete_by_id(db, id, actor)`
- **FR-015**：所有 `use server_model::admin::entities::sys_<entity>` import 在 service / handler / router 層 MUST 改為 `use server_model::admin::facade::sys_<entity>`（entities path 只允許在 facade 自身 + soft_delete trait impl 模組內使用）
- **FR-016**：service handler signature MUST 接受並透傳 `Actor`（從 `Extension<User>` 轉換而來）— 至少 delete handler 必透傳

#### CI lint（FR-017 ~ FR-019）

- **FR-017**：CI pipeline MUST 加 grep-based lint step，檢查 `use server_model::admin::entities::sys_<entity>` pattern 在 `rust-api/server/{service,api,router}/` 內出現 → fail
- **FR-018**：CI lint 例外 whitelist：`rust-api/server/model/src/admin/facade/`（facade 自身需要 import entities 包裝）+ `rust-api/server/core/src/db/soft_delete.rs`（impl SoftDeletable 需要引 entities）
- **FR-019**：CI lint MUST 在 PR check 階段 block merge；具體執行載體（GitHub Action / cargo make / pre-commit）由 plan 階段拍板

#### Audit integration（FR-020 ~ FR-022）

- **FR-020**：`soft_delete_by_id` / `restore_by_id` 寫 audit row 時 MUST 經 F3 新增的共用 helper `server_model::admin::audit_log::write_in_txn(txn, ctx)`、不直接 SQL insert（保持 F3 audit 寫入路徑單一；helper 內部用 sys_operation_log ActiveModel 在 caller 提供的 transaction 內 INSERT 一筆 row）。既有 `sys_operation_log_service::handle_operation_log_event`（HTTP middleware event 用途）不動、與 F3 audit helper **並存解耦**
- **FR-021**：audit row 欄位對應：
  - `user_id`, `username`, `domain` ← `actor` 對應欄位
  - `module_name` ← `ENTITY_TYPE`（如 `"sys_user"`）
  - `description` ← `"SOFT_DELETE id=<id>"` 或 `"RESTORE id=<id>"`
- **FR-022**：F2 audit-log-infrastructure 未來升級 sys_operation_log schema（如加 `operation` enum、`entity_id`、`payload_before` / `payload_after` 欄位）時、F3 helper callsite **不需改動** — `server_model::admin::audit_log::write_in_txn` 內部封裝 schema 變動、`AuditLogCtx` struct 可 future-extensible（加新欄位）；F2 階段可選將 helper 內部改 delegate 到 F2 統一 audit infrastructure

#### 範圍邊界（FR-023 ~ FR-025）

- **FR-023**：F3 **不**包含 cleanup job 實作（cron / threshold / dry-run / actor=cleanup_job 寫 audit）— 留 F12 cleanup-job feature
- **FR-024**：F3 **不**包含 restore HTTP endpoint（admin UI 暴露 restore 留 F7+ manage-crud-alignment feature）— F3 只提供 `restore_by_id` programmatic helper
- **FR-025**：F3 **不**改動 join 表（`sys_user_role` / `sys_role_menu` / `casbin_rule`）— 軟刪 user 後 join row 仍存在、由「`find_active` 預設掩蔽 + auth handler 取不到 row → 不發 JWT → Casbin enforce 不被觸發」三層保證
- **FR-029**：F3 audit 寫入範圍**僅限** SOFT_DELETE 與 RESTORE 兩種 operation；INSERT / UPDATE 的 audit 寫入由 **F2 audit-log-infrastructure** feature 負責、HARD_DELETE 的 audit 由 **F12 cleanup-job** feature 負責。Constitution Principle II「INSERT/UPDATE/SOFT_DELETE/HARD_DELETE/RESTORE 全寫 sys_operation_log」在 F3 階段**只達成 2/5**；其餘 3 路徑（INSERT/UPDATE/HARD_DELETE）在 F2 + F12 階段交付後達成全部

#### 樹狀 entity active-children 防護（FR-026 ~ FR-027；per Clarifications 2026-05-14 Q1）

- **FR-026**：對樹狀 entity（`sys_menu`、`sys_organization` — 含 `pid` 欄位作自指外鍵的 entity；注：rust entity 內欄位名為 `pid`、非 `parent_id`）執行 `soft_delete_by_id` 時 MUST 在同一 transaction 內**先查 active children**（同表 `pid = target_id AND deleted_at IS NULL` 的 count）；若 count ≥ 1 → 返回 `AppError` with `code::CODE_BUSINESS_STATE_CONFLICT`（6003）+ msg `"cannot delete: <N> active children exist"`、**不**寫 SOFT_DELETE audit row、`deleted_at` 不變
- **FR-027**：FR-026 防護**不適用** restore 操作（restore_by_id 不檢查 parent 狀態，即使父節點處於軟刪 → 還原子節點後形成「孤兒 active 子節點」屬資料修復場景，admin 須自行串接邏輯處理 parent 還原）；亦不適用非樹狀 entity（user/role/domain/endpoint/access_key — 無 `pid` 自指欄位）

#### 軟刪 user 持舊 JWT 的處理（FR-028；per Clarifications 2026-05-14 Q3）

- **FR-028**：對任何 admin endpoint、當請求帶有 valid JWT 且 token 內 subject 對應的 sys_user 經 `find_active` 查詢已不存在（即軟刪、或無此 user）→ MUST 返回 `AppError` with `code::CODE_LOGOUT_SESSION_INVALIDATED`（8888）+ msg `"session invalidated: user no longer active"`，**不**繼續執行 handler 業務邏輯；具體實作位置（jwt_auth_middleware 加 find_active 檢查 vs `User` FromRequest extractor 加檢查 vs handler-level 個別檢查）由 plan 階段拍板

### Key Entities

#### `Actor` 結構（audit 寫入時的 subject）

`server_core::web::audit::Actor`（F3 新增）。3 欄位：
- `id: String` — user_id（一般 caller）or system actor name (`"cleanup_job"` / `"migration"` 等)
- `username: String` — 顯示名
- `domain: String` — user.domain (一般 caller) or `"_system"` (system actor)

提供兩個構造途徑：
- `impl From<&User> for Actor` — 一般 handler 從 `Extension<User>` 取
- `Actor::system(name: &str)` — system actor const builder（domain 固定為 `"_system"`）

#### `SoftDeletable` trait（Sea-ORM 整合層）

`server_core::db::soft_delete::SoftDeletable: EntityTrait` — 為支援軟刪的 entity 提供統一 API：
- 2 個常數: `DELETED_AT_COLUMN`（Sea-ORM Column 引用）+ `ENTITY_TYPE`（&str、寫 audit 時當 module_name 用）
- 2 個 provided method: `find_active()`（隱含 `WHERE deleted_at IS NULL`）+ `find_with_deleted()`（不過濾）
- 2 個 required async method: `soft_delete_by_id(db, id, actor)` + `restore_by_id(db, id, actor)`（同 transaction 寫 audit）

7 entity 各自 impl 此 trait、各只填 2 常數。

#### Facade module（service code 的入口）

`server_model::admin::facade::sys_<entity>`（7 個、F3 新增）。每個 facade module：
- **公開** re-export: `Model`, `Column`, `ActiveModel`, `Relation`（service 建 INSERT/UPDATE 必須）
- **故意不** re-export: `Entity`（封死直接 `Entity::find()` / `Entity::delete_*()` 路徑）
- **提供** 4 個 bare function（對應 trait method 的 ergonomic wrap）：`find_active`, `find_with_deleted`, `soft_delete_by_id`, `restore_by_id`

服務層的查詢 / 刪除 / 還原一律經 facade；UPDATE / INSERT 維持原樣（用 ActiveModel）。

#### Migration 範式

每個 entity 一個 migration 檔（共 7 個）。每檔內部三步驟原子完成：(1) 加 `deleted_at` column、(2) DROP 該 entity 既有 UNIQUE constraint、(3) CREATE 對應 partial UNIQUE INDEX `WHERE deleted_at IS NULL`。每個 entity 的具體 UNIQUE 欄位列表（如 sys_user.username/email/phone_number、sys_role.code、sys_menu.route_name 等）在 plan / data-model 階段量化。`down` migration 提供反向回復路徑。

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：7 個業務 entity 表的 schema 都有 `deleted_at TIMESTAMP NULL` 欄位（psql `\d <table>` 驗、或 sea-orm-cli verify）
- **SC-002**：每個 entity 既有 UNIQUE 欄位都被 partial unique index 取代（`WHERE deleted_at IS NULL`）— 驗：軟刪 row 後可新增同 unique value、不衝突
- **SC-003**：7 個 entity 的 `impl SoftDeletable for ::Entity { ... }` 都存在、cargo check 通過 — 自動 grep 驗 `impl SoftDeletable` 命中數 ≥ 7
- **SC-004**：7 個 facade module 都存在、re-export 列表正確（`Entity` 不在列表）、bare-function helper 全 4 個齊（`find_active` / `find_with_deleted` / `soft_delete_by_id` / `restore_by_id`）— 自動 grep 驗
- **SC-005**：CI lint pass — `grep -rE 'use server_model::admin::entities::sys_(user|role|menu|domain|organization|endpoint|access_key)' rust-api/server/{service,api,router} --include='*.rs'` 0 hit（whitelist 之外）
- **SC-006**：軟刪 + restore + audit 整合 acceptance test 全 pass — 至少 4 test case（scenario 6, 7, 9, 10）覆蓋
- **SC-007**：軟刪 partial unique index acceptance test 全 pass — scenario 2 + 3 覆蓋
- **SC-008**：所有 7 entity 的 service code migrate 完成 — 自動 grep 驗 `Entity::find\(`、`Entity::find_by_id`、`Entity::delete_by_id`、`Entity::delete_many` 在 `rust-api/server/service/` 內對這 7 entity 的命中數 = 0
- **SC-009**：樹狀 entity active-children 防護 acceptance test 全 pass — scenario 11 + 12 覆蓋（sys_menu 有 active child 時拒絕、無 active child 時放行）
- **SC-010**：軟刪 user 持有效 JWT 的請求 acceptance test pass — scenario 10 覆蓋（任意 admin endpoint 收 8888 envelope、base 觸發 logout flow）

---

## Assumptions

- **既有 `sys_operation_log_service` 可用**：F3 透過既有 service API 寫 audit；若 service 內部行為與 F3 預期不符（如不支援 transaction 透傳），F3 在實作階段（plan / tasks）修正
- **F2 audit-log-infrastructure 升級 sys_operation_log schema 時不破壞 F3 接口契約**：F3 透過 `sys_operation_log_service::create_log()` 寫 audit、不直接 SQL — F2 內部換 schema、API 不變 → F3 helper 自動跟上
- **既有 service code 用 transaction 已是常態**：F3 helper 接 `&impl ConnectionTrait` — 支援 `&DbConn`（auto-transaction）也支援 `&DatabaseTransaction`（手動 transaction）；caller 視業務需求決定
- **rev1 dev 期間 entity 表多為空 or test data**：migration 跑得快、不需 backfill 既有 row（既有 row 自動 `deleted_at IS NULL` = active）
- **base-web 不感知軟刪實作**：base 透過 admin endpoint CRUD；軟刪是 rust 內部實作細節、回 base 的 response shape 與硬刪時代等價（DELETE 成功 → `{code: 0, ...}` envelope）；F3 不需動 base
- **`built_in = true` row 防護由 caller 維護**：F3 helper 不檢查 built_in flag；service handler（如 delete user handler）保留既有 `if user.built_in { return Err(...) }` 預檢
- **CI lint 失敗 = PR block**：CI 機制（GitHub Actions / cargo make / pre-commit）由 plan 階段拍板；無論用哪個、PR 必須 pass CI lint 才能 merge
- **Casbin orphan 處理策略已拍板**：軟刪 user / role 後**不**動 casbin_rule g/p rule（沿 §3.3 join row 不動策略）；orphan policy 永遠不會被觸發、靠 auth gate 自然掩蔽
- **F3 不涉及 nestjs / DESIGN-A 過渡邏輯**：F3 是 rust 側單服務基礎建設、A/B 兩軌都通用；nestjs 退場時 F3 helper 無需動
- **F12 cleanup job 完全自行設計硬刪 API**：per Clarifications Q2，F3 不在 `server_core::db::soft_delete` 預留任何硬刪函式或可見性挖洞；F12 feature 階段在自己的 spec / plan 內拍板硬刪 API 位置 + 可見性 + caller 入口
- **F4 envelope code 對齊**：error 路徑（FR-012）回 `code::CODE_BUSINESS_ENTITY_NOT_FOUND`（6001）— F4 既建構的 24 個 business code 常數一直延用、F3 不擴張 namespace
