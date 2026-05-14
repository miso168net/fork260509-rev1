# Quickstart: W-F1 dockerfile-rust-api

**Feature**: 006-dockerfile-rust-api
**Phase**: 1 (design - validation steps)
**Date**: 2026-05-15
**Audience**: 跑 W-F1 acceptance test / verify implementation 的 dev 或 CI agent

**Goal**: 在乾淨環境跑通 spec.md 的 15 個 acceptance scenario(Dimension A-E)。

---

## Prerequisites

| Item | Version | Note |
|---|---|---|
| Docker | >= 20.10 | BuildKit 預設啟用(modern docker) |
| Host arch | `linux/amd64` | W-F1 只 target amd64(per Q2 clarify) |
| Disk | >= 5GB free | builder cache + image storage |
| Network | 可 pull `rust:1.86-slim-bookworm` + `debian:bookworm-slim` | 第一次 build 需 |
| Postgres / Redis | (僅 Dimension D 需要) | 若驗 `/health` endpoint 可達、需 minimal stack |

驗證 docker BuildKit:
```bash
docker buildx version || (echo "BuildKit not available — install docker-buildx-plugin" && exit 1)
```

---

## Acceptance Plan(對應 spec.md 15 scenarios)

### Dimension A — Dockerfile 結構重寫(scenarios 1-3)

#### Scenario 1 — Build 成功

```bash
# 確保 builder cache 乾淨(可選)
docker builder prune -f

# Build
cd rust-api/
docker build -t rust-api:test .

# 預期:
# - exit 0
# - output 顯示 builder stage(FROM rust:1.86-slim-bookworm AS builder)
# - output 顯示 runtime stage(FROM debian:bookworm-slim AS runtime)
# - 兩個 binary(server + migration)被 build + strip
# - 第一次無 cache build 預計 5-10 分鐘(per SC-001、依 host CPU)
```

#### Scenario 2 — Image size < 250MB

```bash
docker image inspect rust-api:test --format='{{.Size}}'
# 將 bytes 轉 MB:
docker image inspect rust-api:test --format='{{.Size}}' | awk '{printf "%.1f MB\n", $1/1024/1024}'

# 預期:< 250MB(per SC-002 target)
# 250-300MB 接受;> 300MB 須 plan 階段優化(per edge case)
```

#### Scenario 3 — Multi-stage 正確(runtime image 不含 builder)

```bash
docker history rust-api:test --no-trunc

# 預期:
# - 看到 runtime stage 各 RUN / COPY / USER / ENV / ENTRYPOINT 步驟
# - 看不到 builder stage 中間 layer(rust:1.86-slim-bookworm 的 cargo build / apt install 等)
# - 也可用 docker image inspect rust-api:test --format='{{.RootFS.Layers}}' 看 layer 數量(預期 < 15 個 runtime layer)
```

---

### Dimension B — Non-root user 配置(scenarios 4-6)

#### Scenario 4 — User 名

```bash
docker run --rm --entrypoint whoami rust-api:test
# 預期 stdout: rust-api
```

#### Scenario 5 — UID

```bash
docker run --rm --entrypoint id rust-api:test
# 預期 stdout 含: uid=10001(rust-api) gid=10001(rust-api)
```

#### Scenario 6 — Resources owner

```bash
docker run --rm --entrypoint ls rust-api:test -la /app/server/resources/

# 預期 output:
# total ...
# drwxr-xr-x ... rust-api rust-api ...  .
# drwxr-xr-x ... root     root     ...  ..       # parent /app/server/ 預期 root owner、不影響
# -rw-r--r-- ... rust-api rust-api ...  application.yaml
# -rw-r--r-- ... rust-api rust-api ...  ip2region.xdb
# -rw-r--r-- ... rust-api rust-api ...  rbac_model.conf
#
# 3 個 resources 都 owner = rust-api:rust-api
# (parent dir owner 不重要、rust-api 可 ls / read 即 ok)
```

---

### Dimension C — Binary 可用性(scenarios 7-9 + 9b)

#### Scenario 7 — Migration CLI 可呼叫

```bash
docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help

# 預期 output:
# - sea-orm migration CLI help 文字
# - 含 subcommands:up / down / fresh / refresh / reset / status / generate 等
# - exit 0
```

#### Scenario 8 — F1.1 strict secret 驗證:無 env 應 panic

```bash
docker run --rm rust-api:test 2>&1 | head -20

# 預期:
# - 啟動短時間後 panic
# - stderr 含 F1.1 secret 缺失訊息(per 004-jwt-secrets spec,substring 如 "jwt_secret" / "APP_JWT_JWT_SECRET" / "secret_validation")
# - exit code != 0
```

#### Scenario 9 — 帶 secret env、無 DB 進入 retry

```bash
docker run --rm --name w-f1-retry-test \
    -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) \
    rust-api:test 2>&1 | head -20 &
# 觀察 ~5 秒看 stderr / stdout
sleep 5
docker stop w-f1-retry-test 2>/dev/null

# 預期:
# - 啟動成功通過 F1.1 secret 驗證
# - 進入 DB connect retry loop(stderr 含 connection refused / DNS resolve fail 等 message,但不 panic)
# - manual stop 後 cleanup
```

#### Scenario 9b — APP_SERVER_PORT env 確實 override yaml(Q1 clarify 驗)

```bash
# 起 container + port forward 11081
docker run -d --name w-f1-port-test -p 11081:11081 \
    -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) \
    rust-api:test

# 等 startup
sleep 3

# 從 container 內看 listen port
docker exec w-f1-port-test sh -c 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null' | head -5
# 或從 host 連 11081(若 server 啟動完成、需 DB OK 才有完整 boot — 可能還在 retry 此測仍 valid 因 TCP listen 在 retry 前已起)
# nc -zv 127.0.0.1 11081

# 預期:
# - listen 0.0.0.0:11081 而非 0.0.0.0:10001
# - 證明 APP_SERVER_PORT=11081 env 已 override application.yaml server.port: 10001

# cleanup
docker stop w-f1-port-test && docker rm w-f1-port-test
```

---

### Dimension D — `/health` endpoint(scenarios 10-12 + 12b)

> **Prerequisites**:需要完整 stack 起來(postgres + redis + secret env)才能驗。
> W-F3 之前 compose 未交付,此處用 manual docker run + ad-hoc network 跑 minimal stack。

#### 準備 minimal stack(ad-hoc,非 W-F3 deliverable)

```bash
# 起 ad-hoc network
docker network create rev1-w-f1-test 2>/dev/null

# 起 postgres
docker run -d --name w-f1-postgres --network rev1-w-f1-test \
    -e POSTGRES_USER=soybean \
    -e POSTGRES_PASSWORD=soybean@123. \
    -e POSTGRES_DB=soybean_admin_rust \
    postgres:17.4

# 起 redis
docker run -d --name w-f1-redis --network rev1-w-f1-test \
    redis/redis-stack:7.4.0-v3 \
    redis-server --requirepass 123456

# 等 ready
sleep 5

# 跑 migration(用 W-F1 image 的 migration binary)
docker run --rm --network rev1-w-f1-test \
    --entrypoint /usr/local/bin/migration \
    -e APP_DATABASE_URL=postgres://soybean:soybean@123.@w-f1-postgres:5432/soybean_admin_rust \
    rust-api:test up

# 起 rust-api(用 W-F1 image)
docker run -d --name w-f1-rust-api --network rev1-w-f1-test -p 11081:11081 \
    -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) \
    -e APP_DATABASE_URL=postgres://soybean:soybean@123.@w-f1-postgres:5432/soybean_admin_rust \
    -e APP_REDIS_URL=redis://:123456@w-f1-redis:6379 \
    rust-api:test

# 等啟動完成
sleep 8
```

#### Scenario 10 — /health 200 OK

```bash
docker exec w-f1-rust-api curl -f http://localhost:11081/health
# 預期 stdout: ok
# 預期 exit: 0
# -f flag 確保 HTTP 4xx/5xx 也讓 curl 退非 0

# 或從 host:
curl -f http://localhost:11081/health
# 預期同上
```

#### Scenario 11 — 不帶 token call(public)

```bash
# 確認無 Authorization header 也 200
curl -v http://localhost:11081/health 2>&1 | grep -E "^< HTTP|^ok$"
# 預期:
# < HTTP/1.1 200 OK
# ok
# 證明不過 jwt_auth_middleware / casbin layer
```

#### Scenario 12 — Source code grep

```bash
cd rust-api/
grep -rn "/health" server/router/src/ server/initialize/src/router_initialization.rs

# 預期:至少 1 命中
# - server/initialize/src/router_initialization.rs:NNN: .route("/health", get(|| async { "ok" }))
# (per R-003 拍板:mount 點在 router_initialization.rs 末尾 `app.merge(...)` 內)
```

#### Scenario 12b — INFO log silent + debug 可開

```bash
# INFO level(預設):
docker logs --tail 100 w-f1-rust-api 2>&1 > /tmp/before-health.log

for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -s http://localhost:11081/health > /dev/null
done
sleep 2

docker logs --tail 100 w-f1-rust-api 2>&1 > /tmp/after-health.log
diff /tmp/before-health.log /tmp/after-health.log | grep -i "/health"
# 預期:0 個 /health-related row(diff 內無 /health 字樣)

# Debug level:
docker stop w-f1-rust-api
docker rm w-f1-rust-api
docker run -d --name w-f1-rust-api --network rev1-w-f1-test -p 11081:11081 \
    -e RUST_LOG=debug \
    -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) \
    -e APP_DATABASE_URL=postgres://soybean:soybean@123.@w-f1-postgres:5432/soybean_admin_rust \
    -e APP_REDIS_URL=redis://:123456@w-f1-redis:6379 \
    rust-api:test
sleep 8

for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -s http://localhost:11081/health > /dev/null
done
sleep 2

docker logs w-f1-rust-api 2>&1 | grep -i "health" | head -5
# 預期:有 debug 級別 trace 命中
```

#### Cleanup ad-hoc stack

```bash
docker stop w-f1-rust-api w-f1-postgres w-f1-redis 2>/dev/null
docker rm w-f1-rust-api w-f1-postgres w-f1-redis 2>/dev/null
docker network rm rev1-w-f1-test 2>/dev/null
```

---

### Dimension E — Image tagging convention(scenarios 13-15)

#### Scenario 13 — Spec.md 已明示 tagging 規則

```bash
grep -E "^- \*\*FR-01[678]\*\*" specs/006-dockerfile-rust-api/spec.md
# 預期 3 行命中(FR-016 + FR-017 + FR-018 = tagging 規則)
```

#### Scenario 14 — Short SHA tag 合法

```bash
SHA=$(cd rust-api && git rev-parse --short=7 HEAD)
docker build -t rust-api:${SHA} rust-api/
docker images rust-api --format '{{.Tag}}' | grep -F "${SHA}"
# 預期:tag 創建成功、出現在 docker images 列表
```

#### Scenario 15 — Branch tag 合法

```bash
docker build -t rust-api:rev1-admin-rust-api rust-api/
docker images rust-api --format '{{.Tag}}'
# 預期:同時看到 short SHA tag(scenario 14)+ branch tag(rev1-admin-rust-api)+ test(scenario 1)
# 證明三類 tag 都可正常 build / 引用
```

---

## SC verification 對照

| SC | Verification 命令 / 觀察 | Pass criteria |
|---|---|---|
| SC-001 | 跑 Scenario 1 + `time docker build -t rust-api:test rust-api/`(乾淨環境) | 5-10 分鐘 |
| SC-002 | 跑 Scenario 2 | < 250MB target、250-300MB acceptable |
| SC-003 | 跑 Scenario 1 兩次,第二次 `time docker build ...` | 第二次 < 1 分鐘(cache hit) |
| SC-004 | 跑 Scenario 10 並 measure latency: `time curl http://localhost:11081/health` | p99 < 50ms(local docker network) |
| SC-005 | 跑 Dimension A-E 全 15 個 scenarios | 100% pass |
| SC-006 | 跑 Scenario 7(migration help) + Dimension D 內 migration up 步驟 | 兩個都 exit 0 |
| SC-007 | 等 W-F2/W-F3/W-F4 spec/plan 階段檢查 W-F1 是否成為 blocker | spec 階段無 referrer block |
| SC-008 | (post-implement)用 W-F1 image 起完整 stack 跑 F5.1 acceptance subset(login + getUserInfo + getUserRoutes) | F5.1 e2e 通 |

---

## Troubleshooting

### Build fails 在 cargo build 階段
- 看 stderr 具體 error(可能 openssl symbol mismatch / missing dep / 等)
- per R-001:audit 已確認 0 musl-specific dep,若仍 fail 可能要補 `pkg-config` / 另外的 `lib*-dev` apt package
- 重 build:`docker builder prune -f && docker build ...`

### Image size 超過 300MB
- `docker history rust-api:test` 找哪一層最大
- 常見:libssl3 + ca-certificates 約 ~30MB、curl + libcurl ~ 4MB、2 個 stripped binary ~50-80MB、tzdata ~ 5MB → 預期 < 200MB
- 若超 → audit binary size:`docker run --rm --entrypoint ls rust-api:test -lh /usr/local/bin/` 看 strip 是否 work、`opt-level = 3 + lto = "fat"` 是否生效

### `/health` 永遠 404
- 確認 server 啟動完成(docker logs 應看到 "Listening on 0.0.0.0:11081" 或類似)
- 確認 R-003 mount 點正確:`app = app.merge(Router::new().route("/health", get(...)))` 在 `initialize_admin_router()` 末尾、所有 `merge_router!` 之後
- 若 mount 在 apply_layers 內 → /health 會被 jwt_auth_middleware 攔 → 401 而非 404

### `/health` 進了 INFO log
- TraceLayer 仍 active → 確認 mount **不過 apply_layers**(per R-003)
- `app.merge(Router::new().route(...))` 應該直接 merge 進 root Router、不繞 apply_layers

### APP_SERVER_PORT env 沒生效
- 用 Scenario 9b 驗
- 若 listen 仍是 10001 → audit `rust-api/server/config/src/env_config.rs` 確認 `Environment::with_prefix("APP")` 還在
- 若 separator 不對 → 試 `APP__SERVER__PORT` 或 `APP_SERVER__PORT`(可能 nested key 用 `__`)

---

## 兩段式 commit / git workflow(per CLAUDE.md §6.1)

W-F1 implementation 完成時:

```bash
# === 第一段:rust-api worktree ===
cd base-web/../rust-api  # 或 absolute path 進 worktree
git status  # 確認在 rev1-admin-rust-api 分支
git add Dockerfile .dockerignore server/initialize/src/router_initialization.rs  # 與 plan 階段 implement 的檔案
git commit -m "feat(rust-api): W-F1 dockerfile-rust-api 落地（debian+glibc multi-stage + /health endpoint）"
git push origin rev1-admin-rust-api

# === 第二段:outer feature branch ===
cd ..  # 回 outer repo
git branch --show-current  # 應為 006-dockerfile-rust-api
git add rust-api specs/006-dockerfile-rust-api/  # rust-api submodule SHA pin + spec docs
git commit -m "chore(submodule): bump rust-api 到 <short-sha> — W-F1 dockerfile-rust-api 完整落地 + spec-kit 全套"
# push 須 user 同意(per CLAUDE.md §5)
```

Feature 完成後 merge `006-dockerfile-rust-api` → `rev1-admin-root`,解鎖 W-F2 / W-F3 / W-F4 後續 P1 features。
