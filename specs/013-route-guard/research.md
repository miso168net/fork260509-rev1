# Phase 0 Research: F6 route-guard

**Feature**: F6 — route-guard(`/route/isRouteExist`)
**Date**: 2026-05-18
**Source**: [spec.md](spec.md) + [docs/superpowers/010-feature-route-guard.md](../../docs/superpowers/010-feature-route-guard.md)

> Brainstorm 階段保留 4 個 OQ(plan-stage detail)、plan 階段透過 rust-api source code 探勘全部解開,並**發現 1 個新關鍵 architectural 議題:Casbin allowlist mode → F6 必須補 sys_endpoint + casbin_rule seed**(否則所有 logged-in user 被 deny)。

---

## R-1:DTO 位置(OQ-1 解)

### Decision

`IsRouteExistInput` struct 放在 **`rust-api/server/model/src/admin/input/sys_menu.rs`**(對齊既有 `CreateMenuInput` / `UpdateMenuInput` per-module input 慣例)。

### Evidence

- `rust-api/server/model/src/admin/input/` 目錄含 11 個 per-module file(sys_access_key.rs / sys_authentication.rs / sys_user.rs / sys_menu.rs 等)
- F5.1 既有 `CreateMenuInput` + `UpdateMenuInput` 已在 `sys_menu.rs` 內(`use server_service::admin::{CreateMenuInput, MenuRoute, MenuTree, SysMenuModel, SysMenuService, ...}` per sys_menu_api.rs 第 4-7 行 import)
- F5.1 既有 query input pattern:`Query(params): Query<UserPageRequest>`(per sys_user_api.rs:27)、`Query<EndpointPageRequest>`(per sys_endpoint_api.rs:17)— page request 通常在 `input/sys_xxx.rs` 同檔

### Alternatives considered

- **新建 `dto/sys_menu_dto.rs`**:既有 `dto/` 只有 `sys_auth_dto.rs`、為 F1.1 auth output 抽出、不是 input;F6 input 放 input dir 對齊既有慣例
- **inline 在 handler 檔**:F5.1 既有不採此模式、F6 不破壞慣例

---

## R-2:Casbin 模式 + F6 policy 補充(OQ-2 解 + 新發現)

### Decision

**Casbin 是 ALLOWLIST mode**(`e = some(where (p.eft == allow))`)— F6 必須補 1 個 migration `m2026XXXX_a_f6_isRouteExist_seed.rs`、INSERT 3 row 對 3 個既有 role(ROLE_SUPER / ROLE_ADMIN / ROLE_USER)allow `/route/isRouteExist GET`。

### Evidence

- Casbin model 文件 `rust-api/axum-casbin/examples/rbac_model.conf` 含:
  ```
  [policy_effect]
  e = some(where (p.eft == allow))
  ```
  → ALLOWLIST(只有顯式 `p.eft == 'allow'` 的 policy 才 pass enforce)
- F5.1 既有 migration `m20260515_a_f51_minimum_seed.rs` 證明此 pattern — F5.1 加 `/auth/getUserInfo` + `/route/getUserRoutes` 各 3 role 共 6 row:
  ```sql
  INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES
  ('p', 'ROLE_SUPER', 'built-in', '/auth/getUserInfo',    'GET', '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/auth/getUserInfo',    'GET', '', ''),
  ('p', 'ROLE_USER',  'built-in', '/auth/getUserInfo',    'GET', '', ''),
  ('p', 'ROLE_SUPER', 'built-in', '/route/getUserRoutes', 'GET', '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/route/getUserRoutes', 'GET', '', ''),
  ('p', 'ROLE_USER',  'built-in', '/route/getUserRoutes', 'GET', '', '')
  ```
- F6 mirror same pattern、INSERT 3 row(3 role × `/route/isRouteExist` × `GET`)

### Critical implication for spec

**Spec FR-005 原文**:「Handler MUST **不**附加 Casbin policy(所有 logged-in user 任何 role 可查;不在 casbin_rule seed 加 entry)」

**Plan 階段修正**:**spec FR-005 second clause 須修** — F6 **必須**補 casbin_rule seed(per allowlist mode 強制要求);否則「不加 policy」= 所有 user 被 deny、與「所有 logged-in user 可查」初衷矛盾。FR-005 修為「對所有 logged-in role(SUPER / ADMIN / USER)allow `/route/isRouteExist GET`、無 role-specific 限制」。

→ **Plan-stage spec amendment**:本 plan 完成後、若 user 同意、可順手修 spec FR-005 + 新增 FR-014(migration seed 規格)。若不順改、tasks 階段也可在 task 內顯式加 seed task、acceptance 自然驗(無 seed 則 acceptance 全 fail、自然 catch)。

### Alternatives considered

- **不補 seed、改用 CasbinAxumLayer skip / exclude pattern**:`axum_casbin` 有 `add_to_skip_list` 機制可白名單 path(類似 W-F5 nginx auth bypass)、但 grep 無發現專案內既有使用;改變現有 Casbin layered 結構增加耦合、不推薦
- **F6 endpoint 移到 `init_menu_router`(public、不 layered Casbin)**:會違反 Q1 拍板(Protected 需 token)— 違反 brainstorm 拍板,不採

---

## R-3:`sys_menu.status` 型別(OQ-3 解)

### Decision

**`Status` enum**(text-backed、value: `enabled` / `disabled` / `banned`),F6 SQL filter 用 `Status::Enabled`(`sea_orm` enum compare)。

### Evidence

- `rust-api/server/model/src/admin/entities/sea_orm_active_enums.rs:20`:
  ```rust
  pub enum Status {
      #[sea_orm(string_value = "banned")]
      Banned,
      #[sea_orm(string_value = "disabled")]
      Disabled,
      #[sea_orm(string_value = "enabled")]
      Enabled,
  }
  ```
- `rust-api/server/model/src/admin/entities/sys_menu.rs` Line 22:`pub status: Status`(import `super::sea_orm_active_enums::Status`)
- F6 service:
  ```rust
  use server_model::admin::entities::sea_orm_active_enums::Status;
  // ...
  .filter(sys_menu::Column::Status.eq(Status::Enabled))
  ```

### Alternatives considered

- **String literal `.eq("enabled")`**:Sea-orm 支援、但破壞 type safety、不採
- **Integer 0/1 假設**:**錯**(原始 brainstorm A-006 假設可能 integer、現確認是 enum)

---

## R-4:utoipa macro 引入決策(OQ-4 解)

### Decision

**不引入 utoipa**(對齊 F5.1 既有風格)。

### Evidence

- `grep -rnE "#\[utoipa::path" rust-api/server/api/src` → **無 hit**
- F5.1 既有 `SysMenuApi::get_constant_routes` / `get_user_routes` / `tree_menu` / `get_menu` 等 handler 全部沒 utoipa macro
- 既有 OpenAPI doc 機制未啟用(若有也是其他來源)

### Alternatives considered

- **F6 引入 utoipa**:打破既有風格、單一 endpoint 引入 dependency 不合算;若日後 rev1 統一加 OpenAPI、屬獨立 documentation feature

---

## R-5:Casbin layered location(層次補強)

### Decision

`CasbinAxumLayer` 在 **boot 階段 init**(per `rust-api/server/initialize/src/casbin_initialization.rs::initialize_casbin()`),透過 axum `Router::layer()` 套用到 **整段 protected router**(non-`init_menu_router` segment)。F6 加 endpoint 到 `init_protected_menu_router` 內,自動繼承 Casbin enforce。

### Evidence

- `casbin_initialization.rs`:`initialize_casbin(model_path, db_url) -> Result<CasbinAxumLayer, ...>` 返 layer instance
- F5.1 既有 handler 用 `Extension(mut cache_enforcer): Extension<CasbinAxumLayer>` 取 layer instance(per sys_authentication_api.rs:87)— 表示 layer 透過 `Extension` 注入、可在 handler 內也用 casbin API
- F5.1 既有 `init_protected_menu_router` 已掛 `/route/getUserRoutes`(F5.1 acceptance 已驗 protected enforce work)— F6 加 `/route/isRouteExist` 同 nested 結構自動繼承

### F6 不必動 layer init

F6 只新增 endpoint + casbin_rule seed,**不**動 layer wiring。

---

## R-6:`add_route(RouteInfo)` global registry 機制(層次補強)

### Decision

F6 加 `RouteInfo::new("/route/isRouteExist", Method::GET, "SysMenuApi", "查询路由是否存在")` 進 `init_protected_menu_router` 內 `routes` vec(對齊 F5.1 既有 add_route 模式),由 boot 階段 sync 進 sys_endpoint 表(global registry)。

### Evidence

- F5.1 既有 `sys_menu_route.rs::init_protected_menu_router` 第 28-58 行有 `routes` vec + `for route in routes { add_route(route).await; }`
- `server/global/src/global.rs:203` 有 `ROUTE_COLLECTOR: Lazy<Mutex<Vec<RouteInfo>>>`、`add_route()` push 進 collector
- F5.1 既有 vec 含 `/route/getUserRoutes` entry(line 46-50)— F6 mirror 加 1 條

### 中文 description 規格

對齊 F5.1 既有 description 風格(`"获取用户路由"` / `"获取菜单树"` 等):F6 用 **"查询路由是否存在"**(查 / 路由 / 是否 / 存在 — 4 字一頓、符合既有用詞)。

---

## R-7:Status filter 全字段(避免 forgotten 邊界)

### Decision

F6 service SQL 必含 **3 個 filter**:
1. `RouteName.eq(route_name)` — 主 query
2. `DeletedAt.is_null()` — F3 soft-delete 紀律
3. `Status.eq(Status::Enabled)` — sys_menu 顯式啟用 row only

### Rationale

- 缺(2)會在 F7 manage 刪 menu 後仍返 true、產生過期 false positive
- 缺(3)會把 `Status::Disabled` 或 `Status::Banned` row 算為「存在」、違反 spec FR-003 + US3 紀律驗

### `count() > 0` vs `.one().is_some()` vs raw EXISTS

效率排序:raw EXISTS ≥ `.one().is_some()` ≥ `.count() > 0`(`count` 全表 scan 後 count、其他兩個短路 LIMIT 1)。F6 選 **`.count() > 0`** 簡潔對齊 sea-orm 慣用 idiom,**配合 `sys_menu(route_name)` 既有 unique index(per sys_menu entity `#[sea_orm(unique)]` attribute)**,query planner 走 index lookup 後 count = 0 或 1、無 full scan。NFR-001 latency p99 ≤ 50ms 預期 PASS。

### Alternatives considered

- **raw EXISTS** via `Statement::from_string`:更高效但對齊既有 sea-orm DSL 風格較差、不採;若 implement 階段 benchmark 發現 latency 超標可改

---

## Open questions(無)

OQ-1 ~ OQ-4 全部解開 + 1 個新發現(R-2 Casbin allowlist 必須補 seed)消化進 plan / 後續 tasks。Research 7 個技術點均有明確 decision + evidence + alternative。**Phase 0 完成、Phase 1 啟動條件滿足**。
