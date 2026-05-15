# Research: W-F3 compose-base-structure

**Feature**: 008-compose-base-structure
**Phase**: 0 (research)
**Date**: 2026-05-15
**Inputs**:
- [`spec.md`](spec.md)(W-F3 functional + non-functional 拍板;3 個 clarify 拍板)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §3
- [`specs/006-dockerfile-rust-api/contracts/dockerfile-structure.md`](../006-dockerfile-rust-api/contracts/dockerfile-structure.md) C-D7(W-F1 image 屬性 contract)
- [`specs/007-dockerfile-base-web/contracts/dockerfile-structure.md`](../007-dockerfile-base-web/contracts/dockerfile-structure.md) C-D7(W-F2 image 屬性 contract)
- 既有 [`rust-api/compose.yaml`](../../rust-api/compose.yaml)(reference 模式、含 bug 待修)

**Purpose**:解 spec.md `## Assumptions` 段 11 個前置 assumption + 補強 W-F3 plan-stage 不踩 unknown blocker。

---

## R-001: Image version 確認(Q1 / Q2 拍板)

**Question**:Q1 拍 `postgres:17.4`、Q2 拍 `redis/redis-stack:7.4.0-v3`,確認 image registry 可拉、image 屬性與 spec 期望吻合。

**Audit method**:
1. `docker pull postgres:17.4` + `docker image inspect`
2. `docker pull redis/redis-stack:7.4.0-v3` + `docker image inspect`
3. 確認 default `CMD` / `ENTRYPOINT` / `EXPOSE` / volume mount path 等

**Findings**:
- W-F1 acceptance T040 minimal stack 已實際 pull 並起這兩 image,confirmed work:
  - `postgres:17.4`:base image debian-slim、預設 data dir `/var/lib/postgresql/data`(per official postgres docs)、EXPOSE 5432、預設 entrypoint `docker-entrypoint.sh`、CMD `postgres`
  - `redis/redis-stack:7.4.0-v3`:含 RedisJSON / RediSearch / RedisTimeSeries / RedisBloom、預設 EXPOSE 6379 + 8001(8001 是 RedisInsight Web UI,W-F3 不用)、預設 CMD `redis-server`,可用 `command:` override 加 `--requirepass`

**Decision**:沿用 Q1/Q2 拍板,plan 階段不重 audit。

**Plan-stage action**:無(W-F1 已驗證)

---

## R-002: `/usr/local/bin/migration` CLI subcommand `up` 行為

**Question**:spec FR-008 `migration` service 用 `command: ["up"]`、entrypoint `[/usr/local/bin/migration]`。`up` 是否正確 subcommand 名稱?

**Audit method**:`docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help` 看 subcommand 列表

**Findings**:per W-F1 acceptance T036 / plan-stage audit:
```
Commands:
  init      Initialize migration directory
  generate  Generate a new, empty migration
  fresh     Drop all tables from the database, then reapply all migrations
  refresh   Rollback all applied migrations, then reapply all migrations
  reset     Rollback all applied migrations
  status    Check the status of all migrations
  up        Apply pending migrations  ← 確認可用
  down      Rollback applied migrations
```

**Decision**:`up` ✓ 對應 sea-orm-migration CLI 標準 subcommand。

**Plan-stage action**:無(spec FR-008 已正確)

---

## R-003: postgres data dir path 修正

**Question**:既有 `rust-api/compose.yaml` 內 postgres volume mount 寫 `/usr/share/docker/postgresql`(此路徑非 postgres image 預設 data dir、是 bug);spec FR-014 寫 `postgres_data:/var/lib/postgresql/data`(postgres image 標準 path),W-F3 走哪個?

**Audit method**:`docker image inspect postgres:17.4 --format '{{.Config.Volumes}}'` + 查 postgres official Dockerfile

**Findings**:
- postgres official image Dockerfile 定義:`ENV PGDATA /var/lib/postgresql/data` + `VOLUME /var/lib/postgresql/data`
- 既有 `rust-api/compose.yaml` 的 `/usr/share/docker/postgresql` 路徑**錯誤**(實際 postgres 寫到容器內 `/var/lib/postgresql/data` 而非 mount target、volume 是空的、container 重啟後資料丟失)
- W-F1 acceptance T040 minimal stack 已用 `/var/lib/postgresql/data`(預設,T040 沒 explicit volume mount,直接走 image default volume)pass

**Decision**:W-F3 用 **`/var/lib/postgresql/data`**(spec FR-014 正確),**修正既有 compose.yaml bug**(rev1 不繼承)。

**Plan-stage action**:無(spec 正確)

---

## R-004: postgres healthcheck `$$POSTGRES_USER` escape 行為

**Question**:DESIGN-W §3.3 範例 + spec FR-006:`pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB`。雙 `$$` 是 docker-compose 變量 escape — 確認此用法 work 且 healthcheck 真的能讀到 service env。

**Audit method**:docker-compose 文件 + 既有 compose.yaml 模式

**Findings**:
- docker-compose `environment:` 或 `env_file` 設的 env 在 container 內可用
- healthcheck `test:` 命令在 container 內執行,可讀 container env
- compose YAML 內 `$VAR` 會被 compose 自身解析(從 `.env` 或 host env),`$$VAR` 才是 escape 給 shell / container 內展開
- 所以 `pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB` → 在 postgres container 內展開為 `pg_isready -U <POSTGRES_USER value> -d <POSTGRES_DB value>` ✓

**Decision**:spec FR-006 / FR-007 用 `$$` escape 正確。

**Alternative considered**:
- 寫死 user/db name(如既有 compose.yaml `pg_isready -U soybean -d soybean-admin-nest-backend` — 但後者 DB 名是另一 bug、不對齊 POSTGRES_DB)— **rejected**(寫死失去 .env override 彈性)

**Plan-stage action**:無

---

## R-005: `COMPOSE_PROJECT_NAME=rev1-admin` 影響 + container/network/volume naming

**Question**:Q3 clarify 拍板 `COMPOSE_PROJECT_NAME=rev1-admin`(per CLAUDE.md §5.2),具體影響哪些 docker resources naming?

**Audit method**:docker-compose 文件 + 既有 compose 慣例

**Findings**:`COMPOSE_PROJECT_NAME=rev1-admin` 影響:
- Container 名:`<service>` → `rev1-admin-<service>-1`(e.g. `rev1-admin-postgres-1`)
- Network 名:`internal` → `rev1-admin_internal`
- Volume 名:`postgres_data` → `rev1-admin_postgres_data`
- Image 不受影響(image tag 由 spec FR-005 / `.env` `IMAGE_TAG` 控制)

**Decision**:
- spec FR / data-model 文件內 service / network / volume **不**寫 prefix(那是 compose 自動加)
- `.env.example` 含 `COMPOSE_PROJECT_NAME=rev1-admin` 設定(per FR-016)、operator 可 override
- 不衝突 fork260509 既有 `new-admin` project 名(per CLAUDE.md §5.2 隔離)

**Plan-stage action**:`.env.example` 內 `COMPOSE_PROJECT_NAME` 預設 `rev1-admin`、註解說明衝突避免

---

## R-006: `APP_DATABASE_URL` URL encoding(password 含 special char)

**Question**:spec FR-017 構造 `APP_DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`。若 `POSTGRES_PASSWORD` 含 special char(`@` / `/` / `:` / `#` / `?` 等)、URL parse 會錯。

**Audit method**:
- 既有 `rust-api/compose.yaml` `POSTGRES_PASSWORD: soybean@123.`(含 `@` + `.`),`.` 安全但 `@` 須 URL encode 為 `%40`
- W-F1 acceptance T040 確實用 `postgres://soybean:soybean%40123.@w-f1-postgres:5432/...`(URL encoded)pass

**Decision**:
- `.env.example` 對 `POSTGRES_PASSWORD` 加註解:**「若含 `@` / `/` / `:` / `#` / `?` 等 URL special char,須在傳給 DATABASE_URL 前 URL encode」**
- compose.yaml 內 `APP_DATABASE_URL` 由 `${POSTGRES_USER}:${POSTGRES_PASSWORD}` interpolation 構造,**用戶須自行確保 `POSTGRES_PASSWORD` 不含 URL special 或預先 URL encode**
- 簡化:`.env.example` 預設 `POSTGRES_PASSWORD` 用 hex string(`openssl rand -hex 32`),不含 special char

**Alternative considered**:
- 引入 `urlencode` 工具在 compose 內處理 — compose 不支援,**rejected**
- 拆 `APP_DATABASE_URL` 為個別 env(`APP_DATABASE_HOST/PORT/USER/PASSWORD/NAME`)— application.yaml 結構需配合改 / rust-api 既有走 URL,**rejected**(增 scope 至 rust source)

**Plan-stage action**:`.env.example` 註解 + 預設使用 hex string 密碼避坑

---

## R-007: `depends_on.condition` semantic verification

**Question**:spec FR-008 / FR-009 用 `service_healthy` + `service_completed_successfully`,docker compose 版本支援度?

**Audit method**:docker compose 文件

**Findings**:
- `depends_on` long-syntax with `condition`:`service_started` / `service_healthy` / `service_completed_successfully`
- 需要 docker compose v2.x(`docker compose` 命令,不是 v1 `docker-compose`)
- `service_healthy` 需 service 有 healthcheck 配置
- `service_completed_successfully` 需 service 設 `restart: "no"` 並 exit 0

**Decision**:沿用 spec FR-008 / FR-009,compose v2 syntax 已是現代 docker desktop 預設。

**Plan-stage action**:`.env.example` 或 README 提示「需 docker compose v2+」

---

## R-008: docker-compose file format version

**Question**:是否需要 `version:` 段 + 哪版?

**Findings**:
- compose file format 從 v3 起、`version:` 段已 deprecated(compose v2 工具忽略)
- 現代 compose file 推薦**不寫** `version:` 段
- 取而代之依賴 compose CLI 版本

**Decision**:W-F3 `docker-compose.yml` **不寫 `version:` 段**(modern compose convention)。

**Plan-stage action**:無

---

## R-009: 既有 `rust-api/compose.yaml` bug clean (W-F3 不繼承)

**Question**:既有 compose.yaml 含 4 個 bug,W-F3 是否清掉(刪除既有檔)還是並存?

**既有 bug list**:
1. postgres healthcheck `pg_isready -U soybean -d soybean-admin-nest-backend` — DB 名拼錯(應為 `soybean_admin_rust`)
2. postgres volume mount 路徑 `/usr/share/docker/postgresql` — 非 postgres image 預設 data dir(資料不持久化)
3. redis 密碼寫死 `123456` + healthcheck 也寫死
4. 含 pgbouncer service(rev1 W-F3 範圍外)+ 對外 port forwarding(W-F3 Q3 拍板不開)

**Decision**:
- W-F3 **不繼承既有 compose.yaml**(全在 rust-api/ worktree 內、與 outer 新建 docker-compose.yml 共存)
- 既有 `rust-api/compose.yaml` 屬 fork260509 historical artifact、由 W-F1 acceptance 階段繞過(T040 用 ad-hoc docker run + network、不用 compose)
- W-F3 不刪除既有檔(per Constitution Principle IV「base 不改動邊界」推廣到 rust-api 不必要改動)、只在 outer repo root 建新 compose.yaml
- 後續若 user 想清掉既有檔,屬獨立 maintenance task(可在 W-F1 follow-up 或 cleanup feature 處理)

**Plan-stage action**:無(不動既有檔、只建新檔)

---

## R-010: rust-api healthcheck `curl -f http://localhost:11081/health` 行為對齊

**Question**:spec FR-009 rust-api healthcheck `curl -f http://localhost:11081/health`、port 11081 對齊 W-F1 contracts C-D7。

**Audit cross-check**:
- W-F1 image contracts C-D7:`EXPOSE 11081/tcp` + ENV `APP_SERVER_PORT=11081` ✓
- W-F1 acceptance T036:`curl -f /health` 回 200 + `ok` ✓
- W-F3 healthcheck `curl -f` 配 `interval: 30s` + `retries: 3`(per DESIGN-W §3.3 default)

**Decision**:沿用 spec FR-009 + DESIGN-W §3.3 預設 healthcheck params。

**Plan-stage action**:無

---

## R-011: base-web healthcheck + 無 backend dep

**Question**:spec FR-010 base-web healthcheck `curl -f http://localhost:8080/health`、`MUST NOT depends_on` 其他 service。

**Audit cross-check**:
- W-F2 image contracts C-D7:`EXPOSE 8080/tcp` + nginx serve static ✓
- W-F2 acceptance T036:`curl -f /health` 回 200 + `ok` ✓
- base-web 為 SPA + nginx、無 runtime DB / redis 依賴 ✓

**Decision**:沿用 spec FR-010。base-web 可在 rust-api 起好前獨立啟、`docker compose up base-web` 單跑也 work。

**Plan-stage action**:無

---

## 解決 spec.md `## Assumptions` 對照

| Spec Assumption | Research 結果 | 狀態 |
|---|---|---|
| W-F1 / W-F2 image 已 build local(rust-api / base-web) | W-F1+W-F2 acceptance 已 build local tag、可用 | ✅ |
| 5 個 env var 用戶須 `.env` 自填 | `.env.example` 對齊(per FR-016) | ✅ |
| W-F3 過渡 secret 模式 vs Constitution | dev 場景接受;W-F4 升 _FILE | ✅ |
| `internal` network 上 service DNS | docker-compose 自動建內部 DNS(R-005 確認) | ✅ |
| DB credentials 對齊 rust-api 預設 | POSTGRES_DB=soybean_admin_rust、POSTGRES_USER=soybean(per CLAUDE.md §5.1 / migration data init) | ✅ |
| migration image 與 rust-api image 同 | per spec FR-005 / FR-008、W-F1 image 含 server + migration 兩 binary | ✅ |
| healthcheck retries 5 × 10s = 50s | R-004 接受預設 | ✅ |
| base-web 無 runtime backend dep | R-011 confirmed | ✅ |
| W-F3 範圍外 service 全留後續 | 對齊 DESIGN-W §3.1 phase 標籤 | ✅ |
| 無 docker-compose override 檔 | W-F3 只交 `docker-compose.yml` + `.env.example` | ✅ |
| linux/amd64 only | inherit W-F1 Q2 | ✅ |
| 單段 commit(workspace-level docs 模式) | 不動 worktree、只動 outer | ✅ |
| **(新)既有 rust-api/compose.yaml 不繼承、不刪、不修** | R-009 拍板 | ✅ Resolved |
| **(新)Q1/Q2 image 拉得到** | R-001 W-F1 已驗 | ✅ Resolved |
| **(新)migration CLI `up`** | R-002 verified | ✅ Resolved |
| **(新)postgres data dir 正解** | R-003 / spec FR-014 正確路徑 | ✅ Resolved |
| **(新)`$$` escape**| R-004 confirmed | ✅ Resolved |
| **(新)COMPOSE_PROJECT_NAME 影響**| R-005 documented | ✅ Resolved |
| **(新)URL encode password**| R-006 `.env.example` 註解 | ✅ Resolved |
| **(新)`depends_on.condition` v2 syntax**| R-007 confirmed | ✅ Resolved |
| **(新)compose file 不寫 `version:`**| R-008 modern convention | ✅ Resolved |
| **(新)healthcheck params(interval 30s / retries 3)**| R-010 / R-011 對齊 DESIGN-W §3.3 預設 | ✅ Resolved |

**結論**:0 個 unresolved blocker。Plan / implement 階段執行 4 個 verification(image pull + 5 env var + URL encoding warning + COMPOSE_PROJECT_NAME 預設)即可進 implement。
