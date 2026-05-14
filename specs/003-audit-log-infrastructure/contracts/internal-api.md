# Internal API Contracts: F2.1 — audit-log-infrastructure

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](../spec.md) §Acceptance Scenarios + [`data-model.md`](../data-model.md) E2-E10

> F2.1 不引入新 HTTP endpoint。本檔列出 **F2.1 新增 / 改寫的 Rust internal API surface**（enum + struct + trait + helper fn）、供 implementation 階段對照與 acceptance test 撰寫。

---

## C1. `AuditOperation` enum

**Path**: `server_core::web::audit::AuditOperation`

**Contract**:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuditOperation {
    Insert,
    Update,
    SoftDelete,
    Restore,
    HardDelete,
}

impl AuditOperation {
    pub fn as_str(&self) -> &'static str;
}

impl std::fmt::Display for AuditOperation;   // 對應 format! 用
```

**Caller contract**:
- service handler + middleware + F12 cleanup-job 用 `AuditOperation::*` 構造 AuditEvent
- `as_str()` 回傳 SCREAMING_SNAKE_CASE（"INSERT" / "UPDATE" / "SOFT_DELETE" / "RESTORE" / "HARD_DELETE"）對應 sys_operation_log.operation 欄值
- `HardDelete` variant **F2.1 預留**、實作留 F12 cleanup-job

---

## C2. `AuditSource` enum

**Path**: `server_core::web::audit::AuditSource`

**Contract**:

```rust
#[derive(Clone, Debug)]
pub enum AuditSource {
    Http {
        method: String,
        url: String,
        ip: String,
        user_agent: Option<String>,
    },
    Internal,
    Cleanup,
}
```

**Caller contract**:
- HTTP middleware 構造 `AuditSource::Http { ... }`（method/url/ip/user_agent 從 request 取）
- Service handler 構造 `AuditSource::Internal`
- F12 cleanup-job 構造 `AuditSource::Cleanup`（F2.1 預留）
- `audit_log::write_in_txn` 內部解構 + mapping 到既有 sys_operation_log 欄（method/url/ip/user_agent）

---

## C3. `AuditEvent<'a>` struct

**Path**: `server_core::web::audit::AuditEvent`

**Contract**:

```rust
#[derive(Clone, Debug)]
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

**Caller contract**:

| Field | 來源 | 規則 |
|---|---|---|
| `actor` | `Actor::from(&user)` (HTTP) / `Actor::system("...")` (Internal/Cleanup) | borrow `&Actor`、lifetime 'a |
| `operation` | caller 知道做什麼 | INSERT/UPDATE/SOFT_DELETE/RESTORE/HARD_DELETE 五選一 |
| `entity_type` | const string | sys_user / sys_role / etc.（middleware 走 Hybrid rule、per spec FR-015）|
| `entity_id` | INSERT 新 row id / UPDATE/DELETE 既有 id；i32 PK 轉 String | 必填、可空字串（middleware 抽不到時） |
| `payload_before` | INSERT=None / UPDATE=`Some(audit_snapshot(&before))` / SoftDelete=`Some(snapshot)` / Restore=`Some(snapshot)` | 對 entity Model 走 `audit_snapshot` 確保 redaction |
| `payload_after` | INSERT=`Some(snapshot)` / UPDATE=`Some(snapshot)` / SoftDelete=None / Restore=`Some(snapshot)` | 同上 |
| `description` | None → 自動 `"{operation} id={entity_id}"`（per FR-007）；caller 可選明示 | 可選 |
| `source` | Http/Internal/Cleanup 三選一 | 必填 |
| `request_id` | axum `Extension<RequestId>` 透傳；service-level 可 None | 可選 |

---

## C4. `AuditSerialize` trait + `audit_snapshot` helper

**Path**: `server_model::admin::audit_serialize::AuditSerialize`、`server_model::admin::audit_serialize::audit_snapshot`

**Trait contract**:

```rust
pub trait AuditSerialize: serde::Serialize {
    fn redacted_fields() -> &'static [&'static str] { &[] }
}

pub fn audit_snapshot<M: AuditSerialize>(model: &M) -> JsonValue;
```

**Implements**（7 個）：
- `impl AuditSerialize for sys_user::Model` — `redacted_fields() = &["password"]`
- `impl AuditSerialize for sys_access_key::Model` — `redacted_fields() = &["access_key_secret"]`
- `impl AuditSerialize for sys_role::Model` — default empty
- `impl AuditSerialize for sys_menu::Model` — default empty
- `impl AuditSerialize for sys_domain::Model` — default empty
- `impl AuditSerialize for sys_organization::Model` — default empty
- `impl AuditSerialize for sys_endpoint::Model` — default empty

**Behavior contract**:

| Method | Pre-condition | Post-condition | Error cases |
|---|---|---|---|
| `audit_snapshot(&model)` | `model: &impl AuditSerialize` | 返回 JSON Value、redacted_fields 列出的 top-level field 替換為 `JsonValue::String("<redacted>")` | None（serialize 失敗返 `JsonValue::Null` 容錯、不 panic）|

**Caller contract**:
- Service handler 用 `audit_snapshot(&model)` 在 INSERT/UPDATE 後抓 entity 完整 snapshot
- 對 sys_user / sys_access_key 走 trait 自動處理敏感欄位 redaction
- Middleware 不呼叫 audit_snapshot（middleware 無 entity Model context）— payload_before/after 全填 None

---

## C5. `audit_log::write_in_txn` (refactor)

**Path**: `server_model::admin::audit_log::write_in_txn`

**Signature**:

```rust
pub async fn write_in_txn(
    txn: &DatabaseTransaction,
    event: AuditEvent<'_>,
) -> Result<(), AppError>;
```

**Behavior contract**:
- 在 caller 傳入的 transaction 內 INSERT 一筆 `sys_operation_log` row
- Row 22 欄（18 既有 + 4 新）填充 per [data-model.md §E6](../data-model.md#e6-audit_logwrite_in_txn-refactor接-auditevent)
- Caller 不可在此 helper 內 commit（commit 由 caller 負責、保持 atomicity）
- 寫入失敗時返回 `AppError { code: code::CODE_SERVER_DB_ERROR (9001), ... }` — caller 應 rollback transaction

**Backward compatibility from F3**:
- F3 既有 signature `(txn, ctx: AuditLogCtx)` 改為 `(txn, event: AuditEvent)`
- 過渡：`AuditLogCtx` 加 `#[deprecated]`、提供 `From<&AuditEvent>` shim
- F3 既有 facade 7 個檔內 `soft_delete_by_id` / `restore_by_id` callsite **全部** refactor 用 `AuditEvent`（F2.1 內、不留 F3 既有 callsite 走 deprecated path）

---

## C6. F3 facade refactor 契約（spec FR-012）

**Path**: `server_model::admin::facade::sys_*::soft_delete_by_id` / `restore_by_id`（7 個）

**Signature**（不變、per F3 spec FR-022 ext API stability）：

```rust
pub async fn soft_delete_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: <PK type>, actor: &Actor,
) -> Result<(), AppError>;

pub async fn restore_by_id<C: ConnectionTrait + TransactionTrait>(
    db: &C, id: <PK type>, actor: &Actor,
) -> Result<(), AppError>;
```

**Internal behavior change**:

- `soft_delete_by_id` 內加 fetch_before（用 find_active filter id）取 active 態 snapshot
- `restore_by_id` 內加 fetch_before（find filter is_not_null）+ fetch_after（find_active）取兩 snapshot
- audit 寫入用 `AuditEvent { operation: SoftDelete/Restore, payload_before/after, source: Internal, ... }`
- sys_menu / sys_organization 樹狀 cascade check 不變（per F3 FR-026/027）

**Error cases**: 同 F3 spec FR-012（rows_affected = 0 → 6001、tree-cascade 阻擋 → 6003 in sys_menu/organization）；F2.1 不改 F3 error contract

---

## C7. 7 admin entity service create_/update_ 契約

**Path**: `server_service::admin::sys_<x>_service::T<X>Service::{create_<x>, update_<x>}`

**Signature**（F2.1 加 `actor: &Actor`）：

```rust
async fn create_<x>(&self, input: Create<X>Input, actor: &Actor) -> Result<<X>Output, AppError>;
async fn update_<x>(&self, input: Update<X>Input, actor: &Actor) -> Result<<X>Output, AppError>;
```

**Internal behavior contract**（per spec FR-010/011）：

| Method | Pre | Steps | Post | Errors |
|---|---|---|---|---|
| `create_<x>` | input validated | (1) `db.begin()` (2) any pre-check (3) `ActiveModel.insert(&txn)` (4) `audit_log::write_in_txn(AuditEvent { operation: Insert, payload_after: Some(audit_snapshot(&new)), source: Internal, .. })` (5) `txn.commit()` | new row 寫入 + audit row 同 txn 寫入 | unique violation → service-specific error；db error → 9001；audit insert fail → 9001 整體 rollback |
| `update_<x>` | input.id 對應 active row | (1) `db.begin()` (2) `find_active(id).one(&txn)` → before (3) `ActiveModel.update(&txn)` → after (4) audit_log::write_in_txn(AuditEvent { operation: Update, payload_before, payload_after, source: Internal, .. })` (5) `txn.commit()` | row updated + audit row 同 txn 寫入 | not-found → service-specific error；db error / audit fail → 9001 整體 rollback |

**Caller (API handler) contract**:

```rust
pub async fn create_user(
    Extension(service): Extension<Arc<SysUserService>>,
    Extension(user): Extension<User>,
    ValidatedForm(input): ValidatedForm<CreateUserInput>,
) -> Result<Res<UserWithoutPassword>, AppError> {
    let actor = Actor::from(&user);
    service.create_user(input, &actor).await.map(Res::new_data)
}
```

API handler 模式對齊 F3 G8 既有 delete handler。

---

## C8. HTTP middleware audit 契約（spec FR-014/015、clarify Q1/Q2）

**Path**: `server_middleware::operation_log_middleware`

**Behavior contract**（refactor）:

```text
Pre-execution:
  1. extract HTTP method
  2. method ∈ {GET, HEAD, OPTIONS, TRACE} → next.run(req); return (no audit)
  3. method ∈ {POST, PUT, PATCH, DELETE} → derive AuditOperation
  4. extract user (from Extension<User>) + url + ip + user_agent + request_id

Execute:
  5. response = next.run(req).await

Post-execution:
  6. compute entity_type via Hybrid rule (7 admin patterns + fallback "http_event")
  7. construct AuditEvent { source: Http {...}, operation, entity_type, ... }
  8. audit_log::write_in_txn(&txn, event)
     - 失敗 → log warn + continue (per spec edge case「跨資源 side effect 失敗不影響 audit log 主要正確性」)
     - 不 dedupe with service-level audit (per clarify Q1)
  9. return response
```

**Output contract**:
- 每個 admin HTTP write call 留 2 row in sys_operation_log：
  - 1 row from middleware (method="POST"/PUT/PATCH/DELETE、operation=Insert/Update/SoftDelete)
  - 1 row from service handler (method="INTERNAL"、operation=Insert/Update/SoftDelete)
- 兩 row 都 share 同一 entity_type（middleware 走 Hybrid rule、service handler 明示填）

---

## C9. CI lint contract（spec FR-016/017）

**Path**: `rust-api/scripts/ci-audit-coverage-lint.sh` + `.github/workflows/ci-audit-coverage-lint.yml`

**Script contract**: 對 `server/service/src/admin/sys_*_service.rs` 的 `create_<x>` / `update_<x>` async fn block 範圍掃描：
- 命中 `audit_log::write_in_txn` 或 `AuditEvent` 字串 → pass
- 全部 block 都命中 → exit 0
- 任一 block 漏 → exit 1 + 列出 file:line + method name

**Whitelist 處理**:
- F3 既有 facade `soft_delete_by_id` / `restore_by_id` 在 facade 不在 service、grep 範圍外、自然 whitelist
- 非 CRUD 命名 method（如 `assign_role` / `change_password`）F2.1 範圍外、不掃描

**Workflow contract**:

```yaml
name: ci-audit-coverage-lint
on:
  push:
    branches: [main, rev1-admin-root, '00*-**']
  pull_request:
    branches: [main, rev1-admin-root]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - run: bash rust-api/scripts/ci-audit-coverage-lint.sh
```

---

## C10. 對外 HTTP API 影響（per spec scope）

F2.1 **不**新增 / 不變動 HTTP endpoint。具體影響表：

| 既有 endpoint | F2.1 變化 | 對 base 影響 |
|---|---|---|
| `POST /api/sys-user` (其他 admin create_user/role/menu/domain 類推) | service 改用 `audit_log::write_in_txn(AuditEvent { ... })`、API handler 加 `Extension<User>` 透傳 — 但 HTTP shape 不變、admin 拿到 envelope `{code: 0, ...}` 表 success | base UI 顯示「新增成功」、不感知 audit |
| `PUT /api/sys-user/:id`（其他 admin update_x 類推） | 同上 | 同上 |
| `DELETE /api/sys-user/:id`（已 F3 delete 覆蓋） | F3 facade 內部 refactor 走 AuditEvent、SOFT_DELETE row 結構改為 operation enum + payload_before snapshot | 同上 |
| HTTP middleware audit row | refactor 走 audit_log::write_in_txn、source=Http、operation/entity_type 從 method/URL 推導 | N/A（不影響 base 行為） |
| service-level audit row | F2.1 新增 INSERT/UPDATE row、operation enum 結構化 | N/A |

---

**Contract testing**：每個 C1-C9 都有對應 acceptance scenario（spec.md scenarios 1-16）+ `/speckit-tasks` 階段產出對應 cargo test 案例（continue F3 既有 `#[ignore]` real-postgres pattern）。
