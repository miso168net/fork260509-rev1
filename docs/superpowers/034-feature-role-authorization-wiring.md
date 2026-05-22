# W-FW4 `role-authorization-wiring` — brainstorm / spec-design

**Date**: 2026-05-22
**Feature**: W-FW4（spec `034`）`role-authorization-wiring`
**Track**: W-WEBUI（base-web 管理後台 CRUD 接線）第四個、也是最後一個 feature

**Authoritative parents**:
- `docs/INTEGRATION-DESIGN-W-WEBUI.md` §5.4 W-FW4 + §4 base-web 修改範圍邊界
- `.specify/memory/constitution.md` Principle IV「base 不改動邊界」受管例外 — W-WEBUI 軌道
- W-FW1 `user-crud-wiring`（031、merge `a09d316`）/ W-FW2 `menu-crud-wiring`（032、merge `8ccc4b4`）/ W-FW3 `role-crud-wiring`（033、merge `729dbf9`）—— 接線模式 precedent

---

## 範疇

base-web `manage/role` 的 **角色菜單授權**接上 rust-api —— `menu-auth-modal.vue` 的菜單樹勾選送出，授權寫入 `sys_role_menu`，該角色下次取動態 menu 時反映變更。

**範疇內**：`menu-auth-modal.vue` 的 `getChecks`（角色已授權 menu ids）、`handleSubmit`（儲存菜單授權）。`getTree`（`fetchGetMenuTree`）已是真 API、不動。

**範疇外**：
- `button-auth-modal.vue` —— rust-api **無「按鈕」model**（`MenuType` 只有 Directory/Menu、無 Button），最接近的 `sys_endpoint` API 權限與 base-web modal 顯示的 `{id,label,code}` UI 按鈕語意不同 → 獨立 follow-up **W-FW4-N1**。modal 維持原樣。
- `menu-auth-modal.vue` 的角色首頁選單（`getHome` / `updateHome`）—— 每角色首頁目前 hardcode `"home"`、無後端儲存，持久化需 `sys_role` schema 改動 → 獨立 follow-up **W-FW4-N2**。modal 內 home 選單維持 upstream stub 原樣（不碰 UI/render，守 W-WEBUI §4 邊界）。
- `role-operate-drawer.vue`（modal 宿主）不碰。

---

## brainstorm 拍板

**Q1（W-FW4 子功能範疇）** — research 發現 menu-auth-modal 牽涉的 3 塊後端就緒度差異大：菜單授權後端全就緒；按鈕授權 rust-api 無對應 model；角色首頁無後端儲存。三選項：(a) 只做菜單授權、(b) 菜單 + 按鈕授權（按鈕映射 `sys_endpoint`）、(c) 三塊全做（含 schema 改）。

→ **拍板 (a) 只做菜單授權**。比照 W-FW1/W-FW2/W-FW3 的最小、後端就緒、測得動 scoping 紀律。按鈕授權與角色首頁各自登 follow-up（W-FW4-N1 / W-FW4-N2）。

**Q2（接線方式）** — research 發現一個不對稱：讀端點 `GET /route/auth-route/:roleId` 的 handler 已自 JWT actor 取 domain（base-web 可直呼）；寫端點 `POST /authorization/assign-routes` 的 `domain` 在 request body（base-web 無 domain）。三選項：(A) 統一 `/systemManage/` alias（讀+寫）、(B) 原生讀 + 單一寫 alias、(C) 零後端、base-web 自帶 domain。

→ **拍板 (A) 統一 `/systemManage/` alias**。與 W-FW3 FR-014「base-web role 操作統一經 `/systemManage/`」一致；domain 注入留伺服器端（base-web 永不碰 domain）；Casbin seed pattern 與 W-FW3 E5 完全相同。多一條讀 alias 為 thin passthrough、成本極低。

---

## 設計

### rust-api worktree — 比照 W-FW3 E1–E4 體例

**E1 — alias input DTO**（`model/src/admin/input/` + `mod.rs`）

base-web-shaped 寫入 DTO（`#[derive(Debug, Deserialize)]` + `#[serde(rename_all = "camelCase")]`）：
- `AssignRoleMenusInput { role_id: String, menu_ids: Vec<i32> }`

讀 alias 走 path param（`roleId`）、無 body DTO。`role_id` 為字串（沿 W-FW3 R-Q2：role id runtime 為 ULID 字串）；`menu_ids` 為真 int（menu id 為 `i32`、同 W-FW2）。

**E2 — transform handler**（`api/src/admin/sys_system_manage_api.rs`）

2 個 `*_for_systemmanage` handler（extractor / 體例比照 W-FW1/2/3）：
- `get_role_menu_ids_for_systemmanage`：`Path<String>` roleId → 呼 `SysMenuService::get_menu_ids_by_role_id(role_id, actor.domain())` → 回 `Vec<i32>`（同原生 `get_auth_routes` 的 domain 取法）。
- `assign_role_menus_for_systemmanage`：`Json<AssignRoleMenusInput>` → 注入 `domain`（從 JWT actor）→ 呼 `SysAuthorizationService::assign_routes(domain, role_id, menu_ids)`。

> handler 需 `SysMenuService` / `SysAuthorizationService` 的 Extension —— Phase 0 research 確認這 2 個 service 已注入 systemManage route 的 extension layer（W-FW2 menu alias 已用 `SysMenuService`）。

**E3 — route**（`router/src/admin/sys_system_manage_route.rs`）

2 條 route + RouteInfo —— `/getRoleMenuIds/:roleId` `get`、`/assignRoleMenus` `post`。既有 alias 不動。

**E4 — Casbin policy seed migration**（新建 `migration/src/datas/` + register `mod.rs` + `lib.rs`）

INSERT `casbin_rule` policy —— 2 條 `/systemManage/{getRoleMenuIds,assignRoleMenus}` path × ROLE_SUPER + ROLE_ADMIN allow、method 對齊 route（get / post）、`v4=''`；含 scope-limited 反向 DELETE。命名比照 W-FW3 `m20260522_d_wfw3_role_alias_seed`（檔名序號取落地日當日最新 migration 的次一字母）。

> **精確說明**：菜單授權資料寫 **`sys_role_menu` 表**（`assign_routes` 既有邏輯，delta insert/delete、domain-scoped、transaction），**非 Casbin**。E4 的 Casbin seed 只保護「誰能呼叫這 2 條 alias 端點」（端點層級授權），與菜單授權資料本身無關。無 `sys_role` / `sys_menu` / `sys_role_menu` schema 改動。

### base-web worktree（2 檔，限 W-WEBUI §4 範圍）

- `src/service/api/system-manage.ts`：新增 `fetchGetRoleMenuIds(roleId)`（GET `/systemManage/getRoleMenuIds/:roleId`）+ `fetchAssignRoleMenus(data)`（POST `/systemManage/assignRoleMenus`）。比照 W-FW1/2/3 `fetch*` 體例；型別由既有 `Api.SystemManage` 衍生、不改 `src/typings`。
- `src/views/manage/role/modules/menu-auth-modal.vue`：
  - `getChecks` → `fetchGetRoleMenuIds(props.roleId)`、`if (!error)` 設 `checks.value`。
  - `handleSubmit` → `fetchAssignRoleMenus({ roleId: props.roleId, menuIds: checks.value })`、`if (error) return`、成功 `$message.success` + `closeModal`。

**不動**：`getTree`（已真 API）、`getHome` / `updateHome` / `getPages`（角色首頁，W-FW4-N2 follow-up，維持 upstream stub）、`button-auth-modal.vue`、`role-operate-drawer.vue`、型別 / render / router / store / i18n。

> `roleId` 沿 W-FW3 R-Q2：modal `props.roleId` 宣告 `number`、runtime 為 string、原樣傳遞、不改型別。`menuIds` 為真 int（`number[]`、對 `Vec<i32>`）。

### data flow

```
base-web menu-auth-modal 開啟（watch visible）
  └─ getChecks → fetchGetRoleMenuIds → GET /api/systemManage/getRoleMenuIds/:roleId
       └─ get_role_menu_ids_for_systemmanage（domain 取自 actor）
            └─ SysMenuService::get_menu_ids_by_role_id → 讀 sys_role_menu → Vec<i32>
base-web menu-auth-modal handleSubmit
  └─ fetchAssignRoleMenus → POST /api/systemManage/assignRoleMenus
       └─ assign_role_menus_for_systemmanage（注入 domain）
            └─ SysAuthorizationService::assign_routes → sys_role_menu delta insert/delete（同 txn）
回應 envelope code 0 → 成功 + closeModal；code≠0 → base-web 既有錯誤呈現、modal 不關
效果：該 role 下次取動態 menu（/route/getUserRoutes）反映 sys_role_menu 變更
```

### 錯誤處理

沿用 W-FW1/2/3：後端非 0 envelope → base-web `request` helper 既有錯誤呈現 → handler `if (error) return`、不關 modal、不誤報。無權限（Casbin deny 這 2 條 alias）→ 錯誤 envelope。

---

## 開放問題（speckit Phase 0 research）

- **R-Q1**：`SysMenuService` 與 `SysAuthorizationService` 是否已注入 `/systemManage/` route 的 extension layer —— W-FW2 menu alias 已用 `SysMenuService`；`SysAuthorizationService` 待確認，若未注入則 transform handler 需補 Extension wiring。
- **R-Q2（已知風險）**：naive-ui `NTree` `v-model:checked-keys` 對父目錄節點的 cascade 行為，與後端 `get_menu_ids_by_role_id`（濾 `Status::Enabled` + `Constant::false`）可能造成 **assign → getChecks 來回非冪等**（送出含父節點或 constant menu id、讀回被濾掉）。Phase 0 須實查 `NTree` checked-keys 實際內容 + `get_menu_ids_by_role_id` 濾條件；acceptance 須加 round-trip 冪等驗證 C-V。若確認不冪等且影響 UX，於 plan 階段釐清處理（可能：assign 端對齊濾條件，或標記為已知 minor 落差登 backlog）。
- **R-Q3**：`SysAuthorizationService::assign_routes` 簽章與既有行為複核（`sys_authorization_service.rs:225` 已見 delta insert/delete + txn）；transform 直接呼用。
- **R-Q4**：base-web `menu-auth-modal` 取得 `props.roleId` 的來源（`role-operate-drawer.vue` 的 `roleId` computed）—— 確認 runtime 值與 `fetchGetRoleMenuIds` path param 對齊。

---

## follow-up（speckit-specify 時記入 INTEGRATION-CHECKLIST Follow-up Backlog）

- **W-FW4-N1**：button-auth-modal 接線 —— rust-api 無「按鈕」model，需評估把按鈕授權映射到 `sys_endpoint` API 權限（`getAllButtons` → endpoint 清單、`handleSubmit` → `assign-permission` Casbin policy）；牽涉「UI 按鈕 vs API endpoint」語意對齊。獨立 feature。
- **W-FW4-N2**：role home page 持久化 —— `menu-auth-modal` 的角色首頁選單需後端儲存（目前 hardcode `"home"`）；需 `sys_role` 加 home 欄 + 讀寫端點。獨立 follow-up。

---

## acceptance 方向

CDP browser smoke + curl + psql（per W-WEBUI 慣例、比照 W-FW3 C-V）。涵蓋：image build / dev stack / Casbin seed 落 DB + GeneralUser deny / curl getRoleMenuIds·assignRoleMenus 落庫驗 / CDP `/manage/role` 開菜單授權 modal 調整送出 smoke + regression / 三邊 scope。**針對性 C-V**：
- assignRoleMenus 後 psql 驗 `sys_role_menu` row delta（新增 / 刪除正確）。
- assign → getRoleMenuIds **round-trip 冪等驗證**（R-Q2 已知風險）。
- 菜單授權效果：對某 role 調整授權後，該 role 的動態 menu（`/route/getUserRoutes`）反映變更。

wiring feature、**無新純函式單元測試**（transform / 對映由 acceptance 覆蓋，比照 W-FW1/W-FW2/W-FW3 慣例）。
