# Implementation Plan: W-F2 — dockerfile-base-web

**Branch**: `007-dockerfile-base-web` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-dockerfile-base-web/spec.md`

## Summary

從 0 建立 base-web Vue3 SPA 的 docker image build 機制。base-web 源倉無既有 Dockerfile / nginx config / .dockerignore,W-F2 新建 3 個檔。image 內含 Vite-built SPA static files + nginx 1.27 alpine web server,只 serve 自身 SPA(不反向代理 /api/,那是 W-F5)。

**Technical approach**(per [research.md](research.md)):
- **Builder**:`node:22-slim` + `corepack prepare pnpm@10.18.0 --activate`(顯式 pin 解 R-003 reproducibility)+ deps-first COPY 含 8 個 workspace sub-package + BuildKit cache mount `/root/.local/share/pnpm/store` + `pnpm install --frozen-lockfile` + ENV override .env.prod via process.env(R-002 Vite loadEnv merges process.env)+ `pnpm build`
- **Runtime**:`nginx:1.27-alpine` + apk `tzdata curl` + symlink TZ + COPY dist + COPY nginx.conf + `USER nginx` + EXPOSE 8080 + ENV TZ + CMD nginx daemon off
- **nginx config**:3 個 location block 優先級 `=` > `~*` > `/`;`location = /health` 返 200+ok;assets regex `~*` 套 30d immutable;SPA fallback `/` 套 no-cache(per R-007 修補 spec FR-019)
- **Image tagging**:DESIGN-W §2.4 / W-F1 contracts C-D1 模板繼承(short-sha / branch / prod-date,不用 :latest)

**Pre-build validation tasks**(plan/implement 階段執行、解 spec.md Assumption + R-001/R-002/R-007):
- **T1**:host 跑 `docker run -v base-web:/app node:22-slim ... pnpm install + pnpm build` 驗 R-001
- **T2**:T1 後 `docker run --rm --entrypoint sh <image> -c 'grep "/api" /usr/share/nginx/html/assets/*.js'` 驗 R-002 Vite process.env override 真的 work
- **T7**:nginx config 在 `location /` 加 no-cache header(per R-007 補強 FR-019)
- **AC-4**:`docker run --rm --entrypoint id nginx:1.27-alpine` 確認 nginx user uid number(R-004)

## Technical Context

**Language/Version**:
- **Builder side**:TypeScript / Vue3 / Vite 7.3.1(per `base-web/package.json`)、node `22-slim`(satisfies `engines.node >= 20.19.0`)、pnpm `10.18.0` patch pin via `corepack prepare`
- **Runtime side**:`nginx 1.27-alpine`(per Q1 brainstorm)

**Primary Dependencies**:
- **Build-time**:`pnpm` 10 + 60+ npm dep(Vue 3 / NaiveUI / AntV g2/g6 / UnoCSS / 等)+ 8 workspace sub-package(`@sa/alova/axios/color/hooks/materials/scripts/uno-preset/utils`)
- **Runtime**:nginx 1.27-alpine + `tzdata` + `curl`(apk install)
- **無 native binding 需求**(per R-001,所有 dep 純 JS)

**Storage**: N/A(W-F2 為 stateless web server、無 persistent state)

**Testing**: 多層:
- **Build verification**:`docker build`(Scenario 1)
- **Container introspection**:`docker run --entrypoint id / nginx -t`(Scenario 4 / 5)
- **Runtime HTTP**:`curl /health` / `curl /` / `curl /unknown-path` / `curl -I /assets/<x>.js`(Scenario 6-10)
- **Bundle audit**:`grep` dist 內 `/api` literal(Scenario 11)
- **TZ**:`docker exec date`(Scenario 12)

**Target Platform**: `linux/amd64`(per W-F1 Q2 inherit)

**Project Type**: infrastructure / deploy feature(rev1 deploy Phase W P1 第二個 — W-F1 後接 image 生產)

**Performance Goals**:
- 第一次無 cache build: 5-10 分鐘(SC-001)
- 第二次有 cache build: < 30 sec(SC-003)
- `/health` p99 latency: < 50ms local docker network(SC-004)
- image size: < 100MB target / 100-130MB acceptable / > 150MB optimize(SC-002 + R-009)

**Constraints**:
- `MUST NOT` 動 base-web source code(per FR-025 + Constitution Principle IV)
- `MUST NOT` 動 `.env*` 任一檔(per FR-026)
- `MUST NOT` 動 compose / secret / TLS / front-nginx / port forwarding / observability / CI(per FR-027)
- `MUST NOT` proxy `/api/*` 到 rust-api(per FR-028;那是 W-F5 範圍)
- `MUST NOT` 預埋多 arch build 機制(linux/amd64 only)

**Scale/Scope**:
- 範圍 = 3 個新建檔(`base-web/Dockerfile` + `base-web/deploy/nginx.conf` + `base-web/.dockerignore`)
- 預期 implementer 改動 ~ 100-150 lines(Dockerfile ~80、nginx.conf ~30、.dockerignore ~20)
- 跨 8 workspace sub-package 編譯影響 image content(不重新動 sub-package source)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 5 個 Principle + 12 個架構約束 + 6 個開發流程逐項 gate check:

### Principle I — RBAC Fail-safe(Casbin 後端強制)

- **Gate**: W-F2 是否破壞 Casbin enforcement?
- **Check**: W-F2 範圍是 base-web 前端 image,無 backend authorization 邏輯。`/health` endpoint 是 nginx static return、非 application endpoint。base-web 內 nginx 不做 RBAC、由 W-F5 front-nginx + 後端 rust-api Casbin 處理。
- **Status**: ✅ PASS

### Principle II — Soft Delete + 全域 Audit Log

- **Gate**: W-F2 是否破壞 soft delete + audit log?
- **Check**: 無 DB 寫入、無 entity 操作。base-web 為靜態 SPA bundle、無 backend logic。
- **Status**: ✅ PASS

### Principle III — 嚴版禁 Forward + 單一職責

- **Gate**: W-F2 是否引入 backend forward / 模糊 endpoint ownership?
- **Check**: W-F2 範圍內 nginx config 只 serve 自身 SPA + 健康 endpoint、**不**proxy 到 rust-api(per FR-028)。endpoint ownership(`/health` by base-web nginx、`/api/*` by W-F5 front-nginx → rust-api)清晰、不互攔。
- **Status**: ✅ PASS

### Principle IV — base 不改動邊界

- **Gate**: W-F2 是否動 base-web source code?
- **Check**:
  - **不動**:`src/`、`components/`、`router/`、`store/`、`service*/`、`vite.config.ts`、`package.json`、`pnpm-lock.yaml`、`packages/*/src/`(per FR-025)
  - **不動**:`.env`、`.env.prod`、`.env.test`(per FR-026 + Q2 clarify、走 build-arg override pattern)
  - **動**:3 個全新建檔 — `base-web/Dockerfile` + `base-web/deploy/nginx.conf` + `base-web/.dockerignore`(新增、不修改既有)
- **Status**: ✅ PASS(新增 deploy/infra 檔不算「動 base source」)

### Principle V — 漸進收縮(DESIGN-A → DESIGN-B)

- **Gate**: W-F2 是否引入 nestjs 耦合或 schema 改動?
- **Check**: W-F2 是 base-web 前端 image,**完全不涉及 nestjs**;不改 DB schema / JWT / Casbin policy / redis pub-sub。「未來 nestjs 拔掉時順嗎」濾鏡 = ✓(nestjs 拔了 W-F2 image 一樣 work、SPA bundle 內 `/api` literal 走 W-F5 front-nginx 路由)。
- **Status**: ✅ PASS

### 架構約束 gate

| Constraint | Check | Status |
|---|---|---|
| 部署形態:docker 容器內編譯 + multi-stage Dockerfile | W-F2 builder + runtime 兩階段 | ✅ |
| 資料庫:PostgreSQL | N/A(W-F2 為前端、無 DB) | ✅ |
| 快取與 pub-sub:redis | N/A(W-F2 為前端) | ✅ |
| TLS:對外 TLS、HTTP only 僅本機 dev | W-F2 nginx 內 listen 8080 為內部 port、外部 TLS 由 W-F5/W-F6 | ✅ |
| Secret 注入:Docker secrets + `_FILE` pattern | W-F2 範圍 build-arg 注入 VITE_SERVICE_BASE_URL=/api 為非 secret;真 secret(API key 等)留 W-F4 | ✅ |
| DB migration trigger | N/A(W-F2 為前端) | ✅ |
| Port 規劃:對外 `1XXXX` 前綴 | W-F2 EXPOSE 8080 為內部 port、對外由 W-F5 front-nginx 改寫 / W-F7 host port forwarding(per CLAUDE.md §5.2 對外 11080/11443) | ✅ |
| Observability:promtail / Loki / prometheus / grafana | W-F2 範圍外、留 W-F12 ~ W-F14;nginx alpine 預設 access log 走 stdout、未來可接 promtail | ✅ |
| 結構化 log:JSON | W-F2 不修改 nginx access log format(留 W-F12) | ✅ |
| Backup:pg_basebackup + WAL | N/A | ✅ |
| 背景工作:cleanup-job + outbox-worker + backup-job | N/A(W-F2 為前端 static、無背景工作) | ✅ |
| CI/CD platform 不綁定 | W-F2 範圍內 registry 為 placeholder、CI 留 W-F17 | ✅ |

### 開發流程 gate

- **spec-kit 流程紀律**:本 feature 已通過 `/speckit-specify` → `/speckit-clarify`(audit pass)→ `/speckit-plan`(本步驟);**✅ PASS**
- **兩段式 commit 紀律**:`quickstart.md` 末尾已明示;**✅ PASS**
- **Commit message 中文 Conventional Commits**:**✅ PASS**
- **Push 確認紀律**:每段 commit 後等 user 同意(per CLAUDE.md §5);**✅ PASS**
- **TLS 紀律**:W-F2 不在 prod TLS 範疇(留 W-F6);**✅ PASS**(N/A)
- **DESIGN 文件權威**:本 feature spec/plan 引用 DESIGN-W-DEPLOYMENT §2.2/§3.3/§11;**✅ PASS**

### Complexity Tracking

> **無 Constitution 違規需要 justify** — 全部 23 個 gate(Principle I-V + 12 架構約束 + 6 開發流程紀律)PASS。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (無) | — | — |

## Project Structure

### Documentation (this feature)

```text
specs/007-dockerfile-base-web/
├── plan.md                      # 本檔(/speckit-plan 產出)
├── research.md                  # Phase 0 - 9 個 R-XXX 解 assumption
├── data-model.md                # Phase 1 - 7 個 entity
├── quickstart.md                # Phase 1 - 12 acceptance scenarios reproducer + SC verification + troubleshooting
├── spec.md                      # /speckit-specify 產出
├── contracts/
│   ├── health-endpoint.openapi.yaml
│   └── dockerfile-structure.md       # C-D1 ~ C-D7
├── checklists/
│   └── requirements.md          # spec quality validation PASS
└── tasks.md                     # Phase 2 - /speckit-tasks 待產出
```

### Source Code (repository root)

```text
# === outer repo (rev1-admin-root,本 feature branch 007-dockerfile-base-web)===
fork260509-rev1/
├── docs/superpowers/
│   └── 007-feature-dockerfile-base-web.md   # brainstorm 產出(commit c92dc52 on rev1-admin-root)
├── specs/007-dockerfile-base-web/            # 本 feature 文件
├── CLAUDE.md                                 # SPECKIT marker 將更新指向本 plan
└── .specify/feature.json                     # 已更新 feature_directory = specs/007-dockerfile-base-web

# === base-web worktree(rev1-admin-base-web 分支,實作落地處)===
base-web/                                     # submodule + worktree
├── Dockerfile                                # W-F2 新建(主)
├── .dockerignore                             # W-F2 新建
└── deploy/
    └── nginx.conf                            # W-F2 新建(含新子目錄)
```

**Structure Decision**:單一 feature、單一 PR、改動集中在 `base-web/` worktree(主)+ outer `specs/`(spec docs)。實作走兩段 commit:

1. **第一段**(base-web worktree → rev1-admin-base-web):3 個新建檔
2. **第二段**(outer feature branch 007-dockerfile-base-web):specs 全套 + base-web submodule SHA pin

## Phase 0 完成:research.md(已產出)

詳見 [research.md](research.md)。關鍵 finding:
- **R-001**: base-web workspace 0 native binding,pnpm install + Vite build 在 node:22-slim 預期 pass(plan T1 驗)
- **R-002**: Vite 7 loadEnv merge process.env 並 override .env files → Q2 build-arg pattern work(plan T2 驗)
- **R-003**: package.json 無 packageManager field、Dockerfile 顯式 `corepack prepare pnpm@10.18.0 --activate` 解 reproducibility
- **R-004**: nginx alpine uid 預期 101、AC-4 驗實際數值
- **R-005**: deps-first COPY 含 `packages/` 整 dir
- **R-006**: nginx location 優先級 `=` > `~*` > `/`
- **R-007**: `location /` 須顯式 `Cache-Control no-cache` header 才確保 deploy 新版生效(**spec FR-019 補強**)
- **R-008**: BuildKit cache mount target `/root/.local/share/pnpm/store`
- **R-009**: image size 估計 60-110MB

## Phase 1 完成:data-model + contracts + quickstart(已產出)

- [data-model.md](data-model.md):7 entity
- [contracts/health-endpoint.openapi.yaml](contracts/health-endpoint.openapi.yaml)
- [contracts/dockerfile-structure.md](contracts/dockerfile-structure.md):C-D1 ~ C-D7
- [quickstart.md](quickstart.md):12 acceptance scenarios + SC 對照 + troubleshooting

## Constitution Check Re-evaluation(post-Phase 1)

Phase 1 設計與 Phase 0 拍板一致、無新引入機制,Constitution gate **23/23 PASS、0 violation**。可進 Phase 2。

## Next phase

下一步:`/speckit-tasks` 將產出 `tasks.md`(Phase 2)— dependency-ordered task list。預期 task 結構(對齊 W-F1 模式):
- **P1 Setup**:branch / worktree state / docker buildx / disk / arch / packageManager field 確認
- **P2 Foundational**:T1(host pnpm install + build 驗 R-001)/ T2(image build + dist grep `/api` 驗 R-002)/ T3(nginx user uid 確認 R-004)
- **P3 Implementation**:Dockerfile + .dockerignore + deploy/nginx.conf 3 個新建檔
- **P4 Acceptance**:12 個 scenario(Dimension A-E)
- **P5 Polish**:兩段式 commit + push + merge + checklist 更新
