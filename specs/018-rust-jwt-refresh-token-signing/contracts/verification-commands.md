# Contract: F10.1 verification commands

**Feature**: F10.1 — rust-jwt-refresh-token-signing
**Contract type**: rust unit test(cargo)+ host bash / curl / psql / docker compose / git verification command set
**Date**: 2026-05-19

> 本契約定義 F10.1 acceptance + zero-regression 階段跑的具體驗證命令。對齊 spec US1~US3 acceptance(per clarify Q3 + 2 unit test、共 8 個 SC、surface R-7 friction baseline 給 F10.2)。

---

## C-V1: rust unit test — `cargo test` 兩個關鍵 test

```bash
# 在 rust-api/ worktree 內
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
cargo test -p core test_generate_refresh_token_signs_valid_hs256_jwt_with_refresh_claims
cargo test -p config test_apply_jwt_refresh_secret_empty_file_fallback_to_jwt_secret
```

**Expected**:
- 兩個 test 都 PASS
- output 含 `1 passed; 0 failed` 兩次

**Test scope**:
- **(a)** `generate_refresh_token` 簽 + decode roundtrip:用 known test secret + user_id → generate → decode with same secret + RefreshClaims target type → assert sub == user_id、exp set + 在合理範圍、iss == jwt_config.issuer、jti 26 char Ulid。
- **(b)** `secret_loader` empty-file fallback:
  - given:temp empty file path + `APP_JWT_REFRESH_SECRET_FILE=<temp file>` envvar + JwtConfig with `jwt_secret="fake-jwt-secret-32-char-padded!"` + `refresh_secret="placeholder-from-yaml"`,
  - when:`apply_jwt_secret_hardening(&mut jwt)`,
  - then:`jwt.refresh_secret == jwt.jwt_secret`(= `"fake-jwt-secret-32-char-padded!"`、empty file 觸發 fallback)。

**對應**:US1 P1 + clarify Q3 / SC-010 / FR-022

---

## C-V2: rust login HTTP envelope + refresh_token JWT 格式驗(R-8 修)

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
LOGIN_RESPONSE=$(curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login)
echo "$LOGIN_RESPONSE" | head -c 500

REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.refreshToken')
echo "refresh_token length: ${#REFRESH_TOKEN}"
DOT_COUNT=$(echo "$REFRESH_TOKEN" | tr -dc '.' | wc -c)
echo "dot count: $DOT_COUNT"
```

**Expected**:
- HTTP 200(`-f` enforce non-2xx fail)
- body envelope `{code, data:{token, refreshToken, ...}}`
- `refresh_token length` > 100(JWT 三段 base64url string、典型 ~150)
- `dot count` ≥ 2(JWT 結構必須兩個 `.` 分隔 header/payload/signature)

**對應**:US1.1 / SC-001 / FR-001(R-8 修核心)

---

## C-V3: refreshToken endpoint HTTP — R-8 修驗 + R-7 surface

```bash
REFRESH_RESPONSE=$(curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
  http://127.0.0.1:11080/api/auth/refreshToken)
echo "$REFRESH_RESPONSE"
```

**Expected**:
- HTTP status:**非 500 with `jwt malformed`**(R-8 修確認、F10 baseline 對比)
- HTTP status:**HTTP 4xx**(預期 401 / 4xx、R-7 surface 點)
- body 含 `'Token has already been used.'` or similar nestjs `refreshTokenCheck` throw message(R-7 evidence)

**對應**:US1.2 / SC-002 / FR-001 + FR-020

---

## C-V4: nestjs container log grep — R-7 evidence + R-8 修確認

```bash
echo "=== R-8 修驗(預期無 jwt malformed)==="
docker compose logs nestjs --tail=80 2>&1 | grep -E "JsonWebTokenError|jwt malformed" | head -5

echo ""
echo "=== R-7 surface evidence ==="
docker compose logs nestjs --tail=80 2>&1 | grep -E "Token has already been used|refreshTokenCheck" | head -5
```

**Expected**:
- 第一個 grep:**0 lines**(R-8 修、不再有 `JsonWebTokenError: jwt malformed`)
- 第二個 grep:**至少 1 line**(R-7 evidence、含 `'Token has already been used.'`、F10.2 修點)
- 紀錄結果到 `quickstart.md` F10.1 friction section + F10.2 source baseline

**對應**:US1.3 / SC-003 / FR-020

---

## C-V5: psql sys_tokens — JWT 格式驗 + status R-7 source 仍在

```bash
DB_PASSWORD=$(cat deploy/secrets/postgres_password.txt 2>/dev/null || echo "postgres")
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust \
  -c "SELECT id, status, char_length(refresh_token) AS rt_len, refresh_token, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"
```

**Expected**:
- 1 row
- `status` = `"ACTIVE"`(R-7 source 仍在、F10.2 修)
- `rt_len` > 100(JWT 字串、F10 baseline 對比為 26)
- `refresh_token` 含 2 個 `.`、可看出 JWT 三段結構(`header.payload.signature` base64url 編碼)
- `created_at` 為近期 timestamp

**對應**:US2.1 / SC-004 / FR-002(寫入 self-consistent)

---

## C-V6: secret 對齊驗(rust + nestjs 兩端 effective secret 對稱)

```bash
echo "=== rust-api 容器內 env + secret file ==="
docker compose exec rust-api env | grep -E "APP_JWT_REFRESH_SECRET|APP_JWT_JWT_SECRET" | head -5
docker compose exec rust-api sh -c "ls -la /run/secrets/refresh_token_secret /run/secrets/jwt_secret && wc -c /run/secrets/refresh_token_secret"

echo ""
echo "=== nestjs 容器內 env ==="
docker compose exec nestjs env | grep -E "JWT_SECRET|REFRESH_TOKEN_SECRET" | head -5
```

**Expected**:
- rust-api env:`APP_JWT_REFRESH_SECRET_FILE=/run/secrets/refresh_token_secret` 存在
- secret files:兩個 file mount OK、`refresh_token_secret` 為空(dev 預設、`wc -c` = 0 or 含少量 whitespace、clarify Q1 fallback path)
- nestjs env:`REFRESH_TOKEN_SECRET=<value>`(非空、若 file 空 → fallback `$JWT_SECRET` 值)
- 兩端 effective refresh_secret 對齊(rust 走 empty-file fallback to jwt_secret、nestjs 同邏輯走 `${RTS:-$JWT_SECRET}`)

**對應**:US3.1 + US3.2 / SC-005 + SC-006 / FR-003

---

## C-V7: zero diff(base-web + nestjs fork)+ rust-api scope + two-stage commit verify

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
echo "=== base-web + nestjs fork zero diff ==="
git diff HEAD -- base-web/src/ fork260509-soybean-admin-nestjs/ | wc -l
echo "(預期 0)"

echo ""
echo "=== rust-api scope: 5-6 file change (F10.1 expected)==="
cd rust-api && git diff HEAD --stat | head -10
cd ..

echo ""
echo "=== outer scope: docker-compose.yml + spec docs ==="
git diff HEAD --stat | head -15

echo ""
echo "=== two-stage commit verify ==="
cd rust-api && git log --oneline -2
cd ..
git log --oneline -3
```

**Expected**:
- base-web + nestjs fork:輸出 `0`(per FR-006 + FR-009 + SC-008 + SC-009)
- rust-api 改 5-6 file(jwt_config.rs / secret_loader.rs / jwt.rs / sys_auth_service.rs / application.yaml + maybe global.rs for REFRESH_KEYS)、~85 LOC
- outer 改 docker-compose.yml + INTEGRATION-CHECKLIST.md + spec docs + .specify/feature.json
- worktree 內 1 個 conventional commit `feat(rust-api): F10.1 ...`
- outer 內 1-2 個 commit + 1 個 `chore(submodule): bump rust-api to <sha> ...` SHA pin

**對應**:SC-007 / SC-008 / SC-009 / FR-010

---

## Contracts 數量

| Contract | 範疇 | spec 對應 |
|---|---|---|
| C-V1 | rust unit test 2/2 PASS | US1 + clarify Q3 / SC-010 / FR-022 |
| C-V2 | rust login HTTP envelope + refresh_token JWT 格式驗 | US1.1 / SC-001 / FR-001(R-8 修核心)|
| C-V3 | refreshToken endpoint HTTP non-500 + R-7 surface | US1.2 / SC-002 / FR-001 + FR-020 |
| C-V4 | nestjs log R-7 evidence + R-8 修確認 | US1.3 / SC-003 / FR-020 |
| C-V5 | psql sys_tokens JWT format + R-7 source 仍在 | US2.1 / SC-004 / FR-002 |
| C-V6 | rust + nestjs 兩端 effective secret 對稱 | US3.1 + US3.2 / SC-005 + SC-006 / FR-003 |
| C-V7 | zero diff + rust-api scope + two-stage commit | SC-007 + SC-008 + SC-009 / FR-010 |

**7 個 stack verification + 2 個 unit test command(in C-V1)= 9 個 verification、涵蓋 F10.1 R-8 修 + R-7 surface baseline + secret 對齊 + zero-regression + two-stage commit 全部**。

## Acceptance score 計算(per NFR-004)

- US1 P1 MVP:**3 個 scenario**(C-V2 / C-V3 / C-V4)
- US2 P2:**1 個 scenario**(C-V5)
- US3 P3:**2 個 scenario**(C-V6 一指令兩個 grep、計 2 個 sub-PASS)
- Unit test:**2 個 sub-test**(C-V1 內)
- **總 8/8 PASS**(per spec NFR-004 + SC-001~011)
