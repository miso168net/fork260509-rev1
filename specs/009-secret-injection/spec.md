# Feature Specification: W-F4 — secret-injection

**Feature Branch**: `009-secret-injection`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "開 W-F4 secret-injection(P1 最後一個)"

**Source**: 直接從 [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §5(W-F4 跳過 brainstorm 階段、DESIGN-W §5 為 authoritative source、對齊 W-F3 模式)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §5.2(Docker secrets + `_FILE` pattern,承 D2 拍板)、§5.3(共用 env 清單、含 `*_FILE` 規格)、§11.1(W-F4 scope 描述)、§11.2(W-F P1 必先 4 個依賴序)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(架構約束「Secret 注入:Docker secrets + `_FILE` pattern 為 prod 預設機制;secret **不進** process env;dev 可用 envvar fallback」)
- [`specs/004-jwt-secrets/`](../004-jwt-secrets/)(F1.1,已完成 — 已實作 `load_secret_from_file_if_set` helper + `APP_JWT_JWT_SECRET_FILE` precedence + strict validation;W-F4 推廣此 pattern 到 DB / Redis)
- [`rust-api/server/config/src/secret_loader.rs`](../../rust-api/server/config/src/secret_loader.rs)(F1.1 既有 helper,W-F4 推廣 caller scope)
- [`specs/008-compose-base-structure/`](../008-compose-base-structure/)(W-F3,已完成;W-F4 升級 W-F3 `environment:` direct env → `secrets:` + `_FILE` pattern)
- [`docker-compose.yml`](../../docker-compose.yml)(W-F3 產出,W-F4 修改對象)
- [`.env.example`](../../.env.example)(W-F3 產出,W-F4 修改對象)

**Scope summary**:rev1 deploy Phase W P1 **最後一個 feature**(per DESIGN-W §11.1 P1 收尾)— 把 W-F3 過渡 secret 模式(`environment:` direct env 注入 secret)升級為 **Constitution 規範的 prod 預設機制:Docker secrets + `_FILE` pattern**。**5 個 secret entries**:rust-api 用 3 個 `_FILE`(`APP_JWT_JWT_SECRET_FILE`、`APP_DATABASE_URL_FILE`、`APP_REDIS_URL_FILE`;F1.1 已實作前者、W-F4 推廣後兩者)+ postgres image-native `POSTGRES_PASSWORD_FILE` + redis shell expand `cat /run/secrets/redis_password`。新建 `deploy/secrets/` 目錄結構(`*.txt` gitignored / `*.txt.example` git-tracked)。修改 `docker-compose.yml` 加 top-level `secrets:` 段(5 entries)+ 4 service `secrets:` reference + `environment:` / `command:` / `entrypoint:` 換 `_FILE` 變量 / shell expand。修改 `rust-api/server/config/src/secret_loader.rs`(加 `apply_database_url_hardening` + `apply_redis_url_hardening` 2 個 type-specific helper)+ `config_init.rs`(2 callsite 並列加 call);**不動** `EnvConfigLoader::load()`(per Phase 0 R-001:config-rs `_` separator ambiguity)。dev / prod 統一走 secrets file 模式、僅 secret 值不同(dev-friendly vs prod-grade)。**Phase W P1 100% 達成、解鎖 P2**。

## Clarifications

### Session 2026-05-15(spec-kit `/speckit-clarify` 階段拍板)

- Q: migration service 怎麼從 Docker secret 拿 DATABASE_URL?(`sea-orm-migration` CLI 不支援 `DATABASE_URL_FILE`) → A: **Option A 入口 wrapper script** — `migration` service compose 加 `entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]`(注意 `$$` 為 compose escape、確保 shell 在 runtime 做 `$(cat ...)` substitution、與 redis 寫法對齊),不動 migration image 內部 code、純 compose 層改
- Q: `postgres_password.txt`(純密碼)與 `database_url.txt`(整 URL、含 password embedded)的雙寫怎麼處理? → A: **Option A 接受雙寫** — 2 secret file 各自獨立、operator 編輯時依 `*.txt.example` 內註解提示保持 password 一致;不擴充 rust-api source builder、不加 init container;若不一致則 rust-api 連 DB 失敗、acceptance test scenario 12(/health) fail-fast 抓到

### Session 2026-05-15(spec-kit `/speckit-analyze` 階段 remediation 拍板)

- Q: spec 內多處與 plan / research / contracts 不一致(W-F4 推廣 EnvConfigLoader 方向 / 3 vs 5 secret 計數 / migration `$$` escape / dev fallback 機制 / 註解放置)→ A: **採 analyze 報告建議全 8 項修**:
  - **I1 改 rust-api 推廣方向**(spec FR-009 改成「secret_loader.rs 加 2 helper + config_init.rs 2 callsite 並列加 call、不動 EnvConfigLoader」,per Phase 0 R-001)
  - **D1 統一 5 secret 計數**(FR-001 / FR-004 yaml / Dimension B-5 / Key Entities 全改 5)
  - **I2 migration entrypoint `$` → `$$`**(compose escape;與 redis 寫法對齊)
  - **U1 dev/prod 統一走 secrets file 模式**(dev 填 dev-friendly secret 值即可、取消 "rm .txt + envvar mode" 路徑;F1.1 envvar fallback 仍存在於 source 層、W-F4 compose 不顯式 cover)
  - **A1 `.txt.example` 不混 in-file comment**(雙寫紀律集中於 `deploy/secrets/README.md` + `.env.example` 註解)
  - **A2 空 URL fail point 改為 sea-orm 連線階段**(non secret_loader 階段;與 R-011 對齊)
  - **U2 acceptance 計數**:18 個 scenario(spec)合併為 13 個 acceptance task(tasks)
  - **D2 §6.2 改 §6.1**(兩段 commit 紀律段號)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 用 Docker secrets _FILE pattern 啟動 prod-ready rev1 stack(Priority: P1,唯一 US)🎯 MVP

operator 在乾淨 docker host 上 cp `deploy/secrets/*.txt.example` 為 `*.txt`、編輯填入 prod secret(用 `openssl rand -hex 32` 等生成)、跑 `docker compose up -d`。docker-compose 透過 `secrets:` top-level 段把 5 個 `deploy/secrets/*.txt` mount 到各 service container `/run/secrets/<name>`。**rust-api 透過 `APP_JWT_JWT_SECRET_FILE=/run/secrets/jwt_secret` + `APP_DATABASE_URL_FILE=/run/secrets/database_url` + `APP_REDIS_URL_FILE=/run/secrets/redis_url` 讀 secret content**(F1.1 既有 helper + W-F4 推廣 2 個新 type-specific helper)。**postgres service 透過 image-native `POSTGRES_PASSWORD_FILE` 讀 password**(postgres official image entrypoint 內建支援)。**redis service 透過 `--requirepass $$(cat /run/secrets/redis_password)` 讀**(yaml escape `$$` 確保 shell 在 runtime 做 substitution)。stack 啟動完成、healthcheck 全通、`docker compose exec rust-api env` 不顯示明文 secret(僅 `_FILE` path)、`docker exec <container> ps aux` 不顯示 redis password 在 command line(從 secret file 讀)。dev 場景沿同套 secrets file 模式、僅 secret 值不同(dev-friendly vs prod-grade);F1.1 envvar fallback 紀律於 rust-api source 層維持。

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F4 的 5 個交付片段(`secrets:` 段定義 / service `secrets:` reference / `_FILE` env 換 / `deploy/secrets/` 結構 / rust-api EnvConfigLoader 推廣 generic _FILE)**並非獨立可交付**:

- 單獨加 `secrets:` 段但無 service reference → secrets 不 mount 到 container
- 單獨改 service `secrets:` 但無 _FILE env 變量 → rust-api 不知道從哪 file 讀
- 單獨換 _FILE env 但 EnvConfigLoader 不識別 → rust-api 拿不到值(F1.1 只對 JWT_SECRET work、DB/Redis 還沒)
- 單獨建 `deploy/secrets/` 但無 `.gitignore` 配套 → secret 可能誤 commit
- 單獨改 EnvConfigLoader 但無 compose secrets 配置 → improve code without runtime effect

W-F4 是 **rev1 deploy P1 4 個 feature 的最後一片**;W-F1 + W-F2 image / W-F3 compose stack / W-F4 secret 安全性升級 共組 Constitution 認可的 prod-ready P1 基礎。完成後 **Phase W P1 100% 達成、P2(W-F5 front-nginx 等)解鎖**。

**Independent Test**:**18 個 acceptance scenario**(Dimension A-E、對應 FR-001 ~ FR-018)合併執行為 **13 個 acceptance task**(per [tasks.md](tasks.md) T040-T052,scenario 1-3 / 9-11 / 16-17 各合併為 1 task)涵蓋 secrets/ 目錄結構 + compose secrets 配置 + rust-api hardening helper unit test + stack 啟動 + 安全性檢查(env 不洩 / process 命令行不洩)+ dev mode(填 dev-friendly secret 值)。需要的環境:乾淨 docker host + W-F1/W-F2 image 已 build + W-F3 stack 模式做底。

**Acceptance Scenarios**:

#### Dimension A — `deploy/secrets/` 目錄結構(FR-001 ~ FR-003)

1. **Given** W-F4 implement 完成,**When** `ls deploy/secrets/`,**Then** 至少 3 個 `*.txt.example` 範本(`jwt_secret.txt.example` / `database_url.txt.example` / `redis_url.txt.example`)、`.gitignore` 內 secret 行覆蓋這 3 個 `*.txt`(不含 `.example` suffix)
2. **Given** W-F4 完成,**When** `grep -E "^/?deploy/secrets" .gitignore`,**Then** 至少 1 條規則排除 `deploy/secrets/*.txt` 但**不**排除 `deploy/secrets/*.txt.example`
3. **Given** operator 跑 `cp deploy/secrets/jwt_secret.txt.example deploy/secrets/jwt_secret.txt` + 編輯填值,**When** `git status`,**Then** `jwt_secret.txt` 不出現 untracked(已被 gitignore)

#### Dimension B — docker-compose.yml `secrets:` 配置(FR-004 ~ FR-008)

4. **Given** docker-compose.yml W-F4 改動完成,**When** `grep "^secrets:" docker-compose.yml`,**Then** 命中 top-level `secrets:` 段
5. **Given** docker-compose.yml,**When** `docker compose config | grep -A 12 "^secrets:"`,**Then** **5 個 secrets**:`jwt_secret` / `database_url` / `redis_url` / `postgres_password` / `redis_password`,各指 `file: ./deploy/secrets/<name>.txt`
6. **Given** docker-compose.yml,**When** `docker compose config | grep -E "secrets:|/run/secrets/"`,**Then** rust-api service `secrets:` 段含 3 個 secret reference + `environment:` 含 `APP_JWT_JWT_SECRET_FILE=/run/secrets/jwt_secret` 等 `_FILE` 變量
7. **Given** docker-compose.yml,**When** 檢 postgres service env,**Then** 不再有 `POSTGRES_PASSWORD: <plain>`、改為 `POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password`(postgres image native 支援)
8. **Given** docker-compose.yml,**When** 檢 redis service command,**Then** 用 `redis-server --requirepass $$(cat /run/secrets/redis_password)` 或同類從 file 讀

#### Dimension C — EnvConfigLoader generic `_FILE` 推廣(FR-009 ~ FR-011)

9. **Given** rust-api 已 W-F4 patch(EnvConfigLoader 對 `APP_*` env 自動 fallback `_FILE`),**When** unit test 設 `APP_DATABASE_URL_FILE=/tmp/test-db.url` + 寫一個 URL 進去、不設 `APP_DATABASE_URL`,**Then** EnvConfigLoader load 結果 `database.url == file content`(file 優先)
10. **Given** rust-api 已 patch,**When** unit test 同時設 `APP_DATABASE_URL=env_value` + `APP_DATABASE_URL_FILE=/tmp/file_value.txt`,**Then** EnvConfigLoader load 結果 = file content(`_FILE` 優先於 envvar、per F1.1 precedence rule 推廣)
11. **Given** rust-api 已 patch,**When** 只設 `APP_DATABASE_URL=env_value`(無 `_FILE`),**Then** EnvConfigLoader load 結果 = `env_value`(envvar fallback、dev 場景仍可用)

#### Dimension D — Stack 啟動 + 安全性(FR-012 ~ FR-015)

12. **Given** `deploy/secrets/*.txt` 已 cp + 填值、`.env` 不再含 secret-class env(POSTGRES_PASSWORD / REDIS_PASSWORD / APP_JWT_JWT_SECRET 移除),**When** `docker compose up -d` + sleep 60,**Then** 5 service 全 healthy(對齊 W-F3 acceptance、stack 跑通)
13. **Given** stack healthy,**When** `docker compose exec rust-api env | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)$"`,**Then** 命中 `*_FILE` 變量(指向 `/run/secrets/<name>`)、**不**命中明文 secret value
14. **Given** stack healthy,**When** `docker compose exec redis ps aux | grep redis-server`,**Then** command line 含 `--requirepass`、但 password 值不直接出現在 command(從 file 讀或經 shell expand 但不留 process arg)
15. **Given** stack healthy,**When** `docker compose exec rust-api curl -f http://localhost:11081/health` + base-web 類似,**Then** 200 + ok(F1.1 strict secret validation + DB/Redis 連線都 work、_FILE pattern 真實生效)

#### Dimension E — Dev fallback + 整體相容(FR-016 ~ FR-018)

16. **Given** operator 走 dev 簡化模式(刪 `deploy/secrets/*.txt`、`.env` 補 `APP_JWT_JWT_SECRET=<hex>`、不設 `_FILE`),**When** `docker compose up -d`,**Then** rust-api 啟動成功(EnvConfigLoader envvar fallback、不 panic on missing _FILE)
17. **Given** dev mode 起 stack,**When** `curl /health`,**Then** 200 + ok(dev fallback 機制完整)
18. **Given** prod mode 起 stack 後,**When** 跑 W-F3 acceptance subset(quickstart.md scenario 6/7/9/10:/health / DNS / volume 持久),**Then** 全 pass(W-F4 升級不破壞 W-F3 既有功能)

### Edge Cases

- **`_FILE` 指向不存在的 path** → F1.1 secret_loader.rs 已實作 panic(read 失敗時),W-F4 generic 推廣繼承此行為
- **`_FILE` 指向空檔案** → secret 讀出空 string → F1.1 strict validation 對 JWT 已 fail-fast empty;DB/Redis 為 URL 格式、空 URL 於 **sea-orm connection pool init / redis client connect 階段 fail-fast**(非 secret_loader 階段;per Phase 0 R-011 紀律:rust-api source 不對 URL 加 startup format validation)
- **multi-value secret(e.g. DATABASE_URL 含 user:pass)** → W-F4 走整個 URL 放 `database_url.txt`(per DESIGN-W §5.3),簡單;若未來要拆 `POSTGRES_USER` + `POSTGRES_PASSWORD` 分別放 secret file → W-F4 範圍外
- **secret rotation**:替換 `deploy/secrets/<name>.txt` + `docker compose restart <service>` 即可 reload;W-F4 範圍內接受 manual rotation、自動 rotation 留後續
- **dev mode 與 prod mode 切換**:dev 跑 `.env` direct env、prod 跑 secrets file。切換時 `.env` 註解掉 secret 變量(或刪)、deploy/secrets/*.txt 填好
- **`.env.example` 範本內 secret 變量處理**:W-F4 後 `.env.example` 內 `APP_JWT_JWT_SECRET=...` 應加註解「prod 模式請改用 deploy/secrets/jwt_secret.txt + 把此行 comment out」、dev 場景仍可填值
- **postgres image native _FILE pattern**:postgres official image 的 entrypoint script(`docker-entrypoint.sh`)識別 `POSTGRES_PASSWORD_FILE`、無需 W-F4 rust-api source 動;簡化 W-F4 scope
- **redis 沒 native _FILE 支援** → 用 `command: ["sh", "-c", "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]` shell expand at startup(`$$` 為 compose escape;W-F3 已用 shell form,W-F4 改成 cat 取代直接 env);redis process 啟動後密碼在 memory、ps aux 不顯示原文

## Requirements *(mandatory)*

### Functional Requirements

#### A. `deploy/secrets/` 目錄結構

- **FR-001**: 新建 `deploy/secrets/` 目錄(outer repo root)。MUST 含 **5 個 `*.txt.example`** 範本(git-tracked、無敏感值):
  - `deploy/secrets/jwt_secret.txt.example`
  - `deploy/secrets/database_url.txt.example`
  - `deploy/secrets/redis_url.txt.example`
  - `deploy/secrets/postgres_password.txt.example`
  - `deploy/secrets/redis_password.txt.example`
- **FR-002**: 修改 outer `.gitignore` 加規則 **`/deploy/secrets/*.txt`**(排除實際 secret 檔)、**不**排除 `deploy/secrets/*.txt.example`(範本仍 git-tracked)
- **FR-003**: 每個 `*.txt.example` 為 **1 行 placeholder 內容、不混 `#` in-file comment**(避免 operator cp 後忘刪 comment、其值會被當 secret 一部分讀);**雙寫紀律 + 生成指令說明集中於 `deploy/secrets/README.md`(新建)+ `.env.example` 註解區段**(per `/speckit-analyze` A1 拍板):README 明示 `database_url.txt` 內 URL embedded password MUST = `postgres_password.txt` 純值;`redis_url.txt` vs `redis_password.txt` 同理;若不一致 rust-api 連 DB / Redis 失敗、scenario 12 /health 不通(per troubleshooting #3 #5)

#### B. docker-compose.yml `secrets:` 配置

- **FR-004**: docker-compose.yml 加 top-level `secrets:` 段,定義 **5 個 secret** 各指對應 file:
  ```yaml
  secrets:
    jwt_secret:
      file: ./deploy/secrets/jwt_secret.txt
    database_url:
      file: ./deploy/secrets/database_url.txt
    redis_url:
      file: ./deploy/secrets/redis_url.txt
    postgres_password:
      file: ./deploy/secrets/postgres_password.txt
    redis_password:
      file: ./deploy/secrets/redis_password.txt
  ```
- **FR-005**: `rust-api` service MUST `secrets:` 段引用 3 個 secret + `environment:` 改用 `_FILE` 變量:
  - `APP_JWT_JWT_SECRET_FILE=/run/secrets/jwt_secret`(F1.1 既有 helper 已支援)
  - `APP_DATABASE_URL_FILE=/run/secrets/database_url`(W-F4 新 helper `apply_database_url_hardening` 支援)
  - `APP_REDIS_URL_FILE=/run/secrets/redis_url`(W-F4 新 helper `apply_redis_url_hardening` 支援)
  - 移除 W-F3 既有直接 env(`APP_JWT_JWT_SECRET` / `APP_DATABASE_URL` / `APP_REDIS_URL`);**dev/prod 統一走 secrets file 模式**(per `/speckit-analyze` U1 拍板),dev 場景 operator 填 dev-friendly 值於 `deploy/secrets/*.txt` 即可(無需勞 prod-grade entropy)
- **FR-006**: `migration` service 改用 **entrypoint wrapper script** 從 secret file 讀 DATABASE_URL — compose 加 `entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]`(per `/speckit-clarify` Q1 + `/speckit-analyze` I2 拍板;`$$` 為 compose escape、確保 shell 在 runtime 做 `$(cat ...)` substitution、與 redis 寫法對齊)。**不動 migration image 內部 code**(sea-orm-migration CLI 標準只讀 `DATABASE_URL` env、不支援 `DATABASE_URL_FILE` — wrapper 在 shell 層先 export);secret 透過 `secrets:` reference mount 為 `/run/secrets/database_url`、wrapper shell expand 為 env、`exec` 不留 wrapper process 在 ps 樹
- **FR-007**: `postgres` service `environment:` 改用 `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password`(postgres image entrypoint 內建支援);加 secret `postgres_password`(分離自 `database_url`、postgres image 不接受完整 URL)
- **FR-008**: `redis` service 改用 `command: ["sh", "-c", "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]` 從 secret file 讀(redis 無 native _FILE);加 secret `redis_password`

#### C. rust-api `_FILE` 推廣(type-specific helper + 既有 callsite 並列加 call)

- **FR-009**: 修改 `rust-api/server/config/src/secret_loader.rs` 加 2 個 type-specific helper:
  - `pub fn apply_database_url_hardening(database: &mut DatabaseConfig)` — 呼叫既有 `load_secret_from_file_if_set("APP_DATABASE_URL")`、Some 時 override `database.url`
  - `pub fn apply_redis_url_hardening(redis: &mut RedisConfig)` — 同模式

  修改 `rust-api/server/config/src/config_init.rs` F1.1 既有 2 callsite(`init_from_file` + `init_global_config`),在 `apply_jwt_secret_hardening` **行之後並列加 2 行** new helper call(per `/speckit-analyze` I1 + Phase 0 R-001 拍板)。**不動 `EnvConfigLoader::load()`**:config-rs Environment source 對 `APP_*_FILE` 後綴有 `_` separator ambiguity(`APP_DATABASE_URL_FILE` 會 split 為 `database.url.file` 三層 nested、generic 路徑技術上不可行);沿 F1.1 type-specific helper + callsite 並列模式推廣 callsite scope
- **FR-010**: `_FILE` 讀檔失敗(path 不存在 / permission denied)→ panic with friendly error message(對齊 F1.1 secret_loader.rs panic style;reuse 既有 `load_secret_from_file_if_set` panic 邏輯)
- **FR-011**: 既有 `secret_loader.rs::load_secret_from_file_if_set` helper **reuse 不動**(F1.1 callsite 仍 work);W-F4 2 個新 helper 內部呼叫此 helper、不重寫 file IO 邏輯

#### D. Stack 啟動 + 安全性

- **FR-012**: `docker compose up -d` 全程不在 host shell history / process args 中顯示明文 secret(只顯示 `_FILE` 變量指 path)
- **FR-013**: `docker compose exec <service> env` 不顯示明文 secret(verify Dimension D scenario 13)
- **FR-014**: rust-api / migration runtime 從 `/run/secrets/<name>` 讀 secret content、parse 為 config 值;F1.1 strict validation 對 JWT 仍生效(panic on empty / placeholder / length < 32)
- **FR-015**: redis process command line(`ps aux`)不顯示明文 redis password(per FR-008 shell expand 取代直接命令行 arg)

#### E. Dev fallback + 相容性

- **FR-016**: dev 場景 operator **走同套 secrets file 模式、僅 secret 值不同**(per `/speckit-analyze` U1 拍板):dev 填 dev-friendly 值於 `deploy/secrets/*.txt`(無需勞 `openssl rand`、可手寫如 `dev-jwt-secret-32-chars-padding-xxxx`)。rust-api source 層 F1.1 envvar fallback 紀律維持(`_FILE` not set 時走 envvar、yaml default lowest);但 W-F4 docker-compose.yml 預設 set `_FILE` env、不顯式提供 envvar mode 切換機制(若 advanced operator 需要,自製 `docker-compose.override.yml` 移除 `_FILE` + `secrets:` ref)
- **FR-017**: W-F4 升級**不破壞** W-F3 既有 acceptance:跑 W-F3 quickstart.md scenario 6 / 7 / 9 / 10(/health / DNS / volume / 對外 port)應仍 pass
- **FR-018**: `.env.example` 更新註解、明示 prod 用 secrets files、dev 仍可填 secret env

#### F. 範疇邊界保護

- **FR-019**: W-F4 **MUST NOT** 動 nestjs(Track A、留 W-FA1 + DESIGN-W §5.4 `NESTJS_*_FILE` 留)
- **FR-020**: W-F4 **MUST NOT** 動 front-nginx / TLS / acme(留 W-F5/W-F6)、**MUST NOT** 動對外 host port forwarding(留 W-F7)
- **FR-021**: W-F4 **MUST NOT** 動 observability / backup / CI/CD(留 W-F12-18)
- **FR-022**: W-F4 **MUST NOT** 加自動 secret rotation 機制(留 future feature)、**MUST NOT** 加 secret encryption-at-rest(deploy/secrets/*.txt 為 plain text、由 host filesystem permission + .gitignore 保護)
- **FR-023**: W-F4 **MUST NOT** 動 W-F1 / W-F2 image 內部結構(per FR-009 只動 rust-api config crate、不動 server-bin / migration / base-web image)

### Key Entities *(include if data involved)*

- **`deploy/secrets/` directory**:outer repo root 新建子目錄、含 **5 個 `*.txt.example`** 範本(git-tracked)+ 5 個 gitignored `*.txt` 實際 secret 檔(operator 編輯)+ 1 個 `README.md`(雙寫紀律 + 生成指令說明)
- **5 secret entries**:`jwt_secret`(rust-api JWT 簽章)/ `database_url`(rust-api + migration 連 DB 的整 URL,含 password embedded)/ `redis_url`(rust-api 連 Redis 的整 URL,含 password embedded)/ `postgres_password`(postgres image native `POSTGRES_PASSWORD_FILE` 用、純值)/ `redis_password`(redis container `--requirepass` shell expand 用、純值)
- **`secrets:` top-level docker-compose 段**:5 個 secret name + `file:` path mapping
- **Service `secrets:` reference**:rust-api(jwt + database_url + redis_url)/ migration(database_url)/ postgres(postgres_password)/ redis(redis_password)各 reference 對應 secret、mount 到 `/run/secrets/<name>`;base-web 不引用
- **`_FILE` env variable**:container runtime env、值為 secret file 內部 path
- **rust-api hardening helpers**(`secret_loader.rs`):F1.1 既有 `apply_jwt_secret_hardening` + W-F4 新增 `apply_database_url_hardening` + `apply_redis_url_hardening`(type-specific helper、不動 `EnvConfigLoader::load()` generic 邏輯)
- **`.env.example` updated**:secret-class env 5 個改 comment-out 預設、註解區段明示 prod / dev 統一走 secrets file 模式
- **`deploy/secrets/README.md`**:雙寫紀律說明 + 生成指令(`openssl rand -hex 32` 等)+ dev/prod 值差異建議

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在乾淨 docker host 上 cp `deploy/secrets/*.txt.example` 為 `*.txt` + 填值 + `docker compose up -d`,5 service 在 60-90 秒內全 healthy(對齊 W-F3 SC-001 + W-F4 secret 讀檔額外 overhead 可忽略)
- **SC-002**: `docker compose exec rust-api env` 輸出 `APP_*_FILE` 變量(指向 `/run/secrets/<name>`)、**0 個明文 secret value 出現**(per FR-012 / FR-013 安全性)
- **SC-003**: `docker compose exec redis ps aux | grep redis-server` 不含明文 password(per FR-015)
- **SC-004**: rust-api / base-web `/health` 200 + ok、p99 latency < 50ms(對齊 W-F3 SC-003)
- **SC-005**: W-F4 升級不破壞 W-F3 acceptance — 跑 W-F3 quickstart.md 17 個 scenario 的 representative subset(scenario 6 / 7 / 9 / 10 / 11)全 pass
- **SC-006**: 13 個 W-F4 acceptance check(Dimension A-E 對應 FR-001 ~ FR-018)100% pass
- **SC-007**: dev mode(同 secrets file 模式、`deploy/secrets/*.txt` 填 dev-friendly 值)起 stack 並通 /health
- **SC-008**: **Phase W deploy P1 達 100%(4/4)、解鎖 P2** — W-F5 / W-F7 / W-F11 等 feature 在 spec / plan 過程無 W-F4 secret 相關 blocker

## Assumptions

- **F1.1 secret_loader.rs 推廣到 generic `_FILE`**:F1.1 helper `load_secret_from_file_if_set(base_envvar)` 是 generic 設計,W-F4 plan 階段在 EnvConfigLoader 內呼叫此 helper 對任何 `APP_*` env、不重寫;helper 既有 panic-on-read-fail 行為對 W-F4 適用。
- **postgres image `POSTGRES_PASSWORD_FILE` 原生支援**:postgres official image entrypoint(`docker-entrypoint.sh`)識別此 env;W-F4 用此 image-native 機制,**rust-api source 不需動 postgres 相關**。
- **redis 無 native `_FILE`**:redis 官方 image 不支援 `REDIS_PASSWORD_FILE` 自動讀檔(需自寫 entrypoint);W-F4 用 `command: ["sh", "-c", "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]` shell expand 從 secret file 讀。
- **`migration` service 走 entrypoint wrapper script**:sea-orm-migration CLI 標準只讀 `DATABASE_URL` env、不支援 `DATABASE_URL_FILE`(per `/speckit-clarify` Q1 拍板)。W-F4 用 `entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]` shell expand from secret file(注意 `$$` 為 compose escape;per `/speckit-analyze` I2 拍板、與 redis 寫法對齊);`exec` 確保 migration process 取代 wrapper、不留 wrapper 在 process tree。**不動 migration image 內部 code**。
- **3 secrets 範圍**:本 W-F4 處理 jwt_secret / database_url / redis_url(rust-api 用)+ postgres_password(postgres image native)+ redis_password(redis container)= 5 secret entries;其他(acme_email / backup_pg_user 等)留 W-F6 / W-F15。
- **同密碼雙寫紀律(postgres_password vs database_url URL embed)**:per `/speckit-clarify` Q2 Option A 拍板,2 secret file 各自獨立、operator 編輯時手動對齊;`.txt.example` 註解(FR-003)+ acceptance test scenario 12(/health) fail-fast 化解;**不**擴充 rust-api EnvConfigLoader 加 URL builder、**不**加 init container 自動 sync。redis 同密碼雙寫(`redis_password` vs `redis_url` 內 redis 密碼)亦同模式。
- **deploy/secrets file 格式**:每 `.txt` 檔含 1 行 secret value、無換行 / no extra whitespace(F1.1 helper 已 `.trim()`、容錯空白);file mode 0600(operator 自設、W-F4 不 enforce)。
- **dev/prod 統一走 secrets file 模式**(per `/speckit-analyze` U1 拍板):W-F4 docker-compose.yml 預設 set `_FILE` env + `secrets:` ref;dev 與 prod 唯一差別在 `deploy/secrets/*.txt` 內 secret **值**不同(dev-friendly vs prod-grade)。F1.1 envvar fallback 紀律仍存在於 rust-api source 層(`_FILE` not set 走 envvar、yaml default lowest),但 W-F4 acceptance 不顯式 cover envvar mode。
- **`.env` 內 secret 變量處理**:W-F4 後 `.env.example` 把 secret-class env(POSTGRES_PASSWORD / REDIS_PASSWORD / APP_JWT_JWT_SECRET)**改為註解形式**(預設不啟用、保留作 advanced operator 自製 override 參考)、明示 dev/prod 都用 `deploy/secrets/*.txt`。
- **W-F3 既有 docker-compose.yml 改動範圍**:加 `secrets:` top-level + 5 service `secrets:` reference + `environment:` 改 `_FILE` 變量(rust-api 3 個 + postgres 1 個);redis service 改 command;migration service 改 entrypoint wrapper or 接受例外。**不**動 networks / volumes / depends_on / healthcheck 結構。
- **acceptance test 可重啟 W-F3 stack**:W-F4 acceptance 涉及 stack 重啟、cleanup `docker compose down -v` + 重 setup;test 順序避免 stack 殘留。
- **linux/amd64 only**:per W-F1 Q2 inherit。
- **依 CLAUDE.md §6.1 W-F4 走兩段 commit**(rust-api worktree 改 `secret_loader.rs` + `config_init.rs` + outer compose / .env.example / .gitignore / deploy/secrets/ / spec docs):rust-api source 改動非 trivial(2 個新 helper + 2 callsite + 3 unit test),走兩段 commit — rust-api worktree commit + push → outer feature branch SHA bump + 第二段 commit。Plan 階段已拍板(per [plan.md](plan.md) Project Structure 段)。
