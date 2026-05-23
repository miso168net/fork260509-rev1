# Feature Specification: W-FW6 — role-authorization-completion（角色授權完整化）

**Feature Branch**: `037-role-authorization-completion`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "W-FW6 role-authorization-completion — 整併 W-FW4-N2（role home 持久化）+ W-FW4-N3（assign_routes/users audit gap）+ W-FW3-N1（role code 安全改名）。N1 button-auth 推遲為 W-FW8（需 Phase 0 research）。"

**Source**: [`docs/superpowers/037-feature-role-authorization-completion.md`](../../docs/superpowers/037-feature-role-authorization-completion.md)（brainstorming 2026-05-23 session — W-WEBUI follow-up 軌道第三個 feature；6 個釐清拍板）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.2.0，列舉含 `W-FW1`–`W-FW7`、准動範圍含「§4 授權下最小 UI 新增」）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §7.2 W-FW6 + §4 base-web 修改範圍邊界。
- W-FW3 `role-crud-wiring`（033，merge `729dbf9`）：本 feature N4 = W-FW3-N1 完整解（W-FW3 採 transform-layer code-lock 過渡、本 feature 以 rust native 安全機制取代）。
- W-FW4 `role-authorization-wiring`（034，merge `ff5ea63`）：本 feature N2/N3 = W-FW4-N2/N3 補完（W-FW4 已接通 menu 授權主路徑、本 feature 補 home 持久化 + audit gap）。

## Scope summary

W-WEBUI follow-up 軌道收尾 feature。把 W-FW3/W-FW4 過渡留下的 3 個關鍵 follow-up 一次補完：(N2) role 首頁從 hardcoded `"home"` 變成可持久化、可在 menu-auth-modal 設定；(N3) sys_authorization_service 補 audit gap；(N4) role code 改名安全機制（同步 Casbin policy）。完成後 W-WEBUI follow-up 軌道剩唯一 W-FW8 button-auth 待規劃。

| 面向 | deliverable |
|---|---|
| **N2 role home 持久化** | `sys_role` 加 `home_route_name` 欄（可空）；兩個讀寫端點；base-web menu-auth-modal 既有 home stub 接真 API；既有 role 升級後 home 為空、向後相容。 |
| **N3 assign_routes/users audit gap** | `sys_authorization_service` 的 `assign_routes` + `assign_users` 補稽核紀錄（單 event、whole-snapshot before/after 含集合差異）。**不**動 `assign_permission`（留 W-FW8 button-auth 用到時一併補）。 |
| **N4 role code 安全改名** | rust `update_role` 偵測 code 變動時同步 Casbin policy（policy + grouping 兩種規則類型皆覆蓋）；拿掉 W-FW3 transform-layer code-lock；base-web drawer 不改（user 從 drawer 改 roleCode 送出即生效）。 |

**範疇外**：

- ❌ **W-FW4-N1 button-auth modal 接通**（推遲 W-FW8、需 Phase 0 research 評估 sys_endpoint vs sys_menu.buttons vs 新 sys_role_button 3 條路線；W-FW4 brainstorm 已預警）。
- ❌ `assign_permission` audit 補寫（同類 pre-existing gap、但未透過 base-web endpoint 暴露、留 W-FW8 動到時一併補；YAGNI）。
- ❌ `sys_role` 其他 schema 變更（只加 `home_route_name` 一欄）。
- ❌ 既有 role/menu/user CRUD 行為（W-FW3/W-FW4 已接、不重做）。
- ❌ base-web `src/typings` 改動（home 欄走 service function 介面、§4 不准動 typings）。
- ❌ nestjs fork 改動（DESIGN-B、nestjs 已退場）。
- ❌ Casbin enforcer reload 機制變動（沿用 W-F11 既有 redis pub-sub）。

## Clarifications

### Session 2026-05-23（brainstorming 階段拍板，共 6 項）

- **Q1（W-FW6 範疇取捨）**：N1 button-auth 包含 Phase 0 research、可能需設計新 RBAC 子系統，是否拆分？→ **A：拆分 — W-FW6 = N2 + N3 + N4；N1 另立 W-FW8**。考量 N1 工作量不確定性高、需 Phase 0 研究決定 button 後端模型（sys_endpoint API 權限 vs sys_menu.buttons W-FW7 剛持久化的 button 定義 vs 新增 sys_role_button 關聯表），獨立排避免拖累 W-FW6 進度。
- **Q2（N2 home 欄型別）**：sys_role 加哪一種 home 欄？→ **A：`home_route_name VARCHAR nullable`**。存 menu 的 route_name（例如 `'home'` / `'manage_user'`），與 base-web vue-router 的 route name 一致、與 frontend 語意完全對齊（menu-auth-modal 現狀 hardcode `'home'` 就是這個鄰域的值）。否決 `home_menu_id INTEGER`（base-web home 選單以 route_name 為 key、需多一層查表）與 `home_route_path VARCHAR`（與 home 選單用的 route_name 不一致、需手動轉換）。
- **Q3（N4 UX / 防護組合）**：rust 加 native casbin 同步是必做、剩下取捨 = base-web drawer roleCode 是否改唯讀 + W-FW3 transform-layer code-lock 是否拿掉？→ **A：拿掉 code-lock + drawer 不改**。rust native 安全處理 code 變更、拿掉 W-FW3 過渡限制、base-web drawer 維持 roleCode editable。結果：user 從 drawer 直接改 roleCode 送出即生效（rust 同步 Casbin policy）。0 base-web 改動（同 W-FW7 慣例）、完整功能。
- **Q4（N3 audit 範圍）**：sys_authorization_service 三個 assign_* 全無 audit、補哪些？→ **A：assign_routes + assign_users**。補有 base-web endpoint expose 的兩個（W-FW6 主要 + F8 已 expose 的 assign_users）；assign_permission 留 W-FW8 button-auth 動到時一併補（YAGNI、目前無 expose）。
- **Q5（N2 端點 + validation）**：getHome / updateHome 端點形狀 + validation 嚴格度？→ **A：兩端點 + reject 不存在 active route_name**。`GET /systemManage/getRoleHome/:roleId` + `POST /systemManage/updateRoleHome` body `{roleId, home}`；validation：home 非空時 reject 不存在的 active route_name（查 active menu、防 admin direct curl 寫入無效值）。
- **Q6（N3 audit event 形狀）**：assign_routes/users 一次操作可能 add+delete 多 row、event 怎麼記？→ **A：單 event + whole-snapshot before/after**。一次 assign_* call 寫 1 條 sys_operation_log row、entity_id = role_id、payload_before = `{role_id, menu_ids/user_ids: [...existing]}`、payload_after = `{role_id, menu_ids/user_ids: [...new]}`、operation = UPDATE。與既有 menu/role/user update audit (whole snapshot) 合乎同一慣例。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — role home 持久化（Priority: P1）🎯 MVP

管理者在 base-web role 管理頁開啟某 role 的「菜單授權」抽屜，看到該抽屜內的「角色首頁」下拉選單列出該角色可選的 menu 清單；管理者選一個 menu（例如「使用者管理」）並送出後，該設定持久化於該 role；下次任何管理者再次開啟同 role 的菜單授權抽屜時，首頁下拉預填為上次設定值（不再永遠顯示 `home` 預設）。既有 role（W-FW6 前建立）開啟時首頁下拉預填為預設值 `home`、不破壞既有行為。

**Why this priority**：W-FW4 thin wiring 留下的最後一個 user-facing UI gap。base-web menu-auth-modal 的「角色首頁」UI 已存在且 functional；本 user story 完成後 user 在「菜單授權」抽屜的所有 UI 元件（菜單樹勾選 + 首頁選單）都連通實際後端 —— 整個 role 授權 UX 變完整。MVP 切片可獨立交付：N2 完成後即使 N3/N4 不做，admin 也能設定/讀回 role home。

**Independent Test**：在 `/manage/role` 開某 role 的菜單授權抽屜 → 選一個首頁送出 → 重開該抽屜首頁下拉預填一致；對照資料庫該 role 的 home_route_name 儲存正確。

**Acceptance Scenarios**:

1. **Given** 某 role 從未設定首頁（home_route_name 為空），**When** 管理者開啟其菜單授權抽屜，**Then** 首頁下拉預填為預設值 `home`；抽屜顯示完整可用。
2. **Given** 某 role 已設定首頁為 `manage_user`，**When** 管理者重新開啟其菜單授權抽屜，**Then** 首頁下拉預填為 `manage_user`。
3. **Given** 某 role 開啟菜單授權抽屜，**When** 管理者改首頁下拉並送出（不論是否同時改菜單勾選），**Then** 該 role 的 home_route_name 被持久化為新值；重開預填一致。
4. **Given** 某 role 首頁設為 `manage_user`，**When** 管理者改回預設 `home` 或設為空，**Then** 該 role 的 home_route_name 被持久化為對應值（明示變動有效）。
5. **Given** 系統嘗試將首頁設為一個不存在的 menu（或軟刪除的 menu），**When** 後端收到請求，**Then** 拒絕該變更（回錯誤、role 設定不變）。

### User Story 2 — assign_routes/users 操作可稽核（Priority: P2）

管理者執行角色菜單授權變更（assign menus to role）或使用者角色指派變更（assign users to role）後，系統審計日誌 MUST 出現對應紀錄；每次變更紀錄 1 條 audit row，記錄變更前/後的完整集合，方便日後追溯「哪個管理者在何時把哪些 menu/user 指派給/移除自哪個 role」。

**Why this priority**：純後端、無 UI 影響；補完 Constitution Principle II「全域 audit」覆蓋率（既有 sys_authorization_service 三個 assign_* 全無 audit 是 pre-existing gap）。可獨立於 US1/US3 交付：N3 完成後既有 W-FW4 assign-routes path + F8 assign-users path 自動產生 audit trail，無需 base-web 變動、無需 user 介入。

**Independent Test**：用 curl 對某 role 執行 assignRoleMenus（或 assignUsersToRole）後，psql 查 sys_operation_log 應有對應 1 row、payload_before / payload_after 含集合差異正確；多次連續 assign 應各有對應 audit row。

**Acceptance Scenarios**:

1. **Given** 某 role 既有 menu 授權 `[1, 2, 3]`，**When** 管理者送 assignRoleMenus 改為 `[2, 3, 4]`，**Then** 系統審計紀錄產生 1 條 UPDATE 事件、entity_type=sys_role、entity_id=該 role；payload_before 含 `menu_ids: [1,2,3]`、payload_after 含 `menu_ids: [2,3,4]`；無變動的 menu 在前後 set 都出現（whole snapshot）。
2. **Given** 某 role 既有 user 指派 `["u1","u2"]`，**When** 管理者送 assignUsersToRole 改為 `["u1","u3"]`，**Then** 同樣產生 1 條 audit UPDATE 事件、payload_before/after 含 user_ids 集合差異。
3. **Given** 某次 assign_routes/users 操作未對 role 集合造成實質變動（送同樣集合），**When** 後端執行該操作，**Then** 仍產生 1 條 audit 事件（payload_before == payload_after，表示「曾被觸發但無變動」），與其他 assign_* 一致行為。
4. **Given** 某次 assign_routes/users 操作在 transaction 中途失敗，**When** rollback 完成，**Then** 對應 audit 紀錄**不**寫入（與 sys_role_menu / sys_user_role 變動同 txn 原子性）。

### User Story 3 — role code 安全改名（Priority: P2）

管理者在 base-web role 編輯抽屜中能修改某 role 的 roleCode（如把 `R_TEST` 改成 `R_TEST_RENAMED`）並送出；該 role 的 code 在資料庫中正確更新，**且**所有與該 role code 連動的 Casbin 授權規則（包括 policy rule 與 user-role grouping rule）的對應欄位同步更新；改名後該 role 持有的權限與角色關聯不退化（既有 user 仍是該 role、既有 endpoint 授權仍生效）。

**Why this priority**：完整解 W-FW3 過渡留下的「role code 改名」能力缺口（W-FW3 採 transform-layer code-lock、admin 從 UI 改 code 會被截斷）。安全性正確性需求高（Casbin policy 若失聯會導致權限 leak 或 user 失權）。可獨立於 US1/US2 交付：N4 完成後 base-web drawer 既有 roleCode editable 自然生效、admin 能改 code、native 保證 Casbin policy 同步。

**Independent Test**：對某 role 用 curl 送 updateRole 改 roleCode → psql 驗證 sys_role.code 變、Casbin policy 對應規則的 role code 欄同步變、改名後該 role user 仍能訪問既有授權 endpoint。

**Acceptance Scenarios**:

1. **Given** 某 role code 為 `R_TEST`、有 user 指派且有 menu/endpoint 授權，**When** 管理者送 updateRole 改 roleCode 為 `R_TEST_RENAMED`，**Then** sys_role.code 變為 `R_TEST_RENAMED`；對應 Casbin policy rule（v0 = `R_TEST`）的 role code 同步改為 `R_TEST_RENAMED`；對應 Casbin grouping rule（v1 = `R_TEST`，user-role 關聯）的 role code 同步改為 `R_TEST_RENAMED`。
2. **Given** 場景同上，**When** 改名完成後該 role user 嘗試訪問既有授權 endpoint，**Then** 訪問成功（無 403/權限失聯）。
3. **Given** 場景同上，**When** 改名完成後 user 從 base-web 重新登入並取回 role 清單，**Then** 該 user 的 role 清單反映新的 roleCode `R_TEST_RENAMED`。
4. **Given** 管理者送 updateRole **不**改 roleCode（只改 roleName 或 status），**When** 後端執行，**Then** sys_role.code 不變、Casbin policy/grouping 規則不被觸發改動（無不必要的 SQL 寫入）。
5. **Given** base-web role 編輯抽屜內 roleCode input 維持可編輯，**When** 管理者直接修改 roleCode 並送出，**Then** 行為與 Acceptance 1 相同（W-FW3 transform-layer code-lock 已拿掉、UI 改 code 真實生效）。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 既有（W-FW6 前建立）role 的 home_route_name 為空 | menu-auth-modal 開啟時首頁下拉預填為預設值 `home`；不破壞既有 UX。 |
| E-2 | updateRoleHome 把 home 設為某個 `constant=true` 的 menu route_name（例如 `login` / `403`） | 拒絕（constant menu 是系統頁、不適合作為使用者首頁）。 |
| E-3 | updateRoleHome 把 home 設為某個 soft-deleted menu 的 route_name | 拒絕（home 必須是 active menu、避免指向已刪除的 menu）。 |
| E-4 | updateRoleHome 把 home 設為空字串 `""` 或 null | 持久化為空（明示清除 home 設定、之後讀回為空、UI 預填預設值 `home`）。 |
| E-5 | assign_routes/users 收 empty set（清空所有 menu/user 指派） | 正常執行（Sea-ORM delete_many + 0 insert）；audit 紀錄 payload_before 含完整集合、payload_after 為空集合 `[]`。 |
| E-6 | 改 role code 為一個既存 role 的 code（衝突） | 拒絕（既有 update_role unique check 涵蓋、Casbin 不被觸發）。 |
| E-7 | 改 role code 為空字串 `""` | 拒絕（既有 validation min_length 涵蓋）。 |
| E-8 | 改 role code 時 Casbin policy 同步失敗（DB 連線中斷或約束違反） | 整個 update_role 操作 rollback（sys_role.code 不變、Casbin policy 也不變、回 user 錯誤）；audit 不寫入（atomicity）。 |
| E-9 | 對同一 role 連續多次改 code（A→B→C） | 每次都正確同步 Casbin（B 改 C 時 Casbin 的 role code 從 B 變 C，不留 A 痕跡）；每次都產生對應 audit row。 |
| E-10 | base-web menu-auth-modal home 下拉選擇後送出失敗（後端 reject） | UI 顯示明確錯誤訊息、home 下拉不誤判為成功；既有 home 值不變。 |

## Requirements *(mandatory)*

### Functional Requirements

**A. N2 role home 持久化**

- **FR-001**: 後端 `sys_role` 資料表 MUST 含 home_route_name 欄；該欄 MUST 為可空；現有 role 升級後 MUST 預設為空。
- **FR-002**: 後端 MUST 提供讀取某 role 的 home 設定端點（透過 systemManage alias 路徑、與 W-FW4 一致），回傳該 role 的 home_route_name 真實值（空時回 null）。
- **FR-003**: 後端 MUST 提供寫入某 role 的 home 設定端點（透過 systemManage alias 路徑），接受 `{roleId, home}` 形式；home 為非空字串時 MUST validate 該值對應一個 active（非軟刪除、非 constant、`status=enabled`）的 menu route_name；validation 失敗 MUST 回錯誤並不寫入。
- **FR-004**: 寫入 home 設定 MUST 經 audit（產生 sys_operation_log row、payload_before/after 含整 role 快照）。
- **FR-005**: base-web menu-auth-modal 的「角色首頁」段（getHome / updateHome）MUST 接此兩端點；既有「getPages」拉全 menu route_name 清單（`/systemManage/getAllPages`）不變。
- **FR-006**: 兩個新端點 MUST 受 RBAC 保護（透過 Casbin policy seed、與既有 systemManage alias endpoint 一致；admin/super-admin 可呼叫、一般 user 拒絕）。

**B. N3 assign_routes/users audit gap**

- **FR-007**: 後端 `assign_routes`（assign menus to role）執行成功時 MUST 寫入 1 條 audit 紀錄；entity_type='sys_role'、entity_id=該 role id、operation=UPDATE；payload_before / payload_after 含「該 role + 該 domain」對應的 menu_ids 集合（whole snapshot）。
- **FR-008**: 後端 `assign_users`（assign users to role）執行成功時 MUST 寫入 1 條 audit 紀錄；entity_type='sys_role'、entity_id=該 role id、operation=UPDATE；payload_before / payload_after 含該 role 對應的 user_ids 集合（whole snapshot）。
- **FR-009**: audit 寫入 MUST 與 sys_role_menu / sys_user_role 的 insert/delete 處於同一 transaction（atomicity：txn rollback 時 audit 不寫入）。
- **FR-010**: `assign_permission`（assign API permissions to role）audit MUST NOT 在本 feature 補寫（留 W-FW8 button-auth 用到時一併補）。

**C. N4 role code 安全改名**

- **FR-011**: 後端 `update_role` MUST 偵測 role.code 變動（input 新 code 與資料庫既有 code 不同）；若偵測到變動、MUST 在同 transaction 內同步 Casbin policy 中所有「以舊 code 為 role 識別」的規則（包括 policy rule v0 欄 + grouping rule v1 欄）的對應欄位為新 code。
- **FR-012**: Casbin policy 同步失敗時整個 update_role MUST rollback（sys_role.code 不變、Casbin 不變、audit 不寫入）。
- **FR-013**: W-FW3 過渡的 transform-layer code-lock（`update_role_for_systemmanage` 把 input.role_code 替換為 existing.code）MUST 被拿掉；該 transform handler 改為直送 input.role_code 至 native UpdateRoleInput。
- **FR-014**: base-web `role-operate-drawer.vue` MUST NOT 改動（roleCode input 維持 editable；user 改 code 送出即生效）。
- **FR-015**: 改名後該 role 對應 user 仍能訪問既有授權 endpoint（W-F11 既有 Casbin redis pub-sub 機制處理 enforcer reload；本 feature 不引入新 reload 機制）。

**D. 範疇紀律**

- **FR-016**: 本 feature 對 base-web 的修改 MUST 限於 ≤ 2 檔：`menu-auth-modal.vue`（N2 接 home 端點）+ `system-manage.ts`（加 fetchGetRoleHome / fetchUpdateRoleHome service function）；MUST NOT 改動 `src/typings`、router、store、i18n key、其他頁面、版面樣式、role-operate-drawer.vue、button-auth-modal.vue。
- **FR-017**: 本 feature 對 `sys_role` 表的結構變更 MUST 限於新增 home_route_name 一欄；MUST NOT 改動 sys_role 其他欄位、其他資料表結構（casbin_rule 表結構不變、只 UPDATE 既有 row）。
- **FR-018**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B、nestjs 已退場）。
- **FR-019**: commit MUST 為多段式（base-web worktree（若有改動）+ rust-api worktree + outer SHA pin）per CLAUDE.md §4.1。
- **FR-020**: acceptance MUST 用 CDP browser smoke + curl + psql 三者覆蓋（比照 W-FW1~W-FW7 慣例）。

### Key Entities

- **角色（`sys_role`）**：admin 端定義的權限角色；本 feature 為其新增「首頁」屬性（home_route_name）的儲存能力。
- **角色首頁（`home_route_name`）**：每個 role 可設定一個「該 role user 登入後預設導向哪個 menu」的偏好；前端 vue-router 取得後用於導航。
- **菜單授權變更紀錄**：每次 assign_routes 操作前後對「某 role 的 menu 集合」的快照（用於 audit trail）。
- **使用者角色指派變更紀錄**：每次 assign_users 操作前後對「某 role 的 user 集合」的快照（用於 audit trail）。
- **角色代碼（`sys_role.code`）**：role 的不可重複識別碼（如 `ROLE_SUPER` / `R_TEST`）；本 feature 解除 W-FW3 過渡限制、讓該欄位可被安全修改。
- **Casbin 規則（`casbin_rule`）**：權限決策表；含「policy rule」（v0=role_code, v1=resource, v2=action）與「grouping rule」（v0=user_id, v1=role_code）兩種類型；本 feature 在 role.code 變動時同步維護這兩種類型對 role_code 的引用一致性。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者在 base-web 設定某 role 首頁後 100% 持久化於資料庫；下次任何管理者開啟該 role 菜單授權抽屜時首頁下拉預填 100% 對應其資料庫實際值。
- **SC-002**: 既有（W-FW6 前建立）role 開啟菜單授權抽屜時首頁下拉 100% 預填為預設值 `home`；既有授權 UX 不退化。
- **SC-003**: 設定 home 為不存在 / 軟刪除 / constant 的 menu 時，後端 100% reject（不寫入無效值）。
- **SC-004**: 每次成功的 assignRoleMenus 與 assignUsersToRole 操作 100% 在 sys_operation_log 產生 1 條對應 UPDATE 事件；audit row 的 payload_before/after 集合對得上資料庫變更前後狀態。
- **SC-005**: assign_routes/users 在 transaction rollback 時 100% 不留 audit 紀錄（atomicity）。
- **SC-006**: 改 role code 後，sys_role.code 與 Casbin 所有 policy/grouping rule 對該 role 的引用 100% 同步更新（無孤兒規則、無失聯權限）。
- **SC-007**: 改 role code 後該 role user 對既有授權 endpoint 的訪問成功率不變（無因 Casbin 失聯造成的 403）。
- **SC-008**: 既有 role/menu/user CRUD 行為（addRole / deleteRole / batchDelete / 菜單授權主路徑 / 使用者指派主路徑等）100% 不退化。
- **SC-009**: 本 feature 對 base-web 的改動限於 §4 受控範圍 ≤ 2 檔（`menu-auth-modal.vue` + `system-manage.ts`）；不改動 typings/router/store/i18n/版面；nestjs fork 0 改動。
- **SC-010**: 本 feature 對後端 schema 的變更僅為 `sys_role` 新增 home_route_name 一欄；既有 role row 100% 不受影響；casbin_rule 表結構 0 變更。

## Assumptions

- **A-001**: `sys_role` 表既有 schema 已足以支撐本 feature 的「新增 home_route_name 一欄」變更；無需先做其他 schema 重整。
- **A-002**: base-web `menu-auth-modal.vue` 既有 home stub（getHome / updateHome 是 console.log + local state mutate）的結構允許單純替換為 fetch API 呼叫，不需 modal 整體重構；getPages 已是真 API（`/systemManage/getAllPages`）不需動。
- **A-003**: base-web `Api.SystemManage` 既有型別覆蓋 home 相關的 API 回傳形狀（string / boolean）—— 本 feature service function 不需新增專屬 TypeScript 型別宣告（§4 不准動 src/typings）。**待 plan Phase 0 驗證**：home 兩端點回傳形狀是否能用 base-web 既有 `Api.SystemManage.*` 或 generic Response wrapper 表達。
- **A-004**: rust-api 既有 update_role 服務含 audit 邏輯（audit_snapshot 對整個 entity 序列化）—— 本 feature 拿掉 W-FW3 transform-layer code-lock 後、code 變動自動進 audit payload；無需新增 audit 邏輯。
- **A-005**: Casbin policy 同步以「同 transaction 內 SQL UPDATE casbin_rule」實作；W-F11 既有 redis pub-sub 機制處理多 replica enforcer reload —— 本 feature 不需新引入 reload 機制。**待 plan Phase 0 驗證**：UPDATE casbin_rule 後 W-F11 pub-sub 是否會自動觸發 enforcer reload、還是需要 application 層主動 notify。
- **A-006**: Casbin policy 中對 role code 的引用涵蓋兩種 ptype：`p`（policy rule、v0=role_code）+ `g`（grouping rule、v0=user_id 或 v1=role_code，取決於 grouping rule 設計）。**待 plan Phase 0 驗證**：W-F11 / W-FW3 / W-FW4 為 role code 同步需要 UPDATE 哪些 ptype 的哪些欄位（precedent / 既有 seed pattern）。
- **A-007**: assign_routes / assign_users 補 audit 需要 actor 參數，trait signature 變動為「append `actor: &Actor` 參數」—— callsite 改動限於 ~2-3 處（authorization api handler + systemManage transform handler）。
- **A-008**: Constitution Principle IV「W-WEBUI 受管例外」（v1.2.0）已生效（含 `W-FW1`–`W-FW7`、准動範圍含「§4 授權下最小 UI 新增」）—— 本 feature 在此例外範圍內（base-web 改 menu-auth-modal home 段 + 加 service function 都屬「最小 UI / 服務層接通」）。

## Dependencies

### Inbound（本 feature 依賴）

- **W-FW3** `role-crud-wiring`（033，merge `729dbf9`）：本 feature N4 拿掉 W-FW3 transform-layer code-lock；W-FW3 既有 role CRUD 主路徑（addRole / updateRole / deleteRole / batchDeleteRole）為 N4 改名 path 的基礎。✅
- **W-FW4** `role-authorization-wiring`（034，merge `ff5ea63`）：本 feature N2 接 menu-auth-modal 既有 home stub；W-FW4 既有的「角色菜單授權」主路徑（getRoleMenuIds + assignRoleMenus）是 N3 audit 補寫對象。✅
- **F8** `assign-users`（merge `c2b0912`）：F8 已 expose assign-users-to-role endpoint；N3 補 audit gap 涵蓋此 path。✅
- **W-F11** `rust-horizontal-scaling`（merge `d2d4c4c`）：Casbin enforcer 多 replica + redis pub-sub 機制；N4 改 role code 同步 Casbin 後依賴此機制觸發 enforcer reload。✅
- **F2.1** `audit-log-infrastructure`（merge `209a2c8`）：sys_operation_log + audit_log::write_in_txn helper；N2/N3 用此寫 audit。✅
- **Constitution v1.2.0**：Principle IV W-WEBUI 受管例外（含 W-FW6）+ §4 准動範圍納入「最小 UI 新增」。✅

### Follow-up（本 feature 範疇外）

- **W-FW8** `button-auth-completion`：W-WEBUI follow-up 軌道下一個 feature；整併 W-FW4-N1（button-auth modal 接通，需 Phase 0 research）+ 順手補 assign_permission audit；本 feature 不做、推遲處理。
