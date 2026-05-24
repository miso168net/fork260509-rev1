# Feature Specification: 045 facade-atomicity-pass

**Feature Branch**: `045-facade-atomicity-pass`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "045 facade-atomicity-pass — bundle F3-N1/F3-N2/F3-N3/035-N1 4 項 atomicity 與 facade consistency 修正。詳見 brainstorm doc `docs/superpowers/045-feature-facade-atomicity-pass.md`（已 commit `1f2a4c4` 推 origin、含 4 Q 拍板 + 8 sections user-approved + Constitution 5/5 PASS + 12 C-V acceptance 概覽 + 5 個 implementer 階段 open question）。"

**前置文件**：[`docs/superpowers/045-feature-facade-atomicity-pass.md`](../../docs/superpowers/045-feature-facade-atomicity-pass.md)（brainstorm 設計、4 Q 拍板已敲定）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Developer 從 sys_endpoint facade 看到完整 INSERT/UPDATE/batch surface（Priority: P2）

維護 rust-api 程式碼的 developer（人類或 AI implementer）查 sys_endpoint 相關寫入路徑時，應該能在 facade 層（`server-model/src/admin/facade/sys_endpoint.rs`）看到完整的寫入 API surface（不只 SELECT / soft-delete、含 INSERT/UPDATE/batch），與 facade 既有 SELECT + DELETE 的設計一致。Service 層只負責 orchestration（fetch existing rows、計算 diff），所有 row-level 寫入邏輯 + audit 都封在 facade 內。

**Why this priority**：純 code consistency / interface cleanliness、不解 runtime atomicity bug。Service 內既有 fully-qualified Sea-ORM 呼叫已含 txn + audit、不會出 production 問題；但 facade scope 不一致使 reader 難判斷 entity 寫入 SoT、影響長期可維護性。P2 規範 facade pattern 完整、為其他 entity facade 補強建立模板。

**Independent Test**：grep `rust-api/server/model/src/admin/facade/sys_endpoint.rs` 看到 `upsert_with_audit` + `batch_soft_delete_with_audit` fn 存在；grep `rust-api/server/service/src/admin/sys_endpoint_service.rs` 看 `sync_endpoints` 與 `batch_remove_endpoints` 0 個 fully-qualified Sea-ORM call、改全部透過 facade。endpoint_sync periodic job 跑後 audit row 數量對齊改前（即 1 row per endpoint write）、行為不退化。

**Acceptance Scenarios**：

1. **Given** rust-api 啟動完成、初次 `sync_endpoints` 跑完；**When** psql `SELECT COUNT(*) FROM sys_operation_log WHERE entity_type='sys_endpoint' AND operation IN ('Insert','Update')`；**Then** 數量 ≥ rust-api 註冊的 endpoint 總數（與改前對齊）。
2. **Given** facade 改完；**When** grep `upsert_endpoint_with_audit` in `rust-api/server/service/`；**Then** 0 hit（已從 service 搬到 facade）。
3. **Given** facade 既有 `soft_delete_by_id` / `find_active` API；**When** sys_endpoint 任一 SELECT / soft-delete 操作；**Then** 行為與本 feature 改前完全一致（不退化）。

---

### User Story 2 — Operator 對 sys_access_key 刪除後、in-memory validator state 立即同步（Priority: P1）🎯 MVP

維運者刪除一筆 sys_access_key（DELETE `/api/accessKey/{id}`）後，使用該 access_key 嘗試 sandbox API 呼叫應在毫秒級內被拒（401/403）而非繼續通過、直到下次 process 重啟才生效。多副本部署（W-F11 之後）下、所有 rust-api 副本的 in-memory validator state 同步無人為 lag。

**Why this priority**：真實 atomicity gap — facade commit 後到 `sign::remove_key` 兩步間若 process crash、in-memory validator 仍保有該 key 有效到 process 重啟（initialize_access_key 重新 reload）。實務上窗口可能達數小時（depends on restart cadence）。修正後跨 replica 一致、跨 crash 短期可恢復（毫秒級 redis publish + per-replica reload）。MVP 等級因為這是 access key 安全機制的真實 atomicity 弱點。

**Independent Test**：dev stack 12 service healthy 下，先建 access key → DELETE → 立刻（< 500ms）用該 key 試 sandbox `/api/sandbox/simple-api-key` 應 401；同時 prometheus query 看 `api_key_invalidate_total` counter +1（publisher 端）與 `api_key_reload_total` counter +1（subscriber 端含 publisher 自己）。

**Acceptance Scenarios**：

1. **Given** dev stack healthy、Soybean token、新建一筆 access key code=X；**When** 用 key X 呼叫 `/api/sandbox/simple-api-key`；**Then** 200 OK（已生效）。
2. **Given** key X 仍在 in-memory；**When** DELETE `/api/accessKey/{X 的 display_id}`、500ms 內 retry sandbox；**Then** 401 Unauthorized（in-memory state 已同步）。
3. **Given** key X 已刪；**When** prometheus query `api_key_invalidate_total` + `api_key_reload_total` 兩 counter；**Then** 各較 baseline +1。
4. **Given** dev stack 模擬 2 replica（單 instance 代理）；**When** 用 redis-cli 監測 `SUBSCRIBE api_key:invalidate` + 觸發 1 個 DELETE access_key；**Then** 看到 publish 訊號 `"1"` + 兩個 replica（含 publisher）都 reload。

---

### User Story 3 — Endpoint sync periodic job 個別 row 失敗仍維持 log-and-continue（Priority: P2）

endpoint_sync 是 startup-time periodic job、跑 rust-api 註冊路由表與 sys_endpoint 資料庫表的 diff（新增 + 移除）。其中「批次刪除不再存在的 endpoint」步驟刻意採 log-and-continue 設計：個別 endpoint 軟刪失敗不阻斷後續 ID，下次 sync 自然 retry。本 user story 把這個 batch 邏輯抽到 facade 層（與既有 single-row soft_delete_by_id 介面對齊）、保留 log-and-continue semantics 但介面更一致。

**Why this priority**：純 code consistency / facade fill、不改 runtime atomicity。Service 層 batch 呼叫從 for-loop 變 facade fn call、log 行為形狀對齊改前。P2 規範 facade pattern 完整。

**Independent Test**：grep facade `batch_soft_delete_with_audit` 存在 + `BatchDeletePolicy` enum 兩 variant（`FailFast` / `LogAndContinue`）；endpoint_sync 跑後若有 endpoint 需移除、docker compose logs rust-api 看 `target=endpoint_sync` warn line 形狀（with `id` + `error` fields）對齊改前。

**Acceptance Scenarios**：

1. **Given** facade 改完；**When** grep `sys_endpoint::batch_soft_delete_with_audit` + `BatchDeletePolicy` enum；**Then** 兩處都在 facade 內定義。
2. **Given** endpoint_sync 跑後存在 row 需移除；**When** docker compose logs rust-api；**Then** 看到 `target=endpoint_sync` JSON log row 對應每個成功移除 + 任何失敗都有 warn level entry。

---

### User Story 4 — systemManage admin 建立含 role 的 user、失敗時 user row 不殘留（Priority: P1）

systemManage admin user（`/systemManage/addUser` 或 `/systemManage/updateUser`）建立 user 並指派 role 失敗時（如 role 不存在 / 已軟刪），user row 不應 stay committed。改前是 2 個 txn：create_user commit → assign_roles 失敗 → user row 已寫入；admin 必須手動清。改後是 1 個 outer txn 包兩步：失敗一起 rollback。

**Why this priority**：真實 cross-service-call atomicity gap。admin 操作不是高頻、但失敗時 reader 看到「user 存在但無 role」這種「半建立」狀態 confusing、admin retry 還會撞 unique constraint。修正後失敗即 cleanly rollback、retry 流程清楚。

**Independent Test**：dev stack 健康下，POST `/api/systemManage/addUser` 帶 invalid role（如 user_roles 含不存在 role display_id）；改前：user row + INTERNAL audit 都 commit；改後：user row + INTERNAL audit 都 rollback、psql `COUNT(*) FROM sys_user WHERE username='<test>'` = 0。HTTP middleware audit row 仍 1 行（per 042 outcome-agnostic 設計、不改）。

**Acceptance Scenarios**：

1. **Given** dev stack；**When** POST `/api/systemManage/addUser` 含 valid user_roles；**Then** user row + 對應 sys_user_role rows + INTERNAL audit 2 row 同 commit（created_at 相差 < 50ms）。
2. **Given** dev stack；**When** POST `/api/systemManage/addUser` 含 invalid user_roles（不存在 role display_id）；**Then** user row 不存在、sys_user_role 0 row、INTERNAL audit 0 row。
3. **Given** dev stack；**When** PUT `/api/systemManage/updateUser/{id}` 同 happy + negative path；**Then** 同樣 outer-txn atomic 行為。
4. **Given** 改前後 030-040 callsite（其他 service / handler）；**When** 呼叫 `create_user` / `assign_roles_to_user` / `update_user`（不帶 `_in_txn` 後綴）；**Then** 行為與改前一致、各自開 txn + commit（向後相容）。

---

### Edge Cases

- **F3-N2 redis 不可用**：publisher publish 失敗 → tracing::warn! + 不 abort delete 操作（DB 已 commit 為 source of truth）。Subscriber 連線斷掉走 5s backoff reconnect（對齊 W-F11 體例）。Subscriber 中斷期間其他 replica reload 可能 stale 直到 reconnect、process restart 走 initialize_access_key 自然 rebuild。
- **F3-N2 publisher 自己 reload**：subscriber loop 收到自己 publish 的訊號也觸發 reload — 設計上是 idempotent（DB-as-truth + clear-and-rebuild、reload 第二次無副作用）。Self-loop 是 feature not bug、保證 publisher replica 跟 subscriber replicas 用同樣 code path（避免 inline `remove_key` vs `reload` 兩路分歧）。
- **035-N1 outer txn 失敗 + HTTP middleware audit**：因 042 middleware audit 在 response 階段寫、不參與 service-level txn，改後失敗路徑會看到 HTTP audit row 1 個 + INTERNAL audit row 0 個（asymmetric）。這是 042 既有 outcome-agnostic 設計、不擴 scope 改。文件明示 asymmetry 即可。
- **F3-N1 upsert before-snapshot 找不到既有 row**：視作 INSERT、新 row + audit Insert event；既有 row 視作 UPDATE、寫 audit Update event with before/after snapshot。若 row 存在但 deleted_at 不為 NULL（軟刪），按既有 facade 規則 find_active 找不到、視同 INSERT 觸發。此 edge case 在現行 sync_endpoints 流程不會出現（路徑表規則）。
- **F3-N3 strict-batch-atomic 想要**：本 feature 不提供 — `BatchDeletePolicy::FailFast` 雖 propagate error、但已 commit 的 per-id soft_delete 不會 rollback（per-id 各自 own txn）。要真 strict batch atomic 需重塑 facade `soft_delete_by_id` 接 caller txn、scope 過大、留 follow-up。
- **F3-N3 partial-failure 觀察**：endpoint_sync 採 LogAndContinue 即可（periodic job）、但 facade enum 兩 variant 留 surface、未來其他 callsite 可選 FailFast。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`server-model/src/admin/facade/sys_endpoint.rs` MUST 新增 `pub async fn upsert_with_audit<C>(db, endpoint, actor) -> Result<()>` —— fetch before snapshot、None → INSERT + audit_log::write_in_txn(Insert)、Some + diff → UPDATE + audit Update with before/after snapshot、Some + no diff → noop。
- **FR-002**：`server-model/src/admin/facade/sys_endpoint.rs` MUST 新增 `pub async fn batch_soft_delete_with_audit<C>(db, ids, actor, policy) -> Result<BatchDeleteResult>` 與 `BatchDeletePolicy::{FailFast, LogAndContinue { target: &'static str }}` enum。Per-id 走既有 facade `soft_delete_by_id`（own txn + audit）、不包外層 txn。LogAndContinue 失敗 row 仍寫入 BatchDeleteResult.failed + tracing::warn! to caller's target。
- **FR-003**：`server-service/src/admin/sys_endpoint_service.rs::sync_endpoints` 與 `batch_remove_endpoints` MUST 改全部透過 facade API 寫入、不再用 fully-qualified Sea-ORM call。Service 內 `upsert_endpoint_with_audit` helper（若存在）MUST 移除（搬到 facade）。
- **FR-004**：System MUST 提供 redis pub-sub channel `api_key:invalidate`（與 W-F11 Casbin `casbin:policy:invalidate` 體例一致）。新增 `server_global::api_key_notify::notify_api_key_changed()` —— 取 GLOBAL_PRIMARY_REDIS（Single mode）、PUBLISH `api_key:invalidate` 訊號（payload `"1"`）；fire-and-forget 失敗只 warn log。
- **FR-005**：System MUST 提供 `api_key:invalidate` channel 的 subscriber —— `server-initialize/src/api_key_sync_initialization.rs::spawn_api_key_sync_subscriber()` 對齊 `spawn_casbin_sync_subscriber` 體例（tokio::spawn + 5s backoff reconnect + `.instrument(Span::current())`）。收到訊號則呼 `reload_api_keys()` —— `server_core::sign::clear_all_keys()` 後 `SELECT * FROM sys_access_key WHERE deleted_at IS NULL` 並逐筆 `add_key`。
- **FR-006**：`server-core/src/sign/mod.rs` MUST 新增 `pub async fn clear_all_keys()` —— 一次清空 Simple + Complex validator 的所有 in-memory keys（DB-as-truth pattern）。
- **FR-007**：`server-service/src/admin/sys_access_key_service.rs::delete_access_key` MUST 移除既有兩行 `server_core::sign::remove_key(Simple/Complex, ...)` 呼叫、改為一行 `notify_api_key_changed().await`。facade `soft_delete_by_id` 路徑不動（仍 own txn + audit）。
- **FR-008**：`server-service/src/admin/sys_user_service.rs` MUST 在 `TUserService` trait 加 3 個 `*_in_txn` 變體：`create_user_in_txn(&txn, input, actor)`、`assign_roles_to_user_in_txn(&txn, user_id, role_codes, actor)`、`update_user_in_txn(&txn, id, input, actor)`。原 3 fn 保留（自開 txn + commit）、改為 delegate 到 `*_in_txn` 變體。trait fn 簽名固定 `&DatabaseTransaction`（不帶 generic `<C>`）—— async_trait + sea-orm 配合 simplest path。
- **FR-009**：`server-api/src/admin/sys_system_manage_api.rs::add_user_for_systemmanage` 與 `update_user_for_systemmanage` 兩 handler MUST 改開外層 txn —— `db.begin() → create_user_in_txn(&txn, ...) → assign_roles_to_user_in_txn(&txn, ...) → txn.commit()`（add）；`update_user_in_txn(&txn, ...) → assign_roles_to_user_in_txn(&txn, ...) → txn.commit()`（update）。任何步驟失敗 → outer txn rollback。
- **FR-010**：`server-initialize/src/metrics_init.rs` MUST 新增 2 個 metric pre-declare：`counter!("api_key_invalidate_total")` + `counter!("api_key_reload_total")`。對齊 044 既有 8 個 metric pre-declare 模式（含 describe + initialize 0）。
- **FR-011**：`server-bin/src/main.rs` MUST 在 `init_primary_redis()` 之後、`initialize_admin_router()` 之前呼叫 `server_initialize::spawn_api_key_sync_subscriber()`（與 `spawn_casbin_sync_subscriber` 順序對齊；spec 不強制 first-time `initialize_access_key` 與 subscriber spawn 的相對順序、implementer 階段拍板、idempotent 兩種順序都 OK）。
- **FR-012**：本 feature MUST 0 base-web 改動（與 W-WEBUI 軌道無關、不觸發 Constitution Principle IV 受管例外）。
- **FR-013**：本 feature MUST 0 schema migration、0 新 application entity（純 rust code refactor + 1 個 new pub-sub channel + 2 個新 metric）。
- **FR-014**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST 從衍生 follow-up table 移除 F3-N1 + F3-N2 + F3-N3 + 035-N1 四 row、已完成里程碑加 045 entry、Current Focus 「下一步」改向後續 backlog（base-web TS id 型別債 cleanup sprint 或其他）。

### Key Entities

本 feature 為 rust-api code refactor + observability stack 新 channel + new metric、無 application data entity（不動 DB schema）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、12 service（5 既有 + 7 observability）全部 healthy state、prometheus targets UI 顯示 7+ scrape job 全 UP（接 044 baseline、不退化）。
- **SC-002**：sys_endpoint facade 含完整寫入 surface：`grep "pub async fn upsert_with_audit\|pub async fn batch_soft_delete_with_audit" rust-api/server/model/src/admin/facade/sys_endpoint.rs` 命中 2 hit。
- **SC-003**：sys_endpoint_service.rs 不再含 fully-qualified Sea-ORM INSERT/UPDATE call：`grep -E "sys_endpoint::Entity::insert|sys_endpoint::ActiveModel::insert" rust-api/server/service/src/admin/sys_endpoint_service.rs` 命中 0 hit。
- **SC-004**：sys_access_key DELETE 後 in-memory validator state < 500ms 同步：刪除 key X 後、用 key X 試 sandbox `/api/sandbox/simple-api-key` 在 500ms 內回 401（用 timestamp 戳精準量測）。
- **SC-005**：`api_key_invalidate_total` + `api_key_reload_total` 兩 counter 隨 DELETE access_key 各 +1：DELETE 後 prometheus query 兩 counter 較 baseline +1。
- **SC-006**：systemManage admin user 失敗路徑 0 殘留：POST `/api/systemManage/addUser` 含 invalid user_roles → psql `SELECT COUNT(*) FROM sys_user WHERE username='<test>'` = 0 + `SELECT COUNT(*) FROM sys_user_role WHERE user_id=<found>` 等於不適用（user 不存在）+ `SELECT COUNT(*) FROM sys_operation_log WHERE method='INTERNAL' AND user_id=<found> AND created_at > <test_start>` = 0。
- **SC-007**：systemManage admin user 成功路徑 audit atomic：POST valid `/api/systemManage/addUser` → user row + sys_user_role rows + INTERNAL audit 2 row 同 commit、最大 created_at - 最小 created_at < 50ms。
- **SC-008**：本 feature 完成後 0 base-web 改動（FR-012 verify）、0 schema migration、0 新 entity（FR-013 verify）。
- **SC-009**：完成後 INTEGRATION-CHECKLIST 衍生 follow-up table 從現行 7 row（後 044）降至 3 row（移 F3-N1/N2/N3 + 035-N1）；已完成里程碑加 045 entry。

## Assumptions

- **dev stack 健康** — 12 service healthy（5 既有 + 7 observability、044 已落地）。
- **042 audit pipeline 不動** — `sys_audit_outbox` 表 + drainer + `audit_log::write_in_txn` callback registry 全保留。本 feature 加的 outer txn 透過 `write_in_txn` 寫 audit、與既有路徑 0 衝突。
- **044 observability stack 不動** — 8 個既有 metric 不改、prometheus + grafana provisioning 既有 7 個 scrape job 不改；本 feature 加的 2 個新 metric（`api_key_invalidate_total` + `api_key_reload_total`）走既有 metrics_init.rs pre-declare 機制、prometheus 自動 scrape 取到。
- **W-F11 redis pub-sub 機制不動** — `GLOBAL_PRIMARY_REDIS` 仍 Single mode（Cluster 模式 pub-sub 不在範疇）；既有 `casbin:policy:invalidate` channel 不動；新增 `api_key:invalidate` channel 與其平行運作。
- **service-trait fn `<C>` generic 不採** — `*_in_txn` trait fn 簽名固定 `&DatabaseTransaction`、不帶 type parameter（async_trait + sea-orm 配合 simplest path）；caller 必定持有 outer txn。
- **F3-N2 self-reload idempotent** — publisher 自己訂閱、收到自己的 publish 訊號也觸發 reload；reload 內部走 DB-as-truth + clear-and-rebuild、第二次無副作用、設計上不做 self-skip。
- **F3-N3 per-id 各自 own txn** — `BatchDeletePolicy::FailFast` 雖 propagate error、但已 commit 的 per-id soft_delete 不會 rollback（FailFast 是「停下不繼續」、不是「整批 rollback」）。要真 strict batch atomic 需重塑既有 `soft_delete_by_id` facade contract、scope creep、留 follow-up。
- **035-N1 HTTP middleware audit asymmetry 不修** — 失敗路徑 HTTP middleware audit row 仍 1 個 + INTERNAL audit row 0 個（per 042 outcome-agnostic design）。本 feature 不擴 scope 處理 asymmetry。
- **F3-N2 crash 期間 in-memory stale** — 若 process crash 在 facade commit 與 publish 之間（< 1ms 窗口）、本 replica 仍持 stale in-memory key 直到 process restart 走 `initialize_access_key` rebuild。改前/改後都有這個 worst case、改後窗口從「process restart cadence」收斂到「兩個 await 之間」（多個 magnitudes 改善）。
- **brainstorm 階段 4 拍板** — Session 2026-05-25 拍板 4 Q（scope 全 4 N 下動 / F3-N2 redis pub-sub + self-reload / 035-N1 service trait *_in_txn 雙生方法 / F3-N1+N3 facade fill 只 sys_endpoint YAGNI）；spec 內 0 retains clarification 標記、brainstorm doc § 完整紀錄。
- **5 個 implementer 階段 open question 不阻塞 spec**：(a) `clear_all_keys` 與 `replace_keys` 命名 (b) subscriber spawn 與 `initialize_access_key` 相對順序 (c) C-V5 500ms threshold 實機驗 (d) F3-N1 upsert before-snapshot 用 (path, method) 還是 id lookup (e) trait fn lifetime/Send bound 細節 —— 皆 implementer 階段 grep + 拍板、不擴 spec scope。
