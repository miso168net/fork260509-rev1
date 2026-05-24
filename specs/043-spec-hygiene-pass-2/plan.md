# Implementation Plan: 043 spec-hygiene-pass-2

**Branch**: `043-spec-hygiene-pass-2` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/043-spec-hygiene-pass-2/spec.md`

## Summary

041 spec-hygiene-pass-1 之續集：將 042 落地後盤點到的三項 P1 backlog 條目（042-N3 / R5 / 041-N2）bundled 成 043 一次清完。**純 spec-md edits、0 rust-api / 0 base-web 程式碼改動、0 schema migration**。

技術 approach：

- **US1 — TZ fix（10 hits / 5 files / 3 specs）**：對所有 `NOW() - INTERVAL '...'` pattern 套一致替換 `(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'`，使 postgres 時區感知 NOW() 與 `sys_operation_log.created_at`（UTC naive）對齊比較。
- **US2 — /auth/logout doc**：spec 005 contracts/auth-endpoints.md 新增「Logout (no server endpoint by design)」§；內含 current design intent / token revocation 3 pattern research / triggers / W-F12 hook。
- **US3 — 002 §E4 use 行**：line 158 `use server_model::admin::entities::{...}` → `use crate::admin::entities::{...}`，與同檔 line 186 / 362 對齊。

擴展紀律：implementer 階段允許按 041 體例擴展 scope（grep 出鄰近 spec rot 同次拾取），但需 plan 階段登記候選 + 動手前 user 確認 + ≤3 處上限。

## Technical Context

**Language/Version**: Markdown / SQL string templates only — no compiled language scope
**Primary Dependencies**: none（純 spec md edits）
**Storage**: N/A（不動 schema、不動 row）
**Testing**: dev stack health-driven manual C-V replay（沒有自動 unit test、純 spec verification correctness）
**Target Platform**: spec docs 落 `specs/<NNN>/` 目錄、reader 為人類或 AI implementer
**Project Type**: Documentation hygiene pass（軌道外、Pareto cleanup feature）
**Performance Goals**: N/A
**Constraints**:
- 0 rust-api code 改動（FR-005）
- 0 base-web 改動（FR-006）
- 0 schema migration、0 新 entity、0 新 cargo crate dep（FR-007）
- implementer 擴展 ≤3 處（FR-008 / SC-006）
**Scale/Scope**: 4 spec files / 1 brainstorm doc / 1 INTEGRATION-CHECKLIST 改動；估改動行數 ~50-80 行（10 處 SQL 各 1 行 + US2 新 § ~30-50 行 + US3 1 行 + checklist 5-10 行）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 純 spec md edits、不動 endpoint、不動 Casbin policy、不動 enforcement chain。0 影響。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 不動 audit pipeline 行為（042 已就位）；US1 只修 spec verification SQL 的時區比較、實際 audit 寫入路徑 0 改動；US2 補完 design doc 不實作 server-side revocation；US3 純 documentation correctness。0 退化、不擴張。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 不動 service 結構、不引 service-to-service HTTP、不動 nginx config。0 影響。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-006、SC-005 verify）；本 feature **軌道外**、屬「預設原則」涵蓋；**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment、**不**需更新 `DESIGN-W-WEBUI` 文件。同 041 / 042 模式（軌道外 spec-md only）。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；不動 rust-only DESIGN-B 形態；US2 對 `/auth/logout` 的 doc 補完明確表明「不實作 server endpoint by design」、強化 DESIGN-B 形態的 explicit boundary。 | ✅ PASS |

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/043-spec-hygiene-pass-2/
├── spec.md                # /speckit-specify 產出（已 commit 8c9a301）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0 grep + 假設驗證
├── data-model.md          # 本 feature 無 data entity、用 §「Spec Rot Inventory」取代
├── contracts/
│   └── verification-commands.md   # acceptance C-V 命令（C-V1~C-V5）
├── quickstart.md          # implementer 操作手冊（Step 1~5）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

本 feature 為 spec md edits 為主、無 rust-api / base-web 程式碼改動。實際改動：

```text
docs/
└── INTEGRATION-CHECKLIST.md                          # 移除 042-N3 / R5 / 041-N2 row、加 043 entry（post-merge、FR-009）

specs/
├── 002-soft-delete-infrastructure/
│   └── data-model.md                                 # §E4 line 158 use 行 fix（FR-004、US3）
├── 003-audit-log-infrastructure/
│   └── quickstart.md                                 # line 249 TZ fix（FR-001、US1 1/10）
├── 005-auth-login-and-dynamic-menu/
│   └── contracts/
│       └── auth-endpoints.md                         # 新 § Logout (FR-003、US2)
├── 021-systemmanage-alias-router/
│   ├── spec.md                                       # line 115 TZ fix（US1 1/10）
│   ├── tasks.md                                      # line 180 / 182 TZ fix（US1 2/10）
│   └── contracts/
│       └── verification-commands.md                  # line 330 / 334 TZ fix（US1 2/10）
└── 042-audit-outbox-and-http-mount/
    └── contracts/
        └── verification-commands.md                  # line 296 / 307 / 433 / 512 TZ fix（US1 4/10）
```

**Structure Decision**：
- **0 rust-api worktree commit**（無 base-web / rust-api 改動、無第一段 commit）
- **單段 commit on outer feature branch `043-spec-hygiene-pass-2`**：spec docs + INTEGRATION-CHECKLIST 改動 + （implementer 擴展若有發生）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

純 outer-only commit shape、與 041 / 042 雙段式不同（per CLAUDE.md §4.1「外層專屬檔的單段 commit」段）。

### Commit shape (per CLAUDE.md §4.1)

- **單段（outer rev1-admin-root、feature branch `043-spec-hygiene-pass-2`）**：1-2 commit
  - `docs(spec-hygiene): 042-N3 TZ fix + R5 logout doc + 041-N2 use 行 fix (043)`
  - 可選追加 `docs: backfill 043 entry SHA` chore commit（post-merge）
  - Files: ~6-7 spec md files + `docs/INTEGRATION-CHECKLIST.md`
- **Merge 回 default**：`git merge --no-ff 043-spec-hygiene-pass-2` to `rev1-admin-root`、user 同意後 push

詳見 [`quickstart.md`](./quickstart.md) Step 4。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：TZ bug 真實 reproducer（postgres `NOW()` `+08` vs `sys_operation_log.created_at` UTC naive、相減 8h offset）
- **R-2**：`(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'` fix pattern 在 dev stack postgres 真實正確（grep + run 驗證）
- **R-3**：10 處 hit 完整 enumerate（精確 file:line）
- **R-4**：spec 005 contracts/auth-endpoints.md 現有 4 endpoint 結構（為 R5 doc 新 § 插入點）
- **R-5**：token revocation 3 pattern 比較（Redis blacklist / short-TTL refresh / JWT versioning）
- **R-6**：spec 002 data-model.md line 158 vs 186 / 362 對照（041-N2 fix 確認）
- **R-7**：implementer-stage expansion 候選 grep（同類 stale pattern 預掃）

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：Spec Rot Inventory（10 hit table + 3 patch types breakdown）
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V5 acceptance
- [`quickstart.md`](./quickstart.md)：5-step implementer 手冊
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）
- contracts/verification-commands.md 引入 5 個 C-V、全為 acceptance 驗證手段、不引入新功能 / 新 path / 新 schema
- quickstart.md 內 commit shape 明確單段式（符合 §4.1 外層專屬檔紀律）
- INTEGRATION-CHECKLIST cleanup（FR-009）為 plan 內已界定的後續、無爭議

**Constitution Check post-Phase 1：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`，將 spec FR-001~FR-009 + quickstart Step 1~5 拆成 implement units（每個有 T-NN 編號、user story mapping、dependencies、parallel marker）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
