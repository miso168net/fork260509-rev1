# F13 — rust-refresh-token-impl

**Date**: 2026-05-21
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-21(3 拍板點;F12 收尾 DESIGN-A 本體 F1–F12 後,啟動 DESIGN-A §6.1 Phase 5(P5)第一個 feature — DESIGN-A→DESIGN-B 遷移的 F13)

> ⚠️ **Time gate**:F13 屬 DESIGN-A §6.1 Phase 5(P5),依 §6.2 拍板原則「過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」後才應 implement。本 brainstorm 為**設計先行**(design ahead of gate);`/speckit-specify`→`implement` 的實際落地時機由 time gate 決定。

---

## Scope summary

F13 = **rust 補實作 refresh token rotation** — 在 rust-api 內實作 `POST /auth/refreshToken`,使 rust 自身能處理 refresh token 的驗證與輪替,為 F14 cutover(把 nginx routing 從 nestjs 改指 rust)做準備。

F10 `refresh-token-nestjs-bridge` 把 refreshToken 端點交給 nestjs 補位(nginx W-FA2 TRANSITIONAL block 路由 `/api/auth/refreshToken` → nestjs);F10.1 讓 rust 登入時已能簽發 JWT refresh token、F10.2 對齊 `TokenStatus` 字串值。但 rust 至今**沒有**消費 / 驗證 / 輪替 refresh token 的端點。F13 補上這塊 —— rust endpoint 與 nestjs endpoint **共存**,F13 階段用直連 rust port 驗證 rust 端正確;nginx routing 切換留 F14。

| 面向 | 內容 |
|---|---|
| **交付** | rust-api 新增 `POST /auth/refreshToken` endpoint(handler + service method + public router mount) |
| **行為** | 驗 refresh token(JWT 簽章 + DB 狀態)→ 完整輪替(核發新 access + 新 refresh、舊 token 標 `used`)→ 回 `{token, refreshToken}` |
| **紀錄** | `sys_tokens`:新增一筆新 token pair row(status `unused`)+ 舊 row status 改 `used`,單一 transaction;**不額外寫** `sys_operation_log` / `sys_login_log` |
| **新 token 身分** | refresh 時依 user_id 重查 user 當下 role/domain/org,比照 login 重建 access-token `Claims` |
| **routing** | nginx 不動(`/api/auth/refreshToken` 仍 → nestjs);F13 端點以直連 rust port 驗證(`共存運行驗證`)。nginx 切換是 F14 |

範疇刻意收緊到「**rust refresh endpoint + 輪替 + curl/psql acceptance**」、**不改 base-web / 不改 nestjs / 不動 nginx / 不做 logout/revocation / 無 migration**。

**Commit 模式**(F13 固定):
- **兩段式** commit(per CLAUDE.md §4.1):rust-api worktree 1 commit(handler + service + router + jwt + input DTO)+ outer 1 commit(spec docs + `CLAUDE.md` SPECKIT marker + `INTEGRATION-CHECKLIST.md`)+ merge `--no-ff` + SHA fill follow-up。
- **無 docker-compose.yml 改、無 nginx 改、無 DB migration**(`sys_tokens` schema F10 已建)— outer 端為純 spec-docs,類似 F7.2 / F10。

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §6.1 — F13 `rust-refresh-token-impl`:「rust 補實作 refresh token rotation(取代 nestjs `/auth/refreshToken`);繼承 F10 的 `sys_tokens` schema 與 redis pub-sub」;依賴「F10」、Phase 5(P5)
  - §6.2 — 拍板原則:「P5 在 P1-P4 全部穩定 + spec-kit feature 完成後才啟動;過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」— **F13 的 time gate**
  - §3.3 / §5.1.3 — `sys_tokens` 表共識:rust 主導 migration 預建 schema,DESIGN-A→DESIGN-B 時「rust 直接接手寫、不需 schema 變動」;`sys_tokens` 表作 revocation list / rotation chain
  - §1.5 / §5.2.1 — 資料變動原則:業務變動 + audit **同一 DB transaction**(F13 的「新 row INSERT + 舊 row UPDATE」同 txn)
  - §2.2 — 端點責任歸屬:`/api/auth/refreshToken` 為 **Transitional**(DESIGN-A → DESIGN-B 改 rust);§6.1 line 170「rust 補齊後 nginx 改路由、刪 TRANSITIONAL block」= F14
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle III「嚴版禁 Forward + 單一職責」— F13 的 rust endpoint 只直連 postgres,不呼叫 nestjs / 不做服務間 forward
  - Principle V「漸進收縮」— F13 是 DESIGN-A→DESIGN-B 收縮的關鍵一步;rust 接手 refresh 後 DESIGN-B 形態原樣沿用
  - Principle IV「base 不改動邊界」— F13 純後端、base-web 0 diff
- 直接前置 feature:
  - F10 `refresh-token-nestjs-bridge`(merge `8f0e84c`)— `sys_tokens` schema、nginx TRANSITIONAL block、nestjs 補位 baseline
  - F10.1 `rust-jwt-refresh-token-signing`(merge `48b70e6`)— rust 登入已簽發 JWT refresh token、`RefreshClaims`、`REFRESH_KEYS`
  - F10.2 `rust-tokenstatus-string-align`(merge `851ec79`)— `TokenStatus` enum 字串值對齊 nestjs(`unused`/`used`)
- F12 baseline(剛 merge):outer merge `86e56e5` + SHA fill `2fda07f` + Current Focus 釐清 `d35f743`、rust-api `30c8dd4`(F13 從 `rev1-admin-root` 衍生)
- F8 / W-F11 / F12 implement-time pattern「兩段式 commit、curl + psql + docker exec acceptance、無 e2e framework」— F13 沿用

---

## 既有現況(brainstorm 階段 codebase explore 確認、2026-05-21)

**rust-api refresh-token 現況**:

| 元件 | 狀態 / 位置 |
|---|---|
| `/auth/refreshToken` endpoint | **不存在** — `server/router/src/admin/sys_authentication_route.rs:13` 只 mount `/login`;protected router 有 stub handler 但無 refresh 端點。**這是 F13 的核心缺口** |
| 登入核發 token | `/auth/login`(`pwd_login`)已核發 **access + refresh 雙 token** — `server/service/src/admin/sys_auth_service.rs:335-360`(`generate_auth_output`),回 `AuthOutput { token, refresh_token }` |
| refresh token 簽發(F10.1) | `server/core/src/web/jwt.rs:121-151`;`RefreshClaims`(jwt.rs:14-54)欄位 `sub`(user_id)/`exp`/`iat`/`nbf`/`jti`/`iss` — **minimal、不帶 role/domain/org**;簽章用 `global::REFRESH_KEYS`(env `APP_JWT_REFRESH_SECRET`,缺則 fallback `APP_JWT_JWT_SECRET`);expiry `JwtConfig.refresh_expire` 預設 7200s;HS256 |
| refresh token **驗證** | **不存在** — jwt.rs 只有 access token 的 `validate_token`(jwt.rs:153-169);無 `validate_refresh_token` |
| refresh token **輪替 / 消費** | **不存在** — 無查 `sys_tokens`、無標記 used、無換新 token 的邏輯 |
| `TokenStatus` enum(F10.2) | `server/constant/src/definition/consts.rs:6-25`:`Active`→`"unused"` / `Refreshed`→`"used"` / `Revoked`→`"revoked"`;`is_valid()` / `can_refresh()` 僅 `Active` 為 true |

**`sys_tokens` 表**:

| 項目 | 內容 |
|---|---|
| schema | migration `m20241023_091204_create_sys_tokens.rs`(F10 baseline);欄位 `id`(PK)/ `access_token` / `refresh_token` / `status` / `user_id` / `username` / `domain` / `login_time` / `ip` / `port` / `address` / `user_agent` / `request_id` / `type` / `created_at` / `created_by` — **無 `role` / `org` 欄** |
| entity | `server/model/src/admin/entities/sys_tokens.rs` |
| 現有寫入 | 僅 1 處 INSERT:`server/service/src/admin/events/access_token_event.rs:23-49`(`AccessTokenEvent::handle`,登入時跑、status `Active`、用無-transaction 的 `.insert(db)`);**無任何 SELECT / UPDATE by refresh_token** |
| 登入的其他紀錄 | login 另寫 `sys_login_log`(`LoginLogEvent`);login **不寫** `sys_operation_log`(統一審計表) |

**nestjs `/auth/refreshToken`(F13 要複製的目標行為)**:`authentication.controller.ts:58-83` + `authentication.service.ts:38-81` — ① 依 `refreshToken` 查 DB token row(查無 → 404 `NotFoundException`)② `jwtService.verifyAsync` 驗 refresh JWT ③ 檢查 status 必為 `unused`(否則 error「Token has already been used」)④ 舊 token 標 `used` ⑤ 核發新 access + 新 refresh ⑥ 寫新 token row ⑦ 回 `{token, refreshToken}`。nestjs `TokenStatus` 只有 2 態(`unused`/`used`)。

**nginx routing(W-FA2)**:`deploy/front-nginx/conf.d/default.conf`(HTTP block 行 38-48、HTTPS block 行 82-92)+ `.prod` — `location = /api/auth/refreshToken` 用 variable proxy_pass + resolver 路由到 `nestjs:9528/v1/auth/refreshToken`,包在 `>>>>> TRANSITIONAL BEGIN/END <<<<<` marker 內。**F13 不動此 block**;F14 cutover 才刪整段 + 改指 rust。

**redis pub-sub**:目前只有 Casbin 的 `casbin:policy:invalidate` channel(W-F11);**無** token revocation/invalidation 專用 channel。F13 的 token 輪替靠 `sys_tokens` 表(DB = 唯一事實源),不需新 pub-sub。

**`AuditOperation` enum**:`server/core/src/web/audit.rs` — `Insert` / `Update` / `SoftDelete` / `Restore` / `HardDelete`,**無** refresh / token 相關變體。

---

## Clarifications(brainstorm 2026-05-21、3 拍板點)

- **Q1 (brainstorm)**: 一個有效 refresh token 被用掉時,rust 怎麼處理?→ **A:完整輪替、舊 token 標 `used`**。核發新 access + 新 refresh token;舊 refresh token 的 `sys_tokens` row status 改為 `Refreshed`(`"used"`)、一次性用畢、不能再 refresh。理由:DESIGN-A 目標是 rust **完全複製** nestjs 行為,使 F14 cutover 無縫;nestjs 實際把舊 token 標 `"used"`(非 DESIGN-A §3.3 文字所寫的 `"revoked"`),且 rust `TokenStatus::Refreshed→"used"` 變體正是 F10.2 為此對齊而存在。對比「只換 access token、refresh token 重複用到過期」(與 nestjs 行為不一致、cutover 有行為差)。
  > 註:DESIGN-A §3.3 文字寫「舊 token 標 revoked」,與 nestjs 實作的 `"used"` 不一致 — 本 feature 以對齊 nestjs 實際行為為準(cutover 無縫優先);`"revoked"` 保留給未來主動 revocation。

- **Q2 (brainstorm)**: refresh 動作除了 `sys_tokens`(新 row + 舊 row→used),要不要額外寫 log 表?→ **A:不額外寫、`sys_tokens` 即紀錄**。`sys_tokens` 的新 row(含 `login_time` / `created_at` 時間戳)+ 舊 row 標 `"used"` 本身就是 refresh 的完整 rotation-chain 紀錄。不寫 `sys_operation_log`、不寫 `sys_login_log`。理由:對齊 rust 現況 — rust login 自己也只寫 `sys_tokens`(+ `sys_login_log`)、**不寫** `sys_operation_log`;若 refresh 寫 `sys_operation_log` 會比 login 還多審計、且需新增 `AuditOperation` 變體。`sys_operation_log` 的定位是 admin CRUD 寫路徑審計(F2.1/F12),token 流不屬之。

- **Q3 (brainstorm)**: refresh 核發的新 access token,其 role/domain/org 身分 claim 怎麼來?→ **A:refresh 時重查 user 當下狀態**。依 refresh token 的 `sub`(user_id)/ `sys_tokens` row 的 user_id 重查 user 當下的 role/domain/org,比照 login 重建 access-token `Claims`。理由:refresh token 本身只帶 `sub`、`sys_tokens` 表也無 `role`/`org` 欄,新 access token 的身分資料無從沿用;重查使新 token 反映 user 最新狀態(role 被改/移除會在下次 refresh 生效)、與 login 一致、安全。對比「不重查、role 留空」(新 token 缺 Casbin enforce 所需 role、功能風險)。

---

## 設計(Approach A — 最小化、複用 login 既有 building block)

### 1. 架構與元件

rust-api worktree 改動(無新 crate、無 migration):

| 檔案 | 改動 |
|---|---|
| `server/model/src/admin/input/sys_authentication.rs` | 加 `RefreshTokenInput` DTO(`refreshToken` 欄、camelCase)+ `input/mod.rs` re-export |
| `server/core/src/web/jwt.rs` | 加 `validate_refresh_token` — 驗 refresh JWT 簽章(`REFRESH_KEYS`)+ `exp`/`nbf`,回 `RefreshClaims`(現只有 `generate_refresh_token`、無對應驗證函式) |
| `server/service/src/admin/sys_auth_service.rs` | 加 `refresh_token` service method — verify→re-query→issue→rotate 主邏輯 |
| `server/api/src/admin/sys_authentication_api.rs` | 加 `refresh_token` handler |
| `server/router/src/admin/sys_authentication_route.rs` | mount `POST /auth/refreshToken` 在 **public router**(與 `/login` 同層、不經 JWT middleware、不經 Casbin) |

**複用**:`JwtUtils::generate_token`(新 access)/ `generate_refresh_token`(新 refresh);login 既有「重查 user → 組 `Claims`」邏輯(若 login 內聯則抽共用 helper、見 R-Q1);`sys_tokens` entity。**輸出 DTO 重用 login 的 `AuthOutput`**(`{token, refreshToken}`)。

### 2. Data flow

`POST /auth/refreshToken` body `{ refreshToken }`:

```
1. JWT 驗證    validate_refresh_token(refreshToken) — 簽章(REFRESH_KEYS)+ exp/nbf
                  └ 失敗 → reject
2. DB 查找     SELECT sys_tokens WHERE refresh_token = <presented>
                  └ 查無 → reject
3. 狀態檢查    row.status 必為 Active("unused")
                  └ "used" / "revoked" → reject(已用 / 已撤銷)
4. 重查 user   依 user_id 查當下 role/domain/org/username + 確認 user 未軟刪
                  └ 不存在 / 已軟刪 → reject
                  └ 組新 access-token Claims(同 login)
5. 簽發        JwtUtils::generate_token(&claims) → 新 access
               JwtUtils::generate_refresh_token(user_id) → 新 refresh
6. 輪替        txn = db.begin()
                 UPDATE 舊 sys_tokens row: status → Refreshed("used")
                 INSERT 新 sys_tokens row: 新 token pair、status Active、
                   user_id/username/domain、login_time=now、ip/user_agent
                   等取自 refresh request
               txn.commit()           ← 新 row + 舊 row 同一 transaction
7. 回應        F4 envelope success + AuthOutput { token, refreshToken }
```

步驟 6 的單一 transaction 滿足 Constitution II / DESIGN-A §1.5「業務變動原子」。新 row 的 context 欄位(`ip` / `address` / `user_agent` / `port` / `type` / `request_id`)取法見 R-Q3。

### 3. Error handling

全部錯誤走 F4 envelope(HTTP 200 + body business code,沿用既有 auth-failure error code 慣例;exact code 留 `/speckit-plan` Phase 0、見 R-Q5):

| 場景 | 行為 |
|---|---|
| body 缺 `refreshToken` / 格式錯 | HTTP 400(axum DTO deserialize,同既有 DTO 行為) |
| refresh JWT 簽章無效 / 過期 | reject、F4 envelope auth-failure code |
| `refresh_token` 查無 `sys_tokens` row | reject(nestjs 回 404;rust F4 → envelope code) |
| row.status 非 `unused`(已 used / revoked) | reject(refresh token 已用) |
| user 已軟刪 / 不存在 | reject |
| 輪替 transaction 失敗 | rollback、回 error |

任何 reject:**不簽發 token、不動 `sys_tokens`**。對 client **不細分** not-found vs used(避免洩漏 token 存在性)— 一律回 auth-failure 類 envelope;log 端可細分以利排查。

### 4. 測試 / 驗收

- **單元測試**:F13 主邏輯為 JWT crypto + DB IO,純函式可測面小;若 `validate_refresh_token` 有可獨立的純解析/判斷面則補 `#[cfg(test)]`,否則比照 F8 wiring feature 以 acceptance 為主。
- **acceptance = curl + psql + `docker compose exec`**(沿用 F8 / W-F11 / F12 慣例、不新建 deploy script、不引入 e2e framework)。
- C-V 草案(實際 C-V 編號與命令於 `/speckit-plan` contracts 定):
  - image rebuild OK(含新 refresh endpoint)
  - `/auth/login` 取得 refresh token(直連 rust `:11081`)
  - `POST /auth/refreshToken`(**直連 rust `:11081`** — nginx 仍路由到 nestjs、F14 才切)→ 驗回新 access + 新 refresh token
  - psql:舊 `sys_tokens` row status → `"used"`、新 row 已 INSERT(status `"unused"`)
  - 用**新 access token** 打 protected endpoint → 通(驗 Claims/role 正確、重查生效)
  - **舊 refresh token 重用** → 被拒(一次性用畢)
  - 無效 / 過期 / 亂填 refresh token → 被拒
  - 軟刪 user 的 refresh token → 被拒
  - coexistence:nginx `/api/auth/refreshToken` 仍 → nestjs(0 改動)、rust 端點以直連驗證
  - 三邊 scope:base-web src 0 diff + nestjs fork 0 diff;無 migration、無 docker-compose / nginx 改動

---

## Research-time 確認項(交 `/speckit-plan` Phase 0)

- **R-Q1**:login 的「重查 user → 組 access-token `Claims`」邏輯目前在 `sys_auth_service.rs`(`pwd_login` / `generate_auth_output` 周邊)的確切位置與形態 — 是否內聯、能否抽成共用 helper 給 `refresh_token` method 重用,還是 refresh 自行重查。
- **R-Q2**:`validate_refresh_token` 實作 — jwt.rs 既有 access token `validate_token` 的 pattern(`Validation` 設定、audience 處理、issuer 驗證)能否套用到 refresh token;`RefreshClaims` 無 `aud` 欄,Validation 需如何調整;用 `REFRESH_KEYS` decoding key。
- **R-Q3**:refresh 時新 `sys_tokens` row 的 context 欄位(`ip` / `address` / `user_agent` / `port` / `type` / `request_id`)取法 — login handler 怎麼從 request 取這些(ip2region geo lookup?);refresh handler 能否同樣取,或 `address` 等從舊 row 複製;`type` 欄填什麼(沿用舊 row vs 標 refresh)。
- **R-Q4**:`sys_tokens` 輪替的 sea-orm 寫法 — 舊 row 的 `status` UPDATE(`ActiveModel` / `update_many`)與新 row INSERT 包進同一 `DatabaseTransaction` 的具體寫法;既有 `AccessTokenEvent` 用無-txn `.insert(db)`,F13 需 txn 版(可能不直接重用 `AccessTokenEvent`)。
- **R-Q5**:F4 envelope error code — login / auth 失敗目前用哪些既有 business code(refresh 失敗沿用、不新增);DTO deserialize 失敗的 HTTP 400 既有行為確認。
- **R-Q6**:`/auth/refreshToken` 在 public router 的 mount — `sys_authentication_route.rs` 的 public(未保護)router 結構(`/login` 所在層),確認 refresh endpoint 不經 JWT middleware、不經 Casbin enforce。
- **R-Q7**:user soft-delete 檢查 — JWT middleware 既有的 user 軟刪檢查(FR-028、查 `sys_user`)邏輯能否在 refresh path 重用,或 refresh 自行查 `sys_user` active 狀態。

---

## 範疇外

- ❌ 不動 nginx routing — `/api/auth/refreshToken` 仍 → nestjs;routing 切換 + 刪 TRANSITIONAL block 是 **F14**
- ❌ 不拔 nestjs container、不改 docker-compose — F14 範疇
- ❌ logout / 主動 token revocation endpoint — 非 DESIGN-A F13/F14 範疇、YAGNI
- ❌ 無 DB migration、不改 `sys_tokens` schema(F10 已建、§3.3「rust 直接接手寫、不需 schema 變動」)
- ❌ 不新增 `AuditOperation` 變體、不寫 `sys_operation_log`(per Q2)
- ❌ 不引入 token revocation 的 redis pub-sub(`sys_tokens` 表即事實源)
- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV)
- ❌ 不動 `fork260509-soybean-admin-nestjs/`;F13 為純 rust-api 後端改動
- ❌ 不改 `/auth/login` 既有 token issuance 路徑(Approach A 不重構 login;只新增 refresh path)
- ❌ per-user 並行 session 上限 / session 管理策略 — F13 只輪替當下呈遞的 token

---

## DESIGN-A → DESIGN-B 一致性

F13 是 DESIGN-A→DESIGN-B 收縮的關鍵一步:rust 接手 refresh token 處理後,DESIGN-B(rust-only)形態下此 endpoint **原樣沿用、零改動**;F14 拔掉 nestjs + 改 nginx routing 後,rust 的 `/auth/refreshToken` 即正式生效。F13 endpoint 不依賴 nestjs、只直連 postgres — 通過「nestjs 退場時順嗎」濾鏡。

---

## Naming / 編號

- Brainstorm doc:`docs/superpowers/028-feature-rust-refresh-token-impl.md`(本檔)
- Spec 目錄:`specs/028-rust-refresh-token-impl/`(`/speckit-specify` 產生)
- Feature branch:`028-rust-refresh-token-impl`(`before_specify` pre-hook 產生)
- 新 endpoint:`POST /auth/refreshToken`(rust-api、public router)
- 新 DTO:`RefreshTokenInput`(`server/model/src/admin/input/sys_authentication.rs`)
- 新函式:`validate_refresh_token`(`server/core/src/web/jwt.rs`)、`refresh_token`(service + handler)
- 無新 crate、無 DB migration、無新 secret、無 docker-compose / nginx 改動
