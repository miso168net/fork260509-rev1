# Feature Specification: F11 — extracted-stubs

**Feature Branch**: `020-extracted-stubs`
**Created**: 2026-05-19
**Status**: Draft
**Input**: User description: "F11 extracted-stubs — 補 DESIGN-A §3.1 + §4.2 抽離項清單 4 條 stub endpoint(`/auth/sendCaptcha` POST 回固定碼 `000000` / `/auth/verifyCaptcha` POST 一律 success / `/auth/error` GET 反 echo / `/mock/getLastTime` GET 回 ISO timestamp)+ 1 個 Casbin policy seed migration(Soybean + Administrator allow / GeneralUser deny、INSERT 8 row)。Application Phase 4 收尾後第一個 post-Phase-4 feature(F10/F10.1/F10.2 三件套全完成、refreshToken end-to-end pass 後接續、F9/F12/F13 之前可並行)。"

**Source**: [`docs/superpowers/020-feature-extracted-stubs.md`](../../docs/superpowers/020-feature-extracted-stubs.md)(brainstorming 2026-05-19 session、5 顯式拍板 Q + project context grep evidence)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1「抽離項管理」+ §4.2「抽離項清單 × stub 行為 × 升級路徑」(F11 主來源、5 條抽離項清單中 4 條由 F11 統一交付,`batchDeleteUser` 1 條由 F9 統一交付)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 4(F11 在 F10/F10.1/F10.2 後、與 F9/F12 並行)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §4.2 + §6(F11 在 DESIGN-B 完全繼承、identical)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I「RBAC fail-safe」+ IV「base 不改動邊界」+ V「漸進收縮」— F11 stub 為過渡、升級路徑明確)
- 既有 rust `SysAuthenticationApi`(`rust-api/server/api/src/admin/sys_authentication_api.rs`、5 個 handler:login_handler / get_user_info / get_user_routes / assign_permission / assign_routes — F11 加 3 個 stub handler)
- 既有 rust router 結構(`rust-api/server/router/src/admin/`、12 個 route file — F11 新建 `sys_mock_route.rs`)
- 既有 F6 Casbin policy seed pattern(`m20260518_a_f6_is_route_exist_seed.rs`、F11 沿用 INSERT casbin_rule pattern)
- 既有 F5.1 seed user(Soybean/ROLE_SUPER、Administrator/ROLE_ADMIN、GeneralUser/ROLE_USER、3 user 共用密碼 `123456`)
- 既有 F4 envelope shape(`{code, data, message}`、F11 acceptance 沿用)
- F10.2 merge SHA `851ec79`(application Phase 4 整套收尾、F11 baseline)

**Scope summary**:rev1 application Phase 4 收尾後**第一個** post-Phase-4 feature(F10 wire-up + F10.1 R-8 修 + F10.2 R-7 修 三件套全完整、refreshToken end-to-end pass 後接續、F9/F12/F13 之前可選擇任一)。補 DESIGN-A §3.1 + §4.2 抽離項清單 **4 條 stub endpoint**(per brainstorm 拍板):

| Endpoint | Method | Stub 行為 |
|---|---|---|
| `/auth/sendCaptcha` | POST | 接 `{phone}`、tracing::info! log + 回固定碼 `{"code":"000000"}` envelope |
| `/auth/verifyCaptcha` | POST | 接 `{phone, code}`、`code=="000000"` 為 `{"verified":true}` |
| `/auth/error` | GET | demo only,接 `?code=&msg=` query 反 echo |
| `/mock/getLastTime` | GET | 回 `{"time":"<ISO 8601>"}` |

加 **1 個 Casbin policy seed migration**:`Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN) allow / GeneralUser (ROLE_USER) deny`(無 row 即 default deny)、INSERT 8 row(2 role × 4 endpoint)。

範疇刻意收緊到「**4 條 stub 補位 + Casbin enforce + 三邊零改動**」、**不加 sys_menu seed / 不加新 role / 不寫 audit log / 不加 unit test / 不驗 base-web e2e / 不接真 SMS provider**。

**Commit 模式**(post brainstorm 拍板 — F11 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F10.1/F10.2/F6/F5.1):rust-api worktree 1 commit + outer 1-2 commit(spec docs + INTEGRATION-CHECKLIST.md milestone + SHA pin + CLAUDE.md SOP marker;**無 docker-compose.yml 改**,W-FA1 既有 wire 已涵蓋)

**範疇外**:
- ❌ 不加 sys_menu seed row(per brainstorm Q2)
- ❌ 不加新 sys_role(test / demo)+ user-role assignment(per Q1)
- ❌ 不寫 sys_operation_log audit(per Q3、stub 無 DB write、Principle II N/A)
- ❌ 不加 rust unit test(per Q3、stub 邏輯 stack-可見、curl 驗即可)
- ❌ 不加 input validation 比 serde 預設更嚴(per Q3)
- ❌ 不改 base-web SPA src / 不跑 SPA e2e(per Q4)
- ❌ 不改 nestjs fork source(三邊零改動標配)
- ❌ 不改 nginx config(stub 在 rust router 註冊、nginx 透明、per DESIGN-A §3.1)
- ❌ 不改 docker-compose.yml / Dockerfile(對比 F10.1)
- ❌ 不接真 SMS provider / 不接 prod error tracking(留 future feature、DESIGN-A §4.2 升級路徑)
- ❌ 不在 nginx 配 captcha rate limit(留 W-F11 或 future)
- ❌ 不做 stub upgrade 到真實作(F11 = stub-only,future feature 換真實 SMS provider)

## Clarifications

### Session 2026-05-19(brainstorming 階段拍板、5 顯式 Q + project context grep evidence)

- **Q1 (brainstorm)**: Casbin policy 哪些 role allow?DESIGN-A 寫「test / demo / admin」、但 rev1 seed user 只有 Soybean(ROLE_SUPER)/ Administrator(ROLE_ADMIN)/ GeneralUser(ROLE_USER)。→ **A:Soybean + Administrator allow、GeneralUser deny**。理由:(1) DESIGN-A §4.2 寫「test / demo / admin」但 rev1 seed user 無 test/demo role;(2) 加新 role(test/demo)= F11 scope 從 ~170-200 LOC 變 ~250-300 LOC、跨多 migration 表、複雜度提升、不在 v1 範疇;(3) Soybean + Administrator allow 對應 DESIGN-A「admin」精神、GeneralUser deny 對應 DESIGN-A「多數 role deny」紀律;(4) 未來 demo / test role 產生時加 Casbin migration 拓展、不破壞 F11 結構。對比:Option B 只 Soybean allow 過保守、Option C 三 role 全 allow 不符 DESIGN-A「多數 role deny」、Option D 加新 role 過度 scope。

- **Q2 (brainstorm)**: sys_menu 表 seed 加不加?DESIGN-A 寫「Menu 表保留該 menu 項、靠 role × menu 關聯 + Casbin policy 雙重 gate」。但 rev1 sys_menu 表並無這些 stub 對應的 entry。→ **A:不加 menu seed、只加 endpoint + Casbin policy**。理由:(1) F11 scope 最小化、只 Casbin enforce 一層防線(雙重 gate 第二層 menu × role 留後續);(2) stub endpoint 可被前端 hardcode 路徑呼叫(`/auth/sendCaptcha` 在 base-web example login view 是寫死 button)、不依賴 menu API;(3) base-web example branch 已有對應 view、F11 不驗 base-web e2e、不必確認 menu API 是否帶出;(4) 加 menu seed 會增加 scope ~3-5 條 menu + sys_role_menu 關聯 seed、跨 2-3 migration 檔、grep base-web menu API 路徑、複雜度上升。對比:Option B 加 menu seed scope 過大、Option C 拆 F11.1/F11.2 過度顆粒。

- **Q3 (brainstorm)**: Handler 進階設計(unit test / validation / audit)該不該加?→ **A:紫極簡 stub、無 unit test、無 input validation、無 audit log**。理由:(1) stub 邏輯 stack-可見(curl 驗 200 + 預期 response 即可)、無 enum derive 等隱藏層、unit test 邊際效益低;(2) stub handler 無 DB write、不觸 Principle II audit 紀律(N/A);(3) input 用 serde `Deserialize` derive 預設行為 reject malformed JSON、validation 邏輯留真接 SMS provider 時加;(4) DESIGN-A §4.2 寫「stub 行為:接收 phone、log + 回固定碼 `000000`」直譯實作、不 over-engineering;(5) 對齊 F10.2「精簡單 file + 1 unit test SHOULD」、F11「精簡 stub + 0 unit test」更精簡。對比 F10.1 為 MUST(stack-不可見 fallback)/ F10.2 SHOULD(derive 隱藏行為)/ F11 0 test(stub 邏輯全 stack-可見)、紀律層級對齊複雜度差異。

- **Q4 (brainstorm)**: Acceptance 範疇主體 —— 多忙驗 Casbin enforce?→ **A:Soybean allow 4 endpoint + GeneralUser deny 1 endpoint = 5 個 acceptance curl**。理由:(1) Soybean 4/4 endpoint 200 = stub handler 行為對齊驗證(每個 stub 各 1 curl);(2) GeneralUser × 1 endpoint deny 驗 Casbin fail-safe(per Principle I);1 個 endpoint 足證 enforce 機制 work、4 endpoint Casbin policy 同 row pattern、不必重複驗;(3) Administrator 是 Casbin functional duplicate of Soybean(同 allow 對 4 endpoint)、跑也只是冗餘;(4) 對比 Option B「3 role × 4 endpoint = 12 curl matrix」太繁、acceptance time 過長、邊際效益低。

- **Q5 (brainstorm)**: Endpoint file 組織 + Casbin migration 組織紀律?→ **A:auth 3 條加 `sys_authentication_api.rs`(既有)、`/mock/getLastTime` 新建 `sys_mock_api.rs` + `sys_mock_route.rs`(對齊 sandbox 結構慣例)、Casbin 1 個 single migration**。理由:(1) `/auth/*` 3 條與既有 5 個 auth handler 同名前綴、合邏輯放同檔(file 從 ~150 LOC 變 ~200 LOC、仍合理);(2) `/mock/*` 1 條與 auth 語意不同(mock 是 demo 用、auth 是業務 endpoint)、拆出 `sys_mock_api.rs` 避免同檔混雜、對齊 `sys_sandbox_api.rs` rust 獨有 demo 慣例;(3) Single migration = INSERT 8 row 一次性、down() DELETE 對應 8 row、乾淨可 rollback;對比 4 個 per-endpoint migration 過度顆粒;(4) 對齊 F6 既有 pattern(`m20260518_a_f6_is_route_exist_seed.rs`、single migration)。

- **Evidence collection 2026-05-19**(grep + Read tool):
  - 既有 rust `SysAuthenticationApi` 5 handler(`server/api/src/admin/sys_authentication_api.rs:21/58/71/85/102`、login_handler / get_user_info / get_user_routes / assign_permission / assign_routes、F11 加 3 個 stub handler 同檔)
  - 既有 rust router 12 個 route file(`server/router/src/admin/`、F11 新建 `sys_mock_route.rs` 對齊 sys_sandbox_route.rs 模式)
  - 既有 F6 Casbin migration `m20260518_a_f6_is_route_exist_seed.rs`(INSERT `p` policy + `ROLE_SUPER` / `ROLE_ADMIN` 兩 role + endpoint allow、F11 沿用 pattern)
  - 既有 F5.1 seed user / role 對應:Soybean=ROLE_SUPER、Administrator=ROLE_ADMIN、GeneralUser=ROLE_USER(per `m20241024_033005_insert_sys_user.rs` + `m20241024_033933_insert_sys_user_role.rs`)
  - F4 envelope shape:`{code: number, data: object, message: string}`(F5.1 / F6 / F10 acceptance 沿用)、F11 acceptance 預期同 shape

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 4 條抽離項 stub endpoint Soybean role allow + 行為對齊(Priority: P1)🎯 MVP

operator 用 `Soybean` user(ROLE_SUPER)login 拿 access_token → 用該 token 跑 4 條 stub endpoint(`sendCaptcha` / `verifyCaptcha` / `auth/error` / `mock/getLastTime`)→ **預期 4/4 HTTP 200 + 各 stub 預期 response shape**(per DESIGN-A §4.2 stub 行為直譯)→ 紀錄 rust-api tracing log 含 `phone` field(sendCaptcha)。證明 F11 4 條 stub 註冊成功 + Casbin policy allow 對 ROLE_SUPER 生效 + stub 行為對齊 DESIGN-A §4.2 直譯。

**Why this priority**:F11 唯一含 implementation 的 user story、對齊 DESIGN-A §4.2 stub 行為直譯 = F11 核心目標。沒此 acceptance、stub endpoint 是否真註冊、Casbin allow 是否生效、stub 行為是否對齊無從驗。

**Independent Test**:用 `Soybean` user login 拿 access_token → 用該 token 跑 4 條 stub endpoint → 預期 4/4 HTTP 200 + 預期 response shape + tracing log 含 `phone` field。

**Acceptance Scenarios**:

1. **Given** stack 已起(W-FA1 7 service healthy、含 nestjs、且 F11 rust-api image 已 rebuild、F11 Casbin migration 已 rerun),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code: 0, data:{token, refreshToken, ...}, message}`、access_token 為 HS256 JWT 三段格式(F10.1 沿用)。

2. **Given** US1.1 拿到 Soybean access_token,**When** 4 個 curl:
   - `POST /api/auth/sendCaptcha` body `{"phone":"13800138000"}` → 預期 HTTP 200 + body `{code: 0, data:{code:"000000"}, msg:"success", success:true}`
   - `POST /api/auth/verifyCaptcha` body `{"phone":"13800138000","code":"000000"}` → 預期 HTTP 200 + body `{code: 0, data:{verified:true}, msg:"success", success:true}`
   - `POST /api/auth/verifyCaptcha` body `{"phone":"13800138000","code":"111111"}` → 預期 HTTP 200 + body `{code: 0, data:{verified:false}, msg:"success", success:true}`(`code != "000000"` → verified=false)
   - `GET /api/auth/error?code=DEMO001&msg=test+error` → 預期 HTTP 200 + body `{code: 0, data:{code:"DEMO001",msg:"test error"}, msg:"success", success:true}`(query 反 echo)
   - `GET /api/mock/getLastTime` → 預期 HTTP 200 + body `{code: 0, data:{time:"<ISO 8601 UTC>"}, msg:"success", success:true}`(`time` 為 RFC3339 字串、含 millisec 或秒精度、UTC)
   ,**Then** 4/4 endpoint(verifyCaptcha 兩 case 算同 endpoint)HTTP 200 + 預期 response shape 全對齊。

3. **Given** US1.2 完成,**When** `docker compose logs rust-api --tail=200 | grep "F11 stub: sendCaptcha"`,**Then** ≥ 1 line 含 `phone=` 紀錄(tracing::info! log 行為對齊、便於未來真接 SMS provider 時 trace)。

---

### User Story 2 — operator 驗 GeneralUser role deny 抽離項 stub(Priority: P2)

operator 用 `GeneralUser` user(ROLE_USER、未 allow F11 stub)login 拿 access_token → 用該 token 跑 1 條 stub endpoint(`sendCaptcha` 為代表)→ **預期 HTTP 403**(F4 envelope `{code: 403, ...}` or 4xx with Casbin enforce fail msg)。證明 Casbin policy deny GeneralUser 對 F11 stub endpoint 生效、RBAC fail-safe 紀律維持(per Principle I)。

**Why this priority**:Casbin enforce 是 F11 唯一一層防線(per Q2 拍板不加 menu × role 第二層 gate)、必驗 deny 路徑生效;1 個 endpoint 足證 enforce 機制 work、4 endpoint Casbin policy 同 row pattern、不必重複驗(per Q4)。

**Independent Test**:用 `GeneralUser` user login 拿 access_token → curl `sendCaptcha` → 預期 HTTP 403。

**Acceptance Scenarios**:

1. **Given** stack 已起 + F11 落地,**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + access_token。

2. **Given** US2.1 拿到 GeneralUser access_token,**When** `curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"phone":"13800138000"}' http://127.0.0.1:11080/api/auth/sendCaptcha`,**Then** HTTP 200 + F4 envelope `{code: 5001, data: null, msg: "您没有访问该资源的权限，请联系管理员", success: false}`(per research.md R-Q6 implement-time finding:rust-api `casbin_envelope_adapter` 把 Casbin raw 403 wrap 成 envelope、application-level code=5001=CODE_PERMISSION_CASBIN_DENY、HTTP 級回 200)、`data: null`、**不**回 `{code:"000000"}`(deny 路徑生效)。

---

### User Story 3 — operator 驗 Casbin migration init container rerun + 8 row 落 casbin_rule + W-FA1 stack regression(Priority: P3)

operator 跑 F11 acceptance 前 / 後查 postgres `casbin_rule` 表確認 F11 migration `m20260519_a_f11_extracted_stubs_seed.rs` 已執行、8 row 落地(2 role × 4 endpoint)+ W-FA1 stack 6 service 仍 healthy + migration init container exited 0。

**Why this priority**:Casbin migration 是 F11 「Casbin enforce」紀律的 DB-side baseline、必驗以證 migration 真執行 + row 真落表(不只 in code、且實際 enforce path query 得到);stack regression 是 W-FA1 既有合作的低風險驗證、對齊 F10.2 C-V7b 同性質。

**Independent Test**:跑 docker compose `migration` service rerun + `psql ... SELECT COUNT(*) FROM casbin_rule WHERE v2 IN (...) AND v4='allow'`,COUNT = 8。

**Acceptance Scenarios**:

1. **Given** stack 已起、F11 rust-api image rebuild + migration init container rerun 完成,**When** `docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust -c "SELECT v0, v2, v3, v4 FROM casbin_rule WHERE v2 IN ('/auth/sendCaptcha','/auth/verifyCaptcha','/auth/error','/mock/getLastTime') ORDER BY v0, v2"`,**Then** 回 8 row、`(v0, v2, v3)` 對齊期望(`{ROLE_SUPER, ROLE_ADMIN} × {sendCaptcha:POST, verifyCaptcha:POST, error:GET, getLastTime:GET}`、`v4` 為空字串 implicit allow、per research.md R-Q5 implement-time finding)。

2. **Given** F11 落地,**When** `docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`,**Then** 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ migration init container exited 0(rerun 後 stop)+ rust-api uptime 較短(剛 recreated)、其他 5 service uptime 較長。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `verifyCaptcha` 收 `code != "000000"` | HTTP 200 + body `{verified: false}`(per US1.2 第三 case、stub 邏輯直譯) |
| E-2 | `sendCaptcha` 收 `phone` empty string `""` | serde `Deserialize` 接受 empty(無 validate)、tracing log 含 `phone=`、回固定碼 `{code:"000000"}`;F11 不加 validation(per Q3) |
| E-3 | `sendCaptcha` 收 malformed JSON(non-`{phone}`)| serde derive reject、回 4xx(400 或 422、依 axum behavior)、不進 handler。F11 用 serde 預設 reject、不加自訂 message |
| E-4 | `auth/error` 不帶 query | query 為 None、回 `{code:"", msg:""}`(`Option<String>` unwrap_or_default)、HTTP 200 |
| E-5 | `mock/getLastTime` 連續 call 兩次 | 兩次 `time` field 字串值不同(每次 UTC now)、HTTP 200;不快取 |
| E-6 | Casbin migration 重複 rerun(idempotent)| migration init container 重跑時、`seaql_migrations` 表追蹤已執行、`m20260519_a_f11` 預期只 up() 一次、不破壞 idempotency(對齊 F6 既有 pattern) |
| E-7 | Administrator(ROLE_ADMIN)跑 F11 endpoint | 預期 4/4 HTTP 200(allow、與 Soybean Casbin functional duplicate)、F11 acceptance 不主動驗(per Q4)、屬 implicit verified by Casbin policy seed shape |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F11 MUST 加 `POST /auth/sendCaptcha` handler 在 `sys_authentication_api.rs`(per Q5 拍板)、接 `{phone: String}`、tracing::info! log `phone = %input.phone, "F11 stub: sendCaptcha called"`、回 F4 envelope `{code: 0, data: {code: "000000"}, msg: "success", success: true}`。
- **FR-002**: F11 MUST 加 `POST /auth/verifyCaptcha` handler 在 `sys_authentication_api.rs`、接 `{phone: String, code: String}`、若 `code == "000000"` 為 `data: {verified: true}`、否則 `data: {verified: false}`、HTTP 200 + F4 envelope。
- **FR-003**: F11 MUST 加 `GET /auth/error` handler 在 `sys_authentication_api.rs`、接 query `?code=&msg=`(兩個都 `Option<String>`)、回 F4 envelope `data: {code: query.code.unwrap_or_default(), msg: query.msg.unwrap_or_default()}`。
- **FR-004**: F11 MUST 新建 `rust-api/server/api/src/admin/sys_mock_api.rs` + `rust-api/server/router/src/admin/sys_mock_route.rs`、加 `GET /mock/getLastTime` handler、回 F4 envelope `data: {time: chrono::Utc::now().to_rfc3339()}`。
- **FR-005**: F11 MUST 新建 `rust-api/migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs` Casbin policy seed migration、`up()` INSERT 8 row(2 role × 4 endpoint × `p` policy with `allow`、domain=`built-in`)、`down()` DELETE 對應 8 row(WHERE `ptype='p' AND v2 IN (...)` AND `v4='allow'`)。
- **FR-006**: F11 Casbin policy seed MUST 對 `Soybean` (ROLE_SUPER) + `Administrator` (ROLE_ADMIN) `allow` 4 條 stub endpoint;對 `GeneralUser` (ROLE_USER)**不**插 row(default deny per Casbin enforce 機制、per Q1 拍板)。
- **FR-007**: F11 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV + brainstorm Q4)。
- **FR-008**: F11 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file(per Constitution Principle IV + W-FA*/F10/F10.1/F10.2 三邊零改動延伸)。
- **FR-009**: F11 MUST 不動 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`(W-FA1 既有 wire 已涵蓋、F11 不加新 envvar / secret)。
- **FR-010**: F11 MUST 不動 `deploy/front-nginx/conf.d/default.conf` / nginx config(stub 在 rust router 註冊、nginx 透明、per DESIGN-A §3.1)。
- **FR-011**: F11 MUST 不動 `rust-api/migration/src/datas/` 既有 migration 檔(F11 新建 1 個 single migration、不改既有 F1/F2/F3/F4/F5.1/F6 migration)。
- **FR-012**: F11 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit(~170-205 LOC、10 file、per analyze G2 grounding)+ outer 1-2 commit(spec docs + INTEGRATION-CHECKLIST.md milestone + SHA pin + CLAUDE.md SOP marker)+ merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1)。
- **FR-013**: F11 MUST 不寫 sys_operation_log audit log(per Q3 拍板、stub 無 DB write、Principle II N/A)。但 stub handler MUST 含 `tracing::info!` log(per FR-001:sendCaptcha;其他 3 條 stub 不強制 tracing log、屬 SHOULD)。
- **FR-014**: F11 MUST 不加 rust unit test(per Q3 拍板、stub 邏輯 stack-可見、curl 驗即可、無 derive macro 等隱藏層)。
- **FR-015**: F11 MUST 不加 input validation 比 serde 預設更嚴(per Q3、用 serde `Deserialize` derive 預設行為、reject malformed JSON、不加自訂 message)。
- **FR-016**: F11 acceptance MUST 用 inline bash + `contracts/verification-commands.md`(per F10/F10.1/F10.2 慣例、類 F6/W-FA2)、不新建 deploy script。
- **FR-017**: F11 MUST 用 `Soybean` + `GeneralUser` user 跑 acceptance(對齊 F5.1/F6/F10/F10.1/F10.2 既有慣例、per Q4);Administrator 不主動跑(Casbin functional duplicate of Soybean、per Q4)。
- **FR-018**: F11 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(對齊 F10/F10.1/F10.2)。
- **FR-019**: F11 MUST 不加 sys_menu seed row(per Q2、scope 最小化、Casbin enforce 一層防線)。
- **FR-020**: F11 MUST 不加新 sys_role(test / demo)+ user-role assignment(per Q1、複雜度提升不在 v1 範疇、留 future feature)。
- **FR-021**: F11 MUST 不接真 SMS provider / 不接 prod error tracking(per DESIGN-A §4.2 升級路徑、留 future feature)。
- **FR-022**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F11、F11 完成里程碑、Application Phase 4 後續 / 並行進度標記、F9/F12/F13/W-F11/W-F6b next-step 維持。
- **FR-023**: F11 acceptance MUST 包含 tracing log grep verify(sendCaptcha 必含 `phone=` field、per FR-001 + Q3 拍板「無 unit test 但 stub 有 log」compensate)。

### Non-Functional Requirements

- **NFR-001**: F11 acceptance 跑時間 SHOULD ≤ 10s(7 個 C-V + 4 stub curl + 1 deny curl + 1 psql + 1 log grep、不含 stack 啟動 + rust image rebuild)。
- **NFR-002**: F11 spec / plan / tasks 規模 SHOULD 對齊 10-file rust-source feature 規模(~20-25 task、~280-300 行 spec、10 file ~170-205 LOC code、per analyze G1+G2 grounding 加 `router_initialization.rs` MockRouter register file)。F6 enum-only 緊湊 feature 為更小 reference(~13 task)、F11 因 10 file rust source 每 file 各 1 task 而較多。
- **NFR-003**: F11 acceptance failure mode SHOULD 明確指 friction 落點(rust handler logic / Casbin enforce / migration init / response shape 不對齊),便於 follow-up 判斷。
- **NFR-004**: F11 完成標誌 SHOULD 為:US1 3/3 + US2 2/2 + US3 2/2 = **7/7 PASS**(對齊 F10.2 7/7 verification pattern、無 unit test 補位)。
- **NFR-005**: F11 rust image rebuild 時間 SHOULD ≤ 5 min warm(對齊 F10.2 baseline、加 ~3-4 個 rust 檔不會破壞 cargo cache hit 主體)、cold ≤ 7 min(對齊 F10.1 baseline + W-F1)。
- **NFR-006**: F11 stub handler latency SHOULD ≤ 50ms p99(4 條 stub 都是無 DB write 純記憶體操作、應遠低於既有 endpoint;不主動 benchmark、留 future observability feature)。

### Key Entities

- **rust `SysAuthenticationApi`**(`rust-api/server/api/src/admin/sys_authentication_api.rs`)— F11 加 3 個 stub handler(`send_captcha` / `verify_captcha` / `auth_error`)、~50 LOC、既有 5 個 handler 不動
- **rust `SysMockApi`**(`rust-api/server/api/src/admin/sys_mock_api.rs`、**新建**)— 1 struct + 1 handler(`get_last_time`)、~30 LOC
- **rust `SysAuthenticationRouter`**(`rust-api/server/router/src/admin/sys_authentication_route.rs`)— F11 加 3 個 route mount(`/auth/sendCaptcha` POST / `/auth/verifyCaptcha` POST / `/auth/error` GET)+ 對應 RouteInfo、~15 LOC
- **rust `MockRouter`**(`rust-api/server/router/src/admin/sys_mock_route.rs`、**新建**)— `init_mock_router()` 含 `/mock/getLastTime` GET、~25 LOC
- **rust DTO**(`server/model/src/admin/input/sys_authentication.rs` 既有檔加、對齊既有 `LoginInput` 同檔慣例)— `SendCaptchaInput {phone: String}` / `VerifyCaptchaInput {phone: String, code: String}` / `AuthErrorQuery {code: Option<String>, msg: Option<String>}`、~20 LOC
- **rust Casbin migration**(`rust-api/migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs`、**新建**)— `MigrationTrait` impl + `up()` INSERT 8 row + `down()` DELETE 8 row、~50 LOC
- **既有 nestjs `TokenStatus` 與 sys_tokens 表**— **不動**(per FR-008、F11 與 token state machine 無關)
- **既有 base-web example login view + `function/request` view + `alova/scenes` polling-request view** — **不動**(per FR-007、F11 不驗 base-web e2e、base-web hardcode 路徑呼叫 stub endpoint)
- **`casbin_rule` 表**(F6 已驗 schema)— F11 寫入時加 8 row(`p` policy)、其他 column 不變;`g` rule 沿用 F5.1 seed user-role assignment 不動

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F11 落地後跑 US1.1 → HTTP 200 + body envelope + Soybean access_token 為 HS256 JWT 三段格式(F10.1 沿用、F11 regression 驗)。
- **SC-002**: F11 落地後跑 US1.2 → 4 條 stub endpoint(verifyCaptcha 兩 case 算同 endpoint)全 HTTP 200 + 預期 response shape(`sendCaptcha → {code:"000000"}` / `verifyCaptcha(000000) → {verified:true}` / `verifyCaptcha(111111) → {verified:false}` / `auth/error → {code,msg}` / `getLastTime → {time:"<ISO>"}`)— F11 核心 stub 行為對齊。
- **SC-003**: F11 落地後跑 US1.3 → `docker compose logs rust-api --tail=200 | grep "F11 stub: sendCaptcha"` ≥ 1 line 含 `phone=` 紀錄(tracing log compensate `unit test` 缺位、per FR-001 + FR-023)。
- **SC-004**: F11 落地後跑 US2.2 → GeneralUser 用 `sendCaptcha` 收 HTTP 200 + F4 envelope `{code: 5001, data: null, msg: "您没有访问该资源的权限...", success: false}`(per research.md R-Q6、rust-api `casbin_envelope_adapter` wrap)— Casbin enforce fail-safe 對 ROLE_USER 生效(per Principle I + Q1 拍板)。
- **SC-005**: F11 落地後跑 US3.1 → `psql ... casbin_rule` 查 `WHERE v2 IN (4 endpoint)` 回 8 row、`(v0, v2, v3)` 對齊期望(`{ROLE_SUPER, ROLE_ADMIN} × {sendCaptcha:POST, verifyCaptcha:POST, error:GET, getLastTime:GET}`、v4 為空字串 implicit allow、per research.md R-Q5)。
- **SC-006**: F11 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1-2 commit + merge + optional SHA fill follow-up)。
- **SC-007**: F11 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-007 + Constitution Principle IV)。
- **SC-008**: F11 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-008 + W-FA*/F10/F10.1/F10.2 三邊零改動延伸)。
- **SC-009**: F11 不動 docker-compose.yml(`git diff HEAD -- docker-compose*.yml` 無輸出、per FR-009)。
- **SC-010**: F11 acceptance 整套 ≤ 10s(per NFR-001)。
- **SC-011**: F11 rust-api 改動範圍 = **10 file** `~170-205 LOC`(per NFR-002 + brainstorm Q5 file 組織 + analyze G2 grounding 加 router_initialization.rs MockRouter register file)。
- **SC-012**: F11 落地後跑 US3.2 → `docker compose ps` 6 service healthy + migration init container exited 0 + rust-api uptime 較短(剛 recreated)、其他 5 service uptime 較長(W-FA1 stack regression、per FR-018)。

## Assumptions

- **A-001**: F10.2 已 merge(application Phase 4 整套收尾、merge `851ec79`、refreshToken end-to-end pass、stack 穩定)。✅
- **A-002**: F6 已 merge(Casbin policy seed pattern 在 `m20260518_a_f6_is_route_exist_seed.rs` 落地驗過、F11 沿用 INSERT casbin_rule pattern)。✅
- **A-003**: F5.1 已 merge(seed user Soybean=ROLE_SUPER、Administrator=ROLE_ADMIN、GeneralUser=ROLE_USER、3 user 共用密碼 `123456`、`g` rule 既有 DB)。✅
- **A-004**: F4 已 merge(envelope shape `{code, data, message}`、F11 acceptance 沿用)。✅
- **A-005**: W-FA1 / W-FA2 / W-FA3 已 merge(`refresh_token_secret` Docker secret + nestjs container + nginx track-a + build script 全就位、F11 不動但需 stack 起)。✅
- **A-006**: F1.1 已 merge(JWT secret + `_FILE` pattern + `secret_loader.rs` generic helper、F11 access_token 沿用)。✅
- **A-007**: rust-api image rebuild ~2-3 min warm(F10.2 baseline、加 ~3-4 rust 檔不破壞 cargo cache 主體);cold ~5-7 min(F10.1 + W-F1 baseline)。
- **A-008**: rust `SysAuthenticationApi` 既有 5 handler(`server/api/src/admin/sys_authentication_api.rs:21/58/71/85/102`)file 結構穩定、F11 加 3 個 stub handler 在尾部、不重構既有。
- **A-009**: rust router 結構 12 個 route file(`server/router/src/admin/`)模式穩定、F11 新建 `sys_mock_route.rs` 對齊 `sys_sandbox_route.rs` 慣例、不重構既有 router。
- **A-010**: rust migration init container 機制(W-FA1 既有 wire、`docker compose up -d --wait migration`)會在 stack restart 時自動 rerun new migration、F11 1 個新 migration 預期 init container exited 0 + 8 row 落地。
- **A-011**: Casbin enforce middleware(F6 既有 wire)對 F11 stub endpoint 自動生效(rust router 註冊 endpoint 後 Casbin policy 自動 enforce、無需 F11 額外配 middleware)。
- **A-012**: nginx W-F5 + W-FA2 既有設計除 `/api/auth/refreshToken` 走 nestjs、其餘 `/api/*` 都 rust(F11 4 條 stub 默認走 rust、不需 F11 動 nginx config)。
- **A-013**: base-web example branch 內既有 view(captcha button / demo button)hardcode 路徑、不依賴 menu API、F11 不驗 base-web e2e 不影響 stub endpoint 可被前端用。
- **A-014**: serde `Deserialize` derive 預設 reject malformed JSON(missing field、type mismatch)、回 4xx 不進 handler、F11 不需自訂 input validation 即可有基本 reject。

## Dependencies

### Inbound(本 feature 依賴)

- **F2.1** `audit-log-infrastructure`:audit 設計、F11 無 DB write 不觸 audit 但繼承 spirit。✅(merge `209a2c8`)
- **F3** `soft-delete-infrastructure`:soft delete 設計、F11 無 DELETE 不觸但繼承 spirit。✅(merge `0f1c5c3`)
- **F4** `response-shape-alignment`:envelope shape、F11 acceptance 沿用。✅(commit `3d357e5`)
- **F5.1** `auth-login-and-dynamic-menu`:seed user(Soybean/Administrator/GeneralUser)+ `g` rule、F11 acceptance 需 login。✅(merge `e71aefe`)
- **F6** `route-guard`:Casbin migration seed pattern、F11 沿用。✅(merge `a431215`)
- **F10** `refresh-token-nestjs-bridge`:wire-up baseline、F11 不動但需 stack 起。✅(merge `8f0e84c`)
- **F10.1** `rust-jwt-refresh-token-signing`:R-8 修(rust 簽 HS256 JWT)、F11 沿用 access_token 路徑。✅(merge `48b70e6`)
- **F10.2** `rust-tokenstatus-string-align`:R-7 修(rust TokenStatus enum 對齊 nestjs)、F11 不直接依賴但 stack 穩定後做 F11 較順。✅(merge `851ec79`)
- **W-FA1** `compose-nestjs-service`:nestjs container + secret wire、F11 不動但需 stack 起。✅(merge `b095d55`)
- **W-FA2** `nginx-track-a-transitional-block`:nginx 路由規則、F11 4 條 stub 默認走 rust(不在 TRANSITIONAL block)。✅(merge `c5b7840`)
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build automation、F11 不動但 stack 需起。✅(merge `f23f38e`)

### Outbound(本 feature 解鎖)

- **F13** `rust-refresh-token-impl`:DESIGN-B 階段 rust 自驗 refresh token、F11 stub 補完讓 rust 端 API surface 完整(不再有 base-web 預期但 rust 無對應的 endpoint)
- **F14** `design-a-to-b-cutover`:F11 stub 在 DESIGN-B 階段升級或保留、邊界明確(per DESIGN-A §4.2 升級路徑)
- **base-web SPA 完整體驗**:demo role / test role 在 login view / `function/request` view / `alova/scenes` polling-request view 看到 stub button works(未來 demo/test role 加時、F11 baseline 已就位)

### 與 F11 並行可選(per DESIGN-A §6.2)

- **F9** `systemManage-alias-router`(含 batchDeleteUser stub、與 F11 同 DESIGN-A §4.2 抽離項清單但拆給 F9)
- **F7** `manage-crud-alignment`(Phase 3、依賴 F5、不直接依賴 F11)
- **F12** `cleanup-job`(Phase 4、F11/F12 可並行 per DESIGN-A §6.2)
- **W-F11** `observability`(Phase W deploy P2 剩餘、F11 不依賴)
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up、F11 不依賴)

## Out of Scope

- **OOS-001**: 不加 sys_menu seed row(per FR-019 + Q2)
- **OOS-002**: 不加新 sys_role(test / demo)+ user-role assignment(per FR-020 + Q1)
- **OOS-003**: 不寫 sys_operation_log audit(per FR-013 + Q3、stub 無 DB write、Principle II N/A)
- **OOS-004**: 不加 rust unit test(per FR-014 + Q3、stub 邏輯 stack-可見、curl 驗即可)
- **OOS-005**: 不加 input validation 比 serde 預設更嚴(per FR-015 + Q3)
- **OOS-006**: 不改 base-web SPA src(per FR-007 + Constitution Principle IV)
- **OOS-007**: 不跑 base-web SPA e2e(per Q4)
- **OOS-008**: 不改 nestjs fork source(per FR-008、三邊零改動標配)
- **OOS-009**: 不改 nginx config(per FR-010、stub 在 rust router 註冊、nginx 透明)
- **OOS-010**: 不改 docker-compose.yml / Dockerfile(per FR-009、對比 F10.1)
- **OOS-011**: 不接真 SMS provider / 不接 prod error tracking(per FR-021、留 future feature)
- **OOS-012**: 不在 nginx 配 captcha rate limit(留 W-F11 或 future)
- **OOS-013**: 不做 stub upgrade 到真實作(F11 = stub-only、future feature 換真實 SMS provider)
- **OOS-014**: 不驗 Administrator 跑 F11 endpoint(Casbin functional duplicate of Soybean、per Q4)
- **OOS-015**: 不主動 benchmark stub handler latency(per NFR-006、無 observability infrastructure 留 W-F11)

## Risks

- **R-1**(低)**Casbin policy `v0=ROLE_SUPER/ROLE_ADMIN` 與既有 seed user role assignment 不對齊**:F11 用 `ROLE_SUPER` / `ROLE_ADMIN` 兩 role name、依賴 F5.1 既有 seed user-role assignment 對應(Soybean→ROLE_SUPER、Administrator→ROLE_ADMIN)。如 F5.1 seed user-role assignment 改 role name(罕見),F11 Casbin enforce 失效。**緩解**:F6 已驗 `ROLE_SUPER` / `ROLE_ADMIN` 在 sys_user_role 既有對應、F11 沿用同名、F11 acceptance 用 `Soybean` user 等同確認 ROLE_SUPER allow path。

- **R-2**(低)**sys_authentication_api.rs 既有 5 handler + F11 +3 致 file 過大**:加 3 個 stub handler 後 file 從 ~150 LOC 變 ~200 LOC、仍合理但越界限。**緩解**:F11 不重構既有 handler、新增 handler 加在 file 尾部;未來 stub 多時可拆 `sys_stub_api.rs`、F11 不拆。

- **R-3**(極低)**`/mock/getLastTime` mock 名前綴未來膨脹**:F11 新建 `sys_mock_api.rs`、未來如有 mock-style stub 多時 file 易膨脹。**緩解**:DESIGN-A §4.2 寫 `/mock/getLastTime` 為「不升級(永久 demo 用)」、不會擴張新 stub;F11 後不主動添加 mock endpoint。

- **R-4**(極低)**Casbin `g` rule(user-role)既有 seed 缺 Administrator 或 Soybean**:F11 acceptance 依賴 `Soybean` 對應 ROLE_SUPER 的 g rule 在 DB。**緩解**:F6 acceptance 已驗 Administrator 行 sys-user 等 endpoint、`g` rule 已在 DB(F5.1 seed `m20241024_033933_insert_sys_user_role.rs`)。

- **R-5**(極低)**nestjs fork 既有 `/auth/sendCaptcha` 等 endpoint 與 rust 重疊(nginx 路由衝突)**:nestjs fork 可能含對應 endpoint。**緩解**:nginx W-F5 + W-FA2 既有設計除 `/api/auth/refreshToken` 走 nestjs、其餘 `/api/*` 都 rust(per DESIGN-A §3);F11 4 條 stub 不在 nginx TRANSITIONAL block、預設走 rust;F11 acceptance C-V3 驗 4 endpoint 由 rust 接(rust log 雙證、nestjs log 不應出現)。

- **R-6**(中)**base-web example 對 captcha shape 期待更複雜**:F11 stub 用 DESIGN-A §4.2 「回固定碼 `000000`」直譯實作、shape 為 `{code: "000000"}`。如 base-web example login view 對 sendCaptcha response 期更複雜 shape(如 `{token, expiresIn}`)、stub 可能與 base-web mismatch、demo button 不 work。**緩解**:F11 不驗 base-web e2e(per Q4)、shape mismatch 留 F11.1 follow-up;DESIGN-A §4.2 列「stub 行為」為授權的直譯實作,base-web 不對齊屬「base-web 在 fork 上的 implementation detail」、未來 base-web 對齊或加 BFF layer 解。

- **R-7**(極低)**migration init container 對既有 8 row idempotency 不對齊**:F11 1 個新 migration、如 rerun 時 INSERT 重複觸 UNIQUE constraint。**緩解**:sea-orm migration init container 機制以 `seaql_migrations` 表追蹤已執行 migration、預期 F11 migration 只 up() 一次(per F6 既有驗);如 `m20260519_a_f11` 重複觸 UNIQUE error,屬 migration 內部 bug、F11 acceptance C-V2 應 surface(COUNT > 8)。
