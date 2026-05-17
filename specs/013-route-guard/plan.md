# Implementation Plan: F6 — route-guard(`/route/isRouteExist`)

**Branch**: `013-route-guard` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-route-guard/spec.md`

## Summary

F6 是 application Phase 2 第二個 feature(F5.1 後)— 加 1 個 rust-api endpoint `GET /route/isRouteExist?routeName=<name>` 補完 base-web vue-router guard 在 dynamic auth route mode 下「not-found vs 無權限」disambiguation 邏輯。**Plan stage 解開 4 個 brainstorm OQ + 發現 1 個關鍵 architectural 議題(Casbin allowlist mode → F6 必須補 sys_endpoint + casbin_rule seed)**,範疇從「~5 rust file」修正為「~6 rust file + 1 migration」。

**Technical approach**(per [research.md](research.md)):

- **DTO 位置(OQ-1 解)**:input struct 放 `rust-api/server/model/src/admin/input/sys_menu.rs`(per F5.1 既有 `CreateMenuInput` / `UpdateMenuInput` 同檔慣例)
- **Casbin model(OQ-2 解、新發現)**:**ALLOWLIST mode**(`e = some(where (p.eft == allow))`)— F6 必須補 1 個 migration `m2026XXXX_a_f6_isRouteExist_seed.rs`、INSERT 3 row 對 3 個既有 role(ROLE_SUPER / ROLE_ADMIN / ROLE_USER)allow `/route/isRouteExist GET`,完全 mirror F5.1 既有 `m20260515_a_f51_minimum_seed.rs` pattern
- **sys_menu.status 型別(OQ-3 解)**:`Status` enum(`enabled` / `disabled` / `banned`),F6 SQL filter 用 `Status::Enabled`
- **utoipa macro(OQ-4 解)**:F5.1 既有 handler 無 utoipa attribute,F6 對齊不引入
- **Casbin layered location**:`CasbinAxumLayer` 在 boot 階段 init,layered 到 protected router 整段(不對 single endpoint apply)— F6 加 endpoint 到 `init_protected_menu_router` 內自動繼承 Casbin enforce
- **add_route(RouteInfo)機制**:F5.1 既有 `routes` vec 註冊到全域 `ROUTE_COLLECTOR`、用於 sys_endpoint 表自動 sync(boot 階段);F6 加 1 條 `RouteInfo::new("/route/isRouteExist", Method::GET, "SysMenuApi", "查询路由是否存在")` 進 vec
- **兩段式 commit**(per CLAUDE.md §6.1):
  - 第 1 段 worktree:`cd rust-api && git commit ...` + `git push origin rev1-admin-rust-api`
  - 第 2 段 outer:`git add rust-api && git commit -m 'chore(submodule): bump rust-api to <sha>: F6 ...'`

**Pre-implement validation tasks**:

- **T1**:DB migration up 後、`SELECT v2 FROM casbin_rule WHERE v2 = '/route/isRouteExist'` 預期 3 rows(3 roles allow)
- **T2**:`sys_menu` 表既有 unique index on `route_name`(避免 multiple row 同 name)— grep migration confirm、若缺加 migration
- **T3**:F5.1 既有 stack up + login + curl `/route/getUserRoutes`(F5.1 已驗 baseline、F6 不該破)
- **T4**:F6 完成後 curl `/route/isRouteExist?routeName=home` 與 `?routeName=nonexistent` 各驗 true/false

## Technical Context

**Language/Version**:Rust 1.x(F5.1 既有 toolchain)+ axum + sea-orm + sea-orm-migration + axum-casbin

**Primary Dependencies**:
- **F5.1 既有 `SysMenuApi` + `SysMenuService` + `init_protected_menu_router`** — F6 加 1 handler + 1 service method 沿用既有結構
- **F5.1 既有 `CasbinAxumLayer`** — 自動 enforce 進 protected router、F6 endpoint 對應 casbin_rule seed 後自動 PASS
- **既有 `axum_casbin::CasbinAxumLayer` allowlist model** — F6 必須補 policy seed
- **既有 `ROUTE_COLLECTOR` global registry**(`server/global/src/global.rs:203`)— F6 加 RouteInfo 進 vec、sys_endpoint 表 boot 自動 sync
- **sea_orm Status enum**(`server/model/src/admin/entities/sea_orm_active_enums.rs`)— F6 SQL filter 用 `Status::Enabled`

**Storage**:
- **`rust-api/server/api/src/admin/sys_menu_api.rs`**(改)— 加 `is_route_exist` handler、~10 LOC
- **`rust-api/server/service/src/admin/sys_menu_service.rs`**(改)— 加 `is_route_exist` method、~10 LOC + 1 import(`Status` enum)
- **`rust-api/server/model/src/admin/input/sys_menu.rs`**(改)— 加 `IsRouteExistInput` struct、~10 LOC + Serialize/Validate derive
- **`rust-api/server/router/src/admin/sys_menu_route.rs`**(改)— `init_protected_menu_router` 加 1 條 `RouteInfo::new` + 1 條 `.route("/isRouteExist", get(...))`、~4 LOC
- **`rust-api/migration/src/datas/m2026XXXX_a_f6_isRouteExist_seed.rs`**(新建)— `MigrationTrait` impl、INSERT 3 row、~50 LOC mirror F5.1 既有 pattern
- **`rust-api/migration/src/datas/mod.rs`**(改)— `pub mod m2026XXXX_a_f6_isRouteExist_seed;` + `Box::new(...)` 加進 migrations list、~2 LOC
- **outer:`docs/INTEGRATION-CHECKLIST.md`**(改)+ **`CLAUDE.md`**(改)+ **`.specify/feature.json`**(已 specify 階段改)

**Testing**:
- **Unit test**(rust):`is_route_exist` service method test、test fixture 含 active/disabled/soft-deleted menu row
- **Integration test**(rust + real postgres):`#[ignore]` test、TEST_DATABASE_URL setup、login + curl `/route/isRouteExist`
- **Acceptance test**(dev stack):per quickstart.md 命令、curl + manual SQL setup for US3
- **Manual e2e**(base-web 瀏覽器):訪不存在 path → 留 not-found / 訪存在但無權限 path → 重導 403(F6 完成後依賴 base 既有 guard 自動觸發)

**Target Platform**:rust-api Linux container(W-F1 既有 debian:bookworm-slim multi-stage)、dev 機透過 W-F6 stack 跑

**Project Type**:application feature(rust source code)、**不**是 deploy / infra feature

**Performance Goals**:
- Handler latency p99 ≤ 50ms(loopback、單一 sea-orm count + index lookup,per NFR-001)
- SQL EXISTS / count() 走 `sys_menu(route_name)` unique index — plan 階段 grep migration 確認;若缺、F6 範疇內加 migration(屬 NFR-002)

**Constraints**:
- `MUST NOT` 動 base-web src(per Constitution Principle IV + FR-011)
- `MUST NOT` 動 sys_menu schema(F3 + F5.1 已就位)
- `MUST NOT` 加 caching / rate limiting(per OOS-005/006)
- `MUST NOT` 加 user-specific 可訪問性檢查(那是 getUserRoutes 範疇)
- `MUST NOT` 引入 utoipa macro(per OQ-4 對齊 F5.1 既有風格)
- `MUST` 走兩段式 commit(per CLAUDE.md §6.1 + FR-010)
- `MUST` 補 casbin_rule policy seed(per OQ-2 新發現:allowlist mode + F6 不補 = 所有 logged-in user 被 deny)

**Scale/Scope**:
- 改動 / 新建檔案數:**6 個 rust 檔**(handler / service / input / router / migration / mod.rs)+ **2 個 outer 檔**(CHECKLIST + CLAUDE.md)= 8 個檔
- LOC 量級:~50 LOC rust source(主要 migration 50 行 + 5 個小改動)+ ~10 行 outer doc
- Commit 模式:**兩段式 commit**(per CLAUDE.md §6.1)— 第 1 段 worktree 內、第 2 段 outer SHA pin update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ✅ **PASS**(F6 endpoint 走 F5.1 既有 `CasbinAxumLayer` enforce、F6 補 casbin_rule policy seed 對 3 role allow `/route/isRouteExist GET`、前端 menu 隱藏不作為 access control)
- **II. Soft Delete + Audit Log** — ✅ **PASS**(F6 純 read endpoint、不寫業務 audit;F6 service SQL filter 嚴守 `deleted_at IS NULL` 紀律,per FR-003 / R-3)
- **III. 嚴版禁 Forward + 單一職責** — ✅ **PASS**(F6 endpoint 由 rust-api 唯一負責、無 backend ↔ backend forward;nginx config 對應 `/api/route/*` 已由 W-F5 既有 reverse proxy 處理、F6 不動 nginx)
- **IV. base 不改動邊界** — ✅ **PASS**(F6 後端適配、base-web src 零改動;既有 `fetchIsRouteExist` 兩套 client + store action 已對齊新 endpoint)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(F6 兩個 track identical、無 nestjs bridge 議題;handler 在 rust-api、未來 nestjs 退場零影響)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ❌ **N/A**(F6 純 rust application feature)
- **資料庫 PostgreSQL** — ✅ **PASS**(F6 用 sea-orm 查 sys_menu 表 + 新 migration 加 casbin_rule seed)
- **快取 redis** — ❌ **N/A**(F6 不用 redis、per OOS-005)
- **TLS 對外** — ❌ **N/A**(F6 不改 TLS、走 W-F6 既有)
- **Secret 注入** — ❌ **N/A**(F6 不需 secret)
- **DB migration trigger** — ✅ **PASS**(F6 新 migration `m2026XXXX_a_f6_isRouteExist_seed.rs` 走既有 sea-orm-cli + W-F3 既有 migration init container 機制)
- **Port 規劃 `1XXXX`** — ❌ **N/A**(F6 不改 port、走 W-F7 既有)
- **Observability** — ❌ **N/A**(F6 不改 log/metric;F2.1 既有 HTTP middleware 對 GET 既有行為、A-008 已 note)
- **結構化 log JSON** — ❌ **N/A**(F6 不改 log 配置)
- **Backup PITR** — ❌ **N/A**(F6 stateless read endpoint;新增 casbin_rule row 由 W-F15 既有 backup 涵蓋)
- **背景工作** — ❌ **N/A**
- **CI/CD platform** — ❌ **N/A**(F6 不改 CI;W-F18 落地時自動 cover rust-api build pipeline)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(brainstorm → /speckit-specify → /speckit-clarify(0 Q)→ /speckit-plan 流程完整)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、0 violation、0 partial)
- **兩段式 commit 紀律** — ✅ **PASS**(F6 動 rust-api worktree、明確兩段:worktree commit + outer SHA pin update;per FR-010)
- **Conventional Commits 中文 subject** — ✅ **PASS**(預期:第 1 段 `feat(rust-api): F6 加 /route/isRouteExist endpoint + Casbin policy seed`、第 2 段 `chore(submodule): bump rust-api to <sha> — F6 route-guard 落地`)
- **Push 確認紀律** — ✅ **PASS**(implement 完成後 push 需 user 同意;worktree push 與 outer push 各自確認)
- **TLS 紀律** — ❌ **N/A**

**Gate result**:**8 PASS / 15 N/A / 0 Partial / 0 violation**。Phase 0 起 gate 通過、無 Complexity Tracking entry 需要。

## Project Structure

### Documentation (this feature)

```text
specs/013-route-guard/
├── plan.md                              # This file(/speckit-plan output)
├── research.md                          # Phase 0 — OQ-1~OQ-4 解 + Casbin allowlist 新發現
├── data-model.md                        # Phase 1 — 6 個 entity(handler / service / input / route mount / migration / mod.rs)
├── quickstart.md                        # Phase 1 — operator implement + acceptance guide
├── contracts/                           # Phase 1
│   ├── endpoint-contract.md             #   C-E* request/response 契約
│   ├── db-seed-contract.md              #   C-D* casbin_rule seed 契約 + sys_menu filter
│   └── verification-commands.md         #   C-V* host curl + SQL 驗
├── checklists/
│   └── requirements.md                  # /speckit-specify 階段已產出
├── spec.md                              # /speckit-specify 階段已產出
└── tasks.md                             # Phase 2 output(/speckit-tasks、NOT in this command)
```

### Worktree 改動(F6 implement 階段預期變動範圍 — **動 rust-api worktree**)

```text
rust-api/                                # rust-api worktree(動;兩段式 commit 第 1 段)
├── server/
│   ├── api/src/admin/sys_menu_api.rs    # ★ F6 改:加 is_route_exist handler
│   ├── service/src/admin/sys_menu_service.rs  # ★ F6 改:加 is_route_exist service method
│   ├── model/src/admin/input/sys_menu.rs      # ★ F6 改:加 IsRouteExistInput struct
│   └── router/src/admin/sys_menu_route.rs    # ★ F6 改:加 RouteInfo + .route() mount
└── migration/src/datas/
    ├── m2026XXXX_a_f6_isRouteExist_seed.rs   # ★ F6 新建:Casbin policy seed
    └── mod.rs                                  # ★ F6 改:pub mod + Box::new(...) entry
```

### Outer repo 改動

```text
fork260509-rev1/                         # outer repo root(動;兩段式 commit 第 2 段)
├── rust-api                              # ★ F6 改:submodule SHA pin update
├── CLAUDE.md                            # F6 改:§10 SPECKIT marker
└── docs/INTEGRATION-CHECKLIST.md        # F6 改:F6 row ✅ + Current Focus + 已完成里程碑
```

**Worktree base-web 不動**:per FR-011 + Constitution Principle IV — F6 純後端適配、base-web `fetchIsRouteExist` 既有 wiring 已對齊。

**Structure Decision**:F6 為**rust-api source feature**(animation 後第一個動 worktree 的 feature、Phase W deploy 都純 outer)、走完整兩段式 commit 紀律。改動範圍緊湊:6 rust 檔 + 2 outer doc;Casbin migration seed 是新發現的必要範疇(plan 階段才確認 allowlist mode)、屬 F6 範疇內。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**無 violation、本表保留為空**(per Gate result 0 violation / 0 partial)。

---

**Phase 0 / 1 outputs**:見同目錄 [`research.md`](research.md)、[`data-model.md`](data-model.md)、[`quickstart.md`](quickstart.md)、[`contracts/`](contracts/)。
