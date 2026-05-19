# Verification Commands: F10.2 — rust-tokenstatus-string-align

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-19

6 個 C-V + 1 個 unit test contract = **7 個 verification scenario**。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F10.2 rust-api image 已 rebuild + container recreate。

---

## C-V1: rust unit test PASS

**Goal**: 驗證 F10.2 enum serialize 改動正確(3 forward + 3 reverse、per FR-017 + Q4 brainstorm)。

**Command**:
```bash
# 直接跑 cargo test in rust:1.86 container with host cargo cache mount
mkdir -p /tmp/cargo-cache-rev1/registry /tmp/cargo-cache-rev1/git
docker run --rm \
  -v /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api:/work \
  -v /tmp/cargo-cache-rev1/registry:/usr/local/cargo/registry \
  -v /tmp/cargo-cache-rev1/git:/usr/local/cargo/git \
  -w /work \
  rust:1.86-slim-bookworm \
  bash -c "apt-get update -qq && apt-get install -y --no-install-recommends pkg-config libssl-dev git >/dev/null 2>&1 && cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs -- --nocapture 2>&1 | tail -15"
```

**Expected**:
```
running 1 test
test definition::consts::tests::test_token_status_serialize_aligns_with_nestjs ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; ...
```

**Pass criteria**: `1 passed; 0 failed`、6 個 assert 全 PASS。

**Failure handling**: 如 derive 行為意外(R-1)→ unit test red、改 enum 設計(可能改 Option B 全 per-variant override 或加 `to_string` attribute 雙重)。

---

## C-V2: rust login HTTP envelope + refresh_token JWT format(F10.1 regression)

**Goal**: 驗 F10.1 既有 wire 不退化(rust 仍簽 HS256 JWT、refresh_token 為 JWT 三段)。

**Command**:
```bash
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)

REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['refreshToken'])")
TOKEN_LEN=${#REFRESH_TOKEN}
DOT_COUNT=$(echo -n "$REFRESH_TOKEN" | tr -dc '.' | wc -c)

echo "length=$TOKEN_LEN, dots=$DOT_COUNT"
echo "assertion: length > 100? $([ $TOKEN_LEN -gt 100 ] && echo PASS || echo FAIL)"
echo "assertion: dots == 2? $([ $DOT_COUNT -eq 2 ] && echo PASS || echo FAIL)"
```

**Expected**:
```
length=289, dots=2
assertion: length > 100? PASS
assertion: dots == 2? PASS
```

**Pass criteria**: refresh_token length > 100 + dots == 2(HS256 JWT 三段、F10.1 沿用)。

**Failure handling**: 如 length=26(回退 Ulid)、F10.1 退化、檢 image rebuild + cargo cache + secret_loader。

---

## C-V3: `/api/auth/refreshToken` HTTP 200 + 新 token pair(R-7 修)

**Goal**: 驗 R-7 修 = nestjs refreshTokenCheck PASS、refreshToken business flow 走通、HTTP 200 + 新 token pair。

**Command**(承接 C-V2 的 `$REFRESH_TOKEN`):
```bash
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['refreshToken'])")

REFRESH_RESPONSE=$(curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" http://127.0.0.1:11080/api/auth/refreshToken)
echo "$REFRESH_RESPONSE" | head -c 800
```

**Expected**:
```
{"code":0,"data":{"token":"eyJ...new-access-token...","refreshToken":"eyJ...new-refresh-token..."}}
---HTTP 200
```

**Pass criteria**:
- HTTP 200(非 4xx/5xx)
- body 含 `token` + `refreshToken`(新 pair)
- 無 `"Token has already been used."` 訊息

**Failure handling**:
- 如 HTTP 500 with `Token has already been used`:R-7 未修、檢 enum serialize 寫入 DB 字串值(C-V5 驗)
- 如 HTTP 500 with `jwt malformed`:R-8 退化、F10.1 退化、檢 image rebuild + RefreshClaims

---

## C-V4: nestjs log grep `'Token has already been used'|JsonWebTokenError|jwt malformed` = 0 line

**Goal**: 驗 R-7 + R-8 全清、nestjs 業務邏輯無 error。

**Command**:
```bash
echo "=== R-7 + R-8 evidence count (應 0 line) ==="
docker compose logs nestjs --tail=200 2>&1 | grep -cE "Token has already been used|JsonWebTokenError|jwt malformed"
echo ""
echo "=== R-7 + R-8 raw matches (應 empty) ==="
docker compose logs nestjs --tail=200 2>&1 | grep -E "Token has already been used|JsonWebTokenError|jwt malformed" | head -5
```

**Expected**:
```
=== R-7 + R-8 evidence count (應 0 line) ===
0

=== R-7 + R-8 raw matches (應 empty) ===
(no output)
```

**Pass criteria**: grep count = 0 + raw matches empty(R-7 修 + F10.1 R-8 修仍維持)。

**Failure handling**:
- 如 `Token has already been used` ≥ 1:R-7 未修、檢 C-V5 DB 寫入字串值是否為 "unused"
- 如 `JsonWebTokenError|jwt malformed` ≥ 1:F10.1 R-8 退化、檢 F10.1 secret 對齊 + image rebuild

**Edge case**: 若 nestjs log 已 cycled(--tail 200 不夠),用 `--since 5m` 取近 5 分鐘 log。

---

## C-V5: psql sys_tokens 雙 row state transition

**Goal**: 驗 rust 寫入 `status='unused'`(對齊)+ nestjs refreshToken 用過後改 `status='used'`(state transition)。

**Command**:
```bash
echo "=== sys_tokens 最新 2 row state transition ==="
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT status, char_length(refresh_token) AS rt_len, to_char(created_at, 'HH24:MI:SS') AS created FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 2"
```

**Expected**:
```
 status  | rt_len | created
---------+--------+----------
 unused  |    289 | 12:34:56   ← 最新: rust 新 login 寫入、F10.2 後對齊 nestjs
 used    |    289 | 12:34:55   ← 次新: nestjs refreshToken 用過後改、state transition 正確
(2 rows)
```

**Pass criteria**:
- 2 row 存在
- 最新 row `status='unused'`(rust 寫入字串值對齊驗、SC-004)
- 次新 row `status='used'`(nestjs refreshToken state transition 驗、SC-004)
- 兩 row `rt_len > 100`(F10.1 JWT format 沿用)

**Failure handling**:
- 最新 `status='ACTIVE'`:F10.2 enum 改未生效、檢 image rebuild + container recreate
- 次新 `status='REFRESHED'` 或 `'unused'`:nestjs state transition 未跑(refreshToken 未走通、C-V3 應同時 fail)
- 只有 1 row:C-V2 + C-V3 未跑、檢 acceptance 順序

**Edge case**(per R-6):若有舊 `"ACTIVE"` row 排在 LIMIT 之外(F10.1 acceptance 遺留),不影響 LIMIT 2 取最新 2。

---

## C-V6: F10.1 secret 對齊 regression(nestjs env grep)

**Goal**: 驗 F10.1 fallback chain 維持(REFRESH_TOKEN_SECRET == JWT_SECRET、F10.2 不退化)。

**Command**:
```bash
echo "=== nestjs PID 1 env: JWT_SECRET + REFRESH_TOKEN_SECRET ==="
docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"
```

**Expected**:
```
JWT_SECRET=da663b30ccc19cdd74056045015996e1f1d397a5c6f4bef10334f4d8bb0405e4
REFRESH_TOKEN_SECRET=da663b30ccc19cdd74056045015996e1f1d397a5c6f4bef10334f4d8bb0405e4
```

**Pass criteria**: 兩 envvar 都存在 + 值相同(F10.1 fallback chain 對齊維持)。

**Failure handling**:
- 兩 envvar 不同 value:F10.1 fallback chain 退化、不阻 F10.2(R-7 修不依賴 secret)、但需 F10.1 follow-up;F10.2 acceptance 仍可繼續
- 兩 envvar 為空:nestjs entrypoint 失效、F10.1 部署退化、嚴重退化 abort F10.2

---

## C-V7a: zero-regression(three-side scope verify)

**Goal**: 驗 base-web + nestjs fork 兩邊零改動、rust-api scope 收緊到單 file。

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
echo "=== rust-api scope (預期 1 file: consts.rs) ==="
(cd rust-api && git diff HEAD --stat)

echo ""
echo "=== outer scope (預期 CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + rust-api submodule pin + specs/019-* untracked) ==="
git status --short
```

**Pass criteria**:
- base-web/src/ diff = **0 line**(SC-008)
- nestjs fork diff = **0 line**(SC-007)
- rust-api scope = **1 file** `consts.rs` ~18 LOC(SC-011)
- outer scope = `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/019-*/` untracked、**0 docker-compose 改**(對比 F10.1 有 docker-compose.yml diff)

**Failure handling**:
- base-web 或 nestjs fork 有 diff:意外改動、abort F10.2 + 改正
- rust-api scope > 1 file:scope 漂移、檢是否誤改其他 file
- outer 有 docker-compose.yml diff:F10.2 範疇外、確認後 stash 或 abort

---

## C-V7b: W-FA1 stack regression

**Goal**: 驗 F10.2 build + restart 不破壞 W-FA1 baseline。

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
rust-api      running   Up Y (healthy)    ← Y < X 因 F10.2 rebuild + recreate
```

**Pass criteria**:
- 6 long-running service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)
- rust-api uptime Y 小於其他 5 service uptime X(表示 just recreated)
- migration 容器若顯示:exited 0(init container 正常 exit)

**Failure handling**:
- rust-api restart loop:secret_loader panic / enum derive expand error → 檢 build log + container log
- 其他 5 service unhealthy:意外退化、檢 docker compose logs <service>

---

## 完成標誌

7 個 verification(6 C-V + 1 unit test)全 PASS = F10.2 acceptance 9/9 PASS、ready for Phase 8 two-stage commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | unit test serialize | 1 passed; 0 failed |
| C-V2 | login JWT format(F10.1 regression)| length > 100 + dots == 2 |
| C-V3 | refreshToken HTTP 200 | HTTP 200 + new token pair |
| C-V4 | nestjs log no error | grep count = 0 |
| C-V5 | sys_tokens state transition | 最新 unused + 次新 used |
| C-V6 | F10.1 secret 對齊 regression | REFRESH_TOKEN_SECRET == JWT_SECRET |
| C-V7a | three-side scope | base-web/nestjs 0 diff + rust-api 1 file |
| C-V7b | W-FA1 stack regression | 6 healthy + rust-api 重啟 |
