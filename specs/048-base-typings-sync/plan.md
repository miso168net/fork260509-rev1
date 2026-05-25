# Implementation Plan: 048 base-typings-sync

**Branch**: `048-base-typings-sync` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/048-base-typings-sync/spec.md`

## Summary

對齊 `base-web` `src/typings/api/*.d.ts` 與 rust-api wire 真實序列化型。3 處 confirmed mismatch fix（M1+M2+M3、`MenuRoute.id: string→number` + `MenuRoute` 補 `pid: string` + `MenuTree.pId: number → pid: string` 名 + 型雙 rename）+ 3 處 JSDoc audit 補（D1+D2+D3、`CommonRecord.id` Snowflake 53-bit 說明 + `Menu.parentId === 0` root sentinel 說明 + `Auth.UserInfo.userId` ULID vs `User.id` 不同表示說明）。

技術 approach（per spec.md + brainstorm 6 section + 3 user clarify 拍板）：

- **SDD「先合法化、再執行」紀律**：Phase 0 必先 bump Constitution v1.4.0 → v1.5.0（新增 TS-Typing-Sync 軌道受管例外、與 W-WEBUI 並列）+ 建 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件，**之後**才能合法改 base-web typings。
- **US1 typings 對齊**：4 檔 typing edit（route.d.ts + system-manage.d.ts + common.d.ts + auth.d.ts）；type-level 對齊、無 runtime / consumer 改動（Phase 0 grep 確認 0 consumer 撞 fix）。
- **US2 JSDoc audit**：純註解、0 type-shape 變動、防未來語意誤判。
- **Verification CDP browser smoke deep**：base-web image rebuild + 8 路徑 CDP smoke（per 037/038/040 體例、Edge `:9229`、無 playwright）。
- **軌道紀律**：限 `src/typings/api/*.d.ts` 範圍；其他 typings + W-WEBUI 範圍（views/components/service/store/router）+ rust-api 全 0 diff。
- **commit shape**：base-web worktree 1 commit（4 檔同檔不可拆）+ outer 4-5 commit（constitution+DESIGN+plan-template+CLAUDE 索引 / SHA pin / INTEGRATION-CHECKLIST / optional expansion / SHA backfill；DESIGN §4.1 條目由 T002 建檔同 commit、不獨立 commit、per /speckit-analyze O1）+ merge `--no-ff` 回 `rev1-admin-root`。

implementer-stage expansion budget ≤3（per 041 / 043 / 046 / 047 體例）；候選由 Phase 0 research grep 後拍板。

## Technical Context

**Language/Version**：TypeScript 5.x（base-web 既有 toolchain）；Vue 3.x；vue-tsc + vite；無新 language
**Primary Dependencies**：
- 既有 base-web：`vue` / `vue-router` / `naive-ui` / `pinia` / `axios` / `@elegant-router/vue` etc.
- TS typing 對齊參考：`rust-api/server/model/src/admin/output/{sys_menu, sys_user, sys_role, sys_access_key, sys_authentication}.rs` 為 source of truth
- 新加：**0 npm package 改動**、**0 rust cargo dep**、**0 workspace dep**

**Storage**：N/A — TS typing 修改 + JSDoc 註、不動 DB / redis / 任何 storage

**Testing**：
- Static：`pnpm typecheck`（vue-tsc）+ `pnpm build` 雙 PASS、輸出 0 TS error / 0 build error
- Runtime acceptance：base-web docker image rebuild → CDP browser smoke 8 路徑（per spec FR-012）
- 無新 unit test（typing-only feature、無新純函式邏輯、無 acceptance-only-via-CDP-smoke 紀律對齊 040 體例）

**Target Platform**：base-web container（front-nginx 取 SPA assets）；dev WSL2 + Docker Desktop

**Project Type**：base-web 軌道內 TS-Typing-Sync 軌道首發 sprint；軌道**內** base-web、含 rev1 整合層（Constitution amendment + DESIGN 新文件）

**Performance Goals**：
- `pnpm typecheck` runtime：~5-15 sec（vue-tsc full scan）
- `pnpm build` runtime：~30-60 sec（vite build full bundle）
- base-web docker image rebuild：~5-10 min（node deps fetch + build + nginx assemble）
- CDP smoke 8 路徑：~20-30 min（含 login + nav + DOM wait + assertion）

**Constraints**：
- 限 `base-web/src/typings/api/*.d.ts` 範圍（FR-007）
- 0 rust-api 改動、0 schema migration、0 新 entity、0 新 npm dep、0 新 cargo dep、0 新 redis channel、0 新 metric pre-declare（FR-006）
- 其他 base-web source 0 diff：views / components / service / store / router / locales / 其他 typings（FR-007）
- SDD「先合法化、再執行」順序紀律（FR-008）
- implementer-stage expansion ≤3 處（FR-014）

**Scale/Scope**：
- 改動 ~10 line typings 改 (M1+M2+M3) + ~15-20 line JSDoc 註 (D1+D2+D3) = ~25-30 line base-web diff
- 加 Constitution amendment (~30 line `.specify/memory/constitution.md`) + 新文件 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` (~100-150 line) + plan-template 軌道辨識條目 (~5-10 line) + CLAUDE.md §1/§7 索引 (~3 line)
- 總計 ~150-200 line outer diff + ~25-30 line base-web diff
- ~2-2.5hr 落地（per brainstorm §4.4 估時）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**重要前提**：本 sprint 的 Constitution Check **跨越 v1.4.0 → v1.5.0 amendment**。Phase 0 第一步即 amend constitution，使 sprint 後續階段對 base-web typings 改動合法。下表針對 **post-amendment v1.5.0** 對照（amendment 前 v1.4.0 對本 sprint 為 violation、Phase 0 先 bump 即 resolved）：

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.5.0**（本 sprint Phase 0 將從 v1.4.0 bump）：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 不動 Casbin / JWT / RBAC / permission；純 base-web TS typing 對齊 + JSDoc。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 不動 audit / soft delete pipeline；本 sprint 不寫 sys_operation_log、不動任何 DB / outbox / drainer。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 純 TS typing edit + JSDoc + constitution amendment + 新 DESIGN doc；無新 service / endpoint / channel / metric / service-to-service call / forwarding。 | ✅ PASS |
| **IV. base 不改動邊界**（**v1.5.0 新增 TS-Typing-Sync 軌道受管例外**）| 本 sprint 為 **TS-Typing-Sync 軌道首發**（amendment 同步落地）、軌道權威 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`；可動範圍限 `src/typings/api/*.d.ts`、其他 typings + W-WEBUI 範圍全 forbidden（FR-007 boundary verify）；動機限定為「對齊 rust wire 真實序列化型」（spec.md FR-001/002 舉證 rust DTO 真實型 vs TS 宣告 mismatch）。**Amendment 為 Phase 0 prerequisite、sprint 整體合法**。同 W-WEBUI 軌道兩段式 commit 紀律。 | ✅ PASS（v1.5.0 後） |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 TS typing audit；強化 DESIGN-B 形態（補 base-web typing 對齊 rust wire 真實型）；不引 nestjs / DESIGN-A 任何殘留。 | ✅ PASS |

**架構約束** 同步檢查：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 0 影響（typing-only feature、無 log 改動）
- §Observability「promtail → Loki + prometheus + grafana 為**必要**stack」→ 0 影響（純 type-level、無 metric / dashboard / alert 變動）
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 不動既有 3 background task

**Constitution Check 結論（post-amendment v1.5.0）**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**Constitution amendment 本身為本 sprint Phase 0 必要動作、非 violation**（spec FR-008 明文要求順序紀律）。

**Constitution amendment 內容**（per spec FR-008 + brainstorm §2.5）：
```text
Version change: 1.4.0 → 1.5.0 (MINOR — 新增 TS-Typing-Sync 軌道受管例外)
Modified principles:
  - IV. base 不改動邊界:
    新增第二條受管例外軌道「TS-Typing-Sync」（與 W-WEBUI 並列）
    軌道權威：docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
    可動範圍：src/typings/api/*.d.ts (only)
    動機限定：對齊 rust wire 真實序列化型
    仍不得動：typings/app.d.ts/router.d.ts/components.d.ts/elegant-router.d.ts/其他
    仍不得動：W-WEBUI 軌道範圍 (src/views/components/service/store/router)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check 段加軌道辨識條目
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md — 新文件
  - ✅ docs/INTEGRATION-CHECKLIST.md — Current Focus 加 TS-Typing-Sync 軌道條目
  - ✅ CLAUDE.md — §1/§7 索引補

Follow-up TODOs: 無
```

## Project Structure

### Documentation (this feature)

```text
specs/048-base-typings-sync/
├── spec.md                # /speckit-specify 產出（無 clarification needed、coverage scan 後直接 plan）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：grep 確認 + Constitution amendment 內容 + DESIGN-W-TYPING-ALIGN 骨架 + CDP smoke setup 細節
├── data-model.md          # Phase 1：4 處 typing edit diff + 3 處 JSDoc 註內容 + Constitution amendment full diff + DESIGN-W-TYPING-ALIGN 完整內容
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V9 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（5 Phase 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**內** TS-Typing-Sync + 跨 rev1 整合層（amendment + DESIGN）：

```text
base-web/                                                # worktree、單 commit
└── src/
    └── typings/api/
        ├── route.d.ts                                   # US1 M1 + M2：MenuRoute.id: string→number + 加 pid: string
        ├── system-manage.d.ts                           # US1 M3：MenuTree.pId: number → pid: string
        │                                                  + US2 D2 JSDoc on Menu.parentId
        ├── common.d.ts                                  # US2 D1 JSDoc on CommonRecord.id
        └── auth.d.ts                                    # US2 D3 JSDoc on UserInfo.userId

outer/                                                   # rev1-admin-root、多段 commit per logical
├── .specify/
│   ├── memory/constitution.md                          # v1.4.0 → v1.5.0 bump (FR-008)
│   └── templates/plan-template.md                      # 軌道辨識條目 (FR-010)
├── docs/
│   ├── INTEGRATION-DESIGN-W-TYPING-ALIGN.md            # 新文件 (FR-009、六節完整)
│   └── INTEGRATION-CHECKLIST.md                        # inline note refresh + 048 entry + 下一步 (FR-013)
└── CLAUDE.md                                            # §1/§7 索引補 + SPECKIT marker
```

**Structure Decision**：
- **base-web worktree commits**：1 個（US1 + US2 一體：4 檔 typing edit + JSDoc 同 commit、實作上 sequential edit 同一 commit、不拆）
- **outer rev1-admin-root commits**：4-5 個（Phase 0 amendment+DESIGN+plan-template+CLAUDE 索引 / base-web SHA pin / INTEGRATION-CHECKLIST + SPECKIT marker / optional expansion if 拾 / SHA backfill post-merge；DESIGN §4.1 由 T002 建檔時即落、T020 改為純 verify 不獨立 commit、per /speckit-analyze O1 remediation）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**base-web worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| US1+US2 base-web typings/api 對齊 rust wire 真實型（M1+M2+M3 mismatch fix + D1+D2+D3 JSDoc audit） | 1 commit | `src/typings/api/route.d.ts` + `src/typings/api/system-manage.d.ts` + `src/typings/api/common.d.ts` + `src/typings/api/auth.d.ts` |

**Outer rev1-admin-root commits（estimated 4-5 個）**：

| Topic | est | files |
|---|---|---|
| **Phase 0** Constitution v1.4.0→v1.5.0 amendment + DESIGN-W-TYPING-ALIGN 新文件 + plan-template 軌道辨識條目 + CLAUDE.md §1/§7 索引補 | 1 commit | `.specify/memory/constitution.md` + `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（新）+ `.specify/templates/plan-template.md` + `CLAUDE.md` |
| base-web SHA pin bump | 1 commit | gitlink `base-web` |
| INTEGRATION-CHECKLIST 048 entry + Current Focus update + CLAUDE.md SPECKIT marker idle + 衍生 follow-up inline note refresh | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| (optional, ≤3 expansion budget) implementer-stage polish 拾取 | 0-1 commit | TBD per Phase 0 research |
| SHA backfill（post-merge） | 1 commit | `docs/INTEGRATION-CHECKLIST.md` 048 entry placeholder |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：rust wire 真實型 grep 確認 — `MenuRoute.id: i32` + `MenuRoute.pid: String` + `MenuTree.id: i32` + `MenuTree.pid: String` + `UserDetail.id: i64` + `RoleDetail.id: i64` + `UserInfoOutput.user_id: String`（spec FR-001/002 引用對齊）
- **R-2**：base-web consumer grep 確認 0 hit — `MenuRoute.id` / `MenuRoute.pid` / `MenuTree.pId` 三處改動無 consumer 撞 fix（純 typing-level 對齊）
- **R-3**：Constitution amendment v1.4.0 → v1.5.0 完整 diff 設計（IV. base 不改動邊界 新增第二受管例外軌道）
- **R-4**：DESIGN-W-TYPING-ALIGN.md 完整 6 節骨架（§1 軌道定位 / §2 可動範圍硬邊界 / §3 動機限定 / §4 軌道成員 / §5 與 W-WEBUI 邊界 / §6 預期 sprint 模式）
- **R-5**：plan-template 軌道辨識條目 wording 設計（Constitution Check 段加 IV. base 不改動邊界 對 base-web 改動 sub-check：屬 W-WEBUI 或 TS-Typing-Sync 軌道？）
- **R-6**：CDP smoke 8 路徑 setup 細節（Edge `:9229` debug port + node WebSocket driver + 確認鈕 selector + wait_for_selector pattern per 037/038/040 體例）
- **R-7**：implementer-stage expansion 候選 grep（per FR-014 ≤3）：
  - (a) `.specify/templates/plan-template.md` 軌道辨識條目 wording 微調（implementer 階段 user 確認後微調）
  - (b) `docs/INTEGRATION-CHECKLIST.md` inline note refresh wording 細化（保留 vs 改寫 vs 完全刪除、Open Q1）
  - (c) 其他相關 cleanup adjacency — Phase 0 grep 後拍板

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：4 處 typing edit complete diff（route.d.ts M1+M2 / system-manage.d.ts M3 + D2 / common.d.ts D1 / auth.d.ts D3）+ Constitution amendment full diff + DESIGN-W-TYPING-ALIGN.md 完整 6 節內容 + plan-template 軌道辨識條目 wording
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V9 acceptance commands（dev stack baseline + pnpm typecheck + pnpm build + docker rebuild + grep verification + CDP smoke 8 路徑 + boundary verify + constitution+DESIGN 完整性 + INTEGRATION-CHECKLIST cleanup verify）
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（5 Phase 落地步驟 + 1 base-web commit + 5-6 outer commits + merge 順序）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation；v1.5.0 amendment Phase 0 落地後 IV. PASS）
- contracts/verification-commands.md 引入 9 個 C-V、全為 acceptance 驗證手段、不引入新 functional path
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律 + SDD「先合法化、再執行」順序）
- INTEGRATION-CHECKLIST cleanup（FR-013）為 plan 內已界定的後續、無爭議
- DESIGN-W-TYPING-ALIGN.md 為新軌道權威文件、與 Constitution v1.5.0 amendment 同步

**Constitution Check post-Phase 1（v1.5.0）：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。Constitution amendment 本身為 spec FR-008 明文 sprint 動作、非 Principle violation。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 14-20 tasks：
- Phase 0 (Constitution amendment + DESIGN-W-TYPING-ALIGN + plan-template + CLAUDE indexes) — 4-5 tasks
- Phase 1 (base-web typings 4 file edits) — 4 tasks (US1: M1+M2+M3 / US2: D1+D2+D3)
- Phase 2 (base-web build + docker rebuild + restart) — 3 tasks
- Phase 3 (acceptance C-V1~C-V9) — 4-5 tasks
- Phase 4 (outer commits + merge + push + SHA backfill) — 4 tasks

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
