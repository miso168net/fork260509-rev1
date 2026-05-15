# Quickstart: W-F3 compose-base-structure

**Feature**: 008-compose-base-structure
**Phase**: 1 (design - validation steps)
**Date**: 2026-05-15
**Audience**: 跑 W-F3 acceptance test / verify implementation 的 dev 或 CI agent

**Goal**:在乾淨環境跑通 spec.md 的 17 個 acceptance scenario(Dimension A-E)。

---

## Prerequisites

| Item | Version | Note |
|---|---|---|
| Docker Engine | >= 20.10 | 含 docker compose v2(`docker compose` 命令,not v1 `docker-compose`)|
| Host arch | `linux/amd64` | W-F3 inherit W-F1 Q2 |
| Disk | >= 5GB free | postgres data + redis data + image 等 |
| W-F1 image | `rust-api:rev1-admin-rust-api`(或 `rust-api:<sha>`)| 已 build local 並可達 |
| W-F2 image | `base-web:rev1-admin-base-web`(或 `base-web:<sha>`)| 已 build local 並可達 |

驗證 prerequisites:
```bash
docker compose version | grep -E "v2|Compose version 2"
docker image ls rust-api base-web --format '{{.Repository}}:{{.Tag}}'
```

---

## Setup `.env`

`.env.example` 由 W-F3 提供範本。operator 須:

```bash
cd <outer-repo-root>
cp .env.example .env

# 編輯 .env、填入:
#   POSTGRES_PASSWORD=<your-strong-password>
#   REDIS_PASSWORD=<your-strong-password>
#   APP_JWT_JWT_SECRET=$(openssl rand -hex 32)

# 推薦命令(避免 URL encoding 坑):
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^APP_JWT_JWT_SECRET=.*|APP_JWT_JWT_SECRET=$(openssl rand -hex 32)|" .env
```

---

## Acceptance Plan(對應 spec.md 17 scenarios)

### Dimension A — Compose 結構 + service 集合(scenarios 1-3)

#### Scenario 1 — `docker compose up -d` 成功啟動

```bash
cd <outer-repo-root>
# 確保 .env 已設定 (上述 setup 步驟)
docker compose up -d

# 預期:
# - exit 0
# - 5 service 啟動 logs
# - 第一次 cold start ~30-60 sec
```

#### Scenario 2 — `docker compose ps` 全 healthy

```bash
docker compose ps --format '{{.Name}} {{.Status}}'

# 預期(allow 60 秒讓 healthchecks 通):
# rev1-admin-postgres-1   Up X (healthy)
# rev1-admin-redis-1      Up X (healthy)
# rev1-admin-migration-1  Exited (0)
# rev1-admin-rust-api-1   Up X (healthy)
# rev1-admin-base-web-1   Up X (healthy)
```

#### Scenario 3 — `docker compose config` 渲染 valid

```bash
docker compose config

# 預期:
# - 渲染最終 compose 結構(env interpolation 完)
# - 含 5 services + 1 network(internal)+ 2 volumes(postgres_data/redis_data)
# - 無 unresolved env / syntax error
# - 退出 0
```

---

### Dimension B — Healthcheck + depends_on 串接(scenarios 4-8)

#### Scenario 4 — migration 在 postgres healthy 後才跑

```bash
docker compose logs migration | head -20

# 預期 log 內容:
# - 啟動時間晚於 postgres healthy(看 timestamp diff)
# - 跑 sea-orm migrations(看到 "Applying migration..." 或類似)
# - exit 0
```

#### Scenario 5 — rust-api 在 migration exit 0 後才啟動

```bash
docker compose logs rust-api | head -5
docker compose ps migration --format '{{.Status}} {{.ExitCode}}'

# 預期:
# - migration 已 Exited(0)
# - rust-api 啟動時間晚於 migration exit timestamp
```

#### Scenario 6 — rust-api /health 200

```bash
docker compose exec rust-api curl -fsS http://localhost:11081/health
# 預期:
# - exit 0
# - body: ok
```

#### Scenario 7 — base-web /health 200

```bash
docker compose exec base-web curl -fsS http://localhost:8080/health
# 預期:同上
```

#### Scenario 8 — rust-api healthy 狀態驗證

```bash
sleep 60   # 給 healthchecks 時間
RUST_API_CID=$(docker compose ps rust-api -q)
docker inspect "$RUST_API_CID" --format '{{.State.Health.Status}}'

# 預期:healthy
```

---

### Dimension C — Network + volume 持久化(scenarios 9-11)

#### Scenario 9 — internal network DNS 通

```bash
docker compose exec rust-api sh -c 'getent hosts postgres'
docker compose exec rust-api sh -c 'getent hosts redis'

# 預期:每個都返 internal IP(172.x.x.x、bridge network)
```

#### Scenario 10 — postgres_data volume 持久化

```bash
# 寫入測試 row
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
    "INSERT INTO sys_operation_log (id, operation, ...) VALUES (...);"  # adapt to actual schema

# 或更簡單:看現有 audit row count
ROWS_BEFORE=$(docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT count(*) FROM sys_operation_log;")
echo "before down: $ROWS_BEFORE"

# Down + up(不 -v)
docker compose down
docker compose up -d
sleep 60  # wait healthy

ROWS_AFTER=$(docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT count(*) FROM sys_operation_log;")
echo "after up: $ROWS_AFTER"

# 預期:ROWS_BEFORE == ROWS_AFTER(volume 持久)
```

#### Scenario 11 — 無對外 host port

```bash
# 從 host 連各內部 service port → 全 fail
nc -zv localhost 5432  || echo "✓ postgres NOT exposed"
nc -zv localhost 6379  || echo "✓ redis NOT exposed"
nc -zv localhost 11081 || echo "✓ rust-api NOT exposed"
nc -zv localhost 8080  || echo "✓ base-web NOT exposed"

# 4/4 expected fail(W-F3 嚴守 W-F7 邊界、不暴露 host port)
```

---

### Dimension D — Secret + env 配置(scenarios 12-14)

#### Scenario 12 — `.env.example` 結構檢查

```bash
# 預期含至少 7 env var + URL encoding 警告
grep -E "^(COMPOSE_PROJECT_NAME|POSTGRES_(USER|PASSWORD|DB)|REDIS_PASSWORD|APP_JWT_JWT_SECRET|IMAGE_TAG|BASE_WEB_TAG)=" .env.example | wc -l
# 預期 ≥ 7

grep -i "URL.*encode\|special char" .env.example
# 預期至少 1 命中(URL encoding 警告註解)

grep "openssl rand" .env.example
# 預期至少 1 命中(secret 生成指令)
```

#### Scenario 13 — 不設 APP_JWT_JWT_SECRET → compose fail-fast

```bash
docker compose down -v 2>/dev/null
sed -i "s|^APP_JWT_JWT_SECRET=.*|APP_JWT_JWT_SECRET=|" .env
# 或暫時 mv .env .env.bak

docker compose up -d 2>&1 | tail -5
# 預期:
# - compose error: "APP_JWT_JWT_SECRET required in .env"(per `:?` syntax)
# - 或 rust-api container 起後 F1.1 panic(視 compose interpolation 行為)
# - 整 stack 不 healthy

# Restore .env:
mv .env.bak .env || sed -i "s|^APP_JWT_JWT_SECRET=.*|APP_JWT_JWT_SECRET=$(openssl rand -hex 32)|" .env
docker compose down -v
```

#### Scenario 14 — 正確 secret + stack healthy

```bash
sed -i "s|^APP_JWT_JWT_SECRET=.*|APP_JWT_JWT_SECRET=$(openssl rand -hex 32)|" .env
docker compose up -d
sleep 60

docker compose exec rust-api curl -fsS http://localhost:11081/health
# 預期 200 + ok
```

---

### Dimension E — Cleanup + down 行為(scenarios 15-17)

#### Scenario 15 — `docker compose down` 保留 volume

```bash
docker compose down

# 預期:5 container 移除、network internal 移除、volumes 保留
docker volume ls --filter "name=rev1-admin_" --format '{{.Name}}'
# 預期:rev1-admin_postgres_data + rev1-admin_redis_data 仍在
```

#### Scenario 16 — `docker compose down -v` 刪除 volume

```bash
docker compose up -d
sleep 5
docker compose down -v

docker volume ls --filter "name=rev1-admin_" --format '{{.Name}}'
# 預期:空(2 個 volume 都已刪除)
```

#### Scenario 17 — `docker compose restart rust-api` 局部重啟

```bash
docker compose up -d
sleep 60

docker compose restart rust-api
sleep 10

# rust-api 重啟成功
docker compose ps rust-api --format '{{.Status}}'
# 預期:Up X (healthy)

# 其他 service 不受影響
docker compose ps --format '{{.Name}} {{.Status}}'
# 預期:其他 4 service 仍 Up
```

---

## SC verification 對照

| SC | Verification 命令 | Pass criteria |
|---|---|---|
| SC-001 | Scenario 1 + `time docker compose up -d` + 等到全 healthy | 60 sec 內(cold + image cached) |
| SC-002 | Scenario 2 | 5/5 service 預期狀態 |
| SC-003 | Scenario 6 + 7 | 200 + ok;p99 latency < 50ms(`for i in {1..100}; ...`) |
| SC-004 | Scenario 11 | 4/4 nc -zv fail(無對外 port) |
| SC-005 | Scenario 10 | postgres volume 持久 |
| SC-006 | Scenario 13 | compose / rust-api panic on missing secret |
| SC-007 | (post-implement)W-F4 spec / plan 階段檢查 W-F3 是否成為 blocker | spec 階段無 referrer block |
| SC-008 | 跑 Dimension A-E 全 17 個 scenarios | 100% pass |

---

## Troubleshooting

### `docker compose up` 失敗於 "no such file" / "image not found"
- 確認 W-F1 / W-F2 image 已 build:`docker images rust-api base-web`
- 若無、回 W-F1 / W-F2 acceptance 階段重 build

### postgres healthcheck 一直 unhealthy
- `docker compose logs postgres` 看 startup error
- 常見:`POSTGRES_PASSWORD` 含 special char、postgres parse 出錯
- 解:.env 改用 hex string password(per R-006)

### migration 一直 fail
- `docker compose logs migration` 看 sea-orm-cli output
- 常見:DATABASE_URL parse 出錯(special char)、或 DB schema 已部分 migration(過時 lockfile)
- 解(資料可丟):`docker compose down -v` + `docker compose up -d` 重來

### rust-api panic
- `docker compose logs rust-api` 看 panic 訊息
- 常見:`APP_JWT_JWT_SECRET=change-me-...`(placeholder) → F1.1 strict validation block
- 解:.env `APP_JWT_JWT_SECRET=$(openssl rand -hex 32)`

### `docker compose exec rust-api curl` 拒絕連線
- 等更久(healthchecks 30s interval、retries 3 → ~90s 才標 healthy)
- 或 rust-api 還在 retry DB connect(看 logs)

### 想 wipe 重來
```bash
docker compose down -v        # 刪 container + volume
docker volume prune -f         # 確認所有 named volume 都清
docker compose up -d
```

---

## Commit workflow(per CLAUDE.md §6.2 單段 commit)

W-F3 不動 rust-api / base-web worktree、只動 outer repo:

```bash
cd <outer-repo-root>
git branch --show-current  # 應 008-compose-base-structure
git add docker-compose.yml .env.example .gitignore specs/008-compose-base-structure/
git commit -m "feat(deploy): W-F3 compose-base-structure 落地（postgres + redis + migration + rust-api + base-web 5 service docker-compose）"
# push 須 user 同意(per CLAUDE.md §5)
```

完成後 merge feature branch → `rev1-admin-root`:

```bash
git switch rev1-admin-root
git merge --no-ff 008-compose-base-structure
git push origin rev1-admin-root  # 需 user 同意
```

Phase W deploy P1 進度更新到 **3/4**(W-F1 + W-F2 + W-F3 完成、W-F4 待動)。
