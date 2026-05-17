# Feature Specification: W-F6 — tls-cert-management(TLS + 對外 port + prod cert skeleton)

**Feature Branch**: `012-tls-cert-management`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "W-F6 tls-cert-management — TLS 終止 + 對外 port 暴露 + prod cert lifecycle skeleton(dev 自簽 + acme.sh profile=prod)"

**Source**: [`docs/superpowers/009-feature-tls-cert-management.md`](../../docs/superpowers/009-feature-tls-cert-management.md)(brainstorming 2026-05-18 session、Q1 Mid 範疇 + Q2 Conditional redirect 拍板)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §4(反向代理 + TLS)、§4.5(TLS cert 來源 — prod acme.sh / dev 自簽)、§6.1(11443 對外 HTTPS port)、§6.3(prod 只暴露 front-nginx 11080 / 11443)、§11.1(W-F6 scope)、§11.2(P2 依賴序 W-F5→W-F6→W-F7)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(架構約束「TLS:對外流量 MUST 走 TLS;prod Let's Encrypt + acme.sh auto-renew;dev / staging 自簽;HTTP only 僅限本機 dev」+ 開發流程「TLS 紀律」)
- [`CLAUDE.md`](../../CLAUDE.md) §5.2(rev1 提議 port:11443 HTTPS / 11080 HTTP→HTTPS redirect)
- [`specs/010-front-nginx/`](../010-front-nginx/)(W-F5、既有 nginx config 基底 — W-F6 加 443 server block + prod variant)
- [`specs/011-port-mapping/`](../011-port-mapping/)(W-F7、OOS-011 明確「prod 對外 host port」屬 W-F6 範疇)
- [`docker-compose.yml`](../../docker-compose.yml)(W-F7 後 internal-only baseline)
- [`docker-compose.dev.yml`](../../docker-compose.dev.yml)(W-F7 既有)

**Scope summary**:rev1 deploy Phase W **P2 第三個 feature**(W-F5 + W-F7 之後)— **加 TLS 終止 + 對外 port 暴露 + prod cert lifecycle skeleton**。具體交付:

1. **Host port 由 dev.yml + prod.yml 各自加、主 compose 不加 ports**(per Clarify Q1 Option A、避開 docker compose ports list append 衝突):
   - `docker-compose.dev.yml`(W-F7 既有檔)加 `127.0.0.1:11443:443`(11080 W-F7 既有保留 127.0.0.1 binding)
   - `docker-compose.prod.yml`(新建)加 `0.0.0.0:11080:80` + `0.0.0.0:11443:443`(prod 需 LAN/公網可達)
   - 主 `docker-compose.yml` **仍維持 internal-only baseline**(對齊 W-F7 FR-005 紀律、`docker compose up -d` 不帶 -f 仍 prod-safe)
2. **加 named volume `front_nginx_certs`** + front-nginx ro mount `/etc/nginx/certs`(統一 cert path、dev/prod 共用)
3. **加 acme.sh skeleton service**(image `neilpang/acme.sh`、`profiles: ["prod"]`、dev `docker compose up` 不啟);加 `acme_email` secret(對齊 W-F4 `_FILE` pattern)
4. **nginx config 改**:`deploy/front-nginx/conf.d/default.conf` 加 `listen 443 ssl` server block + `http2 on;` + TLSv1.2/1.3 + HIGH ciphers + 80 server 仍 serve(dev 預設)
5. **新建 `default.conf.prod` variant**:80 server 改 redirect-only(`return 301 https://$host$request_uri`)+ 保留 `location ^~ /.well-known/acme-challenge/`(未來 Let's Encrypt HTTP-01 challenge 用);443 server 與 dev 一字不差
6. **抽 `snippets/proxy_headers.inc`**:5 個 proxy header + timeout、80 / 443 location `/api/` 共用(DRY)
7. **`deploy/generate-dev-cert.sh`**:openssl 自簽 RSA 4096、`CN=localhost`、SAN 含 `DNS:localhost,IP:127.0.0.1`、輸出 `deploy/dev-certs/{fullchain,privkey}.pem`
8. **`docker-compose.dev.yml` 加 mount**(W-F7 既有檔追加):`./deploy/dev-certs:/etc/nginx/certs:ro` 覆蓋 named volume(同 container path、後者 wins)
9. **`docker-compose.prod.yml` 新建**:override front-nginx mount `default.conf.prod` 替換 default.conf
10. **W-F4 secret 機制延伸**:`acme_email.txt.example` template + `.gitignore` 排除 `*.pem` 與 `acme_email.txt`
11. **文件更新**:CLAUDE.md §5.2 + `docs/INTEGRATION-CHECKLIST.md`

**範疇外**:acme.sh 實際 cert issue / renew(留 W-F6b、需真實 domain + DNS provider)、DNS provider 拍板、HSTS / OCSP stapling、rate limiting / WAF、cert rotation runbook、Track DESIGN-A `track-a.inc`(W-FA1)、mkcert / browser trust chain、worktree 改動、secret 機制改動。**單段 commit**(只動 outer、不動 worktree)— 對齊 W-F7。

## Clarifications

### Session 2026-05-18(/speckit-clarify 階段拍板、1 項)

- Q: dev mode 同時 load main compose(W-F6 原擬加 0.0.0.0 ports)+ W-F7 既有 dev.yml(127.0.0.1 ports)時 docker compose ports list append 行為下 binding 衝突怎麼解? → A: **Option A** — **主 compose 不加 ports、prod.yml + dev.yml 各自加**;`docker-compose.prod.yml` 加 `0.0.0.0:11080:80` + `0.0.0.0:11443:443`、`docker-compose.dev.yml` 加 `127.0.0.1:11443:443`(11080 W-F7 既有保留);主 compose 仍維持 internal-only baseline(對齊 W-F7 FR-005、prod-safe by default、`docker compose up -d` 不帶 -f 不暴露任何 port、prod 部署必顯式 `-f docker-compose.prod.yml`)。對齊 W-F7 dev loopback-only 安全紀律不破。**修正 FR-001 / FR-012 / FR-013 + Scope summary + Key Entities + US-2 scenario 1**。

### Session 2026-05-18(brainstorming 階段拍板、2 項)

- **Q1**: W-F6 範疇 — DESIGN-W §4.5 full(dev + prod acme.sh 都做)vs Split(只做 dev + prod 結構)vs Mid(dev 自簽 + acme.sh skeleton 結構就位、不驗 cert acquisition)? → **A: Mid**。理由:dev 機無法 acceptance acme.sh 真實 challenge / renew(需公網 + 真實 domain + DNS provider API);Full 是 deferred test 偽完整、違反「最小變動」;Mid 結構就位(image / volume / secret / profile)+ sanity check 跑得通、未來 prod 上線只需填 domain + DNS provider config + 跑 cert issue 命令、結構不必再開新 feature。代價接受:cert acquisition / renew 留 W-F6b、prod 部署時才完整測試。

- **Q2**: HTTP → HTTPS redirect 怎麼設?(dev host port 11080/11443 vs prod 80/443、redirect target host 計算有差異)→ **A: Conditional**(dev 80 仍 serve、prod 80 才 redirect 443)。理由:W-F7 dev `http://127.0.0.1:11080/...` 流程已落地;Strict 一律 redirect 在 dev 計算 redirect target port 不正確、會破壞 W-F7;Hybrid envsubst 動態 port 過度複雜。Conditional 透過「兩份 nginx config + prod override mount」實現、結構清晰、dev W-F7 流程零破壞、prod 完整守 Constitution「對外 MUST 走 TLS」。代價:多 1 個 `default.conf.prod` + 1 個 `docker-compose.prod.yml`。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dev HTTPS + W-F7 既有 HTTP 流程共存(Priority: P1)🎯 MVP

dev / 整合測試者跑自簽 cert 腳本 + dev 啟動命令後,既能用 W-F7 既有 `http://127.0.0.1:11080/...` 流程(零破壞)、也能用新加的 `https://127.0.0.1:11443/...` 流程(curl `-k` 忽略 self-signed warning)。

**Why this priority**:

W-F6 核心價值是「TLS 終止結構落地」— dev 場景驗證了 nginx 443 ssl + cert mount + 自簽 cert 工作流就證明 prod TLS 結構可行(prod 只是換 cert 來源)。如果 dev HTTPS 不通、整個 feature 無意義。同時必須**零破壞** W-F7 dev HTTP 流程(operator 已習慣 W-F7 commands)。

**Independent Test**:dev cert script 生成 cert → dev stack 6 service healthy → HTTP `:11080` 流程 4/4 PASS + HTTPS `:11443` 流程 4/4 PASS + cert SAN 驗 — 不需 US2 / US3 / W-F6b 任何依賴。

**Acceptance Scenarios**:

1. **Given** operator 在 outer repo root,**When** 跑 `bash deploy/generate-dev-cert.sh`,**Then** `deploy/dev-certs/` 下出現 `fullchain.pem` + `privkey.pem`、privkey perm = 600
2. **Given** dev cert 已生成,**When** 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`,**Then** 6 service 全 healthy(等同 W-F7 baseline + nginx 443 startup)
3. **Given** dev stack healthy,**When** host 機 `curl -fsS http://127.0.0.1:11080/health`(W-F7 既有 HTTP 流程),**Then** HTTP 200 + body `ok`(零 regression)
4. **Given** dev stack healthy,**When** host 機 `curl -kfsS https://127.0.0.1:11443/health`(W-F6 新加 HTTPS),**Then** HTTP 200 + body `ok`
5. **Given** dev stack healthy,**When** host 機 `curl -kfsS -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' https://127.0.0.1:11443/api/auth/login`,**Then** HTTP 200 + body 含 JWT token
6. **Given** dev stack healthy,**When** `openssl s_client -connect 127.0.0.1:11443 -servername localhost </dev/null 2>&1 | grep -E "subject=|TLS"`,**Then** 含 `subject=CN=localhost`、`TLSv1.3`(或 1.2)成功握手
7. **Given** dev stack healthy,**When** `openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName`,**Then** 含 `DNS:localhost, IP Address:127.0.0.1`

---

### User Story 2 — Prod baseline 啟動 80 強制 redirect 443(Priority: P2)

prod 部署者(模擬:dev 機跑 prod baseline 命令、cert 用 dev 自簽暫填)— `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`(不帶 `--profile prod`)起來後、80 server 強制 301 redirect 到 443、`/.well-known/acme-challenge/` 例外保留 80 serve(留給未來 acme.sh HTTP-01 challenge)。

**Why this priority**:

Constitution「對外流量 MUST 走 TLS」紀律的可驗證證明 — Conditional 拍板必須兩端都驗:dev 不破壞(US1)+ prod 強制 TLS(US2)。次優先於 US1(US1 work 就有 dev 可用價值;US2 驗證 prod 設計意圖)。

**Independent Test**:把 dev cert 內容塞進 named volume(模擬 prod cert);啟 prod compose、跑 3 個 scenario(redirect / acme-challenge 保留 / 443 work)— 不需 acme.sh 啟動。

**Acceptance Scenarios**:

1. **Given** operator 已把 dev 自簽 cert 內容塞進 `front_nginx_certs` named volume(模擬 prod cert)、跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans` 清 dev,**When** 跑 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait`(顯式 `-f prod.yml` 才會暴露 host port、不帶 `--profile prod` 不啟 acme),**Then** 6 service 全 healthy(無 acme container)、host port `11080` + `11443` bound `0.0.0.0`(`ss -tlnp` 驗)
2. **Given** prod baseline stack 起來,**When** host 機 `curl -fsSI http://127.0.0.1:11080/health`(注意 `-I` 看 header、不要 `-L` follow redirect),**Then** HTTP 301 + Location `https://127.0.0.1/health`(或 `https://127.0.0.1:11080/health` 或 `https://127.0.0.1:80/health` — 依 `$host` 計算邏輯;**重點:status code = 301 + Location scheme = https**)
3. **Given** prod baseline stack 起來,**When** host 機 `curl -fsSI http://127.0.0.1:11080/.well-known/acme-challenge/dummy`,**Then** HTTP status **非 301**(預期 404、表示 `/.well-known/acme-challenge/` location 沒被 redirect 攔)
4. **Given** prod baseline stack 起來,**When** host 機 `curl -kfsS https://127.0.0.1:11443/health`,**Then** HTTP 200 + body `ok`(443 ssl 仍 work、用 named volume 內的 cert)

---

### User Story 3 — Acme skeleton sanity(Priority: P3)

prod 預部署 dry-run 驗證者 — `--profile prod` 啟用 acme.sh container,做 image / secret / mount sanity check(實際 cert acquisition 留 W-F6b)。

**Why this priority**:

skeleton 結構驗 — Q1 Mid 拍板的可驗證證明:acme.sh image 拉得到、binary 可呼叫、ACME_EMAIL secret 通過 W-F4 `_FILE` pattern。本 US 不測「實際 issue cert」(那需要真實 domain + DNS provider + 公網)— 留 W-F6b。

**Independent Test**:`--profile prod` 啟 acme container + 3 個 sanity scenario(`--version` / secret content / volume mount)— 不影響 US1 / US2、可獨立執行。

**Acceptance Scenarios**:

1. **Given** operator 已備 `deploy/secrets/acme_email.txt`(`cp .example` + 填值)、prod compose 已可啟,**When** 跑 `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait`,**Then** 7 service running(6 既有 healthy + acme container running)
2. **Given** acme service running,**When** `docker compose exec acme acme.sh --version`,**Then** exit 0 + 印 acme.sh version string(image 拉到、binary 可呼叫)
3. **Given** acme service running,**When** `docker compose exec acme cat /run/secrets/acme_email`,**Then** 印 email content(W-F4 secret `_FILE` pattern work)
4. **Given** acme service running,**When** `docker compose exec acme ls -la /acme.sh`,**Then** dir 存在(named volume `front_nginx_certs` mount 進);內容空或 acme.sh 預設 init files(`account.conf` 等);**不**期望已有 cert 檔

---

### Edge Cases

- **dev cert 未生成直接 dev up**:nginx 443 server `ssl_certificate` file not found、front-nginx healthcheck fail、`--wait` exit 非 0。**對策**:quickstart 把 `bash deploy/generate-dev-cert.sh` 排在 dev up 前;dev up fail 訊息引導 user 跑 cert script。
- **自簽 cert SAN 不含 `IP:127.0.0.1`**:`curl --resolve` 或瀏覽器訪 `127.0.0.1` 報 cert mismatch。**對策**:`generate-dev-cert.sh` 用 `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"` 確保 SAN 同含兩者(per FR-007)。
- **dev cert 過期(365 天後)**:nginx 仍 serve(自簽不 validate chain)、browser warning 強化。**對策**:user 每年重跑 `generate-dev-cert.sh` 即可;不在 W-F6 範疇自動 renew dev cert。
- **prod baseline 啟動但 cert volume 空**:nginx 443 server 啟動 fail。**對策**:`docker-compose.prod.yml` 說明檔提示 — 啟用前必先把 cert 放進 named volume(staging 場景 dev 自簽 cert 塞進 / prod 場景 acme.sh issue)。
- **acme.sh skeleton 啟動但 secret 沒填**:acme.sh 任何 register-account / issue 動作會 fail。**對策**:`acme_email.txt.example` template 含 `admin@example.com` placeholder + 註解警告;US-3 scenario 3 grep cat 內容、空檔會 fail。
- **dev 同時 mount named volume + dev-certs(後者 wins?)**:docker compose v2.x 同 container path 兩個 volume mount,行為需驗(可能 override / 可能 error)。**對策**:implement 階段 T1 `docker compose -f -f config` 渲染後 grep `front-nginx.volumes`、確認 dev-certs entry 存在;若 conflict 改設計(主 compose 不加 named volume mount、改在 prod override 加)。
- **dev nginx config 意外含 redirect logic**:違反 Q2 Conditional 拍板。**對策**:`default.conf`(dev)永不含 `return 301`、prod 版只在 `default.conf.prod` 加;CI / review 階段 grep 確認。
- **acme.sh daemon 模式 crash loop**:無 cert config 時 daemon idle、應不會 crash。**對策**:US-3 scenario 1 `docker compose ps` 確認 acme container `running` 不是 `restarting`;若 crash 提示 user 改 entrypoint 為 `sleep infinity` 暫時 skeleton(W-F6 implement 階段視情況)。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 主 `docker-compose.yml` MUST **不加** front-nginx host ports(對齊 W-F7 FR-005 — 主 compose 維持 internal-only baseline、prod-safe by default;對外 host port 由 dev.yml + prod.yml 各自加、per Clarify Q1 Option A 避開 ports list append 衝突)。
- **FR-002**: System MUST 加 named volume `front_nginx_certs`、mount 進 front-nginx `/etc/nginx/certs:ro`。
- **FR-003**: System MUST 加 `acme` service(image `neilpang/acme.sh:latest`、`profiles: ["prod"]`、mount `front_nginx_certs:/acme.sh`、`environment: ACME_EMAIL_FILE=/run/secrets/acme_email`、`secrets: [acme_email]`)、預設 dev `docker compose up` 不啟動。
- **FR-004**: System MUST 加 `acme_email` secret(對齊 W-F4 `_FILE` pattern、file path `./deploy/secrets/acme_email.txt`)。
- **FR-005**: `deploy/secrets/acme_email.txt.example` MUST 新建(W-F4 template 模式、含 placeholder `admin@example.com` + 註解警告 prod 啟用前必改)。
- **FR-006**: `deploy/generate-dev-cert.sh` MUST 新建、POSIX shebang(`#!/bin/sh`)、用 openssl 生 RSA 4096 自簽 cert、`subj /CN=localhost`、`addext subjectAltName=DNS:localhost,IP:127.0.0.1`、365 天有效、輸出 `deploy/dev-certs/{fullchain,privkey}.pem`、`chmod 600 privkey.pem`、結束印操作指引。
- **FR-007**: `deploy/dev-certs/` dir MUST 新建(以 README.md 或 .gitkeep 佔位、tracked)、`*.pem` 由 `.gitignore` 排除。
- **FR-008**: `deploy/front-nginx/conf.d/default.conf` MUST 改:保留 W-F5 既有 80 server(serve、無 redirect)+ 加 443 server block 用 `listen 443 ssl; http2 on; server_name _; ssl_certificate /etc/nginx/certs/fullchain.pem; ssl_certificate_key /etc/nginx/certs/privkey.pem; ssl_protocols TLSv1.2 TLSv1.3; ssl_ciphers HIGH:!aNULL:!MD5; ssl_session_cache shared:SSL:10m; ssl_session_timeout 10m;`。
- **FR-009**: `deploy/front-nginx/conf.d/default.conf` 80 + 443 server 內 location 結構 MUST 一字不差(`= /health` + `/api/` + `/`)、透過 `include /etc/nginx/snippets/proxy_headers.inc` 共用 5 個 proxy_set_header + `proxy_read_timeout 60s`。
- **FR-010**: `deploy/front-nginx/snippets/proxy_headers.inc` MUST 新建,含 `proxy_set_header Host $host;` + `X-Real-IP $remote_addr;` + `X-Forwarded-For $proxy_add_x_forwarded_for;` + `X-Forwarded-Proto $scheme;` + `X-Request-ID $request_id;` + `proxy_read_timeout 60s;` 共 6 行。
- **FR-011**: `deploy/front-nginx/conf.d/default.conf.prod` MUST 新建、80 server block 改為 redirect-only:含 `location ^~ /.well-known/acme-challenge/ { root /var/www/acme-challenge; }` 例外 + `location / { return 301 https://$host$request_uri; }`;443 server block MUST 與 `default.conf` 443 段完全相同(0 行 diff)。
- **FR-012**: `docker-compose.dev.yml`(W-F7 既有檔)MUST 加(a)mount `./deploy/dev-certs:/etc/nginx/certs:ro` 給 front-nginx(覆蓋主 compose `front_nginx_certs` named volume mount — 同 container path);(b)front-nginx ports entry `"127.0.0.1:11443:443"`(loopback only、對齊 W-F7 11080 既有 binding 風格);W-F7 既有 `"127.0.0.1:11080:80"` 保留不動。
- **FR-013**: `docker-compose.prod.yml` MUST 新建,含:(a)override front-nginx 加 mount `./deploy/front-nginx/conf.d/default.conf.prod:/etc/nginx/conf.d/default.conf:ro`(替換主 compose 預設 mount 的 default.conf);(b)front-nginx ports entry `"11080:80"` + `"11443:443"`(short syntax、無 IP 前綴 = `0.0.0.0`、prod 需 LAN/公網可達)。
- **FR-014**: `.gitignore` MUST 加排除 `deploy/dev-certs/*.pem` + `deploy/secrets/acme_email.txt`(對齊 W-F4 既有 secret gitignore 模式)。
- **FR-015**: dev 啟動 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 後 6 service healthy + HTTP `http://127.0.0.1:11080/health` 回 `ok`(W-F7 流程零 regression)+ HTTPS `https://127.0.0.1:11443/health`(`-k`)回 `ok`。
- **FR-016**: prod baseline 啟動 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait`(不帶 `--profile prod`、cert 已 pre-seed)後 6 service healthy + 80 `curl -I` 回 HTTP 301 Location `https://...` + `/.well-known/acme-challenge/<path>` 不被 redirect(回 404)+ 443 `curl -k` 回 `ok`。
- **FR-017**: prod + acme 啟動 `docker compose ... --profile prod up -d --wait` 後 7 service running(6 + acme)+ `docker compose exec acme acme.sh --version` 印版本 + `docker compose exec acme cat /run/secrets/acme_email` 印 email content。
- **FR-018**: 本 feature MUST 為 **單段 commit**(只動 outer、不動 worktree)— 對齊 W-F7 模式。
- **FR-019**: `CLAUDE.md` §5.2 MUST 更新「目前現況」反映 W-F6 落地(11080 HTTP + 11443 HTTPS 已暴露、dev 自簽流程、prod redirect + acme skeleton);§5.2.1「dev 啟動命令範例」MUST 加 cert 生成步驟 + HTTPS curl 驗證命令。
- **FR-020**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新 W-F6 row ✅ + Current Focus 進度 3/4 + 已完成里程碑加 W-F6 條目。

### Non-Functional Requirements

- **NFR-001**: 改動 / 新建檔案總數 SHOULD ≤ 12 個(預估 11:主 compose 改 + dev.yml 改 + prod.yml 新 + default.conf 改 + default.conf.prod 新 + snippets/proxy_headers.inc 新 + generate-dev-cert.sh 新 + dev-certs/ dir + acme_email.txt.example 新 + .gitignore 改 + CLAUDE.md / INTEGRATION-CHECKLIST.md 改)。
- **NFR-002**: dev cert 生成腳本執行時間 SHOULD ≤ 5 秒(openssl RSA 4096 通常 < 3 秒)。
- **NFR-003**: dev `docker compose up --wait` 啟動延遲與 W-F7 baseline 相比增幅 SHOULD ≤ 15%(加 443 listen + cert mount;預估 +5-10 秒)。
- **NFR-004**: prod TLS handshake 延遲 SHOULD ≤ 100ms(dev 機 loopback、`openssl s_client` 量、自簽 cert)。
- **NFR-005**: nginx config 兩份(default.conf + default.conf.prod)diff SHOULD ≤ 15 行(僅 80 server 段差別、443 段 0 行 diff)— 避免重複維護違反 DRY。

### Key Entities

- **`deploy/front-nginx/conf.d/default.conf`(W-F5 既有、W-F6 改)**:dev 預設、80 serve + 443 ssl,所有 location 共用 snippet。
- **`deploy/front-nginx/conf.d/default.conf.prod`(新建)**:prod variant、80 redirect-only + 保 `/.well-known/` + 443 段與 default.conf 一字不差。
- **`deploy/front-nginx/snippets/proxy_headers.inc`(新建)**:5 個 proxy header + timeout、80 / 443 共用。
- **`deploy/generate-dev-cert.sh`(新建)**:openssl 自簽 cert 腳本。
- **`deploy/dev-certs/`(新建 dir、tracked README.md / gitignored `*.pem`)**:dev 自簽 cert 存放。
- **`deploy/secrets/acme_email.txt.example`(新建)**:W-F4 template 模式。
- **`docker-compose.yml`(改)**:加 named volume + acme service(profile=prod)+ acme_email secret + front-nginx cert volume mount;**不加** ports(per Clarify Q1 Option A、維持 internal-only baseline)。
- **`docker-compose.dev.yml`(改、W-F7 既有)**:加 dev-certs mount + 加 `127.0.0.1:11443:443` ports entry。
- **`docker-compose.prod.yml`(新建)**:override front-nginx mount default.conf.prod + 加 `0.0.0.0:11080:80` + `0.0.0.0:11443:443` ports entries。
- **`.gitignore`(改)**:排除 cert + acme email secret。
- **`CLAUDE.md` §5.2 + §5.2.1(改)**:doc 化 W-F6 啟動命令。
- **`docs/INTEGRATION-CHECKLIST.md`(改)**:W-F6 row ✅ + 進度 3/4。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: dev 啟動命令(含 cert 生成)90 秒內完成、6 service 全 healthy(W-F7 baseline 60-75s + W-F6 +ssl+mount overhead ≤ 30s,SHOULD ≤ 15% 增幅)。
- **SC-002**: dev HTTPS / HTTP 雙流程 100% work — 4 個 endpoint(`http://...11080/health`、`https://...11443/health`、`http://...11080/api/auth/login`、`https://...11443/api/auth/login`)8/8 成功率。
- **SC-003**: prod baseline 80 強制 redirect 100% — 一般 path 100% 回 301 + Location https;`/.well-known/acme-challenge/<any>` 0% 被 redirect。
- **SC-004**: 自簽 cert SAN 100% 含 `DNS:localhost` + `IP:127.0.0.1`(openssl x509 ext 驗、缺一即 FAIL)。
- **SC-005**: nginx config 兩份檔 443 server block diff = 0 行(嚴守 DRY、prod 只動 80 段)。
- **SC-006**: 3 種啟動模式(dev / prod baseline / prod + acme)切換無 stack rebuild、操作步驟 ≤ 3 命令。
- **SC-007**: acme.sh skeleton sanity 100% — `--version` + `cat secret` + `ls /acme.sh` 3/3 PASS;**不**驗 cert acquisition(deferred W-F6b)。

## Assumptions

- **A-001**: dev 機 docker compose v2.x 支援 `profiles:` 機制(per W-F4 + W-F7 已驗)。
- **A-002**: docker compose v2.x volume mount 同 container path 多來源時,**override 檔的 mount 後加 wins**(覆蓋主 compose)。本 feature dev mode 依賴此行為;若實際 error,implement 階段改設計(主 compose 不加 cert mount,改在 dev.yml + prod.yml 各加)。
- **A-003**: nginx 1.27-alpine image 支援 `http2 on;` directive(nginx ≥ 1.25 寫法、已驗 1.27 含)。
- **A-004**: dev 機 openssl 可用(POSIX 標準、WSL / Linux / git bash 都有);`generate-dev-cert.sh` 不裝額外依賴。
- **A-005**: operator 接受 dev 自簽 cert 瀏覽器 warning(curl `-k` 跳過 verify、瀏覽器手動接受)— 不在 W-F6 範疇做 mkcert / CA trust chain。
- **A-006**: 將來 prod 部署(W-F6b)operator 會:填真實 domain 進 nginx server_name + 拍板 DNS provider + 填 acme.sh DNS API creds 進 `deploy/acme-config/` + 跑 `acme.sh --issue --dns ...` issue cert。
- **A-007**: W-F7 既有 dev `http://127.0.0.1:11080/...` 流程持續 work — 本 feature 嚴格保留 dev 80 server serve、不引入 redirect。
- **A-008**: acme.sh skeleton 跑 daemon 但無 cert config 時不會 crash loop(daemon idle 等待 trigger;若 crash 改用 `sleep infinity` 暫時)。

## Dependencies

### Inbound(本 feature 依賴)

- **W-F3** `compose-base-structure`:主 compose 6 service 結構穩定。✅
- **W-F4** `secret-injection`:`_FILE` pattern 與 secret file 機制。✅(W-F6 加 6th secret `acme_email`)
- **W-F5** `front-nginx`:既有 nginx config + reverse proxy 邏輯。✅(W-F6 加 443 server + prod variant)
- **W-F7** `port-mapping`:dev 拆檔機制 + OOS-011 明確 W-F6 接 prod 對外 port。✅

### Outbound(本 feature 解鎖)

- **prod 對外可達** — 主 compose 啟動後 11080 + 11443 暴露、HTTPS 可達(dev 自簽 cert 暫填、prod 部署時 swap acme issued cert)。
- **W-F6b** `acme-cert-acquisition`(後續):真實 DNS-01 / HTTP-01 challenge + cert issue + renew + DNS provider 拍板。
- **W-F11** `rust-horizontal-scaling`:獨立、可平行。
- **W-FA1** `nginx-track-a-transitional-block`:nestjs upstream(W-F6 nginx config 可順手預留 `include /etc/nginx/conf.d/track-*.inc;` 但屬 W-FA1 範疇、本 feature 不加)。

## Out of Scope

- **OOS-001**: acme.sh 實際 cert issue / renew — W-F6b。
- **OOS-002**: DNS provider 拍板(Cloudflare / Route53 / 其他)— W-F6b。
- **OOS-003**: DNS-01 vs HTTP-01 challenge mode 拍板 — W-F6b。
- **OOS-004**: Real domain server_name + cert subject 設定 — W-F6b(dev 用 localhost)。
- **OOS-005**: HSTS / OCSP stapling / TLSv1.2 disable / cipher 進階優化 — 後續 prod hardening。
- **OOS-006**: mkcert / 真正 CA chain trust — 後續 DX feature。
- **OOS-007**: Cert revocation / rotation runbook — W-F6b。
- **OOS-008**: nginx rate limiting / WAF — 後續 prod hardening。
- **OOS-009**: Track DESIGN-A `track-a.inc` / nestjs upstream — W-FA1。
- **OOS-010**: worktree(base-web / rust-api)source code 改動 — W-F6 純 outer。
- **OOS-011**: 加 IPv6 監聽(`listen 443 ssl; listen [::]:443 ssl;`)— 後續 DX 增強、現階段 IPv4-only 對齊 W-F7 既有設計。
