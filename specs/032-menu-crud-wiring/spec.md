# Feature Specification: W-FW2 — menu-crud-wiring（base-web menu CRUD 接線）

**Feature Branch**: `032-menu-crud-wiring`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "W-FW2 menu-crud-wiring — base-web manage/menu 的新增/編輯/加子菜單 modal + 刪除/批次刪除接上 rust-api。設計依據 docs/superpowers/032-feature-menu-crud-wiring.md。前端接線 + 後端 systemManage menu 寫入 alias 轉換層。"

**Source**: [`docs/superpowers/032-feature-menu-crud-wiring.md`](../../docs/superpowers/032-feature-menu-crud-wiring.md)（brainstorming 2026-05-22 session — W-WEBUI 軌道第二個 feature;1 個釐清拍板）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.1.0）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §5.2 W-FW2 + §4 base-web 修改範圍邊界。
- W-FW1 `user-crud-wiring`（031,merge `a09d316`）:已確立 W-WEBUI 接線模式（base-web-shaped DTO + 後端 transform handler + 前端 service function/handler 接線）;W-FW2 比照。
- F9 `systemManage-alias-router`（merge `b2f910c`）:`/systemManage/*` alias 端點來源;menu 目前只有讀 alias。
- F7 `manage-crud-alignment`（merge `136b1eb`）:menu 讀側 Output DTO `SystemManageMenuOutput` + `map_menu_type` / `map_icon_type` 對映來源。

## Scope summary

base-web `example` 分支的 menu 管理頁有完整表格 UI 與新增/編輯/加子菜單 modal,但 modal 送出與列表刪除全是 UI stub —— 不打任何後端 API。後端有 native menu 寫入端點,但 `/systemManage/` 下只有 menu 讀 alias。W-FW2 讓管理者在 base-web 真的能建立、編輯、刪除菜單。

| 面向 | deliverable |
|---|---|
| **新增 / 編輯 / 加子菜單** | base-web menu modal 送出接上後端建立 / 更新端點;base-web 表單的展示值與後端 domain 值間的形狀落差由後端適應。 |
| **刪除 / 批次刪除** | base-web 列表的單筆 / 批次刪除接上後端刪除端點。 |

**範疇外**:
- ❌ `query` / `buttons` / `fixedIndexInTab` 三個欄位的持久化 —— 後端 menu 寫入端點無對應欄位,提交時被後端忽略;完整持久化需擴後端資料結構,另立 follow-up（INTEGRATION-CHECKLIST W-FW2-N1）。menu modal 的這 3 個 UI 欄維持顯示。
- ❌ role / 角色授權模組（W-FW3 / W-FW4 範疇）。
- ❌ base-web 型別定義、表格 render、router、store、i18n key、UI 樣式。

## Clarifications

### Session 2026-05-22（brainstorming 階段拍板）

- **Q1（缺欄位處理）**: base-web menu modal 送出的 `query`（路由查詢參數）、`buttons`（菜單按鈕清單）、`fixedIndexInTab`（固定頁籤索引）三個欄位,後端 menu 寫入端點無對應欄位 → **A: thin wrapper、scope out**。後端的 menu 寫入轉換層只對映後端既有能接受的欄位,這 3 個欄位於提交時被後端忽略（與 W-FW1「`userRoles` 由後端忽略」對稱）。後端零資料結構改動。讀側既有行為本就不回傳這 3 欄,讀寫一致。完整持久化另案。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 建立菜單（含加子菜單）（Priority: P1）🎯 MVP

管理者在 base-web menu 管理頁點「新增」開 modal 填入菜單欄位後送出,或對某個目錄型菜單點「加子菜單」開 modal（父菜單已預先帶入）填欄位送出,系統建立該菜單並寫入資料庫,列表立即反映。此前 modal 送出只跳成功訊息、不打後端 —— 新菜單從未被建立。

**Why this priority**: 「建立菜單」是 menu 管理最基礎的能力。加子菜單與新增頂層菜單共用同一建立路徑（差別只在父菜單歸屬已預填），故同屬此故事。建立通了即達成本 feature MVP。

**Independent Test**: 在 `/manage/menu` 開新增 modal 填表送出、以及對目錄型菜單開加子菜單 modal 送出 → 確認新菜單落 DB（含正確的父菜單歸屬）、列表 refresh 顯示。

**Acceptance Scenarios**:

1. **Given** 管理者在 menu 管理頁,**When** 開新增 modal、填妥必填欄位送出,**Then** 系統建立該頂層菜單、寫入 DB、列表 refresh 顯示。
2. **Given** 管理者對某目錄型菜單點「加子菜單」,**When** modal 開啟（父菜單已預填）、填欄位送出,**Then** 系統建立該菜單為該目錄的子菜單、父菜單歸屬正確。
3. **Given** 新增 modal 選了菜單類型 / 圖示類型 / 狀態,**When** 送出,**Then** DB 落庫值的語意與表單選項一致。
4. **Given** modal 含 `query` / `buttons` / `fixedIndexInTab` 欄位的值,**When** 送出,**Then** 這 3 欄被後端忽略、不致建立失敗、其餘欄位正常建立。
5. **Given** 後端拒絕建立（如路由名重複、欄位驗證失敗）,**When** 送出,**Then** base-web 顯示後端錯誤訊息、modal 不關閉、不誤報成功。

### User Story 2 — 刪除 / 批次刪除菜單（Priority: P2）

管理者在 menu 列表對某菜單點刪除、或勾選多筆後批次刪除,系統將其移除。base-web 既有刪除動作目前是 stub（只 console.log）。

**Why this priority**: 刪除是 menu 管理的另一基礎能力,且刪除端點形狀單純（無形狀落差）、可獨立於建立 / 編輯交付驗證。

**Independent Test**: 在 `/manage/menu` 對一筆菜單點刪除 → 確認該菜單為軟刪狀態、列表 refresh 不再顯示;勾選多筆批次刪除 → 全部軟刪。

**Acceptance Scenarios**:

1. **Given** menu 列表有資料,**When** 對某菜單點刪除,**Then** 該菜單被軟刪、列表 refresh 不再顯示。
2. **Given** 列表勾選多筆菜單,**When** 點批次刪除,**Then** 所有勾選菜單被軟刪。
3. **Given** 一筆菜單已被刪除,**When** 查資料庫,**Then** 該 row 仍存在且標記為已刪除（軟刪、非物理刪除）。

### User Story 3 — 編輯菜單（Priority: P3）

管理者對既有菜單點編輯,modal 預填其現值,修改欄位後送出,變更持久化。

**Why this priority**: 編輯讓 menu 管理完整;依賴與建立相同的形狀對齊機制,涉及最多欄位,排最後。

**Independent Test**: 對一筆既有菜單點編輯 → 確認 modal 預填現值 → 改某欄送出 → 確認變更生效、列表 refresh 反映。

**Acceptance Scenarios**:

1. **Given** 管理者對某菜單點編輯,**When** modal 開啟,**Then** modal 預填該菜單現有欄位值。
2. **Given** 編輯 modal,**When** 改某欄位送出,**Then** 變更持久化、列表 refresh 反映。
3. **Given** 編輯 modal 含 `query` / `buttons` / `fixedIndexInTab` 的值,**When** 送出,**Then** 這 3 欄被後端忽略、其餘欄位變更正常生效。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 必填欄位（菜單名 / 路由名 / 狀態等）未填 | base-web 既有表單驗證攔下、不送出 |
| E-2 | 後端拒絕（路由名重複 / 驗證失敗 / 無權限） | base-web 顯示後端錯誤 envelope 訊息、modal 不關、不誤報成功 |
| E-3 | `query` / `buttons` / `fixedIndexInTab` 有值 | 提交時被後端忽略（範疇外、不報錯） |
| E-4 | 批次刪除同時含父菜單與其子菜單（或只含其一） | 各菜單依勾選獨立軟刪、與單筆刪除行為一致（無額外 cascade 處理） |
| E-5 | 無權限角色嘗試寫入 | 後端 Casbin 拒絕、base-web 顯示權限錯誤 |
| E-6 | 對非目錄型菜單 | 不顯示「加子菜單」動作（base-web 既有行為,不改） |

## Requirements *(mandatory)*

### Functional Requirements

**A. 建立菜單**

- **FR-001**: base-web menu 新增 / 加子菜單 modal 送出時 MUST 呼叫後端建立菜單端點,新菜單 MUST 寫入資料庫。
- **FR-002**: 建立時 base-web 表單送出的展示值（菜單類型、圖示類型、狀態等）MUST 被正確對應為後端的 domain 值;DB 落庫值的語意 MUST 與表單選項一致。
- **FR-003**: 「加子菜單」建立的菜單 MUST 正確歸屬於所選父菜單;新增頂層菜單 MUST 歸屬為頂層。
- **FR-004**: 建立成功後,base-web menu 列表 MUST refresh 並反映新菜單。

**B. 編輯菜單**

- **FR-005**: base-web menu 編輯 modal 送出時 MUST 呼叫後端更新菜單端點,變更 MUST 持久化。
- **FR-006**: 編輯 modal 開啟時 MUST 預填該菜單現有欄位值。
- **FR-007**: 編輯的展示值對應規則同 FR-002。

**C. 刪除菜單**

- **FR-008**: base-web 列表的單筆刪除 MUST 呼叫後端刪除端點;被刪菜單 MUST 為軟刪除（per Constitution II,row 留表、標記已刪）。
- **FR-009**: base-web 列表的批次刪除 MUST 對所有勾選菜單執行軟刪除。
- **FR-010**: 刪除 / 批次刪除成功後,base-web 列表 MUST refresh。

**D. 通用行為**

- **FR-011**: 所有寫入操作 MUST 經後端 Casbin enforcement;無權限角色 MUST 被拒絕。新增的菜單寫入端點 MUST 補上對應的 Casbin 授權政策。
- **FR-012**: 所有寫入操作 MUST 經後端既有 audit log 路徑（per Constitution II,業務 + audit 同 transaction）。
- **FR-013**: 後端任一寫入失敗（欄位驗證 / 權限 / 資料衝突）時,base-web MUST 顯示明確錯誤訊息,且 MUST NOT 關閉 modal 或誤報成功。
- **FR-014**: base-web 三個管理模組（user / menu / role）的寫入路徑 MUST 統一經 `/systemManage/` 端點,menu 寫入 MUST NOT 直接走原生 menu 端點（per W-WEBUI §5.2 一致性拍板）。

**E. 範疇紀律**

- **FR-015**: 本 feature 對 base-web 的修改 MUST 限於 W-WEBUI §4 受控範圍（menu 模組的 API service function、menu modal 的送出 handler、menu 列表的刪除 handler）;MUST NOT 改動 base-web 型別定義、表格 render 邏輯、router、store、i18n key、UI 樣式、menu 模組的共用邏輯檔。
- **FR-016**: 本 feature MUST NOT 改動後端菜單資料表結構（per Q1 拍板,`query` / `buttons` / `fixedIndexInTab` scope out）;唯一的資料庫變動 MUST 限於新菜單寫入端點的 Casbin 授權政策。
- **FR-017**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B 形態、nestjs 已退場）。
- **FR-018**: commit MUST 為多段式（base-web worktree + rust-api worktree + outer SHA pin）per CLAUDE.md §6.1。
- **FR-019**: acceptance MUST 用 CDP browser smoke + curl + psql 三者。

### Key Entities

- **base-web menu 操作表單**: menu 管理頁的新增 / 編輯 / 加子菜單 modal（送出含菜單類型 / 菜單名 / 路由名 / 路由路徑 / 元件 / 圖示 / 排序 / 狀態 / 父菜單歸屬 / 等多個欄位,以及範疇外的 `query` / `buttons` / `fixedIndexInTab`）與列表的刪除 / 批次刪除動作。本 feature 前其送出 handler 皆為 stub。
- **後端 menu 寫入端點**: `/systemManage/` 下的建立 / 更新 / 刪除 / 批次刪除菜單端點。建立 / 更新 / 單筆刪除為包裝既有 native 菜單寫入能力的 alias;批次刪除為新增的 alias。Casbin 授權政策為本 feature 新增。
- **形狀對齊**: base-web 展示值（菜單類型、圖示類型、狀態的 UI 值;父菜單歸屬的識別值）與後端 domain 值之間的對應;由後端適應（與 W-FW1 對稱）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者在 base-web menu 管理頁可建立新的頂層菜單與子菜單,送出後該菜單出現在列表、且存於資料庫並具正確的父菜單歸屬。
- **SC-002**: 管理者可編輯既有菜單,變更持久化並反映於列表。
- **SC-003**: 管理者可單筆 / 批次刪除菜單,被刪菜單從列表消失,且資料庫中為軟刪狀態（保留可追溯性）。
- **SC-004**: 建立 / 編輯時 base-web 表單的菜單類型、圖示類型、狀態選項與資料庫落庫值語意 100% 一致。
- **SC-005**: 後端寫入失敗時,base-web 100% 顯示明確錯誤訊息、不誤報成功。
- **SC-006**: 本 feature 對 base-web 的改動限於 menu 管理模組的 service / 接線檔;nestjs fork 0 改動;唯一 DB 變動為 Casbin 授權政策。
- **SC-007**: 既有功能不退化 —— 登入、動態 menu、user / menu / role 三表讀取仍正常。
- **SC-008**: 無權限角色嘗試 menu 寫入操作時 100% 被後端拒絕。

## Assumptions

- **A-001**: rust-api 已有 native 的菜單建立 / 更新 / 單筆刪除能力（含 audit log + soft delete hook）—— 本 feature 在其上包 `/systemManage/` alias 轉換層,不重做業務邏輯。
- **A-002**: base-web menu modal 的提交參數組裝邏輯已備妥;modal 已有「加子菜單」流程並會把父菜單歸屬填入提交參數,故本 feature 只需接「寫」側、不需改 modal 的參數組裝邏輯。
- **A-003**: base-web 的 request helper 對「HTTP 成功但 body 業務碼非成功」已有既有錯誤呈現機制,本 feature 沿用、不改型別。
- **A-004**: 後端菜單寫入端點現有的欄位集無 `query` / `buttons` / `fixedIndexInTab`;base-web modal 送出這 3 欄時由後端忽略為 dev / 整合階段合理取捨（讀側本就不回傳這 3 欄）;完整持久化為獨立 follow-up（INTEGRATION-CHECKLIST W-FW2-N1）。
- **A-005**: Constitution Principle IV「W-WEBUI 受管例外」（v1.1.0）已生效,本 feature 對 base-web 的修改在明文授權範圍內。
- **A-006**: base-web menu 批次刪除無 native 對應端點,本 feature 新增的批次刪除 alias 以「對每筆勾選逐一執行單筆刪除」實現,行為與單筆刪除一致、不含額外的父子層級 cascade 處理。

## Dependencies

### Inbound（本 feature 依賴）

- **F9** `systemManage-alias-router`（merge `b2f910c`）:`/systemManage/*` alias router 結構。✅
- **F7** `manage-crud-alignment`（merge `136b1eb`）:menu 讀側 Output DTO + 菜單類型 / 圖示類型對映來源。✅
- **W-FW1** `user-crud-wiring`（031,merge `a09d316`）:W-WEBUI 接線模式範本。✅
- **Constitution v1.1.0**:Principle IV W-WEBUI 受管例外。✅

### Follow-up（本 feature 範疇外、登 INTEGRATION-CHECKLIST「Deferred / future backlog」）

- **W-FW2-N1**:base-web menu `query` / `buttons` / `fixedIndexInTab` 的完整持久化（後端資料結構擴充 + 讀寫雙向接通）。
