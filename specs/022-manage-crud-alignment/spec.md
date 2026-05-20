# Feature Specification: F7 — manage-crud-alignment

**Feature Branch**: `022-manage-crud-alignment`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "F7 manage-crud-alignment — base view shape 對齊 + admin path Casbin 補位、per docs/superpowers/022-feature-manage-crud-alignment.md brainstorm doc(4 Q 拍板 + 8 段 design)"

**Source**: [`docs/superpowers/022-feature-manage-crud-alignment.md`](../../docs/superpowers/022-feature-manage-crud-alignment.md)(brainstorming 2026-05-20 session、4 顯式拍板 Q + project context grep evidence + F9/F11 baseline 沿用)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 3「F7 manage-crud-alignment」(完成標誌「base manage/* 4 view 跑通」精化定義為 3 view shape 對齊 + admin path Casbin 補)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.1「Menu CRUD admin 端管理」設計支柱(F7 補 ROLE_ADMIN 對 `/route/*` CRUD allow + curl 驗、不依賴 base view UI)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §6 line 219(F7 在 DESIGN-B 完全繼承、identical)
- [`docs/INTEGRATION-RESEARCH.md`](../../docs/INTEGRATION-RESEARCH.md) §6.2 方案 B「rust 加 /systemManage/* alias router、重用既有 service」(F9 已落地、F7 在此基礎加 shape mapping)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle I「RBAC fail-safe」、Principle IV「base 不改動邊界」、Principle V「漸進收縮」
- 既有 rust `SysRoleApi` / `SysUserApi` / `SysMenuApi`(F9 後 4+1+1 個 alias handler、F7 不改既有、新建 wrapper handler 在新 `SysSystemManageApi`)
- 既有 base-web TS type [`base-web/src/typings/api/system-manage.d.ts`](../../base-web/src/typings/api/system-manage.d.ts)(`Api.SystemManage.Role / User / Menu / MenuTree / AllRole` 為 F7 shape mapping 對齊 contract)
- 既有 F5.1 seed user(Soybean / Administrator / GeneralUser 3 user 共密碼 `123456`)
- 既有 m20241024 Casbin seed(只 ROLE_SUPER allow `/user/*` `/role/*` 11 row、F7 補 ROLE_ADMIN 對應)
- 既有 m20260515 F5.1 Casbin seed(對 ROLE_USER + ROLE_ADMIN + ROLE_SUPER allow `/auth/getUserInfo` + `/route/*` read path、F7 不重複加 `/route/*` read row)
- **F11 implement-time finding 沿用**:R-Q5(v4='' baseline)+ R-Q6(Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)
- F9 merge SHA `b2f910c`(application Phase 3 第一個 feature、DESIGN-A §4.2 抽離項清單 5/5 完成、F7 baseline)

**Scope summary**:rev1 **application Phase 3 第二個 feature**(F9 已落、F7 次之、F8 待),DESIGN-A §6.1 + DESIGN-B §6「manage/* 4 module CRUD shape 對齊 + Casbin enforce + 軟刪 + audit + Menu CRUD」針對 **base example 分支 stub UI 現況**精化定義:

| 對齊面 | F7 deliverable |
|---|---|
| **base TS type shape 對齊** | rust 端 Output DTO + `#[serde(rename_all = "camelCase")]` + From impl、把 rust 既有 column(`name/code/description/username/phone_number/email/pid/sequence`)rename 為 base 預期(`roleName/roleCode/roleDesc/userName/userPhone/userEmail/parentId/order`);base 預期但 rust 無對應 column(`userGender/userRoles/menuButtons/fixedIndexInTab/menu children/query`)hardcode `None` / `vec![]` |
| **Admin path Casbin allow(解 A-006)** | 新 migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` INSERT **15 row** 補 ROLE_ADMIN 對 `/user/*` `/role/*` `/route/*`(write)既有 path allow;不動 m20241024(per FR-014) |
| **Menu CRUD admin path** | 既有 rust `/route/` POST/PUT/DELETE handler 就位、F7 補 Casbin policy allow ROLE_ADMIN;curl 驗 soft delete + audit hook 整合(繼承 F2.1 + F3) |
| **base view 真實 render 驗** | CDP smoke test 驗 manage/user + manage/role + manage/menu 3 view load + table column 含 base TS type 預期欄位、不是 undefined / blank |

加 **1 個 Casbin policy seed migration**:INSERT **15 row** 補 ROLE_ADMIN 對既有 path、v4=''、v1='built-in'(per F11 R-Q5 baseline)。

範疇刻意收緊到「**5 條 read alias shape mapping + 15 row Casbin 補位 + base view 3 個 CDP smoke + 三邊零改動 + base-web src 0 diff**」、**不改 base src / 不補 base 缺的 CRUD fetch fn / 不補 operate-drawer submit handler / 不補 manage/domain view / 不加 sys_user.gender 等缺 column / 不做 userRoles g rule join / 不加 systemManage 寫 alias 的 shape mapping(F9 既有 mount 不動)/ 不加 rust unit test**。

**Commit 模式**(post brainstorm 拍板 — F7 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F11/F9/F10.2/F10.1/F6/F5.1):rust-api worktree 1 commit + outer 1-2 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1)

**範疇外**:
- ❌ 不改 base-web SPA src(per Constitution Principle IV;`src/views/` / `src/service/api/*.ts` / `src/typings/` / `src/components/` / `src/router/` / `src/store/` 全 0 diff)
- ❌ 不補 base-web 缺的 11+ 條 CRUD fetch fn / operate-drawer handleSubmit / manage/domain view
- ❌ 不動 F9 既有 5 條寫/read alias(`addUser/updateUser/deleteUser/batchDeleteUser/getAllPages`)的 mount 或 handler
- ❌ 不動 nestjs fork source(per W-FA*/F10/F11/F9 三邊零改動延伸)
- ❌ 不改 docker-compose.yml / nginx config / Dockerfile(對比 F10.1)
- ❌ 不修既有 m20241024 / m20260515 / m20260519 / m20260520 migration(per Principle IV、F7 新建單一 m20260521)
- ❌ 不加 sys_user.gender column / sys_menu.buttons column(per Q2 拍板;hardcode null/[])
- ❌ 不加 service layer method 反查 user-role 取 userRoles(per Q2 拍板;hardcode `vec![]`)
- ❌ 不加 rust unit test(per F9/F11 同精神)
- ❌ 不驗 add/edit/delete button click 行為(base stub UI、不在 acceptance 範圍)
- ❌ 不引入 e2e test framework(CDP smoke 用 inline bash + 既有 debugger command)
- ❌ 不解 `parentId rust String vs base TS number` typing 矛盾(留 base view side 自行 adaptation)

## Clarifications

### Session 2026-05-20(brainstorming 階段拍板、4 顯式 Q + project context grep evidence + F9/F11 baseline 沿用)

- **Q1 (brainstorm)**: F7 scope 邊界 — Constitution IV 不動 base src 限制下「manage/* 4 view 跑通」該精化定義到哪?→ **A:Option A — read-only path + endpoint shape 對齊**。理由:(1) F7 收緊到「rust 端對 base-web example 預期的 5 條 read endpoint 做 shape 對齊 + Casbin/軟刪/audit 整合驗 + base-web 3 view paginated read 跑通(add/edit/delete button 維持 stub 行為);(2) Menu CRUD admin path 改用「rust 端 endpoint 就位 + 軟刪 + audit + Casbin allow ROLE_SUPER / Administrator」curl 驗、不依賴 base view UI;(3) scope ~8-10 file rust patch、無 base 改。對比:Option B Menu CRUD 完整其實 = A 含;Option C 完整 manage CRUD path 需補 base-web 11+ 條 fetch fn + 改 4 個 operate-drawer + 加 manage/domain + rust 11 條 alias、scope ~30-50 file 跨 base-web + rust、違 Constitution IV;Option D 拆 F7.1/F7.2/F7.3 過度顆粒。

- **Q2 (brainstorm)**: shape mapping 對齊深度 — base TS 有些欄位 rust schema 沒 column(`userGender / userRoles / menuButtons`),怎處理?→ **A:Option A — 最小 mapping,只 rename rust 已有 column**。理由:(1) F9 alias 加 Output DTO + `#[serde(rename)]` 把 rust 現有 column rename 為 base 預期(`name→roleName / code→roleCode / description→roleDesc / username→userName / phone_number→userPhone / email→userEmail / pid→parentId / sequence→order`);(2) rust 無對應 column hardcode `None` 或 `vec![]` 回傳(表示「查不到」、不是「不支援」);(3) scope ~8-12 file rust patch、不動 entity / schema / migration。對比:Option B 補 userRoles g rule join scope ↑ ~12-18 file;Option C 全量 mapping 加 sys_user.gender 等 schema column scope ↑ ~20-30 file + DB migration + entity 改 + F5.1 seed 補欄位;Option D 不 mapping、F7 變空 feature。

- **Q3 (brainstorm)**: F7 admin path 要不要補 ROLE_ADMIN(Administrator)對既有 `/user/*` `/role/*` `/route/*` path 的 Casbin allow row?→ **A:Option A — 補,新 migration 加 15 row(spec brainstorm 提 ~18、grep 後精確化為 15)**。理由:(1) F7 新建 `m20260521_a_f7_admin_role_existing_paths_seed.rs` INSERT 15 row(`/user/*` × ROLE_ADMIN × 6 method + `/role/*` × ROLE_ADMIN × 5 method + `/route/*` × ROLE_ADMIN × 4 method);(2) 不動既有 m20241024(per FR-014);(3) 解 DESIGN-A F7「admin path 跑通」含 ROLE_ADMIN(Administrator)預期、解 spec A-006 已知差異。對比:Option B 只補 Menu CRUD `/route/*` × ROLE_ADMIN、`/user/*` `/role/*` 仍 A-006 差異;Option C 不補,F7 只驗 ROLE_SUPER、A-006 留 follow-up feature。

- **Q4 (brainstorm)**: F7 acceptance 是否包 base-web view-load CDP smoke test?→ **A:Option A — curl + psql + CDP browser smoke test**。理由:(1) C-V series + 1 條 CDP 驗證 manage/user + manage/role + manage/menu 3 view 打開、table column data render 正確(`userName / nickName / roleName / menuName` 等不是 undefined / blank)、不驗 add/edit/delete(仍 stub UI);(2) F5.1 follow-up 已有 CDP 使用經驗、smoke test 可重用 setup;(3) acceptance ~10-11 C-V + 1 CDP test、跑約 20-30s(不含 image rebuild)、可信度高。對比:Option B 純 curl + psql 不跑 CDP browser e2e、shape 對齊與實際 render gap 留 follow-up 驗;Option C curl + psql + screenshot diff visual 不穩定(false-positive)。

- **Evidence collection 2026-05-20**(grep + Read tool):
  - base-web `src/service/api/system-manage.ts` 只 6 條 GET fetch fn、無 CRUD fetch fn、無 manage/domain view
  - base-web operate-drawer / operate-modal `handleSubmit` 全 stub UI(`// request` placeholder + `window.$message?.success`)
  - base-web table column 真實 reference base TS type 命名(`userName / roleName / parentId / order`)
  - base-web TS type:`Api.SystemManage.Role / User / Menu / MenuTree / AllRole` 為 F7 shape mapping 對齊 contract
  - 既有 rust router CRUD mount:`sys_user_route.rs` 8 個 mount、`sys_role_route.rs` 5 個 mount、`sys_menu_route.rs`(nest `/route`)11 個 mount
  - 既有 m20241024:只 ROLE_SUPER allow `/user/*` `/role/*` 11 row、無 ROLE_ADMIN、無 `/route/*`
  - F9 merge SHA `b2f910c`(F7 baseline)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 base manage/* 3 view shape mapping 落地 + Soybean 5 條 read alias shape 對齊 + 3 view CDP smoke(Priority: P1)🎯 MVP

operator 用 `Soybean` user(ROLE_SUPER)login 拿 access_token → 用該 token 跑 F7 新 alias 路徑的 5 條 read endpoint → **預期 5/5 HTTP 200 + envelope code:0 + response data 含 base TS type 預期 field name + 缺欄位 hardcode null/[]**(per brainstorm Q2 拍板)→ CDP browser load 3 view(manage/user + manage/role + manage/menu)+ DOM query table column 確認 paginated row data 含 base TS type 預期欄位、不是 undefined / blank。證明 F7 shape mapping rust 端落地 + base view 真實 render 對齊 + Casbin policy 對 ROLE_SUPER 仍 allow。

**Why this priority**:F7 唯一含 implementation 的 user story、對齊 base TS type contract = F7 核心目標。沒此 acceptance、shape mapping 是否真落地、base view 是否真 render 對齊、Casbin allow 對 ROLE_SUPER 是否生效都無從驗。

**Independent Test**:用 `Soybean` user login 拿 access_token → curl 5 條 alias endpoint(`getRoleList / getAllRoles / getUserList / getMenuList/v2 / getMenuTree`)→ 預期 5/5 HTTP 200 + envelope shape 對齊 base TS type + CDP load 3 view + table column non-undefined。

**Acceptance Scenarios**:

1. **Given** stack 已起(W-FA1 7 service healthy、含 nestjs、且 F7 rust-api image 已 rebuild、F7 Casbin migration 已 rerun),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code: 0, data:{token, refreshToken, ...}, msg, success}`、access_token 為 HS256 JWT 三段格式。

2. **Given** US1.1 拿到 Soybean access_token,**When** 5 條 read alias endpoint curl:
   - `GET /api/systemManage/getRoleList?current=1&size=10` → 預期 envelope `data.records[i]` 含 `roleName / roleCode / roleDesc / status / id` 5 個欄位、`roleName` 為 "超级管理员" / "管理员" / "用户"
   - `GET /api/systemManage/getAllRoles` → 預期 envelope `data[i]` 含 `id / roleName / roleCode` 3 個欄位(per `Api.SystemManage.AllRole = Pick<Role, 'id'|'roleName'|'roleCode'>`)
   - `GET /api/systemManage/getUserList?current=1&size=10` → 預期 envelope `data.records[i]` 含 `userName / userGender(null) / nickName / userPhone / userEmail / userRoles([]) / status / id` 8 個欄位、`userGender` 為 `null`、`userRoles` 為 `[]`(rust 無 column hardcode)
   - `GET /api/systemManage/getMenuList/v2` → 預期 envelope `data[i]` 含 `parentId / menuType ("1"|"2") / menuName / routeName / routePath / iconType ("1"|"2") / buttons(null) / children(null) / order / hideInMenu / ...` 多欄位
   - `GET /api/systemManage/getMenuTree` → 預期 envelope `data[i]` 含極簡 `{id, label, pId, children}` 4 個欄位(per `Api.SystemManage.MenuTree`、注意 `pId` 不是 `pid`、`label` 從 menu_name 來)
   ,**Then** 5/5 endpoint HTTP 200 + envelope `{code:0, data, msg:"success", success:true}`、各 endpoint data shape 對齊 base TS type、缺欄位 hardcode 為 null/[]。

3. **Given** F7 落地,**When** CDP browser 走 SPA login flow → navigate to `/manage/user` → wait for table render → DOM query 拿 first row,**Then** 預期 row.userName 為 "Soybean"(seed user)、row.nickName 非 empty、row.userPhone 非 undefined(可能 null)、row.userEmail 非 undefined;**不**預期 row.userName 為 `undefined` 或 `""`(若是 → mapping 漏、acceptance fail)。

4. **Given** F7 落地,**When** CDP browser navigate to `/manage/role` → table render → DOM query first row,**Then** 預期 row.roleName 為 "超级管理员"(seed)、row.roleCode 為 "ROLE_SUPER"、row.roleDesc 非 undefined。

5. **Given** F7 落地,**When** CDP browser navigate to `/manage/menu` → table render → DOM query first row,**Then** 預期 row.menuName / row.routeName / row.routePath 非 undefined、row.parentId 非 undefined(string);**不**預期 row.menuName 為 `undefined`(若是 → mapping 漏)。

---

### User Story 2 — operator 驗 Administrator 5 條 read alias allow + shape 對齊 + 既有 path admin allow 解 A-006(Priority: P2)

operator 用 `Administrator` user(ROLE_ADMIN)login 拿 access_token → 用該 token 跑 F7 alias 5 條 read endpoint(對齊 ROLE_SUPER 體驗)+ 跑既有 `/api/user/* /api/role/* /api/route/*` 5 條 path 驗 ROLE_ADMIN allow,證明 F7 既解「Administrator 用 alias 路徑」也解「Administrator 用既有原 path」(spec A-006 差異),admin path 兩條都通。

**Why this priority**:DESIGN-A F7「admin path 跑通」含 ROLE_ADMIN 預期、A-006 已記為已知差異留 F7 解;若不驗 ROLE_ADMIN 對既有 path allow,F7「admin path 跑通」目標不完整。

**Independent Test**:用 `Administrator` user login → curl 5 條 alias + 5 條既有 path,各 envelope `{code:0, success:true}`、對齊 ROLE_SUPER 體驗。

**Acceptance Scenarios**:

1. **Given** stack 已起 + F7 落地,**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Administrator","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + access_token。

2. **Given** US2.1 拿到 Administrator access_token,**When** 5 條 read alias curl(對齊 US1.2):`getRoleList / getAllRoles / getUserList / getMenuList/v2 / getMenuTree`,**Then** 5/5 endpoint HTTP 200 + envelope code:0 + data shape 對齊 US1.2(對齊 ROLE_SUPER 體驗、Casbin allow ROLE_ADMIN per F9 m20260520)。

3. **Given** US2.1 Administrator access_token,**When** 5 條既有 path curl:
   - `GET /api/user?current=1&size=10` → 預期 envelope `{code:0, success:true}`
   - `POST /api/user` body 完整 user payload → 預期 envelope code:0 或業務 error envelope(但不是 5001 deny)
   - `PUT /api/user` body 完整 user payload → 預期 envelope code:0 或業務 error envelope(但不是 5001 deny)
   - `GET /api/role?current=1&size=10` → 預期 envelope code:0
   - `POST /api/role` body 完整 role payload → 預期 envelope code:0 或業務 error envelope(但不是 5001 deny)
   ,**Then** 5/5 endpoint HTTP 200 + envelope code:0(或業務層 error 但非 5001 deny)— 解 A-006 ROLE_ADMIN 對既有 path Casbin 補位生效。

---

### User Story 3 — operator 驗 GeneralUser deny + Menu CRUD admin path + Casbin migration 落地 + W-FA1 stack regression + 既有 endpoint 不退化(Priority: P3)

operator 跑 GeneralUser deny regression + Administrator Menu CRUD admin path 整套(POST/PUT/DELETE `/api/route/`)+ psql casbin_rule 查 F7 15 row 落地 + docker compose ps 6 service healthy + 既有 endpoint 不退化(F7 新加 row 不影響 ROLE_SUPER 既有 path 行為)。

**Why this priority**:Casbin migration 是 F7「ROLE_ADMIN admin path 跑通」的 DB-side baseline、必驗 migration 真執行 + 15 row 真落表;Menu CRUD admin path 是 DESIGN-A §1.1 設計支柱第二條、必驗 admin 可對 menu 表做 CRUD + 軟刪 + audit;regression 驗 F11/F9 baseline 不退化、GeneralUser deny 行為維持 fail-safe。

**Independent Test**:psql 查 `casbin_rule WHERE v0='ROLE_ADMIN' AND ... AND v2 NOT LIKE '/systemManage/%'` COUNT = 15 + curl Administrator POST/PUT/DELETE `/api/route/` + curl GeneralUser `/api/user` → deny envelope + docker compose ps 6 healthy。

**Acceptance Scenarios**:

1. **Given** stack 已起、F7 rust-api image rebuild + migration init container rerun 完成,**When** `docker compose exec -T postgres psql ... -c "SELECT v0, v2, v3 FROM casbin_rule WHERE v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%' ORDER BY v2, v3"`,**Then** 回 15 row、`(v0, v2, v3)` 對齊期望(per FR-012):6 `/user/*` + 5 `/role/*` + 4 `/route/*`、v4 全空字串 implicit allow per F11 R-Q5 baseline。

2. **Given** F7 落地、Administrator access_token,**When** Menu CRUD admin path 整套 curl:
   - `POST /api/route/` body 新 menu payload → 預期 HTTP 200 + envelope code:0
   - `PUT /api/route/` body update menu payload → 預期 HTTP 200 + envelope code:0
   - `DELETE /api/route/{newly_created_id}` → 預期 HTTP 200 + envelope code:0
   - psql `SELECT deleted_at FROM sys_menu WHERE id = <newly_created_id>` → 預期非 null(soft delete 由 F3 facade 觸發)
   - psql `SELECT COUNT(*) FROM sys_operation_log WHERE entity_id = '<newly_created_id>'` → 預期 ≥ 1(audit hook 觸發、繼承 F2.1)
   ,**Then** 3/3 endpoint HTTP 200 + soft delete 觸發 + audit 寫入。

3. **Given** F7 落地、GeneralUser access_token,**When** `curl -H "Authorization: Bearer <gu_token>" http://127.0.0.1:11080/api/user?current=1&size=10`,**Then** HTTP 200 + F4 envelope `{code:5001, data:null, msg:"您没有访问该资源的权限，请联系管理员", success:false}`(per F11 R-Q6 envelope wrap)、ROLE_USER 不受 F7 影響、fail-safe regression 維持。

4. **Given** F7 落地,**When** `docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`,**Then** 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ migration init container exited 0(rerun 後 stop)+ rust-api uptime 較短(剛 recreated)、其他 5 service uptime 較長。

5. **Given** F7 落地、Soybean access_token,**When** 3 個既有 endpoint regression curl:
   - `GET /api/user?current=1&size=10` → 預期 HTTP 200 + envelope code:0
   - `GET /api/role?current=1&size=10` → 預期 HTTP 200 + envelope code:0
   - `GET /api/route/tree` → 預期 HTTP 200 + envelope code:0
   ,**Then** 3/3 endpoint HTTP 200(F7 新加 ROLE_ADMIN row 不影響 ROLE_SUPER 既有行為、F7 改 F9 alias mount 不影響既有 router)。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `getRoleList` 回 0 row(DB 全 soft-deleted) | envelope `{code:0, data:{current:1, size:10, total:0, records:[]}}`、CDP table 顯示空 list message |
| E-2 | `getAllRoles` rust 端 status=disabled 的 role | F9 既有 `find_all_enabled` 已 filter status=Enabled、F7 mapping 後 array 含 enabled role only |
| E-3 | `getMenuTree` 回 nested children 但 base 預期極簡 `{id, label, pId, children}` shape | mapper 遞迴展開、每節點 only 4 field;rust 內部完整 menu 物件不洩漏 |
| E-4 | sys_user 某 row `phone_number = NULL` | `userPhone: Option<String>` map 為 `null`、base TS type 接 null 可能 typing 警告但不 crash(per Q2 接受) |
| E-5 | sys_menu 某 row `pid = ""`(根節點) | `parentId: String` map 為 `""`、base TS type `parentId: number` mismatch — **接受**(per Q2、留 base view side 自行 adaptation) |
| E-6 | `menu_type` rust 值非 `"menu"` / `"directory"`(legacy/dirty data) | map 預設回 `"2"`(menu)+ `tracing::warn!`(per F9 code review #2 建議延伸應用) |
| E-7 | F7 落地後 Administrator 跑既有 `/api/user/` GET | envelope `{code:0, success:true, data:paginated}`(由 US2.3 驗、解 A-006) |
| E-8 | F7 落地後 GeneralUser 跑既有 `/api/user/` GET | envelope `{code:5001, success:false}`(由 US3.3 驗、ROLE_USER 不受 F7 影響) |
| E-9 | CDP smoke test column 是 base TS type 預期但 row data 缺欄位 | CDP assert fail → F7 implement-time mapping 漏、check Output DTO + From impl |
| E-10 | base example view 用了 column 但 F7 mapping 沒包(unanticipated) | CDP test 不 fail(只 assert 預期 column 有值)、留 follow-up 紀錄、不阻 F7 PASS |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F7 MUST 新建 `rust-api/server/model/src/admin/output/sys_system_manage.rs` 含 **5 個 Output DTO** struct:`SystemManageRoleOutput` / `SystemManageAllRoleOutput` / `SystemManageUserOutput` / `SystemManageMenuOutput` / `SystemManageMenuTreeNodeOutput`、各 struct `#[derive(Debug, Serialize)]` + `#[serde(rename_all = "camelCase")]` + `From<SysXxxModel> for SystemManageXxxOutput` impl。
- **FR-002**: F7 `SystemManageRoleOutput` MUST 含欄位:`id / roleName(rust name) / roleCode(rust code) / roleDesc(rust description, unwrap_or_default null→"") / status / createdAt / createdBy / updatedAt / updatedBy`,對齊 `Api.SystemManage.Role` TS type。
- **FR-003**: F7 `SystemManageAllRoleOutput` MUST 含欄位:`id / roleName / roleCode` 3 個,對齊 `Api.SystemManage.AllRole = Pick<Role, 'id'|'roleName'|'roleCode'>`。
- **FR-004**: F7 `SystemManageUserOutput` MUST 含欄位:`id / userName(rust username) / userGender(hardcode None per Q2) / nickName / userPhone(rust phone_number) / userEmail(rust email) / userRoles(hardcode vec![] per Q2) / status / createdAt / createdBy / updatedAt / updatedBy`,對齊 `Api.SystemManage.User`。
- **FR-005**: F7 `SystemManageMenuOutput` MUST 含 base TS type `Api.SystemManage.Menu` 多欄位:`id / parentId(rust pid String) / menuType(rust "menu"→"2" / "directory"→"1") / menuName / routeName / routePath / component / icon / iconType(rust "iconify"→"1" / "local"→"2") / buttons(hardcode None) / children(hardcode None) / status / hideInMenu / order(rust sequence) / i18nKey / keepAlive / constant / href / activeMenu / multiTab / fixedIndexInTab(hardcode None) / query(hardcode None)`;menu_type / icon_type 映射 default fallback 加 `tracing::warn!`(per F9 code review #2 建議延伸)。
- **FR-006**: F7 `SystemManageMenuTreeNodeOutput` MUST 含極簡 4 欄位:`id / label(rust menu_name) / pId(rust pid、注意 base 用 pId 不是 pid、用 #[serde(rename = "pId")]) / children(遞迴)`,對齊 `Api.SystemManage.MenuTree = {id, label, pId, children}`。
- **FR-007**: F7 MUST 新建 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 集中 **5 個 alias wrapper handler**:`list_roles_for_systemmanage / list_all_roles_for_systemmanage / list_users_for_systemmanage / list_menu_for_systemmanage / tree_menu_for_systemmanage`、each handler call F9 既有 service method、map model.into() → Output DTO、wrap `Res::new_data` envelope。
- **FR-008**: F7 MUST 改 `rust-api/server/router/src/admin/sys_system_manage_route.rs`(F9 既有檔)5 條 read alias mount 從「直接 mount 既有 handler」改為「mount 新 wrapper handler」:
  - `.route("/getRoleList", get(SysSystemManageApi::list_roles_for_systemmanage))`(取代 F9 `get(SysRoleApi::get_paginated_roles)`)
  - `.route("/getAllRoles", get(SysSystemManageApi::list_all_roles_for_systemmanage))`(取代 F9 `get(SysRoleApi::get_all_roles)`)
  - `.route("/getUserList", get(SysSystemManageApi::list_users_for_systemmanage))`(取代 F9 `get(SysUserApi::get_paginated_users)`)
  - `.route("/getMenuList/v2", get(SysSystemManageApi::list_menu_for_systemmanage))`(取代 F9 `get(SysMenuApi::get_menu_list)`)
  - `.route("/getMenuTree", get(SysSystemManageApi::tree_menu_for_systemmanage))`(取代 F9 `get(SysMenuApi::tree_menu)`)
- **FR-009**: F7 MUST 不動 F9 既有 5 條 write/read alias mount(`addUser / updateUser / deleteUser / batchDeleteUser / getAllPages`)、維持 F9 既有 handler 直接 mount(per OOS-005、base example stub UI 沒人 call、改了無用、scope 不必擴)。
- **FR-010**: F7 MUST 不動既有 `SysRoleApi` / `SysUserApi` / `SysMenuApi` 任何 handler(per Constitution Principle IV + F9 R-Q1 同精神、F7 只在 alias 層做 mapping、不污染 entity api 層)。
- **FR-011**: F7 MUST 新建 `rust-api/migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs` Casbin policy seed migration、`up()` INSERT **15 row** 補 ROLE_ADMIN 對既有 path allow、`down()` DELETE 對應 15 row(用 scope-limited WHERE 排除 F9 systemManage row)。
- **FR-012**: F7 Casbin policy seed 15 row 細目 MUST 對齊:
  - `/user/*` × ROLE_ADMIN × 6 method:GET `/user/` / GET `/user/users` / POST `/user/` / PUT `/user/` / GET `/user/:id` / DELETE `/user/:id`
  - `/role/*` × ROLE_ADMIN × 5 method:GET `/role/` / POST `/role/` / PUT `/role/` / GET `/role/:id` / DELETE `/role/:id`
  - `/route/*` × ROLE_ADMIN × 4 method:POST `/route/` / PUT `/route/` / DELETE `/route/:id` / GET `/route/:id`(read tree/auth-route/getUserRoutes 已由 F5.1 m20260515 對 3-role allow)
  - 所有 row:`v1='built-in'` / `v4=''` / `v5=''`(per F11 R-Q5 baseline)
- **FR-013**: F7 down() DELETE WHERE clause MUST 排除 F9 m20260520 既有 row:`ptype='p' AND v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'`。
- **FR-014**: F7 MUST 不動 `rust-api/migration/src/datas/` 既有 migration 檔(F7 新建 1 個 single migration、不改既有 F1/F2.1/F3/F4/F5.1/F6/F11/F9 migration、per Constitution Principle IV「base 不改動邊界」)。
- **FR-015**: F7 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV「`src/views/` / `src/service*/api/*.ts` / `src/typings/` / `src/components/` / `src/router/` / `src/store/`」全 0 diff);CDP smoke test 為 black-box 驗、不寫 base e2e test code、是 verification command。
- **FR-016**: F7 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file(per Constitution Principle IV + W-FA*/F10/F11/F9 三邊零改動延伸)。
- **FR-017**: F7 MUST 不動 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`(W-FA1 既有 wire 已涵蓋、F7 不加新 envvar / secret)。
- **FR-018**: F7 MUST 不動 `deploy/front-nginx/conf.d/default.conf` / nginx config(F7 動 rust 端、nginx 透明、per DESIGN-A §3.1)。
- **FR-019**: F7 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit(~8 file ~270 LOC)+ outer 1-2 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1)。
- **FR-020**: F7 MUST 不寫 sys_operation_log audit log 額外於 service hook(per F9 FR-016 沿用、F7 alias 直接 call 既有 service、繼承既有 audit hook)。但 Menu CRUD admin path(POST/PUT/DELETE `/api/route/`)預期觸發既有 `SysMenuService` audit hook(per row 寫入 sys_operation_log)、繼承 §1.5 全域 audit 紀律。
- **FR-021**: F7 MUST 不加 rust unit test(per F9/F11 同精神、wrapper 邏輯 stack-可見、curl + CDP smoke 驗即可)。
- **FR-022**: F7 MUST 不加 input validation 比 serde 預設更嚴(per F9/F11 同精神、用 serde `Deserialize` derive 預設行為、reject malformed JSON、不加自訂 message)。
- **FR-023**: F7 acceptance MUST 用 inline bash + `contracts/verification-commands.md`(per F9/F11 慣例)、不新建 deploy script、不引入 e2e test framework。
- **FR-024**: F7 MUST 用 `Soybean`(ROLE_SUPER)+ `Administrator`(ROLE_ADMIN)+ `GeneralUser`(ROLE_USER)三 user 跑 acceptance(對齊 F5.1/F6/F10/F11/F9 既有慣例、Administrator 為 F7 admin path 主驗角色 — A-006 解);3 user 共密碼 `123456`。
- **FR-025**: F7 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(對齊 F9/F10/F11)。
- **FR-026**: F7 MUST 不加 `manage/domain` view 對應 rust endpoint(base example 無 manage/domain view、留 future feature 或永不做)。
- **FR-027**: F7 MUST 不解 `parentId rust String vs base TS number` typing 矛盾(留 base view side 自行 adaptation 或 follow-up feature)。
- **FR-028**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F7、F7 完成里程碑、Application Phase 3 進度標記(從 F9 1/3 → F9+F7 2/3、F8 待)、A-006 解標記。

### Non-Functional Requirements

- **NFR-001**: F7 acceptance 跑時間 SHOULD ≤ 30s(11 個 C-V + curl + psql + audit grep + 3 個 CDP sub-case、不含 stack 啟動 + rust image rebuild)。
- **NFR-002**: F7 spec / plan / tasks 規模 SHOULD 對齊 ~8 file rust-source feature 規模(~22 task、~280-320 行 spec、8 file ~270 LOC code)。F9 13 file ~305 LOC 為較近 reference、F7 因 scope 收緊(Output DTO + alias api 集中)而 file 較少。
- **NFR-003**: F7 acceptance failure mode SHOULD 明確指 friction 落點(rust DTO mapping / Casbin enforce / migration init / CDP smoke column 缺失)。
- **NFR-004**: F7 完成標誌 SHOULD 為:US1 5/5 + US2 3/3 + US3 5/5 = **13/13 PASS**(對齊 F9 10/10、F11 7/7 等比放大、無 unit test 補位)。實質映射為 11 個 C-V scenario(per contracts/verification-commands.md C-V1~C-V10、C-V10 含 3 個 CDP sub-case)。
- **NFR-005**: F7 rust image rebuild 時間 SHOULD ≤ 5 min warm(對齊 F9/F11 baseline)、cold ≤ 7 min。
- **NFR-006**: F7 handler latency SHOULD ≤ 50ms p99(alias wrapper handler 為純記憶體 model→DTO map + 1-2 DB call、應遠低於既有 endpoint;不主動 benchmark、留 W-F11 observability)。

### Key Entities

- **rust 5 個 Output DTO**(`rust-api/server/model/src/admin/output/sys_system_manage.rs`、**新建**)— `SystemManageRoleOutput` / `SystemManageAllRoleOutput` / `SystemManageUserOutput` / `SystemManageMenuOutput` / `SystemManageMenuTreeNodeOutput`、各 struct + `From<SysXxxModel>` impl + camelCase + 缺欄位 hardcode、~120 LOC
- **rust `SysSystemManageApi`**(`rust-api/server/api/src/admin/sys_system_manage_api.rs`、**新建**)— 集中 5 個 alias wrapper handler、~80 LOC
- **rust `SysSystemManageRouter`**(`rust-api/server/router/src/admin/sys_system_manage_route.rs`、F9 既有檔、F7 改 5 條 mount 換 handler + import)— ~10 LOC 改動
- **rust Casbin migration**(`rust-api/migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs`、**新建**)— `MigrationTrait` impl + `up()` INSERT 15 row + `down()` DELETE 15 row scope-limited、~60 LOC
- **既有 base-web example login view + manage/* 3 view + user-detail view** — **不動**(per FR-015、F7 不寫 base 改);CDP smoke 為 black-box load + DOM query 驗 column render
- **既有 nestjs source** — **不動**(per FR-016)
- **`casbin_rule` 表**(F6 + F11 + F9 已驗 schema)— F7 寫入時加 15 row(`p` policy ROLE_ADMIN allow);其他 column 不變;`g` rule 沿用 F5.1 seed user-role assignment 不動
- **`sys_role` / `sys_menu` / `sys_user` 表**(既有 schema)— F7 不改 schema、只新增 SELECT 操作(經由 F9 既有 service method)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F7 落地後跑 US1.1 → HTTP 200 + body envelope + Soybean access_token 為 HS256 JWT 三段格式(F10.1 沿用、F7 regression 驗)。
- **SC-002**: F7 落地後跑 US1.2 → 5 條 read alias endpoint 全 HTTP 200 + envelope code:0 + data shape 對齊 base TS type field name(`roleName/roleCode/roleDesc/userName/userGender(null)/userPhone/userEmail/userRoles([])/parentId/order/menuName/pId/label`)、缺欄位 hardcode null/[]。
- **SC-003**: F7 落地後跑 US1.3 → CDP load `/manage/user` view + DOM query first row.userName 為 "Soybean"(seed)+ row.nickName / userPhone / userEmail 非 `undefined`。
- **SC-004**: F7 落地後跑 US1.4 → CDP load `/manage/role` view + first row.roleName 為 "超级管理员"(seed)+ row.roleCode 為 "ROLE_SUPER" + row.roleDesc 非 undefined。
- **SC-005**: F7 落地後跑 US1.5 → CDP load `/manage/menu` view + first row.menuName / routeName / routePath 非 undefined + row.parentId 為 String non-empty。
- **SC-006**: F7 落地後跑 US2.2 → Administrator 5 條 read alias 全 HTTP 200 + envelope code:0 + data shape 對齊 ROLE_SUPER 體驗。
- **SC-007**: F7 落地後跑 US2.3 → Administrator 對既有 `/api/user/* /api/role/*` 5 條 path 全 HTTP 200 + envelope code:0 或業務 error(但非 5001 deny),解 A-006。
- **SC-008**: F7 落地後跑 US3.1 → psql 查 `casbin_rule WHERE v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'` 回 15 row、`(v0, v2, v3)` 對齊期望(per FR-012)。
- **SC-009**: F7 落地後跑 US3.2 → Administrator Menu CRUD admin path POST/PUT/DELETE `/api/route/` 3/3 endpoint HTTP 200 + envelope code:0 + soft delete 觸發(sys_menu.deleted_at NOT NULL)+ audit 寫入(sys_operation_log COUNT ≥ 1)。
- **SC-010**: F7 落地後跑 US3.3 → GeneralUser 用 `getUserList` 收 HTTP 200 + F4 envelope `{code:5001, success:false}`(per F11 R-Q6、ROLE_USER fail-safe regression、F7 不影響)。
- **SC-011**: F7 落地後跑 US3.4 → `docker compose ps` 6 service healthy + migration init container exited 0 + rust-api uptime 較短(剛 recreated)。
- **SC-012**: F7 落地後跑 US3.5 → 3 個既有 endpoint(`/user / /role / /route/tree`)全 HTTP 200 + envelope code:0(F7 不影響 ROLE_SUPER 既有行為)。
- **SC-013**: F7 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1-2 commit + merge + optional SHA fill follow-up)。
- **SC-014**: F7 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-015 + Constitution Principle IV)。
- **SC-015**: F7 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-016 + 三邊零改動延伸)。
- **SC-016**: F7 不動 docker-compose.yml(`git diff HEAD -- docker-compose*.yml` 無輸出、per FR-017)。
- **SC-017**: F7 acceptance 整套 ≤ 30s(per NFR-001、不含 rust image rebuild)。
- **SC-018**: F7 rust-api 改動範圍 = **~8 file** `~270 LOC`(per NFR-002 + brainstorm Section 2 file 結構)。

## Assumptions

- **A-001**: F9 已 merge(`b2f910c`、10 條 alias 落地、5 條 read 直接 mount 既有 handler、F7 改這 5 條 mount 換 wrapper handler)。✅
- **A-002**: F11 implement-time finding 沿用:R-Q5(v4='' baseline、Casbin 4-field model implicit allow)+ R-Q6(deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)。
- **A-003**: F11 系列 + 其前 baseline 全 merge(F4 envelope shape、F5.1 seed user/role、F6 Casbin migration pattern、F10/F10.1/F10.2 refreshToken end-to-end pass、W-FA1/W-FA2/W-FA3 deploy 結構、F9 systemManage alias)。✅
- **A-004**: 既有 `SysRoleService` / `SysUserService` / `SysMenuService` 提供完整 paginated/list/tree method、F7 wrapper handler 直接 call 即可、不需另寫 service method。
- **A-005**: rust-api image rebuild ~3-5 min warm cache(對齊 F9 baseline);cold ~5-7 min。
- **A-006**: 既有 m20241024 Casbin policy(只 ROLE_SUPER allow `/user/*`/`/role/*`、無 ROLE_ADMIN)— F7 不動既有 row、新加 15 row 對 ROLE_ADMIN 補位(`/user/*` `/role/*` `/route/*` 既有 path)、解 F9 spec A-006 spec 一致性差異。
- **A-007**: rust migration init container 機制(W-FA1 既有 wire)會在 stack restart 時自動 rerun new migration、F7 1 個新 migration 預期 init container exited 0 + 15 row 落地。
- **A-008**: Casbin enforce middleware(F6 + F11 + F9 既有 wire)對 F7 補的 15 row 自動生效(無需 F7 額外配 middleware)。
- **A-009**: nginx W-F5 + W-FA2 既有設計除 `/api/auth/refreshToken` 走 nestjs、其餘 `/api/*` 都 rust(F7 5 條 alias + 既有 path 默認走 rust、不需 F7 動 nginx config)。
- **A-010**: base-web example 分支 `manage/user` / `manage/role` / `manage/menu` 3 個 SPA route 已配置且可 navigate(F5.1 dynamic menu 已含 manage_user / manage_role / manage_menu 3 個 menu key)。
- **A-011**: base TS type `Api.SystemManage.User.userRoles: string[]` hardcode 為 `[]` 在 view typing 不 crash(empty array 為 valid string[])。
- **A-012**: `Api.SystemManage.Menu.children` hardcode 為 `null` 不破壞 view tree render(若 view 用 children 渲染 sub-row、null 應自動扁平 — CDP smoke 階段驗、若 view crash 屬 implement-time finding 處理)。
- **A-013**: CDP debugger 在 WSL2 環境跑 stable(F5.1 follow-up 已驗、F7 沿用 setup;若 flaky 降級為「load + screenshot」+ visual eyeball 確認)。
- **A-014**: rust schema `sys_role.status / sys_menu.status / sys_user.status` 為 `Status` enum 序列化為 string(`"enabled"` / `"disabled"`)、base TS type `Common.CommonRecord` 期 status field 直接接 string、F7 Output DTO 不再轉換。

## Dependencies

### Inbound(本 feature 依賴)

- **F2.1** `audit-log-infrastructure`:audit 設計、F7 Menu CRUD curl 驗 audit row。✅(merge `209a2c8`)
- **F3** `soft-delete-infrastructure`:soft delete 設計、F7 Menu CRUD curl 驗 soft delete + facade `find_active()`。✅(merge `0f1c5c3`)
- **F4** `response-shape-alignment`:envelope shape、F7 Output DTO 沿用 `Res<T>`。✅(commit `3d357e5`)
- **F5.1** `auth-login-and-dynamic-menu`:F7 CDP smoke test 沿用 login flow + seed user + 3 個 manage SPA route 已配。✅(merge `e71aefe`)
- **F6** `route-guard`:F7 不直接依賴、但 stack 起後 F6 baseline 仍 work 維持。✅(merge `a431215`)
- **F9** `systemManage-alias-router`:F7 改 F9 既有 5 條 read alias mount 換 wrapper handler、F9 寫 alias mount 不動;F9 alias 路徑 + Casbin 20 row 為 F7 baseline。✅(merge `b2f910c`)
- **F11** `extracted-stubs`:F7 沿用 R-Q5/R-Q6 紀律 + Casbin enforce flip baseline。✅(merge `81ecb0d`)
- **F10/F10.1/F10.2** `refresh-token` 系列:F7 不直接依賴但 stack 穩定後做 F7 較順。✅
- **W-FA1/W-FA2/W-FA3**:F7 在 W-FA1 stack with `--profile track-a` 跑(對齊 F9/F11)。✅

### Outbound(本 feature 解鎖)

- **F8** `assign-users`:DESIGN-A 表寫 F8 依賴 F7;F7 admin path 落地後 base manage/* view 為 F8 提供 user × role 介面背景;F8 可後續啟動。
- **F12** `cleanup-job`:與 F7 並行(per DESIGN-A §6.2);F7 不阻 F12。
- **F13** `rust-refresh-token-impl`:F7 不直接解鎖、F13 依賴 F10 系列(已完成)。
- **F14** `design-a-to-b-cutover`:F7 對 DESIGN-B 階段繼承(identical per DESIGN-B §6 line 219)、不破壞 cutover 路徑。
- **DESIGN-A F7 「base manage/* 4 view 跑通」**:F7 達成精化定義版本(3 view + admin path、not 4 view + UI CRUD)。
- **B3 camelCase GAP follow-up feature**:F7 取代 — 不再有 GAP 留 follow-up(F7 對齊核心 5 條 read alias)。
- **spec A-006 已知差異**:F7 解 ROLE_ADMIN 對既有 path Casbin allow、A-006 從 F9 A-006 移除 / 標記 resolved。

### 與 F7 並行可選(per DESIGN-A §6.2)

- **F12** `cleanup-job`(Application Phase 4)
- **W-F11** `observability`(Phase W deploy P2 剩餘)
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up)
- **F13** `rust-refresh-token-impl`(DESIGN-B 前置)

## Risks

- **R-1**(低)**F9 既有 5 條 read alias mount 換 handler、可能 break F9 acceptance**(getUserList paginated shape 變、batchDelete 仍工作但 list 流程變):F7 改的 5 條 read mount 是 F9 acceptance C-V3 + C-V5 覆蓋範圍。**緩解**:F7 acceptance US1.2 對齊 F9 C-V3+C-V5 同範圍 endpoint(read endpoint 同範圍、shape 不同;F7 US1.2 為 F9 C-V3 進化版、補 shape mapping 驗);F9 acceptance C-V4 寫 alias(addUser/updateUser/deleteUser/batchDeleteUser)由 F7 FR-009 保留不動、F7 不影響 F9 C-V4。

- **R-2**(低)**`getMenuTree` 用獨立極簡 DTO shape(`{id, label, pId, children}`)、與 `getMenuList/v2` 用完整 menu DTO shape 分歧、base 端可能誤用**:兩個 endpoint 對應兩個 DTO struct、type 清晰;CDP smoke test US1.5 各驗自己 shape。

- **R-3**(中)**rust `menu_type` "menu"/"directory" → base "1"/"2" 映射、若 rust schema 既有 row 有 unexpected value(historical data dirty)→ default "2" 但 row 顯示 type 不對**:E-6 + `tracing::warn!`;F5.1 seed 已驗 row 預期是 "menu"/"directory"、F7 implement 階段檢 seed data 確認;若 implement 期 cargo build / curl 階段 surface unexpected value、加 R-Q 處理。

- **R-4**(中)**CDP smoke test 在 WSL2 環境跑 unstable(headless browser + DOM query timing)、可能 flaky**:**緩解** — 沿用 F5.1 follow-up CDP setup;test fail 時手動重跑 / 加 `waitForSelector`;若持續 flaky 降級為「load + screenshot」+ visual eyeball 確認(per A-013、不阻 F7 PASS、留 follow-up improve)。

- **R-5**(低)**`parentId` rust 是 String、base TS type 是 number、view 可能 typing 不對**:per Q2 + FR-027 接受;base view 若需 `parseInt(parentId)` 是 view-side adaptation、不歸 F7;CDP smoke 只驗 row.parentId 非 undefined、不驗 type 是 number。

- **R-6**(極低)**m20260521 INSERT row 與既有 m20241024 / m20260515 / m20260519 / m20260520 row 衝突**:F7 只加 ROLE_ADMIN row(現有 m20241024 對應 path 為 ROLE_SUPER row、F5.1 m20260515 為 3-role read row、F11 m20260519 為 ROLE_SUPER+ROLE_ADMIN auth/mock row、F9 m20260520 為 systemManage row)— casbin_rule 表無 UNIQUE constraint(F3 sea-orm 設計 allow 重複)、最差情況有冗餘 row 但不破 enforce。

- **R-7**(低)**CDP smoke test 需 SPA login flow + token 帶入 + menu 點選導航 — 比 F5.1 single login flow 複雜**:F5.1 follow-up 已驗 CDP 控制 SPA login + getUserInfo + /home menuCount=43 工作;F7 在此基礎上加 navigate to `/manage/user` → table render → DOM query;若 navigate flaky 可直接 navigate by URL `/manage/user`(SPA route)而非點 menu。
