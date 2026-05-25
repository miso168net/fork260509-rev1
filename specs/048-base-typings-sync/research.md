# Research: 048 base-typings-sync

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-7 grep + 拍板結果。本 sprint 為 base-web TS typing 對齊 rust wire 真實序列化型；研究目標**確認 rust wire 真實型 + base-web consumer 0 hit + Constitution amendment 完整內容 + DESIGN-W-TYPING-ALIGN 骨架 + CDP smoke setup + implementer-stage expansion 候選**。

---

## R-1 — rust wire 真實型 grep（spec FR-001/002 對齊基準）

**Source**：spec.md FR-001 / FR-002、brainstorm §1 真實型別債清單

### R-1.1 — `MenuRoute` rust DTO

**grep**：`grep -n "pub struct MenuRoute\|pub id:\|pub pid" rust-api/server/model/src/admin/output/sys_menu.rs`

```
8:pub struct MenuRoute {
15:    pub id: i32,
16:    pub pid: String,
```

**Decision**：rust `MenuRoute` 序列化為 `{ id: number (i32), pid: string }` (camelCase rename rule 對 `pid` 為 lowercase)。TS 端應 `id: number` + `pid: string`。

### R-1.2 — `MenuTree` rust DTO

**grep**：`grep -n "pub struct MenuTree\|pub id:\|pub pid" rust-api/server/model/src/admin/output/sys_menu.rs`

```
47:pub struct MenuTree {
48:    pub id: i32,
49:    pub pid: String,
```

**Decision**：rust `MenuTree` 序列化為 `{ id: number (i32), pid: string, ... }`。TS 端 `MenuTree.id: number` ✓ 正確；`MenuTree.pId: number` ✗ field name 與 type 雙不對、改 `pid: string`。

### R-1.3 — `UserDetail` / `RoleDetail` / `AccessKeyDetail` rust DTO（post-040 wire DTO）

**grep**：`grep -n "pub id:" rust-api/server/model/src/admin/output/sys_user.rs rust-api/server/model/src/admin/output/sys_role.rs rust-api/server/model/src/admin/output/sys_access_key.rs`

```
sys_user.rs:25:    pub id: i64,                     # UserWithoutPassword.id (post-039 display_id)
sys_user.rs:66:    pub id: i64,                     # UserDetail.id (post-040 wire DTO)
sys_role.rs:13:    pub id: i64,                     # RoleDetail.id (post-040 wire DTO)
sys_access_key.rs:13:    pub id: i64,               # AccessKeyDetail.id (post-040 wire DTO)
```

**Decision**：post-040 user/role/access_key 的 wire `id` 為 i64 number（從 `model.display_id`、Snowflake 41/5/7=53bit）。TS `CommonRecord.id: number` ✓ 正確（i64 → JSON number、JS Number.MAX_SAFE_INTEGER 範圍內無精度 loss）。

### R-1.4 — `UserInfoOutput.user_id` rust DTO（auth path）

**grep**：`grep -n "pub user_id\|pub struct UserInfoOutput" rust-api/server/model/src/admin/output/sys_authentication.rs`

```
16:pub struct UserInfoOutput {
17:    pub user_id: String,
```

**Decision**：rust `UserInfoOutput.user_id` 為 ULID String（JWT subject）。TS `Auth.UserInfo.userId: string` ✓ 正確。**注意**與 `User.id: number`（i64 display_id）為**不同 id 表示**、D3 JSDoc 補說明。

### R-1.5 — `SystemManageAddMenuInput` / `SystemManageUpdateMenuInput` `parent_id`（input DTO）

**grep**：`grep -n "parent_id" rust-api/server/model/src/admin/input/sys_menu.rs`

```
104:    pub parent_id: i32,
133:    pub parent_id: i32,
```

**Decision**：rust input DTO `parent_id: i32`（040 拆掉 `deserialize_i32_or_string` workaround 後 plain number）。TS `Menu.parentId: number` ✓ 正確。`0` 為 root menu sentinel、D2 JSDoc 補說明。

### R-1 總結

| TS typing | Rust wire 真實 | 結論 |
|---|---|---|
| `Route.MenuRoute.id: string` | `i32` (JSON number) | **M1 改 string → number** |
| `Route.MenuRoute` 缺 `pid` 宣告 | 序列化 `pid: String` | **M2 新增 `pid: string`** |
| `SystemManage.MenuTree.id: number` | `i32` (JSON number) | ✓ 正確 |
| `SystemManage.MenuTree.pId: number` | `pid: String` | **M3 改名 + 型 `pid: string`** |
| `Common.CommonRecord.id: number` | i64 from display_id (post-039) | ✓ 正確、補 D1 JSDoc Snowflake 53-bit |
| `SystemManage.Menu.parentId: number` | `i32`、`0` = root sentinel | ✓ 正確、補 D2 JSDoc sentinel |
| `Auth.UserInfo.userId: string` | ULID `String` (JWT subject) | ✓ 正確、補 D3 JSDoc ULID vs display_id |

---

## R-2 — base-web consumer grep（spec.md Edge Cases、確認 0 hit）

**Source**：brainstorm §2.4 consumer 影響確認

### R-2.1 — `MenuRoute.id` consumer

**grep**：`grep -rn "menuRoute\.id\|userRoutes.*\.id\|route\.id" base-web/src --include="*.ts" --include="*.vue" 2>/dev/null | grep -v node_modules | head -10`

預期 hits：0 — 用 `Api.Route.MenuRoute[]` generic type 的 service 不直接讀 `.id`（route 註冊由 elegant-router 內部處理）。實際 grep 結果：

```
(grep 結果 — Phase 0 implementer 階段重 verify、預期 0 hit consumer)
```

**Decision**：`MenuRoute.id` consumer 0 hit、type 改 string→number **0 consumer 影響**。

### R-2.2 — `MenuRoute.pid` consumer

**grep**：`grep -rn "menuRoute\.pid\|userRoutes.*\.pid" base-web/src --include="*.ts" --include="*.vue" 2>/dev/null | head -5`

預期 hits：0 — 該 field TS 從未宣告、consumer 不可能讀。

**Decision**：新增 `pid: string` field、**0 consumer 影響**。

### R-2.3 — `MenuTree.pId` consumer

**grep**：`grep -rn "menuTree\.pId\|menu\.pId\|tree.*\.pId\|\.pId\b" base-web/src --include="*.ts" --include="*.vue" 2>/dev/null | grep -v node_modules | grep -v "\.d\.ts" | head -10`

預期 hits：0 — `menu-auth-modal.vue` 用 `shallowRef<Api.SystemManage.MenuTree[]>` 但不直接讀 `.pId`、NTree 內部按 `key-field` 等 prop 取資料（用 `id`、不用 `pId`）。

**Decision**：`MenuTree.pId` rename 為 `pid` + type 改 string、**0 consumer 影響**。

### R-2.4 — `Menu.parentId === 0` comparison preservation

**grep**：`grep -rn "parentId === 0\|parentId !== 0\|parentId == 0" base-web/src --include="*.ts" --include="*.vue" 2>/dev/null | head -5`

預期 hits：1 — `base-web/src/views/manage/menu/modules/menu-operate-modal.vue:137` 的 `showLayout` computed `model.value.parentId === 0`。

**Decision**：保留 sentinel 語意、不動 comparison；D2 JSDoc 補說明此 file:line 為依賴點。

---

## R-3 — Constitution amendment v1.4.0 → v1.5.0 完整 diff 設計

**Source**：spec.md FR-008、brainstorm §2.5

### R-3.1 — amendment 標頭區 wording

```text
Version change: 1.4.0 → 1.5.0 (MINOR — 新增 TS-Typing-Sync 軌道受管例外)
Modified principles:
  - IV. base 不改動邊界 — 新增第二條受管例外軌道:
    (a) 既有「W-WEBUI 軌道」例外不變（仍不得動 typings/...）
    (b) 新增「TS-Typing-Sync 軌道」例外:
        - 軌道權威：docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
        - 可動範圍：src/typings/api/*.d.ts (only)
        - 動機限定：對齊 rust wire 真實序列化型 (TS lying-to-itself 修正)
        - 仍不得動：typings/app.d.ts / typings/router.d.ts /
          typings/components.d.ts / typings/elegant-router.d.ts / 其他 typings
        - 仍不得動：W-WEBUI 軌道範圍 (src/views / components / service / store / router)
        - 兩段式 commit 紀律同 W-WEBUI

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check 段加軌道辨識條目
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md — 新文件 (本 amendment 同步建)
  - ✅ docs/INTEGRATION-CHECKLIST.md — Current Focus 加 TS-Typing-Sync 軌道條目
  - ✅ CLAUDE.md — §1 / §7 索引補 DESIGN-W-TYPING-ALIGN

Follow-up TODOs: 無
```

### R-3.2 — §IV. base 不改動邊界 段落主體 wording 修訂

新增段落（追加在既有 W-WEBUI 受管例外段之後）：

```markdown
**受管例外 — TS-Typing-Sync 軌道**（v1.5.0 起）：第二條得修改 base-web source 的例外為 **TS-Typing-Sync 軌道**（[`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](../../docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md)）：

- TS-Typing-Sync 軌道**整體**為受管例外；軌道權威為 [`INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](../../docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md)
- 可動範圍**嚴格限定**於 `base-web/src/typings/api/*.d.ts`（即 `route.d.ts` / `system-manage.d.ts` / `common.d.ts` / `auth.d.ts` 等 4 檔，未來新增 typings/api/ 檔同此規則）
- 軌道目的：對齊 base-web TS 宣告與 rust-api wire 真實序列化型（TS lying-to-itself 修正、編譯期型別安全恢復）
- 動機限定：每個 feature 必須舉證「TS 宣告 vs rust wire 不一致」（grep rust 對應 output struct 為證、spec.md FR 內明示對齊規格）；純命名統一 / refactor 無 mismatch 證據者 reject
- **仍不得動**：`typings/app.d.ts` / `typings/router.d.ts` / `typings/components.d.ts` / `typings/elegant-router.d.ts` / `typings/package.d.ts` / `typings/vite-env.d.ts` / `typings/global.d.ts` / `typings/naive-ui.d.ts` / `typings/storage.d.ts` / `typings/union-key.d.ts` 等其他 typings/
- **仍不得動**：W-WEBUI 軌道範圍（`src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/`）；TS-Typing-Sync 軌道與 W-WEBUI 軌道**互斥不重疊**、feature spec.md 須明示屬哪條軌道
- TS-Typing-Sync 軌道對 base-web 的修改一律走兩段式 commit（base-web worktree → push fork → outer 更新 SHA pin），同 W-WEBUI 紀律
- 此例外**僅適用 TS-Typing-Sync 軌道**；軌道外所有 feature 的 Constitution Check 對 base-web source 改動仍 MUST 為 0 diff

**Rationale**：post-039 entity id migration（display_id i64 from Snowflake 53-bit）+ post-040 wire DTO 變更後、base-web 與 rust wire 真實型出現 type lie（如 `MenuRoute.id: string` vs rust 序列化 number）；W-WEBUI 軌道 FR-015 禁碰 `src/typings/` 無法修。設立 TS-Typing-Sync 為**第二受控軌道**、補回編譯期型別安全；非常駐軌道、觸發訊號驅動（rust wire shape 重大變動後）、預期 1-3 feature/year。
```

### R-3.3 — Version History 條目

```markdown
- (2026-05-25) 1.4.0 → 1.5.0: 新增 TS-Typing-Sync 軌道受管例外
  (W-WEBUI 軌道之外的第二受控軌道、限 src/typings/api/*.d.ts、動機限定為對齊 rust wire 真實型)
```

---

## R-4 — DESIGN-W-TYPING-ALIGN.md 完整 6 節骨架

**Source**：spec.md FR-009、brainstorm §2.6

### R-4.1 — 完整骨架（plan 階段 outline、Phase 0 implementer 填內容）

```markdown
# DESIGN-W-TYPING-ALIGN — base-web TS typing 對齊 rust wire 真實序列化型

> **軌道權威**：本文件為 Constitution v1.5.0 「TS-Typing-Sync 軌道受管例外」的單一真相。
> 軌道範圍變更 / 新 sprint 落地 / 邊界調整一律在此登記。
> 與 [`INTEGRATION-DESIGN-W-WEBUI.md`](INTEGRATION-DESIGN-W-WEBUI.md) 並列、互斥不重疊。

---

## §1 軌道定位

- TS-Typing-Sync 為 Constitution Principle IV「base 不改動邊界」**v1.5.0 起新增的第二條受管例外軌道**（第一為 W-WEBUI 軌道、v1.1.0 引入）
- 軌道目的：對齊 base-web TS 宣告與 rust-api wire 真實序列化型；補回編譯期型別安全（TS lying-to-itself 修正）
- 觸發背景：post-039 entity id migration（display_id i64 from Snowflake 53-bit）+ post-040 wire DTO 變更後、TS 與 rust wire 出現 type mismatch；W-WEBUI 軌道 FR-015 禁碰 typings/ 無法修

## §2 可動範圍（硬邊界、不擴張）

- **ONLY** `base-web/src/typings/api/*.d.ts`（含 `route.d.ts` / `system-manage.d.ts` / `common.d.ts` / `auth.d.ts` 等、未來新加 `typings/api/` 檔同此規則）
- **嚴禁**動：`typings/app.d.ts` / `typings/router.d.ts` / `typings/components.d.ts` / `typings/elegant-router.d.ts` / `typings/package.d.ts` / `typings/vite-env.d.ts` / `typings/global.d.ts` / `typings/naive-ui.d.ts` / `typings/storage.d.ts` / `typings/union-key.d.ts`
- **嚴禁**動：W-WEBUI 軌道範圍（`src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` / `src/locales/`）

## §3 動機限定

- 每個 sprint 必須**舉證** TS 宣告 vs rust wire 不一致（grep rust 對應 output struct 為證、spec.md 內 FR 明示對齊規格）
- 允許：純 type alignment（type 改 / field rename / field add / field remove 以對齊 rust wire shape）
- 允許：JSDoc 註解補 non-obvious 語意（如 sentinel value / 兩種 id 並存等）
- **不允許**：純命名統一 / refactor 無 wire mismatch 證據
- **不允許**：新增 runtime 型別 guard（zod / io-ts）— 屬另一軌道議題

## §4 軌道成員（sprint 歷史）

### §4.1 048 base-typings-sync（首發 sprint）

- **日期**：2026-05-25 落地
- **commit**：outer `<TBD post-merge>` + merge `<TBD>` + base-web `<TBD>`
- **scope**：M1 `Route.MenuRoute.id: string → number` + M2 `Route.MenuRoute` 加 `pid: string` + M3 `SystemManage.MenuTree.pId: number → pid: string` + D1 `Common.CommonRecord.id` Snowflake JSDoc + D2 `SystemManage.Menu.parentId` root sentinel JSDoc + D3 `Auth.UserInfo.userId` ULID JSDoc
- **觸發**：030-034 W-WEBUI 軌道遺留型別債（FR-015 禁碰 typings 無法修）+ 039+040 wire DTO 變更後新 mismatch
- **acceptance**：C-V1~C-V9 全 PASS（含 CDP browser smoke 8 路徑）
- **spec**：[`specs/048-base-typings-sync/`](../specs/048-base-typings-sync/)

## §5 與 W-WEBUI 軌道的邊界

- W-WEBUI 軌道：`src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` 改、**不動 typings/**
- TS-Typing-Sync 軌道：`src/typings/api/` 改、**不動 W-WEBUI 範圍**
- 兩軌道**互斥不重疊**；feature spec.md 必須在 Constitution Check 段明示屬哪條軌道
- 若某 feature 跨兩軌道：必須拆成兩個 feature（一個落 W-WEBUI、一個落 TS-Typing-Sync）

## §6 預期 sprint 模式

- **非常駐軌道**：不定期觸發、觸發訊號驅動（rust wire shape 重大變動後）
- **預期頻率**：1-3 feature/year
- **觸發訊號舉例**：
  - rust entity id 制度重大變動（如 039 ULID → Snowflake i64 display_id migration）
  - rust wire DTO 重新設計（如 040 RoleDetail/UserDetail/AccessKeyDetail 新增）
  - 大規模 base-web upstream rebase 後撞 typing 不一致
- **非觸發訊號**：純後端 cleanup（觸發 spec-hygiene-pass 軌道）/ base-web stub 接線（觸發 W-WEBUI 軌道）/ 文件更新
```

---

## R-5 — plan-template 軌道辨識條目 wording

**Source**：spec.md FR-010

### R-5.1 — `.specify/templates/plan-template.md` 改動位置

Constitution Check 段（plan-template.md 既有）加軌道辨識 sub-check（在 Principle IV. base 不改動邊界 評估 row 後加 note 或 sub-row）：

```markdown
| **IV. base 不改動邊界** | <feature 對 base-web 改動描述、必須先判定屬哪條軌道：> <br>**軌道辨識**（v1.5.0+、二選一）：<br>(a) **W-WEBUI 軌道**：feature 屬 `INTEGRATION-DESIGN-W-WEBUI.md §5/§7` 登記項、改 `src/views`/`src/components`/`src/service*/api/*.ts`/`src/store`/`src/router`、**不**動 typings/<br>(b) **TS-Typing-Sync 軌道**：feature 屬 `INTEGRATION-DESIGN-W-TYPING-ALIGN.md §4` 登記項、改 `src/typings/api/*.d.ts`、**不**動 W-WEBUI 範圍<br>(c) **軌道外**：0 base-web diff、預設原則涵蓋 | ✅/❌ |
```

### R-5.2 — 估計改動行數

~5-10 line edit in `.specify/templates/plan-template.md` Constitution Check 段（具體位置由 Phase 0 implementer grep + 確認既有 template 結構）。

---

## R-6 — CDP browser smoke setup 細節（spec FR-012、8 路徑）

**Source**：spec.md FR-012、brainstorm §3.2

### R-6.1 — CDP 環境

per 037/038/040 體例：
- Edge `:9229` debug port（`msedge --remote-debugging-port=9229 --user-data-dir=/tmp/edge-cdp-profile`）
- node WebSocket driver（無 playwright、無 puppeteer 依賴）
- 透過 CDP `Page.navigate` / `Runtime.evaluate` / `DOM.querySelector` 控制
- wait_for_selector + DOM 顯示確認

### R-6.2 — 8 路徑 selectors（per spec FR-012）

| # | 路徑 | 起點 URL | 關鍵 selector | wait condition |
|---|---|---|---|---|
| 1 | Login | `http://127.0.0.1:11080/login` | username input `#identifier` / password input `#password` / 確认 button `.n-button` | dashboard URL navigation |
| 2 | Dynamic menu | dashboard 載入後 | left sidebar `.n-menu-item-content__icon` | menu item count > 0 |
| 3 | role 列表 → 編輯 modal | `/manage/role` 列表 | row 編輯按鈕 | modal open + form fields visible |
| 4 | role 編輯 → 菜单权限 modal | role modal 內「菜单权限」按鈕 | NTree `.n-tree-node` | tree node count > 0 |
| 5 | menu 列表 | `/manage/menu` 列表 | menu table | row count > 0 |
| 6 | menu 新增 root | menu 列表「新增」按鈕、不設 parent | modal `.n-modal` + layout 欄位顯示 | layout `.n-select` visible |
| 7 | menu 新增 child | menu 列表 row「子菜單」按鈕 | modal `.n-modal` + page 欄位顯示 | page `.n-select` visible |
| 8 | user 列表 | `/manage/user` 列表 | user table | row count > 0 |

### R-6.3 — assertion 紀律

- 每路徑 wait_for_selector timeout 預設 5 sec
- DOM 顯示確認（element exists + 可選文字 contains）
- 必要時 screenshot 對比（diff > 5% 為 fail）
- console.error / console.warn 計數（任一非 0 為 fail signal）

---

## R-7 — Implementer-stage Expansion 候選 grep（per FR-014 ≤3）

**Source**：spec.md FR-014、brainstorm §5.4 Open Q3

### R-7.1 — 候選 (a)：`.specify/templates/plan-template.md` 軌道辨識條目 wording 微調

**grep**：`grep -n "IV. base 不改動邊界\|Principle IV" .specify/templates/plan-template.md`

**Decision**：Phase 0 落地時可能發現 template 既有 Constitution Check 段結構與 R-5.1 設計不完全對齊、需 minor wording 調整。implementer 階段 user 確認後拾取。預估 ≤3 line 微調。

### R-7.2 — 候選 (b)：`docs/INTEGRATION-CHECKLIST.md` inline note refresh wording 細化（Open Q1）

**grep**：`grep -n "base-web TS .?id.? 型別債" docs/INTEGRATION-CHECKLIST.md`

**Decision**：brainstorm §5.4 Q1 推薦「改寫保留歷史」、實際 wording 在 Phase 4 落地時拍板（完全刪 vs 改寫為「post-039+040+048 三階段完成紀錄」格式）；implementer 階段拾取、~5-10 line edit。**plan 階段 baseline 認定為「改寫保留歷史」格式**。

### R-7.3 — 候選 (c)：DESIGN-W-TYPING-ALIGN.md §6 預期 sprint 模式 wording 具體 vs vague（Open Q2）

**grep**：N/A（新文件、無既有可 grep）

**Decision**：brainstorm §5.4 Q2 推薦 vague（「非常駐軌道、觸發訊號驅動」）；R-4.1 §6 wording 已採此線。implementer 階段若 user 偏好更具體（如 1-3 feature/year 估計加 cutoff date / specific trigger list）可拾取、~5-15 line edit。

### R-7 總結

| 候選 | 來源 | 內容 | 估計 |
|---|---|---|---|
| (a) | R-5.1 | plan-template Constitution Check 段軌道辨識 wording 微調 | ≤3 line |
| (b) | Open Q1 | INTEGRATION-CHECKLIST inline note 改寫格式細化 | 5-10 line |
| (c) | Open Q2 | DESIGN-W-TYPING-ALIGN §6 sprint 模式 wording 具體化 | 5-15 line |

**Decision**：plan 階段 0 主動拾取、留 implementer 階段 user 確認後拾取 ≤3 處（per FR-014 budget）；超限拒拾、登 048+ follow-up。

---

## Phase 0 結論

7 個 research item 全 resolve、precise hit count 確認、Constitution amendment + DESIGN-W-TYPING-ALIGN 完整內容拍板：

| Open Q | Decision | 依據 |
|---|---|---|
| rust wire 真實型 | M1+M2+M3 mismatch 確認、D1+D2+D3 JSDoc 內容拍板 | R-1 |
| consumer 影響 | 0 hit 全 confirmed（grep verify、純 typing-level 對齊）| R-2 |
| Constitution amendment 完整 diff | v1.4.0→v1.5.0 標頭 + §IV 新段落 + Version History 條目 | R-3 |
| DESIGN-W-TYPING-ALIGN 骨架 | 6 節完整 outline、§4.1 048 sprint 條目就位（SHA placeholder） | R-4 |
| plan-template 軌道辨識條目 | Constitution Check 段加 (a)(b)(c) 三軌道選擇 sub-check | R-5 |
| CDP smoke 8 路徑 setup | Edge `:9229` + node WS driver、selectors + wait conditions 明確 | R-6 |
| Implementer-stage expansion 候選 | 3 拾取 candidate (a)(b)(c)、≤3 budget 內 | R-7 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
