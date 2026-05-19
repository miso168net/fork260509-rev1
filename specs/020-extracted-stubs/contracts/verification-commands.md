# Verification Commands: F11 — extracted-stubs

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-19

7 個 C-V contract = **7 個 verification scenario**(per FR-018 NFR-004 完成標誌 7/7 PASS、無 unit test)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F11 rust-api image 已 rebuild + container recreate + Casbin migration init container rerun。

> 注意:F11 stub envelope 用 actual rust `Res<T>` shape:`{code: 0, data: <stub-data>, msg: "success", success: true}`(per research.md R-Q4)— field 為 `msg` 非 `message`(spec.md US1.2 文字為 wording inaccuracy)。

---

## C-V1: rust-api image rebuild OK

**Goal**: 驗 F11 rust source patch 後 cargo build 成功、image 重新 tag。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:
- exit 0
- image 重 tag `rust-api:rev1-admin-rust-api`
- warm cache build ≤ 5 min(per NFR-005)、cold ≤ 7 min

**Pass criteria**: docker build exit 0 + image 新 ID(對比 F10.2 rebuild SHA `36a4807bf771`、F11 預期新 SHA)。

**Failure handling**:
- cargo error → 檢 strum / serde / chrono / sea-orm import 是否齊備
- `SendCaptchaInput` 等 DTO 在 model crate 內、F11 model crate 可能需 rebuild
- module register(`sys_mock_api` / `sys_mock_route` / `m20260519_a_f11`)漏 → 檢 `mod.rs` + lib.rs register

---

## C-V2: migration init container rerun + 8 row 落 casbin_rule

**Goal**: 驗 F11 Casbin migration `m20260519_a_f11_extracted_stubs_seed.rs` 已執行、8 row 落 DB(per FR-005、Q1 拍板)。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5

# 等 migration rerun 完成,查 casbin_rule:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT v0, v2, v3, v4 FROM casbin_rule WHERE v2 IN ('/auth/sendCaptcha','/auth/verifyCaptcha','/auth/error','/mock/getLastTime') ORDER BY v0, v2"

# COUNT verify:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT COUNT(*) FROM casbin_rule WHERE v2 IN ('/auth/sendCaptcha','/auth/verifyCaptcha','/auth/error','/mock/getLastTime')"
```

**Expected**:
- 8 row(2 role × 4 endpoint):

  ```
       v0      |          v2          |  v3  | v4
  -------------+----------------------+------+----
   ROLE_ADMIN  | /auth/error          | GET  |
   ROLE_ADMIN  | /auth/sendCaptcha    | POST |
   ROLE_ADMIN  | /auth/verifyCaptcha  | POST |
   ROLE_ADMIN  | /mock/getLastTime    | GET  |
   ROLE_SUPER  | /auth/error          | GET  |
   ROLE_SUPER  | /auth/sendCaptcha    | POST |
   ROLE_SUPER  | /auth/verifyCaptcha  | POST |
   ROLE_SUPER  | /mock/getLastTime    | GET  |
  (8 rows)
  ```

- COUNT = 8

**Pass criteria**:
- 8 row 存在
- 每 row v0 為 `ROLE_SUPER` 或 `ROLE_ADMIN`、v2 為 4 個 endpoint 之一、v3 為 POST/GET 對應、v4 為空字串(implicit allow、per research.md R-Q5)

**Failure handling**:
- COUNT < 8 → migration 沒跑、檢 `m20260519_a_f11` 是否 in mod.rs + lib register
- COUNT > 8 → idempotency bug(rerun INSERT 重複)、需檢 migration up() 是否有 `ON CONFLICT DO NOTHING` 或 sea-orm `seaql_migrations` 表異常
- 0 row 但 migration init container `exited 0` → migration silent fail、檢 docker compose logs migration

---

## C-V3: Soybean 4 endpoint 全 HTTP 200 + 預期 response shape

**Goal**: 驗 F11 4 條 stub handler 註冊成功 + Casbin policy allow ROLE_SUPER 生效 + stub 行為對齊 DESIGN-A §4.2 直譯。

**Command**:
```bash
# 1) Login Soybean 拿 access_token
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
echo "access_token length=${#ACCESS_TOKEN}, dots=$(echo -n $ACCESS_TOKEN | tr -dc . | wc -c)"

# 2) sendCaptcha:
echo "=== C-V3a: sendCaptcha ==="
curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"phone":"13800138000"}' \
  http://127.0.0.1:11080/api/auth/sendCaptcha

# 3) verifyCaptcha 兩 case(verified=true / false):
echo "=== C-V3b: verifyCaptcha (code=000000) ==="
curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"phone":"13800138000","code":"000000"}' \
  http://127.0.0.1:11080/api/auth/verifyCaptcha

echo "=== C-V3c: verifyCaptcha (code=111111) ==="
curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"phone":"13800138000","code":"111111"}' \
  http://127.0.0.1:11080/api/auth/verifyCaptcha

# 4) auth/error query echo:
echo "=== C-V3d: auth/error ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:11080/api/auth/error?code=DEMO001&msg=test+error"

# 5) mock/getLastTime:
echo "=== C-V3e: mock/getLastTime ==="
curl -s -w "\n---HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:11080/api/mock/getLastTime
```

**Expected**(5 個 sub-case 全 HTTP 200):

C-V3a sendCaptcha:
```
{"code":0,"data":{"code":"000000"},"msg":"success","success":true}
---HTTP 200
```

C-V3b verifyCaptcha(code=000000):
```
{"code":0,"data":{"verified":true},"msg":"success","success":true}
---HTTP 200
```

C-V3c verifyCaptcha(code=111111):
```
{"code":0,"data":{"verified":false},"msg":"success","success":true}
---HTTP 200
```

C-V3d auth/error:
```
{"code":0,"data":{"code":"DEMO001","msg":"test error"},"msg":"success","success":true}
---HTTP 200
```

C-V3e mock/getLastTime:
```
{"code":0,"data":{"time":"2026-05-19T..."},"msg":"success","success":true}
---HTTP 200
```

**Pass criteria**:
- 5/5 sub-case HTTP 200
- envelope `code=0` + `msg="success"` + `success=true`
- 各 stub `data` field 對齊 E9:
  - sendCaptcha → `data.code == "000000"`
  - verifyCaptcha(000000) → `data.verified == true`
  - verifyCaptcha(111111) → `data.verified == false`
  - auth/error → `data.code == "DEMO001"` + `data.msg == "test error"`
  - mock/getLastTime → `data.time` 為 ISO 8601 / RFC3339 字串

**Failure handling**:
- HTTP 404 → endpoint 未註冊、檢 router mount + module register
- HTTP 401 → access_token 失效、檢 login response 是否含 `data.token`
- HTTP 403 → Casbin policy 未 allow ROLE_SUPER、檢 C-V2 migration row + ROLE_SUPER user-role assignment(F5.1 g rule)
- HTTP 500 → handler panic、檢 `docker compose logs rust-api --tail=50`
- response shape mismatch → 檢 handler `Res::new_data(json!(...))` 內 field 名 / 值

---

## C-V4: GeneralUser 1 endpoint HTTP 403(Casbin enforce fail-safe)

**Goal**: 驗 Casbin policy deny GeneralUser(ROLE_USER)對 F11 stub endpoint 生效、RBAC fail-safe 紀律維持(per Principle I + Q1 拍板)。

**Command**:
```bash
# 1) Login GeneralUser 拿 access_token
GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 2) GeneralUser sendCaptcha(代表 endpoint、其餘 3 條 Casbin policy 同 row pattern 不重複驗 per Q4)
echo "=== C-V4: GeneralUser sendCaptcha ==="
curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $GU_TOKEN" \
  -d '{"phone":"13800138000"}' \
  http://127.0.0.1:11080/api/auth/sendCaptcha
```

**Expected**(per research.md R-Q6 implement-time finding):
```
{"code":5001,"data":null,"msg":"您没有访问该资源的权限，请联系管理员","success":false}
---HTTP 200
```

rust-api `casbin_envelope_adapter` 把 axum-casbin middleware raw 403 plain-text wrap 成 F4 envelope、application-level code=5001=CODE_PERMISSION_CASBIN_DENY、HTTP 級回 200(per `server/core/src/web/code.rs:33` + `server/initialize/tests/login_handler_integration.rs:8`)。

**Pass criteria**:
- HTTP **200**(envelope-wrapped、actual rust-api 行為、見 R-Q6)
- envelope body `code=5001` + `success=false` + `data=null`
- msg 含「您没有访问该资源的权限」字串
- **不**回 `{"code":"000000"}`(allow path 必含、deny 路徑生效驗證)

**Failure handling**:
- HTTP 200 with `{code:"000000"}` → Casbin policy 未生效對 GeneralUser、檢 C-V2 + GeneralUser role assignment(F5.1 g rule 是否含 GeneralUser → ROLE_USER mapping、且 ROLE_USER 是否在 4 endpoint 內被誤加 allow row)
- HTTP 401 → access_token 失效、檢 GeneralUser 密碼是否仍為 `123456`
- HTTP 500 → Casbin enforce error、檢 docker compose logs rust-api

---

## C-V5: tracing log 有 `phone` field(sendCaptcha)

**Goal**: 驗 F11 sendCaptcha handler 內 `tracing::info!` log 行為(per FR-001 + FR-023、tracing log compensate `no unit test`)。

**Command**(承接 C-V3 後跑、確保 log 含此次 call):
```bash
docker compose logs rust-api --tail=200 2>&1 | grep "F11 stub: sendCaptcha"
docker compose logs rust-api --tail=200 2>&1 | grep -c "F11 stub: sendCaptcha"
```

**Expected**:
```
2026-05-19T...  INFO ... F11 stub: sendCaptcha called phone=13800138000
1
```

(具體 format 視 rust tracing subscriber 配置、但應含 `phone=13800138000` field + msg `"F11 stub: sendCaptcha called"`)

**Pass criteria**:
- grep count ≥ 1
- log line 含 `phone=` field 或 `phone="13800138000"` 字串

**Failure handling**:
- 0 line → handler 沒被 invoke(C-V3 應同時 fail)、或 tracing level 未含 INFO、檢 rust-api log config
- 有 line 但無 `phone=` → handler 內 `tracing::info!` 寫法錯(應 `tracing::info!(phone = %input.phone, "...")`)

---

## C-V6: three-side scope verify

**Goal**: 驗 F11 base-web + nestjs fork **三邊零改動**、rust-api scope 收緊到 10 file(per SC-007 + SC-008 + SC-011 + plan structure decision)。

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
echo "=== rust-api scope (預期 10 file: 5 改 + 3 新建 + 2 register/lib) ==="
(cd rust-api && git diff HEAD --stat)

echo ""
echo "=== docker-compose 變動 (預期 0) ==="
git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l

echo ""
echo "=== outer scope ==="
git status --short
```

**Expected**:
- base-web/src/ diff = **0 line**
- nestjs fork diff = **0 line**
- rust-api 10 file diff:
  - `server/api/src/admin/sys_authentication_api.rs`(改 +~50 LOC)
  - `server/api/src/admin/sys_mock_api.rs`(新建 ~30 LOC)
  - `server/api/src/admin/mod.rs`(改 +1 LOC)
  - `server/router/src/admin/sys_authentication_route.rs`(改 +~15 LOC)
  - `server/router/src/admin/sys_mock_route.rs`(新建 ~25 LOC)
  - `server/router/src/admin/mod.rs`(改 +3 LOC + register)
  - `server/model/src/admin/input/sys_authentication.rs`(改 +~20 LOC、對齊既有 LoginInput)
  - `server/initialize/src/router_initialization.rs`(改 +~6 LOC、MockRouter import + register、per analyze G2)
  - `migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs`(新建 ~50 LOC)
  - `migration/src/datas/mod.rs`(改 +2 LOC + lib register)
- docker-compose*.yml diff = 0 line
- outer scope:`CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/020-*/` untracked

**Pass criteria**:
- base-web/src/ + nestjs fork 各 0 diff
- rust-api 10 file ~170-200 LOC total
- 0 docker-compose diff
- outer 4 file + 1 dir(per F10.2 same pattern)

**Failure handling**:
- base-web 或 nestjs fork 有 diff → 意外改動、abort F11 + 改正
- rust-api scope > 10 file → scope 漂移、檢是否誤改其他 file
- outer 有 docker-compose.yml diff → F11 範疇外、確認後 stash 或 abort

---

## C-V7: W-FA1 stack regression

**Goal**: 驗 F11 build + restart 不破壞 W-FA1 baseline。

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
rust-api      running   Up Y (healthy)    ← Y < X 因 F11 rebuild + recreate
```

**Pass criteria**:
- 6 long-running service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)
- rust-api uptime Y 小於其他 5 service uptime X(表示 just recreated)
- migration 容器若顯示:exited 0(init container 正常 exit、F11 migration rerun 完成)

**Failure handling**:
- rust-api restart loop → handler panic / config 退化 / migration UNIQUE constraint 失敗 → 檢 docker compose logs rust-api / migration
- 其他 5 service unhealthy → 意外退化、檢 docker compose logs <service>
- migration container exited 非 0 → F11 migration up() 失敗、檢 SQL 與 schema 是否對齊

---

## 完成標誌

7 個 verification 全 PASS = F11 acceptance 7/7 PASS、ready for Phase 8 two-stage commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA + ≤ 5 min warm |
| C-V2 | migration rerun + 8 row | COUNT = 8 + (v0, v2, v3, v4) 對齊 |
| C-V3 | Soybean 4 endpoint 200 | 5/5 sub-case HTTP 200 + envelope `{code:0, data, msg, success}` + data shape |
| C-V4 | GeneralUser deny | HTTP 200 + envelope `{code:5001, success:false}` + 無 `data.code:"000000"`(R-Q6) |
| C-V5 | tracing log phone | grep ≥ 1 line + `phone=` field |
| C-V6 | three-side scope | base-web/nestjs 0 diff + rust-api 10 file + 0 docker-compose |
| C-V7 | W-FA1 stack regression | 6 healthy + rust-api 剛 recreated + migration exited 0 |
