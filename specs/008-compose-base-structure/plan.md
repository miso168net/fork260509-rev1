# Implementation Plan: W-F3 — compose-base-structure

**Branch**: `008-compose-base-structure` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-compose-base-structure/spec.md`

## Summary

從 0 建立 outer repo root `docker-compose.yml`(+ `.env.example`)將 W-F1 rust-api image + W-F2 base-web image + postgres + redis + migration init container 組成 5 service docker-compose stack。範圍刻意收緊到 5 個 core service,其他 service(front-nginx / observability / backup / cleanup-job / outbox-worker / nestjs)全留後續 W-F feature(W-F4 ~ W-F18 + W-FA1)。

**Technical approach**(per [research.md](research.md)):
- **5 services**:
  - `postgres:17.4`(Q1 sticky to W-F1 verified、修既有 compose.yaml 4 個 bug)
  - `redis/redis-stack:7.4.0-v3`(Q2)
  - `migration`(rust-api image + entrypoint `/usr/local/bin/migration` + command `up`,one-shot init container)
  - `rust-api`(W-F1 image,等 migration + DB + redis healthy 才啟)
  - `base-web`(W-F2 image,SPA static,無 backend dep)
- **Network**:1 個 bridge `internal`、5 service 全 attach、無對外 host port(Q3)
- **Volumes**:2 named volumes(`postgres_data:/var/lib/postgresql/data`、`redis_data:/data`),per R-003 正解
- **Healthcheck + depends_on**:per DESIGN-W §3.3 + R-007 service_healthy / service_completed_successfully chain
- **Secret 過渡簡化**:`environment:` direct env(W-F4 升 `_FILE` pattern)
- **COMPOSE_PROJECT_NAME**:`rev1-admin`(per CLAUDE.md §5.2)

**Pre-implement validation tasks**(plan/implement 階段執行、解 spec.md Assumption + R-001~R-011):
- **T1**:`docker image ls rust-api base-web` 確認 W-F1 / W-F2 image local 存在(per Assumption「W-F1/W-F2 image 已 build local」)
- **T2**:`docker compose version` 確認 v2+(per R-007 depends_on long-syntax 需 v2)
- **T3**:host pull `postgres:17.4` + `redis/redis-stack:7.4.0-v3` confirm(per R-001、W-F1 acceptance T040 已驗、但 plan 階段重 check)
- **T4**:寫完 docker-compose.yml + .env.example 後 `docker compose config` 渲染驗 syntax(per FR-002 + Scenario 3)

## Technical Context

**Language/Version**: docker-compose v2 file format(不寫 `version:` 段、per R-008 modern convention)、docker compose CLI v2.x

**Primary Dependencies**:
- **Runtime images(外部)**:`postgres:17.4` / `redis/redis-stack:7.4.0-v3` / W-F1 rust-api image / W-F2 base-web image
- **W-F1 / W-F2 contracts C-D7 image 屬性**:ENTRYPOINT / EXPOSE / USER / /health 全引用

**Storage**: 2 named volumes(`postgres_data` / `redis_data`);其他 6 個 volume(`postgres_wal` / `loki_data` / `prometheus_data` / `grafana_data` / `acme_certs` / `backup_archive`)留 W-F12-16

**Testing**: 多層:
- **Compose syntax**:`docker compose config`(Scenario 3)
- **Stack startup**:`docker compose up -d`(Scenario 1)
- **Status**:`docker compose ps`(Scenario 2)
- **Healthcheck chain**:logs + inspect(Scenarios 4-8)
- **Network**:`docker compose exec ... getent hosts`(Scenario 9)
- **Volume persistence**:`docker compose down + up` + DB query(Scenario 10)
- **Port isolation**:host `nc -zv`(Scenario 11)
- **Secret failure mode**:無 secret 時 stack fail(Scenarios 12-14)
- **Cleanup**:`down` + `down -v` + `restart` 行為(Scenarios 15-17)

**Target Platform**: `linux/amd64`(per W-F1 Q2 inherit)

**Project Type**: infrastructure / deploy feature(rev1 deploy Phase W P1 第三個 — 將 W-F1 + W-F2 image 與 postgres/redis 組合成可運行 stack)

**Performance Goals**:
- Stack cold startup: < 60 sec(SC-001;包括 image cached 場景下 postgres / redis healthcheck pass + migration 跑完 + rust-api/base-web 進 healthy)
- /health p99 latency: < 50ms local docker network(SC-003)
- `docker compose up -d` exit 0 後 / `ps` 全 healthy 之間 wait time: < 90 sec

**Constraints**:
- `MUST NOT` 動 W-F1 image / W-F2 image 內部結構(per FR-021)
- `MUST NOT` 動 nestjs(Track A、per FR-022,留 W-FA1)
- `MUST NOT` 動 secret 完整 `_FILE` pattern(per FR-023、留 W-F4)
- `MUST NOT` 動 front-nginx / TLS / 對外 port forwarding(per FR-024、留 W-F5 / W-F6 / W-F7)
- `MUST NOT` 動 observability stack(per FR-025、留 W-F12-14)
- `MUST NOT` 動 backup / DR / CI(per FR-026、留 W-F15-18)
- `MUST NOT` 動 cleanup-job / outbox-worker(per FR-027、留 W-F9-10)

**Scale/Scope**:
- 範圍 = 2 個新建檔(`docker-compose.yml` ~ 100 lines + `.env.example` ~ 25 lines)+ 1 個 `.gitignore` 補(加 `/.env`)
- 預期 implementer 改動 < 150 lines

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 5 Principle + 12 架構約束 + 6 開發流程逐項 gate check:

### Principle I — RBAC Fail-safe(Casbin 後端強制)

- **Gate**: W-F3 是否破壞 Casbin enforcement?
- **Check**: W-F3 為 docker-compose 配置層、無 application-level RBAC 邏輯。引用 W-F1 rust-api image(其內 Casbin enforce 已 wire)、由 rust-api healthcheck + secret 提供保證 service 起來時 Casbin layer 健康。**MUST NOT** 在 compose 內繞過 Casbin(無 admin-bypass env / 無 disable flag)。
- **Status**: ✅ PASS

### Principle II — Soft Delete + 全域 Audit Log

- **Gate**: W-F3 是否破壞 soft delete + audit log?
- **Check**: W-F3 不動 DB schema / 不動 audit 寫入路徑、只起 postgres + rust-api。其中 sys_operation_log 等 audit-related table 由 migration `up` 建立、rust-api runtime 寫入。W-F3 確保 stack 完整起、不破壞 audit 機制。
- **Status**: ✅ PASS

### Principle III — 嚴版禁 Forward + 單一職責

- **Gate**: W-F3 是否引入 backend forward / 模糊 endpoint ownership?
- **Check**: 5 service 之間**完全不 HTTP forward**(rust-api 不呼 base-web、base-web 不呼 rust-api)。它們透過 internal bridge network DNS 互找,但每個 service 只負責自己職責:postgres 管 DB、redis 管 cache/pub-sub、rust-api 管 backend、base-web 管 SPA static。base-web 不依賴 rust-api 啟動順序(per FR-010、R-011),前端瀏覽器→base-web 取 static、瀏覽器→ rust-api 取 API(但這走 W-F5 front-nginx 反代,W-F3 範圍外)。
- **Status**: ✅ PASS

### Principle IV — base 不改動邊界

- **Gate**: W-F3 是否動 base-web source?
- **Check**: W-F3 範圍 = outer repo root 新建 `docker-compose.yml` + `.env.example` + `.gitignore` 補 `/.env`。**完全不動 base-web worktree、不動 rust-api worktree**(per FR-021、引用 image 而非 build)。
- **Status**: ✅ PASS

### Principle V — 漸進收縮(DESIGN-A 過渡 → DESIGN-B 終局)

- **Gate**: W-F3 是否引入 nestjs 耦合?
- **Check**: W-F3 範疇 5 service **完全不含 nestjs**(per FR-022、Track A 留 W-FA1)。「未來 nestjs 拔掉時順嗎」濾鏡 = ✓(W-F3 stack 本就不依賴 nestjs)。未來 W-FA1 加 nestjs 走 `profiles: ["track-a"]` 預設不啟、不污染 W-F3 base 結構。
- **Status**: ✅ PASS

### 架構約束 gate

| Constraint | Check | Status |
|---|---|---|
| 部署形態:docker-compose 單機部署 | W-F3 即 docker-compose 形態 | ✅ |
| 資料庫:PostgreSQL 唯一持久狀態 | `postgres:17.4` 為唯一 DB(per FR-002 / R-009 不含 pgbouncer 等) | ✅ |
| 快取與 pub-sub:redis 必要依賴 | `redis/redis-stack` 內含、rust-api 依 redis healthy 才啟 | ✅ |
| TLS:對外 TLS、HTTP only 限 dev | W-F3 不對外暴露 host port(per Q3、FR-024),對外 TLS 由 W-F6/W-F7 處理 | ✅(N/A in W-F3 scope) |
| Secret 注入:Docker secrets + `_FILE` pattern 為 prod 預設 | W-F3 過渡簡化模式(per spec Assumption + FR-017),W-F4 升 `_FILE`;dev 場景 Constitution 接受 envvar fallback | ✅(過渡接受) |
| DB migration trigger:init container | `migration` service `restart: "no"` + `depends_on.postgres.condition: service_healthy`,rust-api `depends_on.migration.condition: service_completed_successfully`(per FR-008 / FR-009) | ✅ |
| Port 規劃:對外 `1XXXX` 前綴 | W-F3 不開對外 port(per Q3 + FR-024),對外 port 規劃由 W-F7 落地 | ✅(deferred) |
| Observability stack 必要 | W-F3 範圍外(留 W-F12-14),per spec scope summary | ✅(deferred) |
| 結構化 log JSON 格式 | W-F3 不動 log 配置(留 W-F12) | ✅(deferred) |
| Backup:pg_basebackup + WAL archive | W-F3 範圍外(留 W-F15-16) | ✅(deferred) |
| 背景工作:cleanup / outbox / backup | W-F3 範圍外(留 W-F9 / W-F10 / W-F15) | ✅(deferred) |
| CI/CD platform 不綁定 | W-F3 不含 CI 配置(留 W-F17-18) | ✅ |

### 開發流程 gate

- **spec-kit 流程紀律**:本 feature 通過 `/speckit-specify` → `/speckit-clarify`(3 Q 拍板) → `/speckit-plan`(本步驟);**✅ PASS**
- **單段 commit 紀律**:W-F3 不動 worktree、只動 outer repo,適用 CLAUDE.md §6.2 單段 commit 模式;**✅ PASS**
- **Commit message 中文 Conventional Commits**:**✅ PASS**
- **Push 確認紀律**:每 commit 後等 user 同意 push(per CLAUDE.md §5);**✅ PASS**
- **TLS 紀律**:W-F3 不在 prod TLS 範疇;**✅ PASS**(N/A)
- **DESIGN 文件權威**:本 feature spec/plan 引用 DESIGN-W-DEPLOYMENT §3.1-§3.4 + §11.1-§11.2;**✅ PASS**

### Complexity Tracking

> **無 Constitution 違規需要 justify** — 全部 23 個 gate(5 Principle + 12 架構約束 + 6 開發流程)PASS。
>
> W-F3 過渡 secret 模式對「Docker secrets + `_FILE` 為 prod 預設」是**過渡 / 接受**而非違反(per spec Assumption 紀錄)— W-F4 升級到完整 `_FILE` pattern;當前 W-F3 處於 P1 base 結構階段、dev 場景 Constitution 接受 envvar(per F1.1 spec 雙 mode 並存)。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (無) | — | — |

## Project Structure

### Documentation (this feature)

```text
specs/008-compose-base-structure/
├── plan.md                      # 本檔(/speckit-plan 產出)
├── research.md                  # Phase 0 - 11 個 R-XXX 解 assumption + new findings
├── data-model.md                # Phase 1 - 6 個 entity(compose / services / network / volumes / env / external image refs)
├── quickstart.md                # Phase 1 - 17 acceptance scenarios reproducer + SC verification + troubleshooting
├── spec.md                      # /speckit-specify 產出 + /speckit-clarify 3 拍板
├── contracts/
│   └── compose-structure.md     # C-C1 ~ C-C11 結構約束
├── checklists/
│   └── requirements.md          # spec quality validation PASS
└── tasks.md                     # Phase 2 - /speckit-tasks 待產出
```

### Source Code (repository root)

```text
# === outer repo (rev1-admin-root,本 feature branch 008-compose-base-structure)===
fork260509-rev1/
├── docker-compose.yml            # 新建(主、~100 lines)
├── .env.example                  # 新建(範本、~25 lines)
├── .gitignore                    # 補 `/.env` 一行
├── specs/008-compose-base-structure/  # 本 feature 文件
├── CLAUDE.md                     # SPECKIT marker 將更新指向本 plan
└── .specify/feature.json         # 已更新 feature_directory = specs/008-compose-base-structure
```

**Structure Decision**:單一 feature、單一 PR、改動全在 **outer repo root**(無 worktree 改動)。實作走**單段 commit**(per CLAUDE.md §6.2 workspace-level docs 改動模式,**不**走兩段)。

實作落地步驟:
1. 新建 `docker-compose.yml`(per contracts C-C1~C-C8)
2. 新建 `.env.example`(per contracts C-C1)
3. 補 `.gitignore` 加 `/.env`
4. acceptance test 跑通(per quickstart.md 17 scenarios)
5. commit + push(user 同意後)
6. merge 回 `rev1-admin-root`
7. INTEGRATION-CHECKLIST.md 更新 Phase W deploy P1 進度 2/4 → 3/4

## Phase 0 完成:research.md(已產出)

詳見 [research.md](research.md)。關鍵 finding:
- **R-001**: postgres:17.4 + redis/redis-stack:7.4.0-v3 由 W-F1 acceptance T040 已驗
- **R-002**: `/usr/local/bin/migration` CLI `up` subcommand confirmed
- **R-003**: postgres data dir `/var/lib/postgresql/data`(修既有 compose.yaml bug)
- **R-004**: postgres healthcheck `$$` escape work
- **R-005**: COMPOSE_PROJECT_NAME=rev1-admin → resources prefix `rev1-admin_*`
- **R-006**: URL encode password 警告 + `.env.example` 預設 hex string
- **R-007**: depends_on long-syntax `condition` 需 compose v2+
- **R-008**: 不寫 `version:` 段(modern compose convention)
- **R-009**: 既有 `rust-api/compose.yaml` 4 個 bug 不繼承、不刪
- **R-010 / R-011**: rust-api / base-web healthcheck 對齊 W-F1/W-F2 contracts C-D7

## Phase 1 完成:data-model + contracts + quickstart(已產出)

- [data-model.md](data-model.md):6 個 entity — E1 compose / E2 services (5 個) / E3 network / E4 volumes / E5 env / E6 external image refs
- [contracts/compose-structure.md](contracts/compose-structure.md):C-C1 ~ C-C11 結構約束(env / services / postgres / redis / migration / rust-api / base-web / network+volume / forbidden patterns / image refs / operator 命令)
- [quickstart.md](quickstart.md):17 acceptance scenarios reproducer + 8 SC 對照 + troubleshooting + single-stage commit workflow

## Constitution Check Re-evaluation(post-Phase 1)

Phase 1 設計與 Phase 0 拍板一致、無新引入機制,Constitution gate **23/23 PASS、0 violation**。可進 Phase 2。

## Next phase

下一步:`/speckit-tasks` 產出 `tasks.md`(Phase 2)。預期 task 結構(對齊 W-F1 / W-F2 模式):
- **P1 Setup**:branch / docker compose v2 / W-F1+W-F2 image 已存在驗
- **P2 Foundational**:T10 host pull postgres + redis image / T11 `docker compose version` 驗 / T12 .env 模板齊備
- **P3 Implementation**:T20 寫 docker-compose.yml / T21 寫 .env.example / T22 補 .gitignore
- **P4 Acceptance**:17 個 scenario(Dimension A-E)
- **P5 Polish**:單段 commit(W-F3 不走兩段)+ merge + INTEGRATION-CHECKLIST update
