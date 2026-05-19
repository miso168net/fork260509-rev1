# Data Model: F11 — extracted-stubs

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-19

F11 不動 schema、不增 sys_role / sys_menu row、不動 entity model。**唯一 DB 改動**:`casbin_rule` 表 INSERT 8 row(2 role × 4 endpoint × `p` policy with `allow`)。code 改動主體:rust handler 3 個新加 + 1 個新建、Router 1 個新建、DTO 3 個、migration 1 個。

---

## E1: `SysAuthenticationApi` 既有 struct + 3 個新 stub handler(R-Q1 evidence)

**File**: `rust-api/server/api/src/admin/sys_authentication_api.rs:21-112`(F11 改、+~50 LOC)

**改動前**(F10/F10.1/F10.2 baseline):
- `pub struct SysAuthenticationApi;` + `impl SysAuthenticationApi { ... }`
- 5 個既有 handler:`login_handler`(line 21)/ `get_user_info`(line 58)/ `get_user_routes`(line 71)/ `assign_permission`(line 85)/ `assign_routes`(line 102)
- file 112 行

**改動後**(F11 拍板):
- `impl SysAuthenticationApi { ... }` 內加 3 個 stub handler(在既有 5 個 handler 後)
- file 變 ~160-170 行(per R-2 緩解、仍合理)

**新 handler code shape**:

```rust
// (在 impl SysAuthenticationApi 末尾、既有 5 個 handler 之後)

pub async fn send_captcha(
    Json(input): Json<SendCaptchaInput>,
) -> Result<Res<serde_json::Value>, AppError> {
    tracing::info!(phone = %input.phone, "F11 stub: sendCaptcha called");
    Ok(Res::new_data(json!({ "code": "000000" })))
}

pub async fn verify_captcha(
    Json(input): Json<VerifyCaptchaInput>,
) -> Result<Res<serde_json::Value>, AppError> {
    let verified = input.code == "000000";
    Ok(Res::new_data(json!({ "verified": verified })))
}

pub async fn auth_error(
    Query(q): Query<AuthErrorQuery>,
) -> Result<Res<serde_json::Value>, AppError> {
    Ok(Res::new_data(json!({
        "code": q.code.unwrap_or_default(),
        "msg":  q.msg.unwrap_or_default(),
    })))
}
```

**Import 改動**(file 頭):
- 加 `axum::extract::Query`(verify_captcha + auth_error)
- 加 `axum::Json`(send_captcha + verify_captcha,若既有未 import)
- 加 `serde_json::{json, Value}`(stub 回 envelope `data`)
- 加 `server_service::admin::{SendCaptchaInput, VerifyCaptchaInput, AuthErrorQuery}` 或從 DTO file 直 import

---

## E2: `SysMockApi` 新建 struct + 1 個 handler(R-Q1 evidence)

**File**: `rust-api/server/api/src/admin/sys_mock_api.rs`(**新建**、~30 LOC)

**新建 code shape**:

```rust
use axum::Json;
use serde_json::json;
use server_core::web::{error::AppError, res::Res};

pub struct SysMockApi;

impl SysMockApi {
    pub async fn get_last_time() -> Result<Res<serde_json::Value>, AppError> {
        Ok(Res::new_data(json!({
            "time": chrono::Utc::now().to_rfc3339(),
        })))
    }
}
```

**Module register**(`rust-api/server/api/src/admin/mod.rs` 加 1 行):
```rust
pub mod sys_mock_api;
```

**Re-export**(若 `admin/mod.rs` 有 `pub use ... ::SysAuthenticationApi;` 風格 re-export):
```rust
pub use sys_mock_api::SysMockApi;
```

---

## E3: `MockRouter` 新建(R-Q2 evidence)

**File**: `rust-api/server/router/src/admin/sys_mock_route.rs`(**新建**、~25 LOC、對齊 `sys_sandbox_route.rs` 模式)

**新建 code shape**:

```rust
use axum::{routing::get, Router};
use server_api::admin::SysMockApi;

pub struct MockRouter;

impl MockRouter {
    const BASE_PATH: &str = "/mock";

    pub async fn init_mock_router() -> Router {
        let router = Router::new()
            .route("/getLastTime", get(SysMockApi::get_last_time));

        Router::new().nest(Self::BASE_PATH, router)
    }
}
```

**Module register**(2 處,per analyze G2 grounding 2026-05-19):

1. `rust-api/server/router/src/admin/mod.rs` 加 1 行:
   ```rust
   pub mod sys_mock_route;
   ```

2. `rust-api/server/initialize/src/router_initialization.rs` 加 2 處:
   - **Import**(file 頭 line ~16-20、`use server_router::admin::{ ... SysSandboxRouter, ... };` block 加 `MockRouter`):
     ```rust
     use server_router::admin::{
         ..., SysSandboxRouter, MockRouter, ...
     };
     ```
   - **Register**(在既有 `SysSandboxRouter` register block 後、`// W-F1 T020: public /health route` 之前、line ~320 附近):
     ```rust
     // F11: mock stub (JWT auth + Casbin enforce、無 service / 無 API key validator)
     merge_router!(
         MockRouter::init_mock_router().await,
         None,
         false,
         false,
         None
     );
     ```
   - **`merge_router!` macro 5-args 對齊**:`(router, service, ?, ?, validator)`、SysSandboxRouter 用 `(router, None, false, false, Some(validation))` / SysAuthenticationRouter::init_protected_router 用 `(router, SysAuthService, false, true, None)`;F11 stub 既無 service 又無 API key validator,用 `(router, None, false, false, None)`。實際 5-args 語意 implement 階段對齊既有 macro 定義確認。

---

## E4: `SysAuthenticationRouter` 既有 + 3 個 stub mount

**File**: `rust-api/server/router/src/admin/sys_authentication_route.rs`(改、+~15 LOC)

**改動前**(F10/F10.1/F10.2 baseline):
- 3 個 `init_*_router()`:`init_authentication_router`(login、無 Casbin)/ `init_protected_router`(get_user_info、Casbin enforce)/ `init_authorization_router`(assign_permission、assign_routes、Casbin enforce + RouteInfo)

**改動後**(F11):
- `init_protected_router` 加 3 個 stub mount(`sendCaptcha` POST / `verifyCaptcha` POST / `auth/error` GET)、含 RouteInfo register(對齊既有 `init_authorization_router` pattern)

**範例**:

```rust
pub async fn init_protected_router() -> Router {
    let base_path = "/auth";
    let service_name = "SysAuthenticationApi";

    let routes = vec![
        RouteInfo::new(&format!("{}/getUserInfo", base_path), Method::GET, service_name, "获取用户信息"),
        // F11 加 3 row:
        RouteInfo::new(&format!("{}/sendCaptcha", base_path), Method::POST, service_name, "发送验证码 (F11 stub)"),
        RouteInfo::new(&format!("{}/verifyCaptcha", base_path), Method::POST, service_name, "验证验证码 (F11 stub)"),
        RouteInfo::new(&format!("{}/error", base_path), Method::GET, service_name, "Demo 错误反 echo (F11 stub)"),
    ];
    for route in &routes { add_route(route).await; }

    let router = Router::new()
        .route("/getUserInfo", get(SysAuthenticationApi::get_user_info))
        // F11 加 3 條 route:
        .route("/sendCaptcha", post(SysAuthenticationApi::send_captcha))
        .route("/verifyCaptcha", post(SysAuthenticationApi::verify_captcha))
        .route("/error", get(SysAuthenticationApi::auth_error));

    Router::new().nest("/auth", router)
}
```

> 注意:實際 init_protected_router 簽名要對齊既有 file 寫法(如有 `add_route` async helper 順序、`base_path` const 等)、F11 在 implement 階段 grep 既有 file 確認 exact match。

---

## E5: 3 個 DTO(input struct)

**File**: `rust-api/server/model/src/admin/input/sys_authentication.rs` 既有檔加 3 個 struct(F11 改、+~20 LOC、對齊既有 `LoginInput` 同檔慣例)

> Note(per analyze G1 grounding 2026-05-19):既有 `LoginInput` 在此 file(12 行、含 `serde::Deserialize` + `validator::Validate` derive);F11 3 個新 DTO 加同檔對齊慣例、不新建 `sys_stub_dto.rs`。

**新建 DTO**:

```rust
#[derive(Debug, Deserialize)]
pub struct SendCaptchaInput {
    pub phone: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyCaptchaInput {
    pub phone: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct AuthErrorQuery {
    pub code: Option<String>,
    pub msg: Option<String>,
}
```

**Imports** 加(若既有未 import):
```rust
use serde::Deserialize;
```

**注意**:F11 不加 `validator::Validate` derive、不加 custom validation(per FR-015 + brainstorm Q3)。

---

## E6: Casbin migration `m20260519_a_f11_extracted_stubs_seed.rs`(R-Q3 evidence)

**File**: `rust-api/migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs`(**新建**、~50 LOC、沿用 F5.1/F6 既有 v4='' pattern)

**Implement-time finding(2026-05-19、see research.md R-Q5)**: 原稿假設 v4='allow' 顯式為 F11 設計、但 Casbin model `p = sub, dom, obj, act` 4 field、v4='allow' 顯式會與 implicit eft handling 衝突致 enforce_mut 回 Err → HTTP 502 BAD_GATEWAY。改沿用 F5.1 / F6 baseline v4=''(empty)。

**完整 code shape**:

```rust
//! F11 extracted-stubs Casbin policy seed — 補 4 條抽離項 stub endpoint 的
//! ROLE_SUPER + ROLE_ADMIN allow rules(共 8 rows)、GeneralUser default deny。
//! per F11 spec FR-005 + FR-006 + brainstorm Q1.
//! Mirror F6 既有 m20260518_a_f6_is_route_exist_seed.rs pattern,
//! 修正 v4 effect column 為 'allow'(F6 implicit '' 與 DESIGN-A §1.1 顯式 allow 紀律對齊)。

use sea_orm_migration::{prelude::*, sea_orm::Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        let insert_stmt = Statement::from_string(
            manager.get_database_backend(),
            r#"
            INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5)
            VALUES
            ('p', 'ROLE_SUPER', 'built-in', '/auth/sendCaptcha',   'POST', '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/auth/verifyCaptcha', 'POST', '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/auth/error',         'GET',  '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/mock/getLastTime',   'GET',  '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/auth/sendCaptcha',   'POST', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/auth/verifyCaptcha', 'POST', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/auth/error',         'GET',  '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/mock/getLastTime',   'GET',  '', '')
            "#
            .to_string(),
        );

        db.execute(insert_stmt).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        let delete_stmt = Statement::from_string(
            manager.get_database_backend(),
            r#"
            DELETE FROM casbin_rule
            WHERE ptype = 'p'
              AND v1 = 'built-in'
              AND v2 IN ('/auth/sendCaptcha', '/auth/verifyCaptcha', '/auth/error', '/mock/getLastTime')
              AND v0 IN ('ROLE_SUPER', 'ROLE_ADMIN')
            "#
            .to_string(),
        );

        db.execute(delete_stmt).await?;
        Ok(())
    }
}
```

**Module register**(`rust-api/migration/src/datas/mod.rs`):
```rust
pub mod m20260519_a_f11_extracted_stubs_seed;
```

並在 `lib.rs` 或對應 register function 加 `Box::new(m20260519_a_f11_extracted_stubs_seed::Migration)`(對齊 `m20260518_a_f6` 既有 register location)。

---

## E7: `casbin_rule` 表 row shape(F6 已驗 schema、F11 不改)

**Schema**(`casbin_rule` 表,既有 F1.1/F2.1 baseline、F6 沿用、F11 沿用):

```sql
CREATE TABLE casbin_rule (
    ptype  TEXT,    -- 'p' = policy / 'g' = role-user grouping
    v0     TEXT,    -- role (for p) / user (for g)
    v1     TEXT,    -- domain
    v2     TEXT,    -- object (endpoint path)
    v3     TEXT,    -- action (HTTP method)
    v4     TEXT,    -- effect ('allow' / 'deny' / '')
    v5     TEXT     -- reserved (empty for F11)
);
```

**F11 寫入 row example**:

| ptype | v0          | v1         | v2                   | v3   | v4    | v5 |
|---|---|---|---|---|---|---|
| p     | ROLE_SUPER  | built-in   | /auth/sendCaptcha    | POST | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /auth/verifyCaptcha  | POST | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /auth/error          | GET  | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /mock/getLastTime    | GET  | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /auth/sendCaptcha    | POST | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /auth/verifyCaptcha  | POST | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /auth/error          | GET  | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /mock/getLastTime    | GET  | (空) | (空) |

**範疇外**:
- 不加 CHECK constraint、不加 enum type(留 future hardening)
- 不改 schema(F11 只寫 row)
- 不加 `g` rule(F5.1 seed 既有 user-role assignment 沿用)

---

## E8: 既有 `Res<T>` envelope shape(R-Q4 evidence、F11 不改)

**File**: `rust-api/server/core/src/web/res.rs:13-18`(既有、F11 不動)

```rust
#[derive(Debug, Serialize, Default)]
pub struct Res<T> {
    pub code: u16,           // 0 = CODE_SUCCESS
    pub data: Option<T>,
    pub msg: String,         // "success" for success path
    pub success: bool,       // true for success path
}
```

**actual JSON shape**(stub 200 path):

```json
{
  "code": 0,
  "data": { ...stub-specific... },
  "msg": "success",
  "success": true
}
```

**Historic note**:spec.md US1.2 原稿寫 `{code:0, data, message:"success"}`、analyze A1 finding 已 fix 對齊 actual rust shape(現 spec.md 用 `{code:0, data, msg:"success", success:true}`)。F11 contracts/verification-commands.md C-V3/C-V5 用 actual `msg` + `success` 對齊。

---

## E9: F11 stub `data` field 具體 shape

**`/auth/sendCaptcha` response data**:

```json
{ "code": "000000" }
```

> 注意:envelope 也有 `code`(=0)+ data.code(=`"000000"`)、兩者語意不同(envelope=business code、data.code=captcha code string)、base-web 預期讀 `data.code`。

**`/auth/verifyCaptcha` response data**:

```json
{ "verified": true }   // 若 code == "000000"
{ "verified": false }  // 若 code != "000000"
```

**`/auth/error` response data**:

```json
{ "code": "DEMO001", "msg": "test error" }   // ?code=DEMO001&msg=test+error
{ "code": "", "msg": "" }                    // ?(無 query)
```

**`/mock/getLastTime` response data**:

```json
{ "time": "2026-05-19T20:57:44.123456789+00:00" }   // ISO 8601 RFC3339 UTC、含 nanosecond 精度
```

**注意**:`chrono::Utc::now().to_rfc3339()` 輸出含 nanosecond,format 為 `YYYY-MM-DDTHH:MM:SS.nnnnnnnnn+00:00`。F11 acceptance C-V5 用 regex 對齊 ISO 8601 pattern 而不對齊精度位數。

---

## Data Model 完成標誌

- ✅ E1 `SysAuthenticationApi` 結構 + 3 個 stub handler code shape
- ✅ E2 `SysMockApi` 新建 file shape + module register
- ✅ E3 `MockRouter` 新建 file 對齊 sys_sandbox_route 模式
- ✅ E4 `SysAuthenticationRouter` init_protected_router 加 3 個 mount + RouteInfo
- ✅ E5 3 個 DTO struct + serde Deserialize 預設行為
- ✅ E6 Casbin migration 8 row INSERT + down() DELETE pattern
- ✅ E7 `casbin_rule` 表 schema 不改 + 8 row shape table
- ✅ E8 `Res<T>` envelope actual shape(用 `msg` 非 `message`、含 `success` field)
- ✅ E9 F11 stub `data` 具體 shape 4 endpoint 各列
- ✅ Ready for contracts/verification-commands.md + quickstart.md
