# W-FW7 menu-field-persistence — brainstorm spec-design

**Feature 編號**：036（spec-kit 階段 A 起手取得 `specs/036-menu-field-persistence/`）
**短名**：`menu-field-persistence`
**軌道**：W-WEBUI follow-up（W-FW5 之後第二個;W-WEBUI follow-up 軌道剩 W-FW6）
**Brainstorm 日期**：2026-05-23
**Source 整併項**：W-FW2-N1（feature 032 menu-crud-wiring 切為 follow-up 的 menu `query` / `buttons` / `fixedIndexInTab` 持久化）

**Authoritative parents**：
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.2.0，列舉含 `W-FW1`–`W-FW7`、准動範圍含「§4 授權下最小 UI 新增」）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §7.3 W-FW7 + §4 base-web 修改範圍邊界。
- W-FW2 `menu-crud-wiring`（032，merge `8ccc4b4`）：本 feature 補完 W-FW2 當時切為 follow-up 的 W-FW2-N1。

---

## 1. 範疇

補完 W-FW2-N1 —— 讓 base-web menu modal 已有的 `query` / `buttons` / `fixedIndexInTab` 三欄真正持久化並讀回；`sys_menu` schema 擴充 + 寫入/讀出雙向接通。

| 面向 | deliverable |
|---|---|
| **持久化** | `sys_menu` 加 3 個 nullable 欄位（`query` jsonb / `buttons` jsonb / `fixed_index_in_tab` integer）；現有 menu row 不受影響。 |
| **寫入 round-trip** | base-web menu modal 送出的 `query` / `buttons` / `fixedIndexInTab` 經 `/systemManage/{addMenu, updateMenu}` 透傳至 native menu service、寫入新 3 欄。 |
| **讀出 admin CRUD** | `getMenuList` 經 `SystemManageMenuOutput` 回傳真值（取代既有硬寫 `None`）；編輯 modal 預填正確。 |
| **讀出 runtime route** | `getUserRoutes` / `getConstantRoutes` 的 `MenuRoute.RouteMeta` 加 `query` + `fixedIndexInTab` 兩欄；`buttons` **不**進此路徑（屬 admin metadata，runtime 按鈕權限由 W-FW6 button-auth + `getUserInfo.buttons` 承擔）。 |

### 範疇外

- ❌ menu CRUD 其他既有行為（W-FW2 已接、不重做）。
- ❌ W-FW6 的 button-auth 指派（menu.buttons 是定義，role-button 指派是 W-FW6）。
- ❌ base-web 型別定義 `src/typings` 改動（`Api.SystemManage.Menu` 已透過 `MenuPropsOfRoute` 宣告 `query`/`fixedIndexInTab`、頂層宣告 `buttons` —— §7.3 open question 解決）。
- ❌ nestjs fork 改動（DESIGN-B、nestjs 已退場）。
- ❌ `sys_menu` 其他結構變更。

---

## 2. Brainstorm 拍板紀錄（2026-05-23）

### Q1 — 「讀」範疇

**A：(a)+(b) 兩條讀路徑都接。** SystemManageMenuOutput 填真值（admin 編輯 round-trip）+ MenuRoute/RouteMeta 加 query/fixedIndexInTab（runtime 動態路由生效）—— 「完整可用」標準，設定的值在 runtime 真正生效。

### Q2 — buttons 欄位讀取範疇

**A：buttons 只做 admin CRUD round-trip、不進 runtime route 輸出。** `buttons` 在前端 `Menu` 型別是頂層欄位、不在 `RouteMeta`；runtime 按鈕權限走 `getUserInfo.buttons` 不是路由 meta。menu.buttons 的 runtime 消費由 W-FW6 button-auth 承擔，符合 soybean 架構。

### 儲存模型（架構選擇）

**方案 1：`sys_menu` 加 3 欄、query/buttons 用 JSONB**（採用）。理由：additive 低風險、對映資料的自然形狀、與既有 `SystemManageMenuOutput` 已宣告的 `serde_json::Value` 型別零摩擦、JSONB 在 codebase 已有先例（audit log payload）。

**方案 2：正規化子表**（否決）。`sys_menu_button` / `sys_menu_query` 對「永遠嵌在 menu 裡、不被獨立查詢」的小清單沒有實益，只增加成本（多張表 migration + entity + delta 寫入邏輯，比照 W-FW5 `sys_user_role`）。YAGNI。

**方案 3：單一 `meta` JSON blob**（否決）。3 個值合存一個 jsonb 欄太鬆 —— `fixedIndexInTab` 是純量、跟陣列混存失去 schema 清晰度，entity / DTO 對映變模糊。

---

## 3. 設計

### 3.1 DB Schema（migration）

新 schema migration in `rust-api/migration/src/schemas/m<timestamp>_add_menu_fields_to_sys_menu.rs`（timestamp 晚於現有最大），`sys_menu` 加 3 欄、全 nullable：

| 欄位 | 型別 | nullable |
|---|---|---|
| `query` | `jsonb` | yes |
| `buttons` | `jsonb` | yes |
| `fixed_index_in_tab` | `integer` | yes |

含對稱 down migration（drop 3 欄）、register `migration/src/lib.rs` 末端。

Sea-ORM `sys_menu` entity Model 同步加 3 欄：`query: Option<Json>` / `buttons: Option<Json>` / `fixed_index_in_tab: Option<i32>`（型別與 codebase 既有 jsonb 欄位慣例對齊）。

### 3.2 寫入路徑

- **native `MenuInput`**（`server/model/src/admin/input/sys_menu.rs`）：加 3 欄 `query: Option<serde_json::Value>` / `buttons: Option<serde_json::Value>` / `fixed_index_in_tab: Option<i32>`。
- **transform DTO**（同檔 / `server/model/src/admin/input/` 對應檔的 systemManage 區段）：`SystemManageAddMenuInput` / `SystemManageUpdateMenuInput` 加同 3 欄（serde camelCase 收 `query` / `buttons` / `fixedIndexInTab`）。
- **transform handler**（`server/api/src/admin/sys_system_manage_api.rs` 的 menu add/update）：3 欄從 systemManage input 對映進 native `MenuInput`。
- **menu service** create/update（`server/service/src/admin/sys_menu_service.rs`）：3 欄寫進同一筆 `sys_menu` ActiveModel —— 單次寫入、同 transaction。
- **audit**：既有 menu create/update audit 路徑自動涵蓋新 3 欄（audit snapshot 對 `sys_menu` 序列化所有欄）—— 無新 audit 邏輯。

### 3.3 讀出路徑 — admin CRUD

- **`SystemManageMenuOutput`**（`server/model/src/admin/output/sys_system_manage.rs`）：3 欄已宣告（W-FW2 時預留），改 `From<MenuTree>` 從 `MenuTree` 對映真值（取代硬寫 `None`）。
- **`MenuTree`** / menu list 查詢：把 `sys_menu` entity 的 3 欄帶進來，供 `From<MenuTree>` 對映。
- 既有 `getMenuList` / systemManage menu list handler 無新邏輯，單純讓 `SystemManageMenuOutput` 帶真值。

### 3.4 讀出路徑 — runtime 動態路由

- **`RouteMeta`**（`server/model/src/admin/output/sys_menu.rs`）加 2 欄（**僅** `query` + `fixedIndexInTab`，不加 `buttons`）：
  - `query: Option<serde_json::Value>`、`fixed_index_in_tab: Option<i32>`，皆 `#[serde(skip_serializing_if = "Option::is_none")]`（向後相容、舊客戶端不受影響）。
- **`MenuRoute`** 組裝（`getUserRoutes` 路徑、自動帶到 `getConstantRoutes` 因共用 DTO）填上 2 欄。

### 3.5 base-web

**預期 0 改動**（W-FW7 = 純後端 feature）。依 brainstorm 探索：

- `Api.SystemManage.Menu` 已透過 `MenuPropsOfRoute` 宣告 `query`/`fixedIndexInTab`、頂層宣告 `buttons` —— §4 `src/typings` 不需動。
- `menu-operate-modal.vue` 的 `Model` 已含 3 欄、`createDefaultModel` 已初始化、`getSubmitParams()` 已送出 —— 寫入零摩擦。
- 編輯模式 `Object.assign(rowData)` 預填 —— 後端現會回真值、Model 已對應、預填自然 round-trip。

**Phase 0 verify（交由 spec-kit `/speckit-plan` research）**：
- (V1) modal UI 是否實際 render 這 3 欄的輸入元件（含 buttons 的 `{code,desc}[]` 編輯 UI、query 的 `{key,value}[]` 編輯 UI、fixedIndexInTab 的 number input）。
- (V2) 編輯預填在 query/buttons 為 `null`（既有 menu row 未填）時行為是否合理（Model 期待 `[]`、Object.assign 對 null 的處理）。

若 V1 / V2 驗證後發現需微調，**限於 `menu-operate-modal.vue` 單檔**（§4 准動清單內，W-FW2 已動過此檔）。任一第 2 檔改動需升 spec open question。

### 3.6 Constitution 對齊

| Principle | 結論 |
|---|---|
| I RBAC Fail-safe | 不改 auth；3 個欄位無權限語意（buttons 的權限消費由 W-FW6 處理）。 ✅ |
| II Audit | menu create/update 既有 audit 路徑自動涵蓋新 3 欄。 ✅ |
| III 單一進程 | rust 單 owner、無跨服務呼叫。 ✅ |
| IV base 邊界 | W-WEBUI follow-up 軌道（v1.2.0 列舉含 W-FW7）、§4 受管例外；預期 base-web 0 改動，若需微調限於 `menu-operate-modal.vue`（§4 准動清單）。 ✅ |
| V 漸進收縮 | 0 nestjs；DB schema 變更 = 本 feature 唯一被授權的 schema 擴充（W-FW2-N1 既有 follow-up 範疇）。 ✅ |

---

## 4. Testing / Acceptance 概述

無新單元測試（wiring/schema 類 feature，比照 W-FW1~W-FW5；密碼/permission 無關、無新純函式可測；正確性由 acceptance 覆蓋）。C-V acceptance 矩陣的細節由 spec-kit `contracts/verification-commands.md` 階段撰寫；本檔僅列骨架：

- **C-V build / migration**：rust-api + base-web image build、dev stack `up -d --wait`、新 migration 套用乾淨、down migration 對稱可回退。
- **C-V 寫入**：curl `POST /api/systemManage/addMenu` 帶 `query` / `buttons` / `fixedIndexInTab` → envelope 成功；psql 查 `sys_menu` 3 欄持久化（值對得上送出形狀）。curl `updateMenu` 改 3 欄 → psql delta 正確。
- **C-V 讀出 admin**：curl `GET /api/systemManage/getMenuList` → 回傳 menu 含真實 `query` / `buttons` / `fixedIndexInTab`（取代既有 `null`）。
- **C-V 讀出 runtime route**：curl `GET /api/route/getUserRoutes` → 對應 menu 的 `meta.query` / `meta.fixedIndexInTab` 反映真值；`meta.buttons` **不**出現（刻意，Q2）。
- **C-V CDP**：`/manage/menu` 開編輯 modal → 預填 → 調整 3 欄送出 → 再開、值一致；新增 menu 帶 3 欄 → 列表/編輯 round-trip。
- **C-V regression**：menu 既有欄位 CRUD 行為不退化（routeName / parentId / status / icon 等）；動態 menu 載入正常。
- **C-V scope diff**：rust-api 改動限於 plan 列出的元件；base-web 0 改動或最多 `menu-operate-modal.vue` 單檔（含理由）；0 nestjs；`sys_menu` 僅 3 欄擴充、無其他 schema 變更。

---

## 5. 給 `/speckit-specify` 的提示

本檔作為 `/speckit-specify` 的輸入產出 `specs/036-menu-field-persistence/spec.md`。需被帶上的關鍵點：

- 範疇與範疇外（§1）—— 特別 Q2 的 `buttons` not in runtime route。
- 2 個 brainstorm 拍板（§2 Q1 / Q2）—— spec.md `## Clarifications` 段。
- Constitution v1.2.0 W-WEBUI 軌道受管例外（含 W-FW7）—— Authoritative parents。
- W-FW2 父 feature merge SHA（`8ccc4b4`）—— inbound dependency。
- base-web Phase 0 verify 項（V1 / V2）—— spec.md Assumptions A-00X（待 plan Phase 0 釐清）。
- 後端多元件（migration / entity / native input DTO / transform input DTO / transform handler / menu service / SystemManageMenuOutput From / MenuTree / RouteMeta / MenuRoute 組裝，~10 處）/ base-web 0~1 檔 —— Project Structure 雛形。

`/speckit-plan` Phase 0 research 需處理：V1 / V2 兩項 base-web verify、JSONB 欄位在 codebase 既有慣例查證（找一個既有 jsonb 欄位的 entity 寫法當體例）。

---

**brainstorm 完成 → 下一步 `/speckit-specify`,input = 本檔。**
