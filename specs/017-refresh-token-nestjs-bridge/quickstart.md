# Quickstart: F10 refresh-token-nestjs-bridge(wire-up + friction surface)

**Source**: [spec.md](spec.md) + [research.md](research.md) + [contracts/verification-commands.md](contracts/verification-commands.md)
**Date**: 2026-05-19
**Status**: post-Option A reset(F10 = wire-up + friction 紀錄、0 rust patch)

> F10 acceptance 為 **wire-up baseline + friction surface 紀錄** feature(不是 happy path 跑通)。本 quickstart 引導 operator 走完 7 個 C-V verification + 紀錄 friction 到本檔故障排查段。

---

## Prerequisites

- W-FA1 / W-FA2 / W-FA3 三件套已 merge(`rev1-admin-root` branch)
- docker daemon 啟動 + BuildKit available
- nestjs image 已 build(若無:跑 `bash deploy/build-nestjs.sh`、W-FA3 落定)
- `Soybean` user + `123456` plaintext pwd 可用(per CLAUDE.md §5.1)

---

## Step 1: 起 stack(W-FA1 dev + track-a profile)

```bash
# 在 workspace root
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait

# 確認 7 service 期望狀態(6 healthy + migration exited 0)
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**預期**:7 service total(base-web / front-nginx / nestjs / postgres / redis / rust-api healthy + migration exited 0)。

---

## Step 2: C-V1 rust login HTTP envelope

```bash
LOGIN_RESPONSE=$(curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login)
echo "$LOGIN_RESPONSE" | head -c 400
```

**預期 PASS**:HTTP 200 + body 含 `"code":"0000"` + `"data":{"token":"...", "refreshToken":"..."}`(F4 envelope shape)

---

## Step 3: C-V2 refreshToken endpoint(expected friction)

```bash
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.refreshToken')
echo "Got refresh_token: $REFRESH_TOKEN(length: ${#REFRESH_TOKEN})"
# 預期 length 26、Ulid 字串 R-8 surface

REFRESH_RESPONSE=$(curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
  http://127.0.0.1:11080/api/auth/refreshToken)
echo "$REFRESH_RESPONSE"
```

**預期 expected fail**:HTTP **非 200**(預期 401 / 4xx / 500、friction surface 點)

---

## Step 4: C-V3 nestjs log grep friction 落點

```bash
docker compose logs nestjs --tail=50 2>&1 | grep -iE "jwt|token|refresh|JsonWebToken|NotFoundException|malformed" | head -20
```

**紀錄 grep 結果到本檔故障排查段**(用 `[F10 friction]` prefix 標記)

---

## Step 5: C-V4 psql sys_tokens 確認 rust 寫入

```bash
DB_PASSWORD=$(cat deploy/secrets/postgres_password.txt 2>/dev/null || echo "postgres")
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust \
  -c "SELECT id, status, refresh_token, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"
```

**預期 PASS**:1 row、status = `"ACTIVE"`(R-7 evidence)、refresh_token 為 Ulid 字串 26 char(R-8 evidence)

---

## Step 6: C-V6 + C-V7 zero diff + single commit

```bash
git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/ | wc -l
git log --oneline -1
```

**預期**:zero diff、單段 outer commit

---

## 故障排查段(F10 friction 紀錄 + F10.1/F10.2 follow-up 範疇)

### F10 friction 落點

實測結果(T022 2026-05-19、--profile track-a 啟動後、curl POST /api/auth/refreshToken body=`{"refreshToken":"01KRYP31K587EG0D1XNZE4KW7Y"}`):

```text
[F10 friction R-8] TRIGGERED — nestjs verifyAsync 立即 throw，refresh_token 是 Ulid 26 字元字串、無 JWT 三段結構
  HTTP status: 500
  Response body: {"code":500,"message":"jwt malformed","error":{"code":500,"message":"jwt malformed"}}
  nestjs log (摘錄):
    body: { refreshToken: '01KRYP31K587EG0D1XNZE4KW7Y' },
    error: {
      message: 'jwt malformed',
      stack: 'JsonWebTokenError: jwt malformed
          at module.exports [as verify] (.../jsonwebtoken@9.0.2/.../verify.js:70:17)
          at .../@nestjs+jwt@11.0.0_.../jwt.service.js:75:17'
    }
  落點: authentication.service.js:44:19 (compiled) — jwtService.verifyAsync(refreshToken, {...})
  根本原因: rust 以 Ulid::new().to_string() 產生 refresh_token(純 26 字元 Ulid 字串)，nestjs jwtService.verifyAsync 要求 JWT 三段 header.payload.signature，立即 throw JsonWebTokenError。

[F10 friction R-7] NOT TRIGGERED (R-8 先攔截，call chain 未到此)
  若 R-8 修了(F10.1 落地後)會出現:nestjs refreshTokenCheck throw — status='ACTIVE' !== 'unused'
  log 預期: Token has already been used.
  落點: tokens.entity.ts:refreshTokenCheck() — if (this.status !== TokenStatus.UNUSED) throw
  T030 psql 實測(2026-05-19 07:17:42): sys_tokens.status = 'ACTIVE'(SCREAMING_SNAKE_CASE)，nestjs 期望 'unused'(lowercase)
  修法: F10.2 rust-tokenstatus-string-align

[F10 observation] rust login response "code" 欄位為整數 0，F4 spec envelope 期望字串 "0000"。非 F10 範疇、不阻斷、留 follow-up 備查。
```

### F10.1 rust-jwt-refresh-token-signing(follow-up)

**範疇**:rust 改 refresh_token 從 Ulid 字串為 JWT 簽。

**改動點預估**(3 處 rust patch):
1. `rust-api/server/service/src/admin/sys_auth_service.rs:357` — `refresh_token: Ulid::new().to_string()` → 用 `JwtUtils::generate_refresh_token(claims, refresh_secret)` 簽 JWT
2. `rust-api/server/config/src/.../jwt_config.rs` — 加 `refresh_secret: String` field(對應 W-FA1 既有 `REFRESH_TOKEN_SECRET` envvar + _FILE pattern)
3. `rust-api/server/core/src/web/jwt.rs` — 加 `generate_refresh_token` method(類 `generate_token` 但用 refresh_secret + 不同 exp、可能 HS256 default)

**Commit 模式**:兩段式(per CLAUDE.md §6.1 — 動 rust-api worktree)

**Acceptance**:rust login 後 refresh_token 是 JWT 三段、nestjs jwtService.verifyAsync PASS。

**Solo unlock**:F10.1 通即 nestjs verify 階段 PASS、進入 refreshTokenCheck;F10.2 還沒做 → refreshTokenCheck 對 `"ACTIVE"` throw、仍 fail。

### F10.2 rust-tokenstatus-string-align(follow-up)

**範疇**:rust `TokenStatus` enum 字串值對齊 nestjs(`"unused"` / `"used"`)。

**改動點預估**(2-3 處 rust patch):
1. `rust-api/server/constant/src/definition/consts.rs:5` — `#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]` 改 `"lowercase"` OR 改 enum variants(Active → Unused、Refreshed → Used、Revoked → ???)
2. `rust-api/server/service/src/admin/events/access_token_event.rs:30` — write site 對齊新 enum 值
3. (可能)其他 read site 對齊

**Commit 模式**:兩段式(per CLAUDE.md §6.1)

**Acceptance**:rust login 寫 sys_tokens.status = `"unused"`、nestjs refreshTokenCheck PASS、進入 generateAccessToken step。

**Solo unlock**:F10.2 + F10.1 都通後 nestjs refreshToken 完整跑通 → 後續會建 F10.3 或 F11 之後加 end-to-end happy path acceptance feature。

### 解鎖條件

- F10 完成 → 解鎖 F10.1 / F10.2(各自獨立、可平行 brainstorm)
- F10.1 + F10.2 完成 → 解鎖 nestjs refreshToken end-to-end 跑通驗(可能 F10.3 整合 feature 或 F11 系列加新 US)
- F13 仍依賴 F10.1+F10.2(rust 接手 refresh_token 簽 + status enum 對齊本身就是 F13 一部分)
