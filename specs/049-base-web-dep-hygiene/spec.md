# Feature Specification: 049 base-web-dep-hygiene-and-track-restructure

**Feature Branch**: `049-base-web-dep-hygiene`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "049 base-web-dep-hygiene-and-track-restructure — 詳見 brainstorm doc `docs/superpowers/049-feature-base-web-dep-hygiene.md`（已 commit `994279d`、含 6 section user-approved + 2 Part bundled scope + Constitution v1.5.0→v1.6.0 amendment + DESIGN-W-BASE-WEB.md unified doc + base-web dep hygiene (audit + strict isolation + packageManager pin + Dockerfile 簡化) + C-V1~C-V10 acceptance + ~5-6hr 落地預估）。Sprint goal: 完全結案 048-N1 follow-up (a)+(b)+(c)、軌道 governance 從 3 doc 收成 1 unified doc、base-web build/dep config 對齊 pnpm 11 best practice。"

**前置文件**：
- [`docs/superpowers/049-feature-base-web-dep-hygiene.md`](../../docs/superpowers/049-feature-base-web-dep-hygiene.md)（brainstorm 設計、6 section 已 user-approved、commit `994279d`）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)（v1.5.0 → v1.6.0 將同步 bump、為本 sprint 合法化前提）
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md)（048-N1 follow-up 來源）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Maintainer 開 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 看到 base-web 改動 3 條受管例外軌道集中於單一 unified doc（Priority: P1）🎯 MVP

維護 rev1 整合的 maintainer / AI implementer / code reviewer 開 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 應看到單一 umbrella doc、含 §1 軌道總覽 + §2 W-WEBUI 軌道 + §3 TS-Typing-Sync 軌道 + §4 TS-DepGraph-Hygiene 軌道（新）四 § 章節；`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 不存在（內容 merged）；Constitution v1.6.0 在 §IV 段落明示 3 條受管例外軌道、權威 doc 統一指向 BASE-WEB.md；plan-template Constitution Check 段含 3-軌道辨識條目；CLAUDE.md §7 索引 update 為新 unified doc。

**Why this priority**：DESIGN doc 結構是 base-web 改動 governance 的唯一 source of truth、結構錯位（doc proliferation / cross-ref churn）會直接影響未來軌道辨識與 spec compliance review；本 US 為「結構合法化」、是 Part B 實際 base-web 改動的 prerequisite（per SDD「先合法化、再執行」紀律、同 048 體例）。MVP-worthy 因為 governance restructure 本身有獨立 verification value（grep DESIGN-W-BASE-WEB.md 6 區段 + Constitution v1.6.0 bump + plan-template 3-軌道）。

**Independent Test**：grep `^## §[1-4]` 命中 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥4 次（§1 總覽 + §2 W-WEBUI + §3 TS-Typing-Sync + §4 TS-DepGraph-Hygiene）+ `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 不存在 + grep `1\.6\.0` `.specify/memory/constitution.md` ≥1 hit + grep `TS-DepGraph-Hygiene` `.specify/templates/plan-template.md` ≥1 hit + grep `INTEGRATION-DESIGN-W-BASE-WEB` CLAUDE.md ≥1 hit。

**Acceptance Scenarios**：

1. **Given** Phase 0 Constitution v1.5.0 → v1.6.0 amendment 完成；**When** grep `^## §IV` + 「TS-DepGraph-Hygiene」段落 + 「INTEGRATION-DESIGN-W-BASE-WEB.md」reference；**Then** 3 條軌道並列段落命中、Rationale 段更新含 3 軌道描述、Version footer 為 `1.6.0`。
2. **Given** `git mv docs/INTEGRATION-DESIGN-W-WEBUI.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 完成、內容重構為 4 §、TS-Typing-Sync 內容 merged 進 §3、`git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 完成；**When** 打開新 unified doc；**Then** §1 軌道總覽 + §2-§4 三軌道各 § 命中、原 W-WEBUI §5/§7 14 W-FW 子項保留進 §2.4、原 TS-Typing-Sync §1-§6 內容映射進 §3.1-§3.6、git log 顯示 W-WEBUI.md history 連續至新 BASE-WEB.md（git mv 保留）。
3. **Given** plan-template 軌道辨識條目 update 為 3 軌道（v1.5.0 的 2 軌道 → v1.6.0 的 3 軌道）+ CLAUDE.md §1/§7 索引 update remove TYPING-ALIGN ref + 加 BASE-WEB ref；**When** future feature 開 spec-kit 流程；**Then** Constitution Check 段提示 3-軌道辨識（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene / 軌道外）。

---

### User Story 2 — Developer 跑 `pnpm install --frozen-lockfile` 在 strict isolation mode 下 typecheck + build 雙 PASS（無 phantom dep）（Priority: P1）

維護 base-web 的 frontend developer / AI implementer / docker build pipeline 在 `pnpm-workspace.yaml` 移除 `nodeLinker: hoisted`、回 pnpm 預設 strict isolation 後、所有 transitive dep 用法都應改由 explicit devDeps 宣告涵蓋、`vue-tsc --noEmit --skipLibCheck` 0 error、`vite build --mode prod` dist/ 產出成功、docker rebuild 後 container healthy。host + container pnpm version 由 `base-web/package.json` `packageManager` field 提供唯一 pin、Dockerfile `ARG PNPM_VERSION` + `corepack prepare` 移除、改吃 packageManager field。

**Why this priority**：base-web dep hygiene 是 048-N1 (a)+(b)+(c) 三項實質結案動作；當前 `nodeLinker: hoisted` 讓 phantom dep（如 `@iconify/utils`/`@unocss/core`/`axios`/etc. 未明文宣告為 devDeps 但被 import）能 work、未來 pnpm 升級或 dep tree 重排可能 break；移除 hoisted + explicit devDeps + packageManager pin 為 pnpm 11+ best practice。MVP-worthy 因為「strict isolation 下 typecheck/build 雙 PASS」是 verifiable evidence、且 audit 完整性可以 grep 確認（無 phantom import 殘留）。

**Independent Test**：在 base-web worktree 跑 `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm typecheck` + `vite build --mode prod` 三 PASS（0 TS error、dist 產出含 index.html + assets/）；docker rebuild base-web image PASS、container `Up (healthy)`；grep `nodeLinker: hoisted` `base-web/pnpm-workspace.yaml` 0 hit、grep `shamefully-hoist=true` `base-web/.npmrc` 0 hit、grep `"packageManager".*"pnpm@` `base-web/package.json` ≥1 hit、grep `ARG PNPM_VERSION` `base-web/Dockerfile` 0 hit、grep `corepack prepare` `base-web/Dockerfile` 0 hit。

**Acceptance Scenarios**：

1. **Given** comprehensive grep audit 完成、所有 phantom transitive imports 提升為直接 devDeps（base-web/package.json + packages/uno-preset/package.json 等對應位置）；**When** 跑 `pnpm install --frozen-lockfile --ignore-scripts`；**Then** 0 missing dep warning、lockfile 仍 frozen-able。
2. **Given** `nodeLinker: hoisted` 從 pnpm-workspace.yaml 移除 + `shamefully-hoist=true` 從 .npmrc 移除（vestige）；**When** 跑 `pnpm install --ignore-scripts` 重建 node_modules + `pnpm typecheck` + `vite build --mode prod`；**Then** typecheck 0 error、build 成功、dist 產出含 index.html + assets/；無 phantom dep 抓不到 module 的 error。
3. **Given** `"packageManager": "pnpm@11.0.8"` 加進 base-web/package.json + Dockerfile remove `ARG PNPM_VERSION` + `corepack prepare`、保留 `corepack enable`；**When** docker rebuild base-web image + 容器 restart；**Then** docker build 成功（pnpm 版本由 packageManager field 提供）、container `Up (healthy)`、SPA HTTP 200 OK。
4. **Given** US2 base-web 改動完成 + reuse 048 cdp-smoke.js 8 路徑 driver；**When** 跑 `node specs/048-base-typings-sync/contracts/cdp-smoke.js`；**Then** 8/8 PASS、無 console error（runtime 不退化）。

---

### Edge Cases

- **packageManager field 格式**：用 `"packageManager": "pnpm@11.0.8"` 無 sha512 hash（corepack 接受、newer corepack 可能 warn 但不 fatal）；若 future corepack 強制 hash、再補（屬 048-N1 (d) trigger 觸發場景）。
- **`.npmrc` 部分保留**：移除 `shamefully-hoist=true`（vestige、pnpm 11 不讀）；**保留** `registry=https://registry.npmmirror.com/`（中國境內 mirror、運維選擇）+ `ignore-workspace-root-check=true` + `link-workspace-packages=true`（pnpm workspace 行為、與 hoist 無關）。
- **隱藏 baseline error #2**：`build/plugins/unocss.ts(24,65)` 為 `Parameter 'svg' implicitly has an 'any' type`、非 module not found；屬同檔 audit 範圍、+1 line type 註解（`(svg: string) => ...`）順道修、不算 scope creep。
- **workspace sub-package package.json 修改**：`packages/uno-preset/package.json` 加 `@unocss/core` + `@unocss/preset-mini` 為 devDeps；屬 TS-DepGraph-Hygiene 軌道可動範圍、C-V8 boundary verify 須明示「sub-package package.json 可動、src/ 0 diff」。
- **Dockerfile pnpm BuildKit cache 影響**：`RUN corepack enable` 比 `RUN corepack enable && corepack prepare` 簡單；corepack enable 後 first `pnpm` invocation triggers download from `packageManager` field；BuildKit layer cache 可能 miss 1 次（first build 後 cache）。
- **Constitution v1.5→v1.6 churn 風險**：v1.5.0 落地 1 day（2026-05-25）後即 v1.6.0 retro-restructure；amendment commit message 須明示「原 v1.5.0 兩 doc 結構過早 commit 為主因、未預見第 3 軌道立即接踵」rationale、避未來 reviewer 誤判 churn-by-design。
- **audit 漏抓某 transitive**：步驟 4 移 `nodeLinker: hoisted` 後若 audit 漏抓某 transitive、build 會撞同 048 baseline error；mitigation：comprehensive grep + 步驟 sequence + 撞即停補 dep + implementer-stage scope expansion ≤3 budget。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`.specify/memory/constitution.md` MUST 從 v1.5.0 升至 v1.6.0、§IV 段落改寫為 3 條受管例外軌道（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 新增）、權威 doc 統一指向 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`、Version footer line update 為 `1.6.0`。
- **FR-002**：`docs/INTEGRATION-DESIGN-W-WEBUI.md` MUST 透過 `git mv` rename 至 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`（保留 git history）、新 doc 重構為 4 § 結構（§1 軌道總覽 + §2 W-WEBUI + §3 TS-Typing-Sync + §4 TS-DepGraph-Hygiene）；原 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 內容 merged 進 §3 後 MUST 用 `git rm` 刪除（git history 切斷但內容保留進新 doc）。
- **FR-003**：`.specify/templates/plan-template.md` Constitution Check 段軌道辨識條目 MUST update 為 3-軌道辨識（v1.5.0 的 2 軌道 W-WEBUI / TS-Typing-Sync 加上 TS-DepGraph-Hygiene 第 3 軌道、共 3 軌道 + 軌道外）；`CLAUDE.md` §1（軌道辨識義務）+ §7（整合設計文件索引）MUST update remove DESIGN-W-WEBUI / DESIGN-W-TYPING-ALIGN refs、加 DESIGN-W-BASE-WEB ref。
- **FR-004**：`base-web/pnpm-workspace.yaml` MUST 移除 `nodeLinker: hoisted` 行（回 pnpm 預設 strict isolation）；`base-web/.npmrc` MUST 移除 `shamefully-hoist=true` 行（pnpm 11 不讀、vestige）；**保留** `.npmrc` 內 `registry=` + `ignore-workspace-root-check=true` + `link-workspace-packages=true`。
- **FR-005**：`base-web/package.json` MUST 新增 `"packageManager": "pnpm@11.0.8"` 頂層 field；`base-web/Dockerfile` MUST 移除 `ARG PNPM_VERSION=11.0.8` + `RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate` 兩處宣告、改為 `RUN corepack enable`（pnpm 版本由 package.json packageManager field 自動提供）。
- **FR-006**：comprehensive audit grep MUST 涵蓋 base-web/{src/, build/, packages/*/src/} 所有 `import .* from '<pkg>'` statements、提取 phantom transitive use（即 import 來源未在對應 package.json deps/devDeps/peerDeps 宣告者）、提升為直接 devDeps 加進對應 package.json（base-web/ 或 packages/<sub>/、依 import 來源 file 所在 package 決定）；版本 pin 用 `pnpm-lock.yaml` 既有 resolved version（不改 lock）。
- **FR-007**：`build/plugins/unocss.ts(24)` implicit any error 順道修（`(svg) => ...` → `(svg: string) => ...`、+1 line type 註解）；本 fix 屬同檔 audit 範圍、不算 scope creep。
- **FR-008**：本 sprint MUST 0 rust-api 改動、0 schema migration、0 新 application entity、0 新 redis channel、0 新 metric pre-declare、0 新 rust-api endpoint、0 base-web `src/` diff（軌道紀律 boundary）；唯一改動 base-web 限：`Dockerfile` / `package.json` / `pnpm-workspace.yaml` / `.npmrc` / `packages/uno-preset/package.json`（及其他 sub-package package.json、若 audit 發現需加）/ `build/plugins/unocss.ts`（implicit any fix）。
- **FR-009**：本 sprint Phase 0 MUST 先完成 Constitution v1.5.0 → v1.6.0 amendment + DESIGN-W-WEBUI.md → DESIGN-W-BASE-WEB.md rename + restructure + TS-Typing-Sync content merge + DESIGN-W-TYPING-ALIGN.md 刪除 + plan-template 3-軌道辨識條目 + CLAUDE.md §1/§7 索引、**之後**才能進 Phase 1 base-web 改動（SDD「先合法化、再執行」紀律；順序顛倒違反 v1.5.0 既有 constitution）。
- **FR-010**：base-web image rebuild 後、dev stack 12 service 全部 healthy + rust-api drainer 跑著；front-nginx 取 base-web 新 image；CDP browser smoke 8 路徑（reuse 048 cdp-smoke.js）全 PASS、無 console error（runtime 不退化）。
- **FR-011**：本 sprint 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST：(a) 048-N1 衍生 follow-up row 從 table 移除（或標記「已結案 (a)+(b)+(c)、(d) trigger-driven 留」、保留歷史脈絡）；(b) 已完成里程碑加 049 entry；(c) Current Focus「現狀」加 049 + 「下一步」改為條件觸發 follow-up backlog active items（042-N4 / 042-N5 / 048-N1 (d) 各自獨立、trigger driven；含 048-N1 (d) 因 (a)(b)(c) 結案但 (d) 仍待 pnpm 升級觸發）；(d) CLAUDE.md SPECKIT marker idle。
- **FR-012**：implementer-stage expansion 拾取上限 MUST ≤ 3 處（per 041 / 043 / 046 / 047 / 048 體例）；候選由 Phase 0 research grep 後拍板；超限拒絕並登記 049+ follow-up。

### Key Entities

本 sprint 為 base-web build/dep config hygiene + Constitution governance restructure、**無 application data entity**（不動 DB schema、不動 rust wire DTO、不動 base-web src/ 任何 runtime entity）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、12 service（5 既有 + 7 observability）全 healthy state；rust-api 啟動 + drainer 跑著（接 048 baseline、不退化）。
- **SC-002**：base-web worktree 跑 `pnpm install --frozen-lockfile --ignore-scripts` PASS（lockfile 仍 frozen-able、無 dep 衝突）+ `pnpm typecheck`（vue-tsc）0 TS error + `vite build --mode prod` dist/ 產出成功（含 index.html + assets/）。
- **SC-003**：dev stack 跑著 + base-web image rebuild 後、container `Up (healthy)` + SPA HTTP 200 OK + CDP browser smoke 8 路徑（reuse 048 cdp-smoke.js）全 PASS、無 runtime / console error。
- **SC-004**：grep audit verification 全 PASS — `nodeLinker: hoisted` 在 `base-web/pnpm-workspace.yaml` 0 hit + `shamefully-hoist=true` 在 `base-web/.npmrc` 0 hit + `"packageManager".*"pnpm@` 在 `base-web/package.json` ≥1 hit + `ARG PNPM_VERSION` 在 `base-web/Dockerfile` 0 hit + `corepack prepare` 在 `base-web/Dockerfile` 0 hit + 048 baseline 15 error 在 `pnpm typecheck` 0 hit（含 implicit any error #2 已修）。
- **SC-005**：軌道紀律 boundary verify 全 PASS — `git diff` 顯示 base-web 改動限：`Dockerfile` / `package.json` / `pnpm-workspace.yaml` / `.npmrc` / `packages/uno-preset/package.json`（及其他 sub-package package.json、若 audit 發現需加）/ `build/plugins/unocss.ts`；`git diff base-web/src/` 0 line；`git diff rust-api/` 0 line。
- **SC-006**：Constitution v1.5.0 → v1.6.0 bump 落地 + `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 4 § 結構完整（§1-§4 命中）+ `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 不存在 + `docs/INTEGRATION-DESIGN-W-WEBUI.md` 不存在（rename 至 BASE-WEB）+ `.specify/templates/plan-template.md` 3-軌道辨識 wording 加入 + `CLAUDE.md` §7 索引 update；grep `1\.6\.0` `.specify/memory/constitution.md` ≥1 hit + grep `^## §[1-4]` `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥4 hit + grep `TS-DepGraph-Hygiene` `.specify/templates/plan-template.md` ≥1 hit。
- **SC-007**：完成後 `docs/INTEGRATION-CHECKLIST.md` 048-N1 衍生 follow-up row 從 table 移除（或標記「已結案 (a)+(b)+(c)、(d) trigger-driven 留」格式）+ 049 entry 加進已完成里程碑 + Current Focus 「下一步」update（條件觸發 active items 042-N4 / 042-N5 / 048-N1 (d) 各自獨立）+ CLAUDE.md SPECKIT marker idle。
- **SC-008**：048-N1 follow-up (a)（hoist 策略 review）+ (b)（explicit devDep declarations）+ (c)（packageManager pin）三項全部結案；只剩 (d)（下次 pnpm 升級重新檢視）仍 trigger-driven 留 backlog。

## Assumptions

- **dev stack 健康** — 12 service healthy（5 既有 + 7 observability、044 已落地、046/047/048 維持）+ rust-api drainer 跑著（baseline 接 048 commit `f2e2177` merge 後狀態）。
- **base-web worktree baseline** — `rev1-admin-base-web` 分支 HEAD = `b4453385`（048 + env-repair adjacent commits 落地後狀態）；Phase 0 驗 `cd base-web && git rev-parse rev1-admin-base-web` 為此 SHA、未退化。
- **Constitution amendment 不需 user 額外 ratify** — 沿用 v1.2.0/v1.3.0/v1.4.0/v1.5.0 自我 amend 慣例（spec-driven 設計鏈內處理）；amendment 本身為 SDD 起點、user 透過 brainstorm 6 section 已拍板（含 hoist 策略 / 軌道命名 / merge structure / package.json packageManager pin）。
- **pnpm-lock.yaml 版本相容** — `pnpm-lock.yaml` lockfileVersion 為 `9.0`、與 pnpm 9.x / 10.x / 11.x 全部相容；本 sprint 不動 lockfile（純加 deps、version pin 用 lockfile 既有 resolved version）。
- **comprehensive audit grep 預期 phantom 數量** — 預估 5-10 個 transitive 提升為 devDeps（per 048 baseline 15 error 推估：`@iconify/utils` / `@unocss/core` / `@unocss/preset-mini` / `axios` 4 個必加、其他 0-5 個 audit 後確認）；超 10 個視為「audit 發現大量 phantom」、可能觸發 implementer-stage scope expansion ≤3 budget。
- **CDP `:9229` Edge debug port 開著** — per 037/038/040/048 體例已驗證；若關著 sprint 啟動時 launch 開（`msedge --remote-debugging-port=9229`）。
- **048 cdp-smoke.js reuse** — `specs/048-base-typings-sync/contracts/cdp-smoke.js` 已存在且 8/8 PASS、本 sprint 直接 reuse（不重寫）；若 reuse 撞奇怪 error 視為 base-web runtime regression、屬 049 acceptance 失敗。
- **implementer-stage expansion budget ≤3** — per 041 / 043 / 046 / 047 / 048 體例；候選由 Phase 0 research grep 後拍板（如：(a) audit 漏抓 transitive 需補加 / (b) `packages/<sub>/package.json` 其他 sub-package 也需動 / (c) `.npmrc` 其他 vestige line cleanup）。
- **`git mv` 保留 history** — `git mv docs/INTEGRATION-DESIGN-W-WEBUI.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 後、`git log --follow docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 應顯示原 W-WEBUI 完整 commit history；`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 內容 merged 後 `git rm` 刪除、history 切斷但內容保留進新 doc §3。
- **軌道首次行使 v1.6.0 amendment 設計** — TS-DepGraph-Hygiene 為第 3 條受管例外軌道、limited 於 base-web build/dep config；未來若第 2 次 sprint 撞「明明 dep hygiene 但軌道範圍不夠」邊界、登 v1.6.x extension（非本 sprint scope）。
