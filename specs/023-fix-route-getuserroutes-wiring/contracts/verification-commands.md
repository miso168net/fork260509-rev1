# Verification Commands: F7.1 — fix-route-getuserroutes-wiring

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

10 個 C-V contract = **10 個 verification scenario**(per spec NFR-004:US1 3/3 + US2 2/2 = 5 US scenario → 10 C-V mapping、curl + CDP smoke)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F7.1 rust-api image 已 rebuild + container recreate;CDP smoke via WSL2 host Edge 148 + `--remote-debugging-port=9229`(per research R-Q3)。

> 注意:F7.1 不改 envelope 紀律 — `/route/getUserRoutes` + `/systemManage/getMenuList/v2` 都回 `{code:0, data, msg:"success", success:true}`(per F4/F11 R-Q4)。

---

## C-V1: rust-api image rebuild OK

**Goal**:驗 F7.1 rust source 2 file patch 後 cargo build 成功。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:exit 0 + image 重 tag + warm ≤ 5 min(per NFR-005、F7 baseline 2m 30s)。

**Failure handling**:
- cargo error → check `router_initialization.rs` `SysAuthService` import + `sys_system_manage_api.rs` `PaginatedData` import(per research R-Q3、預期既有)
- `unused import` → cargo `-D warnings` 嚴格

---

## C-V2: Soybean `/route/getUserRoutes` wiring fix(US1.1)

**Goal**:驗 F5.1 wiring bug 修復、`/route/getUserRoutes` 對 ROLE_SUPER 回正常 envelope(非 HTTP 500)。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5

LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -s -o /tmp/f71-cv2.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:11080/api/route/getUserRoutes
python3 -c "import json; r=json.load(open('/tmp/f71-cv2.json')); d=r.get('data',{}); \
  routes=d.get('routes',[]); print(f'code={r[\"code\"]} home={d.get(\"home\")} routes_count={len(routes)} names={[x.get(\"name\") for x in routes]}')"
```

**Expected**:HTTP 200 + envelope `code=0` + `home="home"` + `routes_count=4` + names 含 `manage`;manage route children 含 manage_user / manage_role / manage_menu / manage_user-detail。

**Pass criteria**:HTTP 200(非 500)+ envelope code:0 + routes len=4。

**Failure handling**:
- HTTP 500 `Missing request extension` → wiring fix 沒生效、check `router_initialization.rs` E1 改動
- envelope code:5001 → Casbin deny(F5.1 m20260515 seed 應 allow、check casbin_rule)

---

## C-V3: Administrator `/route/getUserRoutes`(US1.2)

**Command**:
```bash
ADMIN_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Administrator","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s -o /tmp/f71-cv3.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:11080/api/route/getUserRoutes
python3 -c "import json; r=json.load(open('/tmp/f71-cv3.json')); print(f'code={r[\"code\"]} routes_count={len(r.get(\"data\",{}).get(\"routes\",[]))}')"
```

**Expected**:HTTP 200 + envelope code:0 + routes count ≥ 1(對齊 ROLE_SUPER 體驗、ROLE_ADMIN sys_role_menu binding cover manage)。

**Pass criteria**:HTTP 200 + envelope code:0。

---

## C-V4: GeneralUser `/route/getUserRoutes`(US1.3)

**Command**:
```bash
GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s -o /tmp/f71-cv4.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $GU_TOKEN" \
  http://127.0.0.1:11080/api/route/getUserRoutes
python3 -c "import json; r=json.load(open('/tmp/f71-cv4.json')); print(f'code={r[\"code\"]} success={r[\"success\"]}')"
```

**Expected**:HTTP 200 + envelope code:0(F5.1 m20260515 seed 對 `/route/getUserRoutes` path 3-role allow、**非** 5001 deny)。

**Pass criteria**:HTTP 200 + envelope code:0 + success:true。

**Failure handling**:envelope code:5001 → F5.1 seed 對 ROLE_USER `/route/getUserRoutes` 漏 allow(理論上 F5.1 已 cover、不應發生)、check casbin_rule。

---

## C-V5: Soybean `/systemManage/getMenuList/v2` paginated shape(US2.1)

**Goal**:驗 F7.1 menu paginated wrapper 落地、envelope `data` 為 paginated shape。

**Command**:
```bash
curl -s -o /tmp/f71-cv5.json -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:11080/api/systemManage/getMenuList/v2
python3 <<'PYEOF'
import json
r = json.load(open('/tmp/f71-cv5.json'))
d = r.get('data', {})
keys = sorted(d.keys()) if isinstance(d, dict) else 'NOT_DICT(flat array?)'
print(f'envelope code={r["code"]}')
print(f'data keys: {keys}')
if isinstance(d, dict):
    recs = d.get('records', [])
    print(f'current={d.get("current")} size={d.get("size")} total={d.get("total")} records_count={len(recs)}')
    if recs:
        first = recs[0]
        print(f'records[0] field count={len(first)} menuType={first.get("menuType")!r} parentId={first.get("parentId")!r} order={first.get("order")} buttons={first.get("buttons")!r}')
PYEOF
```

**Expected**:
- envelope code:0
- `data` 為 dict、keys = `['current', 'records', 'size', 'total']`(4 key)
- `current=1`、`size=total=records_count`、`records_count` ≥ 9(seed baseline)
- `records[0]` 22 field、`menuType` 為 "1"/"2"(非 "menu"/"directory")、`parentId` 為 String、`buttons` null

**Pass criteria**:`data` 含 `{current, size, total, records}` 4 key + `records[0]` 對齊 F7 既有 22 field shape。

**Failure handling**:
- `data` 為 flat array → paginated wrapper 沒生效、check `sys_system_manage_api.rs` E2 改動
- `records[0]` field 缺失 → F7 `SystemManageMenuOutput` 被誤改(F7.1 不該動 row element)

---

## C-V6: CDP smoke `/manage/menu` view(US2.2)

**Goal**:驗 base manage/menu view 不再「无数据」、paginated wrapper 對 base view typed fetch 生效。

**Pre-requisite**:WSL2 host Edge 148 + `--remote-debugging-port=9229`;CDP node script + `ws` driver(F7 demo 既有 setup);`Fetch.requestPaused` 攔 `/auth/getUserInfo` 注入 R_SUPER/R_ADMIN role alias(per research R-Q3、demo-only workaround)。

**Command**(沿用 F7 CDP demo node script pattern):
```bash
# node CDP script:clear storage → POST login + inject SOY_token → navigate /manage/menu
#   → wait .n-data-table-tbody .n-data-table-tr → count rows
node /tmp/cdp-f71-smoke.js   # implement 階段對齊 F7 cdp-fetch-intercept.js 抽出
```

**Expected**:`/manage/menu` view DOM `.n-data-table-tbody .n-data-table-tr` count ≥ 5(seed ≥ 9 menu);table 不顯示「无数据」。

**Pass criteria**:DOM row count ≥ 5。

**Failure handling**:
- row count 0 / 「无数据」→ paginated wrapper 沒生效(C-V5 應先 PASS)
- SPA navigate 失敗 / 403 → role alias workaround 沒 enable(check Fetch.requestPaused 注入)或 wiring fix(C-V2)沒 PASS
- CDP setup fail → graceful degradation:C-V5 curl paginated shape 驗 PASS 即視為 US2 核心通過、C-V6 標 deferred manual

---

## C-V7: CDP smoke `/manage/user` regression(US1 + US2 共同)

**Goal**:驗 F7.1 wiring fix 不破壞 F7 既有 manage/user view render。

**Command**:同 C-V6 node script、navigate `/manage/user`。

**Expected**:DOM row count ≥ 3(Soybean / Administrator / GeneralUser 3 seed user)。

**Pass criteria**:DOM row count ≥ 3。

**Failure handling**:row count 0 → F7.1 wiring fix break 了 SysMenuService extension(R-1)、check E1 是否漏 `Arc<SysMenuService>` layer。

---

## C-V8: CDP smoke `/manage/role` regression

**Goal**:驗 F7.1 不破壞 F7 既有 manage/role view render。

**Command**:同 C-V6 node script、navigate `/manage/role`。

**Expected**:DOM row count ≥ 3(管理员 / 超级管理员 / 用户)+ row data 含 roleName / roleCode / roleDesc column。

**Pass criteria**:DOM row count ≥ 3。

---

## C-V9: three-side scope verify(zero-regression)

**Goal**:驗 F7.1 base-web + nestjs + docker-compose 三邊零改動、rust-api scope 收緊到 2 file。

**Command**:
```bash
echo "=== base-web/src/ diff (預期 0) ==="
git diff HEAD -- base-web/src/ | wc -l
echo "=== nestjs fork diff (預期 0) ==="
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "=== rust-api scope (預期 2 file) ==="
(cd rust-api && git diff HEAD --stat)
echo "=== docker-compose 變動 (預期 0) ==="
git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l
echo "=== migration 變動 (預期 0) ==="
(cd rust-api && git diff HEAD --stat -- migration/)
echo "=== outer scope ==="
git status --short
```

**Expected**:
- base-web/src/ diff = **0 line**
- nestjs fork diff = **0 line**
- rust-api scope = **2 file**(`server/initialize/src/router_initialization.rs` + `server/api/src/admin/sys_system_manage_api.rs`、~25 LOC)
- docker-compose*.yml diff = 0 line
- migration diff = 0 line(空輸出)
- outer scope:`CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/023-*` + `docs/superpowers/023-*`

**Pass criteria**:base-web/nestjs/docker-compose/migration 各 0 diff + rust-api 2 file。

**Failure handling**:rust-api scope > 2 file → scope 漂移、check 是否誤改其他 file。

---

## C-V10: W-FA1 stack regression

**Command**:
```bash
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Expected**:6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ rust-api uptime 較短(剛 recreated)+ migration init container 若顯示:exited 0。

**Pass criteria**:6 long-running service healthy + rust-api 剛 recreated。

**Failure handling**:rust-api restart loop → wiring fix 編譯期過但 runtime panic、check `docker compose logs rust-api`。

---

## 完成標誌

10 個 verification 全 PASS = F7.1 acceptance 10/10 PASS、ready for 兩段式 commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA + ≤ 5 min warm |
| C-V2 | Soybean `/route/getUserRoutes`(US1.1) | HTTP 200 + envelope code:0 + routes len=4 + manage 含 4 children |
| C-V3 | Administrator `/route/getUserRoutes`(US1.2) | HTTP 200 + envelope code:0 |
| C-V4 | GeneralUser `/route/getUserRoutes`(US1.3) | HTTP 200 + envelope code:0(非 5001 deny) |
| C-V5 | Soybean `getMenuList/v2` paginated shape(US2.1) | `data` 含 {current,size,total,records} 4 key + records[0] 22 field |
| C-V6 | CDP smoke `/manage/menu`(US2.2) | DOM row count ≥ 5、不「无数据」 |
| C-V7 | CDP smoke `/manage/user` regression | DOM row count ≥ 3 |
| C-V8 | CDP smoke `/manage/role` regression | DOM row count ≥ 3 |
| C-V9 | three-side scope | base-web/nestjs/docker-compose/migration 0 diff + rust-api 2 file |
| C-V10 | W-FA1 stack regression | 6 service healthy + rust-api 剛 recreated |

**graceful degradation**:C-V6/C-V7/C-V8 CDP smoke 若 setup 異常(Edge port / WSL networking / role alias workaround flaky)→ 降級為 deferred manual(per spec A-005 + R-3),C-V2~C-V5 curl 層 PASS 即視為 F7.1 US1/US2 核心驗收通過。
