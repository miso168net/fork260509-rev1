# Data Model: 046 spec-hygiene-pass-3

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

046 為 spec docs erratum + rust-api code refactor + test helper 新加、**無 application data entity 改動**（0 schema migration）；本檔以「helper API + edit 對應表 + structured log key spec」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. Test helper API spec（US4、FR-008/009、refined per [research R-2](./research.md)）

### E1.1 新檔 `rust-api/server/model/tests/common/audit_pipeline.rs`

```rust
//! 046 US4 helper：等 audit row 從 sys_audit_outbox 透過 drainer 進到
//! sys_operation_log。test 用 closure 描述 Sea-ORM 查詢、helper 輪詢直到
//! 拿到 Some(model) 或 timeout。
//!
//! 設計目的：042 outbox refactor 後 `audit_log::write_in_txn` 改寫
//! sys_audit_outbox（同 caller txn），drainer 背景異步消化、才到
//! sys_operation_log。改前直接 SELECT 取 row 變 None；改後輪詢直到 row 出現
//! 或 timeout（500ms 默認 budget、50ms interval）。

use sea_orm::DbErr;
use server_model::admin::entities::sys_operation_log;
use std::future::Future;
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// 輪詢 find_fn 直到回 `Ok(Some(model))` 或 timeout。
///
/// `find_fn` 為 closure、每次輪詢呼叫一次、用 Sea-ORM Entity::find()
/// pattern 拿 `Option<sys_operation_log::Model>`。
///
/// 預設 budget：500ms（與 042 drainer_sleep_interval_ms=50ms × 10 safety
/// margin、042 SC-005 p95<200ms 預期落點對齊）。
///
/// # Errors
/// - 若 find_fn 任一 await 拋 DbErr → 直接回 Err（不重 try、DB 問題不是 race）
/// - timeout 撞牆回 Err(format!("timeout {timeout_ms}ms waiting for audit row"))
pub async fn wait_for_audit_row<F, Fut>(
    find_fn: F,
    timeout_ms: u64,
) -> Result<sys_operation_log::Model, String>
where
    F: Fn() -> Fut + Send,
    Fut: Future<Output = Result<Option<sys_operation_log::Model>, DbErr>> + Send,
{
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        match find_fn().await {
            Ok(Some(model)) => return Ok(model),
            Ok(None) => {
                if Instant::now() >= deadline {
                    return Err(format!("timeout {timeout_ms}ms waiting for audit row"));
                }
                sleep(Duration::from_millis(50)).await;
            }
            Err(e) => return Err(format!("find_fn DB error: {}", e)),
        }
    }
}

/// 變體：輪詢 count_fn 直到回 `Ok(count >= min_count)` 或 timeout。
///
/// 適用於 audit_http_middleware 場景需驗多 row（HTTP request 一次寫 1 HTTP
/// audit + 1 INTERNAL audit、共 2 row）。
pub async fn wait_for_audit_count<F, Fut>(
    count_fn: F,
    min_count: u64,
    timeout_ms: u64,
) -> Result<u64, String>
where
    F: Fn() -> Fut + Send,
    Fut: Future<Output = Result<u64, DbErr>> + Send,
{
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        match count_fn().await {
            Ok(c) if c >= min_count => return Ok(c),
            Ok(_) => {
                if Instant::now() >= deadline {
                    return Err(format!("timeout {timeout_ms}ms waiting for count>={min_count}"));
                }
                sleep(Duration::from_millis(50)).await;
            }
            Err(e) => return Err(format!("count_fn DB error: {}", e)),
        }
    }
}
```

### E1.2 `rust-api/server/model/tests/common/mod.rs` 更新

```rust
// 既有 entries 不動，append:
pub mod audit_pipeline;
```

### E1.3 Test callsite pattern

```rust
// Before（受 042 outbox refactor 衝擊、目前 fail）:
let audit = sys_operation_log::Entity::find()
    .filter(sys_operation_log::Column::EntityId.eq(&entity_id))
    .filter(sys_operation_log::Column::Operation.eq("INSERT"))
    .one(&txn).await.unwrap();
assert!(audit.is_some());
let audit = audit.unwrap();
assert_eq!(audit.module_name, "sys_user");

// After（呼叫 helper、closure 捕捉 entity_id + txn）:
use crate::common::audit_pipeline::wait_for_audit_row;

let audit = wait_for_audit_row(|| {
    let txn = &txn;
    let entity_id = entity_id.clone();
    async move {
        sys_operation_log::Entity::find()
            .filter(sys_operation_log::Column::EntityId.eq(&entity_id))
            .filter(sys_operation_log::Column::Operation.eq("INSERT"))
            .one(txn).await
    }
}, 500).await.unwrap();

assert_eq!(audit.module_name, "sys_user");
```

---

## E2. US1+US2 — 045 spec md edit 對應表（FR-001~006）

### E2.1 — 045 data-model.md §E1.2 兩處 erratum

| Sub | File | Target Line | Before | After |
|---|---|---|---|---|
| 1a | `specs/045-facade-atomicity-pass/data-model.md` | 56 | `if before_row == endpoint {` whole-Model `==` | `same_business(path, method, action, resource, controller, summary)` 6 業務欄位 semantic compare 描述 + UPDATE 路徑 preserve `before_row.created_at` + `display_id` + 1-2 行 rationale（caller `router_initialization.rs:419,426` 每啟動 regen） |
| 1b | 同檔 | 114 | `target: target,` runtime var (E0435) | `target = target,` structured field + 1-2 行 rationale（`target:` 需 `&'static str` const、structured field 序列化 `target=…` 仍命中 C-V grep） |

### E2.2 — 045 contracts/verification-commands.md 5 處對齊

| Sub | File | Target Line(s) | Before | After |
|---|---|---|---|---|
| 2a | `specs/045-facade-atomicity-pass/contracts/verification-commands.md` | 58, 271 | `WHERE entity_type='sys_endpoint'/'sys_user' AND operation IN ('Insert','Update')` | `WHERE module_name='sys_endpoint'/'sys_user' AND operation IN ('INSERT','UPDATE')` |
| 2b | 同檔 | 108, 126, 136, 172, 174 | `/api/accessKey` endpoint path（5 處） | `/api/access-key`；create body 加 `"domain":"dev"` |
| 2c | 同檔 | 225, 261 | `"username":"cv8user"/"cv9user","status":"enabled"` HTTP body | `"userName":"cv8user"/"cv9user","status":"1","userRoles":["ROLE_SUPER"]`（happy）/`["BOGUS_ROLE_NO_EXIST"]`（negative）|
| 2d | 同檔 | 295, 301 | `PUT /systemManage/updateUser/$USER_DID` + body 無 id | `POST /systemManage/updateUser` + body 加 `"id":$USER_DID` + `status:"1"` + `userRoles:["ROLE_..."]` |

**注意**：psql query 段 `WHERE username='cv8user'` (line 229, 246) **保持不動**——sys_user DB column 確實為 `username`（HTTP DTO 才用 camelCase `userName`）。

---

## E3. US3 — sys_authorization_service.rs production println cleanup（FR-007）

`rust-api/server/service/src/admin/sys_authorization_service.rs`：

| Line | Before | After |
|---|---|---|
| 140 | `println!("existing_permissions: {:?}", existing_permissions);` | `tracing::debug!(?existing_permissions, "assign_permission: existing_permissions");` |
| 154 | `println!("new_policies: {:?}", new_policies);` | `tracing::debug!(?new_policies, "assign_permission: new_policies");` |
| 168 | `println!("existing_policies: {:?}", existing_policies);` | `tracing::debug!(?existing_policies, "assign_permission: existing_policies");` |

**Structured log key spec**：
- target（自動）：`server_service::admin::sys_authorization_service`
- level：DEBUG
- field key：`existing_permissions` / `new_policies` / `existing_policies`（Debug formatter 序列化）
- message："assign_permission: <name>"（保留原 println context）

**Loki query example**（acceptance 用）：

```logql
{service="rust-api"} |= "assign_permission" | json
```

---

## E4. US4 — 12 個 ignored test 改寫對應（FR-010）

**注意**：實際 callsite 數 = polling-needs 測試數 × 每測 1-2 helper call；total ~6 helper call across 4 file（implementer 階段發現原 plan estimate 13 過高、因 audit_basics 3 個 audit_snapshot 純單測不 query DB、audit_transaction_rollback 2 個 + soft_delete_audit_integration 2 個為 absence assertion 用 helper 無語意）。落地後**所有 12 個 `#[ignore]` 標註更新**（保持一致）、**只有 polling-needs 測試**改用 helper（其餘保留原 query pattern 不動）。

| File | `#[ignore]` test 數 | helper call 實際 | 備註 |
|---|---|---|---|
| `audit_basics.rs` | 5 | 2 | Scenarios 4/12 改 `wait_for_audit_row`；Scenarios 7/8/9 為 audit_snapshot 純單測、不 query DB、helper 不適用 |
| `audit_http_middleware.rs` | 2 | 3 | 第 1 test 1 call；第 2 test 2 call（INTERNAL + HTTP 各 1）|
| `audit_transaction_rollback.rs` | 2 | 0 | 兩 test 皆 assert `count == 0`（rollback absence）、helper poll until appear 對「不出現」無語意 |
| `soft_delete_audit_integration.rs` | 3 | 1 | Scenario `audit_row_count_matches_operations` 用 `wait_for_audit_count(min=3)`；其餘 2 個僅 assert 業務 code 6001、不 query audit row |
| **合計** | **12** | **6** | closure pattern per E1.3 |

**`#[ignore]` 註解更新**（12 處）：

```rust
// Before:
#[ignore = "requires real postgres + migration up"]

// After:
#[ignore = "requires dev stack drainer running (audit outbox → sys_operation_log async pipeline)"]
```

---

## E5. US5 — docker-compose footer comment（FR-011）

`docker-compose.yml` line 4 區段：

| Line | Before | After |
|---|---|---|
| 4 | `# 8 service stack:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)` | `# 主 stack 8 service:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)` |
| 5（new）|（無） | `# 與 docker-compose.observability.yml(044 加 7 service:promtail + Loki + prometheus + grafana + postgres_exporter + redis_exporter + nginx-exporter)合計 dev stack 12 service。` |

**Rationale**：原註解技術上準確（主檔 scope = 8）但誤導；擴寫明示 dev 啟動含 observability overlay = 12 service total。

---

## E6. INTEGRATION-CHECKLIST cleanup（FR-014）

### E6.1 衍生 follow-up 移除 3 row

| ID | 原因 |
|---|---|
| 045-N2 | 046 US1+US2 全清 5 sub-erratum |
| 044-N1 | 046 US3 全清 3 處 println |
| 042-N1 | 046 US4 helper + 12 test 改 sleep+poll、`#[ignore]` 註解更新 |

### E6.2 已完成里程碑加 046 entry

格式對齊 044 / 045 體例（一行 entry、含 outer/merge/rust-api SHA placeholder、spec link、5 US 簡述、軌道屬性、下一步指向）。

### E6.3 Current Focus update + CLAUDE.md SPECKIT marker update

更新「現狀」段 + 「下一步」段 + CLAUDE.md SPECKIT marker 為「046 已 merge / 下一步指向 047」。

---

## E7. 5 US 落點 file:line table（per plan.md §Source Code）

| US | item | file | 改動 |
|---|---|---|---|
| US1 | 045-N2 (a) | `specs/045-facade-atomicity-pass/data-model.md` line 56 | whole-Model `==` → 6 業務欄位 semantic compare 描述（~5 line diff）|
| US1 | 045-N2 (b) | 同檔 line 114 | tracing target macro `target: target` → `target = target`（~3 line diff with rationale）|
| US2 | 045-N2 (c) | `specs/045-facade-atomicity-pass/contracts/verification-commands.md` lines 58, 271 | entity_type → module_name + Insert/Update case（~2 line diff）|
| US2 | 045-N2 (d) | 同檔 lines 108, 126, 136, 172, 174 | /api/accessKey → /api/access-key + domain field（~5 line diff）|
| US2 | 045-N2 (e1) | 同檔 lines 225, 261 | addUser body shape（~2 line diff）|
| US2 | 045-N2 (e2) | 同檔 lines 295, 301 | updateUser PUT→POST + path 改 + body 加 id（~2 line diff）|
| US3 | 044-N1 | `rust-api/server/service/src/admin/sys_authorization_service.rs` lines 140/154/168 | 3 處 println → tracing::debug!（~3 line diff + 0 line add）|
| US4 | 042-N1 helper | `rust-api/server/model/tests/common/audit_pipeline.rs` (NEW) + `mod.rs` | ~80 line (helper + variant + doc)|
| US4 | 042-N1 test fix | `tests/{audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration}.rs` | 12 test 改 closure pattern + 12 `#[ignore]` 註解更新（~40-60 line diff 總）|
| US5 | docker-compose footer | `docker-compose.yml` line 4 | 改 + add 1 line（~2 line diff）|

**改動總計**：~21 處改動、2 rust-api commit + 5-6 outer commit groups（per plan.md §Commit shape）。

---

## E8. Out-of-scope（046 不做、但相關）

- 045-N1 sandbox protect_route 根因 → 047 spec-hygiene-pass-3 後接的獨立 feature
- 042-N4 / 042-N5 dev infrastructure → 條件觸發、不主動排
- base-web TS id 型別債 → 獨立 sprint（W-WEBUI 受管例外、跨多檔 base-web）
- F1.2 / W-F6b / W-F15/16 → 長期 / 外部阻擋
- `soft_delete_basics.rs` / `soft_delete_auth_gate.rs` / `business_code_coverage.rs` 內 ignored test → 不依賴 audit drainer pipeline、不需 helper、保持 `#[ignore]` 不動（per R-6.3）
- 其他 service file 殘留 `println!`（若 implementer 階段 grep 發現）→ implementer-stage expansion budget ≤3、user 確認後拾取
