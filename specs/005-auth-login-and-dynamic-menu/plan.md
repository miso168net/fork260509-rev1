# Implementation Plan: F5.1 — auth-login-and-dynamic-menu

**Branch**: `005-auth-login-and-dynamic-menu` | **Date**: 2026-05-15 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from [`spec.md`](./spec.md)

## Summary

F5.1 = rev1 rust-api **auth login + dynamic menu** 整套交付 — DESIGN-A 設計支柱第一條落地、P2 解鎖 base-web 主體。技術手段：(1) **endpoint path align** — `/auth/getUserRoutes` 移動至 `/route/getUserRoutes`、刪除舊 path（sys_authentication_route.rs `init_protected_router` 移除 line 20 mount、改加 `/route/getUserRoutes` 在 sys_menu_route.rs `init_protected_menu_router`）；(2) **Casbin reject envelope hook** — 既有 `axum-casbin/middleware.rs:153-197` Casbin reject 返 plain text 403、F5.1 範圍內補 thin adapter middleware 將 plain text 403 轉成 F4 envelope `Res::new_error(CODE_PERMISSION_CASBIN_DENY=5001, msg)`；(3) **Shape align verify** — `AuthOutput` / `UserInfoOutput` / `UserRoute` / `MenuRoute` 既有皆已 `#[serde(rename_all = "camelCase")]`、F5.1 unit test cover；(4) **Policy seed minimum** — verify migration `datas/*`（sys_role / sys_user_role / sys_role_menu / sys_menu / sys_casbin_rule 共 5 個 files、總 197 行）含 3 個預設 user × role × menu × Casbin policy 完整；若缺漏只補 acceptance test pass 所需 minimum；(5) **Unit + integration + acceptance test** — 3 個 e2e fn `#[ignore]` test 走 real-postgres + login flow + audit verify（payload 不含 plaintext password）。範圍邊界明示 6 個 MUST NOT：不 rewrite 既有 service/handler、不動 base、不改 domain 寫死、不引入 pub-sub、不改 refresh token、不改 Claims struct。

## Technical Context

**Language/Version**: Rust（rust-api 既定 toolchain 1.86.0、cargo workspace、edition 各 crate 既定）
**Primary Dependencies**: 既有 `axum_casbin`（local crate `axum-casbin/`）+ `casbin` workspace dep + `sea-orm-adapter`（local crate）+ `server-service` + `server-core::web::{auth, error, jwt, code, res}` — **F5.1 不引入新 crate**；只新增 1 個 thin adapter middleware（in `server-middleware/src/`）將 Casbin plain text 403 轉 F4 envelope
**Storage**: PostgreSQL — F5.1 不改 schema、verify 既有 `sys_user` / `sys_role` / `sys_menu` / `sys_role_menu` / `sys_user_role` / `sys_casbin_rule` / `sys_operation_log` 表使用；補 minimum policy seed 走 migration `datas/*`
**Testing**: cargo test — (a) unit test in `server-service/tests/` 對 TreeBuilder + shape serde（pure Rust 無 DB 依賴）；(b) integration test in `server-initialize/tests/` 對 login_handler + Casbin layer（axum-test-helpers + mock policy）；(c) acceptance test in `server-service/tests/` 3 個 `#[ignore]` e2e fn 走 real-postgres + `TEST_DATABASE_URL` env（同 F3 G11 模式）
**Target Platform**: docker container（per DESIGN-W）；rev1 dev 階段 `cargo run --bin server`（debug 載入 application-test.yaml、release 載入 application.yaml）；prod 走 Docker secrets + `_FILE` pattern
**Project Type**: web-service（rust-api 為 axum HTTP service）+ frontend dependency（base-web 解鎖 P2）
**Performance Goals**: N/A（F5.1 audit + verify 既有 service、不改 performance characteristic）
**Constraints**:
- 既有 service / handler / Claims / JwtUtils 不改（per spec FR-024 / FR-029）
- base 不動（per Constitution §IV + spec FR-025）
- Casbin enforce 拒絕走 F4 envelope（per spec Q2 拍板 + FR-017）
- audit payload 不含 plaintext password（per spec Q1 拍板 + FR-006）
- policy seed 補修限 minimum scope（per spec Q3 拍板 + FR-018）
**Scale/Scope**: 1 個 thin adapter middleware（~50 行）+ 2 個 router 改（move endpoint）+ 1-2 個 migration `datas/*` 補（若缺）+ 8 個 unit test fn + 2-3 個 integration test fn + 3 個 acceptance test fn `#[ignore]`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Phase 0 Pre-check（基於 spec.md 設計意圖）

| Principle | F5.1 影響 | 評估 | 註 |
|---|---|---|---|
| **I. RBAC Fail-safe** | F5.1 是 Casbin enforce 首次啟用、policy 缺 → 拒絕；reject 走 F4 envelope thin adapter | ✅ Direct compliance — F5.1 落實 §I 全條 |
| **II. Soft Delete + 全域 Audit** | F5.1 不引入新 entity 寫入；login_succeeded / login_failed audit 走 F2.1 既有 path；payload redaction 對齊 F2.1 trait | ✅ Compliant |
| **III. 嚴版禁 Forward + 單一職責** | F5.1 純 rust-api 內部、無跨服務 forward；endpoint ownership 唯一（`/route/getUserRoutes` 由 rust 服務） | ✅ Compliant |
| **IV. base 不改動邊界** | F5.1 不動 base-web 任何檔；shape align 由 rust adapt 既有 `Api.*` typing | ✅ Compliant |
| **V. 漸進收縮** | F5.1 = DESIGN-A scope minimal；F5.2 Casbin redis pub-sub 留與 F10/F14 同期；nestjs 退場時 F5.1 core flow 不變 | ✅ Compliant — F5.1 為 future-proof prep but not premature impl |

### 架構約束（Architectural Constraints）

| 約束 | F5.1 影響 | 評估 |
|---|---|---|
| 部署形態（docker compose） | F5.1 不引入新 service；既有 rust-api server 一致 | ✅ N/A |
| DB（PostgreSQL） | F5.1 verify 既有 schema 使用、minimum policy seed 補（migration `datas/*`）| ✅ Compliant |
| 快取與 pub-sub（redis） | F5.1 **不**用 redis pub-sub（Casbin invalidation 留 F5.2）；既有 sign nonce_store fallback in-memory dev / redis prod 不變 | ✅ Compliant |
| TLS | F5.1 不涉 | ✅ N/A |
| Secret 注入 | F5.1 不涉 secret 新增；JWT secret 走 F1.1 既有 | ✅ N/A |
| DB migration trigger | F5.1 可能補 minimum policy seed（屬 datas/ migration、走既有 init container path）| ✅ Compliant |
| Port 規劃 | F5.1 不涉 | ✅ N/A |
| Observability | F5.1 沿用既有 tracing layer + `project_info!` / `project_error!` 既有 macros | ✅ Compliant |
| 結構化 log | F5.1 不引入新 log format | ✅ Compliant |
| Backup / 背景工作 / CI/CD | F5.1 不涉 | ✅ N/A |

### 開發流程

| 流程 | F5.1 對齊 | 評估 |
|---|---|---|
| spec-kit 流程紀律 | specify → clarify（3 個拍板）→ plan → tasks/implement 接續 | ✅ Compliant |
| 兩段式 commit | F5.1 implementation 階段：rust-api worktree commit + push fork、outer 在 `005-auth-login-and-dynamic-menu` feature branch 更新 SHA pin（per CLAUDE.md §6.1）| ✅ Planned |
| Commit message 規範 | Conventional Commits 中文 subject + Co-Authored-By trailer | ✅ Planned |
| Push 確認紀律 | 所有 push 等 user 同意 | ✅ Planned |
| DESIGN 文件權威 | spec.md 已引用 DESIGN-A §6.1 F5 + DESIGN-B §6.1 F5 + Constitution + F1.1/F2.1/F3/F4 spec | ✅ Compliant |

**Phase 0 Gate 結論**：✅ **All gates pass、無 violation、Complexity Tracking 表免填**。

### Phase 1 Post-check（基於 data-model.md / contracts/ 設計後）

設計層產物未引入新 violation：
- data-model.md 範圍純 verify 既有 struct / module + 新增 thin adapter middleware
- contracts/ 列既有 4 endpoint 完整 API contract（path / method / request / response shape）
- quickstart.md 走完整 deploy stack（postgres + rust-api + base-web）+ unit / integration / acceptance test 三層

✅ **Post-design Gate pass**。

## Project Structure

### Documentation (this feature)

```text
specs/005-auth-login-and-dynamic-menu/
├── plan.md                  # 本檔
├── spec.md                  # /speckit-specify 產出 + /speckit-clarify 3 個拍板
├── research.md              # /speckit-plan Phase 0 產出（R1~R6 decisions + 既有 codebase audit summary）
├── data-model.md            # /speckit-plan Phase 1 產出（router 改 + thin adapter middleware + 影響檔案清單）
├── quickstart.md            # /speckit-plan Phase 1 產出（驗 F5.1 跑通流程）
├── contracts/
│   ├── auth-endpoints.md    # /speckit-plan Phase 1 產出（4 endpoint API contract：login / getUserInfo / getUserRoutes / getConstantRoutes）
│   └── casbin-enforce.md    # /speckit-plan Phase 1 產出（Casbin reject envelope contract + thin adapter behavior）
├── checklists/
│   └── requirements.md      # /speckit-specify 階段 quality checklist
└── tasks.md                 # /speckit-tasks 產出（尚未建立）
```

### Source Code (repository root)

```text
fork260509-rev1/                                       # 外層 monorepo (feature branch: 005-auth-login-and-dynamic-menu)
├── rust-api/                                          # worktree (long-running branch: rev1-admin-rust-api)
│   ├── server/router/
│   │   └── src/admin/
│   │       ├── sys_authentication_route.rs            # MODIFY (移除 init_protected_router 內 `/auth/getUserRoutes` line 20 mount)
│   │       └── sys_menu_route.rs                      # MODIFY (init_protected_menu_router 加 `/route/getUserRoutes` mount SysAuthenticationApi::get_user_routes)
│   ├── server/middleware/
│   │   └── src/
│   │       ├── lib.rs                                 # MODIFY (pub mod casbin_envelope_adapter;)
│   │       └── casbin_envelope_adapter.rs             # NEW (thin adapter middleware 將 Casbin plain text 403 → F4 envelope CODE_PERMISSION_CASBIN_DENY)
│   ├── server/initialize/
│   │   └── src/router_initialization.rs               # MODIFY (apply_layers 內 need_casbin block 後加 casbin_envelope_adapter middleware wire；line 72-76 之後)
│   ├── server/service/
│   │   └── tests/
│   │       ├── auth_login_shapes.rs                   # NEW (unit test for AuthOutput / UserInfoOutput / UserRoute / MenuRoute camelCase serde + TreeBuilder boundary)
│   │       └── auth_login_e2e.rs                      # NEW (acceptance test 3 #[ignore] e2e fn：login_succeeds_returns_token / get_user_info_returns_user_with_roles / get_user_routes_returns_tree_with_home)
│   ├── server/initialize/
│   │   └── tests/
│   │       └── login_handler_integration.rs           # NEW (integration test：login_handler axum-test-helpers + Casbin layer mock policy + Casbin envelope adapter verify)
│   └── migration/src/datas/
│       └── m20260515_<auto-id>_f51_minimum_seed.rs    # NEW IF NEEDED (minimum policy seed 補；具體哪些 record 由 plan research.md audit 後 tasks 階段量化；可能 0 改動如既有 seed 完整)
```

**Structure Decision**：F5.1 動 2 個 router 檔（move endpoint path）+ 1 個 NEW middleware crate（thin adapter）+ 1 個 initialize 改（wire adapter）+ 3 個 NEW test 檔（unit + integration + acceptance）+ 0-1 個 NEW migration 檔（policy seed minimum、研究後決定）。**不**改 `server-core::web::{auth, jwt, error, code, res}` / `sys_auth_service.rs` / `sys_authentication_api.rs` / Claims struct（per spec FR-024 / FR-029 + Constitution §IV）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

✅ **無 violation 需要 Complexity Tracking** — Phase 0 + Phase 1 Constitution Check 全 pass。

---

**Phase 0 / Phase 1 產物**：見同目錄 [`research.md`](./research.md)、[`data-model.md`](./data-model.md)、[`contracts/auth-endpoints.md`](./contracts/auth-endpoints.md)、[`contracts/casbin-enforce.md`](./contracts/casbin-enforce.md)、[`quickstart.md`](./quickstart.md)。

**下一步**：執行 `/speckit-tasks` 產生 dependency-ordered tasks.md。
