# Contract: rust-api Dockerfile structure

**Feature**: 006-dockerfile-rust-api
**Path**: `rust-api/Dockerfile`(W-F1 覆寫對象)
**Format**: Dockerfile syntax v1.x(BuildKit-aware)

此 contract 規範 W-F1 產出的 Dockerfile **結構性約束**,讓 W-F2 ~ W-F18 後續 feature 知道哪些是 W-F1 凍結的、哪些屬未來 feature 可改的。

---

## C-D1: ARG 宣告(top of Dockerfile)

**Frozen by W-F1**:
```dockerfile
ARG RUST_VERSION=1.86
ARG DEBIAN_CODENAME=bookworm
ARG APP_USER=rust-api
ARG APP_UID=10001
ARG APP_PORT=11081
ARG TZ=Asia/Shanghai
```

**Constraints**:
- `RUST_VERSION` MUST 是 minor pin(`1.86` 而非 `1.86.0`)— 沿用既有風格、reproducibility 由 `Cargo.lock` 保證(per R-004)
- `DEBIAN_VERSION` MUST 是 `bookworm-slim`(per Q1 clarify、DESIGN-W §2.1)
- `APP_USER` MUST 是 `rust-api`(per FR-007、改 既有 `appuser` → `rust-api`)
- `APP_UID` MUST 是 `10001`(沿用既有)
- `APP_PORT` MUST 是 `11081`(per Q1 clarify、對齊 EXPOSE + APP_SERVER_PORT env)
- `TZ` MUST 是 `Asia/Shanghai`(沿用既有)

**Future flexibility** (W-F17 CI 階段可動):
- 加 `ARG BUILD_SHA` 用於 image label(若 W-F17 需要 build metadata 注入 image)
- 加 `ARG REGISTRY=local`(若 W-F17 需要 tag prefix 注入)
- `RUST_VERSION` 升 1.87+(視 toolchain 升級)

---

## C-D2: Builder stage 結構

**Frozen by W-F1**:
```dockerfile
FROM rust:${RUST_VERSION}-slim-${DEBIAN_CODENAME} AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo build --release --bin server --bin migration && \
    cp target/release/server /tmp/server && \
    cp target/release/migration /tmp/migration && \
    strip /tmp/server /tmp/migration
```

**Constraints**:
- Base MUST 是 `rust:<RUST_VERSION>-slim-<DEBIAN_VERSION>`(per FR-002)
- `apt install` packages MUST 至少含 `pkg-config libssl-dev ca-certificates git`(per FR-002、減少 = 可能 build fail)
- `--no-install-recommends` MUST 啟用(per FR-002、減小 builder image)
- BuildKit cache mount MUST 至少 3 個:`cargo/registry` / `cargo/git` / `target`(per FR-003)
- `cargo build` MUST 一次 build 兩個 binary:`--bin server --bin migration`(per FR-004、避免重複編 deps)
- `strip` MUST 跑(per FR-005)
- 取出 binary 用 `cp ... /tmp/...` 模式(避免 stage 結束時 build cache mount 隨 layer 釋放)

**Future flexibility**:
- W-F11 horizontal scaling 階段如要加 jemalloc / mimalloc allocator,加 `RUSTFLAGS` env 或 `--features` flag
- W-F17 CI 階段如要注入 build SHA,加 `LABEL` 在 stage 2

---

## C-D3: Runtime stage 結構

**Frozen by W-F1**:
```dockerfile
FROM debian:${DEBIAN_CODENAME}-slim AS runtime

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
    RUST_ENV=production \
    APP_SERVER_PORT=${APP_PORT}

ENTRYPOINT ["/usr/local/bin/server"]
```

**Constraints**:
- Base MUST 是 `debian:<DEBIAN_VERSION>`(per FR-006)
- `apt install` MUST 至少含 `ca-certificates libssl3 curl tzdata`(per FR-006)
- `useradd` MUST 配 `-r -u 10001 -m -d /home/rust-api -s /usr/sbin/nologin`(per FR-007)
- COPY binary MUST 兩個:`server` + `migration`(per FR-009)
- COPY resources MUST 3 個 + `--chown` 給 rust-api(per FR-010)
- USER 必 = `rust-api`(per FR-008)
- EXPOSE 必 = 11081(per FR-008)
- ENV 必含 4 個:`TZ` / `LANG` / `RUST_ENV` / `APP_SERVER_PORT`(per FR-011)
- ENTRYPOINT MUST 是 `["/usr/local/bin/server"]`(per FR-008)

**Future flexibility**:
- W-F4 secret 階段:加更多 `_FILE` 環境變數(`JWT_SECRET_FILE` 等)
- W-F8 init container:override entrypoint = `/usr/local/bin/migration`(透過 compose,Dockerfile 不變)
- W-F9 / W-F10:override entrypoint + command(Dockerfile 不變)
- W-F11 horizontal scaling:image 本身不變、replicas 由 compose 控制

---

## C-D4: Stage 命名與 multi-stage 行為

**Frozen by W-F1**:
- Stage 1 名稱:`builder`(per `AS builder`)
- Stage 2 名稱:`runtime`(per `AS runtime`)
- 預設 build target:`runtime`(無 `--target` flag 時 docker 用最後一個 stage)

**Validation**: `docker history rust-api:test` 應只看到 runtime stage layers + COPY --from=builder 引用、不應看到 builder stage 中間 layer(per scenario-3)

---

## C-D5: 不允許出現的 pattern(W-F1 範疇邊界保護)

下列 pattern MUST NOT 出現在 W-F1 Dockerfile:

- ❌ `--platform=$BUILDPLATFORM` ARG(per FR-021 update + Q2 clarify;多 arch 留 W-F17)
- ❌ `RUN docker secrets` / `RUN --mount=type=secret`(secret 注入留 W-F4)
- ❌ `HEALTHCHECK` directive(留 W-F3 docker-compose healthcheck;Dockerfile-level healthcheck 與 compose-level 重疊、optional 不加更乾淨)
- ❌ migration / cleanup-job / outbox-worker 的 entrypoint override(留 docker-compose 設定、Dockerfile 維持 ENTRYPOINT `server`)
- ❌ `LABEL` 注入(W-F17 CI 階段拍板 metadata schema)
- ❌ `:latest` 任何 tag 引用(per FR-018)

---

## C-D6: `.dockerignore` 結構

**File**: `rust-api/.dockerignore`(既有、W-F1 微調)

**MUST exclude**(per FR-019、既有保留 + W-F1 確認):
- `/target` — builder cache mount 提供
- `/deploy` — rust-api 內 deploy/(redis-cluster compose)非 rev1 部署
- `**/.env` — secret 不入 image
- 既有保留:`/.idea`, `/.vscode`, `/bin`, `LICENSE`, `README.md`, `*.md`(部分), `**/Dockerfile*`(避免 layer override)

**MUST NOT exclude**(per FR-020、builder 必需):
- `Cargo.toml`, `Cargo.lock` — workspace manifest
- `server/`, `axum-casbin/`, `sea-orm-adapter/`, `migration/`, `xdb/` — workspace crate sources
- `.cargo/` — channel + profile 配置
- `server/resources/application.yaml`, `server/resources/ip2region.xdb`, `server/resources/rbac_model.conf` — runtime resources

**Validation**: `docker build` 成功 = `.dockerignore` 不漏排除 / 不誤排除

---

## C-D7: Image 屬性 contract(W-F3 / W-F8 後續 feature 可依賴)

W-F1 產出的 image 提供下列**穩定保證**,後續 W-F2 ~ W-F18 feature 可依賴:

| 屬性 | 保證值 | Verification |
|---|---|---|
| ENTRYPOINT | `/usr/local/bin/server` | `docker inspect rust-api:<tag>` |
| EXPOSE | `11081/tcp` | 同上 |
| USER | `rust-api`(uid 10001) | `docker run --entrypoint whoami` |
| WORKDIR | `/app` | 同上 |
| Migration binary 可呼叫 | path `/usr/local/bin/migration` | `docker run --entrypoint /usr/local/bin/migration ... help` |
| /health endpoint 可達(after startup) | `GET /health` → 200 + `ok` | `curl -f http://<container>:11081/health` |
| TZ | `Asia/Shanghai` | `docker run --entrypoint date` |
| arch | `linux/amd64` | `docker inspect --format='{{.Architecture}}'` |
| size | < 250MB target / < 300MB acceptable | `docker image inspect --format='{{.Size}}'` |

W-F2 ~ W-F18 spec 可引用上表作為 W-F1 提供的 contract、不需重新驗證。
