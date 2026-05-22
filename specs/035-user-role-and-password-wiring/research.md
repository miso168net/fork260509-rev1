# Phase 0 Research — W-FW5 user-role-and-password-wiring

spec.md Assumptions A-008 / A-009 列 2 個 plan-phase research question，本檔逐一查證解決。

## R-Q1 — 後端 RBAC 角色解析機制 / 是否需同步 Casbin `g`

- **Decision**: W-FW5 寫 `sys_user_role`（user↔role 關聯）**不需**同步 Casbin `g`（grouping policy）。Part A 寫入只動 `sys_user_role` 表。
- **Rationale**: 實查 rust-api ——
  - **登入**：`sys_auth_service.rs` `verify_user` → `get_user_roles(user_id)`（`~:397-410`）以 `sys_role JOIN sys_user_role JOIN sys_user` 撈該 user 的 role **code** 清單。
  - **JWT**：`core/src/web/auth.rs` `Claims` 帶 `role: Vec<String>`（role code 清單）；登入時即把 `get_user_roles` 結果寫進 JWT。
  - **Casbin enforcement**：`axum-casbin/src/middleware.rs` 對 JWT `role` 清單逐一 `enforce(sub=role_code, domain, path, method)`，比對 `casbin_rule` 的 `ptype='p'` policy。enforcer 的 subject **直接是 JWT 裡的 role code**。
  - **`casbin_rule` 的 `g` row**：migration seed（`m20241024_082926_insert_casbin_rule.rs`）**只有 `ptype='p'`**、0 個 `ptype='g'`。grep `add_grouping_policy` / `add_role_for_user` 全 repo 0 命中 —— Casbin grouping 機制完全未使用。
  - **F8 `assign_users`**（`sys_authorization_service.rs:305-376`）：role→users 指派只 delta 寫 `sys_user_role`、**完全不碰 Casbin** —— 與「不靠 Casbin g」一致。
  - 結論：user→role 對應的事實源是 `sys_user_role` 表；enforcement 經「登入查表 → JWT 帶 role → enforce 用 JWT role」鏈路。W-FW5 寫 `sys_user_role` 後，受影響 user 下次登入 / refresh token 時 `get_user_roles` 重查、新角色自動進 JWT（spec FR-005 / SC-003 即由此既有機制達成）。
- **Note（生效時機）**: 角色變更對「已登入」user 不即時生效 —— 需其重新登入或 refresh token。此為既有 JWT 機制的固有行為、非 W-FW5 引入；spec FR-005 措辭「下一次取得自身權限時」已涵蓋。
- **Alternatives considered**: 寫 `sys_user_role` 同時補 Casbin `g` row → 否決：系統根本不讀 `g`，補了是無作用的死資料、且偏離既有架構。

## R-Q2 — 自助修改密碼端點

- **Decision**: rust-api **無**自助改密碼端點 —— W-FW5 新增 `POST /auth/changePassword`，掛 protected router（JWT 保護）；驗證舊密碼 → hash 新密碼 → 更新。
- **Rationale**: 實查 ——
  - 既有 auth 端點僅 `POST /auth/login`、`POST /auth/refreshToken`（`sys_authentication_route.rs` `init_authentication_router`，nest 於 `/auth`）；protected router（`init_protected_router`，亦 nest `/auth`）有 `getUserInfo` / `sendCaptcha` 等、經 JWT middleware。grep `change.*password` / `modifyPassword` 等 0 命中。
  - 密碼工具 `server/utils/src/secure_util.rs`：`SecureUtil::hash_password(&[u8]) -> String`（Argon2）、`SecureUtil::verify_password(明文, hash) -> bool` —— 兩者皆備、可直接用。
  - 取當前登入身分：handler 以 `Extension<User>` 取（JWT middleware `jwt.rs` 注入 `User`）；`user.user_id()` 即「我是誰」。
  - 端點落點：`/auth/changePassword`，掛 `init_protected_router`（自助操作、需登入；任何已登入 user 皆可改自己的密碼）。route / handler / DTO 體例比照既有 protected router 端點。
- **Casbin（待實作期查證）**: `/auth/changePassword` 為自助、應任何已登入 user 可呼叫。protected router 是否受 Casbin enforce —— 實作時對照 `/auth/getUserInfo`（同 protected router、每個 user 都呼叫）在 `casbin_rule` 的處理：若 getUserInfo 有對應 `p` policy（all role allow）則 changePassword 比照補一筆 Casbin seed；若 protected router 不受 enforce 則無需 seed。此為小範圍實作期查證、不阻擋設計。
- **Alternatives considered**: 把自助改密碼塞進 `/systemManage/updateUser` → 否決：updateUser 是 admin 操作、無舊密碼驗證語意；自助改密碼須驗舊密碼、屬 auth 域。

## R-Q3 — `update_user` 密碼未 hash（實查確認的 pre-existing bug）

- **實查確認**: `sys_user_service.rs:211-213` —— `if let Some(pw) = input.password { /* TODO: ... hash the password */ user.password = Set(pw); }` —— 收到 password **直接存明文**，帶 `// TODO` 註解。對照 `create_user:142` 正確 `Set(SecureUtil::hash_password(...))`。
- **Decision**: W-FW5 修正 —— `update_user` 的 password 分支改為 `Set(SecureUtil::hash_password(pw.as_bytes())?)`，與 `create_user` 一致。
- **Rationale**: W-FW5 的 admin 重設密碼（US2）會經 `update_user` 寫 password —— 此路徑必須先正確 hash 才能交付 US2 / 滿足 FR-009 / SC-006。修正範圍極小（一處）、對既有 caller 零負面影響（現況是 bug，沒有 caller 依賴明文儲存）。`updateUser_for_systemmanage` 現傳 `password: None`、此 bug path 至今未被觸發 —— W-FW5 是第一個會觸發它的 feature，故必須在本 feature 修。

## 既有體例複核（供 plan / tasks 參照）

- **user→role delta 寫入體例**：`assign_users`（`sys_authorization_service.rs:305-376`）—— 撈既有關聯 → 算 new / to-delete → `insert_many` / `delete_many` 於單一 transaction。W-FW5 的 user→roles 寫入比照此體例、方向相反（固定 user_id、變動 role_id 集合）。
- **Audit**：`create_user` / `update_user` 經 `audit_log::write_in_txn` 寫 `sys_operation_log`。**注意**：`assign_users` 本身**未**寫 audit（pre-existing gap、F8 範疇）。W-FW5 的 user→roles 寫入為**新寫入路徑**，依 Constitution II「所有寫入 MUST audit」**必須**含 audit（不沿用 assign_users 的 gap）；自助改密碼亦同。
- **base-web 角色欄**：`user-operate-drawer.vue` 的 `userRoles` 多選欄、`fetchGetAllRoles()` 取選項、`handleSubmit` 送出含 `userRoles`、edit `Object.assign` 預填 —— W-FW1 已完整接線，Part A base-web **0 改動**。`userRoles` 值為 role **code**（NSelect value = roleCode），與 `get_user_roles` 回 role code 一致。
