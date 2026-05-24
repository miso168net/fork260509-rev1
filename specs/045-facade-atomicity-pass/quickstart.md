# Quickstart — 045 facade-atomicity-pass

**Phase**：1（Design & Contracts、Phase 1 產出）
**Audience**：implementer（人或 AI）執行 045 的步驟手冊。

依執行順序：rust-api facade fill (US1+US3) → pub-sub infra (US2 publisher + subscriber + clear_all_keys + delete refactor + main.rs) → 雙生方法 (US4 trait + handler outer txn) → metric pre-declare → INTEGRATION-CHECKLIST cleanup → 多段式 commit + merge。

---

## 前置假設

- dev stack 既有 12 service healthy（5 既有 + 7 observability、044 落地後 baseline）
- outer branch 為 `045-facade-atomicity-pass`（pre-hook 已建、`git branch --show-current` 確認）
- rust-api worktree branch 為 `rev1-admin-rust-api`
- 預設帳號 `Soybean`/`123456`（per CLAUDE.md §8.1）
- `PC` shell alias：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`
- Phase 0 research 已完 → 5 個 open question 全拍板（per research.md）

---

## Step 1 — US1+US3 facade fill（FR-001/002/003）

### 1.1 在 `rust-api/server/model/src/admin/facade/sys_endpoint.rs` 加 3 個新 API

per data-model §E1.2：
- `pub async fn upsert_with_audit<C>(db, endpoint, actor)` — lookup by `id` PK、None→INSERT、Some+diff→UPDATE
- `pub async fn batch_soft_delete_with_audit<C>(db, ids, actor, policy)` — per-id 走 soft_delete_by_id
- `pub enum BatchDeletePolicy { FailFast, LogAndContinue { target: &'static str } }`
- `pub struct BatchDeleteResult { ok: Vec<String>, failed: Vec<(String, AppError)> }`

需新 import：`AuditOperation`、`AuditSource`、`audit_snapshot`、`AuditEvent`、`audit_log`（per facade::soft_delete_by_id 體例）。

### 1.2 改 `rust-api/server/service/src/admin/sys_endpoint_service.rs`

- `sync_endpoints`（line 184-220）：拿掉內部 `self.upsert_endpoint_with_audit(...)` 呼叫、改 `sys_endpoint::upsert_with_audit(&txn, endpoint.clone(), &actor).await?;`
- `batch_remove_endpoints`（line 126-141）：拿掉 per-id `if let Err(e) = sys_endpoint::soft_delete_by_id(...)` for loop、改：
  ```rust
  sys_endpoint::batch_soft_delete_with_audit(
      db,
      endpoints_to_remove,
      &actor,
      BatchDeletePolicy::LogAndContinue { target: "endpoint_sync" },
  ).await?;
  ```
- 移除 service 內 `upsert_endpoint_with_audit` 私有 helper fn（搬到 facade 後不需要）

### 1.3 verify build（docker build rebuild rust-api image）

```bash
docker build -t rust-api:rev1-admin-rust-api ./rust-api
# expect: build success（無 cargo on host、不能 cargo check）
```

對應 C-V2 + C-V3 + C-V7。

---

## Step 2 — US2 pub-sub infra（FR-004/005/006/007/011）

### 2.1 加 `pub fn clear()` 到兩個 ApiKey validator

`rust-api/server/core/src/sign/api_key.rs`：
```rust
impl SimpleApiKeyValidator { pub fn clear(&self) { self.keys.write().clear(); } }
impl ComplexApiKeyValidator { pub fn clear(&self) { self.secrets.write().clear(); } }
```

### 2.2 加 `pub async fn clear_all_keys` 到 module level

`rust-api/server/core/src/sign/mod.rs`（既有檔加 1 fn）：
```rust
pub async fn clear_all_keys() {
    API_KEY_VALIDATORS.0.write().await.clear();
    API_KEY_VALIDATORS.1.write().await.clear();
}
```

### 2.3 新檔 `rust-api/server/global/src/api_key_notify.rs`

per data-model §E2.3（對齊 `casbin_notify.rs` 結構）：
```rust
pub const API_KEY_INVALIDATE_CHANNEL: &str = "api_key:invalidate";
const API_KEY_INVALIDATE_PAYLOAD: &str = "1";

pub async fn notify_api_key_changed() {
    // ... 取 GLOBAL_PRIMARY_REDIS / Single mode check / PUBLISH ...
    // PUBLISH 成功 arm: metrics::counter!("api_key_invalidate_total").increment(1);
}
```

`rust-api/server/global/src/lib.rs` 加 `pub mod api_key_notify;`。

### 2.4 新檔 `rust-api/server/initialize/src/api_key_sync_initialization.rs`

per data-model §E2.4（對齊 `casbin_sync_initialization.rs` 結構）：

```rust
pub fn spawn_api_key_sync_subscriber() { /* tokio::spawn + 5s backoff loop */ }
async fn run_subscription() { /* subscribe + on_message → reload_api_keys() */ }
async fn reload_api_keys() {
    server_core::sign::clear_all_keys().await;
    let active = sys_access_key::find_active().all(...).await...;
    for k in active { server_core::sign::add_key(Simple/Complex, ...).await; }
    metrics::counter!("api_key_reload_total").increment(1);
}
```

`rust-api/server/initialize/src/lib.rs` 加 `mod api_key_sync_initialization;` + `pub use api_key_sync_initialization::spawn_api_key_sync_subscriber;`。

### 2.5 改 `delete_access_key` in `rust-api/server/service/src/admin/sys_access_key_service.rs`

lines 173-196 原有：
```rust
sys_access_key::soft_delete_by_id(db.as_ref(), id.to_string(), actor).await?;
server_core::sign::remove_key(ValidatorType::Simple, &access_key.access_key_id).await;
server_core::sign::remove_key(ValidatorType::Complex, &access_key.access_key_id).await;
Ok(())
```

改：
```rust
sys_access_key::soft_delete_by_id(db.as_ref(), id.to_string(), actor).await?;
// 045 W-F11 體例：broadcast invalidate signal、self + all replicas reload
server_global::api_key_notify::notify_api_key_changed().await;
Ok(())
```

### 2.6 在 `rust-api/server/bin/src/main.rs` 加 1 行 spawn

per research R-2 順序（subscriber-first）：

```rust
// 既有 ordering（044 落地後）：
server_initialize::initialize_audit_outbox_drainer().await;
// W-F11 既有：spawn_casbin_sync_subscriber 在 initialize_casbin 內部 spawn
// 045 新加：
server_initialize::spawn_api_key_sync_subscriber();
// ... 後續 initialize_admin_router / initialize_access_key 不動
```

對應 C-V4 + C-V5 + C-V6。

---

## Step 3 — US4 service trait *_in_txn 雙生方法（FR-008/009）

### 3.1 加 3 個 trait method declaration

`rust-api/server/service/src/admin/sys_user_service.rs::TUserService` trait（per data-model §E4.2）：

```rust
#[async_trait]
pub trait TUserService: Send + Sync {
    // 既有 3 fn 保留
    async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
    async fn assign_roles_to_user(&self, user_id: String, role_codes: Vec<String>, actor: &Actor) -> Result<(), AppError>;
    async fn update_user(&self, id: &str, input: UpdateUserInput, actor: &Actor) -> Result<UserModel, AppError>;

    // 045 新加
    async fn create_user_in_txn(&self, txn: &DatabaseTransaction, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
    async fn assign_roles_to_user_in_txn(&self, txn: &DatabaseTransaction, user_id: String, role_codes: Vec<String>, actor: &Actor) -> Result<(), AppError>;
    async fn update_user_in_txn(&self, txn: &DatabaseTransaction, id: &str, input: UpdateUserInput, actor: &Actor) -> Result<UserModel, AppError>;
}
```

### 3.2 移既有實作邏輯到 `*_in_txn` variant、原 fn delegate

per data-model §E4.3：

```rust
#[async_trait]
impl TUserService for SysUserService {
    async fn create_user(&self, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError> {
        let db = db_helper::get_db_connection().await?;
        let txn = db.begin().await?;
        let user = self.create_user_in_txn(&txn, input, actor).await?;
        txn.commit().await?;
        Ok(user)
    }

    async fn create_user_in_txn(&self, txn: &DatabaseTransaction, input: CreateUserInput, actor: &Actor) -> Result<UserModel, AppError> {
        // 既有 create_user 邏輯整段搬到這（保留 hash password / INSERT / write_in_txn audit）
    }

    // assign_roles_to_user / update_user 同樣模式
}
```

### 3.3 改 2 個 handler 開外層 txn

`rust-api/server/api/src/admin/sys_system_manage_api.rs`：

#### add_user_for_systemmanage（lines 120-150）：

```rust
pub async fn add_user_for_systemmanage(
    Extension(user_service): Extension<Arc<SysUserService>>,
    user: User,
    Json(input): Json<SystemManageAddUserInput>,
) -> Result<Res<UserDetail>, AppError> {
    let actor = Actor::from_user(&user);
    let db = db_helper::get_db_connection().await?;
    let txn = db.begin().await?;

    let created = user_service
        .create_user_in_txn(&txn, input.clone().into(), &actor)
        .await?;

    user_service
        .assign_roles_to_user_in_txn(&txn, created.id.clone(), input.user_roles, &actor)
        .await?;

    txn.commit().await?;
    Ok(Res::ok(UserDetail::from(created)))
}
```

#### update_user_for_systemmanage：lookup_ulid_by_display_id 在 outer txn 開之前做（早返 404）；再開 outer txn、update_user_in_txn + assign_roles_to_user_in_txn + commit。

對應 C-V8 + C-V9 + C-V10。

---

## Step 4 — Metric pre-declare（FR-010）

改 `rust-api/server/initialize/src/metrics_init.rs`：

加在現有 8 metric pre-declare 後：
```rust
describe_counter!("api_key_invalidate_total", "api_key invalidate broadcast publish count");
describe_counter!("api_key_reload_total", "api_key in-memory validator reload count");
counter!("api_key_invalidate_total").absolute(0);
counter!("api_key_reload_total").absolute(0);
```

對應 C-V6 metric 流動驗證。

---

## Step 5 — Docker rebuild + dev stack restart + C-V acceptance

### 5.1 Rebuild rust-api image

```bash
docker build -t rust-api:rev1-admin-rust-api ./rust-api
# 預估 5-15min（cargo full build）
```

### 5.2 Restart rust-api（保留 obs stack 跑著）

```bash
$PC up -d --force-recreate --no-deps rust-api
sleep 12
$PC ps --format "table {{.Service}}\t{{.Status}}"
# expect: 12 service healthy（rust-api 起來 healthy 表示 build + main.rs ordering OK）
```

### 5.3 跑 C-V1~C-V12 acceptance

per [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重 build + 重跑、全 PASS 才進下一 step。

---

## Step 6 — INTEGRATION-CHECKLIST cleanup（FR-014）

修改 `docs/INTEGRATION-CHECKLIST.md`：

### 6.1 衍生 follow-up table 移除 4 row

- `F3-N1 | F3 implement | sys_endpoint::insert_many ...`
- `F3-N2 | F3 implement | sys_access_key delete atomicity gap ...`
- `F3-N3 | F3 implement | sys_endpoint::batch_remove_endpoints partial-failure ...`
- `035-N1 | 035 final review | add/update_user_for_systemmanage ...`

### 6.2 已完成里程碑加 045 entry

按 044 體例：

```markdown
- [x] **045 facade-atomicity-pass** ✅（2026-05-XX 完成；outer `<SHA>` + merge `<SHA>`、rust-api `<SHA>`、base-web 0 改動；spec `specs/045-facade-atomicity-pass/`）— bundle 4 N item: F3-N1 facade upsert_with_audit + batch_soft_delete_with_audit（sys_endpoint surface fill、service refactor）; F3-N2 sys_access_key DB↔in-memory atomicity (redis pub-sub `api_key:invalidate` + self-reload subscriber、與 W-F11 體例一致、新加 server-global/api_key_notify.rs + server-initialize/api_key_sync_initialization.rs + server-core/sign clear_all_keys + 2 metric `api_key_invalidate_total` / `api_key_reload_total`); F3-N3 facade batch_soft_delete_with_audit + BatchDeletePolicy enum (LogAndContinue endpoint_sync 體例保留); 035-N1 TUserService trait *_in_txn 雙生方法 (create_user/assign_roles_to_user/update_user)、systemManage add/update_user handler 改開 outer txn (per-path Constitution II 強化); 軌道外 rust-api + outer、0 base-web、0 schema migration、0 新 entity；下一步：base-web TS id 型別債 cleanup sprint 或其他 follow-up
```

### 6.3 Current Focus 「下一步」改向

從「044 收尾後接 P3 F-facade-atomicity-pass」→「base-web TS `id` 型別債 cleanup sprint 或其他 follow-up backlog（042-N1 ignored test 補 / 044-N1 println! cleanup / W-F15/16 backup-job）」

對應 C-V12。

---

## Step 7 — 多段式 commit（per CLAUDE.md §4.1）

### 7.1 rust-api worktree commits（estimated 5-7 個）

```bash
cd rust-api
git status  # 確認 rev1-admin-rust-api branch

# US1+US3 facade fill
git add server/model/src/admin/facade/sys_endpoint.rs server/service/src/admin/sys_endpoint_service.rs
git commit -m "feat(rust-api): 045 US1+US3 facade INSERT/UPDATE/batch surface（F3-N1+N3）"

# US2 pub-sub infra（多 commit）
git add server/core/src/sign/api_key.rs server/core/src/sign/mod.rs
git commit -m "feat(rust-api): 045 US2 server_core::sign clear_all_keys + validator clear (F3-N2)"

git add server/global/src/api_key_notify.rs server/global/src/lib.rs
git commit -m "feat(rust-api): 045 US2 api_key_notify publisher（W-F11 體例、F3-N2）"

git add server/initialize/src/api_key_sync_initialization.rs server/initialize/src/lib.rs server/initialize/src/metrics_init.rs server/bin/src/main.rs
git commit -m "feat(rust-api): 045 US2 api_key_sync_subscriber + 2 metric + main spawn（F3-N2 + FR-010/011）"

git add server/service/src/admin/sys_access_key_service.rs
git commit -m "fix(rust-api): 045 US2 delete_access_key 改走 redis pub-sub（F3-N2）"

# US4 *_in_txn 雙生方法 + handler outer txn
git add server/service/src/admin/sys_user_service.rs server/api/src/admin/sys_system_manage_api.rs
git commit -m "feat(rust-api): 045 US4 TUserService *_in_txn + systemManage handler outer txn（035-N1）"

# push 須 user 同意
# git push origin rev1-admin-rust-api
cd ..
```

### 7.2 outer rev1-admin-root commits

```bash
# rust-api SHA pin bumps（per logical 改動可分多 commit、或合 1 commit）
git add rust-api
git commit -m "chore(submodule): bump rust-api to <SHA>: 045 facade-atomicity-pass（4 US bundled）"

# INTEGRATION-CHECKLIST cleanup
git add docs/INTEGRATION-CHECKLIST.md
git commit -m "docs(spec-hygiene): 045 INTEGRATION-CHECKLIST cleanup (FR-014)"

# CLAUDE.md SPECKIT marker
git add CLAUDE.md
git commit -m "docs(claude): 045 SPECKIT marker → idle、下一步 base-web TS id 型別債"

# push 須 user 同意
# git push origin 045-facade-atomicity-pass
```

### 7.3 Merge 回 default

```bash
# acceptance 全 PASS 後：
git checkout rev1-admin-root
git merge --no-ff 045-facade-atomicity-pass -m "Merge feature 045-facade-atomicity-pass"
# push 須 user 同意
# git push origin rev1-admin-root
```

### 7.4 SHA backfill + push

merge 後拿 outer SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 045 entry 的 `<SHA>` placeholder、small chore commit（per 041/042/043/044 體例）+ push 須 user 同意。

---

## 收尾 checklist

- [ ] Step 1 facade fill（upsert + batch_soft_delete + service refactor）
- [ ] Step 2 pub-sub infra（clear_all_keys + notify + subscriber + delete refactor + main.rs spawn）
- [ ] Step 3 *_in_txn 雙生方法 + 2 handler outer txn
- [ ] Step 4 2 metric pre-declare
- [ ] Step 5 docker rebuild + restart + C-V1~C-V12 全 PASS
- [ ] Step 6 INTEGRATION-CHECKLIST 4 row 移除 + 045 entry + Current Focus 下一步
- [ ] Step 7.1 rust-api worktree 多段 commit（user 同意 push）
- [ ] Step 7.2 outer feature branch 多段 commit（user 同意 push）
- [ ] Step 7.3 merge 回 rev1-admin-root（user 同意才 push）
- [ ] Step 7.4 SHA backfill commit + push
- [ ] 通知 user 進入下一 follow-up（base-web TS id 型別債 cleanup sprint 或其他）
