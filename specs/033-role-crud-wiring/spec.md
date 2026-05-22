# Feature Specification: W-FW3 — role-crud-wiring（base-web role CRUD 接線）

**Feature Branch**: `033-role-crud-wiring`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "W-FW3 role-crud-wiring — base-web manage/role 的新增/編輯 drawer + 刪除/批次刪除接上 rust-api。前端接線 + 後端 systemManage role 寫入 alias 轉換層 + update_role status-drop 修正 + roleCode transform-layer code-lock。"

**Source**: [`docs/superpowers/033-feature-role-crud-wiring.md`](../../docs/superpowers/033-feature-role-crud-wiring.md)（brainstorming 2026-05-22 session — W-WEBUI 軌道第三個 feature；2 個釐清拍板、user 已核准）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.1.0）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §5.3 W-FW3 + §4 base-web 修改範圍邊界。
- W-FW1 `user-crud-wiring`（031，merge `a09d316`）/ W-FW2 `menu-crud-wiring`（032，merge `8ccc4b4`）：已確立 W-WEBUI 接線模式（base-web-shaped DTO + 後端 transform handler + 前端 service function / handler 接線）；W-FW3 比照。

## Scope summary

base-web `example` 分支的 role 管理頁有完整表格 UI 與新增/編輯 drawer，但 drawer 送出與列表刪除全是 UI stub —— 不打任何後端 API。後端有 native role 寫入端點，`/systemManage/` 下只有 role 讀 alias（`getRoleList` / `getAllRoles`）。W-FW3 讓管理者在 base-web 真能建立、編輯、刪除角色；並修掉接線會曝露的 2 個 role-edit 後端正確性問題。

| 面向 | deliverable |
|---|---|
| **新增 / 編輯角色** | base-web role drawer 送出接上後端建立 / 更新端點；base-web 表單展示值與後端 domain 值的形狀落差由後端適應。 |
| **刪除 / 批次刪除** | base-web 列表的單筆 / 批次刪除接上後端刪除端點。 |
| **role-edit 正確性** | 修 `update_role` 不持久 `status`；編輯時 roleCode 鎖定（即使送出更動的 roleCode、後端保留既有值），防角色的授權政策孤兒化。 |

**範疇外**:
- ❌ role drawer 內嵌的 `menu-auth-modal` / `button-auth-modal`（角色菜單 / 按鈕授權）—— 屬 W-FW4 `role-authorization-wiring`。
- ❌ role 階層樹（`sys_role.pid`）的 base-web 管理 UI —— base-web role 頁為扁平表、無樹。
- ❌ base-web 型別定義、表格 render、router、store、i18n key、UI 樣式。

## Clarifications

### Session 2026-05-22（brainstorming 階段拍板）

- **Q1（W-FW3 範疇深度）**: 接線會曝露 rust `update_role` 的 2 個既有行為 —— ① `update_role` 不持久送出的 `status`；② 改 `code` 不重同步 Casbin、會孤兒化該角色的授權政策。→ **A: 接線 + role-edit 正確性**。W-FW3 範疇含修掉這 2 點，讓「編輯角色」交付即完整可用、無授權政策孤兒風險。
- **Q2（roleCode 防護機制）**: → **A: transform-layer code-lock**。後端更新角色端點以「保留角色既有 code」實現 roleCode 編輯不可變（base-web drawer 仍顯示 roleCode 可編輯、但送出後不生效，與 W-FW2「`query`/`buttons` 由後端忽略」對稱）。完整「安全改 role code」能力另立 follow-up W-FW3-N1。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 建立角色（Priority: P1）🎯 MVP

管理者在 base-web role 管理頁點「新增」開 drawer、填入角色名稱 / 角色代碼 / 描述 / 狀態後送出，系統建立該角色並寫入資料庫，列表立即反映。此前 drawer 送出只跳成功訊息、不打後端 —— 新角色從未被建立。

**Why this priority**: 「建立角色」是 role 管理最基礎的能力。建立通了即達成本 feature MVP。

**Independent Test**: 在 `/manage/role` 開新增 drawer 填表送出 → 確認新角色落 DB、列表 refresh 顯示。

**Acceptance Scenarios**:

1. **Given** 管理者在 role 管理頁，**When** 開新增 drawer、填妥必填欄位送出，**Then** 系統建立該角色、寫入 DB、列表 refresh 顯示。
2. **Given** 新增 drawer 選了角色狀態，**When** 送出，**Then** DB 落庫狀態值的語意與表單選項一致。
3. **Given** 新增 drawer 填的角色代碼與既有角色重複，**When** 送出，**Then** 後端拒絕、base-web 顯示錯誤訊息、drawer 不關閉、不誤報成功。

### User Story 2 — 刪除 / 批次刪除角色（Priority: P2）

管理者在 role 列表對某角色點刪除、或勾選多筆後批次刪除，系統將其移除。base-web 既有刪除動作目前是 stub（只 console.log）。

**Why this priority**: 刪除是 role 管理的另一基礎能力，且刪除端點形狀單純、可獨立於建立 / 編輯交付驗證。

**Independent Test**: 在 `/manage/role` 對一筆角色點刪除 → 確認該角色為軟刪狀態、列表 refresh 不再顯示；勾選多筆批次刪除 → 全部軟刪。

**Acceptance Scenarios**:

1. **Given** role 列表有資料，**When** 對某角色點刪除，**Then** 該角色被軟刪、列表 refresh 不再顯示。
2. **Given** 列表勾選多筆角色，**When** 點批次刪除，**Then** 所有勾選角色被軟刪。
3. **Given** 一筆角色已被刪除，**When** 查資料庫，**Then** 該 row 仍存在且標記為已刪除（軟刪、非物理刪除）。

### User Story 3 — 編輯角色（Priority: P3）

管理者對既有角色點編輯，drawer 預填其現值，修改欄位後送出，變更持久化。**改角色狀態必須真正生效**；**roleCode 在編輯時鎖定** —— 即使 drawer 顯示 roleCode 可編輯，送出後該角色的代碼維持不變，確保其授權政策不被孤兒化。

**Why this priority**: 編輯讓 role 管理完整；涉及最多欄位、且帶 2 個後端正確性處理（status 持久化、roleCode 鎖定），排最後。

**Independent Test**: 對一筆既有角色點編輯 → 確認 drawer 預填現值 → 改角色名稱 / 狀態送出 → 確認變更生效、狀態真的變；送出時更動 roleCode → 確認 DB 中 roleCode 不變。

**Acceptance Scenarios**:

1. **Given** 管理者對某角色點編輯，**When** drawer 開啟，**Then** drawer 預填該角色現有欄位值。
2. **Given** 編輯 drawer，**When** 改角色名稱 / 描述送出，**Then** 變更持久化、列表 refresh 反映。
3. **Given** 編輯 drawer 改了角色狀態，**When** 送出，**Then** DB 中該角色狀態**真正變更**（不被靜默丟棄）。
4. **Given** 編輯 drawer 改了 roleCode，**When** 送出，**Then** DB 中該角色的代碼**維持原值不變**、其授權政策不受影響。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 必填欄位（角色名稱 / 代碼 / 狀態）未填 | base-web 既有表單驗證攔下、不送出 |
| E-2 | 後端拒絕（角色代碼重複 / 驗證失敗 / 無權限） | base-web 顯示後端錯誤 envelope 訊息、drawer 不關、不誤報成功 |
| E-3 | 編輯時更動 roleCode | 提交後後端保留既有代碼、roleCode 不變（範疇內、不報錯） |
| E-4 | 批次刪除同時含多個角色 | 各角色依勾選獨立軟刪、與單筆刪除行為一致（無額外 cascade） |
| E-5 | 無權限角色嘗試寫入 | 後端 Casbin 拒絕、base-web 顯示權限錯誤 |

## Requirements *(mandatory)*

### Functional Requirements

**A. 建立角色**

- **FR-001**: base-web role 新增 drawer 送出時 MUST 呼叫後端建立角色端點，新角色 MUST 寫入資料庫。
- **FR-002**: 建立時 base-web 表單送出的展示值（角色狀態等）MUST 被正確對應為後端的 domain 值；DB 落庫值的語意 MUST 與表單選項一致。
- **FR-003**: 建立成功後，base-web role 列表 MUST refresh 並反映新角色。

**B. 編輯角色**

- **FR-004**: base-web role 編輯 drawer 送出時 MUST 呼叫後端更新角色端點，變更 MUST 持久化。
- **FR-005**: 編輯 drawer 開啟時 MUST 預填該角色現有欄位值。
- **FR-006**: 編輯角色狀態 MUST 真正持久化 —— 後端更新角色端點 MUST NOT 丟棄送出的狀態值。
- **FR-007**: 編輯角色時 roleCode MUST 維持不可變 —— 即使 base-web 送出更動的 roleCode，後端 MUST 保留該角色既有代碼，確保其授權政策不被孤兒化。

**C. 刪除角色**

- **FR-008**: base-web 列表的單筆刪除 MUST 呼叫後端刪除端點；被刪角色 MUST 為軟刪除（per Constitution II，row 留表、標記已刪）。
- **FR-009**: base-web 列表的批次刪除 MUST 對所有勾選角色執行軟刪除。
- **FR-010**: 刪除 / 批次刪除成功後，base-web 列表 MUST refresh。

**D. 通用行為**

- **FR-011**: 所有寫入操作 MUST 經後端 Casbin enforcement；無權限角色 MUST 被拒絕。新增的角色寫入端點 MUST 補上對應的 Casbin 授權政策。
- **FR-012**: 所有寫入操作 MUST 經後端既有 audit log 路徑（per Constitution II，業務 + audit 同 transaction）。
- **FR-013**: 後端任一寫入失敗（欄位驗證 / 權限 / 資料衝突）時，base-web MUST 顯示明確錯誤訊息，且 MUST NOT 關閉 drawer 或誤報成功。
- **FR-014**: base-web 三個管理模組（user / menu / role）的寫入路徑 MUST 統一經 `/systemManage/` 端點，role 寫入 MUST NOT 直接走原生 `/role/*` 端點（per W-WEBUI §5 一致性拍板）。

**E. 範疇紀律**

- **FR-015**: 本 feature 對 base-web 的修改 MUST 限於 W-WEBUI §4 受控範圍（role 模組的 API service function、role drawer 的送出 handler、role 列表的刪除 handler）；MUST NOT 改動 base-web 型別定義、表格 render 邏輯、router、store、i18n key、UI 樣式。
- **FR-016**: 本 feature MUST NOT 改動後端角色資料表結構；唯一的資料庫變動 MUST 限於新角色寫入端點的 Casbin 授權政策。
- **FR-017**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B 形態、nestjs 已退場）。
- **FR-018**: 本 feature MUST NOT 接線 role 的 `menu-auth-modal` / `button-auth-modal`（角色授權，W-FW4 範疇）；該 2 個 modal 維持原樣。
- **FR-019**: commit MUST 為多段式（base-web worktree + rust-api worktree + outer SHA pin）per CLAUDE.md §4.1。
- **FR-020**: acceptance MUST 用 CDP browser smoke + curl + psql 三者。

### Key Entities

- **base-web 角色操作表單**: role 管理頁的新增 / 編輯 drawer（送出含角色名稱 / 角色代碼 / 描述 / 狀態）與列表的刪除 / 批次刪除動作。本 feature 前其送出 handler 皆為 stub。
- **後端角色寫入端點**: `/systemManage/` 下的建立 / 更新 / 刪除 / 批次刪除角色端點。建立 / 更新 / 單筆刪除為包裝既有 native 角色寫入能力的 alias；批次刪除為新增的 alias。Casbin 授權政策為本 feature 新增。
- **角色授權政策**: 角色的後端授權政策以**角色代碼（`roleCode`，對應 `sys_role.code`）**為識別鍵 —— 編輯角色時該代碼鎖定，以保此關聯不因代碼變更而斷裂（孤兒化）。
- **形狀對齊**: base-web 展示值（角色狀態的 UI 值）與後端 domain 值之間的對應；由後端適應（與 W-FW1 / W-FW2 對稱）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者在 base-web role 管理頁可建立新角色，送出後該角色出現在列表、且存於資料庫。
- **SC-002**: 管理者可編輯既有角色，角色名稱 / 描述 / 狀態變更持久化並反映於列表。
- **SC-003**: 管理者可單筆 / 批次刪除角色，被刪角色從列表消失，且資料庫中為軟刪狀態（保留可追溯性）。
- **SC-004**: 編輯角色時，狀態變更 100% 持久化（不被後端靜默丟棄）。
- **SC-005**: 編輯角色時，更動 roleCode 100% 不生效 —— 資料庫中角色代碼維持原值、該角色授權政策不受影響。
- **SC-006**: 後端寫入失敗時，base-web 100% 顯示明確錯誤訊息、不誤報成功。
- **SC-007**: 本 feature 對 base-web 的改動限於 role 管理模組的 service / 接線檔；nestjs fork 0 改動；唯一 DB 變動為 Casbin 授權政策。
- **SC-008**: 既有功能不退化 —— 登入、動態 menu、user / menu / role 三表讀取仍正常。
- **SC-009**: 無權限角色嘗試 role 寫入操作時 100% 被後端拒絕。

## Assumptions

- **A-001**: rust-api 已有 native 的角色建立 / 更新 / 單筆刪除能力（含 audit log + soft delete hook）—— 本 feature 在其上包 `/systemManage/` alias 轉換層，不重做業務邏輯。
- **A-002**: base-web role drawer 的提交參數組裝邏輯已備妥；drawer 已有編輯預填流程，故本 feature 只需接「寫」側、不需改 drawer 的參數組裝邏輯。
- **A-003**: base-web 的 request helper 對「HTTP 成功但 body 業務碼非成功」已有既有錯誤呈現機制，本 feature 沿用、不改型別。
- **A-004**: 後端 `update_role` 既有行為:不持久送出的 `status`、改 `code` 不重同步授權政策 —— W-FW3 修正前者（FR-006）、以 roleCode 鎖定規避後者（FR-007）；完整的「安全改 role code」能力為獨立 follow-up（INTEGRATION-CHECKLIST W-FW3-N1）。
- **A-005**: base-web role 批次刪除無 native 對應端點，本 feature 新增的批次刪除 alias 以「對每筆勾選逐一執行單筆刪除」實現，行為與單筆刪除一致。
- **A-006**: 角色建立的角色樹父識別由後端注入預設值（base-web role 頁為扁平表、無階層 UI）；編輯角色時保留既有父識別、不擾動角色樹位置。
- **A-007**: Constitution Principle IV「W-WEBUI 受管例外」（v1.1.0）已生效，本 feature 對 base-web 的修改在明文授權範圍內。

## Dependencies

### Inbound（本 feature 依賴）

- **F9** `systemManage-alias-router`（merge `b2f910c`）:`/systemManage/*` alias router 結構。✅
- **F7** `manage-crud-alignment`（merge `136b1eb`）:role 讀側 Output DTO + 角色狀態對映來源。✅
- **W-FW1** `user-crud-wiring`（031，merge `a09d316`）/ **W-FW2** `menu-crud-wiring`（032，merge `8ccc4b4`）:W-WEBUI 接線模式範本。✅
- **Constitution v1.1.0**:Principle IV W-WEBUI 受管例外。✅

### Follow-up（本 feature 範疇外、登 INTEGRATION-CHECKLIST「Follow-up Backlog」）

- **W-FW3-N1**:role code 改名能力 —— rust `update_role` 改 code 時重同步角色授權政策（`casbin_rule` v0 old→new）+ base-web drawer roleCode edit 唯讀。
