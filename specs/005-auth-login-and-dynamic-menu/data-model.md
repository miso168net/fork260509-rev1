# Data Model: F5.1 — auth-login-and-dynamic-menu

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-15
**Source**: [`spec.md`](./spec.md) §Key Entities + [`research.md`](./research.md) R1-R6

> F5.1 涉及 router endpoint 移動 + 新增 thin adapter middleware + verify 既有 4 個 endpoint output shape + minimum policy seed audit；**不**改 schema、**不**改 Claims / JwtUtils / AppError / 既有 service handler。

---

## E1. Router endpoint 移動（既有檔修）

### E1.1 `sys_authentication_route.rs` — 刪除 `/auth/getUserRoutes` mount

`rust-api/server/router/src/admin/sys_authentication_route.rs`（既有）：

**Before**（line 17-23）:

```rust
pub async fn init_protected_router() -> Router {
    let router = Router::new()
        .route("/getUserInfo", get(SysAuthenticationApi::get_user_info))
        .route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes));

    Router::new().nest("/auth", router)
}
```

**After**（F5.1）:

```rust
pub async fn init_protected_router() -> Router {
    let router = Router::new()
        .route("/getUserInfo", get(SysAuthenticationApi::get_user_info));

    Router::new().nest("/auth", router)
}
```

注：`init_authentication_router` (line 12-15、`/auth/login` public) + `init_authorization_router` (line 25-57、`/authorization/*`) **不動**。

### E1.2 `sys_menu_route.rs` — 加 `/route/getUserRoutes` mount

`rust-api/server/router/src/admin/sys_menu_route.rs`（既有）：

**Before**（line 21-69）:

```rust
pub async fn init_protected_menu_router() -> Router {
    let base_path = "/route";
    let service_name = "SysMenuApi";

    let routes = vec![
        RouteInfo::new(&format!("{}/tree", base_path), Method::GET, service_name, "获取菜单树"),
        RouteInfo::new(base_path, Method::GET, service_name, "获取菜单列表"),
        // ... 既有 routes
    ];

    for route in routes {
        add_route(route).await;
    }

    let router = Router::new()
        .route("/tree", get(SysMenuApi::tree_menu))
        .route("/", get(SysMenuApi::get_menu_list))
        // ... 既有 routes
        .route("/auth-route/{roleId}", get(SysMenuApi::get_auth_routes));

    Router::new().nest(base_path, router)
}
```

**After**（F5.1）— 加 `/route/getUserRoutes` route + 對應 RouteInfo（為 audit log path 對齊）：

```rust
use server_api::admin::{SysAuthenticationApi, SysMenuApi};  // 加 SysAuthenticationApi import

pub async fn init_protected_menu_router() -> Router {
    let base_path = "/route";
    let service_name = "SysMenuApi";

    let routes = vec![
        // ... 既有 routes
        RouteInfo::new(
            &format!("{}/getUserRoutes", base_path),
            Method::GET,
            "SysAuthenticationApi",  // 注：handler 屬 SysAuthenticationApi、path 屬 /route
            "获取用户路由",
        ),
    ];

    for route in routes {
        add_route(route).await;
    }

    let router = Router::new()
        .route("/tree", get(SysMenuApi::tree_menu))
        // ... 既有 routes
        .route("/auth-route/{roleId}", get(SysMenuApi::get_auth_routes))
        .route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes));  // F5.1 NEW

    Router::new().nest(base_path, router)
}
```

注：`init_menu_router` (`/route/getConstantRoutes` public) **不動**。

---

## E2. `casbin_envelope_adapter` 新模組（NEW）

### 檔案 path

`rust-api/server/middleware/src/casbin_envelope_adapter.rs`（NEW）

### 內容範式（per [`research.md`](./research.md) R2）

```rust
//! F5.1 Casbin envelope adapter — 將 axum-casbin reject 的 plain text 403 response
//! 轉成 F4 envelope `{code: CODE_PERMISSION_CASBIN_DENY, msg, data}`。
//!
//! axum-casbin/middleware.rs:153-197 reject 直接返 plain text body、未 hook F4 envelope；
//! F5.1 範圍內補此 thin adapter middleware、確保 base-web error handler 統一處理。
//!
//! per F5.1 spec FR-017 + Q2 拍板 + data-model.md §E2。

use axum::{
    body::{to_bytes, Body},
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use server_core::web::{code::CODE_PERMISSION_CASBIN_DENY, res::Res};

/// 攔 axum-casbin reject 的 plain text 403、轉 F4 envelope。
///
/// 處理範圍：
/// - HTTP 403 + body 含 "do not have the necessary permissions" 字樣 → F4 envelope CODE_PERMISSION_CASBIN_DENY
/// - HTTP 401 / 502 / 其他 status → 不動（jwt_auth_middleware 或 inner handler 處理）
pub async fn casbin_envelope_adapter(req: Request, next: Next) -> Response {
    let response = next.run(req).await;

    // 只攔 403 Forbidden 且 body 為 Casbin plain text
    if response.status() != StatusCode::FORBIDDEN {
        return response;
    }

    let (parts, body) = response.into_parts();
    let bytes = match to_bytes(body, 1024).await {
        Ok(b) => b,
        Err(_) => {
            // body 讀失敗、保 original response（不破壞）
            return Response::from_parts(parts, Body::empty());
        }
    };

    let body_str = std::str::from_utf8(&bytes).unwrap_or("");

    // 判斷是否為 Casbin reject 訊息（axum-casbin/middleware.rs:160-163 / 194-197 plain text）
    let is_casbin_reject = body_str.contains("do not have the necessary permissions")
        || body_str.contains("Please contact support if you believe this is an error");

    if !is_casbin_reject {
        // 非 Casbin reject（如其他 inner handler 返 403）、保 original
        return Response::from_parts(parts, Body::from(bytes));
    }

    // Casbin reject → 轉 F4 envelope
    Res::<()>::new_error(
        CODE_PERMISSION_CASBIN_DENY,
        "您没有访问该资源的权限，请联系管理员",
    )
    .into_response()
}
```

### 模組註冊

`rust-api/server/middleware/src/lib.rs` 加 `pub mod casbin_envelope_adapter;` 一行（依字母順序）。

---

## E3. `router_initialization.rs` integration（既有檔修）

### 既有 callsite

`rust-api/server/initialize/src/router_initialization.rs:72-76`（既有）：

```rust
if need_casbin {
    if let Some(casbin) = casbin {
        router = router.layer(Extension(casbin.clone())).layer(casbin);
    }
}
```

### F5.1 修改

在 Casbin layer 之後加 envelope adapter middleware（after-layer pattern）：

```rust
use server_middleware::casbin_envelope_adapter::casbin_envelope_adapter;
use axum::middleware::from_fn;

// ...

if need_casbin {
    if let Some(casbin) = casbin {
        router = router
            .layer(Extension(casbin.clone()))
            .layer(casbin)
            .layer(from_fn(casbin_envelope_adapter));  // F5.1 NEW
    }
}
```

注：`from_fn` middleware 在 axum 是 after-layer 模式（先跑 inner handler、後跑 adapter）— adapter 攔截 Casbin 已返的 response 進行 envelope 轉換。

---

## E4. 既有 4 個 endpoint output shape verify（F5.1 不改）

### `AuthOutput` struct（既有、不動）

`server_model::admin::output::sys_authentication::AuthOutput`：

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthOutput {
    pub token: String,
    pub refresh_token: String,  // F5.1 接受 placeholder、F10 補 rotation
}
```

序列化 → `{"token": "<JWT>", "refreshToken": "<string>"}` 對齊 base `Api.Auth.LoginToken` ✓

### `UserInfoOutput` struct（既有、不動）

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfoOutput {
    pub user_id: String,
    pub user_name: String,
    pub roles: Vec<String>,
    pub buttons: Vec<String>,  // F5.1 = vec![] 預設、F7+ 填入
}
```

序列化 → `{"userId": ..., "userName": ..., "roles": [...], "buttons": []}` 對齊 base `Api.Auth.UserInfo` ✓

### `UserRoute` struct（既有、不動）

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRoute {
    pub routes: Vec<MenuRoute>,
    pub home: String,
}
```

序列化 → `{"routes": [...], "home": "/home"}` 對齊 base `Api.Route.UserRoute` ✓

### `MenuRoute` + `RouteMeta` struct（既有、不動）

`server_model::admin::output::sys_menu`：MenuRoute 含 name / path / component / meta / children / id / pid；RouteMeta 含 title / i18n_key / keep_alive / constant / icon / order / href / hide_in_menu / active_menu / multi_tab — 應該都 `#[serde(rename_all = "camelCase")]`（tasks 階段 verify）。

---

## E5. Migration `datas/*` minimum policy seed audit + 補修（IF NEEDED）

### 既有 5 個 datas migration files

```text
rust-api/migration/src/datas/
├── m20241024_033005_insert_sys_user.rs           # 3 個預設 user
├── m20241023_102950_insert_sys_user_role.rs      # user × role 對應
├── m20241024_033933_insert_sys_user_role.rs      # 追加 user × role 對應
├── m20241024_034526_insert_sys_role.rs           # role 表 seed
├── m20241024_034744_insert_sys_menu.rs           # menu 表 seed
├── m20241024_034305_insert_sys_role_menu.rs      # role × menu 對應
└── m20241024_082926_insert_casbin_rule.rs        # Casbin p / g / g2 rules
```

### F5.1 verify scope

tasks 階段執行（per [`research.md`](./research.md) R5）：
1. `cargo run -p migration` 套用 schema + datas migrations
2. DB grep verify：
   - `sys_user` 含 3 個預設 user (Soybean / Administrator / GeneralUser)
   - `sys_user_role` 3 user 都有對應 role
   - `sys_role` 對應 role 存在（如 ROLE_SUPER_ADMIN / ROLE_ADMIN / ROLE_USER）
   - `sys_role_menu` 每個 role 至少對應 1 個 menu
   - `sys_menu` 對應 menu 存在
   - `sys_casbin_rule` 含 p (subject=role, object=path, action=method, domain) + g (user_id, role) policy
3. 各 user 跑 `/route/getUserRoutes` 應 各自返不同 menu tree

### F5.1 補修 scope（IF NEEDED）

若 verify 發現任一缺漏、F5.1 範圍內新建 `migration/src/datas/m20260515_<auto-id>_f51_minimum_seed.rs`（migration auto-numbered）補 minimum：
- 補 sys_role_menu mapping（若 3 user × role 對 至少 1 個 menu 缺）
- 補 sys_casbin_rule p / g rules（若 3 endpoint × 3 role allow 缺）
- **不**動 sys_menu 表結構 / sys_user 表結構（屬 F7 範圍）

migration 註冊：`migration/src/lib.rs` Migrator::migrations() vec 加新 migration 條目。

---

## E6. Boot-time flow（F5.1 後）

```
docker compose up rust-api（or cargo run --bin server）
  ↓
[server-config init_from_file_with_multi_instance_env]
  ↓ JwtConfig F1.1 strict validation 通過
  ↓
[server-initialize] init keys & validation / db / casbin
  ├─ initialize_keys_and_validation → JWT EncodingKey + DecodingKey + Validation
  ├─ initialize_admin_router → builds router with apply_layers
  │   ├─ public router: /auth/login + /route/getConstantRoutes (no casbin, no auth)
  │   └─ protected router: /auth/getUserInfo + /route/getUserRoutes
  │     ├─ Casbin layer (axum_casbin) — enforce per (subject, object, action, domain)
  │     ├─ Casbin envelope adapter (F5.1 NEW) — 攔 Casbin plain 403 → F4 envelope
  │     └─ jwt_auth_middleware — JWT 驗 + F3 G9 軟刪 user 8888 check + 注入 User extension
  ↓
[axum::serve] listening on 0.0.0.0:10001
  ↓
[base-web HTTP request flow]
  POST /auth/login  → login_handler → pwd_login → audit (F2.1 LoginSucceeded) → AuthOutput
  GET /auth/getUserInfo + Bearer  → jwt_auth_middleware → Casbin enforce → get_user_info → UserInfoOutput
  GET /route/getUserRoutes + Bearer  → 同上 → get_user_routes → UserRoute
  GET /route/getConstantRoutes  → 公開 → get_constant_routes → constant routes list
```

---

## E7. 影響檔案清單

### Code（rust-api worktree）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/router/src/admin/sys_authentication_route.rs` | MODIFY | -1 行（刪 `/auth/getUserRoutes` mount line 20）|
| `rust-api/server/router/src/admin/sys_menu_route.rs` | MODIFY | +3 行（加 RouteInfo + import + .route mount）|
| `rust-api/server/middleware/src/casbin_envelope_adapter.rs` | **NEW** | ~50 行（thin adapter middleware）|
| `rust-api/server/middleware/src/lib.rs` | MODIFY | +1 行（`pub mod casbin_envelope_adapter;`）|
| `rust-api/server/initialize/src/router_initialization.rs` | MODIFY | +2 行（use import + `.layer(from_fn(...))` wire）|

### Tests

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/service/tests/auth_login_shapes.rs` | **NEW** | ~80 行（unit test：AuthOutput / UserInfoOutput / UserRoute / MenuRoute camelCase serde + TreeBuilder boundary + find_first_valid_route）|
| `rust-api/server/initialize/tests/login_handler_integration.rs` | **NEW** | ~100 行（integration test：login_handler axum-test-helpers + Casbin layer mock + envelope adapter verify）|
| `rust-api/server/service/tests/auth_login_e2e.rs` | **NEW** | ~120 行（acceptance test 3 `#[ignore]` fn：login_succeeds_returns_token / get_user_info_returns_user_with_roles / get_user_routes_returns_tree_with_home + payload password redaction verify）|

### Migration

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/migration/src/datas/m20260515_<auto-id>_f51_minimum_seed.rs` | **NEW IF NEEDED** | ~30-60 行（若既有 seed 完整、0 改動；若缺漏、minimum scope 補）|
| `rust-api/migration/src/lib.rs` | MODIFY IF NEEDED | +1 行（註冊 new migration）|

### Specs（outer）

| 檔案 | 改動類型 |
|---|---|
| `specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md` | **NEW**（per spec FR-019 / FR-020）|
| `specs/005-auth-login-and-dynamic-menu/contracts/casbin-enforce.md` | **NEW**（per spec FR-017 + Q2 拍板）|

---

**Phase 1 data-model 結論**：✅ Function signatures / module structure / router 改動 / boot flow / 影響檔案清單全部就位。下一步進 contracts / quickstart。
