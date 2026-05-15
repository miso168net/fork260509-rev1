# `deploy/secrets/` — Docker secrets 注入(W-F4)

per [`specs/009-secret-injection/`](../../specs/009-secret-injection/) 設計、Constitution「Secret 注入:Docker secrets + `_FILE` pattern 為 prod 預設機制」紀律。

## 結構

```
deploy/secrets/
├── README.md                          ← 本檔
├── jwt_secret.txt.example             ← git-tracked 範本
├── database_url.txt.example
├── redis_url.txt.example
├── postgres_password.txt.example
├── redis_password.txt.example
├── jwt_secret.txt                     ← gitignored(operator 編輯)
├── database_url.txt
├── redis_url.txt
├── postgres_password.txt
└── redis_password.txt
```

5 個 `.txt.example` 範本 git-tracked、5 個 `.txt` 實際 secret 檔 gitignored(per `.gitignore` `/deploy/secrets/*.txt` 規則)。

## 操作流程

1. 對每個 `.txt.example` 跑 `cp <name>.txt.example <name>.txt`
2. 編輯 `.txt` 填入實際 secret 值(見「secret 值生成」段)
3. `chmod 0600 deploy/secrets/*.txt`(host filesystem 保護、operator 自行設;W-F4 acceptance 不 enforce)
4. `docker compose up -d`

## secret 值生成

### `jwt_secret.txt`

- prod:`openssl rand -hex 32`(產 64-char hex string、32 bytes、HS256 安全 baseline)
- dev:任意 ≥ 32 byte 字串(F1.1 strict validation 仍會跑 length / placeholder / empty 檢查)

### `database_url.txt`

整 URL 含 user / password / host / port / dbname。範例(prod 用 strong password):
```
postgres://soybean:<password>@postgres:5432/soybean-admin
```

⚠️ **雙寫紀律**:URL 內 password 段 **MUST** = `postgres_password.txt` 內純值。不一致時 rust-api 連 DB 失敗、`/health` unhealthy。

### `redis_url.txt`

整 URL。範例:
```
redis://default:<password>@redis:6379/0
```

⚠️ **雙寫紀律**:URL 內 password 段 **MUST** = `redis_password.txt` 內純值。

### `postgres_password.txt`

純密碼值(postgres image entrypoint 讀此 file set 為 `POSTGRES_PASSWORD`、postgres 初始化 superuser 用)。

### `redis_password.txt`

純密碼值(redis container shell expand 為 `--requirepass <value>`)。

## dev vs prod 模式

per [W-F4 spec.md FR-016](../../specs/009-secret-injection/spec.md):dev / prod 統一走 secrets file 模式、**唯一差別在 secret 值**:

- prod:`openssl rand -hex 32` + strong password、host filesystem `chmod 0600` + 只 ops 帳號 readable
- dev:任意 dev-friendly 值(如 `devpass` / `dev-jwt-secret-32-chars-padding-xxx`)、本機開發專用

W-F4 不提供「`.env` 直接 envvar mode」切換機制(per `/speckit-analyze` U1 拍板;rust-api source 層 F1.1 envvar fallback 紀律仍存在,advanced operator 自製 `docker-compose.override.yml` 可切換)。

## Container mount

- `postgres`:mount `postgres_password` 為 `/run/secrets/postgres_password`(env `POSTGRES_PASSWORD_FILE` 指向)
- `redis`:mount `redis_password` 為 `/run/secrets/redis_password`(`command:` shell expand `$$(cat /run/secrets/redis_password)`)
- `migration`:mount `database_url` 為 `/run/secrets/database_url`(`entrypoint:` wrapper shell expand 設 `DATABASE_URL` env)
- `rust-api`:mount 3 個 secret(`jwt_secret` / `database_url` / `redis_url`),env `APP_JWT_JWT_SECRET_FILE` / `APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE` 各指向
- `base-web`:不 mount 任何 secret(frontend 不需要)

container 內 mount 為 read-only tmpfs、mode 0444、owner root(host filesystem mode 不傳染)。
