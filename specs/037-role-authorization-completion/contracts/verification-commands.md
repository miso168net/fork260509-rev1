# Acceptance Contract — W-FW6 role-authorization-completion

C-V 驗證矩陣（curl + psql + CDP browser smoke）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | build + migration | rust-api image build 成功；dev stack `up -d --wait`；migration `m20260524_a_wfw6_add_home_to_sys_role` + `m20260524_b_wfw6_role_home_alias_seed` 套用乾淨；psql `\d sys_role` 確認新欄 `home_route_name VARCHAR NULL` 存在；psql `SELECT COUNT(*) FROM casbin_rule WHERE v2 LIKE '/systemManage/%RoleHome%'` = 4 |
| C-V2 | A1 down | 在臨時 DB 上 migration down 對稱回退（home_route_name 欄消失、4 個 seed row 消失）；正式 dev DB **不**跑 down（acceptance 用 fresh DB 或臨時環境驗 down 對稱即可） |
| C-V3 | US1 / FR-001 / FR-002 / E-1 | curl `GET /api/systemManage/getRoleHome/1`（Soybean token、role_id=1 為 ROLE_SUPER）→ envelope 0、data=null（既有 role 未設定 home、向後相容） |
| C-V4 | US1 / FR-003 / Acceptance-1,3 | curl `POST /api/systemManage/updateRoleHome` body `{roleId:"1", home:"manage_user"}`（Soybean token）→ envelope 0、data=true；psql 查 sys_role.home_route_name='manage_user' |
| C-V5 | US1 / FR-002 / Acceptance-2 | curl getRoleHome 對 C-V4 設定的 role 回 data='manage_user' |
| C-V6 | US1 / FR-003 / E-4 | curl updateRoleHome body `{roleId:"1", home:""}` → envelope 0；psql home_route_name 為 NULL（明示清除）；curl updateRoleHome body `{roleId:"1", home:null}` → envelope 0；psql home_route_name 為 NULL（null 等同清除） |
| C-V7 | US1 / FR-003 / E-3 | curl updateRoleHome body `{roleId:"1", home:"xyz-not-exist"}` → envelope 非 0 (HomeRouteNotFound)；psql 該 role home 不變 |
| C-V8 | US1 / FR-003 / E-2 | curl updateRoleHome body `{roleId:"1", home:"login"}`（constant menu）→ envelope 非 0；curl updateRoleHome body `{roleId:"1", home:"403"}` 同樣 reject |
| C-V9 | US1 / FR-003 / E-3 | psql 對某 menu soft-delete (UPDATE sys_menu SET deleted_at=NOW() WHERE route_name='wfw7-test-menu')；curl updateRoleHome body `{roleId:"1", home:"wfw7-test-menu"}` → envelope 非 0；psql 還原 deleted_at=NULL |
| C-V10 | US1 / FR-004 | curl updateRoleHome 成功後 psql 查 sys_operation_log 新增 1 row：operation=UPDATE, entity_type='sys_role', entity_id='1', payload_after.homeRouteName = 設定值 |
| C-V11 | US1 / FR-006 | curl getRoleHome 用 GeneralUser token → envelope 非 0 (RBAC deny、5001)；curl updateRoleHome 用 GeneralUser token → envelope 非 0 |
| C-V12 | US2 / FR-007 / Acceptance-1 | curl `POST /api/systemManage/assignRoleMenus` body `{roleId:"1", menuIds:[1,2,3]}` → envelope 0；psql sys_operation_log 新增 1 row：operation=UPDATE, entity_type='sys_role', entity_id='1', payload_before.menu_ids 含舊集合, payload_after.menu_ids=[1,2,3] |
| C-V13 | US2 / FR-007 | curl assignRoleMenus 再次同 role 改為 [2,3,4] → 新 audit row、payload_before.menu_ids=[1,2,3], payload_after.menu_ids=[2,3,4] |
| C-V14 | US2 / FR-008 / Acceptance-2 | curl `POST /api/role/assignUsers`（或對應 F8 expose path）body `{roleId, userIds:[...]}` → envelope 0；psql sys_operation_log 新增 1 row：operation=UPDATE, entity_type='sys_role', entity_id, payload_after.user_ids=[...] |
| C-V15 | US2 / FR-009 / Acceptance-4 | 模擬 txn rollback（例如 curl assignRoleMenus 帶不存在 menu_id → service 內 fetch routes 失敗 → AuthorizationError::RoutesNotFound、txn rollback）→ psql sys_operation_log **無**新增 audit row（atomicity） |
| C-V16 | US2 / FR-010 | grep `audit_log::write_in_txn` rust-api/server/service/src/admin/sys_authorization_service.rs：應在 assign_routes 與 assign_users 各 1 處、**不**在 assign_permission 內 |
| C-V17 | US3 / FR-011 / Acceptance-1 | 建 test role: curl addRole body `{roleName:"WFW6Test", roleCode:"R_WFW6_TEST", roleDesc:"test", status:"1"}`；psql seed 1 row Casbin policy `INSERT INTO casbin_rule (ptype, v0, ...) VALUES ('p', 'R_WFW6_TEST', 'built-in', '/some/endpoint', 'GET', '', '')`；curl updateRole 改 roleCode 為 'R_WFW6_TEST_RENAMED' → envelope 0；psql sys_role.code='R_WFW6_TEST_RENAMED'、casbin_rule WHERE v0='R_WFW6_TEST_RENAMED' COUNT > 0、casbin_rule WHERE v0='R_WFW6_TEST' COUNT = 0 |
| C-V18 | US3 / FR-011 / Acceptance-4 | curl updateRole 改 roleName / status（不改 roleCode）→ envelope 0；psql sys_role.code 不變、casbin_rule 未被觸發 UPDATE（驗證:之前 / 之後 query casbin_rule SELECT * 結果無 diff） |
| C-V19 | US3 / FR-012 / E-8 | 模擬 Casbin sync 失敗（手動 lock casbin_rule 表或約束違反——較難模擬,可改為驗 trait signature 包 txn 即達 atomicity；至少驗 service test 路徑覆蓋此 case） |
| C-V20 | US3 / FR-013 | 拿掉 W-FW3 code-lock 驗證：curl updateRole 改 roleCode（透過 systemManage transform）→ rust 端確實接受新 code、不再 silent ignore；對比 W-FW3 行為（previous merge 對同樣請求 sys_role.code 不變） |
| C-V21 | US3 / FR-015 / Acceptance-2 | C-V17 改名後對該 role 對應 user（需有 sys_user_role link）curl 訪問 R_WFW6_TEST_RENAMED 對應的 endpoint → 訪問成功（無 403） |
| C-V22 | US3 / FR-011 / Acceptance-3 | C-V17 改名後該 role user 重 curl /auth/login → response 含新 roleCode (R_WFW6_TEST_RENAMED) |
| C-V23 | CDP / US1 / SC-001,002 | CDP 走訪 `/manage/role`：對 ROLE_SUPER role 開「菜單授權」抽屜 → 確認 home 下拉 render + 預填為 `home` (or null)；改首頁為 `manage_user` 送出 → modal 關 → 再開預填 `manage_user` |
| C-V24 | CDP / US3 / SC-006,007 | CDP 走訪 `/manage/role`：對 C-V17 建的 test role 開編輯抽屜 → 改 roleCode → 送出 → 列表反映新 roleCode；再用該 role user 登入訪問既有授權 endpoint 不退化 |
| C-V25 | CDP / regression / SC-008 | CDP 走訪 `/manage/role` 既有 CRUD（addRole / deleteRole）、`/manage/menu` 既有 / `/manage/user` 既有 —— 行為無退化 |
| C-V26 | scope / SC-009 / FR-016 | git diff （merge 前）：base-web 改動 = 2 檔（menu-auth-modal.vue + system-manage.ts）；rust-api 改動 ≤ 14 處；0 nestjs；migration 2 個新檔（schema + data） |
| C-V27 | scope / SC-010 / FR-017 | psql `\d sys_role` 欄位總數 = 11（原）+ 1（新 home_route_name）= 12；psql `\d casbin_rule` 欄位與既有同（schema 不變、只 row UPDATE） |

> 針對性 C-V：**C-V3/C-V4/C-V5/C-V6**（N2 寫入路徑 + null/empty/省略三種語義）、**C-V7/C-V8/C-V9**（N2 validation reject 三類）、**C-V12/C-V13/C-V14**（N3 audit 寫入正確）、**C-V15**（N3 atomicity）、**C-V17/C-V18**（N4 改 code 同步 + 不改不觸發）為 W-FW6-specific 重點、必跑。

## Acceptance 流程建議

1. **build + migration**：執行 C-V1 / C-V2，確認 schema + Casbin seed 上線、down 對稱。
2. **N2 寫入 + 讀回 + validation**：依序 C-V3 → C-V4 → C-V5 → C-V6 → C-V7 → C-V8 → C-V9 → C-V10 → C-V11，覆蓋寫入語義 + 4 種 validation 路徑 + audit + RBAC。
3. **N3 audit gap**：C-V12 → C-V13 → C-V14 → C-V15 → C-V16，覆蓋 assign_routes / assign_users / rollback atomicity / assign_permission **不**改。
4. **N4 role code 改名**：C-V17 → C-V18 → C-V19 → C-V20 → C-V21 → C-V22，覆蓋 code 同步 + 不改不觸發 + atomicity + 拿掉 code-lock + RBAC enforcement 不退化。
5. **CDP**：C-V23 / C-V24 / C-V25 —— menu-auth-modal home + role drawer roleCode + regression。
6. **scope 收尾**：C-V26 / C-V27。

不需要單元測試（plan.md Technical Context · Testing 已說明 acceptance-only 理由）。
