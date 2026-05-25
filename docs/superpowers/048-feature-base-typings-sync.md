# 048 base-typings-sync — brainstorm 設計

**日期**：2026-05-25
**Feature**：`048-base-typings-sync`
**來源**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) Group 4（base-web TS `id` 型別債 cleanup sprint）+ 047 落地後 user 拍板的 5 階段順序第 3 段
**Constitution amendment**：v1.4.0 → **v1.5.0**（新增 TS-Typing-Sync 軌道受管例外）

---

## 1. 觸發背景

2026-05-25 047 sandbox-protect-route-fix merge 落地後 backlog 剩 2 條衍生 follow-up（042-N4 / 042-N5）+ 1 條 inline note（base-web TS id 型別債）。User 早前對 cohesion 分群拍板：

- Group 1（046 spec-hygiene-pass-3）→ ✅ 已完成
- Group 2（047 sandbox-protect-route-fix）→ ✅ 已完成
- **Group 4（048 base-typings-sync）**：base-web 軌道內獨立 feature、TS typing 對齊 rust wire 真實型
- Group 3：dev infrastructure（條件觸發、不主動排）

**brainstorm 階段 context 探索重大發現** —— INTEGRATION-CHECKLIST 內 inline note 描述部分 stale。原文寫：

> `src/typings` 的 `CommonRecord.id` 宣告 `number`、`Menu.parentId` 宣告 `number`，但 rust-api runtime 實際回字串（user / role id 為 ULID、menu `parentId` 為字串...）

實際 post-039（rust-entity-id-numeric-migration）+ post-040（wire-id-consistency）**rust wire 已經改為**：
- user / role / endpoint / organization / access_key 的 wire `id` 為 i64 number（從 `display_id` 來、Snowflake 41/5/7=53bit 設計填滿 `Number.MAX_SAFE_INTEGER`）
- menu `parentId` wire 為 i32 number（040 拆掉 `deserialize_i32_or_string` workaround、現 plain number serde）

所以 `CommonRecord.id: number` 與 `Menu.parentId: number` 兩處 **post-040 已正確**、不是型別債。

**真實剩下的型別債（post-040 grep 確認、本 sprint scope）**：

| # | TS 現況 | Rust wire 真實 | 嚴重性 |
|---|---|---|---|
| M1 | `Route.MenuRoute.id: string` | `i32` (JSON number) | HIGH 型別不對 |
| M2 | `Route.MenuRoute` 缺 `pid` 宣告 | 序列化 `pid: String` | MED field 未宣告 |
| M3 | `SystemManage.MenuTree.pId: number` | `pid: String` (camelCase = lowercase `pid`) | HIGH 名 + 型雙不對 |

加上 audit-driven 階段發現的 nuance（不改但加 JSDoc 說明）：

| # | 對象 | JSDoc 補充 |
|---|---|---|
| D1 | `CommonRecord.id: number` | post-039 為 i64 from Snowflake 41/5/7=53bit display_id、fills `Number.MAX_SAFE_INTEGER`、無精度 loss |
| D2 | `Menu.parentId: number` | `0` = root menu sentinel（rust i32、`menu-operate-modal.vue:137 model.parentId === 0` 依賴此語意） |
| D3 | `Auth.UserInfo.userId: string` | rust 內 ULID `String`（JWT subject）、與 `User.id: number`（i64 display_id）為不同 id 表示 |

User 2026-05-25 brainstorm 階段 3 個 clarify 拍板：

- **scope**: B audit-driven — 3 mismatch fix + 3 JSDoc audit
- **verification**: B CDP browser smoke deep — 8 個 UI 路徑 automated CDP smoke
- **constitution**: A v1.5.0 新增 TS-Typing-Sync 軌道受管例外（與 W-WEBUI 並列、scope 限 `src/typings/api/*.d.ts`）

---

## 2. 範圍 + Constitution 處理

### 2.1 兩個 user story

| US | Priority | 範圍 | Touch |
|---|---|---|---|
| US1 | P1 🎯 MVP | 3 處 confirmed mismatch fix（M1 + M2 + M3）對齊 rust wire 真實型 | base-web ~5-8 line typings 改 |
| US2 | P1 | audit JSDoc 補（D1 + D2 + D3）防未來型別誤判 | base-web ~10-15 line typings 改（純 JSDoc 註） |

兩 US 互相獨立、但同檔 sequential edit；MVP 為 US1 + US2 一體交付（單一 base-web worktree commit）。

### 2.2 確定改的 files（硬邊界）

| File | 改動 |
|---|---|
| `src/typings/api/route.d.ts` | M1（`id: string→number`）+ M2（新 `pid: string`） |
| `src/typings/api/system-manage.d.ts` | M3（`pId: number → pid: string`、rename + retype）+ D2 JSDoc |
| `src/typings/api/common.d.ts` | D1 JSDoc |
| `src/typings/api/auth.d.ts` | D3 JSDoc |

### 2.3 explicit non-goals（軌道紀律）

- **不**碰 `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/`
- **不**碰 `typings/app.d.ts` / `typings/router.d.ts` / `typings/components.d.ts` / `typings/elegant-router.d.ts` / `typings/package.d.ts` / `typings/vite-env.d.ts` / `typings/global.d.ts` / `typings/naive-ui.d.ts` / `typings/storage.d.ts` / `typings/union-key.d.ts`
- **不**動 rust — 本軌道為「TS 對齊 rust wire 真實序列化型」單向 sync；rust 既有 wire shape 不動
- **不**加 runtime 型別 guard（zod / io-ts）— clarify C 選項 stretch 已 reject
- **不**做 W-WEBUI 軌道 wiring 改動
- **不**修 `Auth.UserInfo.userId` vs `User.id` 兩種 user id 表示的命名統一（屬 rust 內 SoT 設計）

### 2.4 consumer code 影響 grep 確認

- `MenuRoute.id`：只有 `service/api/route.ts` 用 `Api.Route.MenuRoute[]` generic type、未直接讀 `.id` property、type 改 string→number **0 consumer 影響**
- `MenuRoute.pid`：grep 0 hit、**新增 field、0 影響**
- `MenuTree.pId`：grep 0 hit（只 typing 宣告自己）、**rename + type change、0 consumer 影響**
- `Menu.parentId === 0`：保留 sentinel 語意、**不動 comparison**

### 2.5 Constitution amendment（v1.4.0 → v1.5.0）

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
  - ✅ .specify/templates/plan-template.md — Constitution Check 段加軌道辨識:
       feature 改 base-web 時必須先判定屬 W-WEBUI 或 TS-Typing-Sync 軌道
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md — 新文件 (本 amendment 同步建)
  - ✅ docs/INTEGRATION-CHECKLIST.md — Current Focus 加 TS-Typing-Sync 軌道條目
  - ✅ CLAUDE.md — §1 / §7 索引補 DESIGN-W-TYPING-ALIGN

Follow-up TODOs: 無
```

### 2.6 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件骨架

```text
§1 軌道定位 — 與 W-WEBUI 並列的第二條 base-web 受管例外軌道
§2 可動範圍 — ONLY src/typings/api/*.d.ts (4 檔)、其他 typings forbidden
§3 動機限定 — 必須舉證「TS 宣告 vs rust wire 不一致」、純 refactor 無證據者 reject
§4 軌道成員 — §4.1 [TODO post-merge backfill] 048 base-typings-sync 首發 sprint
§5 與 W-WEBUI 軌道的邊界 — 兩軌道互斥；feature spec.md 須明示屬哪條軌道
§6 預期 sprint 模式 — 非常駐軌道、觸發訊號驅動（rust wire shape 重大變動後）
```

### 2.7 SDD「先合法化、再執行」紀律

Amendment + DESIGN-W-TYPING-ALIGN.md 為 048 sprint 的 **Phase 0 prerequisite** — sprint 第一步必須先 bump constitution + 建 DESIGN doc（outer commit、無 base-web 改動），**然後**才能改 base-web typings（順序顛倒會違反 v1.4.0 既有 constitution）。

---

## 3. Verification 策略（CDP browser smoke deep 拍板）

### 3.1 C-V 系列概覽

| C-V | 對應 | 階段 | 簡述 |
|---|---|---|---|
| C-V1 | SC-001 baseline | infra | dev stack 12 service healthy + rust-api drainer 跑著 |
| C-V2 | typecheck | static | `pnpm typecheck` (vue-tsc) PASS、0 TS error |
| C-V3 | build | static | `pnpm build` PASS、dist 產出成功 |
| C-V4 | docker rebuild | runtime | base-web image rebuild + container restart healthy |
| C-V5 | grep verification | static | 3 mismatch fix file:line 命中 + JSDoc file:line 命中 + 0 base-web 軌道外 diff |
| C-V6 | CDP browser smoke deep | runtime | 8 個 UI 路徑 automated CDP smoke |
| C-V7 | boundary verify | scope discipline | 軌道紀律 grep（軌道內外 diff 邊界） |
| C-V8 | constitution + DESIGN-W-TYPING-ALIGN 完整性 | docs | bump 後文件 cross-link 正確 |
| C-V9 | INTEGRATION-CHECKLIST cleanup | docs | inline note refresh + 048 entry 加 |

### 3.2 C-V6 CDP browser smoke deep 路徑清單（per 037/038/040 體例、Edge `:9229`、無 playwright）

| # | 路徑 | 目的 | 驗 typing fix |
|---|---|---|---|
| 1 | Login（Soybean / 123456） | 起點 + Auth.UserInfo 解析 | D3 JSDoc 不影響 |
| 2 | Dynamic menu 載入 | `/route/getUserRoutes` → `Api.Route.UserRoute` → router register | **M1+M2** MenuRoute.id 為 number / pid string |
| 3 | role 列表 → 編輯 modal | `Role` 解析 | D1 CommonRecord.id i64 number 不影響 |
| 4 | role 編輯 modal → 菜单权限 modal | `MenuTree[]` 載入 + NTree render | **M3** pid 名 + 型 fix |
| 5 | menu 列表 | `MenuList` 載入 + `parentId` 列 render | D2 不影響 |
| 6 | menu 新增 modal（root menu, parentId=0） | `model.value.parentId === 0` 比較 → showLayout=true | D2 sentinel 語意保留 |
| 7 | menu 新增 modal（child menu, parentId>0） | 同上、showLayout=false | D2 sentinel 語意保留 |
| 8 | user 列表 | `UserList` 載入 + `id` 列 render | D1 不影響 |

### 3.3 C-V7 boundary verify grep 清單

```text
# constitution v1.5.0 軌道紀律驗證
git diff base-web/src/views/      → 0 line
git diff base-web/src/components/ → 0 line
git diff base-web/src/service/    → 0 line
git diff base-web/src/store/      → 0 line
git diff base-web/src/router/     → 0 line
git diff base-web/src/typings/app.d.ts            → 0 line
git diff base-web/src/typings/router.d.ts         → 0 line
git diff base-web/src/typings/components.d.ts     → 0 line
git diff base-web/src/typings/elegant-router.d.ts → 0 line
git diff base-web/src/typings/api/*.d.ts          → 有 M1+M2+M3+D1+D2+D3 改動
git diff rust-api/                → 0 line (sprint 不動 rust)
git diff specs/                   → 048 spec docs 新增
git diff .specify/memory/constitution.md → v1.4.0→v1.5.0 bump
git diff docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md → 新文件
```

### 3.4 C-V6 失敗預案

若 CDP smoke 任一路徑撞 TS 改型造成 runtime error：
- typing fix 為「對齊 rust wire 真實型」、改後 runtime 行為應**完全等價**（rust 已回對的型、TS 改前只是 lying）
- 真撞錯只可能 grep 漏掉 consumer hit；fix 該 consumer + 補 C-V5 grep pattern + 重 build + 重 CDP
- 若超 ≤3 implementer-stage expansion budget → 拒拾、登 048-N# follow-up

---

## 4. Commit shape + 執行順序

### 4.1 base-web worktree commit（estimated 1 個）

| Topic | est | files |
|---|---|---|
| 048 US1+US2 base-web typings/api 對齊 rust wire 真實型 | 1 commit | `src/typings/api/route.d.ts` + `src/typings/api/system-manage.d.ts` + `src/typings/api/common.d.ts` + `src/typings/api/auth.d.ts` |

push 至 `miso168net/fork260509-soybean-admin-base` 的 `rev1-admin-base-web` 分支。

### 4.2 outer rev1-admin-root commits（estimated 5-6 個）

| Order | Topic | est | files |
|---|---|---|---|
| 1 | constitution v1.4.0→v1.5.0 bump + DESIGN-W-TYPING-ALIGN.md 新文件 + plan-template + CLAUDE.md / INTEGRATION-CHECKLIST 索引補 | 1 commit | `.specify/memory/constitution.md` + `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（新）+ `.specify/templates/plan-template.md` + `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` |
| 2 | base-web SHA pin bump | 1 commit | gitlink `base-web` |
| 3 | INTEGRATION-CHECKLIST 048 entry + Current Focus update + CLAUDE.md SPECKIT marker idle + 衍生 follow-up inline note refresh | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| 4 | DESIGN-W-TYPING-ALIGN §4.1 加 048 sprint 落地紀錄 | 1 commit | `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` |
| 5 | (optional, ≤3 expansion budget) implementer-stage polish | 0-1 commit | TBD per Phase 0 research |
| 6 | SHA backfill (post-merge) — 048 entry placeholder 換真 SHA | 1 commit | `docs/INTEGRATION-CHECKLIST.md` |

### 4.3 執行順序（SDD「先合法化、再執行」）

```
Phase 0 — Constitution amendment + DESIGN doc (outer commit #1)
   ★ 必須先 commit 才能合法改 base-web typings
        ↓
Phase 1 — base-web typings 改 (base-web worktree commit)
   M1+M2+M3 + D1+D2+D3、pnpm typecheck + pnpm build PASS
        ↓
Phase 2 — outer SHA pin bump (outer commit #2)
        ↓
Phase 3 — docker rebuild base-web image + restart + CDP smoke 8 paths
        ↓
Phase 4 — outer INTEGRATION-CHECKLIST + DESIGN §4.1 (outer commits #3 + #4)
        ↓
Phase 5 — user-gated push + merge + SHA backfill
   base-web push → outer push → merge --no-ff → SHA backfill
```

### 4.4 預估時間

| 階段 | 估時 |
|---|---|
| Phase 0 (constitution + DESIGN doc) | ~30-45 min |
| Phase 1 (base-web typings + build) | ~30 min |
| Phase 2 (outer SHA pin) | ~5 min |
| Phase 3 (docker rebuild + CDP smoke 8 path) | ~30-45 min（含 base-web image build ~5-10min + smoke ~20-30min） |
| Phase 4 (outer INTEGRATION-CHECKLIST + DESIGN §4.1) | ~15 min |
| Phase 5 (push + merge + backfill) | ~15 min（user 同意關卡 ×4） |
| **合計** | **~2-2.5 hr**（不含 user thinking time） |

---

## 5. Assumptions / Risks / Rollback / Open Questions

### 5.1 Assumptions

- **base-web worktree HEAD baseline** — 接 040 follow-up `496f301b`（fix #3 fetchGetRoleEndpointIds string[]）；Phase 0 驗 `cd base-web && git rev-parse rev1-admin-base-web` 不退化
- **dev stack 12 service 健康** — 接 044/046/047 baseline、含 7 observability stack
- **rust wire shape 為 SoT** — 本軌道為單向 TS→rust sync（TS 對齊 rust）、rust 不動
- **CDP `:9229`** — Edge debug port 開著（per 037/038/040 體例已驗證）；若關著 sprint 啟動時 launch 開
- **`Number.MAX_SAFE_INTEGER` 邊界** — Snowflake 41/5/7=53bit 設計刻意填滿 2^53-1、post-039 至今未撞精度問題
- **constitution amendment 不需 user 額外 ratify** — 沿用 v1.2.0/v1.3.0/v1.4.0 自我 amend 慣例

### 5.2 Risks

| # | Risk | 觸發條件 | Mitigation |
|---|---|---|---|
| R1 | TS-Typing-Sync 軌道為首次行使、v1.5.0 amendment 設計過鬆或過嚴 | 未來第二個 sprint 撞「明明 wire mismatch 但軌道不准動」邊界 | §2.5 限定可動範圍為 `typings/api/*.d.ts`、明文其他 typings forbidden、留 v1.5.x 擴展空間 |
| R2 | CDP smoke 撞 grep 漏抓 consumer | `MenuRoute.id` / `MenuTree.pId` 有 dynamic 用法 | §3.4 失敗預案：fix consumer + 補 grep + 重 build + 重 CDP；超 ≤3 budget → 拒拾、登 048-N# |
| R3 | base-web image build 卡 5-10min | base-web Dockerfile 重 fetch deps | 預估時間已含；超時不算 sprint 失敗 |
| R4 | post-039 i64 display_id 在未掃 component 撞 `Number.parseInt` cascade | 040 留下漏抓 component | §3.2 8 路徑涵蓋 user/role/menu/access_key/endpoint；撞他處 → 登 048-N# |
| R5 | 兩段式 commit 順序錯（先改 base-web 後 bump constitution） | implementer 階段紀律疏忽 | §4.3 graph 明示 Phase 0 必先；implementer subagent prompt 明示 dependency |

### 5.3 Rollback plan

若 CDP smoke 撞 critical regression：
- **Phase 1 base-web commit**：`git revert <sha>` on `rev1-admin-base-web`、push 回 fork、outer 同步 revert SHA pin commit
- **Phase 0 constitution + DESIGN doc**：可保留（amendment 不依賴 sprint 完成、軌道定義仍合法、未來其他 sprint 可用）
- Sprint mark 為 ABANDONED、INTEGRATION-CHECKLIST 048 entry 改為「ABANDONED — rolled back on <date> due to <reason>」、原 base-web TS id 型別債 inline note 保留

### 5.4 Open Questions（implementer 階段拍板）

| Q | 內容 | 拍板時機 |
|---|---|---|
| Q1 | INTEGRATION-CHECKLIST inline base-web TS id 型別債 note 完全刪除 vs 改寫為「post-039+040+048 三階段完成紀錄」？ | sprint Phase 4（推薦：改寫保留歷史脈絡、不刪） |
| Q2 | DESIGN-W-TYPING-ALIGN.md §6 預期 sprint 模式對 1-3 feature/year 預估該寫具體 vs vague？ | Phase 0 拍板（推薦：vague「非常駐軌道、觸發訊號驅動」） |
| Q3 | implementer-stage expansion ≤3 budget 候選 | Phase 0 research grep 後拍板 |

### 5.5 出口準則（acceptance gate）

- C-V1~C-V9 全 PASS
- 0 軌道紀律違反（C-V7 boundary verify 全綠）
- constitution v1.5.0 + DESIGN-W-TYPING-ALIGN.md 落地 outer 並 push
- INTEGRATION-CHECKLIST 048 entry + SHA backfill 完成
- 衍生 follow-up「base-web TS id 型別債」inline note refresh

---

## 6. SDD 設計鏈下一步

per [`CLAUDE.md §3`](../../CLAUDE.md)：

1. `/speckit-specify`（input = 本檔）→ `specs/048-base-typings-sync/spec.md` + pre-hook 建 `048-base-typings-sync` feature branch
2. `/speckit-clarify`（如需要）→ spec.md `## Clarifications` 段（本檔已透過 6 個 brainstorm clarify 拍板大方向、`/speckit-clarify` 可能僅需 0-1 個補充 Q）
3. `/speckit-plan` → `plan.md` + `research.md` + `data-model.md` + `contracts/verification-commands.md` + `quickstart.md` + Constitution Check（v1.5.0 對照、TS-Typing-Sync 軌道屬性）
4. `/speckit-tasks` → `tasks.md` (dependency-ordered、預估 12-18 tasks)
5. `/speckit-analyze` → cross-artifact consistency 報告
6. **`superpowers:executing-plans`**（不用 `/speckit-implement`、per CLAUDE.md §3）→ `superpowers:subagent-driven-development` 派 implementer subagent 走 TDD-ish flow（typing-only feature 無新純函式 test、靠 acceptance C-V 系列 cover）
