# Research: 047 sandbox-protect-route-fix

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-6 grep + 拍板結果。本 feature 為 security middleware HTTP status / header 升級 + 同檔 unit test 加；研究目標**確認 tower::ServiceExt 可達性 + unit test setup patterns + production fix code shape + implementer-stage expansion 候選**。

---

## R-1 — `tower::ServiceExt::oneshot` 可達性（決定是否需要 server-core dev-deps 新加 feature）

**Source**：spec.md FR-008、edge case「tower::ServiceExt::oneshot reachability」

### R-1.1 — workspace tower 預設 features

**grep**：`grep "^tower" rust-api/Cargo.toml`

```
tower = "0.5.2"                                                   # Tower 中间件库
tower-http = "0.6"
tower-layer = "0.3"
tower-service = "0.3"
```

**Decision**：workspace tower 0.5.2、無顯式 features 設定。tower 0.5.x default features = `["log"]`、**不含** `util` feature；`ServiceExt::oneshot` 在 `tower::util` 模組、需 `util` feature。

### R-1.2 — server-core 既有 tower dep

**grep**：`grep "tower" rust-api/server/core/Cargo.toml`

```
tower = { workspace = true }
tower-layer = { workspace = true }
tower-service = { workspace = true }
```

**Decision**：server-core 既有 `tower = { workspace = true }` 為 production dep、**無 features 設定**、隨 workspace 預設 = `["log"]`、**ServiceExt 不可用**。

### R-1.3 — 既有 tests 使用 ServiceExt 的模式

**grep**：`grep -rn "tower::ServiceExt|use tower::" rust-api/server/`

```
rust-api/server/initialize/tests/jwt_auth_middleware.rs:22:    use tower::{ServiceBuilder, ServiceExt};
rust-api/server/initialize/tests/login_handler_integration.rs:31:use tower::{ServiceBuilder, ServiceExt};
rust-api/server/initialize/tests/auth_login_e2e.rs:23://! `into_make_service_with_connect_info`. `tower::ServiceExt::oneshot` cannot inject
```

**grep**：`grep "tower " rust-api/server/initialize/Cargo.toml`

```
tower = { workspace = true, features = ["full"] }
```

**Decision**：server-initialize 既有 tests 用 `tower::ServiceExt` 的 prerequisite 是 **`features = ["full"]`** 顯式設定（`full` 含 `util`）。server-core 要重用同 pattern 需相同設定。

### R-1.4 — server-core dev-deps 加 tower util feature

**Decision**：server-core `[dev-dependencies]` 段（**目前空段**）加：

```toml
[dev-dependencies]
tower = { workspace = true, features = ["util"] }
```

採 `util` feature 而非 `full`（minimal、僅啟動 `ServiceExt` 所需）。屬 **per-crate dev-dep change、非 workspace 新 dep**（workspace tower 已存在、僅啟動既有 feature）；不違 FR-006 「0 新 workspace cargo dep」。

**Alternatives 考慮**：
- (a) workspace tower 加 `default-features = false, features = ["util", "log"]` —— 影響全 workspace、scope creep、**REJECTED**
- (b) server-core dev-deps 加 `tower = "0.5", features = ["util"]` 不走 workspace —— 違 workspace dep 慣例、**REJECTED**
- (c) **per-crate dev-deps `workspace = true, features = ["util"]`**（R-1.4 拍板）—— minimal、對齊既有 server-initialize 體例（後者用 `full`、本 feature 用 `util` 更保守）—— **ACCEPTED**

### R-1.5 — Cargo.toml 改動行數

**估計**：server-core/Cargo.toml `[dev-dependencies]` 段加 1 行：

```diff
 parking_lot = { workspace = true }
 moka = { workspace = true, features = ["sync"] }

 [dev-dependencies]
+tower = { workspace = true, features = ["util"] }
```

---

## R-2 — Simple validator 4 unit test setup pattern

**Source**：spec.md FR-008 (a)~(d)、Q1 clarification、brainstorm §2.3

### R-2.1 — minimal Router + dummy handler 構造

```rust
use axum::{
    body::Body,
    http::{Request, StatusCode, header},
    middleware::from_fn,
    Router,
    routing::get,
};
use tower::ServiceExt;

async fn dummy_handler() -> &'static str { "ok" }

fn build_simple_test_router(path: &str, validation: ApiKeyValidation) -> Router {
    Router::new()
        .route(path, get(dummy_handler))
        .layer(from_fn(move |req, next| api_key_middleware(validation.clone(), req, next)))
}
```

### R-2.2 — Simple validator setup + send request

```rust
#[tokio::test]
async fn simple_missing_api_key_returns_401_with_www_authenticate() {
    let path = "/test-simple-missing";
    protect_route(path);
    
    let validator = SimpleApiKeyValidator::new();
    validator.add_key("valid-key".to_string());
    let validation = ApiKeyValidation::Simple(validator, SimpleApiKeyConfig::default());
    
    let app = build_simple_test_router(path, validation);
    let req = Request::builder().uri(path).body(Body::empty()).unwrap();
    
    let response = app.oneshot(req).await.unwrap();
    
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        response.headers().get(header::WWW_AUTHENTICATE).unwrap(),
        "ApiKey"
    );
    
    let body_bytes = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body["code"], 5003);
    assert_eq!(body["success"], false);
}
```

### R-2.3 — 4 case 差異點

| Test | Setup diff | Header diff |
|---|---|---|
| `simple_missing_api_key_*` | path 加 protect_route + validator add "valid-key" | 不送 x-api-key header |
| `simple_invalid_api_key_*` | 同上 | 送 `x-api-key: bogus-XYZ` |
| `simple_valid_api_key_passes_through` | 同上 | 送 `x-api-key: valid-key`、expect status 200 + body "ok" |
| `simple_non_protected_path_passes_through` | path **不**加 protect_route + validator add "any-key" | 不送 header、expect status 200 + body "ok"（middleware short-circuit） |

**Decision**：每 test 用 **unique path** (`/test-simple-missing` / `/test-simple-invalid` / `/test-simple-valid` / `/test-simple-non-protected`) 避免測試間共享 `PROTECTED_PATHS` 靜態 RwLock 的污染（**不需** `serial_test` crate、**0 新 dep**）。

---

## R-3 — Complex validator 4 unit test setup pattern（重點：valid signed case 的 HMAC build）

**Source**：spec.md FR-008 (e)~(h)、Q1 clarification

### R-3.1 — Complex validator setup + nonce store

```rust
let validator = ComplexApiKeyValidator::new(None);  // 用 default ApiKeyConfig + memory nonce store
validator.add_key_secret("test-access-key".to_string(), "test-secret-key".to_string());
let validation = ApiKeyValidation::Complex(
    validator,
    ComplexApiKeyConfig {
        key_name: "AccessKeyId".to_string(),
        timestamp_name: "t".to_string(),
        nonce_name: "n".to_string(),
        signature_name: "sign".to_string(),
    },
);
```

`ComplexApiKeyValidator::new(None)` 預設用 `create_memory_store_factory()`、unit test friendly、不需 redis。

### R-3.2 — valid signed query string build pattern

對齊既有 `api_key_middleware.rs::tests::test_api_key_sign`（line 250）pattern：

```rust
#[tokio::test]
async fn complex_valid_signed_request_passes_through() {
    let path = "/test-complex-valid";
    protect_route(path);
    
    let validator = ComplexApiKeyValidator::new(None);
    validator.add_key_secret("test-access-key".to_string(), "test-secret-key".to_string());
    let validation = ApiKeyValidation::Complex(
        validator.clone(),
        ComplexApiKeyConfig { /* per R-3.1 */ },
    );
    
    let app = build_complex_test_router(path, validation);
    
    // build signed query
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let nonce = format!("nonce_{}", timestamp);
    
    let mut params = vec![
        ("AccessKeyId".to_string(), "test-access-key".to_string()),
        ("t".to_string(), timestamp.to_string()),
        ("n".to_string(), nonce.clone()),
    ];
    params.sort_by(|a, b| a.0.cmp(&b.0));
    let signing_string = params.iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>().join("&");
    let signature = validator.calculate_signature(&signing_string, "test-secret-key");
    
    let uri = format!("{}?{}&sign={}", path, signing_string, signature);
    let req = Request::builder().uri(&uri).body(Body::empty()).unwrap();
    
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body_bytes = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
    assert_eq!(&body_bytes[..], b"ok");
}
```

**Decision**：採既有 `test_api_key_sign` 的 sort-by-key + `key=value` join + `calculate_signature` pattern；不重新發明 sig 計算。

### R-3.3 — 4 case 差異點

| Test | Query diff | Expect |
|---|---|---|
| `complex_missing_field_*` | query 不含 `AccessKeyId`（或 `t` / `n` / `sign` 任一）— 本 spec 用缺 `AccessKeyId` 為代表 | status 401 + WWW-Auth + code 5003 + msg "Missing AccessKeyId" |
| `complex_invalid_signature_*` | query 含完整 fields 但 `sign=<wrong>` | status 401 + WWW-Auth + code 5004 |
| `complex_valid_signed_*` | per R-3.2 build proper sig | status 200 + body "ok" |
| `complex_invalid_timestamp_*` | query `t=invalid-non-numeric` | status 401 + WWW-Auth + code 5003 + msg "Invalid timestamp" |

**注意**：Complex missing field 有 4 個可能（`AccessKeyId` / `t` / `n` / `sign`），spec FR-008(e) 用缺 `AccessKeyId` 為單一 test case；若 implementer 偏好 4 sub-cases（用 `#[test_case]` 或多 test fn），屬 implementer-stage discretion、不違 spec FR-008 wording。

---

## R-4 — `unauthorized_response` helper signature 抉擇

**Source**：spec.md FR-001 / FR-002、brainstorm §2.2

### R-4.1 — signature 選項

| Option | Signature | Pro | Con |
|---|---|---|---|
| A | `fn unauthorized_response(code: u16, msg: &str) -> Response` | 對齊 `Res::new_error(code: u16, msg: &str)` signature、minimal | 內部 `Res::new_error(code, msg)` 接 `&str`、msg lifetime fine |
| B | `fn unauthorized_response(code: u16, msg: impl Into<String>) -> Response` | Flexible msg input | 多 generic、call-site 不簡潔 |
| C | `fn unauthorized_response(code: u16, msg: String) -> Response` | 簡單 | call-site 需 to_string()、原 `Err(e)` 是 `&'static str`、不必轉 String |

**Decision**：Option A — `fn unauthorized_response(code: u16, msg: &str) -> Response`。對齊 `Res::new_error` 既有 signature、minimal diff、原 `Err(e)` 為 `&'static str` 直接傳 OK。

### R-4.2 — 函式內容

```rust
use axum::{
    body::Body,
    http::{header, HeaderValue, Response, StatusCode},
    Json,
    response::IntoResponse,
};

fn unauthorized_response(code: u16, msg: &str) -> Response<Body> {
    let mut resp = (
        StatusCode::UNAUTHORIZED,
        Json(Res::<()>::new_error(code, msg)),
    ).into_response();
    resp.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static("ApiKey"),
    );
    resp
}
```

返 `Response<Body>` 而非 `impl IntoResponse`：caller 已是 `into_response()` 返 Response 的 context、明確 type 對齊 axum middleware return type。

### R-4.3 — caller 改動

```rust
match validate_request(&validator, &req) {
    Ok(true) => next.run(req).await.into_response(),
    Ok(false) => unauthorized_response(
        code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID,
        "Invalid API key or signature",
    ),
    Err(e) => unauthorized_response(code::CODE_PERMISSION_API_KEY_MISSING, e),
}
```

**Diff 估計**：~12 line production code（2 處 `.into_response()` → helper call + 1 處 helper fn 新加 + 1 use 補 `axum::http::{header, HeaderValue, StatusCode}` + 1 use 補 `axum::Json`）。

---

## R-5 — `is_protected_path` short-circuit unit test（spec FR-004）

**Source**：spec.md FR-004 + Acceptance Scenario 4 + R-2.3 case 4

**設計**：Test 不對 path call `protect_route()`、middleware 在 `if !is_protected_path(req.uri()) { return next.run(req).await.into_response(); }` 走短路、無論有無 x-api-key header、handler 都跑、status 200 + body "ok"。

**驗證點**：
- response.status() == 200
- response body == "ok"（dummy handler 直接 pass-through）
- response 不含 WWW-Authenticate header（middleware 未進 reject path）

**注意**：本 test 與 `simple_non_protected_path_passes_through` (R-2.3 case 4) 為**同一 test**、不需獨立第 5 test。

---

## R-6 — Implementer-stage Expansion 候選 grep（per FR-011 ≤3）

**Source**：spec.md FR-011、brainstorm §3 末三候選

### R-6.1 — 候選 (a)：045 自家 `contracts/verification-commands.md` C-V5 update

**grep**：`grep -n "401\|HTTP.*40" specs/045-facade-atomicity-pass/contracts/verification-commands.md`

```
147:if [ "$POST" = "401" ] && [ "$TOTAL_LATENCY" -lt 500 ]; then
148:  echo "PASS: SC-004 < 500ms"
150:  echo "FAIL: SC-004 — POST=$POST, total=${TOTAL_LATENCY}ms"
```

**Decision**：045 C-V5 line 147 期望 `POST` (HTTP code) == "401"。在 047 fix 之後此 grep 會 PASS。implementer-stage 拾取此 candidate 為「驗證 045 C-V5 在 047 後可重新跑通」、**0 spec edit**（既有 grep expectation 正確）；OR user 確認後 surgical 加 inline comment 說「post-047 PASS」。**估 ≤1 行 spec docs 改動**。

### R-6.2 — 候選 (b)：sandbox `complex-api-key` 是否同步驗 spec md

**grep**：`grep -n "complex-api-key" specs/047-sandbox-protect-route-fix/`

```
spec.md（已含 Q1 clarification 8 acceptance、含 Scenario 5-8 Complex 端 + FR-008 (e)-(h)）
```

**Decision**：Q1 clarification 已將 Complex 納入主 scope；Phase 0 grep 確認 **0 額外 spec edit 需要**。

### R-6.3 — 候選 (c)：`Res::IntoResponse` 擴展接 optional StatusCode

**grep**：`grep -rn "impl.*IntoResponse for Res\|Res::<.*>::new_error" rust-api/server/core/src/web/res.rs rust-api/server/middleware/src/ rust-api/server/core/src/sign/`

預期 hits：~5-10 處（res.rs IntoResponse impl + jwt.rs / casbin_envelope_adapter.rs / api_key_middleware.rs Res::new_error call）。擴 `Res::IntoResponse` 接 optional StatusCode 等於改 envelope 框架的通用機制、影響所有 middleware。

**Decision**：**REJECTED** —— scope creep 風險高、本 feature A1 scope 拍板僅 api_key_middleware、jwt + casbin envelope adapter 不動（spec FR-010）。`unauthorized_response` 為 local helper（R-4 拍板）、不擴 `Res::IntoResponse`；若未來其他 middleware 需 HTTP status upgrade、再各自加 local helper。

### R-6 總結

| 候選 | 來源 | 內容 | 估計 |
|---|---|---|---|
| 拾取 candidate | R-6.1 | 045 C-V5 update / 註解 post-047 PASS 標示 | ~1-3 line edit |
| 拒拾 candidate | R-6.2 | sandbox complex-api-key spec md 補述 | 0（Q1 已含）|
| 拒拾 candidate | R-6.3 | `Res::IntoResponse` 擴展 | 0（scope creep）|

**Decision**：plan 階段 0 主動拾取、留 implementer 階段 user 確認後拾取 ≤1 處（候選 (a)）；其餘候選明示拒拾、登 follow-up 條件觸發。

---

## Phase 0 結論

6 個 research item 全 resolve、precise hit count 確認、unit test patterns 拍板：

| Open Q | Decision | 依據 |
|---|---|---|
| tower::ServiceExt::oneshot 可達性 | server-core `[dev-dependencies]` 加 `tower = { workspace = true, features = ["util"] }`（per-crate change、非 workspace 新 dep）| R-1 |
| Simple unit test setup | minimal `Router::new().route(path, get(dummy)).layer(from_fn(api_key_middleware))` + unique path per test 避免 PROTECTED_PATHS 污染 | R-2 |
| Complex unit test setup | `ComplexApiKeyValidator::new(None)` + memory nonce store + HMAC sig build per `test_api_key_sign` 既有 pattern | R-3 |
| `unauthorized_response` helper signature | `fn unauthorized_response(code: u16, msg: &str) -> Response<Body>`（Option A、對齊 `Res::new_error`）| R-4 |
| non-protected path test | 與 simple_non_protected_path 為同 test、不需獨立 | R-5 |
| Implementer-stage expansion 候選 | 1 拾取 candidate (045 C-V5)、2 拒拾 candidate (Complex spec md 已含 / Res::IntoResponse 擴展 scope creep) | R-6 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
