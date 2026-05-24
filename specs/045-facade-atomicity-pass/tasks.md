---
description: "Task list for 045 facade-atomicity-pass"
---

# Tasks: 045 facade-atomicity-pass

**Input**: Design documents from `/specs/045-facade-atomicity-pass/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 為 rust-api code refactor + 1 redis pub-sub channel + 2 metric pre-declare、無新業務純函式測試需求；acceptance 純由 [`contracts/verification-commands.md`](./contracts/verification-commands.md) C-V1~C-V12 涵蓋（dev stack 12 service + grep + curl + psql + redis-cli + prometheus query）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) 紀律「無新純函式測試時由 acceptance 覆蓋、明示理由」。

**Organization**：依 spec.md 4 user story（US1+US3 = P2 facade fill / US2 = P1 MVP pub-sub / US4 = P1 trait *_in_txn）+ Polish 分 phase；US 之間獨立可任意順序、Phase 1 + 2 minimal（無 project init / 無 foundational blocker）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**：本 feature 無新 workspace dep（metrics 044 已加）、無新 deploy/ config 檔。Phase 1 跳過、直接進 Foundational / US phase。

*(no tasks)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 feature 4 個 user story 互相獨立（touch 不同 file group、無共享 model/entity 改動）；無 cross-story blocking 設施。Phase 2 跳過、4 個 US phase 任意順序 / 並行可跑。

*(no tasks)*

**Checkpoint**：4 個 user story 全部 ready to start in parallel。

---

## Phase 3: User Story 2 — F3-N2 sys_access_key DB↔in-memory atomicity（Priority: P1）🎯 MVP

**Goal**：sys_access_key DELETE 後、in-memory validator state 在毫秒級（< 500ms）內跨副本同步；不再依賴 process restart 才生效。Pattern 對齊 W-F11 Casbin redis pub-sub + self-reload 體例。

**Independent Test**：DELETE access_key 後立刻用該 key 試 sandbox endpoint → 401（< 500ms total elapsed）；redis-cli SUBSCRIBE 看到 publish `"1"`；`api_key_invalidate_total` + `api_key_reload_total` 兩 metric +1。

### Implementation for User Story 2

- [ ] T001 [P] [US2] `rust-api/server/core/src/sign/api_key.rs` 加 `pub fn clear(&self)` 到 `SimpleApiKeyValidator` impl（lines ~95-110 區段、`self.keys.write().clear()`）。對應 FR-006 / [research R-6](./research.md)、[data-model §E3](./data-model.md)。
- [ ] T002 [P] [US2] `rust-api/server/core/src/sign/api_key.rs` 加 `pub fn clear(&self)` 到 `ComplexApiKeyValidator` impl（lines ~290-310 區段、`self.secrets.write().clear()`）。對應 FR-006 / [research R-6](./research.md)。
- [ ] T003 [US2] `rust-api/server/core/src/sign/mod.rs` 加 module-level `pub async fn clear_all_keys()` —— 對齊既有 `add_key` / `remove_key` wrapper 體例、call `API_KEY_VALIDATORS.0.write().await.clear()` + `API_KEY_VALIDATORS.1.write().await.clear()`。Depends on T001+T002。對應 FR-006、[data-model §E3](./data-model.md)。
- [ ] T004 [P] [US2] 新檔 `rust-api/server/global/src/api_key_notify.rs` —— 對齊 `casbin_notify.rs` 結構：`pub const API_KEY_INVALIDATE_CHANNEL = "api_key:invalidate"` + `const API_KEY_INVALIDATE_PAYLOAD = "1"` + `pub async fn notify_api_key_changed()` (取 GLOBAL_PRIMARY_REDIS Single mode → get_multiplexed_async_connection → PUBLISH → Ok arm 加 `metrics::counter!("api_key_invalidate_total").increment(1)`)。對應 FR-004、[data-model §E2.3](./data-model.md)。
- [ ] T005 [P] [US2] `rust-api/server/global/src/lib.rs` 加 `pub mod api_key_notify;` 暴 publisher fn 給其他 crate。對應 FR-004。
- [ ] T006 [P] [US2] 新檔 `rust-api/server/initialize/src/api_key_sync_initialization.rs` —— 對齊 `casbin_sync_initialization.rs` 結構：`pub fn spawn_api_key_sync_subscriber()` (tokio::spawn + 5s RECONNECT_BACKOFF loop + `.instrument(Span::current())` 044 propagation) + `async fn run_subscription()` (subscribe + on_message → reload_api_keys) + `async fn reload_api_keys()` (clear_all_keys → SELECT find_active → for-each add_key → `metrics::counter!("api_key_reload_total").increment(1)`)。對應 FR-005、[data-model §E2.4](./data-model.md)。
- [ ] T007 [P] [US2] `rust-api/server/initialize/src/lib.rs` 加 `mod api_key_sync_initialization;` + `pub use api_key_sync_initialization::spawn_api_key_sync_subscriber;`。對應 FR-005。
- [ ] T008 [US2] `rust-api/server/initialize/src/metrics_init.rs` 加 2 個新 metric pre-declare：`describe_counter!("api_key_invalidate_total", "api_key invalidate broadcast publish count");` + `describe_counter!("api_key_reload_total", "api_key in-memory validator reload count");` + `counter!("api_key_invalidate_total").absolute(0);` + `counter!("api_key_reload_total").absolute(0);` —— 對齊 044 既有 8 metric pre-declare 模式。對應 FR-010、[data-model §E6](./data-model.md)。
- [ ] T009 [US2] `rust-api/server/service/src/admin/sys_access_key_service.rs::delete_access_key`（lines 173-196 區段）—— 拿掉既有 2 行 `server_core::sign::remove_key(ValidatorType::Simple/Complex, &access_key.access_key_id).await;`、改為 1 行 `server_global::api_key_notify::notify_api_key_changed().await;`（在 facade `soft_delete_by_id` 之後）。對應 FR-007、[data-model §E7 US2 delete refactor](./data-model.md)。
- [ ] T010 [US2] `rust-api/server/bin/src/main.rs` 在 `initialize_audit_outbox_drainer()` 之後、`initialize_admin_router()` 之前加 1 行 `server_initialize::spawn_api_key_sync_subscriber();` —— 對齊 W-F11 `spawn_casbin_sync_subscriber` 順序（subscriber-first per research R-2）。Depends on T006+T007。對應 FR-011、[research R-2](./research.md)。
- [ ] T011 [US2] C-V4 acceptance — redis-cli SUBSCRIBE `api_key:invalidate` + trigger 1 DELETE access_key → 看到 publish `"1"` 訊號。per [contracts C-V4](./contracts/verification-commands.md)。對應 SC-005、FR-004。
- [ ] T012 [US2] C-V5 acceptance — DELETE access_key X 後立刻試 key X sandbox 應 401 + total elapsed < 500ms。per [contracts C-V5](./contracts/verification-commands.md)。對應 SC-004、FR-004/005/006/007。
- [ ] T013 [US2] C-V6 acceptance — DELETE access_key 後 prometheus query `api_key_invalidate_total` + `api_key_reload_total` 兩 counter 各 +1。per [contracts C-V6](./contracts/verification-commands.md)。對應 SC-005、FR-010。

**Checkpoint**：US2 完成 —— sys_access_key DELETE 後跨副本毫秒級同步、self-reload 機制就位、2 metric 流動。**MVP-worthy（最 critical real atomicity gap 已收緊、其他 3 US 都是 lower priority code quality）**。

---

## Phase 4: User Story 4 — 035-N1 service trait *_in_txn 雙生方法（Priority: P1）

**Goal**：systemManage `add_user_for_systemmanage` / `update_user_for_systemmanage` 內 create_user + assign_roles 在 single outer txn、失敗一起 rollback。pattern 對齊 `audit_log::write_in_txn` 既有 _in_txn 體例。030-040 callsite 0 改動（向後相容）。

**Independent Test**：POST `/api/systemManage/addUser` 含 invalid user_roles → user row 不存在 + INTERNAL audit 0 row（HTTP middleware audit 仍 1 row by 042 design）；valid → user + roles + 2 audit row 同 commit、created_at span < 50ms。

### Implementation for User Story 4

- [ ] T014 [P] [US4] `rust-api/server/service/src/admin/sys_user_service.rs::TUserService` trait 加 3 個 `*_in_txn` method declaration：`create_user_in_txn(&self, txn: &DatabaseTransaction, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError>` + `assign_roles_to_user_in_txn(&self, txn: &DatabaseTransaction, user_id: String, role_codes: Vec<String>, actor: &Actor) -> Result<(), AppError>` + `update_user_in_txn(&self, txn: &DatabaseTransaction, id: &str, input: UpdateUserInput, actor: &Actor) -> Result<UserModel, AppError>`。簽名固定 `&DatabaseTransaction`（不帶 generic、per research R-4）。對應 FR-008、[data-model §E4.2](./data-model.md)、[research R-4](./research.md)。
- [ ] T015 [US4] `rust-api/server/service/src/admin/sys_user_service.rs::impl TUserService for SysUserService` —— 把既有 `create_user`/`assign_roles_to_user`/`update_user` 內部邏輯（hash password / INSERT / audit_log::write_in_txn / etc.）搬到對應 `*_in_txn` impl method；原 3 fn 改為 thin delegate：`let txn = db.begin().await?; let result = self.create_user_in_txn(&txn, input, actor).await?; txn.commit().await?; Ok(result)`。Depends on T014。對應 FR-008、[data-model §E4.3](./data-model.md)。
- [ ] T016 [US4] `rust-api/server/api/src/admin/sys_system_manage_api.rs::add_user_for_systemmanage`（lines 120-150 區段）—— 改開外層 txn 模式：`let txn = db.begin().await?; let created = user_service.create_user_in_txn(&txn, ...).await?; user_service.assign_roles_to_user_in_txn(&txn, ...).await?; txn.commit().await?;`。Depends on T015。對應 FR-009、[data-model §E5.1](./data-model.md)、[quickstart Step 3.3](./quickstart.md)。
- [ ] T017 [US4] `rust-api/server/api/src/admin/sys_system_manage_api.rs::update_user_for_systemmanage`（lines 152-180 區段）—— 同樣 outer txn 模式；注意 `lookup_ulid_by_display_id(display_id)` 在 outer txn 開**之前**做（不存在則早返 404、不浪費 txn）；然後 `db.begin() → update_user_in_txn(&txn, &user_ulid, ...) → assign_roles_to_user_in_txn(&txn, user_ulid, ...) → txn.commit()`。Depends on T015。對應 FR-009、[data-model §E5.2](./data-model.md)。
- [ ] T018 [US4] C-V8 acceptance — POST `/api/systemManage/addUser` valid + role display_id valid → user row + sys_user_role 1+ row + INTERNAL audit ≥2 row + audit span < 50ms。per [contracts C-V8](./contracts/verification-commands.md)。對應 SC-007、FR-008/009。
- [ ] T019 [US4] C-V9 acceptance — POST `/api/systemManage/addUser` invalid user_roles (display_id=999999999) → user row 0 + INTERNAL audit 0（HTTP middleware audit row 仍 1 by 042 design）。per [contracts C-V9](./contracts/verification-commands.md)。對應 SC-006、FR-008/009。
- [ ] T020 [US4] C-V10 acceptance — PUT `/api/systemManage/updateUser/{display_id}` happy + negative path 同 outer-txn atomic 行為。per [contracts C-V10](./contracts/verification-commands.md)。對應 SC-006/007、FR-008/009。

**Checkpoint**：US4 完成 —— systemManage admin user create/update 失敗路徑 0 殘留、Constitution II 強化（per-path audit + 同 outer txn atomic）。

---

## Phase 5: User Story 1 — F3-N1 sys_endpoint facade INSERT/UPDATE surface（Priority: P2）

**Goal**：sys_endpoint facade 補完 INSERT/UPDATE wrapper、service 變薄、interface boundary 清晰；改前 sync_endpoints 用 fully-qualified Sea-ORM call、改後全部走 facade。

**Independent Test**：grep facade 含 `upsert_with_audit` fn；grep service `sys_endpoint::Entity::insert` / `sys_endpoint::ActiveModel::insert` 0 hit；endpoint_sync 跑後 sys_operation_log entity_type=sys_endpoint 數量對齊 sys_endpoint row 數量。

### Implementation for User Story 1

- [ ] T021 [US1] `rust-api/server/model/src/admin/facade/sys_endpoint.rs` 加 `pub async fn upsert_with_audit<C>(db: &C, endpoint: SysEndpointModel, actor: &Actor) -> Result<(), AppError> where C: ConnectionTrait + TransactionTrait` —— per [data-model §E1.2](./data-model.md) 完整邏輯：`db.begin()` → fetch before by `_entity::Column::Id.eq(&endpoint.id)` + `Column::DeletedAt.is_null()` → None→INSERT (active_model.insert) + audit_log::write_in_txn(Insert) / Some+diff→UPDATE (active.update) + audit Update with audit_snapshot before/after / Some+no diff→noop (txn.commit + early return) → txn.commit。對應 FR-001、[research R-3](./research.md)、[data-model §E1.2](./data-model.md)。
- [ ] T022 [US1] `rust-api/server/service/src/admin/sys_endpoint_service.rs::sync_endpoints`（lines 184-220 區段）—— 拿掉內部 `self.upsert_endpoint_with_audit(...)` 呼叫、改 `sys_endpoint::upsert_with_audit(&txn, endpoint.clone(), &actor).await?;`。Depends on T021。對應 FR-003。
- [ ] T023 [US1] `rust-api/server/service/src/admin/sys_endpoint_service.rs` —— 移除內部私有 helper fn `async fn upsert_endpoint_with_audit(...)`（grep 確認 callsite 全已改走 facade）。Depends on T022。對應 FR-003、[quickstart Step 1.2](./quickstart.md)。
- [ ] T024 [US1] C-V2 acceptance — grep facade 含 `upsert_with_audit` + service 不再含 `upsert_endpoint_with_audit` + service 不再含 fully-qualified Sea-ORM INSERT；endpoint_sync 跑後 audit row ≥ endpoint row 數量。per [contracts C-V2](./contracts/verification-commands.md)。對應 SC-002/003、FR-001/003。
- [ ] T025 [US1] C-V3 acceptance — facade 既有 `find_active` / `find_with_deleted` / `soft_delete_by_id` / `restore_by_id` 4 個 API 仍在；restart rust-api 後 endpoint 數穩定、不誤刪/不重複建。per [contracts C-V3](./contracts/verification-commands.md)。對應 SC-003、FR-001/003 regression。

**Checkpoint**：US1 完成 —— sys_endpoint facade INSERT/UPDATE surface 補完、service refactor、行為不退化。

---

## Phase 6: User Story 3 — F3-N3 sys_endpoint facade batch surface（Priority: P2）

**Goal**：`batch_remove_endpoints` 改走 facade 層、log-and-continue semantics 保留（endpoint_sync periodic job 設計意圖）；介面與 facade `soft_delete_by_id` 一致。

**Independent Test**：grep facade 含 `batch_soft_delete_with_audit` fn + `BatchDeletePolicy::{FailFast, LogAndContinue}` enum + `BatchDeleteResult` struct；service `batch_remove_endpoints` 改走 facade、log line 形狀 `target=endpoint_sync` 對齊改前。

### Implementation for User Story 3

- [ ] T026 [US3] `rust-api/server/model/src/admin/facade/sys_endpoint.rs` 加 `pub enum BatchDeletePolicy { FailFast, LogAndContinue { target: &'static str } }` + `#[derive(Debug, Default)] pub struct BatchDeleteResult { pub ok: Vec<String>, pub failed: Vec<(String, AppError)> }`。對應 FR-002、[data-model §E1.2](./data-model.md)。
- [ ] T027 [US3] `rust-api/server/model/src/admin/facade/sys_endpoint.rs` 加 `pub async fn batch_soft_delete_with_audit<C>(db: &C, ids: Vec<String>, actor: &Actor, policy: BatchDeletePolicy) -> Result<BatchDeleteResult, AppError> where C: ConnectionTrait + TransactionTrait` —— per [data-model §E1.2](./data-model.md) 邏輯：per-id for-loop `match soft_delete_by_id(db, id.clone(), actor).await`：Ok→push to result.ok / Err+FailFast→propagate error / Err+LogAndContinue{target}→`tracing::warn!(target: target, id = %id, error = ?e, "batch_soft_delete: per-row soft_delete failed")` + push to result.failed。Depends on T026。對應 FR-002。
- [ ] T028 [US3] `rust-api/server/service/src/admin/sys_endpoint_service.rs::batch_remove_endpoints`（lines 126-141 區段）—— 拿掉既有 per-id for-loop `if let Err(e) = sys_endpoint::soft_delete_by_id(...) ... tracing::warn! ...`、改：`sys_endpoint::batch_soft_delete_with_audit(db, endpoints_to_remove, &actor, BatchDeletePolicy::LogAndContinue { target: "endpoint_sync" }).await?; Ok(())`。Depends on T027。對應 FR-003、[quickstart Step 1.2](./quickstart.md)。
- [ ] T029 [US3] C-V7 acceptance — grep facade 含 `BatchDeletePolicy` enum 兩 variant + `BatchDeleteResult` struct + service refactor 改走 facade；若有 endpoint 移除則 docker compose logs rust-api warn line 形狀 `target=endpoint_sync` + `id` + `error` fields。per [contracts C-V7](./contracts/verification-commands.md)。對應 SC-002、FR-002/003。

**Checkpoint**：US3 完成 —— facade batch surface 補完、periodic-job log-and-continue 紀律保留。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**：INTEGRATION-CHECKLIST cleanup（FR-014）+ acceptance 全綠 verify + 多段式 commit + merge + SHA backfill。

- [ ] T030 改 `docs/INTEGRATION-CHECKLIST.md`：衍生 follow-up table 移除 4 row（F3-N1 / F3-N2 / F3-N3 / 035-N1）。對應 FR-014、SC-009、[quickstart Step 6.1](./quickstart.md)。
- [ ] T031 改 `docs/INTEGRATION-CHECKLIST.md`：已完成里程碑加 045 entry（按 044 體例：日期 + outer/merge SHA placeholder + spec link + 一段描述含 4 US + 軌道外 rust-only）。對應 FR-014、SC-009、[quickstart Step 6.2](./quickstart.md)。
- [ ] T032 改 `docs/INTEGRATION-CHECKLIST.md`：Current Focus 「下一步」改指向「base-web TS id 型別債 cleanup sprint 或其他 follow-up backlog（042-N1 ignored test 補 / 044-N1 println! cleanup / W-F15/16 backup-job）」。對應 FR-014、SC-009、[quickstart Step 6.3](./quickstart.md)。
- [ ] T033 C-V12 acceptance — `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up 4 row 全移、045 entry ≥1 hit。per [contracts C-V12](./contracts/verification-commands.md)。對應 SC-009、FR-014。
- [ ] T034 [P] docker build rust-api image + dev stack restart rust-api + 12 service healthy verify — `docker build -t rust-api:rev1-admin-rust-api ./rust-api`（~5-15min）→ `$PC up -d --force-recreate --no-deps rust-api && sleep 12` → `$PC ps --format "table {{.Service}}\t{{.Status}}"` 全 healthy（含 redis_exporter / nginx-exporter "Up" without healthcheck）。對應 SC-001、[quickstart Step 5](./quickstart.md)。
- [ ] T035 [P] 完整 C-V1~C-V12 跑 acceptance — 依 [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重 build + 重跑、全 PASS 才進下一 task。對應 SC-001~009。
- [ ] T036 C-V11 boundary verify — `git diff --stat base-web/` 0 行（FR-012 / SC-008） + `find rust-api/migration/src/ -newer specs/045-facade-atomicity-pass/spec.md -name "*.rs"` 0 hit（FR-013 / SC-008 0 schema migration） + `find rust-api/server/model/src/admin/entities/ -newer ...spec.md -name "sys_*.rs"` 0 hit（FR-013 0 新 entity）。per [contracts C-V11](./contracts/verification-commands.md)。對應 SC-008、FR-012/013。
- [ ] T037 rust-api worktree 多段 commit — 進 `rust-api/` worktree、依 [quickstart Step 7.1](./quickstart.md) 拆 5-7 個 logical commit（US1+US3 facade fill / US2 clear_all_keys / US2 publisher / US2 subscriber + metric + main.rs / US2 delete refactor / US4 trait + handler）；push origin rev1-admin-rust-api **須 user 同意**。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T038 outer feature branch commit — 依 [quickstart Step 7.2](./quickstart.md) 拆多 commit（rust-api SHA pin bump + INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker）；push origin 045-facade-atomicity-pass **須 user 同意**。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T039 git merge 045 → rev1-admin-root — **user 同意才執行**：`git checkout rev1-admin-root && git merge --no-ff 045-facade-atomicity-pass -m "Merge feature 045-facade-atomicity-pass"`；merge 後 push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T040 backfill outer/merge/rust-api SHA + push — merge 後拿 outer SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 045 entry 的 `<SHA>` placeholder、small chore commit（per 041/042/043/044 體例）+ push **須 user 同意**。對應 SC-009。

**Checkpoint**：045 整 feature 落地、acceptance 全綠、backlog 已 cleanup、boundary verify PASS、merge 回 default、4 N item 全結案。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (skipped — no project init needed)
Phase 2 Foundational (skipped — 4 US 互相獨立)
   │
   ├─→ US2 F3-N2 pub-sub (T001-T013、P1 MVP、可平行 US1/US3/US4)
   │
   ├─→ US4 035-N1 *_in_txn (T014-T020、P1、可平行 US1/US2/US3)
   │
   ├─→ US1 F3-N1 facade upsert (T021-T025、P2、可平行 US2/US3/US4)
   │
   └─→ US3 F3-N3 facade batch (T026-T029、P2、可平行 US1/US2/US4)
                                                  │
Phase 7 Polish (T030-T040、collect + verify + commit + merge + backfill) ──┘
```

4 個 user story 完全獨立可任意順序 / 平行；Polish phase 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001-T002 (US2 validator clear) | — (parallel) |
| T003 (US2 module clear_all_keys) | T001 + T002 |
| T004 (US2 publisher) | — (parallel) |
| T005 (US2 global lib mod) | T004 |
| T006 (US2 subscriber) | — (parallel) |
| T007 (US2 initialize lib mod) | T006 |
| T008 (US2 metric pre-declare) | — (parallel)（044 metric_init.rs 已存在） |
| T009 (US2 delete refactor) | T004 + T005（用 notify_api_key_changed publisher、clear_all_keys 由 subscriber 用、不在 delete path） |
| T010 (US2 main.rs spawn) | T006 + T007 |
| T011-T013 (US2 acceptance) | T001-T010 + 整 rust-api rebuild（Phase 7 T034） |
| T014 (US4 trait declarations) | — (parallel) |
| T015 (US4 impl 雙生方法) | T014 |
| T016 (US4 add_user handler) | T015 |
| T017 (US4 update_user handler) | T015 |
| T018-T020 (US4 acceptance) | T014-T017 + rebuild |
| T021 (US1 facade upsert) | — (parallel) |
| T022 (US1 service sync_endpoints refactor) | T021 |
| T023 (US1 service helper removal) | T022 |
| T024-T025 (US1 acceptance) | T021-T023 + rebuild |
| T026 (US3 facade enum/struct) | — (parallel) |
| T027 (US3 facade batch fn) | T026 |
| T028 (US3 service batch_remove refactor) | T027 |
| T029 (US3 acceptance) | T026-T028 + rebuild |
| T030-T033 (Polish docs) | T001-T029 全完 |
| T034-T035 (Polish rebuild + acceptance) | T030-T033 |
| T036 (Polish boundary verify) | T030-T033 |
| T037-T040 (Polish commit/merge/backfill) | T034-T036 全 PASS（**user 同意 push / merge**）|

---

## Implementation Strategy（per quickstart Step 1-7 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 3 US2 P1 MVP**（T001-T013）：
- T001/T002/T004/T006/T008 可並行（不同檔）
- T003 串行於 T001+T002（同檔 mod.rs append）
- T005/T007 各自串行（lib.rs mod 加）
- T009/T010 串行最後
- T011-T013 acceptance 留 Phase 7 docker rebuild 後

→ 約 20-30 分鐘 implementer 階段；acceptance defer。

**Batch 2 — Phase 4 US4 P1**（T014-T020）：
- T014 trait declaration 先
- T015 impl 重構（大塊邏輯搬移）
- T016/T017 兩 handler 並行（不同 fn）
- T018-T020 acceptance 留 Phase 7

→ 約 20-30 分鐘。

**Batch 3 — Phase 5+6 US1+US3 P2 並行**（T021-T029）：
- T021 facade upsert
- T026 facade enum/struct（與 T021 並行、同檔但不同新增區段、不衝突）
- T027 facade batch fn（depends on T026）
- T022/T028 各自串行於 facade 完
- T023 移除 service helper（depends on T022）
- T024/T025/T029 acceptance defer

→ 約 15-20 分鐘。

**Batch 4 — Phase 7 Polish**（T030-T040）：
- T030-T033 串行（INTEGRATION-CHECKLIST 3 改 + verify）
- T034 docker build（~5-15min）
- T035 跑 C-V1~C-V12 acceptance（含 US2/US4/US1/US3 acceptance task 整批 confirm）
- T036 boundary verify 並行 T035
- T037-T040 串行 commit + merge + backfill + push（user 同意關卡）

→ 約 1-2 hr、含 user 同意等待。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-1（US2 only）**：完 Phase 3 + 部分 Polish。**僅交 F3-N2 redis pub-sub + self-reload**（最 critical real atomicity gap 收緊）。其他 3 US 留後。
- **MVP-2（US2 + US4）**：+ Phase 4。可 deliver 兩個 real atomicity gap 修正。
- **Full feature（US1-US4 + Polish）**：依 Batch 1-4 完整跑（推薦、bundled cleanup pass、4 N item 一次清完）。

User 偏好：Full feature 一次到位（per brainstorm Q1 拍板「scope 全 4 N 下動」）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 4 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~014 + SC-001~009）→ ② code quality（spec md 內容品質、rust code 品質、async_trait + sea-orm 互動正確、Constitution 紀律）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、C-V 命令 actual output、commit SHA）。

**Phase 7 Polish** 必須在 US1-US4 全部 PASS 後執行（含 user 同意 push / merge / backfill 三個關卡）。

---

## Summary

- **Total tasks**: 40
- **By phase**: Setup 0 / Foundational 0 / US2 13 / US4 7 / US1 5 / US3 4 / Polish 11
- **By user story**: US2 = 13 / US4 = 7 / US1 = 5 / US3 = 4（共 29 user story tasks）+ Polish 11
- **Parallel opportunities**：
  - 4 user story 完全獨立、Phase 3-6 全部 subagent parallel-friendly
  - US2 內部 T001/T002/T004/T006/T008 並行
  - US4 內部 T016/T017 並行
  - US1+US3 跨 US 並行（同 facade 檔不衝突區段）
  - Phase 7 T034/T035/T036 並行
- **Independent test criteria**: 每個 US 對應 C-V1~C-V12 中 1-3 條（per spec.md SC-001~009）
- **Suggested MVP scope**: US2 F3-N2 only（P1 MVP per spec-kit framework）；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 40 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
