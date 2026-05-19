# F7 — manage-crud-alignment

**Date**: 2026-05-20
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-20(4 顯式拍板 Q + project context exploration via grep + F9/F11 baseline 沿用)

---

## Scope summary

rev1 **application Phase 3 第二個 feature**(F9 已落、F7 次之、F8 後續),DESIGN-A §6.1 + DESIGN-B §6 line 219「manage/* 4 module CRUD shape 對齊 + Casbin enforce + 軟刪 + audit + Menu CRUD」針對 **base example 分支 stub UI 現況**精化定義:

| 對齊面 | F7 deliverable |
|---|---|
| **base TS type shape 對齊** | rust 端 Output DTO + `#[serde(rename_all = "camelCase")]` + From impl、把 rust 既有 column(`name/code/description/username/phone_number/email/pid/sequence`)rename 為 base 預期(`roleName/roleCode/roleDesc/userName/userPhone/userEmail/parentId/order`);base 預期但 rust 無對應 column(`userGender/userRoles/menuButtons/fixedIndexInTab/menu children/query`)hardcode `None` / `vec![]` |
| **Admin path Casbin allow(解 A-006)** | 新 migration `m20260521_a_f7_admin_role_existing_paths_seed.rs` INSERT **15 row** 補 ROLE_ADMIN 對 `/user/*` `/role/*` `/route/*`(write)既有 path allow;不動 m20241024(per FR-014) |
| **Menu CRUD admin path** | 既有 rust `/route/` POST/PUT/DELETE handler 就位、F7 補 Casbin policy allow ROLE_ADMIN;curl 驗 soft delete + audit hook 整合(繼承 F2.1 + F3) |
| **base view 真實 render 驗** | CDP smoke test 驗 manage/user + manage/role + manage/menu 3 view load + table column 含 base TS type 預期欄位、不是 undefined / blank |

加 **1 個 Casbin policy seed migration**:INSERT **15 row** 補 ROLE_ADMIN 對既有 path、v4=''、v1='built-in'(per F11 R-Q5 baseline)。

範疇刻意收緊到「**5 條 read alias shape mapping + 15 row Casbin 補位 + base view 3 個 CDP smoke + 三邊零改動 + base-web src 0 diff**」、**不改 base src / 不補 base 缺的 CRUD fetch fn / 不補 operate-drawer submit handler / 不補 manage/domain view / 不加 sys_user.gender 等缺 column / 不做 userRoles g rule join / 不加 systemManage 寫 alias 的 shape mapping(F9 既有 mount 不動)/ 不加 rust unit test**。

**Commit 模式**(F7 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F11/F9/F10.2/F10.1/F6/F5.1):rust-api worktree 1 commit + outer 1-2 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**(對比 F10.1、W-FA1 既有 wire 已涵蓋)

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 3「F7 manage-crud-alignment」(完成標誌「base manage/* 4 view 跑通」精化定義為 3 view shape 對齊 + admin path Casbin 補)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.1「Menu CRUD admin 端管理」設計支柱(F7 補 ROLE_ADMIN 對 `/route/*` CRUD allow + curl 驗、不依賴 base view UI)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) §6 line 219(F7 在 DESIGN-B 完全繼承、identical)
- [`docs/INTEGRATION-RESEARCH.md`](../INTEGRATION-RESEARCH.md) §6.2 方案 B「rust 加 /systemManage/* alias router、重用既有 service」(F9 已落地、F7 在此基礎加 shape mapping)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle I「RBAC fail-safe」— F7 補 ROLE_ADMIN allow 是擴展 allow scope、ROLE_USER 仍 default deny
  - Principle IV「base 不改動邊界」— F7 嚴守 `src/views/` + `src/service/api/*.ts` + `src/typings/` 全 0 diff、所有 shape adaptation 集中 rust 端
  - Principle V「漸進收縮」— F7 整套在 DESIGN-B 階段繼承(identical)
- 既有 rust `SysRoleApi` / `SysUserApi` / `SysMenuApi`(F9 後 4+1+1 個 alias handler、F7 不改既有、新建 wrapper handler 在新 `SysSystemManageApi`)
- 既有 base-web TS type [`base-web/src/typings/api/system-manage.d.ts`](../../base-web/src/typings/api/system-manage.d.ts)(`Api.SystemManage.Role / User / Menu / MenuTree / AllRole` 為 F7 shape mapping 對齊 contract)
- 既有 F5.1 seed user(Soybean / Administrator / GeneralUser 3 user 共密碼 `123456`)
- 既有 m20241024 Casbin seed(只 ROLE_SUPER allow `/user/*` `/role/*` 11 row、F7 補 ROLE_ADMIN 對應)
- 既有 m20260515 F5.1 Casbin seed(對 ROLE_USER + ROLE_ADMIN + ROLE_SUPER allow `/auth/getUserInfo` + `/route/*` read path、F7 不重複加 `/route/*` read row)
- **F11 implement-time finding 沿用**:R-Q5(v4='' baseline)+ R-Q6(Casbin deny path 走 `casbin_envelope_adapter` HTTP 200 + envelope `{code:5001, success:false}`)
- F9 merge SHA `b2f910c`(application Phase 3 第一個 feature、DESIGN-A §4.2 抽離項清單 5/5 完成、F7 baseline)

---

## Clarifying Q(4 個 brainstorm 拍板)

### Q1 — F7 scope 邊界:Constitution IV 不動 base src 限制下,「manage/* 4 view 跑通」精化定義?

**A:Option A — read-only path + endpoint shape 對齊(推薦)**。

理由:
- F7 收緊到「rust 端對 base-web example 預期的 5 條 read endpoint 做 shape 對齊(camelCase / 欄位名 / 巢狀結構)+ Casbin/軟刪/audit 整合驗 + base-web 3 view paginated read 跑通(add/edit/delete button 維持 stub 行為、彈 $message.success)」
- Menu CRUD admin path 改用「rust 端 endpoint 就位 + 軟刪 + audit + Casbin allow ROLE_SUPER / Administrator」curl 驗、不依賴 base view UI
- scope ~8-10 file rust patch、無 base 改

對比:
- **Option B**(A + Menu CRUD admin path 完整)`/route/*` CRUD endpoint 已就位、F7 額外做的只剩「Casbin allow ROLE_ADMIN」、option A 已含、不單獨拆
- **Option C**(完整 manage CRUD path + 違 Principle IV)需要補 base-web 11+ 條 CRUD fetch fn + 改 4 個 operate-drawer/modal submit handler + useTableOperate hook delete logic + 加 manage/domain view + rust addRole/updateRole/deleteRole 等 11 條 alias — ~30-50 file 跨 base-web + rust,需 Constitution Check Complexity Tracking 紀錄合理化、且違 Rationale「base 升級時阻力最小」精神
- **Option D**(拆 F7.1/F7.2/F7.3 細分 feature)F7.1 = A、F7.2 = B(其實 = A 含)、F7.3 = C 可能 defer 到 DESIGN-B 階段或永不做、過度顆粒

### Q2 — shape mapping 對齊深度(base TS 有些欄位 rust schema 沒 column)

**A:Option A — 最小 mapping、只 rename rust 已有 column(推薦)**。

理由:
- F9 alias 加 Output DTO + `#[serde(rename)]` 把 rust 現有 column rename 為 base 預期:`name→roleName / code→roleCode / description→roleDesc / username→userName / phone_number→userPhone / email→userEmail / pid→parentId / sequence→order`
- rust 無對應 column(`userGender / userRoles / menuButtons / fixedIndexInTab / menu children / query`)hardcode `None` 或 `vec![]` 回傳(表示「查不到」、不是「不支援」)
- scope ~8-12 file rust patch(主要 model output + alias router)、不動 entity / schema / migration

對比:
- **Option B**(中等 mapping + 補 userRoles 真實 join)F7 加 service layer method 從 g rule 反查 user-role assignment — scope ↑ ~12-18 file、引入 join 查詢複雜度,base view 也只用 dropdown 展示、value 顯示不顯示差別不大
- **Option C**(全量 mapping + 加 sys_user.gender + sys_menu.buttons schema column)需 DB migration + entity 改 + service 改 + F5.1 seed 補欄位 — scope ↑ ~20-30 file,但 base example 也只 stub UI 沒實際 input gender / button,完整實作後 view 仍 stub
- **Option D**(不 mapping、只補 Menu CRUD + Casbin、紀錄 GAP)F7 變空 feature(F9 已含 Menu CRUD endpoint、Casbin 補留 follow-up)— 不解 base example view column 顯示空白 issue

### Q3 — F7 admin path 要不要補 ROLE_ADMIN(Administrator)對既有 /user/* /role/* /route/* path 的 Casbin allow row?

**A:Option A — 補、新 migration 加 ~18 row(實際精確化為 15 row、推薦)**。

理由:
- F7 新建 `m20260521_a_f7_admin_role_existing_paths_seed.rs` INSERT 15 row:
  - `/user/*` × ROLE_ADMIN × `{GET, POST, PUT, GET/:id, DELETE/:id, GET/users}` = 6 row
  - `/role/*` × ROLE_ADMIN × `{GET, POST, PUT, GET/:id, DELETE/:id}` = 5 row
  - `/route/*` × ROLE_ADMIN × `{POST, PUT, DELETE/:id, GET/:id}` = 4 row(read 已由 F5.1 m20260515 seed)
- 不動既有 m20241024(per FR-014)
- 解 DESIGN-A F7「admin path 跑通」含 ROLE_ADMIN(Administrator)預期、解 spec A-006 已知差異

對比:
- **Option B**(只補 Menu CRUD path /route/* × ROLE_ADMIN)F9 alias 已含 `/systemManage/*` × ROLE_ADMIN 10 row、Administrator 有 alias 路可走、既有 /user/* 仍只 ROLE_SUPER 仍是 A-006 差異,scope 收緊但 admin path 不完整
- **Option C**(不補、F7 只驗 ROLE_SUPER)A-006 差異留 follow-up feature(F7.2 或專以整合 admin path 的 feature)、F7 0 新 migration,但 DESIGN-A F7「admin path 跑通」不完整

### Q4 — F7 acceptance 是否包 base-web view-load CDP smoke test?

**A:Option A — curl + psql + CDP browser smoke test(推薦)**。

理由:
- C-V series + 1 條 CDP 驗證 manage/user + manage/role + manage/menu 3 view 打開、table column data render 正確(`userName / nickName / roleName / menuName` etc. 不是 undefined / blank)、不驗 add/edit/delete(仍 stub UI)
- F5.1 follow-up 已有 CDP 使用經驗、smoke test 可重用 setup
- acceptance ~10-11 C-V + 1 CDP test、跑約 20-30s(不含 image rebuild)、可信度高

對比:
- **Option B**(純 curl + psql、F9/F11 pattern)F7 acceptance 只走 curl JSON output 驗 column 名出現/type/值、不跑 CDP browser e2e — 簡單但 mapping 預期與 base view 與實際 render 的 gap 留 follow-up 驗
- **Option C**(curl + psql + screenshot diff)需手動或 CDP、內容 visual、不是 code-level assertion、預期不穩定(screenshot false-positive)

---

## Evidence collection 2026-05-20(grep + Read tool)

### base-web example 分支現況
- `base-web/src/service/api/system-manage.ts` 只 6 條 GET fetch fn(`fetchGetRoleList / fetchGetAllRoles / fetchGetUserList / fetchGetMenuList / fetchGetAllPages / fetchGetMenuTree`)、**無 CRUD fetch fn**(addUser/updateUser/deleteUser/batchDeleteUser)
- `base-web/src/views/manage/` 只 3 個 view + 1 個 user-detail(`user / role / menu / user-detail/[id]`)、**無 manage/domain view**
- operate-drawer / operate-modal `handleSubmit` 全是 **stub UI**(`// request` placeholder + `window.$message?.success`、無 fetch fn 呼叫)
- `useTableOperate` hook 提供 `handleAdd / handleEdit / onBatchDeleted / onDeleted` 但 **delete / submit 都只彈 success message**(stub)
- table column 真實 reference 的欄位 = base TS type 命名(`userName / nickName / roleName / menuName / parentId / order / userGender`),**不是 rust schema 真實 column**(`username / name / pid / sequence`)— shape mismatch 預期

### base-web TS type contract([base-web/src/typings/api/system-manage.d.ts](../../base-web/src/typings/api/system-manage.d.ts))
- `Api.SystemManage.Role`:`roleName / roleCode / roleDesc + status + 共通 CommonRecord field`
- `Api.SystemManage.AllRole = Pick<Role, 'id' | 'roleName' | 'roleCode'>`
- `Api.SystemManage.User`:`userName / userGender / nickName / userPhone / userEmail / userRoles[]`
- `Api.SystemManage.Menu`:`parentId / menuType ("1"|"2") / menuName / routeName / routePath / iconType ("1"|"2") / buttons / children / + MenuPropsOfRoute(i18nKey/keepAlive/constant/order/href/hideInMenu/activeMenu/multiTab/fixedIndexInTab/query)`
- `Api.SystemManage.MenuTree`:極簡 `{ id, label, pId, children }`(注意 `pId` 不是 `pid`、`label` 非 `menuName`)

### 既有 rust router CRUD mount
- `sys_user_route.rs`:`/user/` GET POST PUT、`/user/{id}` GET DELETE、`/user/users` GET、`/user/add_policies` GET、`/user/remove_policies` GET
- `sys_role_route.rs`:`/role/` GET POST PUT、`/role/{id}` GET DELETE
- `sys_menu_route.rs`:nest `/route`、含 `/tree` GET、`/` GET POST PUT、`/{id}` GET DELETE、`/auth-route/{roleId}` GET、`/getUserRoutes` GET、`/isRouteExist` GET

### 既有 Casbin seed coverage(psql casbin_rule)
- m20241024:**只** ROLE_SUPER allow `/user GET POST PUT` + `/user/:id GET DELETE` + `/user/users GET` + `/role GET POST PUT` + `/role/:id GET DELETE` 共 11 row、**無 ROLE_ADMIN**、**無 /route**
- m20260515(F5.1):3-role allow `/auth/getUserInfo` + `/route/tree` + `/route/getUserRoutes` + `/route/getConstantRoutes` + `/route/auth-route/{roleId}` 等 read path
- m20260519(F11):8 row,ROLE_SUPER + ROLE_ADMIN × `/auth/sendCaptcha` + `/auth/verifyCaptcha` + `/auth/error` + `/mock/getLastTime`
- m20260520(F9):20 row,ROLE_SUPER + ROLE_ADMIN × `/systemManage/*` 10 endpoint
- **A-006 已知差異**:Administrator 透過 `/api/systemManage/getUserList`(F9 alias)有路,但透過 `/api/user/`(既有原 path)無路 — F7 解

---

## Design 8 段落(Section 1-8 整合)

### Section 1:Overview & Goal

**F7 = manage/* base view shape 對齊 + admin path Casbin 補位 feature**。RESEARCH §6.2 方案 B 路線下 base 不改,所有 shape adaptation 集中在 rust 端;F9 補了 alias path、F7 補 alias response shape 對齊 base TS type + 補 ROLE_ADMIN 對既有 path 的 Casbin allow row 解 spec A-006 已知差異。

**完成標誌**(DESIGN-A F7「manage/* 4 view 跑通」針對 base example 分支 stub UI 現況精化定義):
1. base-web 3 個 manage view(user / role / menu)打開 — table column 顯示 paginated row data,實際 row 內含 `userName / userGender / nickName / userPhone / userEmail / roleName / roleCode / roleDesc / parentId / order / menuName / routeName / ...` 等 base TS type 欄位,**不是 undefined / blank**
2. CDP smoke test 驗 3 view load 成功 + 表頭 + 至少 1 row render
3. ROLE_SUPER + ROLE_ADMIN 在 `/api/user/* /api/role/* /api/route/*` 既有 CRUD path 全 allow,解 A-006
4. Menu CRUD 通過 curl 驗(`POST/PUT/DELETE /api/route/`),Casbin enforce 對 Administrator allow,軟刪 + audit 整合(繼承 F2.1 + F3 既有 service hook)
5. **不動 base-web src**(per Constitution Principle IV);F9 既有 10 alias mount + 4 寫 endpoint(addUser/updateUser/deleteUser/batchDeleteUser)行為不變;既有 m20241024 + m20260515 + m20260519 + m20260520 migration 不動
6. `manage/domain` view 不存在於 base example,F7 不補(範疇外、留 future feature 或永不做)

### Section 2:Architecture & File Structure

**Layered approach**(對齊既有 codebase 既有 service → api → router 三層 + model output 抽 DTO 慣例):

```
                                  HTTP request
                                        │
                                        ▼
            sys_system_manage_route.rs(F9 既有、F7 改 5 條 mount 換 handler)
                  /systemManage/getRoleList     → list_roles_for_systemmanage
                  /systemManage/getAllRoles     → list_all_roles_for_systemmanage
                  /systemManage/getUserList     → list_users_for_systemmanage
                  /systemManage/getMenuList/v2  → list_menu_for_systemmanage
                  /systemManage/getMenuTree     → tree_menu_for_systemmanage
                  (其他 5 條 write/read keep F9 既有 mount)
                                        ▼
            sys_system_manage_api.rs (F7 新建、F9 alias 集中 wrapper handler)
                  call 既有 service → map model → Output DTO → Res<...> envelope
                                        ▼
            既有 service layer(F9 已加、F7 不改)
                  .find_paginated_roles / .find_all_enabled / .find_paginated_users
                  .get_menu_list / .tree_menu
                                        ▼
            既有 entity model(F7 不改)
                  SysRoleModel / SysUserModel / SysMenuModel
                                        ▼
            output/system_manage.rs (F7 新建)
                  SystemManageRoleOutput       → roleName/roleCode/roleDesc
                  SystemManageAllRoleOutput    → pick {id, roleName, roleCode}
                  SystemManageUserOutput       → userName/userGender(null)/...
                  SystemManageMenuOutput       → parentId/menuName/buttons(null)/...
                  SystemManageMenuTreeNodeOutput → MenuTree { id, label, pId, children }
```

**新建 / 改動 file list**:

| File | 動作 | LOC | 說明 |
|---|---|---|---|
| `server/model/src/admin/output/system_manage.rs` | 新建 | ~120 | 5 個 Output DTO struct + `From<SysXxxModel>` impl |
| `server/model/src/admin/output/mod.rs` | 改 | +1 | `pub mod system_manage;` + re-export |
| `server/api/src/admin/sys_system_manage_api.rs` | 新建 | ~80 | 5 個 alias wrapper handler、call 既有 service、map output、wrap envelope |
| `server/api/src/admin/mod.rs` | 改 | +2 | mod + re-export `SysSystemManageApi` |
| `server/router/src/admin/sys_system_manage_route.rs` | 改 | ~10 改動 | 5 條 mount 換 handler、import 加 `SysSystemManageApi` |
| `migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs` | 新建 | ~60 | INSERT 15 row(ROLE_ADMIN × `/user/*` `/role/*` `/route/*` 既有 path) |
| `migration/src/datas/mod.rs` | 改 | +1 | `pub mod m20260521_...;` |
| `migration/src/lib.rs` | 改 | +2 | Migrator vec 加 |

**rust-api scope**:**8 file ~270 LOC + 0 base-web file**;**acceptance** 用 inline bash + verification-commands.md(per F9/F11 pattern、不新建 scripts/)。

### Section 3:Output DTO 細節 + missing field 策略

**SystemManageRoleOutput**(對齊 `Api.SystemManage.Role`):
- rename `name → role_name`(serde camelCase = `roleName`)、`code → role_code`、`description → role_desc`(unwrap_or_default null → "")
- 共 `id / roleName / roleCode / roleDesc / status / createdAt / createdBy / updatedAt / updatedBy`

**SystemManageAllRoleOutput**(對齊 `Api.SystemManage.AllRole = Pick<Role, 'id' | 'roleName' | 'roleCode'>`):
- 3 個 field:`id / roleName / roleCode`

**SystemManageUserOutput**(對齊 `Api.SystemManage.User`):
- rename `username → user_name` / `phone_number → user_phone` / `email → user_email`
- `nick_name`(rust 既有 snake_case = camelCase `nickName`、不需 rename 邏輯)
- `user_gender: Option<String>` hardcode None(rust schema 無 column)
- `user_roles: Vec<String>` hardcode `vec![]`(rust schema 無 column、不做 g rule join per Q2 A)

**SystemManageMenuOutput**(對齊 `Api.SystemManage.Menu`):
- rename `pid → parent_id` / `sequence → order`
- `menu_type` rust `"directory"` → `"1"` / `"menu"` → `"2"`(match 轉換)
- `icon_type` rust `"iconify"` → `"1"` / `"local"` → `"2"`(match 轉換)
- `buttons / children / fixed_index_in_tab / query` hardcode `None`(rust schema 無 column)
- map default `_` 加 `tracing::warn!`(F9 code review #2 建議延伸)

**SystemManageMenuTreeNodeOutput**(對齊 `Api.SystemManage.MenuTree = { id, label, pId, children }`):
- 極簡 4 field
- `id: i32 → id`、`menu_name → label`(rename + 用 `#[serde(rename = "label")]`)、`pid → p_id`(用 `#[serde(rename = "pId")]` 因 base TS type 是 pId 不是 pid)、`children` 遞迴展開
- **與 `SystemManageMenuOutput` 為兩個獨立 DTO**(`getMenuList/v2` 用完整、`getMenuTree` 用極簡)

### Section 4:Casbin migration 內容(m20260521_a_f7_admin_role_existing_paths_seed)

INSERT 15 row:

| # | v0 | v2 | v3 | 來源 endpoint |
|---|---|---|---|---|
| 1 | ROLE_ADMIN | /user/ | GET | sys_user_route.rs paginated |
| 2 | ROLE_ADMIN | /user/users | GET | sys_user_route.rs get_all_users |
| 3 | ROLE_ADMIN | /user/ | POST | sys_user_route.rs create_user |
| 4 | ROLE_ADMIN | /user/ | PUT | sys_user_route.rs update_user |
| 5 | ROLE_ADMIN | /user/:id | GET | sys_user_route.rs get_user |
| 6 | ROLE_ADMIN | /user/:id | DELETE | sys_user_route.rs delete_user |
| 7 | ROLE_ADMIN | /role/ | GET | sys_role_route.rs paginated_roles |
| 8 | ROLE_ADMIN | /role/ | POST | sys_role_route.rs create_role |
| 9 | ROLE_ADMIN | /role/ | PUT | sys_role_route.rs update_role |
| 10 | ROLE_ADMIN | /role/:id | GET | sys_role_route.rs get_role |
| 11 | ROLE_ADMIN | /role/:id | DELETE | sys_role_route.rs delete_role |
| 12 | ROLE_ADMIN | /route/ | POST | sys_menu_route.rs create_menu(Menu CRUD write) |
| 13 | ROLE_ADMIN | /route/ | PUT | sys_menu_route.rs update_menu |
| 14 | ROLE_ADMIN | /route/:id | DELETE | sys_menu_route.rs delete_menu |
| 15 | ROLE_ADMIN | /route/:id | GET | sys_menu_route.rs get_menu |

`v1='built-in'` / `v4=''` / `v5=''`(per F11 R-Q5 + F9 既有 baseline)、ROLE_USER 不加 row(default deny、per Q4 acceptance C-V7 驗)。

**down() DELETE** 用 scope-limited WHERE:`ptype='p' AND v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'`(排除 F9 m20260520 alias path)。

### Section 5:Acceptance(C-V series + CDP smoke test)

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust image rebuild OK | docker build exit 0、新 image SHA、warm ≤ 5 min |
| C-V2 | migration `m20260521_a_f7` 跑 + 15 row 落 casbin_rule | COUNT = 15、`v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'` |
| C-V3 | Soybean(ROLE_SUPER)5 條 read alias shape 對齊 | curl 5 endpoint + python jq 驗 response data 含 base TS type 預期 field name(`roleName/roleCode/roleDesc/userName/userPhone/userEmail/parentId/order/menuName/pId`)、缺 field hardcode null/[] |
| C-V4 | Administrator(ROLE_ADMIN)5 條 read alias 全 allow + shape 對齊 | curl 5 endpoint with Administrator token、envelope `{code:0, success:true, data:...}` 對齊 ROLE_SUPER |
| C-V5 | Administrator 既有 `/api/user/* /api/role/*` 5 條 path 對 ROLE_ADMIN 全 allow(解 A-006) | curl GET /api/user / POST /api/user / PUT /api/user / GET /api/role / POST /api/role 等、envelope `{code:0, success:true}` 對齊 ROLE_SUPER |
| C-V6 | Menu CRUD admin path:Administrator POST/PUT/DELETE `/api/route/` | curl POST/PUT/DELETE 路由、HTTP 200 + envelope code:0、軟刪驗 sys_menu.deleted_at NOT NULL + sys_operation_log audit row |
| C-V7 | GeneralUser(ROLE_USER)既有 path deny(regression) | curl `/api/user GET` with GeneralUser token、envelope `{code:5001, success:false}` per F11 R-Q6 |
| C-V8 | three-side scope verify | base-web/src/ 0 diff + nestjs fork 0 diff + docker-compose 0 diff + rust-api ~8 file scope |
| C-V9 | W-FA1 stack regression | docker compose ps 6 service healthy + rust-api 剛 recreated + migration exited 0 |
| C-V10 | CDP smoke test:base-web 3 view load + column render(3 sub-case) | CDP load `/manage/user` + `/manage/role` + `/manage/menu`、assert table column 含預期 column key + 至少 1 row data 內含預期 field 值(non-empty/non-undefined) |

**C-V10 CDP smoke test 細節**:
- C-V10a manage/user:assert column 含 `userName / userGender / nickName / userPhone / userEmail` 且 row.userName 非 empty
- C-V10b manage/role:assert column 含 `roleName / roleCode / roleDesc` 且 row.roleName 非 empty(預期 "超级管理员" / "管理员")
- C-V10c manage/menu:assert column 含 `menuName / routeName / routePath / parentId / order` 且 row.menuName 非 empty

**CDP test 形式**:沿用 F5.1 follow-up 既有 pattern(inline bash + CDP debugger command)、**不新建 e2e framework**;**inline 在 spec quickstart.md 故障排查段 + verification-commands.md C-V10**。

**預估跑時間**:~4-6 min 含 image rebuild(C-V1 ~3-5 min)、acceptance 本身 ~20-30s。

**完成標誌**:11/11 PASS(對齊 F9 10/10、F11 7/7 等比放大)。

### Section 6:Edge Cases、Risks、Constitution Check

**Edge cases**(10 個):E-1 paginated empty / E-2 all role disabled / E-3 menu tree nested / E-4 phone null / E-5 parentId String mismatch / E-6 menu_type dirty data / E-7 Admin 跑既有 path / E-8 GU 跑既有 path / E-9 CDP column 顯示 undefined / E-10 view 用了非 mapping column

**Risks**(7 個):R-1 F9 既有 read alias mount 換 handler break F9 / R-2 getMenuTree vs getMenuList shape 分歧 / R-3 menu_type 映射 default fallback / R-4 CDP smoke test 在 WSL2 flaky / R-5 parentId typing mismatch / R-6 m20260521 INSERT 與既有 row 衝突 / R-7 CDP SPA navigate 複雜

**Constitution Check**:
- Principle I RBAC fail-safe ✅(F7 補 ROLE_ADMIN allow row、ROLE_USER 仍 default deny)
- Principle II Soft Delete + Audit + Migration ✅(F7 不動 schema、繼承 F2.1/F3 既有 hook)
- Principle III 雙服務協作 ✅(F7 不動 nginx、無 forward)
- Principle IV base 不改動邊界 ✅(0 base-web src diff;CDP smoke 為 black-box 驗、不寫 base e2e test code)
- Principle V 漸進收縮 ✅(F7 在 DESIGN-B 階段繼承 identical)

**0 violation、0 partial、5 Principle PASS**。

**F11/F9 implement-time finding 沿用**:R-Q5(v4='' baseline)+ R-Q6(deny envelope wrap)+ F9 code review #2(tracing::warn! for unexpected default arm)。

### Section 7:Dependencies、Phase 位置、Outbound 解鎖

**Inbound**:F2.1 ✅ / F3 ✅ / F4 ✅ / F5.1 ✅ / F6 ✅ / F9 ✅ / F11 ✅ / W-FA1/W-FA2/W-FA3 ✅

**Outbound**:
- F8 assign-users(DESIGN-A 表寫 F8 依賴 F7;F7 admin path 落地後 base manage/* view 為 F8 提供 user × role 介面背景)
- F12 cleanup-job(與 F7 並行、F7 不阻 F12)
- F14 DESIGN-A→B cutover(F7 對 DESIGN-B 繼承 identical、不破壞 cutover 路徑)
- B3 camelCase GAP follow-up feature(F7 取代、不再有 GAP 留 follow-up)

**Phase**:application Phase 3 第二個 feature(F9 已落、F7 為第二個、F8 待)。

**並行候選**:F12 / W-F11 / W-F6b / F13(全不依賴 F7、可同時 spec-kit)。

### Section 8:Out of Scope、Assumptions、預估 scope size

**OOS**(17 條):不動 base-web src / 不補 11+ 條 base CRUD fetch fn / 不補 operate-drawer handleSubmit / 不補 manage/domain view / 不動 F9 既有 4 條寫 alias / 不動 nestjs fork / 不動 docker-compose / 不動 nginx / 不動既有 4 個 migration / 不加 sys_user.gender / 不加 userRoles join / 不加 rust unit test / 不驗 add/edit/delete button click / 不驗 form input rules / 不 benchmark / 不引入 e2e framework / 不解 parentId String vs number typing

**Assumptions**(9 條):F9 已 merge / F11+F9 R-Q5/R-Q6 finding 沿用 / 既有 service 不動 / 既有 schema 不改 / m20260515 既有 read row 已 cover / CDP 在 WSL2 stable / base manage/* SPA route 已配置 / userRoles hardcode `[]` 在 view typing 不 crash / menu children null 不破 view render

**預估 scope**(對齊 spec NFR-002):
- rust-api file:**8 file**(2 新建 + 6 改)
- rust-api LOC delta:**~270 LOC**
- outer file:**3 file**(CLAUDE.md SPECKIT marker by hook + INTEGRATION-CHECKLIST + rust-api gitlink)
- spec-kit task:**~22 task**
- acceptance C-V:**11**(C-V1~V10 + C-V10 三 sub-case)
- brainstorm Q:**4** Q(saturated)
- 預估 implement 時間:**~60-90 min**(rust build ~5 min + 8 file patch ~30-45 min + 11 acceptance ~20-30 min)

**比較 reference feature**:

| Feature | file | LOC | task | acceptance |
|---|---|---|---|---|
| F11 | 13 | ~118 | ~24 | 7 C-V |
| F9 | 13 | ~305 | ~29 | 10 C-V |
| **F7** | **8** | **~270** | **~22** | **11 C-V** |

---

## Ready for `/speckit-specify`

Brainstorm 4 Q 拍板、design 8 section confirmed、project context grep 完整、F9/F11 baseline 沿用紀錄完備、scope size 對齊 NFR-002 上限內、constitution check 0 violation。

**下一步**:invoke `superpowers:writing-plans` skill 寫 implementation plan(或 fork-rev1 spec-kit 既有流程:`/speckit-specify` → `/speckit-clarify`(0 question expected、brainstorm saturated)→ `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`)。

**Feature branch name**:`022-manage-crud-alignment`(對齊既有 `NNN-<short>` 命名、由 spec-kit `before_specify` pre-hook 自動建)。
