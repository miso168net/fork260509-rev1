# Research: 044 observability-and-cleanup-pass

**Phase**：0（Outline & Research）
**日期**：2026-05-24

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-11 grep + 假設驗證結果。

---

## R-1 — rust-api 既有 tracing setup

**Source**：`rust-api/server/initialize/src/log_tracing_init.rs`（已讀）

```rust
// 既有體例（plain text formatter）
let fmt_layer = tracing_subscriber::fmt::layer()
    .with_target(true)
    .with_ansi(true);

let subscriber = Registry::default()
    .with(env_filter)
    .with(fmt_layer)
    .with(tracing_error::ErrorLayer::default());
```

**Decision**：US1 改 `fmt::layer()` → `fmt::json()` + 對齊 DESIGN-W §8.1 schema。`tracing_log::LogTracer` + `tracing_error::ErrorLayer` 保留不動。
**Rationale**：既有 layered architecture 完整、改 formatter 一行最小改動。
**Alternatives**：custom FormatEvent injection（Option 1）— 但 Q4 拍板 Option 2 tracing span，不需 custom formatter。

---

## R-2 — 8 業務 metric 落點 enumerate

| Metric | Type | 真實落點（file:line） | Note |
|---|---|---|---|
| `http_request_duration_seconds` | histogram | tower-http auto layer / metric crate macro inside TraceLayer | 與 US1 TraceLayer 接合 |
| `audit_log_writes_total` | counter | `server/model/src/admin/audit_log.rs::write_in_txn`（line 70）末尾、Result Ok branch | label: operation / entity_type |
| `casbin_enforcement_total` | counter | **未找到** casbin enforce wrapper（plan 階段 grep `fn enforce` 0 hit） | 需找 axum middleware 內 enforce callsite；plan/implementer 階段重 grep |
| `casbin_policy_cache_invalidate_total` | counter | `server/global/src/casbin_notify.rs::notify_casbin_changed`（line 23） | counter.increment(1) 在 publish 後 |
| `outbox_pending_events` | gauge | 042 drainer fetch_pending 處（`server/service/src/admin/sys_audit_outbox_drainer.rs`、line 58 主迴圈） | gauge.set(pending_count) per iteration |
| `sys_tokens_active` | gauge | **不確定**（token store callsite 0 hit；rev1 token 機制可能用 JWT stateless + sys_tokens schema row 表「曾簽出」）；plan/implementer 階段 grep 確認 | 可能 query `SELECT COUNT(*) FROM sys_tokens WHERE expires_at > NOW()` 對齊 |
| `cleanup_job_rows_deleted_total` | counter | `rust-api/server/cleanup/src/main.rs` 內 delete 後 increment | binary 為獨立 cron job、metric expose 需與 main rust-api `/metrics` 共用 registry 或自暴 sidecar |
| `backup_completed_total` | counter | **不存在** — backup 在 `W-F15/16` 未排程 feature（W-F11 是 rust-horizontal-scaling、非 backup-job） | **見 spec correction §A4** |

**Decision**：US2 8 metric → **預計 instrument 6 metric**（http_request_duration / audit_log_writes / casbin_policy_cache_invalidate / outbox_pending_events / cleanup_job_rows_deleted）+ **2 metric pre-declare 0 series**（casbin_enforcement_total / sys_tokens_active 留 implementer 階段確認落點；backup_completed_total 待 W-F15/16）。
**Rationale**：先 declare metric name + 0 series 讓 prometheus + grafana dashboard 即時生效、有 instrument 落點時直接 increment 不需 dashboard 改動。
**Alternatives**：spec FR-005 縮為 6 metric — 但 Q1 拍板 Option A Full §8 spec、應保持 8 metric 命名以對齊 DESIGN-W §8.3。

---

## R-3 — `print!` 3 處 grep（F3-N4）

**Source**：full repo grep

| Pattern | Hits | Locations |
|---|---|---|
| `print!` (sans ln) | **1** | `rust-api/server/api/src/admin/sys_user_api.rs:40 print!("user is {:#?}", user);` |
| `println!` in production code | 1 | `rust-api/server/core/src/sign/api_key_middleware.rs:278`（在 `#[cfg(test)]` 內、不會 bypass JSON） |
| `println!` in `operation_log.rs` 內 | 多處 | 都在 `#[cfg(test)]` block 內（lines 328-330, 394-399, 416, 447, 470）|
| `println!` / `eprintln!` 啟動 CLI msg | 多處 | config/src/multi_instance_env.rs / bin/src/main.rs — 是 startup CLI 輸出、合理保留 |

**Decision**：US6 / FR-013 scope **縮小** — 只清 1 處 `print!` 在 `sys_user_api.rs:40`、其他都是 test code 或 startup msg、合理保留。
**Rationale**：backlog F3-N4 條目寫「3 處 (sys_user_api / sys_menu_api / sys_authorization_service)」是當時估計、實際 grep 只 1 處 `print!`、其他 callsite 是 `println!` 但都在 `#[cfg(test)]` 或 startup CLI 範圍。
**Alternatives**：擴 scope 清 production code 內所有 println!（要看是否 bypass JSON formatter）— 但 cfg(test) 是 test binary 範圍、不會在 dev / prod runtime 跑、無需 fix。
**See spec correction §A1**：FR-013 從「3 處」改「1 處實 `print!`、其他 println! 在 test/CLI 範圍 deferred」。

---

## R-4 — `extract_entity_id_from_url` 真實位置（042-N2）

**Source**：

- 042-N2 backlog 條目假設 fn 在 `server/core/src/web/operation_log.rs`
- 實際 grep：fn 定義在 **`server/model/src/admin/audit_log.rs:196`**、由 `audit_log::write_in_txn`（line 127）呼叫
- code：

```rust
// audit_log.rs:196
/// best-effort entity_id 抽取：取 URL path 第 2 段（split('/').nth(2)）。
/// 例：`/user/123?x=1` → `["", "user", "123"]`.nth(2) = `"123"`。
/// 無 path segment 時返空字串（drainer / sys_operation_log.entity_id 容許 NULL/空）。
fn extract_entity_id_from_url(url: &str) -> String {
    url.split('/')
        .nth(2)
        .map(String::from)
        .unwrap_or_default()
}
```

對 `/systemManage/deleteMenu/123`：split = `["", "systemManage", "deleteMenu", "123"]`、`.nth(2)` = `"deleteMenu"` ✗（應是 `"123"`）

**Decision**：US4 / FR-011 fix location **改正** — 從 `server/core/src/web/operation_log.rs` 改 `server/model/src/admin/audit_log.rs:196`、hybrid rule：

```rust
fn extract_entity_id_from_url(url: &str) -> String {
    let parts: Vec<&str> = url.split('/').collect();
    // parts: ["", "systemManage", "deleteMenu", "123"] OR ["", "role", "123"]
    if parts.get(1) == Some(&"systemManage") {
        parts.get(3).map(|s| s.to_string()).unwrap_or_default()
    } else {
        parts.get(2).map(|s| s.to_string()).unwrap_or_default()
    }
}
```

**Rationale**：保持既有 split-based 直觀 API、無需 filter empty / refactor signature。
**Alternatives**：用 `url::Url` crate parse path segment（更 robust）— 但 042-N2 scope 限本 fn 單點修、避免引新 dep。
**See spec correction §A2**：FR-011 file path 改正。

---

## R-5 — `OperationLogContext` `module_name`/`description` "TODO" placeholder

**Source**：`rust-api/server/core/src/web/operation_log.rs:121-126`

```rust
// pre-existing (F2.1 era)
let context = OperationLogContext {
    method: method.clone(),
    url: uri.clone(),
    module_name: "TODO".to_string(),
    description: "TODO".to_string(),
    ...
};
```

**Decision**：US5 / FR-012 fix:
- `module_name` 從 url 推導 entity_type（hybrid rule 同 R-4：systemManage path 走 verb name、native path 走 first segment）；或 `"http_event"` fallback
- `description` 改 `format!("HTTP {} {}", method, url)` 對齊 042 既有 fallback 文字

**Rationale**：保持 audit row 自我描述、reader 不必查 url 推導。
**Alternatives**：lookup table（systemManage verb → entity_type）— 但 verb 命名規律（`deleteX` / `updateX`），直接 split + 推導較簡。

---

## R-6 — Status enum mixed pattern grep（041-N1、US7）

**Source**：rust-api + base-web full grep

| Grep pattern | Hits |
|---|---|
| `status.*=.*"1"` / `status.*=.*"2"` in rust-api | **0** |
| `status.*enabled` / `status.*disabled` 字面 in rust-api（除 schema migration / Sea-ORM ActiveEnum macro 定義處外） | **0** in main code paths |
| `status === '1'` / `'2'` in base-web | **0** (only `null` / `'200'` / `'MILESTONE'` unrelated hits) |

**Decision**：US7 / FR-014 → **out-of-scope（hits ≤ 5 但 effectively 0 hit）**。041-N1 backlog 條目「W-FW5/F8 後混雜」描述可能 stale（後續 features 已修）或藏在 transform layer 內不影響 wire；本 spec 內登記 errata 留 045 spec-hygiene-pass-3 後續確認、不動 code。
**Rationale**：W-FW5 / W-FW6 / W-FW8 / W-F9 / 040 都涉及 status field handling、可能已隱式清完；無實際 wire/DB 混雜不解。Q3 拍板的「transform layer + 明文界定」已是 rev1 既有體例。
**Alternatives**：用 broader grep pattern（如 `into\("1"\)` / `\.eq\("1"\)`）— 留 implementer 階段抽空跑、若仍 0 hit 結案登記。
**See spec correction §A3**：US7 / FR-014 改「out-of-scope errata、in-scope hits 0、留 045」。

---

## R-7 — `tokio::spawn` callsite enumerate（per FR-004）

**Source**：rust-api full grep `tokio::spawn` / `tokio::task::spawn`（排除 test）

| File:Line | Context |
|---|---|
| `server/global/src/global.rs:163` | `spawn(string_listener(string_rx))` — event channel listener |
| `server/global/src/global.rs:176` | `spawn(listener(rx))` — generic listener |
| `server/global/src/global.rs:265` | `spawn(async move { ... })` — TBD context（need expand） |
| `server/global/src/global.rs:274` | 同上 |
| `server/global/src/global.rs:331` | 同上 |
| `server/initialize/src/audit_outbox_initialization.rs:53` | 042 outbox drainer 主迴圈 |
| `server/initialize/src/casbin_sync_initialization.rs:34` | Casbin policy sync redis subscriber |
| `server/initialize/src/ip2region_initialization.rs:8` | `spawn_blocking` ip2region 初始化（CPU-bound）|
| `server/core/src/web/operation_log.rs:143` | 042 `spawn_http_audit_write` fire-and-forget |

**Decision**：US1 / FR-004 → 9 個 callsite 全 enumerate、每個加 `.instrument(parent_span)`。spawn_blocking 一個（不需 .instrument、CPU-bound）；其他 8 個 async spawn 都加。
**Rationale**：tracing crate `Instrument` trait 是標準做法；async spawn 沒 instrument 會 lose span context、log JSON 出現 "-" request_id。
**Alternatives**：用 `tokio-task-tracker` crate 自動 wrap — 但會破壞既有 spawn 樣式、effort 大。

---

## R-8 — 既有 `deploy/secrets/` pattern

**Source**：`ls -la deploy/secrets/`

| 現有檔 | Pattern |
|---|---|
| `database_url.txt` + `.example` | postgres connection string |
| `redis_password.txt` + `.example` | redis auth |
| `redis_url.txt` + `.example` | redis connection string |
| `jwt_secret.txt` + `.example` | JWT signing |
| `cleanup_database_url.txt` + `.example` | cleanup job credential |
| `postgres_password.txt` + `.example` | postgres root |
| `refresh_token_secret.txt` + `.example` | refresh token signing |
| `acme_email.txt.example` | acme.sh 用 |

**Decision**：044 新 secret 沿用體例 — `grafana_admin_password.txt` + `grafana_admin_password.txt.example`、`postgres_exporter_dsn.txt` + `postgres_exporter_dsn.txt.example`。
**Rationale**：與既有 9 個 secret file 命名一致、實檔 gitignored / .example 進 outer git。
**Alternatives**：grafana 預設用 env var（docker compose）— 但 `_FILE` pattern 是 Constitution 架構約束「Secret 注入」明文要求。

---

## R-9 — front-nginx 既有 stub_status config

**Source**：`grep "stub_status" deploy/nginx/`

**結果**：**0 hit** — front-nginx 既有 config 沒有 stub_status location。

**Decision**：US2 / FR-007 fix — 新建 `deploy/nginx/stub_status.conf` include 在 front-nginx 既有 server block 內、bind 在 internal port（如 :8081、不暴 host）、Casbin / TLS 不過該 path（純 internal scrape）。
**Rationale**：nginx-exporter 需要 stub_status endpoint 才能 scrape；標準 nginx 配置。
**Alternatives**：用 access_log JSON parse 取代 metric — 但 access_log 是 log path、不是 metric path；scope 越界。

---

## R-10 — `metrics-exporter-prometheus` 既有？

**Source**：`grep metrics-exporter-prometheus rust-api/`

**結果**：**0 hit** — rust-api workspace 沒既有 metrics crate。

**Decision**：US2 / FR-005 — 新加 workspace dep：
- `metrics = "0.23"`（registered facade）
- `metrics-exporter-prometheus = "0.15"`（Prometheus exposition format renderer）

加 `server/initialize/Cargo.toml` dep；新 file `server/initialize/src/metrics_init.rs`。
**Rationale**：標準 rust metrics 生態、輕量、無 runtime overhead。
**Alternatives**：用 `prometheus` crate（更老）— 但 `metrics` 是現代 facade、可換 backend、未來改 OpenTelemetry 簡單。

---

## R-11 — DESIGN-W §8.3 8 metric 與 rev1 既有 service 對齊狀況

**Source**：DESIGN-W §8.3 + R-2 grep 結果 + W-F11 / W-F15-16 status

| Metric | 落點 status |
|---|---|
| `http_request_duration_seconds` | ✅ 可 instrument（tower-http auto） |
| `audit_log_writes_total` | ✅ 可 instrument（audit_log.rs:70） |
| `casbin_enforcement_total` | ⚠️ enforce wrapper 待 implementer 階段 grep；axum middleware 內 |
| `casbin_policy_cache_invalidate_total` | ✅ 可 instrument（casbin_notify.rs:23） |
| `outbox_pending_events` | ✅ 可 instrument（drainer main loop） |
| `sys_tokens_active` | ⚠️ token store callsite 不明、實作為 JWT stateless 或 query sys_tokens table、留 implementer 階段確認 |
| `cleanup_job_rows_deleted_total` | ✅ 可 instrument（cleanup binary、需與 main rust-api `/metrics` 共用 registry 設計） |
| `backup_completed_total` | ❌ **backup wrapper 不存在**（W-F15/16 未排程） |

**Decision**：US2 / FR-005 採 **pre-declare-and-defer-instrument** 模式：
- 6 個 metric **立即 instrument**（http_request_duration / audit_log_writes / casbin_policy_cache_invalidate / outbox_pending_events / cleanup_job_rows_deleted + casbin_enforcement once located）
- 1 個 metric **declare 0 series**（sys_tokens_active gauge.set(0)、待 token store callsite 確認後 instrument；可能 implementer 階段補入 scope）
- 1 個 metric **declare 0 series 永久**（backup_completed_total 待 W-F15/16 真實 backup job 來 instrument、044 留 dashboard panel placeholder）

**Rationale**：dashboard / alerting rules 引用 metric name；先 declare 確保 panel + rule 不會掛 "No data" error；instrument 點補上後直接 increment 不需改動 dashboard。
**Alternatives**：spec FR-005 縮為 6 metric（移 sys_tokens_active + backup_completed_total）— 但 DESIGN-W §8.3 明列 8 個、需與其對齊。
**See spec correction §A4**：FR-005 + SC-004 補上 pre-declare 紀律。

---

## Implementer-stage Expansion 候選（per 041 體例）

Plan 階段發現以下 4 處 spec 內描述需修正、屬「Implementer-stage Expansion」候選、**動手前回報 user 拾取確認、≤3 處上限**（per FR-014 / brainstorm doc edge case）：

| # | Item | spec.md location | 真實狀態 | 修法 |
|---|---|---|---|---|
| A1 | FR-013 `print!` 3 處 | spec.md FR-013 + US6 | 實際 1 處 print!（sys_user_api:40）；其他 println! 在 cfg(test) / startup CLI、不 bypass JSON | scope 縮為 1 處、其他登記 errata |
| A2 | FR-011 fn location | spec.md FR-011 提及 operation_log.rs | 實際在 model/admin/audit_log.rs:196 | 改 file 引用 |
| A3 | US7 / FR-014 hits | spec.md US7 / FR-014 | grep main code paths 0 hit | 改 out-of-scope errata、in-scope hits 0、登記 045 候選 |
| A4 | FR-005 8 metric instrument | spec.md FR-005 + SC-004 | backup wrapper 不存在 + 2 metric instrument 點待確認 | 改 pre-declare-and-defer-instrument 模式：6 立即 + 2 declare 0 series |

**處置**：A1/A2/A3/A4 為 spec 文字微調、scope 不擴張、屬「修文不修事」紀律；於 plan 結束、進 `/speckit-tasks` 前**回報 user 拾取確認**（per 041 體例）。若 user 同意 → 立即 update spec.md + plan.md mention；若 user 想分批 → 各 A 項分次處理。
