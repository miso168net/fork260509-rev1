# Quickstart: F13 — rust-refresh-token-impl

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

F13 落地操作摘要 — 給 implement 階段參考。詳細任務拆解見 `/speckit-tasks` 產出的 `tasks.md`。

> ⚠️ F13 屬 DESIGN-A §6.1 Phase 5(P5)、有 time gate(F10 在 DESIGN-A 形態運行 N 週驗證);本 plan 為設計先行,實際 implement 時機由 time gate 決定。

---

## 1. rust-api worktree — 新增 `POST /auth/refreshToken`

5 處改動(無新 crate、無 migration、改既有檔):

```text
rust-api/server/
├── model/src/admin/input/sys_authentication.rs   # 改:加 RefreshTokenInput DTO
├── model/src/admin/input/mod.rs                   # 改:re-export RefreshTokenInput
├── core/src/web/jwt.rs                            # 改:加 validate_refresh_token
├── service/src/admin/sys_auth_service.rs          # 改:加 refresh_token service method
├── api/src/admin/sys_authentication_api.rs        # 改:加 refresh_token_handler
└── router/src/admin/sys_authentication_route.rs   # 改:init_authentication_router 加 mount
```

**重用元件**(不新增):`generate_auth_output` / `get_user_roles`(`sys_auth_service.rs`)、`JwtUtils` / `Claims` / `RefreshClaims`(`server-core`)、`sys_user::find_active`(facade)、`sys_tokens` entity + `TokenStatus`、F4 `Res` + `code.rs`、`ClientIp` / `xdb` / axum extractor — 見 data-model E1–E6 / research R-Q1–R-Q7。

`refresh_token` service method 流程:`validate_refresh_token` → `sys_tokens` 查 by refresh_token → status==Active 檢查 → `sys_user::find_active` by sub(軟刪檢查 + 取 username/domain)→ `get_user_roles` → `generate_auth_output` → 輪替 transaction(`update_many` 標舊 row used + INSERT 新 row、單一 txn)。

## 2. 無 outer 部署改動

F13 **不改** `docker-compose*.yml`、**不改** nginx conf(`/api/auth/refreshToken` routing 切換是 F14)、**無 DB migration**。outer 端只有 spec docs + `CLAUDE.md` SPECKIT marker + `INTEGRATION-CHECKLIST.md`。

## 3. Build + 驗證

```bash
# rebuild rust-api image
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/

# 起 dev stack(track-a)
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait

# refresh 驗證(直連 rust :11081 — nginx /api/auth/refreshToken 仍 → nestjs、F14 才切)
LOGIN=$(curl -fsS -X POST http://127.0.0.1:11081/auth/login \
  -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}')
RT=$(echo "$LOGIN" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
curl -fsS -X POST http://127.0.0.1:11081/auth/refreshToken \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}"
```

## 4. Acceptance

依 `contracts/verification-commands.md` C-V1~C-V10 逐項驗:image rebuild / refresh 成功回新 token pair / 輪替 sys_tokens / 新 access token 可用 / 已用 token 重用被拒 / 無效 token 被拒 / 軟刪 user 被拒 / 不寫 operation_log+login_log / dev stack regression + nginx 不變 / three-side scope。

acceptance 採「login 取 token → refresh → 驗 → 還原」模式;C-V7 軟刪測試用 GeneralUser、跑完還原 `deleted_at`。

## 5. 兩段式 commit(per CLAUDE.md §6.1)

```bash
# === Stage 1:rust-api worktree ===
cd rust-api
git add server/model/src/admin/input/ server/core/src/web/jwt.rs \
        server/service/src/admin/sys_auth_service.rs \
        server/api/src/admin/sys_authentication_api.rs \
        server/router/src/admin/sys_authentication_route.rs
git commit -m "feat(rust-api): F13 rust-refresh-token-impl — 新增 POST /auth/refreshToken refresh token 輪替"
# push 等 user 同意
cd ..

# === Stage 2:outer ===
git add specs/028-rust-refresh-token-impl/ CLAUDE.md docs/INTEGRATION-CHECKLIST.md \
        .specify/feature.json rust-api
# 註:brainstorm doc docs/superpowers/028-feature-*.md 已於 6742482 commit、不重複 add
git commit -m "feat(spec): F13 rust-refresh-token-impl — refresh endpoint + spec docs"
# push + merge --no-ff + SHA fill follow-up — 等 user 同意
```

**無 `docker-compose.yml` 改、無 nginx 改、無 DB migration**;base-web + nestjs 兩邊零改動。

---

## 完成標誌

- ✅ rust-api `POST /auth/refreshToken` endpoint(handler + service + 驗證函式 + DTO + public router mount)
- ✅ refresh token 驗證(JWT 簽章 + DB status)→ 完整輪替(新 access + 新 refresh、舊 token 標 used、單一 transaction)
- ✅ 新 access token 身分 claim 於 refresh 時重查 user 重建
- ✅ C-V1~C-V10 acceptance 10/10 PASS
- ✅ 無 migration、無 docker-compose 改、無 nginx 改、base-web + nestjs 零改動
- ✅ 兩段式 commit、解鎖 F14 design-a-to-b-cutover
