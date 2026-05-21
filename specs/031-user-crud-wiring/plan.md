# Implementation Plan: W-FW1 — user-crud-wiring（base-web user CRUD 接線）

**Branch**: `031-user-crud-wiring` | **Date**: 2026-05-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/031-user-crud-wiring/spec.md`

## Summary

W-WEBUI 軌道第一個 feature —— 把 base-web `manage/user` 的新增 / 編輯 / 刪除 / 批次刪除 4 個 stub 操作接上 rust-api。兩部分:

- **後端（rust-api worktree）— systemManage alias 轉換層**:`/systemManage/addUser`、`/systemManage/updateUser` 改 mount **薄 transform handler** —— 新增 base-web-shaped input DTO（`SystemManageAddUserInput` / `SystemManageUpdateUserInput`），把 base-web 表單形狀（`userName` / `userGender` `'1'/'2'` / `userPhone` / `userEmail` / `status` `'1'/'2'`）對應為後端 domain 形狀（`username` / `gender` enum / `phoneNumber` / `email` / `status` enum），補 `domain` 預設、`password` 預設（建立）/ optional（編輯）,呼既有 `create_user` / `update_user`。`deleteUser` / `batchDeleteUser` alias 不改（既有 `{id}` / `{ids}` 形狀已適用）。
- **前端（base-web worktree）— 接線**:`service/api/system-manage.ts` 補 4 個寫入 service function;`user-operate-drawer.vue` `handleSubmit` 接 add / update;`user/index.vue` `handleDelete` / `handleBatchDelete` 接 delete / batchDelete。

**Phase 0 research 關鍵發現**:`updateUser` 因 base-web 無密碼欄,後端 update 路徑須支援 optional password —— 決議修改 `update_user` 服務 + `UpdateUserInput` 使 password 為 `Option<String>`（不送則不動 password 欄）;原生 `/user` PUT 連帶獲得 benign PATCH 語意（無 base-web consumer、不影響 DESIGN-B §7 已驗證行為,§7 D-7 未走原生 PUT）。

**多段式 commit**:base-web worktree commit + rust-api worktree commit + outer。**無 migration**。

## Technical Context

**Language/Version**: Rust（rust-api worktree）+ TypeScript / Vue 3（base-web worktree）
**Primary Dependencies**: 無新增 —— rust 端 `axum` / `sea-orm` / 既有 `server-model`·`server-api`·`server-service`·`server-router`;base-web 端既有 `@/service/request`、Naive UI、`useTableOperate` hook
**Storage**: PostgreSQL —— **無 schema 改動、無 migration**;`update_user` 僅服務層邏輯調整（password 條件式 Set）
**Testing**: rust 端無新純函式（transform 為形狀對映、以 acceptance 覆蓋,比照 F8/F13 wiring feature 慣例）;acceptance = CDP browser smoke + curl + psql（per spec FR-020）
**Target Platform**: Linux container — rust-api docker image + base-web docker image + postgres
**Project Type**: web —— frontend（base-web worktree）+ backend（rust-api worktree）雙 worktree feature
**Performance Goals**: N/A — admin CRUD、無效能面
**Constraints**: base-web 改動限 W-WEBUI §4 受控範圍（user 模組 service/api + drawer handleSubmit + index delete handler）;不改型別 / render / router / store / i18n;不改 Casbin policy seed;不動 nestjs fork
**Scale/Scope**: rust-api worktree 4 檔改（input DTO `sys_user.rs` + `update_user` service + alias handler `sys_system_manage_api.rs` + route `sys_system_manage_route.rs`）;base-web worktree 3 檔改（`system-manage.ts` + `user-operate-drawer.vue` + `user/index.vue`）;無新 crate、無 migration

無 NEEDS CLARIFICATION —— spec 0 marker、`/speckit-clarify` 0 question（taxonomy 全 Clear）、Phase 0 research 6 個 R-Q 已解。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | `/systemManage/{addUser,updateUser,deleteUser,batchDeleteUser}` alias path 不變、Casbin enforcement 自動沿用;transform handler 在 enforcement 之後 |
| II | Soft Delete + Audit | **PASS** | delete 走既有 soft-delete service;create / update 既有 `audit_log::write_in_txn` hook 沿用（transform handler 只調整輸入形狀、不繞 audit） |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | 純 rust 單後端、無服務間 forward |
| IV | base 不改動邊界 | **PASS（W-WEBUI 受管例外）** | W-FW1 修改 base-web `system-manage.ts` + `user-operate-drawer.vue` handleSubmit + `user/index.vue` delete handler —— 全在 constitution v1.1.0 Principle IV「受管例外 — W-WEBUI 軌道」+ DESIGN-W-WEBUI §4 受控範圍內;不碰型別 / render / router / store |
| V | 漸進收縮 | **N/A** | DESIGN-B（rust-only）形態,非 DESIGN-A→B 遷移範疇 |

**架構約束檢查**:
- **資料庫**:無 migration、無 schema 改 —— `update_user` 僅服務層邏輯（password 條件式）— PASS
- **快取 / pub-sub / TLS / Secret / Port / Observability / Backup / 背景工作 / CI-CD / 部署形態**:皆不碰 — N/A

**Gate 結果**:**4 PASS / 1 N/A / 0 violation** —— Constitution Check 通過、無需 Complexity Tracking。本 feature 為 Constitution v1.1.0「W-WEBUI 受管例外」的首次行使。

## Project Structure

### Documentation (this feature)

```text
specs/031-user-crud-wiring/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔（/speckit-plan）
├── research.md          # Phase 0 — R-Q1~R-Q6 ✓
├── data-model.md        # Phase 1 — E1~E6 變更模型 ✓
├── quickstart.md        # Phase 1 ✓
├── contracts/
│   └── verification-commands.md   # Phase 1 — C-V1~C-V11 ✓
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出（本指令不產）
```

### Source（雙 worktree）

```text
# rust-api worktree
rust-api/server/model/src/admin/input/sys_user.rs              # E1:SystemManageAddUserInput / SystemManageUpdateUserInput DTO；UpdateUserInput password→Option
rust-api/server/service/src/admin/sys_user_service.rs          # E2:update_user password 條件式 Set
rust-api/server/api/src/admin/sys_system_manage_api.rs         # E3:addUser / updateUser transform handler
rust-api/server/router/src/admin/sys_system_manage_route.rs    # E4:addUser / updateUser route → 新 transform handler

# base-web worktree
base-web/src/service/api/system-manage.ts                      # E5:fetchAddUser / fetchUpdateUser / fetchDeleteUser / fetchBatchDeleteUser
base-web/src/views/manage/user/modules/user-operate-drawer.vue # E6:handleSubmit 接 add / update
base-web/src/views/manage/user/index.vue                       # E6:handleDelete / handleBatchDelete 接 delete / batchDelete
（無 migration、無 base-web 型別 / render / router / store 改、不動 nestjs）
```

**Structure Decision**: 雙 worktree feature —— 後端 systemManage alias 轉換層（rust-api worktree、~5 檔改）+ 前端接線（base-web worktree、3 檔改）。比照 F9 alias 體例（transform handler 置 `sys_system_manage_api.rs`、alias DTO 置 `input/sys_user.rs`）。多段式 commit:Stage 1a rust-api worktree、Stage 1b base-web worktree、Stage 2 outer（兩 SHA pin + spec docs）。

## Phase 0: research（見 [research.md](research.md)）

Phase 0 對 rust-api + base-web worktree 調查,解 6 個 R-Q:
- R-Q1:transform handler / alias DTO 置放（`sys_system_manage_api.rs` / `input/sys_user.rs`,比照 F9）
- R-Q2:`updateUser` password-optional —— 改 `update_user` + `UpdateUserInput` 為 `Option<password>`
- R-Q3:base-web service function 體例（`request<T>({url,method,data})`）
- R-Q4:base-web `handleSubmit` / delete handler 接線寫法（`useTableOperate` hook）
- R-Q5:建立用預設密碼值（`123456`,專案 seed 慣例）
- R-Q6:`status` / `gender` 值域對映表（`'1'→Enabled` / `'2'→Disabled`、`'1'→Male` / `'2'→Female` / `null→None`）

## Phase 1: Design & Contracts（見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md)）

- **data-model.md**:E1 alias DTO + `UpdateUserInput` / E2 `update_user` password 條件式 / E3 transform handler / E4 route / E5 base-web service function / E6 base-web handleSubmit + delete handler;含變更後 data flow。
- **contracts/verification-commands.md**:C-V1~C-V11 —— image rebuild / dev stack / curl addUser·updateUser·deleteUser·batchDeleteUser / 形狀對映驗 / soft delete 驗 / audit 驗 / Casbin deny / CDP smoke（建立·編輯·刪除·批次刪除）/ 三邊 scope。
- **quickstart.md**:落地操作（改動清單 + 實作順序 + build/驗證 + 多段式 commit）。

**Constitution Re-check（post-design）**:Phase 1 設計後重新檢查 —— data-model E1-E6 確認:base-web 改動限 §4 受控範圍（IV W-WEBUI 例外）;`update_user` 調整無 schema 改、audit hook 不受影響（II）;alias path / Casbin 不動（I）;無服務間 forward（III）。**4 PASS / 1 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
