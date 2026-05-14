# Feature Specification: F5.1 — auth-login-and-dynamic-menu

**Feature ID**: F5（per [`DESIGN-A`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1）— **拆 F5.1 minimal 先交、F5.2 Casbin redis pub-sub channel 留與 F10/F14 DESIGN-B cutover 同期**
**Feature Branch**: TBD（spec-kit `/speckit-specify` 階段建立）
**Created**: 2026-05-15
**Status**: Draft（brainstorming 完成、待 spec-kit `/speckit-specify` 接手轉為正式 feature spec）
**Source**: superpowers:brainstorming 2026-05-15 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 F5（P2 解鎖 base 主體）、§6.2 依賴序（F1-F4 全 P1 為 prereq）
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) §6.1 F5（DESIGN-B 多 Casbin redis pub-sub channel `casbin:policy:invalidate` 強制 → 留 F5.2 / F10 / F14 同期）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle I RBAC fail-safe、Principle IV base 不改動邊界、Principle V 漸進收縮）
- [`docs/superpowers/001-feature-response-shape-alignment.md`](001-feature-response-shape-alignment.md)（F4，已完成；F4 envelope 對齊用於 login flow + getUserInfo / getUserRoutes 返 shape）
- [`docs/superpowers/002-feature-soft-delete-infrastructure.md`](002-feature-soft-delete-infrastructure.md)（F3，已完成；F3 G9 jwt_auth_middleware FR-028 軟刪 user 8888 check 在 getUserInfo / getUserRoutes 自動觸發）
- [`docs/superpowers/003-feature-audit-log-infrastructure.md`](003-feature-audit-log-infrastructure.md)（F2.1，已完成；login_succeeded / login_failed audit 走既有 `auth_event_handler` 路徑）
- [`docs/superpowers/004-feature-jwt-secrets.md`](004-feature-jwt-secrets.md)（F1.1，已完成；JWT 簽章 strict-validated secret 用於 login 簽 token + getUserInfo / getUserRoutes 驗 token）

**Scope summary**：rev1 rust-api **auth login + dynamic menu** 整套交付 — DESIGN-A 設計支柱第一條落地、P2 解鎖 base-web 主體（`_builtin/login` + `home` + 路由守衛）。F5.1 範圍刻意縮限：(a) `/auth/login` + `/auth/getUserInfo` + `/route/getUserRoutes` + `/route/getConstantRoutes` 4 個 endpoint 整套 audit + targeted gap fix；(b) endpoint path align（rust-api `/auth/getUserRoutes` → `/route/getUserRoutes` 唯一 path、刪除舊 path、`/authorization/getUserRoutes` 屬 F8 範圍不動）；(c) Casbin enforce 首次啟用 verify（既有 `axum_casbin::CasbinAxumLayer` wire 已就位、policy seed 完整、enforce 拒絕走 F4 envelope）；(d) login flow e2e 跨整套（login 拿 token → 跨 getUserInfo / getUserRoutes、F3 G9 軟刪 user 8888 check + F2.1 audit row + F4 envelope 全 verify）；(e) unit + integration + real-postgres acceptance test 同 F3 模式。Casbin redis pub-sub channel + refresh token rotation + captcha / `/auth/error` stub 全部留 F5.2 / F10 / F11 階段（per 拍板：rev1 階段單 instance、pub-sub 無 immediate caller；F10 refresh-token-bridge 階段加 refresh rotation + pub-sub bridge）。

## Clarifications

### Session 2026-05-15（brainstorming 階段拍板、4 項）

- Q1: F5 整體範圍要不要一次交付？rev1 階段是「DESIGN-A 過渡 → DESIGN-B 終局」、F5 是 P2 第一個 feature、Casbin enforce 在 F5 首次啟用、DESIGN-B 多 1 條 redis pub-sub channel `casbin:policy:invalidate`、是否要 F5 同步交付？ → A: **拆 F5.1 + F5.2 兩階**（仿 F1.1 模式）。F5.1 = DESIGN-A scope minimal（3 endpoint + Casbin in-process enforce + endpoint path align + login flow e2e）解鎖 P2；F5.2 = Casbin redis pub-sub channel 與 F10 refresh-token-bridge / F14 design-a-to-b-cutover 同期交付（rev1 階段單 instance、pub-sub 無 immediate caller、現階段加是 over-engineer；F10/F14 階段才有 multi-instance caller、與 F1.2 邏輯一致）。

- Q2: F5.1 endpoint path 對齊怎麼走？rust-api 既有 `/auth/getUserRoutes`、base-web 期 `/route/getUserRoutes`（DESIGN-A 規格 + 兩套 service client 都 call `/route/getUserRoutes`）。 → A: **移動 + 刪除舊 path**（唯一 `/route/getUserRoutes`）。rust-api 改 router、刪除 `/auth/getUserRoutes`、只留 `/route/getUserRoutes`；grep 確認 rust-api 內 0 caller 依賴舊 path、無 break risk；單一 path 比 alias 並存乾淨、避免後續 drift；Constitution §III「單一職責」對齊；`/authorization/getUserRoutes` 屬 F8 範圍、F5.1 不動（既有 sys_authentication_route.rs:49 那個 mount 留下、F8 階段一併處理）。

- Q3: F5.1 implementation approach 怎麼走？既有 rust-api 4 endpoint handler（login_handler / get_user_info / get_user_routes / get_constant_routes）都已實作、P1 4 個 layer（F1.1 JWT / F2.1 audit / F3 軟刪 / F4 envelope）已在位。 → A: **Audit + targeted gap fix**。F5.1 = (a) endpoint path align（Q2 拍板）· (b) shape 對齊 verify（rust output vs base-web `Api.*` typings 佔每 field：`LoginToken {token, refreshToken}` ↔ `AuthOutput {token, refresh_token}` camelCase ✓ / `UserInfo {userId, userName, roles, buttons}` ↔ `UserInfoOutput` ✓ / `UserRoute {routes, home}` ↔ `UserRoute` ✓ / `MenuRoute extends ElegantConstRoute & {id}` ↔ `MenuRoute` 詳細欄位 spec 階段 detailed audit）· (c) Casbin `CasbinAxumLayer` router 上 wire enable enforce verify（既有 router_initialization.rs:72-76 已 wire）· (d) login flow e2e quickstart（拿 token 跨 `/auth/getUserInfo` + `/route/getUserRoutes` · F3 G9 軟刪 user 走 8888 · F2.1 login_succeeded audit row · F4 envelope shape 驗）· (e) base-web `_builtin/login` + `home` 唯一拉完整 deploy stack 跨。不 rewrite 既有 service/handler；與 F4 / F3 / F2.1 / F1.1「既有 + layer」模式一致。

- Q4: F5.1 verify 策略 + e2e test scope 怎麼走？F5 是 Casbin enforce 首次啟用 + login flow 首次 e2e 跨、需決定 verify 到哪個層次？ → A: **Unit + integration + real-postgres acceptance test**（同 F3 模式）。F5.1 交付 (a) unit test（UserInfoOutput / UserRoute shape 對齊 · TreeBuilder 邊界 · find_first_valid_route 邏輯）+ (b) integration test（login_handler axum-test-helpers + Casbin layer 串接 mock policy）+ (c) real-postgres acceptance test（3 個 `#[ignore]` e2e fn：login · getUserInfo · getUserRoutes、需 `TEST_DATABASE_URL`）近似 F3 G11 模式；CI regression guard 一致；spec 完整度與 F3 / F2.1 對齊。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rev1 admin 透過 base-web 完整登入 + 動態 menu 拉取（Priority: P1，唯一 US）🎯 MVP

operator 在 base-web 開 `_builtin/login` 頁面、輸入帳號（如預設 `Soybean` / `Administrator` / `GeneralUser` 三個之一）+ 密碼 `123456` → 觸發 `POST /auth/login` → rust-api `pwd_login` flow 完整跑：(1) verify_user（BCrypt + role lookup）→ (2) generate_auth_output（F1.1 strict-validated JWT secret 簽 token）→ (3) send_login_event（F2.1 audit row `login_succeeded`）→ (4) 返 `{token, refreshToken}` F4 envelope camelCase。base-web 拿 token 存 localStorage、自動 trigger 2 個 protected request：`GET /auth/getUserInfo`（F3 G9 jwt_auth_middleware 跑 軟刪 user 8888 check → axum_casbin enforce → 返 `{userId, userName, roles, buttons:[]}`）+ `GET /route/getUserRoutes`（同中介層 → sys_role_menu JOIN sys_role 取 menu_ids → sys_menu find_active 取 menus → TreeBuilder build 樹狀 → 返 `{routes, home}`）。base-web 拿 UserRoute.routes → vue-router register dynamic menu → operator 看到 `home` page + 完整 menu 樹。

**Why this priority (P1，唯一 US，no further decomposition)**：

F5.1 的 5 個交付片段（endpoint path align / shape verify / Casbin enforce 啟用 / login flow e2e / unit+integration+acceptance test）**並非獨立可交付**：

- 單獨改 endpoint path → 沒 Casbin enforce wire verify → base-web 拿 token 後 getUserRoutes 可能 silent unauthorized（policy 缺）
- 單獨 wire Casbin enforce → 沒 login flow e2e verify → policy seed 對 `Soybean` / `Administrator` 缺失 path 不被發現、prod 上線爆
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

## 範圍邊界（明示）

### F5.1 範圍內

- **Endpoint path**：`/auth/login`（POST）+ `/auth/getUserInfo`（GET、protected）+ `/route/getUserRoutes`（GET、protected）+ `/route/getConstantRoutes`（GET、public）
- **Login flow audit**：`login_succeeded` + `login_failed` event 寫 `sys_operation_log`（既有 `auth_event_handler` 路徑、F2.1 audit 對齊）
- **Casbin enforce**：`CasbinAxumLayer` 在 protected admin router wire enable + policy seed verify（migration `datas/*` 對 3 個預設 user × role × menu 完整）
- **Shape align**：rust `AuthOutput` / `UserInfoOutput` / `UserRoute` / `MenuRoute` ↔ base `Api.Auth.LoginToken` / `Api.Auth.UserInfo` / `Api.Route.UserRoute` / `Api.Route.MenuRoute`（per field audit）
- **F3 G9 軟刪 user check**：getUserInfo / getUserRoutes 自動觸發 jwt_auth_middleware FR-028 check（既有 layer）
- **Acceptance test**：3 個 `#[ignore]` e2e fn 走 real-postgres、需 `TEST_DATABASE_URL`

### F5.1 範圍外

- `/authorization/getUserRoutes`（既有 sys_authentication_route.rs:49、屬 F8 `assign-users` 範圍）
- Casbin redis pub-sub channel `casbin:policy:invalidate`（屬 F5.2、與 F10/F14 同期）
- sys_user / sys_role / sys_menu / sys_role_menu CRUD endpoint（屬 F7 `manage-crud-alignment`）
- `/authorization/assign-permission` / `/authorization/assign-routes`（屬 F8、既有 sys_authentication_route.rs:25-57）
- Refresh token rotation（屬 F10 refresh-token-bridge）
- Captcha / `/auth/error` / `/mock/getLastTime` stub（屬 F11 extracted-stubs）
- multi-tenant domain 分流（F5.1 接受既有 `domain: "built-in"` 寫死 LoginContext、F8/F9 階段才考慮）
- button-level RBAC（F5.1 接受 `buttons: vec![]` 既有 F4 預設、F7+ feature 填入）

## Components / Data Flow

```
[base-web]
  POST /auth/login {userName, password}
    ↓
[rust-api router]
  → axum_casbin layer（need_casbin=false、public path）
    ↓
[sys_authentication_api::login_handler]（既有、不動）
  → 抽 client_ip / xdb IP→address / user_agent / request_id / domain="built-in" / audience=ManagementPlatform
    ↓
[sys_auth_service::pwd_login]（既有、不動）
  ├─ verify_user(identifier, password, domain) → BCrypt + sys_user_role JOIN → (user, role_codes)
  ├─ generate_auth_output → F1.1 strict-validated jwt_secret 簽 JWT token（11 claims）
  └─ send_login_event → AuthEvent::LoginSucceeded → auth_login_listener
       ↓
     [F2.1 audit row]
       sys_operation_log INSERT (operation=login_succeeded, entity_type=auth, payload_after=event JSON)
  ↓
  AuthOutput {token, refresh_token} → F4 envelope camelCase → {token, refreshToken}
    ↓ base-web 拿 token 存 localStorage

base-web 自動 trigger 2 個 protected request：

  GET /auth/getUserInfo + Authorization: Bearer <token>
    ↓
  [axum_casbin layer]（need_casbin=true、protected path）
    ↓
  [jwt_auth_middleware]（既有、含 F3 G9 軟刪 user 8888 check）
    ├─ JwtUtils::validate_token → decode 11 claims + 驗 iss / aud / exp / nbf
    ├─ 軟刪 check：sys_user::find_active().filter(Id.eq(user_id)).one(db) → None ? 8888 LOGOUT_SESSION_INVALIDATED
    └─ inject User extension（含 user_id / username / subject=roles / domain）
    ↓
  [axum_casbin enforce]（sub=role, obj="/auth/getUserInfo", act="GET", dom=domain）
    ↓
  [sys_authentication_api::get_user_info]（既有、不動）
    → UserInfoOutput {user_id, user_name, roles, buttons:[]} → F4 camelCase → {userId, userName, roles, buttons:[]}

  GET /route/getUserRoutes + Authorization: Bearer <token>
    ↓ 同上中介層（jwt_auth_middleware + Casbin enforce）
    ↓
  [sys_authentication_api::get_user_routes]（既有、不動）
    ↓
  [sys_auth_service::get_user_routes]（既有、不動）
    ├─ sys_role_menu JOIN sys_role.code IN role_codes + Domain=domain → menu_ids
    ├─ sys_menu find_active(F3 軟刪過濾) + Status=Enabled + order_by_asc(sequence) → menus
    ├─ MenuRoute mapping（name, path, component, meta:{title, i18n_key, keep_alive, ...}, children=[], id, pid）
    └─ TreeBuilder::build → 樹狀 routes
    ↓
  UserRoute {routes, home="/home"} → F4 camelCase

base-web → 拿 UserRoute.routes → vue-router addRoutes 註冊動態 menu → operator 看 home + 完整 menu 樹
```

## 已知 GAP（F5.1 內處理）

1. **endpoint path align**：rust-api 改 router、`/auth/getUserRoutes` 移除、改 `/route/getUserRoutes`、grep verify 0 caller 依賴舊 path
2. **Casbin enforce wire verify**：confirm `router_initialization.rs:72-76` 已對 protected admin router 加 `need_casbin=true`、policy 從 DB 載完整
3. **Casbin policy seeding completeness**：verify migration `datas/*` 為 3 個預設 user (Soybean / Administrator / GeneralUser) × role × menu policy 種子完整、F5.1 acceptance test 跑前 DB migrate up 後 policy 完整
4. **`domain: "built-in"` 寫死**：sys_authentication_api.rs:49 LoginContext.domain 寫死 — F5.1 階段不動（rev1 單 tenant、F8/F9 階段才考慮 multi-tenant）
5. **error case envelope**：login 失敗（user 不存在 / 密碼錯 / user disabled / user soft-deleted）→ 確認返 F4 8888 系列 code、msg 對齊既有 `AppError` mapping；Casbin enforce 拒絕 → 確認返 F4 envelope 403
6. **`refresh_token` field**：既有 `AuthOutput` 含 `refresh_token: String`、但 rev1 階段未實作 rotation（F10 範圍）；F5.1 接受既有 placeholder 值（可能空字串或 dummy）、F10 階段補實作

## Error Handling 範圍

| 場景 | 預期返 | F5.1 verify |
|---|---|---|
| login 密碼錯 | 8888 series `INVALID_CREDENTIALS` | acceptance test |
| login user 不存在 | 8888 series `USER_NOT_FOUND` | acceptance test |
| login user 軟刪 / 停用 | 8888 series `USER_DISABLED` 或 8888 `LOGOUT_SESSION_INVALIDATED`（F3 G9 layer 在 protected request 時觸發） | acceptance test |
| getUserInfo 無 token | 401 + F4 envelope | integration test |
| getUserInfo token 過期 | 401 + F4 envelope | integration test |
| getUserRoutes role 為空 | 返 `{routes:[], home:"/home"}` | integration test |
| Casbin enforce 拒絕 | 403 + F4 envelope | acceptance test |

## Testing 策略

### Unit tests (server-service)

- `TreeBuilder` 邊界（空 list / 單元素 / 多層父子 / 循環引用 防 stack overflow）
- `UserInfoOutput` / `UserRoute` shape 對齊（serde camelCase 序列化）
- `find_first_valid_route` 邏輯（empty / root-only / nested）

### Integration tests (server-initialize tests/)

- `login_handler` axum-test-helpers POST + ValidatedForm + 返 200 + AuthOutput
- Casbin layer 串接（mock policy + verify subject + object + action）
- jwt_auth_middleware 驗 token + 軟刪 user 走 8888 path（F3 G9 既有 test 確保不 regression）

### Acceptance tests (server-service tests/，3 個 `#[ignore]` fn、需 `TEST_DATABASE_URL`)

- `login_succeeds_returns_token_and_refresh`（POST /auth/login + 驗 token JWT decode pass + 驗 audit row 寫入）
- `get_user_info_returns_user_with_roles`（拿 token → GET /auth/getUserInfo → 驗 shape + F4 envelope）
- `get_user_routes_returns_tree_with_home`（拿 token → GET /route/getUserRoutes → 驗 routes 非空 + home="/home" + menu tree 結構）

### Quickstart e2e（完整 deploy stack）

7-step quickstart 跨完整 deploy stack（postgres + redis + rust-api release build + base-web `_builtin/login`）：覆蓋 `Independent Test` 段列 8 步 acceptance scenarios。

## Implementation Approach

**Approach A — audit + targeted gap fix**：

- **rust-api 服務層**：0 rewrite（`sys_auth_service.rs` / `sys_authentication_api.rs` 不動）
- **rust-api router**：sys_authentication_route.rs 改 endpoint path（move `/auth/getUserRoutes` → `/route/getUserRoutes`）；視需要併 sys_menu_route.rs 加 `getUserRoutes` 在 `/route` nest 內
- **rust-api initialize**：verify Casbin layer + policy load 完整、若有缺補 wire
- **rust-api tests**：新增 unit + integration + acceptance test（同 F3 模式）
- **base-web**：0 修改（Constitution §IV base 不改動邊界）
- **migration**：verify `datas/*` policy seed 完整；若缺、補（這仍在 F5.1 範圍、屬 fixture）
- **deploy stack**：F5.1 範圍依賴 `deploy/`（docker compose / nginx / .env.example）— rev1 階段尚未建、acceptance test + quickstart 部分 step 留 user verify「需 deploy/ 建後才能完整跨」

Constitution Check：
- Principle I (RBAC fail-safe)：F5.1 Casbin enforce 首次啟用、policy 缺則 403 預設拒絕 ✅
- Principle II (Soft Delete + 全域 Audit)：F3 G9 軟刪 user check + F2.1 login_succeeded audit ✅
- Principle III (嚴版禁 Forward + 單一職責)：rust-api 內部、無跨服務 forward ✅
- Principle IV (base 不改動邊界)：F5.1 不動 base-web 任何檔 ✅
- Principle V (漸進收縮)：F5.1 為 DESIGN-A scope minimal、F5.2 / F10 / F14 之後追加 pub-sub + refresh rotation；nestjs 退場時 F5.1 core flow 不變 ✅

## 下一步

1. 將 brainstorm doc commit 到 outer `rev1-admin-root`（同 F1.1 / F2.1 / F3 / F4 模式）
2. `/speckit-specify "F5.1 auth-login-and-dynamic-menu — DESIGN-A scope minimal 解鎖 P2"` 開 feature branch `005-auth-login-and-dynamic-menu` + 建 spec.md
3. （optional）`/speckit-clarify` 補 spec 細節
4. `/speckit-plan` → research.md / data-model.md / contracts/ / quickstart.md
5. `/speckit-tasks` → tasks.md
6. `/speckit-implement`（同 F1.1 模式：executing-plans + subagent-driven-development + TDD）
