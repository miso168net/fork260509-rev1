# Feature Specification: W-F1 — dockerfile-rust-api

**Feature Branch**: `006-dockerfile-rust-api`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "W-F1 dockerfile-rust-api — rev1 deploy 階段第一個 feature(per DESIGN-W §11.1 Phase W-1 P1)。把 rust-api 既有 alpine+musl Dockerfile 改寫為 debian+glibc multi-stage,產出單一 image 含 server + migration 兩個 binary。範圍刻意收緊:只動 Dockerfile 結構 + 加一個 /health endpoint(rust-api 既有 codebase 沒有此 endpoint,W-F3 healthcheck 必須依賴此 endpoint)。"

**Source brainstorming**: [`docs/superpowers/006-feature-dockerfile-rust-api.md`](../../docs/superpowers/006-feature-dockerfile-rust-api.md)(2026-05-15 superpowers:brainstorming session 產出、3 個 clarification 拍板)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §2.1(rust-api Dockerfile multi-stage 草稿)、§2.4(image tagging convention)、§3.3(healthcheck 期望)、§7.1(migration init container 共 image 不同 entrypoint)、§7.3-§7.4(cleanup-job / outbox-worker 共 image 不同 command 預留)、§11.1(W-F1 scope 描述)、§11.2(W-F 依賴序 P1 必先 4 個)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「上游驗證」— 既有 Dockerfile alpine+musl 已驗、切 debian+glibc 需重驗)
- [`specs/004-jwt-secrets/spec.md`](../004-jwt-secrets/spec.md)(F1.1,已完成;server 啟動 strict 驗 jwt_secret env、影響 AC-6a/6b 驗證情境)
- [`specs/005-auth-login-and-dynamic-menu/spec.md`](../005-auth-login-and-dynamic-menu/spec.md)(F5.1,已完成;auth router 結構 — `/health` endpoint mount 點與 admin router 結構相鄰、不在 `/api/*` 下)
- 既有 [`rust-api/Dockerfile`](../../rust-api/Dockerfile)(alpine+musl 既有版本,W-F1 覆寫對象)
- 既有 [`rust-api/.dockerignore`](../../rust-api/.dockerignore)(W-F1 微調對象)

**Scope summary**:rev1 deploy 階段第一個 feature — 把 rust-api 既有 alpine+musl Dockerfile 改寫為 rev1 deploy 規劃版本(debian+glibc multi-stage)。產出**單一 image 含 server + migration 兩個 binary**,沿用 BuildKit cache mount + non-root user + strip + image tagging convention(DESIGN-W §2.4)。W-F1 範疇刻意收緊:**只動 Dockerfile 結構 + 加一個 `/health` endpoint**(rust-api 既有 codebase 沒有此 endpoint、W-F3 healthcheck 必須依賴此 endpoint)。不動 cleanup-job / outbox-worker binary(留 W-F9 / W-F10)、不動 compose / secret / migration init container 等部署層配套(留 W-F3 / W-F4 / W-F8)、不動 registry / CI push(留 W-F17)。

## Clarifications

### Session 2026-05-15(brainstorming 階段拍板、3 項)

- **Q1**: Base image 走哪一條?既有 rust-api/Dockerfile 是 alpine+musl(跑得通,F1-F5 都在這上面實作),DESIGN-W §2.1 草稿寫 debian:bookworm-slim+glibc。 → **A: 改寫成 debian+glibc**(DESIGN-W §2.1 草稿)。理由:統一 rev1 deploy 層 base image 為 debian-slim;debian ecosystem 廣、未來如要加 jemalloc / 某些 glibc-only 套件較順。代價接受:musl→glibc 切換要重驗 build、image 變大(預估 ~80MB runtime vs alpine ~30MB)、需在 spec/plan 階段 host build 先驗 `cargo build --release --bin server --bin migration` 可跑通(debian glibc 環境)。

- **Q2**: cleanup-job / outbox-worker 這兩個背景工作的 binary 結構 — DESIGN-W §7.3/§7.4 寫 `entrypoint: server, command: [cleanup-job|outbox-worker]`(暗示是 server subcommand),但現在 server-bin 不支援 subcommand。W-F1 scope 怎麼划? → **A: W-F1 只 build server + migration**(既有 2 個 binary)。cleanup-job / outbox-worker 的 binary 形態(server subcommand vs 獨立 crate)留 W-F9 / W-F10 拍板,那時會有實際 cleanup / outbox 邏輯背景。W-F1 Dockerfile 結構支援「未來追加 binary 只是多 1 行 `COPY --from=builder`」,不破壞 image 結構。W-F1 範疇**不動 server-bin code**(此原則例外:Q3 拍板加 `/health` endpoint 屬必要前置 — 因 W-F3 healthcheck 不可能在 W-F1 之後才補)。

- **Q3**: Healthcheck 策略 — DESIGN-W §3.3 寫 `test: ["CMD", "curl", "-f", "http://localhost:11081/health"]`,意味 image 內要裝 curl(debian-slim 預設不含)。 → **A: 裝 curl**(跟 DESIGN-W §3.3 草稿一致)。代價接受:curl 全裝 ~4MB(含 libcurl4-openssl 等 deps),但與 wget --spider 替代方案差距不大、與 DESIGN-W §3.3 已寫文字一致避免修文件;且 debug / 容器內手動驗 endpoint 時 curl 比 wget 方便。**配套**:W-F1 範疇額外加 `/health` endpoint(grep 確認既有 rust-api codebase 完全沒有 `health|readyz|liveness` endpoint),約 ~5 行 axum route 在 server router 加 `.route("/health", get(|| async { "ok" }))`,acceptance 包含 `curl -f http://<container>:11081/health` 回 200 OK `"ok"`。

### Session 2026-05-15(spec-kit `/speckit-clarify` 階段拍板)

- **Q**: EXPOSE port 與既有 application.yaml `server.port: 10001` 衝突 — FR-008 EXPOSE 11081(對齊 DESIGN-W §2.1 / CLAUDE.md §5.2 rev1 提議)、FR-023 又禁止改動 application.yaml,rust 進程實際 listen 10001 與 EXPOSE 11081 不一致 → W-F3 compose healthcheck 必 fail。怎麼解? → **A**: 走 F1.1 env-override 模式 — **Dockerfile `ENV APP_SERVER_PORT=11081` + EXPOSE 11081**,application.yaml 保留 `server.port: 10001` 不動。前置假設:既有 config crate 支援 `APP_SERVER_PORT` env override(同 F1.1 `APP_JWT_JWT_SECRET` 模式),W-F1 plan 階段第一個前置 task 即驗 server.port env binding;若不支援、plan 階段加 minimal config crate 改動(屬本 feature scope 例外、與 brainstorm Q2 拍板「不動 rust code」的 /health 例外性質一致)。

- **Q**: Image build target platform — amd64 only / amd64+arm64 多 arch / 預埋切換點?spec 未明示。 → **A: amd64 only**(`linux/amd64`)。Dockerfile 不顯式 pin platform、依 host 預設(WSL2 / GHA Linux runner 全 amd64);acceptance 只在 amd64 上跑。CLAUDE.md 紀錄 user host 為 Linux x86_64、DESIGN-W 未提 arm64、無 arm64 dev 明示需求 → 不增加 W-F1 scope。未來 W-F17 CI pipeline 階段若需要 arm64(M1/M2 Mac 開發 / AWS Graviton 部署 etc.),再加 `docker buildx --platform linux/amd64,linux/arm64` 多 arch 機制 — 屬 W-F17 scope,W-F1 Dockerfile 不預埋 `--platform=$BUILDPLATFORM` ARG(避免 spec scope 漂移)。

- **Q**: `/health` request 是否打 log?W-F3 compose healthcheck + 未來 W-F11 front-nginx upstream healthcheck 都會週期 poll(預估 10-30s 一次 → 每 instance 每日 ~3000-8000 次)。 → **A: silent**(default INFO log level 不 log `/health` request)。rust tracing layer 加 filter 排除 path = `/health`,避免 healthcheck 壓掉 application log 訊雜比;W-F12 Loki cost 不會被 healthcheck 灌爆。observability 完整性由 W-F13 metrics 補(`http_request_duration_seconds` histogram 仍含 `route="/health"` label);debug 需要時 user 可暫時 `RUST_LOG=debug` 開細節。屬 W-F1 deliverable(因 `/health` endpoint 在 W-F1 加入、配套 log filter 一起到位避免 W-F12 階段補丁)、與 brainstorm Q2 拍板「不動 rust code」例外性質一致(同 /health endpoint 例外)。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 在乾淨 docker 環境 build + run rev1 rust-api image(Priority: P1,唯一 US)🎯 MVP

operator(或 CI agent)在乾淨 docker 環境(無既有 layer cache)執行 `docker build -t rust-api:test rust-api/`。Builder 階段從 `rust:1.86-slim-bookworm` 起、apt 安裝 build deps(pkg-config / libssl-dev / ca-certificates / git)、COPY 整個 rust-api workspace、用 BuildKit cache mount 跑 `cargo build --release --bin server --bin migration` 編譯 30+ crate workspace、strip 兩個 binary。Runtime 階段切到 `debian:bookworm-slim`、apt 安裝 runtime deps(ca-certificates / libssl3 / curl / tzdata)、建立 non-root user `rust-api`(uid 10001)、COPY 兩個 binary 到 `/usr/local/bin/`、COPY 3 個 resources(application.yaml + ip2region.xdb + rbac_model.conf)到 `/app/server/resources/`、設定 USER + EXPOSE 11081 + ENV(TZ/LANG/RUST_ENV)。image 產出 size < 250MB。`docker run --rm rust-api:test`(無 env)依 F1.1 strict secret 驗證會 boot panic;補 `-e APP_JWT_JWT_SECRET=$(openssl rand -hex 32)` 後進入正常啟動流程、因無 DB 而 retry。預先準備好 postgres + redis + secret env 後 `docker run -d` 起完整 server,`docker exec ... curl -f http://localhost:11081/health` 回 200 OK `"ok"`,證明 image 內 server binary 啟動完成、可服務 HTTP、且 `/health` endpoint(本 feature 新增)可達。`docker run --entrypoint /usr/local/bin/migration rust-api:test help` 顯示 sea-orm migration CLI help,證明同一 image 可作為 W-F8 migration init container 使用。`docker run --entrypoint whoami rust-api:test` 輸出 `rust-api`、`docker run --entrypoint id rust-api:test` 輸出 `uid=10001(rust-api)`,證明 non-root user 配置正確。

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F1 的 5 個交付片段(Dockerfile multi-stage 重寫 / `.dockerignore` 微調 / `/health` endpoint 新增 / image tagging convention 文件化 / acceptance test 跑通)**並非獨立可交付**:

- 單獨重寫 Dockerfile → 沒 `/health` endpoint → W-F3 compose healthcheck 永遠 fail、`depends_on: condition: service_healthy` 整鏈條 block
- 單獨加 `/health` endpoint → 沒 Dockerfile 改寫 → 仍是 alpine+musl、與 DESIGN-W §2.1 不一致、後續 W-F2/W-F3 base image 統一性破
- 單獨拍 tagging convention → 沒 build 跑通 → 沒實際 image 可以 tag、純文件無價值
- 單獨跑 acceptance test → 沒 image 改造 → 跑既有 alpine version、未驗 W-F1 目標
- 單獨改 `.dockerignore` → 沒主 Dockerfile 改 → 沒人會踩到 `.dockerignore` 差別

W-F1 是 **rev1 deploy P1 4 個 feature 的最低層基礎** — image build 不通,W-F2(base-web Dockerfile)的 base 對齊、W-F3(compose 結構)的 service 引用、W-F4(secret 注入)的 image 環境變數讀取、W-F8(migration init container)的共 image 不同 entrypoint 全都接不上去。5 個片段是同一個 atomic deploy increment 的 5 個 acceptance dimensions。

**Independent Test**:9 個 acceptance check(對應 FR-001 ~ FR-018 + Dimension A-E)涵蓋 build + image structure + non-root + binary 可用性 + endpoint 可達 + TZ + resources 完整。需要的環境:乾淨 docker host(無 image cache)+ 至少一次跑通 `docker build` 確認 musl→glibc 切換不踩 cargo build 失敗。完整 `/health` endpoint 可達驗證需要 minimal 起 postgres + redis(假設透過 manual docker run 或臨時 compose,W-F1 本身不交付 compose 配置)。

**Acceptance Scenarios**:

#### Dimension A — Dockerfile 結構重寫(FR-001 ~ FR-005)

1. **Given** 乾淨 docker host(無 image layer cache),**When** `cd rust-api && docker build -t rust-api:test .`,**Then** build 成功 exit 0、output 顯示 builder stage(rust:1.86-slim-bookworm)+ runtime stage(debian:bookworm-slim)兩階段
2. **Given** build 完成,**When** `docker image inspect rust-api:test --format='{{.Size}}'`,**Then** image size < 250MB(debian-slim + libssl3 + curl + tzdata + 2 個 release-mode binary)
3. **Given** image build 完成,**When** `docker history rust-api:test`,**Then** 看不到 builder stage 中間 layer(multi-stage 正確、build deps 不混進 runtime)

#### Dimension B — Non-root user 配置(FR-006 ~ FR-008)

4. **Given** image build 完成,**When** `docker run --rm --entrypoint whoami rust-api:test`,**Then** stdout = `rust-api`(non-root user 名稱)
5. **Given** image build 完成,**When** `docker run --rm --entrypoint id rust-api:test`,**Then** stdout 含 `uid=10001(rust-api)` 與 `gid=10001(rust-api)`
6. **Given** image build 完成,**When** `docker run --rm --entrypoint ls rust-api:test -la /app/server/resources/`,**Then** 3 個檔(application.yaml / ip2region.xdb / rbac_model.conf)、owner 為 `rust-api:rust-api`、permission 對齊

#### Dimension C — Binary 可用性(FR-009 ~ FR-012)

7. **Given** image build 完成,**When** `docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help`,**Then** 顯示 sea-orm migration CLI help 文字(含 up / down 等 subcommand)
8. **Given** image build 完成、無任何 env,**When** `docker run --rm rust-api:test`,**Then** 啟動 panic、stderr 含 F1.1 strict secret 缺失訊息(per 004-jwt-secrets 規格)
9. **Given** image build 完成,**When** `docker run --rm -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) rust-api:test`,**Then** 啟動**通過 F1.1 secret 驗證**(stderr 無 placeholder secret 錯誤)、進到 config / xdb / DB init 流程、**因無 `APP_DATABASE_URL` 而於 DB 初始化階段 ERROR log + exit 1**(per 既有 db_initialization.rs 設計:fail-fast 不 retry);驗證 F1.1 secret 與 W-F1 image 啟動序列(config / xdb load)正常,DB 部分為 W-F4 secret 階段配置範疇
9b. **Given** image build 完成,**When** `docker run -d --name port-test -p 11081:11081 -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) rust-api:test` + server 啟動完成,**Then** `docker exec port-test sh -c 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null'`(或 host `curl http://localhost:11081`)顯示 server 確實 listen 11081 而非 10001(驗證 `APP_SERVER_PORT=11081` env 已 override application.yaml `server.port: 10001`)

#### Dimension D — `/health` endpoint 新增(FR-013 ~ FR-015)

10. **Given** 完整 stack(postgres + redis + 起 rust-api container),**When** `docker exec <container> curl -f http://localhost:11081/health`,**Then** 200 OK、response body = `ok`(plain text)
11. **Given** F5.1 既有 jwt_auth_middleware + axum_casbin layer,**When** 不帶 token 直接 call `/health`,**Then** 200 OK(public、不過 auth middleware、不過 Casbin enforce)
12. **Given** rust-api source code,**When** grep `/health` in `server/router/src/` + `server/initialize/src/router_initialization.rs`,**Then** 至少 1 命中(`.route("/health", get(...))` 樣式)
12b. **Given** 完整 stack 起 + `RUST_LOG=info`(預設),**When** 從外部連續 call `/health` 10 次 + tail container stdout / stderr log,**Then** 0 個 `/health`-related tracing log row(tracing layer filter 已排除);**Given** 同 container 改設 `RUST_LOG=debug`,**When** 再連續 call `/health` 10 次,**Then** 至少出現一些 debug 級別的 trace(filter 只在 INFO level 排除、debug 級別仍可開細節)

#### Dimension E — Image tagging convention(FR-016 ~ FR-018)

13. **Given** spec.md 完成,**When** 查 Functional Requirements 段,**Then** FR-016 ~ FR-018 明示 3 個 tag pattern(`<service>:<short-sha>` / `<service>:<branch>` / `<service>:prod-<date>`)、明示不用 `:latest`
14. **Given** image build 完成,**When** `docker build -t rust-api:$(git rev-parse --short=7 HEAD) rust-api/`,**Then** 該 tag 可正常 push 到 registry(W-F1 不實際 push,但 tag 命名合法)
15. **Given** image build 完成,**When** `docker build -t rust-api:rev1-admin-rust-api rust-api/`,**Then** 該 branch tag 可正常使用(輔助 tag、移動標籤)

### Edge Cases

- **musl→glibc 切換 cargo build 失敗**:若 spec/plan 階段 host build 跑 `cargo build --release --bin server --bin migration` 在 debian-slim 環境 fail(openssl static→dynamic 不相容、jemalloc / 某些 musl-only crate 等),W-F1 不能繼續 — 須 plan 階段 case-by-case 拆解、可能需要在 `[features]` 或 `Cargo.toml` 內補 glibc 環境的 feature flag。
- **image size 超過 250MB**:接受值上限放寬到 300MB(debian-slim + 2 個 stripped release binary 可能略過 250MB、依 workspace 編譯結果而定),但若 > 350MB 須 plan 階段 audit `docker history` 找哪一層特別大、考慮優化(例 distroless / scratch + 靜態 link、留 future feature)。
- **既有 server/initialize/router_initialization.rs mount 不支援 root-level route**:若既有 router 結構強制所有 route 在 `/api/*` prefix 下,加 `/health` 需要 audit mount pattern 並決定:(a) 在 `/api/health` 也接受、(b) 改 mount 結構支援 root-level(屬本 feature scope)。
- **`/app/server/resources/` 路徑與 server-bin 編譯時的相對路徑期望不一致**:既有 server-bin 可能用 `std::env::current_dir()` 或 cargo 編譯期 path 推斷 resources 位置;WORKDIR `/app` 須驗證與 application.yaml 期望的相對 path 對齊(`./server/resources/application.yaml` 還是 `/app/server/resources/application.yaml` 等)。
- **TZ 在 debian-slim 設定無效**:debian-slim 預設不含 tzdata 包,須在 runtime apt install 階段顯式安裝;若忘記裝,`docker run --entrypoint date rust-api:test` 顯示 UTC 而非 Asia/Shanghai。
- **BuildKit cache mount 在 buildx 預設 driver 不持久**:用 `docker buildx create --use --driver-opt ...` 或 GHA `cache-from/to` 注入;W-F1 範圍內不處理 CI cache(留 W-F17),但 local dev 第二次 build 期望 cache hit。
- **Builder stage 失敗時 layer cache 污染**:Docker 預設保留 failed builder layer cache,如 cargo build 中途 fail 後重 build 可能用到 stale cache;plan 階段建議在 acceptance test 內 `docker builder prune` 後再跑。
- **`.dockerignore` 漏排除 `target/` 導致 builder context 上傳幾 GB**:既有 `.dockerignore` 已排除 `/target /bin`,W-F1 微調時須保留並 verify。

## Requirements *(mandatory)*

### Functional Requirements

#### A. Dockerfile 結構(rev1 deploy 版本)

- **FR-001**: rust-api/Dockerfile MUST 使用 multi-stage build:builder stage + runtime stage 兩階段、用 `FROM ... AS builder` + `FROM ... AS runtime` 結構
- **FR-002**: Builder stage MUST 以 `rust:1.86-slim-bookworm` 為 base、apt install 至少 `pkg-config libssl-dev ca-certificates git` 4 個 build dependency、使用 `--no-install-recommends` 旗標
- **FR-003**: Builder stage MUST 用 BuildKit cache mount 加速 incremental build,至少 mount 3 個 cache target:`/usr/local/cargo/registry`、`/usr/local/cargo/git`、`/app/target`
- **FR-004**: Builder stage MUST 同時 build 兩個 binary:`cargo build --release --bin server --bin migration`(不可拆兩次 build、避免重複編譯 workspace deps)
- **FR-005**: Builder stage MUST 對兩個 binary 跑 `strip`(去除 debug symbol、減小 binary size)

#### B. Runtime stage 配置

- **FR-006**: Runtime stage MUST 以 `debian:bookworm-slim` 為 base、apt install 至少 `ca-certificates libssl3 curl tzdata` 4 個 runtime dependency、使用 `--no-install-recommends` 旗標
- **FR-007**: Runtime stage MUST 建立 non-root user 名 `rust-api`、uid `10001`、shell `/usr/sbin/nologin`、home `/home/rust-api`
- **FR-008**: Runtime stage MUST 設定 `USER rust-api` 並 `EXPOSE 11081`、`ENTRYPOINT ["/usr/local/bin/server"]`
- **FR-009**: Runtime stage MUST COPY server binary 到 `/usr/local/bin/server`、migration binary 到 `/usr/local/bin/migration`(兩者可由不同 entrypoint 取用、支援 W-F8 migration init container 與未來 W-F9/W-F10 共 image 模式)
- **FR-010**: Runtime stage MUST COPY 3 個 resources(`application.yaml` / `ip2region.xdb` / `rbac_model.conf`)從 builder stage 到 `/app/server/resources/`、owner 設為 `rust-api:rust-api`
- **FR-011**: Runtime stage MUST 設定 env `TZ=Asia/Shanghai`、`LANG=en_US.UTF-8`、`RUST_ENV=production`、`APP_SERVER_PORT=11081`(讓 server 啟動時 override application.yaml `server.port: 10001`、對齊 EXPOSE 11081 與 W-F3 compose healthcheck 期望;走 F1.1 env-override 模式,application.yaml 內容不動)
- **FR-012**: Runtime stage MUST 設定 `WORKDIR /app`(對齊 cargo 編譯時的相對路徑期望)

#### C. `/health` endpoint(W-F1 範疇內新增)

- **FR-013**: rust-api server MUST 提供 `GET /health` endpoint、返 HTTP 200 + plain text response body `ok`
- **FR-014**: `/health` endpoint MUST 為 public — 不過 jwt_auth_middleware、不過 axum_casbin enforce layer
- **FR-015**: `/health` endpoint MUST 不查 DB、不查 redis(健康定義為「process 可服務 HTTP」、DB/redis health 由 W-F13 metrics exporter 另行觀測);MUST NOT 在 default `RUST_LOG=info` level 進 tracing log(rust tracing layer 加 filter 排除 path = `/health`,避免 W-F3 / 未來 W-F11 healthcheck 週期 poll 壓掉 application log 訊雜比);W-F13 metrics(`http_request_duration_seconds` histogram 含 `route="/health"` label)階段仍將記錄 `/health` 流量、observability 完整性不破壞。

#### D. Image tagging convention(文件化 — DESIGN-W §2.4 對齊)

- **FR-016**: W-F1 spec 與 plan MUST 明示主 tag pattern:`<registry>/rust-api:<short-git-sha>`(7-char SHA、每次 build 對應一個 commit、不可變)
- **FR-017**: W-F1 spec 與 plan MUST 明示輔助 tag pattern:`<registry>/rust-api:<branch>`(移動標籤、指向該 branch 最新 build,e.g. `rust-api:rev1-admin-rust-api`)、與 prod tag pattern:`<registry>/rust-api:prod-<YYYYMMDD>`(manual / W-F17 pipeline 觸發)
- **FR-018**: W-F1 spec 與 plan MUST 明示**不使用 `:latest` tag**(避免 image 對應不明)、具體 registry(ghcr.io / DockerHub / self-hosted)留 W-F17 拍板、W-F1 暫用 placeholder

#### E. `.dockerignore` 微調

- **FR-019**: rust-api/.dockerignore MUST 排除 `/target`(builder 自有 cache mount、不需上傳 host target 進 build context)、`/deploy`(rust-api 內部 deploy/ 是 redis-cluster compose、與 rev1 整體 deploy 無關)、`**/.env`(secret 不入 image)
- **FR-020**: rust-api/.dockerignore MUST 不排除 builder 所需的 source:`Cargo.toml` / `Cargo.lock` / `server/` / `axum-casbin/` / `sea-orm-adapter/` / `migration/` / `xdb/` 都須進 build context

#### F. 範疇邊界保護

- **FR-021**: W-F1 MUST NOT 動 docker-compose 結構(留 W-F3)、MUST NOT 動 Docker secrets 注入(留 W-F4)、MUST NOT 動 nginx 反向代理(留 W-F5)、MUST NOT 動 TLS cert(留 W-F6)、MUST NOT 動對外 port forwarding(留 W-F7)、MUST NOT 動 migration init container 行為(留 W-F8)、MUST NOT 動 cleanup-job / outbox-worker binary 形態(留 W-F9 / W-F10)、MUST NOT 動 observability stack(留 W-F12 ~ W-F14)、MUST NOT 動 backup / DR(留 W-F15 / W-F16)、MUST NOT 動 CI/CD pipeline(留 W-F17 / W-F18)、MUST NOT 預埋多 arch build 機制(`--platform=$BUILDPLATFORM` ARG / buildx 多 arch 等留 W-F17)
- **FR-022**: W-F1 MUST NOT 改動既有 rust 源碼**除了**新增 `/health` endpoint(server router + router_initialization mount);MUST NOT 改 server-bin main、MUST NOT 加 cleanup-job / outbox-worker subcommand、MUST NOT 改既有 admin router 結構
- **FR-023**: W-F1 MUST NOT 改動既有 application.yaml 內容(只 COPY 到 image,內容由 plan 階段 / W-F4 處理)

### Key Entities *(include if data involved)*

- **rust-api image**:單一 docker image,內含 server + migration 兩個 binary、3 個 resources。同一 image 可作為主 server runtime(ENTRYPOINT 預設)、W-F8 migration init container(entrypoint override 為 `/usr/local/bin/migration`)、未來 W-F9 cleanup-job / W-F10 outbox-worker(entrypoint override + command 切換、待對應 feature 階段具體拍板)。
- **Builder context**:`rust-api/` 目錄整個(經 .dockerignore 過濾)。
- **Runtime resources**:3 個檔案 — `application.yaml`(server 啟動 config、含 placeholder 由 env override)、`ip2region.xdb`(IP→geo location 查表,~11MB)、`rbac_model.conf`(Casbin RBAC model 定義)。
- **`/health` endpoint**:單一 HTTP route — `GET /health` → 200 + `"ok"`(plain text)。Mount 在 server router root level(不在 `/api/*` 下),不經過 jwt_auth_middleware 與 axum_casbin enforce。
- **Image tag**:三類:主 tag(short-sha 不可變)、輔助 tag(branch 移動)、prod tag(日期 manual)。具體 registry hostname 由 W-F17 拍板,W-F1 階段以 placeholder 形式記錄。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在乾淨 docker host 上 `docker build -t rust-api:test rust-api/` 可成功完成、無 build error、第一次無 cache build 預期 5-10 分鐘內(取決於 host CPU)
- **SC-002**: 產出 image size < 250MB(debian-slim runtime + libssl3 + curl + tzdata + 2 個 stripped release-mode binary;若超過則 acceptance 看 250-300MB 區間決定是否 plan 階段優化、超過 300MB 須優化)
- **SC-003**: 第二次 build(有 BuildKit cache)時間 < 1 分鐘(cargo registry / git / target 三層 cache mount hit)
- **SC-004**: `docker exec <container> curl -f http://localhost:11081/health` 在啟動完成的 server container 上回應 200 OK + body `ok`、p99 latency < 50ms(local docker network)
- **SC-005**: image 內 9 個 acceptance check(Dimension A-E 對應 FR-001 ~ FR-018)100% pass
- **SC-006**: 同一 image 可作為 W-F8 migration init container 使用(`docker run --entrypoint /usr/local/bin/migration <image> up` 可呼叫,assumption 是 DB 已就緒由 W-F8/W-F3 處理)
- **SC-007**: W-F2 / W-F3 / W-F4 三個 P1 後續 feature 在 spec / plan / implement 過程中無 W-F1 相關 blocker 出現(rev1 deploy P1 解鎖)
- **SC-008**: musl→glibc 切換不破壞既有 F1-F5 功能(`docker run` 起的 server 在帶完整 secret + DB + redis 環境下仍可跑通既有 F5.1 login flow,by 連跑一次 F5.1 acceptance subset 驗 regression)

## Assumptions

- **既有 rust-api workspace 在 debian glibc 環境可 build**:F1-F5 都在 alpine musl 上實作驗證,切到 debian glibc 後 `cargo build --release --bin server --bin migration` 預期可跑通;若 openssl 從 static 改 dynamic 或某 crate 有 musl-specific feature 導致 build 失敗,W-F1 plan 階段須先解。Spec 階段第一個前置 task 即 host build 驗證。
- **rust-api/server/resources/ 內 3 個檔(application.yaml / ip2region.xdb / rbac_model.conf)為 prod 必要 runtime resources**:其他 application-test.* / application.yaml.example / ip.test.txt 屬 dev/test 用,W-F1 image 不 COPY。
- **既有 router_initialization 結構允許在 root level 加 mount**:既有 `server/initialize/src/router_initialization.rs` 預期可在不破壞 `/api/*` admin / public mount 的前提下新增 root-level `.route("/health", ...)`;若不支援、plan 階段先做 minimal refactor。
- **F1.1 strict secret 驗證在 W-F1 image 上行為一致**:既有 F1.1 在 alpine 上驗過,debian 環境預期行為一致(panic 訊息字串可能略不同、acceptance test 用 substring match)。
- **config crate 支援 `APP_SERVER_PORT` env override**:per Q1 clarify 拍板,W-F1 透過 Dockerfile `ENV APP_SERVER_PORT=11081` 讓 server 啟動 listen 11081 而非 application.yaml 預設 10001。前置 task = plan 階段第一個 audit `rust-api/server/config/` 確認 config-rs(或同類)load order 含 env prefix `APP_` 與 nested key separator(`_` 還是 `__`)、實際 env var 命名可能調整為 `APP_SERVER__PORT` 等;若 env binding 不支援、plan 階段加 minimal config crate 改動以實現 server.port env override。
- **BuildKit 啟用**:`docker buildx` 或 `DOCKER_BUILDKIT=1` 為 host 預設(現代 docker 預設啟用、若 user 用舊版 docker 須手動 enable、W-F1 spec / plan 文件提示)。
- **registry 與 image push 不在 W-F1 範疇**:W-F1 只交付 Dockerfile + local build 驗證,push 到 registry 與 CI pipeline 自動化由 W-F17 拍板。W-F1 spec / plan 用 `local/rust-api` 或 `ghcr.io/miso168net/rust-api` 作為 tag 範例 placeholder。
- **Image size 上限 250MB 為設計目標、非 hard fail**:若 build 後實際 size 落 250-300MB,acceptance 接受但 plan 階段須在 risk 段記錄;> 300MB 須優化方案(distroless / scratch / 拆 image)。
- **W-F1 acceptance test 不交付 compose 配置**:Dimension D `/health` endpoint 可達性驗證需要 minimal 起 postgres + redis,acceptance 透過 manual docker run 或臨時 compose 命令完成,**不**屬 W-F1 deliverable;W-F3 才交付 compose 主結構。
- **W-F1 image target platform = `linux/amd64` only**:per Q2 clarify 拍板;build host 預設行為(WSL2 / GHA Linux runner 都是 amd64),Dockerfile 不顯式 pin platform、不啟用 buildx 多 arch;若未來 arm64 需求出現(M1/M2 Mac dev / AWS Graviton 等),由 W-F17 CI pipeline 階段補上 `docker buildx --platform linux/amd64,linux/arm64`。
- **`/health` request log filter 走 tracing layer 排除 path**:per Q3 clarify 拍板,W-F1 範疇加 `EnvFilter` 或 tracing layer 配置排除 `path="/health"`;具體實作位置(tower-http TraceLayer middleware filter / tracing-subscriber EnvFilter / 自寫 layer)由 plan 階段拍板。預期最簡實作:tower-http `TraceLayer::new_for_http().make_span_with(|req| match req.uri().path() { "/health" => tracing::Span::none(), _ => DefaultMakeSpan::new().make_span(req) })` 或同類。
- **依 CLAUDE.md §6.1 兩段式 commit 紀律**:本 feature 實作的 rust-api 改動(Dockerfile + .dockerignore + /health endpoint mount)落 `rev1-admin-rust-api` 分支、需 worktree 內 commit + push 到 fork remote;spec docs(`specs/006-dockerfile-rust-api/`)落本 feature branch `006-dockerfile-rust-api` outer git。Feature 完成後 outer feature branch merge 回 `rev1-admin-root`、submodule SHA pin 更新。
