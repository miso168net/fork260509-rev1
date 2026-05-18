# Contract: W-FA1 host 驗證命令

**Feature**: W-FA1 — compose-nestjs-service
**Contract type**: verification command interface
**Date**: 2026-05-18

> 本契約定義 W-FA1 implement / acceptance / debug 階段的驗證命令、預期輸出、失敗判讀。implement 階段 task + acceptance scenario(US1+US2+US3+US4+US5+US6)以此為基準。

---

## C-V1:nestjs image build(implement 階段必跑)

```bash
DOCKER_BUILDKIT=1 docker build \
  -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
  -t nestjs:rev1-admin-nestjs \
  fork260509-soybean-admin-nestjs/backend/ 2>&1 | tail -30
```

**Expected**:exit 0、`naming to docker.io/library/nestjs:rev1-admin-nestjs done`
**Build 預期時間**:cold ≤ 5 min(per NFR-001 derived)、warm BuildKit cache mount hit ≤ 30s
**Verify image size**:
```bash
docker images nestjs:rev1-admin-nestjs --format "{{.Repository}}:{{.Tag}} {{.Size}}"
```
**Expected**:Size ≤ 500MB(per NFR-001)

---

## C-V2:Dev stack startup `--profile track-a`(US1 acceptance)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

**Expected**:7 service 全 `(healthy)`(含 nestjs)、`docker compose ps` 顯示:
```
SERVICE       STATUS
base-web      Up X seconds (healthy)
front-nginx   Up X seconds (healthy)
nestjs        Up X seconds (healthy)
postgres      Up X seconds (healthy)
redis         Up X seconds (healthy)
rust-api      Up X seconds (healthy)
```
**Failure**:若 nestjs unhealthy 或啟動 fail、check `docker compose logs nestjs --tail 50`

---

## C-V3:DESIGN-B 形態 啟動(US5 acceptance、不帶 profile)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

**Expected**:6 service(無 nestjs)、`docker compose ps --services | grep nestjs` exit 1

---

## C-V4:Secret bridge verify(US2 acceptance)

```bash
docker compose exec -T nestjs sh -c 'env | grep -cE "^(JWT_SECRET|REFRESH_TOKEN_SECRET|DATABASE_URL|REDIS_PASSWORD)="'
```
**Expected**:`4`(4 個 secret 都成功 bridge 進 env)

```bash
docker compose exec -T nestjs sh -c 'echo -n $JWT_SECRET | wc -c'
```
**Expected**:`64`(對齊 deploy/secrets/jwt_secret.txt 64 hex chars)

```bash
docker compose config 2>&1 | grep -iE "<actual_first_8_chars_of_jwt_secret>"
```
**Expected**:無 hit(plaintext 不洩)

```bash
docker inspect rev1-admin-nestjs-1 | grep -iE "jwt_secret|password|database_url" | head -10
```
**Expected**:只顯示 `_FILE` path、不顯示 plaintext value

---

## C-V5:DB connectivity + sys_tokens schema verify(US3 acceptance)

```bash
docker compose exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens" 2>&1 | head -10
```

**Expected**:
- 若 sys_tokens 表存在:顯示 schema(columns + types)
- 若不存在:`Did not find any relation named "sys_tokens"` — **W-FA1 acceptance 階段降級**:US3 PASS by「驗 nestjs connect DB 成功 + 留 F10 follow-up」

```bash
docker compose logs nestjs --tail 50 2>&1 | grep -iE "connection|prisma|database|error|warn"
```
**Expected**:無 `connection refused` / `ENOTFOUND postgres` / `auth failed for user soybean`;允許正常 prisma query log

---

## C-V6:nestjs healthcheck endpoint(US4 acceptance)

```bash
docker compose exec -T nestjs sh -c 'curl -fsS http://localhost:9528/v1/route/getConstantRoutes' 2>&1 | head -c 200
```
**Expected**:HTTP 200 + nestjs 既有 endpoint response shape(JSON envelope、具體 shape per nestjs fork 實作、不在 W-FA1 範疇驗 shape 對齊)

```bash
docker inspect rev1-admin-nestjs-1 --format='{{json .State.Health}}' | jq
```
**Expected**:
```json
{
  "Status": "healthy",
  "FailingStreak": 0,
  "Log": [...]
}
```

---

## C-V7:Host port 11082 直連 verify(US1 acceptance 補強)

```bash
curl -fsS -o /dev/null -w "HTTP %{http_code} time_total=%{time_total}s\n" \
  http://127.0.0.1:11082/v1/route/getConstantRoutes
```
**Expected**:HTTP 200、time_total ≤ 1s(loopback dev、無 latency 開銷)

---

## C-V8:F6 browser login regression(US6 acceptance)

```bash
# 取 token(經 W-F5 nginx 反代到 rust-api)
TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login | grep -oP '"token":"\K[^"]+')
echo "Token len: ${#TOKEN}"

# F6 endpoint 驗
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -c 100
```
**Expected**:Token 取到(len > 100)、F6 endpoint 回 `{"code":0,"data":true,"msg":"success","success":true}`

**Optional**(if CDP available):跑 CDP Edge browser flow 驗 /home + menuCount=43

---

## C-V9:Zero-diff verify(US6 acceptance)

```bash
git diff HEAD -- base-web/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
```
**Expected**:無輸出(空 diff)

```bash
git diff --name-only HEAD
```
**Expected**:只列 outer file:
```
docker-compose.yml
docker-compose.dev.yml
docker-compose.prod.yml
deploy/secrets/refresh_token_secret.txt.example
CLAUDE.md
docs/INTEGRATION-CHECKLIST.md
```

---

## C-V10:nestjs container 內 env + nestjs version sanity

```bash
docker compose exec -T nestjs sh -c 'echo "NODE_ENV=$NODE_ENV"; node --version; pnpm --version 2>/dev/null || echo "pnpm not in runtime image"'
```
**Expected**:`NODE_ENV=production` + `v20.x.x`(per Dockerfile NODE_VERSION=20.11.1)+ pnpm 視 fork final stage 是否含 pnpm(只 deps + build stages 用 pnpm、final 不必有)

---

## C-V11:Prod baseline syntax sanity

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a config --quiet 2>&1
```
**Expected**:exit 0(yaml 結構 valid、不實際啟動)

```bash
# 啟 prod baseline(若 dev cert / acme cert 已備):
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a up -d --wait
docker compose ps
```
**Expected**:7 service 全 healthy(若 acme 不啟、改 `--profile track-a` 不帶 `--profile prod`)

---

## C-V12:nestjs Casbin model.conf 路徑 sanity(per R-3)

```bash
docker compose exec -T nestjs sh -c 'find / -name "model.conf" 2>/dev/null | head -3'
```
**Expected**:至少 1 個 hit(可能 `dist/apps/base-system/src/resources/model.conf` 或類似 path);若 0 hit、屬 R-3 alternatives「acceptance 階段加 bind mount」分支(W-FA1 範疇內處理)

---

## C-V13:nestjs sys_endpoint 自動 sync 確認(預埋驗、optional)

W-FA1 不涉 sys_endpoint sync(那是 rust-api ROUTE_COLLECTOR 機制、nestjs 不自動寫 sys_endpoint),此 verification 為負面驗 — 確認 nestjs 不污染 sys_endpoint 表:

```bash
docker compose exec -T postgres psql -U soybean -d soybean_admin_rust \
  -c "SELECT count(*) FROM sys_endpoint WHERE controller LIKE '%Nestjs%' OR controller LIKE '%nestjs%';"
```
**Expected**:`0`(nestjs 不寫 sys_endpoint、由 W-FA2 / F10 階段決定是否需要)

---

## Contracts 數量

| Contract | 場景 |
|---|---|
| C-V1 | nestjs image build |
| C-V2 | dev stack `--profile track-a` startup |
| C-V3 | DESIGN-B 形態 startup(無 nestjs) |
| C-V4 | Secret bridge 驗 |
| C-V5 | DB connectivity + sys_tokens schema 驗 |
| C-V6 | nestjs healthcheck |
| C-V7 | Host port 11082 直連 |
| C-V8 | F6 browser login regression |
| C-V9 | Zero-diff verify |
| C-V10 | nestjs container env / version |
| C-V11 | Prod baseline syntax sanity |
| C-V12 | Casbin model.conf 路徑 sanity |
| C-V13 | sys_endpoint negative verify |

**13 個 verification contract、涵蓋 W-FA1 全部 US1~US6 + 補強驗 + sanity check + regression**。
