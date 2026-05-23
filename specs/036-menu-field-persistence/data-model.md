# Data Model — W-FW7 menu-field-persistence

新增 3 個欄位至 `sys_menu`（既有 23 欄）、entity 同步、雙向 DTO 接通、runtime route meta 擴充 2 欄。

## 既有實體（不改 schema 之外的結構）

- **`sys_menu`**：admin 端定義的選單；現有 23 欄不變動。本 feature 加 3 欄（A1）。
- **`SystemManageMenuOutput`**（`server/model/src/admin/output/sys_system_manage.rs`）：W-FW2 已宣告 `query: Option<serde_json::Value>` / `buttons: Option<Vec<serde_json::Value>>` / `fixed_index_in_tab: Option<i32>`，但 `From<MenuTree>` 硬寫 `None`。本 feature 改 `From` 填真值（C1）。
- **既有能力（沿用、不重做）**：
  - menu create / update service 既有 audit 路徑（`audit_log::write_in_txn` + `audit_snapshot(&menu_model)`）對 entity 全欄序列化 → 新 3 欄自動進 audit payload。
  - `SecureUtil` / 軟刪 / cleanup / soft-delete query 過濾全部沿用、無新增。

## A — Schema + Entity（DB 層）

### A1 — Migration（`sys_menu` 加 3 欄）

新 schema migration `migration/src/schemas/m<timestamp>_add_menu_fields_to_sys_menu.rs`（timestamp 晚於現有最大），沿用 `m20260514_h_extend_sys_operation_log_audit_fields.rs` 的 `execute_unprepared` 體例：

```rust
// up
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_menu ADD COLUMN query JSONB NULL"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_menu ADD COLUMN buttons JSONB NULL"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_menu ADD COLUMN fixed_index_in_tab INTEGER NULL"
).await?;

// down
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_menu DROP COLUMN IF EXISTS fixed_index_in_tab"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_menu DROP COLUMN IF EXISTS buttons"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_menu DROP COLUMN IF EXISTS query"
).await?;
```

Register in `migration/src/lib.rs`（Vec 末端、晚於 `m20260523_b_wfw5_change_password_seed`）。

| 欄位 | PostgreSQL 型別 | NULL | 預設 |
|---|---|---|---|
| `query` | `JSONB` | YES | `NULL` |
| `buttons` | `JSONB` | YES | `NULL` |
| `fixed_index_in_tab` | `INTEGER` | YES | `NULL` |

既有 menu row 升級後三欄皆 `NULL`，向後相容。

### A2 — Sea-ORM entity（`sys_menu.rs`）

`server/model/src/admin/entities/sys_menu.rs` 加 3 欄（位置建議在 `pub multi_tab: Option<bool>` 之後、`pub created_at: DateTime` 之前 —— 邏輯相鄰於其他 route-meta 欄位）：

```rust
#[sea_orm(column_type = "JsonBinary", nullable)]
pub query: Option<JsonValue>,
#[sea_orm(column_type = "JsonBinary", nullable)]
pub buttons: Option<JsonValue>,
pub fixed_index_in_tab: Option<i32>,
```

`JsonValue` 已由檔頂 `use serde_json::Value as JsonValue;` 引入（既有 codebase 體例）—— 若 `sys_menu.rs` 檔頂目前無此 import，加上。

## B — 寫入路徑

### B1 — Native `MenuInput`

`server/model/src/admin/input/sys_menu.rs` 的 `MenuInput`（native，所有 menu 寫入路徑共用）補 3 欄：

```rust
#[serde(default)]
pub query: Option<serde_json::Value>,
#[serde(default)]
pub buttons: Option<serde_json::Value>,
#[serde(default)]
pub fixed_index_in_tab: Option<i32>,
```

`#[serde(default)]` 確保「未提供」對映 `None`（與 `Some(empty array)` 明示空清單區別，對應 FR-004 / E-3 / E-4）。

### B2 — Transform DTO（systemManage 入口）

`SystemManageAddMenuInput` / `SystemManageUpdateMenuInput`（同檔 `sys_menu.rs` 的 systemManage 區段）各加 3 欄：

```rust
#[serde(default)]
pub query: Option<serde_json::Value>,
#[serde(default)]
pub buttons: Option<serde_json::Value>,
#[serde(default)]
pub fixed_index_in_tab: Option<i32>,
```

`#[serde(rename_all = "camelCase")]` 已套用（檔內既有），故 base-web 送出的 `fixedIndexInTab` 自動對映至 rust `fixed_index_in_tab`；`query` / `buttons` 同名。

### B3 — Transform handler

`server/api/src/admin/sys_system_manage_api.rs` 的 `add_menu` / `update_menu` transform handler：在 systemManage input → native `MenuInput` 的對映處（既有 W-FW2 程式碼有 transform 區段），把 3 欄原樣對映：

```rust
MenuInput {
    // … 既有欄位映射 …
    query: input.query,
    buttons: input.buttons,
    fixed_index_in_tab: input.fixed_index_in_tab,
}
```

對應的 update handler 同樣對映。

### B4 — Menu service create/update

`server/service/src/admin/sys_menu_service.rs` 的 `create_menu` / `update_menu`：在組 `sys_menu` ActiveModel 的處，3 欄寫入：

```rust
// create_menu
let model = sys_menu::ActiveModel {
    // … 既有欄位 Set(…) …
    query: Set(input.query),
    buttons: Set(input.buttons),
    fixed_index_in_tab: Set(input.fixed_index_in_tab),
    // …
};
```

update_menu 對 3 欄的處理：`Option<Value>` / `Option<i32>` 的 update 語義 —— 若 input 該欄為 `None`，update **不動**該欄；若為 `Some`（含 `Some(Value::Null)` 或 `Some(empty array)`），update 為該值。具體寫法比照既有 menu update 對其他 optional 欄位的處理（如 `keep_alive: Option<bool>`、`href: Option<String>`）—— 如已採用 `if let Some(v) = input.keep_alive { active.keep_alive = Set(Some(v)); }` 體例，則 3 欄沿用同樣模式。

audit 路徑既有（create_menu / update_menu 已含 `audit_log::write_in_txn` + `audit_snapshot`）—— entity 加 3 欄後，audit snapshot 自動序列化包含這 3 欄，**無需新增 audit 邏輯**。

## C — 讀出路徑：admin CRUD

### C1 — `SystemManageMenuOutput.From<MenuTree>`

`server/model/src/admin/output/sys_system_manage.rs`：`From<MenuTree>` impl 現有：

```rust
buttons: None,
fixed_index_in_tab: None,
query: None,
```

改為從 `m`（`MenuTree`）對映：

```rust
buttons: m.buttons,
fixed_index_in_tab: m.fixed_index_in_tab,
query: m.query,
```

**型別對齊（本 feature 決定）**：原 `SystemManageMenuOutput.buttons: Option<Vec<serde_json::Value>>`（W-FW2 預留宣告、硬寫 `None` 從未填值）**本 feature 統一為** `Option<serde_json::Value>`，與同 struct 的 `query` 形狀一致 —— `From<MenuTree>` impl 內 `m.buttons` 直接對映無需 conversion。理由：(1) W-FW2 該欄無 consumer 依賴 `Vec` 形狀；(2) serde 對 `Value::Array(...)` 與 `Vec<Value>` 的 JSON 序列化輸出**完全相同**，base-web 端無感；(3) 內部 code 統一用 `Option<serde_json::Value>` 最小摩擦。具體改動見 tasks.md T009。

### C2 — `MenuTree`

- **struct 定義** `server/model/src/admin/output/sys_menu.rs:43` 加 3 欄：

  ```rust
  pub query: Option<serde_json::Value>,
  pub buttons: Option<serde_json::Value>,
  pub fixed_index_in_tab: Option<i32>,
  ```

- **構造點** `server/service/src/admin/sys_menu_service.rs:64` 的 `fn build_menu_tree(menu: &SysMenuModel) -> MenuTree`，在 `MenuTree { … }` 字面值內加：

  ```rust
  query: menu.query.clone(),
  buttons: menu.buttons.clone(),
  fixed_index_in_tab: menu.fixed_index_in_tab,
  ```

`Option<JsonValue>` 為 owned type，從 entity reference 對映需 `.clone()`（i32 為 Copy）。

## D — 讀出路徑：runtime 動態路由

### D1 — `RouteMeta`

`server/model/src/admin/output/sys_menu.rs` 的 `RouteMeta` 加 2 欄（**僅** `query` + `fixed_index_in_tab`，**不**加 `buttons` —— Q2 拍板）：

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub query: Option<serde_json::Value>,
#[serde(skip_serializing_if = "Option::is_none")]
pub fixed_index_in_tab: Option<i32>,
```

`skip_serializing_if = "Option::is_none"` 確保當 menu 該欄為 `NULL` 時，runtime route meta 不出現對應欄（FR-009、E-6 向後相容）。

### D2 — `MenuRoute` 組裝（**兩個構造點**）

`MenuRoute` 在生產 code 有**兩個** explicit struct literal 構造點，加 D1 RouteMeta 的 2 個新欄後將觸發 missing-field compile error → 兩處**必須同步填**：

- **① `server/service/src/admin/sys_auth_service.rs:184` 的 `get_user_routes`**（對 `/getUserRoutes`、JWT-protected 路由 — 使用者登入後取得的動態菜單樹）
- **② `server/service/src/admin/sys_menu_service.rs:170` 的 `get_constant_routes`**（對 `/getConstantRoutes`、public 路由 — 不需登入即可取得的常數路由）

兩處的 `RouteMeta { … }` 字面值末尾各加：

```rust
RouteMeta {
    // … 既有欄位 …
    query: menu.query.clone(),
    fixed_index_in_tab: menu.fixed_index_in_tab,
}
```

`buttons` **不**填入 RouteMeta（既有 RouteMeta 不含此欄、本 feature 也不加，Q2 拍板）。

**tests 同步**：`server/model/tests/response_shape_alignment_dimension_b.rs:34,109` 與 `server/service/tests/auth_login_shapes.rs:30,105` 中的 explicit `RouteMeta` literal 亦需補 2 欄（用 `None` 即可，tests 不關心新欄行為）。

## E — base-web

**0 改動**。Phase 0 R-Q1（modal UI 已 render 3 欄）+ R-Q2（handleInitModel 已含 null 防護）+ exploration（`Api.SystemManage.Menu` 型別已宣告 3 欄）三項已驗證齊備。

若實作期 acceptance 階段發現任何 base-web 行為不如預期（理論上不應發生），微調限於 `menu-operate-modal.vue` 單檔（§4 准動清單內，W-FW2 已動過此檔）—— 屬 contingency、不期望觸發。

## 命名與型別摘要

| 層 | query | buttons | fixedIndexInTab / fixed_index_in_tab |
|---|---|---|---|
| PostgreSQL | `JSONB NULL` | `JSONB NULL` | `INTEGER NULL` |
| Sea-ORM entity | `Option<JsonValue>` + `JsonBinary` | `Option<JsonValue>` + `JsonBinary` | `Option<i32>` |
| Native `MenuInput` | `Option<serde_json::Value>` | `Option<serde_json::Value>` | `Option<i32>` |
| transform DTO（camelCase） | `query` | `buttons` | `fixedIndexInTab` |
| `SystemManageMenuOutput` | `Option<serde_json::Value>`（既有宣告） | **本 feature 改為** `Option<serde_json::Value>`（原 `Option<Vec<serde_json::Value>>` 統一為與 `query` 一致；W-FW2 時硬寫 None、無 consumer 依賴 Vec 形狀；serde JSON 序列化結果相同） | `Option<i32>`（既有宣告） |
| `RouteMeta` 新增 | `Option<serde_json::Value>` + `skip_serializing_if` | **不加** | `Option<i32>` + `skip_serializing_if` |
| base-web `Api.SystemManage.Menu` | 既有（透過 `MenuPropsOfRoute`） | 既有（頂層） | 既有（透過 `MenuPropsOfRoute`） |
