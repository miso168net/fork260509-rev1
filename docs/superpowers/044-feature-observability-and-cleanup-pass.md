# 044 observability-and-cleanup-pass — brainstorm 設計

**日期**：2026-05-24
**Feature**：`044-observability-and-cleanup-pass`
**來源**：[`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md §8`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md)（W-F12/13/14 三件套 Phase W deploy P5）+ [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) 衍生 follow-up P2 四項（042-N2 + 042-N6 + F3-N4 + 041-N1）

---

## 1. 觸發背景

### 1.1 W-F12/13/14 在 roadmap 的位置

[`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md §8`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) 將 observability 拆 3 個 feature：

| feature | 來源 | 內容 |
|---|---|---|
| **W-F12** | DESIGN-W §8.1 | Log 聚服務：promtail + Loki |
| **W-F13** | DESIGN-W §8.2 + §8.3 | Metrics：prometheus + 3 exporters + 8 業務 metric |
| **W-F14** | DESIGN-W §8 (整合段) | Grafana：dashboards + alerting |

042 audit-outbox-and-http-mount（2026-05-24 merge `36d7919`）落地後、`audit:events` Redis Stream + sys_audit_outbox 表 + sys_operation_log 雙視角全部就位、subscriber 可以消費 audit 事件、observability stack 的「audit / log / metric 來源」reality 已 ready。

### 1.2 為何 bundle 為 mega-feature

2026-05-24 session 拍板路線 **A2 + Option A**：W-F12/13/14 三件套 + P2 4 項 cleanup 合成 1 個 mega-feature「**044-observability-and-cleanup-pass**」一次到位（取 041 / 043 spec-hygiene-pass-X 體例「pass」用法）。

Why bundle：
- W-F12 log + W-F13 metrics + W-F14 dashboards/alerts 互相 ref；分 3 feature 等於 spec / plan / tasks / acceptance × 3、實際 service 啟動 + acceptance 又必須一起；分開反而增 overhead。
- P2 4 項全部 touch audit middleware / tracing path、剛好與 W-F12 log JSON migration 接面 zerod。
- 042 規模 (R3 + F2.2 + R2 bundled、~110 tasks) 已驗證 mega-feature 體例可控。

### 1.3 起源 follow-up bundle

| Bundle item | Priority | 來源 | 性質 |
|---|---|---|---|
| **W-F12** | P1 🎯 | DESIGN-W §8.1 | Log 三服務 + rust tracing JSON migration |
| **W-F13** | P1 | DESIGN-W §8.2 + §8.3 | Metrics + 3 exporter + 8 業務 metric |
| **W-F14** | P1 | DESIGN-W §8（整合段） | Grafana provisioning + alerts |
| **042-N2** | P2 | 042 code-quality reviewer | `extract_entity_id_from_url` 對 `/systemManage/<verb>/<id>` paths 抽錯（nth(2) 拿 verb 非 id） |
| **042-N6** | P2 | 042 implementer / T016 | `OperationLogContext.module_name` / `description` middleware 寫 `"TODO"` placeholder（pre-existing F2.1 留下） |
| **F3-N4** | P2 | F3 G6 review | pre-existing `print!("user is {:#?}", user)` debug 痕 3 處（sys_user_api / sys_menu_api / sys_authorization_service） |
| **041-N1** | P2 | 041 implementer 發現 | status enum DB `enabled`/`disabled` vs wire `"1"`/`"2"` 混雜模式（待 grep 確認範圍） |

---

## 2. brainstorm Q&A 拍板

**Q1 — feature 切割**

- Option A 1 mega-feature（W-F12+13+14 + P2 4 項）✅ **拍板**
- Option B 2 feature（044 W-F12 log + P2、045 W-F13+14 metrics+grafana）
- Option C 3 feature 全拆 + P2 進 044

**Why**：W-F12/13/14 互相 ref（dashboard 引 log + metric source）、分開做 overhead 大；042 mega-feature 體例已驗可控；P2 4 項剛好 touch 同一 audit middleware / tracing path。

**Q2 — observability scope 深度**

- Option A Full DESIGN-W §8（7 service + JSON tracing + 8 metric 全 instrument + dashboards + alerts）✅ **拍板**
- Option B MVP（7 service + JSON tracing + 只 auto-collected http_request_duration + placeholder dashboards、custom 7 metric 留 045+）
- Option C MVP + 1 custom（同 MVP + audit_log_writes_total 一個 custom 作 end-to-end proof）

**Why**：W-F12/13/14 軌道 close-out、DESIGN-W §8 章節 100% 收尾、避免 045+ 再回頭補。

**Q3 — dev stack 啟動策略**

- Option A dev default off + opt-in profile（DESIGN-W §8 原 profile-gated 設計）
- Option B dev default on、全跳起來 ✅ **拍板**
- Option C profile-gated + 寫 deploy/start-dev-obs.sh shortcut

**Why**：dev 對齊 prod fidelity、CDP smoke 隨手可查 grafana / dashboard、開發體驗最直接（接受 30-60s 啟動 + 1-2GB RAM 成本）。

**Q4 — rust tracing JSON 與 request_id 對接**

- Option 1 重用 REQUEST_ID_TASK_LOCAL + 自訂 FormatEvent（task_local pump 進 JSON 欄）
- Option 2 tracing span（tower-http TraceLayer + MakeSpan info_span!）+ 042 task_local 並存 ✅ **拍板**
- Option 3 雙 ID（tracing trace_id + 042 request_id、Grafana dashboard correlate）

**Why**：Option 2 是 tracing crate 標準做法、callsite 0 改動、JSON event 自動 inherit span attr；042 `REQUEST_ID_TASK_LOCAL` 不動繼續為 audit path 服務；spawn 路徑漏接的 await 風險用 `.instrument(span)` 補。

---

## 3. 範圍與 Constitution 處理

### 3.1 七 user story 對應

| US | Priority | 來源 | 範圍 |
|---|---|---|---|
| **US1** | P1 🎯 MVP | W-F12 | promtail + Loki + rust tracing JSON migration（Option 2 span-based、`fmt::layer()` → `fmt::json()` + tower-http TraceLayer + MakeSpan info_span! + DESIGN-W §8.1 schema：timestamp/level/service/request_id/msg + 可選 actor_user_id/route/http_status/latency_ms/error_kind） |
| **US2** | P1 | W-F13 | prometheus + 3 exporters（postgres / redis / nginx）+ rust `/metrics` endpoint（`metrics` + `metrics-exporter-prometheus` crate）+ 8 業務 metric 全 instrument |
| **US3** | P1 | W-F14 | grafana provisioning（datasource loki + prom auto-loaded、dashboard JSON、alerting rules）；alerting infra 細節留 /speckit-clarify |
| **US4** | P2 | 042-N2 | `extract_entity_id_from_url` hybrid nth(2)/nth(3) rule（第 1 segment `systemManage` → nth(3)、否則 nth(2)） |
| **US5** | P2 | 042-N6 | `OperationLogContext.module_name`/`description` "TODO" placeholder fix（從 url + entity_type 推導實值） |
| **US6** | P2 | F3-N4 | `print!("user is {:#?}", user)` 3 處 → `tracing::debug!`（sys_user_api / sys_menu_api / sys_authorization_service） |
| **US7** | P2 | 041-N1 | status enum DB `enabled`/`disabled` vs wire `"1"`/`"2"` 混雜 grep / 對齊（scope 視 grep 結果界定、避免 scope creep） |

### 3.2 Constitution check（v1.4.0 5 Principle）

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe** | observability 純觀察、不動 Casbin enforce / policy / endpoint。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | 既有 audit pipeline 0 改動；US2 加 `audit_log_writes_total` counter 在 `audit_log::write_in_txn` 內、純 metric instrument、不改 audit 寫入語意；US5 placeholder fix 改 `OperationLogContext.module_name` 寫實值（**反向強化**：audit row 更可信、不是退化）。 | ✅ PASS |
| **III. service 單一職責** | + 7 service（loki / promtail / prometheus / grafana / postgres_exporter / redis_exporter / nginx-exporter）全屬 observability profile network、隔離 internal；rust-api 加 `/metrics` route 為 self-instrumentation、不引 service-to-service HTTP。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**；軌道**外**、屬「預設原則」涵蓋；**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment。同 039 / 041 / 042 / 043 模式。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；observability 純 rust + 第三方 service、強化 DESIGN-B 形態。 | ✅ PASS |

**結論**：5/5 PASS、無 violation、無需 Constitution amendment、無需 DESIGN-W-WEBUI 更新（軌道外）。

### 3.3 Workspace 處置

- 軌道**外**、rust-api + outer（compose / deploy/）；**0 base-web 改動**。
- rust-api worktree commits：tracing JSON migration + /metrics endpoint + 8 metric instrument code + 4 P2 cleanup
- outer rev1-admin-root commits：docker-compose.observability.yml（新）+ deploy/{loki-config,promtail-config,prometheus,grafana-provisioning}/ + deploy/secrets/ 新檔 + INTEGRATION-CHECKLIST cleanup
- 預估改動規模：rust-api ~25-35 處 / outer ~15-25 個新檔 + compose / 估 50-80 tasks（同 042 規模）

---

## 4. 服務拓樸與整合點

### 4.1 ASCII 架構（dev default on、12 service total）

```
                     ┌──────────────────────────────────┐
                     │  internal network (既有 5 service) │
                     └──────────────────────────────────┘
                                    │
        ┌─────────┬─────────┬────────┴────────┬─────────┬─────────┐
        │         │         │                 │         │
   ┌────▼──┐ ┌────▼──┐ ┌────▼──┐         ┌────▼──┐ ┌────▼──┐
   │postgr │ │ redis │ │rust-api│ ──┐    │f-nginx│ │base-w │
   │ es    │ │       │ │       │   │    │       │ │ eb    │
   └───┬───┘ └───┬───┘ └───┬───┘   │    └───┬───┘ └───────┘
       │         │         │/metrics│        │
       │ scrape  │ scrape  │ scrape │        │ stub_status
       │         │         │        │        │
       │         │     ┌───▼────────▼──┐ ┌───▼──────┐
       │         │     │  rust-api/    │ │ nginx-   │
       │         │     │  metrics:9090 │ │ exporter │
       │         │     └───────────────┘ └────┬─────┘
       │         │                            │
   ┌───▼─────┐ ┌─▼───────┐                   │
   │postgres-│ │redis-   │                   │
   │exporter │ │exporter │                   │
   └───┬─────┘ └───┬─────┘                   │
       │           │                          │
       └───────────┴──────────────┬───────────┘
                                  │
                ┌─────────────────▼──────────────────┐
                │       observability network        │
                └──┬───────────┬───────────┬─────────┘
                   │           │           │
              ┌────▼───┐  ┌────▼───┐  ┌────▼────┐
              │promtail│  │  loki  │  │prometheus│
              │(daemon │  │        │  │          │
              │ scrape)│  │        │  │          │
              └────────┘  └────┬───┘  └────┬─────┘
                               │           │
                               │           │
                          ┌────▼───────────▼─────┐
                          │       grafana        │
                          │ ┌─────────────────┐  │
                          │ │ datasource loki │  │
                          │ │ datasource prom │  │
                          │ │ dashboards (n)  │  │
                          │ │ alerts (n)      │  │
                          │ └─────────────────┘  │
                          └───────┬──────────────┘
                                  │
                              :13000 (dev host)
```

### 4.2 既有 5 service 接合點

| 既有 service | 044 接合 |
|---|---|
| **postgres** | + postgres_exporter sidecar、scrape pg_stat_* / connection / db size；既有 schema 0 改動 |
| **redis** | + redis_exporter sidecar、scrape memory / keyspace / connections；既有 042 `audit:events` stream 0 影響 |
| **rust-api** | `log_tracing_init.rs` fmt::layer() → fmt::json() / +tower-http TraceLayer MakeSpan / +`/metrics` axum route / +8 業務 metric instrument / +4 P2 cleanup |
| **front-nginx** | 加 `stub_status` location（internal only）/ + nginx-exporter sidecar |
| **base-web** | **0 touch**（軌道外 + Principle IV 預設原則） |

### 4.3 deploy/ 目錄新檔（outer 追蹤）

```
deploy/
├── loki-config.yml                     # loki retention + storage
├── promtail-config.yml                 # docker daemon scrape config
├── prometheus.yml                      # scrape targets + rules ref
├── prometheus-rules/                   # alerting rules
│   └── *.yml
├── grafana-provisioning/
│   ├── datasources/
│   │   ├── loki.yml
│   │   └── prometheus.yml
│   ├── dashboards/
│   │   ├── dashboards.yml              # provisioning manifest
│   │   └── *.json                      # dashboard JSON
│   └── alerting/
│       └── *.yml
├── secrets/                            # 既存目錄
│   ├── grafana_admin_password.txt      # 新
│   └── postgres_exporter_dsn.txt       # 新
└── nginx/
    └── stub_status.conf                # nginx stub_status 啟用

docker-compose.observability.yml        # 7 service + profile observability
```

### 4.4 既有 docker-compose 配對

- `docker-compose.yml` 不動（既有 5 service）
- `docker-compose.dev.yml` 加 include `docker-compose.observability.yml`（Q3 拍板 dev default on）
- `docker-compose.prod.yml` 加 `--profile observability` 啟用
- Q3 拍板：dev 不需要 `--profile observability` flag、自動跑

---

## 5. User story 細節

### 5.1 US1 — W-F12 log 三服務 + rust tracing JSON

#### 5.1.1 promtail config（`deploy/promtail-config.yml`）

```yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: container
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: service
```

掃 Docker daemon 各 container stdout、label 加上 service / container 名。

#### 5.1.2 loki config（`deploy/loki-config.yml`）

- single-binary mode（dev / small prod 適用、避免 7 微服務）
- BoltDB shipper / filesystem chunk store
- retention 30 day（對齊 Prometheus retention）

#### 5.1.3 rust-api tracing JSON migration

```rust
// rust-api/server/initialize/src/log_tracing_init.rs

let fmt_layer = tracing_subscriber::fmt::layer()
    .json()                              // 改 plain → JSON
    .with_target(true)
    .with_current_span(false)            // 不要 span 描述本身
    .with_span_list(false)               // span 串接也不要
    .with_thread_names(false)
    .with_file(false)
    .with_line_number(false);            // 保持輸出簡潔

// 加 tower-http TraceLayer in router_initialization.rs:
use tower_http::trace::{TraceLayer, MakeSpan};

#[derive(Clone)]
struct AppMakeSpan;
impl<B> MakeSpan<B> for AppMakeSpan {
    fn make_span(&mut self, req: &http::Request<B>) -> tracing::Span {
        let request_id = req.extensions().get::<axum::http::HeaderName>()  // pseudo
            .and_then(|h| ...)
            .unwrap_or_else(|| "-".into());
        tracing::info_span!("http_req",
            service = "rust-api",
            request_id = %request_id,
            method = %req.method(),
            route = %req.uri().path())
    }
}
```

JSON output 對齊 DESIGN-W §8.1 schema：必要欄 `timestamp` / `level` / `service` / `request_id` / `msg`、可選 `actor_user_id` / `route` / `http_status` / `latency_ms` / `error_kind`。

#### 5.1.4 spawn 路徑 propagation

```rust
let span = tracing::Span::current();
tokio::spawn(async move {
    // tracing::info! 等仍含 parent span attr
}.instrument(span));
```

drainer / cleanup job / background task 全 audit `.instrument()` 覆蓋。

### 5.2 US2 — W-F13 metrics

#### 5.2.1 rust-api `/metrics` endpoint

```rust
// 新 server/bin/src/metrics.rs
use axum::{routing::get, Router};
use metrics_exporter_prometheus::PrometheusBuilder;

pub fn init() -> Router {
    let handle = PrometheusBuilder::new().install_recorder()
        .expect("metrics recorder");
    Router::new().route("/metrics", get(move || async move { handle.render() }))
}

// router_initialization.rs:
let metrics_router = metrics::init();
let app = Router::new()
    .merge(admin_router)
    .merge(metrics_router)  // mount /metrics
```

#### 5.2.2 8 業務 metric 落點（per DESIGN-W §8.3）

| Metric | Type | Labels | 落點 |
|---|---|---|---|
| `http_request_duration_seconds` | histogram | service / route / status | tower-http auto layer（或自製 layer 從 span attr 抽） |
| `audit_log_writes_total` | counter | operation / entity_type | `server/model/src/admin/audit_log.rs::write_in_txn` 末尾 |
| `casbin_enforcement_total` | counter | result=allow\|deny | `server/core/src/web/casbin_*.rs` enforce wrapper |
| `casbin_policy_cache_invalidate_total` | counter | — | `server/global/src/casbin_notify.rs::notify_casbin_changed` callsite |
| `outbox_pending_events` | gauge | — | 042 drainer `fetch_pending_events` count gauge.set() |
| `sys_tokens_active` | gauge | — | token store size gauge.set()（每 N 秒 poll） |
| `cleanup_job_rows_deleted_total` | counter | table_name | cleanup job stats |
| `backup_completed_total` | counter | type=base\|wal | backup wrapper（既有 W-F11） |

#### 5.2.3 3 exporters

```yaml
# docker-compose.observability.yml
postgres_exporter:
  image: prometheuscommunity/postgres-exporter:latest
  environment:
    - DATA_SOURCE_NAME_FILE=/run/secrets/postgres_exporter_dsn
  secrets:
    - postgres_exporter_dsn
  profiles: ["observability"]

redis_exporter:
  image: oliver006/redis_exporter:latest
  environment:
    - REDIS_ADDR=redis://redis:6379
    - REDIS_PASSWORD_FILE=/run/secrets/redis_password   # 既存 secret 復用
  profiles: ["observability"]

nginx-exporter:
  image: nginx/nginx-prometheus-exporter:latest
  command: ["-nginx.scrape-uri=http://front-nginx:8081/stub_status"]
  profiles: ["observability"]
```

front-nginx 加 internal-only `stub_status` location（不暴給 host）。

#### 5.2.4 prometheus.yml scrape targets

- rust-api:9090/metrics（暫定 port、依 axum router 實際）
- postgres_exporter:9187
- redis_exporter:9121
- nginx-exporter:9113
- promtail:9080
- loki:3100/metrics（loki 自身 metrics）
- prometheus self-scrape

### 5.3 US3 — W-F14 grafana dashboards + alerts

#### 5.3.1 datasource provisioning（auto-loaded）

```yaml
# deploy/grafana-provisioning/datasources/loki.yml
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    url: http://loki:3100
    access: proxy
    isDefault: false

# deploy/grafana-provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
```

#### 5.3.2 dashboard 設計風格（留 /speckit-clarify Q）

候選：
- **A. 1 master overview + drill-down per component**：1 main dashboard 全 service health overview、click drill-down 到 component dashboard
- **B. Per-component standalone**：每 service 一 dashboard（rust-api / postgres / redis / nginx / front-nginx / observability self-monitoring）

留 spec /speckit-clarify 階段拍板。

#### 5.3.3 alerting infra（留 /speckit-clarify Q）

候選：
- **A. Prometheus alertmanager**：新增第 8 個 observability service、route alert 到 webhook / email
- **B. Grafana built-in unified alerting**：grafana 9+ 內建、不需新 service、UI 直觀

留 spec /speckit-clarify 階段拍板。

#### 5.3.4 預定 alerting rules（無論 A/B 都需要的內容）

- rust-api HTTP 5xx rate > 1%/min
- audit_log_writes_total 停滯（5 分鐘無 increment、可能 audit pipeline 故障）
- outbox_pending_events > 1000（drainer 跟不上）
- postgres connection saturation > 80%
- redis memory > 80%
- log volume drop > 50%（promtail 連線異常或 service down）

### 5.4 US4 — 042-N2 `extract_entity_id_from_url` hybrid rule

#### 5.4.1 現況 bug（per 042 N2 backlog）

```rust
// server/core/src/web/operation_log.rs (pre-existing)
fn extract_entity_id_from_url(url: &str) -> Option<String> {
    url.split('/').nth(2).map(String::from)
}
```

對 `/api/role/<id>` 對；對 `/systemManage/<verb>/<id>` 抽到 verb（如 `deleteMenu`）。

#### 5.4.2 fix（hybrid rule）

```rust
fn extract_entity_id_from_url(url: &str) -> Option<String> {
    let segments: Vec<&str> = url.split('/').filter(|s| !s.is_empty()).collect();
    if segments.first() == Some(&"systemManage") {
        // /systemManage/<verb>/<id>  → nth(2) in filtered
        segments.get(2).map(|s| s.to_string())
    } else {
        // /role/<id>, /user/<id>, etc.  → nth(1) in filtered
        segments.get(1).map(|s| s.to_string())
    }
}
```

關鍵：用 filter(empty) 之後 segments[0] / segments[1] / segments[2] 與既存 `nth(2)` 慣例（含 leading `/` 產 empty seg）對齊。實際實作驗 url 樣本表（design 階段附 test cases）。

### 5.5 US5 — 042-N6 placeholder fix

#### 5.5.1 現況（pre-existing F2.1 留下）

```rust
// server/core/src/web/operation_log.rs:121-122 (pre-existing)
let mut context = OperationLogContext {
    module_name: "TODO".to_string(),
    description: "TODO".to_string(),
    ...
};
```

#### 5.5.2 fix

- `module_name` 從 entity_type 取（per audit hybrid rule、e.g. `sys_role`）
- `description` 改 `"HTTP {method} {url}"`（與 042 fallback 對齊）

確保 outbox JSON / sys_operation_log row 內這兩欄是實值而非 TODO。

### 5.6 US6 — F3-N4 print! 3 處清理

3 個 callsite grep + 替換：

```rust
// pre-existing in 3 files:
print!("user is {:#?}", user);

// →
tracing::debug!(?user, "user info");  // 或拿掉、視語境
```

### 5.7 US7 — 041-N1 status enum 混雜

**先 grep 確認 scope**：

```bash
grep -rn '"status".*"1"\|"status".*"2"' rust-api/server/ | head
grep -rn '"status".*"enabled"\|"status".*"disabled"' rust-api/server/ | head
grep -rn 'status.*string.*1\|status.*string.*2' base-web/src/ | head
```

依結果：
- 若 hits 集中（≤5 處）→ 對齊修
- 若 hits 散落（>10 處）→ 本 spec 內登記 errata 但不動、scope creep 留 045 spec-hygiene-pass-3 候選

US7 為 **scope-conditional**、design 階段先界定。

---

## 6. Data flow

### 6.1 Log path

```
service stdout (rust JSON / nginx JSON / base-web stdout)
   │
   ▼
docker daemon log
   │ (promtail docker_sd_configs scrape)
   ▼
promtail
   │ push
   ▼
loki (chunk store)
   │ datasource query
   ▼
grafana panel / log table / alert query
```

### 6.2 Metric path

```
rust-api `/metrics` (PrometheusBuilder render)
postgres_exporter / redis_exporter / nginx-exporter `/metrics`
   │ (prometheus.yml scrape_interval)
   ▼
prometheus TSDB
   │ datasource query
   ▼
grafana panel / alerting rule eval
```

### 6.3 Audit-correlate path（跨 log 與 audit row）

```
HTTP request
   │
   ▼
front-nginx 加 X-Request-ID header
   │
   ▼
rust-api operation_log middleware: 抽 X-Request-ID → REQUEST_ID_TASK_LOCAL.scope(...)
                                  + tower-http TraceLayer make_span: info_span!(request_id = %X-Request-ID)
   │
   ├──────────────────────────────────────────┐
   ▼                                          ▼
log JSON: { request_id: "abc", ... }   sys_operation_log row: request_id = "abc"
   │                                          │
   │                                          │
   └────► Grafana dashboard: log table view ──┘
          + audit row table 同 request_id → correlate panel
```

關鍵：**044 不引入新 trace_id**、log JSON 的 request_id 與 audit row 的 request_id 是**同一個值**（X-Request-ID header、跨 log + audit row 全鏈穿）。

### 6.4 dev / prod 啟動

```bash
# === dev (Q3 拍板 default on)===
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
               -f docker-compose.observability.yml up -d --wait
# 12 service (5 既有 + 7 obs) auto-start

# === prod baseline ===
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               -f docker-compose.observability.yml --profile prod \
               --profile observability up -d --wait
# 12 service + acme (W-F6b 後)
```

---

## 7. Commit shape（per CLAUDE.md §4.1）

044 為 mega-feature、預估多段式 commit：

### 7.1 rust-api worktree commits（多 commit ideally）

| Topic | 估 commit 數 | 內容 |
|---|---|---|
| US1 tracing JSON migration | 1-2 | log_tracing_init.rs json formatter + tower-http TraceLayer MakeSpan |
| US2 /metrics endpoint | 1 | metrics.rs + axum mount + workspace dep add |
| US2 8 業務 metric instrument | 2-3 | per metric instrument commit（避免 monster diff） |
| US4 url parsing fix | 1 | extract_entity_id_from_url hybrid |
| US5 placeholder fix | 1 | module_name / description 實值 |
| US6 print! 清理 | 1 | 3 處 → tracing::debug! |
| US7 status enum（若 in-scope） | 0-1 | scope-conditional |

預估 8-12 個 worktree commits。

### 7.2 outer rev1-admin-root commits（多 commit ideally）

| Topic | 估 commit 數 | 內容 |
|---|---|---|
| docker-compose.observability.yml + deploy/configs | 1 | 7 service compose + loki / promtail / prom / grafana provisioning skeleton |
| nginx stub_status + nginx-exporter | 1 | front-nginx config + exporter sidecar |
| grafana dashboards | 1-2 | dashboards JSON + alerting rules（依 Q3/Q4 design 拍板） |
| SHA pin bumps（每 rust-api commit 對應 1 個 outer pin commit） | 8-12 | 依 rust-api 數 |
| INTEGRATION-CHECKLIST cleanup | 1 | W-F12/13/14 + P2 4 項移 backlog + 加 044 entry |
| SHA backfill（post-merge） | 1 | per 041/042/043 體例 |

預估 13-19 個 outer commits、最終 merge 回 `rev1-admin-root`。

---

## 8. Acceptance / C-V concept

設計約 C-V20+ 條 acceptance（spec / contracts/verification-commands.md 階段拍板細項）：

| 類別 | C-V 數 | 內容 |
|---|---|---|
| log infra | 2-3 | promtail scrape OK / loki ingestion OK / log JSON schema 對齊 |
| log correlate | 2 | request_id 在 log JSON + sys_operation_log row 一致 / spawn 路徑 .instrument 不漏接 |
| metrics infra | 3 | /metrics endpoint 200 + prom format / 3 exporters 都被 scrape / prometheus targets up |
| 8 business metrics | 8 | 每個 metric 各 1 C-V acceptance（trigger 動作 + 看 metric increment） |
| dashboards | 2-3 | grafana 渲染 / datasource health / dashboard provision 正確 |
| alerting | 2-3 | alert rule load / alert fire / alert clear |
| US4-US7 cleanup | 4 | 每 US 各 1 grep verify |

估 23-27 條 C-V。

### 8.1 CDP smoke 顧慮

base-web 0 改動、但 CDP smoke 可順手驗 grafana / dashboard 顯示（dev default on 後 grafana 在 :13000）。defer 至 acceptance 階段。

---

## 9. 風險 / 假設 / Deferred

### 9.1 風險

- **tracing span spawn .instrument() 漏接**：drainer / cleanup job / spawn 出去的 task 未 `.instrument(span)` 會丟 request_id。**緩解**：grep 所有 `tokio::spawn` callsite、acceptance 加 1 條 C-V 驗 drainer log JSON 含 request_id。
- **7 service 啟動 30-60s**：dev iteration loop 慢。**緩解**：Q3 拍板 dev default on、減少 restart 頻率。Q3 接受該成本。
- **prometheus disk usage**：8 業務 metric × 30 day retention × 多 label cardinality 可能 > 10GB。**緩解**：dev 設 7 day retention；prod 視 metric cardinality 調整。
- **grafana_admin_password 預設不安全**：dev 用簡單值、prod 走 deploy/secrets。**緩解**：對齊既有 secret file pattern、git ignore。
- **dev compose 第 11081 port single-bind**：042-N5 remains、observability 不解這 issue（屬 dev compose 配置缺口）。

### 9.2 假設

- **alerting infra** 留 spec /speckit-clarify 階段拍板（A. alertmanager 8th service vs B. grafana built-in）。
- **dashboard 設計風格** 留 spec /speckit-clarify 階段拍板（A. 1 master + drill-down vs B. per-component）。
- **US7 status enum scope** 在 plan 階段 grep 後界定（scope-conditional、可能 in-scope 修或 out-of-scope errata）。
- **dev / prod 對齊**：Q3 拍板 dev default on、prod 走 `--profile observability`；prod 真實部署待 W-F6b acme.sh + 真實 domain。
- **既有 5 service config 0 改動**：postgres / redis / rust-api(modulo metrics) / front-nginx(modulo stub_status) / base-web。

### 9.3 Deferred（不在 044 範圍）

- **042-N5 dev compose port bind**：留 dev compose config feature 處理。
- **042-N4 SC-005 stretch p50 ≤ 100ms**：留 observability subscriber 真實 measurement 後再評估是否需要 channel notify 替代 polling。
- **042-N1 4 個 `#[ignore]` integration test**：留下次觸碰 test 時調整。
- **F1.2 JWT algorithm 升級**：留安全 sprint。
- **F-facade-atomicity-pass (P3 大重構)**：F3-N1/N2/N3 + 035-N1、留下個 sprint。
- **base-web TS `id` 型別債**：W-WEBUI FR-015 禁碰、留 base-web cleanup sprint。
- **W-F6b acme.sh real cert acquisition**：留外部公網 + domain 就緒後。

---

## 10. 後續 spec-kit 設計鏈

依 [CLAUDE.md §3](../CLAUDE.md)：

1. **`/speckit-specify`**（input = 本文件）→ `specs/044-observability-and-cleanup-pass/spec.md`；`before_specify` pre-hook 建 outer feature branch `044-observability-and-cleanup-pass`
2. **`/speckit-clarify`**（推薦）→ 補 spec.md `## Clarifications` 段，至少拍板：
   - alerting infra（alertmanager 8th service vs grafana built-in）
   - dashboard 設計風格（1 master vs per-component）
   - US7 status enum scope（in-scope 修 vs out-of-scope errata）
3. **`/speckit-plan`** → plan.md + research.md / data-model.md / contracts/verification-commands.md / quickstart.md；含 Constitution Check 與 Phase 0 R-X grep 紀律
4. **`/speckit-tasks`** → tasks.md dependency-ordered task 清單
5. **`/speckit-analyze`** → cross-artifact consistency report
6. **`superpowers:executing-plans`** → 階段 B TDD 實作（**不**用 `/speckit-implement`、per CLAUDE.md §3）

預估 spec-kit 設計鏈 1-2 session 完成、implementer 階段（5-10 個 subagent 派遣）約 3-4 個 session。

---

## 11. 命名與里程碑

- **Feature name**：`044-observability-and-cleanup-pass`（取 041/043 「pass」用法表示 mega-feature bundle）
- **Outer branch**：`044-observability-and-cleanup-pass`（spec-kit pre-hook 建）
- **里程碑**：W-F12/13/14 軌道 close-out + P2 4 項清完 + Phase W deploy P5 完成（**Phase W deploy 全部結案**）。
- **下一步**（044 之後）：可能是 P3 F-facade-atomicity-pass 大重構（F3-N1/N2/N3 + 035-N1）、或 base-web TS id 型別債 cleanup sprint、或安全 sprint（F1.2 JWT 升級）。
