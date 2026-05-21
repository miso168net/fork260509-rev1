# Research: W-FW1 — user-crud-wiring

**Phase**: 0（Outline & Research）
**Date**: 2026-05-22

Brainstorm（`docs/superpowers/031-feature-user-crud-wiring.md`）已 saturated 3 個釐清拍板;Phase 0 對 rust-api + base-web worktree 調查,解實作定位與 1 個實作機制（A-006 password-optional）。

---

## R-Q1: transform handler 與 alias input DTO 置放

**Question**: addUser / updateUser 的 base-web-shaped input DTO 與 transform handler 放哪個檔?

**Evidence**:
- F9 `systemManage-alias-router` 的 alias 專屬 handler（`list_users_for_systemmanage` 等）置於 `server/api/src/admin/sys_system_manage_api.rs`。
- F9 的 alias 專屬 DTO（`DeleteUserByBodyInput` / `BatchDeleteUserInput`）置於 `server/model/src/admin/input/sys_user.rs`。
- `sys_system_manage_route.rs:104-105`:`addUser` / `updateUser` alias **目前直接 mount** `SysUserApi::create_user` / `SysUserApi::update_user`。

**Decision**:
- `SystemManageAddUserInput` / `SystemManageUpdateUserInput` DTO → `model/src/admin/input/sys_user.rs`（比照 F9 alias DTO 同檔）。
- transform handler（`add_user_for_systemmanage` / `update_user_for_systemmanage`）→ `api/src/admin/sys_system_manage_api.rs`（比照 F9 alias handler 同檔）。
- `sys_system_manage_route.rs` 的 `addUser` / `updateUser` route 改 mount 新 transform handler（`deleteUser` / `batchDeleteUser` 維持 mount 既有 `delete_user_by_body` / `batch_delete_users`、不改）。

**Rationale**: 與 F9 alias 體例一致、無新 crate / 模組。

---

## R-Q2: `updateUser` password-optional 實作機制（解 spec A-006）

**Question**: base-web 編輯抽屜無密碼欄,`updateUser` 如何「不送密碼則不改密碼」?

**Evidence**:
- `UserInput`（`input/sys_user.rs`）`password: String` 必填、`#[validate(length(min=6,max=100))]`。`CreateUserInput = UserInput`;`UpdateUserInput { id, #[serde(flatten)] user: UserInput }`。
- `create_user`（service）`password: Set(SecureUtil::hash_password(input.password...))` —— 建立時 hash。
- `update_user`（service）`user.password = Set(input.user.password)` —— **直接 Set 原值、未 hash**（既有 `// TODO: should hash` pre-existing 痕,已登 INTEGRATION-CHECKLIST W-FW1-N2）。

**Decision**: W-FW1 修改 update 路徑支援 optional password:
- `UpdateUserInput` **改為不 flatten `UserInput`** —— 給獨立欄位集,其中 `password: Option<String>`。`CreateUserInput`(=`UserInput`,`password: String` 必填）**不變**。
- `update_user` service:`if let Some(pw) = input.password { user.password = Set(pw); }` —— `None` 則完全不 touch `password` 欄。
- 原生 `/user` PUT（用 `UpdateUserInput`）連帶獲得「不送 password 則不改」的 PATCH 語意 —— 為 benign 改進:無 base-web consumer（base-web user 模組走 systemManage),DESIGN-B §7 D-7 驗證走 `DELETE /user/:id`、未走原生 PUT,故不影響已驗證行為。

**Rationale**: 「修改既有共用結構以適應需求」與 F030（三 Output DTO `status` 型別 `Status→String`）同精神、改動最小（un-flatten + 一個 `if let`）。比「alias 專屬 update 路徑複製 `update_user` 全套 txn+audit 邏輯」乾淨。

**Alternatives considered**:
- alias transform 抓既有 password hash 回填 → 依賴 `update_user` 不 hash（W-FW1-N2 會修掉 TODO),產生隱性耦合,否決。
- 新增 `update_user_profile` 服務方法 → 複製 ~30 行 txn/audit/before-load,否決。

> **註**:W-FW1 不順手修 `update_user` 的「password 未 hash」TODO —— 那屬 W-FW1-N2 password UX follow-up 範疇;W-FW1 只加 optional 條件式,維持既有（未 hash）行為。

---

## R-Q3: base-web service function 體例

**Evidence**: `system-manage.ts` 既有 `fetchGetRoleList` 等:`request<T>({ url: '/systemManage/...', method: 'get', params })`、`import { request } from '../request'`。

**Decision**: 新增 4 個寫入 service function 比照同檔體例:
- `fetchAddUser(data)` → `request({ url: '/systemManage/addUser', method: 'post', data })`
- `fetchUpdateUser(data)` → `request({ url: '/systemManage/updateUser', method: 'post', data })`（`updateUser` alias 既有 method 為 `POST`,per F030 C-V9 註記)
- `fetchDeleteUser(data)` → `request({ url: '/systemManage/deleteUser', method: 'delete', data })`
- `fetchBatchDeleteUser(data)` → `request({ url: '/systemManage/batchDeleteUser', method: 'delete', data })`

送出 payload 為 base-web drawer model（值轉換在後端 transform handler);`userRoles` 等多餘欄由後端 DTO serde 自動忽略。

---

## R-Q4: base-web `handleSubmit` / delete handler 接線

**Evidence**:
- `user-operate-drawer.vue`:`handleSubmit` 現為 `await validate(); $message.success; closeDrawer; emit('submitted')`;`model` 為 `Pick<User,...>`(不含 id);`props.operateType`（`add`/`edit`）;`props.rowData`（edit 時含 id）。
- `user/index.vue`:`useTableOperate` hook 提供 `operateType / editingData / handleAdd / handleEdit / checkedRowKeys / onBatchDeleted / onDeleted`;`handleDelete(id)` / `handleBatchDelete()` 現為 `console.log` + `onDeleted()` / `onBatchDeleted()`。

**Decision**:
- `handleSubmit`:`await validate()` 後依 `props.operateType` 呼 `fetchAddUser(model)` 或 `fetchUpdateUser({ ...model, id: props.rowData.id })`;檢 `error` —— 成功則 `$message.success` + `closeDrawer` + `emit('submitted')`,失敗顯示 error 不關抽屜。
- `handleDelete(id)`:`fetchDeleteUser({ id })` → 成功 `onDeleted()`。
- `handleBatchDelete()`:`fetchBatchDeleteUser({ ids: checkedRowKeys.value })` → 成功 `onBatchDeleted()`。
- `onDeleted` / `onBatchDeleted`（hook 內建)已含成功訊息 + 列表 refresh,沿用。

---

## R-Q5: 建立用預設密碼值

**Evidence**: 專案 3 個 seed 帳號（Soybean / Administrator / GeneralUser)皆密碼 `123456`（CLAUDE.md §5.1)；`UserInput.password` validator `min 6`。

**Decision**: `addUser` transform handler 在 base-web 未送 password 時填預設 `"123456"`（滿足 `min 6`、與專案 seed 慣例一致、dev/整合階段合理)。完整密碼 UX（建立時設密碼 / 重設)為 W-FW1-N2 follow-up。

---

## R-Q6: `status` / `gender` 值域對映

**Evidence**: base-web `EnableStatus = '1'|'2'`、`UserGender = '1'|'2'`(可 null);rust `Status`（`enabled`/`disabled`/`banned`)、`Gender`（`male`/`female`)。base-web user drawer 只送 `'1'/'2'`（狀態必填、性別可不選 → null/undefined)。

**Decision**: transform handler 對映:

| 欄 | base-web 值 | rust domain 值 |
|---|---|---|
| status | `"1"` | `Status::Enabled` |
| status | `"2"` | `Status::Disabled` |
| gender | `Some("1")` | `Some(Gender::Male)` |
| gender | `Some("2")` | `Some(Gender::Female)` |
| gender | `None` / 缺 | `None` |

非法值防呆（per spec E-4 / brainstorm R-4）:`status` 非 `"1"/"2"` → 回欄位驗證錯誤 envelope（不 panic);`userGender` 非 `"1"/"2"` 且非空 → 同樣回驗證錯誤。base-web 正常只送合法值,此為防禦性處理。

---

## Phase 0 完成標誌

- ✅ R-Q1 transform handler / alias DTO 置放（比照 F9）
- ✅ R-Q2 `updateUser` password-optional —— 改 `update_user` + `UpdateUserInput`（un-flatten、`Option<password>`)
- ✅ R-Q3 base-web service function 體例
- ✅ R-Q4 base-web handleSubmit / delete handler 接線
- ✅ R-Q5 預設密碼 `123456`
- ✅ R-Q6 status / gender 值域對映表

**無 spec correction** —— spec A-006 的 password-optional 機制由 R-Q2 定案。關鍵 gotcha:`UpdateUserInput` 需 un-flatten 才能讓 update 的 password 獨立為 optional 而不影響 `CreateUserInput`;原生 `/user` PUT 連帶 PATCH 語意化、為 benign。
