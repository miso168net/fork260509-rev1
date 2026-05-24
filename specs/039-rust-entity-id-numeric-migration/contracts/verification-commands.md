# Acceptance Contract — 039 rust-entity-id-numeric-migration

C-V 驗證矩陣（curl + psql + CDP browser smoke）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | A1 Snowflake helper unit test | `cargo test snowflake::tests::test_unique_and_time_ordered --release` 通過：1000 連續 id 全唯一、time-ordered、且 in JS safe integer range (< 2^53) |
| C-V2 | A3 schema migration | rust-api image build 成功；dev stack `up -d --wait`；migration `m20260524_d_add_display_id_to_business_entities` 套用乾淨；psql `\d sys_user` / `\d sys_role` / `\d sys_endpoint` / `\d sys_organization` / `\d sys_access_key` 各多 `display_id BIGINT NOT NULL` 一欄 + `idx_{table}_display_id` INDEX |
| C-V3 | A4 backfill migration | migration `m20260524_e_backfill_display_id` 套用乾淨；psql `SELECT COUNT(*) AS total, COUNT(DISTINCT display_id) AS uniq FROM sys_user` 等 5 entity 全 `total = uniq`、且 `display_id != 0`；psql `\d sys_user` 等顯示 `display_id BIGINT NOT NULL` + `UNIQUE` constraint 已 ADD |
| C-V4 | A4 backfill range | psql `SELECT MIN(display_id), MAX(display_id) FROM sys_user UNION ALL ...` 跨 5 entity，所有值 in range `[1, 2^53)`（JS safe integer）、且高位 41bit 對應 current timestamp ms（合理 epoch 範圍 2020-2089） |
| C-V5 | A3+A4 down 對稱 | 臨時 DB 對稱 down 乾淨（DROP CONSTRAINT + DROP INDEX + DROP COLUMN 全 5 entity）；正式 dev DB 不跑 down |
| C-V6 | C1.1 UserOutput / SystemManageUserOutput wire 型 | curl `GET /api/systemManage/getUserList`（Soybean token）→ envelope code 0、`records[].id` 為 JSON number 型（如 `1234567890`）、非 ULID string；TS typings `Api.SystemManage.User.id: number` 對齊 |
| C-V7 | C1.2 SystemManageRoleOutput / SystemManageAllRoleOutput wire 型 | curl `GET /api/systemManage/getRoleList` / `GET /api/systemManage/getAllRoles` → 同 C-V6 模式、`id` 為 JSON number |
| C-V8 | C1.3 EndpointTree / EndpointTreeNode wire 型 | curl `GET /api/systemManage/getAllEndpoints`（W-FW8 alias）→ envelope 0、`data[].children[].key` 為 number string（display_id.to_string()）、其他 leaf 字段對應 backend display_id i64；總 leaf 數 = 既有 active endpoint count（含本 feature 新加的 5 entity schema migration alias、可能略增）|
| C-V9 | C2 input DTO（assignRoleEndpoints） | curl `POST /api/systemManage/assignRoleEndpoints` body `{roleId: <i64-from-getRoleList>, endpointIds: [<i64-from-getAllEndpoints>, <i64>]}` → envelope 0；psql `SELECT v0, v2, v3 FROM casbin_rule WHERE v0 = '<role-code>'` 顯示對應 2 row 正確 (v2 = path / v3 = method) |
| C-V10 | C2 input DTO（assign-permission raw endpoint） | curl `POST /api/authorization/assign-permission` body `{domain:"built-in", roleId: <i64>, permissions: [<i64>, <i64>]}` → envelope 0、Casbin 寫入正確 |
| C-V11 | C2 input DTO（assignRoutes） | curl `POST /api/systemManage/assignRoleMenus` body `{roleId: <i64>, menuIds: [<i32>]}` → envelope 0；sys_role_menu FK 仍 (role.id ULID, menu.id i32) |
| C-V12 | C2 input DTO（assignUsers） | curl `POST /api/authorization/assign-users` body `{roleId: <i64>, userIds: [<i64>, <i64>]}` → envelope 0；sys_user_role FK 仍 (user.id ULID, role.id ULID) |
| C-V13 | C2 input DTO（updateRoleHome W-FW6 N2） | curl `POST /api/systemManage/updateRoleHome` body `{roleId: <i64>, home: "home"}` → envelope 0 |
| C-V14 | C3 Path<i64> raw user endpoint | curl `GET /api/user/<i64>` (user.display_id) → envelope 0、返回 user 詳情 |
| C-V15 | C3 Path<i64> raw role endpoint | curl `GET /api/role/<i64>` (role.display_id) → envelope 0、返回 role 詳情 |
| C-V16 | C3 Path<i64> access key endpoint | curl `GET /api/access-key/<i64>` (access_key.display_id) → envelope 0、返回 access key 詳情 |
| C-V17 | C3 lookup not-found error | curl `GET /api/role/9999999999`（不存在 display_id）→ envelope 4001 RoleNotFound；同 path 不會 leak ULID 等 internal 細節 |
| C-V18 | C3 lookup wrong type | curl `POST /api/systemManage/assignRoleEndpoints` body `{roleId: "01KS9..."（誤傳 ULID string）, ...}` → envelope 4xx serde deserialization error「expected i64, got string」|
| C-V19 | D audit_log 不退化 | C-V9 後 psql `SELECT operation, module_name, entity_id, payload_before::text, payload_after::text FROM sys_operation_log WHERE module_name='sys_role' AND payload_after::text LIKE '%endpointIds%' ORDER BY created_at DESC LIMIT 1`：1 row、`entity_id` 仍 ULID 字串、`payload_before/after` 內 `endpointIds: ['ULID-1', 'ULID-2']` 仍為 ULID 字串集合（rust internal SoT 不變、跨期一致） |
| C-V20 | D JWT 不退化 | 用 Soybean 帳號登入：`POST /api/auth/login` → envelope 0 + token；JWT decode header.payload.sub = ULID 字串（如 `'1'` for seed Soybean）；用此 token 訪問 `/api/auth/getUserInfo` → envelope 0 + 正確 user info |
| C-V21 | D Casbin 不退化 | GeneralUser token 對 admin endpoint 訪問：envelope 5001 RBAC deny；Soybean token 對全 5 entity endpoint 訪問：envelope 0；psql `SELECT * FROM casbin_rule WHERE ptype='g' LIMIT 5` 顯示 v0 仍 ULID user_id 字串 |
| C-V22 | D FK schema 不動 | psql `\d sys_user_role` / `\d sys_role_menu` / `\d sys_tokens` / `\d sys_login_log` / `\d sys_operation_log` 顯示 FK 欄仍 VARCHAR、schema 0 改動 |
| C-V23 | regression FR-009 既有 endpoint | curl 既有 `/api/api-endpoint/tree` / `/api/api-endpoint/auth-api-endpoint/ROLE_SUPER` / `/api/systemManage/getRoleHome/<i64>` / `/api/systemManage/getMenuTree` 全 envelope 0、不退化 |
| C-V24 | scope SC-004 base-web 0 diff | `git -C base-web diff --name-only` 為空（0 改動）；`git -C base-web status --short` 0 modified file（除 untracked build artifact） |
| C-V25 | scope SC-005 nestjs 0 改動 | 0（DESIGN-B、nestjs 已退場、無源碼可改） |
| C-V26 | scope SC-005 schema 對齊範圍 | psql `\d sys_menu` / `\d sys_domain` / `\d sys_login_log` / `\d sys_operation_log` / `\d sys_tokens` / `\d casbin_rule` / `\d sys_user_role` / `\d sys_role_menu` 顯示 schema 0 改動（與 W-FW8 落地後狀態一致）|
| C-V27 | scope SC-005 5 entity 全有 display_id | psql `SELECT table_name, column_name FROM information_schema.columns WHERE column_name='display_id' AND table_schema='public' ORDER BY table_name` 顯示 5 row（sys_user / sys_role / sys_endpoint / sys_organization / sys_access_key） |
| C-V28 | grep Ulid::new 命中數 | `grep -rcE "Ulid::new" rust-api/server/` 命中 = brainstorm 前 + 0（既有 ULID 生成路徑全保留、本 feature 0 新增 ULID 點、0 移除既有）|
| C-V29 | CDP browser smoke W-FW8 button-auth | CDP via Edge :9229 → `http://127.0.0.1:11080` 登入 Soybean → `/manage/role` → 對 ROLE_SUPER 開「编辑」→ 點「按钮权限」→ modal 開、tree 12 group render、勾 2 leaf → 「确认」→ 「修改成功」 toast；wire 內 endpoint id 改 number 後不退化、JS 端 0 runtime error |
| C-V30 | CDP browser smoke W-FW1~W-FW4 既有 manage | CDP → `/manage/user`（user 列表 render） / `/manage/role`（role 列表 render） / `/manage/menu`（menu tree render）/ `/manage/user` 建立新 user → drawer 開、submit → toast 成功；既有 W-FW1~W-FW4 CRUD 流程不退化 |
| C-V31 | regression W-FW5/W-FW6/W-FW7 | curl `/api/auth/changePassword` (W-FW5 自助改密碼、payload `currentPassword` 非 `oldPassword`、詳見下方 C-V31a 詳述)、curl `/api/systemManage/getRoleHome/<i64>` + updateRoleHome (W-FW6 N2)、curl getMenuList/v2 顯示 query/buttons/fixedIndexInTab (W-FW7) —— 全 envelope 0 |

---

### C-V31a 詳述 — `changePassword` payload 例（errata 041 augment）

> **errata 041**：原 C-V31 row（line 37）為 summary table only、未列 `changePassword` payload 例；regression operator 憑慣例容易誤拼 `oldPassword`、被 rust DTO 422 拒。實際 DTO 為 `currentPassword`（per W-FW5 035 `change_password` service）。本子節 augment 補完整 curl block、供未來 regression 直接複用。

```bash
# 以某 user token（非 Soybean、避免互擾）發 changePassword
USER_TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"<test-user>","password":"<old>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -fsS -X POST "http://127.0.0.1:11080/api/auth/changePassword" \
  -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"<old>","newPassword":"<new>"}'
```

**Expected**：envelope `code:0`；該 user 可用 `<new>` 重 login、`<old>` 失效。

---

> **針對性 C-V**：**C-V1 / C-V2 / C-V3 / C-V4**（Snowflake helper + schema + backfill 4 核心驗）、**C-V6 / C-V7 / C-V8**（output wire 型 number 對齊）、**C-V9 / C-V10 / C-V11 / C-V12**（input DTO i64 cascade 4 endpoint）、**C-V14 / C-V15 / C-V16**（Path<i64> lookup 3 endpoint）、**C-V19 / C-V20 / C-V21**（rust internal SoT 不退化、audit/JWT/Casbin）、**C-V29 / C-V30**（CDP smoke 端到端）為 039-specific 重點、必跑。

## Acceptance 流程建議

1. **A 基礎建設**：執行 C-V1（Snowflake helper unit test）、C-V2（schema migration）、C-V3 / C-V4（backfill + range 檢查）、C-V5（down 對稱、臨時 DB）。
2. **C output wire 型對齊**：C-V6 / C-V7 / C-V8 跨 5 entity GET endpoint 確認 wire id 為 number。
3. **C input DTO 端到端**：C-V9 / C-V10 / C-V11 / C-V12 / C-V13 跨 5 個 assign/update endpoint 用 number id input 寫入正確。
4. **C Path<i64>**：C-V14 / C-V15 / C-V16 raw entity 端 GET/DELETE 用 number 路徑工作。
5. **C lookup error**：C-V17 / C-V18 not-found 與 wrong-type input 正確 reject。
6. **D internal SoT 不退化**：C-V19（audit ULID 保留）/ C-V20（JWT sub ULID）/ C-V21（Casbin g rule ULID）/ C-V22（FK schema 不動）。
7. **Regression + scope**：C-V23（既有 endpoint 不退化）/ C-V24（base-web 0 diff）/ C-V25（nestjs 0）/ C-V26（不該動的 schema 0 改動）/ C-V27（5 entity 全有 display_id）/ C-V28（grep Ulid 不增加）。
8. **CDP smoke 端到端**：C-V29 / C-V30 / C-V31 跨 W-FW1~W-FW8 既有功能驗證。

不需要新單元測試（除 A1 Snowflake helper 1 個 unit test）—— plan.md Technical Context · Testing 已說明 acceptance-only 理由。
