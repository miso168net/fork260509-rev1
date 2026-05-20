# Quickstart: F8 — assign-users

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F8 落地操作步驟 — rust-api ~5 file HTTP wiring(handler + route mount + Casbin seed migration)、兩段式 commit。

---

## 前置

- W-FA1 stack with `--profile track-a` 起、6 service healthy
- outer branch = `025-assign-users`、rust-api worktree branch = `rev1-admin-rust-api`
- F7.2 已 merge(`476ca88`、rust-api `84cbc19`)— F8 baseline

---

## Step 1:rust source patch(rust-api worktree、~5 file)

依 data-model.md E1 + E2 + E3:
1. `server/api/src/admin/sys_authentication_api.rs`(E1)— 加 `SysAuthenticationApi::assign_users` handler(緊接 `assign_routes` 之後)+ `use server_service::admin::{...}` 加 `AssignUserDto`
2. `server/router/src/admin/sys_authentication_route.rs`(E2)— `init_authorization_router` 的 `routes` vec 加 1 條 `RouteInfo` + `authorization_router` 加 `.route("/assign-users", post(...))`
3. `migration/src/datas/m20260522_a_f8_assign_users_seed.rs`(E3、新建)— Casbin `p` policy seed 1 row(ROLE_SUPER)
4. `migration/src/datas/mod.rs`(E3)— 加 `pub mod m20260522_a_f8_assign_users_seed;`
5. `migration/src/lib.rs`(E3)— Migrator vec 末尾加 `Box::new(datas::m20260522_a_f8_assign_users_seed::Migration),`

```bash
cd rust-api && git status --short && cd ..
# 預期:2 改(sys_authentication_api.rs / sys_authentication_route.rs)+ 3(migration:1 新建 + mod.rs + lib.rs)
```

---

## Step 2:rebuild rust-api image(C-V1)

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
預期 exit 0 + warm ~2-3 min。image 同時含 `server` + `migration` 兩 binary(F8 新 migration 隨 `migration` binary 編入)。

---

## Step 3:recreate migration + rust-api(C-V2)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -8
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
docker compose logs migration 2>&1 | tail -15
```
預期 `migration` init-container exited 0(log 見 `m20260522` 套用)、`rust-api` recreated healthy、其他 5 service 仍 healthy(C-V11)。

> F8 有新 migration — **必須** recreate `migration` init-container 使其 apply(對比 F7.2 無 migration 只 recreate rust-api)。

---

## Step 4:acceptance(C-V3~C-V12、見 contracts/verification-commands.md)

依 `contracts/verification-commands.md` 逐項跑:
- C-V3:psql `casbin_rule` — F8 row 落 DB
- C-V4~C-V7:ROLE_SUPER assign-users happy path(capture ROLE_USER 現有 user → additive assign → psql 驗 → re-login getUserInfo 驗 → restore)
- C-V8:Administrator + GeneralUser assign-users → `{code:5001}` deny
- C-V9:sibling `assign-permission` / `assign-routes` 非 404 regression probe
- C-V10:three-side scope(base-web/nestjs/docker-compose 0 diff + rust-api ~5 file)
- C-V11:stack 6 service healthy
- C-V12:空輸入 validation rejection(空 `userIds` / 空 `roleId` → envelope 非 code:0、edge case E-1+E-2)

**整組覆蓋語意**:acceptance 採 capture→assign→verify→restore、用 `ROLE_USER`(role 3)為操作對象、加 `Administrator`(user 2)後還原 — 確保 `sys_user_role` seed 不污染(per spec FR-018)。

---

## Step 5:兩段式 commit(per CLAUDE.md §6.1)

### Stage 1 — rust-api worktree commit
```bash
cd rust-api
git add server/api/src/admin/sys_authentication_api.rs \
        server/router/src/admin/sys_authentication_route.rs \
        migration/src/datas/m20260522_a_f8_assign_users_seed.rs \
        migration/src/datas/mod.rs migration/src/lib.rs
git commit -m "feat(rust-api): F8 加 POST /authorization/assign-users endpoint"
# push 等 user 同意
cd ..
```

### Stage 2 — outer commit(025 feature branch)
```bash
git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json rust-api specs/025-assign-users/
# 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md
git commit -m "feat(spec): F8 assign-users — user-role 指派 endpoint"
```

### Stage 3 — push 等 user 同意
告知 user 兩段式 commit 已落、push outer 025 + merge `--no-ff` 回 `rev1-admin-root` + SHA fill follow-up 需 user 同意(per CLAUDE.md §5)。

---

## 故障排查

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| cargo build fail `AssignUserDto` not found | `sys_authentication_api.rs` import 漏加 `AssignUserDto` | check data-model E1 import |
| `assign-users` HTTP 404 | route 沒掛 | check E2 `init_authorization_router` 兩處改動 |
| `assign-users` 對 ROLE_SUPER 回 `code:5001` | Casbin seed 沒生效 | check C-V2 migration 是否 apply、C-V3 psql 是否有 row |
| migration init-container 非 exited 0 | `m20260522` SQL error / `mod.rs` / `lib.rs` 註冊漏 | check migration log |
| `sys_user_role` seed 被污染 | acceptance 沒走 restore | 跑 C-V7 還原、或 psql 手動修回 baseline |
| sibling endpoint 變 404 | `init_authorization_router` 改動誤刪 sibling route | check E2、比對既有 `.route()` 鏈 |
