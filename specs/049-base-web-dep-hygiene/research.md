# Research: 049 base-web-dep-hygiene-and-track-restructure

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-9 audit + 拍板結果。本 sprint 為「軌道 governance restructure + base-web build/dep config hygiene」、Phase 0 研究目標**確認 audit methodology + DESIGN doc content mapping + Constitution amendment 內容 + plan-template/CLAUDE.md update + expansion candidates**。

---

## R-1 — Comprehensive audit grep methodology + expected phantom list（FR-006 對齊）

### R-1.1 — audit script（implementer 用、Phase 1 Step 1 跑）

```bash
# 在 base-web/ root 跑

# Step 1: 提取所有 import 來源 package name (top-level)
grep -rEh "^\s*import\s+.*from\s+['\"]([^'\"]+)['\"]" \
     src/ build/ packages/*/src/ \
     --include="*.ts" --include="*.vue" --include="*.tsx" \
     | grep -oP "from\s+['\"]\K[^'\"]+" \
     | grep -v "^[.@]\|^@sa/\|^node:\|^@/\|^@unocss/preset-uno\|^uno:\|^virtual:" \
     | awk -F'/' '{print $1}' | sort -u > /tmp/049-imports-unscoped.txt

grep -rEh "^\s*import\s+.*from\s+['\"]@[^'\"]+['\"]" \
     src/ build/ packages/*/src/ \
     --include="*.ts" --include="*.vue" --include="*.tsx" \
     | grep -oP "from\s+['\"]\K@[^'\"]+" \
     | awk -F'/' '{print "@"$1"/"$2}' | sed 's/^@@/@/' \
     | grep -v "@sa/\|@/" | sort -u > /tmp/049-imports-scoped.txt

cat /tmp/049-imports-unscoped.txt /tmp/049-imports-scoped.txt | sort -u > /tmp/049-imports.txt

# Step 2: 提取各 package.json declared deps
{
  for pj in package.json packages/*/package.json; do
    grep -oP '^\s*"\K[^"]+(?=":\s*"[^"]*"\s*[,}])' "$pj" 2>/dev/null
  done
} | sort -u > /tmp/049-declared.txt

# Step 3: diff = phantom transitive use
comm -23 /tmp/049-imports.txt /tmp/049-declared.txt > /tmp/049-phantom.txt
cat /tmp/049-phantom.txt
```

**audit 注意**：
- `@sa/*` 是 workspace internal package、跳過（symlink 到 packages/<sub>/）
- `node:fs` / `node:path` 等 node builtin、跳過
- `@/` 路徑為 base-web/src/ alias、跳過
- scoped pkg `@iconify/utils/lib/loader/node-loaders` 要 split 取 `@iconify/utils`
- `vue` / `vue-router` 等明顯 declared deps 雖入 imports list、會被 comm 排除

### R-1.2 — expected phantom list（per 048 baseline + spot check 2026-05-25）

**Known phantom（high confidence）**：
- `@iconify/utils` ← `build/plugins/unocss.ts:5`（base-web root、未 declared）
- `@unocss/core` ← `packages/uno-preset/src/index.ts:3`（uno-preset、未 declared）
- `@unocss/preset-mini` ← `packages/uno-preset/src/index.ts:4`（uno-preset、未 declared）
- `axios` ← `src/service/request/index.ts:1`（type import、未 declared in base-web/package.json；runtime 由 `@sa/axios` 提供）

**False phantom（spot check confirmed declared）**：
- `defu`, `tailwind-merge`, `consola`, `kolorist` 已 declared in base-web/package.json
- `axios`, `axios-retry` 已 declared in packages/axios/package.json（注意：base-web/ 自己也用 `axios` type import、仍須加 base-web devDep）

**待 audit 確認（可能 phantom）**：
- `klona`, `rimraf`, `bumpp`, `cac`, `c12`, `execa` — 看起來像 packages/scripts/ tooling、可能 declared in packages/scripts/package.json
- `nanoid`, `qs`, `pinyin-pro`, `nprogress`, `dayjs`, `crypto-js`, `dompurify`, `colord`, `dhtmlx-gantt`, `localforage`, `simplebar-vue`, `swiper`, `vue-i18n`, `vue-pdf-embed`, `vditor`, `wangeditor`, `xgplayer`, `xlsx`, `jsbarcode`, `print-js`, `enquirer`, `json5`, `cac`, `vite-plugin-progress`, `vite-plugin-svg-icons`, `vite-plugin-vue-devtools`, `vite-plugin-vue-transition-root-validator` — implementer 跑完 audit 後確認

**Decision**：implementer Phase 1 Step 1 跑 audit 確認、結果直接放進 base-web/package.json + packages/<sub>/package.json；版本 pin **exact**（per codebase convention：base-web/package.json 63 exact vs 5 caret、實質 exact-pin convention）；版本值用 `pnpm-lock.yaml` 既有 resolved version。

---

## R-2 — DESIGN-W-WEBUI.md → DESIGN-W-BASE-WEB.md §2 mapping（FR-002）

### R-2.1 — 原 DESIGN-W-WEBUI.md 結構（grep -nE "^#|^##"）

| 原 § | 行 | 內容 | 新 § |
|---|---|---|---|
| §1 軌道定位與原則 | 11 | 含 §1.1 是什麼 / §1.2 base-web 修改授權 / §1.3 Constitution IV | §2.1 軌道定位（merged §1.1 + §1.2 + §1.3）|
| §2 現況盤點 (2026-05-21 稽核) | 39 | 14 業務 stub + 與 DESIGN-B §4.2 區別 | §2.2 現況盤點 |
| §3 範圍 | 82 | §3.1 涵蓋 / §3.2 排除 | §2.3 範圍 |
| §4 base-web 修改範圍邊界 | 96 | 既有 §4 整段 | §2.3 範圍邊界（與 §2.3 合一）|
| §5 Feature 切分 (W-FW1 ~ W-FW4) | 120 | W-FW1 user-crud / W-FW2 menu / W-FW3 role / W-FW4 role-auth | §2.4 Feature 切分 |
| §6 依賴與執行順序 | 159 | dep graph + 排程 | §2.5 依賴與執行順序 |
| §7 follow-up feature 切分 (W-FW5 ~ W-FW9) | 184 | W-FW5/6/7/8/9 五 follow-up | §2.4 Feature 切分（與 §5 合一）|

### R-2.2 — mapping 紀律

- §2.1 軌道定位（5 行小 intro）合併原 §1.1 + §1.2 + §1.3
- §2.2 現況盤點原樣搬（保留 14 業務 stub + 區別段）
- §2.3 範圍 + 範圍邊界（原 §3 + §4）合一
- §2.4 Feature 切分 W-FW1 ~ W-FW9（原 §5 + §7 合一、9 個 W-FW 子項紀錄）
- §2.5 依賴與執行順序（原 §6）
- 內容**1:1 搬移**、不動 wording、只改 § numbering

**估行數**：~255 line（與原 W-WEBUI.md 同量）

---

## R-3 — DESIGN-W-TYPING-ALIGN.md → DESIGN-W-BASE-WEB.md §3 mapping（FR-002）

### R-3.1 — 原 DESIGN-W-TYPING-ALIGN.md 結構（grep -nE "^#|^##"）

| 原 § | 行 | 新 § |
|---|---|---|
| §1 軌道定位 | 18 | §3.1 軌道定位 |
| §2 可動範圍（硬邊界、不擴張） | 28 | §3.2 可動範圍 |
| §3 動機限定 | 56 | §3.3 動機限定 |
| §4 軌道成員（sprint 歷史） | 72 | §3.4 軌道成員（含 §3.4.1 048 base-typings-sync 首發）|
| §5 與 W-WEBUI 軌道的邊界 | 91 | §3.5 與其他軌道邊界（mapping wording 改為 unified context、含 §1 軌道總覽 ref）|
| §6 預期 sprint 模式 | 106 | §3.6 預期 sprint 模式 |

### R-3.2 — mapping 紀律

- 內容 1:1 搬移、§ 改為 §3.X 子號
- §3.5 「與其他軌道邊界」原為「與 W-WEBUI 軌道的邊界」、改為 unified context（與 §2 + §4 三軌道互斥不重疊、ref to §1.1 三軌道總覽）
- §3.4 軌道成員紀錄保留 048 base-typings-sync 首發紀錄不動

**估行數**：~116 line（原 DESIGN-W-TYPING-ALIGN.md 同量）

---

## R-4 — Constitution v1.5.0 → v1.6.0 amendment 完整 diff 設計

### R-4.1 — 檔頭 Sync Impact Report block（替換 v1.5.0 既有 block）

```text
Sync Impact Report (2026-05-25)
================================================================
Version change: 1.5.0 → 1.6.0 (MINOR — 新增 TS-DepGraph-Hygiene 軌道 +
                                unified DESIGN doc 結構)
Modified principles:
  - IV. base 不改動邊界:
    (a) 軌道權威從各軌道獨立 DESIGN doc 合併為單一 DESIGN-W-BASE-WEB.md
        (W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 三軌道各 § 章節)
    (b) 新增第 3 條受管例外軌道「TS-DepGraph-Hygiene」:
        - 軌道權威: docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4
        - 可動範圍: base-web build/dep config (Dockerfile / package.json /
          pnpm-workspace.yaml / .npmrc / packages/*/package.json;
          **不**含 src/)
        - 動機限定: pnpm / node / Vite / TS 工具鏈 hygiene (依賴宣告齊全、
          版本 pin 一致、phantom dep elimination)
        - 仍不得動: src/ 任何檔 (W-WEBUI / TS-Typing-Sync 範圍亦排除)
        - 兩段式 commit 紀律同 W-WEBUI / TS-Typing-Sync
    (c) 048 sprint d521c819 + b4453385 retrospective 認定為
        TS-DepGraph-Hygiene 軌道之 047.5 retro-member
Added sections: None
Removed sections: None
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md 軌道辨識條目 2 → 3 軌道
  - ✅ docs/INTEGRATION-DESIGN-W-BASE-WEB.md 新 unified doc (rename + merge)
  - ✅ docs/INTEGRATION-DESIGN-W-WEBUI.md → git mv rename to BASE-WEB.md
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md → git rm (內容 merged 進 §3)
  - ✅ docs/INTEGRATION-CHECKLIST.md 048 milestone entry / 048-N1 / 049 entry
  - ✅ CLAUDE.md §1 / §7 索引 update
Follow-up TODOs: None
Prior reports:
  - (2026-05-25) 1.4.0 → 1.5.0: 新增 TS-Typing-Sync 軌道受管例外
    (W-WEBUI 軌道之外的第二受控軌道、限 src/typings/api/*.d.ts)
  - (2026-05-23) 1.3.0 → 1.4.0: 受管例外授權模型從「具名列舉」改為
    「DESIGN 文件 = 軌道權威」
  - (2026-05-23) 1.2.0 → 1.3.0: 受管例外列舉延伸（W-FW1–W-FW7 → W-FW1–W-FW8）
  - (2026-05-22) 1.1.0 → 1.2.0: 受管例外條款範圍擴充
  - (2026-05-21) 1.0.0 → 1.1.0: 新增受管例外條款
  - (2026-05-14) (initial template) → 1.0.0 initial ratification
================================================================
```

### R-4.2 — §IV 主體段落整段重寫（v1.5.0 兩軌道並列 → v1.6.0 三軌道並列、unified doc reference）

現有 v1.5.0 §IV 結構（line 95-112 兩段 + Rationale + Rationale）改寫為：

1. §IV 開頭「base 不改動邊界」段不變
2. 「**預設不動**」「**可動 .env**」「**base mock**」3 個 bullet 不變
3. 「**受管例外 — W-WEBUI 軌道**」段：wording 保留、doc reference 從 `INTEGRATION-DESIGN-W-WEBUI.md` 改為 `INTEGRATION-DESIGN-W-BASE-WEB.md §2`
4. 「**受管例外 — TS-Typing-Sync 軌道**」段：wording 保留、doc reference 從 `INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 改為 `INTEGRATION-DESIGN-W-BASE-WEB.md §3`
5. **新增**「**受管例外 — TS-DepGraph-Hygiene 軌道**」段（v1.6.0 起）：
   ```markdown
   **受管例外 — TS-DepGraph-Hygiene 軌道**（v1.6.0 起）：第三條得修改
   base-web source 的例外為 **TS-DepGraph-Hygiene 軌道**（[INTEGRATION-DESIGN-W-BASE-WEB.md §4](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md)）：

   - TS-DepGraph-Hygiene 軌道**整體**為受管例外；軌道權威為 [DESIGN-W-BASE-WEB.md §4](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md)
   - 可動範圍**嚴格限定**於 base-web build/dep config（即 `Dockerfile` / `package.json` / `pnpm-workspace.yaml` / `.npmrc` / `packages/*/package.json` 及子 package 對應 config）
   - 軌道目的：base-web 工具鏈 hygiene — pnpm/node/Vite/TS 依賴宣告齊全、版本 pin 一致、phantom dep elimination
   - 動機限定：每個 feature 必須舉證 build/dep config 紀律違反（如 phantom transitive use、雙 source-of-truth 版本 pin、pnpm major upgrade adjacency）；純 dep refactor 無紀律證據者 reject
   - **仍不得動**：`src/` 任何檔（views / components / typings / store / router / locales / service / 等）
   - **仍不得動**：W-WEBUI 軌道範圍 + TS-Typing-Sync 軌道範圍
   - TS-DepGraph-Hygiene 軌道對 base-web 的修改一律走兩段式 commit（base-web worktree → push fork → outer 更新 SHA pin）、同 W-WEBUI / TS-Typing-Sync 紀律
   - 此例外**僅適用 TS-DepGraph-Hygiene 軌道**；軌道外所有 feature 的 Constitution Check 對 base-web 改動仍 MUST 為 0 diff
   ```
6. 3 個軌道後改 **unified Rationale**：
   ```markdown
   **Rationale**（unified 三軌道）：base example 是上游持續演化的 starter；rev1 為使用者、不為改寫者 — 此立場在「後端適應 API GAP」範疇內成立、使未來 base 升級阻力最小。但 base example 管理後台操作表單本質為未接線的 UI stub、僅靠後端適應無法讓其運作；F14 cutover 後 rev1 成為自有產品、base-web 即 rev1 自有前端、補接線為必要的產品工作（W-WEBUI 軌道、v1.1.0 起）。post-039+040 wire DTO 變更後 TS 與 rust wire 真實型出現 type lie；W-WEBUI FR-015 禁碰 typings 無法修、設立 TS-Typing-Sync 為第二受控軌道（v1.5.0 起）。pnpm 11+ best practice 推 strict isolation + packageManager pin、host + container 工具鏈紀律需求出現；設立 TS-DepGraph-Hygiene 為第三受控軌道（v1.6.0 起）。三軌道**互斥不重疊**、軌道權威統一為 `INTEGRATION-DESIGN-W-BASE-WEB.md`、各軌道 §2/§3/§4 章節範圍嚴格限定；軌道外 feature Constitution Check 對 base-web 改動仍維持 0 diff 預設效力。
   ```

### R-4.3 — Version footer

```diff
- **Version**: 1.5.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-25
+ **Version**: 1.6.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-25
```

### R-4.4 — 估行數

| 區段 | 估計 |
|---|---|
| 檔頭 Sync Impact Report block 替換（v1.5→v1.6）| ~30 line |
| §IV 主體段落改寫（3 軌道 + unified Rationale） | ~30 line（淨 +5、原兩軌道段保留 wording、加新 TS-DepGraph-Hygiene 段 + unified Rationale 取代分散 Rationale）|
| Version footer | +1 line（diff）|
| **合計** | **~40 line**（base-web Phase 0 外層改動的主要量）|

---

## R-5 — DESIGN-W-BASE-WEB.md §1 軌道總覽 wording（new）

新 §1 為 umbrella doc 的 meta-section、介紹三軌道並列：

```markdown
## §1 軌道總覽

DESIGN-W-BASE-WEB 為 Constitution Principle IV「base 不改動邊界」**3 條受管例外軌道集合**的統一權威 doc（v1.6.0 起）：

### §1.1 三軌道並列、互斥不重疊

| 軌道 | 範圍 | 動機 | 引入版本 |
|---|---|---|---|
| **W-WEBUI**（§2）| `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` / `src/locales/` wiring 範圍 | 管理後台 stub 接線、最小 UI 新增 | Constitution v1.1.0（2026-05-21）|
| **TS-Typing-Sync**（§3）| `src/typings/api/*.d.ts` only | TS↔rust wire 序列化型對齊 | Constitution v1.5.0（2026-05-25）|
| **TS-DepGraph-Hygiene**（§4）| build/dep config (Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json) | pnpm/node/Vite/TS 工具鏈 hygiene（依賴宣告齊全、版本 pin 一致、phantom dep elimination） | Constitution v1.6.0（2026-05-25）|

三軌道**範圍互斥不重疊**、跨軌道 feature 必須拆成 2 feature。

### §1.2 軌道辨識義務（plan-template 強制）

每個改 `base-web/` 的 feature 在 spec-kit `plan.md` Constitution Check 段 MUST 明示屬哪條軌道（或軌道外）；spec-kit `plan-template.md` Constitution Check 段含 3-軌道辨識條目強制（v1.6.0 起）。

### §1.3 與 Constitution Principle IV 的關係

Constitution Principle IV「base 不改動邊界」預設**禁動 base-web**、三條軌道為**唯一可動例外**（per `INTEGRATION-DESIGN-W-BASE-WEB.md` §2/§3/§4 嚴格範圍）；軌道外 feature 對 base-web 仍 MUST 0 diff。
```

**估行數**：~50 line（含 table + 三節 sub-§）

---

## R-6 — DESIGN-W-BASE-WEB.md §4 TS-DepGraph-Hygiene wording（new）

按 §2/§3 既有結構同構（軌道定位 / 範圍 / 動機 / 成員 / 邊界 / 模式）：

```markdown
## §4 TS-DepGraph-Hygiene 軌道（base-web build/dep config hygiene）

### §4.1 軌道定位

TS-DepGraph-Hygiene 為 Constitution Principle IV「base 不改動邊界」**v1.6.0 起新增的第三條受管例外軌道**（前兩條為 W-WEBUI v1.1.0 + TS-Typing-Sync v1.5.0）。

**軌道目的**：base-web 工具鏈（pnpm / node / Vite / TS / Dockerfile）build/dep config hygiene — 依賴宣告齊全、版本 pin 一致、phantom dep elimination、host + container 工具鏈紀律對齊。

**觸發背景**：pnpm 11 改 hoist 設定 location（`.npmrc shamefully-hoist=true` → `pnpm-workspace.yaml nodeLinker: hoisted`）、host vs container pnpm version drift、Dockerfile ARG vs package.json packageManager field 雙 source-of-truth 等紀律需求出現；setting `nodeLinker: hoisted` 雖修 048 期間 host build 但屬「向後相容急救」、長期應採 pnpm 11+ 預設 strict isolation + explicit devDeps + packageManager pin。

### §4.2 可動範圍（硬邊界、不擴張）

**可動**：
- `base-web/Dockerfile`
- `base-web/package.json`
- `base-web/pnpm-workspace.yaml`
- `base-web/.npmrc`
- `base-web/packages/*/package.json`
- `base-web/build/*`（vite plugins / build scripts、限 audit 觸發的 implicit any 等 type 註解、不含 logic 改動）

**嚴禁動**：
- `base-web/src/` 任何檔（views / components / typings / store / router / locales / service / 等）
- W-WEBUI 軌道範圍
- TS-Typing-Sync 軌道範圍

### §4.3 動機限定

每個 sprint 必須**舉證** build/dep config 紀律違反：
- phantom transitive use（import 來源未在 package.json 宣告）
- 雙 source-of-truth 版本 pin（如 Dockerfile ARG + host system 雙來源 pnpm version）
- pnpm major upgrade adjacency（如 pnpm 10 → 11 hoist 行為變、setting location 變）
- vue-tsc / vite build phantom resolution error
- 其他 pnpm/node/Vite/TS 工具鏈 hygiene 紀律違反

**允許動作**：
- explicit devDep declarations（提升 phantom transitive 為直接 devDeps）
- 版本 pin 一致化（packageManager field / Dockerfile ARG 合一）
- 工具鏈 config cleanup（如 vestige `.npmrc` 設定）
- 同檔 audit 順道修 implicit any 等 type 註解

**不允許**：
- src/ 任何 runtime feature 改動
- W-WEBUI 範圍 wiring 改
- TS-Typing-Sync 範圍 typing 改
- 純 dep refactor 無紀律證據

### §4.4 軌道成員（sprint 歷史）

#### §4.4.1 047.5 retrospective（048 sprint 期間的 cross-boundary env-repair commits）

- **日期**：2026-05-25（與 048 sprint 同期、retrospective 認定為 TS-DepGraph-Hygiene 軌道首兩筆）
- **commits**：
  - `d521c819` fix(base-web): pnpm-workspace.yaml 加 nodeLinker: hoisted（修 pnpm 11 hoist 失效）
  - `b4453385` fix(base-web): Dockerfile pnpm 10.18.0 → 11.0.8 + --ignore-scripts（修 host vs container pnpm version drift）
- **scope**：env-repair adjacent fixes、user 拍板 cross-boundary minimal
- **acceptance**：048 期間 C-V2/C-V3 從 baseline broken → 0 error、container `Up (healthy)`
- **spec**：N/A（無獨立 sprint spec、屬 048 implementer-stage cross-boundary fix）

#### §4.4.2 049 base-web-dep-hygiene（首發 sprint）

- **日期**：2026-05-25 落地
- **commit**：outer `<TBD post-merge>` + merge `<TBD>` + base-web `<TBD>`
- **scope**：
  - comprehensive audit grep base-web + packages 所有 phantom transitive use、提升為直接 devDeps
  - 移除 `nodeLinker: hoisted` from pnpm-workspace.yaml（回 pnpm 預設 strict isolation）
  - 移除 `shamefully-hoist=true` from .npmrc（vestige）
  - 加 `"packageManager": "pnpm@11.0.8"` 進 base-web/package.json
  - Dockerfile 簡化（remove `ARG PNPM_VERSION` + `corepack prepare`、改吃 packageManager field）
  - 順道修 `build/plugins/unocss.ts:24` implicit any（+1 line type 註解）
- **觸發**：048-N1 (a)+(b)+(c) follow-up 結案 + pnpm 11+ best practice 對齊
- **acceptance**：C-V1~C-V10 全 PASS（含 CDP browser smoke 8 路徑）
- **spec**：[`specs/049-base-web-dep-hygiene/`](../specs/049-base-web-dep-hygiene/)

### §4.5 與其他軌道邊界

詳見 §1.1 三軌道並列 table；TS-DepGraph-Hygiene 與 W-WEBUI / TS-Typing-Sync 範圍**互斥不重疊**：

| 維度 | W-WEBUI（§2）| TS-Typing-Sync（§3）| TS-DepGraph-Hygiene（§4）|
|---|---|---|---|
| 可動 file | src/views/components/service/store/router/locales | src/typings/api/*.d.ts | Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json / build/* |
| 動機 | UI 接線 | TS↔rust wire 對齊 | 工具鏈 hygiene |
| **不**動 | typings/ + build/dep config | views/components/service/etc. + build/dep config | src/ 任何檔 |

### §4.6 預期 sprint 模式

**非常駐軌道**：不定期觸發、觸發訊號驅動。

**預期頻率**：1-2 feature/year（pnpm 大版本升級或 dep tree 結構大變動觸發、比 TS-Typing-Sync 還少見）。

**典型觸發訊號**：
- pnpm major version upgrade（pnpm 10 → 11、未來 11 → 12 等）
- node/Vite/TS major version upgrade 撞 dep resolution 變動
- 大量 phantom transitive 累積撞 vue-tsc / vite build 錯誤
- Dockerfile / package.json / .npmrc / pnpm-workspace.yaml 等 config 出現 multi-source-of-truth 紀律違反

**非觸發訊號**：
- 純 npm dep 升級 patch/minor 版（→ chore commit）
- src/ feature 工作（→ W-WEBUI / TS-Typing-Sync 軌道）
- 文件更新（→ docs 直接 commit）
- 後端 cleanup（→ spec-hygiene-pass 軌道）
```

**估行數**：~120 line（§4 整段）

---

## R-7 — plan-template 3-軌道辨識條目 wording（FR-003）

### R-7.1 — 現況（v1.5.0 落地後）

`/mnt/d/AnewSpaces/x_Project/fork260509-rev1/.specify/templates/plan-template.md` 既有 line 36-42：

```markdown
**軌道辨識義務**（Constitution v1.5.0+）：若 feature 涉及 `base-web/` 改動、Constitution Check 必須在 Principle IV 評估時明示屬哪條軌道（三選一）：

- **W-WEBUI 軌道**：feature 屬 [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) §5/§7 登記項；改 `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/`；**不**動 typings/
- **TS-Typing-Sync 軌道**：feature 屬 [`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](../../docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md) §4 登記項；改 `src/typings/api/*.d.ts`；**不**動 W-WEBUI 範圍
- **軌道外**：0 base-web diff、預設原則涵蓋

跨軌道 feature 必須拆成兩個 feature。
```

### R-7.2 — 改為 v1.6.0 wording（4 選一）

```markdown
**軌道辨識義務**（Constitution v1.6.0+）：若 feature 涉及 `base-web/` 改動、Constitution Check 必須在 Principle IV 評估時明示屬哪條軌道（四選一）：

- **W-WEBUI 軌道**：feature 屬 [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md §2`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md) 登記項；改 `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` / `src/locales/`；**不**動 typings/ + build/dep config
- **TS-Typing-Sync 軌道**：feature 屬 [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md §3`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md) 登記項；改 `src/typings/api/*.d.ts`；**不**動 W-WEBUI 範圍 + build/dep config
- **TS-DepGraph-Hygiene 軌道**（v1.6.0+）：feature 屬 [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md) 登記項；改 base-web build/dep config（Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json）；**不**動 src/ 任何檔
- **軌道外**：0 base-web diff、預設原則涵蓋

跨軌道 feature 必須拆成兩個 feature。
```

**估行數**：~8 line edit（既有 wording 7 line 改為 9 line、淨 +2）

---

## R-8 — CLAUDE.md §1/§7 索引 update wording（FR-003）

### R-8.1 — §1（軌道辨識義務）改動

現有 line 36 footnote：
```
**base-web 改動軌道**：base-web/ source 改動受 Constitution Principle IV 約束、僅 W-WEBUI / TS-Typing-Sync 兩條受管例外軌道允許（軌道權威分別為 [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](docs/INTEGRATION-DESIGN-W-WEBUI.md) 與 [`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md)、互斥不重疊）。軌道辨識義務由 spec-kit `plan-template.md` Constitution Check 段強制。
```

改為：
```
**base-web 改動軌道**：base-web/ source 改動受 Constitution Principle IV 約束、僅 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 三條受管例外軌道允許（軌道權威統一於 [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md`](docs/INTEGRATION-DESIGN-W-BASE-WEB.md) §2 / §3 / §4、三軌道互斥不重疊）。軌道辨識義務由 spec-kit `plan-template.md` Constitution Check 段強制。
```

### R-8.2 — §7（整合設計文件索引）改動

現有 line 336：
```
- **設計** — DESIGN-A 過渡 rust+nestjs [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) ／ DESIGN-B 現行 rust-only [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) ／ DESIGN-W-DEPLOYMENT [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) ／ DESIGN-W-WEBUI [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](docs/INTEGRATION-DESIGN-W-WEBUI.md) ／ DESIGN-W-TYPING-ALIGN [`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md)
```

改為（remove W-WEBUI + W-TYPING-ALIGN、加 W-BASE-WEB unified）：
```
- **設計** — DESIGN-A 過渡 rust+nestjs [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) ／ DESIGN-B 現行 rust-only [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) ／ DESIGN-W-DEPLOYMENT [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) ／ DESIGN-W-BASE-WEB unified（含 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 三軌道）[`docs/INTEGRATION-DESIGN-W-BASE-WEB.md`](docs/INTEGRATION-DESIGN-W-BASE-WEB.md)
```

**估行數**：~5 line edit（§1 footnote 1 line + §7 索引 1 line + 2 處 ref update）

---

## R-9 — Implementer-stage Expansion 候選（per FR-012 ≤3）

### R-9.1 — 候選 (a)：audit 漏抓 transitive 需補加

**grep**：`comm -23 /tmp/049-imports.txt /tmp/049-declared.txt` — comprehensive audit 跑完後若發現額外 phantom（如 `klona`, `rimraf`, `bumpp`, `cac`, `c12`, `execa`, `nanoid`, `qs` 等 6-10 個候選之中漏掉的）

**Decision**：implementer Phase 1 Step 1 跑完 audit 後若數量超過 expected 4 個（@iconify/utils / @unocss/core / @unocss/preset-mini / axios）、user 確認後拾取。預估 ≤5 line edit per phantom（add to package.json devDeps）。

### R-9.2 — 候選 (b)：`packages/<sub>/package.json` 其他 sub-package 也需動

**grep**：`audit 結果 file:line 來源` 分類、看哪些 sub-package 也有 phantom。已知 packages/uno-preset 需動、packages/scripts 可能也需動（含 bumpp/cac/c12/execa/rimraf 等 tooling）。

**Decision**：若 audit 發現多 sub-package 需動、implementer 階段確認 user 後拾取。預估 ≤3 line edit per sub-package。

### R-9.3 — 候選 (c)：`.npmrc` 其他 vestige line cleanup

**grep**：`grep -n "registry\|hoist\|workspace" .npmrc` — 確認哪些 line 是 pnpm 10 vestige、哪些是運維選擇（如 npmmirror registry）。

**Decision**：若 audit 發現其他 pnpm 10 vestige、implementer 階段確認後 cleanup；預設只移 `shamefully-hoist=true`、其他保留。

### R-9 總結

| 候選 | 來源 | 內容 | 估計 |
|---|---|---|---|
| (a) | R-1 audit | audit 漏抓 transitive 需補加 | ≤5 line edit per phantom |
| (b) | R-1 audit | packages/<sub>/package.json 其他 sub-package 需動 | ≤3 line edit per sub-package |
| (c) | spec edge case | .npmrc 其他 vestige cleanup | ≤2 line edit |

**Decision**：plan 階段 0 主動拾取、留 implementer 階段 user 確認後拾取 ≤3 處（per FR-012 budget）；超限拒拾、登 049+ follow-up。

---

## Phase 0 結論

9 個 research item 全 resolve、precise audit methodology 確認、Constitution amendment + DESIGN doc merge 內容拍板：

| Open Q | Decision | 依據 |
|---|---|---|
| audit methodology | comprehensive grep base-web + packages 全 import vs package.json declared deps | R-1 |
| W-WEBUI content mapping | 1:1 搬進 §2.1-§2.5、原 §5+§7 合一 | R-2 |
| TYPING-ALIGN content mapping | 1:1 搬進 §3.1-§3.6、§5 邊界 wording 改 unified | R-3 |
| Constitution amendment | v1.5→v1.6、§IV 三軌道並列、unified Rationale、~40 line edit | R-4 |
| DESIGN-W-BASE-WEB §1 wording | umbrella table + 三節 sub-§、~50 line | R-5 |
| DESIGN-W-BASE-WEB §4 wording | 與 §2/§3 同構（定位/範圍/動機/成員/邊界/模式）+ 049 首發 + 048 retro、~120 line | R-6 |
| plan-template 軌道辨識 | 2 軌道 → 4 選一（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene / 軌道外） | R-7 |
| CLAUDE.md §1/§7 update | §1 footnote 改 3 軌道 + §7 索引 unified doc | R-8 |
| Expansion 候選 | 3 拾取 candidate (a)(b)(c)、≤3 budget 內 | R-9 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
