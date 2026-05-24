# Implementation Plan: 045 facade-atomicity-pass

**Branch**: `045-facade-atomicity-pass` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-facade-atomicity-pass/spec.md`

## Summary

Bundle 4 follow-up backlog 項目（F3-N1 / F3-N2 / F3-N3 / 035-N1）一次處理：facade INSERT/UPDATE/batch surface 補完（sys_endpoint）+ sys_access_key DB↔in-memory atomicity（redis pub-sub `api_key:invalidate` + self-reload subscriber、與 W-F11 體例一致）+ systemManage admin user create/update 單一 outer txn（service trait `*_in_txn` 雙生方法、與 audit_log::write_in_txn 體例一致）。

技術 approach（per spec.md + brainstorm 4 Q 拍板）：

- **US1 (F3-N1)**：`facade/sys_endpoint.rs` 加 `upsert_with_audit<C>(db, endpoint, actor)` —— fetch before、None→INSERT+audit、Some+diff→UPDATE+audit、Some+no diff→noop。service `sync_endpoints` 改走 facade、移除內部 `upsert_endpoint_with_audit` helper。
- **US2 (F3-N2)**：新檔 `global/api_key_notify.rs` (對齊 casbin_notify.rs) + `initialize/api_key_sync_initialization.rs` (對齊 casbin_sync_initialization.rs)。`delete_access_key` 拿掉 inline `remove_key` 兩行、改 `notify_api_key_changed()`。`server_core::sign::clear_all_keys()` 新 API 配 reload DB-as-truth 模式。Self-loop（publisher 自己 subscribe）—— idempotent reload 接受。
- **US3 (F3-N3)**：facade 加 `batch_soft_delete_with_audit<C>(db, ids, actor, policy)` + `BatchDeletePolicy::{FailFast, LogAndContinue{target}}` enum + `BatchDeleteResult{ok,failed}` struct。Per-id 走既有 `soft_delete_by_id`（own txn）、不包外層 txn。service `batch_remove_endpoints` 改走 facade。
- **US4 (035-N1)**：`sys_user_service.rs` trait 加 3 個 `*_in_txn` 雙生方法（create_user / assign_roles_to_user / update_user）；簽名固定 `&DatabaseTransaction`（不帶 generic、async_trait + sea-orm simplest path）；原 3 fn 保留並 delegate。`sys_system_manage_api.rs` 兩 handler（add_user / update_user）改開外層 txn。030-040 callsite 0 改動（向後相容）。

新加 2 個 metric pre-declare（`api_key_invalidate_total` + `api_key_reload_total`）對齊 044 既有 metrics_init.rs 結構。

## Technical Context

**Language/Version**: Rust 1.86（rust-api worktree、既有 toolchain）+ docker-compose 配置
**Primary Dependencies**:
- 既有 crate：`metrics` (044 加 workspace)、`sea-orm` (workspace)、`tokio`、`redis`、`tracing` + `tracing-subscriber`、`async-trait`、`axum-casbin` (vendored)
- **無新增** workspace dep（純用既有 stack）
**Storage**:
- postgres：既有 sys_access_key / sys_endpoint / sys_user / sys_user_role / sys_operation_log tables、**0 schema migration**
- redis：既有 `GLOBAL_PRIMARY_REDIS` Single mode、新增 1 條 pub-sub channel `api_key:invalidate`
**Testing**: dev stack 12 service healthy-driven 手動 C-V acceptance；無自動 unit test（spec md + code refactor、acceptance 由 C-V contracts 覆蓋、per CLAUDE.md §3 紀律對齊「無新純函式測試時由 acceptance 覆蓋」）
**Target Platform**: Linux x86_64 docker container；dev WSL2 + Docker Desktop / prod cloud VM Ubuntu 22.04+
**Project Type**: Infrastructure feature（rust-only code refactor + observability stack 擴充 1 channel + 2 metric）；軌道**外** rust-api + outer
**Performance Goals**:
- F3-N2 publish→subscriber reload 完成 < 500ms（含 DB find_active + Vec iteration + add_key）— SC-004 acceptance threshold
- 035-N1 outer txn commit 完整 < 50ms（user INSERT + sys_user_role 多 row INSERT + 2 audit write_in_txn）— SC-007 acceptance threshold
- F3-N1/N3 facade refactor：無 runtime overhead diff（純 code reorg、code path 同）
**Constraints**:
- 0 base-web 改動（FR-012）
- 0 schema migration、0 新 application entity（FR-013）
- 0 新 workspace cargo dep（用既有 stack）
- async_trait 0.1 不直接支援 trait fn generic `<C>` — 改用固定 `&DatabaseTransaction` 簽名
**Scale/Scope**:
- rust-api 改動 ~12-18 處（facade + service refactor + handler outer-txn + 2 new init module + metric pre-declare）
- outer ~0-1 個新 deploy/ config 檔（無需新 secret / 無新 docker service）
- 估 40-55 tasks（中型 pass、規模與 041 / 043 spec-hygiene-pass 對齊）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 不動 Casbin enforce / policy / endpoint；sys_access_key delete 仍走既有 facade soft_delete_by_id + audit；F3-N2 新加 pub-sub broadcast 僅 sync in-memory validator state、不涉 authorization 決策；新 metric internal scrape 用、不暴 host。0 影響。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 既有 audit pipeline 0 改動；F3-N1 `upsert_with_audit` + F3-N3 `batch_soft_delete_with_audit` 全部 facade 寫入皆 `write_in_txn` + per-row audit；035-N1 outer txn 使 user + role audit **同 atomic commit/rollback**、**反向強化** Principle II；F3-N2 `delete_access_key` 仍走 facade audit。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | + 1 redis pub-sub channel `api_key:invalidate`（跨副本同步、非跨服務 HTTP/RPC）；對齊 W-F11 既有 `casbin:policy:invalidate` 體例；不引 service-to-service HTTP call；facade thicken / service 變薄、更清晰單一職責。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-012 verify）；軌道**外**、預設原則涵蓋；**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment、**不**需更新 `DESIGN-W-WEBUI` 文件。同 039 / 041 / 042 / 043 / 044 模式。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 rust refactor + observability 擴充；強化 DESIGN-B 形態；不引 nestjs / DESIGN-A 任何殘留。 | ✅ PASS |

**架構約束** 同步檢查：
- §Observability「promtail → Loki + prometheus + grafana 為**必要**stack」→ 044 已落地；本 feature 新增 2 個 metric 走既有 metrics_init.rs pre-declare、prometheus 自動 scrape 取到、與 044 體例對齊
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 不動既有 3 background task；新增 `spawn_api_key_sync_subscriber` 為**第 4 個**長駐 task（與 W-F11 `spawn_casbin_sync_subscriber` 體例平行、不衝突）
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 044 已落地；本 feature 新增 tracing log 走既有 fmt::json() formatter、無需 special handling

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/045-facade-atomicity-pass/
├── spec.md                # /speckit-specify 產出
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：5 個 implementer-grade open question grep + 拍板
├── data-model.md          # Phase 1：facade API + pub-sub channel + 2 metric label spec
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V12 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（4 US 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**外** rust-api + outer、0 base-web 改動：

```text
rust-api/                                            # worktree、多段 commit
├── server/
│   ├── api/src/admin/
│   │   └── sys_system_manage_api.rs                # add/update_user_for_systemmanage 改開 outer txn (US4)
│   ├── core/src/sign/
│   │   └── mod.rs                                  # 新加 pub async fn clear_all_keys (US2 / FR-006)
│   ├── global/
│   │   ├── Cargo.toml                              # 既有（044 已加 metrics dep）；不動
│   │   └── src/
│   │       ├── api_key_notify.rs                   # 新檔：notify_api_key_changed + API_KEY_INVALIDATE_CHANNEL const (US2 / FR-004)
│   │       └── lib.rs                              # + pub mod api_key_notify
│   ├── initialize/
│   │   ├── src/
│   │   │   ├── api_key_sync_initialization.rs      # 新檔：spawn_api_key_sync_subscriber + run_subscription + reload_api_keys (US2 / FR-005)
│   │   │   ├── lib.rs                              # + mod + pub use
│   │   │   └── metrics_init.rs                     # + 2 新 metric pre-declare (US2 / FR-010)
│   ├── model/src/admin/facade/
│   │   └── sys_endpoint.rs                         # 加 upsert_with_audit + batch_soft_delete_with_audit + BatchDeletePolicy + BatchDeleteResult (US1+US3 / FR-001+002)
│   ├── service/src/admin/
│   │   ├── sys_access_key_service.rs               # delete_access_key 拿掉 remove_key 兩行 + 加 notify_api_key_changed (US2 / FR-007)
│   │   ├── sys_endpoint_service.rs                 # sync_endpoints + batch_remove_endpoints 改走 facade、移除內部 upsert helper (US1+US3 / FR-003)
│   │   └── sys_user_service.rs                     # trait 加 3 個 *_in_txn 雙生方法 + impl (US4 / FR-008)
│   └── bin/src/
│       └── main.rs                                 # 加 spawn_api_key_sync_subscriber() 呼叫 (US2 / FR-011)

outer/                                              # rev1-admin-root、單段 commit per logical 變動
├── docs/INTEGRATION-CHECKLIST.md                   # 移 follow-up 4 row + 加 045 entry (FR-014)
└── CLAUDE.md                                        # SPECKIT marker 區指向 045 plan.md
```

**Structure Decision**：
- **rust-api worktree commits**：多段（estimated 5-7 commits、按 US topic 分；US1+US3 facade fill 可合一 commit、US2 / US4 各自一段）
- **outer rev1-admin-root commits**：少段（rust-api SHA pin bumps + INTEGRATION-CHECKLIST cleanup + SPECKIT marker + SHA backfill）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**rust-api worktree commits（estimated 5-7 個）**：

| Topic | est commits | files touched |
|---|---|---|
| US1+US3 facade fill | 1-2 | facade/sys_endpoint.rs + service/sys_endpoint_service.rs |
| US2 pub-sub infra（notify + subscriber + clear_all_keys + delete refactor） | 2-3 | global/api_key_notify.rs (new) + initialize/api_key_sync_initialization.rs (new) + core/sign/mod.rs + service/sys_access_key_service.rs + lib.rs × 2 + main.rs + metrics_init.rs |
| US4 *_in_txn 雙生方法 | 1 | service/sys_user_service.rs (trait + impl) + api/sys_system_manage_api.rs (2 handler) |
| metric pre-declare | 1 | metrics_init.rs（合 US2 commit OK） |

**Outer rev1-admin-root commits（estimated 4-6 個）**：

| Topic | est commits | files touched |
|---|---|---|
| rust-api SHA pin bumps（per logical 改動） | 3-4 | base-web/rust-api gitlink |
| INTEGRATION-CHECKLIST cleanup | 1 | docs/INTEGRATION-CHECKLIST.md |
| CLAUDE.md SPECKIT marker | 1 | CLAUDE.md |
| SHA backfill (post-merge) | 1 | docs/INTEGRATION-CHECKLIST.md |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：`server_core::sign::clear_all_keys` 命名拍板（vs `replace_keys` / `clear_validator_keys`）
- **R-2**：`spawn_api_key_sync_subscriber` 與 `initialize_access_key` 啟動順序（subscriber-first vs init-first；idempotent 兩者都 OK、拍板 subscriber-first）
- **R-3**：F3-N1 `upsert_with_audit` before-snapshot lookup key（grep schema 確認 sys_endpoint unique constraint = `id` PRIMARY KEY；`(path, method)` 為 logical key、需 grep entity）
- **R-4**：trait fn 簽名 lifetime / Send bound（async_trait 0.1 + sea-orm 0.12 互動、`&DatabaseTransaction` 是否需 `<'a>` lifetime）
- **R-5**：C-V5 / SC-004 500ms timing threshold 拍板（grep redis publish round-trip latency 預期值、決定是否需要 micro-adjust）
- **R-6**：既有 `server_core::sign::remove_key` API surface（驗 internal validator HashMap 結構、確認 clear_all 可 wrap）
- **R-7**：`audit_log::write_in_txn` 既有 signature 確認（trait fn 接 `&txn` 是否 compatible with `&DatabaseTransaction` ref？）

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：facade API 簽名表 + pub-sub channel spec + 2 metric label spec + 4 US 落點 file:line table
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V12 acceptance commands（grep + curl + psql + redis-cli + prometheus query 混合）
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（4 US 落地步驟 + 多段式 commit + merge 順序）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）
- contracts/verification-commands.md 引入 12 個 C-V、全為 acceptance 驗證手段、不引入新 functional path / 新 schema
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

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 40-55 tasks（中型 pass、規模與 041 / 043 對齊）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
