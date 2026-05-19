---
description: "Task list for F9 — systemManage-alias-router implementation"
---

# Tasks: F9 — systemManage-alias-router

**Input**: Design documents from `/specs/021-systemmanage-alias-router/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F9 為 rust source change feature(類 F5.1/F6/F10.1/F10.2/F11 兩段式 commit)、**無 rust unit test**(per spec FR-017 + F11 Q3 同精神、wrapper 邏輯 stack-可見、batchDelete loop 簡單)
- Acceptance compensate:curl + psql + audit log grep 三類驗證(per spec FR-019)
- **Acceptance**:per spec US1 P1 5 + US2 P2 1 + US3 P3 3 + zero-regression 1 = **10 個 scenario**(對齊 10 個 C-V、per NFR-004)

**Organization**:F9 為 3 user story feature、Setup(2)+ Foundational(1)+ US1 impl(12 task per data-model E1-E10)+ US1 acceptance(4)+ US2 acceptance(1)+ US3 acceptance(3)+ Zero-regression(1)+ Doc(2)+ 兩段式 Commit(3)= **29 task**(對齊 NFR-002 ~22-25 task 範圍上限略超、因 F9 跨 user/role/menu 3 entity + service layer 而比 F11 多)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F9 row + Current Focus + 已完成里程碑)
  - 改:`CLAUDE.md` §10 active feature(SOP hook 已處理、`/speckit-plan` 已 update 指 021)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
- **Worktree(改、`rust-api/`、~315 LOC、12 file、per R-Q1 spec correction):**
  - 改:`rust-api/server/api/src/admin/sys_user_api.rs`(+2 handler、~40 LOC、per R-Q1 不需 `update_user_post`)
  - 改:`rust-api/server/api/src/admin/sys_role_api.rs`(+1 handler `get_all_roles`、~25 LOC)
  - 改:`rust-api/server/api/src/admin/sys_menu_api.rs`(+1 handler `get_all_pages`、~20 LOC)
  - 改:`rust-api/server/service/src/admin/sys_role_service.rs`(+trait + impl `find_all_enabled`、~20 LOC)
  - 改:`rust-api/server/service/src/admin/sys_menu_service.rs`(+trait + impl `find_all_page_keys`、~15 LOC)
  - 改:`rust-api/server/model/src/admin/input/sys_user.rs`(+2 DTO、~15 LOC、對齊既有 `UpdateUserInput` 同檔)
  - 新建:`rust-api/server/router/src/admin/sys_system_manage_route.rs`(`SysSystemManageRouter` + 10 條 mount + 10 RouteInfo、~80 LOC)
  - 改:`rust-api/server/router/src/admin/mod.rs`(+1 LOC `pub mod sys_system_manage_route;`)
  - 改:`rust-api/server/initialize/src/router_initialization.rs`(import `SysSystemManageRouter` + `merge_router!(true, true, None)` register、~8 LOC)
  - 新建:`rust-api/migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`(~80 LOC、INSERT 20 row + DELETE 20 row)
  - 改:`rust-api/migration/src/datas/mod.rs`(+1 LOC + lib register)
  - 改:`rust-api/migration/src/lib.rs`(+2 LOC Migrator vec)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-010 + FR-011);rust-api 其他 file 不動(per FR-014 不改既有 m20241024)
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` 等 host-side bash)
- **Image / artifact**:F9 需 rebuild rust-api docker image(per Step 3、warm ~3-5 min、cold ~5-7 min)
- **無 docker-compose.yml 改**(對比 F10.1)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `021-systemmanage-alias-router` + rust-api worktree branch = `rev1-admin-rust-api`、F11 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F11 完成|F11 extracted-stubs' | head -3 && cd rust-api && git branch --show-current && git status --short && cd ..`(預期 outer branch=021-*、rust-api branch=rev1-admin-rust-api、history 含 F11 merge `81ecb0d`、rust-api worktree clean)

- [ ] T002 [P] 確認 W-FA1 stack 可起 + F11 baseline 仍 work,執行 `docker images rust-api:rev1-admin-rust-api -q && docker images nestjs:rev1-admin-nestjs -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -5`(預期 image SHA 兩個都非空、compose config 無 error)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起 + F11 baseline 仍 work + F5.1 seed user/role/menu 在 DB(F9 acceptance 需 login + 反映 sys_role/sys_menu 資料)。

- [ ] T010 起 7 service stack(若未起)、確認 F11 baseline 仍 work + 確認 seed user 存在:`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0);如未授權跑 psql 預檢、跳過(F9 acceptance 階段會驗 F5.1 seed)。

---

## Phase 3: User Story 1 — Soybean 10 條 alias allow + 行為對齊(Priority: P1)🎯 MVP

**Goal**:rust 10 條 `/systemManage/*` alias endpoint 註冊成功 + Casbin policy allow 對 ROLE_SUPER 生效 + 5 重用 mount + 1 重用 method 變(updateUser POST mount 既有 PUT handler per R-Q1)+ 1 變形 wrapper(deleteUser body 抽 id)+ 2 新做完整(getAllRoles / getAllPages)+ 1 新做 stub(batchDeleteUser counter)行為對齊;落地後 Soybean 10 endpoint 全 HTTP 200 + 預期 response shape + sys_operation_log audit 寫入。

**Independent Test**:用 `Soybean` user login 拿 access_token → 用該 token 跑 10 條 alias endpoint(11 sub-case 含 addUser create test user)→ 預期 10/10 endpoint HTTP 200 + 預期 response shape(`getRoleList → paginated` / `getAllRoles → Vec<Role>` / `getUserList → paginated` / `addUser → User` / `updateUser → User` / `deleteUser → null` / `batchDeleteUser → {deletedCount: N}` / `getMenuList/v2 → MenuTree array` / `getAllPages → Vec<String>` / `getMenuTree → MenuTree array`)+ sys_operation_log batchDelete audit ≥ 1 row。

### US1 implementation(rust source patch、~315 LOC、12 file、per R-Q1 修正)

- [ ] T020 [P] [US1] 改 `rust-api/server/model/src/admin/input/sys_user.rs`(per data-model.md §E7):加 2 個 DTO 在既有 `UpdateUserInput` / `CreateUserInput` 之後:
  - `DeleteUserByBodyInput { id: String }`(`#[derive(Debug, Deserialize)]`)
  - `BatchDeleteUserInput { ids: Vec<String> }`
  - `use serde::Deserialize;` 若既有未 import 則加
  - re-export 視 `rust-api/server/model/src/admin/input/mod.rs` 既有 pattern(對齊 `UpdateUserInput` re-export)
  - 不加 `validator::Validate` derive(per FR-018 + F11 Q3)
  - ~15 LOC

- [ ] T021 [P] [US1] 改 `rust-api/server/service/src/admin/sys_role_service.rs`(per data-model.md §E4):
  - `TRoleService` trait 加 `async fn find_all_enabled(&self) -> Result<Vec<SysRoleModel>, AppError>;`
  - `SysRoleService impl` 加 `find_all_enabled` 實作:`SysRoleModel::Entity::find().filter(sys_role::Column::Status.eq(Status::Enabled as i16)).filter(sys_role::Column::DeletedAt.is_null()).all(db.as_ref()).await`
  - imports 加 `Status` enum + `sys_role::Column` + `ColumnTrait` / `QueryFilter`(grep 既有 service 對齊 path)
  - ~20 LOC

- [ ] T022 [P] [US1] 改 `rust-api/server/service/src/admin/sys_menu_service.rs`(per data-model.md §E5):
  - `TMenuService` trait 加 `async fn find_all_page_keys(&self) -> Result<Vec<String>, AppError>;`
  - `SysMenuService impl` 加 `find_all_page_keys` 實作:`SysMenuModel::Entity::find().select_only().column(sys_menu::Column::Name).distinct().filter(sys_menu::Column::DeletedAt.is_null()).into_tuple::<(String,)>().all(db.as_ref()).await.map(|rows| rows.into_iter().map(|(name,)| name).collect())`
  - ~15 LOC

- [ ] T023 [US1] 改 `rust-api/server/api/src/admin/sys_user_api.rs`(per data-model.md §E1、R-Q1 修正 — **不加 `update_user_post`**):在既有 8 handler 後加 2 個新 handler:
  - `delete_user_by_body`(per R-Q4):`Extension<Arc<SysUserService>>` + `Extension<User>` + `Json<DeleteUserByBodyInput>` → call `service.delete_user(&input.id, &actor)`、回 `Res<()>`
  - `batch_delete_users`(per spec FR-004 + Q3):`Json<BatchDeleteUserInput>` → `for id in &input.ids { match service.delete_user(id, &actor).await { Ok(_) => count += 1, Err(_) => continue } }` → 回 `Res<serde_json::Value>` with `json!({ "deletedCount": deleted_count })`
  - imports 加 `axum::Json` / `serde_json::{json, Value}` / DTO from `server_service::admin::{DeleteUserByBodyInput, BatchDeleteUserInput}`
  - ~40 LOC、依賴 T020(DTO)

- [ ] T024 [US1] 改 `rust-api/server/api/src/admin/sys_role_api.rs`(per data-model.md §E2):加 1 個 handler `get_all_roles`:`Extension<Arc<SysRoleService>>` → call `service.find_all_enabled()` → 回 `Res<Vec<SysRoleModel>>`、~25 LOC、依賴 T021(service method)

- [ ] T025 [US1] 改 `rust-api/server/api/src/admin/sys_menu_api.rs`(per data-model.md §E3):加 1 個 handler `get_all_pages`:`Extension<Arc<SysMenuService>>` → call `service.find_all_page_keys()` → 回 `Res<Vec<String>>`、~20 LOC、依賴 T022(service method)

- [ ] T026 [US1] 新建 `rust-api/server/router/src/admin/sys_system_manage_route.rs`(per data-model.md §E6):`SysSystemManageRouter` struct + `init_router()` 含:
  - 10 個 `RouteInfo::new(...)` + `add_route(route).await` loop(per 既有 `sys_authentication_route.rs` pattern)
  - 10 條 `.route(...)` mount(對齊 R-Q1 — updateUser 用 `post(SysUserApi::update_user)` 直接 mount 既有 handler):
    - `.route("/getRoleList",     get(SysRoleApi::get_paginated_roles))`
    - `.route("/getAllRoles",     get(SysRoleApi::get_all_roles))`
    - `.route("/getUserList",     get(SysUserApi::get_paginated_users))`
    - `.route("/addUser",         post(SysUserApi::create_user))`
    - `.route("/updateUser",      post(SysUserApi::update_user))`  // per R-Q1 直接 mount 既有
    - `.route("/deleteUser",      delete(SysUserApi::delete_user_by_body))`
    - `.route("/batchDeleteUser", delete(SysUserApi::batch_delete_users))`
    - `.route("/getMenuList/v2",  get(SysMenuApi::get_menu_list))`  // per R-Q5 字面 path
    - `.route("/getAllPages",     get(SysMenuApi::get_all_pages))`
    - `.route("/getMenuTree",     get(SysMenuApi::tree_menu))`
  - `Router::new().nest("/systemManage", router)`
  - imports:`axum::{http::Method, routing::{delete, get, post}, Router}` / `server_api::admin::{SysMenuApi, SysRoleApi, SysUserApi}` / `server_global::global::{add_route, RouteInfo}`
  - ~80 LOC、依賴 T023/T024/T025(handler)

- [ ] T027 [US1] 改 `rust-api/server/router/src/admin/mod.rs`(per data-model.md §E6 Module register):加 1 行 `pub mod sys_system_manage_route;` + `pub use sys_system_manage_route::SysSystemManageRouter;`(對齊既有 `Sys*Router` re-export 慣例)、~1-2 LOC、接 T026

- [ ] T028 [US1] 改 `rust-api/server/initialize/src/router_initialization.rs`(per data-model.md §E6 register):
  - file 頭 import block 加 `SysSystemManageRouter`(`use server_router::admin::{ ..., SysSystemManageRouter, ... };`)
  - 在既有 `SysSandboxRouter` 或 F11 `SysMockRouter` register block 後、`// W-F1 T020: public /health route` 之前加:
    ```rust
    // F9 systemManage-alias-router: 10 條 alias router(JWT auth + Casbin enforce、無 service 額外注入)
    merge_router!(
        SysSystemManageRouter::init_router().await,
        None,
        true,
        true,
        None
    );
    ```
  - ~8 LOC、接 T027

- [ ] T029 [P] [US1] 新建 `rust-api/migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`(per data-model.md §E8、F11 m20260519 pattern + R-Q5 v4='' baseline):`MigrationTrait` impl + `up()` raw SQL INSERT 20 row(2 role × 10 endpoint、全 v4='')+ `down()` DELETE(`WHERE ptype='p' AND v1='built-in' AND v2 LIKE '/systemManage/%' AND v0 IN ('ROLE_SUPER', 'ROLE_ADMIN')`)、~80 LOC

- [ ] T030 [US1] 改 `rust-api/migration/src/datas/mod.rs` + `rust-api/migration/src/lib.rs`(per data-model.md §E8 Module register):
  - `datas/mod.rs`:加 `pub mod m20260520_a_f9_system_manage_alias_seed;`
  - `lib.rs`:在 `Migrator::migrations()` vec 加 `Box::new(m20260520_a_f9_system_manage_alias_seed::Migration)`(對齊 `m20260519_a_f11` register location)
  - ~3 LOC、接 T029

- [ ] T031 [US1] **DTO re-export**:改 `rust-api/server/model/src/admin/input/mod.rs`(若用顯式 re-export pattern):加 `pub use sys_user::{DeleteUserByBodyInput, BatchDeleteUserInput};`(對齊既有 `UpdateUserInput` re-export)、若 mod.rs 用 glob `pub use sys_user::*;` 則跳過。接 T020、可能 0 行改動(視 mod.rs pattern)

### US1 stack acceptance(對齊 contracts/verification-commands.md C-V1~C-V5)

- [ ] T040 [US1] **C-V1** rebuild rust-api docker image(per Step 3 of quickstart):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -5
  ```
  預期 warm ~3-5 min / cold ~5-7 min(per NFR-005;若 fail → check cargo build output、可能 trait method 漏實作 / DTO re-export 漏 / handler import 缺漏)
  接 T020-T031 全 done

- [ ] T041 [US1] 起 stack(force-recreate migration + rust-api、其他 service 不動、F9 migration init container 自動 rerun):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -10
  docker compose logs migration --tail=10
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 migration log 含 `Applying migration 'm20260520_a_f9...'` + rust-api 重啟 healthy + 其他 5 service 仍 healthy + migration init container exited 0
  接 T040

- [ ] T042 [US1] **C-V3 + C-V4 + C-V5 inline**(per contracts/verification-commands.md):
  ```bash
  LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

  # C-V3 5 重用 mount:getRoleList / getUserList / getMenuList/v2 / getMenuTree
  # C-V4 4 變形 + 新做:addUser(create test user)+ updateUser POST + deleteUser body + batchDeleteUser
  # C-V5 2 新做完整:getAllRoles + getAllPages
  # ... (per contracts/verification-commands.md C-V3a-d + C-V4a-d + C-V5a-b)
  ```
  預期:11 個 sub-case 全 HTTP 200(C-V3: 4 + C-V4: 4 含 batchDelete `{deletedCount: N}` + C-V5: 2 + C-V3c getMenuList/v2 axum static path verify)、envelope `{code:0, data, msg:"success", success:true}` 對齊各 endpoint shape
  接 T041

- [ ] T043 [US1] **C-V7 audit log 寫入驗**(per spec US1.5 + FR-016):
  ```bash
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT user_id, operation, created_at FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '5 minutes' AND operation LIKE '%delete%user%' ORDER BY created_at DESC LIMIT 10"
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT COUNT(*) FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '5 minutes' AND operation LIKE '%delete%user%'"
  ```
  預期 COUNT ≥ 1(batchDelete per-row 觸發既有 service audit hook、繼承 §1.5);若 COUNT = 0 但 batchDelete 顯示 `{deletedCount: > 0}` → 既有 service.delete_user 可能無 audit hook 在 service 層、留 follow-up 觀察
  接 T042

**Checkpoint**:US1 完成 — 10 條 alias endpoint Soybean allow path 全通、F9 核心交付完成。

---

## Phase 4: User Story 2 — GeneralUser deny(Priority: P2)

**Goal**:Casbin policy deny GeneralUser(ROLE_USER)對 F9 alias endpoint 生效、RBAC fail-safe 紀律維持(per Principle I + F11 R-Q6 envelope wrap)。

**Independent Test**:用 `GeneralUser` user login 拿 access_token → curl `getUserList`(代表 endpoint)→ 預期 HTTP 200 + envelope `{code:5001, success:false}`。

### US2 acceptance(對齊 C-V6)

- [ ] T050 [US2] **C-V6 GeneralUser deny verify**(per F11 R-Q6 envelope wrap):
  ```bash
  GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  curl -s -w "\n---HTTP %{http_code}\n" \
    -H "Authorization: Bearer $GU_TOKEN" \
    http://127.0.0.1:11080/api/systemManage/getUserList
  ```
  預期 HTTP **200** + envelope `{code:5001, data:null, msg:"您没有访问该资源的权限，请联系管理员", success:false}`(per F11 R-Q6 `casbin_envelope_adapter` wrap)、不含 `{code:0, data: paginated}` allow path
  接 T041 stack 起後

**Checkpoint**:US2 完成 — Casbin enforce 對 ROLE_USER deny 確認、Principle I fail-safe PASS。

---

## Phase 5: User Story 3 — Casbin migration + W-FA1 stack regression + 既有 endpoint 不退化(Priority: P3)

**Goal**:F9 Casbin migration `m20260520_a_f9` 真執行、20 row 落 casbin_rule + W-FA1 stack 6 service 仍 healthy + 既有 `/user/*` `/role/*` `/route/*` 3 條 endpoint 不退化(per FR-014 + Principle IV)。

**Independent Test**:psql 查 casbin_rule `WHERE v2 LIKE '/systemManage/%'` 回 20 row + `docker compose ps` 6 healthy + curl 既有 endpoint 3 條全通。

### US3 acceptance(對齊 C-V2 + C-V9 + C-V10)

- [ ] T060 [US3] **C-V2 Casbin migration row 驗**:
  ```bash
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT v0, v2, v3 FROM casbin_rule WHERE v2 LIKE '/systemManage/%' ORDER BY v0, v2"
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT COUNT(*) FROM casbin_rule WHERE v2 LIKE '/systemManage/%'"
  ```
  預期 20 row(2 role × 10 endpoint、ROLE_SUPER + ROLE_ADMIN 各 10、v4 全空字串 per F11 R-Q5)、COUNT = 20(per spec FR-008 + SC-007)
  接 T041

- [ ] T061 [US3] **C-V9 W-FA1 stack regression**:
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ rust-api uptime 較短(剛 recreated)+ migration exited 0(per SC-008 + FR-021)
  接 T041、可平行於 T060

- [ ] T062 [US3] **C-V10 既有 endpoint 不退化驗**(per spec US3.3 + SC-009 + FR-014 + Principle IV):
  ```bash
  curl -s -w "\n---HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/user/?page=1&size=10"
  curl -s -w "\n---HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/role/?page=1&size=10"
  curl -s -w "\n---HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://127.0.0.1:11080/api/route/tree
  ```
  預期 3/3 HTTP 200 + envelope `{code:0, data:..., msg:"success", success:true}` 對齊 F9 落地前行為(F9 不動既有 router、既有 m20241024 Casbin 未動);若 envelope code:5001 → F9 誤動既有 Casbin、abort + check git diff
  接 T041、可平行於 T060/T061

**Checkpoint**:US3 完成 — Casbin policy 20 row 落 DB + W-FA1 stack regression PASS + 既有 endpoint 不退化。

---

## Phase 6: Zero-regression(對齊 W-F* / W-FA* / F10 / F10.1 / F10.2 / F11 標配)

**Goal**:base-web + nestjs fork 零改動 + rust-api scope 收緊到 12 file(per spec SC-011 + SC-012 + SC-013 + plan structure decision)。

### Zero-regression verification

- [ ] T070 [P] **C-V8 three-side scope verify**(per contracts):
  ```bash
  echo "=== base-web/src/ diff lines (預期 0) ==="
  git diff HEAD -- base-web/src/ | wc -l

  echo "=== fork260509-soybean-admin-nestjs/ diff lines (預期 0) ==="
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l

  echo "=== rust-api scope (預期 12 file ~315 LOC、per R-Q1 修正) ==="
  (cd rust-api && git diff HEAD --stat)
  (cd rust-api && git status --short)

  echo "=== docker-compose 變動 (預期 0) ==="
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l

  echo "=== outer scope (預期 CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + rust-api gitlink + specs/021-* untracked) ==="
  git status --short
  ```
  預期:per spec SC-011 + SC-012 + SC-013 + plan structure decision、4 個 0 line + rust-api 12 file(7 改 + 3 新建 + 2 register/mod)+ outer 4 file + 1 untracked dir
  接 T041 後、可平行於 T060-T062

**Checkpoint**:Phase 6 完成 — 三邊 scope 對齊驗證 PASS。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc 反映 F9 落地。

- [ ] T080 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-025):
  - Current Focus 三段更新(Phase / Active feature 改 F9、F9 outer commit pending push / 下一步並行候選)
  - 已完成里程碑加 F9 條目(對齊 F11 同 application-phase style + 兩段式 commit、SHA placeholder)
  - 加新「DESIGN-A §4.2 抽離項清單交付進度」紀錄(5/5 完成、F11 4 條 + F9 batchDeleteUser 1 條收尾)
  - 列 F9 後 next-step:F7 / F12 / W-F11 / W-F6b / F13 / F14 並行 / 後續候選(per spec Dependencies「並行可選」段)

- [ ] T081 [P] **doc grep verify**:
  ```bash
  grep -cE "F9\b|systemManage-alias-router|systemmanage-alias-router" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F9" docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:≥ 5 match、INTEGRATION-CHECKLIST.md 多處 F9 引用(Current Focus + 已完成里程碑 + DESIGN-A §4.2 5/5 進度)

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.1/F10.2/F11 慣例)

**Goal**:落實**兩段式 commit** 紀律(F9 動 rust-api worktree、純 outer 不夠)、push 等 user 同意。

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short
  # 預期 modified + new file:12 file total

  git add server/api/src/admin/sys_user_api.rs \
          server/api/src/admin/sys_role_api.rs \
          server/api/src/admin/sys_menu_api.rs \
          server/service/src/admin/sys_role_service.rs \
          server/service/src/admin/sys_menu_service.rs \
          server/model/src/admin/input/sys_user.rs \
          server/model/src/admin/input/mod.rs \
          server/router/src/admin/sys_system_manage_route.rs \
          server/router/src/admin/mod.rs \
          server/initialize/src/router_initialization.rs \
          migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs \
          migration/src/datas/mod.rs \
          migration/src/lib.rs

  git commit -m "$(cat <<'EOF'
  feat(rust-api): F9 補 10 條 /systemManage/* alias router + Casbin policy seed

  rev1 DESIGN-A §4.2 抽離項清單收尾 feature(F11 補 4 條 stub 後接續、F9 補最後
  1 條 batchDeleteUser stub + 完整 9 條 /systemManage/* alias = 10 條完整交付)。
  RESEARCH §6.2 方案 B「rust 加 /systemManage/* alias router、重用既有 service」
  直譯實作。

  10 條 alias endpoint:
  - GET /getRoleList → 重用 SysRoleApi::get_paginated_roles
  - GET /getAllRoles → 新做 SysRoleService::find_all_enabled
  - GET /getUserList → 重用 SysUserApi::get_paginated_users
  - POST /addUser → 重用 SysUserApi::create_user
  - POST /updateUser → 重用 SysUserApi::update_user(per R-Q1 既有 handler
    method-agnostic、不需新做 update_user_post wrapper)
  - DELETE /deleteUser → 變形 wrapper delete_user_by_body(body 抽 id)
  - DELETE /batchDeleteUser → 新 stub batch_delete_users(per-row loop +
    {deletedCount: N} partial counter)
  - GET /getMenuList/v2 → 重用 SysMenuApi::get_menu_list
  - GET /getAllPages → 新做 SysMenuService::find_all_page_keys 簡 SQL
    (SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL)
  - GET /getMenuTree → 重用 SysMenuApi::tree_menu

  加 1 個 Casbin policy seed migration(m20260520_a_f9_system_manage_alias_seed.rs):
  INSERT 20 row(ROLE_SUPER + ROLE_ADMIN × 10 endpoint × p policy with v4=''、
  per F11 R-Q5 baseline);GeneralUser(ROLE_USER)default deny。

  改動範圍(rust-api、12 file、~315 LOC、per R-Q1 修正):
  - server/api/src/admin/sys_user_api.rs(+2 handler delete_user_by_body +
    batch_delete_users、~40 LOC、per R-Q1 不需 update_user_post)
  - server/api/src/admin/sys_role_api.rs(+1 handler get_all_roles、~25 LOC)
  - server/api/src/admin/sys_menu_api.rs(+1 handler get_all_pages、~20 LOC)
  - server/service/src/admin/sys_role_service.rs(+trait + impl find_all_enabled、~20 LOC)
  - server/service/src/admin/sys_menu_service.rs(+trait + impl find_all_page_keys、~15 LOC)
  - server/model/src/admin/input/sys_user.rs(+2 DTO DeleteUserByBodyInput +
    BatchDeleteUserInput、~15 LOC、對齊既有 UpdateUserInput 同檔)
  - server/router/src/admin/sys_system_manage_route.rs(新建 SysSystemManageRouter
    + 10 條 mount + 10 RouteInfo、~80 LOC)
  - server/router/src/admin/mod.rs(+1 LOC + re-export)
  - server/initialize/src/router_initialization.rs(import + register +
    merge_router!(true, true, None)、~8 LOC)
  - migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs(新建 ~80 LOC)
  - migration/src/datas/mod.rs(+1 LOC)
  - migration/src/lib.rs(+2 LOC Migrator vec)

  Brainstorm 5 顯式拍板 Q:
  - Q1: getAllRoles 完整 + getAllPages 簡 SQL(實質升級為最簡實作)
  - Q2: alias 路徑 + curl 驗 + base-web src 0 diff(B3 camelCase 留 follow-up)
  - Q3: batchDeleteUser per-row loop + 永遠 200 + {deletedCount: N} partial counted
  - Q4: wrapper handler 加 entity 檔、route 集中新建 sys_system_manage_route.rs
  - Q5: getAllPages 回 menu 表 name list 簡單 SQL

  Acceptance:US1 P1 MVP 5/5(C-V1 image rebuild OK / C-V3 Soybean 5 重用 mount
  4 sub-case 全 HTTP 200 / C-V4 4 變形+新做 endpoint 含 batchDelete counter /
  C-V5 2 新做完整 handler / C-V7 audit log ≥ 1 row)+ US2 P2 1/1(C-V6 GeneralUser
  getUserList HTTP 200 + envelope {code:5001, success:false} per R-Q6)+ US3 P3 3/3
  (C-V2 psql casbin_rule 20 row + C-V9 W-FA1 6 service healthy + C-V10 既有
  /user/ /role/ /route/tree 3 條不退化)+ zero-regression 1/1(C-V8 三邊 scope:
  base-web/nestjs 0 diff + rust-api 12 file + 0 docker-compose diff)= **10/10 PASS**
  (對齊 spec FR-021 NFR-004、無 unit test、繼承既有 service audit hook
  per FR-016)。

  base-web + nestjs fork **三邊零改動**(per FR-010 + FR-011 + SC-011 + SC-012);
  rust-api 改動 12 file(per SC-015 + plan structure decision);無 docker-compose.yml
  改(對比 F10.1);W-FA1 stack 6 service healthy + migration exited 0 維持。

  Constitution Check 25 PASS / 7 N/A / 0 violation(Principle I RBAC fail-safe
  + Principle II Soft Delete + Audit 繼承既有 service hook + Principle IV「base
  不改動」紀律 — RESEARCH §6.2 方案 B 後端適應 base API 預期 + Principle V「漸進
  收縮」DESIGN-B 階段 F9 alias 完全繼承 identical)。

  F11 implement-time finding 沿用:R-Q5(v4='' baseline、Casbin 4-field model
  implicit allow)+ R-Q6(deny path 走 casbin_envelope_adapter HTTP 200 + envelope
  {code:5001, success:false})。F9 1 個 implement-time spec correction
  (per research.md R-Q1):既有 update_user handler method-agnostic、F9 alias
  直接 mount with POST、不需新做 update_user_post wrapper;spec.md FR-002 +
  Section 1 表已對齊修正。

  DESIGN-A §4.2 抽離項清單交付進度:**5 / 5 完成**(F11 4 條 sendCaptcha /
  verifyCaptcha / auth/error / mock/getLastTime + F9 1 條 batchDeleteUser = 5/5)。
  F9 解鎖 F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover、並行可選
  F7 / F12 / W-F11 / W-F6b。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  # push 等 user 同意(per CLAUDE.md §5)
  ```

### Stage 2 — outer commit(rev1-admin-root via 021 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md + rust-api SHA pin、**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current  # 預期 021-systemmanage-alias-router
  git status --short
  # 預期 modified: CLAUDE.md / docs/INTEGRATION-CHECKLIST.md / .specify/feature.json /
  #            rust-api(new SHA pin)
  # untracked: 無(specs/021-* 已由 /speckit-* auto_commit hook 全 commit)

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F11 pattern):
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          rust-api

  git commit -m "$(cat <<EOF
  feat(spec): F9 systemManage-alias-router — 10 條 alias 完整交付 + DESIGN-A §4.2 5/5 收尾

  outer side of F9 — rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit
  為 INTEGRATION-CHECKLIST.md F9 row + rust-api SHA pin + CLAUDE.md SPECKIT marker
  + DESIGN-A §4.2 抽離項清單 5/5 完成紀錄。

  改動範圍(outer):
  - CLAUDE.md SPECKIT marker 區間自動更新(Active feature 改 F9 021-*)
  - docs/INTEGRATION-CHECKLIST.md F9 row + Current Focus + 已完成里程碑
    (DESIGN-A §4.2 抽離項清單 5/5 進度、F9 解鎖 F13/F14 + 並行 F7/F12)
  - .specify/feature.json 指 specs/021-systemmanage-alias-router
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**(對比 F10.1、F9 不需動 deploy 配置)。

  spec docs(specs/021-systemmanage-alias-router/{spec, plan, research,
  data-model, quickstart, contracts/verification-commands, checklists/requirements,
  tasks}.md)已由 /speckit-specify + /speckit-clarify + /speckit-plan + /speckit-tasks
  auto_commit hook 各自 commit(e2596f8 spec / 0a9f4dc plan + research + data-model
  + contracts + quickstart)、本 commit 不再重複 stage。

  Acceptance(走完 10/10、對齊 spec NFR-004):見 rust-api ${RUST_API_SHORT_SHA}
  commit body 詳細。

  Constitution Check 25 PASS / 7 N/A / 0 violation(Principle I RBAC fail-safe
  + Principle II Soft Delete + Audit + Principle IV 「base 不改動」+ Principle V
  漸進收縮 — DESIGN-B 階段 F9 alias 完全繼承);base-web + nestjs fork 兩邊
  zero diff;W-FA1 stack 6 service healthy + migration exited 0 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F10/F10.1/F10.2/F11 等 pattern、merge 後再補。

  **DESIGN-A §4.2 抽離項清單交付進度 5 / 5 完成**(F11 4 條 + F9 batchDeleteUser
  1 條)。F9 解鎖 F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover、並行
  可選 F7 / F12 / W-F11 / W-F6b。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F9 兩段式 commit 已落(rust-api 已推 origin、outer 在本機),要不要 push outer 021-systemmanage-alias-router 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 021-systemmanage-alias-router
    git switch rev1-admin-root
    git merge --no-ff 021-systemmanage-alias-router -m "Merge branch '021-systemmanage-alias-router' into rev1-admin-root: F9 完成"
    # SHA fill follow-up commit(對齊 W-FA*/F10/F10.1/F10.2/F11 pattern)
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F9" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F9 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push(per F11 經驗、auto-classifier 會擋)
    ```

**Checkpoint**:Phase 8 完成 — F9 落地、兩段式 commit 紀律遵守、DESIGN-A §4.2 抽離項清單 **5/5 完成**、F13/F14 解鎖、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational(T010) | Phase 3(stack 必須先起) | Phase 1 |
| Phase 3 US1 impl(T020-T031) | Phase 3 acceptance + 4 + 5 + 6 + 7 + 8 | Phase 1 + 2 |
| Phase 3 US1 acceptance(T040-T043) | Phase 4 + 5 + 6 + 7 + 8 | Phase 3 impl + rust-api image rebuild |
| Phase 4 US2(T050) | Phase 7 | Phase 3 acceptance(stack 起 + Casbin migration rerun 完成) |
| Phase 5 US3(T060-T062) | Phase 7 | Phase 3 acceptance(stack with F9 image 起後 + migration rerun) |
| Phase 6 Zero-regression(T070) | Phase 7 | Phase 3 impl 完成後驗 scope |
| Phase 7 Doc(T080-T081) | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit(T100-T102) | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(rust source 12 file + 4 stack acceptance C-V1 C-V3 C-V4 C-V5 + 1 audit C-V7)
- US2(P2):純 acceptance(C-V6 GeneralUser deny)、依賴 US1 stack 起 + Casbin migration rerun
- US3(P3):純 acceptance(C-V2 psql + C-V9 stack ps + C-V10 既有 endpoint 不退化)、依賴 US1 stack 起 + Casbin migration rerun

實際:**US1 = impl(rust source 12 file)+ acceptance(stack rebuild + restart + 11 curl + log audit);US2/US3 = acceptance only**。

## Parallel Execution

### Phase 1 部分並行
T001 序列(branch + status)、T002 [P] 並行

### Phase 2 序列
T010(stack up + baseline check)序列、blocking Phase 3+

### Phase 3 半並行(within phase)
- T020 [P](DTO sys_user.rs)獨立、並行於 T021/T022
- T021 [P](sys_role_service.rs find_all_enabled)獨立、並行
- T022 [P](sys_menu_service.rs find_all_page_keys)獨立、並行
- T023(sys_user_api.rs 加 2 handler)序列、依賴 T020(DTO)
- T024(sys_role_api.rs 加 get_all_roles)序列、依賴 T021(service method)
- T025(sys_menu_api.rs 加 get_all_pages)序列、依賴 T022(service method)
- T026(sys_system_manage_route.rs 新建)序列、依賴 T023/T024/T025(全 handler)
- T027(router/admin/mod.rs)序列、接 T026
- T028(router_initialization.rs)序列、接 T027
- T029 [P](migration 新檔)獨立、可平行於 T020-T028 全程
- T030(migration mod.rs + lib.rs)序列、接 T029
- T031(input/mod.rs DTO re-export)序列、接 T020
- T040(rebuild image)序列、接 T020-T031 全 done
- T041(restart stack)序列、接 T040
- T042(C-V3 + C-V4 + C-V5)序列、接 T041
- T043(C-V7 audit)序列、接 T042

### Phase 4 序列
T050(C-V6)接 T041 stack 起後

### Phase 5 部分並行
T060(C-V2 psql)接 T041;T061(C-V9 ps)+ T062(C-V10 既有 endpoint)接 T041、可平行於 T060

### Phase 6 全可並行
T070 [P] 並行(獨立 git diff、接 T041 後)

### Phase 7 部分並行
T080 序列(改 INTEGRATION-CHECKLIST.md)、T081 [P](grep verify)

### Phase 8 嚴格序列
T100 → T101 → T102(兩段式 commit + push wait、無法並行)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F9 10 條 alias endpoint 可被 Soybean 用、Casbin enforce 對 ROLE_USER 自動 deny、既有 endpoint 不退化;US2 + US3 + Zero-regression + Doc + Commit 為驗證 + 收尾 phase。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 F5.1/F6/F10.1/F10.2/F11 同 session 模式)、不 US1-only commit。

**並行 vs 序列建議**:
- 全 29 task 預估時間 60-90 分鐘(rust image rebuild 占 3-7 min、cargo unit test 跳過 per FR-017、其他 task 各 30s-2 min;rust source 改 12 file 為主要時間)
- Critical path:T001 → T002 → T010 → T020/T021/T022(並行)→ T023/T024/T025(各別接)→ T026 → T027 → T028 → T029/T031(並行)→ T030 → T040 → T041 → T042 → T043 → T050 → T060/T061/T062(並行)→ T070(並行)→ T080/T081(並行)→ T100 → T101 → T102

**故障排查**(per quickstart 故障排查段、對齊 spec.md R-1 ~ R-6):
- T020-T031 cargo error:檢 trait method 漏實作(`find_all_enabled` / `find_all_page_keys`)/ DTO re-export(`DeleteUserByBodyInput` / `BatchDeleteUserInput`)/ handler import(`Json` / `json!` / DTO from `server_service::admin`)
- T040 build fail:cargo dependency / mod re-export 漏 → 檢 build log
- T041 stack restart loop:handler panic / migration UNIQUE constraint fail / route conflict → 檢 docker compose logs rust-api / migration
- T042 C-V3 HTTP 404:endpoint 未註冊、router mount 漏 → 檢 sys_system_manage_route.rs `.route(...)` + `router_initialization.rs` `merge_router!`
- T042 C-V3c HTTP 502 on getMenuList/v2:axum static path 解析衝突(per R-Q5 預期不發生、若發生 → cargo build 編譯期應 catch、改路徑)
- T042 C-V4d batchDeleteUser `{deletedCount: 0}` 即使 valid id:既有 service.delete_user 對 valid id 也 Err、檢 service log
- T042 C-V5a getAllRoles 500:`SysRoleService::find_all_enabled` 實作錯、檢 service log + SQL
- T042 C-V5b getAllPages 500:`SysMenuService::find_all_page_keys` 實作錯、檢 service log
- T043 C-V7 audit log COUNT = 0:既有 SysUserService::delete_user 無 audit hook 在 service 層、留 follow-up 觀察(per FR-016「繼承既有 service hook」、若既有無 hook 則 audit 寫入是 follow-up feature 範疇)
- T050 GeneralUser HTTP 200 + envelope `{code:0, data:...}`(allow path、該 deny):Casbin policy 對 GeneralUser allow 了 → 檢 m20260520 不該含 ROLE_USER row
- T060 COUNT < 20:migration 沒跑、lib register 漏 → 檢 mod.rs + lib.rs register
- T060 COUNT > 20:rerun INSERT 重複(idempotency bug)→ 檢 seaql_migrations 表
- T061 stack 非 6 healthy:意外退化、abort F9 + 檢 docker compose logs <service>
- T062 既有 endpoint 退化:F9 誤動既有 router / migration → check git diff、abort F9 + 還原
- T070 git diff > 0 在 base-web/nestjs:意外改動、abort F9 + 改正
- T100 conventional commit hook fail:檢 message format、必要時調整 + 新建 NEW commit(per CLAUDE.md §5、不 amend)

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T043 [US1] / T050 [US2] / T060-T062 [US3]) |
| Setup / Foundational / Zero-regression / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照、T002/T020/T021/T022/T029/T070/T081 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
