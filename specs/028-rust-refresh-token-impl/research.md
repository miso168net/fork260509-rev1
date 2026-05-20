# Research: F13 — rust-refresh-token-impl

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-21

F13 brainstorm 已 saturated(3 拍板點)、`/speckit-clarify` 0 question(taxonomy 全 Clear)。Phase 0 由一支 codebase research agent 對 `rust-api/` 調查,解 brainstorm doc §9 列的 7 個 implement-time R-Q。

---

## R-Q1: login 的 Claims-building / user re-query

**Question**: rust login 怎麼組 access-token `Claims`?username / role / domain / org 從哪來?能否被 refresh path 重用?

**Evidence**(research agent、2026-05-21):
- 可重用 helper:`server_service::admin::sys_auth_service::generate_auth_output(user_id, username, role_codes, domain_code, organization_name, audience)`(`sys_auth_service.rs:335-360`)— 內部 `Claims::new(...)` + `JwtUtils::generate_token` + `JwtUtils::generate_refresh_token`,回 `AuthOutput { token, refresh_token }`。
- login(`pwd_login`、`sys_auth_service.rs:104-129`)流程:`verify_user(identifier, password, domain)`(查 `sys_user::find_active` + 密碼驗證)→ `get_user_roles(user_id, db)`(`:256-269`,join `sys_role`×`SysUserRole`×`SysUser` 取 role.code list)→ `generate_auth_output(...)`;login 傳 `organization_name = None`。
- `Claims`(`server-core::web::auth.rs:7-46`):`sub`/`exp`/`iss`/`aud`/`iat`/`nbf`/`jti`/`username`/`role: Vec<String>`/`domain`/`org`。
- `RefreshClaims` 只帶 `sub`(user_id)+ 標準 JWT 欄、**不帶** username/role/domain/org。

**Decision**: F13 refresh 重用既有元件 — 由 refresh token 取 `sub`(user_id)→ `sys_user::find_active().filter(Id.eq(user_id)).one(db)` 取 user(username + domain;同時即 R-Q7 軟刪檢查)→ `get_user_roles(user_id, db)` 取 role_codes → `generate_auth_output(user_id, username, role_codes, domain, None, audience)` 一次產出新 access + 新 refresh token。不重做 Claims-building、不抽新 helper。

**Rationale**: `generate_auth_output` 與 `get_user_roles` 已是 login 用的可重用 helper;F13 與 login 唯一差異是「不驗密碼、改由 refresh token 提供 user 身分」。重查使新 token 反映 user 當下 role(per spec Q3 / FR-013)。

**Spec impact**: data-model E3;spec FR-013 對齊。

---

## R-Q2: `validate_refresh_token` 實作

**Question**: rust 怎麼驗 refresh token?既有有無對應函式?

**Evidence**(research agent):
- jwt.rs 有 `generate_refresh_token`(`:121-151`)+ `RefreshClaims`(`:14-54`)、但**無** refresh token 驗證函式;`validate_token`(`:153-169`)只驗 access token(用 `global::KEYS` + 共用 `VALIDATION`、`set_audience`)。
- `global::KEYS` 與 `global::REFRESH_KEYS` 為兩組獨立金鑰(`global.rs:99-101`);`REFRESH_KEYS` 於 `jwt_initialization.rs:18-27` 以 `jwt_config.refresh_secret` 初始化(F10.1)。
- `RefreshClaims` **無 `aud` 欄** → 驗證須 `validation.validate_aud = false`;jwt.rs 既有 unit test(`:186-218`)即此 pattern:`Validation::new(HS256)` + `set_issuer` + `validate_nbf = true` + `validate_aud = false` + `decode::<RefreshClaims>`。

**Decision**: F13 於 `server/core/src/web/jwt.rs` 新增 `validate_refresh_token(token: &str) -> Result<TokenData<RefreshClaims>, JwtError>` — 取 `global::REFRESH_KEYS` 的 decoding key、建 `Validation`(HS256 + issuer + `validate_aud = false` + leeway 對齊既有 60s)、`decode::<RefreshClaims>`。簽章無效 / 過期 / nbf 未到 → 回 `JwtError`。

**Rationale**: refresh token 與 access token 用不同金鑰、`RefreshClaims` 無 `aud` → 不能重用 `validate_token`;新函式對齊既有 unit test 已驗證的 Validation 形態。

**Spec impact**: data-model E2;spec FR-004 對齊。

---

## R-Q3: sys_tokens 新 row 的 context 欄位

**Question**: refresh 寫新 `sys_tokens` row 需要 ip / address / user_agent / port / request_id / type — 怎麼取?

**Evidence**(research agent):
- login handler(`sys_authentication_api.rs:27-62`)以 axum extractor 取:`ConnectInfo<SocketAddr>`(ip fallback + port)、`HeaderMap`(`ClientIp::get_real_ip` 解 X-Forwarded-For)、`TypedHeader<UserAgent>`、`Extension<RequestId>`;`address` 由 `xdb::searcher::search_by_ip(client_ip)`(ip2region、**同步**呼叫)。組成 `LoginContext`(`sys_auth_dto.rs`)。
- `AccessTokenEvent`(`access_token_event.rs:8-50`)把 `LoginContext` map 進 `sys_tokens` row:`status = TokenStatus::Active`、`login_time = now`、`created_by = username`、`type = login_type`("PC")。現用無-transaction `.insert(db)`。

**Decision**: F13 的 refresh handler 以**完全相同的 extractor** 取 ip / port / user_agent / request_id;`address` 同樣以 `xdb::searcher::search_by_ip` 查;新 `sys_tokens` row 的 `login_time` / `created_at` = now、`created_by` = username、`type` 沿用 `"PC"`(或標 `"refresh"` — implement 階段定、不影響 acceptance)。

**Rationale**: refresh request 與 login request 同為帶 client 的 HTTP 請求,context 欄位取法可完全比照;新 row 反映 refresh 當下的連線資訊。

**Spec impact**: data-model E4 / E5;spec FR-015 對齊。

---

## R-Q4: sys_tokens 輪替的 sea-orm transaction 寫法

**Question**: 「UPDATE 舊 row status + INSERT 新 row」怎麼包進單一 transaction?

**Evidence**(research agent):
- transaction pattern(`facade/sys_user.rs:31-89` `soft_delete_by_id`):`db.begin()` → `Entity::update_many().col_expr(...).filter(...).exec(&txn)` → 其他寫入 `(&txn)` → `txn.commit()`;失敗各步 `map_err` 成 `AppError`。
- `TokenStatus`(`server-constant::definition::consts.rs:4-25`):`Active`→`"unused"` / `Refreshed`→`"used"` / `Revoked`→`"revoked"`;`can_refresh()` 僅 `Active` true。
- `sys_tokens` entity(`entities/sys_tokens.rs`)`status: String`;可用 `ActiveModel` / `update_many` 操作。**目前無 `sys_tokens` facade**。

**Decision**: F13 的輪替於 `refresh_token` service method 內以單一 `DatabaseTransaction` 完成:`txn = db.begin()` → `sys_tokens::Entity::update_many().col_expr(Column::Status, TokenStatus::Refreshed 字串).filter(Column::RefreshToken.eq(<舊 refresh token>)).filter(Column::Status.eq(TokenStatus::Active 字串)).exec(&txn)`(`rows_affected` 須 == 1、否則視為已被輪替/競態 → rollback 拒絕)→ 新 `SysTokensActiveModel { ... status: Active ... }.insert(&txn)` → `txn.commit()`。**不新增 `sys_tokens` facade**(F13 minimal、inline 於 service);既有 `AccessTokenEvent` 不改(login 路徑不動、per FR-021)。

**Rationale**: per-feature minimal — 輪替邏輯為 F13 專屬、inline 於 `refresh_token` service method 即可;`update_many` filter 同時帶 `status = Active` 條件 → 並行雙呈遞時只有一個 `rows_affected == 1`(解 spec E-7)。

**Spec impact**: data-model E4;spec FR-010 / FR-011 / FR-012 / E-7 對齊。

---

## R-Q5: F4 envelope error code

**Question**: refresh 失敗回哪些 business code?DTO 缺欄位怎麼樣?

**Evidence**(research agent):
- `server-core::web::code.rs` 既有碼:`CODE_SUCCESS=0`、`CODE_EXPIRED_TOKEN_SIGNATURE=3333`(「also covers JWT decode errors」)、`CODE_EXPIRED_REFRESH_TOKEN=9998`、`CODE_LOGOUT_SESSION_INVALIDATED=8888`、`CODE_BUSINESS_ENTITY_NOT_FOUND=6001`、`CODE_BUSINESS_STATE_CONFLICT=6003`、`CODE_VALIDATION_REQUIRED_FIELD=4001` 等。
- login auth 失敗用 `UserError`(`sys_user_error.rs`,1001-1005)。
- DTO 缺欄位 / 格式錯經 `ValidatedForm` / `ValidationError`(`validator.rs:75-108`)→ HTTP 400。

**Decision**: F13 error code 對應(滿足 spec FR-008「不細分以免洩漏 token 存在性」):
- request body 缺 `refreshToken` / 格式錯 → `ValidatedForm` validation → HTTP 400(`CODE_VALIDATION_REQUIRED_FIELD` 4001)。
- refresh token 簽章無效 / 已過期 / 查無 `sys_tokens` row / status 非 `unused` — **四者統一回單一碼 `CODE_EXPIRED_TOKEN_SIGNATURE`(3333)**,對 client 不細分(FR-008);server log 端可細分以利排查。
- 對應 user 已軟刪 / 不存在 → `CODE_LOGOUT_SESSION_INVALIDATED`(8888,對齊 JWT middleware FR-028 既有處理、觸發 base-web immediate logout)。
- 成功 → `CODE_SUCCESS`(0)+ `AuthOutput`。

**Rationale**: FR-008 要求 refresh-token 失敗不細分;3333「also covers JWT decode errors」為現成最接近的「token 無法使用」統一碼。軟刪 user 用 8888 對齊既有 middleware 行為(非 token 存在性洩漏、屬不同軸線)。

> ⚠️ **implement 階段驗證點**:3333 須讓 base-web 的 refresh 失敗流程觸發 re-login(F14 cutover 後 base-web 直接收 rust 回應);implement / acceptance 時對照 base-web refresh-failure 處理,若 base-web 期待別碼則調整為 base-web 既有期待碼(per Constitution IV「後端適應 base」)。

**Spec impact**: data-model E3 / E6;spec FR-008 對齊。

---

## R-Q6: public router mount

**Question**: `/auth/refreshToken` 掛在哪個 router?

**Evidence**(research agent):
- `sys_authentication_route.rs:12-15` `init_authentication_router()` = **public router**(`/login` 掛此、無 JWT middleware、無 Casbin);`Router::new().route("/login", post(...))` 再 `.nest("/auth", router)`。
- `init_protected_router()`(`:17-61`)= 受保護 router(`/getUserInfo` 等、經 JWT + Casbin),用 `add_route(RouteInfo::new(...))` 註冊進全域 route registry。
- public router 的 route **不**註冊 route registry(無 RBAC)。

**Decision**: F13 於 `init_authentication_router()` 加 `.route("/refreshToken", post(SysAuthenticationApi::refresh_token_handler))` — 與 `/login` 同層、public、不經 JWT middleware、不經 Casbin、**不需 `RouteInfo` 註冊**。

**Rationale**: refresh token 即憑證,refresh endpoint 不應要求有效 access token(spec FR-002);public router 為正確掛載點。

**Spec impact**: data-model E6;spec FR-002 對齊。

---

## R-Q7: user soft-delete 檢查

**Question**: refresh 怎麼擋已軟刪 user?能否重用既有檢查?

**Evidence**(research agent):
- JWT middleware(`middleware/src/jwt.rs:9-75`、FR-028)驗 access token 後以 `sys_user::find_active().filter(Id.eq(user_id)).one(db)` 查 user;`Ok(None)`(軟刪)→ 回 `CODE_LOGOUT_SESSION_INVALIDATED`(8888)。
- `sys_user::find_active()`(`facade/sys_user.rs:24-29`)= `SoftDeletable` trait 的 `find_active()`(隱含 `deleted_at IS NULL`)。

**Decision**: F13 refresh path 不經 middleware → `refresh_token` service method 自行以 `sys_user::find_active().filter(Id.eq(user_id)).one(db)` 查 user — `Ok(Some(user))` 取 username/domain(同時供 R-Q1 重建 Claims)、`Ok(None)` → 拒絕回 8888。**一次查詢雙用途**(軟刪檢查 + 取身分)。

**Rationale**: refresh endpoint 為 public、不經 JWT middleware,須自行做軟刪檢查;且 R-Q1 重建 Claims 本就需 user row → 同一 `find_active` 查詢即可。

**Spec impact**: data-model E3;spec FR-007 對齊。

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 — 重用 `generate_auth_output` + `get_user_roles`;由 user_id 重查身分
- ✅ R-Q2 — 新增 `validate_refresh_token`(`REFRESH_KEYS` + `validate_aud=false`)
- ✅ R-Q3 — refresh handler 以同 login 的 extractor 取 context;`address` 走 xdb
- ✅ R-Q4 — 輪替於 service method 單一 transaction(`update_many` filter 帶 status 條件解競態)
- ✅ R-Q5 — error code 對應確定(3333 統一拒絕碼 / 8888 軟刪 / 4001 validation);1 implement-階段驗證點(base-web refresh-failure 碼)
- ✅ R-Q6 — 掛 `init_authentication_router()` public router、不需 RouteInfo
- ✅ R-Q7 — 重用 `sys_user::find_active`、一次查詢兼軟刪檢查 + 取身分
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — F13 brainstorm 已 saturated;Phase 0 為 implement-time pattern 確認,所有 R-Q 在既有 codebase 找到明確 pattern,F13 全程重用既有元件(`generate_auth_output` / `get_user_roles` / `sys_user::find_active` / `JwtUtils` / `TokenStatus` / F4 `Res`)、僅新增 `validate_refresh_token` 一個函式。
