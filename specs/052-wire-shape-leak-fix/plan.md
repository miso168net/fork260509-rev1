# Implementation Plan: 052 wire-shape-leak-fix

**Branch**: `052-wire-shape-leak-fix` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/052-wire-shape-leak-fix/spec.md`

## Summary

post-merge code review (specs 030~049 跑 `superpowers:requesting-code-review`) 衍生 R-row **039-R1 ⚠️ Critical** 的 dedicated sprint。4 個 endpoint 仍 serialize raw entity Model 直送 wire（同時暴露 `id: ULID-string` + `display_id: i64` + `deleted_at` 等 internal SoT 欄位）；違反「rust internal SoT 表示 ≠ wire shape」紀律（039 X1 雙欄設計核心）。

本 sprint impl fix 內容（per [brainstorm doc](../../docs/superpowers/052-feature-wire-shape-leak-fix.md) Q1+Q2+Q3 user 拍板）：

- **scope 縮在 CHECKLIST 4 endpoint**（Q1 拍板）：(a) `GET /org` / (b) `POST /systemManage/addRole` / (c) `POST /systemManage/updateRole` / (d) `GET /endpoint/page`；其餘 sys_* entity 若 grep 發現新漏登 follow-up、不本 sprint 包
- **DTO 命名混合策略**（Q2 拍板）：(a)(d) raw API namespace 新加 `OrganizationDetail` / `EndpointDetail`（對齊 040 D-pattern sibling Detail 體例）；(b)(c) systemManage namespace 改 reuse 既成 `SystemManageRoleOutput`（minimum diff aligned with precedent、`From<sys_role::Model>` impl 已備、0 DTO 新增）
- **acceptance + CDP browser smoke**（Q3 拍板）：curl + jq C-V2~C-V5 + CDP smoke C-V6 base-web role-list regression（reassurance、防 040 critical bug 重演）+ grep boundary C-V7
- **internal SoT 全保留**：Sea-ORM Model 0 改動、audit_log payload + JWT claim + Casbin policy + FK schema 全保持以 ULID 為 internal SoT；本 fix 只影響 wire serialize path
- **commit shape**：rust-api worktree 1 commit + outer 3-4 commit（SHA pin / INTEGRATION-CHECKLIST + SPECKIT / SHA backfill；無 base-web 改動、無 outer infra）

> **Phase 命名對照**：plan.md 內「Phase 0 research / Phase 1 design+contracts / Phase 2 acceptance / Phase 3 polish」(brainstorm 4-phase) 對應 tasks.md 「Phase 1 Setup / Phase 2 Foundational skip / Phase 3 US1 / Phase 5 Polish」(spec-kit 5-phase)；語意一致、僅 prefix 不同。

## Technical Context

**Language/Version**：Rust 1.86（rust-api 既有 toolchain）；無 TypeScript / base-web 改動

**Primary Dependencies**：
- 既有 rust-api：`sea-orm` / `axum 0.8` / `serde` / `chrono` / `tracing`
- Sea-ORM entity（`sys_organization::Model` / `sys_endpoint::Model` / `sys_role::Model`）已備、無需新 entity
- `server_core::web::page::PaginatedData` 既有 `.map(F)` helper（040 D5 用過）為 paginated rows 套 transform
- 既成 `SystemManageRoleOutput` + `From<sys_role::Model>` impl @ `output/sys_system_manage.rs`、0 改動 reuse
- **0 新 cargo workspace dep / 0 新 schema migration / 0 新 endpoint / 0 base-web 改動**

**Storage**：既有 `sys_organization` / `sys_endpoint` / `sys_role` table（Sea-ORM migration 管理、本 sprint 0 改動）

**Testing**：
- Static：grep audit (per SC-007)
- Runtime acceptance：
  - C-V2 GET /org wire shape: curl + jq response shape inspect
  - C-V3 POST /systemManage/addRole wire shape: curl + jq + cleanup
  - C-V4 POST /systemManage/updateRole wire shape: curl + jq + cleanup
  - C-V5 GET /endpoint/page wire shape: curl + jq
  - C-V6 CDP browser smoke: base-web role-list 新增 + 編輯 regression (per memory `reference_cdp_smoke_technique.md`)
  - C-V7 boundary verify: grep `Res<SysRoleModel>` / `PaginatedData<SysOrganizationModel>` / `PaginatedData<SysEndpointModel>` 0 hit + migration + base-web + Constitution + cargo dep 0 diff
- 無新 unit test（wire shape 收斂屬 wiring/shape feature、無新純函式邏輯；對齊 051/050/049/046 acceptance-only 體例、CLAUDE.md §3 TDD 例外條款）

**Target Platform**：rust-api container（既有）；dev WSL2 + Docker Desktop

**Project Type**：軌道**外** spec-impl-fix（rust-api only、無 base-web 改動、無軌道相關 file）

**Performance Goals**：
- C-V2~C-V5 curl roundtrip < 500ms（既有 rust-api baseline）
- 本 fix 對 wire transform overhead < 1ms（純 stack-local From::from 映射、無 allocation explosion）
- 0 latency regression for base-web（base-web 0 binds response shape、wire 改變不影響 base-web behavior）

**Constraints**：
- 限 `rust-api/server/api/src/admin/sys_organization_api.rs:12` + `sys_endpoint_api.rs:16` + `sys_system_manage_api.rs:285` + `sys_system_manage_api.rs:305` 4 handler return type / body
- 新增 2 file：`rust-api/server/model/src/admin/output/sys_organization.rs` + `output/sys_endpoint.rs`
- 改 2 mod 暴露：`output/mod.rs` + `service/admin/mod.rs`（re-export per 040 體例）
- 0 schema migration、0 新 entity、0 新 workspace cargo dep（per FR-008）
- 0 base-web 改動（per FR-008、軌道外 feature）
- 0 Constitution amendment（軌道外、純 wire 收斂、無新原則、per FR-008）

**Scale/Scope**：
- Phase 0 改動：0（pure research、無檔變）
- Phase 1 改動：rust-api 6 file（1 新 DTO file `output/sys_organization.rs` + 1 既有檔擴 `output/sys_endpoint.rs` 加 EndpointDetail + 1 mod re-wire `output/mod.rs` + 3 handler 檔 4 handler 改點：`sys_organization_api.rs` / `sys_endpoint_api.rs` / `sys_system_manage_api.rs` 含 2 handler 同檔；`service/admin/mod.rs` 0 改動因 wildcard re-export）
- Phase 2 改動：0（acceptance only）
- Phase 3 改動：INTEGRATION-CHECKLIST 8-row 微更新 ~5 line + 052 milestone +1 line + Current Focus update ~3 line + CLAUDE.md SPECKIT marker idle
- 總計 ~+79 line rust-api diff + ~+10 line outer diff
- ~2.5 hr 落地（per brainstorm Section 7 估時）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.6.0**：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 0 動 Casbin enforcement model / 0 動 RBAC 邏輯（純 wire shape）；4 endpoint 既有 Casbin auth 路徑不變、GeneralUser deny / Soybean allow regression 保持。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log（NON-NEGOTIABLE）** | 0 動 audit_log path（`OrganizationDetail` / `EndpointDetail` 不含 `deletedAt` 是 wire 隱私紀律、internal soft-delete forensics 不變）；`audit_log::write_in_txn` 0 改動；既有 audit chain (sys_audit_outbox → drainer → sys_operation_log) 0 改動。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 0 跨服務 HTTP 呼叫；0 新 endpoint；4 個 endpoint route 不動、只動 handler return type；無 nginx config 改動。 | ✅ PASS |
| **IV. base 不改動邊界** | 0 base-web 改動、軌道辨識為**軌道外**（無 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 範圍 file）；預設「base 不動」原則涵蓋、不行使任何受管例外。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 rust-api wire DTO 對齊；強化 DESIGN-B 形態（wire shape 紀律對齊 040 D-pattern）。 | ✅ PASS |

**軌道辨識義務**（v1.6.0+、四選一）：

- **W-WEBUI 軌道**：0 命中
- **TS-Typing-Sync 軌道**：0 命中
- **TS-DepGraph-Hygiene 軌道**：0 命中
- **軌道外**：**全本 sprint**（rust-api 4 handler + 2 新 output file + 2 mod re-export + INTEGRATION-CHECKLIST cleanup）

**052 自己選擇**：**軌道外** feature（無 base-web 改動、無軌道紀律議題）。

**架構約束** 同步檢查：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 0 改動 log format / formatter
- §Observability「prometheus + grafana 為必要 stack」→ 0 新 metric pre-declare（既有 8 業務 metric 044 落地時已 instrument、本 fix 不變）
- §背景工作「outbox-worker 為 prod 必要」→ audit_log::write_in_txn 0 改動、走既有 outbox-first pipeline、本 fix 不變

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**0 Constitution amendment**（軌道外、純 wire 收斂、無新原則）。

## Project Structure

### Documentation (this feature)

```text
specs/052-wire-shape-leak-fix/
├── spec.md                # /speckit-specify 產出（FR-001~FR-010、SC-001~SC-009、無 NEEDS CLARIFICATION、checklist 16/16 PASS）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：040 D-pattern 既有體例 spike + entity Model schema 對齊 + base-web 0 binds grep audit + CDP smoke 體例
├── data-model.md          # Phase 1：rust-api 6 file 完整 diff（4 handler 改點分布 3 檔 + 2 output DTO 含 1 新 1 擴 + 1 output/mod.rs）
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
rust-api/                                                       # worktree、單 commit
├── server/model/src/admin/
│   ├── output/
│   │   ├── sys_organization.rs                                 # **新檔**：OrganizationDetail struct + From<sys_organization::Model> impl (FR-005)
│   │   ├── sys_endpoint.rs                                     # **既有檔擴**（已含 EndpointTree/EndpointTreeNode）：加 EndpointDetail struct + From<sys_endpoint::Model> impl (FR-006)
│   │   └── mod.rs                                              # `mod sys_*;` private + selective `pub use sys_*::Type;` 體例：改 sys_endpoint pub use list 加 EndpointDetail + 加 `mod sys_organization;` + 加 `pub use sys_organization::OrganizationDetail;` (FR-007)
│   └── (entities/sys_organization.rs + sys_endpoint.rs + sys_role.rs 0 改動)
├── server/service/src/admin/
│   └── mod.rs                                                  # **0 改動**（既有 `pub use server_model::admin::output::*;` wildcard re-export 自動暴露 output/mod.rs 內新加的 OrganizationDetail / EndpointDetail、per FR-007）
└── server/api/src/admin/
    ├── sys_organization_api.rs                                 # get_paginated_organizations return type + .map (FR-001)
    ├── sys_endpoint_api.rs                                     # get_paginated_endpoints return type + .map (FR-004)
    └── sys_system_manage_api.rs                                # add_role_for_systemmanage + update_role_for_systemmanage return type + .map (FR-002 + FR-003)

outer/                                                          # rev1-admin-root、多 commit
├── docs/
│   └── INTEGRATION-CHECKLIST.md                                # 039-R1 row 移除 + 052 milestone + Current Focus + footnote (FR-010)
└── CLAUDE.md                                                    # SPECKIT marker idle (FR-010)
```

**Structure Decision**：
- **rust-api worktree commits**：1 個（4 endpoint wire DTO wrap bundled、6 file 同 commit；sys_system_manage_api.rs 含 2 handler 同檔改點）
- **base-web worktree commits**：0 個（軌道外 feature、0 base-web 改動）
- **outer rev1-admin-root commits**：3-4 個（rust-api SHA pin / INTEGRATION-CHECKLIST + SPECKIT / SHA backfill post-merge；無 base-web SHA pin、無 outer infra commit）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**rust-api worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| 052 wire-shape-leak-fix（039-R1 結案）| 1 commit | 3 handler 檔 (4 handler 改點：sys_organization_api.rs / sys_endpoint_api.rs / sys_system_manage_api.rs 含 2 handler 同檔) + 2 output DTO 檔 (1 新 sys_organization.rs / 1 擴 sys_endpoint.rs) + 1 output/mod.rs re-wire = 6 file bundled；service/admin/mod.rs 0 改動 |

**base-web worktree commits**：**0 個**（軌道外）

**Outer rev1-admin-root commits（estimated 3-4 個）**：

| Topic | est | files |
|---|---|---|
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST 039-R1 row 移除 + 052 entry + Current Focus + CLAUDE.md SPECKIT marker idle | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| SHA backfill（post-merge）| 1 commit | `docs/INTEGRATION-CHECKLIST.md` 052 entry placeholder |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：040 D-pattern 既有體例 spike（`RoleDetail` / `UserDetail` / `AccessKeyDetail` 結構審視 + `From<Model>` impl + handler `.map(Detail::from)` wrap）— 確認本 sprint 對齊紀律
- **R-2**：`SysOrganizationModel` / `SysEndpointModel` schema 對齊（grep 確認 v0~v5 + `display_id` + `deleted_at` 既備、無 schema 改動需求）
- **R-3**：`SystemManageRoleOutput` 既成 + `From<sys_role::Model>` impl 既備（grep 確認位置 + 完整 9 欄位 mapping、本 sprint reuse 0 改動）
- **R-4**：`PaginatedData::map(F)` helper 既備（040 D5 spike 過、本 sprint reuse）
- **R-5**：base-web 0 binds 4 endpoint response shape 驗證（grep 確認 `fetchAddRole` / `fetchUpdateRole` 無 generic、`/org` + `/endpoint/page` base-web 0 hit）
- **R-6**：CDP smoke 體例可行性確認（per memory `reference_cdp_smoke_technique.md` + 037/038 既有 CDP smoke 體例）

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：rust-api 6 file 完整 diff（1 新 DTO + 1 擴 DTO + 1 output/mod.rs re-wire + 3 handler 檔 4 改點 return type + manual PaginatedData reconstruction / .map wrap）
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V7 acceptance commands
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（5 Phase 落地步驟）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation；軌道外、純 wire 收斂、internal SoT 保留）
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
- Phase 3 US1 (rust-api impl + cargo check + commit) — 7-9 tasks
- Phase 5 Polish (SHA pin / INTEGRATION-CHECKLIST cleanup / acceptance C-V1~C-V7 含 CDP smoke / push / merge / backfill) — 6-8 tasks

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
