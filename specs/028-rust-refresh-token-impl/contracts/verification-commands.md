# Verification Commands: F13 — rust-refresh-token-impl

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

10 個 C-V contract = F13 的 verification scenario(US1 P1 7 acceptance scenario → C-V mapping + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、**dev stack**。

> F13 的 `/auth/refreshToken` 為 rust endpoint;F13 期間 nginx `/api/auth/refreshToken` 仍路由 nestjs(F14 才切)→ acceptance **直連 rust port `:11081`** 驗 rust endpoint(`http://127.0.0.1:11081/auth/refreshToken`,不經 nginx `/api` 前綴)。
> psql 連線經 `docker compose exec postgres`(DB `soybean_admin_rust`、user `soybean`)。
> 預設帳號見 CLAUDE.md §5.1。測試採 capture → 操作 → 驗證 → 還原 模式。

---

## C-V1: rust-api image rebuild OK(含 refresh endpoint)

**Goal**:驗 F13 新增的 handler / service / 驗證函式 / DTO / router cargo build 成功。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```

**Expected**:build exit 0。
**Pass criteria**:cargo build exit 0、image 產出。
**Failure handling**:check `validate_refresh_token` 簽名 / `RefreshTokenInput` DTO / router mount / service method。

---

## C-V2: refresh 成功 — 回新 access + 新 refresh token(核心)

**Goal**:驗有效 refresh token 換得新 token pair。

**Command**:
```bash
# login 取 token(直連 rust)
LOGIN=$(curl -fsS -X POST http://127.0.0.1:11081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}')
echo "$LOGIN"
RT=$(echo "$LOGIN" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
# refresh
REFRESH=$(curl -fsS -X POST http://127.0.0.1:11081/auth/refreshToken \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}")
echo "$REFRESH"
```

**Expected**:`refreshToken` endpoint 回 HTTP 200 + F4 envelope `{code:0, data:{token, refreshToken}, ...}`;`data.token` 與 `data.refreshToken` 皆非空、且 `data.refreshToken` ≠ 登入時的 `$RT`(已輪替為新 token)。
**Pass criteria**:回新 access + 新 refresh token、envelope code 0。
**Failure handling**:check `refresh_token` service orchestration / `generate_auth_output` 呼叫。

---

## C-V3: 輪替 — 舊 row→used + 新 row inserted(核心)

**Goal**:驗 `sys_tokens` 輪替正確。

**Command**(承 C-V2 — `$RT` 為舊 refresh token、`$REFRESH` 內 `data.refreshToken` 為新):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
NEW_RT=$(echo "$REFRESH" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
# 舊 row 應 status=used
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT status FROM sys_tokens WHERE refresh_token='$RT';"
# 新 row 應存在 status=unused
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT status FROM sys_tokens WHERE refresh_token='$NEW_RT';"
```

**Expected**:舊 `$RT` 對應 row status = `used`;新 `$NEW_RT` 對應 row 存在、status = `unused`。
**Pass criteria**:舊 row 標 `used`、新 row INSERT 且 `unused`。
**Failure handling**:row 未更新 → check 輪替 transaction 的 `update_many` filter;新 row 缺 → check INSERT。

---

## C-V4: 新 access token 可用於受保護端點

**Goal**:驗 refresh 回的新 access token 有效、role 正確。

**Command**(承 C-V2):
```bash
NEW_TOKEN=$(echo "$REFRESH" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -fsS http://127.0.0.1:11081/auth/getUserInfo \
  -H "Authorization: Bearer $NEW_TOKEN" | head -c 300
```

**Expected**:`/auth/getUserInfo` 回 HTTP 200 + envelope code 0 + user info(`roles` 含 Soybean 當下角色)。
**Pass criteria**:新 access token 通過 JWT 驗證與授權、身分 claim 正確。
**Failure handling**:check `generate_auth_output` 重建 Claims(R-Q1 重查 role)。

---

## C-V5: 舊(已用)refresh token 重用被拒(一次性)

**Goal**:驗一次性 — 已輪替的 refresh token 不可再 refresh。

**Command**(承 C-V2 — `$RT` 已被 C-V2 輪替):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
BEFORE=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_tokens;")
curl -s -X POST http://127.0.0.1:11081/auth/refreshToken \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}" | head -c 200
AFTER=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_tokens;")
echo "sys_tokens count before=$BEFORE after=$AFTER（預期相等）"
```

**Expected**:回 envelope `code:3333`(拒絕、不細分);未核發 token;`sys_tokens` 筆數不變(無新 row)。
**Pass criteria**:已用 refresh token 被拒、`sys_tokens` 不變。

---

## C-V6: 無效 / 過期 refresh token 被拒

**Goal**:驗無效 refresh token 被拒、不副作用。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
BEFORE=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_tokens;")
curl -s -X POST http://127.0.0.1:11081/auth/refreshToken \
  -H 'Content-Type: application/json' -d '{"refreshToken":"not-a-valid-jwt-token"}' | head -c 200
AFTER=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_tokens;")
echo "before=$BEFORE after=$AFTER（預期相等）"
# 缺欄位
curl -s -X POST http://127.0.0.1:11081/auth/refreshToken \
  -H 'Content-Type: application/json' -d '{}' -w " <-HTTP:%{http_code}\n" | tail -c 80
```

**Expected**:亂填 token → envelope `code:3333`、`sys_tokens` 不變;缺 `refreshToken` 欄 → HTTP 400(validation)。
**Pass criteria**:無效 token 被拒、不核發、不變更 `sys_tokens`;缺欄位回 400。
**備註**:過期 refresh token 走與「簽章無效」相同的 `validate_refresh_token` Err 拒絕路徑(同 `code:3333`),不另植入過期 token。

---

## C-V7: 已軟刪 user 的 refresh token 被拒

**Goal**:驗軟刪 user 不能 refresh。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# GeneralUser login 取 refresh token
GU=$(curl -fsS -X POST http://127.0.0.1:11081/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"GeneralUser","password":"123456"}')
GU_RT=$(echo "$GU" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
# 軟刪 GeneralUser
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "UPDATE sys_user SET deleted_at=now() WHERE username='GeneralUser';"
# refresh 應被拒
curl -s -X POST http://127.0.0.1:11081/auth/refreshToken \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$GU_RT\"}" | head -c 200
# 還原
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "UPDATE sys_user SET deleted_at=NULL WHERE username='GeneralUser';"
```

**Expected**:軟刪期間以 GeneralUser 的 refresh token refresh → 回 envelope `code:8888`(session invalidated);還原後 `sys_user` 無污染。
**Pass criteria**:軟刪 user 的 refresh 被拒、回 8888。

---

## C-V8: refresh 不寫 sys_operation_log / sys_login_log

**Goal**:驗 Q2 — refresh 動作只寫 `sys_tokens`、不寫其他 log 表。

**Command**(在一次 refresh 前後比對):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
OL_B=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_operation_log;")
LL_B=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_login_log;")
# login + 一次成功 refresh
L=$(curl -fsS -X POST http://127.0.0.1:11081/auth/login -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}')
R=$(echo "$L" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
curl -fsS -X POST http://127.0.0.1:11081/auth/refreshToken -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$R\"}" >/dev/null
OL_A=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_operation_log;")
LL_A=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_login_log;")
echo "operation_log: $OL_B→$OL_A  login_log: $LL_B→$LL_A"
```

**Expected**:`sys_operation_log` 與 `sys_login_log` 筆數在 refresh 前後**不變**(login 本身可能增 `sys_login_log` 一筆 — 但 refresh 動作本身不增任何 log 表;比對時以「refresh 呼叫前後」為準,可在 login 後先記 baseline)。
**Pass criteria**:refresh 動作不寫 `sys_operation_log`、不寫 `sys_login_log`。

> 精確驗法:baseline 記在 login **之後**、refresh **之前**;refresh 後再比 — 兩表皆應不變。

---

## C-V9: dev stack regression + nginx 不變

**Goal**:驗 F13 不影響既有 stack、nginx routing 未動。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC --profile track-a up -d --wait 2>&1 | tail -3
$PC ps --format "table {{.Service}}\t{{.State}}"
curl -fsS http://127.0.0.1:11081/health -w " <- rust-api\n"
# nginx /api/auth/refreshToken 仍路由 nestjs(W-FA2 TRANSITIONAL block 未動)
grep -c "TRANSITIONAL" deploy/front-nginx/conf.d/default.conf
```

**Expected**:dev stack service 全 healthy;rust-api `/health` 正常;`default.conf` 的 TRANSITIONAL marker 仍在(F13 未動 nginx)。
**Pass criteria**:既有 stack 不退化、nginx 設定 0 改動。

---

## C-V10: three-side scope verify(zero-regression)

**Command**:
```bash
echo "base-web/ diff (預期 0):" && git diff HEAD -- base-web/ | wc -l
echo "nestjs fork diff (預期 0):" && git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "docker-compose diff (預期 0):" && git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l
echo "nginx conf diff (預期 0):" && git diff HEAD -- deploy/front-nginx/ | wc -l
echo "migration diff (預期 0):" && (cd rust-api && git diff HEAD -- migration/ | wc -l)
echo "rust-api scope:" && (cd rust-api && git diff HEAD --stat && git status --short)
echo "outer scope:" && git status --short
```

**Expected**:base-web / nestjs fork / docker-compose(3 檔)/ nginx conf / `rust-api/migration/` 各 **0 line** diff;rust-api scope = 既有 5 檔改動(`input/sys_authentication.rs` + `input/mod.rs` + `core/web/jwt.rs` + `service/sys_auth_service.rs` + `api/sys_authentication_api.rs` + `router/sys_authentication_route.rs`);outer scope = spec docs + `CLAUDE.md` + `INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + rust-api gitlink。
**Pass criteria**:base-web / nestjs / docker-compose / nginx / migration 各 0 diff;無 DB schema 改、無 migration。

---

## 完成標誌

10 個 verification 全 PASS = F13 acceptance 10/10 PASS、ready for 兩段式 commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | image rebuild | build exit 0 |
| C-V2 | refresh 成功回新 token pair(核心) | 新 access + 新 refresh、envelope code 0 |
| C-V3 | 輪替 sys_tokens(核心) | 舊 row→used + 新 row unused |
| C-V4 | 新 access token 可用 | 受保護端點通過、role 正確 |
| C-V5 | 已用 refresh token 重用被拒 | code 3333、sys_tokens 不變 |
| C-V6 | 無效 / 缺欄位 | 無效→3333 不副作用、缺欄位→400 |
| C-V7 | 軟刪 user 被拒 | code 8888 |
| C-V8 | 不寫 operation_log / login_log | refresh 前後兩表不變 |
| C-V9 | dev stack regression + nginx 不變 | stack healthy、TRANSITIONAL 仍在 |
| C-V10 | three-side scope | base-web/nestjs/compose/nginx/migration 0 diff |
