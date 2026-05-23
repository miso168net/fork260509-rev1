# Phase 0 Research — 040 wire-id-consistency

spec.md Assumptions（A-001~A-006）+ brainstorm Open Questions Q-P1~Q-P5 對應 5 個 plan-phase research question，本檔逐一查證解決。

## R-Q1 — Sea-ORM Model 內部 wire 直送點檢查（spec A-003 / brainstorm Q-P4）

- **Decision**: rust handler **0 處直接 `Json(Model)` 序列化**；所有 raw endpoint 走 `Res<T>` envelope 模式（如 `Res<SysRoleModel>` → `Res::new_data(model)`）。Theme D wire DTO wrap 等於改 `Res::new_data(model)` → `Res::new_data(RoleDetail::from(model))`，**0 影響** internal serialize 路徑（audit_log 用 `serde_json::Value` 構造、不走 Model 直序）。
- **實查**: `grep "Json(.*::Model)" rust-api/server/api/src/` → 0 命中；`grep "Res<.*Model>" rust-api/server/api/src/admin/sys_role_api.rs` → 6 handler 全用 `Res<SysRoleModel>` / `Res<PaginatedData<SysRoleModel>>` / `Res<Vec<SysRoleModel>>`。
- **Rationale**: `Res<T>` envelope 透過 serde 將 T 序列化進 `{code, data: T, msg}` 結構；T 是 Model 時 wire 含 Model 全 field（含 `id: ULID` + `displayId: i64`）。改 T 為 wire DTO（`RoleDetail`）即解決重複欄問題、Model 完全不動、internal serialize 完全不受影響。
- **Alternatives considered**:
  - Model `#[serde(skip_serializing)]` on `id` —— 否決（影響 debug print + 可能 internal serialize 路徑）
  - 改 Sea-ORM Model serde rename —— 否決（同上）
  - 全廢 raw endpoint、只留 systemManage alias —— 否決（OpenAPI / 外部 admin tool 需要 raw endpoint）

## R-Q2 — base-web typecheck/build 命令（spec A-004 / brainstorm Q-P2）

- **Decision**: `pnpm typecheck`（執行 `vue-tsc --noEmit --skipLibCheck`）+ `pnpm build`（執行 `vite build --mode prod`）。base-web 用 pnpm；`vue-tsc` 在 devDependencies。
- **實查**: `base-web/package.json` `scripts.typecheck = "vue-tsc --noEmit --skipLibCheck"`；`scripts.build = "vite build --mode prod"`；`scripts.pre-commit = "pnpm typecheck && pnpm lint && pnpm fmt && git diff --exit-code"`。
- **Rationale**: pre-commit 已強制 typecheck pass、本 feature 落地後 pre-commit 自動驗證。
- **執行方式**: base-web container 已含 pnpm；可 `docker compose exec base-web pnpm typecheck`；或於 host 側 worktree 跑 `cd base-web && pnpm install && pnpm typecheck`。

## R-Q3 — rust 3 raw api file handler 完整 cover list（brainstorm Q-P3 延伸 + E-2）

- **Decision**: 3 raw api file 共 **8 handler 需 wire DTO wrap**（return Model / Vec<Model> / PaginatedData<Model>），3 handler 不需動（return `Res<()>` 或 `Res<bool>`）。
- **實查**（`grep -n "pub async fn\|Res<" rust-api/server/api/src/admin/sys_{role,user,access_key}_api.rs`）：

| 檔 | Handler | Return type | Action |
|---|---|---|---|
| `sys_role_api.rs` | `get_paginated_roles` | `Res<PaginatedData<SysRoleModel>>` | **wrap → Res<PaginatedData<RoleDetail>>** |
| `sys_role_api.rs` | `create_role` | `Res<SysRoleModel>` | **wrap → Res<RoleDetail>** |
| `sys_role_api.rs` | `get_role` | `Res<SysRoleModel>` | **wrap → Res<RoleDetail>** |
| `sys_role_api.rs` | `update_role` | `Res<SysRoleModel>` | **wrap → Res<RoleDetail>** |
| `sys_role_api.rs` | `delete_role` | `Res<()>` | 不動 |
| `sys_role_api.rs` | `get_all_roles` | `Res<Vec<SysRoleModel>>` | **wrap → Res<Vec<RoleDetail>>** |
| `sys_user_api.rs` | `get_all_users` | `Res<Vec<SysUserModel>>` 或類似 | **wrap → Res<Vec<UserDetail>>** |
| `sys_user_api.rs` | `get_paginated_users` | `Res<PaginatedData<SysUserModel>>` 或類似 | **wrap → Res<PaginatedData<UserDetail>>** |
| `sys_user_api.rs` | `create_user` | 返 user model | **wrap → Res<UserDetail>** |
| `sys_user_api.rs` | `get_user` | `Res<SysUserModel>` 或類似 | **wrap → Res<UserDetail>** |
| `sys_user_api.rs` | `update_user` | 返 user model | **wrap → Res<UserDetail>** |
| `sys_user_api.rs` | `delete_user` / `delete_user_by_body` / `batch_delete_users` | `Res<()>` 或 `Res<bool>` | 不動 |
| `sys_user_api.rs` | `remove_policies` / `add_policies` | `Res<()>` 或 `Res<bool>` | 不動（Casbin policy 操作、無 Model 返回） |
| `sys_access_key_api.rs` | `get_paginated_access_keys` | `Res<PaginatedData<SysAccessKeyModel>>` 或類似 | **wrap → Res<PaginatedData<AccessKeyDetail>>** |
| `sys_access_key_api.rs` | `create_access_key` | 返 access_key model | **wrap → Res<AccessKeyDetail>** |
| `sys_access_key_api.rs` | `delete_access_key` | `Res<()>` | 不動 |

**註**：spec FR-011/012/013 列「get_paginated_roles / get_role / update_role / get_all_roles」等 4 handler，**漏列 `create_role`**（return Model）；本 R-Q3 確認 create handler 也需 wrap。data-model.md A4 補上。

**注意**：spec.md FR-011~013 列出的 handler 為 GET/list 主軌；本研究發現 create / update（POST/PUT）handler 也返 Model、同需 wrap。**不視為 scope 擴大**（純 cover 完整）。

## R-Q4 — base-web typecheck cascade blast radius 預估（spec E-7 / brainstorm Q-P5）

- **Decision**: 預期 cascade **僅限 2 modal**（button-auth + menu-auth）；其他 component 不應受影響（理由：service.ts function signature 已是 inline type、無 export 到外部 module；2 modal 是僅有的 service function caller）。
- **實查**: `grep -rn "fetchAssignRoleEndpoints\|fetchUpdateRoleHome\|fetchGetRoleEndpointIds\|fetchGetRoleHome" base-web/src/` → 預期只 2 modal 用、無第三 caller。
- **plan 階段執行驗證**: implementation 階段先改 service.ts、跑 `pnpm typecheck` 觀察 error scope；若超出 2 modal 即按 E-7 標準（W-WEBUI §4 邊界內必修、外 backlog）。
- **Risk mitigation**: 若 typecheck 撞超出邊界 type error（如 `role-operate-drawer.vue`），spec E-1 已明示「不擴大 scope、留 backlog」—— 但本研究預估**0 命中**該情境。

## R-Q5 — Theme A 真實改動範圍（spec FR-001/FR-002 精準化）

- **Decision**: **base-web typings/api/system-manage.d.ts 0 改動**（Theme A 改動完全集中在 service.ts + 2 modal）；FR-001 精準化為「service.ts inline type annotations 改 4 處」+「typings 不變」。
- **實查**:
  - `grep -E "roleId|endpointIds:" base-web/src/typings/api/system-manage.d.ts` → 0 命中
  - `grep -E "roleId|endpointIds" base-web/src/service/api/system-manage.ts` → 5 function 各有 inline type annotation：
    - `fetchGetRoleMenuIds(roleId: Api.SystemManage.Role['id'])` ✓ 已用 indexed type、自動對齊 number（W-FW3 落地時改過）
    - `fetchAssignRoleMenus(data: { roleId: Api.SystemManage.Role['id']; menuIds: number[] })` ✓ 同上
    - `fetchGetRoleHome(roleId: string)` ❌ hardcoded string —— 改 `Api.SystemManage.Role['id']`
    - `fetchUpdateRoleHome(data: { roleId: string; home: string | null })` ❌ hardcoded string —— 改 `Api.SystemManage.Role['id']`
    - `fetchGetRoleEndpointIds(roleId: string)` ❌ hardcoded string —— 改 `Api.SystemManage.Role['id']`；返回型 `string[]` → `number[]`（endpoint display_id i64 → JS number）
    - `fetchAssignRoleEndpoints(data: { roleId: string; endpointIds: string[] })` ❌ hardcoded string —— 改 `roleId: Api.SystemManage.Role['id']`、`endpointIds: number[]`
- **Rationale**: typings file 內 `Api.SystemManage.Role['id']` 已是 `number`（per 039 落地、`Api.Common.CommonRecord.id: number` + Role extend 即繼承）。service.ts 有 4 function 沒用 indexed type、hardcoded string，這是真實 bug 源。修法：改 inline type annotation 用 `Api.SystemManage.Role['id']` 即自動對齊 number。
- **影響 spec**: FR-001 文字應改為「service.ts inline type annotations 改 4 處」、FR-001 的 typings 改動描述為過時陳述（typings 已對齊、無需動）。data-model.md A1 補正。

## 既有體例複核（供 plan / tasks / implementation 參照）

- **039 raw endpoint Path<i64>**：T028（sys_role）/ T029（sys_user）/ T030（sys_access_key）已將 raw endpoint URL path 改 i64 + lookup cascade；本 feature 不再改 Path、只改 output 包裝。
- **039 input DTO i64 cascade**：T015-T023 + T030.5 已 cover；本 feature 0 改 input DTO。
- **W-FW8 EndpointTreeNode.key 仍 String**：039 已將 leaf 內 `key: ep.display_id.to_string()`、tree shape 保留 string key；本 feature 不動。
- **F4 response shape**：rust HTTP 統一回 `Res<T> = { code, data: T, msg }`；本 feature 0 envelope 改動、只 transform `data` 內的 Model → wire DTO。
- **032 parentId deserializer**：實際位置 `rust-api/server/model/src/admin/input/sys_menu.rs:7-23`；含 `deserialize_parent_id_compat` 函式 + `MenuInput.parent_id` 欄 `serde(deserialize_with = ...)` 屬性。Theme C 拆兩處：函式 + 屬性。

## 結論

5 個 R-Q 全 resolved；6 個 spec Assumptions（A-001~A-006）已查證並轉為設計決策。本 feature 可進 Phase 1 design（data-model + contracts + quickstart）。

**spec 需 errata 對齊**（plan 階段 + data-model 階段消化、不需 spec 文件改）：
- FR-001 描述 typings 改動為過時（R-Q5 確認 typings 已對齊、改動實際在 service.ts inline type）—— data-model.md A1 列實際改點。
- FR-011/012/013 列 handler 為 GET/list 主軌、漏 create_role / create_user / create_access_key 等 return Model 的 POST/PUT handler —— data-model.md A4 列完整 8 handler 清單。

**Implementation 階段 leave 給 implementer 拍板**（不影響 design 完整性）：
- R-Q4 typecheck cascade 範圍：在 service.ts 改完後跑 `pnpm typecheck`、實際觀察、按 E-7 限定 §4 邊界。
- E-6 base-web menu-operate-modal hidden parentId 餘料：若實 grep 命中 string parentId、修；若無、Theme C 可 clean drop。
