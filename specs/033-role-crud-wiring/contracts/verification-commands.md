# Acceptance Contract — W-FW3 role-crud-wiring

C-V 驗證矩陣（CDP browser smoke + curl + psql）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | build | rust-api + base-web image build 成功、dev stack `up -d --wait` 起 |
| C-V2 | E5 / FR-011 | psql 查 `casbin_rule` 含 4 條 `/systemManage/{addRole,updateRole,deleteRole,batchDeleteRole}` × {ROLE_SUPER, ROLE_ADMIN} |
| C-V3 | US1 / FR-001,002 | curl `POST /api/systemManage/addRole`（Soybean token）→ envelope code 0；psql `sys_role` 新 row、`status` 語意正確、`pid="0"` |
| C-V4 | US1 / FR-003 / E-2 | curl addRole 用既有 roleCode → 後端拒絕（非 0 envelope，`check_role_exists` 觸發） |
| C-V5 | US3 / FR-004,005 | curl `POST /api/systemManage/updateRole` 改 name / desc → code 0；psql 變更持久 |
| C-V6 | US3 / FR-006 / SC-004 | curl updateRole 改 `status` → psql `sys_role.status` **真的變更**（驗 E4 status-drop 修正） |
| C-V7 | US3 / FR-007 / SC-005 | curl updateRole 送與既有不同的 `roleCode` → psql `sys_role.code` **維持原值不變**（驗 transform-layer code-lock） |
| C-V8 | US2 / FR-008,010 | curl `DELETE /api/systemManage/deleteRole` → code 0；psql row `deleted_at` 標記（soft delete、row 留表） |
| C-V9 | US2 / FR-009 | curl `DELETE /api/systemManage/batchDeleteRole` 多 id → 全 soft delete、`deletedCount` 正確 |
| C-V10 | FR-011 / SC-009 | curl role 寫入用 GeneralUser token → Casbin deny（非 0 envelope） |
| C-V11 | US1+US2+US3 / SC-001,002,003 | CDP 走訪 `/manage/role`：新增 role → 編輯（改 name + status）→ 刪除，UI 列表與 DB 落庫一致 |
| C-V12 | SC-008 regression | CDP 登入 + 動態 menu + user / menu / role 三表讀取仍正常 |
| C-V13 | FR-013 / SC-006 | curl 失敗情境（C-V4 / C-V10）→ base-web `request` helper 呈現錯誤、drawer 不關閉、不誤報（CDP 驗） |
| C-V14 | FR-015~018 scope | git diff：base-web 限 3 受控檔；rust-api 限 E1–E5；0 nestjs；0 型別 / render / router / store / i18n 改動 |

> 針對性 C-V：**C-V6**（E4 status 修正）、**C-V7**（code-lock）為 W-FW3-specific、必跑。
