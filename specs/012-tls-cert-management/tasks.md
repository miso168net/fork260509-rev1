---
description: "Task list for W-F6 tls-cert-management(TLS + 對外 port + prod cert skeleton)implementation"
---

# Tasks: W-F6 — tls-cert-management(TLS + 對外 port + prod cert skeleton)

**Input**: Design documents from `/specs/012-tls-cert-management/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/nginx-config-structure.md`](contracts/nginx-config-structure.md) ✓ / [`contracts/cert-lifecycle.md`](contracts/cert-lifecycle.md) ✓ / [`contracts/compose-overlay-merge.md`](contracts/compose-overlay-merge.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- **No rust unit test**(W-F6 純 yaml + nginx config + shell script feature)
- **Compose syntax + merge**(3 種 -f 組合):`docker compose -f -f config`(per C-V16)
- **Cert SAN**:`openssl x509 -ext subjectAltName`(per C-V7)
- **nginx -t**:syntax check(per C-N9)
- **Acceptance**:US1 7 scenario + US2 4 scenario + US3 4 scenario = 15 個

**Organization**:W-F6 為 3 個 user story feature(P1 dev HTTPS+HTTP / P2 prod redirect / P3 acme skeleton)。Setup(6)+ Foundational(5)+ US1 impl + acceptance(15)+ US2 acceptance(5)+ US3 acceptance(6)+ Doc(3)+ Polish(3)= ~43 task。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令 / 獨立 grep)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(全 W-F6 範疇、不動 worktree)

## Path Conventions

- **Outer (012-tls-cert-management feature branch)**:
  - 新建:`deploy/generate-dev-cert.sh` / `deploy/dev-certs/README.md` / `deploy/front-nginx/conf.d/default.conf.prod` / `deploy/front-nginx/snippets/proxy_headers.inc` / `deploy/secrets/acme_email.txt.example` / `docker-compose.prod.yml`
  - 修改:`docker-compose.yml` / `docker-compose.dev.yml` / `deploy/front-nginx/conf.d/default.conf` / `.gitignore` / `CLAUDE.md` / `docs/INTEGRATION-CHECKLIST.md`
  - spec docs:`specs/012-tls-cert-management/`(已產出)
- **Acceptance test 執行**:outer repo root
- **worktree 0 改動**:`base-web/` / `rust-api/` 全程不動

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch 為 `012-tls-cert-management`,執行 `git branch --show-current && git status --short`(預期 branch=012-tls-cert-management、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified;無 worktree 改動)
- [ ] T002 [P] 確認 docker compose v2+,執行 `docker compose version`(預期 v2.x.x)
- [ ] T003 [P] 確認 host 機 openssl 可用,執行 `openssl version`(預期 OpenSSL 1.1+ 或 3.x)
- [ ] T004 [P] 確認 W-F7 既有 stack 可乾淨啟停,先 `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans` 清乾淨(預期無 container)
- [ ] T005 [P] 確認 host 機 11080/11081/11443/15432/16379 全無既有 listener,執行 `ss -tlnp 2>/dev/null | grep -E ':(11080|11081|11443|15432|16379)\b'`(預期無輸出;若有衝突依 quickstart §6 處理)
- [ ] T006 [P] 確認 `deploy/secrets/` W-F4 既有 5 個 secret 已備,執行 `ls deploy/secrets/*.txt | wc -l`(預期 ≥ 5,排除 `.example`)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:W-F5 + W-F7 baseline sanity + 確認既有 nginx config / 主 compose 結構為 W-F6 修改起點。

- [ ] T010 讀 `docker-compose.yml` 找 front-nginx service 段位置 + 確認 W-F7 後仍無 ports 區段(per C-M1);記下 acme service 插入點(建議在 `front-nginx:` 段之後、`base-web:` 之前 或 統一 services 末尾)
- [ ] T011 [P] 讀 `deploy/front-nginx/conf.d/default.conf`(W-F5 既有 ~50 行),記下 80 server block 範圍 + 5 個 proxy header inline 位置(將被抽到 snippet);驗 `grep -c "^server {" default.conf`(預期 1)
- [ ] T012 [P] 讀 `docker-compose.dev.yml`(W-F7 既有),記下 front-nginx ports 區段現狀(預期含 `127.0.0.1:11080:80`);W-F6 將 append `127.0.0.1:11443:443` + 加 `volumes:` 區段
- [ ] T013 [P] 確認 `.gitignore` 既有 W-F4 secret 排除規則(`deploy/secrets/*.txt` + `!deploy/secrets/*.txt.example`)、W-F6 將加 `deploy/dev-certs/*.pem`
- [ ] T014 W-F7 baseline 起 stack(可選、快速 sanity):`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait && docker compose ps && docker compose down --remove-orphans`(預期 6 service healthy、down 後乾淨;不留 stack 給 US1 用)

---

## Phase 3: User Story 1 — Dev HTTPS + W-F7 HTTP 流程共存(Priority: P1)🎯 MVP

**Goal**:dev cert script 生成 + 主 compose 加 cert volume / acme skeleton / secret + dev.yml 加 11443 + dev-certs mount + nginx config 加 443 server + snippet + dev 啟動 6 service healthy + 7 個 host acceptance scenario 全 PASS。

**Independent Test**:`bash generate-dev-cert.sh` + `docker compose -f -f dev.yml up -d --wait` + 7 個 curl/openssl 命令 — 不依賴 US2/US3 任何工作。

### Cert + 文件層(4 task)

- [ ] T020 [US1] 新建 `deploy/generate-dev-cert.sh`(per data-model E7 + FR-006 + C-C5/C-C6):POSIX shebang、`openssl req -x509 -newkey rsa:4096 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -days 365`、輸出至 `deploy/dev-certs/{fullchain,privkey}.pem`、`chmod 600 privkey.pem` + `644 fullchain.pem`、結束印操作指引;**檔案 perm 設 755**(`chmod +x deploy/generate-dev-cert.sh`)
- [ ] T021 [US1] [P] 新建 `deploy/dev-certs/README.md`(per data-model E8):說明本目錄存放 dev 自簽 cert + 操作指令 + 與 docker-compose.dev.yml mount 對應關係 + 範疇邊界(prod cert 由 W-F6b 落地);本檔 tracked
- [ ] T022 [US1] [P] 新建 `deploy/secrets/acme_email.txt.example`(per data-model E9 + FR-005):W-F4 template 模式、含 placeholder `admin@example.com` + 註解警告(prod 啟用前必改)
- [ ] T023 [US1] [P] 改 `.gitignore`(per data-model E10 + FR-014):加排除 `deploy/dev-certs/*.pem`(W-F4 既有 `deploy/secrets/*.txt` 已涵蓋 acme_email.txt、不需另加)

### 主 compose 改動(per E1 + C-M1/C-M7/C-M9 — 3 task)

- [ ] T024 [US1] 改 `docker-compose.yml` 加 named volume `front_nginx_certs`(per FR-002 + C-M7):在 `volumes:` top-level 加 `front_nginx_certs: {}`(空配置、預設 local driver)
- [ ] T025 [US1] 改 `docker-compose.yml` 加 acme service(per FR-003 + C-M6):整段 service block 含 `image: neilpang/acme.sh:latest`、`profiles: ["prod"]`、`command: ["daemon"]`、`volumes: [front_nginx_certs:/acme.sh]`、`environment: [ACME_EMAIL_FILE=/run/secrets/acme_email]`、`secrets: [acme_email]`、`restart: unless-stopped`
- [ ] T026 [US1] 改 `docker-compose.yml` 加 acme_email secret(per FR-004 + C-M9)+ front-nginx cert volume mount(per FR-002 + C-M4):`secrets:` top-level 加 `acme_email: { file: ./deploy/secrets/acme_email.txt }`;`front-nginx.volumes` 加 `- front_nginx_certs:/etc/nginx/certs:ro`(W-F7 既有 conf.d mount 保留);**front-nginx 仍無 ports**(per C-M1 + FR-001)

### snippets + default.conf 改動(per E4 + E6 + C-N4/C-N7/C-N8 — 3 task)

- [ ] T027 [US1] [P] 新建 `deploy/front-nginx/snippets/proxy_headers.inc`(per data-model E6 + FR-010 + C-N8):6 行 — 5 個 `proxy_set_header`(Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto / X-Request-ID)+ `proxy_read_timeout 60s;`;與 W-F5 既有內聯 5 header 對齊(per `default.conf` line ~30-40)
- [ ] T028 [US1] 改 `deploy/front-nginx/conf.d/default.conf` 加 443 server block(per data-model E4 + FR-008 + C-N4/C-N5/C-N6):
  - 在既有 80 server 之後加新 server block:`listen 443 ssl;` + `http2 on;` + `server_name _;` + `ssl_certificate /etc/nginx/certs/fullchain.pem;` + `ssl_certificate_key /etc/nginx/certs/privkey.pem;` + `ssl_protocols TLSv1.2 TLSv1.3;` + `ssl_ciphers HIGH:!aNULL:!MD5;` + `ssl_session_cache shared:SSL:10m;` + `ssl_session_timeout 10m;`
  - 443 server 內 3 個 location 與 80 server 一字不差(`= /health` + `/api/` + `/`)、共用 `include /etc/nginx/snippets/proxy_headers.inc;` snippet
- [ ] T029 [US1] [P] 改 `deploy/front-nginx/conf.d/default.conf` 80 server 內 `location /api/` 從**內聯 5 header** 改為 `include /etc/nginx/snippets/proxy_headers.inc;`(per C-N7 DRY + 與 443 server 一致)— 注意保留 W-F5 既有路由邏輯
- [ ] T030 [US1] 改 `docker-compose.yml` front-nginx 加 snippets dir mount(per C-N7 snippet 載入機制):`front-nginx.volumes` 加 `- ./deploy/front-nginx/snippets:/etc/nginx/snippets:ro`

### dev.yml 改動(per E2 + C-M2/C-M4 — 1 task)

- [ ] T031 [US1] 改 `docker-compose.dev.yml` 加 front-nginx 11443 ports + dev-certs mount(per FR-012 + C-M2 + C-M4):
  - `front-nginx.ports` 在既有 `127.0.0.1:11080:80` 之後加 `127.0.0.1:11443:443`
  - `front-nginx.volumes` 加 `./deploy/dev-certs:/etc/nginx/certs:ro`(覆蓋主 compose `front_nginx_certs` mount)

### 靜態驗(2 task)

- [ ] T032 [US1] [P] 跑 cert script + 驗 SAN(per C-V1 + C-V7 + FR-006):
  ```bash
  bash deploy/generate-dev-cert.sh
  ls -la deploy/dev-certs/*.pem  # 預期 2 檔、privkey 600 / fullchain 644
  openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName
  # 預期含:DNS:localhost, IP Address:127.0.0.1
  openssl x509 -in deploy/dev-certs/fullchain.pem -noout -subject -dates
  # 預期:subject=CN=localhost、365 天有效
  ```
- [ ] T033 [US1] [P] 跑 yaml render 驗(per FR-010 + C-V16):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml config > /dev/null && echo "dev yaml OK"
  docker compose -f docker-compose.yml -f docker-compose.dev.yml config | yq '.services.front-nginx.ports'
  # 預期:[127.0.0.1:11080:80, 127.0.0.1:11443:443]
  docker compose -f docker-compose.yml -f docker-compose.dev.yml config | yq '.services.front-nginx.volumes[] | select(.target == "/etc/nginx/certs")'
  # 預期:single bind mount、source 含 dev-certs(per C-M4)
  ```

### Dev 啟動 + 7 acceptance scenario(US1.1 ~ US1.7)

- [ ] T034 [US1] **AC US1.2** dev stack up + 6 service healthy(per C-V2):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  docker compose ps
  # 預期:60-90s 內 6 service healthy(等同 W-F7 + ssl/cert overhead)
  ```
- [ ] T035 [US1] [P] **AC US1.3** dev HTTP /health(W-F7 不破、per C-V3):
  ```bash
  curl -fsS http://127.0.0.1:11080/health
  # 預期:ok
  ```
- [ ] T036 [US1] [P] **AC US1.4** dev HTTPS /health(per C-V4):
  ```bash
  curl -kfsS https://127.0.0.1:11443/health
  # 預期:ok
  ```
- [ ] T037 [US1] [P] **AC US1.5** dev HTTPS login e2e(per C-V5):
  ```bash
  curl -kfsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    https://127.0.0.1:11443/api/auth/login
  # 預期:exit 0 + JSON 含 token
  ```
- [ ] T038 [US1] [P] **AC US1.6** TLS handshake + protocol 驗(per C-V6):
  ```bash
  openssl s_client -connect 127.0.0.1:11443 -servername localhost </dev/null 2>&1 | \
    grep -E "subject=|Protocol|Cipher" | head -5
  # 預期:subject=CN=localhost + Protocol TLSv1.3(或 1.2)+ 有 Cipher
  ```
- [ ] T039 [US1] [P] **AC US1.1** cert script 已驗(T032 完成)— 標 ✓
- [ ] T040 [US1] [P] **AC US1.7** cert SAN 已驗(T032 完成)— 標 ✓
- [ ] T041 [US1] [P] **補強驗 nginx -t**(per C-N9):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml exec front-nginx nginx -t
  # 預期:nginx: ... syntax is ok / test is successful;無 deprecated warning
  ```

**Checkpoint**:US1 完成 — dev HTTPS + HTTP 雙流程 work、W-F7 既有不破、TLS 結構落地。

---

## Phase 4: User Story 2 — Prod baseline 80 強制 redirect 443(Priority: P2)

**Goal**:新建 prod.yml + default.conf.prod、把 dev cert seed 進 named volume 模擬 prod、啟 prod baseline 6 service healthy、4 個 acceptance scenario PASS。

**Independent Test**:依賴 US1 已建 dev cert(用於 seed);其他純驗 prod.yml + default.conf.prod 邏輯。

### artifact 新建(2 task)

- [ ] T045 [US2] 新建 `deploy/front-nginx/conf.d/default.conf.prod`(per data-model E5 + FR-011 + FR-009 + C-N3):
  - upstream 區段 2 行與 default.conf 一字不差(per C-N1)
  - 80 server block 改 redirect-only:`location ^~ /.well-known/acme-challenge/ { root /var/www/acme-challenge; }` 例外 + `location / { return 301 https://$host$request_uri; }`
  - 443 server block 與 default.conf 443 段一字不差(per C-N4、include snippet 共用)
- [ ] T046 [US2] [P] 新建 `docker-compose.prod.yml`(per data-model E3 + FR-013 + C-M3 + C-M5):
  - `services.front-nginx.ports`:`["11080:80", "11443:443"]`(short syntax = 0.0.0.0)
  - `services.front-nginx.volumes` 加 `- ./deploy/front-nginx/conf.d/default.conf.prod:/etc/nginx/conf.d/default.conf:ro`(覆蓋主 compose 預設 default.conf mount)
  - 檔頂部 5-6 行註解(用法 / binding 0.0.0.0 / redirect 行為 / acme profile=prod 才啟)

### 靜態 + render 驗(2 task)

- [ ] T047 [US2] [P] nginx config dev/prod diff 驗(per C-N1 + C-N4 + SC-005):
  ```bash
  # upstream 一字不差
  diff <(sed -n '/^upstream/,/^}/p' deploy/front-nginx/conf.d/default.conf) \
       <(sed -n '/^upstream/,/^}/p' deploy/front-nginx/conf.d/default.conf.prod)
  # 預期無輸出

  # 443 段一字不差(實作技巧:抽出 listen 443 起到 } 為止)
  awk '/listen 443/,/^}$/' deploy/front-nginx/conf.d/default.conf      > /tmp/443-dev.txt
  awk '/listen 443/,/^}$/' deploy/front-nginx/conf.d/default.conf.prod > /tmp/443-prod.txt
  diff /tmp/443-dev.txt /tmp/443-prod.txt
  # 預期無輸出
  ```
- [ ] T048 [US2] [P] prod yaml render 驗(per C-V16):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml config > /dev/null && echo "prod yaml OK"
  docker compose -f docker-compose.yml -f docker-compose.prod.yml config | yq '.services.front-nginx.ports'
  # 預期:[11080:80, 11443:443]
  docker compose -f docker-compose.yml -f docker-compose.prod.yml config | yq '.services.front-nginx.volumes[] | select(.target | contains("default.conf"))'
  # 預期:single entry、source 含 default.conf.prod
  ```

### Prod baseline cert seed + 啟動(3 task)

- [ ] T049 [US2] Seed dev cert 進 named volume(模擬 prod cert、per quickstart 模式 2):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans   # 清 dev
  docker run --rm \
    -v rev1-admin_front_nginx_certs:/certs \
    -v "$PWD/deploy/dev-certs":/src \
    alpine sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
  # 預期:exit 0、無 error;後續啟 prod baseline 時 nginx 443 server 能讀到 cert
  ```
- [ ] T050 [US2] **AC US2.1** prod baseline 啟動 + 6 service healthy(per C-V2 + FR-016):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
  docker compose ps
  # 預期:6 service healthy(無 acme container — profile=prod 未啟)
  ```
- [ ] T051 [US2] [P] **補強驗 binding 0.0.0.0**(per C-V15 + US2.1 補):
  ```bash
  ss -tlnp 2>/dev/null | grep -E ':(11080|11443)\b'
  # 預期:2 行、Local Address 為 0.0.0.0:<port>(非 127.0.0.1)
  ```

### Prod baseline acceptance(3 task)

- [ ] T052 [US2] [P] **AC US2.2** 80 → 443 強制 redirect(per C-V8 + FR-016):
  ```bash
  curl -fsSI http://127.0.0.1:11080/health
  # 預期:HTTP/1.1 301 + Location: https://... (scheme=https)
  ```
- [ ] T053 [US2] [P] **AC US2.3** `/.well-known/acme-challenge/` 例外不 redirect(per C-V9):
  ```bash
  curl -fsSI http://127.0.0.1:11080/.well-known/acme-challenge/dummy
  # 預期:HTTP status 非 301(預期 404、表示 ^~ location 攔到、不被 redirect)
  ```
- [ ] T054 [US2] [P] **AC US2.4** prod 443 HTTPS work(per C-V10):
  ```bash
  curl -kfsS https://127.0.0.1:11443/health
  # 預期:exit 0 + stdout ok(nginx 用 named volume cert)
  ```

**Checkpoint**:US2 完成 — prod baseline TLS 紀律可驗證、Conditional redirect 拍板落實。

---

## Phase 5: User Story 3 — Acme skeleton sanity(Priority: P3)

**Goal**:`--profile prod` 啟 acme container、3 個 sanity check PASS。

**Independent Test**:依賴 US2 prod.yml 已建;額外需 `deploy/secrets/acme_email.txt`(`cp .example`)。

### Acme prereq + 啟動(2 task)

- [ ] T060 [US3] 準備 acme_email secret 檔(per FR-004 + spec edge case E-5):
  ```bash
  cp deploy/secrets/acme_email.txt.example deploy/secrets/acme_email.txt
  # 編輯填 placeholder email(如 admin@example.com、W-F6 sanity 用、prod 部署再改真實)
  # 注意:acme_email.txt 已 gitignored(W-F4 既有規則)
  ```
- [ ] T061 [US3] **AC US3.1** 啟 prod + acme stack 7 service healthy:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans  # 不帶 -v 保 volume
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
  docker compose ps
  # 預期:7 service(6 既有 + acme running)
  ```

### Acme acceptance(4 task)

- [ ] T062 [US3] [P] **AC US3.2** acme `--version`(per C-V11):
  ```bash
  docker compose exec acme acme.sh --version
  # 預期:exit 0 + 印 acme.sh 版本字串(如 v3.0.x)
  ```
- [ ] T063 [US3] [P] **AC US3.3** acme secret 注入(per C-V12 + C-C7):
  ```bash
  docker compose exec acme cat /run/secrets/acme_email
  # 預期:email content(per acme_email.txt)
  docker compose exec acme env | grep ACME_EMAIL_FILE
  # 預期:ACME_EMAIL_FILE=/run/secrets/acme_email
  ```
- [ ] T064 [US3] [P] **AC US3.4** acme volume mount(per C-V13 + C-C10):
  ```bash
  docker compose exec acme ls -la /acme.sh
  # 預期:dir 存在;W-F6 階段空 / 只含 acme.sh init files;不該有 issued cert
  docker compose exec acme acme.sh --list 2>&1 | head -3
  # 預期:0 cert listed(W-F6 不實際 issue)
  ```
- [ ] T065 [US3] [P] **補強驗 acme container 不 crash loop**(per C-C9):
  ```bash
  docker compose ps acme
  # 預期:status 為 running 或 healthy(非 restarting)
  docker compose logs acme --tail 20
  # 預期:無 panic / fatal / error 訊息
  ```

### Stack 切回 dev mode(per US3 結束、留給後續 Doc 階段可選用)

- [ ] T066 [US3] 切回 dev mode(留 stack 給 Phase 6 acceptance 或 manual SPA 驗用):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod down --remove-orphans  # 不帶 -v 保 volume
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  # 預期:6 service healthy、dev mode 4 port 暴露
  ```

**Checkpoint**:US3 完成 — acme skeleton 結構就位 + 3 sanity scenario PASS;實際 cert acquisition 留 W-F6b。

---

## Phase 6: Documentation Update(W-F6 文件落地)

**Goal**:同步更新 `CLAUDE.md` §5.2 + §5.2.1 + `docs/INTEGRATION-CHECKLIST.md`、讓下個 session 看到 W-F6 落地後的操作指南與進度。

- [ ] T070 改 `CLAUDE.md` §5.2(per data-model E11 + FR-019):
  - 「目前現況」段落改寫 — 改為「W-F6 + W-F7 落地、TLS 結構就位、3 種啟動模式」+ 3 個子點(dev 127.0.0.1 + HTTP/HTTPS、prod baseline 0.0.0.0 + 80→443、prod + acme skeleton)
  - §5.2.1 「dev 啟動命令範例」擴充(per quickstart 模式 1):加 `bash deploy/generate-dev-cert.sh` 步驟 + HTTPS curl/openssl 驗證命令 + TLS handshake + cert SAN 驗
  - 可選加 §5.2.2 prod baseline + §5.2.3 prod + acme 段(per quickstart 模式 2/3 摘要)— 視 §5.2 易讀性決定;若加、體積仍應 ≤ 60 行新增
- [ ] T071 [P] 改 `docs/INTEGRATION-CHECKLIST.md`(per data-model E12 + FR-020):
  - Current Focus 段:`W-2 P2:2/4` → `3/4`、`(W-F5 + W-F7 完成)` → `(W-F5 + W-F7 + W-F6 完成)`、`剩 W-F6 / W-F11` → `剩 W-F11`(或 `剩 W-F6b(cert acquisition)+ W-F11`)、Active feature 改為「無(W-F6 全完成、TLS 結構就位)」
  - Phase W deploy Roadmap 表:W-F6 row 改為 `| W-F6 | tls-cert-management | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;TLS 結構 + dev 自簽 + prod redirect + acme skeleton;cert acquisition 留 W-F6b)|`
  - 已完成里程碑段加 W-F6 條目(類 W-F5/W-F7 格式;含 `<sha-pending>` placeholder + 範疇邊界、acceptance 13/15 + 2 manual SPA + 1 deferred、單段 commit、解鎖 W-F6b)
- [ ] T072 [P] 驗 doc 改動:
  ```bash
  grep "W-F6 + W-F7 落地\|W-F6.*✅" CLAUDE.md docs/INTEGRATION-CHECKLIST.md | head -5
  # 預期:CLAUDE.md 與 INTEGRATION-CHECKLIST.md 各 ≥ 1 match
  grep -E "W-2 P2:3/4" docs/INTEGRATION-CHECKLIST.md
  # 預期:≥ 1 match
  ```

**Checkpoint**:Phase 6 完成 — doc 改動到位、SOP hook 注入第一輪 context 時 user / Claude 看到 W-F6 落地後 surface area。

---

## Phase 7: Polish & Single Commit(W-F6 純 outer、單段 commit per CLAUDE.md §6.1)

**Goal**:落實單段 commit 紀律、worktree 零改動、Conventional Commits 中文 subject。

- [ ] T080 worktree 0 改動驗(per FR-018 + Constitution Principle IV):
  ```bash
  cd base-web && git status --short && cd ..
  cd rust-api && git status --short && cd ..
  # 預期兩 worktree 都 clean
  ```
- [ ] T081 outer 單段 commit:
  ```bash
  # 先 stack down 清乾淨(不帶 -v 保 cert volume content for next session)
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans

  # 確認 staging
  git status
  # 應看到:
  #   modified: .specify/feature.json
  #   modified: CLAUDE.md
  #   modified: docs/INTEGRATION-CHECKLIST.md
  #   modified: docker-compose.yml
  #   modified: docker-compose.dev.yml
  #   modified: .gitignore
  #   modified: deploy/front-nginx/conf.d/default.conf
  #   new file: docker-compose.prod.yml
  #   new file: deploy/generate-dev-cert.sh
  #   new file: deploy/dev-certs/README.md
  #   new file: deploy/front-nginx/conf.d/default.conf.prod
  #   new file: deploy/front-nginx/snippets/proxy_headers.inc
  #   new file: deploy/secrets/acme_email.txt.example
  #   new file: specs/012-tls-cert-management/...

  # === F1 補強(per /speckit-analyze):驗主 compose front-nginx 未誤加 ports ===
  # FR-001 + C-M1 紀律 — 主 docker-compose.yml front-nginx service block 不可有 ports 區段
  # 若 implement 階段不小心動到、此 assert 會 catch、阻 commit
  if awk '/^  front-nginx:/{flag=1; next} flag && /^  [a-z]/{flag=0} flag' docker-compose.yml | grep -qE "^\s+ports:"; then
    echo "ERROR: 主 docker-compose.yml front-nginx 段含 ports 區段、違反 FR-001 / C-M1"
    echo "       對外 host port MUST 在 docker-compose.{dev,prod}.yml 加、主 compose 維持 internal-only baseline"
    exit 1
  fi
  echo "✓ 主 compose front-nginx 段無 ports(F1 驗 PASS)"

  # 同 sanity 驗 git diff 範圍(可選、雙保險):
  git diff --cached -- docker-compose.yml | grep -E "^\+\s+- .*:[0-9]+:[0-9]+" | grep -q "front-nginx" && {
    echo "ERROR: staging 區 docker-compose.yml diff 含新增 ports 行(疑似 front-nginx 段)"
    exit 1
  } || echo "✓ git diff --cached docker-compose.yml 無新增 front-nginx ports(F1 雙保險 PASS)"

  # Stage 全範疇(不可動 worktree)
  git add docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml \
          deploy/front-nginx/conf.d/default.conf deploy/front-nginx/conf.d/default.conf.prod \
          deploy/front-nginx/snippets/proxy_headers.inc \
          deploy/generate-dev-cert.sh deploy/dev-certs/README.md \
          deploy/secrets/acme_email.txt.example \
          .gitignore CLAUDE.md docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json specs/012-tls-cert-management/

  # Commit(Conventional Commits + 中文 subject)
  git commit -m "$(cat <<'EOF'
  feat(deploy): W-F6 TLS 終止 + 對外 port + prod cert skeleton(11 個檔)

  Phase W deploy P2 第三個 feature(3/4)— TLS 結構 + 對外 host port + prod cert
  lifecycle skeleton。3 種啟動模式:dev 自簽 cert + 11080 HTTP + 11443 HTTPS;prod
  baseline 0.0.0.0 對外 + 80 強制 redirect 443;prod + acme skeleton 7 service。

  改 / 新建檔(11 個):
  - 主 docker-compose.yml:加 named volume front_nginx_certs + acme service
    (profile=prod)+ acme_email secret + front-nginx cert mount(不加 ports、per
    Clarify Q1 Option A 避 binding 衝突)
  - docker-compose.dev.yml:加 dev-certs mount + 127.0.0.1:11443:443
  - docker-compose.prod.yml(新):0.0.0.0 ports + default.conf.prod mount override
  - deploy/front-nginx/conf.d/default.conf:加 443 ssl server block + 用 snippet
  - deploy/front-nginx/conf.d/default.conf.prod(新):80 redirect-only + 443 同 dev
  - deploy/front-nginx/snippets/proxy_headers.inc(新):5 header + timeout DRY
  - deploy/generate-dev-cert.sh(新):openssl RSA 4096 自簽、SAN DNS+IP
  - deploy/dev-certs/README.md(新):tracked 佔位 + 操作說明
  - deploy/secrets/acme_email.txt.example(新):W-F4 template 模式
  - .gitignore:加 deploy/dev-certs/*.pem
  - CLAUDE.md §5.2:更新 + §5.2.1 擴充啟動命令範例
  - docs/INTEGRATION-CHECKLIST.md:W-F6 ✅ + Current Focus 3/4

  Acceptance:US1 P1 MVP 7/7 + US2 P2 4/4 + US3 P3 4/4 = 15/15 PASS;cert SAN
  含 DNS:localhost + IP:127.0.0.1;TLS 1.2/1.3;nginx -t syntax OK;dev/prod 三
  種模式切換 work。

  範疇外:acme.sh 實際 cert issue/renew(留 W-F6b、需真實 domain + DNS provider)、
  DNS provider 拍板、HSTS / OCSP、rate limiting、Track DESIGN-A track-a.inc
  (W-FA1)、mkcert / browser trust chain。

  紀律:單段 commit(只動 outer、不動 worktree)、Constitution Check 7 PASS /
  14 N/A / 2 Partial(TLS cert acquisition 留 W-F6b、Complexity Tracking 已
  合理化)/ 0 violation。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
- [ ] T082 push 等候 user 同意:
  ```bash
  # 不主動 push、告知 user:
  # "W-F6 commit 已落地、要不要 push origin 012-tls-cert-management?"
  # 等 user 明確 ok 後跑 git push origin 012-tls-cert-management
  ```

**Checkpoint**:Phase 7 完成 — W-F6 落地、紀律遵守、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 | — |
| Phase 2 Foundational | Phase 3 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4(US2 需 cert 已生成 + dev.yml 已改 + 主 compose 已改) | Phase 2 |
| Phase 4 US2 | Phase 5(US3 prod.yml 由 US2 建)| Phase 3(US1 cert 用於 seed prod cert) |
| Phase 5 US3 | Phase 6(doc 描述含 3 mode)| Phase 4(US3 依賴 prod.yml 從 US2 建)|
| Phase 6 Doc | Phase 7 | Phase 3 + 4 + 5 acceptance PASS |
| Phase 7 Commit | — | 全 6 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一 MVP — implement cert script + 主 compose 改 + nginx config + dev.yml 改 + 7 acceptance,獨立完整。
- US2(P2):依賴 US1 dev cert(seed 進 named volume 模擬 prod cert)、依賴 US1 主 compose 改(named volume 已建)。新增 prod.yml + default.conf.prod。
- US3(P3):依賴 US2 prod.yml(prod stack 啟動基礎)、依賴 US1 acme service 已在主 compose;只是 acceptance。

實際上 US2 / US3 都是「prod 路徑驗證」,實作核心都在 US1。本 feature 範疇大但耦合緊。

## Parallel Execution

### Phase 1 全可並行
T002 / T003 / T004 / T005 / T006(獨立 docker / openssl / ls / ss 命令)

### Phase 2 部分並行
T011 / T012 / T013 並行(獨立 read);T010 + T014 是 prerequisite

### Phase 3 implementation 並行
- T021 / T022 / T023 並行(獨立新建檔)
- T024 + T025 + T026 序列(同改一個檔 docker-compose.yml、後者依前者)
- T027 並行(獨立新建 snippet 檔)
- T028 + T029 序列(同改一個檔 default.conf)
- T030 序列(改 docker-compose.yml、依賴 T024-T026)
- T031 序列(改 docker-compose.dev.yml、獨立)
- T032 / T033 並行(獨立靜態驗)

### Phase 3 acceptance 全可並行
T035 / T036 / T037 / T038 / T039 / T040 / T041 並行(獨立 curl / openssl / nginx -t 命令)

### Phase 4 acceptance 並行
T047 / T048 並行(獨立 diff / yq);T049 + T050 序列(seed + 啟 stack);T051 / T052 / T053 / T054 並行

### Phase 5 acceptance 並行
T062 / T063 / T064 / T065 並行(獨立 docker exec)

### Phase 6 並行
T071 / T072 並行(獨立 grep / 文件 edit);T070 在前(主 doc edit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1) — dev TLS 結構 + W-F7 流程不破。完成後 user 可開始 dev HTTPS 工作;若需 prod 路徑驗證才繼續 Phase 4-7。

**MVP commit policy**:US1 acceptance PASS 後**可單獨 commit**(若需快速 ship dev TLS、prod 路徑後續再做);但範疇小、推薦走完整 Phase 1-7 一次到位再 commit(對齊 W-F7 模式)。

**並行 vs 序列建議**:
- 全 43 task 預估時間 60-90 分鐘(其中 30 分鐘是 stack up/down/wait 1-3 次切換)
- Phase 3 acceptance 7 個 curl/openssl 並行可省 5-10 分鐘
- Phase 4-5 prod cert seed + acme profile 切換是序列、不能省

**Critical path**:T020 cert script → T024-T026 主 compose 改 → T028 default.conf → T031 dev.yml → T032-T033 render → T034 dev up → T035-T041 acceptance → T045-T046 prod.yml + default.conf.prod → T049 seed → T050-T054 prod acceptance → T060 acme_email → T061-T066 acme → T070-T072 doc → T080-T082 commit。

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T041 [US1] / T045-T054 [US2] / T060-T066 [US3]) |
| Setup / Foundational / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per 上方 Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 43 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement` 或 `/speckit-analyze`**。
