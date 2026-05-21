# 031 — W-FW1 user-crud-wiring（base-web user CRUD 接線）

**Date**: 2026-05-22
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-22（DESIGN-W-WEBUI 軌道第一個 feature；3 個釐清問題）

> 軌道:**W-WEBUI**（[`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §5.1）。前置 Constitution Principle IV amendment 已於 2026-05-22 落地（v1.1.0）—— W-FW1 是 amendment 後第一個合法行使「W-WEBUI 受管例外」的 feature。

---

## 緣由

F14 cutover + F030 後對 base-web 的全功能稽核發現:管理後台 23 個操作表單僅 3 個真正接 rust-api,其餘為 UI stub。W-WEBUI 軌道把管理後台從「看得到、改不了」補成可用 CRUD,切為 4 個 feature。**W-FW1 是其中第一個 —— base-web `manage/user` 的 新增 / 編輯 / 刪除 / 批次刪除接線。**

base-web `example` 分支的 user 操作表單現況(2026-05-22 探勘):
- `user-operate-drawer.vue` 的 `handleSubmit` 是 stub:`await validate()` → `$message.success` → 關抽屜,**不打 API**。
- `user/index.vue` 的 `handleDelete` / `handleBatchDelete` 是 stub:只 `console.log` + `onDeleted()`。
- `service/api/system-manage.ts` 只有 user 的 GET（`fetchGetUserList`），無寫入 function。

rust-api 後端的 `/systemManage/{addUser,updateUser,deleteUser,batchDeleteUser}` alias 端點 F9 已交付、F030 已補 gender 寫入,DESIGN-B §7 回歸驗證(D-7/D-8)確認運作 —— 但探勘發現 base-web drawer 表單模型與 rust `UserInput` 契約**有實質落差**,W-FW1 並非 DESIGN-W-WEBUI §5.1 原寫的「後端分量:零」。

### 契約落差盤點

| 欄位 | base-web drawer model | rust `CreateUserInput` | 落差 |
|---|---|---|---|
| 帳號 | `userName` | `username` | 欄位名 |
| 密碼 | （無此欄） | `password` 必填、min 6、hash | drawer 無 password 欄 |
| domain | （無） | `domain` 必填 | drawer 無、需給 `built-in` |
| 暱稱 | `nickName` | `nickName` | ✓ |
| email | `userEmail` | `email` | 欄位名 |
| 電話 | `userPhone` | `phoneNumber` | 欄位名 |
| 狀態 | `status: '1'/'2'` | `status: Status`（`enabled`/`disabled`） | 值域 |
| 性別 | `userGender: '1'/'2'/null` | `gender: Gender`（`male`/`female`） | 值域 |
| 角色 | `userRoles: string[]` | （無 roles 欄） | addUser/updateUser 不收 roles |

另:`UpdateUserInput` flatten 了必填 `password`,編輯時 drawer 同樣無 password 可送。

---

## Brainstorm 釐清紀錄（Session 2026-05-22）

- **Q1（形狀對齊放哪）**:write-path 的欄位名 / 值域對齊 → **A: 後端 systemManage alias 轉換層**。`addUser`/`updateUser` alias 改為有專屬 base-web-shaped input DTO + 薄 transform handler，轉成既有 `CreateUserInput`/`UpdateUserInput` 呼叫既有 service。與 F030「output 端 `map_status` 在後端」對稱、符 Constitution IV「後端適應 base」。
- **Q2（建立密碼）**:drawer 無 password 欄 → **A: 後端預設密碼**。`addUser` transform handler 在 base-web 未送 password 時塞固定預設密碼（與專案 seed 帳號一致）。drawer 零改、純接線。改密碼 / 重設密碼 UX 列為另案。
- **Q3（userRoles）**:`SystemManageUserOutput.user_roles` 硬寫 `vec![]`、rust 無「設定 user 的 roles」寫入路徑（`assign_users` 為 role→users 反方向）—— userRoles 讀寫整條未接 → **A: W-FW1 不處理 roles**。接它需 `sys_user_role` 讀+寫+Casbin `g` rule 同步,為獨立 feature 體量。drawer 的 `userRoles` 欄提交時由後端 transform DTO 忽略（serde 自動忽略未知欄）。user-role 指派另立 follow-up（見 §範圍外、已登 INTEGRATION-CHECKLIST）。

---

## Scope summary

W-FW1 = base-web `manage/user` 的 4 個操作（新增 / 編輯 / 刪除 / 批次刪除）端到端接上 rust-api。前端接線 + 後端 alias 轉換層。

| 面向 | deliverable |
|---|---|
| **新增 / 編輯** | base-web drawer `handleSubmit` 接 `/systemManage/{addUser,updateUser}`;後端 alias 加 base-web-shaped input DTO + transform handler（欄位名 / 值域對齊、domain 預設、password 預設或 optional）。 |
| **刪除 / 批次刪除** | base-web `handleDelete` / `handleBatchDelete` 接 `/systemManage/{deleteUser,batchDeleteUser}`;後端既有 alias `{id}` / `{ids}` 形狀已適用、**不改**。 |

---

## 設計

### 後端（rust-api worktree）

- 新增 2 個 base-web-shaped input DTO（置 `model/src/admin/input/`,比照 F9 alias 既有體例）:
  - `SystemManageAddUserInput`:`userName` / `userGender: Option<String>` / `nickName` / `userPhone: Option<String>` / `userEmail: Option<String>` / `status: String`（camelCase、serde 自動忽略 `userRoles` 等未知欄）。
  - `SystemManageUpdateUserInput`:同上 + `id: String`。
- `addUser` alias 改 mount **薄 transform handler**:DTO → `CreateUserInput`
  - `userName→username`、`userPhone→phoneNumber`、`userEmail→email`
  - `status`:`"1"→Status::Enabled`、`"2"→Status::Disabled`
  - `userGender`:`Some("1")→Some(Male)`、`Some("2")→Some(Female)`、`None→None`
  - `domain`:預設 `"built-in"`
  - `password`:未提供 → 固定預設密碼
  - → 呼既有 `create_user` service（audit / 密碼 hash 既有路徑沿用）
- `updateUser` alias 同型 transform handler;**`password` optional** —— 未提供則不動 `password` 欄。
- `deleteUser` / `batchDeleteUser` alias **不改**。
- 無 migration;Casbin p-rule 既有（alias path 不變、enforcement 自動沿用）。

### 前端（base-web worktree）

- `service/api/system-manage.ts` 補 `fetchAddUser` / `fetchUpdateUser` / `fetchDeleteUser` / `fetchBatchDeleteUser` —— 薄 `request()`、直送 drawer model（值轉換在後端）。
- `user-operate-drawer.vue` `handleSubmit` —— 依 `operateType` 呼 add / update;edit 的 `id` 取自 `props.rowData.id`（Model 型別 `Pick` 不含 id）;處理成功 / 失敗訊息、`emit('submitted')` 觸發列表 refresh。
- `user/index.vue` `handleDelete` → `fetchDeleteUser({ id })`;`handleBatchDelete` → `fetchBatchDeleteUser({ ids: checkedRowKeys })`。
- 不動型別定義、表格 render、`src/router` / `src/store`、i18n key、UI 樣式（W-WEBUI §4 邊界）。

### 錯誤處理

- `request` helper 回 `{ data, error }`;`handleSubmit` / delete handler 檢 `error`,失敗顯示後端 envelope `msg`、不關抽屜 / 不 refresh。
- drawer 既有 `validate()`（`userName` / `status` 必填）維持。

### 測試 / 驗收

- **CDP**（`127.0.0.1:9229`）:走訪 `/manage/user` —— 建立 user、編輯、單筆刪除、批次刪除,每步驟確認列表 refresh + 無 console error。
- **curl**:直打 4 個 alias 端點驗 envelope。
- **psql**:驗 create 落 DB（含預設密碼 hash）、update 生效、delete 為 soft delete（`deleted_at` 標記、row 留表）、audit log 同步寫入。

### Commit 模型

W-FW1 同時動 base-web + rust-api 兩個 worktree:
- Stage 1a — rust-api worktree commit（alias DTO + transform handler）
- Stage 1b — base-web worktree commit（service function + handleSubmit + delete handler）
- Stage 2 — outer commit（兩個 SHA pin + spec docs）

（W-WEBUI §6「兩 worktree」情形;push 等 user 同意。）

### Constitution Check（初判）

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | PASS | alias path 不變、Casbin enforce 不動 |
| II | Soft Delete + Audit | PASS | delete 走既有 soft-delete service;create/update 既有 audit hook 沿用 |
| III | 嚴版禁 Forward | PASS | 單後端、無服務間 forward |
| IV | base 不改動邊界 | **PASS（W-WEBUI 受管例外）** | W-FW1 修改 base-web `system-manage.ts` + `user-operate-drawer.vue` handleSubmit + `user/index.vue` delete handler,全在 constitution v1.1.0 Principle IV「受管例外 — W-WEBUI 軌道」+ DESIGN-W-WEBUI §4 受控範圍內 |
| V | 漸進收縮 | N/A | DESIGN-B 形態 |

---

## 範圍外

- ❌ **userRoles 接線**（讀 + 寫 + Casbin `g` rule 同步）—— 整條未接、為獨立 feature 體量,另立 follow-up。drawer 的 roles 欄 W-FW1 提交時被後端忽略。已登 INTEGRATION-CHECKLIST「Deferred / future backlog」。
- ❌ **password UX**（改密碼 / 重設密碼流程、drawer password 欄）—— W-FW1 用後端預設密碼,完整密碼 UX 另案。已登 INTEGRATION-CHECKLIST。
- ❌ base-web 型別 / render / router / store 改動。
- ❌ role / menu 模組接線（W-FW2 / W-FW3 / W-FW4 範疇）。

---

## 待 `/speckit-specify` 後續釐清（brainstorm 已 saturated、列為 research 點）

- **R-1**:`updateUser` 的 password-optional 實作機制 —— 改既有 `update_user` service 成 `Option<password>`,vs alias 專屬 update 路徑（不重用 `update_user`）。Phase 0 對 `sys_user_service.rs` 調查後定。
- **R-2**:base-web `request` helper 對「HTTP 200 + body `code≠0`」的錯誤呈現慣例 —— 確認 `handleSubmit` 失敗訊息走既有 base-web error 機制、無需動型別。
- **R-3**:預設密碼的具體值 / 來源（固定字串 vs env vs 既有 seed 慣例）。
- **R-4**:transform handler 的 `status` 非 `"1"/"2"` 值（理論上 base-web 只送這兩種）、`userGender` 非法值的防呆策略。
