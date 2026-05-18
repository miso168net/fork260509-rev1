# Contract: W-FA1 docker compose service / secrets / network 契約

**Feature**: W-FA1 — compose-nestjs-service
**Contract type**: docker compose yaml interface
**Date**: 2026-05-18

> 本契約定義 W-FA1 對 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml` 的改動規格。

---

## C-C1:nestjs service block in `docker-compose.yml`

**Location**:`docker-compose.yml` → `services:` section、加新 service 在 既有 6 service 之後

**Required keys**(per spec FR-001 ~ FR-010 + FR-017 + FR-022):

| Key | Value | 來源 |
|---|---|---|
| `image` | `nestjs:${NESTJS_IMAGE_TAG:-rev1-admin-nestjs}` | FR-002 |
| `profiles` | `["track-a"]` | FR-001 |
| `entrypoint` | sh -c wrapper(per C-S2) | FR-003 |
| `environment` | 10 個 env(per C-C2) | FR-022 |
| `secrets` | 4 個(per C-S1) | FR-004 |
| `depends_on` | migration + postgres + redis(per C-C3) | FR-007 |
| `healthcheck` | curl `/v1/route/getConstantRoutes`(per C-C4) | FR-008 |
| `networks` | `[internal]` | FR-009 |
| `restart` | `unless-stopped` | FR-010 |

---

## C-C2:nestjs `environment` 10 個 env list

| Env | Value | 用途 |
|---|---|---|
| `TZ` | `Asia/Shanghai` | timezone |
| `NODE_ENV` | `production` | nestjs runtime mode |
| `APP_PORT` | `9528` | nestjs HTTP listen port |
| `REDIS_HOST` | `redis` | rev1 hostname |
| `REDIS_PORT` | `6379` | rev1 redis container port |
| `REDIS_DB` | `0` | 共享 rev1 redis db 0 |
| `JWT_EXPIRE_IN` | `3600` | nestjs token TTL(秒) |
| `REFRESH_TOKEN_EXPIRE_IN` | `7200` | nestjs refresh token TTL |
| `CASBIN_MODEL` | `model.conf` | per research R-3 |
| `DOC_SWAGGER_ENABLE` | `"false"`(yaml string、避免 boolean cast) | prod-safe per OOS-008 |

不在 `environment` block 內(透 entrypoint wrapper bridge from `_FILE`):
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `DATABASE_URL`
- `REDIS_PASSWORD`

---

## C-C3:`depends_on` 3 個 service condition

```yaml
depends_on:
  migration:
    condition: service_completed_successfully
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy
```

**契約**:
- `migration` 必須 exit 0 才起 nestjs(per spec FR-007 + E-4)— 確保 rust-api migration schema 已落
- `postgres` + `redis` 必須 healthy 才起(對齊 W-F3 既有 rust-api depends_on pattern)
- 若任一 dep fail、`docker compose --wait` exit 非 0、stack 啟動失敗(預期行為)

---

## C-C4:nestjs healthcheck 規格

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -fsS http://localhost:9528/v1/route/getConstantRoutes || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 60s
```

**契約**(per FR-008 + R-1):
- 用 `CMD-SHELL` 因為 `|| exit 1` 需要 shell interpret
- endpoint `/v1/route/getConstantRoutes` 為 `@Public()` decorator + 不 touch sys_tokens(per R-1 + nestjs `menu.controller.ts:39-46`)、healthcheck PASS 與 sys_tokens schema 是否存在無關
- `start_period: 60s` 給 nestjs prisma client init + nest app boot 時間(per NFR-002)
- `retries: 5` 表示 5 次 fail 後判 unhealthy
- `restart: unless-stopped` 配合 healthcheck unhealthy 自動 restart container

---

## C-C5:`secrets:` section 加 refresh_token_secret 條目

**Location**:`docker-compose.yml` → 末尾 `secrets:` block、加新條目對齊既有 5 個 secret 格式

```yaml
secrets:
  # ... 既有 5 個(jwt_secret / database_url / redis_url / postgres_password / redis_password)...

  # W-FA1 新增
  refresh_token_secret:
    file: deploy/secrets/refresh_token_secret.txt
```

**契約**(per spec FR-006):
- File path 相對於 `docker-compose.yml` 所在目錄(outer repo root)
- 若 `deploy/secrets/refresh_token_secret.txt` 不存在、docker compose 啟動會 fail with `secret file not found` — 但因 entrypoint fallback 機制(per C-S2)、若 W-FA1 operator 不備 refresh_token_secret.txt 而想走 fallback、需:
  - **方案 A(推薦)**:`touch deploy/secrets/refresh_token_secret.txt`(空檔)、entrypoint 內 cat 拿到空字串、`echo "$JWT_SECRET"` fallback
  - **方案 B**:`cp deploy/secrets/refresh_token_secret.txt.example deploy/secrets/refresh_token_secret.txt`(用 example placeholder 內容)
  - 注:docker compose 嚴格要求 secret file 存在,**不存在會 fail-fast 啟動**;`2>/dev/null || echo $JWT_SECRET` 在 entrypoint 內處理「`cat` 拿到 empty string」or「`cat` 拿到 placeholder string」、不是處理「file 完全 missing」

---

## C-C6:`docker-compose.dev.yml` nestjs host port override

**Location**:`docker-compose.dev.yml` → `services:` section、加 nestjs override

```yaml
services:
  # ... 既有 4 個 dev override ...

  nestjs:
    ports:
      - "127.0.0.1:11082:9528"
```

**契約**(per FR-011 + R-7):
- 對齊 W-F7 既有 dev override pattern(loopback `127.0.0.1:` only)
- Host port 11082 對齊 rev1 1XXXX 規約、避開既有 11080~11081 + 11443 + 15432 + 16379
- WSL2 mirrored networking 下 Win11 host 也可 `127.0.0.1:11082` 訪 nestjs(若 setup 對齊 `.wslconfig` `[wsl2] networkingMode=mirrored`)

---

## C-C7:`docker-compose.prod.yml` nestjs prod override(最簡)

**Location**:`docker-compose.prod.yml` → `services:` section、加 nestjs override

```yaml
services:
  # ... 既有 W-F6 front-nginx 0.0.0.0 override ...

  nestjs:
    # prod 不暴露 host port — 僅內部訪問、透 W-FA2 nginx routing
    restart: always   # prod 對齊比 unless-stopped 更積極(optional 微調)
```

**契約**(per FR-012):
- 不寫 `ports:`(prod 嚴禁 nestjs 對外、僅 W-FA2 nginx 反代後可被 access)
- `restart: always` 比 `unless-stopped` 多覆蓋「docker daemon 重啟後自動拉回」場景(對齊 prod 24/7 場景),但這是 optional 微調、`unless-stopped` 也可 — 拍板用 `always` 對齊 prod 慣例

---

## C-C8:Network 結構維持(無新 network)

W-FA1 不新增 network、nestjs 加入 `internal` network(W-F3 既有):

```yaml
services:
  nestjs:
    networks:
      - internal

networks:
  internal:  # ... W-F3 既有 ...
```

**契約**:
- nestjs hostname-based discovery 在 stack 內透過 docker compose 自動 DNS resolution(`postgres` / `redis` / `rust-api` / `base-web` / `front-nginx` / `migration` 都可)
- 對齊 Constitution III「跨服務狀態同步只能透過共用基礎設施」— nestjs 不直接 HTTP call 其他 backend、用共用 postgres + redis

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-C1 | nestjs service block keys |
| C-C2 | environment 10 個 env list |
| C-C3 | depends_on 3 個 service condition |
| C-C4 | healthcheck 規格 |
| C-C5 | secrets refresh_token_secret 條目 |
| C-C6 | dev.yml ports override |
| C-C7 | prod.yml override(最簡) |
| C-C8 | Network 結構(無新 network) |

**8 個 compose contract、涵蓋 W-FA1 對 3 個 compose file 的全部觸及點**。
