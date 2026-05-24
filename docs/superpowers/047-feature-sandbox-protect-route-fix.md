# 047 sandbox-protect-route-fix — brainstorm 設計

**日期**：2026-05-25
**Feature**：`047-sandbox-protect-route-fix`
**來源**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) Group 2（045-N1 結案）+ 046 落地後 user 拍板的 5 階段順序第 2 段

---

## 1. 觸發背景

2026-05-25 046 spec-hygiene-pass-3 merge 落地後盤點 backlog：原 6 條衍生 follow-up 移除 3 條（045-N2 / 044-N1 / 042-N1）後剩 3 條（042-N4 / 042-N5 / 045-N1）。User 早前對 cohesion 分群拍板：

- Group 1（046）→ ✅ 已完成
- **Group 2（047 sandbox-protect-route-fix）**：security adjacency、scope 清晰、不混進 cleanup bundle
- Group 3：dev infrastructure（條件觸發、不主動排）
- Group 4：base-web TS id 型別債 cleanup sprint（獨立軌道）

**brainstorm 階段重大發現** —— 045-N1 原文描述 misframe。原寫「`/sandbox/simple-api-key` 對任何非空 `x-api-key` header 都回 200、middleware 顯然繞過 validator 真實 check」。實機 curl 4 case 後重判：

| 場景 | HTTP | body envelope |
|---|---|---|
| valid `test-api-key`（init 預設加進 set） | 200 | `{"code":0,"data":"SimpleApiKey","success":true}` |
| invalid `bogus-key-XYZ` | **200** | `{"code":5004,"msg":"Invalid API key or signature","success":false}` |
| 無 `x-api-key` header | **200** | `{"code":5003,"msg":"Missing API key","success":false}` |
| empty `x-api-key` | **200** | `{"code":5003,"msg":"Missing API key","success":false}` |

middleware **沒有**繞過 validator —— body envelope 清楚標示 `success:false` + code 5003/5004。問題在於**HTTP status 永遠 200**，這是 rev1 慣例（JWT / Casbin envelope adapter / api_key middleware 全部用 `Res::new_error(code, msg).into_response()` 包 JSON envelope、不設 HTTP status）。045 C-V5 設計上 expected HTTP 401 與 rev1 convention 不符 —— 不是 middleware 失效、是 HTTP status semantic 與 standard REST 偏離。

User 2026-05-25 7-section brainstorm 階段拍板：

- **scope**: A1 —— 只改 `api_key_middleware`、jwt + casbin envelope adapter **不**動（保留 F4 envelope flow design + base-web onBackendFail 路徑、0 base-web 改動、Constitution Principle IV 預設原則保留）
- **status code mapping**: missing → 401 / invalid → 401（兩者皆 credential 問題、不涉 RBAC permission scope、403 不適用）
- **header**: 順手加 RFC 7235 / 9110 標準 `WWW-Authenticate: ApiKey`（401 MUST 含此 header）
- **test approach**: unit test 在 `api_key_middleware.rs` 內嵌 `#[cfg(test)] mod tests`、用 `tower::ServiceExt::oneshot` 驅 minimal router、不需 DB / dev stack / `TEST_DATABASE_URL`、不需 `#[ignore]`

---

## 2. 範圍與 Constitution 處理

### 2.1 兩個 user story

| US | Priority | 範圍 | Touch |
|---|---|---|---|
| US1 | P1 | `api_key_middleware` reject 兩路徑（missing 5003 / invalid 5004）改為 HTTP 401 + `WWW-Authenticate: ApiKey` header + body envelope 同時帶（envelope contract 不變、preservation） | rust-api ~12 line |
| US2 | P1 🎯 | 同檔 `#[cfg(test)] mod tests` 加 4 個 unit test（missing / invalid / valid / non-protected）驗 status + header + body | rust-api ~80 line test |

兩 US 互相依賴（test 驗的就是 US1 行為）、但實作上可分開：US1 改 production code → US2 加 tests。MVP 為 US1 + US2 一體交付（test 同檔、單一 commit）。

### 2.2 US1 — `api_key_middleware` 兩 error 分支 HTTP 401 升級

**現狀** `rust-api/server/core/src/sign/api_key_middleware.rs`:

```rust
match validate_request(&validator, &req) {
    Ok(true) => next.run(req).await.into_response(),
    Ok(false) => Res::<()>::new_error(
        code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID,
        "Invalid API key or signature",
    )
    .into_response(),
    Err(e) => Res::<()>::new_error(code::CODE_PERMISSION_API_KEY_MISSING, e).into_response(),
}
```

兩處 `.into_response()` 都產 HTTP 200 + Json envelope（因為 `Res<T>: IntoResponse` 只 `Json(self).into_response()` 不設 status）。

**Fix** 改成：

```rust
match validate_request(&validator, &req) {
    Ok(true) => next.run(req).await.into_response(),
    Ok(false) => unauthorized_response(
        code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID,
        "Invalid API key or signature",
    ),
    Err(e) => unauthorized_response(code::CODE_PERMISSION_API_KEY_MISSING, e),
}

fn unauthorized_response(code: u16, msg: &str) -> Response {
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

**設計理由**：

- **抽 helper `unauthorized_response`**：兩個分支共用、減重複；signature 對齊 `Res::new_error` (code + msg)
- **HTTP 401 不 403**：兩者皆「credential 問題」（缺 / 無效）、與 RFC 9110 401 定義對齊；middleware 不做 RBAC permission scope 判斷、403 不適用（403 含意「有權但拒」、此 middleware 無 permission 概念）
- **`WWW-Authenticate: ApiKey`**：RFC 7235 規定 401 response **MUST** 含此 header；scheme 名 `ApiKey` 為慣例（非 RFC 註冊但業界廣泛接受、e.g. AWS / Stripe / Cloudflare 同模式）
- **body envelope 完全保留**：`code` 5003/5004 + `msg` + `success:false` 不變 —— rev1 envelope contract 對 client 不破壞；若未來有 client 從 body 讀 code 仍兼容
- **`(StatusCode, Json)` tuple 構造**：axum 慣用 form、單行設 status + body；`Json(...).into_response()` 已設 `Content-Type: application/json`、不需手動

### 2.3 US2 — 4 個 unit test（同檔 `#[cfg(test)] mod tests`）

| Test | Setup | Assert |
|---|---|---|
| `missing_api_key_returns_401_with_www_authenticate` | `protect_route("/test-missing")`, 不送 `x-api-key` header | `status == 401` + `headers["WWW-Authenticate"] == "ApiKey"` + body `{code: 5003, success: false}` |
| `invalid_api_key_returns_401_with_www_authenticate` | `protect_route("/test-invalid")` + `validator.add_key("valid-key")`, 送 `x-api-key: invalid-key` | `status == 401` + 同 header + body `{code: 5004, success: false}` |
| `valid_api_key_passes_through` | `protect_route("/test-valid")` + `validator.add_key("valid-key")`, 送 `x-api-key: valid-key` | `status == 200` + body = dummy handler 回的 `"ok"` |
| `non_protected_path_passes_through` | `add_key("any-key")`（**不** `protect_route`）, 不送 header | `status == 200` + body = dummy handler 回的 `"ok"` |

**test infrastructure**：

- 每 test 用 **unique path**（`/test-missing-XYZ` / `/test-invalid-XYZ` / 等）避免測試間共享 `PROTECTED_PATHS` 靜態的污染
- minimal router build：
  ```rust
  let app = axum::Router::new()
      .route(path, axum::routing::get(|| async { "ok" }))
      .layer(axum::middleware::from_fn(move |req, next| {
          api_key_middleware(validation.clone(), req, next)
      }));
  ```
- 用 `tower::ServiceExt::oneshot(Request::builder()...)` 發 mock request、`response.status()` / `response.headers()` / `to_bytes(body)` assert
- **不需新 workspace cargo dep**：`tower::ServiceExt` 經 `axum::body` / `axum::Router::oneshot` 路徑可用（如不行則 `tower = { workspace = true, features = ["util"] }` 加進 server-core dev-deps、per-crate 改動非 workspace 新 dep）

### 2.4 Constitution 5/5 PASS 預估

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0：

| Principle | 評估 | 狀態 |
|---|---|---|
| I. RBAC Fail-safe（Casbin 後端強制） | 不動 Casbin / JWT；api_key middleware 為**獨立** credential check layer、非 RBAC | ✅ PASS |
| II. Soft Delete + 全域 Audit Log | 不動 audit / soft delete pipeline | ✅ PASS |
| III. 嚴版禁 Forward + 單一職責 | 純 1 middleware 函式內 HTTP status / header 改、無新 service / endpoint / channel | ✅ PASS |
| IV. base 不改動邊界 | **0 base-web 改動**（sandbox 端 base-web 不調用；HTTP status change 不影響 base-web client）；不動用 W-WEBUI 受管例外、不觸發 amendment | ✅ PASS |
| V. 漸進收縮（DESIGN-A → DESIGN-B） | 0 nestjs / 0 DESIGN-A 殘留 | ✅ PASS |

**架構約束**：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 0 影響（middleware error response 走 Json body envelope、不寫 log）
- §Observability「promtail → Loki + prometheus + grafana」→ 0 影響（HTTP 401 對 grafana RustApi5xxRate alert 不算 5xx、不誤觸發；可選擇後續 044-N2 follow-up 加 401 監控）

**Constitution Check 結論**：5/5 PASS、`Complexity Tracking` 空白、**0 amendment 需要**。

### 2.5 軌道屬性

**軌道外** rust-api 小修：

- `rust-api/server/core/src/sign/api_key_middleware.rs`（1 檔、~12 行 production + ~80 行 test）
- 0 base-web、0 schema migration、0 新 application entity、0 新 workspace cargo dep、0 新 redis channel、0 新 metric pre-declare、0 新 rust-api endpoint、0 outer config

---

## 3. Acceptance — 5 C-V verification commands

| C-V | 內容 | 對應 SC / FR |
|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer 跑著（baseline） | SC-001 |
| C-V2 | `cargo test -p server-core sign::api_key_middleware -- --nocapture` 4 個 unit test 全 PASS（status + header + body envelope）| SC-002 / FR-001~004 |
| C-V3 | dev stack 跑著、curl `/api/sandbox/simple-api-key` 4 case：(a) valid `test-api-key` → HTTP 200 + body `code:0` (b) invalid `bogus-XYZ` → HTTP 401 + `WWW-Authenticate: ApiKey` + body `code:5004` (c) 無 header → HTTP 401 + `WWW-Authenticate: ApiKey` + body `code:5003` (d) empty `x-api-key:` → HTTP 401 + `WWW-Authenticate: ApiKey` + body `code:5003` | SC-003（real-wire 驗證 nginx → rust-api 全鏈）|
| C-V4 | grep boundary：`git diff base-web/` 0 行、`find rust-api/migration/src -newer spec.md -name "*.rs"` 0 hit、`find rust-api/server/model/src/admin/entities -newer spec.md -name "sys_*.rs"` 0 hit、`git diff rust-api/Cargo.toml` 0 line in `[workspace.dependencies]` | SC-004 / FR-005 |
| C-V5 | `docs/INTEGRATION-CHECKLIST.md`：衍生 follow-up backlog 移除 045-N1 row（1 row）、已完成里程碑加 047 entry、Current Focus「下一步」改向 base-web TS id 型別債 cleanup sprint | SC-005 / FR-006 |

C-V1~C-V5 全 PASS = acceptance PASS、ready for outer + worktree 多段 commit + merge。

**Implementer-stage expansion 候選 ≤3**（per 041 / 043 / 046 體例）：
- (a) 045 自家 `contracts/verification-commands.md` C-V5 line 147-151 grep expectation 對齊新 HTTP 401 + `WWW-Authenticate` 行為（user 確認後拾、屬 045-N1 結案延伸）
- (b) sandbox `complex-api-key` 端點是否同步驗（同 middleware、同模式、實機 curl 確認、可能 1 行 spec doc 補述）
- (c) `Res::IntoResponse` 是否該擴展接受 optional StatusCode（後續其他 middleware 重用時受益）—— scope creep 警告、Phase 0 grep 後決定**拒絕拾取**機率高

---

## 4. Commit shape

**rust-api worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| US1+US2 api_key middleware HTTP 401 + WWW-Authenticate header + 4 unit test | 1 commit | `server/core/src/sign/api_key_middleware.rs` |

**Outer rev1-admin-root commits（estimated 3-4 個）**：

| Topic | est | files |
|---|---|---|
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST cleanup（045-N1 移除 + 047 entry） + CLAUDE.md SPECKIT marker | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| 045 自家 C-V5 grep expectation 對齊（若 expansion 拾）| 1 commit（optional） | `specs/045-facade-atomicity-pass/contracts/verification-commands.md` |
| SHA backfill（post-merge） | 1 commit | `docs/INTEGRATION-CHECKLIST.md` 047 entry placeholder |

Push **須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

---

## 5. INTEGRATION-CHECKLIST cleanup（per FR-006 體例）

### 5.1 衍生 follow-up 移除 1 row

| ID | 原因 |
|---|---|
| 045-N1 | 047 US1+US2 全清 sandbox `/sandbox/simple-api-key` HTTP 401 + WWW-Authenticate + 真實 unit test「無效 key → 401」 |

### 5.2 已完成里程碑加 047 entry

格式對齊 045 / 046 體例（一行 entry、含 outer/merge/rust-api SHA placeholder、spec link、2 US 簡述、軌道屬性、下一步指向）。

### 5.3 Current Focus update + CLAUDE.md SPECKIT marker update

更新「現狀」段加 047；「下一步」改向 **base-web TS `id` 型別債 cleanup sprint**（user 2026-05-25 拍板的 5 階段順序第 3 段）；CLAUDE.md SPECKIT marker idle、Active Spec/Plan = `—`、下一步指向 base-web sprint。

---

## 6. 預估時間 + 預期 follow-up

**規模**：~12 行 production code + ~80 行 unit test code + ~5-10 處 docs / spec docs change。

**落地預估**：~2-3hr 全程
- spec-kit 階段 /speckit-specify + /speckit-plan + /speckit-tasks + /speckit-analyze ~1hr
- executing-plans subagent 實作 + docker rebuild + acceptance ~1.5hr（unit test 不需 dev stack drainer、快）
- 多段 commit + merge + push 同意關卡 + SHA backfill ~0.5hr

**預期 follow-up**（047 落地後可能登記）：
- 047-N1（猜）：grafana RustApi5xxRate alert 是否該加 401 監控分流（current alert 只看 5xx、新 401 不算 5xx 但同屬 security 失敗）—— 跨 044 observability scope、條件觸發
- 047-N2（猜）：sandbox `/complex-api-key` 是否也同模式驗 + 加 unit test —— 若 expansion 拾取則本 feature 內結，否則登 follow-up
- 047-N3（猜）：`Res::IntoResponse` 擴展接 optional status code —— scope creep 警告、本 feature 拒絕拾取、登 backlog 條件觸發

---

## 7. 啟動下一步 — `/speckit-specify`

本 brainstorm 階段拍板：

✅ **scope**: A1 —— api_key middleware only、jwt + casbin envelope adapter 不動、0 base-web、0 W-WEBUI 受管例外
✅ **status code**: missing → 401 / invalid → 401（雙 401、不分 403）
✅ **header**: `WWW-Authenticate: ApiKey`（RFC 7235 / 9110 合規）
✅ **body**: envelope 完全保留（code 5003/5004 + msg + success:false）
✅ **test approach**: unit test in `api_key_middleware.rs::tests`、4 個 test、`tower::ServiceExt::oneshot` driver、0 DB / dev stack / `#[ignore]`
✅ **acceptance**: 5 C-V（dev stack baseline + cargo test + real-wire curl + boundary + INTEGRATION-CHECKLIST cleanup）
✅ **commit shape**: 1 rust-api commit + 3-4 outer commits、push/merge 須 user 同意
✅ **Constitution**: 5/5 PASS、`Complexity Tracking` 空白、0 amendment

**ready for `/speckit-specify`**：input = 本 brainstorm 文件、預期產出 `specs/047-sandbox-protect-route-fix/spec.md` + `before_specify` pre-hook 建 `047-sandbox-protect-route-fix` feature branch、後續 `/speckit-plan` + `/speckit-tasks` + `/speckit-analyze` + `superpowers:executing-plans`。
