# Contract: W-F4 secret-injection 結構約束

**Phase 1 output** — 9 個 contract(C-S1 ~ C-S9):涵蓋 `deploy/secrets/` 目錄結構、compose secrets 3 子段、rust-api hardening helper 簽名、migration entrypoint wrapper、redis shell expand、postgres `POSTGRES_PASSWORD_FILE`、雙寫紀律驗證路徑。

對齊 W-F1 contracts C-D1~C-D7 / W-F3 contracts C-C1~C-C11 風格(Subject + MUST / MAY / MUST NOT clauses + Verification)。

---

## C-S1:`deploy/secrets/` 目錄結構

**Subject**:`deploy/secrets/` outer repo root 子目錄(new in W-F4)。

**MUST**:
- 含至少 5 個 `*.txt.example` 範本(git-tracked):`jwt_secret.txt.example` / `database_url.txt.example` / `redis_url.txt.example` / `postgres_password.txt.example` / `redis_password.txt.example`
- 每個 `*.txt.example` 為 1 行 placeholder content(無 in-file comment、operator cp 後直接編輯填值)
- 不含 `*.txt` 實際 secret 檔(由 operator 編輯後生成、gitignored)
- 雙寫紀律說明放 `deploy/secrets/README.md`(新建)+ `.env.example` 註解區段

**MUST NOT**:
- 不在 `.txt.example` 內加 `#`-prefix comment(operator 易忘刪)
- 不 commit 任何 `*.txt`(實際 secret)

**Verification**:`ls deploy/secrets/*.txt.example | wc -l` → 5;`ls deploy/secrets/*.txt 2>/dev/null | wc -l` → 0(operator 編輯前);`cat deploy/secrets/jwt_secret.txt.example` → 1 行內容、不含 `#`。

---

## C-S2:`.gitignore` 規則

**Subject**:outer `.gitignore`(W-F4 改)。

**MUST**:
- 含規則 `/deploy/secrets/*.txt`(leading `/` 錨定 repo root)
- 規則精準度:不 ignore `*.txt.example`(glob 自然不 match;可選加 `!/deploy/secrets/*.txt.example` negation 顯式 future-proof)

**MUST NOT**:
- 不寫 `**/secrets/*.txt`(過寬、可能 match 其他 nested 目錄)
- 不寫 `deploy/secrets/*`(會 ignore `.example` 範本、破壞 git tracking)

**Verification**:`grep -E "^/?deploy/secrets" .gitignore` → 命中至少 1 行 `.txt` 規則;`cp deploy/secrets/jwt_secret.txt.example deploy/secrets/jwt_secret.txt && git status` → `jwt_secret.txt` 不在 untracked list(cleanup:`rm deploy/secrets/jwt_secret.txt`)。

---

## C-S3:`docker-compose.yml` top-level `secrets:` 段

**Subject**:outer `docker-compose.yml`(W-F4 改、加 top-level `secrets:` 段)。

**MUST**:
- 有 top-level `secrets:` 段、5 個 entry:`jwt_secret` / `database_url` / `redis_url` / `postgres_password` / `redis_password`
- 每個 entry 用 `file:` directive 指 `./deploy/secrets/<name>.txt`(relative to compose project root)
- 用 long-syntax(`file:`)、不用 external secret(swarm 才需要)

**MUST NOT**:
- 不用 `external: true`(swarm 模式、單機 docker-compose 不適用)

**Verification**:`docker compose config | grep -A 12 "^secrets:"` → 5 個 entry 展開、每 entry 有 `file: ./deploy/secrets/...`;`docker compose config` exit code 0(無 syntax error)。

---

## C-S4:Service-level `secrets:` reference

**Subject**:4 個 service(postgres / redis / migration / rust-api)的 `secrets:` 段引用。

**MUST**:
- `postgres` service:`secrets:` 含 `- postgres_password`
- `redis` service:`secrets:` 含 `- redis_password`
- `migration` service:`secrets:` 含 `- database_url`
- `rust-api` service:`secrets:` 含 `- jwt_secret`、`- database_url`、`- redis_url`(3 個)
- 用 short syntax(`- <secret_name>`)— default mount path `/run/secrets/<secret_name>` 自動對齊 `_FILE` env value

**MAY**:
- long syntax(`source / target / uid / gid / mode`)在需要 custom mount path / mode 時用;W-F4 不需要

**MUST NOT**:
- `base-web` service 不引用任何 secret(frontend 不需要、保持 minimal)

**Verification**:`docker compose config | grep -B 1 -A 4 "secrets:" | head -40` → 4 個 service 的 secrets section + 對應 secret name 引用清單。

---

## C-S5:Service-level `environment:` 改動(`_FILE` 變量替換)

**Subject**:`rust-api` / `postgres` 的 environment 段(W-F4 改);`redis` / `migration` 透過 command / entrypoint(C-S6 / C-S7)。

**MUST**:
- `rust-api` 加 3 個 `_FILE` env:
  - `APP_JWT_JWT_SECRET_FILE=/run/secrets/jwt_secret`
  - `APP_DATABASE_URL_FILE=/run/secrets/database_url`
  - `APP_REDIS_URL_FILE=/run/secrets/redis_url`
- `rust-api` 移除 W-F3 既有 `APP_JWT_JWT_SECRET` / `APP_DATABASE_URL` / `APP_REDIS_URL` 3 個直接 env(避免 mode 混淆;dev fallback 走 `.env` uncomment、非 compose env)
- `postgres` 改 `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password`、移除 `POSTGRES_PASSWORD` 直接 env
- `postgres` 維持 `POSTGRES_USER` 與 `POSTGRES_DB` direct env(非 secret)

**MUST NOT**:
- 不 hardcode secret value to env
- 不留 `APP_JWT_JWT_SECRET` 與 `APP_JWT_JWT_SECRET_FILE` 並存於 compose `environment:`(production 模式單一路徑;dev 經由 `.env` direct override 也只一條路活)

**Verification**:`docker compose config | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)|POSTGRES_PASSWORD"` → 只命中 `*_FILE` 變量(指向 `/run/secrets/...`)、無明文 secret。

---

## C-S6:`migration` service entrypoint wrapper

**Subject**:`migration` service 的 entrypoint 改動(W-F4 加)。

**MUST**:
- 用 compose `entrypoint:` directive override image default ENTRYPOINT
- 形式:`entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]`(注意 `$$` 為 compose escape、per analyze I2)
- 最後一句 MUST `exec` 取代 wrapper process(per R-007、信號處理正確)
- `secrets:` 段含 `database_url` reference

**MUST NOT**:
- 不在 wrapper 內 `&&` 串多個命令(失去 exit code 解耦)
- 不留 W-F3 既有 `DATABASE_URL: postgres://...` env(否則 wrapper expand 與 env 衝突)

**Verification**:`docker compose config | grep -A 3 "service: migration"` → entrypoint 含 `sh -c` + `cat /run/secrets/database_url` + `exec /usr/local/bin/migration up`;`docker compose up migration` → migration 跑完 exit 0(per W-F3 service_completed_successfully 條件)。

---

## C-S7:`redis` service command shell expand

**Subject**:`redis` service `command:` 改動(W-F4 改 shell expand 來源)。

**MUST**:
- 維持 W-F3 既有 shell form `["sh", "-c", "..."]`
- shell 內容(yaml literal):`redis-server --requirepass "$$(cat /run/secrets/redis_password)"`(注意 `$$` 為 compose escape、per analyze I2;render 後 shell 看到 `$(cat ...)` 做 substitution)
- `secrets:` 段含 `redis_password` reference

**MUST NOT**:
- 不用 exec form(`["redis-server", "--requirepass", "$(cat ...)"]` — `$(cat)` 不 expand)
- 不從 env 讀 password(W-F4 移除 `REDIS_PASSWORD` env、`.env` comment-out 預設)

**Verification**:`docker compose config | grep -A 2 "service: redis"` → command 為 sh form + `cat /run/secrets/redis_password`;stack 起後 `docker compose exec redis redis-cli -a "$(docker compose exec redis cat /run/secrets/redis_password)" PING` → `PONG`。

---

## C-S8:rust-api `secret_loader.rs` 2 個新 helper 簽名

**Subject**:`rust-api/server/config/src/secret_loader.rs` 加 2 個 public helper fn(W-F4 改)。

**MUST**:
- 簽名 1:`pub fn apply_database_url_hardening(database: &mut DatabaseConfig)`
- 簽名 2:`pub fn apply_redis_url_hardening(redis: &mut RedisConfig)`
- 行為:呼叫 F1.1 `load_secret_from_file_if_set(<KEY>)`;若 Some → override `database.url` / `redis.url`;若 None → 不動(envvar fallback 由 config-rs 自動處理 per R-003)
- 不引入新 dependency、不改 `Cargo.toml`、reuse F1.1 既有 `load_secret_from_file_if_set` helper

**MUST NOT**:
- 不對 database_url / redis_url 加 strict validation(URL format / placeholder check)— per R-011 / spec.md FR-010、URL 格式驗交給 sea-orm / redis crate
- 不 panic on `_FILE` not set(per F1.1 既有紀律、dev fallback 必要)

**Verification**:`cargo build --package server_config` 成功;`cargo test --package server_config secret_loader` 跑通(含 W-F4 新增 3 test);`grep "pub fn apply_database_url_hardening\|pub fn apply_redis_url_hardening" rust-api/server/config/src/secret_loader.rs` → 命中 2 行 fn signature。

---

## C-S9:`config_init.rs` callsite 並列加 call

**Subject**:`rust-api/server/config/src/config_init.rs` 既有 2 callsite(`init_from_file()` + `init_global_config()`)後並列加 2 個新 helper call(W-F4 改)。

**MUST**:
- Callsite 1(`init_from_file` 大致 line 69):
  ```rust
  secret_loader::apply_jwt_secret_hardening(&mut jwt_config);
  secret_loader::apply_database_url_hardening(&mut config.database);
  secret_loader::apply_redis_url_hardening(&mut config.redis);
  ```
- Callsite 2(`init_global_config` 大致 line 415):同模式
- 2 callsite 內 W-F4 新增 2 行 call MUST 在 F1.1 既有 jwt call **之後**並列(jwt → database → redis 順序)、無依賴但 logical grouping 統一

**MUST NOT**:
- 不在 `EnvConfigLoader::load()` 內加 call(W-F4 helper 是 post-load 階段、必須在 yaml load + env override 都完成後)
- 不漏掉任一 callsite(2 個都要加;若 callsite 不對齊 → unit test 涵蓋不到 / integration test 才抓)

**Verification**:`grep -n "apply_database_url_hardening\|apply_redis_url_hardening" rust-api/server/config/src/config_init.rs` → 命中 2 處(各 callsite 各 2 行 = 4 行)、line number 應在 F1.1 既有 `apply_jwt_secret_hardening` 行下方。

---

## 結論

9 個 contract 涵蓋 W-F4 所有改動的結構約束:
- C-S1 / C-S2:`deploy/secrets/` 目錄結構 + `.gitignore` 規則
- C-S3 / C-S4 / C-S5 / C-S6 / C-S7:`docker-compose.yml` 改動 5 個層面(top-level secrets / service ref / env `_FILE` 替換 / migration entrypoint wrapper / redis shell expand)
- C-S8 / C-S9:rust-api 改動(2 helper 簽名 + 2 callsite 並列加 call)

acceptance scenarios(quickstart.md)分 5 個 Dimension(A-E)對應 spec.md 13 個 scenarios。
