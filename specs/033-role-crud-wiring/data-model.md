# Data Model — W-FW3 role-crud-wiring

非新增 DB schema —— 本 feature 在既有 `sys_role` 上接線。本檔記 alias DTO、transform 對映、Casbin policy seed。

## 既有實體（不改）

**`sys_role`**（role 主表）：`id`（string）/ `pid`（string，角色樹父）/ `code`（string，1–50，唯一，Casbin `v0` 識別鍵）/ `name`（string，1–50）/ `description`（`Option<string>`，≤200）/ `status`（enum `Status`）/ audit 欄 / `deleted_at`。

**native role service**（`TRoleService`，業務邏輯不改，E4 例外見下）：`create_role(CreateRoleInput)` / `update_role(UpdateRoleInput)` / `get_role(&str)` / `delete_role(&str, &Actor)`。`CreateRoleInput` = `RoleInput { pid, code, name, status, description }`；`UpdateRoleInput { id, role: RoleInput }`。

## E1 — alias input DTO（`server/model/src/admin/input/sys_role.rs`）

4 個 base-web-shaped DTO，`#[derive(Debug, Deserialize)]` + `#[serde(rename_all = "camelCase")]`：

| DTO | 欄位 | 來源 |
|---|---|---|
| `SystemManageAddRoleInput` | `role_name: String` / `role_code: String` / `role_desc: Option<String>` / `status: String` | base-web add drawer（4 欄） |
| `SystemManageUpdateRoleInput` | 同上 4 欄 + `id: String` | base-web edit drawer |
| `DeleteRoleByBodyInput` | `id: String` | base-web 單筆刪除 |
| `BatchDeleteRoleInput` | `ids: Vec<String>` | base-web 批次刪除 |

`input/mod.rs` re-export 4 者。

## E2 — transform 對映（`server/api/src/admin/sys_system_manage_api.rs`）

4 個 `*_role_for_systemmanage` handler，extractor / 體例比照 W-FW1 / W-FW2。

**`add_role_for_systemmanage`**（`SystemManageAddRoleInput` → `CreateRoleInput`）：

| `RoleInput` 欄 | 來源 |
|---|---|
| `name` | `role_name` |
| `code` | `role_code` |
| `description` | `role_desc` |
| `status` | `map_status(status)`（重用 W-FW1 helper：`'1'`→`Enabled`、`'2'`→`Disabled`） |
| `pid` | 注入 `"0"`（R-Q1 root 慣例） |

→ 呼 `create_role`。

**`update_role_for_systemmanage`**（`SystemManageUpdateRoleInput` → `UpdateRoleInput`）：先 `get_role(id)` 取既有 role → 構造 `UpdateRoleInput { id, role: RoleInput { code: <既有.code>, pid: <既有.pid>, name: <base-web.role_name>, description: <base-web.role_desc>, status: map_status(<base-web.status>) } }` → 呼 `update_role`。

> **`code` / `pid` 用既有值**（FR-007 code-lock 防 Casbin 孤兒；防擾動角色樹）；`name` / `description` / `status` 取 base-web。

**`delete_role_for_systemmanage`**：`Json<DeleteRoleByBodyInput>` → `delete_role(&id, &actor)`。
**`batch_delete_role_for_systemmanage`**：`Json<BatchDeleteRoleInput>` → per-id loop `delete_role` + `deletedCount` 計數（比照 F9 `batch_delete_users` / W-FW2 `batch_delete_menu`）。

`map_status` 重用 W-FW1 既有 helper、`Status` 已於 `service/admin/mod.rs` re-export —— 無新對映 helper。

## E3 — route（`server/router/src/admin/sys_system_manage_route.rs`）

4 條 route + RouteInfo：`/addRole` `post`、`/updateRole` `post`、`/deleteRole` `delete`、`/batchDeleteRole` `delete`。既有 role 讀 alias（`getRoleList` / `getAllRoles`）不動。

## E4 — `update_role` status 修正（`server/service/src/admin/sys_role_service.rs`）

`update_role` 構造 `SysRoleActiveModel` 時補 `status: Set(input.role.status)`（1 行）。修 status-drop（FR-006）。此修正惠及所有 `update_role` caller（含 native `/role/*`）。

## E5 — Casbin policy seed migration

新 migration（`migration/src/datas/m20260522_d_wfw3_role_alias_seed.rs` + `mod.rs` / `lib.rs` register）INSERT `casbin_rule`：`/systemManage/{addRole,updateRole,deleteRole,batchDeleteRole}` 4 path × {ROLE_SUPER, ROLE_ADMIN} allow，method 對齊 route（add / update = `POST`、delete / batchDelete = `DELETE`），`v4 = ''`。含 scope-limited 反向 DELETE（down migration）。結構比照 W-FW2 `m20260522_b_wfw2_menu_alias_seed`；檔名序號取 `migration/src/datas/` 內最新 migration 的次一字母 —— W-FW2 已用至 `m20260522_c_`，故 033 同日（2026-05-22）落地為 `_d_`；若隔日落地則改用該落地日期 + `_a_`。

## base-web service function（`src/service/api/system-manage.ts`）

- `fetchAddRole(data)` → `POST /systemManage/addRole`
- `fetchUpdateRole(data)` → `POST /systemManage/updateRole`
- `fetchDeleteRole({ id })` → `DELETE /systemManage/deleteRole`
- `fetchBatchDeleteRole({ ids })` → `DELETE /systemManage/batchDeleteRole`

型別衍生自既有 `Api.SystemManage.Role`，**不改** `src/typings`。
