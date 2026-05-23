---
description: "Task list for 041 spec-hygiene-pass-1"
---

# Tasks: 041 spec-hygiene-pass-1

**Input**: Design documents from `/specs/041-spec-hygiene-pass-1/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 不引入新 unit test（per plan.md：spec md edit 無 test 範疇、rust-api 改動為 1 行 middleware wrap 無新純函式邏輯、acceptance 由 contracts/verification-commands.md 11 C-V 覆蓋）。如需 unit test：plan.md / spec.md 已明示「無單元測試」及理由（per 全域 CLAUDE.md §4），對齊紀律。

**Organization**: 依 spec.md 三個 user story（US1 P1 / US2 P2 / US3 P3）+ Polish 分 phase；每 phase 內標 [P] 平行可跑 task。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 不同檔、無 incomplete dependency、可平行跑
- **[Story]**: 對應 spec.md user story
- 每 task 含 exact file path 與具體動作

---

## Phase 1: Setup（Shared Infrastructure）

無 setup task（本 feature 無 project init、無新 module / 新 dep crate）。

---

## Phase 2: Foundational（Blocking Prerequisites）

無 foundational task（US1 / US2 / US3 各自獨立可跑、無共用前置）。

---

## Phase 3: User Story 1 — Regression operator 重跑 C-V 不再踩 spec rot 坑（Priority: P1）🎯 MVP

**Goal**: 6 處 spec md errata（030 C-V8/9、039 C-V31、040 C-V10/12、022 C-V3、021 C-V10/C-V2）對齊現實、重跑既有 regression 不再踩坑。

**Independent Test**: dev stack 健康狀態下、依改正後 spec 命令逐條重跑 C-V8 內 6 條（030 addUser / updateUser、039 changePassword、040 role/user list、022 getUserList shape、021 user/role no-slash、021 casbin count）全 PASS。**完全不需動 rust-api**（per spec US1 Independent Test）。

### Implementation for User Story 1

- [ ] T001 [P] [US1] 030 C-V8/9 camelCase rename + errata（spec rot ①、FR-001）— 編輯 `specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md`：
  - line 95 payload `"username":"GenderTest030"...,"gender":"male"` → `"userName":"GenderTest030"...,"userGender":"1"`
  - line 124 update payload 同上替換 + `"female"`→`"2"`
  - C-V8 開頭加 errata：「> **errata 041**：payload 欄位於 W-FW5/039 後改 camelCase（`userName`/`userGender`）；value enum 用字串 `"1"`(male)/`"2"`(female) 對應 base TS。」
- [ ] T002 [P] [US1] 039 C-V31 augment payload + errata（spec rot ②、FR-002）— 編輯 `specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md`：
  - line 37 summary row 後新增獨立 `### C-V31 詳述 — changePassword payload 例` sub-section、含完整 curl block（per quickstart.md §3.2）
  - errata 明示「`currentPassword`（非 `oldPassword`、per W-FW5 035 `change_password` service）」
  - **注意**：這是 augment 非 replace（per research.md R-3 ②：spec 全文無 `oldPassword` 字串可改）
- [ ] T003 [P] [US1] 040 C-V10/12 URL replace + errata（spec rot ③、FR-003）— 編輯 `specs/040-wire-id-consistency/contracts/verification-commands.md`：
  - line 16 `/api/role/list?current=1&size=10` → `/api/role?current=1&size=10`
  - line 18 `/api/user/list` → `/api/user`
  - C-V10 / C-V12 列尾各加 errata：「> **errata 041**：rust-api paginated list endpoint 慣例 = root path GET、無 `/list` suffix。」
- [ ] T004 [P] [US1] 022 C-V3 description rewrite + errata（spec rot ④、FR-004）— 編輯 `specs/022-manage-crud-alignment/contracts/verification-commands.md`：
  - line 74 Goal「缺欄位 hardcode null/[]」改「實作裝載 user/role 等實值；少數欄位仍 hardcode null/[]（如 menu `buttons`/`children`、見 C-V3d）」
  - line 132 `userGender 為 null（hardcode None per Q2）` → `userGender 為 string "1"(male) / "2"(female) / null（未設值；F8/039 後實值化）`
  - line 134 `userRoles 為 [] (hardcode vec![] per Q2)` → `userRoles 為 string[]（role code list；F8/039 後實值化）`
  - line 146-149 Pass criteria 對應更新
  - C-V3 開頭加 errata：「> **errata 041**：F8/039 後 `userGender`/`userRoles`/`status` 已實值化、不再 hardcode null/[]/`'enabled'`。」
- [ ] T005 [P] [US1] 021 C-V10 主 URL no-slash + errata（spec rot ⑤、FR-005）— 編輯 `specs/021-systemmanage-alias-router/contracts/verification-commands.md`：
  - line 448 `=== C-V10a: 既有 GET /user/ ===` → `=== C-V10a: 既有 GET /user (no-slash) ===`、command URL `/user/` → `/user`
  - line 453 同上：`/role/` → `/role`（C-V10c `/route/tree` 不動）
  - C-V10 開頭加 errata：「> **errata 041**：主命令採無 trailing slash；041 NormalizePathLayer 落地後、`/user/` `/role/` trailing slash form 亦回 HTTP 200。」
- [ ] T006 [P] [US1] 021 C-V2 數字格式 + errata（spec rot ⑥、FR-006）— 編輯同檔 `specs/021-systemmanage-alias-router/contracts/verification-commands.md`：
  - line 38 標題 `20 row` → `≥20 row（持續成長）`
  - line 490 summary `COUNT = 20` → `COUNT ≥ 20`
  - C-V2 開頭加 errata：「> **errata 041**：原硬編 `20` 為 F9 落地時數；後續 feature 新增 systemManage alias 而成長（2026-05-24 regression 實測 50）。判定改為 `≥20`。」
- [ ] T007 [US1] C-V7 grep verify 6 處 spec md edit（depends on T001-T006）— 跑 `contracts/verification-commands.md` 內 C-V7 各 grep 命令，確認舊字串清乾淨、新 errata 行就位。FAIL 則回對應 T001-T006 修。
- [ ] T008 [US1] C-V8 重跑 regression 6 條受影響 C-V（depends on T007）— 跑 contracts/verification-commands.md 內 C-V8 完整 bash block：030 addUser/updateUser、039 changePassword、040 role/user list、022 getUserList shape、021 casbin count、021 user/role no-slash。全 PASS = US1 Independent Test 通過。Cleanup：`DELETE FROM sys_user WHERE username='CV041Test';`。

**Checkpoint**: US1 完成 — 6 處 spec md errata 落地、重跑既有 regression 不再撞鈴。可獨立 deliver（即使 US2 / US3 未做、US1 已 MVP-worthy）。

---

## Phase 4: User Story 2 — API consumer 帶 trailing slash request 不再 404（Priority: P2）

**Goal**: rust-api 全 router compose 最外層套 NormalizePathLayer、使任何 nested `/`-rooted endpoint（admin / auth / authorization）對帶與不帶 trailing slash request 一致回 200。

**Independent Test**: dev stack 重啟 rust-api 後、curl 對至少 5 個跨 router 類別 endpoint 跑 trailing slash 形式 request 皆 HTTP 200（per spec US2 Independent Test）。

### Implementation for User Story 2

- [ ] T009 [US2] rust-api `server/initialize/Cargo.toml` 加 `normalize-path` feature flag — 編輯 `rust-api/server/initialize/Cargo.toml` line 26：`tower-http = { workspace = true, features = ["trace"] }` → `tower-http = { workspace = true, features = ["trace", "normalize-path"] }`。
- [ ] T010 [US2] rust-api `server/bin/src/main.rs` wrap NormalizePathLayer（depends on T009）— 編輯 `rust-api/server/bin/src/main.rs` ~line 30 區：
  - 加 use 行：`use tower::Layer;` 與 `use tower_http::normalize_path::NormalizePathLayer;`
  - 在 `let app = server_initialize::initialize_admin_router().await;` 後、`axum::serve(...)` 之前加：`let app = NormalizePathLayer::trim_trailing_slash().layer(app);`
  - 若型別推導需要、額外加 `let app = tower::ServiceExt::into_service(app);` 或 `app.into_make_service()`（plan 階段 R-2 提示、實機驗證）
- [ ] T011 [US2] cargo check + cargo clippy（depends on T010）— `cd rust-api && cargo check --workspace 2>&1 | tail -10` 預期 0 error；`cargo clippy --workspace -- -D warnings 2>&1 | tail -10` 預期無新 warning。對應 SC-005。
- [ ] T012 [US2] docker build rust-api image（depends on T011）— `DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -10`。對應 C-V1。
- [ ] T013 [US2] dev stack 重啟 rust-api container（depends on T012）— `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d rust-api --force-recreate --wait`；`docker compose ... ps` 確認 5 service healthy。
- [ ] T014 [US2] C-V2 regression：`/api/user?page=1` 仍 HTTP 200（depends on T013）— 跑 contracts/verification-commands.md C-V2 命令，預期 HTTP 200。
- [ ] T015 [P] [US2] C-V3 fix：`/api/user/?page=1` 從 404 → HTTP 200（depends on T013）— 跑 C-V3 命令，預期 HTTP 200 + envelope code=0 + records 非空。對應 SC-002。
- [ ] T016 [P] [US2] C-V4 fix：`/api/role/?page=1` 從 404 → HTTP 200（depends on T013）— 跑 C-V4 命令、同 T015 形式。對應 SC-002。
- [ ] T017 [P] [US2] C-V5 跨 router scope verify（depends on T013）— 跑 C-V5 命令、5 端點（admin `/api/menu/` `/api/domain/` `/api/api-endpoint/`、auth `/api/auth/getUserInfo/`、authorization `/api/authorization/assign-users/` POST）皆非 404。對應 SC-003 / FR-009 / Clarifications 2026-05-24 Q1。
- [ ] T018 [P] [US2] C-V6 Casbin enforce 在 normalized path 上不繞過（depends on T013）— 跑 C-V6 命令，GeneralUser 對 `/api/role/?page=1` 與 `/api/role?page=1` 皆回 envelope `code=5001 success=false`。對應 SC-004 / FR-009 / spec Edge Case ①。

**Checkpoint**: US2 完成 — rust-api 全 router NormalizePathLayer 落地、跨 router 一致接受 trailing slash、Casbin enforce 不破。可獨立 deliver。

---

## Phase 5: User Story 3 — Future spec reader 看到準確 design 描述（Priority: P3）

**Goal**: F3-N5 修正、`specs/002` data-model §E4 範例 path 對齊實際 impl 位置。

**Independent Test**: grep §E4 範例 path、`ls` 該 path、檔案存在（per spec US3 Independent Test）。

### Implementation for User Story 3

- [ ] T019 [P] [US3] 002 §E4 path comment fix + errata（spec rot ⑦、FR-007、F3-N5）— 編輯 `specs/002-soft-delete-infrastructure/data-model.md`：
  - line 158 comment `// server/core/src/db/soft_delete.rs（同檔內）` → `// server/model/src/admin/soft_delete_impls.rs（model crate、避循環依賴 per F3 R6）`
  - §E4 開頭加 errata：「> **errata 041 (F3-N5)**：原 brainstorm 期推測 7 個 `impl SoftDeletable` block 落於 `server/core/src/db/soft_delete.rs`（trait def 處）；implementer 移到 `server/model/src/admin/soft_delete_impls.rs`（model crate、避循環依賴 per F3 R6）後未回 update 範例 comment、此 errata 補正。」
- [ ] T020 [US3] C-V9 §E4 path 與實 impl 一致 verify（depends on T019）— 跑 contracts/verification-commands.md C-V9 命令，預期：§E4 範例 comment 指向 `soft_delete_impls.rs`；`soft_delete_impls.rs` 含 7 個 `impl SoftDeletable` block；`soft_delete.rs` 含 0 個 impl block。

**Checkpoint**: US3 完成 — F3-N5 結案。可獨立 deliver。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: scope verification、commit、merge、backlog cleanup。

- [ ] T021 C-V10 三邊 scope verify（depends on T001-T020）— 跑 contracts/verification-commands.md C-V10 命令：
  - base-web `git diff HEAD --stat` 0 改動
  - rust-api 限 2 檔（`server/initialize/Cargo.toml` + `server/bin/src/main.rs`）
  - outer 改動：6 處 spec md（specs/021/022/030/039/040 + 002）+ `docs/INTEGRATION-CHECKLIST.md`（T024 將動）+ submodule SHA pin
  - 對應 FR-010 / SC-007
- [ ] T022 第一段 commit — rust-api worktree（depends on T011/T012、不需 T013–T018 完成、但建議 acceptance 全 PASS 後做）— 依 quickstart.md §5.1：
  - `cd rust-api && git status`（確認 branch `rev1-admin-rust-api`）
  - `git add server/initialize/Cargo.toml server/bin/src/main.rs`
  - `git commit -m "feat(rust-api): 加全局 NormalizePathLayer 收 trailing-slash request"`（含詳細 body 引 spec 041 FR-008/009 + Clarifications 2026-05-24 Q1、見 quickstart.md §5.1）
  - **Push 須 user 同意**（per ~/.claude/CLAUDE.md §5）：`git push origin rev1-admin-rust-api`
- [ ] T023 第二段 commit — outer feature branch（depends on T021、T022）— 依 quickstart.md §5.2：
  - 回 outer root、確認 branch `041-spec-hygiene-pass-1`
  - `git add` rust-api + 6 處 spec md + `docs/INTEGRATION-CHECKLIST.md`（T024 之後）
  - `git commit -m "chore(submodule): bump rust-api to <SHA> — 041 spec hygiene pass 1"`（含 7 處 spec md + INTEGRATION-CHECKLIST 更新摘要、見 quickstart.md §5.2）
- [ ] T024 INTEGRATION-CHECKLIST 移除 R4 + F3-N5、加 041 entry（depends on T008、T018、T020；可在 T023 commit **之前**完成、與 T023 同一 commit）— 編輯 `docs/INTEGRATION-CHECKLIST.md`：
  - 從「衍生 follow-up」table 移除 R4 row 與 F3-N5 row
  - 「已完成里程碑」加 1 行 entry（per quickstart.md §6.2 體例：日期 + outer/merge/rust-api SHA + spec link + 一句話描述）
  - 對應 FR-012
- [ ] T025 C-V11 backlog cleanup verify（depends on T024）— 跑 contracts/verification-commands.md C-V11 命令、確認 R4 / F3-N5 不再出現於 backlog 表、041 entry 在已完成里程碑。對應 SC-008。
- [ ] T026 git merge 041 → rev1-admin-root（depends on T023、T025；**user 同意才執行**）— `git checkout rev1-admin-root && git merge --no-ff 041-spec-hygiene-pass-1 -m "Merge feature 041-spec-hygiene-pass-1"`；後 push 須 user 再次同意。

**Checkpoint**: 041 整 feature 落地、acceptance 全綠、backlog 已 cleanup、merge 回 default。

---

## Dependencies & Execution Order

### Story Independence Graph

```
US1 (P1, 6 spec md edits)  ─┐
US2 (P2, rust-api + 5 C-V)  ─┼─→ Polish (scope verify, commit, merge, backlog)
US3 (P3, F3-N5 1 spec md)  ─┘
```

3 個 user story 完全獨立、可任意順序或平行執行。Polish phase 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001–T006 | — (各自獨立) |
| T007 | T001–T006 |
| T008 | T007 |
| T009 | — |
| T010 | T009 |
| T011 | T010 |
| T012 | T011 |
| T013 | T012 |
| T014–T018 | T013 |
| T019 | — |
| T020 | T019 |
| T021 | T001–T020（全 spec md + rust-api 改完）|
| T022 | T011 + T012（可不等 C-V 全 PASS、但建議等）|
| T023 | T021 + T022 + T024 |
| T024 | T008 + T018 + T020 |
| T025 | T024 |
| T026 | T023 + T025（**user 同意**）|

---

## Implementation Strategy（user 偏好順序）

User 在 plan 階段表達偏好「rust-api 改動先、acceptance 後做」、而非 spec-kit 預設「MVP US1 → US2 → US3」。融合兩種：

### 推薦執行批次

**Batch 1（平行起手）**：
- T009 + T010（US2 rust-api 改動）
- T001 + T002 + T003 + T004 + T005 + T006（US1 6 處 spec md edit、各 [P]）
- T019（US3 spec md edit）

→ 13 個 task 平行；spec md edit 與 rust-api code edit 完全無 conflict。

**Batch 2（build/restart）**：
- T011（cargo check）→ T012（docker build）→ T013（dev stack restart）

→ 3 個 task 序列。

**Batch 3（acceptance）**：
- T007 + T008（US1 verify）
- T014 + T015 + T016 + T017 + T018（US2 verify、T014 sequential、T015-T018 [P]）
- T020（US3 verify）

→ T007/T008 不需等 rust-api restart，可在 Batch 1 後就開始（早期 PASS US1 可獨立 deliver）；US2 acceptance 須等 T013 完成。

**Batch 4（polish）**：
- T021（scope diff）→ T022（rust-api commit）→ T024（backlog cleanup）→ T023（outer commit）→ T025（backlog verify）→ T026（merge）

→ 6 個 task 大致 sequential、需 user 同意 push / merge。

### MVP Option（per spec-kit framework）

若需 incremental delivery：
- **MVP-1（US1 only）**：完 Batch 1 中 T001-T006 + Batch 3 中 T007/T008 + 縮減版 commit/merge。**0 rust-api 改動**、即可 deliver 「regression 操作員不再撞 spec rot 坑」。
- **MVP-2（US1+US3）**：加 T019 + T020、低 cost cleanup。
- **Full feature（US1+US2+US3）**：依 Batch 1-4 完整跑。

User 偏好「Full feature 一次到位」、不採 MVP 拆分（per brainstorm Approach A 已敲定）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 會讀本 tasks.md、偵測 subagent 可用後派遣（或本 conversation 內逐 task 執行）。每完成一單元做兩階段 review：① spec compliance（對照 spec.md）→ ② code quality（rust-api 改動部分）。

每 implementer 完成 task 後、勾 `[x]`、記錄關鍵實機結果（C-V 命令 actual output、grep 確認、commit SHA）。

---

## Summary

- **Total tasks**: 26
- **By user story**: US1 = 8 tasks（T001-T008）、US2 = 10 tasks（T009-T018）、US3 = 2 tasks（T019-T020）、Polish = 6 tasks（T021-T026）
- **Parallel opportunities**: T001-T006（[P] 6 並、US1 spec md edits）、T015-T018（[P] 4 並、US2 acceptance）；跨 phase 平行：US1 spec md edits + US2 rust-api edits + US3 spec md edit 完全互不影響
- **Independent test criteria**: US1 = C-V8（6 條 regression 重跑全 PASS）、US2 = C-V5（5 端點跨 router scope）、US3 = C-V9（§E4 path 與 impl 一致）
- **Suggested MVP scope**: US1 only（per spec-kit framework P1 = MVP）；但 user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 26 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
