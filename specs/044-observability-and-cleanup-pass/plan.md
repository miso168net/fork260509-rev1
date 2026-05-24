# Implementation Plan: 044 observability-and-cleanup-pass

**Branch**: `044-observability-and-cleanup-pass` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/044-observability-and-cleanup-pass/spec.md`

## Summary

W-F12 (log)、W-F13 (metrics)、W-F14 (dashboards+alerts) 三件套 + P2 4 項 cleanup（042-N2 / 042-N6 / F3-N4 / 041-N1）bundled mega-feature；對齊 v2 memory 拍板 A2 + Option A 路線、Phase W deploy P5 close-out。

技術 approach（per spec.md + Clarifications Q1-Q3 + brainstorm Q1-Q4）：

- **US1 (W-F12 log)**：promtail + Loki + rust-api `log_tracing_init.rs` `fmt::layer()` → `fmt::json()` + tower-http `TraceLayer` + 自訂 `MakeSpan` 從 axum `RequestId` extension 抽 request_id 注入 tracing span attr；042 `REQUEST_ID_TASK_LOCAL` 並存不動（為 audit path 服務）；DESIGN-W §8.1 JSON schema 對齊（必要 5 + 可選 5 欄）。
- **US2 (W-F13 metrics)**：rust-api `/metrics` endpoint（`metrics` + `metrics-exporter-prometheus` crate）+ prometheus 服務 + 3 個 exporter（postgres / redis / nginx）+ 8 業務 metric 全 instrument（per DESIGN-W §8.3）；front-nginx 加 internal-only `stub_status` location 供 nginx-exporter scrape。
- **US3 (W-F14 dashboards+alerts)**：grafana 服務 + auto-provisioned datasources (Loki+Prometheus) + 4-6 dashboard JSON（1 master + 3-5 component drill-down per Q2）+ ≥6 alerting rules（grafana 9+ built-in unified alerting per Q1、無 alertmanager）。
- **US4 (042-N2)**：`extract_entity_id_from_url` hybrid nth rule（systemManage path → 取 verb 後的 id；native path 保持原行為）。
- **US5 (042-N6)**：`OperationLogContext.module_name` / `description` 改實值推導（從 entity_type / HTTP method+url）。
- **US6 (F3-N4)**：3 處 `print!("user is {:#?}", user)` → `tracing::debug!` 或拿掉。
- **US7 (041-N1, scope-conditional)**：plan 階段 grep 確認 hits ≤5 處 in-scope 修；>5 處 → out-of-scope errata 留 045（per Q3 + FR-014）。

擴展紀律：implementer 階段允許按 041 體例擴展 scope（grep 出鄰近 spec rot 同次拾取），但需 plan 階段登記候選 + 動手前 user 確認 + ≤3 處上限。

## Technical Context

**Language/Version**: Rust 1.75+（rust-api workspace、既有體例）+ Docker Compose 配置 + YAML config files（loki / promtail / prometheus / grafana provisioning）
**Primary Dependencies**:
- 新 rust crate：`metrics` (workspace)、`metrics-exporter-prometheus`、`tracing-appender`（如需 file rotation；多半 stdout-only OK）
- 既有 rust crate：`tracing` (workspace 已有)、`tracing-subscriber` (workspace 已有)、`tower-http` (init crate 已有)
- 第三方 docker image：grafana/loki / grafana/promtail / prom/prometheus / grafana/grafana / prometheuscommunity/postgres-exporter / oliver006/redis_exporter / nginx/nginx-prometheus-exporter
**Storage**:
- Loki：BoltDB shipper + filesystem chunk store（單一 binary mode、small prod ready）
- Prometheus：local TSDB（retention dev 7d / prod 30d）
- Grafana：sqlite（既有 default、provisioning yaml 為主真相）
- **0 application schema migration**（FR-016）
**Testing**: dev stack 12 service healthy-driven manual C-V acceptance；無自動 unit test（spec md + infra 配置、acceptance 由 C-V contracts 覆蓋、per CLAUDE.md §3 紀律對齊「無新純函式測試時由 acceptance 覆蓋」）
**Target Platform**: Linux x86_64 docker container；dev 在 WSL2 + Docker Desktop / prod 在 cloud VM (Ubuntu 22.04+)
**Project Type**: Infrastructure feature（deployment + observability）+ rust application instrumentation；軌道外 rust-api + outer
**Performance Goals**:
- log JSON write overhead < 0.5ms / event（既有 tracing 經驗值）
- `/metrics` endpoint render < 50ms p95
- prometheus scrape interval 15s（dev/prod 對等）
- grafana dashboard panel render < 2s
**Constraints**:
- 0 base-web 改動（FR-015）
- 0 schema migration、0 新 application entity、0 新 rust workspace dep beyond observability crates（FR-016）
- prometheus retention dev 7d / prod 30d（edge case 紀錄）
- dev 12 service 啟動 30-60s + 1-2GB RAM 額外（接受、Q3 拍板）
- implementer 擴展 ≤3 處（per 041 體例）
**Scale/Scope**: 
- 7 個新 observability service（loki / promtail / prometheus / grafana / postgres_exporter / redis_exporter / nginx-exporter）
- rust-api 改動 ~25-35 處（tracing JSON + /metrics + 8 metric instrument + 4 P2 cleanup）
- outer ~15-25 個新 deploy/ config 檔 + docker-compose.observability.yml
- 估 50-80 tasks（同 042 mega-feature 規模）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | observability 純觀察、不動 Casbin enforce / policy / endpoint；rust `/metrics` endpoint 為 internal scrape 用、不暴 host（per docker-compose internal network、host 預設不 expose）。0 影響。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 既有 audit pipeline 0 改動；US2 加 `audit_log_writes_total` counter 在 `audit_log::write_in_txn` 內、純 metric instrument、不改 audit 寫入語意；US5 placeholder fix 改 `OperationLogContext.module_name` 寫實值（**反向強化**：audit row 更可信）；US6 `print!` 清理避免 tracing JSON formatter 被 bypass。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | + 7 observability service 全在 `observability` network、隔離 internal；rust-api 加 `/metrics` route 為 self-instrumentation、不引 service-to-service HTTP；prometheus scrape rust-api 等同 read-only metric pull（既有 §架構約束 §Observability 已明文允許）。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-015 verify）；軌道**外**、預設原則涵蓋；**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment、**不**需更新 `DESIGN-W-WEBUI` 文件。同 039 / 041 / 042 / 043 模式。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；observability 純 rust + 第三方 service、強化 DESIGN-B 形態；架構約束 §Observability 已明文 promtail/Loki/prometheus/grafana 為「必要 stack」、044 是該條 directive 的具體 spec-kit 落地。 | ✅ PASS |

**架構約束** 同步檢查：
- §Observability「promtail → Loki + grafana（logs）+ prometheus + grafana（metrics）為**必要**stack；prod 必啟，dev 可選」→ 044 對齊（Q3 拍板 dev default on、屬「dev 可選」的選擇）。
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式，必要欄位含 timestamp / level / service / request_id / msg」→ 044 FR-002 直接對齊。
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 044 US2 8 metric 中 cleanup_job_rows_deleted_total / backup_completed_total / outbox_pending_events 對應這 3 個 job。

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/044-observability-and-cleanup-pass/
├── spec.md                # /speckit-specify + /speckit-clarify 產出
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0 grep + 8 metric 落點 + spawn callsite enumerate
├── data-model.md          # Phase 1：observability stack 服務拓樸 + 8 metric label spec + JSON log schema + entity-like infrastructure design
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V23+ acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（rust-api migration step + outer deploy/ 新檔 step + dev stack 12 service 啟動）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道外 rust-api + outer、0 base-web 改動：

```text
rust-api/                                            # worktree、多段 commit
├── server/
│   ├── Cargo.toml                                   # workspace + metrics-related dep add
│   ├── initialize/
│   │   ├── Cargo.toml                               # + metrics-exporter-prometheus dep
│   │   ├── src/
│   │   │   ├── log_tracing_init.rs                  # fmt::layer() → fmt::json() + 對齊 §8.1 schema（US1、FR-002）
│   │   │   ├── metrics_init.rs                      # 新檔：PrometheusBuilder install + 8 metric pre-declare（US2、FR-005）
│   │   │   └── router_initialization.rs             # + tower-http TraceLayer + MakeSpan（US1、FR-003）+ mount /metrics route（US2、FR-005）
│   ├── core/
│   │   └── src/
│   │       ├── web/
│   │       │   ├── operation_log.rs                 # extract_entity_id_from_url hybrid rule（US4、FR-011）+ OperationLogContext.module_name/description 實值推導（US5、FR-012）
│   │       │   └── casbin_*.rs                      # + casbin_enforcement_total counter instrument（US2 / metric 3）
│   │   └── (tokio::spawn callsite per research.md R-7 enumerate)
│   ├── model/
│   │   └── src/admin/audit_log.rs                   # + audit_log_writes_total counter instrument（US2 / metric 2）
│   ├── global/
│   │   ├── src/casbin_notify.rs                     # + casbin_policy_cache_invalidate_total counter（US2 / metric 4）
│   │   └── src/audit_publisher.rs                   # + outbox_pending_events gauge（US2 / metric 5）
│   ├── api/src/admin/
│   │   ├── sys_user_api.rs                          # F3-N4 print! 清理 1 處（US6、FR-013）
│   │   └── sys_menu_api.rs                          # F3-N4 print! 清理 1 處（US6、FR-013）
│   ├── service/src/admin/
│   │   └── sys_authorization_service.rs             # F3-N4 print! 清理 1 處（US6、FR-013）+ status enum 路徑 review（US7 scope-conditional、FR-014）
│   └── (US7 status enum 其他 hits 視 research.md R-6 grep 結果而定)

outer/                                               # rev1-admin-root、單段 commit per logical 變動
├── docker-compose.observability.yml                 # 新檔：7 service profile observability + dev override
├── docker-compose.dev.yml                           # 加 include observability.yml（Q3 拍板 dev default on）
├── docker-compose.prod.yml                          # 加 --profile observability 啟用條件
├── deploy/
│   ├── loki-config.yml                              # 新檔：single-binary + filesystem chunks + 30d retention
│   ├── promtail-config.yml                          # 新檔：docker daemon scrape + service/container label
│   ├── prometheus.yml                               # 新檔：scrape configs + alerting rule refs
│   ├── prometheus-rules/                            # 新目錄：alerting rule yamls（≥6 rules per FR-009）
│   │   └── *.yml
│   ├── grafana-provisioning/                        # 新目錄
│   │   ├── datasources/
│   │   │   ├── loki.yml
│   │   │   └── prometheus.yml
│   │   ├── dashboards/
│   │   │   ├── dashboards.yml                       # provisioning manifest
│   │   │   ├── master-overview.json                 # 1 master（per Q2）
│   │   │   └── *.json                               # 3-5 component drill-down
│   │   └── alerting/                                # built-in unified alerting yamls（per Q1）
│   │       └── *.yml
│   ├── nginx/
│   │   └── stub_status.conf                         # front-nginx internal-only stub_status（per FR-007）
│   └── secrets/                                     # 既存目錄
│       ├── grafana_admin_password.txt               # 新檔（dev / prod 各自 deploy/secrets/ 下管理、gitignored）
│       └── postgres_exporter_dsn.txt                # 新檔（同上）
├── docs/INTEGRATION-CHECKLIST.md                    # 移 follow-up 4 row + 規劃中 3 row + 加 044 entry（FR-017）
└── CLAUDE.md                                        # SPECKIT marker 區更新指向 044 plan.md
```

**Structure Decision**：
- **rust-api worktree commits**：多段（estimated 8-12 commits、按 US topic 分）
- **outer rev1-admin-root commits**：多段（compose / deploy/ / grafana provisioning / SHA pin bumps / INTEGRATION-CHECKLIST cleanup / SHA backfill）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**rust-api worktree commits（estimated 8-12 個）**：

| Topic | est commits | files touched |
|---|---|---|
| US1 tracing JSON + TraceLayer | 1-2 | log_tracing_init.rs + router_initialization.rs |
| US2 /metrics endpoint + 8 metric instrument | 3-4 | metrics_init.rs (new) + audit_log.rs + casbin_*.rs + audit_publisher.rs + token store / cleanup / backup metric callsites |
| US4 url parsing fix | 1 | operation_log.rs |
| US5 placeholder fix | 1 | operation_log.rs（合併 US4 可能在同 commit） |
| US6 print! 清理 | 1 | 3 處 callsite |
| US7 status enum（若 in-scope） | 0-1 | scope-conditional |

**Outer rev1-admin-root commits（estimated 13-19 個）**：

| Topic | est commits | files touched |
|---|---|---|
| docker-compose.observability.yml + 7 service config | 1 | compose + 7 service `deploy/` configs |
| nginx stub_status + nginx-exporter sidecar | 1 | nginx config + exporter compose |
| grafana provisioning (datasources + dashboards + alerts) | 1-2 | grafana-provisioning/ |
| SHA pin bumps（每 rust-api commit 對應 1 outer pin commit） | 8-12 | base-web/rust-api gitlink |
| INTEGRATION-CHECKLIST cleanup | 1 | docs/INTEGRATION-CHECKLIST.md |
| SHA backfill (post-merge) | 1 | docs/INTEGRATION-CHECKLIST.md |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：rust-api 既有 `log_tracing_init.rs` 體例（fmt::layer plain text + tracing_log::LogTracer + tracing_error::ErrorLayer）；JSON migration 方式（fmt::json() + with_target / with_current_span / with_span_list 微調）+ tower-http TraceLayer 接入 axum RequestId extension 抽 span attr 方式
- **R-2**：8 業務 metric 落點精確 enumerate（file:line + function name）：
  - `http_request_duration_seconds` → tower-http auto histogram
  - `audit_log_writes_total` → `server/model/src/admin/audit_log.rs::write_in_txn`
  - `casbin_enforcement_total` → casbin enforce wrapper grep
  - `casbin_policy_cache_invalidate_total` → `server/global/src/casbin_notify.rs::notify_casbin_changed`
  - `outbox_pending_events` → 042 drainer fetch_pending count
  - `sys_tokens_active` → token store poll
  - `cleanup_job_rows_deleted_total` → cleanup job stats（既有？需 grep verify）
  - `backup_completed_total` → backup wrapper（既有？需 grep verify）
- **R-3**：`print!("user is {:#?}", user)` 3 處 file:line grep（per F3-N4）
- **R-4**：`extract_entity_id_from_url` 既有 code + url 樣本表（test cases for hybrid rule）
- **R-5**：`OperationLogContext.module_name`/`description` "TODO" placeholder 既有 code
- **R-6**：status enum DB `enabled`/`disabled` vs wire `"1"`/`"2"` 混雜 path grep（per FR-014、決定 US7 in-scope / out-of-scope）
- **R-7**：`tokio::spawn` callsite enumerate + `.instrument(span)` propagation 模式（per FR-004）
- **R-8**：既有 `deploy/secrets/` pattern（檢視 redis_password / postgres password 等既有 secret file 體例、套用到 grafana_admin_password / postgres_exporter_dsn）
- **R-9**：front-nginx config 既有 server block + 是否已有 stub_status pattern
- **R-10**：rust-api 既有是否有 `metrics-exporter-prometheus` 或同類 crate dep（grep verify）
- **R-11**：DESIGN-W §8.3 8 個 metric 在 rev1 既有 service 是否有 trivial mismatch（label / type / 命名）；本 plan 採用 spec 內表格、若有需要 plan/implementer 階段 micro-adjust

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：observability stack 服務拓樸 + 8 metric label spec + JSON log schema + entity-like infrastructure design + 7 service docker compose 配對
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V23+ acceptance commands（log / metrics / dashboards / alerts / US4-US7 cleanup grep verify）
- [`quickstart.md`](./quickstart.md)：implementer 5-step 操作手冊（rust-api JSON migration + outer deploy/ config + dev 12 service 啟動 + provisioning verify + commit shape）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）
- contracts/verification-commands.md 引入 23+ 個 C-V、全為 acceptance 驗證手段、不引入新 functional path / 新 schema
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律）
- INTEGRATION-CHECKLIST cleanup（FR-017）為 plan 內已界定的後續、無爭議

**Constitution Check post-Phase 1：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 50-80 tasks（mega-feature 規模、對齊 042 體例）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
