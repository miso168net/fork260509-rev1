# Verification Commands: F14 — design-a-to-b-cutover

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

11 個 C-V contract = F14 的 verification scenario(US1/US2/US3 acceptance → C-V mapping + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、**dev stack**。
psql 經 `docker compose exec postgres`(DB `soybean_admin_rust`、user `soybean`)。預設帳號見 CLAUDE.md §5.1。

> F14 cutover 後 `/api/auth/refreshToken` 由 front-nginx 路由到 rust-api;acceptance **經 front-nginx `:11080`** 驗(對比 F13 直連 rust `:11081`)。

---

## C-V1: rust-api image rebuild OK(R3 改 code.rs)

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
```
**Expected**:build exit 0(R3 的 `code.rs` + `sys_user_error.rs` 改動 cargo build 通過)。
**Pass criteria**:cargo build exit 0、image 產出。
**Failure handling**:check `code.rs` 5 個常數語法 / `sys_user_error.rs` 的 `use server_core::web::code;` import。

---

## C-V2: dev stack 起動、不含 nestjs、其餘 service healthy

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC up -d --wait 2>&1 | tail -5
$PC ps --format "table {{.Service}}\t{{.State}}"
```
**Expected**:啟動的 service **不含 nestjs**;postgres / redis / rust-api / base-web / front-nginx 全 healthy、migration exited 0。
**Pass criteria**:stack service 清單無 nestjs、其餘全 healthy。

---

## C-V3: nginx TRANSITIONAL block 已刪、設定有效

**Command**:
```bash
grep -c "TRANSITIONAL" deploy/front-nginx/conf.d/default.conf
grep -c "TRANSITIONAL" deploy/front-nginx/conf.d/default.conf.prod
grep -rn "nestjs" deploy/front-nginx/conf.d/ || echo "(no nestjs ref — OK)"
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec front-nginx nginx -t 2>&1 | tail -2
```
**Expected**:`default.conf` 與 `default.conf.prod` 的 TRANSITIONAL count 皆 **0**;`conf.d/` 無 `nestjs` 字串;`nginx -t` 回 `syntax is ok` + `test is successful`。
**Pass criteria**:3 個 TRANSITIONAL block 已刪、nginx 設定語法有效、無 nestjs 殘留。

---

## C-V4: refresh 經 nginx 路由到 rust(核心)

**Command**:
```bash
# login 經 front-nginx 取 token
LOGIN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login \
  -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}')
echo "$LOGIN" | head -c 200
RT=$(echo "$LOGIN" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
# refresh 經 front-nginx
REFRESH=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/refreshToken \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}")
echo "$REFRESH" | head -c 250
```
**Expected**:`/api/auth/refreshToken` 經 front-nginx → rust-api(非 nestjs),回 HTTP 200 + F4 envelope `{code:0, data:{token, refreshToken}, ...}`、新 `refreshToken` ≠ 登入時的 `$RT`。
**Pass criteria**:refresh 由 rust 處理、回 rust F4 envelope `code:0` + 新 token pair。
**Failure handling**:若回 nestjs envelope(`code:200`)或 404 → check TRANSITIONAL block 是否真的刪乾淨、`location /api/` 是否接手。

---

## C-V5: 完整 login→refresh 循環 + sys_tokens 輪替

**Command**(承 C-V4 — `$RT` 舊、`$REFRESH` 內含新 RT):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
NEW_RT=$(echo "$REFRESH" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT status FROM sys_tokens WHERE refresh_token='$RT';"      # 預期 used
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT status FROM sys_tokens WHERE refresh_token='$NEW_RT';"  # 預期 unused
```
**Expected**:舊 `$RT` row status=`used`、新 `$NEW_RT` row status=`unused`(rust 輪替正確、經 nginx 路徑與 F13 直連結果一致)。
**Pass criteria**:`sys_tokens` 輪替正確。

---

## C-V6: `--profile track-a` 不再帶起 nestjs

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config --services 2>&1 | sort
```
**Expected**:`--profile track-a` 的 service 清單不含 `nestjs`(nestjs service 已移除、`track-a` profile 無成員)。
**Pass criteria**:track-a profile 啟動不帶 nestjs container。

---

## C-V7: R3 — error code 登記進 namespace

**Command**:
```bash
grep -nE "CODE_USER_(NOT_FOUND|WRONG_PASSWORD|AUTHENTICATION_FAILED|USERNAME_ALREADY_EXISTS|INVALID_STATUS)" \
  rust-api/server/core/src/web/code.rs
grep -nE "code::CODE_USER_" rust-api/server/service/src/admin/errors/sys_user_error.rs
grep -nE "=> *1001|=> *1002|=> *1003|=> *1004|=> *1005" \
  rust-api/server/service/src/admin/errors/sys_user_error.rs || echo "(no inline 1xxx literal — OK)"
```
**Expected**:`code.rs` 有 5 個 `CODE_USER_*` 常數;`sys_user_error.rs` 的 `fn code()` 引用 `code::CODE_USER_*`、無殘留 inline `1xxx` literal。
**Pass criteria**:5 個 code 登記進 namespace、`sys_user_error.rs` 引用之、零 inline literal。

---

## C-V8: R4 — secret 範本補齊

**Command**:
```bash
ls deploy/secrets/cleanup_database_url.txt.example
git ls-files deploy/secrets/cleanup_database_url.txt.example
ls deploy/secrets/*.txt.example | wc -l    # 預期 8(原 7 + cleanup_database_url)
```
**Expected**:`cleanup_database_url.txt.example` 存在且 git-tracked;`deploy/secrets/` 共 8 個 `.txt.example`。
**Pass criteria**:每個 secret 都有對應 `.txt.example`。

---

## C-V9: W-FA3 build script 已刪

**Command**:
```bash
ls deploy/build-nestjs.sh 2>&1 || echo "(deleted — OK)"
git ls-files deploy/build-nestjs.sh | wc -l   # 預期 0
```
**Expected**:`deploy/build-nestjs.sh` 不存在、git 不再追蹤。
**Pass criteria**:build script 已刪。

---

## C-V10: 設計文件檔頭狀態註記

**Command**:
```bash
head -3 docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md
echo "---"
head -3 docs/INTEGRATION-DESIGN-B-RUST-ONLY.md
```
**Expected**:DESIGN-A doc 檔頭含「[F14 已封存]」類註記、DESIGN-B doc 檔頭含「[F14 現行設計]」類註記。
**Pass criteria**:兩份設計文件狀態可一眼分辨。

---

## C-V11: 三邊 scope verify(zero-regression)

**Command**:
```bash
echo "base-web diff (預期 0):" && git diff HEAD -- base-web/ | wc -l
echo "nestjs fork diff (預期 0):" && git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "rust-api migration diff (預期 0):" && (cd rust-api && git diff HEAD -- migration/ | wc -l)
echo "rust-api scope (預期 2 檔:code.rs + sys_user_error.rs):" && (cd rust-api && git diff HEAD --stat)
echo "refresh_token_secret 仍在:" && grep -c "refresh_token_secret" docker-compose.yml
echo "Casbin channel 仍在:" && grep -rc "casbin:policy:invalidate" rust-api/server/ | grep -v ':0' | head -1
echo "outer scope:" && git status --short
```
**Expected**:base-web / nestjs fork / `rust-api/migration/` 各 **0 line** diff;rust-api scope = 2 檔(`code.rs` + `sys_user_error.rs`);`refresh_token_secret` 仍在 `docker-compose.yml`(未誤刪);Casbin pub-sub channel 仍在 rust;outer scope = nginx conf×2 + compose×3 + README + build-nestjs.sh(刪)+ cleanup_database_url.txt.example(新增)+ refresh_token_secret.txt.example + CLAUDE.md + 3 份 docs。
**Pass criteria**:base-web/nestjs fork/migration 0 diff;`refresh_token_secret` 與 Casbin channel 未被誤刪;rust-api scope 限 2 檔。

---

## (best-effort)C-V12: base-web CDP SPA silent-refresh smoke

**Command**:CDP 控制 Edge 開 base-web、登入、等 access token 過期觸發 silent refresh(或手動觸發)、確認 refresh 成功、使用者不被登出。
**Expected**:SPA silent refresh 經 front-nginx → rust 成功、工作階段延續。
**Pass criteria**:**best-effort** — Edge debug port 不通則記為 deferred manual-eyeball(比照 F7 C-V10 慣例);非 go/no-go gate(R1 已靜態證明 base-web 吃 rust `code:0`、curl C-V4/C-V5 已覆蓋功能正確性)。

---

## 完成標誌

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild(R3) | build exit 0 |
| C-V2 | dev stack 無 nestjs healthy | service 無 nestjs、其餘 healthy |
| C-V3 | TRANSITIONAL block 已刪 | grep TRANSITIONAL=0、nginx -t OK |
| C-V4 | refresh 經 nginx 走 rust(核心) | rust F4 envelope `code:0` + 新 token pair |
| C-V5 | login→refresh 循環 + 輪替 | sys_tokens 舊 used / 新 unused |
| C-V6 | track-a profile no-op | profile service 清單無 nestjs |
| C-V7 | R3 code namespace 登記 | `code.rs` 5 常數、`sys_user_error.rs` 引用、無 inline literal |
| C-V8 | R4 secret 範本 | `cleanup_database_url.txt.example` 在、git-tracked |
| C-V9 | build-nestjs.sh 已刪 | 檔不存在、git 不追蹤 |
| C-V10 | design doc 檔頭 | DESIGN-A 已封存 / DESIGN-B 現行 註記 |
| C-V11 | 三邊 scope | base-web/nestjs/migration 0 diff、secret/channel 未誤刪 |
| C-V12 | base-web CDP smoke(best-effort) | SPA silent refresh 成功 / 或 deferred |

C-V1~C-V11 全 PASS(+ C-V12 best-effort)= F14 acceptance PASS、ready for 兩段式 commit。
