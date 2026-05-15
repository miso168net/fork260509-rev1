# Quickstart: W-F5 — front-nginx acceptance

**Phase 1 output** — 13 個 acceptance scenario(對應 spec.md Dimension A-E、FR-001 ~ FR-018)reproducer + 8 SC 對照 + troubleshooting + 單段 commit workflow。

對齊 W-F3 / W-F4 quickstart 風格(scenario header + 命令 + 預期)。

---

## 前置條件

- W-F1 ~ W-F4 已落地 + merged(`rev1-admin-root` 含完整 5 service stack + secrets 機制)
- W-F4 image local:`rust-api:rev1-admin-rust-api` + `base-web:rev1-admin-base-web`
- `nginx:1.27-alpine` image local cached(W-F2 build 已 pull)
- outer branch:`010-front-nginx`
- compose v2+(W-F4 R-007 sticky)
- `deploy/secrets/*.txt` 填值(per W-F4 quickstart;dev 模式即可)

---

## Dimension A — `deploy/front-nginx/` 配置結構(scenario 1-3)

### Scenario 1:目錄結構齊備

```bash
ls deploy/front-nginx/
```
**預期**:`README.md` + `conf.d/`

```bash
ls deploy/front-nginx/conf.d/
```
**預期**:`default.conf`

### Scenario 2:upstream 2 個

```bash
grep "^upstream " deploy/front-nginx/conf.d/default.conf
```
**預期**:命中 2 行 — `upstream base_web {` + `upstream rust_api {`

### Scenario 3:location 3 個 + 優先序

```bash
grep -E "location (= /|/api/|/)" deploy/front-nginx/conf.d/default.conf
```
**預期**:命中至少 3 行 — `location = /health {`、`location /api/ {`、`location / {`

---

## Dimension B — `docker-compose.yml` front-nginx 配置(scenario 4-7)

### Scenario 4:service 渲染

```bash
docker compose config | awk '/front-nginx:/,/^  [a-z]/' | head -30
```
**預期**:命中 service block 含 `image: nginx:1.27-alpine`、`depends_on`(base-web + rust-api)、`networks: - internal`、`healthcheck`

### Scenario 5:volume mount

```bash
docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep -A 3 "volumes:"
```
**預期**:命中 `./deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro`

### Scenario 6:無 host port(per W-F7 邊界)

```bash
docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep ports
```
**預期**:**0 命中**(W-F5 嚴守不開 host port)

### Scenario 7:healthcheck 配置

```bash
docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep -A 5 "healthcheck:"
```
**預期**:含 `curl -f http://localhost/health` 樣式

---

## Dimension C — stack 啟動 + service healthy(scenario 8-10)

### Scenario 8:6 service 全 healthy

```bash
# 假設 deploy/secrets/*.txt 已填(W-F4 dev 流程)
docker compose down -v
docker compose up -d
sleep 60
docker compose ps
```
**預期**:5 long-running service 全 healthy(base-web + postgres + redis + rust-api + **front-nginx**)+ migration exited 0

### Scenario 9:nginx config syntax

```bash
docker compose exec front-nginx nginx -t
```
**預期**:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Scenario 10:logs 無 error

```bash
docker compose logs front-nginx --tail 20
```
**預期**:含 nginx start log;**無** `[error]` / `[crit]` / panic 訊息

---

## Dimension D — routing 行為(scenario 11-16)

### Scenario 11:SPA root `/`

```bash
docker compose exec rust-api curl -fsS http://front-nginx/ | head -5
```
**預期**:返 HTML 含 `<html` + `<title>`(SPA index.html)、200 OK

### Scenario 12:API proxy `/api/auth/login`

```bash
docker compose exec rust-api curl -fsS -w "\nHTTP: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://front-nginx/api/auth/login
```
**預期**:HTTP 200 + body 含 token(rust-api login handler 透過 nginx 切前綴後處理)

### Scenario 13:`/api/nonexistent` 透傳 404

```bash
docker compose exec rust-api curl -s -o /dev/null -w "%{http_code}\n" http://front-nginx/api/nonexistent
```
**預期**:`404`(rust-api 404、nginx 不攔)

### Scenario 14:SPA fallback

```bash
docker compose exec rust-api curl -fsS http://front-nginx/some-spa-route | head -5
```
**預期**:返 HTML 含 `<html` + `<title>`(base-web 內部 nginx try_files SPA fallback、返 index.html)

### Scenario 15:front-nginx self `/health`(per clarify Q1 Option A)

```bash
docker compose exec rust-api curl -fsS http://front-nginx/health
```
**預期**:`ok`(front-nginx self 返、**不**轉發給 rust-api)

### Scenario 16:Header forwarding(X-Forwarded-For)

```bash
# 跑 scenario 12 login → 看 rust-api logs 內 client_ip 為真實 IP(非 front-nginx)
docker compose logs rust-api --tail 50 | grep -E "client_ip|X-Forwarded-For|login"
```
**預期**:rust-api log 收到的 client_ip 為 docker network 內 client IP(scenario 12 由 rust-api 自身發、所以 IP 為 rust-api 自身的 docker network IP — **重點**:不是 front-nginx 的 IP)

---

## Dimension E — W-F4 regression + 整體相容(scenario 17-18)

### Scenario 17:W-F4 secrets 不破

```bash
# W-F4 scenario 13:env 不洩明文
docker compose exec rust-api env | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)"
```
**預期**:只命中 `*_FILE` 變量、無明文 secret

```bash
# W-F4 scenario 15:/health 通
docker compose exec rust-api curl -fsS http://localhost:11081/health
```
**預期**:`ok`(rust-api 自身 `/health`、與 front-nginx self /health 解耦)

### Scenario 18:W-F3 regression

```bash
# DNS
docker compose exec rust-api getent hosts front-nginx
docker compose exec front-nginx getent hosts rust-api
docker compose exec front-nginx getent hosts base-web

# Volume 持久
docker compose down
docker compose up -d
sleep 30
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "SELECT count(*) FROM sys_user;"
```
**預期**:DNS 全解析、count > 0(volume 持久化、migration seed 留存)

---

## SC 對照(spec.md Success Criteria 8 條)

| SC | Verify via |
|---|---|
| SC-001(60-90s 6 service healthy)| Scenario 8 |
| SC-002(front-nginx overhead ≤ 5sec)| Scenario 8(W-F4 baseline 71s,W-F5 後對比)|
| SC-003(`/` + `/api/auth/login` 兩種 routing 通)| Scenario 11 + 12 |
| SC-004(rust audit log `client_ip` 為真實值)| Scenario 16 |
| SC-005(W-F4 acceptance 不破)| Scenario 17 |
| SC-006(13 acceptance task 全 pass)| 本 quickstart 全跑 |
| SC-007(`nginx -t` 通過)| Scenario 9 |
| SC-008(P2 第一個 feature 達成、解鎖)| INTEGRATION-CHECKLIST update + W-F6 spec 引用無 blocker(後續驗) |

---

## Troubleshooting

### 問題 1:front-nginx unhealthy / Restarting
- **可能原因**:nginx config syntax error;或 backend(base-web / rust-api)未 healthy 時 front-nginx 啟動(depends_on `service_healthy` 失效)
- **解**:`docker compose exec front-nginx nginx -t` 看 syntax;`docker compose logs front-nginx` 看 error;`docker compose ps` 確認 backend service health

### 問題 2:`/api/auth/login` 404
- **可能原因**:nginx config `proxy_pass http://rust_api;` 漏 trailing `/`(切前綴失敗 → rust-api 收到 `/api/auth/login` → 404)
- **解**:`grep "proxy_pass http://rust_api" deploy/front-nginx/conf.d/default.conf` → 確認尾 `/`;`docker compose restart front-nginx`

### 問題 3:`/` 返 nginx default page(`Welcome to nginx!`)
- **可能原因**:`/etc/nginx/conf.d/default.conf` 沒 mount 進去(volume mount 路徑錯)、nginx 用預設 server block
- **解**:`docker compose exec front-nginx ls /etc/nginx/conf.d/`;`docker compose exec front-nginx cat /etc/nginx/conf.d/default.conf` 確認 W-F5 config 已在

### 問題 4:rust audit log client_ip 為 front-nginx IP(非真實 client)
- **可能原因**:`/api/` location 漏 `proxy_set_header X-Forwarded-For` 或 `X-Real-IP`、或 rust-api 端沒讀此 header
- **解**:`grep "X-Forwarded-For\|X-Real-IP" deploy/front-nginx/conf.d/default.conf`;若 nginx 端 OK 則 rust-api 端 client_ip extraction logic 看(留 rust-api source 改、不在 W-F5 範圍)

### 問題 5:`/api/` 經 nginx 後 root path(`rust_api/`)→ 命中 rust-api `/health`
- **可能原因**:edge case — `curl http://front-nginx/api/` 只 prefix 無 path、nginx 切前綴後 rust-api 收到 `/`、命中 W-F1 `/health` 路由、返 `ok`(非預期 404)
- **影響**:低 — SPA 不會發 `/api/` 純前綴 request、operator 也不該;若 acceptance 偶遇可接受
- **解**:暫不解(W-F5 範疇外、留 follow-up if proven issue)

### 問題 6:nginx config 改後 stack 不 reload
- **可能原因**:nginx 在 container 起後不會自動 reload config;volume mount 是 read-only 但 nginx process 已啟、需 reload signal
- **解**:`docker compose restart front-nginx`(觸發 nginx 重 load config);或 `docker compose exec front-nginx nginx -s reload`(graceful reload、不停 service)

---

## 單段 commit workflow(per CLAUDE.md §6.2)

W-F5 **只動 outer**(不動 rust-api / base-web worktree)、走單段 commit:

```bash
cd /home/anew/x_Project/fork260509-rev1
git status
git add docker-compose.yml deploy/front-nginx/ specs/010-front-nginx/ CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(deploy): W-F5 front-nginx 反向代理落地(Phase W deploy P2 第一個 feature)

- 新建 deploy/front-nginx/conf.d/default.conf:
  - 2 upstream(base_web → base-web:8080 / rust_api → rust-api:11081 + keepalive 32)
  - 3 location(= /health front-nginx self / /api/ → rust_api/ 切前綴 / / → base_web)
  - 5 header forwarding(Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto / X-Request-ID)
- 新建 deploy/front-nginx/README.md(operator 操作說明 + 範疇邊界)
- docker-compose.yml 加第 6 個 service `front-nginx`:
  image nginx:1.27-alpine、depends_on base-web+rust-api service_healthy、
  networks internal、healthcheck curl /health、無 ports(留 W-F7)、無 secrets(不需)
- specs/010-front-nginx/ 全套 spec docs
- CLAUDE.md SPECKIT marker 更新

W-F5 acceptance 全 PASS(13 task / 18 scenario):
- 6 service healthy(W-F4 5 個 + W-F5 加 front-nginx)
- nginx -t syntax OK
- 5 種 routing path 全通(/  / /api/auth/login / /api/nonexistent 透傳 / SPA fallback / /health self)
- W-F4 secrets + W-F3 DNS/volume 不破

Phase W deploy P2 第一個 feature 達成,解鎖 W-F6(TLS)+ W-F7(對外 port)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin 010-front-nginx                # user 同意後
git switch rev1-admin-root
git merge --no-ff 010-front-nginx
git push origin rev1-admin-root                # user 同意後
```

INTEGRATION-CHECKLIST update + CLAUDE.md SPECKIT marker reset 在 merge 後 commit。
