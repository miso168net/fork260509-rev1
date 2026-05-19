# Quickstart: F10.1 rust-jwt-refresh-token-signing(R-8 修 + R-7 surface baseline)

**Source**: [spec.md](spec.md) + [research.md](research.md) + [data-model.md](data-model.md) + [contracts/verification-commands.md](contracts/verification-commands.md)
**Date**: 2026-05-19
**Status**: Phase 1 Design(impl 階段以 `/speckit-tasks` 後接執行)

> F10.1 為 **rust source change feature**(類 F5.1 / F6 兩段式 commit)。本 quickstart 引導 operator 走完 build + 5 個 Step + R-7 friction 紀錄(F10.2 baseline)。

---

## Prerequisites

- F10 已 merge(`8f0e84c` 已在 origin)、F10 acceptance R-8 friction 已紀錄
- W-FA1 / W-FA2 / W-FA3 三件套已 merge(stack 可起、`refresh_token_secret` docker secret 結構已 wire)
- 在 outer feature branch `018-rust-jwt-refresh-token-signing` 上(per `before_specify` pre-hook 已建)
- rust-api worktree 在 `rev1-admin-rust-api` branch、HEAD 對齊 outer pin
- docker daemon 啟動 + BuildKit available
- `Soybean` user + `123456` plaintext pwd 可用(per CLAUDE.md §5.1)

---

## Step 1: 確認當前環境 baseline(F10 結束 state)

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1

# branch 確認
git branch --show-current  # 預期: 018-rust-jwt-refresh-token-signing

# 三邊 git status 確認(rust-api worktree clean、無 pending diff)
git status --short
cd rust-api && git branch --show-current && git status --short && cd ..

# (optional) F10 baseline regression: refresh_token 仍是 Ulid 26 char
# 若 stack 還起著、跑 C-V2 baseline 看 length 為 26
```

---

## Step 2: 改 rust-api source(5 個檔、~85 LOC、within worktree)

對齊 [data-model.md](data-model.md) §E1-E4:

1. **`rust-api/server/config/src/model/jwt_config.rs`**:加 2 field(`refresh_secret: String` + `refresh_expire: i64`)— per §E2
2. **`rust-api/server/config/src/secret_loader.rs`**:`apply_jwt_secret_hardening` extend 加 refresh_secret hardening + empty-file fallback to jwt_secret(per clarify Q1 + research R-Q3)— per §E2 implementation sketch
3. **`rust-api/server/core/src/web/jwt.rs`**(or `auth.rs` 視 Claims 位置):
   - 加 `RefreshClaims` struct + `RefreshClaims::new(sub: String)` + 5 setter — per §E1
   - 加 `REFRESH_KEYS` global(`OnceCell<Arc<Mutex<Keys>>>`)+ `init_refresh_keys(jwt_config)` fn — per §E3
   - 加 `JwtUtils::generate_refresh_token(user_id: String)` method — per §E4
4. **`rust-api/server/service/src/admin/sys_auth_service.rs:358`**:1 行改 — `refresh_token: JwtUtils::generate_refresh_token(user_id.clone()).await?`
5. **`rust-api/server/resources/application.yaml`**:加 2 行(`jwt.refresh_secret: "change-me-refresh-secret"` + `jwt.refresh_expire: 7200`)— per research R-Q2

主程式 bootstrap(可能 `main.rs` / `lib.rs` / `initialize/`)加 `init_refresh_keys(&jwt_config).await?;` 緊接 `init_keys()` 之後 — per research R-Q1。

---

## Step 3: Build rust-api image + 加 unit test

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1

# 1. unit test 先跑(red → green、TDD style)
cd rust-api
cargo test -p config test_apply_jwt_refresh_secret_empty_file_fallback_to_jwt_secret
cargo test -p core test_generate_refresh_token_signs_valid_hs256_jwt_with_refresh_claims
# 預期: 2 個 test 都 PASS(C-V1)

# 2. rust-api docker image rebuild(cold ~5-6 min / warm ~2-3 min per R-Q8)
cd ..
docker compose build rust-api --progress=plain
```

---

## Step 4: 改 docker-compose.yml + 起 stack

```bash
# 改 docker-compose.yml rust-api service:
#   environment 加: APP_JWT_REFRESH_SECRET_FILE: /run/secrets/refresh_token_secret
#   secrets 加: refresh_token_secret(ref)

# 起 W-FA1 stack with track-a profile
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait

# 確認 7 service expected state
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
# 預期: 6 healthy + migration exited 0
```

---

## Step 5: 跑 F10.1 acceptance(7 個 C-V、~15s)

```bash
# C-V2 rust login + refresh_token JWT 格式驗(R-8 修)
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.refreshToken')
echo "length=${#REFRESH_TOKEN}, dots=$(echo "$REFRESH_TOKEN" | tr -dc '.' | wc -c)"
# 預期 length > 100, dots >= 2

# C-V3 refreshToken HTTP non-500 + R-7 surface
curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" http://127.0.0.1:11080/api/auth/refreshToken
# 預期 HTTP 4xx with "Token has already been used."

# C-V4 nestjs log
docker compose logs nestjs --tail=80 2>&1 | grep -E "JsonWebTokenError|jwt malformed" | head -5
# 預期: 0 lines(R-8 修)
docker compose logs nestjs --tail=80 2>&1 | grep -E "Token has already been used|refreshTokenCheck" | head -5
# 預期: 至少 1 line(R-7 surface)

# C-V5 psql sys_tokens
DB_PASSWORD=$(cat deploy/secrets/postgres_password.txt 2>/dev/null || echo "postgres")
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust \
  -c "SELECT char_length(refresh_token) AS rt_len, status FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"
# 預期 rt_len > 100, status = ACTIVE

# C-V6 secret 對齊
docker compose exec rust-api env | grep APP_JWT_REFRESH_SECRET_FILE
docker compose exec nestjs env | grep REFRESH_TOKEN_SECRET

# C-V7 zero diff
git diff HEAD -- base-web/src/ fork260509-soybean-admin-nestjs/ | wc -l
# 預期: 0
```

---

## 故障排查段(F10.1 friction 紀錄 + R-7 baseline 給 F10.2)

### F10.1 expected friction(R-8 修後新 surface 點)

```text
[F10.1 friction R-7] TRIGGERED — nestjs refreshTokenCheck throw — status="ACTIVE" !== "unused"
  HTTP status: 4xx(預期 401/403/4xx)
  Response body: nestjs envelope with "Token has already been used." (or 類似)
  nestjs log:
    (預期會看到 tokensAggregate.refreshTokenCheck() 後 throw、
     `if (this.status !== TokenStatus.UNUSED)` 觸發)
  落點: tokens.entity.ts:refreshTokenCheck() — nestjs 端
  根本原因: rust TokenStatus enum 序列化 SCREAMING_SNAKE_CASE("ACTIVE") vs
           nestjs TokenStatus enum lowercase("unused"/"used");rust 寫的 status="ACTIVE"
           在 nestjs 端被視為「非 unused」、視同 used → throw "Token has already been used."
  修法: F10.2 rust-tokenstatus-string-align
  Acceptance baseline: F10.2 acceptance 期此 friction 修通、refreshToken endpoint 完整 PASS

[F10.1 fix R-8] NO LONGER TRIGGERED — refresh_token 已是 HS256 JWT
  F10 baseline: refresh_token = Ulid 26 char → nestjs verifyAsync throw "jwt malformed"
  F10.1 修後: refresh_token = HS256 JWT ~150 char + 2 dots → nestjs verifyAsync PASS
  落點消失: authentication.service.ts:44 jwtService.verifyAsync 通過、進入 refreshTokenCheck
  Evidence: C-V4 grep "JsonWebTokenError" = 0 lines、C-V3 HTTP != 500 jwt malformed
```

### 故障排查(Step 5 acceptance fail 路徑)

- **C-V1 unit test fail**:rust code 有 bug、回到 Step 2-3 修。常見:`RefreshClaims` serde derive 漏、`encode` 用錯 key、setter 順序錯。
- **C-V2 refresh_token length = 26**:rust 改動沒 build 進 image,跑 `docker compose build rust-api --no-cache` 或檢 `generate_auth_output` 是否確實調用 `generate_refresh_token`。
- **C-V3 HTTP 500 jwt malformed**:R-8 修沒生效。檢:(a) `generate_refresh_token` 是否真的 `encode` 而非繼續用 Ulid;(b) image rebuild 是否成功;(c) `REFRESH_KEYS` 是否 init。
- **C-V3 HTTP 200 with new tokens**:R-7 沒 surface — 意外通過!可能 nestjs `refreshTokenCheck` 對 `"ACTIVE"` 跑通(spec assumption 推翻),需 abort F10.2 重評範疇。**極低機率**(per R-5)。
- **C-V4 grep "jwt malformed" 仍 ≥ 1 line**:R-8 修沒到位,重新檢 Step 2-3。
- **C-V4 grep "Token has already been used" = 0 line**:R-7 沒 surface(per C-V3 路徑);需檢查 nestjs log level、`docker compose logs nestjs --tail=200` 抓更多 context。
- **C-V5 rt_len = 26**:同 C-V2 fail mode、image 沒 rebuild。
- **C-V6 rust-api `APP_JWT_REFRESH_SECRET_FILE` 不存在**:docker-compose.yml Step 4 改動沒落地,檢 yaml syntax + restart stack。
- **C-V6 nestjs `REFRESH_TOKEN_SECRET` 為空**:W-FA1 baseline 已驗、F10.1 不該破壞、檢 W-FA1 nestjs entrypoint。
- **C-V7 git diff > 0 在 base-web 或 nestjs fork**:有意外改動(可能 IDE auto-format、git submodule sync 等),abort F10.1 + 改正。
- **Stack 起不來、rust-api restart loop**:secret_loader panic(可能 yaml 預設值觸 `validate_jwt_secret` placeholder 拒絕);需確認 docker-compose.yml `APP_JWT_REFRESH_SECRET_FILE` 設好 + secret file 存在(空檔 OK、per Q1)。
