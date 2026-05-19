# Feature Specification: F10 — refresh-token-nestjs-bridge

**Feature Branch**: `017-refresh-token-nestjs-bridge`
**Created**: 2026-05-19
**Status**: Draft
**Input**: User description: "F10 refresh-token-nestjs-bridge — application Phase 4 第一個 feature、Track DESIGN-A 三件套 deploy 結構完整後接續、end-to-end refreshToken flow 跑通(HTTP 層 + DB 準據驗證 5 acceptance scenario);不動 nestjs source、不驗 audit log、不做 Casbin pub-sub、視 friction rust 0-3 處 patch"

**Source**: [`docs/superpowers/017-feature-refresh-token-nestjs-bridge.md`](../../docs/superpowers/017-feature-refresh-token-nestjs-bridge.md)(brainstorming 2026-05-19 session、5 顯式拍板 Q + 5 自然推論)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 line 378(F10 scope 描述:nestjs container 部署 + sys_tokens schema 共識 + nginx TRANSITIONAL block + Casbin policy redis pub-sub channel + refresh token rotation 跑通)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.2「nestjs source **不改**,只用既有 build artifact / docker image」— F10 嚴守
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.3 sys_tokens 表共識(rust 主導 migration、nestjs prisma 對齊)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork repo 完全零改動;Principle V「漸進收縮」— F10 過渡角色)
- 既有 W-FA1 落地的 nestjs container + JWT secret _FILE pattern + sys_tokens schema 對齊驗(per [`specs/014-compose-nestjs-service/spec.md`](../014-compose-nestjs-service/spec.md))
- 既有 W-FA2 落地的 nginx TRANSITIONAL block + variable proxy_pass + lazy DNS(per [`specs/015-nginx-track-a-transitional-block/spec.md`](../015-nginx-track-a-transitional-block/spec.md))
- 既有 W-FA3 落地的 nestjs image build script(per [`specs/016-cicd-nestjs-build-job/spec.md`](../016-cicd-nestjs-build-job/spec.md))
- 既有 F5.1 落地的 rust login flow + `AccessTokenEvent::handle()` 寫 sys_tokens(per [`specs/005-auth-login-and-dynamic-menu/spec.md`](../005-auth-login-and-dynamic-menu/spec.md))
- 既有 F1.1 落地的 JWT secret 共享 + _FILE pattern(per [`specs/004-jwt-secrets/spec.md`](../004-jwt-secrets/spec.md))
- 既有 F4 落地的 response shape 對齊(per [`specs/001-response-shape-alignment/spec.md`](../001-response-shape-alignment/spec.md))
- nestjs 既有 `authentication.controller.ts::refreshToken()`(`apps/base-system/src/api/iam/rest/`)+ `authentication.service.ts::refreshToken()`(`apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/`)+ `refresh-token-used-event.handler.ts`— **F10 沿用、不改**
- rust 既有 `rust-api/server/service/src/admin/events/access_token_event.rs`(`AccessTokenEvent::handle()` 寫 sys_tokens)+ `rust-api/migration/src/schemas/m20241023_091204_create_sys_tokens.rs`(16-column schema、`status: String`)— F10 沿用、視 friction 0-3 處小修

**Scope summary**:rev1 application 階段 Phase 4 **第一個** feature(W-FA1/W-FA2/W-FA3 三件套 deploy 結構完整後接續、F10.1/F10.2/F11/F12/F13 之前)。

**Plan 階段 research surface 雙端格式 + enum 字串不對齊**(per Plan Phase 0 R-7/R-8 finding、超 spec brainstorm Q3「1-3 處 rust patch」上限),user 拍板 **Option A:F10 scope reset 為 wire-up + friction 紀錄 feature**(0 rust patch、acceptance 改 expected fail at friction 第一發生點 + 紀錄 friction 落點;rust patch 工作拆 F10.1 rust-jwt-refresh-token-signing + F10.2 rust-tokenstatus-string-align 兩 follow-up)。

**F10 重設後核心** = 紀錄跨服務 wire-up 行為 baseline(rust login 寫 sys_tokens / nginx 走 nestjs route)+ 紀錄 friction 落點 + 拆 F10.1/F10.2 follow-up 範疇定義,**不負責跑通 end-to-end flow**(那是 F10.1+F10.2 之後的事)。範疇刻意收緊到「**wire-up 紀錄 + friction surface + follow-up 範疇定義**」、**0 rust patch / 0 nestjs source 改動 / 不驗 audit log / 不做 Casbin pub-sub channel / 不驗 base-web SPA e2e / 不驗 JWT shape claim assertion**。

**Commit 模式**(post Plan Option A — F10 reset 後固定):
- **單段** outer commit(類 W-F5/W-F6/W-FA*、固定 0 rust patch)

**範疇外**:
- ❌ nestjs source 任何改動(audit log @Log decorator / Casbin enforcer reload subscription / refreshJwtSecret 對齊改動 等等、per Q2 + Q5 拍板、嚴守 DESIGN-A §3.2)
- ❌ audit log sys_operation_log 寫入(per Q2 拍板、留 F13 rust 接手時實作)
- ❌ Casbin policy redis pub-sub channel(per Q1 implicit、DESIGN-A §3.3 描述但 F10 不做、留 F11 或不做)
- ❌ base-web SPA e2e CDP refreshToken 自動化驗(per Q4 拍板、F11 之後考慮)
- ❌ JWT shape claim assertion(decode + claim presence assertion、per Q4 拍板、留 F13)
- ❌ refresh token rotation 業務邏輯改寫(nestjs 既有 source 提供、F10 只驗、不改)
- ❌ sys_tokens schema 結構改動(W-FA1 已驗對齊、F10 不動 schema)
- ❌ JWT 演算法升 RS256 / key versioning(F1.2 範疇)
- ❌ rust 自實作 refresh token rotation(F13 範疇)
- ❌ nginx config / docker compose 改動(W-FA* 已就位、F10 不改)

## Clarifications

### Session 2026-05-19(brainstorming 階段拍板、5 顯式 Q + 5 自然推論)

- **Q1**: F10 範疇拍板 — DESIGN-A §6 列 4 項 deliverable、現狀 3 項已走 W-FA*(或遇設計衝突)。F10 今只抱哪幾項? → **A: End-to-end refreshToken flow 跑通 + audit log(MVP)**。後 Q2 進一步收緊 audit。
- **Q2**: F10 audit log 處理 — nestjs refreshToken endpoint 既有源未寫 sys_operation_log、要寫需改 nestjs source 1 處加 `@Log` decorator。怎麼拍? → **A: 不動 nestjs source、F10 不驗 audit**。嚴守 DESIGN-A §3.2。Audit 留 F13。
- **Q3**: F10 是否動 rust-api source — 預期 flow 跑通可能出 friction(JWT claim shape 不對 / refresh_token_secret 未連 / sys_tokens 查詢路徑 mismatch)。 → **A: F10 原則上不動 rust source、出 friction 才動**。若需改 1-3 處 在 F10 範疇內動、走兩段式 commit。
- **Q4**: F10 acceptance 驗到哪一層? → **A: HTTP 層 + DB 準據驗證**(5 scenario)。
- **Q5**: F10 跑 acceptance 時出 friction、但 friction 落在 nestjs source 側(不是 rust)。怎麼拍? → **A: F10 改以 rust 遷就 nestjs 端**。rust 調 1-3 處 source(讓 nestjs 認、不動 nestjs)、全面咽「nestjs source 不改」原則。

- **自然推論**:Acceptance approach 採 inline bash + `contracts/verification-commands.md`(類 W-FA2 慣例)— F10 不是 deploy feature、不需新 deploy script。
- **自然推論**:測試用 user = `Soybean`(super admin、CLAUDE.md §5.1 列、F5.1 + F6 已用)。
- **自然推論**:stack 預設用 W-FA1 dev + `--profile track-a`(7 service healthy + refreshToken 走 nginx → nestjs)。
- **自然推論**:friction 落點預估在 JWT secret / claim shape(R-1 主要風險)— W-FA1 已分配兩 secret;若實際 nestjs 用 refreshJwtSecret 而 rust 簽用 jwt_secret 簽 refresh_token、F10 需 rust 改用 refresh_token_secret。
- **自然推論**:F10 命名稱 "bridge" 但實 deliverable 較輕(verification + 視情況 rust patch)— 對齊 DESIGN-A §6 F10 row「refresh token rotation 跑通(過渡狀態)」核心意圖;Casbin pub-sub / audit log 等次要 deliverable 退場、留 F13。

- **Q (clarify-2026-05-19)**: US2.2 acceptance 對 sys_tokens status 變動的 assertion 策略 → **A: Loose assert**。SQL `WHERE status != 'Active' OR created_at > <login_time>` count ≥ 1、不 hard-code 預期 status 字串值。理由:spec 與 nestjs source 保持 decoupled(per DESIGN-A §3.2 + Q2「不動 nestjs source」延伸)、若 nestjs upstream rebase 改 status enum 值、F10 spec 不需同步。

### Session 2026-05-19(plan 階段 Phase 0 research findings + Option A 拍板)

- **Finding (plan-2026-05-19 R-7)**: rust `TokenStatus` enum `SCREAMING_SNAKE_CASE` 序列化(`"ACTIVE"` / `"REFRESHED"` / `"REVOKED"`)vs nestjs `TokenStatus` enum lowercase(`"unused"` / `"used"`)、字串值完全不對齊。衝擊:nestjs `tokens.entity.ts::refreshTokenCheck()` 對 rust 寫的 `"ACTIVE"` row throw `'Token has already been used.'`。
- **Finding (plan-2026-05-19 R-8)**: rust `sys_auth_service.rs` 簽 refresh_token 用 `Ulid::new().to_string()`(26-char 明文 Ulid、無 JWT 簽)vs nestjs `authentication.service.ts::refreshToken()` 用 `jwtService.verifyAsync(refreshToken, refreshJwtSecret)` 期 JWT。衝擊:nestjs verifyAsync 對 rust 寫的 Ulid 字串 throw、根本不 reach refreshTokenCheck。
- **Plan finding aggregation**: research 估 rust source 改動 5-9 處(refresh_token JWT 化 3 處 + TokenStatus enum 對齊 2-3 處 + JWT claim shape 對齊 0-2 處 + schema column types 0-1 處)、超 brainstorm Q3 1-3 處上限、觸發 R-4 abort path。
- **Plan Option A (拍板)**: F10 scope reset 為 wire-up + friction 紀錄 feature(0 rust patch、acceptance 改 expected fail at friction 第一發生點 + 紀錄 friction 落點),rust patch 工作拆 **F10.1 rust-jwt-refresh-token-signing**(refresh_token Ulid → JWT、3 處 rust)+ **F10.2 rust-tokenstatus-string-align**(enum 字串值對齊、2-3 處 rust)兩 follow-up。對比 Option B「回 /speckit-clarify 重評 Q3」/ Option C「F10 內動 5-9 處 + spec patch」:Option A 保 brainstorm Q3 上限不變、各 follow-up 緊湊、F10 自身仍有 wire-up baseline 紀錄價值。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 跑 wire-up + 紀錄 friction 落點(Priority: P1)🎯 MVP

operator 跑 `curl POST /api/auth/login` 拿 rust 寫的 sys_tokens row 對應 refresh_token → 跑 `curl POST /api/auth/refreshToken` 帶 refresh_token → **預期 nestjs throw + HTTP 4xx/5xx**(因 R-7 / R-8 雙端 mismatch)→ 紀錄 friction 落點(nestjs 哪段 throw、log 哪行)。證明跨服務 wire-up(nginx → nestjs)接通、friction 落點明確、F10.1/F10.2 follow-up 範疇可定義。

**Why this priority**:F10 唯一 implementation-bearing scenario(post-Option A)。沒此 acceptance、F10.1/F10.2 follow-up 範疇無法 ground、deploy 結構 vs application 邏輯整合層的 baseline 不留紀錄。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 用該 refresh_token 跑 refreshToken endpoint → 預期 nestjs throw + HTTP 4xx/5xx + friction 落點可 grep nestjs log 確認。

**Acceptance Scenarios**:

1. **Given** stack 已起(7 service healthy、含 nestjs),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code:"0000", data:{token, refreshToken, ...}}`(rust 簽、F4 對齊 envelope shape;**不變、rust login 本身 work**)
2. **Given** US1.1 拿到 `refreshToken`,**When** `curl -X POST -H "Content-Type: application/json" -d '{"refreshToken":"<real-token>"}' http://127.0.0.1:11080/api/auth/refreshToken`,**Then** HTTP **非 200**(預期 4xx/5xx);nestjs container log 含 `JsonWebTokenError: jwt malformed` 或 `'Token has already been used.'` 訊息(per R-7 / R-8 surface 點、證 friction 落 nestjs verify 階段)
3. **Given** US1.2 拿到 nestjs throw,**When** 紀錄 friction 落點(`docker compose logs nestjs --tail=50` grep 結果)、寫入 `quickstart.md` 故障排查段,**Then** F10.1 / F10.2 follow-up 範疇可參考此 baseline 設計 acceptance

---

### User Story 2 — DB 準據驗證 rust login 寫 sys_tokens(Priority: P2)

F10 走完 US1 流程後查 postgres `sys_tokens` 表,確認 rust login 寫入 1 row、status 對齊 rust `TokenStatus::Active` 預期值。**post-Option A**:US2.2(refreshToken 後變動驗)不再驗(因 nestjs verify 階段 throw、根本不 reach sys_tokens update;留 F10.1+F10.2 之後再加 US 驗 status 變動)。

**Why this priority**:rust login 寫 sys_tokens 是 wire-up baseline(rust 端內 self-consistent)、F10 acceptance 階段必驗以證 rust 端工作正常、friction 純落 cross-impl 對齊(R-7/R-8)而非 rust 端 bug。

**Independent Test**:US1.1 走完後查 sys_tokens 表、對 rust TokenStatus::Active 期望值對齊。

**Acceptance Scenarios**:

1. **Given** US1.1 完成,**When** `psql -h 127.0.0.1 -p 15432 -U <user> -d <db> -c "SELECT id, status FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"`,**Then** 1 row、status = `"ACTIVE"`(對齊 rust `TokenStatus::Active.to_string()` SCREAMING_SNAKE_CASE serialization、per `access_token_event.rs:30` + `consts.rs:5-13`、證 R-7 finding 來源屬實)

---

---

### User Story 3 — 拆 F10.1 + F10.2 follow-up 範疇(Priority: P2)

F10 acceptance 走完後、`quickstart.md` 故障排查段紀錄 friction 落點 + F10.1 / F10.2 follow-up 範疇定義 + rust source 預估改動處數。讓後續 F10.1/F10.2 feature brainstorm 階段有 ground 可參考。

**Why this priority**:F10 = wire-up baseline + follow-up 起點。沒 US3、F10.1/F10.2 范圍模糊、可能重做 Phase 0 research。

**Acceptance Scenarios**:

1. **Given** US1 + US2 完成,**When** F10 quickstart 故障排查段 + INTEGRATION-CHECKLIST.md F10 row 落地,**Then** 含明確 F10.1(refresh_token JWT 簽、3 處 rust)+ F10.2(TokenStatus enum 對齊、2-3 處 rust)+ 兩 follow-up 預估解鎖 條件 ground

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

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F10 MUST 驗 wire-up baseline + 紀錄 friction 落點(per US1 3 個 AC、post-Option A reset、US1.2 改 expected fail with friction surface);**不**負責跑通 end-to-end refreshToken flow(那是 F10.1+F10.2 之後)。
- **FR-002**: F10 MUST 驗 rust login 寫 sys_tokens 為 `"ACTIVE"`(per US2 1 個 AC、post-Option A reset、rust 端 self-consistent 驗、不驗跨服務 sys_tokens 變動)。
- **FR-002b**: F10 MUST 在 `quickstart.md` 故障排查段 + INTEGRATION-CHECKLIST.md F10 row 紀錄 F10.1 / F10.2 follow-up 範疇(per US3 1 AC)。
- **FR-003**: F10 MUST 不動 nestjs fork source 任何檔(嚴守 DESIGN-A §3.2、per Q2 + Q5 拍板)— 包含 `apps/` / `libs/` / `prisma/` / `.github/`(若有)。
- **FR-004**: F10 MUST 不寫 / 不驗 sys_operation_log audit log(per Q2 拍板、留 F13)。
- **FR-005**: F10 MUST 不做 Casbin policy redis pub-sub channel(per Q1 implicit、留 F11 / F13 或不做)。
- **FR-006**: F10 MUST 不驗 base-web SPA e2e refreshToken 自動化(per Q4 拍板)。
- **FR-007**: F10 MUST 不驗 JWT shape claim assertion(decode + claim presence assertion、per Q4 拍板)。
- **FR-008**: F10 MUST 不改 rust-api source(post-Option A reset、原 brainstorm Q3 1-3 處上限被 plan Phase 0 R-7/R-8 surface 推翻、改拆 F10.1 + F10.2 follow-up)。
- **FR-009**: F10 commit 模式 = **單段** outer commit(post-Option A、固定 0 rust patch、無 worktree 動)。
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

- **SC-001**: F10 落地後跑 US1.1 → HTTP 200 + body envelope code "0000"(per F4 既有 shape、rust login 仍 work)。
- **SC-002**: F10 落地後跑 US1.2 → HTTP **非 200**(預期 4xx/5xx)+ nestjs container log 含 R-7/R-8 friction 訊息(`JsonWebTokenError` / `'Token has already been used.'`/ `NotFoundException` 之一、表 friction 落 nestjs verify 階段)。
- **SC-003**: F10 落地後跑 US1.3 → 紀錄 nestjs friction 落點到 `quickstart.md` 故障排查段(替代原 US1.3 新 access_token 驗、因 US1.2 不會 produce 新 token、原 SC-003 不再 applicable)。
- **SC-004**: F10 落地後跑 US2.1 → `psql ... sys_tokens` 查到 1 row 對應 Soybean、status = `"ACTIVE"`(對齊 rust SCREAMING_SNAKE_CASE、證 R-7 finding source 屬實)。
- **SC-005**: F10 落地 quickstart 含 F10.1 + F10.2 follow-up 範疇定義 + INTEGRATION-CHECKLIST.md F10 row 列 F10.1 / F10.2 outbound dependency(per US3)。
- **SC-006**: F10 落地 commit 數 = 1(單段 outer commit、固定 0 rust patch、per FR-009 post-Option A)。
- **SC-007**: F10 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-003 + 對齊 W-FA1/W-FA2/W-FA3 三邊零改動延伸)。
- **SC-008**: F10 不動 base-web src + 不動 rust-api worktree(`git diff HEAD -- base-web/src/ rust-api/` 無輸出、per FR-008 + FR-014 post-Option A)。
- **SC-009**: F10 acceptance 5 個 scenario(US1 3 + US2 1 + US3 1)完整 surface 2 個 critical friction(R-7 TokenStatus enum mismatch + R-8 refresh_token 格式 mismatch、各 quickstart 故障排查段紀錄)、F10.1/F10.2 follow-up 範疇明確、無 incomplete state(F10 自身完成、follow-up 兩個各拆獨立 feature)。

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

- **F10.1** `rust-jwt-refresh-token-signing`(post-Option A 新 follow-up):rust `sys_auth_service.rs` 改 `refresh_token: Ulid::new().to_string()` → 用 JWT 簽(refresh_secret + exp claim、預估 3 處 rust patch、走兩段式 commit)。F10 acceptance 紀錄 friction R-8 為 F10.1 source。
- **F10.2** `rust-tokenstatus-string-align`(post-Option A 新 follow-up):rust `TokenStatus` enum 對齊 nestjs lowercase(預估 2-3 處 rust patch、可能加 `Unused` variant 或改 serialize_all、走兩段式 commit)。F10 acceptance 紀錄 friction R-7 為 F10.2 source。
- **F11** `extracted-stubs`:F10.1+F10.2 後 nestjs 補位 endpoint 列表確認(refreshToken 走通、剩 4 條 stub 範疇可清楚定義)。
- **F12** `cleanup-job`:application Phase 4 同期、不直接依賴 F10、可並行。
- **F13** `rust-refresh-token-impl`:F10.1+F10.2 跑通後 rust 才有「實際工作的 nestjs 版本」當對齊基準、F13 rust 補實作可以對照行為。
- **F14** `design-a-to-b-cutover`:F13 完後才動,F10.1+F10.2 共構成 F14 的「行為 baseline」。

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

- **R-3**(極低機率、plan Phase 0 R-Q1 已確認無 cascade 觸發路徑)**nestjs prisma `Status` PG enum cascade**:refreshToken 流理論上可能 cascade 查 sys_user(找 username / domain)等用 Status enum 的表、復發 W-FA1 R-1 issue(PG 42704 type-not-exist);實際 plan Phase 0 research 證實 nestjs `authentication.service.ts::refreshToken()` 完整 flow 不 cascade 查 sys_user / sys_role / sys_menu(只查 sys_tokens 一表),R-3 觸發路徑 = 無、保留條目作為設計 review 紀錄。**緩解**:若未來 nestjs upstream rebase 改 refreshToken 邏輯引入 cascade、F10 acceptance 階段監測;若觸發 → abort F10 + 升 F10.1 prisma rebuild or 改 sys_user prisma model 用 `Int @db.SmallInt`(屬 nestjs source 改動、違反 OOS-001、需 user 拍板升級)。

- **R-4**(低機率)**rust source 改動 > 3 處**:超 Q3 預期上限,代表 friction 比預期深、可能需 F10.1 拆 follow-up。**緩解**:F10 acceptance 階段如已動 > 3 處仍 fail、abort F10、改名 F10.1 jwt-shape-bridge / token-secret-bridge follow-up。

- **R-5**(極低機率)**W-FA1 stack 退化**:nestjs container 起不來 / sys_tokens DB 連不上 / nginx upstream resolver fail。**緩解**:F10 跑前先 `docker compose ps` + `docker compose logs nestjs` 確認 healthy、退化 → 回 W-FA1 SOP 故障排查、F10 不在範疇內處理 stack 起動問題。

- **R-6**(中機率)**refreshToken response shape 與 base-web 期望不對齊**:nestjs 回的 envelope `{token, refreshToken}` vs base-web 期 `{token, refreshToken}` 或 `{accessToken, refreshToken}` 名稱差異;F10 acceptance 自身 black-box 不感、但 base-web SPA 整合會炸。**緩解**:F10 只驗 nestjs response shape 含 `token` + `refreshToken` 兩 field(不驗 base-web 整合、留 follow-up)。

- **R-7**(已 surface、plan 階段 confirmed)**TokenStatus 字串值 mismatch**:rust `TokenStatus` enum SCREAMING_SNAKE_CASE(`"ACTIVE"` / `"REFRESHED"` / `"REVOKED"`)vs nestjs `TokenStatus` enum lowercase(`"unused"` / `"used"`)、完全不對齊。**衝擊**:nestjs `tokens.entity.ts::refreshTokenCheck()` 對 rust 寫的 `"ACTIVE"` row throw `'Token has already been used.'`。**緩解**:**F10.2 rust-tokenstatus-string-align follow-up**(rust enum serialize_all 對齊 nestjs OR 加 `Unused` variant、2-3 處 rust patch)。F10 自身範疇內僅 surface 紀錄、不修。

- **R-8**(已 surface、plan 階段 confirmed)**refresh_token 格式 mismatch**:rust `sys_auth_service.rs` 簽 refresh_token 用 `Ulid::new().to_string()`(26-char 明文 Ulid、非 JWT)vs nestjs `authentication.service.ts::refreshToken()` 用 `jwtService.verifyAsync(refreshToken, refreshJwtSecret)` 期 JWT 含 exp 等 claims、用 REFRESH_TOKEN_SECRET envvar 驗。**衝擊**:nestjs verifyAsync 對 rust Ulid 直接 throw `JsonWebTokenError: jwt malformed`、根本不 reach refreshTokenCheck。**緩解**:**F10.1 rust-jwt-refresh-token-signing follow-up**(rust `sys_auth_service.rs` 改 Ulid → JWT 簽 + JwtConfig 加 refresh_secret field + LoginService 用 refresh_secret 簽 refresh_token、預估 3 處 rust patch)。F10 自身範疇內僅 surface 紀錄、不修。
