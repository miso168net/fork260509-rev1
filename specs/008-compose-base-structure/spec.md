# Feature Specification: W-F3 — compose-base-structure

**Feature Branch**: `008-compose-base-structure`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "for W-F3 compose-base-structure — 把 W-F1 rust-api image + W-F2 base-web image + postgres + redis 組成 docker-compose 配置(per DESIGN-W §3)"

**Source**: Direct from [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §3(W-F3 跳過 brainstorm 階段、由 user 直接 `/speckit-specify`、DESIGN-W §3 為 authoritative source;不像 W-F1/W-F2 有 docs/superpowers/00X-feature-...md brainstorm doc)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §3.1(17 共用 service 集合 — W-F3 取核心 5 個)、§3.2(networks + volumes 結構)、§3.3(depends_on + healthcheck 樣式)、§3.4-A(Track DESIGN-A nestjs 多一 service、留 W-FA1)、§3.4-B(Track DESIGN-B 無 nestjs)、§11.1(W-F3 scope 描述)、§11.2(W-F P1 必先 4 個依賴序)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I-V + 12 架構約束、包括「快取與 pub-sub:redis 必要依賴」、「Secret 注入:Docker secrets + `_FILE` pattern 為 prod 預設」、「DB migration trigger:init container 模式」、「部署形態:docker-compose 單機部署」)
- [`specs/006-dockerfile-rust-api/`](../006-dockerfile-rust-api/)(W-F1 rust-api image 提供 contract、本 feature 引用 — image 屬性 + /health endpoint + APP_SERVER_PORT=11081)
- [`specs/006-dockerfile-rust-api/contracts/dockerfile-structure.md`](../006-dockerfile-rust-api/contracts/dockerfile-structure.md) C-D7 image 屬性 contract(ENTRYPOINT / EXPOSE / USER / /health)
- [`specs/007-dockerfile-base-web/`](../007-dockerfile-base-web/)(W-F2 base-web image 提供 contract、本 feature 引用 — image 屬性 + /health endpoint + EXPOSE 8080)
- [`specs/007-dockerfile-base-web/contracts/dockerfile-structure.md`](../007-dockerfile-base-web/contracts/dockerfile-structure.md) C-D7 image 屬性 contract

## Clarifications

### Session 2026-05-15(spec-kit `/speckit-clarify` 階段拍板)

- **Q1**: postgres image version 用 DESIGN-W §3.1 草稿的 `postgres:16-alpine` 還是既有 `rust-api/compose.yaml` + W-F1 acceptance T040 驗過的 `postgres:17.4`? → **A: `postgres:17.4`**(沿用既有 + W-F1 verified)。理由:W-F1 acceptance T040 minimal stack 已驗 8 條 sea-orm migration + 3 個 default user seed + casbin policy 全跑通;DESIGN-W §3.1 為早期設計草稿、實際使用過的版本是 17.4;切回 16 增加未驗證風險;最新 major(EOL 2029)。代價接受 image 比 alpine 大 ~70MB(全 stack 維度可忽略)。

- **Q2**: redis image variant 用 DESIGN-W §3.1 草稿的 `redis:7-alpine` 還是既有 + W-F1 verified 的 `redis/redis-stack:7.4.0-v3`? → **A: `redis/redis-stack:7.4.0-v3`**(沿用既有 + W-F1 verified)。理由:同 Q1 邏輯,W-F1 acceptance 已驗 redis-stack 在 rust-api 起、casbin policy load、nonce store 全 OK;Redis Stack 為 superset 不會少功能(RedisJSON / RediSearch / RedisTimeSeries / RedisBloom modules 全含);rev1 暫不用 modules、但未來如要不需換 image。代價接受 ~120MB(vs vanilla alpine ~30MB)。

- **Q3**: W-F3 是否暴露 host port? CLAUDE.md §5.2 rev1 提議 host port 15432/16379/11081/8080 對外可達(dev 直連 debug),但 spec FR-024 + Dimension C scenario 11 + SC-004 紀錄 W-F3 不暴露 host port(留 W-F7)。 → **A: 嚴守 W-F7 邊界、W-F3 完全不開 host port**。dev 連 DB / redis / rust-api / base-web 走 `docker compose exec <svc> <cmd>`;對外暴露是 W-F7 完整議題(含 11080→front-nginx reverse proxy + 各別 service host port forwarding)。`COMPOSE_PROJECT_NAME=rev1-admin` 透過 `.env` 設定(影響 container/volume/network 命名 prefix、per CLAUDE.md §5.2)、但**不暴露任何 host port**。Constitution 架構約束「不暴露 host port(除 front-nginx)」對齊。

**Scope summary**:rev1 deploy 階段第三個 feature — 建立 `docker-compose.yml` 主檔將 W-F1 rust-api image + W-F2 base-web image + postgres + redis(+ migration init container)組成可運行的單機部署 stack。範圍刻意收緊到 **5 個 core service**(per DESIGN-W §3.1 17 個中的核心子集),其他 service(front-nginx、cleanup-job、outbox-worker、backup、acme、observability stack 7 個、Track DESIGN-A nestjs)全留後續 W-F feature(W-F5 / W-F9 / W-F10 / W-F12-15 / W-FA1)。Networks 走 `internal` bridge、Volumes named(`postgres_data` + `redis_data`)、Depends_on + healthcheck per DESIGN-W §3.3。Secret 注入採 W-F3 過渡簡化模式(`environment:` 帶 `${VAR}` 或 F1.1 `APP_JWT_JWT_SECRET` 直接 env),完整 `_FILE` pattern 留 **W-F4 secret-injection** 升級。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 在乾淨 docker 環境用 `docker compose up -d` 起完整 rev1 deploy stack(Priority: P1,唯一 US)🎯 MVP

operator 在 outer repo root 執行 `docker compose up -d`,docker-compose 依 `docker-compose.yml` 結構啟動 5 個 service:**postgres**(健康檢查 `pg_isready` 跑通)→ **redis**(`redis-cli ping` 跑通)→ **migration**(rust-api image 用 `/usr/local/bin/migration` entrypoint 跑 sea-orm migrations,`restart: no`,完成後 `service_completed_successfully` 條件達成)→ **rust-api**(W-F1 image,等 migration 完 + postgres healthy + redis healthy 才啟動,自身 healthcheck `curl -f http://localhost:11081/health` 跑通)+ **base-web**(W-F2 image,nginx serve SPA on `:8080`,healthcheck `curl -f http://localhost:8080/health` 跑通)。5 個 service 全在 `internal` bridge network 上通信、無對外 host port 暴露(對外 port forwarding 由 W-F7 處理)。`docker compose ps` 顯示 5 service 全 `Up (healthy)` 或 migration `Exited (0)`。operator 透過 `docker compose exec rust-api curl http://localhost:11081/health` / `docker compose exec base-web curl http://localhost:8080/health` 從容器內部驗證健康。

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F3 的 5 個交付片段(`docker-compose.yml` 主檔 / 5 個 service 定義 / `internal` network + 2 個 named volume / depends_on + healthcheck 串接 / 環境 / 端口配置)**並非獨立可交付**:

- 單獨寫 compose 檔但無 healthcheck 串接 → rust-api 啟動可能比 migration 早、首次啟動可能 race condition
- 單獨設 healthcheck 但無 depends_on condition → 起動順序不可控
- 單獨建 service 但無 network 配置 → service 互相找不到對方
- 單獨設 volume 但無 service 使用 → postgres 資料不持久
- 單獨跑 `docker compose up` 但 5 個 service 不齊 → 啟動失敗

W-F3 是 **rev1 deploy P1 4 個 feature 第三片**(W-F1 image + W-F2 image 已就緒、W-F3 將兩個 image 與 DB/cache 組合成可運行 stack、W-F4 把 secret pattern 完整化)。5 個片段是同一 atomic deploy increment 的協同 dimensions。

**Independent Test**:`docker compose up -d` + `docker compose ps` + `docker compose exec` 系列命令在乾淨 docker host 環境跑通。**比 W-F1/W-F2 多需 minimal env vars**(postgres 密碼 / redis 密碼 / jwt secret),W-F3 範疇用 simple env(`environment:` 列出 + `.env.example` 模板供 user 複製為 `.env` 自填),完整 `_FILE` secrets 留 W-F4。

**Acceptance Scenarios**:

#### Dimension A — Compose 結構 + service 集合(FR-001 ~ FR-005)

1. **Given** 乾淨 docker host + 已 build `rust-api:test` / `base-web:test` local image(W-F1/W-F2 已完成),**When** `cd <outer-repo> && cp .env.example .env && (edit .env 填 secret)` + `docker compose up -d`,**Then** exit 0、output 顯示 5 service 啟動(postgres / redis / migration / rust-api / base-web)
2. **Given** stack 啟動完成,**When** `docker compose ps --format '{{.Name}} {{.Status}}'`,**Then** 5 lines:`postgres Up X(healthy)` / `redis Up X(healthy)` / `migration Exited(0)` / `rust-api Up X(healthy)` / `base-web Up X(healthy)`(5/5 預期狀態)
3. **Given** stack 啟動完成,**When** `docker compose config`(渲染最終 compose 結構),**Then** 含 5 service + 1 network(`internal`)+ 2 volumes(`postgres_data` / `redis_data`)、無 unresolved env / syntax error

#### Dimension B — Healthcheck + depends_on 串接(FR-006 ~ FR-010)

4. **Given** stack 從乾淨狀態啟動,**When** 觀察 `docker compose logs migration`,**Then** migration 在 postgres healthy 後才開始(`pg_isready` 通)、跑完 sea-orm migrations 後 exit 0
5. **Given** stack 從乾淨狀態啟動,**When** 觀察 rust-api 啟動順序,**Then** rust-api **不**在 migration exit 0 之前啟動(per `service_completed_successfully` condition)
6. **Given** stack 啟動完成,**When** `docker compose exec rust-api curl -f http://localhost:11081/health`,**Then** 200 + body `ok`
7. **Given** stack 啟動完成,**When** `docker compose exec base-web curl -fsS http://localhost:8080/health`,**Then** 200 + body `ok`
8. **Given** stack 啟動完成,**When** 等 60 秒後 `docker inspect <rust-api-cid> --format '{{.State.Health.Status}}'`,**Then** `healthy`

#### Dimension C — Network + volume 持久化(FR-011 ~ FR-014)

9. **Given** stack 啟動完成,**When** `docker compose exec rust-api sh -c 'getent hosts postgres'`,**Then** 解析到 postgres container IP(內部 DNS、`internal` network 通)
10. **Given** stack 啟動完成 + 寫一些 audit log 到 postgres,**When** `docker compose down`(不 `-v`)+ 再 `docker compose up -d`,**Then** postgres `sys_operation_log` 表仍含先前資料(volume `postgres_data` 持久)
11. **Given** stack 啟動完成,**When** 從 host 跑 `nc -zv localhost 5432` / `nc -zv localhost 6379` / `nc -zv localhost 11081` / `nc -zv localhost 8080`,**Then** **全部 connection refused / timeout**(W-F3 不對外暴露 host port、對外 port forwarding 屬 W-F7 範疇)

#### Dimension D — Secret + env 配置(FR-015 ~ FR-017)

12. **Given** `outer-repo/.env.example` 範本,**When** grep 其內容,**Then** 含至少 4 個 env var 範例:`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `APP_JWT_JWT_SECRET`、且有 `# replace with ...` 註解提示
13. **Given** 不設 `APP_JWT_JWT_SECRET` env(.env 不存在或漏設),**When** `docker compose up -d`,**Then** rust-api 啟動 panic(per F1.1 strict validation)、compose 不會 ready
14. **Given** 設正確 `APP_JWT_JWT_SECRET=$(openssl rand -hex 32)` + 其他 env,**When** stack 跑通 + `docker compose exec rust-api curl -f http://localhost:11081/health`,**Then** 200(secret 驗證通、server 可服務)

#### Dimension E — Cleanup 與 down 行為(FR-018 ~ FR-020)

15. **Given** stack 啟動完成,**When** `docker compose down`,**Then** 5 個 container 全停 + 移除、network `internal` 移除、volumes **保留**(postgres_data / redis_data 不刪)
16. **Given** `docker compose down` 完成,**When** `docker compose down -v`,**Then** volumes 也刪除(postgres_data / redis_data 清空)
17. **Given** stack 啟動完成,**When** `docker compose restart rust-api`,**Then** rust-api 重啟成功、其他 service 不受影響、healthcheck 重新通

### Edge Cases

- **postgres healthcheck retry 在啟動慢時不夠**:5 retries × 10s interval = 50s,若 postgres 啟動 > 50s(host 慢、image cold pull 後第一次啟動)→ migration 依賴條件 timeout、整 stack 起不來;緩解:接受 5 retries 為 reasonable default、慢 host 用 `docker compose up -d` 先等 1 分鐘再驗 `ps`
- **rust-api healthcheck 對 11081 但 W-F1 EXPOSE 11081 已對齊**:per W-F1 contracts C-D7、`APP_SERVER_PORT=11081` env override application.yaml 10001,W-F3 healthcheck 對 11081 正確
- **migration 失敗(DB schema 衝突 / 既有 partial migration)**:migration container exit non-zero、rust-api 依 `service_completed_successfully` 條件 wait 變 unmet → rust-api 不啟動 → compose 顯示 `dependency failed to start`;緩解:operator 手動 `docker compose down -v` 清 postgres volume 後重 up
- **secret 為 placeholder(`change-me`)**:W-F1 image 內 F1.1 strict validation 會 panic;`.env.example` 註解明示「MUST replace with `openssl rand -hex 32`」
- **internal network 名稱衝突**:`compose project name` 預設由目錄名衍生(`fork260509-rev1`)、`internal` network 變 `fork260509-rev1_internal`,通常不衝突;若 user 自設 `COMPOSE_PROJECT_NAME`(per CLAUDE.md §5.2 rev1 提議 `rev1-admin`)→ `rev1-admin_internal`
- **base-web 不依賴 rust-api / migration**:base-web 是 static SPA、無 runtime backend dep,可在 rust-api 起好前獨立啟動;compose 內 base-web `depends_on` 為空(per FR-009)
- **postgres healthcheck 內 `$$` escape**:per DESIGN-W §3.3 範例 `test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]` 用 `$$` 因 compose 解析 `$` 為變量、需 escape;確認語法正確
- **W-F1 image local tag vs registry**:本 W-F3 範疇 image ref 用 local build tag(`rust-api:rev1-admin-rust-api` / `base-web:rev1-admin-base-web`,W-F1/W-F2 already build),registry full path 留 W-F17

## Requirements *(mandatory)*

### Functional Requirements

#### A. Compose 結構 + service 集合

- **FR-001**: 新建 outer repo root 內 `docker-compose.yml`(W-F3 主交付檔)
- **FR-002**: `docker-compose.yml` MUST 含 5 service:`postgres` + `redis` + `migration` + `rust-api` + `base-web`(per DESIGN-W §3.1 17 個 service 集合的核心子集);**MUST NOT** 含 front-nginx / cleanup-job / outbox-worker / backup / acme / observability 7 個 / nestjs(留 W-F5 / W-F9 / W-F10 / W-F15 / W-F6 / W-F12-14 / W-FA1)
- **FR-003**: `postgres` service MUST 用 **`postgres:17.4`** image(per Q1 clarify 2026-05-15 拍板、沿用既有 `rust-api/compose.yaml` + W-F1 acceptance T040 verified)、傳 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 三個 env(從 outer-repo `.env` 載入)
- **FR-004**: `redis` service MUST 用 **`redis/redis-stack:7.4.0-v3`** image(per Q2 clarify 2026-05-15 拍板、沿用既有 `rust-api/compose.yaml` + W-F1 acceptance T040 verified)、設 `requirepass` 由 `REDIS_PASSWORD` env(從 outer-repo `.env` 載入)控制;Redis Stack 為 superset、含 RedisJSON / RediSearch / RedisTimeSeries / RedisBloom modules、rev1 階段只用 KV + pub-sub 基礎功能
- **FR-005**: `migration` / `rust-api` / `base-web` MUST 用 local image tag(per W-F1/W-F2 acceptance build 結果):`rust-api:rev1-admin-rust-api` 或 `rust-api:<short-sha>` 給 `migration` + `rust-api`、`base-web:rev1-admin-base-web` 或 `base-web:<short-sha>` 給 `base-web`(registry full path 留 W-F17 / `.env.example` 提供 `IMAGE_TAG` 變數預設值)

#### B. Healthcheck + depends_on 串接

- **FR-006**: `postgres` healthcheck MUST 用 `pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB`、`interval: 10s` / `timeout: 5s` / `retries: 5`(per DESIGN-W §3.3)
- **FR-007**: `redis` healthcheck MUST 用 `redis-cli -a $$REDIS_PASSWORD ping`(密碼 escape `$$`)、`interval: 10s`(per DESIGN-W §3.3)
- **FR-008**: `migration` MUST `depends_on.postgres.condition: service_healthy`、`restart: "no"`(一次性執行)、entrypoint override `["/usr/local/bin/migration"]` + command `["up"]`(per DESIGN-W §3.3 + W-F1 contracts C-D7 image 屬性);env 注入 **`APP_DATABASE_URL`**(per analyze remediation 2026-05-15 I1:rust-api 內 migration binary 用 `EnvConfigLoader` 讀 prefix `APP_` 的 env、`DATABASE_URL` 不適用;W-F1 acceptance T040 已 verified `APP_DATABASE_URL=postgres://...` 跑通 8 條 sea-orm migrations)
- **FR-009**: `rust-api` MUST `depends_on.migration.condition: service_completed_successfully` + `depends_on.postgres.condition: service_healthy` + `depends_on.redis.condition: service_healthy`、`restart: unless-stopped`、自身 healthcheck `curl -f http://localhost:11081/health`(per W-F1 spec.md AC-7 / FR-013、APP_SERVER_PORT=11081)
- **FR-010**: `base-web` MUST 自身 healthcheck `curl -f http://localhost:8080/health`(per W-F2 spec.md AC-7、EXPOSE 8080),**MUST NOT** `depends_on` 任何其他 service(static SPA、無 runtime backend dep)

#### C. Network + volume

- **FR-011**: `networks` 段 MUST 定義 1 個 bridge network `internal`(per DESIGN-W §3.2)
- **FR-012**: 5 個 service 都 MUST `networks: [internal]`(內部互通、無對外暴露)
- **FR-013**: `volumes` 段 MUST 定義 2 個 named volume:`postgres_data`(postgres 資料持久化)、`redis_data`(redis AOF/RDB 持久化);其他 6 個 volumes 留後續 feature(postgres_wal / loki_data / prometheus_data / grafana_data / acme_certs / backup_archive)
- **FR-014**: `postgres` service volume mount `postgres_data:/var/lib/postgresql/data`(per postgres image 預設 data dir)、`redis` service volume mount `redis_data:/data`(per redis image 預設 working dir)

#### D. Secret + env 配置

- **FR-015**: 新建 outer repo root 內 `.env.example`(W-F3 副交付檔、git-tracked、`.env` 由 user copy `.env.example` 編輯且 gitignored、`.gitignore` 須含 `/.env`)
- **FR-016**: `.env.example` MUST 含至少 6 個 env var 範例 + 註解:`COMPOSE_PROJECT_NAME=rev1-admin`(per CLAUDE.md §5.2、Q3 clarify、避免與 fork260509 既有 `new-admin` 衝突)/ `POSTGRES_USER=soybean` / `POSTGRES_PASSWORD=<change-me-strong-password>` / `POSTGRES_DB=soybean_admin_rust` / `REDIS_PASSWORD=<change-me-strong-password>` / `APP_JWT_JWT_SECRET=<replace with openssl rand -hex 32>` / `IMAGE_TAG=rev1-admin-rust-api`(或 `<short-sha>`)
- **FR-017**: `rust-api` service env MUST 注入(從 `.env` 載入):`APP_JWT_JWT_SECRET`(F1.1 strict validation 必要)、`APP_DATABASE_URL`(構造為 `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`)、`APP_REDIS_URL`(構造為 `redis://:${REDIS_PASSWORD}@redis:6379`);**W-F3 過渡簡化模式**:直接 `environment:` 帶 env、**NOT** `_FILE` pattern;W-F4 secret-injection 升級為 docker secrets `_FILE` pattern

#### E. Cleanup + down 行為

- **FR-018**: `migration` service `restart: "no"`(one-shot job、結束後不重啟)
- **FR-019**: `postgres` / `redis` / `rust-api` / `base-web` 4 個 service `restart: unless-stopped`(long-running service、host reboot 後自動起)
- **FR-020**: `docker compose down`(不 `-v`)MUST 保留 named volumes(postgres_data + redis_data),只清 containers + network;`docker compose down -v` MUST 同時刪除 volumes(operator 顯式選擇 wipe)

#### F. 範疇邊界保護

- **FR-021**: W-F3 **MUST NOT** 動 W-F1 rust-api image(per FR-005 image ref only、無 build context)、**MUST NOT** 動 W-F2 base-web image
- **FR-022**: W-F3 **MUST NOT** 動 nestjs service / Track DESIGN-A profile / track-a profile flag(留 W-FA1)
- **FR-023**: W-F3 **MUST NOT** 動 secret 完整 `_FILE` pattern(留 W-F4)、**MUST NOT** 動 docker `secrets:` top-level 段
- **FR-024**: W-F3 **MUST NOT** 動 front-nginx 反向代理(留 W-F5)、**MUST NOT** 動 TLS / acme(留 W-F6)、**MUST NOT** 動對外 host port forwarding(留 W-F7、5 個 service 全在 internal network、無 `ports:` 段)
- **FR-025**: W-F3 **MUST NOT** 動 observability stack(留 W-F12-14、`docker-compose.observability.yml` 不在本範疇)
- **FR-026**: W-F3 **MUST NOT** 動 backup / DR(留 W-F15-16)、**MUST NOT** 動 CI/CD pipeline(留 W-F17-18)
- **FR-027**: W-F3 **MUST NOT** 動 cleanup-job / outbox-worker(留 W-F9-10、即使 image 共用 rust-api 但 service 定義留後續)

### Key Entities *(include if data involved)*

- **docker-compose.yml**:本 W-F3 主交付檔。outer repo root、git-tracked、含 5 service + 1 network + 2 volume。
- **5 services**:postgres(DB)/ redis(cache)/ migration(one-shot init container,共用 rust-api image 不同 entrypoint)/ rust-api(W-F1 image,主後端)/ base-web(W-F2 image,SPA static serve)。
- **internal network**:1 個 bridge network、5 service 互通、無對外暴露。
- **2 named volumes**:postgres_data(`/var/lib/postgresql/data`)/ redis_data(`/data`)。
- **.env / .env.example**:.env.example(git-tracked,範本)/ .env(gitignored,user 編輯)。MUST 含 5 個 env(POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB / REDIS_PASSWORD / APP_JWT_JWT_SECRET)+ 可選 `IMAGE_TAG`。
- **APP_DATABASE_URL / APP_REDIS_URL**:由 docker-compose `environment:` 段內 `${VAR}` interpolation 從 .env 載入的 POSTGRES_USER 等構造、傳給 rust-api / migration 用。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在乾淨 docker host(W-F1/W-F2 image 已 build local)+ `.env` 含 5 個必要 env 變數,`docker compose up -d` 在 60 秒內完成 5 service 啟動(包括 postgres healthcheck pass + migration 跑完 + rust-api/base-web 進 healthy)
- **SC-002**: `docker compose ps` 顯示 5/5 service 預期狀態(4 long-running healthy + 1 migration exited 0)
- **SC-003**: `docker compose exec rust-api curl -f http://localhost:11081/health` 與 `docker compose exec base-web curl -f http://localhost:8080/health` 都返 200 + `ok`,p99 latency < 50ms(local docker network)
- **SC-004**: 不對外暴露 host port(per FR-012 + edge case 11),host 跑 `nc -zv localhost 5432/6379/11081/8080` 全 fail(rev1 deploy P1 階段 internal-only、對外暴露由 W-F7)
- **SC-005**: postgres named volume 持久化生效 — `docker compose down + up` 後 DB 資料保留(per FR-013 + acceptance scenario 10)
- **SC-006**: secret 缺漏行為正確 — 不設 `APP_JWT_JWT_SECRET` `.env` 時 rust-api 啟動 panic(per F1.1 strict validation,Dimension D acceptance 13)、設正確 secret 時 rust-api healthy
- **SC-007**: W-F4 secret-injection feature 在 spec / plan / implement 過程無 W-F3 相關 blocker(W-F3 secret 簡化模式為 W-F4 升級提供乾淨切入點、`environment:` 段切換為 `secrets:` + `_FILE` 為 incremental change)
- **SC-008**: 12 個 acceptance scenarios(Dimension A-E)100% pass

## Assumptions

- **W-F1 / W-F2 image 已 build local**:W-F3 範疇不重 build image、引用 W-F1 commit `6831677` / W-F2 commit `cb897e9c` 對應的 image tag(`rust-api:rev1-admin-rust-api` / `base-web:rev1-admin-base-web`;若 user 走 short SHA tag pattern、`.env.example` IMAGE_TAG 變數可切換)。
- **5 個必要 env var 用戶須在 `.env` 自填**:POSTGRES_USER / PASSWORD / DB、REDIS_PASSWORD、APP_JWT_JWT_SECRET。`.env.example` 提供範本 + 強密碼產生指令註解(`openssl rand -hex 32`);W-F3 範疇**不**自動產生 secret(那是 W-F4 範疇)。
- **W-F3 過渡 secret 模式 vs Constitution 架構約束「Docker secrets + _FILE pattern 為 prod 預設機制」**:Constitution 規範**是針對 prod**;W-F3 為 P1 階段 base 結構,dev 場景接受 `environment:` 直接傳 env(per F1.1 spec、`APP_JWT_JWT_SECRET` env 與 `_FILE` 雙 mode 並存);W-F4 secret-injection 完整化為 `_FILE` pattern,符合 prod 預設機制。W-F3 secret 模式為「過渡可運行 + W-F4 升級點清晰」,不視為 Constitution 違反。
- **`internal` network 上 service DNS**:docker-compose 自動建內部 DNS、service name 即 hostname(postgres / redis / rust-api / base-web),rust-api 連 DB 用 `postgres://...@postgres:5432/...`、連 redis 用 `redis://...@redis:6379`。
- **DB credentials 對齊 rust-api 預設**:`POSTGRES_DB=soybean_admin_rust`(per migration / sea-orm 預設、CLAUDE.md §5.1)、`POSTGRES_USER=soybean`(per migration data init 預設)。若 user 改名須同步 `.env` 與 application.yaml。
- **migration image 與 rust-api image 同**:W-F1 image 含 server + migration 兩個 binary、migration service 透過 `entrypoint: ["/usr/local/bin/migration"]` override 切換,**不**重 build。
- **healthcheck retries 5 × interval 10s = 50 sec**:postgres / redis 啟動慢於 50s 的 host 須 manually wait + 重 up;接受預設 retries(W-F3 範疇不調)。
- **base-web 無 runtime DB / redis 依賴**:base-web 是 nginx + static SPA、不連 backend、不 healthcheck depends_on;唯一依賴是用戶瀏覽器透過 W-F5 front-nginx 反代到 rust-api(W-F3 範圍外)。
- **W-F3 範圍外的 service 全留後續**:front-nginx(W-F5)、TLS(W-F6)、對外 port forwarding(W-F7)、cleanup-job(W-F9)、outbox-worker(W-F10)、observability stack(W-F12-14)、backup(W-F15-16)、acme(W-F6 內部)、Track DESIGN-A nestjs(W-FA1)。
- **無 docker-compose override 檔**:W-F3 範疇只交付 `docker-compose.yml` 主檔(+ `.env.example`);`docker-compose.dev.yml` / `.observability.yml` / `.prod.yml` 留 後續 feature 階段(per DESIGN-W §1.2「base + override 模型」全套留 W-F6 / W-F7 / W-F12+ / W-F17 等階段補建)。
- **linux/amd64 only**:per W-F1 Q2 inherit。
- **依 CLAUDE.md §6.2 單段 commit(workspace-level docs 改動模式)**:W-F3 不動 rust-api / base-web worktree、只動 outer repo;單段 commit 在 feature branch `008-compose-base-structure`、merge 回 `rev1-admin-root`。
