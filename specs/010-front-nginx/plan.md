# Implementation Plan: W-F5 — front-nginx 反向代理

**Branch**: `010-front-nginx` | **Date**: 2026-05-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-front-nginx/spec.md`

## Summary

加 stack 內第 6 個 service `front-nginx`(image `nginx:1.27-alpine`、internal-only)作為反向代理 + SPA gateway,解決 base-web SPA(`VITE_SERVICE_BASE_URL=/api`)與 rust-api(routes 在 root path、無 `/api/` 前綴)之間的 URL prefix mismatch。完成後 **Phase W deploy P2 第一個 feature 達成、解鎖後續 P2**(W-F6 TLS 於 W-F5 既有 nginx server 加 443 listen + ssl 配置;W-F7 對外 host port 給 front-nginx 加 `ports:` 11080:80 / 11443:443)。

**Technical approach**(per [research.md](research.md)):

- **3 個 location block**(per spec FR-003 + clarify Q1):
  - `location = /health { return 200 "ok"; ... }`(front-nginx self、不透傳;exact match 優先級最高)
  - `location /api/ { proxy_pass http://rust_api/; ... }`(**trailing `/` 切前綴**;`/api/auth/login` → `rust_api/auth/login`)
  - `location / { proxy_pass http://base_web; ... }`(SPA + static、base-web 內部 nginx 處理 try_files)
- **2 upstream**:`base_web` → `base-web:8080`(對齊 W-F2)、`rust_api` → `rust-api:11081` + `keepalive 32`(對齊 DESIGN-W §4.2)
- **5 header forwarding**(per spec FR-016):Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto / X-Request-ID(rust audit log 用)
- **單段 commit**(per CLAUDE.md §6.1):只動 outer(`docker-compose.yml` / `deploy/front-nginx/` / spec docs)、不動 rust-api / base-web worktree
- **無 TLS / 無 host port / 無 nestjs / 無 rate limiting**(per spec FR-019~FR-025 5 條 MUST NOT、嚴守 P2 後續邊界)

**Pre-implement validation tasks**:
- **T1**:`docker compose config` 渲染驗 W-F5 改後 yaml syntax(per FR-008/009)
- **T2**:`docker compose exec front-nginx nginx -t` 驗 nginx config syntax(per FR-009 + SC-007)
- **T3**:rust-api routes 已驗(`POST /auth/login` 200、`/api/auth/login` 404 — spec stage live test 確認、不需重驗)
- **T4**:6 service stack cold start 時間 ≤ baseline + 5sec(per SC-002)

## Technical Context

**Language/Version**:nginx config language(`nginx:1.27-alpine` 標準 conf 語法)、docker-compose v2 file format(對齊 W-F4)、shell(POSIX、僅 healthcheck `curl -f` 用)

**Primary Dependencies**:
- **`nginx:1.27-alpine`**(同 W-F2 base-web 內部 nginx 版本、image 已 local cached)
- **W-F2 base-web image**(`base-web:rev1-admin-base-web`):upstream `base_web` 指向其 8080 port
- **W-F1 rust-api image**(`rust-api:rev1-admin-rust-api`、W-F4 已 rebuild):upstream `rust_api` 指向其 11081 port
- **W-F4 既有 docker-compose.yml**:W-F5 加 第 6 個 service、其他 5 個不動

**Storage**:
- **`deploy/front-nginx/conf.d/default.conf`**(outer git-tracked)— mount 到 container `/etc/nginx/conf.d/default.conf` read-only
- **`deploy/front-nginx/README.md`**(outer git-tracked)— operator 操作說明
- 無 volume / 無 persistent state(nginx stateless)

**Testing**:
- **nginx config syntax**:`docker compose exec front-nginx nginx -t`(per SC-007 / FR-009)
- **Compose syntax**:`docker compose config`(per FR-008)
- **Stack startup**:`docker compose up -d` + sleep 60 + `docker compose ps`(per SC-001 / FR-008)
- **Routing**:`docker compose exec <service> curl ...` 5 種 path 各驗
- **Header forwarding**:rust audit log `client_ip` 驗 X-Forwarded-For
- **W-F4 regression**:跑 W-F4 quickstart.md scenario 12 / 13 / 15
- **W-F3 regression**:DNS + volume 持久

**Target Platform**:`linux/amd64`(per W-F1 Q2 inherit)

**Project Type**:infrastructure / deploy feature(rev1 deploy Phase W **P2 第一個 feature** — stack 內反向代理層;純配置 layer feature、無 source code 改動)

**Performance Goals**:
- Stack cold startup with front-nginx: 60-90 sec total(對齊 W-F4 SC-001 + ≤ 5sec overhead per SC-002)
- nginx proxy hop overhead: < 5ms(localhost docker network、可忽略)

**Constraints**:
- `MUST NOT` 加 TLS — 留 W-F6
- `MUST NOT` 加 host port — 留 W-F7
- `MUST NOT` 加 nestjs upstream / TRANSITIONAL — 留 W-FA1
- `MUST NOT` 加 rate limiting / WAF — 留 follow-up
- `MUST NOT` 動 rust-api / base-web image / source
- `MUST NOT` 動 W-F4 secrets

**Scale/Scope**:
- 改動檔案數:**4 個檔**(outer:`docker-compose.yml` 改、新建 `deploy/front-nginx/conf.d/default.conf` + `deploy/front-nginx/README.md` + spec docs)
- LOC 量級:`docker-compose.yml` 加 ~25 行;`default.conf` ~60 行;`README.md` ~50 行
- **Commit 模式**:**單段 commit**(per CLAUDE.md §6.2)— 只動 outer

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 `.specify/memory/constitution.md` v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ❌ **N/A**(rust-api 仍由其自身對 endpoint 做 enforcement、front-nginx 純路由)
- **II. Soft Delete + Audit Log** — ✅ **PASS**(W-F5 透過 X-Forwarded-For 傳真實 client IP 給 rust-api、enabling audit log 取正確 client_ip)
- **III. 嚴版禁 Forward + 單一職責** — ✅ **PASS**(W-F5 nginx config 明確標 backend owner;**nginx → backend 為 reverse proxy 模式、不是 backend ↔ backend 的 HTTP/RPC forward**)
- **IV. base 不改動邊界** — ✅ **PASS**(W-F5 不動 base-web 任何 `src/` / `.env*` / 內部 nginx config)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-F5 為 DESIGN-B baseline、Track DESIGN-A nestjs 留 W-FA1 加 `track-a.inc`、structure forward-compatible)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **PASS**
- **資料庫 PostgreSQL** — ❌ **N/A**
- **快取 redis 必要** — ❌ **N/A**
- **TLS 對外** — ❌ **N/A**(W-F5 不對外、TLS 留 W-F6)
- **Secret 注入** — ❌ **N/A**(W-F5 不需 secret)
- **DB migration trigger** — ❌ **N/A**
- **Port 規劃 `1XXXX`** — ❌ **N/A**(W-F5 不開 host port、留 W-F7)
- **Observability promtail/Loki/prometheus** — ❌ **N/A**(留 W-F12+)
- **結構化 log JSON** — ⚠️ **Partial/Defer**:nginx access log 預設 combined format(非 JSON);**留 W-F12 observability stack 階段一起改**(配對 promtail / Loki)。**Complexity Tracking 記**
- **Backup PITR** — ❌ **N/A**(stateless)
- **背景工作** — ❌ **N/A**
- **CI/CD platform** — ❌ **N/A**

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(specify → clarify Q1 → plan → tasks → implement → analyze 流程)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、1 partial 記 Complexity Tracking)
- **兩段式 commit 紀律** — ✅ **PASS**(W-F5 走單段 commit、只動 outer)
- **Conventional Commits 中文 subject** — ✅ **PASS**
- **Push 確認紀律** — ✅ **PASS**
- **TLS 紀律** — ❌ **N/A**

**Gate result**:**15 PASS / 7 N/A / 1 Partial(nginx log JSON、Complexity Tracking 記)/ 0 violation**。Phase 0 起 gate 通過、有 1 個合理化 entry。

## Project Structure

### Documentation (this feature)

```text
specs/010-front-nginx/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── front-nginx-routing.md   # Phase 1 — routing 結構約束
├── checklists/
│   └── requirements.md  # /speckit-specify 既有
└── tasks.md             # Phase 2 output(NOT created here)
```

### Source Code (repository root)

```text
fork260509-rev1/                       ← outer repo root
├── docker-compose.yml                ← W-F5 改:加第 6 個 service `front-nginx`
├── deploy/
│   ├── secrets/                      ← W-F4 既有(W-F5 不動)
│   └── front-nginx/                  ← W-F5 新建子目錄
│       ├── conf.d/
│       │   └── default.conf          ← 主 nginx config(2 upstream + 3 location)
│       └── README.md                 ← 操作說明
├── base-web/                         ← W-F5 不動
└── rust-api/                         ← W-F5 不動
```

**Structure Decision**:
- outer 改動 4 個檔(`docker-compose.yml` 改、`deploy/front-nginx/conf.d/default.conf` 新、`deploy/front-nginx/README.md` 新、spec docs)
- 不動 base-web / rust-api worktree(W-F5 純 outer 配置層)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **nginx access log 預設 combined format(非 JSON)** — partial 違反「nginx 統一 JSON 格式」 | W-F5 範疇判斷:**defer 到 W-F12 observability stack 階段一起改**(配對 promtail / Loki expected schema、避免格式重工) | 單獨改 W-F5 加 JSON log:無 log aggregation stack、改 JSON 對 operator UX 暫無正效益、W-F12 還要再改一次配對 promtail |

## Phase 0 完成:research.md(已產出)

詳見 [research.md](research.md)。關鍵 finding:

- **R-001**:nginx `proxy_pass http://upstream/;` 帶 trailing `/` 切前綴(spec live test 已驗 rust-api `/auth/login` route)
- **R-002**:nginx location 優先序 `= exact > prefix /api/ > prefix /` — 3 段互不衝突
- **R-003**:`nginx:1.27-alpine` 已 local cached(W-F2 image 內部用同版本)
- **R-004**:5 個 header forwarding 寫法沿 DESIGN-W §4.2 範例
- **R-005**:rust_api upstream `keepalive 32` 降短連線 overhead
- **R-006**:`depends_on` long syntax + `service_healthy`(對齊 W-F3)
- **R-007**:healthcheck `curl -f http://localhost/health`(對齊 W-F2/W-F4 模式)
- **R-008**:nginx access log JSON 留 W-F12(Complexity Tracking 已記)
- **R-009**:`proxy_pass http://rust_api/` 含 trailing `/` 為切前綴正解
- **R-010**:base_web upstream 不加 keepalive(流量低、邊際收益低)
- **R-011**:front-nginx 與 base-web 內部 nginx 共存無衝突(不同 container / port / 職責分離)

## Phase 1 完成:data-model + contracts + quickstart(已產出)

- [data-model.md](data-model.md):5 個 entity — E1 front-nginx service / E2 deploy/front-nginx/ 結構 / E3 nginx config(2 upstream + 3 location)/ E4 5 header forwarding / E5 HTTP request flow(7 examples)
- [contracts/front-nginx-routing.md](contracts/front-nginx-routing.md):C-F1 ~ C-F8(目錄 / compose service / upstream / location / header / nginx-t / network 邊界 / dependency)
- [quickstart.md](quickstart.md):13 acceptance scenario reproducer + 8 SC 對照 + troubleshooting(6 issues)+ 單段 commit workflow

## Constitution Check Re-evaluation(post-Phase 1)

Phase 1 設計與 Phase 0 拍板一致、無新引入機制,Constitution gate **15 PASS / 7 N/A / 1 Partial(已記 Complexity Tracking)/ 0 violation**。可進 Phase 2。

## Next phase

下一步:`/speckit-tasks` 產出 `tasks.md`(Phase 2)。預期 task 結構:

- **P1 Setup**(T001-T005):branch / compose v2 / W-F1+W-F2+W-F4 image local / `deploy/secrets/*.txt` 既有
- **P2 Foundational**(T010-T015):base-web 8080 port / rust-api 11081 + `/auth/login` route 確認 / W-F4 baseline stack 驗
- **P3 US1 Implementation**(T020-T030):新建 `deploy/front-nginx/conf.d/default.conf` + `README.md` / 改 `docker-compose.yml` 加 service
- **P3 US1 Acceptance**(T040-T053):13 scenario(Dim A-E)
- **P4 Polish**(T060-T065):單段 commit + push + merge + INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker
