# 049 base-web dep-hygiene + track-restructure（brainstorm spec-design）

**Date**: 2026-05-25
**Status**: brainstorm complete、user-approved 6 sections、ready for `/speckit-specify`
**Branch**: `049-base-web-dep-hygiene`（pre-hook 將建）
**Sprint type**: spec-kit feature、含 Phase 0 Constitution v1.5.0 → v1.6.0 amendment（SDD「先合法化、再執行」）

**前置背景**：
- 048 base-typings-sync 落地後留 048-N1 follow-up（pnpm 11 hoist env-repair long-term review 4 項 (a)(b)(c)(d)）
- user 2026-05-25 brainstorm 中決定全包 (a)+(b)+(c)、Constitution governance 同步 restructure
- 048 expansion budget 已用 1 of ≤3（commit `d521c819` + `b4453385`、retrospective 認定為 TS-DepGraph-Hygiene 軌道首發）

---

## §1 Sprint Goal + Scope

**Goal**：
1. 完全結案 048-N1 follow-up 的 (a)+(b)+(c) 三項（(d) trigger-driven 留）
2. Constitution governance restructure：3 條 base-web 受管例外軌道集中至 unified DESIGN doc
3. base-web build/dep config 對齊 pnpm 11 best practice（strict isolation + explicit devDeps + packageManager pin + Dockerfile 簡化）

**Sprint name**：`049 base-web-dep-hygiene-and-track-restructure`（簡稱 049 dep-hygiene）

**Bundled scope（單 sprint 兩 Part）**：

### Part A — 軌道 governance restructure（Phase 0、必先、per SDD「先合法化、再執行」）

- Constitution v1.5.0 → v1.6.0 amendment（新增第 3 軌道 + unified DESIGN doc 結構）
- `docs/INTEGRATION-DESIGN-W-WEBUI.md` → **`git mv` rename → `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`**（保留 git history、原 W-WEBUI 內容變 §2 sub-tree）
- 重構 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`（umbrella structure：§1 軌道總覽 / §2 W-WEBUI 原內容 / §3 TS-Typing-Sync 內容 / §4 TS-DepGraph-Hygiene 新內容）
- `git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（內容 merged 進新 doc §3、git history 切斷但內容保留）
- `.specify/templates/plan-template.md` 軌道辨識條目 2 軌道 → 3 軌道
- `CLAUDE.md` §7 索引：remove DESIGN-W-WEBUI / DESIGN-W-TYPING-ALIGN refs、新加 DESIGN-W-BASE-WEB ref
- `docs/INTEGRATION-CHECKLIST.md` 048 milestone entry 提及 DESIGN-W-TYPING-ALIGN 處改寫
- 048 d521c819 / b4453385 retrospective 認定為 TS-DepGraph-Hygiene 軌道首發

### Part B — base-web dep hygiene impl（Phase 1、軌道合法化後）

- audit grep base-web + packages 所有 import 找出 phantom transitive use
- 提升 phantom transitive 為直接 devDeps（放對應 package.json）
- 移除 `nodeLinker: hoisted` from `pnpm-workspace.yaml`
- 移除 `shamefully-hoist=true` from `.npmrc`（pnpm 11 不讀、vestige）
- 加 `"packageManager": "pnpm@11.0.8"` 進 `base-web/package.json`
- Dockerfile 簡化（remove `ARG PNPM_VERSION` + `corepack prepare`、改吃 packageManager field、keep `corepack enable`）
- 順道修 `build/plugins/unocss.ts:24` implicit any（baseline error #2、+1 line type 註解）

**結案後狀態**：
- 048-N1 完全結案 (a)(b)(c) 三項
- base-web governance 集中單一 unified DESIGN doc（DESIGN-W-BASE-WEB.md）
- host + container pnpm version 單一 source of truth（package.json packageManager field）

---

## §2 DESIGN-W-BASE-WEB.md 結構

```
# DESIGN-W-BASE-WEB：base-web 改動受管例外軌道集合（「base 不改動邊界」的受管例外總覽）

## §1 軌道總覽
  §1.1 三軌道並列、互斥不重疊
  §1.2 軌道辨識義務（plan-template 強制）
  §1.3 與 Constitution Principle IV 的關係

## §2 W-WEBUI 軌道（base-web 管理後台 CRUD 接線）
  §2.1 軌道定位（原 W-WEBUI §1.1）
  §2.2 受管例外授權（原 W-WEBUI §1.2）
  §2.3 範圍邊界（原 W-WEBUI §4）
  §2.4 Feature 切分 W-FW1~W-FW9（原 W-WEBUI §5/§7、含 14 條已完成 sprint 紀錄）
  §2.5 與其他軌道邊界

## §3 TS-Typing-Sync 軌道（TS↔rust wire 序列化型對齊）
  §3.1 軌道定位（merged from DESIGN-W-TYPING-ALIGN §1）
  §3.2 可動範圍 src/typings/api/*.d.ts only（merged §2）
  §3.3 動機限定（merged §3）
  §3.4 軌道成員 sprint 紀錄（含 048 base-typings-sync 首發、merged §4）
  §3.5 與其他軌道邊界（merged §5）
  §3.6 預期 sprint 模式（merged §6）

## §4 TS-DepGraph-Hygiene 軌道（新、049 首發）
  §4.1 軌道定位（base-web build/dep config hygiene、pnpm/node 工具鏈紀律）
  §4.2 可動範圍（Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json 等 build/dep config、**不**含 src/）
  §4.3 動機限定（pnpm 升級 / dep 結構大變動 / phantom dep elimination；**不**含 runtime feature 改動）
  §4.4 軌道成員 sprint 紀錄（049 首發 + 048 d521c819/b4453385 retrospective）
  §4.5 與其他軌道邊界
  §4.6 預期 sprint 模式（少見、pnpm 大版本升級或 dep 結構大變動觸發）
```

**設計決定**：
1. 三軌道為 same-level § 章節、避免 nesting
2. 各軌道下子 § 結構統一（定位 / 範圍 / 動機 / 成員 / 邊界 / 模式）— 之後加新軌道有 template 可循
3. §1 軌道總覽是新加 meta-section、明示三軌道互斥 + 辨識義務
4. W-WEBUI 內容（§5/§7 14 個 W-FW 子項）原樣搬進 §2.4、numbering 調整但內容不動
5. TS-Typing-Sync 內容直接從 DESIGN-W-TYPING-ALIGN 搬進 §3、原 doc 即刪除

**檔案行數預估**：~400-450 line（W-WEBUI 255 + TYPING-ALIGN 116 + 新加 §1 + §4 ~80 line）

---

## §3 Constitution v1.5.0 → v1.6.0 amendment 內容

### 3.1 標頭 Sync Impact Report block

現 1.4→1.5 block 沉到 Prior reports（同 048 體例）；新加 1.5→1.6 block 在最上：

```text
Version change: 1.5.0 → 1.6.0 (MINOR — 新增 TS-DepGraph-Hygiene 軌道 +
                               unified DESIGN doc 結構)
Modified principles:
  - IV. base 不改動邊界:
    (a) 軌道權威從各軌道獨立 DESIGN doc 合併為單一 DESIGN-W-BASE-WEB.md
        (W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 三軌道各 § 章節)
    (b) 新增第 3 條受管例外軌道「TS-DepGraph-Hygiene」:
        - 軌道權威: docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4
        - 可動範圍: base-web build/dep config (Dockerfile / package.json /
          pnpm-workspace.yaml / .npmrc / packages/*/package.json; **不**含 src/)
        - 動機限定: pnpm / node / Vite / TS 工具鏈 hygiene (依賴宣告齊全、
          版本 pin 一致、phantom dep elimination)
        - 仍不得動: src/ 任何檔 (W-WEBUI / TS-Typing-Sync 範圍亦排除)
        - 兩段式 commit 紀律同 W-WEBUI / TS-Typing-Sync
    (c) 048 sprint d521c819 + b4453385 retrospective 認定為
        TS-DepGraph-Hygiene 軌道之 047.5 retro-member
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md 軌道辨識條目 2 → 3 軌道
  - ✅ docs/INTEGRATION-DESIGN-W-BASE-WEB.md 新 unified doc
  - ✅ docs/INTEGRATION-DESIGN-W-WEBUI.md → git mv 改名為 DESIGN-W-BASE-WEB.md (保留 git history)
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md 刪除 (內容 merged 進新 doc §3)
  - ✅ docs/INTEGRATION-CHECKLIST.md 048 entry / 048-N1 follow-up update
  - ✅ CLAUDE.md §1 / §7 索引 update
Follow-up TODOs: 無
```

### 3.2 §IV 主體段落改寫

現有 W-WEBUI 段（line 95-103）+ TS-Typing-Sync 段（line 99-108）改寫為：
- 統一 wording、3 條受管例外軌道、權威 doc 統一指向 `DESIGN-W-BASE-WEB.md`
- 各軌道一段：範圍 / 動機 / 兩段式 commit 紀律重述
- W-WEBUI 段保留既有 wording（避免 churn）只改 doc reference 為新 unified
- TS-Typing-Sync 段同
- 新加 TS-DepGraph-Hygiene 段：軌道權威 / 可動範圍 / 動機限定
- 三段共通 Rationale 合併為 unified Rationale（描述為何採三軌道、與 base 不動邊界的關係）

### 3.3 檔尾 Version line

```diff
- **Version**: 1.5.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-25
+ **Version**: 1.6.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-25
```

### 3.4 估行數

~30-40 line edit（標頭 Sync block ~20 + §IV 段落改寫 ~15-20 + Version line 1）

### 3.5 注意

v1.5.0 落地 1 day（2026-05-25）後即 v1.6.0 retro-restructure；amendment commit message 須明示「原 v1.5.0 兩 doc 結構過早 commit 為主因、未預見第 3 軌道立即接踵」rationale、避未來 reviewer 誤判 churn-by-design。

---

## §4 base-web dep hygiene impl detail

### 4.1 audit grep methodology

```bash
# 在 base-web/ root 跑、提取所有 import 的 package name
grep -rEh "^\s*import\s+.*from\s+['\"]([^.][^'\"]*)['\"]" \
     src/ build/ packages/*/src/ \
     --include="*.ts" --include="*.vue" --include="*.tsx" \
     | grep -oP "from\s+['\"]\K[^'\"]+" \
     | grep -v "^[.@]" | grep -v "^node:" \
     | sort -u > /tmp/049-imports.txt

# scoped pkg path split: @iconify/utils/lib/loader/node-loaders → @iconify/utils
# (audit step 4.2 expand)

# 比對 declared deps in package.json (base-web/ + packages/*/)
# 用 jq merge deps + devDeps + peerDeps keys → /tmp/049-declared.txt

# diff: phantom transitive use
diff /tmp/049-imports.txt /tmp/049-declared.txt | grep "^<"
```

**注意**：
- `@sa/*` 是 workspace internal package、跳過
- `node:fs` / `node:path` 等 node builtin、跳過
- scoped pkg `@iconify/utils/lib/loader/node-loaders` 要 split 取 `@iconify/utils`
- vue / vite plugin 自帶 import (vue-tsc generates), 跳過 type-only imports

### 4.2 預期 phantom transitive list（per 048 baseline 15 errors）

- `@iconify/utils` ← `build/plugins/unocss.ts:5`（base-web root）
- `@unocss/core` ← `packages/uno-preset/src/index.ts:3`（uno-preset workspace）
- `@unocss/preset-mini` ← `packages/uno-preset/src/index.ts:4`（uno-preset workspace）
- `axios` ← `src/service/request/index.ts:1`（base-web root）
- 其他 audit 後發現（comprehensive grep 預期額外 0-5 個）

### 4.3 dep 提升 placement 原則

- import 來源 file 所在 package 決定加進哪個 package.json
- `build/plugins/unocss.ts` 屬 base-web root → 加進 base-web/package.json
- `packages/uno-preset/src/` → 加進 packages/uno-preset/package.json
- 加 `devDependencies` for build-time deps（`@iconify/utils`, `@unocss/*`）
- 加 `dependencies` for runtime deps（`axios`）
- 版本 pin 用 lockfile 既有 resolved version（避免改動 lock）

### 4.4 config 改動 sequence（重要：順序錯會撞 transient build break）

```
Step 1: 加 transitive deps 進 package.json
Step 2: pnpm install --frozen-lockfile --ignore-scripts (verify lockfile in sync)
Step 3: pnpm typecheck + vite build (3-fold verify: 0 error + dist 產出)
Step 4: 移 `nodeLinker: hoisted` from pnpm-workspace.yaml
Step 5: 移 `shamefully-hoist=true` from .npmrc (vestige)
Step 6: 重 install + 重 typecheck + 重 build (確認 strict isolation 下也過)
Step 7: 加 `"packageManager": "pnpm@11.0.8"` 進 base-web/package.json
Step 8: 改 Dockerfile (remove ARG PNPM_VERSION + corepack prepare、keep corepack enable)
Step 9: docker build (容器內也過 strict mode + 從 packageManager field 讀版本)
Step 10: 全程不 commit、最後 atomic 1 commit
```

**每步必跑**：`pnpm install --frozen-lockfile --ignore-scripts` + `pnpm typecheck` + `vite build` 三驗、有問題即停 + debug。

### 4.5 風險

- 步驟 4 移 `nodeLinker: hoisted` 後若 audit 漏抓某 transitive、build 會撞同 048 baseline error
- mitigation：comprehensive grep + 步驟 sequence + 撞即停補 dep + implementer-stage scope expansion ≤3 budget

### 4.6 順道 fix：build/plugins/unocss.ts:24 implicit any

```diff
- (svg) => transformSVG(svg)
+ (svg: string) => transformSVG(svg)
```

屬同檔 audit 範圍、+1 line、不算 scope creep。

### 4.7 commit shape preview（per CLAUDE.md §4.1）

**base-web worktree 1 commit**：上述 step 1-9 整體（dep 提升 + config cleanup + Dockerfile 簡化 + implicit any fix）

**outer commits 4 個**：
1. Phase 0 amendment：Constitution v1.6.0 + git mv W-WEBUI.md→BASE-WEB.md + restructure to umbrella + merge TYPING-ALIGN content + git rm TYPING-ALIGN.md + plan-template + CLAUDE.md
2. base-web SHA pin bump
3. INTEGRATION-CHECKLIST update：(a) 048-N1 row 從衍生 follow-up table 移除（或標記「已結案 (a)(b)(c)、(d) trigger-driven 留」）+ (b) 049 entry 加進已完成里程碑 + (c) Current Focus update + (d) SPECKIT marker idle
4. SHA backfill post-merge

---

## §5 Acceptance C-V verification matrix

對齊 048 體例、依 sprint scope 分 C-V1~C-V10：

| C-V | 內容 | 對應 FR | 期望 |
|---|---|---|---|
| **C-V1** | dev stack 12 service healthy + drainer | baseline | 12 service Up（9 healthy + 3 by-design no-hc）、接 048 baseline |
| **C-V2** | host `pnpm install --frozen-lockfile --ignore-scripts` PASS | FR-004 | lockfile in sync、無新 dep 衝突 |
| **C-V3** | host `vue-tsc --noEmit --skipLibCheck` 0 error | FR-004 | strict isolation 下無 phantom import、audit 完整 |
| **C-V4** | host `vite build --mode prod` PASS、dist 產出 | FR-004 | strict isolation 下 runtime build 也 OK |
| **C-V5** | docker rebuild base-web + container `Up (healthy)` | FR-005 | corepack 從 packageManager field 讀 pnpm version、build 內也 strict mode 過 |
| **C-V6** | CDP browser smoke 8 路徑（reuse 048 cdp-smoke.js） | FR-006 | 8/8 PASS、無 console error（與 048 比） |
| **C-V7** | grep audit verification | FR-007 | (a) `nodeLinker: hoisted` 0 hit in pnpm-workspace.yaml; (b) `shamefully-hoist=true` 0 hit in .npmrc; (c) `packageManager.*pnpm` ≥1 hit in package.json; (d) Dockerfile `ARG PNPM_VERSION` 0 hit、`corepack prepare` 0 hit |
| **C-V8** | boundary verify | FR-010 | rust-api 0 diff; base-web src/ 內 0 diff; 只動 build/dep config + package.json devDeps + packages/uno-preset/package.json |
| **C-V9** | Constitution v1.6.0 + DESIGN-W-BASE-WEB.md 完整性 | FR-001~003 | v1.6.0 bump ≥1 hit; DESIGN-W-BASE-WEB.md 3 軌道 §（§2/§3/§4）命中; DESIGN-W-TYPING-ALIGN.md 不存在; 原 W-WEBUI.md 不存在; plan-template 3-軌道辨識 wording 命中; CLAUDE.md §7 索引 update |
| **C-V10** | INTEGRATION-CHECKLIST cleanup | FR-008 | 048-N1 row 從衍生 follow-up table 移除（或 inline note refresh 為「已結案 (a)(b)(c)」）；049 entry 加進已完成里程碑；CLAUDE SPECKIT marker idle |

**Spec FR mapping draft**：
- FR-001~003：Part A 軌道 governance restructure（Constitution + DESIGN merge + plan-template）
- FR-004~007：Part B base-web dep hygiene（packageManager pin + Dockerfile + strict isolation + audit）
- FR-008~009：INTEGRATION-CHECKLIST cleanup + 048-N1 結案
- FR-010：軌道紀律 boundary verify

**特殊紀律**（per spec FR-008 體例同 048）：
- SDD「先合法化、再執行」：Phase 0 必先（Constitution v1.6.0 + DESIGN merge）、才能合法做 Part B
- C-V3 + C-V4 雙 PASS 才得 commit base-web worktree

---

## §6 Edge cases / clarifications / risks

### 6.1 packageManager field format
用 `"packageManager": "pnpm@11.0.8"`（無 sha512 hash）— corepack 接受、newer corepack 可能 warn 但不 fatal。若 future corepack 強制 hash、再補（屬 048-N1 (d) trigger 觸發場景）。

### 6.2 .npmrc preservation
- 移除：`shamefully-hoist=true`（vestige、pnpm 11 不讀）
- **保留**：`registry=https://registry.npmmirror.com/`（中國境內 mirror、運維選擇）
- **保留**：`ignore-workspace-root-check=true` + `link-workspace-packages=true`（pnpm workspace 行為、與 hoist 無關）

### 6.3 隱藏 baseline error #2 — implicit any
`build/plugins/unocss.ts(24,65)`：`Parameter 'svg' implicitly has an 'any' type`、屬同檔 audit 範圍、+1 line type 註解、不算 scope creep。

### 6.4 workspace sub-package package.json 修改
`packages/uno-preset/package.json` 加 `@unocss/core` + `@unocss/preset-mini` 為 devDeps。屬軌道內動 workspace sub-package、TS-DepGraph-Hygiene 軌道可動範圍。C-V8 boundary verify 須明示「sub-package package.json 可動、src/* 0 diff」。

### 6.5 Dockerfile pnpm BuildKit cache 影響
`RUN corepack enable` 比 `RUN corepack enable && corepack prepare` 簡單；corepack enable 後 first `pnpm` invocation triggers download from `packageManager` field；BuildKit layer cache 可能 miss 1 次（first build 後 cache）。

### 6.6 風險清單

| 風險 | 機率 | 影響 | mitigation |
|---|---|---|---|
| audit 漏抓某 transitive、撞 build break | 中 | 中 | comprehensive grep + 步驟 4.4 sequence + 撞即停補 dep + ≤3 expansion budget |
| Constitution v1.5→v1.6 churn 內部混亂 | 低 | 低 | amendment message 明示 retro-restructure rationale |
| DESIGN doc cross-ref 漏更新 | 中 | 中 | C-V9 boundary verify grep 全 reference |
| corepack packageManager field 行為差異 | 低 | 低 | acceptance verify in dev + dockerfile 都過 |
| 048-N1 (a) hoist decision 反悔 | 低 | 中 | spec 內預埋 follow-up：若 strict isolation 撞 runtime issue、可重新切回 hoisted（但 explicit devDeps 仍保留） |

### 6.7 Out-of-scope

- 048-N1 (d) 「下次 pnpm 升級重新檢視」：trigger-driven、本 sprint 不動 pnpm version（保持 11.0.8）
- rust-api / nginx / docker compose 其他 config：不在 TS-DepGraph-Hygiene 範圍
- F1.2 JWT / W-F6b acme / W-F15/16 backup：與 049 無關
- expansion ≤3 budget：本 sprint 預估足、若撞 audit 漏抓需 implementer-stage scope expansion、登記但 ≤3 cap

---

## §7 落地估時

| 階段 | 估時 |
|---|---|
| `/speckit-specify` | ~30 min |
| `/speckit-plan` | ~30 min |
| `/speckit-tasks` | ~20 min |
| `/speckit-analyze` | ~10 min |
| `superpowers:executing-plans` (Phase 0 + Part B + acceptance + commits + merge) | ~3-4 hr |
| **合計** | **~5-6 hr**（含 audit comprehensive grep + DESIGN doc merge + Constitution amendment + impl + acceptance + commits） |

---

## §8 Next step

**Ready for `/speckit-specify`** — 此 brainstorm spec-design 餵給 specify、產出 `specs/049-base-web-dep-hygiene/spec.md`。

User-approved 6 sections（2026-05-25）：
- §1 Scope + Bundled Part A + Part B ✅
- §2 DESIGN-W-BASE-WEB.md 結構 ✅
- §3 Constitution v1.5.0 → v1.6.0 amendment 內容 ✅
- §4 base-web dep hygiene impl detail ✅
- §5 Acceptance C-V1~C-V10 matrix ✅
- §6 Edge cases / clarifications / risks ✅
