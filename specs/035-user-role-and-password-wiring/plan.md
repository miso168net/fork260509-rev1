# Implementation Plan: W-FW5 — user-role-and-password-wiring

**Branch**: `035-user-role-and-password-wiring` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-user-role-and-password-wiring/spec.md`

## Summary

補完 W-FW1 (user-crud-wiring) 留下的兩塊 user 管理缺口。**Part A 使用者角色指派**：base-web user drawer 的 `userRoles` 多選欄 UI 已接線、缺口全在後端 —— rust-api 補 `SystemManageUserOutput.user_roles` 真實填充（讀）、addUser/updateUser transform DTO 收 `userRoles` 並 delta 寫 `sys_user_role`（寫）；不需同步 Casbin `g`（R-Q1：enforcement 用 JWT role、JWT role 登入時查 `sys_user_role`）。**Part B 密碼 UX**：修 `update_user` 密碼未 hash 的 pre-existing bug（B1）；user drawer 加選填 password 欄（B2，建立設初始 / 編輯重設）；新增 `POST /auth/changePassword` 自助改密碼端點 + base-web `user-center` 補修改密碼面板（B3）。base-web 改動限 §4（含 2026-05-22 W-FW5 amendment 授權的最小 UI 新增）。比照 W-FW1~W-FW4 接線模式。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM，rust-api worktree）/ TypeScript + Vue 3 + naive-ui（base-web worktree）
**Primary Dependencies**: axum router、Sea-ORM、Argon2（`SecureUtil`）、Casbin enforcement；base-web `request` helper、naive-ui NDrawer / NSelect / NForm / NInput
**Storage**: PostgreSQL —— `sys_user_role`（user↔role M:N 關聯表）、`sys_user`、`sys_role`、`sys_operation_log`（audit）、`casbin_rule`（端點授權政策）
**Testing**: acceptance-only —— CDP browser smoke + curl + psql；wiring / 形狀對映類 feature，無新純函式單元測試（密碼 hash 沿用既有 `SecureUtil`、delta 對映比照 `assign_users`，正確性由 acceptance 的 psql hash 格式檢查 + curl 登入驗證覆蓋，比照 W-FW1~W-FW4 慣例）
**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis）
**Project Type**: web —— rust-api backend + base-web frontend，雙 worktree
**Performance Goals**: N/A（admin 管理操作、低 throughput）
**Constraints**: W-WEBUI §4 base-web 修改邊界（含 2026-05-22 W-FW5 §4 amendment）；多段式 commit（CLAUDE.md §4.1）
**Scale/Scope**: rust-api 9 元件（A1 user_roles 填充 / A2 transform DTO + userRoles / A3 user→roles delta service / B1 update_user hash 修正 / B2 transform DTO + password / B3a ChangePasswordInput DTO / B3b change_password service / B3c changePassword route+handler / B3d /auth/changePassword Casbin seed）+ base-web 4 檔（user-operate-drawer.vue / user-center/index.vue / system-manage.ts / auth.ts）

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。對照 `.specify/memory/constitution.md` v1.2.0。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | 角色指派寫 `sys_user_role`（RBAC 事實源）；enforcement 經既有「登入查 `sys_user_role` → JWT 帶 role → Casbin enforce」鏈路（R-Q1），W-FW5 不改此鏈、不需補 Casbin `g`。`/auth/changePassword` 自助端點掛 JWT-protected router；其 Casbin 處理比照同 router 的 `/auth/getUserInfo`（實作期查證）。前端不做 access control。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | W-FW5 的 user→roles 寫入為**新寫入路徑** → 依 II「所有寫入 MUST 寫 `sys_operation_log`、業務 + audit 同 transaction」**必須含 audit**（不沿用 F8 `assign_users` 未稽核的 pre-existing gap）。自助改密碼寫入亦同 transaction 內 audit。`update_user` / `create_user` 既有 audit 路徑沿用。`sys_user_role` 為 M:N 關聯表、delta de-association 採 `delete_many`（關聯表慣例、非業務實體軟刪範疇）。 | ✅ PASS（新寫入路徑均含 audit） |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP / RPC。`/systemManage/*` 與 `/auth/*` 由 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW5 屬 **W-WEBUI 軌道受管例外**（Constitution IV，v1.2.0 起列舉含 `W-FW1`–`W-FW7`）。base-web 改動：Part A **0 改動**（drawer 角色欄 W-FW1 已接）；Part B 限 `user-operate-drawer.vue`（加選填 password 欄）、`user-center/index.vue`（占位頁補修改密碼面板）、service function 檔 —— 前二者為 §4「2026-05-22 W-FW5 amendment」明文授權的「為接通既有後端能力所必需的最小 UI 新增」。不碰型別定義 / 表格 render / router / store / i18n / 版面重構。 | ✅ PASS（行使 v1.2.0 W-WEBUI 受管例外；UI 新增在 §4 amendment 明文授權內） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態）；rust-only。DB schema **零結構變更**（`sys_user_role` 既有；唯一 DB 變動為 `/auth/changePassword` 的 Casbin policy seed migration）。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。

> **註 — Constitution Check gate 歷程**：本 feature 首次 `/speckit-plan` 於 Principle IV 卡 gate —— 當時 Constitution IV（v1.1.0）列舉僅 `W-FW1`–`W-FW4`、且內聯限定「僅接線、不得 UI」，W-FW5 不在列舉內且含 UI 新增。已於 2026-05-22 由 `/speckit-constitution` amend 至 **v1.2.0**（軌道列舉擴 `W-FW1`–`W-FW7`、准動範圍納入「§4 授權下必需的最小 UI 新增」）後 gate 通過。Phase 1 設計未引入新 violation，post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/035-user-role-and-password-wiring/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出
├── research.md          # Phase 0 —— R-Q1（Casbin g 不需同步）/ R-Q2（新增 changePassword 端點）/ R-Q3（update_user hash 修正）resolved
├── data-model.md        # Phase 1 —— transform DTO / user→roles delta / changePassword / base-web UI 新增
├── quickstart.md        # Phase 1 —— dev stack 啟動 + 驗證流程
├── contracts/
│   └── verification-commands.md   # Phase 1 —— C-V acceptance contract
├── checklists/
│   └── requirements.md  # /speckit-specify 產出（16/16 PASS）
└── tasks.md             # /speckit-tasks 產出（非本指令產生）
```

### Source Code (worktree)

```text
rust-api/  (worktree, branch rev1-admin-rust-api)
├── server/model/src/admin/output/sys_system_manage.rs        # A1: SystemManageUserOutput.user_roles 真實填充
├── server/model/src/admin/input/sys_user.rs                  # A2/B2: SystemManageAddUserInput/UpdateUserInput + userRoles + 選填 password
├── server/model/src/admin/input/<auth>.rs                    # B3a: ChangePasswordInput DTO
├── server/api/src/admin/sys_system_manage_api.rs             # A1/A2/A3/B2: add/update/getUserList transform handler 接 userRoles + password
├── server/api/src/admin/sys_authentication_api.rs            # B3c: change_password handler
├── server/service/src/admin/sys_user_service.rs              # B1: update_user 密碼 hash 修正；A3: user→roles delta 寫入 service（或置 authorization service）
├── server/service/src/admin/sys_auth_service.rs              # B3b: change_password service（驗舊 + hash 新 + audit）
├── server/router/src/admin/sys_authentication_route.rs       # B3c: /auth/changePassword route（protected router）
└── migration/src/datas/<...>.rs                              # B3d: /auth/changePassword Casbin seed（3-role allow、POST）

base-web/  (worktree, branch rev1-admin-base-web)
├── src/views/manage/user/modules/user-operate-drawer.vue     # B2/B4: 加選填 password 欄 + handleSubmit 帶 password（userRoles 已 W-FW1 接線、不動）
├── src/views/user-center/index.vue                           # B5: 占位頁補「修改密碼」面板
├── src/service/api/system-manage.ts                          # B6: fetchAddUser/fetchUpdateUser inline 型別補選填 password
└── src/service/api/auth.ts                                   # B6: 新增 fetchChangePassword service function
```

**Structure Decision**: 雙 worktree（rust-api + base-web）。rust-api 9 元件、base-web 4 檔。多段式 commit（worktree commit + push fork → outer 更新 SHA pin）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
