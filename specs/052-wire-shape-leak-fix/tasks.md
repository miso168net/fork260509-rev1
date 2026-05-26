---
description: "Task list for 052 wire-shape-leak-fix"
---

# Tasks: 052 wire-shape-leak-fix

**Input**: Design documents from `/specs/052-wire-shape-leak-fix/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 sprint 為 wire shape 對齊 impl fix、wiring/shape feature 無新純函式邏輯、**無新 unit test**（per spec.md FR-001~007 wire shape 由 acceptance C-V2~C-V5 curl + jq + Python shape inspect 定性證明 + C-V6 CDP smoke regression；對齊 051 / 050 / 049 / 046 spec-hygiene-pass + 047 sandbox-fix 既有 acceptance-only via C-V matrix 體例）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。

**Organization**：spec.md 1 user story（US1 = 4 endpoint wire shape wrap bundled、軌道外 feature、無 cross-story dependency）+ Setup（baseline check）+ Polish（outer SHA pin / INTEGRATION-CHECKLIST + SPECKIT / acceptance / push / merge / backfill）。Phase 2 Foundational 跳過（單 US 單 bundled commit、無共用 foundational 設施）。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：US1 內 rust-api 8 file 改 bundled 同 commit；不同 file 邏輯並行（[P]）、同 file 序列；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。

---

## Phase 1: Setup (Baseline verification)

**Purpose**：確認 dev stack baseline 健康 + rust-api worktree 在 051 baseline (含 v4/v5 follow-up fix 6d64190)、為 sprint 後續 verify 提供基準。

- [ ] T001 確認 dev stack baseline 健康 + worktree HEAD：`export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"`、`$PCO ps --format "table {{.Service}}\t{{.Status}}"`、expect 13 service Up（含 pushgateway 從 050 落地）；`cd rust-api && git log --oneline -1` expect `6d64190` 或更新 HEAD；`cd base-web && git log --oneline -1` expect `64af823b`（051 落地後 baseline、本 sprint 0 改動）。對應 SC-001 baseline、per [contracts C-V1](./contracts/verification-commands.md)。

**Checkpoint**：baseline confirmed、可進入 Phase 3 US1 rust-api impl。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 sprint 1 user story 為單 bundled commit、無跨 story 共用 foundational 設施（rust-api 8 file 改動為單一 logical unit）。Phase 2 跳過。

*(no tasks)*

---

## Phase 3: User Story 1 — 4 endpoint wire shape leak fix（Priority: P1）🎯 MVP

**Goal**：4 endpoint raw entity Model wire shape leak 補齊（接 040 W-FW9 D 體例）—— (a) GET `/org` / (d) GET `/endpoint/page` 新加 `OrganizationDetail` / `EndpointDetail` sibling Detail DTO + handler manual PaginatedData reconstruction wrap；(b) `addRole` / (c) `updateRole` handler return 改既成 `SystemManageRoleOutput` + `.map(SystemManageRoleOutput::from)`；output/mod.rs 加 2 selective re-export 行；service/admin/mod.rs 既 `output::*` wildcard 自動暴露、0 改動；wire `id` = i64 number、無 ULID 重複欄、無 `deletedAt` 外洩；C-V1~C-V7 全 PASS。

**Independent Test**：(a) curl `GET /org?current=1&size=10` → response `data.records[].id` typeof number、shape 嚴格對齊 OrganizationDetail 10 欄；(b) curl `POST /systemManage/addRole` → response `data` shape 嚴格 SystemManageRoleOutput 9 欄；(c) curl `POST /systemManage/updateRole` → 同 (b)；(d) curl `GET /endpoint/page` → response `data.records[].id` typeof number、shape 嚴格 EndpointDetail 9 欄；(e) base-web role-list CDP smoke：新增 + 編輯 modal regression PASS（防 040 critical bug 重演）。

### Phase 3a: Spike + rust-api impl

- [ ] T002 [US1] Phase 0 spike (~20 min)：(a) `cat rust-api/server/model/src/admin/output/sys_role.rs | head -50` 確認 040 D1 RoleDetail pattern；(b) `cat rust-api/server/model/src/admin/output/mod.rs` 確認 `mod sys_*;` + selective `pub use` 體例；(c) `grep -A 10 "pub struct PaginatedData" rust-api/server/core/src/web/page.rs` 確認無 `.map` method；(d) `grep -A 15 "impl From<sys_role::Model> for SystemManageRoleOutput"` 確認既有 From impl；(e) `head -10 rust-api/server/model/src/admin/output/sys_endpoint.rs` 確認 EndpointTree 既有檔；per [research R-1 ~ R-4](./research.md)。Spike 結果不對應 commit、屬 implementer prep 確認可行性。Depends on T001。
- [ ] T003 [P] [US1] 新加 `rust-api/server/model/src/admin/output/sys_organization.rs`（**新檔**）：完整 file content per [data-model E1.1](./data-model.md)；含 imports `use chrono::NaiveDateTime;` + `use serde::Serialize;` + `use crate::admin::entities::{sea_orm_active_enums::Status, sys_organization};` + `pub struct OrganizationDetail` 10 欄位 + `impl From<sys_organization::Model> for OrganizationDetail`；對齊 040 D1 RoleDetail sibling pattern。對應 FR-005。Depends on T002。
- [ ] T004 [P] [US1] 擴 `rust-api/server/model/src/admin/output/sys_endpoint.rs`（**既有檔**）加 EndpointDetail：imports 加 `use chrono::NaiveDateTime;` + `use crate::admin::entities::sys_endpoint;`；既有檔尾端追加 `pub struct EndpointDetail` 9 欄位（不含 createdBy/updatedBy — Model 本身無）+ `impl From<sys_endpoint::Model> for EndpointDetail`；per [data-model E2](./data-model.md)。對應 FR-006。Depends on T002。
- [ ] T005 [US1] 改 `rust-api/server/model/src/admin/output/mod.rs`：(a) 改 `pub use sys_endpoint::{EndpointTree, EndpointTreeNode};` 行加 `EndpointDetail`、變 `pub use sys_endpoint::{EndpointDetail, EndpointTree, EndpointTreeNode};`；(b) 加 `pub use sys_organization::OrganizationDetail;`（pub use list 按字母順排）+ 加 `mod sys_organization;`（mod list 按字母順排在 sys_menu 後 sys_role 前）；per [data-model E3.2](./data-model.md)。對應 FR-007。Depends on T003 + T004。
- [ ] T006 [P] [US1] 改 `rust-api/server/api/src/admin/sys_organization_api.rs:12` `get_paginated_organizations`：imports 加 `OrganizationDetail`；return type 從 `Res<PaginatedData<SysOrganizationModel>>` 改為 `Res<PaginatedData<OrganizationDetail>>`；handler body 加 manual PaginatedData reconstruction `.map(|page| PaginatedData { current: page.current, size: page.size, total: page.total, records: page.records.into_iter().map(OrganizationDetail::from).collect() })`；per [data-model E5](./data-model.md)。對應 FR-001。Depends on T005。
- [ ] T007 [P] [US1] 改 `rust-api/server/api/src/admin/sys_endpoint_api.rs:16` `get_paginated_endpoints`：同 T006 pattern、改 `EndpointDetail`；per [data-model E6](./data-model.md)。對應 FR-004。Depends on T005。
- [ ] T008 [US1] 改 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 2 handler（**序列化 edit**、同檔 2 處改動）：(a) `add_role_for_systemmanage` line 285：return type `Res<SysRoleModel>` → `Res<SystemManageRoleOutput>` + 加 `.map(SystemManageRoleOutput::from)` 對 `service.create_role` 結果；(b) `update_role_for_systemmanage` line 305：return type 同上改、加 `.map(SystemManageRoleOutput::from)` 對 `service.update_role` 結果；imports 確認 `SystemManageRoleOutput` 已 in-scope（同 file 內其他 handler 已用）；per [data-model E7 + E8](./data-model.md)。對應 FR-002 + FR-003。Depends on T005。
- [ ] T009 [US1] 本機 `cargo check` + clippy (rust-api、via docker temp container)：`docker run --rm -v "$PWD/rust-api:/work" -w /work rust:1.86-slim-bookworm cargo check 2>&1 | tail -5` 預設 profile 0 error；可選 clippy（per memory `reference_cargo_check_pitfalls.md`：需先 `rustup component add clippy`、`--all-features` 因 casbin 上游 dep 衝突會 fail、預設 profile PASS 即可；pre-existing strict-mode warnings 在 untouched files 不算）。Depends on T003 + T004 + T005 + T006 + T007 + T008。對應 build sanity。
- [ ] T010 [US1] rust-api worktree commit 1（bundled 6 file、單 commit）：`cd rust-api && git add server/model/src/admin/output/sys_organization.rs server/model/src/admin/output/sys_endpoint.rs server/model/src/admin/output/mod.rs server/api/src/admin/sys_organization_api.rs server/api/src/admin/sys_endpoint_api.rs server/api/src/admin/sys_system_manage_api.rs && git commit`。commit message 對齊 [quickstart Step 1.7](./quickstart.md) 範本（fix(rust-api) 標 052 + 039-R1 結案 + 4 endpoint wire DTO + acceptance reference）。Depends on T009。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T011 [US1] push rust-api origin **（須 user 同意）**：`cd rust-api && git push origin rev1-admin-rust-api`。Depends on T010。對應 [CLAUDE.md §5](../../CLAUDE.md)。

### Phase 3b: Docker rebuild + restart + impl-side acceptance

- [ ] T012 [US1] docker rebuild rust-api image + restart：`docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3` + `$PCO up -d --force-recreate --no-deps rust-api` + 等 healthy（`until $PCO ps ... | grep -q "rust-api.*(healthy)"; do sleep 3; done`）。Depends on T010（rust-api commit、技術 dep）；practically queue after T011 push (user gate)、避免 push 撤後 rebuild 廢工。對應 SC-001 baseline、per [contracts C-V1](./contracts/verification-commands.md)。
- [ ] T013 [US1] C-V2 GET /org wire shape verify（FR-001 / FR-005）：跑 [contracts C-V2 script](./contracts/verification-commands.md)；curl Soybean 帶 `current=1&size=10` + Python shape inspect：`data.records[0].id` typeof int、無 `deletedAt`、10 欄嚴格對齊 OrganizationDetail (id/pid/code/name/description/status/createdAt/createdBy/updatedAt/updatedBy)。Depends on T012。對應 SC-002、per [contracts C-V2](./contracts/verification-commands.md)。
- [ ] T014 [P] [US1] C-V3 POST /systemManage/addRole wire shape verify（FR-002）：跑 [contracts C-V3 script](./contracts/verification-commands.md)；curl `POST /systemManage/addRole` 建測試 role（roleName=CV3_R1）→ Python shape inspect：`data.id` typeof int、9 欄嚴格對齊 SystemManageRoleOutput (id/roleName/roleCode/roleDesc/status/createdAt/createdBy/updatedAt/updatedBy)、無 raw `SysRoleModel` 欄位（如 `pid`/`description`/`homeRouteName`）；cleanup test role。Depends on T012。對應 SC-003、per [contracts C-V3](./contracts/verification-commands.md)。
- [ ] T015 [P] [US1] C-V4 POST /systemManage/updateRole wire shape verify（FR-003）：跑 [contracts C-V4 script](./contracts/verification-commands.md)；先 addRole 建 R_CV4_R1 取 display_id → curl `updateRole` 改 roleName → shape 同 C-V3 + `id` 對應原 display_id + roleName 為 edited 值；cleanup。Depends on T012。對應 SC-004、per [contracts C-V4](./contracts/verification-commands.md)。
- [ ] T016 [P] [US1] C-V5 GET /endpoint/page wire shape verify（FR-004 / FR-006）：跑 [contracts C-V5 script](./contracts/verification-commands.md)；curl + Python shape inspect：`data.records[0].id` typeof int、無 `deletedAt`、9 欄嚴格對齊 EndpointDetail（id/path/method/action/resource/controller/summary/createdAt/updatedAt）、**無** createdBy/updatedBy（Model 本身就無、本 sprint 不擴）。Depends on T012。對應 SC-005、per [contracts C-V5](./contracts/verification-commands.md)。
- [ ] T017 [US1] **C-V6 ⭐ base-web role-list CDP smoke**（FR-008、本 sprint 最關鍵 regression acceptance）：(a) 啟 Edge `--remote-debugging-port=9229`；(b) CDP smoke 跑「登入 Soybean → 開角色管理頁 → 新增角色 modal (CV6_R1) → 確認 → list 含新 row → 編輯 modal → 改名 CV6_R1_EDITED → 確認 → toast 『修改成功』」14 步流程（per [contracts C-V6 script](./contracts/verification-commands.md) + memory `reference_cdp_smoke_technique.md` 既有 037/038 CDP smoke 體例）；(c) cleanup test role。Fallback：若 CDP setup 失敗（pre-existing infra issue）→ 登 follow-up C-V6-N1、acceptance 走 C-V2~C-V5 + C-V7 結案、不本 sprint 修 infra（per quickstart Step 2.2 fallback）。Depends on T012。對應 SC-006、per [contracts C-V6](./contracts/verification-commands.md)。

**Checkpoint**：US1 Phase 3a + 3b 完成 —— rust-api worktree commit + push + docker rebuild + impl-side acceptance C-V2~C-V6 全 PASS；C-V6 CDP smoke ⭐ 為 base-web 0 改動 regression 確認；待 Phase 5 SHA pin + INTEGRATION-CHECKLIST + 最終 C-V7 boundary verify 結案。**MVP 達成**（4 endpoint wire shape leak 全收斂、本 sprint 唯一交付）。

---

## Phase 4: Foundational （N/A）

*(同 Phase 2、跳過)*

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：outer SHA pin（rust-api 1 個 gitlink bump）+ INTEGRATION-CHECKLIST cleanup（039-R1 結案 + 052 milestone + Current Focus + SPECKIT idle）+ acceptance C-V7 boundary verify + push outer feature branch + merge + SHA backfill。

- [ ] T018 outer commit 1 — rust-api SHA pin bump：`RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)`、`git add rust-api`、`git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 052 wire-shape-leak-fix (039-R1 結案)"`。per [quickstart Step 3.1](./quickstart.md)。Depends on T011 完成。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T019 outer commit 2 — INTEGRATION-CHECKLIST cleanup + 052 milestone + SPECKIT marker idle：(a) 衍生 follow-up table 移除 039-R1 row；(b) 加 footnote「039-R1 結案 via 052」；(c) 已完成里程碑加 052 entry（SHA placeholder）；(d) Current Focus「現狀」加 052 + 「下一步」3 段更新（**Critical dedicated sprint backlog 全清**、剩條件觸發 + 長期）；(e) CLAUDE.md SPECKIT marker idle。`git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md && git commit`。per [data-model §E9](./data-model.md) + [quickstart Step 3.2](./quickstart.md)。Depends on T018。對應 FR-010、SC-008。
- [ ] T020 C-V7 boundary verify（FR-008、scope discipline）：跑 [contracts C-V7 script](./contracts/verification-commands.md)；(a) `grep -rn "Res<SysRoleModel>\|Res<PaginatedData<SysOrganizationModel>>\|Res<PaginatedData<SysEndpointModel>>" rust-api/server/api/` 0 hit；(b) `cd rust-api && git diff --name-only origin/rev1-admin-rust-api~1 HEAD -- migration/` 0 line；(c) base-web 0 改動 `cd base-web && git log --oneline -1` HEAD = 64af823b；(d) `git diff origin/rev1-admin-root..HEAD .specify/memory/constitution.md` 0 line；(e) rust-api Cargo.toml 0 diff；(f) audit_log.rs 0 diff；(g) Sea-ORM Model 0 diff (`server/model/src/admin/entities/*.rs` 0 line)。Depends on T018。對應 SC-007、per [contracts C-V7](./contracts/verification-commands.md)。
- [ ] T021 Final acceptance summary + git status clean：跑全 C-V1~C-V7 final run + `git status --short` clean + outer commit chain `git log --oneline 55b5daf..HEAD` 含預期 commits + rust-api 1 commit (從 6d64190 算起) + base-web 0 commit。Depends on T019 + T020 + T013 + T014 + T015 + T016 + T017。對應 SC-001~009 全 PASS、SC-009 Constitution Check 5/5 maintain。
- [ ] T022 push origin outer 052 feature branch **（須 user 同意）**：`git push origin 052-wire-shape-leak-fix`。Depends on T021 完成 + T011 完成（worktree 必須先 push、避免 outer gitlink SHA 引用 unpushed commit）。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T023 merge 052 → rev1-admin-root **（須 user 同意執行）**：`git checkout rev1-admin-root && git pull --ff-only origin rev1-admin-root && git merge --no-ff 052-wire-shape-leak-fix -m "Merge feature 052-wire-shape-leak-fix"`；push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)、[quickstart Step 5](./quickstart.md)。
- [ ] T024 backfill outer/merge/rust-api SHA + push **（須 user 同意）**：merge 後拿 3 SHA、回填進 1 處 placeholder：`docs/INTEGRATION-CHECKLIST.md` 052 entry 的 3 SHA placeholder（outer + merge + rust-api）；small chore commit（per 051 體例）+ push **須 user 同意**。對應 SC-008、[quickstart Step 6](./quickstart.md)。

**Checkpoint**：052 整 feature 落地、acceptance C-V1~C-V7 全綠、039-R1 ⚠️ Critical 結案、wire surface 紀律完整、052 milestone entry 加、**Critical dedicated sprint backlog 全清**、剩條件觸發 + 長期 follow-up。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001 — baseline check)
   │
Phase 2 Foundational (skipped — 1 US 單 bundled commit、無共用 foundational)
   │
   └─→ US1 wire shape leak fix
         │
         ├─ Phase 3a rust-api impl (T002 spike → T003 + T004 [P] new/extend output DTO → T005 mod.rs wire → T006/T007/T008 [P] 4 handler → T009 cargo check → T010 rust-api commit → T011 push)
         ├─ Phase 3b docker + acceptance (T012 docker rebuild + restart → T013 C-V2 + T014/T015/T016 [P] C-V3/V4/V5 → T017 C-V6 CDP smoke ⭐)
         │
         └─→ Phase 5 Polish (T018-T024、SHA pin + INTEGRATION-CHECKLIST + final acceptance + push + merge + backfill)
```

US1 為 P1 MVP 唯一 user story（wire shape leak fix bundled、軌道外 feature、無 cross-story dependency）；Phase 5 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (baseline check) | — |
| T002 (spike) | T001 |
| T003 (new sys_organization.rs) | T002 |
| T004 (extend sys_endpoint.rs) | T002 |
| T005 (output/mod.rs wire) | T003 + T004 |
| T006 (sys_organization_api.rs handler) | T005 |
| T007 (sys_endpoint_api.rs handler) | T005 |
| T008 (sys_system_manage_api.rs 2 handler) | T005 |
| T009 (cargo check + clippy) | T003 + T004 + T005 + T006 + T007 + T008 |
| T010 (rust-api commit) | T009 |
| T011 (push rust-api、user 同意) | T010、**user 同意** |
| T012 (docker rebuild + restart) | T010（技術 dep）；practically queue after T011 (user gate) |
| T013 (C-V2 GET /org) | T012 |
| T014 (C-V3 POST addRole) | T012 |
| T015 (C-V4 POST updateRole) | T012 |
| T016 (C-V5 GET /endpoint/page) | T012 |
| T017 (C-V6 ⭐ CDP smoke) | T012 |
| T018 (outer commit 1 SHA pin) | T011 完成 |
| T019 (outer commit 2 INTEGRATION-CHECKLIST + SPECKIT) | T018 |
| T020 (C-V7 boundary verify) | T018 |
| T021 (Final acceptance summary) | T019 + T020 + T013 + T014 + T015 + T016 + T017 |
| T022 (push outer feature branch、user 同意) | T021 完成 + T011、**user 同意** |
| T023 (merge + push rev1-admin-root) | T022 全 PASS、**user 同意** |
| T024 (SHA backfill + push) | T023、**user 同意** |

---

## Implementation Strategy（per quickstart Step 1-6 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 Setup（T001、~5 min）**：
- T001 baseline check

→ 約 5 min；baseline confirmed。

**Batch 2 — Phase 3a rust-api impl（T002-T011、~50 min）**：
- T002 spike（~10 min、read-only sanity）
- T003 + T004 [P logical] new + extend output DTO（~15 min）
- T005 output/mod.rs wire（~5 min）
- T006 + T007 + T008 [P logical] 4 handler 改寫（~10 min、跨 3 file）
- T009 cargo check + clippy（~5 min、含 docker temp container start time）
- T010 rust-api commit（~3 min）
- T011 push rust-api（user 同意）（~2 min）

→ 約 50 min；MVP rust-api 部分達成。

**Batch 3 — Phase 3b docker rebuild + restart + impl-side acceptance（T012-T017、~50 min）**：
- T012 docker rebuild + restart（~15 min、docker build 為主要時間）
- T013 C-V2 GET /org（~5 min）
- T014 + T015 + T016 [P] C-V3/V4/V5（~10 min、可平行跑、不同 test role）
- T017 **C-V6 ⭐ CDP smoke**（~20 min、含 CDP setup + Edge 啟動 + 14 步流程）

→ 約 50 min；US1 整 PASS、待 Phase 5 final acceptance + 結案。

**Batch 4 — Phase 5 outer SHA pin + INTEGRATION-CHECKLIST cleanup + final acceptance（T018-T021、~25 min）**：
- T018 outer SHA pin（~5 min）
- T019 INTEGRATION-CHECKLIST + SPECKIT（~10 min）
- T020 C-V7 boundary verify（~5 min）
- T021 Final acceptance summary（~5 min）

→ 約 25 min。

**Batch 5 — Phase 5 push + merge + backfill（T022-T024、user-gated）**：
- T022 push outer feature branch（~3 min）
- T023 merge + push rev1-admin-root（~5 min）
- T024 SHA backfill + push（~5 min）

→ 約 13 min 含 user 同意等待（3 user 同意關卡、不含 user thinking time）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-0（Phase 1 Setup only）**：baseline check 確認、不交付任何 user value。
- **MVP-1（Phase 1 + US1 Phase 3a+3b）**：rust-api 8 file wire DTO + docker rebuild + acceptance C-V1~C-V6（含 C-V6 CDP smoke regression）。**4 endpoint wire shape leak 全收斂已實機驗證**、唯獨 outer SHA pin + INTEGRATION-CHECKLIST cleanup + push + merge 留後。
- **Full feature（MVP-1 + Phase 5 Polish）**：依 Batch 1-5 完整跑（推薦、wire shape leak 一次清完、acceptance C-V1~C-V7 全 PASS、039-R1 結案 + Critical backlog 全清）。

User 偏好：Full feature 一次到位（per brainstorm Q1/Q2/Q3 拍板 + 052 dedicated sprint 紀律 / acceptance 全綠 / merge 紀律）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~010 + SC-001~009）→ ② code quality（rust idiom / sea-orm From impl / camelCase serde / 040 D-pattern 對齊紀律 / Constitution 紀律 / 軌道紀律 boundary）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、`cargo check` PASS、`docker compose ps` healthy、curl + jq shape output、CDP smoke 步驟結果、commit SHA）。

**Phase 5** 必須在 US1 全部 PASS 後執行（含 user 同意 push / merge / backfill 三個關卡）。

**Implementer-stage Expansion budget**（per 046 FR-015 amend wording 050 落地後生效）：base ≤3 處 + user 拍板可加大（commit message body 明示拍板原委 + budget enlargement 計數）；本 sprint 預估 0 expansion 候選（軌道外 single-fn wire DTO wrap、4 endpoint 為 well-defined scope、無 cascade）；超限拒拾、登 052+ follow-up。

---

## Summary

- **Total tasks**: 24
- **By phase**: Setup 1 / Foundational 0 / US1 16 / Polish 7
- **By user story**: US1 = 16 + Setup 1 + Polish 7（含 4 user gate T011/T022/T023/T024）
- **Parallel opportunities**：
  - US1 Phase 3a 內部 T003 / T004（不同檔 [P]、output DTO 並行）
  - US1 Phase 3a 內部 T006 / T007 / T008（不同 handler 檔 [P]、cargo check 後序列化）
  - US1 Phase 3b 內部 T014 / T015 / T016（不同 C-V 不同 test role 可平行、雖共享 dev stack）
- **Independent test criteria**: 每個 endpoint 對應 1 個 C-V（C-V2~C-V5）+ C-V6 base-web regression + C-V7 boundary
- **Suggested MVP scope**: MVP-1（Phase 1 + US1 Phase 3a+3b）—— rust-api wire DTO wrap + docker rebuild + acceptance C-V1~C-V6；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 24 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
