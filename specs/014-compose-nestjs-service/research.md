# Phase 0 Research: W-FA1 compose-nestjs-service

**Feature**: W-FA1 — compose-nestjs-service
**Date**: 2026-05-18
**Source**: [spec.md](spec.md) + [docs/superpowers/014-feature-compose-nestjs-service.md](../../docs/superpowers/014-feature-compose-nestjs-service.md)

> Brainstorm 階段保留 4 個 OQ(plan-stage detail)、plan 階段透過 nestjs fork source code 探勘全部解開。Research 7 個技術點均有明確 decision + evidence + alternative。

---

## R-1:nestjs prisma client lazy-init schema mismatch 風險(OQ-1 解)

### Decision

**nestjs `PrismaService.onModuleInit()` 用 `$connect()` 建 connection、不 verify schema**(prisma 客戶端 lazy validate);healthcheck endpoint `/v1/route/getConstantRoutes` **不 touch `sys_tokens` 表**、touch 的是 `sys_menu`(rust-api migration 已落、schema 不 mismatch);**W-FA1 acceptance 全 PASS 不依賴 sys_tokens 存在**,sys_tokens 應用層 read/write 屬 F10 範疇。

### Evidence

- `fork260509-soybean-admin-nestjs/backend/libs/shared/prisma/src/prisma.service.ts:33-35`:
  ```typescript
  async onModuleInit() {
    await this.$connect();
  }
  ```
  Prisma `$connect()` 僅建立 DB connection、**不**校驗 schema 對齊(prisma 設計為 lazy validate at first query)。
- `fork260509-soybean-admin-nestjs/backend/apps/base-system/src/api/iam/rest/menu.controller.ts:39-46`:
  ```typescript
  @Public()
  @Get('getConstantRoutes')
  async getConstantRoutes(): Promise<ApiRes<MenuRoute[]>> {
    const result = await this.menuService.getConstantRoutes();
    return ApiRes.success(result);
  }
  ```
  Healthcheck endpoint `/v1/route/getConstantRoutes` 是 `@Public()` decorator(無需 auth)+ touch `MenuService.getConstantRoutes()` → MenuReadPgRepository(只 query sys_menu、不 query sys_tokens)。
- `fork260509-soybean-admin-nestjs/backend/prisma/schema.prisma:18-38`:含 SysTokens model 定義(20 LOC、含 `access_token` / `refresh_token` / `user_id` / `username` 等 fields);與 rust-api 預期 sys_tokens schema 對齊或微差(實際 F10 階段確認、不在 W-FA1 範疇)。

### Critical implication for spec

**Spec FR-021 acceptance** 「`docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens"` 確認 sys_tokens 表存在」:
- 若 sys_tokens 表存在 → US3 PASS 完整
- 若不存在(rust-api migration 尚未落 sys_tokens schema) → US3 降級為「驗 nestjs connect DB 成功 + 留 F10 follow-up」、不阻 W-FA1 acceptance ✅

### Alternatives considered

- **Lazy init + explicit schema sync**(prisma `db pull` + `prisma generate` runtime):會修改 nestjs source / image runtime、違 FR-018 + Constitution Principle IV。不採。
- **Strict schema verify at boot**(W-FA1 startup script grep `\d sys_tokens`、若 missing exit):增 W-FA1 範疇複雜度、與「中度」拍板矛盾。不採。

---

## R-2:nestjs alpine image psql 缺漏(OQ-2 解)

### Decision

**nestjs fork Dockerfile 不裝 psql 系列**(只 `RUN apk --no-cache add curl` per line 21);W-FA1 acceptance US3 從 **postgres container** 跑 psql、**不**從 nestjs container 跑。

### Evidence

- `fork260509-soybean-admin-nestjs/backend/Dockerfile:21`:
  ```dockerfile
  RUN apk --no-cache add curl
  ```
  唯一 system package 是 curl(for healthcheck)、未裝 postgresql-client / psql。
- nestjs container `apk add postgresql-client` runtime install 違 FR-018(動 nestjs image runtime 配置、即使不寫 source、本質改變 image state)。

### Alternatives considered

- **W-FA1 acceptance 階段 nestjs container 內 apk add psql**:debug 階段可、acceptance 紀律不採;違 FR-018 boundary。
- **修 fork Dockerfile 加 psql**:違 Constitution Principle IV + FR-018、不採。
- **acceptance 從 host 跑 psql**:host 機沒 psql、之前 F6 acceptance 已遇此問題、已切到 `docker compose exec postgres psql` 模式。**沿用此模式** ✅(對齊 F6 acceptance 慣例)。

---

## R-3:nestjs Casbin `model.conf` build context 與 runtime 路徑(OQ-3 解)

### Decision

**`model.conf` 在 fork repo 內存在 2 份**(`apps/base-demo/src/resources/model.conf` + `apps/base-system/src/resources/model.conf`);**W-FA1 用 base-system app**(per `nest build base-system` package.json script);build 後 image 內 model.conf 在 `dist/apps/base-system/src/resources/model.conf`(nest CLI default copy resources 進 dist);runtime 透過 `CASBIN_MODEL=model.conf` env + WORKDIR `/usr/src/app/soybean/backend/` + nestjs 內部 path resolution 自動 find;**W-FA1 不需特殊 mount volume override**。

### Evidence

- `find fork260509-soybean-admin-nestjs/backend -name model.conf`:
  ```
  fork260509-soybean-admin-nestjs/backend/apps/base-demo/src/resources/model.conf
  fork260509-soybean-admin-nestjs/backend/apps/base-system/src/resources/model.conf
  ```
- `fork260509-soybean-admin-nestjs/backend/Dockerfile:18`(WORKDIR `/usr/src/app/soybean/backend/`)+ build stage `pnpm build` 跑 `nest build base-system`、預設把 `apps/base-system/src/resources/*` copy 到 `dist/apps/base-system/src/resources/*`(nest CLI default nest-cli.json `compilerOptions.assets`)
- nestjs fork 自帶 compose `CASBIN_MODEL: "model.conf"` env、與 nestjs source 內 resource lookup 對齊(若 fork repo 自己跑得起來 / acceptance 走得通,W-FA1 沿用此 env 即 work)

### Alternatives considered

- **W-FA1 加 bind mount `-v fork.../model.conf:/app/model.conf`**:debug 階段可考慮、但若 fork 自帶 build 已含 model.conf in image、不需 mount。**先採無 mount 簡單方案、acceptance 階段若 nestjs container log 報 Casbin model 找不到、再加 mount。** ✅
- **改 W-FA1 範疇加 nestjs source patch**:違 FR-018、不採。

---

## R-4:Profile-based service restart 行為(OQ-4 解)

### Decision

docker compose `profiles:` 機制只控制 service 是否 **include** 進 stack(`--profile` flag 啟用);**`restart: unless-stopped` policy 不分 profile、被 include 時正常生效**;若 stack 啟動命令未帶 `--profile track-a`,nestjs service 完全不 include、docker daemon 不 manage、不 restart。

### Evidence

- docker compose v2 docs(`docker compose profiles` reference):「Services without `profiles` always start. Services with `profiles` only start when a profile is explicitly enabled via `--profile <name>` or environment variable.」
- `restart: unless-stopped` 是 docker engine 層 restart policy、跟 compose profile 機制獨立、不衝突。
- 實際 W-FA1 acceptance US5「不帶 `--profile track-a` 啟 stack → docker compose ps 6 service、無 nestjs」即驗 profile 機制 work。

### W-FA1 不必特殊處理 restart

W-FA1 直接寫 `restart: unless-stopped`、預期行為正常;若未來發現 profile + restart 互動異常、屬 docker compose engine bug,W-FA1 範疇外。

### Alternatives considered

- **Manual restart control via systemd**:本機 dev 不適用、prod 屬 W-F17/W-F18 deploy automation 範疇、不採。
- **Skip restart policy for transitional service**:`restart: "no"` 對 transitional service 也 OK、但發生 crash 後不自動 recover、影響 dev UX 不佳;**採 `unless-stopped` 對齊 W-F3 既有 long-running service 慣例** ✅。

---

## R-5:nestjs container entry point + main.ts location

### Decision

nestjs container `entrypoint:` 用 `sh -c` wrapper、exec `node dist/apps/base-system/src/main`(對齊 nestjs fork package.json `start:prod` 啟動點)。

### Evidence

- `fork260509-soybean-admin-nestjs/backend/package.json` scripts:
  ```
  "start:prod": "cross-env NODE_ENV=production node dist/apps/base-system/src/main",
  ```
- `fork260509-soybean-admin-nestjs/backend/apps/base-system/src/main.ts:89`:`app.setGlobalPrefix(GLOBAL_PREFIX)` — 確認 nestjs 走 `/v1/*` prefix(對齊 W-FA1 healthcheck `/v1/route/getConstantRoutes`)
- W-FA1 entrypoint wrapper 不用 `cross-env`(因為 entrypoint sh 已 export NODE_ENV);direct `exec node dist/apps/base-system/src/main` 即可。

### Entrypoint 完整 shape(per W-FA1 implement)

```yaml
entrypoint:
  - sh
  - -c
  - |
    export JWT_SECRET=$$(cat /run/secrets/jwt_secret)
    export REFRESH_TOKEN_SECRET=$$(cat /run/secrets/refresh_token_secret 2>/dev/null || echo "$$JWT_SECRET")
    export DATABASE_URL=$$(cat /run/secrets/database_url)
    export REDIS_PASSWORD=$$(cat /run/secrets/redis_password)
    exec node dist/apps/base-system/src/main
```

關鍵 details:
- `$$` 在 yaml literal block 解析後變 `$`(yaml escape `$$` → `$`、shell 變數展開)
- `cat ... 2>/dev/null || echo "$$JWT_SECRET"` fallback 機制(per FR-005 + E-1)、若 refresh_token_secret 缺、用 JWT_SECRET
- `exec` 用以替換 sh process、讓 nestjs 收到 docker SIGTERM(graceful shutdown)、不要留 sh 在 process tree
- 不用 `cross-env` 因為 sh export 已設 NODE_ENV(by `environment:` block 在 compose 內設、不需 entrypoint 再 export)

### Alternatives considered

- **Use `command:` instead of `entrypoint:`**:也可、但 Dockerfile 既有 ENTRYPOINT 沒寫(只 USER + EXPOSE、command 在 package.json),compose `entrypoint:` override 較明確。**採 `entrypoint`**。
- **Run wrapper inside Dockerfile**:改 Dockerfile 違 FR-018、不採。
- **Use init container pattern for secret mounting**:過度設計、W-FA1 中度範疇不需。不採。

---

## R-6:nestjs container env 完整 list(per spec FR-022 細化)

### Decision

W-FA1 nestjs container `environment:` block 含 10 個 env(對齊 nestjs fork 自帶 compose、加 rev1 specific 微調)。

### Concrete env list

| Env | Value | 來源 / 理由 |
|---|---|---|
| `TZ` | `Asia/Shanghai` | 對齊 nestjs fork 自帶 + rev1 既有 service |
| `NODE_ENV` | `production` | 對齊 nestjs fork 自帶 |
| `APP_PORT` | `9528` | 對齊 nestjs fork 自帶 + healthcheck port |
| `REDIS_HOST` | `redis` | rev1 stack 內 hostname、不是 IP |
| `REDIS_PORT` | `6379` | 對齊 nestjs fork 自帶 + rev1 redis container port |
| `REDIS_DB` | `0` | 共享 rev1 redis db 0(避開 nestjs fork 自帶 db 1、避免衝突;rev1 rust-api 也用 db 0、共享無衝突因應用層 key 不同) |
| `JWT_EXPIRE_IN` | `3600` | 對齊 nestjs fork 自帶 |
| `REFRESH_TOKEN_EXPIRE_IN` | `7200` | 對齊 nestjs fork 自帶 |
| `CASBIN_MODEL` | `model.conf` | 對齊 nestjs fork 自帶 + R-3 |
| `DOC_SWAGGER_ENABLE` | `false` | prod-safe(spec OOS-008 明示) |

`JWT_SECRET` / `REFRESH_TOKEN_SECRET` / `DATABASE_URL` / `REDIS_PASSWORD` 4 個 secret 不在 environment block(經 entrypoint wrapper bridge from `_FILE`)。

### Alternatives considered

- **REDIS_DB=1**(對齊 nestjs fork 自帶):與 rev1 既有 rust-api 用 db 0 分離、看似乾淨;但 W-FA1 範疇是 service 進 compose、不涉應用層 key 衝突調查、REDIS_DB=0 也 OK(rust-api 用 token / session / Casbin policy key,nestjs 用 token rotation key、命名 prefix 不衝突,可 F10 階段 verify);**REDIS_DB=0 採用** 簡化 + 符合 rev1 single-DB 慣例。

---

## R-7:nestjs image build invocation 細節

### Decision

W-FA1 image build 透過命令:
```bash
DOCKER_BUILDKIT=1 docker build \
  -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
  -t nestjs:rev1-admin-nestjs \
  fork260509-soybean-admin-nestjs/backend/
```

不在 `docker-compose.yml` `services.nestjs.build:` 寫 build context(對齊 W-F1 rust-api / W-F2 base-web 模式)— 純 image tag reference,build 是 operator 手動 step。

### Evidence

- `docker-compose.yml` 內 rust-api / base-web 已用 `image: rust-api:${IMAGE_TAG:-rev1-admin-rust-api}` 模式、不寫 build context
- W-FA1 加 nestjs 對齊此 pattern:`image: nestjs:${NESTJS_IMAGE_TAG:-rev1-admin-nestjs}`
- W-FA3(後續 feature)會在 CI/CD 自動化 build job、image 從 registry pull

### Build verification

- `docker images nestjs:rev1-admin-nestjs --format "{{.Size}}"` ≤ 500MB(per NFR-001)
- `docker history nestjs:rev1-admin-nestjs` 顯示 multi-stage build layer(`base` / `deps` / `build` / `final` 4 stages)

### Alternatives considered

- **`build.context` in compose**:讓 `docker compose up --build` 自動 rebuild;但與 W-F1 / W-F2 unified pattern 不一致(rust-api / base-web 也是 pre-built image reference)、不採。
- **Use image hash instead of tag**:對齊 reproducibility 但 W-FA1 dev focus、不投資 hash pinning(W-F18 CI/CD 階段處理)。

---

## Open questions(無)

OQ-1 ~ OQ-4 全部解開、研究 R-1 ~ R-7 共 7 個技術點均有明確 decision + evidence + alternative。**Phase 0 完成、Phase 1 啟動條件滿足**。

剩餘潛在 follow-up(屬 implement / acceptance 階段細化、不阻 plan):
- Build 階段若 nestjs Dockerfile pnpm-lock.yaml 版本鎖定問題、需處理(屬 fork dependency 維護紀律、W-FA1 範疇內若需 spike build-arg `PNPM_VERSION` 微調)
- nestjs Casbin model.conf runtime path 若 image 內找不到、acceptance 階段加 bind mount(R-3 alternatives 已提)
- nestjs sys_tokens schema 對齊 acceptance 階段若 sys_tokens 不存在、降級為 connectivity-only 驗(R-1 critical implication 已 noted)
