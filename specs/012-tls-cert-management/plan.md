# Implementation Plan: W-F6 — tls-cert-management(TLS + 對外 port + prod cert skeleton)

**Branch**: `012-tls-cert-management` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-tls-cert-management/spec.md`

## Summary

W-F6 為 Phase W deploy **P2 第三個 feature**(W-F5 nginx + W-F7 port 後)。給 stack 加 TLS 終止 + 對外 host port 暴露 + prod cert lifecycle skeleton:**主 `docker-compose.yml`** 加 named volume `front_nginx_certs` + acme.sh skeleton service(profile=prod)+ `acme_email` secret + front-nginx cert volume mount(**不**加 ports — per Clarify Q1 Option A、維持 W-F7 internal-only baseline);**`docker-compose.dev.yml`**(W-F7 既有檔)加 dev-certs file mount + `127.0.0.1:11443:443`;**`docker-compose.prod.yml`** 新建、override `default.conf.prod` + 加 `0.0.0.0:11080:80` + `0.0.0.0:11443:443`;**nginx config** 改:`default.conf` 加 443 ssl server block + `http2 on;` + TLSv1.2/1.3、`default.conf.prod` 80 改 redirect-only(保 `/.well-known/acme-challenge/`)、443 與 dev 一字不差;**`deploy/generate-dev-cert.sh`** 自簽 cert 腳本 + `deploy/dev-certs/` 存放(`*.pem` gitignored)。**單段 commit**、不動 worktree。

**Technical approach**(per [research.md](research.md)):

- **Cert path 統一**:`/etc/nginx/certs/{fullchain,privkey}.pem` — dev 從 host file mount、prod 從 named volume(acme 寫進);nginx config **無 conditional**
- **兩份 nginx config**:`default.conf`(dev、80 serve + 443 ssl)+ `default.conf.prod`(prod、80 redirect-only + 443 一字不差);443 段 DRY 透過 `include /etc/nginx/snippets/proxy_headers.inc` 共用 5 header
- **三種啟動模式**:
  - dev:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`(loopback ports + 自簽 cert + 80 serve + 443 ssl + 無 acme)
  - prod baseline:`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait`(0.0.0.0 ports + cert from volume + 80 redirect + 無 acme)
  - prod + acme:同 prod baseline + `--profile prod`(7 service、含 acme.sh container、實際 cert acquisition 留 W-F6b)
- **acme.sh skeleton**:`neilpang/acme.sh:latest` image、`command: ["daemon"]`(若 crash 改 `sleep infinity`)、`profiles: ["prod"]`、共用 `front_nginx_certs` volume、`acme_email` secret 走 W-F4 `_FILE` pattern
- **單段 commit**(per CLAUDE.md §6.1):只動 outer + spec docs;不動 worktree;commit message conv: `feat(deploy): W-F6 ...`

**Pre-implement validation tasks**(plan stage research):

- **T1**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml config` 渲染後 grep `front-nginx.volumes` — 驗 dev-certs mount 覆蓋 named volume(per spec A-002)
- **T2**:`docker compose -f docker-compose.yml -f docker-compose.prod.yml config` 渲染 — 驗 0.0.0.0 ports list + default.conf.prod mount(per FR-013)
- **T3**:`docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod config` — 驗 acme service 進 services list(per FR-003)
- **T4**:`bash deploy/generate-dev-cert.sh` 跑通 — `openssl x509 -in fullchain.pem -noout -ext subjectAltName` 含 `DNS:localhost` + `IP Address:127.0.0.1`(per FR-006 + SC-004)
- **T5**:dev stack up + `curl -fsS http://127.0.0.1:11080/health` + `curl -kfsS https://127.0.0.1:11443/health` 兩個都 ok(per US1.3 + US1.4、SC-002 8/8)

## Technical Context

**Language/Version**:Docker Compose YAML v2(對齊 W-F3 ~ W-F7)、nginx 1.27 conf 語法、POSIX shell(`generate-dev-cert.sh`)、openssl(自簽 cert)

**Primary Dependencies**:
- **`docker-compose.yml`**(W-F7 後狀態)— 6 service / 1 network / 2 volume / 5 secret;W-F6 加 1 service(acme)+ 1 volume(front_nginx_certs)+ 1 secret(acme_email)+ front-nginx cert volume mount;**不**加 ports(per Clarify Q1)
- **`docker-compose.dev.yml`**(W-F7 既有)— 4 個 127.0.0.1 ports;W-F6 加 dev-certs mount + 1 ports entry `127.0.0.1:11443:443`
- **`deploy/front-nginx/conf.d/default.conf`**(W-F5 既有)— 80 server;W-F6 加 443 server + 抽 snippet
- **`nginx:1.27-alpine`** image(W-F5 既有、支援 `http2 on;` directive、ssl 模組內建)
- **`neilpang/acme.sh:latest`** image(W-F6 新增 service)— pull-on-demand、image size ~30MB(alpine-based)
- **openssl**(host 機 + W-F1 rust-api 已驗 libssl3 + dev 機普遍裝)— `generate-dev-cert.sh` 用

**Storage**:
- **`deploy/front-nginx/conf.d/default.conf`**(改、~60 行 → ~80 行,加 443 server block)
- **`deploy/front-nginx/conf.d/default.conf.prod`**(新建、~80 行,80 redirect + 443 同 dev)
- **`deploy/front-nginx/snippets/proxy_headers.inc`**(新建、~6 行,5 header + timeout)
- **`deploy/generate-dev-cert.sh`**(新建、~25 行 POSIX shell)
- **`deploy/dev-certs/README.md`**(新建、~10 行、tracked 佔位 + 操作說明)
- **`deploy/dev-certs/*.pem`**(gitignored、operator 跑腳本生成、本機儲存)
- **`deploy/secrets/acme_email.txt.example`**(新建、~3 行)
- **`deploy/secrets/acme_email.txt`**(gitignored、operator 啟 acme 前 cp + 填值)
- **named volume `front_nginx_certs`**(新增、dev 不 attach、prod attach)— acme.sh 寫 cert / nginx 讀 cert
- **`docker-compose.prod.yml`**(新建、~20 行 yaml)
- **`.gitignore`**(改、加 2 條排除規則)

**Testing**:
- **Compose syntax + merge**:`docker compose -f -f config`(3 種 -f 組合)— per FR-001 + C-M*
- **Cert SAN 驗**:`openssl x509 -ext subjectAltName`(per FR-006 + SC-004)
- **TLS handshake**:`openssl s_client -connect ... -servername localhost`(per US1.6)
- **dev/prod 啟動**:`docker compose ... up -d --wait`(3 種模式、per US1/US2/US3)
- **HTTP/HTTPS endpoint**:`curl -fsSI / -kfsS`(per US1.3/4/5 + US2.2/3/4)
- **redirect 路徑**:`/.well-known/acme-challenge/<path>` 不被攔(per US2.3 + FR-011)
- **acme skeleton sanity**:`docker compose exec acme acme.sh --version` + secret cat + volume ls(per US3.2/3/4 + FR-017)
- **W-F7 regression**:`curl http://127.0.0.1:11080/health`(per FR-015 + US1.3)

**Target Platform**:dev 環境(WSL2 + Win11 22H2+ / Linux dev host)+ 模擬 prod 環境(dev 機跑 prod compose、cert 用 dev 自簽暫填、acme 跑 sanity);實際 prod VPS 部署留 W-F6b

**Project Type**:infrastructure / deploy feature(rev1 deploy Phase W **P2 第三個 feature**— TLS layer + 對外 port + cert lifecycle skeleton)

**Performance Goals**:
- Stack startup w/ TLS:dev 90s 內 healthy(W-F7 baseline 60-75s + ssl + cert mount overhead ≤ 30s、per SC-001、NFR-003 ≤ 15% 增幅)
- TLS handshake(loopback、自簽):≤ 100ms(per NFR-004)
- cert 生成 script(openssl RSA 4096):≤ 5s(per NFR-002)
- dev → prod 模式切換(`down -v` + `up -d`):≤ 3 命令(per SC-006)

**Constraints**:
- `MUST NOT` 動主 `docker-compose.yml` 的 ports(per FR-001 + Clarify Q1 Option A、避 binding 衝突)
- `MUST NOT` 動 worktree(`base-web/` / `rust-api/`)— 純 outer feature
- `MUST NOT` 用 `0.0.0.0` 在 dev mode(per Clarify Q1 + W-F7 紀律延伸)
- `MUST NOT` 實際 issue cert(acme acquisition / renew 留 W-F6b)
- `MUST NOT` 拍板 DNS provider(留 W-F6b)
- `MUST NOT` 動 W-F4 既有 secret(只新增 `acme_email`)
- `MUST NOT` 動 W-F5 既有 reverse proxy 邏輯(只加 443 server + 抽 snippet)
- `MUST NOT` 加 Track DESIGN-A `track-a.inc`(留 W-FA1)
- `MUST NOT` 加 HSTS / OCSP stapling / rate limiting(後續 prod hardening)
- `MUST NOT` 加 IPv6 監聽(per OOS-011、對齊 W-F7 IPv4-only)

**Scale/Scope**:
- 改動 / 新建檔案數:**11 個檔**(per NFR-001 ≤ 12)— 主 compose / dev.yml / prod.yml 新 / default.conf / default.conf.prod 新 / proxy_headers.inc 新 / generate-dev-cert.sh 新 / dev-certs/README.md 新 / acme_email.txt.example 新 / .gitignore 改 / CLAUDE.md 改 / INTEGRATION-CHECKLIST.md 改
- LOC 量級(non-doc):~250 行新 + ~30 行改(主 compose 加 acme service 段、default.conf 加 443 段)
- Commit 模式:**單段 commit**(per CLAUDE.md §6.1)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ❌ **N/A**(W-F6 TLS 終止層、不動 authz)
- **II. Soft Delete + Audit Log** — ❌ **N/A**(W-F6 無 DB 寫入)
- **III. 嚴版禁 Forward + 單一職責** — ❌ **N/A**(nginx reverse proxy、不是 backend↔backend RPC)
- **IV. base 不改動邊界** — ✅ **PASS**(W-F6 純 outer + deploy/、不動 base-web src / .env)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-F6 TLS layer 對 DESIGN-A / DESIGN-B 中立;Track DESIGN-A `track-a.inc` 機制留 W-FA1)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **PASS**
- **資料庫 PostgreSQL** — ❌ **N/A**
- **快取 redis 必要** — ❌ **N/A**
- **TLS** — ⚠️ **Partial**(W-F6 落實大部分:nginx 443 ssl + TLSv1.2/1.3 + HIGH cipher + dev 自簽腳本 + acme.sh skeleton + prod 80 強制 redirect;**未落實**:acme.sh 實際 cert acquisition / renew / DNS provider — per Clarify Q1 Mid 拍板留 W-F6b、Constitution 「prod 用 Let's Encrypt acme.sh auto-renew」structurally 在 compose 內已 wire、實際 lifecycle 由 W-F6b 完整化)→ **Complexity Tracking 記**
- **Secret 注入** — ✅ **PASS**(`acme_email` 走 W-F4 `_FILE` pattern + `secrets:` directive、不進 process env)
- **DB migration trigger** — ❌ **N/A**
- **Port 規劃 `1XXXX`** — ✅ **PASS**(11080 + 11443 對齊 CLAUDE.md §5.2 + DESIGN-W §6.1)
- **Observability** — ❌ **N/A**(W-F11/12+ 範疇)
- **結構化 log JSON** — ❌ **N/A**(W-F6 不改 log 配置;nginx 預設 combined log、W-F12 一起改)
- **Backup PITR** — ❌ **N/A**(W-F6 stateless;`front_nginx_certs` volume 內容由 acme issue / dev 腳本生成、可重產)
- **背景工作** — ✅ **PASS**(`acme` 為 prod 背景工作 service、`profiles: ["prod"]` 隔離、獨立 secret `acme_email`、daemon 模式自動 renew — 符合 「prod 必要」+ 「獨立最小權限 credential」)
- **CI/CD platform** — ❌ **N/A**(本 feature 不改 CI;W-F18 落地時須在 pipeline 文檔明寫 prod `-f prod.yml` 啟動 + acme profile 控制)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(brainstorm → /speckit-specify → /speckit-clarify(Q1)→ /speckit-plan 流程完整)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、1 Partial 記 Complexity Tracking、0 violation)
- **兩段式 commit 紀律** — ✅ **PASS**(W-F6 走**單段** commit、只動 outer、不動 worktree)
- **Conventional Commits 中文 subject** — ✅ **PASS**(plan 預期 commit:`feat(deploy): W-F6 TLS 終止 + dev 自簽 + prod cert skeleton...`)
- **Push 確認紀律** — ✅ **PASS**(implement 完成後 push 需 user 同意、不主動推)
- **TLS 紀律** — ⚠️ **Partial**(同架構約束 TLS — dev 自簽 ✅ / prod 結構 ✅ / acme 實際 lifecycle ❌ deferred W-F6b)→ 同上 Complexity Tracking 條目

**Gate result**:**7 PASS / 14 N/A / 2 Partial(TLS — 架構約束 + 開發流程兩處共指同事項)/ 0 violation**。Phase 0 起 gate 通過、有 1 個合理化 entry。

## Project Structure

### Documentation (this feature)

```text
specs/012-tls-cert-management/
├── plan.md                              # This file(/speckit-plan output)
├── research.md                          # Phase 0 — Q1 clarify decision rationale + nginx http2/ssl + acme.sh skeleton + cert path 行為驗
├── data-model.md                        # Phase 1 — 12 entity 詳細 schema
├── quickstart.md                        # Phase 1 — operator 3 種啟動模式 guide + 故障排查
├── contracts/                           # Phase 1
│   ├── nginx-config-structure.md        #   C-N* nginx 80/443 server block 結構契約(dev/prod 兩份 + DRY snippet)
│   ├── cert-lifecycle.md                #   C-C* dev 自簽 cert + prod acme.sh skeleton 契約
│   ├── compose-overlay-merge.md         #   C-M* dev.yml + prod.yml merge 行為契約(避 ports 衝突 + cert mount 覆蓋)
│   └── verification-commands.md         #   C-V* host 驗證命令契約(curl / openssl / ss / docker compose ps)
├── checklists/
│   └── requirements.md                  # /speckit-specify 階段已產出
├── spec.md                              # /speckit-specify + /speckit-clarify 階段已產出
└── tasks.md                             # Phase 2 output(/speckit-tasks、NOT in this command)
```

### Outer repo changes(W-F6 implement 預期變動範圍)

```text
fork260509-rev1/                         # outer repo root
├── docker-compose.yml                   # ★ W-F6 改:加 named volume + acme service + acme_email secret + front-nginx cert mount(不加 ports)
├── docker-compose.dev.yml               # ★ W-F6 改(W-F7 既有):加 dev-certs mount + 加 127.0.0.1:11443:443 ports entry
├── docker-compose.prod.yml              # ★ W-F6 新建:override default.conf.prod mount + 0.0.0.0:11080+11443 ports entries
├── .gitignore                           # ★ W-F6 改:加 deploy/dev-certs/*.pem + deploy/secrets/acme_email.txt
├── CLAUDE.md                            # W-F6 改:§5.2 + §5.2.1 更新
├── docs/INTEGRATION-CHECKLIST.md        # W-F6 改:W-F6 row ✅ + Current Focus 進度 3/4 + 已完成里程碑
└── deploy/
    ├── front-nginx/
    │   ├── conf.d/
    │   │   ├── default.conf             # ★ W-F6 改(W-F5 既有):加 443 ssl server block
    │   │   └── default.conf.prod        # ★ W-F6 新建:80 redirect-only + 443 同 dev
    │   └── snippets/
    │       └── proxy_headers.inc        # ★ W-F6 新建:5 header + timeout DRY snippet
    ├── generate-dev-cert.sh             # ★ W-F6 新建:openssl 自簽 cert 腳本
    ├── dev-certs/
    │   ├── README.md                    # ★ W-F6 新建:tracked 佔位 + 操作說明
    │   └── *.pem                        # gitignored, operator 跑腳本生成
    └── secrets/
        └── acme_email.txt.example       # ★ W-F6 新建:對齊 W-F4 template 模式
```

**worktree 不動**:`base-web/` / `rust-api/` 兩個 worktree 全程 0 改動(per FR-018、Constitution Principle IV)

**Structure Decision**:本 feature 為**純 outer-repo deploy 層** TLS / 對外 port / cert lifecycle feature,無 source code 改動、無 service runtime 邏輯改動;主要工作量在 yaml(3 個檔)+ nginx config(3 個檔含 snippet)+ shell script(1 個)+ 文檔(2 個)。**單段 commit**(對齊 W-F5 / W-F7 純 outer feature 模式)。

## Complexity Tracking

| Violation / Partial | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **架構約束 TLS — acme.sh 實際 cert acquisition / renew 未實做** | per Clarify Q1 Mid 拍板:acme.sh 真實 lifecycle 需公網 + 真實 domain + DNS provider API,**dev 機 0 acceptance ability**。W-F6 落實「結構就位」(image / volume / secret / profile)讓未來 prod 部署 W-F6b 不開新 feature、只填 DNS creds + 跑 issue 命令 | Full(同 W-F6 內做 acme acquisition)= deferred test 偽完整、違反 Constitution「測試自動化」+ 「最小變動」紀律;Split(W-F6 只做 dev 自簽、acme 全留 W-F6b)= 結構分裂、未來 W-F6b 仍要動主 compose 加 acme service。**Mid 最務實**:結構就位 + sanity check 跑得通(US3、`acme.sh --version` + `cat secret` + `ls /acme.sh`)、實際 lifecycle 留 prod 部署時 W-F6b 完整 |
| **開發流程 TLS 紀律 — 同上(acme 實際 cert 未實做)** | 同上 — 屬同一事項在兩個 Constitution 章節的反射 | 同上 |

**結論**:1 個 Partial 條目、2 處反射(架構約束 + 開發流程)— Mid 範疇拍板合理化、W-F6b follow-up 已規劃(per Outbound dependency)。**0 violation**、Phase 0 起 gate 通過。

---

**Phase 0 / 1 outputs**:見同目錄 [`research.md`](research.md)、[`data-model.md`](data-model.md)、[`quickstart.md`](quickstart.md)、[`contracts/`](contracts/)。
