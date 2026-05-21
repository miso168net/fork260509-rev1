# Feature Specification: W-FW1 — user-crud-wiring（base-web user CRUD 接線）

**Feature Branch**: `031-user-crud-wiring`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "W-FW1 user-crud-wiring — base-web manage/user 的新增/編輯/刪除/批次刪除接上 rust-api。設計依據 docs/superpowers/031-feature-user-crud-wiring.md。前端接線 + 後端 systemManage alias 轉換層。"

**Source**: [`docs/superpowers/031-feature-user-crud-wiring.md`](../../docs/superpowers/031-feature-user-crud-wiring.md)（brainstorming 2026-05-22 session — W-WEBUI 軌道第一個 feature;3 個釐清拍板）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.1.0 amendment,2026-05-22）:本 feature 是 amendment 後第一個合法行使該例外的 feature。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §5.1 W-FW1 + §4 base-web 修改範圍邊界。
- F9 `systemManage-alias-router`（merge `b2f910c`）:`/systemManage/*` alias 端點來源。
- F030 `systemManage-status-gender-alignment`（merge `0ed2e85`）:getUserList 的 `status` / `userGender` 輸出已對齊 base-web 展示值;本 feature 接 write 路徑。

## Scope summary

base-web `example` 分支的 user 管理頁有完整表格 UI,但新增/編輯抽屜的送出與列表的刪除全是 UI stub —— 不打任何後端 API。W-FW1 讓管理者在 base-web 真的能建立、編輯、刪除使用者。

| 面向 | deliverable |
|---|---|
| **新增 / 編輯** | base-web user 抽屜送出接上後端建立 / 更新端點;base-web 表單的展示值（狀態、性別）與後端 domain 值間的形狀落差由後端適應。 |
| **刪除 / 批次刪除** | base-web 列表的單筆 / 批次刪除接上後端刪除端點。 |

**範疇外**:
- ❌ `userRoles`（使用者的角色指派）接線 —— 讀寫整條未接、為獨立 feature 體量,另立 follow-up（INTEGRATION-CHECKLIST W-FW1-N1）。drawer 的角色多選欄維持顯示、提交時由後端忽略。
- ❌ password UX（建立時設密碼、改密碼、重設密碼）—— 本 feature 建立的 user 用後端預設密碼;完整密碼流程另案（W-FW1-N2）。
- ❌ role / menu 管理模組（W-FW2 / W-FW3 / W-FW4 範疇）。
- ❌ base-web 型別定義、表格 render、router、store、i18n、UI 樣式。

## Clarifications

### Session 2026-05-22（brainstorming 階段拍板）

- **Q1（形狀對齊放哪）**: base-web 表單模型與後端契約的欄位名 / 值域落差 → **A: 後端轉換層**。後端的 `/systemManage/` 建立 / 更新端點負責把 base-web 送的形狀對應到後端 domain 形狀（與 F030「輸出端對齊在後端」對稱、符 Constitution IV「後端適應 base」）。
- **Q2（建立密碼）**: base-web 新增抽屜無密碼欄 → **A: 後端預設密碼**。建立 user 時 base-web 未提供密碼,後端給予一個預設密碼。改密碼 / 重設密碼 UX 另案。
- **Q3（userRoles）**: 使用者角色的讀（列表硬回空）與寫（無路徑）整條未接 → **A: 本 feature 不處理**。角色指派需獨立 feature,drawer 的角色欄提交時被後端忽略。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 建立使用者（Priority: P1）🎯 MVP

管理者在 base-web user 管理頁點「新增」,於抽屜填入帳號、性別、暱稱、電話、Email、狀態後送出,系統建立該使用者並寫入資料庫,列表立即反映。F14 / F030 之前此抽屜送出只跳成功訊息、不打後端 —— 新使用者從未被建立。

**Why this priority**: 「建立使用者」是 user 管理最基礎的能力,也是 W-WEBUI 軌道第一個要證明「接線模式可行」的切片。建立通了即達成本 feature MVP。

**Independent Test**: 在 `/manage/user` 開新增抽屜、填表送出 → curl `getUserList` 或 psql 確認新 user 落 DB、列表 refresh 顯示。

**Acceptance Scenarios**:

1. **Given** 管理者在 user 管理頁,**When** 開新增抽屜、填妥必填欄位送出,**Then** 系統建立該使用者、寫入 DB、列表 refresh 顯示新使用者。
2. **Given** 新增抽屜未提供密碼,**When** 送出,**Then** 該使用者以一個預設密碼建立、可用該密碼登入。
3. **Given** 新增抽屜選了性別 / 狀態,**When** 送出,**Then** DB 落庫的性別 / 狀態語意與表單選項一致（啟用↔啟用態、男↔男）。
4. **Given** 後端拒絕建立（如帳號重複、欄位驗證失敗）,**When** 送出,**Then** base-web 顯示後端錯誤訊息、抽屜不關閉、不誤報成功。

### User Story 2 — 刪除 / 批次刪除使用者（Priority: P2）

管理者在 user 列表對某使用者點刪除、或勾選多筆後批次刪除,系統將其移除。base-web 既有刪除動作目前是 stub（只 console.log）。

**Why this priority**: 刪除是 user 管理的另一基礎能力,且後端刪除端點形狀單純（無形狀落差）、可獨立於建立 / 編輯交付驗證。

**Independent Test**: 在 `/manage/user` 對一筆 user 點刪除 → psql 確認該 user 為軟刪狀態、列表 refresh 不再顯示;勾選多筆批次刪除 → 全部軟刪。

**Acceptance Scenarios**:

1. **Given** user 列表有資料,**When** 對某 user 點刪除,**Then** 該使用者被軟刪、列表 refresh 不再顯示。
2. **Given** 列表勾選多筆 user,**When** 點批次刪除,**Then** 所有勾選使用者被軟刪。
3. **Given** 一筆 user 已被刪除,**When** 查資料庫,**Then** 該 row 仍存在且標記為已刪除（軟刪、非物理刪除）。

### User Story 3 — 編輯使用者（Priority: P3）

管理者對既有使用者點編輯,抽屜預填其現值,修改欄位後送出,變更持久化。

**Why this priority**: 編輯讓 user 管理完整;依賴與建立相同的形狀對齊機制,且涉及「不改密碼」語意,複雜度最高,排最後。

**Independent Test**: 對一筆既有 user 點編輯 → 確認抽屜預填現值 → 改某欄送出 → psql / `getUserList` 確認變更生效、密碼未被動。

**Acceptance Scenarios**:

1. **Given** 管理者對某 user 點編輯,**When** 抽屜開啟,**Then** 抽屜預填該使用者現有的帳號 / 性別 / 暱稱 / 電話 / Email / 狀態。
2. **Given** 編輯抽屜,**When** 改某欄位送出,**Then** 變更持久化、列表 refresh 反映。
3. **Given** 編輯抽屜不含密碼欄,**When** 送出,**Then** 該使用者既有密碼**不被變更**。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 必填欄位（帳號 / 狀態）未填 | base-web 既有表單驗證攔下、不送出 |
| E-2 | 後端拒絕（帳號重複 / 驗證失敗 / 無權限） | base-web 顯示後端錯誤 envelope 訊息、抽屜不關、不誤報成功 |
| E-3 | 編輯時不送密碼 | 既有密碼不變 |
| E-4 | 新增 / 編輯未選性別 | 該使用者性別為「無」（null） |
| E-5 | 無權限角色嘗試寫入 | 後端 Casbin 拒絕、base-web 顯示權限錯誤 |
| E-6 | drawer 的角色多選欄有值 | 提交時被後端忽略（範疇外、不報錯） |

## Requirements *(mandatory)*

### Functional Requirements

**A. 建立使用者**

- **FR-001**: base-web user 新增抽屜送出時 MUST 呼叫後端建立使用者端點,新使用者 MUST 寫入資料庫。
- **FR-002**: 建立時 base-web 表單送出的展示值（狀態、性別）MUST 被正確對應為後端的 domain 值;DB 落庫值的語意 MUST 與表單選項一致。
- **FR-003**: 當 base-web 新增表單未提供密碼,系統 MUST 為新使用者指派一個預設密碼,使該使用者可用該密碼登入。
- **FR-004**: 建立成功後,base-web user 列表 MUST refresh 並反映新使用者。

**B. 編輯使用者**

- **FR-005**: base-web user 編輯抽屜送出時 MUST 呼叫後端更新使用者端點,變更 MUST 持久化。
- **FR-006**: 編輯抽屜開啟時 MUST 預填該使用者現有欄位值（帳號 / 性別 / 暱稱 / 電話 / Email / 狀態）。
- **FR-007**: 編輯送出未含密碼時,系統 MUST NOT 變更該使用者既有密碼。
- **FR-008**: 編輯的展示值對應規則同 FR-002。

**C. 刪除使用者**

- **FR-009**: base-web 列表的單筆刪除 MUST 呼叫後端刪除端點;被刪使用者 MUST 為軟刪除（per Constitution II,row 留表、標記已刪）。
- **FR-010**: base-web 列表的批次刪除 MUST 對所有勾選使用者執行軟刪除。
- **FR-011**: 刪除 / 批次刪除成功後,base-web 列表 MUST refresh。

**D. 通用行為**

- **FR-012**: 所有寫入操作 MUST 經後端既有 Casbin enforcement;無權限角色 MUST 被拒絕。
- **FR-013**: 所有寫入操作 MUST 經後端既有 audit log 路徑（per Constitution II,業務 + audit 同 transaction）。
- **FR-014**: 後端任一寫入失敗（欄位驗證 / 權限 / 資料衝突）時,base-web MUST 顯示明確錯誤訊息,且 MUST NOT 關閉抽屜或誤報成功。

**E. 範疇紀律**

- **FR-015**: 本 feature 對 base-web 的修改 MUST 限於 W-WEBUI §4 受控範圍（user 模組的 API service function、user 抽屜的送出 handler、user 列表的刪除 handler）;MUST NOT 改動 base-web 型別定義、表格 render 邏輯、router、store、i18n key、UI 樣式。
- **FR-016**: 本 feature MUST NOT 改動 base-web user 抽屜的角色多選欄行為;角色指派為範疇外,提交時由後端忽略。
- **FR-017**: 本 feature MUST NOT 新增 DB migration、MUST NOT 改動 Casbin policy seed（`/systemManage/*` 寫入端點的 policy 既有）。
- **FR-018**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B 形態、nestjs 已退場）。
- **FR-019**: commit MUST 為多段式（base-web worktree + rust-api worktree + outer SHA pin）per CLAUDE.md §6.1。
- **FR-020**: acceptance MUST 用 CDP browser smoke + curl + psql 三者。

### Key Entities

- **base-web user 操作表單**: user 管理頁的新增 / 編輯抽屜（送出含帳號 / 性別 / 暱稱 / 電話 / Email / 狀態 / 角色欄）與列表的刪除 / 批次刪除動作。本 feature 前其送出 handler 皆為 stub。
- **後端 user 寫入端點**: `/systemManage/` 下的建立 / 更新 / 刪除 / 批次刪除使用者端點（F9 alias 交付、Casbin policy 既有）。
- **形狀對齊**: base-web 展示值（狀態、性別的 UI 值）與後端 domain 值（啟用狀態列舉、性別列舉）之間的對應;由後端適應（與 F030 輸出端對齊對稱）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者在 base-web user 管理頁可建立新使用者,送出後該使用者出現在列表、且存於資料庫。
- **SC-002**: 管理者可編輯既有使用者,變更持久化並反映於列表;編輯不改動未涉及的欄位（含密碼）。
- **SC-003**: 管理者可單筆 / 批次刪除使用者,被刪使用者從列表消失,且資料庫中為軟刪狀態（保留可追溯性、可被 cleanup job 後續處理）。
- **SC-004**: 建立 / 編輯時 base-web 表單的狀態、性別選項與資料庫落庫值語意 100% 一致。
- **SC-005**: 後端寫入失敗時,base-web 100% 顯示明確錯誤訊息、不誤報成功。
- **SC-006**: 本 feature 對 base-web 的改動限於 user 管理模組的 service / 接線檔;nestjs fork 0 改動;無 DB migration。
- **SC-007**: 既有功能不退化 —— 登入、動態 menu、user / role / menu 三表讀取仍正常。

## Assumptions

- **A-001**: rust-api 的 `/systemManage/` 建立 / 更新 / 刪除 / 批次刪除使用者 alias 端點已存在（F9 交付）、Casbin policy 已 seed —— DESIGN-B §7 回歸驗證（2026-05-22）已實機確認運作。
- **A-002**: base-web user 抽屜表單欄位為 帳號 / 性別 / 暱稱 / 電話 / Email / 狀態 / 角色;`getUserList` 已回傳對齊 base-web 展示值的狀態（'1'/'2'）與性別（'1'/'2'/null）（F030 交付），故編輯抽屜「讀」側預填的狀態 / 性別已對齊,本 feature 只需接「寫」側。
- **A-003**: base-web 的 request helper 對「HTTP 成功但 body 業務碼非成功」已有既有錯誤呈現機制,本 feature 沿用、不改型別。
- **A-004**: 建立 user 用後端預設密碼於 dev / 整合階段為合理取捨（base-web example 抽屜本就無密碼欄、專案 seed 帳號亦為固定密碼）;完整密碼 UX 為獨立 follow-up（INTEGRATION-CHECKLIST W-FW1-N2）。
- **A-005**: Constitution Principle IV「W-WEBUI 受管例外」（v1.1.0,2026-05-22）已生效,本 feature 對 base-web 的修改在明文授權範圍內。
- **A-006**: base-web 編輯抽屜無密碼欄,編輯送出不帶密碼;後端更新端點須支援「不帶密碼則不改密碼」（具體機制為 `/speckit-plan` Phase 0 research）。

## Dependencies

### Inbound（本 feature 依賴）

- **F9** `systemManage-alias-router`（merge `b2f910c`）:`/systemManage/*` 寫入 alias 端點。✅
- **F030** `systemManage-status-gender-alignment`（merge `0ed2e85`）:輸出端 status / gender 對齊 + gender 寫入欄位。✅
- **Constitution v1.1.0**（2026-05-22）:Principle IV W-WEBUI 受管例外。✅

### Follow-up（本 feature 範疇外、已登 INTEGRATION-CHECKLIST「Deferred / future backlog」）

- **W-FW1-N1**:base-web user `userRoles` 接線（讀 + 寫 + Casbin `g` rule 同步）— 獨立 feature。
- **W-FW1-N2**:user password UX（建立設密碼 / 改密碼 / 重設密碼）。
