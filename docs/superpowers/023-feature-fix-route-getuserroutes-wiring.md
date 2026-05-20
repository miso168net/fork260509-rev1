# F7.1 — fix-route-getuserroutes-wiring

**Date**: 2026-05-20
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-20(3 顯式拍板 Q + F7 CDP demo 過程 catch + F5.1 INTEGRATION-CHECKLIST §1 ⚠️ disclaimer 沿用 + F11/F9/F7 implement-time finding pattern 延續)

---

## Scope summary

rev1 **F7 manage-crud-alignment merge `136b1eb` 後第一個 post-F7 follow-up feature** — F7 CDP browser smoke demo(per F7 R-Q4 + A-013 graceful degradation 由 deferred 改實際跑)過程 catch 出的 2 個 backend acceptance gap、性質都是 wiring/shape 漏修。**F11 R-Q5/R-Q6 + F9 R-Q1 + F7 R-Q1 + F7 R-Q-AT1 之後第 5 個 implement-time spec correction**、modal pattern「acceptance 階段 catch + spec 收為新 follow-up feature 修齊」延續。

| 對齊面 | F7.1 deliverable |
|---|---|
| **US1 P1 F5.1 wiring bug fix** | `server/initialize/src/router_initialization.rs::init_protected_menu_router()` 從 `merge_router!` 單 service 注入 → 改 F9 R-③ multi-service manual layer 模式、加 `Arc<SysAuthService>` Extension layer。解 `/route/getUserRoutes` HTTP 500 `Missing request extension: Arc<SysAuthService>`、SPA dynamic auth routes 才能載入 |
| **US2 P2 F7 menu paginated wrapper missing fix** | `server/api/src/admin/sys_system_manage_api.rs::list_menu_for_systemmanage` return type 從 `Res<Vec<SystemManageMenuOutput>>` 改 `Res<PaginatedData<SystemManageMenuOutput>>`、`current=1 / size=total=records.len()`。對齊 base-web TS type `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>` 預期、解 base view manage/menu 顯示「无数据」 |

範疇刻意收緊到「**2 個 backend wiring/shape fix + base manage/* 3 view CDP smoke acceptance**」、**不改 base src / 不改 nestjs / 不動 migration / 不動 docker-compose / 不解 role code mismatch follow-up**。

**Commit 模式**(F7.1 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F5.1/F6/F10.1/F10.2/F11/F9/F7):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1)

---

## Authoritative parents

- [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) §1 ⚠️ disclaimer(F5.1 pre-existing wiring bug 早記、留 F5.1 follow-up / 新 feature 處理 — 本 feature 承接)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 3 F7「base manage/* 4 view 跑通」精化定義 — F7.1 是 F7 acceptance 完成度補完
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle I「RBAC fail-safe」— F7.1 不擴 Casbin scope、純 wiring fix、deny 路徑紀律維持
  - Principle IV「base 不改動邊界」— F7.1 嚴守 `base-web/src/` + `fork260509-soybean-admin-nestjs/` 全 0 diff、所有 fix 集中 rust 端
  - Principle V「漸進收縮」— F7.1 在 DESIGN-B 階段繼承(identical)、F5.1 wiring fix 在 DESIGN-B 仍需要(`/route/getUserRoutes` 為 dynamic auth route endpoint、跨 DESIGN-A/B)
- F7 merge SHA `136b1eb`、rust-api `11b888c`(F7.1 baseline、本 branch `023-fix-route-getuserroutes-wiring` 從 `rev1-admin-root` 衍生)
- F9 R-③ implement-time finding(`init_authorization_router` multi-service manual layer pattern)— F7.1 US1 wiring fix 直接重用此 pattern
- F7 既有 `SysSystemManageApi::list_menu_for_systemmanage` handler(本 feature 改它 paginated wrapper)
- F11 implement-time finding 沿用:R-Q5(v4='' baseline)+ R-Q6(Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)— F7.1 unit test 跳過、acceptance compensate 沿用同精神

---

## Clarifying Q(3 個 brainstorm 拍板)

### Q1: scope 邊界 — F7 CDP demo 過程 catch 出 3 個 issue,哪幾個 bundle 進 023?

**A: Option B — F5.1 wiring + F7 menu paginated 2-fix bundle、role alias 留 follow-up**。

**理由**:
- F5.1 wiring + menu paginated 都是 backend 漏修、scope 對稱(2 file ~25 LOC rust source)、共用一次 image rebuild + acceptance + 兩段式 commit
- Role code mismatch(`R_SUPER`/`R_ADMIN` vs `ROLE_*`)涉及 base-web env(`VITE_AUTH_ROUTE_MODE=static` mode 下 static routes filter)或 F5.1 seed migration 改 role code 或 SPA-side role mapping layer、scope 顯著放大、需獨立 brainstorm
- 對比:Option A(只 F5.1 wiring)→ menu paginated 漏修留 follow-up、CDP demo manage/menu 仍「无数据」、acceptance 不完整;Option C(3 fix 全包)→ scope 放大 + 可能違 Constitution IV(若改 base-web env)、不必要

### Q2: branch 名 / feature short-name?

**A: Option C — 保留 `023-fix-route-getuserroutes-wiring` 不改名**。

**理由**:
- branch 名前綴 narrow 對齊 US1 主標(F5.1 wiring)、不違命名實情
- US2(menu paginated)在 spec 內 explicit 列為 secondary scope、避免 `git branch -m` overhead
- Branch 名變更會破壞 already-in-flight uncommitted 改動 + spec-kit `.specify/feature.json` reset(per F7 經驗、branch 名與 feature dir 對齊紀律)
- 對比:Option A(`023-manage-view-acceptance-fixes`)語意中性但需 rename + 重 init;Option B(`023-route-userroutes-and-menu-paginated`)名長

### Q3: feature 結構 — 2 fix 怎麼組織?

**A: Option A — 單一 spec、雙 user story、共用 acceptance**。

**理由**:
- spec.md US1 = F5.1 wiring、US2 = menu paginated;tasks.md 內各自 phase 隔離(US1 impl → US2 impl → shared acceptance)、共用 image rebuild + commit
- Acceptance C-V1-C-V10 共用(curl + CDP smoke)、tasks 自然分離
- 對比:Option B(2 個 spec、同 branch)→ 結構亂、commit 兩段 vs 四段都尷尬、overhead 翻倍;Option C(F5.1 wiring 主 + menu paginated 為 R-Q1 spec drift)→ menu paginated 邏輯上是 F7 baseline bug(非 F5.1 衍生)、概念不齊

---

## User Stories

### US1 P1 🎯 MVP — `/route/getUserRoutes` wiring fix

**As an** operator
**I want** Soybean(ROLE_SUPER)login 後 `GET /api/route/getUserRoutes` 回正確 user route data(非 HTTP 500)
**So that** SPA dynamic auth route 機制能載入、base manage/* SPA route 能 navigate(不再走 /403 SPA route guard 重定向)

**Why this priority**:F5.1 dynamic auth route 機制核心 endpoint、INTEGRATION-CHECKLIST §1 ⚠️ 早記為 follow-up;CDP demo manage CRUD 唯一 blocker(SPA static mode 下仍呼叫此 endpoint 拿 user route 範圍)。

**Independent Test**:
- Login Soybean → curl `GET /api/route/getUserRoutes` → 預期 HTTP 200 + envelope `{code:0, success:true, data:{home, routes}}`、`routes` array 含 4 top-level(home / log / access-key / manage)+ manage 下 4 children(manage_user / manage_role / manage_menu / manage_user-detail)
- **不**預期 HTTP 500 + body `Missing request extension: alloc::sync::Arc<server_service::admin::sys_auth_service::SysAuthService>`

**Acceptance Scenarios**:

1. **Given** stack 6 service healthy + F7.1 rust-api image rebuild + restart 完成,**When** Soybean login 後 curl `/route/getUserRoutes` 帶 `Authorization: Bearer <token>`,**Then** HTTP 200 + envelope code:0 + `data.home="home"` + `data.routes` len=4 + `data.routes[?].name="manage"` 含 4 children
2. **Given** US1.1 PASS,**When** Administrator login 後 curl `/route/getUserRoutes`,**Then** HTTP 200 + envelope code:0 + 同 shape(對齊 ROLE_SUPER 體驗、ROLE_ADMIN sys_role_menu binding seed 既有 cover manage)
3. **Given** US1.1 PASS,**When** GeneralUser login 後 curl `/route/getUserRoutes`,**Then** HTTP 200 + envelope code:0 + `data.routes` 為 ROLE_USER 範圍(F5.1 m20260515 seed allow 3-role read `/route/getUserRoutes`、**非** 5001 deny;但實際 routes 內容因 sys_role_menu binding 差異 ROLE_USER 預期 routes 範圍較小)

---

### US2 P2 — `/systemManage/getMenuList/v2` paginated wrapper

**As an** operator
**I want** Soybean(ROLE_SUPER)access_token 跑 `GET /api/systemManage/getMenuList/v2` 收 paginated envelope 而非扁平 array
**So that** base-web manage/menu view(用 `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>` typed fetch)能正確顯示 row(不再「无数据」)

**Why this priority**:F7 acceptance C-V3d shape 對齊驗收只看「第一 row field shape」、漏驗 envelope 外層 shape;CDP demo manage/menu 第一次跑(F7 rust-api `11b888c` 後)8 field 全對但 table 顯示 0 row、catch 出。屬 F7 baseline shape 對齊不完整的補丁。

**Independent Test**:
- Soybean login → curl `GET /api/systemManage/getMenuList/v2` → 預期 envelope `data:{current:1, size:N, total:N, records:[...]}` 4 key、records 為 array
- **不**預期回扁平 `data:[...]` array

**Acceptance Scenarios**:

1. **Given** stack 6 service healthy + F7.1 落地,**When** Soybean access_token 跑 curl `/systemManage/getMenuList/v2`,**Then** envelope `data` 含 `{current, size, total, records}` 4 key、`records` 為 array(seed 至少 9 entries per F7 C-V3d baseline)、records[0] 仍含 F7 既有 22 field(menuType "1"/"2" / parentId String / order / hideInMenu / buttons null / children null / fixedIndexInTab null 等)
2. **Given** US2.1 PASS,**When** CDP smoke browser navigate `/manage/user` + `/manage/role` + `/manage/menu` 3 view,**Then** table DOM `.n-data-table-tbody .n-data-table-tr` 各 view 至少 5 / 3 / 5 row(對齊 F5.1 sys_user/sys_role/sys_menu seed 與 sys_role_menu binding)+ row data 含 base TS type 預期 column(per F7 既有 demo)

---

## Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `/route/getUserRoutes` 對未認證 request(無 token)| HTTP 401 / 走 jwt_auth_middleware reject(F7.1 不改 middleware、F5.1 既有行為) |
| E-2 | Casbin layer 對 ROLE_USER `/route/getUserRoutes` 是否 allow | F5.1 m20260515 seed 對 3 role 都 allow this path、F7.1 不改 Casbin、US1.3 預期 ROLE_USER 也 HTTP 200 |
| E-3 | menu paginated wrapper 對 0 menu(極端、seed 後不應發生) | `data:{current:1, size:0, total:0, records:[]}` |
| E-4 | F7.1 SysMenuRouter 既有其他 mount(`/menu/tree` `/menu` `/menu/:id` etc.)的 SysMenuService extension 還在嗎? | 在(F7.1 manual layer pattern 加 SysAuthService **不** 取代 SysMenuService、兩個 layer 都有)— C-V7/C-V8 CDP smoke regression 順帶驗 |

---

## Acceptance Plan(C-V 10 個、curl + CDP smoke、無 unit test 沿用 F7 FR-021 精神)

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA + warm ~2-3 min(F7 baseline 2m 30s 對齊) |
| C-V2 | Soybean `/route/getUserRoutes` (US1) | HTTP 200 + envelope code:0 + `data.routes` len=4 + `data.home="home"` |
| C-V3 | Administrator `/route/getUserRoutes` (US1) | HTTP 200 + envelope code:0 + 同 shape(對齊 ROLE_SUPER 體驗) |
| C-V4 | GeneralUser `/route/getUserRoutes` (US1) | HTTP 200 + envelope code:0(F5.1 seed allow 3-role read、非 5001 deny) |
| C-V5 | Soybean `/systemManage/getMenuList/v2` paginated shape (US2) | envelope `data` 4 key `{current:1, size:N, total:N, records:[...]}`、records first element 22 field 不變 |
| C-V6 | CDP smoke `/manage/menu` (US2) | DOM row count >= 5、table 不再「无数据」 |
| C-V7 | CDP smoke `/manage/user` regression (US1 + US2 共同) | DOM row count >= 3(Soybean / Administrator / GeneralUser 3 seed user) |
| C-V8 | CDP smoke `/manage/role` regression | DOM row count >= 3(管理员 / 超级管理员 / 用户)、roleName/roleCode/roleDesc 對齊 F7 既有 |
| C-V9 | three-side scope verify(zero-regression) | base-web/src 0 diff + nestjs fork 0 diff + rust-api **2 file ~25 LOC** + docker-compose 0 diff |
| C-V10 | W-FA1 stack regression | 6 service healthy + rust-api 剛 restart + migration init container exited 0 |

**CDP smoke setup**(對齊 F7 R-Q4):
- Edge 148 launched with `--remote-debugging-port=9229`(F7 demo 已驗 setup)
- Login via `POST /api/auth/login` + inject SOY_token to localStorage(繞 SPA login UI 兩種 mode 切換 friction)
- **Fetch.requestPaused 注入 R_SUPER / R_ADMIN role alias**(per Out-of-scope role code mismatch)— **demo-only workaround、不在 commit scope**;C-V6/C-V7/C-V8 跑 acceptance 時必須先 enable CDP Fetch interception

**Acceptance 跑時長 SLO**:≤ 30s(對齊 F7 NFR-001、不含 rust image rebuild)。

---

## File Changes

**rust-api worktree(2 file 改、~25 LOC)**:

```
M  server/initialize/src/router_initialization.rs  (~15 LOC、US1)
M  server/api/src/admin/sys_system_manage_api.rs   (~10 LOC、US2)
```

**US1 改動細目**(`router_initialization.rs` line 240-247、F7 既有 `init_protected_menu_router` merge_router 區段):
- 從 `merge_router!(SysMenuRouter::init_protected_menu_router().await, SysMenuService, true, true, None)` 改為 F9 R-③ manual layer pattern + `apply_layers(... Services::None ...)`,顯式加 `.layer(Extension(Arc::new(SysAuthService) as Arc<SysAuthService>))`
- inline comment 標明 F5.1 wiring fix + 對齊 F9 R-③ + `init_authorization_router` 既有 pattern

**US2 改動細目**(`sys_system_manage_api.rs::list_menu_for_systemmanage`):
- Return type 從 `Res<Vec<SystemManageMenuOutput>>` 改為 `Res<PaginatedData<SystemManageMenuOutput>>`
- Body 改為 `let records = ...; let total = records.len() as u64; Ok(Res::new_data(PaginatedData { current: 1, size: total, total, records }))`
- inline comment 標明 F7 wrapper paginated 修正 + 對齊 `Api.SystemManage.MenuList = PaginatingQueryRecord<Menu>` TS type

**Outer(workspace-level)改動**:
- `docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md` 新建(brainstorm doc、本檔)
- `docs/INTEGRATION-CHECKLIST.md` 加 F7.1 entry + Current Focus 更新 + Application Phase 3 進度說明(2/3 不變、F7.1 為 F7 acceptance 完成度補完、F8 仍待)
- `CLAUDE.md` SPECKIT marker 區段自動更新(`/speckit-plan` 階段)
- `.specify/feature.json` 自動更新指 `specs/023-fix-route-getuserroutes-wiring`
- `specs/023-fix-route-getuserroutes-wiring/{spec, plan, research, data-model, quickstart, contracts/verification-commands, checklists/requirements, tasks}.md`(/speckit-* 各階段 auto_commit)
- rust-api gitlink SHA pin

---

## Out-of-scope(明確列)

- ❌ 不解 role code mismatch(`R_SUPER` / `R_ADMIN` vs `ROLE_SUPER` / `ROLE_ADMIN`)— 留 follow-up feature(暫稱 F7.2 role-code-alignment)、涉及 base-web `.env` 或 F5.1 seed migration 改 role code 或 SPA-side role mapping layer
- ❌ 不改 base-web src(`src/views/` `src/service/api/*.ts` `src/typings/` `src/router/` `src/store/` 全 0 diff、per Constitution IV)
- ❌ 不改 base-web `.env`(role mismatch / dynamic mode 等改動均屬 F7.2 範疇)
- ❌ 不改 nestjs fork source(per W-FA*/F10/F11/F9/F7 三邊零改動延伸)
- ❌ 不改 `docker-compose.yml` / `docker-compose.dev.yml`(對比 F10.1、F7.1 不需動 deploy 配置)
- ❌ 不改 migration(無新 row、無 schema)
- ❌ 不修既有 F2.1/F3/F4/F5.1/F6/F11/F9/F7 migration 既有 row(per Principle IV)
- ❌ 不寫 rust unit test(per F7 FR-021 + F11/F9 同精神、curl + CDP smoke 驗即可)
- ❌ 不引入 e2e test framework(CDP smoke 用 inline node script + 既有 `Fetch.requestPaused` + `Page.captureScreenshot`)
- ❌ 不解 F7 既有 C-V3d acceptance description 因 menu paginated 改 shape 而 stale 的問題(F7 INTEGRATION-CHECKLIST entry 為歷史紀錄、保留不改;F7.1 spec.md 內 explicit 標明 acceptance 對齊改變)
- ❌ 不補 base-web SPA login UI 兩種 mode 切換(`/login` vs `/login/code-login`)friction(CDP demo 階段直接 POST + token inject 繞道)
- ❌ 不解 sys_menu_id_seq 同 sys_role_id_seq 等 sequence 與 seed 既有 id 不同步問題(F7 acceptance T060 階段 catch、in-DB setval 修)— 屬 baseline 資料品質 follow-up

---

## Risks

- **R-1**(極低)**`merge_router!` macro vs manual layer pattern 改動可能 break F5.1 既有 protected_menu_router 其他 mount**:F5.1 既有 mount 全是 `SysMenuApi::*` handler(期 `SysMenuService` extension、F5.1 確認已注入);F7.1 加的 `Arc<SysAuthService>` 是額外 layer、不取代 `Arc<SysMenuService>`、原 mount 不受影響。**緩解**:C-V7/C-V8(CDP smoke manage/user + manage/role 走 SysMenuApi 既有 mount 例如 `/menu` `/menu/tree`)順帶 regression 驗。

- **R-2**(低)**menu paginated wrapper 改可能與 F7 C-V3d acceptance(spec.md 描述)stale**:F7 spec C-V3d acceptance 描述會 stale(實際 shape 已換),但 INTEGRATION-CHECKLIST 歷史紀錄保留。F7.1 spec.md 內 explicit 標明 acceptance 對齊改變、留紀錄。

- **R-3**(中)**CDP demo 3 view acceptance 需 role alias workaround**:C-V6/C-V7/C-V8 跑時必須 enable `Fetch.requestPaused` 注入 R_SUPER/R_ADMIN(per Section 4)。**緩解**:可選 fallback 改用「curl + jq pagination shape 驗 + 無 CDP UI 驗」純 API 層 acceptance(對齊 F7 C-V3 a-e pattern、不依賴 SPA render)— 若 CDP setup 異常時 graceful degradation。

- **R-4**(低)**`Arc::new(SysAuthService) as Arc<SysAuthService>` 假設 SysAuthService 為 unit struct**:對齊 F9 R-③ + `init_authorization_router` line 199-205 pattern、實際確認 SysAuthService 確為 `pub struct SysAuthService;` unit struct(無 field)。

- **R-5**(低)**F7 既有 C-V3d acceptance 描述對 base 端 view 認知**:F7 acceptance 順著 spec 寫「envelope `data[i]` 含...」、實際 base view fetch typed 為 paginated;F7.1 對齊後 acceptance 描述需改「envelope `data.records[i]` 含...」。F7 INTEGRATION-CHECKLIST entry 為歷史紀錄保留、F7.1 entry 標明此修正。

---

## Dependencies

### Inbound(本 feature 依賴)

- **F5.1** `auth-login-and-dynamic-menu`(merge `e71aefe`)— init_protected_menu_router 既有結構、SysAuthService 既有 unit struct、sys_menu/sys_role_menu seed binding 既有 cover manage 5 menu(per F7 acceptance 階段確認) ✅
- **F7** `manage-crud-alignment`(merge `136b1eb`、rust-api `11b888c`)— SysSystemManageApi 既有 + list_menu_for_systemmanage handler 既有(本 feature 改它 paginated 包) ✅
- **W-FA1** `compose-nestjs-service`(merge `b095d55`)— stack 7 service profile track-a ✅
- **F9 R-③ finding** — multi-service manual layer pattern(`.layer(Extension(Arc::new(...))) × N + apply_layers(Services::None, ...)`)、F7.1 US1 直接重用
- **F11 R-Q5/R-Q6 finding** — F7.1 unit test 跳過 + acceptance compensate 沿用同精神

### Outbound(本 feature 解鎖)

- **F7 acceptance C-V10 deferred**(CDP smoke deferred 為 user manual)— F7.1 落地後 CDP smoke 可實際跑、F7 acceptance 完成度補完
- **F8** `assign-users` — base manage/* 3 view paginated read 路徑通 → F8 user-role assignment UI 可實際走通
- **F7.2 role-code-alignment**(暫稱、follow-up)— 解 `R_SUPER`/`R_ADMIN` vs `ROLE_*` mismatch、CDP demo 不再需 role alias workaround

### 並行可選

- **F12** `cleanup-job`(application Phase 4)— 與 F7.1 並行不衝突
- **W-F11** `observability`(Phase W deploy P2 剩餘)— 與 F7.1 並行
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up)— 與 F7.1 並行

---

## Assumptions

- **A-001**: F5.1 wiring fix 加 `Arc<SysAuthService>` Extension layer 到 protected_menu_router level 即生效、不需改 SysAuthService struct 或 SysMenuRouter::init_protected_menu_router() 內部 mount(handler 自動從 router level 拿 extension)
- **A-002**: `SysAuthService` 為 unit struct(`pub struct SysAuthService;`、無 field、可 `Arc::new(SysAuthService)` 直接構造)、對齊 router_initialization 既有 pattern(F9 R-③ + init_authorization_router line 199-205)
- **A-003**: F9 acceptance C-V3d(spec acceptance only)對 menu paginated wrapper 改的 regression 影響可接受(F9 acceptance 描述會 stale 但實質行為對齊 base TS type 預期);F9 INTEGRATION-CHECKLIST entry 保留為歷史紀錄
- **A-004**: F7 既有 C-V3d acceptance 描述同上、F7.1 spec.md 內 explicit 標明
- **A-005**: CDP smoke setup 沿用 F7 R-Q4 + A-013 graceful degradation(WSL2 host Edge 148 + remote-debugging-port=9229 + Fetch.requestPaused role alias 注入 demo-only workaround)、F7.1 C-V6/C-V7/C-V8 acceptance 內標明 setup precondition

---

## 下一步

`/speckit-specify` 接手、把本 brainstorm doc(`docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md`)轉成 `specs/023-fix-route-getuserroutes-wiring/spec.md`,再 `/speckit-plan` + `/speckit-tasks` + `/speckit-implement` 完整 pipeline 走完(對齊 F7 既有 spec-kit workflow)。

**注意**:本 brainstorm 在 branch `023-fix-route-getuserroutes-wiring` 已建立(`git switch -c` 已執行、worktree 含 2 個 uncommitted rust source 改)+ Active feature 已對齊 022 → 023(`.specify/feature.json` 將在 /speckit-specify 階段同步)。pipeline 跑起時 spec-kit auto_commit hook 會分別 commit 各 spec doc。
