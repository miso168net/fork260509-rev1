# Verification Commands: 030 — systemManage status/gender alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

13 個 C-V contract = 本 feature 的 verification scenario(US1/US2/US3 acceptance → C-V mapping + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、**dev stack**。psql 經 `docker compose exec postgres`(DB `soybean_admin_rust`、user `soybean`)。預設帳號見 CLAUDE.md §5.1。systemManage 端點經 front-nginx `:11080`。

---

## C-V1: rust-api image rebuild OK

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
**Expected**: build exit 0(`Gender` enum / `map_status` / `map_gender` / entity / DTO / service 改動 cargo build 通過)。

---

## C-V2: migration apply — gender enum + 欄位 + seed

```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC up -d --wait 2>&1 | tail -5
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid WHERE typname='gender' ORDER BY enumlabel;"
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='sys_user' AND column_name='gender';"
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT username, gender FROM sys_user WHERE username IN ('Soybean','Administrator','GeneralUser') ORDER BY username;"
```
**Expected**: `gender` PG enum 有 `female`/`male`;`sys_user.gender` 欄位存在;3 預設用戶 gender 已 seed(Soybean=male / Administrator=male / GeneralUser=female);migration container exited 0。

---

## C-V3: dev stack healthy

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"
```
**Expected**: postgres / redis / rust-api / base-web / front-nginx 全 healthy、migration exited 0。

---

## C-V4 [US1]: getRoleList status 為 "1"/"2"

```bash
TOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -fsS "http://127.0.0.1:11080/api/systemManage/getRoleList?current=1&size=10" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"status":"[^"]*"' | sort -u
```
**Expected**: 所有 `status` 值 ∈ `{"1","2"}`、無 `"enabled"/"disabled"/"banned"`。

---

## C-V5 [US1+US2]: getUserList status + userGender

```bash
curl -fsS "http://127.0.0.1:11080/api/systemManage/getUserList?current=1&size=10" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E '"status"|"userGender"'
```
**Expected**: 每筆 `status` ∈ `{"1","2"}`;`userGender` ∈ `{"1","2",null}`;3 預設用戶 `userGender` 反映 seed(Soybean/Administrator=`"1"`、GeneralUser=`"2"`)。

---

## C-V6 [US1]: getMenuList status 為 "1"/"2"

```bash
curl -fsS "http://127.0.0.1:11080/api/systemManage/getMenuList/v2" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"status":"[^"]*"' | sort -u
```
**Expected**: 所有 `status` ∈ `{"1","2"}`。

---

## C-V7 [US2]: getUserList userGender 篩選

```bash
curl -fsS "http://127.0.0.1:11080/api/systemManage/getUserList?current=1&size=20&userGender=1" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"userGender":"[^"]*"' | sort -u
curl -fsS "http://127.0.0.1:11080/api/systemManage/getUserList?current=1&size=20&userGender=2" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"userGender":"[^"]*"' | sort -u
```
**Expected**: `userGender=1` 結果只含 `"1"`;`userGender=2` 只含 `"2"`。

---

## C-V8 [US3]: create user 帶 gender

```bash
# 經 systemManage addUser(F9 端點)建立帶 gender 的 user
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"domain":"built-in","username":"GenderTest030","password":"123456","nickName":"GenderTest","status":"enabled","gender":"male"}' | head -c 200
# 驗證落 DB
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean \
  -d soybean_admin_rust -tAc "SELECT gender FROM sys_user WHERE username='GenderTest030';"
```
**Expected**: 建立成功、`sys_user.gender` 為 `male`;getUserList 對該 user 回 `userGender:"1"`。
另:建立一個**不帶 `gender` 欄**的 user → 其 `sys_user.gender` 為 `NULL`、getUserList 回 `userGender:null`(SC-008 未填 gender user 相容 / US3 AS-3 覆蓋)。
**Cleanup note**: 2 個測試 user(`GenderTest030` + 不帶 gender 的 user)測完後 psql 清除(`DELETE FROM sys_user WHERE username LIKE 'GenderTest030%'` —— 測試資料、非 seed)。

---

## C-V9 [US3]: update user gender

```bash
# 取 GenderTest030 的 id,update gender male→female
GTID=$(docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean \
  -d soybean_admin_rust -tAc "SELECT id FROM sys_user WHERE username='GenderTest030';" | tr -d ' ')
# 注意:systemManage/updateUser alias 的 HTTP method 為 POST(對齊 F9 alias casbin seed),非 REST 慣例的 PUT
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/updateUser" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$GTID\",\"domain\":\"built-in\",\"username\":\"GenderTest030\",\"password\":\"123456\",\"nickName\":\"GenderTest\",\"status\":\"enabled\",\"gender\":\"female\"}" | head -c 200
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean \
  -d soybean_admin_rust -tAc "SELECT gender FROM sys_user WHERE username='GenderTest030';"
```
**Expected**: update 成功、`gender` 變 `female`。

---

## C-V10 [US1]: Banned 收斂為 "2" + warn

```bash
# 暫把一個 role 的 status 設 banned、curl 驗、還原
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean \
  -d soybean_admin_rust -tAc "UPDATE sys_role SET status='banned' WHERE code='ROLE_USER';"
curl -fsS "http://127.0.0.1:11080/api/systemManage/getRoleList?current=1&size=10" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"roleCode":"ROLE_USER"[^}]*' | grep -o '"status":"[^"]*"'
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs rust-api --tail 30 | grep -i "banned" || echo "(查 warn log)"
# 還原
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean \
  -d soybean_admin_rust -tAc "UPDATE sys_role SET status='enabled' WHERE code='ROLE_USER';"
```
**Expected**: `ROLE_USER` 的 `status` 回 `"2"`;rust-api log 有一筆 `Banned` 收斂 `warn`;還原後不留污染。

---

## C-V11: rust unit test — map_status / map_gender

```bash
# 於 rust 容器內跑(host 無 cargo,比照 F7.2/F12 precedent)
docker run --rm -v "$PWD/rust-api":/app -w /app rust:1.86-slim-bookworm \
  cargo test --package server-model map_status 2>&1 | tail -15
docker run --rm -v "$PWD/rust-api":/app -w /app rust:1.86-slim-bookworm \
  cargo test --package server-model map_gender 2>&1 | tail -15
```
**Expected**: `map_status`(Enabled→"1"/Disabled→"2"/Banned→"2")、`map_gender`(Male→"1"/Female→"2"/None→None)單元測試 ok。
**Note**: 確切 package / test path 以 implement 階段為準;host 無 cargo 時於 rust 容器跑。

---

## C-V12 [US1]: CDP smoke — 狀態欄渲染 + INVALID_ARGUMENT 歸零

CDP 控制 Edge(127.0.0.1:9229)登入 base-web、走訪 `/manage/user`、`/manage/role`、`/manage/menu`,擷取 console error。
**Expected**: 三表「狀態」欄顯示「啟用/禁用」標籤(不空白);console 的 vue-i18n `INVALID_ARGUMENT`(`SyntaxError: 17`)錯誤數為 **0**(F14 後巡檢為每 reload 數十筆);user 表「性別」欄對 seed 用戶顯示「男/女」標籤。
**Pass criteria**: INVALID_ARGUMENT 歸零 + 狀態欄渲染。Edge debug port 不通則 deferred manual-eyeball(比照 F7 C-V10);但因本 feature 核心即消除該 console error、CDP 為主要驗收手段,應盡力跑通。

---

## C-V13: 三邊 scope verify(zero-regression)

```bash
git diff HEAD -- base-web/ | wc -l                                  # 預期 0
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l       # 預期 0
(cd rust-api && git diff HEAD --stat)                                # rust-api 改動清單
git status --short
```
**Expected**: base-web / nestjs fork 各 0 diff;rust-api 改動限 `sea_orm_active_enums.rs` + `sys_user.rs`(entity)+ `sys_system_manage.rs` + `sys_user.rs`(output)+ `sys_user.rs`(input)+ `sys_user_service.rs` + 1 新 migration + migration 註冊(`lib.rs` / `mod.rs`)。

---

## 完成標誌

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | image rebuild | build exit 0 |
| C-V2 | migration | gender enum + 欄位 + seed 落 DB |
| C-V3 | dev stack | 5 service healthy |
| C-V4 | getRoleList status | status ∈ {"1","2"} |
| C-V5 | getUserList status+gender | status ∈ {"1","2"}、userGender ∈ {"1","2",null} |
| C-V6 | getMenuList status | status ∈ {"1","2"} |
| C-V7 | userGender 篩選 | userGender=1/2 各只回對應性別 |
| C-V8 | create gender | gender 落 DB |
| C-V9 | update gender | gender 變更持久化 |
| C-V10 | Banned 收斂 | status 回 "2" + warn log |
| C-V11 | unit test | map_status/map_gender 測試 ok |
| C-V12 | CDP smoke | INVALID_ARGUMENT 歸零 + 狀態欄渲染 |
| C-V13 | 三邊 scope | base-web/nestjs 0 diff |

C-V1~C-V13 全 PASS = acceptance PASS、ready for 兩段式 commit。
