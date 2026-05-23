# Phase 0 Research — W-FW7 menu-field-persistence

spec.md Assumptions 列 3 個 plan-phase research question（A-002 拆 V1/V2 + A-008），本檔逐一查證解決。

## R-Q1 — base-web menu modal UI 是否實際 render `query` / `buttons` / `fixedIndexInTab` 三欄

- **Decision**: 三欄 UI 元件**全已 render**，本 feature base-web 端零 UI 新增。
- **實查**（`base-web/src/views/manage/menu/modules/menu-operate-modal.vue` 模板區段）：
  - `fixedIndexInTab`（line 402–407）：`NFormItemGi` + `NInputNumber`，`v-model:value="model.fixedIndexInTab"`，label / placeholder 均走 i18n（`page.manage.menu.fixedIndexInTab` / `form.fixedIndexInTab`）。
  - `query`（line 410–415）：`NFormItemGi` + `NDynamicInput`，`v-model:value="model.query"`，渲染 `{key,value}[]` 動態列表。
  - `buttons`（line 430）：`NDynamicInput` + `handleCreateButton` factory（`{ code: '', desc: '' }`），渲染 `MenuButton[]` 動態列表。
- **Rationale**: starter UI（soybean-admin example）原本就含這 3 欄的編輯 UI，W-FW2 接線時刻意保留 UI 但後端 scope-out（serde 靜默忽略），故 W-FW7 補完後端後，UI 自動上線、無需任何 base-web template 改動。

## R-Q2 — 編輯預填在後端 `query` / `buttons` 為 `null` 時 base-web 行為

- **Decision**: base-web `handleInitModel` 已含 null 防護、預填行為合理；本 feature **不需動** base-web。
- **實查**（`menu-operate-modal.vue:191–209` `handleInitModel`）：
  - `Object.assign(model.value, rest, …)` 將 `props.rowData`（含後端回傳值）合進 model。
  - 緊接其後（line 203–208）：`if (!model.value.query) model.value.query = []; if (!model.value.buttons) model.value.buttons = [];` —— 顯式把 null / undefined 強制為空陣列，符合 Model `query: NonNullable<...>` 的型別期望與 NDynamicInput 對非 null 陣列的 binding 需求。
  - `fixedIndexInTab` 為 `Option<i32>`、Model 初始 `null`：NInputNumber 對 `null` 已能正常顯示為空、無需額外防護。
- **Rationale**: starter UI 已預期某些 menu row 沒有 query/buttons（W-FW2 前後端硬寫 `null`），故 handleInitModel 已含此防護。W-FW7 後即使後端對既有 row 仍回 `null`（W-FW7 前建立的 menu），預填行為與既有一致；新填 row 後再開抽屜會回真實陣列、正常渲染。

## R-Q3 — codebase JSONB 欄位儲存體例（migration + entity）

- **Decision**: 沿用 `sys_operation_log.payload_before/after` 既有體例 —— migration 用 `ALTER TABLE … ADD COLUMN <name> JSONB NULL`（`execute_unprepared` 原生 SQL）、entity 用 `#[sea_orm(column_type = "JsonBinary", nullable)] pub <name>: Option<JsonValue>`（`use serde_json::Value as JsonValue;`）。
- **實查**：
  - migration（`migration/src/schemas/m20260514_h_extend_sys_operation_log_audit_fields.rs:32–37`）：
    ```rust
    manager.get_connection().execute_unprepared(
        "ALTER TABLE sys_operation_log ADD COLUMN payload_before JSONB NULL",
    ).await?;
    manager.get_connection().execute_unprepared(
        "ALTER TABLE sys_operation_log ADD COLUMN payload_after JSONB NULL",
    ).await?;
    ```
  - entity（`server/model/src/admin/entities/sys_operation_log.rs:47–50`）：
    ```rust
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub payload_before: Option<JsonValue>,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub payload_after: Option<JsonValue>,
    ```
  - down migration（`m20260514_h:46–53`）：`ALTER TABLE … DROP COLUMN IF EXISTS <name>` 對稱。
- **Rationale**: 既有體例使用 `execute_unprepared` 原生 SQL（避開部分 Sea-ORM table-alter API 對 PostgreSQL JSONB 的支援差異）；JsonBinary 對映 PostgreSQL `JSONB`（二進位 JSON、更快查詢、支援索引）。`Option<JsonValue>` 對 query/buttons 的小型 array 結構直接適用 —— `JsonValue` 即 `serde_json::Value`，可承載任意 JSON 結構。
- **Alternatives considered**:
  - `column_type = "Json"`（對映 PostgreSQL `JSON` 文字型）：不採用，codebase 既有體例用 `JsonBinary`。
  - 自訂 newtype（如 `pub query: Option<Vec<QueryKV>>` 帶 `derive(Serialize, Deserialize)`）：可型別安全，但與既有 audit payload `JsonValue` 體例不一致、且 `SystemManageMenuOutput.query: Option<serde_json::Value>` 早已宣告 `Value` —— 統一用 `JsonValue` 最小摩擦。

## 既有體例複核（供 plan / tasks / implementation 參照）

- **`sys_menu` 既有 schema**（`migration/src/schemas/m20241023_091143_create_sys_menu.rs` + `m20260514_c_add_soft_delete_to_sys_menu.rs`）：23 個欄位（id / menu_type / menu_name / route_name / route_path / component / icon_type / icon / path_param / status / active_menu / hide_in_menu / pid / sequence / i18n_key / keep_alive / constant / href / multi_tab / created_at / created_by / updated_at / updated_by / deleted_at）。本 feature 加的 3 欄與既有無命名衝突。
- **`sys_menu` Sea-ORM entity**（`server/model/src/admin/entities/sys_menu.rs`）：以 `DeriveEntityModel` 自動生成的 Model struct；本 feature 在 `pub multi_tab: Option<bool>` 之後、`pub created_at` 之前（或同類相鄰位置）加 3 個新欄。
- **`SystemManageMenuOutput`**（`server/model/src/admin/output/sys_system_manage.rs`）三欄已宣告（W-FW2 預留）：`buttons: Option<Vec<serde_json::Value>>` / `fixed_index_in_tab: Option<i32>` / `query: Option<serde_json::Value>`，`From<MenuTree>` 硬寫 `None`。本 feature 改 `From` 從 `MenuTree` 對映。
- **`MenuTree`**（位置待 plan tasks 階段確認）：menu list 查詢的中介 struct，本 feature 為其加 3 個欄位以承載 entity 值。
- **`MenuRoute` / `RouteMeta`**（`server/model/src/admin/output/sys_menu.rs`）：本 feature 在 `RouteMeta` 加 `query: Option<JsonValue>` + `fixed_index_in_tab: Option<i32>`、皆 `#[serde(skip_serializing_if = "Option::is_none")]`；`buttons` **不加**（Q2 拍板）。
- **既有 menu create/update audit 路徑**（`server/service/src/admin/sys_menu_service.rs` 內，比照 W-FW5 `sys_user_service.rs:audit_log::write_in_txn` 體例）：新欄位自動含於 audit snapshot（`audit_snapshot(&menu_model)` 序列化整個 entity），無需新增 audit 邏輯。
