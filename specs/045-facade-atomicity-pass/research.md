# Research: 045 facade-atomicity-pass

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-7 grep + 拍板結果，將 brainstorm §8 的 5 個 implementer-grade open question 全部 resolve。

---

## R-1 — `server_core::sign::clear_all_keys` 命名拍板

**Source**：brainstorm §8 spec gap (a)

候選命名：
- `clear_all_keys()` — semantic "wipe all"
- `replace_keys(new_set: Vec<...>)` — semantic "atomic swap"
- `clear_validator_keys()` — verbose

**Decision**：採 `clear_all_keys()`。
**Rationale**：
- API 用法配 reload flow：`clear_all_keys() → for each key in DB: add_key(...)` —— 「先清再建」semantic 明確
- `replace_keys(new_set)` 看似 atomic 但內部還是 clear+add；多包一層無實益
- 對齊既有 `remove_key(type, key)` single-key remove 動詞、`clear_all_keys` 為 bulk variant
**Alternatives**：留 `clear()` private + 暴 high-level `reset_all()` — 但 reset 字面意義較廣（可能含 config reset）、不清晰

---

## R-2 — `spawn_api_key_sync_subscriber` 與 `initialize_access_key` 啟動順序

**Source**：brainstorm §8 spec gap (b)

兩 ordering 都 idempotent：
- subscriber-first：subscriber spawn → loop start → 收到 publish 觸發 reload；first-time `initialize_access_key` 還沒跑時、reload 拿 DB find_active() 仍正確（DB-as-truth）
- init-first：first-time load DB 進 validator → subscriber spawn → 開始監聽後續變動

**Decision**：採 subscriber-first（與 W-F11 `spawn_casbin_sync_subscriber` 體例對齊）。
**Rationale**：
- W-F11 既有 `spawn_casbin_sync_subscriber(enforcer)` 在 `initialize_casbin` 之後 spawn、initialize 期間若 redis 已有 invalidate event 也會立刻 reload（無 race window）
- subscriber-first 確保 spawn 時刻起就接收所有 publish event；init-first 在 subscriber spawn 前的 publish event 會 miss（雖然 dev 場景 multi-replica 不存在）
- 即使 first-time `initialize_access_key` 還未跑、subscriber reload 拿空 DB 也 idempotent（reload 第二次 = init 結果一致）

**main.rs 順序**：

```rust
server_initialize::init_primary_redis().await;
server_initialize::init_redis_pools().await;
// ... mongo / event_channel ...
server_initialize::initialize_audit_outbox_drainer().await;  // 042 既有
server_initialize::spawn_casbin_sync_subscriber(enforcer);   // W-F11 既有
server_initialize::spawn_api_key_sync_subscriber();          // 045 新加
let app = server_initialize::initialize_admin_router().await;
server_initialize::initialize_access_key().await;            // 既有 first-time load
```

**Alternatives**：先 init_access_key 再 spawn subscriber — 行為一致但與 casbin 模式不對齊、增加 mental load

---

## R-3 — F3-N1 `upsert_with_audit` before-snapshot lookup key

**Source**：brainstorm §8 spec gap (d)

**grep 結果**：
```
rust-api/server/model/src/admin/entities/sys_endpoint.rs
  Model { #[sea_orm(primary_key, auto_increment = false, column_type = "Text")] pub id: String, ... pub path: String, pub method: String, ... }
  → 無 #[sea_orm(unique)] / 無 UniqueIndex；id 為 PK String
```

實際上：
- 服務 `sys_endpoint_service.rs::sync_endpoints` 用 `existing_endpoints.iter().any(|e| e.path == ... && e.method == ...)` 比對（path+method 為 logical key）
- `router_initialization.rs::generate_id()`（line 435）用 hash(path+method) → String 作為 id —— **id 為 deterministic from (path, method)**
- 即 lookup by id == lookup by (path, method)（等效）

**Decision**：採 `WHERE id = ?` lookup（既有 PK index、單欄 query 簡潔）。
**Rationale**：
- id 由 (path, method) 確定性 hash 產生、與 (path, method) 等效
- PK lookup 比 `(path, method)` composite 過濾快、index 已存
- 與 `facade::soft_delete_by_id` 既有路徑一致（都用 id）
**Alternatives**：`WHERE path = ? AND method = ?` — 等效但 dual-column、且若有 stale data path+method 重複會抓多 row、需要 LIMIT 1（PK lookup 天生唯一）

**Implementer 注意**：`upsert_with_audit` 簽名取 `endpoint: SysEndpointModel` 含 `id` field（caller 從 `generate_id()` 算好）；fn 內以 `endpoint.id` 直接 lookup。

---

## R-4 — Trait fn lifetime / Send bound（`async_trait` + sea-orm 互動）

**Source**：brainstorm §8 spec gap (e)

**參考**：`audit_log::write_in_txn(txn: &DatabaseTransaction, event: AuditEvent<'_>)` —— 既有體例、`&DatabaseTransaction` 不帶 lifetime annotation；event 帶 `<'_>` lifetime（含 `&Actor` ref）

**Decision**：trait fn 簽名 `&DatabaseTransaction` 不帶 explicit lifetime；`#[async_trait]` macro 自動處理 lifetime elision；input 含 `&Actor` 部分用 `actor: &Actor`（同 audit_log::write_in_txn 體例）。
**Rationale**：
- async_trait 0.1 對 `async fn(&self, txn: &DatabaseTransaction, ...)` 自動展開為 `Pin<Box<dyn Future + Send>>`、lifetime elision 自動處理
- sea-orm 0.12 `DatabaseTransaction` 是 `Send + Sync` type、不需要額外 bound
- 與 042 既有 `write_in_txn(txn: &DatabaseTransaction, event: AuditEvent<'_>)` 體例 100% 對齊、零學習成本
**Alternatives**：用 generic `<C: ConnectionTrait + TransactionTrait>` —— async_trait 不直接支援 trait fn generic、需要 macro workaround、增加複雜度；本 feature scope 不採（per spec assumption 明示）

**Trait signature 範例**：

```rust
#[async_trait]
pub trait TUserService: Send + Sync {
    async fn create_user_in_txn(
        &self,
        txn: &DatabaseTransaction,
        input: CreateUserInput,
        actor: &Actor,
    ) -> Result<UserModel, AppError>;
    // 同 audit_log::write_in_txn 體例、無 explicit lifetime
}
```

---

## R-5 — C-V5 / SC-004 500ms timing threshold

**Source**：brainstorm §8 spec gap (c)

**redis pub-sub 預期 latency**（local docker network、Single mode）：
- PUBLISH → 服務器 broadcast：< 1ms
- subscriber on_message 接收：1-5ms
- reload (DB find_active + iterate add_key)：與 row 數成正比、預估 20-50ms for typical (~5 row dev / ~50 row prod)
- 總 round-trip：< 100ms typical、< 200ms p95

**Decision**：保留 SC-004 / C-V5 threshold **< 500ms**（4-5x safety margin）。
**Rationale**：
- 500ms 為 testable / measurable 上界、留 4x margin 給 worst case（DB slow + reload large key set + redis temporary glitch）
- 實機 acceptance 預期典型 < 100ms、deviation 大時 implementer 可直接 debug
- 不為 micro-optimization 縮 threshold（如 100ms） — production loose 環境可能撞到、增加 flaky test 風險
**Alternatives**：縮 threshold 至 200ms（更嚴格） — 但 dev WSL2 環境可能 spike、flaky；500ms 為 reasonable choice

---

## R-6 — 既有 `server_core::sign::remove_key` API surface + validator internal structure

**Source**：grep `rust-api/server/core/src/sign/`

**grep 結果**：
- `SimpleApiKeyValidator`: `keys: Arc<RwLock<HashMap<String, ()>>>`、`pub fn add_key(&self, key: String)` / `pub fn remove_key(&self, key: &str)` / `pub fn validate_key(&self, key: &str) -> bool`
- `ComplexApiKeyValidator`: `secrets: Arc<RwLock<HashMap<String, String>>>`、`pub fn add_key_secret(&self, key: String, secret: String)` / `pub fn remove_key(&self, key: &str)`
- 模組層 `pub async fn add_key(type, key, secret)` / `pub async fn remove_key(type, key)` 是 thin wrapper、call `API_KEY_VALIDATORS.0/1.write().await.add_key(...)` / `.remove_key(...)`

**Decision**：新加 `pub async fn clear_all_keys()` at module level —— 對齊既有 `add_key` / `remove_key` wrapper 體例：

```rust
pub async fn clear_all_keys() {
    API_KEY_VALIDATORS.0.write().await.clear();  // SimpleApiKeyValidator::clear()
    API_KEY_VALIDATORS.1.write().await.clear();  // ComplexApiKeyValidator::clear()
}
```

**子任務 R-6.1**：在 `SimpleApiKeyValidator` + `ComplexApiKeyValidator` 各加 `pub fn clear(&self)` 內部 method：

```rust
impl SimpleApiKeyValidator {
    pub fn clear(&self) { self.keys.write().clear(); }
}
impl ComplexApiKeyValidator {
    pub fn clear(&self) { self.secrets.write().clear(); }
}
```

**Rationale**：
- 兩 validator 內部都是 `Arc<RwLock<HashMap>>`、`.clear()` 是 std HashMap method、O(N) but lock 一次
- 對齊 add_key / remove_key 既有 single-key public method 模式
- Module-level `clear_all_keys()` wrap 兩 validator clear、單一 entry point for reload flow

**Alternatives**：用 `*validator.write().await = SimpleApiKeyValidator::new()` 整個 replace — 但會破壞 `Arc::clone` 的其他持有者、不採

---

## R-7 — `audit_log::write_in_txn` signature 確認

**Source**：grep `rust-api/server/model/src/admin/audit_log.rs:70`

```rust
pub async fn write_in_txn(
    txn: &DatabaseTransaction,
    event: AuditEvent<'_>,
) -> Result<(), AppError> {
    // ...
}
```

**Decision**：本 feature 的 `*_in_txn` trait fn 接 `&DatabaseTransaction` 直接 pass through 至 audit_log::write_in_txn 即可，無 impedance mismatch。

`facade::upsert_with_audit<C: ConnectionTrait + TransactionTrait>(db: &C, ...)` 與 `facade::batch_soft_delete_with_audit<C>(db: &C, ...)` 用 generic 是因為 facade 接受 `&DatabaseConnection` 或 `&DatabaseTransaction` 雙路（facade 級別 generic OK、非 trait method、不過 async_trait macro），對齊既有 `facade::soft_delete_by_id<C>` 體例。

**Rationale**：facade-level free fn 用 generic 是既有 pattern（soft_delete_by_id 已用、line 31 `pub async fn soft_delete_by_id<C>(db: &C, id: String, actor: &Actor) -> Result<(), AppError> where C: ConnectionTrait + TransactionTrait`）

**Implementer 注意**：
- facade `upsert_with_audit` / `batch_soft_delete_with_audit` 簽名用 generic `<C>` —— 對齊 facade::soft_delete_by_id 體例
- service trait `*_in_txn` 簽名固定 `&DatabaseTransaction` —— 對齊 audit_log::write_in_txn 體例 + 避 async_trait macro 對 trait fn generic 的限制

---

## Implementer-stage Expansion 候選（per 041 體例）

Plan 階段 grep 後**0 處 spec 內描述需要修正**（spec md 8 sections 全 user-approved、brainstorm 4 Q 已拍板、無實機與描述不符）。

無需 implementer 階段擴展。本 feature scope 嚴守 brainstorm 拍板。

---

## Phase 0 結論

7 個 research item 全 resolve、brainstorm §8 5 個 open question 全拍板：

| Open Q | Decision | 依據 |
|---|---|---|
| clear_all_keys 命名 | `clear_all_keys()` | R-1 |
| subscriber spawn 順序 | subscriber-first（與 W-F11 對齊） | R-2 |
| upsert lookup key | `WHERE id = ?`（PK、與 (path,method) 等效） | R-3 |
| trait fn lifetime | 不帶 explicit lifetime / Send bound、async_trait 自動處理 | R-4 + R-7 |
| SC-004 threshold | 保留 < 500ms（4-5x margin） | R-5 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
