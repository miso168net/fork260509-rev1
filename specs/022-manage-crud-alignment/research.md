# Research: F7 — manage-crud-alignment

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-20

F7 為 RESEARCH §6.2 方案 B 「rust 加 /systemManage/* alias router」shape 對齊延伸實作(F9 alias 路徑 + F7 shape mapping = 完整對齊 base TS type contract)。Phase 0 主要目的 = 用 grep + Read 既有 file 解開 6 個 implement-time 不確定點 + 確認 F7 對既有 codebase 對齊策略 + 從 F9/F11 R-Q5/R-Q6 baseline 沿用紀律。

**Brainstorm 4 Q 已 saturated**(per [`docs/superpowers/022-feature-manage-crud-alignment.md`](../../docs/superpowers/022-feature-manage-crud-alignment.md))、**0 NEEDS CLARIFICATION marker**(per `/speckit-clarify` 0 question)。Phase 0 紀錄為 implement-time pattern 確認,不解 spec 級 unknown。

---

## R-Q1: F7 Output DTO 該集中新檔 vs 對齊既有 output/ module 慣例?

**Question**: brainstorm Approach A 拍板「Output DTO 集中於 `output/system_manage.rs`」。但 plan 階段檢查既有 codebase,既有 `output/` module 已存在含 5 個 entity-scoped file。F7 該對齊既有慣例還是 establishing 新 cross-entity scope?

**Evidence**(2026-05-20 grep + Read):
- `rust-api/server/model/src/admin/output/` 已存在含:
  - `sys_authentication.rs`(AuthOutput / UserInfoOutput / UserRoute)
  - `sys_domain.rs`(DomainOutput)
  - `sys_endpoint.rs`(EndpointTree)
  - `sys_menu.rs`(MenuRoute / MenuTree / RouteMeta、含 `children: Option<Vec<MenuTree>>` 遞迴)
  - `sys_user.rs`(UserWithDomainAndOrgOutput / UserWithoutPassword)
  - `mod.rs`(`pub use sys_xxx::{...};` re-export)
- 既有 file 命名:`sys_<entity>.rs` 前綴
- 既有 file 為 single-entity-scoped(menu 單個檔 / user 單個檔 / etc.)
- 既有 `MenuTree`(`output/sys_menu.rs:43`)已含 nested `children: Option<Vec<MenuTree>>` 遞迴 + camelCase serde、但**欄位 ≠ base TS type 預期**(`pid` 而非 `parentId`、`sequence` 而非 `order`、`menu_type` 序列化為 `"menu"`/`"directory"` 而非 `"1"`/`"2"`、無 `buttons`/`fixedIndexInTab`/`query`)— 即既有 MenuTree 不對齊 F7 用、需另立 DTO

**Decision**: **F7 加 `output/sys_system_manage.rs` 為新 file、對齊既有 `sys_<scope>.rs` 命名慣例**;5 個 DTO 集中於此一檔(per brainstorm Approach A);與既有 `sys_menu.rs::MenuTree` **並存**(既有 MenuTree 為 `/api/menu/tree` 使用,F7 `SystemManageMenuTreeNodeOutput` 為 `/api/systemManage/getMenuTree` 使用、shape 不同)。

**Rationale**:
- F7 跨 entity scope(user + role + menu)、若分散到 3 entity file 看 mapping rules 要看 3 個 file、readability 低、boundary 模糊
- 既有 file 命名為 `sys_*` prefix、F7 改 spec 寫的 `system_manage.rs` 為 `sys_system_manage.rs` 對齊既有命名(per `sys_system_manage_route.rs` + `sys_system_manage_api.rs` 慣例)
- 與既有 `MenuTree` 並存:F7 `SystemManageMenuTreeNodeOutput` 不取代既有、是 alias-specific shape;與既有 `UserWithoutPassword` 並存:F7 `SystemManageUserOutput` 不取代、是 alias-specific shape
- 未來 manage/* 相關 alias output 擴展(若有)可加同 `sys_system_manage.rs` module

**Spec impact**: spec.md FR-001 / data-model E1-E5 / plan.md Project Structure 都需把 `output/system_manage.rs` 對齊改為 `output/sys_system_manage.rs`(命名級修正、scope 不變)。

**Alternatives considered**:
- **Option B**(分散):5 DTO 分散到 3 entity file:`output/sys_role.rs`(新建、含 SystemManageRoleOutput + SystemManageAllRoleOutput)+ 加到 `output/sys_user.rs`(SystemManageUserOutput)+ 加到 `output/sys_menu.rs`(SystemManageMenuOutput + SystemManageMenuTreeNodeOutput)— 對齊 single-entity-per-file 既有慣例,但 F7 跨 entity 邏輯散落、不集中 — rejected 為 brainstorm Approach A 拒絕的 Option B
- **Option C**(`system_manage.rs` 命名):brainstorm spec 寫的命名,不對齊既有 `sys_*` prefix — refined to `sys_system_manage.rs`

---

## R-Q2: 既有 `SysMenuModel` 的 `menu_type` / `icon_type` column type + 序列化行為?

**Question**: F7 spec FR-005 寫 `menu_type` rust `"menu"`/`"directory"` → base `"1"`/`"2"` mapping;但需 verify rust 端 `menu_type` column type 與序列化值。

**Evidence**(2026-05-20 grep `rust-api/server/model/src/admin/entities/sys_menu.rs:14-16`):
```rust
pub menu_type: MenuType,
pub icon_type: Option<i32>,
```
- `menu_type: MenuType` — enum type(非 String);需 check `MenuType` 定義的 string_value
- `icon_type: Option<i32>` — **integer** 不是 string!base TS type 寫 `"1"` / `"2"`、與 rust int 不對齊

從 F9 C-V3c acceptance 結果觀察 rust 實際 response:
```json
{"id":2, "pid":"0", "menuType":"menu", "iconType":1, ...}
```
- `menuType: "menu"` — string(MenuType enum 序列化為 "menu" / "directory")
- `iconType: 1` — int(rust 直接 serialize i32、非 string)

base TS type:
- `Api.SystemManage.Menu.menuType: MenuType = "1" | "2"`(union of string literals)
- `Api.SystemManage.Menu.iconType: IconType = "1" | "2"`(union of string literals)

**GAP**:
- menu_type rust `"menu"`/`"directory"` ↔ base `"1"`/`"2"`
- icon_type rust int `1`/`2`(或 Option<i32>)↔ base string `"1"`/`"2"`

**Decision**: F7 `SystemManageMenuOutput` 對 `menu_type / icon_type` 兩個欄位做 **rust → string 映射**:

```rust
// menu_type mapping
match m.menu_type {
    MenuType::Menu => "2",
    MenuType::Directory => "1",
    // 其他 enum variant(若有)→ default "2" + tracing::warn!
}

// icon_type mapping
match m.icon_type {
    Some(1) => Some("1".to_string()),
    Some(2) => Some("2".to_string()),
    None => None,
    Some(_) => default "1" + tracing::warn!,
}
```

**Rationale**:
- F7 spec 已 anticipate menu_type 映射(per FR-005、E-6 + tracing::warn!)
- icon_type 額外發現 type-level mismatch(int vs string),F7 一併處理(rust int → base string)
- 用 match 而非 Display impl 為了 future-proof(若 enum 加新 variant 編譯期會 warn)

**Spec impact**: spec.md FR-005 + data-model E4 需補 `icon_type: Option<i32> → Option<String>` 映射說明(原 spec 只提 `menu_type` mapping、未提 icon_type type 差);**implementation 階段一併處理**。

**Alternatives considered**:
- **Option B**(用 `#[serde(serialize_with = ...)]` custom serializer):增加複雜度、不對齊既有 From impl 慣例 — rejected
- **Option C**(改既有 `MenuType` enum 加 `Display` impl 回 `"1"`/`"2"`):會影響 既有 `/api/menu/tree` 使用、違 FR-010「不動既有 handler」精神 — rejected

---

## R-Q3: 既有 `SysRoleModel.description` / `SysUserModel.phone_number` / `email` nullability + F7 DTO 對應策略?

**Question**: F7 spec FR-002 寫 `roleDesc` 從 `description (Option<String>) unwrap_or_default null→""`;FR-004 寫 `userPhone` / `userEmail` 從 `Option<String>`。確認 rust schema 既有 column nullability。

**Evidence**(2026-05-20 grep):
- `rust-api/server/model/src/admin/entities/sys_role.rs:19`:`pub description: Option<String>,`
- `rust-api/server/model/src/admin/entities/sys_user.rs:24`:`pub email: Option<String>,`
- `rust-api/server/model/src/admin/entities/sys_user.rs:26`:`pub phone_number: Option<String>,`
- `gender` column: **不存在於 sys_user.rs**(per F7 brainstorm Q2 + spec OOS-010 hardcode None per F7 Output DTO)

**Decision**: F7 Output DTO 對 nullable field 採取**保留 Option** 策略:
- `roleDesc: String`(unwrap_or_default → `null` → `""`、per F7 spec FR-002:`Common.CommonRecord<{roleDesc: string}>` base TS type 是非 nullable string、F7 用 empty 對齊)
- `userPhone: Option<String>`(保留 Option、F7 spec 已寫 Option per FR-004、base TS type `userPhone: string` 接 null 可能 typing 警告但不 crash per Q2 + E-4)
- `userEmail: Option<String>`(同上)
- `userGender: Option<String>` hardcode `None`(rust 無 column)
- `userRoles: Vec<String>` hardcode `vec![]`(rust 無 column、不做 g rule join per Q2)

**Rationale**:
- `roleDesc` 對齊 base TS type 非 nullable string、用 empty string 為 default
- `userPhone` / `userEmail` 保留 Option 反映 rust schema 實情、base TS type 接 null 在 view 顯示「-」是 view-side adaptation(per Q2 接受)
- 為什麼 `roleDesc` 用 unwrap_or_default 但 `userPhone` 用 Option 保留:`roleDesc` base type 非 nullable string,F7 用 empty 補齊;`userPhone` base type 也是 string,但 F7 保留 None 因為 view 邏輯通常處理 `null === "?"`、empty 與 null 在 view 邏輯不同;**這是 implement-time choice、不在 spec 強制範圍**。

**Spec impact**: spec.md FR-002 寫的 `unwrap_or_default null→""` 對 roleDesc 適用、其他 nullable field 保留 Option;data-model E1-E4 各 field 標 nullability 對齊。

**Alternatives considered**:
- **Option B**(全 unwrap_or_default 為 empty string):view 邏輯難以區分 「未填」與 「空字串」、rejected
- **Option C**(全保留 Option):roleDesc base type 非 nullable、view 可能 typing 警告、accept partial mismatch — F7 折衷選擇

---

## R-Q4: CDP smoke test 在 WSL2 環境的既有 setup + F7 sub-case navigate 方式?

**Question**: F7 spec FR-023 + US1.3-5 + C-V10 寫 CDP browser smoke test;需 verify F5.1 follow-up 既有 setup、確認 F7 sub-case navigate 方式。

**Evidence**(2026-05-20 grep):
- F5.1 spec(`specs/005-auth-login-and-dynamic-menu/`)未找到「CDP setup」具體文件
- 但 INTEGRATION-CHECKLIST F5.1 row 已記 follow-up:「CDP Edge 148 控制瀏覽器端到端登入流程 PASS(login → getUserInfo → /home + menuCount=43 dashboard 渲染完整)」
- WSL2 上能用 host Edge 148 browser + remote-debugging-port(F5.1 follow-up 已實作、F7 沿用)

**Decision**: F7 沿用 F5.1 follow-up 的 CDP browser setup pattern:
- WSL2 上控制 host Edge 148 browser 透過 remote-debugging-port(通常 `127.0.0.1:9222`)
- Navigate flow:
  - C-V10 prelude:Edge browser launched、navigate to `http://127.0.0.1:11080`
  - SPA login via DOM(對齊 F5.1 follow-up 已驗 `fetchLogin(userName, password)` 對齊)
  - Wait for /home dashboard render
  - C-V10a:navigate to `/manage/user`、wait table render、DOM query `table tbody tr:first-child` 拿 row data
  - C-V10b:navigate to `/manage/role`、DOM query first row
  - C-V10c:navigate to `/manage/menu`、DOM query first row
- assertion via `row.<column-key>` DOM extraction
- failure fallback:若 navigate flaky、改用 `/manage/user` 直接 URL(SPA route history pushState、不依賴 menu 點選)

**Rationale**:
- F5.1 follow-up CDP setup 已驗工作、F7 不引入新 framework(對齊 OOS-016「不引入 e2e test framework」)
- DOM query 為 black-box 驗、不寫 base e2e test code(對齊 Principle IV + FR-015 + Rationale)
- C-V10 fail 處理:若 column undefined → mapping 漏 implement-time finding;若 navigate failure → 改用 URL 直連 SPA route

**Spec impact**: spec.md FR-023 + C-V10 既有寫 inline bash + CDP、Phase 1 quickstart.md / contracts/verification-commands.md 將 expand 具體 CDP command。

**Alternatives considered**:
- **Option B**(playwright / cypress 新引入):增加依賴、違 OOS-016 — rejected
- **Option C**(只 curl + headless screenshot):無 column-level assertion、不能 catch shape mapping 缺失 — rejected
- **Option D**(WSL2 內裝 chrome headless):增加 WSL setup 複雜度 — rejected,host browser 透過 remote-debugging-port 更穩定

---

## R-Q5: F9 既有 m20260520 Casbin migration 的 SQL pattern + F7 m20260521 對齊?

**Question**: F7 spec FR-011 寫新建 `m20260521_a_f7_admin_role_existing_paths_seed.rs`、要對齊 F9 m20260520 既有 pattern;確認 SQL pattern。

**Evidence**(2026-05-20 read `migration/src/datas/m20260520_a_f9_system_manage_alias_seed.rs`):
- `use sea_orm_migration::{prelude::*, sea_orm::Statement};`
- `#[derive(DeriveMigrationName)]` + `pub struct Migration;`
- `#[async_trait::async_trait]` + `impl MigrationTrait for Migration`
- `up()` 用 `Statement::from_string` + `manager.get_database_backend()` + `r#"INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES ..."#`
- 20 row 一個 INSERT statement(批次)
- `down()` 用 `DELETE FROM casbin_rule WHERE ptype='p' AND v1='built-in' AND v2 LIKE '/systemManage/%' AND v0 IN (...)`、scope-limited

**Decision**: F7 m20260521 **100% 對齊 F9 m20260520 pattern**:
- 同 imports
- 同 `Migration` struct + `MigrationTrait` impl
- `up()` INSERT 15 row 一個 batch statement(2 行一個 row、可讀性高)
- `down()` DELETE scope-limited per F7 FR-013

**Rationale**:
- 對齊既有 F11/F9 pattern 為 codebase 慣例(F6 `m20260518` / F11 `m20260519` / F9 `m20260520` 都是同 pattern)
- INSERT 多 row 一批為 atomic、failed 全 rollback
- down() scope-limited 避免誤刪其他 migration 的 row

**Spec impact**: spec.md FR-011 + FR-012 + FR-013 對齊;data-model E7 / contracts/verification-commands.md C-V2 將列具體 row 與 SQL 細目。

**Alternatives considered**:
- **Option B**(用 sea-orm `InsertMany`)增加 ActiveModel 複雜度、與 F11/F9 pattern 不對齊 — rejected
- **Option C**(分 3 個 INSERT、按 path 分組):增加 5 LOC、無實質好處 — rejected

---

## R-Q6: `MenuTree` 既有 entity 結構 + F7 `SystemManageMenuTreeNodeOutput` 映射?

**Question**: F7 spec FR-006 寫 `SystemManageMenuTreeNodeOutput` 極簡 4 field;確認既有 `MenuTree`(F9 getMenuTree 用)與 F7 對齊 base `Api.SystemManage.MenuTree` 的映射。

**Evidence**(2026-05-20 grep `rust-api/server/model/src/admin/output/sys_menu.rs:43-82`):
- 既有 `MenuTree` struct 完整定義(20+ field、含 id / pid / menu_type / menu_name / icon_type / icon / route_name / route_path / component / path_param / status / active_menu / hide_in_menu / sequence / i18n_key / keep_alive / constant / href / multi_tab / created_at / created_by / updated_at / updated_by / children)
- 已含 `children: Option<Vec<MenuTree>>` 遞迴
- 已 `#[derive(Debug, Serialize, Clone)]` + `#[serde(rename_all = "camelCase")]`
- F9 getMenuTree handler `SysMenuApi::tree_menu` 回 `Res<Vec<MenuTree>>`、序列化為完整 menu 物件 array(非極簡 4 field)

base TS type `Api.SystemManage.MenuTree = {id, label, pId, children}` 期望:
- `id: number`(rust i32 對齊)
- `label: string`(rust `menu_name` 對齊)
- `pId: number`(注意 base 用 `pId` 不是 `pid`、camelCase 規則特殊;rust `pid: String`、F7 用 `#[serde(rename = "pId")]` + 保留 String、per FR-027 typing mismatch defer)
- `children: MenuTree[]`(遞迴)

**Decision**: F7 新建獨立 `SystemManageMenuTreeNodeOutput` struct **4 個 field**(對齊 base 極簡 shape)、與既有 `MenuTree`(F9 既有 use)**並存**:

```rust
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageMenuTreeNodeOutput {
    pub id: i32,
    #[serde(rename = "label")]
    pub label: String,                  // 從 MenuTree.menu_name 映射
    #[serde(rename = "pId")]
    pub p_id: String,                   // 從 MenuTree.pid 映射、用 #[serde(rename = "pId")] 因 base 用 pId(注意大寫 I)、camelCase 不對齊
    pub children: Option<Vec<SystemManageMenuTreeNodeOutput>>,
}

impl From<MenuTree> for SystemManageMenuTreeNodeOutput {
    fn from(m: MenuTree) -> Self {
        Self {
            id: m.id,
            label: m.menu_name,
            p_id: m.pid,
            children: m.children.map(|children|
                children.into_iter().map(Into::into).collect()
            ),
        }
    }
}
```

**Rationale**:
- 極簡 4 field 避免「拿完整 menu 物件變成 alias tree node」資訊外洩
- 遞迴 From impl 對齊既有 `MenuTree.children: Option<Vec<MenuTree>>` 結構
- `pId` rename(注意大寫 I)由 `#[serde(rename = "pId")]` 對齊 base TS type
- 既有 `MenuTree` 維持給 `/api/menu/tree`(F6 menu admin path)使用、F7 不污染

**Spec impact**: spec.md FR-006 + data-model E5 對齊;contracts/verification-commands.md C-V3e / US1.5 assertion 對齊 `{id, label, pId, children}` 4 field。

**Alternatives considered**:
- **Option B**(直接 mount 既有 `tree_menu` handler、不 wrap):F7 spec 已 reject(因 base TS type 預期極簡 shape,完整 menu shape 不對齊);F7 為 alias-specific output、必新做 — rejected
- **Option C**(改既有 `MenuTree` struct 加 `#[serde(skip)]` field):會影響 既有 `/api/menu/tree` 行為、違 FR-010 — rejected

---

## R-Q7: F11 R-Q5 / R-Q6 + F9 R-Q1 implement-time finding 沿用紀律確認

**Question**: F11 / F9 implement-time finding 對 F7 是否完全沿用?是否有新 finding 需 anticipate?

**Evidence**(F11 `specs/020-extracted-stubs/research.md` R-Q5 + R-Q6、F9 `specs/021-systemmanage-alias-router/research.md` R-Q1):
- **R-Q5(F11)**:Casbin model `p = sub, dom, obj, act` 4-field、v4='' 為 implicit allow;F11 acceptance 階段 v4='allow' 顯式衝突 implicit eft handling
- **R-Q6(F11)**:rust-api `casbin_envelope_adapter` middleware 把 axum-casbin raw 403 wrap 成 F4 envelope `{code:5001, success:false}` HTTP 200、application-level deny
- **R-Q1(F9)**:既有 handler method-agnostic、F9 alias mount 重用 — F7 不依賴此(F7 為新 wrapper handler、不 mount 既有)

**Decision**: F7 **完全沿用** F11 R-Q5 + R-Q6 baseline:
- F7 m20260521 migration INSERT 15 row 全用 `v4=''`(per F11 R-Q5)
- F7 acceptance US3.3 GeneralUser deny 預期 HTTP 200 + envelope `{code:5001, success:false}`(per F11 R-Q6、非 raw HTTP 403)

F7 R-Q1(本文件、`output/sys_system_manage.rs` 命名修正)為 F9 R-Q1 之後第 4 個 implement-time spec drift refinement(F11 R-Q5/R-Q6 + F9 R-Q1 + F7 R-Q1)、modal pattern「acceptance 階段 catch + spec inline 修」延續。

**Spec impact**: spec.md A-002 已含 F11 R-Q5+R-Q6 沿用、A-006 已含 m20241024 + F9 m20260520 baseline;F7 R-Q1 spec correction 為命名級(`system_manage.rs` → `sys_system_manage.rs`)、不影響 architecture / scope。

**新 finding anticipated**:F7 acceptance 階段可能 surface 的新 finding 候選:
- `menu_type / icon_type` mapping default fallback(per R-Q2):若 rust seed data 含 unexpected value、tracing::warn! 觸發為 implement-time observation、不阻 F7 PASS
- `pId` camelCase 特殊 rename(per R-Q6):若 base view 嚴格期 number type → R-5 R-Q5 接受、留 typing follow-up
- CDP smoke test flaky:若 navigate 不穩 → 沿用 F5.1 follow-up `waitForSelector` / direct URL navigate(per R-Q4 + A-013)

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 既有 output/ module 已存在含 5 個 entity-scoped file、F7 加 `output/sys_system_manage.rs`(命名修正、對齊 sys_* prefix)為延伸既有 module — **spec correction**(plan.md + spec.md 命名級修正)
- ✅ R-Q2 既有 `SysMenuModel.menu_type` 為 `MenuType` enum 序列化 `"menu"`/`"directory"`、`icon_type` 為 `Option<i32>` 序列化為 int;F7 兩個欄位都做 mapping(menu_type → `"1"`/`"2"`、icon_type → `Option<String>`)
- ✅ R-Q3 既有 sys_role.description / sys_user.phone_number / email 為 `Option<String>`、F7 roleDesc unwrap_or_default、其他保留 Option
- ✅ R-Q4 CDP smoke test 沿用 F5.1 follow-up Edge 148 + remote-debugging-port setup、F7 3 個 sub-case navigate 用 menu 點選或 URL 直連(SPA route)
- ✅ R-Q5 F7 m20260521 100% 對齊 F9 m20260520 pattern(`Statement::from_string` + 批次 INSERT + scope-limited DELETE)
- ✅ R-Q6 既有 MenuTree 含 20+ field 完整、F7 新建獨立 `SystemManageMenuTreeNodeOutput` 4 field 與既有並存、pId 用 `#[serde(rename = "pId")]` 對齊 base 特殊命名
- ✅ R-Q7 F11 R-Q5/R-Q6 全沿用、F9 R-Q1 不直接依賴、F7 R-Q1 為 implement-time spec drift 第 4 個延續
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**Net spec correction**(從 R-Q1):
- F7 output DTO file 從 `output/system_manage.rs` 改為 `output/sys_system_manage.rs`(命名級對齊 sys_* prefix 慣例)
- 整體 file count 與 LOC 不變(仍 ~8 file ~270 LOC)
- spec.md FR-001 + Key Entities + plan.md Project Structure 將在 implement 階段對齊
