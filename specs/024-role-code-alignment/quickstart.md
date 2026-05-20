# Quickstart: F7.2 — role-code-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F7.2 落地操作步驟 — rust-api 1 file role-code alias 映射 patch、兩段式 commit。

---

## 前置

- W-FA1 stack with `--profile track-a` 起、6 service healthy
- outer branch = `024-role-code-alignment`、rust-api worktree branch = `rev1-admin-rust-api`
- F7.1 已 merge(`efe910e`、rust-api `4de171a`)— F7.2 baseline

---

## Step 1:rust source patch(rust-api worktree、1 file)

改 `rust-api/server/api/src/admin/sys_authentication_api.rs`(per data-model E1 + E2 + E3):
1. module level 加 `map_role_alias` 純函式(E1)
2. `get_user_info` handler 的 `roles:` 套 `map_role_alias`(E2)
3. module 加 `#[cfg(test)] mod tests` 含 `test_map_role_alias`(E3)

```bash
cd rust-api && git diff HEAD --stat && cd ..
# 預期:server/api/src/admin/sys_authentication_api.rs 1 file changed
```

---

## Step 2:rebuild rust-api image(C-V1)

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
預期 exit 0 + warm ~2-3 min;`cargo build` 階段順帶編譯 `#[cfg(test)]`。

> unit test 執行(C-V7):rust-api runtime image 為 slim 可能無 cargo。實際跑 `test_map_role_alias` 的方式:
> - 優先:host cargo 環境 `cd rust-api && cargo test -p server-api map_role_alias`(對齊 F10.1 observation、host-mounted cargo cache)
> - 或:docker build 時 multi-stage builder 階段已含 cargo,可在 builder 階段加跑(F7.2 不改 Dockerfile、以 host cargo 為主)

---

## Step 3:restart rust-api(C-V1 後段)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```
預期 rust-api 重啟 healthy + 其他 5 service 仍 healthy(C-V9)。

---

## Step 4:acceptance(C-V2~C-V9、見 contracts/verification-commands.md)

依 `contracts/verification-commands.md` 逐項跑:
- C-V2~C-V4:三 user curl `getUserInfo` → `data.roles` 各為 `R_SUPER` / `R_ADMIN` / `R_USER`
- C-V5:CDP smoke manage 3 view(`/tmp/cdp-f72-smoke.js`、**不帶** role alias workaround)
- C-V6:三 user `/route/getUserRoutes` Casbin enforce regression
- C-V7:`test_map_role_alias` unit test
- C-V8:three-side scope(base-web/nestjs/docker-compose/migration 0 diff + rust-api 1 file)
- C-V9:stack 6 service healthy

CDP smoke script `/tmp/cdp-f72-smoke.js`:沿用 F7.1 `/tmp/cdp-f71-smoke.js`、**移除** `Fetch.enable` / `Fetch.requestPaused` / `Fetch.fulfillRequest` / role alias 注入整段(per research R-Q3)。

---

## Step 5:兩段式 commit(per CLAUDE.md §6.1)

### Stage 1 — rust-api worktree commit
```bash
cd rust-api
git add server/api/src/admin/sys_authentication_api.rs
git commit -m "fix(rust-api): F7.2 getUserInfo role code alias 映射 ROLE_* → R_*"
# push 等 user 同意
cd ..
```

### Stage 2 — outer commit(024 feature branch)
```bash
git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md \
        docs/superpowers/024-feature-role-code-alignment.md \
        .specify/feature.json rust-api specs/024-role-code-alignment/
# 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md
git commit -m "fix(spec): F7.2 role-code-alignment — getUserInfo role code 對齊"
```

### Stage 3 — push 等 user 同意
告知 user 兩段式 commit 已落、push outer 024 + merge `--no-ff` 回 `rev1-admin-root` + SHA fill follow-up 需 user 同意(per CLAUDE.md §5)。

---

## 故障排查

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| `getUserInfo` `roles` 仍 `ROLE_*` | handler 沒套 `map_role_alias` | check data-model E2 |
| cargo build fail `map_role_alias` not found in test | `mod tests` 的 `use super::map_role_alias` 漏 | check E3 import |
| CDP smoke `/manage/*`「无数据」 | C-V2~C-V4 應先 PASS;或 base-web static filter 仍不認 | 先確認 curl roles 已 `R_*` |
| `/route/getUserRoutes` envelope 5001 | Casbin enforce 異常(F7.2 不應影響) | check 是否誤動 JWT / `User::subject` |
| CDP setup 異常 | Edge port / WSL networking | graceful degradation:C-V2~C-V4 curl PASS 即核心通過、C-V5 deferred manual |
