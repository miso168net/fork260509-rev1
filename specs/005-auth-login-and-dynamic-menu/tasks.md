---

description: "Task list for F5.1 — auth-login-and-dynamic-menu implementation"
---

# Tasks: F5.1 — auth-login-and-dynamic-menu

**Input**: Design documents from [`specs/005-auth-login-and-dynamic-menu/`](.)
**Prerequisites**: [`plan.md`](./plan.md) ✓、[`spec.md`](./spec.md) ✓、[`research.md`](./research.md) ✓、[`data-model.md`](./data-model.md) ✓、[`contracts/auth-endpoints.md`](./contracts/auth-endpoints.md) ✓、[`contracts/casbin-enforce.md`](./contracts/casbin-enforce.md) ✓、[`quickstart.md`](./quickstart.md) ✓

**Tests**: F5.1 spec.md **明示要求 unit + integration + real-postgres acceptance test**（SC-003 unit / SC-004 integration / SC-005 acceptance、Q4 拍板「同 F3 模式」）— test tasks 為 implementation 必要部分、不是 optional。Acceptance test 需 `TEST_DATABASE_URL` + postgres + migration 套用。

**Organization**: F5.1 spec.md 單一 P1 US（auth-login-and-dynamic-menu atomic increment）→ Phase 3 內單一 [US1] 包含全部 acceptance dimensions A-G

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to ([US1] = F5.1 唯一 P1 US)
- file paths 為 **repo-relative**（從 `fork260509-rev1/` workspace root 起算）

## Path Conventions

- **rust-api worktree**: `rust-api/server/middleware/src/...`、`rust-api/server/router/src/admin/...`、`rust-api/server/initialize/src/...`、`rust-api/server/service/tests/...`、`rust-api/server/initialize/tests/...`、`rust-api/migration/src/datas/...`
- **specs (outer)**: `specs/005-auth-login-and-dynamic-menu/`（spec-kit 全套已建）
- 無 outer .github/workflows 改動（F5.1 不引入新 CI lint）

---

## Phase 1: Setup（環境 sanity check + baseline）

**Purpose**: 確認 outer feature branch + worktree state + 記錄 before snapshot 供 polish 階段 verify

- [ ] T001 確認 outer 在 `005-auth-login-and-dynamic-menu` feature branch、`rust-api/` worktree 行首空格（`git status` + `git submodule status` + `cd rust-api && git branch --show-current`、預期 `rev1-admin-rust-api`）；並記錄 baseline snapshot：(a) `sys_authentication_route.rs:20` 含 `/auth/getUserRoutes` mount (b) `sys_menu_route.rs` `init_protected_menu_router` 不含 `/getUserRoutes` (c) `casbin_envelope_adapter` 在 codebase 內**不**存在（baseline 應為 0 命中、F5.1 後變 >0）(d) `axum-casbin/middleware.rs:153-197` 含 plain text "do not have the necessary permissions" 字串 (e) `application-test.yaml` jwt_secret 為 32-char dev secret（F1.1 後狀態）(f) F4 envelope code `CODE_PERMISSION_CASBIN_DENY=5001` 在 `server/core/src/web/code.rs` 存在；輸出存到本檔 §Baseline Snapshot 段供 SC 對比

---

## Phase 2: Foundational（BLOCKING prerequisites）

**Purpose**: 建立 `casbin_envelope_adapter` 模組 + wire 到 router_initialization — **all subsequent [US1] tasks depend on this phase**

**⚠️ CRITICAL**: 此 phase 完成前所有 [US1] tasks 不可開始（會引用未定義的 middleware 模組）

- [ ] T002 新建 `rust-api/server/middleware/src/casbin_envelope_adapter.rs` — 定義 `pub async fn casbin_envelope_adapter(req: Request, next: Next) -> Response`：(a) `next.run(req).await` (b) 若 status != 403 直接返 (c) `to_bytes(body, 1024).await` 讀 body bytes (d) 判斷 body fragment 含 "do not have the necessary permissions" 或 "Please contact support if you believe this is an error"（per axum-casbin/middleware.rs:160-163 / 194-197 plain text）(e) 若是 Casbin reject、返 `Res::<()>::new_error(CODE_PERMISSION_CASBIN_DENY, "您没有访问该资源的权限，请联系管理员").into_response()` (f) 否則返 `Response::from_parts(parts, Body::from(bytes))` 保 original；per [`data-model.md`](./data-model.md) §E2、[`contracts/casbin-enforce.md`](./contracts/casbin-enforce.md) §3
- [ ] T003 修改 `rust-api/server/middleware/src/lib.rs` — 加 `pub mod casbin_envelope_adapter;` 一行（依字母順序）
- [ ] T004 修改 `rust-api/server/initialize/src/router_initialization.rs` — 在 `apply_layers` `need_casbin` block 之後（line 72-76 之後）加 `.layer(axum::middleware::from_fn(server_middleware::casbin_envelope_adapter::casbin_envelope_adapter))`；確認 `use axum::middleware::from_fn;` import 已就位（per [`data-model.md`](./data-model.md) §E3）

**Checkpoint**: Phase 2 完成 → `cargo check -p server-middleware -p server-initialize` 應 pass（adapter 獨立可編譯 + router_initialization wire 不破壞既有）；尚無行為改變、需 Phase 3 endpoint path align + tests 才生效驗證

---

## Phase 3: User Story 1 [US1] — auth-login-and-dynamic-menu 整套交付（P1）🎯 MVP

**Goal**: Endpoint path align + Casbin reject envelope hook + login flow audit verify + shape align verify + minimum policy seed + 三層 test 全交付

**Independent Test**: 跑 [`quickstart.md`](./quickstart.md) Step 1-8 全部 Pass → SC-001 ~ SC-011 全 11 個指標達成

### Dimension A — Endpoint path align（FR-001 ~ FR-003）

- [ ] T005 [P] [US1] 修改 `rust-api/server/router/src/admin/sys_authentication_route.rs` — `init_protected_router` 內**刪除** `.route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes))` line（既有 line 20）；保留 `/getUserInfo` mount 不動；保留 `init_authentication_router` `/auth/login` + `init_authorization_router` `/authorization/*` 全不動；per [`data-model.md`](./data-model.md) §E1.1
- [ ] T006 [P] [US1] 修改 `rust-api/server/router/src/admin/sys_menu_route.rs` — (a) `use server_api::admin::{SysAuthenticationApi, SysMenuApi};`（加 SysAuthenticationApi import）(b) `init_protected_menu_router` 內 routes vec 加 `RouteInfo::new(&format!("{}/getUserRoutes", base_path), Method::GET, "SysAuthenticationApi", "获取用户路由")` (c) router builder 加 `.route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes))`；per [`data-model.md`](./data-model.md) §E1.2

### Dimension D — Migration policy seed audit + 補修 IF NEEDED（FR-018）

- [ ] T007 [US1] 跑 migration audit + DB grep verify 既有 datas/* seed 完整度：(a) `cargo run -p migration` 套用 schema + datas（用 `TEST_DATABASE_URL` 或 dev DB）(b) DB grep verify：`SELECT COUNT(*) FROM sys_user WHERE username IN ('Soybean','Administrator','GeneralUser')` 預期 3 row / `SELECT COUNT(*) FROM sys_user_role WHERE user_id IN (SELECT id FROM sys_user WHERE ...)` 預期 ≥3 / `SELECT COUNT(*) FROM sys_role WHERE code IN ('ROLE_SUPER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER')` 預期 ≥3（per **I1 finding fix**）/ `SELECT COUNT(*) FROM sys_role_menu WHERE role_id IN (...)` 預期 ≥3 / `SELECT COUNT(*) FROM sys_menu WHERE status='ENABLED'` 預期 ≥1（per I1）/ `SELECT COUNT(*) FROM sys_casbin_rule WHERE ptype='p' AND v2 IN ('/auth/getUserInfo', '/route/getUserRoutes')` 預期 ≥3 (c) 若 (b) 任一缺、進 T008；per [`research.md`](./research.md) R5 + [`data-model.md`](./data-model.md) §E5
- [ ] T008 [US1] IF NEEDED 新建 `rust-api/migration/src/datas/m20260515_<auto-id>_f51_minimum_seed.rs` — 補 minimum policy seed：(a) sys_role_menu 補 3 user × role × 至少 1 menu 對應 (b) sys_casbin_rule 補 p (role, built-in, /auth/getUserInfo, GET) + p (role, built-in, /route/getUserRoutes, GET) 對 3 role + g (user_id, role, built-in) 對 3 user；(c) `rust-api/migration/src/lib.rs` Migrator::migrations() vec 加新 entry；若 T007 audit 通過、**SKIP T008**、註明 "既有 seed 完整、F5.1 0 改動"；per [`research.md`](./research.md) R5

### Dimension F — Shape align verify（FR-019 ~ FR-021）

- [ ] T009 [US1] verify 既有 4 個 output struct shape align：(a) `grep -n "serde(rename_all" rust-api/server/model/src/admin/output/sys_authentication.rs` 預期 ≥3 hit（AuthOutput / UserInfoOutput / UserRoute 3 個都有） (b) `grep -n "serde(rename_all" rust-api/server/model/src/admin/output/sys_menu.rs` 預期 ≥2 hit（MenuRoute + RouteMeta） (c) 若任一缺、F5.1 範圍內補 `#[serde(rename_all = "camelCase")]` attribute（struct 本身不動、只加 attribute）；per [`data-model.md`](./data-model.md) §E4

### Dimension E — Casbin enforce wire verify（FR-016 ~ FR-017）

- [ ] T010 [US1] verify CasbinAxumLayer wire + envelope adapter wire 全到位：(a) `grep -n "need_casbin" rust-api/server/initialize/src/router_initialization.rs` 預期 ≥2 hit（apply_layers 內 wire + protected_admin_router caller） (b) `grep -n "casbin_envelope_adapter" rust-api/server/initialize/src/router_initialization.rs` 預期 ≥1 hit（Phase 2 T004 wire 完成） (c) `grep -rn "CasbinVals" rust-api/server/middleware/src/jwt_auth_middleware.rs` 預期 ≥1 hit（既有 jwt_auth_middleware 內注入 CasbinVals）；per [`contracts/casbin-enforce.md`](./contracts/casbin-enforce.md) §1 + §4

### Tests for User Story 1（SC-003 unit / SC-004 integration / SC-005 acceptance — explicit request）

- [ ] T011 [P] [US1] 新建 `rust-api/server/service/tests/auth_login_shapes.rs` — 8 個 unit test fn：
  - `auth_output_serde_camelcase`（assert serde_json::to_value(AuthOutput { token: "x", refresh_token: "y" }) → {"token": "x", "refreshToken": "y"}）
  - `user_info_output_serde_camelcase`（同樣 verify userId / userName / roles / buttons camelCase）
  - `user_route_serde_camelcase`（routes / home camelCase）
  - `menu_route_serde_camelcase`（name / path / component / meta / children / id / pid camelCase）
  - `route_meta_serde_camelcase`（title / i18nKey / keepAlive / constant / icon / order / href / hideInMenu / activeMenu / multiTab）
  - `tree_builder_empty`（empty input → empty output）
  - `tree_builder_single_root`（單 root node）
  - `tree_builder_multi_level`（多層父子 + verify children 對齊）
- [ ] T012 [P] [US1] 新建 `rust-api/server/initialize/tests/login_handler_integration.rs` — 3 個 integration test fn（用 axum-test-helpers + tokio::sync::Mutex 序列化）：
  - `login_handler_returns_auth_output_envelope`（mock DB / mock JWT / POST /auth/login + valid body → 200 + envelope `{code:0, data:{token, refreshToken}}`）
  - `jwt_auth_middleware_rejects_missing_token`（GET /auth/getUserInfo without Bearer → envelope `code:9999` or `3333` per JwtError mapping）
  - `casbin_envelope_adapter_converts_403_to_envelope`（mock Casbin reject path 返 plain 403 + body "do not have the necessary permissions" → adapter 攔 → envelope `{code:5001, msg:"您没有访问该资源的权限", data:null}`）
- [ ] T013 [P] [US1] 新建 `rust-api/server/service/tests/auth_login_e2e.rs` — 3 個 acceptance test fn（`#[ignore]`、需 `TEST_DATABASE_URL` + DB migrated）：
  - `login_succeeds_returns_token_and_refresh`：(a) POST /auth/login `{"identifier":"Soybean","password":"123456"}` (b) assert envelope code=0 + token 非空 + JWT decode 含 11 claims (c) DB query `SELECT payload_after FROM sys_operation_log WHERE operation='login_succeeded' ORDER BY created_at DESC LIMIT 1` (d) assert `grep -i "password"` 對 payload_after JSONB string 應 0 hit（per [`spec.md`](./spec.md) Q1 拍板 + FR-006）
  - `get_user_info_returns_user_with_roles`：(a) 跑 login_succeeds 取 token (b) GET /auth/getUserInfo + Bearer (c) assert envelope code=0 + data 含 userId / userName="Soybean" / roles 非空 / buttons=[]
  - `get_user_routes_returns_tree_with_home`：(a) 跑 login 取 token (b) GET /route/getUserRoutes + Bearer (c) assert envelope code=0 + routes 非空 + home="/home" (d) 重複 (a)(b)(c) 對 Administrator + GeneralUser、assert 三者 menu_set ≠（generic set inequality、不 hardcode 具體 menu names）
- [ ] T014 [P] [US1] 在 `rust-api/server/service/tests/auth_login_e2e.rs` 加第 4 acceptance test fn `get_user_routes_returns_empty_for_empty_role`（per **U1 finding fix** + spec FR-013）：(a) 構造 test user 且 sys_user_role 內無 entry（或 mock empty role_codes path）(b) 跑 login → 拿 token (c) GET /route/getUserRoutes + Bearer (d) assert envelope code=0 + data = `{"routes":[], "home":"/home"}`；若 test user 構造太重、改 integration test approach（mock User extension with empty subject、走 server-initialize/tests/login_handler_integration.rs T012 內、不在 acceptance test）
- [ ] T015 [P] [US1] 在 `rust-api/server/service/tests/auth_login_e2e.rs` 加第 5 acceptance test fn `get_constant_routes_public_returns_envelope`（per **U2 finding fix** + spec FR-014）：(a) 無 token GET /route/getConstantRoutes (b) assert HTTP 200 + envelope `{code:0, msg:"success", data:[...]}` (c) assert data 為 array（不是 `{routes, home}` shape、per `contracts/auth-endpoints.md` §4）(d) 跑 Casbin layer 不 enforce 此 path（既有 init_menu_router public 不 wire Casbin）

**Checkpoint**: T002-T015 全部完成 → User Story 1 應 fully functional + 23 acceptance scenarios + U1 + U2 補強 cover + SC-001~011 全達成

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: SC-001 ~ SC-011 全 11 個指標的 verification + quickstart 完整跑通 + 兩段式 commit 收尾

- [ ] T016 [P] SC-001 + SC-002 grep verify endpoint path：
  - `grep '/getUserRoutes' rust-api/server/router/src/admin/sys_authentication_route.rs` 預期 0 hit
  - `grep '/getUserRoutes' rust-api/server/router/src/admin/sys_menu_route.rs` 預期 ≥1 hit
  - `grep 'SysAuthenticationApi::get_user_routes' rust-api/server/router/src/admin/` 預期 1 hit（在 sys_menu_route.rs）
- [ ] T017 [P] SC-003 unit test verify：`cd rust-api && cargo test -p server-service --test auth_login_shapes 2>&1 | tail -10` — 預期 8 個 unit test 綠燈
- [ ] T018 [P] SC-004 integration test verify：`cd rust-api && cargo test -p server-initialize --test login_handler_integration 2>&1 | tail -10` — 預期 3 個 integration test 綠燈
- [ ] T019 SC-005 + SC-008 + SC-009 + SC-010 acceptance test verify：`export TEST_DATABASE_URL=...` + `cd rust-api && cargo test -p server-service --test auth_login_e2e -- --ignored 2>&1 | tail -15` — 預期 **5 個** acceptance test 綠燈（含 T014 + T015 新增 2 fn）+ DB grep verify payload password redaction 0 hit
- [ ] T020 [P] SC-006 F3 既有 acceptance test 仍 pass：`cd rust-api && cargo test --test soft_delete_basics --test soft_delete_audit_integration --test soft_delete_auth_gate -- --ignored 2>&1 | tail -15` — 預期 F3 既有 9 個 #[ignore] test 全綠（F5.1 不破 F3 G9 軟刪 user 8888 check + F2.1 audit middleware）
- [ ] T021 [P] F2.1 既有 audit middleware acceptance test 仍 pass（per **U3 finding fix** + spec FR-023）：`cd rust-api && find server -name 'audit*' -path '*/tests/*' -o -name '*_audit_integration.rs' 2>/dev/null` 列出 F2.1 既有 audit test files；`cargo test --test <每個 F2.1 audit test file> -- --ignored 2>&1 | tail -10` — 預期 F2.1 既有 audit middleware acceptance test 全綠（F5.1 不破 F2.1 audit context API + sys_operation_log integration）；若 F2.1 acceptance test 不存在 (per F2.1 spec audit scope 限制)、改驗 sys_operation_log row 仍按 F2.1 schema 寫入（T019 内已含 row verify 順帶 cover）
- [ ] T022 [P] SC-011 cargo check workspace：`cd rust-api && cargo check --workspace 2>&1 | tail -5` — 預期 `Finished dev profile` 0 errors / 0 warnings 由 F5.1 引入
- [ ] T023 跑 [`quickstart.md`](./quickstart.md) Step 1-8 完整 verification（含 endpoint path align grep / unit test / integration test / acceptance test 5 fn / F3 既有 acceptance test / F2.1 既有 audit test / cargo check / DB payload redaction verify）— 所有步驟 Pass 才算 F5.1 達成（Step 7 deploy stack 部分留 user verify、不阻 task complete）
- [ ] T024 第一段 commit + push（per CLAUDE.md §6.1）：
  - `cd rust-api && git status` 確認 modified + 新檔
  - `git add server/router/src/admin/sys_authentication_route.rs server/router/src/admin/sys_menu_route.rs server/middleware/src/casbin_envelope_adapter.rs server/middleware/src/lib.rs server/initialize/src/router_initialization.rs server/service/tests/auth_login_shapes.rs server/initialize/tests/login_handler_integration.rs server/service/tests/auth_login_e2e.rs`（含 model output struct 若 T009 補 attribute、含 T008 migration 若 created）
  - commit message: `feat(rust-api): F5.1 auth-login-and-dynamic-menu — endpoint path align + Casbin envelope adapter + acceptance test`
  - **等 user 同意才** `git push origin rev1-admin-rust-api`
- [ ] T025 第二段 commit（outer SHA pin update、per CLAUDE.md Outer branch 預期）：
  - `cd .. && git branch --show-current` 確認 `005-auth-login-and-dynamic-menu`
  - `git status` 應看到 `modified: rust-api (new commits)` + `?? specs/005-auth-login-and-dynamic-menu/` (若 specs/ 尚未 commit)
  - `git add rust-api specs/005-auth-login-and-dynamic-menu/`
  - commit message: `chore(submodule): bump rust-api 到 <短 SHA> — F5.1 auth-login-and-dynamic-menu 完整落地`
  - **等 user 同意才** `git push origin "$(git branch --show-current)"`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 無 dependencies、可立即開始
- **Phase 2 (Foundational)**: 依賴 Phase 1 完成 — **BLOCKS** Phase 3 全部 tasks
- **Phase 3 (User Story 1)**: 依賴 Phase 2 完成
  - Dimension A（T005-T006 endpoint path）全 [P] 平行（不同檔）
  - Dimension D（T007-T008 migration seed）順序（T007 audit → T008 IF NEEDED）
  - Dimension F（T009 shape verify）獨立
  - Dimension E（T010 wire verify）獨立、依賴 T004 完成
  - Tests T011-T013 全 [P] 平行（不同 test crate / 不同檔）
- **Phase 4 (Polish)**: 依賴 Phase 3 完成（特別 T020 quickstart 跑前所有 implementation tasks 必完）

### Within Phase 2 Internal Dependencies

```text
T002 (casbin_envelope_adapter.rs NEW)
  └─ T003 (lib.rs pub mod)             — 依賴 T002 exist
  └─ T004 (router_initialization wire) — 依賴 T002 + T003
```

### Within Phase 3 Internal Dependencies

```text
Dimension A: T005 ‖ T006                                [P × 2]
Dimension D: T007 → T008 (conditional IF NEEDED)        — 順序
Dimension F: T009                                       — 獨立
Dimension E: T010                                       — 依賴 T004（Phase 2）完成
Tests: T011 ‖ T012 ‖ T013 ‖ T014 ‖ T015                [P × 5]
  └─ T014 + T015 [US1] 與 T013 同 acceptance test file、實作上是 file 內加 fn（不是新 file）
  └─ runtime 依賴 T002-T010 完成（test 跑時需 implementation 完整）
```

### Within Phase 4 Internal Dependencies

```text
T016 ‖ T017 ‖ T018 ‖ T020 ‖ T021 ‖ T022  [P × 6]
T019 (acceptance test、需 DB)              — 依賴 TEST_DATABASE_URL + T013-T015 完成
T023 quickstart                            — 依賴 T016-T022 all pass
T024 worktree commit                       — 依賴 T023 pass + user 同意
T025 outer SHA pin                         — 依賴 T024 完成
```

### Parallel Opportunities

#### Phase 2 內

T002 → T003 → T004 線性鏈（無 [P]）。

#### Phase 3 內

```text
Batch 1 (Endpoint path align): T005 ‖ T006                       [P × 2]
Batch 2 (Tests writing):       T011 ‖ T012 ‖ T013 ‖ T014 ‖ T015  [P × 5]
T007 → T008 conditional 順序
T009 / T010 verify 獨立可任意位置插入
```

#### Phase 4 內

```text
T016 ‖ T017 ‖ T018 ‖ T020 ‖ T021 ‖ T022   [P × 6]、可 cluster 跑
T019 獨立、依賴 DB stack 起來
```

---

## Parallel Example: User Story 1 Endpoint Path Batch

```bash
# Terminal A: T005 — sys_authentication_route.rs
$EDITOR rust-api/server/router/src/admin/sys_authentication_route.rs

# Terminal B: T006 — sys_menu_route.rs
$EDITOR rust-api/server/router/src/admin/sys_menu_route.rs
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

F5.1 唯一 P1 US = 整個 F5.1 feature 範圍。「MVP first」對 F5.1 = 「完整 F5.1」、不可分。

1. Phase 1 Setup（sanity check + baseline）
2. Phase 2 Foundational（**CRITICAL** — casbin_envelope_adapter 模組 + router_initialization wire；Casbin enforce 行為改變、但無 endpoint path align、test 跑前不會被觸發）
3. Phase 3 [US1]（endpoint path align + migration seed audit + shape verify + Casbin wire verify + tests 全交付、F5.1 完整功能就位）
4. **STOP and VALIDATE**: 跑 quickstart.md Step 1-8
5. Phase 4 Polish：SC-001~011 全 11 指標 + quickstart 全套 + 兩段式 commit 收尾

### Single Developer Strategy

F5.1 為 small + scope-bounded feature（不涉跨域協調、無 deploy stack dependency for acceptance test）：

- Phase 1 + 2 順序做（線性）
- Phase 3 Batch 1 (endpoint path) + Batch 2 (tests) 可 cluster 做
- Phase 4 verify + commit 收尾

預計 1 個 developer 1-2 個工作天可完成（小於 F2.1 / F3、近似 F1.1 工作量）。

---

## Baseline Snapshot（記錄於 T001）

> Implementation 開始前由 T001 填入；polish 階段 SC verification 對比驗證用

```text
Before implementation (T001 執行 @ 2026-05-15 填入):
  outer branch == 005-auth-login-and-dynamic-menu: ✓
  rust-api worktree clean（行首空格）: ✓（git submodule status 行首空格、worktree git status 空）
  rust-api branch == rev1-admin-rust-api: ✓
  sys_authentication_route.rs:20 含 /auth/getUserRoutes mount: ✓（line 20、init_protected_router 內；另 line 49 在 init_authorization_router 是 /authorization/getUserRoutes、不同 endpoint、保留）
  sys_menu_route.rs init_protected_menu_router 不含 /getUserRoutes: ✓（grep 0 hit）
  casbin_envelope_adapter 命中數 in rust-api/server/: ✓ 0（grep -r 0 hit）
  axum-casbin/middleware.rs 含 "do not have the necessary permissions" 字串: ✓（lines 162 + 196 兩處）
  application-test.yaml jwt_secret 為 ≥32-char dev secret（F1.1 後）: ✓（"dev-test-secret-padded-to-thirty-two!" 37 chars）
  CODE_PERMISSION_CASBIN_DENY in server/core/src/web/code.rs: ✓ 值=5001（line 33）

After implementation (T016 / T017 / T018 / T022 執行 @ 2026-05-15 填入):
  sys_authentication_route.rs /getUserRoutes 命中數: 1 (line 48, init_authorization_router /authorization/getUserRoutes — spec E1.1 explicit preserve, NOT in F5.1 scope. /auth/getUserRoutes deleted ✓ — SC-001 functionally pass)
  sys_menu_route.rs /getUserRoutes 命中數: 2 (line 54 RouteInfo + line 73 .route — SC-002 pass)
  casbin_envelope_adapter 命中數: 3 in server/ (1 definition + 1 router_initialization wire + 1 test reference) + 1 in tests/login_handler_integration.rs
  Unit test (server-service auth_login_shapes): 8/8 綠燈 ✓ (SC-003 pass)
  Integration test (server-initialize login_handler_integration): 3/3 綠燈 ✓ (SC-004 pass)
  Acceptance test (server-initialize auth_login_e2e --ignored): **5/5 compile clean + all 5 ignored** (gated TEST_DATABASE_URL — SC-005/008/009/010 verify deferred to dev DB setup phase)
  cargo check --workspace: ✓ 0 errors / 0 warnings (SC-011 pass)

Implementation deviations / findings to flag (Phase 4 audit):
  D1 — auth_login_e2e.rs file location: moved from server-service/tests/ → server-initialize/tests/ (Cargo cycle prevents server-service dev-dep on server-initialize). Per plan T013 fallback OK.
  D2 — test 1 audit query: queries sys_login_log (not sys_operation_log with login_succeeded). Reason: actual AuthEventHandler::handle_login writes to sys_login_log + sys_tokens, NOT sys_operation_log. Contract auth-endpoints.md §1 Side effects (sys_operation_log + login_succeeded operation) does not match codebase reality — spec doc defect.
  D3 — jwt_auth_middleware missing-token envelope code = 5001 (CODE_PERMISSION_CASBIN_DENY) per jwt.rs:17-22, NOT 9999/3333 as plan T012 wording expected. Both missing-Bearer AND Casbin reject return code 5001 — client cannot distinguish.
  D4 — role codes: actual seed uses ROLE_SUPER / ROLE_ADMIN / ROLE_USER (NOT ROLE_SUPER_ADMIN as some spec examples say).
  D5 — T008 NEW migration `m20260515_a_f51_minimum_seed.rs` added 6 Casbin p-rules (3 roles × /auth/getUserInfo + /route/getUserRoutes); base existing 31 p-rules only covered ROLE_SUPER × 8 CRUD paths, ZERO coverage for F5.1 endpoints.
  D6 — T014 (empty-role acceptance test) implemented as #[ignore] documented stub; constructing real test user with zero sys_user_role too heavy for acceptance scope. Code inspection verified sys_auth_service.rs returns empty {routes:[], home:"/home"} for empty role_codes.

Deferred SC verification (dev DB / deploy stack pending — per docs/INTEGRATION-CHECKLIST.md):
  SC-005 + SC-008 + SC-009 + SC-010 (T019 acceptance test 5 fn run)
  SC-006 (T020 F3 既有 acceptance test 9 fn re-run)
  T021 F2.1 audit middleware acceptance test re-run (U3 verify)
  SC-007 (T023 quickstart Step 1-8 end-to-end)
  → 全部 compile-time correctness 已驗、runtime verify 需 dev DB 起來才能跑
```

---

## Outstanding Items Resolution Map（research.md 7 個 items）

| Outstanding | Resolved by Task |
|---|---|
| migration `datas/*` 實際 seed 完整度（3 user × role × menu × Casbin policy 是否齊）| T007 (audit) + T008 IF NEEDED (補 minimum) |
| `UserError` 變體 + AppError mapping 對「密碼錯」精確 envelope code | T013（acceptance test 內 assert envelope code 順帶 audit）|
| `AuthEvent::LoginSucceeded` / `LoginFailed` struct 是否含 password field | T013（acceptance test payload grep password 0 hit、若有 field 則進一步補 redaction）|
| Casbin envelope adapter 對 401 / 502 處理範圍 | T002（per [`research.md`](./research.md) R2 拍板「只處理 403」）|
| `axum::middleware::from_fn` adapter body fragment match 策略 | T002（per [`data-model.md`](./data-model.md) §E2 範式：status 403 + body 含 2 個 fragment 之一）|
| Login 失敗時是否寫 `sys_operation_log` row | T013（acceptance test 內 verify、若不寫則 spec FR-007 對齊範圍重新評估）|
| 3 個預設 user 各自 menu tree 預期内容 | T013（generic set inequality assertion、不 hardcode）|

---

## Notes

- **[P] tasks = 不同檔、無未完成依賴** — 可放心平行
- **[Story] label = [US1]** — F5.1 唯一 P1 US，所有 Phase 3 task 都標 [US1]
- **Verify tests pass before claiming F5.1 complete**（quickstart Step 1-8 + SC-001~011 全 pass）
- **Commit after each logical group**（不是 task-by-task）— Phase 2 結束 commit / Phase 3 dimension 結束 commit / Polish 結束 commit。但**push 全部等 user 同意**（per CLAUDE.md §6.2）
- **Avoid: 改 base `src/` 任何檔** — Constitution Principle IV 嚴格禁止（F5.1 不動 base、`.env` 也不動）
- **Avoid: rewrite 既有 `sys_auth_service.rs` / `sys_authentication_api.rs` 任何 fn** — F5.1 範圍邊界（per spec FR-024）
- **Avoid: 改 `Claims` struct / JwtUtils / sys_user 表結構** — F5.1 範圍邊界（per spec FR-029、F1.1 FR-014 + F1.1 FR-018）
- **Avoid: 引入 Casbin redis pub-sub channel** — 屬 F5.2 + F10 / F14 範圍（per spec FR-027）
- **Avoid: 改 refresh token rotation 邏輯** — 屬 F10 範圍（per spec FR-028）
- **Avoid: 引入新 envelope code** — F4 既有 24 個 code 對 F5.1 sufficient（per [`research.md`](./research.md) R3）

---

**Total tasks**: 25（22 base + 3 新增、per /speckit-analyze MEDIUM findings U1/U2/U3 fix）
**Per-phase breakdown**: Setup (1) / Foundational (3) / [US1] (11) / Polish (10)
**Parallel opportunities**: Phase 3 Batch 1 (T005-T006) + Batch 2 (T011-T015) = 7 個 [P] within Phase 3；Phase 4 T016-T018 + T020-T022 = 6 個 [P]
**MVP scope**: User Story 1 = 整個 F5.1（auth-login-and-dynamic-menu atomic increment、解鎖 P2 base-web 主體）
**Analyze fix log**：T007 I1 fix（sys_role + sys_menu count 補）/ T014 U1 NEW（role_codes empty acceptance test）/ T015 U2 NEW（getConstantRoutes acceptance test）/ T021 U3 NEW（F2.1 audit middleware test 重跑）
**下一步**：執行 `/speckit-implement` 開始實作（spec-kit 全套已 analyze 通過、無 CRITICAL/HIGH issue）
