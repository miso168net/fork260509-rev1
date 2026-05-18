# Feature Specification: W-F6 — tls-cert-management

**Feature ID**: W-F6(per [`DESIGN-W-DEPLOYMENT`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11.1 Phase W-2 P2 — deploy 階段第三個 P2 feature)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `012-tls-cert-management`)
**Created**: 2026-05-18
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-18 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §4(反向代理 + TLS、§4.1 ~ §4.5)、§4.5(TLS cert 來源:prod Let's Encrypt + acme.sh / dev 自簽)、§6.1(對外 port:11443 HTTPS)、§6.3(prod 只暴露 front-nginx 11080 / 11443)、§11.1(W-F6 scope 描述)、§11.2(P2 依賴序 W-F5 → W-F6 → W-F7)、§11.3(Day 1 dev 部署形態含 W-F6 自簽)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(架構約束「TLS」:對外流量 MUST 走 TLS;prod 用 Let's Encrypt + acme.sh auto-renew;dev / staging 用自簽;HTTP only 僅限本機 dev — 開發流程「TLS 紀律」)
- [`CLAUDE.md`](../../CLAUDE.md) §5.2(rev1 提議 port 表:Web HTTPS `:11443` / Web HTTP→HTTPS redirect `:11080`)
- [`specs/010-front-nginx/`](../../specs/010-front-nginx/)(W-F5、既有 nginx config base — W-F6 加 443 server block + prod 80 redirect 變體;W-F5 的 80 server block dev 預設保留 serve)
- [`specs/011-port-mapping/`](../../specs/011-port-mapping/)(W-F7、OOS-011 明確指 W-F6 範疇接手「prod 主 compose 對外 host port」— 11080 + 11443 加進 W-F6)
- [`docker-compose.yml`](../../docker-compose.yml)(W-F7 後狀態、front-nginx internal-only;W-F6 加 host port + cert volume + acme service)
- [`docker-compose.dev.yml`](../../docker-compose.dev.yml)(W-F7 既有檔、W-F6 額外加 dev cert mount)

**Scope summary**:rev1 deploy Phase W **P2 第三個 feature**(W-F5 + W-F7 之後、per DESIGN-W §11.2)— **加 TLS 終止 + 對外 port 暴露 + prod cert lifecycle skeleton**。具體交付:

1. **主 `docker-compose.yml` 加對外 host port `11080:80` + `11443:443`**(per W-F7 OOS-011 解鎖 prod 對外可達)
2. **nginx config 加 `listen 443 ssl` server block**(對齊 DESIGN-W §4.2;`http2 on;` 取代 deprecated 寫法;TLSv1.2/1.3、HIGH ciphers、session cache)
3. **dev 自簽 cert 流程**:`deploy/generate-dev-cert.sh` openssl 腳本生成 `deploy/dev-certs/{fullchain,privkey}.pem`、`docker-compose.dev.yml` 額外 mount dev-certs 覆蓋 named volume
4. **prod nginx config variant**:`default.conf.prod` 內 80 server 改 redirect-only(`/.well-known/acme-challenge/` 例外保留 serve)、443 段與 dev 一字不差;`docker-compose.prod.yml` 新建 + override front-nginx mount source
5. **acme.sh skeleton service**(profile=prod、dev 不啟):進 compose、image 拉、`--version` sanity check;**實際 cert issue / renew 流程留 W-F6b**(需真實 domain + DNS provider)
6. **Cert path 統一** `/etc/nginx/certs/{fullchain,privkey}.pem`、nginx config 無 conditional — dev/prod 差別僅在「volume 內容怎麼來」(dev=host file mount;prod=acme.sh 寫 named volume)
7. **W-F4 secret 機制延伸**:`acme_email` secret + `_FILE` pattern(對齊既有 W-F4)

**範疇外**:acme.sh 實際 cert issue / renew(留 W-F6b)、DNS provider 拍板(Cloudflare / Route53 等)、Track DESIGN-A `track-a.inc`(W-FA1)、HSTS / OCSP stapling(後續可選)、rate limiting / WAF、cert rotation runbook、Track DESIGN-A nestjs upstream。**單段 commit**(只動 outer、不動 worktree)。

## Clarifications

### Session 2026-05-18(brainstorming 階段拍板、2 項)

- **Q1**: W-F6 範疇 — DESIGN-W §4.5 full(dev + prod acme.sh 都做)vs Split(只做 dev + prod 結構、acme.sh skeleton)vs Mid(dev + acme.sh skeleton 結構就位、不驗 cert acquisition)? → **A: Mid**(dev 自簽 + acme.sh skeleton 結構就位)。理由:dev 機無法 acceptance acme.sh 真實 challenge / renew 流程(需公網 + 真實 domain + DNS provider API),Full 是 deferred test 偽完整;但 acme.sh skeleton 結構(image / volume / secret / profile)可在 dev 機 sanity check、未來 prod 上線只需填 domain + DNS provider config + 跑 cert issue 命令、結構不必再開新 feature。代價接受:cert acquisition / renew 留 W-F6b、prod 部署時才完整測試。

- **Q2**: HTTP → HTTPS redirect 怎麼設?(dev host port 11080/11443、prod 80/443、nginx redirect target host 計算有差異)→ **A: Conditional**(dev 80 仍 serve、prod 80 才 redirect 443)。理由:W-F7 dev `http://127.0.0.1:11080/...` 流程已落地、user 累積投資;Strict 一律 redirect 會破壞此流程(`$host=127.0.0.1:11080` 在 redirect target 寫不出正確 port);Hybrid 用 envsubst 動態 port 過度複雜(entrypoint 注入 + nginx variable 雙層處理)。Conditional 透過「兩份 nginx config + prod override mount」實現、結構清晰、dev W-F7 流程零破壞、prod 完整守 Constitution「對外流量 MUST 走 TLS」。代價:多 1 個 `default.conf.prod` 檔(80 server 段差別、443 段共用)+ 多 1 個 `docker-compose.prod.yml` override 檔。

## User Scenarios & Testing *(mandatory)*

### US-1:Dev HTTPS 流程 + W-F7 HTTP 流程共存(Priority: P1)🎯 MVP

**Actor**:rev1 dev / 整合測試者
**Goal**:dev 機既能用 W-F7 既有 `http://127.0.0.1:11080/...` 流程、也能用 W-F6 新加的 `https://127.0.0.1:11443/...` 流程(自簽 cert、瀏覽器 warning 可接受、curl `-k` 忽略)
**Trigger**:operator 跑 dev 啟動命令 + 跑 `bash deploy/generate-dev-cert.sh` 生成自簽 cert
**Steps**:
1. operator 跑 `bash deploy/generate-dev-cert.sh` → `deploy/dev-certs/{fullchain,privkey}.pem` 生成
2. operator 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`
3. 6 service healthy(同 W-F7)
4. host 機 `curl -fsS http://127.0.0.1:11080/health` 回 `ok`(W-F7 既有 HTTP 流程不破)
5. host 機 `curl -kfsS https://127.0.0.1:11443/health` 回 `ok`(新加 HTTPS 流程)
6. host 機 `curl -kfsS -X POST -d '...' https://127.0.0.1:11443/api/auth/login` 回 200 + JWT
7.(可選人工)瀏覽器訪問 `https://127.0.0.1:11443` → cert warning → 接受 → 看 SPA、login work
8. `openssl s_client -connect 127.0.0.1:11443 -servername localhost </dev/null` 看 cert subject = `CN=localhost`、SAN 含 `DNS:localhost,IP:127.0.0.1`

**Acceptance**:步驟 4-8 全成功。

### US-2:Prod baseline 啟動 80 強制 redirect 443(Priority: P2)

**Actor**:prod 部署者(模擬:dev 機跑 prod baseline 命令、cert 用 dev 自簽暫填)
**Goal**:確認 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`(不帶 dev 檔)起來後、80 server 強制 301 redirect 到 443、`/.well-known/acme-challenge/` 例外保留 80 serve(留給未來 acme.sh HTTP-01 challenge 用)
**Trigger**:operator 切到 prod baseline 命令
**Steps**:
1. operator 預先把 dev 自簽 cert 內容塞進 `front_nginx_certs` named volume(如 `docker run --rm -v rev1-admin_front_nginx_certs:/certs -v $PWD/deploy/dev-certs:/src alpine cp /src/fullchain.pem /src/privkey.pem /certs/`)— prod 模擬流程
2. operator 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans`(清 dev)
3. 跑 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait`(無 `--profile prod`、不啟 acme)
4. 6 service healthy
5. host 機 `curl -fsSI http://127.0.0.1:11080/health` → 預期 HTTP 301 + Location `https://127.0.0.1/health`(不要 follow `-L`、看 redirect 本身)
6. host 機 `curl -fsSI http://127.0.0.1:11080/.well-known/acme-challenge/test` → 預期 HTTP 404(`location ^~ /.well-known/acme-challenge/` 沒被 redirect 攔、進 root 找不到檔案返 404)
7. host 機 `curl -kfsS https://127.0.0.1:11443/health` → `ok`

**Acceptance**:步驟 5(301 + Location 正確)、步驟 6(404 而非 301)、步驟 7(443 work)全 PASS。

### US-3:Acme skeleton sanity(Priority: P3)

**Actor**:prod 預部署 dry-run 驗證者
**Goal**:`--profile prod` 啟用 acme.sh container 後做 image / secret / mount sanity(實際 cert 流程留 W-F6b)
**Trigger**:operator 用 prod compose + `--profile prod`
**Steps**:
1. operator 預備 `deploy/secrets/acme_email.txt`(`cp .example` + 填值)
2. `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait`
3. 預期 7 service healthy(6 既有 + acme container running)
4. `docker compose exec acme acme.sh --version` → 印版本字串(image 拉到、binary 可呼叫)
5. `docker compose exec acme cat /run/secrets/acme_email` → 印 email content(W-F4 secret `_FILE` pattern work)
6. `docker compose exec acme ls /acme.sh` → 看 acme.sh state dir、空目錄或有 acme.sh 預設檔(屬 named volume `front_nginx_certs`)

**Acceptance**:步驟 4-6 全成功;**不**測試實際 cert acquisition(deferred W-F6b)。

### Edge Cases

| # | 情境 | 對策 |
|---|---|---|
| E-1 | dev 沒跑 `generate-dev-cert.sh` 直接 dev up | nginx 443 server block 啟動 fail(`ssl_certificate` file not found)、front-nginx healthcheck fail。對策:quickstart 把 cert 生成排在 dev up 前;若 dev compose `--wait` exit 非 0、提示 user 跑 cert script |
| E-2 | 自簽 cert subject 不含 `IP:127.0.0.1` SAN | `curl --resolve` 或瀏覽器訪 `127.0.0.1` 報 cert mismatch。對策:`generate-dev-cert.sh` 用 `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`、SAN 同時含兩者 |
| E-3 | dev cert 過期(365 天後) | nginx 仍能 serve(自簽不 validate chain、瀏覽器 warning 強化)。對策:每年重跑 `generate-dev-cert.sh` 即可;cert 過期紀錄不在 audit 範疇 |
| E-4 | prod baseline 啟動但 cert volume 沒填 | nginx 443 server 啟動 fail。對策:`docker-compose.prod.yml` 文檔說明 — 啟用前必先把 cert 放進 named volume(staging 場景 dev 自簽 cert,prod 場景 acme.sh issue) |
| E-5 | acme.sh container 啟動但 acme_email secret 沒填 | `acme.sh --register-account` 階段會報缺 email。對策:`acme_email.txt.example` template 含 `admin@example.com` placeholder、提示 prod 部署前必改 |
| E-6 | dev 同時 mount named volume + dev-certs(後者 wins?)| 同 container path 兩個 volume mount,docker compose 行為:後加 wins(亦或 error,需驗)。對策:implement 階段 T1 跑 `docker compose -f -f config` 渲染確認 dev mount 順序 |
| E-7 | dev `curl http://127.0.0.1:11080/health` 仍 work 但 nginx config 改動意外把 80 server block 改 redirect | 違反 Conditional 拍板。對策:dev/prod 兩份 default.conf 嚴格區分、prod override 透過 mount 切換、dev config 永不含 redirect logic |

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 主 `docker-compose.yml` MUST 為 `front-nginx` service 加 `ports:` 區段含 `"11080:80"` + `"11443:443"`(對外 host port 預設暴露、binding 預設 `0.0.0.0`— prod 場景需 LAN/公網可達)。
- **FR-002**: 主 `docker-compose.yml` MUST 加 named volume `front_nginx_certs`、mount 進 front-nginx `/etc/nginx/certs:ro`、提供 cert 給 443 server 用。
- **FR-003**: 主 `docker-compose.yml` MUST 加 `acme` service(image `neilpang/acme.sh:latest`、`profiles: ["prod"]`、mount `front_nginx_certs:/acme.sh`)、預設 dev 不啟動。
- **FR-004**: 主 `docker-compose.yml` MUST 加 `acme_email` secret(對齊 W-F4 `_FILE` pattern、file path `./deploy/secrets/acme_email.txt`)、acme service `environment: ACME_EMAIL_FILE=/run/secrets/acme_email`。
- **FR-005**: `deploy/secrets/acme_email.txt.example` MUST 新建(W-F4 template 模式)、含 placeholder + 註解。
- **FR-006**: `deploy/generate-dev-cert.sh` MUST 新建、openssl 自簽 RSA 4096、`CN=localhost`、SAN 含 `DNS:localhost,IP:127.0.0.1`、365 天有效、輸出至 `deploy/dev-certs/`、shebang `#!/bin/sh`(POSIX 兼容)。
- **FR-007**: `deploy/dev-certs/` dir MUST 新建(.gitkeep 或 README.md 佔位、`*.pem` 透過 `.gitignore` 排除)。
- **FR-008**: `deploy/front-nginx/conf.d/default.conf` MUST 改為含 80 server block(W-F5 既有、dev 預設 serve)+ 443 server block(W-F6 新增、ssl 配置 + 同樣 location 結構)。
- **FR-009**: `deploy/front-nginx/conf.d/default.conf.prod` MUST 新建,80 server block 改 redirect-only(`return 301 https://$host$request_uri;`)、保留 `location ^~ /.well-known/acme-challenge/`(留 acme.sh HTTP-01 challenge 用)、443 server block 與 default.conf 完全相同。
- **FR-010**: `deploy/front-nginx/snippets/proxy_headers.inc` MUST 新建,含 5 個 `proxy_set_header`(Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto / X-Request-ID)+ `proxy_read_timeout 60s`,讓 80 / 443 location `/api/` 共用、避免 DRY 違反。
- **FR-011**: `docker-compose.dev.yml`(W-F7 既有)MUST 加 mount `./deploy/dev-certs:/etc/nginx/certs:ro`(覆蓋主 compose `front_nginx_certs` named volume mount — 同 container path、後者 wins、需 implement 階段驗 docker compose merge 行為)。
- **FR-012**: `docker-compose.prod.yml` MUST 新建、override front-nginx 加 mount `./deploy/front-nginx/conf.d/default.conf.prod:/etc/nginx/conf.d/default.conf:ro`(替換主 compose 預設 mount 的 default.conf)。
- **FR-013**: `.gitignore` MUST 加排除 `deploy/dev-certs/*.pem` + `deploy/secrets/acme_email.txt`(對齊 W-F4 既有 secret gitignore 模式)。
- **FR-014**: nginx 443 server MUST `listen 443 ssl;` + `http2 on;`(nginx ≥ 1.25 寫法)、`ssl_protocols TLSv1.2 TLSv1.3`、`ssl_ciphers HIGH:!aNULL:!MD5`、`ssl_session_cache shared:SSL:10m`、`ssl_session_timeout 10m`。
- **FR-015**: nginx 443 server 內 location 結構 MUST 與 80 server 一字不差(`= /health` + `/api/` + `/`),透過 `include /etc/nginx/snippets/proxy_headers.inc` 共用 5 header 邏輯。
- **FR-016**: dev 啟動命令 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 後 6 service 全 healthy + W-F7 既有 HTTP 流程(`curl http://127.0.0.1:11080/health` → `ok`)MUST 仍 work(零 regression)+ HTTPS 流程(`curl -k https://127.0.0.1:11443/health` → `ok`)亦 work。
- **FR-017**: prod baseline 啟動命令 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait`(不帶 `--profile prod`、預先把 cert 放進 named volume)後 6 service healthy + `curl -fsSI http://127.0.0.1:11080/health` 回 301 Location https + `curl -kfsS https://127.0.0.1:11443/health` 回 ok。
- **FR-018**: prod + acme 啟動命令 `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait` 後 7 service running(含 acme container)+ `docker compose exec acme acme.sh --version` 印版本 + `docker compose exec acme cat /run/secrets/acme_email` 印 email content。
- **FR-019**: 本 feature MUST 為 **單段 commit**(只動 outer、不動 worktree base-web / rust-api)— 對齊 W-F7 模式。
- **FR-020**: CLAUDE.md §5.2 MUST 更新「目前現況」段反映 W-F6 落地(11080 HTTP + 11443 HTTPS 已暴露、dev 自簽流程、prod redirect + acme skeleton)、§5.2.1「dev 啟動命令範例」加 cert script 生成步驟 + HTTPS 驗證命令。
- **FR-021**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新 W-F6 row ✅ + Current Focus 進度 3/4 + 已完成里程碑加 W-F6 條目。

### Non-Functional Requirements

- **NFR-001**: 改動 / 新建檔案總數 ≤ 12 個(實際估 11 個:主 compose + dev.yml 改 + prod.yml 新 + default.conf 改 + default.conf.prod 新 + snippets/proxy_headers.inc 新 + generate-dev-cert.sh 新 + dev-certs/ dir + acme_email.txt.example 新 + .gitignore 改 + CLAUDE.md / INTEGRATION-CHECKLIST.md 改)。
- **NFR-002**: dev cert 生成腳本執行時間 ≤ 5 秒(openssl RSA 4096 在 dev 機 < 3 秒)。
- **NFR-003**: dev `docker compose up --wait` 啟動延遲與 W-F7 baseline 比較增幅 ≤ 10%(加 1 server block + cert mount;預估 +1-3 秒、可接受)。
- **NFR-004**: prod TLS handshake 延遲 ≤ 100ms(dev 機 loopback、`openssl s_client` 量、自簽 cert)。
- **NFR-005**: nginx config 兩份(default.conf + default.conf.prod)diff 行數 ≤ 15(僅 80 server block 差別、443 段完全相同)— 避免重複維護。

### Key Entities

- **`deploy/front-nginx/conf.d/default.conf`(W-F5 既有、W-F6 改)**:dev 預設配置、80 server 仍 serve + 加 443 ssl server。
- **`deploy/front-nginx/conf.d/default.conf.prod`(W-F6 新建)**:prod variant、80 server 改 redirect-only(保 `/.well-known/`)+ 443 ssl server(同 dev 一字不差)。
- **`deploy/front-nginx/snippets/proxy_headers.inc`(W-F6 新建)**:5 個 proxy header + timeout、80 / 443 location `/api/` 共用。
- **`deploy/generate-dev-cert.sh`(W-F6 新建)**:openssl 自簽 cert 生成腳本、輸出 `deploy/dev-certs/{fullchain,privkey}.pem`。
- **`deploy/dev-certs/`(W-F6 新建 dir、tracked README.md / gitignored `*.pem`)**:dev 自簽 cert 存放、host file mount 進 dev front-nginx。
- **`docker-compose.yml`(W-F7 既有檔、W-F6 改)**:加 front-nginx ports + cert volume mount;加 acme service(profile=prod);加 acme_email secret + named volume `front_nginx_certs`。
- **`docker-compose.dev.yml`(W-F7 既有檔、W-F6 改)**:額外 mount dev-certs 覆蓋 named volume。
- **`docker-compose.prod.yml`(W-F6 新建)**:override front-nginx mount default.conf.prod 替換 default.conf。
- **`deploy/secrets/acme_email.txt.example`(W-F6 新建)**:對齊 W-F4 既有 5 個 `.txt.example` 模式。
- **`CLAUDE.md` §5.2(既有檔、改)**:文檔化 dev cert 生成 + HTTPS 驗證 + 3 種啟動模式對照。
- **`docs/INTEGRATION-CHECKLIST.md`(既有檔、改)**:W-F6 ✅ + P2 進度 3/4 + 已完成里程碑條目。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: dev 啟動命令執行後 90 秒內、6 service 全 healthy(`docker compose -f -f up --wait` exit 0、W-F7 baseline 60-75s + W-F6 額外 ssl + cert mount overhead ≤ 30s)。
- **SC-002**: dev HTTPS / HTTP 雙流程 100% work(curl `http://...11080/health` → ok + curl `-k https://...11443/health` → ok,4 個 endpoint 各驗 / 即 8/8 PASS)。
- **SC-003**: prod baseline 80 強制 redirect 100%(`curl -fsSI http://...11080/<path>` 全回 301 Location https、`/.well-known/acme-challenge/` 例外回非 301)。
- **SC-004**: 自簽 cert SAN 含 `DNS:localhost` + `IP:127.0.0.1`(openssl s_client subject 驗、缺一個 = FAIL)。
- **SC-005**: nginx config 兩份檔 80 server block diff ≤ 15 行、443 server block diff = 0(嚴守 DRY、避免 prod-only 重複維護)。
- **SC-006**: 3 種啟動模式(dev / prod baseline / prod + acme)切換無 stack rebuild + 步驟 ≤ 3 命令(per US-2 step 1-2 + US-3 step 2)。
- **SC-007**: acme.sh `--version` + `cat /run/secrets/acme_email` 都成功(image / secret skeleton work、實際 issue 流程留 W-F6b)。

## Assumptions

- **A-001**: dev 機 docker compose v2.x 支援 service `profiles:` 機制(per W-F4 secret + W-F7 merge 都已驗、profiles 是 v2.x 標準)。
- **A-002**: docker compose v2.x volume mount 同 container path 多個來源時、**override 檔的 mount 後加 wins**(覆蓋主 compose);本 feature 在 dev mode 依賴此行為(dev-certs file mount 覆蓋 named volume)。若實際是 error,須改設計(可能 dev 主 compose 直接不加 named volume mount、改在 prod override 加)。**E-6 處理**。
- **A-003**: nginx 1.27-alpine image(W-F5 既有)支援 `http2 on;` directive(nginx ≥ 1.25 寫法)— 已驗 1.27 含。
- **A-004**: dev 機 openssl 可用(POSIX 標準、git bash / WSL / 純 Linux 都有)— `generate-dev-cert.sh` 不裝額外依賴。
- **A-005**: operator 接受 dev 自簽 cert 瀏覽器 warning(curl `-k` 跳過 verify、瀏覽器手動接受 + 可選 import 進 system trust store)— 不在 W-F6 範疇做 mkcert / 真正 CA trust chain。
- **A-006**: prod 部署時(後續 W-F6b)operator 會:(a)填真實 domain 進 nginx server_name(目前是 `_` 通配)、(b)拍板 DNS provider + 填 acme.sh DNS API creds 進 `deploy/acme-config/`、(c)第一次手動跑 `acme.sh --issue --dns dns_<provider> -d <domain>` issue cert。
- **A-007**: W-F7 既有 dev `http://127.0.0.1:11080/...` 流程持續 work(不破)— 本 feature 在 dev mode 嚴格保留 80 server serve、不引入 redirect。
- **A-008**: acme.sh skeleton 跑 daemon 但無 cert config 時不會 crash loop(daemon idle 等待 trigger;若 crash 則 sanity check fail、E-5 提示 user)。

## Dependencies

### Inbound(本 feature 依賴)

- **W-F3** `compose-base-structure`:主 docker-compose.yml 6 service 結構穩定。✅
- **W-F4** `secret-injection`:`_FILE` pattern 與 `deploy/secrets/*.txt` 機制。✅ — W-F6 加 6th secret `acme_email`。
- **W-F5** `front-nginx`:既有 nginx config + reverse proxy 邏輯。✅ — W-F6 加 443 server block + prod variant。
- **W-F7** `port-mapping`:dev 拆檔機制 + OOS-011 明確 W-F6 範疇接 prod 主 compose 對外 port。✅

### Outbound(本 feature 解鎖)

- **prod 對外可達**:主 compose 啟動後 11080 + 11443 暴露、HTTPS 可達(用 dev 自簽 cert 暫填) — 解鎖未來 prod VPS 部署(W-F6b acme.sh 真實 issue 啟動)。
- **W-F6b** `acme-cert-acquisition`(後續):acme.sh 真實 DNS-01 challenge / cert issue / renew + DNS provider 拍板。
- **W-F11** `rust-horizontal-scaling`:獨立、可平行。
- **W-FA1** `nginx-track-a-transitional-block`:nestjs upstream + `track-a.inc`;W-F6 nginx config 已有 `include /etc/nginx/conf.d/track-*.inc;` 預留(若 W-F5 沒做、W-F6 順手補)。

## Out of Scope(per Q1 / Q2 拍板 + DESIGN-W 邊界)

- **OOS-001**: acme.sh 實際 cert issue / renew 流程 — W-F6b。
- **OOS-002**: DNS provider 拍板(Cloudflare / Route53 / 其他)— W-F6b、prod 部署時拍板。
- **OOS-003**: DNS-01 vs HTTP-01 challenge mode 拍板 — W-F6b(推薦 DNS-01、無需 80 端公網可達)。
- **OOS-004**: Real domain server_name + cert subject 設定 — W-F6b(dev 用 localhost 即可)。
- **OOS-005**: HSTS / OCSP stapling / TLSv1.2 disable / cipher suite 進階優化 — 後續 prod hardening feature。
- **OOS-006**: mkcert / 真正 CA chain trust(dev cert auto-trust browser 系統)— 後續 dev DX feature、user 自簽 + 手動接受 warning 就夠。
- **OOS-007**: Cert revocation runbook / rotation procedure — W-F6b。
- **OOS-008**: nginx rate limiting / WAF — 後續 prod hardening。
- **OOS-009**: Track DESIGN-A `track-a.inc` / nestjs upstream — W-FA1 範疇。
- **OOS-010**: worktree(base-web / rust-api)source code 改動 — W-F6 純 outer 變動。

---

## Decisions Log

| 決策 | 拍板於 | Source |
|---|---|---|
| 範疇:Mid(dev + acme skeleton) | 2026-05-18 brainstorm Q1 | DESIGN-W §4.5 split 可行性 + dev 機 acme test 不可行 |
| Redirect:Conditional(dev 80 仍 serve、prod redirect) | 2026-05-18 brainstorm Q2 | W-F7 既有 HTTP 流程零破壞 + Constitution prod TLS 紀律 |
| Cert path 統一 `/etc/nginx/certs/` | 自然推論 | nginx config 無 conditional、dev/prod 共用 443 段 |
| 兩份 nginx config(default.conf + default.conf.prod) | 自然推論 | Conditional 拍板必然 — 兩 80 server 行為差 |
| acme service profile=prod 預設不啟 | 自然推論 | Q1 Mid 拍板、dev 機 sanity check 用 `--profile prod` 顯式啟 |
| 80 redirect 保留 `/.well-known/acme-challenge/` | 自然推論 | Let's Encrypt HTTP-01 challenge 預留(即使 W-F6 用 DNS-01) |
| 對外 binding 預設 `0.0.0.0`(非 127.0.0.1) | 自然推論 | prod 必須對外(VPS / domain reachable);W-F7 dev 127.0.0.1 binding 不適用 prod 場景 |

---

## Open Questions(留 /speckit-plan 階段解)

- **OQ-1**: docker compose v2.x volume mount 衝突行為實測 — dev-certs file mount + named volume mount 同 container path 是 override(後者 wins)還是 error?implement 階段 T1 `docker compose config` 確認、若 error 則改設計(主 compose 不加 cert mount、由 dev.yml + prod.yml 各自加)。
- **OQ-2**: 自簽 cert subject 是否補 `O=rev1 dev` / `OU=` 等 organisation info?目前只 `CN=localhost`、實用即可、不缺。
- **OQ-3**: `deploy/dev-certs/` 是否要 `README.md` 文檔化 cert gen 步驟?還是 inline 在 `generate-dev-cert.sh` 內 echo 即可?

---

**Brainstorm session 結束、產出 spec 草稿**。下一步:`/speckit-specify` 將本檔轉為 `specs/012-tls-cert-management/spec.md` 正式 feature spec。
