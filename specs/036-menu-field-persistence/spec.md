# Feature Specification: W-FW7 — menu-field-persistence（菜單欄位持久化）

**Feature Branch**: `036-menu-field-persistence`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "W-FW7 menu-field-persistence — 整併 W-FW2-N1（032 menu-crud-wiring 留下的 follow-up）：menu `query` / `buttons` / `fixedIndexInTab` 三欄持久化、`sys_menu` schema 擴充、雙向接通（寫入 + admin CRUD round-trip + runtime route 生效）。"

**Source**: [`docs/superpowers/036-feature-menu-field-persistence.md`](../../docs/superpowers/036-feature-menu-field-persistence.md)（brainstorming 2026-05-23 session — W-WEBUI follow-up 軌道第二個 feature；2 個釐清拍板、儲存模型拍板已確認）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.2.0，列舉含 `W-FW1`–`W-FW7`、准動範圍含「§4 授權下最小 UI 新增」）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §7.3 W-FW7 + §4 base-web 修改範圍邊界。
- W-FW2 `menu-crud-wiring`（032，merge `8ccc4b4`）：本 feature 補完 W-FW2 當時切為 follow-up 的 W-FW2-N1（menu `query` / `buttons` / `fixedIndexInTab` 持久化）。

## Scope summary

W-FW2 把 base-web `manage/menu` 的 menu CRUD 接通，但 `query` / `buttons` / `fixedIndexInTab` 三個欄位在 base-web menu modal 中已有 UI 與送出邏輯，後端卻因 `sys_menu` 表缺欄位 → 寫入路徑刻意 scope-out（serde 靜默忽略）、讀出路徑硬寫 `None`。本 feature 補完這條鏈路，讓 3 個欄位真正持久化、且其中 `query` / `fixedIndexInTab` 在動態路由 runtime 真正生效。

| 面向 | deliverable |
|---|---|
| **持久化** | `sys_menu` 表加 3 個 nullable 欄位（`query` / `buttons` / `fixed_index_in_tab`）；現有 menu row 不受影響。 |
| **寫入 round-trip** | menu modal 送出的 3 個欄位經 systemManage 路徑透傳至後端、寫入新欄位。 |
| **admin CRUD 讀回** | 後端 menu 列表查詢回傳 3 個欄位的真實值（取代既有 `null`）；編輯抽屜預填正確。 |
| **runtime route 生效** | `query` / `fixedIndexInTab` 進動態路由的路由 meta，前端路由系統使用其值（query 預設參數注入、tab 固定索引行為生效）。`buttons` **不**進此路徑。 |

**範疇外**：

- ❌ menu CRUD 其他既有行為（W-FW2 已接、不重做）。
- ❌ `buttons` 的 runtime 按鈕權限消費（屬 W-FW6 button-auth 範疇；本 feature 僅讓 `buttons` 在 admin 端持久化並 round-trip）。
- ❌ base-web 型別定義 `src/typings` 改動（既有型別已涵蓋 3 個欄位）。
- ❌ nestjs fork 改動（DESIGN-B、nestjs 已退場）。
- ❌ `sys_menu` 其他結構變更。

## Clarifications

### Session 2026-05-23（brainstorming 階段拍板）

- **Q1（讀範疇）**：3 個欄位有兩條「讀」路徑 —— (a) admin menu CRUD round-trip、(b) runtime 動態路由 meta 生效。→ **A：(a)+(b) 雙路徑都接**。設定的值在 runtime 真正生效才算「完整可用」，符合本 feature「持久化 + 雙向接通」的目標。
- **Q2（buttons 範疇）**：`buttons` 是否同 `query`/`fixedIndexInTab` 進 runtime route 輸出。→ **A：buttons 只做 admin CRUD round-trip、不進 runtime route**。`buttons` 在前端 `Menu` 型別是頂層欄位、不在 vue-router `RouteMeta`；runtime 的按鈕權限走「使用者可用的 button code 清單」、不是路由 meta。menu 的 `buttons` 定義之 runtime 消費（將其指派給角色）由 W-FW6 button-auth 承擔，符合既有架構。
- **儲存模型拍板**：3 個欄位儲存形態。→ **方案 1：`sys_menu` 加 3 個欄位、query/buttons 用 JSON 結構欄、fixedIndexInTab 用整數欄**。additive 低風險、對映資料的自然形狀、與既有讀出 DTO 形狀一致。否決方案 2（正規化子表 —— over-engineering，3 個欄位永遠嵌在 menu 裡、不被獨立查詢）與方案 3（單一 JSON blob —— 整數與陣列混存失去 schema 清晰度）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 菜單欄位持久化 + admin CRUD round-trip（Priority: P1）🎯 MVP

管理者在 base-web menu 編輯抽屜填入 `query`（路由查詢參數清單）、`buttons`（菜單按鈕定義清單）、`fixedIndexInTab`（固定頁籤索引）任一或全部，送出後該值被後端持久化；下次開啟同一筆 menu 編輯時，三個欄位的值都正確預填為剛送出的值。此前 base-web 已有送出邏輯，但後端 schema 缺欄、寫入靜默丟棄、讀出硬寫 `null`，故編輯後再開等於沒改。

**Why this priority**：這是補完 W-FW2-N1 的核心切片，且是「runtime 生效」的前置（值要先能存）—— 故為 MVP。可獨立交付：US1 完成後即使 US2 不做，admin 仍能在 menu CRUD 中設定並讀回這 3 個欄位（值會存進 DB、admin 端可見），只是不會在 runtime 自動生效。

**Independent Test**：在 `/manage/menu` 編輯任一 menu，填入三個欄位的非空值送出 → 重開該 menu 編輯抽屜確認預填 → 對照資料庫該 menu row 的對應欄位儲存正確。

**Acceptance Scenarios**:

1. **Given** 某 menu 既有 `query` / `buttons` / `fixedIndexInTab` 皆為空，**When** 管理者編輯該 menu 填入這三個欄位的值並送出，**Then** 該 menu 在資料庫的對應欄位儲存所填值；重開編輯抽屜時三欄位預填一致。
2. **Given** 某 menu 已有這三個欄位的值，**When** 管理者編輯並調整任一欄位（增刪 query 項目、增刪 button、改 fixedIndexInTab）送出，**Then** 該欄位的新值正確儲存；其他未調整的欄位不變。
3. **Given** 某 menu 已有 `buttons` 清單，**When** 管理者把 `buttons` 改為空清單送出，**Then** 該 menu 的 `buttons` 持久化為空清單（不是維持原值、也不是變 `null`）。
4. **Given** 一筆新 menu 透過編輯抽屜建立、三個欄位皆未填，**When** 送出，**Then** 該 menu 建立成功；三個欄位在資料庫為空值（null）；既有 menu 行為（必填欄位、status、parentId 等）不受影響。
5. **Given** menu 列表查詢回傳，**When** base-web 取得 menu 清單，**Then** 每筆 menu 帶有真實的 `query` / `buttons` / `fixedIndexInTab` 值（既有有設值的 menu 不再因後端硬寫 `null` 而顯示空白）。

### User Story 2 — runtime 動態路由生效（Priority: P2）

使用者登入後取得動態路由清單，路由的 meta 帶有該 menu 的 `query` 與 `fixedIndexInTab` 值，前端路由系統據此運作 —— `query` 作為導覽該路由時注入的預設查詢參數、`fixedIndexInTab` 作為該頁籤固定索引的依據。

**Why this priority**：US1 的持久化是必要前提；US2 把 admin 設定的值在 runtime 真正運作起來，是「完整可用」的最後一哩。可獨立於 US1 之後交付。

**Independent Test**：對某 menu 設定 `query`（如 `[{key:'a', value:'1'}]`）與 `fixedIndexInTab`（如 `0`）→ 該 menu 對應角色的使用者登入 → 透過動態路由端點取得路由清單 → 該 menu 對應的路由的 `meta.query` 與 `meta.fixedIndexInTab` 反映所設值。

**Acceptance Scenarios**:

1. **Given** 某 menu 在資料庫的 `query` 有值（非空清單），**When** 該 menu 對應角色的使用者透過動態路由端點取得路由清單，**Then** 該 menu 對應路由的 `meta.query` 反映其值。
2. **Given** 某 menu 在資料庫的 `fixed_index_in_tab` 有值，**When** 取得動態路由清單，**Then** 該 menu 對應路由的 `meta.fixedIndexInTab` 反映其值。
3. **Given** 某 menu 的 `query` / `fixed_index_in_tab` 為空（null），**When** 取得動態路由清單，**Then** 該 menu 對應路由的 meta 不出現對應欄位（向後相容、舊客戶端不受影響）。
4. **Given** 某 menu 在資料庫的 `buttons` 有值，**When** 取得動態路由清單，**Then** 該 menu 對應路由的 meta **不**含 `buttons` 欄位（buttons 不進 runtime route，Q2 拍板）。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 既有（W-FW7 前建立）menu row 的新 3 欄為 null | menu CRUD 列表、編輯抽屜正常顯示為空；動態路由 meta 不出現對應欄位（向後相容）|
| E-2 | 編輯 menu 不調整 3 個欄位、只改別的欄位（如 menuName） | 3 個欄位的值維持原狀、不被誤清 |
| E-3 | `query` / `buttons` 送出為空清單 `[]` | 持久化為空清單（合法清空，不誤判為「未提供」）|
| E-4 | `query` / `buttons` 送出為 `null` 或省略該鍵 | 持久化為 null（「未提供」）|
| E-5 | 後端寫入失敗（驗證失敗 / 權限不足） | base-web 顯示明確錯誤、抽屜不誤報成功、不關閉 |
| E-6 | 動態路由 meta 中 `query` / `fixedIndexInTab` 對應的舊客戶端版本未認識新欄位 | 舊客戶端忽略未識別欄位、不影響其他既有功能 |

## Requirements *(mandatory)*

### Functional Requirements

**A. 持久化基礎**

- **FR-001**: 後端 `sys_menu` 資料表 MUST 含 `query` / `buttons` / `fixed_index_in_tab` 三個欄位；三者皆 MUST 為可空，現有 menu row 升級後 MUST 預設為空。
- **FR-002**: `query` 與 `buttons` MUST 以結構化形式儲存（足以表達 `{key,value}[]` / `{code,desc}[]` 的形狀並原樣讀回）；`fixed_index_in_tab` MUST 以整數形式儲存。

**B. 寫入路徑**

- **FR-003**: 後端 menu 建立 / 更新端點 MUST 接受並寫入 `query` / `buttons` / `fixedIndexInTab` 三個欄位（透過 systemManage 路徑送入時的 camelCase 鍵）。
- **FR-004**: 寫入時，三個欄位的「未提供」MUST 與「空清單」/「空值」可明確區別 —— 未提供（缺鍵 / `null`）MUST 不覆蓋既有值（或建立時設為 null）；明示的空清單 MUST 持久化為空清單。
- **FR-005**: 寫入時，三個欄位的變動 MUST 沿用既有 menu 建立 / 更新的稽核紀錄（不需額外稽核邏輯）。

**C. admin 讀出（CRUD round-trip）**

- **FR-006**: 後端 menu 列表查詢回傳的每筆 menu MUST 帶有其 `query` / `buttons` / `fixedIndexInTab` 真實值；MUST NOT 硬寫為 `null` / 預設值。
- **FR-007**: base-web menu 編輯抽屜開啟編輯模式時 MUST 預填該 menu 在後端的真實 `query` / `buttons` / `fixedIndexInTab` 值。

**D. runtime 動態路由**

- **FR-008**: 動態路由端點回傳的每筆路由 MUST 在其路由 meta 中帶 `query` 與 `fixedIndexInTab` 欄位（若該 menu 的對應欄位有值）。
- **FR-009**: 當某 menu 的 `query` / `fixed_index_in_tab` 在資料庫為 null 時，動態路由 meta MUST NOT 出現對應欄位（向後相容）。
- **FR-010**: 動態路由 meta MUST NOT 出現 `buttons` 欄位（Q2 拍板：buttons 不進 runtime route）。

**E. 範疇紀律**

- **FR-011**: 本 feature 對 base-web 的修改 MUST 限於必要的單檔（最多 `src/views/manage/menu/modules/menu-operate-modal.vue`，§4 准動清單內）；MUST NOT 改動 `src/typings`、router、store、i18n key、其他頁面、版面樣式；預期改動量 **0 檔**，若 Phase 0 驗證後確需微調限於上述單檔。
- **FR-012**: 本 feature 對 `sys_menu` 表的結構變更 MUST 限於新增三個欄位；MUST NOT 改動 `sys_menu` 其他欄位、其他資料表結構、或其他資料庫物件（索引除外，若新欄位需要索引則另議）。
- **FR-013**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B 形態、nestjs 已退場）。
- **FR-014**: commit MUST 為多段式（base-web worktree（若有改動）+ rust-api worktree + outer SHA pin）per CLAUDE.md §4.1。
- **FR-015**: acceptance MUST 用 CDP browser smoke + curl + psql 三者覆蓋（比照 W-FW1~W-FW5 慣例）。

### Key Entities

- **菜單（`sys_menu`）**：admin 端定義的選單項目；本 feature 為其新增 `query`（路由查詢參數清單）、`buttons`（按鈕定義清單）、`fixedIndexInTab`（固定頁籤索引）三個屬性的儲存能力。
- **菜單按鈕定義（`buttons` 欄位內容）**：每個 menu 上可定義的按鈕集合，每個按鈕由代碼（`code`）與描述（`desc`）組成；本 feature 僅持久化該定義，不處理「角色獲准使用哪些按鈕」（屬 W-FW6 範疇）。
- **路由查詢參數（`query` 欄位內容）**：每個 menu 對應路由的預設查詢參數清單，每筆為 `{key,value}` 對；前端動態路由系統在導覽到該路由時使用。
- **固定頁籤索引（`fixedIndexInTab` 欄位）**：整數，指定該 menu 對應路由在 tab 系統中的固定位置；前端動態路由系統使用。
- **菜單編輯抽屜**：base-web `manage/menu` 的新增 / 編輯抽屜；既有 UI 已含這三個欄位的輸入元件（W-FW2 之前的 starter UI）。
- **動態路由 meta**：每筆動態路由附帶的 meta 物件，描述該路由的行為屬性；本 feature 為其新增 `query` 與 `fixedIndexInTab` 兩個屬性。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 管理者在 menu 編輯抽屜填入 `query` / `buttons` / `fixedIndexInTab` 任一或全部值並送出後，100% 持久化於資料庫。
- **SC-002**: 管理者重新開啟同一筆 menu 編輯抽屜時，三個欄位的預填值 100% 對應其資料庫實際值。
- **SC-003**: 後端 menu 列表查詢回傳的每筆 menu 100% 帶有真實的 `query` / `buttons` / `fixedIndexInTab` 值（既有有設值的 menu 不再因後端硬寫 `null` 而顯示為空）。
- **SC-004**: 對某 menu 設定 `query` / `fixedIndexInTab` 後，該 menu 對應角色的使用者經動態路由端點取得的路由清單，其 meta 中 100% 反映所設值。
- **SC-005**: 動態路由 meta 100% 不出現 `buttons` 欄位（不論 menu 的 `buttons` 是否有值）。
- **SC-006**: 既有 menu CRUD 行為（其他欄位、必填驗證、parentId、status、icon、動態 menu 載入等）100% 不退化。
- **SC-007**: 本 feature 的後端 schema 變更僅為 `sys_menu` 新增三個欄位、且新欄位皆可空；既有 menu row 100% 不受影響。
- **SC-008**: 本 feature 對 base-web 的改動限於 §4 受控範圍 0~1 檔（預期 0 檔，若需微調限於 `menu-operate-modal.vue`）；nestjs fork 0 改動。

## Assumptions

- **A-001**: `sys_menu` 表既有 schema 已足以支撐本 feature 的「新增三個欄位」變更；無需先做其他 schema 重整。
- **A-002**: base-web `menu-operate-modal.vue` 已含 `query` / `buttons` / `fixedIndexInTab` 三個欄位的輸入 UI 元件、表單模型欄位、初始化與送出邏輯（W-FW2 之前的 starter UI；W-FW2 階段刻意保留為「UI 在、後端不接」）。**待 plan Phase 0 驗證**：modal 是否實際 render 這 3 欄輸入元件、且編輯預填在後端原值為 `null` 時行為合理（前端模型期待 `[]` 等空集合 vs 後端回 `null`）。
- **A-003**: base-web 型別定義 `Api.SystemManage.Menu` 已宣告 `query` / `fixedIndexInTab`（透過 `MenuPropsOfRoute` 路由 meta）與 `buttons`（頂層欄位）—— 本 feature 不需動 `src/typings`（§4 准動清單外、原本即不准動）。
- **A-004**: 後端動態路由端點（`getUserRoutes` / `getConstantRoutes`）的路由輸出 DTO 路由 meta 加入新欄位後，舊客戶端 base-web 因 vue-router meta 對未識別欄位是包容的，不會因此退化（向後相容；FR-009 / E-6 對應）。
- **A-005**: rust-api 既有 menu 建立 / 更新的稽核紀錄機制（business + audit 同 transaction）對新增欄位自動涵蓋（audit snapshot 對整個 menu entity 序列化），無需新增稽核邏輯。
- **A-006**: W-FW6 按鈕授權 feature 將從 `sys_menu.buttons` 的定義中取得「某 menu 上可指派的按鈕清單」；本 feature 的 `buttons` 持久化是 W-FW6 的前置資料源（W-FW6 屆時自行接通，不在本 feature 範疇）。
- **A-007**: Constitution Principle IV「W-WEBUI 受管例外」（v1.2.0）已生效（含 `W-FW1`–`W-FW7`、准動範圍含「§4 授權下最小 UI 新增」）—— 本 feature 在此例外範圍內。
- **A-008（待 plan Phase 0 釐清）**：codebase 既有 JSON 結構欄位的儲存體例（如 audit log payload 欄位）—— `query` / `buttons` 應沿用同一形式以保持一致。由 `/speckit-plan` Phase 0 research 解析。

## Dependencies

### Inbound（本 feature 依賴）

- **W-FW2** `menu-crud-wiring`（032，merge `8ccc4b4`）：base-web menu CRUD 接線、`SystemManageMenuOutput` 預留三欄宣告、systemManage menu transform handler 骨架。✅
- **F3** `soft-delete-infrastructure`（merge `0f1c5c3`）：`sys_menu` 既有 soft-delete + `route_name` 部分唯一索引（與本 feature 新欄位無衝突，但 schema 變更須相容）。✅
- **Constitution v1.2.0**：Principle IV W-WEBUI 受管例外（含 W-FW7）+ §4 准動範圍納入「最小 UI 新增」。✅

### Follow-up（本 feature 範疇外）

- **W-FW6** `role-authorization-completion`：W-WEBUI follow-up 軌道下一個 feature，整併 button-auth modal（將從 `sys_menu.buttons` 取得可指派按鈕清單）等 4 個 N 項；本 feature 為其前置資料源。
