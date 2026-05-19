# Research: F9 — systemManage-alias-router

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-20

F9 為 RESEARCH §6.2 方案 B「rust 加 /systemManage/* alias router」直譯實作 + DESIGN-A §4.2 抽離項 batchDeleteUser 收尾。Phase 0 主要目的 = 用 grep evidence + Read 既有 file 解開 6 個 implement-time 不確定點、確認 F9 對既有 handler/service signature 的 reuse 策略 + 從 F11 R-Q5/R-Q6 baseline 沿用紀律。

---

## R-Q1: 既有 `update_user` handler signature 是否已 generic、F9 `update_user_post` 需新做嗎?

**Question**: spec.md FR-002 + Key Entity 寫「F9 加 `SysUserApi::update_user_post` 變形 wrapper handler(POST + body extract → call SysUserService::update_user)」。但既有 `update_user` handler 已從 body parse `UpdateUserInput`、若 axum 同 handler 可 mount 在不同 method/path、F9 不需新做 fn — 需確認。

**Evidence**(2026-05-20 grep + Read):
- `rust-api/server/api/src/admin/sys_user_api.rs:84-91`:
  ```rust
  pub async fn update_user(
      Extension(service): Extension<Arc<SysUserService>>,
      Extension(user): Extension<User>,
      ValidatedForm(input): ValidatedForm<UpdateUserInput>,
  ) -> Result<Res<UserWithoutPassword>, AppError> {
      let actor = Actor::from(&user);
      service.update_user(input, &actor).await.map(Res::new_data)
  }
  ```
- 既有 router(`sys_user_route.rs:61`)用 `.route("/", put(SysUserApi::update_user))` mount 在 PUT method
- `update_user` handler 不依賴 HTTP method、用 `ValidatedForm` 從 body parse — axum 同 handler 可 mount 在 POST method 上、payload 解析行為一致

**Decision**: **F9 不需新做 `update_user_post` handler、F9 alias 直接 mount 既有 `SysUserApi::update_user` 在 `POST /systemManage/updateUser` 路徑**:
```rust
.route("/updateUser", post(SysUserApi::update_user))
```

**Rationale**:
- axum handler method-agnostic — 同 fn 可 mount 在 PUT / POST / 任何 HTTP method 上、payload 解析行為由 extractor 決定(`ValidatedForm` 從 body parse、不依賴 method)
- F9 spec FR-002 + Key Entity 寫「變形 wrapper handler」為 over-spec — 既有 handler 已 generic、不需 wrapper
- 省 ~15 LOC + 1 個 fn 名命名負擔

**Spec impact**: data-model.md E1 / FR-002 / Section 1 表 需修正為「直接 mount 既有 handler」、不是「變形 wrapper」。**Spec 範疇影響**:scope 從 12 file 仍 12 file(handler 數量改變但 entity api 改動數量不變、因 sys_user_api.rs 仍需改加 2 個 fn:`delete_user_by_body` + `batch_delete_users`)、LOC 從 ~55 LOC 降到 ~40 LOC(省 update_user_post 約 15 LOC)。

**Alternatives considered**:
- **Option B**: 寫新 fn `update_user_post` reinvoke 既有 `update_user` — over-engineered、無收益
- **Option C**: 改既有 `update_user` 加 attribute — 動既有 handler、違反 spec FR-014「不動既有」精神

---

## R-Q2: 既有 `SysRoleService` 是否有 `find_all_enabled` 或類似 method?

**Question**: F9 FR-005 寫「新做 `SysRoleService::find_all_enabled`(SELECT * FROM sys_role WHERE status = Enabled AND deleted_at IS NULL)」。先確認既有 service 是否已有此 method 避免重複實作。

**Evidence**(2026-05-20 grep):
- `rust-api/server/service/src/admin/sys_role_service.rs:27`:既有 `TRoleService` trait 含:
  ```rust
  async fn find_paginated_roles(...) -> Result<...>;
  async fn get_role(&self, id: &str) -> Result<SysRoleModel, AppError>;
  ```
- **無 `find_all_enabled` 或 `list_all_roles` 等 method**

**Decision**: F9 真需新做 `SysRoleService::find_all_enabled` method,加進 `sys_role_service.rs` 既有 trait + impl block 內。

**Rationale**:
- 既有只有 paginated 與 by-id 版、無「列全部 enabled role」behavior
- `getAllRoles` 對 base-web `manage/user` 角色下拉直接價值、屬「最簡實作」非 stub(per Q1 拍板)
- SQL filter:`status = Enabled AND deleted_at IS NULL`(per FR-005 + Principle II SELECT 預設過濾 deleted_at IS NULL)

**Implementation shape**(預計 data-model.md E4 展開):
```rust
async fn find_all_enabled(&self) -> Result<Vec<SysRoleModel>, AppError> {
    SysRoleModel::find()
        .filter(sys_role::Column::Status.eq(Status::Enabled))
        .filter(sys_role::Column::DeletedAt.is_null())
        .all(db)
        .await
        .map_err(AppError::from)
}
```

**Alternatives considered**:
- **Option B**: 重用 `find_paginated_roles` 加 status filter — payload shape 不同(paginated wrap vs 純 array)、不符 base-web 預期
- **Option C**: 直接在 handler 寫 SQL — 違反 service layer 抽象、跨 entity 不一致

---

## R-Q3: 既有 `SysMenuService` 是否有「找全部 page key」相似 method?

**Question**: F9 FR-006 寫「新做 `SysMenuService::find_all_page_keys`(SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL)」。確認既有 service 是否已有此 method。

**Evidence**(2026-05-20 grep):
- `rust-api/server/service/src/admin/sys_menu_service.rs:31-49`:既有 `TMenuService` trait 含:
  ```rust
  async fn tree_menu(&self) -> Result<Vec<MenuTree>, AppError>;
  async fn get_menu_list(&self) -> Result<Vec<MenuTree>, AppError>;
  async fn get_constant_routes(&self) -> Result<Vec<MenuRoute>, AppError>;
  async fn get_menu(&self, id: i32) -> Result<SysMenuModel, AppError>;
  async fn get_menu_ids_by_role_id(...);
  ```
- **無「列全部 page key / name」method**
- 注意:既有 `get_menu(id: i32)` — menu id 型別為 **i32 非 String**(sys_menu PK 為 integer)

**Decision**: F9 真需新做 `SysMenuService::find_all_page_keys` method,加進 `sys_menu_service.rs` 既有 trait + impl block 內。

**Rationale**:
- 既有只 tree/list 整 menu 物件 + by-id;無「只列 name field」optimized SELECT
- `getAllPages` 對 base-web `manage/menu` 綁頁面下拉直接價值(per Q1 拍板「最簡實作」)
- SQL filter:`SELECT DISTINCT name FROM sys_menu WHERE deleted_at IS NULL`(per FR-006 + Principle II)

**Implementation shape**(預計 data-model.md E5 展開):
```rust
async fn find_all_page_keys(&self) -> Result<Vec<String>, AppError> {
    SysMenuModel::find()
        .select_only()
        .column(sys_menu::Column::Name)
        .distinct()
        .filter(sys_menu::Column::DeletedAt.is_null())
        .into_tuple::<(String,)>()
        .all(db)
        .await
        .map(|rows| rows.into_iter().map(|(name,)| name).collect())
        .map_err(AppError::from)
}
```

**Alternatives considered**:
- **Option B**: 重用 `tree_menu` 後 in-memory filter `name` field — 拉整 menu 物件浪費 + DISTINCT 邏輯放 app layer 不對齊 service responsibility
- **Option C**: 用 raw SQL — 與 sea-orm 抽象不一致

---

## R-Q4: 既有 `delete_user` handler 從 URL path 抽 id、F9 需 body 抽 id — 真需新做 `delete_user_by_body`?

**Question**: spec FR-003 寫「F9 加 `delete_user_by_body`(body 抽 `{id}` → call `SysUserService::delete_user`)」。確認既有 handler 是否已 generic、F9 是否真需新 fn。

**Evidence**(2026-05-20 Read):
- `rust-api/server/api/src/admin/sys_user_api.rs:93-100`:
  ```rust
  pub async fn delete_user(
      Path(id): Path<String>,
      Extension(service): Extension<Arc<SysUserService>>,
      Extension(user): Extension<User>,
  ) -> Result<Res<()>, AppError> {
      let actor = Actor::from(&user);
      service.delete_user(&id, &actor).await.map(Res::new_data)
  }
  ```
- 用 `Path(id): Path<String>` extractor — 從 URL path 抽 id
- F9 alias `DELETE /systemManage/deleteUser` 需從 **body** `{id: ...}` 抽 id — 與既有 Path extractor 不相容
- 既有 service `delete_user(id: &str, actor: &Actor)` — 第 1 個參數是 `&str`、可由任何來源 `String` borrow

**Decision**: F9 **真需新做** `SysUserApi::delete_user_by_body` handler(在 `sys_user_api.rs` 加 fn、body 抽 `{id}` → call `service.delete_user(&input.id, &actor)`),配新 DTO `DeleteUserByBodyInput { id: String }`。

**Rationale**:
- axum extractor 種類決定 payload 來源(`Path` vs `Json` vs `ValidatedForm`)、不可在同 handler 切換
- 既有 service method 可 reuse(`delete_user(id: &str, actor)`)、不需新 service method
- 「變形 wrapper」narrow scope = handler-level method-source 切換、service 重用

**Implementation shape**(預計 data-model.md E1 + E7 展開):
```rust
pub async fn delete_user_by_body(
    Extension(service): Extension<Arc<SysUserService>>,
    Extension(user): Extension<User>,
    Json(input): Json<DeleteUserByBodyInput>,
) -> Result<Res<()>, AppError> {
    let actor = Actor::from(&user);
    service.delete_user(&input.id, &actor).await.map(Res::new_data)
}
```

**DTO**(預計 data-model.md E7):
```rust
#[derive(Debug, Deserialize)]
pub struct DeleteUserByBodyInput {
    pub id: String,
}
```

**Alternatives considered**:
- **Option B**: 改既有 `delete_user` 為 generic(同時支援 Path / body)— 違反 spec FR-014「不動既有」、且 axum 不支援「同 handler 多 extractor 來源」
- **Option C**: nginx rewrite body → URL path param — DESIGN-A §3.1 拍板「方案 B 後端 alias router」、不在 nginx 層處理

---

## R-Q5: axum route `.route("/getMenuList/v2", get(...))` 字面解析確認?

**Question**: F9 spec R-3 + E-8 提到「路徑含 `/v2` 與 axum route 解析衝突」風險。確認 axum 字面解 `/v2` 為 static path 不誤判 path param。

**Evidence**(axum 0.8 文件 + 既有 codebase 慣例):
- axum route path 用 `{param}` 語法表示 path param(如 `/{id}`、`/auth-route/{roleId}`、`/menu-button/{menuId}`)
- 不含 `{...}` 的 path segment 全為 static literal,如 `/users`、`/getUserRoutes`、`/tree`、`/isRouteExist`
- 既有 codebase 已有多 segment static path 範例:
  - `sys_menu_route.rs:79`:`.route("/getUserRoutes", get(...))` — 多 segment static、無 issue
  - `sys_menu_route.rs:78`:`.route("/auth-route/{roleId}", ...)` — mixed static + param、`/auth-route` 為 static
- F9 `.route("/getMenuList/v2", get(SysMenuApi::get_menu_list))` — 整路徑 static、axum 字面解析、不誤判 path param

**Decision**: F9 用 `.route("/getMenuList/v2", get(SysMenuApi::get_menu_list))` 直接 mount,無 route conflict 風險。

**Rationale**:
- axum 文件明確區分 `{param}` 與 static literal — 無 `{...}` 即靜態
- 既有 codebase 多 segment static path 已驗工作
- F9 implement 階段 cargo build 編譯期會檢測 route conflict(if any)、acceptance C-V3 直接 curl 為運行期驗證

**Verification**(implement 階段):
- cargo build 對 `SysSystemManageRouter::init_router()` 不報 route conflict warning
- acceptance C-V3 `curl GET /api/systemManage/getMenuList/v2` 回 HTTP 200 + tree shape

**Alternatives considered**:
- **Option B**: 改路徑為 `/getMenuListV2`(camelCase 去 slash)— 違反 base-web 預期路徑 `/systemManage/getMenuList/v2`、需改 base-web src(違反 Principle IV)
- **Option C**: 用 nginx rewrite 把 `/v2` 路徑變 query string — 在 nginx 層處理、違反 DESIGN-A §3.1「方案 B」精神

---

## R-Q6: 既有 m20241024 Casbin policy 對既有 `/user/` `/role/` `/route/` 範圍 — F9 動既有 row 嗎?

**Question**: F9 spec A-006 + R-5 提到「既有 m20241024 Casbin policy 只 ROLE_SUPER allow `/user`/`/role`/`/route`、無 ROLE_ADMIN」。F9 修既有 row 還是只新增 `/systemManage/*` row?

**Evidence**(2026-05-20 grep `m20241024_082926_insert_casbin_rule.rs`):
- 既有 m20241024 對 `/user`、`/role`、`/route` 三 path 範圍只 INSERT `ROLE_SUPER` allow row(GET / POST / PUT 等 method)
- 無 ROLE_ADMIN allow row 對這三 path

**Decision**: F9 **不動既有 m20241024**(per FR-014「不動既有 migration」+ Constitution Principle IV「base 不改動邊界」)、F9 只新增 m20260520 對 `/systemManage/*` 路徑的 20 row(SUPER + ADMIN allow)。

**Rationale**:
- spec FR-014 + Constitution Principle IV「base 不改動邊界」紀律 = F9 範疇外不修
- 既有 m20241024 ROLE_ADMIN 對 `/user/`/`/role/`/`/route/` deny 為 spec consistency 差異(A-006 已記為已知)、留 follow-up feature 統一解
- F9 only 新增 alias path row、保持「漸進收縮」紀律(per Constitution Principle V)

**Spec impact**: 已 by A-006 + R-5 紀錄、Constitution Check 已過 Principle IV 濾鏡(B3 camelCase + 既有 Casbin 不對齊 都屬「已知差異留 follow-up」、不阻 F9 PASS)。

**Alternatives considered**:
- **Option B**: F9 同時改既有 m20241024 加 ROLE_ADMIN allow row — 違反 FR-014 + Principle IV「不動既有 migration」紀律
- **Option C**: F9 加新 migration 補 m20241024 對 ROLE_ADMIN 的 row — scope 超 F9 範疇、應屬 follow-up feature 統一解 manage/* Casbin

---

## R-Q7: F11 R-Q5(v4='' baseline)+ R-Q6(deny path envelope wrap)沿用紀律

**Question**: F11 implement-time finding 對 F9 是否完全沿用?是否有新 finding 需 anticipate?

**Evidence**(F11 `specs/020-extracted-stubs/research.md` R-Q5 + R-Q6):
- **R-Q5**(v4=''):Casbin model `p = sub, dom, obj, act` 4-field、v4 留空字串為 implicit allow;F11 acceptance C-V3 5/5 HTTP 502 root cause = v4='allow' 顯式衝突 implicit eft handling
- **R-Q6**(deny path):rust-api `casbin_envelope_adapter` middleware 把 axum-casbin raw 403 wrap 成 F4 envelope `{code:5001, success:false}` HTTP 200、application-level deny

**Decision**: F9 **完全沿用** F11 R-Q5 + R-Q6 baseline:
- F9 m20260520 migration INSERT 20 row 全用 `v4=''`(per F11 R-Q5)
- F9 acceptance C-V6 GeneralUser deny 預期 HTTP 200 + envelope `{code:5001, success:false}`(per F11 R-Q6、非 raw HTTP 403)

**Rationale**:
- F11 已實測驗過 v4='' 與 envelope wrap 行為、F9 沿用避免重複踩坑
- F9 acceptance C-V2 (20 row count) + C-V6 (deny envelope) 與 F11 C-V2 + C-V4 結構一致

**新 finding anticipated**:F9 acceptance 階段可能 surface 的新 finding 候選(若有、會在 implement 階段補入 research.md):
- `batchDeleteUser` per-row counter 行為對齊既有 service Err 反應方式(predict 在 R-Q4 Implementation shape 內 `match`、Ok increment / Err continue)
- `getAllRoles` / `getAllPages` response shape 對齊 base-web 預期(predict 不對齊但 F9 不解、B3 camelCase 留 follow-up)
- axum `.route("/getMenuList/v2", ...)` cargo build 編譯期確認(predict 通過、static path 字面解析)

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 既有 `update_user` handler 已 generic on method、F9 直接 mount 不需新做 `update_user_post` — **spec correction**:data-model.md / FR-002 / Section 1 表修正為「直接 mount」、不是「變形 wrapper」、handler 數從 5 個新增變 4 個(delete_user_by_body + batch_delete_users + get_all_roles + get_all_pages)
- ✅ R-Q2 `SysRoleService::find_all_enabled` 真需新做 — service 加 1 method ~20 LOC
- ✅ R-Q3 `SysMenuService::find_all_page_keys` 真需新做 — service 加 1 method ~15 LOC、menu id 型別 i32 為旁注
- ✅ R-Q4 `SysUserApi::delete_user_by_body` 真需新做(body 抽 id)、`batch_delete_users` 也真需新做(loop + counter)
- ✅ R-Q5 axum route `/v2` static path 字面解析、無 conflict 風險
- ✅ R-Q6 F9 不動既有 m20241024 Casbin policy、只新增 m20260520 對 `/systemManage/*` 路徑 20 row
- ✅ R-Q7 F11 R-Q5(v4='')+ R-Q6(deny envelope wrap)沿用紀律確認、F9 預期 inherit baseline
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**Net spec correction**(從 R-Q1):
- F9 sys_user_api.rs 新增 handler 數 = **2 個**(delete_user_by_body + batch_delete_users)、原 spec 寫 3 個(over-spec'd update_user_post)
- F9 LOC 從 ~330 LOC 降到 ~315 LOC(省 update_user_post ~15 LOC)
- F9 file 改動仍 12 file(handler 數量變但 entity api 改動數量不變)
- Spec.md FR-002 + Key Entities + Section 1 表 需在 implement 階段對齊(改「變形 wrapper」為「重用 + alias mount」)
