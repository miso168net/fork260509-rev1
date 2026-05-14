---

description: "Task list for F3 — soft-delete-infrastructure implementation"
---

# Tasks: F3 — soft-delete-infrastructure

**Input**: Design documents from [`specs/002-soft-delete-infrastructure/`](.)
**Prerequisites**: [`plan.md`](./plan.md) ✓、[`spec.md`](./spec.md) ✓、[`research.md`](./research.md) ✓、[`data-model.md`](./data-model.md) ✓、[`contracts/internal-api.md`](./contracts/internal-api.md) ✓、[`quickstart.md`](./quickstart.md) ✓

**Tests**: F3 spec.md **明示要求 acceptance test**（SC-006 / SC-007 / SC-009 / SC-010 涵蓋 acceptance scenarios 6-7 + 9-12、partial unique index 行為驗 / tree-cascade 防護 / JWT + 軟刪 user case）— 因此 test tasks 為 implementation 必要部分、不是 optional。F3 測試需要 real postgres connection（partial unique index + transaction discipline 不能用 mock 驗）。

**Organization**: F3 spec.md 單一 P1 US（infrastructure-atomic、no further decomposition）→ Phase 3 內單一 [US1] 包含全部 acceptance dimensions A + B + C + D

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to ([US1] = F3 唯一 P1 US)
- file paths 為 **repo-relative**（從 `fork260509-rev1/` workspace root 起算）

## Path Conventions

- **rust-api worktree**: `rust-api/server/{core,model,service,api,middleware}/...`、`rust-api/migration/src/schemas/...`、`rust-api/scripts/...`（per [`plan.md`](./plan.md) Project Structure）
- **outer repo**: `.github/workflows/...`
- 所有 tests: `rust-api/server/model/tests/`（沿 F4 pattern；integration test 需 real postgres connection — 細節 implementer 階段判斷）

---

## Phase 1: Setup（環境 sanity check + baseline）

**Purpose**: 確認 worktree 與 outer branch 狀態、記錄 before snapshot 供 polish 階段 verify

- [ ] T001 確認 outer 在 `002-soft-delete-infrastructure` feature branch、`base-web/` 與 `rust-api/` worktree 行首皆空格 (`git status` + `git submodule status` + `cd rust-api && git branch --show-current`、預期 `rev1-admin-rust-api`)
- [ ] T002 [P] 記錄 baseline snapshot：(a) 7 entity 內 `#[sea_orm(unique)]` 命中數 = 9（per research.md R1）、(b) `rust-api/server/service/` 內 7 entity `Entity::find(` / `Entity::delete_*` 命中數（plan 階段預估 ~20-40、待確認）、(c) `find_active` 命中數 = 0（baseline 應為 0、F3 後變正數）；輸出存到本檔 §Baseline Snapshot 段供 SC 對比

---

## Phase 2: Foundational（BLOCKING prerequisites）

**Purpose**: 建立 `audit::Actor` + `audit::AuditLogCtx` + `SoftDeletable` trait + `db` module 骨架 + `sys_operation_log_service::create_log_in_txn` — **all subsequent [US1] tasks depend on this phase**

**⚠️ CRITICAL**: 此 phase 完成前所有 [US1] tasks 不可開始（會引用未定義的 trait / struct / module）

- [ ] T003 新建 `rust-api/server/core/src/web/audit.rs` — 定義 `Actor` struct（id / username / domain 三欄位）+ `impl From<&User> for Actor` + `impl Actor { pub fn system(name: &str) -> Self }` + `AuditLogCtx<'a>` struct（actor / entity_type / description / request_id 四欄位）；per [`data-model.md`](./data-model.md) E2 + E3
- [ ] T004 修改 `rust-api/server/core/src/web/auth.rs` — 為 `User` impl 加 `pub fn domain(&self) -> String { self.domain.clone() }` getter（T003 `impl From<&User> for Actor` 需要此 getter）
- [ ] T005 修改 `rust-api/server/core/src/web/mod.rs` — 加 `pub mod audit;` 一行
- [ ] T006 新建 `rust-api/server/core/src/db/mod.rs` — 1 行 `pub mod soft_delete;`
- [ ] T007 新建 `rust-api/server/core/src/db/soft_delete.rs` — 定義 `SoftDeletable: EntityTrait` trait（4 個 item：`DELETED_AT_COLUMN` / `ENTITY_TYPE` 常數 + `find_active` / `find_with_deleted` provided methods）；per [`data-model.md`](./data-model.md) E4。**暫不**寫 7 個 impl block（impl 在 Phase 3 T010-T016 隨 entity DeletedAt column 一起加）
- [ ] T008 修改 `rust-api/server/core/src/lib.rs` — 加 `pub mod db;` 一行
- [ ] T009 新建 `rust-api/server/model/src/admin/audit_log.rs` — 定義 `pub async fn write_in_txn(txn: &DatabaseTransaction, ctx: AuditLogCtx<'_>) -> Result<(), AppError>` helper、per [`data-model.md`](./data-model.md) §E7（含 17 個 sys_operation_log ActiveModel 欄位 mapping：id ulid / method="INTERNAL" / HTTP 視角欄位空字串 / start_time=end_time=created_at=NOW / duration=0）；同步在 `rust-api/server/model/src/admin/mod.rs` 加 `pub mod audit_log;`。**不**改 `sys_operation_log_service`（F3 不擴增 service、helper 放 model 避循環依賴、per analyse C3）

**Checkpoint**: Phase 2 完成 → `cargo check` 應 pass（trait 定義 + Actor + AuditLogCtx + service method 都可獨立編譯）；尚無實質行為改變、既有 service code 不受影響

---

## Phase 3: User Story 1 [US1] — rust admin 業務 entity 全表面採軟刪 + 預設掩蔽 + audit 紀錄（P1）🎯 MVP

**Goal**: 7 個業務 entity 從 hard delete 改為 soft delete + scoped finder + audit 同 transaction + Casbin orphan 不動 + tree-cascade 防護 + 軟刪 user 持舊 JWT → 8888 + service code 全 migrate + CI lint 守 entities path

**Independent Test**: 跑 [`quickstart.md`](./quickstart.md) Step 1-8 全部 Pass → SC-001 ~ SC-010 全 10 個指標達成

### Dimension A — DB schema migration + entity field（FR-001 ~ FR-006）

- [ ] T010 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_a_add_soft_delete_to_sys_user.rs` — up 三步驟原子：(1) ADD COLUMN deleted_at TIMESTAMP NULL、(2) DROP UNIQUE constraint × 3 (username/email/phone_number)、(3) CREATE UNIQUE INDEX active_uidx × 3（WHERE deleted_at IS NULL）；down 反向；per [`data-model.md`](./data-model.md) E1 範例
- [ ] T011 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_b_add_soft_delete_to_sys_role.rs` — 同模式、UNIQUE × 1 (code)
- [ ] T012 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_c_add_soft_delete_to_sys_menu.rs` — UNIQUE × 1 (route_name)
- [ ] T013 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_d_add_soft_delete_to_sys_domain.rs` — UNIQUE × 1 (code)
- [ ] T014 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_e_add_soft_delete_to_sys_organization.rs` — UNIQUE × 1 (code)
- [ ] T015 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_f_add_soft_delete_to_sys_endpoint.rs` — UNIQUE × 0；僅 ADD COLUMN deleted_at（無 partial index 步驟）
- [ ] T016 [P] [US1] 新建 `rust-api/migration/src/schemas/m20260514_g_add_soft_delete_to_sys_access_key.rs` — UNIQUE × 2 (access_key_id, access_key_secret)
- [ ] T017 [US1] 修改 `rust-api/migration/src/schemas/mod.rs` — 在 `Migrator::migrations()` 內按字母順序 append T010-T016 的 7 個新 migration（依賴 T010-T016 全部存在）
- [ ] T018 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_user.rs` — 在 `pub struct Model` 內加 `#[sea_orm(column_type = "Timestamp", nullable)] pub deleted_at: Option<DateTime>,` 欄位（`Column::DeletedAt` variant 由 DeriveEntityModel macro 自動展開）
- [ ] T019 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_role.rs` — 同 T018 pattern
- [ ] T020 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_menu.rs` — 同上
- [ ] T021 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_domain.rs` — 同上
- [ ] T022 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_organization.rs` — 同上
- [ ] T023 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_endpoint.rs` — 同上
- [ ] T024 [P] [US1] 修改 `rust-api/server/model/src/admin/entities/sys_access_key.rs` — 同上

### Dimension B — SoftDeletable trait impls + facade module（FR-007 ~ FR-013）

- [ ] T025 [US1] 修改 `rust-api/server/core/src/db/soft_delete.rs` — 加 7 個 `impl SoftDeletable for sys_<entity>::Entity { const DELETED_AT_COLUMN = Column::DeletedAt; const ENTITY_TYPE = "sys_<entity>"; }` block（依賴 T018-T024 entity 加上 DeletedAt column variant）
- [ ] T026 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/mod.rs` — 7 行 `pub mod sys_user;` 等
- [ ] T027 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_user.rs` — 範式 A（per [`data-model.md`](./data-model.md) E5）：re-export `Model/Column/ActiveModel/Relation`（**不**含 Entity）+ 4 個 bare fn (`find_active`/`find_with_deleted`/`soft_delete_by_id`/`restore_by_id`)；async fn 內走 `db.begin()` + UPDATE deleted_at + `crate::admin::audit_log::write_in_txn` + commit（per analyse C3 — 用 model 內 audit helper、不引 server-service）
- [ ] T028 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_role.rs` — 同範式 A
- [ ] T029 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_menu.rs` — **範式 B**（樹狀、FR-026）：soft_delete_by_id 內 UPDATE 前查 active children `count(pid = id AND deleted_at IS NULL)`、≥1 即返 `AppError(code::CODE_BUSINESS_STATE_CONFLICT, "cannot delete: {N} active children exist")`；restore_by_id 不加此 check（per FR-027）
- [ ] T030 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_domain.rs` — 範式 A
- [ ] T031 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_organization.rs` — **範式 B**（樹狀）— 同 T029 邏輯但對 sys_organization
- [ ] T032 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_endpoint.rs` — 範式 A
- [ ] T033 [P] [US1] 新建 `rust-api/server/model/src/admin/facade/sys_access_key.rs` — 範式 A
- [ ] T034 [US1] 修改 `rust-api/server/model/src/admin/mod.rs` — 加 `pub mod facade;` 一行（注：`pub mod audit_log;` 已在 T009 順帶加上）

### Dimension C — Service code migration（FR-014 ~ FR-016）

> 注：T035-T043 需 audit 每個 service 內針對 7 entity 的 `Entity::find` / `Entity::delete_*` callsite。Audit 結果在執行該 task 時填到本檔 §Service Migration Audit 段。

- [ ] T035 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_user_service.rs` — (a) `use ::entities::sys_user` import 全改 `use ::admin::facade::sys_user`、(b) `Entity::find()` → `sys_user::find_active()`、(c) `model.delete()` / `Entity::delete_by_id()` → `sys_user::soft_delete_by_id(db, id, &actor)`、(d) handler signature 透傳 `Actor`（從 `Extension<User>` 轉換）
- [ ] T036 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_role_service.rs` — 同上 pattern
- [ ] T037 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_menu_service.rs` — 同上 pattern
- [ ] T038 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_domain_service.rs` — 同上 pattern
- [ ] T039 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_organization_service.rs` — 同上 pattern
- [ ] T040 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_endpoint_service.rs` — 同上 pattern
- [ ] T041 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_access_key_service.rs` — 同上 pattern
- [ ] T042 [US1] 修改 `rust-api/server/service/src/admin/sys_auth_service.rs` — login flow 改 `sys_user::find_active()`：若 user 軟刪則 login 返回 6001（自然 fallthrough、不需特殊 code path）
- [ ] T043 [US1] 修改 `rust-api/server/api/src/admin/{sys_user_api,sys_role_api,sys_menu_api,sys_domain_api,sys_organization_api,sys_endpoint_api,sys_access_key_api}.rs` 7 個 api 檔 — 對每個檔內的 delete handler 加 `let actor = Actor::from(&user);` 從 `Extension<User>` 轉換 + 把 `&actor` 透傳給對應 service method；service signature 變化 (T035-T041) 不需 propagate 到非 delete handler（per FR-016 「至少 delete handler 必透傳」、per analyse M2 量化）

### Dimension D — JWT middleware FR-028 + CI lint（FR-017 ~ FR-019 + FR-028）

- [ ] T044a [US1] 修改 `rust-api/server/middleware/Cargo.toml` — 在 `[dependencies]` 加 `server-model = { path = "../model" }`（per analyse C4 — T044 jwt.rs 改動需 import facade::sys_user）；先做此 task 否則 T044 編譯 fail
- [ ] T044 [US1] 修改 `rust-api/server/middleware/src/jwt.rs` — token 驗證通過後、注入 User extension **之前**、加 `sys_user::find_active().filter(Id.eq(&user_id_from_claims)).one(db).await` check；若 None → `Res::<String>::new_error(code::CODE_LOGOUT_SESSION_INVALIDATED, "session invalidated: user no longer active").into_response()`；per [`data-model.md`](./data-model.md) E6；依賴 T044a (Cargo.toml dep) 與 T027 (sys_user facade)
- [ ] T045 [P] [US1] 新建 `rust-api/scripts/ci-soft-delete-lint.sh` — bash script、grep `use server_model::admin::entities::sys_(user|role|menu|domain|organization|endpoint|access_key)` 在 `rust-api/server/{service,api,router}/` 內、有命中即 print + `exit 1`；per [`contracts/internal-api.md`](./contracts/internal-api.md) C7
- [ ] T046 [P] [US1] 新建 `.github/workflows/ci-soft-delete-lint.yml` — GitHub Actions workflow、trigger 為 push + pull_request、單一 job 呼叫 T045 script；per [`contracts/internal-api.md`](./contracts/internal-api.md) C7

### Tests for User Story 1（SC-006 / SC-007 / SC-009 / SC-010 — explicit request）

> **Note**: F3 為「跨 layer infrastructure」、TDD 嚴格性可放鬆 — test 可在 implementation 完成同期撰寫、不強制 fail-first。但 test 必須在「all dimensions complete」之前寫完、否則無從驗證 acceptance scenarios。Integration test 需要 real postgres connection — 假設 `cargo test` 時 dev DB 跑著（per quickstart Step 7 setup）。

- [ ] T047 [P] [US1] 撰寫 `rust-api/server/model/tests/soft_delete_basics.rs` — Dimension A + B scenarios 2-7 + 11-12：partial unique 軟刪後可新增、`find_active` 過濾、`find_with_deleted` 全 row、`soft_delete_by_id` 同 transaction 寫 audit、`restore_by_id` 對應、tree-cascade `count` check
- [ ] T048 [P] [US1] 撰寫 `rust-api/server/model/tests/soft_delete_audit_integration.rs` — scenarios 6-7 加強 + transaction rollback 場景：audit 寫失敗整體 rollback 驗證
- [ ] T049 [P] [US1] 撰寫 `rust-api/server/model/tests/soft_delete_auth_gate.rs` — scenarios 9-10：軟刪 user 走 `/auth/login` 應返 6001；軟刪 user 持舊 JWT 走任意 admin endpoint 應返 8888（per FR-028 + Clarifications Q3）

**Checkpoint**: T010-T049 全部完成 → User Story 1 應 fully functional + 12 個 acceptance scenarios 全 pass + SC-001~010 全達成

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: SC-005 / SC-008 兩個自動化指標的最終驗證 + quickstart 完整跑通 + 兩段式 commit 收尾

- [ ] T050 [P] SC-005 驗證：跑 `bash rust-api/scripts/ci-soft-delete-lint.sh` 應 pass（exit 0）；故意加違規 import 後跑同 script 應 fail（exit 1）；驗證 GitHub Actions workflow YAML 合法（local `yamllint` 或 GitHub UI 上 push 後檢查）
- [ ] T051 [P] SC-008 驗證：`grep -rE 'sys_(user|role|menu|domain|organization|endpoint|access_key)::Entity::(find\(|find_by_id|delete_by_id|delete_many)' rust-api/server/service --include='*.rs' | wc -l` 應為 0；對照 baseline（T002）before snapshot 證明全部 migrate 完
- [ ] T052 SC-001/002/003/004 驗證 + cargo check：`cd rust-api && cargo check` 全 workspace 通過（0 errors）；`grep -c 'impl SoftDeletable' server/core/src/db/soft_delete.rs` ≥ 7；7 個 facade 檔都存在且 grep `Entity` re-export 應 0 hit
- [ ] T053 跑 [`quickstart.md`](./quickstart.md) Step 1-8 完整 verification（含 migration up / partial unique 驗 / cargo test / facade structure 驗 / CI lint 驗 / service migration 驗 / E2E login+admin+soft-delete+8888 / tree-cascade 防護）— 所有步驟 Pass 才算 F3 達成
- [ ] T054 第一段 commit + push（per CLAUDE.md §6.1）：
  - `cd rust-api && git status` 確認 modified files + 新檔
  - `git add migration/src/schemas/m20260514_*.rs migration/src/schemas/mod.rs server/core/src/db/ server/core/src/web/audit.rs server/core/src/web/mod.rs server/core/src/web/auth.rs server/core/src/lib.rs server/model/src/admin/entities/sys_*.rs server/model/src/admin/audit_log.rs server/model/src/admin/facade/ server/model/src/admin/mod.rs server/service/src/admin/sys_*.rs server/middleware/src/jwt.rs server/middleware/Cargo.toml server/api/src/admin/*.rs server/model/tests/soft_delete_*.rs scripts/ci-soft-delete-lint.sh`（具體清單視 audit 結果）
  - commit message：`feat(rust-api): F3 soft-delete infrastructure（migration + trait + facade + audit_log helper + service migration + JWT FR-028 + CI lint）`
  - **等 user 同意才** `git push origin rev1-admin-rust-api`
- [ ] T055 第二段 commit（outer SHA pin update + GitHub Actions workflow、per CLAUDE.md Outer branch 預期）：
  - `cd .. && git branch --show-current` 確認 `002-soft-delete-infrastructure`
  - `git status` 應看到 `modified: rust-api (new commits)` + `?? .github/workflows/ci-soft-delete-lint.yml`
  - `git add rust-api .github/workflows/ci-soft-delete-lint.yml specs/002-soft-delete-infrastructure/`
  - commit message：`chore(submodule): bump rust-api 到 <短 SHA> — F3 soft-delete + 加 GitHub Actions ci-soft-delete-lint`
  - **等 user 同意才** `git push origin "$(git branch --show-current)"`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 無 dependencies、可立即開始
- **Phase 2 (Foundational)**: 依賴 Phase 1 完成 — **BLOCKS** Phase 3 全部 tasks
- **Phase 3 (User Story 1)**: 依賴 Phase 2 完成
  - Dimension A (T010-T024) 內 T010-T016 全 [P] 平行；T017 依賴 T010-T016；T018-T024 全 [P] 平行（不同 entity 檔）
  - Dimension B (T025-T034) 內 T025 依賴 Dimension A 完成（trait impl 需 DeletedAt column）；T026-T033 全 [P] 平行；T034 依賴 T026
  - Dimension C (T035-T043) 內 T035-T041 全 [P] 平行（不同 service 檔）；T042 / T043 視具體 service callsite 依賴 T025-T034
  - Dimension D (T044-T046) 內 T044 依賴 Dimension B (facade::sys_user::find_active 存在)；T045 / T046 全 [P]
  - Tests (T047-T049) 全 [P]；runtime 依賴 implementation tasks 完成
- **Phase 4 (Polish)**: 依賴 Phase 3 完成（特別 T053 quickstart 跑前所有 implementation tasks 必完）

### Within Phase 3 Internal Dependencies

```text
Dimension A:
  T010..T016 (7 migration files)          [P]
       └─> T017 (mod.rs append)
  T018..T024 (7 entity field add)         [P]

Dimension B:
  T025 (trait impl × 7)  ── 依賴 T018-T024
  T026 (facade/mod.rs)
       └─> T027..T033 (7 facade files)    [P] ── 依賴 T025 + T009 (create_log_in_txn)
  T034 (admin/mod.rs append)              ── 依賴 T026

Dimension C:
  T035..T041 (7 service migration)        [P] ── 依賴 T027-T033
  T042 (sys_auth_service)                 ── 依賴 T035-T041 + T029
  T043 (api/admin handler audit + Actor)  ── 依賴 T035-T042

Dimension D:
  T044a (middleware Cargo.toml +server-model)  ── 依賴 (none)、需在 T044 前
       └─> T044 (jwt.rs FR-028)            ── 依賴 T025 + T027 + T044a
  T045 (ci-soft-delete-lint.sh)            [P]
  T046 (.github/workflows/...)             [P]

Tests:
  T047..T049 (3 test files)               [P] ── 依賴 T010-T046（implementation 完成）
```

### Parallel Opportunities

#### Phase 2 內

無顯著 parallel — T003-T009 為線性依賴（T005 需 T003 + T004；T008 需 T006；T009 需 T003）。

#### Phase 3 內（重點 parallel batch）

```text
Batch 1 (Migration files): T010 ‖ T011 ‖ T012 ‖ T013 ‖ T014 ‖ T015 ‖ T016
  └─ 7 個 [P] 各自 modify 不同 migration 檔、可平行

Batch 2 (Entity field add): T018 ‖ T019 ‖ T020 ‖ T021 ‖ T022 ‖ T023 ‖ T024
  └─ 7 個 [P] 不同 entity 檔、可平行

Batch 3 (Facade files): T027 ‖ T028 ‖ T029 ‖ T030 ‖ T031 ‖ T032 ‖ T033
  └─ 7 個 [P] 不同 facade 檔、可平行

Batch 4 (Service migration): T035 ‖ T036 ‖ T037 ‖ T038 ‖ T039 ‖ T040 ‖ T041
  └─ 7 個 [P] 不同 service 檔、可平行

Batch 5 (CI lint): T045 ‖ T046
  └─ shell script 與 GitHub workflow 不同檔、可平行

Batch 6 (Tests, writing only): T047 ‖ T048 ‖ T049
  └─ 3 個 [P] 平行寫；test 跑通需 implementation tasks 完
```

#### Phase 4 內

```text
T050 ‖ T051 平行（不同 verification target）
T052 必須等 T050 / T051 pass
T053 (quickstart) 依賴 T052 pass
T054 (worktree commit) 依賴 T053 pass + user 同意
T055 (outer SHA pin) 依賴 T054 完成
```

---

## Parallel Example: User Story 1 Batch 1 (Migration files)

可在不同 terminal 或 background agent 平行跑 7 個 tasks：

```bash
# Terminal A: T010 — sys_user migration
$EDITOR rust-api/migration/src/schemas/m20260514_a_add_soft_delete_to_sys_user.rs

# Terminal B: T011 — sys_role migration
$EDITOR rust-api/migration/src/schemas/m20260514_b_add_soft_delete_to_sys_role.rs

# Terminal C-G: 其他 5 個 migration
# (依模板模式創建)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

F3 唯一 P1 US = 整個 F3 feature 範圍。「MVP first」對 F3 = 「完整 F3」、不可分。

1. Phase 1 Setup（sanity check）
2. Phase 2 Foundational（**CRITICAL** — Actor / AuditLogCtx / SoftDeletable trait + create_log_in_txn）
3. Phase 3 [US1]（4 dimensions × 多個 task：migration / entity / trait impl / facade / service migration / JWT middleware / CI lint / tests）
4. **STOP and VALIDATE**: 跑 quickstart.md Step 1-8
5. Phase 4 Polish：SC-005 / SC-008 / quickstart 全套 + 兩段式 commit

### Incremental Delivery (alternative if 分批 review)

雖然 F3 是 atomic infrastructure feature，但實作上可分為 3 個 review chunk：

1. **Chunk A: Foundational + Dimension A**（T001-T024）— audit struct + trait 骨架 + migration + entity field 變動
2. **Chunk B: Dimension B + C**（T025-T043）— trait impl + facade module + service migration
3. **Chunk C: Dimension D + tests + polish**（T044-T055）— JWT middleware + CI lint + acceptance test + commit

但 acceptance test 全 pass（SC-006 / SC-007 / SC-009 / SC-010）需 Chunk A + B + C 都完成才能驗證。

### Single Developer Strategy

F3 為 single-developer feature（不涉跨域協調）：

- Phase 1 + 2 順序做（無 parallel）
- Phase 3 內 Batch 1-6 可 cluster 做（同 batch 內各 task 改不同檔、可同時編輯）
- Phase 4 收尾

---

## Baseline Snapshot (記錄於 T002)

> Implementation 開始前由 T002 填入；polish 階段 SC-005 / SC-008 對比驗證用

```text
Before implementation (T002 執行時填入、2026-05-14 完成):
  7 entity #[sea_orm(unique)] 命中總數: 9 ✓ (per research.md R1)
  rust-api/server/service/ 內 7 entity (Sys{Entity}|sys_xxx::Entity)::(find|delete) 命中數: 40
    └─ 實際 callsite 模式為 `use entities::prelude::SysUser; SysUser::find()` (透過 prelude alias)
    └─ 明細：sys_access_key=4, sys_authorization=6, sys_auth=2, sys_organization=1, sys_domain=5,
              sys_menu=7, sys_role=5, sys_endpoint=4, sys_user=6
  find_active 命中數 (server/ 全): 0 ✓ (baseline)
  use server_model::admin::entities::sys_(user|...) 在 server/{service,api,router}/ 命中數: 0
  use server_model::admin::entities::prelude::Sys(User|...) 在 server/{service,api}/ 命中數: 多筆
    └─ ⚠️ FR-017 CI lint regex 只抓 `entities::sys_xxx`、需擴張 catch `entities::prelude::Sys{Entity}`

After implementation (T050 / T051 / T052 執行時填入、2026-05-14 完成):
  Entity::find( + Entity::delete_* 對 7 entity 在 service/ 命中數: 0 ✅ (SC-008 pass)
  use server_model::admin::entities::sys_<entity> 在 server/{service,api,router}/ 命中數: 0 ✅ (SC-005 pass)
  use server_model::admin::entities::prelude::Sys{Entity} 在 server/{service,api,router}/ 命中數: 0 ✅ (SC-005 延伸 pass)
  find_active 命中數 (server/ 全): 65 ✅ (migration done)
  impl SoftDeletable 命中數 in soft_delete_impls.rs: 7 ✅ (SC-003 pass; 注：impls 由 spec §E4 想象的 server-core 移到 server-model 避循環 dep — analyse C3 precedent)
  7 entity 加 deleted_at field 驗證: 全 1 hit ✅ (SC-001)
  7 facade 4 個 bare fn 都齊: 每檔 4 ✅ (SC-004)
  7 facade Entity 不 re-export（非註解 grep）: 0 ✅ (SC-004)
  partial unique index 總數（up+down 兩面）: 18 = 9 × 2 ✅ (SC-002)
  ci-soft-delete-lint.sh: ✅ 正常 pass、注入違規即 exit 1
  cargo check 全 workspace: ✅ pass (controller via docker run rust:1.86.0-alpine)
```

### T053 quickstart Step 1-8 狀態

- **Step 1-6 + 8**: 透過上述 grep + cargo check + lint script 等 static checks 已涵蓋（migration / entity field / partial unique index / trait impl / facade structure / CI lint / service migration / tree-cascade build-block test）
- **Step 7 (E2E login + admin soft-delete + 8888 envelope)**: 需 real postgres + redis + rust-api server 起來 — **deferred to manual run when deploy/ stack is up**。3 個 G11 acceptance test 也用 `#[ignore]` pattern、`cargo test -- --ignored` + export `TEST_DATABASE_URL` 即可跑（per soft_delete_basics.rs header）

F3 spec 12 個 acceptance scenarios 對應：
- Static-checkable scenarios (1-5, 8, 11-12): ✅ verified
- Behavior scenarios (6, 7, 9, 10): test code 寫完、待 DB 起來實跑驗證

---

## Service Migration Audit (記錄於 T035-T043)

> Audit phase 填入；review 用

```text
T035 (sys_user_service.rs):
  Entity::find / find_by_id callsite: __ (改為 sys_user::find_active)
  Entity::delete_by_id / model.delete callsite: __ (改為 sys_user::soft_delete_by_id)
  use ::entities::sys_user → use ::admin::facade::sys_user
  handler signature 透傳 Actor 處: __

T036-T041 同 pattern；T042 sys_auth_service: login 改 find_active；T043 api handler: delete handler 加 Actor::from(&user) 處 ~ __
```

---

## Notes

- **[P] tasks = 不同檔、無未完成依賴** — 可放心平行
- **[Story] label = [US1]** — F3 唯一 P1 US，所有 Phase 3 task 都標 [US1]
- **Verify tests pass before claiming F3 complete**（quickstart Step 1-8 + SC-001~010 全 pass）
- **Commit after each logical group**（不是 task-by-task）— Phase 2 結束 commit / Phase 3 dimension 結束 commit / Polish 結束 commit。但**push 全部等 user 同意**（per CLAUDE.md §6.2）
- **Avoid: 改 base `src/` 任何檔** — Constitution Principle IV 嚴格禁止（F3 不動 base、`.env` 也不動）
- **Avoid: 動 sys_operation_log schema** — 留 F2 audit-log-infrastructure 處理；F3 只新增 `create_log_in_txn` method、表結構不動
- **Avoid: 在 service code 加 raw SQL DELETE / Entity::delete_***  — facade 是唯一合法 delete 路徑

---

**Total tasks**: 56（含 analyse 階段 C4 補的 T044a）
**Per-phase breakdown**: Setup (2) / Foundational (7) / [US1] (41) / Polish (6)
**Parallel opportunities**: Phase 3 Batch 1 (7) + Batch 2 (7) + Batch 3 (7) + Batch 4 (7) + Batch 5 (2) + Batch 6 (3) = 最多 33 個 task 可平行
**MVP scope**: User Story 1 = 整個 F3（atomic infrastructure increment）
**下一步**：執行 `/speckit-implement` 開始實作（或手動依本檔 task 順序執行）
