# Data Model: F9 — systemManage-alias-router

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F9 不動 schema、不增 sys_role / sys_menu / sys_user row、不動 entity model。**唯一 DB 改動**:`casbin_rule` 表 INSERT 20 row(2 role × 10 endpoint × `p` policy with v4='')。code 改動主體:rust handler **4 個新加**(per R-Q1 spec correction、減去 update_user_post)+ Service 2 個新加 + Router 1 個新建 + DTO 2 個新加 + Casbin migration 1 個新建。

---

## E1: `SysUserApi` 既有 8 個 handler + **F9 加 2 個**(per R-Q1 spec correction)

**File**: `rust-api/server/api/src/admin/sys_user_api.rs`(F9 改、+~40 LOC)

**改動前**(F11 後 baseline):
- 8 個既有 handler:`get_all_users` / `get_paginated_users` / `remove_policies` / `add_policies` / `create_user` / `get_user` / `update_user` / `delete_user`(line 20-100)
- `update_user` 用 `ValidatedForm<UpdateUserInput>` body extractor、handler 自身對 HTTP method 無 dependency
- `delete_user` 用 `Path<String>` URL extractor

**改動後**(F9):
- 既有 8 個 handler **不動**
- 加 2 個新 handler 在 `impl SysUserApi { ... }` 末尾(per R-Q1:update_user_post 不需新做、改直接 mount `update_user`)

**新 handler code shape**:

```rust
// (在 impl SysUserApi 末尾、既有 8 個 handler 之後)

pub async fn delete_user_by_body(
    Extension(service): Extension<Arc<SysUserService>>,
    Extension(user): Extension<User>,
    Json(input): Json<DeleteUserByBodyInput>,
) -> Result<Res<()>, AppError> {
    let actor = Actor::from(&user);
    service.delete_user(&input.id, &actor).await.map(Res::new_data)
}

pub async fn batch_delete_users(
    Extension(service): Extension<Arc<SysUserService>>,
    Extension(user): Extension<User>,
    Json(input): Json<BatchDeleteUserInput>,
) -> Result<Res<serde_json::Value>, AppError> {
    let actor = Actor::from(&user);
    let mut deleted_count: usize = 0;
    for id in &input.ids {
        match service.delete_user(id, &actor).await {
            Ok(_) => deleted_count += 1,
            Err(_) => continue,  // per-row Err 不快、continue loop(per spec R-2)
        }
    }
    Ok(Res::new_data(json!({ "deletedCount": deleted_count })))
}
```

**Import 改動**(file 頭):
- 加 `axum::Json`(若既有未 import)
- 加 `serde_json::{json, Value}`(`json!` macro)
- 加 `server_service::admin::{DeleteUserByBodyInput, BatchDeleteUserInput}`(從新 DTO file re-export)

**file LOC 估算**: 從 ~110 LOC(F11 後)變 ~150 LOC(+40 LOC)

---

## E2: `SysRoleApi` 既有 5 個 handler + **F9 加 1 個**

**File**: `rust-api/server/api/src/admin/sys_role_api.rs`(F9 改、+~25 LOC)

**改動前**:既有 5 個 handler:`get_paginated_roles` / `create_role` / `get_role` / `update_role` / `delete_role`

**改動後**:加 1 個新 handler `get_all_roles`

**新 handler code shape**:

```rust
pub async fn get_all_roles(
    Extension(service): Extension<Arc<SysRoleService>>,
) -> Result<Res<Vec<SysRoleModel>>, AppError> {
    service.find_all_enabled().await.map(Res::new_data)
}
```

**Import 改動**: 加 `server_service::admin::SysRoleService`(若既有未 import)

---

## E3: `SysMenuApi` 既有 9 個 handler + **F9 加 1 個**

**File**: `rust-api/server/api/src/admin/sys_menu_api.rs`(F9 改、+~20 LOC)

**改動前**:既有 9 個 handler:`tree_menu` / `get_menu_list` / `get_constant_routes` / `create_menu` / `get_menu` / `update_menu` / `delete_menu` / `get_auth_routes` / `is_route_exist`

**改動後**:加 1 個新 handler `get_all_pages`

**新 handler code shape**:

```rust
pub async fn get_all_pages(
    Extension(service): Extension<Arc<SysMenuService>>,
) -> Result<Res<Vec<String>>, AppError> {
    service.find_all_page_keys().await.map(Res::new_data)
}
```

**Import 改動**: 加 `server_service::admin::SysMenuService`(若既有未 import)

---

## E4: `SysRoleService::find_all_enabled` 新 method(per R-Q2)

**File**: `rust-api/server/service/src/admin/sys_role_service.rs`(F9 改、+~20 LOC)

**改動前**:既有 `TRoleService` trait 含 `find_paginated_roles` / `create_role` / `get_role` / `update_role` / `delete_role`

**改動後**:trait + impl 各加 1 個 method

**Trait 加 method**:
```rust
async fn find_all_enabled(&self) -> Result<Vec<SysRoleModel>, AppError>;
```

**Impl 加 method**:
```rust
async fn find_all_enabled(&self) -> Result<Vec<SysRoleModel>, AppError> {
    let db = get_primary_db()?;
    SysRoleModel::Entity::find()
        .filter(sys_role::Column::Status.eq(Status::Enabled as i16))
        .filter(sys_role::Column::DeletedAt.is_null())
        .all(db.as_ref())
        .await
        .map_err(|e| AppError::Database(e.to_string()))
}
```

**Imports**: `Status` enum + `sys_role::Column` + `sea_orm::ColumnTrait` + `sea_orm::QueryFilter`(grep 既有 service 確認 path)

---

## E5: `SysMenuService::find_all_page_keys` 新 method(per R-Q3)

**File**: `rust-api/server/service/src/admin/sys_menu_service.rs`(F9 改、+~15 LOC)

**改動前**:既有 `TMenuService` trait 含 `tree_menu` / `get_menu_list` / `get_constant_routes` / `create_menu` / `get_menu` / `update_menu` / `delete_menu` / `get_auth_routes` / `is_route_exist` / `get_menu_ids_by_role_id` 等

**改動後**:trait + impl 各加 1 個 method

**Trait 加 method**:
```rust
async fn find_all_page_keys(&self) -> Result<Vec<String>, AppError>;
```

**Impl 加 method**:
```rust
async fn find_all_page_keys(&self) -> Result<Vec<String>, AppError> {
    let db = get_primary_db()?;
    SysMenuModel::Entity::find()
        .select_only()
        .column(sys_menu::Column::Name)
        .distinct()
        .filter(sys_menu::Column::DeletedAt.is_null())
        .into_tuple::<(String,)>()
        .all(db.as_ref())
        .await
        .map(|rows| rows.into_iter().map(|(name,)| name).collect())
        .map_err(|e| AppError::Database(e.to_string()))
}
```

**注意**: menu id 既有為 `i32`(per R-Q3 grep)、但 F9 `find_all_page_keys` 只 SELECT name column、與 id 型別無關。

---

## E6: `SysSystemManageRouter` 新建(per spec FR-007 + brainstorm Q4)

**File**: `rust-api/server/router/src/admin/sys_system_manage_route.rs`(**新建**、~80 LOC)

**新建 code shape**(per R-Q1 update_user 直接 mount 修正後):

```rust
use axum::{
    http::Method,
    routing::{delete, get, post},
    Router,
};
use server_api::admin::{SysMenuApi, SysRoleApi, SysUserApi};
use server_global::global::{add_route, RouteInfo};

pub struct SysSystemManageRouter;

impl SysSystemManageRouter {
    const BASE_PATH: &'static str = "/systemManage";

    pub async fn init_router() -> Router {
        let base_path = Self::BASE_PATH;
        let user_service = "SysUserApi";
        let role_service = "SysRoleApi";
        let menu_service = "SysMenuApi";

        let routes = vec![
            RouteInfo::new(&format!("{}/getRoleList",       base_path), Method::GET,    role_service, "角色分页列表"),
            RouteInfo::new(&format!("{}/getAllRoles",       base_path), Method::GET,    role_service, "所有启用角色"),
            RouteInfo::new(&format!("{}/getUserList",       base_path), Method::GET,    user_service, "用户分页列表"),
            RouteInfo::new(&format!("{}/addUser",           base_path), Method::POST,   user_service, "新增用户"),
            RouteInfo::new(&format!("{}/updateUser",        base_path), Method::POST,   user_service, "更新用户(POST alias)"),
            RouteInfo::new(&format!("{}/deleteUser",        base_path), Method::DELETE, user_service, "删除用户(body id)"),
            RouteInfo::new(&format!("{}/batchDeleteUser",   base_path), Method::DELETE, user_service, "批量删除用户"),
            RouteInfo::new(&format!("{}/getMenuList/v2",    base_path), Method::GET,    menu_service, "菜单列表 v2"),
            RouteInfo::new(&format!("{}/getAllPages",       base_path), Method::GET,    menu_service, "所有页面 key"),
            RouteInfo::new(&format!("{}/getMenuTree",       base_path), Method::GET,    menu_service, "菜单树"),
        ];

        for route in routes {
            add_route(route).await;
        }

        let router = Router::new()
            .route("/getRoleList",     get(SysRoleApi::get_paginated_roles))           // 重用 mount
            .route("/getAllRoles",     get(SysRoleApi::get_all_roles))                 // 新 handler
            .route("/getUserList",     get(SysUserApi::get_paginated_users))           // 重用 mount
            .route("/addUser",         post(SysUserApi::create_user))                  // 重用 mount
            .route("/updateUser",      post(SysUserApi::update_user))                  // 重用 mount(per R-Q1、PUT handler 同 fn POST mount)
            .route("/deleteUser",      delete(SysUserApi::delete_user_by_body))        // 變形 wrapper(per R-Q4、body 抽 id)
            .route("/batchDeleteUser", delete(SysUserApi::batch_delete_users))         // 新 stub
            .route("/getMenuList/v2",  get(SysMenuApi::get_menu_list))                 // 重用 mount(per R-Q5 字面 path)
            .route("/getAllPages",     get(SysMenuApi::get_all_pages))                 // 新 handler
            .route("/getMenuTree",     get(SysMenuApi::tree_menu));                    // 重用 mount

        Router::new().nest(Self::BASE_PATH, router)
    }
}
```

**Module register**(2 處):

1. `rust-api/server/router/src/admin/mod.rs` 加 1 行:
   ```rust
   pub mod sys_system_manage_route;
   pub use sys_system_manage_route::SysSystemManageRouter;
   ```

2. `rust-api/server/initialize/src/router_initialization.rs` 加 2 處(file 頭 import + body register):
   - **Import**:
     ```rust
     use server_router::admin::{
         ..., SysSystemManageRouter, ...
     };
     ```
   - **Register**(在既有 `SysSandboxRouter` 或 `SysMockRouter` register 後、`// W-F1 T020: public /health route` 之前):
     ```rust
     // F9 systemManage-alias-router: 10 條 alias router(JWT auth + Casbin enforce、無 service 額外注入)
     merge_router!(
         SysSystemManageRouter::init_router().await,
         None,
         true,
         true,
         None
     );
     ```

**merge_router! 5-args 對齊**(per F11 已驗):`(router, service_or_None, need_casbin, need_auth, validator)` — F9 用 `(router, None, true, true, None)` 為 Casbin enforce + JWT auth 開啟、無 service 注入(因 service 從 Extension 取、由 apply_layers 既有 wire 提供)、無 API key validator。

---

## E7: F9 新 DTO 2 個(per R-Q4 + spec FR-003 + FR-004)

**File**: `rust-api/server/model/src/admin/input/sys_user.rs`(F9 改、+~15 LOC、對齊既有 `UpdateUserInput` / `CreateUserInput` 同檔慣例)

**新 DTO**:
```rust
#[derive(Debug, Deserialize)]
pub struct DeleteUserByBodyInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct BatchDeleteUserInput {
    pub ids: Vec<String>,
}
```

**Imports** 加(若既有未 import):
```rust
use serde::Deserialize;
```

**re-export 視 `rust-api/server/model/src/admin/input/mod.rs` 既有 pattern**:
- 若既有有 `pub use sys_user::{CreateUserInput, UpdateUserInput};` → 改為 `pub use sys_user::{CreateUserInput, UpdateUserInput, DeleteUserByBodyInput, BatchDeleteUserInput};`
- 若用 glob `pub use sys_user::*;` → 自動帶入、不需改

**注意**: F9 **不加 `validator::Validate` derive**(per FR-018 + F11 Q3、stub-level 不加 custom validation)。`update_user_post` 重用既有 `UpdateUserInput` DTO、不新加。

---

## E8: Casbin migration `m20260520_a_f9_system_manage_alias_seed.rs`(per spec FR-008 + R-Q7 沿用 F11 R-Q5)

**File**: `rust-api/migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`(**新建**、~80 LOC、沿用 F11 m20260519 pattern with v4='')

**完整 code shape**:

```rust
//! F9 systemManage-alias-router Casbin policy seed — 補 10 條 /systemManage/* alias endpoint 的
//! ROLE_SUPER + ROLE_ADMIN allow rules(共 20 rows)、GeneralUser default deny。
//! per F9 spec FR-008 + FR-009 + brainstorm Q1 + R-Q6 沿用 F11 R-Q5 v4='' baseline。
//! 沿用 F11 m20260519 既有 pattern。

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
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getRoleList',       'GET',    '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getAllRoles',       'GET',    '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getUserList',       'GET',    '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/addUser',           'POST',   '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/updateUser',        'POST',   '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/deleteUser',        'DELETE', '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/batchDeleteUser',   'DELETE', '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getMenuList/v2',    'GET',    '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getAllPages',       'GET',    '', ''),
            ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getMenuTree',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getRoleList',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getAllRoles',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getUserList',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/addUser',           'POST',   '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/updateUser',        'POST',   '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/deleteUser',        'DELETE', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/batchDeleteUser',   'DELETE', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getMenuList/v2',    'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getAllPages',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getMenuTree',       'GET',    '', '')
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
              AND v2 LIKE '/systemManage/%'
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
pub mod m20260520_a_f9_system_manage_alias_seed;
```

並在 `lib.rs` 的 `Migrator::migrations()` vec 加(對齊 `m20260519_a_f11` register location):
```rust
Box::new(m20260520_a_f9_system_manage_alias_seed::Migration),
```

---

## E9: 既有 `Res<T>` envelope shape(F11 R-Q4 沿用、F9 不改)

**File**: `rust-api/server/core/src/web/res.rs:13-18`(既有、F9 不動)

```rust
#[derive(Debug, Serialize, Default)]
pub struct Res<T> {
    pub code: u16,           // 0 = CODE_SUCCESS;5001 = CODE_PERMISSION_CASBIN_DENY
    pub data: Option<T>,
    pub msg: String,         // "success" for success path
    pub success: bool,       // true for success path
}
```

**F9 stub `data` field 具體 shape**:

**`/systemManage/getRoleList` response data**(重用 既有 `get_paginated_roles`):
```json
{ "list": [...], "page": 1, "size": 10, "total": N }   // paginated wrap、繼承既有 handler
```

**`/systemManage/getAllRoles` response data**(per E2 + E4 新做):
```json
[ { "id": "...", "name": "ROLE_SUPER", "status": 1, ... }, ... ]   // Vec<SysRoleModel>、繼承既有 model
```

**`/systemManage/getUserList` response data**(重用 `get_paginated_users`):
```json
{ "list": [...], "page": 1, "size": 10, "total": N }   // paginated wrap、繼承既有 handler
```

**`/systemManage/addUser` response data**(重用 `create_user`):
```json
{ "id": "...", "username": "...", "status": 1, ... }   // UserWithoutPassword、繼承既有 handler
```

**`/systemManage/updateUser` response data**(重用 `update_user`、per R-Q1):
```json
{ "id": "...", "username": "...", ... }   // UserWithoutPassword、繼承既有 handler
```

**`/systemManage/deleteUser` response data**(per E1 `delete_user_by_body`):
```json
null    // Res<()>、繼承既有 service delete_user 結果
```

**`/systemManage/batchDeleteUser` response data**(per E1 `batch_delete_users`、stub 新做):
```json
{ "deletedCount": N }   // N ≤ ids.length、per Q3 拍板
```

**`/systemManage/getMenuList/v2` response data**(重用 `get_menu_list`):
```json
[ ... MenuTree array ... ]   // Vec<MenuTree>、繼承既有 handler
```

**`/systemManage/getAllPages` response data**(per E3 + E5 新做):
```json
[ "page_key_1", "page_key_2", ... ]   // Vec<String>、SELECT DISTINCT name from sys_menu
```

**`/systemManage/getMenuTree` response data**(重用 `tree_menu`):
```json
[ ... MenuTree array ... ]   // Vec<MenuTree>、繼承既有 handler
```

---

## E10: Casbin `casbin_rule` 表 row shape(F6 + F11 已驗 schema、F9 不改)

**Schema**(`casbin_rule` 表,既有 F1.1/F2.1 baseline、F6 + F11 沿用、F9 沿用):

```sql
CREATE TABLE casbin_rule (
    ptype  TEXT,    -- 'p' = policy / 'g' = role-user grouping
    v0     TEXT,    -- role (for p) / user (for g)
    v1     TEXT,    -- domain
    v2     TEXT,    -- object (endpoint path)
    v3     TEXT,    -- action (HTTP method)
    v4     TEXT,    -- effect ('' = implicit allow / 'deny' / etc.) — per F11 R-Q5 baseline 空字串
    v5     TEXT     -- reserved (empty for F9)
);
```

**F9 寫入 20 row example**(per E8 INSERT):

| ptype | v0          | v1         | v2                                  | v3     | v4 | v5 |
|---|---|---|---|---|---|---|
| p     | ROLE_SUPER  | built-in   | /systemManage/getRoleList           | GET    | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/getAllRoles           | GET    | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/getUserList           | GET    | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/addUser               | POST   | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/updateUser            | POST   | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/deleteUser            | DELETE | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/batchDeleteUser       | DELETE | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/getMenuList/v2        | GET    | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/getAllPages           | GET    | (空) | (空) |
| p     | ROLE_SUPER  | built-in   | /systemManage/getMenuTree           | GET    | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/getRoleList           | GET    | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/getAllRoles           | GET    | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/getUserList           | GET    | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/addUser               | POST   | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/updateUser            | POST   | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/deleteUser            | DELETE | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/batchDeleteUser       | DELETE | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/getMenuList/v2        | GET    | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/getAllPages           | GET    | (空) | (空) |
| p     | ROLE_ADMIN  | built-in   | /systemManage/getMenuTree           | GET    | (空) | (空) |

**範疇外**(per F11 R-Q5 + R-Q6):
- 不加 CHECK constraint、不加 enum type
- 不改 schema(F9 只寫 row)
- 不加 `g` rule(F5.1 seed 既有 user-role assignment 沿用)
- 不動既有 m20241024 row(per FR-014 + R-Q6 + A-006)

---

## Data Model 完成標誌

- ✅ E1 `SysUserApi` 結構 + 2 個新 handler(delete_user_by_body + batch_delete_users)code shape — **per R-Q1 spec correction**(原 spec 寫 3 個、修正為 2 個)
- ✅ E2 `SysRoleApi` 加 1 個 handler(get_all_roles)
- ✅ E3 `SysMenuApi` 加 1 個 handler(get_all_pages)
- ✅ E4 `SysRoleService::find_all_enabled` 新 method shape + SQL(per R-Q2)
- ✅ E5 `SysMenuService::find_all_page_keys` 新 method shape + SQL(per R-Q3)
- ✅ E6 `SysSystemManageRouter` 新建 file shape + 10 條 route mount(其中 update_user 改直接 mount per R-Q1)+ RouteInfo + nest 結構
- ✅ E7 2 個新 DTO(DeleteUserByBodyInput / BatchDeleteUserInput)、update_user 重用既有 UpdateUserInput
- ✅ E8 Casbin migration 20 row INSERT + down() DELETE pattern(per F11 R-Q5 v4=''baseline)
- ✅ E9 既有 `Res<T>` envelope actual shape(F11 R-Q4 沿用)+ 10 條 endpoint 各自 data shape 標明
- ✅ E10 `casbin_rule` 表 schema 不改 + 20 row shape table
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Net data-model 對比 spec.md 修正**(per R-Q1):
- F9 `sys_user_api.rs` 加 handler 數 = **2 個**(不是 spec 寫的 3 個);LOC +~40(不是 +~55)
- F9 整體 LOC ~315(不是 spec 寫的 ~330)
- file 改動仍 12 file(handler 數量改變但 entity api 改動數量不變)
