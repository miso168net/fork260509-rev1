# Data Model: W-F4 — secret-injection

**Phase 1 output** — 對齊 W-F3 entity-driven 模式;5 個 entity:E1 secret entries / E2 secret file structure / E3 compose secrets 結構 / E4 rust-api hardening helpers / E5 .env.example secret env(comment-out 規範)。

---

## E1 — Secret entries(5 個)

| Secret name | 用途 | Consumer | Mount path in container | Source file(host) |
|---|---|---|---|---|
| `jwt_secret` | JWT signing key | rust-api | `/run/secrets/jwt_secret` | `deploy/secrets/jwt_secret.txt` |
| `database_url` | Postgres connection URL(整 URL、含 password embedded) | rust-api、migration | `/run/secrets/database_url` | `deploy/secrets/database_url.txt` |
| `redis_url` | Redis connection URL(整 URL、含 password embedded) | rust-api | `/run/secrets/redis_url` | `deploy/secrets/redis_url.txt` |
| `postgres_password` | Postgres user password(純值;postgres image native) | postgres | `/run/secrets/postgres_password` | `deploy/secrets/postgres_password.txt` |
| `redis_password` | Redis password(純值;redis container shell expand) | redis | `/run/secrets/redis_password` | `deploy/secrets/redis_password.txt` |

**Validation rules**:
- 每個 source file MUST 為 1 行 secret value、無換行 / no extra whitespace(F1.1 helper `.trim()` 容錯空白)
- `jwt_secret` 沿 F1.1 既有 strict validation:length ≥ 32、不在 `PLACEHOLDER_SECRETS` 黑名單、非空
- `database_url` / `redis_url`:URL 格式由 sea-orm / redis crate 連線時驗(W-F4 不加 startup format check)
- `postgres_password` / `redis_password`:純值、由 image / shell 直接消費、無 W-F4 format check
- **雙寫紀律**(per clarify Q2 + R-010):`database_url.txt` 內 URL embedded password MUST = `postgres_password.txt` 純值;`redis_url.txt` 內 URL embedded password MUST = `redis_password.txt` 純值;不一致時 rust-api / redis 連線失敗、container unhealthy

**State transitions**:無(secret 為 read-only resource)。

---

## E2 — Secret file structure(`deploy/secrets/` 目錄)

```text
deploy/secrets/
├── jwt_secret.txt.example          ← git-tracked(範本、無敏感值)
├── database_url.txt.example        ← git-tracked(含雙寫紀律註解)
├── redis_url.txt.example           ← git-tracked(含雙寫紀律註解)
├── postgres_password.txt.example   ← git-tracked(含雙寫紀律註解)
├── redis_password.txt.example      ← git-tracked(含雙寫紀律註解)
├── jwt_secret.txt                  ← gitignored(operator 編輯)
├── database_url.txt                ← gitignored
├── redis_url.txt                   ← gitignored
├── postgres_password.txt           ← gitignored
└── redis_password.txt              ← gitignored
```

**Validation rules**:
- `.gitignore` MUST 含 `/deploy/secrets/*.txt`(per R-009);可選加 `!/deploy/secrets/*.txt.example` negation 顯式
- `*.txt.example` 範本內容約定:
  - `jwt_secret.txt.example`:1 行 placeholder(如 `change-me-via-openssl-rand-hex-32`)+ comment 提示生成 `openssl rand -hex 32`
  - `database_url.txt.example`:1 行 URL 範本(如 `postgres://soybean:CHANGE_ME@postgres:5432/soybean-admin`)+ **雙寫紀律註解**:「⚠️ password 段必須與 `postgres_password.txt` 內純值一致」
  - `redis_url.txt.example`:1 行(如 `redis://default:CHANGE_ME@redis:6379/0`)+ 雙寫紀律註解 vs `redis_password.txt`
  - `postgres_password.txt.example`:1 行 placeholder(如 `CHANGE_ME_postgres_password`)+ 雙寫紀律註解 vs `database_url.txt`
  - `redis_password.txt.example`:1 行 placeholder + 雙寫紀律註解 vs `redis_url.txt`
- comment 格式:**not** in-file comment(secret file 不應含 comment、會被當 secret value);comment 寫在 `.txt.example` 開頭 `# <comment>` 但 operator cp 時須刪除 — 或改為**在獨立 README 或 .env.example 中說明**(per R-008 簡化)

**Decision on comment placement**:per W-F4 acceptance scenario 1-3,`.txt.example` 範本檔以 **1 行內容為主、不混 comment**(避免 operator cp 後忘記刪);所有雙寫紀律說明集中在 `.env.example` + `deploy/secrets/README.md`(新建)。

---

## E3 — Compose secrets 結構(`docker-compose.yml` 改動)

### E3.1 Top-level `secrets:` 段

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

### E3.2 Service-level `secrets:` reference

| Service | Secrets referenced |
|---|---|
| `postgres` | `postgres_password` |
| `redis` | `redis_password` |
| `migration` | `database_url` |
| `rust-api` | `jwt_secret`、`database_url`、`redis_url` |
| `base-web` | (無 — frontend 不需 secret) |

### E3.3 Service-level `environment:` 改動

| Service | W-F3 env | W-F4 改後 env |
|---|---|---|
| `postgres` | `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?...}` | `POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password` |
| `redis` | `command: ["sh", "-c", "redis-server --requirepass \"$REDIS_PASSWORD\""]` | `command: ["sh", "-c", "redis-server --requirepass \"$$(cat /run/secrets/redis_password)\""]`(per analyze I2 `$$` compose escape) |
| `migration` | `DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` | `entrypoint: ["sh", "-c", "DATABASE_URL=\"$$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"]`(+ 刪 `DATABASE_URL:` env;per analyze I2 `$$` compose escape) |
| `rust-api` | `APP_JWT_JWT_SECRET: ${APP_JWT_JWT_SECRET:?...}`、`APP_DATABASE_URL: ...`、`APP_REDIS_URL: ...` | `APP_JWT_JWT_SECRET_FILE: /run/secrets/jwt_secret`、`APP_DATABASE_URL_FILE: /run/secrets/database_url`、`APP_REDIS_URL_FILE: /run/secrets/redis_url` |

**Validation rules**:
- `secrets:` top-level 段 MUST 有 5 entry、每 entry `file:` 指 `./deploy/secrets/<name>.txt`(relative path、compose project root 相對解析)
- Service `secrets:` reference 用 **short syntax**(`- jwt_secret`)即可、long syntax(`- source/target`)不需要(default mount path `/run/secrets/<source>` 已對齊)
- `migration` service 加 `entrypoint:` override(取代 image default ENTRYPOINT、確保 wrapper 跑);若 W-F1 image ENTRYPOINT 已是 `/usr/local/bin/migration` 系列、compose `entrypoint:` 也必須帶完整 cmd path
- `redis` `command:` 維持 shell form `["sh", "-c", "..."]`(per R-006);exec form 不 work

---

## E4 — rust-api hardening helpers(`secret_loader.rs` + `config_init.rs` 改動)

### E4.1 既有(F1.1 不動)

```rust
pub fn load_secret_from_file_if_set(base_envvar: &str) -> Option<String>;
pub fn validate_jwt_secret(secret: &str);
pub fn apply_jwt_secret_hardening(jwt: &mut JwtConfig);
```

### E4.2 新增(W-F4)

```rust
/// W-F4: apply DATABASE_URL hardening — `_FILE` precedence override。
///
/// Precedence:
///   1. APP_DATABASE_URL_FILE(highest)— reads file content via `load_secret_from_file_if_set`
///   2. APP_DATABASE_URL(bare envvar)— populated by config-rs Environment source already,
///      so this helper does NOT explicit-read envvar(per R-003、無 `_` separator ambiguity)
///   3. application.yaml database.url(lowest)— already in `database.url`
///
/// 不做 URL format 驗(sea-orm connection pool init 會抓不 valid URL)。
///
/// per spec FR-009、FR-010、research.md R-001。
pub fn apply_database_url_hardening(database: &mut DatabaseConfig) {
    if let Some(url_from_file) = load_secret_from_file_if_set("APP_DATABASE_URL") {
        database.url = url_from_file;
    }
    // Step 2: bare envvar — config-rs 自動處理(per R-003)、不需 explicit read
    // Step 3: yaml default — already in database.url、不需 action
}

/// W-F4: apply REDIS_URL hardening — `_FILE` precedence override。
/// 結構同 apply_database_url_hardening。
pub fn apply_redis_url_hardening(redis: &mut RedisConfig) {
    if let Some(url_from_file) = load_secret_from_file_if_set("APP_REDIS_URL") {
        redis.url = url_from_file;
    }
}
```

### E4.3 Callsite 改動(`config_init.rs`)

Callsite 1(`init_from_file` at line ~69):
```rust
// F1.1 既有(不動):
secret_loader::apply_jwt_secret_hardening(&mut jwt_config);
// W-F4 加 2 行(在 jwt 之後並列):
secret_loader::apply_database_url_hardening(&mut config.database);
secret_loader::apply_redis_url_hardening(&mut config.redis);
```

Callsite 2(`init_global_config` at line ~415):同模式。

**Validation rules**:
- 2 個新 helper 函式簽名 MUST 與 F1.1 `apply_jwt_secret_hardening` 風格對齊(`fn (&mut <Config>)` 形式)
- 不引入新 dependency、不改 `Cargo.toml`
- F1.1 `load_secret_from_file_if_set` helper sign 不動、reuse trivially

### E4.4 Unit tests(`secret_loader.rs` 內 `#[cfg(test)]` 區塊)

新增 3 個 test:
- `test_apply_database_url_hardening_from_file`:set `APP_DATABASE_URL_FILE` 指 tempfile + content → 驗 database.url = content
- `test_apply_database_url_hardening_no_file_keeps_url`:不設 `_FILE` → 驗 database.url 保持原 yaml/env 值(`url` 不變)
- `test_apply_redis_url_hardening_from_file`:對 redis 同模式驗

對齊 F1.1 既有 5 個 test(若有)。

---

## E5 — `.env.example` secret env(comment-out 規範)

W-F3 既有 `.env.example` 含 8 個 env var(part of W-F3 R-006 模式)。W-F4 改:

```env
# === SECRETS (PROD 模式:用 deploy/secrets/*.txt;以下 env 預設 comment-out) ===
# 如要走 DEV 直接 env 模式,uncomment 以下 5 行 + 填值;
# 否則 docker compose 會從 deploy/secrets/*.txt 讀(per W-F4 secret-injection feature)

# APP_JWT_JWT_SECRET=
# APP_DATABASE_URL=
# APP_REDIS_URL=
# POSTGRES_PASSWORD=
# REDIS_PASSWORD=

# === NON-SECRETS(維持 W-F3 預設、不 comment)===
COMPOSE_PROJECT_NAME=rev1-admin
POSTGRES_USER=soybean
POSTGRES_DB=soybean-admin
```

**Validation rules**:
- secret-class env 5 個 MUST 預設 comment-out(以 `# ` 前綴)
- 加 1 段 README 註解明示 prod vs dev 模式切換
- `COMPOSE_PROJECT_NAME` / `POSTGRES_USER` / `POSTGRES_DB` 維持 W-F3 預設值

---

## 結論

5 個 entity 拍板:
- E1(5 secret entries)+ E2(secret file 結構 + .example 範本)+ E3(compose secrets 3 子段)+ E4(rust-api 2 helper + 2 callsite + 3 unit test)+ E5(.env.example secret env comment-out)

進 contracts/secret-injection.md(9 個 contract C-S1~C-S9)+ quickstart.md(13 acceptance scenarios + 8 SC 對照)。
