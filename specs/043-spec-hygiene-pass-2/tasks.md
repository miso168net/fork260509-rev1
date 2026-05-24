---
description: "Task list for 043 spec-hygiene-pass-2"
---

# Tasks: 043 spec-hygiene-pass-2

**Input**: Design documents from `/specs/043-spec-hygiene-pass-2/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 為 spec md edits、無程式碼改動、無 unit test 需求；acceptance 純由 [`contracts/verification-commands.md`](./contracts/verification-commands.md) C-V1~C-V5 涵蓋（grep + 1 條 dev stack SQL acceptance）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) 紀律「無新純函式測試時由 acceptance 覆蓋、明示理由」。

**Organization**：依 spec.md 三個 user story（US1 P1 / US2 P2 / US3 P3）+ Polish 分 phase；每 phase 內標 [P] 平行可跑 task。**無 Setup / Foundational phase**（純 spec md edits、無新 project init、無 shared infrastructure）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story
- 每 task 含 exact file path 與具體動作

---

## Phase 1: Setup（Shared Infrastructure）

無 setup task（純 spec md edits、無 project init、無新 build system / lint config）。

---

## Phase 2: Foundational（Blocking Prerequisites）

無 foundational task（3 user story 完全獨立、不共享資料結構或 helper）。

---

## Phase 3: User Story 1 — TZ fix 10 處（Priority: P1）🎯 MVP

**Goal**：對 spec 003 / 021 / 042 內所有 `NOW() - INTERVAL '...'` time-window SQL 套一致替換 `(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'`、消除 postgres `NOW()` `+08` 與 `sys_operation_log.created_at` UTC naive 的 8h offset 誤差。

**Independent Test**：dev stack 健康下、跑 1 個 admin write trigger（POST /api/role）、然後跑改後窄窗口 SQL（10 seconds）；預期回 ≥2 row（042 雙視角）、改前同樣命令會 0 row（per C-V2）。

### Implementation for User Story 1

- [ ] T001 [P] [US1] sed spec 003 TZ fix（1 hit）— `sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" specs/003-audit-log-infrastructure/quickstart.md`（per [data-model.md §E1 row ①](./data-model.md)）。
- [ ] T002 [P] [US1] sed spec 021 TZ fix（5 hits / 3 files）— `sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" specs/021-systemmanage-alias-router/spec.md specs/021-systemmanage-alias-router/tasks.md specs/021-systemmanage-alias-router/contracts/verification-commands.md`（per data-model.md §E1 rows ②③④⑤⑥）。
- [ ] T003 [P] [US1] sed spec 042 TZ fix（4 hits / 1 file）— `sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md`（per data-model.md §E1 rows ⑦⑧⑨⑩）。
- [ ] T004 [US1] C-V1 grep verify — 跑 `grep -rn "NOW() - INTERVAL" specs/ --include="*.md" | grep -v "043-spec-hygiene-pass-2"`（預期 0 hit）+ `grep -rn "(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL" specs/ --include="*.md" | grep -v "043-spec-hygiene-pass-2" | wc -l`（預期 ≥10）（depends on T001-T003）。對應 SC-001、FR-001。
- [ ] T005 [US1] C-V2 dev stack acceptance — 跑 contracts/verification-commands.md C-V2：login → POST /api/role → sleep 2 → 改前 SQL 預期 0 row + 改後 SQL 預期 ≥2 row（depends on T004）。對應 SC-001、FR-002、US1 AS-1。

**Checkpoint**：US1 完成 — TZ fix 全部落地，dev stack 可重跑 003 / 021 / 042 的 time-window query 不再 0 row 誤判。MVP-worthy（可獨立 deliver、US2/US3 未做也 OK）。

---

## Phase 4: User Story 2 — /auth/logout doc + research + W-F12 hook（Priority: P2）

**Goal**：spec 005 contracts/auth-endpoints.md 新增 §「Logout (no server endpoint by design)」、涵蓋 current design / 3 pattern research / triggers / W-F12 hook 4 個 aspect。

**Independent Test**：human read-through spec 005 contracts/auth-endpoints.md、確認新 § 4 aspect 涵蓋（C-V3 grep keyword counts）。

### Implementation for User Story 2

- [ ] T006 [US2] 在 spec 005 contracts/auth-endpoints.md 末段新增 §5 Logout — per [quickstart.md Step 2.1](./quickstart.md) 完整內容範例：current design (DESIGN-B baseline) / Token Revocation Research (Pattern A Redis blacklist + Pattern B Short-TTL refresh + Pattern C JWT versioning) / 何時需 server-side revocation (Admin-driven + Anomaly-driven) / W-F12/13/14 Observability Hook (Pattern A 推薦)。對應 FR-003。
- [ ] T007 [US2] C-V3 grep verify 4 aspect coverage — 跑 contracts/verification-commands.md C-V3：每個 aspect keyword ≥1 hit + 3 pattern 名稱 ≥3 hit（depends on T006）。對應 SC-002、FR-003、US2 AS-1+2。

**Checkpoint**：US2 完成 — R5 design intent 入 spec、未來 W-F12 brainstorm 可直接 reuse 為 design input。

---

## Phase 5: User Story 3 — spec 002 §E4 use 行對齊（Priority: P3）

**Goal**：spec 002 data-model.md line 158 use 行從 `use server_model::admin::entities::{...}` 改為 `use crate::admin::entities::{...}`、與同檔 line 186 / 362 既有正確 form 對齊。

**Independent Test**：`grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md` 期望 0 hit（C-V4）。

### Implementation for User Story 3

- [ ] T008 [US3] 編輯 spec 002 data-model.md line 158 — 將 `use server_model::admin::entities::{` 改為 `use crate::admin::entities::{`（同 block 內其他行不動）。對應 FR-004、SC-003。
- [ ] T009 [US3] C-V4 verify grep — `grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md`（預期 0 hit）+ `grep -n "use crate::admin::entities" specs/002-soft-delete-infrastructure/data-model.md | wc -l`（預期 ≥3 hit）（depends on T008）。對應 SC-003、FR-004、US3 AS-1。

**Checkpoint**：US3 完成 — 041-N2 結案、spec 002 §E4 use 行 100% paste-able。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**：INTEGRATION-CHECKLIST cleanup（FR-009）+ outer 單段式 commit + merge。**無 worktree commit**（base-web / rust-api 0 改動、單段 outer-only per CLAUDE.md §4.1 外層專屬檔紀律）。

- [ ] T010 INTEGRATION-CHECKLIST 移除 3 row + 加 043 entry — `docs/INTEGRATION-CHECKLIST.md`：
  - 從「衍生 follow-up」table 移除 042-N3 row（C-V SQL TZ bug、本 feature 結案）
  - 從「衍生 follow-up」table 移除 R5 row（/auth/logout doc gap、本 feature 結案）
  - 從「衍生 follow-up」table 移除 041-N2 row（spec 002 §E4 use 行、本 feature 結案）
  - 「已完成里程碑」加 1 行 043 entry（per quickstart §5.2 體例：日期 + outer/merge SHA + spec link + 一句話描述）
  - Current Focus 下一步從「043 進行中」→「W-F12/13/14 observability」（depends on T005 + T007 + T009 全 PASS）。對應 FR-009、SC-004。
- [ ] T011 C-V5 backlog cleanup verify — `grep -nE "^\| 042-N3 |^\| R5 |^\| 041-N2 " docs/INTEGRATION-CHECKLIST.md`（期望 0 hit）+ `grep -cn "043 spec-hygiene-pass-2" docs/INTEGRATION-CHECKLIST.md`（期望 ≥1 hit）（depends on T010）。對應 SC-004、FR-009。
- [ ] T012 outer feature branch 單段 commit — 確認在 `043-spec-hygiene-pass-2` branch + `git add` 全 8 改檔（per quickstart §6.1 完整清單：spec 002 / 003 / 005 / 021 x 3 / 042 + docs/INTEGRATION-CHECKLIST.md）+ 跑 `git diff --staged --name-only` 驗證 staged paths **無 rust-api/ 或 base-web/ 前綴**（SC-005 explicit verify、per analyze C1）+ `git commit -m` per quickstart §6.1 messageBody + **push 須 user 同意**（per ~/.claude/CLAUDE.md §5）：`git push origin 043-spec-hygiene-pass-2`（depends on T011）。對應 SC-005。
- [ ] T013 git merge 043 → rev1-admin-root — **user 同意才執行**：`git checkout rev1-admin-root && git merge --no-ff 043-spec-hygiene-pass-2 -m "Merge feature 043-spec-hygiene-pass-2"`；merge 後 push 須 user 再次同意（depends on T012）。
- [ ] T014 backfill outer/merge SHA + push — merge 後拿 `git rev-parse HEAD` (merge SHA) + 043 entry SHA、回填進 INTEGRATION-CHECKLIST 043 entry 的 `outer <SHA> + merge <SHA>` 處（small chore commit、per 041 / 042 體例）+ push 須 user 同意（depends on T013）。

**Checkpoint**：043 整 feature 落地、acceptance 全綠、backlog 已 cleanup、merge 回 default。

---

## Dependencies & Execution Order

### Story Independence Graph

```
無 Foundational
   │
   ├─→ US1 (T001-T005、MVP-worthy 可獨立 deliver)
   │
   ├─→ US2 (T006-T007、無 deps；可平行 US1)
   │
   └─→ US3 (T008-T009、無 deps；可平行 US1 / US2)
                                                  │
Phase 6 Polish (T010-T013、collect、commit、merge) ──┘
```

3 個 user story 完全獨立、可任意順序或平行執行。Polish phase 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 / T002 / T003 | — |
| T004 | T001 + T002 + T003 |
| T005 | T004 |
| T006 | — |
| T007 | T006 |
| T008 | — |
| T009 | T008 |
| T010 | T005 + T007 + T009 |
| T011 | T010 |
| T012 | T011 |
| T013 | T012（**user 同意**）|
| T014 | T013（**user 同意**）|

---

## Implementation Strategy（per quickstart Step 1-6 流程）

### 推薦執行批次

**Batch 1 — Spec md edits**（T001-T003 + T006 + T008）：5 個獨立 [P] task 可並行：
- T001 sed spec 003
- T002 sed spec 021
- T003 sed spec 042
- T006 write logout § in spec 005
- T008 fix line 158 in spec 002

→ 5 個並行、約 10 分鐘（含 implementer 寫 logout § 完整內容）。

**Batch 2 — Verify**（T004 + T007 + T009）：3 個獨立 verify task：
- T004 grep TZ pattern (depends on T001-T003)
- T007 grep logout § (depends on T006)
- T009 grep use 行 (depends on T008)

→ 3 個並行（彼此無 deps）、約 1 分鐘。

**Batch 3 — Acceptance**（T005）：dev stack C-V2 acceptance
- POST /api/role + sleep 2 + 改前/改後 SQL 對比

→ 約 3 分鐘。

**Batch 4 — Cleanup + Commit + Merge + Backfill**（T010-T014）：
- T010 INTEGRATION-CHECKLIST cleanup → T011 verify → T012 commit（含 SC-005 staged path verify）→ T013 merge → T014 backfill SHA

→ 約 10-15 分鐘、含 user 同意等待（push + merge + push 三次 OK）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-1（US1 only）**：完 Phase 3 + Polish 部分（T001-T005 + T010 部分 entries）。**僅交 TZ fix**、無 logout doc / use 行 fix。可獨立 deliver。
- **MVP-2（US1+US2）**：+ T006-T007 + 對應 polish entries。
- **Full feature（US1+US2+US3 + Polish）**：依 Batch 1-4 完整跑（推薦、總時 < 30 分鐘）。

User 偏好（per project memory）：Full feature 一次到位（bundle 三項 P1 backlog 已是 user 拍板）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 會讀本 tasks.md、偵測 subagent 可用後派遣（或本 conversation 內逐 task 執行）。每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~FR-009 + SC-001~SC-006）→ ② code quality（spec md 內容品質、ranger 後 SQL 語意正確、§ 章節完整 etc.）。

每 implementer 完成 task 後、勾 `[x]`、記錄關鍵實機結果（grep 計數、C-V 命令 actual output、commit SHA）。

---

## Summary

- **Total tasks**: 14
- **By user story**: US1 = 5 tasks（T001-T005）、US2 = 2 tasks（T006-T007）、US3 = 2 tasks（T008-T009）、Polish = 5 tasks（T010-T014）
- **Parallel opportunities**: T001/T002/T003 [P] 同時跑 sed；T001-T003 + T006 + T008 五個 batch 1 完全並行；T004/T007/T009 verify 3 並行
- **Independent test criteria**: US1 = C-V1 grep + C-V2 dev stack SQL / US2 = C-V3 logout § coverage / US3 = C-V4 use 行 grep；C-V5 為 polish phase backlog cleanup verify
- **Suggested MVP scope**: US1 only（per spec-kit framework P1 = MVP）；user 已選 Full feature 一次到位（bundle 三項 P1 backlog）
- **Format validation**: ✅ 全 14 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
- **Analyze pass remediation applied**：I1（T013 拆 T013 merge + T014 backfill）+ C1（T012 加 `git diff --staged --name-only` staged path verify、SC-005 explicit）
