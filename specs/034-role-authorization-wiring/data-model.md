# Data Model — W-FW4 role-authorization-wiring

非新增 DB schema —— 本 feature 在既有 `sys_role_menu`（role↔menu M:N 關聯表）上接線。本檔記 alias DTO、transform 對映、Extension wiring、Casbin policy seed、base-web service function。

## 既有實體（不改）

- **`sys_role_menu`**：role↔menu 關聯表，複合鍵 `role_id`（string）+ `menu_id`（i32）+ `domain`（string）。角色菜單授權的事實源。
- **`sys_menu`**：菜單主表，`id`（i32）/ `menu_type`（Directory|Menu）/ `status`（enum）/ `constant`（bool）/ `pid` / 等。
- **native service（業務邏輯不改）**：
  - `SysMenuService::get_menu_ids_by_role_id(role_id: String, domain: String) -> Vec<i32>` —— 撈 `sys_role_menu` → re-filter `sys_menu` 的 `Status::Enabled` + `Constant==false` → 回 menu id。
  - `SysAuthorizationService::assign_routes(domain: String, role_id: String, route_ids: Vec<i32>)` —— delta insert/delete `sys_role_menu`、transaction 內 commit。

## E1 — alias input DTO（`server/model/src/admin/input/sys_role.rs`）

1 個 base-web-shaped DTO，`#[derive(Debug, Deserialize)]` + `#[serde(rename_all = "camelCase")]`：

| DTO | 欄位 | 來源 |
|---|---|---|
| `AssignRoleMenusInput` | `role_id: String` / `menu_ids: Vec<i32>` | base-web menu-auth modal 送出（`{ roleId, menuIds }`） |

讀 alias 走 path param（`roleId`）、無 body DTO。`input/mod.rs` re-export `AssignRoleMenusInput`。

> `role_id` 為字串（role id runtime 為 ULID 字串，沿 W-FW3 R-Q2）；`menu_ids` 為真 int（menu id `i32`，同 W-FW2）。

## E2 — transform handler（`server/api/src/admin/sys_system_manage_api.rs`）

2 個 `*_for_systemmanage` handler，extractor / 體例比照 W-FW2/W-FW3：

**`get_role_menu_ids_for_systemmanage`**（讀）：
- extractor：`Path<String>` roleId + `Extension<User>` + `Extension<Arc<SysMenuService>>`。
- 邏輯：`service.get_menu_ids_by_role_id(role_id, user.domain())` → `Res<Vec<i32>>`。
- domain 取自 JWT actor（同原生 `get_auth_routes`）。

**`assign_role_menus_for_systemmanage`**（寫）：
- extractor：`Json<AssignRoleMenusInput>` + `Extension<User>` + `Extension<Arc<SysAuthorizationService>>`。
- 邏輯：`service.assign_routes(user.domain(), input.role_id, input.menu_ids)` → `Res<bool>`（`.map(|_| Res::new_data(true))`，比照 W-FW3 `delete_role` handler 回傳體例）。
- domain 由 actor 注入（base-web 不傳）。

> 兩 handler 皆 thin passthrough、無業務過濾（R-Q2）。`User` extension 既有、`domain()` 既有。

## E3 — route（`server/router/src/admin/sys_system_manage_route.rs`）

2 條 route + RouteInfo：
- `/getRoleMenuIds/:roleId` —— `get`
- `/assignRoleMenus` —— `post`

既有 alias（`getMenuTree` / `getAllPages` / role CRUD alias 等）不動。

## E4 — Extension wiring（`server/initialize/src/router_initialization.rs`）

systemManage router 組裝處（`~:352`，現已 layer `SysUserService` / `SysRoleService` / `SysMenuService`）**補一行** `.layer(Extension(Arc::new(SysAuthorizationService) as Arc<SysAuthorizationService>))`。`SysMenuService` 已存在、無需動。讓 E2 寫 handler 的 `Extension<Arc<SysAuthorizationService>>` runtime 可解析（R-Q1）。

## E5 — Casbin policy seed migration

新 migration（`migration/src/datas/m20260522_e_wfw4_role_auth_alias_seed.rs` + register `mod.rs` / `lib.rs`）INSERT `casbin_rule`：`/systemManage/{getRoleMenuIds,assignRoleMenus}` 2 path × {ROLE_SUPER, ROLE_ADMIN} allow，method 對齊 route（getRoleMenuIds = `GET`、assignRoleMenus = `POST`），`v4 = ''`。含 scope-limited 反向 DELETE（down migration）。結構比照 W-FW3 `m20260522_d_wfw3_role_alias_seed`。

> 檔名序號：W-FW3 已用至 `m20260522_d_`，故 W-FW4 同日（2026-05-22）落地為 `_e_`；若隔日落地則改用該落地日期 + `_a_`。

> **精確說明**：Casbin seed 只保護「誰能呼叫這 2 條 alias 端點」（端點層級授權）。角色菜單授權**資料**寫 `sys_role_menu` 表（`assign_routes` 既有邏輯）、非 Casbin。

## base-web service function（`src/service/api/system-manage.ts`）

- `fetchGetRoleMenuIds(roleId)` → `GET /systemManage/getRoleMenuIds/:roleId`，回 `number[]`
- `fetchAssignRoleMenus(data)` → `POST /systemManage/assignRoleMenus`，body `{ roleId, menuIds }`

型別衍生自既有 `Api.SystemManage`，**不改** `src/typings`。`roleId` 原樣傳遞（runtime 字串、宣告 `number`、不轉型，R-Q4）。

## base-web menu-auth-modal 接線（`src/views/manage/role/modules/menu-auth-modal.vue`）

- `getChecks`：`fetchGetRoleMenuIds(props.roleId)` → `if (!error)` 設 `checks.value`（取代寫死假陣列）。
- `handleSubmit`：`fetchAssignRoleMenus({ roleId: props.roleId, menuIds: checks.value })` → `if (error) return` → 成功 `$message.success` + `closeModal`。

**不動**：`getTree`（已真 API）、`getHome` / `updateHome` / `getPages`（角色首頁、W-FW4-N2 follow-up）、modal template / UI。
