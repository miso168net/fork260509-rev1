# Data Model: W-F1 dockerfile-rust-api

**Feature**: 006-dockerfile-rust-api
**Phase**: 1 (design)
**Date**: 2026-05-15
**Source**: spec.md `## Key Entities` 段 + research.md R-001~R-006

**Scope note**:W-F1 為 infrastructure / deploy feature,無 DB schema 改動、無 persistent entity。本 data-model 描述 **build-time + runtime** 的 entity / artifact 結構與關聯。

---

## Entities

### E1: `rust-api-image` (Docker Image)

**Type**: build artifact(docker image)

**Identity**: image tag(3 種模式,DESIGN-W §2.4 定義):

| Tag 模式 | 格式 | 觸發 | 不可變? |
|---|---|---|---|
| 主 tag | `<registry>/rust-api:<short-git-sha>` (7-char SHA) | 每次 build | ✅ Yes |
| 輔助 tag | `<registry>/rust-api:<branch>` (e.g. `rust-api:rev1-admin-rust-api`) | build 同時更新 | ❌ No(移動) |
| Prod tag | `<registry>/rust-api:prod-<YYYYMMDD>` | manual / W-F17 pipeline | ❌ No(可重指) |

**Forbidden tag**: `:latest`(per spec FR-018、避免 image 對應不明)

**Attributes**:
- `image_size`(bytes)— SC-002:< 250MB(target)/ 250-300MB acceptable / > 300MB optimize
- `arch`(string)— W-F1 範圍 = `linux/amd64`(per Q2 clarify)
- `base_runtime`(image ref)— `debian:bookworm-slim`
- `entrypoint`(string)— `/usr/local/bin/server`
- `exposed_port`(int)— `11081`
- `user`(string:uid)— `rust-api:10001`
- `workdir`(path)— `/app`

**Contents**(image layout):
```
/usr/local/bin/
├── server          # Binary 1 - 主 server(per E2a)
└── migration       # Binary 2 - sea-orm migration CLI(per E2b)

/app/server/resources/
├── application.yaml       # E3a - server 啟動 config(server.port = 10001 by file、APP_SERVER_PORT env override 為 11081)
├── ip2region.xdb          # E3b - IP→geo location lookup(~11MB)
└── rbac_model.conf        # E3c - Casbin RBAC model 定義

# 不含(.dockerignore 或非 prod):
# - source code (cargo build artifact 留 builder stage,runtime 不需)
# - test resources (application-test.*, ip.test.txt, application.yaml.example)
# - deploy/ (rust-api/deploy/ 是 redis-cluster compose、與 rev1 整體無關)
# - target/, /bin, /.idea, /.vscode
```

**Lifecycle**:
- **build**:`docker build -t <tag> rust-api/` → builder stage 編 → runtime stage 組 → stripped binary + 3 resources + non-root user
- **tag/push**:W-F17 CI 階段 push 到 registry(W-F1 範圍外)
- **run**:被 W-F3 docker-compose 引用 / 被 W-F8 migration init container 引用 / 被未來 W-F9 cleanup-job / W-F10 outbox-worker 引用
- **prune**:image cache pruning policy 屬 host ops(W-F1 範圍外)

**Relationships**:
- contains → E2a (`server` binary)、E2b (`migration` binary)
- contains → E3a / E3b / E3c (resources)
- consumes → E4 (env override)
- exposes → E5 (`/health` endpoint via E2a runtime)

**Validation** (spec → acceptance):
- AC-1 ~ AC-3 → image build / size / multi-stage(Dimension A)
- AC-4 ~ AC-6 → non-root user / uid / resources owner(Dimension B)
- FR-009、FR-010 → contains 2 binary + 3 resources

---

### E2: Binary(內含於 E1)

#### E2a: `server` binary

**Type**: stripped release-mode rust binary

**Source crate**: `rust-api/server/bin`(Cargo workspace member,crate name `server-bin`,bin name `server`、`path = "src/main.rs"`)

**Path in image**: `/usr/local/bin/server`

**Invocation**:
- 預設:`docker run rust-api:<tag>` → ENTRYPOINT `["/usr/local/bin/server"]` → 啟 axum on `:${APP_SERVER_PORT}`
- (未來)`docker run --entrypoint /usr/local/bin/server rust-api:<tag> cleanup-job ...` → W-F9 cleanup-job(W-F1 範圍外、見 brainstorm Q2)
- (未來)`docker run --entrypoint /usr/local/bin/server rust-api:<tag> outbox-worker` → W-F10(同上)

**Build attributes**(per spec FR-002 ~ FR-005):
- `cargo build --release --bin server --bin migration`(W-F1 與 E2b 同次 build,共享 workspace deps cache)
- LTO + strip + opt-level 3(per `rust-api/Cargo.toml` `[profile.release]` + Dockerfile RUN strip)
- 不使用 `--no-default-features`(per brainstorm Q2 拍板:既有 alpine Dockerfile 用此 flag、W-F1 移除走 default features)

**Runtime env**(W-F1 範疇內注入):
- `TZ=Asia/Shanghai`
- `LANG=en_US.UTF-8`
- `RUST_ENV=production`
- `APP_SERVER_PORT=11081`(Q1 clarify、override application.yaml `server.port: 10001`)

**Required external env**(per F1.1 strict validation,執行時 user/compose 必須提供):
- `APP_JWT_JWT_SECRET`(secret,< 32 chars panic)
- `APP_DATABASE_URL`(or `application.yaml.database.url` placeholder fill)
- `APP_REDIS_URL`(同上)
- … 其他 W-F4 secret 階段定義

#### E2b: `migration` binary

**Type**: stripped release-mode rust binary

**Source crate**: `rust-api/migration`(Cargo workspace member,crate + bin name `migration`、`path = "src/main.rs"`)

**Path in image**: `/usr/local/bin/migration`

**Invocation**:
- `docker run --entrypoint /usr/local/bin/migration rust-api:<tag> help` → 顯示 sea-orm migration CLI help
- `docker run --entrypoint /usr/local/bin/migration rust-api:<tag> up` → 跑 migration up(被 W-F8 init container 使用)

**Required external env**:
- `APP_DATABASE_URL`(write-schema credential,per Constitution 架構約束)

---

### E3: Resources(內含於 E1)

#### E3a: `application.yaml`

**Path in image**: `/app/server/resources/application.yaml`

**Owner**: `rust-api:rust-api`(per FR-010)

**Content**: server 啟動 config(yaml 結構:`server.port` / `database.url` / `redis.url` / `jwt.*` / `casbin.*` 等)

**W-F1 不改動內容**(per FR-023)— 透過 env override 機制(E4)注入 prod 配置

**Loaded by**: `EnvConfigLoader::new().with_file("server/resources/application.yaml").with_env_prefix("APP").load()` 在 `rust-api/server/config/src/env_config.rs`

#### E3b: `ip2region.xdb`

**Path in image**: `/app/server/resources/ip2region.xdb`

**Size**: ~11MB

**Owner**: `rust-api:rust-api`

**Purpose**: IP → geo location(country / region / city)lookup binary 檔(per `rust-api/xdb` crate),server 啟動載入記憶體

**W-F1 不改動內容**

#### E3c: `rbac_model.conf`

**Path in image**: `/app/server/resources/rbac_model.conf`

**Owner**: `rust-api:rust-api`

**Purpose**: Casbin RBAC model 宣告(`request_definition / policy_definition / policy_effect / matchers` 4 段),server 啟動 `initialize_casbin("server/resources/rbac_model.conf", ...)` 載入

**W-F1 不改動內容**

---

### E4: Env override mapping(runtime config injection)

**Type**: 環境變數→config field 對映(through `EnvConfigLoader`)

**Prefix**: `APP`(per `rust-api/server/config/src/env_config.rs` 預設)

**Separator**: `_`(同上)

**Examples**:

| Env var | Maps to | W-F1 default? | Source |
|---|---|---|---|
| `APP_SERVER_PORT` | `server.port` | ✅ `11081`(Dockerfile ENV) | Q1 clarify |
| `APP_JWT_JWT_SECRET` | `jwt.jwt_secret` | ❌(W-F4 / runtime 注入) | F1.1 |
| `APP_DATABASE_URL` | `database.url` | ❌(W-F4 / runtime 注入) | W-F8 |
| `APP_REDIS_URL` | `redis.url` | ❌(W-F4 / runtime 注入) | constitution 架構約束 |
| `TZ` | os-level(non-config) | ✅ `Asia/Shanghai` | Dockerfile |
| `LANG` | os-level | ✅ `en_US.UTF-8` | Dockerfile |
| `RUST_ENV` | application context flag | ✅ `production` | Dockerfile |
| `RUST_LOG` | tracing filter | ❌(default INFO、未注入) | spec FR-015 |

**W-F1 範疇內注入**:僅 4 個(`TZ`, `LANG`, `RUST_ENV`, `APP_SERVER_PORT`)
**W-F4 secret 階段注入**:`APP_JWT_JWT_SECRET`, `APP_DATABASE_URL`, `APP_REDIS_URL` 等
**W-F3 compose 階段配置**:其他 service-specific env

---

### E5: `/health` endpoint(runtime service)

**Type**: HTTP route(W-F1 新增)

**Route definition**:
- Method:`GET`
- Path:`/health`(root level、不在 `/api/*` prefix 下)
- Mount:`Router::new().route("/health", get(health_handler))` merged into root `app: Router` at end of `initialize_admin_router()` fn(per R-003)

**Middleware bypass**(per FR-014 + spec.md Q3 clarify):
- ❌ 不過 `TraceLayer`(自動 = INFO log 不出 /health)
- ❌ 不過 `RequestIdLayer`(無 request id 標籤、不需要)
- ❌ 不過 `jwt_auth_middleware`(public access)
- ❌ 不過 `CasbinAxumLayer`(public、無 enforce)
- ❌ 不過 `api_key_middleware`(public)

**Response shape**:
- Status: 200 OK(unconditional、不查 DB / redis)
- Body:`ok`(plain text、~2 bytes)
- Content-Type:由 axum 預設處理(若 handler 返 `&'static str` → `text/plain; charset=utf-8`)

**Handler signature**(reference):
```rust
async fn health_handler() -> &'static str {
    "ok"
}
```

**Behavior**:
- 不查 DB(per FR-015)
- 不查 redis(per FR-015)
- 不發出 INFO level tracing log(per FR-015 update / Q3 clarify)
- p99 latency < 50ms(per SC-004)

**Validation**(spec → acceptance Dimension D):
- Scenario 10:`curl -f http://<container>:11081/health` → 200 + `ok`
- Scenario 11:不帶 token call → 200(public)
- Scenario 12:source code grep `/health` 至少 1 命中
- Scenario 12b:RUST_LOG=info 連續 call 10 次 → 0 個 `/health` log row;RUST_LOG=debug → 有 debug 級別 trace

**Consumers**(future):
- W-F3 compose healthcheck:`test: ["CMD", "curl", "-f", "http://localhost:11081/health"]`
- W-F11 front-nginx upstream healthcheck(可選、屬 W-F11 拍板)
- 任何 ops probe / k8s liveness probe(future)

---

### E6: `.dockerignore` (build context filter)

**Type**: build configuration

**Path**: `rust-api/.dockerignore`(既有)

**W-F1 改動**: 微調(per FR-019、FR-020)

**Must exclude** (FR-019):
- `/target`(builder cache mount 提供、不需從 host 上傳)
- `/deploy`(rust-api/deploy/ 是 redis-cluster compose、與 rev1 整體 deploy 無關)
- `**/.env`(secret 不入 image)
- 既有排除全保留:`/.idea /.vscode /bin LICENSE README.md` 等

**Must NOT exclude** (FR-020):
- `Cargo.toml` / `Cargo.lock`(cargo build 必需)
- `server/` / `axum-casbin/` / `sea-orm-adapter/` / `migration/` / `xdb/`(workspace crate source)
- `.cargo/`(cargo config — channel + profile)

**Validation**: 透過實際 `docker build` 成功與否驗證(若漏 source、builder stage compile fail)

---

## Entity Relationship Diagram

```
                  ┌─────────────────────────────────┐
                  │ E1: rust-api-image              │
                  │ (linux/amd64, debian-slim       │
                  │  runtime, < 250MB)              │
                  └────┬───────────────┬────────────┘
        ┌──────────────┼───────────────┼──────────────────────┐
        │              │               │                      │
        ▼              ▼               ▼                      ▼
   ┌──────────┐  ┌─────────────┐  ┌──────────┐         ┌─────────────┐
   │ E2a      │  │ E2b         │  │ E3a/b/c  │         │ E4: env     │
   │ server   │  │ migration   │  │resources │  ◄──── │ override    │
   │ binary   │  │ binary      │  │(yaml/xdb │         │ APP_SERVER_ │
   │          │  │             │  │/conf)    │         │ PORT=11081  │
   └────┬─────┘  └─────────────┘  └──────────┘         └─────────────┘
        │
        │ exposes
        ▼
   ┌──────────────────┐
   │ E5: /health      │
   │ endpoint         │
   │ - public (no auth│
   │   / casbin /     │
   │   trace layer)   │
   │ - 200 + "ok"     │
   └──────────────────┘

[Build-time configuration]
   ┌──────────────────┐
   │ E6: .dockerignore│
   │ (filters builder │
   │  context)        │
   └──────────────────┘
```

---

## Reference: 既有 W-F1 範圍外的 entity(供後續 W-F feature 對接參考)

下列 entity **不在 W-F1 spec 內定義**,在此列出以方便後續 W-F2 ~ W-F18 spec-kit feature 引用:

- **W-F8 migration init container**:複用 E1,override entrypoint = E2b、使用獨立 write-schema credential(per constitution 架構約束)
- **W-F9 cleanup-job container**:複用 E1,override entrypoint = E2a + command `cleanup-job ...`(per brainstorm Q2 暗示;具體 subcommand vs 獨立 crate 由 W-F9 拍板)
- **W-F10 outbox-worker container**:複用 E1,override entrypoint = E2a + command `outbox-worker`
- **W-F11 horizontal scaling**:E1 為 stateless image、可 N replicas;EXPOSE 11081 對齊 front-nginx upstream
- **W-F12/W-F13 observability**:E5 `/health` 不進 log 但 W-F13 metrics(`http_request_duration_seconds` histogram + `route="/health"` label)仍記錄
- **W-F17 CI build pipeline**:E1 build / tag / push 自動化(registry / 多 arch 等留 W-F17 拍板)
