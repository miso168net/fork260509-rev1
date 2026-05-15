---
description: "Task list for W-F4 secret-injection implementation"
---

# Tasks: W-F4 — secret-injection

**Input**: Design documents from `/specs/009-secret-injection/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/secret-injection.md`](contracts/secret-injection.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- **rust unit test**(3 個):`server_config::secret_loader` 加 W-F4 hardening helper test(對齊 F1.1 既有 test)
- **integration**:`docker compose config` 渲染驗 + `docker compose up + ps` stack 啟動驗(per quickstart.md 13 scenarios)
- **acceptance**:per quickstart.md Dimension A-E

**Organization**:W-F4 為單一 P1 user story feature;Setup + Foundational(F1.1 baseline + W-F3 stack baseline verify)+ US1(rust-api source 6 + worktree commit 3 + outer infra 6 + acceptance 13 + cleanup 1 共 29)+ Polish(**兩段 commit** per CLAUDE.md §6.1 — W-F4 動 rust-api worktree)四階段。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案編輯 / 獨立 docker command / 獨立 grep 操作)
- **[Story]**:僅 User Story phase 用 `[US1]` 標籤
- 路徑:
  - outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(默認)
  - rust-api worktree = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api/`(亦 `~/x_Project/fork260509-rev1/rust-api/`)

## Path Conventions

- **Outer (009-secret-injection feature branch)**:
  - 新建:`deploy/secrets/{jwt_secret,database_url,redis_url,postgres_password,redis_password}.txt.example` / `deploy/secrets/README.md`
  - 修改:`docker-compose.yml` / `.env.example` / `.gitignore` / `CLAUDE.md` SPECKIT marker(plan 階段已動)/ `.specify/feature.json`(specify 階段已動)
  - spec docs:`specs/009-secret-injection/`
- **rust-api worktree(rev1-admin-rust-api 分支)**:
  - 修改:`server/config/src/secret_loader.rs` / `server/config/src/config_init.rs`
- **Acceptance test 執行**:outer repo root(`docker compose ...`)+ rust-api worktree(`cargo test ...`)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch 為 `009-secret-injection`,執行 `git branch --show-current && git status --short`(預期 branch=009-secret-injection、無 uncommitted source 改動;spec docs 7 個 untracked 為 specify+plan 階段產出)
- [ ] T002 [P] 確認 rust-api worktree 分支為 `rev1-admin-rust-api`,執行 `cd rust-api && git branch --show-current && git status --short && cd ..`(預期 branch=rev1-admin-rust-api、worktree clean)
- [ ] T003 [P] 確認 docker compose v2+,執行 `docker compose version`(預期 v2.x;per W-F3 R-007 sticky)
- [ ] T004 [P] 確認 W-F1 / W-F2 image 本地存在,執行 `docker image ls --filter "reference=rust-api:*" --filter "reference=base-web:*"`(預期 2 image 列表非空)
- [ ] T005 [P] 確認 W-F3 baseline 可起,執行 `docker compose config > /dev/null && echo OK`(預期 OK、W-F3 既有 yaml 無 syntax error;W-F4 從此 baseline 改起)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:F1.1 既有實作 audit + W-F3 既有 stack 操作 baseline、確認改 W-F4 不破既有契約。

- [ ] T010 讀 `rust-api/server/config/src/secret_loader.rs` 全檔,確認 F1.1 既有 `load_secret_from_file_if_set(&str)` helper 簽名與 `apply_jwt_secret_hardening(&mut JwtConfig)` callsite 與 `PLACEHOLDER_SECRETS` 黑名單(W-F4 reuse、不改既有)
- [ ] T011 讀 `rust-api/server/config/src/config_init.rs` 並 grep `apply_jwt_secret_hardening` 命中行號,確認 2 callsite 位置(分別在 `init_from_file()` 與 `init_global_config()` 內;W-F4 在這 2 callsite 後並列加 call)
- [ ] T012 [P] 讀 `rust-api/server/config/src/model/database_config.rs` 與 `model/redis_config.rs`,確認 `DatabaseConfig.url` 與 `RedisConfig.url` 為 `pub url: String` single field(per research.md R-002)
- [ ] T013 [P] 讀 `rust-api/server/resources/application.yaml` `database:` 與 `redis:` 段,記下 yaml default URL 值(W-F4 後仍為 lowest precedence)
- [ ] T014 [P] 跑 W-F3 baseline acceptance: clean start `docker compose down -v && docker compose up -d && sleep 60 && docker compose ps`(預期 5 service healthy、W-F3 模式起得來;之後 down 留 W-F4 改動驗;`docker compose down`)
- [ ] T015 讀 `docker-compose.yml` 全檔,記下 W-F3 既有 `services:` 5 個 service 的 `environment:` / `command:` 字段以便 W-F4 改寫對照(rust-api / postgres / redis / migration / base-web)

---

## Phase 3: US1 Implementation — rust-api source 改動(secret_loader + config_init + unit test)

**Goal**:rust-api `secret_loader.rs` 加 2 helper fn + `config_init.rs` 2 callsite 並列加 call + 3 unit test 覆蓋 file / precedence / envvar fallback。

**Independent Test**:`cd rust-api && cargo test --package server_config secret_loader -- --nocapture` 全 pass(含 F1.1 既有 + W-F4 新增 3 test)。

### rust-api worktree source(6 tasks)

- [ ] T020 [US1] 在 `rust-api/server/config/src/secret_loader.rs` 加 `pub fn apply_database_url_hardening(database: &mut DatabaseConfig)`(per contract C-S8 + data-model E4.2);呼叫 `load_secret_from_file_if_set("APP_DATABASE_URL")`、Some 時 override `database.url`;不對 URL 加 format validation
- [ ] T021 [US1] 在 `rust-api/server/config/src/secret_loader.rs` 加 `pub fn apply_redis_url_hardening(redis: &mut RedisConfig)`(per contract C-S8 + data-model E4.2);呼叫 `load_secret_from_file_if_set("APP_REDIS_URL")`、Some 時 override `redis.url`
- [ ] T022 [US1] 在 `rust-api/server/config/src/secret_loader.rs` 補必要 `use crate::{DatabaseConfig, RedisConfig};`(若不存在);確認 `cargo check --package server_config` 通過
- [ ] T023 [US1] 在 `rust-api/server/config/src/secret_loader.rs` 的 `#[cfg(test)] mod tests` 區塊加 3 個 unit test(per data-model E4.4):
  - `test_apply_database_url_hardening_from_file`:tempfile + `APP_DATABASE_URL_FILE` 設指 file path → call helper → 驗 `database.url == file content`
  - `test_apply_database_url_hardening_precedence`:同設 `_FILE` + bare envvar、驗 `_FILE` 優先 override
  - `test_apply_redis_url_hardening_from_file`:redis 同模式驗
  > **注意 test isolation**:test 內 `env::set_var()` 全 session 共享、可能影響其他 test;test 結尾 MUST `env::remove_var()` cleanup 並用 `std::sync::Mutex` lock 或單獨 file path 避免並發干擾(對齊 F1.1 既有 test 模式)
- [ ] T024 [US1] 在 `rust-api/server/config/src/config_init.rs` `init_from_file()`(F1.1 callsite line ~69)`apply_jwt_secret_hardening` 行**之後**並列加 2 行:`secret_loader::apply_database_url_hardening(&mut config.database);` + `secret_loader::apply_redis_url_hardening(&mut config.redis);`(per contract C-S9)
- [ ] T025 [US1] 在 `rust-api/server/config/src/config_init.rs` `init_global_config()`(F1.1 callsite line ~415)同模式並列加 2 行(per contract C-S9)

### rust-api worktree commit + push(第一段 commit、3 tasks)

- [ ] T026 [US1] 在 `rust-api` worktree 跑 `cargo test --package server_config secret_loader -- --nocapture`,驗 6 個(F1.1 既有 + W-F4 新增 3 個)test 全 pass(per quickstart.md scenario 9-11)
- [ ] T027 [US1] 在 `rust-api` worktree 跑 `cargo build --package server_config && cargo build --package server-bin`,驗 W-F4 改動不破 build(per contract C-S8 / C-S9)
- [ ] T028 [US1] 在 `rust-api` worktree commit 第一段:`git add server/config/src/secret_loader.rs server/config/src/config_init.rs` → conventional commit(中文 subject、per CLAUDE.md §6.3)→ `git push origin rev1-admin-rust-api`;範例 commit message:
  ```
  feat(config): W-F4 加 DATABASE_URL/REDIS_URL _FILE pattern hardening

  - secret_loader.rs 加 apply_database_url_hardening() + apply_redis_url_hardening() 2 個 helper
  - config_init.rs 2 callsite 並列加 call(沿 F1.1 模式推廣 jwt → db/redis)
  - 不動 EnvConfigLoader generic 邏輯(_ separator ambiguity per R-001)
  - 加 3 unit test cover file 優先 / precedence / envvar fallback

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
  push 須 user 同意 per CLAUDE.md §5;若 user 暫不 push,任務維持 staged + committed state

### outer infrastructure(6 tasks)

- [ ] T030 [US1] [P] 新建 `deploy/secrets/jwt_secret.txt.example`(1 行 placeholder `change-me-via-openssl-rand-hex-32`、無 in-file `#` comment;per data-model E2 + contract C-S1)
- [ ] T031 [US1] [P] 新建 `deploy/secrets/database_url.txt.example`(1 行 URL 範本 `postgres://soybean:CHANGE_ME@postgres:5432/soybean-admin`、無 in-file `#` comment)
- [ ] T032 [US1] [P] 新建 `deploy/secrets/redis_url.txt.example`(1 行 `redis://default:CHANGE_ME@redis:6379/0`、無 in-file `#` comment)
- [ ] T033 [US1] [P] 新建 `deploy/secrets/postgres_password.txt.example`(1 行 `CHANGE_ME_postgres_password`、無 in-file `#` comment)+ 新建 `deploy/secrets/redis_password.txt.example`(1 行 `CHANGE_ME_redis_password`、無 in-file `#` comment)
- [ ] T034 [US1] 新建 `deploy/secrets/README.md` 含**雙寫紀律說明**(per clarify Q2 Option A、data-model E2 decision):明示 `database_url.txt` 內 URL embedded password MUST = `postgres_password.txt` 純值;同理 `redis_url.txt` 與 `redis_password.txt`;不一致時 stack `/health` 失敗(per troubleshooting #3 #5)+ 生成指令範例(`openssl rand -hex 32` 等)
- [ ] T035 [US1] 修改 outer `.gitignore` 加 2 行(per contract C-S2 + research.md R-009):
  ```
  /deploy/secrets/*.txt
  !/deploy/secrets/*.txt.example
  ```

### docker-compose.yml + .env.example 改動(4 tasks)

- [ ] T036 [US1] 修改 `docker-compose.yml`:加 **top-level `secrets:` 段**(per contract C-S3 + data-model E3.1)5 個 entry,各 `file: ./deploy/secrets/<name>.txt`;放在 `volumes:` 段之後或 `networks:` 段之前
- [ ] T037 [US1] 修改 `docker-compose.yml`:**4 個 service 加 `secrets:` reference**(per contract C-S4 + data-model E3.2):
  - `postgres`:加 `secrets:` 含 `- postgres_password`
  - `redis`:加 `secrets:` 含 `- redis_password`
  - `migration`:加 `secrets:` 含 `- database_url`
  - `rust-api`:加 `secrets:` 含 `- jwt_secret` + `- database_url` + `- redis_url`
  - `base-web`:**不加** `secrets:` 段(per C-S4 MUST NOT)
- [ ] T038 [US1] 修改 `docker-compose.yml` 4 個 service `environment:` / `command:` / `entrypoint:`(per contract C-S5 / C-S6 / C-S7 + data-model E3.3):
  - `postgres.environment`:移除 `POSTGRES_PASSWORD`、加 `POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password`(保留 `POSTGRES_USER` + `POSTGRES_DB`)
  - `redis.command`:從 `[..., "redis-server --requirepass \"$REDIS_PASSWORD\""]` 改為 `[..., "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]`(注意 `$$` 為 compose escape、per analyze I2)
  - `migration`:**移除** W-F3 既有 `environment.DATABASE_URL` + 加 `entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]`(per contract C-S6 + analyze I2;`$$` 為 compose escape、確保 shell 在 runtime expand `$(cat ...)`、與 redis 寫法對齊;`docker compose config` 渲染後 expanded entrypoint 應顯示單 `$(cat ...)`)
  - `rust-api.environment`:移除 `APP_JWT_JWT_SECRET` / `APP_DATABASE_URL` / `APP_REDIS_URL`(直接 env 形式)、加 `APP_JWT_JWT_SECRET_FILE: /run/secrets/jwt_secret` + `APP_DATABASE_URL_FILE: /run/secrets/database_url` + `APP_REDIS_URL_FILE: /run/secrets/redis_url`
- [ ] T039 [US1] 修改 `.env.example`(per data-model E5):secret-class env 5 個(`APP_JWT_JWT_SECRET` / `APP_DATABASE_URL` / `APP_REDIS_URL` / `POSTGRES_PASSWORD` / `REDIS_PASSWORD`)改 comment-out 預設(以 `# ` 前綴),加 1 段 README-style comment 區段明示 prod(用 `deploy/secrets/*.txt`)vs dev(uncomment 上面 5 行)模式切換;保留 `COMPOSE_PROJECT_NAME` / `POSTGRES_USER` / `POSTGRES_DB` 直接設定

### Acceptance(per quickstart.md 13 scenarios + W-F3 regression、14 tasks)

- [ ] T040 [US1] **Dimension A scenario 1-3**:跑 `ls deploy/secrets/*.txt.example | wc -l`(預期 5)+ `grep -E "^/?deploy/secrets" .gitignore`(預期命中)+ `cp jwt_secret.txt.example jwt_secret.txt && git status --short | grep jwt_secret.txt`(預期不命中、`rm` cleanup)
- [ ] T041 [US1] **Dimension B scenario 4**:跑 `docker compose config | grep -A 12 "^secrets:"`,驗 5 個 entry 渲染、每 entry 含 `file: ./deploy/secrets/...`(per contract C-S3)
- [ ] T042 [US1] [P] **Dimension B scenario 5**:跑 `docker compose config | grep -B 1 -A 4 "secrets:" | head -40`,驗 4 service 各自 secrets reference 對(per C-S4)
- [ ] T043 [US1] [P] **Dimension B scenario 6**:跑 `docker compose config | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)|POSTGRES_PASSWORD"`,驗只命中 `*_FILE` 變量、無明文(per C-S5)
- [ ] T044 [US1] [P] **Dimension B scenario 7**:跑 `docker compose config | grep -A 3 'name:.*migration' | grep entrypoint`,驗 entrypoint 含 `sh -c` + `cat /run/secrets/database_url` + `exec /usr/local/bin/migration up`(per C-S6)
- [ ] T045 [US1] [P] **Dimension B scenario 8**:跑 `docker compose config | grep -A 3 'name:.*redis' | grep command`,驗 command 含 `sh -c` + `cat /run/secrets/redis_password`(per C-S7)
- [ ] T046 [US1] **Dimension D scenario 12**:operator 走 prod 流程 — cp 5 個 `.txt.example` 為 `.txt`、編輯填入測試值(注意雙寫紀律:`database_url.txt` 內 password 與 `postgres_password.txt` 一致、`redis_url.txt` 內 password 與 `redis_password.txt` 一致)、跑 `docker compose down -v && docker compose up -d && sleep 60 && docker compose ps`,驗 5 service 全 healthy(per spec FR-012 + quickstart.md scenario 12;此為 W-F4 主關卡)
- [ ] T047 [US1] **Dimension D scenario 13**:`docker compose exec rust-api env | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)"`,驗只 `*_FILE` 命中、無明文(per SC-002 + FR-013)
- [ ] T048 [US1] [P] **Dimension D scenario 14**:`docker compose exec redis ps aux | grep redis-server`,驗 command line 不直接含明文 password(注意 R-006 OS 行為差異 caveat — Linux `ps` 可能仍顯 expanded args、若如此 record exception in PR / W-F4 acceptance 仍視為 partial pass)
- [ ] T049 [US1] [P] **Dimension D scenario 15**:`docker compose exec rust-api curl -fsS http://localhost:11081/health`,驗 `ok`(per SC-004、F1.1 strict validation + DB/Redis 連線都 work)
- [ ] T050 [US1] **Dimension C scenario 9-11**:在 rust-api worktree 跑 `cargo test --package server_config test_apply_database_url_hardening_from_file test_apply_database_url_hardening_precedence test_apply_redis_url_hardening_from_file -- --nocapture`,驗 3 test pass(per SC-006 對應 FR-009/010/011)
- [ ] T051 [US1] **Dimension E scenario 16-17**(dev mode — per analyze U1 拍板:dev/prod 統一走 secrets file 模式、僅 secret 值差異):`docker compose down -v`、編輯 `deploy/secrets/*.txt` 改填 dev-friendly 值(例如 `jwt_secret.txt` 寫 `dev-jwt-secret-32-chars-padding-xxx`、`database_url.txt` 寫 `postgres://soybean:devpass@postgres:5432/soybean-admin`、postgres_password.txt 寫 `devpass`、redis_url 同理 + redis_password.txt)、跑 `docker compose up -d && sleep 60 && docker compose ps && docker compose exec rust-api curl -fsS http://localhost:11081/health`,驗 stack 起 + `/health` ok(per SC-007 + FR-016 新方向)
- [ ] T052 [US1] **Dimension E scenario 18**:切回 prod mode(`.env` re-comment secret env + cp 5 個 `.txt`)、`docker compose down -v && docker compose up -d && sleep 60`,跑 W-F3 quickstart.md 5 個 representative scenario(rust-api /health / base-web /health / getent postgres / getent redis / volume 持久化 down+up+psql),驗全 pass(per SC-005、FR-017)
- [ ] T053 [US1] **Cleanup**:`docker compose down -v` + `rm deploy/secrets/*.txt`(secret file 留 host 不入 git,但 acceptance 後可清乾淨;`.txt.example` 範本維持)

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**:第二段 commit(outer feature branch SHA bump + infra diff)+ merge 回 `rev1-admin-root` + INTEGRATION-CHECKLIST 更新。

- [ ] T060 outer 第二段 commit:`cd /home/anew/x_Project/fork260509-rev1 && git add docker-compose.yml .env.example .gitignore deploy/secrets/ specs/009-secret-injection/ CLAUDE.md rust-api`(`rust-api` 為 submodule、記 SHA bump);conventional commit(中文 subject、per CLAUDE.md §6.3);範例 commit message:
  ```
  feat(deploy): W-F4 secret-injection 落地(Docker secrets + _FILE pattern)

  - 新建 deploy/secrets/ 5 個 .txt.example 範本 + README(雙寫紀律說明)
  - docker-compose.yml 加 top-level secrets: + 4 service secrets ref + _FILE env 替換
  - migration service entrypoint wrapper 從 secret file 讀 DATABASE_URL
  - redis command shell expand 從 secret file 讀 password
  - postgres POSTGRES_PASSWORD_FILE(image-native)
  - .env.example secret env 改 comment-out 預設(dev mode 自行 uncomment)
  - .gitignore 加 deploy/secrets/*.txt 規則
  - rust-api SHA bump:<short SHA from T028> — W-F4 hardening helper 推廣
  - CLAUDE.md SPECKIT marker 更新(/speckit-plan 階段)

  Phase W deploy P1 達 100%(4/4),解鎖 P2(W-F5 front-nginx 等)。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- [ ] T061 跑 `git submodule status`,驗 rust-api SHA 對齊 outer pin(行首空格、無 `+`);如有 `+` 代表 worktree 已超前 outer pin、回頭重做 T060 確認 `git add rust-api` 已包進去
- [ ] T062 **Push 第二段 + 第一段**(若 T028 未 push):**須 user 同意 per CLAUDE.md §5**;`git push origin 009-secret-injection`(outer)+ 若 T028 未推則 `cd rust-api && git push origin rev1-admin-rust-api`
- [ ] T063 Merge 回 `rev1-admin-root`(user 同意後):`git switch rev1-admin-root && git merge --no-ff 009-secret-injection`、推 origin/rev1-admin-root
- [ ] T064 修改 `docs/INTEGRATION-CHECKLIST.md`:`Current Focus` 改為「Phase W deploy P1 達 100%(4/4)、解鎖 P2;W-F5 next」;`Phase W deploy Roadmap` 表 W-F4 列改 ✅ 完成、補 commit SHA;`已完成里程碑` 加 W-F4 條目(對齊 W-F3 條目風格);commit 此 doc 改動(可單獨 commit 或併入 T060 — 推薦獨立 `docs(checklist): W-F4 ...` commit 對齊 W-F3 模式)
- [ ] T065 修改 `CLAUDE.md` §10 SPECKIT marker:`Active feature` 改為「無(W-F4 全完成、解鎖 W-F5 等 P2)」;`Phase` 改為「Done」;`Previous features` 加 W-F4 條目 + merge SHA;commit(同 T064、可獨立 `docs: CLAUDE.md SPECKIT marker 更新 W-F4 完成`)

---

## Dependencies

- **P1 Setup**:全 prerequisite check、無內部依賴(T001-T005 可並行除 T001 須先;T002-T005 並行)
- **P2 Foundational**:依賴 P1 通過;T010-T015 內部 T010 → T011 序列(callsite 行號要靠 T010 內容找)、T012-T015 並行
- **P3 US1 Implementation**:
  - **rust-api source(T020-T025)**:依賴 P2;T020-T022 並行(同檔但邏輯獨立段)、T023 緊跟 T020/T021、T024-T025 並行(2 callsite)
  - **rust-api worktree commit(T026-T028)**:嚴格 sequence 在 T020-T025 後;T028 push 須 user 同意
  - **outer infra(T030-T035)**:可與 rust-api source 並行(完全獨立檔案);T030-T034 並行、T035 獨立
  - **compose + .env.example(T036-T039)**:依賴 outer infra T030-T035 部分(deploy/secrets/ 結構先存);T036 → T037 → T038 sequence(同檔)、T039 並行於 T036-T038
  - **acceptance(T040-T053)**:依賴 T020-T039 全完成;T040-T045 並行(grep 操作);T046 必 sequence(stack startup);T047-T049 sequential after T046(同 stack);T050 並行(rust-api worktree test、不需 stack);T051 須 stack down + reconfig + up;T052 須 stack reconfig + up;T053 cleanup
- **P4 Polish**:依賴 P3 全 acceptance pass;T060 → T061 → T062(push 須 user 同意)→ T063 → T064 → T065 嚴格 sequence;T064 與 T065 可並行(獨立 doc commit)

---

## Parallel Execution Examples

**P1 Setup 並行**(T002-T005):
```bash
docker compose version &
docker image ls --filter "reference=rust-api:*" --filter "reference=base-web:*" &
docker compose config > /dev/null &
(cd rust-api && git status --short && cd ..) &
wait
```

**P3 outer infra 並行**(T030-T034 5 個 .txt.example):
```bash
echo "change-me-via-openssl-rand-hex-32" > deploy/secrets/jwt_secret.txt.example &
echo "postgres://soybean:CHANGE_ME@postgres:5432/soybean-admin" > deploy/secrets/database_url.txt.example &
echo "redis://default:CHANGE_ME@redis:6379/0" > deploy/secrets/redis_url.txt.example &
echo "CHANGE_ME_postgres_password" > deploy/secrets/postgres_password.txt.example &
echo "CHANGE_ME_redis_password" > deploy/secrets/redis_password.txt.example &
wait
```

**P3 Acceptance Dimension B scenario 4-8 並行**(T041-T045):
```bash
# 各自獨立 grep,可同時跑
docker compose config | grep -A 12 "^secrets:" &
docker compose config | grep -B 1 -A 4 "secrets:" | head -40 &
docker compose config | grep -E "APP_(JWT|DATABASE|REDIS)" &
docker compose config | grep -A 3 'name:.*migration' | grep entrypoint &
docker compose config | grep -A 3 'name:.*redis' | grep command &
wait
```

---

## Implementation Strategy

### MVP scope(US1 唯一 P1 user story)

完成 P1 + P2 + P3(T001-T053)即達 **Phase W deploy P1 100% MVP**;P4 polish 為 commit + merge + docs(workflow finalization、非 implementation scope)。

### Incremental delivery 路徑(若需要 split)

W-F4 設計上**不適合 split**(per spec.md「Why this priority」5 條 — 5 個交付片段不可獨立交付)。若強制 split 只能:
- 段 1:rust-api source(T020-T028)+ deploy/secrets/(T030-T035)→ commit + push;此狀態 docker-compose.yml **未改**、rust-api 推廣的 helper 與 deploy/secrets/ 結構並未生效
- 段 2:docker-compose.yml + .env.example(T036-T039)+ acceptance(T040+)→ commit + push;才實際 work

不推薦此 split — 段 1 沒功能價值、acceptance 無法跑;**整批 W-F4 一個 PR / 1 個 feature branch 落地**對齊 spec 設計。

### Two-stage commit reminder(per CLAUDE.md §6.1)

W-F4 動 rust-api worktree(2 helper + 2 callsite),**兩段 commit 強制**:
- 第一段(T028):rust-api worktree → `git push origin rev1-admin-rust-api`(須 user 同意)
- 第二段(T060):outer feature branch + submodule SHA bump → `git push origin 009-secret-injection`(同須 user 同意)
- T063 merge 進 rev1-admin-root 後再次 push(第三次 user 同意)

---

## Format validation

✓ All **50** tasks 使用 `- [ ] T###` 格式
✓ Setup phase(T001-T005,5 個)無 [US1] 標籤 — 對
✓ Foundational phase(T010-T015,6 個)無 [US1] 標籤 — 對
✓ User Story phase(T020-T053,共 **33** 個)全部 [US1] 標籤 — 對
✓ Polish phase(T060-T065,6 個)無 [US1] 標籤 — 對
✓ [P] marker 標在獨立檔案編輯 / 獨立 docker config grep / 獨立並行 acceptance 操作上(共 **17** 個 [P]:Setup T002 / T003 / T004 / T005 + Foundational T012 / T013 / T014 + outer infra T030-T033 + acceptance T042-T045 / T048 / T049)
✓ 每個 task 含具體 file path / docker command / 操作 target

**Total**:**50** tasks(Setup 5 + Foundational 6 + US1 implementation 6 + US1 worktree commit 3 + US1 outer infra 6 + US1 compose 4 + US1 acceptance 13 + US1 cleanup 1 + Polish 6)

**Task count per user story**:**US1 = 33 tasks**(T020-T053)

**Parallel opportunities identified**:**17 個 [P]** task(主要在 setup pre-check / foundational reads / outer infra .txt.example 編寫 / acceptance grep 操作)

**Independent test criteria**:
- rust-api source test(T026):`cargo test --package server_config secret_loader` 全 pass(6 個含 F1.1 既有 3 + W-F4 新增 3)
- compose syntax(T041-T045):`docker compose config` 4 個 grep 命中正確
- stack acceptance(T046-T049):5 service healthy + /health + env 不洩 + redis ps + dev fallback 全通

**vs W-F1 (48 tasks) / W-F2 (40 tasks) / W-F3 (39 tasks) 比較**:W-F4 task 中等(46)、反映:
- 兩段 commit 增複雜度 vs W-F3 單段(類 W-F1 / W-F2 兩段模式)
- rust-api source 改動 minimal(6 task 含 unit test)、但要 unit test 覆蓋
- 13 個 acceptance scenarios(對 W-F3 的 18 個少、W-F4 安全性檢查更聚焦)
- 加 deploy/secrets/ 5 個 `.txt.example` 新建 + README + .gitignore 更動
