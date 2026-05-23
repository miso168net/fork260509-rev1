# Data Model — W-FW8 button-auth-completion

2 子項（A button-auth modal 接通 + B assign_permission audit）共 ~12 個改動點。Phase 0 research（R-Q1/R-Q2/R-Q3）已 resolved；本檔列具體改動位置 + 細節。

## 既有實體（0 結構改動）

- **`sys_endpoint`**：API endpoint 定義表；現有 7 欄 + deleted_at = 8 欄；資料 67 row（12 controller、13 resource）。本 feature **0 schema 改動、僅讀**。
- **`casbin_rule`**：權限決策表；現有 schema 不變動。本 feature 透過既有 `sync_role_permissions` helper add/remove policy row（ptype='p', v0=role_code, v1=domain, v2=path, v3=method）。
- **`sys_role`**：admin 端角色；現有 12 欄不動（W-FW6 已加 home_route_name）。本 feature audit entity_type 用 'sys_role' 為中心追蹤。
- **`sys_operation_log`**：F2.1 既有 audit 表；現有 schema 不變動。本 feature B 新增 audit row 對應 `assign_permission` 操作。
- **既有能力（沿用、不重做）**：
  - `audit_log::write_in_txn` + `audit_snapshot` (F2.1)
  - `notify_casbin_changed()` (W-F11、`server_global::casbin_notify`，既有 assign_permission 末段已呼叫)
  - `sys_authorization_service.sync_role_permissions` (內 txn diff/add/remove Casbin policy)
  - `sys_authorization_service.check_domain_and_role` (validate domain + role)
  - `sys_endpoint::find_active()` soft-delete facade

## A — button-auth modal 接通

### A1 — Casbin policy seed migration（6 row）

新 data migration `rust-api/migration/src/datas/m20260524_c_wfw8_endpoint_alias_seed.rs`（timestamp 晚於 W-FW6 `m20260524_b`）：

```rust
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES
  ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getAllEndpoints',          'GET',  '', ''),
  ('p', 'ROLE_SUPER', 'built-in', '/systemManage/getRoleEndpointIds/:roleId', 'GET',  '', ''),
  ('p', 'ROLE_SUPER', 'built-in', '/systemManage/assignRoleEndpoints',      'POST', '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getAllEndpoints',          'GET',  '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/getRoleEndpointIds/:roleId', 'GET',  '', ''),
  ('p', 'ROLE_ADMIN', 'built-in', '/systemManage/assignRoleEndpoints',      'POST', '', '');
```

ROLE_SUPER + ROLE_ADMIN 各 3 row = 6 row。ROLE_USER 不 seed（default deny、E-7 涵蓋）。

對稱 down：`DELETE WHERE v2 IN ('/systemManage/getAllEndpoints', '/systemManage/getRoleEndpointIds/:roleId', '/systemManage/assignRoleEndpoints') AND v0 IN ('ROLE_SUPER', 'ROLE_ADMIN')`。

沿用 W-FW3 `m20260522_d_wfw3_role_alias_seed.rs` 與 W-FW6 `m20260524_b_wfw6_role_home_alias_seed.rs` 體例（`Statement::from_string` + raw SQL INSERT）。

Register in `migration/src/lib.rs` 末端、晚於 W-FW6 `m20260524_b`。

### A2 — Input DTO `SystemManageAssignRoleEndpointsInput`

新 DTO（in `server/model/src/admin/input/sys_authorization.rs` 或 `input/sys_role.rs`，視既有放置）：

```rust
#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageAssignRoleEndpointsInput {
    #[validate(length(min = 1, message = "Role ID must not be empty"))]
    pub role_id: String,
    /// 可空陣列 → 清空 role 全部 endpoint 授權
    pub endpoint_ids: Vec<String>,
}
```

`#[serde(rename_all = "camelCase")]` 收 `{roleId, endpointIds}`。

`server/model/src/admin/input/mod.rs` 加 `pub use sys_authorization::SystemManageAssignRoleEndpointsInput;`（或對等 re-export）。

### A3 — Output DTO `EndpointTreeNode`（for getAllEndpoints）

新 output struct（in `server/model/src/admin/output/sys_endpoint.rs` 或 sys_authorization.rs）：

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointTreeNode {
    pub key: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<EndpointTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub is_leaf: bool,
}
```

skip_serializing 用於空欄省略傳輸（leaf node 無 children、group node 無 method/path）。serde camelCase → `isLeaf` on wire。

### A4 — Transform handler `get_all_endpoints_for_systemmanage`

改 `rust-api/server/api/src/admin/sys_system_manage_api.rs`：

```rust
/// W-FW8 transform: GET /systemManage/getAllEndpoints
pub async fn get_all_endpoints_for_systemmanage(
    Extension(_user): Extension<User>,
) -> Result<Res<Vec<EndpointTreeNode>>, AppError> {
    let db = db_helper::get_db_connection().await?;
    let endpoints = sys_endpoint::find_active().all(db.as_ref()).await.map_err(AppError::from)?;

    let mut by_resource: BTreeMap<String, Vec<&SysEndpointModel>> = BTreeMap::new();
    for ep in &endpoints {
        by_resource.entry(ep.resource.clone()).or_default().push(ep);
    }
    // sort children by path within each resource group
    let tree: Vec<EndpointTreeNode> = by_resource.into_iter().map(|(resource, mut eps)| {
        eps.sort_by(|a, b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));
        EndpointTreeNode {
            key: format!("resource:{}", resource),
            label: resource.clone(),
            children: Some(eps.into_iter().map(|ep| EndpointTreeNode {
                key: ep.id.clone(),
                label: format!("{}（{}）",
                    ep.summary.as_deref().unwrap_or(&format!("{} {}", ep.method, ep.path)),
                    ep.method),
                method: Some(ep.method.clone()),
                path: Some(ep.path.clone()),
                is_leaf: true,
                children: None,
            }).collect()),
            method: None, path: None, is_leaf: false,
        }
    }).collect();
    Ok(Res::new_data(tree))
}
```

Imports needed: `sys_endpoint` facade、`SysEndpointModel`、`EndpointTreeNode`、`BTreeMap`。

### A5 — Transform handler `get_role_endpoint_ids_for_systemmanage`

改同檔：

```rust
/// W-FW8 transform: GET /systemManage/getRoleEndpointIds/:roleId
pub async fn get_role_endpoint_ids_for_systemmanage(
    Path(role_id): Path<String>,
    Extension(user): Extension<User>,
    Extension(service): Extension<Arc<SysRoleService>>,
    Extension(mut cache_enforcer): Extension<CasbinAxumLayer>,
) -> Result<Res<Vec<String>>, AppError> {
    // 1. fetch role.code
    let role = service.get_role(&role_id).await?;
    let role_code = role.code;
    let domain = user.domain();

    // 2. get Casbin policy rows for this role
    let enforcer = cache_enforcer.get_enforcer();
    let enforcer_read = enforcer.read().await;
    let policies = enforcer_read.get_filtered_policy(0, vec![role_code, domain.to_string()]);
    drop(enforcer_read);

    // 3. fetch all active endpoints for in-memory reverse-map (R-Q3 optimization)
    let db = db_helper::get_db_connection().await?;
    let endpoints = sys_endpoint::find_active().all(db.as_ref()).await.map_err(AppError::from)?;

    // build (path, method) -> id map
    let mut path_method_to_id: HashMap<(String, String), String> = HashMap::new();
    for ep in &endpoints {
        path_method_to_id.insert((ep.path.clone(), ep.method.clone()), ep.id.clone());
    }

    // 4. reverse-map policy rows -> endpoint ids
    let mut ids: Vec<String> = policies.into_iter()
        .filter_map(|p| {
            let v2 = p.get(2)?.clone();
            let v3 = p.get(3)?.clone();
            path_method_to_id.get(&(v2, v3)).cloned()
        })
        .collect();
    ids.sort();
    ids.dedup();
    Ok(Res::new_data(ids))
}
```

依賴：`SysRoleService.get_role`（既有）、`CasbinAxumLayer`（既有 axum extension）、既有 `sys_endpoint::find_active`。imports: `HashMap`、`User`。

### A6 — Transform handler `assign_role_endpoints_for_systemmanage`

改同檔：

```rust
/// W-FW8 transform: POST /systemManage/assignRoleEndpoints
pub async fn assign_role_endpoints_for_systemmanage(
    Extension(user): Extension<User>,
    Extension(service): Extension<Arc<SysAuthorizationService>>,
    Json(input): Json<SystemManageAssignRoleEndpointsInput>,
) -> Result<Res<bool>, AppError> {
    let actor = Actor::from(&user);
    let domain = user.domain().to_string();
    service.assign_permission(domain, input.role_id, input.endpoint_ids, &actor).await
        .map(|_| Res::new_data(true))
}
```

依賴：B1 的新 trait signature（assign_permission 末尾 `actor: &Actor`）。Imports: `SystemManageAssignRoleEndpointsInput`。

### A7 — Router 註冊（3 條新 alias）

改 `rust-api/server/router/src/admin/sys_system_manage_route.rs`：

```rust
// RouteInfo（for Casbin policy 自動發現）
RouteInfo::new(&format!("{}/getAllEndpoints", base_path), Method::GET, service_name, "获取所有端点（按业务领域分组）"),
RouteInfo::new(&format!("{}/getRoleEndpointIds/:roleId", base_path), Method::GET, service_name, "获取角色已分配端点ID集合"),
RouteInfo::new(&format!("{}/assignRoleEndpoints", base_path), Method::POST, service_name, "分配端点权限给角色"),

// Router::route 註冊
.route("/getAllEndpoints", get(SysSystemManageApi::get_all_endpoints_for_systemmanage))
.route("/getRoleEndpointIds/{roleId}", get(SysSystemManageApi::get_role_endpoint_ids_for_systemmanage))
.route("/assignRoleEndpoints", post(SysSystemManageApi::assign_role_endpoints_for_systemmanage))
```

註冊位置：與既有 W-FW3 `updateRole` / W-FW4 `assignRoleMenus` / W-FW6 `updateRoleHome` 等 alias route 群聚。axum v0.7 path syntax 用 `{roleId}` （與既有 W-FW6 `/getRoleHome/{roleId}` 一致）。

## B — assign_permission audit 補寫

### B1 — `assign_permission` trait + impl 改造

改 `rust-api/server/service/src/admin/sys_authorization_service.rs`：

trait signature 末尾 append `actor: &Actor`（同 W-FW6 N3 體例）：

```rust
async fn assign_permission(
    &self,
    domain: String,
    role_id: String,
    permissions: Vec<String>,
    actor: &Actor,
) -> Result<(), AppError>;
```

impl 改：

1. 在 method 簽名加 `actor: &Actor`
2. 在既有 `sync_role_permissions` 內（or 拆出 audit 段、依現有 impl 結構決定），在 `txn.commit()` **前**加 audit_log::write_in_txn（payload before/after = endpoint_ids 集合）

實作骨架（依現有 impl 邏輯適配）：

```rust
async fn assign_permission(
    &self,
    domain: String,
    role_id: String,
    permissions: Vec<String>,
    actor: &Actor,
) -> Result<(), AppError> {
    // ... 既有 check_domain_and_role + 取 role_code + domain_code ...
    // ... 既有 fetch existing permissions (for diff) ...
    // ... 既有 txn.begin + sync diff (add/remove Casbin policies via enforcer API) ...

    // W-FW8 N1: audit log（txn 內、commit 前）
    audit_log::write_in_txn(&txn, AuditEvent {
        actor,
        operation: AuditOperation::Update,
        entity_type: "sys_role",
        entity_id: role_id.clone(),
        payload_before: Some(serde_json::json!({
            "roleId": &role_id,
            "domain": &domain_code,
            "endpointIds": &existing_endpoint_ids   // 既有計算出來的 id 集合
        })),
        payload_after: Some(serde_json::json!({
            "roleId": &role_id,
            "domain": &domain_code,
            "endpointIds": &permissions    // input endpoint_ids（已過濾無效後）
        })),
        description: None,
        source: AuditSource::Internal,
        request_id: None,
    }).await?;

    // ... 既有 txn.commit ...
    // ... 既有 notify_casbin_changed (commit 後) ...
}
```

**注意**：
- `existing_endpoint_ids` 是 service 在 sync 流程開頭 fetch 的 row、應在 audit 寫入時仍 in scope；若沒有則需要先 query（同 W-FW6 N3 assign_routes 體例：assign_routes impl 在 fetch existing_route_ids 後即 collect）。
- `permissions` （input endpoint_ids）若包含 bogus id、實際寫入 Casbin 的是過濾後的有效集合；audit `payload_after.endpointIds` 應為**實際寫入的**有效 endpoint_ids、非原始 input。具體實作時若 sync 內部過濾、要把過濾後的集合也 collect 起來給 audit 用。

Imports needed (若尚未): `audit_log` + `AuditEvent` + `AuditOperation` + `AuditSource`（既有 W-FW6 N3 落地時已 import 到 sys_authorization_service.rs、本 feature 0 額外 import）。

### B2 — `assign_permission` handler cascade

改 `rust-api/server/api/src/admin/sys_authentication_api.rs`：

既有 `assign_permission` handler（line ~33+）改：

```rust
pub async fn assign_permission(
    Extension(user): Extension<User>,
    Extension(service): Extension<Arc<SysAuthorizationService>>,
    ValidatedForm(input): ValidatedForm<AssignPermissionDto>,
) -> Result<Res<()>, AppError> {
    let actor = Actor::from(&user);
    service.assign_permission(input.domain, input.role_id, input.permissions, &actor).await?;
    Ok(Res::new_data(()))
}
```

新增：`let actor = Actor::from(&user);` + 末尾傳 `&actor`。`User` 與 `Actor` import 既有（W-FW6 N3 落地時加過）。

### B3 — A6 transform handler 也 cascade（已含於 A6）

A6 的 `assign_role_endpoints_for_systemmanage` handler 已涵蓋 cascade（呼叫時末尾傳 `&actor`），無需額外 patch。

## 命名與型別摘要

| 層 | endpoint tree | actor 參數 | audit payload keys |
|---|---|---|---|
| PostgreSQL | sys_endpoint 既有 8 欄 | — | sys_operation_log 既有 schema |
| Sea-ORM entity | `SysEndpointModel` 既有 | — | — |
| Native Input DTO | `SystemManageAssignRoleEndpointsInput { role_id, endpoint_ids }` | trait `assign_permission` 末尾 `&Actor` | — |
| Native Output DTO | `EndpointTreeNode { key, label, children, method, path, is_leaf }` | — | — |
| Service trait | (沒新 method、改 assign_permission signature) | append `actor: &Actor` | `{roleId, domain, endpointIds:[...]}` camelCase |
| API handler | 3 systemManage transform + 1 cascade in authentication_api | `Actor::from(&user)` | — |
| Route | GET /systemManage/getAllEndpoints + GET /systemManage/getRoleEndpointIds/{roleId} + POST /systemManage/assignRoleEndpoints | — | — |
| Casbin seed | 6 row（ROLE_SUPER + ROLE_ADMIN × 3 alias） | — | — |
| base-web service | 3 fn（fetchGetAllEndpoints / fetchGetRoleEndpointIds / fetchAssignRoleEndpoints；inline type alias EndpointTreeNode） | — | — |
| base-web modal | button-auth-modal.vue 接通 NTree + Promise.all + setLoading + toast | — | — |
| Reload trigger | — | — | `assign_permission` 既有 commit 後 notify_casbin_changed |
