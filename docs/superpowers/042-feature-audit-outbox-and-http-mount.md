# 042 — audit-outbox-and-http-mount (R3 + F2.2 bundle)

**brainstorm date**：2026-05-24
**起源 follow-up**：
- **R3**（regression 2026-05-24 / F003 C-V8）：HTTP middleware audit gap —— `operation_log` middleware infra 存在但 `router_initialization.rs::apply_layers` 未掛 layer；admin HTTP write 只產 service-level INTERNAL audit row、缺 HTTP-source row（spec 003 C8 期望 2 row/write）。
- **F2.2**（F2 拆分、F2.1 已交）：audit-log outbox + Redis subscriber TTL fallback。

**brainstorm 結論**：R3 + F2.2 bundled 為單一 feature（per 2026-05-24 user 拍板 Medium scope）；取 **Pattern A: Unified outbox-first** 架構；完整 audit infra 一次到位（0-loss + Redis subscribers + latency 優化）。

**workspace 處置**：軌道**外**、rust-only + spec md；0 base-web 改動、0 nestjs。

---

## 1. 背景與 R3 真實狀態

### F2.1 (已落地 2026-05-14) 設計意圖

per [`specs/003-audit-log-infrastructure/spec.md`](../../specs/003-audit-log-infrastructure/spec.md) US1 + Clarifications：

- **Double-write 架構**：每個 admin HTTP write 在 `sys_operation_log` 留 **2 row** = HTTP-source（method=POST/PUT/PATCH/DELETE）+ INTERNAL-source（method=INTERNAL）
- **Hybrid entity_type 規則**：URL match `/api/sys-(user|role|menu|domain|organization|endpoint|access-key)/*` 7 條 admin pattern → entity_type=`sys_<x>`；不 match → fallback `http_event`
- **Failure 紀律**：HTTP middleware audit fail → log warn + 不影響 response（post-execution hook、業務已 commit）

### 現況 vs 設計意圖

| 元件 | 狀態 |
|---|---|
| Service-level INTERNAL audit | ✅ 工作（035–040 features 全用 `audit_log::write_in_txn`）|
| `OperationLogLayer` middleware infra | ✅ 存在 (`server/core/src/web/operation_log.rs` 485 行) |
| Event channel + listener | ✅ 存在 (`event_channel_initialization.rs:19` + `sys_operation_log_service.rs:193 sys_operation_log_listener`) |
| Listener → `audit_log::write_in_txn` | ✅ 存在（`handle_operation_log_event`、已標 `#[deprecated]` 視為 F2.1 forwarder、F2.2 預期重構）|
| **`OperationLogLayer` mount 進 `apply_layers`** | ❌ **缺**（5 處 apply_layers 0 處掛 OperationLogLayer；唯一 1 處 per-route mount 在 `sys_menu_route.rs:16 get_constant_routes`）|
| Listener 內 URL prefix 規則 | ⚠️ 寫 `/api/sys-user/*` 等 sys- 前綴；**實際 router 是** `/api/user/*` `/api/role/*`（無 sys- 前綴；menu router 實 mount 在 `/route`、per 041 發現）→ 即使 mount 也會幾乎全 fallback `http_event` |
| middleware 內 `module_name`/`description` | ⚠️ hardcode `"TODO"` placeholder |

### Reproducer

```bash
# POST /api/role 後（假設已 mount OperationLogLayer）：
psql ... -c "SELECT COUNT(*) FROM sys_operation_log WHERE method != 'INTERNAL';"
# 現行回 0（HTTP-source row 從未寫入）
# 期望回 ≥1（spec 003 C8 雙視角 2 row/write）
```

---

## 2. brainstorm 拍板（Q1–Q3）

### Q1: Scope vs F2.2 邊界 → Medium R3+F2.2 bundle

R3 + F2.2 一起做、不只 minimal 掛 layer。理由：F2.2 backlog 已預告「outbox + Redis subscriber TTL fallback」、且 spec 003 `handle_operation_log_event` deprecation note 已預告「F2.2 outbox 階段可進一步移除 event-channel architecture、把 audit 寫入內聯進 middleware response 後處理」。R3 只掛 layer 會留半套架構。

**rejected**：
- Minimal R3（只掛 layer + 修 URL prefix）：簡單但 spec 003 C8 雖達標、F2.2 outbox + Redis subscriber 仍要另開 feature、event-channel 殘留繼續疊技術債。
- Large R3+F2.2+R2：scope 過大、spec 難 review、R2 由 R3 自然覆蓋（mount layer 後 /auth/login 失敗自然產 HTTP-source row）。

### Q2: outbox 想解決的核心問題 → 三者都要

「Audit 0 loss」+「事件 source 給 subscribers」+「response latency 優化」三者都要、走 complete audit infra。

### Q3: Architectural pattern → Pattern A (Unified outbox-first)

| Pattern | 核心 | 對 3 motivations |
|---|---|---|
| **A: Unified outbox-first** | 新 `sys_audit_outbox` 表為單一 sink、drainer 推 DB + Redis | 0 loss 最強 / subscribers 一源 / latency 優（小 txn） |
| B: Direct-write + Streamer | 保 sys_operation_log 為 truth、watcher poll 推 Redis | 0 loss 不強化 / watcher polling 耗 DB |
| C: Hybrid | INTERNAL 不動、只動 HTTP | spec 003「統一 audit context」原則打折扣、雙 path debug 難 |

**Pattern A 選定**。

---

## 3. 架構設計

### 3.1 元件清單

| 元件 | 類型 | 用途 |
|---|---|---|
| `sys_audit_outbox` 表 | 新 schema migration | durable 暫存區、含 `id BIGSERIAL` / `audit_event_json JSONB NOT NULL` / `published_at TIMESTAMPTZ NULL` / `retry_count INTEGER NOT NULL DEFAULT 0` / `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` / `last_error TEXT NULL` |
| `audit_log::write_in_txn` refactor | 改既有 helper（API 不變） | 內部從直寫 sys_operation_log → 寫 sys_audit_outbox；caller 0 感知 |
| `audit_log::write_outbox_for_http` | 新 helper | middleware 用、含自管 small txn、failure 為 log warn |
| `OperationLogLayer` mount | 改 `apply_layers` 函式 | 在 5 處 router 套 OperationLogLayer（取代現 1 處 per-route）；middleware 改不 fire event、改 spawn 寫 outbox |
| `audit_outbox_drainer` 背景 task | 新 async task | `tokio::spawn` 在 `initialize/event_channel_initialization.rs` 或新檔；PG `FOR UPDATE SKIP LOCKED` 防 W-F11 多 replica 競爭 |
| `audit_publisher.rs` Redis helper | 新檔（沿 `casbin_notify.rs` 體例） | `XADD audit:events MAXLEN ~ 10000` 模式；Cluster 模式 graceful skip |
| URL prefix → entity_type 規則 fix | 改 `handle_operation_log_event` 或移到 middleware | 從 `/api/sys-user` 改 `/api/user`；加 `/api/systemManage/(addUser, updateUser, ...)` alias 規則；fallback `http_event` 保留 |
| event-channel 退役 HTTP audit | 移除 `sys_operation_log_listener` event registration | 保留 `auth_login_listener` / `jwt_created_listener` / `api_key_validate_listener` 等其他 listener |

### 3.2 Data Flow

**INTERNAL audit（service-level、現行 callsite 0 變）**：

```
handler → service.create_user(actor)
       → txn {
           INSERT sys_user;
           audit_log::write_in_txn(event)
               └─→ INSERT sys_audit_outbox (audit_event_json);
         } commit                                      ← outbox row 與業務同 txn、原子
       → 回 envelope success                          (response 立即回 client)
[drainer 後續...]
```

**HTTP middleware audit（新 mount）**：

```
middleware wraps service
   ├─ 收 request → buffer body
   ├─ call inner service → response built
   ├─ build OperationLogContext (含 method/uri/status/duration/req_body/resp_body)
   ├─ tokio::spawn {
   │      audit_log::write_outbox_for_http(ctx)
   │          └─→ INSERT sys_audit_outbox (small txn)
   │      on fail: tracing::warn!(...)
   │   }                                               ← fire-and-forget、不阻 response
   └─ return response to client                        (~0 ms audit overhead)
[drainer 後續...]
```

**Drainer（背景 task、process-lifetime）**：

```
loop {
  txn {
    SELECT id, audit_event_json, retry_count
      FROM sys_audit_outbox
      WHERE published_at IS NULL AND retry_count < 5
      ORDER BY id ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED;                          ← W-F11 多 replica safe

    for row in batch:
      try:
        XADD audit:events MAXLEN ~ 10000 audit_event_json;  ← Redis（cluster mode skip）
        INSERT sys_operation_log FROM audit_event_json;
        UPDATE sys_audit_outbox SET published_at = NOW() WHERE id = row.id;
      except:
        UPDATE sys_audit_outbox SET retry_count++, last_error = ? WHERE id = row.id;
  } commit

  if batch empty: sleep(100ms)
}
```

### 3.3 Error Handling Matrix

| 失敗點 | 行為 | Recovery |
|---|---|---|
| INTERNAL `audit_log::write_in_txn` fail | business txn 自動 rollback、handler 回 `code=9001 SERVER_DB_ERROR`（spec 003 §13.1 已定） | 業務未生效、無 audit 補償需求 |
| HTTP middleware outbox INSERT fail | tokio::spawn task 內、`tracing::warn!` + 不影響 response（per spec 003 Edge Case） | log 顯示 missing audit；無自動補償（同 spec 003 紀律） |
| Drainer XADD Redis fail | retry_count++、下次 loop 再試；不阻塞 DB write 路徑 | Redis 恢復後消化；subscribers 用 TTL fallback 從 DB 補 |
| Drainer sys_operation_log INSERT fail | retry_count++ | retry_count = 5 → dead letter（保 outbox、不再嘗試）+ tracing::error；運維手動清 |
| Drainer process down | outbox row 累積（published_at remains NULL）、不丟資料 | restart 後從 oldest unpublished 繼續 |
| 多 replica 同時跑 drainer | `FOR UPDATE SKIP LOCKED` 保證同 row 只一人取 | 自然 sharding、無 leader election |
| Redis Cluster mode 不支援 PUBLISH | 沿 `casbin_notify.rs` 體例 graceful skip；XADD 對 single key 工作（不受影響） | 退化為 DB-only audit（功能仍對；Redis 推播 disable） |

### 3.4 Subscriber TTL Fallback 語意（澄清 F2.2 backlog wording）

「Redis subscriber TTL fallback」= **retention window TTL**（不是時間 TTL）：

- Redis Stream `audit:events` 配 `MAXLEN ~ 10000`（approx 限制、Redis 自動清舊 entry）
- Subscriber 用 `XREAD STREAMS audit:events <last-id>` 增量取
- 若 subscriber 落後超過 10000 entry、會收到 `oldest available id` > 預期 → 偵測 gap
- **Fallback**：subscriber 改 `SELECT * FROM sys_operation_log WHERE id > <last-known-id>` 補資料 → 跳回 Redis stream
- DB `sys_operation_log` 永遠是 truth、Redis stream 是 hot cache + push 通道

---

## 4. Scope

### 4.1 Scope IN（本 feature 交付）

| 項 | 細節 |
|---|---|
| 1. Schema migration | 新增 `sys_audit_outbox` 表（schemas migration、含 down 對稱） |
| 2. `audit_log::write_in_txn` refactor | 內部目標改 outbox；caller API 不變、現行 030–040 全 callsite 0 改動 |
| 3. `audit_log::write_outbox_for_http` new | HTTP middleware 專用 helper、自管 small txn |
| 4. `OperationLogLayer` mount | 進 `router_initialization.rs::apply_layers`、5 處統一掛；移除 `sys_menu_route.rs:16` 既有 1 處 per-route mount（變冗餘） |
| 5. middleware refactor | 寫 outbox 取代 fire event；URL prefix → entity_type 規則 fix |
| 6. URL prefix → entity_type 規則更新 | `/api/sys-user`→`/api/user`、`/api/sys-role`→`/api/role`、`/api/sys-menu`→`/api/route`（per 041 發現）、加 `/api/systemManage/(addUser\|updateUser\|...)` → `sys_user` 等 systemManage alias 規則、fallback `http_event` |
| 7. `audit_outbox_drainer` 新背景 task | `tokio::spawn` 在 initialize 階段、`FOR UPDATE SKIP LOCKED` batch loop |
| 8. `audit_publisher.rs` 新 helper | Redis Stream `XADD audit:events MAXLEN ~ 10000`、cluster mode graceful skip（沿 `casbin_notify.rs` 體例） |
| 9. main.rs hook | drainer 在 application initialize 流程 spawn（與既有 listener spawn 同層） |
| 10. event-channel 退役 HTTP audit | 移除 `sys_operation_log_listener` event registration；保留其他 listener |
| 11. config | drainer batch_size（default 100）/ sleep_interval（default 100ms）/ max_retry（default 5）走 `application.yaml`、env override |

### 4.2 Scope OUT（本 feature 不做、留 follow-up）

- 實際 Redis subscriber（subscriber 由 W-F12/13/14 observability 或外掛系統實作）
- `/auth/logout` audit（R5）
- HARD_DELETE audit（F12 cleanup 已實作、不重複）
- 既有 sys_operation_log 歷史 row migration（不動）
- CI lint for service-level audit coverage（spec 003 §1 提及但本 feature 不擴）
- audit_log retention/cleanup（W-F12 observability 自然涵蓋）

### 4.3 Spec 003 Acceptance Self-Healing

R3+F2.2 落地後、spec 003 原 Acceptance Scenario 5（HTTP middleware audit row）+ C8（每 write 2 row）自動轉綠：

- POST /api/role → sys_audit_outbox 2 row（INTERNAL + HTTP）→ drainer → sys_operation_log 2 row ✓
- POST /auth/login（失敗）→ middleware mounted → sys_audit_outbox 1 row（HTTP-source）→ sys_operation_log → **R2 自動結案** ✓

---

## 5. Testing 與 Acceptance

### 5.1 Testing Strategy

| 層 | 範圍 |
|---|---|
| Unit | URL→entity_type 規則 table（pure fn、無 DB）；drainer batch 處理 logic（mock DB + mock Redis） |
| Integration（`--ignored`、real PG） | full drainer 一輪、多 replica SKIP LOCKED 不重複；既有 `audit_http_middleware.rs:7` G6 test 視 outbox refactor 後 update |
| E2E acceptance | contracts/verification-commands.md C-V1~C-V11，curl + psql + redis-cli + grep |

### 5.2 預期 C-V（11 條）

| C-V | Goal |
|---|---|
| C-V1 | rust-api build clean、cargo clippy 0 warning |
| C-V2 | `sys_audit_outbox` schema migration up/down 對稱、既有 sys_operation_log 0 影響 |
| C-V3 | POST /api/role → outbox 2 row（INTERNAL + HTTP）→ drainer 後 sys_operation_log 2 row |
| C-V4 | 跨 router OperationLogLayer 全掛（admin/auth/authorization 抽樣 8 endpoint） |
| C-V5 | Drainer 啟動後消化既有 outbox row、published_at 正確標 |
| C-V6 | Redis `XLEN audit:events` > 0、stream entry 含完整 audit JSON |
| C-V7 | 並行 2 個 drainer 不重複處理同 row（pgrep 等 + SELECT FOR UPDATE 驗） |
| C-V8 | Redis 暫停 → drainer retry_count++、Redis 恢復後消化 |
| C-V9 | URL → entity_type 抽樣：`/api/user`→`sys_user`、`/api/role`→`sys_role`、`/api/systemManage/addUser`→`sys_user`、`/auth/login`→`http_event` |
| C-V10 | 三邊 scope：base-web 0、rust-api ~8 檔、outer spec md + INTEGRATION-CHECKLIST + SHA pin |
| C-V11 | R2 自動結案：POST /auth/login 失敗 → sys_operation_log 含 1 HTTP-source row（method=POST） |

---

## 6. Constitution Check Preview

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| I RBAC Fail-safe | 不動 Casbin enforce path、middleware 在 casbin layer 之外（per current `apply_layers` 順序） | ✅ PASS |
| II Audit + Soft Delete | **強化** audit 完整性（spec 003 C8 期望落地、R2 自動結案、0-loss outbox） | ✅ PASS（improvement） |
| III 嚴版禁 forward + 單一職責 | drainer 為 background task、不引 service-to-service HTTP；audit_publisher 寫 Redis 為 sink 模式 | ✅ PASS |
| IV base 不改動 | 0 base-web change | ✅ PASS（預設原則） |
| V 漸進收縮 | 0 nestjs、rust-only | ✅ PASS |

---

## 7. Scale 與 effort estimate

- rust-api 檔改：~8 既有檔 + 2 新檔 + 1 新 migration = ~11 files
- 行數：~400–600 lines add/change
- 新 crate dep：**0**（redis、tokio、sea-orm、tracing 全既有）
- base-web：0 改動
- nestjs：0（已退場）
- 預估 implementer effort：~3–5 天（含 spec/plan/acceptance + 多 replica 驗證）

---

## 8. Phase 0 research 預期重點（implementer 階段）

per [`CLAUDE.md §3 Phase 0 research 紀律`](../../CLAUDE.md)（040 落地教訓）：

- **rust router mount path grep**：`grep -rn "OperationLogLayer" rust-api/server/router/` 確認本 feature 移除既有 1 處 per-route mount 不漏；`grep -n "apply_layers" rust-api/server/initialize/src/router_initialization.rs` 確認 5 處 apply_layers 全掛到
- **sys_operation_log entity_type 既有取值分布 grep**：`SELECT entity_type, COUNT(*) FROM sys_operation_log GROUP BY entity_type` 看現行哪些值出現（INTERNAL 多、HTTP-source 0）、確認 fix URL prefix 規則後預期分布
- **systemManage alias entity_type 完整對照**：grep `router/sys_route_aliases/system_manage_alias_route.rs` 或對應檔、列出全 alias endpoint + 對應 sys_* entity；避免漏 mapping
- **Redis Stream cluster mode 行為驗**：dev stack 用 single Redis、prod 可能 cluster；`XADD` cluster 用 hash slot（single key OK），確認 `audit:events` 為 single key 不 cross slot；參考 `casbin_notify.rs` 對 cluster 的處理
- **drainer 多 replica safe**：本機 docker compose `up -d --scale rust-api=2`、跑 outbox INSERT 100 row、觀察兩 instance 是否各取一半（SKIP LOCKED 驗）
- **wire 鏈條對齊**：spec 003 既有 sys_operation_log entity 與 audit_event_json 內 schema 對齊（payload_before/payload_after JSONB key、entity_type/entity_id/operation enum value）；avoid drift

---

## 9. spec-kit 設計鏈下一步

1. `/speckit-specify`（input = 本 brainstorm 文件）→ 產 `specs/042-audit-outbox-and-http-mount/spec.md` + 自動建 feature branch `042-audit-outbox-and-http-mount`
2. `/speckit-clarify`（optional、若 spec 有未決點）
3. `/speckit-plan` → 產 plan.md + research.md + data-model.md + contracts/verification-commands.md + quickstart.md
4. `/speckit-tasks` → 產 tasks.md
5. `/speckit-analyze`（optional cross-artifact consistency）
6. `superpowers:executing-plans`（**不**用 `/speckit-implement`、per CLAUDE.md §3）

---

## 10. 相關文件索引

- spec 003: [`specs/003-audit-log-infrastructure/spec.md`](../../specs/003-audit-log-infrastructure/spec.md) — F2.1 audit infrastructure；本 feature 是 F2.2 補完 + R3 mount
- middleware 元件: `rust-api/server/core/src/web/operation_log.rs:31`（OperationLogLayer）
- event channel: `rust-api/server/initialize/src/event_channel_initialization.rs:19`（current listener registration）
- listener 實作: `rust-api/server/service/src/admin/sys_operation_log_service.rs:193`（current handle_operation_log_event）
- apply_layers: `rust-api/server/initialize/src/router_initialization.rs:41`（5 處 caller）
- casbin pub/sub 體例: `rust-api/server/global/src/casbin_notify.rs:23`（Redis PUBLISH skip cluster）
- W-F11 horizontal scaling: [`specs/026-rust-horizontal-scaling/`](../../specs/026-rust-horizontal-scaling/)（多 replica 紀律）
- INTEGRATION-CHECKLIST: [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) §Follow-up Backlog R3 / F2.2 entry（本 feature 完成後移）
