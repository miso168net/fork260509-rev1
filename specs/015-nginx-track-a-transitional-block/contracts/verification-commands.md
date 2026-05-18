# Contract: W-FA2 host 驗證命令

**Feature**: W-FA2 — nginx-track-a-transitional-block
**Contract type**: verification command interface
**Date**: 2026-05-18

> 本契約定義 W-FA2 implement / acceptance / debug 階段的驗證命令、預期輸出、失敗判讀。implement 階段 task + acceptance scenario(US1+US2+US3+US4)以此為基準。

---

## C-V1:nginx config syntax check(US1 + US2 + US3 acceptance 共用)

```bash
docker compose exec -T front-nginx nginx -t
echo "exit: $?"
```

**Expected**:
- exit 0
- stdout / stderr 含 `nginx: configuration file /etc/nginx/nginx.conf test is successful`

**Failure**:報 directive syntax error(如 `unknown directive`)→ 檢 W-FA2 inline block 是否漏 directive、`include snippets/proxy_headers.inc` 路徑正確、`ipv6=off` directive 在 nginx 1.27 確認支援(per R-3)

---

## C-V2:dev stack `--profile track-a` startup verify(US1 prerequisite)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

**Expected**:7 service 全 `(healthy)`(含 W-FA1 加的 nestjs);front-nginx 重新 reload W-FA2 nginx config 後仍 healthy

---

## C-V3:refreshToken happy path(US1 acceptance、AC US1.2)

```bash
curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid-test-token"}' \
  http://127.0.0.1:11080/api/auth/refreshToken | head -c 500
```

**Expected**:
- response 不是 HTTP 404(若 W-FA2 wire-up 失敗、會 fall through 到 `/api/` prefix → rust-api → 404)
- response body 是 nestjs `ApiRes` envelope shape(具 `code` / `msg` / `data` field)
- 具體 code 可能是 4xx(invalid token)、但 envelope shape 對齊 nestjs(non-nestjs response 不會有此 shape)

**Failure**:回 404 → W-FA2 location 沒被識別(檢 nginx -t / 重 reload);回 502/504 → nestjs 不可達(檢 W-FA1 nestjs container 是否 healthy)

---

## C-V4:nestjs log 看到 refreshToken request(US1 acceptance、AC US1.3)

```bash
docker compose logs nestjs --since 2m 2>&1 | grep -E "POST /v1/auth/refreshToken"
```

**Expected**:至少 1 個 hit(證明 nginx 確實 forward request 到 nestjs、不是被自己回 502)

---

## C-V5:default profile graceful degradation(US2 acceptance、AC US2.1/US2.2/US2.3)

```bash
# Step 1:Down stack with track-a profile(清掉 nestjs)+ up without profile
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# Step 2:驗 6 service healthy(無 nestjs)
docker compose ps --format "{{.Service}}\t{{.State}}"

# Step 3:驗 nginx -t(per C-V1)
docker compose exec -T front-nginx nginx -t

# Step 4:驗 refreshToken endpoint 回 502/504(non-crash)
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"x"}' \
  http://127.0.0.1:11080/api/auth/refreshToken

# Step 5:驗 front-nginx 自己 healthy(對齊 SC-003)
docker inspect rev1-admin-front-nginx-1 --format='{{.State.Health.Status}}'
```

**Expected**:
- Step 2:5 service running(無 nestjs;migration exited)
- Step 3:nginx -t exit 0
- Step 4:HTTP 502 或 504(nginx 無法 reach nestjs upstream、非 crash 非 404)
- Step 5:`healthy`(front-nginx 自己仍 healthy、不被 refreshToken 502 影響)

---

## C-V6:F6 login regression(US2.3 + US4.2 acceptance)

```bash
# F6 login + isRouteExist 驗
TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login | grep -oP '"token":"\K[^"]+')
echo "Token len: ${#TOKEN}"

curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -c 150
```

**Expected**:
- Token len > 100(對齊 F5.1 + F6 既有 baseline)
- F6 endpoint 回 `{"code":0,"data":true,"msg":"success","success":true}`

**Note**:此驗在兩個 profile 下都跑 — track-a profile(US4.2)+ default profile(US2.3)— 都應 PASS、證 W-FA2 inline block 不影響既有 `/api/` prefix routing。

---

## C-V7:prod config syntax sanity(US3 acceptance、AC US3.1)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a config --quiet 2>&1
echo "exit: $?"
```

**Expected**:exit 0(yaml + nginx config 結構 valid;不實際啟動)

---

## C-V8:prod baseline + track-a 啟動(US3 acceptance、AC US3.2)

```bash
# Prereq:dev cert 已 seed 進 named volume(per W-F6 quickstart)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"

# Up prod + track-a
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a up -d --wait
docker compose ps
docker compose exec -T front-nginx nginx -t
```

**Expected**:7 service healthy(含 nestjs)、nginx -t OK

**Note**:若無 prod cert seed 環境、降為 C-V7 syntax-only(US3 acceptance 允許降級、per W-F6 既有 C-V11 慣例)。

---

## C-V9:prod refreshToken HTTPS verify(US3 acceptance、AC US3.3)

```bash
curl -k -fsS -X POST -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid-test-token"}' \
  https://127.0.0.1:11443/api/auth/refreshToken | head -c 500
```

**Expected**:同 C-V3(nestjs envelope、非 404、非 502 — 因 nestjs 在 track-a 啟用)

**Note**:`-k` 是因 dev cert 自簽、prod 真實 cert acquisition 留 W-F6b。

---

## C-V10:zero-diff three sides(US4 acceptance、AC US4.1)

```bash
git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
```

**Expected**:無輸出(空 diff)

---

## C-V11:cutover dry-run via sed + docker cp(US4 acceptance、AC US4.3 + SC-005)

```bash
# Step 1:sed 刪除 marker block 產出 cutover-version config
sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' \
  deploy/front-nginx/conf.d/default.conf > /tmp/default.conf.cutover
sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' \
  deploy/front-nginx/conf.d/default.conf.prod > /tmp/default.conf.prod.cutover

# Step 2:diff 看刪除範圍(可選驗 sed 對齊)
diff deploy/front-nginx/conf.d/default.conf /tmp/default.conf.cutover | head -30

# Step 3:把 cutover-version 拷進 running front-nginx container 取代 default.conf
docker cp /tmp/default.conf.cutover rev1-admin-front-nginx-1:/etc/nginx/conf.d/default.conf

# Step 4:跑 nginx -t 驗 cutover 後 config 仍 valid
docker compose exec -T front-nginx nginx -t

# Step 5:還原(避免影響 running stack)
docker cp deploy/front-nginx/conf.d/default.conf rev1-admin-front-nginx-1:/etc/nginx/conf.d/default.conf
docker compose exec -T front-nginx nginx -t  # 還原後再驗一次
```

**Expected**:
- Step 2 diff 看到 `<` 比 `>` 多 ~9-18 行(刪了 1-2 個 TRANSITIONAL block)
- Step 4 nginx -t exit 0(cutover 後 config 仍 valid、證 F14 cutover 路徑乾淨)
- Step 5 還原後 nginx -t exit 0(W-FA2 原 config 仍 valid)

**Failure**:Step 4 nginx -t 報錯 → sed 刪過頭(可能誤刪 server block 結束 `}`)→ 重檢 marker comment 是否獨佔單行、不混在其他 directive 行

---

## C-V12:front-nginx self health(W-F5 既有 endpoint 不破)

```bash
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:11080/health
```

**Expected**:HTTP 200(W-F5 既有 health endpoint、W-FA2 不影響)

---

## Contracts 數量

| Contract | 場景 |
|---|---|
| C-V1 | nginx -t syntax check(全 US 共用) |
| C-V2 | dev stack track-a startup(US1 prereq) |
| C-V3 | refreshToken happy path(US1.2) |
| C-V4 | nestjs log 確認(US1.3) |
| C-V5 | default profile graceful degradation(US2.1~2.3) |
| C-V6 | F6 login regression(US2.3 + US4.2) |
| C-V7 | prod config syntax(US3.1) |
| C-V8 | prod baseline startup(US3.2) |
| C-V9 | prod refreshToken HTTPS(US3.3) |
| C-V10 | zero-diff three sides(US4.1) |
| C-V11 | cutover dry-run sed + nginx -t(US4.3 + SC-005) |
| C-V12 | front-nginx self health regression |

**12 個 verification contract、涵蓋 W-FA2 全部 US1~US4 + 補強驗 + sanity check + regression**。
