# Feature Specification: F2.1 — audit-log-infrastructure

**Feature ID**: F2（per [`DESIGN-A`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1）— **拆 F2.1 先交、F2.2 留 outbox + Redis TTL fallback**
**Feature Branch**: TBD（spec-kit `/speckit-specify` 階段建立）
**Created**: 2026-05-14
**Status**: Draft（brainstorming 完成、待 spec-kit `/speckit-specify` 接手轉為正式 feature spec）
**Source**: superpowers:brainstorming 2026-05-14 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.5（全域 audit 紀律）、§5.2.1（audit 完整性）、§6.1 F2、§6.2 依賴序
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md)（A/B 兩軌都需此基礎）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle II 全域 audit + 架構約束）
- [`docs/superpowers/001-feature-response-shape-alignment.md`](001-feature-response-shape-alignment.md)（F4，已完成）
- [`docs/superpowers/002-feature-soft-delete-infrastructure.md`](002-feature-soft-delete-infrastructure.md)（F3，已完成；F2.1 收斂 F3 既有 `audit_log::write_in_txn` 為 single context）

**Scope summary**：rust admin 全 write 操作（INSERT / UPDATE / SOFT_DELETE / RESTORE）走**單一 audit context API**、業務 + audit 必同 transaction、sys_operation_log schema 擴 4 個結構化欄位（operation enum + entity_id + payload_before/after JSONB）、敏感欄位透過 `AuditSerialize` trait 自動 redact、HTTP middleware audit 整合同一 context、新增 CI lint 守 INSERT/UPDATE 必有 audit 呼叫。**F2.1 範圍刻意縮限**：outbox 模式 + Redis subscriber TTL fallback + HARD_DELETE audit 全留 F2.2 / F12 階段獨立交付。

## Clarifications

### Session 2026-05-14

- Q: F2 整體範圍要不要一次交付？ → A: **拆 F2.1 + F2.2**。F2.1 = schema + transaction 紀律 + INSERT/UPDATE audit + 統一 audit path；F2.2 = outbox 模式 + Redis subscriber TTL fallback。理由：rev1 階段所有代碼都在單服務內、未起 nestjs container、Casbin pub-sub 尚未往跨微服務、outbox 現階段為 premature investment。F5 (login) 只需 F2.1 內容即可解鎖。
- Q: 既有 HTTP middleware audit 路徑 vs F3 service-level `write_in_txn` 兩條並存怎麼辦？ → A: **統一為單一 audit context API**。新增 `AuditEvent` struct + `AuditSource` enum（HTTP / Internal / Cleanup）。HTTP middleware 改走同一 helper、`source=Http`；F3 既有 helper 接 `AuditEvent` + source=Internal、`method="INTERNAL"` sentinel hack 退役。
- Q: sys_operation_log schema 新增哪些欄位？ → A: **4 個結構化欄位**：`operation` VARCHAR(20)（enum: INSERT/UPDATE/SOFT_DELETE/RESTORE/HARD_DELETE）+ `entity_id` TEXT + `payload_before` JSONB + `payload_after` JSONB。既有 18 欄全保留（user_id/username/domain = actor；module_name 語意對應 entity_type；description 仍是 human-readable summary；HTTP-視角 method/url/ip/user_agent 由 AuditSource::Http 填）。
- Q: INSERT / UPDATE 觸發 audit 的機制？ → A: **Manual** — service handler 顯式呼叫（同 F3 facade soft_delete 既有風格）。理由：F3 已建立顯式透傳 actor 設計哲學、Sea-ORM ActiveModelBehavior hook 大 magic + actor 透傳複雜、PG trigger 跨層 debug 困難。
- Q: payload_before / payload_after JSONB 應該記什麼？ → A: **Entity 完整 snapshot**（`serde_json::to_value(&model)`）— UPDATE 二者皆填、INSERT 只 after、SOFT_DELETE 只 before、RESTORE 二者皆填（軟刪態→active 態）。Storage 成本 admin-heavy 低 throughput 場景可接受。
- Q: 敏感欄位（sys_user.password / sys_access_key.access_key_secret）如何 redact？ → A: **Trait-based** — 新增 `AuditSerialize: serde::Serialize` trait、提供 `fn redacted_fields() -> &'static [&'static str]` 預設返空。每 entity impl、sys_user 含 `password`、sys_access_key 含 `access_key_secret`。`audit_snapshot(&model)` helper serialize 後依 redacted_fields 替換為 `"<redacted>"`。
- Q: F2.1 採哪個 implementation approach？ → A: **Approach A** — `AuditEvent` struct + `audit_log::write_in_txn(txn, AuditEvent)` helper。漸進演進 F3 既有 pattern、API 顯式、AuditSerialize trait 處理 redaction。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rust admin 全 write 路徑走單一 audit context、業務 + audit 同 transaction、敏感欄位自動 redact（Priority: P1，唯一 US）🎯 MVP

admin 對 rust 後端的任何 write 操作（INSERT 新 entity / UPDATE 既有 entity / SOFT_DELETE 軟刪 / RESTORE 還原）自此後**永遠**寫 `sys_operation_log` 一筆 row、與業務變動同一 DB transaction commit / rollback、payload_before/after 含完整 entity snapshot、敏感欄位（password / access_key_secret）自動替換為 `"<redacted>"`。整個 rust codebase 內、service / handler 層**不可能**寫業務變動而漏寫 audit — 由 Rust 類型系統（service signature 必收 `&Actor`）+ CI lint（grep INSERT/UPDATE callsite 周邊必有 audit 呼叫）+ trait-based redaction（編譯時保證敏感欄位不外洩）三重 enforcement 守護。

**Why this is the only US (P1，atomic infrastructure increment)**：

F2.1 的 6 個交付片段（schema migration / AuditEvent + AuditSource enum / AuditSerialize trait + 7 impl / write_in_txn refactor / service INSERT/UPDATE migration / HTTP middleware 整合 / CI lint）**並非獨立可交付**：

- 單獨擴 schema 4 欄 → 沒 refactor write_in_txn → 既有 F3 audit row 仍用 description hack、新欄全空 → 違反 §1.5「全域 audit 紀律」一致性
- 單獨建 AuditEvent + AuditSource enum → 沒 service migration → INSERT/UPDATE 仍裸寫 ActiveModel + audit 漏寫 → §1.5 「全 write 寫 audit」總則違反
- 單獨 migrate service INSERT/UPDATE handler → 沒 trait-based redaction → password / access_key_secret leak 進 audit payload → forensic 違背 + 違反 OWASP A09 logging-security
- 單獨 refactor write_in_txn 接 AuditEvent → HTTP middleware 仍走舊 service trait method → §1.5 audit 路徑統一性違反、F3 既有 `INTERNAL` sentinel hack 不能退役
- 單獨加 CI lint → service 還沒 migrate → lint 直接 fail、無法 merge

任一單一片段交付了、其他沒交付，整個 codebase 都處於「部分 entity write 有 audit / 部分沒、部分 audit row 是結構化 / 部分是舊 description hack」的雜訊狀態。F2.1 是 **infrastructure 性質的原子 MVP increment** — 6 個片段是同一個 user story 的 6 個 acceptance dimensions、不是 6 個 user stories。

**Independent Test**：base + rust + postgres + redis 起來、`cargo run --bin migration -- up` 跑 4 新欄 migration、admin 透過 `/manage/user` create / update / delete user：
1. CREATE → `sys_operation_log` 含 1 row、operation=INSERT、payload_after 含完整 user snapshot、`password` 欄為 `"<redacted>"`
2. UPDATE → 對應 row operation=UPDATE、payload_before + payload_after 都含 snapshot、敏感欄位 redacted
3. DELETE → 對應 row operation=SOFT_DELETE、payload_before 含 active 態 snapshot、payload_after=null
4. 故意觸發 UPDATE unique violation → audit row 不寫（業務 transaction rollback）
5. 既有 F3 soft_delete acceptance test 仍 pass（refactor F3 write_in_txn 不破壞既有行為）

**Acceptance Scenarios**:

#### Dimension A：DB schema migration + 4 新欄

1. **Given** F2.1 migration 已套用，**When** `psql -c "\d sys_operation_log"`，**Then** 表內含新欄 `operation VARCHAR(20) NOT NULL DEFAULT 'LEGACY'` + `entity_id TEXT NULL` + `payload_before JSONB NULL` + `payload_after JSONB NULL`；既有 18 欄全保留
2. **Given** F2.1 migration 套用前 sys_operation_log 有 N 筆既有 row，**When** migration up 完成，**Then** 既有 N 筆 row 的 operation = `'LEGACY'`（DEFAULT 標、不破壞既有 reader）、entity_id/payload_before/payload_after 為 NULL
3. **Given** F2.1 migration up 後再 down，**When** `\d sys_operation_log`，**Then** 4 個新欄全 drop、表回到 F3 狀態

#### Dimension B：AuditEvent + AuditSource + AuditOperation enum

4. **Given** service handler 構造 `AuditEvent { actor, operation: Insert, entity_type: "sys_user", entity_id: "u-001", payload_before: None, payload_after: Some(audit_snapshot(&new_user)), source: AuditSource::Internal, ... }` 透過 `audit_log::write_in_txn(&txn, event)`，**When** transaction commit，**Then** sys_operation_log 含對應 row：operation="INSERT"、entity_id="u-001"、payload_after 含完整 user JSON snapshot、module_name="sys_user"、method="INTERNAL"
5. **Given** middleware 構造 `AuditEvent { source: AuditSource::Http { method: "POST", url: "/api/sys-user", ip: "10.0.0.5", user_agent: Some("...") }, operation: Insert, ... }`，**When** 寫入，**Then** sys_operation_log row：method="POST"、url + ip + user_agent 對應填充、operation="INSERT"
6. **Given** F12 cleanup-job 構造 `AuditEvent { source: AuditSource::Cleanup, operation: HardDelete, actor: Actor::system("cleanup_job"), ... }`，**When** 寫入，**Then** sys_operation_log row：method="CLEANUP"、operation="HARD_DELETE"、user_id="cleanup_job"

#### Dimension C：AuditSerialize trait + redaction

7. **Given** sys_user::Model { username: "alice", password: "$argon2..." } + `audit_snapshot(&user)`，**When** serialize，**Then** 返回 JSON `{"username": "alice", "password": "<redacted>", ...}` — password hash 被替換
8. **Given** sys_access_key::Model { access_key_id: "AK123", access_key_secret: "secret..." }，**When** `audit_snapshot(&key)`，**Then** access_key_secret 被替換為 "<redacted>"、access_key_id 保留
9. **Given** sys_role / sys_menu / sys_domain / sys_organization / sys_endpoint Model（無敏感欄位）impl AuditSerialize 預設 redacted_fields()=&[]，**When** `audit_snapshot(&role)` 等，**Then** 完整 entity 不 redact 任何欄位

#### Dimension D：Service INSERT/UPDATE handler 全 migrate（FR-014~016 對齊 F3）

10. **Given** F2.1 完成、admin 呼叫 `POST /api/sys-user`（create_user），**When** service.create_user 流程跑完，**Then** (a) sys_user 新 row 建立、(b) sys_operation_log 同 transaction 含 INSERT row、payload_after 含 audit_snapshot(&new_user)、(c) operation/entity_id 兩欄都填、(d) password 在 payload_after 內為 `"<redacted>"`
11. **Given** admin 呼叫 `PUT /api/sys-user`（update_user）改 nick_name，**When** 流程完成，**Then** sys_operation_log 1 row：operation=UPDATE、payload_before 含改前完整 snapshot（含舊 nick_name）、payload_after 含改後完整 snapshot（含新 nick_name）— reader 可 diff 重建變動
12. **Given** F3 既有 `sys_user::soft_delete_by_id` 呼叫透過 F2.1 refactor 後，**When** 軟刪完成，**Then** sys_operation_log 1 row：operation=SOFT_DELETE（非舊 description="SOFT_DELETE id=..." hack）、payload_before 含 active snapshot、payload_after=null、entity_id 為 user id

#### Dimension E：Transaction rollback 紀律（per §5.2.1）

13. **Given** service.create_user 流程內、INSERT sys_user 成功但 audit_log::write_in_txn 對 sys_operation_log INSERT 失敗（mock DB error），**When** `?` 早 return、txn Drop，**Then** sys_user 新 row **不**留下（業務 transaction rollback）、sys_operation_log 也無對應 row、user 看到 envelope `{code: 9001 (SERVER_DB_ERROR), msg: "audit log insert failed: ..."}`
14. **Given** service.update_user 流程內、業務 UPDATE 違反 unique constraint fail，**When** `?` 早 return，**Then** sys_user 未被改動 + sys_operation_log 無對應 UPDATE row（業務 fail 自動帶走 audit）

#### Dimension F：CI lint enforcement

15. **Given** 開發者新增 sys_user_service.rs::custom_action method 內含 `ActiveModel.insert(&txn).await?` 但**沒**呼叫 audit_log::write_in_txn，**When** CI 跑 `ci-audit-coverage-lint.sh`，**Then** lint fail、列出 file:line + 「missing audit_log::write_in_txn call after .insert/.update」
16. **Given** F3 既有 facade soft_delete_by_id / restore_by_id 已 refactor 使用 AuditEvent，**When** CI lint 跑，**Then** pass（既有 F3 callsite 都符合）

### Edge Cases

- **既有 sys_operation_log 18 欄 row 的兼容性**：F2.1 migration `operation` 欄 NOT NULL DEFAULT `'LEGACY'`、既有 row 自動標 LEGACY；reader 可選擇過濾 `operation != 'LEGACY'` 看新 audit、或全 timeline 看混合
- **payload_before/after 大小**：admin entity 平均 < 1KB、JSONB 自動壓縮、rev1 admin-heavy 低 throughput 可接受。F12+ partition / retention 階段處理 audit 表成長
- **AuditSerialize redaction shallow only**：F2.1 redaction 只處理 top-level field、不遞迴 nested object（admin entity 都是 flat、no nested struct field 需 redact）
- **HTTP middleware 與 service-level audit 雙寫 row**：同一 entity write 可能留 2 row — 1 個 HTTP 視角（method=POST 等）+ 1 個 service-level（method=INTERNAL）。**設計取捨**：保留雙寫（forensic 兩個視角都有價值）；plan 階段可選擇加 dedupe（middleware 偵測 inner handler 已寫 service-level audit 則跳過）
- **HTTP middleware 寫 audit 失敗**：post-execution hook、業務已 commit、無法 rollback；middleware audit fail 走 log warn + 不影響 response（符合 §5.2.1「跨資源 side effect 失敗不影響 audit log 主要正確性」、HTTP 視角 row 為補充）
- **READ path 不寫 audit**：per §1.5「write 路徑寫 audit」、SELECT / find / query 等 read handler 不該呼叫 audit_log::write_in_txn；CI lint 範圍限縮 INSERT/UPDATE
- **sys_operation_log 自身 INSERT**：write_in_txn 是手動呼叫、不會 trigger 自身 audit（避免 infinite loop）
- **AuditEvent::description 預設值**：caller 不填 description 時、helper 自動生成 `"{operation} id={entity_id}"`（向後相容 F3 既有格式）
- **既有 sys_operation_log_service::handle_operation_log_event** trait method：F2.1 內整合 entry point（middleware 改走 audit_log::write_in_txn）、trait method 自身可選 deprecated 或移除（plan 階段拍板）
- **多次相同 operation row**：對同一 entity 多次 UPDATE 留多 row（per UPDATE 1 row）、F2.1 不做去重；reader 按 created_at 排序即可重建 timeline
- **AuditSerialize 失敗**：`serde_json::to_value(&model).unwrap_or(JsonValue::Null)` 容錯返 Null、不 panic、不破壞業務 transaction（per §5.2.1「audit 內向風險」防護）

---

## Requirements *(mandatory)*

### Functional Requirements

#### DB schema migration（FR-001 ~ FR-004）

- **FR-001**：F2.1 MUST 新增 1 個 sea-orm migration 檔（命名 `m20260514_h_extend_sys_operation_log_audit_fields.rs`）對 `sys_operation_log` 表加 4 個欄位：
  - `operation` VARCHAR(20) NOT NULL DEFAULT `'LEGACY'`
  - `entity_id` TEXT NULL
  - `payload_before` JSONB NULL
  - `payload_after` JSONB NULL
- **FR-002**：既有 sys_operation_log 18 欄全保留 — user_id / username / domain / module_name / description / request_id / method / url / ip / user_agent / params / response / body / start_time / end_time / duration / created_at / id；其中 module_name 語意對應新 `entity_type`、description 保留為 human-readable summary
- **FR-003**：Migration MUST 可 down — 反向 DROP 4 新欄、無 data backfill 需求（既有 LEGACY 標 row 的 operation 資訊丟失但業務無影響）
- **FR-004**：sys_operation_log 表 **MUST NOT** 加 `deleted_at`（per F3 FR-004、audit 表自身永不軟刪）

#### Audit context API（FR-005 ~ FR-009）

- **FR-005**：F2.1 MUST 在 `server_core::web::audit` 新增 3 個型別：
  - `enum AuditOperation { Insert, Update, SoftDelete, Restore, HardDelete }` + `as_str()` 方法返 SCREAMING_SNAKE_CASE 字串
  - `enum AuditSource { Http { method, url, ip, user_agent }, Internal, Cleanup }`
  - `struct AuditEvent<'a> { actor: &'a Actor, operation, entity_type: &'static str, entity_id: String, payload_before: Option<JsonValue>, payload_after: Option<JsonValue>, description: Option<String>, source: AuditSource, request_id: Option<String> }`
- **FR-006**：F3 既有 `AuditLogCtx` MUST 標 `#[deprecated]` + 提供 `From<&AuditEvent> for AuditLogCtx` 過渡層；F2.1 內所有 F3 callsite 改用 AuditEvent；F2.1 完成後 `AuditLogCtx` 0 callsite
- **FR-007**：F2.1 MUST refactor `server_model::admin::audit_log::write_in_txn` 簽名為 `(txn: &DatabaseTransaction, event: AuditEvent<'_>) -> Result<(), AppError>`、內部對 sys_operation_log 18+4 欄做完整 mapping：
  - actor 三欄 → user_id / username / domain
  - operation enum → operation 欄（VARCHAR）
  - entity_type → module_name + entity_id → entity_id
  - source enum 分支 → method / url / ip / user_agent 對應 (Http) / "INTERNAL" 空字串 (Internal) / "CLEANUP" 空字串 (Cleanup)
  - description.unwrap_or_else(|| format!("{} id={}", operation, entity_id))
  - payload_before / payload_after → 兩 JSONB 欄
- **FR-008**：F2.1 MUST 在 `server_model::admin::audit_serialize` 新增 trait：
  ```rust
  pub trait AuditSerialize: serde::Serialize {
      fn redacted_fields() -> &'static [&'static str] { &[] }
  }
  pub fn audit_snapshot<M: AuditSerialize>(model: &M) -> JsonValue;
  ```
  `audit_snapshot()` MUST 將 model serialize 後、把 redacted_fields() 列出的 top-level field 值替換為 JSON string `"<redacted>"`
- **FR-009**：F2.1 MUST 為 7 個 admin entity Model impl AuditSerialize：
  - sys_user::Model 的 redacted_fields() = `&["password"]`
  - sys_access_key::Model 的 redacted_fields() = `&["access_key_secret"]`
  - sys_role / sys_menu / sys_domain / sys_organization / sys_endpoint 的 redacted_fields() = `&[]`（default）

#### Service migration（FR-010 ~ FR-013）

- **FR-010**：7 個 admin entity service crate 內 INSERT path（create_<x> handler）MUST migrate 為「同 transaction 內 INSERT + audit_log::write_in_txn(AuditEvent { operation: Insert, payload_after: Some(audit_snapshot(&new_entity)), source: Internal, ... })」
- **FR-011**：7 個 admin entity service crate 內 UPDATE path（update_<x> handler）MUST migrate 為「同 transaction 內 fetch_before + ActiveModel.update + audit_log::write_in_txn(AuditEvent { operation: Update, payload_before: Some(audit_snapshot(&before)), payload_after: Some(audit_snapshot(&after)), source: Internal, ... })」
- **FR-012**：F3 既有 facade soft_delete_by_id / restore_by_id 內部 MUST refactor 使用 AuditEvent：
  - soft_delete_by_id：fetch before + UPDATE + AuditEvent { operation: SoftDelete, payload_before: Some(snapshot), payload_after: None }
  - restore_by_id：fetch before（軟刪態）+ UPDATE + fetch after（active 態）+ AuditEvent { operation: Restore, payload_before: Some(before), payload_after: Some(after) }
- **FR-013**：所有 service trait method（含 F3 已加 actor 的 delete、F2.1 新加 actor 的 create / update）MUST 收 `actor: &Actor` 參數；對應 API handler MUST 在 Extension<User> 取出後 `let actor = Actor::from(&user); service.method(.., &actor)`

#### HTTP middleware integration（FR-014 ~ FR-015）

- **FR-014**：F2.1 MUST refactor `server_middleware::operation_log_middleware`（既有）使用 `audit_log::write_in_txn(AuditEvent { source: Http { method, url, ip, user_agent }, operation: <推導 from HTTP method>, ... })`、不再走既有 sys_operation_log_service trait method
- **FR-015**：HTTP method → AuditOperation 推導規則：POST → Insert / PUT|PATCH → Update / DELETE → SoftDelete（rust 全軟刪、per F3）；GET / OPTIONS / HEAD 不寫 audit（read path）。entity_type 從 URL path 提取或填通用 sentinel `"http_event"`（plan 階段拍板）

#### CI lint（FR-016 ~ FR-018）

- **FR-016**：F2.1 MUST 新增 `rust-api/scripts/ci-audit-coverage-lint.sh` script：grep `server/service/src/admin/sys_*_service.rs` 內每個 `create_*` / `update_*` method 範圍、必有 `audit_log::write_in_txn` 或 `AuditOperation::Insert|Update` 呼叫；命中即 pass、漏即 exit 1
- **FR-017**：F2.1 MUST 新增對應 `.github/workflows/ci-audit-coverage-lint.yml` GitHub Actions workflow、trigger 同 F3 ci-soft-delete-lint
- **FR-018**：F2.1 CI lint **MUST NOT** 強制 HTTP middleware 範圍（middleware 寫 audit 是 post-execution hook、不在 service handler 內、grep 範圍限縮 service/admin/sys_*_service.rs）

#### 範圍邊界（FR-019 ~ FR-021）

- **FR-019**：F2.1 **MUST NOT** 實作 outbox 模式（→ F2.2 audit-log-outbox-and-pubsub）— transaction 內寫 outbox event row + 獨立 worker 重試 publish redis pub-sub 等機制全留 F2.2
- **FR-020**：F2.1 **MUST NOT** 實作 Redis subscriber TTL fallback（→ F2.2）— rev1 階段未起 nestjs container、Casbin pub-sub 尚未跨微服務、TTL fallback 為 premature investment
- **FR-021**：F2.1 **MUST NOT** 實作 HARD_DELETE 路徑（→ F12 cleanup-job）— F2.1 只**預留** AuditOperation::HardDelete enum 值 + AuditSource::Cleanup variant、實作留 F12 自行設計 cron + threshold + dry-run + cleanup_job actor

#### sys_operation_log_service 並存策略（FR-022 ~ FR-023）

- **FR-022**：F2.1 MUST 把既有 `sys_operation_log_service::handle_operation_log_event` 標 deprecated（既有 HTTP middleware 用、F2.1 改走 audit_log::write_in_txn 後此 trait method 0 callsite）；具體是否 remove trait + struct 由 plan 階段拍板（remove vs keep as no-op shim）
- **FR-023**：F3 既有 `audit_log::write_in_txn` 與 sys_operation_log_service 並存策略（F3 spec FR-020 列）在 F2.1 階段**統一收斂**為單一 audit_log::write_in_txn 入口

### Key Entities

#### `AuditOperation` enum（write 操作分類）

`server_core::web::audit::AuditOperation`（F2.1 新增）。5 個 variant：
- `Insert` — 新建 entity
- `Update` — 修改既有 entity
- `SoftDelete` — 軟刪（F3 既有路徑、F2.1 refactor 改用此 enum）
- `Restore` — 還原軟刪 entity（F3 既有路徑）
- `HardDelete` — 物理刪除（F2.1 預留、實作留 F12 cleanup-job）

提供 `as_str()` 方法返 SCREAMING_SNAKE_CASE 字串對應 DB 欄值。

#### `AuditSource` enum（audit 來源視角）

`server_core::web::audit::AuditSource`（F2.1 新增）。3 個 variant：
- `Http { method, url, ip, user_agent }` — HTTP middleware audit（method 為 POST/PUT/PATCH/DELETE）
- `Internal` — service-level audit（內部 method 呼叫、非 HTTP 觸發）
- `Cleanup` — F12 cleanup-job audit（actor 為 system "cleanup_job"）

source enum 內欄位由 audit_log::write_in_txn 解構並 mapping 到既有 sys_operation_log 欄（method / url / ip / user_agent）。

#### `AuditEvent<'a>` struct（audit 寫入單位）

`server_core::web::audit::AuditEvent<'a>`（F2.1 新增、取代 F3 AuditLogCtx）。9 個欄位：
- `actor: &'a Actor` — F3 既有、user_id/username/domain
- `operation: AuditOperation` — write 操作分類
- `entity_type: &'static str` — 對應 sys_operation_log.module_name（"sys_user" 等）
- `entity_id: String` — 對應 sys_operation_log.entity_id（sys_menu i32 用 to_string()）
- `payload_before: Option<JsonValue>` — 變動前 entity snapshot（INSERT=None / UPDATE=Some / SoftDelete=Some / Restore=Some）
- `payload_after: Option<JsonValue>` — 變動後 entity snapshot（INSERT=Some / UPDATE=Some / SoftDelete=None / Restore=Some）
- `description: Option<String>` — 可選 human-readable summary（None 時自動 `"{operation} id={entity_id}"`）
- `source: AuditSource` — audit 來源視角
- `request_id: Option<String>` — 可選、從 axum Extension<RequestId> 透傳

#### `AuditSerialize` trait（敏感欄位 redaction）

`server_model::admin::audit_serialize::AuditSerialize: Serialize`（F2.1 新增）。1 個 provided method：
- `fn redacted_fields() -> &'static [&'static str] { &[] }` — 預設空、每 entity 自行覆寫

helper function：
- `pub fn audit_snapshot<M: AuditSerialize>(model: &M) -> JsonValue` — serialize model 後依 redacted_fields() 替換 top-level field 為 `"<redacted>"`

7 entity 各自 impl AuditSerialize；sys_user 含 `password`、sys_access_key 含 `access_key_secret`、其他 5 個 default 空。

#### Migration 範式

1 個 migration 檔（`m20260514_h_extend_sys_operation_log_audit_fields.rs`）。`up()` 加 4 個欄位：
- ADD COLUMN operation VARCHAR(20) NOT NULL DEFAULT 'LEGACY'
- ADD COLUMN entity_id TEXT NULL
- ADD COLUMN payload_before JSONB NULL
- ADD COLUMN payload_after JSONB NULL

`down()` DROP 4 欄反向。

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：sys_operation_log 表 schema 含 4 新欄、既有 18 欄保留（psql `\d sys_operation_log` 驗）
- **SC-002**：F3 既有 acceptance tests（soft_delete_basics / audit_integration / auth_gate）在 F2.1 refactor 後仍 pass — `cargo test --test soft_delete_* -- --ignored` 全綠
- **SC-003**：7 個 admin entity impl AuditSerialize 都存在；sys_user::Model::redacted_fields() 含 "password"、sys_access_key::Model::redacted_fields() 含 "access_key_secret" — `grep -c 'impl AuditSerialize for ' server/model/src/admin/audit_serialize.rs` ≥ 7
- **SC-004**：F3 `AuditLogCtx` 已 deprecated 且 0 active callsite — grep `AuditLogCtx` 在 server/ 全 0 hit（除定義處）
- **SC-005**：CI audit-coverage-lint pass — bash `rust-api/scripts/ci-audit-coverage-lint.sh` exit 0；故意刪一個 service 內 `audit_log::write_in_txn` 呼叫應觸發 exit 1
- **SC-006**：admin user CRUD（create / update / delete）每個 HTTP call 在 sys_operation_log 留 1 row、operation enum 正確（INSERT / UPDATE / SOFT_DELETE）、entity_id 對應、payload_before/after 含完整 snapshot — 端到端 quickstart 驗
- **SC-007**：sys_user password / sys_access_key access_key_secret 在 audit payload 內為 `"<redacted>"`、永不出現原始值 — quickstart 驗 + acceptance test 覆蓋
- **SC-008**：業務 UPDATE 違反 unique constraint fail → audit row 不寫（transaction rollback 驗）— acceptance test 覆蓋
- **SC-009**：HTTP middleware audit 走新 audit_log::write_in_txn 路徑、source=Http、method/url/ip/user_agent 從 request 提取填充 — acceptance test 覆蓋
- **SC-010**：cargo check 全 workspace pass（無 warning -D unused-imports / dead_code）

---

## Assumptions

- **F3 已完成且 audit_log::write_in_txn 可順利擴 signature**：F3 spec FR-022 已預告 F2 schema 升級時 callsite 不需動；F2.1 refactor write_in_txn 改接 AuditEvent 是 inner detail change、不破壞既有 F3 facade soft_delete_by_id / restore_by_id 外部簽名
- **既有 sys_operation_log 表 row 數可接受 ALTER TABLE**：rev1 dev 階段 admin 操作量低、ALTER TABLE 鎖表時間短；生產環境 rollout 階段（未來）可選 pg_repack / online migration 工具，F2.1 不規定
- **JSONB 對 rev1 admin entity payload 容量足夠**：admin entity Model 序列化平均 < 2KB、PostgreSQL JSONB 16MB 上限遠遠夠用
- **serde derive Serialize 對 7 admin entity 都已存在或可低成本加**：F3 階段 6/7 entity 已 derive Serialize（含 sys_user 已用於 API response）；F2.1 確認任何缺漏（plan 階段量化）
- **HTTP middleware 內可取得 request_id**：既有 axum Extension<RequestId> middleware 已存在（F4 spec 用過）、F2.1 audit middleware 從同 Extension 取
- **rev1 沒跨服務 Casbin pub-sub 需求**：F2.1 階段所有寫 audit 都在單服務 rust process 內、no redis publish 需求、outbox 留 F2.2
- **F2.2 / F12 設計階段可基於 F2.1 enum 直接擴**：AuditOperation::HardDelete + AuditSource::Cleanup 已預留、F12 cleanup-job 自身在自己的 feature spec 內定義 actor + cron + threshold + dry-run、無需動 F2.1 audit infrastructure
- **AuditSerialize trait 對 admin entity 足夠、不涉 nested redaction**：sys_user / sys_access_key 的敏感欄位都是 top-level String、無 nested struct 需 redact；其他 5 個 entity 無敏感欄位；F2.1 redaction 機制 shallow only 即可
- **既有 sys_operation_log_service::handle_operation_log_event** 可移除或保留為 no-op：F2.1 內 HTTP middleware 改路徑後此 trait method 0 callsite；plan 階段可選 remove trait + impl + struct（cleaner）或保留為 deprecated shim（更保守）；不影響 F2.1 spec 範圍
- **CI lint 規則複雜度可控**：rev1 admin entity 數量固定（7）、service 結構規律（每個 sys_<x>_service.rs 有 create_x / update_x method）、grep / awk 規則 plan 階段可量化；若 grep 不足精準、可選 cargo clippy custom lint（plan 階段拍板）
- **F4 envelope code 對齊**：error 路徑回 `code::CODE_SERVER_DB_ERROR (9001)` — F4 既建構的 24 個 business code 常數延用、F2.1 不擴張 namespace
