# Implementation Plan: 049 base-web-dep-hygiene-and-track-restructure

**Branch**: `049-base-web-dep-hygiene` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/049-base-web-dep-hygiene/spec.md`

## Summary

兩 Part 同 sprint、SDD「先合法化、再執行」紀律：

**Part A — 軌道 governance restructure**（Phase 0、必先）：
- Constitution v1.5.0 → v1.6.0 amendment（§IV 改寫為 3 條受管例外軌道、unified DESIGN doc 結構）
- `git mv` rename `docs/INTEGRATION-DESIGN-W-WEBUI.md` → `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`（保留 git history）
- 重構 BASE-WEB.md 為 umbrella structure（§1 軌道總覽 + §2 W-WEBUI + §3 TS-Typing-Sync + §4 TS-DepGraph-Hygiene 新）
- `git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（內容 merged 進 §3）
- `.specify/templates/plan-template.md` 3-軌道辨識條目 update
- `CLAUDE.md` §1（軌道辨識義務）+ §7（整合設計文件索引）update

**Part B — base-web dep hygiene impl**（Phase 1、軌道合法化後）：
- comprehensive audit grep base-web + packages 所有 import、找 phantom transitive use
- 提升 phantom transitive 為直接 devDeps（base-web/package.json + packages/*/package.json）
- 移除 `nodeLinker: hoisted` from pnpm-workspace.yaml（回 pnpm 預設 strict isolation）
- 移除 `shamefully-hoist=true` from .npmrc（vestige、pnpm 11 不讀）
- 加 `"packageManager": "pnpm@11.0.8"` 進 base-web/package.json
- Dockerfile 簡化（remove `ARG PNPM_VERSION` + `corepack prepare`、改吃 packageManager field）
- 順道修 `build/plugins/unocss.ts:24` implicit any（+1 line type 註解、同檔 audit 範圍）

技術 approach（per spec FR-001~012 + brainstorm 6 sections）：
- **SDD「先合法化、再執行」**：Phase 0 amendment **必先**完成、Phase 1 才能合法做 base-web 改動
- **comprehensive audit**：grep base-web/{src/, build/, packages/*/src/} 所有 import statement、提取 phantom transitive use（即 import 來源未在對應 package.json 宣告者）
- **strict isolation 紀律**：pnpm-workspace.yaml 拿掉 `nodeLinker: hoisted` 後、所有 transitive 必須由 explicit devDeps 涵蓋
- **packageManager 單一 source of truth**：host + container 都讀 base-web/package.json packageManager field、Dockerfile ARG 廢除
- **`git mv` rename 保留 history**：DESIGN-W-WEBUI.md → DESIGN-W-BASE-WEB.md 用 git mv、避免 history 切斷
- **commit shape**：base-web worktree 1 commit（Part B 整體）+ outer 4 commit（amendment / SHA pin / INTEGRATION-CHECKLIST / SHA backfill）+ merge `--no-ff` 回 `rev1-admin-root`

implementer-stage expansion budget ≤3（per 041 / 043 / 046 / 047 / 048 體例）；候選由 Phase 0 research grep 後拍板。

## Technical Context

**Language/Version**：TypeScript 5.x（base-web 既有 toolchain）；Vue 3.x；vue-tsc + vite；無新 language
**Primary Dependencies**：
- 既有 base-web：`vue` / `vue-router` / `naive-ui` / `pinia` / `axios` / `@elegant-router/vue` etc.
- 新加 explicit devDeps（per audit）：`@iconify/utils` / `@unocss/core` / `@unocss/preset-mini` / `axios`（已 transitive、提升為直接）+ audit 後發現 0-5 個
- 工具：`pnpm@11.0.8`（packageManager pin、host + container 共用）；`corepack`（從 packageManager field 讀版本）
- **0 新 cargo dep、0 新 npm dep**（純 transitive → direct 提升、版本 pin 用 lockfile resolved version）

**Storage**：N/A — 無 application storage（純 build/dep config hygiene + governance restructure）

**Testing**：
- Static：`pnpm install --frozen-lockfile --ignore-scripts` PASS + `vue-tsc --noEmit --skipLibCheck` 0 error + `vite build --mode prod` dist 產出
- Runtime acceptance：docker rebuild base-web image → container `Up (healthy)` → SPA HTTP 200 → CDP browser smoke 8 路徑（reuse 048 cdp-smoke.js）
- 無新 unit test（dep/config hygiene、無新純函式邏輯、acceptance-only-via-CDP-smoke 紀律對齊 048 體例）

**Target Platform**：base-web container（front-nginx 取 SPA assets）；dev WSL2 + Docker Desktop；host + container 都用 pnpm 11.0.8

**Project Type**：TS-DepGraph-Hygiene 軌道首發 sprint；軌道**內** base-web build/dep config + 軌道外 rev1 整合層（Constitution v1.6.0 amendment + DESIGN doc merge）

**Performance Goals**：
- `pnpm install --frozen-lockfile --ignore-scripts` runtime：~5-15 sec（lockfile 已 resolved）
- `pnpm typecheck` runtime：~5-15 sec（vue-tsc full scan）
- `vite build --mode prod` runtime：~30-60 sec（vite full bundle）
- docker base-web image rebuild：~5-10 min（含 BuildKit cache miss、first build 後 cache）
- CDP smoke 8 路徑：~20-30 min（reuse 048 driver）

**Constraints**：
- 限 base-web build/dep config 範圍（`Dockerfile` / `package.json` / `pnpm-workspace.yaml` / `.npmrc` / `packages/*/package.json` / `build/plugins/unocss.ts`）（FR-008）
- 0 rust-api 改動、0 schema migration、0 新 entity、0 新 npm dep（純 transitive 提升、無新版本）、0 新 cargo dep、0 base-web src/ diff（FR-008）
- SDD「先合法化、再執行」順序紀律（FR-009）
- implementer-stage expansion ≤3 處（FR-012）

**Scale/Scope**：
- Part A 改動：constitution.md ~30-40 line + DESIGN-W-BASE-WEB.md ~400-450 line（restructure W-WEBUI 255 + TYPING-ALIGN 116 + 新 §1+§4 ~80 line）+ plan-template ~5-10 line + CLAUDE.md ~5-10 line
- Part B 改動：package.json ~5-10 line（packageManager + 加 devDeps）+ pnpm-workspace.yaml -1 line + .npmrc -1 line + Dockerfile ~-5 +1 line + packages/uno-preset/package.json ~2-5 line + build/plugins/unocss.ts +1 line
- 總計 ~500-550 line outer diff + ~20-30 line base-web diff
- ~5-6hr 落地（per brainstorm §7 估時）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**重要前提**：本 sprint 的 Constitution Check **跨越 v1.5.0 → v1.6.0 amendment**。Phase 0 第一步即 amend constitution、使 sprint 後續階段對 base-web 改動合法。下表針對 **post-amendment v1.6.0** 對照（amendment 前 v1.5.0 對本 sprint 為 violation、Phase 0 先 bump 即 resolved）：

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.6.0**（本 sprint Phase 0 將從 v1.5.0 bump）：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 不動 Casbin / JWT / RBAC / permission；純 base-web build/dep config + governance restructure。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 不動 audit / soft delete pipeline；本 sprint 不寫 sys_operation_log、不動任何 DB / outbox / drainer。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 純 base-web dep hygiene + Constitution amendment + DESIGN doc merge；無新 service / endpoint / channel / metric / service-to-service call / forwarding。 | ✅ PASS |
| **IV. base 不改動邊界**（**v1.6.0 新增 TS-DepGraph-Hygiene 軌道受管例外**）| 本 sprint 為 **TS-DepGraph-Hygiene 軌道首發**（amendment 同步落地）、軌道權威 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4`；可動範圍限 base-web build/dep config（Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json / build/plugins/unocss.ts）、base-web src/ + W-WEBUI 範圍 + TS-Typing-Sync 範圍全 forbidden（FR-008 boundary verify）；動機限定為「pnpm 11+ best practice 對齊」（spec.md FR-001~007 舉證）。**Amendment 為 Phase 0 prerequisite、sprint 整體合法**。同 W-WEBUI / TS-Typing-Sync 軌道兩段式 commit 紀律。 | ✅ PASS（v1.6.0 後） |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 build/dep config hygiene；強化 DESIGN-B 形態（base-web 工具鏈紀律對齊 pnpm 11+ best practice）；不引 nestjs / DESIGN-A 任何殘留。 | ✅ PASS |

**軌道辨識**（v1.6.0+、三選一）：

- **W-WEBUI 軌道**：feature 屬 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §2` 登記項；改 `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/`
- **TS-Typing-Sync 軌道**：feature 屬 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §3` 登記項；改 `src/typings/api/*.d.ts`
- **TS-DepGraph-Hygiene 軌道**（v1.6.0+）：feature 屬 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4` 登記項；改 build/dep config
- **軌道外**：0 base-web diff、預設原則涵蓋

**049 自己選擇**：**TS-DepGraph-Hygiene 軌道首發 sprint**（軌道本 sprint 建、本 sprint 為首位 member）。

**架構約束** 同步檢查：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 0 影響（純 build/dep config hygiene、無 log 改動）
- §Observability「promtail → Loki + prometheus + grafana 為**必要**stack」→ 0 影響（純 build/dep config、無 metric / dashboard / alert 變動）
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 不動既有 3 background task

**Constitution Check 結論（post-amendment v1.6.0）**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**Constitution amendment 本身為本 sprint Phase 0 必要動作、非 violation**（spec FR-009 明文要求順序紀律）。

**Constitution amendment 內容**（per spec FR-001 + brainstorm §3）：

```text
Version change: 1.5.0 → 1.6.0 (MINOR — 新增 TS-DepGraph-Hygiene 軌道 +
                                unified DESIGN doc 結構)
Modified principles:
  - IV. base 不改動邊界:
    (a) 軌道權威從各軌道獨立 DESIGN doc 合併為單一 DESIGN-W-BASE-WEB.md
    (b) 新增第 3 條受管例外軌道「TS-DepGraph-Hygiene」:
        - 軌道權威: docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4
        - 可動範圍: base-web build/dep config (Dockerfile / package.json /
          pnpm-workspace.yaml / .npmrc / packages/*/package.json;
          **不**含 src/)
        - 動機限定: pnpm / node / Vite / TS 工具鏈 hygiene
        - 仍不得動: src/ 任何檔 (W-WEBUI/TS-Typing-Sync 範圍亦排除)
        - 兩段式 commit 紀律同 W-WEBUI / TS-Typing-Sync
    (c) 048 sprint d521c819 + b4453385 retrospective 認定為
        TS-DepGraph-Hygiene 軌道之 047.5 retro-member

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md 軌道辨識條目 2 → 3 軌道
  - ✅ docs/INTEGRATION-DESIGN-W-BASE-WEB.md 新 unified doc
  - ✅ docs/INTEGRATION-DESIGN-W-WEBUI.md → git mv → BASE-WEB.md
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md → git rm
  - ✅ docs/INTEGRATION-CHECKLIST.md 048-N1 follow-up update / 049 entry
  - ✅ CLAUDE.md §1 / §7 索引 update

Follow-up TODOs: 無
```

## Project Structure

### Documentation (this feature)

```text
specs/049-base-web-dep-hygiene/
├── spec.md                # /speckit-specify 產出（無 NEEDS CLARIFICATION、checklist 16/16 PASS）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：audit methodology + DESIGN content mapping + Constitution amendment 內容 + plan-template/CLAUDE.md wording + expansion candidates
├── data-model.md          # Phase 1：Part A 改動全 diff（Constitution + DESIGN merge + plan-template + CLAUDE）+ Part B 改動全 diff（package.json + pnpm-workspace + .npmrc + Dockerfile + sub-packages + unocss.ts）+ INTEGRATION-CHECKLIST cleanup
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V10 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（7 Phase 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**內** TS-DepGraph-Hygiene + 跨 rev1 整合層（amendment + DESIGN merge）：

```text
base-web/                                                # worktree、單 commit
├── Dockerfile                                           # remove ARG PNPM_VERSION + corepack prepare、keep corepack enable
├── package.json                                         # 加 packageManager: "pnpm@11.0.8" + 加 explicit devDeps
├── pnpm-workspace.yaml                                  # remove nodeLinker: hoisted
├── .npmrc                                               # remove shamefully-hoist=true（vestige）
├── build/plugins/
│   └── unocss.ts                                        # +1 line type 註解 (line 24 implicit any fix)
└── packages/uno-preset/
    └── package.json                                     # 加 @unocss/core + @unocss/preset-mini 為 devDeps
    # 其他 packages/<sub>/package.json 若 audit 發現需加

outer/                                                   # rev1-admin-root、多段 commit per logical
├── .specify/
│   ├── memory/constitution.md                          # v1.5.0 → v1.6.0 bump (FR-001)
│   └── templates/plan-template.md                      # 3-軌道辨識 wording update (FR-003)
├── docs/
│   ├── INTEGRATION-DESIGN-W-WEBUI.md → git mv          # → INTEGRATION-DESIGN-W-BASE-WEB.md (FR-002)
│   ├── INTEGRATION-DESIGN-W-BASE-WEB.md (新 unified)   # 重構為 4 § 結構 (FR-002)
│   ├── INTEGRATION-DESIGN-W-TYPING-ALIGN.md → git rm   # 內容 merged 進 BASE-WEB §3 (FR-002)
│   └── INTEGRATION-CHECKLIST.md                        # 048-N1 row update + 049 entry + Current Focus (FR-011)
└── CLAUDE.md                                            # §1/§7 索引 update + SPECKIT marker (FR-003 / FR-011)
```

**Structure Decision**：
- **base-web worktree commits**：1 個（Part B 整體：dep 提升 + config cleanup + Dockerfile 簡化 + implicit any fix、sequential edit 同 commit、不拆）
- **outer rev1-admin-root commits**：4 個（Phase 0 amendment + DESIGN merge + plan-template + CLAUDE / base-web SHA pin / INTEGRATION-CHECKLIST + SPECKIT marker / SHA backfill post-merge）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**base-web worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| Part B 整體（dep 提升 + config cleanup + Dockerfile 簡化 + implicit any fix） | 1 commit | `Dockerfile` + `package.json` + `pnpm-workspace.yaml` + `.npmrc` + `packages/uno-preset/package.json`（及其他 sub-package 若 audit 發現） + `build/plugins/unocss.ts` |

**Outer rev1-admin-root commits（estimated 4 個）**：

| Topic | est | files |
|---|---|---|
| **Phase 0** Constitution v1.5.0→v1.6.0 amendment + DESIGN-W-WEBUI.md → DESIGN-W-BASE-WEB.md rename + restructure + TS-Typing-Sync content merge + DESIGN-W-TYPING-ALIGN.md 刪除 + plan-template + CLAUDE.md §1/§7 | 1 commit | `.specify/memory/constitution.md` + `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`（新、from rename）+ `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 刪除 + `.specify/templates/plan-template.md` + `CLAUDE.md` |
| base-web SHA pin bump | 1 commit | gitlink `base-web` |
| INTEGRATION-CHECKLIST 049 entry + Current Focus update + 048-N1 row 處理 + CLAUDE.md SPECKIT marker idle | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| SHA backfill（post-merge） | 1 commit | `docs/INTEGRATION-CHECKLIST.md` 049 entry placeholder（+ DESIGN-W-BASE-WEB.md §4.1 049 sprint commit SHA placeholder） |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：comprehensive audit grep methodology + expected phantom list（per 048 baseline 15 error + comprehensive grep base-web/{src/, build/, packages/*/src/}）
- **R-2**：DESIGN-W-WEBUI.md content extraction → §2 mapping（255 line 原內容如何映射進新 §2.1-§2.5）
- **R-3**：DESIGN-W-TYPING-ALIGN.md content extraction → §3 mapping（116 line 原內容如何映射進新 §3.1-§3.6）
- **R-4**：Constitution v1.5.0 → v1.6.0 amendment 完整 diff 設計（IV. base 不改動邊界 第 3 軌道 + unified doc 結構）
- **R-5**：DESIGN-W-BASE-WEB.md §1 軌道總覽 wording（new）
- **R-6**：DESIGN-W-BASE-WEB.md §4 TS-DepGraph-Hygiene wording（new、含 049 首發 + 048 d521c819/b4453385 retrospective）
- **R-7**：plan-template 3-軌道辨識條目 wording（2 軌道 → 3 軌道）
- **R-8**：CLAUDE.md §1/§7 索引 update wording
- **R-9**：implementer-stage expansion 候選（per FR-012 ≤3）

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：Part A 改動全 diff + Part B 改動全 diff + INTEGRATION-CHECKLIST cleanup
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V10 acceptance commands
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（7 Phase 落地步驟）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation；v1.6.0 amendment Phase 0 落地後 IV. PASS）
- contracts/verification-commands.md 引入 10 個 C-V、全為 acceptance 驗證手段、不引入新 functional path
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律 + SDD「先合法化、再執行」順序）
- INTEGRATION-CHECKLIST cleanup（FR-011）為 plan 內已界定的後續、無爭議
- DESIGN-W-BASE-WEB.md 為新軌道權威 unified doc、與 Constitution v1.6.0 amendment 同步

**Constitution Check post-Phase 1（v1.6.0）：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。Constitution amendment 本身為 spec FR-009 明文 sprint 動作、非 Principle violation。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 25-30 tasks：
- Phase 0 (Constitution v1.6.0 + DESIGN-W-BASE-WEB merge + plan-template + CLAUDE) — 6-8 tasks
- Phase 1 (base-web Part B impl) — 8-10 tasks
- Phase 2 (acceptance C-V1~C-V10 + 本機 build verify + docker rebuild + CDP smoke + boundary verify) — 8-10 tasks
- Phase 3 (outer commits + merge + push + SHA backfill + final acceptance) — 4-6 tasks

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
