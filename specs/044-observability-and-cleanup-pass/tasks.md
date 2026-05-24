---
description: "Task list for 044 observability-and-cleanup-pass"
---

# Tasks: 044 observability-and-cleanup-pass

**Input**: Design documents from `/specs/044-observability-and-cleanup-pass/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 為 deployment + observability infrastructure + rust-api code instrumentation；無新業務純函式測試需求；acceptance 純由 [`contracts/verification-commands.md`](./contracts/verification-commands.md) C-V1~C-V23 涵蓋（dev stack 12 service + grep + curl + psql + grafana API）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) 紀律「無新純函式測試時由 acceptance 覆蓋、明示理由」。

**Organization**：依 spec.md 七個 user story（US1-US3 = P1 / US4-US7 = P2、US7 為 0 改動 errata）+ Setup / Foundational / Polish 分 phase；每 phase 內標 [P] 平行可跑 task。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**：rust-api workspace dep + outer deploy/ 目錄初始化 + secret file 體例對齊。

- [ ] T001 [P] 加 rust-api workspace metrics dep — `rust-api/Cargo.toml` workspace.dependencies 加 `metrics = "0.23"` 與 `metrics-exporter-prometheus = "0.15"`；`rust-api/server/initialize/Cargo.toml` 加 `metrics = { workspace = true }` + `metrics-exporter-prometheus = { workspace = true }`。對應 [research.md R-10](./research.md)、FR-005 dep requirement。
- [ ] T002 [P] 建 outer deploy/ 新子目錄結構 — `mkdir -p deploy/prometheus-rules deploy/grafana-provisioning/{datasources,dashboards,alerting} deploy/nginx`；加 deploy/secrets/ 規範 README 提示 grafana_admin_password / postgres_exporter_dsn 兩新 secret file。對應 [research.md R-8](./research.md)、FR-007/008。
- [ ] T003 [P] 建 secret file + .example 範本 — `deploy/secrets/grafana_admin_password.txt`（dev 用簡單字串、實檔 gitignored）+ `deploy/secrets/grafana_admin_password.txt.example`（git 追蹤、空白 / placeholder）；同樣為 `deploy/secrets/postgres_exporter_dsn.txt` + `.example`（DSN 格式 `postgresql://soybean:<pwd>@postgres:5432/soybean_admin_rust?sslmode=disable`）。對應 [research.md R-8](./research.md)、Constitution 架構約束 §Secret 注入 `_FILE` pattern。

**Checkpoint**：Setup 完成 — workspace dep 就位、outer 目錄 + secret 體例對齊既有 9 個 secret file pattern。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：rust-api tracing JSON formatter base + /metrics endpoint skeleton + docker-compose.observability.yml 7 service stub；所有 user story 都依賴這些 foundational 落地。

**⚠️ CRITICAL**：US1 / US2 / US3 全部 user story 須在 Phase 2 完成後才能 implement。

- [ ] T004 改 `rust-api/server/initialize/src/log_tracing_init.rs`：`fmt::layer()` → `fmt::json()` + `.with_current_span(false).with_span_list(false)` + 保留 LogTracer / ErrorLayer / EnvFilter。對應 FR-002、[quickstart Step 1.1](./quickstart.md)、[data-model.md §E2](./data-model.md)。
- [ ] T005 改 `rust-api/server/initialize/src/router_initialization.rs::apply_layers`：加 `tower-http::trace::TraceLayer::new_for_http()` + 自訂 `AppMakeSpan` `MakeSpan` impl（從 axum `RequestId` extension 抽 request_id 注入 tracing span attr `request_id` / `service="rust-api"` / `method` / `route`）；042 `REQUEST_ID_TASK_LOCAL` 並存不動。對應 FR-003、[quickstart Step 1.2](./quickstart.md)。
- [ ] T006 新檔 `rust-api/server/initialize/src/metrics_init.rs`：`PrometheusBuilder::new().install_recorder()` + 8 metric pre-declare（counter! / gauge!.set(0.0) / histogram!）+ expose `pub fn init() -> Router` 含 `/metrics` GET handler。對應 FR-005、[quickstart Step 2.2](./quickstart.md)、[data-model.md §E3](./data-model.md)。
- [ ] T007 在 `router_initialization.rs` mount `/metrics` router — `use crate::metrics_init;` 加 `metrics_router` 並 `.merge(metrics_router)` 進 main app。對應 FR-005、[quickstart Step 2.3](./quickstart.md)。
- [ ] T008 新檔 `docker-compose.observability.yml` skeleton — 7 service 全有 `profile: ["observability"]` + `networks: [internal, observability]` + image / volume / depends_on stub（後續 user story phase 補 service-specific config）。對應 FR-001/006/007/010、[data-model.md §E1+§E6](./data-model.md)。
- [ ] T009 改 `docker-compose.dev.yml`：top-level 加 `include: [docker-compose.observability.yml]`、加 `services: { loki: { profiles: [] }, ... }` 強制 dev default on（per Q3 拍板）；對 7 service 全部 override profile 為空（強制啟動）。對應 FR-010、[quickstart Step 3.3](./quickstart.md)。
- [ ] T010 改 `docker-compose.prod.yml`：加 `include: [docker-compose.observability.yml]`、保留 `profiles: ["observability"]` 不 override（prod 走 `--profile observability` 啟動）。對應 FR-010。

**Checkpoint**：Foundational 完成 — rust-api JSON formatter + TraceLayer 接好、/metrics endpoint 已 mount、7 obs service compose skeleton 就位。3 個 P1 user story（US1 / US2 / US3）可 parallel 開始實作；US4-US7 P2 也可 parallel（不依賴 observability stack）。

---

## Phase 3: User Story 1 — W-F12 log 三服務 + tracing JSON migration（Priority: P1）🎯 MVP

**Goal**：promtail + Loki 上線、rust-api log JSON 對齊 DESIGN-W §8.1 schema、所有 tokio::spawn callsite 含 `.instrument()` propagate request_id；operator 可從單一 grafana Loki 入口查所有 service log。

**Independent Test**：dev stack 12 service healthy 下、POST /api/role + 在 grafana UI 開 Loki query `{service="rust-api"} | json | request_id != ""`、看到該 request 的 log JSON ≥3 row + request_id 與 sys_operation_log row 對得起來。

### Implementation for User Story 1

- [ ] T011 [P] [US1] 新檔 `deploy/loki-config.yml`：single-binary mode + BoltDB shipper + filesystem chunk store + retention dev 7d / prod 30d。對應 FR-001、[data-model.md §E1](./data-model.md)、[quickstart Step 3.2](./quickstart.md)。
- [ ] T012 [P] [US1] 新檔 `deploy/promtail-config.yml`：clients 指向 `http://loki:3100/loki/api/v1/push`；scrape_configs 用 `docker_sd_configs` 掃 docker daemon log + relabel `__meta_docker_container_label_com_docker_compose_service` → label `service` + container 名。對應 FR-001、[brainstorm §5.1.1](../../docs/superpowers/044-feature-observability-and-cleanup-pass.md)。
- [ ] T013 [P] [US1] docker-compose.observability.yml 補 loki service detail — image `grafana/loki:latest` + volume `loki_data:/loki` + bind mount `./deploy/loki-config.yml:/etc/loki/local-config.yaml:ro` + command `-config.file=...`。對應 FR-001。
- [ ] T014 [P] [US1] docker-compose.observability.yml 補 promtail service detail — image `grafana/promtail:latest` + `/var/run/docker.sock:/var/run/docker.sock:ro` + bind mount config + `depends_on: [loki]`。對應 FR-001。
- [ ] T015 [US1] 改 `deploy/nginx/<前端 conf 檔>` access_log format → JSON（log_format directive 對齊 DESIGN-W §8.1 schema：含 timestamp/level/service="front-nginx"/request_id/msg + 可選 route/http_status/latency_ms）；既有 deploy/nginx/ 結構需 grep 確認檔名。對應 FR-002、[data-model.md §E2](./data-model.md)。
- [ ] T016 [US1] grep 並 enumerate `tokio::spawn` 9 個 callsite（[research.md R-7](./research.md)）+ 每個加 `.instrument(tracing::Span::current())` 包裹：`server/global/src/global.rs:163/176/265/274/331`、`server/initialize/src/audit_outbox_initialization.rs:53`、`server/initialize/src/casbin_sync_initialization.rs:34`、`server/core/src/web/operation_log.rs:143`。`spawn_blocking` 不加（CPU-bound、不需 span）。對應 FR-004。
- [ ] T017 [US1] C-V2 acceptance — dev stack restart rust-api 後 `$PC logs --tail=50 rust-api | grep '^{'` 採樣 ≥5 row JSON、每 row 含必要 5 欄（timestamp / level / service / request_id / msg）；per [contracts/verification-commands.md C-V2](./contracts/verification-commands.md)。對應 SC-002、FR-002。
- [ ] T018 [US1] C-V3 acceptance — POST /api/role + 抽 X-Request-ID response header + grep log JSON 該 request_id + psql 查 sys_operation_log 同 request_id ≥2 row；per [contracts/verification-commands.md C-V3](./contracts/verification-commands.md)。對應 SC-003、FR-003。
- [ ] T019 [US1] C-V10 acceptance — grep ratio `tokio::spawn` async vs `.instrument()` callsite ≈ 1:1；per [contracts/verification-commands.md C-V10](./contracts/verification-commands.md)。對應 SC-013、FR-004。

**Checkpoint**：US1 完成 — log JSON 對齊 + grafana Loki 可查 + request_id 跨 log + audit row 串聯。MVP-worthy（log infra 對 incident response 已可獨立 deliver、metrics + dashboards 未做也 OK）。

---

## Phase 4: User Story 2 — W-F13 metrics + 8 業務 metric instrument（Priority: P1）

**Goal**：prometheus + 3 exporter 上線、rust-api `/metrics` endpoint 暴 8 業務 metric（6 active + 2 declared 0 series）、operator 可從 prometheus + grafana 查 service health 與業務 throughput。

**Independent Test**：dev stack healthy 下 curl rust-api `/metrics` 200 + 8 metric TYPE/HELP 全暴；prometheus UI Targets 顯示 ≥7 個 scrape job 全 UP；POST /api/role + 2s 後 `audit_log_writes_total{operation="Create",entity_type="sys_role"}` counter delta ≥2。

### Implementation for User Story 2

- [ ] T020 [P] [US2] 補完 `server/initialize/src/metrics_init.rs` 內 8 metric 完整 declare：`counter!("audit_log_writes_total"); counter!("casbin_enforcement_total"); counter!("casbin_policy_cache_invalidate_total"); counter!("cleanup_job_rows_deleted_total"); counter!("backup_completed_total"); gauge!("outbox_pending_events").set(0.0); gauge!("sys_tokens_active").set(0.0); histogram!("http_request_duration_seconds");`。對應 FR-005、[data-model.md §E3](./data-model.md)。
- [ ] T021 [P] [US2] `audit_log_writes_total` instrument — 在 `server/model/src/admin/audit_log.rs::write_in_txn`（line 70）末尾 Result Ok branch 加 `counter!("audit_log_writes_total", "operation" => operation.as_str(), "entity_type" => entity_type.to_string()).increment(1);`。對應 FR-005、[data-model.md §E3](./data-model.md)。
- [ ] T022 [P] [US2] `casbin_enforcement_total` instrument — grep `\.enforce(` 找 axum casbin middleware enforce wrapper（implementer 階段定 callsite）+ 加 `counter!("casbin_enforcement_total", "result" => if allowed {"allow"} else {"deny"}).increment(1);`。對應 FR-005、[research.md R-2](./research.md)。
- [ ] T023 [P] [US2] `casbin_policy_cache_invalidate_total` instrument — `server/global/src/casbin_notify.rs::notify_casbin_changed`（line 23）publish 後加 `counter!("casbin_policy_cache_invalidate_total").increment(1);`。對應 FR-005。
- [ ] T024 [P] [US2] `outbox_pending_events` instrument — `server/service/src/admin/sys_audit_outbox_drainer.rs` 主迴圈 per iteration（fetch_pending 後）加 `gauge!("outbox_pending_events").set(pending_count as f64);`。對應 FR-005。
- [ ] T025 [P] [US2] `cleanup_job_rows_deleted_total` instrument — `server/cleanup/src/main.rs` 各 delete 後加 `counter!("cleanup_job_rows_deleted_total", "table_name" => "sys_xxx").increment(deleted_count as u64);`；同 binary 需共用 metric registry 或自暴 `/metrics`（plan 階段拍板：cleanup 用 sidecar /metrics port、不與 main rust-api 共用 registry）。對應 FR-005、[data-model.md §E3](./data-model.md)。
- [ ] T026 [P] [US2] `http_request_duration_seconds` integration — tower-http TraceLayer + `metrics` macro 整合（T005 已加 TraceLayer、本 task 補 metric collection 部分；可能用 `tower-http::metrics::InFlightRequestsLayer` 或自製 layer）。對應 FR-005。
- [ ] T027 [P] [US2] `sys_tokens_active` declare 0 series — `metrics_init.rs` 已 gauge!.set(0.0)（T020）；本 task 留 comment 標明「callsite TBD implementer 階段 grep token store；可能 spawn periodic task query `SELECT COUNT(*) FROM sys_tokens WHERE expires_at > NOW()` + gauge.set」、不 instrument（per [research.md R-2 / R-11](./research.md)）。對應 FR-005 pre-declare 紀律。
- [ ] T028 [P] [US2] `backup_completed_total` declare 0 series 永久 — `metrics_init.rs` 已 counter!（T020）；本 task 留 comment 標明「W-F15/16 真實 backup job 才 instrument」、不動。對應 FR-005、[research.md R-11](./research.md)。
- [ ] T029 [P] [US2] 新檔 `deploy/prometheus.yml`：scrape_configs 含 7 scrape job（rust-api:13090/metrics、postgres_exporter:9187、redis_exporter:9121、nginx-exporter:9113、promtail:9080、loki:3100/metrics、prometheus self）；scrape_interval 15s；retention dev 7d / prod 30d via command-line args。對應 FR-006、[quickstart Step 3.2](./quickstart.md)。
- [ ] T030 [P] [US2] docker-compose.observability.yml 補 prometheus service detail — image `prom/prometheus:latest` + volume `prometheus_data:/prometheus` + bind mount `./deploy/prometheus.yml:/etc/prometheus/prometheus.yml:ro` + bind mount `./deploy/prometheus-rules:/etc/prometheus/rules:ro` + command `--config.file=... --storage.tsdb.retention.time=7d`（dev override）。對應 FR-006。
- [ ] T031 [P] [US2] docker-compose.observability.yml 補 3 exporter sidecars：postgres_exporter（`DATA_SOURCE_NAME_FILE=/run/secrets/postgres_exporter_dsn` + secret mount）、redis_exporter（`REDIS_ADDR=redis://redis:6379` + `REDIS_PASSWORD_FILE=/run/secrets/redis_password` 復用既有 secret）、nginx-exporter（`-nginx.scrape-uri=http://front-nginx:8081/stub_status`）。對應 FR-007。
- [ ] T032 [P] [US2] 新檔 `deploy/nginx/stub_status.conf`：location `/stub_status` + `stub_status; allow 127.0.0.1; allow internal_network_cidr; deny all;`（internal-only、不暴 host）。對應 FR-007、[research.md R-9](./research.md)。
- [ ] T033 [US2] front-nginx 既有 server block 加 `include /etc/nginx/conf.d/stub_status.conf;`（或對應 mount path）；確認 internal port 8081 在 front-nginx container 暴露（不 publish 到 host）。對應 FR-007。
- [ ] T034 [US2] C-V4 acceptance — curl rust-api `/metrics` 200 + 8 metric 全暴；per [contracts/verification-commands.md C-V4](./contracts/verification-commands.md)。對應 SC-004、FR-005。
- [ ] T035 [US2] C-V5 acceptance — POST /api/role + 2s + curl /metrics 看 `audit_log_writes_total{operation="Create",entity_type="sys_role"}` 較 baseline +2；per [contracts/verification-commands.md C-V5](./contracts/verification-commands.md)。對應 SC-005、FR-005。
- [ ] T036 [US2] C-V13 acceptance — 6 active metric 各觸發 ≥1 操作後 prometheus query 看到值上升（audit_log_writes_total / casbin_enforcement_total / casbin_policy_cache_invalidate_total / cleanup_job_rows_deleted_total / outbox_pending_events / http_request_duration_seconds）；per [contracts/verification-commands.md C-V13](./contracts/verification-commands.md)。對應 FR-005。
- [ ] T037 [US2] C-V14 acceptance — `sys_tokens_active` + `backup_completed_total` 在 /metrics 暴 series 但 value=0；per [contracts/verification-commands.md C-V14](./contracts/verification-commands.md)。對應 FR-005 pre-declare 紀律。
- [ ] T038 [US2] C-V19 acceptance — nginx-exporter scrape stub_status 200 + metric `nginx_connections_active` 暴；per [contracts/verification-commands.md C-V19](./contracts/verification-commands.md)。對應 FR-007。

**Checkpoint**：US2 完成 — `/metrics` endpoint + 3 exporter scrape + 6 active metric instrument 完成 + 2 pre-declared 0 series。dashboards / alerts 還沒做、但 prometheus 已可查 metric。

---

## Phase 5: User Story 3 — W-F14 grafana dashboards + alerts（Priority: P1）

**Goal**：grafana provisioning（datasource + 4-6 dashboard + ≥6 alert rule、走 built-in unified alerting per Q1）就位、operator 從預設 dashboard 看 12 service health + 8 業務 KPI overview + 異常時 alert 觸發。

**Independent Test**：dev stack healthy 下開 grafana UI :13000 + 用 provisioned admin password 登入 + Loki + Prometheus datasource health pass + 4-6 dashboard 自動 provisioned + ≥6 alert rule load。

### Implementation for User Story 3

- [ ] T039 [P] [US3] 新檔 `deploy/grafana-provisioning/datasources/loki.yml`：apiVersion 1 + Loki datasource at `http://loki:3100`、access proxy。對應 FR-008、[data-model.md §E4](./data-model.md)。
- [ ] T040 [P] [US3] 新檔 `deploy/grafana-provisioning/datasources/prometheus.yml`：apiVersion 1 + Prometheus datasource at `http://prometheus:9090`、access proxy、isDefault true。對應 FR-008。
- [ ] T041 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/dashboards.yml` manifest：provisioning provider 指向 `/etc/grafana/provisioning/dashboards/` JSON files。對應 FR-008。
- [ ] T042 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/master-overview.json`：1 主 dashboard、12 service health row + HTTP throughput overview + audit pipeline status + log volume /min（per [data-model.md §E4](./data-model.md)）。對應 FR-008、Q2 拍板。
- [ ] T043 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/rust-api-detail.json`：rust-api drill-down dashboard、HTTP req/s histogram + 5xx rate + tracing log query panel + 8 業務 metric multi-panel。對應 FR-008。
- [ ] T044 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/postgres-detail.json`：postgres drill-down dashboard、connection saturation + db size growth + query duration + cache hit ratio（用 postgres_exporter metric）。對應 FR-008。
- [ ] T045 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/redis-detail.json`：redis drill-down dashboard、memory usage + keyspace size + ops/s + connected_clients（用 redis_exporter metric）。對應 FR-008。
- [ ] T046 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/audit-pipeline-detail.json`：audit drill-down dashboard、audit_log_writes_total rate + outbox_pending_events + drainer latency + casbin_policy_cache_invalidate freq。對應 FR-008、[data-model.md §E4](./data-model.md)。
- [ ] T047 [P] [US3] 新檔 `deploy/grafana-provisioning/dashboards/observability-self.json`：observability self-monitoring dashboard、loki ingestion rate + prometheus targets up/down + grafana query latency + log retention disk usage。對應 FR-008。
- [ ] T048 [P] [US3] 新檔 `deploy/grafana-provisioning/alerting/alert-rules.yml`：grafana built-in unified alerting format、≥6 alert rule（RustApi5xxRate / AuditPipelineStalled / OutboxQueueBacklog / PostgresConnectionSaturation / RedisMemoryHigh / LogVolumeDrop、per [data-model.md §E5](./data-model.md)）。對應 FR-009、Q1 拍板。
- [ ] T049 [P] [US3] docker-compose.observability.yml 補 grafana service detail — image `grafana/grafana:latest` + volume `grafana_data:/var/lib/grafana` + bind mount `./deploy/grafana-provisioning:/etc/grafana/provisioning:ro` + `GF_SECURITY_ADMIN_PASSWORD_FILE=/run/secrets/grafana_admin_password` + secret + `depends_on: [loki, prometheus]` + ports `13000:3000`（dev 暴 host）。對應 FR-008。
- [ ] T050 [US3] C-V6 acceptance — curl grafana API + auth、看 datasource 2 個（Loki + Prometheus）health pass + dashboard count 4-6 + alert rule count ≥6；per [contracts/verification-commands.md C-V6](./contracts/verification-commands.md)。對應 SC-006、FR-008/009。
- [ ] T051 [US3] C-V15 acceptance — grafana master overview dashboard 開啟 + 12 service health panel 對齊 C-V1 results；per [contracts/verification-commands.md C-V15](./contracts/verification-commands.md)。對應 FR-008。
- [ ] T052 [US3] C-V16 acceptance — trigger RustApi5xxRate alert（手動 trigger 5xx 數次）+ grafana alert UI 紅標；per [contracts/verification-commands.md C-V16](./contracts/verification-commands.md)。對應 FR-009。

**Checkpoint**：US3 完成 — grafana datasource + dashboards + alert 全 provisioned；operator 開 grafana UI 即可查全 stack。Phase W deploy P5 主軸完整 deliver。

---

## Phase 6: User Story 4 — 042-N2 url parsing hybrid rule（Priority: P2）

**Goal**：audit forensic reader 對 `/systemManage/<verb>/<id>` path 拿到正確 entity_id（取 id 不取 verb）。

**Independent Test**：POST `/api/systemManage/deleteMenu/<id>` 後 query `SELECT entity_id FROM sys_operation_log WHERE url LIKE '%deleteMenu%' ...`、命中 `<id>` 數值字串而非 `deleteMenu`；同時 POST `/api/role/<id>` 後 entity_id 仍 = `<id>`（不退化）。

### Implementation for User Story 4

- [ ] T053 [US4] 改 `rust-api/server/model/src/admin/audit_log.rs:196` `fn extract_entity_id_from_url`：hybrid rule —— `parts = url.split('/').collect::<Vec<&str>>()`；`if parts.get(1) == Some(&"systemManage") { parts.get(3) } else { parts.get(2) }`；保持既有 split-based 樣式。對應 FR-011、[research.md R-4](./research.md)、[quickstart Step 4.1](./quickstart.md)。
- [ ] T054 [US4] C-V7 acceptance — POST `/api/role/<id>` (native) + POST `/api/systemManage/deleteMenu/<id>` (systemManage) 各觸發 audit row + query entity_id；per [contracts/verification-commands.md C-V7](./contracts/verification-commands.md)。對應 SC-007、FR-011。

**Checkpoint**：US4 完成 — 042-N2 結案。

---

## Phase 7: User Story 5 — 042-N6 placeholder fix（Priority: P2）

**Goal**：audit row module_name + description 兩欄含實值（從 entity_type / HTTP method+url 推導）而非 "TODO" placeholder。

**Independent Test**：POST /api/role 後 query `SELECT module_name, description FROM sys_operation_log WHERE created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds' LIMIT 2`、`module_name='sys_role'` / `description='HTTP POST /api/role'`、無 TODO 殘留。

### Implementation for User Story 5

- [ ] T055 [US5] 改 `rust-api/server/core/src/web/operation_log.rs:121-126` `OperationLogContext` 構造處：`module_name` 從 url 推導 entity_type（hybrid rule 同 US4 / FR-011；或 `"http_event"` fallback）；`description: format!("HTTP {} {}", method, uri)` 對齊 042 既有 fallback 文字。對應 FR-012、[research.md R-5](./research.md)、[quickstart Step 4.2](./quickstart.md)。
- [ ] T056 [US5] C-V8 acceptance — POST /api/role + query module_name + description 為實值、無 TODO；per [contracts/verification-commands.md C-V8](./contracts/verification-commands.md)。對應 SC-008、FR-012。

**Checkpoint**：US5 完成 — 042-N6 結案。

---

## Phase 8: User Story 6 — F3-N4 print! 1 處清理（Priority: P2）

**Goal**：rust-api stdout 不再有 `print!("user is {:#?}", user)` 殘留（避免 W-F12 落地後 bypass JSON formatter 產 non-JSON garbage line）。

**Independent Test**：dev stack 啟動 rust-api + 觸發 sys_user_api callsite（如 POST /api/user）後 `docker compose logs rust-api | grep -ci "user is"` 0 hit。

### Implementation for User Story 6

- [ ] T057 [US6] 改 `rust-api/server/api/src/admin/sys_user_api.rs:40` — 將 `print!("user is {:#?}", user);` 改為 `tracing::debug!(?user, "user info");` 或直接刪除。其他 `println!` callsite 在 `#[cfg(test)]` 或 startup CLI 範圍、不 bypass JSON formatter、合理保留（per [research.md R-3](./research.md)）。對應 FR-013、[quickstart Step 4.3](./quickstart.md)。
- [ ] T058 [US6] C-V9 acceptance — 觸發 sys_user_api callsite + `$PC logs --tail=200 rust-api | grep -ci "user is"` 0 hit；per [contracts/verification-commands.md C-V9](./contracts/verification-commands.md)。對應 SC-009、FR-013。

**Checkpoint**：US6 完成 — F3-N4 1 處 print! 清掉、其他 println! 在 test/CLI 範圍合理保留。

---

## Phase 9: User Story 7 — 041-N1 status enum errata（Priority: P2、0 code 改動）

**Goal**：041-N1 backlog 條目 grep verify 0 hit、登記 errata 結案、無 code 改動。

**Independent Test**：grep `rust-api/server/` + `base-web/src/` 的 status enum 混雜 pattern、0 hit；INTEGRATION-CHECKLIST 041-N1 row 移除 + 加 errata 字句。

### Implementation for User Story 7

- [ ] T059 [US7] C-V11 acceptance — grep verify 與 [research.md R-6](./research.md) 0 hit 結論一致；per [contracts/verification-commands.md C-V11](./contracts/verification-commands.md)。對應 SC-010、FR-014。

**Checkpoint**：US7 完成 — 041-N1 errata 結案、無 code 改動。實際 INTEGRATION-CHECKLIST 移除 row 在 Phase 10。

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**：INTEGRATION-CHECKLIST cleanup（FR-017）+ acceptance 全綠 verify + 多段式 commit + merge + SHA backfill。

- [ ] T060 改 `docs/INTEGRATION-CHECKLIST.md`：衍生 follow-up table 移除 4 row（042-N2 / 042-N6 / F3-N4 / 041-N1）。對應 FR-017、SC-012、[quickstart Step 5.1](./quickstart.md)。
- [ ] T061 改 `docs/INTEGRATION-CHECKLIST.md`：規劃中、未排程 table 移除 W-F12/13/14 row（合進 044 結案）。對應 FR-017、SC-012、[quickstart Step 5.2](./quickstart.md)。
- [ ] T062 改 `docs/INTEGRATION-CHECKLIST.md`：已完成里程碑加 044 entry（按 042/043 體例：日期 + outer/merge SHA placeholder + spec link + 一段描述含 7 US + 4 spec corrections + C-V acceptance + Phase W deploy P5 close-out）。對應 FR-017、SC-012、[quickstart Step 5.3](./quickstart.md)。
- [ ] T063 改 `docs/INTEGRATION-CHECKLIST.md`：Current Focus 「下一步」改指向「P3 F-facade-atomicity-pass (F3-N1/N2/N3 + 035-N1) 或 base-web TS id 型別債 cleanup sprint」（per spec FR-017 + plan §10）；加 041-N1 errata 字句到 INTEGRATION-CHECKLIST 045 候選 backlog 區「041-N1 grep 0 hit 結案、後續 features 若撞 status 混雜再列 spec」。對應 FR-017、SC-010。
- [ ] T064 C-V12 acceptance — `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up 4 row + 規劃中 3 row 全移、044 entry ≥1 hit；per [contracts/verification-commands.md C-V12](./contracts/verification-commands.md)。對應 SC-012、FR-017。
- [ ] T065 [P] dev stack restart + 12 service healthy verify — `$PC down && $PC up -d --wait` + `$PC ps` 全 healthy；per [contracts/verification-commands.md C-V1](./contracts/verification-commands.md)。對應 SC-001。
- [ ] T066 [P] 完整 C-V1~C-V23 跑 acceptance — 依 [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、FAIL 則 debug + 修 + 重跑、全 PASS 才進下一 task。對應 SC-001~013。
- [ ] T067 rust-api worktree 多段 commit — 進 `rust-api/` worktree、依 [quickstart Step 6.1](./quickstart.md) 拆 8-12 個 commit（每個 US topic 1-2 個 commit、各 metric instrument 1 commit 等）；push origin rev1-admin-rust-api 須 user 同意。對應 FR-015/016 verify + CLAUDE.md §4.1。
- [ ] T068 outer feature branch commit — 依 [quickstart Step 6.2](./quickstart.md) 拆多 commit（compose + deploy/ + grafana + nginx + SHA pins + INTEGRATION-CHECKLIST cleanup）；push origin 044-observability-and-cleanup-pass 須 user 同意。對應 CLAUDE.md §4.1。
- [ ] T069 git merge 044 → rev1-admin-root — **user 同意才執行**：`git checkout rev1-admin-root && git merge --no-ff 044-observability-and-cleanup-pass -m "Merge feature 044-observability-and-cleanup-pass"`；merge 後 push origin rev1-admin-root 須 user 再次同意。
- [ ] T070 backfill outer/merge/rust-api SHA + push — merge 後拿 outer SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 044 entry 的 `<SHA>` placeholders、small chore commit（per 041/042/043 體例）+ push 須 user 同意。

**Checkpoint**：044 整 feature 落地、acceptance 全綠、backlog 已 cleanup、merge 回 default、Phase W deploy P5 close-out。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001-T003)
   │
Phase 2 Foundational (T004-T010、blocking all US)
   │
   ├─→ US1 W-F12 log (T011-T019、可平行 US2/US3/US4-US7)
   │
   ├─→ US2 W-F13 metrics (T020-T038、可平行 US1/US3/US4-US7)
   │
   ├─→ US3 W-F14 dashboards+alerts (T039-T052、可平行 US1/US2/US4-US7)
   │
   ├─→ US4 042-N2 url parsing (T053-T054、可平行 US1/US2/US3/US5/US6/US7)
   │
   ├─→ US5 042-N6 placeholder fix (T055-T056、可平行 US1/US2/US3/US4/US6/US7)
   │
   ├─→ US6 F3-N4 print! 清理 (T057-T058、可平行 US1/US2/US3/US4/US5/US7)
   │
   └─→ US7 041-N1 errata (T059、純 verify、可平行 全部)
                                                  │
Phase 10 Polish (T060-T070、collect + verify + commit + merge + backfill) ──┘
```

7 個 user story 完全獨立可任意順序 / 平行；Polish phase 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001-T003 | — (Setup parallel) |
| T004-T010 | T001 (workspace dep)、T002-T003 (deploy/ + secrets) |
| T011-T019 (US1) | T004 + T005 + T008-T010 |
| T020-T038 (US2) | T006 + T007 + T008-T010 + T032/T033 (stub_status before nginx-exporter) |
| T039-T052 (US3) | T013 + T014 (loki) + T030 (prometheus) + T020-T031 (metric infra) — US3 依賴 US1 + US2 部分 service 就位才能 provisioning 有 data |
| T053-T054 (US4) | T001-T010 (only Foundational) |
| T055-T056 (US5) | T001-T010 |
| T057-T058 (US6) | T001-T010 + T004 (JSON formatter for verify) |
| T059 (US7) | T001-T003 only |
| T060-T064 (Polish docs) | T011-T059 全完 |
| T065-T066 (Polish acceptance) | T060-T064 |
| T067-T070 (Polish commit/merge/backfill) | T065-T066 全 PASS（**user 同意 push / merge**）|

---

## Implementation Strategy（per quickstart Step 1-6 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 Setup**（T001-T003）：3 個獨立 [P] task 全並行
→ 約 5-10 分鐘。

**Batch 2 — Phase 2 Foundational**（T004-T010）：7 task 內部部分依賴：
- T004/T005 串行（同檔 router_initialization.rs）
- T006/T007 串行（router mount /metrics depends on metrics_init.rs）
- T008/T009/T010 串行（同 compose chain）
→ 約 30 分鐘。

**Batch 3 — Phase 3-9 並行**：7 個 user story 全部 subagent parallel：
- US1 implementer subagent — T011-T019（log infra + spawn instrument）
- US2 implementer subagent — T020-T038（metrics + 6 instrument）
- US3 implementer subagent — T039-T052（grafana provisioning）
- US4/US5/US6/US7 small touch subagent (合併 1 個) — T053-T059

→ 約 2-3 個 session pass、subagent 中 1 個 fresh implementer per US。每 US 完成做 spec compliance review + code quality review（per CLAUDE.md §3 紀律）。

**Batch 4 — Phase 10 Polish**（T060-T070）：
- T060-T064 串行（INTEGRATION-CHECKLIST 4 改動）
- T065-T066 並行（dev stack verify + C-V acceptance）
- T067-T070 串行（commit + merge + backfill、user 同意關卡）

→ 約 1-2 hr、含 user 同意等待。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-1（US1 only）**：完 Phase 1 + 2 + 3 + 部分 Polish。**僅交 log infra**（promtail + Loki + rust JSON tracing）、無 metrics / dashboards / cleanup。
- **MVP-2（US1+US2）**：+ Phase 4 metrics。可獨立 deliver log + metrics、未 dashboard 也可用 prometheus 直查 metric。
- **Full feature（US1-US7 + Polish）**：依 Batch 1-4 完整跑（推薦、user 拍板 A2+A 路線、Phase W deploy P5 一次 close-out）。

User 偏好（per project memory v2）：Full feature 一次到位、Phase W deploy P5 結案。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 7 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~017 + SC-001~013）→ ② code quality（spec md 內容品質、rust code 品質、compose / deploy/ config 正確、Constitution 紀律）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、C-V 命令 actual output、commit SHA）。

**Phase 2 Foundational** 必須完成才能啟動 US-phase subagent。Phase 10 Polish 必須在 US1-US7 全部 PASS 後執行（含 user 同意關卡）。

---

## Summary

- **Total tasks**: 70
- **By phase**: Setup 3 / Foundational 7 / US1 9 / US2 19 / US3 14 / US4 2 / US5 2 / US6 2 / US7 1 / Polish 11
- **By user story**: US1 = 9 / US2 = 19 / US3 = 14 / US4 = 2 / US5 = 2 / US6 = 2 / US7 = 1（共 49 user story tasks）+ Setup 3 + Foundational 7 + Polish 11
- **Parallel opportunities**：
  - Phase 1 Setup T001/T002/T003 全並行
  - Phase 3-9 7 個 user story 可全部 subagent parallel
  - 各 US 內部 [P] tasks 同 subagent 內並行（T011-T014 / T020-T032 / T039-T049 等）
  - Phase 10 T065/T066 並行
- **Independent test criteria**: 每個 US 對應 C-V1~C-V23 中 1-3 條（per spec.md SC-001~013）
- **Suggested MVP scope**: US1 W-F12 log only（P1 MVP per spec-kit framework）；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 70 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
