# Data Model — 042 audit-outbox-and-http-mount

**Phase**：1（Design & Contracts、Phase 1 產出）
**日期**：2026-05-24
**前置**：[`spec.md`](./spec.md)、[`research.md`](./research.md)

本檔聚焦本 feature **唯一新 entity**：`sys_audit_outbox` 表。其他既有 entity（sys_operation_log）schema 0 改動、不重複定義。

---

## E1. `sys_audit_outbox` 表 schema

**Source**：spec.md FR-002（耐久暫存區）+ research.md R-7（migration naming + execute_unprepared 體例）

### DDL（schema migration `m20260524_e_audit_outbox_table.rs`）

```sql
CREATE TABLE sys_audit_outbox (
    id BIGSERIAL PRIMARY KEY,
    audit_event_json JSONB NOT NULL,
    published_at TIMESTAMPTZ NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 加速 drainer SELECT FOR UPDATE SKIP LOCKED 用
-- partial index 只索引 pending row、已 published row 不入索引、不佔空間
CREATE INDEX idx_sys_audit_outbox_pending
    ON sys_audit_outbox (id)
    WHERE published_at IS NULL;
```

### Column 說明

| Column | Type | Nullable | 用途 |
|---|---|---|---|
| `id` | BIGSERIAL | NO | PK、單調遞增、drainer ORDER BY id ASC 保 FIFO 處理順序 |
| `audit_event_json` | JSONB | NO | 完整 audit event payload（含 actor / operation / entity_type / entity_id / payload_before / payload_after / source / request_id + http_extras）|
| `published_at` | TIMESTAMPTZ | YES | drainer 處理成功後標 NOW()；NULL = 待處理 |
| `retry_count` | INTEGER | NO（default 0） | drainer 失敗時 ++；達 max_retry 後 row 標 dead-letter（不再處理）|
| `last_error` | TEXT | YES | 最後一次失敗錯誤訊息（debug 用、successful 處理不寫）|
| `created_at` | TIMESTAMPTZ | NO（default NOW()） | row 寫入時間、與業務 txn 時間對齊 |

### audit_event_json JSONB schema

drainer 將此 JSONB deserialize 為以下結構、然後 INSERT sys_operation_log：

```json
{
  "actor": {
    "id": "01HXX...",         // ULID String
    "username": "Soybean",
    "domain": "built-in"
  },
  "operation": "INSERT",       // INSERT / UPDATE / SOFT_DELETE / RESTORE / HARD_DELETE
  "entity_type": "sys_role",   // sys_user / sys_role / sys_menu / ... / http_event
  "entity_id": "01HXX...",     // 對應 sys_operation_log.entity_id
  "payload_before": null,      // INSERT=null / UPDATE/SOFT_DELETE/RESTORE=JsonValue
  "payload_after": {...},      // INSERT/UPDATE/RESTORE=JsonValue / SOFT_DELETE=null
  "description": "INSERT id=01HXX...",  // 可選 human-readable summary
  "source": {
    "type": "Http",            // Http / Internal / Cleanup
    "method": "POST",          // only when type=Http
    "url": "/api/role",
    "ip": "127.0.0.1",
    "user_agent": "Mozilla/5.0..."
  },
  "request_id": "req-abc-123",
  "http_extras": {             // only when source.type=Http
    "params": null,            // URL query params parsed
    "body": {...},             // request body
    "response": {...},         // response body
    "start_time": "2026-05-24T10:00:00",
    "end_time": "2026-05-24T10:00:00.123",
    "duration": 123            // ms
  }
}
```

**Rust struct mapping**（per research R-1 / R-2）：
- `AuditEvent` 對應 JSONB top-level fields（actor / operation / entity_type / entity_id / payload_before / payload_after / description / source / request_id）
- `HttpExtras` 為新增 helper struct、僅 source=Http 時填、含 OperationLogContext 額外 HTTP-only fields
- INSERT 時 `serde_json::to_value(&audit_event_full)` 序列化為 JSONB
- drainer SELECT 後 `serde_json::from_value(row.audit_event_json)` 反序列化為 AuditEventFull、拆 fields 填 sys_operation_log

### Row state transition

```text
                    ┌──────────────┐
                    │   INSERT     │   ←── audit_log::write_in_txn() / write_outbox_for_http()
                    │ (pending)    │       audit_event_json 寫入、published_at = NULL、retry_count = 0
                    └──────┬───────┘
                           │
                           │  drainer SELECT FOR UPDATE SKIP LOCKED
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
            ┌──────────┐      ┌──────────────┐
            │ success  │      │ Redis 或      │
            │          │      │ sys_operation │
            │          │      │ _log 失敗     │
            └────┬─────┘      └──────┬───────┘
                 │                   │
                 ▼                   ▼
        ┌────────────────┐  ┌─────────────────────┐
        │ UPDATE         │  │ UPDATE              │
        │ published_at = │  │ retry_count ++       │
        │ NOW()           │  │ last_error = ?      │
        │ (published)     │  │                      │
        └────────────────┘  └──────┬──────────────┘
                                   │
                            retry_count < max_retry?
                                   │
                          ┌────────┴────────┐
                          │ yes             │ no
                          ▼                 ▼
                  下次 drainer 再取    ┌────────────────┐
                                       │ dead-letter    │
                                       │ (留 row、不再  │
                                       │  處理、運維清) │
                                       └────────────────┘
```

### 不刪 row 紀律

- 已 published row **保留**（不 DELETE）；retention 透過後續 cleanup job 或 partition（本 feature 不實作 cleanup、只先累積、留 F12 或新 feature 處理）
- dead-letter row 也保留、運維手動修復根因後 `UPDATE retry_count = 0` 重新嘗試

**未來考量**（不在本 feature scope）：
- 已 published row 超過 N 天 cleanup（per spec 003 audit log retention discussion、cleanup-job F12 已存在、可延伸 cleanup outbox）
- outbox 表 partition by created_at month（high-volume 場景）

---

## E2. URL → entity_type 對應規則 table

**Source**：spec.md FR-004（hybrid rule）+ research.md R-6（systemManage alias 完整 grep）

實作為 pure fn `url_to_entity_type(url: &str) -> &'static str`、unit-test 涵蓋全 path。

### 完整對應 table

**⚠️ 重要**：rust-api 收到的 URL 已被 front-nginx `proxy_pass http://rust_api/` 剝離 `/api/` 前綴。表中 prefix 為 rust-api 實際收到的 path（**不含** `/api/`）。

| URL prefix（按順序匹配） | entity_type | 來源 |
|---|---|---|
| `/systemManage/addUser` | `sys_user` | systemManage alias、F8/035 |
| `/systemManage/updateUser` | `sys_user` | 同上 |
| `/systemManage/addMenu` | `sys_menu` | systemManage alias、F9/036 |
| `/systemManage/updateMenu` | `sys_menu` | 同上 |
| `/systemManage/deleteMenu` | `sys_menu` | 同上（含 `/systemManage/deleteMenu/:id`）|
| `/systemManage/batchDeleteMenu` | `sys_menu` | 同上 |
| `/systemManage/addRole` | `sys_role` | systemManage alias、F9/037 |
| `/systemManage/updateRole` | `sys_role` | 同上 |
| `/systemManage/deleteRole` | `sys_role` | 同上（含 `/:id`）|
| `/systemManage/batchDeleteRole` | `sys_role` | 同上 |
| `/systemManage/assignRoleMenus` | `sys_role` | systemManage alias、034/037（role-centric assignment）|
| `/systemManage/updateRoleHome` | `sys_role` | systemManage alias、037（W-FW6）|
| `/systemManage/assignRoleEndpoints` | `sys_role` | systemManage alias、038（W-FW8）|
| `/user` | `sys_user` | native admin router（含 `/user/:id` 等）|
| `/role` | `sys_role` | native admin router |
| `/route` | `sys_menu` | native menu router（per 041 發現 mount 在 `/route`、非 `/menu`）|
| `/domain` | `sys_domain` | native admin router |
| `/organization` | `sys_organization` | native admin router |
| `/api-endpoint` | `sys_endpoint` | native admin router |
| `/access-key` | `sys_access_key` | native admin router |
| `/authorization` | `sys_role` | role-centric assignment routes（assign-users / assign-routes / assign-permission）|
| `/auth` | `http_event` | login / changePassword / getUserInfo / etc.、非 entity-write |
| 其他 | `http_event` | fallback sentinel（per spec 003 Clarifications Q2）|

### Pure fn signature

```rust
/// Hybrid rule URL → entity_type (per spec 003 Clarifications Q2 + 042 FR-004)
///
/// 順序：systemManage alias 先（because /api/systemManage/addUser 也會 match /api/auth 規則
/// 若先做 /api/auth）、native admin router 後、fallback `http_event` 最後。
pub fn url_to_entity_type(url: &str) -> &'static str {
    // remove query string
    let path = url.split('?').next().unwrap_or(url);

    // systemManage alias（特定 endpoint suffix match）
    if path.starts_with("/api/systemManage/addUser") || path.starts_with("/api/systemManage/updateUser") {
        return "sys_user";
    }
    if path.starts_with("/api/systemManage/addMenu") || path.starts_with("/api/systemManage/updateMenu")
        || path.starts_with("/api/systemManage/deleteMenu") || path.starts_with("/api/systemManage/batchDeleteMenu") {
        return "sys_menu";
    }
    if path.starts_with("/api/systemManage/addRole") || path.starts_with("/api/systemManage/updateRole")
        || path.starts_with("/api/systemManage/deleteRole") || path.starts_with("/api/systemManage/batchDeleteRole")
        || path.starts_with("/api/systemManage/assignRoleMenus")
        || path.starts_with("/api/systemManage/updateRoleHome")
        || path.starts_with("/api/systemManage/assignRoleEndpoints") {
        return "sys_role";
    }

    // native admin router
    if path.starts_with("/api/user") { return "sys_user"; }
    if path.starts_with("/api/role") { return "sys_role"; }
    if path.starts_with("/api/route") { return "sys_menu"; }
    if path.starts_with("/api/domain") { return "sys_domain"; }
    if path.starts_with("/api/organization") { return "sys_organization"; }
    if path.starts_with("/api/api-endpoint") { return "sys_endpoint"; }
    if path.starts_with("/api/access-key") { return "sys_access_key"; }
    if path.starts_with("/api/authorization") { return "sys_role"; }

    // fallback
    "http_event"
}
```

### Unit-test 涵蓋

```rust
#[test]
fn url_entity_type_complete() {
    // systemManage alias
    assert_eq!(url_to_entity_type("/api/systemManage/addUser"), "sys_user");
    assert_eq!(url_to_entity_type("/api/systemManage/updateUser?id=1"), "sys_user");
    assert_eq!(url_to_entity_type("/api/systemManage/deleteMenu/123"), "sys_menu");
    assert_eq!(url_to_entity_type("/api/systemManage/assignRoleMenus"), "sys_role");
    assert_eq!(url_to_entity_type("/api/systemManage/updateRoleHome"), "sys_role");

    // native admin
    assert_eq!(url_to_entity_type("/api/user"), "sys_user");
    assert_eq!(url_to_entity_type("/api/user/123"), "sys_user");
    assert_eq!(url_to_entity_type("/api/role?page=1"), "sys_role");
    assert_eq!(url_to_entity_type("/api/route/tree"), "sys_menu");  // per 041
    assert_eq!(url_to_entity_type("/api/domain"), "sys_domain");
    assert_eq!(url_to_entity_type("/api/organization"), "sys_organization");
    assert_eq!(url_to_entity_type("/api/api-endpoint"), "sys_endpoint");
    assert_eq!(url_to_entity_type("/api/access-key"), "sys_access_key");
    assert_eq!(url_to_entity_type("/api/authorization/assign-users"), "sys_role");

    // fallback
    assert_eq!(url_to_entity_type("/api/auth/login"), "http_event");
    assert_eq!(url_to_entity_type("/api/auth/changePassword"), "http_event");
    assert_eq!(url_to_entity_type("/api/auth/getUserInfo"), "http_event");
    assert_eq!(url_to_entity_type("/api/random/unknown"), "http_event");
}
```

---

## E3. interaction with existing `sys_operation_log`

**Source**：spec.md FR-001（雙視角 2 row/write）+ research.md R-4

### 雙視角 row 對應

每筆 admin write 經本 feature 後產 2 row（per FR-001、spec 003 C8）：

| Row | source | method | url | entity_type | entity_id | payload_before | payload_after | params/body/response |
|---|---|---|---|---|---|---|---|---|
| INTERNAL | `AuditSource::Internal` | `"INTERNAL"` | `""` | per service caller（如 `"sys_role"`）| per service（如 `"01HXX..."`）| service snapshot（含 entity 全欄）| service snapshot | NULL（service 視角無 HTTP）|
| HTTP | `AuditSource::Http { method, url, ip, user_agent }` | `"POST"` 等 | `"/api/role"` 等 | URL→entity_type（per E2）| URL 推導（同 spec 003 listener 邏輯）| NULL（middleware 看不到 SQL-level snapshot）| NULL | request body / response body / params 完整 |

**Reader 用 method 欄區分視角**：
```sql
SELECT * FROM sys_operation_log
WHERE method = 'INTERNAL'  -- service 視角
ORDER BY created_at DESC;

SELECT * FROM sys_operation_log
WHERE method != 'INTERNAL' AND method != 'CLEANUP'  -- HTTP 視角
ORDER BY created_at DESC;
```

**Reader 串聯 2 視角**：
```sql
SELECT * FROM sys_operation_log
WHERE request_id = 'req-abc-123'  -- 同一 request 的兩視角
ORDER BY method;  -- INTERNAL 先 / POST 後（順序依 commit 時間）
```

### request_id 對齊

- request_id 由 `RequestIdLayer` middleware（per apply_layers chain）為每個 request 生成 ULID
- INTERNAL 視角：handler 從 request extensions 拿 request_id、傳入 service、service 在 AuditEvent 內填
- HTTP 視角：middleware 直接從 request extensions 拿
- 兩視角 audit row 共用同一 request_id、便於 forensic 串聯

---

## E4. 0 改動的既有 entity（reference only）

本 feature **不改動** 既有 entity schema、僅作為 reader / consumer 角色：

- `sys_operation_log`（spec 003 F2.1 已定）：drainer INSERT 目標、reader 通過 method 區分 INTERNAL / HTTP 視角
- `sys_user` / `sys_role` / `sys_menu` 等業務 entity：service-level callsite 不變、繼續呼叫 `audit_log::write_in_txn`、callsite 0 改動
- `casbin_rule`：不動、enforce path 不變

---

## Phase 1 結論

- 新 1 個 entity `sys_audit_outbox`（6 column + 1 partial index）
- 新 1 個 pure fn `url_to_entity_type`（hybrid rule、unit-test 完整）
- 雙視角 row 規則明確（method 欄區分、request_id 串聯）
- 0 既有 entity schema 改動

Ready for contracts/verification-commands.md（C-V1~C-V11 verification 設計）+ quickstart.md（implementer 操作手冊）。
