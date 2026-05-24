# Feature Specification: 043 spec-hygiene-pass-2

**Feature Branch**: `043-spec-hygiene-pass-2`
**Created**: 2026-05-24
**Status**: Draft
**Input**: User description: "043 spec-hygiene-pass-2: 042-N3 (C-V SQL TZ bug 跨 003/021/042 共 10 hits) + R5 (/auth/logout design note + token revocation research + W-F12 hook) + 041-N2 (spec 002 §E4 use 行 fix) bundled。軌道外 pure spec md、0 rust-api / 0 base-web。implementer 階段擴展紀律 per 041 體例。詳見 docs/superpowers/043-feature-spec-hygiene-pass-2.md brainstorm 文件"

**前置文件**：[`docs/superpowers/043-feature-spec-hygiene-pass-2.md`](../../docs/superpowers/043-feature-spec-hygiene-pass-2.md)（brainstorm 設計、3 Q&A 拍板已敲定）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Regression operator 重跑 C-V time-window query 不再 0 row 誤判 (Priority: P1) 🎯 MVP

整合維護者（人類或 AI）依 `specs/<NNN>/contracts/verification-commands.md` 重跑既有 feature 的 acceptance 命令時，含 `NOW() - INTERVAL '...'` 時間過濾的 SQL 查詢應正確比較 `sys_operation_log.created_at`（UTC naive）與當下時刻，回傳預期 row 數而非 0 row 誤判。本 user story 涵蓋 spec 003 / 021 / 042 內 10 處 hit。

**Why this priority**：spec verification SQL 的時區誤差直接侵蝕 C-V 命令的可信度——操作者跑改前的 query 看到 0 row 後不知是 regression 還是 spec 命令本身有問題、debug 成本翻倍。本 fix 為純 SQL pattern replace，cost 低、collateral risk 小、立刻提升所有 audit 相關 spec 的 verification correctness。

**Independent Test**：dev stack 健康下、各 spec 跑 1 個會產生 audit row 的 trigger（如 POST /api/role），然後跑改後的 time-window query；預期回 ≥1 row 且 row 確實是剛剛產生。改前同樣命令會回 0 row（時區誤差過濾掉）。

**Acceptance Scenarios**：

1. **Given** dev stack baseline、Soybean token；**When** 對 spec 042 C-V7 改正後的 outbox stats time-window query 跑 50 個 POST 後 sleep 3 + query；**Then** 回傳 ≥100 row、unique_requests = 50（過去因時區誤差過濾掉真實 row、回 0 行）。
2. **Given** dev stack baseline；**When** 跑 spec 021 C-V batchDeleteUser 對應的 audit verification query；**Then** COUNT ≥ 1（依時間範圍應命中剛剛 batchDelete 產生的 audit row）。
3. **Given** dev stack baseline；**When** 跑 spec 003 quickstart cleanup query `DELETE FROM sys_operation_log WHERE entity_id IS NOT NULL AND created_at > ...`；**Then** 確實刪除剛剛產生的 audit row（過去因時區過濾、實際 0 row affected）。

---

### User Story 2 — Auth contract reader 知道為何無 `/auth/logout` server endpoint (Priority: P2)

新加入的開發者或整合 API consumer 第一次看 `specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md` 時，會發現只有 4 endpoint（login/getUserInfo/getUserRoutes/getConstantRoutes）、卻沒有 logout——這是 design choice（rust-api JWT stateless + base-web client-side discards token via `VITE_SERVICE_LOGOUT_CODES`），但 spec 沒有顯式說明、讀者必須自己對著 grep 推測。本 user story 補完 design intent doc + 未來何時需要 server-side revocation 的 research + 與 W-F12/13/14 observability feature 的整合 hook。

**Why this priority**：非阻塞性 doc gap、但是 onboarding / 整合摩擦的常見起點；R5 自 F14 cutover 後一直登在 backlog；042 落地讓 audit:events Redis Stream 就位後、若 W-F12 加入 session anomaly detection 自然會觸發「server-side revocation 怎麼做」的設計決策——本 spec 提前釘下 design intent + research 為 W-F12 prerequisite input。

**Independent Test**：spec 005 contracts/auth-endpoints.md 含新 §「Logout (no server endpoint by design)」、人工 read-through 確認涵蓋 4 個 aspect（current design / token revocation research / 何時需要 trigger / W-F12 hook）。無需 dev stack。

**Acceptance Scenarios**：

1. **Given** 新加入的 implementer；**When** 讀 spec 005 contracts/auth-endpoints.md；**Then** 看到新增的 logout § 解釋為何無 server endpoint、無需向 grep code 求證。
2. **Given** 未來 W-F12/13/14 observability feature 開始 brainstorm；**When** 探討 session anomaly detection / forced logout；**Then** 可從 043 spec 005 logout § 直接取得 3 個 token revocation pattern 的 tradeoff comparison（Redis blacklist / short-TTL refresh / JWT versioning）作為 design input。

---

### User Story 3 — spec 002 reader 複製 use 行直接編譯通過 (Priority: P3)

技術文件 reader 從 `specs/002-soft-delete-infrastructure/data-model.md` §E4 範例 code block 複製 use 行貼到 server-model crate 內檔案實作 SoftDeletable impl 時，貼出的 `use server_model::admin::entities::{...}` 在 model crate 內無法解析（model crate 不能 self-reference 自己的 crate name）；正確 form 應該是 `use crate::admin::entities::{...}`。同檔 line 186 / 362 的其他範例已是正確 form，line 158 是 brainstorm 期遺留。

**Why this priority**：純 documentation correctness、不影響任何運行行為；reader 用 IDE auto-complete 或 cargo check 會立刻發現，但讓 spec 直接 paste-able 對 onboarding 友善。

**Independent Test**：`grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md` 期望 0 hit。

**Acceptance Scenarios**：

1. **Given** spec 002 data-model.md；**When** grep `use server_model::admin::entities`；**Then** 0 hit（過去 line 158 為唯一 hit）。

---

### Edge Cases

- **implementer 階段擴展發現新 spec rot（per 041 體例）**：implementer grep 時若發現鄰近 spec rot（同類 TZ pattern、同類 brainstorm-period stale use 行、同類 spec command drift），於 plan 階段「Implementer-stage Expansion」表登記候選；動手前回報 user 拾取確認；拾取 ≤3 處上限避免 scope creep。
- **W-F12 hook 的具體實作 deferred**：US2 補完 `/auth/logout` design intent + research，但**不**實作 server-side endpoint；實作 trigger 留 W-F12 觀測 feature 內決定（per assumption）。
- **TZ fix 不更動 schema**：`sys_operation_log.created_at` 維持 `TIMESTAMP without time zone`（rust-api `Utc::now().naive_utc()` 寫入慣例不變）、僅 spec md SQL 對齊（per assumption）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：系統 MUST 對 spec 003 / 021 / 042 內所有 `NOW() - INTERVAL '...'` time-window pattern hit 套用一致 fix（`(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'`），共 10 處 hit（per brainstorm doc §2.2）。
- **FR-002**：fix 後每處 SQL query MUST 在 dev stack 健康下能對近期 audit row 正確 match（acceptance 重跑該 spec 對應 C-V command 不再 0 row 誤判）。
- **FR-003**：spec 005 contracts/auth-endpoints.md MUST 新增 §「Logout (no server endpoint by design)」，涵蓋 4 個 aspect：(a) current design intent (JWT stateless + client-side discards)、(b) token revocation research（≥3 pattern + tradeoff comparison）、(c) 何時需要 server-side revocation 的 trigger scenarios、(d) W-F12/13/14 observability feature 整合 hook（cross-reference 為未來 design input）。
- **FR-004**：spec 002 data-model.md §E4 line 158 MUST 從 `use server_model::admin::entities::{...}` 改為 `use crate::admin::entities::{...}`，與同檔 line 186 / 362 既有正確 form 對齊。
- **FR-005**：本 feature MUST 0 rust-api code 改動（與 041 之 NormalizePathLayer 不同；純 spec md）。
- **FR-006**：本 feature MUST 0 base-web 改動（與 W-WEBUI 軌道無關、不觸發 Constitution Principle IV 受管例外）。
- **FR-007**：本 feature MUST 0 schema migration、0 新 entity、0 新 cargo crate dep。
- **FR-008**：implementer 階段允許按 041 體例擴展 scope（grep 出鄰近 spec rot 同次拾取），但 MUST：(a) plan 階段於專屬表登記候選，(b) 動手前回報 user 確認，(c) ≤3 處上限避免 scope creep。
- **FR-009**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST 從衍生 follow-up table 移除 042-N3 / R5 / 041-N2 三 row、已完成里程碑加 043 entry、Current Focus 下一步指向 W-F12/13/14 observability。

### Key Entities

本 feature 無 data entity、僅 spec md 內容修改；省略此節。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：整合維護者跑改後的 10 處 time-window SQL（spec 003 quickstart 1 處 + spec 021 spec.md 1 處 + spec 021 tasks.md 2 處 + spec 021 contracts/verification-commands.md 2 處 + spec 042 contracts/verification-commands.md 4 處）皆能正確 match 近期 audit row、0 row 誤判從基準的 100%（時區誤差導致全 0）降至 0%。
- **SC-002**：新加入 implementer 讀 spec 005 contracts/auth-endpoints.md 後、能在 2 分鐘內理解「為何無 server-side /auth/logout endpoint」+ 列出 3 個未來 server-side revocation 方案（Redis blacklist / short-TTL refresh / JWT versioning）+ 1 個未來實作 trigger 條件（W-F12 session anomaly detection 等）。
- **SC-003**：spec 002 data-model.md `grep "use server_model::admin::entities"` 結果從基準 1 hit 降至 0 hit、與同檔其他 use 行對齊。
- **SC-004**：完成後 INTEGRATION-CHECKLIST 衍生 follow-up table 從 14 row 降至 11 row（移 042-N3 / R5 / 041-N2）、已完成里程碑加 043 entry。
- **SC-005**：本 feature 完成後 0 rust-api code 改動、0 base-web 改動、0 schema migration、0 新 cargo crate dep（per FR-005~FR-007 構成檢核）。
- **SC-006**：implementer 階段擴展（若有發生）控制在 ≤3 處、每處在 plan/tasks 內顯式登記、user 確認後才動手（per FR-008）。

## Assumptions

- **dev stack 健康** — 5 service（postgres / redis / rust-api / front-nginx / base-web）皆 healthy，audit pipeline 042 已就位（acceptance 重跑時需要 sys_operation_log 收 row）。
- **042 已 merge** — 本 feature 為 042 落地後 follow-up bundle、acceptance SQL 預期 042 audit pipeline 行為（雙視角 row、drainer 50ms sleep_interval）。
- **rust-api `Utc::now().naive_utc()` 寫入慣例不變** — `sys_operation_log.created_at` 維持 `TIMESTAMP without time zone`、本 fix 僅 spec SQL 對齊；不評估改 schema 為 TIMESTAMPTZ 的選項（屬 P3-grade 重構、非本 feature scope）。
- **`/auth/logout` 不實作 server endpoint** — US2 僅 doc note + research；任何 server-side revocation 的真實實作（Redis blacklist、token versioning、forced-logout endpoint 等）defer 至 W-F12/13/14 觀測 feature 或合規驅動的獨立 feature。
- **base-web client-side logout 行為不動** — 既有 `VITE_SERVICE_LOGOUT_CODES` 響應碼判斷 + token discard 流程 100% 保留。
- **既有 sys_operation_log row 不 migrate** — 042 已建立的歷史 row 不動、不 backfill 任何欄位。
- **`/speckit-clarify` 通常不需要** — 本 feature scope 已由 brainstorm 拍板 3 Q&A 確定（TZ scope cross-spec / R5 deepest option / 041 體例擴展紀律）、3 user story 涵蓋預定範圍、無 NEEDS CLARIFICATION 候選。
