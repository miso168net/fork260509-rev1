# Tasks: W-FW3 — role-crud-wiring

**Input**: Design documents from `/specs/033-role-crud-wiring/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 無單元測試 task —— wiring feature，transform / 對映由 acceptance（CDP browser smoke + curl + psql）覆蓋；比照 W-FW1（031）/ W-FW2（032）慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 建立 / US2 刪除 / US3 編輯）。rust-api `/systemManage/` role 寫入 alias 層為三 story 共用前置 → 置 Foundational phase。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2 / US3）
- 路徑相對 worktree root（`rust-api/` 或 `base-web/`）

---

## Phase 1: Setup

- [ ] T001 確認 worktree 分支正確（`base-web` 在 `rev1-admin-base-web`、`rust-api` 在 `rev1-admin-rust-api`）、dev stack 可 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起（quickstart.md）

---

## Phase 2: Foundational — rust-api `/systemManage/` role 寫入 alias 層

**目的**: 補 4 個 role 寫入 alias 端點 + role-edit 正確性修正。**blocks 所有 base-web 接線**（base-web 需這些端點存在才能 wire）。

- [ ] T002 [P] E1 — 4 個 alias input DTO（`SystemManageAddRoleInput` / `SystemManageUpdateRoleInput` / `DeleteRoleByBodyInput` / `BatchDeleteRoleInput`，`#[serde(rename_all="camelCase")]`）in `rust-api/server/model/src/admin/input/sys_role.rs`；`rust-api/server/model/src/admin/input/mod.rs` re-export（data-model.md E1）
- [ ] T003 [P] E4 — `update_role` 構造 `SysRoleActiveModel` 補 `status: Set(input.role.status)`（1 行，修 status-drop）in `rust-api/server/service/src/admin/sys_role_service.rs`（data-model.md E4 / FR-006）
- [ ] T004 E2 — 4 個 transform handler（`add_role_for_systemmanage` / `update_role_for_systemmanage` / `delete_role_for_systemmanage` / `batch_delete_role_for_systemmanage`）in `rust-api/server/api/src/admin/sys_system_manage_api.rs`：add 對映 + 注入 `pid="0"`、update 先 `get_role(id)` 取既有 `code`/`pid`（code-lock，FR-007）、batch per-id loop + `deletedCount`；`status` 用 `map_status`（重用 W-FW1）（依 T002；data-model.md E2）
- [ ] T005 E3 — 4 條 route + RouteInfo（`/addRole` `/updateRole` POST、`/deleteRole` `/batchDeleteRole` DELETE）in `rust-api/server/router/src/admin/sys_system_manage_route.rs`（依 T004；data-model.md E3）
- [ ] T006 [P] E5 — Casbin policy seed migration `rust-api/migration/src/datas/m20260522_d_wfw3_role_alias_seed.rs`（4 path × {ROLE_SUPER, ROLE_ADMIN} allow + 反向 DELETE）+ register `mod.rs` / `lib.rs`（data-model.md E5）
- [ ] T007 rust-api build（`up -d --build rust-api`）+ migration 套用 + curl 4 端點 smoke（Soybean token，確認 code 0）（依 T002–T006）

**Checkpoint**: 4 個 `/systemManage/` role 寫入端點存在、Casbin policy 落 DB —— base-web 接線可開始。

---

## Phase 3: User Story 1 — 建立角色 (P1) 🎯 MVP

**Goal**: base-web role 新增 drawer 送出 → 角色建立、寫 DB、列表 refresh。
**Independent test**: `/manage/role` 開新增 drawer 填表送出 → 角色落 `sys_role`、列表顯示。

- [ ] T008 [P] [US1] base-web `src/service/api/system-manage.ts` 新增 4 個 service function：`fetchAddRole` / `fetchUpdateRole`（POST）、`fetchDeleteRole` / `fetchBatchDeleteRole`（DELETE），型別衍生自 `Api.SystemManage.Role`（data-model.md「base-web service function」；供 US1/US2/US3 共用）
- [ ] T009 [US1] base-web `src/views/manage/role/modules/role-operate-drawer.vue` `handleSubmit` 接線：`operateType==='edit'` → `fetchUpdateRole({...params, id})`、否則 `fetchAddRole(params)`；`if (error) return`、成功 `$message.success` + `closeDrawer` + `emit('submitted')`（依 T008；同函式涵蓋 add 與 edit 兩分支，edit 路徑供 US3）
- [ ] T010 [US1] US1 acceptance：curl `addRole`（C-V3 落庫 + pid="0"）+ 重複 roleCode（C-V4 拒絕）；CDP `/manage/role` 新增 role、UI + DB 一致（依 T007、T009）

**Checkpoint**: US1 可獨立交付 —— 建立角色端到端通。

---

## Phase 4: User Story 2 — 刪除 / 批次刪除角色 (P2)

**Goal**: base-web role 列表單筆 / 批次刪除 → 角色軟刪、列表 refresh。
**Independent test**: 對角色點刪除 → 軟刪、列表移除；勾選多筆批次刪除 → 全軟刪。

- [ ] T011 [US2] base-web `src/views/manage/role/index.vue`：`handleDelete` → `fetchDeleteRole({ id })` + 成功 `onDeleted`；`handleBatchDelete` → `fetchBatchDeleteRole({ ids: checkedRowKeys.value })` + 成功 `onBatchDeleted`；失敗 `if (error) return`（依 T008）
- [ ] T012 [US2] US2 acceptance：curl `deleteRole` / `batchDeleteRole`（C-V8/C-V9 soft delete + `deletedCount`）；CDP 單筆 + 批次刪除（依 T007、T011）

**Checkpoint**: US2 可獨立交付 —— 刪除 / 批次刪除端到端通。

---

## Phase 5: User Story 3 — 編輯角色 (P3)

**Goal**: base-web role 編輯 drawer 送出 → 變更持久化；status 真正生效、roleCode 鎖定。
**Independent test**: 對既有 role 點編輯 → drawer 預填 → 改 name/status 送出 → DB 變更、status 真的變；送出改 roleCode → DB code 不變。
**Note**: edit 路徑由 T009 的 `handleSubmit` edit 分支 + T008 `fetchUpdateRole` 提供；本 phase 為 edit 專屬 acceptance。

- [ ] T013 [US3] US3 acceptance：curl `updateRole` 改 name/desc（C-V5）+ 改 `status`（C-V6，psql 驗 status 真的變 — E4 修正）+ 送不同 `roleCode`（C-V7，psql 驗 code 不變 — code-lock）；CDP 編輯 role、預填 + 送出驗證（依 T007、T009）

**Checkpoint**: US3 可獨立交付 —— 編輯角色端到端通、含 2 個正確性處理。

---

## Phase 6: Polish & 收尾

- [ ] T014 全 C-V 矩陣 C-V1~C-V14 跑完（含 C-V10 Casbin deny、C-V12 regression、C-V13 錯誤呈現、C-V14 scope diff）— contracts/verification-commands.md
- [ ] T015 多段式 commit：base-web worktree + rust-api worktree 各 conventional commit + push fork → outer `git add base-web rust-api` 更新 SHA pin + 第二段 commit（CLAUDE.md §4.1）
- [ ] T016 INTEGRATION-CHECKLIST 更新：「已完成里程碑」加 033 entry、「Current Focus」更新；CLAUDE.md SPECKIT marker 更新

---

## Dependencies

```
T001 (Setup)
  └─ Phase 2 Foundational：T002 [P] · T003 [P] · T006 [P] 可平行
                            T004 依 T002 → T005 依 T004 → T007 依 T002–T006
       └─ T008 [P]（base-web service function，依 Phase 2 端點存在）
            ├─ Phase 3 US1：T009 依 T008 → T010 依 T007+T009
            ├─ Phase 4 US2：T011 依 T008 → T012 依 T007+T011
            └─ Phase 5 US3：T013 依 T007+T009（edit 路徑於 T009 已建）
                 └─ Phase 6：T014 依全 US → T015 → T016
```

**Story 獨立性**: US1 / US2 / US3 在 Foundational（Phase 2）+ T008 完成後可各自獨立驗收。US3 不另寫 code（edit 路徑為 T009 `handleSubmit` 共用分支），其 phase 為 edit 專屬 acceptance。

## Parallel Execution

- **Phase 2 內**: T002、T003、T006 三者不同檔、無相依 → 可平行。
- **跨 base-web 接線**: T009（drawer）與 T011（index）不同檔、皆只依 T008 → 可平行。

## Implementation Strategy

- **MVP = US1**（Phase 1 + 2 + 3）：建立角色端到端通即達 MVP。
- **增量交付**: US1 → US2 → US3 依優先序；每 story phase 完成即為可獨立驗收增量。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。
