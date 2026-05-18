# Feature Specification: W-FA1 — compose-nestjs-service

**Feature Branch**: `014-compose-nestjs-service`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "W-FA1 compose-nestjs-service — DESIGN-A 路線 Track DESIGN-A 專屬第一個 feature(P7 三件套 W-FA1/W-FA2/W-FA3 中最先動);把 nestjs service 加進 rev1 docker compose stack、走 profile=track-a 啟動模式、共享 rev1 既有 postgres + redis、JWT secret 透過 W-F4 _FILE pattern 與 rust-api 共享;範疇 B 中度(nestjs container healthy + JWT secret _FILE bridge + DB 共享同 schema + sys_tokens schema acceptance verify、不含 F10 application 邏輯);Dockerfile 沿用 fork(fork260509-soybean-admin-nestjs/backend/Dockerfile 不動 source);DB 共享同 instance/同 DB/同 schema(per F10 sys_tokens 設計 intent);不跑 nestjs prisma migrate / db seed(避免 break rust-api migration);JWT secret 透過 compose entrypoint sh wrapper bridge `_FILE` → env(不動 nestjs source code);Refresh token secret 獨立新增(fallback JWT_SECRET);Port:container 9528、host 127.0.0.1:11082 dev only;不含 nginx routing(W-FA2 範疇)、不含 sys_tokens prisma model 對齊(F10 範疇)"

**Source**: [`docs/superpowers/014-feature-compose-nestjs-service.md`](../../docs/superpowers/014-feature-compose-nestjs-service.md)(brainstorming 2026-05-18、4 顯式拍板 Q + 3 自然推論)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §3.4-A(nestjs service yaml 草稿)、§11 line 1114(W-FA1 scope)、§11.5(profile 啟動命令)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 F10(sys_tokens schema 共識「rust 主導 migration、nestjs 共用」)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork source;Principle V「漸進收縮 DESIGN-A → DESIGN-B」— nestjs 屬 transitional)
- 既有 [`fork260509-soybean-admin-nestjs/backend/Dockerfile`](../../fork260509-soybean-admin-nestjs/backend/Dockerfile)(W-FA1 build context、不動)
- 既有 [`docker-compose.yml`](../../docker-compose.yml)(W-F3/W-F4 落地、W-FA1 加 nestjs service 條目)
- 既有 [`docker-compose.dev.yml`](../../docker-compose.dev.yml)(W-F7 落地、W-FA1 加 host port 條目)
- 既有 [`docker-compose.prod.yml`](../../docker-compose.prod.yml)(W-F6 落地、W-FA1 加 prod override 條目)
- 既有 [`deploy/secrets/`](../../deploy/secrets/)(W-F4 _FILE pattern 結構)

**Scope summary**:rev1 deploy 階段 Track DESIGN-A 專屬第一個 feature(P7 Track-A 三件套 W-FA1/W-FA2/W-FA3 中最先動)。**把 nestjs service 加進 rev1 docker compose stack、走 profile=track-a 啟動模式、共享 rev1 既有 postgres + redis、JWT secret 透過 W-F4 _FILE pattern 與 rust-api 共享、healthcheck + depends_on 完整對齊**。範疇刻意收緊到「compose 層 + nestjs container 起得來 + 能 connect rev1 backing services + sys_tokens schema acceptance verify」,**不含 application code 改動**(refreshToken 實作是 F10 範疇)、**不含 nginx routing**(W-FA2 範疇)、**不含 Casbin pub-sub channel 訂閱**(F10 範疇)。

**Commit 模式**:**單段 commit**(per W-F1~W-F7 慣例)— 只動 outer repo,**不動 nestjs fork repo**(fork260509-soybean-admin-nestjs 不 worktree+submodule 化,屬 transitional 不投資 overhead)。

**範疇外**:nestjs application source code 改動 / sys_tokens prisma model 對齊 / refreshToken endpoint 實作 / nginx track-a.inc upstream routing / Casbin pub-sub channel `casbin:policy:invalidate` 訂閱 / nestjs fork repo worktree 化 / nestjs frontend image。

## Clarifications

### Session 2026-05-18(brainstorming 階段拍板、4 項顯式 Q + 3 項自然推論)

- **Q1**: W-FA1 scope 要劃到哪一層? → **A: B 中度**(nestjs container 起得來 healthy + JWT secret 共享 `_FILE` pattern + DB 共享 rev1 postgres + sys_tokens schema acceptance verify + healthcheck)。對齊 DESIGN-W §11 line 1114 「JWT secret 共享 + sys_tokens schema 對齊驗證」描述;**不含** F10 application 邏輯(獨立 feature)。

- **Q2**: nestjs Dockerfile 怎麼處理? → **A: 沿用 fork 既有 Dockerfile**(`fork260509-soybean-admin-nestjs/backend/Dockerfile`、alpine + node 20.11.1 + multi-stage + USER node + 含 curl)。理由:nestjs 屬 transitional、DESIGN-B 退場、不投資新 Dockerfile;類比 W-F2 base-web Dockerfile 跨源倉使用模式。

- **Q3**: nestjs 跟 rust-api 的 postgres DB 怎麼 shared? → **A: 同 instance 同 DB 同 schema**(nestjs `DATABASE_URL` 指 rev1 既有 `soybean_admin_rust`、schema=public)。對齊 DESIGN-A §6 F10 設計 intent「sys_tokens schema 共識」;最簡單方式是同 schema 全共享、避免 schema-level isolation 的 cross-schema reference 複雜度;nestjs 是 transitional 不需 isolation 投資。

- **Q4**: nestjs 自帶 `db-init` service(prisma migrate deploy + prisma db seed)怎麼處理? → **A: W-FA1 不跑 nestjs migrate / seed**。compose 不加 nestjs db-init service、nestjs container 啟動不跑 prisma migrate / pull / generate runtime。sys_tokens schema 對齊驗 = W-FA1 acceptance 階段 manual SQL `\d sys_tokens` 確認表存在 + nestjs container 能 connect DB。F10 時再改 nestjs prisma model 對齊 sys_tokens 完整 type generate。理由:rust-api migration 主導 schema、跑 nestjs migrate 會 break rust-api;W-FA1 範疇 minimal、F10 才真正改 nestjs source。

- **自然推論**:**JWT secret bridge via entrypoint wrapper** — nestjs `libs/config/src/security.config.ts` 用 `getEnvString('JWT_SECRET', ...)` 讀 env、不支援 `_FILE`;不動 fork source(Q2 拍板)、用 compose `entrypoint` override `sh -c "export JWT_SECRET=$(cat $JWT_SECRET_FILE) && exec node ..."` 過渡。F10 / 後續 feature 可在 nestjs source 對齊 `_FILE` 原生支援、屆時 entrypoint wrapper 移除。

- **自然推論**:**Refresh token secret 獨立** — nestjs 自帶 `REFRESH_TOKEN_SECRET` 跟 `JWT_SECRET` 分開(security best practice)、W-FA1 加 1 個新 secret `refresh_token_secret`(對應 `deploy/secrets/refresh_token_secret.txt` + `.example`)、entrypoint fallback 機制(secret 缺則用 JWT_SECRET、讓 W-FA1 落地不阻塞)。

- **自然推論**:**Port 規約** — nestjs container 內 port 9528(對齊 nestjs fork 自帶配置、不改 DESIGN-W §3.4-A 草稿建議的 3000、minimal change);host port `11082`(對齊 rev1 1XXXX 規約、避開 rust-api `11081`、base-web/nginx `11080`)。Dev only 暴露(`docker-compose.dev.yml`)、prod 不暴露(僅內部訪問、透 W-FA2 nginx routing)。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — DESIGN-A profile 啟動 nestjs 加入 stack(Priority: P1)🎯 MVP

operator 在 dev 環境執行 `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`,**stack 從 6 service(postgres / redis / migration / rust-api / base-web / front-nginx)變 7 service(+ nestjs)、全 healthy**。nestjs container 從 nestjs fork repo build 出來、ENV bridge 從 `_FILE` secret 讀進 string env、connect rev1 postgres + redis 成功、healthcheck endpoint 回 200。

**Why this priority**:

W-FA1 核心價值在「DESIGN-A 路線 deploy chain 起點」— 沒這個 nestjs service 不存在、後續 W-FA2 nginx routing 無 upstream、F10 application 邏輯無宿主。US1 是 W-FA1 唯一 implementation-bearing scenario、其他 US 為驗證夾。

**Independent Test**:dev stack `--profile track-a up` + 看 7 service 全 healthy + nestjs container internal `curl /v1/route/getConstantRoutes` 200 — 不依賴 US2~US6 工作。

**Acceptance Scenarios**:

1. **Given** dev stack 已啟、`docker-compose.yml` / `docker-compose.dev.yml` 含 W-FA1 nestjs service 條目、nestjs image 已 build(`nestjs:rev1-admin-nestjs`),**When** `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`,**Then** `docker compose ps` 顯示 nestjs 為 `(healthy)` 狀態、6 個既有 service 仍全 healthy
2. **Given** stack 已啟,**When** `docker compose exec nestjs curl -fsS http://localhost:9528/v1/route/getConstantRoutes`,**Then** HTTP 200 + 回 nestjs 既有 endpoint response(具體 shape 視 nestjs 既有實作、不在 W-FA1 範疇驗 shape 對齊)
3. **Given** stack 已啟,**When** `curl -fsS http://127.0.0.1:11082/v1/route/getConstantRoutes`(透過 host port forward),**Then** HTTP 200(W-F7 1XXXX 規約對齊、host 機可直連)

---

### User Story 2 — JWT secret + DATABASE_URL + REDIS_PASSWORD 走 `_FILE` pattern(Priority: P1)

**Goal**:nestjs container 從 docker secrets(`/run/secrets/jwt_secret` / `database_url` / `redis_password` / `refresh_token_secret`)讀 4 個 secret、bridge 成 env var 給 nestjs application、不洩 plaintext 到 container env / compose yaml / image layer。

**Why this priority**:

對齊 W-F4 secret-injection 紀律(全 stack 一致)、避免 plaintext password 洩 docker config / `docker inspect` / image layer。

**Acceptance Scenarios**:

1. **Given** stack 已啟,**When** `docker compose exec nestjs sh -c 'env | grep -cE "^(JWT_SECRET|REFRESH_TOKEN_SECRET|DATABASE_URL|REDIS_PASSWORD)="'`,**Then** ≥ 4(4 個 secret 都成功 bridge 進 env)
2. **Given** stack 已啟,**When** `docker compose exec nestjs sh -c 'echo -n $JWT_SECRET | wc -c'`,**Then** = 64(對齊 `deploy/secrets/jwt_secret.txt` 64 chars hex)
3. **Given** stack 已啟,**When** `docker inspect rev1-admin-nestjs-1 | grep -iE "jwt_secret|password|database_url"`,**Then** 只顯示 `_FILE` path、不顯示 plaintext value

---

### User Story 3 — nestjs 共享 rev1 postgres + sys_tokens schema acceptance verify(Priority: P2)

**Goal**:nestjs container 從 `DATABASE_URL_FILE` 拿到 rev1 既有 postgres connection string、connect 成功;sys_tokens 表存在於 `soybean_admin_rust` DB(rust-api migration 落、F10 預埋驗證點)。

**Why this priority**:

對齊 DESIGN-A §6 F10 設計 intent「sys_tokens 共識」;F10 application 邏輯接手時 nestjs prisma client 須能 access 同 schema。W-FA1 範疇驗 connectivity + schema 存在、不驗 application read/write。

**Acceptance Scenarios**:

1. **Given** stack 已啟,**When** `docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens"`,**Then** sys_tokens 表 schema 顯示(若 rust-api migration 未落 sys_tokens schema、W-FA1 acceptance 降級為驗 nestjs connect DB 成功、F10 follow-up 加 sys_tokens migration)
2. **Given** stack 已啟,**When** `docker compose logs nestjs --tail 50`,**Then** 無 `connection refused` / `ENOTFOUND postgres` / `auth failed for user soybean` 等 connection error
3. **Given** stack 已啟,**When** nestjs 跑時 healthcheck PASS(隱含 DB connect 成功),**Then** US3 通過(不額外手動測 DB query)

---

### User Story 4 — nestjs healthcheck endpoint 機制(Priority: P2)

**Goal**:nestjs container 內 healthcheck 透過 `/v1/route/getConstantRoutes` 業務 endpoint 驗 application boot success(對齊 nestjs fork 自帶 compose 慣例)、`depends_on` 機制可用此 health 狀態。

**Why this priority**:

W-FA2 nginx routing 落地時 `upstream nestjs_transitional { server nestjs:9528; }` 需 health 狀態判可用性;若 W-FA1 healthcheck 不可信、W-FA2 stack 起動鏈會卡。

**Acceptance Scenarios**:

1. **Given** stack 已啟、nestjs 啟動完成,**When** `docker compose ps`,**Then** nestjs STATUS 為 `(healthy)`
2. **Given** stack 啟動中(start_period 60s 內),**When** `docker compose ps`,**Then** nestjs STATUS 為 `(starting)` 直到 healthcheck PASS
3. **Given** stack 已啟,**When** `docker inspect rev1-admin-nestjs-1 | jq '.[0].State.Health'`,**Then** `Status: healthy` + `FailingStreak: 0`

---

### User Story 5 — DESIGN-B 形態下 nestjs 不啟動(Priority: P3)

**Goal**:不帶 `--profile track-a` flag 啟 stack、nestjs 自動不啟、保持 DESIGN-B 形態(6 service)。

**Why this priority**:

DESIGN-W §11.5 line 354-358 明示「DESIGN-A → DESIGN-B 遷移:移除 nestjs service 條目即可、其他 service 不變」+「DESIGN-B = 不啟用 track-a profile」;W-FA1 必須驗 profile 機制 work、否則 DESIGN-A / DESIGN-B 切換失效。

**Acceptance Scenarios**:

1. **Given** docker-compose.yml 含 nestjs service(profile=track-a),**When** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`(不帶 `--profile track-a`),**Then** `docker compose ps` 只顯示 6 個 service(postgres / redis / migration / rust-api / base-web / front-nginx)、無 nestjs
2. **Given** DESIGN-B 啟動,**When** `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --services | grep nestjs`,**Then** 結果為空 / exit code 1

---

### User Story 6 — base-web / rust-api / 既有 W-F* 零回歸(Priority: P2)

**Goal**:W-FA1 加 nestjs service 不影響既有 6 service 行為、F6 / F5.1 既有 browser login 流程仍 PASS、base-web src / rust-api src / nestjs fork src 三邊零改動。

**Why this priority**:

W-FA1 是「加 service」、不改既有 wiring、Constitution Principle IV 守邊界。回歸驗證是 deploy feature 標配。

**Acceptance Scenarios**:

1. **Given** W-FA1 落地後 stack 啟動(可選 track-a profile),**When** F6 browser login acceptance 跑(`POST /api/auth/login` Soybean/123456 + `GET /api/auth/getUserInfo`),**Then** 全 PASS、不受 nestjs 啟動與否影響
2. **Given** W-FA1 落地,**When** `git diff HEAD~1 -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/`,**Then** 無輸出
3. **Given** stack 已啟、含 / 不含 track-a profile,**When** `curl -fsS http://127.0.0.1:11080/health`(front-nginx self),**Then** HTTP 200(W-F5 既有 health endpoint)

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `refresh_token_secret.txt` 不存在(secret 沒備) | entrypoint fallback 用 JWT_SECRET、nestjs 啟動仍成功(W-FA1 落地過渡)|
| E-2 | `jwt_secret.txt` 不存在 | nestjs container 啟動 fail(secret required、無 fallback);docker compose 顯示 error;W-FA1 acceptance prereq 已備齊 5 secret 含可選 6th refresh_token_secret |
| E-3 | rev1 postgres 不 healthy / nestjs 啟動 race | `depends_on: postgres: service_healthy` 確保等 postgres 起完才起 nestjs |
| E-4 | rev1 migration init container fail | `depends_on: migration: service_completed_successfully` 確保 migration exit 0 才起 nestjs;若 migration fail、nestjs 不啟、stack 啟動整體 fail(預期行為)|
| E-5 | nestjs container 內 `node main.js` crash | healthcheck fail 後 `restart: unless-stopped` 自動重啟;若連續 fail(retries=5)docker compose `--wait` 會 exit 1 |
| E-6 | DESIGN-A → DESIGN-B 遷移 | 移除 nestjs service 條目 + 移除 `refresh_token_secret` secret 條目 + 移除 host port 條目(W-F7 對應 line)= 3 處改動;profiles 機制不需立刻刪 service 條目、純不帶 `--profile track-a` 即不啟 |
| E-7 | nestjs healthcheck `/v1/route/getConstantRoutes` 在 nestjs fork upstream rebase 後改 path | acceptance fail、屬 nestjs fork upstream drift、W-FA1 不負責 future-proof;follow-up feature 或 healthcheck endpoint pin 處理 |
| E-8 | dev stack 11082 port 與 host 既有 process conflict | docker compose 啟動 fail `bind: address already in use`;operator 處理(殺占用 process 或改 W-FA1 host port);per W-F7 既有 conflict 處理慣例 |
| E-9 | nestjs alpine image curl 缺漏(healthcheck depends curl) | fork Dockerfile line 21 已 `RUN apk --no-cache add curl`、healthcheck 可用 |
| E-10 | nestjs Casbin model `model.conf` 從 nestjs fork build 內 / 不存在 | nestjs source `apps/base-system/src/lib/config/` 已含 model.conf reference;W-FA1 不負責驗 Casbin 行為(F10/F11 範疇)|

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: W-FA1 MUST 加 1 個 `nestjs` service 條目到 `docker-compose.yml`、含 `profiles: ["track-a"]`(對齊 DESIGN-W §3.4-A 草稿 + Q1-Q4 修正)。
- **FR-002**: nestjs service `image` MUST 指 `nestjs:${NESTJS_IMAGE_TAG:-rev1-admin-nestjs}`、build context 為 `fork260509-soybean-admin-nestjs/backend/`、Dockerfile 為 fork 既有 `backend/Dockerfile`(Q2)。
- **FR-003**: nestjs container `entrypoint` MUST 用 `sh -c` wrapper 從 `_FILE` secret bridge 成 env var(per Q2 不動 nestjs source 自然推論);必含 4 個 export:`JWT_SECRET` / `REFRESH_TOKEN_SECRET`(可 fallback JWT_SECRET)/ `DATABASE_URL` / `REDIS_PASSWORD`,最後 exec nestjs 既有 production 啟動點(`node dist/apps/base-system/src/main`、對齊 nestjs fork package.json `start:prod`)。
- **FR-004**: nestjs container `secrets:` MUST 含 `jwt_secret` / `database_url` / `redis_password` / `refresh_token_secret`(per W-F4 _FILE pattern + 新增 refresh_token_secret)。
- **FR-005**: W-FA1 MUST 新增 secret 對:`deploy/secrets/refresh_token_secret.txt`(gitignored、本機備)+ `deploy/secrets/refresh_token_secret.txt.example`(tracked);若機器 `.txt` 缺、entrypoint fallback 用 `JWT_SECRET`、不阻塞 W-FA1 落地。
- **FR-006**: `docker-compose.yml` `secrets:` section MUST 加 `refresh_token_secret:` 條目對齊 W-F4 既有 5 個 secret 格式(`file: deploy/secrets/refresh_token_secret.txt`)。
- **FR-007**: nestjs `depends_on` MUST 含 `migration: service_completed_successfully` + `postgres: service_healthy` + `redis: service_healthy`(對齊 W-F3 既有 rust-api depends_on 模式)。
- **FR-008**: nestjs `healthcheck` MUST 走 `curl -fsS http://localhost:9528/v1/route/getConstantRoutes`(對齊 nestjs fork 自帶 healthcheck 慣例)、`interval: 10s` `timeout: 5s` `retries: 5` `start_period: 60s`。
- **FR-009**: nestjs `networks` MUST 為 `internal`(對齊 W-F3 既有 internal network)。
- **FR-010**: nestjs `restart` MUST 為 `unless-stopped`(對齊 W-F3 既有 long-running service restart policy)。
- **FR-011**: `docker-compose.dev.yml` MUST 加 nestjs service override 含 `ports: "127.0.0.1:11082:9528"`(rev1 1XXXX 規約、loopback only、避開既有 host port)。
- **FR-012**: `docker-compose.prod.yml` MUST 加 nestjs service override(目前範疇:無 ports;留 W-FA2 落地時加 internal routing、不從 host 暴露);可為空 service block 或最簡 placeholder。
- **FR-013**: `CLAUDE.md` §5.2 / §5.2.1 MUST 更新 dev/prod 啟動命令範例加 track-a profile 變體(對齊 W-F6 / W-F7 multi-mode 啟動文件慣例)。
- **FR-014**: `docs/INTEGRATION-CHECKLIST.md` MUST 加 W-FA1 row 進 Phase W roadmap 表(若已有 W-FA row、加 ✅;若無、新增 P7 Track-A 段)+ Current Focus 更新 + 已完成里程碑加 W-FA1 條目。
- **FR-015**: W-FA1 MUST 為 **單段 commit**(對齊 W-F1~W-F7 慣例、只動 outer repo)— `docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.prod.yml` + `deploy/secrets/refresh_token_secret.txt.example` + `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` 同一 commit。
- **FR-016**: nestjs image build MUST 透過 `DOCKER_BUILDKIT=1 docker build -f fork260509-soybean-admin-nestjs/backend/Dockerfile -t nestjs:rev1-admin-nestjs fork260509-soybean-admin-nestjs/backend/`(對齊 W-F1 rust-api / W-F2 base-web image build 紀律、build-arg / cache mount 自動由 fork Dockerfile 處理)。
- **FR-017**: nestjs MUST 沿用 rev1 既有 `internal` network(同 rust-api / base-web / postgres / redis / front-nginx)、與 rev1 stack 內 hostname-based service discovery 對齊(`postgres` / `redis` 直接 hostname 解析)。
- **FR-018**: nestjs fork source(`fork260509-soybean-admin-nestjs/`)任何檔案 MUST 零改動(per Constitution Principle IV 延伸 + Q2);base-web `src/` 任何檔案 MUST 零改動;rust-api worktree 任何檔案 MUST 零改動。
- **FR-019**: W-FA1 MUST 不跑 nestjs 自帶 prisma migrate / db seed(per Q4)— compose 不加 nestjs db-init service、nestjs runtime 不 invoke prisma migrate;sys_tokens schema 對齊驗交給 acceptance 階段 manual SQL(per FR-021)。
- **FR-020**: W-FA1 MUST 不引入 nginx routing(per W-FA2 範疇)、不引入 Casbin pub-sub 訂閱(per F10 範疇)、不寫 application 邏輯(per F10 範疇)。
- **FR-021**: W-FA1 acceptance MUST 含 `docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens"` 確認 sys_tokens 表存在(若不存在、acceptance 階段降級為「驗 nestjs connect DB 成功 + 留 F10 follow-up」)。
- **FR-022**: nestjs container environment MUST 含 application-level env(`TZ=Asia/Shanghai` / `NODE_ENV=production` / `APP_PORT=9528` / `REDIS_HOST=redis` / `REDIS_PORT=6379` / `REDIS_DB=0` / `JWT_EXPIRE_IN=3600` / `REFRESH_TOKEN_EXPIRE_IN=7200` / `CASBIN_MODEL=model.conf` / `DOC_SWAGGER_ENABLE=false`)— 對齊 nestjs fork 自帶 compose env 設置、`DOC_SWAGGER_ENABLE` 預設 `false`(prod-safe);`REDIS_DB=0` 共享 rev1 redis db 0(避開 nestjs fork 自帶 db 1、不衝突)。

### Non-Functional Requirements

- **NFR-001**: nestjs image size SHOULD ≤ 500MB(對齊 nestjs fork 既有 alpine + node 20 multi-stage 預期、實際看 fork Dockerfile build result)。
- **NFR-002**: nestjs container 啟動到 healthy SHOULD ≤ 90s(`start_period: 60s` + 1-2 個 healthcheck cycle、考慮 prisma client init + nest app boot 時間)。
- **NFR-003**: nestjs runtime memory usage SHOULD ≤ 512MB(對齊 nestjs typical NestJS+Fastify+Prisma footprint、與 rust-api ~30MB 對比 acceptable 因 transitional)。
- **NFR-004**: W-FA1 spec / plan / tasks 規模 SHOULD 與 W-F6 / W-F7 同量級(brainstorm + spec-kit 5 phase + ~25-35 task、~10 個檔案改動)。
- **NFR-005**: docker compose `--profile track-a` 啟動相比不帶 profile SHOULD 額外 +60-90s 完成 healthy(對齊 NFR-002 nestjs start_period)。

### Key Entities

- **`docker-compose.yml` nestjs service block**(新增)— ~30 行 yaml、profile=track-a、4 secrets ref、entrypoint sh wrapper、healthcheck、depends_on 3 service、restart policy
- **`docker-compose.yml` `secrets:` section refresh_token_secret 條目**(新增)— ~2 行 yaml、`file: deploy/secrets/refresh_token_secret.txt`
- **`docker-compose.dev.yml` nestjs ports override block**(新增)— ~3 行 yaml、`127.0.0.1:11082:9528`
- **`docker-compose.prod.yml` nestjs override block**(新增 or 空)— ~1-3 行 yaml(若必要 override prod env 才寫、可空 placeholder)
- **`deploy/secrets/refresh_token_secret.txt`**(新增、gitignored)— refresh token signing secret、本機備、可空(entrypoint fallback JWT_SECRET)
- **`deploy/secrets/refresh_token_secret.txt.example`**(新增、tracked)— example placeholder 對齊既有 4 個 secret example 風格
- **`CLAUDE.md` §5.2 / §5.2.1**(改)— 加 track-a profile 啟動命令範例 + port 11082 條目
- **`docs/INTEGRATION-CHECKLIST.md`**(改)— W-FA1 row ✅ + Current Focus 更新 + 已完成里程碑加 W-FA1 條目
- **nestjs image `nestjs:rev1-admin-nestjs`**(build 產出、不 track-able artifact)— W-FA1 範疇 build 出來、未 push registry(留 W-FA3 cicd-nestjs-build-job)
- **fork260509-soybean-admin-nestjs/**(不改、純 build context source)
- **rust-api / base-web worktree**(不改、per FR-018)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait` 退出 0、`docker compose ps` 7 service 全 `(healthy)`(含 nestjs);耗時 ≤ NFR-002 + 既有 6 service 啟動時間(預期 ≤ 180s cold start、≤ 90s warm cache)。
- **SC-002**: 不帶 `--profile track-a` 啟 stack → `docker compose ps` 6 service、無 nestjs(SC-001 + SC-002 互為對照、確認 profile 機制 work)。
- **SC-003**: `docker compose exec nestjs sh -c 'env | grep -cE "^(JWT_SECRET|REFRESH_TOKEN_SECRET|DATABASE_URL|REDIS_PASSWORD)="'` ≥ 4(4 個 secret 都成功 bridge 進 env)。
- **SC-004**: `docker compose exec nestjs sh -c 'echo -n $JWT_SECRET | wc -c'` = 64(對齊 rev1 jwt_secret.txt 64 chars hex)。
- **SC-005**: `docker compose config | grep -iE "<actual_jwt_secret_first_8_chars>"` 無 hit(plaintext secret 不洩到 config output、純 `_FILE` reference)。
- **SC-006**: F6 browser login acceptance(via CDP or 手動瀏覽器)在 W-FA1 落地後仍 PASS(F6 + F5.1 不受 W-FA1 影響、SC-006 = regression verify)。
- **SC-007**: `git diff HEAD~1 -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 無輸出(per FR-018 三邊零改動)。
- **SC-008**: `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a up -d --wait` 退出 0(prod baseline 也 work、雖未實際 prod 部署、語法 / 結構 sanity)。
- **SC-009**: nestjs healthcheck `curl -fsS http://localhost:9528/v1/route/getConstantRoutes` 從 nestjs container 內跑回 200。
- **SC-010**: W-FA1 為單段 commit(對齊 W-F1~W-F7 慣例)— `git log --oneline -1` 應為 W-FA1 主要落地 commit、無「兩段式」紀律。

## Assumptions

- **A-001**: nestjs fork repo `fork260509-soybean-admin-nestjs/` 在本機 ready(per CLAUDE.md §2 列出的 4 個 fork 源倉之一、本機必留);未來新機器設置時需 clone(屬 §2 既有設置紀律)。
- **A-002**: nestjs fork repo `backend/Dockerfile` 可正常 build(alpine + node 20 + pnpm 9.1.2 + prisma generate + nest build base-system);若 build 失敗、W-FA1 範疇內處理(可能需 build-arg `NODE_VERSION` / `PNPM_VERSION` 對齊、或 pnpm-lock.yaml 鎖定 / 等)。
- **A-003**: nestjs fork repo `apps/base-system/src/main.ts` 為 main entry(對齊 package.json `start:prod` 啟動點);若 nestjs upstream rebase 後改 entry、W-FA1 entrypoint wrapper 需對齊。
- **A-004**: nestjs 接受 `DATABASE_URL` 一個 env 就能 connect postgres(prisma 標準慣例);不需另設 `DB_HOST` / `DB_PORT` 等分散 env。
- **A-005**: nestjs `REDIS_HOST` + `REDIS_PORT` + `REDIS_PASSWORD` + `REDIS_DB` 4 個 env 可正常 connect rev1 redis(對齊 nestjs fork 自帶 compose 慣例 + W-FA1 加 REDIS_DB=0 共享 rev1 db 0)。
- **A-006**: nestjs 啟動時不會嘗試 prisma migrate(production NODE_ENV 下 prisma client 預設不 auto-migrate;若 nestjs application code 內 call `prisma.$migrate()` runtime、W-FA1 acceptance 會發現 schema 衝突、屬 follow-up)。
- **A-007**: `model.conf`(Casbin model file)在 nestjs fork repo build context 內、image 含此檔(對齊 nestjs fork 既有 compose `CASBIN_MODEL: "model.conf"` 慣例)。
- **A-008**: rev1 stack 內 `internal` network 名稱對應 `rev1-admin_internal`(由 `COMPOSE_PROJECT_NAME` 衍生)、nestjs hostname-based discovery(`postgres` / `redis`)可解析。
- **A-009**: rev1 deploy/secrets/jwt_secret.txt 64 chars hex 格式與 nestjs 「string env」直接相容(nestjs 不 base64 decode / hex decode、直接當 HMAC string key);若 JWT cross-sign / verify 不通、屬 F10 範疇 debug。

## Dependencies

### Inbound(本 feature 依賴)

- **W-F1** `dockerfile-rust-api`:rev1 image tagging convention(`<service>:rev1-admin-<service>`)、healthcheck pattern(curl + endpoint)、non-root user 紀律。✅(merge `430ada9`)
- **W-F2** `dockerfile-base-web`:跨源倉 Dockerfile build context 慣例(沿用 source repo Dockerfile)。✅(merge `ac79ed0`)
- **W-F3** `compose-base-structure`:`docker-compose.yml` 主結構、`internal` network、`depends_on` 機制、`healthcheck` 模式、`restart` policy。✅(merge `04671d0`)
- **W-F4** `secret-injection`:`_FILE` pattern + `deploy/secrets/` 結構 + `.example` 慣例 + 5 個既有 secret(jwt_secret / database_url / redis_url / postgres_password / redis_password)。✅(merge `ab658d7`)
- **W-F8** `db-migration-init-container`(effective、W-F3 涵蓋):rust-api migration init container 已就位、`service_completed_successfully` 可用。✅(W-F3 落地、未獨立 spec-kit)
- **F1.1** `jwt-secrets`:rev1 `jwt_secret.txt` 64 chars hex 格式、`_FILE` pattern reading helper(rust-api 已實作、nestjs 透過 entrypoint wrapper bridge)。✅(merge `5f82df3`)
- **F5.1** `auth-login-and-dynamic-menu`(包 2026-05-18 follow-up patch):rust-api login flow / sys_user 預設帳號 / Soybean/123456。✅(merge `e71aefe` + follow-up `1bdbc2f`)

### Outbound(本 feature 解鎖)

- **W-FA2** `nginx-track-a-transitional-block`:nginx `track-a.inc` upstream `nestjs:9528` routing、`/api/auth/refreshToken` → nestjs upstream。需 W-FA1 落地後 nestjs service hostname 可解析。
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build pipeline(從 nestjs fork repo)、push registry、tag convention。需 W-FA1 落地後 image tag convention 確認。
- **F10** `refresh-token-nestjs-bridge`:nestjs application 改 sys_tokens prisma model 對齊 + refreshToken endpoint 實作 + Casbin pub-sub channel 訂閱 + W-F4 `_FILE` pattern 原生對齊(移除 entrypoint wrapper)。

## Out of Scope

- **OOS-001**: nestjs application source code 改動(refreshToken endpoint / Casbin pub-sub / prisma model 對齊 / W-F4 _FILE 原生對齊)— F10 範疇。
- **OOS-002**: nginx `track-a.inc` upstream routing — W-FA2 範疇。
- **OOS-003**: nestjs image push to container registry — W-FA3 範疇(W-FA1 純 local image build、不 push)。
- **OOS-004**: nestjs db-init container(prisma migrate deploy + db seed)— per Q4 拍板不引入。
- **OOS-005**: sys_tokens schema 由 rust-api migration 落 — F10 範疇(W-FA1 acceptance 階段 verify 表存在、若不存在降級為「驗 connectivity」)。
- **OOS-006**: nestjs fork repo 升級 / rebase upstream / nestjs version 跳版 — 屬 fork 維護紀律、W-FA1 純沿用既有 fork 狀態。
- **OOS-007**: nestjs frontend image / service — DESIGN-A track-a 範疇只含 nestjs **backend**(refreshToken bridge 載體)、nestjs frontend 屬 nestjs fork 自帶 demo 不在 rev1 整合範疇。
- **OOS-008**: nestjs API doc / swagger 啟用 — W-FA1 prod 預設 `DOC_SWAGGER_ENABLE=false`、dev 可後續調(屬 documentation feature 範疇)。
- **OOS-009**: nestjs Casbin policy seed — DESIGN-A 設計 intent 是 rust-api 主導 Casbin policy(F5.1 m20260515_a_f51_minimum_seed 已落)、nestjs 透 redis pub-sub 同步;W-FA1 不涉 Casbin policy。
- **OOS-010**: nestjs 跨 instance horizontal scaling — DESIGN-A 短期 transitional、不需多 instance;W-F11 observability + scaling 範疇也以 rust-api 為主、nestjs DESIGN-B 退場前不投資 scaling。
- **OOS-011**: nestjs fork repo worktree+submodule 化 — 對齊 base-web/rust-api 模式但 nestjs transitional 不投資 worktree overhead;若未來需要(unlikely)再開 follow-up feature。
