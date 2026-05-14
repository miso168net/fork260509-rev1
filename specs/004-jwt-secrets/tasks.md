---

description: "Task list for F1.1 — jwt-secrets implementation"
---

# Tasks: F1.1 — jwt-secrets

**Input**: Design documents from [`specs/004-jwt-secrets/`](.)
**Prerequisites**: [`plan.md`](./plan.md) ✓、[`spec.md`](./spec.md) ✓、[`research.md`](./research.md) ✓、[`data-model.md`](./data-model.md) ✓、[`contracts/claim-contract.md`](./contracts/claim-contract.md) ✓、[`quickstart.md`](./quickstart.md) ✓

**Tests**: F1.1 spec.md **明示要求 unit test + integration test**（SC-001~004 unit / SC-005~007 integration boot panic / SC-009 F3 既有 test compat、皆為 explicit request）— test tasks 為 implementation 必要部分、不是 optional。**無 real-postgres 依賴**（unit + integration test 都走 pure Rust + std::panic::catch_unwind）。

**Organization**: F1.1 spec.md 單一 P1 US（prod hardening atomic increment）→ Phase 3 內單一 [US1] 包含全部 acceptance dimensions A-F

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to ([US1] = F1.1 唯一 P1 US)
- file paths 為 **repo-relative**（從 `fork260509-rev1/` workspace root 起算）

## Path Conventions

- **rust-api worktree**: `rust-api/server/config/...`、`rust-api/server/resources/...`、`rust-api/server/initialize/tests/...`
- **specs (outer)**: `specs/004-jwt-secrets/contracts/claim-contract.md`（plan 階段已建、tasks 階段 sanity check）
- 無 outer .github/workflows 改動（F1.1 不引入新 CI lint）

---

## Phase 1: Setup（環境 sanity check + baseline）

**Purpose**: 確認 outer feature branch + worktree state + 記錄 before snapshot 供 polish 階段 verify

- [x] T001 確認 outer 在 `004-jwt-secrets` feature branch、`rust-api/` worktree 行首空格 (`git status` + `git submodule status` + `cd rust-api && git branch --show-current`、預期 `rev1-admin-rust-api`)；並記錄 baseline snapshot：(a) `application.yaml` jwt_secret 既有值（`"soybean-admin-rust"`、預期）(b) `application-test.yaml` jwt_secret 既有值（同上、預期）(c) `config_init.rs:66` `init_config::<JwtConfig>` callsite 存在 (d) `validate_jwt_secret` 在 codebase 內**不**存在（baseline 應為 0 命中、F1.1 後變 >0）；輸出存到本檔 §Baseline Snapshot 段供 SC 對比

---

## Phase 2: Foundational（BLOCKING prerequisites）

**Purpose**: 建立 `secret_loader` 模組 + JwtConfig doc + `config_init` integration — **all subsequent [US1] tasks depend on this phase**

**⚠️ CRITICAL**: 此 phase 完成前所有 [US1] tasks 不可開始（會引用未定義的函式 / 模組）

- [x] T002 新建 `rust-api/server/config/src/secret_loader.rs` — 定義 `PLACEHOLDER_SECRETS: &[&str]` const（含 6 個 blacklist 值："soybean-admin-rust" / "change-me" / "change-me-jwt-secret" / "your-secret-here" / "PLACEHOLDER" / "TODO"）+ `pub fn load_secret_from_file_if_set(base_envvar: &str) -> Option<String>`（讀 `<base_envvar>_FILE` env var → fs::read_to_string + trim + 返 Some；read failure panic with file path + IO error + Docker secret mount hint；envvar 未 set 返 None）+ `pub fn validate_jwt_secret(secret: &str)`（panic on empty / placeholder / length<32、含 friendly message 標 source + 修正建議 `openssl rand -hex 32`）；per [`data-model.md`](./data-model.md) §E1
- [x] T003 修改 `rust-api/server/config/src/lib.rs` — 加 `pub mod secret_loader;` 一行（依字母順序）
- [x] T004 [P] 修改 `rust-api/server/config/src/model/jwt_config.rs` — 擴 doc comment 說明 `_FILE` precedence + strict validation rules（per [`data-model.md`](./data-model.md) §E3）；struct 不動（per spec FR-014）
- [x] T005 修改 `rust-api/server/config/src/config_init.rs` — 在 `init_from_file` 內、`global::init_config::<JwtConfig>(config.jwt).await` 之前、加入 2 行 integration：(a) `if let Some(v) = secret_loader::load_secret_from_file_if_set("APP_JWT_JWT_SECRET") { config.jwt.jwt_secret = v; }`（_FILE precedence override）(b) `secret_loader::validate_jwt_secret(&config.jwt.jwt_secret);`（strict validation panic on fail）；per [`data-model.md`](./data-model.md) §E2

**Checkpoint**: Phase 2 完成 → `cargo check -p server-config` 應 pass（secret_loader 獨立可編譯 + config_init integration 不破壞既有）；尚無行為改變、resources files 仍 placeholder、boot 會 panic（intentional、為 Phase 3 resources fix 之前狀態）

---

## Phase 3: User Story 1 [US1] — rust-api JWT secret prod hardening + envvar 注入機制（P1）🎯 MVP

**Goal**: Resources files 修 + claim contract doc + unit/integration test 全交付、F1.1 完整交付 prod hardening + claim 對齊 doc + `_FILE` 注入機制

**Independent Test**: 跑 [`quickstart.md`](./quickstart.md) Step 1-10 全部 Pass → SC-001 ~ SC-011 全 11 個指標達成

### Dimension D — Resources files 修（FR-010 ~ FR-012）

- [x] T006 [P] [US1] 修改 `rust-api/server/resources/application.yaml` — `jwt.jwt_secret` 值改為 `"change-me-jwt-secret"`（在 PLACEHOLDER_SECRETS blacklist 內、boot 必 panic + 友善 error msg）；保留既有 issuer / expire 不動；加 yaml comment 註明 `# F1.1: prod 必透過 APP_JWT_JWT_SECRET_FILE 或 APP_JWT_JWT_SECRET envvar 設真 secret；產生方式：openssl rand -hex 32`；per [`data-model.md`](./data-model.md) §E4
- [x] T007 [P] [US1] 修改 `rust-api/server/resources/application-test.yaml` — `jwt.jwt_secret` 改為 32-char dev secret（例：`"dev-test-secret-padded-to-thirty-two!"`、38 chars > 32、合規通過 strict validation；確切字串 implementer 可選其他 ≥32-char 合規值）；保留既有 issuer / expire 不動；加 yaml comment 註明 `# F1.1: test secret、32-char 合規值通過 strict validation；公開於 yaml 不影響 prod`
- [x] T008 [P] [US1] 新建 `rust-api/server/resources/application.yaml.example` — deployment template、含 (a) jwt section placeholder `"REPLACE_VIA_ENV_OR_FILE"` (b) 4 個 envvar override 範例（dev bare envvar / prod Docker secrets + `_FILE` 各一）(c) `openssl rand -hex 32` 產 secret 指引 (d) precedence 規則註解（_FILE > bare > yaml）；per [`data-model.md`](./data-model.md) §E4

### Dimension E — Claim contract spec doc（FR-013）

- [x] T009 [US1] 驗證 `specs/004-jwt-secrets/contracts/claim-contract.md` 存在 + 內容齊（plan 階段已建、本 task 為 sanity check + 視情況補充）：列 11 fields（sub/exp/iss/aud/iat/nbf/jti 標準 7 個 + username/role/domain/org custom 4 個）+ 用途 + F1.2 / F10 future extensions reserved（token_type / kid / family_id）；per [`contracts/claim-contract.md`](./contracts/claim-contract.md)

### Tests for User Story 1（SC-001 ~ SC-004 unit / SC-005~007 integration / SC-009 F3 compat — explicit request）

- [x] T010 [P] [US1] 新建 `rust-api/server/config/tests/jwt_secret_validation.rs` — 7+ 個 unit test fn：
  - `validate_empty_secret_panics` (`#[should_panic(expected = "empty")]`)
  - `validate_placeholder_secret_panics` × N（每個 PLACEHOLDER_SECRETS 黑名單值都驗、`#[should_panic(expected = "placeholder")]`）
  - `validate_short_secret_panics` (`#[should_panic(expected = "length")]`、用 `"a".repeat(31)`)
  - `validate_valid_secret_ok` (`"a".repeat(32)` 邊界 + 64-char hex sample 兩個 case)
  - `file_loader_reads_trimmed_content`（用 `tempfile::tempdir` 建 file、寫 `"abc\n"`、驗 trim 後 `"abc"`）
  - `file_loader_panics_on_missing_file` (`#[should_panic(expected = "read failed")]`)
  - `file_envvar_precedence_over_bare`（兩者都 set、驗 `_FILE` value 勝出）
  - 注：tempfile crate 在 server-config dev-dependencies 可能需新增；若無、用 `std::env::temp_dir()` + 手動 cleanup；implementer 選一
- [x] T011 [P] [US1] 新建 `rust-api/server/initialize/tests/jwt_boot_integration.rs` — 2-3 個 integration test fn（透過 `std::panic::catch_unwind` 攔 panic）：
  - `boot_panics_on_placeholder_secret_in_yaml`（無 env override、catch 載入 application.yaml 後 panic、assert msg 含 "placeholder"）
  - `boot_succeeds_with_env_override`（`std::env::set_var("APP_JWT_JWT_SECRET", &"a".repeat(32))`、catch_unwind 應 Ok、assert config.jwt_secret == 32-char）
  - `boot_succeeds_with_file_envvar`（tempfile + set `APP_JWT_JWT_SECRET_FILE`、catch_unwind Ok、assert _FILE precedence 生效）
  - 跑前 + 跑後 cleanup env vars 避免 test 互相 contamination

**Checkpoint**: T002-T011 全部完成 → User Story 1 應 fully functional + 16 acceptance scenarios 全 pass + SC-001~011 全達成

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: SC-001 ~ SC-011 全 11 個指標的 verification + quickstart 完整跑通 + 兩段式 commit 收尾

- [x] T012 [P] SC-001 ~ SC-004 unit test verify：`cd rust-api && cargo test -p server-config jwt_secret_validation 2>&1 | tail -10` — 8 tests all pass ✓
- [x] T013 [P] SC-005 ~ SC-007 integration test verify：`cd rust-api && cargo test --test jwt_boot_integration 2>&1 | tail -10` — 3 tests all pass ✓（Phase 4 發現 bare envvar path bug：`config` crate separator 歧義導致 `APP_JWT_JWT_SECRET` 無法正確 override；已在 `secret_loader::apply_jwt_secret_hardening` 加 explicit `env::var("APP_JWT_JWT_SECRET")` fallback 修正）
- [x] T014 [P] SC-008 grep verify resources files：
  - `grep '"change-me-jwt-secret"' rust-api/server/resources/application.yaml` 預期 1 hit ✓
  - `grep 'soybean-admin-rust' rust-api/server/resources/application-test.yaml` 預期 0 hit ✓
  - `ls rust-api/server/resources/application.yaml.example` 預期 file 存在 ✓
  - `grep -E '(openssl rand|_FILE|APP_JWT)' rust-api/server/resources/application.yaml.example` 預期 ≥3 hits ✓（實際 10 hits）
- [x] T015 SC-009 F3 既有 acceptance test 仍 pass 驗：`export TEST_DATABASE_URL=postgresql://...` + `cd rust-api && cargo test --test soft_delete_basics --test soft_delete_audit_integration --test soft_delete_auth_gate -- --ignored 2>&1 | tail -15` — SKIP（TEST_DATABASE_URL 未設、DB 不可用、F3 acceptance test 留 user verify）
- [x] T016 [P] SC-010 + SC-011 verify：
  - `ls specs/004-jwt-secrets/contracts/claim-contract.md` 預期 file 存在 ✓
  - `grep -cE '^\| `(sub|exp|iss|aud|iat|nbf|jti|username|role|domain|org)`' specs/004-jwt-secrets/contracts/claim-contract.md` 預期 ≥11 ✓（實際 11）
  - `cd rust-api && cargo check --workspace 2>&1 | tail -5` 預期 `Finished dev profile` 0 errors / 0 warnings ✓（0 warnings）
- [x] T017 跑 [`quickstart.md`](./quickstart.md) Step 1-10 完整 verification（含 application.yaml placeholder 驗 / 無 env 觸發 panic / bare envvar / `_FILE` / `_FILE` precedence / missing file panic / `_FILE` 內 placeholder 仍 panic / unit test / F3 既有 acceptance test / claim contract doc + cargo check / integration boot test）— Step 2 release panic verify ✓（boot panic 含 "placeholder" + "change-me-jwt-secret"）；Step 3-7 SKIP（full deploy stack 未建、server start + curl 留 user verify）；其他 steps 已由 T012-T016 cover ✓
- [ ] T018 第一段 commit + push（per CLAUDE.md §6.1）：
  - `cd rust-api && git status` 確認 modified + 新檔
  - `git add server/config/src/secret_loader.rs server/config/src/lib.rs server/config/src/config_init.rs server/config/src/model/jwt_config.rs server/config/tests/jwt_secret_validation.rs server/initialize/tests/jwt_boot_integration.rs server/resources/application.yaml server/resources/application-test.yaml server/resources/application.yaml.example`
  - commit message: `feat(rust-api): F1.1 jwt-secrets — strict secret validation + _FILE pattern + claim contract`
  - **等 user 同意才** `git push origin rev1-admin-rust-api`
- [ ] T019 第二段 commit（outer SHA pin update、per CLAUDE.md Outer branch 預期）：
  - `cd .. && git branch --show-current` 確認 `004-jwt-secrets`
  - `git status` 應看到 `modified: rust-api (new commits)` + `?? specs/004-jwt-secrets/` (若 specs/ 尚未 commit)
  - `git add rust-api specs/004-jwt-secrets/`
  - commit message: `chore(submodule): bump rust-api 到 <短 SHA> — F1.1 jwt-secrets 完整落地`
  - **等 user 同意才** `git push origin "$(git branch --show-current)"`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 無 dependencies、可立即開始
- **Phase 2 (Foundational)**: 依賴 Phase 1 完成 — **BLOCKS** Phase 3 全部 tasks
- **Phase 3 (User Story 1)**: 依賴 Phase 2 完成
  - Dimension D（T006-T008 resources files）全 [P] 平行（不同檔）
  - T009 claim contract doc（plan 階段已建、sanity check 任務）獨立
  - Tests T010-T011 全 [P] 平行（不同 test crate / 不同檔）
- **Phase 4 (Polish)**: 依賴 Phase 3 完成（特別 T017 quickstart 跑前所有 implementation tasks 必完）

### Within Phase 2 Internal Dependencies

```text
T002 (secret_loader.rs NEW)
  └─ T003 (lib.rs pub mod)             — 依賴 T002 exist
  └─ T005 (config_init.rs integration) — 依賴 T002 + T003

T004 (jwt_config.rs doc 擴) [P]         — 獨立、不依賴 T002
```

### Within Phase 3 Internal Dependencies

```text
Dimension D: T006 ‖ T007 ‖ T008                        [P × 3]
T009 claim contract doc verify                          — 獨立、plan 階段已建
Tests: T010 ‖ T011                                      [P × 2]
  └─ runtime 依賴 T002-T008 完成（test 跑時需 implementation 完整）
```

### Within Phase 4 Internal Dependencies

```text
T012 ‖ T013 ‖ T014 ‖ T016   [P × 4]
T015 (F3 既有 test、需 DB)   — 獨立但需 TEST_DATABASE_URL
T017 quickstart              — 依賴 T012-T016 all pass
T018 worktree commit         — 依賴 T017 pass + user 同意
T019 outer SHA pin           — 依賴 T018 完成
```

### Parallel Opportunities

#### Phase 2 內

T004（jwt_config.rs doc）可 [P] 與 T002 同時做（不同檔、無依賴）。T002 + T003 + T005 為線性鏈。

#### Phase 3 內

```text
Batch 1 (Resources files): T006 ‖ T007 ‖ T008   [P × 3]
Batch 2 (Tests writing):   T010 ‖ T011          [P × 2]
T009 contract doc verify 獨立可任意位置插入
```

#### Phase 4 內

```text
T012 ‖ T013 ‖ T014 ‖ T016   [P × 4]、可 cluster 跑
T015 獨立、依賴 DB stack 起來
```

---

## Parallel Example: User Story 1 Resources Files Batch

```bash
# Terminal A: T006 — application.yaml
$EDITOR rust-api/server/resources/application.yaml

# Terminal B: T007 — application-test.yaml
$EDITOR rust-api/server/resources/application-test.yaml

# Terminal C: T008 — application.yaml.example NEW
$EDITOR rust-api/server/resources/application.yaml.example
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

F1.1 唯一 P1 US = 整個 F1.1 feature 範圍。「MVP first」對 F1.1 = 「完整 F1.1」、不可分。

1. Phase 1 Setup（sanity check + baseline）
2. Phase 2 Foundational（**CRITICAL** — secret_loader module + config_init integration、boot 行為已改但 resources 仍 placeholder 故會 panic、為 Phase 3 resources fix 之前狀態）
3. Phase 3 [US1]（resources files 修 + claim contract doc + tests 全交付、F1.1 完整功能就位）
4. **STOP and VALIDATE**: 跑 quickstart.md Step 1-10
5. Phase 4 Polish：SC-001~011 全 11 指標 + quickstart 全套 + 兩段式 commit

### Single Developer Strategy

F1.1 為 small + scope-bounded feature（不涉跨域協調、無 real-postgres dependency）：

- Phase 1 + 2 順序做（線性）
- Phase 3 Batch 1 (resources) + Batch 2 (tests) 可 cluster 做
- Phase 4 verify + commit 收尾

預計 1 個 developer 1-2 個工作天可完成（小於 F2.1 / F3 / F4 的工作量）。

---

## Baseline Snapshot（記錄於 T001）

> Implementation 開始前由 T001 填入；polish 階段 SC verification 對比驗證用

```text
Before implementation (T001 執行時填入):
  application.yaml jwt_secret 既有值: "soybean-admin-rust" ✓ (預期 "soybean-admin-rust")
  application-test.yaml jwt_secret 既有值: "soybean-admin-rust" ✓ (預期同上)
  config_init.rs:66 global::init_config::<JwtConfig> callsite: exist ✓ (line 66 + line 408)
  validate_jwt_secret in rust-api/server/ 命中數: 0 ✓ (預期 0)
  load_secret_from_file_if_set in rust-api/server/ 命中數: 0 ✓ (預期 0)
  application.yaml.example 存在?: No ✓ (預期 No)

After implementation (T012 / T013 / T014 / T016 執行 2026-05-14 Phase 4 verify):
  application.yaml jwt_secret: "change-me-jwt-secret" ✓ (SC-008 pass)
  application-test.yaml jwt_secret: "dev-test-secret-padded-to-thirty-two!" (38 chars) ✓
  application.yaml.example 存在（1627 bytes, ~46 lines）+ 含 envvar / _FILE 範例 ✓ (10 hits on openssl/APP_JWT/_FILE patterns)
  validate_jwt_secret 命中數 in rust-api/server/: 13 (definition 1 + config_init 2 + tests 10)
  load_secret_from_file_if_set 命中數: 11 (definition 1 + config_init 2 + secret_loader apply_fn 1 + tests 7)
  cargo check 全 workspace: 0 errors / 0 warnings ✓ (SC-011 pass)
  Unit test (server-config jwt_secret_validation): 8 passed / 0 failed ✓ (SC-001 ~ SC-004)
  Integration test (jwt_boot_integration): 3 passed / 0 failed ✓ (SC-005 ~ SC-007)（修正 bare envvar path：secret_loader 新增 explicit env::var fallback）
  F3 既有 acceptance test: SKIP（TEST_DATABASE_URL 未設、DB 不可用、留 user verify）
  claim-contract.md 11 fields 列出 ✓ (SC-010)
  T017 Step 2 release panic verify: ✓（boot panic msg 含 "placeholder" + "change-me-jwt-secret" + openssl 修正建議）
  T017 Step 3-7 (server start + curl): SKIP（full deploy stack 未建、留 user verify）
```

---

## Notes

- **[P] tasks = 不同檔、無未完成依賴** — 可放心平行
- **[Story] label = [US1]** — F1.1 唯一 P1 US，所有 Phase 3 task 都標 [US1]
- **Verify tests pass before claiming F1.1 complete**（quickstart Step 1-10 + SC-001~011 全 pass）
- **Commit after each logical group**（不是 task-by-task）— Phase 2 結束 commit / Phase 3 dimension 結束 commit / Polish 結束 commit。但**push 全部等 user 同意**（per CLAUDE.md §6.2）
- **Avoid: 改 base `src/` 任何檔** — Constitution Principle IV 嚴格禁止（F1.1 不動 base、`.env` 也不動）
- **Avoid: 改 `server-core::web::jwt` / `server-core::web::auth::Claims` / `server-middleware::jwt`** — F1.1 範圍邊界（per spec FR-014/015/018、JWT 簽驗 runtime path 完全不動）
- **Avoid: env-mode 分支邏輯** — F1.1 spec FR-019 明示 dev / staging / prod 統一 strict validation
- **Avoid: 為 F1.2 / F10 預埋 token_type / kid / family_id claim** — claim contract doc reserve naming 即可、F1.1 不加實作

---

**Total tasks**: 19
**Per-phase breakdown**: Setup (1) / Foundational (4) / [US1] (6) / Polish (8)
**Parallel opportunities**: Phase 2 T004 ‖ T002-T005 chain（1 個 [P]）；Phase 3 Batch 1 (3) + Batch 2 (2) + T009 = 6 個 [P] within Phase 3；Phase 4 T012-T014 + T016 = 4 個 [P]
**MVP scope**: User Story 1 = 整個 F1.1（prod hardening + envvar 注入機制 atomic increment）
**下一步**：執行 `/speckit-analyze` 跨 artifact 一致性檢查（recommended）或直接 `/speckit-implement` 開始實作
