# Verification Commands: W-FW2 — menu-crud-wiring

**Phase**: 1（Design & Contracts）
**Date**: 2026-05-22

11 個 C-V contract = 本 feature 的 verification scenario（US1/US2/US3 acceptance → C-V mapping + zero-regression）。

執行環境:host bash（outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`）、**dev stack**。psql 經 `docker compose exec postgres`（DB `soybean_admin_rust`、user `soybean`）。端點經 front-nginx `:11080`。預設帳號見 CLAUDE.md §5.1。`PC` = `docker compose -f docker-compose.yml -f docker-compose.dev.yml`。

> 形狀以 base-web menu modal `getSubmitParams()` 形狀為準:`addMenu`/`updateMenu` 收 camelCase `{menuType, menuName, routeName, routePath, component, order, status, parentId, constant, ...}`;`menuType`/`status`/`iconType` 為 `'1'/'2'` 字串。

---

## C-V1: rust-api image rebuild OK

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
**Expected**: build exit 0（alias DTO / transform handler / Casbin seed migration cargo build 通過）。

---

## C-V2: base-web image rebuild + dev stack healthy + migration applied

```bash
DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web -f base-web/Dockerfile base-web/ 2>&1 | tail -5
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC up -d --wait 2>&1 | tail -5
$PC ps --format "table {{.Service}}\t{{.State}}"
```
**Expected**: 兩 image build exit 0;5 service healthy + migration exited 0（含新 Casbin seed migration）。

---

## C-V3 [US1]: addMenu — 建立頂層菜單

```bash
TOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addMenu" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"menuType":"2","menuName":"WFW2Test","routeName":"wfw2_test","routePath":"/wfw2-test","component":"view.wfw2-test","order":99,"status":"1","parentId":0,"constant":false}' | head -c 250
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT menu_name,menu_type,status,pid FROM sys_menu WHERE menu_name='WFW2Test';"
```
**Expected**: envelope `code:0 success:true`;DB `menu_type=menu`（'2'→Menu）、`status=enabled`（'1'→Enabled）、`pid=0`（頂層、parentId 0→"0"）。

---

## C-V4 [US1]: addMenu — 加子菜單 + query/buttons/fixedIndexInTab 忽略

```bash
PARENT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT id FROM sys_menu WHERE menu_type='directory' AND deleted_at IS NULL ORDER BY id LIMIT 1;" | tr -d ' ')
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addMenu" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"menuType\":\"2\",\"menuName\":\"WFW2Child\",\"routeName\":\"wfw2_child\",\"routePath\":\"/wfw2-child\",\"component\":\"view.wfw2-child\",\"order\":98,\"status\":\"1\",\"parentId\":$PARENT,\"constant\":false,\"query\":[[\"k\",\"v\"]],\"buttons\":[{\"code\":\"B\",\"desc\":\"b\"}],\"fixedIndexInTab\":3}" | head -c 200
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT menu_name,pid FROM sys_menu WHERE menu_name='WFW2Child';"
```
**Expected**: envelope `code:0 success:true`（`query`/`buttons`/`fixedIndexInTab` 被後端忽略、不致失敗）;DB `WFW2Child` 的 `pid` = 上面 `$PARENT` 父菜單 id。

---

## C-V5 [US3]: updateMenu — 變更生效

```bash
MID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT id FROM sys_user; SELECT id FROM sys_menu WHERE menu_name='WFW2Test';" 2>/dev/null | tail -1 | tr -d ' ')
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/updateMenu" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"id\":$MID,\"menuType\":\"2\",\"menuName\":\"WFW2Edited\",\"routeName\":\"wfw2_test\",\"routePath\":\"/wfw2-test\",\"component\":\"view.wfw2-test\",\"order\":50,\"status\":\"2\",\"parentId\":0,\"constant\":false}" | head -c 200
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT menu_name,status,sequence FROM sys_menu WHERE id=$MID;"
```
**Expected**: update `code:0`;DB `menu_name=WFW2Edited`、`status=disabled`（'2'→Disabled）、`sequence=50`（order→sequence）。

> 註:`MID` 取得請以單一 `SELECT id FROM sys_menu WHERE menu_name='WFW2Test'` 為準（上方範例 inline 簡化,實際執行用乾淨單句查詢）。

---

## C-V6 [US2]: deleteMenu — 單筆 soft delete

```bash
curl -fsS -X DELETE "http://127.0.0.1:11080/api/systemManage/deleteMenu" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"id\":$MID}" | head -c 150
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT menu_name, deleted_at IS NOT NULL AS soft_deleted FROM sys_menu WHERE id=$MID;"
```
**Expected**: delete `code:0`;`WFW2Edited` row 仍在表內、`soft_deleted = t`（軟刪、非物理刪）。

---

## C-V7 [US2]: batchDeleteMenu — 批次 soft delete

```bash
CHILDID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT id FROM sys_menu WHERE menu_name='WFW2Child';" | tr -d ' ')
curl -fsS -X DELETE "http://127.0.0.1:11080/api/systemManage/batchDeleteMenu" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"ids\":[$CHILDID]}" | head -c 150
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM sys_menu WHERE menu_name LIKE 'WFW2%' AND deleted_at IS NOT NULL;"
```
**Expected**: batchDelete `code:0` + `deletedCount` ≥ 1;`WFW2%` 全部 `deleted_at` 已標記（count = 2)。

---

## C-V8: audit log — 寫入同步 sys_operation_log

```bash
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT operation, module_name FROM sys_operation_log WHERE module_name='sys_menu' ORDER BY created_at DESC LIMIT 6;"
```
**Expected**: 近期 `sys_menu` 的 audit 紀錄含 C-V3~C-V7 的 INSERT / UPDATE / 刪除操作（每次寫入 1 筆）。
> `module_name='sys_menu'` 已實證:`sys_menu_service.rs` create/update audit `entity_type: "sys_menu"`、`delete_menu` 經 facade `soft_delete_impls.rs` `ENTITY_TYPE="sys_menu"`;既有 test `soft_delete_basics.rs` 以 `ModuleName.eq("sys_menu")` 過濾佐證。

---

## C-V9: Casbin — policy seed 落 DB + 無權限 role 被拒

```bash
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM casbin_rule WHERE v1 LIKE '%/systemManage/%Menu%' OR v1 IN ('/systemManage/addMenu','/systemManage/updateMenu','/systemManage/deleteMenu','/systemManage/batchDeleteMenu');"
GTOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"GeneralUser","password":"123456"}' | python3 -c "import sys,json;print((json.load(sys.stdin).get('data') or {}).get('token') or '')")
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addMenu" -H "Authorization: Bearer $GTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"menuType":"2","menuName":"X","routeName":"x","routePath":"/x","component":"view.x","order":1,"status":"1","parentId":0,"constant":false}' | grep -o '"code":[0-9]*'
```
**Expected**: casbin_rule 含 4 條新 menu 寫入 path 的 policy row（Soybean/Administrator allow);GeneralUser（ROLE_USER）打 addMenu → `code:5001`（Casbin deny）。

---

## C-V10 [US1+US2+US3]: CDP browser smoke

CDP 控制 Edge（`127.0.0.1:9229`）登入 base-web、走訪 `/manage/menu`:
1. 開新增 modal、填表送出 → 列表出現新菜單。
2. 對某目錄型菜單點「加子菜單」、填表送出 → 新菜單為其子節點。
3. 對某菜單點編輯、改欄位送出 → 列表反映變更。
4. 對該菜單點刪除 → 列表移除。
5. 勾選 + 批次刪除 → 列表移除。
6. **錯誤路徑（驗 FR-013 / spec E-2）**:開新增 modal、填一個與既有菜單重複的 routeName 送出 → 後端拒絕 → 確認 modal 不關閉、顯示錯誤、列表未誤增。
7. **regression（驗 SC-007）**:走訪 `/home` 確認 dashboard + 動態 menu、`/manage/user` 與 `/manage/role` 確認列表渲染。

**Expected**: 步驟 1-5 操作皆成功、列表即時 refresh;步驟 6 modal 保持開啟 + 顯示錯誤;步驟 7 既有功能不退化;全程無非預期 console error;測試菜單測完清除。Edge debug port 不通則 deferred manual-eyeball（比照 W-FW1 / F7）。

---

## C-V11: 三邊 scope verify（zero-regression）

```bash
(cd base-web && git diff HEAD --stat)        # 預期僅 3 檔:system-manage.ts + menu-operate-modal.vue + menu/index.vue
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l   # 預期 0
(cd rust-api && git diff HEAD --stat)        # 預期 ~8 檔（input/sys_menu.rs + input/mod.rs + sys_system_manage_api.rs + sys_system_manage_route.rs + service/admin/mod.rs + 新 migration + datas/mod.rs + lib.rs）、無 sys_menu schema migration
```
**Expected**: base-web 改動限 menu 模組 3 檔;nestjs fork 0 diff;rust-api 改動限 research/data-model 指出的檔、唯一新 migration 為 Casbin seed（無 `sys_menu` schema 改）。

---

## 完成標誌

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust image rebuild | build exit 0 |
| C-V2 | base-web image + dev stack | 5 service healthy + migration exited 0 |
| C-V3 | addMenu 頂層 | `code:0`、menu_type/status/pid 對映正確 |
| C-V4 | addMenu 加子菜單 | `code:0`、pid=父 id、query/buttons/fixedIndexInTab 被忽略 |
| C-V5 | updateMenu | 變更生效（menu_name/status/sequence） |
| C-V6 | deleteMenu soft delete | `deleted_at` 標記、row 留表 |
| C-V7 | batchDeleteMenu | 多筆 soft delete |
| C-V8 | audit log | 寫入同步 sys_operation_log |
| C-V9 | Casbin seed + deny | 4 policy row 落 DB、無權限 role `5001` |
| C-V10 | CDP smoke | 建立/加子菜單/編輯/刪除/批次刪除 + 錯誤路徑(modal 不關) + regression |
| C-V11 | 三邊 scope | base-web 3 檔 / nestjs 0 / rust-api ~8 檔、無 schema migration |

C-V1~C-V11 全 PASS = acceptance PASS、ready for 多段式 commit。
