# Quickstart: W-F4 — secret-injection acceptance

**Phase 1 output** — 13 個 acceptance scenario(對應 spec.md Dimension A-E、FR-001~FR-018)reproducer + 8 SC 對照 + troubleshooting + 兩段 commit workflow。

對齊 W-F3 quickstart 風格(scenario header + 命令 + 預期 + 失敗時)。

---

## 前置條件

- W-F1(rust-api image)+ W-F2(base-web image)+ W-F3(docker-compose.yml + .env)已落地、stack 可用 W-F3 模式起
- W-F4 改動已完成:rust-api 2 helper + 2 callsite、outer `deploy/secrets/` + compose secrets 段 + `.env.example` 改 + `.gitignore` 改
- outer branch:`009-secret-injection`
- compose v2+(per W-F3 既有驗)

---

## Dimension A — `deploy/secrets/` 目錄結構(scenario 1-3)

### Scenario 1:`.txt.example` 範本檔齊備

```bash
ls deploy/secrets/*.txt.example | wc -l
```
**預期**:`5`
```bash
ls deploy/secrets/*.txt.example
```
**預期**:`jwt_secret.txt.example` / `database_url.txt.example` / `redis_url.txt.example` / `postgres_password.txt.example` / `redis_password.txt.example`

### Scenario 2:`.gitignore` 規則精準

```bash
grep -E "^/?deploy/secrets" .gitignore
```
**預期**:命中至少 1 行 `/deploy/secrets/*.txt`(可選 + `!/deploy/secrets/*.txt.example`)

### Scenario 3:`.txt` 實際 secret 不入 git

```bash
cp deploy/secrets/jwt_secret.txt.example deploy/secrets/jwt_secret.txt
git status --short | grep "jwt_secret.txt"
```
**預期**:**不命中**(`jwt_secret.txt` 已 gitignore、不在 untracked list)
```bash
rm deploy/secrets/jwt_secret.txt    # cleanup
```

---

## Dimension B — `docker-compose.yml` secrets 配置(scenario 4-8)

### Scenario 4:top-level `secrets:` 段渲染

```bash
docker compose config 2>/dev/null | grep -A 12 "^secrets:"
```
**預期**:5 個 entry(`jwt_secret` / `database_url` / `redis_url` / `postgres_password` / `redis_password`),每個含 `file: ./deploy/secrets/<name>.txt`

### Scenario 5:service `secrets:` reference

```bash
docker compose config | grep -B 1 -A 4 "secrets:" | head -40
```
**預期**:`rust-api` 含 3 個 secret ref、`postgres` / `redis` / `migration` 各含 1 個、`base-web` 無 secrets section

### Scenario 6:`_FILE` env 變量替換

```bash
docker compose config | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)|POSTGRES_PASSWORD"
```
**預期**:命中 `APP_JWT_JWT_SECRET_FILE` / `APP_DATABASE_URL_FILE` / `APP_REDIS_URL_FILE` / `POSTGRES_PASSWORD_FILE`(指 `/run/secrets/...`);**不**命中無 `_FILE` 後綴的 plaintext-style env

### Scenario 7:`migration` entrypoint wrapper

```bash
docker compose config | grep -A 3 'name: rev1-admin-migration' | grep entrypoint
```
**預期**:命中 `sh -c "DATABASE_URL=\"\$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"` 樣式

### Scenario 8:`redis` command shell expand

```bash
docker compose config | grep -A 3 'name: rev1-admin-redis' | grep command
```
**預期**:命中 `["sh", "-c", "redis-server --requirepass \"$(cat /run/secrets/redis_password)\""]` 樣式

---

## Dimension C — rust-api EnvConfigLoader 推廣(scenario 9-11)

### Scenario 9:`_FILE` 優先讀檔(unit test)

```bash
cd rust-api
cargo test --package server_config test_apply_database_url_hardening_from_file -- --nocapture
```
**預期**:test pass;test 內驗 set `APP_DATABASE_URL_FILE=/tmp/test-db.url`(內容 `postgres://test`)、call helper、`database.url == "postgres://test"`

### Scenario 10:`_FILE` precedence over envvar

```bash
cd rust-api
cargo test --package server_config test_apply_database_url_hardening_precedence -- --nocapture
```
**預期**:test pass;test 內並設 `APP_DATABASE_URL_FILE=/tmp/file_value` + `APP_DATABASE_URL=env_value`、call helper、`database.url == <file content>`(file 優先)

### Scenario 11:envvar fallback(no `_FILE`)

```bash
cd rust-api
cargo test --package server_config test_apply_redis_url_hardening_no_file -- --nocapture
```
**預期**:test pass;test 內**不**設 `_FILE`、call helper、`redis.url` 維持 input value(不動);實際 envvar fallback 由 config-rs Environment source 自動處理(per R-003)、test 不直接驗 envvar override(整 EnvConfigLoader integration test 範疇)

---

## Dimension D — Stack 啟動 + 安全性(scenario 12-15)

### Scenario 12:Prod 模式 stack 起動 + healthy

```bash
# 1. cp 範本 + 填值
for f in jwt_secret database_url redis_url postgres_password redis_password; do
    cp deploy/secrets/${f}.txt.example deploy/secrets/${f}.txt
done
# 2. 編輯 5 個 .txt(operator 手動;雙寫紀律:database_url 內 password 與 postgres_password 一致、redis_url 內 password 與 redis_password 一致)
#    範例:
#    deploy/secrets/jwt_secret.txt        → $(openssl rand -hex 32)
#    deploy/secrets/database_url.txt      → postgres://soybean:MyPass2026@postgres:5432/soybean-admin
#    deploy/secrets/postgres_password.txt → MyPass2026
#    deploy/secrets/redis_url.txt         → redis://default:RedisPass2026@redis:6379/0
#    deploy/secrets/redis_password.txt    → RedisPass2026
# 3. clean start
docker compose down -v
docker compose up -d
sleep 60
docker compose ps
```
**預期**:5 service 全 healthy(`postgres` / `redis` / `migration`(exited 0)/ `rust-api` / `base-web`)

### Scenario 13:rust-api env 不洩明文 secret

```bash
docker compose exec rust-api env | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)"
```
**預期**:只命中 `*_FILE` 變量(指 `/run/secrets/<name>`)、**0 個** 命中明文 secret value

### Scenario 14:redis ps aux 不洩 password

```bash
docker compose exec redis ps aux | grep redis-server
```
**預期**:命令行含 `redis-server --requirepass` 但 **password 值不直接 visible**(shell expand at exec time、不留 args)。注意:不同 OS 行為差異,Linux 上 `ps` 可能顯示完整 args 含 expanded password;預期下 password 雖然 expanded 但 redis 啟動後不可繞;若需要強制 hidden,可改用 redis.conf file 模式(範疇外)

### Scenario 15:rust-api `/health` 通

```bash
docker compose exec rust-api curl -fsS http://localhost:11081/health
```
**預期**:`ok`(W-F1 既有 /health endpoint、F1.1 strict validation 通 + DB/Redis 連線 work、_FILE pattern 生效)

---

## Dimension E — Dev fallback + 整體相容(scenario 16-18)

### Scenario 16:Dev mode 同走 secrets file(填 dev-friendly 值)

per `/speckit-analyze` U1 拍板:dev 與 prod 統一走 secrets file 模式、僅 secret **值**不同(dev-friendly 不需 prod-grade entropy)。**取消** W-F4 spec 早期描述的 "rm .txt + envvar fallback" 路徑(機制斷裂、跨 OS 複雜)。

```bash
docker compose down -v
# 編輯 deploy/secrets/*.txt 改填 dev-friendly 值(注意雙寫紀律:database_url 內 password 與 postgres_password.txt 一致、redis_url 內 password 與 redis_password.txt 一致):
echo "dev-jwt-secret-32-chars-padding-xxx" > deploy/secrets/jwt_secret.txt
echo "postgres://soybean:devpass@postgres:5432/soybean-admin" > deploy/secrets/database_url.txt
echo "redis://default:devredis@redis:6379/0" > deploy/secrets/redis_url.txt
echo "devpass" > deploy/secrets/postgres_password.txt
echo "devredis" > deploy/secrets/redis_password.txt
docker compose up -d
sleep 60
docker compose ps
```
**預期**:5 service 全 healthy;dev 模式秒起、無需勞 `openssl rand`

### Scenario 17:Dev mode `/health` 通

```bash
docker compose exec rust-api curl -fsS http://localhost:11081/health
```
**預期**:`ok`

**Note**:F1.1 envvar fallback 紀律於 rust-api source 層仍存在(`_FILE` not set 時走 envvar、yaml default lowest);advanced operator 可自製 `docker-compose.override.yml` 移除 `_FILE` env + `secrets:` ref 切換到 envvar mode,但 W-F4 acceptance 不顯式 cover 此路徑。

### Scenario 18:W-F3 acceptance 不破

```bash
# 切回 prod mode(scenario 12 5 個 .txt 存在;.env 移除 secret 5 行 或 comment-out)
docker compose down -v
# (重設 .env + cp secrets txt;省略命令)
docker compose up -d
sleep 60

# 跑 W-F3 quickstart.md scenario 6 / 7 / 9 / 10 / 11 representative subset:
docker compose exec rust-api curl -fsS http://localhost:11081/health   # 200 ok
docker compose exec base-web curl -fsS http://localhost/health         # 200 ok
docker compose exec rust-api getent hosts postgres                     # 解析 OK
docker compose exec rust-api getent hosts redis                        # 解析 OK
docker compose down
docker compose up -d
sleep 30
docker compose exec postgres psql -U soybean -d soybean-admin -c "SELECT 1"  # volume 持久化、表存在
```
**預期**:5 個 W-F3 子 scenario 全 pass;W-F4 升級不破壞 W-F3 既有功能

---

## SC 對照(spec.md Success Criteria 8 條)

| SC | Verify via |
|---|---|
| SC-001(60-90s stack healthy) | Scenario 12 sleep 60 後 `docker compose ps` 全 healthy |
| SC-002(env 不洩明文) | Scenario 13 |
| SC-003(redis ps 不洩 password) | Scenario 14 |
| SC-004(/health p99 < 50ms) | `time` × N 取 p99(per W-F3 既有方法);W-F4 secret 讀檔 overhead < 100ms 可忽略、不影響 p99 |
| SC-005(W-F3 acceptance 不破) | Scenario 18 |
| SC-006(13 W-F4 scenario 100% pass) | 本 quickstart.md 全跑 |
| SC-007(dev mode 起 stack + /health 通) | Scenario 16-17 |
| SC-008(Phase W P1 100%、解鎖 P2) | INTEGRATION-CHECKLIST.md 更新 + W-F5 spec 不引入 W-F4 blocker(後續驗) |

---

## Troubleshooting

### 問題 1:`docker compose config` 報 `secret <name> not found`
- **原因**:`deploy/secrets/<name>.txt` 不存在;若 `file:` directive 指空 file path、compose render 階段就抓
- **解**:`ls deploy/secrets/*.txt` 確認 operator 已 cp 5 個 `.txt.example` 為 `.txt`;若 prod mode 必須 5 個都在;dev mode 可不需(但 compose `secrets:` top-level 段引用會 fail render)

### 問題 2:rust-api panic with `F1.1: APP_DATABASE_URL_FILE = '...' read failed`
- **原因**:`/run/secrets/database_url` mount 失敗或 file 不存在;通常是 `deploy/secrets/database_url.txt` 缺
- **解**:`docker compose down && docker compose up -d`(secret mount 在容器啟動時);若仍不行 `docker inspect <container> | grep Mounts` 看 mount 點

### 問題 3:rust-api 起來但連 DB 失敗
- **原因**:**雙寫紀律違反**(per R-010)— `database_url.txt` 內 password 與 `postgres_password.txt` 不一致 → postgres auth failed
- **解**:vimdiff `deploy/secrets/database_url.txt` 與 `deploy/secrets/postgres_password.txt`、確認 password 段一致

### 問題 4:`docker compose exec rust-api env` 仍命中明文
- **原因**:`.env` 內有 uncomment 的 `APP_*` 直接 env、prod 模式不應留;或 compose `environment:` 仍含明文(W-F4 改不完整)
- **解**:`grep -E "^APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)" .env` → comment-out;`grep -E "APP_.*=\\\$\\{APP_" docker-compose.yml` → 應 0 命中(W-F4 後 rust-api environment 全走 _FILE)

### 問題 5:redis 起來但 redis-cli AUTH failed
- **原因**:雙寫紀律違反 — `redis_url.txt` 內 password 與 `redis_password.txt` 不一致
- **解**:vimdiff 2 file、確認 password 段一致

### 問題 6:Migration container 跑不起來
- **原因**:`entrypoint:` wrapper shell quote 在 yaml 內 escape 錯;或 `database_url` secret mount 失敗
- **解**:`docker compose logs migration`;確認 wrapper 字串 yaml escape 正確(`\"` 與 `\$` escape 正確)

---

## 兩段 commit workflow

W-F4 改 rust-api source(non-trivial)、走兩段 commit per CLAUDE.md §6.1。

### 第一段:rust-api worktree commit + push

```bash
cd rust-api
git status   # 確認在 rev1-admin-rust-api 分支
git add server/config/src/secret_loader.rs server/config/src/config_init.rs
git commit -m "$(cat <<'EOF'
feat(config): W-F4 加 DATABASE_URL/REDIS_URL _FILE pattern hardening

- secret_loader.rs 加 apply_database_url_hardening() + apply_redis_url_hardening() 2 個 helper
- config_init.rs 2 callsite 並列加 call(沿 F1.1 模式推廣 jwt → db/redis)
- 不動 EnvConfigLoader generic 邏輯(_ separator ambiguity per R-001)
- 加 3 unit test cover file 優先 / precedence / envvar fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin rev1-admin-rust-api
```

### 第二段:outer feature branch SHA bump + outer infra diff

```bash
cd /home/anew/x_Project/fork260509-rev1
git branch --show-current   # 預期 009-secret-injection
git status

# 加 outer 改動(infra + spec docs + submodule SHA bump)
git add docker-compose.yml .env.example .gitignore deploy/secrets/ specs/009-secret-injection/
git add rust-api   # submodule SHA bump
git commit -m "$(cat <<'EOF'
feat(deploy): W-F4 secret-injection 落地(Docker secrets + _FILE pattern)

- 新建 deploy/secrets/ 5 個 .txt.example 範本(雙寫紀律註解寫 deploy/secrets/README.md)
- docker-compose.yml 加 top-level secrets: + 4 service secrets ref + _FILE env 替換
- migration service entrypoint wrapper 從 secret file 讀 DATABASE_URL
- redis command shell expand 從 secret file 讀 password
- postgres POSTGRES_PASSWORD_FILE(image-native)
- .env.example secret env 改 comment-out 預設(dev mode 自行 uncomment)
- .gitignore 加 deploy/secrets/*.txt 規則
- rust-api SHA bump:<short SHA>(W-F4 hardening helper 推廣)

Phase W deploy P1 達 100%(4/4),解鎖 P2(W-F5 front-nginx 等)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
# push 須 user 同意 per CLAUDE.md §5
```

### Merge 回 `rev1-admin-root`(user 同意後)

```bash
git switch rev1-admin-root
git merge --no-ff 009-secret-injection
git push origin rev1-admin-root    # user 同意後
```

### INTEGRATION-CHECKLIST.md 更新

- `Current Focus` 改為 W-F5 next(Phase W deploy P2 解鎖)
- `Phase W deploy Roadmap` 表 W-F4 改 ✅ 完成、含 commit SHA
- `已完成里程碑` 加 W-F4 條目
