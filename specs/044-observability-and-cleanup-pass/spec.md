# Feature Specification: 044 observability-and-cleanup-pass

**Feature Branch**: `044-observability-and-cleanup-pass`
**Created**: 2026-05-24
**Status**: Draft
**Input**: User description: "044 observability-and-cleanup-pass：W-F12/13/14 Phase W deploy P5 三件套 + P2 4 項 cleanup mega-feature。詳見 brainstorm doc `docs/superpowers/044-feature-observability-and-cleanup-pass.md`（已 commit `330bdc5`、含 Q1-Q4 拍板、7 US 對應、Constitution 5/5 PASS、code mocks、acceptance C-V concept 估 23-27 條、5 個 deferred items）。"

**前置文件**：[`docs/superpowers/044-feature-observability-and-cleanup-pass.md`](../../docs/superpowers/044-feature-observability-and-cleanup-pass.md)（brainstorm 設計、Q1-Q4 拍板已敲定）

## Clarifications

### Session 2026-05-24

- Q: Alerting infrastructure → A: Grafana 9+ built-in unified alerting（無新 service、與 datasource 整合、UI 一站式）
- Q: Grafana dashboard 設計風格 → A: 1 master overview + drill-down per component（4-6 dashboard 總量、admin-heavy 場景新手友善）
- Q: US7 status enum 對齊策略 → A: 定義明確 transform layer、wire 用 string 數字 `"1"/"2"` + DB 保持 string 列舉、spec 內明文界定哪些 path 用哪個格式（與既有 W-FW5 / W-FW6 systemManage transform 體例對齊；FR-015 + FR-016 自然滿足）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Operator 對任一服務問題從單一 log 入口可查（Priority: P1）🎯 MVP

整合維運者（人類或 AI）在生產環境或 dev stack 健康下、面對任一服務（rust-api / front-nginx / base-web / postgres / redis 等 12 service）的請求異常或業務 bug 時，可從一個 grafana Loki 入口查所有 service 的結構化 JSON log，並用 `request_id` 跨 log row 與 `sys_operation_log` audit row 對接、不必登入 12 個 container 各自 `docker logs` 對比 timestamps。

**Why this priority**：log 是 observability 三件套的最低共識基礎；對日常 debug、incident response、audit forensic 都是第一入口。W-F12 一旦落地、後續 metrics（W-F13）+ dashboards（W-F14）才能在這個 log 基礎上 enrich。本 user story 同時涵蓋 rust-api `tracing` plain text → JSON formatter migration（log schema 對齊 DESIGN-W §8.1）+ `tower-http TraceLayer` 註入 `request_id` 進 tracing span，使 `tracing::info!` 等 callsite 0 改動就能在 JSON 內含 request_id。

**Independent Test**：dev stack 12 service healthy（含 loki + promtail）下、跑 1 個 admin write trigger（POST /api/role）、然後在 grafana Loki query `{service="rust-api"} | json | request_id != ""` ；預期看到該 request 的 log JSON row 含 request_id、且 psql 查 sys_operation_log 同一個 request_id 兩 row（INTERNAL + HTTP 雙視角）。改前（044 之前）`docker logs rust-api` 是 plain text、無法 grafana / 結構化 query。

**Acceptance Scenarios**：

1. **Given** dev stack 健康（12 service、含 loki + promtail）、Soybean token；**When** POST /api/role → grafana Loki UI 查 `{service="rust-api"} | json` 過去 1 分鐘；**Then** 看到 ≥3 row JSON log（middleware enter / service write / response complete）、每 row 含 `timestamp` / `level` / `service="rust-api"` / `request_id` / `msg`，且 `request_id` 與 psql `SELECT request_id FROM sys_operation_log WHERE ...` 對得起來。
2. **Given** dev stack 健康；**When** rust-api 內 spawn 背景 task（如 042 outbox drainer 處理事件）；**Then** 該 task 的 log JSON 仍含 spawn parent 的 request_id（透過 `.instrument(span)` propagate），不是 "-" 或空。
3. **Given** dev stack 健康；**When** front-nginx receive request；**Then** front-nginx access log 也以 JSON 格式送到 Loki、含 `request_id` header 與 rust-api 對齊（同一個值）。

---

### User Story 2 — Operator 對任一服務的 health/throughput 從單一 metrics 入口可查（Priority: P1）

整合維運者可從 prometheus + grafana 單一入口查 12 service 的 health 與業務 metric（http throughput / latency / audit pipeline / casbin policy / outbox queue depth 等）。本 user story 包含：rust-api `/metrics` endpoint（自暴 prometheus format）+ 3 個 exporter（postgres / redis / nginx）+ 8 個業務 metric 全部 instrument（per DESIGN-W §8.3）。

**Why this priority**：metrics 是「事前發現問題」的能力，比 log 多一層；audit_log_writes_total 停滯（5 分鐘無 increment）會比讀 log 早發現 audit pipeline 故障；outbox_pending_events queue depth 飆升會比讀 sys_audit_outbox 早發現 drainer 跟不上。8 個業務 metric 對齊 DESIGN-W §8.3 既定規格，避免 045+ 再回頭補。

**Independent Test**：dev stack healthy 下、curl rust-api `/metrics` 回 200 + 200+ line prometheus format；prometheus UI targets up；觸發 1 個 audit write（POST /api/role）後 `audit_log_writes_total{operation="Create",entity_type="sys_role"}` counter +1（雙寫 +2）。

**Acceptance Scenarios**：

1. **Given** dev stack healthy；**When** curl rust-api `/metrics`；**Then** 200 OK + prometheus exposition format、含 `http_request_duration_seconds_bucket` 系列、`audit_log_writes_total` / `casbin_enforcement_total` / `outbox_pending_events` 等 8 個業務 metric 名（即使無 traffic 也有 zero series 暴出）。
2. **Given** dev stack；**When** prometheus UI `Status > Targets`；**Then** 7 個 scrape job（rust-api / postgres_exporter / redis_exporter / nginx-exporter / promtail / loki / prometheus self）全 `UP` state。
3. **Given** dev stack；**When** POST /api/role + 2s wait + curl /metrics；**Then** `audit_log_writes_total{operation="Create",entity_type="sys_role"}` 值較 baseline +2（INTERNAL + HTTP 雙視角、042 雙寫）。

---

### User Story 3 — Operator 從預設 dashboard 看整體系統狀態，異常時 alert 主動通知（Priority: P1）

整合維運者打開 grafana（dev 在 `:13000`、prod 走 acme.sh + domain 後 `:443`）、預設 datasource（Loki + Prometheus）+ provisioned dashboards 即可看 12 service 的 health、業務 KPI、log volume 等概況；當某 alert rule 觸發（如 5xx rate > 1%/min、audit pipeline 停滯、outbox queue 飆升）時 alert 主動通知（dev 至少 grafana UI 紅標、prod 走 webhook / email 視 alerting infra 拍板）。

**Why this priority**：dashboards + alerts 是 observability 的「決策 / 應變」層，把 W-F12 log + W-F13 metrics 的原始資料轉成 operator 看得懂的視覺與通知。沒有 dashboard + alert、log + metric 雖然就位但實際無人查、退化為「事後 forensic」用途。

**Independent Test**：dev stack healthy + grafana 啟動完成（health probe OK）後、開 grafana UI `http://127.0.0.1:13000`、使用 provisioned admin password 登入、看 Loki + Prometheus datasource 連線健康、provisioned dashboard 至少 1 個正常渲染、alerting rules 至少 1 個 load 進 grafana。

**Acceptance Scenarios**：

1. **Given** dev stack healthy；**When** 開 grafana UI、登入、看 datasource 列表；**Then** Loki + Prometheus 兩個 datasource 自動載入（無需手動加）且 health check pass。
2. **Given** dev stack；**When** 查 grafana `Dashboards` 列表；**Then** 看到 4-6 個 dashboard 自動 provisioned（1 master overview + 3-5 component drill-down、per Clarifications Q2）。
3. **Given** dev stack；**When** 查 grafana `Alerting > Alert rules`；**Then** ≥6 個 alert rule load（rust-api 5xx rate / audit pipeline 停滯 / outbox queue > 1000 / postgres connection saturation / redis memory / log volume drop）。

> **Alerting infra (per Clarifications Q1)**：採 Grafana 9+ built-in unified alerting（不引入 Prometheus alertmanager service、observability stack 維持 7 service）。alert rule 走 grafana provisioning yaml（`deploy/grafana-provisioning/alerting/`）、notification policy 走 grafana built-in（dev 預設 UI 紅標、prod 走 webhook/email contact point 待 W-F6b 後配置）。
>
> **Dashboard 設計風格 (per Clarifications Q2)**：採 1 master overview + drill-down per component（1 主 dashboard 涵蓋 12 service health + 8 業務 KPI overview、各 component drill-down dashboard 看細項）。估 4-6 dashboard 總量、deploy/grafana-provisioning/dashboards/ 內 JSON 自動 provisioned。

---

### User Story 4 — Audit forensic reader 跨 systemManage path 正確抽 entity_id（Priority: P2）

audit forensic 維運者（或 sys_operation_log 讀者）查特定 entity 修改歷史時、能對任何 path（含 `/systemManage/<verb>/<id>` 與 native `/role/<id>` 兩種 pattern）拿到正確的 entity_id 值。本 user story 修 042-N2：`extract_entity_id_from_url` 對 `/systemManage/deleteMenu/123` 等 path 抽 `deleteMenu` 而非 `123` 的 bug。

**Why this priority**：純 audit row 細節 correctness、不影響 audit pipeline 是否寫入（W-FW6 / 042 都仍寫 row）；只是讓 audit forensic reader 用 `WHERE entity_id = '123'` 等 query 能命中 systemManage path 的 audit row（過去只命中 native path）。042 backlog N2 條目登記。

**Independent Test**：dev stack healthy 下、POST `/api/systemManage/deleteMenu/<某 menu id>` 後跑 SQL `SELECT entity_id FROM sys_operation_log WHERE url LIKE '%deleteMenu%' ORDER BY created_at DESC LIMIT 1`；改前命中 `deleteMenu` 字串、改後命中真實 menu id 數值字串。

**Acceptance Scenarios**：

1. **Given** dev stack；**When** POST `/api/role/<id>` （native path）後 query；**Then** entity_id = `<id>`（保持 042 原行為、不退化）。
2. **Given** dev stack；**When** POST `/api/systemManage/deleteMenu/<id>` 後 query；**Then** entity_id = `<id>`（新行為、修正 042-N2）。

---

### User Story 5 — Audit row reader 看到實值 module_name / description（Priority: P2）

audit forensic 維運者讀 `sys_operation_log` row 時、`module_name` 與 `description` 兩欄含實值（從 entity_type + HTTP method+url 推導）而非 `"TODO"` placeholder。本 user story 修 042-N6（F2.1 留下的 middleware placeholder）。

**Why this priority**：audit row reader 看到 `module_name="TODO"` 會懷疑系統故障；改實值（如 `module_name="sys_role"` / `description="HTTP POST /api/role"`）讓 row 自我描述、無需查 url 推導。

**Independent Test**：dev stack healthy 下、POST `/api/role` 後 query `SELECT module_name, description FROM sys_operation_log WHERE created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds' LIMIT 1`；改前命中 `"TODO"` / `"TODO"`、改後命中 `"sys_role"` / `"HTTP POST /api/role"`（或對齊規格）。

**Acceptance Scenarios**：

1. **Given** dev stack；**When** POST /api/role 後 query；**Then** `module_name`、`description` 均非 `"TODO"`、且符合「實值推導規則」。

---

### User Story 6 — Dev / log reader 不再看到 print! 殘留 debug 訊息（Priority: P2）

開發者跑 rust-api（debug build 或 release build）時、stdout 不再有 pre-existing `print!("user is {:#?}", user)` 的 raw Debug 輸出污染（會 bypass tracing JSON formatter、破壞 Loki ingestion 結構）。本 user story 修 F3-N4：**1 處** production `print!` callsite（`rust-api/server/api/src/admin/sys_user_api.rs:40`）改 `tracing::debug!` 或拿掉（per plan 階段 grep 確認 [research.md R-3](./research.md)，backlog F3-N4 寫「3 處」為 stale 估計、實際 only 1 處 `print!`；其他 `println!` 都在 `#[cfg(test)]` 或 startup CLI 範圍、不會 bypass JSON formatter、合理保留）。

**Why this priority**：純 hygiene、不影響功能。但 W-F12 log JSON 落地後、`print!` 會在 docker stdout 產 non-JSON 行、被 promtail 攝入 Loki 後變 parse 失敗的 garbage row。W-F12 之前可忍、W-F12 之後必須清。

**Independent Test**：dev stack 啟動 rust-api 後跑 `docker compose logs rust-api | grep "user is" | head`；改前命中該 1 處 `print!` 殘留（multi-line Debug 印出）、改後 0 hit。

**Acceptance Scenarios**：

1. **Given** dev stack；**When** 跑會觸發 sys_user_api 該 callsite 的 admin write（如 POST /api/user 或 PUT /api/user/<id>）；**Then** `docker compose logs rust-api | grep "user is" -i` 0 hit。

---

### User Story 7 — Wire data reader 不再被 status enum 混雜模式坑（Priority: P2、out-of-scope errata）

base-web 與 rust-api 間 wire data 對 status enum（user / role status）的表達策略：DB 端 `enabled`/`disabled` 字串、wire 端統一用 string 數字 `"1"`/`"2"`、transform 在 systemManage handler / service 邊界處理（per Clarifications Q3、與既有 W-FW5/W-FW6 體例對齊）。041 N1 backlog 條目登記、本 user story plan 階段 grep 後界定為 **out-of-scope errata**。

**Why this priority**：plan 階段 grep（[research.md R-6](./research.md)）確認 main code paths **0 hit**（rust-api `"1"`/`"2"` literal 0、base-web `status === '1'/'2'` 0）—— W-FW5 / W-FW6 / W-FW8 / 040 等後續 features 已隱式清完 041-N1 backlog 條目「混雜模式」描述的 hits（如有藏在 transform layer 內、不影響 wire 對齊）。**本 feature 0 code 改動**、純登記 errata 留 045 spec-hygiene-pass-3 候選確認。

**Independent Test**：本 user story acceptance 為「grep 重 verify 0 hit + INTEGRATION-CHECKLIST 041-N1 移到 errata 結案」。

**Acceptance Scenarios**：

1. **Given** plan 階段 grep 結果（[research.md R-6](./research.md) 0 hit）；**When** implementer 重跑同樣 grep；**Then** 仍 0 hit、確認狀態未改變。
2. **Given** 本 feature 完成；**When** 查 `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up table；**Then** 041-N1 row 已移除（per FR-017）、`docs/INTEGRATION-CHECKLIST.md` 045 候選 backlog 內登記「041-N1 grep 0 hit 結案、後續 features 若撞 status 混雜再列 spec」errata 字句。

> **Status enum 對齊策略 (per Clarifications Q3 + plan grep)**：採 transform layer + 明文界定。wire 端統一用 string 數字 `"1"`/`"2"`、DB 端保持 string 列舉 `enabled`/`disabled`、transform 在 systemManage handler / service 邊界處理。plan 階段 grep（research.md R-6）確認 main code paths **0 hit**；本 feature 0 改動、登記 errata 結案 → 045 spec-hygiene-pass-3 候選（若後續 features 撞混雜模式再列 spec）。

---

### Edge Cases

- **tracing span spawn `.instrument()` 漏接**：drainer / cleanup job / `tokio::spawn` 路徑若未 `.instrument(parent_span)`、log JSON 的 request_id 會空。所有 `tokio::spawn` callsite 須 grep + 加 `.instrument()`、acceptance 加 1 條 C-V 驗 drainer 處理事件的 log JSON 含 request_id。
- **prometheus disk usage 漸增**：8 業務 metric × 30 day retention × label cardinality 可能 > 10GB。dev 設 7 day retention 緩解。
- **grafana_admin_password 預設不安全**：dev 用簡單 secret file、prod 走 deploy/secrets/ pattern + acme.sh 後 TLS 包裝。
- **observability stack 啟動 30-60s**：dev default on 接受該成本、減少 restart 頻率；prod 同步生效不影響業務 service 啟動順序（observability 為 sidecar pattern）。
- **US7 status enum 真實 hits 數**：plan 階段 grep 結果 = 0 hit（research.md R-6）、本 feature 0 改動、純 errata 結案（per FR-014 + Q3）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：系統 MUST 提供 promtail + Loki log 聚集服務、scrape 所有 12 service 的 docker daemon log、含 service / container 標籤。
- **FR-002**：rust-api MUST 將 `tracing_subscriber::fmt::layer()` 改 `fmt::json()` 並對齊 DESIGN-W §8.1 schema（必要欄 `timestamp` / `level` / `service` / `request_id` / `msg`；可選欄 `actor_user_id` / `route` / `http_status` / `latency_ms` / `error_kind`）。
- **FR-003**：rust-api MUST 在 router 加 `tower_http::trace::TraceLayer` + 自訂 `MakeSpan`、從 axum `RequestId` extension 抽 `request_id` 注入 tracing span attr、使所有 `tracing::*!` callsite 在 JSON 內 inherit `request_id`（callsite 0 改動）。
- **FR-004**：rust-api 內所有 `tokio::spawn` 出去的 task MUST 用 `.instrument(parent_span)` propagate request_id；本 feature MUST 在 plan/tasks 階段 grep + enumerate 所有 spawn callsite、每個都加上 instrument。
- **FR-005**：rust-api MUST 提供 `/metrics` endpoint（prometheus exposition format）、含 8 個業務 metric 全宣告（per DESIGN-W §8.3）、採 **pre-declare-and-defer-instrument** 模式（per plan [research.md R-2/R-11](./research.md)）：
  - **6 metric 立即 instrument**（active counter/gauge 隨 traffic 變動）：`http_request_duration_seconds`（tower-http auto histogram）、`audit_log_writes_total`（audit_log::write_in_txn）、`casbin_enforcement_total`（axum casbin middleware enforce wrapper、callsite implementer 階段 grep 確認）、`casbin_policy_cache_invalidate_total`（notify_casbin_changed）、`outbox_pending_events`（042 drainer fetch_pending）、`cleanup_job_rows_deleted_total`（cleanup binary）
  - **2 metric 宣告 0 series 待補**：`sys_tokens_active`（token store callsite 待 implementer 階段 grep 確認、可能 query `sys_tokens` table）、`backup_completed_total`（backup wrapper 在 W-F15/16 未排程 feature、044 留 dashboard panel placeholder）
- **FR-006**：系統 MUST 提供 prometheus 服務、scrape rust-api 自身 `/metrics`、3 個 exporter（postgres / redis / nginx）以及 loki / promtail / prometheus 自身。
- **FR-007**：系統 MUST 提供 postgres_exporter / redis_exporter / nginx-exporter 3 個 sidecar；front-nginx MUST 暴 internal-only `stub_status` 位置（不對 host 暴露）供 nginx-exporter scrape。
- **FR-008**：系統 MUST 提供 grafana 服務、auto-provision Loki + Prometheus datasource、auto-provision 4-6 個 dashboard（per Clarifications Q2：1 master overview + 3-5 component drill-down）、auto-provision ≥6 個 alerting rule（per Clarifications Q1、走 grafana built-in unified alerting；不引入 Prometheus alertmanager）。
- **FR-009**：alerting rules MUST 至少含：rust-api HTTP 5xx rate > 1%/min、audit_log_writes_total 停滯（5 分鐘無 increment）、outbox_pending_events > 1000、postgres connection saturation > 80%、redis memory > 80%、log volume drop > 50%。
- **FR-010**：observability stack（7 service：loki / promtail / prometheus / grafana / postgres_exporter / redis_exporter / nginx-exporter）在 dev stack 預設啟動（dev default on、Q3 拍板）、prod 走 `--profile observability`。
- **FR-011**：`extract_entity_id_from_url` MUST 對 `/systemManage/<verb>/<id>` path 取 `<id>` 而非 `<verb>`、同時保持 `/role/<id>` 等 native path 行為不變。實際 fn 在 **`rust-api/server/model/src/admin/audit_log.rs:196`**（由 `audit_log::write_in_txn` 呼叫、per [research.md R-4](./research.md)）；hybrid rule：第 1 segment（split('/').get(1)）為 `systemManage` 取 get(3)；否則取 get(2)（對齊既有 split-based 樣式）。
- **FR-012**：`OperationLogContext.module_name` 與 `description` 兩欄 MUST 不再寫 `"TODO"` placeholder、改實值推導（module_name 從 entity_type 取；description 走 `"HTTP {method} {url}"` 對齊 042 既有 fallback）。
- **FR-013**：rust-api 1 處 pre-existing production `print!("user is {:#?}", user)` callsite（**`rust-api/server/api/src/admin/sys_user_api.rs:40`**、per [research.md R-3](./research.md)）MUST 改 `tracing::debug!` 或拿掉、避免 bypass tracing JSON formatter 產 non-JSON garbage line。其他 `println!` 在 `#[cfg(test)]` 或 startup CLI 範圍、不會在 production runtime 出 stdout、合理保留（backlog F3-N4 寫「3 處」為當時估計 stale）。
- **FR-014**：US7 status enum 對齊策略 MUST 採 transform layer + 明文界定（per Clarifications Q3）；plan 階段 grep（[research.md R-6](./research.md)）確認 main code paths **0 hit**；本 feature 0 code 改動、登記 errata 結案、留 045 spec-hygiene-pass-3 候選（若後續 features 撞混雜模式再列 spec）。
- **FR-015**：本 feature MUST 0 base-web 改動（與 W-WEBUI 軌道無關、不觸發 Constitution Principle IV 受管例外）。
- **FR-016**：本 feature MUST 0 schema migration、0 新 entity（observability service 用既有 storage / 第三方 sidecar 自帶 storage）。
- **FR-017**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST 從衍生 follow-up table 移除 042-N2 / 042-N6 / F3-N4 / 041-N1 四 row（US7 視 scope 拍板可能保留 errata）、從規劃中 table 移除 W-F12/W-F13/W-F14 三 row（合進 044）、已完成里程碑加 044 entry、Current Focus 「下一步」指向 P3 F-facade-atomicity-pass 或下個排程。

### Key Entities

本 feature 為 deployment + observability infrastructure feature、無 application data entity（observability stack 用第三方 service 自帶 storage）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、12 service（5 既有 + 7 observability）全部 healthy state、prometheus targets UI 顯示 ≥7 個 scrape job 全 UP。
- **SC-002**：rust-api `docker compose logs rust-api` stdout 100% JSON format（每行 `jq -r .` 可解析、無 plain text 殘留 except panic / startup msg）；含必要欄 5/5 對齊 DESIGN-W §8.1。
- **SC-003**：POST /api/role 後 grafana Loki query `{service="rust-api"} | json | request_id != ""` 在 1 分鐘內含該 request 的 ≥3 row、且該 request_id 與 sys_operation_log 雙視角 row 對得起來。
- **SC-004**：curl rust-api `/metrics` 回 200 OK + prometheus exposition format、含 8 個業務 metric 名全暴（即使 zero traffic 也暴 series；6 active metric 隨 traffic 增、2 declared 0 series 待補 instrument）。
- **SC-005**：POST /api/role + 2s wait 後 `audit_log_writes_total{operation="Create",entity_type="sys_role"}` counter 較 baseline +2（INTERNAL + HTTP 雙視角）。
- **SC-006**：grafana UI 開啟後 Loki + Prometheus 兩個 datasource 自動載入、health check pass、4-6 dashboard 自動 provisioned（per Clarifications Q2）、≥6 alert rule 自動 load（per Clarifications Q1 grafana built-in）。
- **SC-007**：POST `/api/systemManage/deleteMenu/<id>` 後 `SELECT entity_id FROM sys_operation_log` 命中 `<id>` 而非 `<verb>`（US4 / FR-011 PASS）；同時 POST `/api/role/<id>` 後 entity_id 仍 = `<id>`（不退化）。
- **SC-008**：任一 admin write 後 `SELECT module_name, description FROM sys_operation_log` 兩欄無 `"TODO"` 值（US5 / FR-012 PASS）。
- **SC-009**：`docker compose logs rust-api | grep "user is" -i` 0 hit（US6 / FR-013 PASS）。
- **SC-010**：plan 階段 US7 grep 完成（research.md R-6、0 hit）、scope 拍板為「out-of-scope errata 結案」；INTEGRATION-CHECKLIST 衍生 follow-up 移除 041-N1 row + errata 字句新增「041-N1 grep 0 hit 結案、後續 features 若撞 status 混雜再列 spec」。
- **SC-011**：本 feature 完成後 0 base-web 改動（FR-015 verify）、0 schema migration、0 新 entity（FR-016 verify）。
- **SC-012**：完成後 INTEGRATION-CHECKLIST 衍生 follow-up table 從現行 11 row 降至 7 row（移 042-N2 / 042-N6 / F3-N4 / 041-N1）；規劃中 table 從 3 row 降至 0 row（W-F12/W-F13/W-F14 合進 044 結案）；已完成里程碑加 044 entry。
- **SC-013**：所有 `tokio::spawn` callsite 100% 含 `.instrument(span)` 包裹（grep verify），且 drainer 處理 audit event 的 log JSON 含 parent request_id。

## Assumptions

- **dev stack 健康** — 5 既有 service（postgres / redis / rust-api / front-nginx / base-web）healthy、042 audit pipeline 就位、043 spec 已 merge。
- **prod 真實部署留 W-F6b 後** — observability stack 在 prod 啟動仍仰賴真實 domain + TLS cert；本 feature 不解 W-F6b acme.sh 問題、prod acceptance 待 W-F6b 後補。
- **042-N5 dev compose port single-bind 不解** — 本 feature 不修 042-N5；prod 真實 multi-replica 仍待 dev compose 配置 feature 處理。
- **rust-api log 既有 plain text 體例 0 backwards-compat 顧慮** — 044 之前 rust-api log 為 dev / 內部 debug 用、無 downstream consumer 依賴；JSON migration 改動 stdout 格式 100% 接受。
- **8 業務 metric 落點 plan 階段 audit 結果**（per [research.md R-2/R-11](./research.md)）：
  - 6 metric 即時 instrument 點存在（http_request_duration / audit_log_writes / casbin_enforcement / casbin_policy_cache_invalidate / outbox_pending_events / cleanup_job_rows_deleted）；casbin_enforcement_total 真實 axum middleware callsite 留 implementer 階段 grep 確認
  - 2 metric pre-declare 0 series：`sys_tokens_active`（token store callsite implementer 階段 grep / 可能 query sys_tokens table）；`backup_completed_total`（backup wrapper 在 W-F15/16 未排程 feature、044 留 panel placeholder）
- **Constitution v1.4.0 5/5 PASS** — observability 純觀察、不動 enforce / audit / endpoint / base-web；軌道外、預設原則涵蓋；無 amendment 需求。
- **`/speckit-clarify` 已完成** — Session 2026-05-24 拍板 3 Q（alerting infra → grafana built-in / dashboard 設計風格 → 1 master + drill-down / US7 status enum → transform layer + 明文界定 + threshold 5）；spec 內 0 retains clarification 標記、Clarifications § 完整紀錄。
