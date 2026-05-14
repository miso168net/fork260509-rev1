# Research: F2.1 — audit-log-infrastructure

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) + [`plan.md`](./plan.md) + 2026-05-14 rust-api / migration / service codebase audit

## Audit Summary（執行於 2026-05-14）

| Audit Item | 結果 |
|---|---|
| sys_operation_log entity 既有結構 | 18 fields 確認 — id / user_id / username / domain / module_name / description / request_id / method / url / ip / user_agent / params / body / response / start_time / end_time / duration / created_at（其中 params / body / response 已是 `JsonBinary` nullable） |
| Sea-ORM JSONB 支援 | ✅ sea-orm 1.x via `column_type = "JsonBinary"` + entity field type `Option<JsonValue>`（既有 params/body/response 用法）；F2.1 4 新欄沿用 |
| Sea-ORM JsonValue 路徑 | `sea_orm::JsonValue` / `serde_json::Value`（互通）；entity 內既有 `use serde_json::Value as JsonValue` |
| 7 admin entity service write method 命名 | ✅ 全符 `create_<x>` / `update_<x>` 命名約定（sys_user/role/menu/domain 各 2 個、sys_access_key 只 create）+ sys_organization read-only + sys_endpoint 走 `sync_endpoints`（內部 batch、非 CRUD pattern）|
| F3 facade soft_delete_by_id / restore_by_id callsite | 7 個 facade 各 2 個（共 14 個 callsite）— F2.1 內部 refactor 走 AuditEvent、外部簽名不變（per F3 spec FR-022）|
| operation_log_middleware 既有結構 | `server-middleware/src/operation_log_middleware.rs` — F4 階段已存在；F2.1 refactor 改走 audit_log::write_in_txn |
| AuditLogCtx F3 既有 callsite 數 | 14 個（7 facade × 2 op）；F2.1 refactor 後全改用 AuditEvent；AuditLogCtx 加 #[deprecated] + 過渡 From shim |
| sea-orm-migration ALTER TABLE 加 NOT NULL DEFAULT | ✅ 支援；既有 m20260514 migration（F3 系列）用 raw SQL `execute_unprepared("ALTER TABLE ... ADD COLUMN ... DEFAULT '...'")` 或 sea-query `ColumnDef::new().default()` pattern |
| GHA workflow CI lint trigger pattern | F3 `.github/workflows/ci-soft-delete-lint.yml` 已建立、F2.1 沿用 trigger 模式 |

---

## Resolved Decisions（R1 ~ R7）

### R1 — sys_operation_log 4 新欄 sea-orm migration 寫法

- **Decision**：用 raw SQL `manager.get_connection().execute_unprepared(...)` ALTER TABLE × 4 步驟、與 F3 既有 m20260514_* migration 風格一致：

```rust
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_operation_log ADD COLUMN operation VARCHAR(20) NOT NULL DEFAULT 'LEGACY'"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_operation_log ADD COLUMN entity_id TEXT NULL"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_operation_log ADD COLUMN payload_before JSONB NULL"
).await?;
manager.get_connection().execute_unprepared(
    "ALTER TABLE sys_operation_log ADD COLUMN payload_after JSONB NULL"
).await?;
```

`down()` 反向 DROP 4 欄。

- **Rationale**: 與 F3 既有 migration 風格一致（沿 `m20260514_a..g` raw SQL pattern）、ALTER TABLE NOT NULL DEFAULT 自動 backfill 既有 row 為 `'LEGACY'`、無需手動 backfill；JSONB column type 與既有 params/body/response 對齊。
- **Alternatives considered**:
  - sea-query `ColumnDef::new(...).default(...)` builder pattern：可行但對 ALTER TABLE 多步驟支援不完整、用 raw SQL 更明確
  - Migration 內手動 backfill `UPDATE sys_operation_log SET operation = 'LEGACY' WHERE operation IS NULL`：不需要、NOT NULL DEFAULT 自動處理

### R2 — sys_operation_log entity Model 對應修改

- **Decision**：`rust-api/server/model/src/admin/entities/sys_operation_log.rs` 內 `pub struct Model` 加 4 個 field：

```rust
#[sea_orm(column_type = "Text")]
pub operation: String,                                  // NEW (NOT NULL、預設 "LEGACY" by migration backfill)
#[sea_orm(column_type = "Text", nullable)]
pub entity_id: Option<String>,                          // NEW
#[sea_orm(column_type = "JsonBinary", nullable)]
pub payload_before: Option<JsonValue>,                  // NEW
#[sea_orm(column_type = "JsonBinary", nullable)]
pub payload_after: Option<JsonValue>,                   // NEW
```

`Column` enum 隨 `DeriveEntityModel` macro 自動展開、含 `Operation` / `EntityId` / `PayloadBefore` / `PayloadAfter` 4 variant。

- **Rationale**: 沿 F3 entity 模式（per F3 R2 add `deleted_at` 同方式）；既有 18 fields 順序保留、4 新欄 append 到 Model 末尾 `created_at` 之後。
- **Alternatives considered**:
  - Schema-only 不動 entity：不可行、entity Model 不更新後 service code 無法用 typed field 寫 audit row

### R3 — AuditEvent struct lifetime + ownership 設計

- **Decision**：`AuditEvent<'a>` lifetime 對 `actor: &'a Actor`、其他 fields 全 owned（per F3 既有 AuditLogCtx pattern）：

```rust
pub struct AuditEvent<'a> {
    pub actor: &'a Actor,
    pub operation: AuditOperation,
    pub entity_type: &'static str,
    pub entity_id: String,
    pub payload_before: Option<JsonValue>,
    pub payload_after: Option<JsonValue>,
    pub description: Option<String>,
    pub source: AuditSource,
    pub request_id: Option<String>,
}
```

- **Rationale**: actor 來自 `Extension<User>` 透傳（&User → &Actor）— 借用一次 lifetime；其他 fields 是構造時計算的擁有值（snapshot / id / description）。
- **Alternatives considered**:
  - 全 owned (`actor: Actor`)：每呼叫 audit 多 1 個 clone（3 strings）；可接受但無必要
  - 全借用：description / entity_id 等是 caller 構造的臨時 string、ownership 需轉移到 audit row、無法借用

### R4 — `AuditSerialize` trait redaction 實作

- **Decision**：`audit_snapshot(&model)` 內部 `serde_json::to_value(model)` → 對返回 Value 若是 Object、針對 `M::redacted_fields()` 列出的 key 替換 value 為 `JsonValue::String("<redacted>".to_string())`：

```rust
pub fn audit_snapshot<M: AuditSerialize>(model: &M) -> JsonValue {
    let mut v = serde_json::to_value(model).unwrap_or(JsonValue::Null);
    if let Some(obj) = v.as_object_mut() {
        for field in M::redacted_fields() {
            if obj.contains_key(*field) {
                obj.insert(field.to_string(), JsonValue::String("<redacted>".to_string()));
            }
        }
    }
    v
}
```

- **Rationale**: serde 對 derive Serialize entity Model 預設用 field 名作 key（per `#[serde(rename_all = "camelCase")]` 影響、F4 已套）；redaction 是 post-serialize 操作、不需 procedural macro；fail-safe（serialize 失敗或 non-object 回 Null）。
- **Alternatives considered**:
  - Procedural macro `#[derive(AuditSerialize)]` 自動生成 redacted_fields：增 build-time complexity、ROI 低
  - 為每 entity 寫 AuditModel 變體（含 `#[serde(skip)] password`）：14 個變體要同步維護、違 DRY

### R5 — 既有 sys_operation_log_service trait 處理策略（spec FR-022）

- **Decision**：F2.1 內 HTTP middleware refactor 後、`sys_operation_log_service::handle_operation_log_event` trait method 0 callsite。具體處理 plan tasks 階段拍板兩選一：

| 選項 | 動作 | Pros / Cons |
|---|---|---|
| **A (Recommended)** | 完全 remove trait + struct + impl | cleaner、no dead code；refactor 不可逆 |
| B | Mark trait + impl 為 `#[deprecated(since = "F2.1", note = "use audit_log::write_in_txn")]`、留作 no-op shim | 過渡更保守、F2.2+ 可 remove；多保留一個 stale 抽象 |

- **Rationale**: F2.1 是 atomic refactor、F3 既有 callsite 全 migrate；保留 trait 仅增加 cognitive load、無 forward compat 必要（F2.2 outbox + redis 走新 helper）。
- **Alternatives considered**:
  - 重命名 trait 為 `LegacyAuditService`：誤導性、實際無 legacy 路徑需要它

### R6 — HTTP middleware entity_type Hybrid rule 實作（spec FR-015、clarify Q2）

- **Decision**：middleware 內用 regex match 7 條 admin URL pattern → kebab → snake：

```rust
// pseudocode in operation_log_middleware
let entity_type = match url_path {
    p if p.starts_with("/api/sys-user")         => "sys_user",
    p if p.starts_with("/api/sys-role")         => "sys_role",
    p if p.starts_with("/api/sys-menu")         => "sys_menu",
    p if p.starts_with("/api/sys-domain")       => "sys_domain",
    p if p.starts_with("/api/sys-organization") => "sys_organization",
    p if p.starts_with("/api/sys-endpoint")     => "sys_endpoint",
    p if p.starts_with("/api/sys-access-key")   => "sys_access_key",
    _                                            => "http_event",
};
```

- **Rationale**: prefix match 簡單可讀、url path 由 axum 提供；7 pattern 與 spec FR-015 明示列表對齊、新增 entity 時手動擴充（無 magic auto-derive、明示優於隱含）。
- **Alternatives considered**:
  - 動態 regex `/api/sys-([a-z-]+)(/.*)?` 自動抽取：泛化但對 `/api/manage/user` 等不 match pattern；spec 明示 7 條、不過度設計
  - URL path 第二段 segment 取出（`p.split('/').nth(2)`）：脆性高（URL 結構變動會壞）

### R7 — HTTP method → AuditOperation 推導 + GET 路徑跳過 audit（spec FR-015）

- **Decision**：middleware 預檢 method、GET/HEAD/OPTIONS → 直接 next.run(req)、不寫 audit；POST → Insert / PUT|PATCH → Update / DELETE → SoftDelete：

```rust
let operation = match req.method() {
    &Method::POST => AuditOperation::Insert,
    &Method::PUT | &Method::PATCH => AuditOperation::Update,
    &Method::DELETE => AuditOperation::SoftDelete,
    // GET / HEAD / OPTIONS / TRACE → 不寫 audit
    _ => return next.run(req).await,
};
```

- **Rationale**: read path 不寫 audit（per Constitution §II + spec FR-015）；early return 減少 read 路徑開銷；DELETE → SoftDelete 沿 F3 rust 全軟刪原則。
- **Alternatives considered**:
  - 為 GET 也寫 audit row：違反 §II、空污 audit 表
  - 在 service-level audit 重複 method 推導：DRY violation（middleware 處 method、service handler 處 operation enum、兩處不該共識）

---

## Outstanding Items（plan 階段未拍板、留 `/speckit-tasks` 階段處理）

| Item | 為何 defer | Owner phase |
|---|---|---|
| `sys_operation_log_service` trait remove vs no-op shim（R5）| 兩選項都可行、影響範圍小（無 callsite 後）、tasks 階段量化決定 | `/speckit-tasks` |
| `sys_organization_service` 是否有需 audit 的 write method | 既有 service file 看似 read-only（無 create/update method）；tasks 階段確認 + 對應 audit 是否需要 | `/speckit-tasks` |
| `sys_endpoint_service::sync_endpoints` 內部 insert/update path audit 細節 | 非 CRUD 模式（batch upsert + soft delete loop）、tasks 階段對 ActiveModel.insert/update callsite 逐一加 audit | `/speckit-tasks` |
| `entity_id` 對 sys_menu i32 PK 的轉換策略 | i32 → String 用 `to_string()` 是顯式 / per-callsite；tasks 階段確認所有 service 內 entity_id 構造一致 | `/speckit-tasks` |
| F3 既有 facade soft_delete_by_id / restore_by_id 內 fetch_before 對 sys_endpoint i32 PK 的處理 | F3 既有 sys_menu 走 i32、entity_id 轉 String；F2.1 內部 refactor 沿用 | `/speckit-tasks` |
| CI lint script grep 規則的具體 awk pattern（method scope detection）| 多種實作可能（簡單 grep 跨行 / awk function 範圍掃描）；tasks 階段量化 | `/speckit-tasks` |
| `description` 欄 caller 不填的自動 fallback 是否要對所有 operation 統一 format | spec FR-007 已定 `"{operation} id={entity_id}"`、tasks 階段確認所有 callsite 不 override | `/speckit-tasks` |
| `Extension<RequestId>` typed wrapper 在 rev1 是否已存在（用於 HTTP middleware audit `request_id` 透傳） | data-model.md §E9 假設存在、未在 codebase 驗證；implementer 階段第一個 task 跑前 grep 確認；不存在則 fallback axum-extra 內建 request_id middleware 或加 typed wrapper（per analyze 2026-05-14 M2） | `/speckit-implement` 第一個 task 跑前 |

---

**Phase 0 結論**：✅ 所有 spec-level 與架構級 decision 都已 resolve；codebase audit 確認 sys_operation_log entity 18 fields + JSONB column type 既有支援 + service create_/update_ method 命名規律；可進入 Phase 1（data-model / contracts / quickstart）。
