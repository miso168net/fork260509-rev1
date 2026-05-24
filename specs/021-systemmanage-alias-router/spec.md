# Feature Specification: F9 — systemManage-alias-router

**Feature Branch**: `021-systemmanage-alias-router`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "F9 systemManage-alias-router — 補 DESIGN-A §4.2 抽離項清單最後 1 條 batchDeleteUser stub + RESEARCH §6.2 方案 B 完整 9 條 /systemManage/* alias router(10 條完整交付)、per docs/superpowers/021-feature-systemManage-alias-router.md brainstorm doc(5 Q 拍板 + 4 段 design)"

**Source**: [`docs/superpowers/021-feature-systemManage-alias-router.md`](../../docs/superpowers/021-feature-systemManage-alias-router.md)(brainstorming 2026-05-20 session、5 顯式拍板 Q + project context grep evidence + F11 baseline 沿用)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1「抽離項管理」+ §4.2「抽離項清單 × stub 行為 × 升級路徑」(F9 收尾 batchDeleteUser stub、與 F11 4 條合計 5/5 完整交付)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 4(F9 在 F11 後、DESIGN-A §4.2 抽離項清單收尾)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §4.2 + §6(F9 在 DESIGN-B 完全繼承、identical)
- [`docs/INTEGRATION-RESEARCH.md`](../../docs/INTEGRATION-RESEARCH.md) §6.2 方案 B「後端加 /systemManage/* alias router」(F9 主來源、明確選 rust 實作、重用既有 service)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I「RBAC fail-safe」+ IV「base 不改動邊界」+ V「漸進收縮」— F9 alias + stub 為 DESIGN-A 過渡、未來升級路徑明確)
- 既有 rust `SysUserApi` / `SysRoleApi` / `SysMenuApi`(全有 CRUD + paginated handler、F9 加 4 個新 handler:`delete_user_by_body` / `batch_delete_users` / `get_all_roles` / `get_all_pages`、`update_user` 既有 handler 由 F9 alias POST mount 重用、per research.md R-Q1)
- 既有 rust router 結構(`rust-api/server/router/src/admin/`、F11 後共 13 個 route file、F9 新建第 14 個:`sys_system_manage_route.rs`)
- 既有 F11 Casbin policy seed pattern(`m20260519_a_f11_extracted_stubs_seed.rs`、F9 沿用 INSERT casbin_rule pattern、v4='' baseline)
- 既有 F5.1 seed user(Soybean/ROLE_SUPER、Administrator/ROLE_ADMIN、GeneralUser/ROLE_USER、3 user 共密碼 `123456`)
- **F11 implement-time finding 沿用**:R-Q5(v4='' baseline)+ R-Q6(Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)
- F11 merge SHA `81ecb0d`(application Phase 4 收尾 + 抽離項清單 4/5 完成、F9 baseline)

**Scope summary**:rev1 **DESIGN-A §4.2 抽離項清單收尾 feature**(F11 補 4 條 stub 後接續、F9 補最後 1 條 `batchDeleteUser` stub + 完整 9 條 `/systemManage/*` alias = 10 條完整交付)。補 RESEARCH §6.2 方案 B「rust 加 `/systemManage/*` alias router」(per brainstorm 拍板):

| # | systemManage Endpoint | Method | F9 Handler 策略 |
|---|---|---|---|
| 1 | `/getRoleList` | GET | mount `SysRoleApi::get_paginated_roles` 直接重用 |
| 2 | `/getAllRoles` | GET | **新做** `SysRoleApi::get_all_roles` + `SysRoleService::find_all_enabled` |
| 3 | `/getUserList` | GET | mount `SysUserApi::get_paginated_users` 直接重用 |
| 4 | `/addUser` | POST | mount `SysUserApi::create_user` 直接重用 |
| 5 | `/updateUser` | POST | **重用直接 mount** `SysUserApi::update_user`(既有 PUT handler method-agnostic、F9 POST alias mount 同 handler + `ValidatedForm<UpdateUserInput>` body extractor、per research.md R-Q1) |
| 6 | `/deleteUser` `{id}` | DELETE | **變形 wrapper** `SysUserApi::delete_user_by_body`(body 抽 id → call `SysUserService::delete_user`) |
| 7 | `/batchDeleteUser` `{ids}` | DELETE | **新做 stub** `SysUserApi::batch_delete_users`(per-row loop call + counter、永遠 200 + `{deletedCount: N}`) |
| 8 | `/getMenuList/v2` | GET | mount `SysMenuApi::get_menu_list` 直接重用 |
| 9 | `/getAllPages` | GET | **新做** `SysMenuApi::get_all_pages` + `SysMenuService::find_all_page_keys`(SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL) |
| 10 | `/getMenuTree` | GET | mount `SysMenuApi::tree_menu` 直接重用 |

加 **1 個 Casbin policy seed migration**:`Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN) allow / GeneralUser deny`、INSERT **20 row**(2 role × 10 endpoint)、v4=''(per F11 R-Q5 baseline)。

範疇刻意收緊到「**10 條 alias + Casbin enforce + 三邊零改動 + base-web src 0 diff**」、**不解 B3 camelCase GAP / 不驗 base-web e2e / 不加 sys_menu seed / 不加新 role / 不加 batch tx / 不加 casbin orphan cleanup / 不加 rust unit test**。

**Commit 模式**(post brainstorm 拍板 — F9 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F11/F10.2/F10.1/F6/F5.1):rust-api worktree 1 commit + outer 1-2 commit(spec docs + INTEGRATION-CHECKLIST.md milestone + SHA pin + CLAUDE.md SOP marker;**無 docker-compose.yml 改**,W-FA1 既有 wire 已涵蓋)

**範疇外**:
- ❌ 不解 B3 camelCase GAP(per brainstorm Q2、留 follow-up feature)
- ❌ 不驗 base-web e2e(per Q2、不跑 CDP browser e2e)
- ❌ 不加 sys_menu seed row(F11 同 pattern、F9 alias 不依賴 menu API)
- ❌ 不加新 sys_role(per F11 Q1 同精神、SUPER + ADMIN allow / USER default deny)
- ❌ 不加 batch-level transaction(per Q3 + DESIGN-A §4.2、batchDelete 無 atomic rollback、per-row tx 仍滿足 §1.5)
- ❌ 不加 casbin orphan cleanup(per DESIGN-A §4.2、user 刪後 g rule 不主動清)
- ❌ 不加 batch limit(DESIGN-A 未寫上限、F9 follow)
- ❌ 不加 rust unit test(per F11 Q3、wrapper 邏輯 stack-可見 / batchDelete loop 簡單 / curl 驗即可)
- ❌ 不加 input validation 比 serde 預設更嚴(per F11 Q3)
- ❌ 不改 base-web SPA src(per Constitution Principle IV)
- ❌ 不改 nestjs fork source(三邊零改動標配)
- ❌ 不改 nginx config(F9 alias 在 rust router 註冊、nginx 透明、per DESIGN-A §3.1)
- ❌ 不改 docker-compose.yml / Dockerfile(對比 F10.1)
- ❌ 不修既有 `/user/*` `/role/*` `/route/*` Casbin row(per Constitution Principle IV「base 不改動邊界」+ F9 R-5、既有 m20241024 baseline 不動、F9 只新增 alias path)

## Clarifications

### Session 2026-05-20(brainstorming 階段拍板、5 顯式 Q + project context grep evidence + F11 baseline 沿用)

- **Q1 (brainstorm)**: `getAllRoles` 和 `getAllPages` 兩條 rust 既有完全沒對應 method(需新做)、最決定 F9 scope 大小。怎麼處理?→ **A:Option C — `getAllRoles` 完整 + `getAllPages` stub(實際升級為簡 SQL)**。理由:(1) `getAllRoles` 反映實際使用 — base-web `manage/user` 在 user 編輯下拉常用 → 新增 `SysRoleService::find_all_enabled` 完整實作回 status=Enabled 的 role 完整列表;(2) `getAllPages` 邊緣 view(`manage/menu` 綁頁面)、per Q5 升級為「回 `SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL`」簡 SQL、實質從 stub 變最簡實作、反映實際資料;(3) F9 scope ~18-20 file ~250-280 LOC。對比:Option A 兩條都完整新做 over-engineering;Option B 兩條都 stub `manage/user` 角色下拉可能空;Option D 兩條都不做拆 F9.1 過度顆粒、破壞 DESIGN-A F9 「10 條 alias 統一交付」原意。

- **Q2 (brainstorm)**: F9 直接影響 base-web manage/* view(user/role/menu CRUD)能不能跑。Acceptance 該到哪?→ **A:Option B — alias 路徑 + curl 驗 + base-web src 0 diff(B3 camelCase GAP 留 follow-up)**。理由:(1) F9 follow F11 同 pattern — 只驗 alias 路徑都註冊 + 10 條 curl 驗 stub 行為對齊 expected response shape;(2) B3 camelCase 對齊跨 user/role/menu/route 多 entity response struct、影響全 codebase、F9 範疇外(留 follow-up feature);(3) base-web e2e 驗(CDP browser)複雜度高、與「base-web src 0 diff」紀律不衝突但 acceptance time 過長;(4) F9 scope ~18-20 file ~250-280 LOC、acceptance ~10-12 個 C-V。對比:Option A 只驗部署破壞 F11 acceptance 紀律;Option C 加 camelCase + 1 view e2e scope ~22-25 file ~320-350 LOC;Option D 4 view e2e + 完整 camelCase 超 NFR-002 上限。

- **Q3 (brainstorm)**: batchDeleteUser stub 核心行為 per-row loop + audit + 無 batch tx + 無 casbin cleanup(DESIGN-A 寫明);response shape + partial failure 怎麼處理?→ **A:Option B — 永遠 200 + `{deletedCount: N}` partial-success counted**。理由:(1) per-row loop call `SysUserService::delete_user`(既有 service 有 soft delete + audit hook、F9 不另寫);(2) 中途 fail 不快、continue loop、success counter++、結束同步累計達成 N;(3) 永遠 HTTP 200 + envelope `{code:0, data: {deletedCount: N}, msg:"success", success:true}` — pragmatic stub、前端能看 deletedCount 判斷部分成功;(4) 與 DESIGN-A「無 atomic rollback」字面一致(中途失敗已刪部分仍 soft-deleted、不還原);LOC ~25-30。對比:Option A 全 success 才 200、否則 4xx HTTP 4xx 與「部分已刪」語意矛盾;Option C `{success: [ids], failed: [ids]}` stub over-engineering;Option D 200 + 空 envelope 前端不知刪了多少。

- **Q4 (brainstorm)**: F9 10 條 alias 跨 user/role/menu 三個 entity、5 個新/變形 handler 該集中還是拆到 entity 檔?→ **A:Option B — wrapper handler 加到對應 entity api 檔、route 集中新建 `sys_system_manage_route.rs`**。理由:(1) 4 個新 handler 邏輯與其 service 同檔聚集:`delete_user_by_body` / `batch_delete_users` 進 `sys_user_api.rs`;`get_all_roles` 進 `sys_role_api.rs`;`get_all_pages` 進 `sys_menu_api.rs`;`update_user` 既有 handler 由 alias POST mount 重用(per research.md R-Q1、不需新做 `update_user_post`);(2) route 集中新建 `sys_system_manage_route.rs` — alias 是「虛擬路徑」、跟 user/role/menu route 平行存在、集中一檔一眼看完 10 條 mount;(3) F9 file 改動 ~12 file:7 改 + 2 新建(route + migration)+ 3 register/mod;(4) 未來 user CRUD 邏輯改 → 跳 1 個 file 即可。對比:Option A 全集中 sys_system_manage_*_route + _api 對齊 F11 sys_mock_* pattern 但 4 個 handler 邏輯與 service 拆開;Option C 全塞既有 entity route 不集中 alias 邏輯散落三檔。

- **Q5 (brainstorm)**: getAllPages stub 該回什麼 shape?base-web manage/menu 用此 API 綁定頁面、回空徱底見不到頁面。→ **A:Option C — 回 menu 表 name list 簡單 SQL**。理由:(1) 新 `SysMenuService::find_all_page_keys` = `SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL`(F3 soft delete 過濾隱含);(2) 反映實際 sys_menu 既有 page key、`manage/menu` 綁頁面下拉能體驗 menu 綁定 demo;(3) 不是真 stub、是「最簡實作」— 等同把 Q1 對 getAllPages 從 stub 升級為「最簡 SQL 真實作」;LOC ~15-20。對比:Option A hardcoded 3-5 個 page key 不反映 sys_menu 實際資料;Option B 回空 array demo 體驗破損;Option D 回 501 NotImplemented 與 DESIGN-A「抽離項必須註冊」紀律矛盾。

- **Evidence collection 2026-05-20**(grep + Read tool):
  - 既有 rust router 結構(grep `pub async fn|.route\(`):`sys_user_route.rs` 9 route / `sys_role_route.rs` 5 route / `sys_menu_route.rs` 11 route
  - 既有 rust handler 名稱:`SysUserApi` 8 handler / `SysRoleApi` 5 handler(無 get_all_*)/ `SysMenuApi` 9 handler(無 get_all_pages)
  - 既有 manage/* 範疇 Casbin policy seed(`m20241024_082926_insert_casbin_rule.rs`):**只 ROLE_SUPER allow `/user`/`/role`/`/route` GET/POST/PUT、無 ROLE_ADMIN**(rev1 baseline、F9 不動既有 m20241024、新加 alias path)
  - F11 implement-time finding(`specs/020-extracted-stubs/research.md`):R-Q5 v4='' baseline + R-Q6 deny path envelope wrap(F9 沿用)
  - F11 merge SHA `81ecb0d`(application Phase 4 收尾 + 抽離項清單 4/5 完成、F9 baseline 確認)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 驗 10 條 /systemManage/* alias Soybean role allow + 行為對齊(Priority: P1)🎯 MVP

operator 用 `Soybean` user(ROLE_SUPER)login 拿 access_token → 用該 token 跑 10 條 `/systemManage/*` alias endpoint → **預期 10/10 HTTP 200 + 各 endpoint 預期 response shape 對齊**(per DESIGN-A §4.2 + RESEARCH §6.2 方案 B + brainstorm Section 1 拍板)→ batchDeleteUser 額外驗 partial-success counter 行為。證明 F9 10 條 alias 註冊成功 + Casbin policy allow 對 ROLE_SUPER 生效 + 變形 wrapper / 新做 handler / stub 行為全對齊 brainstorm 拍板。

**Why this priority**:F9 唯一含 implementation 的 user story、對齊 DESIGN-A §4.2 + RESEARCH §6.2 方案 B 直譯 = F9 核心目標。沒此 acceptance、10 條 alias 是否真註冊、Casbin allow 是否生效、變形 wrapper / 新做 handler / stub 行為是否對齊無從驗。

**Independent Test**:用 `Soybean` user login 拿 access_token → 用該 token 跑 10 條 alias endpoint → 預期 10/10 HTTP 200 + 預期 response shape + batchDeleteUser counter 驗。

**Acceptance Scenarios**:

1. **Given** stack 已起(W-FA1 7 service healthy、含 nestjs、且 F9 rust-api image 已 rebuild、F9 Casbin migration 已 rerun),**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body envelope `{code: 0, data:{token, refreshToken, ...}, msg, success}`、access_token 為 HS256 JWT 三段格式。

2. **Given** US1.1 拿到 Soybean access_token,**When** 5 個重用 mount endpoint curl:
   - `GET /api/systemManage/getRoleList` → 預期 HTTP 200 + body envelope + data: paginated role 結果
   - `GET /api/systemManage/getUserList` → 預期 HTTP 200 + body envelope + data: paginated user 結果
   - `POST /api/systemManage/addUser` body `{username, password, ...}` → 預期 HTTP 200 + body envelope + data: 新建 user 資訊
   - `GET /api/systemManage/getMenuList/v2` → 預期 HTTP 200 + body envelope + data: menu 列表(axum route `/v2` 字面 path 解析正確)
   - `GET /api/systemManage/getMenuTree` → 預期 HTTP 200 + body envelope + data: menu tree
   ,**Then** 5/5 endpoint HTTP 200 + envelope `{code:0, data, msg:"success", success:true}`、各 endpoint data shape 對齊既有 rust handler 結果。

3. **Given** US1.1 拿到 Soybean access_token,**When** 3 個 user-CRUD endpoint curl(1 個 alias mount + 2 個變形 wrapper/新 stub):
   - `POST /api/systemManage/updateUser` body `{id, username, ...}` → 預期 HTTP 200 + body envelope + 對齊既有 PUT /user 行為(若 id 不存在則回 envelope error code)
   - `DELETE /api/systemManage/deleteUser` body `{id: "non-existent-id"}` → 預期 HTTP 200 + body envelope(若 id 不存在則回 envelope error code)
   - `DELETE /api/systemManage/batchDeleteUser` body `{ids: ["id1", "id2", "non-existent"]}` → 預期 HTTP 200 + body envelope `{code:0, data: {deletedCount: N}, msg:"success", success:true}`、N ≤ 3
   ,**Then** 3/3 endpoint HTTP 200 + envelope wrap + batchDeleteUser 顯示 partial-success counted。

4. **Given** US1.1 拿到 Soybean access_token,**When** 2 個新做完整 handler endpoint curl:
   - `GET /api/systemManage/getAllRoles` → 預期 HTTP 200 + body envelope + data: array of role(全 status=Enabled、無 pagination wrap)
   - `GET /api/systemManage/getAllPages` → 預期 HTTP 200 + body envelope + data: array of string(menu name list、SELECT DISTINCT name)
   ,**Then** 2/2 endpoint HTTP 200 + envelope wrap + data 反映 sys_role / sys_menu 既有資料。

5. **Given** US1.3 batchDeleteUser 已跑,**When** `docker compose exec -T postgres psql ... -c "SELECT COUNT(*) FROM sys_operation_log WHERE created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '5 minutes' AND operation LIKE '%delete%'"`,**Then** COUNT ≥ 1(per-row delete 既有 service 自帶 audit hook 寫入,F9 stub call 既有 service 不另寫 audit、繼承 §1.5)。

---

### User Story 2 — operator 驗 GeneralUser role deny /systemManage/* alias(Priority: P2)

operator 用 `GeneralUser` user(ROLE_USER、未 allow F9 alias)login 拿 access_token → 用該 token 跑 1 條 alias endpoint(`getUserList` 為代表)→ **預期 HTTP 200 + F4 envelope `{code:5001, success:false, msg:"您没有访问该资源的权限..."}`**(per F11 R-Q6 rust-api `casbin_envelope_adapter` wrap)。證明 Casbin policy deny GeneralUser 對 F9 alias endpoint 生效、RBAC fail-safe 紀律維持(per Principle I)。

**Why this priority**:Casbin enforce 是 F9 唯一一層防線(per F11 Q2 同精神不加 menu × role 第二層 gate)、必驗 deny 路徑生效;1 個 endpoint 足證 enforce 機制 work、10 endpoint Casbin policy 同 row pattern、不必重複驗(per F11 Q4 同精神)。

**Independent Test**:用 `GeneralUser` user login 拿 access_token → curl `getUserList` → 預期 HTTP 200 + envelope `{code:5001, success:false}`。

**Acceptance Scenarios**:

1. **Given** stack 已起 + F9 落地,**When** `curl -X POST -H "Content-Type: application/json" -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + access_token。

2. **Given** US2.1 拿到 GeneralUser access_token,**When** `curl -X GET -H "Authorization: Bearer <token>" http://127.0.0.1:11080/api/systemManage/getUserList`,**Then** HTTP 200 + F4 envelope `{code:5001, data:null, msg:"您没有访问该资源的权限，请联系管理员", success:false}`(per F11 R-Q6 implement-time finding、rust-api `casbin_envelope_adapter` 把 Casbin raw 403 wrap 成 envelope、application-level deny)、**不**回 `{code:0, data: paginated, success:true}` allow path。

---

### User Story 3 — operator 驗 Casbin migration init container rerun + 20 row 落 casbin_rule + W-FA1 stack regression + 既有 endpoint 不退化(Priority: P3)

operator 跑 F9 acceptance 前 / 後查 postgres `casbin_rule` 表確認 F9 migration `m20260520_a_f9_system_manage_alias_seed.rs` 已執行、20 row 落地(2 role × 10 endpoint)+ W-FA1 stack 6 service 仍 healthy + migration init container exited 0 + 既有 `/user/*` `/role/*` `/route/*` endpoint 不退化(F9 新加 alias 不影響既有路徑)。

**Why this priority**:Casbin migration 是 F9 「Casbin enforce」紀律的 DB-side baseline、必驗以證 migration 真執行 + row 真落表(不只 in code、且實際 enforce path query 得到);stack regression 是 W-FA1 既有合作的低風險驗證、對齊 F11 C-V7 同性質;既有 endpoint regression 驗 F9 「不修既有 m20241024 + 不影響既有 router」紀律。

**Independent Test**:跑 docker compose `migration` service rerun + `psql ... SELECT COUNT(*) FROM casbin_rule WHERE v2 LIKE '/systemManage/%'`,COUNT = 20 + `docker compose ps` 6 healthy + curl 既有 `/user/` `/role/` `/route/tree` 全通 HTTP 200。

**Acceptance Scenarios**:

1. **Given** stack 已起、F9 rust-api image rebuild + migration init container rerun 完成,**When** `docker compose exec -T postgres psql ... -c "SELECT v0, v2, v3 FROM casbin_rule WHERE v2 LIKE '/systemManage/%' ORDER BY v0, v2"`,**Then** 回 20 row、`(v0, v2, v3)` 對齊期望(`{ROLE_SUPER, ROLE_ADMIN} × {10 endpoint × HTTP method}`、v4 全空字串 implicit allow per F11 R-Q5 baseline)。

2. **Given** F9 落地,**When** `docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`,**Then** 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ migration init container exited 0(rerun 後 stop)+ rust-api uptime 較短(剛 recreated)、其他 5 service uptime 較長。

3. **Given** F9 落地、Soybean access_token,**When** 3 個既有 endpoint curl:
   - `GET /api/user/` → 預期 HTTP 200 + 對齊 F9 落地前行為
   - `GET /api/role/` → 預期 HTTP 200 + 對齊 F9 落地前行為
   - `GET /api/route/tree` → 預期 HTTP 200 + 對齊 F9 落地前行為
   ,**Then** 3/3 endpoint HTTP 200(F9 新加 alias path 不影響既有 router、既有 m20241024 Casbin policy 未動)。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `batchDeleteUser` 收 `ids` 為空 array `[]` | per-row loop 0 次、永遠 200 + `{deletedCount: 0}`、無 audit 寫入(per Q3 拍板 stub 行為) |
| E-2 | `batchDeleteUser` 收 `ids` 全為不存在 id | per-row loop call 既有 service、每次 service 視 id 不存在處理(可能 raise error or no-op),counter 累計取決於 service 行為;永遠 200 + `{deletedCount: N}`、N ≤ ids.length |
| E-3 | `addUser` 接受 `{username, password}` minimal vs `{username, password, role_id, ...}` full | mount 既有 `SysUserApi::create_user`、serde Deserialize 行為 = 既有 handler 行為;F9 不改變 |
| E-4 | `updateUser` POST body 對齊既有 PUT update_user payload | 重用既有 `UpdateUserInput` DTO、serde Deserialize 行為 = 既有 handler 行為;F9 不改變 |
| E-5 | `deleteUser` 收 body `{id: null}` 或 missing field | serde Deserialize reject、回 4xx 不進 handler;F9 不加自訂 validation |
| E-6 | `getAllRoles` 無任何 enabled role(DB 全 disabled) | 回 HTTP 200 + envelope `data: []` empty array、不 error |
| E-7 | `getAllPages` sys_menu 表為空(DB 無 row) | 回 HTTP 200 + envelope `data: []` empty array、不 error |
| E-8 | `getMenuList/v2` axum route 解析 `/v2` 是否被誤判為 path param | axum 字面解 `/v2` 為靜態 path(per R-3 緩解、cargo build 編譯期自驗);C-V3 直接 curl 預期 200 為運行期驗證 |
| E-9 | Casbin migration 重複 rerun(idempotent) | migration init container 重跑時、`seaql_migrations` 表追蹤已執行、`m20260520_a_f9` 預期只 up() 一次、不破壞 idempotency(對齊 F6 + F11 既有 pattern) |
| E-10 | Administrator(ROLE_ADMIN)跑 F9 endpoint | 預期 10/10 HTTP 200(allow、與 Soybean Casbin functional duplicate)、F9 acceptance 不主動驗(per F11 Q4 同精神)、屬 implicit verified by Casbin policy seed shape |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: F9 MUST mount 5 個重用 handler 到 `/systemManage/*` 路徑:`GET /getRoleList` → `SysRoleApi::get_paginated_roles`、`GET /getUserList` → `SysUserApi::get_paginated_users`、`POST /addUser` → `SysUserApi::create_user`、`GET /getMenuList/v2` → `SysMenuApi::get_menu_list`、`GET /getMenuTree` → `SysMenuApi::tree_menu`。
- **FR-002**: F9 MUST mount `POST /systemManage/updateUser` 重用既有 `SysUserApi::update_user` handler(per research.md R-Q1:既有 handler 用 `ValidatedForm<UpdateUserInput>` body extractor、method-agnostic、F9 POST alias mount 同 handler 不需新做 wrapper)。
- **FR-003**: F9 MUST 加 `DELETE /systemManage/deleteUser` 變形 wrapper handler `SysUserApi::delete_user_by_body`(在 `sys_user_api.rs` 加 fn、body 抽 `{id}`、call `SysUserService::delete_user`);**新加 DTO** `DeleteUserByBodyInput { id: String }`。
- **FR-004**: F9 MUST 加 `DELETE /systemManage/batchDeleteUser` 新做 stub handler `SysUserApi::batch_delete_users`(在 `sys_user_api.rs` 加 fn、body 接 `{ids: Vec<String>}`、per-row loop call `SysUserService::delete_user`、success counter++、永遠回 HTTP 200 + envelope `{code:0, data: {deletedCount: N}, msg:"success", success:true}`、N ≤ ids.length);**新加 DTO** `BatchDeleteUserInput { ids: Vec<String> }`。
- **FR-005**: F9 MUST 加 `GET /systemManage/getAllRoles` 新做完整 handler `SysRoleApi::get_all_roles`(在 `sys_role_api.rs` 加 fn)+ service method `SysRoleService::find_all_enabled`(在 `sys_role_service.rs` 加 fn、`SELECT * FROM sys_role WHERE status = Enabled AND deleted_at IS NULL`)、回 HTTP 200 + envelope `data: Vec<Role>`。
- **FR-006**: F9 MUST 加 `GET /systemManage/getAllPages` 新做最簡實作 handler `SysMenuApi::get_all_pages`(在 `sys_menu_api.rs` 加 fn)+ service method `SysMenuService::find_all_page_keys`(在 `sys_menu_service.rs` 加 fn、`SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL`)、回 HTTP 200 + envelope `data: Vec<String>`。
- **FR-007**: F9 MUST 新建 `rust-api/server/router/src/admin/sys_system_manage_route.rs` 集中 10 條 route mount + 10 個 RouteInfo register、`SysSystemManageRouter::init_router()` 對齊既有 router pattern。
- **FR-008**: F9 MUST 新建 `rust-api/migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs` Casbin policy seed migration、`up()` INSERT 20 row(2 role × 10 endpoint × `p` policy、domain=`built-in`、v4=''、per F11 R-Q5 baseline)、`down()` DELETE 對應 20 row。
- **FR-009**: F9 Casbin policy seed MUST 對 `Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN)` allow 10 條 alias endpoint;對 `GeneralUser (ROLE_USER)` **不**插 row(default deny per Casbin enforce 機制、per F11 Q1 同精神)。
- **FR-010**: F9 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV + brainstorm Q2)。
- **FR-011**: F9 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file(per Constitution Principle IV + W-FA*/F10/F11 三邊零改動延伸)。
- **FR-012**: F9 MUST 不動 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`(W-FA1 既有 wire 已涵蓋、F9 不加新 envvar / secret)。
- **FR-013**: F9 MUST 不動 `deploy/front-nginx/conf.d/default.conf` / nginx config(alias 在 rust router 註冊、nginx 透明、per DESIGN-A §3.1)。
- **FR-014**: F9 MUST 不動 `rust-api/migration/src/datas/` 既有 migration 檔(F9 新建 1 個 single migration、不改既有 F1/F2.1/F3/F4/F5.1/F6/F11 migration、per Constitution Principle IV「base 不改動邊界」)。
- **FR-015**: F9 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit(~12 file ~315 LOC、per research.md R-Q1 修正)+ outer 1-2 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1)。
- **FR-016**: F9 MUST 不寫 sys_operation_log audit log 額外於 service hook(per Q3 拍板、F9 stub 直接 call 既有 service、繼承既有 audit hook)。但 batchDeleteUser per-row loop call 既有 `SysUserService::delete_user` 預期觸發 audit hook(per row 寫入 sys_operation_log)、繼承 §1.5 全域 audit 紀律。
- **FR-017**: F9 MUST 不加 rust unit test(per F11 Q3、wrapper 邏輯 stack-可見 / batchDelete loop 簡單 / curl 驗即可)。
- **FR-018**: F9 MUST 不加 input validation 比 serde 預設更嚴(per F11 Q3、用 serde `Deserialize` derive 預設行為、reject malformed JSON、不加自訂 message)。
- **FR-019**: F9 acceptance MUST 用 inline bash + `contracts/verification-commands.md`(per F11 慣例)、不新建 deploy script。
- **FR-020**: F9 MUST 用 `Soybean` + `GeneralUser` user 跑 acceptance(對齊 F5.1/F6/F10/F10.1/F10.2/F11 既有慣例、per F11 Q4 同精神);Administrator 不主動跑(Casbin functional duplicate of Soybean、per F11 Q4)。
- **FR-021**: F9 MUST 在 W-FA1 dev + `--profile track-a` profile 起的 stack 上跑 acceptance(對齊 F10/F11)。
- **FR-022**: F9 MUST 不加 sys_menu seed row(per F11 Q2 同精神、scope 最小化、Casbin enforce 一層防線)。
- **FR-023**: F9 MUST 不加新 sys_role(test / demo)+ user-role assignment(per F11 Q1 同精神、複雜度提升不在 v1 範疇、留 future feature)。
- **FR-024**: F9 MUST 不解 B3 camelCase GAP(per brainstorm Q2、留 follow-up feature、F9 response shape 對齊既有 rust handler snake_case)。
- **FR-025**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Active feature 改 F9、F9 完成里程碑、Application Phase 4 後續 / 並行進度標記、DESIGN-A §4.2 抽離項清單 5/5 完成記錄。
- **FR-026**: F9 batchDeleteUser MUST 不加 batch-level transaction(per Q3 + DESIGN-A §4.2、per-row tx 仍滿足 §1.5);MUST 不加 casbin orphan cleanup(per DESIGN-A §4.2、user 刪後 g rule 不主動清);MUST 不加 batch limit(DESIGN-A 未寫上限、F9 follow)。

### Non-Functional Requirements

- **NFR-001**: F9 acceptance 跑時間 SHOULD ≤ 15s(10 個 C-V + 10 endpoint curl + 1 GeneralUser deny curl + 1 psql + 1 audit grep + 3 既有 endpoint regression、不含 stack 啟動 + rust image rebuild)。
- **NFR-002**: F9 spec / plan / tasks 規模 SHOULD 對齊 ~12-file rust-source feature 規模(~25-30 task、~280-320 行 spec、12 file ~315 LOC code、per research.md R-Q1 修正 + brainstorm Section 2 file 結構)。F11 13-file 為更近 reference(~24 task、~118 LOC)、F9 因加 service layer + 多 entity + 既有 endpoint regression 而較多。
- **NFR-003**: F9 acceptance failure mode SHOULD 明確指 friction 落點(rust handler logic / Casbin enforce / migration init / response shape 不對齊),便於 follow-up 判斷。
- **NFR-004**: F9 完成標誌 SHOULD 為:US1 5/5 + US2 2/2 + US3 3/3 = **10/10 PASS**(對齊 F11 7/7 verification pattern 等比放大、無 unit test 補位)。
- **NFR-005**: F9 rust image rebuild 時間 SHOULD ≤ 5 min warm(對齊 F11 baseline、加 5 個新 handler + 2 service method 不會破壞 cargo cache hit 主體)、cold ≤ 7 min(對齊 F10.1 baseline + W-F1)。
- **NFR-006**: F9 handler latency SHOULD ≤ 50ms p99(getRoleList / getUserList / getMenuList paginated 是 DB query、其他 wrapper / stub 是純記憶體 + 1-2 DB call、應遠低於既有 endpoint;不主動 benchmark、留 future observability feature)。

### Key Entities

- **rust `SysUserApi`**(`rust-api/server/api/src/admin/sys_user_api.rs`)— F9 加 **2 個** handler(`delete_user_by_body` / `batch_delete_users`、per research.md R-Q1:`update_user_post` 不需新做、既有 `update_user` 由 alias POST mount 重用)、~40 LOC、既有 8 個 handler 不動(`update_user` 由 F9 alias POST mount 重用)
- **rust `SysRoleApi`**(`rust-api/server/api/src/admin/sys_role_api.rs`)— F9 加 1 個 handler(`get_all_roles`)、~25 LOC、既有 5 個 handler 不動
- **rust `SysMenuApi`**(`rust-api/server/api/src/admin/sys_menu_api.rs`)— F9 加 1 個 handler(`get_all_pages`)、~20 LOC、既有 9 個 handler 不動
- **rust `SysRoleService`**(`rust-api/server/service/src/admin/sys_role_service.rs`)— F9 加 1 個 method(`find_all_enabled`)、~20 LOC
- **rust `SysMenuService`**(`rust-api/server/service/src/admin/sys_menu_service.rs`)— F9 加 1 個 method(`find_all_page_keys`)、~15 LOC
- **rust `SysSystemManageRouter`**(`rust-api/server/router/src/admin/sys_system_manage_route.rs`、**新建**)— `init_router()` 含 10 條 route mount + 10 個 RouteInfo register、~80 LOC
- **rust DTO**(`server/model/src/admin/input/sys_user.rs` 既有檔加、對齊既有 `UpdateUserInput` 同檔慣例)— `DeleteUserByBodyInput {id: String}` / `BatchDeleteUserInput {ids: Vec<String>}`、~15 LOC;`updateUser` POST alias 重用既有 `SysUserApi::update_user` handler + `UpdateUserInput` DTO、不新做 wrapper(per research.md R-Q1)
- **rust Casbin migration**(`rust-api/migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`、**新建**)— `MigrationTrait` impl + `up()` INSERT 20 row + `down()` DELETE 20 row、~80 LOC
- **既有 base-web example login view + manage/* 4 view** — **不動**(per FR-010、F9 不驗 base-web e2e、base-web 預期路徑可被新 alias 滿足)
- **既有 nestjs `TokenStatus` 與 sys_tokens 表** — **不動**(per FR-011、F9 與 token state machine 無關)
- **`casbin_rule` 表**(F6 + F11 已驗 schema)— F9 寫入時加 20 row(`p` policy)、其他 column 不變;`g` rule 沿用 F5.1 seed user-role assignment 不動
- **`sys_role` / `sys_menu` / `sys_user` 表**(既有 schema)— F9 不改 schema、只新增 SELECT 操作

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F9 落地後跑 US1.1 → HTTP 200 + body envelope + Soybean access_token 為 HS256 JWT 三段格式(F10.1 沿用、F9 regression 驗)。
- **SC-002**: F9 落地後跑 US1.2 → 5 個重用 mount endpoint(getRoleList / getUserList / addUser / getMenuList/v2 / getMenuTree)全 HTTP 200 + envelope `{code:0, data, msg:"success", success:true}` + 各 data shape 對齊既有 rust handler 結果 — F9 重用 mount 行為對齊。
- **SC-003**: F9 落地後跑 US1.3 → 3 個 user-CRUD endpoint(updateUser POST alias mount + deleteUser body 變形 wrapper + batchDeleteUser stub)全 HTTP 200 + envelope wrap + batchDeleteUser 顯示 `{deletedCount: N}` partial-success counter(N ≤ ids.length、per Q3 拍板)。
- **SC-004**: F9 落地後跑 US1.4 → 2 個新做完整 handler endpoint(getAllRoles / getAllPages)全 HTTP 200 + envelope `data: Vec<...>` 反映實際 sys_role / sys_menu 既有資料。
- **SC-005**: F9 落地後跑 US1.5 → `psql ... sys_operation_log` 查 batchDelete 後 ≥ 1 row(per-row delete 既有 service hook 自帶 audit 寫入、繼承 §1.5)。
- **SC-006**: F9 落地後跑 US2.2 → GeneralUser 用 `getUserList` 收 HTTP 200 + F4 envelope `{code:5001, success:false, msg:"您没有访问该资源的权限..."}` — Casbin enforce fail-safe 對 ROLE_USER 生效(per Principle I + F11 R-Q6)。
- **SC-007**: F9 落地後跑 US3.1 → `psql ... casbin_rule` 查 `WHERE v2 LIKE '/systemManage/%'` 回 20 row、`(v0, v2, v3)` 對齊期望(`{ROLE_SUPER, ROLE_ADMIN} × {10 endpoint × HTTP method}`、v4 全空字串 per F11 R-Q5 baseline)。
- **SC-008**: F9 落地後跑 US3.2 → `docker compose ps` 6 service healthy + migration init container exited 0 + rust-api uptime 較短(剛 recreated)、其他 5 service uptime 較長(W-FA1 stack regression、per FR-021)。
- **SC-009**: F9 落地後跑 US3.3 → 3 個既有 endpoint(`/user/` / `/role/` / `/route/tree`)全 HTTP 200 + 對齊 F9 落地前行為(F9 新加 alias path 不影響既有 router、既有 m20241024 Casbin policy 未動、per FR-014)。
- **SC-010**: F9 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1-2 commit + merge + optional SHA fill follow-up)。
- **SC-011**: F9 不動 base-web src(`git diff HEAD -- base-web/src/` 無輸出、per FR-010 + Constitution Principle IV)。
- **SC-012**: F9 不動 nestjs fork source(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出、per FR-011 + W-FA*/F10/F11 三邊零改動延伸)。
- **SC-013**: F9 不動 docker-compose.yml(`git diff HEAD -- docker-compose*.yml` 無輸出、per FR-012)。
- **SC-014**: F9 acceptance 整套 ≤ 15s(per NFR-001)。
- **SC-015**: F9 rust-api 改動範圍 = **~12 file** `~315 LOC`(per NFR-002 + brainstorm Section 2 file 結構 + Q4 file org + research.md R-Q1 修正)。
- **SC-016**: F9 DESIGN-A §4.2 抽離項清單交付進度 = **5/5 完成**(F11 4 條 + F9 batchDeleteUser 1 條收尾、DESIGN-A 抽離項清單收尾)。

## Assumptions

- **A-001**: F11 已 merge(application Phase 4 後第一個 post-Phase-4 feature 完成、merge `81ecb0d`、`init_protected_router` Casbin enforce flip 落定、抽離項清單 4/5 完成)。✅
- **A-002**: F11 implement-time finding 沿用:R-Q5(v4='' baseline、Casbin 4-field model implicit allow)+ R-Q6(deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)。
- **A-003**: F11 系列 + 其前 baseline 全 merge(F4 envelope shape、F5.1 seed user/role、F6 Casbin migration pattern、F10/F10.1/F10.2 refreshToken end-to-end pass、W-FA1/W-FA2/W-FA3 deploy 結構)。✅
- **A-004**: 既有 `SysUserService` / `SysRoleService` / `SysMenuService` 提供完整 CRUD + soft delete + audit hook、F9 wrapper handler 直接 call 即可,不需另寫 audit 邏輯。
- **A-005**: rust-api image rebuild ~3-5 min warm cache(對齊 F11 baseline、加 5 個新 handler + 2 service method 不破壞 cargo cache 主體);cold ~5-7 min(F10.1 + W-F1 baseline)。
- **A-006**: 既有 m20241024 Casbin policy(只 ROLE_SUPER allow `/user`/`/role`/`/route`、無 ROLE_ADMIN)— F9 不動既有 row、只新加 `/systemManage/*` path 的 row(20 row)。**這代表既有 `/user/*` 對 ROLE_ADMIN(Administrator)deny、但 F9 新加 `/systemManage/getUserList` 對 ROLE_ADMIN allow** — 為 spec 一致性差異、不在 F9 範疇修(per FR-014 + Constitution Principle IV)。
- **A-007**: axum route `.route("/getMenuList/v2", get(...))` 字面解析正確、`/v2` 為靜態 path 不被解為 path param(per R-3 + cargo build 編譯期自驗 + acceptance C-V3 運行期驗證)。
- **A-008**: rust migration init container 機制(W-FA1 既有 wire、`docker compose up -d --wait migration`)會在 stack restart 時自動 rerun new migration、F9 1 個新 migration 預期 init container exited 0 + 20 row 落地。
- **A-009**: Casbin enforce middleware(F6 + F11 既有 wire、F11 `init_protected_router` Casbin enforce flip 落定)對 F9 alias endpoint 自動生效(rust router 註冊 endpoint 後 Casbin policy 自動 enforce、無需 F9 額外配 middleware)。
- **A-010**: nginx W-F5 + W-FA2 既有設計除 `/api/auth/refreshToken` 走 nestjs、其餘 `/api/*` 都 rust(F9 10 條 alias 默認走 rust、不需 F9 動 nginx config)。
- **A-011**: base-web example branch 既有 view(manage/*)使用 `/systemManage/*` 路徑、F9 alias 落地後預期可被 base-web 呼叫;但 base-web e2e 不在 F9 acceptance 範疇(per FR-010 + Q2)。
- **A-012**: serde `Deserialize` derive 預設 reject malformed JSON(missing field、type mismatch)、回 4xx 不進 handler、F9 不需自訂 input validation 即可有基本 reject。

## Dependencies

### Inbound(本 feature 依賴)

- **F2.1** `audit-log-infrastructure`:audit 設計、F9 stub call 既有 service 繼承 audit hook。✅(merge `209a2c8`)
- **F3** `soft-delete-infrastructure`:soft delete 設計、F9 getAllRoles / getAllPages SQL 用 deleted_at IS NULL 隱含過濾。✅(merge `0f1c5c3`)
- **F4** `response-shape-alignment`:envelope shape、F9 acceptance 沿用。✅(commit `3d357e5`)
- **F5.1** `auth-login-and-dynamic-menu`:seed user + `g` rule、F9 acceptance 需 login。✅(merge `e71aefe`)
- **F6** `route-guard`:Casbin migration seed pattern、F9 沿用。✅(merge `a431215`)
- **F10** `refresh-token-nestjs-bridge`:wire-up baseline、F9 不動但需 stack 起。✅(merge `8f0e84c`)
- **F10.1** `rust-jwt-refresh-token-signing`:F9 沿用 access_token 路徑。✅(merge `48b70e6`)
- **F10.2** `rust-tokenstatus-string-align`:F9 不直接依賴但 stack 穩定後做 F9 較順。✅(merge `851ec79`)
- **F11** `extracted-stubs`:抽離項清單前 4 條 + Casbin enforce flip + R-Q5/R-Q6 implement-time baseline、F9 沿用。✅(merge `81ecb0d`)
- **W-FA1** `compose-nestjs-service`:nestjs container + secret wire、F9 不動但需 stack 起。✅(merge `b095d55`)
- **W-FA2** `nginx-track-a-transitional-block`:nginx 路由規則、F9 10 條 alias 默認走 rust(不在 TRANSITIONAL block)。✅(merge `c5b7840`)
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build automation、F9 不動但 stack 需起。✅(merge `f23f38e`)

### Outbound(本 feature 解鎖)

- **DESIGN-A §4.2 抽離項清單 5/5 完成**:F11 4 條(sendCaptcha / verifyCaptcha / auth/error / mock/getLastTime)+ F9 1 條(batchDeleteUser)= 5/5 全交付
- **F7** `manage-crud-alignment`(若有後續、F9 alias 已就位、manage/* base view 可體驗)
- **F13** `rust-refresh-token-impl`:DESIGN-B 階段 rust 自驗 refresh token、F9 alias 補完讓 rust 端 API surface 完整
- **F14** `design-a-to-b-cutover`:F9 alias 在 DESIGN-B 階段保留(DESIGN-B §4.2 + §6 identical)、邊界明確
- **base-web SPA manage/* 完整體驗**:manage/user / manage/role / manage/menu / manage/user-detail 4 view 可體驗(F9 alias 落地後、base-web 預期路徑滿足、e2e 驗留 follow-up)

### 與 F9 並行可選(per DESIGN-A §6.2)

- **F7** `manage-crud-alignment`(Phase 3、依賴 F5、不直接依賴 F9 但 F9 alias 落地後 manage/* 可體驗更完整)
- **F12** `cleanup-job`(Phase 4、F9/F12 可並行 per DESIGN-A §6.2)
- **W-F11** `observability`(Phase W deploy P2 剩餘、F9 不依賴)
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up、F9 不依賴)
- **B3 camelCase GAP follow-up feature**(留 future、F9 不解 per FR-024)

## Out of Scope

- **OOS-001**: 不解 B3 camelCase GAP(per FR-024 + Q2)
- **OOS-002**: 不驗 base-web e2e(per Q2、不跑 CDP browser e2e)
- **OOS-003**: 不加 sys_menu seed row(per FR-022 + F11 Q2 同精神)
- **OOS-004**: 不加新 sys_role(test / demo)+ user-role assignment(per FR-023 + F11 Q1 同精神)
- **OOS-005**: 不寫 sys_operation_log audit 額外於 service hook(per FR-016 + Q3、F9 繼承既有 service hook)
- **OOS-006**: 不加 rust unit test(per FR-017 + F11 Q3)
- **OOS-007**: 不加 input validation 比 serde 預設更嚴(per FR-018 + F11 Q3)
- **OOS-008**: 不改 base-web SPA src(per FR-010 + Constitution Principle IV)
- **OOS-009**: 不改 nestjs fork source(per FR-011、三邊零改動標配)
- **OOS-010**: 不改 nginx config(per FR-013、F9 alias 在 rust router 註冊、nginx 透明)
- **OOS-011**: 不改 docker-compose.yml / Dockerfile(per FR-012、對比 F10.1)
- **OOS-012**: 不加 batch-level transaction(per FR-026 + Q3 + DESIGN-A §4.2、per-row tx 仍滿足 §1.5)
- **OOS-013**: 不加 casbin orphan cleanup(per FR-026 + DESIGN-A §4.2、user 刪後 g rule 不主動清)
- **OOS-014**: 不加 batch limit(per FR-026 + DESIGN-A 未寫上限、F9 follow)
- **OOS-015**: 不修既有 `/user/*` `/role/*` `/route/*` Casbin row(per FR-014 + Constitution Principle IV、A-006 spec 一致性差異 留 follow-up)
- **OOS-016**: 不主動 benchmark handler latency(per NFR-006、無 observability infrastructure 留 W-F11)
- **OOS-017**: 不驗 Administrator 跑 F9 endpoint(Casbin functional duplicate of Soybean、per F11 Q4 同精神)

## Risks

- **R-1**(低)**`updateUser` POST alias mount 對 既有 `update_user` PUT handler body shape 不對齊**:F9 直接 mount 既有 handler(per research.md R-Q1)、若 base-web 預期 POST body shape 與既有 `ValidatedForm<UpdateUserInput>` 不對齊、acceptance C-V4b 會 surface。**緩解**:既有 `update_user` handler 已 method-agnostic、F9 不改 handler 邏輯、body shape 由既有 handler ValidatedForm 決定、不引入 F9-side body parse 風險;若 shape 與 base-web 預期不對齊屬 B3 camelCase GAP 範疇(per FR-024 留 follow-up)。

- **R-2**(低)**`batchDeleteUser` 中途 fail 後 `{deletedCount: N}` 數值不準**:per-row loop 每 round await `SysUserService::delete_user`、success counter++、若 service raise Err 該 round 不 increment;結束永遠回 200 + counted。**緩解**:用 standard Rust loop `for id in input.ids { match service.delete_user(id).await { Ok(_) => count += 1, Err(_) => continue } }`、acceptance C-V4c 用部分存在 + 部分不存在 ids 驗 N 落在 0..ids.length 區間。

- **R-3**(極低)**`/systemManage/getMenuList/v2` 路徑含 `/v2` 與 axum route 解析衝突**:axum 支援字面 path 解析、`.route("/getMenuList/v2", get(...))` 應該被解為靜態 path。**緩解**:F9 implement 時 axum-side grep 既有 `.route("/.../v?")` 含 slash 的範例 + cargo build 編譯期自驗(若 route conflict 會在 build 失敗)、acceptance C-V3 直接 curl `/systemManage/getMenuList/v2` 預期 200 為運行期驗證。

- **R-4**(中)**F9 file 改動 7 改 entity api/service/model — 比 F11 的 13 file(全 stub)複雜、可能漏 mod re-export**:F9 加 handler 跨 user/role/menu 三 entity api + 2 service + 1 model;mod re-export 漏會致 router file import 找不到 fn。**緩解**:對齊 F11 spec compliance + code quality review 雙 reviewer pattern、stack rebuild 階段 cargo build 會 surface 漏 mod;implement 時優先 add re-export 對齊 entity mod.rs 既有 pattern。

- **R-5**(極低)**既有 `/user/*` `/role/*` 既有 Casbin row(只 ROLE_SUPER allow)與 F9 新加 alias 對 ROLE_ADMIN 不對齊 — admin 訪問既有 `/user/` 不通,訪問 `/systemManage/getUserList` 通**:Administrator 用既有路徑會被 Casbin deny、但 F9 alias 路徑 allow、形成 spec 一致性差異。**緩解**:不在 F9 範疇修(per Constitution Principle IV「base 不改動邊界」+ FR-014「不改既有 migration」+ §6.1「漸進收縮」、既有 m20241024 baseline 不動)、F9 只新增 alias path;A-006 已記錄為已知差異、留 follow-up feature 統一 manage/* 範疇 Casbin policy。

- **R-6**(極低)**migration init container 對既有 20 row idempotency 不對齊**:F9 1 個新 migration、如 rerun 時 INSERT 重複觸 UNIQUE constraint。**緩解**:sea-orm migration init container 機制以 `seaql_migrations` 表追蹤已執行 migration、預期 F9 migration 只 up() 一次(per F6 + F11 既有驗);如 `m20260520_a_f9` 重複觸 UNIQUE error、屬 migration 內部 bug、F9 acceptance C-V2 應 surface(COUNT > 20)。
