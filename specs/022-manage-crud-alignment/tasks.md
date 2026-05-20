---
description: "Task list for F7 — manage-crud-alignment implementation"
---

# Tasks: F7 — manage-crud-alignment

**Input**: Design documents from `/specs/022-manage-crud-alignment/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F7 為 rust source change feature(類 F5.1/F6/F10.1/F10.2/F11/F9 兩段式 commit)、**無 rust unit test**(per spec FR-021 + F11/F9 同精神、shape mapping 邏輯 stack-可見、wrapper handler 簡單)
- Acceptance compensate:curl + psql + CDP browser smoke test 三類驗證(per spec FR-023)
- **Acceptance**:per spec US1 P1 5 + US2 P2 3 + US3 P3 5 = **13 個 scenario** → 對齊 **11 個 C-V**(C-V10 含 3 個 CDP sub-case、per NFR-004)

**Organization**:F7 為 3 user story feature、Setup(2)+ Foundational(1)+ US1 impl(8 task per data-model E1-E8)+ US1 acceptance(4 task)+ US2 acceptance(2 task)+ US3 acceptance(3 task)+ Zero-regression(1 task)+ Doc(2 task)+ 兩段式 Commit(3 task)= **26 task**(對齊 NFR-002 ~22-25 task 範圍上限略超、因 F7 跨 3 entity DTO + CDP smoke test 而比 F11 多)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F7 row + Current Focus + 已完成里程碑)
  - 改:`CLAUDE.md` §10 active feature(SOP hook 已處理、`/speckit-plan` 已 update 指 022)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
- **Worktree(改、`rust-api/`、~275 LOC、8 file):**
  - 新建:`rust-api/server/model/src/admin/output/sys_system_manage.rs`(5 個 Output DTO + From impl、~120 LOC)
  - 改:`rust-api/server/model/src/admin/output/mod.rs`(+1 LOC mod + re-export 5 DTO)
  - 新建:`rust-api/server/api/src/admin/sys_system_manage_api.rs`(`SysSystemManageApi` + 5 wrapper handler、~80 LOC)
  - 改:`rust-api/server/api/src/admin/mod.rs`(+2 LOC mod + re-export `SysSystemManageApi`)
  - 改:`rust-api/server/router/src/admin/sys_system_manage_route.rs`(5 條 read alias mount 換新 wrapper handler、+import、~10 LOC)
  - 新建:`rust-api/migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs`(~60 LOC、INSERT 15 row + DELETE 15 row)
  - 改:`rust-api/migration/src/datas/mod.rs`(+1 LOC)
  - 改:`rust-api/migration/src/lib.rs`(+2 LOC Migrator vec)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-015 + FR-016);rust-api 其他 file 不動(per FR-010 + FR-014)
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` 等 host-side bash + CDP browser via WSL2 host Edge 148)
- **Image / artifact**:F7 需 rebuild rust-api docker image(per Step 3、warm ~3-5 min、cold ~5-7 min)
- **無 docker-compose.yml 改**(對比 F10.1)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `022-manage-crud-alignment` + rust-api worktree branch = `rev1-admin-rust-api`、F9 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F9 完成|F9 systemManage' | head -3 && cd rust-api && git branch --show-current && git status --short && cd ..`(預期 outer branch=022-*、rust-api branch=rev1-admin-rust-api、history 含 F9 merge `b2f910c`、rust-api worktree clean)

- [ ] T002 [P] 確認 W-FA1 stack 可起 + F9 baseline 仍 work,執行 `docker images rust-api:rev1-admin-rust-api -q && docker images nestjs:rev1-admin-nestjs -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -5`(預期 image SHA 兩個都非空、compose config 無 error)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起 + F9 baseline 仍 work + F5.1 seed user/role/menu 在 DB(F7 acceptance 需 login + 反映 sys_role/sys_menu 資料 + CDP smoke 走 SPA login flow)。

- [ ] T010 起 7 service stack(若未起)、確認 F9 baseline 仍 work + 確認 seed user 存在:`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0);如未授權跑 psql 預檢、跳過(F7 acceptance 階段會驗 F5.1 seed)。

---

## Phase 3: User Story 1 — Soybean 5 read alias shape 對齊 + 3 view CDP smoke(Priority: P1)🎯 MVP

**Goal**:rust 5 條 `/systemManage/*` read alias mount 換 wrapper handler + Casbin policy allow ROLE_SUPER 生效 + F7 Output DTO shape mapping 落地(camelCase + 缺欄位 hardcode null/[])+ CDP browser load 3 view 確認 table column render 含 base TS type 預期欄位(不是 undefined / blank)。

**Independent Test**:用 `Soybean` user login 拿 access_token → 用該 token 跑 5 條 alias endpoint(`getRoleList / getAllRoles / getUserList / getMenuList/v2 / getMenuTree`)→ 預期 5/5 envelope code:0 + data shape 對齊 base TS type → CDP browser navigate 3 view + DOM query column data non-undefined。

### US1 implementation(rust source patch、~275 LOC、8 file)

- [ ] T020 [P] [US1] **新建** `rust-api/server/model/src/admin/output/sys_system_manage.rs`(per data-model.md E1-E5、~120 LOC):
  - imports:`use chrono::NaiveDateTime; use serde::Serialize; use tracing::warn; use crate::admin::entities::{sea_orm_active_enums::{MenuType, Status}, sys_menu, sys_role, sys_user}; use crate::admin::output::sys_menu::MenuTree;`
  - struct `SystemManageRoleOutput`(per E1、9 field + From<sys_role::Model> impl)
  - struct `SystemManageAllRoleOutput`(per E2、3 field + From<sys_role::Model> impl)
  - struct `SystemManageUserOutput`(per E3、12 field、userGender hardcode None、userRoles hardcode vec![] + From<sys_user::Model> impl)
  - struct `SystemManageMenuOutput`(per E4、23 field、buttons/children/fixed_index_in_tab/query hardcode None + From<sys_menu::Model> impl)
  - struct `SystemManageMenuTreeNodeOutput`(per E5、4 field、pId 用 `#[serde(rename = "pId")]` + From<MenuTree> impl 遞迴)
  - helper fn `map_menu_type` + `map_icon_type`(per R-Q2、含 tracing::warn! 對 unexpected default arm)
  - 各 struct `#[derive(Debug, Serialize, Clone)]` + `#[serde(rename_all = "camelCase")]`

- [ ] T021 [US1] 改 `rust-api/server/model/src/admin/output/mod.rs`(per data-model.md E1-E5 module register):
  - 加 `pub mod sys_system_manage;`
  - 加 `pub use sys_system_manage::{SystemManageRoleOutput, SystemManageAllRoleOutput, SystemManageUserOutput, SystemManageMenuOutput, SystemManageMenuTreeNodeOutput};`
  - 對齊既有 `pub use sys_xxx::{...};` 慣例
  - ~3 LOC

- [ ] T022 [P] [US1] **新建** `rust-api/server/api/src/admin/sys_system_manage_api.rs`(per data-model.md E6、~80 LOC):
  - imports:`use std::sync::Arc; use axum::Extension; use server_core::web::{error::AppError, page::PaginatedData, res::Res}; use server_model::admin::output::sys_system_manage::{SystemManageRoleOutput, SystemManageAllRoleOutput, SystemManageUserOutput, SystemManageMenuOutput, SystemManageMenuTreeNodeOutput}; use server_service::admin::{SysRoleService, SysUserService, SysMenuService};`(對齊 sys_user_api / sys_role_api / sys_menu_api 既有 import pattern)
  - struct `SysSystemManageApi;`(unit struct)
  - 5 wrapper handler:
    - `list_roles_for_systemmanage`:call `service.find_paginated_roles(...)` → map records `.into()` → `Res<PaginatedData<SystemManageRoleOutput>>`
    - `list_all_roles_for_systemmanage`:call `service.find_all_enabled()` → map `.into()` → `Res<Vec<SystemManageAllRoleOutput>>`
    - `list_users_for_systemmanage`:call `service.find_paginated_users(...)` → map records `.into()` → `Res<PaginatedData<SystemManageUserOutput>>`
    - `list_menu_for_systemmanage`:call `service.get_menu_list()` → map `.into()` → `Res<Vec<SystemManageMenuOutput>>`(注意 既有 `get_menu_list` 回 `Vec<MenuTree>` 還是 paginated、grep 確認、若是 MenuTree、F7 mapping 用 MenuTree → SystemManageMenuOutput;若是 flat menu、改用 sys_menu::Model)
    - `tree_menu_for_systemmanage`:call `service.tree_menu()` → map `.into()` → `Res<Vec<SystemManageMenuTreeNodeOutput>>`
  - 各 handler signature 對齊既有 `SysRoleApi::get_paginated_roles` / `SysMenuApi::tree_menu` 等 既有 handler、extractor pattern
  - 依賴 T020 (Output DTO)、T021 (re-export)

- [ ] T023 [US1] 改 `rust-api/server/api/src/admin/mod.rs`:
  - 加 `pub mod sys_system_manage_api;`
  - 加 `pub use sys_system_manage_api::SysSystemManageApi;`
  - 對齊既有 `Sys*Api` re-export 慣例
  - ~2 LOC

- [ ] T024 [US1] 改 `rust-api/server/router/src/admin/sys_system_manage_route.rs`(per data-model.md E7、~10 LOC):
  - imports 加 `SysSystemManageApi`:`use server_api::admin::{SysMenuApi, SysRoleApi, SysUserApi, SysSystemManageApi};`(加 SysSystemManageApi、其他保留)
  - router 內 5 條 read alias mount 換 handler:
    - `.route("/getRoleList",     get(SysSystemManageApi::list_roles_for_systemmanage))`(取代 F9 `get(SysRoleApi::get_paginated_roles)`)
    - `.route("/getAllRoles",     get(SysSystemManageApi::list_all_roles_for_systemmanage))`(取代 F9 `get(SysRoleApi::get_all_roles)`)
    - `.route("/getUserList",     get(SysSystemManageApi::list_users_for_systemmanage))`(取代 F9 `get(SysUserApi::get_paginated_users)`)
    - `.route("/getMenuList/v2",  get(SysSystemManageApi::list_menu_for_systemmanage))`(取代 F9 `get(SysMenuApi::get_menu_list)`)
    - `.route("/getMenuTree",     get(SysSystemManageApi::tree_menu_for_systemmanage))`(取代 F9 `get(SysMenuApi::tree_menu)`)
  - 其他 5 條 write/read mount 不動(`addUser / updateUser / deleteUser / batchDeleteUser / getAllPages`)
  - 10 RouteInfo register 不動(F9 既有、F7 不改)
  - 接 T022(handler)

- [ ] T025 [P] [US1] **新建** `rust-api/migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs`(per data-model.md E8、~60 LOC):
  - 對齊 F9 m20260520 既有 pattern(per R-Q5):`use sea_orm_migration::{prelude::*, sea_orm::Statement};` + `#[derive(DeriveMigrationName)]` + `impl MigrationTrait` + `Statement::from_string` SQL
  - `up()` INSERT 15 row(per E8 完整列表):6 `/user/*` × ROLE_ADMIN × {GET, GET /users, POST, PUT, GET /:id, DELETE /:id} + 5 `/role/*` × ROLE_ADMIN × {GET, POST, PUT, GET /:id, DELETE /:id} + 4 `/route/*` × ROLE_ADMIN × {POST /, PUT /, DELETE /:id, GET /:id}
  - 所有 row:`v1='built-in'` / `v4=''` / `v5=''`(per F11 R-Q5 baseline)
  - `down()` DELETE 用 scope-limited WHERE clause:`ptype='p' AND v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'`(per FR-013、排除 F9 m20260520 既有 row)

- [ ] T026 [US1] 改 `rust-api/migration/src/datas/mod.rs`:
  - 加 `pub mod m20260521_a_f7_admin_role_existing_paths_seed;`
  - 對齊既有 `pub mod m20260520_a_f9_system_manage_alias_seed;` 後一行
  - ~1 LOC、接 T025

- [ ] T027 [US1] 改 `rust-api/migration/src/lib.rs`:
  - 在 `Migrator::migrations()` vec 加 `Box::new(m20260521_a_f7_admin_role_existing_paths_seed::Migration),`
  - 對齊 `m20260520_a_f9` register location 後
  - ~2 LOC、接 T026

### US1 stack acceptance(對齊 contracts/verification-commands.md C-V1-V3 + C-V10)

- [ ] T040 [US1] **C-V1** rebuild rust-api docker image(per Step 3 of quickstart):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 warm ~3-5 min / cold ~5-7 min(per NFR-005;若 fail → check cargo build output、可能 unused import / DTO field 拼字 / From impl mismatch / Output DTO 漏 re-export / SysSystemManageApi 漏 import)
  接 T020-T027 全 done

- [ ] T041 [US1] 起 stack(force-recreate migration + rust-api、F7 migration init container 自動 rerun):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -10
  docker compose logs migration --tail=10
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 migration log 含 `Applying migration 'm20260521_a_f7...'` + rust-api 重啟 healthy + 其他 5 service 仍 healthy + migration init container exited 0
  接 T040

- [ ] T042 [US1] **C-V2 + C-V3 + 5 sub-case** inline(per contracts/verification-commands.md):
  ```bash
  # C-V2: 15 row 落 casbin_rule
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT COUNT(*) FROM casbin_rule WHERE v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'"

  # C-V3: Soybean 5 read alias shape 對齊
  LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

  # C-V3a getRoleList shape, C-V3b getAllRoles shape, C-V3c getUserList shape,
  # C-V3d getMenuList/v2 shape, C-V3e getMenuTree shape — per contracts/verification-commands.md C-V3 a-e
  ```
  預期 C-V2 COUNT=15 + 5 sub-case 各 field 對齊 base TS type:
  - C-V3a roleName "超级管理员"/"管理员"/"用户" + roleCode "ROLE_*"
  - C-V3b array of 3 enabled role(keys exactly id/roleName/roleCode)
  - C-V3c userName "Soybean" + userGender null + userRoles []
  - C-V3d parentId String + menuType "1"/"2" + order int + buttons null + children null
  - C-V3e keys exactly {id, label, pId, children} 4 field、pId 大寫 I
  接 T041

- [ ] T043 [US1] **C-V10 CDP browser smoke test 3 view + column render**(per spec US1.3-5 + R-Q4):
  ```bash
  # 沿用 F5.1 follow-up CDP setup:WSL2 host Edge 148 + --remote-debugging-port=9222
  # 3 個 sub-case:
  # C-V10a: navigate to /manage/user + DOM query first row.userName / nickName / userPhone / userEmail
  # C-V10b: navigate to /manage/role + DOM query first row.roleName / roleCode / roleDesc
  # C-V10c: navigate to /manage/menu + DOM query first row.menuName / routeName / routePath / parentId
  # 對應 verification-commands.md C-V10 細目
  ```
  預期 3 sub-case 全 PASS:row data 含 base TS type 預期欄位、不是 undefined / blank。
  若 CDP setup fail / Edge crash → fall back 為「手動 browser navigate + visual eyeball 確認 column 不空白」(per R-Q4 graceful degradation)。
  接 T042

**Checkpoint**:US1 完成 — 5 條 read alias shape mapping 落地、base view 3 個真實 render 對齊、F7 核心 MVP 交付完成。

---

## Phase 4: User Story 2 — Administrator alias + 既有 path Casbin 補位解 A-006(Priority: P2)

**Goal**:Administrator(ROLE_ADMIN)對 F7 5 read alias 仍 allow + 對既有 `/api/user/* /api/role/*` 5 path 也 allow,解 spec A-006「ROLE_ADMIN 對既有 path 缺 row」差異。

**Independent Test**:用 `Administrator` user login → curl 5 alias + 5 既有 path,各 envelope `{code:0, success:true}`、對齊 ROLE_SUPER 體驗。

### US2 acceptance(對齊 C-V4 + C-V5)

- [ ] T050 [US2] **C-V4 Administrator 5 read alias allow + shape 對齊**(per spec US2.2):
  ```bash
  ADMIN_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Administrator","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

  # 5 endpoint(C-V3 同範圍、token 不同):
  for endpoint in "getRoleList?current=1&size=10" "getAllRoles" "getUserList?current=1&size=10" "getMenuList/v2" "getMenuTree"; do
    curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
      "http://127.0.0.1:11080/api/systemManage/${endpoint}" | head -c 200
  done
  ```
  預期 5/5 endpoint HTTP 200 + envelope code:0 + shape 與 ROLE_SUPER(C-V3)一致(F9 m20260520 對 ROLE_ADMIN allow 已 cover)
  接 T041 stack 起後

- [ ] T051 [US2] **C-V5 Administrator 既有 5 path allow(解 A-006)**(per spec US2.3):
  ```bash
  # Administrator 對既有 path:
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" "http://127.0.0.1:11080/api/user?current=1&size=10" | head -c 200
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" "http://127.0.0.1:11080/api/role?current=1&size=10" | head -c 200
  curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"username":"f7-admin-test","password":"test123","email":"f7admin@example.com","domain":"built-in","nickName":"F7 Admin Test","status":"enabled","roleIds":["2"]}' \
    http://127.0.0.1:11080/api/user | head -c 200
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:11080/api/user/1 | head -c 200
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:11080/api/role/1 | head -c 200
  ```
  預期 5/5 endpoint HTTP 200 + envelope code:0 或業務 error 但非 5001 deny(F7 m20260521 15 row 補位生效、解 A-006)
  接 T041、可平行於 T050

**Checkpoint**:US2 完成 — Administrator 兩條 path(alias + 既有)都通、A-006 解、admin path 完整。

---

## Phase 5: User Story 3 — Menu CRUD admin path + GeneralUser deny regression + W-FA1 stack regression(Priority: P3)

**Goal**:Menu CRUD admin path(POST/PUT/DELETE `/api/route/`)真實工作 + soft delete + audit 整合 + W-FA1 stack 6 service 仍 healthy + ROLE_USER 對既有 path deny regression 維持。

**Independent Test**:curl Administrator POST/PUT/DELETE `/api/route/` → psql 驗 soft delete + audit + curl GeneralUser /api/user → envelope code:5001 + docker compose ps 6 healthy。

### US3 acceptance(對齊 C-V6 + C-V7 + C-V9)

- [ ] T060 [US3] **C-V6 Menu CRUD admin path 整套**(per spec US3.2 + DESIGN-A §1.1):
  ```bash
  # Administrator POST /api/route/(create menu):
  NEW_MENU_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '<新 menu payload、per quickstart.md C-V6 example>' \
    http://127.0.0.1:11080/api/route/)
  NEW_MENU_ID=$(echo "$NEW_MENU_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

  # PUT /api/route/(update menu):curl PUT with id=$NEW_MENU_ID + 改 menu_name
  # DELETE /api/route/$NEW_MENU_ID(soft delete)

  # psql 驗 soft delete + audit:
  docker compose exec -T postgres psql ... -c "SELECT deleted_at FROM sys_menu WHERE id = $NEW_MENU_ID"
  docker compose exec -T postgres psql ... -c "SELECT COUNT(*) FROM sys_operation_log WHERE entity_id = '$NEW_MENU_ID' AND operation = 'SOFT_DELETE'"
  ```
  預期 3/3 endpoint HTTP 200 + envelope code:0 + sys_menu.deleted_at NOT NULL + sys_operation_log COUNT ≥ 1
  接 T041 + T051(Administrator allow 對 /route/* 為 T051 補位的範疇)

- [ ] T061 [US3] **C-V7 GeneralUser deny regression**(per spec US3.3 + F11 R-Q6):
  ```bash
  GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $GU_TOKEN" http://127.0.0.1:11080/api/user | head -c 200
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $GU_TOKEN" http://127.0.0.1:11080/api/systemManage/getUserList | head -c 200
  ```
  預期 2/2 HTTP 200 + envelope `{code:5001, success:false}`(per F11 R-Q6 envelope wrap、ROLE_USER 不受 F7 影響)
  接 T041、可平行於 T060

- [ ] T062 [US3] **C-V9 W-FA1 stack regression**:
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ rust-api uptime 較短(剛 recreated)+ migration exited 0(per SC-011 + FR-025)
  接 T041、可平行於 T060/T061

**Checkpoint**:US3 完成 — Menu CRUD admin path 整套 + soft delete + audit 整合 + ROLE_USER fail-safe 維持 + W-FA1 stack regression PASS。

---

## Phase 6: Zero-regression(對齊 W-F* / W-FA* / F10 / F10.1 / F10.2 / F11 / F9 標配)

**Goal**:base-web + nestjs fork 零改動 + rust-api scope 收緊到 8 file(per spec SC-014 + SC-015 + SC-016 + plan structure decision)。

### Zero-regression verification

- [ ] T070 [P] **C-V8 three-side scope verify**(per contracts):
  ```bash
  echo "=== base-web/src/ diff lines (預期 0) ==="
  git diff HEAD -- base-web/src/ | wc -l

  echo "=== fork260509-soybean-admin-nestjs/ diff lines (預期 0) ==="
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l

  echo "=== rust-api scope (預期 8 file ~275 LOC) ==="
  (cd rust-api && git diff HEAD --stat)
  (cd rust-api && git status --short)

  echo "=== docker-compose 變動 (預期 0) ==="
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l

  echo "=== outer scope (預期 CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + rust-api gitlink + specs/022-* untracked) ==="
  git status --short
  ```
  預期:per spec SC-014 + SC-015 + SC-016 + plan structure decision、4 個 0 line + rust-api 8 file(5 改 + 2 新建 + 1 改、其中 2 新建為 output/sys_system_manage.rs + sys_system_manage_api.rs + m20260521 migration、共 3 個新建 file、5 個改 file 為 output/mod.rs + api/mod.rs + sys_system_manage_route.rs + migration/datas/mod.rs + migration/lib.rs)+ outer 4 file + 1 untracked dir

  接 T041 後、可平行於 T060-T062

**Checkpoint**:Phase 6 完成 — 三邊 scope 對齊驗證 PASS。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc 反映 F7 落地。

- [ ] T080 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-028):
  - Current Focus 三段更新(Phase / Active feature 改 F7、F7 outer commit pending push / 下一步並行候選)
  - 已完成里程碑加 F7 條目(對齊 F9 同 application-phase style + 兩段式 commit、SHA placeholder)
  - 加新「application Phase 3 進度」紀錄(F9 + F7 = 2/3 完成、F8 待)+ A-006 解標記
  - 列 F7 後 next-step:F8 / F12 / W-F11 / W-F6b / F13 / F14 並行 / 後續候選(per spec Dependencies「並行可選」段)

- [ ] T081 [P] **doc grep verify**:
  ```bash
  grep -cE "F7\b|manage-crud-alignment" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F7" docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:≥ 5 match、INTEGRATION-CHECKLIST.md 多處 F7 引用(Current Focus + 已完成里程碑 + application Phase 3 進度)

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.1/F10.2/F11/F9 慣例)

**Goal**:落實**兩段式 commit** 紀律(F7 動 rust-api worktree、純 outer 不夠)、push 等 user 同意。

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short
  # 預期 modified + new file:8 file total

  git add server/model/src/admin/output/sys_system_manage.rs \
          server/model/src/admin/output/mod.rs \
          server/api/src/admin/sys_system_manage_api.rs \
          server/api/src/admin/mod.rs \
          server/router/src/admin/sys_system_manage_route.rs \
          migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs \
          migration/src/datas/mod.rs \
          migration/src/lib.rs

  git commit -m "$(cat <<'EOF'
  feat(rust-api): F7 manage/* base view shape 對齊 + admin path Casbin 補位

  rev1 application Phase 3 第二個 feature(F9 已落、F7 為第二個、F8 待)。
  DESIGN-A §6.1 + DESIGN-B §6「manage/* 4 module CRUD shape 對齊 + Casbin
  enforce + 軟刪 + audit + Menu CRUD」針對 base example 分支 stub UI 現況
  精化定義為「base view shape 對齊 + admin path Casbin 補位」two-fold
  deliverable。

  Deliverable:
  1. Shape mapping:5 個 Output DTO + From impl + camelCase rename + 缺欄位
     hardcode None/vec![];F9 alias 5 條 read mount 換 wrapper handler
  2. Admin path Casbin allow:新 migration m20260521 INSERT 15 row 補
     ROLE_ADMIN 對既有 /user/* /role/* /route/* path 解 A-006

  改動範圍(rust-api、8 file ~275 LOC):
  - server/model/src/admin/output/sys_system_manage.rs(新建 ~120 LOC、
    5 Output DTO + From impl + map_menu_type/map_icon_type helper)
  - server/model/src/admin/output/mod.rs(+1 LOC mod + re-export 5 DTO)
  - server/api/src/admin/sys_system_manage_api.rs(新建 ~80 LOC、
    SysSystemManageApi + 5 wrapper handler)
  - server/api/src/admin/mod.rs(+2 LOC mod + re-export SysSystemManageApi)
  - server/router/src/admin/sys_system_manage_route.rs(~10 LOC、
    5 條 read alias mount 換新 wrapper handler + import)
  - migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs
    (新建 ~60 LOC、INSERT 15 row + scope-limited DELETE)
  - migration/src/datas/mod.rs(+1 LOC)
  - migration/src/lib.rs(+2 LOC Migrator vec)

  Brainstorm 4 顯式拍板 Q:
  - Q1: scope A — read-only path + endpoint shape 對齊(不補 base CRUD UI、
    不違 Principle IV)
  - Q2: mapping A — 最小 mapping,只 rename rust 已有 column;缺欄位
    (userGender / userRoles / menuButtons 等)hardcode None / vec![]
  - Q3: Casbin admin row A — 補 15 row 新 migration m20260521 解 A-006
    ROLE_ADMIN 對既有 /user/* /role/* /route/* path 缺 allow
  - Q4: acceptance A — curl + psql + CDP browser smoke test 驗 base view
    真實 column render

  Acceptance:US1 P1 MVP 5/5(C-V1 image rebuild OK / C-V2 m20260521 +
  15 row 落 DB / C-V3 Soybean 5 read alias shape 對齊 5 sub-case 全 PASS /
  C-V10 CDP browser smoke 3 view + column render 3 sub-case 全 PASS)+
  US2 P2 2/2(C-V4 Administrator 5 read alias allow + shape / C-V5
  Administrator 既有 5 path allow 解 A-006)+ US3 P3 3/3(C-V6 Menu CRUD
  admin path POST/PUT/DELETE + soft delete + audit / C-V7 GeneralUser deny
  regression / C-V9 W-FA1 stack regression)+ zero-regression 1/1(C-V8
  三邊 scope:base-web/nestjs 0 diff + rust-api 8 file + 0 docker-compose
  diff)= **11/11 PASS**(對齊 spec FR-023 NFR-004、無 unit test per FR-021、
  繼承既有 service audit hook per FR-020)。

  base-web + nestjs fork **三邊零改動**(per FR-015 + FR-016 + SC-014 +
  SC-015);rust-api 改動 8 file(per SC-018 + plan structure decision);
  無 docker-compose.yml 改(對比 F10.1);W-FA1 stack 6 service healthy +
  migration exited 0 維持。

  Constitution Check 15 PASS / 9 N/A / 0 violation(Principle I RBAC
  fail-safe + Principle II Soft Delete + Audit 繼承既有 service hook +
  Principle III 雙服務協作 + Principle IV「base 不改動邊界」紀律 — 所有
  shape adaptation 集中 rust 端 + Principle V「漸進收縮」DESIGN-B 階段
  F7 完全繼承 identical per DESIGN-B §6)。

  F11/F9 implement-time finding 沿用:R-Q5(v4='' baseline、Casbin 4-field
  model implicit allow)+ R-Q6(deny path 走 casbin_envelope_adapter HTTP
  200 + envelope {code:5001, success:false})。F7 加 1 個 implement-time
  spec correction(per research.md R-Q1):既有 output/ module 已存在含
  5 entity-scoped file、F7 加 output/sys_system_manage.rs(命名修正、對齊
  sys_* prefix)為延伸既有 module 而非 establishing 新 module。

  解 spec A-006 已知差異(F9 baseline):F7 m20260521 補 ROLE_ADMIN 對
  /user/* /role/* /route/* 既有 path 的 Casbin allow row、Administrator
  用既有 path 與 alias path 兩條都通。

  F7 解鎖 F8 assign-users + base manage/* 4 view 跑通(3 view + admin path、
  not 4 view + UI CRUD per Q1)、並行可選 F12 / W-F11 / W-F6b / F13。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  # push 等 user 同意(per CLAUDE.md §5)
  ```

### Stage 2 — outer commit(rev1-admin-root via 022 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md + rust-api SHA pin、**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current  # 預期 022-manage-crud-alignment
  git status --short
  # 預期 modified: CLAUDE.md / docs/INTEGRATION-CHECKLIST.md / .specify/feature.json /
  #            rust-api(new SHA pin)
  # untracked: 無(specs/022-* 已由 /speckit-* auto_commit hook 全 commit)

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F9 pattern):
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          rust-api

  git commit -m "$(cat <<EOF
  feat(spec): F7 manage-crud-alignment — base view shape 對齊 + admin path Casbin 補位

  outer side of F7 — rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit
  為 INTEGRATION-CHECKLIST.md F7 row + rust-api SHA pin + CLAUDE.md SPECKIT marker
  + application Phase 3 進度紀錄(F9+F7 = 2/3、F8 待)+ A-006 解標記。

  改動範圍(outer):
  - CLAUDE.md SPECKIT marker 區間自動更新(Active feature 改 F7 022-*)
  - docs/INTEGRATION-CHECKLIST.md F7 row + Current Focus + 已完成里程碑
    (application Phase 3 進度 2/3、F7 解鎖 F8 + 並行 F12/W-F11/W-F6b/F13)
  - .specify/feature.json 指 specs/022-manage-crud-alignment
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**(對比 F10.1、F7 不需動 deploy 配置)。

  spec docs(specs/022-manage-crud-alignment/{spec, plan, research,
  data-model, quickstart, contracts/verification-commands, checklists/requirements,
  tasks}.md)已由 /speckit-specify + /speckit-plan + /speckit-tasks
  auto_commit hook 各自 commit、本 commit 不再重複 stage。

  Acceptance(走完 11/11、對齊 spec NFR-004):見 rust-api ${RUST_API_SHORT_SHA}
  commit body 詳細。

  Constitution Check 15 PASS / 9 N/A / 0 violation;base-web + nestjs fork
  兩邊 zero diff;W-FA1 stack 6 service healthy + migration exited 0 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F10/F10.1/F10.2/F11/F9 等 pattern、merge 後再補。

  **application Phase 3 進度**:F9(systemManage-alias-router、10 條 alias 完整
  交付)+ F7(manage-crud-alignment、5 read alias shape 對齊 + admin path Casbin
  補位)= 2/3 完成、F8 assign-users 待。F7 解 A-006 已知差異(F9 baseline)。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F7 兩段式 commit 已落(rust-api 已推 origin、outer 在本機),要不要 push outer 022-manage-crud-alignment 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 022-manage-crud-alignment
    git switch rev1-admin-root
    git merge --no-ff 022-manage-crud-alignment -m "Merge branch '022-manage-crud-alignment' into rev1-admin-root: F7 完成"
    # SHA fill follow-up commit(對齊 W-FA*/F10/F10.1/F10.2/F11/F9 pattern)
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F7" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F7 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push(per F9 經驗、auto-classifier 會擋)
    ```

**Checkpoint**:Phase 8 完成 — F7 落地、兩段式 commit 紀律遵守、A-006 解、application Phase 3 進度 2/3 完成、F8 解鎖、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational(T010) | Phase 3(stack 必須先起) | Phase 1 |
| Phase 3 US1 impl(T020-T027) | Phase 3 acceptance + 4 + 5 + 6 + 7 + 8 | Phase 1 + 2 |
| Phase 3 US1 acceptance(T040-T043) | Phase 4 + 5 + 6 + 7 + 8 | Phase 3 impl + rust-api image rebuild |
| Phase 4 US2(T050+T051) | Phase 5 + 7 | Phase 3 acceptance(stack 起 + migration rerun 完成) |
| Phase 5 US3(T060-T062) | Phase 7 | Phase 3 acceptance(stack with F7 image 起後 + migration rerun);T060 額外 blocked by T051(Administrator allow 對 /route/*) |
| Phase 6 Zero-regression(T070) | Phase 7 | Phase 3 impl 完成後驗 scope |
| Phase 7 Doc(T080-T081) | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit(T100-T102) | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(rust source 8 file + 4 stack acceptance C-V1 C-V2 C-V3 C-V10)
- US2(P2):純 acceptance(C-V4 Administrator 5 alias、C-V5 Administrator 既有 5 path)、依賴 US1 stack 起 + F7 migration rerun
- US3(P3):純 acceptance(C-V6 Menu CRUD + C-V7 GU deny + C-V9 stack)、依賴 US1 + US2(T060 用 T051 補的 Administrator allow 對 /route/*)

實際:**US1 = impl(rust source 8 file)+ acceptance(stack rebuild + restart + 5 sub-case shape + 3 sub-case CDP smoke);US2/US3 = acceptance only**。

## Parallel Execution

### Phase 1 部分並行
T001 序列(branch + status)、T002 [P] 並行

### Phase 2 序列
T010(stack up + baseline check)序列、blocking Phase 3+

### Phase 3 半並行(within phase)
- T020 [P](output/sys_system_manage.rs 新建)獨立、並行於 T022/T025
- T021(output/mod.rs)序列、接 T020
- T022 [P](sys_system_manage_api.rs 新建)獨立、依賴 T020(Output DTO)+ T021(re-export)
- T023(api/mod.rs)序列、接 T022
- T024(router/sys_system_manage_route.rs)序列、接 T023(SysSystemManageApi import)
- T025 [P](migration 新檔)獨立、可平行於 T020-T024 全程
- T026(migration mod.rs)序列、接 T025
- T027(migration lib.rs)序列、接 T026
- T040(rebuild image)序列、接 T020-T027 全 done
- T041(restart stack)序列、接 T040
- T042(C-V2 + C-V3)序列、接 T041
- T043(C-V10 CDP smoke)序列、接 T042

### Phase 4 部分並行
- T050(C-V4 Administrator alias)序列、接 T041 stack 起後
- T051(C-V5 Administrator 既有 path)序列、接 T041、可平行於 T050

### Phase 5 部分並行
- T060(C-V6 Menu CRUD)序列、接 T051(需要 Administrator 對 /route/* allow);可平行於 T061+T062
- T061(C-V7 GU deny)+ T062(C-V9 stack ps)接 T041、可平行於 T060/T051

### Phase 6 全可並行
T070 [P] 並行(獨立 git diff、接 T041 後)

### Phase 7 部分並行
T080 序列(改 INTEGRATION-CHECKLIST.md)、T081 [P](grep verify)

### Phase 8 嚴格序列
T100 → T101 → T102(兩段式 commit + push wait、無法並行)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F7 5 條 read alias 可被 Soybean 用、shape 對齊 base TS type、CDP 3 view 真實 render 驗 PASS;US2 + US3 + Zero-regression + Doc + Commit 為驗證 + 收尾 phase。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 F5.1/F6/F10.1/F10.2/F11/F9 同 session 模式)、不 US1-only commit。

**並行 vs 序列建議**:
- 全 26 task 預估時間 60-90 分鐘(rust image rebuild 占 3-7 min、cargo unit test 跳過 per FR-021、其他 task 各 30s-2 min、CDP smoke ~5-10s/sub-case;rust source 改 8 file 為主要時間)
- Critical path:T001 → T002 → T010 → T020/T025(並行)→ T021/T022 → T023 → T024 → T026 → T027 → T040 → T041 → T042 → T043 → T050/T051(並行)→ T060(接 T051)/T061/T062(並行)→ T070(並行)→ T080/T081(並行)→ T100 → T101 → T102

**故障排查**(per quickstart 故障排查段、對齊 spec.md R-1 ~ R-7):
- T020 cargo error:check sys_system_manage.rs imports(NaiveDateTime / Serialize / MenuType / Status / sys_menu/sys_role/sys_user / MenuTree / tracing::warn)+ struct field 拼字 + From impl 完整
- T021 cargo error:output/mod.rs re-export 拼字 / SystemManage* 全 5 個 DTO 列入
- T022 cargo error:sys_system_manage_api.rs imports(Extension / Arc / PaginatedData / Res / AppError + 5 Output DTO + 3 service)+ 5 handler signature 對齊既有 SysRoleApi/SysUserApi/SysMenuApi
- T024 cargo error:sys_system_manage_route.rs import 加 SysSystemManageApi、5 條 mount 換 handler
- T040 build fail:cargo dependency / mod re-export 漏 → 檢 build log;unused import → cargo `-D warnings` 嚴格、check imports referenced(per F9 implement-time finding 沿用)
- T041 stack restart loop:handler panic / migration UNIQUE constraint fail / 5 條 mount 換 handler 編譯期不對 → 檢 docker compose logs rust-api / migration
- T042 C-V2 COUNT < 15:m20260521 沒跑、檢 register;COUNT > 15 idempotency bug
- T042 C-V3 shape 不對齊:handler 沒 call `.into()` / router mount 仍指 F9 handler / DTO field rename 漏(check `#[serde(rename_all = "camelCase")]` + 各 field 名)
- T043 CDP fail:Edge 148 沒 launched / WSL2 networking 不 mirrored / SPA route 沒 navigate;graceful degradation 為手動 visual eyeball
- T050 envelope code:5001:F9 m20260520 對 ROLE_ADMIN allow row 漏 → check psql casbin_rule(理論上 F9 acceptance 已驗,不應發生)
- T051 envelope code:5001:F7 m20260521 對應 row 漏、check FR-012 15 row 完整
- T060 envelope code:5001:F7 m20260521 對 /route/ POST/PUT/DELETE row 漏、check FR-012;HTTP 200 但 deleted_at IS NULL → 既有 service 沒 trigger soft delete(F3 facade 漏、留 follow-up);sys_operation_log 0 row → 既有 service 沒 trigger audit(F2.1 hook 漏、留 follow-up)
- T061 envelope code:0 對 GeneralUser:F7 誤對 ROLE_USER allow、check FR-012 15 row 不該含 ROLE_USER
- T062 stack 非 6 healthy:意外退化、abort F7 + 檢 docker compose logs <service>
- T070 git diff > 0 在 base-web/nestjs:意外改動、abort F7 + 改正
- T100 conventional commit hook fail:檢 message format、必要時調整 + 新建 NEW commit(per CLAUDE.md §5、不 amend)

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T043 [US1] / T050-T051 [US2] / T060-T062 [US3]) |
| Setup / Foundational / Zero-regression / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照、T002/T020/T022/T025/T070/T081 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
