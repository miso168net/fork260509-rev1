# W-FW8 button-auth-completion — brainstorm spec-design

**Feature 編號**：038（spec-kit 階段 A 起手取得 `specs/038-button-auth-completion/`）
**短名**：`button-auth-completion`
**軌道**：W-WEBUI follow-up 軌道**收尾 feature**（W-FW6 之後第四個 / 最後一個 follow-up；W-FW8 完成後 W-WEBUI follow-up 軌道清空）
**Brainstorm 日期**：2026-05-23
**Source 整併項**（W-FW6 brainstorm 與 W-FW4 brainstorm 留下的最後 2 個 W-WEBUI follow-up）：
- **W-FW4-N1**：button-auth modal 接通（W-FW6 brainstorm Q1 拆分時推遲，理由：需 Phase 0 research 評估 backend model 路線）
- **W-FW6 Q4 順手項**：`sys_authorization_service.assign_permission` audit 補寫（W-FW6 brainstorm 拍板「assign_permission 未透過 base-web 暴露、YAGNI、留 W-FW8 動到時一併補」）

**範疇外（沿用既有設計、不重新規劃）**：
- **新 RBAC 子系統**：Path B（`sys_menu.buttons` JSONB + 新 `sys_role_menu_button` 關聯表）+ Path C（純前端 v-permission directive）皆否決，採 **Path A 複用 `sys_endpoint` + 既有 `assign_permission`**。
- **Vue `v-permission` 指令**：推遲（base-web 改動會超 2 檔 + 需 Constitution 修訂；admin 看 button-auth modal 已知道授權範圍；Casbin server-side enforce 即足夠）。
- **nestjs fork 改動**：DESIGN-B、nestjs 已退場。
- **新 schema / table / migration**：Path A 0 新 table。

**Authoritative parents**：
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.2.0，列舉 `W-FW1`–`W-FW7`；W-FW8 嚴格說不在列舉內）。**本 feature 需要 Constitution v1.3.0 amendment**：把列舉擴為 `W-FW1`–`W-FW8`（amendment 性質與 v1.2.0 同——§7 follow-up 切分延續、W-FW6 brainstorm Q1 拍板「W-FW8 = W-FW4-N1 button-auth 推遲」即此 feature 來源）。amendment 應於 spec-kit 階段 A `/speckit-specify` 或 plan 階段 Constitution Check 觸發前完成。base-web 改 ≤ 2 檔且皆在 §4 准動範圍。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §7.2 W-FW4-N1 button-auth path + §4 base-web 修改範圍邊界。
- W-FW6 `role-authorization-completion`（037，merge `10b5bee`）：本 feature 之 audit 體例（payload camelCase keys、entity_type='sys_role'、trait signature append `actor: &Actor` 末尾參數）完全比照 N3。
- W-F11 `rust-horizontal-scaling`（merge `d2d4c4c`）：Casbin enforcer 多 replica reload；既有 `assign_permission` 末段已呼叫 `notify_casbin_changed`（本 feature 不重做、保留）。
- 既有 `sys_endpoint` schema（migration `m20241023_091132_create_sys_endpoint.rs`，67 endpoint、12 controller、13 resource、含中文 `summary` 欄）：本 feature **複用、0 改動**。

---

## 1. 範疇

W-WEBUI follow-up 軌道收尾 feature。把 W-FW4 / W-FW6 過渡留下的最後 2 個 follow-up 一次補完：(A) button-auth modal 從 stub 接通真 backend（admin 可指派 role 的 API 權限、Casbin server-side 真實 enforce）；(B) `assign_permission` audit 補寫（W-FW6 N3 已補 assign_routes/users、本 feature 補完最後一個 `assign_*`）。完成後 W-WEBUI follow-up 軌道全部清空，rev1 可進 observability（W-F12/13/14）或 P5 後續。

| 子項 | deliverable |
|---|---|
| **A button-auth modal 接通**（主） | 3 個 `/systemManage/` alias 端點（getAllEndpoints / getRoleEndpointIds/:roleId / assignRoleEndpoints）+ 對應 Casbin policy seed 6 row；base-web `button-auth-modal.vue` stub 接真 API（fetchGetAllEndpoints / fetchGetRoleEndpointIds / fetchAssignRoleEndpoints）；admin 可在 modal 勾選 → 真寫 Casbin policy → 跨 replica reload → 該 role user 對未授權 API 立即 403/5001 deny。 |
| **B assign_permission audit 補寫**（順手） | `sys_authorization_service.assign_permission` trait + impl signature 末尾 append `actor: &Actor`；在 txn `commit()` 前加 `audit_log::write_in_txn`（payload_before/after JSON keys camelCase `{roleId, domain, endpointIds:[...]}`、entity_type='sys_role'、operation=UPDATE，比照 W-FW6 N3 體例）；cascade 至 ~2 callsite handler（sys_authentication_api + sys_system_manage_api transform）。 |

### 範疇外

- ❌ **Path B / Path C 等替代 backend model**（推遲考慮）—— 見 §2 Q2 拍板理由
- ❌ **Vue `v-permission` 指令** —— 推遲；admin 看 modal 已知道授權範圍、Casbin server-side 真實 enforce 不需 UI hide
- ❌ **sys_endpoint schema 改動** —— 0 改動，僅讀（複用）
- ❌ **sys_menu.buttons (JSONB W-FW7) 在 button-auth 中使用** —— 該欄保持「persisted blob 不參與 RBAC enforcement」設計（W-FW7 Q2 拍板）
- ❌ **新 schema migration / table** —— 0 新 table；唯一 migration 是 Casbin policy seed（A2，6 row、data migration、無 schema 變更）
- ❌ **既有 `/api-endpoint/*` admin CRUD endpoint 改動** —— 不動（仍可直接 call、regression 涵蓋）
- ❌ **base-web `src/typings` 改動** —— 不動（service function 用 primitive generic / 既有 `Api.SystemManage.MenuButton` 型別不擴）
- ❌ **nestjs fork 改動** —— DESIGN-B、nestjs 已退場

---

## 2. Brainstorm 拍板紀錄（2026-05-23）

### Q1 — W-FW8 scope（A button-auth + B assign_permission audit 是否同 feature）

**A：都包**。A + B 同一 feature。理由：

- B 屬於低成本 trait-signature cascade（同 W-FW6 N3 體例已驗證）；assign_permission service 既有實作就在本 feature 動到的檔（`sys_authorization_service.rs`），同 PR 順手補才合理。
- 若拆 B 為獨立 follow-up，會留剩孤兒 backlog（W-FW8 是 W-WEBUI follow-up 軌道收尾、不想再留尾巴）。
- 比照 W-FW6 同時整併 N2 / N3 / N4 體例。

### Q2 — Backend model 選擇（Path A / B / C，W-FW6 brainstorm Q1 預註 3 候選）

**A：Path A — 複用 `sys_endpoint` + 既有 `assign_permission`**。理由與 path 取捨：

| Path | 設計 | Pros | Cons | 決策 |
|---|---|---|---|---|
| **Path A** | base-web modal 直接列 sys_endpoint 為 tree（by resource）；admin 勾 endpoint → call 既有 `assign_permission`（已寫 Casbin policy）。 | 0 新 table；複用 W-F11 既有 Casbin reload 機制；Casbin server-side 真實 enforce（不只 UI hide）；admin 行為與 effect 一致；rust ~12 處（含 service trait/impl/handler/router/seed/DTO，細節見 §3 表）+ base-web 2 檔 = 最低 scope。 | UI 上看的「按鈕」實際是 API endpoint，非完全 UI button 語意。但 sys_endpoint 含中文 `summary` 欄（如「获取访问密钥列表」「分配权限」），UX 上是 acceptable 的 "API operation" 表達。 | ✅ **採用** |
| **Path B** | 新 `sys_role_menu_button` junction（role_id, menu_id, button_code）；用 W-FW7 持久化的 `sys_menu.buttons` JSONB 作為 button source；新 3 個 endpoint。 | UX 上完全 UI-aligned（button-by-menu）。 | 需新 table + migration + 3 個新 endpoint + ~25 處工作；**該 model 不驅動 Casbin server-side enforcement**（純 UI hide，admin 期待「拒絕按鈕點擊 = 拒絕 API call」會被打破）；新 RBAC 子系統會與 Casbin enforcement 重複，未來維護成本高。 | ❌ 否決 |
| **Path C** | 推遲 backend、只做 B audit；A 留 W-FW9。 | 工作量最小。 | W-FW8 變成只半補窟窿 + W-WEBUI follow-up 軌道再留尾巴。違反「收尾 feature」設定。 | ❌ 否決 |

**Path A 設計核心**：admin 在 modal 看到的「按鈕」就是 API endpoint（語意：「該 role 可以呼叫的 API 操作」）。透過既有 `sys_endpoint.summary`（如「获取访问密钥列表」「修改密码」「分配权限」）+ tree by `resource`（access-key / role / user / auth / ...）達成 user-friendly。Casbin 端 `assign_permission` 已有完整 enforcement 機制（W-F11 多 replica reload），不重造輪子。

### Q3 — UI scope（tree 分組 / leaf label / v-permission directive）

**A：Tree by `resource` + leaf label 用 `summary`；v-permission 不做**。理由：

- **tree by resource** vs **by controller**：選 resource 是因為它語意上接近「業務領域」（access-key / role / menu / user / auth / authorization / ...），controller 帶 `Sys*Api` 後綴技術感較強。13 個 resource group 在 modal 內可一次展開瀏覽（67 endpoint 量級剛好）。
- **leaf label `${summary}（${method}）`**：summary 含中文業務描述、admin 可讀；method 補在後面提供細節（明確區分 GET vs POST vs DELETE）。fallback：若某 endpoint summary 為空（不應該、但保險）→ 用 `${method} ${path}` 顯示。
- **v-permission directive 推遲**：base-web 加 Vue 指令會牽動：(a) `src/typings` 加宣告；(b) directive 全域 register；(c) 多個現有頁面套用；(d) Constitution 修訂為 v1.3.0（W-WEBUI 准動範圍納入 directive 加裝）。工作量遠超 W-FW8 本 feature 範圍。**Casbin server-side enforce 已足夠**——admin 完成 button-auth 後，未授權 user 點按鈕觸發的 API call 會回 5001 deny + 既有 base-web 全域 error handler 顯示「無權限」toast。UX 上「先 hide 比點了 deny」是微差優化，留 W-FW9 或不做都行。

### Q4 — Endpoint 路由（重用 vs alias）+ Audit 形狀

**A：systemManage alias 3 條全新（不重用既有 `/api-endpoint/*`）+ audit 同 W-FW6 N3 體例**。理由：

- **systemManage alias namespace 一致性**：與 W-FW3 (user CRUD)、W-FW4 (role menu auth)、W-FW6 (role home / role rename) 同層級體例，base-web 只看到 `/systemManage/*` 一條 namespace、不跨 `/api-endpoint/*`（前者是 admin 系統管理、後者是 API metadata 工具）。
- **getAllEndpoints alias**：雖然既有 `/api-endpoint/tree` 已存在，但其回應形狀為「API metadata 管理」shape（含 controller / action / created_at 等），不適合直接 feed NTree。新 alias 回 friendly tree shape `[{key, label, isLeaf, children/method/path}]`。
- **getRoleEndpointIds alias**：既有 `/api-endpoint/auth-api-endpoint/:roleCode` 回 raw Casbin policy rows（含 `v0/v1/v2/v3`），base-web 要自行 reverse-map（v2 path + v3 method → sys_endpoint.id）才能 set NTree checked-keys。新 alias 在 backend 做 reverse-map、回 `Vec<String>` 直接 set checked-keys，避免 frontend Casbin 細節 leak。
- **assignRoleEndpoints alias**：transform handler call 既有 `assign_permission` service，但暴露 `roleId` 介面（與 base-web `props.roleId` 對齊），不暴露 `domain`（由 user.domain() 取）。

- **Audit entity_type='sys_role'**：W-FW6 N3 deliberately 把 role 的關聯類 audit（assign_routes / assign_users）歸到 `sys_role` 父實體（以 role 為中心追蹤），不沿 sys_user_service.rs 用「關聯表名稱」(sys_user_role)。本 feature 同樣用 `sys_role` 保持一致性。
- **Audit payload camelCase**：`{roleId, domain, endpointIds: [...]}`，比照 W-FW6 N3（W-FW6 code review 修正過、確定 camelCase 是 rev1 audit 慣例、由 `audit_serialize.rs:8` 註解定義）。

---

## 3. 改動量量級

| 層 | 元件 | 個數 |
|---|---|---|
| rust-api migration | A2 Casbin policy seed | 1 新 data migration（6 row：ROLE_SUPER + ROLE_ADMIN × 3 alias）|
| rust-api input DTO | `SystemManageAssignRoleEndpointsInput` | 1 新 struct（`server/model/src/admin/input/sys_role.rs` 或 sys_authorization.rs）|
| rust-api service | `sys_authorization_service.assign_permission` 改造 | trait + impl 各 1（append actor + audit_log::write_in_txn）|
| rust-api API handler | `sys_system_manage_api.rs` 加 3 transform + `sys_authentication_api.rs` cascade | 3 新 + 1 cascade |
| rust-api router | `sys_system_manage_route.rs` 3 條新 alias | 3 register + 3 RouteInfo |
| base-web service | `src/service/api/system-manage.ts` 加 3 fn | 3 export |
| base-web modal | `src/views/manage/role/modules/button-auth-modal.vue` 拿掉硬編 mock + 接真 wire | 1 檔大改 |
| nestjs | — | 0（DESIGN-B、不動）|
| 新 schema migration | — | 0（純 data seed）|

**rust-api 總量 ~12 處 + 1 data migration；base-web 2 檔。**

---

## 4. Constitution 對照

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | 3 新 alias 受 Casbin 保護（A2 seed 6 row）、與既有 systemManage alias 一致。`assign_permission` 本身既有 Casbin enforcement 機制，本 feature 不弱化。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | B 補完 sys_authorization_service.rs 三個 `assign_*` 中最後一個（assign_permission），補完 W-FW6 留下的最後 audit gap。Casbin policy UPDATE 為 side effect、屬「跨資源 side effect」範疇、Principle II 不要求 audit（同 W-FW6 N4 update_role Casbin sync 設計）。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP/RPC。Casbin 同步透過既有 enforcer API；reload 透過 W-F11 既有 redis pub-sub channel。3 alias 端點 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW8 屬 **W-WEBUI 軌道受管例外**（Constitution IV v1.2.0 列舉 `W-FW1`–`W-FW7`，**W-FW8 不在內、需 v1.3.0 amendment 擴為 `W-FW1`–`W-FW8`**——同 §7 follow-up 切分性質、與 v1.2.0 同類型的條款範圍延伸）。amendment 應於 spec-kit 階段 A 或 plan 階段 Constitution Check 觸發前完成。base-web 改 ≤ 2 檔：`button-auth-modal.vue`（接 3 endpoint、替換硬編 mock、無新 UI render 結構，是 stub-replacement）+ `system-manage.ts`（加 3 service function、無新型別）；不動 typings/router/store/i18n/版面/role-operate-drawer.vue/menu-auth-modal.vue。v-permission 推遲、不在本 feature 範圍。 | ⚠️ 待 v1.3.0 amendment 後 PASS |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態）；rust-only。0 schema migration；DB 變更僅 Casbin policy 6 row data seed、可對稱回退。0 新 table。「複用 sys_endpoint」符合「漸進收縮」精神——既有 RBAC 能力（API endpoint 權限）直接套上 UI，避免新增 RBAC 子系統的維護負擔。 | ✅ PASS |

**Gate 結果**：4 principle (I/II/III/V) 已 PASS、Principle IV 待 Constitution v1.3.0 amendment 後 PASS（amendment 為 §7 follow-up 切分延續、低風險、條款範圍延伸性質與 v1.2.0 同）。amendment 完成後 Phase 1 plan 階段 `Complexity Tracking` 將留空。

---

## 5. 範疇外詳細記錄（解決將來人的疑問）

### Path B / Path C 為何否決（W-FW6 brainstorm Q1 預註 3 候選的細節）

- **Path B（sys_menu.buttons + 新 junction）**：W-FW7 已把 `buttons` JSONB 加上 sys_menu、設計上**刻意不參與 RBAC enforcement**（W-FW7 brainstorm Q2 拍板：「persisted blob 但不進 RouteMeta 也不影響 Casbin」）。若 Path B 採用，等於：(a) 把 W-FW7 的「persisted blob」設計推翻變成 enforcement source；(b) 新 RBAC 子系統與既有 Casbin 並存（雙 enforcement 路徑），維護成本高且容易出 inconsistency bug；(c) 純 UI hide 不夠安全（admin 期待點不到按鈕 = 對應 API call 也應該被拒絕）。否決。

- **Path C（推遲 backend、只做 B audit）**：違反 W-FW8 設定為「W-WEBUI follow-up 軌道收尾 feature」的意圖，會再留尾巴 W-FW9；且 button-auth modal stub 已過渡太久（從 W-FW4 起 4 個 feature 都沒接通），admin UI 上看到「按鈕权限」按鈕卻是 mock 不合理。否決。

### v-permission directive 為何推遲

- 工作量超 W-FW8 範圍（typings / global register / 多頁面 use site / Constitution 修訂）。
- Casbin server-side enforce 已涵蓋功能（admin 完 button-auth → user 點未授權按鈕 → 5001 deny → 既有 base-web 全域 error handler 顯示「無權限」toast）。
- UX 微差優化（先 hide vs 點了 deny），優先順位低。
- 若日後決定加，可作為獨立 W-FW9 或不做。

### 為何 entity_type 不用 sys_user_role / sys_role_endpoint

- W-FW6 N3 brainstorm 的 code review 已討論：`sys_user_service.rs:362` 既有 precedent 用 `sys_user_role`（關聯表名），但 W-FW6 deliberately 選 `sys_role` 父實體（以 role 為中心追蹤、便於 query「該 role 的 audit history」）。本 feature 沿用 `sys_role` 保持 W-WEBUI 軌道內部一致。

### 為何不重用 `/api-endpoint/tree` + `/api-endpoint/auth-api-endpoint/:roleCode`

- 雖然 0 新 backend 工作量更小、但：(a) 兩個既有端點是 admin API metadata 工具的一部分（CRUD endpoint）、不是 systemManage 系統管理 alias；(b) 既有 endpoint 回應形狀對 NTree 不 friendly，base-web 要自己 reverse-map Casbin policy rows 才能 set checked-keys（細節 leak、複雜度遷移到 frontend）。3 alias 統一 namespace + 在 backend 做 reverse-map 是更好的 separation of concern。

---

## 6. spec-kit 階段 A 起手後可預期的 spec 框架

階段 A `/speckit-specify` 入口（本檔作為 input）會產出 `specs/038-button-auth-completion/`：

- `spec.md` —— User Stories：US1 = button-auth modal 接通（P1 MVP）、US2 = assign_permission audit 補寫（P2）
- `plan.md` —— Constitution Check 5/5 PASS（如本檔 §4）；Phase 0 research：R-Q1 base-web 既有 `Api.SystemManage.MenuButton` 型別可否覆蓋本 feature 的 endpoint tree 形狀（R-Q1 預期：用 primitive generic、不動 typings、同 W-FW6 R-Q1 體例）；R-Q2 既有 `sys_endpoint.tree` service fn 形狀對 NTree 是否直接可 feed（預期：不直接、需轉 shape）；R-Q3 Casbin policy reverse-map 規則（v2=path+v3=method → endpoint.id 的 unique key 是否 OK，預期：是、sys_endpoint(path, method, deleted_at IS NULL) 為 unique）
- `data-model.md` —— 元件清單 A2 Casbin seed + B1 DTO + B2 service 改造 + C1 3 transform handler + C2 cascade + D1 router 註冊 + E1 base-web 3 service fn + E2 modal 接線
- `contracts/verification-commands.md` —— C-V matrix（~22 條，如本檔 §5 Testing 段預列）
- `quickstart.md` —— dev stack 啟動 + 帳號 + 逐 C-V 跑法
- `tasks.md` —— 由 `/speckit-tasks` 產出 dependency-ordered 任務清單

---

## 7. 驗收（acceptance）

**TDD vs Acceptance**：比照 W-FW1~W-FW7 慣例，**無單元測試**。理由：wiring + transform layer + audit gap fill + Casbin 同步類 feature；資料寫入由 Sea-ORM derive，Casbin SQL 由既有 `sync_role_permissions` helper covered，audit_log helper 已 covered by F2.1。**0 新純函式**——正確性由 acceptance 矩陣 + CDP browser smoke 覆蓋。

**Acceptance 設計綱要**（細節在 spec-kit 階段產出的 `contracts/verification-commands.md`）：

| 範疇 | 涵蓋 |
|---|---|
| build + Casbin seed | C-V1 + C-V2（schema 不動、只驗 data migration 6 row + down 對稱）|
| **A getAllEndpoints** | C-V3 / C-V4（envelope、tree shape 13 group、67 leaf、method/path/summary 三欄齊備）|
| **A getRoleEndpointIds** | C-V5 / C-V6 / C-V7（ROLE_SUPER 回非空集、新 role 回 `[]`、invalid id 回 4001）|
| **A assignRoleEndpoints** | C-V8 ~ C-V12（基本 wire / 連續 assign diff / 清空 [] / 部分 bogus 過濾 / GeneralUser deny）|
| **B audit** | C-V13 / C-V14 / C-V15（payload camelCase 對得上 / 連續 2 次 audit 對得上 / grep `audit_log::write_in_txn` in sys_authorization_service.rs = 3 次：assign_routes + assign_users + assign_permission）|
|  | C-V16（txn rollback atomicity、audit 不寫入）|
| W-F11 reload | C-V17 / C-V18（rust-api log 含 invalidate 訊號 / 改完該 role user 訪問新權限不退化）|
| **CDP smoke** | C-V19 / C-V20 / C-V21（modal 開、tree render、save、重開 pre-fill 一致）|
| regression | C-V22（既有 `/api-endpoint/*` admin CRUD + `/authorization/assign-permission` raw 端點不退化）|

---

## 8. 後續排程

- W-FW8 落地後 **W-WEBUI follow-up 軌道清空**，剩餘 follow-up backlog：
  - `W-F12/13/14` observability 三件套（Phase W deploy P5、未排程、DESIGN-W-DEPLOYMENT §11）
  - `W-F6b` acme.sh 真實 cert（需公網 + DNS provider creds）
  - `F1.2` JWT algorithm 升級 / key versioning 殘留範圍
  - `F2.2` audit-log outbox + Redis TTL fallback
  - base-web TS `id` 型別債（030-034 review 三處命中，建議 base-web cleanup sprint 統一）
- 推薦下一個排程 feature：observability（W-F12 開始）
- 若日後想做 v-permission directive、視為 **W-FW9 candidate**（W-WEBUI follow-up 已收尾、會是新 W-FW 軌道 reopen）；現階段不排。

---

**brainstorm 完成、可進 spec-kit 階段 A `/speckit-specify`**。

(由 Claude Opus 4.7 1M context 與 user 在 2026-05-23 session 共同產出。)
