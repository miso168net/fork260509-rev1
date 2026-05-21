# Research: W-FW2 — menu-crud-wiring

**Phase**: 0（Outline & Research）
**Date**: 2026-05-22

Brainstorm（`docs/superpowers/032-feature-menu-crud-wiring.md`）已 saturated、1 個釐清（Q1）拍板;Phase 0 對 rust-api + base-web worktree 調查,解 6 個 R-Q（實作定位與值域對映）。

---

## R-Q1: `menuType` / `iconType` / `status` 值域對映

**Question**: base-web modal 送的 `menuType` / `iconType` / `status`（字串 `'1'/'2'`）如何對映後端 domain 值?

**Evidence**:
- `MenuType` enum（`entities/sea_orm_active_enums.rs`）:`Directory`（serde `"directory"`）/ `Menu`（serde `"menu"`）。`MenuInput.menu_type: MenuType` —— native 端期望 `"directory"/"menu"`,**不接受** base-web 的 `'1'/'2'`。
- `MenuInput.icon_type: Option<i32>`。
- `MenuInput.status: Status` enum（`Enabled`/`Disabled`/`Banned`,W-FW1/F030 已知）。
- F7 Output 端既有反向對映函式（`output/sys_system_manage.rs`）:`map_menu_type`（`Directory→"1"` / `Menu→"2"`）、`map_icon_type`（`Some(1)→"1"` / `Some(2)→"2"` / `None→None`）、`map_status`（`Enabled→"1"` / `Disabled→"2"` / `Banned→"2"`+warn）。

**Decision**: transform handler 的 **write 方向**對映表（F7 Output 對映的反向）:

| 欄 | base-web 值 | rust domain 值 |
|---|---|---|
| menuType | `"1"` | `MenuType::Directory` |
| menuType | `"2"` | `MenuType::Menu` |
| iconType | `Some("1")` | `Some(1)` |
| iconType | `Some("2")` | `Some(2)` |
| iconType | `None` / 缺 | `None` |
| status | `"1"` | `Status::Enabled` |
| status | `"2"` | `Status::Disabled` |

非法值防呆（比照 W-FW1 R-Q6）:`menuType` / `status` 非 `"1"/"2"` → 回欄位驗證錯誤 envelope;`iconType` 非 `"1"/"2"` 且非空 → 同樣回驗證錯誤。base-web 正常只送合法值,此為防禦性處理。

**Rationale**: 與 F7 Output 端 `map_*` 對稱、與 W-FW1 `map_status`/`map_gender` 同精神。

---

## R-Q2: `parentId`（number）→ `pid`（String）對映 + root 慣例

**Question**: base-web modal 送 `parentId: number`,後端 `MenuInput.pid: String` —— 型別不同;頂層菜單的 `parentId` 是什麼值?

**Evidence**:
- `MenuInput.pid: String`,validator `#[validate(length(min = 1, max = 50))]` —— pid **不可為空字串**。
- `sys_menu` 表實查 `SELECT DISTINCT pid`:值為 `0` / `52` / `54` —— 頂層菜單 pid = `"0"`,子菜單 pid = 父菜單 id。
- base-web `menu-operate-modal.vue` `createDefaultModel()` 設 `parentId: 0`;`operateType==='addChild'` 時 `Object.assign(model.value, { parentId: <父 id> })`;`edit` 時取 `rowData` 的 parentId。

**Decision**: transform handler 把 `parentId`（number）以 `.to_string()` 轉為 `pid`（String）。頂層菜單:base-web 送 `parentId: 0` → `pid = "0"`（長度 1、通過 `min=1` validator、與 DB 既有 root 慣例一致）。加子菜單 / 編輯:`parentId` 為實際父 id → `pid` 為對應字串。transform 端**統一只做 `.to_string()`**、不需區分 root / child。

**Rationale**: DB 既有 root 慣例即 pid `"0"`;base-web modal 預設 `parentId: 0`,兩者天然對齊,`.to_string()` 一致處理。

---

## R-Q3: `deleteMenu` body-id 變形 handler

**Question**: native `delete_menu` 為 `Path<i32>`（`DELETE /route/:id`），systemManage alias 要收 base-web 的 body payload,如何接?

**Evidence**:
- `sys_menu_api.rs` `delete_menu(Path(id): Path<i32>, ...)` —— 路徑參數版。
- F9 `delete_user_by_body`（`sys_user_api.rs`）已立先例:同 service method、handler 差異只在 extractor（`Json<DeleteUserByBodyInput>` 取代 `Path`）。
- menu id 型別為 `i32`（`UpdateMenuInput.id: i32`、`SystemManageMenuOutput.id: i32`）。

**Decision**: 新增 `DeleteMenuByBodyInput { id: i32 }` DTO（比照 F9 `DeleteUserByBodyInput`）。`deleteMenu` alias handler 收 `Json<DeleteMenuByBodyInput>` → 呼既有 `SysMenuService::delete_menu(id, actor)`。

---

## R-Q4: `batchDeleteMenu` —— native 無批次刪除

**Question**: native menu 無批次刪除端點 / service,batchDeleteMenu 如何實作?

**Evidence**:
- `sys_menu_service.rs` / `sys_menu_api.rs` / `sys_menu_route.rs` 皆**無**批次刪除（只有單筆 `delete_menu`）。
- F9 `batch_delete_users`（`sys_user_api.rs`）已立先例:per-row loop 呼單筆 `delete_user` + `deletedCount` counter、per-row Err `continue`、永遠回 HTTP 200 + `{deletedCount: N}`。

**Decision**: 新增 `BatchDeleteMenuInput { ids: Vec<i32> }` DTO。`batchDeleteMenu` alias handler per-row loop 呼既有 `delete_menu` + `deletedCount` counter（比照 F9 `batch_delete_users`）。菜單為樹狀,但批次刪除**不做額外 cascade**:每筆勾選依 id 獨立軟刪,與單筆 `delete_menu` 行為一致（per spec A-006 / E-4）—— 刪父不刪子產生的孤兒節點為 native 單筆刪除既有行為、非 W-FW2 引入。

---

## R-Q5: systemManage menu 寫入 alias URL 命名 + Casbin seed

**Evidence**:
- F9 user 寫入 alias / W-FW1:`/systemManage/{addUser,updateUser,deleteUser,batchDeleteUser}`（add/update POST、delete/batch DELETE）。
- F9 menu 讀 alias:`/systemManage/getMenuList/v2`、`/systemManage/getMenuTree`。
- menu 寫入 alias 為**全新路徑**,F9 seed（`m20260520_a_f9_system_manage_alias_seed.rs`）只 seed 既有 10 條 alias、無 menu 寫入。
- Casbin seed 體例:F9 / F7 / F8 migration INSERT `casbin_rule` policy row、Soybean ROLE_SUPER + Administrator ROLE_ADMIN allow、`v4=''`（per F11 R-Q5 baseline）。

**Decision**:
- URL 命名比照 W-FW1:`/systemManage/addMenu`（POST）、`/systemManage/updateMenu`（POST）、`/systemManage/deleteMenu`（DELETE）、`/systemManage/batchDeleteMenu`（DELETE）。
- 新增 Casbin policy seed migration（命名比照 F9/F8、`mYYYYMMDD_a_<feat>_seed.rs`）INSERT 4 條新 path 的 policy row、Soybean ROLE_SUPER + Administrator ROLE_ADMIN allow、`v4=''`;register 進 `migration/src/datas/mod.rs` + `lib.rs` Migrator vec。

---

## R-Q6: base-web `request` helper 錯誤呈現

**Evidence**: 沿用 W-FW1 結論 —— `request` helper 回 `{ data, error }`;HTTP 200 + body 業務碼非 0 時 helper 既有錯誤呈現機制（W-FW1 已實機驗證）。

**Decision**: `handleSubmit` / delete handler 檢 `error`,失敗 early return（不關 modal、不誤報、不 refresh）;成功才續行。不改型別、不改 request helper。比照 W-FW1 `user-operate-drawer.vue` / `user/index.vue` 接線寫法。

---

## 補充發現（implement 注意）

- **`UpdateMenuInput` 有 `#[serde(flatten)] menu: MenuInput`**,但 W-FW2 transform handler 在 **Rust 端直接構造** `UpdateMenuInput { id, menu: MenuInput {...} }` —— `flatten` 只影響 JSON 反序列化,不影響 Rust 端結構建構。故 W-FW2 **不需** W-FW1 那種 un-flatten,`UpdateMenuInput` / `sys_menu_service.rs` **零改動**。
- **`MenuType` 未於 `server_service::admin` re-export**（`service/admin/mod.rs:4` 只 re-export `Gender, Status`）。transform handler 在 `sys_system_manage_api.rs` 需 `MenuType` → 比照 W-FW1 對 `Gender`/`Status` 的做法,把 `MenuType` 加入 `service/admin/mod.rs` 的 entity re-export。
- W-FW2 後端**不碰 `sys_menu_service.rs`**（`create_menu`/`update_menu`/`delete_menu` service 原樣重用）。

## Phase 0 完成標誌

- ✅ R-Q1 menuType/iconType/status write 方向對映表（F7 Output 對映反向）
- ✅ R-Q2 parentId→pid `.to_string()`、root pid `"0"`
- ✅ R-Q3 deleteMenu body-id 變形 handler（`DeleteMenuByBodyInput`,比照 F9）
- ✅ R-Q4 batchDeleteMenu per-row loop（`BatchDeleteMenuInput`,比照 F9 batch_delete_users、無 cascade）
- ✅ R-Q5 alias URL 命名 + Casbin seed migration
- ✅ R-Q6 base-web request helper 錯誤呈現（沿用 W-FW1）

**無 spec correction** —— spec 的 Q1（scope out）+ A-001~A-006 假設經 Phase 0 全數確認;關鍵 gotcha:`MenuType` 不接受 `'1'/'2'`（需 transform）、`pid` validator `min=1`（root `"0"` 剛好通過）、`UpdateMenuInput` 不需 un-flatten。
