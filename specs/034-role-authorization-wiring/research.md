# Phase 0 Research — W-FW4 role-authorization-wiring

brainstorm doc（`docs/superpowers/034-feature-role-authorization-wiring.md`）列 4 個開放問題，本檔逐一查證解決。

## R-Q1 — `SysMenuService` / `SysAuthorizationService` 注入 systemManage router

- **Decision**: W-FW4 需在 `server/initialize/src/router_initialization.rs` 的 systemManage router 組裝處（`~:352`）**補一層 `Extension(Arc::new(SysAuthorizationService))`**；`SysMenuService` 已存在、無需補。
- **Rationale**: 實查 `router_initialization.rs:345-363` —— systemManage router 已 `.layer(Extension(SysUserService))` / `.layer(Extension(SysRoleService))` / `.layer(Extension(SysMenuService))`，但**未** layer `SysAuthorizationService`。W-FW4 讀 handler 需 `SysMenuService`（已具備）、寫 handler 需 `SysAuthorizationService`（缺）。authorization router 自身的組裝（`:203-221`）已示範 `.layer(Extension(SysAuthorizationService))` 寫法 —— 比照補入即可。
- **Alternatives considered**: 在 alias handler 內直接 new service → 否決：偏離既有 Extension-injected service 慣例。

## R-Q2 — 菜單樹勾選 vs 後端讀側過濾的來回一致性

- **Decision**: W-FW4 alias 為 thin passthrough、**不加任何過濾**。讀 alias 直接回 `get_menu_ids_by_role_id` 結果、寫 alias 原樣傳 `assign_routes`。來回冪等性由 acceptance C-V（SC-004）實測；若不冪等則登 INTEGRATION-CHECKLIST「Follow-up Backlog」為已知 minor 落差，**不在 W-FW4 改動原生 service 過濾邏輯**（屬範疇外、且撞「不重做業務邏輯」）。
- **Rationale**: 實查 ——
  - **讀** `SysMenuService::get_menu_ids_by_role_id`（`sys_menu_service.rs:330-365`）：先撈 `sys_role_menu` 的 `menu_id`，再對 `sys_menu` re-filter `Status::Enabled` + `Constant == false`；**不**濾 `menu_type`（Directory 與 Menu 皆回）。
  - **寫** `SysAuthorizationService::assign_routes`（`sys_authorization_service.rs:225-303`）：對傳入 `route_ids` 做 `sys_menu::find_active().filter(Id.is_in(...))` 驗證存在（全空才 `RoutesNotFound`、不逐一濾），delta 計算後 `insert_many` / `delete_many` 寫 `sys_role_menu`，**原樣存傳入的 ids**。
  - 因此潛在落差只發生在 NTree 送出的勾選集合含 `Constant==true` 或 `Status!=Enabled` 的菜單時（存得進、讀不回）。而 NTree 的節點來源為 `fetchGetMenuTree`（`/systemManage/getMenuTree`）；菜單樹本身若不含 constant/disabled 菜單，則使用者無從勾選、落差不發生。Directory 節點本身會被讀回（無 `menu_type` 過濾）→ 父節點勾選不造成落差。
  - 結論：落差是條件性的、且取決於 `getMenuTree` 的菜單樹內容；非確定性 bug。最務實處理 = 不在 W-FW4 動原生過濾、由 acceptance 實測冪等性（SC-004 C-V），實測結果決定是否登 backlog。
- **Alternatives considered**:
  - 寫 alias 對齊讀側過濾（送出前濾掉 constant/disabled）→ 否決：alias 層做業務過濾、偏離 thin passthrough；且 `getMenuTree` 若本就不含這些菜單則屬多餘防禦。
  - 改原生 `get_menu_ids_by_role_id` 或 `assign_routes` 過濾 → 否決：撞「不重做業務邏輯」、影響所有 native caller、超出 wiring feature 範疇。

## R-Q3 — `SysAuthorizationService::assign_routes` 簽章與行為

- **Decision**: 寫 alias 直接呼 `assign_routes(domain: String, role_id: String, route_ids: Vec<i32>)`。
- **Rationale**: 實查 `sys_authorization_service.rs:225` —— `assign_routes` 取 `domain` / `role_id` / `route_ids`，驗角色存在 → 撈既有 `sys_role_menu` → 算 delta（新增 / 移除）→ `insert_many` / `delete_many` 於 transaction 內 commit。對應原生 `POST /authorization/assign-routes` 的 `AssignRouteDto { domain, role_id, route_ids }`。W-FW4 alias 把 base-web 送的 `{ roleId, menuIds }` + actor domain 組成這 3 參數。
- **Note**: `sys_role_menu` 為 role↔menu 的 M:N 關聯表（複合鍵 `role_id` + `menu_id` + `domain`），de-association 採 delta `delete_many`（關聯表慣例）；非業務實體軟刪範疇。本 feature 不改此既有行為。
- **Audit gap（實查確認）**: `assign_routes` 全函式（`sys_authorization_service.rs:225-303`）於 transaction 內 `insert_many` / `delete_many` 更新 `sys_role_menu`，**無任何 `sys_operation_log` 寫入**（grep `operation_log` / `audit` / `send_*event` 全函式 0 命中）。此 audit gap 為 pre-existing native 行為、非 W-FW4 引入；W-FW4 thin wiring 不補，登 follow-up W-FW4-N3（比照 backlog R2）。spec FR-011 / A-001 已據此修正（移除不實的 audit 宣稱）。

## R-Q4 — base-web menu-auth-modal `roleId` 來源

- **Decision**: `fetchGetRoleMenuIds` / `fetchAssignRoleMenus` 接收 `props.roleId` runtime 值原樣傳遞、不做型別轉換；rust 端 `role_id: String`。
- **Rationale**: 實查 ——
  - `role-operate-drawer.vue:69`：`const roleId = computed(() => props.rowData?.id || -1)`；`props.rowData` 為 `Api.SystemManage.Role | null`。
  - `menu-auth-modal.vue:12`：`interface Props { roleId: number }`；mount 路徑 `index.vue` → `RoleOperateDrawer`（`v-if="isEdit"`）→ `MenuAuthModal :role-id="roleId"`。
  - `Role['id']` TS 宣告為 `number`（`CommonRecord`），但 runtime 為 ULID 字串（沿 W-FW3 R-Q2 既確認的 role id 型別落差）。modal 僅於 `isEdit`（rowData 非 null）時顯示 → `roleId` 為真實角色 id 字串、`-1` fallback 不會觸及實際請求。
  - base-web 將 runtime 字串值原樣送出、rust serde `String` 收下 —— 同 W-FW3 模式，不改 `Role['id']` 型別宣告（撞 W-WEBUI §4「不碰型別」邊界）。
- **Alternatives considered**: 改 `Role['id']` 型別宣告 → 否決：撞 W-WEBUI §4 邊界；此 minor 型別不符與 W-FW3 同類、INTEGRATION-CHECKLIST 既記。

## base-web service function 體例（複核）

`src/service/api/system-manage.ts` 既有 `fetchGetMenuTree` / `fetchGetAllPages`（GET、`request<T>({ url, method: 'get' })`）。W-FW4 新增 `fetchGetRoleMenuIds`（GET）/ `fetchAssignRoleMenus`（POST、`request({ url, method: 'post', data })`），比照此體例 + W-FW1/2/3 `fetch*` 命名。
