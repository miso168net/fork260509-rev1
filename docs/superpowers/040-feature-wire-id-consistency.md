# 040 wire-id-consistency — brainstorm 設計

**日期**：2026-05-24  
**Feature**：`040-wire-id-consistency`（W-FW9）  
**前置**：039 `rust-entity-id-numeric-migration` merge `e53581b`（5 entity 加 display_id BIGINT i64、Snowflake 41/5/7 = 53bit、API output i64 / input DTO i64 lookup → ULID cascade、rust internal SoT 仍 ULID）

---

## 1. 觸發背景

039 完成後外顯三個遺留：

1. **Critical（未被 acceptance 撞到）**：base-web 2 modal body 內 `roleId: String(props.roleId)` 在 039 後送 JSON `{"roleId": "12345"}` 給 rust DTO `i64` → 必撞 serde "expected i64 got string"。Acceptance 階段 curl 直送 number 通過、CDP smoke 被 defer，因此漏掉。
2. **Cosmetic**：base-web 4 處 `String(...)` 餘料（其中 2 處 URL path 是 TS 拼接所需、2 處 body 即上述 critical）。
3. **By-design 但不美觀**：3 個 rust raw endpoint（sys_role / sys_user / sys_access_key 的 `Path<i64>` GET / list）serialize 整個 Sea-ORM Model 直送 wire → 同時暴露 `id: ULID-string` + `displayId: i64`、與 base-web typings `id: number` 概念衝突（不過 base-web 0 用 raw endpoint、純內部 API 表面問題）。

加上 032 留下的 `parentId` deserializer workaround（custom `deserialize_with` 接受 number OR string for parent_id），是 base-web typings 與 wire 形狀不對齊的歷史副產品，現在 base-web typings 已 number-only 應可拆。

---

## 2. 範圍與 Constitution 處理

### 2.1 4 themes（user 拍板 A+B+C+D 全包）

| Theme | 區 | 範圍 |
|---|---|---|
| **A** | base-web typings + service.ts + 2 modal | 修 critical body roleId String → number cascade |
| **B** | base-web 2 modal URL path | 拿掉 cosmetic `String(...)`（Theme A typings 改完後自然消） |
| **C** | rust-api `server/model/src/admin/input/sys_menu.rs` | 拆 032 parentId deserializer workaround |
| **D** | rust-api 3 raw endpoint output | 為 sys_role / sys_user / sys_access_key raw GET/list 新增 wire DTO（`RoleDetail` / `UserDetail` / `AccessKeyDetail`），handler 改 `.map(DTO::from)` wrap、不再 serialize Model 直送 |

### 2.2 Constitution Principle IV 處理

- Constitution v1.4.0 amendment：「W-WEBUI 軌道整體為受管例外、軌道範圍以 DESIGN-W-WEBUI 文件為單一真相」→ 加 W-FW9 **不需** Constitution amendment。
- A+B 屬 W-WEBUI 軌道（base-web 改動、§4 邊界內）→ 更新 [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §7 新增 `§7.4 W-FW9 wire-id-consistency`（既 §7.4 執行順序 → §7.5）。
- C+D 軌道**外**、rust-only（同 039 模式）→ Principle IV 預設原則涵蓋、不動用受管例外。
- 同一 feature 內混 W-WEBUI 軌道內外屬性：實作時 spec 明示各檔歸屬。

---

## 3. 設計細節

### 3.1 Theme A — Critical fix（modal body roleId）

**Root cause chain**:
- `src/typings/api/system-manage.d.ts` 內 `Api.SystemManage.RoleEndpointsParams.roleId: string` 等型別宣告，TS 強迫呼叫端 `String(...)` 轉。
- 真實 wire 已是 number（039 落地）；typings 沒同步。

**改動**:

| 檔 | 改動 |
|---|---|
| `src/typings/api/system-manage.d.ts` | `RoleEndpointsParams.roleId: string → number`、`AssignRoleMenusParams.roleId: string → number`、`UpdateRoleHomeParams.roleId: string → number`、AssignPermissionParams / AssignRouteParams / AssignUserParams 同（含相關 `endpointIds` / `userIds` / `permissions` Vec 元素型） |
| `src/service/api/system-manage.ts` | 5 function signature 用更新後 typings、自動傳 number；URL path 內部用 template literal `` `${roleId}` `` 轉 string |
| `src/views/manage/role/modules/button-auth-modal.vue` | line 33（URL path）+ line 45（body）拿掉 `String(...)`；body 直送 number |
| `src/views/manage/role/modules/menu-auth-modal.vue` | line 37（URL path）+ line 46（body）同 |

### 3.2 Theme B — Cosmetic URL path String() 拿掉

Theme A typings + service 改完後，4 處 `String(...)` 自動失去存在理由（function signature 接 number、TS 不再強迫）。Theme B 等於 Theme A 副產品，不獨立工作。

### 3.3 Theme C — Drop 032 parentId deserializer workaround

**對象**: `rust-api/server/model/src/admin/input/sys_menu.rs:7-23`
- 既有 custom `deserialize_with = "deserialize_parent_id_compat"` accepts number OR string for `parent_id`
- 結構：`parent_id: i32` 含 `serde(deserialize_with = ...)`

**改動**:
- 拆 `deserialize_parent_id_compat` 函式（~17 行）
- `parent_id: i32` 改回 plain serde default（接受 number-only）
- 其他 2 處同 sys_menu input file（line ~127, 157）同步檢查、確認無 workaround attribute

**Risk**: 若有外部 admin tool 仍送 string parentId → 撞 422 serde deser。Rev1 dev 唯一 consumer = base-web；base-web `menu-operate-modal.vue` 已 number → 安全。

### 3.4 Theme D — Raw endpoint wire DTO wrap

**對象 + 改動**:

| Raw endpoint | 改動 |
|---|---|
| `sys_role_api.rs` `get_paginated_roles` / `get_role` / `get_all_roles` | 新增 `RoleDetail { id: i64, name, code, ... }` output struct + From<sys_role::Model> impl 內 `id: m.display_id`；handler 改 `.map(RoleDetail::from)` |
| `sys_role_api.rs` `update_role` | 同上 |
| `sys_user_api.rs` `get_all_users` / `get_paginated_users` / `get_user` / `update_user` | 新增 `UserDetail` output struct（pattern 同 RoleDetail）；handler wrap |
| `sys_access_key_api.rs` `get_paginated_access_keys` | 新增 `AccessKeyDetail` output struct；handler wrap |

**設計選擇**:
- 為什麼不 add `#[serde(skip_serializing)]` to Model.id？因為 Model 是 internal SoT 表示、其他 serialize 路徑（audit_log payload helpers, 預設 debug 印） 可能依賴；wrap DTO 為更乾淨的 separation of concerns。
- 為什麼新 file vs 加進 `sys_role.rs` output？評估後：3 entity 各自加進 existing `server/model/src/admin/output/sys_<entity>.rs`、不開新檔，與既有 SystemManage* 共處。
- 為什麼不重用 `SystemManage*Output`？SystemManage 系列是 alias layer 特定 wire shape（含 `userRoles` 等加工字段）；raw endpoint 通常輸出完整 row、不該共用。

**Model 改動 = 0**（Sea-ORM Model 仍 `id: String` + `display_id: i64`、不動）。

---

## 4. Acceptance Strategy

### 4.1 Theme A + B — CDP browser smoke 必跑

| C-V | 對象 | 驗 |
|---|---|---|
| C-V-A1 | button-auth modal | CDP via Edge :9229 → /manage/role → ROLE_SUPER 編輯 → 按钮权限 → modal 開、勾 2 endpoint → 確認 → 「修改成功」toast；wire request body `roleId` 為 JSON number |
| C-V-A2 | menu-auth modal | CDP → 同 modal 內角色 home dropdown 改值 → 確認；wire body `roleId` 為 JSON number |
| C-V-A3 | base-web TS 編譯 | `cd base-web && pnpm typecheck`（或對應 build）clean、無 type mismatch |

### 4.2 Theme C — curl

| C-V | 驗 |
|---|---|
| C-V-C1 | curl `POST /api/systemManage/addMenu` body `{parentId: 0, ...}` → envelope 0 |
| C-V-C2 | curl 同 body `{parentId: "0", ...}` → envelope 4xx（workaround removed） |

### 4.3 Theme D — curl

| C-V | 驗 |
|---|---|
| C-V-D1 | curl `GET /api/role/<i64>` → response `data.id` 為 JSON number，**無** `displayId` 重複欄位 |
| C-V-D2 | curl `GET /api/role/list` 同 |
| C-V-D3 | curl `GET /api/user/<i64>` / list 同 |
| C-V-D4 | curl `GET /api/access-key/list` 同 |

### 4.4 Regression — 039 acceptance 不退化

- C-V6 / C-V7 / C-V8 / C-V9 / C-V11 / C-V12 / C-V13 重跑、wire shape 不退化
- C-V19 / C-V20 / C-V21 / C-V22 internal SoT 仍 ULID（C+D 不該影響、保險驗）

---

## 5. 規模 + 改動分量

| 區 | 檔 | 估計 |
|---|---|---|
| base-web typings | `src/typings/api/system-manage.d.ts` | 1 檔、4-5 type 改 |
| base-web service | `src/service/api/system-manage.ts` | 1 檔、5 function signature |
| base-web modal | 2 modal | 4 處 `String(...)` 拿掉 |
| rust-api parentId deserializer drop | `sys_menu.rs` | 1 檔、~17 行 |
| rust-api raw endpoint wire DTO | 3 output struct 加 + 3 api handler 修 | 6 檔、~80 + 5 handler wrap |
| docs/INTEGRATION-DESIGN-W-WEBUI.md | §7 加 W-FW9 | 1 檔 +~20 行 |
| **總計** | **~12 檔** | **~125 行 net** |

比較：
- 比 039 中等（~38 處）小
- 比 W-FW8（~12 處 + 1 migration）中等

---

## 6. Open Questions / 待 plan 階段查證

- **Q-P1**: `src/service/api/system-manage.ts` 內 `function fetchAssignRoleEndpoints(params: ...)` 的 params 型 path —— 改 typings 後是否仍需顯式 type annotation？plan 階段 read file 確認。
- **Q-P2**: base-web `pnpm typecheck` / `pnpm build` 命令在 dev container 是 `pnpm` 還是 `npm` / 別的？plan 確認 base-web container 的 package manager。
- **Q-P3**: Theme D 是否要對 `update_role` / `update_user` 也包 wire DTO 反序列化（input）？評估：update body 主由 SystemManage*Input DTO 處理（W-FW1/W-FW3 系列）、raw `update` body 沿用 raw service input DTO（如 `UpdateRoleInput`，T030.5 已改 i64）—— **不需** 額外 input DTO 改。
- **Q-P4**: `sys_role.rs` / `sys_user.rs` Model 是否有別處 derive Serialize 而被 wire 撞到（如 internal admin debug endpoint）？plan 階段 grep `sys_role::Model.*serialize\|Json(.*sys_role::Model)` 等。
- **Q-P5**: base-web typings 改完後是否觸發其他 component 連鎖 type error（如 `role-operate-drawer.vue` 等）？plan 階段在 dev container 跑 typecheck 確認。

---

## 7. Implementation 階段建議（給 plan 階段參考）

- **混合 TDD + acceptance-only**：本 feature 為 wire 形狀對映 + 移除既有 workaround、無新純函式邏輯 → 全 acceptance-only（C-V matrix 覆蓋）。比照 W-FW7 慣例、理由列 plan「Technical Context · Testing」。
- **分相 (phase)** 對應 4 themes：
  - Phase A: base-web typings + service.ts（先做、TS compile gate）
  - Phase B: base-web 2 modal `String(...)` 拿掉（依 Phase A）
  - Phase C: rust-api sys_menu parentId deserializer drop（獨立）
  - Phase D: rust-api 3 raw endpoint wire DTO wrap（獨立）
  - Phase E: CDP browser smoke + curl acceptance
- **commit 紀律**：CLAUDE.md §4.1 三段式（base-web worktree → rust-api worktree → outer SHA pin）。
- **W-FW9 加入 DESIGN-W-WEBUI doc**：T036 含此文件更新（同 W-FW8 加入時的 pattern）。

---

## 8. Constitution 對照 check（plan 階段 GATE）

| Principle | 預判 |
|---|---|
| I. RBAC Fail-safe | 0 RBAC 改動 → PASS |
| II. Soft Delete + 全域 Audit | 0 audit 改動 → PASS |
| III. 嚴版禁 Forward + 單一職責 | 0 後端間互呼 → PASS |
| IV. base 不改動邊界 | A+B base-web 改動 → W-WEBUI 軌道、§7 加 W-FW9 即授權 / C+D 軌道外 → 預設原則涵蓋 → PASS |
| V. 漸進收縮 | 0 nestjs、0 新 entity、純去除既有 workaround + wire 對齊 → PASS |

預判 5/5 PASS、無 Complexity Tracking 需填。

---

## 9. Brainstorm 拍板紀錄

- **Q1（scope）**：A+B+C+D 全包（user 拍板）
- **Q2（D scope 細節）**：Full D — 為 3 entity 加 wire DTO wrap、不動 Model（user 拍板）
- **Q3（feature 短名）**：`040-wire-id-consistency`（user 拍板）

下一步：交棒給 `superpowers:writing-plans`（CLAUDE.md §3 SDD 設計鏈起手 `/speckit-specify`）。
