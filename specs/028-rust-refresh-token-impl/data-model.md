# Data Model: F13 — rust-refresh-token-impl

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

F13 **不動 DB schema、不增表、不改 entity model、無 migration**。「data model」此處為 F13 的**元件模型** — 在 rust-api 既有 crate 內新增一個 `POST /auth/refreshToken` endpoint(handler + service method + 驗證函式 + request DTO + public router mount)。唯一觸碰的「資料」是既有 `sys_tokens` 表(refresh 時 INSERT 一筆新 row + UPDATE 一筆舊 row 的 `status`)與既有 `sys_user` 表(唯讀重查)— schema 皆既有、F13 不改。

元件總覽:

| # | 元件 | 位置 | 性質 |
|---|---|---|---|
| E1 | `RefreshTokenInput` request DTO | `server/model/src/admin/input/sys_authentication.rs` | 新增 |
| E2 | `validate_refresh_token` 驗證函式 | `server/core/src/web/jwt.rs` | 新增 |
| E3 | `refresh_token` service method | `server/service/src/admin/sys_auth_service.rs` | 新增 |
| E4 | sys_tokens 輪替 transaction(UPDATE 舊 + INSERT 新) | `refresh_token` service method 內 | 新增 |
| E5 | `refresh_token` handler | `server/api/src/admin/sys_authentication_api.rs` | 新增 |
| E6 | `POST /auth/refreshToken` public router mount | `server/router/src/admin/sys_authentication_route.rs` | 改 |

**重用、不新增**:`generate_auth_output` / `get_user_roles`(`sys_auth_service.rs`)、`JwtUtils` / `Claims` / `RefreshClaims`(`server-core`)、`sys_user::find_active`(`server-model` facade)、`sys_tokens` entity + `TokenStatus`、F4 `Res` + `code.rs` 既有碼、`ClientIp` / `xdb` / axum extractor。

---

## E1: `RefreshTokenInput` request DTO(新增)

- 新 struct `RefreshTokenInput`,於 `server/model/src/admin/input/sys_authentication.rs`(F11 已在此檔加 3 個 stub DTO);`input/mod.rs` re-export。
- 單一欄位 `refresh_token: String`,序列化對齊 base-web 送的 `{ "refreshToken": "..." }`(camelCase — `#[serde(rename_all = "camelCase")]` 或 field-level rename,比照既有 input DTO 慣例)。
- 帶 `validator` 的 `#[validate(...)]`(non-empty)以走 `ValidatedForm` 路徑、缺欄位 / 空值 → HTTP 400(per research R-Q5)。

---

## E2: `validate_refresh_token` 驗證函式(新增)

- 於 `server/core/src/web/jwt.rs` 新增 `pub async fn validate_refresh_token(token: &str) -> Result<TokenData<RefreshClaims>, JwtError>`。
- 取 `global::REFRESH_KEYS`(F10.1 已初始化、`refresh_secret`)的 decoding key。
- 建 `Validation`:`Algorithm::HS256` + `set_issuer`(對齊 config issuer)+ `validate_nbf = true` + **`validate_aud = false`**(`RefreshClaims` 無 `aud` 欄)+ leeway 對齊既有(60s)。
- `decode::<RefreshClaims>(token, &refresh_keys.decoding, &validation)`;簽章無效 / 過期 / nbf 未到 → `Err(JwtError)`。

**設計要點**:
| 項目 | 決策 |
|---|---|
| 金鑰 | `REFRESH_KEYS`(非 access token 的 `KEYS`) |
| audience | `validate_aud = false`(`RefreshClaims` 無 `aud`) |
| 與 `validate_token` 關係 | 不重用 — 不同金鑰 + 不同 Claims 型別;F13 新增獨立函式 |

---

## E3: `refresh_token` service method(新增)

於 `server/service/src/admin/sys_auth_service.rs` 新增 `refresh_token` method,orchestrate 整個 refresh 流程:

```
fn refresh_token(db, refresh_token: String, ctx: <連線 context>) -> Result<AuthOutput, AppError>
  1. validate_refresh_token(&refresh_token)            [E2]
       └ Err → AppError code 3333(per R-Q5)
  2. sys_tokens 查找:Entity::find().filter(RefreshToken.eq(&refresh_token)).one(db)
       └ None → AppError code 3333(查無、不細分、per FR-008)
  3. 狀態檢查:row.status == TokenStatus::Active("unused")
       └ 否(used / revoked)→ AppError code 3333(不細分)
  4. user 重查:sys_user::find_active().filter(Id.eq(&refresh_claims.sub)).one(db)   [R-Q1 + R-Q7]
       └ None → AppError code 8888(軟刪 / 不存在)
       └ Some(user) → 取 username + domain
  5. role 重查:get_user_roles(&user_id, db) → role_codes                            [R-Q1]
  6. 簽發:generate_auth_output(user_id, username, role_codes, domain, None, audience)
            → AuthOutput { token(新 access), refresh_token(新 refresh) }            [R-Q1]
  7. 輪替 transaction(E4):UPDATE 舊 row status→used + INSERT 新 row
  8. 回 AuthOutput
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| Claims 重建 | 重用 `generate_auth_output` + `get_user_roles`;不驗密碼(refresh token 即憑證) |
| audience | 對齊 login(`Audience::ManagementPlatform`) |
| org | 比照 login 傳 `None`(per R-Q1) |
| 失敗即止 | 任一步 Err → 不簽發、不動 `sys_tokens`、回對應 code |

---

## E4: sys_tokens 輪替 transaction(新增、E3 步驟 7)

在 `refresh_token` service method 內、`generate_auth_output` 產出新 token pair 後,以**單一 `DatabaseTransaction`** 完成輪替:

```
txn = db.begin()
  // (a) 標記舊 row used — filter 帶 status=Active 條件解並行競態
  res = sys_tokens::Entity::update_many()
          .col_expr(Column::Status, TokenStatus::Refreshed.to_string())
          .filter(Column::RefreshToken.eq(&舊 refresh_token))
          .filter(Column::Status.eq(TokenStatus::Active.to_string()))
          .exec(&txn)
  if res.rows_affected != 1 → rollback + AppError code 3333   // 競態:已被另一次 refresh 輪替
  // (b) INSERT 新 token pair row
  SysTokensActiveModel {
    id: Ulid, access_token: 新, refresh_token: 新,
    status: TokenStatus::Active, user_id, username, domain,
    login_time: now, ip / port / address / user_agent / request_id: <refresh request context、E5>,
    type: "PC", created_at: now, created_by: username,
  }.insert(&txn)
txn.commit()
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| 原子性 | UPDATE 舊 + INSERT 新 同一 txn;失敗整體 rollback(per Constitution II / spec FR-011) |
| 競態(E-7) | `update_many` filter 帶 `Status = Active` → 並行雙呈遞只有一個 `rows_affected == 1`;另一個 rollback 拒絕 |
| 不重用 `AccessTokenEvent` | `AccessTokenEvent` 為無-txn `.insert(db)`、login 專用;F13 inline 於 service 的 txn 版,不改 `AccessTokenEvent`(login 路徑不動、FR-021) |
| 不寫 audit | 不寫 `sys_operation_log` / `sys_login_log`(per Q2);新 row + 舊 row→used 即紀錄 |

---

## E5: `refresh_token` handler(新增)

於 `server/api/src/admin/sys_authentication_api.rs` 新增 `refresh_token_handler`,比照 `login_handler`:

- **extractor**(取連線 context、per R-Q3):`ConnectInfo<SocketAddr>`(ip fallback + port)、`HeaderMap`(`ClientIp::get_real_ip`)、`TypedHeader<UserAgent>`、`Extension<RequestId>`、`Extension<Arc<SysAuthService>>`、`ValidatedForm<RefreshTokenInput>`。
- `address` 由 `xdb::searcher::search_by_ip(client_ip)`。
- 組連線 context → call `service.refresh_token(refresh_token, ctx)` → 回 `Res<AuthOutput>`(F4 envelope;成功 code 0、失敗 code 由 E3 的 `AppError` 帶出)。

**設計要點**:
| 項目 | 決策 |
|---|---|
| 輸出 DTO | 重用 login 的 `AuthOutput`(`{ token, refreshToken }`) |
| context 取法 | 與 `login_handler` 完全相同的 extractor 組合 |
| 不經 middleware | handler 掛 public router(E6)、不經 JWT middleware、不經 Casbin |

---

## E6: `POST /auth/refreshToken` public router mount(改)

`server/router/src/admin/sys_authentication_route.rs` 的 `init_authentication_router()`(public router、`/login` 所在)加一行:

```
let router = Router::new()
    .route("/login", post(SysAuthenticationApi::login_handler))
    .route("/refreshToken", post(SysAuthenticationApi::refresh_token_handler));   // F13
Router::new().nest("/auth", router)
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| router | public(`init_authentication_router`)— 不經 JWT middleware、不經 Casbin enforce(per FR-002 / R-Q6) |
| RouteInfo | **不需**註冊全域 route registry(public route 無 RBAC、per R-Q6) |
| 路徑 | rust 內部 `/auth/refreshToken`;對外經 nginx `/api/` 前綴 — 但 F13 不動 nginx、`/api/auth/refreshToken` 仍路由 nestjs;F13 endpoint 以直連 rust port 驗證 |

---

## 元件互動 — refresh data flow

```
POST /auth/refreshToken  body { refreshToken }   (直連 rust :11081;nginx 仍 → nestjs、F14 才切)
        │  refresh_token_handler [E5] — 取連線 context(ip/port/ua/request_id/address)
        ▼
  refresh_token service method [E3]
        │  1. validate_refresh_token [E2]            ─ Err → code 3333
        │  2. sys_tokens 查 by refresh_token         ─ None → code 3333
        │  3. status == Active ?                     ─ 否 → code 3333
        │  4. sys_user::find_active by sub [R-Q7]    ─ None → code 8888
        │  5. get_user_roles                         ─ 取 role_codes
        │  6. generate_auth_output                   ─ 新 access + 新 refresh
        │  7. 輪替 transaction [E4]:
        │       txn { UPDATE 舊 row status→used (filter status=Active) ; INSERT 新 row } commit
        ▼
  Res<AuthOutput> { code:0, data:{ token, refreshToken } }
```

---

## Data Model 完成標誌

- ✅ E1 `RefreshTokenInput` DTO(camelCase、validator non-empty)
- ✅ E2 `validate_refresh_token`(`REFRESH_KEYS` + `validate_aud=false`)
- ✅ E3 `refresh_token` service method(verify → 重查 → 簽發 → 輪替 orchestration、重用 `generate_auth_output`)
- ✅ E4 輪替 transaction(UPDATE 舊 + INSERT 新 同 txn、`update_many` filter 解競態)
- ✅ E5 `refresh_token` handler(同 login extractor 取 context、回 `Res<AuthOutput>`)
- ✅ E6 public router mount(`init_authentication_router`、不需 RouteInfo)
- ✅ 無 DB schema 改、無 migration、無 base-web 改、無 nestjs 改、無 docker-compose / nginx 改
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E6 確認 — F13 token 輪替寫入(`sys_tokens` UPDATE + INSERT)在單一 transaction(II 原子性 PASS;`sys_tokens` 為 token/session 表、非 audited admin entity、不寫 `sys_operation_log` 與 rust 既有 login 一致);refresh endpoint 只直連 postgres、無服務間 forward(III PASS);base-web 0 diff(IV PASS);rust 接手 refresh、DESIGN-B 沿用零改(V PASS);不碰 Casbin enforce / `casbin_rule`(I PASS)。**5 PASS / 0 N/A / 0 violation 維持**。
