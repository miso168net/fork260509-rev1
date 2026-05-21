# Data Model: W-FW2 — menu-crud-wiring

**Phase**: 1（Design & Contracts）
**Date**: 2026-05-22

本 feature **不動 `sys_menu` schema**（無 schema migration）;唯一 DB 變動為 Casbin policy seed。「data model」此處為**變更模型** —— 6 組元件、每組精確改動。後端 rust-api worktree（E1-E4）+ 前端 base-web worktree（E5-E6）。

| # | 元件 | 位置 | worktree | 性質 |
|---|---|---|---|---|
| E1 | 4 個 alias input DTO | `model/src/admin/input/sys_menu.rs` + `input/mod.rs` | rust-api | 改 |
| E2 | 4 個 transform handler + 對映 helper | `api/src/admin/sys_system_manage_api.rs` + `service/src/admin/mod.rs` | rust-api | 改 |
| E3 | 4 條 menu 寫入 alias route | `router/src/admin/sys_system_manage_route.rs` | rust-api | 改 |
| E4 | Casbin policy seed migration | `migration/src/datas/` + `mod.rs` + `lib.rs` | rust-api | 新建 + 改 |
| E5 | 4 個寫入 service function | `base-web/src/service/api/system-manage.ts` | base-web | 改 |
| E6 | handleSubmit + delete handler 接線 | `menu-operate-modal.vue` + `menu/index.vue` | base-web | 改 |

---

## E1: alias input DTO（改、`input/sys_menu.rs`）

新增 4 個 base-web-shaped DTO（`#[serde(rename_all = "camelCase")]`、比照 F9 / W-FW1 alias DTO 體例）:

```rust
// 建立 / 編輯共用欄位形狀（base-web modal getSubmitParams 形狀）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageAddMenuInput {
    pub menu_type: String,            // "1"/"2"  → MenuType
    pub menu_name: String,
    pub route_name: String,
    pub route_path: String,
    pub component: String,
    pub order: i32,                   // → sequence
    pub i18n_key: Option<String>,
    pub icon: Option<String>,
    pub icon_type: Option<String>,    // "1"/"2"  → Option<i32>
    pub status: String,               // "1"/"2"  → Status
    pub parent_id: i32,               // → pid（String）
    pub keep_alive: Option<bool>,
    pub constant: bool,
    pub href: Option<String>,
    pub hide_in_menu: Option<bool>,
    pub active_menu: Option<String>,
    pub multi_tab: Option<bool>,
    // query / buttons / fixedIndexInTab 不宣告 → serde 自動忽略（spec Q1）
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageUpdateMenuInput {
    pub id: i32,
    // ...與 SystemManageAddMenuInput 相同 17 欄...
}

// deleteMenu body-id 變形（native delete_menu 為 Path<i32>，比照 F9 DeleteUserByBodyInput）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMenuByBodyInput {
    pub id: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteMenuInput {
    pub ids: Vec<i32>,
}
```

4 個 DTO 於 `input/mod.rs` re-export（比照既有 `input::{...}` re-export 鏈,使可由 `server_service::admin::` 引用）。`MenuInput` / `CreateMenuInput` / `UpdateMenuInput` **不變**（W-FW2 不需 un-flatten —— transform handler 在 Rust 端直接構造 `UpdateMenuInput`,`#[serde(flatten)]` 只影響 JSON 反序列化、不影響結構建構,per research 補充發現）。

---

## E2: transform handler + 對映 helper（改、`sys_system_manage_api.rs`）

新增 4 個 transform handler 至 `impl SysSystemManageApi`（比照 F9 / W-FW1 `*_for_systemmanage` 體例,extractor:`Extension<Arc<SysMenuService>>` + `Extension<User>` + `Json<...>`）:

```text
add_menu_for_systemmanage:
  收 SystemManageAddMenuInput → 轉 CreateMenuInput（= MenuInput）:
    menu_type    = map_menu_type(&input.menu_type)?      // "1"→Directory / "2"→Menu
    menu_name    = input.menu_name
    icon_type    = map_icon_type(input.icon_type)?       // Some("1")→Some(1) / Some("2")→Some(2) / None→None
    icon         = input.icon
    route_name   = input.route_name
    route_path   = input.route_path
    component    = input.component
    path_param   = None
    status       = map_status(&input.status)?            // 重用 W-FW1 既有 map_status
    active_menu  = input.active_menu
    hide_in_menu = input.hide_in_menu
    pid          = input.parent_id.to_string()           // 0→"0" root（per research R-Q2）
    sequence     = input.order
    i18n_key / keep_alive / constant / href / multi_tab  = 直對
  → 呼既有 SysMenuService::create_menu(input, &actor)

update_menu_for_systemmanage:
  收 SystemManageUpdateMenuInput → 轉 UpdateMenuInput { id, menu: MenuInput {...同上對映...} }
  → 呼既有 SysMenuService::update_menu(input, &actor)

delete_menu_for_systemmanage:
  收 Json<DeleteMenuByBodyInput> → 呼既有 SysMenuService::delete_menu(input.id, &actor)

batch_delete_menu_for_systemmanage:
  收 Json<BatchDeleteMenuInput> → per-row loop 呼 delete_menu + deletedCount counter
  → 回 Res::new_data(json!({ "deletedCount": n }))（比照 F9 batch_delete_users）
```

**對映 helper**:
- `map_status` —— **重用 W-FW1 已在本檔新增的私有 fn**（`"1"→Enabled` / `"2"→Disabled` / 其他→驗證錯誤 envelope）。
- `map_menu_type(&str) -> Result<MenuType, AppError>` —— 新增（`"1"→Directory` / `"2"→Menu` / 其他→驗證錯誤）。
- `map_icon_type(Option<&str>) -> Result<Option<i32>, AppError>` —— 新增（`None→None` / `Some("1")→Some(1)` / `Some("2")→Some(2)` / 其他→驗證錯誤）。

`MenuType` 需可由 `sys_system_manage_api.rs` 引用 —— 加入 `service/src/admin/mod.rs` 的 entity re-export（現只 re-export `Gender, Status`,比照 W-FW1 做法補 `MenuType`）。

回應 envelope 沿用既有 `create_menu` / `update_menu` 回的 model（F4 路線 II `Res`）。

---

## E3: menu 寫入 alias route（改、`sys_system_manage_route.rs`）

`Router::new()` chain 新增 4 條 route + `routes` vec 新增 4 個 `RouteInfo`:

```text
.route("/addMenu",         post(SysSystemManageApi::add_menu_for_systemmanage))
.route("/updateMenu",      post(SysSystemManageApi::update_menu_for_systemmanage))
.route("/deleteMenu",      delete(SysSystemManageApi::delete_menu_for_systemmanage))
.route("/batchDeleteMenu", delete(SysSystemManageApi::batch_delete_menu_for_systemmanage))
```

既有 menu 讀 alias（`getMenuList/v2`、`getMenuTree`、`getAllPages`）+ user alias **不動**。`RouteInfo` 命名比照既有體例（menu_service、中文描述）。

---

## E4: Casbin policy seed migration（新建）

menu 寫入 alias 為全新路徑,需補 Casbin policy。新增 migration（命名比照 F9 `m20260520_a_f9_system_manage_alias_seed.rs` / F8 慣例,`mYYYYMMDD_a_<feat>_seed.rs`）:

- INSERT `casbin_rule` policy row —— 4 條新 path（`/systemManage/{addMenu,updateMenu,deleteMenu,batchDeleteMenu}`）× allow 對象;Soybean ROLE_SUPER + Administrator ROLE_ADMIN allow;`v4=''`（per F11 R-Q5 baseline）。GeneralUser 不 seed → default deny。
- migration 內含 scope-limited 反向 DELETE（`down` / 冪等,比照 F9 seed 體例）。
- register:`migration/src/datas/mod.rs` 加 mod、`migration/src/lib.rs` Migrator vec 末端加。

**無 `sys_menu` schema 改、無欄位改** —— 唯一 DB 變動為此 Casbin seed。

---

## E5: base-web 寫入 service function（改、`system-manage.ts`）

比照 W-FW1 `fetchAddUser` 等體例新增 4 個:

```ts
export function fetchAddMenu(data: ...) {
  return request({ url: '/systemManage/addMenu', method: 'post', data });
}
export function fetchUpdateMenu(data: ...) {
  return request({ url: '/systemManage/updateMenu', method: 'post', data });
}
export function fetchDeleteMenu(data: { id: ... }) {
  return request({ url: '/systemManage/deleteMenu', method: 'delete', data });
}
export function fetchBatchDeleteMenu(data: { ids: ... }) {
  return request({ url: '/systemManage/batchDeleteMenu', method: 'delete', data });
}
```

`data` 直送 modal `getSubmitParams()` 結果（含 base-web 形狀、`query`/`buttons`/`fixedIndexInTab` 一併送出、由後端 DTO serde 忽略）;值轉換在後端 E2。型別以既有 `Api.SystemManage.Menu` 衍生,**不新增 / 不改 `src/typings`**（W-WEBUI §4）。

---

## E6: base-web handleSubmit + delete handler（改）

**E6-a `menu-operate-modal.vue` `handleSubmit`**:

```text
（既有 validate + getSubmitParams() 保留）
const params = getSubmitParams()
const { error } = props.operateType === 'edit'
  ? await fetchUpdateMenu({ ...params, id: props.rowData!.id })
  : await fetchAddMenu(params)          // 'add' 與 'addChild' 同走 addMenu
                                        //（addChild 時 params.parentId 已是父 id）
if (error) return                       // 不關 modal、不誤報
window.$message?.success(...)
closeModal()
emit('submitted')                       // 觸發列表 refresh
```

**E6-b `menu/index.vue`**:

```text
async function handleDelete(id) {
  const { error } = await fetchDeleteMenu({ id })
  if (error) return
  onDeleted()                // useTableOperate 內建:成功訊息 + 列表 refresh
}
async function handleBatchDelete() {
  const { error } = await fetchBatchDeleteMenu({ ids: checkedRowKeys.value })
  if (error) return
  onBatchDeleted()
}
```

不動型別、表格 `columns` render、`shared.ts`、router、store、i18n（W-WEBUI §4）。modal 的 `query` / `buttons` / `fixedIndexInTab` 欄位維持顯示、`getSubmitParams()` 仍輸出 —— 送出後由 E1 後端 DTO serde 忽略（Q1 範疇外）。

---

## 變更後 data flow

```
base-web /manage/menu
  ├─ 新增/編輯/加子菜單 modal handleSubmit
  │    └─ fetchAddMenu / fetchUpdateMenu  → POST /api/systemManage/{addMenu,updateMenu}
  │         └─ rust transform handler（E2）: base-web shape → CreateMenuInput/UpdateMenuInput
  │              └─ create_menu / update_menu → sys_menu 寫入 + audit_log（同 txn）
  └─ 列表 handleDelete / handleBatchDelete
       └─ fetchDeleteMenu / fetchBatchDeleteMenu → DELETE /api/systemManage/{deleteMenu,batchDeleteMenu}
            └─ delete_menu（單筆 / per-row loop）→ soft delete + audit

回應:F4 路線 II envelope { code, data, msg, success }
  ├─ code 0 → base-web 成功訊息 + 列表 refresh
  └─ code≠0 → base-web 既有錯誤呈現、modal 不關
```

---

## Data Model 完成標誌

- ✅ E1 4 個 alias DTO（Add/Update/DeleteByBody/BatchDelete）+ re-export;`MenuInput`/`UpdateMenuInput` 不變
- ✅ E2 4 個 transform handler + `map_menu_type`/`map_icon_type` 新增 + `map_status` 重用 + `MenuType` re-export
- ✅ E3 4 條 menu 寫入 alias route + RouteInfo
- ✅ E4 Casbin policy seed migration（唯一 DB 變動、無 schema 改）
- ✅ E5 base-web 4 個寫入 service function
- ✅ E6 base-web handleSubmit + delete handler 接線
- ✅ 無 `sys_menu` schema 改、無 base-web 型別 / render / router / store / `shared.ts` 改、不動 nestjs;`sys_menu_service.rs` 零改動

**Constitution Re-check（post data-model）**:E1-E6 確認 —— base-web 改動限 §4 受控範圍（IV W-WEBUI 例外);新 alias path 由 E4 Casbin seed 補 policy（I);delete 走既有 soft-delete service、create/update 既有 audit hook（II);無服務間 forward（III);DESIGN-B 形態（V N/A）。**4 PASS / 1 N/A / 0 violation 維持**。
