# Acceptance Contract — 040 wire-id-consistency

C-V 驗證矩陣（curl + CDP browser smoke + 039 regression）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | A2 menu-auth modal updateRoleHome（critical 修） | CDP via Edge :9229 → `http://127.0.0.1:11080` 登入 Soybean → `/manage/role` → ROLE_SUPER 編輯抽屜 → 菜单授权 modal → 角色首頁 dropdown 改值 → 「确认」→ 「修改成功」toast；nginx access log 顯示 `POST /api/systemManage/updateRoleHome` 200；rust log 0 「expected i64 got string」serde 錯 |
| C-V2 | A3 button-auth modal assignRoleEndpoints（critical 修） | CDP → 同 ROLE_SUPER 編輯抽屜 → 按钮权限 modal → 勾 2 endpoint → 「确认」→ 「修改成功」toast；nginx access log 顯示 `POST /api/systemManage/assignRoleEndpoints` 200；rust log 0 serde 錯 |
| C-V3 | A1 service.ts inline type annotation 對齊 | grep `roleId: string\|endpointIds: string\[\]` in `base-web/src/service/api/system-manage.ts` → 0 命中（4 處全改 `Api.SystemManage.Role['id']` 或 `number[]`） |
| C-V4 | B base-web `String(<idField>)` 餘料拿掉 | grep `String(props.roleId)\|String(.*RoleId)\|String(.*Id)` in `base-web/src/views/manage/role/modules/{button-auth-modal,menu-auth-modal}.vue` → 0 命中 |
| C-V5 | A4 base-web TS 編譯 clean | `cd base-web && pnpm typecheck` → exit 0、無 error 輸出（且 `pnpm build` clean） |
| C-V6 | C1 parentId deserializer drop | grep `deserialize_parent_id_compat` in `rust-api/server/` → 0 命中；grep `deserialize_with` in `rust-api/server/model/src/admin/input/sys_menu.rs` → 0 命中 |
| C-V7 | C addMenu number parentId（drop 後仍正確收）| curl `POST /api/systemManage/addMenu` body `{"parentId": 0, "menuName": "test_v7", "routeName": "test", ...}` → envelope 0 + menu 建立成功；用後 cleanup（DELETE） |
| C-V8 | C addMenu string parentId（drop 後 reject）| curl `POST /api/systemManage/addMenu` body `{"parentId": "0", ...}` → envelope 4xx（serde 接 "expected i32, got string"）|
| C-V9 | D1+D4 sys_role raw endpoint wire DTO wrap | curl `GET /api/role/<i64>`（Soybean token、display_id from getRoleList）→ envelope 0、`data.id` 為 JSON number、**無** `displayId` 重複欄位、其他欄位（name/code/...）完整 |
| C-V10 | D1+D4 sys_role 分頁 list | curl `GET /api/role/list?current=1&size=10` → envelope 0、`data.records[].id` 全為 JSON number、無 displayId 重複；page meta 完整 |
| C-V11 | D1+D4 sys_role get_all_roles | curl `GET /api/systemManage/getAllRoles` 仍對齊 systemManage alias（既 039 落地）；同時 curl `GET /api/role` 或 sys_role_api 的 get_all 端點 → `data[].id` 全 number、無 displayId |
| C-V12 | D2+D5 sys_user raw endpoint | curl `GET /api/user/<i64>` → 同 C-V9 pattern；curl `GET /api/user/list` → 同 C-V10 pattern |
| C-V13 | D3+D6 sys_access_key raw endpoint | curl `GET /api/access-key/list`（或 sys_access_key_api 對應 list endpoint）→ `data.records[].id` 全 number、無 displayId |
| C-V14 | D4 sys_role create/update wrap | curl `POST /api/role` body `{...create role payload}` → envelope 0、return `data.id` 為 number（從新 row display_id）；curl `PUT /api/role` body update payload → return `data.id` 同 |
| C-V15 | regression 039 C-V6 systemManage alias getUserList | curl `GET /api/systemManage/getUserList` → 同 039 C-V6、records[].id 仍為 number、無退化 |
| C-V16 | regression 039 C-V7 systemManage alias getRoleList | curl `GET /api/systemManage/getRoleList` → 同 039 C-V7、records[].id 仍為 number、無退化 |
| C-V17 | regression 039 C-V8 systemManage alias getAllEndpoints | curl `GET /api/systemManage/getAllEndpoints` → leaf `key` 仍為 numeric string、tree shape 不退化 |
| C-V18 | regression 039 C-V9 assignRoleEndpoints i64 input | curl `POST /api/systemManage/assignRoleEndpoints` body `{roleId: <i64>, endpointIds: [<i64>]}` → envelope 0、Casbin 寫入正確 |
| C-V19 | regression 039 C-V19 audit_log ULID | C-V18 後 psql `SELECT entity_id, payload_after::text FROM sys_operation_log WHERE module_name='sys_role' ORDER BY created_at DESC LIMIT 1`：entity_id 仍 ULID 字串、payload 內 roleId/endpointIds 仍 ULID 字串集合 |
| C-V20 | regression 039 C-V20 JWT sub ULID | JWT decode sub claim 仍為 ULID 字串（如 `'1'` for Soybean） |
| C-V21 | regression 039 C-V21 Casbin enforce | GeneralUser token → admin endpoint → envelope 5001 deny；Soybean token → 5 entity endpoint → envelope 0 |
| C-V22 | regression 039 C-V22 FK schema 不動 | psql `\d sys_user_role` / `\d sys_role_menu` 等 FK 仍 VARCHAR ULID、schema 0 改動 |
| C-V23 | scope: base-web W-FW9 §4 邊界外 0 改動 | `git -C base-web diff --name-only main...rev1-admin-base-web -- 'src/' ':!src/typings/api/system-manage.d.ts' ':!src/service/api/system-manage.ts' ':!src/views/manage/role/modules/button-auth-modal.vue' ':!src/views/manage/role/modules/menu-auth-modal.vue'` → 0 檔（W-FW9 §4 邊界紀律）|
| C-V24 | scope: Sea-ORM Model 0 改動 | grep `pub struct Model` in `rust-api/server/model/src/admin/entities/{sys_role,sys_user,sys_access_key}.rs` 顯示 `id: String` + `display_id: i64` 雙欄與 039 後狀態一致 |
| C-V25 | scope: nestjs 0 改動 | 0（DESIGN-B、無 source） |
| C-V26 | scope: input DTO 0 改動（039 T030.5 後維持） | grep `pub role_id: i64\|pub id: i64\|pub ids: Vec<i64>` in `rust-api/server/model/src/admin/input/` → 與 039 落地後狀態一致、本 feature 0 新增/修改 |
| C-V27 | scope: 0 schema migration | `ls rust-api/migration/src/schemas/m20260524_*` 顯示 W-FW6 a + 039 d + W-FW7 c = 3 檔（本 feature 0 新增）；`ls rust-api/migration/src/datas/m20260524_*` 顯示 W-FW6 b + W-FW8 c + 039 e = 3 檔（本 feature 0 新增）|
| C-V28 | scope: DESIGN-W-WEBUI doc 含 W-FW9 條目 | grep `W-FW9\|wire-id-consistency` in `docs/INTEGRATION-DESIGN-W-WEBUI.md` → 命中、§7.4 加 W-FW9 條目 |

> **針對性 C-V**：**C-V1 / C-V2**（修 039 留下 critical bug、CDP smoke 必過）、**C-V3 / C-V4 / C-V5**（A+B base-web cleanup 完整）、**C-V6 / C-V7 / C-V8**（C parentId workaround 拆乾淨）、**C-V9 ~ C-V14**（D 3 raw endpoint wire 一致）為 040-specific 重點、必跑。**C-V15 ~ C-V22**（039 + W-WEBUI 軌道 regression subset）、**C-V23 ~ C-V28**（scope discipline）為 regression / 邊界紀律。

## Acceptance 流程建議

1. **TS 編譯 gate**：C-V3 / C-V4 / C-V5 第一輪、base-web build clean 才進 backend testing。
2. **CDP browser smoke**：C-V1 / C-V2（critical 修）—— 直接驗 modal 不撞 422、user-facing 確認。
3. **C parentId workaround drop**：C-V6 / C-V7 / C-V8 三條 verify deserializer 拆乾淨 + 正確邏輯。
4. **D raw endpoint wire wrap**：C-V9 ~ C-V14 跨 3 entity（role / user / access_key）+ pattern（單筆 / list / create+update）驗 wire shape。
5. **039 regression**：C-V15 ~ C-V22 一輪 subset、確認 systemManage alias + internal SoT 0 退化。
6. **Scope discipline**：C-V23 ~ C-V28、確認 W-FW9 §4 邊界紀律 + 0 schema/input/nestjs 改動。

不需要新單元測試（acceptance-only 設計、比照 039 + W-FW7 慣例）。
