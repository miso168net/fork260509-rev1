# Data Model: F7 — manage-crud-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F7 不動 schema、不增 sys_role/sys_user/sys_menu row、不動 entity model。**唯一 DB 改動**:`casbin_rule` 表 INSERT 15 row 補 ROLE_ADMIN 對既有 `/user/* /role/* /route/*` path allow。code 改動主體:**5 個新 Output DTO + From impl**(集中於新建 `output/sys_system_manage.rs`)+ **5 個新 alias wrapper handler**(集中於新建 `sys_system_manage_api.rs`)+ F9 既有 router 5 mount 換 handler + 1 個新 Casbin migration。

---

## E1: `SystemManageRoleOutput`(對齊 `Api.SystemManage.Role`)

**File**: `rust-api/server/model/src/admin/output/sys_system_manage.rs`(**新建**、per R-Q1 命名修正)

**Struct + From impl**:

```rust
use chrono::NaiveDateTime;
use serde::Serialize;
use crate::admin::entities::{sea_orm_active_enums::Status, sys_role};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageRoleOutput {
    pub id: String,
    pub role_name: String,
    pub role_code: String,
    pub role_desc: String,
    pub status: Status,
    pub created_at: NaiveDateTime,
    pub created_by: String,
    pub updated_at: Option<NaiveDateTime>,
    pub updated_by: Option<String>,
}

impl From<sys_role::Model> for SystemManageRoleOutput {
    fn from(m: sys_role::Model) -> Self {
        Self {
            id: m.id,
            role_name: m.name,
            role_code: m.code,
            role_desc: m.description.unwrap_or_default(),
            status: m.status,
            created_at: m.created_at,
            created_by: m.created_by,
            updated_at: m.updated_at,
            updated_by: m.updated_by,
        }
    }
}
```

**Field mapping(rust → base TS type)**:

| base TS field | rust column | F7 處理 |
|---|---|---|
| `id: string` | `id: String` | direct |
| `roleName: string` | `name: String` | rename(camelCase + role_name) |
| `roleCode: string` | `code: String` | rename(camelCase + role_code) |
| `roleDesc: string` | `description: Option<String>` | unwrap_or_default(null → "") per R-Q3 |
| `status: EnableStatus` | `status: Status` | direct(既有 enum 序列化為 "enabled"/"disabled") |
| `createdAt: string` | `created_at: NaiveDateTime` | direct(既有 NaiveDateTime 序列化 ISO 8601 string) |
| `createdBy: string` | `created_by: String` | direct(camelCase) |
| `updatedAt: string \| null` | `updated_at: Option<NaiveDateTime>` | direct |
| `updatedBy: string \| null` | `updated_by: Option<String>` | direct |

**LOC**:~30 LOC

---

## E2: `SystemManageAllRoleOutput`(對齊 `Api.SystemManage.AllRole = Pick<Role, 'id' | 'roleName' | 'roleCode'>`)

**File**: `rust-api/server/model/src/admin/output/sys_system_manage.rs`(同 E1)

**Struct + From impl**:

```rust
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageAllRoleOutput {
    pub id: String,
    pub role_name: String,
    pub role_code: String,
}

impl From<sys_role::Model> for SystemManageAllRoleOutput {
    fn from(m: sys_role::Model) -> Self {
        Self {
            id: m.id,
            role_name: m.name,
            role_code: m.code,
        }
    }
}
```

**LOC**:~15 LOC

---

## E3: `SystemManageUserOutput`(對齊 `Api.SystemManage.User`)

**File**: `rust-api/server/model/src/admin/output/sys_system_manage.rs`(同 E1)

**Struct + From impl**:

```rust
use crate::admin::entities::sys_user;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageUserOutput {
    pub id: String,
    pub user_name: String,
    pub user_gender: Option<String>,    // hardcode None per R-Q2 + spec FR-004
    pub nick_name: String,
    pub user_phone: Option<String>,
    pub user_email: Option<String>,
    pub user_roles: Vec<String>,        // hardcode vec![] per R-Q2 + spec FR-004
    pub status: Status,
    pub created_at: NaiveDateTime,
    pub created_by: String,
    pub updated_at: Option<NaiveDateTime>,
    pub updated_by: Option<String>,
}

impl From<sys_user::Model> for SystemManageUserOutput {
    fn from(m: sys_user::Model) -> Self {
        Self {
            id: m.id,
            user_name: m.username,
            user_gender: None,           // rust 無 column、hardcode
            nick_name: m.nick_name,
            user_phone: m.phone_number,
            user_email: m.email,
            user_roles: vec![],          // rust 無 column、hardcode(不做 g rule join per Q2)
            status: m.status,
            created_at: m.created_at,
            created_by: m.created_by,
            updated_at: m.updated_at,
            updated_by: m.updated_by,
        }
    }
}
```

**Field mapping(rust → base TS type)**:

| base TS field | rust column | F7 處理 |
|---|---|---|
| `userName: string` | `username: String` | rename + camelCase |
| `userGender: "1" \| "2" \| null` | (no column) | hardcode `None` per R-Q2 |
| `nickName: string` | `nick_name: String` | direct(camelCase 既有 snake_case → nickName 對齊) |
| `userPhone: string` | `phone_number: Option<String>` | rename + 保留 Option per R-Q3 |
| `userEmail: string` | `email: Option<String>` | rename + 保留 Option per R-Q3 |
| `userRoles: string[]` | (no column、g rule join 略) | hardcode `vec![]` per R-Q3 |

**LOC**:~30 LOC

---

## E4: `SystemManageMenuOutput`(對齊 `Api.SystemManage.Menu`)

**File**: `rust-api/server/model/src/admin/output/sys_system_manage.rs`(同 E1)

**Struct + From impl**(per R-Q2 menu_type / icon_type mapping):

```rust
use tracing::warn;
use crate::admin::entities::{sea_orm_active_enums::MenuType, sys_menu};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageMenuOutput {
    pub id: i32,
    pub parent_id: String,
    pub menu_type: String,              // "1" | "2"
    pub menu_name: String,
    pub route_name: String,
    pub route_path: String,
    pub component: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,      // "1" | "2"
    pub buttons: Option<Vec<serde_json::Value>>,    // hardcode None
    pub children: Option<Vec<SystemManageMenuOutput>>,  // hardcode None(非樹結構)
    pub status: Status,
    pub hide_in_menu: Option<bool>,
    pub order: i32,                     // rust sequence
    pub i18n_key: Option<String>,
    pub keep_alive: Option<bool>,
    pub constant: bool,
    pub href: Option<String>,
    pub active_menu: Option<String>,
    pub multi_tab: Option<bool>,
    pub fixed_index_in_tab: Option<i32>,        // hardcode None
    pub query: Option<serde_json::Value>,       // hardcode None
}

fn map_menu_type(rust_type: MenuType) -> String {
    match rust_type {
        MenuType::Directory => "1".to_string(),
        MenuType::Menu => "2".to_string(),
    }
}

fn map_icon_type(rust_type: Option<i32>) -> Option<String> {
    match rust_type {
        None => None,
        Some(1) => Some("1".to_string()),
        Some(2) => Some("2".to_string()),
        Some(other) => {
            warn!("SystemManageMenuOutput: unexpected icon_type {} from sys_menu, defaulting to \"1\"", other);
            Some("1".to_string())
        }
    }
}

impl From<sys_menu::Model> for SystemManageMenuOutput {
    fn from(m: sys_menu::Model) -> Self {
        Self {
            id: m.id,
            parent_id: m.pid,
            menu_type: map_menu_type(m.menu_type),
            menu_name: m.menu_name,
            route_name: m.route_name,
            route_path: m.route_path,
            component: m.component,
            icon: m.icon,
            icon_type: map_icon_type(m.icon_type),
            buttons: None,
            children: None,
            status: m.status,
            hide_in_menu: m.hide_in_menu,
            order: m.sequence,
            i18n_key: m.i18n_key,
            keep_alive: m.keep_alive,
            constant: m.constant,
            href: m.href,
            active_menu: m.active_menu,
            multi_tab: m.multi_tab,
            fixed_index_in_tab: None,
            query: None,
        }
    }
}
```

**Field mapping(rust → base TS type)**:

| base TS field | rust column | F7 處理 |
|---|---|---|
| `parentId: number` | `pid: String` | rename + 保留 String(per R-5 typing mismatch defer) |
| `menuType: "1" \| "2"` | `menu_type: MenuType` enum | match → "1"/"2" per R-Q2 |
| `menuName: string` | `menu_name: String` | direct(camelCase) |
| `routeName: string` | `route_name: String` | direct |
| `routePath: string` | `route_path: String` | direct |
| `iconType: "1" \| "2"` | `icon_type: Option<i32>` | match → Option<String> per R-Q2 + tracing::warn! |
| `buttons: MenuButton[] \| null` | (no column) | hardcode None |
| `children: Menu[] \| null` | (no nested column 在 paginated list) | hardcode None |
| `order: number` | `sequence: i32` | rename(field-level) |
| `fixedIndexInTab: number \| null` | (no column) | hardcode None |
| `query: object \| null` | (no column) | hardcode None |

**LOC**:~70 LOC(含 mapping helper fn)

---

## E5: `SystemManageMenuTreeNodeOutput`(對齊 `Api.SystemManage.MenuTree = {id, label, pId, children}`)

**File**: `rust-api/server/model/src/admin/output/sys_system_manage.rs`(同 E1)

**Struct + From impl**(per R-Q6):

```rust
use crate::admin::output::sys_menu::MenuTree;  // 既有 MenuTree、F7 不改

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageMenuTreeNodeOutput {
    pub id: i32,
    pub label: String,
    #[serde(rename = "pId")]            // 注意大寫 I(base TS type 用 pId、camelCase 不對齊)
    pub p_id: String,
    pub children: Option<Vec<SystemManageMenuTreeNodeOutput>>,
}

impl From<MenuTree> for SystemManageMenuTreeNodeOutput {
    fn from(m: MenuTree) -> Self {
        Self {
            id: m.id,
            label: m.menu_name,
            p_id: m.pid,
            children: m.children.map(|children|
                children.into_iter().map(Into::into).collect()
            ),
        }
    }
}
```

**Field mapping(rust → base TS type)**:

| base TS field | rust column | F7 處理 |
|---|---|---|
| `id: number` | `id: i32`(MenuTree) | direct |
| `label: string` | `menu_name: String`(MenuTree) | rename |
| `pId: number` | `pid: String`(MenuTree) | rename `#[serde(rename = "pId")]` + 保留 String per R-5 |
| `children: MenuTree[]` | `children: Option<Vec<MenuTree>>`(MenuTree) | 遞迴 Into 對齊 |

**LOC**:~20 LOC

---

## E6: `SysSystemManageApi` 5 個 wrapper handler

**File**: `rust-api/server/api/src/admin/sys_system_manage_api.rs`(**新建**、~80 LOC)

**Struct + 5 handler**:

```rust
use std::sync::Arc;
use axum::{Extension, response::IntoResponse};
use server_core::web::{error::AppError, page::PaginatedData, res::Res};
use server_model::admin::output::sys_system_manage::{
    SystemManageRoleOutput, SystemManageAllRoleOutput, SystemManageUserOutput,
    SystemManageMenuOutput, SystemManageMenuTreeNodeOutput,
};
use server_service::admin::{SysRoleService, SysUserService, SysMenuService};

pub struct SysSystemManageApi;

impl SysSystemManageApi {

    /// F7 alias: GET /systemManage/getRoleList → list_roles_for_systemmanage
    pub async fn list_roles_for_systemmanage(
        Extension(service): Extension<Arc<SysRoleService>>,
        // ... paginated query extractor
    ) -> Result<Res<PaginatedData<SystemManageRoleOutput>>, AppError> {
        let raw = service.find_paginated_roles(...).await?;
        // map raw.records → SystemManageRoleOutput via .into()
        // wrap envelope
    }

    pub async fn list_all_roles_for_systemmanage(...) -> ... { ... }
    pub async fn list_users_for_systemmanage(...) -> ... { ... }
    pub async fn list_menu_for_systemmanage(...) -> ... { ... }
    pub async fn tree_menu_for_systemmanage(...) -> ... { ... }
}
```

**5 handler implement pattern**(統一):
1. 從 Extension 拿既有 service
2. Call 既有 service method(F9 已加 `find_all_enabled / find_all_page_keys`、其他直接重用)
3. `.into()` map raw model → F7 Output DTO
4. Wrap `Res::new_data(...)` envelope

**Imports**:
- `Extension`、`Arc`、PaginatedData、Res、AppError
- F7 5 個 output DTO from `server_model::admin::output::sys_system_manage`
- 3 個 service:`SysRoleService`、`SysUserService`、`SysMenuService`(per F9 既有 wire)
- `IntoResponse` for handler return

**LOC**:~80 LOC(每 handler ~15 LOC)

---

## E7: F9 既有 `sys_system_manage_route.rs` 5 條 mount 換 handler

**File**: `rust-api/server/router/src/admin/sys_system_manage_route.rs`(F9 既有檔、F7 改 ~10 LOC)

**改動範圍**(per FR-008、5 條 read alias):

```rust
// imports 加 SysSystemManageApi(SysRoleApi/SysUserApi/SysMenuApi imports 仍保留、給寫 alias 用)
use server_api::admin::{SysMenuApi, SysRoleApi, SysUserApi, SysSystemManageApi};
// ...

// router 內 5 條 mount 換 handler:
let router = Router::new()
    .route("/getRoleList",     get(SysSystemManageApi::list_roles_for_systemmanage))      // ← 換
    .route("/getAllRoles",     get(SysSystemManageApi::list_all_roles_for_systemmanage))  // ← 換
    .route("/getUserList",     get(SysSystemManageApi::list_users_for_systemmanage))      // ← 換
    .route("/addUser",         post(SysUserApi::create_user))                              // F9 不動
    .route("/updateUser",      post(SysUserApi::update_user))                              // F9 不動
    .route("/deleteUser",      delete(SysUserApi::delete_user_by_body))                    // F9 不動
    .route("/batchDeleteUser", delete(SysUserApi::batch_delete_users))                     // F9 不動
    .route("/getMenuList/v2",  get(SysSystemManageApi::list_menu_for_systemmanage))       // ← 換
    .route("/getAllPages",     get(SysMenuApi::get_all_pages))                             // F9 不動
    .route("/getMenuTree",     get(SysSystemManageApi::tree_menu_for_systemmanage));      // ← 換

// nest / RouteInfo register 不變
```

**LOC delta**:~10 LOC(5 條 mount + 1 import)

---

## E8: Casbin migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` 15 row

**File**: `rust-api/migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs`(**新建**、~60 LOC、per R-Q5 100% 對齊 F9 m20260520 pattern)

**完整 code**:

```rust
//! F7 manage-crud-alignment Casbin policy seed —補 ROLE_ADMIN 對既有 /user/* /role/* /route/*
//! path 的 allow rules(共 15 rows)、解 spec A-006 已知差異(F9 baseline)。
//! per F7 spec FR-011 + FR-012 + brainstorm Q3 + R-Q7 沿用 F11 R-Q5 v4='' baseline。
//! 沿用 F9 m20260520 既有 pattern。

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
            ('p', 'ROLE_ADMIN', 'built-in', '/user/',          'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/user/users',     'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/user/',          'POST',   '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/user/',          'PUT',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/user/:id',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/user/:id',       'DELETE', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/role/',          'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/role/',          'POST',   '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/role/',          'PUT',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/role/:id',       'GET',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/role/:id',       'DELETE', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/route/',         'POST',   '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/route/',         'PUT',    '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/route/:id',      'DELETE', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/route/:id',      'GET',    '', '')
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
              AND v0 = 'ROLE_ADMIN'
              AND v1 = 'built-in'
              AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%')
              AND v2 NOT LIKE '/systemManage/%'
            "#
            .to_string(),
        );

        db.execute(delete_stmt).await?;
        Ok(())
    }
}
```

**Casbin row 完整列表**(15 row):

| # | v0 | v1 | v2 | v3 | v4 | v5 | 對應 endpoint |
|---|---|---|---|---|---|---|---|
| 1 | ROLE_ADMIN | built-in | /user/ | GET | (空) | (空) | sys_user_route.rs:58 paginated users |
| 2 | ROLE_ADMIN | built-in | /user/users | GET | (空) | (空) | sys_user_route.rs:57 get_all_users |
| 3 | ROLE_ADMIN | built-in | /user/ | POST | (空) | (空) | sys_user_route.rs:59 create_user |
| 4 | ROLE_ADMIN | built-in | /user/ | PUT | (空) | (空) | sys_user_route.rs:61 update_user |
| 5 | ROLE_ADMIN | built-in | /user/:id | GET | (空) | (空) | sys_user_route.rs:60 get_user |
| 6 | ROLE_ADMIN | built-in | /user/:id | DELETE | (空) | (空) | sys_user_route.rs:62 delete_user |
| 7 | ROLE_ADMIN | built-in | /role/ | GET | (空) | (空) | sys_role_route.rs paginated_roles |
| 8 | ROLE_ADMIN | built-in | /role/ | POST | (空) | (空) | sys_role_route.rs create_role |
| 9 | ROLE_ADMIN | built-in | /role/ | PUT | (空) | (空) | sys_role_route.rs update_role |
| 10 | ROLE_ADMIN | built-in | /role/:id | GET | (空) | (空) | sys_role_route.rs get_role |
| 11 | ROLE_ADMIN | built-in | /role/:id | DELETE | (空) | (空) | sys_role_route.rs delete_role |
| 12 | ROLE_ADMIN | built-in | /route/ | POST | (空) | (空) | sys_menu_route.rs:74 create_menu |
| 13 | ROLE_ADMIN | built-in | /route/ | PUT | (空) | (空) | sys_menu_route.rs:76 update_menu |
| 14 | ROLE_ADMIN | built-in | /route/:id | DELETE | (空) | (空) | sys_menu_route.rs:77 delete_menu |
| 15 | ROLE_ADMIN | built-in | /route/:id | GET | (空) | (空) | sys_menu_route.rs:75 get_menu |

**Module register**(2 處):

1. `rust-api/migration/src/datas/mod.rs` 加 1 行:
   ```rust
   pub mod m20260521_a_f7_admin_role_existing_paths_seed;
   ```

2. `rust-api/migration/src/lib.rs` Migrator vec 加(對齊 m20260520 register location 後):
   ```rust
   Box::new(m20260521_a_f7_admin_role_existing_paths_seed::Migration),
   ```

---

## E9: 既有 `Res<T>` envelope shape(F4 + F11 R-Q4 + F9 沿用、F7 不改)

**File**: `rust-api/server/core/src/web/res.rs:13-18`(既有、F7 不動)

**F7 5 條 alias response data 具體 shape**:

**`/systemManage/getRoleList` response data**(F7 新 wrapper、回 `PaginatedData<SystemManageRoleOutput>`):
```json
{
  "current": 1,
  "size": 10,
  "total": 3,
  "records": [
    {
      "id": "1",
      "roleName": "超级管理员",
      "roleCode": "ROLE_SUPER",
      "roleDesc": "超级管理员",
      "status": "enabled",
      "createdAt": "2024-05-15T00:00:00",
      "createdBy": "-1",
      "updatedAt": null,
      "updatedBy": null
    },
    ...
  ]
}
```

**`/systemManage/getAllRoles` response data**(F7 新 wrapper、回 `Vec<SystemManageAllRoleOutput>`):
```json
[
  {"id": "1", "roleName": "超级管理员", "roleCode": "ROLE_SUPER"},
  {"id": "2", "roleName": "管理员", "roleCode": "ROLE_ADMIN"},
  {"id": "3", "roleName": "用户", "roleCode": "ROLE_USER"}
]
```

**`/systemManage/getUserList` response data**(F7 新 wrapper、回 `PaginatedData<SystemManageUserOutput>`):
```json
{
  "current": 1,
  "size": 10,
  "total": 3,
  "records": [
    {
      "id": "1",
      "userName": "Soybean",
      "userGender": null,
      "nickName": "Soybean",
      "userPhone": "18511111111",
      "userEmail": "111@gmail.com",
      "userRoles": [],
      "status": "enabled",
      "createdAt": "2024-05-15T00:00:00",
      "createdBy": "-1",
      "updatedAt": null,
      "updatedBy": null
    },
    ...
  ]
}
```

**`/systemManage/getMenuList/v2` response data**(F7 新 wrapper、回 `Vec<SystemManageMenuOutput>`):
```json
[
  {
    "id": 2,
    "parentId": "0",
    "menuType": "2",
    "menuName": "403",
    "routeName": "403",
    "routePath": "/403",
    "component": "layout.blank$view.403",
    "icon": "",
    "iconType": "1",
    "buttons": null,
    "children": null,
    "status": "enabled",
    "hideInMenu": true,
    "order": 0,
    "i18nKey": "route.403",
    "keepAlive": false,
    "constant": true,
    "href": "",
    "activeMenu": "",
    "multiTab": false,
    "fixedIndexInTab": null,
    "query": null
  },
  ...
]
```

**`/systemManage/getMenuTree` response data**(F7 新 wrapper、回 `Vec<SystemManageMenuTreeNodeOutput>`):
```json
[
  {
    "id": 51,
    "label": "access-key",
    "pId": "0",
    "children": null
  },
  ...
]
```

---

## E10: Casbin `casbin_rule` 表 row shape(F11 R-Q5 baseline、F7 沿用、不改 schema)

**Schema**(既有 F1.1/F2.1 baseline、F6 + F11 + F9 沿用、F7 沿用):

```sql
CREATE TABLE casbin_rule (
    ptype  TEXT,    -- 'p' = policy / 'g' = role-user grouping
    v0     TEXT,    -- role (for p) / user (for g)
    v1     TEXT,    -- domain
    v2     TEXT,    -- object (endpoint path)
    v3     TEXT,    -- action (HTTP method)
    v4     TEXT,    -- effect ('' = implicit allow / 'deny' / etc.) — per F11 R-Q5 baseline 空字串
    v5     TEXT     -- reserved (empty for F7)
);
```

**F7 寫入 15 row 全屬 `p` policy**、ROLE_ADMIN 為 v0、'built-in' 為 v1、`/user/* /role/* /route/*` 為 v2、HTTP method 為 v3、`''` 為 v4 & v5。

**範疇外**(per F7 spec + F11 R-Q5/R-Q6 沿用):
- 不加 CHECK constraint、不加 enum type
- 不改 schema(F7 只寫 row)
- 不加 `g` rule(F5.1 seed 既有 user-role assignment 沿用)
- 不動既有 m20241024 / m20260515 / m20260519 / m20260520 row(per FR-014 + R-Q5 + A-006)

---

## Data Model 完成標誌

- ✅ E1 `SystemManageRoleOutput` struct + From impl(per spec FR-002)
- ✅ E2 `SystemManageAllRoleOutput` struct + From impl(per spec FR-003)
- ✅ E3 `SystemManageUserOutput` struct + From impl + 缺欄位 hardcode None/vec![](per spec FR-004 + R-Q3)
- ✅ E4 `SystemManageMenuOutput` struct + From impl + map_menu_type / map_icon_type helper fn + tracing::warn! 對 unexpected default arm(per spec FR-005 + R-Q2)
- ✅ E5 `SystemManageMenuTreeNodeOutput` struct + From impl 遞迴展開 + `pId` 特殊 rename(per spec FR-006 + R-Q6)
- ✅ E6 `SysSystemManageApi` 5 wrapper handler signature(per spec FR-007)
- ✅ E7 F9 既有 router 5 條 mount 換 handler 細目(per spec FR-008)
- ✅ E8 Casbin migration 15 row INSERT + scope-limited DELETE(per spec FR-011/FR-012/FR-013)
- ✅ E9 既有 `Res<T>` envelope F4/F11 R-Q4 沿用 + 5 endpoint 具體 data shape JSON example
- ✅ E10 `casbin_rule` 表 schema F11 R-Q5 sk baseline、F7 沿用、不改 schema
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Net data-model 對比 spec.md 修正**(per R-Q1):
- F7 output DTO file 從 `output/system_manage.rs` 改為 `output/sys_system_manage.rs`(命名級對齊 sys_* prefix 慣例)
- 整體 file count 與 LOC 不變(仍 ~8 file ~270 LOC)
