# Feature Specification: W-FW5 — user-role-and-password-wiring（base-web user 角色指派 + 密碼 UX）

**Feature Branch**: `035-user-role-and-password-wiring`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "W-FW5 user-role-and-password-wiring — base-web manage/user 補完 W-FW1 未做的兩塊：使用者角色指派接線（讀回現有角色 + 寫入變更）、密碼 UX（admin 建立設密碼 / admin 重設 / user 自助修改 + 修正 update_user 密碼未 hash 的 pre-existing bug）。"

**Source**: [`docs/superpowers/035-feature-user-role-and-password-wiring.md`](../../docs/superpowers/035-feature-user-role-and-password-wiring.md)（brainstorming 2026-05-22 session — W-WEBUI follow-up 軌道第一個 feature；3 個釐清拍板、user 已核准）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.1.0）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §7.1 W-FW5 + §4 base-web 修改範圍邊界（含 2026-05-22 W-FW5 §4 amendment：密碼 UX 最小 UI 新增例外）。
- W-FW1 `user-crud-wiring`（031，merge `a09d316`）：本 feature 補完 W-FW1 當時切為 follow-up 的 user→roles（W-FW1-N1）與 password UX（W-FW1-N2）。

## Scope summary

W-FW1 把 base-web `manage/user` 的 user CRUD 接通，但刻意把兩塊切為 follow-up：使用者的角色指派（drawer 角色多選欄 UI 已在、後端整條未接）與密碼 UX（建立用後端硬寫預設密碼、無重設、無自改）。W-FW5 補完這兩塊，讓 base-web user 管理「完整可用」。

| 面向 | deliverable |
|---|---|
| **使用者角色指派** | user 編輯抽屜的角色多選欄真實反映並可變更該使用者的角色集合；變更持久化、影響該使用者的權限。 |
| **admin 設定 / 重設密碼** | 管理者在 user 抽屜可於建立時設定使用者初始密碼、於編輯時重設使用者密碼。 |
| **使用者自助修改密碼** | 使用者可在帳號中心驗證舊密碼後修改自己的密碼。 |
| **密碼寫入正確性** | 經由更新路徑寫入的密碼一律以雜湊形式儲存（修正既有未雜湊缺陷）。 |

**範疇外**：
- ❌ 帳號中心的個人資料編輯、頭像等非密碼功能。
- ❌ 驗證碼登入 / 使用者註冊 / 忘記密碼（未登入狀態的密碼重置）—— DESIGN-W-WEBUI §3.2 登入類表單，屬「後端先行」性質的另立 follow-up。
- ❌ role / menu 管理（W-FW6 / W-FW7）。
- ❌ 後端使用者 / 角色 / 使用者-角色關聯資料表的結構變更。
- ❌ base-web 型別定義、表格 render、router、store、i18n key、版面重構。

## Clarifications

### Session 2026-05-22（brainstorming 階段拍板）

- **Q1（password 範疇）**: password UX 的 3 個流程（建立設密碼 / admin 重設 / 使用者自改）都需 base-web 新增 UI、超出 W-WEBUI §4「只接線、不改 UI」邊界。→ **A: 含完整密碼 UX**。3 流程全做；接受擴 DESIGN-W-WEBUI §4 base-web 邊界（已於 2026-05-22 amend §4，明文授權 W-FW5 的最小 UI 新增）。
- **Q2（admin 重設機制）**: → **A: 抽屜 password 欄共用**。user 抽屜加一個選填密碼欄 —— 建立時填入即初始密碼、編輯時留空＝不改 / 填入＝重設。一個欄位涵蓋「建立設密碼」與「admin 重設」，不另設獨立重設按鈕 / 對話框。
- **Q3（使用者自改範疇）**: → **A: 補進帳號中心既有占位頁**。把帳號中心的占位頁補成一個最小「修改密碼」面板（舊密碼 / 新密碼 / 確認）；不做個人資料等非密碼功能。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 使用者角色指派（Priority: P1）🎯 MVP

管理者在 base-web user 管理頁編輯某使用者時，抽屜的「角色」多選欄**真實顯示**該使用者目前被指派的角色；管理者可增刪角色並送出，該使用者的角色集合隨之更新並持久化。此前角色欄的顯示與送出皆無效 —— 編輯時永遠空白、送出的角色變更被後端忽略。

**Why this priority**: 「使用者屬於哪些角色」是 RBAC 管理的核心；角色決定使用者的權限。這是可獨立交付、獨立驗收的最小有價值切片，且不涉及 base-web UI 新增（抽屜角色欄 UI 早已存在）。

**Independent Test**: 在 `/manage/user` 對一使用者開編輯抽屜 → 確認角色欄勾選與資料庫中該使用者的角色關聯一致；調整後送出 → 確認關聯更新為送出的集合。

**Acceptance Scenarios**:

1. **Given** 某使用者已被指派一組角色，**When** 管理者開啟其編輯抽屜，**Then** 角色多選欄預先選取該使用者目前的角色、未指派的角色不選取。
2. **Given** 某使用者無任何角色，**When** 開啟其編輯抽屜，**Then** 角色欄無任何預選。
3. **Given** 管理者在抽屜為某使用者增選 / 移除角色，**When** 送出，**Then** 該使用者的角色關聯持久化為送出的集合（新增的指派新增、移除的指派移除）。
4. **Given** 管理者建立新使用者並指定角色，**When** 送出，**Then** 新使用者建立並取得指定的角色。
5. **Given** 不同使用者，**When** 分別開啟各自編輯抽屜，**Then** 各自顯示各自的角色、互不混淆。

### User Story 2 — admin 設定 / 重設使用者密碼（Priority: P2）

管理者在 user 抽屜可於**建立**使用者時設定其初始密碼、於**編輯**使用者時重設其密碼。此前抽屜無密碼欄 —— 建立一律套用後端硬寫的預設密碼、且無任何重設管道。

**Why this priority**: 讓管理者能掌控使用者密碼是基本管理能力；依賴密碼寫入路徑正確（見 FR-009），故排於 US1 之後。

**Independent Test**: 在 user 抽屜建立帶自訂密碼的使用者 → 以該密碼登入成功；對既有使用者編輯並填入新密碼送出 → 以新密碼登入成功、舊密碼失效。

**Acceptance Scenarios**:

1. **Given** 管理者在建立抽屜填入密碼，**When** 送出，**Then** 新使用者以該密碼建立、可用該密碼登入。
2. **Given** 管理者在建立抽屜未填密碼，**When** 送出，**Then** 新使用者以系統預設密碼建立（沿 W-FW1 既有行為、不報錯）。
3. **Given** 管理者在編輯抽屜填入新密碼，**When** 送出，**Then** 該使用者密碼更新為新密碼、可用新密碼登入、舊密碼失效。
4. **Given** 管理者在編輯抽屜未填密碼，**When** 送出，**Then** 該使用者密碼維持不變。
5. **Given** 任一經由建立或編輯寫入的密碼，**When** 檢視其在資料庫的儲存形式，**Then** 密碼以雜湊形式儲存、非明文。

### User Story 3 — 使用者自助修改密碼（Priority: P3）

使用者登入後在帳號中心可修改自己的密碼 —— 輸入舊密碼與新密碼，舊密碼驗證通過後密碼更新。此前帳號中心為占位頁、無此功能。

**Why this priority**: 自助修改密碼是完整密碼 UX 的一環，但使用對象（一般使用者）與管理者流程不同、可獨立交付，故排最後。

**Independent Test**: 以某使用者登入 → 進帳號中心修改密碼 → 舊密碼錯誤時被拒、正確時更新成功 → 以新密碼重新登入成功、舊密碼失效。

**Acceptance Scenarios**:

1. **Given** 使用者在帳號中心輸入正確舊密碼與新密碼，**When** 送出，**Then** 密碼更新、顯示成功、可用新密碼登入。
2. **Given** 使用者輸入錯誤的舊密碼，**When** 送出，**Then** 後端拒絕、顯示錯誤訊息、密碼不變。
3. **Given** 使用者的新密碼與確認欄不一致，**When** 送出，**Then** base-web 阻擋送出並提示。
4. **Given** 使用者修改密碼成功，**When** 以舊密碼嘗試登入，**Then** 登入失敗。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 編輯使用者抽屜未變更角色直接送出 | 該使用者角色維持不變、不報錯 |
| E-2 | 將某使用者的角色一次全部移除 | 該使用者角色關聯清空、不報錯 |
| E-3 | 編輯抽屜的密碼欄留空送出 | 不改動該使用者密碼（僅其他欄位更新） |
| E-4 | 後端拒絕角色或密碼的寫入（無權限 / 驗證失敗） | base-web 顯示錯誤訊息、抽屜 / 面板不關閉、不誤報成功 |
| E-5 | 使用者自助修改密碼時舊密碼錯誤 | 後端拒絕、密碼不變、顯示明確錯誤 |
| E-6 | 指派一個不存在的角色 | 後端拒絕、不寫入無效關聯 |

## Requirements *(mandatory)*

### Functional Requirements

**A. 使用者角色指派**

- **FR-001**: base-web 使用者編輯抽屜開啟時 MUST 顯示該使用者目前實際被指派的角色集合；MUST NOT 顯示空白或假資料。
- **FR-002**: base-web 使用者抽屜送出時 MUST 將該使用者的角色關聯更新為抽屜中選取的角色集合（建立與編輯皆然）。
- **FR-003**: 角色關聯的儲存 MUST 為差異更新 —— 新選取的角色新增關聯、取消選取的角色移除關聯、未變動的維持。
- **FR-004**: 使用者列表查詢回傳的每筆使用者 MUST 帶有該使用者實際的角色集合，使編輯抽屜的預選正確。
- **FR-005**: 角色指派變更後，受影響使用者於下一次取得自身權限 / 動態選單時 MUST 反映新的角色集合（既有 RBAC 機制，本 feature 不改、僅須不破壞）。

**B. admin 設定 / 重設密碼**

- **FR-006**: base-web 使用者抽屜 MUST 提供一個選填的密碼欄。
- **FR-007**: 建立使用者時，若密碼欄有值，新使用者 MUST 以該值為初始密碼；若留空，MUST 套用系統預設密碼（沿 W-FW1 既有行為）。
- **FR-008**: 編輯使用者時，若密碼欄有值，該使用者密碼 MUST 更新為新值；若留空，密碼 MUST 維持不變。
- **FR-009**: 經由建立或編輯寫入的密碼 MUST 以雜湊形式儲存，MUST NOT 以明文儲存。

**C. 使用者自助修改密碼**

- **FR-010**: 帳號中心 MUST 提供一個修改密碼面板，包含舊密碼、新密碼、確認新密碼三個輸入。
- **FR-011**: 自助修改密碼 MUST 由後端驗證舊密碼；舊密碼錯誤 MUST 拒絕且密碼不變。
- **FR-012**: base-web MUST 在送出前驗證新密碼與確認欄一致；不一致 MUST 阻擋送出。
- **FR-013**: 自助修改成功後，使用者密碼 MUST 更新為新值並以雜湊形式儲存。

**D. 通用行為**

- **FR-014**: 角色指派與密碼寫入 MUST 經後端既有權限控制；無權限者 MUST 被拒絕。
- **FR-015**: 後端寫入失敗（權限 / 驗證 / 資料衝突）時，base-web MUST 顯示明確錯誤訊息，且 MUST NOT 關閉抽屜 / 面板或誤報成功。
- **FR-016**: 角色指派所需的權限範圍識別（domain）MUST 由後端依請求者身分注入 —— base-web MUST NOT 需要感知或傳送 domain。

**E. 範疇紀律**

- **FR-017**: 本 feature 對 base-web 的修改 MUST 限於 W-WEBUI §4 受控範圍（含 2026-05-22 §4 amendment 授權的最小 UI 新增：使用者抽屜密碼欄、帳號中心修改密碼面板）；MUST NOT 改動 base-web 型別定義、表格 render、router、store、i18n key、版面樣式。
- **FR-018**: 本 feature MUST NOT 改動後端使用者 / 角色 / 使用者-角色關聯資料表的結構。
- **FR-019**: 本 feature MUST NOT 改動 nestjs fork 源碼（DESIGN-B 形態、nestjs 已退場）。
- **FR-020**: commit MUST 為多段式（base-web worktree + rust-api worktree + outer SHA pin）per CLAUDE.md §4.1。
- **FR-021**: acceptance MUST 用 CDP browser smoke + curl + psql 三者。

### Key Entities

- **使用者-角色關聯**: 某使用者被指派的角色集合，以「使用者-角色關聯」紀錄表達；本 feature 前 base-web 抽屜對此的讀寫皆無效。
- **使用者編輯抽屜**: base-web user 管理頁的新增 / 編輯抽屜，含角色多選欄（既有 UI）與密碼欄（本 feature 新增）。
- **帳號中心修改密碼面板**: 帳號中心頁內的修改密碼面板（本 feature 新增），含舊 / 新 / 確認密碼輸入。
- **使用者密碼**: 使用者的登入憑證，以雜湊形式儲存；本 feature 涉及其經由 admin 寫入與使用者自助修改兩條路徑。
- **權限範圍識別（domain）**: 角色指派以 domain 區隔；base-web 不感知，由後端依請求者身分注入。

## Success Criteria *(mandatory)*

- **SC-001**: 管理者開啟任一使用者的編輯抽屜，角色欄勾選 100% 對應該使用者在資料庫中的實際角色關聯。
- **SC-002**: 管理者調整角色並送出後，該使用者的角色關聯在資料庫中更新為送出的集合（新增 / 移除皆正確）。
- **SC-003**: 角色指派變更後，受影響使用者取得的權限 / 動態選單反映新的角色集合。
- **SC-004**: 管理者於建立抽屜設定的初始密碼、於編輯抽屜重設的密碼，皆可用於登入；未填密碼欄時建立沿用預設、編輯不改密碼。
- **SC-005**: 使用者可於帳號中心以正確舊密碼修改自己的密碼；舊密碼錯誤 100% 被拒。
- **SC-006**: 所有經由 admin 寫入或使用者自助修改的密碼，在資料庫中 100% 以雜湊形式儲存、無明文。
- **SC-007**: 後端讀取 / 寫入失敗時，base-web 100% 顯示明確錯誤訊息、不誤報成功。
- **SC-008**: 本 feature 對 base-web 的改動限於 §4 受控範圍（含 amendment 授權的 UI 新增）；nestjs fork 0 改動；後端使用者 / 角色相關資料表 0 結構變更。
- **SC-009**: 既有功能不退化 —— 登入、動態選單、user / menu / role 三表 CRUD 仍正常。

## Assumptions

- **A-001**: rust-api 已有使用者-角色關聯的資料表，且有可參照的差異更新體例（角色→使用者方向的指派已於 F8 交付）—— 本 feature 在其上補使用者→角色方向的讀寫，不重做業務邏輯。
- **A-002**: base-web 使用者編輯抽屜的角色多選欄 UI 與角色清單載入已於 W-FW1 就位 —— 本 feature 角色部分為純後端接通、base-web 角色欄 0 改動。
- **A-003**: rust-api 既有的密碼雜湊能力（建立使用者路徑已採用）可沿用於更新路徑與自助修改路徑。
- **A-004**: 建立使用者時不填密碼套用系統預設密碼，於整合 / dev 階段為合理取捨（沿 W-FW1 A-004）。
- **A-005**: base-web 的 request helper 對「HTTP 成功但業務碼非成功」已有既有錯誤呈現機制，本 feature 沿用、不改型別。
- **A-006**: 角色指派變更後的「權限生效」由既有 RBAC 機制自然達成，本 feature 不新增此邏輯、僅須不破壞。
- **A-007**: Constitution Principle IV「W-WEBUI 受管例外」（v1.1.0）已生效；DESIGN-W-WEBUI §4 已於 2026-05-22 amend、明文授權 W-FW5 的密碼 UX 最小 UI 新增 —— 本 feature 對 base-web 的修改在明文授權範圍內。
- **A-008（待 plan Phase 0 釐清）**: 後端權限判定如何解析使用者的角色（既有 RBAC 規則表，或於判定 / 登入時另行解析使用者-角色關聯）—— 決定本 feature 寫入使用者-角色關聯後是否需同步更新 RBAC 規則表。由 `/speckit-plan` Phase 0 research 解析。
- **A-009（待 plan Phase 0 釐清）**: rust-api 是否已有「驗證舊密碼後修改自身密碼」的自助端點，或需新增 —— 端點形態、是否依現行登入身分、舊密碼驗證體例由 `/speckit-plan` Phase 0 research 解析。

## Dependencies

### Inbound（本 feature 依賴）

- **W-FW1** `user-crud-wiring`（031，merge `a09d316`）：base-web user CRUD 接線、抽屜角色欄 UI、systemManage user alias 與 transform 層。✅
- **F8** `assign-users`（merge `c2b0912`）：角色→使用者指派端點，使用者-角色關聯差異更新的可參照體例。✅
- **F5.1** `auth-login-and-dynamic-menu`（merge `e71aefe`）：登入與動態選單機制（角色變更的生效載體）。✅
- **Constitution v1.1.0**：Principle IV W-WEBUI 受管例外。✅
- **DESIGN-W-WEBUI §4 amendment（2026-05-22）**：授權 W-FW5 密碼 UX 最小 UI 新增。✅

### Follow-up（本 feature 範疇外）

- **登入類表單**（驗證碼登入 / 註冊 / 忘記密碼）：DESIGN-W-WEBUI §3.2 既有規劃的「後端先行」follow-up，與本 feature 的「已登入狀態密碼管理」性質不同。
