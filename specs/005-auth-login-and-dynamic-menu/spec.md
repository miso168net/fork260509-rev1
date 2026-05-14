# Feature Specification: F5.1 — auth-login-and-dynamic-menu

**Feature Branch**: `005-auth-login-and-dynamic-menu`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "F5.1 auth-login-and-dynamic-menu — DESIGN-A scope minimal 解鎖 P2"

**Source brainstorming**: [`docs/superpowers/005-feature-auth-login-and-dynamic-menu.md`](../../docs/superpowers/005-feature-auth-login-and-dynamic-menu.md)（2026-05-15 superpowers:brainstorming session 產出、4 個 clarification 拍板）

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 F5（P2 解鎖 base 主體）、§6.2 依賴序（F1-F4 全 P1 為 prereq）
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §6.1 F5（DESIGN-B 多 Casbin redis pub-sub channel 強制 → 留 F5.2 / F10 / F14 同期）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle I RBAC fail-safe、Principle II Soft Delete + 全域 Audit、Principle IV base 不改動邊界、Principle V 漸進收縮）
- [`specs/001-response-shape-alignment/spec.md`](../001-response-shape-alignment/spec.md)（F4，已完成；F4 envelope 對齊 login / getUserInfo / getUserRoutes 返 shape）
- [`specs/002-soft-delete-infrastructure/spec.md`](../002-soft-delete-infrastructure/spec.md)（F3，已完成；F3 G9 jwt_auth_middleware FR-028 軟刪 user 8888 check 在 getUserInfo / getUserRoutes 自動觸發）
- [`specs/003-audit-log-infrastructure/spec.md`](../003-audit-log-infrastructure/spec.md)（F2.1，已完成；login_succeeded / login_failed audit 走 auth_event_handler）
- [`specs/004-jwt-secrets/spec.md`](../004-jwt-secrets/spec.md)（F1.1，已完成；JWT 簽 strict-validated secret + Claims 11 fields 用於 login 簽 token + getUserInfo / getUserRoutes 驗 token）

**Scope summary**：rev1 rust-api **auth login + dynamic menu** 整套交付 — DESIGN-A 設計支柱第一條落地、P2 解鎖 base-web 主體（`_builtin/login` + `home` + 路由守衛）。F5.1 範圍刻意縮限：(a) `/auth/login` + `/auth/getUserInfo` + `/route/getUserRoutes` + `/route/getConstantRoutes` 4 個 endpoint 整套 audit + targeted gap fix；(b) endpoint path align（rust-api `/auth/getUserRoutes` → `/route/getUserRoutes` 唯一 path、刪除舊 path、`/authorization/getUserRoutes` 屬 F8 範圍不動）；(c) Casbin enforce 首次啟用 verify（既有 `axum_casbin::CasbinAxumLayer` wire 已就位、policy seed 完整、enforce 拒絕走 F4 envelope）；(d) login flow e2e 跨整套（login 拿 token → 跨 getUserInfo / getUserRoutes、F3 G9 軟刪 user 8888 check + F2.1 audit row + F4 envelope 全 verify）；(e) unit + integration + real-postgres acceptance test 同 F3 模式。Casbin redis pub-sub channel + refresh token rotation + captcha / `/auth/error` stub 全部留 F5.2 / F10 / F11 階段。

## Clarifications

### Session 2026-05-15（brainstorming 階段拍板、4 項）

- Q1: F5 整體範圍要不要一次交付？rev1 階段是「DESIGN-A 過渡 → DESIGN-B 終局」、F5 是 P2 第一個 feature、Casbin enforce 在 F5 首次啟用、DESIGN-B 多 1 條 redis pub-sub channel `casbin:policy:invalidate`、是否要 F5 同步交付？ → A: **拆 F5.1 + F5.2 兩階**（仿 F1.1 模式）。F5.1 = DESIGN-A scope minimal 解鎖 P2；F5.2 = Casbin redis pub-sub channel 與 F10 / F14 同期交付（rev1 階段單 instance、pub-sub 無 immediate caller、現階段加是 over-engineer；F10/F14 階段才有 multi-instance caller，與 F1.2 邏輯一致）。

- Q2: F5.1 endpoint path 對齊怎麼走？rust-api 既有 `/auth/getUserRoutes`、base-web 期 `/route/getUserRoutes`（DESIGN-A 規格 + 兩套 service client 都 call `/route/getUserRoutes`）。 → A: **移動 + 刪除舊 path**（唯一 `/route/getUserRoutes`）。rust-api 改 router、刪除 `/auth/getUserRoutes`、只留 `/route/getUserRoutes`；grep 確認 rust-api 內 0 caller 依賴舊 path、無 break risk；單一 path 比 alias 並存乾淨、避免後續 drift；Constitution §III 單一職責對齊；`/authorization/getUserRoutes` 屬 F8 範圍、F5.1 不動。

- Q3: F5.1 implementation approach 怎麼走？既有 rust-api 4 endpoint handler（login_handler / get_user_info / get_user_routes / get_constant_routes）都已實作、P1 4 個 layer（F1.1 JWT / F2.1 audit / F3 軟刪 / F4 envelope）已在位。 → A: **Audit + targeted gap fix**。F5.1 = (a) endpoint path align (Q2 拍板) · (b) shape 對齊 verify（rust output vs base-web `Api.*` typings 每 field：`LoginToken {token, refreshToken}` ↔ `AuthOutput` camelCase ✓ / `UserInfo {userId, userName, roles, buttons}` ↔ `UserInfoOutput` ✓ / `UserRoute {routes, home}` ↔ `UserRoute` ✓ / `MenuRoute` 詳細欄位 detailed audit）· (c) Casbin `CasbinAxumLayer` router 上 wire verify（既有 router_initialization.rs:72-76 已 wire）· (d) login flow e2e quickstart · (e) base-web `_builtin/login` + `home` 唯一拉完整 deploy stack 跨。不 rewrite 既有 service/handler；與 F4 / F3 / F2.1 / F1.1「既有 + layer」模式一致。

- Q4: F5.1 verify 策略 + e2e test scope 怎麼走？F5 是 Casbin enforce 首次啟用 + login flow 首次 e2e 跨。 → A: **Unit + integration + real-postgres acceptance test**（同 F3 模式）。F5.1 交付 (a) unit test（UserInfoOutput / UserRoute shape · TreeBuilder · find_first_valid_route）+ (b) integration test（login_handler axum-test-helpers + Casbin layer mock policy）+ (c) real-postgres acceptance test（3 個 `#[ignore]` e2e fn：login · getUserInfo · getUserRoutes、需 `TEST_DATABASE_URL`）近似 F3 G11 模式；CI regression guard 一致；spec 完整度與 F3 / F2.1 對齊。

### Session 2026-05-15（spec-kit `/speckit-clarify` 階段拍板）

- Q: Login flow audit row 對密碼欄怎麼處理？F2.1 audit infrastructure 既有 `AuditSerialize::redacted_fields()` trait-based redaction、但 spec FR-006 對 login 流程 payload 含密碼欄處理沒明示。 → A: **F5.1 verify audit payload 不含密碼欄**。`payload_after` = LoginEvent struct（無 password field）或 LoginInput 過 F2.1 redaction trait（password redacted）；acceptance test 期 payload 內 `grep password` 應 0 hit。最小風險、與 F2.1 整體紀律一致。

- Q: Casbin enforce 拒絕請求時返哪個 envelope shape？既有 axum_casbin layer 預設 HTTP 403 + plain text、F4 envelope 用 8888 series + `{code, msg, data}`。 → A: **F5.1 acceptance test 期 Casbin reject 返 F4 envelope**。具體 envelope code 由 plan 階段 research.md audit `AppError::Forbidden` mapping 決定；若 既有 axum_casbin layer 沒 hook F4 envelope（plain text 403）、**F5.1 範圍內補 thin adapter middleware**（after-layer）將 Casbin reject 轉成 F4 envelope；與 F4 envelope 紀律一致、base-web error handler 統一處理。

- Q: Migration policy seed 缺漏時 F5.1 補修 scope 邊界？涉及 sys_role_menu / sys_user_role / sys_casbin_rule / sys_menu / sys_role 多個表，哪些屬 F5.1 範圍補、哪些留 F7 manage-crud-alignment？ → A: **F5.1 補「讓 acceptance test pass 所需的 minimum seed」**：login flow + 3 個預設 user (Soybean / Administrator / GeneralUser) × role × menu policy mapping 跑通；具體該補什麼 record 由 plan research.md audit 既有 `datas/*` + acceptance test fixture 後決定；**複雜 menu 結構 / role hierarchy 改動屬 F7 範圍、F5.1 不動**。pragmatic + scope-bounded、與 spec FR-024 ~ FR-029 「MUST NOT」紀律一致。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rev1 admin 透過 base-web 完整登入 + 動態 menu 拉取（Priority: P1，唯一 US）🎯 MVP

operator 在 base-web 開 `_builtin/login` 頁、輸入帳號（如預設 `Soybean` / `Administrator` / `GeneralUser` 三個之一）+ 密碼 `123456` → 觸發 `POST /auth/login` → rust-api `pwd_login` flow 完整跑：(1) verify_user（BCrypt + role lookup）→ (2) generate_auth_output（F1.1 strict-validated JWT secret 簽 token）→ (3) send_login_event（F2.1 audit row `login_succeeded`）→ (4) 返 `{token, refreshToken}` F4 envelope camelCase。base-web 拿 token 存 localStorage、自動 trigger 2 個 protected request：`GET /auth/getUserInfo`（F3 G9 jwt_auth_middleware 跑 軟刪 user 8888 check → axum_casbin enforce → 返 `{userId, userName, roles, buttons:[]}`）+ `GET /route/getUserRoutes`（同中介層 → sys_role_menu JOIN sys_role 取 menu_ids → sys_menu find_active 取 menus → TreeBuilder build 樹狀 → 返 `{routes, home}`）。base-web 拿 UserRoute.routes → vue-router register dynamic menu → operator 看到 `home` page + 完整 menu 樹。

**Why this priority (P1，唯一 US，no further decomposition)**：

F5.1 的 5 個交付片段（endpoint path align / shape verify / Casbin enforce 啟用 / login flow e2e / unit+integration+acceptance test）**並非獨立可交付**：

- 單獨改 endpoint path → 沒 Casbin enforce wire verify → base-web 拿 token 後 getUserRoutes 可能 silent unauthorized
- 單獨 wire Casbin enforce → 沒 login flow e2e verify → policy seed 對 3 個預設 user 缺失 path 不被發現
- 單獨 verify shape → 沒 acceptance test → 後續 P3 F7 改 sys_role_menu schema 時 silent break F5 路徑
- 單獨寫 acceptance test → 沒 endpoint path align → test 跑舊 path、base-web 走新 path、e2e 不對齊
- 單獨 deploy stack e2e curl → 沒 unit test → DB 沒起 / Casbin 模型不對時、debug 範圍過廣

任一單一片段交付了、其他沒交付、整個 P2 解鎖目標都沒達成。F5.1 是 **base-web 主體解鎖的 e2e 原子 increment** — 5 個片段是同一個 user story 的 5 個 acceptance dimensions。

**Independent Test**：完整 deploy stack（postgres + redis + rust-api server 在 release build 走 application.yaml + 真 secret + base-web `_builtin/login`）跑通：

1. 預設無 secret env override → boot panic（F1.1 placeholder validation ✓）
2. `export APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"` + 起 rust-api → boot 成功
3. base-web 開 `_builtin/login` → 輸 `Soybean` / `123456` → 拿 `{token, refreshToken}` F4 envelope ✓
4. base-web 自動 call `/auth/getUserInfo` → 返 `{userId, userName, roles, buttons:[]}` ✓
5. base-web 自動 call `/route/getUserRoutes` → 返 `{routes:[...], home:"/home"}` ✓
6. base-web register dynamic menu → operator 看 `home` + 完整 menu tree
7. F2.1 audit row：`sys_operation_log` 內出現 1 row `login_succeeded` payload 含 user_id / username / client_ip / user_agent
8. 軟刪 user 後重 boot rust-api → 用同 token call `/auth/getUserInfo` → 返 8888 `LOGOUT_SESSION_INVALIDATED`（F3 G9 layer ✓）

**Acceptance Scenarios**:

#### Dimension A — Endpoint path align（FR-001 ~ FR-003）

1. **Given** F5.1 完成、查 rust-api router 設定，**When** grep `/auth/getUserRoutes`，**Then** 0 命中（既有舊 path 已刪除）
2. **Given** F5.1 完成、查 rust-api router 設定，**When** grep `/route/getUserRoutes`，**Then** ≥1 命中（新 path 已 mount）
3. **Given** rust-api server 起動完成，**When** base-web 兩套 service client（`service/` axios + `service-alova/` alova）發 `GET /route/getUserRoutes` + Bearer token，**Then** 兩套都 200 + envelope 返 `UserRoute` shape

#### Dimension B — Login flow（FR-004 ~ FR-008）

4. **Given** rust-api server + DB ready 含 3 個預設 user，**When** `POST /auth/login` body `{"identifier":"Soybean","password":"123456"}`，**Then** 返 F4 envelope `{code:0, data:{token:<JWT>, refreshToken:<string>}}`
5. **Given** 同上，**When** 解 JWT token，**Then** 含 11 claims（sub=user_id / exp / iss=APP_JWT_ISSUER / aud="ManagementPlatform" / iat / nbf / jti / username="Soybean" / role=["ROLE_*"] / domain="built-in" / org）
6. **Given** 同上，**When** 查 `sys_operation_log`，**Then** 新增 1 row `operation=login_succeeded`、`payload_after` 含 user_id / username / client_ip / user_agent / request_id（F2.1 audit）
7. **Given** rust-api server ready，**When** `POST /auth/login` body 密碼錯，**Then** 返 F4 envelope 8888 series `INVALID_CREDENTIALS`（具體 code 對齊既有 `AppError` mapping）+ `sys_operation_log` row `login_failed`
8. **Given** rust-api server ready、user 已軟刪（deleted_at != NULL），**When** `POST /auth/login` 對該 user，**Then** 返 F4 envelope 8888 series `USER_NOT_FOUND` 或 `USER_DISABLED`（F3 整合既有 mapping）

#### Dimension C — getUserInfo（FR-009 ~ FR-011）

9. **Given** 拿到 valid token（dimension B），**When** `GET /auth/getUserInfo` + `Authorization: Bearer <token>`，**Then** 返 F4 envelope `{code:0, data:{userId:<ULID>, userName:"Soybean", roles:["ROLE_*"], buttons:[]}}`
10. **Given** 同上 + token 已過期，**When** call getUserInfo，**Then** 返 F4 envelope 401 + `TOKEN_EXPIRED`
11. **Given** valid token + user F5.1 後軟刪 + token 仍未過期，**When** call getUserInfo，**Then** F3 G9 jwt_auth_middleware FR-028 觸發 → 返 F4 envelope 8888 `LOGOUT_SESSION_INVALIDATED`

#### Dimension D — getUserRoutes / getConstantRoutes（FR-012 ~ FR-015）

12. **Given** 拿到 valid token (Soybean、role 含 ROLE_SUPER_ADMIN)，**When** `GET /route/getUserRoutes`，**Then** 返 F4 envelope `{code:0, data:{routes:[...非空 menu tree], home:"/home"}}`、routes 含完整 sys_role_menu 對應 menu
13. **Given** valid token (user role_codes 為空)，**When** `GET /route/getUserRoutes`，**Then** 返 `{routes:[], home:"/home"}`（既有 service 處理）
14. **Given** rust-api server ready、無 token，**When** `GET /route/getConstantRoutes`，**Then** 返 F4 envelope `{code:0, data:[...constant routes]}`（public path、Casbin 不 enforce）
15. **Given** valid token，**When** `GET /route/getUserRoutes` 取得 menu tree，**Then** 每個 MenuRoute 含 name / path / component / meta:{title, i18nKey, keepAlive, constant, icon, order, href, hideInMenu, activeMenu, multiTab} / children / id / pid（serde camelCase 對齊 base `Api.Route.MenuRoute`）

#### Dimension E — Casbin enforce（FR-016 ~ FR-018）

16. **Given** rust-api server boot 完成 + Casbin policy 從 DB 載入完整，**When** `axum_casbin::CasbinAxumLayer` 對 protected admin router enforce，**Then** subject = role_codes、object = request path、action = HTTP method、domain = user.domain
17. **Given** valid token + role 對 path 無 policy，**When** call protected endpoint，**Then** 返 F4 envelope 403 + Casbin enforce reject reason
18. **Given** migration `datas/*` seed 完整，**When** Soybean / Administrator / GeneralUser 各自 login 後 getUserRoutes，**Then** 三者返不同 menu tree（per sys_role_menu 對應）

#### Dimension F — Shape align（FR-019 ~ FR-021）

19. **Given** F5.1 完成、查 `server/model/src/admin/output/sys_authentication.rs`，**Then** `AuthOutput` / `UserInfoOutput` / `UserRoute` 三個 struct 都有 `#[serde(rename_all = "camelCase")]` attribute、field 命名與 base-web `Api.Auth.*` / `Api.Route.*` 100% 對齊
20. **Given** F5.1 完成、查 `server/model/src/admin/output/sys_menu.rs`，**Then** `MenuRoute` + `RouteMeta` struct 都有 camelCase、欄位對齊 base `Api.Route.MenuRoute extends ElegantConstRoute & {id}`
21. **Given** rust-api 返 envelope，**When** base-web TypeScript 解 response，**Then** 兩套 service client（axios + alova）都能 cast 進 `Api.Auth.*` / `Api.Route.*` 不需 manual remap

#### Dimension G — Backward compat（FR-022 ~ FR-023）

22. **Given** F5.1 完成、F3 G9 既有 `jwt_auth_middleware.rs` + `jwt.rs` 軟刪 user FR-028 check 仍存在，**When** 跑 F3 既有 acceptance test，**Then** 全 pass（F1-F4 既有 layer 不破壞）
23. **Given** F5.1 完成、F2.1 既有 audit middleware path 仍存在，**When** 跑 F2.1 既有 acceptance test，**Then** 全 pass

### Edge Cases

- **rust-api server 起動時 DB connection fail**：既有 retry / error handle 機制；F5.1 不改 retry policy；boot error 走 panic（F1.1 / 既有風格）
- **Casbin policy DB 載入失敗 (e.g. sys_role_menu schema 不對)**：rust-api boot panic（fail-fast、per Principle I RBAC fail-safe）
- **Token 有效但 user 在 token 簽發後被軟刪**：F3 G9 FR-028 在 getUserInfo / getUserRoutes 自動觸發 8888；F5.1 不需新增 check
- **role_codes 含已軟刪的 role**：既有 sys_role::find_active 應過濾；F5.1 verify 既有 query 走 find_active facade（per F3 G9 layer）
- **menu_ids 對應的 sys_menu 全部 disabled / 軟刪**：returns `{routes:[], home:"/home"}`（既有 service handle）
- **Casbin model file `server/resources/rbac_model.conf` missing**：rust-api boot panic（既有 `unwrap()` at router_initialization.rs:103、F5.1 acceptable / 與 F1.1 fail-fast 風格一致）
- **base-web localStorage 滿 / token 寫入失敗**：屬 base-web 範疇、F5.1 不處理（Constitution §IV base 不改動邊界）
- **不同 audience 的 token cross-call**（如 ManagementPlatform token call AppPortal endpoint）：jwt_auth_middleware audience check 拒絕；既有 layer 處理
- **同一 user 多 device 同時 login**：每次 login 簽新 token、舊 token 不 revoke（rev1 階段無 family / rotation chain；F10 階段才處理）
- **panic 訊息對 secret 不 leak**：F1.1 已守；F5.1 不引入新 panic path
- **migration up 後 policy seed 不完整**：acceptance test 跑前 verify `datas/*` 內 3 個預設 user × role × menu policy 完整、若缺 補 datas/ migration

---

## Requirements *(mandatory)*

### Functional Requirements

#### Endpoint path align（FR-001 ~ FR-003）

- **FR-001**: F5.1 MUST 從 `rust-api/server/router/src/admin/sys_authentication_route.rs::init_protected_router` 刪除 `/auth/getUserRoutes` route（line 20 既有 mount）
- **FR-002**: F5.1 MUST 在 `rust-api/server/router/src/admin/sys_menu_route.rs::init_protected_menu_router` 內新增 `/route/getUserRoutes` route mount `SysAuthenticationApi::get_user_routes` handler（移動到 `/route` nest 內、與 `/route/getConstantRoutes` 一致 path prefix）
- **FR-003**: F5.1 **MUST NOT** 改 `/authorization/getUserRoutes` route（既有 sys_authentication_route.rs:49、屬 F8 範圍、保留不動）

#### Login flow（FR-004 ~ FR-008）

- **FR-004**: F5.1 MUST verify `POST /auth/login` 走完整 `sys_auth_service::pwd_login` flow：(a) `verify_user`（BCrypt + sys_user_role JOIN）→ (b) `generate_auth_output`（F1.1 strict-validated `jwt_secret` 簽 JWT）→ (c) `send_login_event`（F2.1 audit）→ (d) 返 `AuthOutput {token, refresh_token}` F4 envelope
- **FR-005**: F5.1 MUST verify JWT token 含 F1.1 claim-contract.md 列 11 claims（sub / exp / iss / aud / iat / nbf / jti / username / role / domain / org）
- **FR-006**: F5.1 MUST verify login 成功時 `sys_operation_log` 新增 1 row `operation=login_succeeded`、`payload_after` 含 user_id / username / client_ip / user_agent / request_id；payload 內**不**含 plaintext password（per F2.1 `AuditSerialize::redacted_fields()` trait redaction、acceptance test 期 payload `grep password` 應 0 hit）
- **FR-007**: F5.1 MUST verify login 密碼錯時 (a) 返 F4 envelope 8888 series `INVALID_CREDENTIALS` (b) `sys_operation_log` 新增 1 row `operation=login_failed`
- **FR-008**: F5.1 MUST verify login user 不存在 / 已軟刪 / 已停用時返 F4 envelope 8888 series（具體 code 對齊既有 `AppError` mapping）

#### getUserInfo（FR-009 ~ FR-011）

- **FR-009**: F5.1 MUST verify `GET /auth/getUserInfo` + valid token 返 `UserInfoOutput {user_id, user_name, roles, buttons}`（buttons:[] 既有 F4 預設、F7+ 填入）
- **FR-010**: F5.1 MUST verify token 過期 / 無效時返 F4 envelope 401 + `TOKEN_EXPIRED` 或同等 code
- **FR-011**: F5.1 MUST verify F3 G9 jwt_auth_middleware FR-028 軟刪 user 8888 check 在 getUserInfo flow 自動觸發（既有 layer、F5.1 不新增）

#### getUserRoutes / getConstantRoutes（FR-012 ~ FR-015）

- **FR-012**: F5.1 MUST verify `GET /route/getUserRoutes` + valid token 返 `UserRoute {routes, home}`、routes 走 `sys_role_menu JOIN sys_role → menu_ids → sys_menu find_active → TreeBuilder build` 路徑（既有 service 邏輯）
- **FR-013**: F5.1 MUST verify role_codes 為空時返 `{routes:[], home:"/home"}`
- **FR-014**: F5.1 MUST verify `GET /route/getConstantRoutes`（public 無 token）返 F4 envelope `{code:0, data:[...constant routes]}`、Casbin 不 enforce
- **FR-015**: F5.1 MUST verify 每個 `MenuRoute` 含 name / path / component / meta（title / i18n_key / keep_alive / constant / icon / order / href / hide_in_menu / active_menu / multi_tab）/ children / id / pid

#### Casbin enforce（FR-016 ~ FR-018）

- **FR-016**: F5.1 MUST verify rust-api boot 完成後 `CasbinAxumLayer` 從 DB（sea-orm-adapter）載入完整 policy 並對 protected admin router enforce
- **FR-017**: F5.1 MUST verify valid token + role 對 path 無 policy 時 Casbin enforce 拒絕、返 **F4 envelope shape**（HTTP status 403 + body `{code, msg, data}`、code 對齊既有 `AppError::Forbidden` mapping、具體 code 數由 plan 階段 research.md 確認）；若既有 `CasbinAxumLayer` 預設返 plain text 403（未 hook F4 envelope）、F5.1 範圍內補 thin adapter middleware 轉換、確保 base-web error handler 統一處理
- **FR-018**: F5.1 MUST verify migration `datas/*` 含 3 個預設 user (Soybean / Administrator / GeneralUser) × role × menu policy seed 完整、acceptance test 跑前 DB migrate up 後 三 user 各自 getUserRoutes 返不同 menu tree；若 seed 缺漏、F5.1 範圍**僅補 acceptance test pass 所需 minimum seed**（login + role-menu policy mapping），複雜 menu 結構 / role hierarchy 改動屬 F7 範圍

#### Shape align（FR-019 ~ FR-021）

- **FR-019**: F5.1 MUST verify `AuthOutput` / `UserInfoOutput` / `UserRoute` 三個 struct 含 `#[serde(rename_all = "camelCase")]`、序列化 field 命名對齊 base-web `Api.Auth.LoginToken {token, refreshToken}` / `Api.Auth.UserInfo {userId, userName, roles, buttons}` / `Api.Route.UserRoute {routes, home}`
- **FR-020**: F5.1 MUST verify `MenuRoute` + `RouteMeta` struct 含 camelCase、欄位對齊 base `Api.Route.MenuRoute extends ElegantConstRoute & {id}`（per ElegantConstRoute @elegant-router/types）
- **FR-021**: F5.1 MUST verify base-web 兩套 service client（`service/api/auth.ts` + `service-alova/api/auth.ts` 對 auth、`service/api/route.ts` + `service-alova/api/route.ts` 對 route）都能 cast 進 `Api.Auth.*` / `Api.Route.*` 不需 manual remap

#### Backward compat（FR-022 ~ FR-023）

- **FR-022**: F5.1 **MUST NOT** 破壞 F3 既有 acceptance test（`soft_delete_basics` + `soft_delete_audit_integration` + `soft_delete_auth_gate`）
- **FR-023**: F5.1 **MUST NOT** 破壞 F2.1 既有 audit middleware / sys_operation_log integration

#### 範圍邊界（FR-024 ~ FR-029）

- **FR-024**: F5.1 **MUST NOT** rewrite 既有 `sys_auth_service.rs` / `sys_authentication_api.rs` 任何 fn（per brainstorm Q3 audit + targeted gap fix）
- **FR-025**: F5.1 **MUST NOT** 動 `base-web/*` 任何檔（per Constitution §IV base 不改動邊界）
- **FR-026**: F5.1 **MUST NOT** 改 `domain: "built-in"` 寫死（既有 sys_authentication_api.rs:49 LoginContext.domain；F8/F9 階段才考慮 multi-tenant）
- **FR-027**: F5.1 **MUST NOT** 引入 Casbin redis pub-sub channel（屬 F5.2、與 F10 / F14 同期）
- **FR-028**: F5.1 **MUST NOT** 改 refresh token rotation 邏輯（屬 F10 refresh-token-bridge；既有 `AuthOutput.refresh_token` placeholder 接受不動）
- **FR-029**: F5.1 **MUST NOT** 改 `Claims` struct（per F1.1 FR-014 既建邊界、F5.1 沿用）

### Key Entities

#### `AuthOutput` struct（既有、不動）

`server_model::admin::output::sys_authentication::AuthOutput`（既有、F5.1 不改 struct、只 verify shape）：
- `token: String`（JWT serialize）
- `refresh_token: String`（rev1 階段可能 placeholder、F10 補實作）
- `#[serde(rename_all = "camelCase")]` → 序列化 `{token, refreshToken}`

#### `UserInfoOutput` struct（既有、不動）

`server_model::admin::output::sys_authentication::UserInfoOutput`（既有、F5.1 不改）：
- `user_id: String`（ULID）
- `user_name: String`
- `roles: Vec<String>`
- `buttons: Vec<String>`（F5.1 接受 `vec![]` 預設、F7+ 填入）
- camelCase → `{userId, userName, roles, buttons}`

#### `UserRoute` struct（既有、不動）

`server_model::admin::output::sys_authentication::UserRoute`（既有、F5.1 不改）：
- `routes: Vec<MenuRoute>`（tree）
- `home: String`（預設 "/home"）

#### `MenuRoute` + `RouteMeta` struct（既有、不動）

`server_model::admin::output::sys_menu::{MenuRoute, RouteMeta}`（既有、F5.1 不改、只 verify shape 對齊 base ElegantConstRoute）

#### `Claims` struct（既有、不動，per F1.1 FR-014）

`server_core::web::auth::Claims`（F1.1 已 contract、F5.1 沿用 11 fields）

#### Casbin policy（既有 schema、F5.1 verify seed 完整）

- Model file: `rust-api/server/resources/rbac_model.conf`（既有）
- Adapter: `sea-orm-adapter` crate（從 DB 載 sys_casbin_rule table 既有）
- Policy seed: migration `datas/*` 對 3 個預設 user × role × menu × endpoint policy（F5.1 verify 完整）

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：rust-api router 內 `grep '/auth/getUserRoutes'` 返 0 hit（舊 path 已刪）— grep verify
- **SC-002**：rust-api router 內 `grep '/route/getUserRoutes'` 返 ≥1 hit（新 path 已 mount）— grep verify
- **SC-003**：`cargo test -p server-service auth_login` 全綠（unit test for AuthOutput / UserInfoOutput / UserRoute shape 對齊）— unit test 驗
- **SC-004**：`cargo test --test login_handler_integration` 全綠（integration test for login_handler axum-test-helpers + Casbin layer mock）— integration test 驗
- **SC-005**：`cargo test --test auth_login_e2e -- --ignored`（need TEST_DATABASE_URL）全綠（3 個 acceptance test fn：login / getUserInfo / getUserRoutes）— acceptance test 驗
- **SC-006**：F3 既有 acceptance test（`soft_delete_basics` + `soft_delete_audit_integration` + `soft_delete_auth_gate`）在 F5.1 後仍 pass — `cargo test --test soft_delete_*` 全綠
- **SC-007**：base-web 完整 deploy stack 跑通 `_builtin/login` page：輸 Soybean/123456 → 拿 token → 自動 call getUserInfo + getUserRoutes → register dynamic menu → operator 看 home + menu tree — quickstart Step 1-8 全 pass
- **SC-008**：登入時 `sys_operation_log` 新增 1 row `operation=login_succeeded`、payload 含 user_id / username / client_ip / user_agent / request_id — DB grep verify
- **SC-009**：登入失敗時 `sys_operation_log` 新增 1 row `operation=login_failed` — DB grep verify
- **SC-010**：3 個預設 user（Soybean / Administrator / GeneralUser）各自 login 後 getUserRoutes 返不同 menu tree（per sys_role_menu 對應）— acceptance test 驗
- **SC-011**：`cargo check --workspace` 全 workspace pass、0 errors / 0 warnings 由 F5.1 引入 — cargo check 驗

---

## Assumptions

- **既有 rust-api `sys_auth_service::pwd_login` flow 邏輯正確**：F5.1 不 audit BCrypt / role lookup 內部邏輯、信任既有 F1-F4 implementation
- **既有 `JwtUtils::generate_token` / `validate_token`** 不動（per F1.1 FR-018）；F5.1 沿用既有 JWT 簽驗 path
- **既有 `axum_casbin::CasbinAxumLayer` policy 載入機制**：boot 一次性從 DB 載 + in-process cache（rev1 單 instance、F5.1 階段足夠；F5.2 + F10/F14 階段加 pub-sub invalidation）
- **既有 migration `datas/*` 對 3 個預設 user × role × menu policy seed 完整**：若缺、F5.1 範圍內**僅補 acceptance test pass 所需 minimum seed**（login flow + 3 user × role × menu × policy mapping 跑通）；複雜 menu 結構 / role hierarchy / 大規模 sys_menu CRUD 改動屬 F7 manage-crud-alignment 範圍、F5.1 不動；具體缺哪些 record + 怎麼補由 plan research.md audit 既有 `datas/*` + acceptance test fixture 後 量化
- **既有 `auth_event_handler` audit event 路徑**（sys_auth_service:128 + :363 listener）能正常 trigger `sys_operation_log` 寫入（F2.1 layer 在位）
- **F4 envelope 對齊**：8888 series code 對 login 各種 error（INVALID_CREDENTIALS / USER_NOT_FOUND / USER_DISABLED / TOKEN_EXPIRED）已建立、F5.1 沿用既有 `AppError` mapping、不引入新 envelope code
- **Casbin enforce 拒絕 envelope hook**：若既有 `CasbinAxumLayer` 預設返 plain text 403 而未 hook F4 envelope shape、F5.1 範圍內補 thin adapter middleware（after-layer 轉換）；plan 階段 research.md 須 audit 既有 `axum_casbin::CasbinAxumLayer` reject path + `AppError::Forbidden` envelope code 確認 mapping、然後 plan / tasks 階段量化是否需 adapter
- **base-web shape declaration**：base-web `src/typings/api/auth.d.ts` + `route.d.ts` 內 `Api.Auth.*` + `Api.Route.*` interface 定義為 authoritative source；F5.1 對齊它（rust output match base typing、非反向）
- **`refresh_token` field placeholder**：rev1 階段 F5.1 不實作 rotation；既有 `AuthOutput.refresh_token` 接受空字串 / dummy value；F10 階段補實作（F5.1 不要求 token 真實 rotation 行為）
- **deploy stack 依賴**：F5.1 quickstart Step 6 (operator 看 home + menu tree) 需 deploy/（docker compose + nginx + .env.example）建後才能完整跨；F5.1 acceptance test 仍可在 `TEST_DATABASE_URL` + cargo run --bin server 環境 verify backend；deploy/ 建設不在 F5.1 範圍
- **rev1 dev DB 起 + migrations 套用 OK**：F5.1 acceptance test 跑前需此（per INTEGRATION-CHECKLIST §跨 feature 待驗證項）
