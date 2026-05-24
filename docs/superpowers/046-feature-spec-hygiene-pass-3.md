# 046 spec-hygiene-pass-3 — brainstorm 設計

**日期**：2026-05-25
**Feature**：`046-spec-hygiene-pass-3`
**來源**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) Group 1 bundle（045-N2 + 044-N1 + 042-N1 + docker-compose footer trivial）+ 041/043 spec-hygiene-pass 體例

---

## 1. 觸發背景

2026-05-25 045 facade-atomicity-pass merge 落地後盤點 backlog：6 條衍生 follow-up + 3 條規劃中 + 1 條獨立軌道（base-web TS id 型別債）。User 2026-05-25 對 cohesion 分群 + 5 階段順序拍板：

- **Group 1（046 spec-hygiene-pass-3）**：spec docs + 小 code cleanup，cohesion 最高、風險最低、體例對齊 041 / 043
- Group 2（047 sandbox-protect-route-fix）：security/middleware fix，scope 清晰、不混進 cleanup bundle
- Group 3：dev infrastructure（條件觸發、不主動排）
- Group 4：獨立軌道 / 外部阻擋

041 / 043 兩次 spec-hygiene-pass 體例已驗證：bundled cleanup pass、軌道外 spec md + rust-api 小修、~12 changes 規模、implementer-stage expansion budget ≤3。本 feature 沿用體例 + 紀律、規模略大（~21 changes 含 042-N1 12 test 改寫）。

---

## 2. 範圍與 Constitution 處理

### 2.1 五 user story

| US | Priority | Follow-up | 範圍 | Touch |
|---|---|---|---|---|
| US1 | P1 | 045-N2 (a)+(b) | `data-model.md §E1.2` 2 處 erratum：whole-Model `==` → 6 業務欄位 semantic compare + tracing `target: target` → `target = target` structured field | spec md |
| US2 | P1 | 045-N2 (c)(d)(e) | `contracts/verification-commands.md` C-V2 / C-V4-V6 / C-V8 / C-V10 schema column / endpoint path / body shape / HTTP verb / userRoles 型對齊實 code | spec md |
| US3 | P1 | 044-N1 | `sys_authorization_service.rs:140/154/168` 3 處 `println!` → `tracing::debug!`（W-F12 JSON formatter 對齊） | rust-api 3 line |
| US4 | P1 | 042-N1 | 4 個 test 檔（audit_basics/audit_http_middleware/audit_transaction_rollback/soft_delete_audit_integration）共 **12 個** `#[ignore]` test 改 sleep+poll 共用 helper、保留 `#[ignore]` 改註解 | rust-api 12 test + 1 new helper file |
| US5 | P2 trivial | docker-compose footer | `docker-compose.yml` 檔頭服務數註解 8→12（反映 044 obs stack） | outer 1 line |

### 2.2 US1 — `data-model.md §E1.2` 2 處 erratum

#### 1a — whole-Model `==` semantic erratum（line ~56）

**現狀**：spec 字面 `Some(before_row) if before_row == endpoint → noop`。但 caller `router_initialization::process_collected_routes` (`router_initialization.rs:419,426`) 每次啟動 regen `display_id` (snowflake::next_display_id) + `created_at` (Local::now)、whole-Model PartialEq 永遠 false。

**Fix**：spec md 改為描述 `same_business` 6 業務欄位 semantic compare（`path / method / action / resource / controller / summary`）+ UPDATE 路徑 preserve `before_row.created_at` + `before_row.display_id`、`Set` only 6 業務 column + `updated_at`。

**Rationale**：045 implementer 階段（commit `de7bc0b`）已正確識破此 spec rot、code 已按 semantic compare 落地；spec docs 對齊實 code。

#### 1b — tracing target macro syntax E0435 erratum（line ~114）

**現狀**：spec 字面 `tracing::warn!(target: target, id = %id, error = ?e, "…")`。`target:` 為 tracing 的 metadata field、需 `&'static str` const、不能接 runtime var `target`（destructured from `BatchDeletePolicy::LogAndContinue { target }`）→ E0435 compile error。

**Fix**：spec md 改為 `target = target`（structured field 形式）；保持 C-V7 grep `target.*endpoint_sync` pattern 仍命中（fmt::json 序列化 `target=endpoint_sync` 為 field）。

**Rationale**：045 implementer 階段 Phase 7 docker build 第二次（commit `8e79e20`）已修；spec docs 對齊實 code。

### 2.3 US2 — `contracts/verification-commands.md` 5 處對齊實 code

#### 2a — C-V2 SQL column + operation case

`sys_operation_log` 表 schema column 是 `module_name`（不是 `entity_type`）+ `operation` 值為大寫 `INSERT/UPDATE`（不是 PascalCase `Insert/Update`）。Fix 對應 C-V2 query。

#### 2b — C-V4-V6 access_key endpoint path + body shape

實際 endpoint：`/api/access-key`（不是 `/api/accessKey`）；create 需 `domain` 欄（spec 漏）；access_key_id 欄名是 `accessKeyId`（base-web camelCase）。Fix 對應 3 C-V。

#### 2c — C-V8 addUser body shape

實際 field 名 `userName`（不是 `username`）；`status` 值 `"1"/"2"`（不是 `"enabled"/"disabled"`、走 systemManage transform layer per W-FW3 體例）；`userRoles` 型 `Vec<String>` role code（不是 i64 display_id）。Fix 對應 C-V8 + C-V9。

#### 2d — C-V10 updateUser verb + URL

實際 verb `POST`（不是 PUT、per F9 systemManage-alias-router R-Q1 拍板「updateUser 直接 mount 既有 handler with POST」）；URL `/systemManage/updateUser`（無 path param、display_id 在 body `id` 欄、不是 `/updateUser/{id}`）。Fix 對應 C-V10。

### 2.4 US3 — `sys_authorization_service.rs` 3 處 production println cleanup

**現狀**：

```rust
// Line 140 (in assign_permission)
println!("existing_permissions: {:?}", existing_permissions);
// Line 154
println!("new_policies: {:?}", new_policies);
// Line 168
println!("existing_policies: {:?}", existing_policies);
```

W-F12 落地後 tracing fmt::json formatter 接管 stdout；`println!` bypass formatter、產 non-JSON garbage row 落 Loki → 破壞 structured log ingestion。

**Fix**：

```rust
tracing::debug!(?existing_permissions, "assign_permission: existing_permissions");
tracing::debug!(?new_policies, "assign_permission: new_policies");
tracing::debug!(?existing_policies, "assign_permission: existing_policies");
```

**Pattern 對齊**：W-F12 `?var` Debug formatter（structured field）+ JSON formatter（single-line JSON log row）+ tracing target 自動 = module path（`server_service::admin::sys_authorization_service`）。

**Rationale**：044 research.md R-3 漏抓本 3 處；W-F12 後 Loki ingestion non-JSON garbage row 屬實際 production observability 缺口、不只 spec rot。

### 2.5 US4 — `audit_pipeline.rs` 新 test helper + 12 個 ignored test 改寫

#### 2.5.1 042 outbox refactor 觸發的 test assertion 失效

042 之前：`audit_log::write_in_txn(txn, event)` 同步寫入 `sys_operation_log` → test `SELECT FROM sys_operation_log` 立刻見 row。

042 之後（[042 spec](../../specs/042-audit-outbox-and-http-mount/)）：
- `audit_log::write_in_txn` 改寫 `sys_audit_outbox` (同 caller txn)
- 背景 drainer task 異步消化 `sys_audit_outbox` → `sys_operation_log` + Redis Stream `audit:events`
- drainer sleep_interval 預設 50ms、批量處理

**結果**：12 個 ignored integration test 仍以「`write_in_txn` 後立刻 `SELECT COUNT(*) FROM sys_operation_log`」為 assertion 模式 → 跑 `cargo test --ignored` row 數 0、assert fail。

#### 2.5.2 採 strategy (a)：in-test sleep + poll sys_operation_log

User 2026-05-25 拍板採 strategy (a)（vs (b) 改查 sys_audit_outbox / (c) in-test spawn drainer）：
- 驗證完整 pipeline（outbox → drainer → sys_operation_log → Redis Stream）
- 需 dev stack drainer 真實跑著（test prerequisite + `#[ignore]` 註解明示）

#### 2.5.3 新 helper file `tests/common/audit_pipeline.rs`

```rust
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DatabaseBackend};
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// 046 US4 helper：等 audit row 進 sys_operation_log。
///
/// 由 audit_log::write_in_txn → sys_audit_outbox（同 txn）→ drainer 異步消化
/// → sys_operation_log。輪詢 `predicate_sql` 直到回非零 count 或 timeout。
///
/// 預設 budget：drainer_sleep_interval_ms=50 × 10 = 500ms（與 042 SC-004 50ms
/// p99 + 4-5x safety margin 對齊）。
pub async fn wait_for_audit_row(
    db: &DatabaseConnection,
    predicate_sql: &str,        // 例：「module_name='sys_user' AND entity_id='ULID'」
    timeout_ms: u64,             // 預設 500
) -> Result<i64, String> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        let count = count_rows(db, predicate_sql).await?;
        if count > 0 { return Ok(count); }
        if Instant::now() >= deadline {
            return Err(format!("timeout {timeout_ms}ms waiting for {predicate_sql}"));
        }
        sleep(Duration::from_millis(50)).await;
    }
}

async fn count_rows(db: &DatabaseConnection, predicate_sql: &str) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(*) AS c FROM sys_operation_log WHERE {}", predicate_sql);
    let result = db.query_one(Statement::from_string(DatabaseBackend::Postgres, sql)).await
        .map_err(|e| e.to_string())?
        .ok_or("no row returned")?;
    result.try_get::<i64>("", "c").map_err(|e| e.to_string())
}
```

#### 2.5.4 12 個 ignored test callsite 改寫

每個 test 的 assertion section：

```rust
// Before:
let count: i64 = db.query_one(...).await?.unwrap().try_get(...)?;
assert!(count >= 1);

// After:
let count = wait_for_audit_row(&db, "module_name='sys_user' AND entity_id='...'", 500).await.unwrap();
assert!(count >= 1);
```

#### 2.5.5 `#[ignore]` 註解更新

```rust
// Before:
#[ignore = "requires real postgres + migration up"]

// After:
#[ignore = "requires dev stack drainer running (audit outbox → sys_operation_log async pipeline)"]
```

**保留 `#[ignore]` 標註**（per user 2026-05-25 拍板）：tests 仍被 `cargo test` 預設跳過、不影響 CI；手動 `cargo test -- --ignored` + dev stack 跑著時可全綠。

#### 2.5.6 涵蓋 4 test 檔分布

| 檔 | 既有 `#[ignore]` test 數 | 改 helper hit |
|---|---|---|
| `audit_basics.rs` | 5 | ~5 callsite |
| `audit_http_middleware.rs` | 2 | ~2 callsite |
| `audit_transaction_rollback.rs` | 2 | ~2 callsite |
| `soft_delete_audit_integration.rs` | 3 | ~3 callsite |
| **合計** | **12** | **~12** |

### 2.6 US5 — `docker-compose.yml` footer comment trivial

**現狀**（line 4）：

```yaml
# 8 service stack:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)
```

044 後實際 dev stack 12 service：5 既有（postgres + redis + rust-api + base-web + front-nginx）+ 7 obs（promtail + Loki + prometheus + grafana + postgres_exporter + redis_exporter + nginx-exporter）+ migration（one-shot）+ acme（prod profile）+ cleanup（jobs profile）。

**Fix**（line 4）：

```yaml
# 12 service stack（dev）:postgres + redis + migration(one-shot)+ rust-api + base-web + front-nginx + acme(prod profile)+ cleanup(jobs profile)+ observability(044): promtail + Loki + prometheus + grafana + postgres_exporter + redis_exporter + nginx-exporter
```

### 2.7 implementer-stage expansion 紀律（per 041 / 043 體例）

implementer 若在 grep / 編輯時發現**鄰近同類** stale，可在 plan 階段 `Implementer-stage Expansion Allowed` 表登記候選 + user 確認後拾取。

**允許拾取類型**：
- 其他未被 045-N2 列舉的 docs rot（同 schema column 命名 / 同 endpoint path / 同 enum value drift）
- 既有 spec md 內其他未被本 feature scope 的 stale pattern
- `sys_authorization_service.rs` 或鄰近 service file 其他 production `println!`
- 既有 `tests/common/` 內可從 `audit_pipeline.rs` helper 受惠的鄰近 ignored test

**禁止拾取**：
- 整個新 user story / 新 entity
- 新增 schema migration
- base-web 改動
- 跨 commit shape 的 refactor

**拾取上限**：≤ 3 處（同 041 / 043 precedent）

**041 / 043 先例**：041 實際擴 3 處（030 errata / 041 self spec.md / 039 user-pick）、043 實際擴 1 處（自家 contracts/verification-commands.md C-V3 grep pattern fix）；兩次都未發生 scope creep 災難。

### 2.8 Boundary & Constitution

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe (Casbin)** | 不動 Casbin enforce/policy/endpoint；US3 純 log channel 改、policy 邏輯不動 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 既有 audit pipeline 0 改動；US4 sleep+poll **驗證** outbox→drainer pipeline 既有行為；US2 spec md 修正 audit assertion query。**反向強化** Principle II（test 復活） | ✅ PASS（含 reinforce） |
| **III. 嚴版禁 Forward + 單一職責** | 純 cleanup、無新 service/endpoint/channel/metric | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web** | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → B）** | 0 nestjs；純 rust-api 小修 + spec md erratum；強化 DESIGN-B | ✅ PASS |

**架構約束同步檢查**：
- §Observability：US3 `println!`→`tracing::debug!` 是補 044 W-F12 fmt::json formatter 對齊缺口；US4 test 不動 obs stack
- §背景工作：US4 test sleep+poll 是驗證 outbox-worker 既有行為；不改 worker config
- §結構化 log：US3 直接修補 println bypass formatter 缺口

**其他 boundary**：
- 0 schema migration、0 新 entity
- 0 新 workspace cargo dep（test helper 用既有 `tokio::time::sleep` + `sea_orm` query）
- 0 新 redis channel、0 新 metric pre-declare
- 0 base-web 改動

**Constitution Check 結論**：5/5 Principle PASS、0 violation、`Complexity Tracking` 表保持空白；無需 Constitution amendment、無需 DESIGN-W-WEBUI 更新。

---

## 3. Acceptance — 8 C-V verification commands

對齊 041 / 043 體例：每 US 對應 1-2 個 C-V acceptance + boundary + INTEGRATION-CHECKLIST cleanup verify。

| C-V | 對應 US | 內容 |
|---|---|---|
| C-V1 | US1 | data-model.md §E1.2 same_business + tracing target = 兩處 erratum grep |
| C-V2 | US2 | contracts/verification-commands.md C-V2/V4-V6/V8/V10 5 處 erratum grep |
| C-V3 | US3 | sys_authorization_service.rs 0 production println! + 3 處 tracing::debug! |
| C-V4 | US4 | tests/common/audit_pipeline.rs helper 存在 + 12 test 改用 helper + #[ignore] 註解更新 |
| C-V5 | US4 (manual) | 跑 4 個 test 檔的 `--ignored` test、12/12 PASS（dev stack 要開、TEST_DATABASE_URL 設） |
| C-V6 | US5 | docker-compose.yml 檔頭 12 service 註解 |
| C-V7 | boundary | 0 base-web / 0 migration / 0 新 entity / 0 新 workspace dep |
| C-V8 | docs | INTEGRATION-CHECKLIST 3 row 移 + 046 entry |

詳細 grep / curl / cargo test command 在 `specs/046-spec-hygiene-pass-3/contracts/verification-commands.md`（spec-kit 階段 `/speckit-plan` 產出）。

---

## 4. Commit shape

### 4.1 rust-api worktree commits（estimated 2 個）

| Topic | est | files | message |
|---|---|---|---|
| US3 044-N1 println cleanup | 1 commit | `server/service/src/admin/sys_authorization_service.rs` | `fix(rust-api): 046 US3 sys_authorization_service.rs 3 處 production println! → tracing::debug!（044-N1）` |
| US4 042-N1 test helper + 12 test fix | 1-2 commit | `server/model/tests/common/audit_pipeline.rs` (NEW) + `server/model/tests/common/mod.rs` + 4 test 檔 | `feat(rust-api): 046 US4 audit_pipeline test helper + 12 ignored test 改 sleep+poll（042-N1）`（可選擇拆「helper add」+「callsite migrate」2 commit） |

### 4.2 outer rev1-admin-root commits（estimated 5-6 個）

| Topic | est | files |
|---|---|---|
| US1 045-N2 (a)(b) data-model.md erratum | 1 commit | `specs/045-facade-atomicity-pass/data-model.md` |
| US2 045-N2 (c)(d)(e) contracts/verification-commands.md erratum | 1 commit | `specs/045-facade-atomicity-pass/contracts/verification-commands.md` |
| US5 docker-compose footer | 1 commit | `docker-compose.yml` |
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker | 1-2 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| SHA backfill（post-merge）| 1 commit | INTEGRATION-CHECKLIST 046 entry placeholder |

### 4.3 Push / Merge 流程

per CLAUDE.md §5：
1. rust-api worktree `git push origin rev1-admin-rust-api` — **需 user 同意**
2. outer feature branch `git push origin 046-spec-hygiene-pass-3` — **需 user 同意**
3. `git merge --no-ff` + push rev1-admin-root — **需 user 同意**
4. SHA backfill commit + push — **需 user 同意**

---

## 5. INTEGRATION-CHECKLIST cleanup（per FR-014 體例）

### 5.1 衍生 follow-up table 移除 3 row

- 045-N2（5 sub-erratum 全清）
- 044-N1（3 處 println cleanup）
- 042-N1（12 test 改 helper + #[ignore] 註解更新）

### 5.2 已完成里程碑加 046 entry

格式對齊 044 / 045 體例（一行 entry、含 outer/merge/rust-api SHA placeholder、spec link、含 5 US 簡述、軌道屬性、下一步指向）。

### 5.3 Current Focus update

- 現狀加 046 落地段
- Active feature → `—（046 spec-hygiene-pass-3 已完成）`
- 下一步 → 047 sandbox-protect-route-fix (045-N1) 為首要

### 5.4 CLAUDE.md SPECKIT marker

更新為 `Active Spec: —（046 已 merge）` / `下一步: 047 sandbox-protect-route-fix...`。

---

## 6. 預估時間 + 預期 follow-up

### 6.1 預估時間

| 階段 | 預估 |
|---|---|
| `/speckit-specify` + `/speckit-clarify`（若有）| ~30min |
| `/speckit-plan` + Phase 0 research + Phase 1 design | ~45min |
| `/speckit-tasks` | ~15min |
| `/speckit-analyze` | ~10min |
| `superpowers:executing-plans` (subagent-driven、含 docker build + dev stack restart + 8 C-V acceptance + commit + merge) | ~2-3hr |
| **合計** | **~4-5hr** |

對齊 043 spec-hygiene-pass-2 規模（~12 changes、~3hr）+ 042-N1 12 test 額外 1-2hr。

### 6.2 預期 follow-up

| 可能性 | 內容 |
|---|---|
| 低 | 046-N1：若 implementer-stage expansion 拾取後撞 unexpected stale，作為單獨 row 登記 |
| 中 | 046-N2 (helper enhancement)：若 12 test 跑時 500ms budget 不夠（drainer 慢 / dev stack heavy load）、需放寬 to 1s+ 或加 progressive backoff |
| 低 | 046-N3：若 grep 發現 docker-compose footer 多處 stale 註解（不只 service count、可能 secret list / volume count 也 stale）→ implementer expansion 拾取 |

---

## 7. 啟動下一步 — `/speckit-specify`

per CLAUDE.md §3 step 0：本 brainstorm doc 為 spec-kit 設計鏈起點、餵給 `/speckit-specify` 產出 `specs/046-spec-hygiene-pass-3/spec.md`。

`/speckit-specify` 前 pre-hook `speckit.git.feature` 會自動建 outer branch `046-spec-hygiene-pass-3`（從當前 default `rev1-admin-root` 衍生）。

預期 spec md 結構：
- Feature Specification
- User Scenarios（5 US：spec docs / spec docs / production println / test runtime / docker-compose comment）
- Functional Requirements（FR-001 ~ FR-N、涵蓋 spec md edit / println cleanup / test helper / #[ignore] 註解 / docker-compose comment + boundary FR-12/13/14 體例）
- Success Criteria（SC-001 ~ SC-N、~8 條對應 C-V）
- Assumptions（dev stack drainer running for US4 cargo test --ignored / 045 落地完整性 / 041 / 043 體例已驗證）

---

**本檔結束**：等待 user 確認 brainstorm doc 內容 → 觸發 `/speckit-specify` 啟動 SDD 設計鏈階段 A。
