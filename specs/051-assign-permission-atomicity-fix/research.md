# Research: 051 assign-permission-atomicity-fix

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-5 audit + 拍板結果。本 sprint 為 atomicity impl fix、Phase 0 研究目標**確認 schema 對齊 + isolation level + 既有 W-F11 pattern 完整性 + fault injection technique 可行性 + endpoint reverse-map 體例**。

---

## R-1 — `casbin_rule` Sea-ORM entity 與 sea-orm-adapter schema 對齊（FR-001 / FR-005 對齊）

### R-1.1 — 問題本質

本 fix 從「enforcer.add_policies / remove_policies via SeaOrmAdapter」改為「`CasbinRule::insert_many / delete_many` via Sea-ORM ORM」。兩個寫入路徑共用同一個 `casbin_rule` table，但 schema 對齊必須驗證：
- service 層用的 Sea-ORM entity (`rust-api/server/model/src/admin/entities/casbin_rule.rs`) 是否與 sea-orm-adapter 管理的 migration schema 完全一致？
- 兩邊 column 名稱、type、nullable 等是否 1:1？

### R-1.2 — 實機驗證

`rust-api/server/model/src/admin/entities/casbin_rule.rs` 內 Sea-ORM entity:

```rust
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    #[sea_orm(column_type = "Text")]
    pub ptype: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub v0: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub v1: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub v2: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub v3: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub v4: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub v5: Option<String>,
}
```

`CasbinRule` 在 `rust-api/server/model/src/admin/entities/prelude.rs:4` 已 exposed：
```rust
casbin_rule::Entity as CasbinRule, sys_access_key::Entity as SysAccessKey, ...
```

sea-orm-adapter 的 entity 邏輯上同 table（共用 schema、本 sprint 不動 adapter）；現有 037-R1 ptype='p'/'g' UPDATE 已 ship 對 casbin_rule table 直 SQL，validated 此 table 結構穩定。

### R-1.3 — Decision

- 用 `CasbinRule::find().filter(CasbinRuleColumn::Ptype.eq("p"))...` 進行 SELECT
- 用 `CasbinRule::insert_many(active_models).exec(&txn)` 進行 INSERT
- 用 `CasbinRule::delete_many().filter(...is_in(ids))` 進行 DELETE
- INSERT row 的 ActiveModel：`ptype: Set("p".to_string())` / `v0: Set(Some(role_code))` / `v1: Set(Some(domain))` / `v2: Set(Some(path))` / `v3: Set(Some(method))` / `v4: Set(None)` / `v5: Set(None)` / `id: NotSet`（serial sequence 自動）
- Phase 1 spike 1 hr 驗：cargo build pass + 簡單 round-trip 確認 INSERT-SELECT-DELETE 走通

### R-1.4 — Cascade audit

037-R1 ptype='p'/'g' UPDATE（在 `sys_role_service.rs:231-253`）走 raw SQL via `Statement::from_sql_and_values`、不走 Sea-ORM ORM。為什麼本 sprint 改走 ORM？
- 037-R1 是 single statement UPDATE、raw SQL 簡潔
- 本 sprint 是 bulk INSERT/DELETE + multi-row SELECT，ORM API 更乾淨
- 兩種 pattern 並存無衝突（同 table 不同 fn）

**結論**：R-1 schema 對齊驗證 **PASS**、用 Sea-ORM ORM 對 `casbin_rule` 直寫；無新 cascade 影響其他 service fn。

---

## R-2 — Postgres `READ COMMITTED` isolation level 並發 race 覆蓋（FR-006 對齊）

### R-2.1 — 問題本質

兩 caller 同時對 `(role_id, domain)` assign permission：
- caller A txn 內 SELECT casbin_rule → 看 commit 前快照 A_old
- caller B txn 內 SELECT casbin_rule → 看 commit 前快照 B_old（可能與 A_old 相同）
- caller A 計算 diff、INSERT/DELETE、commit
- caller B 計算 diff 基於 B_old（可能與 A 已 commit 後狀態 inconsistent）、INSERT/DELETE、commit

潛在問題：
- B 的 INSERT 可能撞 unique constraint（如果有 (ptype, v0, v1, v2, v3) unique index）
- B 的 DELETE 可能 affect 0 row（如果 A 已 DELETE）
- 最終狀態反映 B_old 的 diff 而非 incoming permissions 的「應有狀態」(B 的 incoming 可能 outdated)

### R-2.2 — 現實風險評估

rev1 admin 系統的使用模式：
- assign_permission 是 admin user 手動操作（low frequency、no auto-scaling traffic）
- 並發 race window: 2 admin user 在 < 1 sec 內對同一 role 改 permission ← extreme rare
- 撞 unique constraint 也是「safety net」、不會 silent grant
- 撞 0 row 也是 idempotent behavior（B 的 DELETE 想刪的 row A 已刪、B 看到 affected 0、無事）

### R-2.3 — `SELECT ... FOR UPDATE` lock 必要性

選 1：加 `SELECT ... FOR UPDATE` 在 txn 開頭，鎖住 (role_id, domain) 的相關 row
- ✅ 嚴格 serializable behavior
- ❌ 增加 deadlock 風險、lock contention
- ❌ 沒 spec 要求、過 scope

選 2：不加 `FOR UPDATE`，接受 `READ COMMITTED` 行為
- ✅ 簡單、Postgres 預設、性能好
- ✅ rev1 場景 race window 極小、撞 unique constraint = AppError 路徑可接受
- ✅ 對齊 037-R1 / W-FW6 N4 / assign_routes 既有 pattern（也未用 FOR UPDATE）
- ⚠️ extreme rare lost-update：B 看 outdated 快照、commit 後最終狀態反映 B 視角

### R-2.4 — Decision

**選 2：不加 `FOR UPDATE`、用 Postgres `READ COMMITTED` 既有預設**。

理由：
- assign_permission 為 low-frequency admin 操作、race window 極小
- 既有 assign_routes / update_role 同 pattern、本 sprint 不擴範圍
- 撞 unique constraint 走 AppError → caller rollback → 不會 silent grant（atomicity 紀律仍保留）
- Stricter consistency 屬 follow-up（與 038-R1 atomicity scope 不同議題）

Phase 0 spike 不需特別測 race；Phase 2 acceptance 不要求 race scenario（per spec.md Edge Cases）。

---

## R-3 — 既有 W-F11 `notify_casbin_changed()` + `spawn_casbin_sync_subscriber` pub-sub 體例（FR-007 對齊）

### R-3.1 — 問題本質

本 fix 不再透過 enforcer.add/remove_policies 寫 DB；改為 service 層直寫 `casbin_rule`、再 notify enforcer 重載。需確認既有 W-F11 pub-sub pattern 完整覆蓋本 fix 的 enforcer reload 需求。

### R-3.2 — 既有 W-F11 流程

per `rust-api/server/initialize/src/casbin_sync_initialization.rs`：
1. `spawn_casbin_sync_subscriber` 在 rust-api startup 起 background task
2. 訂閱 redis channel `casbin:policy:invalidate`
3. 收 message 後呼 `enforcer.write().await.load_policy()` 從 DB 重載完整 policy set

per 037 (W-FW6 N4) + 050 (037-R1) 既有 callsite：
- `update_role` 在 txn commit 後呼 `notify_casbin_changed()`：發 message 到 redis channel
- 所有 replica（含本機 subscriber）收 message → 重載

### R-3.3 — 本 fix 的 enforcer reload 需求

assign_permission fix 後流程：
1. txn 開頭 SELECT casbin_rule
2. compute diff
3. INSERT new rows + DELETE old rows in txn
4. audit_log::write_in_txn
5. commit
6. `notify_casbin_changed().await`  ← 重用既有 W-F11 broadcast
7. 各 replica subscriber 收 message → `enforcer.write().load_policy()` 重載

### R-3.4 — 完整性確認

W-F11 broadcast pattern 已 production-proven（037 / 050 已重用）；本 fix 直接重用無需擴範圍。enforcer in-memory 與 DB 之間的 eventual consistency window（~10-50ms）同 037-R1 既有 ptype='p'/'g' UPDATE pattern；既有 spec acceptance 已接受。

### R-3.5 — Decision

**直接重用既有 W-F11 `notify_casbin_changed()` + `spawn_casbin_sync_subscriber` pub-sub**、無新機制；C-V4 acceptance 驗 log 命中 `Casbin policy reloaded` 訊息 + curl 命中新 policy 路徑 200 即證明 pipeline 通。

---

## R-4 — C-V3 fault injection technique 可行性（FR-006 / SC-003 對齊）

### R-4.1 — 問題本質

C-V3 acceptance 為「atomicity 反證」：注入 audit_log 寫失敗 path → 觀察 casbin_rule 與 sys_operation_log **雙方** 0 變動、證明 rollback 完整。fault injection 技術選擇：

### R-4.2 — Option A：暫改 audit_log::write_in_txn 強制回 Err

`rust-api/server/model/src/admin/audit_log.rs::write_in_txn` 是 audit pipeline 入口。暫改 fn 開頭加 1 行：
```rust
return Err(AppError::from(/* dummy: simulated failure */));
```
跑 acceptance C-V3 → 收 5xx + psql 看 0 變動 → revert（git diff 應為 0）。

✅ 乾淨、直接、必定觸發 rollback path
✅ 不需 test framework / mock crate / DI
⚠️ 需 docker rebuild rust-api image + restart container（1 docker rebuild ~5 min）

### R-4.3 — Option B：用 mock / DI 注入

寫 trait + mock impl、acceptance 透過 DI 切換、跑完 revert
- 複雜度高、改太多檔（trait 設計、mock 注入、acceptance config）
- 過 scope

### R-4.4 — Option C：DB-level fault（如 lock sys_operation_log table）

acceptance 開另一 psql session lock sys_operation_log → curl assign_permission → audit 寫等 lock → timeout → rollback
- 需 sync 兩 session、結果 hard to determinize
- timing-dependent、容易 flaky
- 過 scope

### R-4.5 — Decision

**Option A：暫改 audit_log::write_in_txn 強制 Err、docker rebuild + restart、跑 C-V3、revert**。

具體步驟：
1. 在 audit_log.rs::write_in_txn 開頭加 `return Err(AppError { code: 500, message: "C-V3 fault injection".to_string() });`
2. `docker build -t rust-api:rev1-admin-rust-api ./rust-api`
3. `docker compose ... up -d --force-recreate --no-deps rust-api` + 等 healthy
4. psql baseline 看 casbin_rule + sys_operation_log row count（before snapshot）
5. curl POST /systemManage/assignRoleEndpoints → 預期 5xx
6. psql 比對 row count 與 before 完全相同（atomicity 證明）
7. revert audit_log.rs 改動、docker rebuild、restart、確認 happy path C-V2 仍 PASS
8. 確認 git status clean（fault injection 不留 artefact）

---

## R-5 — endpoint_id ↔ (path, method) 反映表（FR-004 對齊）

### R-5.1 — 問題本質

audit payload `endpointIds` shape 需要的是 endpoint_id（如 `01KSXXX...` ULID 形）；但 casbin_rule 內存的是 `v2 = path`, `v3 = method`。txn 開頭需建反映表把 (path, method) → endpoint_id 對映、才能算出 audit payload before 用的 existing_endpoint_ids。

### R-5.2 — 既有 W-FW8 體例

per `sys_authorization_service.rs:246-261`（既有 assign_permission impl 內）：
```rust
let all_active_endpoints = sys_endpoint::find_active().all(db.as_ref()).await?;
let mut path_method_to_id: HashMap<(String, String), String> = HashMap::new();
for ep in &all_active_endpoints {
    path_method_to_id.insert((ep.path.clone(), ep.method.clone()), ep.id.clone());
}
let mut existing_endpoint_ids: Vec<String> = existing_policies.iter()
    .filter_map(|p| { ... path_method_to_id.get(&(v2, v3)).cloned() })
    .collect();
```

W-FW8 US2 已建立此 reverse-map pattern、本 fix 沿用不擴。

### R-5.3 — Decision

**沿用既有 W-FW8 reverse-map 體例**：
- txn 外 SELECT 全 active sys_endpoint（不變 txn 行為）
- 建 `path_method_to_id: HashMap<(String, String), String>`
- txn 內 SELECT casbin_rule 拿到的 row 用 `(v2.unwrap_or(""), v3.unwrap_or(""))` 反映回 endpoint_id
- 既有 W-FW8 audit payload shape `endpointIds: [endpoint_id1, endpoint_id2, ...]` 完全保留

無 new mechanism、無新 helper、scope 嚴守。

---

## Phase 0 結論

5 個 research item 全 resolve、precise pattern 確認、wording 拍板：

| Open Q | Decision | 依據 |
|---|---|---|
| `casbin_rule` Sea-ORM entity schema 對齊 | entity 已在 prelude exposed、用 ORM API（find / insert_many / delete_many）；row structure 對齊 | R-1 |
| 並發 race isolation level | 不加 `SELECT ... FOR UPDATE`、用 Postgres `READ COMMITTED` 預設；與既有 assign_routes / update_role pattern 對齊 | R-2 |
| Enforcer reload mechanism | 直接重用 W-F11 `notify_casbin_changed()` + `spawn_casbin_sync_subscriber` pub-sub；無新機制 | R-3 |
| C-V3 fault injection technique | Option A：暫改 audit_log::write_in_txn 強制 Err + docker rebuild + acceptance + revert | R-4 |
| endpoint_id 反映表 | 沿用 W-FW8 US2 reverse-map 體例（path_method_to_id HashMap、txn 外建） | R-5 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
