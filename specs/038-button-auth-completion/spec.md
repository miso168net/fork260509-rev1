# Feature Specification: W-FW8 — button-auth-completion（按鈕權限完整化）

**Feature Branch**: `038-button-auth-completion`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "W-FW8 button-auth modal 接通 + assign_permission audit 補寫 (W-WEBUI follow-up 收尾)"

**Source**: [`docs/superpowers/038-feature-button-auth-completion.md`](../../docs/superpowers/038-feature-button-auth-completion.md)（brainstorming 2026-05-23 session — W-WEBUI follow-up 軌道收尾 feature；4 個釐清拍板）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.2.0 列舉 `W-FW1`–`W-FW7`，**W-FW8 需 v1.3.0 amendment** 擴為 `W-FW1`–`W-FW8`，屬與 v1.2.0 同類型的條款範圍延伸；amendment 應於 plan 階段 Constitution Check 觸發前完成）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §7.2 W-FW4-N1 button-auth path + §4 base-web 修改範圍邊界。
- W-FW6 `role-authorization-completion`（037，merge `10b5bee`）：本 feature audit 體例（payload camelCase keys、entity_type='sys_role'、trait signature append `actor: &Actor`）完全比照 W-FW6 N3。
- 既有 `sys_endpoint`（migration `m20241023_091132_create_sys_endpoint.rs`，67 endpoint、12 controller、13 resource、含中文 `summary` 欄）：本 feature **複用、0 結構改動**。

## Scope summary

W-WEBUI follow-up 軌道收尾 feature。把 W-FW4 / W-FW6 過渡留下的最後 2 個 follow-up 一次補完：(A) `button-auth-modal.vue` 從 stub 接通真 backend（admin 可指派 role 的 API endpoint 權限、Casbin server-side 真實 enforce）；(B) `assign_permission` audit 補寫（W-FW6 N3 已補 `assign_routes`/`assign_users`，本 feature 補完最後一個 `assign_*`）。完成後 W-WEBUI follow-up 軌道全部清空。

| 面向 | deliverable |
|---|---|
| **A button-auth modal 接通**（主） | 3 個 `/systemManage/` alias 端點（`getAllEndpoints` / `getRoleEndpointIds/:roleId` / `assignRoleEndpoints`）+ Casbin policy seed 6 row；base-web `button-auth-modal.vue` stub 接真 API；admin 在 modal 勾選後 Casbin policy 真寫入 + 跨 replica reload + 該 role user 對未授權 endpoint 立即 deny。 |
| **B assign_permission audit 補寫**（順手） | `sys_authorization_service.assign_permission` trait + impl 末尾 append `actor: &Actor`；在 txn `commit()` 前加 `audit_log::write_in_txn`（payload_before/after JSON keys camelCase `{roleId, domain, endpointIds:[...]}`、entity_type='sys_role'、operation=UPDATE，比照 W-FW6 N3 體例）；cascade 至 ~2 callsite handler（authentication api + systemManage transform）。 |

**範疇外**：

- ❌ **Path B / Path C 等替代 backend model**（brainstorm Q2 否決，理由：Path B 純 UI hide 不夠安全；Path C 違反「收尾 feature」設定）。
- ❌ **Vue `v-permission` 指令**（推遲；admin 看 modal 已知道授權範圍、Casbin server-side enforce 不需 UI hide；加裝會超 base-web 2 檔上限）。
- ❌ `sys_endpoint` schema 改動（0 結構變更，僅讀）。
- ❌ `sys_menu.buttons` (W-FW7 JSONB) 參與 RBAC enforcement（沿用 W-FW7 Q2 拍板：persisted blob 不參與 RBAC）。
- ❌ 新 schema migration / table（唯一 migration 是 Casbin policy seed，純 data）。
- ❌ 既有 `/api-endpoint/*` admin CRUD endpoint 改動（regression 涵蓋）。
- ❌ base-web `src/typings` 改動（service function 用 primitive generic）。
- ❌ nestjs fork 改動（DESIGN-B、nestjs 已退場）。

## Clarifications

### Session 2026-05-23（brainstorming 階段拍板，共 4 項）

- **Q1（scope：A + B 是否同 feature）**：**A：都包**。A + B 同一 feature。B 屬於低成本 trait-signature cascade（同 W-FW6 N3 體例已驗證）；assign_permission service 既有實作就在本 feature 動到的檔（`sys_authorization_service.rs`），同 PR 順手補才合理。比照 W-FW6 同時整併 N2/N3/N4 體例。
- **Q2（Backend model 選擇）**：**A：Path A — 複用 `sys_endpoint` + 既有 `assign_permission`**。否決 Path B（新 `sys_role_menu_button` junction + 沿用 `sys_menu.buttons`：需新表 + 不驅動 Casbin server-side enforcement、純 UI hide 不夠安全 + 新 RBAC 子系統與 Casbin 並存維護負擔高）；否決 Path C（推遲 backend、只做 B audit：違反「收尾 feature」設定、button-auth stub 已過渡太久）。Path A 採用理由：0 新 table、複用 W-F11 既有 Casbin reload、Casbin server-side 真實 enforce、admin 行為與 effect 一致、rust ~12 處 + base-web 2 檔 = 最低 scope。UI 上看的「按鈕」實際是 API endpoint，sys_endpoint 含中文 `summary` 欄達到 acceptable 的「API operation」UX。
- **Q3（UI scope：tree 分組 / leaf label / v-permission directive）**：**A：Tree by `resource` + leaf label 用 `${summary}（${method}）`；v-permission 不做**。tree by resource 比 controller 友善（13 個 resource group：access-key / role / menu / user / auth / authorization / ... 接近「業務領域」，controller 帶 `Sys*Api` 後綴技術感較強）；leaf label 取 sys_endpoint.summary 中文業務描述、method 補後面（fallback 空 summary → `${method} ${path}`）。v-permission 推遲：base-web 改動會超 2 檔上限 + Casbin server-side enforce 已足夠（未授權 user 點按鈕 → 5001 deny + 既有 base-web 全域 error handler 顯示「無權限」toast）。
- **Q4（Endpoint 路由：重用既有 vs alias + audit 形狀）**：**A：systemManage alias 3 條全新 + audit 同 W-FW6 N3 體例**。3 alias 統一 namespace（與 W-FW3/W-FW4/W-FW6 同層級體例，base-web 只看到 `/systemManage/*` 一條 namespace）。`getAllEndpoints` 新 alias 回 NTree-friendly shape（既有 `/api-endpoint/tree` 是 admin metadata 工具 shape、不友善）；`getRoleEndpointIds` 新 alias 在 backend 做 Casbin reverse-map（既有 `/api-endpoint/auth-api-endpoint/:roleCode` 回 raw policy rows 含 v0/v1/v2/v3、要求 frontend 自行 reverse-map、細節 leak）；`assignRoleEndpoints` 新 alias transform call 既有 `assign_permission` service。audit entity_type='sys_role'（沿用 W-FW6 N3「以 role 為中心追蹤」設計）、payload camelCase `{roleId, domain, endpointIds:[...]}`（rev1 audit 慣例由 `audit_serialize.rs:8` 註解定義）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — admin 透過 modal 指派 role 的 API endpoint 權限（Priority: P1）🎯 MVP

管理者在 base-web 角色管理頁開啟某 role 的編輯抽屜，點擊「按钮权限」按鈕後出現按鈕權限 modal；modal 樹狀顯示後端定義的所有可控 API operation（依業務領域分組、葉節點顯示中文功能描述加方法）；管理者勾選需授權的 operation 後送出，該 role 的 API endpoint 權限被持久化，且立即生效——該 role 的 user 對勾選的 API operation 訪問成功、對未勾選的 API operation 訪問被拒（5001 deny）。重新開啟同一 role 的按鈕權限 modal 時，勾選狀態反映實際持久化的權限集合。

**Why this priority**：W-FW4 thin wiring 留下的最後一個 user-facing UI gap，且為 W-WEBUI follow-up 軌道收尾 feature 的主要 deliverable。`button-auth-modal.vue` UI 已存在且 functional、但 stub 自 W-FW4 起一直未接通（4 個 feature 過了仍只是硬編 mock）。本 user story 完成後 base-web 角色管理頁所有的 UI 元件（菜單樹勾選 + 首頁選單 + 按鈕權限樹）都連通實際後端 —— 整個 role 授權 UX 真正完整。本 story 可獨立交付：A 完成後即使 B 不做，admin 也能設定/讀回 role 的 API endpoint 權限、Casbin 真實 enforce。

**Independent Test**：在 `/manage/role` 開某 role 的編輯抽屜 → 點「按钮权限」→ 修改勾選 → 送出 → 重開該 modal，勾選預填一致；對照資料庫 `casbin_rule` 該 role code 的 policy rows 與勾選集合一致；用該 role 的 user token 訪問被勾選 endpoint 成功、訪問被取消 endpoint 收到 5001 deny。

**Acceptance Scenarios**:

1. **Given** 某 role 從未指派任何 endpoint 權限（Casbin policy 該 role code 為 0 row），**When** 管理者開啟其按鈕權限 modal，**Then** modal 顯示完整 endpoint 樹（按 resource 分組）、全部 unchecked；可獨立瀏覽全部 13 業務領域、67 endpoint。
2. **Given** 某 role 已有部分 endpoint 權限，**When** 管理者開啟其按鈕權限 modal，**Then** modal 樹中對應 endpoint 葉節點為 checked、未授權者為 unchecked；勾選狀態與 Casbin policy 完全對得上。
3. **Given** 管理者修改勾選並送出，**When** 後端收到請求，**Then** Casbin policy 該 role code 對應 row 集合被同步為 admin 勾選集合（diff：移除取消勾選的、新增新勾選的）；無關 row 不受影響；操作審計紀錄產生 1 條 UPDATE event。
4. **Given** 管理者改完權限，**When** 該 role 的 user 隨後對被授權的 endpoint 發送請求，**Then** 訪問成功（無 5001 deny）；對被取消授權的 endpoint 發送請求，**Then** 訪問被拒（5001 deny）；reload 不需 user 重新登入（W-F11 Casbin redis pub-sub 立即生效）。
5. **Given** 管理者送 assignRoleEndpoints 為空陣列 `[]`（清空 role 全部 endpoint 授權），**When** 後端執行，**Then** Casbin policy 該 role code 全部 row 被清除；audit 紀錄 payload_after.endpointIds = `[]`；該 role user 對所有受保護 endpoint 立即 deny（除既有自助 endpoint 不受 Casbin 約束者）。

### User Story 2 — assign_permission 操作可稽核（Priority: P2）

管理者執行 endpoint 權限指派變更（assign API endpoints to role）後，系統審計日誌 MUST 出現對應紀錄；每次變更紀錄 1 條 audit row，記錄變更前/後的完整 endpoint_id 集合（whole snapshot），方便日後追溯「哪個管理者在何時把哪些 endpoint 權限指派給/移除自哪個 role」。

**Why this priority**：純後端、無 UI 影響；補完 Constitution Principle II「全域 audit」覆蓋率（W-FW6 N3 已補 assign_routes/users 兩個 `assign_*`、剩下唯一 `assign_permission` 在 sys_authorization_service.rs 仍無 audit、是 W-FW6 deliberately 留下的最後 audit gap）。可獨立於 US1 交付：B 完成後既有 `/authorization/assign-permission` raw 端點直接 call 也會產生 audit trail（不必透過 US1 modal）。

**Independent Test**：用 curl 對某 role 直接 call `/authorization/assign-permission`（不透過 systemManage transform）後，psql 查 `sys_operation_log` 應有對應 1 row、payload_before / payload_after 含 endpoint_ids 集合差異正確；多次連續 assign 應各有對應 audit row；txn rollback 場景無 audit 紀錄。

**Acceptance Scenarios**:

1. **Given** 某 role 既有 endpoint 權限對應 5 個 endpoint id，**When** 管理者送 assign_permission 改為 7 個 endpoint id（與既有有交集），**Then** 系統審計紀錄產生 1 條 UPDATE 事件、entity_type='sys_role'、entity_id=該 role；payload_before 含 `endpointIds: [...5個既有id]`、payload_after 含 `endpointIds: [...7個新id]`；whole snapshot 而非 diff。
2. **Given** 場景同上、不變動集合（送同樣 endpoint id 集合），**When** 後端執行，**Then** 仍產生 1 條 audit 事件（payload_before == payload_after）；與 W-FW6 N3 assign_routes/users 一致行為。
3. **Given** 某次 assign_permission 操作在 transaction 中途失敗（如 bogus endpoint_id 觸發 service 內 validation 失敗導致 rollback），**When** rollback 完成，**Then** 對應 audit 紀錄**不**寫入；Casbin policy 不變；與 sys_role_menu / sys_user_role 變動的 txn 原子性同邏輯。
4. **Given** B 已落地，**When** grep `audit_log::write_in_txn` 在 `sys_authorization_service.rs`，**Then** 應命中 3 處（assign_routes + assign_users + 本 feature 新加的 assign_permission），與 W-FW6 留下的 N3 補寫狀態一致；不應有第 4 處。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 既有（W-FW8 前未授權）role 開啟按鈕權限 modal | 全 endpoint 葉節點 unchecked；modal 開啟不報錯；不破壞既有 UX。 |
| E-2 | 某 endpoint 軟刪除（`sys_endpoint.deleted_at` 設值）後 admin 開 modal | modal 樹不顯示該已刪 endpoint（既有 `sys_endpoint_service` 已過濾 `deleted_at IS NULL`）；若 role 既有授權含該 endpoint，後續 assignRoleEndpoints 不影響 Casbin 該 row（仍存在但軌道外，會在下次 admin 顯式取消勾選時清除）。 |
| E-3 | admin 送 assignRoleEndpoints 含部分 bogus endpoint_id（DB 查不到該 id 或已軟刪） | service 內部 SELECT WHERE deleted_at IS NULL 過濾掉、合法 endpoint 仍照常寫入 Casbin policy（部分成功、與既有 `assign_permission` 行為一致）；audit payload_after 反映實際寫入集合（不含 bogus 過濾掉者）。 |
| E-4 | admin 送 assignRoleEndpoints 空陣列 `[]`（清空） | 正常執行；Casbin policy 該 role code 全部 row 被清除；audit `endpointIds:[]`。 |
| E-5 | 同時兩個 admin 開同一 role 的 modal、各自勾選不同集合、先後送出 | 後送的 admin 操作覆蓋先送的（last-write-wins，與既有 assign_permission 行為一致）；audit 紀錄保留兩次操作以供追溯。 |
| E-6 | 該 role code 後續被改名（W-FW6 N4 路徑） | Casbin policy v0 同步改名（W-FW6 N4 既有機制），既有 endpoint 授權保留；button-auth modal 仍能正常開啟 + 顯示原授權集合（不退化）。 |
| E-7 | GeneralUser token 呼叫 3 個 alias 端點 | 5001 RBAC deny（前提：A2 Casbin policy seed 只 seed ROLE_SUPER + ROLE_ADMIN 兩個 role × 3 alias = 6 row、不 seed ROLE_USER）。 |
| E-8 | 多 replica 場景下 admin 改完權限 | `assign_permission` 既有 commit 後 `notify_casbin_changed()` 透過 redis publish invalidate channel；其他 replica 立即 reload Casbin policy；該 role user 對 endpoint 訪問結果在所有 replica 一致。 |
| E-9 | role 已軟刪（`sys_role.deleted_at` 設值）後仍呼叫 assignRoleEndpoints | service 內部 `check_domain_and_role` validate role 必須 active（既有 behavior）；reject with RoleNotFound 4001；audit 不寫入。 |
| E-10 | base-web modal 送出失敗（network error 或 envelope 非 0） | modal 顯示明確錯誤 toast「更新失敗」；勾選 state 維持不變；既有 Casbin policy 不變；可重試。 |

## Requirements *(mandatory)*

### Functional Requirements

**A. button-auth modal 接通**

- **FR-001**: 後端 MUST 提供讀取所有可控 API endpoint 的端點（透過 systemManage alias 路徑），回應 MUST 為 tree shape、根節點按 resource 分組（13 業務領域、67 endpoint）、葉節點含 `id`（sys_endpoint.id）、`label`（`${summary}（${method}）` 或 fallback `${method} ${path}`）、`method`、`path`；既有軟刪除（deleted_at IS NOT NULL）的 endpoint MUST 被過濾。
- **FR-002**: 後端 MUST 提供讀取某 role 已指派 endpoint id 集合的端點（透過 systemManage alias 路徑），回應 MUST 為 `Vec<String>`（sys_endpoint.id 集合）；後端 MUST 在內部完成 Casbin policy rows（v0=role_code, v2=path, v3=method）到 sys_endpoint.id 的 reverse-map（不暴露 Casbin 細節給 frontend）；role 不存在 / 已軟刪 MUST reject。
- **FR-003**: 後端 MUST 提供寫入某 role 的 endpoint 權限端點（透過 systemManage alias 路徑），接受 `{roleId, endpointIds}` 形式；transform handler MUST 把 endpointIds 傳給既有 `assign_permission` service；既有 service 行為（sync_role_permissions diff + Casbin add/remove + notify_casbin_changed）MUST 保持不變。
- **FR-004**: 寫入 endpoint 權限 MUST 經 audit（產生 sys_operation_log row、payload_before/after 含 endpoint_ids 集合）。
- **FR-005**: base-web `button-auth-modal.vue` MUST 接此三端點；既有硬編 mock buttons 與 console.log getAllButtons/getChecks MUST 移除；modal 開啟時並行 fetch 全 endpoint tree + 該 role 已授權 id 集合 + render NTree + setLoading；勾選送出 MUST call assignRoleEndpoints + 處理 envelope error；成功 MUST 顯示 toast「更新成功」。
- **FR-006**: 三個新 systemManage alias 端點 MUST 受 RBAC 保護（透過 Casbin policy seed 6 row、與既有 systemManage alias endpoint 一致；admin/super-admin 可呼叫、一般 user 拒絕）。

**B. assign_permission audit 補寫**

- **FR-007**: 後端 `sys_authorization_service.assign_permission` 執行成功時 MUST 寫入 1 條 audit 紀錄；entity_type='sys_role'、entity_id=該 role id、operation=UPDATE；payload_before / payload_after 含「該 role + 該 domain」對應的 endpoint_ids 集合（whole snapshot；camelCase keys `{roleId, domain, endpointIds:[...]}`）；endpoint_ids 集合應為**有效**的 sys_endpoint.id（已過濾軟刪 / 不存在者），與實際寫入 Casbin policy 對應。
- **FR-008**: audit 寫入 MUST 與 Casbin policy 變更處於同一 transaction（atomicity：txn rollback 時 audit 不寫入；與 W-FW6 N3 assign_routes/users 同邏輯）。
- **FR-009**: 既有 `sys_authorization_service.assign_routes` / `assign_users` audit 路徑 MUST NOT 退化（W-FW6 N3 已落地不重做）。
- **FR-010**: trait + impl signature 變動 MUST cascade 至所有 callsite（依現有 codebase grep ~2 處：sys_authentication_api `assign_permission` handler + 本 feature 新增 sys_system_manage_api `assignRoleEndpoints` transform handler）。

**C. 範疇紀律**

- **FR-011**: 本 feature 對 base-web 的修改 MUST 限於 ≤ 2 檔：`button-auth-modal.vue`（接 3 endpoint、替換硬編 mock）+ `system-manage.ts`（加 3 service function、無新型別）；MUST NOT 改動 `src/typings`、router、store、i18n key、其他頁面、版面樣式、role-operate-drawer.vue、menu-auth-modal.vue。
- **FR-012**: 本 feature MUST NOT 改動 `sys_endpoint` 表結構、`sys_menu` 表結構、`casbin_rule` 表結構或任何其他 schema；唯一 migration 是 Casbin policy seed（純 data、6 row、含對稱 down）。
- **FR-013**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B、nestjs 已退場）。
- **FR-014**: 本 feature MUST NOT 加 Vue `v-permission` 指令或對既有 base-web 頁面套用 permission 篩選邏輯（推遲；Casbin server-side enforce 已涵蓋功能）。
- **FR-015**: commit MUST 為多段式（base-web worktree + rust-api worktree + outer SHA pin）per CLAUDE.md §4.1。
- **FR-016**: acceptance MUST 用 CDP browser smoke + curl + psql 三者覆蓋（比照 W-FW1~W-FW7 慣例）。
- **FR-017**: Constitution v1.3.0 amendment MUST 在 plan 階段 Constitution Check 觸發前完成（把 Principle IV 受管例外列舉從 `W-FW1`–`W-FW7` 擴為 `W-FW1`–`W-FW8`）。

### Key Entities

- **API endpoint（`sys_endpoint`）**：可控 API operation 的後端定義。每個 endpoint 含 `id` / `path` / `method` / `action` / `resource` / `controller` / `summary` / 軟刪除欄。本 feature **複用、0 結構改動**——僅在 base-web 端被 admin 透過 modal 可視化為「按鈕」。
- **角色按鈕授權變更紀錄**：每次 assign_permission 操作前後對「某 role 的 endpoint 集合」的快照（用於 audit trail）。
- **Casbin 規則（`casbin_rule`）**：權限決策表既有 schema 不動；本 feature 透過既有 `assign_permission` service 的 `sync_role_permissions` helper diff/add/remove policy rows（v0=role_code, v1=domain, v2=path, v3=method）。
- **角色（`sys_role`）**：admin 端定義的權限角色；本 feature 為 audit entity_type='sys_role'（以 role 為中心追蹤、與 W-FW6 N3 一致）；不對 sys_role 結構或 CRUD 行為作任何變更。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者在 base-web 完成按鈕權限指派後，該 role 的 user 對被授權 endpoint 的訪問成功率為 100%；對被取消授權 endpoint 的訪問拒絕率為 100%。
- **SC-002**: admin 開啟某 role 按鈕權限 modal 後，勾選狀態與資料庫實際 Casbin policy 對得上的比例為 100%；無 role 出現「modal 顯示已勾選但 API 拒絕」或「modal 顯示未勾選但 API 通過」的不一致。
- **SC-003**: 多 replica 部署環境下，admin 改完按鈕權限後，**任一** replica 對該 role user 的訪問判斷結果在 5 秒內全部一致（W-F11 既有 redis pub-sub reload 機制保障）。
- **SC-004**: 每次成功的 assign_permission 操作（透過 modal 或直接 curl）100% 在 sys_operation_log 產生 1 條對應 UPDATE 事件；audit row 的 payload_before/after 集合對得上資料庫實際變更前後 Casbin policy 狀態。
- **SC-005**: assign_permission 在 transaction rollback 時 100% 不留 audit 紀錄（atomicity）。
- **SC-006**: 既有 role/menu/user CRUD 行為、role home 設定（W-FW6 N2）、role code 改名（W-FW6 N4）、角色菜單授權（W-FW4 / 既有 assignRoleMenus）、角色使用者指派（F8 / assign_users）100% 不退化。
- **SC-007**: 本 feature 對 base-web 的改動限於 §4 受控範圍 ≤ 2 檔（`button-auth-modal.vue` + `system-manage.ts`）；不改動 typings/router/store/i18n/版面；nestjs fork 0 改動。
- **SC-008**: 本 feature 對後端 schema 的變更為 0（無 schema migration）；唯一 migration 是 Casbin policy seed（純 data、6 row、對稱 down 可回退、不影響既有 row）。
- **SC-009**: 對既有未授權 button-auth 的 role（W-FW8 前已存在）開啟 modal，UI 顯示為「全 unchecked」、不報錯；既有授權 UX 不退化。
- **SC-010**: button-auth-modal stub（硬編 10 mock buttons + console.log getAllButtons/getChecks）100% 被移除；不留死 code。

## Assumptions

- **A-001**: `sys_endpoint` 表既有 schema（67 endpoint、12 controller、13 resource、含中文 `summary` 欄）已足以支撐本 feature 的「modal 顯示」需求；無需先做 schema 重整或補資料。**已驗證**（brainstorm explore 階段 psql 查證）。
- **A-002**: base-web `button-auth-modal.vue` 既有結構（NTree + checkable + 取消/确认 footer）允許單純替換硬編 mock 為 fetch API 呼叫，不需 modal 整體重構。
- **A-003**: rust-api 既有 `sys_endpoint_service` 含「列出全部 active endpoint」能力（如 `find_all_active` 或對等 fn）；如無、本 feature 在 alias transform handler 中直接 Sea-ORM query 即可（簡單 SELECT WHERE deleted_at IS NULL）。**待 plan Phase 0 驗證**。
- **A-004**: rust-api 既有 `assign_permission` service 含 Casbin policy diff + add/remove + notify_casbin_changed 完整邏輯（W-F11 既有）；本 feature 不引入新 reload 機制。
- **A-005**: Constitution v1.3.0 amendment 為 Principle IV 列舉範圍延伸（W-FW7 → W-FW8）、屬於與 v1.2.0 同類型的範圍擴充、不引入新例外條款；amendment 工作量低、可在 plan 階段 Constitution Check 前快速完成。
- **A-006**: base-web `Api.SystemManage` 既有型別 OR generic Response wrapper 可覆蓋本 feature 三 service function 回應形狀；不需新增 `Api.SystemManage.*` 型別宣告（§4 不准動 src/typings）。**待 plan Phase 0 驗證**：getAllEndpoints 回 tree shape 是否能用 base-web 既有型別表達、或用 primitive generic `request<unknown[]>` 即可。
- **A-007**: assign_permission audit 補寫的 actor 參數 cascade 限於 ~2 處 callsite（sys_authentication_api 既有 `assign_permission` handler + 本 feature 新加 sys_system_manage_api transform handler）；同 W-FW6 N3 體例。

## Dependencies

### Inbound（本 feature 依賴）

- **W-FW4** `role-authorization-wiring`（034，merge `ff5ea63`）：本 feature 接通的 `button-auth-modal.vue` 是 W-FW4 brainstorm Q1 推遲下來的 follow-up；role-operate-drawer.vue 開啟 modal 的入口（「按钮权限」按鈕）為 W-FW4 既有。✅
- **W-FW6** `role-authorization-completion`（037，merge `10b5bee`）：本 feature audit 體例（trait signature append `actor: &Actor`、payload camelCase keys、entity_type='sys_role'、in-txn before commit）完全比照 W-FW6 N3 assign_routes/users。✅
- **W-F11** `rust-horizontal-scaling`（merge `d2d4c4c`）：Casbin enforcer 多 replica + redis pub-sub 機制；既有 `assign_permission` 末段已呼叫 `notify_casbin_changed()` 觸發 enforcer reload；本 feature 不引入新 reload 機制。✅
- **F2.1** `audit-log-infrastructure`（merge `209a2c8`）：sys_operation_log + audit_log::write_in_txn helper；本 feature B 部分用此寫 audit。✅
- **sys_endpoint 既有資料**：migration `m20241023_091132_create_sys_endpoint.rs` + 後續 seed migration，本 feature 0 schema 改動、僅讀。✅
- **Constitution v1.2.0 → v1.3.0**：v1.3.0 amendment 把 Principle IV 受管例外列舉擴 W-FW8；屬本 feature 範疇內前置工作（不視為 inbound 依賴、視為 plan 階段 pre-gate）。

### Follow-up（本 feature 範疇外）

- **W-FW9 candidate（不排）**：Vue `v-permission` 指令；若日後決定加，視為新 W-FW 軌道 reopen；現階段不排（Casbin server-side enforce 已足夠、UX 微差優化優先順位低）。
- **W-WEBUI follow-up 軌道**：W-FW8 落地後**全部清空**；剩餘整合 backlog 在 W-WEBUI 軌道外（observability W-F12/13/14、W-F6b acme.sh 真實 cert、F1.2 JWT algorithm、F2.2 audit outbox、base-web TS `id` 型別債）。
