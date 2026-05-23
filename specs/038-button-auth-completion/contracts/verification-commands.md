# Acceptance Contract — W-FW8 button-auth-completion

C-V 驗證矩陣（curl + psql + CDP browser smoke）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | build + Casbin seed | rust-api image build 成功；dev stack `up -d --wait`；migration `m20260524_c_wfw8_endpoint_alias_seed` 套用乾淨；psql `SELECT COUNT(*) FROM casbin_rule WHERE v2 LIKE '/systemManage/%Endpoint%' OR v2 LIKE '/systemManage/%RoleEndpoint%'` = 6 (ROLE_SUPER + ROLE_ADMIN × 3 alias) |
| C-V2 | A1 down 對稱 | 在臨時 DB 上 migration down 對稱回退（6 seed row 消失）；正式 dev DB 不跑 down |
| C-V3 | US1 / FR-001 | curl `GET /api/systemManage/getAllEndpoints`（Soybean token）→ envelope 0、data 為 13-group resource tree、每 group 有 children（endpoint leaf）；leaf 含 `id` / `label` / `method` / `path` / `isLeaf: true`；group 含 `key: "resource:<name>"` / `label: <resource>` / `children: [...]` / `isLeaf: false`；leaf 總數 = 67 |
| C-V4 | US1 / FR-001 / Acceptance-1 | C-V3 結果 leaf 中至少含 `{method:"GET", path:"/role/list"}`、`{method:"POST", path:"/authorization/assign-permission"}`、`{method:"GET", path:"/access-key"}`（每個 group 含 ≥ 1 leaf）；label 含中文 summary（如「获取角色列表」「分配权限」「获取访问密钥列表」）並後綴 `（GET/POST/DELETE）` |
| C-V5 | US1 / FR-002 / Acceptance-2 | curl `GET /api/systemManage/getRoleEndpointIds/1`（Soybean token、role 1 = ROLE_SUPER）→ envelope 0、data 為非空 `Vec<String>`、每 element 對得上 C-V3 leaf id（reverse-map 正確） |
| C-V6 | US1 / FR-002 / E-1 / Acceptance-1 | 建立 W-FW8 test role（curl addRole roleCode='R_WFW8_TEST'）→ curl getRoleEndpointIds/{newRoleId} → envelope 0、data = `[]`（新 role 0 endpoint 授權） |
| C-V7 | US1 / FR-002 | curl `GET /api/systemManage/getRoleEndpointIds/nonexistent` → envelope 非 0 (RoleNotFound 4001) |
| C-V8 | US1 / FR-003 / Acceptance-3 | curl `POST /api/systemManage/assignRoleEndpoints` body `{roleId:"<testRoleId>", endpointIds:[id1, id2]}` （Soybean token）→ envelope 0、data=true；psql `SELECT COUNT(*), array_agg(v2 ORDER BY v2) FROM casbin_rule WHERE v0='<testRoleCode>' AND ptype='p'` 顯示 2 row、v2 對應 id1/id2 的 path |
| C-V9 | US1 / FR-003 | curl assignRoleEndpoints `<testRoleId>` `[id2, id3]` （diff change）→ envelope 0；psql casbin_rule 該 role 顯示 2 row、id1 已被移除、id3 已 add |
| C-V10 | US1 / FR-003 / E-4 / Acceptance-5 | curl assignRoleEndpoints `<testRoleId>` `[]`（清空）→ envelope 0；psql casbin_rule 該 role 0 row |
| C-V11 | US1 / E-3 | curl assignRoleEndpoints `<testRoleId>` `[bogusId1, validId2]` → envelope 0、bogus 過濾掉 + valid 寫入；psql casbin_rule 該 role 顯示 1 row（對應 validId2） |
| C-V12 | US1 / FR-006 | curl getAllEndpoints / getRoleEndpointIds / assignRoleEndpoints 用 GeneralUser token → 三條皆 envelope 非 0 (RBAC deny 5001) |
| C-V13 | US2 / FR-007 / Acceptance-1 | C-V8 後 psql `SELECT operation, module_name, entity_id, payload_before->'endpointIds' AS bf, payload_after->'endpointIds' AS af FROM sys_operation_log WHERE module_name='sys_role' AND entity_id='<testRoleId>' AND payload_after ? 'endpointIds' ORDER BY created_at DESC LIMIT 1`：1 row、operation=UPDATE、bf=[] af=[id1,id2] |
| C-V14 | US2 / FR-007 | 連續 C-V8→C-V9→C-V10 後 psql 該 role 同條件查詢 3 row、payload before/after 對得上各次操作 |
| C-V15 | US2 / Acceptance-4 / FR-009 | grep `audit_log::write_in_txn` in `server/service/src/admin/sys_authorization_service.rs`：應 3 次（assign_routes + assign_users + assign_permission）；assign_permission 加入後不應有第 4 處；既有 assign_routes / assign_users audit 路徑不退化 |
| C-V16 | US2 / FR-008 / Acceptance-3 | 模擬 txn rollback（bogus role_id 觸發 RoleNotFound 在 service 內 reject）→ psql sys_operation_log **無**新增 audit row（atomicity） |
| C-V17 | W-F11 reload / FR-015 spec / E-8 | C-V8 後 docker logs rust-api（since 1m）含 `Casbin sync subscriber: 收到 invalidate 訊號,policy 已 reload` 至少 1 次 |
| C-V18 | US1 / Acceptance-4 / FR-015 | 改完 endpoint 權限後該 role user (`user_token`) 對被授權 endpoint 訪問成功（200）、對被取消 endpoint 訪問被 deny（5001） |
| C-V19 | US1 CDP / Acceptance-1 | CDP via Edge :9229 → 開 `/manage/role` → 對 ROLE_SUPER 開「编辑」抽屜 → click「按钮权限」→ modal 開、NTree render、13 group、可展開查 leaf；勾選與 backend Casbin 對得上 |
| C-V20 | US1 CDP / Acceptance-3 | CDP → 建 W-FW8 test role（透過 modal 或 API）→ 對該 role 開 modal → 勾 2 個 endpoint → click 确认 → toast 「更新成功」 |
| C-V21 | US1 CDP / Acceptance-2 | CDP → 關 + 重開 C-V20 的 modal → 同 2 個 endpoint 預填 checked、其他 unchecked |
| C-V22 | regression / FR-009 / SC-006 | curl 既有 `/api-endpoint/tree`（admin metadata）+ `/api-endpoint/auth-api-endpoint/:roleCode`（既有 raw Casbin view）+ `/authorization/assign-permission`（既有 raw endpoint）三條 endpoint 不退化、仍 envelope 0；既有 W-FW4/W-FW6 邏輯（assignRoleMenus / assignUsers / updateRoleHome / updateRole code rename）不退化 |
| C-V23 | scope / SC-007 / SC-008 | git diff（merge 前）：base-web 改動 = 2 檔（button-auth-modal.vue + system-manage.ts）；rust-api 改動 ≤ 12 處 + 1 新 data migration；0 schema migration；0 nestjs；0 src/typings 改動 |
| C-V24 | scope / SC-010 | grep `getAllButtons\|getChecks\|console.log` in `base-web/src/views/manage/role/modules/button-auth-modal.vue` → 0 hit（硬編 mock + console.log stub 完全移除） |
| C-V25 | scope / SC-008 | psql `\d sys_endpoint`、`\d casbin_rule`、`\d sys_role`、`\d sys_menu`、`\d sys_operation_log`：欄位數量 / 結構 = W-FW7 落地後狀態（schema 0 改動） |
| C-V26 | US1 / E-2 | psql 對某 active non-constant endpoint 軟刪（`UPDATE sys_endpoint SET deleted_at = NOW() WHERE id = '<some-active-id>'`）→ curl `GET /api/systemManage/getAllEndpoints` → 該 endpoint 不在任何 resource group 的 children 內、總 leaf 數 = 67 - 1 = 66；psql 還原（`UPDATE ... SET deleted_at = NULL WHERE id = '<same-id>'`）+ 再 curl → leaf 數回 67 |
| C-V27 | US2 / E-9 | 對某 active role 先軟刪（`UPDATE sys_role SET deleted_at = NOW() WHERE id = '<testRoleId>'`）→ curl `POST /api/authorization/assign-permission` body `{domain:"built-in", roleId:"<testRoleId>", permissions:[id1]}` → envelope 非 0 (RoleNotFound 4001)；psql 查 sys_operation_log 對 `<testRoleId>` 無新 audit row（atomicity、txn rollback 後 audit 不寫入）；psql 還原 role |

> 針對性 C-V：**C-V8/C-V9/C-V10/C-V11**（A 寫入路徑 4 個語意：add/diff/clear/bogus filter）、**C-V12**（A RBAC deny）、**C-V13/C-V14/C-V15/C-V16**（B audit gap 補齊 + 既有 assign_routes/users 不退化 + atomicity）、**C-V17/C-V18**（W-F11 reload trigger 真實生效）、**C-V19/C-V20/C-V21**（CDP modal 端到端）、**C-V26/C-V27**（軟刪 endpoint / 軟刪 role edge case）為 W-FW8-specific 重點、必跑。

## Acceptance 流程建議

1. **build + Casbin seed**：執行 C-V1 / C-V2，確認 6 row seed 上線、down 對稱。
2. **A getAllEndpoints + tree shape**：C-V3 / C-V4，覆蓋 tree 13 group / 67 leaf / 中文 label + method。
3. **A getRoleEndpointIds + reverse-map**：C-V5 / C-V6 / C-V7，覆蓋 reverse-map 正確 / 新 role 空集 / invalid role reject。
4. **A assignRoleEndpoints + Casbin sync**：C-V8 / C-V9 / C-V10 / C-V11，覆蓋 add / diff / clear / bogus filter；每 step psql 對 Casbin policy diff 驗證。
5. **A RBAC**：C-V12，GeneralUser token 三條 alias 全 5001 deny。
6. **B audit**：C-V13 / C-V14 / C-V15 / C-V16，覆蓋 audit row 正確 / 連續多次 audit / `audit_log::write_in_txn` grep 3 次 / rollback no audit。
7. **W-F11 reload**：C-V17 / C-V18，rust-api log + 該 role user 訪問結果。
8. **CDP smoke**：C-V19 / C-V20 / C-V21，modal 開 + 勾選 + save + 重開 pre-fill。
9. **edge case 軟刪**：C-V26 / C-V27，覆蓋 軟刪 endpoint 不入 tree (E-2) / assignRoleEndpoints 對軟刪 role reject + 0 audit (E-9)。
10. **regression + scope**：C-V22 / C-V23 / C-V24 / C-V25，既有功能不退化 + scope 限縮達標 + schema 0 變更。

不需要單元測試（plan.md Technical Context · Testing 已說明 acceptance-only 理由）。
