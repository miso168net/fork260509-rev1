# Data Model: 044 observability-and-cleanup-pass

**Phase**：1（Design & Contracts）
**日期**：2026-05-24

044 為 deployment + observability infrastructure feature、**無 application data entity**；本檔以「Infrastructure / Metric / Log Schema design」取代傳統 entity 章節，per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. 服務拓樸（dev default on 12 service）

```
既有 5 service（dev / prod 共通、不動）：
  postgres / redis / rust-api / front-nginx / base-web

新加 7 observability service（profile: ["observability"]、dev 預設啟、prod --profile observability）：
  loki / promtail / prometheus / grafana
  postgres_exporter / redis_exporter / nginx-exporter

Networks:
  internal (既有)     —— 5 + 3 exporters + nginx-exporter scrape target front-nginx
  observability (新)  —— 7 observability service 隔離
  loki + prometheus + grafana 同跨 internal + observability（pull metric / log）
```

詳見 [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md §8`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)。

### Service responsibility 速查

| Service | Role | Image |
|---|---|---|
| `loki` | log 聚集 + chunk store + query API | grafana/loki:latest |
| `promtail` | docker daemon log scrape → loki push | grafana/promtail:latest |
| `prometheus` | metrics TSDB + scrape orchestrator + alert rule eval（grafana 接 alertmanager 取代、但 alert rule **在 grafana built-in 內配**、prometheus 端不需 alertmanager） | prom/prometheus:latest |
| `grafana` | datasource provisioning + dashboard render + **built-in unified alerting** (per Clarifications Q1) | grafana/grafana:latest |
| `postgres_exporter` | postgres metrics（pg_stat_* / connection / db size）→ prometheus scrape | prometheuscommunity/postgres-exporter:latest |
| `redis_exporter` | redis metrics（memory / keyspace / connections）→ prometheus scrape | oliver006/redis_exporter:latest |
| `nginx-exporter` | nginx stub_status → prometheus scrape | nginx/nginx-prometheus-exporter:latest |

---

## E2. JSON log schema（DESIGN-W §8.1 對齊）

每 row（per `tracing` event）必含：

| Field | Type | Source | Note |
|---|---|---|---|
| `timestamp` | ISO8601 string | tracing fmt::json() 自動 | UTC |
| `level` | string | tracing event level | INFO / WARN / ERROR / DEBUG / TRACE |
| `service` | string | tower-http MakeSpan + 自訂常數 | `"rust-api"` / `"front-nginx"` / `"base-web"` |
| `request_id` | string | tower-http MakeSpan 從 axum RequestId extension 抽（per Q4 Option 2、與 042 REQUEST_ID_TASK_LOCAL 同值） | UUID v4 或 nginx X-Request-ID |
| `msg` | string | tracing event message | the actual log text |

可選欄：

| Field | Type | Note |
|---|---|---|
| `actor_user_id` | string | 已認證 user JWT sub claim（從 axum extensions extract） |
| `route` | string | HTTP path（如 `/api/role`）|
| `http_status` | integer | response status code |
| `latency_ms` | integer | request 完成耗時 |
| `error_kind` | string | error 分類（business / 5xx / panic 等） |

### nginx access log JSON schema

front-nginx `log_format` 改 JSON、欄位對齊上表必要 5 欄；額外可選欄 `upstream_response_time`, `bytes_sent`, `http_user_agent`。

---

## E3. 8 業務 metric label spec（per DESIGN-W §8.3 + plan research.md R-2/R-11）

| Metric | Type | Labels | Active/Declared | Instrument 落點 |
|---|---|---|---|---|
| `http_request_duration_seconds` | histogram | `service`, `route`, `status` | ✅ Active | tower-http TraceLayer auto-collected（內 `metrics_handler` 整合）|
| `audit_log_writes_total` | counter | `operation`, `entity_type` | ✅ Active | `rust-api/server/model/src/admin/audit_log.rs::write_in_txn` 末尾 Result Ok branch |
| `casbin_enforcement_total` | counter | `result` (allow\|deny) | ✅ Active（**callsite TBD implementer**）| axum casbin middleware enforce wrapper（implementer 階段 grep 確認、預期在 `core/src/web/` 內）|
| `casbin_policy_cache_invalidate_total` | counter | — | ✅ Active | `rust-api/server/global/src/casbin_notify.rs::notify_casbin_changed` publish 後 |
| `outbox_pending_events` | gauge | — | ✅ Active | `rust-api/server/service/src/admin/sys_audit_outbox_drainer.rs` 主迴圈 per iteration set |
| `sys_tokens_active` | gauge | — | ⚠️ **Declared 0 series**（callsite TBD） | implementer 階段 grep token store；可能 query `SELECT COUNT(*) FROM sys_tokens WHERE expires_at > NOW()` 並 poll N 秒 |
| `cleanup_job_rows_deleted_total` | counter | `table_name` | ✅ Active | `rust-api/server/cleanup/src/main.rs` delete 後 increment（需共用 metric registry 或 cleanup binary 自暴 sidecar `/metrics`）|
| `backup_completed_total` | counter | `type` (base\|wal) | ⚠️ **Declared 0 series**（W-F15/16 後 instrument）| 預期 `backup-job` cron 內 increment、本 spec 不實作 backup job |

**pre-declare 紀律**（per FR-005）：8 metric 全在 `server/initialize/src/metrics_init.rs` 用 `metrics::counter!()` / `metrics::gauge!()` / `metrics::histogram!()` 預先註冊（即使 0 increment）；prometheus scrape 看到 series、grafana dashboard / alerting rule 不會 "No data" error。

---

## E4. Grafana dashboards 結構（per Clarifications Q2）

**設計風格**：1 master overview + drill-down per component（4-6 dashboard 總量、admin-heavy 場景新手友善）

| Dashboard | Path | Panels |
|---|---|---|
| **master-overview.json** | grafana root | 12 service health（up/down indicator）、HTTP throughput overview、audit pipeline status、log volume / min |
| **rust-api-detail.json** | rust-api drill-down | HTTP req/s + duration histogram、5xx rate、tracing log query panel、8 業務 metric 多 panel |
| **postgres-detail.json** | postgres drill-down | connection saturation、db size growth、query duration、cache hit ratio |
| **redis-detail.json** | redis drill-down | memory usage、keyspace size、ops/s、connected_clients |
| **audit-pipeline-detail.json** | audit drill-down | audit_log_writes_total rate、outbox_pending_events、drainer latency、Casbin policy invalidate freq |
| **observability-self.json** | observability stack drill-down | loki ingestion rate、prometheus targets up/down、grafana query latency、log retention disk usage |

**Provisioning**：`deploy/grafana-provisioning/dashboards/dashboards.yml`（manifest）+ 6 dashboard JSON files。

---

## E5. Alerting rules（per Clarifications Q1 grafana built-in、FR-009 ≥6 條）

| Rule | Source | Threshold | Severity |
|---|---|---|---|
| `RustApi5xxRate` | prometheus `rate(http_request_duration_seconds_count{service="rust-api",status=~"5.."}[5m])` | > 1%/min | critical |
| `AuditPipelineStalled` | `increase(audit_log_writes_total[5m])` | 0（5 分鐘無增量 + 有 traffic）| critical |
| `OutboxQueueBacklog` | `outbox_pending_events` | > 1000 | warning |
| `PostgresConnectionSaturation` | `pg_stat_database_numbackends / pg_settings_max_connections` | > 80% | warning |
| `RedisMemoryHigh` | `redis_memory_used_bytes / redis_memory_max_bytes` | > 80% | warning |
| `LogVolumeDrop` | `rate(loki_distributor_lines_received_total[5m])` | < 50% baseline | warning |

**Provisioning**：`deploy/grafana-provisioning/alerting/*.yml`（grafana built-in alerting yaml 格式）。

**Notification policy**：
- dev：grafana UI 紅標即可（無 webhook / email contact point）
- prod：webhook / email 待 W-F6b acme.sh + 真實 domain 後 + 安全 sprint 配 contact point

---

## E6. Docker compose 結構

### docker-compose.observability.yml（新檔）

7 service 全在 `profile: ["observability"]` 下；7 service 細節 spec 見 [DESIGN-W §8](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)。

### docker-compose.dev.yml 加 include

```yaml
# Q3 拍板 dev default on：include observability profile
include:
  - docker-compose.observability.yml

services:
  # 強制 enable observability profile
  loki: { profiles: [] }
  promtail: { profiles: [] }
  prometheus: { profiles: [] }
  grafana: { profiles: [] }
  postgres_exporter: { profiles: [] }
  redis_exporter: { profiles: [] }
  nginx-exporter: { profiles: [] }
```

或對等的 `--profile observability` flag 包進 dev shortcut。

### docker-compose.prod.yml

```yaml
include:
  - docker-compose.observability.yml
# prod 需 --profile observability 啟用（沿用 DESIGN-W §8 既有 profile-gated 設計）
```

---

## E7. P2 4 項 cleanup hit table（per plan research.md）

| US | Item | File:Line | Patch |
|---|---|---|---|
| US4 | 042-N2 url parsing | `server/model/src/admin/audit_log.rs:196` (fn `extract_entity_id_from_url`) | hybrid rule: get(1)==systemManage → get(3)；else get(2) |
| US5 | 042-N6 placeholder | `server/core/src/web/operation_log.rs:125-126` (OperationLogContext init) | `module_name` 從 url 推導 entity_type；`description` = `format!("HTTP {} {}", method, url)` |
| US6 | F3-N4 print! | `server/api/src/admin/sys_user_api.rs:40` | `print!("user is {:#?}", user);` → `tracing::debug!(?user, "user info")` 或刪除 |
| US7 | 041-N1 status enum | （grep main paths 0 hit） | **out-of-scope errata**、本 spec 0 改動 |

---

## E8. Out-of-scope（044 不做、但相關）

- W-F6b acme.sh real cert acquisition（grafana prod TLS / webhook contact point 依賴此）
- W-F15/16 backup-job（`backup_completed_total` metric 真實 instrument）
- W-F12+ Loki cluster mode（044 用 single-binary mode）
- prometheus alertmanager（Q1 拍板 grafana built-in、本 spec 不引入）
- base-web log JSON migration（044 base-web 0 改動、Vue 3 既有 console.log 不動）
- 042-N5 dev compose port single-bind（屬 dev compose 配置 feature）
