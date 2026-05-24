# 045 facade-atomicity-pass — brainstorm 設計

**日期**：2026-05-25
**Feature**：`045-facade-atomicity-pass`
**來源**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) 衍生 follow-up backlog 4 項：F3-N1 + F3-N2 + F3-N3 + 035-N1

---

## 1. 觸發背景

### 1.1 4 N item 在 backlog 的位置

044 落地後（2026-05-24 merge `c03d7a3`）、INTEGRATION-CHECKLIST「衍生 follow-up」table 剩 4 項真實 atomicity / facade-consistency 條目（F3-N4 已於 044 結案、041-N1 errata、042-N2/N6 已修）。本 feature 一次清完 4 項、把 facade pattern 補完整 + 兩處真實 atomicity gap 收緊。

| ID | 性質 | 真實 atomicity 風險 | 嚴重度 |
|---|---|---|---|
| **F3-N1** | facade INSERT/UPDATE surface gap | ❌（service 內已有 txn + audit、純 code consistency） | 低 |
| **F3-N2** | sys_access_key DB ↔ in-memory 跨 boundary | ✅ facade commit → sign::remove_key 兩步間 crash 留 in-memory orphan key | 中（process restart 才自然收斂） |
| **F3-N3** | batch_remove_endpoints per-row partial-failure | ❌（log-and-continue 是 endpoint_sync periodic job 刻意設計） | 低 |
| **035-N1** | cross service-call atomicity | ✅ create_user txn + assign_roles_to_user txn 各自 commit、失敗時 user row stay committed | 中（admin 低頻、但 reader 困惑） |

### 1.2 為何 bundle 為 1 個 feature

- F3-N1 + F3-N3 共用 sys_endpoint facade（單一檔擴 API surface）
- F3-N2 用 W-F11 Casbin redis pub-sub + W-F12 log JSON + W-F13 metrics 既有體例（broadcast + self-reload + metric instrument）
- 035-N1 用 audit_log::write_in_txn 既有 _in_txn 雙生方法體例
- 4 項都是 軌道**外** rust-api refactor、scope 不擴張、test 紀律統一（C-V acceptance）
- 大小屬「P3 中型 pass」、scope 與 041 / 043 spec-hygiene-pass-X 對齊

### 1.3 軌道判定

軌道**外**（rust-api + outer、0 base-web、0 schema migration、0 新 entity）。同 044 / 042 / 041 模式 — Constitution Principle IV 預設原則涵蓋、不觸發 W-WEBUI 受管例外、無需 amendment。

---

## 2. brainstorm Q&A 拍板（2026-05-25 session）

### Q1: Scope — 4 項怎麼 bundle？

→ **A1**: F3-N1 / F3-N2 / F3-N3 / 035-N1 全 4 項下動

F3-N1 動手補 facade `insert_many_with_audit` + `upsert_with_audit` wrapper（改 code consistency、不動 runtime）
F3-N3 動手補 facade `batch_soft_delete_with_audit` 含 log-and-continue option（refactor介面、保留 periodic-job semantics）
F3-N2 + 035-N1 動手修真實 atomicity gap（見 Q2 / Q3）

### Q2: F3-N2 sys_access_key DB ↔ in-memory atomicity 策略

→ **A2**: Redis pub-sub broadcast + self-reload（與 W-F11 Casbin sync 體例一致）

facade commit 後 publish `api_key:invalidate` 訊號到 redis channel。所有 rust-api 副本（含 publisher 自己）訂閱 → 收到訊號則重讀 DB find_active() + reload 記憶體。Crash window 縮成 < redis publish latency（毫秒級）、publisher 自 reload 順帶修記憶體、不需在 service 代碼裡 inline 叫 remove_key。

**Pattern alignment**：
- `server/global/src/api_key_notify.rs`（新檔）對齊 `casbin_notify.rs`（既有）
- `server/initialize/src/api_key_sync_initialization.rs`（新檔）對齊 `casbin_sync_initialization.rs`（既有）
- `main.rs` spawn subscriber、reload 用既有 `initialize_access_key` 邏輯

### Q3: 035-N1 add/update_user_for_systemmanage 跨 service call 怎麼單一 txn？

→ **A3**: Service trait 雙生方法（`*_in_txn` variant、與 `audit_log::write_in_txn` 體例一致）

trait 加 `create_user_in_txn(&txn, ...)` / `assign_roles_to_user_in_txn(&txn, ...)`。原 `create_user(&self, ...)` 保留（自開 txn + commit、給不需 unified atomicity 的 callsite 用）。新 `add_user_for_systemmanage` handler 開外層 txn → 呼 create_user_in_txn → assign_roles_to_user_in_txn → 任何失敗 rollback。`audit_log::write_in_txn` 已接受 txn ref、自然參與。Constitution II per-path satisfied。`update_user_for_systemmanage` 同樣動。

### Q4: F3-N1/N3 facade fill scope — 7 entity 全填 or 只 sys_endpoint？

→ **A4**: 只填 sys_endpoint（YAGNI、唯一有 INSERT-many use case 的 entity）

sys_user / sys_role / sys_menu / sys_domain / sys_organization / sys_access_key 都是 single-row insert via service — 不需 batch wrapper。等真正撞到 use case 再補（與本 feature 紀律一致）。

---

## 3. 範圍與 Constitution 處理

### 3.1 4 user story 對應

| US | 對應 N item | priority |
|---|---|---|
| US1 | F3-N1: facade `upsert_with_audit` + `insert_many_with_audit`、`sync_endpoints` 改走 facade | P2 |
| US2 | F3-N2: redis pub-sub `api_key:invalidate` + subscriber + clear-and-rebuild reload | P1 🎯 MVP |
| US3 | F3-N3: facade `batch_soft_delete_with_audit` + `BatchDeletePolicy::{FailFast, LogAndContinue}` enum、`batch_remove_endpoints` 改走 | P2 |
| US4 | 035-N1: service trait `*_in_txn` 雙生方法（create_user / assign_roles_to_user / update_user）+ 2 handler 改走 outer txn | P1 |

### 3.2 Constitution check（v1.4.0 5 Principle）

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe** | 不動 Casbin enforce / policy / endpoint; sys_access_key delete 仍走 facade（既有 audit）、新增 reload 機制只 sync in-memory validator state | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | facade 新 API 全部 take txn + 寫 audit；035-N1 outer txn 讓 user + role audit 一起 commit/rollback — **強化** Principle II | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | facade thicken（service 變薄 / responsibility 更清晰）；新 init module 對齊既有 casbin_sync_init 模式 | ✅ PASS |
| **IV. base 不改動邊界** | 0 base-web 改動、軌道**外**、預設原則覆蓋 | ✅ PASS |
| **V. 漸進收縮 DESIGN-A→B** | 0 nestjs、純 rust refactor、強化 DESIGN-B 形態 | ✅ PASS |

無新 violation、Complexity Tracking 空白、無 amendment 需求。

### 3.3 Workspace 處置

- 軌道外：rust-api worktree + outer rev1-admin-root
- 0 base-web 改動
- 0 schema migration
- 0 新 application entity
- ~1-2 個新 cargo 檔（api_key_notify.rs + api_key_sync_initialization.rs）
- ~12-18 處 rust 改動 + 2 個新 metric pre-declare

---

## 4. 服務拓樸與整合點

### 4.1 Redis pub-sub channel 配置（新增 1 條 channel）

```
┌────────────────────────────────────────────────────┐
│ redis (W-F11 既有)                                  │
│                                                     │
│ channels:                                           │
│  - casbin:policy:invalidate  (W-F11 既有)           │
│  - audit:events Stream        (042 既有)            │
│  - api_key:invalidate         (045 新增)            │
└────────────────────────────────────────────────────┘
         ↑ PUBLISH                ↓ SUBSCRIBE
    +----+----+              +----+----+
    │ rust-api│              │ rust-api│
    │ replica1│              │ replicaN│
    │  (publisher when DELETE access_key)  (all replicas reload)
    +---------+              +---------+
```

### 4.2 既有 rust-api init flow 接合點

```
main.rs:
  initialize_log_tracing()
  ... db / redis init ...
  initialize_audit_outbox_drainer()  (042 既有)
  ... casbin_sync_subscriber spawn ... (W-F11 既有)
  + spawn_api_key_sync_subscriber()    ← 045 新加
  initialize_admin_router()
  initialize_access_key()              (既有 first-time load)
```

注意 ordering：`spawn_api_key_sync_subscriber` 在 `initialize_access_key` 之**前** spawn — subscriber 可能在 init 期間接到 publish（其他 replica 的 publish）；reload 取 DB find_active()、idempotent、即使 first-time load 還沒跑也 OK。

### 4.3 rust-api 改動範圍（新檔 + 既有檔改）

```
rust-api/server/
├── global/src/api_key_notify.rs                  (新檔、~70 lines、對齊 casbin_notify.rs)
├── initialize/src/api_key_sync_initialization.rs (新檔、~120 lines、對齊 casbin_sync_initialization.rs)
├── initialize/src/lib.rs                          (+ 2 行 pub use / mod)
├── initialize/src/metrics_init.rs                 (+ 2 個新 metric describe + initialize 0)
├── model/src/admin/facade/sys_endpoint.rs         (+ upsert_with_audit + batch_soft_delete_with_audit + BatchDeletePolicy enum + BatchDeleteResult struct)
├── service/src/admin/sys_endpoint_service.rs      (- 內部 helper、改走 facade)
├── service/src/admin/sys_access_key_service.rs    (- 2 行 remove_key、+ notify_api_key_changed)
├── service/src/admin/sys_user_service.rs          (+ create_user_in_txn + assign_roles_to_user_in_txn + update_user_in_txn trait/impl)
├── api/src/admin/sys_system_manage_api.rs         (改 add_user_for_systemmanage + update_user_for_systemmanage handler 開 outer txn)
└── server-core/src/sign/mod.rs                    (+ clear_all_keys 或 replace_keys wrapper)

outer:
├── docs/INTEGRATION-CHECKLIST.md  (-4 row + 1 entry + 下一步更新)
└── CLAUDE.md  (SPECKIT marker 045 進行中)
```

---

## 5. User story 細節

### 5.1 US1 — F3-N1: facade `upsert_with_audit` + `sync_endpoints` refactor（P2）

**Goal**：sys_endpoint 寫入路徑全部走 facade（與既有 soft_delete_by_id 一致）、service 變薄、interface boundary 清晰。

**改動**：

`facade/sys_endpoint.rs` 加 fn：

```rust
pub async fn upsert_with_audit<C>(
    db: &C,
    endpoint: SysEndpointModel,
    actor: &Actor,
) -> Result<(), AppError>
where C: ConnectionTrait + TransactionTrait
{
    // 1. fetch before snapshot via (path, method) unique constraint
    // 2. None → INSERT + audit_log::write_in_txn(Insert)
    //    Some + diff → UPDATE + audit_log::write_in_txn(Update, before/after)
    //    Some + no diff → noop（不寫 audit、避免 audit noise）
}
```

`sys_endpoint_service.rs::sync_endpoints` 改：

```rust
let txn = db.begin().await?;
for endpoint in new_endpoints.iter() {
    sys_endpoint::upsert_with_audit(&txn, endpoint.clone(), &actor).await?;
}
txn.commit().await?;
```

刪掉 service 內 `upsert_endpoint_with_audit` helper（搬到 facade）。

**Independent test**：endpoint_sync 跑後 docker compose logs rust-api 看 "audit_log_writes_total" series operation=Insert/Update entity_type=sys_endpoint 增量；sys_endpoint row 數對齊 N。

### 5.2 US2 — F3-N2: api_key:invalidate redis pub-sub + self-reload（P1 🎯 MVP）

**Goal**：sys_access_key delete 後 in-memory validator state 在毫秒級內同步（< redis publish latency、不再依賴 process restart）。

**新檔 `server/global/src/api_key_notify.rs`**：

```rust
pub const API_KEY_INVALIDATE_CHANNEL: &str = "api_key:invalidate";
const API_KEY_INVALIDATE_PAYLOAD: &str = "1";

pub async fn notify_api_key_changed() {
    // 對齊 casbin_notify::notify_casbin_changed:
    //   - 取 GLOBAL_PRIMARY_REDIS、check Single mode
    //   - get_multiplexed_async_connection
    //   - redis::cmd("PUBLISH").arg(API_KEY_INVALIDATE_CHANNEL).arg(API_KEY_INVALIDATE_PAYLOAD)
    //   - 044 體例：metrics::counter!("api_key_invalidate_total").increment(1) 在 Ok arm
}
```

**新檔 `server/initialize/src/api_key_sync_initialization.rs`**：

```rust
pub fn spawn_api_key_sync_subscriber() {
    tokio::spawn(async move {
        project_info!("API key sync subscriber spawned");
        loop {
            run_subscription().await;
            tokio::time::sleep(RECONNECT_BACKOFF).await;  // 5s 對齊 casbin sync
        }
    }.instrument(tracing::Span::current()));  // 044 W-F12 propagation
}

async fn run_subscription() {
    // 對齊 casbin_sync_initialization::run_subscription 結構
    let client = ... GLOBAL_PRIMARY_REDIS ...;
    let mut pubsub = client.get_async_pubsub().await?;
    pubsub.subscribe(API_KEY_INVALIDATE_CHANNEL).await?;
    while let Some(_) = pubsub.on_message().next().await {
        reload_api_keys().await;
        metrics::counter!("api_key_reload_total").increment(1);
    }
}

async fn reload_api_keys() {
    // 1. server_core::sign::clear_all_keys() — 新 API、wipe in-memory validator
    // 2. SELECT * FROM sys_access_key WHERE deleted_at IS NULL
    // 3. for each: server_core::sign::add_key(Simple/Complex, ...)
}
```

**Service refactor `delete_access_key`**：

```rust
async fn delete_access_key(&self, id: &str, actor: &Actor) -> Result<(), AppError> {
    let db = db_helper::get_db_connection().await?;
    let access_key = sys_access_key::find_active().filter(...).one(db.as_ref()).await?...;

    sys_access_key::soft_delete_by_id(db.as_ref(), id.to_string(), actor).await?;

    // 改：拿掉 lines 193-194 兩行 remove_key
    notify_api_key_changed().await;  // 045 新：broadcast → all replicas reload

    Ok(())
}
```

**新 `server_core::sign::clear_all_keys`**：對齊既有 `remove_key`、wrap `validator_write.clear()` 或 `replace(HashMap::new())` 邏輯。

**main.rs** 加 1 行：`server_initialize::spawn_api_key_sync_subscriber();`（在 db / redis init 後、initialize_admin_router 前）

**新 2 個 metric pre-declare**（metrics_init.rs）：
- `counter!("api_key_invalidate_total")` — publish 次數
- `counter!("api_key_reload_total")` — subscriber 收到並 reload 次數

044 declared 0 series `sys_tokens_active` 不動（仍 0 series、留 W-F15/16 或後續）。

**Independent test**：DELETE /api/accessKey/{id} → 本 replica 在 < 500ms 內 in-memory key 不再 validate；prometheus query `api_key_invalidate_total` + `api_key_reload_total` 都 +1。

### 5.3 US3 — F3-N3: facade `batch_soft_delete_with_audit`（P2）

**Goal**：`batch_remove_endpoints` 走 facade pattern、log-and-continue semantics 保留、interface 與 facade 既有 soft_delete_by_id 一致。

**facade/sys_endpoint.rs 加**：

```rust
#[derive(Debug, Clone, Copy)]
pub enum BatchDeletePolicy {
    FailFast,
    LogAndContinue { target: &'static str },
}

#[derive(Debug, Default)]
pub struct BatchDeleteResult {
    pub ok: Vec<String>,
    pub failed: Vec<(String, AppError)>,
}

pub async fn batch_soft_delete_with_audit<C>(
    db: &C,
    ids: Vec<String>,
    actor: &Actor,
    policy: BatchDeletePolicy,
) -> Result<BatchDeleteResult, AppError>
where C: ConnectionTrait + TransactionTrait
{
    // per-id loop: each call goes through soft_delete_by_id（既有 facade、含 own txn + audit）
    // FailFast: 任何失敗即 propagate
    // LogAndContinue: 失敗 tracing::warn! + 紀錄到 result.failed、繼續下一 id
}
```

**重要設計**：per-id 各自 soft_delete_by_id own txn — **不**外包外層 txn。原因：既有 batch_remove_endpoints 行為一致、不擴 atomicity scope（要 strict batch atomic 需重塑 facade soft_delete_by_id 接 caller txn、留 follow-up）。

**Service refactor `batch_remove_endpoints`**：

```rust
async fn batch_remove_endpoints(
    &self,
    db: &DatabaseConnection,
    endpoints_to_remove: Vec<String>,
) -> Result<(), AppError> {
    let actor = Actor::system("endpoint_sync");
    sys_endpoint::batch_soft_delete_with_audit(
        db,
        endpoints_to_remove,
        &actor,
        BatchDeletePolicy::LogAndContinue { target: "endpoint_sync" },
    ).await?;
    Ok(())
}
```

**Independent test**：endpoint_sync 跑後（如果 sys_endpoint 表內有 row 不在 new_endpoints）→ docker compose logs 看 `target=endpoint_sync` warn line 形狀對齊改前。

### 5.4 US4 — 035-N1: service trait `*_in_txn` 雙生方法（P1）

**Goal**：systemManage `add_user_for_systemmanage` / `update_user_for_systemmanage` 內 create_user + assign_roles 在 single outer txn、失敗 rollback。

**Trait 改動 `sys_user_service.rs`**：

```rust
#[async_trait]
pub trait TUserService: Send + Sync {
    // 既有不動（030-040 callsite 0 改動）
    async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
    async fn assign_roles_to_user(&self, user_id: String, role_codes: Vec<String>, actor: &Actor) -> Result<(), AppError>;
    async fn update_user(&self, id: &str, input: UpdateUserInput, actor: &Actor) -> Result<UserModel, AppError>;

    // 045 新加：caller 持有 outer txn
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

**實作策略**：`*_in_txn` 是 canonical logic（INSERT/UPDATE + write_in_txn audit），原 fn 改 `db.begin() → *_in_txn(&txn) → txn.commit()`。

**Handler refactor `add_user_for_systemmanage`** (sys_system_manage_api.rs:120-150):

```rust
pub async fn add_user_for_systemmanage(...) -> Result<Res<UserDetail>, AppError> {
    let actor = Actor::from_user(&user);
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await?;

    let created = user_service.create_user_in_txn(&txn, input.into(), &actor).await?;
    let created_ulid = created.id.clone();
    user_service.assign_roles_to_user_in_txn(&txn, created_ulid, input.user_roles, &actor).await?;

    txn.commit().await?;
    Ok(Res::ok(UserDetail::from(created)))
}
```

`update_user_for_systemmanage` 對齊（lookup_ulid_by_display_id 在 outer 還未開 txn 前做 — 找錯就早返 404）+ outer txn + update_user_in_txn + assign_roles_to_user_in_txn + commit。

**Constitution II per-path 滿足**：每個 *_in_txn impl 內呼 `audit_log::write_in_txn(&txn, ...)` — 同 outer txn、audit 與業務寫入 atomic。

**Independent test**：
- POST `/api/systemManage/addUser` valid + invalid user_roles：valid → user + role rows + 2 audit row 同 created_at；invalid → user row 0 + audit row 0
- PUT update_user_for_systemmanage 同 negative path

---

## 6. Acceptance — C-V contracts 概覽

無新業務純函式測試需求；本 feature 為**介面 refactor + atomicity boundary 重塑**，acceptance 純由 C-V 涵蓋（per CLAUDE.md §3 紀律「無新純函式測試時由 acceptance 覆蓋、明示理由」）。

| C-V | 目標 | 對應 |
|---|---|---|
| C-V1 | dev stack 12 service healthy（044 baseline 復用） | infra |
| C-V2 | F3-N1: sys_endpoint::upsert_with_audit grep + endpoint_sync 觸發後 audit row N 條對齊改前 | US1 |
| C-V3 | F3-N1: facade 既有 API 行為不退化（soft_delete_by_id / find_active） | US1 regression |
| C-V4 | F3-N2: redis pub-sub channel `api_key:invalidate` 有 publish 訊號 | US2 |
| C-V5 | F3-N2: DELETE access_key 後 in-memory invalidated < 500ms | US2 |
| C-V6 | F3-N2: `api_key_invalidate_total` + `api_key_reload_total` counter +1 | US2 |
| C-V7 | F3-N3: batch_remove_endpoints 改走 facade、log line 形狀對齊改前 | US3 |
| C-V8 | 035-N1: POST systemManage/addUser valid → user + roles + 2 audit row 同 commit | US4 happy |
| C-V9 | 035-N1: POST systemManage/addUser invalid role → user row 0、audit INTERNAL row 0（HTTP middleware row 1 by 042） | US4 negative |
| C-V10 | 035-N1: PUT update_user_for_systemmanage 同 happy + negative | US4 |
| C-V11 | FR-015/016 boundary verify（git diff base-web/ 0、find rust-api/migration -newer 0） | scope discipline |
| C-V12 | INTEGRATION-CHECKLIST cleanup（4 row 移除、045 entry 加） | docs |

---

## 7. Out of scope（明示不做）

- 7 entity facade INSERT/UPDATE surface 全填（YAGNI、只填 sys_endpoint）
- `facade::soft_delete_by_id` 改接 caller txn 變 strict atomic batch（重塑既有 facade contract、scope creep）
- 042-N1 4 個 `#[ignore]` integration test 修（不同 feature 主題）
- 044-N1 `sys_authorization_service.rs` 3 處 production `println!` 清（不同 feature 主題）
- W-F15/16 backup-job 真實 instrument（`backup_completed_total` declared 0 series 保留）
- F3-N2 redis Cluster mode pub-sub 支援（沿用 Single mode、cluster pub-sub 不在範疇）
- `assign_users` / `assign_routes` / `assign_permission` cross-call atomicity（W-FW6/8 既有路徑、不掃描）
- service trait fn 帶 generic `<C>` 配 async_trait（trait fn 簽名固定 `&DatabaseTransaction`、Option 1 / 最簡）
- HTTP middleware 042 outcome-agnostic asymmetry（失敗路徑 HTTP audit 1 row + INTERNAL audit 0 row 是 042 既有設計、本 feature 不改）

---

## 8. Spec gap / 開放問題

- **`server_core::sign::clear_all_keys`** 新 API 名 — 可能改 `replace_keys(new_set)` 更語意清。implementer 階段拍板。
- **`api_key_sync_initialization` spawn 順序** — `initialize_access_key`（first-time load） vs `spawn_api_key_sync_subscriber` 哪個先？若 subscriber 先 spawn、可能收到其他 replica 的 publish 觸發 reload；reload 拿 DB find_active() 即使 first-time load 沒跑也 OK（idempotent）。spec 內明示 ordering 由 implementer 階段決定（建議 subscriber 先 spawn）。
- **C-V5 timing threshold** — < 500ms 是直覺值；實機 redis publish round-trip 估 < 50ms、留 implementer 階段驗實測再寫死。
- **F3-N1 upsert_with_audit fetch before snapshot 的 unique constraint** — sys_endpoint 表用 (path, method) 還是 id 做 lookup？implementer 階段 grep schema 確認。
- **trait fn 簽名** — `&DatabaseTransaction` 是否需要 `<'a>` lifetime / Send bound？implementer 階段查 sea-orm 0.12 + async-trait 0.1 互動。

---

**brainstorm 完成日**：2026-05-25
**下一步**：`/speckit-specify` 啟動 Phase A SDD 設計鏈、`before_specify` pre-hook 自動建 `045-facade-atomicity-pass` feature branch、`specs/045-facade-atomicity-pass/spec.md` 生成。
