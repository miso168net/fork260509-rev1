# Feature Specification: 046 spec-hygiene-pass-3

**Feature Branch**: `046-spec-hygiene-pass-3`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "046 spec-hygiene-pass-3 — bundle 045-N2 / 044-N1 / 042-N1 / docker-compose footer 4 follow-up 作 cleanup pass。詳見 brainstorm doc `docs/superpowers/046-feature-spec-hygiene-pass-3.md`（已 commit `c87ab42` 推 origin、含 7 section user-approved + 5 US + Constitution 5/5 PASS + 8 C-V acceptance 概覽 + Approach A 對齊 041/043 體例 + implementer-stage expansion budget ≤3 + 042-N1 採 strategy (a) sleep+poll + 保留 #[ignore] 改註解 + ~4-5hr 落地預估）。"

**前置文件**：[`docs/superpowers/046-feature-spec-hygiene-pass-3.md`](../../docs/superpowers/046-feature-spec-hygiene-pass-3.md)（brainstorm 設計、7 section 已 user-approved）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Developer 讀 045 facade design docs 看到對齊實 code 的 erratum（Priority: P1）

維護 rust-api 程式碼的 developer（人類或 AI implementer）讀 `specs/045-facade-atomicity-pass/data-model.md §E1.2` 時，看到的 `upsert_with_audit` 業務判定邏輯與 tracing macro 語法應對齊實 code（commit `de7bc0b`/`8e79e20`），而不是 brainstorm 階段推測但 implementer 已修正的字面版本。

**Why this priority**：spec docs 是後續 implementer / reviewer / auditor 的權威參考來源；spec rot 會誤導未來實作。045 落地時實機驗證 brainstorm doc 的兩處字面是 false（whole-Model `==` + tracing `target:` const 限制），spec docs 必須對齊真實的修法。

**Independent Test**：grep `specs/045-facade-atomicity-pass/data-model.md`：(a) `before_row == endpoint` whole-Model `==` 0 hit + `same_business` / `6 業務欄位 semantic compare` ≥1 hit、UPDATE 路徑 preserve `before_row.created_at` + `display_id` 描述 ≥1 hit；(b) `target: target` 0 hit、`target = target` structured field ≥1 hit。

**Acceptance Scenarios**：

1. **Given** 045 data-model.md §E1.2 line 56 區段；**When** grep `before_row == endpoint`；**Then** 0 hit（whole-Model `==` 已從 spec docs 移除）。
2. **Given** 045 data-model.md §E1.2 同段；**When** grep `same_business` 或「6 業務欄位 semantic compare」；**Then** ≥1 hit（semantic compare 描述就位）。
3. **Given** 045 data-model.md §E1.2 line 114 區段；**When** grep `target: target`；**Then** 0 hit（macro `target:` 字面已移除）。
4. **Given** 同段；**When** grep `target = target`；**Then** ≥1 hit（structured field 用法描述就位）。

---

### User Story 2 — Developer 跑 045 contracts/verification-commands.md C-V 命令時對齊實際 endpoint / schema（Priority: P1）

未來 developer / auditor 跑 `specs/045-facade-atomicity-pass/contracts/verification-commands.md` 內的 C-V acceptance 命令時，應該命令一次跑成功、不需要逐個 debug schema column / endpoint path / body shape / HTTP verb 差異。045 acceptance 階段實際撞到 5 處 spec rot（C-V2 schema column + C-V4-V6 endpoint + C-V8 body shape + C-V10 HTTP verb），spec md 必須對齊實 code。

**Why this priority**：spec docs 是 acceptance reproducibility 的關鍵；spec rot 使 C-V 命令成為「需自我修正才能跑」的偽 acceptance、降低 spec 工具價值。

**Independent Test**：grep `specs/045-facade-atomicity-pass/contracts/verification-commands.md`：(a) `entity_type='sys_endpoint'` 0 hit、`module_name='sys_endpoint'` ≥1 hit；(b) `operation IN ('Insert','Update')` 0 hit、`operation IN ('INSERT','UPDATE')` ≥1 hit；(c) `/api/accessKey` 0 hit、`/api/access-key` ≥1 hit；(d) `"username":` (lowercase) 在 addUser 段 0 hit、`"userName":` ≥1 hit；(e) `PUT.*updateUser` 0 hit、`POST.*updateUser` ≥1 hit。

**Acceptance Scenarios**：

1. **Given** 045 contracts/verification-commands.md C-V2；**When** grep schema column；**Then** `entity_type` 不出現、`module_name` 出現。
2. **Given** 同 C-V2；**When** grep operation case；**Then** `INSERT/UPDATE` uppercase、不再 PascalCase。
3. **Given** 045 contracts/verification-commands.md C-V4/V5/V6；**When** grep endpoint path；**Then** `/api/access-key`（hyphen）而非 `/api/accessKey`、create body 含 `domain` 欄。
4. **Given** 045 contracts/verification-commands.md C-V8/V9；**When** grep body shape；**Then** `userName`（camelCase）+ `status: "1"`（systemManage transform 約定）+ `userRoles: ["ROLE_..."]`（role code）。
5. **Given** 045 contracts/verification-commands.md C-V10；**When** grep HTTP verb + URL path；**Then** `POST /systemManage/updateUser`（不含 path param、display_id 在 body `id`）。

---

### User Story 3 — Operator 從 Loki 看到的 rust-api log 全為合法 JSON、無 `assign_permission` 殘留 garbage row（Priority: P1）

W-F12 落地後 rust-api stdout 由 tracing fmt::json formatter 接管、所有業務 log row 為 single-line JSON、可由 promtail → Loki 完整 ingest + 結構化 query。`sys_authorization_service.rs:140/154/168` 3 處 `println!` 直接寫 stdout、bypass formatter、產 non-JSON garbage row（破 Loki ingestion parser / 污染 production log）。本 US 移除 3 處 production `println!` 改 `tracing::debug!` structured field 模式。

**Why this priority**：Production 環境的 observability stack 完整性；W-F12 是必要 infra（per Constitution 架構約束 §結構化 log），任何 bypass 都是 silent regression。044 落地時 R-3 漏抓本 3 處、登記 044-N1、現於本 feature 結案。

**Independent Test**：grep `rust-api/server/service/src/admin/sys_authorization_service.rs`：`println!` 0 hit、`tracing::debug!` ≥3 hit；dev stack 跑 `assign_permission` 流程後從 Loki query 該 service 的 log entries 應全為 valid JSON、含 structured field（`existing_permissions` / `new_policies` / `existing_policies`）。

**Acceptance Scenarios**：

1. **Given** sys_authorization_service.rs；**When** grep `println!`；**Then** 0 hit。
2. **Given** 同檔；**When** grep `tracing::debug!`；**Then** ≥3 hit（替換到 3 處）。
3. **Given** dev stack（rust-api + Loki 跑著）；**When** 觸發任一 assign_permission 操作（如 `POST /systemManage/assignRoleEndpoints`）後 query Loki `{service="rust-api"} |= "assign_permission"`；**Then** 回的 log entries 全為 valid JSON、含 structured field key（`existing_permissions` / `new_policies` / `existing_policies`）。

---

### User Story 4 — Developer 跑 `cargo test --ignored` 看到 12 個 audit/soft-delete ignored test PASS（Priority: P1）🎯 MVP

`rust-api/server/model/tests/{audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration}.rs` 共 12 個 `#[ignore]` integration test 在 042 outbox refactor 後失效（`write_in_txn` 後立即 `SELECT FROM sys_operation_log` row 0、assert fail），目前無法跑通。本 US 抽共用 helper `tests/common/audit_pipeline.rs::wait_for_audit_row(db, predicate_sql, timeout_ms)`、12 callsite 改用 helper、保留 `#[ignore]` 標註改註解明示需 dev stack drainer 跑著。改完跑 `cargo test --test <each> -- --ignored` 應 12/12 PASS。

**Why this priority**：本 feature 內 effort 最大 (12 test 改寫 + 1 new helper file)、value 也最高（恢復既有 audit + soft-delete pipeline 的 integration test coverage、Constitution II reinforce）。MVP-worthy 因為「測試恢復」是 verifiable / reproducible quality gate。

**Independent Test**：dev stack 12 service healthy（含 rust-api drainer 跑著）+ `TEST_DATABASE_URL` 設好 + 4 個 test file 分別跑 `cargo test --test <name> -- --ignored --nocapture`、輸出 `test result: ok. N passed; 0 failed; N ignored`（`N passed` = file 內 ignored test 數量、改後可跑 + PASS）。

**Acceptance Scenarios**：

1. **Given** 新加 `tests/common/audit_pipeline.rs`；**When** grep `pub async fn wait_for_audit_row`；**Then** 1 hit（helper signature 就位）。
2. **Given** 4 test file；**When** grep `wait_for_audit_row|wait_for_audit_count`；**Then** ≥6 callsite hits（僅 polling-needs 測試 migrate；audit_basics 3 個 audit_snapshot 純單測 + audit_transaction_rollback 2 個 rollback absence 測試 + soft_delete_audit_integration 2 個 not-found 測試**保留原 query pattern**、helper 對「assert 不出現」/ 純 in-memory 函式無語意）。
3. **Given** 同 4 test file；**When** grep `#\[ignore = "requires dev stack drainer running"`；**Then** ≥12 hit（註解更新就位）。
4. **Given** dev stack drainer 跑著 + `TEST_DATABASE_URL` 設好；**When** `cargo test --test audit_basics -- --ignored` + 同 audit_http_middleware / audit_transaction_rollback / soft_delete_audit_integration；**Then** 4 file 合計 12 test PASS、0 fail。
5. **Given** 同前置；**When** 任一 test 跑超過 500ms timeout；**Then** helper 拋 `timeout` error、test fail（明示 budget 撞牆、不 silent hang）。

---

### User Story 5 — Operator 讀 docker-compose.yml 檔頭看到的服務數對齊現實 12 service（Priority: P2）

`docker-compose.yml` 檔頭註解（line ~4）說「8 service stack」，但 044 落地後 dev stack 實際 12 service（5 既有 + 7 obs）。Operator 翻檔頭時應該看到對齊現實的服務數量描述。

**Why this priority**：純註解 trivial 修正、不影響任何 runtime / build 行為；體例對齊 spec hygiene。

**Independent Test**：grep `docker-compose.yml`：`# 8 service stack` 0 hit、`# 12 service stack` 或同等服務數量描述 ≥1 hit。

**Acceptance Scenarios**：

1. **Given** docker-compose.yml；**When** grep `^# 8 service stack`；**Then** 0 hit。
2. **Given** 同檔；**When** grep `主 stack 8 service|12 service|observability\.yml`；**Then** ≥2 hit（含主檔 scope 8 service 描述 + observability.yml overlay 引用 + dev 12 service 合計、per [contracts C-V7](./contracts/verification-commands.md)）。

---

### Edge Cases

- **US4 dev stack drainer 暫停 / 慢**：`wait_for_audit_row` 預設 500ms budget；若 drainer 卡死 / sleep_interval 被改大 / dev stack 重 load → helper timeout、test fail（明示 budget 撞牆）。Operator 應先排查 drainer 健康（C-V1 dev stack ps + log query）再重跑。
- **US4 同 test 多 helper call 共享 budget**：每個 helper call 各自獨立 500ms budget（不累計、不共享）；若一 test 需驗多 row，第 2 個 helper call 從新 deadline 起算。
- **US3 grep `println!` 漏看 cfg(test) / dev-only**：本 feature 只清 `sys_authorization_service.rs` 內 production code path 的 3 處；其他檔案 cfg(test) / startup CLI 用 println 不在本 feature scope（per 044 已驗）。
- **US1/US2 spec docs erratum 副作用**：本 feature 是改 `specs/045-...` 的 docs；改後 045 文件 SHA 變、但 045 已 merge、INTEGRATION-CHECKLIST 045 entry 不需重簽（spec docs erratum 屬正常維護、與里程碑 SHA 無關）。
- **US5 docker-compose 註解 grep 命中 stale 多處**：若 `docker-compose.yml` 內除檔頭外其他位置也有 `8 service` 殘留 → implementer-stage expansion 拾取（per ≤3 budget），不擴 US5 scope。
- **042-N1 helper budget 暴露 drainer p99 issue**：若 12 test 中有任一持續撞 timeout（不只偶發），暴露的可能是 drainer 真實 latency issue（非 test 問題）；報為 046-N2 follow-up 並考慮放寬 budget 至 1s+ 或補 progressive backoff。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`specs/045-facade-atomicity-pass/data-model.md §E1.2` line 56 區段 MUST 改寫 `Some(before_row) if before_row == endpoint → noop` whole-Model `==` 為 `same_business` 6 業務欄位 semantic compare 描述（`path/method/action/resource/controller/summary`），且 UPDATE 路徑文字 MUST 明示「preserve `before_row.created_at` + `before_row.display_id`、`Set` only 6 業務 column + `updated_at`」。
- **FR-002**：`specs/045-facade-atomicity-pass/data-model.md §E1.2` line 114 區段 MUST 改寫 `tracing::warn!(target: target, …)` 為 `tracing::warn!(target = target, …)` structured field 形式；附 1-2 行 rationale（E0435 / `target:` 需 `&'static str` const / structured field 序列化 `target=…` 仍命中 C-V grep pattern）。
- **FR-003**：`specs/045-facade-atomicity-pass/contracts/verification-commands.md` C-V2 query MUST 改：`entity_type` column → `module_name` column；`operation IN ('Insert','Update')` → `operation IN ('INSERT','UPDATE')`。
- **FR-004**：`specs/045-facade-atomicity-pass/contracts/verification-commands.md` C-V4/V5/V6 access_key endpoint MUST 改：base path `/api/accessKey` → `/api/access-key`；create body MUST 加 `"domain":"dev"`（or equiv）。
- **FR-005**：`specs/045-facade-atomicity-pass/contracts/verification-commands.md` C-V8/V9 addUser body MUST 改：field name `username` → `userName`；status enum `"enabled"` → `"1"`（systemManage transform 約定）；userRoles type `[<i64 display_id>]` → `["ROLE_..."]`（Vec<String> role code）。
- **FR-006**：`specs/045-facade-atomicity-pass/contracts/verification-commands.md` C-V10 updateUser MUST 改：HTTP verb `PUT` → `POST`；URL `/systemManage/updateUser/{display_id}` → `/systemManage/updateUser`（無 path param、display_id 在 body `id`）。
- **FR-007**：`rust-api/server/service/src/admin/sys_authorization_service.rs` lines 140/154/168 MUST 移除 3 處 `println!("…: {:?}", var)` 並改為 `tracing::debug!(?var, "assign_permission: <name>")` structured field 形式。
- **FR-008**：System MUST 新增 `rust-api/server/model/tests/common/audit_pipeline.rs` 模組、提供 closure-based 輪詢 helper（per [plan data-model §E1.1](./data-model.md) + [research R-2](./research.md) refinement）：`pub async fn wait_for_audit_row<F, Fut>(find_fn: F, timeout_ms: u64) -> Result<sys_operation_log::Model, String>`（輪詢 closure 直到回 `Ok(Some(model))` 或 timeout）+ 變體 `pub async fn wait_for_audit_count<F, Fut>(count_fn: F, min_count: u64, timeout_ms: u64) -> Result<u64, String>`（HTTP middleware 多 row 場景）；輪詢 interval 50ms；timeout 撞牆回 `Err(format!("timeout {timeout_ms}ms waiting for ..."))`。Signature 採 closure-based 而非 raw SQL string 因實際 ignored test 用 Sea-ORM `Entity::find().one()` pattern、closure 更貼 type-safe 體例（per research R-2.2 拍板）。
- **FR-009**：`rust-api/server/model/tests/common/mod.rs` MUST 加 `pub mod audit_pipeline;` 暴 helper 給其他 test file。
- **FR-010**：4 個 test file（`audit_basics.rs` / `audit_http_middleware.rs` / `audit_transaction_rollback.rs` / `soft_delete_audit_integration.rs`）內共 12 個 `#[ignore = "requires real postgres + migration up"]` test 標註 MUST 改為 `#[ignore = "requires dev stack drainer running (audit outbox → sys_operation_log async pipeline)"]`（含不依賴 drainer 的純單測 / absence 測試、保持註解一致）；test body 內**等待 audit row 出現的** `sys_operation_log::Entity::find()...one()` / `count()` pattern MUST 改用 helper `wait_for_audit_row(closure, 500)` / `wait_for_audit_count(closure, min, 500)`（per data-model §E1.3 closure-based form）；**保留原 query pattern 不動**的情境：(a) audit_snapshot 純 in-memory 單測（audit_basics Scenarios 7/8/9）—— 不 query DB、helper 不適用；(b) rollback / not-found absence 測試（audit_transaction_rollback 2 + soft_delete_audit_integration Scenarios 1/2）—— assert `count == 0`、helper poll until appear 對「assert 不出現」無語意。落地後 helper callsite ≥6（audit_basics 2 + audit_http_middleware 3 + soft_delete_audit_integration 1）。
- **FR-011**：`docker-compose.yml` line 4 區段 MUST 改寫 `# 8 service stack:...` 為描述「12 service stack（dev）」並補上 044 加入的 7 obs service 名稱（promtail / Loki / prometheus / grafana / postgres_exporter / redis_exporter / nginx-exporter）。
- **FR-012**：本 feature MUST 0 base-web 改動（與 W-WEBUI 軌道無關、不觸發 Constitution Principle IV 受管例外）。
- **FR-013**：本 feature MUST 0 schema migration、0 新 application entity、0 新 workspace cargo dep、0 新 redis channel、0 新 metric pre-declare（純 cleanup pass）。
- **FR-014**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST 從衍生 follow-up table 移除 045-N2 + 044-N1 + 042-N1 三 row、已完成里程碑加 046 entry、Current Focus「下一步」改向後續 backlog（047 sandbox-protect-route-fix 為首要 + base-web sprint）。
- **FR-015**：implementer-stage expansion 拾取上限 base **≤ 3 處**；user 拍板可加大、需於 commit message body 明示拍板原委 + budget enlargement 計數；候選由 Phase 0 research grep 後拍板；超限（無 user 拍板）拒絕並登記 047+ follow-up（per 041/043 體例）。**Note**：此為 policy constraint（由 executing-plans subagent dispatcher / controller enforce）、不對應 buildable task；plan / tasks 階段不主動列任何 expansion 候選為 task，僅 implementer subagent grep 階段觸發 + user 確認後手動 enforce 上限。

> **2026-05-25 retro footnote（050 sprint 補 retro）**：046 sprint US4 implementer-stage expansion 實際 18 sites（17 display_id ActiveModel/Model field + 1 home_route_name）+ dev-dep `tokio "time"` feature flag 為 pre-existing E0063 build-gate fix、user 拍板加大、屬本 generalized wording 首次行使。

### Key Entities

本 feature 為 spec docs erratum + rust-api code refactor + test helper 新加、無 application data entity（不動 DB schema）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、12 service（5 既有 + 7 observability）全 healthy state；rust-api 啟動 + drainer 跑著（接 044/045 baseline、不退化）。
- **SC-002**：`specs/045-facade-atomicity-pass/data-model.md §E1.2` 2 處 erratum 全清：grep `before_row == endpoint` + `target: target` 雙 0 hit + grep `same_business` + `target = target` 雙 ≥1 hit。
- **SC-003**：`specs/045-facade-atomicity-pass/contracts/verification-commands.md` 5 處 spec rot 全清：grep `entity_type='sys_endpoint'` + `/api/accessKey` + `"username":` (addUser段內) + `PUT.*updateUser` + `operation IN ('Insert','Update')` 全 0 hit；對應正確形 grep 全 ≥1 hit。
- **SC-004**：`rust-api/server/service/src/admin/sys_authorization_service.rs` 0 production `println!`、≥3 `tracing::debug!` structured field；dev stack 跑後 Loki query `{service="rust-api"} |= "assign_permission"` 全為 valid JSON line。
- **SC-005**：`rust-api/server/model/tests/common/audit_pipeline.rs` 新檔存在含 `pub async fn wait_for_audit_row` signature；4 test file 內 ≥6 個 callsite 使用 helper（僅 polling-needs 測試 migrate、`audit_basics 2 + audit_http_middleware 3 + soft_delete_audit_integration 1 = 6`；audit_transaction_rollback 2 個 rollback absence 測試 + audit_basics 3 個 audit_snapshot 純單測**保留原 query pattern 不動**）；`#[ignore = "requires dev stack drainer running…"]` 註解 ≥12 hit（全 12 個 `#[ignore]` 標註統一更新、保持一致）。
- **SC-006**：dev stack drainer 跑著 + `TEST_DATABASE_URL` 設好時、跑 `cargo test --test {audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration} -- --ignored` 全 12 test PASS、0 fail、平均 < 500ms timeout budget。
- **SC-007**：`docker-compose.yml` 檔頭 `^# 8 service stack` 0 hit、12 service 描述 ≥1 hit。
- **SC-008**：本 feature 完成後 0 base-web 改動（FR-012 verify）、0 schema migration、0 新 entity、0 新 workspace dep（FR-013 verify）。
- **SC-009**：完成後 INTEGRATION-CHECKLIST 衍生 follow-up table 從現行 6 row（後 045）降至 3 row（移 045-N2 / 044-N1 / 042-N1）；已完成里程碑加 046 entry。

## Assumptions

- **dev stack 健康** — 12 service healthy（5 既有 + 7 observability、044 已落地）+ drainer 真實跑著（默認 `drainer_sleep_interval_ms=50ms`、`batch_size=100`）。
- **045 落地完整性** — `specs/045-facade-atomicity-pass/` 已存在且 merge 完整；本 feature 的 spec md erratum 改的是 045 已有檔案、不重建 045 spec。
- **042 outbox pipeline 不動** — `sys_audit_outbox` 表 + drainer + Redis Stream `audit:events` 全保留；本 feature US4 helper 是**驗證**既有 pipeline 行為而非改它。
- **044 W-F12 fmt::json formatter 不動** — `tracing-subscriber::fmt::json()` 既有設定不改；US3 `tracing::debug!` 走既有 formatter、自動產 single-line JSON log row + structured field。
- **041 / 043 體例已驗證** — Two precedents: 041 spec-hygiene-pass-1 (R4 + F3-N5)、043 spec-hygiene-pass-2 (042-N3 + R5 + 041-N2)；本 feature 沿用 bundled cleanup pass 模式、軌道外 spec md + rust-api 小修、implementer-stage expansion ≤3 處。
- **042-N1 test fix strategy (a)** — User 2026-05-25 拍板採 in-test sleep + poll sys_operation_log（vs strategy b 改查 sys_audit_outbox / strategy c in-test spawn drainer）；helper 預設 500ms budget；保留 `#[ignore]` 標註、改註解。
- **046 不擴 047 / base-web 軌道** — 045-N1 sandbox protect_route 根因留 047 獨立 feature；base-web TS id 型別債留獨立 sprint。
- **brainstorm 階段 7 section 拍板** — Session 2026-05-25 user-approved scope（5 US）+ approach A（per-US commits + shared helper + budget ≤3）+ acceptance（8 C-V）+ commit shape + INTEGRATION-CHECKLIST cleanup；spec 內 0 retains clarification 標記、brainstorm doc § 完整紀錄。
- **expansion budget ≤3 enforcement** — implementer plan 階段 grep 確認候選 + user 確認後拾取；超限 → 拒絕並登記 047+；041 / 043 precedent 平均擴 1-3 處、未發生 scope creep 災難。
