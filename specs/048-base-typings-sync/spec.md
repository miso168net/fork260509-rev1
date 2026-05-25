# Feature Specification: 048 base-typings-sync

**Feature Branch**: `048-base-typings-sync`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "048 base-typings-sync — base-web TS typing 對齊 rust wire 真實序列化型 sprint。詳見 brainstorm doc `docs/superpowers/048-feature-base-typings-sync.md`（已 commit `e9378fb`、含 6 section user-approved + 2 US + 3 mismatch fix M1-M3 + 3 JSDoc audit D1-D3 + Constitution v1.5.0 amendment 新 TS-Typing-Sync 軌道 + DESIGN-W-TYPING-ALIGN.md 新文件 + CDP browser smoke deep 8 路徑 + ~2-2.5hr 落地預估）。"

**前置文件**：
- [`docs/superpowers/048-feature-base-typings-sync.md`](../../docs/superpowers/048-feature-base-typings-sync.md)（brainstorm 設計、6 section 已 user-approved）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)（v1.4.0 → v1.5.0 將同步 bump、為本 sprint 合法化前提）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Frontend developer 看到 `Api.Route.MenuRoute.id` 為 number、`Api.SystemManage.MenuTree.pid` 為 string（與 rust wire 真實序列化型對齊）（Priority: P1）🎯 MVP

維護 `base-web` 動態路由與菜單樹的 frontend developer / AI implementer / code reviewer 開 `src/typings/api/route.d.ts` 與 `src/typings/api/system-manage.d.ts` 應看到 `MenuRoute.id: number`、`MenuRoute.pid: string`、`MenuTree.pid: string`（而不是過去的 `id: string`、未宣告 `pid`、`pId: number`），對齊 rust-api 真實序列化（i32 → JSON number / String → JSON string、camelCase rule 對 `pid` 為 lowercase）。

**Why this priority**：TS typing 是 future regression 防護的第一道；當前 `MenuRoute.id: string` / `MenuTree.pId: number` 為「TS 對自己撒謊」狀態（runtime 靠 JS 動態型別恰好可運作、TS 編譯器無法捕捉誤用）。本 US 補回編譯期型別安全、消除 030-034 W-WEBUI 軌道遺留的型別債（W-WEBUI 軌道 FR-015 禁碰 typings 無法修）。MVP-worthy 因為「type-level 證據」是 verifiable / reproducible quality gate、且 grep 證實 0 consumer 撞 fix。

**Independent Test**：在 base-web worktree 跑 `pnpm typecheck` (vue-tsc) + `pnpm build`、輸出 0 TS error；docker rebuild base-web image + dev stack restart 後、走 CDP browser smoke 驗 `/route/getUserRoutes` 載入正常（M1+M2 行為驗）+ role-modal「菜单权限」NTree render 正常（M3 行為驗）。

**Acceptance Scenarios**（3 mismatch fix、3 場景）：

1. **Given** `src/typings/api/route.d.ts:11` 改為 `id: number`、line 12 加 `pid: string`；**When** 跑 `pnpm typecheck`；**Then** 0 TS error、`Api.Route.MenuRoute` 型別與 rust-api `MenuRoute` (i32 + String) 對齊。
2. **Given** `src/typings/api/system-manage.d.ts:135` 由 `pId: number` 改為 `pid: string`；**When** 跑 `pnpm typecheck`；**Then** 0 TS error、`Api.SystemManage.MenuTree` 型別與 rust-api `MenuTree` (pid: String) 對齊。
3. **Given** 上述兩處改完、base-web image rebuild、dev stack restart healthy；**When** CDP smoke 走 login → dynamic menu 載入 → role 編輯 modal → 菜单权限 modal → NTree render；**Then** 全路徑 0 runtime error、NTree 顯示 menu 樹狀正常、無 console error。

---

### User Story 2 — Frontend developer 看到 `Api.Common.CommonRecord.id` / `Api.SystemManage.Menu.parentId` / `Api.Auth.UserInfo.userId` JSDoc 註解說明 nuance（Priority: P1）

frontend developer 開 `src/typings/api/common.d.ts` `CommonRecord.id`、`src/typings/api/system-manage.d.ts` `Menu.parentId`、`src/typings/api/auth.d.ts` `UserInfo.userId` 三處 type 宣告處應看到 JSDoc 註解明確說明 post-039+040 後的 nuance（i64 from Snowflake 53-bit display_id / 0=root sentinel / ULID vs display_id 不同表示），防未來誤判型別語意。

**Why this priority**：D1 / D2 / D3 三處型別宣告**post-040 已正確**、但語意「為何 i64 用 JS number 安全」/「為何 0 是 sentinel」/「為何 userId 為 string 而 User.id 為 number」非自明，沒 JSDoc 註解未來看 code 的人易誤判（如把 `CommonRecord.id` 改成 `bigint` 防溢出、或把 `userId` 統一成 number）。本 US 補編譯期 doc-level 防護，與 US1 共同達成「audit-driven cleanup」目標。MVP-worthy 因為 JSDoc 註解是 future-proof investment、低風險（純註解、0 runtime / type-shape 影響）。

**Independent Test**：grep `src/typings/api/common.d.ts` `CommonRecord.id` 上方 JSDoc 註解含「Snowflake」「display_id」「Number.MAX_SAFE_INTEGER」關鍵字命中；grep `system-manage.d.ts` `Menu.parentId` 註解含「root menu sentinel」/「`0`」關鍵字命中；grep `auth.d.ts` `UserInfo.userId` 註解含「ULID」/「JWT subject」/「display_id」關鍵字命中。

**Acceptance Scenarios**：

1. **Given** `src/typings/api/common.d.ts` `CommonRecord` 上 JSDoc 加說明：`id` 為 i64 from Snowflake 41/5/7=53bit display_id（post-039）、fills `Number.MAX_SAFE_INTEGER`、無精度 loss；**When** open file、看 type 宣告；**Then** JSDoc 註解顯示完整、grep 「Snowflake」/「53bit」/「Number.MAX_SAFE_INTEGER」全命中。
2. **Given** `src/typings/api/system-manage.d.ts` `Menu.parentId` 上 JSDoc 加說明：`0` = root menu sentinel（rust i32、`menu-operate-modal.vue:137 model.parentId === 0` 依賴此語意）；**When** open file；**Then** JSDoc 含「root menu sentinel」/「`0`」/「`menu-operate-modal.vue:137`」關鍵字命中。
3. **Given** `src/typings/api/auth.d.ts` `UserInfo.userId` 上 JSDoc 加說明：rust 內 ULID `String`（JWT subject）、與 `User.id: number`（i64 display_id）為不同 id 表示；**When** open file；**Then** JSDoc 含「ULID」/「JWT subject」/「display_id」關鍵字命中。

---

### Edge Cases

- **Snowflake 53-bit 邊界耗盡風險**：Snowflake 41-bit timestamp 自 2026-05-21 (rev1 start epoch) 起、41 bit 約 69.7 年、預估 2095-12-25 才會撞 41-bit 滿；本 sprint scope 內無風險、D1 JSDoc 已說明 fills `Number.MAX_SAFE_INTEGER` 但未提及具體 2095 cutoff（屬另一層長期 follow-up）。
- **`MenuRoute.pid: string` 從未有 consumer**：grep 確認 0 hit、新增此 field 為 type-level 對齊；若未來新 component 需讀 `pid` 屬性、現有 typing 已就位、不需再改 typing。
- **`Menu.parentId === 0` comparison preservation**：sentinel 語意為「0=root menu」、TS 不可改成 `=== '0'` 或 `=== null`；D2 JSDoc 防誤改。
- **`Api.SystemManage.User.id: number` vs `Api.Auth.UserInfo.userId: string` 並存**：兩種 user id 表示為 rust 內 SoT 設計（ULID 為 identity、display_id 為 wire-friendly 數字）；D3 JSDoc 明示之、本 sprint 不統一兩者命名。
- **Constitution amendment 拒絕風險**：v1.5.0 新 TS-Typing-Sync 軌道 amendment 需先 commit（Phase 0）才能合法改 base-web typings；若 amendment 拒絕 → sprint 整體不可進行、需重 brainstorm。
- **CDP smoke 撞未掃 consumer**：理論上不該（grep 0 hit）、但若撞 → fix consumer + 補 grep + 重 build + 重 CDP；超 ≤3 implementer-stage expansion budget → 拒拾、登 048-N# follow-up。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`base-web/src/typings/api/route.d.ts` 內 `MenuRoute` interface MUST 改 `id: string` 為 `id: number`、並新增 `pid: string` field（對齊 rust-api `MenuRoute` 序列化的 `id: i32` (JSON number) 與 `pid: String`）。
- **FR-002**：`base-web/src/typings/api/system-manage.d.ts` 內 `MenuTree` type MUST 改 `pId: number` 為 `pid: string`（rename field + retype；對齊 rust-api `MenuTree.pid: String` 序列化 + serde camelCase rule `pid` lowercase）。
- **FR-003**：`base-web/src/typings/api/common.d.ts` 內 `CommonRecord.id` 上方 MUST 加 JSDoc 註解、含「post-039」、「Snowflake」、「53bit」、「display_id」、「Number.MAX_SAFE_INTEGER」關鍵字、說明 i64 為何用 JS number 安全。
- **FR-004**：`base-web/src/typings/api/system-manage.d.ts` 內 `Menu.parentId` 上方 MUST 加 JSDoc 註解、含「root menu sentinel」、「`0`」、「`menu-operate-modal.vue:137`」關鍵字、說明 `parentId === 0` comparison 依賴此語意。
- **FR-005**：`base-web/src/typings/api/auth.d.ts` 內 `UserInfo.userId` 上方 MUST 加 JSDoc 註解、含「ULID」、「JWT subject」、「display_id」關鍵字、明示與 `User.id` (i64 display_id) 為不同 id 表示。
- **FR-006**：本 sprint MUST 0 rust-api 改動、0 schema migration、0 新 application entity、0 新 cargo dep、0 新 redis channel、0 新 metric pre-declare、0 新 rust-api endpoint（軌道為「TS→rust 單向 sync」、rust wire shape 不動）。
- **FR-007**：本 sprint MUST 限 base-web 改動於 `src/typings/api/*.d.ts` 範圍（共 4 檔：route.d.ts / system-manage.d.ts / common.d.ts / auth.d.ts）；其他 typings（`app.d.ts` / `router.d.ts` / `components.d.ts` / `elegant-router.d.ts` / `package.d.ts` / `vite-env.d.ts` / `global.d.ts` / `naive-ui.d.ts` / `storage.d.ts` / `union-key.d.ts`）MUST 0 diff；其他 base-web source（`src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` / `src/locales/`）MUST 0 diff。
- **FR-008**：本 sprint Phase 0 MUST 先完成 Constitution v1.4.0 → v1.5.0 amendment（新增 TS-Typing-Sync 軌道受管例外）+ `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件建立、再進 Phase 1 base-web typings 改動（SDD「先合法化、再執行」紀律；順序顛倒違反 v1.4.0 既有 constitution）。
- **FR-009**：`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件 MUST 含 §1 軌道定位、§2 可動範圍硬邊界（`src/typings/api/*.d.ts` only）、§3 動機限定（必須舉證 TS vs rust wire mismatch）、§4 軌道成員（§4.1 預留 048 sprint 落地紀錄、post-merge backfill 真 SHA）、§5 與 W-WEBUI 軌道邊界（互斥、feature spec.md 明示軌道屬性）、§6 預期 sprint 模式（非常駐軌道）六節。
- **FR-010**：`.specify/templates/plan-template.md` Constitution Check 段 MUST 加軌道辨識條目（feature 改 base-web 時須先判定屬 W-WEBUI 或 TS-Typing-Sync 軌道、兩條軌道對 base-web 可動範圍不同）；本要求屬 Phase 0 amendment 配套。
- **FR-011**：base-web image rebuild 後、dev stack 12 service 全部 healthy + rust-api drainer 跑著、`/route/getUserRoutes` 端點 OK；front-nginx 取 base-web 新 image。
- **FR-012**：CDP browser smoke 8 路徑 MUST 全 PASS：(1) Login Soybean/123456、(2) Dynamic menu 載入（M1+M2 驗）、(3) role 列表 → 編輯 modal、(4) role 編輯 → 菜单权限 modal NTree render（M3 驗）、(5) menu 列表、(6) menu 新增 modal root (parentId=0 showLayout=true 驗 D2)、(7) menu 新增 modal child (parentId>0 showLayout=false 驗 D2)、(8) user 列表。每路徑 wait_for_selector + DOM 顯示確認、必要時 screenshot 對比。
- **FR-013**：本 sprint 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST：(a) 衍生 follow-up backlog 內「base-web TS `id` 型別債」inline note refresh 為「post-039+040+048 三階段完成紀錄」（保留歷史脈絡、不刪、改為已完成標示）；(b) 已完成里程碑加 048 entry；(c) Current Focus「下一步」改向 follow-up backlog 順序第 2 段（條件觸發 042-N4 / 042-N5）。
- **FR-014**：implementer-stage expansion 拾取上限 MUST ≤ 3 處（per 041 / 043 / 046 / 047 體例）；候選由 Phase 0 research grep 後拍板；超限拒絕並登記 048+ follow-up。

### Key Entities

本 sprint 為 TS typing audit + 對齊、**無 application data entity**（不動 DB schema、不動 rust wire DTO）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、12 service（5 既有 + 7 observability）全 healthy state；rust-api 啟動 + drainer 跑著（接 047 baseline、不退化）。
- **SC-002**：base-web worktree 跑 `pnpm typecheck`（vue-tsc）+ `pnpm build` 雙 PASS、輸出 0 TS error / 0 build error；dist 產出成功（含 index.html + assets）。
- **SC-003**：dev stack 跑著 + base-web image rebuild 後、CDP browser smoke 8 路徑（per FR-012）全 PASS、無 runtime / console error；NTree menu auth modal 顯示菜單樹正常；menu create modal root vs child layout 切換正常。
- **SC-004**：`base-web/src/typings/api/route.d.ts` 改後 `grep "id: number" base-web/src/typings/api/route.d.ts` ≥1 hit、`grep "pid: string" base-web/src/typings/api/route.d.ts` ≥1 hit；`base-web/src/typings/api/system-manage.d.ts` 改後 `grep "pid: string" base-web/src/typings/api/system-manage.d.ts` ≥1 hit + `grep "pId: number" base-web/src/typings/api/system-manage.d.ts` 0 hit（舊宣告完全移除）。
- **SC-005**：3 處 JSDoc 補（D1/D2/D3）grep 命中 — `grep -E "Snowflake|53bit|Number.MAX_SAFE_INTEGER" base-web/src/typings/api/common.d.ts` ≥1 hit、`grep -E "root menu sentinel|menu-operate-modal.vue:137" base-web/src/typings/api/system-manage.d.ts` ≥1 hit、`grep -E "ULID|JWT subject|display_id" base-web/src/typings/api/auth.d.ts` ≥1 hit。
- **SC-006**：軌道紀律 boundary verify 全 PASS — `git diff base-web/src/views/`、`git diff base-web/src/components/`、`git diff base-web/src/service/`、`git diff base-web/src/store/`、`git diff base-web/src/router/`、`git diff base-web/src/locales/`、`git diff base-web/src/typings/app.d.ts`、`git diff base-web/src/typings/router.d.ts`、`git diff base-web/src/typings/components.d.ts`、`git diff base-web/src/typings/elegant-router.d.ts` 全 0 line；`git diff rust-api/` 0 line。
- **SC-007**：Constitution v1.4.0→v1.5.0 bump 落地 + `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件落地（六節完整、§4.1 048 sprint 條目就位）+ `.specify/templates/plan-template.md` 軌道辨識條目加入 + CLAUDE.md §1/§7 索引補 DESIGN-W-TYPING-ALIGN；grep `"1.5.0"` `.specify/memory/constitution.md` ≥1 hit、`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 存在且 ≥6 section heading 命中。
- **SC-008**：完成後 INTEGRATION-CHECKLIST「base-web TS `id` 型別債」inline note 改寫為已完成紀錄（含 039/040/048 三階段引用）；已完成里程碑加 048 entry；Current Focus「下一步」指向條件觸發 follow-up。

## Assumptions

- **dev stack 健康** — 12 service healthy（5 既有 + 7 observability、044 已落地、046/047 維持）+ rust-api drainer 跑著（baseline 接 047 commit `cca44c5`）。
- **base-web worktree baseline** — `rev1-admin-base-web` 分支 HEAD = 040 follow-up `496f301b`（fix #3 fetchGetRoleEndpointIds string[]）；Phase 0 驗 `cd base-web && git rev-parse rev1-admin-base-web` 為此 SHA、未退化。
- **rust wire shape 為 SoT** — 本軌道為單向 TS → rust sync（TS 對齊 rust）、rust 既有 wire shape 不動；若未來 rust wire shape 需改、屬另一軌道 / 另一 feature scope。
- **Snowflake 53-bit 充足性** — Snowflake 41/5/7=53bit 設計刻意填滿 `Number.MAX_SAFE_INTEGER`（2^53-1）；post-039 至今未撞精度問題；本 sprint scope 內無風險。
- **CDP `:9229` Edge debug port 開著** — per 037/038/040 體例已驗證；若關著 sprint 啟動時 launch 開（`msedge --remote-debugging-port=9229`）。
- **Constitution amendment 不需 user 額外 ratify** — 沿用 v1.2.0/v1.3.0/v1.4.0 自我 amend 慣例（spec-driven 設計鏈內處理）；amendment 本身為 SDD 起點、user 透過 brainstorm clarify 已拍板（Clarify 3「Constitution: A v1.5.0 新增 TS-Typing-Sync 軌道」）。
- **0 consumer 撞 fix** — Phase 0 grep 已確認 `MenuRoute.id` / `MenuRoute.pid` / `MenuTree.pId` 三處 consumer 0 hit（純 typing-level 對齊、無 runtime cascade）；若 CDP smoke 撞他處 → 失敗預案 fix + 補 grep + 重 build + 重 CDP。
- **軌道首次行使的 v1.5.0 amendment 設計** — 限 `typings/api/*.d.ts` 為最 minimal 邊界；未來若第二次 sprint 撞「明明 mismatch 但軌道不准動」邊界、登 v1.5.x extension（非本 sprint scope）。
- **implementer-stage expansion budget ≤3** — per 041 / 043 / 046 / 047 體例；候選由 Phase 0 research grep 後拍板（如：plan-template 軌道辨識條目細節擴展、INTEGRATION-CHECKLIST 045-N1 結案 inline note refresh post-047 polish、其他相關 cleanup adjacency）。
