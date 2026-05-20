# Verification Commands: F7 — manage-crud-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

11 個 C-V contract = **11 個 verification scenario**(per spec NFR-004 完成標誌 13 US scenarios → 11 C-V mapping、含 C-V10 3 個 CDP sub-case;對齊 F9 10 C-V 結構等比放大、加 CDP smoke)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F7 rust-api image 已 rebuild + container recreate + Casbin migration init container rerun;CDP browser via WSL2 host Edge 148 + remote-debugging-port(per R-Q4)。

> 注意:F7 5 條 read alias envelope shape 由 F7 Output DTO 規範(per data-model E1-E5):`{code: 0, data: <camelCase-shape>, msg: "success", success: true}`(per F11 R-Q4)。Deny path envelope shape `{code: 5001, data: null, msg: "您没有访问该资源的权限...", success: false}` HTTP 200(per F11 R-Q6 `casbin_envelope_adapter` wrap)。

---

## C-V1: rust-api image rebuild OK

**Goal**:驗 F7 rust source patch 後 cargo build 成功、image 重新 tag。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:
- exit 0
- image 重 tag `rust-api:rev1-admin-rust-api`
- warm cache build ≤ 5 min(per NFR-005)、cold ≤ 7 min

**Pass criteria**:docker build exit 0 + image 新 ID(對比 F9 rebuild SHA、F7 預期新 SHA)。

**Failure handling**:
- cargo error → 檢 sea-orm migration register / handler signature / DTO import / From impl 是否齊備
- `unused import` → cargo -D warnings 嚴格、check sys_system_manage.rs imports + sys_system_manage_api.rs imports
- `cannot find type SystemManageXxxOutput` → 檢 output/mod.rs re-export + sys_system_manage.rs struct 拼字

---

## C-V2: migration init container rerun + 15 row 落 casbin_rule

**Goal**:驗 F7 Casbin migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` 已執行、15 row 落 DB(per FR-011 + FR-012 + Q3 拍板)。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -5
docker compose logs migration --tail=10

# 等 migration rerun 完成、查 casbin_rule:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT v0, v2, v3 FROM casbin_rule WHERE v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%' ORDER BY v2, v3"

# COUNT verify:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT COUNT(*) FROM casbin_rule WHERE v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'"
```

**Expected**:
- migration log 含 `Applying migration 'm20260521_a_f7_admin_role_existing_paths_seed'` + `Migration ... has been applied`
- 15 row(6 `/user/*` + 5 `/role/*` + 4 `/route/*`)
- COUNT = 15

**Pass criteria**:
- 15 row 存在
- 每 row v0 為 `ROLE_ADMIN`、v2 為 15 個既有 path 之一、v3 為 GET/POST/PUT/DELETE 對應、v4 為空字串(per F11 R-Q5)

**Failure handling**:
- COUNT < 15 → migration 沒跑、檢 `m20260521_a_f7` 是否 in `datas/mod.rs` + `lib.rs` Migrator vec register
- COUNT > 15 → idempotency bug(rerun INSERT 重複)、需檢 seaql_migrations 表異常
- 0 row 但 migration `exited 0` → migration silent fail、檢 docker compose logs migration

---

## C-V3: Soybean 5 條 read alias shape 對齊(per spec US1.2 + data-model E9)

**Goal**:驗 F7 5 條 read alias 新 wrapper handler 註冊成功 + Casbin policy allow ROLE_SUPER 生效 + response data 含 base TS type 預期 field name + 缺欄位 hardcode null/[]。

**Command**:
```bash
# 1) Login Soybean 拿 access_token
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 2) getRoleList shape 驗:
echo "=== C-V3a: getRoleList shape ==="
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/systemManage/getRoleList?current=1&size=10" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); first=r['data']['records'][0]; \
    print(f'roleName={first.get(\"roleName\")} | roleCode={first.get(\"roleCode\")} | roleDesc={first.get(\"roleDesc\")} | status={first.get(\"status\")}')"

# 3) getAllRoles shape 驗:
echo "=== C-V3b: getAllRoles shape ==="
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getAllRoles | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(f'count={len(r[\"data\"])} | first={r[\"data\"][0]}')"

# 4) getUserList shape 驗:
echo "=== C-V3c: getUserList shape ==="
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/systemManage/getUserList?current=1&size=10" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); first=r['data']['records'][0]; \
    print(f'userName={first.get(\"userName\")} | userGender={first.get(\"userGender\")} | nickName={first.get(\"nickName\")} | userPhone={first.get(\"userPhone\")} | userEmail={first.get(\"userEmail\")} | userRoles={first.get(\"userRoles\")}')"

# 5) getMenuList/v2 shape 驗:
echo "=== C-V3d: getMenuList/v2 shape ==="
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getMenuList/v2 | \
  python3 -c "import sys,json; r=json.load(sys.stdin); first=r['data'][0]; \
    print(f'parentId={first.get(\"parentId\")} | menuType={first.get(\"menuType\")} | menuName={first.get(\"menuName\")} | order={first.get(\"order\")} | buttons={first.get(\"buttons\")} | children={first.get(\"children\")}')"

# 6) getMenuTree shape 驗:
echo "=== C-V3e: getMenuTree shape (極簡 4 field) ==="
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getMenuTree | \
  python3 -c "import sys,json; r=json.load(sys.stdin); first=r['data'][0]; \
    print(f'keys={list(first.keys())} | id={first.get(\"id\")} | label={first.get(\"label\")} | pId={first.get(\"pId\")}')"
```

**Expected**(5 個 sub-case 全 PASS):

C-V3a getRoleList:
- `roleName` 為 "超级管理员" / "管理员" / "用户"(非 undefined)
- `roleCode` 為 "ROLE_SUPER" / "ROLE_ADMIN" / "ROLE_USER"
- `roleDesc` 非 undefined(可為 ""、null unwrap 後)
- `status` 為 "enabled"

C-V3b getAllRoles:
- count ≥ 2(enabled role)
- first row keys 為 `{id, roleName, roleCode}` 3 個 field(無 `roleDesc / status / createdAt` 等)

C-V3c getUserList:
- `userName` 為 "Soybean"(seed)、`nickName` 非 empty
- `userGender` 為 `null`(hardcode None per Q2)
- `userPhone` / `userEmail` 為 string 或 null
- `userRoles` 為 `[]`(hardcode vec![] per Q2)

C-V3d getMenuList/v2:
- `parentId` 為 String("0" for root)
- `menuType` 為 "1" / "2"(string、非 "menu"/"directory")
- `order` 為 int(rust sequence rename 後)
- `buttons` / `children` 為 `null`(hardcode None)

C-V3e getMenuTree:
- keys = exactly `['id', 'label', 'pId', 'children']` 4 個 field(注意 `pId` 大寫 I)
- `label` 非 undefined(menu_name 映射過去)
- `id` 為 int

**Pass criteria**:
- 5/5 sub-case 各 field 非 undefined
- C-V3a roleDesc:rust description 為 None 時、F7 unwrap_or_default 為 ""
- C-V3c userGender:hardcode None
- C-V3d menuType:string "1"/"2" 不是 "menu"/"directory"
- C-V3e keys exactly 4 field

**Failure handling**:
- field 為 undefined → F7 Output DTO 漏 field 或 From impl 漏 mapping、check `output/sys_system_manage.rs`
- `menuType` 仍 "menu" → map_menu_type 沒 call、check sys_system_manage_api.rs `.into()` 是否用 SystemManageMenuOutput
- C-V3e keys > 4 field → SystemManageMenuTreeNodeOutput 多了 field、check struct definition

---

## C-V4: Administrator 5 條 read alias allow + shape 對齊(per spec US2.2)

**Goal**:驗 F9 既有 m20260520 對 ROLE_ADMIN allow + F7 shape mapping 對 ROLE_ADMIN 同樣生效。

**Command**:
```bash
# 1) Login Administrator
ADMIN_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Administrator","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 2) Administrator 5 條 read alias(C-V3 同範圍、token 不同):
for endpoint in "getRoleList?current=1&size=10" "getAllRoles" "getUserList?current=1&size=10" "getMenuList/v2" "getMenuTree"; do
  echo "=== C-V4: Administrator /systemManage/${endpoint} ==="
  curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
    "http://127.0.0.1:11080/api/systemManage/${endpoint}" | head -c 200
done
```

**Expected**:5/5 endpoint HTTP 200 + envelope `{code:0, success:true}` + data shape 對齊 ROLE_SUPER(C-V3)。

**Pass criteria**:Administrator 5 條 read alias 全 allow + envelope code:0 + shape 與 Soybean 一致。

**Failure handling**:
- HTTP 200 + envelope code:5001 → Casbin 對 ROLE_ADMIN allow row 漏(F9 m20260520 sloppy)、檢 psql casbin_rule
- shape 與 C-V3 不一致 → handler 對 ROLE_ADMIN 用了不同 path、應該不會發生(同 wrapper handler)

---

## C-V5: Administrator 既有 `/api/user/* /api/role/*` 5 條 path allow(解 A-006、per spec US2.3)

**Goal**:驗 F7 m20260521 補的 ROLE_ADMIN allow 對既有 path 生效、解 spec A-006。

**Command**:
```bash
# 已有 ADMIN_TOKEN

echo "=== C-V5a: Administrator GET /api/user ==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:11080/api/user?current=1&size=10" | head -c 200

echo "=== C-V5b: Administrator GET /api/role ==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:11080/api/role?current=1&size=10" | head -c 200

echo "=== C-V5c: Administrator POST /api/user(body 預期會 deserialize error 或建立成功、但非 5001 deny)==="
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"username":"f7-admin-test","password":"test123","email":"f7admin@example.com","domain":"built-in","nickName":"F7 Admin Test","status":"enabled","roleIds":["2"]}' \
  http://127.0.0.1:11080/api/user | head -c 200

echo "=== C-V5d: Administrator GET /api/user/1 ==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:11080/api/user/1 | head -c 200

echo "=== C-V5e: Administrator GET /api/role/1 ==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:11080/api/role/1 | head -c 200
```

**Expected**:5/5 endpoint HTTP 200 + envelope code:0 或業務 error 但 **非 5001 deny**。

**Pass criteria**:
- 5/5 endpoint HTTP 200
- envelope code 非 5001(若是 5001 → A-006 未解、F7 migration 漏 row)
- code:0(read 成功)或業務 error(如 username conflict 等)but 非 5001

**Failure handling**:
- envelope code:5001 → F7 m20260521 對應 row 漏、check FR-012 15 row 完整
- HTTP 404 → 既有 router 變動(不應發生、F7 不動既有 router)、check git diff

---

## C-V6: Menu CRUD admin path POST/PUT/DELETE `/api/route/`(per spec US3.2 + DESIGN-A §1.1)

**Goal**:驗 F7 補 ROLE_ADMIN 對 `/route/* write` Casbin allow 後 Menu CRUD admin path 工作 + 軟刪 + audit 整合。

**Command**:
```bash
# 已有 ADMIN_TOKEN

echo "=== C-V6a: Administrator POST /api/route/(create menu)==="
NEW_MENU_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "pid": "0",
    "menuType": "menu",
    "menuName": "f7-test-menu",
    "routeName": "f7-test-menu",
    "routePath": "/f7-test-menu",
    "component": "layout.base$view.f7-test-menu",
    "iconType": 1,
    "icon": "",
    "status": "enabled",
    "sequence": 999,
    "constant": false,
    "i18nKey": "route.f7-test-menu",
    "keepAlive": false,
    "multiTab": false,
    "hideInMenu": false
  }' \
  http://127.0.0.1:11080/api/route/)
echo "$NEW_MENU_RESPONSE" | head -c 200
NEW_MENU_ID=$(echo "$NEW_MENU_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "NEW_MENU_ID=$NEW_MENU_ID"

echo "=== C-V6b: Administrator PUT /api/route/(update menu)==="
curl -s -w "\nHTTP %{http_code}\n" -X PUT -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"id\": $NEW_MENU_ID,
    \"pid\": \"0\",
    \"menuType\": \"menu\",
    \"menuName\": \"f7-test-menu-updated\",
    \"routeName\": \"f7-test-menu\",
    \"routePath\": \"/f7-test-menu\",
    \"component\": \"layout.base\$view.f7-test-menu\",
    \"iconType\": 1,
    \"icon\": \"\",
    \"status\": \"enabled\",
    \"sequence\": 999,
    \"constant\": false,
    \"i18nKey\": \"route.f7-test-menu\",
    \"keepAlive\": false,
    \"multiTab\": false,
    \"hideInMenu\": false
  }" \
  http://127.0.0.1:11080/api/route/ | head -c 200

echo "=== C-V6c: Administrator DELETE /api/route/{id}(delete + soft)==="
curl -s -w "\nHTTP %{http_code}\n" -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:11080/api/route/$NEW_MENU_ID" | head -c 200

echo "=== C-V6d: psql 驗 soft delete + audit ==="
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT id, menu_name, deleted_at FROM sys_menu WHERE id = $NEW_MENU_ID"
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT user_id, operation, entity_id, created_at FROM sys_operation_log WHERE entity_id = '$NEW_MENU_ID' AND operation = 'SOFT_DELETE' ORDER BY created_at DESC LIMIT 3"
```

**Expected**:
- C-V6a HTTP 200 + envelope code:0 + new menu id 返回
- C-V6b HTTP 200 + envelope code:0
- C-V6c HTTP 200 + envelope code:0
- C-V6d sys_menu.deleted_at NOT NULL(soft delete 觸發)+ sys_operation_log SOFT_DELETE row(audit 觸發)

**Pass criteria**:
- 3/3 endpoint HTTP 200 + envelope code:0
- soft delete:sys_menu.deleted_at NOT NULL
- audit:sys_operation_log COUNT ≥ 1 for entity_id=NEW_MENU_ID

**Failure handling**:
- C-V6a-c envelope code:5001 → F7 m20260521 對 /route/ POST/PUT/DELETE row 漏、check FR-012
- C-V6c HTTP 200 但 deleted_at IS NULL → 既有 service 沒 trigger soft delete(F3 facade 漏)、check service log
- C-V6d sys_operation_log 0 row → 既有 service 沒 trigger audit(F2.1 hook 漏)、留 implement-time finding

---

## C-V7: GeneralUser deny regression(per spec US3.3 + F11 R-Q6)

**Goal**:驗 F7 不影響 ROLE_USER deny 行為(fail-safe regression、Principle I)。

**Command**:
```bash
GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "=== C-V7a: GeneralUser GET /api/user(既有 path)==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $GU_TOKEN" \
  http://127.0.0.1:11080/api/user | head -c 200

echo "=== C-V7b: GeneralUser GET /api/systemManage/getUserList(alias)==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $GU_TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getUserList | head -c 200
```

**Expected**:
- C-V7a HTTP 200 + envelope `{code:5001, success:false, msg:"您没有访问该资源的权限"}`(per F11 R-Q6 envelope wrap)
- C-V7b 同上(F9 m20260520 對 ROLE_USER 不 allow、F7 m20260521 也只 allow ROLE_ADMIN)

**Pass criteria**:
- 2/2 endpoint HTTP 200(envelope-wrapped、非 raw 403)
- envelope body code:5001 + success:false + data:null
- ROLE_USER 仍 default deny、fail-safe 維持

**Failure handling**:
- envelope code:0 → F7 誤對 ROLE_USER allow、check FR-012 15 row 不該含 ROLE_USER
- HTTP 403(raw)→ casbin_envelope_adapter 沒 wrap、check middleware wire

---

## C-V8: three-side scope verify(per spec FR-015 + FR-016 + FR-017 + SC-014/015/016)

**Goal**:驗 F7 base-web + nestjs + docker-compose **三邊零改動**、rust-api scope 收緊到 8 file。

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
echo "=== rust-api scope(預期 8 file)==="
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
- rust-api scope:
  - `server/model/src/admin/output/sys_system_manage.rs`(**新建** ~120 LOC)
  - `server/model/src/admin/output/mod.rs`(改 +1 LOC)
  - `server/api/src/admin/sys_system_manage_api.rs`(**新建** ~80 LOC)
  - `server/api/src/admin/mod.rs`(改 +2 LOC)
  - `server/router/src/admin/sys_system_manage_route.rs`(改 ~10 LOC)
  - `migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs`(**新建** ~60 LOC)
  - `migration/src/datas/mod.rs`(改 +1 LOC)
  - `migration/src/lib.rs`(改 +2 LOC)
  - **共 8 file ~275 LOC**(6 改 + 2 新建)
- docker-compose*.yml diff = 0 line
- outer scope:`CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/022-*` untracked

**Pass criteria**:
- base-web/src/ + nestjs fork 各 0 diff
- rust-api 8 file ~275 LOC total
- 0 docker-compose diff
- outer 4 file + 1 untracked dir(per F9/F11 same pattern)

**Failure handling**:
- base-web 或 nestjs fork 有 diff → 意外改動、abort F7 + 改正
- rust-api scope > 8 file 或 < 8 file → scope 漂移、檢是否誤改其他 file 或漏 register
- outer 有 docker-compose.yml diff → F7 範疇外、確認後 stash 或 abort

---

## C-V9: W-FA1 stack regression(per spec FR-025 + SC-011)

**Goal**:驗 F7 build + restart 不破壞 W-FA1 baseline。

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
rust-api      running   Up Y (healthy)    ← Y < X 因 F7 rebuild + recreate
```

**Pass criteria**:
- 6 long-running service healthy
- rust-api uptime Y 小於其他 5 service uptime X
- migration 容器若顯示:exited 0(init container 正常 exit、F7 migration rerun 完成)

**Failure handling**:
- rust-api restart loop → handler panic / migration UNIQUE constraint fail → 檢 docker compose logs rust-api / migration
- 其他 5 service unhealthy → 意外退化、檢 docker compose logs <service>

---

## C-V10: CDP browser smoke test 3 view + column render(per spec US1.3-5 + R-Q4)

**Goal**:驗 F7 shape mapping 真實 落地、base view 真實 render 含 base TS type 預期欄位(不是 undefined / blank)。

**Pre-requisite**:WSL2 host Edge 148 已 launched + `--remote-debugging-port=9222`、Edge 可 access `http://127.0.0.1:11080`。

**Command**(沿用 F5.1 follow-up CDP setup pattern):

```bash
# Helper: 跑 CDP JavaScript expression、回 result JSON
cdp_eval() {
  local expression="$1"
  local target_id=$(curl -fsS http://127.0.0.1:9222/json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
  # 用 websocat 或 chrome-devtools-protocol library;簡化版本用 curl JSON-RPC
  # (具體 implement 階段細化、可參考 F5.1 follow-up script)
  echo "(CDP eval pseudocode for: $expression)"
}

# === C-V10a: manage/user view ===
echo "=== C-V10a: navigate to /manage/user + DOM query ==="
# 1. CDP Page.navigate to http://127.0.0.1:11080/manage/user
# 2. Wait for table render(`document.querySelector('table.naive-data-table tbody tr')`)
# 3. cdp_eval "document.querySelector('table.naive-data-table tbody tr').textContent" 
# 4. assert column 含 "Soybean" / userName / nickName 等 base TS type 預期 field
cdp_eval 'document.querySelector(".n-data-table-tbody tr td:nth-child(2)").textContent'  # userName column

# === C-V10b: manage/role view ===
echo "=== C-V10b: navigate to /manage/role + DOM query ==="
# 同 a:navigate to /manage/role、DOM query first row roleName column
cdp_eval 'document.querySelector(".n-data-table-tbody tr td:nth-child(2)").textContent'  # roleName column

# === C-V10c: manage/menu view ===
echo "=== C-V10c: navigate to /manage/menu + DOM query ==="
# 同 a:navigate to /manage/menu、DOM query first row menuName column
cdp_eval 'document.querySelector(".n-data-table-tbody tr td:nth-child(3)").textContent'  # menuName column
```

> **CDP test 細節**:具體 implement 階段對齊 F5.1 follow-up 既有 CDP setup script(`tests/cdp-*.sh` 之類、若存在;若不存在屬 F5.1 follow-up local-only setup、F7 implement 階段抽出 + commit 為 inline acceptance bash);per R-Q4。

**Expected**:
- C-V10a `manage/user` first row userName column = "Soybean"(seed user)+ nickName / userPhone / userEmail 非 undefined
- C-V10b `manage/role` first row roleName column = "超级管理员"(seed)+ roleCode = "ROLE_SUPER"
- C-V10c `manage/menu` first row menuName / routeName / routePath 非 undefined + parentId 為 String

**Pass criteria**:
- 3/3 view load 成功
- DOM query 拿到具體 row data 含 base TS type 預期 field 值(非 empty / undefined)
- 對應 base example view column key 對齊 F7 Output DTO

**Failure handling**:
- column 顯示 "undefined" 或 blank → F7 Output DTO 漏 field 或 From impl 漏 mapping、check 對應 entity(C-V10a → SystemManageUserOutput / C-V10b → SystemManageRoleOutput / C-V10c → SystemManageMenuOutput)
- table 不渲染 → SPA route fail、check base example 各 view 是否依賴 base 缺的 fetch fn(若是、F7 不負責)
- CDP setup 失敗 / Edge crash → fall back to manual browser navigate + visual eyeball(per R-Q4 graceful degradation)

---

## 完成標誌

11 個 verification 全 PASS = F7 acceptance 11/11 PASS、ready for Phase 8 two-stage commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA + ≤ 5 min warm |
| C-V2 | migration rerun + 15 row | COUNT = 15 + ROLE_ADMIN 對 /user/* /role/* /route/* path、v4 全空字串(R-Q5) |
| C-V3 | Soybean 5 條 read alias shape 對齊 | 5/5 sub-case 各 field 對齊 base TS type、缺欄位 hardcode null/[]、MenuTree 4 field 極簡 |
| C-V4 | Administrator 5 條 read alias allow + shape 對齊 | 5/5 endpoint HTTP 200 + envelope code:0 + shape 與 ROLE_SUPER 一致 |
| C-V5 | Administrator 既有 5 path allow(解 A-006) | 5/5 endpoint envelope code 非 5001 deny |
| C-V6 | Menu CRUD admin path POST/PUT/DELETE | 3/3 endpoint HTTP 200 + envelope code:0 + soft delete + audit |
| C-V7 | GeneralUser deny regression | HTTP 200 + envelope {code:5001, success:false}(R-Q6 envelope wrap) |
| C-V8 | three-side scope | base-web/nestjs 0 diff + rust-api 8 file + 0 docker-compose |
| C-V9 | W-FA1 stack regression | 6 healthy + rust-api 剛 recreated + migration exited 0 |
| C-V10 | CDP browser smoke test 3 view + column render | 3 view load 成功 + DOM query column 非 undefined / blank |
