# Data Model: 047 sandbox-protect-route-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

047 為 rust-api middleware HTTP status / header 升級 + 同檔 unit test 加、**無 application data entity 改動**（0 schema migration）；本檔以「helper API + Response 構造 pattern + 8 unit test scenario spec」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. `unauthorized_response` helper API（FR-001 / FR-002、per [research R-4](./research.md)）

### E1.1 helper function 完整 source

```rust
// rust-api/server/core/src/sign/api_key_middleware.rs（047 加）

use axum::{
    body::Body,
    http::{header, HeaderValue, Response, StatusCode},
    Json,
    response::IntoResponse,
};

/// 047 US1 helper：構造 HTTP 401 + WWW-Authenticate: ApiKey + body envelope。
///
/// 用於 api_key_middleware 兩 error 分支（missing 5003 / invalid 5004）。
/// body envelope（{code, data, msg, success}）完全保留、對既有 client 不破壞；
/// 同時設 HTTP 401 + RFC 7235 / 9110 強制的 WWW-Authenticate header 對齊
/// standard REST 語義（外部 monitoring / WAF / curl -f 可用 HTTP status 偵測）。
fn unauthorized_response(code: u16, msg: &str) -> Response<Body> {
    let mut resp = (
        StatusCode::UNAUTHORIZED,
        Json(Res::<()>::new_error(code, msg)),
    )
        .into_response();
    resp.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static("ApiKey"),
    );
    resp
}
```

**signature 抉擇**（per research R-4.1）：採 `msg: &str` 對齊 `Res::new_error(code: u16, msg: &str)` 既有 signature；返 `Response<Body>` 明確 type 對齊 axum middleware return。

### E1.2 caller modification（`api_key_middleware` 函式內部）

```rust
// BEFORE:
match validate_request(&validator, &req) {
    Ok(true) => next.run(req).await.into_response(),
    Ok(false) => Res::<()>::new_error(
        code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID,
        "Invalid API key or signature",
    )
    .into_response(),
    Err(e) => Res::<()>::new_error(code::CODE_PERMISSION_API_KEY_MISSING, e).into_response(),
}

// AFTER:
match validate_request(&validator, &req) {
    Ok(true) => next.run(req).await.into_response(),
    Ok(false) => unauthorized_response(
        code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID,
        "Invalid API key or signature",
    ),
    Err(e) => unauthorized_response(code::CODE_PERMISSION_API_KEY_MISSING, e),
}
```

`Ok(true)` 分支（valid key）保持原行為（HTTP 200 pass-through）；non-protected path 的 short-circuit `if !is_protected_path(req.uri()) { return next.run(req).await.into_response(); }` 也保持原行為（FR-003 + FR-004）。

### E1.3 use statement 補充

`api_key_middleware.rs` 既有 use：

```rust
use axum::{
    body::Body,
    extract::Request,
    http::{HeaderMap, Uri},
    middleware::Next,
    response::IntoResponse,
};
```

需補：

```rust
use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderMap, HeaderValue, Response, StatusCode, Uri},   // 加 header / HeaderValue / Response / StatusCode
    middleware::Next,
    response::IntoResponse,
    Json,                                                                  // 新加
};
```

---

## E2. server-core `[dev-dependencies]` 加 tower util feature（per [research R-1.4](./research.md)）

### E2.1 `rust-api/server/core/Cargo.toml` diff

```diff
 parking_lot = { workspace = true }
 moka = { workspace = true, features = ["sync"] }
+
+[dev-dependencies]
+tower = { workspace = true, features = ["util"] }
```

**理由**：tower workspace 預設 features = `["log"]`、不含 `util`；`tower::ServiceExt::oneshot` 在 `tower::util` 模組、unit test 需 `util` feature。Per-crate dev-dep 加 features 設定、非 workspace 新 dep、不違 FR-006。

---

## E3. 8 unit test scenarios spec（FR-008、per [research R-2 + R-3](./research.md)）

### E3.1 共用 test helper

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{header, Request, StatusCode},
        middleware::from_fn,
        routing::get,
        Router,
    };
    use tower::ServiceExt;

    async fn dummy_handler() -> &'static str { "ok" }

    fn build_test_router(path: &str, validation: ApiKeyValidation) -> Router {
        Router::new()
            .route(path, get(dummy_handler))
            .layer(from_fn(move |req, next| {
                api_key_middleware(validation.clone(), req, next)
            }))
    }

    async fn parse_body_envelope(response: axum::response::Response) -> serde_json::Value {
        let body_bytes = to_bytes(response.into_body(), 1024).await.unwrap();
        serde_json::from_slice(&body_bytes).unwrap()
    }
}
```

### E3.2 8 test scenarios table

| Test (#) | FR ref | Path | Validator Setup | Header / Query | Expect status | Expect WWW-Auth | Expect body |
|---|---|---|---|---|---|---|---|
| 1 `simple_missing_api_key_returns_401_with_www_authenticate` | FR-008(a) | `/test-simple-missing` | Simple + `add_key("valid-key")` + protect_route | 不送 `x-api-key` | 401 | `"ApiKey"` | `{code:5003, success:false}` |
| 2 `simple_invalid_api_key_returns_401_with_www_authenticate` | FR-008(b) | `/test-simple-invalid` | Simple + `add_key("valid-key")` + protect_route | `x-api-key: bogus-XYZ` | 401 | `"ApiKey"` | `{code:5004, success:false}` |
| 3 `simple_valid_api_key_passes_through` | FR-008(c) | `/test-simple-valid` | Simple + `add_key("valid-key")` + protect_route | `x-api-key: valid-key` | 200 | not set | body = `"ok"` |
| 4 `simple_non_protected_path_passes_through` | FR-008(d) | `/test-simple-non-protected` | Simple + `add_key("any-key")`、**不**呼叫 protect_route | 不送 header | 200 | not set | body = `"ok"` |
| 5 `complex_missing_field_returns_401_with_www_authenticate` | FR-008(e) | `/test-complex-missing-field` | Complex + `add_key_secret("test-access-key", "test-secret-key")` + protect_route | query 缺 `AccessKeyId`（送 `?t=...&n=...&sign=...`） | 401 | `"ApiKey"` | `{code:5003, success:false, msg:含"Missing AccessKeyId"}` |
| 6 `complex_invalid_signature_returns_401_with_www_authenticate` | FR-008(f) | `/test-complex-invalid-sig` | 同上 | query 含完整 fields 但 `sign=wrong-hex` | 401 | `"ApiKey"` | `{code:5004, success:false}` |
| 7 `complex_valid_signed_request_passes_through` | FR-008(g) | `/test-complex-valid` | 同上 | query 帶完整 HMAC-signed string per R-3.2 build | 200 | not set | body = `"ok"` |
| 8 `complex_invalid_timestamp_returns_401_with_www_authenticate` | FR-008(h) | `/test-complex-invalid-ts` | 同上 | query `?AccessKeyId=test-access-key&t=non-numeric&n=x&sign=y` | 401 | `"ApiKey"` | `{code:5003, success:false, msg:"Invalid timestamp"}` |

### E3.3 test 1 完整 source（樣本、其餘對齊改）

```rust
#[tokio::test]
async fn simple_missing_api_key_returns_401_with_www_authenticate() {
    let path = "/test-simple-missing";
    protect_route(path);

    let validator = SimpleApiKeyValidator::new();
    validator.add_key("valid-key".to_string());
    let validation = ApiKeyValidation::Simple(validator, SimpleApiKeyConfig::default());

    let app = build_test_router(path, validation);
    let req = Request::builder().uri(path).body(Body::empty()).unwrap();

    let response = app.oneshot(req).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        response.headers().get(header::WWW_AUTHENTICATE).unwrap(),
        "ApiKey"
    );

    let body = parse_body_envelope(response).await;
    assert_eq!(body["code"], 5003);
    assert_eq!(body["success"], false);
}
```

### E3.4 test 7 (Complex valid) 完整 source（最複雜 case）

```rust
#[tokio::test]
async fn complex_valid_signed_request_passes_through() {
    let path = "/test-complex-valid";
    protect_route(path);

    let validator = ComplexApiKeyValidator::new(None);
    validator.add_key_secret(
        "test-access-key".to_string(),
        "test-secret-key".to_string(),
    );
    let validation = ApiKeyValidation::Complex(
        validator.clone(),
        ComplexApiKeyConfig {
            key_name: "AccessKeyId".to_string(),
            timestamp_name: "t".to_string(),
            nonce_name: "n".to_string(),
            signature_name: "sign".to_string(),
        },
    );

    let app = build_test_router(path, validation);

    // build signed query per `test_api_key_sign` pattern
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let nonce = format!("nonce_{}", timestamp);

    let mut params = vec![
        ("AccessKeyId".to_string(), "test-access-key".to_string()),
        ("t".to_string(), timestamp.to_string()),
        ("n".to_string(), nonce.clone()),
    ];
    params.sort_by(|a, b| a.0.cmp(&b.0));
    let signing_string = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");
    let signature = validator.calculate_signature(&signing_string, "test-secret-key");

    let uri = format!("{}?{}&sign={}", path, signing_string, signature);
    let req = Request::builder().uri(&uri).body(Body::empty()).unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = to_bytes(response.into_body(), 1024).await.unwrap();
    assert_eq!(&body_bytes[..], b"ok");
}
```

### E3.5 unique path discipline

每 test 用 unique path（per R-2.3 R-3.3）—— `/test-simple-missing` / `/test-simple-invalid` / `/test-simple-valid` / `/test-simple-non-protected` / `/test-complex-missing-field` / `/test-complex-invalid-sig` / `/test-complex-valid` / `/test-complex-invalid-ts` —— 避免測試間共享 `PROTECTED_PATHS: Lazy<RwLock<HashSet<String>>>` 靜態的污染（**0 新 dep**、不需 serial_test crate）。

### E3.6 estimated 行數

| 元件 | 估計行數 |
|---|---|
| 共用 helper (E3.1) | ~20 line |
| Test 1-4（Simple、約 25 line × 4）| ~100 line |
| Test 5-6（Complex missing/invalid sig、約 25 line × 2）| ~50 line |
| Test 7（Complex valid signed、最複雜）| ~45 line |
| Test 8（Complex invalid ts）| ~25 line |
| **合計** | **~240 line** |

略高於 spec.md scale/scope 估計（~150-180）—— refinement 後實際行數依 implementer 風格略浮動、不違 FR-006。

---

## E4. INTEGRATION-CHECKLIST cleanup（FR-009）

### E4.1 衍生 follow-up 移除 1 row

| ID | 原因 |
|---|---|
| 045-N1 | 047 US1+US2 全清 sandbox `/sandbox/{simple,complex}-api-key` HTTP 401 + WWW-Authenticate + 8 unit test 雙端點覆蓋 |

### E4.2 已完成里程碑加 047 entry

格式對齊 045 / 046 體例（一行 entry、含 outer/merge/rust-api SHA placeholder、spec link、2 US 簡述、軌道屬性 = 軌道外 rust-api + outer、下一步指向 base-web TS id 型別債 cleanup sprint）。

### E4.3 Current Focus update + CLAUDE.md SPECKIT marker update

更新「現狀」段加 047；「下一步」改向 **base-web TS `id` 型別債 cleanup sprint**（user 2026-05-25 拍板的 5 階段順序第 3 段）；CLAUDE.md SPECKIT marker idle、Active Spec/Plan = `—`、下一步指向 base-web sprint。

---

## E5. 2 US 落點 file:line table（per plan.md §Source Code）

| US | item | file | 改動 |
|---|---|---|---|
| US1 | unauthorized_response helper + caller 改 | `rust-api/server/core/src/sign/api_key_middleware.rs` lines ~115-140 + use 段 lines 1-10 | ~12 line production diff（+helper fn ~15 line + 2 caller 改 + use 補）|
| US2 | 8 unit test + 共用 helper | 同檔 `#[cfg(test)] mod tests` 段、line 244 起原既有 `test_api_key_sign` 後接 | ~240 line test code |
| US1+US2 Cargo.toml | server-core dev-deps tokio time feature | `rust-api/server/core/Cargo.toml` `[dev-dependencies]` 段（既有空段補 1 行）| ~2 line（含空行 + 1 dep line）|

**改動總計**：~254 line 新加 / 改動跨 2 file（1 production + 1 Cargo.toml）。

---

## E6. Out-of-scope（047 不做、但相關）

- 045-N1 root cause 升 jwt + casbin envelope adapter 同模式 HTTP 401 → A2/A3 scope creep、user 拍板拒、留 047+ 條件觸發 follow-up（如 047-N2）
- 047-N1 grafana RustApi5xxRate alert 加 401 監控分流 → 屬 044 observability scope、本 feature 不動 monitoring config
- `Res::IntoResponse` 擴展接 optional StatusCode → research R-6.3 拒拾、scope creep
- sandbox complex-api-key spec md 補述 → research R-6.2 拒拾、Q1 clarification 已含
- base-web client onError → onBackendFail 路由改 → A2/A3 拒、Constitution IV 預設原則保留
- `tower = ["full"]` 工具集擴 → R-1.4 拒拾、minimal `util` feature 已足
