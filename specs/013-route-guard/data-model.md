# Phase 1 Data Model: F6 route-guard

**Feature**: F6 — route-guard(`/route/isRouteExist`)
**Date**: 2026-05-18

> F6 為 rust application feature、無 DB schema 改動(`sys_menu` schema F3 + F5.1 既有)、但有 1 個 **DB seed migration**(Casbin policy)。本檔以 rust source code entity + DB seed 角度描述 7 個觸及點。

---

## E-1:`IsRouteExistInput` DTO(新建 struct)

**Location**:`rust-api/server/model/src/admin/input/sys_menu.rs`(per R-1、對齊既有 `CreateMenuInput` 同檔)

**Schema**:

```rust
use serde::Deserialize;
use validator::Validate;

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct IsRouteExistInput {
    #[validate(length(min = 1))]
    pub route_name: String,
}
```

**Field**:
- `route_name`(rust)/ `routeName`(JSON、JSON query string)— rename camelCase 對齊 base-web 既有 `fetchIsRouteExist(routeName)` 呼叫(per `service-alova/api/route.ts:19`)
- `#[validate(length(min = 1))]` — 防空字串(per FR-006、E-5)

**Export**:加進 `mod.rs` 或既有 re-export 鏈(plan 階段對齊 F5.1 既有 `CreateMenuInput` re-export 風格)。

---

## E-2:`SysMenuService::is_route_exist`(新建 method)

**Location**:`rust-api/server/service/src/admin/sys_menu_service.rs`(對齊既有 `get_constant_routes` 同 service)

**Signature**:

```rust
use server_model::admin::entities::{sys_menu, sea_orm_active_enums::Status};
use sea_orm::{EntityTrait, QueryFilter, ColumnTrait, PaginatorTrait};

impl SysMenuService {
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
}
```

**3 個 filter 不變式**(per R-7 + spec FR-003):
1. `RouteName.eq(route_name)` — exact match
2. `DeletedAt.is_null()` — F3 soft-delete 紀律
3. `Status.eq(Status::Enabled)` — 顯式 enabled only(`Banned` / `Disabled` 視為「不存在」)

**Trait impl**:若 `SysMenuService` 有 trait abstraction(per F5.1 既有 `TMenuService` import per sys_menu_api.rs:6 — 應有 trait 定義);F6 需在 trait + impl 各加 method signature。Plan 階段 grep 確認。

---

## E-3:`SysMenuApi::is_route_exist`(新建 handler)

**Location**:`rust-api/server/api/src/admin/sys_menu_api.rs`(對齊既有 `get_constant_routes` 同檔、接在 file 末尾)

**Signature**:

```rust
use axum::{extract::Query, Extension};
use server_service::admin::{IsRouteExistInput, SysMenuService};  // import 加 IsRouteExistInput
use server_core::web::{error::AppError, res::Res};
// Note: F5.1 既有 imports 已含 SysMenuService 等

impl SysMenuApi {
    pub async fn is_route_exist(
        Extension(service): Extension<Arc<SysMenuService>>,
        Query(input): Query<IsRouteExistInput>,
    ) -> Result<Res<bool>, AppError> {
        // axum Query 不自動跑 validator::Validate;F5.1 既有 query handler pattern(`Query<UserPageRequest>`)
        // 同樣不顯式 validate — 預期空字串 / 缺漏由 deserialize fail 或 ε 字串 SQL 查不到自然回 false
        // 若要嚴格、可加 input.validate()? 一行(plan 階段視 axum middleware / extractor 設計拍板)
        service.is_route_exist(&input.route_name).await.map(Res::new_data)
    }
}
```

**Response wrapping**:`Res::new_data(bool)` 包成 F4 envelope `{code:0, msg, data: true|false}`(per F5.1 既有 helper、handler signature 對齊 `get_constant_routes`)。

---

## E-4:Route mount + RouteInfo registration

**Location**:`rust-api/server/router/src/admin/sys_menu_route.rs`(對齊既有 `init_protected_menu_router`)

**改動 1:加 RouteInfo 進 routes vec**(per R-6):

```rust
// in init_protected_menu_router(), insert into existing `routes` vec:
RouteInfo::new(
    &format!("{}/isRouteExist", base_path),
    Method::GET,
    service_name,
    "查询路由是否存在",
),
```

**改動 2:加 .route() 進 Router builder**:

```rust
let router = Router::new()
    // ... 既有 8 routes 不動 ...
    .route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes))
    .route("/isRouteExist", get(SysMenuApi::is_route_exist));  // ★ F6 新增
```

**注意**:F6 用 `SysMenuApi::is_route_exist`(非 `SysAuthenticationApi`)、避免 F5.1 acceptance 階段發現的 wiring bug(F5.1 `getUserRoutes` 用 SysAuthenticationApi handler 期 `SysAuthService`、但 SysMenuRouter 注入 SysMenuService Extension、造成 runtime extension 缺失)。F6 全程 `SysMenuApi` + `SysMenuService` 對齊、無 wiring bug 風險。

---

## E-5:Casbin policy seed migration(新建)

**Location**:`rust-api/migration/src/datas/m20260518_a_f6_isRouteExist_seed.rs`(timestamp 對齊 F5.1 既有 `m20260515_a_f51_minimum_seed.rs` 風格)

**Schema**(mirror F5.1 minimum seed pattern per R-2):

```rust
//! F6 minimum seed — 補 `/route/isRouteExist` 3 roles 的 Casbin p-rules(共 3 rows)。
//! per F6 spec FR-005(plan 階段修正:allowlist mode 強制需顯式 allow);base 既有
//! m20241024_082926_insert_casbin_rule.rs 只覆蓋 ROLE_SUPER × 31 CRUD paths、未含
//! F6 endpoint、F6 acceptance test 跑前必須補。

use sea_orm_migration::{prelude::*, sea_orm::Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let insert_stmt = Statement::from_string(
            manager.get_database_backend(),
            r#"
            INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5)
            VALUES
            ('p', 'ROLE_SUPER', 'built-in', '/route/isRouteExist', 'GET', '', ''),
            ('p', 'ROLE_ADMIN', 'built-in', '/route/isRouteExist', 'GET', '', ''),
            ('p', 'ROLE_USER',  'built-in', '/route/isRouteExist', 'GET', '', '')
            "#
            .to_string(),
        );
        db.execute(insert_stmt).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let delete_stmt = Statement::from_string(
            manager.get_database_backend(),
            r#"
            DELETE FROM casbin_rule
            WHERE ptype = 'p' AND v1 = 'built-in'
              AND v2 = '/route/isRouteExist' AND v3 = 'GET'
              AND v0 IN ('ROLE_SUPER', 'ROLE_ADMIN', 'ROLE_USER')
            "#
            .to_string(),
        );
        db.execute(delete_stmt).await?;
        Ok(())
    }
}
```

**含 3 row**(完全 mirror F5.1 既有 6-row pattern,F6 因為單一 endpoint 故 3 row 即可)。

---

## E-6:Migration mod.rs(改、register migration)

**Location**:`rust-api/migration/src/datas/mod.rs`

**改動**:

```rust
// 加 pub mod:
pub mod m20260518_a_f6_isRouteExist_seed;

// 加進 migrations list(對齊既有 list 末尾):
// (vec 內加 Box::new(m20260518_a_f6_isRouteExist_seed::Migration))
```

Plan 階段視 mod.rs 既有 list 結構決定加在哪(若有 ordered list、append 至末尾)。

---

## E-7:Outer doc(改、既有檔)

**`CLAUDE.md` §10 SPECKIT marker** — F6 implement 階段更新 Active feature;Phase 7 收尾改回 「無」+ 加 F6 進 Previous features。

**`docs/INTEGRATION-CHECKLIST.md`** — F6 row ✅ + Current Focus 加 F6 完成 + 已完成里程碑加 F6 條目。

---

## 跨 entity 關係

```
[E-1] IsRouteExistInput DTO ──used by──> [E-3] SysMenuApi::is_route_exist handler
                                                    │
                                                    └─ extension ──> [E-2] SysMenuService::is_route_exist
                                                                              │
                                                                              └─ filter SQL ──> sys_menu table (F3+F5.1 既有)

[E-4] sys_menu_route.rs ──mounts──> [E-3] handler
                       └──registers RouteInfo──> ROUTE_COLLECTOR ──boot sync──> sys_endpoint table

[E-5] casbin_rule seed migration ──INSERT 3 rows──> casbin_rule table
                                                          │
                                                          └─ enforced by CasbinAxumLayer ──> allow [E-3] for 3 roles

[E-6] migration mod.rs ──registers──> [E-5]

[E-7] outer doc ──after Phase 7 commit──> rev1-admin-root
```

**強耦合**:E-1 ~ E-5 屬於 rust-api worktree(第 1 段 commit);E-7 屬 outer(第 2 段 commit + SHA pin update)。

---

## State / Lifecycle(N/A)

F6 為純 read endpoint、無 state、無 lifecycle 遷移。Casbin seed row 屬靜態 fixture(migration up/down 控制)。

---

**Phase 1 data-model 完成、contracts + quickstart 啟動條件滿足**。
