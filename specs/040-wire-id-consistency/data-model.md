# Data Model — 040 wire-id-consistency

本 feature 0 新 entity / 0 schema 改動。所有改動限於 wire 表示層（rust output struct + base-web service annotation + 2 modal）+ 既有 deserializer 拆除。

Phase 0 research（R-Q1~R-Q5）已 resolved；本檔列具體改動位置 + 細節，含 spec 階段未捕捉的 errata（R-Q3 完整 handler 清單、R-Q5 typings 0 改動）。

## 既有實體（無 schema 改動、僅 wire 表示層調整）

| Table | 狀態 | wire DTO 引入 |
|---|---|---|
| `sys_role` | Sea-ORM Model 不動（保留 `id: String` ULID + `display_id: i64`）| **新增** `RoleDetail`（`id: i64` 從 `model.display_id`） |
| `sys_user` | 同上 | **新增** `UserDetail` |
| `sys_access_key` | 同上 | **新增** `AccessKeyDetail` |
| `sys_endpoint` / `sys_organization` | Model 不動 | 不變（base-web 不直接讀、無新 wire DTO 需求） |
| `sys_menu` | Input DTO `MenuInput` / `UpdateMenuInput` 的 `parent_id: i32` | **拆** custom deserializer、改 plain serde（C1） |
| 其他表 | 不變 | — |

## A — base-web 改動（Theme A + B、W-WEBUI §4 邊界內）

### A1 — service.ts inline type annotation 4 處（spec FR-001/FR-002 精準版）

**檔**: `base-web/src/service/api/system-manage.ts`

```typescript
// 改前 (line ~147)
export function fetchGetRoleHome(roleId: string) {
  return request<string | null>({ url: `/systemManage/getRoleHome/${roleId}`, ... });
}

// 改後
export function fetchGetRoleHome(roleId: Api.SystemManage.Role['id']) {
  return request<string | null>({ url: `/systemManage/getRoleHome/${roleId}`, ... });
}
```

4 處改動（全用 `Api.SystemManage.Role['id']` 替 hardcoded `string`；template literal `${roleId}` 自動 string-coerce、無需 `String()`）：

| Line ~ | Function | 改動 |
|---|---|---|
| 147 | `fetchGetRoleHome` | `roleId: string` → `roleId: Api.SystemManage.Role['id']` |
| 155 | `fetchUpdateRoleHome` | `data: { roleId: string; home: string \| null }` → `data: { roleId: Api.SystemManage.Role['id']; home: string \| null }` |
| 178 | `fetchGetRoleEndpointIds` | `roleId: string` + return `string[]` → `roleId: Api.SystemManage.Role['id']` + return `number[]` |
| 186 | `fetchAssignRoleEndpoints` | `data: { roleId: string; endpointIds: string[] }` → `data: { roleId: Api.SystemManage.Role['id']; endpointIds: number[] }` |

**註**：line ~134 `fetchGetRoleMenuIds` + line ~142 `fetchAssignRoleMenus` 已用 `Api.SystemManage.Role['id']`、不改。

**typings/api/system-manage.d.ts 0 改動**（R-Q5 確認）—— `Api.SystemManage.Role.id: number` 已對齊 039 + W-FW3 落地、indexed type 自動取 number。

### A2 — 2 modal `String(...)` 移除

**檔 1**: `base-web/src/views/manage/role/modules/button-auth-modal.vue`

```typescript
// line 33 改前
fetchGetRoleEndpointIds(String(props.roleId))
// 改後
fetchGetRoleEndpointIds(props.roleId)  // number 直送、A1 service signature 接受

// line 45 改前
{ roleId: String(props.roleId), endpointIds: checks.value }
// 改後
{ roleId: props.roleId, endpointIds: checks.value as number[] }
```

`checks` 型別 `shallowRef<string[]>` 需 cast 或改 `shallowRef<number[]>`（取決於 fetchGetRoleEndpointIds 回傳改型；A1 改 return `number[]` 後 checks 應同步改 `shallowRef<number[]>`）。

**檔 2**: `base-web/src/views/manage/role/modules/menu-auth-modal.vue`

```typescript
// line 37 改前
fetchGetRoleHome(String(props.roleId))
// 改後
fetchGetRoleHome(props.roleId)

// line 46 改前
{ roleId: String(props.roleId), home: val === 'home' ? null : val }
// 改後
{ roleId: props.roleId, home: val === 'home' ? null : val }
```

## B — URL path String() 餘料（Theme A 副產品）

Theme A 改完後 4 處 `String(props.roleId)` 全消（service function signature 接受 number 或 indexed type）。**無獨立改動**。

## C — rust parentId deserializer workaround drop

### C1 — sys_menu.rs input drop deserialize_parent_id_compat

**檔**: `rust-api/server/model/src/admin/input/sys_menu.rs`

```rust
// 拆除（line 7-23 ~17 行）：
/// W-FW2 fix: parentId 可能是 number（建立路徑）或 string（編輯路徑，從 getMenuList 回傳值預填）。
fn deserialize_parent_id_compat<'de, D>(deserializer: D) -> Result<i32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error as _;
    match serde_json::Value::deserialize(deserializer)? {
        serde_json::Value::Number(n) => n.as_i64()
            .and_then(|i| i32::try_from(i).ok())
            .ok_or_else(|| serde::de::Error::custom(format!("parentId number out of i32 range: {}", n))),
        serde_json::Value::String(s) => s.parse::<i32>()
            .map_err(|_| serde::de::Error::custom(format!("parentId cannot parse string as i32: {:?}", s))),
        v => Err(D::Error::custom(format!(
            "parentId expected number or string, got: {}",
            v
        ))),
    }
}
```

`MenuInput` / `UpdateMenuInput` 內 `parent_id` 欄（~line 127, 157）的 `#[serde(deserialize_with = "deserialize_parent_id_compat")]` 屬性也拆掉、改 plain serde default：

```rust
// 改前
#[serde(deserialize_with = "deserialize_parent_id_compat")]
pub parent_id: i32,

// 改後
pub parent_id: i32,
```

**Risk**: base-web menu-operate-modal 仍送 string parentId → 撞 422 serde deser。Plan Phase 0 R-Q4 預估 base-web typings 已 number、應 safe；implementation 階段 grep `String(parentId)` 在 base-web 確認；若命中、補對齊（屬 Theme A 擴展、ad-hoc）。

## D — rust 3 raw endpoint wire DTO wrap

### D1 — RoleDetail output struct

**新增於** `rust-api/server/model/src/admin/output/sys_role.rs`（**新檔**或加進 sibling、由 implementer 拍板；建議新檔以便對稱 sys_user / sys_access_key）：

```rust
//! 040 wire-id-consistency D1: raw endpoint output wire DTO for sys_role.
//! 隔離 Sea-ORM Model（internal SoT、含 ULID id）與 wire 表示（含 numeric display_id as id）。

use chrono::NaiveDateTime;
use serde::Serialize;

use crate::admin::entities::sys_role;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleDetail {
    pub id: i64,                              // 從 model.display_id
    pub pid: String,                          // sys_role.pid（parent role id ULID 或空）
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,                       // enum 字串
    pub home_route_name: Option<String>,      // W-FW6 N2
    pub created_at: NaiveDateTime,
    pub created_by: String,
    pub updated_at: Option<NaiveDateTime>,
    pub updated_by: Option<String>,
}

impl From<sys_role::Model> for RoleDetail {
    fn from(m: sys_role::Model) -> Self {
        Self {
            id: m.display_id,
            pid: m.pid,
            code: m.code,
            name: m.name,
            description: m.description,
            status: format!("{:?}", m.status).to_lowercase(),  // or use sea_orm Display impl
            home_route_name: m.home_route_name,
            created_at: m.created_at,
            created_by: m.created_by,
            updated_at: m.updated_at,
            updated_by: m.updated_by,
        }
    }
}
```

**註**：精確的 sys_role Model 欄位由 implementer read entity file 確認；上述為 brainstorm 階段預測。`status` enum → string 轉換需與既有體例對齊（grep `format!("{:?}"` 或 `impl Display` for sys_role::Status）。`server/model/src/admin/output/mod.rs` 註冊 `pub mod sys_role;`（或加進既有 sys_user.rs 邏輯下）。

### D2 — UserDetail output struct

**加進** `rust-api/server/model/src/admin/output/sys_user.rs`（既有檔，比照 sibling `UserWithoutPassword` 既有 struct）：

```rust
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDetail {
    pub id: i64,                              // 從 model.display_id
    pub domain: String,
    pub username: String,
    // ⚠️ password 不暴露（沿用 UserWithoutPassword 設計），但本 DTO 為 raw endpoint output、視 implementer 評估
    pub nick_name: String,
    pub avatar: Option<String>,
    pub email: Option<String>,
    pub phone_number: Option<String>,
    pub status: Status,
    pub gender: Option<Gender>,
    pub created_at: NaiveDateTime,
    pub created_by: String,
    pub updated_at: Option<NaiveDateTime>,
    pub updated_by: Option<String>,
}

impl From<sys_user::Model> for UserDetail {
    fn from(m: sys_user::Model) -> Self {
        Self {
            id: m.display_id,
            domain: m.domain,
            username: m.username,
            nick_name: m.nick_name,
            avatar: m.avatar,
            email: m.email,
            phone_number: m.phone_number,
            status: m.status,
            gender: m.gender,
            created_at: m.created_at,
            created_by: m.created_by,
            updated_at: m.updated_at,
            updated_by: m.updated_by,
        }
    }
}
```

**註**：UserDetail 與既有 `UserWithoutPassword` 邏輯接近、實質差異是 `id: i64` 直接從 `display_id`。Implementer 可考慮：

1. 重用 `UserWithoutPassword`、改 `id: String → i64`、From impl 改 `id: m.display_id`（更 DRY、但會破壞既有 alias output 的 ID 語意，**建議不採**）
2. 新加 `UserDetail` 與 `UserWithoutPassword` 並存（更明確、推薦）

實作時拍板。

### D3 — AccessKeyDetail output struct

**新增** `rust-api/server/model/src/admin/output/sys_access_key.rs`（**新檔**，sibling output dir 尚無此 entity 對應檔）：

```rust
//! 040 wire-id-consistency D3: raw endpoint output wire DTO for sys_access_key.

use chrono::NaiveDateTime;
use serde::Serialize;

use crate::admin::entities::sys_access_key;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessKeyDetail {
    pub id: i64,                              // 從 model.display_id
    pub domain: String,
    pub access_key_id: String,
    // ⚠️ secret 不暴露（敏感）；implementer 確認 sys_access_key Model 是否含 secret
    pub status: String,
    pub description: Option<String>,
    pub created_at: NaiveDateTime,
    pub created_by: String,
}

impl From<sys_access_key::Model> for AccessKeyDetail {
    fn from(m: sys_access_key::Model) -> Self {
        Self {
            id: m.display_id,
            // ... (具體欄位由 implementer read entity file 對齊)
        }
    }
}
```

`server/model/src/admin/output/mod.rs` 註冊 `pub mod sys_access_key;`。

### D4 — handler `.map(Detail::from)` wrap

**檔**: `rust-api/server/api/src/admin/sys_role_api.rs`

5 handler 改 return type + wrap（spec FR-011 4 handler + R-Q3 補 `create_role`）：

```rust
// get_paginated_roles 改前
service.find_paginated_roles(params).await.map(Res::new_data)
// 改後
service.find_paginated_roles(params).await
    .map(|page| PaginatedData {
        records: page.records.into_iter().map(RoleDetail::from).collect(),
        ..page  // 其他 page meta（total/current/size 等）保留
    })
    .map(Res::new_data)
// return type: Res<PaginatedData<RoleDetail>>
```

```rust
// get_role / create_role / update_role 改前
service.<call>.await.map(Res::new_data)
// 改後
service.<call>.await.map(RoleDetail::from).map(Res::new_data)
// return type: Res<RoleDetail>
```

```rust
// get_all_roles 改前
service.find_all_enabled().await.map(Res::new_data)
// 改後
service.find_all_enabled().await
    .map(|v| v.into_iter().map(RoleDetail::from).collect::<Vec<_>>())
    .map(Res::new_data)
// return type: Res<Vec<RoleDetail>>
```

`delete_role` 返 `Res<()>` 不動。

### D5 — sys_user_api.rs handler 同 pattern

5 handler 改：`get_all_users` / `get_paginated_users` / `create_user` / `get_user` / `update_user`；3 handler 不動：`delete_user` / `delete_user_by_body` / `batch_delete_users` / `remove_policies` / `add_policies`（Casbin policy 操作、Res<()> 或 Res<bool>）。

### D6 — sys_access_key_api.rs handler 同 pattern

2 handler 改：`get_paginated_access_keys` / `create_access_key`；1 handler 不動：`delete_access_key`。

## E — Doc 更新

### E1 — DESIGN-W-WEBUI doc 加 W-FW9 條目

**檔**: `docs/INTEGRATION-DESIGN-W-WEBUI.md`

在 §7 內既 §7.3 W-FW7 後加 `§7.4 W-FW9 wire-id-consistency`（既 §7.4 執行順序 → §7.5）。內容：W-FW9 範疇（A+B 屬本軌道、C+D rust-only 軌道外）+ base-web §4 邊界內檔案清單（typings/api/system-manage.d.ts 0 改 + service.ts 4 處 inline type + 2 modal 4 處 String(...)）+ 與既有 W-FW1~W-FW8 的關係（修 W-FW6/W-FW8 留下 modal body 餘料）。

## 命名與型別摘要

| 層 | 5 entity id 表現 | rust 內部 | wire (raw endpoint 改 wrap 後) | wire (systemManage alias 039 已對齊) |
|---|---|---|---|---|
| Sea-ORM Model | `id: String` (ULID) + `display_id: i64` | both available | — | — |
| Raw endpoint output（本 feature 加） | — | — | `id: i64`（從 model.display_id）| — |
| systemManage alias output（039 落地） | — | — | — | `id: i64`（從 model.display_id） |
| Service layer | 業務以 `entity.id`（ULID）為 SoT | ULID | — | — |
| Input DTO（039 T030.5 落地）| `role_id: i64` / `Vec<i64>` 等 | i64 → lookup ULID | i64 (number) | i64 (number) |
| audit_log payload | `roleId: ULID string` | ULID | — | — |
| JWT sub claim | `sub: ULID string` | ULID | — | — |
| Casbin policy | `v0/v1: ULID/role_code string` | ULID/code | — | — |
| FK | sys_user_role.user_id (VARCHAR ULID) | ULID | — | — |
| Snowflake helper（039）| `next_display_id() -> i64` | i64 | — | — |
