# Verification Commands: W-FW1 — user-crud-wiring

**Phase**: 1（Design & Contracts）
**Date**: 2026-05-22

11 個 C-V contract = 本 feature 的 verification scenario（US1/US2/US3 acceptance → C-V mapping + zero-regression）。

執行環境:host bash（outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`）、**dev stack**。psql 經 `docker compose exec postgres`（DB `soybean_admin_rust`、user `soybean`)。端點經 front-nginx `:11080`。預設帳號見 CLAUDE.md §5.1。`PC` = `docker compose -f docker-compose.yml -f docker-compose.dev.yml`。

> 形狀對映以 base-web drawer 送出的形狀為準:`addUser`/`updateUser` 收 `{userName, userGender, nickName, userPhone, userEmail, status}`(camelCase);base-web 不送 `password`/`domain`。

---

## C-V1: rust-api image rebuild OK

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
**Expected**: build exit 0（alias DTO / transform handler / `update_user` un-flatten 改動 cargo build 通過）。

---

## C-V2: base-web image rebuild + dev stack healthy

```bash
DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web -f base-web/Dockerfile base-web/ 2>&1 | tail -5
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC up -d --wait 2>&1 | tail -5
$PC ps --format "table {{.Service}}\t{{.State}}"
```
**Expected**: 兩 image build exit 0;5 service healthy + migration exited 0。

---

## C-V3 [US1]: addUser — base-web 形狀建立 user

```bash
TOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"userName":"WFW1Test","userGender":"1","nickName":"WFW1","userPhone":"0900000000","userEmail":"wfw1@test.com","status":"1","userRoles":["ROLE_USER"]}' | head -c 250
```
**Expected**: envelope `code:0 success:true`;`userRoles` 欄被後端忽略不報錯。

---

## C-V4 [US1]: addUser 預設密碼可登入 + 不帶 gender → null

```bash
# 預設密碼登入
curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"WFW1Test","password":"123456"}' | grep -o '"code":[0-9]*' | head -1
# 不帶 userGender 建立 → DB gender NULL
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"userName":"WFW1NoG","nickName":"NoG","status":"1"}' | head -c 150
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT username,gender,status FROM sys_user WHERE username LIKE 'WFW1%' ORDER BY username;"
```
**Expected**: `WFW1Test` 用 `123456` 登入 `code:0`;`WFW1NoG` 的 `gender` 為 NULL;`WFW1Test` `gender=male`（'1'→Male)、`status=enabled`（'1'→Enabled）。

---

## C-V5 [US3]: updateUser — 不帶 password 不改密碼

```bash
UID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT id FROM sys_user WHERE username='WFW1Test';" | tr -d ' ')
PWD_BEFORE=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT password FROM sys_user WHERE username='WFW1Test';" | tr -d ' ')
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/updateUser" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$UID\",\"userName\":\"WFW1Test\",\"userGender\":\"2\",\"nickName\":\"WFW1edited\",\"status\":\"2\"}" | head -c 200
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT nick_name,gender,status FROM sys_user WHERE username='WFW1Test';"
PWD_AFTER=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT password FROM sys_user WHERE username='WFW1Test';" | tr -d ' ')
[ "$PWD_BEFORE" = "$PWD_AFTER" ] && echo "password 未變 ✓" || echo "password 被改 ✗"
```
**Expected**: update `code:0`;`nick_name=WFW1edited`、`gender=female`（'2'→Female)、`status=disabled`;`password` hash 前後一致(不帶 password → 不改)。

---

## C-V6 [US2]: deleteUser — 單筆 soft delete

```bash
curl -fsS -X DELETE "http://127.0.0.1:11080/api/systemManage/deleteUser" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"id\":\"$UID\"}" | head -c 150
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT username, deleted_at IS NOT NULL AS soft_deleted FROM sys_user WHERE username='WFW1Test';"
```
**Expected**: delete `code:0`;`WFW1Test` row 仍在表內、`soft_deleted = t`（軟刪、非物理刪）。

---

## C-V7 [US2]: batchDeleteUser — 批次 soft delete

```bash
NOGID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT id FROM sys_user WHERE username='WFW1NoG';" | tr -d ' ')
curl -fsS -X DELETE "http://127.0.0.1:11080/api/systemManage/batchDeleteUser" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"ids\":[\"$NOGID\"]}" | head -c 150
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM sys_user WHERE username LIKE 'WFW1%' AND deleted_at IS NOT NULL;"
```
**Expected**: batchDelete `code:0`;`WFW1%` 全部 `deleted_at` 已標記（count = 2)。

---

## C-V8: audit log — 寫入同步 sys_operation_log

```bash
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT operation, module_name FROM sys_operation_log WHERE module_name='sys_user' ORDER BY created_at DESC LIMIT 5;"
```
**Expected**: 近期 `sys_user` 的 audit 紀錄含 C-V3~C-V7 的 INSERT / UPDATE / 刪除操作（每次寫入 1 筆)。

---

## C-V9: Casbin enforce — 無權限 role 被拒

```bash
GTOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"GeneralUser","password":"123456"}' | python3 -c "import sys,json;print((json.load(sys.stdin).get('data') or {}).get('token') or '')")
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" -H "Authorization: Bearer $GTOKEN" \
  -H 'Content-Type: application/json' -d '{"userName":"X","nickName":"X","status":"1"}' | grep -o '"code":[0-9]*'
```
**Expected**: GeneralUser（ROLE_USER）打 addUser → `code:5001`（Casbin deny;transform handler 在 enforcement 之後、不被觸及)。

---

## C-V10 [US1+US2+US3]: CDP browser smoke

CDP 控制 Edge（`127.0.0.1:9229`）登入 base-web、走訪 `/manage/user`:
1. 開新增抽屜、填表送出 → 列表出現新 user。
2. 對該 user 點編輯、改欄位送出 → 列表反映變更。
3. 對該 user 點刪除 → 列表移除。
4. 勾選 + 批次刪除 → 列表移除。
5. **錯誤路徑（驗 FR-014 / spec E-2）**:開新增抽屜、填一個與既有 user 重複的帳號送出 → 後端拒絕 → 確認**抽屜不關閉**、畫面顯示錯誤訊息、列表未誤增。
6. **regression（驗 SC-007 不退化）**:走訪 `/home` 確認 dashboard + 動態 menu 渲染、走訪 `/manage/role` 確認列表讀取正常。

**Expected**: 步驟 1-4 操作皆成功、列表即時 refresh;步驟 5 抽屜保持開啟 + 顯示錯誤、不誤報成功;步驟 6 既有功能不退化;全程無非預期 console error;測試 user 測完清除。Edge debug port 不通則 deferred manual-eyeball（比照 F7 / DESIGN-B §7 precedent)。

---

## C-V11: 三邊 scope verify（zero-regression）

```bash
(cd base-web && git diff HEAD --stat)        # 預期僅 3 檔:system-manage.ts + user-operate-drawer.vue + user/index.vue
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l   # 預期 0
(cd rust-api && git diff HEAD --stat)        # 預期 ~4 檔改（input/sys_user.rs + sys_user_service.rs + sys_system_manage_api.rs + sys_system_manage_route.rs）、無 migration 新增
```
**Expected**: base-web 改動限 user 模組 3 檔;nestjs fork 0 diff;rust-api 改動限 research 指出的檔、無 migration。

---

## 完成標誌

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust image rebuild | build exit 0 |
| C-V2 | base-web image + dev stack | 5 service healthy |
| C-V3 | addUser base-web 形狀 | `code:0`、userRoles 被忽略 |
| C-V4 | 預設密碼 + gender null | `123456` 登入通、不帶 gender → NULL |
| C-V5 | updateUser 不改密碼 | 變更生效、password hash 不變 |
| C-V6 | deleteUser soft delete | `deleted_at` 標記、row 留表 |
| C-V7 | batchDeleteUser | 多筆 soft delete |
| C-V8 | audit log | 寫入同步 sys_operation_log |
| C-V9 | Casbin deny | 無權限 role `5001` |
| C-V10 | CDP smoke | 建立/編輯/刪除/批次刪除 4 操作通 + 錯誤路徑(抽屜不關)+ regression(/home·/manage/role 不退化) |
| C-V11 | 三邊 scope | base-web 3 檔 / nestjs 0 / rust-api ~4 檔無 migration |

C-V1~C-V11 全 PASS = acceptance PASS、ready for 多段式 commit。
