# Tasks: W-FW4 — role-authorization-wiring

**Input**: Design documents from `/specs/034-role-authorization-wiring/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 無單元測試 task —— wiring feature，transform / 對映由 acceptance（CDP browser smoke + curl + psql）覆蓋；比照 W-FW1（031）/ W-FW2（032）/ W-FW3（033）慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 檢視 / US2 變更儲存 / US3 授權生效）。rust-api `/systemManage/` 角色菜單授權 alias 層為三 story 共用前置 → 置 Foundational phase。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2 / US3）
- 路徑相對 worktree root（`rust-api/` 或 `base-web/`）

---

## Phase 1: Setup

- [ ] T001 確認 worktree 分支正確（`base-web` 在 `rev1-admin-base-web`、`rust-api` 在 `rev1-admin-rust-api`）、dev stack 可 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起（quickstart.md）

---

## Phase 2: Foundational — rust-api `/systemManage/` 角色菜單授權 alias 層

**目的**: 補 2 個 role 菜單授權 alias 端點（讀 / 寫）+ Extension wiring + Casbin seed。**blocks 所有 base-web 接線**（base-web 需這些端點存在才能 wire）。

- [ ] T002 [P] E1 — alias input DTO `AssignRoleMenusInput`（`role_id: String` / `menu_ids: Vec<i32>`，`#[derive(Debug, Deserialize)]` + `#[serde(rename_all="camelCase")]`）in `rust-api/server/model/src/admin/input/sys_role.rs`；`rust-api/server/model/src/admin/input/mod.rs` re-export（data-model.md E1）
- [ ] T003 [P] E4 — systemManage router 補 `SysAuthorizationService` 的 Extension layer in `rust-api/server/initialize/src/router_initialization.rs`（systemManage router 組裝處 `~:352`，現已 layer `SysUserService`/`SysRoleService`/`SysMenuService`、補一行 `.layer(Extension(Arc::new(SysAuthorizationService) as Arc<SysAuthorizationService>))`）（data-model.md E4 / research.md R-Q1）
- [ ] T004 E2 — 2 個 transform handler in `rust-api/server/api/src/admin/sys_system_manage_api.rs`：`get_role_menu_ids_for_systemmanage`（`Path<String>` roleId + `Extension<User>` + `Extension<Arc<SysMenuService>>` → `get_menu_ids_by_role_id(role_id, user.domain())` → `Res<Vec<i32>>`）、`assign_role_menus_for_systemmanage`（`Json<AssignRoleMenusInput>` + `Extension<User>` + `Extension<Arc<SysAuthorizationService>>` → `assign_routes(user.domain(), role_id, menu_ids)` → `Res<bool>`）；domain 由 actor 注入、thin passthrough 無業務過濾（依 T002、T003；data-model.md E2）
- [ ] T005 E3 — 2 條 route + RouteInfo（`/getRoleMenuIds/:roleId` GET、`/assignRoleMenus` POST）in `rust-api/server/router/src/admin/sys_system_manage_route.rs`（依 T004；data-model.md E3）
- [ ] T006 [P] E5 — Casbin policy seed migration `rust-api/migration/src/datas/m20260522_e_wfw4_role_auth_alias_seed.rs`（2 path × {ROLE_SUPER, ROLE_ADMIN} allow：getRoleMenuIds=GET、assignRoleMenus=POST + 反向 DELETE）+ register `mod.rs` / `lib.rs`（data-model.md E5）
- [ ] T007 rust-api build（`docker build` + `up -d --wait`）+ migration 套用 + curl 2 端點 smoke（Soybean token，確認 code 0）（依 T002–T006；quickstart.md）

**Checkpoint**: 2 個 `/systemManage/` 角色菜單授權端點存在、Casbin policy 落 DB —— base-web 接線可開始。

---

## Phase 3: User Story 1 — 檢視角色菜單授權 (P1) 🎯 MVP

**Goal**: base-web menu-auth modal 開啟時，菜單樹預填該角色目前已授權的菜單。
**Independent test**: `/manage/role` 對一角色開菜單授權 modal → 菜單樹勾選與 DB `sys_role_menu` 一致。

- [ ] T008 [P] [US1] base-web `src/service/api/system-manage.ts` 新增 2 個 service function：`fetchGetRoleMenuIds(roleId)`（GET `/systemManage/getRoleMenuIds/:roleId`，回 `number[]`）、`fetchAssignRoleMenus(data)`（POST `/systemManage/assignRoleMenus`，body `{ roleId, menuIds }`）；型別衍生自既有 `Api.SystemManage`、不改 `src/typings`；比照既有 `fetchGetMenuTree` 體例（data-model.md「base-web service function」；供 US1/US2 共用）
- [ ] T009 [US1] base-web `src/views/manage/role/modules/menu-auth-modal.vue` `getChecks` 接線：`fetchGetRoleMenuIds(props.roleId)` → `if (!error)` 設 `checks.value`（取代寫死假陣列）；`roleId` 原樣傳遞、不轉型（依 T008；research.md R-Q4）
- [ ] T010 [US1] US1 acceptance：curl `getRoleMenuIds`（C-V3 對照 psql `sys_role_menu`）；CDP `/manage/role` 開菜單授權 modal、菜單樹預填與 DB 一致（依 T007、T009）

**Checkpoint**: US1 可獨立交付 —— 角色菜單授權檢視端到端通。

---

## Phase 4: User Story 2 — 變更並儲存角色菜單授權 (P2)

**Goal**: base-web menu-auth modal 送出 → 角色菜單授權差異更新、持久化。
**Independent test**: 對角色開 modal 調整勾選送出 → `sys_role_menu` delta 正確。
**Note**: `handleSubmit`（US2）與 `getChecks`（US1 T009）同改 `menu-auth-modal.vue` 同一檔 → T011 與 T009 **不可平行**。

- [ ] T011 [US2] base-web `src/views/manage/role/modules/menu-auth-modal.vue` `handleSubmit` 接線：`fetchAssignRoleMenus({ roleId: props.roleId, menuIds: checks.value })` → `if (error) return` → 成功 `$message.success` + `closeModal`（依 T008；同檔不與 T009 平行）
- [ ] T012 [US2] US2 acceptance：curl `assignRoleMenus`（C-V4 delta 落庫 + C-V5 空 menuIds 全清 + C-V6 round-trip 冪等驗）；CDP modal 調整勾選送出、UI + DB 一致（依 T007、T011）

**Checkpoint**: US2 可獨立交付 —— 角色菜單授權變更儲存端到端通。

---

## Phase 5: User Story 3 — 授權變更對角色生效 (P3)

**Goal**: 角色菜單授權變更後，該角色的動態選單反映新授權。
**Independent test**: 對某角色調整授權後，以該角色取得動態選單 → 選單集合與新授權一致。
**Note**: 「授權生效」為既有動態選單機制的自然結果、本 feature 無新 code；本 phase 為生效專屬 acceptance。

- [ ] T013 [US3] US3 acceptance：對某 role 調整菜單授權後，以該 role 取得動態選單（`/route/getUserRoutes`）→ 新授權菜單出現、取消的消失（C-V7）（依 T007、T011）

**Checkpoint**: US3 可獨立交付 —— 授權變更對動態選單生效。

---

## Phase 6: Polish & 收尾

- [ ] T014 全 C-V 矩陣 C-V1~C-V13 跑完（含 C-V8 Casbin deny、C-V10 round-trip UI 驗、C-V11 regression、C-V12 錯誤呈現、C-V13 scope diff）— contracts/verification-commands.md
- [ ] T015 多段式 commit：base-web worktree + rust-api worktree 各 conventional commit + push fork → outer `git add base-web rust-api` 更新 SHA pin + 第二段 commit（CLAUDE.md §4.1）
- [ ] T016 INTEGRATION-CHECKLIST 更新：「已完成里程碑」加 034 entry、「Current Focus」更新、「Follow-up Backlog」加 W-FW4-N1 / W-FW4-N2 / W-FW4-N3；CLAUDE.md SPECKIT marker 更新

---

## Dependencies

```
T001 (Setup)
  └─ Phase 2 Foundational：T002 [P] · T003 [P] · T006 [P] 可平行
                            T004 依 T002+T003 → T005 依 T004 → T007 依 T002–T006
       └─ T008 [P]（base-web service function，依 Phase 2 端點存在）
            ├─ Phase 3 US1：T009 依 T008 → T010 依 T007+T009
            ├─ Phase 4 US2：T011 依 T008（同檔不與 T009 平行）→ T012 依 T007+T011
            └─ Phase 5 US3：T013 依 T007+T011
                 └─ Phase 6：T014 依全 US → T015 → T016
```

**Story 獨立性**: US1 / US2 在 Foundational（Phase 2）+ T008 完成後可各自獨立驗收；US1（getChecks 讀）與 US2（handleSubmit 寫）改同一檔 `menu-auth-modal.vue`、實作須序列。US3 不另寫 code（授權生效為既有動態選單機制），其 phase 為生效專屬 acceptance。

## Parallel Execution

- **Phase 2 內**: T002、T003、T006 三者不同檔、無相依 → 可平行。
- **base-web 接線**: T009（getChecks）與 T011（handleSubmit）改 `menu-auth-modal.vue` **同一檔** → **不可平行**、須序列實作。

## Implementation Strategy

- **MVP = US1**（Phase 1 + 2 + 3）：角色菜單授權檢視端到端通即達 MVP。
- **增量交付**: US1 → US2 → US3 依優先序；每 story phase 完成即為可獨立驗收增量。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。
