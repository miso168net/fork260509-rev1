---
description: "Task list for 049 base-web-dep-hygiene-and-track-restructure"
---

# Tasks: 049 base-web-dep-hygiene-and-track-restructure

**Input**: Design documents from `/specs/049-base-web-dep-hygiene/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 sprint 為 build/dep config hygiene + governance restructure feature、無新純函式邏輯、**無新 unit test**（per spec FR-006/FR-007 紀律 + 048 體例：wiring/shape 對映類 feature 無新單元測試時、由 acceptance C-V 系列 cover；本 sprint acceptance via `pnpm install` + `pnpm typecheck` + `vite build` + docker rebuild + CDP browser smoke 8 路徑 reuse 048）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。

**Organization**：依 spec.md 2 user story（US1 = P1 governance restructure / US2 = P1 base-web dep hygiene）+ Setup（baseline check）+ Polish 分 phase；US1 + US2 同 spec 但**不同 commit**（US1 落 outer commit 1、US2 落 base-web worktree commit 1）；Phase 2 Foundational skipped。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：US1 同檔（同個 outer commit）`docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 在多 task 內被多次 edit（§1 / §2 mapping / §3 merge / §4 加）為 sequential、不可並行；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。

**SDD「先合法化、再執行」紀律**（per spec FR-009）：T001~T008 為 Phase 0 prerequisite（governance restructure 整套）、必須**先**完成才能進 Phase 4 US2（base-web dep hygiene 改動需 Constitution v1.6.0 + DESIGN-W-BASE-WEB.md §4 軌道權威就位才合法）。

---

## Phase 1: Setup (Baseline verification)

**Purpose**：確認 dev stack baseline 健康、為 sprint 後續 verify 提供基準。

- [ ] T001 確認 dev stack baseline 健康：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`、`$PC ps --format "table {{.Service}}\t{{.Status}}"`、expect 12 service Up（9 healthy + 3 by-design no-hc）+ rust-api drainer log 跑著。對應 SC-001、per [contracts C-V1](./contracts/verification-commands.md)。

**Checkpoint**：baseline confirmed、可進入 Phase 3 US1 governance restructure。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 sprint 2 user story 為跨 commit boundary 設計（US1 outer commit 1 / US2 base-web worktree commit）、無跨 story 共用 foundational 設施（governance restructure 與 base-web dep hygiene 為兩個獨立子系統的工作）。Phase 2 跳過。

*(no tasks)*

---

## Phase 3: User Story 1 — 軌道 governance restructure（Priority: P1）🎯 MVP

**Goal**：Constitution v1.5.0 → v1.6.0 amendment + DESIGN-W-W-WEBUI.md → DESIGN-W-BASE-WEB.md `git mv` rename + restructure 為 4 § umbrella + TS-Typing-Sync content merge + DESIGN-W-TYPING-ALIGN.md 刪除 + plan-template 3-軌道辨識 + CLAUDE.md §1/§7 索引 unified；maintainer 開新 DESIGN-W-BASE-WEB.md 看到 3 條受管例外軌道集中於 unified doc。

**Independent Test**：grep `^## §[1-4] ` 命中 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥4 次（§1 總覽 + §2 W-WEBUI + §3 TS-Typing-Sync + §4 TS-DepGraph-Hygiene）+ `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 不存在 + grep `1\.6\.0` `.specify/memory/constitution.md` ≥1 hit + grep `TS-DepGraph-Hygiene` `.specify/templates/plan-template.md` ≥1 hit + grep `INTEGRATION-DESIGN-W-BASE-WEB` CLAUDE.md ≥1 hit。

### Implementation for User Story 1

- [ ] T002 [US1] 改 `.specify/memory/constitution.md` v1.5.0 → v1.6.0 amendment：替換檔頭 Sync Impact Report block（v1.5 → v1.6、~30 line）+ §IV 主體段落改寫為 3 軌道並列（W-WEBUI 段保留 + TS-Typing-Sync 段保留 + 新加 TS-DepGraph-Hygiene 段 + Rationale 改 unified、~30 line）+ Version footer 1.5.0→1.6.0（1 line）。per [data-model §E1.1](./data-model.md) + [research R-4](./research.md)。對應 FR-001。
- [ ] T003 [US1] `git mv docs/INTEGRATION-DESIGN-W-WEBUI.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md`：保留 git history、原 W-WEBUI.md 內容變新 BASE-WEB.md（之後 T004-T006 重構為 4 § umbrella）。per [data-model §E1.2 Step 1](./data-model.md) + [research R-2](./research.md)。對應 FR-002。Depends on T002（concurrent edit 同 commit、但本 task 純 git mv、檔內容暫不動）。
- [ ] T004 [US1] 重構 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 為 4 § umbrella：(a) 加 §1 軌道總覽（新 meta-section、含 table + 三節 sub-§、per [research R-5](./research.md)、~50 line）;(b) 把原 W-WEBUI.md 既有內容（從 §1-§7）整體 mapping 成 §2.1-§2.5（per [research R-2](./research.md)、wording 1:1 搬移、只改 § numbering、§5/§7 14 W-FW 子項保留進 §2.4）;(c) 預留 §3 + §4 空位（後續 T005 + T006 填）。per [data-model §E1.2 Step 2-3](./data-model.md)。對應 FR-002。Depends on T003（same file sequential）。
- [ ] T005 [US1] 把 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 內容 merge 進 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §3`：wording 1:1 搬移（§1→§3.1 / §2→§3.2 / §3→§3.3 / §4→§3.4 / §5→§3.5 / §6→§3.6）、§3.5「與其他軌道邊界」wording 改為 unified context（與 §2 + §4 三軌道互斥不重疊、ref to §1.1 三軌道總覽）。per [data-model §E1.2 Step 4](./data-model.md) + [research R-3](./research.md)。對應 FR-002。Depends on T004（same file sequential）。
- [ ] T006 [US1] 新加 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4` TS-DepGraph-Hygiene 軌道全段：與 §2/§3 同構（§4.1 軌道定位 / §4.2 可動範圍 / §4.3 動機限定 / §4.4 軌道成員 含 §4.4.1 048 d521c819+b4453385 retro 及 §4.4.2 049 sprint placeholder / §4.5 與其他軌道邊界 / §4.6 預期 sprint 模式、~120 line）。per [data-model §E1.2 Step 5 + research R-6](./research.md)。對應 FR-002。Depends on T005（same file sequential）。
- [ ] T007 [US1] `git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`：內容已 merged 進新 BASE-WEB.md §3、執行 `git rm`（git history 切斷但內容保留）。per [data-model §E1.2 Step 6](./data-model.md)。對應 FR-002。Depends on T005（必須先 merge 才 rm、避免內容遺失）。
- [ ] T008 [US1] 改 `.specify/templates/plan-template.md` 軌道辨識條目：從現有 2 軌道（W-WEBUI / TS-Typing-Sync）改為 4 選一（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene / 軌道外）、doc reference 統一指向 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §2/§3/§4`。per [data-model §E1.3](./data-model.md) + [research R-7](./research.md)。對應 FR-003。Depends on T002（Constitution v1.6.0 必先、template wording 提及 v1.6.0+）。
- [ ] T009 [US1] 改 `CLAUDE.md`：§1 footnote update 為 3 軌道 wording + doc reference unified 指向 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`；§7 整合設計文件索引 remove `DESIGN-W-WEBUI` + `DESIGN-W-TYPING-ALIGN` ref、加 `DESIGN-W-BASE-WEB unified` ref。per [data-model §E1.4](./data-model.md) + [research R-8](./research.md)。對應 FR-003。Depends on T007（TYPING-ALIGN.md 必須先 rm 才能 remove 索引 ref；理論上 plan-template T008 之後也可同 T009）。
- [ ] T010 [US1] outer commit 1（Phase 0 整體 amendment + DESIGN merge + plan-template + CLAUDE 索引）：`git add .specify/memory/constitution.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md .specify/templates/plan-template.md CLAUDE.md && git commit`。commit message 對齊 [quickstart Step 1.9](./quickstart.md) 範本。Depends on T002 + T003 + T004 + T005 + T006 + T007 + T008 + T009。對應 [CLAUDE.md §4.1](../../CLAUDE.md) 外層專屬檔 commit 紀律。

**Checkpoint**：US1 完成 —— Constitution v1.6.0 amendment + DESIGN-W-BASE-WEB.md 4 § unified doc + plan-template 3-軌道辨識 + CLAUDE.md unified 索引；軌道 governance restructure 落地、SDD「先合法化、再執行」紀律滿足、Phase 4 US2 base-web 改動現可合法進行。**MVP 達成**（governance restructure 為 verifiable evidence）。

---

## Phase 4: User Story 2 — base-web dep hygiene impl（Priority: P1）

**Goal**：comprehensive audit grep base-web + packages 所有 import → 找出 phantom transitive use → 提升為直接 devDeps（base-web/package.json + packages/uno-preset/package.json 及其他 audit 發現位置）+ 移除 `nodeLinker: hoisted` from pnpm-workspace.yaml + 移除 `shamefully-hoist=true` from .npmrc（vestige）+ 加 `"packageManager": "pnpm@11.0.8"` 進 base-web/package.json + Dockerfile 簡化（remove `ARG PNPM_VERSION` + `corepack prepare`、改吃 packageManager field、keep `corepack enable`）+ 順道修 `build/plugins/unocss.ts:24` implicit any。

**Independent Test**：在 base-web worktree 跑 `pnpm install --frozen-lockfile --ignore-scripts` + `pnpm typecheck` + `vite build --mode prod` 三 PASS（0 TS error、dist 產出）+ grep `nodeLinker: hoisted` `base-web/pnpm-workspace.yaml` 0 hit + grep `shamefully-hoist=true` `base-web/.npmrc` 0 hit + grep `"packageManager".*"pnpm@` `base-web/package.json` ≥1 hit + grep `ARG PNPM_VERSION` `base-web/Dockerfile` 0 hit + grep `corepack prepare` `base-web/Dockerfile` 0 hit。

### Implementation for User Story 2

- [ ] T011 [US2] 在 `base-web/` 跑 comprehensive audit grep（per [quickstart Step 2.1](./quickstart.md)）：3-step audit pipeline（import sources 提取 → declared deps 提取 → diff = phantom transitive list 到 `/tmp/049-phantom.txt`）。expect 4-10 phantom（per [research R-1.2](./research.md)）；如超 10 個觸發 [R-9.1 (a)](./research.md) expansion candidate（user 拍板）。對應 FR-006。Depends on T010（Phase 0 完成、可合法進 base-web）。
- [ ] T012 [P] [US2] 改 `base-web/package.json`：加 top-level `"packageManager": "pnpm@11.0.8"` field（per FR-005）+ 加 explicit devDeps（per audit 結果、至少 `@iconify/utils`、`axios`、及 audit 發現項；版本 pin **exact**、用 `pnpm-lock.yaml` resolved version、per codebase convention）。per [data-model §E2.3](./data-model.md) + [research R-1.2](./research.md)。對應 FR-005 + FR-006。Depends on T011（audit 結果決定加哪些 devDeps）。
- [ ] T013 [P] [US2] 改 `base-web/packages/uno-preset/package.json`：加 `@unocss/core` + `@unocss/preset-mini` 為 devDeps（per audit、版本 pin exact）。per [data-model §E2.4](./data-model.md)。對應 FR-006。Depends on T011。若 audit 發現其他 sub-package 也需動（per [R-9.2 (b)](./research.md) expansion）、user 拍板後拾取（同 task / 額外 task TBD）。
- [ ] T014 [P] [US2] 改 `base-web/pnpm-workspace.yaml`：移除 `nodeLinker: hoisted` 行（回 pnpm 預設 strict isolation）。per [data-model §E2.1](./data-model.md)。對應 FR-004。Depends on T012 + T013（必須先加 phantom transitive 為 explicit devDeps、才能移 hoisted、否則撞 baseline error）。
- [ ] T015 [P] [US2] 改 `base-web/.npmrc`：移除 `shamefully-hoist=true` 行（pnpm 11 不讀、vestige）；保留 `registry=https://registry.npmmirror.com/` + `ignore-workspace-root-check=true` + `link-workspace-packages=true`。per [data-model §E2.2](./data-model.md)。對應 FR-004。Depends on T014（雖然 .npmrc 不同檔、邏輯上與 nodeLinker 同步 cleanup；sequential 安全選擇）。
- [ ] T016 [US2] 改 `base-web/Dockerfile`：(a) Remove `ARG PNPM_VERSION=11.0.8`（top-level、line 18）;(b) Remove builder stage 內 `ARG PNPM_VERSION`（line 28）;(c) Change `RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate` 為 `RUN corepack enable`（line 31）;(d) 加 inline 註解：`# corepack 自動讀 base-web/package.json packageManager field、pnpm 版本由此提供`。per [data-model §E2.5](./data-model.md)。對應 FR-005。Depends on T012（packageManager field 必須先加進 package.json、Dockerfile 才能 rely on it）。
- [ ] T017 [P] [US2] 改 `base-web/build/plugins/unocss.ts:24` implicit any：`(svg) => transformSVG(svg)` → `(svg: string) => transformSVG(svg)`（+1 line type 註解、同檔 audit 範圍順道修）。per [data-model §E2.6](./data-model.md)。對應 FR-007。Depends on T011（audit 發現 implicit any）。
- [ ] T018 [US2] base-web 本機 `pnpm install --frozen-lockfile --ignore-scripts` verify（C-V2）：`cd base-web && rm -rf node_modules packages/*/node_modules && pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -8`、expect `Done in X.Xs using pnpm v11.0.8` 結尾、無 missing dep warning。Depends on T012 + T013 + T014 + T015。對應 SC-002 第 1 部分、per [contracts C-V2](./contracts/verification-commands.md)。
- [ ] T019 [US2] base-web 本機 `pnpm typecheck` verify（C-V3）：`cd base-web && node_modules/.bin/vue-tsc --noEmit --skipLibCheck 2>&1 | grep -cE "error TS"`、expect 0 error（含 implicit any 已修）。Depends on T018 + T017。對應 SC-002 第 2 部分。
- [ ] T020 [US2] base-web 本機 `vite build` verify（C-V4）：`cd base-web && node_modules/.bin/vite build --mode prod 2>&1 | tail -5`、expect `Build successful` + dist/ 產出含 index.html + assets/。Depends on T019。對應 SC-002 第 3 部分。
- [ ] T021 [US2] base-web worktree commit（單 commit、Part B 整體）：進 `base-web/`、`git add Dockerfile package.json pnpm-workspace.yaml .npmrc packages/uno-preset/package.json build/plugins/unocss.ts`（及其他 audit 發現 sub-package）、commit message 對齊 [quickstart Step 2.9](./quickstart.md) 範本（feat 標 049 + Part B + 軌道 + 6 處改動明細 + 撤回 048 d521c819/b4453385 hoisted/ARG ref + 048-N1 (a)(b)(c) 結案 + (d) trigger-driven 留）。Depends on T020。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。

**Checkpoint**：US2 完成 —— base-web dep hygiene Part B 整體落地、`pnpm typecheck` + `vite build` 雙 PASS、worktree commit 已落（待 push）。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：docker rebuild base-web image + dev stack restart + CDP smoke + boundary verify + outer 多段 commit + merge + SHA backfill + 最終 acceptance 全綠 verify。

- [ ] T022 docker rebuild base-web image + dev stack restart + verify healthy（C-V5）：`docker build -t base-web:rev1-admin-base-web ./base-web`（~5-10min）→ `$PC up -d --force-recreate --no-deps base-web && sleep 30` → `$PC ps --format "{{.Service}}: {{.Status}}"` base-web status `Up X seconds (healthy)`。Depends on T021。對應 SC-003 前置、per [contracts C-V5](./contracts/verification-commands.md)。
- [ ] T023 [P] C-V6 CDP browser smoke 8 路徑（reuse 048 cdp-smoke.js、無需重寫）：`node specs/048-base-typings-sync/contracts/cdp-smoke.js 2>&1 | tail -20`、expect 8/8 PASS、無 console error。Depends on T022。對應 SC-003、FR-010。
- [ ] T024 [P] C-V7 grep audit verification：per [contracts C-V7](./contracts/verification-commands.md) shell script（nodeLinker/shamefully-hoist 0 hit + packageManager/corepack enable ≥1 hit + ARG PNPM_VERSION/corepack prepare 0 hit + svg: string present + 048 baseline 15 error 全清）。Depends on T022（or T021 完成、T022 同步跑）。對應 SC-004。
- [ ] T025 [P] C-V8 boundary verify：per [contracts C-V8](./contracts/verification-commands.md) shell script（base-web 改動限定 6 file + src/ 0 diff + rust-api 0 diff + schema migration 0 + cargo dep 0 + 048 cdp-smoke.js 不動）。Depends on T021（or T022）。對應 SC-005、FR-008。
- [ ] T026 outer feature branch commit 2 — base-web SHA pin bump：`BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)`、`git add base-web`、`git commit -m "chore(submodule): bump base-web 到 ${BASE_WEB_SHA} — 049 dep-hygiene Part B"`（含完整 body 說明 Part B 6 處改動 + 軌道 + 048-N1 結案）。per [quickstart Step 4.1](./quickstart.md)。Depends on T021 完成。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T027 outer feature branch commit 3 — INTEGRATION-CHECKLIST + SPECKIT marker：改 `docs/INTEGRATION-CHECKLIST.md` —— 048-N1 衍生 follow-up row 改為 footnote「已結案 (a)+(b)+(c)、(d) trigger-driven 留」格式（保留歷史脈絡）+ 已完成里程碑加 049 entry（outer/merge/base-web SHA placeholder 留 backfill）+ Current Focus「現狀」加 049 + 「下一步」改為條件觸發 follow-up backlog active items（042-N4 / 042-N5 / 048-N1 (d) 各自獨立、trigger driven；含 048-N1 (d) 因 (a)(b)(c) 結案但 (d) 仍待 pnpm 升級觸發）；改 `CLAUDE.md` SPECKIT marker idle（Active Spec/Plan = `—`、Phase idle、下一步指向條件觸發）。`git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md && git commit`。per [data-model §E3](./data-model.md) + [quickstart Step 4.2](./quickstart.md)。Depends on T026。對應 FR-011、SC-007 + SC-008。
- [ ] T028 DESIGN-W-BASE-WEB.md §4.4.2 049 sprint 條目完整性 verify（無 commit、純檢查、per [research R-6](./research.md) §4.4.2 wording 設計）：grep `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.2 含 049 base-web-dep-hygiene 條目 + scope 描述（comprehensive audit + 6 處改動列舉）+ `<TBD post-merge>` SHA placeholder。若 T006 建檔時 §4.4.2 完整、本 task 純 verify pass；若漏掉、補完並 amend 到 T010 commit 或新獨立 commit。Depends on T027。對應 FR-002 配套。
- [ ] T029 (optional、**Phase 1 audit 後 user 確認後才執行**) outer feature branch commit 4 — implementer-stage expansion 拾取（per [research R-9](./research.md)）：≤3 budget 拾取 candidate (a) audit 漏抓 transitive 需補加 / (b) `packages/<sub>/package.json` 其他 sub-package 也需動 / (c) `.npmrc` 其他 vestige cleanup 中任意 ≤3 處；超限拒拾、登 049+ follow-up。對應 FR-012。
- [ ] T030 C-V9 + C-V10 acceptance docs verify：per [contracts C-V9 + C-V10](./contracts/verification-commands.md)、grep Constitution v1.6.0 + DESIGN-W-BASE-WEB.md 完整性 + 4 section heading + §4.4.2 049 sprint + plan-template 4-軌道辨識 + CLAUDE.md unified 索引 + INTEGRATION-CHECKLIST 048-N1 footnote + 049 entry + 下一步條件觸發 + SPECKIT marker idle。Depends on T028（or T029 若拾）。對應 SC-006 + SC-007 + SC-008、FR-001/002/003/011。
- [ ] T031 push origin base-web worktree —— **user 同意後**：`cd base-web && git push origin rev1-admin-base-web`。Depends on T021 完成。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T032 push origin outer feature branch —— **user 同意後**：`git push origin 049-base-web-dep-hygiene`。Depends on T030 完成 + T031 完成（base-web 必須先 push、避免 outer gitlink SHA 引用 unpushed commit）。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T033 merge 049 → rev1-admin-root —— **user 同意後執行**：`git checkout rev1-admin-root && git pull --ff-only origin rev1-admin-root && git merge --no-ff 049-base-web-dep-hygiene -m "Merge feature 049-base-web-dep-hygiene"`；push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)、[quickstart Step 5](./quickstart.md)。
- [ ] T034 backfill outer/merge/base-web SHA + push —— merge 後拿 outer (049 feature branch last commit) SHA + merge SHA + base-web worktree latest SHA、回填進兩處 placeholder：(a) `docs/INTEGRATION-CHECKLIST.md` 049 entry 的 `<...>_SHA` placeholder、(b) `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.2 049 sprint commit SHA placeholder；small chore commit（per 041/042/043/044/045/046/047/048 體例）+ push **須 user 同意**。對應 SC-007、[quickstart Step 6](./quickstart.md)。
- [ ] T035 C-V1~C-V10 全 acceptance final 驗 —— 依 [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重 build + 重跑、全 PASS 才結案。對應 SC-001~008。

**Checkpoint**：049 整 feature 落地、acceptance C-V1~C-V10 全綠、Part A governance restructure + Part B base-web dep hygiene 全落地、軌道紀律 boundary verify PASS、merge 回 default、INTEGRATION-CHECKLIST 048-N1 改寫為「已結案」格式 + 049 entry 加、Constitution 5/5 PASS（post-v1.6.0 amendment）維持、TS-DepGraph-Hygiene 軌道首發 sprint 完成、048-N1 (a)+(b)+(c) 結案。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001 — baseline check)
   │
Phase 2 Foundational (skipped — 2 US 跨 commit boundary、無共用 foundational)
   │
   ├─→ US1 軌道 governance restructure (T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010、SDD prerequisite、outer commit 1)
   │        │
   │        └─→ US2 base-web dep hygiene (T011 audit → T012 + T013 + T014 + T015 + T016 + T017 [P logical、same package.json sequential within base-web 同 commit] → T018 + T019 + T020 verify → T021 base-web commit)
   │                 │
   │                 └─→ Phase 5 Polish (T022-T035、docker rebuild + smoke + verify + outer commits + push + merge + backfill)
```

US1 為 P1 MVP（軌道 governance restructure 為 verifiable evidence）；US2 為同 P1（base-web dep hygiene、tightly coupled with US1 via SDD「先合法化、再執行」、不可順序顛倒）；Phase 5 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (baseline check) | — |
| T002 (Constitution v1.5→v1.6) | T001 |
| T003 (git mv W-WEBUI → BASE-WEB) | T002 |
| T004 (BASE-WEB.md §1+§2 restructure) | T003（same file sequential） |
| T005 (BASE-WEB.md §3 merge from TYPING-ALIGN) | T004（same file sequential） |
| T006 (BASE-WEB.md §4 new) | T005（same file sequential） |
| T007 (git rm TYPING-ALIGN) | T005（must merge before rm） |
| T008 (plan-template 4-軌道) | T002（Constitution v1.6.0 必先） |
| T009 (CLAUDE.md §1/§7) | T007（TYPING-ALIGN.md 須先 rm 才能 remove ref） |
| T010 (outer commit 1) | T002 + T003 + T004 + T005 + T006 + T007 + T008 + T009 |
| T011 (audit grep) | T010（Phase 0 完成、可合法進 base-web） |
| T012 (package.json packageManager + devDeps) | T011 |
| T013 (uno-preset package.json devDeps) | T011 |
| T014 (pnpm-workspace.yaml remove nodeLinker) | T012 + T013（須先加 explicit devDeps、避免移 hoisted 後 build break） |
| T015 (.npmrc remove shamefully-hoist) | T014（sequential、邏輯同步） |
| T016 (Dockerfile remove ARG/corepack prepare) | T012（packageManager 須先進 package.json） |
| T017 (unocss.ts implicit any fix) | T011 |
| T018 (pnpm install verify) | T012 + T013 + T014 + T015 |
| T019 (vue-tsc verify) | T018 + T017 |
| T020 (vite build verify) | T019 |
| T021 (base-web worktree commit) | T020 |
| T022 (docker rebuild + restart) | T021 |
| T023 (C-V6 CDP smoke) | T022 |
| T024 (C-V7 grep verify) | T022（or T021 完成、可同期跑） |
| T025 (C-V8 boundary verify) | T021（or T022） |
| T026 (outer commit 2 SHA pin) | T021 完成（after base-web push、實際 outer commit local 不需 push） |
| T027 (outer commit 3 INTEGRATION-CHECKLIST + CLAUDE marker) | T026 |
| T028 (DESIGN §4.4.2 verify) | T027 |
| T029 (optional expansion ≤3) | T028（user 同意後）|
| T030 (C-V9 + C-V10 acceptance docs) | T028（or T029 若拾） |
| T031 (push base-web) | T021 完成、**user 同意** |
| T032 (push outer feature branch) | T030 + T031 完成（base-web 必須先 push）、**user 同意** |
| T033 (merge + push rev1-admin-root) | T032 全 PASS、**user 同意** |
| T034 (SHA backfill + push) | T033、**user 同意** |
| T035 (final acceptance C-V1~C-V10) | T034 |

---

## Implementation Strategy（per quickstart Step 1-7 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 Setup（T001、~5 min）**：
- T001 baseline check

→ 約 5 min；baseline confirmed。

**Batch 2 — Phase 3 US1 governance restructure（T002-T010、~60-90 min）**：
- T002 constitution v1.6.0 amendment（~40 line edit）
- T003 git mv W-WEBUI → BASE-WEB（git op）
- T004 BASE-WEB.md §1+§2 restructure（~305 line edit、原 W-WEBUI 255 + 新 §1 ~50）
- T005 §3 merge from TYPING-ALIGN（~116 line copy + 微改 §3.5 wording）
- T006 §4 TS-DepGraph-Hygiene 新加（~120 line write）
- T007 git rm TYPING-ALIGN.md（git op）
- T008 plan-template 3 → 4 軌道辨識（~8 line edit）
- T009 CLAUDE.md §1/§7 索引（~5 line edit）
- T010 outer commit 1

→ 約 60-90 min（DESIGN merge restructure 為主要時間佔比、~400-500 line edit total）；**Phase 0 完成、SDD「先合法化、再執行」紀律滿足**、**MVP-1 達成**（US1 governance restructure 為 verifiable evidence）。

**Batch 3 — Phase 4 US2 base-web dep hygiene（T011-T021、~60-90 min）**：
- T011 audit grep run（~5 min）
- T012-T017 [P logical] file edits in base-web（~20-30 min、6 file changes）
- T018-T020 本機 verify（pnpm install + typecheck + build、~10-15 min）
- T021 base-web worktree commit

→ 約 60-90 min（audit + dep 提升 + config cleanup + 本機 verify 為主要時間佔比）；MVP-2 達成（US1+US2 落地、待 Phase 5 verify）。

**Batch 4 — Phase 5 Polish docker rebuild + acceptance（T022-T025、~45-60 min）**：
- T022 docker rebuild + restart（~5-10 min）
- T023 [P] C-V6 CDP smoke 8 path（~20-30 min）
- T024 [P] C-V7 grep audit verify
- T025 [P] C-V8 boundary verify

→ 約 45-60 min（docker build + CDP smoke 為主要時間佔比）。

**Batch 5 — Phase 5 Polish outer commits + acceptance docs（T026-T030、~20 min）**：
- T026 outer commit 2 base-web SHA pin
- T027 outer commit 3 INTEGRATION-CHECKLIST + CLAUDE marker
- T028 DESIGN §4.4.2 verify
- T029 (optional) outer commit 4 expansion（user 確認後）
- T030 C-V9 + C-V10 acceptance docs verify

→ 約 20 min。

**Batch 6 — Phase 5 push + merge + backfill（T031-T035、user-gated）**：
- T031 push base-web
- T032 push outer feature branch
- T033 merge + push rev1-admin-root
- T034 SHA backfill + push
- T035 final acceptance C-V1~C-V10

→ 約 15-20 min 含 user 同意等待（4 個 user 同意關卡、不含 user thinking time）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-0（Phase 1 Setup only）**：baseline check 確認、不交付任何 user value。
- **MVP-1（Phase 1 + US1）**：Constitution v1.6.0 amendment + DESIGN-W-BASE-WEB.md 4 § unified doc + plan-template + CLAUDE 索引。**僅交軌道 governance restructure**（最高 procedural value、unified doc 結構就位、未來其他 base-web 軌道 sprint 可用）。base-web dep hygiene 改動留後。
- **MVP-2（Phase 1 + US1 + US2）**：+ Phase 4 base-web dep hygiene impl（strict isolation + explicit devDeps + packageManager pin + Dockerfile 簡化）。**完整 048-N1 (a)+(b)+(c) 結案**。可 deliver 全套 build/dep config hygiene。
- **Full feature（MVP-2 + 完整 Polish）**：依 Batch 1-6 完整跑（推薦、bundled feature 一次清完、TS-DepGraph-Hygiene 軌道首發完成、acceptance C-V1~C-V10 全 PASS）。

User 偏好：Full feature 一次到位（per brainstorm 6 section 拍板 + 049 brainstorm 統一 acceptance 全綠 / merge 紀律）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~012 + SC-001~008）→ ② code quality（YAML / TS idiom / Dockerfile 規範 / Constitution 紀律 / 軌道紀律 boundary）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、`pnpm install` 結尾、`pnpm typecheck` PASS、commit SHA）。

**Phase 5 Polish** 必須在 US1+US2 全部 PASS 後執行（含 user 同意 push / merge / backfill 四個關卡）。

**Implementer-stage Expansion ≤3 處**（per [research R-9](./research.md)）：plan 階段 3 拾取 candidate (a) audit 漏抓 transitive 需補加 / (b) `packages/<sub>/package.json` 其他 sub-package 需動 / (c) `.npmrc` 其他 vestige cleanup、user 確認後拾取；超限拒絕並登 049+ follow-up。

---

## Summary

- **Total tasks**: 35
- **By phase**: Setup 1 / Foundational 0 / US1 9 / US2 11 / Polish 14
- **By user story**: US1 = 9 / US2 = 11（共 20 user story tasks）+ Setup 1 + Polish 14
- **Parallel opportunities**：
  - US2 內部 T012 / T013 / T017（不同檔可邏輯並行、T014/T015/T016 因依賴 T012/T013 sequential）
  - Phase 5 T023 / T024 / T025 並行（acceptance grep + CDP smoke + boundary verify 同期）
- **Independent test criteria**: 每個 US 對應 C-V1~C-V10 中 1-2 條（per spec.md SC-001~008）
- **Suggested MVP scope**: MVP-1（Phase 1 + US1）—— Constitution v1.6.0 amendment + DESIGN restructure 即可 governance restructure 對齊 pnpm 11+ best practice 紀律；user 已選 Full feature 一次到位（含 US2 base-web dep hygiene + Polish full）
- **Format validation**: ✅ 全 35 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
