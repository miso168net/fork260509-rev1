---
description: "Task list for 046 spec-hygiene-pass-3"
---

# Tasks: 046 spec-hygiene-pass-3

**Input**: Design documents from `/specs/046-spec-hygiene-pass-3/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 為 spec docs erratum + rust-api code refactor + test helper 新加；無新業務純函式測試需求；acceptance 純由 [`contracts/verification-commands.md`](./contracts/verification-commands.md) C-V1~C-V8 涵蓋（dev stack 12 service + grep + manual `cargo test --ignored`）。US4 對 042-N1 12 個 ignored test 進行 helper migration、helper 本身內測由 C-V6 manual cargo test 覆蓋（test suite 跑通本身即驗證 helper 行為）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) 紀律「無新純函式測試時由 acceptance 覆蓋、明示理由」。

**Organization**：依 spec.md 5 user story（US4 = P1 MVP / US3 = P1 / US1 = P1 / US2 = P1 / US5 = P2）+ Polish 分 phase；US 之間獨立可任意順序、Phase 1 + 2 minimal（無 project init / 無 foundational blocker）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：T011/T012（同 045 data-model.md 不同區段）+ T014-T017（同 045 contracts/verification-commands.md 不同 C-V section）標 `[P]` 是「邏輯獨立、無 inter-task dependency」、**不是**「subagent 並行 dispatch」；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。跨檔 `[P]` 才真正並行。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**：本 feature 無新 workspace dep（test helper 用既有 `tokio::time::sleep` + `sea-orm`、metrics 044 已加）、無新 deploy/ config 檔。Phase 1 跳過、直接進 Foundational / US phase。

*(no tasks)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 feature 5 個 user story 互相獨立（touch 不同 file group / 不同 spec md / 不同 rust file）；無 cross-story blocking 設施。Phase 2 跳過、5 個 US phase 任意順序 / 並行可跑。

*(no tasks)*

**Checkpoint**：5 個 user story 全部 ready to start in parallel。

---

## Phase 3: User Story 4 — 042-N1 audit_pipeline test helper + 12 ignored test 改寫（Priority: P1）🎯 MVP

**Goal**：抽共用 helper `wait_for_audit_row` + `wait_for_audit_count`（closure-based、輪詢 sys_operation_log、500ms budget / 50ms interval）、4 個 test file 共 12 個 `#[ignore]` test 改用 helper、`#[ignore]` 註解改 `"requires dev stack drainer running"`。dev stack + `TEST_DATABASE_URL` 跑著時、`cargo test --test {audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration} -- --ignored` 應 12/12 PASS。

**Independent Test**：grep helper file 存在 + 2 fn signature 命中；4 test file 合計 ≥12 helper callsite；12 個 `#[ignore]` 註解全更新；manual `cargo test --ignored` 12/12 PASS（dev stack drainer 跑著前提下）。

### Implementation for User Story 4

- [ ] T001 [US4] 新檔 `rust-api/server/model/tests/common/audit_pipeline.rs` —— 暴 `pub async fn wait_for_audit_row<F, Fut>(find_fn: F, timeout_ms: u64) -> Result<sys_operation_log::Model, String>` + `pub async fn wait_for_audit_count<F, Fut>(count_fn: F, min_count: u64, timeout_ms: u64) -> Result<u64, String>` —— 完整 source per [data-model §E1.1](./data-model.md)。對應 FR-008、[research R-2](./research.md)。
- [ ] T002 [US4] `rust-api/server/model/tests/common/mod.rs` 加 `pub mod audit_pipeline;` 暴 helper 給其他 test file。Depends on T001。對應 FR-009 / [data-model §E1.2](./data-model.md)。
- [ ] T003 [P] [US4] `rust-api/server/model/tests/audit_basics.rs` 5 個 `#[ignore]` test：(a) 改用 `wait_for_audit_row` closure pattern（per [data-model §E1.3](./data-model.md)）取代既有 `sys_operation_log::Entity::find().one(&txn)` 直查 + assert pattern；(b) 5 處 `#[ignore = "requires real postgres + migration up"]` 全改 `#[ignore = "requires dev stack drainer running (audit outbox → sys_operation_log async pipeline)"]`。Depends on T001 + T002。對應 FR-010、[data-model §E4](./data-model.md)。
- [ ] T004 [P] [US4] `rust-api/server/model/tests/audit_http_middleware.rs` 2 個 `#[ignore]` test：同 T003 pattern；HTTP middleware test 多 row 場景可能用 `wait_for_audit_count` 變體（≥2 row）。Depends on T001 + T002。對應 FR-010。
- [ ] T005 [P] [US4] `rust-api/server/model/tests/audit_transaction_rollback.rs` 2 個 `#[ignore]` test：同 T003 pattern；驗 rollback 前後 audit row 數。Depends on T001 + T002。對應 FR-010。
- [ ] T006 [P] [US4] `rust-api/server/model/tests/soft_delete_audit_integration.rs` 3 個 `#[ignore]` test：同 T003 pattern；驗 soft-delete row + audit row 同 commit。Depends on T001 + T002。對應 FR-010。
- [ ] T007 [US4] C-V5 acceptance — grep helper file 存在 + signature + 4 file 合計 helper call ≥12 + `#[ignore]` 註解 ≥12 hit。per [contracts C-V5](./contracts/verification-commands.md)。對應 SC-005、FR-008/009/010。
- [ ] T008 [US4] C-V6 acceptance（manual）— dev stack drainer 跑著 + `TEST_DATABASE_URL` 設好、跑 `cargo test --test {audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration} -- --ignored --nocapture`、4 file 合計 12 test PASS、0 fail、平均 < 500ms budget。per [contracts C-V6](./contracts/verification-commands.md)。對應 SC-006、FR-008/010。

**Checkpoint**：US4 完成 —— audit + soft-delete integration test 復活、Constitution II reinforce、helper 可後續其他 test 復用。**MVP-worthy（最大 effort + value 的 US、test 復活為 verifiable quality gate）**。

---

## Phase 4: User Story 3 — 044-N1 sys_authorization_service.rs production println cleanup（Priority: P1）

**Goal**：`sys_authorization_service.rs:140/154/168` 3 處 `println!` 改 `tracing::debug!(?var, "assign_permission: <name>")` structured field、對齊 044 W-F12 fmt::json formatter、Loki ingest 為 valid JSON line。

**Independent Test**：grep `sys_authorization_service.rs`：0 production `println!`、≥3 `tracing::debug!`、3 個 structured field key (`?existing_permissions` / `?new_policies` / `?existing_policies`) 命中。

### Implementation for User Story 3

- [ ] T009 [US3] `rust-api/server/service/src/admin/sys_authorization_service.rs` lines 140/154/168 3 處 `println!("…: {:?}", var)` → `tracing::debug!(?var, "assign_permission: <name>")`：per [data-model §E3](./data-model.md) 完整 mapping table。對應 FR-007、[research R-4](./research.md)。
- [ ] T010 [US3] C-V4 acceptance — grep 0 `println!` + ≥3 `tracing::debug!` + 3 structured field key 命中；dev stack 跑 `assign_permission` 流程後 Loki query `{service="rust-api"} |= "assign_permission"` 全為 valid JSON line（manual verify）。per [contracts C-V4](./contracts/verification-commands.md)。對應 SC-004、FR-007。

**Checkpoint**：US3 完成 —— Loki ingestion 全 JSON、production observability 缺口補完。

---

## Phase 5: User Story 1 — 045-N2 (a)+(b) 045 data-model.md §E1.2 兩處 erratum（Priority: P1）

**Goal**：`specs/045-facade-atomicity-pass/data-model.md §E1.2` line 56 whole-Model `==` 改 semantic compare 描述 + line 114 tracing target macro 改 structured field 形式；對齊 045 落地時實 code 修正（commit `de7bc0b` / `8e79e20`）。

**Independent Test**：grep 045 data-model.md：`before_row == endpoint` + `target: target` 雙 0 hit；`same_business` / `6 業務欄位` + `preserve.*created_at` + `target = target` 三 ≥1 hit。

### Implementation for User Story 1

- [ ] T011 [P] [US1] `specs/045-facade-atomicity-pass/data-model.md` line 56 區段 改寫 whole-Model `if before_row == endpoint { ... }` 為 `same_business(path, method, action, resource, controller, summary)` 6 業務欄位 semantic compare 描述 + UPDATE 路徑明示 preserve `before_row.created_at` + `before_row.display_id` + 1-2 行 rationale（caller `router_initialization.rs:419,426` 每啟動 regen `display_id` + `created_at` 使 whole-Model `==` 永遠 false）。per [data-model §E2.1](./data-model.md)。對應 FR-001、[research R-1.1](./research.md)。
- [ ] T012 [P] [US1] `specs/045-facade-atomicity-pass/data-model.md` line 114 區段 改寫 `tracing::warn!(target: target, ...)` 為 `tracing::warn!(target = target, ...)` structured field 形式 + 1-2 行 rationale（E0435 / `target:` 需 `&'static str` const、structured field 序列化 `target=…` 仍命中 C-V grep）。per [data-model §E2.1](./data-model.md)。對應 FR-002、[research R-1.2](./research.md)。
- [ ] T013 [US1] C-V2 acceptance — grep `before_row == endpoint` 0 hit + `target: target` 0 hit + `same_business` ≥1 + `preserve.*created_at` ≥1 + `target = target` ≥1。per [contracts C-V2](./contracts/verification-commands.md)。對應 SC-002、FR-001/002。

**Checkpoint**：US1 完成 —— 045 data-model spec docs 對齊實 code、未來 implementer 不再誤導。

---

## Phase 6: User Story 2 — 045-N2 (c)+(d)+(e) 045 contracts/verification-commands.md 5 處對齊（Priority: P1）

**Goal**：`specs/045-facade-atomicity-pass/contracts/verification-commands.md` C-V2 schema column + C-V4-V6 endpoint path + C-V8/V9 addUser body + C-V10 updateUser HTTP verb 共 5 sub-erratum 全改、對齊 045 acceptance 階段實機驗 code 路徑。

**Independent Test**：grep 045 contracts/verification-commands.md：5 個 stale pattern 全 0 hit、5 個對齊 pattern 全命中（per [contracts C-V3](./contracts/verification-commands.md) 完整 grep matrix）。

### Implementation for User Story 2

- [ ] T014 [P] [US2] `specs/045-facade-atomicity-pass/contracts/verification-commands.md` lines 58 + 271 SQL query 改 `entity_type='sys_endpoint'/'sys_user'` → `module_name='sys_endpoint'/'sys_user'`；`operation IN ('Insert','Update')` → `operation IN ('INSERT','UPDATE')`。per [data-model §E2.2 sub 2a](./data-model.md)、[research R-1.3](./research.md)。對應 FR-003。
- [ ] T015 [P] [US2] 同檔 lines 108, 126, 136, 172, 174 endpoint path `/api/accessKey` → `/api/access-key`（5 處）；create body 加 `"domain":"dev"` 欄。per [data-model §E2.2 sub 2b](./data-model.md)、[research R-1.4](./research.md)。對應 FR-004。
- [ ] T016 [P] [US2] 同檔 lines 225 (C-V8 happy) + 261 (C-V9 negative) addUser body shape：`username` → `userName`、`status:"enabled"` → `status:"1"`、`userRoles:[$ROLE_DID]` → `userRoles:["ROLE_SUPER"]` (happy) / `userRoles:["BOGUS_ROLE_NO_EXIST"]` (negative)。注意 psql query line 229, 246 `WHERE username='cv8user'` 保持不動（DB column 確實為 `username`）。per [data-model §E2.2 sub 2c](./data-model.md)、[research R-1.5](./research.md)。對應 FR-005。
- [ ] T017 [P] [US2] 同檔 lines 295 + 301 updateUser HTTP verb `PUT` → `POST`、URL `/systemManage/updateUser/$USER_DID` → `/systemManage/updateUser`（無 path param）、body 加 `"id":$USER_DID` + status/userRoles 同 T016 cascade。per [data-model §E2.2 sub 2d](./data-model.md)、[research R-1.6](./research.md)。對應 FR-006。
- [ ] T018 [US2] C-V3 acceptance — grep 5 個 stale pattern 全 0 hit + 5 個對齊 pattern 全命中（detail per [contracts C-V3](./contracts/verification-commands.md)）。per [contracts C-V3](./contracts/verification-commands.md)。對應 SC-003、FR-003/004/005/006。

**Checkpoint**：US2 完成 —— 045 contracts 全對齊實 code、未來跑 C-V 命令一次成功。

---

## Phase 7: User Story 5 — docker-compose footer comment trivial（Priority: P2）

**Goal**：`docker-compose.yml` 檔頭註解擴寫：主 stack 8 service 明示 + observability.yml overlay 加 7 service = dev 12 service 合計。

**Independent Test**：grep `docker-compose.yml`：`# 8 service stack` 0 hit、`主 stack 8` / `12 service` / `observability.yml` ≥2 hit。

### Implementation for User Story 5

- [ ] T019 [US5] `docker-compose.yml` line 4 區段 改寫註解 + 加 1 line：明示「主 stack 8 service + docker-compose.observability.yml 加 7 service = dev 12 service」。per [data-model §E5](./data-model.md)、[research R-5](./research.md)。對應 FR-011。
- [ ] T020 [US5] C-V7 acceptance — grep `^# 8 service stack` 0 hit + `主 stack 8|12 service|observability.yml` ≥2 hit。per [contracts C-V7](./contracts/verification-commands.md)。對應 SC-007、FR-011。

**Checkpoint**：US5 完成 —— docker-compose footer 對齊 044 後 reality。

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**：INTEGRATION-CHECKLIST cleanup（FR-014）+ docker rebuild + acceptance 全綠 verify + 多段式 commit + merge + SHA backfill。

- [ ] T021 改 `docs/INTEGRATION-CHECKLIST.md`：衍生 follow-up table 移除 3 row（045-N2 / 044-N1 / 042-N1）。對應 FR-014、SC-009、[quickstart Step 6.1](./quickstart.md)。
- [ ] T022 改 `docs/INTEGRATION-CHECKLIST.md`：已完成里程碑加 046 entry（按 045 體例：日期 + outer/merge SHA placeholder + spec link + 一段描述含 5 US + 軌道外 rust-api + outer + spec md + base-web 0 改動）。對應 FR-014、SC-009、[quickstart Step 6.2](./quickstart.md)。
- [ ] T023 改 `docs/INTEGRATION-CHECKLIST.md`：Current Focus 「下一步」改指向「047 sandbox-protect-route-fix (045-N1) 或 base-web TS id 型別債 cleanup sprint 或其他 follow-up backlog（042-N4 / 042-N5 / W-F15/16）」。對應 FR-014、SC-009、[quickstart Step 6.3](./quickstart.md)。
- [ ] T024 改 `CLAUDE.md` SPECKIT marker → `Active Spec: —`、`Phase: idle`、下一步指向 047 / base-web sprint。對應 [quickstart Step 6](./quickstart.md)。
- [ ] T025 C-V8 acceptance — `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up 3 row 全移、046 entry ≥1 hit、`047 sandbox-protect-route-fix` 下一步提及 ≥1 hit。per [contracts C-V8](./contracts/verification-commands.md)。對應 SC-009、FR-014。
- [ ] T026 [P] docker build rust-api image + dev stack restart rust-api + 12 service healthy verify — `docker build -t rust-api:rev1-admin-rust-api ./rust-api`（~5-15min；incremental build 更快、因本 feature US3 + US4 改動量 small）→ `$PC up -d --force-recreate --no-deps rust-api && sleep 12` → `$PC ps --format "table {{.Service}}\t{{.Status}}"` 全 healthy。對應 SC-001、[quickstart Step 5](./quickstart.md)。
- [ ] T027 [P] 完整 C-V1~C-V8 跑 acceptance — 依 [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重 build + 重跑、全 PASS 才進下一 task。對應 SC-001~009。
- [ ] T028 C-V8 boundary verify — `git diff --stat base-web/` 0 行（FR-012 / SC-008） + `find rust-api/migration/src/ -newer specs/046-spec-hygiene-pass-3/spec.md -name "*.rs"` 0 hit（FR-013 / SC-008 0 schema migration） + `find rust-api/server/model/src/admin/entities/ -newer ...spec.md -name "sys_*.rs"` 0 hit（FR-013 0 新 entity） + `git diff rust-api/Cargo.toml` 0 line change in `[workspace.dependencies]`（FR-013 0 新 workspace dep）。per [contracts C-V8](./contracts/verification-commands.md)。對應 SC-008、FR-012/013。
- [ ] T029 rust-api worktree 多段 commit — 進 `rust-api/` worktree、依 [quickstart Step 7.1](./quickstart.md) 拆 2 個 logical commit（US3 println cleanup / US4 helper + 12 test 改 closure pattern）；可選擇拆 US4 為「helper-add」+「callsite-migrate」2 commit（bisect 友好）；push origin rev1-admin-rust-api **須 user 同意**。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T030 outer feature branch commit — 依 [quickstart Step 7.2](./quickstart.md) 拆多 commit（US1 045 data-model / US2 045 contracts / US5 docker-compose / rust-api SHA pin bump / INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker）；push origin 046-spec-hygiene-pass-3 **須 user 同意**。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T031 git merge 046 → rev1-admin-root — **user 同意才執行**：`git checkout rev1-admin-root && git merge --no-ff 046-spec-hygiene-pass-3 -m "Merge feature 046-spec-hygiene-pass-3"`；merge 後 push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T032 backfill outer/merge/rust-api SHA + push — merge 後拿 outer SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 046 entry 的 `<SHA>` placeholder、small chore commit（per 041/042/043/044/045 體例）+ push **須 user 同意**。對應 SC-009。

**Checkpoint**：046 整 feature 落地、acceptance 全綠、backlog 已 cleanup、boundary verify PASS、merge 回 default、3 N item 全結案。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (skipped — no project init needed)
Phase 2 Foundational (skipped — 5 US 互相獨立)
   │
   ├─→ US4 042-N1 helper + 12 test (T001-T008、P1 MVP、可平行 US1/US2/US3/US5)
   │
   ├─→ US3 044-N1 println cleanup (T009-T010、P1、可平行 US1/US2/US4/US5)
   │
   ├─→ US1 045-N2 (a)+(b) data-model erratum (T011-T013、P1、可平行 US2/US3/US4/US5)
   │
   ├─→ US2 045-N2 (c)+(d)+(e) contracts erratum (T014-T018、P1、可平行 US1/US3/US4/US5)
   │
   └─→ US5 docker-compose footer (T019-T020、P2、可平行 US1/US2/US3/US4)
                                                  │
Phase 8 Polish (T021-T032、INTEGRATION-CHECKLIST + verify + commit + merge + backfill) ──┘
```

5 個 user story 完全獨立可任意順序 / 平行；Polish phase 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (US4 helper file) | — |
| T002 (US4 mod.rs export) | T001 |
| T003-T006 (US4 4 test file 改寫) | T001 + T002（all parallel between 4 files）|
| T007-T008 (US4 acceptance) | T001-T006 + rebuild（Phase 8 T026）|
| T009 (US3 println cleanup) | — (parallel) |
| T010 (US3 acceptance) | T009 + rebuild |
| T011 (US1 data-model 1a) | — (parallel) |
| T012 (US1 data-model 1b) | — (parallel)（與 T011 同檔但不同 line / 不同區段、可並行 edit） |
| T013 (US1 acceptance) | T011 + T012 |
| T014 (US2 contracts 2a) | — (parallel) |
| T015 (US2 contracts 2b) | — (parallel) |
| T016 (US2 contracts 2c) | — (parallel) |
| T017 (US2 contracts 2d) | — (parallel) |
| T018 (US2 acceptance) | T014 + T015 + T016 + T017 |
| T019 (US5 docker-compose) | — (parallel) |
| T020 (US5 acceptance) | T019 |
| T021-T024 (Polish docs) | T001-T020 全完 |
| T025 (Polish docs acceptance) | T021-T024 |
| T026-T027 (Polish rebuild + acceptance) | T021-T025 |
| T028 (Polish boundary verify) | T021-T025 |
| T029-T032 (Polish commit/merge/backfill) | T026-T028 全 PASS（**user 同意 push / merge**）|

---

## Implementation Strategy（per quickstart Step 1-7 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 3 US4 P1 MVP**（T001-T008、最大 effort）：
- T001 helper file 先（基礎依賴）
- T002 mod.rs export（單行、串行於 T001）
- T003-T006 四 test file parallel（同 helper / 不同檔、可並行 subagent）
- T007-T008 acceptance 留 Phase 8 docker rebuild 後

→ 約 30-45 分鐘 implementer 階段；acceptance defer。

**Batch 2 — Phase 4-6 US3+US1+US2 跨 US 並行**（T009 + T011-T017）：
- T009 US3 (sys_authorization_service.rs 3 line) — 獨立
- T011+T012 US1 (data-model.md 兩區段) — 同檔不同 line、可並行 edit
- T014-T017 US2 (contracts/verification-commands.md 4 處區段) — 同檔但不同 C-V section、可並行 edit
- 加總 ~9-10 處 edit 跨 3 個 spec md / 1 個 rust file
- acceptance 留 Phase 8

→ 約 15-25 分鐘（同檔 edit 衝突風險低、subagent dispatch 時注意 sequential per file）。

**Batch 3 — Phase 7 US5 trivial**（T019）：
- 1 line / 2 line 編輯
- acceptance 留 Phase 8

→ 約 5 分鐘。

**Batch 4 — Phase 8 Polish**（T021-T032）：
- T021-T024 串行（INTEGRATION-CHECKLIST 3 改 + CLAUDE.md SPECKIT marker）
- T025 acceptance docs
- T026 docker build（~5-10min incremental）
- T027 跑 C-V1~C-V8 acceptance（含 US3/US4/US1/US2/US5 deferred acceptance 整批 confirm）+ manual `cargo test --ignored` 12/12 verify
- T028 boundary verify 並行 T027
- T029-T032 串行 commit + merge + backfill + push（user 同意關卡）

→ 約 1-1.5 hr、含 user 同意等待。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-1（US4 only）**：完 Phase 3 + 部分 Polish。**僅交 042-N1 audit_pipeline helper + 12 test 復活**（最大 value、Constitution II reinforce）。其他 4 US 留後。
- **MVP-2（US4 + US3）**：+ Phase 4。可 deliver 兩個 P1 rust-api side cleanup（test 復活 + println 修）。
- **Full feature（US1-US5 + Polish）**：依 Batch 1-4 完整跑（推薦、bundled cleanup pass、3 N item 一次清完）。

User 偏好：Full feature 一次到位（per brainstorm 7 section 拍板「Approach A 5 US bundle」）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 5 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~015 + SC-001~009）→ ② code quality（spec md 內容品質、rust code 品質、helper signature 正確、Constitution 紀律、tracing structured field 對齊）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、cargo test PASS count、commit SHA）。

**Phase 8 Polish** 必須在 US1-US5 全部 PASS 後執行（含 user 同意 push / merge / backfill 三個關卡）。

**Implementer-stage Expansion ≤3 處**（per [research R-6](./research.md)）：plan 階段 0 主動拾、留 subagent grep 確認；user 確認後拾取；超限拒絕並登 047+ follow-up。

---

## Summary

- **Total tasks**: 32
- **By phase**: Setup 0 / Foundational 0 / US4 8 / US3 2 / US1 3 / US2 5 / US5 2 / Polish 12
- **By user story**: US4 = 8 / US3 = 2 / US1 = 3 / US2 = 5 / US5 = 2（共 20 user story tasks）+ Polish 12
- **Parallel opportunities**：
  - 5 user story 完全獨立、Phase 3-7 全部 subagent parallel-friendly
  - US4 內部 T003-T006 4 test file 並行
  - US1 內部 T011/T012 同檔不同區段並行
  - US2 內部 T014-T017 同檔不同 C-V section 並行
  - Phase 8 T026/T027/T028 並行
- **Independent test criteria**: 每個 US 對應 C-V1~C-V8 中 1-2 條（per spec.md SC-001~009）
- **Suggested MVP scope**: US4 042-N1 only（P1 MVP per spec-kit framework）；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 32 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
