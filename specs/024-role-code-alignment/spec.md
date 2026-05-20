# Feature Specification: F7.2 — role-code-alignment

**Feature Branch**: `024-role-code-alignment`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "F7.2 role-code-alignment — per docs/superpowers/024-feature-role-code-alignment.md brainstorm doc(2 顯式拍板 Q + Approach A 拍板)。rust get_user_info handler 對回傳的 roles[] 套 role-code alias 映射(ROLE_SUPER→R_SUPER / ROLE_ADMIN→R_ADMIN / ROLE_USER→R_USER、未知 code 原樣 pass through);消除 F7.1 CDP demo 的 Fetch.requestPaused role alias workaround。JWT Claims.role / casbin_rule.v0 / sys_role.code 三者全不動、映射只在 getUserInfo response 邊界。1 file ~10 LOC + 1 unit test、無 migration、base-web/nestjs/docker-compose 三邊零改動。"

**Source**: [`docs/superpowers/024-feature-role-code-alignment.md`](../../docs/superpowers/024-feature-role-code-alignment.md)(brainstorming 2026-05-20 session、2 顯式拍板 Q + 1 Approach 拍板 + F7.1 CDP demo role alias workaround 承接)

**Authoritative parents**:
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) — F7.1 里程碑條目尾段「role code mismatch(`R_SUPER`/`R_ADMIN` vs `ROLE_*`)留 F7.2 role-code-alignment follow-up」+ Current Focus 下一步段 — 本 feature 承接
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle I「RBAC fail-safe」、Principle IV「base 不改動邊界」、Principle V「漸進收縮」
- F7.1 outer `554436f` + merge `efe910e`、rust-api `4de171a`(F7.2 baseline、本 branch `024-role-code-alignment` 從 `rev1-admin-root` 衍生)
- F7 implement-time pattern「後端適應 base API 預期」的 shape mapping(`output/sys_system_manage.rs` 5 Output DTO + From impl)— F7.2 role code 映射為同精神、更小規模
- F10.2 implement-time precedent:純函式 mapping 加 1 個 unit test fn — F7.2 mapping helper 為純函式、沿用此 precedent
- 既有 base-web example 分支 static route filter(`src/store/modules/route/shared.ts` / `src/router/guard/route.ts` / `src/store/modules/auth/index.ts` / `src/router/elegant/routes.ts`)— F7.2 對齊 contract

**Scope summary**:rev1 **F7.1 fix-route-getuserroutes-wiring merge `efe910e` 後第一個 follow-up feature** — F7.1 CDP browser smoke demo 階段為了讓 base-web static 模式路由過濾通過、用了 `Fetch.requestPaused` 攔 `/auth/getUserInfo` 注入 `R_SUPER`/`R_ADMIN` role alias 的 demo-only workaround。F7.2 把這個 workaround 收掉:讓 rust `getUserInfo` 直接回傳 base-web static 模式接受的 role code。

| 對齊面 | F7.2 deliverable |
|---|---|
| **US1 P1 role code alias 映射** | `rust-api/server/api/src/admin/sys_authentication_api.rs::get_user_info` handler 對回傳的 `roles[]` 套 role-code alias 映射 helper(`ROLE_SUPER`→`R_SUPER` / `ROLE_ADMIN`→`R_ADMIN` / `ROLE_USER`→`R_USER`、未知 code 原樣 pass through)。base-web static 模式 3 處 role 比對(`filterAuthRoutesByRoles` / route guard / `isStaticSuper`)接通、F7.1 CDP role alias workaround 不再需要 |

範疇刻意收緊到「**1 個 backend response-layer role code 映射 + base manage/* 3 view CDP smoke acceptance(不帶 workaround)**」。

**Commit 模式**(F7.2 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F5.1/F6/F10.1/F10.2/F11/F9/F7/F7.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**、**無 migration 改**。

**範疇外**:
- ❌ 不改 base-web SPA src(per Constitution Principle IV;`src/views/` / `src/router/` / `src/store/` / `src/typings/` 全 0 diff)
- ❌ 不改 base-web `.env`(`VITE_AUTH_ROUTE_MODE` / `VITE_STATIC_SUPER_ROLE` 不動)
- ❌ 不切 base-web dynamic auth route mode(維持 `static`、per brainstorm Q1)
- ❌ 不動 `fork260509-soybean-admin-nestjs/` 任何 file
- ❌ 不改 `docker-compose*.yml` / nginx config / Dockerfile
- ❌ 不改 migration(無新 row、無 schema、`sys_role.code` DB 不動)
- ❌ 不改 Casbin policy / `casbin_rule` 表 / JWT `Claims.role`(enforce 路徑維持 `ROLE_*`)
- ❌ 不映射 getUserInfo 以外的 role-code surface(F7 manage/role 表 `roleCode`、F9 `getAllRoles` 維持 `ROLE_*`、per brainstorm Q2)
- ❌ 不碰 F8 assign-users

## Clarifications

### Session 2026-05-20(brainstorming 階段拍板、2 顯式 Q + 1 Approach 拍板)

- **Q1 (brainstorm)**: F7.2 目標範疇 — 只解 role code 字串不符,還是順便處理 base-web auth route mode?→ **A:Option A — 只解 role code 對齊**。理由:F7.2 純粹讓 `getUserInfo` 回傳的 role code 被 base-web static 模式接受、消除 F7.1 CDP role alias workaround;auth route mode 維持 `static`。與 feature 名一致、scope 最緊。對比 Option B(順便評估 dynamic mode)會動 base-web `.env`、scope 顯著放大、屬獨立 feature。

- **Q2 (brainstorm)**: rust 多處輸出 role code,F7.2 對齊哪些 surface?→ **A:Option A — 只 getUserInfo.roles**。理由:`getUserInfo.roles` 是唯一「功能性 gate」(static route filter / route guard / `isStaticSuper` bypass 三處 role 比對);F7 manage/role 表 `roleCode`、F9 `getAllRoles` 繼續顯示真實 code `ROLE_*`(admin 看 role registry 應看真實值、且 F8 assign-users 需真實 code)。

- **Approach 拍板**: role code 對齊的實作方向 → **A:Approach A — rust `getUserInfo` response 層 role code alias 映射**。理由:跟 F7(shape mapping)、F7.1(wiring fix)同一脈絡「後端適應 base API 預期」、嚴守 Constitution IV;scope 最小(1 file ~10 LOC、無 migration、三邊零改動)。對比 Option B(改 base-web `.env` + `routes.ts`)違 Principle IV 且 `.env` 無法解 admin;Option C(rust `sys_role.code` migration rename)需改遍 `casbin_rule.v0` + JWT、blast radius 過大。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 `getUserInfo` 回傳 role code 對齊 base-web static 模式(Priority: P1)🎯 MVP

`operator` 用 `Soybean`(`ROLE_SUPER`)login 拿 access_token → curl `GET /api/auth/getUserInfo` → **預期 envelope `data.roles` 含 `R_SUPER`**(非 `ROLE_SUPER`);`Administrator`(`ROLE_ADMIN`)→ `R_ADMIN`;`GeneralUser`(`ROLE_USER`)→ `R_USER`。接著 CDP browser smoke 用三 user 任一 login 走 SPA(**不帶** F7.1 的 `Fetch.requestPaused` role alias 注入)→ navigate `/manage/menu` + `/manage/user` + `/manage/role` → 3 view 原生 render row。證明 rust `getUserInfo` 回傳的 role code 已被 base-web static 模式的路由過濾接受、F7.1 CDP role alias workaround 不再需要。

**Why this priority**:F7.2 唯一 deliverable;F7.1 CDP demo 留下的 role alias workaround 是 demo-only、不可長存,SPA 在 base-web example 分支 static 模式下若 role code 不對齊則 manage/* 等受 role 限制的路由全被濾掉。沒此 fix、每次 CDP demo / 未來 e2e 都需 workaround。

**Independent Test**:用 `Soybean` user login 拿 access_token → curl `/auth/getUserInfo` → 預期 `data.roles` 含 `R_SUPER`;CDP smoke navigate manage 3 view 不帶 workaround 仍 render。

**Acceptance Scenarios**:

1. **Given** stack 6 service healthy + F7.2 rust-api image rebuild + restart 完成,**When** `Soybean` login 後 curl `GET /api/auth/getUserInfo` 帶 `Authorization: Bearer <token>`,**Then** HTTP 200 + envelope `{code:0, success:true}` + `data.roles` 含 `R_SUPER`(不含 `ROLE_SUPER`)。
2. **Given** US1.1 PASS,**When** `Administrator` login 後 curl `/auth/getUserInfo`,**Then** HTTP 200 + envelope code:0 + `data.roles` 含 `R_ADMIN`。
3. **Given** US1.1 PASS,**When** `GeneralUser` login 後 curl `/auth/getUserInfo`,**Then** HTTP 200 + envelope code:0 + `data.roles` 含 `R_USER`。
4. **Given** US1.1-1.3 PASS,**When** CDP browser smoke 用 `Soybean` login 走 SPA(**不帶** `Fetch.requestPaused` role alias 注入)→ navigate `/manage/menu` + `/manage/user` + `/manage/role`,**Then** 3 view table DOM `.n-data-table-tbody .n-data-table-tr` 各 ≥ 預期 row 數(menu ≥ 5 / user ≥ 3 / role ≥ 3)、不顯示「无数据」。
5. **Given** F7.2 落地,**When** 三 user 任一 login + curl `/route/getUserRoutes` 與既有受 Casbin enforce 的 endpoint,**Then** Casbin enforce 不退化(HTTP 200 + envelope code:0、enforce 路徑仍用 `ROLE_*`)。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `getUserInfo` 回傳的 role code 不在映射表內(未來新增 role) | 原樣 pass through(回原 `code`、不丟、不報錯);該 role 維持原字串、不匹配 base-web static `meta.roles` — 行為等同 F7.2 前現況、無 regression |
| E-2 | user 無任何 role(`roles` 空陣列) | 映射 helper 對空陣列回空陣列;`getUserInfo` 回 `data.roles: []`、F7.2 不改此行為 |
| E-3 | JWT `Claims.role` / `casbin_rule.v0` 是否受影響 | 不受影響 — F7.2 映射只在 `getUserInfo` response 邊界;Casbin enforce 仍從 JWT(`ROLE_*`)× `casbin_rule.v0`(`ROLE_*`)、維持一致 |
| E-4 | F7 manage/role 表 `roleCode` / F9 `getAllRoles` 是否一起變 `R_*` | 否(per Q2)— 維持顯示真實 `ROLE_*`;F7.2 只動 `getUserInfo` 一個 handler |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F7.2 MUST 在 `rust-api/server/api/src/admin/sys_authentication_api.rs` 加一個 role-code alias 映射 helper(純函式),把 `getUserInfo` handler 回傳的 `roles` 陣列每個 element 依映射表轉換。
- **FR-002**: 映射表 MUST 為 `ROLE_SUPER`→`R_SUPER`、`ROLE_ADMIN`→`R_ADMIN`、`ROLE_USER`→`R_USER` 三筆,以明確 `match`(非 prefix transform)實作。
- **FR-003**: 映射 helper 對未在映射表內的 role code MUST 原樣 pass through(回原字串、不丟棄、不報錯)。
- **FR-004**: F7.2 MUST 只改 `get_user_info` handler 的 `roles` 輸出;`UserInfoOutput` struct 定義(`roles: Vec<String>`)不變、其他 field(`userId` / `userName` / `buttons`)不變。
- **FR-005**: F7.2 MUST 不改 JWT `Claims.role`、不改 `User::subject()`、不改 login 流程(`sys_auth_service::get_user_roles` 仍回 `sys_role.code`);映射只發生在 `getUserInfo` response 邊界。
- **FR-006**: F7.2 MUST 不改 Casbin policy、不改 `casbin_rule` 表、不改 `sys_role.code` DB seed(無新 migration、無 row 增減);Casbin enforce 路徑維持 `ROLE_*`。
- **FR-007**: F7.2 MUST 不映射 `getUserInfo` 以外的 role-code surface(F7 `SystemManageRoleOutput` 的 `roleCode`、F9 `getAllRoles` 等維持 `ROLE_*`、per brainstorm Q2)。
- **FR-008**: F7.2 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV;`src/` 與 `.env` 全 0 diff)。
- **FR-009**: F7.2 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file。
- **FR-010**: F7.2 MUST 不動 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`。
- **FR-011**: F7.2 MUST 不動 `rust-api/migration/` 任何 file。
- **FR-012**: F7.2 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**。
- **FR-013**: F7.2 MUST 加 1 個 rust unit test fn 驗映射 helper(對齊 F10.2 precedent:純函式 mapping 加 unit test);test 覆蓋 3 筆 known code 映射 + 1 筆 unknown code pass-through。
- **FR-014**: F7.2 acceptance MUST 用 inline bash + node CDP script + `contracts/verification-commands.md`(per F7/F7.1/F9/F11 慣例)、不新建 deploy script、不引入 e2e test framework。
- **FR-015**: F7.2 MUST 用 `Soybean`(`ROLE_SUPER`)+ `Administrator`(`ROLE_ADMIN`)+ `GeneralUser`(`ROLE_USER`)三 user 跑 acceptance;3 user 共密碼 `123456`。
- **FR-016**: F7.2 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(對齊 F7/F7.1/F9/F11)。
- **FR-017**: F7.2 CDP smoke MUST **不帶** F7.1 的 `Fetch.requestPaused` role alias 注入段;直接驗原生 role code 通過 base-web static 過濾(此為 F7.2 核心驗收差異點)。
- **FR-018**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F7.2、F7.2 完成里程碑、Application Phase 3 進度說明。

### Key Entities

- **rust `get_user_info` handler**(`rust-api/server/api/src/admin/sys_authentication_api.rs`、既有檔、F7.2 改 ~10 LOC)— 加 role-code alias 映射 helper + handler `roles` 輸出套映射 + 1 unit test fn。
- **role-code alias 映射 helper**(F7.2 新增、純函式)— `ROLE_*` → `R_*` 3-entry `match`、未知 pass through。
- **既有 `UserInfoOutput` Output DTO**(`output/sys_authentication.rs`、`roles: Vec<String>`)— F7.2 不改 struct、只改 handler 填值。
- **既有 base-web example 分支 static route filter** — **不動**(per FR-008);F7.2 對齊其 `meta.roles` / `VITE_STATIC_SUPER_ROLE` 預期的 `R_*` contract。
- **JWT `Claims.role` / `casbin_rule` / `sys_role.code`** — F7.2 不寫入、不改(維持 `ROLE_*`、Casbin enforce 依賴)。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F7.2 落地後跑 US1.1 → `Soybean` `/auth/getUserInfo` envelope `data.roles` 含 `R_SUPER`、不含 `ROLE_SUPER`。
- **SC-002**: F7.2 落地後跑 US1.2 → `Administrator` `/auth/getUserInfo` `data.roles` 含 `R_ADMIN`。
- **SC-003**: F7.2 落地後跑 US1.3 → `GeneralUser` `/auth/getUserInfo` `data.roles` 含 `R_USER`。
- **SC-004**: F7.2 落地後 CDP browser smoke 不帶 role alias workaround、navigate `/manage/menu` DOM row ≥ 5、`/manage/user` ≥ 3、`/manage/role` ≥ 3、皆不顯示「无数据」。
- **SC-005**: F7.2 落地後 Casbin enforce 不退化 — 三 user login + `/route/getUserRoutes` HTTP 200 + envelope code:0。
- **SC-006**: F7.2 rust unit test 驗映射 helper PASS(3 known code 映射 + 1 unknown pass-through)。
- **SC-007**: F7.2 不動 base-web(`git diff HEAD -- base-web/` 無輸出、含 `.env`、per FR-008)。
- **SC-008**: F7.2 不動 nestjs fork(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-009)。
- **SC-009**: F7.2 不動 docker-compose(`git diff HEAD -- docker-compose*.yml` 無輸出、per FR-010)。
- **SC-010**: F7.2 不動 migration(`cd rust-api && git diff HEAD --stat -- migration/` 無輸出、per FR-011)。
- **SC-011**: F7.2 rust-api 改動範圍 = **1 file**(`sys_authentication_api.rs`、~10 LOC + 1 unit test fn、per Scope summary)。
- **SC-012**: F7.2 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。
- **SC-013**: F7.2 落地後 `docker compose ps` 6 service healthy + rust-api uptime 較短(剛 recreated)。

## Assumptions

- **A-001**: base-web example 分支 static 模式下、`userInfo.roles` 的唯一來源是 `getUserInfo` response(brainstorm 階段 grep 確認 `filterAuthRoutesByRoles` / route guard / `isStaticSuper` 都讀 `authStore.userInfo.roles`)— 映射 `getUserInfo` 即涵蓋所有 role 比對點。
- **A-002**: base-web 不把 `userInfo.roles` 回送 rust 供 rust 再比對;rust Casbin enforce 從 JWT(`ROLE_*`)+ `casbin_rule.v0`(`ROLE_*`)、不依賴 client 送的 role。
- **A-003**: `getUserInfo` handler 的 `roles` 來自 `User::subject()`(回 JWT `Claims.role`),F7.2 在 handler 端把該 Vec 套映射即可、不需改 `User` struct 或 JWT 簽發。
- **A-004**: CDP smoke setup 沿用 F7/F7.1 R-Q4 setup(WSL2 host Edge 148 + `--remote-debugging-port=9229`);若 CDP setup 異常 → graceful degradation 為純 curl 驗 role code 已是 `R_*`(US1.1-1.3)、CDP smoke(US1.4)標 deferred manual。
- **A-005**: 既有 base-web `routes.ts` `meta.roles` 用 `R_SUPER` / `R_ADMIN` 兩種、`.env` `VITE_STATIC_SUPER_ROLE=R_SUPER`;映射表涵蓋 `R_SUPER` / `R_ADMIN` / `R_USER` 即足(`ROLE_USER` 無 role-gated static route、映射為 `R_USER` 為一致性)。
- **A-006**: rust-api image rebuild ~2-3 min warm cache(對齊 F7/F7.1 baseline);改 1 source file。

## Dependencies

### Inbound(本 feature 依賴)

- **F5.1** `auth-login-and-dynamic-menu`:`getUserInfo` handler 既有、`UserInfoOutput` 既有、3 seed user 既有。✅
- **F7.1** `fix-route-getuserroutes-wiring`:`/route/getUserRoutes` wiring 已修(F7.2 acceptance regression 驗它不退化);F7.1 CDP demo 留下的 role alias workaround 為 F7.2 收掉的對象。✅(merge `efe910e`、rust-api `4de171a`)
- **F10.2** `rust-tokenstatus-string-align`:純函式 mapping + unit test precedent。✅
- **W-FA1/W-FA2/W-FA3**:F7.2 在 W-FA1 stack with `--profile track-a` 跑。✅

### Outbound(本 feature 解鎖)

- **CDP demo / 未來 e2e**:F7.2 落地後 base manage/* CDP smoke 不再需 role alias workaround、SPA static 模式 role-gated 路由原生通。
- **F8** `assign-users`:base manage/* 3 view 在 SPA 原生通(不需 workaround)→ F8 user-role assignment UI 體驗完整。

### 與 F7.2 並行可選

- **F8** `assign-users`(application Phase 3 第三個)
- **F12** `cleanup-job` / **W-F11** `observability` / **W-F6b** `acme-cert-acquisition`
