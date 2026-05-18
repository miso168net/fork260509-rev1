# Feature Specification: F10 — refresh-token-nestjs-bridge

**Feature ID**: F10(per [`DESIGN-A`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 line 378 — application Phase 4 第一個 feature、Track DESIGN-A application 主線)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `017-refresh-token-nestjs-bridge`)
**Created**: 2026-05-19
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-19 session(5 顯式拍板 Q)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 line 378(F10 scope 描述:nestjs container 部署 + sys_tokens schema 共識 + nginx TRANSITIONAL block + Casbin policy redis pub-sub channel + refresh token rotation 跑通)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.2 nestjs 補位 endpoint「nestjs source **不改**,只用既有 build artifact / docker image」(F10 嚴守)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.3 sys_tokens 表共識(rust 主導 migration、nestjs 既有 prisma schema 對齊)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork repo 完全零改動;Principle V「漸進收縮」— F10 過渡角色)
- 既有 W-FA1 落地的 nestjs container 部署 + JWT secret 共享 _FILE pattern + sys_tokens schema 對齊驗(per [`011-feature-compose-nestjs-service.md`](011-feature-compose-nestjs-service.md))
- 既有 W-FA2 落地的 nginx TRANSITIONAL block + variable proxy_pass + lazy DNS(per [`012-feature-nginx-track-a-transitional-block.md`](012-feature-nginx-track-a-transitional-block.md))
- 既有 W-FA3 落地的 nestjs image build script(per [`013-feature-cicd-nestjs-build-job.md`](013-feature-cicd-nestjs-build-job.md))
- 既有 F5.1 落地的 rust login flow + `AccessTokenEvent::handle()` 寫 sys_tokens(per [`005-feature-auth-login-and-dynamic-menu.md`](005-feature-auth-login-and-dynamic-menu.md))
- 既有 F1.1 落地的 JWT secret 共享 + _FILE pattern(per [`004-feature-jwt-secrets.md`](004-feature-jwt-secrets.md))
- 既有 F4 落地的 response shape 對齊(per [`001-feature-response-shape-alignment.md`](001-feature-response-shape-alignment.md))— F10 acceptance 期 envelope 對齊
- nestjs 既有 `authentication.controller.ts::refreshToken()`(`apps/base-system/src/api/iam/rest/`)+ `authentication.service.ts::refreshToken()`(`apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/`)+ `refresh-token-used-event.handler.ts`(`apps/base-system/src/lib/bounded-contexts/iam/tokens/application/event-handlers/`)— **F10 沿用、不改**
- rust 既有 `rust-api/server/service/src/admin/events/access_token_event.rs`(`AccessTokenEvent::handle()` 寫 sys_tokens)+ `rust-api/migration/src/schemas/m20241023_091204_create_sys_tokens.rs`(16-column schema、`status: String`)— F10 沿用、視 friction 0-3 處小修

**Scope summary**:rev1 application 階段 Phase 4 **第一個** feature(W-FA1/W-FA2/W-FA3 三件套 deploy 結構完整後接續、F11/F12/F13 之前)。**verification-heavy + 視情況補 patch**:跑通 end-to-end refreshToken flow(rust `/api/auth/login` → 真 token → nginx → nestjs `/api/auth/refreshToken` → 回新 token pair → 新 token 可用),5 acceptance scenario(HTTP 層 + DB 準據驗證)。範疇刻意收緊到「**flow 跑通驗證 + 出 friction 時 rust 遷就 nestjs**」、**不動 nestjs source / 不驗 audit log / 不做 Casbin pub-sub channel / 不驗 base-web SPA e2e / 不驗 JWT shape claim assertion**。

**Commit 模式**(取決於 rust source 改動數):
- **單段** outer commit(若 rust source 0 改動 — 理想路徑、類 W-F5/W-F6/W-FA*)
- **兩段式** commit(若 rust source 1-3 改動 — per CLAUDE.md §6.1、類 F5.1/F6)

**範疇外**:
- ❌ nestjs source 任何改動(per Q2 + Q5 拍板、嚴守 DESIGN-A §3.2)— 含 `@Log` decorator / Casbin enforcer reload subscription / refreshJwtSecret 對齊改動 等等
- ❌ audit log sys_operation_log 寫入(per Q2 拍板、留 F13 rust 接手時實作)
- ❌ Casbin policy redis pub-sub channel(per Q1 拍板 implicit、DESIGN-A §3.3 描述但 F10 不做、留 F11 或不做)
- ❌ base-web SPA e2e CDP refreshToken 自動化(per Q4 拍板、F11 之後考慮)
- ❌ JWT shape claim assertion(decode + claim presence assertion、per Q4 拍板、留 F13)
- ❌ refresh token rotation 業務邏輯改寫(nestjs 既有 source 提供、F10 只驗、不改)
- ❌ sys_tokens schema 結構改動(W-FA1 已驗對齊、F10 不動 schema)
- ❌ JWT 演算法升 RS256 / key versioning(F1.2 範疇)
- ❌ rust 自實作 refresh token rotation(F13 範疇)

## Clarifications

### Session 2026-05-19(brainstorming 階段拍板、5 顯式 Q)

- **Q1**: F10 範疇拍板 — DESIGN-A §6 列 4 項 deliverable、現狀 3 項已走 W-FA*(或遇設計衝突)。F10 今只抱哪幾項? → **A: End-to-end refreshToken flow 跑通 + audit log(MVP)**。後 Q2 進一步收緊 audit。對比 Option B「+ Casbin pub-sub channel」:需改 nestjs source(訂閱 redis channel + reload enforcer)、違反 DESIGN-A §3.2 原則,且 Casbin policy 改動頻率低、ROI 低;Option C「+ Casbin TTL cache」:仍需改 nestjs source 設 TTL,雖最小侵入但破壞「nestjs source 完全不改」邊界;Option D「只驗 wire-up」:過嚴、丟失 end-to-end flow 跑通價值。

- **Q2**: F10 audit log 處理 — nestjs refreshToken endpoint 既有源未寫 sys_operation_log、要寫需改 nestjs source 1 處加 `@Log` decorator。怎麼拍? → **A: 不動 nestjs source、F10 不驗 audit**。嚴守 DESIGN-A §3.2「nestjs source 不改」。F10 acceptance 只驗 end-to-end flow 跑通、不驗 sys_operation_log。Audit 留 F13 rust 接手時實作(rust 寫動作全都達 audit、per F2.1 audit-log-infrastructure 紀律)。對比 Option B「改 nestjs source 1 處 + F10 驗 audit」:違反 §3.2 即便僅 1 處;Option C「驗 nestjs 既有隱含 audit(sys_tokens status update 本身算 audit)」:不是正規 sys_operation_log、reasoning 弱、誤導讀者。

- **Q3**: F10 是否動 rust-api source — 預期 flow 跑通可能仔 friction(JWT claim shape 不對 / refresh_token_secret 未連 / sys_tokens 查詢路徑 mismatch)。 → **A: F10 原則上不動 rust source、出 friction 才動**。F10 先驗 end-to-end flow,同時守「rust source 只為 flow 跑通必要才改」。若 JWT shape/secret 對齊並不需改、F10 是純 acceptance verify feature(類 W-FA2 wire-up 驗);若需改 1-3 處 在 F10 範疇內動、走兩段式 commit。對比 Option B「明確動 rust source」:過度假設 friction 存在;Option C「不動 rust source、出 friction 拆獨立 feature」:過嚴、F10 可能 0/5 PASS 並 sit 在 incomplete 狀態、需 follow-up,不利 single-session 完成。

- **Q4**: F10 acceptance 驗到哪一層 → **A: HTTP 層 + DB 準據驗證**。(1) curl rust /api/auth/login 拿 token (2) DB 查 sys_tokens 該 row 存在 + status=Active (3) curl /api/auth/refreshToken 帶 refresh_token → HTTP 200 + 新 token pair (4) DB 查 sys_tokens 舊 row status 變動(or 新 row 生、視 nestjs 實作) (5) 新 access_token 能呈 /api/route/getUserRoutes 返 200。~5 scenario。對比 Option B「只驗 HTTP 層」:過淺、跨服務 schema 對齊只能間接驗;Option C「+ JWT shape 驗(base64 decode + claim assertion)」:F10 仍 verification-heavy 但範疇變大、過早優化(JWT shape 細節屬 F13 rust 接手範疇);Option D「+ base-web SPA e2e」:F10 變更深、超 W-FA* 三件套即時延續範疇、應 F11 stubs 之後 + e2e 整套 feature 拆出來。

- **Q5**: F10 跑 acceptance 時出 friction、但 friction 落在 nestjs source 側(不是 rust)。怎麼拍? → **A: F10 改以 rust 遷就 nestjs 端**。rust 調 1-3 處 source(讓 nestjs 認、不動 nestjs)、全面咽「nestjs source 不改」原則。F10 成 rust-side compatibility feature、並達 commit。對比 Option B「F10 abort + 實際 friction 拆 F10.1 / F13 或 follow-up」:過嚴、F10 有可能 0/5 PASS 並 sit 在 incomplete 狀態;Option C「評估後拍板」:隱含 defer decision 會打斷 single-session flow。

- **自然推論**:**Acceptance approach 採 inline bash + `contracts/verification-commands.md`**(類 W-FA2 慣例)— rev1 application feature(F4/F5.1/F6)已建立 inline bash + contract 的慣例;F10 不是 deploy feature、不需新 deploy script(W-FA3 已是 transitional script、F14 要刪 1 個就夠、不要再加)。

- **自然推論**:**測試用 user = `Soybean`**(super admin、CLAUDE.md §5.1 列、F5.1 + F6 已用)— 對齊既有 acceptance pattern、無新 user 需求。

- **自然推論**:**stack 預設用 W-FA1 dev + track-a profile**(`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`)— F10 acceptance 必須 7 service healthy(對齊 W-FA1 baseline)、refreshToken endpoint 走 nginx → nestjs(對齊 W-FA2 wire-up)。

- **自然推論**:**friction E-4 落點預估在 JWT secret / claim shape**(rust 簽的 access_token JWT shape 不對齊 nestjs jwtService 期望)— W-FA1 implement-time 已分配 jwt_secret + refresh_token_secret 兩 secret;若實際 nestjs 用 refreshJwtSecret 而 rust 簽用 jwt_secret 簽 refresh_token、F10 需 rust 改用 refresh_token_secret。具體路徑見 Risks R-1/R-2。

- **自然推論**:**F10 命名上稱 "bridge" 但 actual deliverable 較輕**(verification + 視情況 rust patch)— 對齊 DESIGN-A §6 F10 row「refresh token rotation 跑通(過渡狀態)」核心意圖;Casbin pub-sub / audit log 等次要 deliverable per Q1/Q2 退場、留 F13。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 跑完整 end-to-end refreshToken flow(Priority: P1)🎯 MVP

operator 跑 `curl POST /api/auth/login` 拿真 token pair → 跑 `curl POST /api/auth/refreshToken` 帶 refresh_token → 回 HTTP 200 + 新 token pair → 新 access_token 呼叫 `/api/route/getUserRoutes` 仍走通。證明 rev1 跨 rust+nestjs auth chain 完整。

**Why this priority**:

F10 唯一 implementation-bearing scenario,DESIGN-A §3.2「refresh token rotation 跑通(過渡狀態)」的核心驗證。沒它 W-FA1/W-FA2/W-FA3 三件套只是 wire-up、refresh flow 仍未驗。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 用該 refresh_token 跑 refreshToken endpoint → 拿到新 access_token → 新 access_token 跑 /route/getUserRoutes 返 HTTP 200。

**Acceptance Scenarios**:

1. **Given** stack 已起(7 service healthy、含 nestjs),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code:"0000", data:{token, refreshToken, ...}}`(rust 簽、F4 對齊 envelope shape)
2. **Given** US1.1 拿到 `refreshToken`,**When** `curl -X POST -H "Content-Type: application/json" -d '{"refreshToken":"<real-token>"}' http://127.0.0.1:11080/api/auth/refreshToken`,**Then** HTTP 200 + body 含新 `token` + `refreshToken`(nestjs 簽、走 nginx TRANSITIONAL block)
3. **Given** US1.2 拿到新 `token`,**When** `curl -H "Authorization: Bearer <new-token>" http://127.0.0.1:11080/api/route/getUserRoutes`,**Then** HTTP 200 + body envelope(證 rust 認 nestjs 簽的新 token、JWT shape 跨服務 verify OK)

---

### User Story 2 — DB 準據驗證 sys_tokens 行為(Priority: P2)

F10 走完 US1 流程後查 postgres `sys_tokens` 表,確認 rust login 寫入 1 row、nestjs refreshToken 動作造成對應 row status 變動(per `refresh-token-used-event.handler.ts` 邏輯),驗證跨服務 schema 共識實際在 runtime 對齊。

**Why this priority**:

HTTP 層通不代表 DB schema 對齊。W-FA1 implement-time 觀察到 nestjs prisma `Status` PG enum vs rust SMALLINT mismatch(雖只影響 sys_user/sys_role/sys_menu、不影響 sys_tokens)、F10 須 runtime 驗 sys_tokens 雙端讀寫實際對齊。

**Independent Test**:US1 走完後分別查 sys_tokens 表 SELECT 結果、對比預期 status 狀態。

**Acceptance Scenarios**:

1. **Given** US1.1 完成,**When** `psql -h 127.0.0.1 -p 15432 -U <user> -d <db> -c "SELECT id, status FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"`,**Then** 1 row、status 值對齊 rust `TokenStatus::Active.to_string()` 預期值(per `access_token_event.rs:31`)
2. **Given** US1.2 完成,**When** `psql -c "SELECT id, status FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 2"`,**Then** 看到 status 變動(舊 row status 變為 nestjs `refresh-token-used-event.handler.ts` 設定值、或新 row 新增、視 nestjs prisma 實際寫入路徑而定)

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | refresh_token JWT exp 過期 | nestjs `jwtService.verifyAsync` throw → HTTP 401 + nestjs envelope shape;F10 acceptance 不主動構造、屬 future consideration |
| E-2 | refresh_token 不在 sys_tokens 表(偽造或被刪)| nestjs throw `NotFoundException` → HTTP 404 `Refresh token not found.`(對齊 W-FA2 observation、business 邏輯正確) |
| E-3 | refresh_token 已被用過(status=Revoked 或對應)| nestjs `tokensAggregate.refreshTokenCheck()` throw → HTTP 4xx + nestjs envelope shape;F10 acceptance 不主動構造、E-2/E-3 共同記 wire-up business 行為 |
| E-4 | rust 簽的 access_token / refresh_token JWT shape 不對齊 nestjs jwtService 期望(secret / claim / alg)| F10 acceptance US1.2 fail → 按 Q5 拍板 **rust 改 source 遷就 nestjs**(predicted 1-3 處 patch)、F10 範疇內動、走兩段式 commit |
| E-5 | rust 用 `jwt_secret` 簽 refresh_token、nestjs 用 `refresh_token_secret` 驗 | W-FA1 已分配兩 secret 在 docker-compose;F10 須驗 rust 簽 refresh_token 用哪個 secret、nestjs 驗哪個 secret;若分歧 → rust 改用 refresh_token_secret 簽 refresh_token(per Q5) |
| E-6 | sys_tokens DB 寫入失敗(DB 連線 / schema 對不上)| rust `AccessTokenEvent::handle` Error → login 整體 5xx → US1.1 fail、abort F10、surface 給 user 拆 follow-up(W-FA1 已 acceptance、極不可能發生) |

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F10 MUST 驗 end-to-end refreshToken flow:rust login → 真 token → nestjs refreshToken → 回新 token pair → 新 token 可用(per US1 3 個 AC)。
- **FR-002**: F10 MUST 驗 sys_tokens 表 runtime 雙端讀寫對齊(per US2 2 個 AC)。
- **FR-003**: F10 MUST 不動 nestjs fork source 任何檔(嚴守 DESIGN-A §3.2、per Q2 + Q5 拍板)— 包含 `apps/` / `libs/` / `prisma/` / `.github/`(若有)。
- **FR-004**: F10 MUST 不寫 / 不驗 sys_operation_log audit log(per Q2 拍板、留 F13)。
- **FR-005**: F10 MUST 不做 Casbin policy redis pub-sub channel(per Q1 implicit、留 F11 / F13 或不做)。
- **FR-006**: F10 MUST 不驗 base-web SPA e2e refreshToken 自動化(per Q4 拍板)。
- **FR-007**: F10 MUST 不驗 JWT shape claim assertion(decode + claim presence assertion、per Q4 拍板)。
- **FR-008**: F10 MAY 改 rust-api source 1-3 處(出 friction 才動、per Q3 + Q5 拍板);若 friction 落 nestjs 側、F10 改 rust 遷就(per Q5)。
- **FR-009**: F10 commit 模式:rust source 0 改動 → **單段** outer commit;rust source 1-3 改動 → **兩段式** commit(per CLAUDE.md §6.1)。
- **FR-010**: F10 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(7 service healthy、refreshToken 走 nginx TRANSITIONAL block)。
- **FR-011**: F10 MUST 用 `Soybean` user 跑 acceptance(對齊 F5.1 / F6 既有慣例、`123456` plain pwd per CLAUDE.md §5.1)。
- **FR-012**: F10 MUST 不改 W-FA1 / W-FA2 / W-FA3 既有 deploy 配置(`docker-compose*.yml` / `deploy/front-nginx/conf.d/*` / `deploy/build-nestjs.sh` / `deploy/secrets/*`)。
- **FR-013**: F10 MUST 不改 sys_tokens migration schema(W-FA1 已驗對齊、F10 不動 schema)。
- **FR-014**: F10 MUST 不改 base-web src(per Constitution Principle IV)。
- **FR-015**: F10 acceptance 用 inline bash + `contracts/verification-commands.md`(類 W-FA2 慣例)、不新建 deploy script。
- **FR-016**: F10 spec / plan / tasks 文件結構 MUST 對齊既有 application feature 規模(F5.1 / F6)— 預期 ~10-15 task。
- **FR-017**: `CLAUDE.md` §5.2.1 MAY 補 1 個 acceptance pattern curl example(視 user 偏好)。
- **FR-018**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F10、已完成里程碑加 F10 條目、application Phase 進度推進。

### Non-Functional Requirements

- **NFR-001**: F10 spec / plan / tasks 規模 SHOULD 對齊 W-FA3 等緊湊 feature(~10-15 task、~150-200 行 spec)、避免 over-engineering verification feature。
- **NFR-002**: F10 acceptance 跑時間 SHOULD ≤ 10s(5 個 curl + DB query、不含 stack 啟動)。
- **NFR-003**: F10 acceptance failure mode SHOULD 明確指 friction 落點(rust / nestjs / DB / nginx / JWT secret),便於 Q5 拍板路徑判斷。
- **NFR-004**: F10 完成標誌 SHOULD 為:US1 3/3 + US2 2/2 = **5/5 PASS** + 可能 rust source 0-3 處改動。

### Key Entities

- **rust-api `AccessTokenEvent::handle()`**(`server/service/src/admin/events/access_token_event.rs`)— **不動 by default、視 friction 改 1-3 處**(JWT 簽 secret / sys_tokens 寫入路徑 / status enum 值對齊)
- **nestjs `authentication.controller.ts::refreshToken()`**(`apps/base-system/src/api/iam/rest/`)— **不動**(per FR-003)
- **nestjs `authentication.service.ts::refreshToken()`**(同上 service path)— **不動**
- **nestjs `refresh-token-used-event.handler.ts`**(`apps/base-system/src/lib/bounded-contexts/iam/tokens/application/event-handlers/`)— **不動**
- **postgres `sys_tokens` 表**(W-FA1 已 acceptance 對齊、rust + nestjs prisma 兩端 schema 共識)— F10 runtime 驗讀寫對齊、不動 schema
- **W-FA1 stack(track-a profile)**— F10 acceptance 起的 stack(7 service)
- **W-FA2 nginx TRANSITIONAL block**— F10 refreshToken endpoint 走的 nginx route
- **W-FA3 build script `deploy/build-nestjs.sh`**— F10 跑前 build nestjs image 用

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F10 落地後跑 US1.1 → HTTP 200 + body envelope code "0000"(per F4 既有 shape)。
- **SC-002**: F10 落地後跑 US1.2 → HTTP 200 + body 含 `token` + `refreshToken`(走 nginx → nestjs、對齊 W-FA2 wire-up)。
- **SC-003**: F10 落地後跑 US1.3 → 新 access_token 呼叫 /route/getUserRoutes HTTP 200(rust 認 nestjs 簽的 token)。
- **SC-004**: F10 落地後跑 US2.1 → `psql ... sys_tokens` 查到 1 row 對應 Soybean、status=Active。
- **SC-005**: F10 落地後跑 US2.2 → `psql ... sys_tokens` 看到 refreshToken 動作後對應 row status 變動 / 新 row 生(視 nestjs 實作)。
- **SC-006**: F10 落地 commit 數 ≤ 2(若兩段式)、≤ 1(若單段);rust source 改動 LOC ≤ 30 行(per FR-008 上限)。
- **SC-007**: F10 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-003 + SC-005 對齊 W-FA1/W-FA2/W-FA3 三邊零改動延伸)。
- **SC-008**: F10 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-014)。
- **SC-009**: F10 acceptance 5/5 PASS、若 friction 觸發 rust patch 在 F10 範疇內收尾、不留 incomplete state。

## Assumptions

- **A-001**: W-FA1 / W-FA2 / W-FA3 三件套已 merge(rev1-admin-root branch 內 nestjs container 部署 + nginx TRANSITIONAL block + build script 全就位)。
- **A-002**: F5.1 已 merge(rust login flow 可走通、`AccessTokenEvent::handle` 寫 sys_tokens 已驗)。
- **A-003**: F1.1 已 merge(JWT secret + _FILE pattern 已就位、W-FA1 進一步加 `refresh_token_secret`)。
- **A-004**: F4 已 merge(rust handler response envelope shape 對齊、F10 acceptance 期 envelope `{code, data, ...}`)。
- **A-005**: nestjs prisma `SysTokens` model 與 rust `sys_tokens` migration schema 對齊(W-FA1 acceptance 已驗、F10 不重做 schema 驗)。
- **A-006**: docker daemon 已啟、stack 可用 `--profile track-a` 起(per W-FA1 quickstart)。
- **A-007**: Soybean / `123456` plaintext pwd 仍 work(W-FA1 / F5.1 / F6 已驗)。
- **A-008**: F10 acceptance 階段 surface 出的 friction 預期落 rust 側(JWT secret / claim shape / sys_tokens status enum)、不超 1-3 處(per Q3/Q5 預判)。

## Dependencies

### Inbound(本 feature 依賴)

- **W-FA1** `compose-nestjs-service`:nestjs container 起、JWT secret 共享、sys_tokens schema 對齊驗。✅(merge `b095d55`)
- **W-FA2** `nginx-track-a-transitional-block`:nginx → nestjs upstream + refreshToken endpoint 路由。✅(merge `c5b7840`)
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build automation。✅(merge `f23f38e`)
- **F1.1** `jwt-secrets`:JWT secret 共享 + _FILE pattern。✅(merge `5f82df3`)
- **F4** `response-shape-alignment`:rust handler 用 HTTP 200 + body code envelope shape。✅(merge `3d357e5`)
- **F5.1** `auth-login-and-dynamic-menu`:rust login flow + AccessTokenEvent 寫 sys_tokens。✅(merge `e71aefe`)

### Outbound(本 feature 解鎖)

- **F11** `extracted-stubs`:F10 後 nestjs 補位 endpoint 列表確認(refreshToken 走通、剩 4 條 stub 範疇可清楚定義)。
- **F12** `cleanup-job`:application Phase 4 同期、不直接依賴 F10、可並行。
- **F13** `rust-refresh-token-impl`:F10 跑通後 rust 才有「實際工作的 nestjs 版本」當對齊基準,F13 rust 補實作可以對照 F10 行為。
- **F14** `design-a-to-b-cutover`:F13 完後才動,F10 是 F14 的「行為 baseline」(F14 cutover 後 refresh flow 仍應同行為)。

## Out of Scope

- **OOS-001**: nestjs source 任何改動(audit log @Log decorator / Casbin enforcer subscribe / JWT secret 對齊 / etc)— per Q2 + Q5 拍板、嚴守 DESIGN-A §3.2。
- **OOS-002**: audit log sys_operation_log 寫入 — per Q2 拍板、留 F13 rust 接手時實作。
- **OOS-003**: Casbin policy redis pub-sub channel — per Q1 拍板 implicit、DESIGN-A §3.3 描述但 F10 不做、留 F11 或不做。
- **OOS-004**: base-web SPA e2e CDP refreshToken 自動化驗 — per Q4 拍板、F11 之後考慮。
- **OOS-005**: JWT shape claim assertion(decode + claim presence)— per Q4 拍板、留 F13。
- **OOS-006**: refresh token rotation 業務邏輯改寫 — nestjs 既有 source 提供、F10 只驗、不改。
- **OOS-007**: sys_tokens schema 結構改動 / migration 改動 — W-FA1 已驗對齊、F10 不動 schema。
- **OOS-008**: JWT 演算法升 RS256 / key versioning — F1.2 範疇、F10 不負責。
- **OOS-009**: rust 自實作 refresh token rotation — F13 範疇、F10 仍依賴 nestjs 補位。
- **OOS-010**: nginx config 改動 — W-FA2 已就位 TRANSITIONAL block、F10 不改。
- **OOS-011**: docker compose 改動 — W-FA1 已就位 nestjs service block、F10 不改。
- **OOS-012**: prisma model rebuild(sys_user/sys_role/sys_menu Status PG enum vs rust SMALLINT)— W-FA1 R-1 amendment 已避開 healthcheck endpoint、F10 不觸 PG enum、若 refreshToken cascade 查觸發 → abort + 拆 follow-up。

## Risks

- **R-1**(高機率)**JWT secret 對齊**:rust login 用 `jwt_secret` 簽 refresh_token、nestjs 用 `refreshJwtSecret`(W-FA1 mapped to `refresh_token_secret`)驗。若兩 secret 分配後 rust 沒實際用 refresh_token_secret 簽 refresh_token、F10 US1.2 fail。**緩解**:F10 acceptance 階段查 rust `LoginService` / `JwtService` 用哪個 secret 簽 refresh_token、按 Q5 改 rust 用 refresh_token_secret(1 處 small patch、走兩段式 commit)。

- **R-2**(中機率)**sys_tokens 查詢 mismatch**:nestjs `TokensByRefreshTokenQuery` 用 prisma `findUnique({where:{refreshToken:<input>}})` 查、若 rust 寫的 `refresh_token` 含 Bearer prefix 或 base64 編碼差異會找不到。**緩解**:F10 acceptance DB 準據查實際 token 字串、若有 prefix / 編碼問題 → rust 寫入路徑去 prefix(1 處 small patch)。

- **R-3**(低機率)**nestjs prisma `Status` PG enum cascade**:refreshToken 流可能 cascade 查 sys_user(找 username / domain)等用 Status enum 的表、復發 W-FA1 R-1 issue(PG 42704 type-not-exist)。**緩解**:F10 acceptance 階段監測、若觸發 → abort F10 + 升 F10.1 prisma rebuild or 改 sys_user prisma model 用 `Int @db.SmallInt`(屬 nestjs source 改動、違反 OOS-001、需 user 拍板升級)。

- **R-4**(低機率)**rust source 改動 > 3 處**:超 Q3 預期上限,代表 friction 比預期深、可能需 F10.1 拆 follow-up。**緩解**:F10 acceptance 階段如已動 > 3 處仍 fail、abort F10、改名 F10.1 jwt-shape-bridge / token-secret-bridge follow-up。

- **R-5**(極低機率)**W-FA1 stack 退化**:nestjs container 起不來 / sys_tokens DB 連不上 / nginx upstream resolver fail。**緩解**:F10 跑前先 `docker compose ps` + `docker compose logs nestjs` 確認 healthy、退化 → 回 W-FA1 SOP 故障排查、F10 不在範疇內處理 stack 起動問題。

- **R-6**(中機率)**refreshToken response shape 與 base-web 期望不對齊**:nestjs 回的 envelope `{token, refreshToken}` vs base-web 期 `{token, refreshToken}` 或 `{accessToken, refreshToken}` 名稱差異;F10 acceptance 自身 black-box 不感、但 base-web SPA 整合會炸。**緩解**:F10 只驗 nestjs response shape 含 `token` + `refreshToken` 兩 field(不驗 base-web 整合、留 follow-up)。

## Open Questions(brainstorming 階段保留、`/speckit-plan` 階段解)

- 暫無。brainstorm 5 顯式 Q 全拍板 + 5 自然推論 dovetail、無 OQ 需 plan 階段解。

---

## brainstorming session 結束

F10 範疇收緊到極致 — 是 W-FA1+W-FA2+W-FA3 三件套 deploy 結構完整後的**第一個跨服務 application 行為驗證**。設計核心是「**verification + 視 friction rust 遷就 nestjs**」、預期 5 acceptance scenario + 0-3 處 rust patch。對比 W-FA*(deploy 結構)、F5.1/F6(application 但同服務內)、F10 是首個 cross-service end-to-end 驗 feature、實作預估 ~10-15 task。

**下一步**:跑 `/speckit-specify "F10 refresh-token-nestjs-bridge ..."` 轉為正式 feature spec。
