# Feature Specification: F8 — assign-users

**Feature Branch**: `025-assign-users`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "F8 assign-users — 新增 `POST /authorization/assign-users` endpoint,接上既有 `assign_users` service method 的 user-role 指派 wiring。per docs/superpowers/025-feature-assign-users.md brainstorm doc(3 顯式拍板 Q + Approach A 拍板)。`AssignUserDto` + `assign_users` trait + service impl 三層已存在、F8 只缺 HTTP wiring(API handler + route mount + Casbin policy seed);role-centric 整組覆蓋語意;只寫 `sys_user_role` join table、不寫 Casbin g rule;只 ROLE_SUPER 可呼叫。~5 file ~35 LOC、base-web/nestjs/docker-compose 三邊零改動。"

**Source**: [`docs/superpowers/025-feature-assign-users.md`](../../docs/superpowers/025-feature-assign-users.md)(brainstorming 2026-05-20 session、3 顯式拍板 Q + 1 Approach 拍板)

**Authoritative parents**:
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) — Current Focus 下一步「application Phase 3 第三個 feature F8 assign-users」+ F7/F7.1/F7.2 里程碑「解鎖 F8 assign-users」— 本 feature 承接、收尾 Phase 3 至 3/3
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1 + §6.1 — F8 = `/authorization/assign-users`(rust 新做)、依賴 F7、交付「完整 user × role 關聯管理」
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle I「RBAC fail-safe」、Principle II「Soft Delete + Audit」、Principle IV「base 不改動邊界」、Principle V「漸進收縮」
- F7.2 outer `68410df` + merge `476ca88`、rust-api `84cbc19`(F8 baseline、本 branch `025-assign-users` 從 `rev1-admin-root` 衍生)
- 既有 sibling `/authorization/assign-permission` + `/authorization/assign-routes`(`init_authorization_router`)— F8 對齊其 mount + Casbin seed pattern
- F7.1 implement-time pattern「wiring feature、無 unit test、curl acceptance」+ F6/F9/F7 「新 Casbin policy seed migration」pattern — F8 沿用

**Scope summary**:rev1 **application Phase 3 第三個也是最後一個 feature** — F7/F7.1/F7.2 把 base manage/* 後台讀路徑與 role code 對齊跑通後,F8 補上唯一缺的寫路徑「user ↔ role 指派」。Brainstorm grep 確認:`assign_users` 的 **DTO + trait + service impl 三層全已存在**,F8 唯一缺口是 HTTP wiring。

| 對齊面 | F8 deliverable |
|---|---|
| **US1 P1 user-role 指派 endpoint** | 新增 `SysAuthenticationApi::assign_users` handler + `init_authorization_router` mount `POST /authorization/assign-users` + 1 筆 Casbin `p` policy seed(ROLE_SUPER allow);接上既有 `SysAuthorizationService::assign_users(role_id, user_ids)` service method(寫 `sys_user_role` join table、整組覆蓋語意) |

範疇刻意收緊到「**1 個 backend user-role 指派 endpoint wiring + curl/psql acceptance**」。

**Commit 模式**(F8 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F5.1/F6/F10.x/F11/F9/F7/F7.1/F7.2):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**;**有 1 個新 Casbin seed migration**(對比 F7.2 無 migration、同 F6/F9/F7)。

**範疇外**:
- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV;`src/` 與 `.env` 全 0 diff、含 manage/user `user-operate-drawer` 的 `userRoles` stub 欄位)
- ❌ 不動 `fork260509-soybean-admin-nestjs/` 任何 file
- ❌ 不改 `docker-compose*.yml` / nginx config / Dockerfile
- ❌ 不動 DB schema(`sys_user_role` 表既有、F8 不改;只新增 1 個 Casbin `p` policy seed migration)
- ❌ 不重寫 `assign_users` service method、不改 `AssignUserDto`、不改 `TAuthorizationService` trait
- ❌ 不寫 Casbin `g` rule、不改 login `get_user_roles` 機制(per brainstorm Q2)
- ❌ 不加 user-centric「assign roles to a user」endpoint(F8 = role-centric `/authorization/assign-users`、per feature 名 + DESIGN-A + 既有 service method 方向)
- ❌ 不加 `/systemManage/*` alias(per Approach A;base-web example 分支無此呼叫)
- ❌ 不放寬 ROLE_ADMIN 對 `/authorization/assign-users` 的存取(per brainstorm Q3、ROLE_SUPER-only)

## Clarifications

### Session 2026-05-20(brainstorming 階段拍板、3 顯式 Q + 1 Approach 拍板)

- **Q1 (brainstorm)**: F8 成功標準?→ **A:後端 endpoint 交付 + curl 驗收**。F8 = 交付 `POST /authorization/assign-users` 後端 endpoint、用 curl + psql + re-login 驗收(同 F7/F7.1/F7.2/F9 後端-only 模式);base-web example 分支維持 stub、0 diff;收尾 application Phase 3(3/3)。對比「連 base-web SPA UI 一起跑通」會破 Constitution IV「base 不改動」邊界。

- **Q2 (brainstorm)**: user→role 寫入走哪個機制?→ **A:用既有 service method、只寫 `sys_user_role` join table**。F8 endpoint 直接接既有 `assign_users` service method(寫 join table、diff INSERT/DELETE);不寫 Casbin `g` rule — 因 login `get_user_roles`(`sys_auth_service.rs:256`)join `sys_user_role` table 取 role code、寫 join table 即在被異動 user 下次 login 生效。**DESIGN-A §3.1「寫 Casbin `g` rule」對 rev1 codebase 不精確**(rev1 實際機制 = join table、service method 已正確處理)、視為 spec drift 文件化(同 F7 R-Q-AT1 / F9 R-Q1 modal pattern)。

- **Q3 (brainstorm)**: 誰能呼叫 `POST /authorization/assign-users`?→ **A:只 ROLE_SUPER**。F8 Casbin seed migration 只插 1 row(ROLE_SUPER 對 `/authorization/assign-users` POST allow)、對齊既有 sibling `assign-permission`/`assign-routes`(都只 ROLE_SUPER);user-role 指派為高權限 RBAC 管理動作、限超管。

- **Approach 拍板**: → **Approach A — 薄 wiring,只補 `/authorization/assign-users`**。因 DTO + trait + service impl 三層已就緒,F8 架構上只有一條合理路線。對比 Approach B(額外加 F9-style `/systemManage/*` alias)= base-web example 分支無此呼叫、屬 over-building、rejected。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 透過 `assign-users` endpoint 維護 role 的 user 集合(Priority: P1)🎯 MVP

`operator` 用 `Soybean`(`ROLE_SUPER`)login 拿 access_token → curl `POST /api/authorization/assign-users` 帶 body `{"roleId":"<role>","userIds":["<user>", ...]}` → **預期 HTTP 200 + envelope `{code:0, success:true}`**;`sys_user_role` join table 反映新的 user 集合(整組覆蓋:傳入清單 = 該 role 指派後的完整 user 集合)。被新增 / 移除 role 的 user 下次 login 後,JWT 內 role code 隨之變更。非 `ROLE_SUPER`(如 `ROLE_ADMIN`、`ROLE_USER`)呼叫此 endpoint → Casbin enforce deny → envelope `{code:5001, success:false}`。

**Why this priority**:F8 唯一 deliverable;它補完 application Phase 3 唯一缺的 user-role 寫路徑(F7/F7.1/F7.2 已交付讀路徑與 role code 對齊)。沒有 F8,rev1 的 user × role 關聯無 HTTP 管理介面、DESIGN-A §3.1 明列的 `/authorization/assign-users` endpoint 缺位、application Phase 3 無法收尾(3/3)。

**Independent Test**:用 `Soybean` login → 擷取某 role 現有 user 集合 → curl `assign-users` 做加項異動 → HTTP 200 + envelope code:0 → psql 驗 `sys_user_role` → 還原 → psql 驗 seed 未污染。

**Acceptance Scenarios**:

1. **Given** stack 6 service healthy + F8 rust-api image rebuild + restart 完成,**When** `Soybean` login 後 curl `POST /api/authorization/assign-users` 帶 `Authorization: Bearer <token>` 與 body `{"roleId":"<role R>","userIds":[<R 現有 user 集合 ∪ 1 個新 user>]}`,**Then** HTTP 200 + envelope `{code:0, success:true}`。
2. **Given** US1.1 PASS,**When** 查詢 `sys_user_role` join table,**Then** role R 對應的 `(user_id, role_id)` row 反映傳入的完整 user 集合(新 user 的 row 存在)。
3. **Given** US1.1-1.2 PASS,**When** 被新增到 role R 的 user 重新 login 後 curl `/auth/getUserInfo`,**Then** HTTP 200 + envelope code:0 + `data.roles` 含 role R 的 code(經 F7.2 alias 映射為 `R_*` 形式)。
4. **Given** US1.1-1.3 PASS,**When** 用 role R 的**原始** user 集合再呼叫一次 `assign-users`(還原),**Then** HTTP 200 + envelope code:0 + `sys_user_role` 回到 F8 執行前的 seed 狀態(無污染)。
5. **Given** F8 落地,**When** `Administrator`(`ROLE_ADMIN`)或 `GeneralUser`(`ROLE_USER`)login 後 curl `POST /api/authorization/assign-users`,**Then** Casbin enforce deny → HTTP 200 + envelope `{code:5001, success:false}`(per F11 R-Q6 `casbin_envelope_adapter` envelope wrap)。
6. **Given** F8 落地,**When** `Soybean` login 後 curl 既有 sibling `POST /authorization/assign-permission` 與 `POST /authorization/assign-routes`,**Then** 兩者不退化(HTTP 200 + envelope code:0)。
7. **Given** F8 落地,**When** `Soybean` login 後 curl `POST /api/authorization/assign-users` 帶空 `userIds`(`{"roleId":"3","userIds":[]}`)或空 `roleId`(`{"roleId":"","userIds":["3"]}`),**Then** 既有 `AssignUserDto` 的 `min 1` validation 擋下 → envelope 非 `code:0`(validation error)、`sys_user_role` 未被寫入(對齊 Edge Cases E-1 + E-2)。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `userIds` 傳空陣列 | `AssignUserDto` validate `min 1` 擋下 → validation error(非 code:0)。意涵:無法用此 endpoint「清空 role 的所有 user」— 行為與 sibling `AssignRouteDto` 一致、接受現況 |
| E-2 | `roleId` 傳空字串 | `AssignUserDto` validate `min 1` 擋下 → validation error |
| E-3 | `roleId` 指向不存在的 role | service method 查 role 存在性 → `AppError` → F4 envelope error code(非 code:0) |
| E-4 | `userIds` 含不存在的 user id | service method 查 user 存在性 → `AppError` → F4 envelope error code(非 code:0) |
| E-5 | 傳入與 role 現有 user 集合完全相同的清單 | diff 無變化 → no-op transaction → 仍回 HTTP 200 + envelope code:0 |
| E-6 | 整組覆蓋語意導致既有 user 被移除 | 預期行為:傳入清單 = 指派後完整集合;未列入的既有 user 其 `sys_user_role` row 被 DELETE。acceptance 採 capture→assign→verify→restore 避免污染 seed |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F8 MUST 在 `rust-api/server/api/src/admin/sys_authentication_api.rs` 新增一個 `assign_users` API handler,接收 `ValidatedForm<AssignUserDto>`、取得 `Extension<Arc<SysAuthorizationService>>`、呼叫既有 `SysAuthorizationService::assign_users(role_id, user_ids)`、成功回 `Res::new_data(())`。
- **FR-002**: F8 handler MUST 比照既有 sibling `assign_routes` handler 形態(不需 `enforcer` 參數;對比 `assign_permission` 需 `enforcer`);F8 不改既有 `assign_permission` / `assign_routes` / 其他 handler。
- **FR-003**: F8 MUST 在 `rust-api/server/router/src/admin/sys_authentication_route.rs` 的 `init_authorization_router` 加一條 route mount `POST /authorization/assign-users` 指向新 handler,並加對應 `RouteInfo` 註冊(`Method::POST`、service name 對齊 sibling 既有寫法)。
- **FR-004**: F8 MUST 重用既有 `AssignUserDto`(`server/model/src/admin/input/sys_authorization.rs`、`{role_id, user_ids}` 各 validate `min 1`、camelCase serde);F8 不新增、不修改此 DTO。
- **FR-005**: F8 MUST 重用既有 `SysAuthorizationService::assign_users` service method(寫 `sys_user_role` join table、整組覆蓋語意);F8 不重寫、不修改此 service method 與 `TAuthorizationService` trait。
- **FR-006**: F8 MUST 新增 1 個 Casbin policy seed migration,INSERT 1 筆 `p` policy row 讓 `ROLE_SUPER` 對 `/authorization/assign-users` POST 為 allow;migration 須註冊進 `migration/src/datas/mod.rs` 與 `migration/src/lib.rs` 的 Migrator vec。
- **FR-007**: F8 Casbin seed MUST 只給 `ROLE_SUPER`(對齊既有 sibling `/authorization/assign-permission` + `/authorization/assign-routes`、都只 ROLE_SUPER);F8 不給 `ROLE_ADMIN`、不放寬其他 role。
- **FR-008**: F8 MUST 不寫 Casbin `g` rule、不改 login `get_user_roles` 機制(per brainstorm Q2;user→role 關聯權威來源 = `sys_user_role` join table,service method 已正確寫入)。
- **FR-009**: F8 MUST 不動 DB schema(`sys_user_role` 表既有);F8 唯一 migration 為 Casbin policy seed、無 schema 變更、無表結構改動。
- **FR-010**: F8 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV;`src/` 與 `.env` 全 0 diff)。
- **FR-011**: F8 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file。
- **FR-012**: F8 MUST 不動 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`。
- **FR-013**: F8 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**。
- **FR-014**: F8 MUST **不**加 rust unit test(F8 為純 wiring、無可獨立測之 pure function;service method 為既有、F8 範疇外)— 對齊 F7.1 wiring feature precedent。
- **FR-015**: F8 acceptance MUST 用 inline bash(curl + psql)+ `contracts/verification-commands.md`(per F7/F7.1/F7.2/F9 慣例)、不新建 deploy script、不引入 e2e test framework。
- **FR-016**: F8 MUST 用 `Soybean`(`ROLE_SUPER`)跑 happy-path acceptance、用 `Administrator`(`ROLE_ADMIN`)+ `GeneralUser`(`ROLE_USER`)跑 deny acceptance;3 user 共密碼 `123456`。
- **FR-017**: F8 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(對齊 F7/F7.1/F7.2/F9)。
- **FR-018**: F8 acceptance MUST 採 capture → assign → verify → restore 模式(擷取 role 現有 user 集合 → 加項異動 → 驗證 → 還原原集合),確保 `sys_user_role` seed 資料不被污染。
- **FR-019**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F8、F8 完成里程碑、Application Phase 3 進度說明(3/3 完成)。

### Key Entities

- **rust `assign_users` API handler**(`rust-api/server/api/src/admin/sys_authentication_api.rs`、F8 新增、~10 LOC)— 接 `ValidatedForm<AssignUserDto>`、呼叫既有 service method。
- **`/authorization/assign-users` route mount**(`rust-api/server/router/src/admin/sys_authentication_route.rs`、F8 新增)— `init_authorization_router` 內 1 條 route + 1 條 `RouteInfo`。
- **F8 Casbin policy seed migration**(`rust-api/migration/src/datas/`、F8 新建)— 1 筆 `p` policy row(`ROLE_SUPER` × `/authorization/assign-users` × POST × allow)。
- **既有 `AssignUserDto`**(`server/model/src/admin/input/sys_authorization.rs`、`{role_id, user_ids}`)— F8 不改、只重用。
- **既有 `SysAuthorizationService::assign_users`**(`server/service/src/admin/sys_authorization_service.rs`、寫 `sys_user_role` join table、整組覆蓋)— F8 不改、只重用。
- **既有 `sys_user_role` join table**(`(user_id, role_id)` 複合主鍵)— user↔role 關聯權威來源;F8 不改 schema、透過 service method 寫入。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F8 落地後 `ROLE_SUPER` 呼叫 `POST /api/authorization/assign-users` 帶合法 `{roleId, userIds}` → HTTP 200 + envelope `{code:0, success:true}`。
- **SC-002**: F8 落地後該次呼叫使 `sys_user_role` join table 反映傳入的完整 user 集合(可由 psql 查得)。
- **SC-003**: F8 落地後被新增到某 role 的 user 重新 login → `/auth/getUserInfo` `data.roles` 反映該 role(經 F7.2 alias 為 `R_*`)。
- **SC-004**: F8 落地後 `ROLE_ADMIN` / `ROLE_USER` 呼叫 `assign-users` → envelope `{code:5001, success:false}`(Casbin deny)。
- **SC-005**: F8 落地後既有 sibling `/authorization/assign-permission` + `/authorization/assign-routes` 不退化(HTTP 200 + envelope code:0)。
- **SC-006**: F8 acceptance 採 capture→assign→verify→restore、完成後 `sys_user_role` 回到 F8 執行前 seed 狀態(無污染)。
- **SC-007**: F8 不動 base-web(`git diff HEAD -- base-web/` 無輸出、含 `.env`、per FR-010)。
- **SC-008**: F8 不動 nestjs fork(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-011)。
- **SC-009**: F8 不動 docker-compose(`git diff HEAD -- docker-compose*.yml` 無輸出、per FR-012)。
- **SC-010**: F8 唯一 migration 為 Casbin policy seed(1 `p` row)、無 DB schema 變更(per FR-009)。
- **SC-011**: F8 rust-api 改動範圍 = **約 5 file**(`sys_authentication_api.rs` + `sys_authentication_route.rs` 改 2 + 新 Casbin migration 1 + `datas/mod.rs` + `lib.rs` 註冊 2)、~35 LOC。
- **SC-012**: F8 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。
- **SC-013**: F8 落地後 `docker compose ps` 6 service healthy + rust-api uptime 較短(剛 recreated)。
- **SC-014**: F8 落地後 application Phase 3 達 **3/3 完成**(F9 + F7 + F8)。
- **SC-015**: F8 落地後 `Soybean` 呼叫 `assign-users` 帶空 `userIds` 或空 `roleId` → envelope 非 `code:0`(既有 `AssignUserDto` `min 1` validation 擋下)、`sys_user_role` 無變動(對齊 Edge Cases E-1 + E-2)。

## Assumptions

- **A-001**: `assign_users` 的 DTO(`AssignUserDto`)+ trait method + service impl 三層在 F8 baseline 已存在且正確(brainstorm 階段 grep 確認:`input/sys_authorization.rs:30-38`、`sys_authorization_service.rs:69` trait + `:302` impl);F8 只補 HTTP wiring。
- **A-002**: `SysAuthorizationService::assign_users` 為整組覆蓋語意(傳入 `user_ids` = 指派後該 role 的完整 user 集合、diff 既有 `sys_user_role` 後 INSERT 新增 + DELETE 移除);F8 沿用此語意、不改。
- **A-003**: login `pwd_login` → `get_user_roles` join `sys_user_role` table 取 role code → 進 JWT;故寫 `sys_user_role` 即在被異動 user **下次 login** 生效(非即時 — 既有 token 不受影響、需 re-login)。
- **A-004**: 既有 sibling `/authorization/assign-permission` + `/authorization/assign-routes` 在 `init_authorization_router` 已 mount、Casbin seed(`m20241024_082926_insert_casbin_rule.rs`)只給 `ROLE_SUPER`;F8 對齊此 pattern。
- **A-005**: F8 新 Casbin migration 檔名日期排在現有最新 migration(`m20260521` F7)之後(例如 `m20260522_a_f8_assign_users_seed.rs`),確保 migration 執行順序正確。
- **A-006**: rust-api image rebuild ~2-3 min warm cache(對齊 F7/F7.1/F7.2 baseline);F8 改 ~5 file rust source + migration。
- **A-007**: 3 個 seed user(Soybean/Administrator/GeneralUser)與 3 個 role(ROLE_SUPER/ROLE_ADMIN/ROLE_USER)在 F8 baseline 為 1:1 對應(`sys_user_role` seed);F8 acceptance 以此為已知起始狀態。

## Dependencies

### Inbound(本 feature 依賴)

- **F7** `manage-crud-alignment`:base manage/* 讀路徑 + ROLE_ADMIN Casbin 補位完成 — F8 在此 manage/* 背景上補 user-role 寫路徑。✅(merge `136b1eb`)
- **F7.1** `fix-route-getuserroutes-wiring`:`/route/getUserRoutes` wiring 修復。✅(merge `efe910e`)
- **F7.2** `role-code-alignment`:`getUserInfo` role code alias 映射 — F8 acceptance US1.3 驗 re-login 後 role code 反映時依賴。✅(merge `476ca88`、rust-api `84cbc19`)
- **F5.1** `auth-login-and-dynamic-menu`:login 流程、`get_user_roles`、3 seed user。✅
- **W-FA1/W-FA2/W-FA3**:F8 在 W-FA1 stack with `--profile track-a` 跑。✅

### Outbound(本 feature 解鎖)

- **application Phase 3 收尾**:F8 完成後 F9 + F7 + F8 = Phase 3 **3/3 完成**。
- **完整 user × role 關聯管理**(DESIGN-A §6.1):rev1 rust-api 補齊 `/authorization/assign-*` 三件套(assign-permission / assign-routes / assign-users)。
- **未來 base-web(非 example 分支)/ e2e**:F8 endpoint 就位後,未來 base-web manage UI 或 e2e 可直接呼叫。

### 與 F8 並行可選

- **F12** `cleanup-job` / **W-F11** `observability` / **W-F6b** `acme-cert-acquisition`
