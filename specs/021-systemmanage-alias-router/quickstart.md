# Quickstart: F9 — systemManage-alias-router

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

人類可讀的 F9 happy path + 故障排查指南。執行細節 → [`contracts/verification-commands.md`](contracts/verification-commands.md)。

---

## Prerequisites

- ✅ F11 已 merge(outer `6299640` + merge `81ecb0d`、rust-api `c58e619`、acceptance 7/7 PASS、抽離項清單 4/5 完成)
- ✅ W-FA1 stack 7 service 配置就位(per CLAUDE.md §5.2.1 — `docker compose -f -f -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`)
- ✅ rust-api image 既有 tag `rust-api:rev1-admin-rust-api`(F11 SHA `82efdc108bed`)
- ✅ branch `021-systemmanage-alias-router` 已 by `/speckit-specify` 前 hook 建好

---

## Step 1: 確認 baseline

```bash
# 1) 外層 branch 確認
git branch --show-current  # 應為 021-systemmanage-alias-router

# 2) rust-api worktree branch 確認
(cd rust-api && git branch --show-current)  # 應為 rev1-admin-rust-api、status clean(F11 已 merge)

# 3) F11 merge history 確認
git log --oneline | grep -E 'F11 完成|F11 extracted-stubs' | head -3

# 4) Stack 起 + healthy 確認
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
# 預期 6 service healthy + migration exited 0
```

---

## Step 2: Rust source patch — 12 file 改動

按 [`data-model.md`](data-model.md) E1-E10 順序改動。**file 改動 12 file ~315 LOC**(per R-Q1 修正後):

### 2.1 API handler 改動(3 file、+~85 LOC)

- **`rust-api/server/api/src/admin/sys_user_api.rs`**(改、+~40 LOC):加 2 個 handler
  - `delete_user_by_body`(body 抽 `{id}` → call service.delete_user)
  - `batch_delete_users`(per-row loop + Ok counter++ / Err continue、永遠回 200 + `{deletedCount: N}`)
  - **注意**:per R-Q1 spec correction — **不需新做 `update_user_post`**、既有 `update_user` handler 用 `ValidatedForm<UpdateUserInput>` body extractor + 對 HTTP method 無 dependency,F9 直接 mount with `post(SysUserApi::update_user)` 即可

- **`rust-api/server/api/src/admin/sys_role_api.rs`**(改、+~25 LOC):加 1 個 handler `get_all_roles` → call `SysRoleService::find_all_enabled`

- **`rust-api/server/api/src/admin/sys_menu_api.rs`**(改、+~20 LOC):加 1 個 handler `get_all_pages` → call `SysMenuService::find_all_page_keys`

### 2.2 Service layer 改動(2 file、+~35 LOC)

- **`rust-api/server/service/src/admin/sys_role_service.rs`**(改、+~20 LOC):加 trait + impl `find_all_enabled`(SELECT * FROM sys_role WHERE status=Enabled AND deleted_at IS NULL)

- **`rust-api/server/service/src/admin/sys_menu_service.rs`**(改、+~15 LOC):加 trait + impl `find_all_page_keys`(SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL)

### 2.3 DTO 改動(1 file、+~15 LOC)

- **`rust-api/server/model/src/admin/input/sys_user.rs`**(改、+~15 LOC):加 2 個 DTO `DeleteUserByBodyInput { id: String }` + `BatchDeleteUserInput { ids: Vec<String> }`(無 `validator::Validate` derive、per FR-018)

### 2.4 Router 改動(2 file、+~81 LOC)

- **`rust-api/server/router/src/admin/sys_system_manage_route.rs`**(**新建**、~80 LOC):`SysSystemManageRouter::init_router()` 含 10 條 route mount + 10 個 RouteInfo register、`nest("/systemManage", ...)`
  - 5 個重用直接 mount(getRoleList / getUserList / addUser / getMenuList/v2 / getMenuTree)
  - 1 個重用 + method 變(updateUser POST mount existing `SysUserApi::update_user`、per R-Q1)
  - 1 個變形 wrapper(deleteUser body extract、per R-Q4)
  - 1 個新做 stub(batchDeleteUser per-row loop)
  - 2 個新做完整(getAllRoles + getAllPages)
- **`rust-api/server/router/src/admin/mod.rs`**(改、+1 LOC):`pub mod sys_system_manage_route; pub use ...::SysSystemManageRouter;`

### 2.5 Initialize 改動(1 file、+~8 LOC)

- **`rust-api/server/initialize/src/router_initialization.rs`**(改、+~8 LOC):
  - import 加 `SysSystemManageRouter`
  - 在既有 `SysSandboxRouter` 或 `SysMockRouter` register 後加 `merge_router!(SysSystemManageRouter::init_router().await, None, true, true, None);`

### 2.6 Migration 改動(3 file、~83 LOC)

- **`rust-api/migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`**(**新建**、~80 LOC):`MigrationTrait` impl + `up()` INSERT 20 row(2 role × 10 endpoint × v4='')+ `down()` DELETE 20 row(per F11 R-Q5 baseline)
- **`rust-api/migration/src/datas/mod.rs`**(改、+1 LOC):`pub mod m20260520_a_f9_system_manage_alias_seed;`
- **`rust-api/migration/src/lib.rs`**(改、+2 LOC):`Migrator::migrations()` vec 加 `Box::new(m20260520_a_f9_system_manage_alias_seed::Migration)`

---

## Step 3: Rebuild rust-api docker image

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**預期**: warm cache ~3-5 min(per NFR-005)、新 image SHA。

---

## Step 4: Force-recreate migration + rust-api(F9 migration 自動 init container rerun)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -10

# 看 migration log 確認 F9 migration 跑過
docker compose logs migration --tail=10

# 確認 stack 健康
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**預期**: migration log 含 `Applying migration 'm20260520_a_f9_system_manage_alias_seed'`、6 service healthy、migration exited 0。

---

## Step 5: 跑 C-V1 ~ C-V10 acceptance(per [`contracts/verification-commands.md`](contracts/verification-commands.md))

按順序跑、每個 ≤ 1-2 sec、整體 ≤ 15s(per NFR-001):

1. **C-V1** rust-api image rebuild(in Step 3 已驗、檢 SHA)
2. **C-V2** Casbin 20 row 落 DB
3. **C-V3** Soybean 4 重用 mount endpoint(getRoleList / getUserList / getMenuList/v2 / getMenuTree)
4. **C-V4** Soybean 4 變形 + 新做 endpoint(addUser + updateUser + deleteUser + batchDeleteUser)
5. **C-V5** Soybean 2 新做完整 handler(getAllRoles + getAllPages)
6. **C-V6** GeneralUser getUserList HTTP 200 + envelope `{code:5001, success:false}`
7. **C-V7** sys_operation_log batchDelete audit ≥ 1 row
8. **C-V8** three-side scope verify(base-web 0 + nestjs 0 + rust-api 12 file + docker-compose 0)
9. **C-V9** stack 6 service healthy
10. **C-V10** 既有 `/user/` `/role/` `/route/tree` 3 條不退化

**10/10 PASS** = F9 acceptance NFR-004 標誌達成。

---

## Step 6: 兩段式 commit + push 等 user 同意(per CLAUDE.md §6.1)

### Stage 1: rust-api worktree commit

```bash
cd rust-api
git status --short  # 預期 12 file:7 改 + 3 新建 + 2 register/mod
git add server/api/src/admin/sys_user_api.rs \
        server/api/src/admin/sys_role_api.rs \
        server/api/src/admin/sys_menu_api.rs \
        server/service/src/admin/sys_role_service.rs \
        server/service/src/admin/sys_menu_service.rs \
        server/model/src/admin/input/sys_user.rs \
        server/router/src/admin/sys_system_manage_route.rs \
        server/router/src/admin/mod.rs \
        server/initialize/src/router_initialization.rs \
        migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs \
        migration/src/datas/mod.rs \
        migration/src/lib.rs
git commit -m "feat(rust-api): F9 補 10 條 /systemManage/* alias router + Casbin policy seed
..."
```

### Stage 2: outer commit

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
sed -i "s|rust-api \`<sha-pending>\`|rust-api \`${RUST_API_SHA}\`|g" docs/INTEGRATION-CHECKLIST.md
git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json specs/021-systemmanage-alias-router/ rust-api
git commit -m "feat(spec): F9 systemManage-alias-router — 10 條 alias 完整交付 + DESIGN-A §4.2 5/5 收尾
..."
```

### Stage 3: Push 等 user 同意

告知 user:「F9 兩段式 commit 已落(rust-api $SHA、outer 在本機)、要 push + merge + SHA fill follow-up 嗎?」對齊 CLAUDE.md §5。

User 同意後跑:
```bash
cd rust-api && git push origin rev1-admin-rust-api && cd ..
git push origin 021-systemmanage-alias-router
git switch rev1-admin-root
git merge --no-ff 021-systemmanage-alias-router -m "Merge branch '021-systemmanage-alias-router' into rev1-admin-root: F9 完成"
# SHA fill follow-up + push rev1-admin-root(等 user 二次同意)
```

---

## 故障排查

### Build / Compile

**症狀**: `cargo build` 在 docker build 階段 fail

**可能原因 + 解**:
- `error: unresolved import server_service::admin::SysRoleService` → `server/service/src/admin/mod.rs` 漏 re-export、檢 `pub use sys_role_service::SysRoleService;`
- `error: cannot find function find_all_enabled` → trait 加 method 但 impl 沒實作、檢 `SysRoleService impl TRoleService` block
- `error: cannot find type DeleteUserByBodyInput` → DTO 在 `sys_user.rs` 加但 `mod.rs` 沒 re-export、檢 `pub use sys_user::DeleteUserByBodyInput;`
- `error: missing trait method find_all_page_keys` → 加 trait method 但 some impl(若有 mock impl)沒實作

**Reference**: data-model.md E1-E10

### Stack 起不來

**症狀**: `docker compose up --wait` timeout 或 rust-api 重啟 loop

**可能原因 + 解**:
- migration container fail(`docker compose logs migration`)→ INSERT row 觸 UNIQUE constraint(seaql_migrations 異常)→ 檢 `m20260520_a_f9` 是否已 partial 跑過
- rust-api panic on Casbin init → casbin_rule 表有 v4='allow' row 殘留(F11 已修為 ''、F9 沿用、若 manual UPDATE 殘留 → 清乾淨)→ F11 R-Q5 已 baseline 解
- rust-api panic on router init → axum route conflict → 檢 `sys_system_manage_route.rs` 是否誤 mount 同 path 兩次

### C-V3 / C-V4 / C-V5 — Soybean endpoint HTTP 502 或 404

**症狀**:
- HTTP 404 → endpoint 未註冊、檢 `sys_system_manage_route.rs` mount 順序 + `router_initialization.rs` `merge_router!` register
- HTTP 502 → Casbin enforce error(per F11 R-Q5、v4='allow' 顯式衝突)→ 檢 m20260520 是否誤用 v4='allow' 而非 ''
- HTTP 200 + envelope code:5001 → Casbin policy 未對 ROLE_SUPER allow、檢 m20260520 INSERT row 是否含 ROLE_SUPER

**Reference**: F11 R-Q5(v4='' baseline)+ R-Q6(envelope wrap)

### C-V4d batchDeleteUser — `{deletedCount: 0}` 即使有 valid id

**症狀**: `{deletedCount: 0}` 但 ids 含應該存在的 user id

**可能原因 + 解**:
- 既有 `SysUserService::delete_user` 對 valid id 也 raise Err(可能因 actor permission 邏輯)→ 檢 service log
- service tx 異常 → 檢 db connection log
- ids 全為已 soft-deleted user → service 對已 soft-deleted id 預期 Err

### C-V6 GeneralUser HTTP 200 + envelope `{code:0, data:...}`(該 deny 但 allow)

**症狀**: GeneralUser 訪問 `/systemManage/getUserList` 得 paginated data(該 deny)

**可能原因 + 解**:
- m20260520 row 含 ROLE_USER → 檢 INSERT SQL、F9 不該對 GeneralUser allow
- 既有 g rule 把 GeneralUser map 到 ROLE_ADMIN(罕見)→ 檢 F5.1 seed `m20241024_033933_insert_sys_user_role.rs`

### C-V10 既有 `/user/` HTTP 404 或行為改變

**症狀**: 既有 `/user/` endpoint 退化

**可能原因 + 解**:
- F9 誤改既有 router file(`sys_user_route.rs`)→ check git diff、abort F9 + 還原
- F9 誤改既有 m20241024 migration → check git diff、F9 不該動既有 migration(per FR-014)

---

## Risk Reference

對齊 spec.md Risks(R-1 ~ R-6):

| Risk | 對應 quickstart 點 | 緩解 |
|---|---|---|
| R-1 update_user 重用既有 handler | Step 2.1 + R-Q1 修正 | 既有 handler method-agnostic、直接 mount with POST、不需 wrapper |
| R-2 batchDelete counter 準確性 | Step 2.1 + C-V4d | per-row match Ok/Err、永遠 200 + counted |
| R-3 axum route `/v2` 解析 | Step 2.4 + C-V3c | static path 字面、cargo build 編譯期自驗 |
| R-4 mod re-export 漏 | Step 2.1-2.5 故障排查 | cargo build surface、優先 add re-export |
| R-5 既有 Casbin 不對齊 ROLE_ADMIN | spec A-006 | 不在 F9 範疇修、留 follow-up feature |
| R-6 migration idempotency | C-V2 故障排查 | seaql_migrations 表追蹤、若 COUNT > 20 為 idempotency bug |

---

## Completion 標誌

- ✅ 10/10 C-V acceptance PASS
- ✅ rust-api 12 file diff(7 改 + 3 新建 + 2 register/mod)、~315 LOC(per R-Q1 修正)
- ✅ 三邊零改動:base-web src 0 + nestjs fork 0 + docker-compose 0
- ✅ 兩段式 commit 落定:rust-api worktree 1 commit + outer 1-2 commit + merge --no-ff + SHA fill follow-up
- ✅ DESIGN-A §4.2 抽離項清單 **5/5 完成**(F11 4 條 + F9 batchDeleteUser 1 條)
- ✅ Casbin policy seed 20 row、v4='' baseline 沿用(per F11 R-Q5)
- ✅ deny path envelope wrap 沿用(per F11 R-Q6、HTTP 200 + `{code:5001, success:false}`)
