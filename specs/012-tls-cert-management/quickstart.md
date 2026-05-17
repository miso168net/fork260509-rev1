# Quickstart: W-F6 tls-cert-management(TLS + 對外 port + cert skeleton)

**Feature**: W-F6 — tls-cert-management
**Audience**: operator / dev / 整合測試者 / prod 部署 dry-run 驗證者
**Date**: 2026-05-18

> 本 quickstart 是 W-F6 落地後 3 種啟動模式(dev / prod baseline / prod + acme)的操作指南 + 故障排查。

---

## 前提

- Docker Compose v2.x plugin 已裝
- 在 outer repo root(`fork260509-rev1/`)cd 過去
- W-F4 既有 secret 已備:`deploy/secrets/{jwt_secret,database_url,redis_url,postgres_password,redis_password}.txt` 5 個檔填值
- WSL2 環境:Win11 22H2+ 預設 mirrored networking mode
- 4 個 dev port(11080 / 11081 / 15432 / 16379)+ 2 個 prod port(11443 dev 也用)host 無衝突
- (prod + acme)`deploy/secrets/acme_email.txt`:`cp acme_email.txt.example acme_email.txt` + 填真實 email

---

## 模式 1:Dev(127.0.0.1 loopback + HTTP + HTTPS 自簽 cert)

### 第一次:生成 dev cert

```bash
bash deploy/generate-dev-cert.sh
# 輸出:
# ✓ Dev cert generated at .../dev-certs/
#   - fullchain.pem(public、可 import 進 browser/system trust store)
#   - privkey.pem(只在本機 dev、勿 commit)

ls -la deploy/dev-certs/*.pem
# 預期:fullchain.pem(644)+ privkey.pem(600)
```

> 重跑 = 覆蓋既有 cert(冪等)。每年(365 天後)重跑一次即可。

### Dev 啟動

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

**預期**:60-90s 內 6 service healthy(等同 W-F7 + W-F6 TLS overhead)。

### Dev 驗證(host 機)

```bash
# HTTP(W-F7 既有流程不破)
curl -fsS http://127.0.0.1:11080/health                              # → ok
curl -fsS http://127.0.0.1:11081/health                              # → rust-api 直連
pg_isready -h 127.0.0.1 -p 15432                                    # → accepting connections
redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping
                                                                     # → PONG

# HTTPS(W-F6 新加)
curl -kfsS https://127.0.0.1:11443/health                            # → ok(-k 忽略自簽 warning)
curl -kfsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  https://127.0.0.1:11443/api/auth/login                             # → JSON 含 token

# TLS handshake + protocol 驗
openssl s_client -connect 127.0.0.1:11443 -servername localhost </dev/null 2>&1 | \
  grep -E "subject=|Protocol|Cipher"
# 預期:subject=CN=localhost + Protocol TLSv1.3 + 含 Cipher

# cert SAN 驗
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName
# 預期:DNS:localhost, IP Address:127.0.0.1
```

### Dev 瀏覽器驗

開瀏覽器訪 `https://127.0.0.1:11443`:
- 第一次看 cert warning(自簽 cert)→ 可選 "Advanced" → "Proceed to 127.0.0.1"(Chrome)/ 接受 risk(Firefox)
- 進入 SPA、login `Soybean / 123456` → dashboard
- 也可訪 `http://127.0.0.1:11080`(W-F7 既有 HTTP 流程、無 TLS)

---

## 模式 2:Prod baseline(0.0.0.0 對外 + 80 強制 redirect 443)

### Prod cert seed(W-F6 階段 — acme 未實際 issue、用 dev cert 暫填)

```bash
# 把 dev cert 內容塞進 named volume(模擬 prod cert)
docker run --rm \
  -v rev1-admin_front_nginx_certs:/certs \
  -v "$PWD/deploy/dev-certs":/src \
  alpine sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
```

> W-F6b 落地後(prod VPS 上線時),acme.sh 會自動 issue 真實 cert 進此 volume、不再需要手動 seed。

### Prod baseline 啟動

```bash
# 先確保 dev stack down(避免 port 衝突)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans

# 啟 prod baseline(顯式 -f prod.yml)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
docker compose ps
# 預期:6 service healthy(無 acme)
```

### Prod baseline 驗證

```bash
# 80 → 443 強制 redirect(注意 -I 看 header、不 follow)
curl -fsSI http://127.0.0.1:11080/health
# 預期:HTTP/1.1 301
#       Location: https://127.0.0.1/health(或類似 https:// scheme)

# /.well-known/acme-challenge/ 例外不被 redirect
curl -fsSI http://127.0.0.1:11080/.well-known/acme-challenge/dummy
# 預期:HTTP/1.1 404(非 301、表示 location ^~ 攔到)

# 443 HTTPS work
curl -kfsS https://127.0.0.1:11443/health                            # → ok
curl -kfsS https://127.0.0.1:11443/api/auth/login -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}'                  # → token

# binding 對外 0.0.0.0(prod 必要)
ss -tlnp | grep -E ":(11080|11443)\b"
# 預期 2 行、Local Address 開頭 0.0.0.0
```

### Prod baseline → dev 切回

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans   # 不帶 -v 保 volume
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

---

## 模式 3:Prod + acme skeleton(7 service、sanity check)

### 準備 acme email

```bash
cp deploy/secrets/acme_email.txt.example deploy/secrets/acme_email.txt
# 編輯填真實 email(如 admin@yourdomain.com)
```

### 啟動

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose ps
# 預期 7 service:6 既有 healthy + acme container running
```

### Acme skeleton sanity 驗

```bash
docker compose exec acme acme.sh --version
# 預期:exit 0 + 印 acme.sh 版本

docker compose exec acme cat /run/secrets/acme_email
# 預期:email content(per acme_email.txt)

docker compose exec acme ls -la /acme.sh
# 預期:dir 存在;W-F6 階段空 / 只含 acme.sh init files;不該有實際 cert
```

> **W-F6 範疇不跑 cert issue / renew**。實際 acme.sh `--issue --dns ...` 留 W-F6b(需真實 domain + DNS provider creds)。

---

## 故障排查

### 1. WSL2 NAT mode — Windows host 訪 127.0.0.1 不通

**症狀**:WSL shell `curl http://127.0.0.1:11080/health` 成功;Windows host(PowerShell)連不上。

**對策**:
- 確認 Win11 ≥ 22H2(`winver`)
- 編 `%USERPROFILE%/.wslconfig`:
  ```ini
  [wsl2]
  networkingMode=mirrored
  ```
- PowerShell `wsl --shutdown` 重起 WSL
- 或用 `wsl hostname -I` 拿 WSL2 IP、改訪該 IP

### 2. dev cert 未生成 + dev up

**症狀**:`docker compose up --wait` exit 非 0、`docker compose logs front-nginx` 含 `ssl_certificate file ... not found`。

**對策**:
```bash
bash deploy/generate-dev-cert.sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

### 3. Cert SAN 缺 IP:127.0.0.1

**症狀**:curl `https://127.0.0.1:11443/...` 報 `subjectAltName ... does not match`,加 `-k` work,瀏覽器持續報 cert mismatch。

**對策**:確認 `generate-dev-cert.sh` 含 `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`;若缺、重跑 script。

### 4. Prod baseline 啟動 nginx 443 fail

**症狀**:`docker compose -f prod.yml up -d --wait` exit 非 0、front-nginx unhealthy、logs 含 `ssl_certificate file not found`。

**對策**:per Prod cert seed 段、把 dev cert seed 進 named volume(W-F6b 落地後 acme issued cert 替代)。

### 5. Acme container restarting / crash loop

**症狀**:`docker compose ps acme` 顯示 `restarting`、logs 含 panic / fatal。

**對策**:臨時改 `command: ["sleep", "infinity"]`(spec A-008 fallback);W-F6b 啟用真實 cert 時切回 `["daemon"]`。

### 6. Port 衝突 — `bind: address already in use`

**症狀**:`docker compose up` 啟動失敗、訊息含 `Ports are not available`。

**對策**:
```bash
ss -tlnp | grep ":<衝突 port>"   # 找占用者
# 停用占用者(如 fork260509 並行 stack:cd ../fork260509 && docker compose down)
```

### 7. dev → prod 切換後 cert 不對

**症狀**:prod baseline curl `https://127.0.0.1:11443` 報 cert error。

**對策**:per Prod cert seed 段、用 dev cert seed 進 named volume(W-F6 階段約定);prod 真實部署 W-F6b 由 acme issue。

---

## 回滾

W-F6 純配置變動、不動 volume(except `front_nginx_certs` 新建)/ source code。回滾路徑:

```bash
# 停 stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v --remove-orphans

# Git revert(或退回 W-F7 結束 SHA)
git revert <W-F6-merge-sha>
# 或 git reset --hard <W-F7-merge-sha 即 62b3475>(若 local、無 push)
```

回滾後等同 W-F7 狀態,W-F7 acceptance 仍滿足、無 TLS 入口。

---

## 下一步

W-F6 完成後 Phase W deploy P2 進度 **3/4**,剩:
- **W-F11** `rust-horizontal-scaling`:rust-api replicas + upstream auto-discovery + Casbin pub-sub 跨 instance 驗

**W-F6b**(W-F6 解鎖、後續):acme.sh 實際 cert acquisition / renew + DNS provider 拍板 + 真實 prod domain — 屬 W-F6 follow-up、prod VPS 上線時觸發。
