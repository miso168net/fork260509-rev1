# Phase 1 Data Model: W-FA1 compose-nestjs-service

**Feature**: W-FA1 — compose-nestjs-service
**Date**: 2026-05-18

> W-FA1 為 deploy-track feature、無 DB schema 改動、無 application source 改動。本檔以 outer repo yaml entity + secret file + doc 改動角度描述 7 個觸及點。

---

## E-1:`docker-compose.yml` nestjs service block(新增)

**Location**:`docker-compose.yml`(W-F3 既有檔、append 1 個新 service block + 1 個 secrets 條目)

**Schema**(per spec FR-001 ~ FR-010 + FR-017 + FR-022 + research R-5 / R-6):

```yaml
services:
  # ... 既有 5 service(postgres / redis / migration / rust-api / base-web)+ 1 service(front-nginx)...

  # nestjs(per W-FA1 spec FR-001 / DESIGN-W §3.4-A 草稿)
  nestjs:
    image: nestjs:${NESTJS_IMAGE_TAG:-rev1-admin-nestjs}
    profiles: ["track-a"]
    entrypoint:
      - sh
      - -c
      - |
        export JWT_SECRET=$$(cat /run/secrets/jwt_secret)
        export REFRESH_TOKEN_SECRET=$$(cat /run/secrets/refresh_token_secret 2>/dev/null || echo "$$JWT_SECRET")
        export DATABASE_URL=$$(cat /run/secrets/database_url)
        export REDIS_PASSWORD=$$(cat /run/secrets/redis_password)
        exec node dist/apps/base-system/src/main
    environment:
      TZ: Asia/Shanghai
      NODE_ENV: production
      APP_PORT: 9528
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      JWT_EXPIRE_IN: 3600
      REFRESH_TOKEN_EXPIRE_IN: 7200
      CASBIN_MODEL: model.conf
      DOC_SWAGGER_ENABLE: "false"
    secrets:
      - jwt_secret
      - database_url
      - redis_password
      - refresh_token_secret
    depends_on:
      migration:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9528/v1/route/getConstantRoutes || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    networks:
      - internal
    restart: unless-stopped
```

**關鍵 invariants**(per spec):
- `profiles: ["track-a"]` 確保 DESIGN-B 形態不啟動(FR-001 + US5)
- entrypoint sh wrapper bridge 4 個 `_FILE` secret → env(FR-003 / FR-004 + R-5)
- `exec node` 保 SIGTERM graceful shutdown(R-5)
- `depends_on` 3 個 service(FR-007)
- healthcheck 走 `/v1/route/getConstantRoutes`(FR-008 + R-3)
- network `internal`(FR-009)
- restart `unless-stopped`(FR-010 + R-4)

---

## E-2:`docker-compose.yml` `secrets:` section refresh_token_secret 條目(新增)

**Location**:`docker-compose.yml` 末尾 `secrets:` section、加 1 條目

**Schema**(per spec FR-005 / FR-006):

```yaml
secrets:
  # ... 既有 5 個 secret(jwt_secret / database_url / redis_url / postgres_password / redis_password)...

  # W-FA1 新增 — refresh token signing secret(獨立、可 fallback JWT_SECRET if missing)
  refresh_token_secret:
    file: deploy/secrets/refresh_token_secret.txt
```

**對齊既有 W-F4 secret 格式**:
```yaml
jwt_secret:
  file: deploy/secrets/jwt_secret.txt
```

---

## E-3:`docker-compose.dev.yml` nestjs ports override(新增)

**Location**:`docker-compose.dev.yml`(W-F7 既有檔、append 1 個 service override block)

**Schema**(per spec FR-011 + R-7 port 規約):

```yaml
services:
  # ... 既有 4 個 dev override(front-nginx 11080 + 11443 / rust-api 11081 / postgres 15432 / redis 16379)...

  # W-FA1 新增 — nestjs host port dev only(內部 9528 → host 127.0.0.1:11082)
  nestjs:
    ports:
      - "127.0.0.1:11082:9528"
```

**關鍵**:
- 對齊 W-F7 既有 dev override pattern(`127.0.0.1:` loopback only)
- 不暴露到 `0.0.0.0`(dev only、prod 透過 W-FA2 nginx routing)
- port 11082 對齊 rev1 1XXXX 規約、避開既有 11080~11081 + 11443 + 15432 + 16379

---

## E-4:`docker-compose.prod.yml` nestjs override(新增、空 / 最簡)

**Location**:`docker-compose.prod.yml`(W-F6 既有檔、append 1 個 service override block)

**Schema**(per spec FR-012):

選項 A(最簡 placeholder、實際生效空):
```yaml
services:
  # ... 既有 W-F6 front-nginx 0.0.0.0 對外 override ...

  # W-FA1 新增 — nestjs prod override(目前空、留 W-FA2 後續加 internal routing 配置)
  nestjs:
    # prod 不暴露 host port — 僅內部訪問、透 W-FA2 nginx routing
    restart: always   # prod 對齊比 unless-stopped 更積極(optional)
```

選項 B(完全空、不寫):
```yaml
# W-FA1 不需 prod override — nestjs 在 docker-compose.yml 基本 service 配置已含 profile=track-a
# prod 啟動命令 `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a up`
# 已隱含 nestjs 啟動、無需此檔 override
```

**Plan 決定**:採選項 A 最簡 placeholder、保留 prod-specific 微調空間(`restart: always` 預埋)、明示 nestjs 不對外 host port(W-FA2 才補 nginx upstream)

---

## E-5:`deploy/secrets/refresh_token_secret.txt` + `.example`(新增)

**Location**:
- `deploy/secrets/refresh_token_secret.txt`(gitignored、per W-F4 既有 5 個 secret 慣例)
- `deploy/secrets/refresh_token_secret.txt.example`(tracked)

**Content**(per FR-005):

`refresh_token_secret.txt.example`(示意 placeholder、tracked):
```
# Refresh token signing secret for nestjs (W-FA1 / F10 future use)
# Generate via: openssl rand -hex 32  (or similar entropy source)
# Or leave empty / file missing → entrypoint fallback JWT_SECRET (per W-FA1 spec FR-005 / E-1)
REPLACE_WITH_64_HEX_CHARS_OR_LEAVE_EMPTY_FOR_FALLBACK
```

`refresh_token_secret.txt`(operator 本機 ad-hoc 備、若 W-FA1 落地後 acceptance 需驗 fallback to JWT_SECRET 路徑、可選擇不備此檔):
- 機器選項 1:不備此檔(`deploy/secrets/refresh_token_secret.txt` 不存在)、走 entrypoint fallback
- 機器選項 2:備此檔(`openssl rand -hex 32 > deploy/secrets/refresh_token_secret.txt`)、走獨立 secret 模式

**對齊既有 secret example 格式**(per W-F4):
```bash
$ ls deploy/secrets/
acme_email.txt.example
database_url.txt
database_url.txt.example
jwt_secret.txt
jwt_secret.txt.example
postgres_password.txt
postgres_password.txt.example
redis_password.txt
redis_password.txt.example
redis_url.txt
redis_url.txt.example
refresh_token_secret.txt.example   # ★ W-FA1 新增
```

---

## E-6:`CLAUDE.md` §5.2 + §5.2.1 + §10 更新(改)

**Location**:`CLAUDE.md`

**改動範圍**(per FR-013):

### §5.2 — 對外 endpoint 與 port 規劃 表加 nestjs

既有表:
| 角色 | 參考專案 fork260509 | rev1 提議 |
|---|---|---|
| Web (對外) | `:8080` | `:11080` |
| Rust API | `:10001` | `:11081` |
| Postgres | `:5432` | `15432:5432` |
| ... | ... | ... |

加 1 行:
| nestjs (對外、僅 dev) | nestjs fork `:9528` | `:11082`(dev only、profile=track-a 啟用時) |

### §5.2.1 dev 啟動命令範例 加 DESIGN-A 變體

既有 3 啟動範例(dev / prod baseline / prod + acme)→ 加第 4 個 「DESIGN-A 路線 dev(含 nestjs)」:

```bash
# === DESIGN-A 路線 dev(profile=track-a、加 nestjs 進 stack)===
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps  # 7 service healthy(含 nestjs)
curl -fsS http://127.0.0.1:11082/v1/route/getConstantRoutes  # nestjs 直連驗
```

### §10 SPECKIT marker

```diff
<!-- SPECKIT START -->
- - **Active feature**: 無(F6 全完成、application Phase 2 第二個 feature 達成)
- - **Phase**: Done
+ - **Active feature**: W-FA1 `014-compose-nestjs-service`([spec](specs/014-compose-nestjs-service/spec.md) / [plan](specs/014-compose-nestjs-service/plan.md))
+ - **Phase**: Planning(spec + plan + research + data-model + 3 contracts + quickstart 完成;下一步 `/speckit-tasks`)
- **Previous features**: W-F1 merge `430ada9` / ... / F6 merge `a431215`(均已 push、acceptance PASS;Phase W deploy P2 進度 **3/4**、F6 為 application Phase 2 第二個 feature)
<!-- SPECKIT END -->
```

---

## E-7:`docs/INTEGRATION-CHECKLIST.md` 更新(改)

**Location**:`docs/INTEGRATION-CHECKLIST.md`

**改動範圍**(per FR-014):

### Current Focus 更新

從 application Phase 2 切換 / 並行 Phase W deploy P7 Track-A:
```diff
- **Phase**:application Phase 2(per DESIGN-A §6.1)— **F5.1 + F6 完成、剩 F7 / F8 / F9 / F10 / F11**;W deploy 並行 **W-2 P2:3/4 ✅、剩 W-F11**
- **Active feature**:無(F6 全完成、`/route/isRouteExist` endpoint 補完 base-web vue-router guard disambiguation 邏輯)
- **下一步**:F7 manage-crud-alignment ...
+ **Phase**:Phase W deploy P7 Track DESIGN-A 三件套啟動(W-FA1 進行中)— DESIGN-A 路線 deploy chain 起點;application Phase 2 並行 F5.1 + F6 完成
+ **Active feature**:W-FA1 `compose-nestjs-service` planning 完成、tasks 階段啟動中
+ **下一步**:W-FA1 implement → W-FA2 nginx-track-a-transitional-block → F10 refresh-token-nestjs-bridge → W-FA3 cicd-nestjs-build-job
```

### Phase W deploy Roadmap 表 新增 Track DESIGN-A 段

既有表只到 W-F7(line 57-69),加新段「Phase W-7 Track DESIGN-A 三件套」:

```markdown
## Phase W-7 deploy Roadmap — Track DESIGN-A 三件套(per DESIGN-W §11 line 1114-1116)

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| W-FA1 | `compose-nestjs-service` | ✅ | ✅ | ✅ | — | — | **進行中**(plan 完成、tasks 階段)|
| W-FA2 | `nginx-track-a-transitional-block` | — | — | — | — | — | 未啟 |
| W-FA3 | `cicd-nestjs-build-job` | — | — | — | — | — | 未啟 |

§11.7 規則:Track DESIGN-A 專屬 3 個 feature(W-FA1 → W-FA2 → W-FA3)依序、與 P1-P6 並行;DESIGN-A → DESIGN-B 遷移時整組刪除(承 DESIGN-A §6 F14)。
```

### 已完成里程碑 加 W-FA1 條目(implement 完成後填、現在 plan 階段不填)

留 placeholder 由 implement 階段 acceptance PASS 後填(類比 F6 / W-F6 等既有 entry 格式)。

---

## 跨 entity 關係

```
[E-1] docker-compose.yml nestjs service block
        │
        ├─ 引用 secrets(jwt_secret / database_url / redis_password / refresh_token_secret)
        │   ├─ jwt_secret(W-F4 既有)
        │   ├─ database_url(W-F4 既有)
        │   ├─ redis_password(W-F4 既有)
        │   └─ [E-2] refresh_token_secret(W-FA1 新增)
        │            └─ [E-5] deploy/secrets/refresh_token_secret.txt + .example
        │
        ├─ depends_on(migration / postgres / redis、W-F3 / W-F4 既有)
        ├─ network internal(W-F3 既有)
        └─ healthcheck `/v1/route/getConstantRoutes`(nestjs fork 既有 endpoint)

[E-3] docker-compose.dev.yml nestjs ports override
        └─ 127.0.0.1:11082:9528(W-F7 既有 dev override pattern)

[E-4] docker-compose.prod.yml nestjs override
        └─ 最簡 placeholder(restart: always、不暴露 host port)

[E-6] CLAUDE.md(§5.2 + §5.2.1 + §10)
        └─ 啟動命令範例 + port 規劃 + SPECKIT marker

[E-7] docs/INTEGRATION-CHECKLIST.md
        └─ Current Focus + Phase W-7 Track-A roadmap 表 + 已完成里程碑(implement 後)
```

**強耦合**:
- E-1 + E-2 同檔(docker-compose.yml)、必須同 commit
- E-1 ~ E-7 全部屬 outer repo(W-F1~W-F7 純 outer 慣例對齊)
- **無 worktree 改動**(per FR-018)

---

## State / Lifecycle(deploy artifact)

W-FA1 為 deploy 配置、無 application state lifecycle。Image artifact `nestjs:rev1-admin-nestjs` 為 local build product、不寫 git、不 push registry(W-FA3 範疇)。

---

**Phase 1 data-model 完成、contracts + quickstart 啟動條件滿足**。
