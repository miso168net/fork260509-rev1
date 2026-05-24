# Data Model: 045 facade-atomicity-pass

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

045 為 rust-api code refactor + 1 redis pub-sub channel + 2 metric pre-declare、**無 application data entity 改動**（0 schema migration）；本檔以「API surface / channel / metric design」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. Facade API surface 擴充（US1 + US3、FR-001/002）

### E1.1 既有 sys_endpoint facade

```rust
// rust-api/server/model/src/admin/facade/sys_endpoint.rs（既有）
pub fn find_active() -> Select<_entity::Entity>;
pub fn find_with_deleted() -> Select<_entity::Entity>;
pub async fn soft_delete_by_id<C>(db: &C, id: String, actor: &Actor) -> Result<(), AppError>
    where C: ConnectionTrait + TransactionTrait;
pub async fn restore_by_id<C>(db: &C, id: String, actor: &Actor) -> Result<(), AppError>
    where C: ConnectionTrait + TransactionTrait;
```

### E1.2 045 新增 facade API

```rust
// rust-api/server/model/src/admin/facade/sys_endpoint.rs（045 加）

/// 045 US1 / FR-001: facade INSERT/UPDATE surface。
/// fetch before snapshot by id (PK; deterministic from path+method per generate_id);
/// None → INSERT + audit Insert; Some + diff → UPDATE + audit Update with before/after; Some + no diff → noop。
pub async fn upsert_with_audit<C>(
    db: &C,
    endpoint: SysEndpointModel,
    actor: &Actor,
) -> Result<(), AppError>
where
    C: ConnectionTrait + TransactionTrait,
{
    let txn = db.begin().await?;

    let before = _entity::Entity::find()
        .filter(_entity::Column::Id.eq(&endpoint.id))
        .filter(_entity::Column::DeletedAt.is_null())
        .one(&txn)
        .await?;

    let (operation, payload_before, payload_after) = match before {
        None => {
            // INSERT
            let active: _entity::ActiveModel = endpoint.clone().into();
            active.insert(&txn).await?;
            (AuditOperation::Insert, None, Some(audit_snapshot(&endpoint)))
        }
        Some(before_row) => {
            // 045-N2 erratum：早期字面 spec 用整 Model PartialEq 判 noop（whole-Model
            // 比較），但 caller `router_initialization.rs:419,426` 每啟動 regen
            // `display_id`（snowflake）+ `created_at`（Local::now），整 Model PartialEq
            // 永遠 false → 每重啟 audit 噴洗 N 筆。改用 6 業務欄位 semantic compare 判 noop。
            let same_business = before_row.path == endpoint.path
                && before_row.method == endpoint.method
                && before_row.action == endpoint.action
                && before_row.resource == endpoint.resource
                && before_row.controller == endpoint.controller
                && before_row.summary == endpoint.summary;
            if same_business {
                // no diff → noop（不 audit）
                txn.commit().await?;
                return Ok(());
            }
            // UPDATE 路徑：preserve `before_row.created_at` + `before_row.display_id`、
            // 只 Set 6 業務 column + `updated_at = now`（避免隨機 display_id / 啟動時間
            // 假 diff 寫回 DB）。
            let mut active: _entity::ActiveModel = before_row.clone().into();
            active.path = Set(endpoint.path);
            active.method = Set(endpoint.method);
            active.action = Set(endpoint.action);
            active.resource = Set(endpoint.resource);
            active.controller = Set(endpoint.controller);
            active.summary = Set(endpoint.summary);
            active.updated_at = Set(Some(Local::now().naive_local()));
            let updated = active.update(&txn).await?;
            (
                AuditOperation::Update,
                Some(audit_snapshot(&before_row)),
                Some(audit_snapshot(&updated)),
            )
        }
    };

    audit_log::write_in_txn(
        &txn,
        AuditEvent {
            actor,
            operation,
            entity_type: "sys_endpoint",
            entity_id: endpoint.id.clone(),
            payload_before,
            payload_after,
            description: None,
            source: AuditSource::Internal,
            request_id: None,
        },
    )
    .await?;

    txn.commit().await?;
    Ok(())
}

/// 045 US3 / FR-002: batch soft-delete with per-id policy。
/// Per-id 走既有 soft_delete_by_id (own txn + audit per row);
/// LogAndContinue 失敗 row 紀錄 result.failed + tracing::warn!;
/// FailFast 首失敗即 propagate（已 commit row 不 rollback、per-id 各自 own txn）。
pub async fn batch_soft_delete_with_audit<C>(
    db: &C,
    ids: Vec<String>,
    actor: &Actor,
    policy: BatchDeletePolicy,
) -> Result<BatchDeleteResult, AppError>
where
    C: ConnectionTrait + TransactionTrait,
{
    let mut result = BatchDeleteResult::default();
    for id in ids {
        match soft_delete_by_id(db, id.clone(), actor).await {
            Ok(()) => result.ok.push(id),
            Err(e) => match policy {
                BatchDeletePolicy::FailFast => return Err(e),
                BatchDeletePolicy::LogAndContinue { target } => {
                    // 045-N2 erratum：早期字面 spec 用 `target:` macro 屬性語法接 runtime
                    // var，但 `target:` 形式要求 `&'static str` const（runtime var 編譯報
                    // E0435）。改用 structured field 形式（key = value）、序列化結果
                    // 仍含 `target=…` 對齊 Loki 索引慣例。
                    tracing::warn!(
                        target = target,
                        id = %id,
                        error = ?e,
                        "batch_soft_delete: per-row soft_delete failed"
                    );
                    result.failed.push((id, e));
                }
            },
        }
    }
    Ok(result)
}

/// 045 US3 / FR-002: per-id failure policy for batch_soft_delete_with_audit。
#[derive(Debug, Clone, Copy)]
pub enum BatchDeletePolicy {
    FailFast,
    LogAndContinue { target: &'static str },
}

/// 045 US3 / FR-002: result struct for batch_soft_delete_with_audit。
#[derive(Debug, Default)]
pub struct BatchDeleteResult {
    pub ok: Vec<String>,
    pub failed: Vec<(String, AppError)>,
}
```

---

## E2. Pub-sub channel spec（US2、FR-004/005）

### E2.1 既有 channel（W-F11 + 042）

| Channel | 來源 | Payload | Subscriber |
|---|---|---|---|
| `casbin:policy:invalidate` | W-F11 | `"1"` (constant signal) | `spawn_casbin_sync_subscriber` (all rust-api replicas reload Casbin policy) |
| `audit:events` (Stream) | 042 | JSON serialized AuditEventOwned | drainer 消費後寫 sys_operation_log |

### E2.2 045 新增 channel

| Channel | Payload | Publisher | Subscriber |
|---|---|---|---|
| `api_key:invalidate` | `"1"` (constant signal、與 casbin 體例對齊) | `notify_api_key_changed()` 在 `delete_access_key` 內呼叫 | `spawn_api_key_sync_subscriber` (all replicas 含 publisher 自己 reload api_keys) |

### E2.3 Publisher 邏輯（`server/global/src/api_key_notify.rs`、新檔）

```rust
pub const API_KEY_INVALIDATE_CHANNEL: &str = "api_key:invalidate";
const API_KEY_INVALIDATE_PAYLOAD: &str = "1";

/// 045 FR-004: publish invalidate signal to all rust-api replicas。
/// fire-and-forget: redis 不可用 / non-Single mode 皆 log warning 並 no-op、不阻斷呼叫端。
pub async fn notify_api_key_changed() {
    // 1. 取 GLOBAL_PRIMARY_REDIS、check Single mode（對齊 casbin_notify.rs）
    let client = match GLOBAL_PRIMARY_REDIS.read().await.as_ref() {
        Some(RedisConnection::Single(c)) => c.clone(),
        Some(RedisConnection::Cluster(_)) => {
            tracing::warn!("notify_api_key_changed: Cluster mode unsupported, skip");
            return;
        }
        None => {
            tracing::warn!("notify_api_key_changed: GLOBAL_PRIMARY_REDIS not init, skip");
            return;
        }
    };

    // 2. 取 multiplexed connection
    let mut conn = match client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => { tracing::warn!("notify_api_key_changed: redis connect failed: {}", e); return; }
    };

    // 3. PUBLISH
    let result: redis::RedisResult<()> = redis::cmd("PUBLISH")
        .arg(API_KEY_INVALIDATE_CHANNEL)
        .arg(API_KEY_INVALIDATE_PAYLOAD)
        .query_async(&mut conn)
        .await;

    // 4. metric instrument + log（對齊 044 體例）
    match result {
        Ok(_) => {
            metrics::counter!("api_key_invalidate_total").increment(1);
        }
        Err(e) => {
            tracing::warn!("notify_api_key_changed: PUBLISH failed: {}", e);
        }
    }
}
```

### E2.4 Subscriber 邏輯（`server/initialize/src/api_key_sync_initialization.rs`、新檔）

```rust
const RECONNECT_BACKOFF: Duration = Duration::from_secs(5);

/// 045 FR-005: spawn background task subscribed to api_key:invalidate channel。
pub fn spawn_api_key_sync_subscriber() {
    tokio::spawn(async move {
        project_info!("API key sync subscriber task spawned");
        loop {
            run_subscription().await;
            tokio::time::sleep(RECONNECT_BACKOFF).await;
        }
    }.instrument(tracing::Span::current()));  // 044 W-F12 propagation
}

async fn run_subscription() {
    // 對齊 casbin_sync_initialization::run_subscription（line 46）結構：
    //   client → get_async_pubsub → subscribe API_KEY_INVALIDATE_CHANNEL → on_message
    // 每收到一則訊號則呼 reload_api_keys()
}

async fn reload_api_keys() {
    // 1. clear all in-memory keys (R-6 added clear_all_keys)
    server_core::sign::clear_all_keys().await;

    // 2. SELECT * FROM sys_access_key WHERE deleted_at IS NULL
    let db = ...; // db_helper::get_db_connection
    let active = sys_access_key::find_active().all(db.as_ref()).await.unwrap_or_default();

    // 3. 逐筆 add_key（與既有 initialize_access_key 邏輯一致）
    for key in active {
        server_core::sign::add_key(ValidatorType::Simple, &key.access_key_id, None).await;
        server_core::sign::add_key(
            ValidatorType::Complex,
            &key.access_key_id,
            Some(&key.access_key_secret),
        ).await;
    }

    // 4. metric instrument
    metrics::counter!("api_key_reload_total").increment(1);
}
```

---

## E3. New `server_core::sign::clear_all_keys` API（US2 / FR-006）

per research R-6：

```rust
// rust-api/server/core/src/sign/api_key.rs（既有檔加 2 個 pub fn）
impl SimpleApiKeyValidator {
    pub fn clear(&self) {
        self.keys.write().clear();  // std HashMap::clear
    }
}

impl ComplexApiKeyValidator {
    pub fn clear(&self) {
        self.secrets.write().clear();
    }
}

// rust-api/server/core/src/sign/mod.rs（既有檔加 module-level wrapper）
pub async fn clear_all_keys() {
    API_KEY_VALIDATORS.0.write().await.clear();  // SimpleApiKeyValidator
    API_KEY_VALIDATORS.1.write().await.clear();  // ComplexApiKeyValidator
}
```

---

## E4. Service trait `*_in_txn` 雙生方法（US4 / FR-008）

### E4.1 既有 `TUserService` trait（rust-api/server/service/src/admin/sys_user_service.rs）

```rust
#[async_trait]
pub trait TUserService: Send + Sync {
    async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
    async fn assign_roles_to_user(&self, user_id: String, role_codes: Vec<String>, actor: &Actor) -> Result<(), AppError>;
    async fn update_user(&self, id: &str, input: UpdateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
    // ... 其他既有 method 不動 ...
}
```

### E4.2 045 新加 3 個 `*_in_txn` 變體

```rust
#[async_trait]
pub trait TUserService: Send + Sync {
    // 既有 3 fn 保留（030-040 callsite 0 改動）
    async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
    async fn assign_roles_to_user(&self, user_id: String, role_codes: Vec<String>, actor: &Actor) -> Result<(), AppError>;
    async fn update_user(&self, id: &str, input: UpdateUserInput, actor: &Actor) -> Result<UserModel, AppError>;

    // 045 新加 3 個 *_in_txn 變體（per research R-4: 不帶 explicit lifetime / Send bound）
    async fn create_user_in_txn(
        &self,
        txn: &DatabaseTransaction,
        input: CreateUserInput,
        actor: &Actor,
    ) -> Result<UserModel, AppError>;

    async fn assign_roles_to_user_in_txn(
        &self,
        txn: &DatabaseTransaction,
        user_id: String,
        role_codes: Vec<String>,
        actor: &Actor,
    ) -> Result<(), AppError>;

    async fn update_user_in_txn(
        &self,
        txn: &DatabaseTransaction,
        id: &str,
        input: UpdateUserInput,
        actor: &Actor,
    ) -> Result<UserModel, AppError>;
}
```

### E4.3 Impl 策略 — `*_in_txn` 為 canonical logic、原 fn delegate

```rust
#[async_trait]
impl TUserService for SysUserService {
    // 既有改 delegate
    async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError> {
        let db = db_helper::get_db_connection().await?;
        let txn = db.begin().await?;
        let user = self.create_user_in_txn(&txn, input, actor).await?;
        txn.commit().await?;
        Ok(user)
    }

    // 新加為 canonical logic
    async fn create_user_in_txn(
        &self,
        txn: &DatabaseTransaction,
        input: CreateUserInput,
        actor: &Actor,
    ) -> Result<UserModel, AppError> {
        // 既有 create_user 邏輯搬到這裡：
        // - hash password
        // - INSERT sys_user row
        // - audit_log::write_in_txn(txn, AuditEvent { operation: Insert, ... })
        // - return UserModel
    }

    // 同理 assign_roles_to_user / update_user / *_in_txn
}
```

---

## E5. Handler outer-txn flow（US4 / FR-009）

`rust-api/server/api/src/admin/sys_system_manage_api.rs`：

### E5.1 `add_user_for_systemmanage` 改造

```rust
pub async fn add_user_for_systemmanage(
    Extension(user_service): Extension<Arc<SysUserService>>,
    user: User,
    Json(input): Json<SystemManageAddUserInput>,
) -> Result<Res<UserDetail>, AppError> {
    let actor = Actor::from_user(&user);
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await?;

    // 1. create user（in outer txn）
    let created = user_service
        .create_user_in_txn(&txn, input.clone().into(), &actor)
        .await?;
    let created_ulid = created.id.clone();

    // 2. assign roles（in same outer txn、失敗則整體 rollback）
    user_service
        .assign_roles_to_user_in_txn(&txn, created_ulid, input.user_roles, &actor)
        .await?;

    // 3. commit（success path）
    txn.commit().await?;

    Ok(Res::ok(UserDetail::from(created)))
}
```

### E5.2 `update_user_for_systemmanage` 改造

```rust
pub async fn update_user_for_systemmanage(
    Extension(user_service): Extension<Arc<SysUserService>>,
    Path(display_id): Path<i64>,
    user: User,
    Json(input): Json<SystemManageUpdateUserInput>,
) -> Result<Res<UserDetail>, AppError> {
    let actor = Actor::from_user(&user);

    // lookup outside outer txn（不存在則早返 404、不浪費 txn）
    let user_ulid = user_service.lookup_ulid_by_display_id(display_id).await?;

    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await?;

    // 1. update user
    let updated = user_service
        .update_user_in_txn(&txn, &user_ulid, input.clone().into(), &actor)
        .await?;

    // 2. assign roles（same outer txn）
    user_service
        .assign_roles_to_user_in_txn(&txn, user_ulid, input.user_roles, &actor)
        .await?;

    // 3. commit
    txn.commit().await?;

    Ok(Res::ok(UserDetail::from(updated)))
}
```

---

## E6. 2 個新 metric pre-declare（US2 / FR-010）

per 044 既有 `metrics_init.rs` 模式（5 counter + 2 gauge + 1 histogram、describe + initialize 0）：

| Metric | Type | Labels | Active/Declared | Instrument 落點 |
|---|---|---|---|---|
| `api_key_invalidate_total` | counter | — | ✅ Active | `server_global::api_key_notify::notify_api_key_changed` PUBLISH Ok arm |
| `api_key_reload_total` | counter | — | ✅ Active | `server_initialize::api_key_sync_initialization::reload_api_keys` 尾端 |

**metrics_init.rs 加 2 行 describe + 2 行 absolute(0)**：

```rust
// 044 既有 5 counter + 2 gauge + 1 histogram 全 keep；下面加 2 row：
describe_counter!("api_key_invalidate_total", "api_key invalidate broadcast publish count");
describe_counter!("api_key_reload_total", "api_key in-memory validator reload (post invalidate signal) count");
counter!("api_key_invalidate_total").absolute(0);
counter!("api_key_reload_total").absolute(0);
```

prometheus 自動 scrape `/metrics` endpoint 拿到、grafana 既有 dashboard 與 alert 不動（本 feature 不加 dashboard panel、留 follow-up 若需要）。

---

## E7. 4 US 落點 file:line table（per plan.md §Source Code）

| US | item | file | 改動 |
|---|---|---|---|
| US1 | F3-N1 facade upsert | `rust-api/server/model/src/admin/facade/sys_endpoint.rs` | + `upsert_with_audit<C>` fn（~50 line）|
| US1 | F3-N1 service refactor | `rust-api/server/service/src/admin/sys_endpoint_service.rs` | sync_endpoints 改走 facade、移除內部 `upsert_endpoint_with_audit` helper（~30 line diff）|
| US2 | F3-N2 notify publisher | `rust-api/server/global/src/api_key_notify.rs` (NEW) | ~50 line（對齊 casbin_notify.rs 結構）|
| US2 | F3-N2 subscriber | `rust-api/server/initialize/src/api_key_sync_initialization.rs` (NEW) | ~100 line（對齊 casbin_sync_initialization.rs）|
| US2 | F3-N2 clear_all_keys | `rust-api/server/core/src/sign/api_key.rs` + `sign/mod.rs` | + 3 fn（SimpleApiKeyValidator::clear / ComplexApiKeyValidator::clear / mod::clear_all_keys、~15 line）|
| US2 | F3-N2 delete refactor | `rust-api/server/service/src/admin/sys_access_key_service.rs` | - 2 inline remove_key、+ 1 notify_api_key_changed、（~3 line diff）|
| US2 | F3-N2 main.rs spawn | `rust-api/server/bin/src/main.rs` | + 1 line `spawn_api_key_sync_subscriber()`、放 spawn_casbin_sync_subscriber 之後 |
| US2 | F3-N2 lib pub mod | `rust-api/server/global/src/lib.rs` + `server/initialize/src/lib.rs` | + 2 mod + pub use |
| US2 | F3-N2 metrics | `rust-api/server/initialize/src/metrics_init.rs` | + 2 metric describe + initialize 0（~4 line diff）|
| US3 | F3-N3 facade batch | `rust-api/server/model/src/admin/facade/sys_endpoint.rs` | + `batch_soft_delete_with_audit<C>` + `BatchDeletePolicy` enum + `BatchDeleteResult` struct（~30 line）|
| US3 | F3-N3 service refactor | `rust-api/server/service/src/admin/sys_endpoint_service.rs` | batch_remove_endpoints 改走 facade（~5 line diff）|
| US4 | 035-N1 trait *_in_txn | `rust-api/server/service/src/admin/sys_user_service.rs` | trait 加 3 method declaration、impl 3 method、原 3 fn 改 delegate（~150 line）|
| US4 | 035-N1 handler outer txn | `rust-api/server/api/src/admin/sys_system_manage_api.rs` | 2 handler 改 outer txn flow（~30 line diff）|

**改動總計**：~12-18 處改動、5-7 個 logical commit groups（per plan.md §Commit shape）。

---

## E8. Out-of-scope（045 不做、但相關）

- 7 entity facade INSERT/UPDATE surface 全填（只填 sys_endpoint、YAGNI）
- 重塑 `facade::soft_delete_by_id` 接 caller txn 變 strict atomic batch（scope creep）
- 042-N1 4 個 `#[ignore]` integration test 修
- 044-N1 sys_authorization_service.rs 3 處 production println! 清
- W-F15/16 backup-job 真實 instrument（`backup_completed_total` declared 0 series 保留）
- F3-N2 redis Cluster mode pub-sub 支援
- assign_users / assign_routes / assign_permission cross-call atomicity（W-FW6/8 既有路徑）
- HTTP middleware audit outcome-agnostic asymmetry（042 既有設計）
- 045 新 metric 加 grafana dashboard panel（留 follow-up 若需要可視化、prometheus query 已可拿到）
- 045 新 metric 加 alert rule（dev/prod 都不必為 invalidate/reload spike alert、留 follow-up）
