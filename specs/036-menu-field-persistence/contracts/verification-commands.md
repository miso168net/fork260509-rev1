# Acceptance Contract — W-FW7 menu-field-persistence

C-V 驗證矩陣（curl + psql + CDP browser smoke）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | build + migration | rust-api image build 成功；dev stack `up -d --wait`；migration `m<timestamp>_add_menu_fields_to_sys_menu` 套用乾淨；psql `\d sys_menu` 確認新 3 欄存在（`query JSONB NULL` / `buttons JSONB NULL` / `fixed_index_in_tab INTEGER NULL`） |
| C-V2 | A1 down | 在臨時 DB 上 migration down 對稱回退（3 欄消失）；正式 dev DB **不**跑 down（acceptance 用 fresh DB 或臨時環境驗 down 對稱即可） |
| C-V3 | US1 / FR-003 / FR-004 | curl `POST /api/systemManage/addMenu`（Soybean token），body 帶 `query: [{key:"a",value:"1"}]` / `buttons: [{code:"add",desc:"新增"}]` / `fixedIndexInTab: 0` → envelope code 0；psql 查新 menu row 的 3 欄持久化（值對得上送出形狀） |
| C-V4 | US1 / FR-003 | curl `POST /api/systemManage/updateMenu`（對 C-V3 建的 menu）改 3 欄為新值（加 query 項、加 button、改 fixedIndexInTab）→ envelope 0；psql delta 正確 |
| C-V5 | US1 / FR-004 / E-3 | curl updateMenu 對某 menu 送 `query: []` / `buttons: []` → envelope 0；psql 該 menu 兩欄為空陣列（`[]`，**非** `NULL`） |
| C-V6 | US1 / FR-004 / E-4 | curl updateMenu 對某 menu **省略** 3 欄（不在 body 中）→ envelope 0；psql 該 menu 3 欄維持原狀（未被誤清為 NULL） |
| C-V7 | US1 / FR-006 / Acceptance-1 | curl `GET /api/systemManage/getMenuList`（Soybean token）→ 回傳 menu 清單中對應 C-V3/4 建立 / 更新的 menu 帶真實 `query` / `buttons` / `fixedIndexInTab` 值（取代 `null`） |
| C-V8 | US1 / Acceptance-1,5 | psql 查 `sys_menu` 既有（W-FW7 前建立）的 menu row：3 欄為 `NULL` —— getMenuList 對該等 row 回傳 3 欄為 `null`（向後相容、不誤報空陣列）|
| C-V9 | US2 / FR-008 / Acceptance-1 | curl `GET /api/route/getUserRoutes`（任一 user token）→ 對 C-V3/4 設定過 3 欄的 menu，其對應路由的 `meta.query` 與 `meta.fixedIndexInTab` 反映真值（從 sys_menu 讀出） |
| C-V10 | US2 / FR-009 | curl `GET /api/route/getUserRoutes` → 對 query/fixed_index_in_tab 為 NULL 的 menu，其對應路由的 meta **不出現** `query` 鍵與 `fixedIndexInTab` 鍵（向後相容、`skip_serializing_if = Option::is_none`）|
| C-V11 | US2 / FR-010 / Acceptance-4 | curl `GET /api/route/getUserRoutes` → 對任一 menu（含有 buttons 值的）的對應路由 meta **不出現** `buttons` 鍵（不論 sys_menu.buttons 是否有值；Q2 拍板：buttons 不進 RouteMeta）|
| C-V12 | US2 / `getConstantRoutes` | curl `GET /api/route/getConstantRoutes` → 對任一 constant menu 的路由 meta，`query` / `fixedIndexInTab` 行為與 C-V9/10 一致（共用 RouteMeta DTO）|
| C-V13 | US1 / E-5 | curl updateMenu 用無權限 token → 後端拒絕（envelope 非 0）；psql 該 menu 3 欄不變 |
| C-V14 | US1 / FR-005 | psql 查 `sys_operation_log` 中對應 C-V3/4 的 menu create/update 操作的 audit row：`payload_after` 含新 3 欄的真值（既有 audit 路徑自動涵蓋、無需新邏輯）|
| C-V15 | CDP / US1 / SC-001,002 | CDP 走訪 `/manage/menu`：對某 menu 開**編輯** modal → 確認 `query` / `buttons` / `fixedIndexInTab` 三個 UI 元件（NDynamicInput x 2 + NInputNumber）**已 render**、且若 menu 有設值則預填正確 → 調整 3 欄送出 → UI 成功、modal 關 → 再開同一 menu 編輯 modal 預填一致 |
| C-V16 | CDP / US1 / SC-001 | CDP：建立新 menu（不填 3 欄）送出 → 列表顯示 → 編輯 modal 開啟，3 欄為空（query=[], buttons=[], fixedIndexInTab=null）|
| C-V17 | CDP / regression / SC-006 | CDP 走訪 `/manage/menu` 既有 CRUD：建立 menu（必填欄、不動 3 個新欄）/ 編輯 menu 的其他欄位 / 刪除 menu / 列表分頁 —— 行為與 W-FW2 一致、無退化 |
| C-V18 | CDP / regression / SC-006 | CDP 登入 / 動態 menu 載入 / `/manage/user` `/manage/role` 三個列表頁正常 render —— 動態路由 meta 新增欄不影響其他模組 |
| C-V19 | scope / SC-007 / FR-012 | psql `\d sys_menu`：欄位總數 = 23（原）+ 3（新）= 26；其他資料表 schema 0 變更 |
| C-V20 | scope / SC-008 / FR-011,013 | git diff（merge 前）：base-web 改動 **0 檔**（或最多 `menu-operate-modal.vue` 單檔含 contingency 微調理由）；rust-api 改動限 plan 列出的 ~10 處；0 nestjs；migration 僅 1 個新檔 |

> 針對性 C-V：**C-V3/C-V4/C-V5/C-V6**（寫入路徑 + null/空陣列/省略三種語義）、**C-V9/C-V10/C-V11**（runtime route meta query+fixedIndexInTab 出現、buttons 不出現、null 不出現）、**C-V14**（audit 自動涵蓋 3 欄）、**C-V19**（schema 邊界精確）為 W-FW7-specific 重點、必跑。

## Acceptance 流程建議

1. **build + migration**：執行 C-V1 / C-V2，確認 schema 上線、down 對稱。
2. **寫入 + admin 讀回**：依序 C-V3 → C-V4 → C-V5 → C-V6 → C-V7 → C-V8，覆蓋寫入語義（提供 / 空 / 省略）與既有 row 向後相容。
3. **runtime route**：C-V9 / C-V10 / C-V11 / C-V12，覆蓋 query/fixedIndexInTab 反映、null/buttons 不出現。
4. **權限 + audit**：C-V13 / C-V14。
5. **CDP**：C-V15 / C-V16 / C-V17 / C-V18 —— menu modal 互動 + regression。
6. **scope 收尾**：C-V19 / C-V20。

不需要單元測試（plan.md Technical Context · Testing 已說明 acceptance-only 理由）。
