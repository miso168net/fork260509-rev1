# Contract: docker-compose.yml + .env.example structure

**Feature**: 008-compose-base-structure
**Paths**:
- `<outer-repo>/docker-compose.yml`(W-F3 主交付檔、新建)
- `<outer-repo>/.env.example`(W-F3 副交付檔、新建、git-tracked)
- `<outer-repo>/.env`(gitignored、user 編輯)
**Format**: docker compose v2 file format

此 contract 規範 W-F3 產出的 `docker-compose.yml` + `.env.example` **結構性約束**。對齊 W-F1 / W-F2 contracts C-D1~C-D7 模式(分 C-C1 ~ C-C7)。

---

## C-C1: `.env.example` 結構

**Frozen by W-F3**(per FR-016 + R-005 + R-006):

```bash
# === COMPOSE 命名(per CLAUDE.md §5.2 避免與 fork260509 既有 new-admin 衝突)===
COMPOSE_PROJECT_NAME=rev1-admin

# === POSTGRES ===
POSTGRES_USER=soybean
# 警告:密碼若含 @ / : / / / # / ? 等 URL special char,DATABASE_URL parse 出錯
# 推薦用 hex 字串:openssl rand -hex 32
POSTGRES_PASSWORD=change-me-strong-password
POSTGRES_DB=soybean_admin_rust

# === REDIS ===
REDIS_PASSWORD=change-me-strong-password

# === RUST-API(F1.1 strict secret validation 必要)===
# MUST replace: openssl rand -hex 32
APP_JWT_JWT_SECRET=replace-with-openssl-rand-hex-32

# === IMAGE TAGS(W-F1 / W-F2 acceptance 已 build)===
IMAGE_TAG=rev1-admin-rust-api
BASE_WEB_TAG=rev1-admin-base-web
```

**Constraints**:
- MUST 含 7 個 env vars(`COMPOSE_PROJECT_NAME` + 3 個 POSTGRES + 1 個 REDIS + `APP_JWT_JWT_SECRET` + 2 個 IMAGE TAG)
- MUST 含 password URL encoding 警告註解(per R-006)
- MUST 含 `APP_JWT_JWT_SECRET` 替換指令註解(`openssl rand -hex 32`)

**Validation**:
- `.gitignore` MUST 含 `/.env`(per FR-015、`.env` 內為 secret)

---

## C-C2: `services:` 段結構

**Frozen by W-F3**:

`services:` 段 MUST 含 5 個 service、**MUST NOT** 含其他 service:
- `postgres` — DB
- `redis` — cache + pub-sub
- `migration` — one-shot init container
- `rust-api` — main backend
- `base-web` — SPA static serve

**Forbidden services**(per FR-022 ~ FR-027):
- ❌ `front-nginx`(W-F5)
- ❌ `nestjs`(W-FA1、Track A)
- ❌ `cleanup-job`(W-F9)
- ❌ `outbox-worker`(W-F10)
- ❌ `backup`(W-F15)
- ❌ `acme`(W-F6)
- ❌ `promtail` / `loki` / `prometheus` / `grafana` / `*_exporter`(W-F12-14)
- ❌ `pgbouncer`(rev1 不採用、per Constitution「資料庫:PostgreSQL 唯一持久狀態權威」)

---

## C-C3: `postgres` service structure(per FR-003 + FR-006)

```yaml
postgres:
  image: postgres:17.4
  environment:
    TZ: ${TZ:-Asia/Shanghai}
    POSTGRES_USER: ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: ${POSTGRES_DB}
  volumes:
    - postgres_data:/var/lib/postgresql/data
  networks:
    - internal
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
    interval: 10s
    timeout: 5s
    retries: 5
  restart: unless-stopped
```

**Constraints**:
- `image` MUST `postgres:17.4`(per Q1 / FR-003)
- volume mount MUST `/var/lib/postgresql/data`(per R-003 正解)
- healthcheck test MUST 用 `$$` escape `$$POSTGRES_USER` / `$$POSTGRES_DB`(per R-004)
- **MUST NOT** `ports:` 段(per FR-024 / Q3)

---

## C-C4: `redis` service structure(per FR-004 + FR-007)

```yaml
redis:
  image: redis/redis-stack:7.4.0-v3
  command: redis-server --requirepass $$REDIS_PASSWORD
  environment:
    TZ: ${TZ:-Asia/Shanghai}
    REDIS_PASSWORD: ${REDIS_PASSWORD}
  volumes:
    - redis_data:/data
  networks:
    - internal
  healthcheck:
    test: ["CMD-SHELL", "redis-cli -a $$REDIS_PASSWORD ping"]
    interval: 10s
    timeout: 5s
    retries: 5
  restart: unless-stopped
```

**Constraints**:
- `image` MUST `redis/redis-stack:7.4.0-v3`(per Q2 / FR-004)
- `command` MUST 含 `--requirepass $$REDIS_PASSWORD`(env-driven、不寫死)
- healthcheck 須帶 `-a $$REDIS_PASSWORD`(redis-cli auth)
- **MUST NOT** `ports:`

---

## C-C5: `migration` service structure(per FR-005 + FR-008)

```yaml
migration:
  image: rust-api:${IMAGE_TAG:-rev1-admin-rust-api}
  entrypoint: ["/usr/local/bin/migration"]
  command: ["up"]
  environment:
    # 用 APP_DATABASE_URL 而非 DATABASE_URL — rust-api 內 migration binary
    # 透過 EnvConfigLoader 讀 prefix `APP_`(per W-F1 acceptance T040 verified)
    APP_DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - internal
  restart: "no"
```

**Constraints**:
- `image` 引用 W-F1 image(per FR-005)
- `entrypoint` MUST override 為 migration binary(per FR-008 / R-002 sea-orm CLI `up` subcommand)
- `command` MUST `["up"]`(per R-002 verified)
- `depends_on.postgres.condition: service_healthy`(per FR-008 / R-007)
- `restart: "no"`(one-shot、per FR-018)
- **MUST NOT** `ports:`、**MUST NOT** healthcheck(one-shot 不需)
- `APP_DATABASE_URL` env(per analyze remediation I1 + W-F1 T040 verified、rust-api 內 migration binary 用 EnvConfigLoader prefix `APP_`、與 `rust-api` service 共用 prefix 命名一致);若 W-F8 補強為獨立 credential、改 secret 注入方式 + 可保留 env 命名(屬 W-F8 範疇)

---

## C-C6: `rust-api` service structure(per FR-005 + FR-009)

```yaml
rust-api:
  image: rust-api:${IMAGE_TAG:-rev1-admin-rust-api}
  environment:
    APP_JWT_JWT_SECRET: ${APP_JWT_JWT_SECRET:?APP_JWT_JWT_SECRET required in .env}
    APP_DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    APP_REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
  depends_on:
    migration:
      condition: service_completed_successfully
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  networks:
    - internal
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:11081/health"]
    interval: 30s
    timeout: 5s
    retries: 3
  restart: unless-stopped
```

**Constraints**:
- `image` 引用 W-F1 image(per FR-005)
- `environment` MUST 含 3 個 env(per FR-017):
  - `APP_JWT_JWT_SECRET=${APP_JWT_JWT_SECRET:?}` — 含 `:?` 引發 compose 在無 env 時 fail-fast(per Dimension D scenario 13)
  - `APP_DATABASE_URL` 構造 from interpolation
  - `APP_REDIS_URL` 構造 from interpolation
- `depends_on` MUST 3 個 conditions(per FR-009)
- healthcheck MUST `curl -f http://localhost:11081/health`(per FR-009、W-F1 contracts C-D7)
- **MUST NOT** `ports:`(per FR-024)
- TZ / LANG / RUST_ENV / APP_SERVER_PORT 由 W-F1 image 內建 ENV、compose 不重設(可選)

---

## C-C7: `base-web` service structure(per FR-005 + FR-010)

```yaml
base-web:
  image: base-web:${BASE_WEB_TAG:-rev1-admin-base-web}
  networks:
    - internal
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
    interval: 30s
    timeout: 5s
    retries: 3
  restart: unless-stopped
```

**Constraints**:
- `image` 引用 W-F2 image(per FR-005)
- **MUST NOT** `depends_on`(per FR-010 / R-011 base-web 無 backend dep)
- healthcheck MUST `curl -f http://localhost:8080/health`(per FR-010 / W-F2 contracts C-D7)
- **MUST NOT** `ports:`(per FR-024)
- **MUST NOT** environment 段(W-F2 image build-time 已注入 VITE_* / TZ)

---

## C-C8: `networks:` + `volumes:` top-level structure(per FR-011 ~ FR-014)

```yaml
networks:
  internal:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
```

**Constraints**:
- 1 個 network `internal`、driver `bridge`(per FR-011)
- 2 個 named volumes:`postgres_data` / `redis_data`(per FR-013)
- 全 5 service 都 attach `internal`(per FR-012)
- **MUST NOT** 含其他 6 個 volume(postgres_wal / loki_data / prometheus_data / grafana_data / acme_certs / backup_archive — 留 W-F12-14 + W-F15-16)
- **MUST NOT** 含 `observability` network(留 W-F12-14)

---

## C-C9: 不允許 pattern(W-F3 範疇邊界保護)

下列 pattern **MUST NOT** 出現:
- ❌ `version:` 段(per R-008 / modern compose convention)
- ❌ `ports:` 任何 service(per FR-024 / Q3)
- ❌ `secrets:` top-level 段(per FR-023、留 W-F4)
- ❌ `_FILE` env var pattern(per FR-023、留 W-F4)
- ❌ `profiles:` 任何 service(per FR-022 / FR-025、observability + Track A 全留後續)
- ❌ `build:` 任何 service(per FR-021、W-F1 / W-F2 已 build local image)
- ❌ `image: ${VAR}:latest`(per W-F1 / W-F2 contracts C-D5 forbidden patterns)
- ❌ `extends:` / `x-anchor:`(W-F3 簡單 YAML、不用 advanced features)
- ❌ override file(`docker-compose.override.yml` / `.dev.yml` / `.observability.yml` / `.prod.yml` — 全留後續 W-F feature)

---

## C-C10: Image attribute reference(W-F1 / W-F2 contracts inherit)

W-F3 引用以下 image 屬性(由 W-F1 / W-F2 contracts C-D7 保證):

| 屬性 | rust-api image | base-web image |
|---|---|---|
| ENTRYPOINT / CMD | `/usr/local/bin/server` / — | — / `nginx -g daemon off;` |
| EXPOSE | `11081` | `8080` |
| USER | `rust-api` (uid 10001) | `nginx` (uid 101) |
| /health endpoint | `200 + "ok"` | `200 + "ok"` |
| 額外 binary | `/usr/local/bin/migration` | — |
| F1.1 secret | required:`APP_JWT_JWT_SECRET` | — |

W-F3 不需重驗 image 屬性、引用即可(per W-F1 / W-F2 contracts 已 verified)。

---

## C-C11: 命令清單(operator 視角)

W-F3 image 提供下列穩定操作介面、後續 W-F feature 可依賴:

| 操作 | 命令 |
|---|---|
| 啟動 stack | `docker compose up -d` |
| 看狀態 | `docker compose ps` |
| 看 log | `docker compose logs [-f] [service]` |
| 進入 container | `docker compose exec <service> sh`(或 `/bin/bash`) |
| /health 健檢 | `docker compose exec rust-api curl -f http://localhost:11081/health` |
| 重啟 service | `docker compose restart <service>` |
| 停止 stack(保留 volume) | `docker compose down` |
| 停止 + 清 volume | `docker compose down -v` |
| 重 build image(屬 W-F1/W-F2 範疇) | `cd rust-api && docker build -t rust-api:rev1-admin-rust-api .`(對 base-web 類似) |

W-F4 ~ W-F18 spec 可引用上表作為 W-F3 提供的 operator 介面 contract。
