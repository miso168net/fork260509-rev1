# Contract: host 驗證命令契約

**Feature**: W-F7 port-mapping
**Contract type**: verification command interface
**Date**: 2026-05-17

> 本契約定義 W-F7 acceptance 階段 host 機驗證命令的**標準形式**、**預期輸出**、**失敗判讀**。implement 階段 task 與 acceptance scenario(US1 / US2 / US3)以這些契約為基準。

---

## C-V1:front-nginx /health 對外可達(US1.2)

**Command**:
```bash
curl -fsS http://127.0.0.1:11080/health
```

**Expected**:
- Exit code: 0
- stdout: `ok`(W-F5 既有 self /health route 返 `200 + body "ok"`)
- HTTP status:200(因 `-f` flag、4xx/5xx 會讓 curl 退非 0)

**Failure 判讀**:
- `Connection refused`:host port 沒 listen → 檢 `docker compose ps`、`ss -tlnp | grep 11080`
- `404`(若 `-f` 沒帶):W-F5 self /health route 不在 → 檢 `deploy/front-nginx/conf.d/default.conf`
- timeout:WSL2 networking mode 非 mirrored → 檢 `.wslconfig`

---

## C-V2:rust-api /health 直連可達(US1.4)

**Command**:
```bash
curl -fsS http://127.0.0.1:11081/health
```

**Expected**:
- Exit code: 0
- HTTP status:200
- stdout: W-F1 既有 /health endpoint 返回內容(預期 `ok` 或 JSON 健康狀態)

**Failure 判讀**:
- `Connection refused` on 11081:host port 沒 listen → 檢 dev.yml rust-api ports entry
- `502 / 503`:rust-api container 沒 listen 11081 → 檢 rust-api container env `APP_SERVER_PORT=11081`(W-F1 既有)

---

## C-V3:Login e2e via front-nginx /api/(US1.3)

**Command**:
```bash
curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login
```

**Expected**:
- Exit code: 0
- HTTP status:200
- stdout: JSON body 含 `token` 欄位(per W-F5 已驗 routing + W-F1 既有 login handler)

**Failure 判讀**:
- `404 /api/auth/login`:front-nginx config 沒 mount 或 /api/ prefix routing 壞 → 檢 W-F5 `deploy/front-nginx/conf.d/default.conf`
- `401`:密碼錯 / DB migration 沒跑 → 檢 migration container exit code
- `500`:rust-api 內部錯 → `docker compose logs rust-api`

**Side-effect 驗證**(可選、實作階段確認):rust-api `sys_login_log` 表應收到 client IP `127.0.0.1`(或 docker network IP per X-Forwarded-For),非 front-nginx 自身 IP。

---

## C-V4:postgres pg_isready(US1.5)

**Command**:
```bash
pg_isready -h 127.0.0.1 -p 15432
```

**Expected**:
- Exit code: 0
- stdout: `127.0.0.1:15432 - accepting connections`

**Failure 判讀**:
- exit code 1 + `no response`:postgres 沒起 → `docker compose ps postgres`
- exit code 2 + `rejecting connections`:postgres 起著但拒連 → 檢 `docker compose logs postgres`(可能 W-F4 secret 沒填或 PG_HBA 限制)

**進階驗(可選)**:
```bash
PGPASSWORD="$(cat deploy/secrets/postgres_password.txt)" \
  psql -h 127.0.0.1 -p 15432 -U postgres -c "SELECT 1"
# 預期: ?column? \n --- \n 1 \n (1 row)
```

---

## C-V5:redis ping(US1.6)

**Command**:
```bash
redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping
```

**Expected**:
- Exit code: 0
- stdout: `PONG`

**Failure 判讀**:
- `(error) NOAUTH Authentication required`:密碼讀錯或 redis 沒套用 W-F4 password secret → 檢 `deploy/secrets/redis_password.txt` 內容、`docker compose logs redis`
- `Could not connect to Redis at 127.0.0.1:16379`:host port 沒 listen → 檢 `ss -tlnp | grep 16379`

> `--no-auth-warning` 抑制 `Warning: Using a password with '-a' option on the command line interface may not be safe.` — dev 場景容忍。

---

## C-V6:Binding 限 loopback(US3.1)

**Command**:
```bash
ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
```

**Expected**(dev mode、stack up):
- 4 行輸出
- 每行 Local Address 欄位 = `127.0.0.1:<port>`
- **不可**出現 `0.0.0.0:<port>` / `*:<port>` / `[::]:<port>`

**範例**:
```
LISTEN  0   128  127.0.0.1:11080  0.0.0.0:*  users:(("docker-proxy",pid=...))
LISTEN  0   128  127.0.0.1:11081  0.0.0.0:*  users:(("docker-proxy",pid=...))
LISTEN  0   128  127.0.0.1:15432  0.0.0.0:*  users:(("docker-proxy",pid=...))
LISTEN  0   128  127.0.0.1:16379  0.0.0.0:*  users:(("docker-proxy",pid=...))
```

> `0.0.0.0:*` 在右欄是 `Peer Address`(對端任意)、不是 binding;左欄 `Local Address` 才是 binding 來源、必 `127.0.0.1`。

**Failure 判讀**:任何一行 Local Address 開頭非 `127.0.0.1:` → 違反 FR-004,需修 `docker-compose.dev.yml` 的 ports entry IP 前綴。

---

## C-V7:Prod baseline 不暴露(US2.2 + US2.3)

**Command 1**(無 listener):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose up -d --wait
ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
```

**Expected**:**無輸出**(0 listener)

**Command 2**(無對外可達):
```bash
curl -fsS http://127.0.0.1:11080/health --max-time 5
```

**Expected**:
- Exit code: 非 0
- stderr: `Connection refused` 或 `Operation timed out`

**Command 3**(stack 內仍 work):
```bash
# Alpine busybox `wget` 解析 `localhost` 可能走 IPv6 `::1` 而 nginx 只 listen IPv4 → 用 `127.0.0.1` 強制 IPv4、對齊 workspace memory `feedback_no_localhost`。
docker compose exec front-nginx wget -qO- http://127.0.0.1/health
```

**Expected**:
- Exit code: 0
- stdout: `ok`

---

## C-V8:`docker compose config` yaml 驗證(FR-010)

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config
```

**Expected**:
- Exit code: 0
- stdout: 完整 merged yaml(含主 compose 6 service + dev.yml override 後的 4 個 service 各有 ports)
- 無 `WARNING` / `ERROR` 訊息

**Failure 判讀**:
- `yaml: line X: ...`:yaml 語法錯 → 修 dev.yml
- `service "X" refers to undefined ...`:service name 拼錯 → 對齊主 compose service name(`front-nginx` / `rust-api` / `postgres` / `redis`)

---

## C-V9:SPA login e2e(US1.7、人工驗)

**Procedure**:
1. host 機(WSL 內 Linux 或 Win11 Windows host)瀏覽器訪問 `http://127.0.0.1:11080`
2. 預期載入 base-web SPA、看到 login 頁
3. 輸入 `Soybean` / `123456` 點登入
4. 預期跳轉到 dashboard、看到 menu(Casbin policy 允許範圍 + admin role)

**Expected**:30 秒內完成 e2e(per SC-005)。

**Failure 判讀**:
- 瀏覽器空白頁 / `ERR_CONNECTION_REFUSED`:host port 不通 → 跑 C-V1 + C-V6
- SPA loaded 但 login 不 work:走 C-V3 直接 curl /api/auth/login 排查 backend 問題
- WSL2 NAT mode 從 Windows host 不通:設 mirrored mode(per Edge Case E-1)

---

## Contracts 數量

| Contract | 對應 US scenario | 場景 |
|---|---|---|
| C-V1 | US1.2 | front-nginx /health host 可達 |
| C-V2 | US1.4 | rust-api /health host 可達 |
| C-V3 | US1.3 | front-nginx /api/ login e2e |
| C-V4 | US1.5 | postgres 直連 |
| C-V5 | US1.6 | redis 直連 |
| C-V6 | US3.1 | binding 限 loopback |
| C-V7 | US2.2 + US2.3 | prod baseline 不暴露(3 個子命令) |
| C-V8 | FR-010 | yaml config 驗 |
| C-V9 | US1.7 | SPA login e2e(人工) |

**9 個 contract 覆蓋 US1 7 scenarios + US2 3 scenarios + US3 1 scenario(US2.1 + US2.4 + US3.2 由其他 contract 涵蓋或為可選)**。

---

## 環境前提(所有 C-V 共用)

- Docker compose v2.x plugin 已裝(per R-4)
- `deploy/secrets/*.txt` 5 個檔已填值(W-F4 既有要求)
- host 機 11080 / 11081 / 15432 / 16379 無既有服務占用
- WSL2 mirrored networking(Win11 22H2+ 預設)或從 WSL 內 shell 跑

**契約所有命令在 implement 階段 T2-T5 task + acceptance 階段 13 scenario 各被 exercised 至少 1 次**。
