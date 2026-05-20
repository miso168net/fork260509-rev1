# Data Model: F8 — assign-users

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F8 **不動 DB schema、不增表、不改 entity model、不改 `AssignUserDto`、不改 `assign_users` service method / trait**。code 改動主體:**HTTP wiring** — 加 `assign_users` API handler + route mount + 1 個 Casbin policy seed migration。`AssignUserDto` + `assign_users` trait + service impl 三層為既有、F8 只重用。

---

## E1: `assign_users` API handler(US1 P1、新增)

**File**: `rust-api/server/api/src/admin/sys_authentication_api.rs`(既有檔、F8 加 1 個 handler method + 1 個 import)

**新增 handler**(置於 `impl SysAuthenticationApi` 內、緊接既有 `assign_routes` 之後):
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

**import 改動**:既有 `use server_service::{ admin::{ ... AssignPermissionDto, AssignRouteDto, ... }, Audience };` 的清單加入 `AssignUserDto`(置於 `AssignRouteDto` 旁)。

**設計要點**:
| 項目 | 決策 |
|---|---|
| 形態 | 比照既有 sibling `assign_routes`(per research R-Q1)— 不需 `enforcer` |
| extractor | `Extension<Arc<SysAuthorizationService>>` + `ValidatedForm<AssignUserDto>` |
| service call | `service.assign_users(input.role_id, input.user_ids)`(無 `domain` 參數) |
| 回應 | `Res::new_data(())`(F4 envelope `{code:0, data:null, msg:"success", success:true}`) |
| 既有 handler | `login_handler` / `get_user_info` / `get_user_routes` / `assign_permission` / `assign_routes` / 3 stub 全不動 |

**LOC delta**:~12 LOC(3 行 doc comment + 8 行 fn + import 1 詞)

---

## E2: route mount + `RouteInfo`(US1 P1、新增)

**File**: `rust-api/server/router/src/admin/sys_authentication_route.rs`(既有檔、F8 改 `init_authorization_router`)

**新增兩處**(per research R-Q2):

1. `routes` vec 加 1 條 `RouteInfo`(緊接既有 `assign-routes` 那筆之後):
```rust
RouteInfo::new(
    &format!("{}/assign-users", base_path),
    Method::POST,
    service_name,
    "分配用户",
),
```

2. `authorization_router` 加 1 條 axum route(緊接既有 `.route("/assign-routes", ...)` 之後):
```rust
.route("/assign-users", post(SysAuthenticationApi::assign_users))
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| `base_path` | `/authorization`(既有、不改) |
| `service_name` | `"SysAuthorizationApi"`(既有字串、不改;handler 實際為 `SysAuthenticationApi::assign_users` — 既有 quirk 沿用) |
| HTTP method | `Method::POST` / `post(...)` |
| route description | `"分配用户"` |
| JWT auth + Casbin enforce | 由 `init_authorization_router` 既有 layer 設定自動套用、F8 不改 |

**LOC delta**:~7 LOC

---

## E3: F8 Casbin policy seed migration(US1 P1、新建)

**File**: `rust-api/migration/src/datas/m20260522_a_f8_assign_users_seed.rs`(新建、per research R-Q3)

**結構**(沿用 F7 `m20260521` 的 `Statement::from_string` raw SQL pattern):
```rust
//! F8 assign-users Casbin policy seed — 補 ROLE_SUPER 對 /authorization/assign-users
//! POST 的 allow rule(1 row)。per F8 spec FR-006 + FR-007 + brainstorm Q3。
//! 對齊既有 sibling /authorization/assign-permission + assign-routes(都只 ROLE_SUPER)。
//! 沿用 F7 m20260521 既有 raw SQL pattern;v4='' per F11 R-Q5 baseline。

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
            ('p', 'ROLE_SUPER', 'built-in', '/authorization/assign-users', 'POST', '', '')
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
            WHERE ptype = 'p'
              AND v0 = 'ROLE_SUPER'
              AND v1 = 'built-in'
              AND v2 = '/authorization/assign-users'
              AND v3 = 'POST'
            "#
            .to_string(),
        );
        db.execute(delete_stmt).await?;
        Ok(())
    }
}
```

**register 改動**:
- `migration/src/datas/mod.rs` 末尾加:`pub mod m20260522_a_f8_assign_users_seed;`
- `migration/src/lib.rs` Migrator vec 末尾加:`Box::new(datas::m20260522_a_f8_assign_users_seed::Migration),`

**設計要點**:
| 項目 | 決策 |
|---|---|
| row 數 | 1(`ROLE_SUPER` × `/authorization/assign-users` × `POST` × allow) |
| `v4` | `''` 空字串(per F11 R-Q5 baseline、非 `'allow'`) |
| ROLE_ADMIN | **不加**(per spec FR-007 + brainstorm Q3、對齊 sibling ROLE_SUPER-only) |
| 檔名日期 | `m20260522` — 排在最新 `m20260521`(F7)之後 |
| schema | **無變更**(只 INSERT data row、`casbin_rule` 表既有) |

**LOC delta**:新建 ~40 LOC + `mod.rs` 1 LOC + `lib.rs` 1 LOC

---

## E4: 既有 `AssignUserDto` / `assign_users` service method(F8 不改、只重用)

**`AssignUserDto`**(`server/model/src/admin/input/sys_authorization.rs:30-38`、既有、F8 不改):
```rust
#[derive(Debug, Deserialize, Serialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct AssignUserDto {
    #[validate(length(min = 1, message = "Role ID cannot be empty"))]
    pub role_id: String,

    #[validate(length(min = 1, message = "Users array cannot be empty"))]
    pub user_ids: Vec<String>,
}
```
- JSON 形狀(camelCase):`{ "roleId": "<role>", "userIds": ["<u1>", ...] }`
- 已 re-export 於 `input/mod.rs:3`

**`SysAuthorizationService::assign_users`**(`server/service/src/admin/sys_authorization_service.rs:302-372`、既有、F8 不改):
- 簽章:`assign_users(&self, role_id: String, user_ids: Vec<String>) -> Result<(), AppError>`
- 流程:`check_role(role_id)` 查 role 存在 → `sys_user::find_active().filter(Id.is_in(user_ids))` 查 active user → 若 user 全不存在 → `AuthorizationError::UsersNotFound` → 查既有 `sys_user_role`(該 role)→ diff 出 `new_user_ids`(INSERT)與 `user_ids_to_delete`(DELETE)→ transaction `insert_many` + `delete_many` → commit

---

## E5: `sys_user_role` 整組覆蓋語意(set-semantics)

**`sys_user_role`** 為純 association/join table(複合主鍵 `(user_id, role_id)`、無 `deleted_at`)。

`assign_users(role_id, user_ids)` 語意 = **「設定 role_id 的完整 user 集合為 user_ids」**:

| 傳入 `user_ids` | 既有 `sys_user_role`(role R) | 結果 |
|---|---|---|
| `[u1, u2, u3]` | `{u1, u2}` | INSERT `(u3,R)`;`{u1,u2,u3}` |
| `[u1]` | `{u1, u2}` | DELETE `(u2,R)`;`{u1}` |
| `[u1, u2]` | `{u1, u2}` | diff 空 → no-op;`{u1,u2}` |

→ 未列入 `user_ids` 的既有 user 其 `(user_id, role_id)` row 被 physical DELETE(join table、無 soft delete)。**acceptance 須採 capture→assign→verify→restore**(per spec FR-018)避免污染 seed。

**Constitution II 註**:此 INSERT/DELETE 為既有 service method 行為;`sys_user_role` 為 association 表、非 entity 表;既有 `assign_*` 家族皆不 soft-delete/audit 此類 row。F8 不改 service method、沿用既有 pattern(詳見 plan.md Constitution Check II)。

---

## Data Model 完成標誌

- ✅ E1 `assign_users` handler — 比照 sibling `assign_routes`(per FR-001 + FR-002)
- ✅ E2 route mount + `RouteInfo` — `init_authorization_router` 加兩處(per FR-003)
- ✅ E3 Casbin policy seed migration — 1 row ROLE_SUPER、新建 `m20260522`(per FR-006 + FR-007)
- ✅ E4 既有 `AssignUserDto` / `assign_users` service method — F8 不改、只重用(per FR-004 + FR-005)
- ✅ E5 `sys_user_role` 整組覆蓋語意 — acceptance capture→assign→verify→restore(per FR-018)
- ✅ 無 DB schema 改、無 base-web 改、無服務間 forward、無 Casbin `g` rule
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E5 確認 — Casbin seed 1 row ROLE_SUPER-only(Principle I PASS)、無新 DB write code(Principle II PASS、附 rationale)、無服務間 forward(Principle III PASS)、base-web 0 diff(Principle IV PASS)、DESIGN-B 繼承 identical(Principle V PASS)。**5 PASS / 0 N/A / 0 violation 維持**。
