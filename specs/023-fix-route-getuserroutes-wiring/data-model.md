# Data Model: F7.1 — fix-route-getuserroutes-wiring

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F7.1 **不動 DB schema、不增 row、不動 entity model、不動 migration**。code 改動主體:**2 個 in-place fix** — E1 `init_protected_menu_router` wiring 改 manual layer pattern + E2 `list_menu_for_systemmanage` paginated wrapper。無新建 file、無 module register。

---

## E1: `init_protected_menu_router` wiring fix(US1 P1)

**File**: `rust-api/server/initialize/src/router_initialization.rs`(F7/F5.1 既有檔、F7.1 改 ~15 LOC)

**問題**:F5.1 既有 `merge_router!(SysMenuRouter::init_protected_menu_router().await, SysMenuService, true, true, None)` 只注入 `Arc<SysMenuService>` 一個 Extension。但 `init_protected_menu_router` 內 mount 的 `/getUserRoutes` route 用 `SysAuthenticationApi::get_user_routes` handler、該 handler signature 期 `Extension<Arc<SysAuthService>>` + `Extension<User>` → request 進來找不到 `Arc<SysAuthService>` extension → axum 回 HTTP 500 `Missing request extension: alloc::sync::Arc<server_service::admin::sys_auth_service::SysAuthService>`。

**Before**(F5.1 既有):
```rust
merge_router!(
    SysMenuRouter::init_protected_menu_router().await,
    SysMenuService,
    true,
    true,
    None
);
```

**After**(F7.1、對齊 F9 R-③ + `init_authorization_router` manual layer pattern):
```rust
// F5.1 wiring fix(per INTEGRATION-CHECKLIST §1 ⚠️ disclaimer):
// init_protected_menu_router mount 含 /getUserRoutes(handler =
// SysAuthenticationApi::get_user_routes、期 Extension<Arc<SysAuthService>>)。
// 原 merge_router! 只注入 SysMenuService 致 HTTP 500「Missing request extension」。
// 改 F9 R-③ 多 service manual layer pattern(對齊 init_authorization_router)。
let protected_menu_router = SysMenuRouter::init_protected_menu_router()
    .await
    .layer(Extension(Arc::new(SysMenuService) as Arc<SysMenuService>))
    .layer(Extension(Arc::new(SysAuthService) as Arc<SysAuthService>));
let protected_menu_router = apply_layers(
    protected_menu_router,
    Services::None(std::marker::PhantomData::<()>),
    true,
    true,
    None,
    casbin.clone(),
    audience,
)
.await;
app = app.merge(protected_menu_router);
```

**改動要點**:
| 項目 | Before | After |
|---|---|---|
| Extension 注入 | 單 `SysMenuService`(經 `merge_router!` macro `Services::Single`) | 雙 layer:`Arc<SysMenuService>` + `Arc<SysAuthService>`(manual `.layer()`) |
| `apply_layers` services 參數 | `Services::Single(Arc::new(SysMenuService))`(macro 內) | `Services::None`(service 已由 manual layer 注入) |
| Casbin enforce / JWT auth | `need_casbin=true` / `need_auth=true` | 不變(同 true / true、per FR-003) |
| `casbin` / `audience` 參數 | macro 自動帶入 | manual 顯式帶入 `casbin.clone()` + `audience` |

**LOC delta**:~15 LOC(7 行 macro → 19 行 manual block)

**Import 確認**(per research R-Q3):`SysAuthService` 已在 `router_initialization.rs` import(既有 `init_authorization_router` 已用 `Arc::new(SysAuthService) as Arc<SysAuthService>`)、`Extension` / `Arc` / `apply_layers` / `Services` 均既有 — **預期無新 import**。

---

## E2: `list_menu_for_systemmanage` paginated wrapper fix(US2 P2)

**File**: `rust-api/server/api/src/admin/sys_system_manage_api.rs`(F7 既有檔、F7.1 改 ~10 LOC)

**問題**:F7 `list_menu_for_systemmanage` 回 `Res<Vec<SystemManageMenuOutput>>` 扁平 array。base-web `fetchGetMenuList()` typed 為 `request<Api.SystemManage.MenuList>`、`Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>`(paginated `{current, size, total, records}`)。shape mismatch → base manage/menu view DataTable 拿不到 `records` → 顯示「无数据 / 共 0 条」。

**Before**(F7 既有):
```rust
/// F7 alias: GET /systemManage/getMenuList/v2
pub async fn list_menu_for_systemmanage(
    Extension(service): Extension<Arc<SysMenuService>>,
) -> Result<Res<Vec<SystemManageMenuOutput>>, AppError> {
    let raw = service.get_menu_list().await?;
    Ok(Res::new_data(raw.into_iter().map(Into::into).collect()))
}
```

**After**(F7.1、對齊 F7 既有 `list_roles_for_systemmanage` / `list_users_for_systemmanage` paginated pattern):
```rust
/// F7 alias: GET /systemManage/getMenuList/v2
pub async fn list_menu_for_systemmanage(
    Extension(service): Extension<Arc<SysMenuService>>,
) -> Result<Res<PaginatedData<SystemManageMenuOutput>>, AppError> {
    // F7 follow-up: base-web `Api.SystemManage.MenuList = PaginatingQueryRecord<Menu>`
    // 預期 paginated 包裝。F7 原 wrapper 回扁平 array、base view 顯示「无数据」。
    // 改為 paginated envelope:size=total=records.len()(rust 端不分頁、一次回全)。
    let raw = service.get_menu_list().await?;
    let records: Vec<SystemManageMenuOutput> = raw.into_iter().map(Into::into).collect();
    let total = records.len() as u64;
    Ok(Res::new_data(PaginatedData {
        current: 1,
        size: total,
        total,
        records,
    }))
}
```

**改動要點**:
| 項目 | Before | After |
|---|---|---|
| return type | `Res<Vec<SystemManageMenuOutput>>` | `Res<PaginatedData<SystemManageMenuOutput>>` |
| envelope `data` shape | 扁平 `[...]` array | paginated `{current:1, size:N, total:N, records:[...]}` |
| `records[i]` element | `SystemManageMenuOutput` 22 field | 不變(F7.1 只改外層 wrapper、row element shape 完全沿用 F7 既有) |
| `current` / `size` / `total` | n/a | `current=1`、`size=total=records.len()`(rust 不分頁、全集當 1 頁) |

**LOC delta**:~10 LOC(2 行 body → 9 行 body + return type 改 + 3 行 comment)

**Import 確認**(per research R-Q3):`PaginatedData` 已在 `sys_system_manage_api.rs` import(F7 既有 `list_roles_for_systemmanage` + `list_users_for_systemmanage` 2 個 paginated handler 已用)— **預期無新 import**。

**不動範圍**(per FR-007 + FR-008):
- F7 既有 `list_roles_for_systemmanage` / `list_all_roles_for_systemmanage` / `list_users_for_systemmanage` / `tree_menu_for_systemmanage` 4 handler 不動
- F7 既有 `SystemManageMenuOutput` Output DTO struct(`output/sys_system_manage.rs`)不動 — F7.1 只改 wrapper handler、不改 row element

---

## E3: 既有 `PaginatedData<T>` envelope shape(F7.1 沿用、不改)

**File**: `rust-api/server/core/src/web/page.rs`(既有、F7.1 不動)

```rust
#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedData<T> {
    pub current: u64,
    pub size: u64,
    pub total: u64,
    pub records: Vec<T>,
}
```

**F7.1 `getMenuList/v2` response data 具體 shape**(改後):
```json
{
  "current": 1,
  "size": 9,
  "total": 9,
  "records": [
    {
      "id": 2,
      "parentId": "0",
      "menuType": "2",
      "menuName": "403",
      "routeName": "403",
      "routePath": "/403",
      "component": "layout.blank$view.403",
      "icon": "",
      "iconType": "1",
      "buttons": null,
      "children": null,
      "status": "enabled",
      "hideInMenu": true,
      "order": 0,
      "i18nKey": "route.403",
      "keepAlive": false,
      "constant": true,
      "href": "",
      "activeMenu": "",
      "multiTab": false,
      "fixedIndexInTab": null,
      "query": null
    }
  ]
}
```

對齊 base-web `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Api.SystemManage.Menu>`;`records[i]` 為 F7 既有 `SystemManageMenuOutput` 22 field(F7.1 不改)。

---

## E4: 既有 `/route/getUserRoutes` response shape(F7.1 修復後可正常回應、shape 由 F5.1 既有 handler 決定、F7.1 不改)

**Handler**: `SysAuthenticationApi::get_user_routes`(F5.1 既有、F7.1 不改 handler 本身、只修 router 層 Extension 注入)

**修復後 response data 具體 shape**(per F7.1 acceptance 階段實測):
```json
{
  "home": "home",
  "routes": [
    { "name": "home", "path": "/home", "children": [] },
    { "name": "log", "path": "/log", "children": [
        { "name": "log_login" }, { "name": "log_operation" } ] },
    { "name": "access-key", "path": "/access-key", "children": [] },
    { "name": "manage", "path": "/manage", "children": [
        { "name": "manage_user" }, { "name": "manage_role" },
        { "name": "manage_menu" }, { "name": "manage_user-detail" } ] }
  ]
}
```

> 註:`routes` array 內各 route 物件完整 field 由 F5.1 既有 `UserRoute` output DTO 決定(F7.1 不改、不列舉);F7.1 acceptance 只驗 top-level routes count = 4 + manage 含 4 children name。

**修復前**(F5.1 wiring bug):HTTP 500、body `Missing request extension: alloc::sync::Arc<server_service::admin::sys_auth_service::SysAuthService>`(非 envelope)。

---

## Data Model 完成標誌

- ✅ E1 `init_protected_menu_router` wiring fix — manual layer pattern + `Arc<SysAuthService>` Extension(per FR-001~FR-004)
- ✅ E2 `list_menu_for_systemmanage` paginated wrapper — `Res<PaginatedData<SystemManageMenuOutput>>`(per FR-005~FR-008)
- ✅ E3 既有 `PaginatedData<T>` envelope F7.1 沿用、不改 struct
- ✅ E4 `/route/getUserRoutes` 修復後 response shape(F5.1 既有 handler 決定、F7.1 不改)
- ✅ 無 schema 改、無 migration、無 Casbin row、無 base-web 改、無 module register 改
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E4 確認 — 無 DB 寫入(Principle II N/A)、無 Casbin 放寬(Principle I PASS)、無服務間 forward(Principle III PASS)、base-web 0 diff(Principle IV PASS)、DESIGN-B 繼承 identical(Principle V PASS)。**3 PASS / 1 N/A / 0 violation 維持**。
