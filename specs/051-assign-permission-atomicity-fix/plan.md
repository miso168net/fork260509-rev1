# Implementation Plan: 051 assign-permission-atomicity-fix

**Branch**: `051-assign-permission-atomicity-fix` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/051-assign-permission-atomicity-fix/spec.md`

## Summary

post-merge code review (specs 030~049 跑 `superpowers:requesting-code-review`) 衍生 R-row **038-R1 ⚠️ Critical** 的 dedicated sprint。`rust-api/server/service/src/admin/sys_authorization_service.rs::assign_permission` 原 split-txn pattern（Casbin policy 寫透過 enforcer auto-commit / audit 寫開另一 Sea-ORM txn）違反 Constitution Principle II「業務寫入 + audit 同 txn」NON-NEGOTIABLE 承諾、產生 silent grant 風險。

本 sprint impl fix 內容（per [brainstorm doc](../../docs/superpowers/051-feature-assign-permission-atomicity-fix.md) Q1+Q2+Q3 user 拍板）：

- **真 atomicity 走 impl 路徑**（Q1 拍板）：service fn 改寫為 single Sea-ORM `DatabaseTransaction`、`casbin_rule` INSERT/DELETE 與 `audit_log::write_in_txn` 同 commit 同 rollback
- **scope 限 `assign_permission` 單 fn**（Q2 拍板）：不抽 helper、不擴 cascade；`assign_routes` / `assign_users` 已 atomic（W-FW6 N3 / W-FW8 US2、050 不變動）
- **diff snapshot 走 Sea-ORM 讀 `casbin_rule`**（Q3 拍板）：txn 開頭 SELECT 既有 ptype='p' rows、與 incoming permissions 算 diff；與 037-R1 ptype='p'/'g' UPDATE 同骨架
- **enforcer in-memory reload via 既有 `notify_casbin_changed()` pub-sub**（W-F11 pattern）：commit 後廣播給所有 replica（含本機 subscriber）；eventual consistency ~10-50ms window 接受
- **trait signature drop `enforcer` param**：fix 後 service fn 不再用 enforcer、trait + impl + 2 handler callsite 同步調整
- **`sync_role_permissions` private fn 刪除**：fix 後 0 caller、整段清理
- **commit shape**：rust-api worktree 1 commit + outer 4-5 commit（Phase 0 audit / SHA pin / INTEGRATION-CHECKLIST + SPECKIT / SHA backfill；無 base-web 改動、無 outer infra）

> **Phase 命名對照**：plan.md 內「Phase 0 spike / Phase 1 impl / Phase 2 acceptance / Phase 3 cleanup」(brainstorm 4-phase) 對應 tasks.md 「Phase 1 Setup / Phase 2 Foundational skip / Phase 3 US1 / Phase 4 Polish」(spec-kit 5-phase)；語意一致、僅 prefix 不同。

## Technical Context

**Language/Version**：Rust 1.7x（rust-api 既有 toolchain）；無 TypeScript / base-web 改動

**Primary Dependencies**：
- 既有 rust-api：`sea-orm` / `casbin 2.10` / `axum 0.8` / `tracing` / `tokio`
- Sea-ORM entity `casbin_rule::Entity` 已 exposed at `rust-api/server/model/src/admin/entities/prelude.rs:4`、無需新 entity
- **0 新 cargo workspace dep / 0 新 schema migration / 0 新 endpoint / 0 base-web 改動**

**Storage**：既有 `casbin_rule` table（sea-orm-adapter 管理 schema、與 service 層 Sea-ORM entity 共享 row）；既有 `sys_operation_log` audit table（既有 audit_log::write_in_txn 寫入路徑、與 sys_audit_outbox drainer 既有 W-F12 pipeline）

**Testing**：
- Static：grep audit (per SC-007)
- Runtime acceptance：
  - C-V2 happy path: curl + 2× psql (`casbin_rule` row + `sys_operation_log` payload)
  - C-V3 ⭐ atomicity 反證: fault injection (test build 暫改 audit_log::write_in_txn 強制 Err) + psql diff
  - C-V4 W-F11 pub-sub reload: curl + log grep
  - C-V5 GeneralUser deny regression: curl
  - C-V6 clear-all E-4: curl + psql
  - C-V7 boundary verify: grep sync_role_permissions / enforcer signature / migration / base-web
- 無新 unit test（atomicity by acceptance C-V3 fault injection 定性證明、wiring/shape feature；對齊 050/049/046 acceptance-only 體例）

**Target Platform**：rust-api container（既有）；dev WSL2 + Docker Desktop

**Project Type**：軌道**外** spec-impl-fix（rust-api only、無 base-web 改動、無軌道相關 file）

**Performance Goals**：
- C-V2 happy path：curl roundtrip < 500ms（既有 rust-api baseline）
- atomicity rollback：fault injection 注入後 < 1 sec rollback + 反證 psql diff
- W-F11 pub-sub reload：commit → 本機 enforcer reload window ~10-50ms（既有 baseline、本 fix 不變）

**Constraints**：
- 限 `rust-api/server/service/src/admin/sys_authorization_service.rs` 主修改（per FR-001/FR-002/FR-003）
- 限 `rust-api/server/api/src/admin/sys_authentication_api.rs` + `sys_system_manage_api.rs` 各 1 line callsite 調整（per FR-003 trait signature drop）
- 0 schema migration、0 新 entity、0 新 workspace cargo dep（per FR-008）
- 0 base-web 改動（per FR-008、軌道外 feature）
- 0 Constitution amendment（fix 強化 Principle II 既有承諾、無需修文、per FR-008）

**Scale/Scope**：
- Phase 0 改動：0（pure research、無檔變）
- Phase 1 改動：rust-api 3 file（sys_authorization_service.rs ~+60/-78 / sys_authentication_api.rs -1 line / sys_system_manage_api.rs -1 line）
- Phase 2 改動：0（acceptance only）
- Phase 3 改動：INTEGRATION-CHECKLIST 8-row 微更新 ~5 line + 051 milestone +1 line + Current Focus update ~3 line + CLAUDE.md SPECKIT marker idle
- 總計 ~+62 / -80 line rust-api diff + ~10 line outer diff
- ~3-3.5 hr 落地（per brainstorm Section 8 估時）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.6.0**：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 0 動 Casbin enforcement model / RBAC 邏輯；本 fix 為 Casbin policy **寫 path** atomicity 升級、enforce semantics 完全不變；GeneralUser deny acceptance（C-V5）regression 保留。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log（NON-NEGOTIABLE）** | **本 fix 直接強化此 Principle**：把 split-txn（Casbin policy + audit 各自 commit）改為 single Sea-ORM txn（`casbin_rule` 寫與 `sys_operation_log` 寫同 commit）；先前 violation（W-FW8 US2 期間引入）收斂；audit completeness 完整保留。 | ✅ PASS（強化、不軟化） |
| **III. 嚴版禁 Forward + 單一職責** | 0 跨服務 HTTP 呼叫；`notify_casbin_changed()` 為 internal redis pub-sub（既有 W-F11、非業務 path）；無新 endpoint；無 nginx config 改動。 | ✅ PASS |
| **IV. base 不改動邊界** | 0 base-web 改動、軌道辨識為**軌道外**（無 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 範圍 file）；預設「base 不動」原則涵蓋、不行使任何受管例外。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 rust-api impl fix；強化 DESIGN-B 形態（Casbin write atomicity 紀律對齊 audit 紀律）。 | ✅ PASS |

**軌道辨識**（v1.6.0+、四選一）：

- **W-WEBUI 軌道**：0 命中
- **TS-Typing-Sync 軌道**：0 命中
- **TS-DepGraph-Hygiene 軌道**：0 命中
- **軌道外**：**全本 sprint**（rust-api `sys_authorization_service.rs` + 2 handler callsite + INTEGRATION-CHECKLIST cleanup）

**051 自己選擇**：**軌道外** feature（無 base-web 改動、無軌道紀律議題）。

**架構約束** 同步檢查：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 0 改動 log format / formatter
- §Observability「prometheus + grafana 為必要 stack」→ 0 新 metric pre-declare（既有 `casbin_enforcement_total` / `casbin_policy_cache_invalidate_total` 044 落地時已 instrument、本 fix 不變）
- §背景工作「outbox-worker 為 prod 必要」→ audit_log::write_in_txn 走既有 outbox-first pipeline（042 落地）、本 fix 不變

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**0 Constitution amendment**（fix 強化 Principle II 既有承諾、無需修文）。

## Project Structure

### Documentation (this feature)

```text
specs/051-assign-permission-atomicity-fix/
├── spec.md                # /speckit-specify 產出（FR-001~FR-010、SC-001~SC-009、無 NEEDS CLARIFICATION、checklist 16/16 PASS）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：CasbinRule Sea-ORM entity schema 對齊 + isolation level 確認 + W-F11 pub-sub 既有 pattern 確認 + C-V3 fault injection technique
├── data-model.md          # Phase 1：sys_authorization_service.rs 改寫 diff（assign_permission 改寫 / sync_role_permissions 刪除 / trait signature drop）+ 2 handler callsite 各 1 line
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V7 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（5 Phase 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**外**、純 rust-api（無 base-web、無 outer infra）：

```text
rust-api/                                                # worktree、單 commit
├── server/service/src/admin/
│   └── sys_authorization_service.rs                    # 改寫 assign_permission impl + 刪除 sync_role_permissions + trait signature drop enforcer param (FR-001/002/003)
└── server/api/src/admin/
    ├── sys_authentication_api.rs                        # callsite drop enforcer arg (line 152、FR-003)
    └── sys_system_manage_api.rs                         # callsite drop enforcer arg (line 554、FR-003)

outer/                                                   # rev1-admin-root、多 commit
├── docs/
│   └── INTEGRATION-CHECKLIST.md                        # 038-R1 row 移除 + 051 milestone + Current Focus + footnote (FR-010)
└── CLAUDE.md                                            # SPECKIT marker idle (FR-010)
```

**Structure Decision**：
- **rust-api worktree commits**：1 個（assign_permission atomicity fix bundled、3 file 同 commit）
- **base-web worktree commits**：0 個（軌道外 feature、0 base-web 改動）
- **outer rev1-admin-root commits**：4-5 個（rust-api SHA pin / INTEGRATION-CHECKLIST + SPECKIT / SHA backfill post-merge；無 base-web SHA pin、無 outer infra commit）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**rust-api worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| 051 assign_permission atomicity fix（038-R1 結案）| 1 commit | `server/service/src/admin/sys_authorization_service.rs` + `server/api/src/admin/sys_authentication_api.rs` + `server/api/src/admin/sys_system_manage_api.rs` |

**base-web worktree commits**：**0 個**（軌道外）

**Outer rev1-admin-root commits（estimated 4-5 個）**：

| Topic | est | files |
|---|---|---|
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST 038-R1 row 移除 + 051 entry + Current Focus update + CLAUDE.md SPECKIT marker idle | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| SHA backfill（post-merge）| 1 commit | `docs/INTEGRATION-CHECKLIST.md` 051 entry placeholder |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：`casbin_rule` Sea-ORM entity 與 sea-orm-adapter migration schema 對齊驗證（id i64 PK / ptype text / v0~v5 nullable text；entity 已在 prelude）
- **R-2**：Postgres `READ COMMITTED` isolation level 對 assign_permission 並發 race 的覆蓋度（多 caller 同 role+domain；判斷 `SELECT ... FOR UPDATE` 是否需要）
- **R-3**：既有 W-F11 `notify_casbin_changed()` + `spawn_casbin_sync_subscriber` pub-sub 體例 確認（本機 subscriber 也收 message、reload via enforcer.load_policy；不擴新機制）
- **R-4**：C-V3 fault injection technique 具體做法（暫改 audit_log::write_in_txn 強制 Err 路徑、test build only、acceptance 完成 revert；對齊 brainstorm doc Section 6 C-V3）
- **R-5**：endpoint_id ↔ (path, method) 反映表（path_method_to_id HashMap）為 audit payload 反映用、txn 開頭 SELECT 全 active sys_endpoint、與 W-FW8 既有 reverse-map 體例對齊

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：rust-api 3 file 完整 diff（assign_permission 改寫 ~+60 line / sync_role_permissions 刪除 ~-78 line / trait signature 改 1 line / 2 handler callsite 各 1 line）
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V7 acceptance commands
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（5 Phase 落地步驟）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation；Principle II 強化從 violation → fulfillment 收斂）
- contracts/verification-commands.md 引入 7 個 C-V、全為 acceptance 驗證手段、不引入新 functional path / 新 endpoint
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律）
- INTEGRATION-CHECKLIST cleanup（FR-010）為 plan 內已界定的後續、無爭議
- 0 Constitution amendment 需要、5/5 PASS 維持

**Constitution Check post-Phase 1（v1.6.0）：5/5 PASS、Complexity Tracking 仍空白、0 amendment**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 15-20 tasks：
- Phase 1 Setup (baseline verify) — 1-2 tasks
- Phase 3 US1 (rust-api impl + cargo check + commit) — 8-10 tasks
- Phase 5 Polish (SHA pin / INTEGRATION-CHECKLIST cleanup / acceptance C-V1~C-V7 / push / merge / backfill) — 6-8 tasks

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
