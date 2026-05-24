# Implementation Plan: 042 audit-outbox-and-http-mount

**Branch**: `042-audit-outbox-and-http-mount` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/042-audit-outbox-and-http-mount/spec.md`

## Summary

R3（regression 2026-05-24 撞到 HTTP middleware audit gap）+ F2.2（audit-log outbox + Redis subscriber TTL fallback）bundled = **新 `sys_audit_outbox` 表為單一 sink + background drainer 推 Redis Stream + sys_operation_log**。Pattern A unified outbox-first 架構（per brainstorm 拍板）。

技術 approach（per Phase 0 research）：
- **Migration**：新增 `sys_audit_outbox` 表（schemas/m20260524_e_*）；既有 sys_operation_log schema 0 改動、F2.1 callsite 0 改動。
- **`audit_log::write_in_txn` refactor**：caller API 不變、內部從直寫 sys_operation_log → 寫 `sys_audit_outbox`（audit_event_json JSONB）；030–040 features 全 callsite 0 改動。
- **`audit_log::write_outbox_for_http`** 新 helper：HTTP middleware 專用、自管 small txn、failure log warn。
- **`OperationLogLayer` mount**：改 `router_initialization.rs::apply_layers` 函式（macro_rules 內 + 3 直接 callsite 共 5 處）統一掛；移除 `sys_menu_route.rs:16` 既有 1 處 per-route mount（變冗餘）。
- **`audit_outbox_drainer`**：新 async task、tokio::spawn 在 `initialize/` 階段；`SELECT FOR UPDATE SKIP LOCKED` 模式保 W-F11 多 replica safe。
- **`audit_publisher.rs`** 新檔（沿 `casbin_notify.rs` 體例）：`XADD audit:events MAXLEN ~ 10000`、Cluster 模式 graceful skip。
- **URL→entity_type 規則 fix**：現行 listener 寫 `/api/sys-user` 等 stale 前綴；改 `/api/user`、`/api/role`、`/api/route`（per 041 發現）、加全 systemManage alias mapping。
- **event-channel 退役 HTTP audit**：移 `sys_operation_log_listener` event 註冊；保留 `auth_login_listener` / `jwt_created_listener` / `api_key_validate_listener` 等其他 listener。

## Technical Context

**Language/Version**：Rust 1.x（沿用 rust-api 既有；spec md edit 為純 markdown、無語言）
**Primary Dependencies**：
- `tower-http = "0.6"`（既有；trace + normalize-path 已開、不加新 feature）
- `axum = "0.8.4"`（既有；middleware mount 用既有 Layer trait）
- `redis = "0.27"`（既有；XADD via `redis::cmd("XADD")` 同 `casbin_notify.rs PUBLISH` 體例）
- `sea-orm`（既有；migration + entity）
- `tokio`（既有；background task spawn）
- 既有 `audit_log::write_in_txn` (`server/model/src/admin/audit_log.rs`)、`AuditEvent`/`AuditSource` (`server/core/src/web/audit.rs`)、`OperationLogContext` (`server/global/src/global.rs`)、`OperationLogLayer` (`server/core/src/web/operation_log.rs`)、`sys_operation_log_listener` (`server/service/src/admin/sys_operation_log_service.rs`)、`apply_layers` (`server/initialize/src/router_initialization.rs:41`)

**Storage**：
- 新 1 張表 `sys_audit_outbox`（schema migration、含 down 對稱）
- 既有 `sys_operation_log` schema 0 改動
- 0 其他 schema 改動（per FR-012 / SC-009）

**Testing**：
- Unit tests：URL→entity_type 規則 pure fn（無 DB）；drainer batch 處理 logic（可用 mock DatabaseConnection / mock Redis）
- Integration（`--ignored`、real PG + Redis）：drainer 一輪完整流程、多 replica SKIP LOCKED 不重複、Redis Stream XADD/XLEN/XREAD 行為
- 既有 G6 unit test `server/model/tests/audit_http_middleware.rs:7` 視 outbox refactor 後 update（target 改 sys_audit_outbox）
- E2E acceptance：[`contracts/verification-commands.md`](./contracts/verification-commands.md) C-V1~C-V11（curl + psql + redis-cli + grep）

**Target Platform**：Linux server（dev container 內 rust runtime）；prod 多 replica W-F11 場景

**Project Type**：Web service infrastructure（rust-api 後端 audit pipeline 強化）

**Performance Goals**：
- HTTP middleware audit fire-and-forget、response latency 增加 ≤ 1ms（SC-004、FR-007）
- Subscriber Redis stream 接收延遲中位數 ≤ 100ms、p95 ≤ 500ms（SC-005、dev stack）
- Drainer batch_size 100、sleep_interval 100ms、max_retry 5（default、yaml override）

**Constraints**：
- 0 base-web 改動（FR-012 / SC-009）
- 0 nestjs（F14 已退場、FR-012）
- 0 新 cargo crate dep（FR-012 / SC-009、Redis / tokio / sea-orm 既有）
- HTTP audit 失敗 = log warn 不影響 response（FR-008、spec 003 §13 Edge Case 既有紀律）
- Drainer 必須 W-F11 多 replica safe（FR-010、用 PG SKIP LOCKED）

**Scale/Scope**：
- rust-api 改：~8 既有檔 + 2 新檔（drainer + publisher）+ 1 新 migration = ~11 files
- 行數：~400–600 lines add/change
- 預估 implementer effort：3–5 天（含 spec/plan/acceptance + 多 replica 驗證 + 兩段式 commit）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | `OperationLogLayer` mount 在 `apply_layers` 之內、與既有 Casbin layer 屬同一 chain；Layer 順序：TraceLayer → RequestIdLayer → Casbin → ApiKey → JWT → ...；NormalizePathLayer 在更外層（per 041 落地）。新增 OperationLogLayer 不影響 Casbin enforce path、不繞 RBAC。Casbin 為唯一 enforcement、前端 0 改動。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | **強化** audit 完整性：HTTP middleware 補完 spec 003 C8 期望（雙視角 2 row）+ 0-loss outbox 保證 + R2 失敗登入 audit 自動結案。既有 service-level 同 txn 紀律不退化（FR-009）。 | ✅ PASS（improvement） |
| **III. 嚴版禁 Forward + 單一職責** | drainer 為 background task、不引 service-to-service HTTP；audit_publisher 寫 Redis 為 sink 模式（一方寫、其他 subscriber 讀、無 RPC）；nginx config 不動。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-012 / SC-009 / C-V10 verify）；本 feature **軌道外**、屬「預設原則」涵蓋、**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment。同 039/041 模式（軌道外 rust-only）。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；rust-only；DESIGN-B 形態無 base-web 改動、新增 sys_audit_outbox 1 表為 audit infra 強化、不引入新 endpoint / 新 API 對外契約。 | ✅ PASS |

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/042-audit-outbox-and-http-mount/
├── spec.md                # /speckit-specify 產出（已 commit 50cbe70）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0 grep + 假設驗證
├── data-model.md          # Phase 1 sys_audit_outbox schema
├── contracts/
│   └── verification-commands.md   # C-V1~C-V11
├── quickstart.md          # implementer 操作手冊（Step 1~8）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（17/17 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

本 feature 為 rust-api code edit + 1 新 migration + spec md edit；無新 source 結構。實際改動：

```text
rust-api/                                              # worktree、branch rev1-admin-rust-api
├── server/
│   ├── core/src/web/
│   │   └── operation_log.rs                          # middleware refactor: 改 spawn 寫 outbox helper、移除 fire event
│   ├── model/src/admin/
│   │   ├── audit_log.rs                              # write_in_txn 內部目標改 sys_audit_outbox（API 不變）+ 新 write_outbox_for_http
│   │   └── entities/
│   │       ├── mod.rs                                # +1 line pub mod sys_audit_outbox
│   │       ├── prelude.rs                            # +1 line re-export
│   │       └── sys_audit_outbox.rs                   # NEW: Sea-ORM entity
│   ├── service/src/admin/
│   │   ├── sys_audit_outbox_drainer.rs               # NEW: background drainer task
│   │   └── sys_operation_log_service.rs              # handle_operation_log_event URL→entity_type 規則 fix + 移除 listener 註冊
│   ├── global/src/
│   │   └── audit_publisher.rs                        # NEW: Redis XADD audit:events (沿 casbin_notify 體例)
│   ├── initialize/src/
│   │   ├── event_channel_initialization.rs          # 移除 sys_operation_log_listener event 註冊 + spawn drainer
│   │   └── router_initialization.rs                 # apply_layers 加 OperationLogLayer mount（5 處）
│   ├── router/src/admin/
│   │   └── sys_menu_route.rs                         # 移除既有 per-route OperationLogLayer mount（line 16）
│   └── resources/
│       └── application*.yaml                         # 新 audit_outbox section (batch_size/sleep_interval/max_retry)

rust-api/migration/src/
├── schemas/
│   ├── mod.rs                                        # +1 line register
│   └── m20260524_e_audit_outbox_table.rs            # NEW: sys_audit_outbox schema + down
└── lib.rs                                            # Migrator vec +1 line

specs/042-audit-outbox-and-http-mount/                # outer 追蹤（已建）
├── spec.md / plan.md / research.md / data-model.md / quickstart.md / contracts/ / checklists/

docs/
└── INTEGRATION-CHECKLIST.md                          # 移除 R2 + R3 row、移除 F2.2 row、加 042 entry（post-merge、FR-013）
```

**Structure Decision**：
- 新 1 個 migration 檔（schemas/m20260524_e_audit_outbox_table.rs；datas/ 不需要、outbox 起始為空）
- 新 1 個 entity 檔（model/entities/sys_audit_outbox.rs）+ mod.rs 與 prelude.rs 各 +1 line
- 新 1 個 drainer 檔（service/admin/sys_audit_outbox_drainer.rs）
- 新 1 個 publisher 檔（global/audit_publisher.rs）
- 改 5 既有檔（operation_log.rs 中度改 / audit_log.rs 中度改 + 新 helper / event_channel_initialization.rs 中度改 / router_initialization.rs apply_layers 改 / sys_operation_log_service.rs URL prefix 規則 + remove 部分 / sys_menu_route.rs 1 line / application*.yaml +N line）
- 整體 ~11 files、~400-600 lines

worktree + submodule SHA pin 兩段式 commit（per [`CLAUDE.md §4.1`](../../CLAUDE.md)）。

### Two-stage commit shape（依 CLAUDE.md §4.1）

- **第一段（rust-api worktree、branch `rev1-admin-rust-api`）**：1 commit
  - `feat(rust-api): audit outbox + HTTP middleware audit mount (042 R3+F2.2)`
  - Files: rust-api 內 ~11 files
- **第二段（outer rev1-admin-root、feature branch `042-audit-outbox-and-http-mount`）**：1 commit
  - `chore(submodule): bump rust-api to <SHA> — 042 audit-outbox-and-http-mount`
  - Files: rust-api SHA pin + `docs/INTEGRATION-CHECKLIST.md`（移 R2/R3 row + 042 entry）
- **Merge 回 default**：`git merge --no-ff 042-audit-outbox-and-http-mount` to `rev1-admin-root`、user 同意後 push

詳見 [`quickstart.md`](./quickstart.md) Step 7。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：既有 `audit_log::write_in_txn` signature 確認；refactor 為內部目標改 outbox、caller API 不變
- **R-2**：`OperationLogContext` 完整 fields 確認；middleware 既有 logic 直接可重用、只改 event-fire 為 outbox-write
- **R-3**：`apply_layers` 5 callsite + macro_rules 結構確認；mount point 確定
- **R-4**：`sys_operation_log` entity schema 完整列；outbox JSONB 序列化 `AuditEvent` 後可直接 INSERT 至 sys_operation_log
- **R-5**：`casbin_notify.rs` fire-and-forget + cluster skip pattern 為 `audit_publisher.rs` template
- **R-6**：systemManage alias 完整 endpoint 清單 + entity_type 對應 table
- **R-7**：migration naming 慣例（m20260524_e_*）+ Migrator vec register pattern
- **R-8**：config 結構（application.yaml）新增 `audit_outbox:` section pattern

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：`sys_audit_outbox` schema 完整 + state transition + interaction with sys_operation_log + URL→entity_type 完整 table
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：11 個 C-V（C-V1 build / C-V2 migration / C-V3 雙視角 row / C-V4 mount 涵蓋 / C-V5 drainer 啟動 / C-V6 Redis stream / C-V7 multi-replica SKIP LOCKED / C-V8 Redis 暫停 / C-V9 URL→entity_type / C-V10 scope / C-V11 R2 結案）
- [`quickstart.md`](./quickstart.md)：8-step implementer 手冊（migration / helper refactor / mount / drainer / publisher / acceptance / two-stage commit / backlog cleanup）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）
- contracts/verification-commands.md 引入 11 C-V、但全為 acceptance 驗證手段、不引入新功能 / 新 path / 新 schema（除 sys_audit_outbox 為 audit infra 內部表）
- quickstart.md 內 commit shape 明確兩段式（符合 §4.1 紀律）
- backlog cleanup（FR-013）為 plan 內已界定的後續、無爭議

**Constitution Check post-Phase 1：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`，將 spec FR-001~FR-014 + quickstart Step 1~8 拆成 implement units（每個有 T-NN 編號、user story mapping、dependencies、parallel marker）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
