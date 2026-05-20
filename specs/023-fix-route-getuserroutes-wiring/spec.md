# Feature Specification: F7.1 — fix-route-getuserroutes-wiring

**Feature Branch**: `023-fix-route-getuserroutes-wiring`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "F7.1 fix-route-getuserroutes-wiring — per docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md brainstorm doc(3 Q 拍板 + 2 user story US1 F5.1 wiring fix + US2 menu paginated wrapper)"

**Source**: [`docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md`](../../docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md)(brainstorming 2026-05-20 session、3 顯式拍板 Q + F7 CDP demo 過程 catch + F5.1 INTEGRATION-CHECKLIST §1 ⚠️ disclaimer 沿用)

**Authoritative parents**:
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) §1 ⚠️ disclaimer(F5.1 pre-existing wiring bug 早記、留 F5.1 follow-up / 新 feature 處理 — 本 feature 承接)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 3 F7「base manage/* 4 view 跑通」精化定義 — F7.1 是 F7 acceptance 完成度補完
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle I「RBAC fail-safe」、Principle IV「base 不改動邊界」、Principle V「漸進收縮」
- F7 merge SHA `136b1eb`、rust-api `11b888c`(F7.1 baseline、本 branch `023-fix-route-getuserroutes-wiring` 從 `rev1-admin-root` 衍生)
- F9 R-③ implement-time finding(`init_authorization_router` multi-service manual layer pattern)— F7.1 US1 wiring fix 直接重用
- F7 既有 `SysSystemManageApi::list_menu_for_systemmanage` handler(本 feature 改它 paginated wrapper)
- 既有 base-web TS type [`base-web/src/typings/api/system-manage.d.ts`](../../base-web/src/typings/api/system-manage.d.ts)(`Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>` 為 US2 對齊 contract)
- 既有 F5.1 seed user(Soybean / Administrator / GeneralUser 3 user 共密碼 `123456`)
- **F11 implement-time finding 沿用**:R-Q5(v4='' baseline)+ R-Q6(Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)

**Scope summary**:rev1 **F7 manage-crud-alignment merge `136b1eb` 後第一個 post-F7 follow-up feature** — F7 CDP browser smoke demo(per F7 R-Q4 + A-013 graceful degradation 由 deferred 改實際跑)過程 catch 出的 2 個 backend acceptance gap、性質都是 wiring/shape 漏修:

| 對齊面 | F7.1 deliverable |
|---|---|
| **US1 P1 F5.1 wiring bug fix** | `init_protected_menu_router()` 注入 `Arc<SysAuthService>` Extension layer。解 `/route/getUserRoutes` HTTP 500 `Missing request extension`、SPA dynamic auth routes 才能載入 |
| **US2 P2 F7 menu paginated wrapper fix** | `list_menu_for_systemmanage` 回 paginated envelope(非扁平 array)。對齊 base-web TS type `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>` 預期、解 base view manage/menu 顯示「无数据」 |

範疇刻意收緊到「**2 個 backend wiring/shape fix + base manage/* 3 view CDP smoke acceptance**」、**不改 base src / 不改 nestjs / 不動 migration / 不動 docker-compose / 不解 role code mismatch follow-up**。

**Commit 模式**(post brainstorm 拍板 — F7.1 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F5.1/F6/F10.1/F10.2/F11/F9/F7):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1)

**範疇外**:
- ❌ 不解 role code mismatch(`R_SUPER` / `R_ADMIN` vs `ROLE_SUPER` / `ROLE_ADMIN`)— 留 follow-up feature(暫稱 F7.2 role-code-alignment)
- ❌ 不改 base-web SPA src(per Constitution Principle IV;`src/views/` / `src/service/api/*.ts` / `src/typings/` / `src/router/` / `src/store/` 全 0 diff)
- ❌ 不改 base-web `.env`(role mismatch / dynamic mode 等改動均屬 F7.2 範疇)
- ❌ 不動 nestjs fork source(per W-FA*/F10/F11/F9/F7 三邊零改動延伸)
- ❌ 不改 `docker-compose*.yml` / nginx config / Dockerfile(對比 F10.1)
- ❌ 不改 migration(無新 row、無 schema)
- ❌ 不修既有 F2.1/F3/F4/F5.1/F6/F11/F9/F7 migration 既有 row(per Principle IV)
- ❌ 不加 rust unit test(per F7 FR-021 + F11/F9 同精神)
- ❌ 不引入 e2e test framework(CDP smoke 用 inline node script + 既有 `Fetch.requestPaused` + `Page.captureScreenshot`)
- ❌ 不補 base-web SPA login UI 兩種 mode 切換 friction(CDP demo 直接 POST + token inject 繞道)
- ❌ 不解 sys_menu_id_seq 等 sequence 與 seed 既有 id 不同步(F7 acceptance 階段 in-DB setval 修、屬 baseline 資料品質 follow-up)

## Clarifications

### Session 2026-05-20(brainstorming 階段拍板、3 顯式 Q + F7 CDP demo catch + F5.1 disclaimer 沿用)

- **Q1 (brainstorm)**: F7 CDP demo 過程 catch 出 3 個 issue(F5.1 wiring / menu paginated / role code mismatch),哪幾個 bundle 進 023?→ **A:Option B — F5.1 wiring + F7 menu paginated 2-fix bundle、role alias 留 follow-up**。理由:(1) F5.1 wiring + menu paginated 都是 backend 漏修、scope 對稱(2 file ~25 LOC rust source)、共用一次 image rebuild + acceptance + 兩段式 commit;(2) Role code mismatch(`R_SUPER`/`R_ADMIN` vs `ROLE_*`)涉及 base-web env 或 F5.1 seed migration 改 role code 或 SPA-side role mapping layer、scope 顯著放大、需獨立 brainstorm。對比:Option A(只 F5.1 wiring)→ menu paginated 漏修留 follow-up、acceptance 不完整;Option C(3 fix 全包)→ scope 放大 + 可能違 Constitution IV、不必要。

- **Q2 (brainstorm)**: branch 名 / feature short-name?現 branch 是 `023-fix-route-getuserroutes-wiring` 但 scope 擴到 menu paginated、名不符。→ **A:Option C — 保留 `023-fix-route-getuserroutes-wiring` 不改名**。理由:(1) branch 名前綴 narrow 對齊 US1 主標(F5.1 wiring)、不違命名實情;(2) US2(menu paginated)在 spec 內 explicit 列為 secondary scope;(3) Branch 名變更會破壞 already-in-flight uncommitted 改動 + spec-kit `.specify/feature.json` reset。對比:Option A(`023-manage-view-acceptance-fixes`)需 rename + 重 init;Option B(`023-route-userroutes-and-menu-paginated`)名長。

- **Q3 (brainstorm)**: feature 結構 — 2 fix 怎麼組織?→ **A:Option A — 單一 spec、雙 user story、共用 acceptance**。理由:(1) spec.md US1 = F5.1 wiring、US2 = menu paginated;tasks.md 內各自 phase 隔離、共用 image rebuild + commit;(2) Acceptance C-V1-C-V10 共用(curl + CDP smoke)。對比:Option B(2 個 spec、同 branch)→ 結構亂、overhead 翻倍;Option C(F5.1 wiring 主 + menu paginated 為 R-Q1 spec drift)→ menu paginated 邏輯上是 F7 baseline bug、概念不齊。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 `/route/getUserRoutes` wiring fix(Priority: P1)🎯 MVP

`operator` 用 `Soybean`(ROLE_SUPER)login 拿 access_token → curl `GET /api/route/getUserRoutes` → **預期 HTTP 200 + envelope `{code:0, success:true, data:{home, routes}}`**、`routes` array 含 4 top-level(home / log / access-key / manage)+ manage 下含 4 children(manage_user / manage_role / manage_menu / manage_user-detail);**不**預期 HTTP 500 + body `Missing request extension: Arc<SysAuthService>`(F5.1 pre-existing wiring bug)。證明 F5.1 dynamic auth route 機制核心 endpoint 修復、SPA dynamic auth route 載入路徑接通。

**Why this priority**:F5.1 dynamic auth route 機制核心 endpoint、INTEGRATION-CHECKLIST §1 ⚠️ 早記為 follow-up;F7 CDP demo manage CRUD 唯一 blocker(SPA static mode 下仍呼叫此 endpoint 拿 user route 範圍)。沒此 fix、`/route/getUserRoutes` 永遠 HTTP 500、F7 acceptance C-V10 deferred 的 CDP smoke 無從跑通。

**Independent Test**:用 `Soybean` user login 拿 access_token → curl `/route/getUserRoutes` → 預期 HTTP 200 + envelope code:0 + routes count = 4 + manage 含 4 children。

**Acceptance Scenarios**:

1. **Given** stack 6 service healthy + F7.1 rust-api image rebuild + restart 完成,**When** Soybean login 後 curl `GET /api/route/getUserRoutes` 帶 `Authorization: Bearer <token>`,**Then** HTTP 200 + envelope `{code:0, success:true}` + `data.home="home"` + `data.routes` len=4 + `data.routes` 含一個 `name="manage"` 的 route、其 children 含 manage_user / manage_role / manage_menu / manage_user-detail 4 個。
2. **Given** US1.1 PASS,**When** `Administrator`(ROLE_ADMIN)login 後 curl `/route/getUserRoutes`,**Then** HTTP 200 + envelope code:0 + 同 shape(對齊 ROLE_SUPER 體驗、ROLE_ADMIN sys_role_menu binding seed 既有 cover manage)。
3. **Given** US1.1 PASS,**When** `GeneralUser`(ROLE_USER)login 後 curl `/route/getUserRoutes`,**Then** HTTP 200 + envelope code:0(F5.1 m20260515 seed 對 `/route/getUserRoutes` path 3-role allow、**非** 5001 deny);`data.routes` 內容因 sys_role_menu binding 差異 ROLE_USER 預期範圍較小、但 envelope 仍 success。

---

### User Story 2 — operator 驗 `/systemManage/getMenuList/v2` paginated wrapper(Priority: P2)

`operator` 用 `Soybean`(ROLE_SUPER)access_token → curl `GET /api/systemManage/getMenuList/v2` → **預期 envelope `data:{current:1, size:N, total:N, records:[...]}`**(paginated shape、對齊 base-web TS type `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>`);**不**預期回扁平 `data:[...]` array(F7 原 wrapper、致 base manage/menu view 顯示「无数据」)。證明 F7 baseline shape 對齊不完整的補丁落地、base manage/menu view 真實 render row。

**Why this priority**:F7 acceptance C-V3d shape 對齊驗收只看「第一 row field shape」、漏驗 envelope 外層 shape;F7 CDP demo manage/menu 第一次跑(F7 rust-api `11b888c` 後)8 field 全對但 table 顯示 0 row、catch 出。屬 F7 baseline shape 對齊不完整的補丁、優先序次於 US1(US1 不修則 CDP smoke 完全跑不起來)。

**Independent Test**:用 `Soybean` user login → curl `/systemManage/getMenuList/v2` → 預期 envelope `data` 含 `{current, size, total, records}` 4 key、`records` 為 array。

**Acceptance Scenarios**:

1. **Given** stack 6 service healthy + F7.1 落地,**When** Soybean access_token 跑 curl `GET /api/systemManage/getMenuList/v2`,**Then** envelope `data` 含 `{current, size, total, records}` 4 個 key、`current=1`、`size=total=records.len`、`records` 為 array(seed 至少 9 entries per F7 C-V3d baseline)、`records[0]` 仍含 F7 既有 22 field(menuType "1"/"2" / parentId String / order / hideInMenu / buttons null / children null / fixedIndexInTab null / query null 等)。
2. **Given** US2.1 PASS,**When** CDP smoke browser navigate `/manage/menu` view,**Then** table DOM `.n-data-table-tbody .n-data-table-tr` 至少 5 row(seed 至少 9 row)、table 不再顯示「无数据」、row data 含 base TS type 預期 column(ID / 菜单类型 / 菜单名称 / 路由名称 / 路由路径 / 父级菜单ID / 排序 等)。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `/route/getUserRoutes` 對未認證 request(無 token)| HTTP 401 / 走 jwt_auth_middleware reject(F7.1 不改 middleware、F5.1 既有行為) |
| E-2 | Casbin layer 對 ROLE_USER `/route/getUserRoutes` 是否 allow | F5.1 m20260515 seed 對 3 role 都 allow this path、F7.1 不改 Casbin、US1.3 預期 ROLE_USER 也 HTTP 200 |
| E-3 | menu paginated wrapper 對 0 menu(極端、seed 後不應發生) | `data:{current:1, size:0, total:0, records:[]}` |
| E-4 | F7.1 SysMenuRouter 既有其他 mount(`/route/tree` `/route` `/route/:id` 等)的 SysMenuService extension 還在嗎? | 在(F7.1 manual layer pattern 加 SysAuthService **不** 取代 SysMenuService、兩個 layer 都注入)— C-V7/C-V8 CDP smoke regression 順帶驗 |
| E-5 | F7 既有 acceptance C-V3d(spec 描述 `data[i]` 扁平)因 F7.1 改 paginated 而 stale | 接受 — F7 INTEGRATION-CHECKLIST entry 為歷史紀錄保留;F7.1 spec inline 標明 acceptance 對齊改變(`data[i]` → `data.records[i]`) |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F7.1 MUST 改 `rust-api/server/initialize/src/router_initialization.rs` `init_protected_menu_router()` wiring:從 `merge_router!` 單 service 注入(只 `SysMenuService`)改為 multi-service manual layer pattern,顯式加 `Arc<SysAuthService>` Extension layer,對齊 F9 R-③ + 既有 `init_authorization_router` pattern。
- **FR-002**: F7.1 wiring fix MUST 保留 `Arc<SysMenuService>` Extension layer(`init_protected_menu_router` 既有其他 mount `/route/tree` `/route` `/route/:id` 等全用 `SysMenuApi::*` handler、期 `SysMenuService` extension);F7.1 加 `SysAuthService` 是**額外** layer、不取代。
- **FR-003**: F7.1 wiring fix MUST 維持 `init_protected_menu_router` 既有 Casbin enforce + JWT auth(`apply_layers` 的 `need_casbin=true` + `need_auth=true` 不變)。
- **FR-004**: F7.1 修復後 `GET /api/route/getUserRoutes` MUST 對已認證 + Casbin allow 的 request 回 HTTP 200 + envelope `{code:0, success:true, data:{home, routes}}`,**不得**回 HTTP 500 `Missing request extension`。
- **FR-005**: F7.1 MUST 改 `rust-api/server/api/src/admin/sys_system_manage_api.rs` `list_menu_for_systemmanage` handler:return type 從 `Res<Vec<SystemManageMenuOutput>>` 改為 `Res<PaginatedData<SystemManageMenuOutput>>`。
- **FR-006**: F7.1 `list_menu_for_systemmanage` paginated wrapper MUST 用 `current=1`、`size=total=records.len()`(rust 端不分頁、一次回全集),`records` 為既有 `SystemManageMenuOutput` array(F7 既有 22 field shape 不變)。
- **FR-007**: F7.1 MUST 不動 F7 既有 `list_roles_for_systemmanage` / `list_all_roles_for_systemmanage` / `list_users_for_systemmanage` / `tree_menu_for_systemmanage` 4 個 handler(per Constitution Principle IV、F7.1 只改 menu list 一個 handler)。
- **FR-008**: F7.1 MUST 不動 `SysSystemManageApi` 以外的 rust handler、不動 F7 既有 `SystemManageMenuOutput` Output DTO struct(F7.1 只改 wrapper 外層 envelope shape、不改 row element shape)。
- **FR-009**: F7.1 MUST 不改 Casbin policy(無新 migration、無 row 增減);`/route/getUserRoutes` 對 3 role 的 allow 由 F5.1 m20260515 seed 既有 cover、F7.1 不重複加。
- **FR-010**: F7.1 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV;`src/views/` / `src/service/api/*.ts` / `src/typings/` / `src/router/` / `src/store/` / `.env` 全 0 diff)。
- **FR-011**: F7.1 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file(per Constitution Principle IV + W-FA*/F10/F11/F9/F7 三邊零改動延伸)。
- **FR-012**: F7.1 MUST 不動 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`。
- **FR-013**: F7.1 MUST 不動 `rust-api/migration/` 任何 file(無新 migration、無 schema、無 row)。
- **FR-014**: F7.1 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit(2 file ~25 LOC)+ outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**。
- **FR-015**: F7.1 MUST 不加 rust unit test(per F7 FR-021 + F11/F9 同精神、wrapper/wiring 邏輯 stack-可見、curl + CDP smoke 驗即可)。
- **FR-016**: F7.1 acceptance MUST 用 inline bash + node CDP script + `contracts/verification-commands.md`(per F7/F9/F11 慣例)、不新建 deploy script、不引入 e2e test framework。
- **FR-017**: F7.1 MUST 用 `Soybean`(ROLE_SUPER)+ `Administrator`(ROLE_ADMIN)+ `GeneralUser`(ROLE_USER)三 user 跑 acceptance(對齊 F5.1/F6/F10/F11/F9/F7 既有慣例);3 user 共密碼 `123456`。
- **FR-018**: F7.1 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(對齊 F9/F10/F11/F7)。
- **FR-019**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F7.1、F7.1 完成里程碑、Application Phase 3 進度說明(2/3 不變、F7.1 為 F7 acceptance 完成度補完、F8 仍待)。

### Non-Functional Requirements

- **NFR-001**: F7.1 acceptance 跑時間 SHOULD ≤ 30s(10 個 C-V + curl + CDP smoke、不含 stack 啟動 + rust image rebuild)。
- **NFR-002**: F7.1 spec / plan / tasks 規模 SHOULD 對齊 ~2 file rust-source feature 規模(~10-14 task、~250-320 行 spec、2 file ~25 LOC code)。F7.1 為 F7 的小型 follow-up patch、規模顯著小於 F7。
- **NFR-003**: F7.1 acceptance failure mode SHOULD 明確指 friction 落點(wiring extension 注入 / paginated shape / CDP smoke setup)。
- **NFR-004**: F7.1 完成標誌 SHOULD 為:US1 3/3 + US2 2/2 = **5 個 US scenario PASS**、映射為 **10 個 C-V scenario**(per contracts/verification-commands.md C-V1~C-V10)。
- **NFR-005**: F7.1 rust image rebuild 時間 SHOULD ≤ 5 min warm(對齊 F7 baseline 2m 30s)、cold ≤ 7 min。

### Key Entities

- **rust `init_protected_menu_router` wiring**(`rust-api/server/initialize/src/router_initialization.rs`、F7 既有檔、F7.1 改 ~15 LOC)— 從 `merge_router!` 單 service 改為 manual layer pattern + `apply_layers(Services::None, ...)`、加 `Arc<SysAuthService>` Extension。
- **rust `list_menu_for_systemmanage` handler**(`rust-api/server/api/src/admin/sys_system_manage_api.rs`、F7 既有檔、F7.1 改 ~10 LOC)— return type 改 `Res<PaginatedData<SystemManageMenuOutput>>`、body 包 paginated envelope。
- **既有 `SysAuthService`**(rust unit struct)— F7.1 不改、只在 router level 加 Extension layer。
- **既有 `PaginatedData<T>`**(`server/core/src/web/page.rs`)— F7.1 沿用、不改 struct。
- **既有 `SystemManageMenuOutput` Output DTO**(F7 `output/sys_system_manage.rs`)— F7.1 不改、只改外層 wrapper。
- **既有 base-web manage/* 3 view + login view** — **不動**(per FR-010、F7.1 不寫 base 改);CDP smoke 為 black-box load + DOM query 驗 column render。
- **`casbin_rule` 表** — F7.1 不寫入、不改(`/route/getUserRoutes` allow 由 F5.1 m20260515 既有 seed cover)。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F7.1 落地後跑 US1.1 → Soybean `/route/getUserRoutes` HTTP 200 + envelope code:0 + `data.routes` len=4 + manage route 含 4 children(非 HTTP 500 `Missing request extension`)。
- **SC-002**: F7.1 落地後跑 US1.2 → Administrator `/route/getUserRoutes` HTTP 200 + envelope code:0 + 同 shape。
- **SC-003**: F7.1 落地後跑 US1.3 → GeneralUser `/route/getUserRoutes` HTTP 200 + envelope code:0(F5.1 seed allow 3-role、非 5001 deny)。
- **SC-004**: F7.1 落地後跑 US2.1 → Soybean `/systemManage/getMenuList/v2` envelope `data` 含 `{current, size, total, records}` 4 key、`records` 為 array、`records[0]` 含 F7 既有 22 field。
- **SC-005**: F7.1 落地後跑 US2.2 → CDP smoke `/manage/menu` view DOM row count ≥ 5、table 不再「无数据」。
- **SC-006**: F7.1 落地後跑 CDP smoke `/manage/user` regression → DOM row count ≥ 3(Soybean / Administrator / GeneralUser 3 seed user)。
- **SC-007**: F7.1 落地後跑 CDP smoke `/manage/role` regression → DOM row count ≥ 3(管理员 / 超级管理员 / 用户)、roleName/roleCode/roleDesc column 對齊 F7 既有。
- **SC-008**: F7.1 落地後 `docker compose ps` 6 service healthy + migration init container exited 0 + rust-api uptime 較短(剛 recreated)。
- **SC-009**: F7.1 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-010 + Constitution Principle IV)。
- **SC-010**: F7.1 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-011)。
- **SC-011**: F7.1 不動 docker-compose.yml(`git diff HEAD -- docker-compose*.yml` 無輸出、per FR-012)。
- **SC-012**: F7.1 不動 migration(`cd rust-api && git diff HEAD --stat -- migration/` 無輸出、per FR-013)。
- **SC-013**: F7.1 acceptance 整套 ≤ 30s(per NFR-001、不含 rust image rebuild)。
- **SC-014**: F7.1 rust-api 改動範圍 = **2 file** `~25 LOC`(per NFR-002 + brainstorm File Changes 段;`router_initialization.rs` ~15 LOC + `sys_system_manage_api.rs` ~10 LOC)。
- **SC-015**: F7.1 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。

## Assumptions

- **A-001**: F5.1 wiring fix 加 `Arc<SysAuthService>` Extension layer 到 protected_menu_router level 即生效、不需改 `SysAuthService` struct 或 `SysMenuRouter::init_protected_menu_router()` 內部 mount(handler 自動從 router level 拿 extension)。
- **A-002**: `SysAuthService` 為 unit struct(`pub struct SysAuthService;`、無 field、可 `Arc::new(SysAuthService)` 直接構造)、對齊 router_initialization 既有 pattern(F9 R-③ + `init_authorization_router` line 199-205 `Arc::new(SysAuthService) as Arc<SysAuthService>`)。
- **A-003**: F9 acceptance C-V3d(spec acceptance only)對 menu paginated wrapper 改的 regression 影響可接受(F9 acceptance 描述會 stale 但實質行為對齊 base TS type 預期);F9 INTEGRATION-CHECKLIST entry 保留為歷史紀錄。
- **A-004**: F7 既有 C-V3d acceptance 描述同上、F7.1 spec.md 內 explicit 標明(`data[i]` → `data.records[i]`)。
- **A-005**: CDP smoke setup 沿用 F7 R-Q4 + A-013 graceful degradation(WSL2 host Edge 148 + `--remote-debugging-port=9229` + `Fetch.requestPaused` role alias 注入 demo-only workaround);若 CDP setup 異常、graceful degradation 為純 curl + jq pagination shape 驗(不依賴 SPA render)。
- **A-006**: F5.1 m20260515 Casbin seed 對 `/route/getUserRoutes` path 已 cover 3 role(ROLE_SUPER / ROLE_ADMIN / ROLE_USER)allow;F7.1 不重複加。
- **A-007**: rust-api image rebuild ~2-3 min warm cache(對齊 F7 baseline 2m 30s);cold ~5-7 min。
- **A-008**: 既有 sys_menu / sys_role_menu seed 已 cover manage 5 menu(54 manage directory + 64/63/62/65 user/role/menu/user-detail)+ 對 3 role 的 sys_role_menu binding(F7 acceptance 階段已確認)。
- **A-009**: base-web example 分支 `VITE_AUTH_ROUTE_MODE=static` mode 下、SPA 仍呼叫 `/route/getUserRoutes` 拿 user route 範圍;F7.1 修復此 endpoint 後 SPA dynamic auth route 載入路徑接通。

## Dependencies

### Inbound(本 feature 依賴)

- **F5.1** `auth-login-and-dynamic-menu`:`init_protected_menu_router` 既有結構、`SysAuthService` 既有 unit struct、sys_menu/sys_role_menu seed binding 既有 cover manage 5 menu、m20260515 Casbin seed 對 `/route/getUserRoutes` 3-role allow。✅(merge `e71aefe`)
- **F7** `manage-crud-alignment`:`SysSystemManageApi` 既有 + `list_menu_for_systemmanage` handler 既有(本 feature 改它 paginated 包);F7 既有 `SystemManageMenuOutput` Output DTO 沿用。✅(merge `136b1eb`、rust-api `11b888c`)
- **F9** `systemManage-alias-router`:R-③ implement-time finding(`init_authorization_router` multi-service manual layer pattern)— F7.1 US1 直接重用。✅(merge `b2f910c`)
- **F11** `extracted-stubs`:R-Q5/R-Q6 紀律 + acceptance compensate 沿用同精神。✅(merge `81ecb0d`)
- **W-FA1/W-FA2/W-FA3**:F7.1 在 W-FA1 stack with `--profile track-a` 跑(對齊 F9/F11/F7)。✅

### Outbound(本 feature 解鎖)

- **F7 acceptance C-V10 deferred**(CDP smoke deferred 為 user manual)— F7.1 落地後 CDP smoke 可實際跑、F7 acceptance 完成度補完。
- **F8** `assign-users`:base manage/* 3 view paginated read 路徑通 → F8 user-role assignment UI 可實際走通。
- **F7.2 role-code-alignment**(暫稱、follow-up feature)— 解 `R_SUPER`/`R_ADMIN` vs `ROLE_*` mismatch、CDP demo 不再需 role alias workaround。

### 與 F7.1 並行可選

- **F12** `cleanup-job`(application Phase 4)
- **W-F11** `observability`(Phase W deploy P2 剩餘)
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up)

## Risks

- **R-1**(極低)**`merge_router!` macro vs manual layer pattern 改動可能 break F5.1 既有 protected_menu_router 其他 mount**:F5.1 既有 mount 全是 `SysMenuApi::*` handler(期 `SysMenuService` extension);F7.1 加的 `Arc<SysAuthService>` 是額外 layer、不取代 `Arc<SysMenuService>`。**緩解**:C-V7/C-V8(CDP smoke manage/user + manage/role 走 SysMenuApi 既有 mount)順帶 regression 驗。

- **R-2**(低)**menu paginated wrapper 改與 F7/F9 既有 C-V3d acceptance(spec.md 描述)stale**:F7/F9 spec C-V3d acceptance 描述會 stale(實際 shape 已換);INTEGRATION-CHECKLIST 歷史紀錄保留。F7.1 spec.md 內 explicit 標明 acceptance 對齊改變。

- **R-3**(中)**CDP demo 3 view acceptance 需 role alias workaround**:C-V6/C-V7/C-V8 跑時必須 enable `Fetch.requestPaused` 注入 R_SUPER/R_ADMIN(role code mismatch 屬 F7.2 範疇)。**緩解**:fallback 改用「curl + jq pagination shape 驗、無 CDP UI 驗」純 API 層 acceptance(對齊 F7 C-V3 a-e pattern)— 若 CDP setup 異常時 graceful degradation。

- **R-4**(低)**`Arc::new(SysAuthService) as Arc<SysAuthService>` 假設 SysAuthService 為 unit struct**:對齊 F9 R-③ + `init_authorization_router` line 199-205 pattern、implement 階段 grep 確認。

- **R-5**(極低)**F7.1 改 wiring 後 build fail(cargo -D warnings / import 漏)**:F7.1 用 `SysAuthService` 已在 `router_initialization.rs` import(F9/既有 `init_authorization_router` 已用);`PaginatedData` 已在 `sys_system_manage_api.rs` import(F7 既有 3 handler 已用)。預期無新 import。
