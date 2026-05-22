# F9 — systemManage-alias-router

**Date**: 2026-05-20
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-20(5 顯式拍板 Q + project context exploration via grep + F11 baseline 沿用)

---

## Scope summary

rev1 **DESIGN-A §4.2 抽離項清單收尾 feature**(F11 補 4 條 stub 後接續、F9 補最後 1 條 `batchDeleteUser` stub + 完整 9 條 `/systemManage/*` alias = 10 條完整交付)。補 RESEARCH §6.2 方案 B「rust 加 `/systemManage/*` alias router」(per [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1 + §4.2 + [`docs/INTEGRATION-RESEARCH.md`](../INTEGRATION-RESEARCH.md) §6.2):

| # | systemManage Endpoint | Method | F9 Handler 策略 |
|---|---|---|---|
| 1 | `/getRoleList` | GET | mount `SysRoleApi::get_paginated_roles` 直接重用 |
| 2 | `/getAllRoles` | GET | **新做** `SysRoleApi::get_all_roles` + `SysRoleService::find_all_enabled`(SELECT WHERE status=Enabled) |
| 3 | `/getUserList` | GET | mount `SysUserApi::get_paginated_users` 直接重用 |
| 4 | `/addUser` | POST | mount `SysUserApi::create_user` 直接重用 |
| 5 | `/updateUser` | POST | **變形 wrapper** `SysUserApi::update_user_post`(POST + body extract、重用既有 `UpdateUserInput` DTO → call `SysUserService::update_user`) |
| 6 | `/deleteUser` | DELETE | **變形 wrapper** `SysUserApi::delete_user_by_body`(DELETE + body 抽 id → call `SysUserService::delete_user`) |
| 7 | `/batchDeleteUser` | DELETE | **新做 stub** `SysUserApi::batch_delete_users`(per-row loop call `SysUserService::delete_user`、永遠 200 + `{deletedCount: N}`) |
| 8 | `/getMenuList/v2` | GET | mount `SysMenuApi::get_menu_list` 直接重用 |
| 9 | `/getAllPages` | GET | **新做** `SysMenuApi::get_all_pages` + `SysMenuService::find_all_page_keys`(SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL) |
| 10 | `/getMenuTree` | GET | mount `SysMenuApi::tree_menu` 直接重用 |

加 **1 個 Casbin policy seed migration**:`Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN) allow / GeneralUser deny`、INSERT **20 row**(2 role × 10 endpoint)、v4=''(per F11 R-Q5 baseline)。

範疇刻意收緊到「**10 條 alias + Casbin enforce + 三邊零改動 + base-web src 0 diff**」、**不解 B3 camelCase GAP / 不驗 base-web e2e / 不加 sys_menu seed / 不加新 role / 不加 batch tx / 不加 casbin orphan cleanup / 不加 rust unit test**。

**Commit 模式**(post brainstorm 拍板 — F9 固定):
- **兩段式** commit(per CLAUDE.md §4.1、類 F11/F10.2/F10.1/F6/F5.1):rust-api worktree 1 commit + outer 1-2 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1、W-FA1 既有 wire 已涵蓋)

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1「抽離項管理」+ §4.2「抽離項清單 × stub 行為 × 升級路徑」(F9 收尾 batchDeleteUser stub、與 F11 4 條合計 5/5 完整交付)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 4(F9 在 F11 後、DESIGN-A §4.2 抽離項清單收尾)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) §4.2 + §6(F9 在 DESIGN-B 完全繼承、identical)
- [`docs/INTEGRATION-RESEARCH.md`](../INTEGRATION-RESEARCH.md) §6.2 方案 B「後端加 `/systemManage/*` alias router」(F9 主來源、明確選 rust 實作、重用既有 service)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I「RBAC fail-safe」+ IV「base 不改動邊界」+ V「漸進收縮」— F9 alias + stub 為 DESIGN-A 過渡、未來升級路徑明確)
- 既有 rust `SysUserApi` / `SysRoleApi` / `SysMenuApi`(全有 CRUD + paginated handler、F9 加 5 個新 handler:`update_user_post` / `delete_user_by_body` / `batch_delete_users` / `get_all_roles` / `get_all_pages`)
- 既有 rust router 結構(`rust-api/server/router/src/admin/`、F11 後共 13 個 route file、F9 新建第 14 個:`sys_system_manage_route.rs`)
- 既有 F11 Casbin policy seed pattern(`m20260519_a_f11_extracted_stubs_seed.rs`、F9 沿用 INSERT casbin_rule pattern、v4='' baseline)
- 既有 F5.1 seed user(Soybean/ROLE_SUPER、Administrator/ROLE_ADMIN、GeneralUser/ROLE_USER、3 user 共密碼 `123456`)
- **F11 implement-time finding 沿用**:R-Q5(v4='' baseline)+ R-Q6(Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)
- F11 merge SHA `81ecb0d`(application Phase 4 收尾 + 抽離項清單 4/5 完成、F9 baseline)

---

## Clarifying Q(5 個 brainstorm 拍板)

### Q1 — `getAllRoles` 和 `getAllPages` 兩條 rust 既有完全沒對應 method,怎麼處理?

**A:Option C — `getAllRoles` 完整 + `getAllPages` stub(實際為簡 SQL,反映 sys_menu 既有資料)**。

理由:
- `getAllRoles` 反映實際使用 — base-web `manage/user` 在 user 編輯下拉常用 → 新增 `SysRoleService::find_all_enabled` 完整實作回所有 status=Enabled 的 role 完整列表
- `getAllPages` 邊緣 view(`manage/menu` 綁頁面)— per Q5 升級為「回 `SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL`」簡 SQL,實質從 stub 變最簡實作、反映實際資料
- F9 scope ~18-20 file ~250-280 LOC

對比 reject:
- **Option A** 兩條都完整新做:over-engineering、`getAllPages` 完整 SQL + 對齊 base-web 預期 shape 工作量超 F9 scope
- **Option B** 兩條都 stub:`manage/user` 角色下拉可能空、demo 體驗破損
- **Option D** 兩條都不做、拆 F9.1:過度顆粒、破壞 DESIGN-A F9「10 條 alias 統一交付」原意

### Q2 — Acceptance 範疇 / B3 camelCase GAP 該不該在 F9 內解?

**A:Option B — alias 路徑 + curl 驗 + base-web src 0 diff(B3 camelCase GAP 留 follow-up)**。

理由:
- F9 follow F11 同 pattern — 只驗 alias 路徑都註冊 + 10 條 curl 驗 stub 行為對齊 expected response shape
- B3 camelCase 對齊跨 user/role/menu/route 多 entity response struct、影響全 codebase、F9 範疇外(留 follow-up feature)
- base-web e2e 驗(CDP browser)複雜度高、與「base-web src 0 diff」紀律不衝突但 acceptance time 過長
- F9 scope ~18-20 file ~250-280 LOC、acceptance ~10-12 個 C-V

對比 reject:
- **Option A** 只驗部署:破壞 F11 acceptance 紀律
- **Option C** 加 camelCase + 1 view e2e:scope ~22-25 file ~320-350 LOC、增加實作 + 驗收複雜度
- **Option D** 4 view e2e + 完整 camelCase:超 NFR-002 ~20-25 task 上限、scope 過大

### Q3 — `batchDeleteUser` stub 核心行為(per-row loop + audit + 無 batch tx + 無 casbin cleanup)DESIGN-A 寫明;response shape + partial failure 怎麼處理?

**A:Option B — 永遠 200 + `{deletedCount: N}` partial-success counted**。

理由:
- per-row loop call `SysUserService::delete_user`(既有 service 有 soft delete + audit hook、F9 不另寫)
- 中途 fail 不快、continue loop、success counter++、結束同步累計達成 N
- 永遠 HTTP 200 + envelope `{code:0, data: {deletedCount: N}, msg:"success", success:true}` — pragmatic stub、前端能看 deletedCount 判斷部分成功
- 與 DESIGN-A「無 atomic rollback」字面一致(中途失敗已刪部分仍 soft-deleted、不還原)
- LOC ~25-30

對比 reject:
- **Option A** 全 success 才 200、否則 4xx:HTTP 4xx 與「部分已刪」語意矛盾、有誤導風險
- **Option C** 200 + `{success: [ids], failed: [ids]}`:stub over-engineering、DESIGN-A v1 stub 應最小實作
- **Option D** 200 + 空 envelope:前端不知刪了多少、需重查 user list

### Q4 — file 組織:10 條 alias 跨 user/role/menu 三個 entity、5 個新 handler 該集中還是拆?

**A:Option B — wrapper handler 加到對應 entity api 檔、route 集中新建 `sys_system_manage_route.rs`**。

理由:
- 5 個新 handler 邏輯與其 service 同檔聚集:`update_user_post` / `delete_user_by_body` / `batch_delete_users` 進 `sys_user_api.rs`;`get_all_roles` 進 `sys_role_api.rs`;`get_all_pages` 進 `sys_menu_api.rs`
- route 集中新建 `sys_system_manage_route.rs` — alias 是「虛擬路徑」、跟 user/role/menu route 平行存在、集中一檔一眼看完 10 條 mount
- F9 file 改動 ~12 file:7 改 + 2 新建(route + migration)+ 3 register/mod
- 未來 user CRUD 邏輯改 → 跳 1 個 file(`sys_user_api.rs`)即可,不需跨 systemManage 檔

對比 reject:
- **Option A** 全集中 `sys_system_manage_*_route + _api`:對齊 F11 sys_mock_* pattern、但 5 個 handler 邏輯與 user/role/menu service 拆開、後續維護要跳兩個檔
- **Option C** 全塞既有 entity route + 不集中:alias 邏輯散落三檔、grep 難看全貌

### Q5 — `getAllPages` stub 該回什麼 shape?

**A:Option C — 回 menu 表 name list 簡單 SQL**。

理由:
- 新 `SysMenuService::find_all_page_keys` = `SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL`(F3 soft delete 過濾隱含)
- 反映實際 sys_menu 既有 page key、`manage/menu` 綁頁面下拉能體驗 menu 綁定 demo
- 不是真 stub、是「最簡實作」— 等同把 Q1 對 `getAllPages` 從「stub」升級為「最簡 SQL 真實作」
- LOC ~15-20

對比 reject:
- **Option A** hardcoded 3-5 個 page key:結果可預期但不反映 sys_menu 實際資料、未來 menu 增加不變
- **Option B** 回空 array `[]`:demo 體驗破損、`manage/menu` 綁頁面下拉空
- **Option D** 回 501 NotImplemented:與 DESIGN-A「抽離項必須註冊」紀律矛盾

---

## Evidence collection 2026-05-20(grep + Read tool)

- 既有 rust router 結構(grep `pub async fn|.route\(`):
  - `sys_user_route.rs`:9 route(/users, /, /{id}, /add_policies, /remove_policies)
  - `sys_role_route.rs`:5 route(/, /, /{id}, /, /{id})
  - `sys_menu_route.rs`:11 route(`init_menu_router` + `init_protected_menu_router` 含 /tree, /, /{id}, /auth-route/{roleId}, /getUserRoutes, /isRouteExist)
- 既有 rust handler 名稱:
  - `SysUserApi`:`get_paginated_users` / `create_user` / `get_user` / `update_user` / `delete_user` / `add_policies` / `remove_policies` / `get_all_users`
  - `SysRoleApi`:`get_paginated_roles` / `create_role` / `get_role` / `update_role` / `delete_role`(5 handler、無 `get_all_*`)
  - `SysMenuApi`:`tree_menu` / `get_menu_list` / `get_constant_routes` / `create_menu` / `get_menu` / `update_menu` / `delete_menu` / `get_auth_routes` / `is_route_exist`(9 handler、無 `get_all_pages`)
- 既有 manage/* 範疇 Casbin policy seed(`m20241024_082926_insert_casbin_rule.rs`):**只 ROLE_SUPER allow `/user`/`/role`/`/route` GET/POST/PUT、無 ROLE_ADMIN**(rev1 baseline、F9 不動既有 m20241024、新加 alias path)
- F11 implement-time finding(`specs/020-extracted-stubs/research.md`):R-Q5 v4='' baseline + R-Q6 deny path envelope wrap(F9 沿用)
- F11 merge SHA `81ecb0d`(application Phase 4 收尾 + 抽離項清單 4/5 完成、F9 baseline 確認)

---

## Design 4 段落(Section 1-4 整合)

### Section 1:Endpoint & Handler 對應(10 條完整覆蓋)

- 5 個重用直接 mount(`/getRoleList` / `/getUserList` / `/addUser` / `/getMenuList/v2` / `/getMenuTree`)
- 3 個變形 wrapper(`/updateUser` POST 包 PUT / `/deleteUser` 抽 body id / `/batchDeleteUser` 抽 body ids)
- 2 個新做完整(`/getAllRoles` `SysRoleService::find_all_enabled` / `/getAllPages` `SysMenuService::find_all_page_keys` 簡 SQL)
- 1 個新做 stub(`/batchDeleteUser` per-row loop + counter)

### Section 2:Casbin policy seed + file 結構

- **Casbin migration** `m20260520_a_f9_system_manage_alias_seed.rs`(新建、INSERT 20 row、2 role × 10 endpoint、v4=''、~80 LOC)
- **File 結構 ~12 file ~330 LOC**:
  - 改 3 entity api(`sys_user_api.rs` +~55 / `sys_role_api.rs` +~25 / `sys_menu_api.rs` +~20)
  - 改 2 entity service(`sys_role_service.rs` +~20 / `sys_menu_service.rs` +~15)
  - 改 1 entity model input(`sys_user.rs` +~15 加 2 DTO)
  - 新建 1 router(`sys_system_manage_route.rs` ~80)
  - 改 2 register(`router/admin/mod.rs` +1 / `router_initialization.rs` +~8)
  - 新建 1 migration + 改 2 register(`mod.rs` +1 / `lib.rs` +2)

### Section 3:Acceptance C-V 結構(10 C-V scenarios)

- **C-V1** rust-api image rebuild OK
- **C-V2** Casbin migration 20 row 落 casbin_rule
- **C-V3** Soybean 5 個重用 mount(getRoleList / getUserList / getMenuList/v2 / getMenuTree / addUser)全 200
- **C-V4** Soybean 變形 wrapper 行為(updateUser / deleteUser / batchDeleteUser)
- **C-V5** Soybean 2 個新做完整(getAllRoles / getAllPages)
- **C-V6** GeneralUser deny(C-V6 代表 endpoint = getUserList、回 envelope `{code:5001, success:false}` per R-Q6)
- **C-V7** batchDeleteUser audit log 寫入驗(sys_operation_log per-row record)
- **C-V8** 三邊 scope verify(base-web 0 diff + nestjs 0 diff + rust-api ~12 file + docker-compose 0 diff)
- **C-V9** W-FA1 stack regression(6 service healthy + migration exited 0)
- **C-V10** 既有 `/user/*` `/role/*` `/route/*` 不退化(3 條既有 endpoint 仍通)

### Section 4:Commit 模式 + 依賴 + scope 邊界

- **兩段式 commit**(per CLAUDE.md §4.1、F11 同 pattern):rust-api worktree 1 commit + outer 1-2 commit + merge --no-ff + SHA fill follow-up;**無 docker-compose.yml 改**
- **Inbound 依賴**:F4 + F5.1 + F6 + F11(全已 merge)+ F11 R-Q5/R-Q6 implement-time finding + W-FA1 stack
- **Outbound 解鎖**:DESIGN-A §4.2 抽離項清單 **5/5 完成** + F7 + F13 + F14
- **Out of Scope**(13 條 ❌):B3 camelCase / base-web e2e / sys_menu seed / 新 role / batch tx / orphan cleanup / batch limit / rust unit test / input validation / 改 base-web / 改 nestjs / 改 nginx / 改 docker-compose
- **Risks**(5 risks 全已分析 + 緩解):R-1 update_user_post body shape 對齊 / R-2 batchDelete counter 準確性 / R-3 axum route `/v2` 路徑解析 / R-4 file 改動複雜度可能漏 mod re-export / R-5 既有 `/user/*` vs 新 alias Casbin policy 不對齊(不在 F9 範疇修)
- **Assumptions** 4 條:A-001 F11 已 merge / A-002 R-Q5+R-Q6 沿用 / A-003 image rebuild ~3-5 min warm / A-004 既有 Service 有 CRUD + soft delete + audit hook

---

## Ready for `/speckit-specify`

- ✅ 5 個 brainstorm Q 全拍板(getAllRoles/Pages 策略 / acceptance scope / batchDelete stub shape / file org / getAllPages SQL)
- ✅ Evidence collection 完整(grep 既有 router/api/service handler + F11 implement-time finding 沿用 + Casbin policy seed baseline 確認)
- ✅ 4 段 design 全 user approve(Endpoint & Handler / Casbin + file 結構 / Acceptance C-V / Commit + 依賴 + scope)
- ✅ Authoritative parents 全標(DESIGN-A §3.1+§4.2+§6.1 / DESIGN-B §4.2+§6 / RESEARCH §6.2 / Constitution v1.0.0 / 既有 rust handler / F11 baseline)
- ✅ Scope 邊界明確(13 條 ❌ 全標 + 5 個 risk 全緩解 + 4 個 assumption 全標)

下一步:**`/speckit-specify`** 跑 specs/021-systemManage-alias-router/ 生 spec.md(`021` 短名命名對齊外層 outer branch `021-systemManage-alias-router`、由 `before_specify` mandatory pre-hook 自動建)。
