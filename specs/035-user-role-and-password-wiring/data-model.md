# Data Model — W-FW5 user-role-and-password-wiring

非新增 DB schema —— 本 feature 在既有 `sys_user_role`（user↔role M:N 關聯表）上接線、並接通密碼寫入路徑。本檔記 transform DTO / user→roles delta / changePassword 端點 / base-web UI 新增。

## 既有實體（不改 schema）

- **`sys_user_role`**：user↔role 關聯表，複合鍵 `user_id`（string）+ `role_id`（string）。使用者角色指派的事實源。
- **`sys_user`**：使用者主表，含 `password`（argon2 hash 字串）等。
- **`sys_role`**：角色主表，`id`（string）/ `code`（role code）/ `name` 等。
- **既有能力（沿用、不重做業務邏輯）**：
  - `SecureUtil::hash_password(&[u8]) -> String`（argon2）/ `SecureUtil::verify_password(明文, hash) -> bool` —— `server/utils/src/secure_util.rs`。
  - `SysUserService::create_user` —— 已正確 hash 密碼。
  - `SysAuthService::get_user_roles(user_id) -> Vec<role code>`（`sys_role JOIN sys_user_role`）。
  - `assign_users`（role→users delta 寫 `sys_user_role`）—— W-FW5 user→roles 寫入的 delta 體例參照。

## Part A — 使用者角色指派（rust-api only、base-web 0 改動）

### A1 — 讀：`SystemManageUserOutput.user_roles` 真實填充

現況：`SystemManageUserOutput.user_roles` 由 `From<UserWithoutPassword>` 硬寫 `vec![]`。

改法：`From` impl 無 DB 存取、無法查角色 → **由 getUserList 的 systemManage transform 路徑填充** —— handler / service 取得 user list 後，為清單內每個 user 查 `sys_user_role JOIN sys_role` 取 role **code** 集合，填入各筆 `user_roles`。建議**批次查詢**（一次撈清單所有 user 的關聯，記憶體內 group by user_id）避免 N+1。`user_roles` 內容為 role **code** 清單（對齊 base-web NSelect value = roleCode、與 `get_user_roles` 一致）。

### A2 — 寫入 DTO：transform DTO 補 `user_roles`

`SystemManageAddUserInput` / `SystemManageUpdateUserInput`（`server/model/src/admin/input/sys_user.rs`）補欄位：

| DTO | 新增欄 | 說明 |
|---|---|---|
| `SystemManageAddUserInput` | `user_roles: Vec<String>` | base-web drawer 送出的 role code 清單；`#[serde(rename_all="camelCase")]` 收 `userRoles` |
| `SystemManageUpdateUserInput` | `user_roles: Vec<String>` | 同上 |

> 現況 serde 靜默忽略 `userRoles` —— 補欄後才真正收下。

### A3 — 寫入：user→roles delta service

新增一個 service 方法（置 `sys_user_service.rs`，比照 `assign_users` 的 delta 體例、user→roles 方向）：

- 簽章概念：`assign_roles_to_user(user_id: String, role_codes: Vec<String>, actor: &Actor)`。
- 邏輯：role code → role id 解析（查 `sys_role`，無效 code → 拒絕，對應 spec E-6）→ 撈該 user 既有 `sys_user_role` → 算 new / to-delete → `insert_many` / `delete_many` → **同一 transaction 內 `audit_log::write_in_txn`**（Constitution II：新寫入路徑必含 audit；entity 類型如 `sys_user_role`、payload before/after 為角色集合）→ commit。
- 空 `role_codes` 為合法（清空該 user 全部角色，對應 spec E-2）。

transform handler（`sys_system_manage_api.rs` 的 `add_user_for_systemmanage` / `update_user_for_systemmanage`）：呼既有 `create_user` / `update_user` 後，續呼 `assign_roles_to_user(user_id, input.user_roles, actor)`。

> create_user / update_user 與 assign_roles_to_user 各自 transaction（同 `assign_users` 體例）；跨方法非單一 atomic，admin 低頻操作可接受、失敗可重編輯。domain 由 actor 注入。

## Part B — 密碼 UX

### B1 — `update_user` 密碼 hash 修正（rust-api native bug fix）

`sys_user_service.rs:211-213`：`if let Some(pw) = input.password { user.password = Set(pw); }`（明文，帶 `// TODO`）→ 改為 `user.password = Set(SecureUtil::hash_password(pw.as_bytes())?)`，與 `create_user` 一致。範圍：該一處 password 分支。

### B2 — admin 設定 / 重設密碼（drawer password 欄 + transform DTO）

- **transform DTO**：`SystemManageAddUserInput` / `SystemManageUpdateUserInput` 補 `password: Option<String>`（收 `password`）。
- **addUser transform**：`input.password` 為 `Some` → 用該值；`None` → 沿 W-FW1 既有預設密碼（`123456`）。
- **updateUser transform**：`input.password` 原樣傳入 `UpdateUserInput.password`（`Some` → 經 B1 修正後正確 hash 寫入；`None` → `update_user` 不動 password 欄，既有行為）。
- **base-web `user-operate-drawer.vue`**：表單加一個**選填** password 欄（naive-ui `NInput type="password"`）；`model` 加 `password`；`handleSubmit` 送出帶 `password`（留空則不送 / 送空字串由 transform 視為未提供 —— 實作擇一、空字串等同 `None`）。建立模式可填、編輯模式留空＝不改。

### B3 — 使用者自助修改密碼（changePassword 端點 + user-center 面板）

**B3a — `ChangePasswordInput` DTO**（rust-api，置 auth 相關 input 模組）：
`current_password: String` / `new_password: String`，`#[serde(rename_all="camelCase")]`（收 `currentPassword` / `newPassword`），`#[derive(Validate)]` 加長度約束（比照既有密碼 min 長度）。

**B3b — `change_password` service**（`sys_auth_service.rs`）：
`change_password(user_id, current_password, new_password)` —— 撈 user → `SecureUtil::verify_password(current_password, user.password)` 驗舊密碼（錯 → 回密碼錯誤 error，對應 E-5）→ `SecureUtil::hash_password(new_password)` → transaction 內 update `sys_user.password` + `audit_log::write_in_txn`（Constitution II）→ commit。

**B3c — route + handler**：
`POST /auth/changePassword`，掛 `sys_authentication_route.rs` 的 `init_protected_router`（JWT 保護）。handler（`sys_authentication_api.rs`）extractor：`Extension<User>`（取 `user.user_id()` 當「我是誰」）+ `Extension<Arc<SysAuthService>>` + `Json<ChangePasswordInput>` → 呼 `change_password` → `Res<bool>` 或 `Res<()>`。

**B3d — Casbin seed（條件性）**：
`/auth/changePassword` 應任何已登入 user 可呼叫。實作期查證 `/auth/getUserInfo`（同 protected router）在 `casbin_rule` 的處理：若 protected router 受 Casbin enforce 且 getUserInfo 有 all-role `p` policy → 比照補 `/auth/changePassword` 的 Casbin seed migration（全 role allow、`POST`）；若 protected router 不受 enforce → 無需 seed。

**B3e — base-web `user-center/index.vue`**：
占位頁（`<LookForward/>`）補成一個最小「修改密碼」面板 —— `NForm` 含舊密碼 / 新密碼 / 確認新密碼三個 `NInput type="password"`；送出前驗新密碼 == 確認（FR-012、不一致阻擋）；呼 `fetchChangePassword`；`if (error) return`、成功 `$message.success`。

## base-web service function

`src/service/api/system-manage.ts`（或既有 auth service 檔，依 changePassword 歸屬）：

- `fetchChangePassword(data)` → `POST /auth/changePassword`，body `{ currentPassword, newPassword }`。
- `fetchAddUser` / `fetchUpdateUser` 既有 service function的 inline 參數型別補**選填** `password`（型別在 `system-manage.ts` 內、非 `src/typings`，§4 准動）。

> base-web 不改 `src/typings`；`userRoles` 既有型別（`User.userRoles: string[]`）沿用。
