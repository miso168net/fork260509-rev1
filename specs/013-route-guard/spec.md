# Feature Specification: F6 — route-guard(`/route/isRouteExist`)

**Feature Branch**: `013-route-guard`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "F6 route-guard — 新增 rust-api 1 個 endpoint GET /route/isRouteExist?routeName=<name>;Protected + 無 Casbin policy;sys_menu 表全域存在性(filter deleted_at IS NULL + status='enabled');F4 envelope plain boolean;base-web src 零改動"

**Source**: [`docs/superpowers/010-feature-route-guard.md`](../../docs/superpowers/010-feature-route-guard.md)(brainstorming 2026-05-18、1 顯式拍板 Q1 Auth=Protected + 6 自然推論)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 F6(`/route/{getConstantRoutes, isRouteExist}` + base vue-router guard 串接)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §6.1 F6(identical to DESIGN-A、無 nestjs 差異)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I RBAC fail-safe — 本 feature 沿用 F5.1 既有 auth middleware;Principle II audit — 本 feature 純 read endpoint、無 audit 寫入;Principle IV base 不改動邊界 — F6 後端適配、base-web src 零改動)
- [`specs/005-auth-login-and-dynamic-menu/spec.md`](../005-auth-login-and-dynamic-menu/spec.md)(F5.1、既有 `/route/getConstantRoutes` + `/route/getUserRoutes` 實作 + `init_protected_menu_router` 結構 — F6 沿用 mount pattern)
- [`base-web/src/router/guard/route.ts`](../../base-web/src/router/guard/route.ts) line 113-122(既有 vue-router guard 的 `getIsAuthRouteExist` 呼叫情境)
- [`base-web/src/service/api/route.ts`](../../base-web/src/service/api/route.ts) line 18-19 + [`service-alova/api/route.ts`](../../base-web/src/service-alova/api/route.ts) line 18-19(既有 `fetchIsRouteExist(routeName)` 兩套 client、F6 後端對齊)
- [`base-web/src/store/modules/route/index.ts`](../../base-web/src/store/modules/route/index.ts) line 297-307(`getIsAuthRouteExist` store action、dynamic auth route mode 呼叫 backend)
- [`rust-api/server/router/src/admin/sys_menu_route.rs`](../../rust-api/server/router/src/admin/sys_menu_route.rs)(F5.1 既有 `init_protected_menu_router` + `/route/getUserRoutes` mount pattern)

**Scope summary**:rev1 application Phase 2 第二個 feature(F5.1 後)。**新增 rust-api 1 個 endpoint `GET /route/isRouteExist?routeName=<name>`** 補完 base-web vue-router guard 在 dynamic auth route mode 下「not-found vs 無權限」的 disambiguation 邏輯。

**範疇驚奇地小**:DESIGN-A §6.1 F6 描述「`/route/{getConstantRoutes, isRouteExist}` + base vue-router guard 串接」內、**`/route/getConstantRoutes` 已在 F5.1 範疇實作**(per F5.1 FR-014 + `sys_menu_route.rs:15-16`)。F6 真正剩下:
1. `/route/isRouteExist` rust 端 handler + service + DTO + route mount(4-5 個 rust file 改動)
2. **base-web 零改動**(per Constitution Principle IV、既有 `fetchIsRouteExist` wiring 已對齊新 endpoint、F6 完成後自動 work)

**Endpoint 合約**:
- Method:`GET`
- Path:`/route/isRouteExist`
- Query:`routeName=<name>`(camelCase、對齊 base-web 既有呼叫)
- Auth:**Protected**(per brainstorm Q1)— `init_protected_menu_router` mount + auth middleware enforce token + **Casbin allowlist 3 role allow policy seed**(per plan R-2 確認 allowlist mode、F6 補 SUPER/ADMIN/USER 各 1 row 對 `/route/isRouteExist GET` allow、所有 logged-in user 任何 role 可查;具體規格 per FR-005 + FR-014)
- Response:F4 envelope `{code:0, msg:"...", data: true|false}`(`data` 為 plain boolean、對齊 base-web `<boolean>` 型別)
- 「Route 存在」定義:**全域存在性**(`sys_menu` row exists + `deleted_at IS NULL` + `status = 'enabled'`)、與 user role 無關

**Commit 模式**:**兩段式 commit**(per CLAUDE.md §6.1)— F6 動 rust-api worktree(handler / service / DTO / route mount),必須走「第 1 段 worktree commit + push fork」+「第 2 段 outer commit 更新 SHA pin」。**有別於** W-F5/W-F7/W-F6 純 outer 的單段。

**範疇外**:base-web src 任何改動 / sys_menu seed 新增 / caching / rate limiting / user-specific 可訪問性查詢 / `/route/getConstantRoutes` / `/route/getUserRoutes` / deploy 層改動。

## Clarifications

### Session 2026-05-18(brainstorming 階段拍板、1 項顯式 + 6 項自然推論)

- **Q1**: `/route/isRouteExist` 需要 token(protected)還是 public(同 getConstantRoutes)? → **A: Protected**(同 getUserRoutes、mount 在 `init_protected_menu_router`、auth middleware enforce token)。理由:(a) 呼叫情境本身是 logged-in user 被 not-found 攔截想 disambiguate;(b) public 會洩 admin menu 全 route name 給未 auth user(輕微 information disclosure);(c) 對所有 logged-in role(SUPER/ADMIN/USER)一律 allow(無 role-specific limit)— 避免無 menu 權限 user 拿不到 403 重導、退化為原 404、UX 變差。**Plan R-2 階段修正**:brainstorm 階段假設「無 Casbin policy」、plan 階段 grep `rbac_model.conf` 發現 Casbin 是 **allowlist mode**(`e = some(where (p.eft == allow))`、未顯式 allow 則 default deny),F6 **必須**補 3 row casbin_rule seed 對 3 既有 role allow(per FR-005 + FR-014、mirror F5.1 既有 `m20260515_a_f51_minimum_seed.rs` pattern)— Q1 拍板「所有 logged-in user 可查」的初衷不變、實作機制改為「補 allow seed」。

- **自然推論**:**「Route 存在」定義 = 全域存在(`sys_menu` active row exists)、與 user role 無關**。理由:呼叫情境是 logged-in user not-found 攔截 disambiguate「真不存在(404)」vs「存在但無權限(403)」、所以全域存在性;user-specific 可訪問性查詢是 getUserRoutes 範疇。
- **自然推論**:**Endpoint mount 位置 = `init_protected_menu_router` nested `/route`** — 對齊 F5.1 既有 mount pattern(`sys_menu_route.rs:73`)、不新建 router。
- **自然推論**:**Response shape = F4 envelope `{code:0, data: boolean}`**(plain boolean)— 對齊 base-web `<boolean>` 型別 + `Boolean(data)` 抽取(`store/modules/route/index.ts:306`)。
- **自然推論**:**F6 範疇排除 getConstantRoutes / getUserRoutes** — F5.1 已實作。
- **自然推論**:**兩段式 commit** — F6 動 rust-api worktree,per CLAUDE.md §6.1。
- **自然推論**:**base-web 零改動** — per Principle IV、既有 `fetchIsRouteExist` wiring 已對齊。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Logged-in user 對「存在的 routeName」呼叫、handler 回 true(Priority: P1)🎯 MVP

base-web vue-router guard 在 dynamic auth route mode 下,當 logged-in user 訪問被 not-found 攔截、呼叫 `fetchIsRouteExist(routeName)` 後,若該 routeName 對應的 menu 存在 sys_menu 表(active + enabled),backend 回 `data:true`、前端後續重導 `/403` 頁。

**Why this priority**:

F6 核心價值在「補完前端 guard 的 backend 對應」— US1 是最常觸發、user 看得到結果的情境(訪問存在但無權限的 route → 重導 403 而非留在 not-found)。MVP 即此。

**Independent Test**:dev stack up + login Soybean 拿 token + 1 條 curl 驗 existing routeName 回 true — 不依賴 US2/US3 任何工作。

**Acceptance Scenarios**:

1. **Given** dev stack up + migration seed `sys_menu` 含 `route_name = 'home'`(per F5.1 既有 seed)、user login `Soybean/123456` 拿 access_token,**When** `curl -fsS -H "Authorization: Bearer <token>" 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home'`,**Then** HTTP 200 + body `{code:0, msg:"...", data:true}`(jq `.data` 為 `true`)
2. **Given** stack up + login + token,**When** 對 `sys_menu` seed 含的另一 active route name(如 `manage_user` 或 F5.1 seed 內其他 active row、acceptance 階段確認)呼叫,**Then** 回 `data:true`
3. **Given** stack up + login + token,**When** 呼叫 `GET /route/isRouteExist?routeName=home`(W-F5 既有 nginx /api/ 反代邏輯應 strip /api/ 變 `/route/isRouteExist?routeName=home` 送 rust-api),**Then** rust-api 收到 query param `routeName=home`、handler 回 `data:true`(驗 W-F5 反代 + W-F7 host port + W-F6 TLS 全鏈路)

---

### User Story 2 — Logged-in user 對「不存在的 routeName」呼叫、handler 回 false(Priority: P2)

**Goal**:`sys_menu` 表內**完全不存在**的 routeName(從未 seed 過)、handler 回 `data:false`,前端後續留在 not-found / 404 頁。

**Why this priority**:

US1 + US2 一起證明 endpoint「正確分類」能力 — false case 也必須驗、否則 backend 可能 hardcode `true` 也 pass US1。次優先於 US1(US1 確認 happy path、US2 確認 reject path)。

**Independent Test**:dev stack up + login + 1 條 curl 用 garbage routeName(從未存在於 seed)— 不依賴 US3 紀律驗證。

**Acceptance Scenarios**:

1. **Given** stack up + login + token,**When** `curl ... 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=non-existent-xyz-2026'`,**Then** HTTP 200 + body `{code:0, data:false}`
2. **Given** stack up + login,**When** 呼叫 `routeName=''`(空字串)或缺 query param,**Then** HTTP 200 + F4 envelope `{code: <input-validation-code>, msg, data:null}`(input validation fail,**非** `data:false` — 區分 user 給空字串 vs 給有效但不存在的 name)

---

### User Story 3 — Soft-deleted / disabled menu 不算「存在」(Priority: P2、紀律驗證)

**Goal**:確認 F3 soft-delete 紀律 + sys_menu status filter 都被 isRouteExist 正確 honor。具體:`sys_menu` row 有 `deleted_at` 非 NULL、或 `status = 'disabled'`、handler 回 `data:false`。

**Why this priority**:

確保 F6 的 SQL filter 與 F3 既有紀律一致 — 防止 soft-deleted menu 仍被識別為「存在」造成前端錯誤重導 403。次優先(紀律驗證、非 user 直接觸發)。

**Independent Test**:dev stack up + manual SQL setup(`UPDATE sys_menu SET deleted_at = NOW() WHERE route_name = X` 或 `UPDATE sys_menu SET status = 'disabled' WHERE route_name = Y`)+ 1 條 curl 驗 — 不依賴 US1/US2 完成。

**Acceptance Scenarios**:

1. **Given** stack up + login + manual SQL setup 軟刪某 active menu row(`UPDATE sys_menu SET deleted_at = NOW() WHERE route_name = '<existing>'`)、不 commit transaction(或 commit;acceptance 後 rollback / restore),**When** `curl ... ?routeName=<existing>`,**Then** 回 `data:false`(F3 紀律 honor)
2. **Given** stack up + login + manual SQL setup `UPDATE sys_menu SET status = 'disabled' WHERE route_name = '<existing>'`,**When** `curl ... ?routeName=<existing>`,**Then** 回 `data:false`(status filter 紀律 honor)
3. **Given** acceptance 結束,**Then** acceptance 操作者 rollback / restore 上述 SQL 改動(避免污染後續 e2e 環境)

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 無 Authorization header 訪問 | auth middleware 拒絕、回 401 + F4 envelope(對齊 F5.1 protected pattern)|
| E-2 | Token 過期 | 401 + F4 envelope |
| E-3 | Token 為任意 valid role(包括無 menu 權限的 GeneralUser)| PASS — 回 `data:true|false`(F6 對 3 既有 role 全 allow per FR-005 + FR-014 seed,所有 valid token user 任何 role 可查)|
| E-4 | `routeName` query 完全缺漏 | input validation fail / F4 envelope `{code: <validation-code>, msg, data:null}` |
| E-5 | `routeName` 為空字串 `?routeName=` | 同 E-4(透過 `#[validate(length(min = 1))]` 或 equivalent)|
| E-6 | `routeName` URL-encoded / 含特殊字元(如 `routeName=user%2Fadmin`)| Query 解碼後 exact match SQL parameterized、無 SQL injection 風險;若 sys_menu 無此 route name 回 `false` |
| E-7 | `sys_menu` 多筆同 `route_name`(理論 unique 但 seed bug)| `count() > 0` 仍正確回 `true`;若 DB integrity 違反、非 F6 範疇處理 |
| E-8 | route 同 name 但 nested 不同 parent menu(`pid` 不同)| 仍視為同 name 存在(回 true)— route_name 預期全局唯一(elegant-router 慣例)|
| E-9 | base-web 既有 `fetchIsRouteExist` query key 不對齊(`route_name` vs `routeName`)| 不會發生 — base-web 既有 client 已用 `routeName`(per `service-alova/api/route.ts:19`)|
| E-10 | 高頻呼叫導致 DB load | 預期低頻(only on not-found 攔截觸發);若 prod 監測有問題、留 W-F12+ obs 階段優化、不在 F6 範疇加 cache |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: rust-api MUST 新增 endpoint `GET /route/isRouteExist?routeName=<name>` mount 在 `init_protected_menu_router` 內、對齊 F5.1 既有 `/route/getUserRoutes` mount pattern(`sys_menu_route.rs:73` line)。
- **FR-002**: Handler MUST 接受 query param `routeName`(camelCase、對齊 base-web 既有 `fetchIsRouteExist` 呼叫)、回 F4 envelope `{code:0, msg:"...", data: true|false}`(`data` 為 plain boolean、**非** object `{exists:true}`)。
- **FR-003**: 「Route 存在」MUST 定義為 `sys_menu` 表存在 row 且 `deleted_at IS NULL` 且 `status = 'enabled'`(全域存在性、與 user role 無關)。
- **FR-004**: Handler MUST 被 auth middleware enforce token(對齊 F5.1 protected pattern)— token 缺 / 無效 / 過期 MUST 回 401 + F4 envelope。
- **FR-005**: Handler MUST 透過 1 個 migration seed 對 3 個既有 role(`ROLE_SUPER` / `ROLE_ADMIN` / `ROLE_USER`)各 allow `/route/isRouteExist GET`,**per Casbin allowlist mode 強制要求**(model 配置 `e = some(where (p.eft == allow))`、未顯式 allow 則 default deny;plan 階段 R-2 grep `rust-api/axum-casbin/examples/rbac_model.conf` 確認、修正 brainstorm 階段「不附加 Casbin policy」假設)。**無 role-specific limit** — 所有 logged-in user 任何 role 都可查;migration 具體規格 per FR-014。
- **FR-006**: `routeName` query 缺 / 空字串 MUST 觸發 input validation fail、回 F4 envelope `{code: <validation-code>, msg, data:null}`(對齊 F4 既有 input validation pattern;具體 code 由 plan 階段 grep `Validate` derive 慣例確認)。
- **FR-007**: Service layer MUST 新增 method `is_route_exist(&self, route_name: &str) -> Result<bool, AppError>`,放在 `rust-api/server/service/src/admin/sys_menu_service.rs`(對齊既有 module 結構)。
- **FR-008**: DTO MUST 新增 input struct `IsRouteExistInput { #[serde(rename = "routeName")] route_name: String }` + 對應 `Deserialize` + `Validate` derive(camelCase rename;放在 `rust-api/server/service/src/admin/dto/sys_menu_dto.rs` 新建檔、或對齊既有 inline 慣例,plan 階段 OQ-1 拍板)。
- **FR-009**: Endpoint MUST 對齊既有 OpenAPI doc 機制 — 若 F5.1 既有 handler 含 `#[utoipa::path]` macro,F6 同步加;若無,F6 不引入新 OpenAPI 機制(plan 階段 OQ-4 確認)。
- **FR-010**: F6 MUST 為 **兩段式 commit**(per CLAUDE.md §6.1):
  - 第 1 段:`cd rust-api && git commit ...` + `git push origin rev1-admin-rust-api`(worktree 內 conventional commit)
  - 第 2 段:`cd .. && git add rust-api && git commit -m 'chore(submodule): bump rust-api to <sha>: F6 ...'`(outer 更新 SHA pin)
- **FR-011**: base-web `src/` 任何檔案 MUST 零改動(per Constitution Principle IV、既有 `fetchIsRouteExist` wiring 已對齊新 endpoint;改動偵測:`git diff --name-only base-web/src/` 應無輸出)。
- **FR-012**: F6 完成後 `grep -rn "is_route_exist\|isRouteExist\|IsRouteExist" rust-api/` MUST 含 ≥ 3 個 match(handler / service / route mount 至少各 1)。
- **FR-013**: F6 完成後文件更新:`docs/INTEGRATION-CHECKLIST.md` F6 row ✅ + 已完成里程碑加 F6 條目;`CLAUDE.md` §10 SPECKIT marker Active feature 更新。
- **FR-014**: F6 MUST 新建 1 個 migration `rust-api/migration/src/datas/m20260518_a_f6_isRouteExist_seed.rs`、對齊 F5.1 既有 `m20260515_a_f51_minimum_seed.rs` pattern。Migration `up` MUST 執行 `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES ('p', '<ROLE>', 'built-in', '/route/isRouteExist', 'GET', '', '')` × 3 row(`ROLE_SUPER` / `ROLE_ADMIN` / `ROLE_USER`);`down` MUST 執行對應 `DELETE FROM casbin_rule WHERE ptype = 'p' AND v1 = 'built-in' AND v2 = '/route/isRouteExist' AND v3 = 'GET' AND v0 IN (...)` 還原。Migration 須加進 `rust-api/migration/src/datas/mod.rs` 既有 `Migrator::migrations()` list(`pub mod` declaration + `Box::new(...)` entry)。

### Non-Functional Requirements

- **NFR-001**: Handler latency p99 SHOULD ≤ 50ms(loopback dev 機、單一 SQL EXISTS / count 走 index、與 F5.1 既有 endpoint 同量級)。
- **NFR-002**: SQL query SHOULD 走 index — `sys_menu(route_name)` 應已有 unique index(elegant-router 慣例);plan 階段 grep migration 確認、若缺則加 1 個 migration(屬 F6 範疇內)。
- **NFR-003**: 改動 / 新建 rust file 總數 SHOULD ≤ 5 個(handler / service / DTO / route mount / 可選 OpenAPI;視既有結構決定是否新建檔或 inline)。
- **NFR-004**: F6 spec / plan / tasks 規模 SHOULD 與 F5.1 / W-F6 同量級(brainstorm + spec-kit 5 phase + ~30-40 task)。

### Key Entities

- **rust-api `/route/isRouteExist` handler**(新建)— `is_route_exist(Query(IsRouteExistInput), Extension(Arc<SysMenuService>)) -> AppResult<Json<ApiResponse<bool>>>`、放在 `rust-api/server/api/src/admin/sys_menu_api.rs`(對齊既有檔)
- **rust-api `SysMenuService::is_route_exist`**(新建)— `pub async fn is_route_exist(&self, route_name: &str) -> Result<bool, AppError>`、放在 `rust-api/server/service/src/admin/sys_menu_service.rs`
- **rust-api `IsRouteExistInput` DTO**(新建)— `#[derive(Deserialize, Validate)]` struct、camelCase rename;放在 `dto/sys_menu_dto.rs`(新建檔、對齊既有 `sys_auth_dto.rs` per-module 慣例)或 inline(plan 階段 OQ-1 拍板)
- **rust-api `sys_menu_route.rs::init_protected_menu_router`**(改)— 加 1 條 `.route("/isRouteExist", get(SysMenuApi::is_route_exist).layer(OperationLogLayer::new(true)))` mount(對齊 F5.1 既有 `/getUserRoutes` mount pattern)
- **`docs/INTEGRATION-CHECKLIST.md`**(改)— F6 row ✅ + 已完成里程碑加 F6 條目 + Current Focus 更新
- **`CLAUDE.md` §10 SPECKIT marker**(改)— Active feature 更新為 F6 → 完成後改回 無
- **base-web side**(不改)— 既有 `fetchIsRouteExist` 兩套 client(`service/api/route.ts` + `service-alova/api/route.ts`)+ store action(`store/modules/route/index.ts:306`)F6 完成後自動 work、不需動 base

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `curl -fsS -H "Authorization: Bearer <token>" 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=<existing>'` 對 `sys_menu` seed 含 `<existing>` 的 row 回 `data:true`(100% PASS、3 個 acceptance scenario 全綠)。
- **SC-002**: `curl ... ?routeName=<non-existent>` 對 seed 無 row 的 routeName 回 `data:false`(100% PASS、2 個 acceptance scenario 全綠)。
- **SC-003**: 軟刪 / disabled menu row 對應 routeName 回 `data:false`(F3 soft-delete + sys_menu status filter 100% 紀律驗證、3 個 acceptance scenario 全綠)。
- **SC-004**: 無 token / token 過期回 HTTP 401 + F4 envelope(2 個 edge case PASS、auth middleware 紀律驗證)。
- **SC-005**: base-web `src/` 改動檔案數 = **0**(per Principle IV、`git diff --name-only base-web/src/` 應無輸出)。
- **SC-006**: 改動 / 新建 rust file 總數 ≤ 5 個(per NFR-003、`git diff --name-only rust-api/` 計數 ≤ 5)。
- **SC-007**: Handler latency p99 ≤ 50ms(loopback dev 機、可用 `curl -w "%{time_total}\n"` 抽 10 樣 mean ≤ 30ms)。
- **SC-008**: F6 走完整兩段式 commit(per FR-010)— `git log --oneline rust-api/` 含 F6 feat commit;`git log --oneline` outer 含 `chore(submodule): bump rust-api ...` SHA pin update commit。

## Assumptions

- **A-001**: F5.1 既有 `init_protected_menu_router` + auth middleware + Casbin enforce wiring 在 dev stack work(per F5.1 acceptance 已驗、Casbin policy seed 完整)。
- **A-002**: `sys_menu` 表的 `route_name` column 為 elegant-router 慣例 vue-router name(全局唯一、kebab-case)— 若實測 seed 違反此,F6 範疇內**不**修 seed(屬 F7 manage-crud-alignment)、acceptance 用未違反 row 驗。
- **A-003**: base-web 既有 `fetchIsRouteExist` 兩套 client 的 query param `routeName` camelCase 與 F6 後端 `IsRouteExistInput.routeName` 完全對齊(已 grep 驗、`service-alova/api/route.ts:19`)。
- **A-004**: rust-api `axum::extract::Query` 對 `IsRouteExistInput` deserialize 在 camelCase rename 下正確 work(per F5.1 既有 `#[serde(rename_all = "camelCase")]` pattern)。
- **A-005**: F6 不需 sys_menu schema migration — `route_name` / `status` / `deleted_at` 三 column F3 + F5.1 階段已就位;plan 階段 grep migration 確認、若缺 unique index 補 1 個。
- **A-006**: `sys_menu.status` 確切型別(enum text 'enabled'/'disabled' vs integer 0/1)— 對齊 F5.1 既有 sys_menu DAO 用法;若實測是 0/1 integer、plan 階段調整 SQL filter。
- **A-007**: ~~原 brainstorm 假設待 plan 階段 grep 確認~~ → **Plan R-2 已確認**:`CasbinAxumLayer` model 為 **allowlist mode**(`e = some(where (p.eft == allow))`、未顯式 allow 則 default deny);F6 已於 FR-005 + FR-014 內規範補 3 row seed(SUPER/ADMIN/USER 各 1 row allow `/route/isRouteExist GET`)。本 assumption 已 RESOLVED。
- **A-008**: F2.1 audit-log middleware 對 GET 既有行為(per F2.1 Q9 hybrid rule:GET `/api/route/*` URL 不 match admin pattern,fallback `"http_event"` entity_type)— 屬既有行為、F6 不額外 disable。

## Dependencies

### Inbound(本 feature 依賴)

- **F5.1** `auth-login-and-dynamic-menu`:既有 `init_protected_menu_router` + Casbin enforce + auth middleware + `/route` nested router + `SysMenuApi` + `SysMenuService` 結構。✅(merge `e71aefe`)
- **F4** `response-shape-alignment`:F4 envelope `{code, msg, data}` shape、`ApiResponse<T>` helper。✅
- **F3** `soft-delete-infrastructure`:`deleted_at IS NULL` filter 紀律。✅
- **F2.1** `audit-log-infrastructure`:F6 為純 read endpoint、**不**寫 audit(per Constitution Principle II 只 INSERT/UPDATE 寫);若 F2.1 既有 HTTP middleware 對 GET 也寫 row(Q9 hybrid rule)、F6 不額外 disable。✅
- **W-F5/W-F6/W-F7** deploy stack:dev 啟動命令 `docker compose -f -f dev.yml up` work、HTTP 11080 + HTTPS 11443 反代到 rust-api。✅(W-F6 merge `5e38030`)

### Outbound(本 feature 解鎖)

- **base-web vue-router guard dynamic auth route mode 完整體驗**:logged-in user 訪問不存在 path 能正確區分 not-found(404)vs 無權限(403)— UX 閉環。
- **F7** `manage-crud-alignment`:menu CRUD 完成後新增 route name 自動可被 isRouteExist 查到(F6 / F7 不互鎖)。
- **F11** `extracted-stubs`:demo/test role 在 extracted route 上的 403 重導行為依賴 F6(per base guard logic 同一條 path)。

## Out of Scope

- **OOS-001**: `/route/getConstantRoutes` 實作 / 改寫 — F5.1 已做。
- **OOS-002**: `/route/getUserRoutes` 實作 / 改寫 — F5.1 已做(F5.1 acceptance 階段發現 pre-existing wiring bug 屬 F5.1 follow-up / 新 feature、不在 F6 範疇)。
- **OOS-003**: sys_menu seed / route 結構新增 / 改寫 — F7 manage-crud-alignment 範疇。
- **OOS-004**: base-web src 任何改動(`router/guard/route.ts` / `store/modules/route/` / `service*/api/route.ts`)— 既有 wiring 已對齊、零改動(per Principle IV)。
- **OOS-005**: Caching(Redis / in-memory)— 預期低頻、不需。
- **OOS-006**: Rate limiting / WAF — 後續 prod hardening 範疇。
- **OOS-007**: user-specific 可訪問性查詢(`routeName` 對應該 user role 是否能訪問)— 那是 getUserRoutes 範疇(F5.1)、不是本 endpoint 語意。
- **OOS-008**: DESIGN-A vs DESIGN-B 分歧處理 — F6 兩個 track 完全 identical(per DESIGN-B §6.1 "identical")、無 nestjs bridge 議題。
- **OOS-009**: deploy 層改動(主 compose / dev.yml / prod.yml / nginx config)— F6 純 rust source code feature、走既有 W-F1 ~ W-F6 stack。
- **OOS-010**: 文件 docsify 站 / API doc site 更新 — 若 OpenAPI 自動生成 site work、F6 完成後自動更新;若需手動寫 markdown、屬後續 doc feature。
- **OOS-011**: e2e 自動化測試(playwright / cypress)— F6 本範疇靠 curl + manual SQL 驗、不寫 e2e suite。
