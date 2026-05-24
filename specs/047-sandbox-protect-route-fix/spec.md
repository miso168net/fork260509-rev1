# Feature Specification: 047 sandbox-protect-route-fix

**Feature Branch**: `047-sandbox-protect-route-fix`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "047 sandbox-protect-route-fix — bundle 045-N1 結案 + 補無效 key → 401 真實 test（security adjacency、scope 清晰）。詳見 brainstorm doc `docs/superpowers/047-feature-sandbox-protect-route-fix.md`（已 commit `696e33e` 推 origin、含 7 section user-approved + 2 US + Constitution 5/5 PASS + 5 C-V acceptance 概覽 + A1 scope 拍板（只改 api_key middleware、jwt + casbin envelope adapter 不動）+ 雙 401 status code mapping + WWW-Authenticate: ApiKey header + body envelope 保留 + unit test in api_key_middleware.rs::tests（tower::ServiceExt::oneshot driver）+ 0 base-web + ~2-3hr 落地預估）。"

**前置文件**：[`docs/superpowers/047-feature-sandbox-protect-route-fix.md`](../../docs/superpowers/047-feature-sandbox-protect-route-fix.md)（brainstorm 設計、7 section 已 user-approved）

## Clarifications

### Session 2026-05-25

- Q: unit test (FR-008) + curl acceptance (SC-003) 是否擴及 `/sandbox/complex-api-key` 端點？ → A: B — 8 unit test (4 Simple + 4 Complex) + 8 curl case (4 case × 2 endpoint) 雙端點全覆蓋；Complex valid unit test 需建 HMAC signature + timestamp + nonce + NonceStore mock（per `api_key_middleware.rs::tests::test_api_key_sign` 既有 sign pattern）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Operator / API gateway client 收到 standard REST 401 而不是 200 envelope（Priority: P1）

維運 rust-api 的 operator、或從外部對 `/api/sandbox/simple-api-key`（或未來其他受 api_key 保護端點）發 request 的 program client（非 base-web 主站），當提供無效 / 缺失的 `x-api-key` header 時，應收到 standard REST 401 Unauthorized HTTP status + RFC 7235 強制的 `WWW-Authenticate: ApiKey` header，而不是 HTTP 200 加 body envelope 表達失敗。Body envelope 仍保留原 code (5003 missing / 5004 invalid) + msg + success:false 以對既有 client 不破壞。

**Why this priority**：security middleware HTTP status 對齊 standard REST 是外部 monitoring / load-balancer / WAF / curl `-f` flag 偵測 auth 失敗的常用標的。HTTP 200 + body envelope only 模式使「auth 失敗」與「成功 + 業務錯」對外部工具無法區分、削弱安全層的可觀察性。本 fix 補 045-N1 留下的「真實的『無效 key → 401』」承諾，並維持 body envelope flow 對 client 的兼容（rev1 內部 client 走 body envelope；外部 client 走 HTTP status）。

**Independent Test**：dev stack 12 service healthy 跑著、from host 對 `http://127.0.0.1:11080/api/sandbox/{simple,complex}-api-key` 雙端點各發 4 個 curl（共 8 case）：(a) valid auth → HTTP 200 + body `code:0, success:true`；(b) invalid auth → **HTTP 401** + response header `WWW-Authenticate: ApiKey` + body `code:5004, success:false`；(c) 完全不送 auth header / query → **HTTP 401** + 同 header + body `code:5003, success:false`；(d) 送 empty value auth → **HTTP 401** + 同 header + body `code:5003, success:false`。

**Acceptance Scenarios**（Simple endpoint scenarios 1-4 + Complex endpoint scenarios 5-8、共 8 個）：

1. **Given** dev stack 12 service healthy、`/sandbox/simple-api-key` 由 `protect_route` 註冊保護、Simple validator set 已含 `test-api-key`；**When** `curl -H "x-api-key: test-api-key" http://127.0.0.1:11080/api/sandbox/simple-api-key`；**Then** HTTP status 為 `200` 且 body `code` 為 `0` 且 `success` 為 `true`（valid key 通過、handler 執行）。
2. **Given** 同 baseline；**When** `curl -H "x-api-key: bogus-XYZ"` 同端點；**Then** HTTP status 為 `401`、response header 含 `WWW-Authenticate: ApiKey`、body `code` 為 `5004`、`success` 為 `false`、`msg` 為「Invalid API key or signature」。
3. **Given** 同 baseline；**When** `curl` 同端點但**不**送 `x-api-key` header；**Then** HTTP status 為 `401`、response header 含 `WWW-Authenticate: ApiKey`、body `code` 為 `5003`、`success` 為 `false`、`msg` 為「Missing API key」。
4. **Given** 同 baseline；**When** `curl -H "x-api-key:"` 送 empty value header 同端點；**Then** 行為同 case 3（HTTP 401 + WWW-Authenticate + code 5003）。
5. **Given** dev stack 12 service healthy、`/sandbox/complex-api-key` 由 `protect_route` 註冊保護、Complex validator set 已含 `test-access-key` + secret；**When** `curl` 帶完整 query `?AccessKeyId=test-access-key&t=<ts>&n=<nonce>&sign=<valid-hmac>` 同端點；**Then** HTTP status 為 `200`（valid signature 通過、handler 執行）。
6. **Given** 同 Complex baseline；**When** `curl` 帶 query 但 `sign=<invalid-hmac>` 同端點；**Then** HTTP status 為 `401`、response header 含 `WWW-Authenticate: ApiKey`、body `code` 為 `5004`、`success` 為 `false`。
7. **Given** 同 Complex baseline；**When** `curl` 同端點但 query 缺 `AccessKeyId`（或 `t` / `n` / `sign` 任一必填）；**Then** HTTP status 為 `401`、response header 含 `WWW-Authenticate: ApiKey`、body `code` 為 `5003`、`success` 為 `false`、`msg` 含「Missing X」。
8. **Given** 同 Complex baseline；**When** `curl` 同端點 query 含 `t=invalid-non-numeric`；**Then** HTTP status 為 `401`、response header 含 `WWW-Authenticate: ApiKey`、body `code` 為 `5003`、`success` 為 `false`、`msg` 為「Invalid timestamp」。

---

### User Story 2 — Developer 跑 `cargo test` 看到 8 個 unit test 涵蓋 middleware 全行為（雙 validator type、Priority: P1）🎯 MVP

維護 `api_key_middleware` 的 developer / AI implementer / code reviewer 跑 `cargo test -p server-core sign::api_key_middleware` 應看到 8 個 unit test 全 PASS，涵蓋 Simple validator 4 個（missing / invalid / valid / non-protected）+ Complex validator 4 個（missing field / invalid signature / valid signed / invalid timestamp）。Unit test 不需 dev stack drainer / `TEST_DATABASE_URL` / `#[ignore]`、跟著 `cargo test` 一般執行流程跑，提供快速回歸防護。

**Why this priority**：unit test 是回歸防護的最低成本層、跟 production code 同檔便於修改、無需 DB / dev stack 即可跑；本 US 達成 045-N1 原文「補真實的『無效 key → 401』測試（單元 or integration）」的單元測試承諾、且雙 validator type 全覆蓋（Q1 clarification 拍板）。MVP-worthy 因為「測試證據」是 verifiable / reproducible quality gate。

**Independent Test**：在 rust-api worktree 跑 `cargo test -p server-core sign::api_key_middleware -- --nocapture`、輸出含 8 個 test `... ok`、`test result: ok. 8 passed; 0 failed`、不需任何外部 dependency（dev stack 不需跑）。

**Acceptance Scenarios**：

1. **Given** `api_key_middleware.rs::tests` 含 `simple_missing_api_key_returns_401_with_www_authenticate`；**When** `cargo test` 跑該 test；**Then** test PASS、`response.status() == 401`、`headers.get("WWW-Authenticate")` 等於 `"ApiKey"`、body 解析後 `code == 5003 && success == false`。
2. **Given** `api_key_middleware.rs::tests` 含 `simple_invalid_api_key_returns_401_with_www_authenticate`；**When** 跑該 test；**Then** test PASS、`response.status() == 401`、同 header、body `code == 5004 && success == false`。
3. **Given** `api_key_middleware.rs::tests` 含 `simple_valid_api_key_passes_through`；**When** 跑該 test；**Then** test PASS、`response.status() == 200`、body 為 dummy handler 回的 OK。
4. **Given** `api_key_middleware.rs::tests` 含 `simple_non_protected_path_passes_through`；**When** 跑該 test；**Then** test PASS、`response.status() == 200`、middleware short-circuit 不執行 validation、body 為 dummy handler 回的 OK。
5. **Given** `api_key_middleware.rs::tests` 含 `complex_missing_field_returns_401_with_www_authenticate`（缺 AccessKeyId / timestamp / nonce / signature 任一）；**When** 跑該 test；**Then** test PASS、`response.status() == 401`、`headers.get("WWW-Authenticate")` 等於 `"ApiKey"`、body `code == 5003 && success == false`、`msg` 含「Missing X」。
6. **Given** `api_key_middleware.rs::tests` 含 `complex_invalid_signature_returns_401_with_www_authenticate`；**When** 跑該 test；**Then** test PASS、`response.status() == 401`、同 header、body `code == 5004 && success == false`。
7. **Given** `api_key_middleware.rs::tests` 含 `complex_valid_signed_request_passes_through`（test setup 用 ComplexApiKeyValidator + add_key_secret + HMAC sig build per `test_api_key_sign` 既有 pattern）；**When** 跑該 test；**Then** test PASS、`response.status() == 200`、body 為 dummy handler 回的 OK。
8. **Given** `api_key_middleware.rs::tests` 含 `complex_invalid_timestamp_returns_401_with_www_authenticate`（query `t=non-numeric`）；**When** 跑該 test；**Then** test PASS、`response.status() == 401`、同 header、body `code == 5003 && success == false`、`msg` 為「Invalid timestamp」。

---

### Edge Cases

- **HTTP/2 multiple WWW-Authenticate headers**：若未來 jwt middleware 或其他層也加 `WWW-Authenticate: Bearer` header、RFC 9110 允許同 response 多個 `WWW-Authenticate` line（多 challenge）；此次只動 api_key middleware、其他 middleware 不動、不會撞。
- **Body envelope 對 base-web 的影響**：base-web sandbox 端不調用、`/sandbox/*` 端點 0 base-web 衝擊；若未來 base-web 走某條走 api_key middleware 的 endpoint，base-web axios default `validateStatus < 500` 會把 401 視為 error 走 `onError` path（不走既有 `onBackendFail` envelope flow） → 屆時須 base-web 軌道內處理（W-WEBUI 受管例外）；本 feature 不觸發。
- **WWW-Authenticate value 與 RFC 註冊 scheme**：`ApiKey` 非 IANA-註冊的 authentication scheme，但業界廣泛接受（AWS / Stripe / Cloudflare 等）；本 feature 採實務常用 form。若未來需 RFC strict 合規可改 `Custom realm="rust-api"` 或類似、此屬 047-N4 未來 follow-up scope。
- **PROTECTED_PATHS 靜態跨 test 污染**：unit tests 共享 `PROTECTED_PATHS` 全域 RwLock；每 test 用 unique path（e.g. `/test-missing-XYZ` / `/test-invalid-XYZ`）避免互相 leak、不需 `serial_test` crate。
- **tower::ServiceExt::oneshot reachability**：若 `axum::body` 或 `axum::Router` re-export 路徑無法達 `tower::ServiceExt`，加 `tower = { workspace = true, features = ["util"] }` 進 `server-core` dev-deps（per-crate change、非 workspace 新 dep、不違 FR-006）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`rust-api/server/core/src/sign/api_key_middleware.rs` 內 `api_key_middleware` 函式 `Err(e)` 分支（API key missing / header 不存在 / empty value） MUST 回應 HTTP `401 Unauthorized` status + response header `WWW-Authenticate: ApiKey` + body envelope（既有 `code: CODE_PERMISSION_API_KEY_MISSING (5003)`、`msg`、`success: false` 保留）。
- **FR-002**：同檔 `Ok(false)` 分支（API key/signature invalid） MUST 回應 HTTP `401 Unauthorized` status + response header `WWW-Authenticate: ApiKey` + body envelope（既有 `code: CODE_PERMISSION_API_KEY_SIGNATURE_INVALID (5004)`、`msg: "Invalid API key or signature"`、`success: false` 保留）。
- **FR-003**：`Ok(true)` 分支（valid key） MUST 保持原行為（HTTP 200 pass-through 至下一層 handler、不設 `WWW-Authenticate` header、body envelope 由 handler 決定）。
- **FR-004**：非 protected path（`is_protected_path` 回 false） MUST 維持原 short-circuit 行為（HTTP 200 pass-through、不執行 validation、無 401 response）。
- **FR-005**：`Res<()>::IntoResponse` 既有實作 MUST 不變動；body envelope shape（`{code, data, msg, success}`）對 client MUST 不破壞（rev1 envelope contract 保留）。
- **FR-006**：本 feature MUST 0 schema migration、0 新 application entity、0 新 workspace cargo dep（`rust-api/Cargo.toml` `[workspace.dependencies]` 段 0 line change）、0 新 redis channel、0 新 metric pre-declare、0 新 rust-api endpoint。
- **FR-007**：本 feature MUST 0 base-web 改動（與 W-WEBUI 軌道無關、不觸發 Constitution Principle IV 受管例外、不需 amendment）。
- **FR-008**：`rust-api/server/core/src/sign/api_key_middleware.rs::tests` MUST 新增 8 個 unit test（Q1 clarification：雙 validator type 全覆蓋）：Simple validator 4 個 — (a) `simple_missing_api_key_returns_401_with_www_authenticate`；(b) `simple_invalid_api_key_returns_401_with_www_authenticate`；(c) `simple_valid_api_key_passes_through`；(d) `simple_non_protected_path_passes_through`；Complex validator 4 個 — (e) `complex_missing_field_returns_401_with_www_authenticate`（缺 AccessKeyId / timestamp / nonce / signature 任一）；(f) `complex_invalid_signature_returns_401_with_www_authenticate`；(g) `complex_valid_signed_request_passes_through`（test setup 用 `ComplexApiKeyValidator.add_key_secret(...)` + HMAC signature build per `api_key_middleware.rs::tests::test_api_key_sign` 既有 pattern）；(h) `complex_invalid_timestamp_returns_401_with_www_authenticate`（query `t=non-numeric` 觸發 timestamp parse fail）。每 test 使用 `tower::ServiceExt::oneshot` 驅 minimal `axum::Router` + dummy handler、send mock `Request`、assert response status + headers + body envelope。
- **FR-009**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST 從衍生 follow-up backlog 移除 045-N1 row、已完成里程碑加 047 entry、Current Focus「下一步」改向 base-web TS `id` 型別債 cleanup sprint。
- **FR-010**：jwt middleware（`rust-api/server/middleware/src/jwt.rs`）與 casbin envelope adapter（`rust-api/server/middleware/src/casbin_envelope_adapter.rs`） MUST 不被本 feature 改動（保持 HTTP 200 + body envelope flow、保留 base-web `onBackendFail` logout/refresh-token path）。
- **FR-011**：implementer-stage expansion 拾取上限 MUST ≤ 3 處（per 041 / 043 / 046 體例）；若拾取超限 → 拒絕並登記 047+ follow-up。**Note**：此為 policy constraint、不對應 buildable task；plan / tasks 階段不主動列任何 expansion 候選為 task。

### Key Entities

本 feature 為 rust-api middleware HTTP status + header 修正 + unit test 新加、**無 application data entity**（不動 DB schema）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、12 service（5 既有 + 7 observability）全 healthy state；rust-api 啟動 + drainer 跑著（接 046 baseline、不退化）。
- **SC-002**：`cargo test -p server-core sign::api_key_middleware -- --nocapture` 跑 8 個 unit test（4 Simple + 4 Complex）、輸出 `test result: ok. 8 passed; 0 failed`、無 `#[ignore]` 標註、跑時間 < 2 second（unit test 無外部 dependency；Complex valid case 需 HMAC compute 但 minimal overhead）。
- **SC-003**：dev stack 跑著、from host 對 `http://127.0.0.1:11080/api/sandbox/{simple,complex}-api-key` 雙端點各發 4 case curl（共 8 case）：(a) valid auth → HTTP 200 + body `code:0`；(b) invalid auth → HTTP 401 + response header `WWW-Authenticate: ApiKey` + body `code:5004`；(c) 無 auth header / query → HTTP 401 + 同 header + body `code:5003`；(d) empty / invalid format auth → HTTP 401 + 同 header + body `code:5003`。Complex 端 (a) 需 build HMAC-signed query 對齊 `test_api_key_sign` pattern。
- **SC-004**：`rust-api/server/core/src/sign/api_key_middleware.rs` 內 `#[cfg(test)] mod tests` 包含 8 個 test function、命名對齊 FR-008 (a)~(h) 規定；grep `pub async fn api_key_middleware` 在 production code 區仍 1 hit（function signature 不變、僅內部 error response 構造改）。
- **SC-005**：本 feature 完成後 0 base-web 改動（FR-007 verify：`git diff base-web/` 0 行）、0 schema migration（FR-006 verify：`find rust-api/migration/src -newer specs/047-sandbox-protect-route-fix/spec.md -name "*.rs"` 0 hit）、0 新 application entity（FR-006 verify：`find rust-api/server/model/src/admin/entities -newer ... -name "sys_*.rs"` 0 hit）、0 新 workspace cargo dep（`git diff rust-api/Cargo.toml` 0 line change in `[workspace.dependencies]` 段）。
- **SC-006**：完成後 INTEGRATION-CHECKLIST 衍生 follow-up backlog 從現行 3 row（後 046）降至 2 row（移除 045-N1）；已完成里程碑加 047 entry；Current Focus「下一步」指向 base-web TS id sprint。

## Assumptions

- **dev stack 健康** — 12 service healthy（5 既有 + 7 observability、044 已落地、046 維持）+ rust-api drainer 跑著（baseline 接 046 commit `f188dd0`）。
- **046 落地完整性** — `rust-api/server/core/src/sign/api_key_middleware.rs` 與 `rust-api/server/middleware/src/{jwt,casbin_envelope_adapter}.rs` 為 046 merge 後 HEAD（rust-api SHA `807d7bb`）；本 feature 改的是 046 已驗證的 baseline。
- **rev1 envelope convention** — `Res<T>::IntoResponse` 對所有業務 / 非 security path 維持「HTTP 200 + body envelope」flow；本 feature 為 security middleware 的局部偏離（standard REST conformance）、不改 `Res<T>` 本身、不影響其他 middleware。
- **base-web 不調用 sandbox 端點** — `/sandbox/*` 為 rev1 sample / demo endpoint、production base-web UI 不調用；本 feature HTTP status 升級對 base-web 客戶端 0 影響。
- **A1 scope 拍板** — User 2026-05-25 brainstorm 確認：jwt middleware + casbin envelope adapter **不**改 HTTP status（保留 F4 envelope design + base-web onBackendFail flow + Constitution Principle IV 預設原則）；本 feature scope 僅 `api_key_middleware`。
- **WWW-Authenticate `ApiKey` 採實務 form** — 非 IANA 註冊 scheme、業界廣泛接受（AWS / Stripe / Cloudflare 同模式）；若未來需 RFC strict 合規（如 `Custom realm="..."`），屬 047-N4 follow-up scope。
- **tower::ServiceExt reachability** — Phase 0 grep + cargo check 確認 `tower::ServiceExt::oneshot` 是否經 `axum` re-export 可直用；若不可、`server-core` dev-deps 加 `tower = { features = ["util"] }` per-crate 改動（非 workspace 新 dep、不違 FR-006）。
- **046 acceptance baseline** — C-V1 dev stack 12 service healthy + drainer + /health OK 已在 046 acceptance 驗證、本 feature acceptance C-V1 沿用 baseline。
- **expansion budget ≤3 enforcement** — implementer plan 階段 grep 確認候選 + user 確認後拾取；超限 → 拒絕並登記 047+；候選清單見 brainstorm `§3` 末三條（045 C-V5 / sandbox complex-api-key / `Res::IntoResponse` 擴展）。
