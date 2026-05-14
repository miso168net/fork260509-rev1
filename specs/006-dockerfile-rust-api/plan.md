# Implementation Plan: W-F1 — dockerfile-rust-api

**Branch**: `006-dockerfile-rust-api` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-dockerfile-rust-api/spec.md`

## Summary

把 rust-api 既有 alpine+musl Dockerfile **改寫為 rev1 deploy 規劃版本**(debian+glibc multi-stage),產出單一 image 含 server + migration 兩個 binary。範圍刻意收緊:只動 Dockerfile 結構 + 新增 `/health` endpoint(rust-api 既有 codebase 沒有此 endpoint、W-F3 healthcheck 必須依賴) + 配套 `.dockerignore` 微調 + 配套 router_initialization.rs 加 mount + Dockerfile `ENV APP_SERVER_PORT=11081` env override(走 F1.1 模式不動 application.yaml 內容)。

**Technical approach**(per [research.md](research.md)):
- **Builder**:`rust:1.86-slim-bookworm` + apt `pkg-config libssl-dev ca-certificates git` + BuildKit cache mount × 3 + 一次 build `--bin server --bin migration` + strip
- **Runtime**:`debian:bookworm-slim` + apt `ca-certificates libssl3 curl tzdata` + non-root `rust-api`(uid 10001) + COPY 2 binary + 3 resources + ENV(TZ/LANG/RUST_ENV/APP_SERVER_PORT) + ENTRYPOINT server
- **`/health` endpoint**:在 `server/initialize/src/router_initialization.rs` `initialize_admin_router()` fn 末尾 append `app = app.merge(Router::new().route("/health", get(|| async { "ok" })))`,**跳過 apply_layers**(自動 silent INFO log + public + no Casbin)
- **Image tagging**:DESIGN-W §2.4 3 個 pattern(short-sha / branch / prod-date),不 `:latest`,registry 留 W-F17

**Pre-build validation tasks**(plan 階段執行、解 spec.md Assumption):
- T1: host 跑 `cargo build --release --bin server --bin migration` 驗 debian glibc 環境可 build(R-001)
- T2: 驗 `APP_SERVER_PORT=11081` env binding 真的 work(R-002)
- T3: implement `/health` route mount 在 `initialize_admin_router()` 末尾
- T3b: integration test 驗 /health 不過 layers + silent INFO log

## Technical Context

**Language/Version**: Rust 1.86 (minor pin via `rust:1.86-slim-bookworm` builder image;`Cargo.lock` 保 dep reproducibility;無 `rust-toolchain.toml`)
**Primary Dependencies**:
- **Builder side**:`axum 0.8.4` / `sea-orm` / `tokio` / `tracing` / `tracing-subscriber` / `config` crate (config-rs) / `envy` / `axum-casbin`(workspace 30+ crate)
- **Container side**:`debian:bookworm-slim` base + apt packages `ca-certificates libssl3 curl tzdata`
**Storage**: N/A(W-F1 範圍內 image 不持久化任何 state;runtime 仰賴外部 postgres + redis 由 W-F3 / W-F4 / W-F8 提供)
**Testing**: 多層:
- **Build verification**:`docker build`(scenario 1 / 2 / 3)
- **Container introspection**:`docker run --entrypoint whoami / id / ls`(scenarios 4-6)
- **Binary CLI**:`migration help`(scenario 7)
- **Integration (with minimal stack)**:`curl /health` 200 + silent log(scenarios 10-12b)
- **Source code grep**(scenarios 12 / 13)
- **Tag合法性**:`docker build -t` × 多種模式(scenarios 14-15)
- **Future regression**:F5.1 acceptance subset 跑 W-F1 image 驗 musl→glibc 不破壞既有功能(SC-008、post-implement)
**Target Platform**: `linux/amd64`(per Q2 clarify);docker host = WSL2 Linux x86_64 + GHA Linux runner(W-F17)
**Project Type**: infrastructure / deploy feature(rev1 deploy P1 第一個 — 為 W-F2 ~ W-F18 提供基礎 image)
**Performance Goals**:
- 第一次無 cache build: 5-10 分鐘(SC-001)
- 第二次有 cache build: < 1 分鐘(SC-003)
- `/health` p99 latency: < 50ms local docker network(SC-004)
- image size: < 250MB target / 250-300MB acceptable / > 300MB optimize(SC-002 + edge case)
**Constraints**:
- `MUST NOT` 動 cleanup-job / outbox-worker binary 形態(留 W-F9/W-F10)、compose 結構(留 W-F3)、secret 注入(留 W-F4)、TLS(W-F5/W-F6)、CI pipeline(W-F17)…(per FR-021 全列)
- `MUST NOT` 改 rust 源碼 **except** 新增 `/health` endpoint mount(per FR-022)
- `MUST NOT` 改 application.yaml 內容(走 env override、per FR-023 + Q1 clarify)
- `MUST NOT` 預埋多 arch build 機制(per FR-021 update + Q2 clarify)
**Scale/Scope**:
- 範圍 = 1 個 Dockerfile + 1 個 `.dockerignore` 微調 + 1 個 router_initialization.rs 末尾 ~3-5 行 + 預期 implementer 改動 < 100 lines
- 跨 Workspace 30+ crate 編譯影響 image content(不重新動 crate 內 source)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 5 個 Principle + 架構約束逐項 gate check:

### Principle I — RBAC Fail-safe(Casbin 後端強制)

- **Gate**: W-F1 是否破壞 Casbin enforcement 為唯一 authorization 權威?
- **Check**: `/health` endpoint mount **不過** axum_casbin layer(per FR-014 + R-003 拍板)— 但 `/health` 屬於 ops infra endpoint、不是業務 endpoint、不涉及 authorization 決策。Constitution Principle I 規範「**受保護** endpoint MUST 執行 Casbin enforcement」;`/health` 屬 public probe、設計上不受保護、與 Principle I 規範不衝突。
- **Status**: ✅ PASS

### Principle II — Soft Delete + 全域 Audit Log(NON-NEGOTIABLE)

- **Gate**: W-F1 是否破壞 soft delete + audit log 完整性?
- **Check**: W-F1 範圍內無 DB 寫入、無 entity DELETE 操作、無 sys_operation_log 寫入路徑改動。`/health` endpoint 不查 DB、不寫 audit row(per FR-015)— 但 `/health` 不是業務寫入、Principle II 「所有寫入 MUST 寫 audit」規範對其不適用。
- **Status**: ✅ PASS

### Principle III — 嚴版禁 Forward + 單一職責

- **Gate**: W-F1 是否引入 backend forward / 模糊 endpoint ownership?
- **Check**: W-F1 範圍內無 HTTP/RPC forward 改動、無 nginx config 改動。`/health` endpoint 由 rust-api 自身 own、不 forward 其他 backend。Principle III 「每個 endpoint 只由一個後端負責 enforcement」 — `/health` 由 rust-api 負責、明示 owner。
- **Status**: ✅ PASS

### Principle IV — base 不改動邊界

- **Gate**: W-F1 是否動 base-web source?
- **Check**: W-F1 範圍 = `rust-api/` worktree(Dockerfile + router + .dockerignore)+ outer `specs/006-dockerfile-rust-api/`。**完全不動 base-web**。
- **Status**: ✅ PASS

### Principle V — 漸進收縮(DESIGN-A 過渡 → DESIGN-B 終局)

- **Gate**: W-F1 是否引入 nestjs 耦合或 schema 改動?
- **Check**: W-F1 是 rust-api 自身 Dockerfile + endpoint 新增,**完全不涉及 nestjs**;不改 DB schema、不改 JWT secret 格式、不改 Casbin policy 結構、不改 redis pub-sub channel 名。「未來 nestjs 拔掉時順嗎」濾鏡 = ✓(nestjs 拔了 W-F1 image 一樣 work)。
- **Status**: ✅ PASS

### 架構約束 gate

| Constraint | Check | Status |
|---|---|---|
| 部署形態:docker 容器內編譯 + multi-stage Dockerfile | W-F1 builder + runtime 兩階段、container 內 cargo build | ✅ |
| 資料庫:PostgreSQL + rust 主導 migration | W-F1 image 含 migration binary、供 W-F8 init container 用、走 rust workspace 內 sea-orm migration | ✅ |
| 快取與 pub-sub:redis 必要 | W-F1 image 啟動 require `APP_REDIS_URL` env(per Constitution + Q1 clarify 不在 W-F1 範疇加入但 image 期望 W-F4 注入) | ✅ |
| TLS:對外 TLS、HTTP only 僅限本機 dev | W-F1 範圍內 EXPOSE 11081 為內部 port、front-nginx 反向代理 + TLS 終止留 W-F5/W-F6 | ✅ |
| Secret 注入:Docker secrets + `_FILE` pattern | W-F1 範圍內 ENV 只注入非 secret(TZ / LANG / RUST_ENV / APP_SERVER_PORT);secret env 留 W-F4 | ✅ |
| DB migration trigger:init container 模式 | W-F1 image 同時含 server + migration binary,W-F8 init container 透過 entrypoint override 使用 migration | ✅ |
| Port 規劃:對外 `1XXXX` 前綴 | W-F1 EXPOSE 11081(per CLAUDE.md §5.2 rev1 提議 + Q1 clarify) | ✅ |
| Observability:promtail + Loki + prometheus + grafana | W-F1 範圍內無 observability stack(留 W-F12-14);**但** `/health` endpoint 與 silent INFO log 為 W-F12/W-F13 階段做準備 | ✅ |
| 結構化 log JSON 格式 | W-F1 範圍內無修改 tracing-subscriber 配置(留 W-F12);既有 rust-api 預設用 tracing-subscriber、JSON formatter 可在 W-F12 階段啟用 | ✅ |
| Backup:pg_basebackup + WAL archive(PITR)| W-F1 範圍外(留 W-F15) | ✅(out of scope) |
| 背景工作:cleanup-job + outbox-worker + backup-job | W-F1 image 預備支援(共 image 不同 entrypoint),但具體 binary 形態與 cron 配置留 W-F9/W-F10/W-F15 | ✅(image-level 支援、配置外推) |
| CI/CD platform 不綁定 | W-F1 範圍內 registry 為 placeholder、無 CI 配置;留 W-F17 | ✅ |

### 開發流程 gate

- **spec-kit 流程紀律**:本 feature 已通過 `/speckit-specify` → `/speckit-clarify` → `/speckit-plan`(本步驟);**✅ PASS**
- **兩段式 commit 紀律**:本 feature `quickstart.md` 末尾已明示兩段 commit 步驟(rust-api worktree + outer feature branch);**✅ PASS**
- **Commit message 中文 Conventional Commits**:沿用 CLAUDE.md §6.3 紀律;**✅ PASS**
- **Push 確認紀律**:每段 commit 後等 user 同意才 push(per CLAUDE.md §5);**✅ PASS**
- **TLS 紀律**:W-F1 不在 prod TLS 範疇(EXPOSE 內部 port);**✅ PASS**(N/A)
- **DESIGN 文件權威**:本 feature `spec.md` 與 `plan.md` 引用 DESIGN-W-DEPLOYMENT §2.1/§3.3/§7.1/§11;**✅ PASS**

### Complexity Tracking

> **無 Constitution 違規需要 justify** — 全部 12 個 gate(Principle I-V + 12 個架構約束 + 6 個開發流程紀律)PASS。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (無) | — | — |

## Project Structure

### Documentation (this feature)

```text
specs/006-dockerfile-rust-api/
├── plan.md                      # 本檔(/speckit-plan 產出)
├── research.md                  # Phase 0 - 6 個 R-XXX 解 assumption
├── data-model.md                # Phase 1 - 6 個 entity(image/binary/resources/env/health/dockerignore)
├── quickstart.md                # Phase 1 - 15 個 acceptance scenario reproducer + troubleshooting
├── spec.md                      # /speckit-specify 產出 + /speckit-clarify 更新
├── contracts/
│   ├── health-endpoint.openapi.yaml  # /health endpoint OpenAPI 3.1.0
│   └── dockerfile-structure.md       # Dockerfile 結構約束(C-D1 ~ C-D7)
├── checklists/
│   └── requirements.md          # spec quality validation(已 PASS)
└── tasks.md                     # Phase 2 - /speckit-tasks 待產出
```

### Source Code (repository root)

```text
# === outer repo (rev1-admin-root,本 feature branch 006-dockerfile-rust-api)===
fork260509-rev1/
├── docs/superpowers/
│   └── 006-feature-dockerfile-rust-api.md   # brainstorming 產出(已 commit 78b0e84)
├── specs/006-dockerfile-rust-api/            # 本 feature 文件(per 上)
├── CLAUDE.md                                 # SPECKIT marker 將更新指向本 plan
└── .specify/feature.json                     # 已更新 feature_directory = specs/006-dockerfile-rust-api

# === rust-api worktree(rev1-admin-rust-api 分支,實作落地處)===
rust-api/                                     # submodule + worktree
├── Dockerfile                                # W-F1 覆寫(主要改動 ~80 lines)
├── .dockerignore                             # W-F1 微調(< 10 lines 改動)
└── server/
    └── initialize/src/
        └── router_initialization.rs          # W-F1 末尾加 ~3-5 行 /health route mount
```

**Structure Decision**:單一 feature、單一 PR、改動集中在 `rust-api/` worktree(主要)+ outer `specs/`(spec docs)。實作走兩段 commit(per CLAUDE.md §6.1 + quickstart.md):

1. **第一段**(rust-api worktree → rev1-admin-rust-api 分支):
   - `rust-api/Dockerfile` 覆寫
   - `rust-api/.dockerignore` 微調(若需要)
   - `rust-api/server/initialize/src/router_initialization.rs` 加 /health mount

2. **第二段**(outer feature branch 006-dockerfile-rust-api):
   - `specs/006-dockerfile-rust-api/` 全套 spec docs(已落本 plan 階段)
   - `rust-api` submodule SHA pin 更新(by `git add rust-api`)
   - 完成後 merge 回 `rev1-admin-root`

## Phase 0 完成:research.md(已產出)

詳見 [research.md](research.md)。

關鍵 finding 摘要:
- **R-001**: rust-api workspace 0 musl-specific dep,debian glibc 預期 build pass(plan T1 驗)
- **R-002**: 既有 `EnvConfigLoader` 用 `config` crate prefix `"APP"` + sep `"_"` → `APP_SERVER_PORT=11081` 直接 work(plan T2 驗)
- **R-003**: `/health` mount 在 `initialize_admin_router()` 末尾 `app.merge(Router::new().route("/health", get(|| async { "ok" })))`,跳過 apply_layers 自動 silent log + public(plan T3)
- **R-004**: rust 1.86 minor pin OK、無需 patch pin
- **R-005**: BuildKit cache mount × 3 沿用既有 pattern
- **R-006**: 3 個 prod resource 確認(application.yaml + ip2region.xdb + rbac_model.conf);WORKDIR /app 與既有相對 path 對齊

## Phase 1 完成:data-model + contracts + quickstart(已產出)

- [data-model.md](data-model.md):6 個 entity — E1 image / E2 binary(server+migration)/ E3 resources(3 個檔)/ E4 env override / E5 /health endpoint / E6 .dockerignore
- [contracts/health-endpoint.openapi.yaml](contracts/health-endpoint.openapi.yaml):OpenAPI 3.1.0 對 `GET /health`、含 4 個 acceptance scenarios reference
- [contracts/dockerfile-structure.md](contracts/dockerfile-structure.md):Dockerfile 結構約束 C-D1 ~ C-D7(ARG / builder stage / runtime stage / stage 命名 / forbidden patterns / .dockerignore / image 屬性 contract)
- [quickstart.md](quickstart.md):15 個 acceptance scenarios 逐項 reproducer + 8 個 SC verification 對照 + 4 個 Troubleshooting 點 + 兩段式 commit 步驟

## Constitution Check Re-evaluation(post-Phase 1)

Phase 1 設計產物(data-model / contracts / quickstart)是否引入新的 Constitution 違規?

| Gate | Re-check | Status |
|---|---|---|
| Principle I-V 同上 | 設計產物只描述 spec.md 已 ratify 的決策、無新引入機制 | ✅ PASS(no change) |
| 架構約束 12 項同上 | 同上 | ✅ PASS(no change) |
| 開發流程紀律同上 | 同上 | ✅ PASS(no change) |

**Conclusion**:Phase 1 設計與 Phase 0 拍板一致,Constitution gate 全 PASS,**可進 Phase 2 `/speckit-tasks`**。

## Next phase

下一步:`/speckit-tasks` 將產出 `tasks.md`(Phase 2)— dependency-ordered task list 含:

預期 task 結構:
- **P0 Setup**:branch check / worktree state confirm / docker buildx check
- **P1 Pre-implement validation**:T1(cargo build debian glibc 驗) / T2(APP_SERVER_PORT env binding 驗)
- **P2 rust-api worktree implementation**(實作落地):
  - T-A Dockerfile 覆寫(builder + runtime stages)
  - T-B .dockerignore 微調
  - T-C `/health` route mount in router_initialization.rs
  - T-D(可選)補 unit test 驗 health_handler returns "ok"
- **P3 acceptance test**:Dimension A-E 15 scenarios 逐項驗(per quickstart.md)
- **P4 commit + push 第一段**:rust-api worktree → rev1-admin-rust-api(需 user 確認 push)
- **P5 outer feature branch 落地**:bump submodule SHA + commit spec docs
- **P6 merge to rev1-admin-root**:feature branch merge + 解鎖 W-F2/W-F3/W-F4

每個 task 依 dependency graph 排序、parallel-marker 標明可同時跑的 task。
