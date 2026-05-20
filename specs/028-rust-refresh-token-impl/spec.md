# Feature Specification: F13 — rust-refresh-token-impl

**Feature Branch**: `028-rust-refresh-token-impl`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "F13 rust-refresh-token-impl — rust 補實作 POST /auth/refreshToken refresh token rotation,使 rust-api 自身能驗證與輪替 refresh token,為 F14 cutover 做準備。per docs/superpowers/028-feature-rust-refresh-token-impl.md brainstorm doc(3 拍板點)。"

**Source**: [`docs/superpowers/028-feature-rust-refresh-token-impl.md`](../../docs/superpowers/028-feature-rust-refresh-token-impl.md)(brainstorming 2026-05-21 session、3 拍板點)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §6.1 — F13 `rust-refresh-token-impl`:「rust 補實作 refresh token rotation(取代 nestjs `/auth/refreshToken`);繼承 F10 的 `sys_tokens` schema 與 redis pub-sub」;Phase 5(P5)、依賴 F10
  - §6.2 — 拍板原則:「P5 在 P1-P4 全部穩定後才啟動;過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」— **F13 的 time gate**
  - §3.3 / §5.1.3 — `sys_tokens` 表共識:rust 主導 migration 預建 schema,DESIGN-A→DESIGN-B「rust 直接接手寫、不需 schema 變動」;`sys_tokens` 作 revocation list / rotation chain
  - §1.5 / §5.2.1 — 資料變動原則:業務變動 +(本 feature 為)token 輪替的多筆寫入須同一 DB transaction
  - §2.2 / §6.1 line 170 — `/api/auth/refreshToken` 為 Transitional;「rust 補齊後 nginx 改路由、刪 TRANSITIONAL block」= F14
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle III「嚴版禁 Forward + 單一職責」、Principle V「漸進收縮」、Principle IV「base 不改動邊界」
- F10 `refresh-token-nestjs-bridge`(merge `8f0e84c`)+ F10.1 `rust-jwt-refresh-token-signing`(merge `48b70e6`)+ F10.2 `rust-tokenstatus-string-align`(merge `851ec79`)— F13 直接前置
- F12 baseline(剛 merge):outer merge `86e56e5`、rust-api `30c8dd4`(本 branch `028-rust-refresh-token-impl` 從 `rev1-admin-root` 衍生)
- F8 / W-F11 / F12 implement-time pattern「兩段式 commit、curl + psql + docker exec acceptance、無 e2e framework」— F13 沿用

> ⚠️ **Time gate**:F13 屬 DESIGN-A §6.1 Phase 5(P5),依 §6.2「過渡橋 F10 至少在 DESIGN-A 形態下運行 N 週驗證」後才應 implement。本 spec 為**設計先行**(spec/plan 先備);`/speckit-implement` 的實際落地時機由 time gate 決定。

**Scope summary**:F13 = **rust 補實作 refresh token rotation** — DESIGN-A §6.1 Phase 5(P5)第一個 feature。F10 把 `POST /auth/refreshToken` 交 nestjs 補位(nginx W-FA2 TRANSITIONAL block 路由);F10.1 讓 rust 登入已能簽發 refresh token、F10.2 對齊 `TokenStatus`。但 rust 至今**無**消費/驗證/輪替 refresh token 的端點。F13 補上 —— rust endpoint 與 nestjs endpoint **共存**,F13 階段以直連 rust port 驗證 rust 端正確;nginx routing 切換留 F14。

| 面向 | F13 deliverable |
|---|---|
| **交付** | rust-api 新增 `POST /auth/refreshToken` endpoint(handler + service method + public router mount + refresh-token 驗證函式 + request DTO) |
| **行為** | 驗 refresh token(JWT 簽章 + DB 狀態)→ 完整輪替(核發新 access + 新 refresh、舊 token 標 `used`)→ 回 `{token, refreshToken}` |
| **紀錄** | `sys_tokens`:新增一筆新 token pair row(status `unused`)+ 舊 row status 改 `used`,單一 transaction;**不額外寫** `sys_operation_log` / `sys_login_log` |
| **新 token 身分** | refresh 時依 user_id 重查 user 當下 role/domain/org,比照 login 重建 access-token claim |
| **routing** | nginx 不動(`/api/auth/refreshToken` 仍 → nestjs);rust endpoint 以直連 rust port 驗證。nginx 切換是 F14 |

**Commit 模式**(F13 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F7.2/F10):rust-api worktree 1 commit(handler + service + router + refresh 驗證 + DTO)+ outer 1 commit(spec docs + `CLAUDE.md` SPECKIT marker + `INTEGRATION-CHECKLIST.md`)+ merge `--no-ff` + SHA fill follow-up。
- **無 `docker-compose.yml` 改、無 nginx 改、無 DB migration**(`sys_tokens` schema F10 已建)。

**範疇外**:
- ❌ 不動 nginx routing — `/api/auth/refreshToken` 仍 → nestjs;routing 切換 + 刪 TRANSITIONAL block 是 **F14**
- ❌ 不拔 nestjs container、不改 docker-compose — F14 範疇
- ❌ logout / 主動 token revocation endpoint — 非 F13/F14 範疇
- ❌ 無 DB migration、不改 `sys_tokens` schema
- ❌ 不寫 `sys_operation_log` / `sys_login_log`、不新增 `AuditOperation` 變體(per Q2)
- ❌ 不引入 token revocation 的 redis pub-sub(`sys_tokens` 表即事實源)
- ❌ 不改 `base-web/`、不動 `fork260509-soybean-admin-nestjs/`
- ❌ 不改既有 `/auth/login` 的 token issuance 路徑
- ❌ per-user 並行 session 上限 / session 管理策略

## Clarifications

### Session 2026-05-21(brainstorming 階段拍板、3 拍板點)

- **Q1 (brainstorm)**: 一個有效 refresh token 被用掉時,rust 怎麼處理?→ **A:完整輪替、舊 token 標 `used`**。核發新 access + 新 refresh token;舊 refresh token 的 `sys_tokens` row status 改為 `Refreshed`(`"used"`)、一次性用畢、不能再 refresh。對齊 nestjs 實際行為使 F14 cutover 無縫。對比「只換 access token、refresh token 重複用到過期」。
  > DESIGN-A §3.3 文字寫「舊 token 標 revoked」,與 nestjs 實作的 `"used"` 不一致 — F13 以對齊 nestjs 實際行為為準;`"revoked"` 保留給未來主動 revocation。

- **Q2 (brainstorm)**: refresh 動作除了 `sys_tokens`(新 row + 舊 row→used),要不要額外寫 log 表?→ **A:不額外寫、`sys_tokens` 即紀錄**。`sys_tokens` 的新 row(含時間戳)+ 舊 row 標 `"used"` 即 refresh 的完整 rotation-chain 紀錄。不寫 `sys_operation_log`、不寫 `sys_login_log`。對齊 rust 現況 — rust login 自己也只寫 `sys_tokens`(+ `sys_login_log`)、不寫 `sys_operation_log`;`sys_operation_log` 定位為 admin CRUD 寫路徑審計。

- **Q3 (brainstorm)**: refresh 核發的新 access token,其 role/domain/org 身分資料怎麼來?→ **A:refresh 時重查 user 當下狀態**。依 user_id 重查 user 當下 role/domain/org,比照 login 重建 access-token claim。refresh token 本身只帶 user_id、`sys_tokens` 表也無 role/org 欄;重查使新 token 反映 user 最新狀態(role 變更於下次 refresh 生效)、與 login 一致。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 已登入使用者以 refresh token 換發新 token(Priority: P1)🎯 MVP

base-web SPA 的已登入使用者,其 access token 有使用期限。access token 到期前/後,SPA 持有的 refresh token 可呼叫 `POST /auth/refreshToken` 換得一組新的 access token + refresh token,使用者**不需重新輸入帳密登入**即可延續工作階段。每次 refresh 為**完整輪替**:舊 refresh token 立即一次性用畢(不可再用),新 refresh token 取而代之;refresh 核發的新 access token 反映該 user 當下的角色與權限。整個 refresh 由 rust-api 自身處理(F13 之前由 nestjs 補位)。

**Why this priority**: F13 唯一 deliverable,也是 DESIGN-A §6.1 Phase 5(P5)「DESIGN-A→DESIGN-B 遷移」的第一塊。沒有它,refresh token 流永遠依賴 nestjs,F14 cutover(拔 nestjs)無法進行 — DESIGN-B(rust-only)形態無法達成。

**Independent Test**: 直連 rust-api(`:11081`)`/auth/login` 取得一組 token → 以該 refresh token 呼叫 `POST /auth/refreshToken` → 確認回傳新 access + 新 refresh token、psql 確認舊 `sys_tokens` row status 變 `used` 且新 row 已建 → 以新 access token 呼叫一個受保護端點確認可用 → 再次呈遞同一(舊)refresh token 確認被拒。

**Acceptance Scenarios**:

1. **Given** 一組由 rust-api 登入取得的有效 refresh token(`sys_tokens` row status `unused`),**When** 以該 refresh token 呼叫 `POST /auth/refreshToken`,**Then** 回傳一組新的 access token 與 refresh token、HTTP 200 + F4 envelope 成功。
2. **Given** US1.1 的 refresh 已成功,**When** 檢查 `sys_tokens`,**Then** 舊 refresh token 對應 row 的 status 為 `used`、且新增一筆記錄新 token pair 的 row(status `unused`)。
3. **Given** US1.1 回傳的新 access token,**When** 以它呼叫一個受保護端點,**Then** 通過驗證與授權(該 user 當下角色反映於 token)。
4. **Given** US1.1 的舊 refresh token(已輪替、status `used`),**When** 再次以它呼叫 `POST /auth/refreshToken`,**Then** 被拒絕、不核發任何 token、`sys_tokens` 不變(一次性)。
5. **Given** 一個簽章無效 / 已過期 / 不存在於 `sys_tokens` 的 refresh token,**When** 呼叫 `POST /auth/refreshToken`,**Then** 被拒絕、不核發任何 token、`sys_tokens` 不變。
6. **Given** 一個 user 已被軟刪,其先前取得的 refresh token,**When** 呼叫 `POST /auth/refreshToken`,**Then** 被拒絕。
7. **Given** F13 落地,**When** 檢查 nginx 設定 / docker-compose / DB migration / base-web / nestjs fork,**Then** nginx `/api/auth/refreshToken` 仍路由 nestjs(0 改動)、無新 migration、`docker-compose*.yml` 0 改動、base-web 與 nestjs fork 零改動。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | request body 缺 `refreshToken` 或格式錯 | HTTP 400(request 解析失敗、同既有 DTO 行為) |
| E-2 | refresh token JWT 簽章無效 / 已過期 | 拒絕、不核發 token、不變更 `sys_tokens` |
| E-3 | refresh token 查無對應 `sys_tokens` row | 拒絕、不核發 token、不變更 `sys_tokens` |
| E-4 | refresh token 對應 row status 非 `unused`(已 `used` / `revoked`) | 拒絕(一次性用畢 / 已撤銷) |
| E-5 | 對應 user 已被軟刪 / 不存在 | 拒絕 |
| E-6 | 輪替過程 DB transaction 失敗 | rollback、回 error、`sys_tokens` 維持原狀(無半套寫入) |
| E-7 | 同一 refresh token 並行兩次呈遞 | 至多一次成功;另一次因 status 已非 `unused` 被拒(單一 transaction 保證) |

## Requirements *(mandatory)*

### Functional Requirements

**A. Endpoint**

- **FR-001**: rust-api MUST 新增 `POST /auth/refreshToken` endpoint。
- **FR-002**: 該 endpoint MUST 為 public(不需有效 access token、不經存取權杖驗證 middleware、不經 Casbin 授權)— refresh token 本身即憑證,與 `/auth/login` 同層。
- **FR-003**: 該 endpoint MUST 接受 request body 內含 `refreshToken` 欄位。

**B. Refresh token 驗證**

- **FR-004**: `POST /auth/refreshToken` MUST 驗證呈遞的 refresh token 的 JWT 簽章(以 refresh 專用密鑰)與有效期(未過期)。
- **FR-005**: MUST 於 `sys_tokens` 依該 refresh token 值查找對應 row;查無 → 拒絕。
- **FR-006**: MUST 檢查該 row 的 status 為 `unused`;status 為 `used` 或 `revoked` → 拒絕。
- **FR-007**: MUST 確認對應 user 存在且未被軟刪;否則拒絕。
- **FR-008**: 任何驗證失敗 MUST 不核發 token、MUST 不變更 `sys_tokens`、MUST 回 F4 envelope 的 auth-failure 類結果;對 client **不細分**失敗原因(避免洩漏 refresh token 是否存在)。

**C. 輪替**

- **FR-009**: 驗證通過後 MUST 完整輪替 — 核發**一組新的** access token 與 refresh token。
- **FR-010**: 舊 refresh token 對應的 `sys_tokens` row status MUST 標為 `used`,使其一次性、不可再被 refresh。
- **FR-011**: 「INSERT 記錄新 token pair 的 row」與「UPDATE 舊 row 的 status」MUST 在**單一 DB transaction** 內完成(原子;失敗則整體 rollback)。
- **FR-012**: refresh MUST 為一次性 — 同一 refresh token 第二次起呈遞,因 status 已非 `unused` 而被拒。

**D. 新 token 身分**

- **FR-013**: refresh 核發的新 access token,其身分 claim(角色 / domain / org / username)MUST 於 refresh 時依 user_id 重查 user 當下狀態重建(比照 `/auth/login` 組 access-token claim 的方式)。
- **FR-014**: refresh 核發的新 refresh token MUST 以 refresh 專用密鑰簽發、形態與 `/auth/login` 核發的 refresh token 一致。

**E. 紀錄**

- **FR-015**: refresh MUST 於 `sys_tokens` 新增一筆 row 記錄新 token pair(status `unused`);此新 row 與「舊 row → `used`」即 F13 對 refresh 動作的完整紀錄。
- **FR-016**: F13 MUST NOT 寫 `sys_operation_log`、MUST NOT 寫 `sys_login_log`(per Q2)。
- **FR-017**: F13 MUST NOT 新增 `AuditOperation` enum 變體。

**F. 通用範疇 / 紀律**

- **FR-018**: F13 MUST NOT 改動 nginx 設定(`/api/auth/refreshToken` routing 切換為 F14)。
- **FR-019**: F13 MUST NOT 改 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`、MUST NOT 新增 DB migration、MUST NOT 改 DB schema。
- **FR-020**: F13 MUST NOT 動 `base-web/` 任何 file、MUST NOT 動 `fork260509-soybean-admin-nestjs/` 任何 file。
- **FR-021**: F13 MUST NOT 改既有 `/auth/login` 的 token issuance 路徑(只新增 refresh path)。
- **FR-022**: F13 commit 模式 = 兩段式(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 `docker-compose.yml` 改、無 migration**。
- **FR-023**: F13 acceptance MUST 用 inline bash(`curl` + `psql` + `docker compose exec` / `run`)+ `contracts/`,不新建 deploy script、不引入 e2e test framework;F13 MAY 為純函式部分加 rust unit test。
- **FR-024**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新(F13 row、Current Focus、完成里程碑)。

### Key Entities

- **Refresh token** — 一個 JWT,由 rust-api 於登入 / refresh 時核發、以 refresh 專用密鑰簽章、帶 user 識別與有效期;client 持有,用以換發新 token。
- **`sys_tokens` row** — 一筆 token pair 紀錄(access token + refresh token + status + user 識別 + 時間 / 連線 context)。F13 不改其 schema;refresh 時新增一筆(status `unused`)、舊 row status 改 `used`。status 取值 `unused` / `used` / `revoked`。
- **Access token / 身分 claim** — refresh 核發的新 access token,其角色 / domain / org 等身分 claim 於 refresh 時重查 user 當下狀態重建。
- **`RefreshTokenInput`(request 載體)** — `POST /auth/refreshToken` 的 request body,內含 `refreshToken` 欄位。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F13 落地後,以有效 refresh token 呼叫 `POST /auth/refreshToken` 回傳一組新的 access token 與 refresh token。
- **SC-002**: F13 落地後,refresh 成功後舊 refresh token 於 `sys_tokens` 標 `used`、新 token pair 為一筆新 row(status `unused`)。
- **SC-003**: F13 落地後,refresh 回傳的新 access token 可通過受保護端點的驗證與授權,且其角色反映該 user 當下狀態。
- **SC-004**: F13 落地後,同一 refresh token 第二次呈遞被拒絕、不核發 token(一次性)。
- **SC-005**: F13 落地後,無效 / 過期 / 不存在的 refresh token 被拒絕、不核發 token、不變更 `sys_tokens`。
- **SC-006**: F13 落地後,已軟刪 user 的 refresh token 被拒絕。
- **SC-007**: F13 的 refresh 行為不寫 `sys_operation_log`、不寫 `sys_login_log`。
- **SC-008**: F13 不改 nginx 設定(`/api/auth/refreshToken` 仍路由 nestjs)、不改 `docker-compose*.yml`、無新 DB migration、不改 DB schema。
- **SC-009**: F13 不動 base-web(`git diff` 無輸出)、不動 nestjs fork(`git diff` 無輸出)。
- **SC-010**: F13 完成里程碑 commit 數 = 兩段式(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。
- **SC-011**: `docs/INTEGRATION-CHECKLIST.md` 的 F13 row 與 Current Focus 獲更新。

## Assumptions

- **A-001**: F10 已建立 `sys_tokens` 表 schema(access_token / refresh_token / status / user_id / username / domain / 時間 / 連線 context 欄位);F13 不改、不 migrate。
- **A-002**: F10.1 已使 rust `/auth/login` 核發 JWT refresh token、refresh 專用密鑰(refresh secret、缺則 fallback 主 JWT secret)與 refresh token 的 claim 形態就位;F13 沿用同簽章機制核發新 refresh token。
- **A-003**: F10.2 已對齊 `TokenStatus` 字串值(`unused` / `used` / `revoked`);F13 以 `used` 標記輪替後的舊 token。
- **A-004**: rust `/auth/login` 既有「重查 user → 組 access-token claim」的邏輯可供 refresh path 重用,或可抽成共用 helper(實作細節於 plan Phase 0 確認)。
- **A-005**: `/auth/refreshToken` 為 public endpoint(同 `/auth/login`);refresh token 即憑證,不需有效 access token。
- **A-006**: F13 期間 nginx `/api/auth/refreshToken` 仍路由 nestjs;F13 的 rust endpoint 以直連 rust port(dev `:11081`)驗證 — rust 與 nestjs 兩端點共存(per DESIGN-A F13「共存運行驗證」)。
- **A-007**: F13 屬 DESIGN-A §6.1 Phase 5(P5)、有 time gate(「過渡橋 F10 在 DESIGN-A 形態下運行 N 週驗證」後才 implement);本 spec 為設計先行。
- **A-008**: `sys_tokens` 表即 token 狀態的唯一事實源;multi-instance 下 token 一致性靠共用 postgres,F13 不需新增 redis pub-sub。

## Dependencies

### Inbound(本 feature 依賴)

- **F10** `refresh-token-nestjs-bridge`:`sys_tokens` schema、nginx W-FA2 TRANSITIONAL block、nestjs 補位 baseline。✅(merge `8f0e84c`)
- **F10.1** `rust-jwt-refresh-token-signing`:rust 登入核發 JWT refresh token、refresh claim、refresh secret。✅(merge `48b70e6`)
- **F10.2** `rust-tokenstatus-string-align`:`TokenStatus` enum 字串值對齊(`unused` / `used` / `revoked`)。✅(merge `851ec79`)

### Outbound(本 feature 解鎖)

- **F14** `design-a-to-b-cutover`:F13 完成後,F14 可把 nginx routing 從 nestjs 改指 rust 的 `/auth/refreshToken`、刪 TRANSITIONAL block、拔 nestjs container — DESIGN-B(rust-only)形態正式生效。

### Follow-up(F13 範疇外、留後續)

- logout / 主動 token revocation endpoint(F13 不做;`revoked` status 預留)。
- per-user 並行 session 上限 / session 管理策略。
