# Feature Specification: F10.1 — rust-jwt-refresh-token-signing

**Feature Branch**: `018-rust-jwt-refresh-token-signing`
**Created**: 2026-05-19
**Status**: Draft
**Input**: User description: "F10.1 — rust 簽 refresh_token 從 Ulid 字串改為 HS256 JWT(極簡 RefreshClaims:sub+exp+iat+nbf+jti+iss),用 W-FA1 既有 refresh_token_secret docker secret + APP_JWT_REFRESH_SECRET_FILE _FILE pattern。解 F10 acceptance surface 的 R-8 friction(nestjs jwtService.verifyAsync 對 Ulid throw `JsonWebTokenError: jwt malformed`)。Application Phase 4 第二個 feature。"

**Source**: [`docs/superpowers/018-feature-rust-jwt-refresh-token-signing.md`](../../docs/superpowers/018-feature-rust-jwt-refresh-token-signing.md)(brainstorming 2026-05-19 session、1 顯式拍板 Q + 7 自然推論 + 1 Explore agent evidence collection)

**Authoritative parents**:
- [`specs/017-refresh-token-nestjs-bridge/spec.md`](../017-refresh-token-nestjs-bridge/spec.md)(F10 spec、Plan Option A 拆出 F10.1)
- [`specs/017-refresh-token-nestjs-bridge/quickstart.md`](../017-refresh-token-nestjs-bridge/quickstart.md) §F10.1 follow-up(F10 acceptance 階段 pre-written 範疇)
- F10 acceptance T022 + T030 evidence(R-8 friction surface 屬實:`refresh_token` = Ulid 26 char、nestjs throw `JsonWebTokenError: jwt malformed`)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.2「nestjs source **不改**,只用既有 build artifact / docker image」(F10.1 嚴守、改 rust 遷就 nestjs)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 application Phase 4(F10/F10.1/F10.2 series)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork 完全零改動;Principle V「漸進收縮」— F10.1 修 friction 屬過渡)
- 既有 W-FA1 落地的 `refresh_token_secret` Docker secret + nestjs entrypoint 讀取(per [`specs/014-compose-nestjs-service/spec.md`](../014-compose-nestjs-service/spec.md))
- 既有 F1.1 落地的 `secret_loader.rs::load_secret_from_file_if_set` generic helper + `_FILE > bare envvar > yaml` precedence chain(per [`specs/004-jwt-secrets/spec.md`](../004-jwt-secrets/spec.md))
- 既有 F4 落地的 envelope shape 對齊(per [`specs/001-response-shape-alignment/spec.md`](../001-response-shape-alignment/spec.md))
- 既有 F5.1 落地的 rust login flow + `AccessTokenEvent::handle()` 寫 sys_tokens(per [`specs/005-auth-login-and-dynamic-menu/spec.md`](../005-auth-login-and-dynamic-menu/spec.md))
- rust 既有 `rust-api/server/service/src/admin/sys_auth_service.rs::generate_auth_output()` line 337-360(refresh_token Ulid 賦值 line 358)— F10.1 主要改動點
- rust 既有 `rust-api/server/core/src/web/jwt.rs::JwtUtils::generate_token()` line 49-74(HS256 + KEYS global)— F10.1 加 `generate_refresh_token` 鏡像實作
- rust 既有 `rust-api/server/config/src/model/jwt_config.rs::JwtConfig`(3 field)— F10.1 加 2 field(`refresh_secret`、`refresh_expire`)
- rust 既有 `rust-api/server/config/src/secret_loader.rs::apply_jwt_secret_hardening`(_FILE 載入)— F10.1 extend 處理 `APP_JWT_REFRESH_SECRET_FILE`
- nestjs 既有 `authentication.service.ts::refreshToken()` line 38-81(`jwtService.verifyAsync(refreshToken, { secret: refreshJwtSecret })` 期 HS256 JWT、只驗 signature 不讀 payload)— F10.1 對齊驗證點

**Scope summary**:rev1 application 階段 Phase 4 **第二個** feature(F10 wire-up + friction surface 後接續、F10.2 之前)。**修 R-8**:rust `AuthOutput.refresh_token` 從 `Ulid::new().to_string()`(26 char 明文)→ **HS256 JWT**(極簡 `RefreshClaims` struct:sub + exp + iat + nbf + jti + iss、用 `refresh_secret` + `refresh_expire=7200s` 簽)。落地後 nestjs `jwtService.verifyAsync` PASS、進入 `refreshTokenCheck` 階段、**R-7 friction 預期 surface(F10.2 修)**。範疇刻意收緊到「**rust refresh_token JWT 簽署 wire-up**」、**不動 nestjs source / 不改 sys_tokens schema / 不對齊 status enum(R-7 屬 F10.2)/ 不驗 base-web e2e / 不升 RS256**。

**Commit 模式**(post brainstorm 拍板 — F10.1 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F5.1/F6):rust-api worktree 1 commit + outer 1-2 commit(spec docs + `docker-compose.yml` wire + SHA pin)

**範疇外**:
- ❌ nestjs source 任何改動(嚴守 DESIGN-A §3.2 + F10 Q2/Q5 延伸)
- ❌ rust `TokenStatus` enum 字串值對齊(R-7 friction、留 F10.2 rust-tokenstatus-string-align)
- ❌ sys_tokens schema 結構改動(W-FA1 已驗對齊、F10.1 不動 schema)
- ❌ JWT 演算法升 RS256 / key versioning(F1.2 範疇)
- ❌ rust 自驗 refresh_token(F13 範疇 — F10.1 只簽不驗)
- ❌ rust 自實作 refresh token rotation(F13 範疇)
- ❌ base-web SPA e2e refreshToken 自動化驗(F11 之後)
- ❌ JWT claim presence assertion(decode + claim assertion、F13)
- ❌ Casbin policy redis pub-sub channel(F11 或不做)
- ❌ audit log sys_operation_log(F13)
- ❌ nestjs `REFRESH_TOKEN_EXPIRE_IN=7200` 偏短調整(改 nestjs config = 動 nestjs source、F10.1 對齊使用)
- ❌ refresh_secret rotation / key rolling(F1.2 或之後)

## Clarifications

### Session 2026-05-19(brainstorming 階段拍板、1 顯式 Q + 7 自然推論 + 1 evidence collection)

- **Q1**: refresh_token JWT claim shape — 重用既有 `Claims` struct 還是新極簡 struct? → **A:極簡新 struct `RefreshClaims`**(`sub: String`(= user_id)、`exp: usize`、`iat: usize`、`nbf: usize`、`jti: String`、`iss: String`、共 6 field)。理由:nestjs `verifyAsync` 不讀 payload(後續從 DB tokenDetails 查 username/domain)、只驗 signature 與 exp;refresh token 內不含 role/org 是 security 紀律(refresh token 不該攜 authorization claim);新 struct ~30 LOC 多但語意明確。對比 Option D「重用 Claims 但 strip role/org」:仍含 audience field、語意模糊;Option A「重用 Claims」:role_codes / organization_name 等 authorization 資訊不該入 refresh token;Option C「對齊 nestjs payload `{ uid, username, domain }`」:nestjs verify 不讀 payload、對齊只是 aesthetic、收益小於 minimum struct 紀律。

- **自然推論 N-1(secret 分離)**:rust refresh_token 用獨立 `refresh_secret` 簽,W-FA1 已 wire 進 docker-compose(`refresh_token_secret` Docker secret + nestjs entrypoint 讀 `/run/secrets/refresh_token_secret` export `REFRESH_TOKEN_SECRET`、空檔 fallback `$JWT_SECRET`)。F10.1 rust-api service 加 `APP_JWT_REFRESH_SECRET_FILE: /run/secrets/refresh_token_secret`(+ secret ref),同 fallback 語意:**rust secret_loader 偵測 _FILE 路徑為 empty file(trim 後)→ fallback 用 `jwt_secret` 同 value**(per clarify Q1、mirror nestjs entrypoint)。dev workflow 不變(file 留空即可)、rust/nestjs 兩端 secret 鏈完全對齊;prod 兩端讀同一 non-empty file。

- **自然推論 N-2(refresh_expire 值)**:refresh_expire = `7200`(秒、2 小時)。對齊 nestjs `REFRESH_TOKEN_EXPIRE_IN=7200`(docker-compose line 235),避免 rust JWT exp 超 nestjs 驗證內隱期限。7200s 本身是 nestjs config 偏短的選擇、非 F10.1 範疇調(改 nestjs config = 動 nestjs source、違反 OOS-001 + OOS-011)。

- **自然推論 N-3(algorithm)**:HS256(沿用 rust `Header::default()` + nestjs `jwtService` 預設、F1.2 升 RS256 範疇)。

- **自然推論 N-4(測試 user)**:`Soybean`(super admin、對齊 CLAUDE.md §5.1 + F5.1/F6/F10 既有 acceptance pattern)。

- **自然推論 N-5(stack)**:W-FA1 dev + `--profile track-a`(7 service healthy、refreshToken 走 nginx → nestjs)— F10.1 acceptance 在此 stack 跑。

- **自然推論 N-6(acceptance approach)**:inline bash + `contracts/verification-commands.md`(類 F10 / W-FA2 慣例)— F10.1 不是 deploy feature、無新 deploy script。預估 7 個 C-V(類 F10 acceptance scope)。

- **自然推論 N-7(R-7 仍 surface)**:F10.1 落地後 nestjs verify PASS、進入 `refreshTokenCheck()`、對 rust 寫的 `status="ACTIVE"` throw `'Token has already been used.'`。**R-7 friction 在 F10.1 acceptance 階段預期 surface**(C-V3:HTTP 4xx with R-7 message)、是 F10.2 修點。F10.1 acceptance 期 R-8 fix verified + R-7 newly surfaced(F10 R-8 → F10.1 R-7)。

- **Evidence collection 2026-05-19**(Explore agent driven):
  - rust `sys_auth_service.rs::generate_auth_output()` line 337-360,refresh_token Ulid 賦值 line 358。
  - rust `JwtUtils::generate_token()` jwt.rs line 49-74,HS256 + `KEYS` global(`encoding key` 從 `config.jwt_secret.as_bytes()` 建)+ exp/iss/iat/nbf/jti claim setter。
  - `JwtConfig` jwt_config.rs line 20-30,3 field(jwt_secret / issuer / expire),secret loading 透過 `secret_loader.rs::load_secret_from_file_if_set(base_envvar)` generic helper、precedence `_FILE > bare envvar > yaml`。
  - `docker-compose.yml` line 213-241 nestjs service(W-FA1 加)+ line 284-285 `refresh_token_secret` Docker secret;`deploy/secrets/refresh_token_secret.txt.example` 4 行說明(空檔 → fallback JWT_SECRET、per W-FA1 spec FR-005 / E-1)。
  - nestjs `authentication.service.ts::refreshToken()` line 38-81,`jwtService.verifyAsync(tokenDetails.refreshToken, { secret: securityConfig.refreshJwtSecret })`(只驗 signature、不讀 payload)+ verify 後從 DB tokenDetails 取 username/domain。

### Session 2026-05-19(clarify 階段)

- **Q1 (clarify)**: rust 對 empty `refresh_token_secret.txt` 該採何種 fallback 策略? → **A:secret_loader 偵測 empty file(after trim)→ fallback 用 `jwt_secret` 同 value(mirror nestjs entrypoint sh `${RTS:-$JWT_SECRET}` 設計)**。理由:dev workflow 不變(file 留空即可)、rust 與 nestjs 兩端 fallback 行為對稱、無需手動維護 yaml `refresh_secret` 預設值與 `jwt_secret` 預設值同步、最少友善 dev 環境。對比:Option B(yaml 預設 sync)易腐爛;Option C(強制 dev 填 secret)偏離 W-FA1 既有空檔可用設計;Option D(放棄 dev acceptance)defeats F10.1 purpose。此決策**修正 N-1 + E-1 描述**(N-1 原寫「fallback application.yaml refresh_secret 預設」、E-1 原寫「dev 兩端可能用不同 secret 來源」),改為:dev 兩端對齊 `jwt_secret`、prod 兩端讀同一個 non-empty `refresh_token_secret`。

- **Q2 (clarify)**: `RefreshClaims` struct 是否應包含 `aud`(audience)field? → **A:不含 aud**(維持 6 field 極簡 struct:`sub`/`exp`/`iat`/`nbf`/`jti`/`iss`)。理由:(1) nestjs `jwtService.verifyAsync(refreshToken, { secret })` 不傳 `audience` option(line 47-49 verbatim)、value 無意義;(2) refresh token industry best practice 不攜 audience(refresh token 設計用於同 issuer 的 token rotation、aud 對 access token 較相關);(3) 極簡 struct 紀律延伸 brainstorm Q1 拍板邏輯。對比:Option B(含 aud=`"management_platform"` 對齊 Claims 慣例)無實質 security 收益;Option C(含 aud=`"refresh_token"` 標明 token 類型)pure metadata、未來 verify-side 也用不到。**此決策確認既有 FR-002 + Key Entities 描述、無需修改 spec 其他段**。

- **Q3 (clarify)**: F10.1 rust unit test 是 MUST、SHOULD 還是 skip? → **A:MUST、full coverage**(2 個 unit test、completion 7/7)。範圍:(1) `JwtUtils::generate_refresh_token` 輸出為 valid HS256 JWT 含 expected `RefreshClaims` + 可被同 refresh_secret decode pass;(2) `secret_loader` empty-file fallback 邏輯(per clarify Q1、新加入的 critical path、stack-level 無法區分 fallback vs file 內容)。理由:F10.1 改 5-6 rust file、Q1 fallback 是 stack 不可見的新邏輯;full coverage 給 R-1 緩解 + R-7 緩解雙重保障;相比 F6 前例(無 unit test)、F10.1 多 1 個 critical path 必驗。**此決策修正 FR-022(SHOULD → MUST、加第 2 個 unit test)+ NFR-004(6/6 → 7/7、unit test 移出 optional)+ SC-010(明確列 2 個 unit test 驗)**。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 R-8 修 + R-7 surface(Priority: P1)🎯 MVP

operator 跑 `curl POST /api/auth/login` 拿 rust 簽的 refresh_token → 驗 refresh_token **為 JWT 三段格式**(R-8 修)→ 跑 `curl POST /api/auth/refreshToken` 帶 refresh_token → **預期 nestjs verifyAsync PASS + 進入 refreshTokenCheck + throw `'Token has already been used.'`**(R-7 surface 點、F10.2 修)→ 紀錄 R-7 friction 落點。證明 R-8 修通過、R-7 為下一 follow-up source。

**Why this priority**:F10.1 唯一 implementation-bearing scenario。沒此 acceptance、R-8 修是否真的解、R-7 是否實際 surface 無從驗。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 驗 JWT 三段格式 → 用該 refresh_token 跑 refreshToken endpoint → 預期 HTTP 4xx with `'Token has already been used.'`(non `jwt malformed`)+ nestjs log 含 R-7 message。

**Acceptance Scenarios**:

1. **Given** stack 已起(W-FA1 7 service healthy、含 nestjs、且 F10.1 rust-api image 已 rebuild),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code, data:{token, refreshToken, ...}}`、**refreshToken 為 JWT 三段格式**(`${#REFRESH_TOKEN} > 100`、`echo $REFRESH_TOKEN | tr -dc '.' | wc -c` ≥ 2)— R-8 修驗。

2. **Given** US1.1 拿到 JWT 格式 refresh_token,**When** `curl -X POST -H "Content-Type: application/json" -d '{"refreshToken":"<jwt-token>"}' http://127.0.0.1:11080/api/auth/refreshToken`,**Then** HTTP **非 500 with `jwt malformed`**(R-8 修確認)+ 預期 HTTP 4xx with `'Token has already been used.'`(R-7 surface、F10.2 修點)。

3. **Given** US1.2 拿到 nestjs throw,**When** `docker compose logs nestjs --tail=50` grep `'Token has already been used.'` + grep `JsonWebTokenError`,**Then** R-7 evidence found(`Token has already been used.`)+ R-8 evidence **無**(無 `JsonWebTokenError: jwt malformed`)— 證 R-8 修 + R-7 next。

---

### User Story 2 — DB 準據驗 sys_tokens.refresh_token JWT format(Priority: P2)

F10.1 走完 US1 流程後查 postgres `sys_tokens` 表,確認 rust login 寫入 1 row、refresh_token column **為 JWT 字串**(R-8 修源頭)。

**Why this priority**:rust 簽 JWT 寫入 DB 是 wire-up baseline、必驗以證 rust 端工作正常、R-8 修在 DB 層也對齊。

**Independent Test**:US1.1 完成後查 sys_tokens 表、對 refresh_token JWT 格式 + status 對齊。

**Acceptance Scenarios**:

1. **Given** US1.1 完成,**When** `psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust -c "SELECT id, status, refresh_token, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"`,**Then** 1 row、refresh_token 值 **為 JWT 格式**(長度 > 100、含 `.` 2 個)、status = `"ACTIVE"`(R-7 source 仍在、F10.2 改)、created_at 為近期 timestamp。

---

### User Story 3 — refresh_secret 共用驗(Priority: P3)

F10.1 落地後 rust 與 nestjs 共讀同一 `refresh_token_secret` docker secret file(W-FA1 已 wire)、空檔走兩端 fallback 鏈完全一致(per clarify Q1、rust 與 nestjs 兩端 empty-file 都 fallback 到 `jwt_secret` 值)。

**Why this priority**:確認 secret 對齊機制 work、否則 F10.1 雖簽 JWT 但 nestjs verify 仍 fail(不同 secret)。

**Independent Test**:`docker compose exec rust-api env | grep APP_JWT_REFRESH_SECRET` + `docker compose exec nestjs env | grep REFRESH_TOKEN_SECRET`,兩個 envvar 都已 export(非空)。

**Acceptance Scenarios**:

1. **Given** stack 已起,**When** `docker compose exec rust-api env | grep -E "APP_JWT_REFRESH_SECRET_FILE|APP_JWT_REFRESH_SECRET" | head -3`,**Then** 至少看到 `APP_JWT_REFRESH_SECRET_FILE=/run/secrets/refresh_token_secret`、rust-api 容器內可讀此 path。

2. **Given** stack 已起,**When** `docker compose exec nestjs env | grep REFRESH_TOKEN_SECRET` + `docker compose exec rust-api sh -c 'cat /run/secrets/refresh_token_secret; echo; cat /run/secrets/jwt_secret'`,**Then** nestjs `REFRESH_TOKEN_SECRET=<value>`(若 secret file 空 → fallback `$JWT_SECRET`;若有內容 → secret file 內容);rust empty-file 路徑下 effective refresh_secret = jwt_secret(per clarify Q1)— 兩端 secret 對齊。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `refresh_token_secret` Docker secret file 為空(dev 預設)| **rust 偵測 empty file → fallback 用 `jwt_secret` 同 value**(per clarify Q1);nestjs entrypoint 早已 `${RTS:-$JWT_SECRET}` fallback 到 `$JWT_SECRET`;兩端 effective secret 完全對齊、acceptance dev 預期 PASS。 |
| E-2 | `refresh_token_secret` Docker secret file 有內容(prod 預期)| rust 與 nestjs 都讀此檔內容、secret 完全對齊;F10.1 acceptance 在 dev 時 file 預設空、可手動填內容測試 prod 路徑(US3 acceptance 涵蓋空檔路徑、prod 路徑屬 future test)。 |
| E-3 | rust 簽 JWT 但 nestjs `jwtService.verifyAsync` 仍 throw(secret 不對齊 / algorithm 不對齊)| F10.1 acceptance C-V3 + C-V5 surface friction、abort F10.1 + 改 follow-up;預期不發生(HS256 + 同 secret file)。 |
| E-4 | rust 簽 JWT 後 nestjs verify PASS,但 refreshTokenCheck 對 `"ACTIVE"` throw(R-7 surface)| **預期行為**(per N-7),F10.1 acceptance C-V3 確認此 friction、為 F10.2 修點。 |
| E-5 | rust restart 後 REFRESH_KEYS global 重 init,簽出 JWT 仍可被 nestjs verify| 同 secret 不變 → 對齊;若 rust 改用不同 secret 路徑 → fail(屬 E-3)。 |
| E-6 | refresh_token JWT exp 過期(超 7200s)| nestjs `verifyAsync` throw `TokenExpiredError` → HTTP 4xx;F10.1 acceptance 不主動構造、屬 F1.2 / future。 |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F10.1 MUST 改 rust `AuthOutput.refresh_token` 從 `Ulid::new().to_string()` 為 HS256 JWT(per US1.1 + R-8 修)。
- **FR-002**: F10.1 MUST 用極簡 `RefreshClaims` struct(`sub: String`、`exp: usize`、`iat: usize`、`nbf: usize`、`jti: String`、`iss: String` 共 6 field、不含 role_codes / organization_name / audience)— per Q1 拍板 security 紀律。
- **FR-003**: F10.1 MUST 用獨立 `refresh_secret` 簽(name 分離、不直接重用 `jwt_secret`)、從 `APP_JWT_REFRESH_SECRET_FILE` 載入(per N-1 + W-FA1 既有 `refresh_token_secret` Docker secret 結構);**empty file 時 fallback 用 `jwt_secret` 同 value**(per clarify Q1、mirror nestjs entrypoint sh fallback、dev 預設空檔下兩端 effective secret 對齊)。
- **FR-004**: F10.1 MUST 用 `refresh_expire` config field 控 exp、預設 7200 秒(per N-2 對齊 nestjs `REFRESH_TOKEN_EXPIRE_IN=7200`)。
- **FR-005**: F10.1 MUST 沿用 HS256(rust `Header::default()` 預設、對齊 nestjs `@nestjs/jwt` 預設)— per N-3。
- **FR-006**: F10.1 MUST 不動 nestjs fork source 任何檔(嚴守 DESIGN-A §3.2、per F10 Q2/Q5 延伸 + OOS-001)。
- **FR-007**: F10.1 MUST 不改 rust `TokenStatus` enum 字串值(R-7 friction 留 F10.2 處理)。
- **FR-008**: F10.1 MUST 不改 sys_tokens migration schema(W-FA1 已驗對齊)。
- **FR-009**: F10.1 MUST 不改 base-web src(per Constitution Principle IV + OOS-007)。
- **FR-010**: F10.1 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1-2 commit(spec docs + `docker-compose.yml` wire + SHA pin)+ merge `--no-ff`。
- **FR-011**: F10.1 MUST extend `secret_loader.rs::apply_jwt_secret_hardening`(or 對應 fn)加 `APP_JWT_REFRESH_SECRET_FILE` 載入邏輯(重用既有 `load_secret_from_file_if_set` generic helper、precedence chain 同 jwt_secret:`_FILE > bare envvar > yaml`);**empty-file 偵測 + fallback 到 `jwt_secret` 同 value**(per clarify Q1、新邏輯、與 jwt_secret 處理路徑不同的延伸點)。
- **FR-012**: F10.1 MUST 加 `JwtConfig.refresh_secret: String` + `JwtConfig.refresh_expire: i64` field(對應 envvar `APP_JWT_REFRESH_SECRET` / `APP_JWT_REFRESH_SECRET_FILE` + `APP_JWT_REFRESH_EXPIRE`)。
- **FR-013**: F10.1 MUST 加 `REFRESH_KEYS` global(`OnceCell<Arc<Mutex<Keys>>>` 同 KEYS pattern、從 `config.refresh_secret.as_bytes()` 建)+ `JwtUtils::generate_refresh_token(user_id: String)` method(構 RefreshClaims + 用 REFRESH_KEYS + refresh_expire 簽)。
- **FR-014**: F10.1 MUST 改 `sys_auth_service.rs::generate_auth_output()` line 358 為 `refresh_token: JwtUtils::generate_refresh_token(user_id.clone()).await?`。
- **FR-015**: F10.1 MUST 改 `docker-compose.yml` rust-api service 加 `APP_JWT_REFRESH_SECRET_FILE: /run/secrets/refresh_token_secret` envvar + `refresh_token_secret` secret ref。
- **FR-016**: F10.1 acceptance 用 inline bash + `contracts/verification-commands.md`(per N-6、類 F10 / W-FA2)、不新建 deploy script。
- **FR-017**: F10.1 MUST 用 `Soybean` user 跑 acceptance(per N-4、對齊 F5.1/F6/F10 既有慣例)。
- **FR-018**: F10.1 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(per N-5)。
- **FR-019**: F10.1 MUST 不改 W-FA1 / W-FA2 / W-FA3 既有 deploy 配置(`docker-compose.dev.yml` / `docker-compose.prod.yml` / `deploy/front-nginx/conf.d/*` / `deploy/build-nestjs.sh` / `deploy/secrets/*` 不改;**只**改 `docker-compose.yml` rust-api service block 加 1 envvar + 1 secret ref)。
- **FR-020**: F10.1 acceptance 階段預期 R-7 surface(per N-7、E-4)— `'Token has already been used.'`、F10.2 修點。
- **FR-021**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F10.1、F10.1 完成里程碑、Application Phase 4 Roadmap F10.1 row「完成」、F10.2 next-step。
- **FR-022**: F10.1 MUST 加 rust unit test 2 個(per clarify Q3):
  - **(a)** `JwtUtils::generate_refresh_token` 輸出為 valid HS256 JWT、含 expected `RefreshClaims` claims(`sub`/`exp`/`iat`/`nbf`/`jti`/`iss`)、用 refresh_secret 簽(`jsonwebtoken::decode` 對同 secret + RefreshClaims target type verify pass)。
  - **(b)** `secret_loader` empty-file fallback 邏輯:給定 `APP_JWT_REFRESH_SECRET_FILE` 指向 empty file(or trim 後 empty)、effective refresh_secret = `jwt_secret` value;給定 non-empty file、effective refresh_secret = file 內容(per clarify Q1、新 critical path、stack-level 不可見、必驗)。

### Non-Functional Requirements

- **NFR-001**: F10.1 acceptance 跑時間 SHOULD ≤ 15s(7 個 C-V curl + DB query + env grep、不含 stack 啟動 + rust image rebuild)。
- **NFR-002**: F10.1 spec / plan / tasks 規模 SHOULD 對齊 F6 等緊湊 feature(~12-15 task、~250 行 spec)。
- **NFR-003**: F10.1 acceptance failure mode SHOULD 明確指 friction 落點(rust signing / nestjs verify / DB / secret 對齊 / refresh_expire 不對),便於 follow-up 判斷。
- **NFR-004**: F10.1 完成標誌 SHOULD 為:US1 3/3 + US2 1/1 + US3 2/2 + rust unit test 2/2(per clarify Q3 MUST)= **8/8 PASS** + rust-api 5-6 file ~55 LOC patch + 2 unit test ~30 LOC。
- **NFR-005**: F10.1 rust image rebuild 時間 SHOULD ≤ 6 min(對齊 W-F1 build baseline)、不可超出 development feedback loop。

### Key Entities

- **rust `JwtConfig`**(`rust-api/server/config/src/model/jwt_config.rs`)— 加 2 field(`refresh_secret` + `refresh_expire`)
- **rust `JwtUtils`**(`rust-api/server/core/src/web/jwt.rs`)— 加 `RefreshClaims` struct + `REFRESH_KEYS` global + `generate_refresh_token` method
- **rust `secret_loader`**(`rust-api/server/config/src/secret_loader.rs`)— extend `apply_jwt_secret_hardening`(or 對應 fn)處理 `APP_JWT_REFRESH_SECRET_FILE`
- **rust `sys_auth_service.rs::generate_auth_output()`**(line 358)— 改 refresh_token 賦值
- **rust application.yaml**(or 等同 default config 檔)— 加 `jwt.refresh_secret` + `jwt.refresh_expire` 預設值(若已有 jwt section、加 2 key)
- **`docker-compose.yml` rust-api service**— 加 `APP_JWT_REFRESH_SECRET_FILE` envvar + `refresh_token_secret` secret ref
- **`refresh_token_secret` Docker secret**(W-FA1 已加、`deploy/secrets/refresh_token_secret.txt`)— rust 與 nestjs 共讀
- **`sys_tokens` 表**(W-FA1 已驗 schema 對齊)— F10.1 寫入時 refresh_token column 從 Ulid 變 JWT 字串、其他 column 不變
- **nestjs `authentication.service.ts::refreshToken()`**(line 38-81)— **不動**(per FR-006),F10.1 acceptance 驗證點(verifyAsync 對 rust 簽的 JWT PASS)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F10.1 落地後跑 US1.1 → HTTP 200 + body envelope + **refresh_token 為 JWT 三段格式**(length > 100、含 2 個 `.`、可被 `jsonwebtoken::decode` parse)。R-8 修驗。
- **SC-002**: F10.1 落地後跑 US1.2 → HTTP **非 500 with `jwt malformed`**(R-8 修);**預期 HTTP 4xx with `'Token has already been used.'`**(R-7 surface、F10.2 修點)。
- **SC-003**: F10.1 落地後跑 US1.3 → `docker compose logs nestjs` grep 含 `'Token has already been used.'`(R-7 evidence)+ **無** `JsonWebTokenError: jwt malformed`(R-8 修確認、F10 baseline 對比)。
- **SC-004**: F10.1 落地後跑 US2.1 → `psql ... sys_tokens` 查 1 row、`refresh_token` column 為 JWT 字串(length > 100、含 2 個 `.`)、status = `"ACTIVE"`。
- **SC-005**: F10.1 落地後跑 US3.1 → `docker compose exec rust-api env | grep APP_JWT_REFRESH_SECRET_FILE` 看到 `/run/secrets/refresh_token_secret`。
- **SC-006**: F10.1 落地後跑 US3.2 → `docker compose exec nestjs env | grep REFRESH_TOKEN_SECRET` 看到非空 value(W-FA1 已 acceptance、F10.1 regression)。
- **SC-007**: F10.1 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1-2 commit + merge + optional SHA fill)。
- **SC-008**: F10.1 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-006 + W-FA*/F10 三邊零改動延伸)。
- **SC-009**: F10.1 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-009 + Constitution Principle IV)。
- **SC-010**: F10.1 rust unit test(per FR-022 MUST、clarify Q3)2/2 PASS:`cargo test` 驗 (a) `generate_refresh_token` 簽出 valid HS256 JWT 含 expected `RefreshClaims` + 可被同 refresh_secret decode + (b) `secret_loader` empty-file → fallback `jwt_secret` value + non-empty → file 內容。
- **SC-011**: F10.1 acceptance 整套 ≤ 15s(per NFR-001)。

## Assumptions

- **A-001**: F10 已 merge(application Phase 4 第一個 feature 就位、merge `8f0e84c`、F10.1 為第二個)。
- **A-002**: W-FA1 / W-FA2 / W-FA3 已 merge(`refresh_token_secret` Docker secret + nestjs container + nginx track-a + build script 全就位)。
- **A-003**: F1.1 已 merge(JWT secret + _FILE pattern + `secret_loader.rs::load_secret_from_file_if_set` generic helper 可重用)。
- **A-004**: F4 + F5.1 + F6 已 merge(rust login flow + envelope shape + 既有 acceptance pattern)。
- **A-005**: nestjs prisma `SysTokens` model + rust `sys_tokens` schema 對齊(W-FA1 已驗、F10.1 不重做)。
- **A-006**: rust + nestjs 兩端 HS256 algorithm 對齊(rust `Header::default()` + nestjs `@nestjs/jwt` default = HS256)。
- **A-007**: `refresh_token_secret` Docker secret file 在 dev 為空 / 缺、走 fallback 路徑(per clarify Q1:rust 與 nestjs 兩端都 fallback 用 `jwt_secret` 同 value)— prod 可能填獨立 secret、兩端讀同一 file、F10.1 仍兼容。
- **A-008**: rust-api image rebuild 在 acceptance 前可完成(local docker daemon + cargo build cache hit、預估 5-6 min cold / 2-3 min warm)。
- **A-009**: F10 quickstart 預估 3 處 rust patch 屬保守、實際 5-6 patch(jwt_config + secret_loader + jwt.rs + sys_auth_service + docker-compose + optional yaml)— per brainstorm doc design overview。

## Dependencies

### Inbound(本 feature 依賴)

- **F10** `refresh-token-nestjs-bridge`:wire-up baseline + R-8 friction surface 紀錄。✅(merge `8f0e84c`)
- **W-FA1** `compose-nestjs-service`:`refresh_token_secret` Docker secret + nestjs entrypoint 讀取 + fallback 結構。✅(merge `b095d55`)
- **W-FA2** `nginx-track-a-transitional-block`:refreshToken endpoint nginx → nestjs 路由。✅(merge `c5b7840`)
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build automation。✅(merge `f23f38e`)
- **F1.1** `jwt-secrets`:_FILE precedence chain + `secret_loader.rs::load_secret_from_file_if_set` generic helper。✅(merge `5f82df3`)
- **F4** `response-shape-alignment`:envelope shape(F10.1 acceptance 沿用)。✅(merge `3d357e5`)
- **F5.1** `auth-login-and-dynamic-menu`:rust login flow + AccessTokenEvent 寫 sys_tokens。✅(merge `e71aefe`)

### Outbound(本 feature 解鎖)

- **F10.2** `rust-tokenstatus-string-align`:F10.1 acceptance C-V3 + C-V5 surface R-7 evidence(`'Token has already been used.'`),為 F10.2 acceptance baseline、改 rust `TokenStatus` enum 字串值對齊 nestjs(`"unused"`/`"used"`)。
- **F11** `extracted-stubs`:F10.1 + F10.2 完成後 nestjs refreshToken end-to-end PASS、剩餘 stub endpoint 範疇可清楚定義。
- **F13** `rust-refresh-token-impl`:F10.1 + F10.2 完成後 rust 才有「實際工作的 nestjs 版本」當對齊基準,F13 rust 補完整實作可對照行為。
- **F14** `design-a-to-b-cutover`:F13 完成後 cutover,F10.1 在 cutover 階段需保留(rust 已能簽 JWT、不需 nestjs)。

## Out of Scope

- **OOS-001**: nestjs source 任何改動(嚴守 DESIGN-A §3.2 + F10 Q2/Q5 延伸)。
- **OOS-002**: rust `TokenStatus` enum 字串值對齊(R-7 friction、留 F10.2)。
- **OOS-003**: sys_tokens schema 結構改動(W-FA1 已驗對齊)。
- **OOS-004**: JWT 演算法升 RS256 / key versioning(F1.2)。
- **OOS-005**: rust 自驗 refresh_token(F13)。
- **OOS-006**: rust 自實作 refresh token rotation(F13)。
- **OOS-007**: base-web SPA e2e refreshToken 自動化驗(F11 之後)。
- **OOS-008**: JWT claim presence assertion(decode + check `sub`/`exp` presence,F13)。
- **OOS-009**: Casbin policy redis pub-sub channel(F11 或不做)。
- **OOS-010**: audit log sys_operation_log 寫入(F13)。
- **OOS-011**: nestjs `REFRESH_TOKEN_EXPIRE_IN=7200` 偏短調整(改 nestjs config = 動 nestjs source、F10.1 對齊使用)。
- **OOS-012**: refresh_secret rotation / key rolling(F1.2 或之後)。

## Risks

- **R-1**(中機率)**`apply_jwt_secret_hardening` extend 路徑**:F1.1 落地的 jwt_secret precedence chain 已驗、extend 加 refresh_secret 路徑屬 1:1 鏡像、低 risk;但 W-F4 EnvConfigLoader 既有 `APP_*_FILE` filter 邏輯需驗 `APP_JWT_REFRESH_SECRET_FILE` 走 _FILE precedence chain 正確。**緩解**:(a) `cargo test` 補 unit test 對 refresh_secret_file load 路徑(per FR-022);(b) stack acceptance C-V2 + C-V5 雙重驗(rust 簽出來的 JWT 用 nestjs 同 secret 能 verify)。

- **R-2**(低機率)**REFRESH_KEYS global init order**:`generate_refresh_token` 第一次呼叫前 `REFRESH_KEYS` 須已 init(同 `KEYS` 既有 lazy init pattern)。若 init 順序錯誤可能 `KeysNotInitialized` panic。**緩解**:沿用 `OnceCell<Arc<Mutex<Keys>>>` 同 pattern + 在 main.rs / app bootstrap 加 `init_refresh_keys()` 緊接 `init_keys()` 之後。

- **R-3**(低機率)**docker-compose rust-api service 加 secret ref 影響 W-F4 healthcheck**:rust-api 多讀一個 secret file、若 file 不存在 / permission 錯導致 secret_loader panic、stack 起不來。**緩解**:(a) 同 nestjs entrypoint fallback 設計(file 缺 / 空 → fallback `jwt_secret`、不 panic、per clarify Q1);(b) `docker compose config` syntax + stack regression `docker compose ps` 雙驗。

- **R-4**(極低機率)**rust 簽 JWT 後 nestjs verify 仍 fail**(secret 不對齊 / algorithm 不對齊 / claim 結構錯)。**緩解**:F10.1 acceptance C-V3 直接驗 nestjs log、surface 後 abort F10.1 + 改 follow-up(F10.1b alg-align)。預期不發生(HS256 + 同 secret file)。

- **R-5**(極低機率)**R-7 不 surface**(predicted nestjs `refreshTokenCheck` 對 `"ACTIVE"` throw、但 R-8 修後 nestjs 走別路徑)。**緩解**:F10.1 C-V5 監測 nestjs log、若不 surface → 紀錄、F10.2 重評範疇(可能 R-7 已隱性解、或 friction 路徑變化)。

- **R-6**(極低機率)**rust image rebuild 失敗 / 過長**:F10.1 改 rust source 後須 rebuild image,若 dependency 或 cargo cache 失效可能 cold build > 6 min。**緩解**:NFR-005 提示;build 前可清 dangling layer + 用 BuildKit cache mount(W-F1 既有設計)。

- **R-7**(極低機率)**rust application.yaml 預設值與 docker-compose envvar 衝突**:precedence 規則 `_FILE > bare envvar > yaml` 已 F1.1 驗、F10.1 沿用、但若 envvar 拼錯(如 `APP_JWT_REFRESH_SECRET` 漏 _FILE 後綴)可能載錯來源。**緩解**:`cargo test` (per FR-022) + acceptance US3.1 env grep 雙驗。
