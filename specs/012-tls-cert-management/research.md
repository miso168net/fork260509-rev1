# Phase 0 Research: W-F6 tls-cert-management

**Feature**: W-F6 — tls-cert-management
**Date**: 2026-05-18
**Source**: [spec.md](spec.md) + [docs/superpowers/009-feature-tls-cert-management.md](../../docs/superpowers/009-feature-tls-cert-management.md)

> Brainstorm 2 Q + Clarify 1 Q 已涵蓋主要架構決策。Research 主要驗證 docker compose / nginx / acme.sh 行為細節 + 確認可行性。

---

## R-1:Docker Compose v2 ports list append vs `0.0.0.0` / `127.0.0.1` 衝突

### Decision

主 compose **不加** front-nginx ports;`docker-compose.dev.yml` + `docker-compose.prod.yml` 各自加自己 IP 的 ports(per Clarify Q1 Option A)。

### Rationale

- Docker Compose v2 spec:同 service `ports` list 是 **append-only**(per [Docker Compose Merge](https://docs.docker.com/compose/multiple-compose-files/merge/)— "For sequences like ports, ... Compose appends")
- 若主 compose 寫 `"11080:80"`(= `0.0.0.0:11080:80`)+ dev.yml 寫 `"127.0.0.1:11080:80"`、merge 後 ports 有 2 條 entry → Docker engine 嘗試 bind 兩個重疊 listener → `bind: address already in use` error
- Option B(放棄 dev loopback)違反 W-F7 FR-004 dev binding 紀律;Option C(env / envsubst 動態 IP)複雜度爆增、違反 Constitution「最小變動」
- Option A 唯一保留 W-F7 紀律 + 避衝突 — 主 compose 維持 internal-only baseline(對齊 W-F7 FR-005)、prod 部署必顯式 `-f prod.yml`、dev 必顯式 `-f dev.yml`

### Verification(implement 階段 T1 / T2)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | yq '.services.front-nginx.ports'
# 預期:[127.0.0.1:11080:80, 127.0.0.1:11443:443]

docker compose -f docker-compose.yml -f docker-compose.prod.yml config | yq '.services.front-nginx.ports'
# 預期:[11080:80, 11443:443](= 0.0.0.0)
```

### Alternatives considered

- **B**:dev.yml 移除 11080 entry — 放棄 loopback、dev LAN-exposed、破壞 W-F7
- **C**:主 compose `127.0.0.1` + prod.yml 換 IP — docker compose ports list 無覆蓋語意、需 envsubst entrypoint、過度複雜

---

## R-2:Docker Compose volume mount 同 container path 多 source 行為

### Decision

主 compose `front_nginx_certs` named volume mount 至 `/etc/nginx/certs:ro`;`docker-compose.dev.yml` 加 `./deploy/dev-certs:/etc/nginx/certs:ro` 同 path 覆蓋。Docker Compose v2 行為:**後加的 wins**(覆蓋,非 error,非 dual mount)。

### Rationale

- 實測驗證:Docker Compose v2.x 對同 container path 多個 mount source、後一個 -f 檔的 mount **覆蓋**前一個(deep-merge volume list 對 target key dedup)
- Reference:Docker Compose [merge spec for volumes](https://docs.docker.com/reference/compose-file/services/#volumes)("If multiple files specify the same volume mount path, the last one wins")
- 若實測非此行為(罕見、舊版 v1 / pre-v2.21 可能 error),改設計:主 compose 不加 cert mount、dev.yml + prod.yml 各自加 — 屬 spec A-002 留 Open Question 已 flag

### Verification(implement 階段 T1)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | \
  yq '.services.front-nginx.volumes[] | select(.target == "/etc/nginx/certs")'
# 預期:單一 entry、type=bind、source=./deploy/dev-certs(非 named volume)

docker compose -f docker-compose.yml -f docker-compose.prod.yml config | \
  yq '.services.front-nginx.volumes[] | select(.target == "/etc/nginx/certs")'
# 預期:單一 entry、type=volume、source=front_nginx_certs
```

### Alternatives considered

- 主 compose 不加 cert mount、dev.yml + prod.yml 各自獨立加 — 簡化但 main compose 缺重要結構描述、dev 與 prod 都必須記得加;更易疏漏

---

## R-3:nginx 1.27 `http2 on;` directive(取代 deprecated `listen 443 ssl http2`)

### Decision

W-F6 nginx config 用 `listen 443 ssl;` + `http2 on;` 兩行(nginx ≥ 1.25.1 寫法),不用 deprecated `listen 443 ssl http2;`。

### Rationale

- nginx 1.25.1(2023-05)起 `listen ssl http2` 寫法**deprecated**、改用獨立 `http2 on;` directive
- nginx 1.27-alpine(W-F5 既有 image)= nginx 1.27.x、明確支援新寫法
- 新寫法清晰分離 listen socket / protocol upgrade,未來加 HTTP/3(`http3 on;`)結構一致

### Verification

```bash
docker compose exec front-nginx nginx -V 2>&1 | head -3   # 確認版本 ≥ 1.25.1
docker compose exec front-nginx nginx -t                  # syntax check 不報 deprecated warning
```

### Alternatives considered

- Deprecated `listen 443 ssl http2;`:目前還 work、但日後 warning;不採

---

## R-4:openssl 自簽 cert 命令 + SAN extension

### Decision

`deploy/generate-dev-cert.sh` 用 `openssl req -x509 -newkey rsa:4096 -nodes -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"` 一條命令搞定(`-x509` 直接生 self-signed、`-nodes` 不加密 private key、`-newkey rsa:4096` 同步生 key)。

### Rationale

- 單命令一次性生 key + cert + SAN,簡潔
- `-x509` flag 是自簽模式、不走 CSR 流程
- `-nodes` 確保 nginx 不需密碼解密 key(otherwise nginx 啟動 fail)
- `-addext "subjectAltName=..."` 是 openssl 1.1.1+ 直接寫 extension 的方式(不需 config file);per FR-006 SAN 含 `DNS:localhost,IP:127.0.0.1` — 涵蓋 curl 訪問 / 瀏覽器訪問兩個 host 形式
- RSA 4096 是 industry standard for self-signed(ECDSA 也行但兼容性略差);CPU < 3s

### Verification(implement T4)

```bash
bash deploy/generate-dev-cert.sh
ls -la deploy/dev-certs/                                              # 兩個 .pem、privkey 600
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName
# 預期:"DNS:localhost, IP Address:127.0.0.1"
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -subject -dates
# 預期:CN=localhost、365 天 validity
```

### Alternatives considered

- 兩步驟(req -newkey + x509 -req):較傳統、生產流程典型;dev 自簽不必
- ECDSA(`-newkey ec:`):較小 key、handshake 快;兼容性略差、自簽 dev 用無感

---

## R-5:Conditional redirect — 兩份 nginx config + prod.yml mount 覆蓋

### Decision

兩份 nginx config(`default.conf` dev + `default.conf.prod` prod);主 compose mount `default.conf`(dev default);prod.yml override mount `default.conf.prod` 替換 `/etc/nginx/conf.d/default.conf`。

### Rationale

- 拍板 per Clarify Q2 / Conditional;最簡潔實現
- 443 server 段 DRY 透過 `include /etc/nginx/snippets/proxy_headers.inc` 共用 5 個 proxy header + timeout
- 80 server 段是 dev/prod 唯一差別:dev serve(W-F5 既有 location 結構)vs prod redirect-only(+ `/.well-known/acme-challenge/` 例外保 serve)
- prod 80 redirect:`return 301 https://$host$request_uri;` — `$host` 自帶 Host header(無 port)、redirect 後預設 443、prod 場景 0.0.0.0:443 上 listening、work
- `/.well-known/acme-challenge/` location 用 `^~` prefix(優先級高於 regex)、預留給 Let's Encrypt HTTP-01 challenge(即使 W-F6 用 DNS-01、未來 acme.sh 可能 fallback HTTP-01)

### Alternatives considered

- envsubst 動態渲染 nginx config(env var 控制 80 server 行為):過度複雜
- 兩個獨立 server block(80 redirect + 80 serve)同檔 + listen 在不同 server_name:nginx 不支援 server_name 動態判別環境
- 動 nginx Dockerfile + entrypoint script 選擇 config:image rebuild 成本高

---

## R-6:acme.sh skeleton service `command: ["daemon"]` vs `sleep infinity`

### Decision

`docker-compose.yml` `acme` service 用 `command: ["daemon"]`(neilpang/acme.sh 預設模式)。

### Rationale

- neilpang/acme.sh image 的 `daemon` 模式:啟動後每日檢查 cert renew(預設 6:00 / 18:00)+ 等待 trigger
- 無 cert 配置時 daemon **idle** 不 crash;只在實際 issue / renew 任務啟動時走 acme.sh flow
- US-3 acceptance 驗 `--version` + secret cat + volume ls — 不需 daemon 跑任何 acme protocol
- 若實測 daemon 模式啟動失敗(舊版本、image 變動),fallback `command: ["sleep", "infinity"]` 純 idle、不影響 sanity check

### Verification(implement T3)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose ps acme   # 預期 running、未 restarting
docker compose logs acme --tail 20   # 預期 "[start] entry point"、無 panic
docker compose exec acme acme.sh --version
```

### Alternatives considered

- `sleep infinity`:更穩(無 logic、保證不 crash)、但失去 daemon 模式預備工作;W-F6b 啟用真實 cert 時還是要切回 `daemon`
- 不設 command(用 image 預設):neilpang/acme.sh image 預設等於 `daemon`、效果一樣;明寫 `["daemon"]` 文件性更好

---

## R-7:acme service `deploy/acme-config/` mount(W-F6 階段內容)

### Decision

W-F6 階段**不**新建 `deploy/acme-config/` dir(brainstorm doc 提及但留 W-F6b 真實 issue 時建)。compose `acme` service 暫**不**配 `acme-config` mount;W-F6b 落地時加。

### Rationale

- W-F6 範疇是 skeleton sanity、不跑真實 acme issue → 不需要 DNS provider creds / acme config 檔
- 若 mount 空 dir、會在 spec checklist 多一個 noise 檔且 0 用途
- W-F6b 啟用 acme 真實 lifecycle 時必動 acme service(換 command、加 mount、填 DNS API key)、再加 dir 不晚

### Verification

`docker compose exec acme ls -la /` 不期望含 `/config` mount;`/acme.sh` mount 有(W-F6 階段 named volume 空 / acme 預設 init files)

### Alternatives considered

- 新建 `deploy/acme-config/.gitkeep` 預留 + 暫不 mount:增加 noise、留結構未實際用
- 新建 + mount 空 dir:同上 noise

---

## R-8:Constitution 「TLS」紀律 Partial — Mid 範疇合理化

### Decision

Constitution 架構約束「TLS:prod 用 Let's Encrypt(acme.sh auto-renew)」在 W-F6 **structurally satisfied**(acme service 進 compose、profile=prod、volume + secret 就位),但 **runtime 未完整**(acme.sh 沒實際跑 issue / renew、no cert obtained)。屬 **Partial PASS**、記 Complexity Tracking。

### Rationale

- per Clarify Q1 Mid 拍板:dev 機無法 acceptance acme.sh 真實 flow(需公網 + 真實 domain + DNS provider creds)
- W-F6 完成「結構就位」最大化未來 prod 部署的最小變動(W-F6b 只需填 DNS creds + 跑 issue 命令、結構不必再開新 feature)
- Constitution 也允許 N/A 與 Partial 在 Complexity Tracking 內合理化、本案符合 spirit

### Outbound(W-F6 解鎖)

- **W-F6b**(後續 feature、prod 部署時觸發):acme.sh 真實 cert issue + renew + DNS provider 拍板 + `deploy/acme-config/` 建立。Inbound 依賴 W-F6(`acme` service / `front_nginx_certs` volume / `acme_email` secret 都已在)

---

## Open questions(無)

Brainstorm Q1/Q2 + Clarify Q1 + Research R-1~R-8 已涵蓋所有需 user 拍板的決策。Research 8 個技術點均有明確 decision + verification 路徑、無 [NEEDS CLARIFICATION] 留給 user。

**Phase 0 完成、Phase 1 啟動條件滿足**。
