# Quickstart: F6 route-guard(`/route/isRouteExist`)

**Feature**: F6 — route-guard
**Audience**: rust-api implementer / integration tester
**Date**: 2026-05-18

> 本 quickstart 是 F6 implementer 操作指引 + acceptance 階段 8 個 scenario 對應命令。

---

## 前提

- W-F6 stack 可正常啟動(`docker compose -f -f dev.yml up --wait` 6 service healthy)
- `deploy/secrets/*.txt` 5 個 secret 已備
- F5.1 既有 stack 內 `/auth/login` + `/route/getUserRoutes` 可正常呼叫(F6 baseline)
- 當前 git branch:`013-route-guard`

---

## 模式 1:Implement workflow(走 6 個 rust 改動 + 1 個 outer doc)

### Step 1:rust-api 改動(worktree 內、第 1 段 commit prep)

```bash
cd rust-api

# 1.1 加 IsRouteExistInput DTO struct(server/model/src/admin/input/sys_menu.rs)
# 1.2 加 SysMenuService::is_route_exist method(server/service/src/admin/sys_menu_service.rs)
# 1.3 加 SysMenuApi::is_route_exist handler(server/api/src/admin/sys_menu_api.rs)
# 1.4 加 route mount + RouteInfo(server/router/src/admin/sys_menu_route.rs)
# 1.5 新建 migration m20260518_a_f6_isRouteExist_seed.rs(migration/src/datas/)
# 1.6 改 mod.rs register migration

# Compile check
cargo check -p server-api -p server-service -p server-model -p migration

cd ..
```

### Step 2:dev stack 重 build + 起

```bash
# Down + rebuild rust-api image(F6 改了 source)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.dev.yml build rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps
# 預期:6 service healthy(含 migration exit 0、F6 seed migration up 完成)
```

### Step 3:Acceptance 跑(per quickstart 模式 2)

如 OK,進 Phase 7 兩段式 commit。

---

## 模式 2:Acceptance 跑(US1 / US2 / US3、per contracts/verification-commands.md)

### 取 token(prereq)

```bash
TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login | jq -r '.data.token')
echo "${TOKEN:0:50}..."
```

### US1:routeName 存在回 true

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq
# 預期:{"code": 0, "data": true, ...}
```

### US2:routeName 不存在回 false

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=non-existent-xyz' | jq
# 預期:{"code": 0, "data": false, ...}
```

### US3:soft-deleted / disabled 回 false(per C-V6 + C-V7)

```bash
# Setup soft-delete:
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "UPDATE sys_menu SET deleted_at = NOW() WHERE route_name = 'home';"

# Verify false:
curl -fsS -H "Authorization: Bearer $TOKEN" \
  '.../api/route/isRouteExist?routeName=home' | jq -r '.data'

# Cleanup:
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "UPDATE sys_menu SET deleted_at = NULL WHERE route_name = 'home';"

# Setup disabled:
PGPASSWORD=... psql ... -c "UPDATE sys_menu SET status = 'disabled' WHERE route_name = 'home';"
curl ... | jq -r '.data'   # 預期 false
# Cleanup:
PGPASSWORD=... psql ... -c "UPDATE sys_menu SET status = 'enabled' WHERE route_name = 'home';"
```

### 補強驗(auth + Casbin seed + endpoint sync)

```bash
# 1. 無 token 應 401
curl -fsSI 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -3

# 2. Casbin seed 3 row exists
PGPASSWORD=... psql ... -c "SELECT v0 FROM casbin_rule WHERE v2 = '/route/isRouteExist';"

# 3. sys_endpoint sync 1 row exists
PGPASSWORD=... psql ... -c "SELECT path, method FROM sys_endpoint WHERE path = '/route/isRouteExist';"

# 4. base-web src 零改動
git diff HEAD -- base-web/src/   # 預期無輸出
```

---

## 模式 3:Phase 7 兩段式 commit + push

### Stage 1:rust-api worktree commit + push fork

```bash
cd rust-api

git status
# 預期:5-6 個 modified / new file 在 server + migration 目錄

git add server/api/src/admin/sys_menu_api.rs \
        server/service/src/admin/sys_menu_service.rs \
        server/model/src/admin/input/sys_menu.rs \
        server/router/src/admin/sys_menu_route.rs \
        migration/src/datas/

git commit -m "$(cat <<'EOF'
feat(rust-api): F6 加 /route/isRouteExist endpoint + Casbin policy seed

新增 endpoint GET /route/isRouteExist?routeName=<name>,補完 base-web vue-router
guard 在 dynamic auth route mode 下 not-found vs 無權限 disambiguation 邏輯。

改 / 新建:
- IsRouteExistInput DTO struct(model/input/sys_menu.rs)
- SysMenuService::is_route_exist method(service/sys_menu_service.rs)
  · 3 filter:route_name eq + deleted_at IS NULL + status = enabled
- SysMenuApi::is_route_exist handler(api/sys_menu_api.rs)
- Route mount + RouteInfo("/route/isRouteExist", GET, SysMenuApi)
  · 加進 init_protected_menu_router 自動繼承 CasbinAxumLayer enforce
- migration m20260518_a_f6_isRouteExist_seed.rs
  · INSERT 3 row casbin_rule p-policy 對 SUPER/ADMIN/USER allow

範疇外:base-web src 任何改動(Principle IV 零改);utoipa macro(對齊 F5.1
不引入);caching / rate limiting(OOS);user-specific 可訪問性查詢(那是
getUserRoutes 範疇)。

Acceptance:US1 P1 MVP 3/3 + US2 P2 2/2 + US3 P2 3/3 = 8/8 PASS;Casbin
allowlist mode + 3 role seed → 所有 logged-in user 可查;sys_menu filter
3 condition 嚴守;base-web zero diff(Principle IV verified)。

DESIGN-A / DESIGN-B identical(無 nestjs 分歧、handler 在 rust-api、未來
nestjs 退場零影響)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin rev1-admin-rust-api
cd ..
```

### Stage 2:outer SHA pin update + doc

```bash
# 等 user 同意 push fork 才執行 stage 2 outer commit

# 拿 stage 1 commit SHA:
NEW_RUST_SHA=$(cd rust-api && git rev-parse --short HEAD)
echo "New rust-api SHA: $NEW_RUST_SHA"

# Outer 改動:
# - CLAUDE.md §10 SPECKIT marker(Active feature 改回 無 + 加 F6 進 Previous features)
# - docs/INTEGRATION-CHECKLIST.md(F6 row ✅ + Current Focus + 已完成里程碑)
# - rust-api submodule SHA pin

git add rust-api CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json specs/013-route-guard/

git commit -m "$(cat <<EOF
chore(submodule): bump rust-api to $NEW_RUST_SHA — F6 route-guard 落地

F6 /route/isRouteExist endpoint 補完 base-web vue-router guard disambiguation
邏輯;rust-api worktree commit \$NEW_RUST_SHA(per CLAUDE.md §6.1 兩段式 commit
第 2 段)。

同步更新 CLAUDE.md §10 SPECKIT marker(Active 改回 無、加 F6 進 Previous)+
docs/INTEGRATION-CHECKLIST.md(F6 row ✅ + Phase 2 進度 + 已完成里程碑)+
.specify/feature.json + specs/013-route-guard/(spec + plan + research +
data-model + 3 contracts + quickstart + checklist + tasks)。

base-web 零改動;Constitution Check 8 PASS / 15 N/A / 0 violation。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# 等 user 同意 push origin
```

---

## 故障排查

### 1. Stage 1 push fork fail — push permission

**症狀**:`git push origin rev1-admin-rust-api` 報 permission denied。

**對策**:確認 fork remote URL 對(`miso168net/fork260509-soybean-admin-rust.git`)、token / SSH key 有效;若 fork repo 不存在、見 CLAUDE.md §9.1 worktree setup。

### 2. Stage 2 outer SHA pin mismatch

**症狀**:`git submodule status` 顯示 `+` prefix(超前)。

**對策**:這正是 stage 2 該做的(更新 outer 的 pin 到新 rust-api SHA);per CLAUDE.md §6.1 第 2 段 commit 流程。

### 3. F6 implement 後 dev stack rust-api unhealthy

**症狀**:`docker compose ps` 顯示 rust-api unhealthy。

**對策**:
```bash
docker compose logs rust-api --tail 50
# 可能原因:cargo compile error(stage 1 cargo check 應已 catch)/ migration up fail / Casbin layer init fail
```

### 4. acceptance HTTP 403 instead of 200

**症狀**:`curl ... isRouteExist?routeName=home` 回 HTTP 403 + Casbin deny envelope。

**對策**:Casbin seed 未 up;檢:
```bash
PGPASSWORD=... psql ... -c "SELECT count(*) FROM casbin_rule WHERE v2 = '/route/isRouteExist';"
# 若 0、跑 migration up:
docker compose exec rust-api ./migration up
```

### 5. acceptance HTTP 200 + data: false 對 'home'(理論存在)

**症狀**:雖然 'home' 在 seed 內、但回 false。

**對策**:
```bash
PGPASSWORD=... psql ... -c "SELECT route_name, status, deleted_at FROM sys_menu WHERE route_name = 'home';"
# 看 status 是否 enabled、deleted_at 是否 NULL
# 若 status='disabled' 或 deleted_at 非 NULL,正是 F6 SQL filter 預期行為 — 那不是 bug,是 'home' seed 真的不 active
# 改用其他 active route name 驗
```

---

## 下一步

F6 完成後 Phase 2 application 進度推進、可選下一個:
- **F8** `assign-users`(小、機械、F7 之前獨立)
- **F9** `systemManage-alias-router`(機械 thin wrapper、解 base systemManage view)
- **D 拍板** DESIGN-A skip vs not(F10 之前的決策)
- **F5.2 + W-F11 同期**(水平擴展套裝)
- **F7 manage-crud-alignment**(大、留 momentum 高峰)
