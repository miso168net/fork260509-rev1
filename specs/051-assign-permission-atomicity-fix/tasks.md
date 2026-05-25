---
description: "Task list for 051 assign-permission-atomicity-fix"
---

# Tasks: 051 assign-permission-atomicity-fix

**Input**: Design documents from `/specs/051-assign-permission-atomicity-fix/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 sprint 為 atomicity impl fix、wiring/shape feature 無新純函式邏輯、**無新 unit test**（per spec.md FR-001~007 atomicity by acceptance C-V3 fault injection 定性證明；對齊 050 / 049 / 046 spec-hygiene-pass + 047 sandbox-fix 既有 acceptance-only via C-V matrix 體例）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。

**Organization**：spec.md 1 user story（US1 = 全部 fix bundled、軌道外 feature、無 cross-story dependency）+ Setup（baseline check）+ Polish（outer SHA pin / INTEGRATION-CHECKLIST + SPECKIT / acceptance / push / merge / backfill）。Phase 2 Foundational 跳過（單 US 單 bundled commit、無共用 foundational 設施）。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：US1 內 rust-api 3 file 改 bundled 同 commit；不同 file 邏輯並行（[P]）、同 file 序列；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。

---

## Phase 1: Setup (Baseline verification)

**Purpose**：確認 dev stack baseline 健康 + rust-api worktree 在 050 baseline (含 rustls fix 1a7ef2a)、為 sprint 後續 verify 提供基準。

- [ ] T001 確認 dev stack baseline 健康 + rust-api worktree HEAD：`export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"`、`$PCO ps --format "table {{.Service}}\t{{.Status}}"`、expect 13 service Up（含 pushgateway 從 050 落地）；`cd rust-api && git log --oneline -1` expect `1a7ef2a` 或更新 HEAD；`cd base-web && git log --oneline -1` expect `64af823b`（050 baseline、本 sprint 0 改動）。對應 SC-001 baseline、per [contracts C-V1](./contracts/verification-commands.md)。

**Checkpoint**：baseline confirmed、可進入 Phase 3 US1 rust-api impl fix。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 sprint 1 user story 為單 bundled commit、無跨 story 共用 foundational 設施（rust-api 3 file fix 為單一 logical unit）。Phase 2 跳過。

*(no tasks)*

---

## Phase 3: User Story 1 — assign_permission atomicity fix（Priority: P1）🎯 MVP

**Goal**：`sys_authorization_service.rs::assign_permission` split-txn → single Sea-ORM `DatabaseTransaction`（`casbin_rule` 直寫 + audit 同 txn + single commit）+ `sync_role_permissions` private fn 刪除 + trait signature drop `enforcer` param + 2 handler callsite 同步調整 + 既有 W-F11 `notify_casbin_changed()` pub-sub reload 重用；Constitution Principle II「業務寫入 + audit 同 txn」NON-NEGOTIABLE 承諾從 violation → fulfillment 收斂；C-V1~C-V7 全 PASS。

**Independent Test**：(a) curl `POST /systemManage/assignRoleEndpoints` 送 3 endpoint id → psql 看 `casbin_rule` 新增 3 row + `sys_operation_log` 新增 1 audit row、payload `endpointIds` 對齊；(b) fault injection（暫改 audit_log::write_in_txn 強制 Err）→ curl → psql 看 `casbin_rule` + `sys_operation_log` **雙方 0 變動**（atomicity 反證）；(c) revert + happy path 仍 PASS；(d) GeneralUser deny + clear-all 既有 regression PASS。

### Phase 3a: Spike + rust-api impl

- [ ] T002 [US1] Phase 0 spike (~30 min)：(a) `cd rust-api/server/service && cargo check 2>&1 | tail -5` baseline pass；(b) `grep -rn "fn sync_role_permissions\|assign_permission\b" rust-api/server/ | head -15` 確認 1 trait + 1 impl + 2 handler callsite（待刪 / 待 drop arg）；(c) Sea-ORM entity import path 確認：`use server_model::admin::entities::prelude::CasbinRule; use server_model::admin::entities::casbin_rule::{ActiveModel as CasbinRuleActiveModel, Column as CasbinRuleColumn};` cargo check pass。per [research R-1](./research.md)。Spike 結果不對應 commit、屬 implementer prep 確認可行性。Depends on T001。
- [ ] T003 [US1] 改 `rust-api/server/service/src/admin/sys_authorization_service.rs` 3 處同檔（**序列化 edit**、避 race）：(a) 刪除 `sync_role_permissions` private fn line 128~205（~-78 line）；(b) 改寫 `assign_permission` impl line 210~306 為 single Sea-ORM txn（per [data-model §E1.2](./data-model.md) pseudo code、~+60 / -97 line）；(c) `TAuthorizationService` trait signature line 57~62 drop `enforcer` param（~-1 line）；(d) imports 新增 Sea-ORM CasbinRule / CasbinRuleColumn / CasbinRuleActiveModel + 刪掉 unused enforcer/Casbin trait import。對應 FR-001 / FR-002 / FR-003 / FR-004 / FR-005 / FR-006。Depends on T002。
- [ ] T004 [P] [US1] 改 `rust-api/server/api/src/admin/sys_authentication_api.rs:152` callsite drop `enforcer,` arg：拿掉第 4 個位置參數；若 handler fn 上層拿了 `enforcer` 變數但只給此 callsite 用 → unused，順手清 import + `let` 變數。per [data-model §E2](./data-model.md)。對應 FR-003。Depends on T003（trait signature 先 drop）。
- [ ] T005 [P] [US1] 改 `rust-api/server/api/src/admin/sys_system_manage_api.rs:554` callsite drop `enforcer,` arg：同 T004、line 554 callsite；handler unused enforcer 變數清理。per [data-model §E3](./data-model.md)。對應 FR-003。Depends on T003。
- [ ] T006 [US1] 本機 `cargo check --all-features` + `cargo clippy --no-deps` (rust-api worktree)：cd rust-api && cargo check && cargo clippy；確認本 sprint 改動 0 error 0 new warning；pre-existing strict-mode warnings 在 untouched files 不算（per 050 體例）。Depends on T003 + T004 + T005。對應 build sanity。
- [ ] T007 [US1] rust-api worktree commit 1（bundled 3 file、單 commit）：`cd rust-api && git add server/service/src/admin/sys_authorization_service.rs server/api/src/admin/sys_authentication_api.rs server/api/src/admin/sys_system_manage_api.rs && git commit`。commit message 對齊 [quickstart Step 1.6](./quickstart.md) 範本（fix(rust-api) 標 051 + 038-R1 結案 + Constitution II 強化 + 3 file 改動 + acceptance reference）。Depends on T006。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T008 [US1] push rust-api origin **（須 user 同意）**：`cd rust-api && git push origin rev1-admin-rust-api`。Depends on T007。對應 [CLAUDE.md §5](../../CLAUDE.md)。

### Phase 3b: Docker rebuild + restart + impl-side acceptance

- [ ] T009 [US1] docker rebuild rust-api image + restart：`docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3` + `$PCO up -d --force-recreate --no-deps rust-api` + 等 healthy（`until $PCO ps ... | grep -q "rust-api.*(healthy)"; do sleep 3; done`）。Depends on T007（rust-api commit、技術 dep）；practically queue after T008 push (user gate)、避免 push 撤後 rebuild 廢工。對應 SC-001 baseline、per [contracts C-V1](./contracts/verification-commands.md)。
- [ ] T010 [US1] C-V2 happy path verify（FR-001 / FR-004）：跑 [contracts C-V2 script](./contracts/verification-commands.md)；建 R_CV2_AT test role + 取 3 endpoint id + curl `POST /systemManage/assignRoleEndpoints` + psql 看 casbin_rule 從 0 → 3 row + sys_operation_log 1 audit row 含 payload_after.endpointIds 對齊；cleanup test role + casbin_rule。Depends on T009。對應 SC-002、per [contracts C-V2](./contracts/verification-commands.md)。
- [ ] T011 [US1] **C-V3 ⭐ atomicity 反證**（FR-006、本 sprint 最關鍵 acceptance）：(a) 暫改 `rust-api/server/model/src/admin/audit_log.rs::write_in_txn` 開頭加 `return Err(AppError { code: 500, message: "C-V3 fault injection".to_string() });`（不 commit、不 push）；(b) `docker build -t rust-api:rev1-admin-rust-api ./rust-api` + restart + 等 healthy；(c) psql baseline 取 casbin_rule + sys_operation_log (5min) count；(d) curl `POST /systemManage/assignRoleEndpoints` 預期 5xx；(e) psql 比對 row count 與 before 完全相同（atomicity 證明）；(f) revert audit_log.rs 改動、docker rebuild + restart、git status clean、跑簡化 C-V2 確認 happy path 仍 PASS。Depends on T009。對應 SC-003、per [contracts C-V3](./contracts/verification-commands.md)。
- [ ] T012 [P] [US1] C-V4 W-F11 pub-sub reload verify（FR-007）：跑 [contracts C-V4 script](./contracts/verification-commands.md)；$PCO logs grep `Casbin.*(reload|policy|sync)` 命中 ≥1 + 既有 endpoint enforcement 命中（curl `GET /systemManage/getMenuList/v2` 200）。Depends on T010（happy path 已落新 policy）。對應 SC-004、per [contracts C-V4](./contracts/verification-commands.md)。
- [ ] T013 [P] [US1] C-V5 GeneralUser deny regression（FR-001 enforce 不變）：跑 [contracts C-V5 script](./contracts/verification-commands.md)；GeneralUser token + curl `POST /systemManage/assignRoleEndpoints` → response code != 0（既有 W-FW8 acceptance 不退化）。Depends on T009。對應 SC-005、per [contracts C-V5](./contracts/verification-commands.md)。
- [ ] T014 [P] [US1] C-V6 clear-all E-4 regression（FR-004）：跑 [contracts C-V6 script](./contracts/verification-commands.md)；建 R_CV6_CL test role + assign 2 endpoint → casbin_rule 2 row → clear-all 送 `endpointIds:[]` → 0 row + audit payload_after `endpointIds:[]`；cleanup。Depends on T009。對應 SC-006、per [contracts C-V6](./contracts/verification-commands.md)。

**Checkpoint**：US1 Phase 3a + 3b 完成 —— rust-api worktree commit + push + docker rebuild + impl-side acceptance C-V2~V6 全 PASS；C-V3 atomicity 反證 ⭐ 為 Constitution II 強化的定性證明；待 Phase 5 SHA pin + INTEGRATION-CHECKLIST + 最終 C-V7 boundary verify 結案。**MVP 達成**（atomicity fix 為 verifiable evidence、本 sprint 唯一交付）。

---

## Phase 4: Foundational （N/A）

*(同 Phase 2、跳過)*

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：outer SHA pin（rust-api 1 個 gitlink bump）+ INTEGRATION-CHECKLIST cleanup（038-R1 結案 + 051 milestone + Current Focus + SPECKIT idle）+ acceptance C-V7 boundary verify + push outer feature branch + merge + SHA backfill。

- [ ] T015 outer commit 1 — rust-api SHA pin bump：`RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)`、`git add rust-api`、`git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 051 assign_permission atomicity fix (038-R1 結案)"`。per [quickstart Step 3.1](./quickstart.md)。Depends on T008 完成。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T016 outer commit 2 — INTEGRATION-CHECKLIST cleanup + 051 milestone + SPECKIT marker idle：(a) 衍生 follow-up table 移除 038-R1 row；(b) 加 footnote「038-R1 結案 via 051」；(c) 已完成里程碑加 051 entry（SHA placeholder）；(d) Current Focus「現狀」加 051 + 「下一步」3 段更新（剩 039-R1 + 條件觸發 + 長期）；(e) CLAUDE.md SPECKIT marker idle。`git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md && git commit`。per [data-model §E4](./data-model.md) + [quickstart Step 3.2](./quickstart.md)。Depends on T015。對應 FR-010、SC-008。
- [ ] T017 C-V7 boundary verify（FR-008、scope discipline）：跑 [contracts C-V7 script](./contracts/verification-commands.md)；(a) `grep -rn "fn sync_role_permissions\b" rust-api/server/` 0 hit；(b) `grep -A 8 "fn assign_permission" rust-api/server/service/src/admin/sys_authorization_service.rs` signature 為 4 params（drop enforcer）；(c) `cd rust-api && git diff --name-only origin/rev1-admin-rust-api~1 HEAD -- migration/` 0 line；(d) base-web 0 改動 `cd base-web && git log --oneline -1` HEAD = 64af823b；(e) `git diff origin/rev1-admin-root..HEAD .specify/memory/constitution.md` 0 line；(f) rust-api Cargo.toml 0 diff。Depends on T015。對應 SC-007、per [contracts C-V7](./contracts/verification-commands.md)。
- [ ] T018 Final acceptance summary + git status clean：跑全 C-V1~C-V7 final run + `git status --short` clean + outer commit chain `git log --oneline 92c919a..HEAD` 含預期 commits + rust-api 1 commit + base-web 0 commit。Depends on T016 + T017 + T010 + T011 + T012 + T013 + T014。對應 SC-001~009 全 PASS、SC-009 Constitution Check 5/5 maintain。
- [ ] T019 push origin outer 051 feature branch **（須 user 同意）**：`git push origin 051-assign-permission-atomicity-fix`。Depends on T018 完成 + T008 完成（worktree 必須先 push、避免 outer gitlink SHA 引用 unpushed commit）。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T020 merge 051 → rev1-admin-root **（須 user 同意執行）**：`git checkout rev1-admin-root && git pull --ff-only origin rev1-admin-root && git merge --no-ff 051-assign-permission-atomicity-fix -m "Merge feature 051-assign-permission-atomicity-fix"`；push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)、[quickstart Step 5](./quickstart.md)。
- [ ] T021 backfill outer/merge/rust-api SHA + push **（須 user 同意）**：merge 後拿 3 SHA、回填進 1 處 placeholder：`docs/INTEGRATION-CHECKLIST.md` 051 entry 的 3 SHA placeholder（outer + merge + rust-api）；small chore commit（per 050 體例）+ push **須 user 同意**。對應 SC-008、[quickstart Step 6](./quickstart.md)。

**Checkpoint**：051 整 feature 落地、acceptance C-V1~C-V7 全綠、038-R1 ⚠️ Critical 結案、Constitution Principle II 強化、051 milestone entry 加、剩 039-R1 ⚠️ Critical 留下一 dedicated sprint。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001 — baseline check)
   │
Phase 2 Foundational (skipped — 1 US 單 bundled commit、無共用 foundational)
   │
   └─→ US1 atomicity fix
         │
         ├─ Phase 3a rust-api impl (T002 spike → T003 sys_authorization_service → T004 + T005 [P] callsites → T006 cargo check → T007 rust-api commit → T008 push)
         ├─ Phase 3b docker + acceptance (T009 docker rebuild + restart → T010 C-V2 happy → T011 C-V3 atomicity 反證 ⭐ → T012/T013/T014 [P] C-V4/V5/V6)
         │
         └─→ Phase 5 Polish (T015-T021、SHA pin + INTEGRATION-CHECKLIST + final acceptance + push + merge + backfill)
```

US1 為 P1 MVP 唯一 user story（atomicity fix bundled、軌道外 feature、無 cross-story dependency）；Phase 5 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (baseline check) | — |
| T002 (spike) | T001 |
| T003 (sys_authorization_service 改寫) | T002 |
| T004 (sys_authentication_api.rs:152 drop arg) | T003 |
| T005 (sys_system_manage_api.rs:554 drop arg) | T003 |
| T006 (cargo check + clippy) | T003 + T004 + T005 |
| T007 (rust-api commit) | T006 |
| T008 (push rust-api、user 同意) | T007、**user 同意** |
| T009 (docker rebuild + restart) | T007（技術 dep）；practically queue after T008 (user gate) |
| T010 (C-V2 happy path) | T009 |
| T011 (C-V3 atomicity 反證 ⭐) | T009 |
| T012 (C-V4 W-F11 reload) | T010 |
| T013 (C-V5 GeneralUser deny) | T009 |
| T014 (C-V6 clear-all) | T009 |
| T015 (outer commit 1 SHA pin) | T008 完成 |
| T016 (outer commit 2 INTEGRATION-CHECKLIST + SPECKIT) | T015 |
| T017 (C-V7 boundary verify) | T015 |
| T018 (C-V8 final acceptance summary) | T016 + T017 + T010 + T011 + T012 + T013 + T014 |
| T019 (push outer feature branch、user 同意) | T018 完成 + T008、**user 同意** |
| T020 (merge + push rev1-admin-root) | T019 全 PASS、**user 同意** |
| T021 (SHA backfill + push) | T020、**user 同意** |

---

## Implementation Strategy（per quickstart Step 1-6 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 Setup（T001、~5 min）**：
- T001 baseline check

→ 約 5 min；baseline confirmed。

**Batch 2 — Phase 3a rust-api impl（T002-T008、~1.5 hr）**：
- T002 spike（~30 min）
- T003 sys_authorization_service.rs 改寫（~45 min、~+60 / -176 line edit）
- T004 + T005 [P logical] handler callsite drop arg（~10 min、各 1 line）
- T006 cargo check + clippy（~5 min）
- T007 rust-api commit（~5 min）
- T008 push rust-api（user 同意）（~5 min）

→ 約 1.5 hr（含 spike 較長）；MVP rust-api 部分達成。

**Batch 3 — Phase 3b docker rebuild + restart + impl-side acceptance（T009-T014、~1.5 hr）**：
- T009 docker rebuild + restart（~15 min、docker build 為主要時間）
- T010 C-V2 happy path（~10 min）
- T011 **C-V3 atomicity 反證 ⭐**（~40 min、含 fault injection setup + rebuild + acceptance + revert + rebuild）
- T012 + T013 + T014 [P] C-V4/V5/V6（~15 min、可平行跑）

→ 約 1.5 hr；US1 整 PASS、待 Phase 5 final acceptance + 結案。

**Batch 4 — Phase 5 outer SHA pin + INTEGRATION-CHECKLIST cleanup + final acceptance（T015-T018、~25 min）**：
- T015 outer SHA pin（~5 min）
- T016 INTEGRATION-CHECKLIST + SPECKIT（~10 min）
- T017 C-V7 boundary verify（~5 min）
- T018 C-V8 final acceptance summary（~5 min）

→ 約 25 min。

**Batch 5 — Phase 5 push + merge + backfill（T019-T021、user-gated）**：
- T019 push outer feature branch（~3 min）
- T020 merge + push rev1-admin-root（~5 min）
- T021 SHA backfill + push（~5 min）

→ 約 13 min 含 user 同意等待（3 user 同意關卡、不含 user thinking time）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-0（Phase 1 Setup only）**：baseline check 確認、不交付任何 user value。
- **MVP-1（Phase 1 + US1 Phase 3a+3b）**：rust-api atomicity fix + docker rebuild + acceptance C-V1~C-V6（含 C-V3 atomicity 反證）。**Constitution II 強化已實機驗證**、唯獨 outer SHA pin + INTEGRATION-CHECKLIST cleanup + push + merge 留後。
- **Full feature（MVP-1 + Phase 5 Polish）**：依 Batch 1-5 完整跑（推薦、atomicity fix 一次清完、acceptance C-V1~C-V7 全 PASS、038-R1 結案）。

User 偏好：Full feature 一次到位（per brainstorm Q1/Q2/Q3 拍板 + 051 dedicated sprint 紀律 / acceptance 全綠 / merge 紀律）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~010 + SC-001~009）→ ② code quality（rust idiom / serde / sea-orm txn / casbin_rule schema / Constitution 紀律 / 軌道紀律 boundary）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、`cargo check` PASS、`docker compose ps` healthy、curl + psql output、commit SHA）。

**Phase 5** 必須在 US1 全部 PASS 後執行（含 user 同意 push / merge / backfill 三個關卡）。

**Implementer-stage Expansion budget**（per 046 FR-015 amend wording 050 落地後生效）：base ≤3 處 + user 拍板可加大（commit message body 明示拍板原委 + budget enlargement 計數）；本 sprint 預估 0 expansion 候選（軌道外 single-fn atomicity fix、無 cascade）；超限拒拾、登 051+ follow-up。

---

## Summary

- **Total tasks**: 21
- **By phase**: Setup 1 / Foundational 0 / US1 13 / Polish 7
- **By user story**: US1 = 13 + Setup 1 + Polish 7（含 3 user gate T008/T019/T020/T021）
- **Parallel opportunities**：
  - US1 Phase 3a 內部 T004 / T005（不同檔 [P]、T006 cargo check 後序列化）
  - US1 Phase 3b 內部 T012 / T013 / T014（不同 C-V [P]、可平行跑）
- **Independent test criteria**: 每個 US 對應 C-V1~C-V7 中 1-3 條（per spec.md SC-001~009）
- **Suggested MVP scope**: MVP-1（Phase 1 + US1 Phase 3a+3b）—— rust-api atomicity fix + docker rebuild + acceptance C-V1~C-V6；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 21 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
