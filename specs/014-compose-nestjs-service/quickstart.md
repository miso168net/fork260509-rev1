# Quickstart: W-FA1 compose-nestjs-service

**Feature**: W-FA1 — compose-nestjs-service
**Audience**: deploy operator / integration tester
**Date**: 2026-05-18

> 本 quickstart 是 W-FA1 implementer 操作指引 + acceptance 階段對應命令。

---

## 前提

- W-F6 dev stack 可正常啟動(`docker compose -f -f dev.yml up --wait` 6 service healthy)
- `deploy/secrets/*.txt` 5 個既有 secret 已備
- `fork260509-soybean-admin-nestjs/` 本機 ready(per CLAUDE.md §2)
- 當前 git branch:`014-compose-nestjs-service`
- 前置:F5.1 follow-up patch + F6 已 merge 到 rev1-admin-root(outer commit `4d44c59` / merge `a431215`)— 確保 base stack 完整

---

## 模式 1:Implement workflow

### Step 1:準備 nestjs image build

```bash
# Build nestjs image(BuildKit cache mount、incremental ≤ 30s warm)
DOCKER_BUILDKIT=1 docker build \
  -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
  -t nestjs:rev1-admin-nestjs \
  fork260509-soybean-admin-nestjs/backend/

# Verify
docker images nestjs:rev1-admin-nestjs --format "{{.Repository}}:{{.Tag}} {{.Size}}"
# 預期:nestjs:rev1-admin-nestjs   ~400-500MB
```

### Step 2:備 refresh_token_secret(可選)

```bash
# 選項 A:不備(走 fallback to JWT_SECRET)— **但 docker compose 需 file 存在**
touch deploy/secrets/refresh_token_secret.txt

# 選項 B:備(獨立 secret、F10 final 形態)
openssl rand -hex 32 > deploy/secrets/refresh_token_secret.txt

# Verify
ls -la deploy/secrets/refresh_token_secret.txt
```

### Step 3:加 nestjs service block(per data-model E-1 + C-C1)

改 `docker-compose.yml`:
- 加 nestjs service block(30 行 yaml、per C-C1 / C-C2 / C-C3 / C-C4)
- 加 `refresh_token_secret:` 條目進 `secrets:` section(per C-C5)

改 `docker-compose.dev.yml`:
- 加 nestjs ports override(per C-C6 + E-3)

改 `docker-compose.prod.yml`:
- 加 nestjs prod override(per C-C7 + E-4)

改 `deploy/secrets/refresh_token_secret.txt.example`(新建、per C-S3 + E-5)

### Step 4:Dev stack `--profile track-a` 啟動

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps
# 預期:7 service 全 healthy(postgres / redis / migration exited / rust-api / base-web / front-nginx / nestjs)
```

### Step 5:Acceptance(per verification-commands.md C-V*)

跑 13 個 C-V 命令(C-V1 image build / C-V2 dev startup / C-V4 secret bridge / C-V5 DB / C-V6 healthcheck / C-V7 host port / C-V8 F6 regression / C-V9 zero diff / C-V10 env / C-V11 prod sanity / C-V12 model.conf path / C-V13 sys_endpoint negative)。

如 OK,進 Phase 7 單段 commit + push wait。

---

## 模式 2:Acceptance scenarios

### US1 P1 MVP — DESIGN-A profile 啟動 nestjs 加入 stack

```bash
# C-V2
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps --format "table {{.Service}}\t{{.Status}}"
# 預期:7 service 全 (healthy)

# C-V7
curl -fsS http://127.0.0.1:11082/v1/route/getConstantRoutes | head -c 200
# 預期:HTTP 200 + JSON envelope
```

### US2 P1 — Secret _FILE bridge

```bash
# C-V4
docker compose exec -T nestjs sh -c 'env | grep -cE "^(JWT_SECRET|REFRESH_TOKEN_SECRET|DATABASE_URL|REDIS_PASSWORD)="'
# 預期:4

docker compose exec -T nestjs sh -c 'echo -n $JWT_SECRET | wc -c'
# 預期:64

docker inspect rev1-admin-nestjs-1 | jq '.[0].Config.Env' | grep -iE "jwt_secret|password" | head -5
# 預期:只顯示 _FILE path
```

### US3 P2 — DB 共享 + sys_tokens schema verify

```bash
# C-V5
docker compose exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens" 2>&1 | head -15
# 預期:sys_tokens 表 schema(若存在);若不存在、降級 acceptance

docker compose logs nestjs --tail 50 | grep -iE "connection|prisma|error|warn"
# 預期:無 connection error / auth failed
```

### US4 P2 — nestjs healthcheck

```bash
# C-V6
docker inspect rev1-admin-nestjs-1 --format='{{json .State.Health}}' | jq
# 預期:Status: healthy, FailingStreak: 0

docker compose exec -T nestjs sh -c 'curl -fsS http://localhost:9528/v1/route/getConstantRoutes' | head -c 100
# 預期:HTTP 200 + JSON
```

### US5 P3 — DESIGN-B 形態(不啟 nestjs)

```bash
# C-V3
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps --format "{{.Service}}"
# 預期:6 service(無 nestjs)

docker compose ps --services | grep nestjs
# 預期:exit 1(無 hit)
```

### US6 P2 — 零回歸

```bash
# C-V8 F6 regression
TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login | grep -oP '"token":"\K[^"]+')

curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -c 100
# 預期:{"code":0,"data":true,"msg":"success","success":true}

# C-V9 zero diff
git diff HEAD -- base-web/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
# 預期:無輸出
```

---

## 模式 3:Phase 7 單段 commit + push wait(per W-F1~W-F7 慣例)

### Stage:outer 單段 commit

```bash
git status
# 預期 7 個 modified / new file:
#   modified: docker-compose.yml
#   modified: docker-compose.dev.yml
#   modified: docker-compose.prod.yml
#   modified: CLAUDE.md
#   modified: docs/INTEGRATION-CHECKLIST.md
#   modified: .specify/feature.json
#   new:       deploy/secrets/refresh_token_secret.txt.example
#   new:       specs/014-compose-nestjs-service/

git add docker-compose.yml \
        docker-compose.dev.yml \
        docker-compose.prod.yml \
        deploy/secrets/refresh_token_secret.txt.example \
        CLAUDE.md \
        docs/INTEGRATION-CHECKLIST.md \
        .specify/feature.json \
        specs/014-compose-nestjs-service/

git commit -m "$(cat <<'EOF'
feat(deploy): W-FA1 加 nestjs service + profile=track-a + JWT secret _FILE bridge

rev1 deploy 階段 Track DESIGN-A 專屬第一個 feature(P7 三件套 W-FA1/W-FA2/W-FA3
中最先動)。把 nestjs service 加進 rev1 docker compose stack、走 profile=track-a
啟動模式、共享 rev1 既有 postgres + redis、JWT secret 透過 W-F4 _FILE pattern
與 rust-api 共享。

改 / 新建(6 個 outer file + 1 個 local image artifact):
- docker-compose.yml:加 nestjs service block(profile=track-a、4 secrets ref、
  entrypoint sh wrapper、healthcheck、depends_on 3 service、restart unless-stopped)
  + secrets section 加 refresh_token_secret 條目
- docker-compose.dev.yml:加 nestjs ports override(127.0.0.1:11082:9528)
- docker-compose.prod.yml:加 nestjs prod override(無 ports、restart always)
- deploy/secrets/refresh_token_secret.txt.example(tracked、fallback JWT_SECRET 機制)
- CLAUDE.md §5.2 / §5.2.1:加 track-a profile 啟動命令 + port 11082
- docs/INTEGRATION-CHECKLIST.md:Phase W-7 Track-A roadmap + W-FA1 ✅ + Current Focus
- nestjs:rev1-admin-nestjs image build(local、未 push registry、留 W-FA3)

範疇:nestjs container healthy + JWT secret _FILE bridge + DB 共享同 schema +
sys_tokens schema acceptance verify;不含 nginx routing(W-FA2)/ refreshToken
應用邏輯(F10)/ Casbin pub-sub 訂閱(F10);Dockerfile 沿用 fork 不動 source
(Constitution Principle IV/V 延伸)。

Acceptance:US1 P1 MVP 3/3 + US2 P1 3/3 + US3 P2 3/3 + US4 P2 3/3 + US5 P3 2/2 +
US6 P2 3/3 = 17/17 PASS;Casbin allowlist mode 沿用 rust-api 主導不擴張;sys_tokens
schema acceptance 若不存在降級為 connectivity-only(F10 follow-up);base-web src /
rust-api / nestjs fork 三邊零改動。

Constitution Check 13 PASS / 16 N/A / 0 violation;DESIGN-A → DESIGN-B 遷移時
整組刪除 3 處(service block / secret 條目 / host port)、無 DB / application 改動。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Push 等 user 同意
# git push origin 014-compose-nestjs-service
```

---

## 故障排查

### 1. nestjs image build fail

**症狀**:`docker build ...` fail、可能 pnpm-lock.yaml 版本問題

**對策**:
```bash
# Check pnpm-lock.yaml 是否完整 commit
ls -la fork260509-soybean-admin-nestjs/backend/pnpm-lock.yaml
# 若 fork repo pnpm-lock 過舊、需 nestjs fork 升級 / rebase upstream(屬 fork 維護紀律、W-FA1 範疇外)
```

### 2. nestjs container 啟動 unhealthy

**症狀**:`docker compose ps` 顯示 nestjs `(unhealthy)`

**對策**:
```bash
docker compose logs nestjs --tail 100
# 可能原因:
# (a) secret file 缺漏 → 補 deploy/secrets/*.txt
# (b) DB connection fail → 確認 postgres healthy + DATABASE_URL 對齊
# (c) Casbin model.conf 找不到 → R-3 alternative,加 bind mount
# (d) 端口 9528 被占用 → unlikely(container 內 isolated)
```

### 3. dev stack 11082 port conflict

**症狀**:`docker compose ... up` fail `bind: address already in use`

**對策**:
```bash
# 找 occupier
sudo lsof -i :11082 || ss -lntp | grep 11082
# 殺占用 process 或改 W-FA1 host port
```

### 4. refresh_token_secret.txt 缺 / docker compose fail

**症狀**:`docker compose up` fail `secret file not found: refresh_token_secret`

**對策**:
```bash
# 創空檔(走 fallback)
touch deploy/secrets/refresh_token_secret.txt
# 或備內容
openssl rand -hex 32 > deploy/secrets/refresh_token_secret.txt
```

### 5. nestjs healthcheck endpoint 不存在 / 404

**症狀**:`curl /v1/route/getConstantRoutes` 回 404

**對策**:
```bash
# Check globalPrefix 是否設對
docker compose exec nestjs sh -c 'env | grep GLOBAL_PREFIX'
# 若無 GLOBAL_PREFIX env、nestjs 用 default `v1`(per main.ts line 89)
# 若 endpoint path 在 fork upstream 改了、改 healthcheck path 對齊
```

---

## 下一步

W-FA1 完成後 Phase W deploy P7 Track-A 進度推進、可選下一個:
- **W-FA2** `nginx-track-a-transitional-block`(W-FA1 直接後續、為 F10 鋪 nginx routing)
- **W-FA3** `cicd-nestjs-build-job`(image push registry、可推遲到 W-F17/W-F18 一起做)
- **F10** `refresh-token-nestjs-bridge`(application 層、nestjs 接 refreshToken endpoint + sys_tokens schema 對齊)
