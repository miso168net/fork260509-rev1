# Quickstart: F7.1 — fix-route-getuserroutes-wiring

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F7.1 落地操作步驟速查 — 2 file rust source 改 + rebuild + restart + acceptance + 兩段式 commit。

---

## 前置

- branch `023-fix-route-getuserroutes-wiring` 已建(spec-kit `before_specify` hook、已就位)
- rust-api worktree branch = `rev1-admin-rust-api`
- W-FA1 stack 可起(profile track-a、7 service)
- F7 已 merge(`136b1eb`、rust-api `11b888c`)為 baseline

---

## Step 1 — rust source 2 file 改(~25 LOC)

### 1a. `rust-api/server/initialize/src/router_initialization.rs`(US1、~15 LOC)

把 `init_protected_menu_router` 的 `merge_router!` 單 service 注入改為 manual layer pattern(per data-model E1):
- `merge_router!(SysMenuRouter::init_protected_menu_router().await, SysMenuService, true, true, None)`
- → `let protected_menu_router = ...init_protected_menu_router().await.layer(Extension(Arc::new(SysMenuService) ...)).layer(Extension(Arc::new(SysAuthService) ...));` + `apply_layers(... Services::None ..., true, true, None, casbin.clone(), audience).await;` + `app = app.merge(protected_menu_router);`

### 1b. `rust-api/server/api/src/admin/sys_system_manage_api.rs`(US2、~10 LOC)

把 `list_menu_for_systemmanage` return type 改 paginated(per data-model E2):
- `Res<Vec<SystemManageMenuOutput>>` → `Res<PaginatedData<SystemManageMenuOutput>>`
- body 改 `let records = ...; let total = records.len() as u64; Ok(Res::new_data(PaginatedData { current: 1, size: total, total, records }))`

> 註:本 feature 的 2 file 改在 F7 CDP demo 階段已先 in-place 完成(uncommitted 在 worktree);`/speckit-implement` 階段對照 data-model E1/E2 驗證改動正確即可。

---

## Step 2 — rebuild rust-api image

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
預期 warm ≤ 5 min(F7 baseline 2m 30s)。build fail → 檢 import(`SysAuthService` / `PaginatedData` 預期既有、per research R-Q3)。

---

## Step 3 — restart rust-api + 跑 acceptance

```bash
# restart(force-recreate rust-api、其他 service 不動)
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api

# C-V2~C-V5 curl 層 acceptance(見 contracts/verification-commands.md)
# C-V6~C-V8 CDP smoke(node script + Edge 9229 + Fetch.requestPaused role alias workaround)
# C-V9 three-side scope verify
# C-V10 docker compose ps
```

acceptance 細節見 [`contracts/verification-commands.md`](contracts/verification-commands.md)。

---

## Step 4 — 兩段式 commit

### Stage 1 — rust-api worktree commit

```bash
cd rust-api
git add server/initialize/src/router_initialization.rs server/api/src/admin/sys_system_manage_api.rs
git commit -m "fix(rust-api): F7.1 修 /route/getUserRoutes wiring + menu paginated wrapper

<body 見 tasks.md T100>"
# push 等 user 同意(per CLAUDE.md §5)
cd ..
```

### Stage 2 — outer commit

```bash
RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
# 填 INTEGRATION-CHECKLIST.md rust-api SHA placeholder
git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md \
        .specify/feature.json rust-api specs/023-fix-route-getuserroutes-wiring/
git commit -m "fix(spec): F7.1 fix-route-getuserroutes-wiring — F5.1 wiring + menu paginated

<body 見 tasks.md T101>"
```

### Stage 3 — push 等 user 同意

```bash
# user 同意後:
cd rust-api && git push origin rev1-admin-rust-api && cd ..
git push origin 023-fix-route-getuserroutes-wiring
git switch rev1-admin-root
git merge --no-ff 023-fix-route-getuserroutes-wiring -m "Merge branch '023-fix-route-getuserroutes-wiring' into rev1-admin-root: F7.1 完成"
# SHA fill follow-up(對齊 F7/F9 pattern)
git push origin rev1-admin-root
```

---

## 故障排查速查

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| C-V1 build fail `unused import` | cargo `-D warnings` 嚴格 | check import(預期 `SysAuthService` / `PaginatedData` 既有、不該需新增) |
| C-V2 HTTP 500 `Missing request extension` | E1 wiring fix 沒生效 | check `router_initialization.rs` manual layer `Arc<SysAuthService>` |
| C-V2/3/4 envelope code:5001 | Casbin deny | check casbin_rule(F5.1 m20260515 應 allow `/route/getUserRoutes` 3-role) |
| C-V5 `data` 為 flat array | E2 paginated wrapper 沒生效 | check `sys_system_manage_api.rs` `list_menu_for_systemmanage` return type |
| C-V6 `/manage/menu`「无数据」 | C-V5 應先 PASS;或 SPA typed fetch 沒拿到 records | 先確認 C-V5 paginated shape OK |
| C-V6/7/8 SPA 403 | role alias workaround 沒 enable / wiring fix 沒生效 | check Fetch.requestPaused 注入 + C-V2 PASS |
| C-V7 `/manage/user` row 0 | wiring fix break SysMenuService extension(R-1) | check E1 是否漏 `Arc<SysMenuService>` layer |
| CDP setup fail | Edge port 9229 沒起 / WSL networking | graceful degradation:C-V5 curl PASS 即視 US2 核心通過、C-V6-8 標 deferred |

---

## 完成標誌

- 2 file rust patch 落地、cargo build PASS
- C-V1~C-V10 acceptance 10/10 PASS(C-V6-8 CDP smoke 可 graceful degradation)
- base-web + nestjs + docker-compose + migration 四項 0 diff
- 兩段式 commit + merge `--no-ff` + push(等 user 同意)
- `/route/getUserRoutes` 修復 → F7 acceptance C-V10 deferred 的 CDP smoke baseline 補完、F8 解鎖
