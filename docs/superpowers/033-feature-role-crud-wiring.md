# W-FW3 `role-crud-wiring` — brainstorm / spec-design

**Date**: 2026-05-22
**Feature**: W-FW3（spec `033`）`role-crud-wiring`
**Track**: W-WEBUI（base-web 管理後台 CRUD 接線）第三個 feature

**Authoritative parents**:
- `docs/INTEGRATION-DESIGN-W-WEBUI.md` §5.3 W-FW3 + §4 base-web 修改範圍邊界
- `.specify/memory/constitution.md` Principle IV「base 不改動邊界」受管例外 — W-WEBUI 軌道
- W-FW1 `user-crud-wiring`（031、merge `a09d316`）/ W-FW2 `menu-crud-wiring`（032、merge `8ccc4b4`）—— 接線模式 precedent

---

## 範疇

base-web `manage/role` 的 **新增 / 編輯 drawer 送出 + 單筆 / 批次刪除**接上 rust-api。後端補 `/systemManage/` 的 role 寫入 alias 轉換層,並一併修掉接線會曝露的 2 個 role-edit backend 正確性問題。

**範疇外**:
- `role-operate-drawer.vue` 內嵌的 `menu-auth-modal` / `button-auth-modal`（角色菜單 / 按鈕授權）→ W-FW4 `role-authorization-wiring`。
- role 階層樹（`sys_role.pid`）的 base-web 管理 UI —— base-web role 頁為扁平表、無樹;非 W-FW3 範疇。

---

## brainstorm 拍板

**Q1（W-FW3 範疇深度）** — 接線會曝露 rust `update_role` 的 2 個既有行為:
- ① `update_role` 建 `SysRoleActiveModel` 時 `status` **不在 `Set` 清單**、由 `..before` 帶入 → 編輯 role 改狀態靜默不持久。
- ② `update_role` 改 `code` **不重同步 Casbin** → 編輯 roleCode 孤兒化該 role 的 `casbin_rule` policy（該 role 權限全失）。

→ **拍板 A:接線 + role-edit 正確性**。W-FW3 範疇含修掉這 2 點,讓「編輯 role」交付即完整可用、無 Casbin 孤兒風險。

**Q2（roleCode 防護機制）** — 三選項:(a) transform-layer code-lock、(b) base-web roleCode edit 唯讀、(c) rust `update_role` 重同步 Casbin。

→ **拍板 (a) transform-layer code-lock**。`update_role_for_systemmanage` transform 先 fetch 既有 role、用既有 `code`（忽略 base-web 送的 roleCode）;同一個 fetch 順便保留既有 `pid`。理由:純後端、不動 base-web render（守 W-WEBUI §4 邊界）、徹底防孤兒。代價:drawer 仍顯示 roleCode 可編輯但 update 忽略之（比照 W-FW2「`query`/`buttons` 被後端忽略」précédent）→ 完整「role code 改名」能力另立 follow-up **W-FW3-N1**。

---

## 設計

### rust-api worktree

**E1 — alias input DTO**（`model/src/admin/input/sys_role.rs` + `input/mod.rs`）

4 個 base-web-shaped DTO（`#[derive(Debug, Deserialize)]` + `#[serde(rename_all = "camelCase")]`,比照 F9 / W-FW1 / W-FW2 alias DTO 體例）:
- `SystemManageAddRoleInput`:`role_name` / `role_code` / `role_desc: Option<String>` / `status: String`（base-web drawer 4 欄形狀;status 為 `'1'/'2'`）
- `SystemManageUpdateRoleInput`:同上 4 欄 + `id: String`
- `DeleteRoleByBodyInput { id: String }`
- `BatchDeleteRoleInput { ids: Vec<String> }`

role id 為 ULID 字串（`create_role` 用 `Ulid::new()`、`delete_role(&str)`）→ delete / batch DTO 用 `String` / `Vec<String>`,**同 W-FW1 user、異於 W-FW2 menu 的 `i32`**（無 menu 那種 int sequence 問題）。

**E2 — transform handler + 對映**（`api/src/admin/sys_system_manage_api.rs`）

4 個 `*_role_for_systemmanage` handler（extractor / 體例比照 W-FW1/W-FW2 的 `*_for_systemmanage`）:
- `add_role_for_systemmanage`:`SystemManageAddRoleInput` → `CreateRoleInput`（= `RoleInput`）。對映 `role_name→name` / `role_code→code` / `role_desc→description` / `status→map_status`（**重用 W-FW1 既有 helper**）/ `pid` 注入 root 預設值（見 R-Q1）→ 呼既有 `SysRoleService::create_role`。
- `update_role_for_systemmanage`:`SystemManageUpdateRoleInput` → **先 fetch 既有 role**（`SysRoleService::get_role(id)`）→ 構造 `UpdateRoleInput { id, role: RoleInput { code: <既有>, pid: <既有>, name: <base-web>, description: <base-web>, status: map_status(<base-web>) } }` → 呼既有 `update_role`。**`code` / `pid` 用既有值**（防 Casbin 孤兒 / 防擾動角色樹）;`name` / `description` / `status` 取 base-web。
- `delete_role_for_systemmanage`:`Json<DeleteRoleByBodyInput>` → 呼既有 `delete_role(id, &actor)`。
- `batch_delete_role_for_systemmanage`:`Json<BatchDeleteRoleInput>` → per-row loop 呼 `delete_role` + `deletedCount` counter（比照 F9 `batch_delete_users` / W-FW2 `batch_delete_menu`）。

`Status` 已於 `service/admin/mod.rs` re-export（W-FW1 起）;`map_status` 重用,**無新對映 helper**。

**E3 — route**（`router/src/admin/sys_system_manage_route.rs`）

4 條 route + RouteInfo —— `/addRole` `post`、`/updateRole` `post`、`/deleteRole` `delete`、`/batchDeleteRole` `delete`。既有 role 讀 alias（`getRoleList` / `getAllRoles`）不動。

**E4 — `update_role` status 修正**（`service/src/admin/sys_role_service.rs`）

`update_role` 構造 `SysRoleActiveModel` 時補 `status: Set(input.role.status)`（1 行）。修掉 status-drop。此修正惠及所有 `update_role` caller（含 native `/role/*`）。

**E5 — Casbin policy seed migration**（新建 `migration/src/datas/` + register `mod.rs` + `lib.rs`）

INSERT `casbin_rule` policy —— 4 條 `/systemManage/{addRole,updateRole,deleteRole,batchDeleteRole}` path × ROLE_SUPER + ROLE_ADMIN allow、`v4=''`;含 scope-limited 反向 DELETE。命名比照 W-FW2 `m20260522_b_wfw2_menu_alias_seed`。

### base-web worktree（3 檔,限 W-WEBUI §4 範圍）

- `src/service/api/system-manage.ts`:新增 `fetchAddRole` / `fetchUpdateRole` / `fetchDeleteRole` / `fetchBatchDeleteRole`（比照 W-FW1/W-FW2 `fetch*` 體例;型別由既有 `Api.SystemManage.Role` 衍生,不改 `src/typings`）。
- `src/views/manage/role/modules/role-operate-drawer.vue`:`handleSubmit` —— `operateType === 'edit'` → `fetchUpdateRole({ ...params, id })`,否則 `fetchAddRole(params)`;`if (error) return`、成功 `$message.success` + `closeDrawer` + `emit('submitted')`。
- `src/views/manage/role/index.vue`:`handleDelete` → `fetchDeleteRole({ id })`、成功 `onDeleted`;`handleBatchDelete` → `fetchBatchDeleteRole({ ids: checkedRowKeys.value })`、成功 `onBatchDeleted`;失敗皆 `if (error) return`。

**不動**型別 / 表格 render / router / store / i18n;`menu-auth-modal` / `button-auth-modal`（drawer 內嵌、W-FW4）維持原樣。

### data flow

```
base-web role drawer handleSubmit
  └─ fetchAddRole / fetchUpdateRole → POST /api/systemManage/{addRole,updateRole}
       └─ transform handler（形狀對映;update 先 fetch 既有 role 取 code/pid）
            └─ create_role / update_role → sys_role 寫入 + audit（同 txn）
base-web role index handleDelete / handleBatchDelete
  └─ fetchDeleteRole / fetchBatchDeleteRole → DELETE /api/systemManage/{deleteRole,batchDeleteRole}
       └─ delete_role（單筆 / per-row loop）→ soft delete + audit
回應 envelope code 0 → 成功 + 列表 refresh;code≠0 → base-web 既有錯誤呈現、drawer 不關
```

### 錯誤處理

沿用 W-FW1/W-FW2:後端非 0 envelope → base-web `request` helper 既有錯誤呈現 → handler `if (error) return`、不關 drawer、不誤報。roleCode 重複（`check_role_exists_in_txn`）/ 無權限（Casbin deny）→ 錯誤 envelope。

---

## 開放問題（speckit Phase 0 research）

- **R-Q1**:`sys_role` root pid 慣例值 —— 實查 seed 資料的 `pid`（menu root 用 `"0"`;role 待確認）。`add_role` transform 注入此值。
- **R-Q2**:base-web `Api.SystemManage.Role['id']` runtime 型別 —— 預期 ULID 字串;確認 delete/batch DTO 用 `String`、base-web `handleBatchDelete` 不需 `.map(Number)`（異於 W-FW2 menu）。`Role['id']` 的 TS 宣告若為 `number` 屬 minor 型別不符（同 backlog 既記的 `MenuRoute.id`)。
- **R-Q3**:`SysRoleService::get_role(&str)` 簽章與可用性確認（`sys_role_service.rs:154` 已見）;transform 用它 fetch 既有 role。

---

## follow-up（已記入 INTEGRATION-CHECKLIST Follow-up Backlog）

- **W-FW3-N1**:role code 改名能力 —— W-FW3 採機制 (a) 鎖 code（base-web 送的 roleCode 在 update 被忽略、drawer 仍顯示可編輯）。完整「安全改 role code」= rust `update_role` 改 code 時重同步 `casbin_rule`（`v0` old→new）+ base-web drawer roleCode edit 唯讀（render、撞 W-WEBUI §4 邊界）→ 獨立 follow-up,若日後需要。

---

## acceptance 方向

CDP browser smoke + curl + psql（per W-WEBUI 慣例、比照 W-FW2 C-V）。涵蓋:image build / dev stack / Casbin seed 落 DB + GeneralUser deny / curl addRole·updateRole·deleteRole·batchDeleteRole 落庫驗 / CDP `/manage/role` CRUD smoke + regression / 三邊 scope。**針對性 C-V**:
- updateRole 改 `status` → psql 驗 `sys_role.status` 真的變（驗 E4 status 修正）。
- updateRole 送與既有不同的 `roleCode` → psql 驗 `sys_role.code` **不變**（驗機制 (a) code-lock）。

wiring feature、**無新純函式單元測試**（transform / 對映由 acceptance 覆蓋,比照 W-FW1/W-FW2 慣例）。
