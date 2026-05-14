# Implementation Plan: F3 — soft-delete-infrastructure

**Branch**: `002-soft-delete-infrastructure` | **Date**: 2026-05-14 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from [`spec.md`](./spec.md)

## Summary

F3 = rust admin 7 個業務 entity（user / role / menu / domain / organization / endpoint / access_key）改為軟刪、F3 一次性交付完整基礎建設 + 全 service code 一次性 migrate。技術手段：(1) 7 個 entity migration 加 `deleted_at TIMESTAMP NULL` + DROP 既有 UNIQUE constraint + CREATE 對應 partial UNIQUE INDEX `WHERE deleted_at IS NULL`；(2) `server_core::db::soft_delete` 新模組定義 `SoftDeletable` trait + 4 個 provided / required method；(3) `server_model::admin::facade::sys_<entity>` 7 個 facade module 故意不 re-export `Entity`、強制 service code 走 facade；(4) `server_core::web::audit::Actor` 結構 + 既有 `sys_operation_log_service` 擴增 transaction-aware `create_log_in_txn(txn, ctx)` method（既有 `handle_operation_log_event` 不動）；(5) sys_menu / sys_organization 軟刪前查 active children、≥1 即返 6003；(6) JWT subject 對應已軟刪 user 時返 8888；(7) CI grep lint 守 `use entities::sys_<entity>` 不出現在 `server/{service,api,router}/`。

## Technical Context

**Language/Version**: Rust（rust-api 既定 toolchain，cargo workspace、edition 由各 crate 既定）
**Primary Dependencies**: sea-orm + sea-orm-migration（既有、partial unique index 透過 `Index::create()...and_where()` 達成）、axum（既有、JWT middleware extension）、serde（既有、N/A 此 feature）、tokio（既有）— **F3 不引入新 crate**
**Storage**: PostgreSQL（既有、F3 動 7 表 schema：加 deleted_at column + 替換 UNIQUE constraint 為 partial unique index）
**Testing**: cargo test — F3 需 Sea-ORM live DB integration test（驗 partial unique / soft_delete + audit 同 transaction / restore 等）；可參考既有 `server/initialize/tests/` integration test 模式
**Target Platform**: docker container（per [`DESIGN-W`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)）
**Project Type**: web-service（rust-api 為 axum HTTP service、F3 改動範圍純 rust 側 + 新 migration、不動 base / nestjs / nginx）
**Performance Goals**: N/A（partial unique index 與 full unique index 在 active row 場景效能等價；軟刪只多 1 個 UPDATE 欄位；audit row 寫入既有路徑）
**Constraints**: 
- soft_delete + audit MUST 同 transaction（Constitution Principle II + spec FR-011）
- find_active 預設過濾 deleted_at IS NULL（Principle II + spec FR-007）
- facade module 不 re-export Entity → compile-time 封死誤用（spec FR-009）
- CI grep lint block PR merge（spec FR-017）
- sys_menu / sys_organization 軟刪前 active children check（spec FR-026）
- JWT subject 對應軟刪 user → 8888（spec FR-028）
**Scale/Scope**: 7 entity migration + 1 trait module + 7 facade modules + 1 Actor 結構 + 1 sys_operation_log_service 擴增 method + ~20-40 service callsite migration + 1 CI lint script

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Phase 0 Pre-check（基於 spec.md 設計意圖）

| Principle | F3 影響 | 評估 | 註 |
|---|---|---|---|
| **I. RBAC Fail-safe** | F3 不動 Casbin enforcement；FR-028 JWT + 軟刪 user 檢查不繞 Casbin、補在 enforcement 之前 | ✅ Compliant | Casbin 仍是唯一 access control 權威；F3 補的是 user 存在性 check |
| **II. Soft Delete + 全域 Audit** | F3 是此原則的**實作層** — 落實 deleted_at + scoped finder + transaction discipline + sys_operation_log 寫入 | ✅ Direct compliance | spec FR-001~012 + FR-020~022 全對應 Principle II 條文 |
| **III. 嚴版禁 Forward + 單一職責** | F3 純 rust 內部（server_core / server_model）、不涉跨服務 | ✅ N/A | |
| **IV. base 不改動邊界** | F3 不動 base-web 任何檔（spec Scope summary 明示） | ✅ Compliant | |
| **V. 漸進收縮** | F3 是 rust 側單服務基礎建設、A/B 兩軌都通用；nestjs 退場時 F3 helper zero 改動 | ✅ Compliant | |

### 架構約束（Architectural Constraints）

| 約束 | F3 影響 | 評估 |
|---|---|---|
| 部署形態（docker compose） | F3 不涉部署 | ✅ N/A |
| DB（PostgreSQL） | F3 動 7 表 schema、rust 主導 migration | ✅ Compliant |
| 快取與 pub-sub（redis） | F3 不涉 | ✅ N/A |
| TLS | F3 不涉 | ✅ N/A |
| Secret 注入 | F3 不涉 | ✅ N/A |
| DB migration trigger | F3 加 7 個 migration 檔、跟既有 sea-orm-migration init container 模式整合 | ✅ Compliant |
| Port 規劃 | F3 不涉 | ✅ N/A |
| Observability | F3 soft_delete/restore 寫 sys_operation_log（既有 audit infrastructure 涵蓋）| ✅ Compliant |
| 結構化 log | 既有 JSON log 機制涵蓋；F3 helper 可選擇是否額外 emit `tracing::info!` | ✅ Compliant |
| Backup / 背景工作 / CI/CD | F3 不涉 backup / cron job；F3 加 CI lint step（per FR-017）| ✅ Compliant |

### 開發流程

| 流程 | F3 對齊 | 評估 |
|---|---|---|
| spec-kit 流程紀律 | specify → clarify → plan → tasks/implement 接續 | ✅ Compliant |
| 兩段式 commit | F3 implementation 階段：rust-api worktree commit + push fork、outer 在 `002-soft-delete-infrastructure` feature branch 更新 SHA pin（per CLAUDE.md §6.1） | ✅ Planned |
| Commit message 規範 | Conventional Commits 中文 subject + Co-Authored-By trailer | ✅ Planned |
| Push 確認紀律 | 所有 push 等 user 同意 | ✅ Planned |
| DESIGN 文件權威 | spec.md 已引用 DESIGN-A §1.5 / §5.2.2 / §6.1 F3 | ✅ Compliant |

**Phase 0 Gate 結論**：✅ **All gates pass、無 violation、Complexity Tracking 表免填**。

### Phase 1 Post-check（基於 data-model.md / contracts/ 設計後）

設計層產物未引入新 violation：
- data-model.md 範圍純 wire-data-model + Rust trait + facade module + sys_operation_log_service 擴增 method（單一新增非 breaking change）
- contracts/internal-api.md 純 Rust API 層的契約（trait + facade）；不涉 HTTP endpoint 變動
- quickstart.md 用既有 Soybean/123456 帳號（per CLAUDE.md §5.1）+ admin 手動軟刪 + curl 驗證 8888 行為

✅ **Post-design Gate pass**。

## Project Structure

### Documentation (this feature)

```text
specs/002-soft-delete-infrastructure/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出（feature spec）
├── research.md          # /speckit-plan Phase 0 產出（R1~R7 decisions）
├── data-model.md        # /speckit-plan Phase 1 產出（trait / facade / migration 詳細）
├── quickstart.md        # /speckit-plan Phase 1 產出（驗證 F3 跑通流程）
├── contracts/
│   └── internal-api.md  # /speckit-plan Phase 1 產出（trait + facade Rust API 契約）
├── checklists/
│   └── requirements.md  # /speckit-specify 階段 quality checklist
└── tasks.md             # /speckit-tasks 產出（尚未建立）
```

### Source Code (repository root)

```text
fork260509-rev1/                                  # 外層 monorepo (feature branch: 002-soft-delete-infrastructure)
├── rust-api/                                     # worktree (long-running branch: rev1-admin-rust-api)
│   ├── migration/src/schemas/
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_user.rs           # NEW
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_role.rs           # NEW
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_menu.rs           # NEW
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_domain.rs         # NEW
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_organization.rs   # NEW
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_endpoint.rs       # NEW
│   │   ├── m20260514_xxx_add_soft_delete_to_sys_access_key.rs     # NEW
│   │   └── mod.rs                                                  # MODIFY (註冊 7 個新 migration)
│   └── server/
│       ├── core/src/
│       │   ├── db/                                                 # NEW module dir
│       │   │   ├── mod.rs                                          # NEW
│       │   │   └── soft_delete.rs                                  # NEW (SoftDeletable trait + 7 impl)
│       │   ├── web/
│       │   │   └── audit.rs                                        # NEW (Actor struct + From<&User>)
│       │   ├── web/mod.rs                                          # MODIFY (pub mod audit;)
│       │   └── lib.rs                                              # MODIFY (pub mod db;)
│       ├── model/src/admin/
│       │   ├── entities/
│       │   │   ├── sys_user.rs                                     # MODIFY (新增 deleted_at field + Column variant)
│       │   │   ├── sys_role.rs                                     # MODIFY (同上)
│       │   │   ├── sys_menu.rs                                     # MODIFY (同上)
│       │   │   ├── sys_domain.rs                                   # MODIFY (同上)
│       │   │   ├── sys_organization.rs                             # MODIFY (同上)
│       │   │   ├── sys_endpoint.rs                                 # MODIFY (同上)
│       │   │   └── sys_access_key.rs                               # MODIFY (同上)
│       │   ├── audit_log.rs                                        # NEW (F3 audit write_in_txn helper、per R6 + analyse C3 — 放 model 而非 service 避循環)
│       │   ├── facade/                                             # NEW module dir
│       │   │   ├── mod.rs                                          # NEW (pub mod sys_user; ...)
│       │   │   ├── sys_user.rs                                     # NEW (re-export 不含 Entity + 4 helper fn)
│       │   │   ├── sys_role.rs                                     # NEW
│       │   │   ├── sys_menu.rs                                     # NEW (含 tree-cascade FR-026 logic)
│       │   │   ├── sys_domain.rs                                   # NEW
│       │   │   ├── sys_organization.rs                             # NEW (含 tree-cascade FR-026 logic)
│       │   │   ├── sys_endpoint.rs                                 # NEW
│       │   │   └── sys_access_key.rs                               # NEW
│       │   └── mod.rs                                              # MODIFY (pub mod facade; + pub mod audit_log;)
│       ├── service/src/admin/
│       │   ├── sys_user_service.rs                                 # MODIFY (find→find_active、delete→soft_delete_by_id、import 改 facade)
│       │   ├── sys_role_service.rs                                 # MODIFY (同上)
│       │   ├── sys_menu_service.rs                                 # MODIFY (同上)
│       │   ├── sys_domain_service.rs                               # MODIFY (同上)
│       │   ├── sys_organization_service.rs                         # MODIFY (同上)
│       │   ├── sys_endpoint_service.rs                             # MODIFY (同上)
│       │   ├── sys_access_key_service.rs                           # MODIFY (同上)
│       │   ├── sys_auth_service.rs                                 # MODIFY (login 改 find_active、handle 軟刪 user case)
│       │   └── sys_operation_log_service.rs                        # 不動 (F3 不擴增 service；helper 移到 server-model::audit_log per analyse C3)
│       ├── api/src/admin/
│       │   ├── sys_user_api.rs                                     # MODIFY (delete handler 加 Actor::from(&user) 透傳)
│       │   ├── sys_role_api.rs                                     # MODIFY (同上)
│       │   ├── sys_menu_api.rs                                     # MODIFY (同上)
│       │   ├── sys_domain_api.rs                                   # MODIFY (同上)
│       │   ├── sys_organization_api.rs                             # MODIFY (同上)
│       │   ├── sys_endpoint_api.rs                                 # MODIFY (同上)
│       │   └── sys_access_key_api.rs                               # MODIFY (同上)
│       └── middleware/
│           ├── src/jwt.rs                                          # MODIFY (FR-028: token 驗證後加 sys_user::find_active check)
│           └── Cargo.toml                                          # MODIFY (加 server-model dep、per analyse C4 — jwt.rs 需用 facade)
└── .github/workflows/ci-soft-delete-lint.yml                       # NEW (GitHub Actions workflow、per R2)
    └ rust-api/scripts/ci-soft-delete-lint.sh                       # NEW (shell lint script、per R2)
```

**Structure Decision**：F3 動 3 個 crate（migration / server-core / server-model / server-service / server-api / server-middleware），新增 2 個模組目錄（`server/core/src/db/`、`server/model/src/admin/facade/`），新增 1 個 `Actor` 結構與 1 個 `SoftDeletable` trait，擴增 1 個 service method（`sys_operation_log_service::create_log_in_txn`）。其他改動全為 in-place modification。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

✅ **無 violation 需要 Complexity Tracking** — Phase 0 + Phase 1 Constitution Check 全 pass。

---

**Phase 0 / Phase 1 產物**：見同目錄 [`research.md`](./research.md)、[`data-model.md`](./data-model.md)、[`contracts/internal-api.md`](./contracts/internal-api.md)、[`quickstart.md`](./quickstart.md)。

**下一步**：執行 `/speckit-tasks` 產生 dependency-ordered tasks.md。
