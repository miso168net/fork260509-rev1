# 032 — W-FW2 menu-crud-wiring（base-web menu CRUD 接線）

**Date**: 2026-05-22
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-22（DESIGN-W-WEBUI 軌道第二個 feature；1 個釐清問題）

> 軌道:**W-WEBUI**（[`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §5.2）。前置 Constitution Principle IV「W-WEBUI 受管例外」（v1.1.0）已落地；W-FW1（031 user-crud-wiring、merge `a09d316`）已確立 W-WEBUI 接線模式,W-FW2 比照。

---

## 緣由

W-WEBUI 軌道把 base-web 管理後台從「看得到、改不了」補成可用 CRUD,切為 4 個 feature。W-FW1（user）已完成。**W-FW2 是第二個 —— base-web `manage/menu` 的 新增 / 編輯 / 加子菜單 modal + 刪除 + 批次刪除接線。**

base-web `example` 分支的 menu 操作現況（2026-05-22 探勘）:
- `menu-operate-modal.vue` 的 `handleSubmit` 是 stub:`console.log` params → 硬編碼成功訊息 → 關 modal,**不打 API**。`getSubmitParams()` 已備好提交參數。`operateType` 有 `add` / `edit` / `addChild` 三值。
- `menu/index.vue` 的 `handleDelete` / `handleBatchDelete` 是 stub:只 `console.log` + `onDeleted()` / `onBatchDeleted()`。
- `service/api/system-manage.ts` 只有 menu 的 GET（`fetchGetMenuList` / `fetchGetMenuTree` / `fetchGetAllPages`），無寫入 function。

rust-api 後端有 native menu 寫入端點（`POST /route` create / `PUT /route` update / `DELETE /route/:id` delete），但 **`/systemManage/` 下目前只有 menu 讀 alias（F9 的 `getMenuList/v2` / `getMenuTree`），無 menu 寫入 alias**。W-WEBUI §5.2 一致性拍板:base-web 三個 manage 模組（user / menu / role）寫入路徑統一走 `/systemManage/`,不走原生 `/route/*`。

### 契約落差盤點（base-web modal `getSubmitParams()` ↔ rust `MenuInput`）

| 欄位 | base-web modal | rust `MenuInput` | 落差 |
|---|---|---|---|
| 菜單類型 | `menuType: '1'/'2'` | `menu_type: MenuType` enum | 值域 |
| 菜單名 | `menuName` | `menu_name` | 欄位名 |
| 路由名 / 路徑 | `routeName` / `routePath` | `route_name` / `route_path` | 欄位名 |
| component | `component` | `component` | ✓（base-web `shared.ts` 已組好） |
| 圖示 | `icon` | `icon` | ✓ |
| 圖示類型 | `iconType: '1'/'2'` | `icon_type: Option<i32>` | 值域 + 型別（string→int） |
| 排序 | `order: number` | `sequence: i32` | 欄位名 |
| 父 id | `parentId: number` | `pid: String` | 欄位名 + 型別（number→string） |
| 狀態 | `status: string` | `status: Status` enum | 值域 |
| i18nKey/keepAlive/constant/href/hideInMenu/activeMenu/multiTab | camelCase | snake_case | 欄位名 |
| pathParam | UI 輔助、不送（已折進 `routePath`） | `path_param: Option<String>` | base-web 不送、後端 Option→None |
| **query** | `query: [string,string][]` | （無欄位） | 後端 `MenuInput` 無對應 |
| **buttons** | `buttons: MenuButton[]` | （無欄位） | 後端 `MenuInput` 無對應 |
| **fixedIndexInTab** | `fixedIndexInTab` | （無欄位） | 後端 `MenuInput` 無對應 |

另:
- native **無批次刪除端點 / service** —— `delete_menu` 只有單筆 `DELETE /route/:id`。W-FW2 的批次刪除需新增 alias。
- menu 寫入 alias 為**全新路徑**,需 Casbin policy seed migration（不像 W-FW1 的 user alias F9 已 seed）。
- `SystemManageMenuOutput`（讀側）的 `buttons` / `fixed_index_in_tab` / `query` 目前已硬回 `None` —— 讀側本就不顯示這 3 欄。

---

## Brainstorm 釐清紀錄（Session 2026-05-22）

- **Q1（`query` / `buttons` / `fixedIndexInTab` 缺欄位）**:base-web modal 送出這 3 欄、後端 `MenuInput` 無對應、無法持久化 → **A: scope out（thin wrapper）**。transform handler 只對映後端 `MenuInput` 既有欄位,base-web-shaped DTO 不宣告這 3 欄,提交時由 serde 自動忽略（比照 W-FW1 `userRoles`）。後端零 schema 改、零 migration（除 Casbin seed），W-FW2 後端分量維持「小」。讀側 Output DTO 本就硬回 `None`,讀寫一致。modal 這 3 個 UI 欄變成擺設（編輯無效果），另立 follow-up（W-FW2-N1）。符合 DESIGN-W-WEBUI §5.2「F9-style thin wrapper 包既有原生 `/route/*`」定調。

> 編號註記:brainstorm 過程中更正了一處 feature 編號 —— W-WEBUI §5 正式切分為 W-FW2 `menu-crud-wiring`（本 feature）、W-FW3 `role-crud-wiring`、W-FW4 `role-authorization-wiring`；W-FW2 與 W-FW3「可平行」,本次依編號順序先做 menu。

---

## Scope summary

W-FW2 = base-web `manage/menu` 的 4 個操作（新增 / 編輯+加子菜單 / 刪除 / 批次刪除）端到端接上 rust-api。前端接線 + 後端 systemManage menu 寫入 alias 轉換層。

| 面向 | deliverable |
|---|---|
| **新增 / 編輯 / 加子菜單** | base-web modal `handleSubmit` 接 `/systemManage/{addMenu,updateMenu}`;後端新增 base-web-shaped input DTO + transform handler（欄位名 / 值域對齊）。`addChild` 與 `add` 同走 addMenu（modal 已把父 id 填進 `parentId`）。 |
| **刪除 / 批次刪除** | base-web `handleDelete` / `handleBatchDelete` 接 `/systemManage/{deleteMenu,batchDeleteMenu}`;後端新增 `deleteMenu`（body-id 變形）+ `batchDeleteMenu`（per-row loop）alias。 |

---

## 設計

### 後端（rust-api worktree）— systemManage menu 寫入 alias 轉換層

- 新增 2 個 base-web-shaped input DTO（置 `model/src/admin/input/sys_menu.rs`,比照 F9 / W-FW1 alias DTO 體例、`#[serde(rename_all = "camelCase")]`）:
  - `SystemManageAddMenuInput`:只宣告後端 `MenuInput` 能接的欄位（`menuType` / `menuName` / `routeName` / `routePath` / `component` / `icon` / `iconType` / `order` / `parentId` / `status` / `i18nKey` / `keepAlive` / `constant` / `href` / `hideInMenu` / `activeMenu` / `multiTab`）;`query` / `buttons` / `fixedIndexInTab` 不宣告 → serde 自動忽略（Q1）。
  - `SystemManageUpdateMenuInput`:同上 + `id: i32`。
- 新增 transform handler `add_menu_for_systemmanage` / `update_menu_for_systemmanage`（置 `api/src/admin/sys_system_manage_api.rs`,比照 F9 / W-FW1 體例）:base-web 形狀 → 後端 `CreateMenuInput`（= `MenuInput`）/ `UpdateMenuInput`（= `{id, menu}` 巢狀,**不需 W-FW1 那種 un-flatten**）。
  - `parentId`(number)→`pid`(String)、`order`→`sequence`、camelCase→snake_case 直對
  - `iconType` `'1'/'2'` → `icon_type` `Option<i32>`、`menuType` `'1'/'2'` → `MenuType` enum、`status` → `Status` enum;非法值回驗證錯誤 envelope
  - `path_param`:base-web 不送 → `None`
  - → 呼既有 `create_menu` / `update_menu` service（audit / soft delete 既有路徑沿用）
- `deleteMenu` alias:body-id 變形 handler（native `delete_menu` 是 `Path<i32>`，需 body `{id}` handler,比照 F9 `delete_user_by_body`）→ 呼既有 `delete_menu`。
- `batchDeleteMenu` alias:body `{ids: number[]}` → per-row loop 呼 `delete_menu` + counter（比照 F9 `batch_delete_users`）。
- route:`sys_system_manage_route.rs` 新增 4 條 mount（`addMenu` POST / `updateMenu` POST / `deleteMenu` DELETE / `batchDeleteMenu` DELETE）+ 對應 `RouteInfo`。
- **Casbin policy seed migration**:menu 寫入 alias 為全新路徑,新增 migration INSERT policy row（Soybean ROLE_SUPER + Administrator ROLE_ADMIN allow、GeneralUser default deny,比照 F9 / F7 / F8 seed 體例）。
- **無 `sys_menu` schema 改、無 entity 改** —— 純 alias 轉換層。

### 前端（base-web worktree）

- `service/api/system-manage.ts` 補 `fetchAddMenu` / `fetchUpdateMenu` / `fetchDeleteMenu` / `fetchBatchDeleteMenu` —— 薄 `request()`、直送 modal `getSubmitParams()` 結果（值轉換在後端）。
- `menu-operate-modal.vue` `handleSubmit` —— 依 `operateType` 呼 add / update（`add` / `addChild` → addMenu;`edit` → updateMenu）;檢 `error`,失敗顯示後端 envelope 訊息、不關 modal、不誤報;成功 emit 觸發列表 refresh。
- `menu/index.vue` `handleDelete` → `fetchDeleteMenu({ id })`;`handleBatchDelete` → `fetchBatchDeleteMenu({ ids: checkedRowKeys })`;error guard、成功才 `onDeleted()` / `onBatchDeleted()`。
- 不動型別定義、表格 render、`shared.ts`、`src/router` / `src/store`、i18n key、UI 樣式（W-WEBUI §4 邊界）。

### 錯誤處理

- `request` helper 回 `{ data, error }`;`handleSubmit` / delete handler 檢 `error`,失敗顯示後端 envelope `msg`、不關 modal / 不 refresh。
- modal 既有 `validate()` 必填驗證維持。

### 測試 / 驗收

- **CDP**（`127.0.0.1:9229`）:走訪 `/manage/menu` —— 新增頂層菜單、加子菜單、編輯、單筆刪除、批次刪除,每步驟確認列表 / 動態 menu refresh + 無 console error;錯誤路徑（重複 routeName 等）確認 modal 不關。
- **curl**:直打 4 個 menu 寫入 alias 端點驗 envelope。
- **psql**:驗 create / update 落 `sys_menu`、delete 為 soft delete（`deleted_at` 標記、row 留表）、audit log 同步寫入、Casbin policy seed row 落 DB。

### Commit 模型

W-FW2 同時動 base-web + rust-api 兩個 worktree:
- Stage 1a — rust-api worktree commit（alias DTO + transform handler + route + Casbin seed migration）
- Stage 1b — base-web worktree commit（service function + handleSubmit + delete handler）
- Stage 2 — outer commit（兩個 SHA pin + spec docs）

（W-WEBUI §6「兩 worktree」情形;push 等 user 同意。）

### Constitution Check（初判）

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | PASS | 新 alias path 由新 Casbin seed migration 補 policy、enforcement 自動沿用 |
| II | Soft Delete + Audit | PASS | delete 走既有 `delete_menu` soft-delete service;create / update 既有 audit hook 沿用 |
| III | 嚴版禁 Forward | PASS | 單後端、無服務間 forward |
| IV | base 不改動邊界 | **PASS（W-WEBUI 受管例外）** | W-FW2 修改 base-web `system-manage.ts` + `menu-operate-modal.vue` handleSubmit + `menu/index.vue` delete handler,全在 constitution v1.1.0「W-WEBUI 受管例外」+ DESIGN-W-WEBUI §4 受控範圍內 |
| V | 漸進收縮 | N/A | DESIGN-B 形態 |

---

## 範圍外

- ❌ **`query` / `buttons` / `fixedIndexInTab` 持久化**（Q1 拍板 scope out）—— 後端 `MenuInput` 無對應欄位,W-FW2 提交時被後端忽略。完整持久化需擴 `sys_menu` schema + entity + Output DTO,另立 follow-up（W-FW2-N1）。已登 INTEGRATION-CHECKLIST「Deferred / future backlog」。
- ❌ base-web 型別 / render / router / store / `shared.ts` 改動。
- ❌ role 模組接線（W-FW3 範疇）、角色授權（W-FW4 範疇）。
- ❌ nestjs fork 改動（DESIGN-B 形態、nestjs 已退場）。

---

## 待 `/speckit-specify` 後續釐清（brainstorm 已 saturated、列為 research 點）

- **R-1**:`menuType` / `iconType` / `status` 值域對映的確切值 —— 對 rust `MenuType` enum 定義 + F7 既有 `map_menu_type` / `map_icon_type`（Output 端反向對映）調查,確認 write 端對映表（`'1'/'2'` ↔ enum / i32）。
- **R-2**:`parentId` 頂層菜單值 —— base-web 頂層菜單送 `parentId` 為何值（`0`?），對映 `pid: String`（`"0"`?）；Phase 0 對 `sys_menu` root 慣例調查。
- **R-3**:`deleteMenu` body-id 變形 handler —— native `delete_menu` 為 `Path<i32>`,需確認 body `{id}` DTO（比照 F9 `DeleteUserByBodyInput`）。
- **R-4**:`batchDeleteMenu` per-row loop 行為 —— menu 為樹狀,批次刪除若含父不含子（或反之）→ 沿用 native 單筆 `delete_menu` 無 cascade 行為（與單筆刪除一致、pre-existing）;確認不需額外 cascade 邏輯。
- **R-5**:menu 寫入 alias 的 systemManage URL 命名（`addMenu` / `updateMenu` / `deleteMenu` / `batchDeleteMenu`,比照 W-FW1 `addUser` 等）+ HTTP method（add/update POST、delete/batch DELETE）+ Casbin seed 的角色範圍（比照 F7 `/route/*` admin path seed 與 F9 alias seed）。
- **R-6**:base-web `request` helper 對「HTTP 200 + body `code≠0`」的錯誤呈現慣例 —— 沿用 W-FW1 既有結論,確認 `handleSubmit` 失敗訊息走既有 base-web error 機制、無需動型別。
