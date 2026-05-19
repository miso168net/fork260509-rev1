# Contract: F10 verification commands

**Feature**: F10 — refresh-token-nestjs-bridge(post-Option A reset)
**Contract type**: host bash / curl / psql / docker compose / git verification command set
**Date**: 2026-05-19

> 本契約定義 F10 acceptance + zero-regression 階段跑的具體驗證命令。對齊 spec US1~US3 acceptance(post-Option A reset 後 5 個 SC + 2 個 surface friction)。

---

## C-V1: rust login HTTP 200 + envelope shape

```bash
LOGIN_RESPONSE=$(curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login)
echo "$LOGIN_RESPONSE" | head -c 400
```

**預期**:HTTP 200(`curl -f` 保證 non-2xx fail)+ body 含 `"code":"0000"`(F4 envelope shape)+ `"data":{"token":"...", "refreshToken":"..."}`

**對應**:US1.1 / SC-001 / FR-001

---

## C-V2: 取 refresh_token + curl refreshToken endpoint(預期 friction surface)

```bash
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.refreshToken')
echo "Got refresh_token (Ulid 26 char): $REFRESH_TOKEN"

# refresh_token = Ulid(R-8 surface)
# Length 26 + 全部 base32 Crockford char、非 JWT(無 . separator)
[[ ${#REFRESH_TOKEN} -eq 26 ]] && echo "✓ Confirmed Ulid format (R-8 evidence)"

# 跑 refreshToken endpoint(預期 friction)
REFRESH_RESPONSE=$(curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
  http://127.0.0.1:11080/api/auth/refreshToken)
echo "$REFRESH_RESPONSE"
```

**預期**:
- HTTP **非 200**(預期 401 / 4xx / 500 — friction surface)
- response body 含 nestjs envelope shape + error message hint(`JsonWebTokenError` / `'Token has already been used.'` / `NotFoundException` 之一)

**對應**:US1.2 / SC-002 / FR-001(post-Option A 改 expected fail with friction surface)

---

## C-V3: nestjs container log grep friction 落點

```bash
echo "=== nestjs container log(last 50 line)==="
docker compose logs nestjs --tail=50 2>&1 | grep -iE "jwt|token|refresh|JsonWebToken|NotFoundException|malformed" | head -20
```

**預期**:
- log 含 `JsonWebTokenError: jwt malformed`(R-8 evidence、nestjs jwtService.verifyAsync 對 Ulid throw)
- OR log 含 `'Token has already been used.'`(R-7 evidence、若 R-8 已修但 R-7 仍 surface)
- 紀錄 grep 結果到 quickstart.md 故障排查段

**對應**:US1.3 / SC-002 / SC-003 / FR-001

---

## C-V4: psql sys_tokens 對 rust login 寫入確認

```bash
DB_PASSWORD=$(cat deploy/secrets/postgres_password.txt 2>/dev/null || echo "postgres")
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust \
  -c "SELECT id, status, refresh_token, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"
```

**預期**:
- 1 row、status = `"ACTIVE"`(rust SCREAMING_SNAKE_CASE serialization、R-7 evidence)
- refresh_token 值 = Ulid 字串(26 char、無 `.` separator、R-8 evidence)

**對應**:US2.1 / SC-004 / FR-002 / FR-013

---

## C-V5: quickstart + INTEGRATION-CHECKLIST 含 F10.1 + F10.2 follow-up 範疇

```bash
echo "=== quickstart 含 F10.1 / F10.2 引用 ==="
grep -E "F10\.1|F10\.2|rust-jwt-refresh-token-signing|rust-tokenstatus-string-align" \
  specs/017-refresh-token-nestjs-bridge/quickstart.md docs/INTEGRATION-CHECKLIST.md | head -10
```

**預期**:
- quickstart.md 故障排查段含 F10.1 / F10.2 範疇定義
- INTEGRATION-CHECKLIST.md F10 row 列 F10.1 / F10.2 outbound dependency

**對應**:US3 / SC-005 / FR-002b / FR-018

---

## C-V6: Three sides zero diff

```bash
git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/ | wc -l
echo "(預期 0)"
```

**預期**:輸出 `0`(per spec FR-003 + FR-008 post-Option A + FR-014;F10 reset 後固定 0 應用層改動、嚴守 4-side 零改動延伸)

**對應**:SC-007 / SC-008

---

## C-V7: Single-commit verify(per FR-009 post-Option A)

```bash
git log --oneline -1
git diff HEAD~1 HEAD --stat
```

**預期**:
- last commit 為 F10 主要落地 commit(預期 `feat(spec): F10 refresh-token-nestjs-bridge wire-up baseline + R-7/R-8 surface`)
- diff stat 顯示 outer file 改動(specs/017-* + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md 可選)、無 worktree gitlink SHA 變動

**對應**:SC-006 / FR-009

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-V1 | rust login HTTP envelope |
| C-V2 | refreshToken endpoint(expected friction)|
| C-V3 | nestjs log grep friction 落點 |
| C-V4 | psql sys_tokens 對 rust login 寫入確認 |
| C-V5 | quickstart + checklist follow-up 範疇驗 |
| C-V6 | Three sides zero diff |
| C-V7 | Single-commit verify |

**7 個 verification command、涵蓋 F10 wire-up + friction surface 全部 SC + FR + 零改動驗證**。
