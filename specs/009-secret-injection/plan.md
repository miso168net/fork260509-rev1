# Implementation Plan: W-F4 — secret-injection

**Branch**: `009-secret-injection` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-secret-injection/spec.md`

## Summary

把 W-F3 過渡 secret 模式(`environment:` direct env)升級為 Constitution 規範的 prod 預設機制 **Docker secrets + `_FILE` pattern**。完成後 **Phase W deploy P1 達 100%(4/4)、解鎖 P2**(W-F5 front-nginx / W-F6 TLS / W-F7 對外 port 等)。

**Technical approach**(per [research.md](research.md)):

- **rust-api source 改動範圍 minimal**(per R-001):沿用 F1.1 `secret_loader.rs::load_secret_from_file_if_set()` helper、加 `apply_database_url_hardening(&mut DatabaseConfig)` + `apply_redis_url_hardening(&mut RedisConfig)` 兩個新 helper、在 F1.1 既有 2 callsite(`config_init.rs:69` + `config_init.rs:415`)後並列加 call。**不**動 `EnvConfigLoader` generic 邏輯;**不**改 config-rs Environment source 行為(避免 `_` separator ambiguity)。
- **5 secrets 落地**(per spec FR-004 + 雙寫紀律 clarify Q2):
  - `jwt_secret`(rust-api、F1.1 既有)
  - `database_url`(rust-api、整 URL 含 password embedded)
  - `redis_url`(rust-api、整 URL 含 password embedded)
  - `postgres_password`(postgres image native `POSTGRES_PASSWORD_FILE`、雙寫紀律須與 `database_url` 內 password 一致)
  - `redis_password`(redis container shell-expand `--requirepass`、雙寫紀律須與 `redis_url` 內 password 一致)
- **`migration` service entrypoint wrapper**(per clarify Q1 + analyze I2):compose 加 `entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]`(注意 `$$` 為 compose escape),**不**動 rust-api Dockerfile / migration source code。
- **docker-compose.yml 改動**:加 top-level `secrets:` 段(5 entries)+ 4 service `secrets:` reference(rust-api / migration / postgres / redis)+ rust-api `environment:` 換 3 個 `*_FILE` 變量 + postgres `environment:` 換 `POSTGRES_PASSWORD_FILE` + redis `command:` 改 `cat /run/secrets/redis_password` shell expand + migration `entrypoint:` 加 wrapper。**不**動 networks / volumes / depends_on / healthcheck 結構。
- **`deploy/secrets/` 結構**(per FR-001-003):5 個 `*.txt.example`(git-tracked,雙寫紀律註解 in `database_url.txt.example` + `postgres_password.txt.example` + 同理 redis)+ 5 個 gitignored `*.txt`(由 operator cp + 填值)+ outer `.gitignore` 加 `deploy/secrets/*.txt` 規則。
- **`.env.example` 更新**:secret-class env(APP_JWT_JWT_SECRET / APP_DATABASE_URL / APP_REDIS_URL / POSTGRES_PASSWORD / REDIS_PASSWORD)改 comment-out 預設(dev mode 自行 uncomment + 填值;prod mode 走 `deploy/secrets/*.txt`)。
- **Dev fallback 紀律**(per FR-016):rust-api 仍可 `APP_JWT_JWT_SECRET=<value>` direct env、F1.1 envvar fallback 邏輯保留(`_FILE` not set 時不 panic)。

**Pre-implement validation tasks**(per spec Assumptions):

- **T1**:`docker compose config` 渲染驗 syntax(per FR-004 + acceptance scenario 4-8)
- **T2**:`cargo test --package server_config` 跑 secret_loader.rs 既有 + 新增 unit test(per Dimension C scenario 9-11)
- **T3**:無 secret files 起 stack 驗 fail-fast(per edge case)
- **T4**:dev mode envvar fallback 驗(per FR-016 + acceptance scenario 16-17)

## Technical Context

**Language/Version**:Rust(rust-api 改 `server/config/src/secret_loader.rs` + `config_init.rs`,沿用 既有 cargo workspace)、docker-compose v2 file format(同 W-F3)、shell(POSIX `sh -c` for wrapper)

**Primary Dependencies**:
- **rust-api crate**:`server_config`(F1.1 `secret_loader.rs` + F1.1 `env_config.rs` + `model/database_config.rs` + `model/redis_config.rs`)
- **docker-compose secrets feature**:long-syntax `secrets:` top-level + service-level `secrets:` reference(compose v2+ 原生)
- **postgres image native `POSTGRES_PASSWORD_FILE`**(per spec Assumption)
- **shell `$(cat ...)` + `exec`**:migration entrypoint wrapper + redis command shell expand 同模式

**Storage**:
- **`deploy/secrets/`** outer repo root 新建子目錄、5 個 `.txt.example`(git-tracked)+ 5 個 `.txt`(gitignored)
- **container mount**:Docker secrets mount 到 `/run/secrets/<name>`(read-only tmpfs、mode 0444、root-owned by default)— rust-api appuser uid=10001 + postgres uid=999 + redis 內部 user 都能讀

**Testing**:
- **rust unit test**(per acceptance scenario 9-11):`server_config::secret_loader` 加 3 個 test cover database_url `_FILE` 優先 / envvar fallback / `_FILE > envvar` precedence
- **Compose syntax**:`docker compose config`(scenario 4-8)
- **Stack startup with secrets**:`cp deploy/secrets/*.txt.example *.txt + fill + docker compose up -d`(scenario 12-15)
- **Security**:`docker compose exec rust-api env | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)$"` 不應命中明文(scenario 13)
- **redis ps**:`docker compose exec redis ps aux | grep redis-server` 不應含 password(scenario 14)
- **Dev fallback**:`.env` 直接設 secret env + 刪 `deploy/secrets/*.txt` 起 stack(scenario 16-17)
- **W-F3 acceptance regression**:跑 W-F3 quickstart.md 5 個 representative scenario(6 / 7 / 9 / 10 / 11)

**Target Platform**:`linux/amd64`(per W-F1 Q2 inherit)

**Project Type**:infrastructure / deploy feature(rev1 deploy Phase W P1 第四個、**最後一個** — secret 安全性升級;混合 source(rust-api 2 callsite + 2 helper)+ infrastructure(`deploy/secrets/` 結構 + compose secrets 配置 + `.env.example` + `.gitignore`)

**Performance Goals**:
- Stack cold startup with secrets: < 60-90 sec(SC-001;對齊 W-F3、secret 讀檔 overhead < 100ms 可忽略)
- /health p99 latency:< 50ms(SC-004、對齊 W-F3 SC-003)
- rust-api startup time:< 5 sec(secret 讀檔 3 個 file × tens of ms 可忽略)

**Constraints**:
- `MUST NOT` 動 nestjs(Track A、留 W-FA1)
- `MUST NOT` 動 front-nginx / TLS / 對外 port(留 W-F5 / W-F6 / W-F7)
- `MUST NOT` 動 W-F1 image / W-F2 image / migration image 內部結構(per FR-023)
- `MUST NOT` 加自動 secret rotation 或 encryption-at-rest 機制(per FR-022)
- 雙寫紀律:`database_url.txt` 內 password 與 `postgres_password.txt` MUST 由 operator 手動對齊(per clarify Q2 Option A;不擴充 source builder)

**Scale/Scope**:
- 改動檔案數:8 個(outer 7 + rust-api 2 = 9 個檔)
  - outer:`docker-compose.yml`(改)、`.env.example`(改)、`.gitignore`(改)、`deploy/secrets/jwt_secret.txt.example`(新)、`deploy/secrets/database_url.txt.example`(新)、`deploy/secrets/redis_url.txt.example`(新)、`deploy/secrets/postgres_password.txt.example`(新)、`deploy/secrets/redis_password.txt.example`(新)
  - rust-api:`server/config/src/secret_loader.rs`(改 — 加 2 個 helper fn)、`server/config/src/config_init.rs`(改 — 2 callsite 後並列加 call)
- spec docs:plan / research / data-model / contracts / quickstart / tasks
- LOC 量級:rust-api ~80 行(2 helper fn 各 30-40 行)、outer ~50 行 net diff(compose 改 30 / `.env.example` 改 10 / `.gitignore` 改 1 / 5 `.txt.example` 各 2-3 行)
- **Commit 模式**:**兩段 commit**(per CLAUDE.md §6.1)— rust-api source 改動非 trivial(2 個新 helper + 2 callsite update)、worktree → fork remote + outer SHA bump + outer feature branch

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 `.specify/memory/constitution.md` v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ❌ **N/A**(W-F4 不動 Casbin / endpoint enforcement、純 infrastructure feature)
- **II. Soft Delete + Audit Log** — ❌ **N/A**(W-F4 不動 DB schema / 不寫 DB record)
- **III. 嚴版禁 Forward + 單一職責** — ❌ **N/A**(W-F4 不動 endpoint ownership / nginx config)
- **IV. base 不改動邊界** — ✅ **PASS**(W-F4 不動 base-web source code、只改 outer `.env.example` 與 base-web 完全無關)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-F4 不動 nestjs;DESIGN-A 退場時 W-F4 secrets 結構零改動 — 拔 nestjs service 不影響 5 secret entry 中任一)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **PASS**(W-F4 沿 W-F3 docker-compose、加 secrets 配置)
- **資料庫 PostgreSQL** — ✅ **PASS**(不動 schema、database_url secret 透傳)
- **快取 redis 必要** — ✅ **PASS**(不動 redis 功能、redis_url + redis_password secret 透傳)
- **TLS 對外** — ❌ **N/A**(W-F4 不涉對外流量、TLS 留 W-F6)
- **Secret 注入 Docker secrets + `_FILE`** — ✅ **PASS**(W-F4 **正是此約束的兌現** — 把 W-F3 過渡 `environment:` direct env 升 prod 預設機制)
- **DB migration trigger init container** — ✅ **PASS**(W-F3 migration init container 模式保留、W-F4 純加 entrypoint wrapper 從 secret file 讀 DATABASE_URL)
- **Port 規劃 `1XXXX`** — ❌ **N/A**(W-F4 不動對外 port、W-F3 internal 模式保留)
- **Observability promtail/Loki/prometheus** — ❌ **N/A**(留 W-F12+)
- **結構化 log JSON** — ❌ **N/A**(W-F4 不改 logging 行為)
- **Backup PITR** — ❌ **N/A**(留 W-F15)
- **背景工作 cleanup/outbox/backup** — ❌ **N/A**(留 W-F13+)
- **CI/CD platform** — ❌ **N/A**(留 W-F16+)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(specify → clarify → plan → tasks → implement → analyze 全跑、W-F4 已過 clarify 2 個 Q)
- **Constitution Check 紀律** — ✅ **PASS**(本節為 23 gate 對照、0 violation、無 Complexity Tracking entry)
- **兩段式 commit 紀律** — ✅ **PASS**(W-F4 走兩段:rust-api worktree commit + push → outer feature branch SHA bump + commit;per Scale/Scope LOC 量級判斷)
- **Conventional Commits 中文 subject** — ✅ **PASS**(W-F4 commit 沿用 CLAUDE.md §6.3)
- **Push 確認紀律** — ✅ **PASS**(W-F4 push 須 user 同意)
- **TLS 紀律** — ❌ **N/A**(W-F4 不動 TLS)

**Gate result**:**14 PASS / 9 N/A / 0 violation**(Phase 0 起 gate 通過,**無 Complexity Tracking entry**)。

## Project Structure

### Documentation (this feature)

```text
specs/009-secret-injection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── secret-injection.md   # 1 contract:secret 注入結構約束 + EnvConfigLoader 推廣 + compose secrets 配置
├── checklists/
│   └── requirements.md  # (existing) /speckit-specify output
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created here)
```

### Source Code (repository root)

```text
fork260509-rev1/                       ← outer repo root
├── docker-compose.yml                ← W-F4 改:加 top-level secrets: 段 + 4 service secrets: ref + envvar 換 _FILE
├── .env.example                      ← W-F4 改:secret env 改 comment-out 預設
├── .gitignore                        ← W-F4 改:加 deploy/secrets/*.txt 規則
├── deploy/
│   └── secrets/                      ← W-F4 新建子目錄(outer git-tracked、實際 .txt gitignored)
│       ├── jwt_secret.txt.example
│       ├── database_url.txt.example       ← 含雙寫紀律註解
│       ├── redis_url.txt.example          ← 含雙寫紀律註解
│       ├── postgres_password.txt.example  ← 含雙寫紀律註解
│       └── redis_password.txt.example     ← 含雙寫紀律註解
└── rust-api/                         ← submodule(W-F4 兩段 commit 第一段:worktree → fork remote rev1-admin-rust-api)
    └── server/config/src/
        ├── secret_loader.rs          ← W-F4 改:加 apply_database_url_hardening() + apply_redis_url_hardening() 2 helper fn
        └── config_init.rs            ← W-F4 改:2 callsite(line 69 + line 415)後並列加 2 個新 call
```

**Structure Decision**:
- outer 改動 8 個檔(改 3 + 新 5);純 infrastructure
- rust-api 改動 2 個檔(2 helper + 2 callsite);第二段 commit outer 記 SHA bump
- 不動 base-web(W-F4 與 frontend 無關)
- 不動 W-F1 / W-F2 image 結構(只透過 compose secrets / envvar 層注入)

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**無 violation,本表留空**(Constitution Gate 14 PASS / 9 N/A、無 Complexity entry)。

## Phase 0 完成:research.md(已產出)

詳見 [research.md](research.md)。關鍵 finding:

- **R-001**: F1.1 helper 推廣模式 = Option C(沿 F1.1 顯式 helper + callsite 模式、不動 EnvConfigLoader generic 邏輯) — `config-rs` Environment source 對 `_FILE` suffix 有 separator ambiguity(`APP_DATABASE_URL_FILE` 會被 split 為 `database.url.file`、無法 populate `url_file` field、必須 explicit env::var() 讀)
- **R-002**: `DatabaseConfig.url` 與 `RedisConfig.url` 都是 `pub url: String` single field(不分 host/port/user/pass)、整 URL secret pattern 對齊 trivially
- **R-003**: `APP_DATABASE_URL` 與 `APP_REDIS_URL` 走 config-rs 直接 env 沒問題(`database.url` / `redis.url` field name 無 `_` 衝突)— 因此 envvar fallback 自然 work
- **R-004**: F1.1 callsite 在 `config_init.rs:69`(`init_from_file()`)+ `config_init.rs:415`(`init_global_config()`)— 沿用同 2 點加 W-F4 新 helper call
- **R-005**: postgres image `POSTGRES_PASSWORD_FILE` 行為驗證(讀 file 後 set POSTGRES_PASSWORD 給 initdb)、與 W-F3 既有 POSTGRES_USER + POSTGRES_DB env 共用
- **R-006**: redis container shell expand `--requirepass "$$(cat /run/secrets/redis_password)"` 進 `exec form` 不 work(no shell);須 sh form `["sh", "-c", "..."]` 沿 W-F3 redis 設定;`$$` 為 compose escape(per analyze I2)
- **R-007**: migration entrypoint wrapper `exec` 確保 migration process 取代 wrapper、不留 wrapper 進 process tree;若不 exec 則 PID 1 是 wrapper、signal handling 異常
- **R-008**: `deploy/secrets/*.txt` 檔案 mode operator 自設(W-F4 不 enforce);Docker 不檢查 source file mode、只看 container mount 後是 0444 read-only tmpfs
- **R-009**: `.gitignore` 規則 `deploy/secrets/*.txt`(不含 `.example`)精準;測:`cp .txt.example .txt` 後 `git status` 不顯示
- **R-010**: 雙寫紀律 fail-fast 路徑 = rust-api 連 DB 失敗 → /health unhealthy → scenario 12 acceptance check fail;不需額外 startup validation 機制
- **R-011**: dev fallback envvar 仍 work — F1.1 `_FILE` not set 時走 envvar、`_FILE` set + path 不存在 panic;W-F4 新 helper 沿同模式

## Phase 1 完成:data-model + contracts + quickstart(已產出)

- [data-model.md](data-model.md):5 個 entity — E1 secret entries(5 個 secret)/ E2 secret file structure(`.txt.example` vs `.txt`)/ E3 compose secrets 段 / E4 rust-api hardening helpers(2 個新 fn + F1.1 既有 fn 沿用)/ E5 .env.example secret env(comment-out)
- [contracts/secret-injection.md](contracts/secret-injection.md):C-S1 ~ C-S9 結構約束(deploy/secrets 結構 / compose secrets top-level / service secrets ref / `_FILE` env naming / rust-api helper 簽名 / migration entrypoint wrapper / redis shell expand / postgres POSTGRES_PASSWORD_FILE / 雙寫紀律驗證路徑)
- [quickstart.md](quickstart.md):13 acceptance scenarios reproducer + 8 SC 對照 + troubleshooting + 兩段 commit workflow

## Constitution Check Re-evaluation(post-Phase 1)

Phase 1 設計與 Phase 0 拍板一致、無新引入機制,Constitution gate **23/23 PASS、0 violation、無 Complexity Tracking entry**。可進 Phase 2。

## Next phase

下一步:`/speckit-tasks` 產出 `tasks.md`(Phase 2)。預期 task 結構(對齊 W-F3 4 phase + 兩段 commit 模式):

- **P1 Setup**(T001-T005):branch 確認 / compose v2 驗 / W-F1+W-F2+W-F3 stack baseline 驗(無 secrets 起 stack 通)
- **P2 Foundational**(T010-T015):F1.1 `secret_loader.rs` 讀 + DatabaseConfig/RedisConfig field name confirm / `.env.example` baseline / compose pre-W-F4 渲染
- **P3 US1 Implementation**(T020-T036):分 5 sub-block
  - rust-api source(T020-T025):secret_loader.rs 加 2 helper + config_init.rs 2 callsite update + unit test
  - rust-api worktree commit + push(T026-T028)
  - outer infrastructure(T030-T035):deploy/secrets/ 5 個 `.txt.example` + docker-compose.yml secrets 段改 + `.env.example` 改 + `.gitignore` 改
- **P3 US1 Acceptance**(T040-T052):13 scenario(Dimension A-E)
- **P4 Polish**(T060-T065):outer 第二段 commit(rust-api SHA bump + outer infra diff)+ merge + INTEGRATION-CHECKLIST.md 更新 Phase W deploy P1 進度 3/4 → 4/4 + 標 P2 解鎖
