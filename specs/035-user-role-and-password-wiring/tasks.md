# Tasks: W-FW5 — user-role-and-password-wiring

**Input**: Design documents from `/specs/035-user-role-and-password-wiring/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 無單元測試 task —— wiring / 形狀對映類 feature；密碼 hash 沿用既有 `SecureUtil`、user→roles delta 比照 `assign_users`，正確性由 acceptance（CDP browser smoke + curl + psql，含 psql argon2 hash 格式檢查 + curl 登入驗證）覆蓋。比照 W-FW1（031）/ W-FW2（032）/ W-FW3（033）/ W-FW4（034）慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 角色指派 / US2 admin 密碼 / US3 自助改密碼）。3 個 story 相對獨立、各自可獨立驗收；無跨 story 共用 Foundational 前置（與 W-FW4 不同）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2 / US3）
- 路徑相對 worktree root（`rust-api/` 或 `base-web/`）

---

## Phase 1: Setup

- [ ] T001 確認 worktree 分支正確（`base-web` 在 `rev1-admin-base-web`、`rust-api` 在 `rev1-admin-rust-api`）、dev stack 可 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起（quickstart.md）

---

## Phase 2: Foundational

**無跨 story 共用前置** —— W-FW5 的 3 個 user story 相對獨立（US1 純 rust 後端、US2 含 update_user 修正、US3 自成一條 changePassword 鏈路），無 W-FW4 式的共用 alias 層。直接進 user story phases。

> **檔案重疊提示**：US1 的 T003（DTO 補 `userRoles`）與 US2 的 T009（同檔 DTO 補 `password`）改 `rust-api/server/model/src/admin/input/sys_user.rs` **同一檔**；US1 的 T005 與 US2 的 T010 改 `sys_system_manage_api.rs` 的 `add_user_for_systemmanage` / `update_user_for_systemmanage` **同一組 handler** —— 跨 story 但同檔，實作須序列、不可平行（見 Dependencies）。

---

## Phase 3: User Story 1 — 使用者角色指派 (P1) 🎯 MVP

**Goal**: base-web user 編輯抽屜的角色多選欄真實反映並可變更該使用者的角色集合。
**Independent test**: `/manage/user` 對一 user 開編輯抽屜 → 角色欄勾選與 DB `sys_user_role` 一致；調整送出 → `sys_user_role` delta 正確。
**Note**: 純 rust-api 後端，base-web drawer 角色欄 W-FW1 已接線、本 story base-web 0 改動。

- [ ] T002 [US1] rust-api `SystemManageUserOutput.user_roles` 真實填充：在 `getUserList` 的 systemManage 路徑（`server/api/src/admin/sys_system_manage_api.rs` 的 list users transform handler / 對應 service）為回傳清單的每筆 user **批次查** `sys_user_role JOIN sys_role` 取 role code 集合、填入 `user_roles`（取代 `output/sys_system_manage.rs` `From<UserWithoutPassword>` 硬寫的 `vec![]`）；避免 N+1（一次撈清單所有 user 的關聯、記憶體內 group by user_id）（data-model.md A1）
- [ ] T003 [US1] rust-api `SystemManageAddUserInput` / `SystemManageUpdateUserInput`（`server/model/src/admin/input/sys_user.rs`）各補 `user_roles: Vec<String>` 欄（`#[serde(rename_all="camelCase")]` 收 `userRoles`、現 serde 靜默忽略）（data-model.md A2）
- [ ] T004 [US1] rust-api 新增 user→roles delta service 方法 `assign_roles_to_user(user_id, role_codes, actor)` in `server/service/src/admin/sys_user_service.rs`：role code → role id 解析（查 `sys_role`，無效 code → 拒絕）→ 撈既有 `sys_user_role` → 算 new / to-delete → `insert_many` / `delete_many` + **同 transaction 內 `audit_log::write_in_txn`**（Constitution II，新寫入路徑必含 audit）→ commit；空 `role_codes` 為合法清空。比照 `sys_authorization_service.rs` `assign_users` 的 delta 體例、user→roles 方向（依 T003；data-model.md A3、research.md「既有體例複核」）
- [ ] T005 [US1] rust-api `add_user_for_systemmanage` / `update_user_for_systemmanage`（`server/api/src/admin/sys_system_manage_api.rs`）wiring：呼既有 `create_user` / `update_user` 後續呼 `assign_roles_to_user(user_id, input.user_roles, actor)`（依 T003、T004；data-model.md A3）
- [ ] T006 [US1] rust-api build（`docker build` + `up -d --wait`）（依 T002–T005；quickstart.md）
- [ ] T007 [US1] US1 acceptance：curl getUserList 回傳含真實 `userRoles`（C-V2 對照 psql）；curl updateUser 改 `userRoles` 加/減（C-V3 delta）、送空 `[]` 全清（C-V4）；curl addUser 帶 `userRoles`（C-V5）；無效 role code 拒絕（C-V6）；改角色後重新登入驗權限生效（C-V7）；CDP `/manage/user` 開編輯抽屜驗角色欄預填 + 調整送出（C-V15 角色部分 / C-V16）（依 T006）

**Checkpoint**: US1 可獨立交付 —— 使用者角色指派端到端通。

---

## Phase 4: User Story 2 — admin 設定 / 重設使用者密碼 (P2)

**Goal**: 管理者在 user 抽屜可於建立時設定使用者初始密碼、於編輯時重設密碼。
**Independent test**: 抽屜建立帶自訂密碼的 user → 以該密碼登入成功；編輯填新密碼送出 → 新密碼登入成功、舊密碼失效。
**Note**: T009（DTO 補 `password`）與 US1 T003 同檔 `sys_user.rs`、T010 與 US1 T005 同組 handler —— 與 US1 對應任務序列、不可平行。

- [ ] T008 [US2] rust-api 修正 `update_user` 密碼未 hash bug：`server/service/src/admin/sys_user_service.rs:~213` 的 `if let Some(pw) = input.password` 分支由 `Set(pw)` 改為 `Set(SecureUtil::hash_password(pw.as_bytes())?)`，與 `create_user` 一致（data-model.md B1、research.md R-Q3）
- [ ] T009 [US2] rust-api `SystemManageAddUserInput` / `SystemManageUpdateUserInput`（`server/model/src/admin/input/sys_user.rs`）各補 `password: Option<String>` 欄（收 `password`）（同檔不與 T003 平行；data-model.md B2）
- [ ] T010 [US2] rust-api transform handler password wiring（`server/api/src/admin/sys_system_manage_api.rs`）：transform handler 把 `password` 的 `None` 與 `Some("")`（空字串）皆視為「未提供」；`add_user_for_systemmanage` —— 有提供用該值、未提供沿既有預設密碼（`123456`）；`update_user_for_systemmanage` —— 有提供傳入 `UpdateUserInput.password`（`Some`、經 T008 修正後 hash）、未提供傳 `None`（不動 password）（依 T008、T009；同組 handler 不與 T005 平行；data-model.md B2）
- [ ] T011 [P] [US2] base-web `src/views/manage/user/modules/user-operate-drawer.vue` 加**選填** password 欄：表單加 `NInput type="password"`、`model` 加 `password`、`handleSubmit` 送出帶 `password`（留空送空字串或省略皆可、後端視 `None` 與空字串等效）；userRoles 欄 W-FW1 已接線、**不動**（§4 W-FW5 amendment 授權的最小 UI 新增；data-model.md B2 / B4）
- [ ] T012 [P] [US2] base-web `src/service/api/system-manage.ts` 的 `fetchAddUser` / `fetchUpdateUser` inline 參數型別補**選填** `password`（型別在 service function 檔內、非 `src/typings`）（data-model.md「base-web service function」）
- [ ] T013 [US2] rust-api build + base-web build（`docker build` ×2 + `up -d --wait`）（依 T008–T012；quickstart.md）
- [ ] T014 [US2] US2 acceptance：curl addUser 帶 / 不帶 `password`（C-V8 登入驗證）；curl updateUser 帶新 `password` → 新密碼登入、舊失效 / 不帶 → 密碼不變（C-V9）；psql 查 `sys_user.password` 為 argon2 hash 格式（C-V10）；CDP `/manage/user` 抽屜填密碼送出（C-V15 密碼部分）（依 T013）

**Checkpoint**: US2 可獨立交付 —— admin 設定 / 重設密碼端到端通。

---

## Phase 5: User Story 3 — 使用者自助修改密碼 (P3)

**Goal**: 使用者在帳號中心驗證舊密碼後修改自己的密碼。
**Independent test**: 以某 user 登入 → 帳號中心改密碼 → 舊密碼錯拒、對則成功 → 新密碼可登入、舊密碼失效。

- [ ] T015 [P] [US3] rust-api 新增 `ChangePasswordInput` DTO（`current_password` / `new_password`，`#[serde(rename_all="camelCase")]` 收 `currentPassword` / `newPassword`、`#[derive(Validate)]` 加長度約束）in `server/model/src/admin/input/` 對應 auth input 模組（data-model.md B3a）
- [ ] T016 [US3] rust-api 新增 `change_password(user_id, current_password, new_password)` service in `server/service/src/admin/sys_auth_service.rs`：撈 user → `SecureUtil::verify_password` 驗舊密碼（錯 → 回密碼錯誤 error）→ `SecureUtil::hash_password` 新密碼 → transaction 內 update `sys_user.password` + `audit_log::write_in_txn`（Constitution II）→ commit（依 T015；data-model.md B3b、research.md R-Q2）
- [ ] T017 [US3] rust-api `change_password` handler in `server/api/src/admin/sys_authentication_api.rs`（extractor `Extension<User>` 取 `user.user_id()` + `Extension<Arc<SysAuthService>>` + `Json<ChangePasswordInput>` → 呼 `change_password` → `Res<bool>`）+ route `POST /auth/changePassword` 掛 `server/router/src/admin/sys_authentication_route.rs` 的 `init_protected_router`（依 T016；data-model.md B3c）
- [ ] T018 [US3] rust-api 新增 `/auth/changePassword` Casbin seed migration in `migration/src/datas/<...>.rs`：`/auth/changePassword` × {ROLE_SUPER, ROLE_ADMIN, ROLE_USER} allow、method `POST`、`v4=''`，含反向 DELETE down migration + register `mod.rs` / `lib.rs`（`init_protected_router` 受 Casbin enforce 已查證確認 — `router_initialization.rs:223-226`；比照 `/auth/getUserInfo` 既有 3-role seed 體例）（依 T017；data-model.md B3d）
- [ ] T019 [P] [US3] base-web `src/views/user-center/index.vue` stub（`<LookForward/>`）補成最小「修改密碼」面板：`NForm` 含舊密碼 / 新密碼 / 確認新密碼 `NInput type="password"`；送出前驗新密碼 == 確認（不一致阻擋、FR-012）；呼 `fetchChangePassword`、`if (error) return`、成功 `$message.success`（§4 W-FW5 amendment 授權的最小 UI 新增；data-model.md B3e）
- [ ] T020 [P] [US3] base-web 新增 `fetchChangePassword(data)` service function（`POST /auth/changePassword`，body `{ currentPassword, newPassword }`）in `src/service/api/auth.ts`（auth service 檔已存在）（data-model.md「base-web service function」）
- [ ] T021 [US3] rust-api build + base-web build（依 T015–T020；quickstart.md）
- [ ] T022 [US3] US3 acceptance：curl changePassword 正確舊密碼 → 新密碼登入、舊失效（C-V11）；錯誤舊密碼 → 拒絕、密碼不變（C-V12）；psql 查 changePassword 後 `sys_user.password` argon2 格式（C-V13）；CDP 帳號中心改密碼 —— 舊密碼錯/對、新≠確認阻擋（C-V17 / C-V18）（依 T021）

**Checkpoint**: US3 可獨立交付 —— 使用者自助修改密碼端到端通。

---

## Phase 6: Polish & 收尾

- [ ] T023 全 C-V 矩陣 C-V1~C-V20 跑完（含 C-V14 無權限拒絕、C-V19 regression、C-V20 scope diff）— contracts/verification-commands.md
- [ ] T024 多段式 commit：base-web worktree + rust-api worktree 各 conventional commit + push fork → outer `git add base-web rust-api` 更新 SHA pin + 第二段 commit（CLAUDE.md §4.1）
- [ ] T025 INTEGRATION-CHECKLIST 更新：「已完成里程碑」加 035 entry、「Current Focus」更新、「規劃中」表移除 W-FW5；CLAUDE.md SPECKIT marker 更新

---

## Dependencies

```
T001 (Setup)
  ├─ Phase 3 US1：T002 → T003 → T004（依 T003）→ T005（依 T003+T004）→ T006 → T007
  ├─ Phase 4 US2：T008 · T009 · T011 [P] · T012 [P]
  │               T009 依 T008 無關但與 T003 同檔（sys_user.rs）→ 須在 T003 後序列
  │               T010 依 T008+T009、與 T005 同組 handler → 須在 T005 後序列
  │               T013 依 T008–T012 → T014 依 T013
  └─ Phase 5 US3：T015 [P] → T016 依 T015 → T017 依 T016 → T018 依 T017
                  T019 [P] · T020 [P]（base-web，與 rust 鏈平行）
                  T021 依 T015–T020 → T022 依 T021
       └─ Phase 6：T023 依全 US → T024 → T025
```

**Story 獨立性**: US1 / US2 / US3 三者功能獨立、可各自獨立驗收。**跨 story 同檔序列**：US1 與 US2 共改 `sys_user.rs` input DTO（T003 / T009）與 `sys_system_manage_api.rs` user transform handler（T005 / T010）—— 須序列、建議同一執行單元相鄰實作。US3 自成獨立鏈路（changePassword + user-center）、與 US1/US2 無檔案重疊。

## Parallel Execution

- **US2 內**：T011（drawer）、T012（service function 型別）改 base-web 不同檔、與 rust 任務無相依 → 可平行。
- **US3 內**：T015（DTO）與 T019（user-center）/ T020（service function）分屬 rust / base-web、可平行起步；rust 鏈 T015→T016→T017→T018 須序列。
- **跨 story**：US1 全 rust；US3 的 base-web 部分（T019/T020）與 US1 無重疊、理論可平行 —— 但建議仍依 P1→P2→P3 增量交付。

## Implementation Strategy

- **MVP = US1**（Phase 1 + 3）：使用者角色指派端到端通即達 MVP（純後端、最乾淨）。
- **增量交付**: US1 → US2 → US3 依優先序；每 story phase 完成即為可獨立驗收增量。
- **build 批次**: tasks 列了 per-story build（T006 / T013 / T021）—— 執行時 controller 可視情況批次（如 US1+US2+US3 的 rust 改動一次 build），不必逐 story 重 build。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。建議執行單元：① rust-api user transform 層（US1 T002-T005 + US2 T008-T010，同檔群聚）② base-web US2（T011-T012）③ rust-api changePassword（US3 T015-T018）④ base-web US3（T019-T020）⑤ acceptance + 收尾。
