# Data Model: W-F3 compose-base-structure

**Feature**: 008-compose-base-structure
**Phase**: 1 (design)
**Date**: 2026-05-15
**Source**: spec.md `## Key Entities` + research.md R-001~R-011

**Scope note**:W-F3 為 infrastructure / deploy feature,無 DB schema 改動、無 application-level persistent entity。本 data-model 描述 **docker-compose stack 結構** 的 entity / artifact 結構與關聯。

---

## Entities

### E1: `docker-compose.yml`(主交付檔)

**Type**:docker-compose v2 file format

**Path**:outer repo root `docker-compose.yml`(git-tracked)

**Contents structure**:
```yaml
# 不寫 version: 段(modern compose convention、per R-008)
services:
  postgres: { ... }
  redis: { ... }
  migration: { ... }
  rust-api: { ... }
  base-web: { ... }

networks:
  internal:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
```

**Relationships**:
- 包含 5 services (E2a-E2e)
- 包含 1 network (E3)
- 包含 2 volumes (E4a-E4b)
- 依賴 .env (E5)
- 引用 W-F1 image / W-F2 image(E6a / E6b、外部 contract)

---

### E2: Services(5 個、內含於 E1)

#### E2a: `postgres`

| Attribute | Value |
|---|---|
| image | `postgres:17.4`(per Q1 / FR-003) |
| environment | `TZ`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`(從 `.env` interpolation) |
| volumes | `postgres_data:/var/lib/postgresql/data`(per FR-014 / R-003) |
| networks | `[internal]` |
| healthcheck | `pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB`、interval=10s / timeout=5s / retries=5(per FR-006 / R-004) |
| restart | `unless-stopped`(per FR-019) |
| ports | **無**(per FR-024 / Q3 嚴守 W-F7 邊界) |

#### E2b: `redis`

| Attribute | Value |
|---|---|
| image | `redis/redis-stack:7.4.0-v3`(per Q2 / FR-004) |
| command | `redis-server --requirepass $$REDIS_PASSWORD`(從 .env interpolation、`$$` shell escape) |
| environment | `TZ`, `REDIS_PASSWORD` |
| volumes | `redis_data:/data`(per FR-014) |
| networks | `[internal]` |
| healthcheck | `redis-cli -a $$REDIS_PASSWORD ping`、interval=10s / timeout=5s / retries=5(per FR-007) |
| restart | `unless-stopped` |
| ports | 無 |

#### E2c: `migration`(one-shot init container)

| Attribute | Value |
|---|---|
| image | `rust-api:${IMAGE_TAG:-rev1-admin-rust-api}`(per FR-005 / W-F1 image,IMAGE_TAG 由 .env override) |
| entrypoint | `["/usr/local/bin/migration"]` (per FR-008 / W-F1 image 含 migration binary) |
| command | `["up"]` (per FR-008 / R-002 sea-orm CLI subcommand) |
| environment | `APP_DATABASE_URL=postgres://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@postgres:5432/$${POSTGRES_DB}`(per analyze remediation I1、W-F1 T040 verified、rust-api `EnvConfigLoader` prefix `APP_`)|
| depends_on | `postgres: { condition: service_healthy }`(per FR-008 / R-007) |
| networks | `[internal]` |
| restart | `"no"`(per FR-018、one-shot) |
| ports | 無 |

#### E2d: `rust-api`

| Attribute | Value |
|---|---|
| image | `rust-api:${IMAGE_TAG:-rev1-admin-rust-api}` |
| environment | `APP_JWT_JWT_SECRET`(from .env、必要、F1.1 strict validation)、`APP_DATABASE_URL=postgres://...@postgres:5432/...`、`APP_REDIS_URL=redis://:$${REDIS_PASSWORD}@redis:6379`、`APP_SERVER_PORT=11081`(W-F1 image 已內建、可略)、`TZ=Asia/Shanghai`(W-F1 image 已內建、可略) |
| depends_on | `migration: { condition: service_completed_successfully }` + `postgres: { condition: service_healthy }` + `redis: { condition: service_healthy }`(per FR-009) |
| networks | `[internal]` |
| healthcheck | `curl -f http://localhost:11081/health`、interval=30s / timeout=5s / retries=3(per FR-009 / R-010) |
| restart | `unless-stopped` |
| ports | 無(W-F1 EXPOSE 11081 對 internal network 自動可達) |

#### E2e: `base-web`

| Attribute | Value |
|---|---|
| image | `base-web:${BASE_WEB_TAG:-rev1-admin-base-web}` |
| environment | `TZ=Asia/Shanghai`(W-F2 image 已內建、可略) |
| depends_on | **無**(per FR-010 / R-011 base-web 為 static SPA、無 runtime backend dep) |
| networks | `[internal]` |
| healthcheck | `curl -f http://localhost:8080/health`、interval=30s / timeout=5s / retries=3(per FR-010) |
| restart | `unless-stopped` |
| ports | 無(W-F2 EXPOSE 8080 對 internal network 自動可達、front-nginx W-F5 反代) |

---

### E3: Network — `internal`

**Type**:bridge driver

**Attribute**:
- driver: `bridge`(預設,可省略 explicit 寫,但 compose 文件慣例顯式)
- 內含 5 service:postgres / redis / migration / rust-api / base-web 全 attach

**Naming with COMPOSE_PROJECT_NAME**:
- compose `internal` → docker network `<project>_internal`(e.g. `rev1-admin_internal`)
- service 互相用 service name 解析(`postgres` / `redis` 等、由 docker 內部 DNS 提供)

**External access**:無 — service 間互通,host 不可達(per FR-024 / Q3 拍板嚴守 W-F7 邊界)

---

### E4: Named volumes(2 個)

#### E4a: `postgres_data`

| Attribute | Value |
|---|---|
| Type | named volume(non-bind) |
| Mount target | postgres service `/var/lib/postgresql/data`(per FR-014 / R-003 正解) |
| Persistence | `docker compose down` 不刪、`docker compose down -v` 才刪(per FR-020) |
| Backup | 由 W-F15 `pg_backup-pitr` 處理(W-F3 範圍外) |

#### E4b: `redis_data`

| Attribute | Value |
|---|---|
| Type | named volume |
| Mount target | redis service `/data`(redis 預設 working dir、AOF/RDB 落地) |
| Persistence | 同 E4a |

---

### E5: `.env` + `.env.example`(env 設定)

#### E5a: `.env.example`(git-tracked,範本)

**Path**:outer repo root `.env.example`

**Content**(per FR-016 + R-005 + R-006):
```bash
# === COMPOSE 命名(per CLAUDE.md §5.2,避免與 fork260509 既有 new-admin 衝突)===
COMPOSE_PROJECT_NAME=rev1-admin

# === POSTGRES(用於 postgres service + APP_DATABASE_URL 構造)===
POSTGRES_USER=soybean
# 注意:若密碼含 @ / : / / / # / ? 等 URL special char,DATABASE_URL parse 會出錯。
# 推薦用 hex 字串避免:openssl rand -hex 32
POSTGRES_PASSWORD=change-me-strong-password
POSTGRES_DB=soybean_admin_rust

# === REDIS(用於 redis service + APP_REDIS_URL 構造)===
# 同上密碼限制
REDIS_PASSWORD=change-me-strong-password

# === RUST-API(F1.1 strict secret validation 必要)===
# MUST replace:openssl rand -hex 32
APP_JWT_JWT_SECRET=replace-with-openssl-rand-hex-32

# === IMAGE TAGS(W-F1 / W-F2 acceptance 階段已 build)===
# 可改 short SHA 或 prod-<date>
IMAGE_TAG=rev1-admin-rust-api
BASE_WEB_TAG=rev1-admin-base-web
```

#### E5b: `.env`(gitignored,user 編輯)

**Path**:outer repo root `.env`

**Lifecycle**:user `cp .env.example .env` 後編輯填值;`.gitignore` 須含 `/.env`(per FR-015)

---

### E6: 外部 image references(W-F1 / W-F2 image)

#### E6a: rust-api image(由 W-F1 提供)

**Reference**:`rust-api:${IMAGE_TAG:-rev1-admin-rust-api}`

**Contract**(per [W-F1 contracts/dockerfile-structure.md C-D7](../006-dockerfile-rust-api/contracts/dockerfile-structure.md)):
- ENTRYPOINT:`/usr/local/bin/server`
- 另 binary:`/usr/local/bin/migration`(W-F3 `migration` service 用)
- EXPOSE 11081
- USER `rust-api`(uid 10001)
- /health endpoint:200 + `ok`
- F1.1 strict secret validation:無 `APP_JWT_JWT_SECRET` 會 panic

#### E6b: base-web image(由 W-F2 提供)

**Reference**:`base-web:${BASE_WEB_TAG:-rev1-admin-base-web}`

**Contract**(per [W-F2 contracts/dockerfile-structure.md C-D7](../007-dockerfile-base-web/contracts/dockerfile-structure.md)):
- CMD:`nginx -g daemon off;`
- EXPOSE 8080
- USER `nginx`(uid 101)
- /health endpoint:200 + `ok`
- SPA + assets cache 30d immutable / index.html no-cache

---

## Entity Relationship Diagram

```
                           ┌──────────────────────────────────┐
                           │ E5: .env / .env.example          │
                           │  COMPOSE_PROJECT_NAME=rev1-admin  │
                           │  POSTGRES_* / REDIS_PASSWORD      │
                           │  APP_JWT_JWT_SECRET / IMAGE_TAG   │
                           └─────────────┬────────────────────┘
                                         │ env interpolation
                                         ▼
              ┌────────────────────────────────────────────────────┐
              │ E1: docker-compose.yml                             │
              │   services:                                         │
              │     postgres / redis / migration / rust-api / base-web │
              │   networks: internal                                │
              │   volumes: postgres_data + redis_data               │
              └─┬────────────────────────┬─────────────┬─┬────────┘
                │                        │             │ │
        ┌───────┴──────┐         ┌──────┴────┐    ┌───┴─┴────┐
        │ E2: services │  ────►  │ E3: network│   │ E4: volumes│
        │ (5 個)       │  attach │ internal   │   │ postgres_data│
        └───────┬──────┘  ─────► └────────────┘   │ redis_data   │
                │                                   └────────────┘
        ┌───────┴──────────────────┐
        ▼                          ▼
   ┌────────────┐             ┌────────────┐
   │ E2c/d:     │             │ E2e:       │
   │ migration  │  references │ base-web   │
   │ + rust-api │  ────►      │            │
   └────┬───────┘             └────┬───────┘
        │ refs E6a                  │ refs E6b
        ▼                            ▼
   ┌────────────────────┐    ┌────────────────────┐
   │ E6a: rust-api image │   │ E6b: base-web image │
   │ (W-F1 contract     │   │ (W-F2 contract      │
   │  C-D7)              │   │  C-D7)              │
   └────────────────────┘    └────────────────────┘
```

---

## Startup sequence(依 depends_on chain)

```
[t=0]   user 跑 `docker compose up -d`
          │
          ▼
[t≈1s]  postgres / redis 開始啟動(parallel,無依賴)
          │
          ▼
[t≈5s]  postgres healthcheck pass(pg_isready ok)
        redis healthcheck pass(redis-cli ping ok)
          │
          ▼
[t≈6s]  migration container 啟動(等 postgres healthy)
          │ 跑 sea-orm migrations up
          ▼
[t≈12s] migration exit 0 → `service_completed_successfully`
          │
          ▼
[t≈13s] rust-api 啟動(等 migration completed + postgres healthy + redis healthy)
          │ F1.1 secret validation pass
          │ config / xdb / Casbin / DB connect / Redis 初始化
          ▼
[t≈25s] rust-api server listen 0.0.0.0:11081
          │ healthcheck pass
          ▼
[t≈30s] rust-api 進入 healthy 狀態

[t=parallel]
        base-web 同時啟動(無 depends_on、t≈1-5s 啟、healthy)
          │ nginx serve static
          ▼
        base-web healthy

[t≈30s] `docker compose ps` 全 5 service 預期狀態:
        - postgres   Up (healthy)
        - redis      Up (healthy)
        - migration  Exited (0)
        - rust-api   Up (healthy)
        - base-web   Up (healthy)
```

Total expected boot time:**30-60 sec** in clean state(per SC-001)。

---

## Reference: W-F3 範圍外 entity(後續 W-F feature 對接)

下列 entity **不在 W-F3 spec 內定義**,在此列出供後續 W-F feature 引用:

- **W-F4 secret-injection 對 .env / environment: 改造**:把 `environment:` 的 secret env 換成 `secrets:` top-level + `_FILE` pattern;FR-017 W-F3 過渡為 W-F4 升級點清晰
- **W-F5 front-nginx upstream**:`upstream rust_api { server rust-api:11081; }` + `upstream base_web { server base-web:8080; }` + `proxy_pass /api/` 到 rust-api / 其他到 base-web
- **W-F7 對外 port forwarding**:host port 11080/11443 / postgres 15432(dev only)等 — 透過 `docker-compose.override.yml` 或 `.dev.yml` profile 提供
- **W-F8 migration init container** 完整化:獨立 write-schema credential(從 `migration_db_url` secret)
- **W-F9 cleanup-job / W-F10 outbox-worker**:同 rust-api image + 不同 entrypoint subcommand
- **W-F12-14 observability**:`docker-compose.observability.yml` override + promtail/loki/prometheus/grafana 7 service
- **W-F15-16 backup / DR**:`backup` service + cron + WAL archive
- **W-FA1 nestjs(Track DESIGN-A)**:加 nestjs service + `profiles: ["track-a"]`、預設不啟、`--profile track-a` 手動啟
