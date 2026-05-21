# Quickstart: F14 — design-a-to-b-cutover

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

F14 落地操作摘要 — 給 implement 階段參考。詳細任務拆解見 `/speckit-tasks` 產出的 `tasks.md`。

> ⚠️ F14 屬 DESIGN-A §6.1 Phase 5(P5)、有 time gate(F10 在 DESIGN-A 形態運行 N 週驗證);本 plan 為設計先行,實際 implement 時機由 time gate 決定。

---

## 1. Stage 1 — rust-api worktree(R3)

`rust-api/` 內 2 檔改(無新 crate、無 migration):

```text
rust-api/server/core/src/web/code.rs                       # 加 5 個 CODE_USER_* 常數
rust-api/server/service/src/admin/errors/sys_user_error.rs # fn code() 改引用常數
```

`code.rs` 加(命名對齊既有 `CODE_*` 慣例):`CODE_USER_NOT_FOUND=1001` / `CODE_USER_WRONG_PASSWORD=1002` / `CODE_USER_AUTHENTICATION_FAILED=1003` / `CODE_USER_USERNAME_ALREADY_EXISTS=1004` / `CODE_USER_INVALID_STATUS=1005`。`sys_user_error.rs` 加 `use server_core::web::code;`、`fn code()` 的 5 個 inline `1xxx` literal 改引用常數。**數值不變、零行為改變**。

## 2. Stage 2 — outer repo 拔除

```bash
# nginx TRANSITIONAL block ×3(machine-deletable marker)
sed -i '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' \
  deploy/front-nginx/conf.d/default.conf deploy/front-nginx/conf.d/default.conf.prod

# docker-compose nestjs service(docker-compose.yml service block / dev.yml / prod.yml stanza)
#   — 手動編輯移除 nestjs block;保留 refresh_token_secret top-level secret + rust-api 引用
#   — 修 3 個檔頭過時註解(service 數 / track-a 字樣)

# W-FA3 build script
rm deploy/build-nestjs.sh

# R4 secret 範本
#   — 新增 deploy/secrets/cleanup_database_url.txt.example(單行 placeholder)
#   — deploy/secrets/refresh_token_secret.txt.example 首行註解「for nestjs」改指 rust-api

# doc 收尾
#   — CLAUDE.md §5.2/§5.2.1 移除 nestjs/track-a/build-nestjs
#   — deploy/front-nginx/README.md 移除 line 86 nestjs boundary note
#   — docs/INTEGRATION-DESIGN-A 檔頭加「[F14 已封存]」、DESIGN-B 檔頭加「[F14 現行設計]」
#   — docs/INTEGRATION-CHECKLIST.md F14 row + Current Focus + 里程碑 + R3/R4 勾掉
```

**不動**:`refresh_token_secret` secret 條目本身、Casbin redis pub-sub channel、rust refresh endpoint、`base-web/`、DB/migration、`fork260509-soybean-admin-nestjs/` 源碼目錄。

## 3. Build + 驗證

```bash
# rebuild rust-api image(R3 改 code.rs)
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/

# 起 dev stack(無 nestjs、不帶 --profile track-a)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# refresh 驗證(經 front-nginx :11080 — F14 後 routing 指 rust)
LOGIN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login \
  -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}')
RT=$(echo "$LOGIN" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
curl -fsS -X POST http://127.0.0.1:11080/api/auth/refreshToken \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}"
# 預期:回 rust F4 envelope {code:0, data:{token, refreshToken}}
```

## 4. Acceptance

依 `contracts/verification-commands.md` C-V1~C-V11 逐項驗(+ C-V12 base-web CDP smoke best-effort):image rebuild / dev stack 無 nestjs / nginx -t + grep TRANSITIONAL=0 / refresh 經 nginx 走 rust / 輪替 / track-a no-op / R3 namespace / R4 範本 / build-nestjs.sh 已刪 / design doc 檔頭 / 三邊 scope。

## 5. 兩段式 commit(per CLAUDE.md §6.1)

```bash
# === Stage 1:rust-api worktree(R3)===
cd rust-api
git add server/core/src/web/code.rs server/service/src/admin/errors/sys_user_error.rs
git commit -m "refactor(rust-api): F14 R3 — 5 個 1xxx error code 登記進 code.rs F4 namespace"
# push 等 user 同意
cd ..

# === Stage 2:outer ===
git add deploy/ docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml \
        CLAUDE.md docs/ specs/029-design-a-to-b-cutover/ .specify/feature.json rust-api
git commit -m "feat(spec): F14 design-a-to-b-cutover — nestjs 退場 + spec docs"
# push + merge --no-ff + SHA fill follow-up — 等 user 同意
```

> outer commit 訊息帶 rust-api 短 SHA + fork 提交主旨;`deploy/build-nestjs.sh` 的刪除由 `git add deploy/` 帶入。

---

## 完成標誌

- ✅ nginx 3 個 TRANSITIONAL block 刪除、`/api/auth/refreshToken` 經 nginx 路由到 rust
- ✅ docker-compose nestjs service 從 3 檔移除、`track-a` profile 失效
- ✅ `deploy/build-nestjs.sh` 刪除
- ✅ R3:5 個 `1xxx` error code 登記進 `code.rs` F4 namespace、零行為改變
- ✅ R4:`cleanup_database_url.txt.example` 補齊
- ✅ doc 收尾:CLAUDE.md / README / DESIGN-A(已封存)/ DESIGN-B(現行)/ CHECKLIST
- ✅ `refresh_token_secret` secret 與 Casbin pub-sub channel 保留、base-web + nestjs fork 零改動
- ✅ C-V1~C-V11 acceptance PASS、兩段式 commit
- ✅ **DESIGN-A §6.1 全 14 個 application feature(F1–F14)收尾、DESIGN-B(rust-only)形態正式生效**
