# Implementation Plan: 046 spec-hygiene-pass-3

**Branch**: `046-spec-hygiene-pass-3` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/046-spec-hygiene-pass-3/spec.md`

## Summary

Bundle 4 follow-up（045-N2 + 044-N1 + 042-N1 + docker-compose footer trivial）為 spec-hygiene cleanup pass、體例對齊 041 / 043。

技術 approach（per spec.md + brainstorm 7 section 拍板）：

- **US1+US2 (045-N2)**：改 `specs/045-facade-atomicity-pass/data-model.md §E1.2`（whole-Model `==` → 6 業務欄位 semantic compare 描述 + tracing `target: target` → `target = target` structured field）+ `contracts/verification-commands.md` 5 處對齊實 code（C-V2 schema column + C-V4-V6 endpoint path + C-V8 body shape + C-V10 HTTP verb）。
- **US3 (044-N1)**：`rust-api/server/service/src/admin/sys_authorization_service.rs` lines 140/154/168 移 3 處 `println!` → `tracing::debug!(?var, "…")` structured field。
- **US4 (042-N1)**：新 `rust-api/server/model/tests/common/audit_pipeline.rs` 暴 `wait_for_audit_row(db, predicate_sql, timeout_ms)` helper（輪詢 sys_operation_log、500ms budget、50ms interval）；4 test file 共 12 個 `#[ignore]` test 改用 helper + 註解明示「requires dev stack drainer running」。
- **US5 (docker-compose footer)**：改 `docker-compose.yml` 檔頭註解 8→12 service。

implementer-stage expansion budget ≤3（per 041 / 043 體例）；若 grep 發現同類鄰近 stale → user 確認後拾取、否則登 047+ follow-up。

## Technical Context

**Language/Version**: Rust 1.86（rust-api worktree、既有 toolchain）+ Markdown（spec md）+ YAML（docker-compose）；無新 language
**Primary Dependencies**:
- 既有 crate：`tokio` (sleep)、`sea-orm` (DatabaseConnection query)、`tracing` + `tracing-subscriber` (US3 structured log)
- **無新增** workspace dep（test helper 用既有 stack）
**Storage**:
- postgres：既有 sys_operation_log（US4 helper 查詢的 table）；**0 schema migration**
- 無 redis / 無新 channel
**Testing**: dev stack 12 service healthy-driven 手動 C-V acceptance + `cargo test --ignored` for US4 12 test；helper 內測（sleep+poll behavior）由 acceptance C-V5 覆蓋
**Target Platform**: Linux x86_64 docker container（rust-api）；dev WSL2 + Docker Desktop
**Project Type**: spec-hygiene cleanup pass（rust-api code refactor + spec md erratum + outer YAML comment）；軌道**外** rust-api + outer + spec md
**Performance Goals**:
- US4 helper 500ms budget per call（per 042 drainer_sleep_interval=50ms × 10 safety margin、p95 落點 < 200ms 預期）
- 其他 US 無 runtime overhead diff（純 docs / structured log channel 改）
**Constraints**:
- 0 base-web 改動（FR-012）
- 0 schema migration、0 新 application entity、0 新 workspace cargo dep、0 新 redis channel、0 新 metric pre-declare（FR-013）
- implementer-stage expansion ≤3 處（FR-015）
**Scale/Scope**:
- 改動 ~21 處（5 US 分布：US1 2 + US2 5 + US3 3 + US4 12 test + 1 helper file + 1 mod.rs + US5 1 = ~22 hit）
- ~4-5hr 落地（spec-kit 階段 ~2hr + executing-plans subagent + docker rebuild + acceptance ~2-3hr）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 不動 Casbin enforce / policy / endpoint；US3 `assign_permission` 內 3 處 `println!` 純 log channel 改、policy 邏輯不動。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 既有 audit pipeline 0 改動；US4 test sleep+poll **驗證**既有 outbox→drainer→sys_operation_log pipeline 行為而非改它；US2 spec md 修正 audit assertion query 對齊實際 column name。**反向強化** Principle II（test 復活）。 | ✅ PASS（含 reinforce） |
| **III. 嚴版禁 Forward + 單一職責** | 純 cleanup、無新 service / endpoint / channel / metric / 無 service-to-service call。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-012 verify）；軌道**外**、預設原則涵蓋；**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment、**不**需更新 `DESIGN-W-WEBUI` 文件。同 039 / 041 / 042 / 043 / 044 / 045 模式。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 rust-api 小修 + spec md erratum；強化 DESIGN-B 形態（補測試 + 修日誌通道 + 對齊 spec docs）；不引 nestjs / DESIGN-A 任何殘留。 | ✅ PASS |

**架構約束** 同步檢查：
- §Observability「promtail → Loki + prometheus + grafana 為**必要**stack」→ 044 已落地；US3 `println!`→`tracing::debug!` 是補 044 W-F12 fmt::json formatter 對齊缺口（println bypass formatter 產 non-JSON garbage row）。
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 不動既有 3 background task；US4 test sleep+poll 是**驗證** outbox-worker 既有行為。
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ US3 直接修補 println bypass formatter 缺口。

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/046-spec-hygiene-pass-3/
├── spec.md                # /speckit-specify 產出
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：grep 確認 / 拍板 spec md 確切 hit + helper signature 細節
├── data-model.md          # Phase 1：helper API + spec md edit 對應表 + structured log key spec
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V8 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（5 US 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**外** rust-api + outer + spec md、0 base-web 改動：

```text
rust-api/                                            # worktree、多段 commit
└── server/
    ├── service/src/admin/
    │   └── sys_authorization_service.rs             # US3：移 3 處 println、加 3 處 tracing::debug! (044-N1 / FR-007)
    └── model/tests/
        ├── common/
        │   ├── audit_pipeline.rs                    # 新檔：wait_for_audit_row helper (US4 / FR-008)
        │   └── mod.rs                               # + pub mod audit_pipeline (US4 / FR-009)
        ├── audit_basics.rs                          # US4：5 個 ignored test 改 helper + 註解 (FR-010)
        ├── audit_http_middleware.rs                 # US4：2 個 ignored test 改 helper + 註解 (FR-010)
        ├── audit_transaction_rollback.rs            # US4：2 個 ignored test 改 helper + 註解 (FR-010)
        └── soft_delete_audit_integration.rs        # US4：3 個 ignored test 改 helper + 註解 (FR-010)

outer/                                              # rev1-admin-root、多段 commit per logical
├── specs/045-facade-atomicity-pass/
│   ├── data-model.md                                # US1：§E1.2 line 56 + 114 兩處 erratum (FR-001/002)
│   └── contracts/
│       └── verification-commands.md                 # US2：C-V2/V4-V6/V8/V10 共 5 處對齊實 code (FR-003/004/005/006)
├── docker-compose.yml                               # US5：檔頭服務數 8→12 (FR-011)
├── docs/INTEGRATION-CHECKLIST.md                    # 移 3 row + 加 046 entry + 下一步 update (FR-014)
└── CLAUDE.md                                        # SPECKIT marker 區指向 046 plan.md
```

**Structure Decision**：
- **rust-api worktree commits**：2 個（US3 println cleanup / US4 test helper + 12 test migration）；US4 可選擇拆「helper-add」+「callsite-migrate」2 commit
- **outer rev1-admin-root commits**：5-6 個（US1 data-model erratum / US2 contracts erratum / US5 docker-compose / rust-api SHA pin / INTEGRATION-CHECKLIST + CLAUDE.md / SHA backfill post-merge）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**rust-api worktree commits（estimated 2 個）**：

| Topic | est | files |
|---|---|---|
| US3 044-N1 println cleanup | 1 commit | `server/service/src/admin/sys_authorization_service.rs` |
| US4 042-N1 test helper + 12 test fix | 1-2 commit | `server/model/tests/common/audit_pipeline.rs` (NEW) + `server/model/tests/common/mod.rs` + 4 test 檔 |

**Outer rev1-admin-root commits（estimated 5-6 個）**：

| Topic | est | files |
|---|---|---|
| US1 045-N2 (a)(b) data-model.md erratum | 1 commit | `specs/045-facade-atomicity-pass/data-model.md` |
| US2 045-N2 (c)(d)(e) contracts/verification-commands.md erratum | 1 commit | `specs/045-facade-atomicity-pass/contracts/verification-commands.md` |
| US5 docker-compose footer | 1 commit | `docker-compose.yml` |
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker | 1-2 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| SHA backfill (post-merge) | 1 commit | `docs/INTEGRATION-CHECKLIST.md` 046 entry placeholder |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：精確 spec md hit lines / hit count grep 結果（US1+US2 5 處 + US3 3 處）
- **R-2**：US4 helper signature 細節（`Result<i64, String>` vs `Result<(), String>` 拍板、polling 50ms interval 確認、timeout `Err(String)` format）
- **R-3**：12 個 ignored test 的 callsite mapping（每 test 用哪個 predicate_sql、共幾個 helper call）
- **R-4**：US3 `tracing::debug!` structured field naming（`?var, "message"` vs `var = ?var, "message"` 慣用 form 拍板）
- **R-5**：US5 docker-compose footer 完整服務列表 grep 確認（5 既有 + 7 obs = 12 + acme/cleanup/migration profile-specific）
- **R-6**：implementer-stage expansion 候選 grep（其他 spec md 鄰近 stale / 其他 service file 殘留 println / 其他 common test ignored test）

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：helper API 簽名表 + spec md edit 對應 file:line table + structured log key spec
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V8 acceptance commands（grep + cargo test + docker compose ps + Loki query 混合）
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（5 US 落地步驟 + 多段式 commit + merge 順序）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）
- contracts/verification-commands.md 引入 8 個 C-V、全為 acceptance 驗證手段、不引入新 functional path
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律）
- INTEGRATION-CHECKLIST cleanup（FR-014）為 plan 內已界定的後續、無爭議

**Constitution Check post-Phase 1：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 25-30 tasks（中小型 pass、規模與 041 / 043 對齊；042-N1 12 test 拆 12+ task 是主要 task 量推手）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
