# Verification Commands: F9 — systemManage-alias-router

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

10 個 C-V contract = **10 個 verification scenario**(per spec FR-021 + NFR-004 完成標誌 10/10 PASS、無 unit test、對齊 F11 7 C-V 結構等比放大)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F9 rust-api image 已 rebuild + container recreate + Casbin migration init container rerun。

> 注意:F9 stub envelope 用 actual rust `Res<T>` shape:`{code: 0, data: <stub-data>, msg: "success", success: true}`(per F11 R-Q4)。Deny path envelope shape `{code: 5001, data: null, msg: "您没有访问该资源的权限...", success: false}` HTTP 200(per F11 R-Q6 `casbin_envelope_adapter` wrap)。

---

## C-V1: rust-api image rebuild OK

**Goal**: 驗 F9 rust source patch 後 cargo build 成功、image 重新 tag。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:
- exit 0
- image 重 tag `rust-api:rev1-admin-rust-api`
- warm cache build ≤ 5 min(per NFR-005)、cold ≤ 7 min

**Pass criteria**: docker build exit 0 + image 新 ID(對比 F11 rebuild SHA `82efdc108bed`、F9 預期新 SHA)。

**Failure handling**:
- cargo error → 檢 sea-orm migration register / handler signature / DTO Deserialize derive / service trait method 是否齊備
- `SysSystemManageRouter` 在 `mod.rs` 漏 register、`router_initialization.rs` 漏 import → 檢 mod.rs + lib.rs register
- service method `find_all_enabled` / `find_all_page_keys` 名稱拼錯 → check trait + impl 一致

---

## C-V2: migration init container rerun + 20 row 落 casbin_rule

**Goal**: 驗 F9 Casbin migration `m20260520_a_f9_system_manage_alias_seed.rs` 已執行、20 row 落 DB(per FR-008 + FR-009 + Q1 拍板)。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -5

# migration log 確認:
docker compose logs migration --tail=10

# 等 migration rerun 完成,查 casbin_rule:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT v0, v2, v3 FROM casbin_rule WHERE v2 LIKE '/systemManage/%' ORDER BY v0, v2"

# COUNT verify:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT COUNT(*) FROM casbin_rule WHERE v2 LIKE '/systemManage/%'"
```

**Expected**:
- migration log 含 `Applying migration 'm20260520_a_f9_system_manage_alias_seed'` + `Migration ... has been applied`
- 20 row(2 role × 10 endpoint)
- COUNT = 20

**Pass criteria**:
- 20 row 存在
- 每 row v0 為 `ROLE_SUPER` 或 `ROLE_ADMIN`、v2 為 10 個 `/systemManage/*` endpoint 之一、v3 為 GET/POST/DELETE 對應、v4 為空字串(per F11 R-Q5)

**Failure handling**:
- COUNT < 20 → migration 沒跑、檢 `m20260520_a_f9` 是否 in `datas/mod.rs` + `lib.rs` Migrator vec register
- COUNT > 20 → idempotency bug(rerun INSERT 重複)、需檢 seaql_migrations 表異常
- 0 row 但 migration `exited 0` → migration silent fail、檢 docker compose logs migration

---

## C-V3: Soybean 5 個重用 mount endpoint 全 HTTP 200(per spec US1.2 + R-Q1 update_user 加入)

**Goal**: 驗 F9 5 個重用 mount endpoint 註冊成功 + Casbin policy allow ROLE_SUPER 生效 + 既有 handler 行為對齊。

**Command**:
```bash
# 1) Login Soybean 拿 access_token
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 2) getRoleList:
echo "=== C-V3a: getRoleList ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/systemManage/getRoleList?page=1&size=10"

# 3) getUserList:
echo "=== C-V3b: getUserList ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/systemManage/getUserList?page=1&size=10"

# 4) getMenuList/v2:
echo "=== C-V3c: getMenuList/v2 ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getMenuList/v2

# 5) getMenuTree:
echo "=== C-V3d: getMenuTree ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getMenuTree

# (addUser 在 C-V4a 內驗,因 addUser 寫 DB、與其他 read endpoint 分組)
```

**Expected**(4 個 sub-case 全 HTTP 200):

C-V3a getRoleList(重用 paginated):
```
{"code":0,"data":{"list":[...],"page":1,"size":10,"total":N},"msg":"success","success":true}
---HTTP 200
```

C-V3b getUserList(重用 paginated):
```
{"code":0,"data":{"list":[...],"page":1,"size":10,"total":N},"msg":"success","success":true}
---HTTP 200
```

C-V3c getMenuList/v2(重用 get_menu_list、per R-Q5 字面 path):
```
{"code":0,"data":[...MenuTree array...],"msg":"success","success":true}
---HTTP 200
```

C-V3d getMenuTree(重用 tree_menu):
```
{"code":0,"data":[...MenuTree array...],"msg":"success","success":true}
---HTTP 200
```

**Pass criteria**:
- 4/4 sub-case HTTP 200
- envelope `code=0` + `msg="success"` + `success=true`
- 各 endpoint `data` field 對齊 E9:paginated(getRoleList / getUserList)/ MenuTree array(getMenuList/v2 / getMenuTree)
- C-V3c `/getMenuList/v2` 字面 path 解析正確、不被誤判為 path param

**Failure handling**:
- HTTP 404 → endpoint 未註冊、檢 `sys_system_manage_route.rs` mount + `router_initialization.rs` merge_router! register
- HTTP 401 → access_token 失效、檢 login response 是否含 `data.token`
- HTTP 403 → envelope wrap path 或 Casbin policy 未 allow ROLE_SUPER、檢 C-V2 migration row
- HTTP 200 + envelope code:5001 → Casbin enforce 視 ROLE_SUPER 為 deny、檢 m20260520 v0 row + g rule
- HTTP 502(C-V3c)→ axum route `/v2` 解析衝突(per R-Q5 預期不發生、若發生 → cargo build 已不 catch、改路徑或拆 `/v2` 為 query string)

---

## C-V4: Soybean 4 個變形 + 新做 endpoint(addUser + updateUser + deleteUser + batchDeleteUser)(per spec US1.3)

**Goal**: 驗 F9 變形 wrapper + 新做 stub 行為對齊 brainstorm Q3 拍板。

**Command**:
```bash
# 0) Test-user 預先建一個(避免污染 seed user)
echo "=== C-V4a: addUser(create test user) ==="
ADD_USER_RESPONSE=$(curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"username":"f9-test-user","password":"test123","email":"f9test@example.com","roleId":"<some-role-id>"}' \
  http://127.0.0.1:11080/api/systemManage/addUser)
echo "$ADD_USER_RESPONSE"
TEST_USER_ID=$(echo "$ADD_USER_RESPONSE" | head -n -2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))")
echo "TEST_USER_ID=$TEST_USER_ID"

# 1) updateUser POST + body(per R-Q1 重用既有 update_user handler):
echo "=== C-V4b: updateUser(POST + body) ==="
curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"id\":\"$TEST_USER_ID\",\"username\":\"f9-test-user-updated\",\"status\":1}" \
  http://127.0.0.1:11080/api/systemManage/updateUser

# 2) deleteUser DELETE + body(per R-Q4 變形 wrapper):
echo "=== C-V4c: deleteUser(body id) ==="
curl -s -w "\n---HTTP %{http_code}\n" -X DELETE \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"id":"non-existent-user-id"}' \
  http://127.0.0.1:11080/api/systemManage/deleteUser

# 3) batchDeleteUser DELETE + body(per Q3 partial-success counter):
echo "=== C-V4d: batchDeleteUser(部分存在 + 部分不存在) ==="
curl -s -w "\n---HTTP %{http_code}\n" -X DELETE \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"ids\":[\"$TEST_USER_ID\",\"non-existent-1\",\"non-existent-2\"]}" \
  http://127.0.0.1:11080/api/systemManage/batchDeleteUser
```

**Expected**:

C-V4a addUser(per E9):
```
{"code":0,"data":{"id":"...","username":"f9-test-user",...},"msg":"success","success":true}
---HTTP 200
```

C-V4b updateUser(per R-Q1 重用 update_user handler):
```
{"code":0,"data":{"id":"...","username":"f9-test-user-updated",...},"msg":"success","success":true}
---HTTP 200
```

C-V4c deleteUser(per R-Q4 變形 wrapper、id 不存在預期 envelope error 但 HTTP 200):
```
{"code":<error_code>,"data":null,"msg":"<message>","success":false}
---HTTP 200
```
(視既有 SysUserService::delete_user 對 id 不存在的行為而定、envelope wrap 即可)

C-V4d batchDeleteUser(per Q3 + spec FR-004):
```
{"code":0,"data":{"deletedCount":N},"msg":"success","success":true}
---HTTP 200
```
N ∈ [0, 3](視既有 service 對 id 不存在反應、test user id 預期 success、non-existent 預期 fail → N = 1)

**Pass criteria**:
- 4/4 sub-case HTTP 200
- C-V4a 創建 test user 成功、有 id 返回
- C-V4b updateUser POST 路徑 + body 對齊既有 update_user handler、payload 解析成功
- C-V4c deleteUser body 抽 id → service call、HTTP 200(error 由 envelope wrap)
- C-V4d batchDeleteUser 永遠 HTTP 200 + `{deletedCount: N}`(per Q3)、N 是 success counter

**Failure handling**:
- C-V4a HTTP 4xx → addUser body shape 不對齊既有 create_user 預期、檢 ValidatedForm<CreateUserInput> 對 body 解析
- C-V4b HTTP 4xx → updateUser body shape(可能漏 required field)、檢既有 UpdateUserInput DTO
- C-V4c HTTP 4xx → body shape `{id}` 與新 DTO `DeleteUserByBodyInput` 不對齊
- C-V4d 永遠 HTTP 200 但 `{deletedCount: 0}` 即使有 valid id → service.delete_user 對 valid id 也 Err、檢 service log

---

## C-V5: Soybean 2 個新做完整 handler endpoint(getAllRoles + getAllPages)(per spec US1.4)

**Goal**: 驗 F9 新做完整 handler 行為對齊 brainstorm Q1 + Q5。

**Command**:
```bash
# 1) getAllRoles(per E2 + E4):
echo "=== C-V5a: getAllRoles ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getAllRoles

# 2) getAllPages(per E3 + E5):
echo "=== C-V5b: getAllPages ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getAllPages
```

**Expected**:

C-V5a getAllRoles(per E2、SELECT * FROM sys_role WHERE status=Enabled AND deleted_at IS NULL):
```
{"code":0,"data":[{"id":"...","name":"ROLE_SUPER","status":1,...},{"id":"...","name":"ROLE_ADMIN",...},{"id":"...","name":"ROLE_USER",...}],"msg":"success","success":true}
---HTTP 200
```
data: Vec<SysRoleModel>、預期含 3 個 seed role(全 status=Enabled)

C-V5b getAllPages(per E3、SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL):
```
{"code":0,"data":["page_name_1","page_name_2",...],"msg":"success","success":true}
---HTTP 200
```
data: Vec<String>、預期含 sys_menu 表 distinct name(F5.1 seed 44+ menu name)

**Pass criteria**:
- 2/2 sub-case HTTP 200
- C-V5a `data` 為 array、含至少 3 個 role(SUPER + ADMIN + USER)
- C-V5b `data` 為 string array、含至少 10+ page name(F5.1 seed sys_menu 約 44 menu row)

**Failure handling**:
- C-V5a HTTP 500 → SysRoleService::find_all_enabled 實作錯、檢 service log + SQL
- C-V5a empty array → DB 全 disabled、檢 sys_role.status
- C-V5b HTTP 500 → SysMenuService::find_all_page_keys 實作錯、檢 service log
- C-V5b empty array → sys_menu 全 deleted_at 設值、檢 F5.1 seed

---

## C-V6: GeneralUser 1 endpoint deny(getUserList 代表、per F11 R-Q6 envelope wrap)(per spec US2)

**Goal**: 驗 Casbin policy deny GeneralUser(ROLE_USER)對 F9 alias endpoint 生效。

**Command**:
```bash
# 1) Login GeneralUser 拿 access_token
GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 2) GeneralUser getUserList(代表 endpoint、其餘 9 條同 Casbin row pattern、不重複驗 per Q4 同精神)
echo "=== C-V6: GeneralUser getUserList ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $GU_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getUserList
```

**Expected**(per F11 R-Q6):
```
{"code":5001,"data":null,"msg":"您没有访问该资源的权限，请联系管理员","success":false}
---HTTP 200
```

**Pass criteria**:
- HTTP **200**(envelope-wrapped、非 raw 403)
- envelope body `code=5001` + `success=false` + `data=null`
- msg 含「您没有访问该资源的权限」字串
- **不**回 paginated user data(allow path 必含)

**Failure handling**:
- HTTP 200 + envelope `{code:0, data: paginated}` → Casbin policy 對 GeneralUser allow 了、檢 m20260520 不該含 ROLE_USER row
- HTTP 401 → access_token 失效、檢 GeneralUser 密碼是否仍為 `123456`
- HTTP 403(raw)→ casbin_envelope_adapter 沒 wrap、檢 middleware wire(F11 已驗 wire 正常)
- HTTP 500 → Casbin enforce error、檢 docker compose logs rust-api

---

## C-V7: batchDeleteUser audit log 寫入驗(per spec US1.5 + FR-016)

**Goal**: 驗 F9 batchDeleteUser per-row loop call 既有 SysUserService::delete_user 觸發既有 audit hook、繼承 §1.5 紀律。

**Command**(承接 C-V4d 後跑):
```bash
echo "=== C-V7: batchDelete audit log ==="
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT user_id, operation, created_at FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '5 minutes' AND operation LIKE '%delete%user%' ORDER BY created_at DESC LIMIT 10"

echo "---COUNT verify---"
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT COUNT(*) FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '5 minutes' AND operation LIKE '%delete%user%'"
```

**Expected**:
- 至少 1 row in sys_operation_log within 5 min(per row delete 既有 service hook 寫入)
- COUNT ≥ 1(per C-V4d 若 test user id 成功 delete、預期 1 row;若 service 對 non-existent id 也寫 audit → N row)

**Pass criteria**:
- COUNT ≥ 1
- row content 包含 actor(Soybean user_id)、operation 含 `delete` keyword、時間在 5 min 內

**Failure handling**:
- COUNT = 0 → 既有 SysUserService::delete_user 沒寫 audit / hook 在 service 之外、檢 service 實作(可能既有 audit 邏輯不在 delete_user 內)
- COUNT > expected → 額外 audit row、check service hook 是否重複觸發

---

## C-V8: three-side scope verify(per spec FR-010 + FR-011 + FR-012 + SC-011/012/013)

**Goal**: 驗 F9 base-web + nestjs fork **三邊零改動**、rust-api scope 收緊到 12 file(per Section 2 file 結構)。

**Command**:
```bash
echo "=== base-web/src/ diff ==="
git diff HEAD -- base-web/src/ | wc -l
echo "預期: 0"

echo ""
echo "=== fork260509-soybean-admin-nestjs/ diff ==="
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "預期: 0"

echo ""
echo "=== rust-api scope(預期 12 file:7 改 + 2 新建 + 3 register/mod)==="
(cd rust-api && git diff HEAD --stat)
(cd rust-api && git status --short)

echo ""
echo "=== docker-compose 變動(預期 0)==="
git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l

echo ""
echo "=== outer scope ==="
git status --short
```

**Expected**:
- base-web/src/ diff = **0 line**
- nestjs fork diff = **0 line**
- rust-api 12 file diff:
  - `server/api/src/admin/sys_user_api.rs`(改 +~40 LOC、per R-Q1 修正:2 個新 handler、非 3 個)
  - `server/api/src/admin/sys_role_api.rs`(改 +~25 LOC)
  - `server/api/src/admin/sys_menu_api.rs`(改 +~20 LOC)
  - `server/service/src/admin/sys_role_service.rs`(改 +~20 LOC)
  - `server/service/src/admin/sys_menu_service.rs`(改 +~15 LOC)
  - `server/model/src/admin/input/sys_user.rs`(改 +~15 LOC)
  - `server/router/src/admin/sys_system_manage_route.rs`(新建 ~80 LOC)
  - `server/router/src/admin/mod.rs`(改 +1 LOC)
  - `server/initialize/src/router_initialization.rs`(改 +~8 LOC)
  - `migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`(新建 ~80 LOC)
  - `migration/src/datas/mod.rs`(改 +1 LOC)
  - `migration/src/lib.rs`(改 +2 LOC)
- docker-compose*.yml diff = 0 line
- outer scope:`CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/021-*/` untracked

**Pass criteria**:
- base-web/src/ + nestjs fork 各 0 diff
- rust-api 12 file ~315 LOC total(per R-Q1 修正後)
- 0 docker-compose diff
- outer 4 file + 1 untracked dir(per F11 same pattern)

**Failure handling**:
- base-web 或 nestjs fork 有 diff → 意外改動、abort F9 + 改正
- rust-api scope > 12 file 或 < 12 file → scope 漂移、檢是否誤改其他 file 或漏 register
- outer 有 docker-compose.yml diff → F9 範疇外、確認後 stash 或 abort

---

## C-V9: W-FA1 stack regression(per spec FR-021 + SC-008)

**Goal**: 驗 F9 build + restart 不破壞 W-FA1 baseline。

**Command**:
```bash
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Expected**:
```
SERVICE       STATE     STATUS
base-web      running   Up X (healthy)
front-nginx   running   Up X (healthy)
nestjs        running   Up X (healthy)
postgres      running   Up X (healthy)
redis         running   Up X (healthy)
rust-api      running   Up Y (healthy)    ← Y < X 因 F9 rebuild + recreate
```

**Pass criteria**:
- 6 long-running service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)
- rust-api uptime Y 小於其他 5 service uptime X(表示 just recreated)
- migration 容器若顯示:exited 0(init container 正常 exit、F9 migration rerun 完成)

**Failure handling**:
- rust-api restart loop → handler panic / migration UNIQUE constraint fail → 檢 docker compose logs rust-api / migration
- 其他 5 service unhealthy → 意外退化、檢 docker compose logs <service>
- migration container exited 非 0 → F9 migration up() 失敗、檢 SQL 與 schema 是否對齊(20 row INSERT)

---

## C-V10: 既有 `/user/*` `/role/*` `/route/*` 3 條 endpoint 不退化(per spec US3.3 + SC-009 + FR-014)

**Goal**: 驗 F9 新加 alias path 不影響既有 router(per Principle IV「base 不改動邊界」+ FR-014「不改既有 m20241024」)。

**Command**:
```bash
echo "=== C-V10a: 既有 GET /user/ ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/user/?page=1&size=10"

echo "=== C-V10b: 既有 GET /role/ ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/role/?page=1&size=10"

echo "=== C-V10c: 既有 GET /route/tree ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/route/tree
```

**Expected**(3/3 全 HTTP 200、行為對齊 F9 落地前):

```
C-V10a: paginated user data envelope HTTP 200
C-V10b: paginated role data envelope HTTP 200
C-V10c: menu tree array envelope HTTP 200
```

**Pass criteria**:
- 3/3 HTTP 200
- envelope `{code:0, data: ..., msg:"success", success:true}` 對齊既有 handler 結果

**Failure handling**:
- C-V10a-c HTTP 200 但 envelope code:5001 → F9 不該影響既有 Casbin enforce、檢 m20241024 既有 row 是否被誤動
- HTTP 404 → 既有 router 退化、檢 router_initialization.rs 是否誤改既有 mount
- HTTP 500 → 既有 handler 退化、檢 rust-api log

---

## 完成標誌

10 個 verification 全 PASS = F9 acceptance 10/10 PASS、ready for Phase 8 two-stage commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA + ≤ 5 min warm |
| C-V2 | migration rerun + 20 row | COUNT = 20 + (v0, v2, v3) 對齊、v4 全空字串(R-Q5) |
| C-V3 | Soybean 4 重用 mount endpoint | 4/4 HTTP 200 + envelope `{code:0, data, msg, success}` + paginated/tree shape 對齊 |
| C-V4 | Soybean addUser + updateUser + deleteUser + batchDeleteUser | 4/4 HTTP 200 + batchDelete `{deletedCount: N}` partial counter |
| C-V5 | Soybean getAllRoles + getAllPages | 2/2 HTTP 200 + Vec<Role> + Vec<String> 反映實際 sys_role / sys_menu 資料 |
| C-V6 | GeneralUser deny(getUserList 代表) | HTTP 200 + envelope `{code:5001, success:false}`(R-Q6 envelope wrap) |
| C-V7 | batchDelete audit log 寫入 | sys_operation_log COUNT ≥ 1 內 5 min |
| C-V8 | three-side scope | base-web/nestjs 0 diff + rust-api 12 file + 0 docker-compose |
| C-V9 | W-FA1 stack regression | 6 healthy + rust-api 剛 recreated + migration exited 0 |
| C-V10 | 既有 `/user/*` `/role/*` `/route/*` 3 條不退化 | 3/3 HTTP 200 + 對齊 F9 落地前 |
