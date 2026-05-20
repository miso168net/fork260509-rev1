# Research: F8 — assign-users

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-20

F8 為 application Phase 3 第三個 feature、F7/F7.1/F7.2 base manage/* 跑通鏈的收尾。Brainstorm 已 saturated(per [`docs/superpowers/025-feature-assign-users.md`](../../docs/superpowers/025-feature-assign-users.md)、3 顯式 Q + 1 Approach 拍板)、spec 0 個 `[NEEDS CLARIFICATION]` marker、`/speckit-clarify` 0 question。Phase 0 紀錄為 implement-time pattern 確認,不解 spec 級 unknown。

---

## R-Q1: `assign_users` API handler 該用什麼形態?

**Question**: F8 新 handler `SysAuthenticationApi::assign_users` 怎麼寫?與 sibling `assign_permission` / `assign_routes` 的差異?

**Evidence**(2026-05-20 既有 code):
- `assign_permission` handler(`sys_authentication_api.rs:90-102`)— 需 `Extension<CasbinAxumLayer>`(取 `enforcer`),因 `assign_permission` service method 簽章帶 `enforcer` 參數(寫 Casbin `p` policy)
- `assign_routes` handler(`sys_authentication_api.rs:107-116`)— **不需** `enforcer`:`Extension<Arc<SysAuthorizationService>>` + `ValidatedForm<AssignRouteDto>` → `service.assign_routes(input.domain, input.role_id, input.route_ids)` → `Res::new_data(())`
- `assign_users` service method 簽章(`sys_authorization_service.rs:69` trait / `:302` impl):`assign_users(&self, role_id: String, user_ids: Vec<String>) -> Result<(), AppError>` — **無 `domain`、無 `enforcer`**(只寫 `sys_user_role` join table)
- `AssignUserDto`(`server/model/src/admin/input/sys_authorization.rs:30-38`):`{ role_id, user_ids }`、各 `#[validate(length(min = 1))]`、`#[serde(rename_all = "camelCase")]`

**Decision**: F8 handler **比照 `assign_routes`**(不需 `enforcer`、比 `assign_permission` 更簡):
```rust
/// 为角色分配用户
///
/// 将指定的用户分配给指定角色。
pub async fn assign_users(
    Extension(service): Extension<Arc<SysAuthorizationService>>,
    ValidatedForm(input): ValidatedForm<AssignUserDto>,
) -> Result<Res<()>, AppError> {
    service
        .assign_users(input.role_id, input.user_ids)
        .await?;

    Ok(Res::new_data(()))
}
```
- `AssignUserDto` 加進 `sys_authentication_api.rs` 既有 `use server_service::admin::{...}` import 清單(`AssignPermissionDto, AssignRouteDto` 旁加 `AssignUserDto`)

**Rationale**:
- `assign_users` service method 無 `enforcer` 參數(user→role 寫 join table、不碰 Casbin),故 handler 不需 `Extension<CasbinAxumLayer>` — 形態與 `assign_routes` 完全一致
- `ValidatedForm<AssignUserDto>` 自動跑 `validator` 的 `min 1` 檢查(空 `userIds` / 空 `roleId` 在此被擋)
- handler 為單一 service call 的薄 wiring、~10 LOC

**Spec impact**: spec FR-001 + FR-002 對齊;data-model E1 列 handler 細目。

**Alternatives considered**:
- 比照 `assign_permission`(帶 `enforcer`)— rejected:`assign_users` service method 不需 `enforcer`、多帶無意義

---

## R-Q2: route mount + `RouteInfo` 註冊 pattern?

**Question**: F8 的 `POST /authorization/assign-users` 怎麼掛進 `init_authorization_router`?

**Evidence**(`server/router/src/admin/sys_authentication_route.rs:63-95`):
- `init_authorization_router` 用 `base_path = "/authorization"`、`service_name = "SysAuthorizationApi"`
- `routes` vec 內每條 `RouteInfo::new(&format!("{}/assign-permission", base_path), Method::POST, service_name, "分配权限")`,迴圈 `add_route(route).await` 註冊進 RouteInfo registry
- `authorization_router` 用 `.route("/assign-permission", post(SysAuthenticationApi::assign_permission))` 掛 axum route
- 註:`RouteInfo` 的 `service_name` 為 `"SysAuthorizationApi"`(字串),但實際 handler 函式為 `SysAuthenticationApi::assign_permission`(struct)— 此為既有 quirk、F8 沿用不改

**Decision**: F8 在 `init_authorization_router` 加兩處:
1. `routes` vec 加 `RouteInfo::new(&format!("{}/assign-users", base_path), Method::POST, service_name, "分配用户")`
2. `authorization_router` 加 `.route("/assign-users", post(SysAuthenticationApi::assign_users))`

**Rationale**: 完全比照既有 `assign-permission` / `assign-routes` 兩條 sibling 的註冊方式;`init_protected_*` 既有的 JWT auth + Casbin enforce layer 自動套用(F8 不改 router 的 layer 設定)。

**Spec impact**: spec FR-003 對齊;data-model E2 列細目。

---

## R-Q3: Casbin policy seed migration 形態與檔名?

**Question**: F8 的 Casbin `p` policy seed migration 怎麼寫?檔名日期?

**Evidence**(2026-05-20 既有 migration):
- 既有 sibling 的 Casbin seed:`m20241024_082926_insert_casbin_rule.rs:57-58` 對 `/authorization/assign-permission` + `/authorization/assign-routes` 各 1 row、**都只 `ROLE_SUPER`**
- 最近的 feature seed migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` — 用 `sea_orm_migration` 的 `Statement::from_string` 跑 raw SQL `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES (...)`;`down` 用 scope-limited `DELETE FROM casbin_rule WHERE ...`
- `casbin_rule` schema:`(ptype, v0=role, v1=domain, v2=path, v3=method, v4, v5)`;F11 R-Q5 確立 `v4=''` baseline(空字串、非 `'allow'`)
- 既有 datas 最新檔 = `m20260521`(F7);migration 註冊兩處:`datas/mod.rs` 加 `pub mod ...`、`lib.rs` Migrator vec 加 `Box::new(datas::...::Migration)`

**Decision**: F8 新建 `migration/src/datas/m20260522_a_f8_assign_users_seed.rs`:
- 檔名日期 `m20260522` — 排在現有最新 `m20260521`(F7)之後,確保 Migrator 執行順序正確
- `up`:`INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES ('p', 'ROLE_SUPER', 'built-in', '/authorization/assign-users', 'POST', '', '')`(1 row、ROLE_SUPER、`v4=''` per F11 R-Q5 baseline)
- `down`:`DELETE FROM casbin_rule WHERE ptype='p' AND v0='ROLE_SUPER' AND v1='built-in' AND v2='/authorization/assign-users' AND v3='POST'`(scope-limited)
- `datas/mod.rs` 加 `pub mod m20260522_a_f8_assign_users_seed;`
- `lib.rs` Migrator vec 末尾加 `Box::new(datas::m20260522_a_f8_assign_users_seed::Migration)`

**Rationale**:
- 完全沿用 F7 `m20260521` 的 `Statement::from_string` raw SQL pattern
- 只 1 row、只 `ROLE_SUPER`(per spec FR-007 + brainstorm Q3)— 對齊既有 sibling `assign-permission`/`assign-routes` 的 Casbin seed
- `v4=''` 對齊 F11 R-Q5 lesson(顯式 `v4='allow'` 與 Casbin model `p = sub,dom,obj,act` 衝突)

**Spec impact**: spec FR-006 + FR-007 + A-005 對齊;data-model E3 列細目。

**Alternatives considered**:
- 把 row 加進既有 `m20241024_082926_insert_casbin_rule.rs` — rejected:改既有 migration 違反 migration 不可變紀律;新建獨立 migration 為既有 feature(F6/F9/F7)一致做法

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 handler 比照 sibling `assign_routes`(無 `enforcer`、`ValidatedForm<AssignUserDto>` → service call)
- ✅ R-Q2 route mount + `RouteInfo` 比照既有 `init_authorization_router` 兩條 sibling
- ✅ R-Q3 Casbin seed migration `m20260522_a_f8_assign_users_seed.rs`(1 row ROLE_SUPER、沿用 F7 raw SQL pattern)
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — F8 brainstorm 已 saturated、Phase 0 純 pattern 確認。
