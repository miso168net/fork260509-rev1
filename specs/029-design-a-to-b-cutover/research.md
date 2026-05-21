# Research: F14 — design-a-to-b-cutover

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-21

F14 brainstorm 已 saturated(3 拍板點 + 途徑 2 選擇)、`/speckit-clarify` 0 question(taxonomy 全 Clear)。Phase 0 由一支 codebase research agent 對 outer repo + rust-api worktree 調查,解 spec 列的 7 個 R-Q。F14 為**設定拔除型** feature — research 確認拔除點的精確位置與「刪除後不破壞其他東西」。

---

## R-Q1: nginx TRANSITIONAL block 位置與刪除安全性

**Question**: 3 個 TRANSITIONAL block 確切行範圍?marker 文字?刪後 `/api/auth/refreshToken` 是否落到 `location /api/`?block 內 directive 有無被其他 config 依賴?

**Evidence**(research agent、2026-05-21):
- `deploy/front-nginx/conf.d/default.conf`:**2 個** block — 80 server 的 `38-48`、443 server 的 `82-92`(各 11 行)。BEGIN marker `    # >>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點(per W-FA2) <<<<<`、END marker `    # <<<<< TRANSITIONAL END >>>>>`。block 內含 `location = /api/auth/refreshToken` + `resolver` + `set $nestjs_upstream` + `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken` + `include proxy_headers.inc`。
- `deploy/front-nginx/conf.d/default.conf.prod`:**1 個** block — 443 server 的 `52-62`(prod 的 80 server 為純 redirect、無 block)。
- 刪後 `/api/auth/refreshToken` 失去 exact-match,落到既有 `location /api/`(`proxy_pass http://rust_api/;` + `include proxy_headers.inc;`)→ `/api/` 前綴 strip → rust `/auth/refreshToken`。
- `default.conf` 的 `resolver` **只**出現在兩個 TRANSITIONAL block 內(line 43、87);`default.conf` 無 http-context resolver、`upstream rust_api` 用 plain `server rust-api:11081`(非 W-F11 的 resolve 模式)→ 刪 block 後不需 resolver。
- `default.conf.prod` 的 http-context `resolver`(line 3)為 W-F11 的 `upstream rust_api ... server rust-api:11081 resolve` 服務、**與 nestjs 無關、必留**;TRANSITIONAL block 內另有冗餘的 server-context resolver(line 57)隨 block 刪除。

**Decision**:F14 以 `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 刪 `default.conf` 2 個 block + `default.conf.prod` 1 個 block。`default.conf` 刪後無 resolver 殘留亦無需 resolver;`default.conf.prod` 的 http-context resolver(line 3)保留。刪後 `nginx -t` 預期通過、`/api/auth/refreshToken` 由 `location /api/` 接手。

**Spec impact**:data-model E1;spec FR-001/002/003/005、R-Q6 對齊。

---

## R-Q2: docker-compose nestjs service 邊界與 secret 引用

**Question**: 3 個 compose 檔的 nestjs service block 邊界?`track-a` profile 有無其他成員?`refresh_token_secret` 被誰引用?

**Evidence**(research agent):
- `docker-compose.yml`:`nestjs:` service block `240-291`;`profiles: ["track-a"]`(line 242)— **track-a profile 唯 nestjs 用**(`acme` 用 `["prod"]`、`cleanup` 用 `["jobs"]`)→ 移除 nestjs 後 `track-a` profile 自然消失。
- `docker-compose.dev.yml`:nestjs stanza `28-30`(加 `ports: ["127.0.0.1:11082:9528"]`)。
- `docker-compose.prod.yml`:nestjs stanza `21-23`(加 `restart: always`)。
- `refresh_token_secret`:`rust-api` service 引用(line 118 `APP_JWT_REFRESH_SECRET_FILE` + line 123 `secrets:` ref)**必留**;`nestjs` service 也引用(line 248 entrypoint `RTS=$$(cat ...)` + line 268 `secrets:` ref)**移除此引用**;top-level `secrets:` 條目(line 311-312)**必留**。
- `docker-compose.yml` 檔頭註解(line 4)「5 service stack」已 stale(實際 9 service;F14 後 8)。`dev.yml` 檔頭 line 3/5、`prod.yml` 檔頭 line 3 含 track-a 字樣。
- `deploy/secrets/refresh_token_secret.txt.example` 首行註解寫「for nestjs」— 宜改指 rust-api `APP_JWT_REFRESH_SECRET_FILE`。

**Decision**:F14 移除 3 個 compose 檔的 nestjs service block / stanza;保留 `refresh_token_secret` top-level secret 條目與 rust-api 的引用,僅移除 nestjs 的引用。修正 3 個 compose 檔頭過時註解(service 數、track-a 字樣)。更新 `refresh_token_secret.txt.example` 註解。`track-a` profile 隨 nestjs 移除自然失效。

**Spec impact**:data-model E2;spec FR-006/007/008/009/010/011 對齊。

---

## R-Q3: 1xxx error code 現況與 code.rs namespace 結構

**Question**: 5 個 `1xxx` 在 `sys_user_error.rs` 怎麼定義?`code.rs` namespace 表結構與命名慣例?其他 error 怎麼引用 code.rs?

**Evidence**(research agent):
- `rust-api/server/service/src/admin/errors/sys_user_error.rs`:`UserError` enum 5 變體;`impl ApiError for UserError` 的 `fn code(&self) -> u16` 內以 **inline integer literal** match(`UserNotFound => 1001` … `InvalidUserStatus => 1005`)— **不引用 `code.rs`**。
- `rust-api/server/core/src/web/code.rs`:F4 namespace 表;命名慣例 `pub const CODE_<group>_<semantic>: u16 = <value>;`(SCREAMING_SNAKE);既有 group 值域 `0 / 3333 / 4001-4003 / 5001-5004 / 6001-6004 / 7777-7778 / 8888-8889 / 9001-9005 / 9998-9999` — **`1xxx` 不與任何既有常數衝突**。
- 引用 pattern:core 層 error(`error.rs` / `api_key_middleware.rs` / `auth.rs`)以 `use crate::web::code;` + `code::CODE_*`;service 層 error 檔(`sys_user_error.rs` / `sys_role_error.rs` / `sys_domain_error.rs` / `sys_menu_error.rs`)**全用 inline literal**、無一引用 `code.rs`。

**Decision**:R3 = ① `code.rs` 新增 5 個 `pub const CODE_USER_*: u16`(`CODE_USER_NOT_FOUND=1001` / `CODE_USER_WRONG_PASSWORD=1002` / `CODE_USER_AUTHENTICATION_FAILED=1003` / `CODE_USER_USERNAME_ALREADY_EXISTS=1004` / `CODE_USER_INVALID_STATUS=1005`;確切命名 implement 時對齊既有 `CODE_*` 慣例微調)② `sys_user_error.rs` 加 `use server_core::web::code;`、`fn code()` 的 5 個 inline literal 改引用常數。**數值不變、行為零改變**(per FR-015)。

> **R3 範疇邊界**:其他 service error 檔(`sys_role_error.rs` 等)同樣用 inline literal,但 R3 per spec FR-013/014/025 **僅限 `sys_user_error.rs` 的 5 個 `1xxx`** — 不擴及其他 error 檔(那屬獨立 code-hygiene、非 F14 範疇)。

**Spec impact**:data-model E4;spec FR-013/014/015/025 對齊。

---

## R-Q4: CLAUDE.md nestjs 引用點

**Question**: §5.2 / §5.2.1 內 nestjs / track-a / `:11082` / `build-nestjs` 引用點?

**Evidence**(research agent):`CLAUDE.md` 內引用點 — line 122(§5.2 port 表 nestjs 列)、line 126(§5.2「目前現況」3 種模式 + DESIGN-A track-a 變體描述)、line 128(dev DESIGN-A 模式說明)、line 165-184(§5.2.1 整段「DESIGN-A 路線 dev」啟動命令 + `build-nestjs.sh` + `--profile track-a` + nestjs refreshToken 驗命令)。

**Decision**:F14 清理 §5.2 — 移除 port 表 nestjs `:11082` 列、「目前現況」描述移除 DESIGN-A track-a 變體;§5.2.1 — 移除整段「DESIGN-A 路線 dev」(line 165-184 區域)的 `--profile track-a` 啟動變體、`build-nestjs.sh`、nestjs refreshToken 驗命令,使 §5.2.1 只餘 dev / prod baseline / prod+acme 三模式。

**Spec impact**:spec FR-017 對齊。

---

## R-Q5: front-nginx README nestjs 引用

**Question**: `deploy/front-nginx/README.md` 內 nestjs / TRANSITIONAL 引用範圍?

**Evidence**(research agent):`deploy/front-nginx/README.md` **僅 line 86 一處**引用 — 在 `## 範疇邊界` section:「**Track DESIGN-A nestjs upstream / `track-a.inc` / TRANSITIONAL block**:留 W-FA1」。README 結構表(line 9-14)只列 `default.conf`、不需改(F14 後檔案結構不變、只是 block 內容變)。

**Decision**:F14 移除 README line 86 該 boundary note(或改為「TRANSITIONAL block 已於 F14 移除」的歷史註記)。

**Spec impact**:spec FR-004 對齊。

---

## R-Q6: cutover 後 nginx 啟動行為

**Question**: 刪 TRANSITIONAL block 後 nginx 能否 `nginx -t` 通過、正常啟動?

**Evidence**(research agent):
- `default.conf`:`resolver` 只在被刪的 block 內 → 刪後零 resolver、零 `$nestjs_upstream` / `nestjs:9528` 殘留;`upstream rust_api` 用 plain server directive、不需 resolver。`nginx -t` 預期通過。
- `default.conf.prod`:http-context resolver(line 3)保留(W-F11 `resolve` 需要);TRANSITIONAL block(52-62)內冗餘 server-context resolver 隨刪。刪後無 nestjs 殘留。`nginx -t` 預期通過。

**Decision**:刪 block 後不需任何補償性 directive 改動;acceptance 以 `nginx -t` + `grep -c TRANSITIONAL`(預期 0)+ `grep nestjs`(預期 0)驗。

**Spec impact**:spec FR-005、E-1 對齊。

---

## R-Q7: DESIGN-A / DESIGN-B doc 檔頭結構

**Question**: 兩份設計文件檔頭結構,如何加註「已被取代」/「現行設計」?

**Evidence**(research agent):
- `INTEGRATION-DESIGN-A-RUST-NESTJS.md`:line 1 為 `# DESIGN-A：rust + nestjs 三方協作整合（過渡至 DESIGN-B）`,line 2+ 為 `>` blockquote metadata(日期 / 範圍 / 資料來源 / 性質 / 兩條軌道)。
- `INTEGRATION-DESIGN-B-RUST-ONLY.md`:line 1 為 `# DESIGN-B：rust-only 整合（DESIGN-A 的最終遷移形態）`,line 2+ 同為 `>` blockquote metadata。

**Decision**:F14 在兩份檔頭 line 1 之後插入一行 `>` blockquote 狀態註記 — DESIGN-A 加「**[F14 已封存]** DESIGN-A 過渡期結束(F14 cutover 完成);此文件保留為歷史參考,現行架構見 DESIGN-B」;DESIGN-B 加「**[F14 現行設計]** DESIGN-A cutover 完成(F14);本檔為 rev1 現行架構、nestjs 已完全退場」。

**Spec impact**:spec FR-018/019 對齊。

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 — 3 個 TRANSITIONAL block 行範圍確定(`default.conf` 38-48/82-92、`default.conf.prod` 52-62)、`sed` range-delete 安全、刪後落 `location /api/`
- ✅ R-Q2 — nestjs service block 邊界確定(3 檔)、`track-a` profile 唯 nestjs、`refresh_token_secret` 必留(rust-api 用)
- ✅ R-Q3 — `sys_user_error.rs` 5 個 inline literal、`code.rs` namespace 結構與命名慣例確定、R3 為 additive 零行為改變
- ✅ R-Q4 — CLAUDE.md §5.2/§5.2.1 nestjs 引用點清單
- ✅ R-Q5 — front-nginx README 僅 line 86 一處
- ✅ R-Q6 — 刪 block 後 nginx -t 預期通過、無補償改動
- ✅ R-Q7 — 兩份 design doc 檔頭結構、狀態註記插入位置確定
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — F14 brainstorm 已 saturated;Phase 0 為拔除點精確定位,所有 R-Q 在既有 codebase 找到明確答案。研究確認的關鍵 gotcha:`refresh_token_secret` 必留(rust-api `APP_JWT_REFRESH_SECRET_FILE` 用)、`default.conf.prod` http-context resolver 必留(W-F11 用)、R3 嚴格限 `sys_user_error.rs` 5 個 `1xxx`。
