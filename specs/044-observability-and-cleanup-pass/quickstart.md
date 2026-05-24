# Quickstart — 044 observability-and-cleanup-pass

**Phase**：1（Design & Contracts、Phase 1 產出）
**Audience**：implementer（人或 AI）執行 044 的步驟手冊。

依執行順序：rust-api tracing JSON + /metrics + metric instrument → outer deploy/ config + 7 service compose → dev 12 service 啟動 + 6 active metric verify → US4-US6 P2 cleanup → INTEGRATION-CHECKLIST 移 row + 044 entry → 多段式 commit + merge。

---

## 前置假設

- dev stack 既有 5 service healthy（postgres / redis / rust-api / front-nginx / base-web、見 [`CLAUDE.md §8.2`](../../CLAUDE.md)）
- outer branch 為 `044-observability-and-cleanup-pass`（pre-hook 已建、`git branch --show-current` 確認）
- `PC` shell alias（建議）：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"`
- 預設帳號 `Soybean`/`123456`（per CLAUDE.md §8.1）

---

## Step 1 — rust-api tracing JSON migration（US1、FR-002/003）

### 1.1 修改 `rust-api/server/initialize/src/log_tracing_init.rs`

```rust
// fmt::layer() → fmt::json()
let fmt_layer = tracing_subscriber::fmt::layer()
    .json()
    .with_target(true)
    .with_current_span(false)
    .with_span_list(false)
    .with_thread_names(false)
    .with_file(false)
    .with_line_number(false);
// Registry + EnvFilter + ErrorLayer 不動
```

### 1.2 加 tower-http TraceLayer + MakeSpan

修改 `rust-api/server/initialize/src/router_initialization.rs::apply_layers`：

```rust
use tower_http::trace::{TraceLayer, MakeSpan};

#[derive(Clone)]
struct AppMakeSpan;
impl<B> MakeSpan<B> for AppMakeSpan {
    fn make_span(&mut self, req: &http::Request<B>) -> tracing::Span {
        let request_id = req.extensions()
            .get::<axum::http::HeaderValue>()  // 待 implementer 用 axum RequestId 既有 extension type
            .map(|h| h.to_str().unwrap_or("-").to_string())
            .unwrap_or_else(|| "-".to_string());
        tracing::info_span!("http_req",
            service = "rust-api",
            request_id = %request_id,
            method = %req.method(),
            route = %req.uri().path())
    }
}

// apply_layers 末端 mount：
router.layer(TraceLayer::new_for_http().make_span_with(AppMakeSpan))
```

### 1.3 spawn callsite 全部加 `.instrument(span)`（per FR-004）

per [research.md R-7](./research.md) 9 個 callsite，grep enumerate 後：

```rust
let span = tracing::Span::current();
tokio::spawn(async move {
    // ...
}.instrument(span));
```

涵蓋 `server/global/src/global.rs` (5 處)、`server/initialize/src/audit_outbox_initialization.rs` (drainer)、`server/initialize/src/casbin_sync_initialization.rs` (Casbin redis sub)、`server/core/src/web/operation_log.rs:143` (spawn_http_audit_write)。`spawn_blocking` 不需 instrument。

### 1.4 verify

```bash
$PC restart rust-api
sleep 5
$PC logs rust-api 2>/dev/null | tail -20
# expect: 每 row JSON、含 timestamp/level/service/request_id/msg
```

對應 C-V2 + C-V3 + C-V10。

---

## Step 2 — `/metrics` endpoint + 8 metric pre-declare（US2、FR-005）

### 2.1 加 workspace dep（`rust-api/Cargo.toml`）

```toml
[workspace.dependencies]
metrics = "0.23"
metrics-exporter-prometheus = "0.15"
```

`server/initialize/Cargo.toml` 加 dep。

### 2.2 新檔 `server/initialize/src/metrics_init.rs`

```rust
use axum::{routing::get, Router};
use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

pub fn init() -> Router {
    let handle: PrometheusHandle = PrometheusBuilder::new()
        .install_recorder()
        .expect("install prometheus recorder");

    // 8 metric pre-declare（per data-model.md §E3）
    counter!("audit_log_writes_total");
    counter!("casbin_enforcement_total");
    counter!("casbin_policy_cache_invalidate_total");
    counter!("cleanup_job_rows_deleted_total");
    counter!("backup_completed_total");        // declared 0 series, W-F15/16 後 instrument
    gauge!("outbox_pending_events").set(0.0);
    gauge!("sys_tokens_active").set(0.0);       // declared 0 series, implementer 階段 grep callsite
    histogram!("http_request_duration_seconds");

    Router::new().route("/metrics", get(move || {
        let h = handle.clone();
        async move { h.render() }
    }))
}
```

### 2.3 mount `/metrics` 進 router_initialization

```rust
use crate::metrics_init;

let metrics_router = metrics_init::init();
let app = Router::new()
    .merge(admin_router)
    .merge(metrics_router);  // /metrics endpoint
```

### 2.4 6 active metric instrument（落點 per data-model.md §E3）

| Metric | File | Patch |
|---|---|---|
| `audit_log_writes_total` | `server/model/src/admin/audit_log.rs::write_in_txn` | `counter!("audit_log_writes_total", "operation" => operation.as_str(), "entity_type" => entity_type.to_string()).increment(1);` 在 Result Ok 前 |
| `casbin_enforcement_total` | axum casbin middleware enforce wrapper（implementer 階段 grep `\.enforce\(` callsite 確認） | `counter!("casbin_enforcement_total", "result" => if allowed {"allow"} else {"deny"}).increment(1);` |
| `casbin_policy_cache_invalidate_total` | `server/global/src/casbin_notify.rs:23` | `counter!("casbin_policy_cache_invalidate_total").increment(1);` 在 publish 後 |
| `outbox_pending_events` | `server/service/src/admin/sys_audit_outbox_drainer.rs` 主迴圈 | `gauge!("outbox_pending_events").set(pending_count as f64);` per iteration |
| `cleanup_job_rows_deleted_total` | `server/cleanup/src/main.rs` 各 delete 後 | `counter!("cleanup_job_rows_deleted_total", "table_name" => "sys_xxx").increment(deleted_count as u64);` |
| `http_request_duration_seconds` | tower-http TraceLayer（合 Step 1.2） | 自動 collected 透過 tower-http MetricsLayer integration |

### 2.5 verify

```bash
curl -fsS "http://127.0.0.1:13090/metrics" | head -50
# expect: 8 metric TYPE/HELP/series 全暴
```

對應 C-V4 + C-V5。

---

## Step 3 — outer deploy/ config + 7 service docker-compose（US1+US2+US3）

### 3.1 新檔 `docker-compose.observability.yml`

依 [`DESIGN-W §8.1+§8.2`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) 7 service spec（loki / promtail / prometheus / grafana / postgres_exporter / redis_exporter / nginx-exporter）+ `profile: ["observability"]`、`networks: [internal, observability]`、secrets pattern 沿用既有 deploy/secrets/。

### 3.2 新檔 deploy/ configs

- `deploy/loki-config.yml`：single-binary + filesystem chunks + retention 7d (dev) / 30d (prod)
- `deploy/promtail-config.yml`：docker_sd_configs scrape + service / container label
- `deploy/prometheus.yml`：scrape targets（rust-api:13090 / postgres_exporter:9187 / redis_exporter:9121 / nginx-exporter:9113 / promtail:9080 / loki:3100 / prometheus self）+ scrape_interval 15s
- `deploy/grafana-provisioning/datasources/loki.yml` + `prometheus.yml`
- `deploy/grafana-provisioning/dashboards/dashboards.yml` (manifest) + 4-6 dashboard JSON（per data-model.md §E4）
- `deploy/grafana-provisioning/alerting/*.yml`（≥6 alert rule per data-model.md §E5）
- `deploy/nginx/stub_status.conf`：internal-only stub_status location (front-nginx :8081 內部)
- `deploy/secrets/grafana_admin_password.txt` + `.example`、`deploy/secrets/postgres_exporter_dsn.txt` + `.example`

### 3.3 dev / prod compose 配對

```bash
# dev compose 加 include observability.yml + profile 強制啟動（Q3 拍板）
# docker-compose.dev.yml top-level 加：
#   include: [docker-compose.observability.yml]
#   或 alternative：dev shortcut script bash deploy/start-dev-obs.sh

# prod compose 加：
#   include: [docker-compose.observability.yml]
#   實際啟動：docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod --profile observability up -d
```

### 3.4 verify

```bash
$PC up -d --wait
$PC ps --format "table {{.Service}}\t{{.Status}}"
# expect: 12 service Up (healthy)

curl -fsS "http://127.0.0.1:13090/api/v1/targets" | python3 -c "import sys, json; t=json.load(sys.stdin)['data']['activeTargets']; print(len(t), 'targets', [x['health'] for x in t])"
# expect: 7+ targets all 'up'
```

對應 C-V1 + C-V6。

---

## Step 4 — P2 4 項 cleanup（US4-US7、FR-011/012/013/014）

### 4.1 US4 — `extract_entity_id_from_url` hybrid rule

修改 `rust-api/server/model/src/admin/audit_log.rs:196`：

```rust
fn extract_entity_id_from_url(url: &str) -> String {
    let parts: Vec<&str> = url.split('/').collect();
    if parts.get(1) == Some(&"systemManage") {
        parts.get(3).map(|s| s.to_string()).unwrap_or_default()
    } else {
        parts.get(2).map(|s| s.to_string()).unwrap_or_default()
    }
}
```

對應 C-V7。

### 4.2 US5 — `OperationLogContext` placeholder fix

修改 `rust-api/server/core/src/web/operation_log.rs:121-126`：

```rust
let entity_type = derive_entity_type_from_url(&uri);  // 同 hybrid rule、推導為 entity_type
let context = OperationLogContext {
    method: method.clone(),
    url: uri.clone(),
    module_name: entity_type.clone(),
    description: format!("HTTP {} {}", method, uri),
    // ...
};
```

對應 C-V8。

### 4.3 US6 — print! 1 處清理

修改 `rust-api/server/api/src/admin/sys_user_api.rs:40`：

```rust
// 改前：
print!("user is {:#?}", user);

// 改後：
tracing::debug!(?user, "user info");
// 或直接刪除（debug 痕、無實際 production 用途）
```

對應 C-V9。

### 4.4 US7 — 0 改動、純 errata

無 rust-api 改動；只在 INTEGRATION-CHECKLIST 移除 041-N1 row + 加 errata 字句（Step 5）。

對應 C-V11。

---

## Step 5 — INTEGRATION-CHECKLIST cleanup（FR-017）

修改 `docs/INTEGRATION-CHECKLIST.md`：

### 5.1 衍生 follow-up table 移除 4 row

- `042-N2 | 042 code-quality reviewer | extract_entity_id_from_url ...`
- `042-N6 | 042 implementer / T016 | OperationLogContext.module_name / description "TODO" ...`
- `F3-N4 | F3 G6 review | pre-existing print!("user is {:#?}", user) debug 痕 3 處 ...`
- `041-N1 | 041 implementer 發現 | status enum 後續可能再演進 ...`（移除 + 在 errata 段 / inline 加 「grep 0 hit 結案、後續若撞混雜再列 spec」字句）

### 5.2 規劃中、未排程 table 移除 3 row

- `W-F12/13/14 | DESIGN-W-DEPLOYMENT §11 | observability 三件套 ...`（全 1 row、合進 044 結案）

### 5.3 已完成里程碑加 044 entry

按 042 / 043 體例：

```markdown
- [x] **044 observability-and-cleanup-pass** ✅（2026-05-XX 完成；outer `<SHA>` + merge `<SHA>`、rust-api `<SHA>`、base-web 0 改動；spec `specs/044-observability-and-cleanup-pass/`）— W-F12/13/14 三件套 + P2 4 項 cleanup bundled = 7 observability service (promtail+Loki+prometheus+grafana+3 exporters) + rust tracing JSON migration (fmt::json + tower-http TraceLayer span-based + 042 task_local 並存) + 8 業務 metric (6 active + 2 declared 0 series for sys_tokens_active/backup_completed_total) + grafana 4-6 dashboards (1 master + 3-5 drill-down per Clarifications Q2) + ≥6 alerting rules (grafana built-in unified alerting per Q1) + dev default on 12 service 對齊 prod fidelity (Q3); P2 4 cleanup: US4 extract_entity_id_from_url systemManage hybrid rule (model/admin/audit_log.rs:196)、US5 OperationLogContext placeholder 改實值、US6 print! 1 處清理 (sys_user_api.rs:40、其他 println! 在 cfg(test)/startup 合理保留)、US7 status enum errata 結案 (grep 0 hit、留 045 候選); plan 階段 4 spec correction reconcile (A1-A4); 軌道外 rust-api + outer、0 base-web、0 schema migration、0 新 entity；C-V1~C-V23 全 PASS；Phase W deploy P5 close-out (W-F12/13/14 全結案)；下一步：P3 F-facade-atomicity-pass 或 base-web id 型別債 sprint
```

### 5.4 Current Focus 下一步

從「044 進行中」→「P3 F-facade-atomicity-pass (F3-N1/N2/N3 + 035-N1) 或 base-web TS id 型別債 cleanup sprint」。

對應 C-V12。

---

## Step 6 — 多段式 commit（per CLAUDE.md §4.1）

### 6.1 rust-api worktree commits（8-12 個）

每個 logical 改動 1 個 commit（per [plan.md §Commit shape](./plan.md)）：

```bash
cd rust-api
git status  # 確認 rev1-admin-rust-api branch

# US1 commits
git add server/initialize/src/log_tracing_init.rs
git commit -m "feat(rust-api): tracing JSON formatter migration (US1)"

git add server/initialize/src/router_initialization.rs
git commit -m "feat(rust-api): tower-http TraceLayer + MakeSpan request_id span attr (US1)"

# US2 commits（拆 3-4 個避免 monster diff）
git add server/initialize/src/metrics_init.rs server/initialize/Cargo.toml Cargo.toml
git commit -m "feat(rust-api): /metrics endpoint + 8 metric pre-declare (US2)"

# 各 metric instrument 各 1 commit...

# US4 commit
git add server/model/src/admin/audit_log.rs
git commit -m "fix(rust-api): extract_entity_id_from_url hybrid rule for systemManage path (US4 / 042-N2)"

# US5 commit
git add server/core/src/web/operation_log.rs
git commit -m "fix(rust-api): OperationLogContext module_name + description 改實值 (US5 / 042-N6)"

# US6 commit
git add server/api/src/admin/sys_user_api.rs
git commit -m "fix(rust-api): 拿掉 print!('user is') debug 痕 (US6 / F3-N4)"

# spawn .instrument propagation cascade commit (US1 FR-004)
git add server/global/src/global.rs server/initialize/src/{audit_outbox,casbin_sync}_initialization.rs server/core/src/web/operation_log.rs
git commit -m "feat(rust-api): tokio::spawn .instrument(span) propagation (US1 FR-004)"

# push 須 user 同意
git push origin rev1-admin-rust-api
cd ..
```

### 6.2 outer rev1-admin-root commits

```bash
# outer compose + deploy/ commits（per plan.md §Commit shape）：
git add docker-compose.observability.yml deploy/loki-config.yml deploy/promtail-config.yml deploy/prometheus.yml deploy/prometheus-rules/ docker-compose.dev.yml docker-compose.prod.yml
git commit -m "feat(deploy): 7 observability service compose + base configs (US1+US2+US3 / W-F12/13/14)"

git add deploy/grafana-provisioning/
git commit -m "feat(deploy): grafana datasource + 4-6 dashboards + ≥6 alert rules (US3 / W-F14)"

git add deploy/nginx/stub_status.conf
git commit -m "feat(deploy): front-nginx stub_status internal location for nginx-exporter scrape (US2 / W-F13)"

# rust-api SHA pin bumps（每 rust-api worktree commit 對應 1 outer SHA pin commit）
git add rust-api
git commit -m "chore(submodule): bump rust-api to <SHA>: <fork commit title>"
# ...重複 8-12 次

# INTEGRATION-CHECKLIST cleanup
git add docs/INTEGRATION-CHECKLIST.md
git commit -m "docs(spec-hygiene): 044 INTEGRATION-CHECKLIST cleanup (FR-017)"

# push 須 user 同意
git push origin 044-observability-and-cleanup-pass
```

### 6.3 Merge 回 default

```bash
# acceptance 全 PASS 後：
git checkout rev1-admin-root
git merge --no-ff 044-observability-and-cleanup-pass -m "Merge feature 044-observability-and-cleanup-pass"
# push 須 user 同意
git push origin rev1-admin-root
```

### 6.4 SHA backfill + push

merge 後拿 outer SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 044 entry 的 `<SHA>` placeholder、small chore commit（per 041/042/043 體例）+ push 須 user 同意。

---

## 收尾 checklist

- [ ] Step 1 rust-api tracing JSON migration 完
- [ ] Step 2 /metrics endpoint + 8 metric pre-declare + 6 active instrument
- [ ] Step 3 outer deploy/ + 7 service + 12 service healthy verify
- [ ] Step 4 US4-US7 4 項 cleanup
- [ ] Step 5 INTEGRATION-CHECKLIST 4 row + 3 row 移除 + 044 entry
- [ ] C-V1~C-V23 全 PASS
- [ ] Step 6.1 rust-api worktree 8-12 commit（user 同意 push）
- [ ] Step 6.2 outer feature branch 多段 commit（user 同意 push）
- [ ] Step 6.3 merge 回 rev1-admin-root（user 同意才 push）
- [ ] Step 6.4 SHA backfill commit + push
- [ ] 通知 user 進入下一 follow-up（P3 F-facade-atomicity-pass 或 base-web id 型別債 sprint）
