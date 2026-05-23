# Data Model — W-FW6 role-authorization-completion

3 子項共 ~14 個改動點。Phase 0 research（R-Q1/R-Q2/R-Q3）已 resolved；本檔列具體改動位置 + 細節。

## 既有實體（不改 schema 之外的結構）

- **`sys_role`**：admin 端定義的角色；現有 11 欄不變動。本 feature 加 1 欄 home_route_name（N2-A1）。
- **`casbin_rule`**：權限決策表；現有 schema 不變動。本 feature N4 透過 `UPDATE WHERE ptype='p' AND v0 = old_code` 改既有 row。R-Q3 確認既有資料 0 ptype='g' rule（user-role 關聯透過 sys_user_role 表、不透過 Casbin g rule）。
- **`sys_role_menu` / `sys_user_role`**：role-menu / user-role 關聯表；現有 schema 不變動。本 feature N3 audit 不改其行為、只在 assign_routes / assign_users 對其 INSERT/DELETE 後加 audit row。
- **`sys_operation_log`**：F2.1 既有 audit 表；現有 schema 不變動。本 feature N2/N3/N4 新增 audit row（payload_before/after 含 role snapshot 或 menu_ids/user_ids 集合）。
- **既有能力（沿用、不重做）**：
  - `audit_log::write_in_txn` + `audit_snapshot` (F2.1)
  - `notify_casbin_changed` (W-F11、`server_global::casbin_notify`)
  - sys_role_service `update_role` 既有 audit 路徑（覆蓋 N4 code 變更 audit）
  - sys_menu find_active soft-delete facade（用於 N2 home validation）

## N2 — role home 持久化

### N2-A1 — Schema migration（sys_role 加 home_route_name）

新 schema migration `rust-api/migration/src/schemas/m20260524_a_wfw6_add_home_to_sys_role.rs`（timestamp 晚於現有最大 `m20260523_c_wfw7_add_menu_fields_to_sys_menu`），沿用 W-FW7 體例：

```rust
// up
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_role ADD COLUMN home_route_name VARCHAR NULL"
).await?;

// down
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_role DROP COLUMN IF EXISTS home_route_name"
).await?;
```

Register in `migration/src/lib.rs`（Vec 末端、晚於 W-FW7 `m20260523_c`）。

| 欄位 | PostgreSQL 型別 | NULL | 預設 |
|---|---|---|---|
| `home_route_name` | `VARCHAR` | YES | `NULL` |

既有 role row 升級後 home_route_name 為 `NULL`，向後相容（FR-001、SC-002）。

### N2-A2 — Casbin policy seed migration（2 endpoint × 3 role = 6 row）

新 data migration `rust-api/migration/src/datas/m20260524_b_wfw6_role_home_alias_seed.rs`（timestamp 晚於 N2-A1）：

```rust
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES
  ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getRoleHome/:roleId', 'GET',  '', ''),
  ('p', 'ROLE_SUPER', 'built-in', '/systemManage/updateRoleHome',       'POST', '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getRoleHome/:roleId', 'GET',  '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/updateRoleHome',       'POST', '', '');
-- 對 ROLE_USER (GeneralUser) default deny — 不需 seed
```

ROLE_SUPER + ROLE_ADMIN 各 2 row = 4 row。**等等** —— W-FW3/W-FW4 seed 體例只 seed 這 2 role（GeneralUser default deny）。原 plan 寫 6 row 是「3 role × 2 endpoint」、實際 2 role × 2 endpoint = 4 row（與 W-FW3 alias seed 一致）。

修正：4 row（ROLE_SUPER + ROLE_ADMIN × getRoleHome + updateRoleHome）。

Register in `migration/src/lib.rs`（緊接 N2-A1 之後）。

### N2-A3 — Sea-ORM entity（sys_role 加 home_route_name）

改 `rust-api/server/model/src/admin/entities/sys_role.rs`：

在 `pub status: Status,` 之後、`pub created_at: DateTime,` 之前**插入**：

```rust
#[sea_orm(column_type = "Text", nullable)]
pub home_route_name: Option<String>,
```

（用 `Text` 與既有 `description` / `code` 等 String 欄一致。）

### N2-B1 — Input DTO `UpdateRoleHomeInput`

`rust-api/server/model/src/admin/input/sys_role.rs` 加：

```rust
#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRoleHomeInput {
    #[validate(length(min = 1, message = "Role ID must not be empty"))]
    pub role_id: String,
    /// None / Some("") 皆視為「明示清除 home」, 持久化為 NULL
    pub home: Option<String>,
}
```

`#[serde(rename_all = "camelCase")]` 自動收 `{roleId, home}`。Validate 對 role_id 確保非空；home 為 Option<String>、無 validate（業務 validation 在 service 層）。

`server/service/src/admin/mod.rs` 加 `pub use sys_role::UpdateRoleHomeInput;`（與既有 DTO re-export 同體例）。

### N2-B2 — Service methods（get_role_home / update_role_home）

改 `rust-api/server/service/src/admin/sys_role_service.rs`：

#### `get_role_home`

```rust
async fn get_role_home(&self, role_id: String) -> Result<Option<String>, AppError> {
    let db = db_helper::get_db_connection().await?;
    let role = sys_role::find_active()
        .filter(SysRoleColumn::Id.eq(role_id))
        .one(db.as_ref())
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| RoleError::RoleNotFound.into())?;
    Ok(role.home_route_name)
}
```

trait 同步加：
```rust
async fn get_role_home(&self, role_id: String) -> Result<Option<String>, AppError>;
async fn update_role_home(&self, input: UpdateRoleHomeInput, actor: &Actor) -> Result<(), AppError>;
```

#### `update_role_home`

```rust
async fn update_role_home(&self, input: UpdateRoleHomeInput, actor: &Actor) -> Result<(), AppError> {
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await.map_err(AppError::from)?;

    // 1. fetch before (full role)
    let before = sys_role::find_active()
        .filter(SysRoleColumn::Id.eq(&input.role_id))
        .one(&txn)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::from(RoleError::RoleNotFound))?;

    // 2. validation: home 非空時 reject 不存在 / soft-deleted / constant / disabled menu
    let home_normalized: Option<String> = input.home
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());  // Some("") → None (明示清除等同省略)

    if let Some(ref route_name) = home_normalized {
        let menu = sys_menu::find_active()
            .filter(SysMenuColumn::RouteName.eq(route_name))
            .filter(SysMenuColumn::Status.eq(Status::Enabled))
            .filter(SysMenuColumn::Constant.eq(false))
            .one(&txn)
            .await
            .map_err(AppError::from)?;
        if menu.is_none() {
            return Err(RoleError::HomeRouteNotFound.into());
        }
    }

    // 3. ActiveModel update
    let mut active: SysRoleActiveModel = before.clone().into();
    active.home_route_name = Set(home_normalized);
    active.updated_at = Set(Some(Local::now().naive_local()));
    active.updated_by = Set(Some(actor.id.clone()));
    let updated = active.update(&txn).await.map_err(AppError::from)?;

    // 4. audit
    audit_log::write_in_txn(&txn, AuditEvent {
        actor,
        operation: AuditOperation::Update,
        entity_type: "sys_role",
        entity_id: updated.id.clone(),
        payload_before: Some(audit_snapshot(&before)),
        payload_after: Some(audit_snapshot(&updated)),
        description: None,
        source: AuditSource::Internal,
        request_id: None,
    }).await?;

    txn.commit().await.map_err(AppError::from)?;
    Ok(())
}
```

**Error type 新增**：`server/service/src/admin/sys_role_error.rs` 加 `HomeRouteNotFound` variant + `RoleError::HomeRouteNotFound => ... CODE_..._INVALID ...`（沿用既有 RoleError pattern）。

### N2-B3 — update_role detect code 變動 + Casbin sync（屬 N4 範疇，B3 命名沿用本檔順序）

見 N4-B3 段。

### N2-C1 — API handlers（get_role_home_for_systemmanage / update_role_home_for_systemmanage）

改 `rust-api/server/api/src/admin/sys_system_manage_api.rs`：

```rust
/// W-FW6 transform: GET /systemManage/getRoleHome/:roleId
pub async fn get_role_home_for_systemmanage(
    Path(role_id): Path<String>,
    Extension(service): Extension<Arc<SysRoleService>>,
) -> Result<Res<Option<String>>, AppError> {
    service.get_role_home(role_id).await.map(Res::new_data)
}

/// W-FW6 transform: POST /systemManage/updateRoleHome
pub async fn update_role_home_for_systemmanage(
    Extension(service): Extension<Arc<SysRoleService>>,
    Extension(user): Extension<User>,
    Json(input): Json<UpdateRoleHomeInput>,
) -> Result<Res<bool>, AppError> {
    let actor = Actor::from(&user);
    service.update_role_home(input, &actor).await.map(|_| Res::new_data(true))
}
```

Import `UpdateRoleHomeInput` 從 `server_service::admin`。

### N2-D1 — Router 註冊

`rust-api/server/api/src/admin/sys_system_manage_api.rs`（或對等 router 註冊處）加 2 條 route：

```rust
.route("/getRoleHome/:roleId", get(SysSystemManageApi::get_role_home_for_systemmanage))
.route("/updateRoleHome", post(SysSystemManageApi::update_role_home_for_systemmanage))
```

實際註冊位置需查 `rust-api/server/api/src/admin/mod.rs` 或 `router.rs` 看既有 systemManage route 註冊體例（比照 W-FW3/W-FW4 alias 註冊）。

### N2-E1 — base-web service function（system-manage.ts）

改 `base-web/src/service/api/system-manage.ts`：在合適位置（如「assign role menus」附近）加：

```ts
/** W-FW6 N2: get role's home route_name */
export function fetchGetRoleHome(roleId: string) {
  return request<string | null>({
    url: `/systemManage/getRoleHome/${roleId}`,
    method: 'get'
  });
}

/** W-FW6 N2: update role's home route_name */
export function fetchUpdateRoleHome(data: { roleId: string; home: string | null }) {
  return request<boolean>({
    url: '/systemManage/updateRoleHome',
    method: 'post',
    data
  });
}
```

R-Q1 確認用 primitive generic、不動 `src/typings`。

### N2-E2 — base-web menu-auth-modal getHome / updateHome 接真 API

改 `base-web/src/views/manage/role/modules/menu-auth-modal.vue`：

```ts
import { fetchAssignRoleMenus, fetchGetAllPages, fetchGetMenuTree, fetchGetRoleHome, fetchGetRoleMenuIds, fetchUpdateRoleHome } from '@/service/api';

// ...

async function getHome() {
  const { error, data } = await fetchGetRoleHome(String(props.roleId));
  if (!error) {
    home.value = data ?? 'home';  // null fallback 預設值 'home'
  }
}

async function updateHome(val: string) {
  const { error } = await fetchUpdateRoleHome({ 
    roleId: String(props.roleId), 
    home: val === 'home' ? null : val,  // 預設值 'home' 對應 null（清除設定）
  });
  if (!error) {
    home.value = val;
  }
}
```

**注意**：home 'home' = 系統預設（無 menu 對應或對應的 menu 可能是 `constant=true`、被 validation 拒絕）—— 設計上 'home' 表示「未設定」、UI 用此值 fallback、後端寫入時轉 null（避免 validation reject 'home' 字串本身）。

實作細節留 implementation 階段確認 'home' 是否為合法 active route_name；若是則直接寫入 'home'、不轉 null。

## N3 — assign_routes/users audit gap

### N3-B4 — assign_routes 補 audit

改 `rust-api/server/service/src/admin/sys_authorization_service.rs`：

trait signature 改為（append `actor: &Actor`）：
```rust
async fn assign_routes(
    &self,
    domain: String,
    role_id: String,
    route_ids: Vec<i32>,
    actor: &Actor,
) -> Result<(), AppError>;
```

impl body 在 txn `commit()` 前加：
```rust
audit_log::write_in_txn(&txn, AuditEvent {
    actor,
    operation: AuditOperation::Update,
    entity_type: "sys_role",
    entity_id: role_id.clone(),
    payload_before: Some(serde_json::json!({
        "role_id": &role_id,
        "domain": &domain_code,
        "menu_ids": &existing_route_ids
    })),
    payload_after: Some(serde_json::json!({
        "role_id": &role_id,
        "domain": &domain_code,
        "menu_ids": &route_ids
    })),
    description: None,
    source: AuditSource::Internal,
    request_id: None,
}).await?;
```

### N3-B5 — assign_users 補 audit

同 N3-B4 模式：trait signature 加 `actor: &Actor`；impl body 在 txn commit 前加 audit_log::write_in_txn（payload_before/after `user_ids` 集合）。

需先讀既有 `assign_users` body 取得 `existing_user_ids` 變數命名與 fetch path（plan 階段先寫骨架）。

### N3-C3 — sys_authorization_api.rs assign_routes handler 傳 actor（cascade）

`rust-api/server/api/src/admin/sys_authorization_api.rs` 的 assign-routes handler：

```rust
pub async fn assign_routes(
    Extension(service): Extension<Arc<SysAuthorizationService>>,
    Extension(user): Extension<User>,  // ← 加（若還沒有）
    Json(input): Json<AssignRoutesInput>,
) -> Result<Res<bool>, AppError> {
    let actor = Actor::from(&user);  // ← 加
    service.assign_routes(input.domain, input.role_id, input.menu_ids, &actor).await
        .map(|_| Res::new_data(true))
}
```

### N3-C4 — sys_system_manage_api.rs assign_role_menus_for_systemmanage 傳 actor（cascade）

`assign_role_menus_for_systemmanage` 既有已 `Extension(user)`、加 `actor: Actor::from(&user)` + 末尾參數傳遞。

### N3-C5 — sys_authorization_api.rs assign_users handler 傳 actor（cascade）

同 N3-C3 模式。

### N3 audit payload 形狀

| 欄位 | assign_routes | assign_users |
|---|---|---|
| entity_type | `"sys_role"` | `"sys_role"` |
| entity_id | role_id | role_id |
| operation | `UPDATE` | `UPDATE` |
| payload_before | `{role_id, domain, menu_ids: [...]}` | `{role_id, user_ids: [...]}` |
| payload_after | `{role_id, domain, menu_ids: [...]}` | `{role_id, user_ids: [...]}` |

注意 assign_routes payload 含 `domain` 欄（與既存 sys_role_menu 過濾邏輯一致）；assign_users 不含 domain（既存 sys_user_role schema 無 domain 欄、F8 既有 service 不過濾 domain）。

## N4 — role code 安全改名

### N4-B3 — update_role detect code 變動 + Casbin sync + notify

改 `rust-api/server/service/src/admin/sys_role_service.rs` 的 `update_role`：

在 ActiveModel update 之後、audit 之前、txn commit 之前加：

```rust
// N4: detect code 變動 + 同步 Casbin policy
if before.code != input.role.code {
    use sea_orm::{Statement, DbBackend};
    txn.execute(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "UPDATE casbin_rule SET v0 = $1 WHERE ptype = 'p' AND v0 = $2",
        [
            sea_orm::Value::String(Some(Box::new(input.role.code.clone()))),
            sea_orm::Value::String(Some(Box::new(before.code.clone()))),
        ],
    )).await.map_err(AppError::from)?;
}
```

**Audit**：既有 update_role 已 `audit_log::write_in_txn` + `audit_snapshot(&before)` / `audit_snapshot(&updated_role)` —— code 變動自動進 audit payload（before.code = 'R_TEST', updated.code = 'R_TEST_RENAMED'）。Casbin policy UPDATE 為 side effect、屬 Principle II「跨資源 side effect」範疇、無需單獨 audit（同 sys_user assign_roles_to_user path 不對 Casbin g rule 單獨 audit）。

txn commit 之後加：
```rust
// N4: publish Casbin invalidate 訊號 (R-Q2、commit 後 publish 避免訊號早於 commit)
if before.code != updated_role.code {
    server_global::notify_casbin_changed().await;
}
```

### N4-C2 — sys_system_manage_api.rs 拿掉 W-FW3 transform-layer code-lock

改 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 的 `update_role_for_systemmanage`：

W-FW3 過渡實作（line 271-289 約略）：
```rust
let existing = service.get_role(&input.id).await?;
let update_input = UpdateRoleInput {
    id: input.id,
    role: RoleInput {
        pid: existing.pid,
        code: existing.code,    // ← W-FW3 code-lock, 本 feature 拿掉
        name: input.role_name,
        status: map_status(&input.status)?,
        description: input.role_desc,
    },
};
```

改為：
```rust
let existing = service.get_role(&input.id).await?;  // 保留 fetch existing 用於 pid 沿用
let update_input = UpdateRoleInput {
    id: input.id,
    role: RoleInput {
        pid: existing.pid,
        code: input.role_code,  // ← W-FW6 N4: 直送, 不再 lock
        name: input.role_name,
        status: map_status(&input.status)?,
        description: input.role_desc,
    },
};
```

**註解更新**：line 269-270 既有「W-FW3 code-lock：code / pid 沿用既有值（避免 Casbin policy 失聯、避免擾動角色樹）」改為「W-FW6 N4：pid 沿用既有值（避免擾動角色樹）；code 直送 input（rust update_role 同步 Casbin policy）」。

## 命名與型別摘要

| 層 | home_route_name | actor 參數 | Casbin sync |
|---|---|---|---|
| PostgreSQL | `VARCHAR NULL` | — | `UPDATE casbin_rule SET v0 = $new WHERE ptype = 'p' AND v0 = $old` |
| Sea-ORM entity | `Option<String>` + `Text` nullable | — | — |
| Native Input DTO | `UpdateRoleHomeInput { role_id, home: Option<String> }` | append 末尾 | — |
| Service trait | get_role_home / update_role_home | `assign_routes/users` 末尾 `&Actor` | `txn.execute(Statement)` |
| API handler | get_role_home_for_systemmanage / update_role_home_for_systemmanage | `Actor::from(&user)` | — |
| Route | GET /systemManage/getRoleHome/:roleId + POST /systemManage/updateRoleHome | — | — |
| Casbin seed | 4 row（ROLE_SUPER + ROLE_ADMIN × 2 endpoint） | — | — |
| base-web service | fetchGetRoleHome / fetchUpdateRoleHome（primitive generic） | — | — |
| base-web modal | menu-auth-modal getHome / updateHome | — | — |
| Reload trigger | — | — | txn commit 後 `notify_casbin_changed().await` |
