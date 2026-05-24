# Research: 046 spec-hygiene-pass-3

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-6 grep + 拍板結果。本 feature 為 cleanup pass、研究目標**確認精確 spec md hits + helper signature + implementer-stage expansion 候選**。

---

## R-1 — 045-N2 5 sub-erratum 精確 hits

**Source**：spec.md FR-001~FR-006

### R-1.1 — 045 data-model.md whole-Model `==` (FR-001)

**grep**：`grep -n "before_row == endpoint" specs/045-facade-atomicity-pass/data-model.md`

```
56:            if before_row == endpoint {
```

**Decision**：1 處精確 hit、line 56；改為 `same_business(path, method, action, resource, controller, summary)` 6 業務欄位 semantic compare 描述 + UPDATE 路徑明示 preserve `before_row.created_at` + `display_id`。

### R-1.2 — 045 data-model.md tracing target macro (FR-002)

**grep**：`grep -n "target: target" specs/045-facade-atomicity-pass/data-model.md`

```
114:                        target: target,
```

**Decision**：1 處精確 hit、line 114；改為 `target = target` structured field 形式 + 加 1-2 行 rationale。

### R-1.3 — 045 contracts/verification-commands.md C-V2 schema column (FR-003)

**grep**：`grep -nE "entity_type=|operation IN \\('Insert','Update'\\)"`

```
58:  "...WHERE entity_type='sys_endpoint' AND operation IN ('Insert','Update');"
271:  "...WHERE method='INTERNAL' AND entity_type='sys_user' AND ..."
```

**Decision**：**2 處** entity_type hits（line 58 C-V2 + line 271 C-V9）、**1 處** operation case 錯（line 58）；改 `entity_type` → `module_name`、`Insert/Update` → `INSERT/UPDATE`。

**Implementer 注意**：FR-003 原寫「C-V2 改 schema column」，實際發現 C-V9 也有相同 entity_type 錯誤；C-V9 屬「同類同 pattern」鄰近 stale、可拾取（不算 expansion budget、屬 FR-003 範圍延伸）。

### R-1.4 — 045 contracts/verification-commands.md C-V4-V6 access_key endpoint (FR-004)

**grep**：`grep -n "/api/accessKey" specs/045-facade-atomicity-pass/contracts/verification-commands.md`

```
108:curl ... DELETE "...//api/accessKey/$AK_DISPLAY_ID" ...
126:RESP=$(curl ... POST "...//api/accessKey" ... -d '{"description":"045-cv5-test","status":"enabled"}')
136:curl ... DELETE "...//api/accessKey/$AK_ID" ...
172:RESP=$(curl ... POST "...//api/accessKey" ... -d '{"description":"045-cv6-test","status":"enabled"}')
174:curl ... DELETE "...//api/accessKey/$AK_ID" ...
```

**Decision**：**5 處** `/api/accessKey` 全改 `/api/access-key`；create body 加 `"domain":"dev"`（per access_key entity 必填欄）。

### R-1.5 — 045 contracts/verification-commands.md C-V8/V9 addUser body (FR-005)

**grep**：`grep -nE 'cv8user|cv9user|"username":'`

```
225:curl ... POST "...//addUser" ... -d "{\"username\":\"cv8user\",\"nickName\":\"cv8\",\"password\":\"test1234\",\"status\":\"enabled\",\"userRoles\":[$ROLE_DID]}"
229:USER_ROW=$($PC ... WHERE username='cv8user' ...)
261:RESP=$(curl ... POST "...//addUser" ... -d '{"username":"cv9user",...,"status":"enabled","userRoles":[999999999]}' ...)
```

**Decision**：
- HTTP body field `username` → `userName`（line 225 + 261、共 **2 處** body hits）
- `status:"enabled"` → `status:"1"`（line 225 + 261 + 295 + 301、共 **4 處**）
- `userRoles:[$ROLE_DID]` → `userRoles:["ROLE_SUPER"]` 或同等 role code（line 225 happy path）；line 261 `userRoles:[999999999]` 屬 negative test、改 `userRoles:["BOGUS_ROLE_NO_EXIST"]`
- **psql query `WHERE username='cv8user'` (line 229, 246) 保持不動**：sys_user DB column 確實為 `username`（HTTP DTO 才用 camelCase `userName`、走 serde rename_all）

### R-1.6 — 045 contracts/verification-commands.md C-V10 updateUser (FR-006)

**grep**：`grep -nE "PUT.*updateUser|/updateUser/"`

```
295:curl ... PUT "...//systemManage/updateUser/$USER_DID" ... -d "{\"nickName\":\"cv10-update\",\"status\":\"enabled\",\"userRoles\":[$ROLE_DID]}" ...
301:RESP=$(curl ... PUT "...//systemManage/updateUser/$USER_DID" ... -d '{...,"userRoles":[999999999]}' ...)
```

**Decision**：**2 處** PUT verb + path param 全改：
- verb `PUT` → `POST`
- URL `/systemManage/updateUser/$USER_DID` → `/systemManage/updateUser`（無 path param）
- body 加 `"id": $USER_DID` 進 JSON（SystemManageUpdateUserInput 需 i64 display_id 在 body）
- body `status:"enabled"` → `status:"1"`（per R-1.5 cascade）
- body `userRoles:[i64]` → `userRoles:["ROLE_..."]`（per R-1.5 cascade）

---

## R-2 — US4 helper signature 拍板（**重要 plan-stage refinement**）

**Source**：spec.md FR-008、實 test code grep 對齊

### R-2.1 — 實 test pattern 與 spec FR-008 預設不符

**grep**：`grep -nE "sys_operation_log|assert" rust-api/server/model/tests/audit_basics.rs`

實際 test 用 Sea-ORM Entity::find().one()、**不是** raw SQL `SELECT COUNT(*)`：

```rust
// audit_basics.rs:54-65 範例
let audit = sys_operation_log::Entity::find()
    .filter(sys_operation_log::Column::EntityId.eq(&entity_id))
    .filter(sys_operation_log::Column::Operation.eq("INSERT"))
    .one(&txn).await.unwrap();
assert!(audit.is_some());
let audit = audit.unwrap();
assert_eq!(audit.module_name, "sys_user");
// ...
```

spec FR-008 預設 helper signature 為 `wait_for_audit_row(db: &DatabaseConnection, predicate_sql: &str, timeout_ms: u64) -> Result<i64, String>`、輪詢 raw SQL count；與實 test 用 Sea-ORM Entity::find().one() 拿 Option<Model> 模式不符。

### R-2.2 — 拍板 closure-based helper signature

**Decision**：將 helper signature 從「raw SQL predicate string」refine 為 **closure-based、回傳 Option<Model>**：

```rust
use sea_orm::DbErr;
use server_model::admin::entities::sys_operation_log;
use std::future::Future;
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// 046 US4 helper：等 audit row 進 sys_operation_log。
///
/// 由 audit_log::write_in_txn → sys_audit_outbox（同 txn）→ drainer 異步消化
/// → sys_operation_log。輪詢 `find_fn` 直到回 `Ok(Some(model))` 或 timeout。
///
/// 預設 budget：500ms（與 042 drainer_sleep_interval_ms=50ms × 10 safety margin、
/// 042 SC-005 p95<200ms 預期落點對齊）；timeout 撞牆回 Err。
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

/// 變體：等 row count >= N（適用於 audit_http_middleware 場景驗多 row）。
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

### R-2.3 — test callsite 改寫模式

```rust
// BEFORE:
let audit = sys_operation_log::Entity::find()
    .filter(sys_operation_log::Column::EntityId.eq(&entity_id))
    .filter(sys_operation_log::Column::Operation.eq("INSERT"))
    .one(&txn).await.unwrap();
assert!(audit.is_some());
let audit = audit.unwrap();

// AFTER:
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
```

Closure capture 用 `let ... = ...; async move {...}` pattern；borrow & move 配合 Sea-ORM `&impl ConnectionTrait`。

**Rationale**：closure 接 Sea-ORM Select 比 raw SQL 更貼 type-safe 體例、保留 Sea-ORM filter API expressiveness；spec FR-008 wording (raw SQL) 為 brainstorm-stage approximation、plan-stage refine 為 closure（同 045 體例 brainstorm spec 與 plan data-model 之間的 implementer-grade refinement）。

**Alternatives 考慮**：
- (a) 保留 raw SQL — 12 個 test 全改 raw SQL 不直覺、降低 type-safety / Sea-ORM expressiveness。**REJECTED**。
- (b) 兩個 helper（raw SQL 版 + Sea-ORM 版）— scope creep、12 個 test 都用 Sea-ORM 不需 raw SQL 版。**REJECTED**。
- (c) **closure-based**（R-2 拍板）— minimal divergence from existing test pattern、type-safe、易讀。**ACCEPTED**。

### R-2.4 — spec FR-008 wording 更新

**Decision**：spec FR-008 wording 改為「helper signature 由 plan data-model 細化、見 §[data-model](./data-model.md)；intent：輪詢 sys_operation_log 直到 row 出現或 timeout、預設 budget 500ms / interval 50ms」。

**Acceptance Scenarios 不變**：US4 acceptance 仍是「helper 存在 + 12 test 改用 helper + #[ignore] 註解更新」、不依賴 signature 確切 shape。

---

## R-3 — 12 個 ignored test callsite mapping

**grep**：`grep -n "#\[ignore" rust-api/server/model/tests/{audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration}.rs`

| File | #[ignore] 數 | 預估 helper callsite 數 |
|---|---|---|
| audit_basics.rs | 5 | ~5（每 test 1 helper call 驗 1 audit row） |
| audit_http_middleware.rs | 2 | ~2-3（HTTP middleware 一 request 可能寫多 row、用 wait_for_audit_count） |
| audit_transaction_rollback.rs | 2 | ~2（驗 rollback 前後 row 數）|
| soft_delete_audit_integration.rs | 3 | ~3（驗 soft-delete row + audit row 同 commit） |
| **合計** | **12** | **~12-13 callsite** |

**Decision**：每個 test file 改寫 pattern 一致（per R-2.3）；audit_http_middleware 部分 test 用 `wait_for_audit_count` 變體（count >= N）、其他用 `wait_for_audit_row`（Option<Model>）。

**Implementer 注意**：plan / tasks 階段不需逐 callsite 列出（過細）；executing-plans 階段 subagent 自行 grep 替換、acceptance C-V 驗 helper hit 數 ≥12。

---

## R-4 — US3 tracing::debug! structured field naming

**Source**：spec.md FR-007、044 W-F12 體例

**grep**：044 既有 `tracing::debug!` / `tracing::info!` 用法

```bash
grep -rnE "tracing::(debug|info)!\(\?" rust-api/server/service/src/ 2>/dev/null | head -3
```

**Decision**：採 `tracing::debug!(?var, "message")` Debug formatter 慣用 form（與 044 W-F12 體例對齊）：

```rust
// L140
tracing::debug!(?existing_permissions, "assign_permission: existing_permissions");
// L154
tracing::debug!(?new_policies, "assign_permission: new_policies");
// L168
tracing::debug!(?existing_policies, "assign_permission: existing_policies");
```

**Rationale**：
- `?var`（Debug formatter）matches existing fmt::json structured field 序列化
- 訊息 prefix `"assign_permission: <name>"` 保留原 `println!` 的 context（不變更 log discoverability）
- Tracing target 自動 = module path (`server_service::admin::sys_authorization_service`)、Loki query 可以 `{target=...}` filter

**Alternatives**：
- (a) `tracing::debug!(var = ?var, "msg")` — equivalent、稍 verbose、與 044 體例 form 比較少見。
- (b) `tracing::trace!` 而非 `debug!` — trace 通常不在 dev 預設 level 內、會 silent；debug 為合理 default。

---

## R-5 — US5 docker-compose footer 服務數真實狀況

**Source**：spec.md FR-011

**grep**：`grep -rn "service" docker-compose*.yml | grep -E "^.*:[0-9]+:.* service"`

```
docker-compose.yml:4:# 8 service stack:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)
docker-compose.observability.yml:4:# 7 service obs stack(per specs/044-observability-and-cleanup-pass/):
docker-compose.dev.yml:8-10:# observability.yml 本身 7 obs service 無 profiles:(預設 always-on)、故 dev 直接 include 即得 dev-default-on 7 service
```

**Decision**：`docker-compose.yml` 檔頭註解技術上**準確**（本檔 8 service：postgres + redis + migration + rust-api + base-web + front-nginx + acme [prod profile] + cleanup [jobs profile]），但**誤導**——讀者不知 dev 啟動時還會 include `docker-compose.observability.yml` 加 7 obs service = 12 dev total。

**修法**：line 4 註解擴寫：

```yaml
# Before:
# 8 service stack:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)

# After:
# 主 stack 8 service:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)
# 與 docker-compose.observability.yml(044 加 7 service:promtail + Loki + prometheus + grafana + 3 exporter)合計 dev stack 12 service。
```

**Rationale**：解釋「主檔 scope = 8、加 obs overlay = 12」、與 dev 實際運行 reality 對齊、不誤導讀者；保留主檔 description scope clarity。

---

## R-6 — Implementer-stage Expansion 候選 grep

**Source**：spec.md FR-015、041/043 體例

implementer-stage 可拾取候選（plan 階段不主動拾、留 implementer subagent grep 發現後 user 確認）：

### R-6.1 — 同類 spec md 鄰近 stale

候選 file：`specs/045-facade-atomicity-pass/quickstart.md` / `specs/045-facade-atomicity-pass/research.md`、其他 045 docs 內可能有 brainstorm-stage approximation 殘留。

**grep**：`grep -lE "entity_type=|target: target|before_row == endpoint" specs/045-facade-atomicity-pass/*.md`

候選結果（plan 階段查得）：data-model.md（已 in scope）+ contracts/verification-commands.md（已 in scope）；其他 md 暫無 hit。

### R-6.2 — 其他 service file 殘留 `println!`

**grep**：`grep -rn "println!" rust-api/server/service/src/ 2>/dev/null`

```bash
# 044 已清 sys_user_api.rs:40 1 處
# 044-N1 登記 sys_authorization_service.rs 3 處（US3 in scope）
# 其他 service file 預期 0 production println、留 implementer subagent 確認
```

### R-6.3 — 其他 common test ignored test 可受 helper 益

**grep**：4 in-scope file 之外的 ignored test：

```bash
rust-api/server/model/tests/{audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration}.rs  # in scope (12)
rust-api/server/model/tests/{soft_delete_auth_gate,soft_delete_basics,business_code_coverage}.rs  # not in scope
```

`soft_delete_basics.rs` 有 5 個 `#[ignore]` test、`soft_delete_auth_gate.rs` 有 1 個——但兩個 file 屬「soft-delete pure CRUD test」、不依賴 audit pipeline drainer、不需 helper（仍可手動 `cargo test --ignored` 跑）。

**Decision**：implementer subagent 階段 grep 確認、若發現有 audit-related assertion 需 helper 才 PASS、可拾取 ≤3；否則 0 expansion。

---

## Implementer-stage Expansion 候選總表

| 候選 | 來源 | 內容 | 估計 |
|---|---|---|---|
| (準 in scope) | R-1.3 | C-V9 line 271 entity_type 鄰近 stale | 屬 FR-003 範圍、不算 expansion |
| 預計擴 | R-6.2 | 其他 service file production println | 預估 0 處 |
| 預計擴 | R-6.3 | 其他 common test 受益 helper | 預估 0 處 |
| 預計擴 | R-6.1 | 045 其他 md spec rot | 預估 0 處 |

**Decision**：plan 階段 0 主動拾取、留 implementer subagent grep 確認後 user 確認；上限 ≤3 處（per FR-015 / 041 / 043 體例）。

---

## Phase 0 結論

6 個 research item 全 resolve、precise hit count 確認、helper signature 從 raw SQL refine 為 closure-based：

| Open Q | Decision | 依據 |
|---|---|---|
| 045-N2 spec md 5 sub-erratum 精確 line | 全 grep 確認、~9 distinct hits + cascade lines | R-1 |
| US4 helper signature | closure-based、`Result<sys_operation_log::Model, String>` + variant `wait_for_audit_count` | R-2 |
| 12 ignored test callsite mapping | 4 file × 12 test、~12-13 helper callsite、closure pattern | R-3 |
| US3 tracing::debug! form | `?var, "message"` Debug formatter 慣用 form | R-4 |
| US5 docker-compose footer fix | 主檔 8 service + observability overlay 7 service = 12 dev | R-5 |
| Implementer-stage expansion 候選 | 預估 0 處主動拾、留 subagent 階段 grep | R-6 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
