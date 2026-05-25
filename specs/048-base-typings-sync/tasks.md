---
description: "Task list for 048 base-typings-sync"
---

# Tasks: 048 base-typings-sync

**Input**: Design documents from `/specs/048-base-typings-sync/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 sprint 為 typing-only feature、無新純函式邏輯、**無新 unit test**（per spec FR-014 紀律 + 040 體例：wiring/shape 對映類 feature 無新單元測試時、由 acceptance C-V 系列 cover；本 sprint acceptance via `pnpm typecheck` + `pnpm build` + CDP browser smoke 8 路徑）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。

**Organization**：依 spec.md 2 user story（US1 = P1 MVP 3 mismatch fix / US2 = P1 3 JSDoc audit）+ Setup（Phase 0「先合法化、再執行」amendment）+ Polish 分 phase；US1 + US2 同 base-web worktree、單 commit 一體；Phase 2 skipped。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：T007 + T009 同 `base-web/src/typings/api/system-manage.d.ts` 不同 sub-area（M3 MenuTree.pid vs D2 Menu.parentId JSDoc）標 `[P]` 是「邏輯獨立、無 inter-task dependency」、**不是**「subagent 並行 dispatch」；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。

**SDD「先合法化、再執行」紀律**（per spec FR-008）：T001-T005 為 Phase 0 prerequisite、必須**先**完成才能進 Phase 3 US1（base-web 改動需 Constitution v1.5.0 才合法）。

---

## Phase 1: Setup (SDD「先合法化、再執行」prerequisite)

**Purpose**：Constitution v1.4.0 → v1.5.0 amendment + 新 DESIGN-W-TYPING-ALIGN.md 軌道權威文件 + plan-template 軌道辨識條目 + CLAUDE.md §1/§7 索引補。**必須在 base-web 改動前完成**、否則違反 v1.4.0 既有 constitution。

> **Phase 0 vs Phase 1 命名 note**（per /speckit-analyze C1 remediation）：spec.md FR-008 + plan.md §Constitution Check 用「Phase 0」描述 SDD「先合法化、再執行」概念前置動作；tasks.md 按 spec-template phase 命名約定標為「Phase 1: Setup」。兩者**同義不衝突**、為不同視角的標籤（前者為 SDD 階段語義、後者為 task template 結構標籤）。

- [ ] T001 改 `.specify/memory/constitution.md` v1.4.0 → v1.5.0 amendment：標頭 Version field + 標頭區 wording（Version change / Modified principles / Templates / Follow-up TODOs）+ §IV 主體段落追加 TS-Typing-Sync 受管例外段（在既有 W-WEBUI 受管例外段後）+ Version History 段加 1.4.0 → 1.5.0 條目。per [data-model §E2](./data-model.md)、[research R-3](./research.md)。對應 FR-008。
- [ ] T002 建 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件、6 節完整：§1 軌道定位 / §2 可動範圍（硬邊界）/ §3 動機限定 / §4 軌道成員（§4.1 048 sprint 首發 placeholder、commit SHA `<TBD post-merge>`）/ §5 與 W-WEBUI 軌道邊界（互斥不重疊 + Feature spec 軌道辨識義務）/ §6 預期 sprint 模式（非常駐軌道、1-3 feature/year）。per [data-model §E3](./data-model.md)、[research R-4](./research.md)。對應 FR-009。
- [ ] T003 改 `.specify/templates/plan-template.md` Constitution Check 段 Principle IV row 加軌道辨識條目（三選一：W-WEBUI / TS-Typing-Sync / 軌道外）。per [data-model §E4](./data-model.md)、[research R-5](./research.md)。對應 FR-010。
- [ ] T004 改 `CLAUDE.md` §1（最終結構表 / 整合 repo 描述）+ §7（整合設計文件索引）補 DESIGN-W-TYPING-ALIGN 引用（與 DESIGN-A / DESIGN-B / DESIGN-W-DEPLOYMENT / DESIGN-W-WEBUI 並列）。預估 ~3-5 line edit。對應 FR-008 配套。
- [ ] T005 outer commit 1（Phase 0 amendment + DESIGN + plan-template + CLAUDE 索引）：`git add .specify/memory/constitution.md docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md .specify/templates/plan-template.md CLAUDE.md && git commit -m "feat(constitution): v1.4.0→v1.5.0 ..."`。commit message 對齊 [quickstart Step 1.5](./quickstart.md) 範本。Depends on T001 + T002 + T003 + T004。對應 [CLAUDE.md §4.1](../../CLAUDE.md) 外層專屬檔 commit 紀律。

**Checkpoint**：Phase 0 完成、Constitution v1.5.0 生效、TS-Typing-Sync 軌道權威文件就位、SDD「先合法化、再執行」紀律滿足、Phase 3 base-web 改動現可合法進行。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 sprint 2 user story 同 base-web worktree、單 commit、無跨 story 共用 foundational 設施（typing edit 直接落、無新 shared helper）。Phase 2 跳過。

*(no tasks)*

---

## Phase 3: User Story 1 — 3 mismatch fix（Priority: P1）🎯 MVP

**Goal**：`base-web/src/typings/api/route.d.ts` + `base-web/src/typings/api/system-manage.d.ts` 內 3 處 confirmed mismatch fix（M1 `MenuRoute.id` string→number / M2 `MenuRoute` 加 `pid: string` / M3 `MenuTree.pId: number → pid: string` rename + retype）對齊 rust wire 真實序列化型。

**Independent Test**：grep `id: number` + `pid: string` 命中 `base-web/src/typings/api/route.d.ts`、grep `pid: string` 命中 `base-web/src/typings/api/system-manage.d.ts`、grep `pId: number` 在 `system-manage.d.ts` 0 hit（舊宣告完全移除）；`pnpm typecheck` 0 TS error。

### Implementation for User Story 1

- [ ] T006 [US1] 改 `base-web/src/typings/api/route.d.ts`：(a) `MenuRoute.id: string` → `id: number` + JSDoc 註（rust `i32` → JSON number、pre-048 mismatch 註）；(b) 新增 `pid: string` field + JSDoc 註（rust `pid: String` 序列化、camelCase rule `pid` lowercase 註）。per [data-model §E1.1](./data-model.md)。對應 FR-001、Acceptance Scenario 1。Depends on T005 (Phase 0 amendment 完成)。
- [ ] T007 [US1] 改 `base-web/src/typings/api/system-manage.d.ts` `MenuTree` type：`pId: number` → `pid: string`（field rename + type change）+ JSDoc 註（rust `MenuTree.pid: String` + serde camelCase rule lowercase 註）；同檔 D2 (US2) 由 T009 處理、本 task 不動 D2。per [data-model §E1.2](./data-model.md)。對應 FR-002、Acceptance Scenario 2。Depends on T005。

**Checkpoint**：US1 完成 —— 3 處 mismatch fix 就位、`pnpm typecheck` 應 0 error（依賴 Phase 5 build verify task 確認）；type-level 對齊 rust wire。**MVP 達成**（type-level 對齊為 verifiable evidence）。

---

## Phase 4: User Story 2 — 3 JSDoc audit（Priority: P1）

**Goal**：`base-web/src/typings/api/common.d.ts` + `system-manage.d.ts` + `auth.d.ts` 內 3 處 JSDoc 補（D1 `CommonRecord.id` Snowflake 53-bit 說明 / D2 `Menu.parentId === 0` root sentinel 說明 / D3 `Auth.UserInfo.userId` ULID vs `User.id` 不同表示說明）。

**Independent Test**：grep `Snowflake` / `53bit` / `MAX_SAFE_INTEGER` 命中 `common.d.ts`；grep `root menu sentinel` / `menu-operate-modal.vue:137` 命中 `system-manage.d.ts`；grep `ULID` / `JWT subject` / `display_id` 命中 `auth.d.ts`。

### Implementation for User Story 2

- [ ] T008 [P] [US2] 改 `base-web/src/typings/api/common.d.ts` `CommonRecord.id` 上方加 D1 JSDoc：說明 post-039 為 i64 from Snowflake 41/5/7=53bit display_id、fills `Number.MAX_SAFE_INTEGER`、無精度 loss、應用 5 業務 entity、與 `Auth.UserInfo.userId` ULID 為不同表示。per [data-model §E1.3](./data-model.md)。對應 FR-003、US2 Acceptance Scenario 1。Depends on T005。
- [ ] T009 [P] [US2] 改 `base-web/src/typings/api/system-manage.d.ts` `Menu.parentId` 上方加 D2 JSDoc：說明 `0` = root menu sentinel（rust input DTO `parent_id: i32`、`menu-operate-modal.vue:137 model.parentId === 0` 為 showLayout sentinel 依賴點）；同檔 T007 已處理 M3（MenuTree.pid）、本 task 不動 M3。per [data-model §E1.2](./data-model.md)。對應 FR-004、US2 Acceptance Scenario 2。Depends on T005 + T007（same file sequential edit）。
- [ ] T010 [P] [US2] 改 `base-web/src/typings/api/auth.d.ts` `UserInfo.userId` 上方加 D3 JSDoc：說明 rust internal ULID String（JWT subject、audit log actor）、與 `User.id` (i64 display_id) 為不同 id 表示（rust SoT 雙欄設計、ULID + display_id 並存）。per [data-model §E1.4](./data-model.md)。對應 FR-005、US2 Acceptance Scenario 3。Depends on T005。

**Checkpoint**：US2 完成 —— 3 處 JSDoc 補就位、type-level 語意說明完整、防未來型別誤判。`pnpm typecheck` 應 0 error（JSDoc 為純註解、不改 type shape）。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：base-web worktree commit + pnpm typecheck/build verify + docker rebuild base-web + dev stack restart + CDP smoke 8 路徑 + outer 多段 commit + merge + SHA backfill + 最終 acceptance 全綠 verify。

- [ ] T011 base-web 本機 `pnpm typecheck` verify (C-V2)：`cd base-web && pnpm typecheck 2>&1 | tail -10`、expect vue-tsc 0 error。Depends on T006 + T007 + T008 + T009 + T010。對應 SC-002 前段。
- [ ] T012 base-web 本機 `pnpm build` verify (C-V3)：`cd base-web && pnpm build 2>&1 | tail -10`、expect dist/ 產出成功 + 0 build error。Depends on T011。對應 SC-002 後段。
- [ ] T013 base-web worktree commit US1+US2（**單 commit、4 檔 typing edit 一體**、per [quickstart Step 2.6](./quickstart.md)）：進 `base-web/` worktree、`git add src/typings/api/route.d.ts src/typings/api/system-manage.d.ts src/typings/api/common.d.ts src/typings/api/auth.d.ts`、commit message 對齊 quickstart 範本（feat 標 048 US1+US2、含 M1+M2+M3 mismatch fix + D1+D2+D3 JSDoc audit 說明 + 軌道屬性 + Phase 0 grep 確認 0 consumer cascade）。Depends on T012。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T014 docker rebuild base-web image + dev stack restart base-web service + verify healthy (C-V4)：`docker build -t base-web:rev1-admin-base-web ./base-web`（~5-10min）→ `$PC up -d --force-recreate --no-deps base-web && sleep 12` → `$PC ps` base-web status `Up X seconds (healthy)`。Depends on T013。對應 SC-003 前置。
- [ ] T015 [P] C-V5 grep verification（3 mismatch fix + 3 JSDoc 命中、舊 `pId: number` 0 hit）：per [contracts C-V5](./contracts/verification-commands.md) shell script。對應 SC-004 + SC-005。
- [ ] T016 [P] C-V6 CDP browser smoke deep 8 路徑：per [contracts C-V6](./contracts/verification-commands.md)、Edge `:9229` debug port + node WebSocket driver（無 playwright）、路徑 (1) Login Soybean/123456、(2) Dynamic menu 載入 (M1+M2 驗)、(3) role 列表→編輯 modal、(4) role 編輯→菜单权限 modal NTree (M3 驗)、(5) menu 列表、(6) menu 新增 modal root parentId=0 showLayout=true (D2 驗)、(7) menu 新增 modal child parentId>0 showLayout=false (D2 驗)、(8) user 列表。Depends on T014。對應 SC-003、FR-012。
- [ ] T017 [P] C-V7 boundary verify（軌道紀律、scope discipline）：per [contracts C-V7](./contracts/verification-commands.md)、grep base-web 4 檔 only + 其他 typings 0 diff + W-WEBUI 軌道範圍 0 diff + rust-api 0 diff + `Menu.parentId === 0` sentinel 保留。Depends on T014。對應 SC-006、FR-006/007。
- [ ] T018 outer feature branch commit 2 — base-web SHA pin bump（per [quickstart Step 4.1](./quickstart.md)）：`BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)`、`git add base-web`、`git commit -m "chore(submodule): bump base-web 到 ${BASE_WEB_SHA} — 048 US1+US2 typings/api 對齊 rust wire 真實型"`（含完整 body 說明 US1+US2 + 軌道屬性 + verification PASS）。Depends on T013。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T019 outer feature branch commit 3 — INTEGRATION-CHECKLIST inline note refresh + 048 entry + Current Focus update + CLAUDE.md SPECKIT marker idle（per [data-model §E5](./data-model.md) + [quickstart Step 4.2](./quickstart.md)）：改 `docs/INTEGRATION-CHECKLIST.md` —— 衍生 follow-up `base-web TS id 型別債` inline note refresh 為「已分階段完成」格式（保留 030-034 W-WEBUI 軌道遺留 context + 039 / 040 / 048 三階段 resolution 歷史、per data-model §E5.1 wording）、已完成里程碑加 048 entry（outer/merge/base-web SHA placeholder 留 backfill）、Current Focus「現狀」加 048 + 「下一步」改向條件觸發 follow-up backlog 順序第 2 段；改 `CLAUDE.md` SPECKIT marker idle（Active Spec/Plan = `—`、Phase idle、下一步指向條件觸發）。`git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md && git commit`。Depends on T018。對應 FR-013、SC-008。
- [ ] T020 DESIGN-W-TYPING-ALIGN §4.1 完整性 verify（無 commit、純檢查、per /speckit-analyze O1 remediation）：grep `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` §4.1 含 048 base-typings-sync 條目 + scope 描述（M1+M2+M3 + D1+D2+D3 列舉）+ `<TBD post-merge>` SHA placeholder。若 T002 建檔時 §4.1 完整、本 task 純 verify pass；若漏掉、補完並 amend 到 T005 commit 或新獨立 commit。Depends on T019。對應 FR-009 配套。
- [ ] T021 (optional、**Phase 0 grep 後 user 確認後才執行**) outer feature branch commit 5 — implementer-stage expansion 拾取（per [research R-7](./research.md)）：≤3 budget 拾取 candidate (a) `plan-template` 軌道辨識條目 wording 微調、(b) `INTEGRATION-CHECKLIST` inline note refresh wording 細化、(c) `DESIGN-W-TYPING-ALIGN.md §6` 預期 sprint 模式 wording 具體化 中任意 ≤3 處；超限拒拾、登 048+ follow-up。對應 FR-014。
- [ ] T022 C-V8 + C-V9 acceptance docs verify：per [contracts C-V8 + C-V9](./contracts/verification-commands.md)、grep Constitution v1.5.0 + DESIGN-W-TYPING-ALIGN 完整性 + 6 節 heading + §4.1 048 sprint + plan-template 軌道辨識 + CLAUDE 索引；grep INTEGRATION-CHECKLIST inline note refresh + 048 entry + 下一步條件觸發 + SPECKIT marker idle。Depends on T020（or T021 若拾）。對應 SC-007 + SC-008、FR-008/009/010/013。
- [ ] T023 push origin base-web worktree —— **user 同意後**：`cd base-web && git push origin rev1-admin-base-web`。Depends on T013 完成。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T024 push origin outer feature branch —— **user 同意後**：`git push origin 048-base-typings-sync`。Depends on T022（or T021 若拾）。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T025 merge 048 → rev1-admin-root —— **user 同意後執行**：`git checkout rev1-admin-root && git pull --ff-only origin rev1-admin-root && git merge --no-ff 048-base-typings-sync -m "Merge feature 048-base-typings-sync"`；push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)、[quickstart Step 5](./quickstart.md)。
- [ ] T026 backfill outer/merge/base-web SHA + push —— merge 後拿 outer (048 feature branch last commit) SHA + merge SHA + base-web worktree latest SHA、回填進兩處 placeholder：(a) `docs/INTEGRATION-CHECKLIST.md` 048 entry 的 `<...>_SHA` placeholder、(b) `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` §4.1 048 sprint commit SHA placeholder；small chore commit（per 041/042/043/044/045/046/047 體例）+ push **須 user 同意**。對應 SC-008、[quickstart Step 6](./quickstart.md)。
- [ ] T027 C-V1~C-V9 全 acceptance final 驗 —— 依 [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重 build + 重跑、全 PASS 才結案。對應 SC-001~008。

**Checkpoint**：048 整 feature 落地、acceptance C-V1~C-V9 全綠、3 mismatch fix + 3 JSDoc audit 落地、軌道紀律 boundary verify PASS、merge 回 default、INTEGRATION-CHECKLIST inline note 改寫為「已分階段完成」格式 + 048 entry 加、Constitution 5/5 PASS（post-v1.5.0 amendment）維持、TS-Typing-Sync 軌道首發 sprint 完成。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001-T005 — Constitution v1.5.0 amendment + DESIGN-W-TYPING-ALIGN
  + plan-template + CLAUDE 索引 + outer commit 1、SDD「先合法化、再執行」)
   │
Phase 2 Foundational (skipped — 2 US 同 base-web worktree、無跨 story foundational)
   │
   ├─→ US1 3 mismatch fix (T006 → T007、P1 MVP、Depends T005)
   │        │
   │        └─→ US2 3 JSDoc audit (T008 + T009 + T010 [parallel logical]、
   │                              T009 same file as T007 sequential)
   │                 │
   │                 └─→ Phase 5 Polish (T011-T027、build verify + docker
   │                                      rebuild + acceptance + merge + backfill)
```

US1 為 P1 MVP（type-level 對齊為 verifiable evidence）；US2 為同 P1（JSDoc audit、與 US1 同 commit、tightly coupled）；Phase 5 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (Constitution amendment) | — |
| T002 (DESIGN-W-TYPING-ALIGN 新文件) | — |
| T003 (plan-template 軌道辨識) | — |
| T004 (CLAUDE §1/§7 索引) | — |
| T005 (Phase 0 outer commit 1) | T001 + T002 + T003 + T004 |
| T006 (US1 route.d.ts M1+M2) | T005 |
| T007 (US1 system-manage.d.ts M3) | T005 |
| T008 (US2 common.d.ts D1 JSDoc) | T005 |
| T009 (US2 system-manage.d.ts D2 JSDoc) | T005 + T007（same file）|
| T010 (US2 auth.d.ts D3 JSDoc) | T005 |
| T011 (pnpm typecheck verify) | T006 + T007 + T008 + T009 + T010 |
| T012 (pnpm build verify) | T011 |
| T013 (base-web worktree commit) | T012 |
| T014 (docker rebuild + restart) | T013 |
| T015 (C-V5 grep verification) | T013（or T014）|
| T016 (C-V6 CDP smoke 8 path) | T014 |
| T017 (C-V7 boundary verify) | T013（or T014）|
| T018 (outer commit 2 base-web SHA pin) | T013 完成（after base-web push、實際 outer commit local 不需 push）|
| T019 (outer commit 3 INTEGRATION-CHECKLIST + CLAUDE marker) | T018 |
| T020 (outer commit 4 DESIGN-W-TYPING-ALIGN §4.1) | T019 |
| T021 (optional expansion ≤3) | T020（user 同意後）|
| T022 (C-V8 + C-V9 acceptance docs) | T020（or T021 若拾）|
| T023 (push base-web) | T013 完成、**user 同意**|
| T024 (push outer feature branch) | T022 + T023 完成（base-web 必須先 push、避免 outer gitlink SHA 引用 unpushed commit）、**user 同意**|
| T025 (merge + push rev1-admin-root) | T024 全 PASS、**user 同意**|
| T026 (SHA backfill + push) | T025、**user 同意**|
| T027 (final acceptance C-V1~C-V9) | T026 |

---

## Implementation Strategy（per quickstart Step 1-7 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 Setup（T001-T005、~30-45 min）**：
- T001 constitution v1.5.0 amendment（~40 line edit）
- T002 DESIGN-W-TYPING-ALIGN.md 新文件 6 節（~130 line write）
- T003 plan-template 軌道辨識條目（~10 line edit）
- T004 CLAUDE.md §1/§7 索引補（~5 line edit）
- T005 outer commit 1

→ 約 30-45 min implementer 階段；**Phase 0 完成、SDD「先合法化、再執行」紀律滿足**。

**Batch 2 — Phase 3 US1 + Phase 4 US2（T006-T010、~30 min）**：
- T006 route.d.ts M1+M2（~9 line edit）
- T007 system-manage.d.ts M3（~6 line edit）
- T008 common.d.ts D1 JSDoc（~9 line edit）
- T009 system-manage.d.ts D2 JSDoc（~8 line edit、same file as T007 sequential）
- T010 auth.d.ts D3 JSDoc（~9 line edit）

→ 約 30 min（4 檔 38 line typing edit）；MVP-1 達成（US1+US2 落地、待 Phase 5 verify）。

**Batch 3 — Phase 5 Polish 本機 verify + commit + docker rebuild + acceptance（T011-T017、~45-60 min）**：
- T011 pnpm typecheck verify
- T012 pnpm build verify
- T013 base-web worktree commit（單 commit）
- T014 docker rebuild + restart（~5-10 min）
- T015 [P] C-V5 grep verification
- T016 [P] C-V6 CDP smoke 8 path（~20-30 min）
- T017 [P] C-V7 boundary verify

→ 約 45-60 min（docker build + CDP smoke 為主要時間佔比）。

**Batch 4 — Phase 5 Polish outer commits + acceptance docs（T018-T022、~20 min）**：
- T018 outer commit 2 base-web SHA pin
- T019 outer commit 3 INTEGRATION-CHECKLIST + CLAUDE marker
- T020 outer commit 4 DESIGN-W-TYPING-ALIGN §4.1
- T021 (optional) outer commit 5 expansion（user 確認後）
- T022 C-V8 + C-V9 acceptance docs verify

→ 約 20 min。

**Batch 5 — Phase 5 push + merge + backfill（T023-T027、user-gated）**：
- T023 push base-web
- T024 push outer feature branch
- T025 merge + push rev1-admin-root
- T026 SHA backfill + push
- T027 final acceptance C-V1~C-V9

→ 約 15-20 min 含 user 同意等待（4 個 user 同意關卡、不含 user thinking time）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-0（Phase 0 only）**：完 Constitution v1.5.0 amendment + DESIGN-W-TYPING-ALIGN 軌道權威文件。**僅交 軌道合法化**（最高 procedural value、未來其他 typing sync sprint 可用）。base-web typings 改動留後。
- **MVP-1（Phase 0 + US1）**：+ Phase 3 3 mismatch fix（M1+M2+M3、type-level 對齊 rust wire）。**最高 value mismatch 修完**（type lie 消除）。US2 JSDoc 留後（無 nuance 註解、但不阻 runtime）。
- **MVP-2（Phase 0 + US1 + US2）**：+ Phase 4 3 JSDoc audit。**完整 audit-driven cleanup**。可 deliver 全套 mismatch fix + nuance JSDoc。
- **Full feature（MVP-2 + 完整 Polish）**：依 Batch 1-5 完整跑（推薦、bundled feature 一次清完、TS-Typing-Sync 軌道首發完成）。

User 偏好：Full feature 一次到位（per brainstorm 6 section 拍板 + 3 clarify + 048 brainstorm 統一 acceptance 全綠 / merge 紀律）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~014 + SC-001~008）→ ② code quality（TS idiom + JSDoc 規範 + Constitution 紀律 + 軌道紀律 boundary）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、`pnpm typecheck` PASS、commit SHA）。

**Phase 5 Polish** 必須在 US1+US2 全部 PASS 後執行（含 user 同意 push / merge / backfill 四個關卡）。

**Implementer-stage Expansion ≤3 處**（per [research R-7](./research.md)）：plan 階段 3 拾取 candidate (a) plan-template 軌道辨識條目 wording 微調 / (b) INTEGRATION-CHECKLIST inline note refresh wording 細化 / (c) DESIGN-W-TYPING-ALIGN §6 sprint 模式 wording 具體化、user 確認後拾取；超限拒絕並登 048+ follow-up。

---

## Summary

- **Total tasks**: 27
- **By phase**: Setup 5 / Foundational 0 / US1 2 / US2 3 / Polish 17
- **By user story**: US1 = 2 / US2 = 3（共 5 user story tasks）+ Setup 5 + Polish 17
- **Parallel opportunities**：
  - US2 內部 T008 / T009 / T010（不同檔可邏輯並行、T009 same file as T007 sequential）
  - Phase 5 T015 / T016 / T017 並行（acceptance grep + CDP smoke + boundary verify 同期）
- **Independent test criteria**: 每個 US 對應 C-V1~C-V9 中 1-2 條（per spec.md SC-001~008）
- **Suggested MVP scope**: MVP-1（Phase 0 + US1）—— Constitution amendment + 3 mismatch fix 即可 type-level 對齊；user 已選 Full feature 一次到位（含 US2 JSDoc audit）
- **Format validation**: ✅ 全 27 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
