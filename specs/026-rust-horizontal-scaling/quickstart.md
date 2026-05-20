# Quickstart: W-F11 — rust-horizontal-scaling

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

W-F11 落地操作步驟 — rust-api Casbin pub-sub code + `docker-compose.prod.yml` `deploy.replicas` + nginx prod conf、兩段式 commit。

---

## 前置

- outer branch = `026-rust-horizontal-scaling`、rust-api worktree branch = `rev1-admin-rust-api`
- F8 已 merge(`c2b0912`、rust-api `90f37d1`)— W-F11 baseline
- W-F6 `deploy/dev-certs/`(自簽 cert)已備 — prod stack acceptance 用

---

## Step 1:rust source patch(rust-api worktree)

依 data-model.md E2 + E3 + E4:

1. **E2 publisher**(`server_global`)— 新增 `notify_casbin_changed()` + `CASBIN_INVALIDATE_CHANNEL` 常數;`server_global` lib.rs 註冊。
2. **E3 subscriber**(`server_initialize`)— 新建 `server/initialize/src/casbin_sync_initialization.rs`(`spawn_casbin_sync_subscriber(enforcer)` + reconnect loop);`server/initialize/src/lib.rs` 註冊 + re-export。
3. **E3 spawn 點** — `server/initialize/src/casbin_initialization.rs`:`initialize_casbin()` 建出 `CasbinAxumLayer` 後 spawn subscriber(`move` 捕獲 `get_enforcer()` 的 `Arc` clone)。
4. **E4 publish call site**(3 處)— `server/service/src/admin/sys_authorization_service.rs` `sync_role_permissions` 結尾 + `server/api/src/admin/sys_user_api.rs` 2 個 endpoint。
5. 視需要 `rust-api/Cargo.toml`(redis 0.32 async 為預設、預期無需改;若 pub-sub 需特定 feature 才加)。

```bash
cd rust-api && git status --short && cd ..
# 預期:~7-8 file(server_global publisher + lib.rs / casbin_sync_initialization.rs 新建 +
#       initialize lib.rs / casbin_initialization.rs / sys_authorization_service.rs / sys_user_api.rs)
```

---

## Step 2:outer 配置改動

1. **E5** `docker-compose.prod.yml` — rust-api service 加 `deploy: { replicas: 2 }`。
2. **E6** `deploy/front-nginx/conf.d/default.conf.prod` — `rust_api` upstream 改 `resolver` + `zone` + `server rust-api:11081 resolve`。
3. **不改** `docker-compose.dev.yml`、不改共用 `default.conf`(per FR-010 / FR-013)。

---

## Step 3:rebuild rust-api image(C-V1)

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
預期 exit 0。若 fail → check pub-sub code(redis API 用法 / subscriber task / 註冊)。

---

## Step 4:起 prod stack(C-V2)

```bash
# seed dev 自簽 cert 進 named volume(prod baseline 前置、per CLAUDE.md §5.2.1)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
# 起 prod baseline(deploy.replicas: 2 生效)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```
預期 rust-api 出現 2 個 replica(`rev1-admin-rust-api-1` / `-2`)、皆 healthy。

---

## Step 5:acceptance(C-V3~C-V9、見 contracts/verification-commands.md)

依 `contracts/verification-commands.md` 逐項跑:
- C-V3:nginx upstream auto-discovery(`nginx -T` + `getent hosts rust-api` + 經 nginx 請求)
- C-V4:**Casbin 跨 instance 一致性核心測試** — exec mutate 進 rust-api-1 → 驗 rust-api-2 enforce 反映(capture→mutate→verify→restore)
- C-V5:JWT 跨 replica 共享
- C-V6:redis 停 → policy 異動仍成功 + warning log
- C-V7:subscriber reconnect
- C-V8:dev regression(切回 dev stack、rust-api 單實例)
- C-V9:three-side scope

---

## Step 6:兩段式 commit(per CLAUDE.md §6.1)

### Stage 1 — rust-api worktree commit
```bash
cd rust-api
git add <pub-sub publisher + subscriber + 3 call-site + 註冊 files>
git commit -m "feat(rust-api): W-F11 加 Casbin redis pub-sub 跨 instance 一致性"
# push 等 user 同意
cd ..
```

### Stage 2 — outer commit(026 feature branch)
```bash
# 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md
git add docker-compose.prod.yml deploy/front-nginx/conf.d/default.conf.prod \
        CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json rust-api specs/026-rust-horizontal-scaling/
git commit -m "feat(spec): W-F11 rust-horizontal-scaling — Casbin pub-sub + compose replicas + nginx upstream"
```
> outer commit 同時修正 INTEGRATION-CHECKLIST.md / CLAUDE.md §10 的 W-F11 mislabel(observability → rust-horizontal-scaling、Phase W P2 改 3/3、加 W-F11 里程碑、per FR-022)。

### Stage 3 — push 等 user 同意
告知 user 兩段式 commit 已落、push outer 026 + merge `--no-ff` 回 `rev1-admin-root` + SHA fill follow-up 需 user 同意(per CLAUDE.md §5)。

---

## 故障排查

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| cargo build fail redis pub-sub API | redis 0.32 pub-sub API 用法 | check `get_async_pubsub()` / `subscribe` API |
| prod stack rust-api 只起 1 個 | `deploy.replicas` 沒生效 | check `docker-compose.prod.yml` `deploy.replicas: 2`、Compose v2 |
| front-nginx 起不來 | cert 沒 seed 進 volume | 跑 Step 4 的 `docker run cp` cert seed |
| nginx `resolve` 報錯 | 缺 `zone` 或 `resolver` | check upstream 有 `zone`、http context 有 `resolver 127.0.0.11` |
| rust-api-2 mutate 後仍 stale | subscriber 沒連上 / channel 名不符 / publish 沒呼叫 | check subscriber task log、channel 常數、3 個 call site |
| dev stack 起不來 / rust-api 多實例 | dev compose 被誤改 | 確認 `docker-compose.dev.yml` 0 diff |
