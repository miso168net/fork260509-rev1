# Verification Commands: F8 — assign-users

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

12 個 C-V contract = 12 個 verification scenario(US1 P1 7 acceptance scenario → C-V mapping、curl + psql + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F8 rust-api image 已 rebuild + migration/rust-api container recreate。

> 注意:F8 新增 1 個 Casbin policy seed migration(`m20260522`)— acceptance 須 recreate `migration` init-container 使其 apply。psql 連線用 `127.0.0.1:15432`(dev port forward)、DB credential 見 deploy secrets。
> 整組覆蓋語意:acceptance 採 **capture → assign → verify → restore**(per spec FR-018)、用 `ROLE_USER`(role 3 / GeneralUser)為操作對象、加項 `Administrator`(user 2)後還原,避免污染 seed。

---

## C-V1: rust-api image rebuild OK

**Goal**:驗 F8 rust source(handler + route)+ 新 migration 後 cargo build 成功。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:exit 0 + image 重 tag + warm ≤ 5 min。

**Failure handling**:cargo error → check `assign_users` handler 語法 / `AssignUserDto` import / migration `m20260522` 語法 / `mod.rs` + `lib.rs` 註冊。

---

## C-V2: stack recreate — migration init-container apply m20260522

**Goal**:驗 F8 新 migration 隨 migration init-container 套用。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -8
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
docker compose logs migration 2>&1 | tail -15
```

**Expected**:`migration` init-container exited 0、log 顯示 `m20260522_a_f8_assign_users_seed` 套用;`rust-api` recreated healthy。

**Failure handling**:migration 非 exited 0 → check migration log 的 SQL error。

---

## C-V3: F8 Casbin policy row 落 DB

**Goal**:驗 `m20260522` 的 `p` policy row 進 `casbin_rule`。

**Command**:
```bash
PGPASSWORD="$(cat deploy/secrets/postgres_password.txt)" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean-admin-rev1 -tAc \
  "SELECT ptype,v0,v1,v2,v3,v4 FROM casbin_rule WHERE v2='/authorization/assign-users';"
```

**Expected**:1 row `p|ROLE_SUPER|built-in|/authorization/assign-users|POST|`(`v4` 空)。

**Pass criteria**:剛好 1 row、`v0=ROLE_SUPER`、`v3=POST`。

> 註:實際 DB name / user 以 deploy compose env 為準、implement 階段對齊;此處為示意。

---

## C-V4: ROLE_SUPER `assign-users` happy path(capture + additive assign、US1.1)

**Goal**:驗 `POST /authorization/assign-users` 對 ROLE_SUPER 生效。

**Command**:
```bash
# capture:ROLE_USER(role 3)現有 user 集合
PGPASSWORD=... psql -h 127.0.0.1 -p 15432 -U soybean -d soybean-admin-rev1 -tAc \
  "SELECT user_id FROM sys_user_role WHERE role_id='3';"   # 預期 baseline: 3(GeneralUser)

SUPER_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
SUPER_TOKEN=$(echo "$SUPER_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# additive assign:ROLE_USER 的 user 集合設為 {3, 2}(加入 Administrator)
curl -s -o /tmp/f8-cv4.json -w "HTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer $SUPER_TOKEN" -H "Content-Type: application/json" \
  -d '{"roleId":"3","userIds":["3","2"]}' \
  http://127.0.0.1:11080/api/authorization/assign-users
python3 -c "import json; r=json.load(open('/tmp/f8-cv4.json')); print(f'code={r[\"code\"]} success={r[\"success\"]}')"
```

**Expected**:HTTP 200 + envelope `{code:0, success:true}`。

**Pass criteria**:HTTP 200 + `code=0`。

**Failure handling**:HTTP 404 → route 沒掛(check E2);`code:5001` → Casbin seed 沒生效(check C-V3);envelope error → check role/user id 是否存在。

> role_id / user_id 實際值以 seed 為準(brainstorm 探索:Soybean=1 / Administrator=2 / GeneralUser=3、role 1/2/3 對應 SUPER/ADMIN/USER);implement 階段先 psql 確認真實 id 型別與值。

---

## C-V5: `sys_user_role` 反映 additive assign(US1.2)

**Command**:
```bash
PGPASSWORD=... psql -h 127.0.0.1 -p 15432 -U soybean -d soybean-admin-rev1 -tAc \
  "SELECT user_id FROM sys_user_role WHERE role_id='3' ORDER BY user_id;"
```

**Expected**:2 row — `user_id` = `2` 與 `3`(Administrator 已加入 ROLE_USER、GeneralUser 仍在)。

**Pass criteria**:`(user_id=2, role_id=3)` row 存在。

---

## C-V6: 被加入 role 的 user re-login → `getUserInfo` 反映(US1.3)

**Command**:
```bash
ADMIN_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Administrator","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s -o /tmp/f8-cv6.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:11080/api/auth/getUserInfo
python3 -c "import json; r=json.load(open('/tmp/f8-cv6.json')); print(f'code={r[\"code\"]} roles={r[\"data\"][\"roles\"]}')"
```

**Expected**:HTTP 200 + envelope code:0 + `data.roles` 含 `R_ADMIN` **與** `R_USER`(Administrator 現同時屬 ROLE_ADMIN + ROLE_USER、經 F7.2 alias 映射)。

**Pass criteria**:`data.roles` 含 `R_USER`(F8 assign 後新增的 role、re-login 生效)。

---

## C-V7: restore — 還原 ROLE_USER 原 user 集合(US1.4)

**Goal**:驗還原、`sys_user_role` seed 不污染。

**Command**:
```bash
curl -s -o /tmp/f8-cv7.json -w "HTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer $SUPER_TOKEN" -H "Content-Type: application/json" \
  -d '{"roleId":"3","userIds":["3"]}' \
  http://127.0.0.1:11080/api/authorization/assign-users
python3 -c "import json; r=json.load(open('/tmp/f8-cv7.json')); print(f'code={r[\"code\"]}')"
PGPASSWORD=... psql -h 127.0.0.1 -p 15432 -U soybean -d soybean-admin-rev1 -tAc \
  "SELECT user_id FROM sys_user_role WHERE role_id='3' ORDER BY user_id;"
```

**Expected**:HTTP 200 + envelope code:0;`sys_user_role` role 3 回到 baseline(只 `user_id=3`)。

**Pass criteria**:還原後 `(user_id=2, role_id=3)` row 不存在、seed 狀態無污染。

---

## C-V8: 非 ROLE_SUPER 呼叫 → Casbin deny(US1.5)

**Command**:
```bash
for U in Administrator GeneralUser; do
  L=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$U\",\"password\":\"123456\"}" http://127.0.0.1:11080/api/auth/login)
  T=$(echo "$L" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  H=$(curl -s -o /tmp/f8-cv8-$U.json -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
    -d '{"roleId":"3","userIds":["3"]}' \
    http://127.0.0.1:11080/api/authorization/assign-users)
  CODE=$(python3 -c "import json; print(json.load(open('/tmp/f8-cv8-$U.json'))['code'])")
  echo "$U: HTTP $H envelope code=$CODE"
done
```

**Expected**:Administrator + GeneralUser 各 HTTP 200 + envelope `{code:5001, success:false}`(Casbin deny、per F11 R-Q6 envelope wrap)。

**Pass criteria**:2/2 user envelope `code=5001`、未實際寫入 `sys_user_role`。

---

## C-V9: sibling endpoint regression(非破壞性 probe)

**Goal**:驗 F8 對 `init_authorization_router` 的改動未弄掉既有 `assign-permission` / `assign-routes` route。

**Command**:
```bash
# 用 ROLE_SUPER 對 sibling endpoint 送缺欄位 body → 預期 route 存在(validation error)、非 HTTP 404
for EP in assign-permission assign-routes; do
  H=$(curl -s -o /tmp/f8-cv9-$EP.json -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $SUPER_TOKEN" -H "Content-Type: application/json" \
    -d '{}' http://127.0.0.1:11080/api/authorization/$EP)
  echo "$EP: HTTP $H"
done
```

**Expected**:兩 sibling 各 **非 HTTP 404**(route 仍掛載;缺欄位 body 觸 validation error envelope、非 route-not-found)。

**Pass criteria**:`assign-permission` + `assign-routes` 皆非 404 — 證 F8 router 改動未退化 sibling。

> 採缺欄位 body 為非破壞性 probe — 不實際變更 Casbin policy / `sys_role_menu`。

---

## C-V10: three-side scope verify(zero-regression)

**Command**:
```bash
echo "=== base-web/ diff (預期 0) ===" && git diff HEAD -- base-web/ | wc -l
echo "=== nestjs fork diff (預期 0) ===" && git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "=== rust-api scope (預期 ~5 file) ===" && (cd rust-api && git diff HEAD --stat && git status --short)
echo "=== docker-compose 變動 (預期 0) ===" && git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l
echo "=== outer scope ===" && git status --short
```

**Expected**:
- base-web/ diff = **0 line**
- nestjs fork diff = **0 line**
- rust-api scope = **~5 file**(`sys_authentication_api.rs` + `sys_authentication_route.rs` 改 + `migration/src/datas/m20260522_a_f8_assign_users_seed.rs` 新建 + `migration/src/datas/mod.rs` + `migration/src/lib.rs` 改)
- docker-compose*.yml diff = 0 line
- outer scope:`CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/025-*` + `docs/superpowers/025-*`

**Pass criteria**:base-web/nestjs/docker-compose 各 0 diff + rust-api ~5 file(含 1 新建 migration)。

---

## C-V11: W-FA1 stack regression

**Command**:
```bash
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Expected**:6 long-running service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ rust-api 剛 recreated + `migration` init-container exited 0。

**Pass criteria**:6 service healthy + rust-api 剛 recreated。

---

## C-V12: 空輸入 validation rejection(US1.7、edge case E-1 + E-2)

**Goal**:驗既有 `AssignUserDto` 的 `#[validate(length(min = 1))]` 對空 `userIds` / 空 `roleId` 生效(F8 重用 DTO、零新 code)。

**Command**:
```bash
# E-1:空 userIds
curl -s -o /tmp/f8-cv12a.json -w "HTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer $SUPER_TOKEN" -H "Content-Type: application/json" \
  -d '{"roleId":"3","userIds":[]}' \
  http://127.0.0.1:11080/api/authorization/assign-users
python3 -c "import json; r=json.load(open('/tmp/f8-cv12a.json')); print(f'E-1 code={r.get(\"code\")} success={r.get(\"success\")}')"

# E-2:空 roleId
curl -s -o /tmp/f8-cv12b.json -w "HTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer $SUPER_TOKEN" -H "Content-Type: application/json" \
  -d '{"roleId":"","userIds":["3"]}' \
  http://127.0.0.1:11080/api/authorization/assign-users
python3 -c "import json; r=json.load(open('/tmp/f8-cv12b.json')); print(f'E-2 code={r.get(\"code\")} success={r.get(\"success\")}')"

# 確認 sys_user_role role 3 未被改動
PGPASSWORD=... psql -h 127.0.0.1 -p 15432 -U soybean -d soybean-admin-rev1 -tAc \
  "SELECT user_id FROM sys_user_role WHERE role_id='3' ORDER BY user_id;"
```

**Expected**:E-1 + E-2 兩請求皆 envelope **非 `code:0`**(`AssignUserDto` `min 1` validation 擋下、`success:false`);`sys_user_role` role 3 仍為 baseline(只 `user_id=3`、未寫入)。

**Pass criteria**:兩請求 envelope 非 `code:0` + `sys_user_role` 無變動。

**Failure handling**:若回 `code:0` → `ValidatedForm<AssignUserDto>` 未跑 validation,check handler 是否誤用 `Json` extractor 而非 `ValidatedForm`。

---

## 完成標誌

12 個 verification 全 PASS = F8 acceptance 12/12 PASS、ready for 兩段式 commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA |
| C-V2 | migration init-container apply m20260522 | migration exited 0 + log 見 m20260522 |
| C-V3 | F8 Casbin policy row 落 DB | 1 row `p\|ROLE_SUPER\|...\|/authorization/assign-users\|POST` |
| C-V4 | ROLE_SUPER assign-users happy path(US1.1) | HTTP 200 + code:0 |
| C-V5 | `sys_user_role` 反映 assign(US1.2) | `(user_id=2,role_id=3)` row 存在 |
| C-V6 | 被加入 user re-login getUserInfo(US1.3) | `data.roles` 含 `R_USER` |
| C-V7 | restore 還原(US1.4) | code:0 + seed 無污染 |
| C-V8 | 非 ROLE_SUPER deny(US1.5) | 2/2 user envelope code:5001 |
| C-V9 | sibling endpoint regression | assign-permission/assign-routes 非 404 |
| C-V10 | three-side scope | base-web/nestjs/docker-compose 0 diff + rust-api ~5 file |
| C-V11 | W-FA1 stack regression | 6 service healthy + rust-api 剛 recreated |
| C-V12 | 空輸入 validation rejection(US1.7、E-1+E-2) | E-1+E-2 envelope 非 code:0 + sys_user_role 無變動 |
