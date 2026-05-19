# Feature Specification: F10.2 — rust-tokenstatus-string-align

**Feature Branch**: `019-rust-tokenstatus-string-align`
**Created**: 2026-05-19
**Status**: Draft
**Input**: User description: "F10.2 rust-tokenstatus-string-align — rust `TokenStatus` enum strum serialize 從 SCREAMING_SNAKE_CASE 改 snake_case + per-variant override(Active=\"unused\"、Refreshed=\"used\"、Revoked=\"revoked\")對齊 nestjs `TokenStatus` enum(UNUSED='unused'/USED='used')。修 F10/F10.1 acceptance surface 的 R-7 friction(nestjs `tokens.entity.ts:33` 對 rust 寫入 status=\"ACTIVE\" throw `'Token has already been used.'`)、refreshToken end-to-end pass。Application Phase 4 第三個 feature(F10 wire-up + F10.1 R-8 修後收尾)。"

**Source**: [`docs/superpowers/019-feature-rust-tokenstatus-string-align.md`](../../docs/superpowers/019-feature-rust-tokenstatus-string-align.md)(brainstorming 2026-05-19 session、4 顯式拍板 Q + project context grep evidence)

**Authoritative parents**:
- [`specs/017-refresh-token-nestjs-bridge/spec.md`](../017-refresh-token-nestjs-bridge/spec.md)(F10 spec、R-7 finding source、F10.2 解鎖 follow-up 之一)
- [`specs/018-rust-jwt-refresh-token-signing/spec.md`](../018-rust-jwt-refresh-token-signing/spec.md)(F10.1 spec、明列 F10.2 為 outbound 解鎖 + R-7 surface 為 F10.1 acceptance 預期結果)
- F10.1 acceptance C-V3 + C-V4 evidence(R-7 surface 屬實:`tokens.entity.ts:27:19 refreshTokenCheck` stack trace + `'Token has already been used.'` 3 line)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.2「nestjs source **不改**,只用既有 build artifact / docker image」(F10.2 嚴守、改 rust 遷就 nestjs)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 application Phase 4(F10/F10.1/F10.2 series 收尾)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork 完全零改動;Principle V「漸進收縮」— F10.2 修 friction 屬過渡,DESIGN-B 階段 lowercase enum 仍保留)
- 既有 rust `TokenStatus` enum(`rust-api/server/constant/src/definition/consts.rs:6-13`、3 variant + strum derive macro)— F10.2 主要改動點
- 既有 rust `access_token_event.rs:30`(`status: Set(TokenStatus::Active.to_string())` 唯一寫入 callsite、F10.2 不動但行為自動跟著新 serialize)
- 既有 rust `TokenStatus::is_valid()` / `can_refresh()`(line 15-23、只 match Active variant、與 string repr 無關、F10.2 不動)
- 既有 nestjs `TokenStatus` enum(`fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/tokens/constants.ts:5-8`、`UNUSED = 'unused'` / `USED = 'used'`)
- 既有 nestjs `tokens.entity.ts:33`(`if (this.status !== TokenStatus.UNUSED) throw new Error('Token has already been used.')` — F10.2 對齊點)
- 既有 nestjs `token-generated.event.handler.ts:22`(`status: TokenStatus.UNUSED` — nestjs 自寫 sys_tokens status 為 `"unused"`、F10.2 後 rust + nestjs 寫入字串值對齊)

**Scope summary**:rev1 application Phase 4 **第三個** feature(F10 wire-up + F10.1 R-8 修後接續、F11/F13 之前)。**修 R-7**:rust `TokenStatus` enum strum serialize 從 `SCREAMING_SNAKE_CASE` 改 `snake_case` + 2 個 per-variant override 對齊 nestjs `TokenStatus` enum(`UNUSED = 'unused'` / `USED = 'used'`)。落地後 F10/F10.1 acceptance surface 的 R-7 friction(`'Token has already been used.'`)消除、refreshToken end-to-end pass(login → refreshToken HTTP 200 + 新 token pair + sys_tokens 雙 row state transition:新 row `status='unused'` + 舊 row `status='used'`)。範疇刻意收緊到「**rust TokenStatus enum 字串值對齊**」、**不動 nestjs source / 不改 sys_tokens schema / 不加 DB migration backward compat / 不驗 base-web e2e / 不升 RS256**。

**Commit 模式**(post brainstorm 拍板 — F10.2 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F10.1/F5.1/F6):rust-api worktree 1 commit + outer 1-2 commit(spec docs + rust-api SHA pin;**無 docker-compose.yml 改**、F10.1 wire 已涵蓋)

**範疇外**:
- ❌ nestjs source 任何改動(嚴守 DESIGN-A §3.2 + F10/F10.1 Q 延伸)
- ❌ rust `sys_tokens` schema 結構改動(W-FA1 已驗對齊、F10.2 不動)
- ❌ DB backward compat migration 改舊 row(per brainstorm Q3、scope 最小)
- ❌ rust 自實作 refresh token rotation(F13)
- ❌ rust 自驗 refresh token(F13)
- ❌ JWT 演算法升 RS256 / key versioning(F1.2)
- ❌ base-web SPA e2e refreshToken 自動化(F11 之後)
- ❌ JWT claim presence assertion(F13)
- ❌ Casbin policy redis pub-sub channel(F11 或不做)
- ❌ audit log sys_operation_log 寫入(F13)
- ❌ TokenStatus 增加新 variant(如 Expired)
- ❌ refresh_secret rotation / key rolling(F1.2)

## Clarifications

### Session 2026-05-19(brainstorming 階段拍板、4 顯式 Q + project context grep evidence)

- **Q1 (brainstorm)**: rust `TokenStatus::Revoked` variant 怎麼處理?(nestjs 只有 unused/used 兩狀態、無 revoked 對應)→ **A:保留 rust-only 狀態、serialize 為 `"revoked"`**(走 snake_case default)。理由:(1) nestjs 只有 2 狀態、無 revoked 對應;(2) rust 既有 Revoked 用於 admin 手動撤銷 token 場景(語意上「security 強制終止」),保留是高審潔語意;(3) nestjs 看到 `"revoked"` !== `"unused"` 仍 throw deny → 等同 admin block 效果(符合 revoked 直覺);(4) DESIGN-B 階段 rust 自管 revoke 紀律不以 nestjs 為準、Revoked variant 保留無破壞性。對比:Option B「刪除 Revoked」過度約束、丟失 admin revoke capability;Option C「混合 SCREAMING/snake」讀起來不一致、無語意收益。

- **Q2 (brainstorm)**: rust TokenStatus enum 讓 serialize 出小寫該走哪條路? → **A:strum `serialize_all = "snake_case"` + per-variant override**(Active="unused"、Refreshed="used")、~3-4 LOC enum 改。最終 mapping 表:

  | rust variant | strum attribute | 寫入 DB | nestjs 讀取期望 | 結果 |
  |---|---|---|---|---|
  | `Active` | `#[strum(serialize = "unused")]` override | `"unused"` | `"unused"` | refreshToken 走通 |
  | `Refreshed` | `#[strum(serialize = "used")]` override | `"used"` | `"used"` | already-used 判定對齊 |
  | `Revoked` | (snake_case default) | `"revoked"` | — | rust-only,nestjs 看到 !== unused 仍 deny |

  理由:per-variant override 明確、覆蓋自動 serialize_all 行為;snake_case default 自動處理 Revoked(無需第 3 個 override line);enum 本身 ~3-4 LOC 改 + callsite 零改(`access_token_event.rs:30` `TokenStatus::Active.to_string()` 自動換值)。對比:Option A 純 serialize_all=snake_case → Active 變 `"active"` 而非 `"unused"`、R-7 不修;Option C 改 callsite manual mapping → enum 零改但邏輯散在 callsite、未來多 callsite 重複。

- **Q3 (brainstorm)**: 舊 sys_tokens row(現存 `"ACTIVE"` 字串)該怎麼處理? → **A:不處理舊 row,acceptance 重 login**。理由:(1) 舊 `"ACTIVE"` row 為 F10.1 測試遺留、未來自然過期 or 手動清;(2) acceptance 設計為證 = login 拿新 token → refreshToken work、舊 row 路徑非 F10.2 證明目標;(3) spec 不動 schema / 不加 migration、scope 最小;(4) nestjs 對舊 `"ACTIVE"` 仍 throw R-7 message — 但這是「舊 row 路徑」的預期行為、不影響新登入用 token 的 refresh 流程。對比:Option B 加 migration UPDATE → F10.2 規模從 ~18 LOC 變 ~35 LOC、migration init container 需 rerun、過度;Option C rust 讀取面 backward compat → 解決 rust 自己讀但不解 nestjs 讀、不解本問題。

- **Q4 (brainstorm)**: F10.2 rust unit test 是 MUST、SHOULD 還是 skip? → **A:SHOULD、1 個 unit test 對 3 variant serialize + 3 reverse from_str assert**(~12 LOC、加在既有 `consts.rs` `#[cfg(test)] mod tests` 或新加 module)。理由:(1) F10.2 邏輯 stack-可見(refreshToken HTTP 200 即驗 enum serialize 對),unit test 提供 fast feedback(rebuild image ~5-7 min vs unit test ~30s);(2) enum derive macro 行為(per-variant override 真覆蓋 serialize_all 嗎)是 stack-不可見的微妙點、unit test 是適合 layer;(3) 比 F10.1 unit test(2 個、~30 LOC)規模小,但同性質紀律維持。對比 F10.1 clarify Q3 結論:F10.1 是 MUST(critical path 含 stack-不可見 fallback 邏輯),F10.2 是 SHOULD(critical path stack-可見),反映兩 feature LOC + 邏輯複雜度差異。

- **Evidence collection 2026-05-19**(grep + Read tool):
  - rust `TokenStatus` enum 在 `server/constant/src/definition/consts.rs:6-13`、3 variant(`Active`/`Refreshed`/`Revoked`)、`#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]` + `AsRefStr/Display/EnumString` derive。
  - rust `TokenStatus::is_valid()` / `can_refresh()` line 15-23、只 match `Active` variant、與 string repr 無關(F10.2 後仍 work)。
  - rust 唯一 writeback callsite `server/service/src/admin/events/access_token_event.rs:30`、`status: Set(TokenStatus::Active.to_string())`(F10.2 不動 callsite、行為自動跟著新 serialize)。
  - nestjs `TokenStatus` enum `fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/tokens/constants.ts:5-8`、`UNUSED = 'unused'` / `USED = 'used'`。
  - nestjs read 邏輯 `tokens.entity.ts:33`、`if (this.status !== TokenStatus.UNUSED) throw new Error('Token has already been used.')`(F10.2 對齊點)。
  - nestjs writeback `token-generated.event.handler.ts:22`、`status: TokenStatus.UNUSED`(nestjs 自寫 sys_tokens status 為 `"unused"`、F10.2 後 rust + nestjs 寫入字串值對齊)。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 R-7 修 + refreshToken end-to-end pass(Priority: P1)🎯 MVP

operator 跑 `curl POST /api/auth/login` 拿 rust 簽的 JWT refresh_token(F10.1 已 wire)→ 跑 `curl POST /api/auth/refreshToken` 帶 refresh_token → **預期 HTTP 200 + body 含 token + refreshToken 新 pair**(F10/F10.1/F10.2 整套 wire-up 完整、R-7/R-8 全修)→ 紀錄 nestjs log 無 error(R-7 + R-8 都消除)。證明 application Phase 4 第三個也是最後一個 feature 收尾、refreshToken 業務流程走通。

**Why this priority**:F10.2 唯一含 implementation 的 user story、對齊 R-7 修 = F10.2 核心目標。沒此 acceptance、R-7 是否真修、refreshToken end-to-end 是否走通無從驗。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 用該 refresh_token 跑 refreshToken endpoint → 預期 HTTP 200 + body 含新 token pair(non-error、non-R-7、non-R-8)+ nestjs log 無 `Token has already been used` 或 `JsonWebTokenError`。

**Acceptance Scenarios**:

1. **Given** stack 已起(W-FA1 7 service healthy、含 nestjs、且 F10.2 rust-api image 已 rebuild),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code, data:{token, refreshToken, ...}}`、**refreshToken 為 HS256 JWT 三段格式**(F10.1 沿用)。

2. **Given** US1.1 拿到 JWT 格式 refresh_token,**When** `curl -X POST -H "Content-Type: application/json" -d '{"refreshToken":"<jwt-token>"}' http://127.0.0.1:11080/api/auth/refreshToken`,**Then** HTTP **200** + body 含 `token` + `refreshToken`(新 pair、非 4xx/5xx with `'Token has already been used.'`)— R-7 修確認、refreshToken 業務流程走通。

3. **Given** US1.2 拿到 nestjs response,**When** `docker compose logs nestjs --tail=80` grep `'Token has already been used'|JsonWebTokenError|jwt malformed`,**Then** **0 line**(R-7 + R-8 都 fixed、F10.1 R-8 修仍維持)— 證 R-7 + R-8 全清。

---

### User Story 2 — DB 準據驗 sys_tokens state transition(Priority: P2)

F10.2 走完 US1 流程後查 postgres `sys_tokens` 表,確認 rust login 寫入新 row 為 `status='unused'`(對齊 nestjs 期望)、nestjs refreshToken 用過後該 row status 改為 `'used'`(state transition 正確)。

**Why this priority**:rust 寫入字串值對齊 nestjs 是 wire-up baseline、必驗以證 rust 端 serialize 正確、state transition flow 正確。

**Independent Test**:US1.1 + US1.2 完成後查 sys_tokens 表最新 2 row、驗 status 值對齊 nestjs `'unused'` / `'used'`。

**Acceptance Scenarios**:

1. **Given** US1.1 + US1.2 完成,**When** `psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust -c "SELECT status, char_length(refresh_token) AS rt_len, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 2"`,**Then** 2 row、最新 `status='unused'`(rust 新登入寫入、對齊 nestjs)、次新 `status='used'`(nestjs refreshToken 用過後改、state transition 正確)、rt_len > 100(JWT 格式、F10.1 沿用)。

---

### User Story 3 — F10.1 secret 對齊 regression(Priority: P3)

F10.2 落地後 rust + nestjs effective refresh_secret 仍對齊(F10.1 fallback chain 維持、F10.2 不動 secret wiring)。

**Why this priority**:F10.2 不動 secret wiring、但須 regression 驗 F10.1 既有對齊不退化。

**Independent Test**:`docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"`,兩 envvar 同 value(F10.1 既有對齊維持)。

**Acceptance Scenarios**:

1. **Given** stack 已起,**When** `docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"`,**Then** `REFRESH_TOKEN_SECRET=<value>` == `JWT_SECRET=<value>`(F10.1 fallback chain 對齊維持、F10.2 不退化)。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 舊 sys_tokens row(`status='ACTIVE'` SCREAMING)在 DB | nestjs 對該 row 仍 throw R-7 message(per Q3 拍板、F10.2 不處理舊 row)。新登入後寫 `'unused'` 路徑不受影響。LIMIT 2 取最新 2 row 為 F10.2 acceptance 路徑、舊 row 排在 LIMIT 之外。 |
| E-2 | rust admin 手動 revoke token(寫 `TokenStatus::Revoked.to_string()` → `"revoked"`)| nestjs 後續對該 token 跑 refreshToken 看到 status `"revoked"` !== `"unused"` → throw 'Token has already been used.'(等同 deny、符合 revoked 直覺)。 |
| E-3 | rust 簽 JWT 但 nestjs verify fail(F10.1 R-8 regression)| F10.2 acceptance C-V3 grep `JsonWebTokenError` 應 0 line、若 surface → F10.1 退化、abort F10.2 + 檢 F10.1 secret 對齊。預期不發生(F10.1 已驗、F10.2 不動 secret)。 |
| E-4 | strum derive macro per-variant override 與 serialize_all 衝突| C-V1 unit test 對 3 forward + 3 reverse 全 assert、如 derive 行為意外則 unit test red、改 enum 設計(可能改 Option B 全 per-variant override)。 |
| E-5 | rust 其他 code path 寫入 status SCREAMING literal('ACTIVE' / 'REFRESHED' / 'REVOKED' SQL hard-coded)| F10.2 brainstorm + spec phase grep 驗無 SQL hard-code,只有 `access_token_event.rs:30` 透過 enum API 寫入;若意外發現 → R-2 緩解、加入 F10.2 scope 或拆 follow-up。 |
| E-6 | refreshToken expire 過期(F10.1 設 7200s) | nestjs `verifyAsync` throw `TokenExpiredError` → 4xx;非 F10.2 修點、不主動構造,屬 F1.2 / future。 |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F10.2 MUST 改 rust `TokenStatus` enum strum derive attribute `#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]` 為 `#[strum(serialize_all = "snake_case")]`(per US1 + Q2 拍板)。
- **FR-002**: F10.2 MUST 加 per-variant strum override:`#[strum(serialize = "unused")]` 在 `Active` variant、`#[strum(serialize = "used")]` 在 `Refreshed` variant(per Q2 拍板 mapping 表)。
- **FR-003**: F10.2 MUST 保留 `Revoked` variant 走 snake_case default、serialize 為 `"revoked"`(per Q1 拍板、rust-only 狀態紀律)。
- **FR-004**: F10.2 MUST 不動 `TokenStatus::is_valid()` / `can_refresh()` 邏輯(只 match Active variant、與 string repr 無關、行為自動跟著新 serialize)。
- **FR-005**: F10.2 MUST 不動 `access_token_event.rs:30` 唯一寫入 callsite(`TokenStatus::Active.to_string()` 自動換值、callsite 零改)。
- **FR-006**: F10.2 MUST 不動 nestjs fork source 任何檔(嚴守 DESIGN-A §3.2、per F10/F10.1 Q 延伸 + OOS-001)。
- **FR-007**: F10.2 MUST 不改 sys_tokens migration schema(W-FA1 已驗對齊)。
- **FR-008**: F10.2 MUST 不加 DB backward compat migration 改舊 row(per Q3 拍板、scope 最小)。
- **FR-009**: F10.2 MUST 不改 base-web src(per Constitution Principle IV + OOS-007)。
- **FR-010**: F10.2 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit(consts.rs 改)+ outer 1-2 commit(spec docs + INTEGRATION-CHECKLIST.md milestone + SHA pin、**無 docker-compose.yml 改**)+ merge `--no-ff`。
- **FR-011**: F10.2 acceptance 用 inline bash + `contracts/verification-commands.md`(per F10/F10.1 慣例、類 F10/W-FA2)、不新建 deploy script。
- **FR-012**: F10.2 MUST 用 `Soybean` user 跑 acceptance(對齊 F5.1/F6/F10/F10.1 既有慣例)。
- **FR-013**: F10.2 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance。
- **FR-014**: F10.2 MUST 不改 W-FA1 / W-FA2 / W-FA3 / F10.1 既有 deploy 配置(`docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml` / `deploy/front-nginx/conf.d/*` / `deploy/build-nestjs.sh` / `deploy/secrets/*` 不改)。
- **FR-015**: F10.2 acceptance 階段預期 R-7 friction 消除、refreshToken HTTP 200 + nestjs log grep `'Token has already been used'` = 0 line(per US1 + SC-002 + SC-003)。
- **FR-016**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F10.2、F10.2 完成里程碑、Application Phase 4 Roadmap F10.2 row「完成」、Phase 4 收尾紀錄、F11 next-step。
- **FR-017**: F10.2 MUST 加 rust unit test 1 個(per Q4 拍板 SHOULD、實作為 1 個 test 含 3 forward + 3 reverse assert):驗證 `TokenStatus::Active.to_string() == "unused"` + `TokenStatus::Refreshed.to_string() == "used"` + `TokenStatus::Revoked.to_string() == "revoked"` 三個 forward serialize、+ `TokenStatus::from_str("unused")` / `from_str("used")` / `from_str("revoked")` 三個 reverse parse PASS(對齊 nestjs 字串值 → rust enum 反向解析)。
- **FR-018**: F10.2 acceptance 完成標誌 SHOULD 為:US1 3/3 + US2 1/1 + US3 1/1 + zero-regression 1/1 = **6/6 PASS** + unit test 1/1 = **7/7 total**。
- **FR-019**: F10.2 MUST 確認 grep `'ACTIVE'\|'REFRESHED'\|'REVOKED'` SCREAMING-quoted string literal 在 rust-api source 內無 hard-code(per R-2 緩解、Q3 brainstorm + spec phase pre-check)— 若意外發現則加入 F10.2 scope 或拆 follow-up。

### Non-Functional Requirements

- **NFR-001**: F10.2 acceptance 跑時間 SHOULD ≤ 10s(6 個 C-V curl + DB query + env grep、不含 stack 啟動 + rust image rebuild)。
- **NFR-002**: F10.2 spec / plan / tasks 規模 SHOULD 對齊 F6 等緊湊 feature(~8-12 task、~150-200 行 spec、單 file ~18 LOC code)。
- **NFR-003**: F10.2 acceptance failure mode SHOULD 明確指 friction 落點(rust serialize / nestjs read / DB / state transition 不對齊),便於 follow-up 判斷。
- **NFR-004**: F10.2 完成標誌 SHOULD 為:US1 3/3 + US2 1/1 + US3 1/1 + rust unit test 1/1 = **6/6 PASS + 1 unit test = 7/7 total**(per Q4 SHOULD)。
- **NFR-005**: F10.2 rust image rebuild 時間 SHOULD ≤ 7 min(對齊 F10.1 baseline + W-F1)、不可超出 development feedback loop。

### Key Entities

- **rust `TokenStatus`**(`rust-api/server/constant/src/definition/consts.rs:6-13`)— F10.2 主要改動點,加 2 個 per-variant strum override + 改 serialize_all attribute、~5 LOC
- **rust `TokenStatus::is_valid()` / `can_refresh()`**(line 15-23)— F10.2 不動、邏輯與 string repr 無關
- **rust `AccessTokenEvent::handle()`**(`rust-api/server/service/src/admin/events/access_token_event.rs:30`)— F10.2 不動 callsite,行為自動跟著新 serialize
- **nestjs `TokenStatus`**(`fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/tokens/constants.ts:5-8`)— **不動**(per FR-006),F10.2 對齊目標
- **nestjs `tokens.entity.ts::refreshTokenCheck`**(line 33)— **不動**,F10.2 acceptance 對齊驗證點
- **nestjs `token-generated.event.handler.ts`**(line 22)— **不動**,nestjs 自寫 sys_tokens status 為 `"unused"`,F10.2 後 rust + nestjs 寫入對齊
- **`sys_tokens` 表**(W-FA1 已驗 schema 對齊)— F10.2 寫入時 status column 從 `"ACTIVE"` 變 `"unused"`、其他 column 不變;舊 `"ACTIVE"` row 保留(per Q3、自然過期 or 手動清)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F10.2 落地後跑 US1.1 → HTTP 200 + body envelope + refresh_token 為 JWT 三段格式(F10.1 沿用、F10.2 regression 驗)。
- **SC-002**: F10.2 落地後跑 US1.2 → HTTP **200** + body 含 `token` + `refreshToken`(新 pair)— R-7 修確認、refreshToken end-to-end pass(對比 F10.1 acceptance C-V3 HTTP 500 with 'Token has already been used.')。
- **SC-003**: F10.2 落地後跑 US1.3 → `docker compose logs nestjs` grep `'Token has already been used'|JsonWebTokenError|jwt malformed` **0 line**(R-7 + R-8 全清、F10.1 R-8 修仍維持)。
- **SC-004**: F10.2 落地後跑 US2.1 → `psql ... sys_tokens` 查最新 2 row、最新 `status='unused'`(rust 寫入對齊)、次新 `status='used'`(nestjs refreshToken 用過後改、state transition 正確)、rt_len > 100。
- **SC-005**: F10.2 落地後跑 US3.1 → `docker compose exec nestjs` env grep `REFRESH_TOKEN_SECRET` == `JWT_SECRET`(F10.1 fallback chain 對齊 regression 維持)。
- **SC-006**: F10.2 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1-2 commit + merge + optional SHA fill follow-up)。
- **SC-007**: F10.2 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-006 + W-FA*/F10/F10.1 三邊零改動延伸)。
- **SC-008**: F10.2 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-009 + Constitution Principle IV)。
- **SC-009**: F10.2 rust unit test(per FR-017、Q4 SHOULD)1/1 PASS:`cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs` 驗 3 forward serialize + 3 reverse from_str。
- **SC-010**: F10.2 acceptance 整套 ≤ 10s(per NFR-001)。
- **SC-011**: F10.2 rust-api 改動範圍 = **1 file**(`consts.rs`)~18 LOC(5 LOC enum + 12 LOC unit test、per NFR-002)。

## Assumptions

- **A-001**: F10 已 merge(application Phase 4 第一個 feature 就位、merge `8f0e84c`、F10.2 為第三個)。✅
- **A-002**: F10.1 已 merge(application Phase 4 第二個 feature 就位、merge `48b70e6`、R-8 修 + R-7 surface 為 F10.2 baseline)。✅
- **A-003**: W-FA1 / W-FA2 / W-FA3 已 merge(`refresh_token_secret` Docker secret + nestjs container + nginx track-a + build script 全就位)。✅
- **A-004**: F1.1 已 merge(JWT secret + _FILE pattern + `secret_loader.rs::load_secret_from_file_if_set` generic helper、F10.1 已用)。✅
- **A-005**: F4 + F5.1 + F6 已 merge(rust login flow + envelope shape + 既有 acceptance pattern)。✅
- **A-006**: nestjs prisma `SysTokens` model + rust `sys_tokens` schema 對齊(W-FA1 已驗、F10.2 不重做)。✅
- **A-007**: rust + nestjs 兩端 HS256 algorithm 對齊(F10.1 已驗)。✅
- **A-008**: `refresh_token_secret` Docker secret file 在 dev 為空、走 F10.1 fallback 路徑(兩端 effective secret 對齊、F10.2 regression 驗)。✅
- **A-009**: rust-api image rebuild ~5-7 min cold(對齊 F10.1 baseline + W-F1)。
- **A-010**: rust `TokenStatus` 只有 `access_token_event.rs:30` 唯一寫入 callsite(grep 驗、無其他 hard-coded SQL `'ACTIVE'` literal)— R-2 緩解、FR-019 補驗。
- **A-011**: 舊 `sys_tokens` row(F10.1 acceptance 遺留)不干擾 F10.2 acceptance(per R-6 緩解、LIMIT 2 取新登入 + 新 refresh 兩 row、舊 row 在 LIMIT 之外)。
- **A-012**: strum derive macro 對 `#[strum(serialize = "...")]` per-variant override 真覆蓋 `serialize_all` 行為(R-1 緩解、C-V1 unit test 驗)。

## Dependencies

### Inbound(本 feature 依賴)

- **F10** `refresh-token-nestjs-bridge`:wire-up baseline。✅(merge `8f0e84c`)
- **F10.1** `rust-jwt-refresh-token-signing`:R-8 修(rust 簽 HS256 JWT)、F10.2 前提(nestjs verify 須 pass 才走到 status check)。✅(merge `48b70e6`)
- **W-FA1** `compose-nestjs-service`:nestjs container + `refresh_token_secret` Docker secret + fallback。✅(merge `b095d55`)
- **W-FA2** `nginx-track-a-transitional-block`:refreshToken endpoint nginx → nestjs 路由。✅(merge `c5b7840`)
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build automation。✅(merge `f23f38e`)
- **F4** `response-shape-alignment`:envelope shape(F10.2 acceptance 沿用)。✅
- **F5.1** `auth-login-and-dynamic-menu`:rust login flow + AccessTokenEvent 寫 sys_tokens。✅

### Outbound(本 feature 解鎖)

- **F11** `extracted-stubs`:F10/F10.1/F10.2 完整通後 nestjs refreshToken end-to-end pass、F11 剩餘 stub endpoint 範疇可清楚定義
- **F13** `rust-refresh-token-impl`:rust 自驗 refresh token 時 status enum 字串值已對齊 nestjs / DB / sys_tokens 邏輯、F13 不需再對齊
- **F14** `design-a-to-b-cutover`:F10.2 lowercase enum 在 DESIGN-B 階段保留(rust 主導、nestjs 退出後仍是 lowercase、無破壞性)

## Out of Scope

- **OOS-001**: nestjs source 任何改動(嚴守 DESIGN-A §3.2 + F10/F10.1 Q 延伸)
- **OOS-002**: sys_tokens schema 結構改動(W-FA1 已驗對齊)
- **OOS-003**: DB backward compat migration 改舊 row(per Q3 拍板、scope 最小)
- **OOS-004**: rust 自實作 refresh token rotation(F13)
- **OOS-005**: rust 自驗 refresh token(F13)
- **OOS-006**: JWT 演算法升 RS256 / key versioning(F1.2)
- **OOS-007**: base-web SPA e2e refreshToken 自動化(F11 之後)
- **OOS-008**: JWT claim presence assertion(F13)
- **OOS-009**: Casbin policy redis pub-sub channel(F11 或不做)
- **OOS-010**: audit log sys_operation_log 寫入(F13)
- **OOS-011**: TokenStatus 增加新 variant(如 Expired)
- **OOS-012**: refresh_secret rotation / key rolling(F1.2)

## Risks

- **R-1**(極低)**strum per-variant override 與 serialize_all 互動意外**:strum derive macro 對 `#[strum(serialize = "...")]` per-variant override 是否真覆蓋 `serialize_all` 行為。**緩解**:FR-017 unit test 對 3 forward + 3 reverse assert、如 derive 行為意外則 unit test red、改 enum 設計(可能改 Option B 全 per-variant override)。

- **R-2**(低)**未涵蓋的 TokenStatus consumer**:`access_token_event.rs:30` 是唯一 grep 出的 callsite,但若有 SQL hard-coded `'ACTIVE'` literal(非透過 enum)會 silent fail。**緩解**:FR-019 grep `'ACTIVE'\|'REFRESHED'\|'REVOKED'` SCREAMING-quoted literal 確認無 SQL hard-code;C-V4 psql 雙 row 驗 status transition,如有 hard-code 會 surface。

- **R-3**(極低)**EnumString reverse parse 在 callsite**:`TokenStatus::from_str("unused")` 是否被生產程式碼用到。**緩解**:grep `TokenStatus::from_str|FromStr.*TokenStatus`,若有 callsite 確認舊 string 已不再被 parse;F10.2 acceptance phase 重 login、無舊 row from_str 路徑。

- **R-4**(低)**rust image rebuild 改 1 source file 仍觸 builder recompile**:cargo `--bin server` 改 1 source = 整 server crate dep tree recompile、~5-7 min cold。**緩解**:NFR-005 容忍;build cache 可能 hit constant crate 以外 dep。

- **R-5**(極低)**`is_valid` / `can_refresh` 邏輯仍只 match `Active`**:F10.2 後 `Active` variant 仍存在(只改字串值)、helper 邏輯不變。R-5 屬「驗證 R-2 不漏」次要點。

- **R-6**(極低)**舊 sys_tokens row backward compat 仍可能干擾 acceptance**:若 acceptance 跑時 DB 有 `"ACTIVE"` 舊 row,C-V4 sort by created_at DESC LIMIT 2 可能取到舊 row。**緩解**:C-V2 acceptance 先用全新 login(會寫新 row 為 `"unused"`),再跑 refreshToken(把該 row 改成 `"used"`),C-V4 兩 row 必是 F10.2 路徑;舊 row 排在 LIMIT 之外。
