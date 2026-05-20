# Research: F7.1 — fix-route-getuserroutes-wiring

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-20

F7.1 為 F7 manage-crud-alignment merge 後 CDP demo 過程 catch 出的 2 個 backend acceptance gap 修補 feature。Brainstorm 3 Q 已 saturated(per [`docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md`](../../docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md))、spec 0 個 [NEEDS CLARIFICATION] marker。Phase 0 紀錄為 implement-time pattern 確認,不解 spec 級 unknown。

---

## R-Q1: `init_protected_menu_router` wiring fix 該對齊哪個既有 pattern?

**Question**: F5.1 既有 `init_protected_menu_router()` 用 `merge_router!(... SysMenuService, true, true, None)` 單 service 注入,但其 mount 含 `/getUserRoutes`(handler = `SysAuthenticationApi::get_user_routes`、期 `Extension<Arc<SysAuthService>>`)→ HTTP 500。F7.1 該怎麼加第二個 service Extension?

**Evidence**(2026-05-20 grep + F7 CDP demo 過程):
- `server/initialize/src/router_initialization.rs` `merge_router!` macro 只支援單 service 注入(`Services::Single(Arc::new($service))`)或 `None`
- 既有 `init_authorization_router`(line ~199-205)已示範 multi-service manual layer pattern:
  ```rust
  let auth_router = SysAuthenticationRouter::init_authorization_router().await
      .layer(Extension(Arc::new(SysAuthService) as Arc<SysAuthService>))
      .layer(Extension(Arc::new(SysAuthorizationService) as Arc<SysAuthorizationService>));
  let auth_router = apply_layers(auth_router, Services::None(std::marker::PhantomData::<()>),
      true, true, None, casbin.clone(), audience).await;
  app = app.merge(auth_router);
  ```
- F9 R-③ implement-time finding 已記錄此 pattern(F9 alias 跨 3 service user+role+menu 用同手法)
- `SysAuthService` 為 unit struct(`pub struct SysAuthService;`、無 field)、`Arc::new(SysAuthService)` 直接構造

**Decision**: F7.1 US1 wiring fix **100% 對齊 `init_authorization_router` + F9 R-③ manual layer pattern**:
- `init_protected_menu_router().await` 後鏈式 `.layer(Extension(Arc::new(SysMenuService) as Arc<SysMenuService>))` + `.layer(Extension(Arc::new(SysAuthService) as Arc<SysAuthService>))`
- 接 `apply_layers(router, Services::None(...), true, true, None, casbin.clone(), audience).await`
- `app = app.merge(...)`

**Rationale**:
- `merge_router!` macro 限單 service、不可能在 macro 內加第二個 Extension;manual layer pattern 是 codebase 既有解法(F9 R-③ 已驗)
- 保留 `Arc<SysMenuService>`(`init_protected_menu_router` 其他 mount `/tree` `/` `/:id` 全用 `SysMenuApi::*` handler、期 SysMenuService)、加 `Arc<SysAuthService>`(`/getUserRoutes` handler 期)— 兩 layer 並存
- `need_casbin=true` + `need_auth=true` 不變(維持 F5.1 既有 Casbin enforce + JWT auth)

**Spec impact**: spec FR-001~FR-004 對齊;data-model E1 列具體改動 before/after。

**Alternatives considered**:
- **Option B**(把 `/getUserRoutes` mount 移出 SysMenuRouter 到 SysAuthenticationRouter::init_protected_router):涉及改 2 個 router file + RouteInfo register 搬移、scope ↑、且 `/route/getUserRoutes` 路徑前綴屬 `/route` nest(SysMenuRouter 的 base_path)、搬到 auth router 會破壞路徑 — rejected
- **Option C**(改 `merge_router!` macro 支援多 service):macro 改動影響全 codebase router init、scope 過大、F9 已選 manual layer 為標準解 — rejected

---

## R-Q2: `list_menu_for_systemmanage` paginated wrapper 該對齊哪個既有 pattern?

**Question**: F7 `list_menu_for_systemmanage` 回 `Res<Vec<SystemManageMenuOutput>>` 扁平 array、base-web `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>` 預期 paginated。F7.1 怎麼包?

**Evidence**(2026-05-20 grep + F7 既有 code):
- F7 既有 `sys_system_manage_api.rs` 已有 2 個 paginated handler:`list_roles_for_systemmanage` + `list_users_for_systemmanage`,pattern:
  ```rust
  let raw = service.find_paginated_xxx(params).await?;
  Ok(Res::new_data(PaginatedData {
      current: raw.current, size: raw.size, total: raw.total,
      records: raw.records.into_iter().map(Into::into).collect(),
  }))
  ```
- 差異:role/user 的 service method 本身回 `PaginatedData<T>`(有真實 current/size/total);menu 的 `get_menu_list()` 回 `Vec<MenuTree>` 扁平(無分頁)
- `PaginatedData<T>` struct(`server/core/src/web/page.rs`):`{ current: u64, size: u64, total: u64, records: Vec<T> }`
- base-web `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>` — view typed fetch 預期 `{current, size, total, records}` 4 key

**Decision**: F7.1 US2 `list_menu_for_systemmanage` 改 return `Res<PaginatedData<SystemManageMenuOutput>>`、用 **records.len() 填 current/size/total**(rust 端不分頁、一次回全集):
```rust
let raw = service.get_menu_list().await?;
let records: Vec<SystemManageMenuOutput> = raw.into_iter().map(Into::into).collect();
let total = records.len() as u64;
Ok(Res::new_data(PaginatedData { current: 1, size: total, total, records }))
```

**Rationale**:
- 對齊 F7 既有 `list_roles_for_systemmanage` / `list_users_for_systemmanage` paginated handler shape(同檔 3 個 paginated handler 一致)
- menu 的 `get_menu_list()` service 不分頁(回完整 tree-flattened list)、F7.1 不改 service、wrapper 端把全集當 1 頁包(`current=1`、`size=total`)
- base view `Api.SystemManage.MenuList` typed fetch 拿到 `{records}` 即可 render table、`total` 顯示「共 N 条」
- F7 既有 `SystemManageMenuOutput` row element 22 field shape 不變(F7.1 只改外層 envelope wrapper)

**Spec impact**: spec FR-005~FR-008 對齊;data-model E2 列 before/after;F7 既有 C-V3d acceptance(spec only)會 stale(`data[i]` → `data.records[i]`)— spec R-2 已記錄、INTEGRATION-CHECKLIST 歷史紀錄保留。

**Alternatives considered**:
- **Option B**(改 `SysMenuService::get_menu_list` 加真實分頁):service layer 改動、違 F7.1 收緊 scope、且 base view 不傳 page param(一次要全部)— rejected
- **Option C**(base-web 改 `Api.SystemManage.MenuList` 為扁平 array type):違 Constitution IV「base 不改」— rejected

---

## R-Q3: F11 R-Q5/R-Q6 + F7 R-Q4 CDP smoke setup 沿用紀律確認

**Question**: F11/F9/F7 implement-time finding 對 F7.1 是否完全沿用?CDP smoke setup 怎麼跑?

**Evidence**(F11 R-Q5/R-Q6 + F7 R-Q4 + F7 CDP demo 實作經驗):
- **R-Q5(F11)**:Casbin v4='' baseline — F7.1 不改 Casbin、N/A
- **R-Q6(F11)**:Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001}` — F7.1 US1.3 GeneralUser 預期 envelope code:0(F5.1 seed 對 `/route/getUserRoutes` 3-role allow、非 deny);若意外 5001 則為 seed 問題、acceptance 會 catch
- **R-Q4(F7)**:CDP smoke 沿用 WSL2 host Edge 148 + `--remote-debugging-port`;F7 CDP demo 階段實證 port `9229` 可用 + 需 node `ws` library driver + `Fetch.requestPaused` 攔 `/auth/getUserInfo` 注入 R_SUPER/R_ADMIN role alias(因 base-web example static routes filter 用 `R_SUPER`/`R_ADMIN`、rust 發 `ROLE_*`)

**Decision**: F7.1 acceptance **完全沿用** F7 CDP demo 階段已驗的 setup:
- CDP smoke 用 node script + `/tmp/node_modules/ws` driver(F7 demo 已 `npm install ws`)
- Login 繞 SPA UI:直接 `POST /api/auth/login` + inject `SOY_token` / `SOY_refreshToken` 到 localStorage
- **Role alias workaround**:`Fetch.requestPaused` 攔 `/auth/getUserInfo` 注入 `R_SUPER`/`R_ADMIN`(role code mismatch 屬 F7.2 範疇、F7.1 acceptance 階段用 workaround)
- Graceful degradation:若 CDP setup 異常 → 降級為純 curl + python/jq pagination shape 驗(US1 curl 驗 + US2 curl 驗 paginated envelope shape、不依賴 SPA render)

**Rationale**:
- F7 CDP demo 已實證整套 setup 可行(manage/user + manage/role + manage/menu 3 view 成功 render)
- role alias workaround 為 demo-only、不進 commit scope(per spec 範疇外 + R-3)
- graceful degradation 確保 acceptance 不被 CDP flakiness 阻斷(US1/US2 核心驗收為 curl 層、CDP smoke 為 UI 層加分驗)

**新 finding anticipated**:
- F7.1 改 wiring 後若 build fail(cargo `-D warnings`)→ check `SysAuthService` import 是否已在 `router_initialization.rs`(既有 `init_authorization_router` 已用、預期已 import)
- menu paginated wrapper 改後若 build fail → check `PaginatedData` import(F7 既有 2 個 paginated handler 已用、預期已 import)

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 `init_protected_menu_router` wiring fix 對齊 `init_authorization_router` + F9 R-③ manual layer pattern
- ✅ R-Q2 `list_menu_for_systemmanage` paginated wrapper 對齊 F7 既有 `list_roles/users_for_systemmanage` pattern、records.len 填 current/size/total
- ✅ R-Q3 F7.1 acceptance CDP smoke 沿用 F7 R-Q4 setup + role alias workaround + graceful degradation
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — F7.1 brainstorm 已 saturated、Phase 0 純 pattern 確認、無命名級或 scope 級修正。
