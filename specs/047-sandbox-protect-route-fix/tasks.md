---
description: "Task list for 047 sandbox-protect-route-fix"
---

# Tasks: 047 sandbox-protect-route-fix

**Input**: Design documents from `/specs/047-sandbox-protect-route-fix/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 含 8 個 unit test 作為 US2 主要交付物（非 optional、per Q1 clarification 拍板雙覆蓋）；test 為 production fix 的回歸防護、與 production code 同檔、跟著 `cargo test` 一般流程跑（無 `#[ignore]`）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律：unit test 提供 verifiable / reproducible quality gate。

**Organization**：依 spec.md 2 user story（US1 = P1 MVP / US2 = P1）+ Setup + Polish 分 phase；US1 為 production fix、US2 依賴 US1（test 驗 US1 行為）；Phase 1 minimal（1 Cargo.toml task）+ Phase 2 skipped。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：T006 / T007 同 `api_key_middleware.rs::tests` 不同 sub-area（Simple validator 區 vs Complex validator 區）標 `[P]` 是「邏輯獨立、無 inter-task dependency」、**不是**「subagent 並行 dispatch」；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。本 feature 全 task touch 同 1 production file + 1 Cargo.toml file、無跨檔真實並行。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**：唯一 setup task 為 server-core dev-deps 加 tower util feature（per [research R-1.4](./research.md)）—— US2 unit test 用 `tower::ServiceExt::oneshot` 需此 feature。

- [ ] T001 改 `rust-api/server/core/Cargo.toml` —— `[dev-dependencies]` 段（既有空段）加 `tower = { workspace = true, features = ["util"] }` 1 行。per [data-model §E2.1](./data-model.md)、[research R-1.4](./research.md)。對應 FR-008 prereq（unit test 編譯需）。

**Checkpoint**：tower util feature 就位、US2 可開始。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 feature 2 user story 同 1 production file、US2 依賴 US1、無跨 story 共用 foundational 設施。Phase 2 跳過。

*(no tasks)*

---

## Phase 3: User Story 1 — Production HTTP 401 + WWW-Authenticate header fix（Priority: P1）🎯 MVP

**Goal**：`rust-api/server/core/src/sign/api_key_middleware.rs` 內 `api_key_middleware` 函式兩 error 分支（missing 5003 / invalid 5004）改 HTTP 401 + `WWW-Authenticate: ApiKey` header + body envelope 保留；同檔抽 `unauthorized_response(code, msg)` helper、caller match block 改 call helper。production fix 同時覆蓋 Simple validator 與 Complex validator 兩 path、雙 sandbox endpoint 同步生效。

**Independent Test**：grep `unauthorized_response` helper 1 hit + `StatusCode::UNAUTHORIZED` ≥1 hit + `header::WWW_AUTHENTICATE` ≥1 hit；dev stack 跑著 + docker rebuild rust-api 後、curl `/api/sandbox/simple-api-key` 帶 invalid `x-api-key: bogus-XYZ` → HTTP 401 + `WWW-Authenticate: ApiKey` header + body `code:5004 success:false`。

### Implementation for User Story 1

- [ ] T002 [US1] 改 `rust-api/server/core/src/sign/api_key_middleware.rs` —— (a) 既有 use 段補 `axum::http::{header, HeaderValue, Response, StatusCode}` 與 `axum::Json`；(b) 加 `fn unauthorized_response(code: u16, msg: &str) -> Response<Body>` helper（per [data-model §E1.1](./data-model.md)、構造 `(StatusCode::UNAUTHORIZED, Json(Res::<()>::new_error(code, msg))).into_response()` + `header::WWW_AUTHENTICATE: "ApiKey"` header insert）。對應 FR-001/002、[research R-4](./research.md)。
- [ ] T003 [US1] 同檔 `api_key_middleware` 函式 `match validate_request(&validator, &req)` block 兩 error 分支改 call helper：`Ok(false)` → `unauthorized_response(CODE_PERMISSION_API_KEY_SIGNATURE_INVALID, "Invalid API key or signature")`、`Err(e)` → `unauthorized_response(CODE_PERMISSION_API_KEY_MISSING, e)`。`Ok(true)` pass-through + non-protected path short-circuit 維持原行為（FR-003 + FR-004）。Depends on T002。per [data-model §E1.2](./data-model.md)。對應 FR-001/002/003/004。
- [ ] T004 [US1] 本機 `cargo check` verify production code 編譯 —— docker run `cargo check -p server-core 2>&1 | tail -10`、expect `Finished dev profile` 無 error / warning。對應 SC-002 prereq。

**Checkpoint**：US1 完成 —— production fix 就位、無 test 驗證、依賴 docker rebuild + Phase 5 acceptance 確認 wire 端行為。

---

## Phase 4: User Story 2 — 8 Unit Tests（Simple 4 + Complex 4、Priority: P1）

**Goal**：同檔 `api_key_middleware.rs::#[cfg(test)] mod tests` 加共用 test helper（`dummy_handler` / `build_test_router` / `parse_body_envelope`）+ 8 個 `#[tokio::test]`（per Q1 clarification 拍板雙覆蓋）：Simple validator 4 個（missing / invalid / valid / non-protected）+ Complex validator 4 個（missing-field / invalid-signature / valid-signed / invalid-timestamp）。每 test 用 `tower::ServiceExt::oneshot` 驅 minimal `axum::Router` + dummy handler、unique path 避免 `PROTECTED_PATHS` 跨 test 污染。

**Independent Test**：`cargo test -p server-core sign::api_key_middleware -- --nocapture` 輸出 `test result: ok. 9 passed; 0 failed`（本 feature 加 8 + 既有 `test_api_key_sign` 1 個 = 9）、跑時間 < 2 second、無 `#[ignore]`。

### Implementation for User Story 2

- [ ] T005 [US2] 同檔 `#[cfg(test)] mod tests` 段加共用 test helper（per [data-model §E3.1](./data-model.md)）：(a) `async fn dummy_handler() -> &'static str { "ok" }`；(b) `fn build_test_router(path: &str, validation: ApiKeyValidation) -> Router`（`Router::new().route(path, get(dummy_handler)).layer(from_fn(...))`）；(c) `async fn parse_body_envelope(response: Response) -> serde_json::Value`；(d) tests 模組 use 段補 `axum::{body::{Body, to_bytes}, http::{header, Request, StatusCode}, middleware::from_fn, routing::get, Router}` + `tower::ServiceExt`。Depends on T001（tower util feature）。對應 FR-008 prereq。
- [ ] T006 [P] [US2] 同檔 tests 模組加 Simple validator 4 個 unit test（per [data-model §E3.2](./data-model.md) table row 1-4 + [§E3.3](./data-model.md) 樣本 source）：(a) `simple_missing_api_key_returns_401_with_www_authenticate`；(b) `simple_invalid_api_key_returns_401_with_www_authenticate`；(c) `simple_valid_api_key_passes_through`；(d) `simple_non_protected_path_passes_through`。每 test 用 unique path（`/test-simple-missing` / `/test-simple-invalid` / `/test-simple-valid` / `/test-simple-non-protected`）+ `SimpleApiKeyValidator::new() + add_key("valid-key")` setup + `ServiceExt::oneshot` send。Depends on T005。對應 FR-008(a)(b)(c)(d)、[research R-2](./research.md)。
- [ ] T007 [P] [US2] 同檔 tests 模組加 Complex validator 4 個 unit test（per [data-model §E3.2](./data-model.md) table row 5-8 + [§E3.4](./data-model.md) 樣本 source）：(e) `complex_missing_field_returns_401_with_www_authenticate`（缺 AccessKeyId）；(f) `complex_invalid_signature_returns_401_with_www_authenticate`；(g) `complex_valid_signed_request_passes_through`（HMAC sig build per `test_api_key_sign` 既有 pattern）；(h) `complex_invalid_timestamp_returns_401_with_www_authenticate`（query `t=non-numeric`）。每 test unique path + `ComplexApiKeyValidator::new(None) + add_key_secret("test-access-key", "test-secret-key")` setup + memory nonce store。Depends on T005。對應 FR-008(e)(f)(g)(h)、[research R-3](./research.md)。
- [ ] T008 [US2] C-V2 acceptance — 本機 docker run cargo test：`cargo test -p server-core sign::api_key_middleware -- --nocapture 2>&1 | tail -20`、expect `test result: ok. 9 passed; 0 failed`（8 new + 1 existing `test_api_key_sign`）；加 grep 8 test fn naming 命中（per [contracts C-V2](./contracts/verification-commands.md) shell script）。Depends on T006 + T007。對應 SC-002、FR-008。

**Checkpoint**：US2 完成 —— 8 個 unit test 全 PASS、production fix 有完整 regression 防護、雙 validator type 全覆蓋。**MVP-worthy（test 證據是 verifiable / reproducible quality gate、Q1 拍板雙覆蓋確保未來 Complex validator refactor 也有保護）**。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：rust-api worktree commit + docker rebuild + dev stack 重啟 + 雙端點 wire-level acceptance + outer 多段 commit + merge + SHA backfill + 最終 acceptance 全綠 verify。

- [ ] T009 rust-api worktree commit US1+US2（**單 commit、production fix + 8 unit test + Cargo.toml 一體**、per [quickstart Step 1.6](./quickstart.md)）：進 `rust-api/` worktree、`git add server/core/Cargo.toml server/core/src/sign/api_key_middleware.rs`、commit message 對齊 quickstart 範本（feat 標 047 US1+US2、含 Q1 clarification + A1 scope 拍板 + Constitution 5/5 PASS 引用）。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T010 docker rebuild rust-api image + dev stack restart rust-api service + verify healthy + drainer 跑著（per [quickstart Step 2](./quickstart.md)）：`docker build -t rust-api:rev1-admin-rust-api ./rust-api`（~5-15min）→ `$PC up -d --force-recreate --no-deps rust-api && sleep 12` → `$PC ps` rust-api status `Up X seconds (healthy)`、`$PC logs --tail=200 rust-api | grep drainer` 命中。對應 SC-001。
- [ ] T011 [P] C-V3 acceptance — 雙端點 8 case curl real-wire 驗證（per [contracts C-V3](./contracts/verification-commands.md)）：Simple 4 case (`valid test-api-key` / `invalid bogus-XYZ` / no header / empty header) + Complex 4 case (valid HMAC-signed query / invalid signature / missing AccessKeyId / invalid timestamp non-numeric)、each case 驗 HTTP status + `WWW-Authenticate: ApiKey` response header（401 case）+ body envelope code/success。對應 SC-003、FR-001/002/003/004。
- [ ] T012 [P] C-V4 boundary verify（per [contracts C-V4](./contracts/verification-commands.md)）：`git diff base-web/` 0 line、`find rust-api/migration/src -newer spec.md` 0 hit、`find rust-api/server/model/src/admin/entities -newer spec.md sys_*.rs` 0 hit、`git diff rust-api/Cargo.toml` 0 line in `[workspace.dependencies]`、`git diff rust-api/server/middleware/src/jwt.rs rust-api/server/middleware/src/casbin_envelope_adapter.rs` 0 line、`git diff rust-api/server/core/src/web/res.rs` 0 line、`grep -c "pub async fn api_key_middleware"` 1 hit、`grep -cE "async fn (simple|complex)_(missing|invalid|valid|non_protected)"` ≥8 hit。對應 SC-004/005、FR-005/006/007/010。
- [ ] T013 outer feature branch commit 1 — rust-api SHA pin bump（per [quickstart Step 3.1](./quickstart.md)）：`RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)`、`git add rust-api`、`git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 047 US1+US2 sandbox protect_route HTTP 401"`（含完整 body 說明 US1 fix + US2 8 unit test + tower util dev-dep）。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T014 outer feature branch commit 2 — INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker（per [data-model §E4](./data-model.md) + [quickstart Step 3.2](./quickstart.md)）：改 `docs/INTEGRATION-CHECKLIST.md` — 衍生 follow-up backlog 移除 045-N1 row、已完成里程碑加 047 entry（outer/merge/rust-api SHA placeholder 留 backfill）、Current Focus 「現狀」加 047 + 「下一步」改向 base-web TS id 型別債 cleanup sprint；改 `CLAUDE.md` SPECKIT marker idle（Active Spec/Plan = `—`、Phase idle、下一步指向 base-web sprint）。`git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md && git commit`。對應 FR-009、SC-006。
- [ ] T015 (optional) outer feature branch commit 3（implementer-stage expansion candidate (a) 拾取、**user 確認後執行**）：改 `specs/045-facade-atomicity-pass/contracts/verification-commands.md` C-V5 段加 inline comment「post-047 PASS」說明 045 C-V5 grep expectation 在 047 fix 後現可重新跑通；~1-3 line spec docs edit。per [research R-6.1](./research.md)、屬 implementer-stage expansion budget ≤3。對應 FR-011。
- [ ] T016 C-V5 acceptance — `docs/INTEGRATION-CHECKLIST.md` 045-N1 row 0 hit + 047 entry ≥1 hit + 下一步 base-web sprint ≥1 hit、CLAUDE.md SPECKIT marker idle 驗（per [contracts C-V5](./contracts/verification-commands.md)）。Depends on T014。對應 SC-006、FR-009。
- [ ] T017 push origin rust-api worktree —— **user 同意後**：`cd rust-api && git push origin rev1-admin-rust-api`。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T018 push origin outer feature branch —— **user 同意後**：`git push origin 047-sandbox-protect-route-fix`。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T019 merge 047 → rev1-admin-root —— **user 同意後執行**：`git checkout rev1-admin-root && git pull --ff-only origin rev1-admin-root && git merge --no-ff 047-sandbox-protect-route-fix -m "Merge feature 047-sandbox-protect-route-fix"`；push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)、[quickstart Step 4](./quickstart.md)。
- [ ] T020 backfill outer/merge/rust-api SHA + push —— merge 後拿 outer (047 feature branch last commit) SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 047 entry 的 `<...>_SHA` placeholder、small chore commit（per 041/042/043/044/045/046 體例）+ push **須 user 同意**。對應 SC-006、[quickstart Step 5](./quickstart.md)。
- [ ] T021 C-V1~C-V5 全 acceptance final 驗 —— 依 [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重 build + 重跑、全 PASS 才結案。對應 SC-001~006。

**Checkpoint**：047 整 feature 落地、acceptance C-V1~C-V5 全綠、045-N1 結案、boundary verify PASS、merge 回 default、INTEGRATION-CHECKLIST 衍生 backlog 從 3 row 降至 2 row、Constitution 5/5 PASS 維持。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001 — Cargo.toml dev-deps tower util)
   │
Phase 2 Foundational (skipped — 2 US 同 1 file、US2 依賴 US1)
   │
   ├─→ US1 production fix (T002 → T003 → T004、P1 MVP)
   │        │
   │        └─→ US2 8 unit tests (T005 → T006 + T007 [parallel logical] → T008)
   │                 │
   │                 └─→ Phase 5 Polish (T009-T021、commit + docker rebuild +
   │                                      acceptance + merge + backfill)
```

US1 為 production fix MVP；US2 依賴 US1（test 驗 US1 行為、若無 US1 production fix 則 8 unit test 全 fail）；Phase 5 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (Setup Cargo.toml) | — |
| T002 (US1 helper + use 補) | — |
| T003 (US1 caller modify) | T002 |
| T004 (US1 cargo check) | T002 + T003 |
| T005 (US2 test helpers) | T001 + T004 |
| T006 (US2 Simple 4 test) | T005 |
| T007 (US2 Complex 4 test) | T005 |
| T008 (US2 cargo test acceptance) | T005 + T006 + T007 |
| T009 (Polish rust-api commit) | T002-T008 全完 |
| T010 (Polish docker build + restart) | T009 |
| T011 (Polish C-V3 wire acceptance) | T010 |
| T012 (Polish C-V4 boundary verify) | T011（or 並行 T011）|
| T013 (Polish outer commit rust-api SHA pin) | T009（after rust-api push、實際上 T013 commit local 不需 push）|
| T014 (Polish outer commit INTEGRATION-CHECKLIST + CLAUDE.md) | T013 |
| T015 (optional Polish 045 C-V5 update) | T014（user 同意後）|
| T016 (Polish C-V5 acceptance) | T014（or T015 若拾）|
| T017 (push rust-api) | T009 全完、**user 同意**|
| T018 (push outer feature branch) | T014（or T015）、**user 同意**|
| T019 (merge + push rev1-admin-root) | T018 全 PASS、**user 同意**|
| T020 (SHA backfill + push) | T019、**user 同意**|
| T021 (final acceptance C-V1~C-V5) | T020 |

---

## Implementation Strategy（per quickstart Step 1-6 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 + Phase 3 US1 production fix**（T001-T004、~30 min）：
- T001 Cargo.toml 1 line 加
- T002 helper + use 補（同檔 sequential edit）
- T003 caller modify（同檔 sequential edit、depends T002）
- T004 cargo check verify

→ 約 30 min implementer 階段；MVP-1 達成（US1 production fix 落地、但無 unit test 驗）。

**Batch 2 — Phase 4 US2 8 unit tests**（T005-T008、~60 min）：
- T005 共用 test helper（同檔 sequential edit）
- T006 Simple 4 tests（同檔 sequential edit、subagent 1）
- T007 Complex 4 tests（同檔 sequential edit、subagent 2、logical parallel 但 same-file 紀律下序列化）
- T008 cargo test acceptance

→ 約 60 min（Complex valid signed case build HMAC sig 較複雜、佔 ~30 min）；MVP-2 達成（8 test 全 PASS、有完整 regression 防護）。

**Batch 3 — Phase 5 Polish commit + docker + wire acceptance**（T009-T012、~30-45 min）：
- T009 rust-api worktree commit（單 commit）
- T010 docker build + restart（~5-15 min build、本 feature 改動量 small 增量快）
- T011 C-V3 wire acceptance（雙端點 8 case curl、~10 min 含 HMAC sig build）
- T012 C-V4 boundary verify（grep）

→ 約 30-45 min（docker build 為主要時間佔比）。

**Batch 4 — Phase 5 Polish outer commits + merge + backfill**（T013-T021、user-gated）：
- T013 outer commit rust-api SHA pin
- T014 outer commit INTEGRATION-CHECKLIST + CLAUDE.md
- T015 (optional) outer commit 045 C-V5 update（user 確認後）
- T016 C-V5 acceptance docs
- T017-T020 push + merge + backfill（4 個 user 同意關卡）
- T021 final acceptance C-V1~C-V5

→ 約 30 min 含 user 同意等待（不含 user thinking time）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-1（US1 only）**：完 Phase 1 + Phase 3 + 部分 Polish（commit + docker rebuild + wire verification）。**僅交 production HTTP 401 + WWW-Authenticate 行為**（最高 value、closes 045-N1）。US2 unit test 留後（無 unit-level regression 防護、僅靠 wire test）。
- **MVP-2（US1 + US2）**：+ Phase 4 8 unit tests + cargo test verify。**完整 fix + regression 防護**。可 deliver 全套 production fix + test coverage 双覆盖。
- **Full feature（US1 + US2 + 完整 Polish）**：依 Batch 1-4 完整跑（推薦、bundled feature 一次清完、045-N1 結案）。

User 偏好：Full feature 一次到位（per brainstorm 7 section 拍板 + Q1 clarification 雙覆蓋 + 047 brainstorm 統一 acceptance 全綠 / merge 紀律）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 2 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~011 + SC-001~006）→ ② code quality（rust idiom + axum middleware pattern + Constitution 紀律 + tower::ServiceExt::oneshot 使用對齊）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、cargo test PASS count、commit SHA）。

**Phase 5 Polish** 必須在 US1-US2 全部 PASS 後執行（含 user 同意 push / merge / backfill 四個關卡）。

**Implementer-stage Expansion ≤3 處**（per [research R-6](./research.md)）：plan 階段 1 拾取 candidate (T015、045 C-V5 inline comment)、user 確認後拾取；2 拒拾 candidate（complex spec md / Res::IntoResponse 擴展）；超限拒絕並登 047+ follow-up。

---

## Summary

- **Total tasks**: 21
- **By phase**: Setup 1 / Foundational 0 / US1 3 / US2 4 / Polish 13
- **By user story**: US1 = 3 / US2 = 4（共 7 user story tasks）+ Setup 1 + Polish 13
- **Parallel opportunities**：
  - US2 內部 T006 / T007（同檔但邏輯獨立 Simple vs Complex、subagent 序列化）
  - Phase 5 T011 / T012 並行（acceptance 跑 + boundary verify 同期）
- **Independent test criteria**: 每個 US 對應 C-V1~C-V5 中 1-2 條（per spec.md SC-001~006）
- **Suggested MVP scope**: US1 only（MVP-1）—— production fix 即可 close 045-N1；user 已選 Full feature 一次到位（含 US2 unit test 雙覆蓋）
- **Format validation**: ✅ 全 21 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
