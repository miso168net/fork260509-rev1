# Research: F5.1 — auth-login-and-dynamic-menu

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-15
**Source**: [`spec.md`](./spec.md) + [`plan.md`](./plan.md) + 2026-05-15 rust-api server-router / axum-casbin / server-core / server-service / migration codebase audit

## Audit Summary（執行於 2026-05-15）

| Audit Item | 結果 |
|---|---|
| 既有 rust-api 4 個 endpoint handler 完整度 | `sys_authentication_api.rs:21` login_handler / `:58` get_user_info / `:71` get_user_routes / sys_menu_api `get_constant_routes` 全已實作；F5.1 不 rewrite |
| 既有 `pwd_login` flow | sys_auth_service.rs:106 完整：verify_user → generate_auth_output（JWT 簽）→ send_login_event（F2.1 audit）→ 返 AuthOutput；F5.1 沿用 |
| 既有 `get_user_routes` query 邏輯 | sys_auth_service.rs:134 完整：sys_role_menu JOIN sys_role.code IN role_codes + Domain → menu_ids → sys_menu find_active + Status=Enabled + order_by_asc(sequence) → MenuRoute mapping → TreeBuilder build；F5.1 沿用 |
| **既有 endpoint path align gap** | sys_authentication_route.rs:20 mount `/auth/getUserRoutes`（protected）+ :49 mount `/authorization/getUserRoutes`；base-web 兩套 service client 期 `/route/getUserRoutes`（grep 4 hits）；rust-api 內 grep `/auth/getUserRoutes` callers = 0；無 break risk |
| **既有 Casbin reject behavior** | axum-casbin/middleware.rs:153-197 reject 直接返 plain text 403/502/401、未 hook F4 envelope；F5.1 必須補 thin adapter |
| 既有 F4 envelope codes | server/core/src/web/code.rs 完整 24 個 codes；含 `CODE_PERMISSION_CASBIN_DENY=5001` / `CODE_LOGOUT_SESSION_INVALIDATED=8888` / `CODE_EXPIRED_ACCESS_TOKEN=9999` / `CODE_EXPIRED_TOKEN_SIGNATURE=3333` / `CODE_BUSINESS_ENTITY_NOT_FOUND=6001`；F5.1 sufficient、無需新增 |
| AppError → F4 envelope mapping | server/core/src/web/error.rs IntoResponse 透過 `Res::<()>::new_error(code, msg)` 自動包 F4 envelope；DbErr / JwtError / RedisError / MongoError 完整 mapping；F5.1 login error 自動對齊 |
| Casbin layer wire 既狀 | server/initialize/src/router_initialization.rs:72-76 已 wire CasbinAxumLayer 給 protected admin router（per `need_casbin=true` flag）；F5.1 sufficient、無需新 wire |
| 既有 `axum_casbin::CasbinVals` 注入點 | jwt_auth_middleware 內注入 CasbinVals { subject: roles, domain }；F5.1 沿用既有 path |
| migration `datas/*` 既有 seed | 5 個 files 共 197 行：sys_user / sys_role / sys_user_role / sys_role_menu / sys_menu / sys_casbin_rule；具體 seed 完整度需 tasks 階段細查 |
| 既有 test 結構 | server-config/tests/ (F1.1 unit) + server-initialize/tests/ (F1.1 integration + F3 acceptance) + server-model/tests/ (F4 unit) — F5.1 加 server-service/tests/ + server-initialize/tests/ 新 test crate |
| `dev-dependencies` 既有 | server-initialize/Cargo.toml 已含 axum-test-helpers / tower / futures / http-body-util / jsonwebtoken；F5.1 sufficient、無新 dev-dep |
| rev1 default user / role / menu 數量 | 3 users (Soybean / Administrator / GeneralUser) + role × menu seed 待 tasks 階段 audit；migration 行數提示應該完整但 acceptance test 才能 verify |

---

## Resolved Decisions（R1 ~ R6）

### R1 — endpoint path 移動具體位置

- **Decision**：
  - sys_authentication_route.rs::`init_protected_router`：**刪除** line 20 `.route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes))`
  - sys_menu_route.rs::`init_protected_menu_router`：**加** `.route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes))` 在既有 router builder 內（與 `/tree` / `/` / `/:id` / `/auth-route/:roleId` 並列、`/route` nest prefix 一致）
  - 同步加 `RouteInfo::new(&format!("{}/getUserRoutes", base_path), Method::GET, "SysAuthenticationApi", "获取用户路由")` 進 routes vec（為 audit log path 對齊）
  - `/authorization/getUserRoutes`（sys_authentication_route.rs:49）**保留不動**（屬 F8 範圍）
- **Rationale**：保 handler `get_user_routes` 不 rewrite、只動 router；prefix `/route` 與 `/route/getConstantRoutes` 一致；base-web 兩套 service client 期 path 直接對齊
- **Alternatives considered**：
  - 雙 path 並存（alias）：違 spec Q2 拍板「移動 + 刪除舊 path」
  - rust-api 不動、靠 nginx alias：違 Constitution §IV（依賴 deploy stack）+ rev1 階段 nginx 尚未建

### R2 — Casbin envelope adapter middleware 設計

- **Decision**：
  - 新建 `rust-api/server/middleware/src/casbin_envelope_adapter.rs`（thin adapter）：實作 `from_fn(...)` axum middleware after-layer pattern：(a) `let resp = next.run(req).await;` (b) 檢查 resp.status() 是否 403/401/502 + body 含 Casbin plain text fragment（"do not have the necessary permissions" / "No authentication token" / "No token provided" / "encountered an unexpected error"）(c) 若命中、用 `AppError { code: CODE_PERMISSION_CASBIN_DENY, message: <reject reason short> }` 重新建 response (`Res::<()>::new_error(...)`)；否則返原 response
  - wire 位置：server/initialize/src/router_initialization.rs `apply_layers` 內、`need_casbin` block 之後（line 76 之後）加 `.layer(axum::middleware::from_fn(casbin_envelope_adapter))`
- **Rationale**：thin adapter 在 CasbinAxumMiddleware 之後攔截 plain text response、不改 axum-casbin upstream crate（保 fork upgrade 順暢）；status code 對齊 既有 plain text mapping（403 = forbidden、401 = unauthorized）；envelope code 用既有 `CODE_PERMISSION_CASBIN_DENY=5001` 不引入新 code
- **Alternatives considered**：
  - fork axum-casbin crate 直接改 source 內 reject response → 過度耦合、不符合「F5.1 範圍 minimal」
  - 用 axum `ResponseExt::map_response` 攔截：API 不夠 stable、F5.1 走 `from_fn` middleware 更 idiomatic
  - 不補 adapter、acceptance test 接受 plain text 403：違 spec Q2 拍板 + F4 envelope 紀律

### R3 — login error code mapping

- **Decision**：F5.1 沿用既有 AppError mapping、不引入新 envelope code：
  - 密碼錯 → 由 `sys_auth_service::verify_user` 走 既有 `UserError` 變體 → 透過 `From<UserError> for AppError` 對應 `CODE_BUSINESS_ENTITY_NOT_FOUND=6001` 或專屬 code（tasks 階段 audit UserError 確認）
  - User 不存在 → 同上（or DbErr::RecordNotFound → 6001）
  - User 軟刪（login 階段、user 找不到 active）→ 同 user 不存在 path 6001（F3 G9 8888 是針對 token 已簽出後 user 軟刪、發生在 protected layer、login 階段不適用）
  - Token 過期 → `JwtError::TokenValidationError → CODE_EXPIRED_TOKEN_SIGNATURE=3333` 既有 mapping
  - Token 簽錯 / 無 token → 同上 3333 或 401（jwt_auth_middleware 既有處理）
- **Rationale**：既有 mapping 完整、F5.1 不需引入新 envelope code；只 verify behavior + acceptance test 強驗對應 code
- **Alternatives considered**：
  - 引入專屬 `CODE_INVALID_CREDENTIALS` envelope code：違 spec FR-027（不引入新 envelope code）+ 既有 6001 已涵蓋
  - 區分「密碼錯」vs「user 不存在」用不同 code（avoid user enumeration）：rev1 admin-heavy 場景 user 可枚舉、UX > security marginal gain、保 既有 統一 6001 OK

### R4 — payload audit redaction 範圍

- **Decision**：F5.1 acceptance test 驗 `sys_operation_log.payload_after` 不含 plaintext password：
  - `auth_event_handler.rs` 既有 `AuthEvent::LoginSucceeded` / `LoginFailed` struct **應該無 password field**（tasks 階段 audit 確認；若有 password field、F5.1 範圍內補 redaction）
  - audit row 寫入時走 F2.1 既有 `AuditEvent` API + `AuditSerialize` trait；若 `LoginInput` 直接 serialize 必走 redaction（既有 trait）
  - acceptance test 用 `grep -i password` 對 `payload_after` JSONB column 應 0 hit
- **Rationale**：F2.1 已建 trait-based redaction 機制（per F2.1 spec FR-016+）；F5.1 是 verify + sanity check 既有 mechanism 已工作、不引入新 trait
- **Alternatives considered**：
  - F5.1 內加新 redaction trait impl：可能 redundant、F2.1 既有 trait 應 sufficient
  - 跳過 payload 內容 verify、只驗 row exist：弱 assertion、不夠 catch regression

### R5 — minimum policy seed scope

- **Decision**：F5.1 範圍內 audit migration `datas/*` 完整度後決定補 seed scope：
  - **Acceptance test 跑前 verify**：3 user (Soybean / Administrator / GeneralUser) × 對應 role × 至少 1 個 menu × Casbin policy（subject=role / object=path / action=method / domain）
  - **若 seed 完整**（既有 fork260509 deploy 應該完整）→ F5.1 不補；只 reference 既有 `datas/*` 即可
  - **若 seed 缺漏**（rev1 base-web 從 example 分支衍生、可能 menu 結構不同）→ F5.1 範圍內補 minimum seed 為 new migration `datas/m20260515_<auto-id>_f51_minimum_seed.rs`：
    - sys_role × menu mapping 補 3 user × role × menu × policy mapping
    - sys_casbin_rule 補對應 p / g / g2 rules（`/auth/login` 為 public、`/auth/getUserInfo` + `/route/getUserRoutes` 各 role 都需 allow）
- **Rationale**：pragmatic + scope-bounded、不超 spec Q3 拍板「minimum seed」；複雜 menu CRUD / role hierarchy 留 F7
- **Alternatives considered**：
  - 不補 seed、acceptance test 跑時 fix：違 spec scope（F5.1 是 acceptance test 跑通的 atomic increment、需 fixture 完整）
  - 補完整 fully seed：違 Q3 拍板（屬 F7 範圍）

### R6 — Acceptance test 環境依賴

- **Decision**：F5.1 acceptance test 3 個 `#[ignore]` fn 同 F3 模式：
  - 跑前 export `TEST_DATABASE_URL=postgresql://...`
  - 跑前 `sea-orm-cli migrate up` 確保 schema + datas 套用完成
  - test fn 內各自 setup（建 test client）+ teardown（清理 test data）
  - 用 cargo workspace test crate（在 `server-service/tests/auth_login_e2e.rs`）
  - 跑 deploy stack 不需要（test 走 in-process Axum + real DB、不需 nginx）
- **Rationale**：同 F3 G11 模式、CI regression guard 一致；不依賴 deploy/ 建立完成
- **Alternatives considered**：
  - 跑 deploy stack e2e（curl）：依賴 deploy/ 建立 + rust-api server 跑、tasks 階段太重；留 quickstart 手動 verify

---

## Outstanding Items（plan 階段未拍板、留 `/speckit-tasks` 階段處理）

| Item | 為何 defer | Owner phase |
|---|---|---|
| 既有 migration `datas/*` 實際 seed 完整度（3 user × role × menu × Casbin policy 是否都齊）| tasks 階段 cargo run migration + DB grep verify、若缺再補 | `/speckit-tasks` |
| `UserError` 變體 + AppError mapping 對「密碼錯」精確 envelope code | tasks 階段 audit sys_user_error.rs + sys_auth_service::verify_user error path 確定具體 code | `/speckit-tasks` |
| `AuthEvent::LoginSucceeded` / `LoginFailed` struct 是否含 password field | tasks 階段 audit auth_event_handler.rs 確認 + 若需 redaction 補實作 | `/speckit-tasks` |
| Casbin envelope adapter 對 401 / 502 是否一併處理（plain text → envelope）or 只處理 403 | tasks 階段量化 — 推薦只處理 403（Casbin enforce reject）、401/502 由 jwt_auth_middleware 或其他 path 處理 | `/speckit-tasks` |
| `axum::middleware::from_fn` adapter 內 plain text body fragment match 策略（strict string match vs status-only 判斷）| tasks 階段量化 — 建議用 status-only（403）+ 加 layer wrap 確保只攔 Casbin layer 之後的 response | `/speckit-tasks` |
| Login 失敗時是否寫 `sys_operation_log` row（既有實作可能只在 success 時 send_login_event）| tasks 階段 audit auth_event_handler 確定 LoginFailed event 是否 emit | `/speckit-tasks` |
| 3 個預設 user 各自 menu tree 預期内容（acceptance test assertion strategy）| tasks 階段 audit datas/ 後決定（generic：set inequality；or specific：hardcode count）| `/speckit-tasks` |

---

**Phase 0 結論**：✅ 既有 codebase 結構 + 4 個 endpoint 完整度 + axum-casbin reject behavior + F4 envelope codes + AppError mapping 全 audit 完成；Casbin envelope adapter 為唯一新建 module；migration policy seed 完整度由 tasks 階段 verify 後決定補修；可進入 Phase 1（data-model / contracts / quickstart）。
