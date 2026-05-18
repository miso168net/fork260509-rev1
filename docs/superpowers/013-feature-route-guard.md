# Feature Specification: F6 — route-guard(`/route/isRouteExist`)

**Feature ID**: F6(per [`INTEGRATION-DESIGN-A-RUST-NESTJS`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 + [`INTEGRATION-DESIGN-B-RUST-ONLY`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) §6.1、Phase 2 P2 第二個 application feature)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立、預期 `013-route-guard`)
**Created**: 2026-05-18
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-18 session

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 F6(`/route/{getConstantRoutes, isRouteExist}` + base vue-router guard 串接)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) §6.1 F6(identical to DESIGN-A、無 nestjs 差異)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle II 全 INSERT/UPDATE 寫 audit — F6 純 read endpoint、無 audit;Principle IV base 不改動邊界 — F6 後端適配、base-web src 零改動)
- [`specs/005-auth-login-and-dynamic-menu/spec.md`](../../specs/005-auth-login-and-dynamic-menu/spec.md)(F5.1、已實作 `/route/getConstantRoutes` + `/route/getUserRoutes` + `init_protected_menu_router` 結構 — F6 沿用)
- [`base-web/src/router/guard/route.ts`](../../base-web/src/router/guard/route.ts)(既有 vue-router guard、line 113-122 `getIsAuthRouteExist` 呼叫情境)
- [`base-web/src/service/api/route.ts`](../../base-web/src/service/api/route.ts) + [`base-web/src/service-alova/api/route.ts`](../../base-web/src/service-alova/api/route.ts)(既有 `fetchIsRouteExist` 兩套 client、F6 後端適配對齊)
- [`base-web/src/store/modules/route/index.ts`](../../base-web/src/store/modules/route/index.ts) line 297-307(`getIsAuthRouteExist` store action、dynamic auth route mode 才呼叫 backend)
- [`rust-api/server/router/src/admin/sys_menu_route.rs`](../../rust-api/server/router/src/admin/sys_menu_route.rs)(F5.1 既有 `init_protected_menu_router` + `/route/getUserRoutes` mount pattern — F6 加 1 條 `/route/isRouteExist`)

**Scope summary**:rev1 application Phase 2 第二個 feature(F5.1 後)— **新增 rust-api 1 個 endpoint `GET /route/isRouteExist?routeName=<name>`** 補完 base-web vue-router guard 在 dynamic auth route mode 下的「not-found vs 無權限」disambiguation 邏輯。

**範疇驚奇地小**:DESIGN-A §6.1 F6 描述「`/route/{getConstantRoutes, isRouteExist}` + base vue-router guard 串接」內、**`/route/getConstantRoutes` 已在 F5.1 範疇實作完成**(per F5.1 spec FR-014 + `sys_menu_route.rs:15-16` mount),F6 真正剩下的只有:
1. **`/route/isRouteExist`** rust 端新 handler / service / DTO / route mount(預估 4-5 個 rust file 改動)
2. **base-web 零改動**(per Constitution Principle IV、既有 `fetchIsRouteExist` wiring 已對齊新 endpoint)

**Endpoint contract**:
- Method:`GET`
- Path:`/route/isRouteExist`
- Query:`routeName=<name>`(camelCase、對齊 base-web 既有呼叫)
- Auth:**Protected**(per brainstorm Q1)— `init_protected_menu_router` mount、auth middleware enforce token、**無 Casbin policy**(所有 logged-in user 任何 role 可查、避免 over-engineering)
- Response:F4 envelope `{code:0, msg:"...", data: true|false}`(`data` 為 plain boolean、對齊 base-web 既有 `Api.Route` 型別 `<boolean>`)
- 「Route 存在」定義:**全域存在性**(`sys_menu` 表內、`deleted_at IS NULL` + `status = 'enabled'` 的 row 存在)、與 user role 無關(per brainstorm 自然推論 — 呼叫情境是 logged-in user not-found 攔截 disambiguate)

**範疇外**:
- `/route/getConstantRoutes` / `/route/getUserRoutes`(F5.1 已實作)
- 新增 sys_menu seed / route 結構(F7 manage-crud-alignment)
- base-web src 任何改動(per Principle IV)
- Caching(Redis / in-memory)— 預期低頻、不需
- Rate limiting / WAF(後續 prod hardening)
- user-specific 可訪問性查詢(那是 getUserRoutes 範疇)
- DESIGN-A vs DESIGN-B 分歧:F6 對兩個 track 完全 identical(per DESIGN-B §6.1「繼承 DESIGN-A F6 identical」)、無 track-specific 邏輯

**Commit 模式**:**兩段式 commit**(per CLAUDE.md §6.1)— F6 動 rust-api worktree(handler / service / DTO / route mount)、必須走 worktree commit + outer SHA pin 更新。**有別於** W-F5/W-F7/W-F6 的單段(那些純 outer)。

## Clarifications

### Session 2026-05-18(brainstorming 階段拍板、1 項顯式 + 多項自然推論)

- **Q1**: `/route/isRouteExist` 需要 token(protected)還是 public(同 getConstantRoutes)? → **A: Protected**(同 getUserRoutes、mount 在 `init_protected_menu_router`、auth middleware enforce token、無 Casbin policy)。理由:(a) 呼叫情境本身是 logged-in user 被 not-found 攔截想 disambiguate(per base-web guard logic、only logged in user 才會走到 fetchIsRouteExist)、(b) public 會洩 admin menu 全 route name 給未 auth user(輕微 information disclosure)、(c) 無 Casbin policy 是因為所有 logged-in user 都應能查 — 加 policy 會讓無 menu 權限 user 拿不到 403 重導、退化為原 404、UX 變差(per Q1 Option C 拒絕理由)。

- **Q-自然推論**:**「Route 存在」定義 = 全域存在(`sys_menu` active row exists)、與 user role 無關**。理由:base-web guard 呼叫 `fetchIsRouteExist` 的情境是「user logged in 訪問 path 被 not-found 攔截、要區分 'route 真不存在(404)' vs 'route 存在但 user 無權限(403)'」(per `router/guard/route.ts:113-122`);所以是全域存在性、不依 role。User-specific 可訪問性查詢是 getUserRoutes 範疇(F5.1)、不該與 isRouteExist 混為一談。

- **Q-自然推論**:**Endpoint mount 位置 = `init_protected_menu_router` nested `/route`**(per F5.1 既有 `/route/getUserRoutes` mount pattern、`sys_menu_route.rs:73` line)。理由:F5.1 已建立此 nested 結構、F6 沿用一致;**不**獨立開新 router、不偏離既有結構。

- **Q-自然推論**:**Response shape = F4 envelope `{code:0, data: true|false}`**(plain boolean as data)。理由:base-web 既有 service client `fetchIsRouteExist` return 型別 `<boolean>`、最後 `Boolean(data)` 抽取(per `store/modules/route/index.ts:306`)— data 本身就是 boolean、不是 object `{exists:true}`。

## User Scenarios & Testing *(mandatory)*

### US-1:Logged-in user 對「存在的 routeName」呼叫、handler 回 true(Priority: P1)🎯 MVP

**Actor**:rust-api 整合測試者 / base-web vue-router guard(實際呼叫者)
**Goal**:對於 `sys_menu` 表內存在(active + enabled)的 route name、handler 回 `data:true`
**Trigger**:`GET /route/isRouteExist?routeName=<existing>` + valid token
**Steps**:
1. dev stack up + migration seed `sys_menu` 含 `route_name = 'home'`(per F5.1 既有 seed)
2. user login `Soybean/123456` 拿 access_token
3. `curl -fsS -H "Authorization: Bearer <token>" 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home'`
4. **預期**:HTTP 200 + body `{code:0, msg:"...", data:true}`

**Acceptance**:步驟 4 PASS、`jq '.data'` 為 `true`。

### US-2:Logged-in user 對「不存在的 routeName」呼叫、handler 回 false(Priority: P2)

**Actor**:同上
**Goal**:對於 `sys_menu` 表內**不存在**的 route name、handler 回 `data:false`
**Trigger**:`GET /route/isRouteExist?routeName=non-existent-route-xyz` + valid token
**Acceptance**:HTTP 200 + body `{code:0, data:false}`。

### US-3:Soft-deleted 或 disabled menu 不算「存在」(Priority: P2、紀律驗證)

**Actor**:同上
**Goal**:確認 F3 soft-delete 紀律 + sys_menu status filter 都被 isRouteExist 正確 honor
**Trigger**:
- (a) `sys_menu` row 有 `deleted_at` 非 NULL — handler 回 `false`
- (b) `sys_menu` row `status = 'disabled'` — handler 回 `false`
**Steps**:
1. 用 `psql` 手動 setup:`UPDATE sys_menu SET status='disabled' WHERE route_name = 'demo-disabled-route';`(若 seed 無此 row、F6 acceptance 階段環境準備時用 raw SQL `INSERT`、實作 task 不在 spec 加 seed)
2. `curl ... ?routeName=demo-disabled-route`
3. **預期**:`data:false`

**Acceptance**:(a)(b) 都 PASS。

### Edge cases / 邊界

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 無 token | auth middleware 拒絕、回 401 + F4 envelope(per F5.1 protected pattern)|
| E-2 | token 過期 | 401 + F4 envelope |
| E-3 | token 任意 valid role | PASS(F6 無 Casbin policy、所有 role 可查)|
| E-4 | `routeName` query 缺漏 | input validation fail / F4 envelope `{code: <validation-code>, msg, data:null}`(對齊 F4 既有 input validation pattern)|
| E-5 | `routeName` 為空字串 `?routeName=` | 同 E-4(透過 `#[validate(length(min = 1))]` 或 equivalent)|
| E-6 | `routeName` URL-encoded / 含特殊字元 | exact match SQL parameterized、無 SQL injection 風險;查不到回 `false` |
| E-7 | `sys_menu` 多筆同 `route_name`(理論 unique 但 seed bug)| `count() > 0` 仍正確回 `true`;若 DB integrity 違反、非 F6 範疇處理 |
| E-8 | route 同 name 但 nested 不同 parent menu | 視為同 name 存在(回 true)— route_name 預期全局唯一(elegant-router 約定)|
| E-9 | base-web `fetchIsRouteExist` 帶錯 query key(`route_name` vs `routeName`)| 不會發生 — base-web 既有 client 已用 `routeName`(per `service-alova/api/route.ts:19`)、F6 後端對齊 |
| E-10 | 高頻呼叫導致 DB load | 預期低頻(only on not-found 攔截觸發);若 prod 監測有問題、留 W-F12+ obs 階段優化、不在 F6 範疇加 cache |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: rust-api MUST 新增 endpoint `GET /route/isRouteExist?routeName=<name>` mount 在 `init_protected_menu_router` 內、對齊 F5.1 既有 `/route/getUserRoutes` mount pattern(`sys_menu_route.rs:73` line)。
- **FR-002**: Handler MUST 接受 query param `routeName`(camelCase、對齊 base-web 既有 `fetchIsRouteExist` 呼叫)、回 F4 envelope `{code:0, msg:"...", data: true|false}`(`data` 為 plain boolean、非 object)。
- **FR-003**: 「Route 存在」MUST 定義為 `sys_menu` 表存在 row 且 `deleted_at IS NULL` 且 `status = 'enabled'`(全域存在性、與 user role 無關)。
- **FR-004**: Handler MUST 被 auth middleware enforce token(對齊 F5.1 protected pattern、token 缺 / 無效 / 過期回 401 + F4 envelope)。
- **FR-005**: Handler MUST **不**附加 Casbin policy(所有 logged-in user 任何 role 可查;不在 sys_endpoint / casbin_rule 加 policy entry — 若 F5.1 階段 Casbin enforce 設計需要顯式 allow,plan 階段補)。
- **FR-006**: `routeName` query 缺 / 空字串 MUST 觸發 input validation fail、回 F4 envelope `{code: <validation-code>, msg, data:null}`(對齊 F4 既有 input validation pattern)。
- **FR-007**: Service layer MUST 新增 method `is_route_exist(&self, route_name: &str) -> Result<bool, AppError>`(在 `sys_menu_service.rs` 或對齊既有 module 結構)。
- **FR-008**: DTO MUST 新增 input struct `IsRouteExistInput { #[serde(rename = "routeName")] route_name: String }` + 對應 validate / Deserialize derive(放在現有 DTO 模組對齊既有 pattern;`rust-api/server/service/src/admin/dto/` 目錄目前僅有 `sys_auth_dto.rs`、plan 階段拍板新建 `sys_menu_dto.rs` 或 inline 在 handler 檔)。
- **FR-009**: Endpoint MUST 對齊既有 OpenAPI doc 機制(若 F5.1 既有 utoipa macro 已 wire、F6 同步補 `#[utoipa::path]`)。
- **FR-010**: F6 MUST 為 **兩段式 commit**(per CLAUDE.md §6.1):第 1 段 worktree 內(`cd rust-api && git commit + push fork`),第 2 段 outer(`git add rust-api && git commit -m 'chore(submodule): bump rust-api to <sha>: ...'` 更新 SHA pin)。
- **FR-011**: base-web `src/` 任何檔案 MUST 零改動(per Constitution Principle IV、既有 `fetchIsRouteExist` wiring 已對齊新 endpoint)。
- **FR-012**: F6 完成後、`grep -rn "isRouteExist" rust-api/` MUST 含 ≥ 1 match(handler / service / route mount);base-web src 改動 MUST 為 0 個檔。
- **FR-013**: 文件更新:`docs/INTEGRATION-CHECKLIST.md` MUST 更新 F6 row ✅ + Phase 2 進度;`CLAUDE.md` §10 SPECKIT marker 更新。

### Non-Functional Requirements

- **NFR-001**: Handler latency p99 SHOULD ≤ 50ms(loopback、單一 SQL EXISTS / count、index lookup;與 F5.1 既有 endpoint 同量級)。
- **NFR-002**: SQL EXISTS query SHOULD 走 index(`sys_menu(route_name)` 應已有 unique index;若 plan 階段確認無、加 migration)— 但 F6 implement 階段先驗 query plan 看是否需 migration;若需、屬 F6 範疇內。
- **NFR-003**: 改動 / 新建 rust file 總數 SHOULD ≤ 5 個(handler / service / DTO / route mount / OpenAPI、視既有結構決定是否新建檔或 inline)。
- **NFR-004**: F6 spec / plan / tasks 規模 SHOULD 與 F5.1 / W-F6 同量級(brainstorm + spec-kit 5 phase + ~30-40 task)。

### Key Entities

- **rust-api `/route/isRouteExist` handler**(新建)— `is_route_exist(Query(IsRouteExistInput), Extension(SysMenuService>)) -> AppResult<Json<ApiResponse<bool>>>`、放在 `rust-api/server/api/src/admin/sys_menu_api.rs`(對齊既有檔)。
- **rust-api `SysMenuService::is_route_exist`**(新建)— `pub async fn is_route_exist(&self, route_name: &str) -> Result<bool, AppError>`、放在 `rust-api/server/service/src/admin/sys_menu_service.rs`(對齊既有檔)。
- **rust-api `IsRouteExistInput` DTO**(新建)— `#[derive(Deserialize, Validate)]` struct、camelCase rename;放在新檔 `sys_menu_dto.rs` 或對齊既有 inline 慣例(plan 階段拍板)。
- **rust-api `sys_menu_route.rs::init_protected_menu_router`**(改)— 加 1 條 `.route("/isRouteExist", get(SysMenuApi::is_route_exist).layer(OperationLogLayer::new(true)))` mount(對齊 F5.1 既有 `/getUserRoutes` mount pattern)。
- **base-web side**(不改)— 既有 `fetchIsRouteExist` 兩套 client(`service/api/route.ts` + `service-alova/api/route.ts`)+ store action(`store/modules/route/index.ts:306`)已對齊新 endpoint、F6 完成後 base 自動 work。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `curl -fsS -H "Authorization: Bearer <token>" '.../route/isRouteExist?routeName=home'` 對 seed 含 'home' 的 sys_menu 回 `data:true`(100% PASS)。
- **SC-002**: `curl ... ?routeName=non-existent-xyz` 回 `data:false`(100% PASS)。
- **SC-003**: soft-deleted / disabled menu row 對應 routeName 回 `data:false`(F3 soft-delete + sys_menu status filter 100% 紀律驗證)。
- **SC-004**: 無 token / token 過期回 HTTP 401 + F4 envelope(100% auth middleware 紀律驗證)。
- **SC-005**: base-web src 改動檔案數 = **0**(per Principle IV 紀律)。
- **SC-006**: 改動 / 新建 rust file 總數 ≤ 5 個(per NFR-003)。
- **SC-007**: Handler latency p99 ≤ 50ms(loopback dev 機、`hyperfine` 或 `wrk` 測;若不易量則改用 `curl -w "%{time_total}\n"` 抽 10 樣 mean ≤ 30ms)。

## Assumptions

- **A-001**: F5.1 既有 `init_protected_menu_router` + auth middleware + Casbin enforce wiring 在 dev stack 上 work(per F5.1 acceptance 已驗、Casbin policy seed 完整)。
- **A-002**: `sys_menu` 表的 `route_name` column 是 elegant-router 慣例下的 vue-router name(全局唯一、kebab-case)— 若實測發現 seed 有違反、F6 範疇內**不**修 seed(屬 F7 manage-crud-alignment 範疇)、acceptance 階段用未違反的 row 驗。
- **A-003**: base-web 既有 `fetchIsRouteExist` 兩套 client(service + service-alova)的 query param `routeName` 是 camelCase、與 F6 後端 `IsRouteExistInput.routeName` 完全對齊(已 grep 驗、`service-alova/api/route.ts:19`)。
- **A-004**: rust-api `axum::extract::Query` 對 `IsRouteExistInput` 的 deserialization 在 camelCase rename 下正確 work(per F5.1 既有 `#[serde(rename_all = "camelCase")]` pattern)。
- **A-005**: F6 不需要 sys_menu schema migration(`route_name` / `status` / `deleted_at` 三個 column F3 + F5.1 階段都已就位)— plan 階段 grep migration 確認、若缺則升級 F6 範疇含 1 個 migration。
- **A-006**: 「`sys_menu.status` 為 enum / text 'enabled' / 'disabled'」— 對齊既有 F5.1 sys_menu DAO 用法、若實測是 0/1 integer 則 plan 階段調整 SQL filter。

## Dependencies

### Inbound(本 feature 依賴)

- **F5.1** `auth-login-and-dynamic-menu`:既有 `init_protected_menu_router` + Casbin enforce + auth middleware + `/route` nested router + `SysMenuApi` 結構。✅(merge `e71aefe`)
- **F4** `response-shape-alignment`:F4 envelope `{code, msg, data}` shape、`ApiResponse<T>` helper。✅
- **F3** `soft-delete-infrastructure`:`deleted_at IS NULL` filter 紀律。✅
- **F2.1** `audit-log-infrastructure`:F6 為純 read endpoint、**不**寫 audit(per Constitution Principle II 只 INSERT/UPDATE 寫);若 F2.1 既有 HTTP middleware 對 GET 也寫 row(Q9 hybrid rule)、屬既有行為、F6 不額外 disable。

### Outbound(本 feature 解鎖)

- **base-web vue-router guard dynamic auth route mode 完整體驗**:user logged in 訪問不存在 path、能正確區分 not-found(404)vs 無權限(403)— UX 閉環。
- **F7 manage-crud-alignment**:menu CRUD 完成後、新增的 route name 自動可被 isRouteExist 查到(F6 / F7 不互鎖)。
- **F11 extracted-stubs**:demo/test role 在 extracted route 上的 403 重導行為依賴 F6(per base guard logic 同一條 path)。

## Out of Scope

- **OOS-001**: `/route/getConstantRoutes` 實作 / 改寫 — F5.1 已做。
- **OOS-002**: `/route/getUserRoutes` 實作 / 改寫 — F5.1 已做(F5.1 acceptance 階段發現的 pre-existing wiring bug 屬 F5.1 follow-up / 新 feature、不在 F6 範疇)。
- **OOS-003**: sys_menu seed / route 結構新增 / 改寫 — F7 manage-crud-alignment 範疇。
- **OOS-004**: base-web src 任何改動(`router/guard/route.ts` / `store/modules/route/` / `service*/api/route.ts`)— 既有 wiring 已對齊、零改動(per Principle IV)。
- **OOS-005**: Caching(Redis / in-memory)— 預期低頻、不需。
- **OOS-006**: Rate limiting / WAF — 後續 prod hardening 範疇。
- **OOS-007**: user-specific 可訪問性查詢 — 那是 getUserRoutes 範疇(F5.1)。
- **OOS-008**: Casbin policy 新增 entry 對 `/route/isRouteExist` 路徑做 enforce — F6 設計上不需(所有 logged-in user 可查、auth middleware 足夠);除非 plan 階段發現 F5.1 既有 Casbin layer 對 `/route/*` 預設 deny、需顯式 allow(屬 plan-stage 確認 / 補)。
- **OOS-009**: DESIGN-A vs DESIGN-B 分歧處理 — F6 兩個 track 完全 identical(per DESIGN-B §6.1 "identical")、無 nestjs bridge 議題。
- **OOS-010**: deploy 層改動(主 compose / dev.yml / prod.yml / nginx config)— F6 純 rust source code feature、走既有 W-F1 ~ W-F6 stack。
- **OOS-011**: 文件 docsify 站 / API doc site 更新 — 若 OpenAPI 自動生成 site work、F6 完成後自動更新;若需手動寫 markdown、屬後續 doc feature。

---

## Decisions Log

| 決策 | 拍板於 | Source |
|---|---|---|
| Auth = Protected(token-required、無 Casbin policy)| 2026-05-18 brainstorm Q1 | 安全(避 info disclosure)+ UX(無 Casbin policy 避退化 403 → 404)|
| Route 存在 = 全域(`sys_menu` active row exists、與 role 無關)| 自然推論 | 呼叫情境是 not-found disambiguate、不是 access control |
| Endpoint mount = `init_protected_menu_router` nested `/route` | 自然推論 | 對齊 F5.1 既有 mount pattern(`sys_menu_route.rs:73`)|
| Response shape = `{code:0, data: boolean}` | 自然推論 | base-web `<boolean>` 型別 + `Boolean(data)` 抽取 |
| F6 範疇排除 getConstantRoutes / getUserRoutes | 自然推論 | F5.1 已實作 |
| 兩段式 commit(動 rust-api worktree)| 自然推論 | per CLAUDE.md §6.1 |
| base-web 零改動 | 自然推論 | per Constitution Principle IV + 既有 wiring 已對齊 |

---

## Open Questions(留 /speckit-plan 階段解)

- **OQ-1**: `IsRouteExistInput` DTO 放新檔 `sys_menu_dto.rs` 還是 inline 在 handler 檔?既有 `dto/` 目錄僅有 `sys_auth_dto.rs`、模式偏向「per module 一個 dto 檔」、F6 應新建 `sys_menu_dto.rs`(或對齊既有 inline 風格、plan 階段 grep `Query<...>` 看其他 GET endpoint 慣例)。
- **OQ-2**: F5.1 既有 `CasbinAxumLayer` 對 `/route/*` 預設行為 — `/route/getUserRoutes` 對 logged-in user 是否需要 policy entry?若需、F6 同步補 `/route/isRouteExist` policy entry;若 layer 對未配 policy path 預設 allow(passthrough),F6 不必加 policy。**plan 階段 grep `casbin_rule` seed + 跑 F5.1 既有 e2e 確認**。
- **OQ-3**: `sys_menu.status` 確切型別(enum text 'enabled'/'disabled' vs integer 0/1)— plan 階段 grep `sys_menu` migration 確認、調整 service SQL filter。
- **OQ-4**: OpenAPI 機制是否含 `#[utoipa::path]` macro — plan 階段確認 F5.1 既有 handler 有無此 macro、F6 對齊。

---

**Brainstorm session 結束、產出 spec 草稿**。下一步:`/speckit-specify` 將本檔轉為 `specs/013-route-guard/spec.md` 正式 feature spec。
