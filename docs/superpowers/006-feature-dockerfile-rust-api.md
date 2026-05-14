# Feature Specification: W-F1 — dockerfile-rust-api

**Feature ID**: W-F1（per [`DESIGN-W-DEPLOYMENT`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11.1 Phase W-1 P1 — deploy 階段第一個 feature）
**Feature Branch**: TBD（spec-kit `/speckit-specify` 階段建立,預期 `006-dockerfile-rust-api`）
**Created**: 2026-05-15
**Status**: Draft（brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec）
**Source**: superpowers:brainstorming 2026-05-15 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §2.1（rust-api Dockerfile multi-stage 草稿）、§2.4（image tagging convention）、§3.3（healthcheck 期望）、§7.1（migration init container 共 image 不同 entrypoint）、§7.3-§7.4（cleanup-job / outbox-worker 共 image 不同 command）、§11.1（W-F1 scope 描述）、§11.2（W-F 依賴序 P1 必先 4 個）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle IV「上游驗證」— 既有 Dockerfile alpine+musl 已驗,切 debian+glibc 需重驗）
- [`docs/superpowers/005-feature-auth-login-and-dynamic-menu.md`](005-feature-auth-login-and-dynamic-menu.md)（F5.1,已完成；W-F1 healthcheck 依賴的 `/health` endpoint 與 F5.1 4 個 auth/route endpoint 同屬 server router 結構）
- 既有 [`rust-api/Dockerfile`](../../rust-api/Dockerfile)（alpine+musl 既有版本,W-F1 覆寫對象）
- 既有 [`rust-api/.dockerignore`](../../rust-api/.dockerignore)（W-F1 微調對象）

**Scope summary**:rev1 deploy 階段第一個 feature — 把 rust-api 既有 alpine+musl Dockerfile 改寫為 rev1 deploy 規劃版本(debian+glibc multi-stage)。產出**單一 image 含 server + migration 兩個 binary**,沿用 BuildKit cache mount + non-root user + strip + image tagging convention(DESIGN-W §2.4)。W-F1 範疇刻意收緊:**只動 Dockerfile 結構 + 加一個 `/health` endpoint**(rust-api 既有 codebase 沒有此 endpoint,W-F3 healthcheck 必須依賴此 endpoint)。不動 cleanup-job / outbox-worker binary(留 W-F9 / W-F10)、不動 compose / secret / migration init container 等部署層配套(留 W-F3 / W-F4 / W-F8)、不動 registry / CI push(留 W-F17)。

## Clarifications

### Session 2026-05-15(brainstorming 階段拍板、3 項)

- **Q1**: Base image 走哪一條? 既有 rust-api/Dockerfile 是 alpine+musl(跑得通,F1-F5 都在這上面實作),DESIGN-W §2.1 草稿寫 debian:bookworm-slim+glibc。 → **A: 改寫成 debian+glibc**(DESIGN-W §2.1 草稿)。理由:統一 rev1 deploy 層 base image 為 debian-slim(W-F2 base-web nginx alpine 亦同統一前另議,本決定針對 rust-api);debian ecosystem 廣、未來如要加 jemalloc / 某些 glibc-only 套件較順。代價接受:musl→glibc 切換要重驗 build、image 變大(預估 ~80MB runtime vs alpine ~30MB)、需在 spec 階段 host build 先驗 `cargo build --release --bin server --bin migration` 可跑通(debian glibc 環境)。

- **Q2**: cleanup-job / outbox-worker 這兩個背景工作的 binary 結構 — DESIGN-W §7.3/§7.4 寫 `entrypoint: server, command: [cleanup-job|outbox-worker]`(暗示是 server subcommand),但現在 server-bin 不支援 subcommand。W-F1 scope 怎麼划? → **A: W-F1 只 build server + migration**(既有 2 個 binary)。cleanup-job / outbox-worker 的 binary 形態(server subcommand vs 獨立 crate)留 W-F9 / W-F10 拍板,那時會有實際 cleanup / outbox 邏輯背景。W-F1 Dockerfile 結構支援「未來追加 binary 只是多 1 行 `COPY --from=builder`」,不破壞 image 結構。W-F1 範疇**不動 server-bin code**(此原則例外:Q3 拍板加 `/health` endpoint 屬必要前置 — 因 W-F3 healthcheck 不可能在 W-F1 之後才補)。

- **Q3**: Healthcheck 策略 — DESIGN-W §3.3 寫 `test: ["CMD", "curl", "-f", "http://localhost:11081/health"]`,意味 image 內要裝 curl。runtime base 是 debian:bookworm-slim 預設不含 curl。 → **A: 裝 curl**(跟 DESIGN-W §3.3 草稿一致)。代價接受:curl 全裝 ~4MB(含 libcurl4-openssl 等 deps),但與 wget --spider 替代方案差距不大、與 DESIGN-W §3.3 已寫文字一致避免修文件;且 debug / 容器內手動驗 endpoint 時 curl 比 wget 方便。**配套**:W-F1 範疇額外加 `/health` endpoint(grep 確認既有 rust-api codebase 完全沒有 `health|readyz|liveness` endpoint),約 ~5 行 axum route 在 server router 加 `.route("/health", get(|| async { "ok" }))`,W-F1 acceptance criteria 包含 `curl -f http://<container>:11081/health` 回 200 OK `"ok"`。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rev1 deploy stack 第一個可運行 image 產出(Priority: P1,唯一 US)🎯 MVP

operator 在乾淨 docker 環境執行 `docker build -t rust-api:test rust-api/`,從 rust:1.86-slim-bookworm builder 階段跑 `cargo build --release --bin server --bin migration` 編譯 workspace 30+ crate,builder 結束後切到 debian:bookworm-slim runtime 階段、安裝 ca-certificates + libssl3 + curl + tzdata 4 個 runtime 套件、建立 `rust-api` non-root user(uid 10001)、COPY server + migration binary 到 `/usr/local/bin/`、COPY 3 個 resources(application.yaml + ip2region.xdb + rbac_model.conf)到 `/app/server/resources/`、設定 USER rust-api + EXPOSE 11081 + ENV(TZ/LANG/RUST_ENV)。產出 image size < 250MB。`docker run --rm rust-api:test` 進入正常啟動流程(因無 DB 而 retry,符合預期);`docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help` 顯示 migration CLI help;`docker run --rm --entrypoint whoami rust-api:test` 輸出 `rust-api`;預先準備好 postgres + redis + secret env 後 `docker run -d ... rust-api:test` 起 server、`curl -f http://<container>:11081/health` 回 200 OK `"ok"`。

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F1 5 個交付片段(Dockerfile multi-stage 重寫 / .dockerignore 微調 / `/health` endpoint 新增 / image tagging convention 文件化 / acceptance test 跑通)**不可獨立交付**:

- 單獨重寫 Dockerfile → 沒 `/health` endpoint → W-F3 compose healthcheck 永遠 fail、`depends_on: condition: service_healthy` 整鏈條 block
- 單獨加 `/health` endpoint → 沒 Dockerfile 改寫 → 仍是 alpine+musl、與 DESIGN-W §2.1 不一致、後續 W-F2/W-F3 base image 統一性破
- 單獨拍 tagging convention → 沒 build 跑通 → 沒實際 image 可以 tag、純文件無價值
- 單獨跑 acceptance test → 沒 image 改造 → 跑既有 alpine version、未驗 W-F1 目標
- 單獨改 .dockerignore → 沒主 Dockerfile 改 → 沒人會踩到 .dockerignore 差別

W-F1 是 **rev1 deploy P1 4 個 feature 的最低層基礎** — image build 不通,W-F2(base-web Dockerfile)的 base 對齊、W-F3(compose 結構)的 service 引用、W-F4(secret 注入)的 image 環境變數讀取、W-F8(migration init container)的共 image 不同 entrypoint 全都接不上去。5 個片段是同一個 atomic deploy increment 的 5 個 acceptance dimensions。

**Independent Test**:

1. 從乾淨 host(無 docker layer cache)執行 `cd rust-api && docker build -t rust-api:test .` → build 成功、output 顯示 builder + runtime 兩階段、image size < 250MB ✓
2. `docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help` → 顯示 sea-orm migration CLI help ✓
3. `docker run --rm --entrypoint whoami rust-api:test` → `rust-api` ✓
4. `docker run --rm --entrypoint id rust-api:test` → `uid=10001(rust-api) gid=10001(rust-api)` ✓
5. `docker run -d --name rust-api-test \
       -e APP_JWT_JWT_SECRET="$(openssl rand -hex 32)" \
       --network rev1-test \
       rust-api:test` → 啟動成功(假設 postgres + redis 也在 rev1-test network)
6. `docker exec rust-api-test curl -f http://localhost:11081/health` → 200 OK `"ok"` ✓
7. `docker exec rust-api-test date` → TZ 為 `Asia/Shanghai`、時間正確
8. `docker exec rust-api-test ls -la /usr/local/bin/server /usr/local/bin/migration` → 兩個 binary 都存在、permission 755、owner 為 rust-api 可 read+execute

## 範圍邊界(明示)

### W-F1 範圍內

- **Dockerfile 重寫**:`rust-api/Dockerfile` 從 alpine+musl multi-stage 改寫為 debian+glibc multi-stage
- **Builder stage**:`rust:1.86-slim-bookworm` + apt install `pkg-config libssl-dev ca-certificates git` + BuildKit cache mount(`/usr/local/cargo/registry` + `/usr/local/cargo/git` + `/app/target`)+ `cargo build --release --bin server --bin migration` + strip
- **Runtime stage**:`debian:bookworm-slim` + apt install `ca-certificates libssl3 curl tzdata` + useradd `rust-api` uid 10001 + COPY 2 個 binary + COPY 3 個 resources + USER rust-api + EXPOSE 11081 + ENV(TZ/LANG/RUST_ENV)
- **`/health` endpoint 新增**:在 server router 加 `.route("/health", get(|| async { "ok" }))`(public、不過 jwt_auth_middleware、不過 axum_casbin)
- **.dockerignore 微調**:既有大致 OK,確認不排除 `Cargo.toml` / `Cargo.lock` / `server/` / `axum-casbin/` / `sea-orm-adapter/` / `migration/` / `xdb/`(builder 需要);保留排除 `/target /bin /deploy /.idea /.vscode **/.env`
- **Image tagging convention 文件化**:DESIGN-W §2.4 的 3 個 tag pattern(`<service>:<short-sha>` / `<service>:<branch>` / `<service>:prod-<date>`)寫入 W-F1 spec.md
- **Acceptance test**:8 個 acceptance check(Independent Test §1-§8)透過 `docker build` + `docker run` + `docker exec` 驗證

### W-F1 範圍外(留後續 W-F feature)

- **base-web Dockerfile**(Vite build + nginx serve) → **W-F2**
- **docker-compose 結構**(postgres / redis / rust-api / base-web / front-nginx / migration 6 個 service + networks + volumes + healthcheck + depends_on) → **W-F3**
- **Docker secrets 注入**(`_FILE` pattern + rust read helper + deploy/secrets/ 目錄結構) → **W-F4**
- **front-nginx 反向代理**(upstream / TLS / location / header) → **W-F5**
- **TLS cert 管理**(dev 自簽 / prod Let's Encrypt acme.sh) → **W-F6**
- **對外 port 規劃**(11080 / 11443 等) → **W-F7**(雖然 W-F1 EXPOSE 11081 但對外 port forwarding 屬 W-F7 範疇)
- **Migration init container**(`restart: "no"` + `service_completed_successfully` + 獨立 migration credential) → **W-F8**
- **cleanup-job / outbox-worker binary 與 entrypoint**(subcommand vs 獨立 crate) → **W-F9 / W-F10**
- **rust 水平擴展拓樸**(replicas + upstream auto-discovery + Casbin pub-sub) → **W-F11**
- **Observability**(log / metrics / dashboard) → **W-F12 / W-F13 / W-F14**
- **Backup / DR / CI/CD** → **W-F15 / W-F16 / W-F17 / W-F18**
- **Track DESIGN-A 專屬**(nestjs compose service / nginx TRANSITIONAL block / nestjs CI build) → **W-FA1 / W-FA2 / W-FA3**

## Components / Data Flow

```
[CI / 開發者 host]
  docker build -t rust-api:<short-sha> rust-api/
    ↓
[Stage 1: builder]
  FROM rust:1.86-slim-bookworm
    ↓ apt install (pkg-config libssl-dev ca-certificates git)
    ↓ COPY . . (整個 rust-api workspace 含 Cargo.toml + 30+ crate)
    ↓ --mount=type=cache (cargo registry + git + target)
    ↓ cargo build --release --bin server --bin migration
    ↓ cp + strip target/release/{server,migration} → /tmp/{server,migration}
    ↓
[Stage 2: runtime]
  FROM debian:bookworm-slim
    ↓ apt install (ca-certificates libssl3 curl tzdata)
    ↓ useradd rust-api (uid 10001, no shell)
    ↓ COPY --from=builder /tmp/server → /usr/local/bin/server
    ↓ COPY --from=builder /tmp/migration → /usr/local/bin/migration
    ↓ COPY --from=builder --chown=rust-api /app/server/resources/{application.yaml,ip2region.xdb,rbac_model.conf} → /app/server/resources/
    ↓ WORKDIR /app + USER rust-api + EXPOSE 11081
    ↓ ENV TZ=Asia/Shanghai LANG=en_US.UTF-8 RUST_ENV=production
    ↓ ENTRYPOINT ["/usr/local/bin/server"]
    ↓
[Output image]
  rust-api:<short-sha>
  size 預估 < 250MB
  含 2 binary + 3 resources + non-root user

[Runtime 使用情境]
  ┌─ docker run rust-api:<sha>
  │     → ENTRYPOINT server → 啟 axum on :11081
  │
  ├─ docker run --entrypoint /usr/local/bin/migration rust-api:<sha> up
  │     → 跑 sea-orm migration(W-F8 init container 用)
  │
  ├─ docker run --entrypoint /usr/local/bin/server rust-api:<sha> cleanup-job ...
  │     → 預留:W-F9 cleanup-job(屆時 server 加 subcommand 後可用)
  │
  └─ docker run --entrypoint /usr/local/bin/server rust-api:<sha> outbox-worker
        → 預留:W-F10 outbox-worker(屆時 server 加 subcommand 後可用)
```

## Dockerfile 草稿

```dockerfile
# =============================================================================
# rust-api Dockerfile — rev1 deploy 版本(W-F1)
#
# 變動 vs 既有 alpine+musl 版本:
# - base image: rust:1.86-alpine + alpine:3.21 → rust:1.86-slim-bookworm + debian:bookworm-slim
# - openssl: static (musl-libs-static) → dynamic (libssl3)
# - 同時 build 兩個 binary: server + migration
# - 加 curl(healthcheck 用、與 W-F3 compose 對齊)
# - non-root user 名:appuser → rust-api(uid 10001 不變)
# - 拆 --no-default-features:移除(讓 build 走 default features)
# =============================================================================

ARG RUST_VERSION=1.86
ARG DEBIAN_VERSION=bookworm-slim
ARG APP_USER=rust-api
ARG APP_UID=10001
ARG APP_PORT=11081
ARG TZ=Asia/Shanghai

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM rust:${RUST_VERSION}-slim-${DEBIAN_VERSION} AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# COPY 整個 workspace(.dockerignore 已排除 /target /deploy /.idea 等)
COPY . .

# 用 BuildKit cache mount 加速 incremental build
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release --bin server --bin migration && \
    cp target/release/server /tmp/server && \
    cp target/release/migration /tmp/migration && \
    strip /tmp/server /tmp/migration

# -----------------------------------------------------------------------------
# Stage 2: runtime
# -----------------------------------------------------------------------------
FROM debian:${DEBIAN_VERSION} AS runtime

ARG APP_USER
ARG APP_UID
ARG APP_PORT
ARG TZ

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 curl tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u ${APP_UID} -m -d /home/${APP_USER} -s /usr/sbin/nologin ${APP_USER}

WORKDIR /app

COPY --from=builder /tmp/server /usr/local/bin/server
COPY --from=builder /tmp/migration /usr/local/bin/migration
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/server/resources/application.yaml /app/server/resources/
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/server/resources/ip2region.xdb /app/server/resources/
COPY --from=builder --chown=${APP_USER}:${APP_USER} /app/server/resources/rbac_model.conf /app/server/resources/

USER ${APP_USER}
EXPOSE ${APP_PORT}

ENV TZ=${TZ} \
    LANG=en_US.UTF-8 \
    RUST_ENV=production

ENTRYPOINT ["/usr/local/bin/server"]
```

## `/health` endpoint 草稿

新增位置:`rust-api/server/router/src/` 內(視既有 router 結構決定具體 file,可能新增 `health_route.rs` 或加在現有 root router init);掛載點為 root(不在 `/api/*` 下、避免 future nginx routing 衝突)。

```rust
// server/router/src/health_route.rs(草稿,實際檔名與 mount 位置 spec 階段拍板)
use axum::{routing::get, Router};

pub struct HealthRouter;

impl HealthRouter {
    pub fn init() -> Router {
        Router::new().route("/health", get(|| async { "ok" }))
    }
}
```

mount 在 `server/initialize/src/router_initialization.rs` 內(與 admin / public router 並列、不過 jwt_auth_middleware、不過 axum_casbin)。

**設計要點**:
- 回 plain text `"ok"` 不走 F4 envelope(healthcheck 工具不需要 JSON 結構、只看 HTTP 200)
- 不 query DB / Redis(健康定義為「process 可服務 HTTP」,DB/Redis health 另由 W-F13 metrics exporter 觀測)
- public、無 auth(任何 internal probe 都應可達)
- 未來 W-F11 水平擴展時:front-nginx upstream healthcheck 也用此 endpoint

## Acceptance Criteria

| # | Check | 驗證命令 | 期望輸出 |
|---|---|---|---|
| AC-1 | image 可在乾淨環境 build | `docker build -t rust-api:test rust-api/` | exit 0 |
| AC-2 | image size 控制 | `docker image inspect rust-api:test --format='{{.Size}}'` | < 250MB |
| AC-3 | non-root user 正確 | `docker run --rm --entrypoint whoami rust-api:test` | `rust-api` |
| AC-4 | uid 正確 | `docker run --rm --entrypoint id rust-api:test` | `uid=10001(rust-api)` |
| AC-5 | migration binary 可呼叫 | `docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help` | sea-orm migration CLI help |
| AC-6a | server binary 無 jwt_secret env 應 panic(F1.1 strict validation) | `docker run --rm rust-api:test`(無任何 env) | 啟動 panic、stderr 含 F1.1 強制 secret 缺失訊息 |
| AC-6b | server binary 帶 jwt_secret env、無 DB 應進入 retry | `docker run --rm -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) rust-api:test` | 啟動成功進入 DB connect retry loop、不 panic |
| AC-7 | `/health` endpoint 可達 | 起完整 stack 後 `curl -f http://<container>:11081/health` | 200 OK `ok` |
| AC-8 | TZ 對 | `docker run --rm --entrypoint date rust-api:test` | 上海時區 |
| AC-9 | resources 完整 | `docker run --rm --entrypoint ls rust-api:test -la /app/server/resources/` | 3 個檔(application.yaml + ip2region.xdb + rbac_model.conf) |

## 風險與已知問題

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| musl→glibc 切換 cargo build 失敗(openssl static→dynamic、jemalloc 等 crate 相容性) | 中 | 高(W-F1 block) | spec 階段先在 host(WSL debian / Docker debian-slim)跑 `cargo build --release --bin server --bin migration` 驗證可 build;若 fail 再 plan 階段 case-by-case 拆解 |
| image size 超過 250MB 目標(debian-slim runtime 比 alpine 大) | 中 | 中(image 拉取時間長、storage 多) | 接受;後續若需要可考慮 distroless / scratch + static linking 優化(留 future feature) |
| `/health` endpoint 加在 root level 與既有 router 結構衝突(既有沒有 root-mount route) | 低 | 低 | spec 階段先 audit `server/initialize/src/router_initialization.rs`,確認 mount 位置不破壞既有 `/api/*` routing |
| BuildKit cache mount 在 CI 環境失效(GHA / GitLab 預設 buildx cache 配置不一) | 中 | 低(只影響 build 速度、不影響 build 成功) | 留 W-F17 CI pipeline 拍板;W-F1 範疇不處理 |
| Workspace 30+ crate clean build 時間長(預估 5-10 分鐘) | 高 | 低(可接受、有 cache 後快) | 接受;BuildKit cache mount 與 CI cache 解大部分 |
| application.yaml 中含 placeholder 但 prod 部署時應用層需 env override(W-F4 範疇) | — | 低 | W-F1 acceptance 不涵蓋 prod 部署,只驗 image build + basic run;real prod env override 走 W-F4 |

## 跨 feature 的待驗證項(Assumptions)

依 constitution §IV「上游驗證」規則 — 帶上 feature spec.md Assumptions 段、實作時驗、驗完勾掉並回填結果。

- [ ] **`cargo build --release --bin server --bin migration` 在 host debian-slim 環境可 build 成功**(無 musl-specific feature 相依、openssl dynamic link OK)— W-F1 spec 階段第一個前置驗
- [ ] **image size 控制目標 < 250MB**(debian-slim + libssl3 + curl + tzdata + 2 binary)— W-F1 build 完驗
- [ ] **既有 server/initialize router_initialization.rs mount 結構不被 `/health` endpoint 加入破壞**(現有 mount pattern audit)— W-F1 spec 階段第二個前置驗
- [ ] **既有 application.yaml resources 路徑 `/app/server/resources/` 在 debian 環境符合 server-bin 預期**(WORKDIR /app 對齊 既有 cargo 編譯時相對路徑期望)— W-F1 build + run 驗

## spec-kit feature 階段(W-F1)輸出

依 rev1 spec-kit 工作流(對齊 F1-F5 模式):

- `specs/006-dockerfile-rust-api/spec.md`(從本 brainstorm doc 轉)
- `specs/006-dockerfile-rust-api/plan.md`(builder/runtime stage 拆解、cargo build 驗證任務、`/health` endpoint 任務)
- `specs/006-dockerfile-rust-api/tasks.md`(dependency ordered task list)
- `specs/006-dockerfile-rust-api/contracts/`(/health endpoint OpenAPI spec、Dockerfile structure contract)
- `specs/006-dockerfile-rust-api/quickstart.md`(docker build + run + curl /health 完整 reproducer)

實作落在 `rust-api/` worktree 內(覆寫既有 Dockerfile + 新增 server/router 內 health route + 改 .dockerignore + 新增 mount 在 router_initialization.rs)。兩段 commit:

1. **第一段**(`rust-api/` worktree → `rev1-admin-rust-api` 分支):rust-api code + Dockerfile 改動
2. **第二段**(outer `006-dockerfile-rust-api` feature branch):`specs/006-dockerfile-rust-api/` spec docs + bump rust-api SHA pin

Feature branch 完成後 merge 回 `rev1-admin-root`,W-F2 / W-F3 / W-F4(P1 後續 3 個 feature)解鎖。
