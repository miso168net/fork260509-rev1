# DESIGN-W-DEPLOYMENT：rev1 整合部署設計（統合 DESIGN-A 與 DESIGN-B）

> 日期：2026-05-14
> 範圍：rev1 docker-compose 部署形態之具體配置 — compose / nginx / Dockerfile / env / secret / port / DB migration / 背景工作 / TLS / observability / backup / CI/CD pipeline
> 資料來源：[`INTEGRATION-RESEARCH.md`](INTEGRATION-RESEARCH.md) + [`INTEGRATION-DESIGN-A-RUST-NESTJS.md`](INTEGRATION-DESIGN-A-RUST-NESTJS.md) + [`INTEGRATION-DESIGN-B-RUST-ONLY.md`](INTEGRATION-DESIGN-B-RUST-ONLY.md) + 源倉既有 Dockerfile / compose
> 性質：本檔為 **設計階段**，統合兩條軌道部署形態；具體 code / config 由 spec-kit `specify → plan → tasks → implement` 階段落地
> 結構策略：**Common 主體（兩 track 共用）+ Track DESIGN-A 差異區 / Track DESIGN-B 差異區**（每章節有實質差異時末附差異區）

---

## §1 部署原則

### §1.1 已固化決策（承 RESEARCH §8.1 與 DESIGN-A/B）

- **docker 容器內編譯**（非 host build artifact 再 COPY）— 各 service 用 multi-stage Dockerfile 在 build container 內跑 `pnpm build` / `cargo build`
- **docker-compose 運行**（單機部署形態；多機 / k8s 留 future）
- **rust 主後端 / nestjs 過渡補位（DESIGN-A）或退場（DESIGN-B）**
- **soft delete + 全域 audit log**（承 DESIGN-A §1.5）

### §1.2 環境分層

| 環境 | 用途 | TLS | Log/Metrics stack | Backup | Secret 注入 |
|---|---|---|---|---|---|
| **dev** | 本機開發 | 自簽 cert | compose default（json-file）| 跳過 | `_FILE` fallback to envvar（簡化）|
| **staging** | 整合測試 / pre-prod | 自簽 cert（或 Let's Encrypt staging endpoint） | promtail + Loki + grafana + prometheus | 啟用 pg_basebackup 但 retention 短 | Docker secrets |
| **prod** | 生產 | Let's Encrypt | 完整 stack | pg_basebackup + WAL archive (PITR) | Docker secrets |

compose 透過 **base + override** 模型實作環境差異：`docker-compose.yml`（base / 共用）+ `docker-compose.dev.yml` / `.staging.yml` / `.prod.yml`（override）。

### §1.3 Track DESIGN-A / Track DESIGN-B 差異最小化策略

- **共用 compose service 集合**（17 個，§3.1）— 兩 track 一致
- **Track DESIGN-A 多一個 nestjs service**（共 18 個，§3.4-A）
- **nginx config 用 template + env 驅動** — track 切換時改 routing template，不改 compose 結構
- **DESIGN-A → DESIGN-B 遷移路徑（承 DESIGN-A §6 F14）**：
  1. 刪除 nestjs service 條目（compose）
  2. nginx config 刪除 TRANSITIONAL marker block
  3. CI/CD pipeline 刪除 nestjs image build job
  4. 不需 DB migration、env / secret / observability / backup 全保持

### §1.4 決策 marker（D1-D7）對照表

本文後續章節以「承 D*」標記引用 brainstorming 階段的 7 個關鍵 trade-off 拍板。對照如下：

| D # | 主題 | 拍板選項 | 落地章節 |
|---|---|---|---|
| **D1** | DB migration trigger | Init container（rust-api 共 image、不同 entrypoint） | §7.1 |
| **D2** | Secret 注入機制 | Docker secrets + `_FILE` pattern（避 env 暴露） | §5.2 |
| **D3** | TLS cert 來源 | prod Let's Encrypt + acme.sh / dev / staging 自簽 | §4.5 |
| **D4** | CI/CD platform | DESIGN 層只寫 build → push → deploy → rollback 抽象階段、不綁 platform | §10 |
| **D5** | Log driver / 聚服務 | promtail → Loki + grafana | §8.1 |
| **D6** | Metrics stack | prometheus + grafana | §8.2 |
| **D7** | Postgres backup 策略 | pg_basebackup + WAL archive (PITR) | §9 |

### §1.5 範圍宣告

| 主題 | 進來 |
|---|---|
| Dockerfile（rust-api / base-web）| ✓ |
| Dockerfile（nestjs）| Track DESIGN-A only，引用源倉既有 |
| docker-compose 結構（services / networks / volumes / healthcheck）| ✓ |
| nginx 反向代理 + TLS 終止 | ✓ |
| Secret 注入機制 | ✓ |
| Port 規劃（承 CLAUDE.md §5.2）| ✓ |
| DB migration trigger | ✓ |
| 背景工作（cleanup-job / outbox-worker / backup-job）| ✓ |
| rust 水平擴展拓樸 | ✓ |
| Observability — log（promtail + Loki）+ metrics（prometheus + grafana）| ✓ |
| Backup & restore（pg_basebackup + WAL archive PITR）| ✓ |
| CI/CD pipeline（抽象階段、不綁 platform）| ✓ |
| k8s migration | ✗（future） |
| DR drill 細節 | ✗（future） |

---

## §2 容器映像（Dockerfile）

### §2.1 rust-api Dockerfile（multi-stage）

繼承 rust-api 源倉既有 `Dockerfile`、調整為多階段 build：

```dockerfile
# Stage 1: build
FROM rust:1.82-slim AS builder
WORKDIR /app
# 系統依賴（sea-orm-adapter、postgres client lib 等）
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
# 先 copy manifest 觸發 dependency cache
COPY Cargo.toml Cargo.lock ./
COPY server/ server/
COPY axum-casbin/ axum-casbin/
COPY sea-orm-adapter/ sea-orm-adapter/
COPY migration/ migration/
# build 主 binary 與 migration binary
RUN cargo build --release --bin server --bin migration

# Stage 2: runtime
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
RUN useradd -r -u 10001 -s /usr/sbin/nologin rust-api
WORKDIR /app
COPY --from=builder /app/target/release/server /usr/local/bin/server
COPY --from=builder /app/target/release/migration /usr/local/bin/migration
COPY server/resources/ /app/resources/
USER rust-api
EXPOSE 11081
ENTRYPOINT ["/usr/local/bin/server"]
```

**設計要點**：
- 兩 binary（`server` + `migration`）共享 build stage，避免重複編譯
- runtime 用 `debian:bookworm-slim`（既要 glibc 又要小），不用 `scratch`（避免 libssl dependency issue）
- non-root user `rust-api`（uid 10001）— 容器安全最佳實踐
- `migration` binary 在 §7 init container 中執行；`server` binary 在 rust-api service 中執行
- 同一 image 可作為多用途（rust-api service / migration init container / cleanup-job / outbox-worker），透過不同 entrypoint 區分

### §2.2 base-web Dockerfile（Vite build + nginx serve）

base-web 源倉**沒有既有 Dockerfile**（只有 `.env*` 系列），需新建：

```dockerfile
# Stage 1: build
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
COPY src/ src/
COPY public/ public/
COPY vite.config.ts tsconfig.json index.html ./
COPY .env.prod ./
RUN pnpm install --frozen-lockfile
ARG VITE_SERVICE_BASE_URL=/api
ARG VITE_SERVICE_SUCCESS_CODE=0
ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL
ENV VITE_SERVICE_SUCCESS_CODE=$VITE_SERVICE_SUCCESS_CODE
RUN pnpm build

# Stage 2: nginx serve static
FROM nginx:1.27-alpine AS runtime
RUN addgroup -g 10002 -S base-web && adduser -u 10002 -S base-web -G base-web
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/base-web-nginx.conf /etc/nginx/conf.d/default.conf
# nginx 預設 root user，但 master 不寫 disk 故可接受
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

`deploy/base-web-nginx.conf`（base-web 容器內 nginx，只負責 static serving）：
```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache assets
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**設計要點**：
- Build-time 注入 env（VITE_SERVICE_BASE_URL / VITE_SERVICE_SUCCESS_CODE）— Vite 把 env 編進 bundle
- 兩個 nginx：**base-web container 內**（serve static）+ **front-nginx container**（reverse proxy + TLS，§4）— 職責分離、base-web image 可獨立發版
- 圍欄 port `8080` 是 container 內、不對外（front-nginx upstream 連此）

### §2.3 nestjs Dockerfile（Track DESIGN-A only，引用既有）

DESIGN-A §1.2 紀律：**nestjs source 不改、只用既有 build artifact**。

引用 `fork260509-soybean-admin-nestjs/backend/Dockerfile`（既有 multi-stage 已實作 NestJS build）。DESIGN-W 不重寫，只在 CI/CD pipeline（§10）指定該 Dockerfile build target + 對應的 image tag。

```yaml
# 在 nestjs fork repo 的 CI workflow 內：
# - context: fork260509-soybean-admin-nestjs/
# - dockerfile: backend/Dockerfile
# - tags: ghcr.io/<org>/nestjs:<sha>
```

DESIGN-B 不需要此 image build job — 刪除即可。

### §2.4 Image 標籤與註冊機制

- **Registry**：不綁 platform（D4），抽象為 `<registry>/<org>/<service>:<tag>`；具體 registry 由 spec-kit feature 階段選（推薦 ghcr.io / DockerHub / self-hosted）
- **Tag 策略**：
  - 主 tag：`<service>:<short-git-sha>`（如 `rust-api:abc1234`）— 不可變、每次 build 對應一個 commit
  - 輔助 tag：`<service>:<branch>`（如 `rust-api:rev1-admin-rust-api`）— 移動標籤，指向該 branch 最新 build
  - prod 部署 tag：`<service>:prod-<date>`（如 `rust-api:prod-20260514`）— manual / pipeline 觸發標記
- **不使用 `:latest`**（避免 image 對應不明）
- **Image 來源**：
  - rust-api / base-web image：build from fork repo (rev1-admin-rust-api / rev1-admin-base-web branch)
  - nestjs image (DESIGN-A only)：build from fork260509-soybean-admin-nestjs main branch
  - 其他（postgres / redis / nginx / prometheus / grafana / loki / promtail / postgres_exporter / ...）：使用 official image，pin version

---

## §3 容器編排（docker-compose）

### §3.1 共用 service 集合（17 個，兩 track 共用）

| Service | Image | 用途 | 屬於 phase |
|---|---|---|---|
| `postgres` | postgres:16-alpine | 主資料庫 | 主要 |
| `redis` | redis:7-alpine | cache + Casbin policy pub-sub | 主要 |
| `migration` | `<registry>/rust-api:<sha>` | DB migration 一次性執行（§7）| 主要（init） |
| `rust-api` | `<registry>/rust-api:<sha>` | 主後端 | 主要 |
| `base-web` | `<registry>/base-web:<sha>` | Vue SPA static serve | 主要 |
| `front-nginx` | nginx:1.27-alpine | 反向代理 + TLS 終止 | 主要 |
| `cleanup-job` | `<registry>/rust-api:<sha>` | 軟刪資料定期物理清理（§7.4）| 主要（cron）|
| `outbox-worker` | `<registry>/rust-api:<sha>` | Outbox event publisher（§7.4）| 主要 |
| `backup` | postgres:16-alpine + custom script | pg_basebackup + WAL archive（§9）| 主要（cron）|
| `acme` | neilpang/acme.sh | TLS cert auto-renew（prod only） | 主要（prod profile） |
| `promtail` | grafana/promtail:latest | Log 收集（§8.1） | observability |
| `loki` | grafana/loki:latest | Log 聚合儲存 | observability |
| `prometheus` | prom/prometheus:latest | Metrics scrape + store | observability |
| `grafana` | grafana/grafana:latest | Dashboard（log + metrics）| observability |
| `postgres_exporter` | prometheuscommunity/postgres-exporter | Postgres metrics | observability |
| `redis_exporter` | oliver006/redis_exporter | Redis metrics | observability |
| `nginx-exporter` | nginx/nginx-prometheus-exporter | Nginx metrics | observability |

**Compose 結構**：
- `docker-compose.yml` — 主要 services（前 9 個）
- `docker-compose.observability.yml` — observability stack（後 7 個）
- `docker-compose.prod.yml` — acme + 其他 prod 專屬 override
- `docker-compose.dev.yml` — 簡化 dev 配置（無 acme、可跳過 observability）

使用 compose `profiles` 機制控制：
```yaml
services:
  prometheus:
    profiles: ["observability", "prod"]
  acme:
    profiles: ["prod"]
```

啟動：`docker compose --profile prod --profile observability up -d`

### §3.2 Networks / Volumes

```yaml
networks:
  internal:        # 內部服務通信
    driver: bridge
  observability:   # observability 隔離（可選）
    driver: bridge

volumes:
  postgres_data:   # postgres data dir
  postgres_wal:    # WAL archive
  redis_data:      # redis AOF / RDB
  loki_data:       # Loki log store
  prometheus_data: # Prometheus tsdb
  grafana_data:    # Grafana config + dashboard
  acme_certs:      # TLS cert
  backup_archive:  # pg_basebackup output (§9)
```

**設計要點**：
- 內部 service 走 `internal` network、不暴露 host port（除 `front-nginx`）
- volumes 全部 named（不用 bind mount，避免 host path 耦合）
- backup script 從 postgres volume snapshot（spec-kit feature 落地細節）

### §3.3 Depends_on + Healthcheck

```yaml
services:
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  migration:
    depends_on:
      postgres:
        condition: service_healthy
    # migration run-once、結束後不重啟
    restart: "no"

  rust-api:
    depends_on:
      migration:
        condition: service_completed_successfully  # 等 migration 跑完
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11081/health"]
      interval: 30s
      retries: 3
    restart: unless-stopped
```

**設計要點**：
- `service_completed_successfully` 對 migration 是關鍵 — rust-api 等 migration 跑完才啟動
- 每個 service 有 healthcheck，front-nginx 才能判斷上游可用性
- `restart: unless-stopped` 對 long-running service；`restart: "no"` 對 one-shot job

### §3.4-A Track DESIGN-A 差異（多一個 nestjs service）

```yaml
services:
  nestjs:
    image: <registry>/nestjs:<sha>
    profiles: ["track-a"]
    environment:
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - DATABASE_URL_FILE=/run/secrets/nestjs_db_url
      - REDIS_URL=redis://redis:6379
      - CASBIN_PUBSUB_CHANNEL=casbin:policy:invalidate
    secrets:
      - jwt_secret
      - nestjs_db_url
    depends_on:
      migration:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    ports:                              # dev 直連 nestjs 用，prod 透過 front-nginx 不暴露
      - "${NESTJS_DEV_PORT:-13003}:3000"  # 對外 port 對齊 §6.1
    networks:
      - internal
    restart: unless-stopped
```

**啟動範例**（profile 機制下，**必須**明示帶 `track-a` 才會啟 nestjs）：
- Track DESIGN-A prod：`docker compose --profile track-a --profile prod up -d` ⚠️ **prod 部署若漏 `--profile track-a` → nestjs 不啟動 → `/api/auth/refreshToken` 失效**
- Track DESIGN-A dev：`docker compose --profile track-a up -d`（dev 場景需明示，default profile 不含 track-a）
- Track DESIGN-B prod：`docker compose --profile prod up -d`（不帶 track-a）
- Track DESIGN-B dev：`docker compose up -d`

DESIGN-A → DESIGN-B 遷移：移除 nestjs service 條目即可、其他 service 不變。

### §3.4-B Track DESIGN-B 差異

無差異 — DESIGN-B 即不啟用 `track-a` profile，nestjs service 自動不部署。其他 17 個 service 完全一致。

---

## §4 反向代理 + TLS

### §4.1 front-nginx 角色

- **TLS 終止**（443 → 內部 HTTP）
- **Static 服務**：`/` → base-web upstream（透過 internal network）
- **反向代理**：`/api/*` → rust-api upstream（DESIGN-B）或 rust-api + nestjs（DESIGN-A）
- **Header 處理**：X-Forwarded-For、X-Request-ID 傳遞給 rust（rust 取 client_ip 寫 audit log）
- **Rate limiting**（可選、spec-kit 拍板細節）

### §4.2 nginx config 結構

```nginx
# /etc/nginx/conf.d/default.conf

upstream base_web {
    server base-web:8080;
}

upstream rust_api {
    server rust-api:11081;
    # 水平擴展時加 server rust-api-2:11081; ...（§6.2）
    keepalive 32;
}

# Track DESIGN-A 額外 upstream（§4.3）

server {
    listen 80;
    server_name _;
    # HTTP → HTTPS redirect（prod）
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Static SPA
    location / {
        proxy_pass http://base_web;
        proxy_set_header Host $host;
    }

    # Track-specific routing（§4.3 / §4.4）
    # ⚠️ track-*.inc 內 location **必須**使用 `location = <exact-path>` exact match
    # 否則會被下方預設 `location /api/`（prefix match）攔截
    include /etc/nginx/conf.d/track-*.inc;

    # 預設 /api/* → rust-api（DESIGN-B 用此 / DESIGN-A 在此之上加 TRANSITIONAL block）
    location /api/ {
        proxy_pass http://rust_api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_read_timeout 60s;
    }
}
```

### §4.3 Track DESIGN-A 差異（額外 upstream + TRANSITIONAL block）

承 DESIGN-A §2.2：所有 nestjs-bound location 包在 `# >>>>> TRANSITIONAL BEGIN <<<<<` marker block 內。

```nginx
# /etc/nginx/conf.d/track-a.inc

# ============================================================
# >>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點 <<<<<
# 以下整段（含 upstream）在 nestjs 退場時刪除
# ============================================================
upstream nestjs_transitional {
    server nestjs:3000;
    keepalive 16;
}

location = /api/auth/refreshToken {
    # Transitional: 過渡期由 nestjs 補位
    proxy_pass http://nestjs_transitional/auth/refreshToken;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
}

# ============================================================
# <<<<< TRANSITIONAL END >>>>>
# ============================================================
```

Track DESIGN-A profile 才包含 `track-a.inc`；track-b 不包此檔。可在 nginx Dockerfile 或 compose entrypoint 用 envsubst 動態決定。

### §4.4 Track DESIGN-B 差異

無額外 upstream、無 TRANSITIONAL block。`/api/*` 全部由預設 location 轉發到 rust-api upstream。`track-b.inc` 為空檔（或不存在）。

### §4.5 TLS cert 來源（承 D3）

#### Prod：Let's Encrypt + acme.sh

```yaml
# docker-compose.prod.yml override
services:
  acme:
    image: neilpang/acme.sh
    profiles: ["prod"]
    command: daemon
    volumes:
      - acme_certs:/acme.sh
      - ./deploy/acme-config:/config:ro
    environment:
      - ACME_EMAIL_FILE=/run/secrets/acme_email
    secrets:
      - acme_email
    restart: unless-stopped

  front-nginx:
    volumes:
      - acme_certs:/etc/nginx/certs:ro
```

- acme.sh daemon 模式自動 renew（每日檢查、到期前 30 天 renew）
- HTTP-01 challenge：acme.sh 與 front-nginx 共享 `.well-known/acme-challenge/` volume
- DNS-01 challenge（推薦）：透過 DNS provider API（spec-kit feature 階段拍板 DNS provider）

#### Dev / staging：自簽

提供 `deploy/generate-dev-cert.sh` 腳本：
```bash
#!/bin/sh
# 生成自簽 cert 給 dev/staging
mkdir -p deploy/dev-certs
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout deploy/dev-certs/privkey.pem \
  -out deploy/dev-certs/fullchain.pem \
  -days 365 -subj "/CN=localhost"
echo "Dev cert generated. Trust deploy/dev-certs/fullchain.pem in your browser/system."
```

dev compose override 把 `deploy/dev-certs/` mount 到 front-nginx 內 `/etc/nginx/certs`，nginx config 使用同樣 path、無 conditional logic。

---

## §5 配置與環境變數

### §5.1 Env 分層

| 層 | 來源 | 用途 | 範例 |
|---|---|---|---|
| **compose env** | `.env` file（compose 載入）| compose-time 變數，影響 service 啟動配置 | `COMPOSE_PROJECT_NAME=rev1-admin` |
| **service env** | compose `environment:` directive | container runtime env | `RUST_LOG=info`、`DATABASE_URL_FILE=...` |
| **app config** | rust `application.yaml` / nestjs config | 應用層詳細參數 | `server.port: 11081`、`jwt.access_token_ttl: 900` |
| **base-web build env** | Dockerfile ARG/ENV（build-time）| 編進 Vue bundle | `VITE_SERVICE_BASE_URL=/api`、`VITE_SERVICE_SUCCESS_CODE=0` |

### §5.2 Secret 注入（承 D2 — Docker secrets + `_FILE` pattern）

```yaml
# docker-compose.yml
secrets:
  jwt_secret:
    file: ./deploy/secrets/jwt_secret.txt
  postgres_password:
    file: ./deploy/secrets/postgres_password.txt
  redis_password:
    file: ./deploy/secrets/redis_password.txt
  acme_email:
    file: ./deploy/secrets/acme_email.txt
  # ... 其他 secrets

services:
  rust-api:
    environment:
      # _FILE pattern：應用程式從 file 讀 secret
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - DATABASE_PASSWORD_FILE=/run/secrets/postgres_password
      - REDIS_PASSWORD_FILE=/run/secrets/redis_password
    secrets:
      - jwt_secret
      - postgres_password
      - redis_password
```

**應用程式守則**：
- rust：補 `read_secret_from_file_or_env(name) -> String` helper，優先讀 `_FILE` 指向的 path、fallback 到 envvar
- nestjs：同樣 config loader 支持兩種讀法
- **dev 簡化**：dev 允許 `JWT_SECRET=...` 直接 envvar（不設 `_FILE`），讓 setup 簡單

### §5.3 共用 env 清單（兩 track）

| Env | 來源 | 用途 |
|---|---|---|
| `POSTGRES_USER` | compose env | postgres 主帳號 |
| `POSTGRES_PASSWORD_FILE` | secret | postgres 主密碼 |
| `POSTGRES_DB` | compose env | DB 名 |
| `DATABASE_URL_FILE` | secret | rust + (nestjs if A) 連 DB |
| `REDIS_PASSWORD_FILE` | secret | redis 密碼 |
| `REDIS_URL` | compose env | redis 連線 URL（`redis://:<from-file>@redis:6379`）|
| `JWT_SECRET_FILE` | secret | JWT 簽章 secret |
| `JWT_ALGORITHM` | compose env | HS256 / RS256（spec-kit 拍板）|
| `JWT_ACCESS_TOKEN_TTL_SECS` | compose env | access token 有效期 |
| `JWT_REFRESH_TOKEN_TTL_SECS` | compose env | refresh token 有效期 |
| `CASBIN_PUBSUB_CHANNEL` | compose env | redis channel 名（兩 track 一致）|
| `RUST_LOG` | compose env | rust log level |
| `RUST_API_PORT` | compose env | 11081（承 CLAUDE.md §5.2）|
| `BASE_WEB_PORT` | compose env | 8080（container 內）|
| `FRONT_NGINX_HTTPS_PORT` | compose env | 11443 對外（或 443，看 §6） |
| `OUTBOX_POLL_INTERVAL_SECS` | compose env | outbox worker 輪詢間隔 |
| `CLEANUP_JOB_THRESHOLD_DAYS` | compose env | 軟刪 N 天後物理刪除 |

### §5.4 Track DESIGN-A 額外 env

| Env | 來源 | 用途 |
|---|---|---|
| `NESTJS_DB_URL_FILE` | secret | nestjs 連 DB（可與 rust 共用 secret 或獨立）|
| `NESTJS_JWT_SECRET_FILE` | secret | **必須**與 rust 同 secret（承 DESIGN-A §3.3 JWT 共識）|
| `NESTJS_PORT` | compose env | 3000（container 內）|

Track DESIGN-B 無需上述 env。

---

## §6 Port 規劃 + rust 水平擴展拓樸

### §6.1 對外 / 容器內 Port 規劃（承 CLAUDE.md §5.2）

| 角色 | 對外（host）| 容器內 | 備註 |
|---|---|---|---|
| Web（HTTPS）| `:11443` | front-nginx:443 | 對外唯一入口 |
| Web（HTTP → HTTPS redirect）| `:11080` | front-nginx:80 | 自動 redirect |
| rust-api（dev 直連）| `:11081` | rust-api:11081 | dev 期間 host port forward，prod 不暴露 |
| Postgres（host 暴露）| `:15432` | postgres:5432 | dev / debug；prod 建議不暴露 |
| Redis（host 暴露）| `:16379` | redis:6379 | 同上 |
| Grafana | `:13000` | grafana:3000 | observability dashboard |
| Prometheus | `:19090` | prometheus:9090 | 直接查 metrics（debug）|
| nestjs（Track DESIGN-A，dev 直連）| `:13003` | nestjs:3000 | dev 期間 |

對外 port 用 `1XXXX` 前綴避開 fork260509 既有 port，方便兩 workspace 並存。

### §6.2 rust 水平擴展拓樸

#### Single instance（v1 default）

```
front-nginx → rust-api（1 instance）
              │
              └─ redis pub-sub: self-publish + self-subscribe（無實際 cross-instance 效果）
```

#### Multi instance（DESIGN-B v1 即支援）

```
front-nginx
  ├─ rust-api-1（同 image / 同 env / 同 secret）
  ├─ rust-api-2
  └─ rust-api-N
       │
       └─ redis pub-sub: 每 instance 都 publish + subscribe → Casbin policy 跨 instance 同步
```

compose 配置：
```yaml
services:
  rust-api:
    deploy:
      replicas: 2  # 或從 env 控制
    # ... 其他配置同 single instance
```

front-nginx upstream 自動發現（compose 內部 DNS round-robin）：
```nginx
upstream rust_api {
    server rust-api:11081;
    keepalive 32;
}
# compose 內部 DNS rust-api 自動解析到所有 replicas
```

**水平擴展先決條件**（DESIGN-B §3.2 已建立）：
- Casbin policy redis pub-sub channel 已就位（每 instance 都 subscribe）
- JWT secret 共享（已透過 docker secrets 注入相同檔）
- Stateless rust handler — 不在進程內存 session（session 透過 JWT + sys_tokens 表）
- DB connection pool 每 instance 獨立

### §6.3 開發 vs 生產差異

| 維度 | dev | prod |
|---|---|---|
| Host port 暴露 | rust-api / postgres / redis 都暴露（方便 debug）| 只暴露 front-nginx（11080 / 11443）|
| TLS | 自簽 cert | Let's Encrypt |
| Observability stack | 可選（profile）| 必啟 |
| Backup | 可跳過 | 必啟 |
| Replicas | 1 | 1+（依負載）|

---

## §7 DB Migration + 背景工作

### §7.1 DB Migration（承 D1 — Init container）

```yaml
services:
  migration:
    image: <registry>/rust-api:<sha>
    entrypoint: ["/usr/local/bin/migration"]
    command: ["up"]  # 跑所有未執行的 migration
    environment:
      - DATABASE_URL_FILE=/run/secrets/migration_db_url
    secrets:
      - migration_db_url
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"  # 一次性執行
    networks:
      - internal
```

**設計要點**：
- 與 `rust-api` 共用同一 image（同 build artifact），entrypoint 換成 `migration` binary
- 用**獨立 secret** `migration_db_url`（write schema 權限），與 rust-api runtime 的 `database_url`（data-only 權限）區隔 — 落實安全分離
- `restart: "no"` 確保不會在 service 啟動後 loop 重跑
- rust-api 透過 `service_completed_successfully` 條件等 migration 跑完（§3.3）

### §7.2 Track DESIGN-A migration 對齊

DESIGN-A §3.3 紀律：rust 主導 migration、nestjs 既有 prisma migration 對齊到此 schema。

**實作策略**：
- rust migration 在 init container 跑時建立**全部 schema**（含 nestjs 用到的表如 sys_tokens 額外欄位）
- nestjs container 啟動時**不跑** prisma migrate（envvar `PRISMA_SKIP_MIGRATE=true` 或類似）
- nestjs 只用 prisma client 讀寫對齊好的 schema

DESIGN-B 不需此對齊（無 nestjs）。

### §7.3 Cleanup-job（cron）

```yaml
services:
  cleanup-job:
    image: <registry>/rust-api:<sha>
    entrypoint: ["/usr/local/bin/server"]
    command: ["cleanup-job", "--threshold-days", "${CLEANUP_JOB_THRESHOLD_DAYS:-90}"]
    environment:
      - DATABASE_URL_FILE=/run/secrets/cleanup_job_db_url  # 獨立最小權限 credential
      - RUST_LOG=info
    secrets:
      - cleanup_job_db_url
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"  # 由外部 cron / scheduler 觸發
    profiles: ["cleanup"]
```

**觸發機制**：
- compose 不內建 cron — 用外部 host cron 觸發 `docker compose --profile cleanup run --rm cleanup-job`
- 或用 sidecar：另一個 service（`cron-scheduler`）執行 cron loop + `docker compose run` 命令（k8s migration 時改用 CronJob）
- DESIGN-W v1 推薦 host cron + 文件提供 crontab 範例（每日 03:00 跑）

**權限分離**（承 DESIGN-A §5.2.3）：
- `cleanup_job_db_url` credential 只有：DELETE entity 表 + INSERT sys_operation_log 權限
- 不允許 SELECT / UPDATE 其他資料、不允許 schema 變更

**Dry-run 模式**：
```bash
docker compose --profile cleanup run --rm cleanup-job cleanup-job --threshold-days 90 --dry-run
```
列印「將刪 N row from <table>」，不實際刪除。

### §7.4 Outbox-worker（承 DESIGN-A §5.2.1）

```yaml
services:
  outbox-worker:
    image: <registry>/rust-api:<sha>
    entrypoint: ["/usr/local/bin/server"]
    command: ["outbox-worker"]
    environment:
      - DATABASE_URL_FILE=/run/secrets/outbox_db_url
      - REDIS_URL=redis://redis:6379
      - OUTBOX_POLL_INTERVAL_SECS=${OUTBOX_POLL_INTERVAL_SECS:-5}
    secrets:
      - outbox_db_url
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
```

**用途**：
- 讀 `sys_outbox` 表（spec-kit `audit-log-infrastructure` feature 建立）
- 對每個 pending event 重試 publish 到 redis pub-sub channel（`casbin:policy:invalidate` 或其他）
- 確保 DB commit → redis publish 最終一致（承 DESIGN-A §5.2.1）

**設計要點**：
- 與 rust-api 共用同 image，不同 entrypoint
- single instance 即可（outbox processing 不需平行 — 用 SELECT FOR UPDATE SKIP LOCKED 模式可平行但 v1 不必要）
- Idempotent：重複 publish 相同 invalidate event 對 subscriber 是無 harm

### §7.5 Backup-job（cron，§9 詳述）

```yaml
services:
  backup:
    image: postgres:16-alpine
    command: ["/scripts/pg-backup.sh"]
    environment:
      - PGUSER_FILE=/run/secrets/backup_pg_user
      - PGPASSWORD_FILE=/run/secrets/backup_pg_password
      - PGHOST=postgres
      - WAL_ARCHIVE_DIR=/wal
    secrets:
      - backup_pg_user
      - backup_pg_password
    volumes:
      - postgres_wal:/wal
      - backup_archive:/backup
      - ./deploy/backup-scripts:/scripts:ro
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"
    profiles: ["backup"]
```

詳見 §9。

---

## §8 Observability

### §8.1 Log 聚服務（承 D5 — promtail → Loki + grafana）

```yaml
services:
  loki:
    image: grafana/loki:latest
    volumes:
      - loki_data:/loki
      - ./deploy/loki-config.yml:/etc/loki/local-config.yaml:ro
    command: -config.file=/etc/loki/local-config.yaml
    profiles: ["observability"]
    networks:
      - internal
      - observability

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./deploy/promtail-config.yml:/etc/promtail/config.yml:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki
    profiles: ["observability"]
    networks:
      - internal
      - observability
```

**結構化 log 規格**（rust + nestjs + nginx 共識）：
- **格式**：JSON，每行一個 event
- **必要欄位**：`timestamp` (ISO8601)、`level` (INFO/WARN/ERROR/...)、`service` (rust-api / nestjs / nginx)、`request_id` (從 X-Request-ID header)、`msg`
- **可選欄位**：`actor_user_id`（已認證 user）、`route`、`http_status`、`latency_ms`、`error_kind`

rust 用 `tracing` + `tracing-subscriber` 的 `fmt::json()` formatter。
nestjs 用 `winston` JSON 格式。
nginx 用 `log_format` 自訂 JSON。

### §8.2 Metrics（承 D6 — prometheus + grafana）

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - prometheus_data:/prometheus
      - ./deploy/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
    profiles: ["observability"]
    networks:
      - internal
      - observability

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
      - ./deploy/grafana-provisioning:/etc/grafana/provisioning:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD_FILE=/run/secrets/grafana_admin_password
    secrets:
      - grafana_admin_password
    depends_on:
      - loki
      - prometheus
    profiles: ["observability"]
    networks:
      - internal
      - observability

  postgres_exporter:
    image: prometheuscommunity/postgres-exporter:latest
    environment:
      - DATA_SOURCE_NAME_FILE=/run/secrets/postgres_exporter_dsn
    secrets:
      - postgres_exporter_dsn
    profiles: ["observability"]

  redis_exporter:
    image: oliver006/redis_exporter:latest
    environment:
      - REDIS_ADDR=redis://redis:6379
      - REDIS_PASSWORD_FILE=/run/secrets/redis_password
    secrets:
      - redis_password
    profiles: ["observability"]

  nginx-exporter:
    image: nginx/nginx-prometheus-exporter:latest
    command: ["-nginx.scrape-uri=http://front-nginx:8081/stub_status"]
    profiles: ["observability"]
```

**rust metrics**：用 `metrics` crate + `metrics-exporter-prometheus`，expose `/metrics` endpoint（內部 port）。
**nestjs metrics**（Track DESIGN-A）：用 `@willsoto/nestjs-prometheus`。
**Prometheus scrape targets**：rust-api / nestjs / postgres_exporter / redis_exporter / nginx-exporter / promtail / loki / prometheus 自身。

### §8.3 業務 metrics 規格

- `http_request_duration_seconds` (histogram, labels: service / route / status)
- `audit_log_writes_total` (counter, labels: operation / entity_type)
- `casbin_enforcement_total` (counter, labels: result=allow|deny)
- `casbin_policy_cache_invalidate_total` (counter — pub-sub 觸發次數)
- `outbox_pending_events` (gauge — outbox queue depth)
- `sys_tokens_active` (gauge — 當前有效 token 數)
- `cleanup_job_rows_deleted_total` (counter)
- `backup_completed_total` (counter, labels: type=base|wal)

具體欄位定義在 spec-kit `audit-log-infrastructure` / `observability` feature 拍板。

---

## §9 Backup & Restore（承 D7 — pg_basebackup + WAL archive PITR）

### §9.1 Backup 流程

```
┌──────────────────────────────────────────────┐
│ Postgres                                     │
│   wal_level = replica                        │
│   archive_mode = on                          │
│   archive_command = 'cp %p /wal/%f'          │
└──────────────┬───────────────────────────────┘
               │ (WAL segments)
       ┌───────▼────────┐
       │ /wal/ volume   │ continuous WAL archive
       └───────┬────────┘
               │
       ┌───────▼─────────────────────┐
       │ backup container (週期)     │
       │ 1. pg_basebackup → /backup/ │ 每週 full base
       │ 2. WAL retention 清理        │ 保留 N 天 WAL
       └─────────────────────────────┘
```

**postgres 配置**（`postgresql.conf` override via env）：
```yaml
services:
  postgres:
    command: |
      postgres
      -c wal_level=replica
      -c archive_mode=on
      -c archive_command='test ! -f /wal/%f && cp %p /wal/%f'
      -c max_wal_senders=3
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - postgres_wal:/wal
```

**backup-job 觸發**：host cron 每週日 03:00 跑 `docker compose --profile backup run --rm backup`

**backup-job 內 script**（`deploy/backup-scripts/pg-backup.sh`）：
```bash
#!/bin/sh
set -e
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/backup/base-$TIMESTAMP

# 讀 _FILE secret
PGUSER=$(cat $PGUSER_FILE)
export PGPASSWORD=$(cat $PGPASSWORD_FILE)

# 跑 pg_basebackup
pg_basebackup -h $PGHOST -U $PGUSER -D $BACKUP_DIR -Ft -z -P -X stream

# 清舊 backup（保留最近 N 個 full base）
ls -1dt /backup/base-* | tail -n +5 | xargs rm -rf

# 清舊 WAL（保留最近 30 天）
find /wal -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR"
```

### §9.2 Restore 流程（PITR）

文件提供 restore runbook：
1. 停止 postgres container
2. 清空 `postgres_data` volume
3. 解壓 chosen `/backup/base-*` 到 `postgres_data`
4. 配置 `recovery.conf`（postgres 12+ 是 `postgresql.auto.conf` 加 `recovery_target_time`）
5. 啟動 postgres、自動 replay WAL 到目標時點
6. 驗證資料完整性
7. 重啟 rust-api / nestjs（cache invalidate）

具體 script 與 runbook 在 spec-kit `backup-and-restore` feature 階段落地。

### §9.3 Audit log 表 archive policy

- `sys_operation_log` 永久保留（DESIGN-A §1.5）
- 但對效能：表 partition by month；老 partition 移到 archive table 或 cold storage（spec-kit 細節）
- audit retention 從 backup 角度 ≠ 從 application 角度
  - DB 層保留近 1 年 partition active
  - 1 年以上 partition export 到 backup 系統（pg_basebackup 同樣涵蓋）

### §9.4 DR 演練

每季跑一次：
- 從最新 backup + WAL 恢復到 staging 環境
- 跑 smoke test 確認資料完整、應用程式可用
- 紀錄 RTO（recovery time objective）與 RPO（recovery point objective）

具體 runbook 留 spec-kit `disaster-recovery-drill` feature。

---

## §10 CI/CD Pipeline（抽象階段，不綁 platform — 承 D4）

### §10.1 Pipeline 抽象結構

```
┌─ Source repo (per service) ──────────────────────────────┐
│ Trigger: push to branch (rev1-admin-base-web /          │
│          rev1-admin-rust-api / nestjs main)             │
│                                                          │
│ Build stage:                                             │
│   1. Checkout source                                     │
│   2. Run unit tests (cargo test / vitest / jest)         │
│   3. Run linter (cargo clippy / eslint)                  │
│   4. Build docker image                                  │
│      - rust-api: multi-stage Dockerfile (§2.1)           │
│      - base-web: multi-stage Dockerfile (§2.2)           │
│      - nestjs (DESIGN-A only): 既有 Dockerfile (§2.3)    │
│   5. Tag image: <service>:<short-sha> + <service>:<branch>│
│   6. Push to registry                                    │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ (image SHA pinned)
                       │
┌─ Outer repo (rev1-admin-root) ──────────────────────────┐
│ Trigger: submodule bump commit                          │
│                                                         │
│ Deploy stage:                                           │
│   1. Read submodule SHA pin                             │
│   2. Resolve image tags (rust-api:<sha>, base-web:<sha>)│
│   3. Pull images on target host                         │
│   4. docker compose up -d --no-deps --pull always       │
│   5. Wait for healthcheck pass                          │
│   6. Run smoke test (curl /api/health, /api/auth/login) │
│   7. On failure: rollback to previous SHA               │
└─────────────────────────────────────────────────────────┘
```

### §10.2 Image tagging convention

承 §2.4：
- 主 tag：`<service>:<short-git-sha>`（不可變、CI build 觸發）
- 輔助 tag：`<service>:<branch-name>`（CI 同時更新，指向 branch latest）
- prod tag：`<service>:prod-<date>`（manual / deploy pipeline 觸發）

### §10.3 Rollback 機制

- 每次 deploy 紀錄 `deploy/current-images.yaml`（service → image SHA mapping）
- Rollback：reverse 到上一個版本的 mapping，`docker compose up -d` 拉回
- 自動 rollback 觸發條件（spec-kit feature 拍板）：smoke test fail、healthcheck 連續 N 次 fail

### §10.4 Track DESIGN-A 差異

額外的 nestjs image build job（從 nestjs fork repo trigger）。其他 pipeline 結構不變。

DESIGN-A → DESIGN-B 遷移時刪除 nestjs build job。

### §10.5 Track DESIGN-B 差異

無 nestjs build job。其他 pipeline 與 Track DESIGN-A 相同。

### §10.6 Pre-commit hooks（CI 之外）

雖非 CI/CD 範疇但相關：
- rust：`cargo fmt --check` + `cargo clippy -- -D warnings`
- TS：`pnpm typecheck` + `eslint`
- Commit message：[Conventional Commits](https://www.conventionalcommits.org/)（承 CLAUDE.md §6.3）

由各 fork repo 的 `.pre-commit-config.yaml` 或 husky 配置（spec-kit feature 階段落地）。

---

## §11 spec-kit deploy feature 切分建議

### §11.1 Feature 清單

延續 DESIGN-A §6 / DESIGN-B §6 的 feature 編號（W-prefix 用於部署相關 feature）：

| # | Feature | 範疇 | 依賴 | Track |
|---|---|---|---|---|
| **Phase W-1：基礎容器化（P1）** ||||
| W-F1 | `dockerfile-rust-api` | rust-api multi-stage Dockerfile（含 migration binary）；non-root user；image tagging convention | — | 共用 |
| W-F2 | `dockerfile-base-web` | base-web Vite build + nginx serve Dockerfile；build-time env injection（VITE_*）| — | 共用 |
| W-F3 | `compose-base-structure` | docker-compose.yml 主結構（postgres / redis / rust-api / base-web / front-nginx / migration）；networks / volumes / healthcheck / depends_on | W-F1, W-F2 | 共用 |
| W-F4 | `secret-injection` | Docker secrets + `_FILE` pattern；rust/nestjs read helper；deploy/secrets/ 目錄結構 + .gitignore | W-F3 | 共用 |
| **Phase W-2：對外服務（P2）** ||||
| W-F5 | `front-nginx-reverse-proxy` | nginx config 主結構（upstream / location / headers）；track-specific include 機制 | W-F3 | 共用 + Track 差異區 |
| W-F6 | `tls-cert-management` | dev/staging 自簽腳本 + prod Let's Encrypt acme.sh container；cert volume + nginx 對接 | W-F5 | 共用 |
| W-F7 | `port-mapping` | 對外 port（11080/11443）+ 容器內 port；CLAUDE.md §5.2 配置落地 | W-F3 | 共用 |
| **Phase W-3：背景工作（P3）** ||||
| W-F8 | `db-migration-init-container` | migration service（init container）+ healthcheck depends_on；獨立 migration credential | W-F1, W-F3, W-F4 | 共用 + Track DESIGN-A 對齊 |
| W-F9 | `cleanup-job-deployment` | cleanup-job service + host cron + 獨立最小權限 credential + dry-run mode | W-F1, W-F3, W-F4 | 共用 |
| W-F10 | `outbox-worker-deployment` | outbox-worker service + redis 連線 + retry logic | W-F1, W-F3, W-F4 | 共用 |
| **Phase W-4：水平擴展支援（P4）** ||||
| W-F11 | `rust-horizontal-scaling` | rust-api replicas + front-nginx upstream auto-discovery；JWT secret 共享驗證；Casbin pub-sub coherence 測試 | W-F5, DESIGN-B F5 | 共用 |
| **Phase W-5：Observability（P5）** ||||
| W-F12 | `log-aggregation-loki` | promtail + Loki + grafana 部署；rust/nestjs/nginx 結構化 log 格式對齊 | W-F3 | 共用 |
| W-F13 | `metrics-prometheus` | prometheus + exporters（postgres / redis / nginx）+ rust/nestjs `/metrics` endpoint + grafana data source | W-F3 | 共用 |
| W-F14 | `grafana-dashboards` | 業務 metrics dashboard（涵蓋 DESIGN-A §5.2.1 audit log / §5.2.2 soft delete / §5.2.3 cleanup 的 metric 維度 + Casbin enforce）| W-F12, W-F13 | 共用 |
| **Phase W-6：Backup & DR（P6）** ||||
| W-F15 | `pg-backup-pitr` | postgres WAL archive 配置 + backup-job container + retention 策略 | W-F3 | 共用 |
| W-F16 | `disaster-recovery-runbook` | restore script + DR 演練 runbook + RTO/RPO 紀錄 | W-F15 | 共用 |
| **Phase W-7：CI/CD（P7）** ||||
| W-F17 | `cicd-build-pipeline` | 抽象 build pipeline（per service）；image tagging + push to registry；platform 由 spec-kit feature 階段拍板 | W-F1, W-F2 | 共用 + Track DESIGN-A 多 nestjs job |
| W-F18 | `cicd-deploy-pipeline` | 抽象 deploy pipeline（outer repo trigger → pull image → compose up → smoke test → rollback）| W-F17 | 共用 |
| **Track DESIGN-A 專屬** ||||
| W-FA1 | `compose-nestjs-service` | nestjs service 加入 compose（profile: track-a）+ JWT secret 共享 + sys_tokens schema 對齊驗證 | W-F3, W-F4, W-F8 | Track DESIGN-A |
| W-FA2 | `nginx-track-a-transitional-block` | nginx TRANSITIONAL marker block（refreshToken → nestjs upstream） | W-F5 | Track DESIGN-A |
| W-FA3 | `cicd-nestjs-build-job` | nestjs image build pipeline（從 nestjs fork repo）| W-F17 | Track DESIGN-A |

### §11.2 依賴與拍板優先序

```
P1 ┌─ W-F1 (rust Dockerfile) ─┐
   │                          ├─ W-F3 (compose base) ─ W-F4 (secrets) ─┐
   └─ W-F2 (base-web Dockerfile)                                        │
                                                                        ▼
P2                              W-F5 (nginx) ── W-F6 (TLS) ── W-F7 (port)
                                                                        │
P3       W-F8 (migration) ── W-F9 (cleanup) ── W-F10 (outbox) ─────────┤
                                                                        │
P4                            W-F11 (rust horizontal scaling) ──────────┤
                                                                        │
P5    W-F12 (Loki) ── W-F13 (Prometheus) ── W-F14 (dashboards) ─────────┤
                                                                        │
P6              W-F15 (pg backup) ── W-F16 (DR runbook) ────────────────┤
                                                                        │
P7              W-F17 (build pipeline) ── W-F18 (deploy pipeline) ──────┤
                                                                        │
                                                          Track DESIGN-A 專屬：
                                                          W-FA1 (nestjs compose service)
                                                          W-FA2 (nginx track-a)
                                                          W-FA3 (nestjs CI build)
```

**拍板原則**：
- **P1 必先**：W-F1 到 W-F4 — 無容器化 + secret 機制就什麼都跑不起來
- **P2**：W-F5 到 W-F7 — 對外可訪問
- **P3**：W-F8 到 W-F10 — 背景工作完整
- **P4**：W-F11 — 水平擴展能力（DESIGN-B v1 即支援，可在較後階段驗證）
- **P5**：W-F12 到 W-F14 — observability（可在 P1-P3 之後加入，不影響功能）
- **P6**：W-F15 到 W-F16 — 可在功能基本完成後啟動
- **P7**：W-F17 到 W-F18 — 部署自動化（首次部署可手動，後續用 pipeline）
- **Track DESIGN-A 專屬**：W-FA1 到 W-FA3 與 P1-P7 並行，但 DESIGN-A → DESIGN-B 遷移時整組刪除（承 DESIGN-A §6 F14）

### §11.3 部署環境演進策略

- **Day 1**（dev）：P1 + W-F5 / W-F6（自簽 cert）+ W-F7 — 最小可跑形態
- **Day N**（staging）：+ P3 + P5（promtail/loki/prometheus 但 retention 短）
- **Day M**（prod）：+ P4（水平擴展）+ P6（backup）+ P7（CI/CD pipeline 自動化）

每階段都不破壞前階段功能。

---

> **下一步**：本 DESIGN-W-DEPLOYMENT 完成後，rev1 整合 RESEARCH → DESIGN（A / B / W）→ spec-kit specify/plan/tasks/implement 漏斗完整就位。下一步依 spec-kit 流程，從 P1 / Phase 1 features 開始（rust-api Dockerfile / audit-log-infrastructure / soft-delete-infrastructure / 等）逐項 specify。
