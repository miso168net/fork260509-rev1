---

description: "Task list for F4 — response-shape-alignment implementation"
---

# Tasks: F4 — response-shape-alignment

**Input**: Design documents from [`specs/001-response-shape-alignment/`](.)
**Prerequisites**: [`plan.md`](./plan.md) ✓、[`spec.md`](./spec.md) ✓、[`research.md`](./research.md) ✓、[`data-model.md`](./data-model.md) ✓、[`contracts/api-contracts.md`](./contracts/api-contracts.md) ✓、[`quickstart.md`](./quickstart.md) ✓

**Tests**: F4 spec.md **明示要求 acceptance test**（SC-005 涵蓋 11 個 scenarios、SC-007 規範 4 群 business code 各至少 1 test case）— 因此 test tasks 為 implementation 必要部分、不是 optional

**Organization**: F4 spec.md 單一 P1 US（infrastructure-atomic、no further decomposition）→ Phase 3 內單一 [US1] 包含全部 acceptance dimensions A + B + C

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to ([US1] = F4 唯一 P1 US)
- file paths 為 **repo-relative**（從 `fork260509-rev1/` workspace root 起算）

## Path Conventions

- **rust-api worktree**：`rust-api/server/{core,model,api}/...`（per [`plan.md`](./plan.md) Project Structure）
- **base-web worktree**：`base-web/.env`
- 所有 tests：`rust-api/server/tests/`（或既有 integration test 目錄、`/speckit-tasks` audit 階段確認）

---

## Phase 1: Setup（環境 sanity check + baseline）

**Purpose**: 確認 worktree 與 outer branch 狀態、記錄 before snapshot 供 polish 階段 verify

- [ ] T001 確認 outer 在 `001-response-shape-alignment` feature branch、`base-web/` 與 `rust-api/` worktree 行首皆空格 (`git status` + `git submodule status` + `cd rust-api && git branch --show-current`、預期 `rev1-admin-rust-api`)
- [ ] T002 [P] 記錄 baseline snapshot：`cd rust-api && grep -rn 'Res::new_error\([0-9]' server --include='*.rs' | wc -l` 與 `grep -rn 'rename = "' server --include='*.rs' | grep -v 'rename_all'` (camelCase rename 過濾出來)、輸出存到本檔 §Baseline Snapshot 段供 SC-004 / SC-006 對比

---

## Phase 2: Foundational（BLOCKING prerequisites）

**Purpose**: 建立 `code.rs` 常數模組與 `Res<T>` envelope 對齊 — **all subsequent [US1] tasks depend on this phase**

**⚠️ CRITICAL**: 此 phase 完成前所有 [US1] tasks 不可開始（會引用未定義的 const）

- [ ] T003 新建 `rust-api/server/core/src/web/code.rs` — 23 條 `pub const CODE_*` 常數（per [`data-model.md`](./data-model.md) E2 完整定義）+ module-level doc comment 引用 [`spec.md`](./spec.md) E2 表格
- [ ] T004 更新 `rust-api/server/core/src/web/mod.rs` 加 `pub mod code;` 一行
- [ ] T005 修改 `rust-api/server/core/src/web/res.rs` — 5 處 `code: StatusCode::OK.as_u16()` 替換為 `code: code::CODE_SUCCESS`（具體 lines: `res.rs:24,33,51,60` + impl 內所有 success path）；加 `use super::code;` import

**Checkpoint**: Phase 2 完成 → `cargo check` 應 pass、`Res::new_data(x)` 等既有 50 處引用無破壞、JSON 輸出 `code: 0`（從 200 變過去）

---

## Phase 3: User Story 1 [US1] — rust admin response shape 全面對齊 base 預期（P1）🎯 MVP

**Goal**: base + rust + postgres + redis 起來，跑「Soybean / 123456 登入」→ 預期 base 進入 home view 且 console 無 `onBackendFail` 警告（涵蓋 dimension A + B + C 端到端、per [`spec.md`](./spec.md) Independent Test）

**Independent Test**: 跑 [`quickstart.md`](./quickstart.md) Step 2-6 全部 Pass → SC-001 ~ SC-007 全 7 個指標達成

### Dimension A — Middleware error envelope（FR-021 + R6 mapping）

- [ ] T006 [P] [US1] 修改 `rust-api/server/core/src/sign/api_key_middleware.rs` — `line 129` `StatusCode::UNAUTHORIZED.as_u16()` → `code::CODE_PERMISSION_API_KEY_MISSING` (5003); `line 133` `StatusCode::BAD_REQUEST.as_u16()` → `code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID` (5004); 加 `use server_core::web::code;` import
- [ ] T007 [P] [US1] 修改 `rust-api/server/core/src/web/auth.rs` — `line 126` `Res::new_error(StatusCode::UNAUTHORIZED.as_u16(), "Unauthorized")` → 視 enforcement 來源換 `CODE_PERMISSION_CASBIN_DENY` (5001) 或 `CODE_PERMISSION_ROLE_INSUFFICIENT` (5002); msg 改全英文（per R3）
- [ ] T008 [US1] Refactor `rust-api/server/core/src/web/error.rs` — audit 既有 error 對應、用 `code::CODE_*` 常數替換 magic number；確認 `IntoResponse` 路徑全經 `Res<T>` envelope（FR-021）

### Dimension A — Handler magic number 替換（FR-018 + SC-006）

- [ ] T009 [US1] Audit + 替換 `rust-api/server/api/**/*.rs` 內所有 `Res::new_error(<magic_number>, ...)` 呼叫：
  - 跑 `grep -rn 'Res::new_error\([0-9]' rust-api/server/api --include='*.rs'`
  - 對每個 callsite 判斷該用哪個 `code::CODE_*` 常數（validation / permission / business / server 群）
  - 替換、加 `use server_core::web::code;` import
  - 完成後 `grep -rn 'Res::new_error\([0-9]'` 應為 0

### Dimension B — Struct rename_all 替換（FR-010 + FR-011 + FR-014）

- [ ] T010 [P] [US1] 修改 `rust-api/server/model/src/admin/output/sys_authentication.rs`：
  - `AuthOutput` (lines 5-11)：加 `#[serde(rename_all = "camelCase")]` struct-level attribute（refresh_token 自動序列化為 refreshToken）
  - `UserInfoOutput` (lines 13-20)：移除 line 15 與 17 的 per-field `#[serde(rename = "userId")]` / `"userName"`、加 struct-level `#[serde(rename_all = "camelCase")]`、新增 `pub buttons: Vec<String>` 欄位（FR-016/-017、F4 階段 handler 預設 `vec![]`、see T015）
- [ ] T011 [P] [US1] 修改 `rust-api/server/model/src/admin/output/sys_menu.rs`：
  - 移除 6 處 per-field `#[serde(rename = "menuType|menuName|routeName|routePath|createdAt|createdBy")]`
  - 加 struct-level `#[serde(rename_all = "camelCase")]`
  - 等價性 verify：`cargo test sys_menu` 或 manual serialize roundtrip（per spec edge case「既有 per-field rename 替換等價」）
- [ ] T012 [P] [US1] Audit + 補齊 `rust-api/server/model/src/admin/output/*.rs` 其他 struct：
  - `find rust-api/server/model/src/admin/output -name "*.rs" -exec grep -L 'rename_all' {} \;` 列出未加 rename_all 的檔
  - 每個 file 內 `#[derive(Serialize)]` 的 struct 加 `#[serde(rename_all = "camelCase")]`（除非該 struct 不對外輸出）
  - **保留**已有的 enum variant `#[serde(rename = "...")]`（per R5 decision、`sea_orm_active_enums.rs` 等）
- [ ] T013 [P] [US1] Audit + 補齊 `rust-api/server/model/src/admin/input/*.rs` struct：
  - 同 T012 邏輯，但對象是 input DTO
  - 確認 `#[derive(Deserialize)]` 的 struct 都加 `rename_all = "camelCase"`

### Dimension B — Entity 直接 return audit（FR-013 + R4）

- [ ] T014 [US1] Audit `rust-api/server/api/` 與 `rust-api/server/admin/` (若存在) 內所有 handler return type、grep 出直接 return entity 的 endpoint:
  - `grep -rn 'Res<.*Entity\|Res<Vec<.*Entity\|Res<PaginatedData<.*Entity' rust-api/server --include='*.rs'`
  - 對每個 hit、追到對應 entity struct（通常 `rust-api/server/model/src/admin/entities/*.rs`）
  - 若 entity 缺 `rename_all = "camelCase"` → 加上（除非該 entity 含 snake_case-intentional field、需 plan 個別合理化）
  - 列表記錄在本檔 §Audit Results 段（供 review）

### Dimension C — Base `.env` 同步（FR-019）

- [ ] T015 [P] [US1] 修改 `base-web/.env` 第一處 `VITE_SERVICE_SUCCESS_CODE=0000` → `VITE_SERVICE_SUCCESS_CODE=0`；確認 `.env.prod` / `.env.test` 無覆寫此 key（per R7 audit）

### Tests for User Story 1（SC-005 + SC-007 — explicit request）

> **Note**: F4 是 cross-cutting refactor、TDD 嚴格性可放鬆 — test 可在 implementation 完成同期撰寫、不強制 fail-first。但 test 必須在「all dimensions complete」之前寫完、否則無從驗證 acceptance scenarios。

- [ ] T016 [P] [US1] 撰寫 `rust-api/server/tests/response_shape_alignment_dimension_a.rs` — dimension A 5 個 acceptance scenarios（per [`spec.md`](./spec.md) Acceptance Scenarios A1-A5）：HTTP 200 + body code (0 / 8889 / 7778 / 9999 / 4001 / 5xxx middleware error)
- [ ] T017 [P] [US1] 撰寫 `rust-api/server/tests/response_shape_alignment_dimension_b.rs` — dimension B 3 scenarios（per spec B6-B8）：refresh_token → refreshToken、nested struct（UserRoute / MenuRoute）camelCase、UserInfoOutput 替換 per-field rename 等價性；加 snake_case grep test（SC-004：`[a-z]_[a-z]` 命中數 = 0）
- [ ] T018 [P] [US1] 撰寫 `rust-api/server/tests/response_shape_alignment_dimension_c.rs` — dimension C 3 scenarios（per spec C9-C11）：`/auth/login` 含 token + refreshToken、`/auth/getUserInfo` 4 欄位齊全、`buttons: []` 預設空陣列
- [ ] T019 [P] [US1] 撰寫 `rust-api/server/tests/business_code_coverage.rs` — 4 群 code 各 1 test case 證明範圍正確（SC-007）：4001 (validation) / 5001 (permission) / 6001 (business) / 9001 (server)；可用 `Res::new_error(code::CODE_*, ...)` 直接組 response 驗證 JSON 含正確 code

**Checkpoint**: T006-T019 全部完成 → User Story 1 應 fully functional + 11 個 acceptance scenarios 全 pass + 4 群 business code coverage 完整

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: SC-004 / SC-006 兩個自動化指標的最終驗證 + quickstart 完整跑通 + 兩段式 commit 收尾

- [ ] T020 [P] SC-004 驗證：`cd rust-api && cargo test --test response_shape_alignment_dimension_b` 內 snake_case grep test 應 pass（`[a-z]_[a-z]` pattern 在 admin endpoint output JSON 命中數 = 0）；同時手動 `curl /api/auth/getUserInfo | python3 -c '...'` 抽 5 個 endpoint 確認 0 個 snake_case key
- [ ] T021 [P] SC-006 驗證：`cd rust-api && grep -rn 'Res::new_error\([0-9]' server --include='*.rs' | wc -l` 應為 0；對照 baseline (T002) before snapshot 證明全部替換
- [ ] T022 跑 [`quickstart.md`](./quickstart.md) Step 2-6 完整 verification（含 cargo test + base login flow round-trip + DevTools console 檢查）— 所有步驟 Pass 才算 F4 達成
- [ ] T023 第一段 commit + push（per CLAUDE.md §6.1）：
  - `cd rust-api && git status` 確認 modified files
  - `git add server/core/src/web/{code.rs,mod.rs,res.rs,auth.rs,error.rs} server/core/src/sign/api_key_middleware.rs server/model/src/admin/output/*.rs server/model/src/admin/input/*.rs server/tests/response_shape_alignment_*.rs server/tests/business_code_coverage.rs` (具體清單視 audit 結果)
  - commit message：`feat(rust-api): F4 response shape alignment（envelope + camelCase + buttons）`
  - **等 user 同意才** `git push origin rev1-admin-rust-api`
- [ ] T024 第二段 commit（outer SHA pin update、per CLAUDE.md Outer branch 預期）：
  - `cd .. && git branch --show-current` 確認 `001-response-shape-alignment`
  - `git status` 應看到 `modified: rust-api (new commits)`
  - `git add rust-api base-web`
  - commit message：`chore(submodule): bump rust-api 到 <短 SHA> + base-web .env F4`
  - **等 user 同意才** `git push origin "$(git branch --show-current)"`

- [ ] T025 [P] FR-012 verify：`grep -rn 'Option<Vec<' rust-api/server/model --include='*.rs'` 對每個 hit 確認屬「非 collection 語意」（如 Optional field 為 None 表示不該欄位、非空陣列）；對「應為 Vec<T>」的誤用改為 `Vec<T>`
  - **執行時機**：與 T020 / T021 同期 polish verify、quickstart (T022) 與 commit (T023/T024) 之前。本 task 編號在 T024 之後是 append 結果、非執行時序

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 無 dependencies、可立即開始
- **Phase 2 (Foundational)**: 依賴 Phase 1 完成 — **BLOCKS** Phase 3 全部 tasks
- **Phase 3 (User Story 1)**: 依賴 Phase 2 完成
- **Phase 4 (Polish)**: 依賴 Phase 3 完成（特別 T020 / T021 / T022 需要 implementation 完成）

### Within Phase 3 Internal Dependencies

```text
T006, T007, T008 (middleware error)  ─┐
T009 (handler magic number)            ├─> 都依賴 T003 (code.rs)
T010, T011, T012, T013 (struct rename) ─┤
T014 (entity audit)                    ─┘

T015 (base .env)  ── 獨立、無 rust 依賴

T016, T017, T018, T019 (tests)
  └─ Test runtime 依賴 implementation tasks 完成（T006-T015 全做完才能跑 test pass）
  └─ Test writing 可平行進行（只要規範清楚）
```

### Parallel Opportunities

#### Phase 2 內

無 parallel — T003 / T004 / T005 為線性依賴（T004 需 T003 存在；T005 需 T004 module 引用）

#### Phase 3 內（重點 parallel batch）

```text
Batch 1 (Middleware error refactor): T006 ‖ T007 ‖ T008
  └─ 3 個 [P] 各自 modify 不同檔、可平行

Batch 2 (Struct rename audit + replace): T010 ‖ T011 ‖ T012 ‖ T013 ‖ T014
  └─ 5 個 [P]（T014 雖無 [P] 但實際上和 T010-T013 是不同 audit、可平行）
  └─ 各 task target 不同檔組

Batch 3 (Independent): T015 (base .env) — 不依賴 rust 任何 task

Batch 4 (Tests, writing only): T016 ‖ T017 ‖ T018 ‖ T019 (4 個 [P] 平行寫)
  └─ Test 可在 Batch 1+2+3 進行時平行寫作
  └─ Test 跑通則需等 implementation tasks 完成
```

#### Phase 4 內

```text
T020 ‖ T021 平行（不同 verification target）
T022 (quickstart) 依賴 T020 + T021 pass
T023 (worktree commit) 依賴 T022 pass + user 同意
T024 (outer SHA pin) 依賴 T023 完成
```

---

## Parallel Example: User Story 1 Batch 2

可在不同 terminal 或 background agent 平行跑 5 個 tasks：

```bash
# Terminal A: T010 — sys_authentication.rs
$EDITOR rust-api/server/model/src/admin/output/sys_authentication.rs

# Terminal B: T011 — sys_menu.rs
$EDITOR rust-api/server/model/src/admin/output/sys_menu.rs

# Terminal C: T012 — output 其他檔 audit + 補齊
find rust-api/server/model/src/admin/output -name "*.rs" -exec grep -L 'rename_all' {} \;
# 對每個 hit 個別處理

# Terminal D: T013 — input 檔 audit + 補齊
find rust-api/server/model/src/admin/input -name "*.rs" -exec grep -L 'rename_all' {} \;
# 對每個 hit 個別處理

# Terminal E: T014 — entity audit
grep -rn 'Res<.*Entity\|Res<Vec<.*Entity\|Res<PaginatedData<.*Entity' rust-api/server --include='*.rs'
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

F4 唯一 P1 US = 整個 F4 feature 範圍。「MVP first」對 F4 = 「完整 F4」、不可分。

1. Phase 1 Setup（sanity check）
2. Phase 2 Foundational（**CRITICAL** — code.rs + res.rs success path）
3. Phase 3 [US1]（5 dimensions：middleware / handler magic / output rename / input rename / entity audit / base env / tests）
4. **STOP and VALIDATE**: 跑 quickstart.md Step 2-6
5. Phase 4 Polish：SC-004 / SC-006 / quickstart 全套 + 兩段式 commit

### Incremental Delivery (alternative if 分批 review)

雖然 F4 是 atomic infrastructure feature，但實作上可分為兩個 review chunk：

1. **Chunk A: Foundational + Dimension A 替換**（T001-T009）— rust 內 envelope / code namespace / middleware 重構
2. **Chunk B: Dimension B + C + tests + base + polish**（T010-T024）— struct rename 大量改動 + base 對齊 + acceptance test

但 base login flow round-trip（SC-002）需 Chunk A + B 都完成才能驗證。

### Single Developer Strategy

F4 為 single-developer feature（不涉跨域協調）：

- Phase 1 + 2 順序做（無 parallel）
- Phase 3 內 Batch 1 → Batch 2 → Batch 3 → Batch 4（Batch 內各 task 可同時改幾個檔、但 single dev 通常順序做更穩）
- Phase 4 收尾

---

## Baseline Snapshot (記錄於 T002)

> Implementation 開始前由 T002 填入；polish 階段 SC-004 / SC-006 對比驗證用

```text
Before implementation (T002 執行時填入):
  Res::new_error(<magic>) 出現次數: __
  per-field rename for camelCase 數量: __
  snake_case key 在 sample endpoint output 命中數: __

After implementation (T020 / T021 執行時填入):
  Res::new_error(<magic>) 出現次數: 0  (SC-006 pass criteria)
  per-field rename for camelCase 數量: 0（除 enum variant 保留）
  snake_case key 在 sample endpoint output 命中數: 0  (SC-004 pass criteria)
```

---

## Audit Results (記錄於 T012 / T013 / T014)

> Audit phase 填入；review 用

```text
T012 (output/*.rs 補齊 rename_all):
  Files needed rename_all: [..., ...]
  Skipped (no Serialize / 內部用): [..., ...]

T013 (input/*.rs 補齊 rename_all):
  Files needed rename_all: [..., ...]

T014 (entity 直接 return audit):
  Endpoint → Entity: 
    GET /api/sys-user/list → SysUserModel (補 rename_all)
    GET /api/sys-role/list → SysRoleModel (補 rename_all)
    ...
```

---

## Notes

- **[P] tasks = 不同檔、無未完成依賴** — 可放心平行
- **[Story] label = [US1]** — F4 唯一 P1 US，所有 Phase 3 task 都標 [US1]
- **Verify tests pass before claiming F4 complete**（quickstart Step 2-6 + SC-001~007 全 pass）
- **Commit after each logical group**（不是 task-by-task）— Phase 2 結束 commit / Phase 3 dimension 結束 commit / Polish 結束 commit。但**push 全部等 user 同意**（per CLAUDE.md §6.2 + push 確認紀律）
- **Avoid: 改 base `src/` 任何檔** — Constitution Principle IV「base 不改動邊界」嚴格禁止
- **Avoid: 修 Casbin policy** — F4 不動 RBAC enforcement（Principle I）

---

**Total tasks**: 24
**Per-phase breakdown**: Setup (2) / Foundational (3) / [US1] (14) / Polish (5)
**Parallel opportunities**: Phase 3 Batch 1 (3 parallel) + Batch 2 (5 parallel) + Batch 4 (4 parallel) = 最多 12 個 task 可平行
**MVP scope**: User Story 1 = 整個 F4（atomic infrastructure increment）
**下一步**：執行 `/speckit-implement` 開始實作（或手動依本檔 task 順序執行）
