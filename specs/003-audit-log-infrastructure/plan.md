# Implementation Plan: F2.1 — audit-log-infrastructure

**Branch**: `003-audit-log-infrastructure` | **Date**: 2026-05-14 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from [`spec.md`](./spec.md)

## Summary

F2.1 = rust admin 全 write 操作（INSERT / UPDATE / SOFT_DELETE / RESTORE）走**單一 audit context API**、業務 + audit 必同 transaction、`sys_operation_log` schema 擴 4 個結構化欄位（`operation` enum + `entity_id` + `payload_before` / `payload_after` JSONB）、敏感欄位透過 `AuditSerialize` trait 自動 redact、HTTP middleware audit 整合同一 context（雙寫 row、middleware 不 dedupe、per clarify Q1）、新增 CI lint 守 service 內 INSERT/UPDATE 必有 audit 呼叫。技術手段：(1) 1 個 sea-orm migration 加 4 新欄；(2) `server_core::web::audit` 擴 3 個型別（AuditOperation / AuditSource / AuditEvent struct）；(3) `server_model::admin::audit_serialize` 新模組 trait + 7 entity impls；(4) `server_model::admin::audit_log::write_in_txn` refactor 接 AuditEvent；(5) F3 既有 facade 7 個 soft_delete_by_id + restore_by_id 內部 refactor 走 AuditEvent；(6) 7 admin entity service create_/update_ handler 透過 transaction 寫 audit、actor 透傳；(7) 7 admin api create_/update_ handler 加 Actor::from(&user)；(8) operation_log_middleware refactor 走 audit_log::write_in_txn（source=Http）；(9) ci-audit-coverage-lint.sh + GitHub Actions workflow。

## Technical Context

**Language/Version**: Rust（rust-api 既定 toolchain、edition 各 crate 既定、與 F3/F4 同 1.86.0 toolchain）
**Primary Dependencies**: sea-orm + sea-orm-migration（既有；JSONB column 透過 sea_orm::JsonValue）、axum（既有、HTTP middleware）、serde + serde_json（既有、audit_snapshot serialization）、tokio + chrono + ulid（既有）— **F2.1 不引入新 crate**
**Storage**: PostgreSQL（既有；F2.1 動 sys_operation_log 1 表加 4 欄、無新表）
**Testing**: cargo test — F2.1 需 Sea-ORM live DB integration test（驗 audit row 寫入 + transaction rollback + payload serialize + redaction）；複用 F3 既有 test infrastructure（`server/model/tests/common/mod.rs` + `TEST_DATABASE_URL` env + `#[ignore]` opt-in）
**Target Platform**: docker container（per [`DESIGN-W`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)）
**Project Type**: web-service（rust-api 為 axum HTTP service、F2.1 改動範圍純 rust 側 + 1 migration、不動 base / nestjs / nginx）
**Performance Goals**: N/A（每筆業務寫操作多 1 個 INSERT audit row、admin-heavy 低 throughput 場景可接受 2N 寫入量、per Constitution §II rationale）
**Constraints**:
- 業務 + audit MUST 同 transaction（Constitution §II + spec FR-007）
- audit 寫失敗即整體 rollback（spec FR-007 + Scenario 13）
- 敏感欄位（password / access_key_secret）MUST 經 AuditSerialize redaction（spec FR-008/009）
- HTTP + service-level audit 雙寫、middleware 不 dedupe（per clarify Q1、spec FR-014 + SC-006）
- entity_type Hybrid rule（per clarify Q2、spec FR-015）
- 既有 migration `datas/*` seeding INSERT exempt（per clarify Q3、spec Edge Cases）
- CI lint 守 service create_/update_ method（spec FR-016）
**Scale/Scope**: 1 schema migration + 3 new types in server-core::web::audit + 1 new audit_serialize 模組（7 trait impls）+ 1 refactor of write_in_txn + 7 facade refactor + ~14 service callsite migration + 1 middleware refactor + 1 CI lint script

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Phase 0 Pre-check（基於 spec.md 設計意圖）

| Principle | F2.1 影響 | 評估 | 註 |
|---|---|---|---|
| **I. RBAC Fail-safe** | F2.1 不動 Casbin enforcement | ✅ N/A | audit 為觀察機制、與 access control 解耦 |
| **II. Soft Delete + 全域 Audit** | F2.1 是此 principle 的核心 implementation — INSERT/UPDATE/SOFT_DELETE/RESTORE 全進 audit、同 transaction、永不 soft delete audit 表自身 | ✅ Direct compliance | spec FR-001~023 全對應 §II 條文；HARD_DELETE 留 F12 cleanup-job（per §II "cleanup 自身也寫 audit"）|
| **III. 嚴版禁 Forward + 單一職責** | F2.1 純 rust 內部（server-core / server-model / server-service / server-middleware / server-api）、不涉跨服務 | ✅ N/A | |
| **IV. base 不改動邊界** | F2.1 不動 base-web 任何檔（spec Scope summary 明示） | ✅ Compliant | |
| **V. 漸進收縮** | F2.1 是 rust 側單服務基礎建設、A/B 兩軌都通用；nestjs 退場時 F2.1 audit infrastructure zero 改動 | ✅ Compliant | |

### 架構約束（Architectural Constraints）

| 約束 | F2.1 影響 | 評估 |
|---|---|---|
| 部署形態（docker compose） | F2.1 不涉部署 | ✅ N/A |
| DB（PostgreSQL） | F2.1 動 1 表 schema (sys_operation_log 加 4 欄)、rust 主導 migration | ✅ Compliant |
| 快取與 pub-sub（redis） | F2.1 不涉（outbox + pub-sub 留 F2.2） | ✅ N/A |
| TLS | F2.1 不涉 | ✅ N/A |
| Secret 注入 | F2.1 不涉 | ✅ N/A |
| DB migration trigger | F2.1 加 1 個 migration 檔、跟既有 sea-orm-migration init container 模式整合 | ✅ Compliant |
| Port 規劃 | F2.1 不涉 | ✅ N/A |
| Observability | F2.1 sys_operation_log 4 新欄正是 observability 強化（per Constitution §II + Architectural §Observability）| ✅ Direct compliance |
| 結構化 log | 既有 JSON log 機制涵蓋；F2.1 audit_log helper 可選 `tracing::info!` emit | ✅ Compliant |
| Backup / 背景工作 / CI/CD | F2.1 加 CI lint step（per spec FR-016/017）| ✅ Compliant |

### 開發流程

| 流程 | F2.1 對齊 | 評估 |
|---|---|---|
| spec-kit 流程紀律 | specify → clarify → plan → tasks/implement 接續（clarify 已跑、3 個 Q&A 拍板） | ✅ Compliant |
| 兩段式 commit | F2.1 implementation 階段：rust-api worktree commit + push fork、outer 在 `003-audit-log-infrastructure` feature branch 更新 SHA pin（per CLAUDE.md §6.1） | ✅ Planned |
| Commit message 規範 | Conventional Commits 中文 subject + Co-Authored-By trailer | ✅ Planned |
| Push 確認紀律 | 所有 push 等 user 同意 | ✅ Planned |
| DESIGN 文件權威 | spec.md 已引用 DESIGN-A §1.5 / §5.2.1 / §6.1 F2 | ✅ Compliant |

**Phase 0 Gate 結論**：✅ **All gates pass、無 violation、Complexity Tracking 表免填**。

### Phase 1 Post-check（基於 data-model.md / contracts/ 設計後）

設計層產物未引入新 violation：
- data-model.md 範圍純 schema 擴充（4 欄）+ Rust trait + enum + struct 新增（非 breaking change for F3 callsite by 過渡 `From<&AuditEvent> for AuditLogCtx` shim）
- contracts/internal-api.md 純 Rust API 層的契約（trait + struct + audit_log fn signature）；不涉 HTTP endpoint 變動
- quickstart.md 用既有 Soybean/123456 帳號（per CLAUDE.md §5.1）+ admin 手動 CRUD + curl + psql 驗證 audit row

✅ **Post-design Gate pass**。

## Project Structure

### Documentation (this feature)

```text
specs/003-audit-log-infrastructure/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出（feature spec、含 brainstorming + clarify 雙階段 Clarifications）
├── research.md          # /speckit-plan Phase 0 產出（R1~R7 decisions）
├── data-model.md        # /speckit-plan Phase 1 產出（schema / trait / enum / struct 詳細）
├── quickstart.md        # /speckit-plan Phase 1 產出（驗證 F2.1 跑通流程）
├── contracts/
│   └── internal-api.md  # /speckit-plan Phase 1 產出（trait + struct + audit_log Rust API 契約）
├── checklists/
│   └── requirements.md  # /speckit-specify 階段 quality checklist
└── tasks.md             # /speckit-tasks 產出（尚未建立）
```

### Source Code (repository root)

```text
fork260509-rev1/                                  # 外層 monorepo (feature branch: 003-audit-log-infrastructure)
├── rust-api/                                     # worktree (long-running branch: rev1-admin-rust-api)
│   ├── migration/src/schemas/
│   │   ├── m20260514_h_extend_sys_operation_log_audit_fields.rs  # NEW (4 columns ALTER + DROP)
│   │   └── mod.rs                                                # MODIFY (註冊新 migration)
│   ├── migration/src/lib.rs                                      # MODIFY (Migrator::migrations() append)
│   └── server/
│       ├── core/src/web/audit.rs                                 # MODIFY (擴 AuditOperation / AuditSource / AuditEvent + #[deprecated] AuditLogCtx + From shim)
│       ├── model/src/admin/
│       │   ├── audit_log.rs                                      # MODIFY (refactor write_in_txn 接 AuditEvent + 18+4 欄 mapping)
│       │   ├── audit_serialize.rs                                # NEW (AuditSerialize trait + 7 impls + audit_snapshot helper)
│       │   ├── entities/sys_operation_log.rs                     # MODIFY (Model 加 operation/entity_id/payload_before/payload_after 4 field)
│       │   ├── mod.rs                                            # MODIFY (pub mod audit_serialize;)
│       │   └── facade/                                           # MODIFY × 7 (refactor soft_delete_by_id + restore_by_id 走 AuditEvent)
│       │       ├── sys_user.rs                                   # MODIFY
│       │       ├── sys_role.rs                                   # MODIFY
│       │       ├── sys_menu.rs                                   # MODIFY (含 tree-cascade unchanged)
│       │       ├── sys_domain.rs                                 # MODIFY
│       │       ├── sys_organization.rs                           # MODIFY (含 tree-cascade unchanged)
│       │       ├── sys_endpoint.rs                               # MODIFY
│       │       └── sys_access_key.rs                             # MODIFY
│       ├── service/src/admin/                                    # MODIFY × 7 (create_/update_ handler migrate)
│       │   ├── sys_user_service.rs                               # MODIFY
│       │   ├── sys_role_service.rs                               # MODIFY
│       │   ├── sys_menu_service.rs                               # MODIFY
│       │   ├── sys_domain_service.rs                             # MODIFY
│       │   ├── sys_organization_service.rs                       # ? (audit 視 sync method 結構而定、plan 階段 task 列出)
│       │   ├── sys_endpoint_service.rs                           # MODIFY (sync_endpoints 內 insert/update 路徑加 audit)
│       │   └── sys_access_key_service.rs                         # MODIFY
│       ├── middleware/src/
│       │   └── operation_log_middleware.rs                       # MODIFY (refactor 走 audit_log::write_in_txn、entity_type Hybrid rule、不 dedupe)
│       └── api/src/admin/                                        # MODIFY × 5+ (create_/update_ handler 加 Extension<User> + Actor::from)
│           ├── sys_user_api.rs                                   # MODIFY
│           ├── sys_role_api.rs                                   # MODIFY
│           ├── sys_menu_api.rs                                   # MODIFY (既有 update 已 user; create_menu 已 user)
│           ├── sys_domain_api.rs                                 # MODIFY
│           └── sys_access_key_api.rs                             # MODIFY
└── rust-api/scripts/ci-audit-coverage-lint.sh                    # NEW (grep service create_/update_)
└── .github/workflows/ci-audit-coverage-lint.yml                  # NEW (GitHub Actions trigger script)
```

**Structure Decision**：F2.1 動 6 個 crate（migration / server-core / server-model / server-service / server-middleware / server-api），新增 1 個模組（`server/model/src/admin/audit_serialize.rs`）、refactor 1 個既有模組（`server/model/src/admin/audit_log.rs`）、擴 1 個既有模組（`server/core/src/web/audit.rs`）。F3 既有 facade 7 個內部 refactor 但 external signature 不變（per spec FR-022「F3 callsite 不需動」）。CI lint 第二條工具（F3 已建第一條 ci-soft-delete-lint）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

✅ **無 violation 需要 Complexity Tracking** — Phase 0 + Phase 1 Constitution Check 全 pass。

---

**Phase 0 / Phase 1 產物**：見同目錄 [`research.md`](./research.md)、[`data-model.md`](./data-model.md)、[`contracts/internal-api.md`](./contracts/internal-api.md)、[`quickstart.md`](./quickstart.md)。

**下一步**：執行 `/speckit-tasks` 產生 dependency-ordered tasks.md。
