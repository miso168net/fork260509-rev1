# Feature Specification: W-FW4 — role-authorization-wiring（base-web 角色菜單授權接線）

**Feature Branch**: `034-role-authorization-wiring`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "W-FW4 role-authorization-wiring — base-web manage/role 的菜單授權 modal 接上 rust-api。前端接線 menu-auth-modal 的讀（角色現有授權）/ 寫（儲存授權）+ 後端補 /systemManage/ 的角色菜單授權讀 / 寫 alias（domain 伺服器端注入）+ Casbin seed migration。按鈕授權與角色首頁為範疇外 follow-up。"

**Source**: [`docs/superpowers/034-feature-role-authorization-wiring.md`](../../docs/superpowers/034-feature-role-authorization-wiring.md)（brainstorming 2026-05-22 session — W-WEBUI 軌道第四個、最後一個 feature；2 個釐清拍板、user 已核准）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.1.0）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §5.4 W-FW4 + §4 base-web 修改範圍邊界。
- W-FW1 `user-crud-wiring`（031，merge `a09d316`）/ W-FW2 `menu-crud-wiring`（032，merge `8ccc4b4`）/ W-FW3 `role-crud-wiring`（033，merge `729dbf9`）：已確立 W-WEBUI 接線模式（base-web-shaped 形狀 + 後端 transform alias + 前端 service function / handler 接線）；W-FW4 比照。

## Scope summary

base-web `example` 分支的 role 管理頁，每個角色列有「菜單授權」按鈕、開啟一個含菜單樹的 modal —— 但 modal 的「載入角色現有授權」與「送出儲存」全是 UI stub（現有授權寫死假陣列、送出只跳成功訊息不打後端）。後端已具備角色菜單授權的讀 / 寫能力，但僅有原生端點、`/systemManage/` 下無對應 alias。W-FW4 讓管理者在 base-web 真能檢視與調整某角色可存取的菜單範圍，調整後該角色的動態選單即反映變更。

| 面向 | deliverable |
|---|---|
| **檢視角色菜單授權** | menu-auth modal 開啟時，菜單樹預先勾選該角色目前已授權的菜單。 |
| **變更並儲存** | modal 送出時，該角色的菜單授權更新並持久化。 |
| **授權生效** | 授權變更後，受影響角色的動態選單反映新的可存取菜單集合。 |

**範疇外**：
- ❌ role 的**按鈕授權** modal（`button-auth-modal`）—— 後端無對應的「按鈕」資料模型，需另行評估映射方式；屬 follow-up **W-FW4-N1**。
- ❌ menu-auth modal 內的**角色首頁**選單（指定角色登入後的預設頁）—— 後端目前無每角色首頁的儲存，持久化需後端角色資料表結構變更；屬 follow-up **W-FW4-N2**。modal 內該選單維持現狀（UI 不動）。
- ❌ base-web 型別定義、菜單樹 render、router、store、i18n key、UI 樣式。
- ❌ 後端角色 / 菜單 / 角色-菜單關聯資料表的結構變更。

## Clarifications

### Session 2026-05-22（brainstorming 階段拍板）

- **Q1（W-FW4 子功能範疇）**: menu-auth modal 牽涉 3 塊功能（菜單授權 / 按鈕授權 / 角色首頁），三者後端就緒度差異大 —— 菜單授權後端完備、按鈕授權後端無對應模型、角色首頁後端無儲存。→ **A: 只做菜單授權**。比照 W-FW1/W-FW2/W-FW3「最小、後端就緒、測得動」的 scoping 紀律；按鈕授權與角色首頁各自登 follow-up（W-FW4-N1 / W-FW4-N2）。
- **Q2（接線方式）**: 角色菜單授權的讀 / 寫接線經何路徑。→ **A: 統一經 `/systemManage/` alias**。讀與寫皆新增 `/systemManage/` alias 端點；後端在 alias 層注入授權所需的 domain 識別（base-web 不需感知 domain）。與 W-FW3「base-web role 操作統一經 `/systemManage/`」一致。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 檢視角色菜單授權（Priority: P1）🎯 MVP

管理者在 base-web role 管理頁對某角色點「菜單授權」開啟 modal，modal 內的菜單樹**預先勾選**該角色目前已被授權存取的菜單。此前 modal 顯示的是寫死的假授權資料 —— 與該角色實際授權無關。

**Why this priority**: 「看見角色目前能存取哪些菜單」是菜單授權管理的前提，也是可獨立交付的稽核能力（即使尚不能修改，正確顯示現況本身有價值）。

**Independent Test**: 在 `/manage/role` 對一角色開菜單授權 modal → 確認菜單樹的勾選狀態與該角色資料庫中的菜單授權一致。

**Acceptance Scenarios**:

1. **Given** 某角色已有一組菜單授權，**When** 管理者開啟其菜單授權 modal，**Then** 菜單樹預先勾選該角色目前已授權的菜單、未授權的菜單不勾選。
2. **Given** 某角色無任何菜單授權，**When** 開啟其菜單授權 modal，**Then** 菜單樹無任何預先勾選。
3. **Given** 不同角色，**When** 分別開啟各自的菜單授權 modal，**Then** 各自顯示各自的授權，互不混淆。

### User Story 2 — 變更並儲存角色菜單授權（Priority: P2）

管理者在菜單授權 modal 中調整菜單樹的勾選（新增或取消授權某些菜單），點送出，該角色的菜單授權更新並持久化。此前送出只跳成功訊息、不打後端 —— 變更從未生效。

**Why this priority**: 「調整授權」讓菜單授權管理完整可用；依賴 US1 的讀側預填提供調整基準，故排其後。

**Independent Test**: 對一角色開菜單授權 modal → 調整勾選送出 → 確認該角色的菜單授權在資料庫中更新為送出的集合（新增的授權新增、取消的授權移除）。

**Acceptance Scenarios**:

1. **Given** 管理者在菜單授權 modal 調整了勾選，**When** 送出，**Then** 該角色的菜單授權持久化為新的集合、modal 關閉、顯示成功訊息。
2. **Given** modal 中為某角色新增勾選了數個菜單，**When** 送出，**Then** 該角色新增取得這些菜單的授權。
3. **Given** modal 中取消勾選了某角色原有的數個菜單，**When** 送出，**Then** 該角色失去這些菜單的授權。
4. **Given** 後端拒絕送出（無權限 / 驗證失敗），**When** 送出，**Then** base-web 顯示錯誤訊息、modal 不關閉、不誤報成功。

### User Story 3 — 授權變更對角色生效（Priority: P3）

管理者調整某角色的菜單授權後，該角色的使用者在下一次取得動態選單時，看見的可存取菜單集合反映新的授權 —— 新授權的菜單出現、被取消的菜單消失。

**Why this priority**: 這是菜單授權的最終使用者價值（「為什麼要做」），但屬既有動態選單機制的自然結果、非本 feature 新增邏輯，故排最後、以驗收覆蓋。

**Independent Test**: 對某角色調整菜單授權後，以該角色取得動態選單 → 確認選單集合與新授權一致。

**Acceptance Scenarios**:

1. **Given** 某角色被新增授權了一個菜單，**When** 該角色取得動態選單，**Then** 該菜單出現在其可存取選單中。
2. **Given** 某角色被取消授權了一個菜單，**When** 該角色取得動態選單，**Then** 該菜單不再出現。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 菜單授權 modal 內未做任何變更直接送出 | 該角色授權維持不變（送出目前集合、等同無變更）、不報錯 |
| E-2 | 後端拒絕（無權限 / 驗證失敗） | base-web 顯示後端錯誤 envelope 訊息、modal 不關、不誤報成功 |
| E-3 | 菜單樹節點的父 / 子 / constant 節點勾選 —— 送出的勾選集合與後端「角色已授權菜單」的讀回集合可能不完全對應（菜單樹 cascade 行為 vs 後端讀側過濾條件） | 來回（儲存後再開啟）行為須一致；若不一致則為已知落差、須於設計階段釐清處理（見 Assumptions A-005） |
| E-4 | 無權限角色嘗試讀取 / 儲存菜單授權 | 後端拒絕、base-web 顯示權限錯誤 |
| E-5 | 對一角色一次取消其全部菜單授權 | 該角色菜單授權清空、不報錯 |

## Requirements *(mandatory)*

### Functional Requirements

**A. 檢視角色菜單授權**

- **FR-001**: base-web 菜單授權 modal 開啟時 MUST 向後端查詢該角色目前已授權的菜單，並據此預先勾選菜單樹；MUST NOT 顯示寫死的假授權資料。
- **FR-002**: 預先勾選的菜單集合 MUST 對應該角色在資料庫中實際的菜單授權。

**B. 變更並儲存**

- **FR-003**: base-web 菜單授權 modal 送出時 MUST 呼叫後端儲存端點，將該角色的菜單授權更新為 modal 中勾選的集合。
- **FR-004**: 儲存 MUST 為差異更新 —— 新勾選的菜單新增授權、取消勾選的菜單移除授權；未變動的維持。
- **FR-005**: 儲存成功後 base-web MUST 關閉 modal 並顯示成功訊息。

**C. 授權生效**

- **FR-006**: 角色菜單授權變更後，該角色使用者下一次取得動態選單時 MUST 反映新的授權集合（既有動態選單機制，本 feature 不改、僅須不破壞）。

**D. 通用行為**

- **FR-007**: base-web 對角色菜單授權的讀取與儲存 MUST 統一經 `/systemManage/` 端點（per W-WEBUI §5 一致性拍板、對齊 W-FW3）；MUST NOT 直接走原生授權端點。
- **FR-008**: 角色菜單授權的讀取與儲存 MUST 經後端 Casbin enforcement；無權限角色 MUST 被拒絕。新增的角色菜單授權端點 MUST 補上對應的 Casbin 授權政策。
- **FR-009**: 儲存操作所需的授權範圍識別（domain）MUST 由後端在 `/systemManage/` alias 層注入 —— base-web MUST NOT 需要感知或傳送 domain。
- **FR-010**: 後端讀取 / 儲存失敗（權限 / 驗證 / 資料衝突）時，base-web MUST 顯示明確錯誤訊息，且 MUST NOT 關閉 modal 或誤報成功。
- **FR-011**: 儲存操作 MUST 經後端既有 native 授權服務，於單一 DB transaction 內完成（一起 commit / rollback）。

**E. 範疇紀律**

- **FR-012**: 本 feature 對 base-web 的修改 MUST 限於 W-WEBUI §4 受控範圍（role 菜單授權 modal 的 API service function 與其讀 / 送出 handler）；MUST NOT 改動 base-web 型別定義、菜單樹 render 邏輯、router、store、i18n key、UI 樣式。
- **FR-013**: 本 feature MUST NOT 改動後端角色 / 菜單 / 角色-菜單關聯資料表的結構；唯一的資料庫變動 MUST 限於新角色菜單授權端點的 Casbin 授權政策。
- **FR-014**: 本 feature MUST NOT 接線 role 的按鈕授權 modal（`button-auth-modal`）—— 該 modal 維持原樣，屬 follow-up W-FW4-N1。
- **FR-015**: 本 feature MUST NOT 接線 menu-auth modal 內的角色首頁選單 —— 該選單維持現狀，屬 follow-up W-FW4-N2。
- **FR-016**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B 形態、nestjs 已退場）。
- **FR-017**: commit MUST 為多段式（base-web worktree + rust-api worktree + outer SHA pin）per CLAUDE.md §4.1。
- **FR-018**: acceptance MUST 用 CDP browser smoke + curl + psql 三者。

### Key Entities

- **角色菜單授權**: 某角色被允許存取的菜單集合，以「角色-菜單關聯」紀錄表達；本 feature 前 base-web modal 對此的讀寫皆為 stub。
- **菜單授權 modal**: role 管理頁的菜單授權 modal，含一棵全菜單樹；其「載入角色現有授權」與「送出儲存」handler 為本 feature 接線對象。modal 內另有的角色首頁選單與按鈕授權 modal 不在本 feature 範疇。
- **後端角色菜單授權端點**: `/systemManage/` 下的「讀取角色已授權菜單」與「儲存角色菜單授權」端點；包裝既有原生授權能力的 alias。Casbin 授權政策為本 feature 新增。
- **授權範圍識別（domain）**: 後端角色菜單授權以 domain 區隔；base-web 不感知，由 `/systemManage/` alias 層由請求者身分注入。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者開啟任一角色的菜單授權 modal，菜單樹勾選狀態 100% 對應該角色資料庫中的實際授權。
- **SC-002**: 管理者調整勾選並送出後，該角色的菜單授權在資料庫中更新為送出的集合（新增 / 移除皆正確）。
- **SC-003**: 角色菜單授權變更後，該角色取得的動態選單反映新授權 —— 新授權菜單出現、取消授權菜單消失。
- **SC-004**: 儲存後再次開啟同一角色的菜單授權 modal，勾選狀態與剛送出的一致（讀寫來回一致）。
- **SC-005**: 後端讀取 / 儲存失敗時，base-web 100% 顯示明確錯誤訊息、不誤報成功。
- **SC-006**: 本 feature 對 base-web 的改動限於 role 菜單授權 modal 的 service / 接線檔；nestjs fork 0 改動；唯一 DB 變動為 Casbin 授權政策。
- **SC-007**: 無權限角色嘗試讀取 / 儲存菜單授權時 100% 被後端拒絕。
- **SC-008**: 既有功能不退化 —— 登入、動態選單、user / menu / role 三表 CRUD 仍正常。

## Assumptions

- **A-001**: rust-api 已有角色菜單授權的原生讀（角色已授權菜單）與寫（差異更新角色菜單授權）能力，寫於單一 transaction 內完成 —— 本 feature 在其上包 `/systemManage/` alias 轉換層，不重做業務邏輯。**註**：實查確認 native `assign_routes` 於 transaction 內 delta 更新 `sys_role_menu`、但目前**不寫 `sys_operation_log`**；此 pre-existing audit gap 非 W-FW4 範疇，登 follow-up W-FW4-N3。
- **A-002**: base-web 菜單授權 modal 已有完整的菜單樹 UI 與勾選互動、且全菜單樹的載入已是真實後端呼叫 —— 本 feature 只需接「載入角色現有授權」與「送出儲存」兩處 handler。
- **A-003**: base-web 的 request helper 對「HTTP 成功但 body 業務碼非成功」已有既有錯誤呈現機制，本 feature 沿用、不改型別。
- **A-004**: 角色菜單授權的 domain 識別可由請求者的登入身分推得，後端 alias 層據此注入 —— 對應 base-web role 管理一律在單一 domain 下操作的現況。
- **A-005**: base-web 菜單樹的勾選集合（含父 / 子 / constant 節點的 cascade 行為）與後端「角色已授權菜單」讀側的過濾條件之間，可能存在不完全對應 —— 即儲存後讀回的集合與送出集合不一定逐一相等。此「來回一致性」由 spec-kit Phase 0 research 釐清實際行為；若確認不一致且影響使用，於 plan 階段決定處理方式（對齊過濾條件、或登記為已知 minor 落差）。SC-004 為其驗收關卡。
- **A-006**: 角色菜單授權變更後的「動態選單生效」由既有動態選單機制自然達成，本 feature 不新增此邏輯、僅須不破壞。
- **A-007**: Constitution Principle IV「W-WEBUI 受管例外」（v1.1.0）已生效，本 feature 對 base-web 的修改在明文授權範圍內。

## Dependencies

### Inbound（本 feature 依賴）

- **F9** `systemManage-alias-router`（merge `b2f910c`）：`/systemManage/*` alias router 結構。✅
- **F5.1** `auth-login-and-dynamic-menu`（merge `e71aefe`）：動態選單機制（授權變更的生效載體）。✅
- **F6** `route-guard`（merge `a431215`）：路由守衛 / 菜單樹來源。✅
- **W-FW1/W-FW2/W-FW3**（031 / 032 / 033）：W-WEBUI 接線模式範本。✅
- **Constitution v1.1.0**：Principle IV W-WEBUI 受管例外。✅

### Follow-up（本 feature 範疇外、登 INTEGRATION-CHECKLIST「Follow-up Backlog」）

- **W-FW4-N1**：role 按鈕授權 modal 接線 —— 後端無「按鈕」資料模型，需評估把按鈕授權映射到既有的 API 端點權限機制；牽涉「UI 按鈕 vs API 端點」語意對齊。獨立 feature。
- **W-FW4-N2**：role 首頁持久化 —— menu-auth modal 的角色首頁選單需後端儲存（目前無每角色首頁的儲存）；需後端角色資料表結構變更 + 讀寫端點。獨立 follow-up。
- **W-FW4-N3**：角色菜單授權寫入無 audit log —— native `assign_routes` 於 transaction 內 delta 更新 `sys_role_menu`、但未寫 `sys_operation_log`（Constitution II「所有寫入 MUST 寫 audit」的 pre-existing native gap，類同 backlog R2 的登入失敗無 audit）。補 audit 需動 native service、超出 wiring 範疇，屬獨立 follow-up。
