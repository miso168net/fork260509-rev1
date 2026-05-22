# Acceptance Contract — W-FW4 role-authorization-wiring

C-V 驗證矩陣（CDP browser smoke + curl + psql）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | build | rust-api + base-web image build 成功、dev stack `up -d --wait` 起 |
| C-V2 | E5 / FR-008 | psql 查 `casbin_rule` 含 2 條 `/systemManage/{getRoleMenuIds,assignRoleMenus}` × {ROLE_SUPER, ROLE_ADMIN} |
| C-V3 | US1 / FR-001,002 | curl `GET /api/systemManage/getRoleMenuIds/:roleId`（Soybean token）→ envelope code 0、`data` 為 menu id 陣列；對照 psql `sys_role_menu`（該 role × domain）一致 |
| C-V4 | US2 / FR-003,004 | curl `POST /api/systemManage/assignRoleMenus`（改某 role 的 menuIds）→ code 0；psql `sys_role_menu` delta 正確（新增的 row 新增、移除的 row 移除） |
| C-V5 | US2 / FR-004 / E-5 | curl assignRoleMenus 送空 `menuIds: []` → code 0；psql 該 role 的 `sys_role_menu` row 全清 |
| C-V6 | SC-004 round-trip | curl assignRoleMenus 送一組 menuIds → 隨即 curl getRoleMenuIds → 兩集合**逐一相等**（驗來回冪等；R-Q2 已知風險。若不冪等 → 記錄實測落差、登 backlog） |
| C-V7 | US3 / FR-006 / SC-003 | 對某 role 調整菜單授權後，以該 role 取得動態選單（`/route/getUserRoutes`）→ 選單集合反映新授權（新授權菜單出現 / 取消的消失） |
| C-V8 | FR-008 / SC-007 | curl getRoleMenuIds + assignRoleMenus 用 GeneralUser token → Casbin deny（非 0 envelope） |
| C-V9 | US1+US2 / SC-001,002 | CDP 走訪 `/manage/role`：對某 role 開菜單授權 modal → 菜單樹預填現有授權 → 調整勾選送出 → UI 成功 + DB `sys_role_menu` 一致 |
| C-V10 | SC-004 | CDP：C-V9 送出後再次開啟同一 role 的菜單授權 modal → 勾選狀態與剛送出的一致（讀寫來回 UI 驗） |
| C-V11 | SC-008 regression | CDP 登入 + 動態 menu + user / menu / role 三表 CRUD 仍正常 |
| C-V12 | FR-010 / SC-005 | curl 失敗情境（C-V8）→ base-web `request` helper 呈現錯誤、modal 不關閉、不誤報（CDP 驗） |
| C-V13 | FR-012~016 scope | git diff：base-web 限 2 受控檔（`system-manage.ts` / `menu-auth-modal.vue`）；rust-api 限 E1–E5；0 nestjs；0 型別 / render / router / store / i18n；button-auth-modal 0 改動；menu-auth-modal 的 home 相關（`getHome`/`updateHome`）0 改動 |

> 針對性 C-V：**C-V6 / C-V10**（round-trip 冪等、R-Q2 已知風險）、**C-V7**（菜單授權對動態選單生效）為 W-FW4-specific、必跑。
