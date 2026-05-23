# Phase 0 Research — W-FW8 button-auth-completion

spec.md Assumptions 列 3 個 plan-phase research question（A-003 / A-006 / Casbin reverse-map），本檔逐一查證解決。

## R-Q1 — base-web 既有型別覆蓋 3 service function 回應形狀

- **Decision**: 3 service function 用 **inline type alias + primitive generic**（不動 `src/typings`）。`fetchGetAllEndpoints` 用 inline `EndpointTreeNode` type alias、`fetchGetRoleEndpointIds` 用 `request<string[]>` primitive generic、`fetchAssignRoleEndpoints` 用 `request<boolean>`。
- **實查**（`base-web/src/service/api/system-manage.ts`）：既有 service function 體例：
  - 複雜物件用 typings 內既宣告型別：`request<Api.SystemManage.RoleList>(...)`
  - primitive 用 generic：`request<string[]>` (fetchGetAllPages) / `request<boolean>` (fetchUpdateRoleHome、W-FW6 N2 落地)
  - W-FW6 R-Q1 確認 primitive generic 為 §4 不准動 typings 下的標準體例
- **本 feature 採用**：
  ```ts
  // inline type — declared in service file, not src/typings
  type EndpointTreeNode = {
    key: string;
    label: string;
    children?: EndpointTreeNode[];
    method?: string;
    path?: string;
    isLeaf?: boolean;
  };

  export function fetchGetAllEndpoints() {
    return request<EndpointTreeNode[]>({ url: '/systemManage/getAllEndpoints', method: 'get' });
  }
  export function fetchGetRoleEndpointIds(roleId: string) {
    return request<string[]>({ url: `/systemManage/getRoleEndpointIds/${roleId}`, method: 'get' });
  }
  export function fetchAssignRoleEndpoints(data: { roleId: string; endpointIds: string[] }) {
    return request<boolean>({ url: '/systemManage/assignRoleEndpoints', method: 'post', data });
  }
  ```
- **Rationale**: tree shape 複雜（含 nested children）、無法用單 primitive generic 充分表達；inline type alias 把宣告限縮在 service 檔內、不汙染 `src/typings`、符合 §4「不准動 typings」邊界；同時保持 TypeScript 型別檢查能力。
- **Alternatives considered**：
  - 為 endpoint tree 在 `src/typings/api/system-manage.d.ts` 加 `EndpointTreeNode` interface —— 否決：違反 §4「不准動 typings」邊界。
  - 用 generic `unknown[]` —— 否決：button-auth-modal.vue 內失去型別檢查、NTree props 對接會 noisy。
  - 用既有 `Api.SystemManage.MenuButton = { code, desc }` 型別 —— 否決：完全不匹配 tree shape。

## R-Q2 — sys_endpoint_service 「列出全部 active endpoint」既有能力

- **Decision**: 既有 `sys_endpoint_service.tree_endpoint()` 提供 by-controller tree shape；本 feature spec 要求 by-resource shape（brainstorm Q3 拍板）。**不擴 service**，在 transform handler 內 inline 從 `sys_endpoint::find_active().all()` query + group by resource + 包成 NTree-friendly shape。
- **實查**：
  - `rust-api/server/service/src/admin/sys_endpoint_service.rs:tree_endpoint()`：query `sys_endpoint::find_active().all(db)` → call `create_endpoint_tree()` → 回 `Vec<EndpointTree>` group by **controller**（如 `SysRoleApi` / `SysUserApi`）。
  - `EndpointTree` shape（`server/model/src/admin/output/sys_endpoint.rs`）：`{ id, path, method, action, resource, controller, summary, children: Option<Vec<EndpointTree>> }`、camelCase。
  - 既有 group key 是 controller、不是 spec FR-001 要求的 resource。
- **Rationale**: 不擴 sys_endpoint_service 為 W-FW8 加 by-resource method（避免汙染既有 service 多用途方法、避免 admin 既有 `/api-endpoint/tree` regression 風險）。`sys_endpoint::find_active().all()` 為輕量 SELECT、67 row 無 perf 顧慮、可在 transform handler 直接執行 + 本地 group。
- **本 feature 採用流程**：
  ```rust
  // transform handler `get_all_endpoints_for_systemmanage` 內：
  let endpoints = sys_endpoint::find_active().all(db).await?;
  let mut by_resource: BTreeMap<String, Vec<&SysEndpointModel>> = BTreeMap::new();
  for ep in &endpoints {
      by_resource.entry(ep.resource.clone()).or_default().push(ep);
  }
  let tree: Vec<EndpointTreeNode> = by_resource.into_iter().map(|(resource, eps)| {
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
  ```
  `EndpointTreeNode` 為本 feature 新 output struct（在 `server/model/src/admin/output/sys_authorization.rs` 或 sys_endpoint.rs 內）—— camelCase serde。
- **Alternatives considered**：
  - 在 `sys_endpoint_service` 加 `tree_endpoint_by_resource()` —— 否決：service 多形態維護負擔、且 by_resource 邏輯是 transform layer concern（接 admin UI 的 friendly shape）非 domain service responsibility。
  - 直接回 `Vec<EndpointTree>`（既有 by-controller shape）、base-web 自己 reshape —— 否決：把 reshape 邏輯 leak 到 frontend、違反 Q4 brainstorm「backend 做 reverse-map / friendly shape」設計。

## R-Q3 — Casbin policy reverse-map (v2 path + v3 method → sys_endpoint.id) 是否唯一

- **Decision**: 既有資料 (path, method) 為 unique（67 active row、0 duplicate）。**雖無 DB UNIQUE 約束**、但 `sync_endpoints` service 流程確保不重複插入（per-entity upsert by id）。本 feature reverse-map 採 `SELECT id FROM sys_endpoint WHERE path = ? AND method = ? AND deleted_at IS NULL LIMIT 1`、若理論上有 2+ row 則取最舊（first by id ASC）—— defensive 但實務 0 機率觸發。
- **實查**：
  - psql `\d sys_endpoint`：只 PRIMARY KEY on id、無 unique constraint on (path, method) 或 (path, method, deleted_at)
  - psql `SELECT path, method, COUNT(*) FROM sys_endpoint WHERE deleted_at IS NULL GROUP BY path, method HAVING COUNT(*) > 1` → 0 row
  - sys_endpoint seed migration `m20241023_*_insert_sys_endpoint.rs` 等與 `sync_endpoints` service 邏輯：每 endpoint 由唯一 `id` 識別、(path, method) 隨之自動唯一（path / method 隨 controller method 變動需新 id）
- **Rationale**: Casbin policy row 含 (v2=path, v3=method) 雙鍵，足以 unique 識別 sys_endpoint.id。reverse-map 邏輯為**已存在於 base-web 端的 mental model**（W-FW4 brainstorm Q3 已隱含）—— 本 feature backend 做 reverse-map 把 leak 隱藏。
- **本 feature reverse-map 實作**（in `get_role_endpoint_ids_for_systemmanage` transform handler）：
  ```rust
  // 1. fetch role → role.code
  // 2. let enforcer = cache_enforcer.get_enforcer(); let r = enforcer.read().await;
  // 3. let policies = r.get_filtered_policy(0, vec![role_code, user.domain()]);
  // 4. for each policy row [v0, v1, v2, v3, ...]:
  //    let endpoint = sys_endpoint::find_active()
  //        .filter(SysEndpointColumn::Path.eq(&policy[2]))
  //        .filter(SysEndpointColumn::Method.eq(&policy[3]))
  //        .one(db).await?;
  //    if let Some(ep) = endpoint { ids.push(ep.id); }
  // 5. return ids
  ```
  **Optimization**：一次 batch query —— `SELECT id, path, method FROM sys_endpoint WHERE deleted_at IS NULL` (67 row in-memory) + iterate policies 在記憶體比對；單 SQL + O(N×M) 比對 N=67 M=role policy 數（通常 < 50）—— 比 N 個 1-row query 高效。
- **Alternatives considered**：
  - 為 (path, method, deleted_at IS NULL) 加 PARTIAL UNIQUE INDEX —— 否決：屬 schema 變更、違反 spec FR-012 「0 schema migration」；且既有資料天然 unique、加索引收益有限。
  - reverse-map 在 base-web 端做 —— 否決：違反 Q4 brainstorm「backend 做 friendly shape、不 leak Casbin 細節給 frontend」。

## 既有體例複核（供 plan / tasks / implementation 參照）

- **`sys_endpoint` schema**（既有、本 feature 0 改動）：7 欄 + deleted_at = 8 欄；資料 67 row、12 controller、13 resource、含中文 `summary`。
- **`tree_endpoint` 既有 output**（`EndpointTree`）：camelCase（rust struct `#[serde(rename_all = "camelCase")]`），group by controller、含 children: Option<Vec<EndpointTree>>。本 feature **不用此 shape**、自行 reshape。
- **`assign_permission` 既有 signature**（`sys_authorization_service.rs:209-233`）：
  ```rust
  async fn assign_permission(
      &self,
      domain: String,
      role_id: String,
      permissions: Vec<String>,  // endpoint IDs
  ) -> Result<(), AppError>;
  ```
  本 feature B 改為加 `actor: &Actor` 末尾（同 W-FW6 N3 體例）：
  ```rust
  async fn assign_permission(
      &self,
      domain: String,
      role_id: String,
      permissions: Vec<String>,
      actor: &Actor,
  ) -> Result<(), AppError>;
  ```
  callsite cascade ~2 處：sys_authentication_api.rs assign_permission handler + 本 feature 新增 sys_system_manage_api.rs assign_role_endpoints transform handler。
- **`sync_role_permissions` 既有 helper**（`sys_authorization_service.rs:128-204`）：在 txn 內 fetch existing role policy + add/remove diff + 末尾 publish `notify_casbin_changed()`。本 feature B 在此既有 txn 流程中、`commit()` 前加 `audit_log::write_in_txn`（同 W-FW6 N3 體例：txn 內 + commit 前 + atomicity）。
- **既有 `notify_casbin_changed`**（W-F11、`server_global::casbin_notify`）：assign_permission 末段已呼叫、本 feature 0 額外 reload 邏輯。
- **既有 W-FW6 audit 體例**（`sys_authorization_service.rs:313 / 416` 已落地）：
  ```rust
  audit_log::write_in_txn(&txn, AuditEvent {
      actor,
      operation: AuditOperation::Update,
      entity_type: "sys_role",
      entity_id: role_id.clone(),
      payload_before: Some(serde_json::json!({ "roleId": &role_id, "domain": &domain_code, "menuIds": &existing_route_ids })),
      payload_after: Some(serde_json::json!({ "roleId": &role_id, "domain": &domain_code, "menuIds": &route_ids })),
      description: None,
      source: AuditSource::Internal,
      request_id: None,
  }).await?;
  ```
  本 feature B 完全套用此模板、key 改為 `endpointIds`（assignRoutes 用 `menuIds`、assignUsers 用 `userIds`、assignPermission 用 `endpointIds`）。

## 結論

3 個 R-Q 全 resolved；3 個 spec Phase 0 verify 項（A-003 sys_endpoint_service / A-006 base-web 型別 / Casbin reverse-map 唯一性）已查證並轉為設計決策。本 feature 可進 Phase 1 design（data-model + contracts + quickstart）；無新增 NEEDS CLARIFICATION 反饋至 spec。
