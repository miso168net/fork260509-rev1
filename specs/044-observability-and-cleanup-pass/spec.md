# Feature Specification: 044 observability-and-cleanup-pass

**Feature Branch**: `044-observability-and-cleanup-pass`
**Created**: 2026-05-24
**Status**: Draft
**Input**: User description: "044 observability-and-cleanup-pass：W-F12/13/14 Phase W deploy P5 三件套 + P2 4 項 cleanup mega-feature。詳見 brainstorm doc `docs/superpowers/044-feature-observability-and-cleanup-pass.md`（已 commit `330bdc5`、含 Q1-Q4 拍板、7 US 對應、Constitution 5/5 PASS、code mocks、acceptance C-V concept 估 23-27 條、5 個 deferred items）。"

**前置文件**：[`docs/superpowers/044-feature-observability-and-cleanup-pass.md`](../../docs/superpowers/044-feature-observability-and-cleanup-pass.md)（brainstorm 設計、Q1-Q4 拍板已敲定）

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
2. **Given** dev stack；**When** 查 grafana `Dashboards` 列表；**Then** 至少 1 個 dashboard 自動 provisioned（具體個數依 [NEEDS CLARIFICATION] 拍板）。
3. **Given** dev stack；**When** 查 grafana `Alerting > Alert rules`；**Then** ≥6 個 alert rule load（rust-api 5xx rate / audit pipeline 停滯 / outbox queue > 1000 / postgres connection saturation / redis memory / log volume drop）。

> [NEEDS CLARIFICATION: alerting infra 走 Prometheus alertmanager（新第 8 個 observability service、route alert 到 webhook/email）還是 Grafana 9+ built-in unified alerting（無新 service、UI 直觀）？]
>
> [NEEDS CLARIFICATION: grafana dashboard 設計風格走「1 master overview + drill-down per component」（少 dashboard 但多 panel、新手友善）還是「per-component standalone」（多 dashboard 但每個專注、SRE 友善）？]

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

開發者跑 rust-api（debug build 或 release build）時、stdout 不再有 pre-existing `print!("user is {:#?}", user)` 的 raw Debug 輸出污染（會 bypass tracing JSON formatter、破壞 Loki ingestion 結構）。本 user story 修 F3-N4：3 處 callsite 改 `tracing::debug!` 或拿掉。

**Why this priority**：純 hygiene、不影響功能。但 W-F12 log JSON 落地後、`print!` 會在 docker stdout 產 non-JSON 行、被 promtail 攝入 Loki 後變 parse 失敗的 garbage row。W-F12 之前可忍、W-F12 之後必須清。

**Independent Test**：dev stack 啟動 rust-api 後跑 `docker compose logs rust-api | grep "user is" | head`；改前命中 `print!` 殘留（multi-line Debug 印出）、改後 0 hit。

**Acceptance Scenarios**：

1. **Given** dev stack；**When** 跑全 admin write 流程（POST /api/role / POST /api/user / POST /authorization/assign_routes）；**Then** `docker compose logs rust-api | grep "user is" -i` 0 hit。

---

### User Story 7 — Wire data reader 不再被 status enum 混雜模式坑（Priority: P2、scope-conditional）

base-web 與 rust-api 間 wire data 對 status enum（user / role status）的表達一致：DB 端 `enabled`/`disabled` 字串、wire 端統一表達策略（per [NEEDS CLARIFICATION]）。041 N1 backlog 條目登記、本 user story 視 grep 結果界定 scope。

**Why this priority**：041-N1 觸發前 DB vs wire 混雜模式仍可運作（base-web 動態型容忍）、但 W-FW5/F8 後某些 path status 為 string `"1"`/`"2"`、其他 path 仍 `"enabled"`/`"disabled"`，後續 feature 可能撞坑。044 順手 grep 釐清、scope 視真實 hit 數界定。

**Independent Test**：plan 階段 grep `rust-api/server/` + `base-web/src/` 的 status 字串 / 列舉 / 比較 callsite；若 hits ≤5 處 → in-scope 修；若 hits >10 處 → out-of-scope、登記 errata 留 045 spec-hygiene-pass-3 候選；hits 6-10 處依 plan 階段拍板。

**Acceptance Scenarios**：

1. **Given** plan 階段 grep 完成、scope 拍板；**When** 跑 grep verify；**Then** 對齊「拍板 scope 內 hits 全 fix、out-of-scope hits 已登記 errata」狀態。

> [NEEDS CLARIFICATION: US7 status enum 對齊策略 — 是「全 wire 改 `enabled`/`disabled` 字串對齊 DB」（reader 一致、需改 wire endpoint）、還是「全 DB 改 BIGINT/SMALLINT 對齊 wire `1/2`」（schema migration、cascade 範圍大）、還是「定義明確 transform layer、wire 用 string 數字 `"1"/"2"` + DB 保持 string 列舉」（admin/systemManage path 已採此體例）？]

---

### Edge Cases

- **tracing span spawn `.instrument()` 漏接**：drainer / cleanup job / `tokio::spawn` 路徑若未 `.instrument(parent_span)`、log JSON 的 request_id 會空。所有 `tokio::spawn` callsite 須 grep + 加 `.instrument()`、acceptance 加 1 條 C-V 驗 drainer 處理事件的 log JSON 含 request_id。
- **prometheus disk usage 漸增**：8 業務 metric × 30 day retention × label cardinality 可能 > 10GB。dev 設 7 day retention 緩解。
- **grafana_admin_password 預設不安全**：dev 用簡單 secret file、prod 走 deploy/secrets/ pattern + acme.sh 後 TLS 包裝。
- **observability stack 啟動 30-60s**：dev default on 接受該成本、減少 restart 頻率；prod 同步生效不影響業務 service 啟動順序（observability 為 sidecar pattern）。
- **US7 status enum 真實 hits 數 > 10**：scope 退到 errata 登記、不進本 spec 改動、避免 044 scope creep。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：系統 MUST 提供 promtail + Loki log 聚集服務、scrape 所有 12 service 的 docker daemon log、含 service / container 標籤。
- **FR-002**：rust-api MUST 將 `tracing_subscriber::fmt::layer()` 改 `fmt::json()` 並對齊 DESIGN-W §8.1 schema（必要欄 `timestamp` / `level` / `service` / `request_id` / `msg`；可選欄 `actor_user_id` / `route` / `http_status` / `latency_ms` / `error_kind`）。
- **FR-003**：rust-api MUST 在 router 加 `tower_http::trace::TraceLayer` + 自訂 `MakeSpan`、從 axum `RequestId` extension 抽 `request_id` 注入 tracing span attr、使所有 `tracing::*!` callsite 在 JSON 內 inherit `request_id`（callsite 0 改動）。
- **FR-004**：rust-api 內所有 `tokio::spawn` 出去的 task MUST 用 `.instrument(parent_span)` propagate request_id；本 feature MUST 在 plan/tasks 階段 grep + enumerate 所有 spawn callsite、每個都加上 instrument。
- **FR-005**：rust-api MUST 提供 `/metrics` endpoint（prometheus exposition format）、含 8 個業務 metric 全 instrument（per DESIGN-W §8.3）：`http_request_duration_seconds`、`audit_log_writes_total`、`casbin_enforcement_total`、`casbin_policy_cache_invalidate_total`、`outbox_pending_events`、`sys_tokens_active`、`cleanup_job_rows_deleted_total`、`backup_completed_total`。
- **FR-006**：系統 MUST 提供 prometheus 服務、scrape rust-api 自身 `/metrics`、3 個 exporter（postgres / redis / nginx）以及 loki / promtail / prometheus 自身。
- **FR-007**：系統 MUST 提供 postgres_exporter / redis_exporter / nginx-exporter 3 個 sidecar；front-nginx MUST 暴 internal-only `stub_status` 位置（不對 host 暴露）供 nginx-exporter scrape。
- **FR-008**：系統 MUST 提供 grafana 服務、auto-provision Loki + Prometheus datasource、auto-provision ≥1 個 dashboard、auto-provision ≥6 個 alerting rule。
- **FR-009**：alerting rules MUST 至少含：rust-api HTTP 5xx rate > 1%/min、audit_log_writes_total 停滯（5 分鐘無 increment）、outbox_pending_events > 1000、postgres connection saturation > 80%、redis memory > 80%、log volume drop > 50%。
- **FR-010**：observability stack（7 service：loki / promtail / prometheus / grafana / postgres_exporter / redis_exporter / nginx-exporter）在 dev stack 預設啟動（dev default on、Q3 拍板）、prod 走 `--profile observability`。
- **FR-011**：`extract_entity_id_from_url` MUST 對 `/systemManage/<verb>/<id>` path 取 `<id>` 而非 `<verb>`、同時保持 `/role/<id>` 等 native path 行為不變（hybrid rule：第 1 segment 為 `systemManage` 取 nth(2)；否則 nth(1)、依 filter empty segment 後計算）。
- **FR-012**：`OperationLogContext.module_name` 與 `description` 兩欄 MUST 不再寫 `"TODO"` placeholder、改實值推導（module_name 從 entity_type 取；description 走 `"HTTP {method} {url}"` 對齊 042 既有 fallback）。
- **FR-013**：rust-api 3 處 pre-existing `print!("user is {:#?}", user)` callsite（sys_user_api / sys_menu_api / sys_authorization_service）MUST 改 `tracing::debug!` 或拿掉、避免 bypass tracing JSON formatter 產 non-JSON garbage line。
- **FR-014**：US7 status enum 對齊 scope MUST 在 plan 階段 grep 後界定（in-scope hits 全 fix；out-of-scope 登記 errata 留下一個 hygiene pass）。
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
- **SC-004**：curl rust-api `/metrics` 回 200 OK + prometheus exposition format、含 8 個業務 metric 名（即使 zero traffic 也暴 zero series）。
- **SC-005**：POST /api/role + 2s wait 後 `audit_log_writes_total{operation="Create",entity_type="sys_role"}` counter 較 baseline +2（INTERNAL + HTTP 雙視角）。
- **SC-006**：grafana UI 開啟後 Loki + Prometheus 兩個 datasource 自動載入、health check pass、≥1 dashboard 自動 provisioned、≥6 alert rule 自動 load。
- **SC-007**：POST `/api/systemManage/deleteMenu/<id>` 後 `SELECT entity_id FROM sys_operation_log` 命中 `<id>` 而非 `<verb>`（US4 / FR-011 PASS）；同時 POST `/api/role/<id>` 後 entity_id 仍 = `<id>`（不退化）。
- **SC-008**：任一 admin write 後 `SELECT module_name, description FROM sys_operation_log` 兩欄無 `"TODO"` 值（US5 / FR-012 PASS）。
- **SC-009**：`docker compose logs rust-api | grep "user is" -i` 0 hit（US6 / FR-013 PASS）。
- **SC-010**：plan 階段 US7 grep 完成、scope 拍板紀錄入 plan.md「Implementer-stage Expansion」表；本 spec 內 hits 全 fix 後 0 retains（in-scope 處）+ errata 登記完整（out-of-scope 處）。
- **SC-011**：本 feature 完成後 0 base-web 改動（FR-015 verify）、0 schema migration、0 新 entity（FR-016 verify）。
- **SC-012**：完成後 INTEGRATION-CHECKLIST 衍生 follow-up table 從現行 11 row 降至 7 row（移 042-N2 / 042-N6 / F3-N4 / 041-N1）；規劃中 table 從 3 row 降至 0 row（W-F12/W-F13/W-F14 合進 044 結案）；已完成里程碑加 044 entry。
- **SC-013**：所有 `tokio::spawn` callsite 100% 含 `.instrument(span)` 包裹（grep verify），且 drainer 處理 audit event 的 log JSON 含 parent request_id。

## Assumptions

- **dev stack 健康** — 5 既有 service（postgres / redis / rust-api / front-nginx / base-web）healthy、042 audit pipeline 就位、043 spec 已 merge。
- **prod 真實部署留 W-F6b 後** — observability stack 在 prod 啟動仍仰賴真實 domain + TLS cert；本 feature 不解 W-F6b acme.sh 問題、prod acceptance 待 W-F6b 後補。
- **042-N5 dev compose port single-bind 不解** — 本 feature 不修 042-N5；prod 真實 multi-replica 仍待 dev compose 配置 feature 處理。
- **rust-api log 既有 plain text 體例 0 backwards-compat 顧慮** — 044 之前 rust-api log 為 dev / 內部 debug 用、無 downstream consumer 依賴；JSON migration 改動 stdout 格式 100% 接受。
- **8 業務 metric 既有 instrument 點假設既有** — `audit_log::write_in_txn` / casbin enforce wrapper / 042 drainer / token store / cleanup job / backup wrapper 等都已有可加 counter / gauge 的 code position；若某 metric 落點不存在（如 backup wrapper 從未實作）→ plan 階段重評是否 defer。
- **Constitution v1.4.0 5/5 PASS** — observability 純觀察、不動 enforce / audit / endpoint / base-web；軌道外、預設原則涵蓋；無 amendment 需求。
- **`/speckit-clarify` 必跑** — 本 spec 含 3 個 NEEDS CLARIFICATION（alerting infra / dashboard 設計風格 / US7 status enum scope）。
