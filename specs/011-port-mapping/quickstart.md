# Quickstart: W-F7 port-mapping(dev host port forward)

**Feature**: W-F7 — port-mapping
**Audience**: operator / dev / 整合測試者
**Date**: 2026-05-17

> 本 quickstart 是 W-F7 落地後從 host 機訪問 dev stack 的最短路徑指南。實作階段也以本檔的命令做 acceptance scenario 驗證。

---

## 前提

- Docker Compose v2.x plugin 已裝(`docker compose version` 確認)
- 在 outer repo root(`fork260509-rev1/`)cd 過去
- W-F4 既有 secret 已備:`deploy/secrets/{jwt_secret,database_url,redis_url,postgres_password,redis_password}.txt` 5 個檔填值
- WSL2 環境:Win11 22H2+ 預設 mirrored networking mode(否則見「故障排查」§ NAT mode)
- 11080 / 11081 / 15432 / 16379 4 個 host port 沒被既有服務占用(否則見「故障排查」§ port 衝突)

---

## Dev 啟動(暴露 4 個 host port)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

**預期**:60-75 秒內 6 service(postgres / redis / migration / rust-api / base-web / front-nginx)全 healthy(或 migration `exited (0)`)、`docker compose ps` 確認。

---

## Host 機驗證(WSL 內 shell 或 Win11 Windows host)

```bash
# 1. front-nginx self /health(SPA + /api/ 反向代理對外入口)
curl -fsS http://127.0.0.1:11080/health
# 預期:ok

# 2. rust-api 直連 /health(跳過 nginx debug)
curl -fsS http://127.0.0.1:11081/health
# 預期:HTTP 200

# 3. postgres 直連
pg_isready -h 127.0.0.1 -p 15432
# 預期:127.0.0.1:15432 - accepting connections

# 4. redis 直連
redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping
# 預期:PONG
```

---

## Login e2e 驗證(host 機)

### 方式 A — 直接 curl(走 front-nginx /api/)

```bash
curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login
# 預期:JSON body 含 "token": "<JWT>"
```

### 方式 B — 瀏覽器(WSL 內 / Windows)

```text
URL:        http://127.0.0.1:11080
Username:   Soybean
Password:   123456
```

**預期**:載入 SPA、login 成功進 dashboard、看到 menu。30 秒內完成。

---

## Binding 範圍驗證(loopback only)

```bash
ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
```

**預期**:4 行輸出、每行 `Local Address` 都是 `127.0.0.1:<port>`(非 `0.0.0.0:*` / `*:<port>` / `[::]:<port>`)。

若 LAN 第二台機(host IP = `192.168.x.y`):
```bash
# 從第二台機跑
curl http://192.168.x.y:11080/health --max-time 3
# 預期:timeout / connection refused(不可達、binding 限 loopback 證明)
```

---

## Prod baseline 啟動(無 host port)

```bash
# Step 1:停掉 dev stack(清掉 volume 確保 baseline 乾淨)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans

# Step 2:不帶 dev 檔啟動
docker compose up -d --wait

# Step 3:驗證 host 不可達、stack 內仍 work
ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
# 預期:無輸出

curl -fsS http://127.0.0.1:11080/health --max-time 5
# 預期:Connection refused 或 timeout

docker compose exec front-nginx wget -qO- http://localhost/health
# 預期:ok(stack 內部 routing 仍正常)
```

> ⚠️ **不要** down 時帶 `-v` 如果你需要保留 postgres / redis 資料 — `-v` 會清掉 named volume。實際 dev / prod 切換不必清資料時用 `docker compose down --remove-orphans`(無 `-v`)。

---

## dev → prod 模式切換(保留 volume)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans  # 不帶 -v 保留 volume
docker compose up -d --wait
```

> 2 條命令完成切換、無需手改任何 yaml / env(per SC-006)。

---

## 故障排查

### 1. WSL2 NAT mode — Windows host 訪問 `127.0.0.1` 不通

**症狀**:WSL 內 shell `curl http://127.0.0.1:11080/health` 成功;Windows host(PowerShell / Edge / Chrome)`curl http://127.0.0.1:11080` 連不上。

**對策**:
- 確認 Win11 ≥ 22H2(`winver`)
- 編 `%USERPROFILE%/.wslconfig` 加:
  ```ini
  [wsl2]
  networkingMode=mirrored
  ```
- PowerShell 跑 `wsl --shutdown` 後重起 WSL
- 或:跑 `wsl hostname -I` 拿 WSL2 內 IP(如 `172.20.xx.yy`)、改用該 IP 訪問

### 2. Host port 衝突 — `bind: address already in use`

**症狀**:`docker compose ... up` 啟動失敗、訊息含 `Error response from daemon: Ports are not available: ... bind: address already in use`。

**排查**:
```bash
ss -tlnp 2>/dev/null | grep ':<衝突的 port>'
# 例:ss -tlnp | grep ':11080'
```

**對策**:
- 停用占用者(若為 fork260509 並行 stack:`cd ../fork260509 && docker compose down`)
- 或:本機臨時改 `docker-compose.dev.yml` 對應 entry 的 host port(只改 host 側、container 側不動)— 注意此改動算 dirty、不要 commit;若是長期需求請開新 feature 統一規劃

### 3. `docker compose -f -f config` yaml 解析錯

**症狀**:`yaml: line X: ...` 或 `service "X" refers to undefined ...`。

**對策**:
- 對齊 service name(`front-nginx` / `rust-api` / `postgres` / `redis` 全帶 `-`、無底線)
- 對齊 yaml 縮排(2 空格、非 tab)
- 跑 `yq . docker-compose.dev.yml` 驗 yaml 結構

### 4. 6 service 沒全 healthy

**症狀**:`docker compose up --wait` 60 秒後 exit 非 0、`docker compose ps` 看到某 service `unhealthy`。

**排查**:
```bash
docker compose ps                      # 看哪個 unhealthy
docker compose logs <service> --tail 50
```

**常見原因**:
- W-F4 secret 沒填(`deploy/secrets/*.txt`)— `cat` 看內容是不是空
- rust-api healthcheck `curl http://localhost:11081/health` fail — 看 rust-api logs
- postgres / redis 沒起來(可能 secret password 與 healthcheck 期望不一致)

### 5. host curl 通了但 SPA login 失敗

**症狀**:`curl http://127.0.0.1:11080/health` 成功、瀏覽器 SPA 載入正常、但 login 卡住或 401。

**排查**:
```bash
# 直接 curl /api/auth/login(C-V3)
curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login
# 看 HTTP status + body
```

**常見原因**:
- migration 沒跑完(`docker compose ps migration` 看 exit code、應為 0)
- DB 沒 seed 預設帳號(per CLAUDE.md §5.1、migration 應自動 seed)
- Casbin policy 沒載入(`docker compose logs rust-api | grep -i casbin`)

---

## 回滾

W-F7 純配置變動、不動 volume / image / service。回滾路徑:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
git revert <W-F7-merge-sha>     # 或 git reset --hard <W-F5-merge-sha> 若是 local
# 退回 W-F5 狀態,docker-compose.dev.yml 刪除、CLAUDE.md / INTEGRATION-CHECKLIST.md 回 W-F5 文字
```

回滾後等同 W-F5 baseline、所有 W-F1~W-F5 acceptance 仍然滿足。

---

## 下一步

W-F7 完成後 Phase W deploy P2 進度 2/4,剩:
- **W-F6** `tls-cert-management` — prod TLS + cert acme + 主 compose 加對外 11080 / 11443(prod 對外解鎖,per OOS-011)
- **W-F11** `rust-horizontal-scaling` — 純監控 + 多 instance,可平行

兩者皆 P2、依 DESIGN-W §11.2 任一可平行 spec-kit。
