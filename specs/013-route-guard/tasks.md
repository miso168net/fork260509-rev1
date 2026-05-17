---
description: "Task list for F6 route-guard implementation"
---

# Tasks: F6 — route-guard(`/route/isRouteExist`)

**Input**: Design documents from `/specs/013-route-guard/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/endpoint-contract.md`](contracts/endpoint-contract.md) ✓ / [`contracts/db-seed-contract.md`](contracts/db-seed-contract.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- **rust unit test**(可選):`SysMenuService::is_route_exist` test、test fixture 含 active/disabled/soft-deleted row
- **rust integration test**(`#[ignore]`、real postgres):login + curl `/route/isRouteExist`
- **cargo check**:plan 階段必驗、避免 stack 起後才發現 compile error
- **Acceptance**:per spec US1 3 + US2 2 + US3 3 = 8 個 scenario;by curl + manual SQL setup

**Organization**:F6 為 3 個 user story feature。Setup(5)+ Foundational(5)+ US1 impl + acceptance(15)+ US2 acceptance(4)+ US3 acceptance(5)+ Doc(3)+ Polish/兩段式 commit(5)= ~42 task。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`;**rust-api worktree** = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api/`

## Path Conventions

- **Worktree(rust-api、動)**:
  - 改:`server/api/src/admin/sys_menu_api.rs` / `server/service/src/admin/sys_menu_service.rs` / `server/model/src/admin/input/sys_menu.rs` / `server/router/src/admin/sys_menu_route.rs` / `migration/src/datas/mod.rs`
  - 新:`migration/src/datas/m20260518_a_f6_isRouteExist_seed.rs`
- **Outer(動)**:
  - 改:`CLAUDE.md` §10 + `docs/INTEGRATION-CHECKLIST.md`
  - rust-api submodule SHA pin update
- **Worktree base-web**:**全程不動**(per FR-011 + Constitution Principle IV)
- **Acceptance test 執行**:outer repo root(docker compose / curl / psql)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `013-route-guard`,執行 `git branch --show-current && git status --short`(預期 branch=013-route-guard、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified;**base-web / rust-api worktree 不該 modified**)
- [ ] T002 [P] 確認 rust-api worktree 在 `rev1-admin-rust-api` branch,執行 `cd rust-api && git branch --show-current && git status --short && cd ..`(預期 branch=rev1-admin-rust-api、無 modified;若 dirty 處理後再進 implement)
- [ ] T003 [P] 確認 docker compose v2+,執行 `docker compose version`(預期 v2.x)
- [ ] T004 [P] 確認 W-F6 stack 可正常啟動(可選實際跑):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  docker compose ps
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
  ```
  預期 6 service healthy
- [ ] T005 [P] 確認 `deploy/secrets/*.txt` 5 個 secret 已備(per W-F4),`ls deploy/secrets/*.txt | grep -v example | wc -l` 預期 ≥ 5

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:F5.1 baseline sanity + 確認 rust source 結構為 F6 改動起點。

- [ ] T010 grep F5.1 既有 `init_protected_menu_router` 結構,執行 `grep -nE "init_protected_menu_router|getUserRoutes|RouteInfo" rust-api/server/router/src/admin/sys_menu_route.rs | head -10`(預期看到 line 18-78、F5.1 既有 routes vec + Router builder + add_route loop)
- [ ] T011 [P] grep F5.1 既有 `SysMenuApi` handler 結構,執行 `grep -nE "pub async fn (get_constant_routes|get_menu_list|tree_menu)" rust-api/server/api/src/admin/sys_menu_api.rs | head -5`(預期看到既有 handler 風格、F6 對齊)
- [ ] T012 [P] grep F5.1 既有 `SysMenuService` 結構,執行 `grep -nE "pub async fn (get_constant_routes|tree_menu|get_menu_list)" rust-api/server/service/src/admin/sys_menu_service.rs | head -5`(預期看到既有 service method 風格)
- [ ] T013 [P] grep `sys_menu` entity 確認 `route_name`/`status`/`deleted_at` 3 column 在,執行 `grep -nE "route_name|pub status|deleted_at" rust-api/server/model/src/admin/entities/sys_menu.rs`(預期 3 個 column 全在、status 型別為 `Status` enum)
- [ ] T014 [P] grep `Status` enum 變體,執行 `grep -A 10 "pub enum Status" rust-api/server/model/src/admin/entities/sea_orm_active_enums.rs`(預期見 Banned / Disabled / Enabled 3 variant、F6 SQL filter 用 `Status::Enabled`)
- [ ] T015 [P] **列舉既有 active route name 供 US1 acceptance 用**(per analyze F3 補強):
  ```bash
  # 靜態 grep migration seed 看 sys_menu 既有 route_name 與對應 status
  grep -iE "INSERT INTO sys_menu|route_name|'enabled'" rust-api/migration/src/datas/m20241024_034744_insert_sys_menu.rs | head -30
  # 預期看到 INSERT 語句 + 多筆 row、status 多為 'enabled';記下 1-2 個 status='enabled' 的 route_name 範本(替代 T033 / T034 假設的 'home' / 'user_role' / 'manage_user' 若實際 seed 不含)
  ```
  **若** T033 / T034 預設 routeName('home' / 'user_role' / 'manage_user' 等)實際不在 seed 內、改用此 task 列出的 active route name;**若** 預設 name 都在 seed 內、本 task 純驗、可直接進 Phase 3 不必改 T033 / T034
- [ ] T016 [P] **驗 F5.1 既有 `m20260515_a_f51_minimum_seed.rs` 為 F6 migration 範本**:
  ```bash
  cat rust-api/migration/src/datas/m20260515_a_f51_minimum_seed.rs | head -40
  # 預期見 INSERT casbin_rule 樣式;F6 T024 新建 migration mirror 此 pattern
  ```

---

## Phase 3: User Story 1 — `routeName` 存在回 true(Priority: P1)🎯 MVP

**Goal**:完成 F6 全部 6 個 rust file 改動 + cargo check + dev stack 重 build + US1 3 個 acceptance scenario PASS。

**Independent Test**:6 rust 檔到位 + `cargo check` 過 + dev stack up + 3 個 curl(對 active route name)全回 `data:true` — 不依賴 US2/US3。

### artifact 改動(rust-api worktree、6 個 rust 檔)

- [ ] T020 [US1] 改 `rust-api/server/model/src/admin/input/sys_menu.rs` 加 `IsRouteExistInput` DTO struct(per data-model E-1 + C-E2):
  ```rust
  #[derive(Debug, Deserialize, Validate)]
  #[serde(rename_all = "camelCase")]
  pub struct IsRouteExistInput {
      #[validate(length(min = 1))]
      pub route_name: String,
  }
  ```
  若該 module 有 re-export 鏈、加進去對齊 `CreateMenuInput` 風格

- [ ] T021 [US1] 改 `rust-api/server/service/src/admin/sys_menu_service.rs` 加 `is_route_exist` service method(per data-model E-2 + R-7 + C-D3 + FR-007):
  ```rust
  pub async fn is_route_exist(&self, route_name: &str) -> Result<bool, AppError> {
      let count = sys_menu::Entity::find()
          .filter(sys_menu::Column::RouteName.eq(route_name))
          .filter(sys_menu::Column::DeletedAt.is_null())
          .filter(sys_menu::Column::Status.eq(Status::Enabled))
          .count(&self.db)
          .await
          .map_err(AppError::from)?;
      Ok(count > 0)
  }
  ```
  必加 import `use server_model::admin::entities::sea_orm_active_enums::Status;`(若 module 未 import);若 `SysMenuService` 有 `TMenuService` trait、trait + impl 各加 method signature

- [ ] T022 [US1] 改 `rust-api/server/api/src/admin/sys_menu_api.rs` 加 `is_route_exist` handler(per data-model E-3 + C-E1~E3 + FR-001/002):
  ```rust
  pub async fn is_route_exist(
      Extension(service): Extension<Arc<SysMenuService>>,
      Query(input): Query<IsRouteExistInput>,
  ) -> Result<Res<bool>, AppError> {
      service.is_route_exist(&input.route_name).await.map(Res::new_data)
  }
  ```
  必加 import:`use axum::extract::Query;`(若未 import)+ 加 `IsRouteExistInput` 進 `use server_service::admin::{...}`

- [ ] T023 [US1] 改 `rust-api/server/router/src/admin/sys_menu_route.rs::init_protected_menu_router` 加 RouteInfo + .route() mount(per data-model E-4 + C-D4 + FR-001):
  - 在 routes vec 末尾(`/getUserRoutes` entry 之後)加 1 條:
    ```rust
    RouteInfo::new(
        &format!("{}/isRouteExist", base_path),
        Method::GET,
        service_name,
        "查询路由是否存在",
    ),
    ```
  - 在 Router builder 末尾(`.route("/getUserRoutes", ...)` 之後)加 1 條:
    ```rust
    .route("/isRouteExist", get(SysMenuApi::is_route_exist))
    ```
  - 注意:用 `SysMenuApi::is_route_exist`(非 `SysAuthenticationApi`)、避免 F5.1 wiring bug 模式

- [ ] T024 [US1] [P] 新建 `rust-api/migration/src/datas/m20260518_a_f6_isRouteExist_seed.rs`(per data-model E-5 + C-D1):整檔 mirror F5.1 既有 `m20260515_a_f51_minimum_seed.rs` pattern,內含 3 row INSERT casbin_rule + 對應 DELETE down stmt(per FR-005 修正版 — allowlist mode 強制需顯式 allow);**3 row**:`('p', 'ROLE_SUPER', 'built-in', '/route/isRouteExist', 'GET', '', '')` × 3(ROLE_SUPER / ROLE_ADMIN / ROLE_USER)

- [ ] T025 [US1] 改 `rust-api/migration/src/datas/mod.rs`(per data-model E-6 + C-D2):
  - 加 `pub mod m20260518_a_f6_isRouteExist_seed;`(對齊既有 mod 列表)
  - 在 `Migrator::migrations()` vec 末尾加 `Box::new(m20260518_a_f6_isRouteExist_seed::Migration),`

### Compile + 靜態驗(3 tasks)

- [ ] T026 [US1] [P] cargo check 過(per C-V11):
  ```bash
  cd rust-api && cargo check -p server-api -p server-service -p server-model -p migration
  ```
  預期 exit 0;若有 compile error 修(可能漏 import / type mismatch / trait missing)

- [ ] T027 [US1] [P] grep T020-T025 改動已落地:
  ```bash
  grep -rn "is_route_exist\|IsRouteExist\|isRouteExist" rust-api/server/ | head -5
  # 預期至少 4 match(input + service + handler + route mount)
  grep -n "m20260518_a_f6_isRouteExist_seed" rust-api/migration/src/datas/mod.rs
  # 預期 2 match(pub mod + Box::new)
  ```

- [ ] T028 [US1] [P] base-web src 0 改動驗(per FR-011 + C-V12):
  ```bash
  git diff HEAD -- base-web/src/
  # 預期無輸出
  ```

### Dev stack 重 build + 起(2 tasks)

- [ ] T029 [US1] Dev stack rebuild rust-api image + 起(per quickstart Step 2):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
  docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  docker compose ps
  ```
  預期 6 service healthy(含 migration exit 0、F6 seed migration up 完成)

- [ ] T030 [US1] [P] 驗 Casbin seed up 完成(per C-V9):
  ```bash
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "SELECT v0 FROM casbin_rule WHERE v2 = '/route/isRouteExist' ORDER BY v0;"
  # 預期 3 row:ROLE_ADMIN / ROLE_SUPER / ROLE_USER
  ```

- [ ] T031 [US1] [P] 驗 sys_endpoint sync 完成(per C-V10 + C-D4):
  ```bash
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "SELECT path, method, service_name FROM sys_endpoint WHERE path = '/route/isRouteExist';"
  # 預期 1 row:path='/route/isRouteExist', method='GET', service_name='SysMenuApi'
  ```

### US1 acceptance scenarios(per spec US1 3 scenarios + C-V3)

- [ ] T032 [US1] 取 login token prereq(per C-V2):
  ```bash
  TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    http://127.0.0.1:11080/api/auth/login | jq -r '.data.token')
  echo "TOKEN: ${TOKEN:0:50}..."
  ```
  預期非空 + 開頭 `eyJ...`

- [ ] T033 [US1] [P] **AC US1.1** `routeName=home` 回 true(per C-V3):
  ```bash
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq
  # 預期:{"code": 0, "msg": "...", "data": true}
  ```

- [ ] T034 [US1] [P] **AC US1.2** 對其他 active route name 試:
  ```bash
  for name in home user_role manage_user; do
    echo "--- $name ---"
    curl -fsS -H "Authorization: Bearer $TOKEN" \
      "http://127.0.0.1:11080/api/route/isRouteExist?routeName=$name" | jq -r '.data'
  done
  # 預期:已 seed 的 active route name 回 true、未 seed 的回 false
  ```

- [ ] T035 [US1] [P] **AC US1.3** 鏈路完整驗(curl 經 nginx /api/ 反代):同 T033(curl 本來就走 W-F5 反代、`/api/` strip 後送 rust-api)、確認 SPA + API + login + isRouteExist 全鏈路通

**Checkpoint**:US1 完成 — F6 endpoint 對 active routeName 回 true、6 個 rust 檔 + 1 個 migration 落地、Casbin seed + sys_endpoint sync 通、auth 通、cargo check 過。

---

## Phase 4: User Story 2 — `routeName` 不存在回 false(Priority: P2)

**Goal**:對未 seed 的 routeName 與 input validation case 各驗。

**Independent Test**:US1 stack 已起、依賴 token 但獨立 query。

### US2 acceptance(per spec US2 2 scenarios + C-V4/V5)

- [ ] T040 [US2] [P] **AC US2.1** 未 seed routeName 回 false(per C-V4):
  ```bash
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=non-existent-xyz-2026' | jq
  # 預期:{"code": 0, "data": false, ...}
  ```

- [ ] T041 [US2] [P] **AC US2.2a** routeName 為空字串(per C-V5):
  ```bash
  curl -fsSI -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=' | head -3
  # 預期:HTTP 400(deserialize fail)或 200 + validation error envelope
  ```

- [ ] T042 [US2] [P] **AC US2.2b** routeName 缺漏:
  ```bash
  curl -fsSI -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist' | head -3
  # 預期:同 T041(query param missing 或 deserialize fail)
  ```

- [ ] T043 [US2] [P] **補強驗** auth fail(per C-V8):
  ```bash
  curl -fsSI 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -3
  # 預期:HTTP 401
  curl -fsSI -H "Authorization: Bearer fake-token-xyz" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -3
  # 預期:HTTP 401
  ```

**Checkpoint**:US2 完成 — F6 endpoint 對未 seed routeName 正確回 false、validation + auth 紀律守住。

---

## Phase 5: User Story 3 — Soft-deleted / disabled menu 回 false(Priority: P2、紀律驗證)

**Goal**:驗 F6 SQL filter 3 個 condition 中後 2 個(soft-delete + status)honor。

**Independent Test**:dev stack up、manual SQL setup 改動 sys_menu 1 行、curl + 還原。

### US3 setup + verify + cleanup(per spec US3 3 scenarios + C-V6/V7 + C-D3)

- [ ] T050 [US3] **AC US3.1 — soft-deleted 部分** Setup(per C-V6):
  ```bash
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "UPDATE sys_menu SET deleted_at = NOW() WHERE route_name = 'home';"
  # 預期 UPDATE 1
  ```

- [ ] T051 [US3] **AC US3.1 — 驗 false**:
  ```bash
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq -r '.data'
  # 預期:false
  ```

- [ ] T052 [US3] **AC US3.1 — cleanup**:
  ```bash
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "UPDATE sys_menu SET deleted_at = NULL WHERE route_name = 'home';"
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq -r '.data'
  # 預期:true(恢復原狀)
  ```

- [ ] T053 [US3] **AC US3.2 — disabled 部分** Setup + verify + cleanup(per C-V7):
  ```bash
  # Setup
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "UPDATE sys_menu SET status = 'disabled' WHERE route_name = 'home';"

  # Verify
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq -r '.data'
  # 預期:false

  # Cleanup
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "UPDATE sys_menu SET status = 'enabled' WHERE route_name = 'home';"

  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq -r '.data'
  # 預期:true(恢復原狀)
  ```

- [ ] T054 [US3] **AC US3.3 — 環境清理確認**:
  ```bash
  PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
    psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
    -c "SELECT route_name, status, deleted_at FROM sys_menu WHERE route_name = 'home';"
  # 預期:status='enabled', deleted_at=NULL(未污染 e2e 環境)
  ```

**Checkpoint**:US3 完成 — F3 soft-delete + sys_menu status filter 紀律皆 honor、SQL filter 3 condition 守住。

---

## Phase 6: Documentation Update

**Goal**:同步更新 outer doc(CLAUDE.md + INTEGRATION-CHECKLIST.md)反映 F6 落地。

- [ ] T060 改 `CLAUDE.md` §10 SPECKIT marker(per data-model E-7 + FR-013):
  - Active feature 改為「無(F6 全完成、application Phase 2 第二個 feature 達成)」
  - Phase 改為「Done」
  - Previous features 末尾加 `/ F6 merge <merge-sha-pending>`(注:第 2 段 commit 後才知 merge SHA;先 placeholder `<sha-pending>`,實際 SHA 在合併回 default branch 後手動補)

- [ ] T061 [P] 改 `docs/INTEGRATION-CHECKLIST.md`(per data-model E-7 + FR-013):
  - Phase 1 P1 Roadmap 表 / Phase 2 application Roadmap 段:F6 row(若未存在則新增):
    ```
    | F6 | `route-guard` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;/route/isRouteExist endpoint + Casbin seed;base-web 零改動)|
    ```
  - Current Focus 更新(application Phase 2 進度 / 下一步指向)
  - 已完成里程碑段加 F6 條目(類 W-F6 / F5.1 格式;含 `<sha-pending>` placeholder + 範疇邊界、acceptance 8/8、兩段式 commit、Casbin allowlist 新發現等)

- [ ] T062 [P] 驗 doc 改動 grep:
  ```bash
  grep "F6" CLAUDE.md docs/INTEGRATION-CHECKLIST.md | grep -iE "全完成|✅|完成" | head -5
  # 預期至少 2 match(SPECKIT marker + 進度)
  ```

**Checkpoint**:Phase 6 完成 — doc 改動到位、待 Phase 7 commit。

---

## Phase 7: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 + FR-010)

**Goal**:落實**兩段式 commit** 紀律(rust-api worktree commit + outer SHA pin update commit)、push 等 user 同意。

### Stage 1:rust-api worktree commit + push fork

- [ ] T070 cd 進 rust-api 後 stage rust 改動:
  ```bash
  cd rust-api
  git status
  # 預期 6 個改 / 新檔
  
  git add server/api/src/admin/sys_menu_api.rs \
          server/service/src/admin/sys_menu_service.rs \
          server/model/src/admin/input/sys_menu.rs \
          server/router/src/admin/sys_menu_route.rs \
          migration/src/datas/
  ```

- [ ] T071 第 1 段 commit + push fork:
  ```bash
  git commit -m "$(cat <<'EOF'
  feat(rust-api): F6 加 /route/isRouteExist endpoint + Casbin policy seed

  新增 GET /route/isRouteExist?routeName=<name> 補完 base-web vue-router guard 在
  dynamic auth route mode 下「not-found vs 無權限」disambiguation 邏輯。

  改 / 新建:
  - IsRouteExistInput DTO(model/input/sys_menu.rs)
  - SysMenuService::is_route_exist method(service/sys_menu_service.rs)
    · 3 filter:route_name eq + deleted_at IS NULL + status = Status::Enabled
  - SysMenuApi::is_route_exist handler(api/sys_menu_api.rs)
  - Route mount + RouteInfo("/route/isRouteExist", GET, SysMenuApi)
    · 加進 init_protected_menu_router 自動繼承 CasbinAxumLayer enforce
  - migration m20260518_a_f6_isRouteExist_seed.rs
    · INSERT 3 row casbin_rule p-policy 對 SUPER/ADMIN/USER allow

  Acceptance:US1 P1 MVP 3/3 + US2 P2 4/4 + US3 P2 5/5 = 12/12 PASS
  Casbin allowlist mode + 3 role seed → 所有 logged-in user 可查
  sys_menu filter 3 condition 嚴守 F3 soft-delete + status enabled

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  git push origin rev1-admin-rust-api
  cd ..
  ```
  **注意**:`git push origin rev1-admin-rust-api` 是 push 到 fork,**需 user 同意才能跑**(per CLAUDE.md §5 push 紀律)— Phase 7 task 設計實際上是「準備好 stage 1 commit、tell user 第 1 段 push wait」,user 確認後才跑 push 並進 stage 2

### Stage 2:outer SHA pin update + doc commit + push wait

- [ ] T072 在 outer 拿 stage 1 commit SHA + stage outer 改動:
  ```bash
  NEW_RUST_SHA=$(cd rust-api && git rev-parse --short HEAD)
  echo "New rust-api SHA: $NEW_RUST_SHA"
  # 預期:7-char short SHA(stage 1 commit)

  git status
  # 預期:
  #   modified: .specify/feature.json
  #   modified: CLAUDE.md
  #   modified: docs/INTEGRATION-CHECKLIST.md
  #   modified: rust-api(SHA pin、submodule new commit)
  #   untracked: specs/013-route-guard/

  git add rust-api CLAUDE.md docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json specs/013-route-guard/
  ```

- [ ] T073 worktree 0 動驗(per Constitution Principle IV):
  ```bash
  cd base-web && git status --short && cd ..
  # 預期無輸出(base-web 全程不動)
  ```

- [ ] T074 第 2 段 commit:
  ```bash
  git commit -m "$(cat <<EOF
  chore(submodule): bump rust-api to $NEW_RUST_SHA — F6 route-guard 落地

  F6 /route/isRouteExist endpoint 補完 base-web vue-router guard disambiguation
  邏輯;rust-api worktree commit \$NEW_RUST_SHA(per CLAUDE.md §6.1 兩段式 commit
  第 2 段)。

  同步:CLAUDE.md §10 SPECKIT marker(Active 改回 無、加 F6 進 Previous)+
  docs/INTEGRATION-CHECKLIST.md(F6 row ✅ + 進度更新)+ .specify/feature.json +
  specs/013-route-guard/(spec + plan + research + data-model + 3 contracts +
  quickstart + checklist + tasks)。

  base-web 零改動;Constitution Check 8 PASS / 15 N/A / 0 violation。
  application Phase 2 第二個 feature 達成、F5.1 後 base-web vue-router guard
  完整體驗解鎖。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] T075 push 等 user 同意:
  - 告知 user:「第 2 段 outer commit 已落、要不要 push origin rev1-admin-root + 013-route-guard?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑:
    ```bash
    git push origin 013-route-guard
    # 視情況也 push rev1-admin-root(若 user 想 merge 回 default 才推);若採 W-F5/W-F6/W-F7 模式則 merge → 推 rev1-admin-root + feature branch
    ```

**Checkpoint**:Phase 7 完成 — F6 落地、兩段式 commit 紀律遵守、worktree base-web 零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 | — |
| Phase 2 Foundational | Phase 3 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 6 + 7 | Phase 1 + 2 |
| Phase 4 US2 | Phase 6 | Phase 3 |
| Phase 5 US3 | Phase 6 | Phase 3 |
| Phase 6 Doc | Phase 7 | Phase 3 + 4 + 5 全 PASS |
| Phase 7 Commit | — | 全 6 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(rust 6 改 + 重 build + 起 stack + 3 acceptance)
- US2(P2):純 acceptance phase、依賴 US1 已啟 stack + token
- US3(P3):純 acceptance phase + manual SQL、依賴 US1 已啟 stack

實際:**US1 = implement;US2 + US3 = 純驗證**。

## Parallel Execution

### Phase 1 全可並行
T002 / T003 / T004 / T005 全並行(獨立 docker / git / ls 命令)

### Phase 2 全可並行
T010 / T011 / T012 / T013 / T014 全並行(獨立 grep / read)

### Phase 3 implementation 部分並行
- T020 / T021 / T022 / T023 / T024 / T025 大致序列(同改 1 個檔 / Box 加進 mod.rs 需先建 migration);實際:
  - T020 / T024 可並行(獨立檔)
  - T021 / T022 序列(依賴 T020 DTO struct)
  - T023 / T025 可並行(獨立檔)
- T026 / T027 / T028 並行(獨立 cargo / grep / git)
- T029 + T030 + T031 序列(stack up 後才驗)
- T032 必先(token);T033 / T034 / T035 並行

### Phase 4 全可並行
T040 / T041 / T042 / T043 並行(獨立 curl)

### Phase 5 序列
T050 → T051 → T052(soft-delete:setup→verify→cleanup);T053(disabled all-in-one);T054 收尾驗

### Phase 6 部分並行
T061 / T062 並行(獨立 doc edit / grep);T060 在前

### Phase 7 序列
T070 → T071(stage 1 commit + push wait)→ T072 → T073 → T074(stage 2 commit)→ T075(push wait)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F6 核心 endpoint 對 active routeName 回 true、value delivered。US2 + US3 為驗證 phase、確認 reject path + filter 紀律。

**MVP commit policy**:推薦走完整 Phase 1-7 一次到位(對齊 W-F6 / W-F7 同 session 模式),不 US1-only commit。

**並行 vs 序列建議**:
- 全 ~42 task 預估時間 60-90 分鐘(主要是 cargo check + docker build + stack up/down wait 1-2 次切換)
- Phase 3 acceptance + Phase 4-5 acceptance 並行 curl 可省 5-10 分鐘
- Critical path:T020-T025 implementation → T026 cargo check → T029 build + up → T030-T035 acceptance → T040+ → T050+ → T060+ → T070-T075 commit

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T035 [US1] / T040-T043 [US2] / T050-T054 [US3]) |
| Setup / Foundational / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement` 或 `/speckit-analyze`**。
