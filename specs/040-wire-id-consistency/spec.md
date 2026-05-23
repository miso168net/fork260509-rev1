# Feature Specification: wire-id-consistency

**Feature Branch**: `040-wire-id-consistency`  
**Created**: 2026-05-24  
**Status**: Draft  
**Input**: User description: "base-web typings + service + 2 modal body roleId String→number cascade (修 039 留下 critical bug) + drop 032 parentId deserializer workaround + 3 raw endpoint wire DTO wrap (sys_role/sys_user/sys_access_key)"

**Source**: [`docs/superpowers/040-feature-wire-id-consistency.md`](../../docs/superpowers/040-feature-wire-id-consistency.md)（brainstorming 2026-05-24 session — 039 落地後識別 3 個遺留 + 032 parentId workaround；Q1-Q3 全 3 個拍板：A+B+C+D 全包 / Full D wire DTO wrap / 短名 `wire-id-consistency`）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 Principle IV「base 不改動邊界」**受管例外 dynamic 模式**：W-WEBUI 軌道範圍由 [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) 整份文件為單一真相、加 W-FW9 不需 amendment。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §7：本 feature 將新增 `§7.4 W-FW9 wire-id-consistency`（Theme A+B 軌道內 base-web 改動）；Theme C+D rust-only 軌道外。
- 039 `rust-entity-id-numeric-migration`（merge `e53581b`、rust-api `7518926`）：5 entity `display_id BIGINT UNIQUE NOT NULL` + Snowflake 41/5/7 = 53bit i64 + API output i64 / input DTO i64 lookup → ULID cascade；本 feature 補 039 留下的 wire-side consumer cleanup。

## Scope summary

把 039 之後 wire 層仍未對齊 numeric id 的 3 條餘料一次清乾淨：

| 子項 | deliverable |
|---|---|
| **A 修 base-web critical body roleId String 撞 serde** | base-web typings 內 `roleId/userIds/endpointIds/permissions` 型 `string/Vec<string>` → `number/Vec<number>` + service.ts 自動隨 typings、TS compile gate；2 modal（button-auth + menu-auth）body 端 `String(...)` 包裝拿掉、直送 number 給 rust。修 039 acceptance 漏掉的 critical bug（curl 直送 number 過了、CDP smoke defer 漏看）。 |
| **B 拿掉 base-web 4 處 cosmetic `String(...)` 餘料** | A 完成後 TS 不再強迫 string、modal URL path 端 2 處 `String(...)` 同步自然消（template literal 自動轉）。 |
| **C 拆 032 rust parentId deserializer workaround** | 拆 `rust-api/server/model/src/admin/input/sys_menu.rs:7-23` 內 `deserialize_parent_id_compat` 函式（custom deserializer 接受 number OR string for parent_id）；`parent_id: i32` 改回 plain serde default、僅接受 number。base-web typings + service 已 number-only 後安全。 |
| **D 3 raw endpoint wire DTO wrap** | 為 `sys_role` / `sys_user` / `sys_access_key` 3 entity 的 raw GET / list / update endpoint 新增 wire DTO（`RoleDetail` / `UserDetail` / `AccessKeyDetail`）；handler 改 `.map(DTO::from)` wrap、不再 serialize Sea-ORM Model 直送；wire 上 `id` 為 `model.display_id` numeric、無 `id: ULID-string` + `displayId: i64` 重複欄位。Model 不動（internal SoT 表示保留）。 |

**範疇外**：

- ❌ **rust internal SoT 改動**：audit_log / JWT / Casbin / FK / `Ulid::new()` 用法 0 改動（同 039 X1 雙欄設計核心）。
- ❌ **新 schema migration**：本 feature 0 schema 改動、僅 wire-shape + 客戶端對齊。
- ❌ **base-web typings 中超出 W-WEBUI §4 邊界的改動**：本 feature 只動 typings + service + 2 modal、§4 邊界內。
- ❌ **input DTO 改動**（rust 端）：039 T030.5 已完成；本 feature 不再動 input DTO。
- ❌ **nestjs**：DESIGN-B、nestjs 已退場、0 改動。
- ❌ **systemManage alias 輸出已對齊**：039 T015-T017 已把 `SystemManageRoleOutput` / `SystemManageUserOutput` / `EndpointTree` 等改 i64；本 feature 不再動 alias 輸出。

## Clarifications

### Session 2026-05-24（brainstorming 階段拍板、共 3 項）

- **Q1（scope）**：**A+B+C+D 全包**。否決「只修 A critical bug + 留 backlog」（B/C/D 都已成熟、零碎拆開 review 開銷大）。
- **Q2（D scope 細節）**：**Full D — wire DTO wrap**。否決「Min D：Model `#[serde(skip_serializing)]` on id + rename display_id → id」（會破壞 audit_log 等 internal serialize 路徑、Model 應保持 internal SoT 表示）/「Drop D：raw endpoint 不動」（base-web 雖不用 raw endpoint、但 wire surface 不該重複 `id` + `displayId`）。
- **Q3（feature 短名）**：**`040-wire-id-consistency`**。否決 `040-numeric-id-typings-cleanup`（過 typings-focused）/ `040-base-web-numeric-finalization`（漏含 C+D rust 端）/ `040-039-followup-id-cleanup`（綁太緊 039、未來不易引用）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — base-web modal body roleId number wire 正確工作（Priority: P1）🎯 MVP

base-web admin 在角色管理頁開「按钮权限」modal 或「菜单授权」modal 內操作 role home dropdown，handler 透過 service function 將 `roleId` 以 JSON number 送 rust DTO（`{"roleId": 12345}`），rust serde 正確 deserialize 為 `i64`、業務邏輯走通、modal 顯示「修改成功」toast。同時 base-web TS 編譯 clean、無 type mismatch。

**Why this priority**：本 feature 最 urgent 工作 —— 039 落地後這條路徑實際**已 broken**（acceptance 漏看因 CDP smoke defer + curl 直送 number 走通）；admin 不能更新 role 端點授權與首頁設定是 dev/staging 阻擋級 bug。

**Independent Test**：透過 CDP via Edge :9229 開瀏覽器、登入 Soybean、進入 `/manage/role` → ROLE_SUPER 編輯抽屜 → 按钮权限 modal → 勾 2 endpoint → 確認 → 「修改成功」toast；nginx access log 顯示 `POST /api/systemManage/assignRoleEndpoints` 200，rust log 0 「expected i64 got string」serde 錯。同樣 menu-auth modal home dropdown 改值 → 確認 → 「修改成功」。

**Acceptance Scenarios**:

1. **Given** rust-api 已 build + dev stack 重啟、base-web typings 已對齊 number，**When** 在 button-auth modal 內勾 endpoint + 點確認，**Then** 後台 `POST /api/systemManage/assignRoleEndpoints` body `{roleId: <number>, endpointIds: [<number>, ...]}` 正確 deserialize、Casbin policy 寫入、modal 顯示「修改成功」。
2. **Given** 同 dev stack 環境，**When** 在 menu-auth modal 內改 role 首頁 dropdown + 確認，**Then** `POST /api/systemManage/updateRoleHome` body `{roleId: <number>, home: <string|null>}` 正確 deserialize、`sys_role.home_route_name` 更新、modal 顯示成功。
3. **Given** base-web source 修改完成，**When** 跑 `pnpm typecheck` / `pnpm build`，**Then** 編譯 clean、無 `String(props.roleId)` 餘料、無 type mismatch 警告。

---

### User Story 2 — rust raw endpoint wire 表示一致 numeric id（Priority: P2）

外部 admin 工具 / curl 直接命中 rust raw endpoint（`/api/role/<i64>`、`/api/user/<i64>`、`/api/role/list`、`/api/access-key/list` 等）時，response JSON 內 `id` 為 numeric（從 `display_id` 對映），**無** `id: ULID-string` 與 `displayId: i64` 重複欄位；wire surface 一致 representation。

**Why this priority**：base-web 目前 0 用 raw endpoint（全走 systemManage alias），對 dev 流程**無功能影響**；但對 OpenAPI / 外部 admin 工具 / 未來 curl-based 自動化更易讀 + type-consistent。

**Independent Test**：curl `GET /api/role/<i64>`（Soybean token）→ response `data.id` 為 JSON number、無 `displayId` 欄。同 user / access-key endpoint。

**Acceptance Scenarios**:

1. **Given** rust-api 已 build + raw endpoint wire DTO wrap 完成，**When** curl `GET /api/role/<i64>` 取 single role 詳情，**Then** response `data.id` 為 JSON number（display_id i64）、無 `displayId` 重複欄位、其他欄位（`name`/`code`/`status` 等）正確呈現。
2. **Given** 同環境，**When** curl `GET /api/role/list`（list endpoint），**Then** records `id` 全為 JSON number、無 `displayId` 重複。
3. **Given** 同環境，**When** curl `GET /api/user/<i64>`（單筆 user）+ `GET /api/access-key/list`（list），**Then** 同 1 + 2 模式。

---

### User Story 3 — rust 內部 deserializer workaround 拆乾淨（Priority: P3）

rust-api 內部 `sys_menu` parentId 接收路徑乾淨、只接受 number 型 parentId、不再有 "number or string" 雙路徑 workaround；code 行數少 17 行。

**Why this priority**：純 code hygiene 改善 —— 移除 032 留下的 workaround、簡化 deserializer 邏輯、降低 future maintainer 認知負擔。base-web typings 已 number-only 確保 consumer 不撞 422。

**Independent Test**：grep `deserialize_parent_id_compat` in `rust-api/server/model/` → 0 match；curl `POST /api/systemManage/addMenu` body `{parentId: 0, ...}` → envelope 0；curl 同 body `{parentId: "0", ...}` → envelope 4xx serde deser error。

**Acceptance Scenarios**:

1. **Given** rust-api 已 build + parentId deserializer 拆除，**When** curl `POST /api/systemManage/addMenu` body 內 `parentId` 為 JSON number（0 或正整數），**Then** envelope 0、menu 建立成功。
2. **Given** 同環境，**When** curl 同 endpoint body 內 `parentId` 為 JSON string（如 `"0"`），**Then** envelope 4xx + serde deser error msg。
3. **Given** rust-api source 改動完成，**When** grep `deserialize_parent_id_compat` 或 `deserialize_with = "deserialize_parent_id_compat"`，**Then** 命中 0。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | base-web typings 改完後其他 component 連鎖 type error（如 `role-operate-drawer.vue`） | `pnpm typecheck` 跑出全 error list；逐項追修；若某 component 不在 W-FW9 scope（如 user-operate-drawer 等與 roleId 不相關），spec 評估是否擴大 scope 或留 backlog。 |
| E-2 | rust 端 raw endpoint wire DTO wrap 但忘了 cover 某條 endpoint | 對應 endpoint 仍返回 Model 直序（含 ULID id + displayId）；T032 acceptance C-V-D1~D4 撞到。修法：補對應 endpoint 的 `.map(DTO::from)`。 |
| E-3 | C 拆 deserializer 後外部 admin tool 仍送 string parentId | 撞 envelope 4xx serde deser；非 rev1 dev 場景（base-web 是唯一 consumer）；rare external integration 自行調整。 |
| E-4 | base-web modal `roleId: number` prop 由父 component 傳 string 進來（drift） | TS compile 階段擋住、強制父對齊。 |
| E-5 | Theme D 新增 `RoleDetail` 等 wire DTO 欠某欄、與 Model 偏離（如新欄沒同步） | T032 acceptance 撞到 `data.<field>` 缺；補 DTO 欄。 |
| E-6 | Theme C 拆 deserializer 後 base-web menu-operate-modal 仍送 string parentId（hidden W-FW2 餘料） | C-V-C2 撞到；補 base-web menu-operate-modal 對齊（屬 Theme A 擴展、ad-hoc 補）。**plan 階段 grep base-web menu-operate-modal 確認 parentId 型態**。 |
| E-7 | base-web typings 改動觸發整個 frontend type-check 連鎖、大量 error | 限定 W-FW9 §4 邊界內必修；超出 scope 的 type error 留下次 cleanup feature；按 plan Q-P5 在 plan 階段先跑 typecheck 預估 blast radius。 |
| E-8 | 039 acceptance C-V 重跑時 input DTO i64 cascade 因 wire DTO 改動退化 | 不可能 —— 本 feature **0** input DTO 改、僅 output；retest 039 C-V9/V11/V12/V13 確認。 |

## Requirements *(mandatory)*

### Functional Requirements

**A. base-web critical body roleId 對齊 number**

- **FR-001**: base-web typings `src/typings/api/system-manage.d.ts` 內 `RoleEndpointsParams.roleId` / `AssignRoleMenusParams.roleId` / `UpdateRoleHomeParams.roleId` / `AssignPermissionParams.roleId` / `AssignRouteParams.roleId` / `AssignUserParams.roleId` 等對應 5 entity 的 id 型欄位 MUST 從 `string` 改為 `number`；對應 `Vec<id>` 集合（`endpointIds` / `userIds` / `permissions`）MUST 從 `string[]` 改為 `number[]`。
  > **Errata（plan Phase 0 R-Q5 確認、`/speckit-analyze` F1 對齊）**：實際 grep 顯示這些 `*Params` 型在 `src/typings/api/system-manage.d.ts` **不存在**（全是 `src/service/api/system-manage.ts` 內 inline type annotation）；典型如 `fetchAssignRoleEndpoints(data: { roleId: string; endpointIds: string[] })` 直接寫死 `string`。typings 已 number-only 對齊（`Api.SystemManage.Role.id: number`、indexed type `Api.SystemManage.Role['id']` 自動取 number）—— **typings 0 改動**。本 FR 真實 target 為 service.ts inline type annotations（見 FR-002 + data-model.md A1 + tasks.md T002 具體 4 處改動）。
- **FR-002**: base-web `src/service/api/system-manage.ts` 內對應 5 function（`fetchAssignRoleEndpoints` / `fetchAssignRoleMenus` / `fetchUpdateRoleHome` / `fetchAssignPermission`（若存在）/ `fetchAssignUsers`（若存在）等）的 input parameter 型 MUST 自動隨更新後 typings；URL path 拼接 MUST 用 template literal `` `${roleId}` `` 取代 `String(roleId)`。
- **FR-003**: base-web `src/views/manage/role/modules/button-auth-modal.vue` 與 `menu-auth-modal.vue` 內 body 端 `String(props.roleId)` MUST 拿掉、直接傳 `props.roleId`（number）。URL path 端的 `String(...)` 同步移除（template literal 處理）。
- **FR-004**: base-web TS 編譯（`pnpm typecheck` / `pnpm build`）MUST clean、無 type mismatch / 無 String() 警告。

**B. URL path String() 餘料拿掉**

- **FR-005**: base-web `button-auth-modal.vue:33` + `menu-auth-modal.vue:37` URL path 端的 `String(props.roleId)` MUST 移除（隨 FR-002 service signature 改動自然消、無獨立工作）。

**C. rust parentId deserializer workaround drop**

- **FR-006**: rust-api `server/model/src/admin/input/sys_menu.rs` 內 `deserialize_parent_id_compat` 函式 MUST 移除（~17 行）；對應 `parent_id` 欄位 MUST 改回 plain serde default（無 `deserialize_with` 屬性）。
- **FR-007**: rust-api MUST 在 `parentId` 收到非 number 型輸入時返回 envelope 4xx serde deserialization error（無 string fallback）。

**D. rust 3 raw endpoint wire DTO wrap**

- **FR-008**: rust-api `server/model/src/admin/output/sys_role.rs`（新檔，若無）MUST 新增 `RoleDetail` output struct（含 `pub id: i64`、其他 role 業務欄位 mirror Sea-ORM Model）+ `From<sys_role::Model>` impl 內 `id: model.display_id`。
- **FR-009**: rust-api `server/model/src/admin/output/sys_user.rs` MUST 新增 `UserDetail` output struct（pattern 同 FR-008）。
- **FR-010**: rust-api `server/model/src/admin/output/sys_access_key.rs`（新檔，若無）MUST 新增 `AccessKeyDetail` output struct（pattern 同 FR-008）。
- **FR-011**: rust-api `server/api/src/admin/sys_role_api.rs` raw endpoint（`get_paginated_roles` / `get_role` / `update_role` / `get_all_roles`）handler MUST 改 `.map(RoleDetail::from)` wrap Model→wire DTO；不再 serialize `sys_role::Model` 直送 wire。
- **FR-012**: rust-api `server/api/src/admin/sys_user_api.rs` raw endpoint（`get_all_users` / `get_paginated_users` / `get_user` / `update_user`）handler MUST 改 `.map(UserDetail::from)` wrap（pattern 同 FR-011）。
- **FR-013**: rust-api `server/api/src/admin/sys_access_key_api.rs` raw endpoint（`get_paginated_access_keys`）handler MUST 改 `.map(AccessKeyDetail::from)` wrap（pattern 同 FR-011）。
- **FR-014**: Sea-ORM Model（`sys_role::Model` / `sys_user::Model` / `sys_access_key::Model`） MUST 0 改動 —— `id: String` 與 `display_id: i64` 雙欄保留以維持 internal SoT 表示（audit_log payload helpers、debug print 等內部 serialize 路徑不受影響）。

**E. 範疇紀律 + Constitution**

- **FR-015**: 本 feature 對 base-web 的改動 MUST 限於 W-WEBUI §4 邊界內：`src/typings/api/system-manage.d.ts` + `src/service/api/system-manage.ts` + 2 modal vue 檔（共 4 檔）。不動其他 base-web src。
- **FR-016**: 本 feature 對 rust internal SoT MUST 100% 保留：audit_log / JWT / Casbin / FK schema / `Ulid::new()` 用法 0 改動。
- **FR-017**: 本 feature MUST 0 schema migration、0 新 entity、0 input DTO 改動（rust 端）—— input cascade 由 039 T030.5 已完成。
- **FR-018**: 本 feature MUST 0 nestjs 改動（DESIGN-B、退場）。
- **FR-019**: 本 feature MUST 更新 `docs/INTEGRATION-DESIGN-W-WEBUI.md` 加 `§7.4 W-FW9 wire-id-consistency`（既 §7.4 執行順序 → §7.5）；Constitution v1.4.0 dynamic 授權即生效、無 amendment。
- **FR-020**: commit MUST 為三段式（base-web worktree → rust-api worktree → outer SHA pin、per CLAUDE.md §4.1）；base-web + rust-api 各自 push fork、outer commit 記 SHA pin。
- **FR-021**: acceptance MUST 用 curl + CDP browser smoke 三者覆蓋（比照 W-FW1~W-FW8 + 039 慣例）；本 feature 為 wire-shape 對映 + 移除既有 workaround 類、由 acceptance matrix 覆蓋正確性、無新純函式單元測試。

### Key Entities

- 本 feature 0 新 entity / 0 schema 改動。涉及既有 entity（`sys_role` / `sys_user` / `sys_access_key`）僅在 wire 表示層改動、Sea-ORM Model 不動。
- 新增 wire DTO（`RoleDetail` / `UserDetail` / `AccessKeyDetail`）為 wire-shape 表示層、不映射新 DB 欄位。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: base-web button-auth modal + menu-auth modal CDP browser smoke 100% 通過 ——`/manage/role` ROLE_SUPER 編輯抽屜 → 兩 modal 端到端「修改成功」toast 出現、nginx access log 顯示對應 POST 200、rust log 0 「expected i64 got string」serde 錯。
- **SC-002**: base-web TS 編譯（`pnpm typecheck` / `pnpm build`）clean、無 type mismatch / 無未消的 `String(<idField>)` 餘料命中（grep `base-web/src/views/manage/role/modules/*.vue` 確認 0 命中）。
- **SC-003**: rust 3 raw endpoint wire DTO 端到端正確 —— curl `GET /api/role/<i64>` / `GET /api/role/list` / `GET /api/user/<i64>` / `GET /api/user/list` / `GET /api/access-key/list`：response `data.id`（或 `data.records[].id`）100% 為 JSON number、**無** `displayId` 重複欄位、其他業務欄位完整。
- **SC-004**: rust parentId deserializer workaround 拆除 —— grep `deserialize_parent_id_compat` in `rust-api/server/` 命中 0；curl `POST /api/systemManage/addMenu` body number parentId → envelope 0；同 body string parentId → envelope 4xx serde deser error。
- **SC-005**: 039 acceptance C-V matrix subset 100% 重跑通過、不退化 —— C-V6 / C-V7 / C-V8 / C-V9 / C-V11 / C-V12 / C-V13（wire output 與 input cascade 既有）+ C-V19 / C-V20 / C-V21 / C-V22（rust internal SoT 不變）+ C-V24（base-web W-FW9 §4 邊界外 0 diff）+ C-V27（5 entity display_id 不退化）全綠。
- **SC-006**: Sea-ORM Model 0 改動 —— grep `pub struct Model` in `rust-api/server/model/src/admin/entities/sys_role.rs / sys_user.rs / sys_access_key.rs` 顯示 `id: String` + `display_id: i64` 雙欄、與 039 後狀態一致；audit_log payload `entity_id` + `payload_before/after` 內 id 仍 ULID 字串。
- **SC-007**: W-WEBUI 軌道授權清楚 —— `docs/INTEGRATION-DESIGN-W-WEBUI.md §7` 含 `§7.4 W-FW9 wire-id-consistency` 條目、Constitution v1.4.0 不需 amendment。

## Assumptions

- **A-001**: base-web 是 rev1 唯一 active wire consumer，032 parentId deserializer workaround 拆除安全（無外部 admin tool 仍送 string parentId 撞 422）。**已驗證**：grep base-web `service/api/` 顯示僅 4 檔（auth/route/system-manage/index）、全 number-only 對齊。
- **A-002**: base-web typings + service 改動為 W-WEBUI §4 邊界內（typings/api + service/api + 2 modal）—— 不觸及 typings 整體骨架、不破壞既有 component。**已驗證**：grep base-web 內僅 button-auth-modal + menu-auth-modal 2 處 `String(<idField>)` 餘料命中。
- **A-003**: Sea-ORM Model 內部 serialize 路徑（如 audit_log payload helpers 用 `serde_json::to_value(model)`）若有也僅讀 `model.id` ULID + 其他欄、不依賴 Model 直送 wire；本 feature wire DTO wrap 不破壞 internal serialize 路徑。**plan Phase 0 R-Q1 查證**：grep `Json(.*sys_role::Model)\|Json(.*sys_user::Model)\|Json(.*sys_access_key::Model)` in `rust-api/server/api/src/` 確認除已知 raw handler 外無其他 wire 直送點。
- **A-004**: base-web `pnpm typecheck` 與 `pnpm build` 可在 base-web container 內跑（per CLAUDE.md §8.2.1 dev stack pattern）；若 dev container 不支援 typecheck，於 host 側 `cd base-web && pnpm install && pnpm typecheck` 跑。**plan Phase 0 R-Q2 查證**：在 dev container 確認 `pnpm` 是 base-web package manager。
- **A-005**: 039 input DTO i64 cascade（T030.5 落地）+ raw endpoint Path<i64>（T028/T029/T030 落地）為 wire DTO wrap 的足夠前置 —— 本 feature 只動 output、不再動 input。**已驗證**：spec §1 範疇外明示 + brainstorm §3.4 Q-P3 評估「不需 input DTO 改」。
- **A-006**: base-web modal `roleId: number` prop 由父 component 正確傳 number 進來 —— 否則 TS compile 階段擋住。**已驗證**：button-auth-modal + menu-auth-modal 的 prop 宣告已是 `roleId: number`，本 feature 不需改 modal prop 宣告。

## Dependencies

### Inbound（本 feature 依賴）

- **039 `rust-entity-id-numeric-migration`**（merge `e53581b`、rust-api `7518926`）：5 entity 加 display_id BIGINT i64 + API output i64 / input DTO i64 lookup → ULID cascade。本 feature 修 039 wire-side consumer 餘料 + 拆 032 historical workaround。✅
- **038 W-FW8 `button-auth-completion`**（merge `5c9ea69`）：button-auth modal + assignRoleEndpoints endpoint 落地、為本 Theme A 觀察根源。✅
- **037 W-FW6 `role-authorization-completion`**（merge `10b5bee`）：menu-auth modal home dropdown + updateRoleHome 落地、為本 Theme A 觀察根源（W-FW6 N2）。✅
- **032 `menu-crud-wiring`**（merge `8ccc4b4`）：W-FW2 menu CRUD wiring + parentId deserializer workaround 落地、為本 Theme C 對象。✅
- **Constitution v1.4.0**：受管例外授權 dynamic 模式（W-WEBUI 文件權威）—— 加 W-FW9 不需 amendment。✅

### Follow-up（本 feature 範疇外）

- **base-web typings 全域收斂 sprint**：若 plan 階段 typecheck 撞到超出 W-FW9 §4 邊界的 type error（如 `Api.SystemManage.MenuTree.pId` 與 rust `pid` 字段名不對齊等），列 follow-up backlog；不擴大本 feature scope。
- **observability（W-F12/13/14）**：Phase W deploy 最後一個 phase；本 feature 落地後可推進。
