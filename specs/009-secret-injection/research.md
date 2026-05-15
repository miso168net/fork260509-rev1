# Research: W-F4 — secret-injection

**Phase 0 output** — 解 plan.md Technical Context 11 個 unknown / dependency / pattern 點。

對齊 W-F3 R-001~R-011 風格;3-line format (Decision / Rationale / Alternatives considered)。

---

## R-001:F1.1 helper 推廣模式(generic _FILE resolution 機制選擇)

**Decision**:**Option C 為主 + EnvConfigLoader filter `_FILE` 為輔(W-F4 implement 階段 amendment、commit `adf5f4c`)** — 沿 F1.1 `apply_jwt_secret_hardening()` 顯式 helper + callsite 模式,加 2 個 type-specific helper(`apply_database_url_hardening(&mut DatabaseConfig)` + `apply_redis_url_hardening(&mut RedisConfig)`)、在既有 2 callsite(`config_init.rs:69` 與 `:415`)後並列加 call。**Plus**:`EnvConfigLoader::load()` 內 build filtered HashMap 排除 `<prefix>_*_FILE` keys、傳給 `Environment::source(Some(map))`、避免 config-rs Environment source mis-parse `_FILE` env(W-F4 acceptance scenario 12 first run 抓到 bug)。

**Rationale**:
- F1.1 既有 helper 證明 callsite + post-load override 模式 work、結構穩定;W-F4 是「**推廣 callsite scope**」+「pre-filter env source」 兩個動作組合
- `config-rs` Environment source 對 `_FILE` 後綴有 separator 衝突 — `APP_DATABASE_URL_FILE` 會被 `_` separator split 為 `database.url.file`(3 層 nested),與 yaml schema `database.url: String` 衝突;`load()` 階段就 panic `"invalid type: map, expected a string"`、helper 來不及 override
- 解法配對:(a) helper post-load 處理 `_FILE` 讀檔 + override;(b) EnvConfigLoader pre-load 用 `Environment::source(Some(filtered_map))` filter 掉 `_FILE` env vars、保證 load 階段不 fail。`_FILE` env vars 仍留在 process env、helpers 可讀
- `config-rs 0.15.13` `Environment::source(Some(HashMap<String, String>))` 提供清晰 filter point;不需 mutate process env(本來 R-001 假設「無 hook」是 mistake、W-F4 implement 階段 amendment)
- Type-specific helper 比 generic `apply_secret_hardening(&str envvar, &mut String target)` 更 type-safe、IDE 跳轉清楚、test 顯式

**Alternatives considered**:
- (a-original) Refactor `EnvConfigLoader::load()` 加 `_FILE` resolver loop(取代 config-rs 處理 `_FILE`)— **拒**:取代 config-rs 整個 env loading 為 custom 邏輯、失去 type-safe DeserializeOwned 流程;**filter 比 replace 簡單 100×**
- (b) Generic `apply_secret_from_file(&str envvar, &mut String target)` 單一 helper + 3 callsite — **拒**:loss type-safety、callsite 重複度沒下降(F1.1 既有 callsite 仍 2 點)、IDE 跳轉差;type-specific 更直觀
- (c) Trait-based `SecretFromFile::apply(&mut self)` for each Config struct — **拒**:over-engineering for 3 field、增加 1 layer abstraction、無實際收益
- (d) 用 `std::env::remove_var` 暫時移除 `_FILE` env vars(load 後再 set 回)— **拒**:race condition unsafe;`Environment::source(Some(map))` 是 cleaner 替代

---

## R-002:`DatabaseConfig.url` 與 `RedisConfig.url` field 結構

**Decision**:`DatabaseConfig { url: String, max_connections, min_connections, connect_timeout, idle_timeout }` 與 `RedisConfig { mode: String, url: String, ... }` 都用 **single URL field**(`pub url: String`);整 URL 含 user/pass/host/port/dbname 全部 embed。

**Rationale**:
- application.yaml 對應 yaml 段 `database.url = "postgres://soybean:soybean@123.@pgbouncer:6432/soybean_admin_rust"` 與 `redis.url = "redis://:123456@redis:6379/10"`(grep 確認)
- 整 URL pattern 對齊「`database_url.txt` 1 行 secret value」trivially;W-F4 不需 URL builder
- 之後若要拆 user/pass/host(per W-F15 backup credential 不同 user),亦不破 W-F4 設計

**Alternatives considered**:
- (a) 把 DATABASE_URL secret 拆為 PG_USER / PG_PASSWORD / PG_HOST 3 file — **拒**:需在 rust-api 加 URL builder、`postgres_password.txt` 與 `database_url.txt` 雙寫紀律(per clarify Q2)就為了避此 split、保持 simple
- (b) yaml file 完全棄、只走 env — **拒**:範疇外、W-F3 既有 yaml + env override 模式維持(dev 體驗一致)

---

## R-003:`APP_DATABASE_URL` / `APP_REDIS_URL` bare envvar 是否走得通?

**Decision**:**YES** — `APP_DATABASE_URL` config-rs split 為 `database.url`、`APP_REDIS_URL` split 為 `redis.url`、與 yaml field 對齊乾淨;W-F4 envvar fallback(dev mode、`_FILE` not set 時)**完全沿用 config-rs Environment source** 路徑、無需 explicit read。

**Rationale**:
- F1.1 之所以要 explicit read `APP_JWT_JWT_SECRET` 是因為 yaml field 為 `jwt.jwt_secret`(中間有 `_`),split 後變 `jwt.jwt.secret`(三層)而非 `jwt.jwt_secret`
- DATABASE_URL / REDIS_URL 的 field name 只有 `url` 不含 `_`,**無 ambiguity**
- 因此 W-F4 helper 只需處理 `_FILE` precedence(`_FILE` set 則 override),envvar fallback 走 config-rs 自動 work

**Alternatives considered**:
- (a) 仍 explicit read `env::var("APP_DATABASE_URL")` to be safe — **拒**:增加冗餘代碼、F1.1 註解明示「only 為 `_` ambiguity」例外、不 general apply
- (b) 改 yaml field name 為 `database.url` ↔ 已是此名,無 action 需做

---

## R-004:F1.1 callsite 位置與 W-F4 並列加 call 模式

**Decision**:W-F4 在 F1.1 既有 callsite 同位置加 2 行新 call,**並列**形式:
```rust
// F1.1 既有
secret_loader::apply_jwt_secret_hardening(&mut config.jwt);
// W-F4 加
secret_loader::apply_database_url_hardening(&mut config.database);
secret_loader::apply_redis_url_hardening(&mut config.redis);
```
2 個 callsite:`config_init.rs:69`(`init_from_file()`)+ `config_init.rs:415`(`init_global_config()`)。

**Rationale**:
- F1.1 既有路徑驗過、knowingly-good pattern;W-F4 推廣 callsite 不發明新位置
- 同位置並列保證初始化順序:yaml load → env override → secret hardening(file > envvar > yaml)、無 race
- 若 1 個 callsite 漏加(常見維護錯),test 容易抓(unit test cover each helper)

**Alternatives considered**:
- (a) 加在 callsite 之前 — **拒**:config 還沒 load 完、hardening 沒對象
- (b) 包成 1 個 `apply_all_secret_hardening(&mut Config)` 統一 helper — **可接受替代**:tasks 階段判斷,若 W-F4 完成後 W-F-future 還要加更多 secret 則 refactor;current 3 個 hardening 維持顯式 call

---

## R-005:postgres image `POSTGRES_PASSWORD_FILE` 行為

**Decision**:postgres official image entrypoint `docker-entrypoint.sh` 識別 `POSTGRES_PASSWORD_FILE` env、讀檔內容後 set 為 `POSTGRES_PASSWORD`(in-memory、entrypoint 結束後 unset);與既有 `POSTGRES_USER` + `POSTGRES_DB` env 共存無衝突。

**Rationale**:
- postgres image 官方文件明示此模式(`docker_secrets` 段);is image-native、不需 wrapper
- W-F3 既有 `POSTGRES_USER` 與 `POSTGRES_DB` 留 env、`POSTGRES_PASSWORD` 移除、加 `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password` — 最 minimal 改

**Alternatives considered**:
- (a) 全 3 個 env 都改 `_FILE` — **拒**:`POSTGRES_USER_FILE` / `POSTGRES_DB_FILE` 是 image-native 但 user/db 非 secret(無敏感性)、無需上 secret 管控
- (b) 自寫 postgres image entrypoint — **拒**:image 維護負擔、image-native 機制已足

---

## R-006:redis container shell expand 從 secret file 讀 password

**Decision**:redis container `command:` 必須是 `["sh", "-c", "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]` **shell form**(per W-F3 R-002 + analyze I2);`$$` 為 compose escape、確保 shell 在 runtime expand `$(cat ...)`;exec form `["redis-server", "--requirepass", "$$(cat ...)"]` **不**work — exec form 無 shell expansion。

**Rationale**:
- Docker exec form 直接 exec、無 sh 中介、`$(cat ...)` 為字面字串
- Shell form `["sh", "-c", "..."]` 跑 `/bin/sh -c <cmd>`、shell 做 `$(cat)` substitution、然後 `redis-server` 接到 expanded value
- W-F3 既有 redis command 已是 shell form(R-006 sticky)、W-F4 只改 expand source 為 `$$(cat /run/secrets/redis_password)` 取代 `$REDIS_PASSWORD`(`$$` 為 compose escape per analyze I2)

**Alternatives considered**:
- (a) 自寫 redis entrypoint script:`/usr/local/bin/redis-entrypoint.sh` 內讀 file → set env → exec redis-server — **拒**:redis image 無 `_FILE` native、自寫 script 等於 vendor lock-in、需 build custom image;W-F4 不擴 image scope
- (b) `redis.conf` file mount 含 `requirepass <plaintext>` — **拒**:plaintext in config file、與 _FILE 紀律相違;此外 conf file 需 secret 化、雙 secret 管理麻煩

---

## R-007:migration service entrypoint wrapper `exec` 必要性

**Decision**:wrapper 內最後一句 MUST `exec /usr/local/bin/migration up`(不可省 `exec`);否則 wrapper shell 為 PID 1、migration process 為 PID 2、container signal(SIGTERM)落到 wrapper 而非 migration、cleanup 異常。

**Rationale**:
- container PID 1 是 init responsibility(zombie reap + signal forward)、shell 不擔此責任
- `exec /usr/local/bin/migration up` 把 process image 換成 migration、PID 1 變成 migration、signal 直接 forward
- W-F4 migration 雖 one-shot,但 init container 規範同此

**Alternatives considered**:
- (a) wrapper 不 exec、用 `&&` 串 — **拒**:wrapper exit code 與 migration 解耦、`docker compose` healthcheck 與 `service_completed_successfully` 條件抓不到 migration 真實 exit code
- (b) wrapper 用 `tini` init helper — **拒**:rust-api image 沒裝 tini、為 W-F4 加 dep 不值;`exec` 已足

---

## R-008:`deploy/secrets/*.txt` 檔案 mode

**Decision**:operator 自設(W-F4 acceptance 不 enforce);Docker secret mount 後 container 內為 read-only tmpfs、mode 0444、owner root;**host 端 .txt 檔案 mode 不影響 container 內讀檔**(只影響 host filesystem 安全性、操作員職責)。

**Rationale**:
- Docker secret 的 source file 在 mount 過程被 docker daemon 讀並 copy 到 container tmpfs;source mode 不傳染
- host 端 .txt 的 mode 是 operator 的 host security policy responsibility、不在 W-F4 範疇
- 推薦 `chmod 0600 deploy/secrets/*.txt`(只 owner readable)— 寫進 quickstart.md 但不 acceptance enforce

**Alternatives considered**:
- (a) acceptance test 加 `stat -c '%a' deploy/secrets/*.txt` 驗 0600 — **拒**:operator UX 太嚴、CI/dev 場景常常無法 enforce、本 W-F4 範疇是 _FILE pattern 不是 host security policy
- (b) compose secrets `file:` 加 `mode:` option — **不存在**:`secrets:` long-syntax 無 mode option

---

## R-009:`.gitignore` 規則精準度

**Decision**:`.gitignore` 加 2 行:
```
/deploy/secrets/*.txt
!/deploy/secrets/*.txt.example
```
(第二行是 negation pattern 確保 `.txt.example` 仍 git-tracked;雖然 `*.txt` 不含 `.txt.example`、但 future-proof)

**Rationale**:
- glob `*.txt` 不 match `*.txt.example`(`.example` 後綴讓 file extension 變 `.example`)、原則上不需 negation
- 但 negation 提供「intent 顯式聲明」、防後續手滑改 ignore rule 為 `deploy/secrets/*` 把 `.example` 一起 ignore
- 路徑用 `/deploy/secrets/...`(leading `/` 錨定 repo root)、避免 match 任何 nested directory 內同名

**Alternatives considered**:
- (a) 只寫 `/deploy/secrets/*.txt`、無 negation — **可接受替代**:tasks 階段判斷;若簡化偏好則用此
- (b) `**/secrets/*.txt`(任意 nested)— **拒**:過寬、可能 match 其他無關目錄

---

## R-010:雙寫紀律 fail-fast 驗證路徑

**Decision**:**不**需額外 startup validation 機制;若 `database_url.txt` 內 password 與 `postgres_password.txt` 不一致 → rust-api Sea-ORM connection pool init 失敗(authentication failed) → rust-api panic / exit / healthcheck unhealthy → `docker compose ps` 顯示 unhealthy → acceptance scenario 12(/health 200)fail-fast 抓到。

**Rationale**:
- 系統自然失敗路徑已涵蓋此 case、不需 W-F4 加額外 cross-secret consistency check
- 額外 startup script(讀兩 file + compare password 段)增加 complexity、且要 parse URL 取 password 段(易錯)
- operator UX:`docker compose ps` + `docker compose logs rust-api` 看 auth failed 訊息、自然 debug 路徑

**Alternatives considered**:
- (a) 加 init container 比對 2 個 secret 一致性 — **拒**:增加 1 service、複雜度 vs 邊際收益不對稱(operator 自己會看)
- (b) rust-api startup 額外讀 `postgres_password.txt` 自驗 — **拒**:rust-api 不需要 postgres_password(它用整 URL),引入額外 dependency 違反 single-responsibility

---

## R-011:dev fallback envvar 紀律與 F1.1 行為對齊

**Decision**:W-F4 新 helper(`apply_database_url_hardening` + `apply_redis_url_hardening`)沿 F1.1 `apply_jwt_secret_hardening` 精準同 precedence:
- 1. `<KEY>_FILE` (highest)— 讀檔
- 2. `<KEY>` bare envvar(中度)— 走 config-rs Environment source(per R-003 此路 work)
- 3. yaml default(lowest)

`_FILE` not set 不 panic、走 yaml/envvar;`_FILE` set 但 file read fail panic。

**Rationale**:
- 與 F1.1 行為 100% 一致、operator 心智模型統一;只是 callsite 範圍從 jwt 擴 db/redis
- Dev fallback(`.env` 直接 `APP_DATABASE_URL=postgres://...` + 不設 `_FILE`)自然 work、無需特別處理
- F1.1 既有 panic message style(含 file path + 修正建議)沿用 for W-F4

**Alternatives considered**:
- (a) DATABASE_URL strict validation(類 jwt_secret 的 length / placeholder check)— **拒**:URL 格式驗證屬 config-rs / sea-orm 範疇、不在 secret_loader 責任;若 URL 格式錯 sea-orm pool init 會抓
- (b) `_FILE` 缺省 fallback 改為「panic instead of envvar」— **拒**:破壞 dev fallback、與 F1.1 紀律相違、清白 violate clarify Q1 預期

---

## 結論

W-F4 設計沿 F1.1 既有 pattern 推廣 callsite scope、沿 W-F3 既有 docker-compose 結構加 secrets 配置。無新機制引入、無新 dependency、無 base-web / nginx / nestjs 動。**Constitution gate 23/23 PASS、0 violation**(per plan.md Constitution Check)。可進 Phase 1 (data-model + contracts + quickstart)。
