# Research: W-F1 dockerfile-rust-api

**Feature**: 006-dockerfile-rust-api
**Phase**: 0 (research)
**Date**: 2026-05-15
**Inputs**:
- [`spec.md`](spec.md)(W-F1 functional + non-functional 拍板)
- [`docs/superpowers/006-feature-dockerfile-rust-api.md`](../../docs/superpowers/006-feature-dockerfile-rust-api.md)(brainstorm)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §2.1 / §3.3 / §11

**Purpose**: 解 spec.md 的 4 個前置 assumption(列在 `## Assumptions` 段),確認 W-F1 plan-stage 不會踩 unknown blocker。

---

## R-001: cargo build 在 debian glibc 環境可 build

**Question**: rust-api workspace 從 alpine+musl 切到 debian+glibc 後,`cargo build --release --bin server --bin migration` 是否可成功?

**Audit method**:
1. grep `rust-api/Cargo.toml` + `rust-api/server/*/Cargo.toml` + `rust-api/.cargo/config*` 找 musl-specific feature(`musl` / `static-openssl` / `jemalloc` / `mimalloc`)
2. 檢查 `[target]` 段是否有 musl target 特定配置

**Findings**:
- `grep -i "musl\|alpine\|static.*openssl\|jemalloc\|mimalloc"` 在所有 Cargo.toml + `.cargo/config` 內 **0 命中**
- `.cargo/config` 內 `[rust] channel = "stable"`,無 target-specific override
- 既有 alpine Dockerfile 使用 `openssl-libs-static` 透過 apt install 提供,**rust crate level 並未 declare musl-specific feature**
- workspace 主要 crate:`axum 0.8.4` / `sea-orm` / `tokio` 等都是 platform-agnostic

**Decision**: 走 debian:bookworm-slim builder image,沿用 standard `pkg-config + libssl-dev`(dynamic openssl)。**預期 default features 直接 compile pass**,無需特殊 feature flag。

**Rationale**: rust-api 為新建 fork(2026-05),既有 crate ecosystem 支援 glibc/musl 雙態;static-openssl 是 alpine Dockerfile 的選擇而非 codebase 需求,改 debian dynamic libssl3 不影響 build。

**Alternatives considered**:
- 用 musl target cross-compile from debian builder:增加 cross-compile 工具鏈、stripped binary 仍需 musl loader、與 debian runtime 不相容,**rejected**
- 用 distroless base(`gcr.io/distroless/cc-debian12`):size 較小但無 curl / 無 useradd 等基本工具、W-F1 healthcheck + non-root user 配置複雜化,**rejected** for W-F1 phase(留 future optimization feature)

**Plan-stage action**:
- **T1**: 在 plan 階段 task 跑 `cd rust-api && cargo build --release --bin server --bin migration`(host debian glibc 環境或 docker rust:1.86-slim-bookworm container 內),驗 build pass。若 fail → case-by-case debug 補 dep / feature flag。

---

## R-002: config crate `APP_SERVER_PORT` env override 支援度

**Question**: Q1 clarify 拍板 Dockerfile `ENV APP_SERVER_PORT=11081` 讓 server 啟動 override application.yaml `server.port: 10001` — 既有 config crate 是否支援此 env binding?

**Audit method**:
1. `cat rust-api/server/config/src/env_config.rs`
2. 看是否使用 `config` crate `Environment` adapter + 確認 prefix / separator

**Findings**:
- 既有 `EnvConfigLoader` (`rust-api/server/config/src/env_config.rs`) **明示支援**:
  - `env_prefix: String` 預設值 `"APP"`
  - `env_separator: String` 預設值 `"_"`
  - 註解寫:「環境變數命名規範:使用 `APP_` 前綴、嵌套配置用下劃線分隔,如:`APP_DATABASE_URL`」
- 使用 `config` crate 0.x 的 `Environment::with_prefix("APP").separator("_")` pattern
- F1.1 既有以 `APP_JWT_JWT_SECRET` 形式 work、屬同一 pattern

**Decision**: **`APP_SERVER_PORT=11081` 直接 override `server.port` 不需改 rust code**。Dockerfile 加 `ENV APP_SERVER_PORT=11081` 即生效。

**Rationale**: 既有實作完整支援 prefix + separator + 嵌套 key;`server.port` 屬於 1-level nesting(`server` 是 yaml top-level、`port` 是其 sub-field)、separator `_` 對齊 `APP_<TOP>_<SUB>`。

**Alternatives considered**:
- 改 env separator 為 `__` (double underscore) 避免 nested key 與單詞 underscore 衝突:但 `server` / `port` 都是單詞,單 `_` 已足夠;**rejected**(無需破壞 F1.1 既有 pattern)
- 額外加 `APP_SERVER_HOST` env 對齊 IP binding:屬未來 feature 範疇(W-F11 horizontal scaling 拍板),**deferred**

**Plan-stage action**:
- **T2**: plan task 加 minimal validation — host 跑 `APP_SERVER_PORT=11081 cargo run --bin server --no-default-features` 看 startup log 報出 listen port 為 11081(或寫 unit test `EnvConfigLoader::new().with_file(...).load()` + 設 env、assert `config.server.port == 11081`);若 fail 補 config crate 改動。

---

## R-003: router_initialization root-level `/health` mount + log filter 路徑

**Question**: brainstorm Q3 拍板 W-F1 加 `/health` endpoint + Q3 clarify 拍板 `/health` request 在 INFO log level silent。既有 `initialize_admin_router()` 結構支援:(a) root level `/health` mount?(b) 跳過 TraceLayer log?

**Audit method**:
1. `cat rust-api/server/initialize/src/router_initialization.rs`(讀 ~250 行)
2. 看 `app: Router` 構建順序 + `apply_layers()` middleware 鏈

**Findings**:
- `apply_layers()` 內 unconditional 加 `TraceLayer::new_for_http().make_span_with(...)` 配 `info_span!("[soybean-admin-rust] >>>>>> request", ...)` — **任何過此 fn 的 router 都會被 INFO log**
- 但 `apply_layers()` 是針對個別 service router(透過 `merge_router!` macro)
- `app = Router::new()` 後續每個 `app = app.merge(<service_router_with_layers>)` 累積
- **可在所有 `merge_router!` 之後加一個 plain `app.merge(Router::new().route("/health", ...))`** — 此 sub-router 不過 `apply_layers`,**不過 TraceLayer / jwt_auth_middleware / Casbin / api_key**

**Decision**: 
- Mount 機制 = **`app = app.merge(Router::new().route("/health", get(health_handler)));`**(在 `initialize_admin_router()` fn 末尾、`app` 構建完成前 append)
- Handler 簡到極致:`async fn health_handler() -> &'static str { "ok" }`(或 `async fn health_handler() -> impl IntoResponse { (StatusCode::OK, "ok") }` 若需要顯式 Content-Type:text/plain)
- 跳過 `apply_layers` = 自動跳過 TraceLayer = INFO level 不 log /health request(對齊 Q3 clarify FR-015)

**Rationale**: 
- 既有 `apply_layers` 邏輯不動(brainstorm Q2「不動 rust code」例外性:加 1 個 route + handler 屬必要 scope)
- 不需要在 TraceLayer make_span_with 內加 `match path { "/health" => Span::none(), _ => ... }`(那會改變既有 layer 行為、影響其他 service router 的 trace span)
- 不需要新建 PublicRouter 結構(W-F1 只 1 個 public endpoint、不值得抽象)

**Alternatives considered**:
- TraceLayer make_span_with 加 path filter(`if request.uri().path() == "/health" { return Span::none() }`):**rejected**,改變既有 layer 行為 + 違反 brainstorm Q2「不動既有 layer」紀律
- 為 `/health` 加獨立 `apply_layers` invocation 但 `need_auth=false, need_casbin=false`:仍會過 TraceLayer + RequestIdLayer,**rejected**(無法達成 silent log)
- mount /health 在 `/api/health` 而非 root:**rejected**,DESIGN-W §3.3 寫 `curl http://localhost:11081/health`、且 root mount 暗示 ops infra endpoint(per industry convention)

**Plan-stage action**:
- **T3**: 在 `rust-api/server/initialize/src/router_initialization.rs` `initialize_admin_router()` fn 內,所有 `merge_router!` / `app.merge(auth_router)` 之後,加 ~2 行:
  ```rust
  app = app.merge(
      Router::new().route("/health", get(|| async { "ok" }))
  );
  ```
- **T3b**: integration test 驗:`GET /health` → 200 OK + body `ok`、不帶 token 也通(public)、tracing log RUST_LOG=info 級別 0 個 `/health` 相關 row。

---

## R-004: rust toolchain version 與 reproducibility

**Question**: builder image `rust:1.86-slim-bookworm` 是 minor pin(1.86 內最新 patch),是否需要 patch pin(`rust:1.86.0-slim-bookworm`)以保 reproducibility?

**Audit method**:
1. 檢查 `rust-api/rust-toolchain.toml` 是否存在
2. 檢查 `Cargo.lock` 是否在 git tracked(reproducibility)
3. 既有 Dockerfile 是否 patch pin

**Findings**:
- **無 `rust-toolchain.toml`** file(`find rust-api -maxdepth 2 -name "rust-toolchain*"` 0 命中)
- 既有 Dockerfile 用 `ARG RUST_VERSION=1.86.0` + `FROM rust:${RUST_VERSION}-alpine`(實際是 1.86.0 patch pin)
- `rust-api/Cargo.lock` 存在(170KB+ ,tracked in git)
- `.cargo/config` 宣告 `channel = "stable"`(無實際 effect 因 channel pinning 通常在 rust-toolchain.toml)

**Decision**: 
- W-F1 Dockerfile builder image 用 **`rust:1.86-slim-bookworm`**(minor pin、依循 DESIGN-W §2.1 草稿描述意圖、不需 patch pin)
- 不新增 `rust-toolchain.toml`(W-F1 範疇外、改動點越少越好)
- Cargo.lock 已 commit、deps reproducibility 保證

**Rationale**: 
- rust 1.86 minor 內 patch 差異(1.86.0 → 1.86.x)對 release build 結果無實質影響(同一 LLVM version 大版本)
- patch pin 增加維護成本(每次 rust 1.86.x patch 出來需手動 bump Dockerfile)、benefit 小
- 若未來需要絕對 reproducibility,W-F17 CI pipeline 階段可改用 `:1.86.0-slim-bookworm` 並 lock to specific Docker image SHA

**Alternatives considered**:
- patch pin `rust:1.86.0`:**deferred**,W-F17 CI 階段視需要再 promote
- 新增 `rust-toolchain.toml`:**rejected**(W-F1 scope 外)

**Plan-stage action**: 無

---

## R-005: BuildKit cache mount + Docker buildx 行為

**Question**: 既有 alpine Dockerfile 用 `--mount=type=cache,target=...` 加速 incremental build,debian builder 用同 pattern 是否 work?CI / 本機 dev 第二次 build 行為?

**Findings**:
- BuildKit cache mount 與 base image 無關(Docker BuildKit feature),既有 3 個 cache target 在 debian builder 也 work:
  - `/usr/local/cargo/registry`(downloaded crate `.crate` files)
  - `/usr/local/cargo/git`(git source crates)
  - `/app/target`(cargo build incremental outputs)
- 本機 dev:BuildKit cache 預設 builder-level、第二次 build 同 docker host 上 hit cache、預期 < 1 分鐘(spec SC-003 設此目標)
- CI:GHA `actions/cache@v4` 或 `buildx cache-from/cache-to` 可注入 cache、**屬 W-F17 範疇**

**Decision**: 沿用既有 `--mount=type=cache` pattern,3 個 cache target 不變。

**Rationale**: 既有已驗;BuildKit cache mount 為 docker-native feature、debian/alpine 等價。

**Plan-stage action**: 無(sane defaults)

---

## R-006: resources COPY 範圍 + WORKDIR 對齊

**Question**: brainstorm 與 spec FR-010 列 3 個 resource(`application.yaml` / `ip2region.xdb` / `rbac_model.conf`)— 但 `rust-api/server/resources/` 內還有 `application-test.yaml / .json / .toml` / `ip.test.txt` / `application.yaml.example`,確認哪些屬 prod runtime 必要?

**Findings**:
- `application-test.*`(3 個):dev / test 用,`application-test.yaml` 對應 cargo test 環境,**prod 不需要**
- `application.yaml.example`:範例檔(for user 參考),**prod 不需要**
- `ip.test.txt`:測試用 IP 對照(看名稱猜測),**prod 不需要**
- 確認 prod 必要 3 個檔:
  - `application.yaml` — server 啟動主 config(含 placeholder)
  - `ip2region.xdb` — IP→geo location 查表(rust 內可能有 service 使用、~11MB)
  - `rbac_model.conf` — Casbin RBAC model 定義(router_initialization.rs:130 寫 `initialize_casbin("server/resources/rbac_model.conf", ...)` 明確路徑)

**WORKDIR /app 對齊**:
- 既有 Dockerfile 設 WORKDIR `/app`、COPY 到 `/app/server/resources/`
- router_initialization.rs 用相對路徑 `"server/resources/rbac_model.conf"` 載入 Casbin model
- ➜ `/app` WORKDIR + `server/resources/` 子路徑符合既有預期

**Decision**: COPY **3 個 prod 必要 resource**(spec FR-010 已列)。WORKDIR `/app` 對齊既有相對路徑期望。

**Plan-stage action**: 無(spec 已涵蓋、無變動需求)

---

## 解決 spec.md `## Assumptions` 對照

| Spec Assumption | Research 結果 | 狀態 |
|---|---|---|
| 既有 rust-api workspace 在 debian glibc 環境可 build | R-001 audit 0 musl-specific dep、預期 pass | ✅ **plan T1 驗** |
| 3 個 resources 為 prod 必要 | R-006 confirmed | ✅ Resolved |
| 既有 router_initialization 允許 root level mount | R-003 confirmed(append `app.merge` 後即可) | ✅ Resolved |
| F1.1 strict secret 驗證在 debian image 行為一致 | spec.md 已記、acceptance test 用 substring match | ✅ Resolved(no action) |
| config crate 支援 `APP_SERVER_PORT` env override | R-002 confirmed(既有 `EnvConfigLoader` prefix `"APP"` + sep `"_"`) | ✅ **plan T2 驗** |
| BuildKit 啟用為 host 預設 | R-005 confirmed(modern docker default) | ✅ Resolved |
| registry / image push 不在 W-F1 範疇 | spec.md 已記、留 W-F17 | ✅ Resolved |
| Image size 上限 250MB 為設計目標、非 hard fail | spec.md SC-002 + edge case 已記 | ✅ Resolved |
| W-F1 acceptance test 不交付 compose 配置 | spec.md 已記 | ✅ Resolved |
| 兩段式 commit 紀律 | CLAUDE.md §6.1 已定 | ✅ Resolved |
| W-F1 image target = linux/amd64 | Q2 clarify + spec.md 已記 | ✅ Resolved |
| `/health` log filter 走 tracing layer | R-003 提供具體實作(append mount 跳過 apply_layers) | ✅ Resolved |

**結論**:0 個 unresolved blocker。plan 階段執行 T1 / T2 / T3 / T3b 4 個 validation task 即可進 implement。
