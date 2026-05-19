# Feature Specification: F10.1 — rust-jwt-refresh-token-signing

**Feature ID**: F10.1(F10 acceptance 階段 surface R-8 finding 拆出的 follow-up、per [`017-feature-refresh-token-nestjs-bridge.md`](017-feature-refresh-token-nestjs-bridge.md) Plan Option A + [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 application Phase 4)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `018-rust-jwt-refresh-token-signing`)
**Created**: 2026-05-19
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-19 session(1 顯式拍板 Q + 3 自然推論 + 1 explore-agent driven evidence collection)

**Authoritative parents**:
- [`017-feature-refresh-token-nestjs-bridge.md`](017-feature-refresh-token-nestjs-bridge.md)(F10 brainstorm parent;F10.1 為 F10 Plan Option A reset 後拆出 follow-up)
- [`specs/017-refresh-token-nestjs-bridge/quickstart.md`](../../specs/017-refresh-token-nestjs-bridge/quickstart.md) §F10.1 follow-up scope(F10 acceptance 階段 pre-written 範疇)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.2 nestjs 補位 endpoint「nestjs source **不改**」(F10.1 嚴守、改 rust 遷就 nestjs)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 application Phase 4(F10/F10.1/F10.2 series)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV 延伸至 nestjs fork zero-改動;Principle V 漸進收縮)
- 既有 W-FA1 落地的 nestjs JWT secret 共享 _FILE pattern(`refresh_token_secret` 已 wire 進 docker-compose、per [`014-feature-compose-nestjs-service.md`](014-feature-compose-nestjs-service.md))
- 既有 F1.1 落地的 JWT secret _FILE precedence chain(`secret_loader.rs::load_secret_from_file_if_set` generic helper、per [`004-feature-jwt-secrets.md`](004-feature-jwt-secrets.md))
- F10 acceptance T022 + T030 evidence(rust 簽 refresh_token = Ulid 26 char、nestjs throw `JsonWebTokenError: jwt malformed` — R-8 surface 點屬實)
- rust 既有 `rust-api/server/service/src/admin/sys_auth_service.rs::generate_auth_output()`(line 337-360,refresh_token Ulid 賦值 line 358)— F10.1 主要改動點
- rust 既有 `rust-api/server/core/src/web/jwt.rs::JwtUtils::generate_token()`(line 49-74,HS256 簽 access_token 範本)— F10.1 加 `generate_refresh_token` 鏡像實作
- rust 既有 `rust-api/server/config/src/model/jwt_config.rs::JwtConfig`(line 20-30,3 field:jwt_secret/issuer/expire)— F10.1 加 2 field
- rust 既有 `rust-api/server/config/src/secret_loader.rs::apply_jwt_secret_hardening`(_FILE precedence chain)— F10.1 extend handle refresh_secret
- nestjs 既有 `authentication.service.ts::refreshToken()`(line 38-81,`jwtService.verifyAsync(refreshToken, { secret: refreshJwtSecret })` 期 HS256 JWT)— F10.1 對齊驗證點

**Scope summary**:rev1 application 階段 Phase 4 **第二個** feature(F10 wire-up + friction surface 後接續、F10.2 之前)。**修 R-8**:rust `AuthOutput.refresh_token` 從 `Ulid::new().to_string()`(26 char 明文)→ **HS256 JWT**(極簡 `RefreshClaims` struct:sub + exp + iat + nbf + jti + iss、用 `refresh_secret` + `refresh_expire` 簽)。落地後 nestjs `jwtService.verifyAsync` PASS、進入 `refreshTokenCheck` 階段、**R-7 friction 將 surface(F10.2 修)**。範疇刻意收緊到「**rust refresh_token JWT 簽署 wire-up**」、**不動 nestjs source / 不改 sys_tokens schema / 不做 status enum 對齊(R-7 屬 F10.2)/ 不驗 base-web e2e / 不升 RS256**。

**Commit 模式**(post Q3 拍板 — F10.1 固定):
- **兩段式** commit(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1-2 commit(spec docs + docker-compose.yml wire + SHA pin)

**範疇外**:
- ❌ nestjs source 任何改動(嚴守 DESIGN-A §3.2 + F10 Q2/Q5 延伸)
- ❌ rust `TokenStatus` enum 字串值對齊(R-7 friction、留 F10.2 rust-tokenstatus-string-align)
- ❌ sys_tokens schema 結構改動(W-FA1 已驗對齊、F10.1 不動 schema)
- ❌ JWT 演算法升 RS256 / key versioning(F1.2 範疇)
- ❌ rust 自實作 refresh token rotation(F13 範疇 — F10.1 只負責簽、nestjs 仍負責 verify + rotation 業務邏輯)
- ❌ base-web SPA e2e refreshToken 自動化驗(F11 之後)
- ❌ JWT claim presence assertion(decode + claim assertion,F13)
- ❌ rust 自驗 refresh_token(F13、F10.1 只簽不驗)
- ❌ refresh_token rotation 邏輯(nestjs 既有提供、F10.1 不動)
- ❌ Casbin policy redis pub-sub channel(F11 或不做)
- ❌ audit log sys_operation_log(F13)

## Clarifications

### Session 2026-05-19(brainstorming 階段拍板、1 顯式 Q + 3 自然推論 + 1 evidence collection)

- **Q1 (顯式)**: refresh_token JWT claim shape — 重用既有 Claims struct 還是新極簡 struct? → **A: 極簡新 struct `RefreshClaims`**(`sub: String`(user_id)、`exp: usize`、`iat: usize`、`nbf: usize`、`jti: String`、`iss: String`、共 6 field)。理由:nestjs `verifyAsync` 不讀 payload(後續從 DB 查 username/domain)、只驗 signature 與 exp;refresh token 內不含 role/org 是 security 紀律(refresh token 不該攜 authorization claim);新 struct ~30 LOC 多但語意明確。對比 Option D「重用 Claims 但 strip role/org」:仍含 audience field、語意模糊;Option A「重用 Claims」:role_codes / organization_name 等 authorization 資訊不該入 refresh token;Option C「對齊 nestjs payload `{ uid, username, domain }`」:nestjs verify 不讀 payload、對齊只是 aesthetic、收益小於 minimum struct 紀律。

- **自然推論 N-1 (secret 分離)**: rust refresh_token 用獨立 `refresh_secret` 簽,W-FA1 已 wire 進 docker-compose(`refresh_token_secret` Docker secret + nestjs entrypoint 讀 `/run/secrets/refresh_token_secret` export `REFRESH_TOKEN_SECRET`、空檔 fallback `$JWT_SECRET`)。F10.1 rust-api service 加 `APP_JWT_REFRESH_SECRET_FILE: /run/secrets/refresh_token_secret`(+ secret ref),同 fallback 語意(secret_loader 讀 `_FILE` 路徑、檔空 → 警告 + fallback application.yaml refresh_secret 預設;預設值 = "change-me-dev"、dev 與 nestjs JWT_SECRET fallback 鏈一致)。理由:W-FA1 已分配 secret、F10.1 不用此 wire 等於浪費結構;rust + nestjs 共讀同 file 保證 secret 對齊。

- **自然推論 N-2 (refresh_expire 值)**: refresh_expire = `7200`(秒、2 小時)。理由:對齊 nestjs `REFRESH_TOKEN_EXPIRE_IN=7200`(docker-compose line 235),避免 rust JWT exp 超 nestjs 預設驗證內隱期限。注:7200s(2h)本身是 nestjs config 偏短的選擇、非 F10.1 範疇調(改 nestjs config = 動 nestjs source、違反 OOS)。F1.2 之後可能整套重 evaluate(7d 等 industry typical)。

- **自然推論 N-3 (algorithm)**: HS256(沿用 rust `Header::default()` + nestjs `jwtService` 預設、F1.2 升 RS256 範疇)。

- **自然推論 N-4 (測試 user)**: `Soybean`(super admin、對齊 CLAUDE.md §5.1 + F5.1/F6/F10 既有 acceptance pattern)。

- **自然推論 N-5 (stack)**: W-FA1 dev + `--profile track-a`(7 service healthy、refreshToken 走 nginx → nestjs)— F10.1 acceptance 在此 stack 跑。

- **自然推論 N-6 (acceptance approach)**: inline bash + `contracts/verification-commands.md`(類 F10 / W-FA2 慣例)— F10.1 不是 deploy feature、無新 deploy script。預估 7 個 C-V(類 F10 acceptance scope)。

- **自然推論 N-7 (R-7 仍 surface)**: F10.1 落地後 nestjs verify PASS、進入 `refreshTokenCheck()`、對 rust 寫的 `status="ACTIVE"` throw `'Token has already been used.'`。**R-7 friction 在 F10.1 acceptance 階段預期 surface**(C-V3:HTTP 4xx with R-7 message)、是 F10.2 修點。F10.1 acceptance 期 R-8 fix verified + R-7 newly surfaced(F10 R-8 → F10.1 R-7)。

- **Evidence collection 2026-05-19** (Explore agent driven):
  - Q1: rust `sys_auth_service.rs::generate_auth_output()` line 337-360,refresh_token Ulid 賦值 line 358。
  - Q2: rust `JwtUtils::generate_token()` jwt.rs line 49-74,HS256 + `KEYS` global(`encoding key` 從 `config.jwt_secret.as_bytes()` 建)+ exp/iss/iat/nbf/jti claim setter。
  - Q3: `JwtConfig` jwt_config.rs line 20-30,3 field(jwt_secret / issuer / expire),secret loading 透過 `secret_loader.rs::load_secret_from_file_if_set(base_envvar)` generic helper、precedence `_FILE > bare envvar > yaml`。
  - Q4: `docker-compose.yml` line 213-241 nestjs service(W-FA1 加)+ line 284-285 `refresh_token_secret` Docker secret;`deploy/secrets/refresh_token_secret.txt.example` 4 行說明(空檔 → fallback JWT_SECRET、per W-FA1 spec FR-005 / E-1)。
  - Q5: nestjs `authentication.service.ts::refreshToken()` line 38-81,`jwtService.verifyAsync(tokenDetails.refreshToken, { secret: securityConfig.refreshJwtSecret })`(只驗 signature、不讀 payload)+ verify 後從 DB tokenDetails 取 username/domain。

## Design Overview

### 5-6 file patch(~55 LOC、worktree-heavy)

| # | File | Layer | 改動 LOC | 改動內容 |
|---|---|---|---|---|
| 1 | `rust-api/server/config/src/model/jwt_config.rs` | config | +2 | `JwtConfig` 加 `refresh_secret: String` + `refresh_expire: i64` field(對應 envvar `APP_JWT_REFRESH_SECRET` / `APP_JWT_REFRESH_SECRET_FILE` + `APP_JWT_REFRESH_EXPIRE`)|
| 2 | `rust-api/server/config/src/secret_loader.rs` | config | ~10 | `apply_jwt_secret_hardening`(or 對應 fn)加 `APP_JWT_REFRESH_SECRET_FILE` 載入邏輯(重用 `load_secret_from_file_if_set` generic helper)、precedence chain 同 jwt_secret(_FILE > bare envvar > yaml)|
| 3 | `rust-api/server/core/src/web/jwt.rs` | core | ~35 | (a) 新 `RefreshClaims` struct(6 field:sub/exp/iat/nbf/jti/iss)+ Serialize impl;(b) 新 `REFRESH_KEYS` global(`OnceCell<Arc<Mutex<Keys>>>` 同 KEYS pattern、從 `config.refresh_secret.as_bytes()` 建);(c) 新 `JwtUtils::generate_refresh_token(user_id: String) -> Result<String, JwtError>` method(構 RefreshClaims + 用 REFRESH_KEYS + refresh_expire 簽);(d) 加 `init_refresh_keys` 在 KEYS init 後同期 init |
| 4 | `rust-api/server/service/src/admin/sys_auth_service.rs:358` | service | 1 | `refresh_token: Ulid::new().to_string()` → `refresh_token: JwtUtils::generate_refresh_token(user_id.clone()).await?`(user_id 已在 fn 參數 line 338)|
| 5 | `docker-compose.yml` rust-api service block | outer | ~3 | (a) `environment` 加 `APP_JWT_REFRESH_SECRET_FILE: /run/secrets/refresh_token_secret`;(b) `secrets` 加 `refresh_token_secret` ref(已在 secrets section line 284-285)|
| 6 (opt)| `rust-api/server/resources/application.yaml`(or 等同 config 預設檔) | config | ~2 | `jwt.refresh_secret: "change-me-dev"` + `jwt.refresh_expire: 7200` 預設值(dev fallback 用、與 docker-compose _FILE 衝突時 _FILE 贏 per N-1)|

**Total**:~55 LOC across 5-6 file(worktree-heavy:5 file rust + 1 file outer)。

### Two-stage commit 結構

對齊 F5.1 / F6 兩段式 commit 模式:

**Stage 1**:rust-api worktree 內 1 commit(`rev1-admin-rust-api` branch、push origin):
- 改 #1-#4 + #6 共 5 file
- conventional commit:`feat(rust-api): F10.1 加 refresh_token JWT 簽 + 修 R-8 friction`

**Stage 2**:outer `rev1-admin-root`(經 `018-rust-jwt-refresh-token-signing` feature branch)2 commit:
- Commit 2a:spec docs(`specs/018-*/`)+ `docker-compose.yml` 改 #5 + `.specify/feature.json` + `CLAUDE.md` SPECKIT marker + `docs/INTEGRATION-CHECKLIST.md`(post-Option A 拆 F10.1 row + Current Focus 更新)
- Commit 2b:bump `rust-api` SHA pin
- Merge `--no-ff` 回 `rev1-admin-root` + (optional) follow-up SHA fill

預估總 commit 數:**4-5 個**(stage 1: 1 / stage 2: 2 / merge: 1 / SHA fill: 0-1),對齊 F6 + W-FA* 規模。

### Acceptance(stack acceptance、7 個 C-V)

| C-V | 內容 | 對齊 spec |
|---|---|---|
| C-V1 | rust login HTTP 200 + envelope shape | regression(F10 C-V1 + F4)|
| C-V2 | refresh_token JWT format(`${#TOKEN} > 100` + `$(echo $TOKEN \| tr -dc '.' \| wc -c)` ≥ 2)| **R-8 修驗**(F10 C-V2 expected fail → F10.1 expected JWT 三段)|
| C-V3 | `curl POST /api/auth/refreshToken` HTTP status | **R-8 修驗 + R-7 surface**:非 500 `jwt malformed`(R-8 修)、預期 HTTP 4xx with `'Token has already been used.'`(R-7 surface、F10.2 修點)|
| C-V4 | psql sys_tokens row | refresh_token 為 JWT 字串(含 `.` 2 個)、status=`ACTIVE`(R-7 source 仍在)|
| C-V5 | nestjs container log grep | 含 `'Token has already been used.'`(R-7 evidence)、不再有 `JsonWebTokenError: jwt malformed`(R-8 修)|
| C-V6 | three-side zero diff(base-web/rust-api 既有 untouched src/ + nestjs fork)| 0(base-web + nestjs fork)、rust-api 改 5 file(allowed)|
| C-V7 | two-stage commit verify | rust-api worktree 1 commit + outer 1-2 commit + SHA pin bump 對齊 |

**Acceptance scope**:5 user scenario(類 F10 + 1 個 zero-regression scenario)、預估 task 數 **12-15 個**(對齊 F6 + W-FA3 規模)。

### Risk

- **R-1**(中)**`apply_jwt_secret_hardening` extend 路徑**:F1.1 落地的 jwt_secret precedence chain 已驗、extend 加 refresh_secret 路徑屬 1:1 鏡像、低 risk;但 W-F4 EnvConfigLoader 既有 `APP_*_FILE` filter 邏輯需驗 `APP_JWT_REFRESH_SECRET_FILE` 走 _FILE precedence chain 正確。**緩解**:(a) `cargo test` 補 unit test 對 refresh_secret_file load 路徑;(b) stack acceptance C-V2 + C-V5 雙重驗(rust 簽出來的 JWT 用 nestjs 同 secret 能 verify)。

- **R-2**(低)**REFRESH_KEYS global init order**:`generate_refresh_token` 第一次呼叫前 `REFRESH_KEYS` 須已 init(同 `KEYS` 既有 lazy init pattern)。若 init 順序錯誤可能 `KeysNotInitialized` panic。**緩解**:沿用 `OnceCell<Arc<Mutex<Keys>>>` 同 pattern + 在 main.rs / app bootstrap 加 `init_refresh_keys()` 緊接 `init_keys()` 之後。

- **R-3**(低)**docker-compose rust-api service 加 secret ref 影響 W-F4 healthcheck**:rust-api 多讀一個 secret file、若 file 不存在 / permission 錯導致 secret_loader panic、stack 起不來。**緩解**:(a) 同 nestjs entrypoint fallback 設計(file 缺 → fallback application.yaml refresh_secret 預設值);(b) `docker compose config` syntax + stack regression `docker compose ps` 雙驗。

- **R-4**(極低)**rust 簽 JWT 後 nestjs verify 仍 fail**(secret 不對齊 / algorithm 不對齊 / claim 結構錯)。**緩解**:F10.1 acceptance C-V3 直接驗 nestjs log、surface 後 abort F10.1 + 改 follow-up(F10.1b alg-align)。預期不發生(HS256 + 同 secret file)。

- **R-5**(極低)**R-7 不 surface**(predicted nestjs `refreshTokenCheck` 對 `"ACTIVE"` throw、但 R-8 修後 nestjs 走別路徑)。**緩解**:F10.1 C-V5 監測 nestjs log、若不 surface → 紀錄、F10.2 重評範疇(可能 R-7 已隱性解、或 friction 路徑變化)。

## Assumptions

- **A-001**: F10 已 merge(application Phase 4 第一個 feature 就位、merge `8f0e84c`、F10.1 為 application Phase 4 第二個)。
- **A-002**: W-FA1 / W-FA2 / W-FA3 已 merge(`refresh_token_secret` Docker secret + nestjs container + nginx track-a + build script 全就位)。
- **A-003**: F1.1 已 merge(JWT secret + _FILE pattern + `secret_loader.rs::load_secret_from_file_if_set` generic helper 可重用)。
- **A-004**: F4 + F5.1 + F6 已 merge(rust login flow + envelope shape + 既有 acceptance pattern)。
- **A-005**: nestjs prisma `SysTokens` model + rust `sys_tokens` schema 對齊(W-FA1 已驗、F10.1 不重做)。
- **A-006**: rust + nestjs 兩端 HS256 algorithm 對齊(rust `Header::default()` + nestjs `@nestjs/jwt` default = HS256)。
- **A-007**: `refresh_token_secret` Docker secret file 在 dev 為空 / 缺、走 fallback 路徑(rust 用 application.yaml refresh_secret 預設、nestjs 用 `$JWT_SECRET` fallback)— prod 可能填獨立 secret、F10.1 仍兼容(因兩端都讀同 file)。

## Dependencies

### Inbound(本 feature 依賴)

- **F10** `refresh-token-nestjs-bridge`:wire-up baseline + R-8 friction surface 紀錄(F10.1 acceptance C-V2 對齊 F10 C-V2 expected fail 反轉)。✅(merge `8f0e84c`)
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

- **OOS-001**: rust `TokenStatus` enum 字串值對齊(R-7 friction、留 F10.2)。
- **OOS-002**: nestjs source 任何改動(嚴守 DESIGN-A §3.2)。
- **OOS-003**: sys_tokens schema 結構改動(W-FA1 已對齊)。
- **OOS-004**: JWT 演算法升 RS256 / key versioning(F1.2)。
- **OOS-005**: rust 自驗 refresh_token(F13)。
- **OOS-006**: rust 自實作 refresh token rotation(F13)。
- **OOS-007**: base-web SPA e2e refreshToken 自動化(F11 之後)。
- **OOS-008**: JWT claim presence assertion(F13)。
- **OOS-009**: Casbin policy redis pub-sub channel(F11 或不做)。
- **OOS-010**: audit log sys_operation_log(F13)。
- **OOS-011**: nestjs `REFRESH_TOKEN_EXPIRE_IN=7200` 偏短的調整(改 nestjs config = 動 nestjs source、F10.1 對齊使用)。
- **OOS-012**: refresh_secret rotation / key rolling(F1.2 或之後)。

## Open Questions(留 /speckit-clarify 階段處理)

- **OQ-1**: `RefreshClaims` 是否需含 `aud` field(原 Claims 有 audience)? Plan 階段可決(若 nestjs 不檢 → 不加、極簡優先)。
- **OQ-2**: `init_refresh_keys` 是否與 `init_keys` 合併為 `init_jwt_keys(jwt_secret, refresh_secret)`? Plan 階段審 KEYS init code 後決(若合併簡化 init 流、合;若拆比較對稱、拆)。
- **OQ-3**: `application.yaml`(#6)是否真的需動? Plan 階段審 yaml 結構後決(可能透過 envvar override 預設就 work、不需動 yaml file)。
