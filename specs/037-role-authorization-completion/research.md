# Phase 0 Research — W-FW6 role-authorization-completion

spec.md Assumptions 列 3 個 plan-phase research question（A-003 / A-005 / A-006），本檔逐一查證解決。

## R-Q1 — base-web `Api.SystemManage` 既有型別覆蓋 home 兩端點回傳形狀

- **Decision**: 兩 service function 用 primitive 型別 generic（`request<string | null>` / `request<boolean>`）—— 不需新增 `Api.SystemManage.*` 型別宣告、**不動** `src/typings`（§4 不准動 typings、satisfied）。
- **實查**（`base-web/src/service/api/system-manage.ts`）：既有 service function 對 primitive 回傳值的體例：
  - 有型別宣告：`request<Api.SystemManage.RoleList>(...)` / `request<Api.SystemManage.AllRole[]>(...)` —— 用於複雜物件 / 集合
  - 無型別宣告：`request({ url, method: 'post', data })` —— `fetchAddRole` / `fetchDeleteRole` 等，回傳推斷為 `unknown` / generic envelope
  - 對 primitive 直接 generic：可以用 `request<string | null>` 或 `request<boolean>`，TypeScript 自動推斷 envelope.data 型別為 generic 參數
- **Rationale**: home 兩端點回傳形狀都是 primitive（`string | null` 或 `boolean`）—— 不需要為其在 `src/typings/api/system-manage.d.ts` 加新 interface，generic 參數直接表達即可。與 `fetchUpdateRole` 等無型別宣告的既有體例一致。
- **本 feature 採用**：
  ```ts
  export function fetchGetRoleHome(roleId: string) {
    return request<string | null>({ url: `/systemManage/getRoleHome/${roleId}`, method: 'get' });
  }
  export function fetchUpdateRoleHome(data: { roleId: string; home: string | null }) {
    return request<boolean>({ url: '/systemManage/updateRoleHome', method: 'post', data });
  }
  ```
- **Alternatives considered**：
  - 為 home 兩端點專屬 interface（如 `interface GetRoleHomeResponse`）—— 否決：違反 §4「不准動 src/typings」邊界；無實益（primitive 無需 interface）。
  - 用既有 generic envelope wrapper 不帶型別—— 否決：失去 TypeScript 型別檢查、menu-auth-modal `home.value = data` 賦值缺型別保護。

## R-Q2 — Casbin policy UPDATE 後 W-F11 redis pub-sub 是否自動觸發 enforcer reload

- **Decision**: **不自動** —— UPDATE casbin_rule 後**必須主動呼叫** `server_global::notify_casbin_changed()` 才會 publish invalidate 訊號到 redis、觸發其他 replica reload。本 feature N4 update_role 在 txn commit **後**呼叫此函式。
- **實查**：
  - `rust-api/server/global/src/casbin_notify.rs:13`：channel 常數 `CASBIN_INVALIDATE_CHANNEL = "casbin:policy:invalidate"`
  - `rust-api/server/global/src/casbin_notify.rs:23`：函式 `pub async fn notify_casbin_changed()` —— publish 一條訊息到 channel；redis 未初始化 / Cluster 模式時 log warning 後略過
  - `rust-api/server/initialize/src/casbin_sync_initialization.rs:28`：背景 task 訂閱該 channel、收訊息後對 enforcer 做 **full reload**
  - 既有 use site（grep `notify_casbin_changed`）：
    - `sys_user_api.rs:52, 68`：assign roles / revoke roles 後主動 publish
    - 顯示「Casbin policy 異動 → 主動 publish」是**既有慣例**
- **Rationale**: SeaORM Casbin adapter 對 SELECT/INSERT/DELETE 透過 enforcer API 才自動同步、但本 feature 改 N4 用 raw SQL UPDATE casbin_rule、不走 enforcer API → adapter 不知道有變動 → 必須主動 publish。同 sys_user_api role 指派 path 慣例。
- **本 feature N4 採用流程**：
  ```rust
  // 1. txn 內 UPDATE casbin_rule SET v0 = new_code WHERE ptype = 'p' AND v0 = old_code
  // 2. audit_log::write_in_txn (既有 update_role audit, 自動涵蓋)
  // 3. txn.commit()
  // 4. notify_casbin_changed().await  // 在 commit 後, 避免訊號早於 commit
  ```
- **Alternatives considered**：
  - txn commit **前** publish —— 否決：若 commit 失敗、訊號已 publish、其他 replica reload 看不到變動、空 reload；雖無正確性問題但 wasteful。
  - 不 publish、依賴 enforcer 下次 query 時自然 cache miss —— 否決：W-F11 多 replica 場景下其他 replica enforcer 已 load 舊 policy 在記憶體、不會自動 invalidate；會造成跨 replica 不一致。

## R-Q3 — Casbin policy 對 role code 引用涵蓋哪些 ptype + 欄位

- **Decision**: 既有資料**只有 ptype='p'**（policy rule、v0=role_code）；**無 ptype='g'**（grouping rule、user-role 關聯）—— 既有 user-role 關聯透過 sys_user_role 表表達，不透過 Casbin grouping rule。本 feature N4 同步 Casbin 只需單一 SQL：`UPDATE casbin_rule SET v0 = new_code WHERE ptype = 'p' AND v0 = old_code`。
- **實查**：
  - psql `SELECT DISTINCT ptype, COUNT(*) FROM casbin_rule GROUP BY ptype` → 109 row、全 ptype='p'、0 row ptype='g'
  - psql `SELECT ptype, v0, v1, v2 FROM casbin_rule WHERE ptype='g' LIMIT 5` → 0 row
  - `migration/src/datas/m20260522_d_wfw3_role_alias_seed.rs` 等 seed migration 示範既有 INSERT pattern：`('p', 'ROLE_SUPER', 'built-in', '/systemManage/...', 'POST', '', '')` —— 確認 role code 在 ptype='p' rule 的 v0 欄
  - 既有 casbin_rule schema：8 欄 `id / ptype / v0 / v1 / v2 / v3 / v4 / v5`（VARCHAR(125) NOT NULL）、UNIQUE 約束 `(ptype, v0, v1, v2, v3, v4, v5)`
- **Rationale**: rust-api 的 Casbin 模型使用 RBAC with domain（`rbac_model.conf`）但 user-role 關聯實際上由 sys_user_role 表 + 程式邏輯（如 `get_role_codes_for_users`）載入、不透過 Casbin g rule。這是 codebase 既有設計選擇（簡化 grouping rule 維護、user-role 關聯由 RDB 主導）。N4 同步 Casbin 因此**簡化**：不需處理 grouping rule、單一 ptype='p' SQL 即夠。
- **本 feature N4 採用**：
  ```rust
  // txn 內單一 SQL
  txn.execute(Statement::from_sql_and_values(
      DbBackend::Postgres,
      "UPDATE casbin_rule SET v0 = $1 WHERE ptype = 'p' AND v0 = $2",
      [new_code.into(), old_code.into()],
  )).await?;
  ```
- **Alternatives considered**：
  - 同時 UPDATE ptype='g' rule —— 否決：既有 0 row、無實益；若日後 codebase 加入 g rule 體例、屆時為新 feature 範圍。
  - 用 enforcer API（`enforcer.update_filtered_policies` 或類似）—— 否決：(a) 既有 Casbin Rust SDK 對 update API 體例不一、(b) raw SQL 在 txn 內原子性更可靠、(c) 與 N4 「同 transaction rollback」要求一致。

## 既有體例複核（供 plan / tasks / implementation 參照）

- **`sys_role` 既有 schema**（`migration/src/schemas/m20241023_090604_create_sys_role.rs` + `m20260514_b_add_soft_delete_to_sys_role.rs`）：11 個欄位 `id / code / name / description / pid / status / created_at / created_by / updated_at / updated_by / deleted_at`。本 feature 加的 `home_route_name` 與既有無命名衝突。
- **`sys_role` Sea-ORM entity**（`server/model/src/admin/entities/sys_role.rs`）：以 `DeriveEntityModel` 自動生成的 Model struct；本 feature 在 `pub status: Status` 之後、`pub created_at: DateTime` 之前（或對應位置）加 `pub home_route_name: Option<String>` + `#[sea_orm(column_type = "Text", nullable)]`（沿用既有 String column 用 `Text` 型別、與 description 一致）。
- **`update_role` audit 路徑**（`server/service/src/admin/sys_role_service.rs` 既有）：含 `audit_log::write_in_txn` + `audit_snapshot(&before)` + `audit_snapshot(&updated_role)` —— 本 feature 在 update_role 加 N4 code 變更 detection 不需動 audit 邏輯（audit_snapshot 自動序列化整 entity 含新欄 home_route_name）。
- **`assign_routes` / `assign_users` 既有實作**（`server/service/src/admin/sys_authorization_service.rs:225,305`）：txn 內 insert/delete sys_role_menu / sys_user_role + txn.commit；**完全無 audit 呼叫**（grep 確認）。本 feature 在 txn commit 前加 audit_log::write_in_txn。
- **`audit_log::write_in_txn` helper signature**（F2.1 提供）：
  ```rust
  pub async fn write_in_txn<C: ConnectionTrait>(
      txn: &C,
      event: AuditEvent<'_>,
  ) -> Result<(), AppError>
  ```
  `AuditEvent { actor, operation, entity_type, entity_id, payload_before, payload_after, description, source, request_id }`。
- **`audit_snapshot` helper**（F2.1 提供）：對任何 Serialize impl 的 entity 序列化為 `serde_json::Value`、用於 payload_before/after。本 feature N3 不用 audit_snapshot（payload 是 ad-hoc `{role_id, menu_ids: [...]}` JSON）、N2 update_role_home 用 audit_snapshot（對整 role entity）、N4 既有 update_role audit 自動用 audit_snapshot。
- **`notify_casbin_changed` helper**（W-F11 提供、`server_global::casbin_notify`）：fire-and-forget publish redis；redis 未初始化 / Cluster 時 log warning 後略過（fail-soft、不阻擋業務 commit）。
- **既有 `assign_routes` / `assign_users` trait signature**：
  ```rust
  async fn assign_routes(&self, domain: String, role_id: String, route_ids: Vec<i32>) -> Result<(), AppError>;
  async fn assign_users(&self, role_id: String, user_ids: Vec<String>) -> Result<(), AppError>;
  ```
  本 feature N3 改為加 `actor: &Actor` 參數（append 末尾、避免 callsite 順序混淆）：
  ```rust
  async fn assign_routes(&self, domain: String, role_id: String, route_ids: Vec<i32>, actor: &Actor) -> Result<(), AppError>;
  async fn assign_users(&self, role_id: String, user_ids: Vec<String>, actor: &Actor) -> Result<(), AppError>;
  ```
  callsite 改動 ~3 處：sys_authorization_api.rs 的 assign-routes / assign-users handler、sys_system_manage_api.rs 的 assign_role_menus_for_systemmanage（W-FW4 transform handler）。

## 結論

3 個 R-Q 全 resolved；3 個 plan Phase 0 verify 項（A-003 / A-005 / A-006）已查證並轉為設計決策。本 feature 可進 Phase 1 design（data-model + contracts + quickstart）；無新增 NEEDS CLARIFICATION 反饋至 spec。
