---

description: "Task list for F2.1 — audit-log-infrastructure implementation"
---

# Tasks: F2.1 — audit-log-infrastructure

**Input**: Design documents from [`specs/003-audit-log-infrastructure/`](.)
**Prerequisites**: [`plan.md`](./plan.md) ✓、[`spec.md`](./spec.md) ✓、[`research.md`](./research.md) ✓、[`data-model.md`](./data-model.md) ✓、[`contracts/internal-api.md`](./contracts/internal-api.md) ✓、[`quickstart.md`](./quickstart.md) ✓

**Tests**: F2.1 spec.md **明示要求 acceptance test**（SC-006 / SC-007 / SC-008 / SC-009 涵蓋 acceptance scenarios 4-16、payload serialization + redaction + transaction rollback + HTTP middleware path）— 因此 test tasks 為 implementation 必要部分、不是 optional。F2.1 測試需要 real postgres connection（payload JSONB + transaction discipline 不能用 mock 驗）。沿 F3 既有 `#[ignore]` opt-in pattern。

**Organization**: F2.1 spec.md 單一 P1 US（infrastructure-atomic、no further decomposition）→ Phase 3 內單一 [US1] 包含全部 acceptance dimensions A-F

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to ([US1] = F2.1 唯一 P1 US)
- file paths 為 **repo-relative**（從 `fork260509-rev1/` workspace root 起算）

## Path Conventions

- **rust-api worktree**: `rust-api/server/{core,model,service,api,middleware}/...`、`rust-api/migration/src/schemas/...`、`rust-api/scripts/...`（per [`plan.md`](./plan.md) Project Structure）
- **outer repo**: `.github/workflows/...`
- 所有 tests: `rust-api/server/model/tests/`（沿 F3 + F4 pattern；integration test 需 real postgres connection、`#[ignore]` opt-in）

---

## Phase 1: Setup（環境 sanity check + baseline）

**Purpose**: 確認 outer 在 feature branch + worktree state + 記錄 before snapshot 供 polish 階段 verify

- [ ] T001 確認 outer 在 `003-audit-log-infrastructure` feature branch、`rust-api/` worktree 行首空格 (`git status` + `git submodule status` + `cd rust-api && git branch --show-current`、預期 `rev1-admin-rust-api`)
- [ ] T002 [P] 記錄 baseline snapshot：(a) sys_operation_log 既有 column 數 = 18（per data-model.md §E1）、(b) F3 既有 `AuditLogCtx` callsite 數 in `rust-api/server/` = 14（F3 7 facade × 2 op = soft_delete + restore）、(c) `rust-api/server/service/src/admin/sys_*_service.rs` 內 `create_<x>` / `update_<x>` async fn 命中數（plan 預估：sys_user/role/menu/domain 各 2 + sys_access_key 1 = 9 個 fn）、(d) `audit_log::write_in_txn` callsite 數（F3 既有 14 個、F2.1 後 + service create_/update_ + middleware ≈ 25-30 個）；輸出存到本檔 §Baseline Snapshot 段供 SC 對比

---

## Phase 2: Foundational（BLOCKING prerequisites）

**Purpose**: 建立 sys_operation_log schema 4 新欄 + AuditOperation / AuditSource / AuditEvent + AuditSerialize trait + write_in_txn refactor — **all subsequent [US1] tasks depend on this phase**

**⚠️ CRITICAL**: 此 phase 完成前所有 [US1] tasks 不可開始（會引用未定義的 enum / struct / module）

- [ ] T003 新建 `rust-api/migration/src/schemas/m20260514_h_extend_sys_operation_log_audit_fields.rs` — up() 4 步驟 ALTER TABLE（operation VARCHAR(20) NOT NULL DEFAULT 'LEGACY' + entity_id TEXT NULL + payload_before JSONB NULL + payload_after JSONB NULL）；down() 反向 DROP 4 欄；用 `manager.get_connection().execute_unprepared(...)` raw SQL 沿 F3 既有 m20260514_a..g 風格；per [`data-model.md`](./data-model.md) §E1
- [ ] T004 修改 `rust-api/migration/src/schemas/mod.rs` 加 `pub mod m20260514_h_extend_sys_operation_log_audit_fields;` 一行；修改 `rust-api/migration/src/lib.rs` 在 Migrator::migrations() 內「数据迁移」section 之前 append `Box::new(schemas::m20260514_h_extend_sys_operation_log_audit_fields::Migration),`
- [ ] T005 [P] 修改 `rust-api/server/model/src/admin/entities/sys_operation_log.rs` — 在 Model struct 內 `created_at` 之後加 4 個 field：`operation: String`（不 nullable）+ `entity_id: Option<String>` + `payload_before: Option<JsonValue>` + `payload_after: Option<JsonValue>`；Column enum 隨 DeriveEntityModel macro 自動展開；per [`data-model.md`](./data-model.md) §E1
- [ ] T006 修改 `rust-api/server/core/src/web/audit.rs` — 在 F3 既有 Actor + AuditLogCtx 之後擴增：
  - `AuditOperation` enum + `as_str()` + `Display` impl（per data-model.md §E2）
  - `AuditSource` enum 3 variant（per data-model.md §E3）
  - `AuditEvent<'a>` struct 9 fields（per data-model.md §E4）
  - F3 既有 `AuditLogCtx` 加 `#[deprecated(since = "F2.1", note = "use AuditEvent + audit_log::write_in_txn")]` attribute
  - 加 `From<&AuditEvent<'_>> for AuditLogCtx<'_>` shim（過渡層、per data-model.md §E4）
- [ ] T007 [P] 新建 `rust-api/server/model/src/admin/audit_serialize.rs` — 定義 `AuditSerialize: Serialize` trait（含 provided method `redacted_fields()` 預設 `&[]`）+ `audit_snapshot<M>(&M) -> JsonValue` helper + 7 個 impl block（sys_user `&["password"]` / sys_access_key `&["access_key_secret"]` / 其他 5 個 default）；per [`data-model.md`](./data-model.md) §E5
  - **注意 redacted_fields() 字串**：由於 entity Model 已 derive `#[serde(rename_all = "camelCase")]`（per F4），serialize 後 field key 為 camelCase；redacted_fields 列 `"password"`（sys_user）和 `"accessKeySecret"`（sys_access_key）— 對齊 serde 輸出格式。
  - **T007 第一個 sub-step**（per analyze 2026-05-14 M3）：跑 `grep -l 'serde(rename_all = "camelCase")' rust-api/server/model/src/admin/entities/sys_{user,role,menu,domain,organization,endpoint,access_key}.rs` 確認 7 entity Model 是否都有 camelCase rename attribute。
    - 若 7 個都有 → redacted_fields list 用 **camelCase**（`"password"`、`"accessKeySecret"`）
    - 若 7 個都沒 → 用 **snake_case**（`"password"` 同、`"access_key_secret"`）
    - 若混合（不一致）→ STOP and report、需先統一 entity serde attribute 才能繼續
  - 同 sub-step：補一個 acceptance test 在 T029 內驗 `audit_snapshot(&sys_user::Model)` 內 `password` key 確實出現 + 值為 `"<redacted>"`（per serialize output 實際 key 名）
- [ ] T008 修改 `rust-api/server/model/src/admin/mod.rs` 加 `pub mod audit_serialize;` 一行（依字母順序、在 `audit_log` 後 `entities` 前）
- [ ] T009 修改 `rust-api/server/model/src/admin/audit_log.rs` — refactor `write_in_txn` signature 從 `(txn, ctx: AuditLogCtx)` 改為 `(txn, event: AuditEvent<'_>) -> Result<(), AppError>`；內部依 `event.source` 分支填充既有 18 欄（user_id/username/domain 從 actor / module_name 從 entity_type / method/url/ip/user_agent 從 source / description 自動 fallback "{operation} id={entity_id}"）+ 4 新欄（operation enum.as_str() / entity_id / payload_before / payload_after）；per [`data-model.md`](./data-model.md) §E6

**Checkpoint**: Phase 2 完成 → `cargo check -p server-model -p server-core` 應 pass（migration + entity + enum + struct + trait 都可獨立編譯）；F3 既有 callsite 暫時透過 `From<&AuditEvent> for AuditLogCtx` shim 兼容、但 F3 callsite 仍需在 Phase 3 內 refactor

---

## Phase 3: User Story 1 [US1] — rust admin 全 write 路徑走單一 audit context + 業務+audit 同 transaction + 敏感欄位 redact（P1）🎯 MVP

**Goal**: 7 facade refactor + 5+ service create_/update_ migration + sys_endpoint sync 內部加 audit + 5+ api handler 透傳 Actor + HTTP middleware refactor + sys_operation_log_service legacy 處理 + CI lint + acceptance test 三檔全交付

**Independent Test**: 跑 [`quickstart.md`](./quickstart.md) Step 1-10 全部 Pass → SC-001 ~ SC-010 全 10 個指標達成

### Dimension A — F3 facade refactor 走 AuditEvent（FR-012）

- [ ] T010 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_user.rs` — `soft_delete_by_id` + `restore_by_id` 內部 refactor：fetch before snapshot (find_active filter id) + UPDATE deleted_at + (restore 加 fetch_after) + 改用 `AuditEvent { operation: SoftDelete/Restore, payload_before: Some(audit_snapshot(&before)), payload_after: None or Some(audit_snapshot(&after)), source: Internal, ... }` 走 `audit_log::write_in_txn`；external signature 不變；per [`data-model.md`](./data-model.md) §E7
- [ ] T011 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_role.rs` — 同 T010 pattern
- [ ] T012 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_menu.rs` — 同 T010 pattern + 保留既有 FR-026 tree-cascade check 不變（cascade check 在 UPDATE 前、不需 audit）；id 型別 i32、entity_id 用 `id.to_string()`
- [ ] T013 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_domain.rs` — 同 T010 pattern
- [ ] T014 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_organization.rs` — 同 T010 pattern + 保留 FR-026 tree-cascade
- [ ] T015 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_endpoint.rs` — 同 T010 pattern
- [ ] T016 [P] [US1] 修改 `rust-api/server/model/src/admin/facade/sys_access_key.rs` — 同 T010 pattern

### Dimension B — Service create_/update_ migration（FR-010/011/013）

> 注：每 service trait method 必加 `actor: &Actor` 參數；既有 service 簽名 F3 已加 delete handler 的 actor、F2.1 擴 create_/update_ 也加。每 task 內含：(a) trait signature 改 (b) impl signature 改 (c) handler 內部 transaction + audit 寫入 (d) 確認 fetch_before for UPDATE path。

- [ ] T017 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_user_service.rs` — TUserService::create_user + update_user 加 `actor: &Actor`、impl 內 transaction wrap + audit_log::write_in_txn（INSERT 只 payload_after / UPDATE 含 payload_before + payload_after、走 audit_snapshot）；per [`data-model.md`](./data-model.md) §E8
- [ ] T018 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_role_service.rs` — 同 T017 pattern
- [ ] T019 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_menu_service.rs` — 同 T017 pattern；id i32 → entity_id 用 `id.to_string()`
- [ ] T020 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_domain_service.rs` — 同 T017 pattern
- [ ] T021 [P] [US1] 修改 `rust-api/server/service/src/admin/sys_access_key_service.rs` — `create_access_key` 加 actor + audit（無 update_access_key、跳過 update 段）
- [ ] T022 [US1] 修改 `rust-api/server/service/src/admin/sys_endpoint_service.rs::sync_endpoints` — 內部 `Entity::insert_many(...).on_conflict(do_update)` 路徑加 audit batch（per outstanding R3-2、Actor::system("endpoint_sync")）；具體實作：每筆 endpoint upsert 後（無論 INSERT or UPDATE）寫 1 個對應 AuditEvent；若 actor=system + log volume 大、考慮加 batch-summary mode（plan 階段 outstanding、tasks 階段量化選 batch-row 1 個 audit row 概要 vs N 個 row）
- [ ] T023 [US1] 確認 `rust-api/server/service/src/admin/sys_organization_service.rs` 是否有 write method 需要 audit（per outstanding R3-1）— 若有 create_/update_ pattern → 比照 T017；若 read-only → 跳過此 task 並在 §Outstanding 段記錄

### Dimension C — API handler 透傳 Actor（FR-013）

- [ ] T024 [US1] 修改 7 個 sys_*_api.rs（user/role/menu/domain/organization/endpoint/access_key）— 對每個 `create_<x>` / `update_<x>` handler 加 `Extension(user): Extension<User>` extractor + `let actor = Actor::from(&user); service.create_<x>(input, &actor).await` 透傳；參考 F3 G8 既有 delete handler 模式（sys_user_api.rs:88-93 等）；對 sys_menu_api.rs 既有 create/update 已含 Extension<User>、改為構造 Actor 並傳；對 sys_organization / sys_endpoint 若無 create/update handler 跳過

### Dimension D — HTTP middleware（FR-014/015、clarify Q1+Q2）

- [ ] T025 [US1] 修改 `rust-api/server/middleware/src/operation_log_middleware.rs` — refactor 為走 `audit_log::write_in_txn(AuditEvent { source: Http {...}, ... })` 取代既有 `sys_operation_log_service::handle_operation_log_event` 路徑；含：
  - method 推導（POST → Insert / PUT|PATCH → Update / DELETE → SoftDelete；GET/HEAD/OPTIONS/TRACE 直接 next.run、不寫 audit）
  - entity_type Hybrid rule 7 條 admin URL prefix match → snake_case；不 match → `"http_event"`（per clarify Q2 + research.md R6）
  - 取 axum Extension<User> + Extension<RequestId>（若有）構造 AuditEvent
  - **不 dedupe** with service-level audit（per clarify Q1）；middleware audit 失敗 走 `tracing::warn!` + 不影響 response
  - per [`data-model.md`](./data-model.md) §E9 + [`contracts/internal-api.md`](./contracts/internal-api.md) §C8
  - middleware Cargo.toml 若新增 dep（如 server_model facade access）已在 F3 G9 加過、確認不需再加

### Dimension E — sys_operation_log_service legacy 處理（FR-022）

- [ ] T026 [US1] 處理 `rust-api/server/service/src/admin/sys_operation_log_service.rs` — middleware 改路徑後此 trait method 0 callsite；tasks 階段拍板（per research.md R5）：
  - **Option A (recommended)**: 完全 remove `sys_operation_log_service::handle_operation_log_event` trait + impl + struct（cleaner）
  - Option B: mark `#[deprecated]` + 保留為 no-op shim（保守）
  - 任選一、commit message 註明選擇與理由

### Dimension F — CI lint（FR-016/017）

- [ ] T027 [P] [US1] 新建 `rust-api/scripts/ci-audit-coverage-lint.sh` — bash script、awk 掃 `server/service/src/admin/sys_*_service.rs` 內 `async fn (create_|update_)<x>` block 範圍、每 block 必含 `audit_log::write_in_txn` 或 `AuditEvent`；命中 + exit 0；漏 + exit 1 + 列出 file:line + method name；per [`data-model.md`](./data-model.md) §E10
  - awk pattern 細節（method block 跨 brace depth 偵測）tasks 階段量化、見 §E10 範式；對 trait method declaration（無 body）走 fn body 至少一行前提
- [ ] T028 [P] [US1] 新建 `.github/workflows/ci-audit-coverage-lint.yml` — GitHub Actions workflow、trigger 沿 F3 ci-soft-delete-lint.yml 模式（push to main/rev1-admin-root/00*-**、pull_request to main/rev1-admin-root、submodules: recursive）；job 跑 `bash rust-api/scripts/ci-audit-coverage-lint.sh`

### Tests for User Story 1（SC-006 / SC-007 / SC-008 / SC-009 — explicit request）

> **Note**: F2.1 為「跨 layer infrastructure」、沿 F3 既有 `#[ignore]` opt-in pattern；test 可在 implementation 完成同期撰寫、不強制 fail-first。Integration test 需要 real postgres connection — 假設 `cargo test` 時 dev DB 跑著（per quickstart Step 1-3 setup）。

- [ ] T029 [P] [US1] 撰寫 `rust-api/server/model/tests/audit_basics.rs` — Dimension A + B + C + D 全部 scenarios 1-12：
  - INSERT path 寫 audit row、operation=INSERT、payload_after 含 entity snapshot
  - UPDATE path 寫 audit row、operation=UPDATE、payload_before + payload_after 都填
  - SOFT_DELETE / RESTORE path（F3 既有 refactor 後）走 AuditEvent
  - AuditSerialize redaction：sys_user password → `"<redacted>"`、sys_access_key access_key_secret → `"<redacted>"`、其他 entity 不 redact
  - AuditOperation enum + AuditSource enum 對 sys_operation_log 4 新欄正確 mapping
  - 全 `#[ignore]` + `cargo test --test audit_basics -- --ignored` 跑
- [ ] T030 [P] [US1] 撰寫 `rust-api/server/model/tests/audit_transaction_rollback.rs` — Dimension E scenarios 13-14：
  - 業務 INSERT 成功 + audit_log::write_in_txn mock fail → 整個 transaction rollback、sys_user 新 row 不留下、sys_operation_log 也無 audit row
  - 業務 UPDATE 違反 unique constraint fail → audit row 不寫
- [ ] T031 [P] [US1] 撰寫 `rust-api/server/model/tests/audit_http_middleware.rs` — Dimension B scenario 5 + clarify Q2 hybrid entity_type：
  - middleware 構造 AuditEvent { source: Http {...} } 寫 row、method/url/ip/user_agent 正確填、operation 從 HTTP method 推導正確
  - URL `/api/sys-user/...` → entity_type=`sys_user`；URL `/api/auth/login` → entity_type=`http_event`（fallback）
  - 注：HTTP middleware test 可走 unit-test 級（手動構造 axum::Request + 注入 Extension<User> + 呼 middleware tower::Layer）— 不需起完整 HTTP server

**Checkpoint**: T010-T031 全部完成 → User Story 1 應 fully functional + 16 個 acceptance scenarios 全 pass + SC-001~010 全達成

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: SC-005 / SC-008 / SC-010 三個自動化指標的最終驗證 + quickstart 完整跑通 + 兩段式 commit 收尾

- [ ] T032 [P] SC-005 驗證：跑 `bash rust-api/scripts/ci-audit-coverage-lint.sh` 應 pass（exit 0）；故意刪一個 service create_user 內 audit 呼叫後跑同 script 應 fail（exit 1）；驗證 GitHub Actions workflow YAML 合法（local `yamllint` 或 GitHub UI 上 push 後檢查）
- [ ] T033 [P] SC-010 驗證：`cd rust-api && cargo check 2>&1 | tail -10` 全 workspace 通過（0 errors、0 warnings、-D warnings 不報 unused-imports / dead_code）；對照 F3 既有 G1-G13 留下的乾淨基線
- [ ] T034 SC-001/002/003/004 驗證 + grep 對齊：
  - psql `\d sys_operation_log` 含 4 新欄（SC-001）
  - F3 既有 acceptance test `cargo test --test soft_delete_* -- --ignored` 全綠（SC-002）
  - `grep -c '^impl AuditSerialize for ' server/model/src/admin/audit_serialize.rs` ≥ 7（SC-003）
  - `grep -rn 'AuditLogCtx' server --include='*.rs' | grep -v 'web/audit.rs' | grep -v '#\[deprecated' | grep -v 'From<&AuditEvent'` 應 empty — 0 active callsite（SC-004）
- [ ] T035 跑 [`quickstart.md`](./quickstart.md) Step 1-10 完整 verification（含 migration up / psql schema 驗 / acceptance test / AuditSerialize impl 數 / AuditLogCtx 0 callsite / CI lint / E2E CRUD + audit row 驗 + redaction 驗 + transaction rollback 驗 + HTTP middleware entity_type Hybrid 驗 + cargo check）— 所有步驟 Pass 才算 F2.1 達成
- [ ] T036 第一段 commit + push（per CLAUDE.md §6.1）：
  - `cd rust-api && git status` 確認 modified + 新檔
  - `git add migration/src/schemas/m20260514_h_*.rs migration/src/schemas/mod.rs migration/src/lib.rs server/core/src/web/audit.rs server/model/src/admin/entities/sys_operation_log.rs server/model/src/admin/audit_log.rs server/model/src/admin/audit_serialize.rs server/model/src/admin/mod.rs server/model/src/admin/facade/sys_*.rs server/service/src/admin/sys_*_service.rs server/middleware/src/operation_log_middleware.rs server/api/src/admin/sys_*_api.rs server/model/tests/audit_*.rs scripts/ci-audit-coverage-lint.sh`（具體清單視 audit 結果）
  - commit message：`feat(rust-api): F2.1 audit-log-infrastructure（schema 4 新欄 + AuditEvent + AuditSerialize + write_in_txn refactor + service migrate + middleware refactor + CI lint）`
  - **等 user 同意才** `git push origin rev1-admin-rust-api`
- [ ] T037 第二段 commit（outer SHA pin update + GitHub Actions workflow、per CLAUDE.md Outer branch 預期）：
  - `cd .. && git branch --show-current` 確認 `003-audit-log-infrastructure`
  - `git status` 應看到 `modified: rust-api (new commits)` + `?? .github/workflows/ci-audit-coverage-lint.yml`
  - `git add rust-api .github/workflows/ci-audit-coverage-lint.yml specs/003-audit-log-infrastructure/`
  - commit message：`chore(submodule): bump rust-api 到 <短 SHA> — F2.1 audit-log + 加 GitHub Actions ci-audit-coverage-lint`
  - **等 user 同意才** `git push origin "$(git branch --show-current)"`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 無 dependencies、可立即開始
- **Phase 2 (Foundational)**: 依賴 Phase 1 完成 — **BLOCKS** Phase 3 全部 tasks
- **Phase 3 (User Story 1)**: 依賴 Phase 2 完成
  - Dimension A (T010-T016) 全 [P] 平行（不同 facade 檔）
  - Dimension B (T017-T023) — T017-T021 全 [P] 平行（不同 service 檔）；T022 (sys_endpoint) 獨立；T023 sys_organization 確認後對應
  - Dimension C (T024) 對 7 api 檔的 create_/update_ handler 批量改動（plan 階段 audit、tasks 階段量化具體 file:line）
  - Dimension D (T025) 1 個 middleware 檔；依賴 T009 (write_in_txn refactor) + T006 (AuditEvent struct)
  - Dimension E (T026) 1 個 service 檔 deprecation/remove；依賴 T025 (middleware 改完)
  - Dimension F (T027 / T028) 全 [P] 平行
  - Tests (T029-T031) 全 [P]；runtime 依賴 implementation tasks 完成
- **Phase 4 (Polish)**: 依賴 Phase 3 完成（特別 T035 quickstart 跑前所有 implementation tasks 必完）

### Within Phase 3 Internal Dependencies

```text
Dimension A:
  T010..T016 (7 facade refactor)            [P]
    ↑ 依賴 T006 (AuditEvent) + T007 (AuditSerialize) + T009 (write_in_txn refactor)

Dimension B:
  T017..T021 (5 service create_/update_)    [P]
    ↑ 依賴 T010..T016（service 透過 facade 呼叫、refactor 後簽名一致）
  T022 (sys_endpoint sync_endpoints)        — 依賴 T017 pattern
  T023 (sys_organization 確認)               — 依賴 T017 pattern

Dimension C:
  T024 (7 api handler 透傳 Actor)            — 依賴 T017..T023 service trait signature 改完

Dimension D:
  T025 (operation_log_middleware refactor)  — 依賴 T006 + T009
  
Dimension E:
  T026 (sys_operation_log_service handle)   — 依賴 T025

Dimension F:
  T027 (ci-audit-coverage-lint.sh)          [P]
  T028 (.github/workflows/...)              [P]

Tests:
  T029..T031 (3 test 檔)                     [P]
    ↑ runtime 依賴 T010..T028（implementation 完成）
```

### Parallel Opportunities

#### Phase 2 內

無顯著 parallel — T003-T009 為線性依賴（T004 需 T003；T005 需 T003 migration 套用 entity 才有 Column variant；T006 需 audit.rs F3 base；T009 需 T006 + T007）。

#### Phase 3 內（重點 parallel batch）

```text
Batch 1 (Facade refactor): T010 ‖ T011 ‖ T012 ‖ T013 ‖ T014 ‖ T015 ‖ T016
  └─ 7 個 [P] 不同 facade 檔、可平行

Batch 2 (Service migration): T017 ‖ T018 ‖ T019 ‖ T020 ‖ T021
  └─ 5 個 [P] 不同 service 檔、可平行
  
Batch 3 (CI lint): T027 ‖ T028
  └─ shell script 與 GitHub workflow 不同檔、可平行

Batch 4 (Tests, writing only): T029 ‖ T030 ‖ T031
  └─ 3 個 [P] 平行寫；test 跑通需 implementation tasks 完
```

#### Phase 4 內

```text
T032 ‖ T033 平行（不同 verification target）
T034 跟 T032/T033 同期跑
T035 (quickstart) 依賴 T032/T033/T034 pass
T036 (worktree commit) 依賴 T035 pass + user 同意
T037 (outer SHA pin) 依賴 T036 完成
```

---

## Parallel Example: User Story 1 Batch 1 (Facade refactor)

```bash
# Terminal A: T010 — sys_user facade
$EDITOR rust-api/server/model/src/admin/facade/sys_user.rs

# Terminal B: T011 — sys_role facade
$EDITOR rust-api/server/model/src/admin/facade/sys_role.rs

# Terminal C-G: 其他 5 個 facade
# (依模板模式：fetch before + UPDATE + AuditEvent + write_in_txn)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

F2.1 唯一 P1 US = 整個 F2.1 feature 範圍。「MVP first」對 F2.1 = 「完整 F2.1」、不可分。

1. Phase 1 Setup（sanity check）
2. Phase 2 Foundational（**CRITICAL** — migration + AuditEvent/Operation/Source + AuditSerialize trait + write_in_txn refactor）
3. Phase 3 [US1]（6 dimensions × 多個 task：facade refactor / service migrate / api handler / middleware / legacy 處理 / CI lint / tests）
4. **STOP and VALIDATE**: 跑 quickstart.md Step 1-10
5. Phase 4 Polish：SC-005 / SC-008 / SC-010 / quickstart 全套 + 兩段式 commit

### Incremental Delivery (alternative if 分批 review)

雖然 F2.1 是 atomic infrastructure feature，但實作上可分為 3 個 review chunk：

1. **Chunk A: Foundational + Dimension A**（T001-T016）— migration + entity + enum + struct + trait + 7 facade refactor
2. **Chunk B: Dimension B + C + D + E**（T017-T026）— service migrate + api handler + middleware + legacy 處理
3. **Chunk C: Dimension F + tests + polish**（T027-T037）— CI lint + acceptance test + commit

但 acceptance test 全 pass（SC-006 / SC-007 / SC-008 / SC-009）需 Chunk A + B + C 都完成才能驗證。

### Single Developer Strategy

F2.1 為 single-developer feature（不涉跨域協調）：

- Phase 1 + 2 順序做（無 parallel）
- Phase 3 內 Batch 1-4 可 cluster 做（同 batch 內各 task 改不同檔、可同時編輯）
- Phase 4 收尾

---

## Baseline Snapshot (記錄於 T002)

> Implementation 開始前由 T002 填入；polish 階段 SC verification 對比驗證用

```text
Before implementation (T002 執行時填入):
  sys_operation_log 既有 column 數: __ (預期 18、per data-model.md §E1)
  F3 既有 AuditLogCtx active callsite 數 in server/: __ (預期 14 = 7 facade × 2 op)
  rust-api/server/service/src/admin/sys_*_service.rs 內 create_<x> / update_<x> async fn 命中數: __ (plan 預估 9 個)
  audit_log::write_in_txn callsite 數 in server/: __ (F3 既有 14、F2.1 後 ≈ 25-30)

After implementation (T032 / T033 / T034 執行時填入):
  sys_operation_log column 數: 22 (SC-001 pass criteria、18 + 4 新欄)
  AuditLogCtx active callsite 數 (除 deprecated declaration + From shim): 0 (SC-004 pass criteria)
  impl AuditSerialize 命中數 in audit_serialize.rs: >=7 (SC-003 pass criteria)
  cargo check 全 workspace: 0 errors / 0 warnings (SC-010 pass criteria)
```

---

## Service Migration Audit (記錄於 T017-T023)

> Audit phase 填入；review 用

```text
T017 (sys_user_service.rs):
  create_user audit 加 callsite: __ (1 個 audit_log::write_in_txn 呼叫)
  update_user audit 加 callsite: __ (1 個 audit_log::write_in_txn + 1 個 fetch_before)
  trait signature 加 actor: 2 method (create + update)
  
T018-T021 同 pattern；T022 sys_endpoint sync_endpoints 內部 batch；T023 sys_organization 確認 read-only or has writers。
```

---

## Notes

- **[P] tasks = 不同檔、無未完成依賴** — 可放心平行
- **[Story] label = [US1]** — F2.1 唯一 P1 US，所有 Phase 3 task 都標 [US1]
- **Verify tests pass before claiming F2.1 complete**（quickstart Step 1-10 + SC-001~010 全 pass）
- **Commit after each logical group**（不是 task-by-task）— Phase 2 結束 commit / Phase 3 dimension 結束 commit / Polish 結束 commit。但**push 全部等 user 同意**（per CLAUDE.md §6.2）
- **Avoid: 改 base `src/` 任何檔** — Constitution Principle IV 嚴格禁止（F2.1 不動 base、`.env` 也不動）
- **Avoid: 跨 entity 共享 audit logic** — 每 service 內 audit 呼叫顯式、不抽 helper（per F3 同設計哲學）
- **Avoid: middleware audit dedupe 寫法** — per clarify Q1、middleware 永遠寫、不 detect service-level row 是否已寫

---

**Total tasks**: 37
**Per-phase breakdown**: Setup (2) / Foundational (7) / [US1] (22) / Polish (6)
**Parallel opportunities**: Phase 3 Batch 1 (7) + Batch 2 (5) + Batch 3 (2) + Batch 4 (3) = 最多 17 個 task 可平行
**MVP scope**: User Story 1 = 整個 F2.1（atomic infrastructure increment）
**下一步**：執行 `/speckit-analyze` 跨 artifact 一致性檢查（recommended）或直接 `/speckit-implement` 開始實作
