# Implementation Plan: F13 — rust-refresh-token-impl

**Branch**: `028-rust-refresh-token-impl` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/028-rust-refresh-token-impl/spec.md`

## Summary

DESIGN-A §6.1 Phase 5(P5)第一個 feature — DESIGN-A→DESIGN-B 遷移的起點。F10 把 `POST /auth/refreshToken` 交 nestjs 補位、F10.1 讓 rust 登入已能簽發 refresh token、F10.2 對齊 `TokenStatus`;但 rust 至今無消費 / 驗證 / 輪替 refresh token 的端點。F13 補上 — rust-api 新增 `POST /auth/refreshToken`,使 rust 自身能完成 refresh token rotation,為 F14 cutover(nginx routing 改指 rust + 拔 nestjs)做準備。

技術途徑:在 rust-api 既有 crate 內新增一個 endpoint(Approach A、最小化、複用 login building block)。`POST /auth/refreshToken` 掛 public router(同 `/login`、不經 JWT middleware / Casbin);handler 取連線 context、`refresh_token` service method orchestrate:`validate_refresh_token`(新增、驗 refresh JWT)→ `sys_tokens` 查 by refresh_token → status==`unused` 檢查 → `sys_user::find_active` 重查 user(軟刪檢查 + 取身分)→ `get_user_roles` → `generate_auth_output`(重用、產新 access + 新 refresh)→ 單一 transaction 輪替(`update_many` 標舊 row `used` + INSERT 新 row)。失敗一律 F4 envelope 拒絕、不細分(FR-008)。無 DB schema 改、無 migration、無 docker-compose 改、無 nginx 改(routing 切換是 F14);base-web / nestjs 零改動;acceptance = curl + psql + docker exec;兩段式 commit。

**Phase 0 research 關鍵發現**:F13 幾乎全程重用既有元件 — `generate_auth_output` / `get_user_roles` 為 login 既有的可重用 helper、F13 refresh 直接套用(只是改由 refresh token 提供 user 身分、不驗密碼);`sys_user::find_active` 一次查詢兼軟刪檢查 + 取 username/domain;輪替 transaction 比照 `soft_delete_by_id` 的 `db.begin()` pattern。F13 **唯一新增的函式**是 `validate_refresh_token`(`REFRESH_KEYS` + `validate_aud=false`);其餘為 handler / service method / DTO / router mount 的 wiring。

> ⚠️ **Time gate**:F13 屬 P5,依 DESIGN-A §6.2「過渡橋 F10 在 DESIGN-A 形態運行 N 週驗證」後才應 `/speckit-implement`。本 plan 為設計先行。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api 既有 workspace、不指定版本)
**Primary Dependencies**: `axum`(HTTP handler、既有)、`sea-orm`(`sys_tokens` 查/寫 + `DatabaseTransaction`、既有)、`jsonwebtoken`(refresh token decode、既有經 `JwtUtils`)、`server-core`(`web::jwt` `JwtUtils`/`RefreshClaims`/新 `validate_refresh_token`、`web::auth` `Claims`、`web::error` `AppError`、`web::code`、既有 crate)、`server-model`(`sys_tokens` entity、`sys_user` facade `find_active`、`RefreshTokenInput` input DTO、既有 crate)、`server-service`(`sys_auth_service` `generate_auth_output`/`get_user_roles`/新 `refresh_token`、既有 crate)、`server-constant`(`TokenStatus`、既有);**無新 crate dep**
**Storage**: PostgreSQL — F13 **不改 schema、不增表、無 migration**;讀寫既有 `sys_tokens`(INSERT 新 row + UPDATE 舊 row `status`)、唯讀 `sys_user`(`find_active` 重查 user)、`sys_role`(`get_user_roles`)
**Testing**: rust unit test 限純函式(若 `validate_refresh_token` 析出可獨立判斷面則補 `#[cfg(test)]`;主流程為 JWT crypto + DB IO);acceptance = curl + psql + `docker compose exec` / `run`(per spec FR-023)
**Target Platform**: Linux container — rust-api docker image
**Project Type**: backend feature — rust-api worktree 既有 crate 內新增 1 個 endpoint(無新 crate、無新模組目錄)
**Performance Goals**: N/A — refresh 為低頻 auth 操作、正確性 > 速度
**Constraints**: base-web + nestjs 0 diff(Constitution IV)、無 DB schema 改、無 migration、無 `docker-compose*.yml` 改、無 nginx 改(routing 切換為 F14)、不改既有 `/auth/login` token issuance 路徑
**Scale/Scope**: rust-api worktree 6 個既有檔微改(`input/sys_authentication.rs` + `input/mod.rs` + `core/web/jwt.rs` + `service/sys_auth_service.rs` + `api/sys_authentication_api.rs` + `router/sys_authentication_route.rs`)+ 1 個新 endpoint;新增 1 函式(`validate_refresh_token`)+ 1 service method(`refresh_token`)+ 1 handler + 1 DTO + 1 router mount

無 NEEDS CLARIFICATION — brainstorm 3 拍板點 saturated、`/speckit-clarify` 0 question(taxonomy 全 Clear)、Phase 0 research 7 個 R-Q 已解。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | F13 不碰 Casbin enforce 邏輯、不碰 `casbin_rule`;`/auth/refreshToken` 為 public auth 端點(同 `/login`、非「受保護 endpoint」),refresh token 即憑證;新 access token 的 role 於 refresh 時重查 user 當下狀態 → role 被撤銷會在下次 refresh 生效(強化 fail-safe) |
| II | Soft Delete + Audit | **PASS** | F13 的 token 輪替寫入(`sys_tokens` 新 row INSERT + 舊 row `status` UPDATE)在**單一 DB transaction** 內完成(FR-011 / data-model E4),滿足 Principle II 的原子性要求。`sys_operation_log`:F13 不寫 — `sys_tokens` 為 token/session 表、**非** Principle II `AuditOperation` enum 涵蓋的 audited admin 業務實體;rust 既有 `/auth/login` 的 `sys_tokens` INSERT 同樣不寫 `sys_operation_log`,F13 refresh 與此一致(brainstorm Q2)。F13 不物理刪除任何 row、不涉 7 張軟刪表。〔註:DESIGN-A §3.3 文字提及 nestjs refresh「operation=REFRESH_TOKEN」audit;Constitution Principle II 的 operation enum 未定義 token-refresh audit op,且 Governance「Constitution 為最終權威」— F13 依 Q2 與既有 codebase 一致處理、不擴 enum、不寫 `sys_operation_log`〕〔D1 remediation:`/speckit-analyze` 將此 tension 列為 D1(HIGH);此「token/session 表 `sys_tokens` 寫入不屬 Principle II `sys_operation_log` 範疇、與既有 rust login 一致」之詮釋,經 user 於 2026-05-21 明示裁定接受(選項 A — 不改 constitution 條文、不改 F13 設計);D1 resolved〕 |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | F13 的 refresh endpoint 只直連 PostgreSQL、不呼叫 nestjs 或任何其他後端 API;F13 不改 nginx config(routing 切換是 F14);`/auth/refreshToken` 由 rust 單一負責 enforcement(F13 期間 nginx 仍指 nestjs 屬 transitional 共存、F14 才轉) |
| IV | base 不改動邊界 | **PASS** | F13 純 rust-api 後端;`base-web/` 全 0 diff(spec FR-020);refresh response 用 F4 envelope(HTTP 200 + body `code`、路線 II) |
| V | 漸進收縮 | **PASS** | F13 是 DESIGN-A→DESIGN-B 收縮的關鍵一步;rust 接手 refresh 後 DESIGN-B(rust-only)形態原樣沿用、零改動;不擴張 nestjs endpoint;F13 endpoint 不依賴 nestjs — 通過「nestjs 退場時順嗎」濾鏡(spec FR-020 不動 nestjs fork) |

**架構約束檢查**:
- **資料庫**:架構約束「rust 主導所有 migration」— F13 **無 migration**(`sys_tokens` schema F10 已建、§3.3「rust 直接接手寫、不需 schema 變動」);F13 不需 schema 改 ≠ 違反「rust 主導 migration」
- **快取與 pub-sub**:F13 不引入 token 專用 redis pub-sub(`sys_tokens` 表即 token 狀態唯一事實源、multi-instance 靠共用 postgres);Casbin `casbin:policy:invalidate` channel(W-F11)不受影響
- **Secret 注入**:F13 沿用 F10.1 既有的 refresh secret(`APP_JWT_REFRESH_SECRET` / `_FILE`),不新增 secret
- **部署形態 / TLS / observability / backup / Port / CI**:F13 不改這些配置 — N/A

**Gate 結果**:**5 PASS / 0 N/A / 0 violation** — Constitution Check 通過、無需 Complexity Tracking。F13 為 Constitution Principle V「漸進收縮(DESIGN-A→DESIGN-B)」的具體推進 feature。

## Project Structure

### Documentation (this feature)

```text
specs/028-rust-refresh-token-impl/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出(/speckit-plan)— R-Q1~R-Q7
├── data-model.md        # Phase 1 產出(/speckit-plan)— E1~E6 元件模型
├── quickstart.md        # Phase 1 產出(/speckit-plan)
├── contracts/
│   └── verification-commands.md   # Phase 1 產出 — C-V1~C-V10
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(本指令不產)
```

### Source Code (rust-api worktree)

```text
rust-api/server/                                  (worktree)
├── model/src/admin/input/
│   ├── sys_authentication.rs    # 改:加 RefreshTokenInput DTO
│   └── mod.rs                   # 改:re-export RefreshTokenInput
├── core/src/web/jwt.rs          # 改:加 validate_refresh_token 函式
├── service/src/admin/sys_auth_service.rs   # 改:加 refresh_token service method
├── api/src/admin/sys_authentication_api.rs # 改:加 refresh_token_handler
└── router/src/admin/sys_authentication_route.rs  # 改:init_authentication_router 加 /refreshToken mount
（無新 crate、無新模組目錄、無 migration;docker-compose / nginx / base-web / nestjs 全不動）
```

**Structure Decision**: F13 為 rust-api worktree 既有 crate 內的中小型 wiring feature — 6 個既有檔微改,新增 1 個 public endpoint。不新增 crate、不新增模組目錄(對比 F12 新增 `server/cleanup` crate)。新增的唯一函式 `validate_refresh_token` 落在 `server-core::web::jwt`(與既有 `validate_token` / `generate_refresh_token` 同檔);輪替邏輯 inline 於 `refresh_token` service method(不新增 `sys_tokens` facade — F13 minimal、per research R-Q4)。對比 F10.1(rust-jwt-refresh-token-signing、改 jwt 簽發端)— F13 補的是對稱的「驗證 + 輪替」消費端。

## Phase 0: research(見 [research.md](research.md))

F13 brainstorm 已 saturated(3 拍板點);Phase 0 由一支 codebase research agent 對 `rust-api/` 調查,解 brainstorm doc §9 的 7 個 R-Q:
- R-Q1:重用 `generate_auth_output` + `get_user_roles`;refresh 由 user_id 重查 `sys_user::find_active` + roles 重建 Claims
- R-Q2:新增 `validate_refresh_token`(`global::REFRESH_KEYS` + `Validation` `validate_aud=false` + issuer);不能重用 `validate_token`(不同金鑰 + 不同 Claims 型別)
- R-Q3:refresh handler 以與 `login_handler` 相同的 axum extractor 取 ip/port/user_agent/request_id;`address` 走 `xdb::searcher::search_by_ip`
- R-Q4:輪替於 `refresh_token` service method 內單一 `DatabaseTransaction`(`db.begin()` → `update_many` 標舊 row `used`(filter 帶 `status=Active` 解並行競態)→ INSERT 新 row → `commit`);不新增 `sys_tokens` facade、不改 `AccessTokenEvent`
- R-Q5:error code — 缺欄位→HTTP 400(4001);refresh token 簽章無效/過期/查無/status 非 unused → 統一 `code 3333`(不細分、FR-008);軟刪 user → `code 8888`;1 個 implement-階段驗證點(base-web refresh-failure 期待碼)
- R-Q6:掛 `init_authentication_router()` public router、與 `/login` 同層、不需 `RouteInfo` 註冊
- R-Q7:重用 `sys_user::find_active` — 一次查詢兼軟刪檢查 + 取 username/domain

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 `RefreshTokenInput` DTO / E2 `validate_refresh_token` 函式 / E3 `refresh_token` service method / E4 sys_tokens 輪替 transaction / E5 `refresh_token` handler / E6 public router mount;含 refresh data flow 圖
- **contracts/verification-commands.md**:C-V1~C-V10 — image rebuild / refresh 成功回新 token pair / 輪替 sys_tokens / 新 access token 可用 / 已用 token 重用被拒 / 無效+缺欄位 / 軟刪 user 被拒 / 不寫 operation_log+login_log / dev stack regression + nginx 不變 / three-side scope
- **quickstart.md**:F13 落地操作(6 檔改動 + build + acceptance + 兩段式 commit)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — data-model E1-E6 確認無 DB schema 改、無 base-web 改、無 nestjs 改、無服務間 forward;輪替寫入單一 transaction(II 原子性);F13 為 Principle V「漸進收縮」推進;**5 PASS / 0 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
