---
description: "Task list for 050 spec-hygiene-pass-4"
---

# Tasks: 050 spec-hygiene-pass-4

**Input**: Design documents from `/specs/050-spec-hygiene-pass-4/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 sprint 為 spec hygiene + impl fix + infra add + governance dynamic 行使 feature、無新純函式邏輯、**無新 unit test**（per spec.md FR-003~009 wiring/shape 對映 + acceptance C-V matrix cover；對齊 041/043/046 spec-hygiene-pass + 049 體例：wiring/shape feature 由 acceptance C-V 系列 cover）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。

**Organization**：依 spec.md 2 user story（US1 = Phase 0 governance / US2 = Phase 1+2+3 impl bundled）+ Setup（baseline check）+ Polish 分 phase；US1 + US2 同 spec 但**不同 commit**（US1 落 outer commit 1、US2 落 rust-api worktree commit + outer infra commit + base-web Dockerfile commit + 2 SHA pin commit）。Phase 2 Foundational 跳過。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story（Setup / Foundational / Polish 無 story 標籤）
- 每 task 含 exact file path 與具體動作

**Same-file `[P]` 紀律**：US2 內 rust-api 4 issues bundled 同 commit、跨 6 file（per data-model §E2.7 / commit shape）；不同 file 可邏輯並行（[P]）、同 file 序列；executing-plans subagent dispatcher **MUST** 對同檔 task 序列化（per file sequential edit、避 race condition / Edit tool old_string 失效）。

**SDD「先合法化、再執行」紀律**（per spec FR-011）：T002~T005 為 Phase 0 prerequisite（governance restructure 整套）、必須**先**完成才能進 Phase 4 US2（rust-api impl 等改動需 DESIGN §4.4.3 dynamic 授權就位 + 046 spec FR-015 amend 紀律就位才合法）。

---

## Phase 1: Setup (Baseline verification)

**Purpose**：確認 dev stack baseline 健康、為 sprint 後續 verify 提供基準。

- [ ] T001 確認 dev stack baseline 健康：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`、`$PC ps --format "table {{.Service}}\t{{.Status}}"`、expect 12 service Up（接 049 baseline、本 sprint 將補第 13 service pushgateway）+ rust-api drainer log 跑著 + base-web worktree HEAD = `f6efe906`。對應 SC-001 baseline、per [contracts C-V1](./contracts/verification-commands.md)。

**Checkpoint**：baseline confirmed、可進入 Phase 3 US1 governance restructure。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：本 sprint 2 user story 為跨 commit boundary 設計（US1 outer commit 1 / US2 跨 rust-api + base-web + outer infra 多 commit）、無跨 story 共用 foundational 設施（governance restructure 與 rust-api/infra impl 為兩個獨立子系統的工作）。Phase 2 跳過。

*(no tasks)*

---

## Phase 3: User Story 1 — Governance restructure（Priority: P1）🎯 MVP

**Goal**：DESIGN-W-BASE-WEB.md §4.4.3 050 entry add（dynamic 文件權威首次行使、TS-DepGraph-Hygiene 軌道授權就位、無 Constitution amendment）+ 046 spec.md FR-015 wording generalized amend + retro footnote + 044 spec.md FR-005 route label polish (optional)；maintainer 開新 DESIGN §4.4.3 看到 050 sprint 取得 dynamic 授權、046 FR-015 已 reconcile 為 generalized expansion budget。

**Independent Test**：grep `^### §4\.4\.3` 命中 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥1 + grep `050 spec-hygiene-pass-4` `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥1 + grep `user 拍板可加大` `specs/046-spec-hygiene-pass-3/spec.md` ≥1 + grep `050 sprint 補 retro` `specs/046-spec-hygiene-pass-3/spec.md` ≥1。

### Implementation for User Story 1

- [ ] T002 [US1] 加 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.3 050 sprint entry：~25 line edit、加在 §4.4.2 049 entry 之後、§4.5 與其他軌道邊界 之前；含 scope 描述（軌道內 049-R1 + 6 issues 摘要）+ trigger（post-merge code review 衍生 follow-up 結案載體）+ acceptance（C-V1~C-V10 全 PASS）+ spec ref（`specs/050-spec-hygiene-pass-4/`）+ commit SHA placeholder（`<TBD post-merge>`）+ 軌道授權說明（dynamic 行使首次、對齊 W-FW9 體例）。per [data-model §E1.1](./data-model.md) + [research R-4.2](./research.md)。對應 FR-001。
- [ ] T003 [US1] 改 `specs/046-spec-hygiene-pass-3/spec.md` FR-015 wording：~5 line edit；FR-015 wording 改為「base ≤ 3 處；user 拍板可加大、需於 commit message body 明示拍板原委 + budget enlargement 計數」+ 加 2026-05-25 retro footnote 紀 046 sprint US4 expansion 18 sites 為首次行使（per generalized wording）。per [data-model §E1.2](./data-model.md) + [research R-5.2](./research.md)。對應 FR-002。
- [ ] T004 [US1] (optional、per FR-008 MAY) 改 `specs/044-observability-and-cleanup-pass/spec.md` FR-005：~2 line edit；route label 描述補「為 axum template path、含 path params placeholder」。per [data-model §E1.3](./data-model.md)。對應 FR-008。可拾棄（MAY、不影響 acceptance）。
- [ ] T005 [US1] outer commit 1（Phase 0 整體 governance amendment）：`git add docs/INTEGRATION-DESIGN-W-BASE-WEB.md specs/046-spec-hygiene-pass-3/spec.md specs/044-observability-and-cleanup-pass/spec.md && git commit`。commit message 對齊 [quickstart Step 1.5](./quickstart.md) 範本。Depends on T002 + T003 + (optional T004)。對應 [CLAUDE.md §4.1](../../CLAUDE.md) 外層專屬檔 commit 紀律。

**Checkpoint**：US1 完成 —— DESIGN §4.4.3 050 entry + 046 spec FR-015 amend + retro footnote 全落地；軌道 governance dynamic 行使就位、SDD「先合法化、再執行」紀律滿足、Phase 4 US2 rust-api/infra 改動現可合法進行。**MVP 達成**（governance restructure 為 verifiable evidence、不含實作改動）。

---

## Phase 4: User Story 2 — 6 issues impl bundled（Priority: P1）

**Goal**：036-R1 sys_menu selective merge (`Option<Option<T>>` double-option) + 037-R1 Casbin ptype='g' defensive UPDATE + audit g_rules_updated_count + GeneralUser deny C-V + 044-R1 install prometheus pushgateway service (v1.10.0) + cleanup binary recorder + scrape job + 044-R2 axum MatchedPath route template + 049-R1 Dockerfile strict isolation 紀律 comment polish；developer/operator 看 rust-api + cleanup + base-web Dockerfile + dev stack 13 service 確認 6 issues 全 fix、acceptance C-V 全綠。

**Independent Test**：(a) curl partial update menu + psql 前後對比 → 3 nullable field preserve；(b) mock 插 g rule + curl rename role + psql → g rule v1 已 sync；GeneralUser curl POST /role → 403；(c) cleanup binary 跑一次 + curl pushgateway/prom → cleanup_job series ≥7；(d) curl 多 endpoint + curl prom → route label template path；(e) grep base-web/Dockerfile → strict isolation 紀律 keyword 命中、nodeLinker: hoisted 0 hit。

### Phase 4a: rust-api bundled impl

- [ ] T006 [US2] Phase 1 開始前 spike (036-R1 + 044-R2)：(a) `cd rust-api/server/model && cargo build -p server-model` confirm baseline pass、寫 test struct with `Option<Option<JsonValue>>` 確認 serde compat；(b) `grep -n "MatchedPath\|apply_layers\|TraceLayer" rust-api/server/core/src/web/operation_log.rs` 確認既有 layer 順序、確認 MatchedPath extractor 在 OperationLogLayer 可 extract（innermost 已 mount per 042）。per [research R-1.2 + R-3](./research.md)。Spike 結果不對應 commit、屬 implementer prep 確認可行性。Depends on T005（Phase 0 完成）。
- [ ] T007 [P] [US2] 改 `rust-api/server/model/src/admin/input/sys_menu.rs` (036-R1 DTO)：3 nullable field（`query` / `buttons` / `fixed_index_in_tab`）改 `Option<Option<T>>` double-option + `#[serde(default, skip_serializing_if = "Option::is_none")]` attrs；不動其他 field。per [data-model §E2.1](./data-model.md) + [research R-1.2](./research.md)。對應 FR-003。Fallback：若 spike 撞 serde 問題、降級 update mask（`Vec<String> fields_to_clear`）pattern。Depends on T006。
- [ ] T008 [P] [US2] 改 `rust-api/server/service/src/admin/sys_menu_service.rs` (036-R1 selective merge logic)：`update_menu_for_systemmanage` handler 改 selective update logic、3 nullable field 各 3 match arm（`None` = NotSet / `Some(None)` = Set(None) / `Some(Some(v))` = Set(Some(v))）；既有 audit 路徑無變（`audit_snapshot` 自動涵蓋 before/after）。per [data-model §E2.2](./data-model.md) + [research R-1.2](./research.md)。對應 FR-003。Depends on T007（DTO shape 先就位）。
- [ ] T009 [P] [US2] 改 `rust-api/server/service/src/admin/sys_role_service.rs` (037-R1 ptype='g' defensive UPDATE + audit)：`update_role` txn 內、既有 `UPDATE casbin_rule SET v0=$1 WHERE ptype='p' AND v0=$2` 後加 `UPDATE casbin_rule SET v1=$1 WHERE ptype='g' AND v1=$2`（idempotent on empty set）；audit_log payload MUST 加 `g_rules_updated_count` 數值欄（per Clarifications Q2）。per [data-model §E2.3](./data-model.md)。對應 FR-004。Depends on T006。
- [ ] T010 [P] [US2] 改 `rust-api/server/core/src/web/operation_log.rs` (044-R2 MatchedPath)：記錄 `http_request_duration_seconds` histogram 處改用 `req.extensions().get::<axum::extract::MatchedPath>()` 取 route template；fallback `"unmatched"` 避免 cardinality leak；引入 axum import 若必要。per [data-model §E2.4](./data-model.md) + [research R-3](./research.md)。對應 FR-007。Depends on T006（layer 順序 spike confirm）。
- [ ] T011 [P] [US2] 改 `rust-api/server/cleanup/Cargo.toml` (044-R1 feature flag)：`metrics-exporter-prometheus` dep 加 features = ["push-gateway"]（per-crate enable、不引新 workspace dep）。per [data-model §E2.6](./data-model.md) + [research R-2.2](./research.md)。對應 FR-005。Depends on T006。
- [ ] T012 [US2] 改 `rust-api/server/cleanup/src/main.rs` (044-R1 pushgateway recorder install + on-exit flush)：加 `install_pushgateway_recorder()` fn（`PrometheusBuilder::new().with_push_gateway(...)` 配 background 10s interval push）+ main 內呼叫 + on-exit flush（5 sec sleep fallback 若 crate 無 flush API）；env var `PUSHGATEWAY_URL` default `http://pushgateway:9091`。per [data-model §E2.5](./data-model.md) + [research R-2.3](./research.md)。對應 FR-005。Depends on T011（feature flag enable）。
- [ ] T013 [US2] 本機 `cargo check --all-features` + `cargo clippy --all-features --no-deps` (rust-api worktree)：cd rust-api && cargo check && cargo clippy；確認 4 issues bundled 改動 0 error 0 warning（new）。Depends on T008 + T009 + T010 + T012。對應 build sanity。
- [ ] T014 [US2] rust-api worktree commit 1（bundled 4 issues、單 commit）：`cd rust-api && git add server/model/src/admin/input/sys_menu.rs server/service/src/admin/sys_menu_service.rs server/service/src/admin/sys_role_service.rs server/core/src/web/operation_log.rs server/cleanup/src/main.rs server/cleanup/Cargo.toml && git commit`。commit message 對齊 [quickstart Step 2.7](./quickstart.md) 範本（feat 標 050 + 4 issues 明細 + Clarifications Q2 reference）。Depends on T013。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T015 [US2] push rust-api origin **（須 user 同意）**：`cd rust-api && git push origin rev1-admin-rust-api`。Depends on T014。對應 [CLAUDE.md §5](../../CLAUDE.md)。

### Phase 4b: Infra + base-web Dockerfile

- [ ] T016 [P] [US2] 改 `docker-compose.observability.yml` (044-R1 pushgateway service)：加 `pushgateway` service block（image `prom/pushgateway:v1.10.0` per Clarifications Q1、port 9091:9091、healthcheck `curl -fsS http://localhost:9091/-/healthy`、network alias `pushgateway`、restart unless-stopped）；加在既有 prometheus service block 之後。per [data-model §E3.1](./data-model.md) + [research R-2.4](./research.md)。對應 FR-006。Depends on T015（rust-api push 後、SHA pin 前可平行做）。
- [ ] T017 [P] [US2] 改 `deploy/prometheus.yml` (044-R1 scrape job)：加 scrape job `pushgateway`（target `pushgateway:9091`、interval 15s、`honor_labels: true` 紀律保留 cleanup binary push 自定 instance/job label）。per [data-model §E3.2](./data-model.md) + [research R-2.5](./research.md)。對應 FR-006。Depends on T015（同 T016 平行）。
- [ ] T018 [P] [US2] (optional、per FR-006 MAY) 改 `deploy/grafana-provisioning/dashboards/*.json` (044-R1 panel polish)：對應 `cleanup_job_rows_deleted_total` panel 描述移除「no data」placeholder 註解。0-5 line edit、視 既有 dashboard 內容。對應 FR-006 MAY。Depends on T015。
- [ ] T019 [P] [US2] 改 `base-web/Dockerfile` (049-R1 line 35-42 comment polish)：line 35-42 8 行 stale block 整段 replace 為新 wording（per spec FR-009 inline wording 範本）；line 33-34「Deps-first COPY layer + BuildKit cache mount」preserve。per [data-model §E3.4](./data-model.md)。對應 FR-009。Depends on T015（rust-api push 後可平行 base-web 改）。
- [ ] T020 [US2] base-web worktree commit 1（單 commit、軌道內 TS-DepGraph-Hygiene §4.4.3）：`cd base-web && git add Dockerfile && git commit`。commit message 對齊 [quickstart Step 3.4](./quickstart.md) 範本（style 標 049-R1 + TS-DepGraph-Hygiene 軌道 dynamic 行使首次 + DESIGN §4.4.3 ref）。Depends on T019。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T021 [US2] push base-web origin **（須 user 同意）**：`cd base-web && git push origin rev1-admin-base-web`。Depends on T020。對應 [CLAUDE.md §5](../../CLAUDE.md)。

### Phase 4c: Outer Phase 2 commit + dev stack restart + impl-side acceptance

- [ ] T022 [US2] outer commit 2（Phase 2 infra）：`git add docker-compose.observability.yml deploy/prometheus.yml` + (optional T018) `deploy/grafana-provisioning/dashboards/*.json` + commit。commit message 對齊 [quickstart Step 3.6](./quickstart.md) 範本（feat 標 050 pushgateway infra + Clarifications Q1 ref + 13 service 升級）。Depends on T016 + T017。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T023 [US2] dev stack restart + pushgateway service 啟動 + verify healthy：`export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"`、`$PCO up -d pushgateway` + `sleep 10` + `$PCO ps --format "{{.Service}}: {{.Status}}" | grep pushgateway`、expect `Up X seconds (healthy)`。Depends on T022。對應 SC-001 13 service healthy。
- [ ] T024 [US2] docker rebuild rust-api image + restart：`docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3` + `$PCO up -d --force-recreate --no-deps rust-api` + `sleep 10`、verify rust-api `Up (healthy)`。Depends on T023。對應 SC-001 baseline、per [contracts C-V1](./contracts/verification-commands.md)。
- [ ] T025 [US2] 觸發 cleanup binary 跑一次 + verify pushgateway 收 + prometheus scrape 看 series：`docker compose exec rust-api /app/cleanup` + `sleep 5` + `curl -s http://127.0.0.1:9091/metrics | grep -E "^cleanup_job_rows_deleted_total"` + `curl -s "http://127.0.0.1:9090/api/v1/query?query=cleanup_job_rows_deleted_total" | jq '.data.result | length'`、expect ≥7 series。Depends on T024。對應 SC-004、per [contracts C-V4](./contracts/verification-commands.md)。

**Checkpoint**：US2 Phase 4a + 4b + 4c 完成 —— rust-api worktree commit + base-web worktree commit + outer infra commit 全落地；pushgateway healthy、cleanup_job series 出現；待 Phase 5 SHA pin + acceptance final 結案。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：outer SHA pin（base-web + rust-api 2 個 gitlink bump）+ INTEGRATION-CHECKLIST cleanup（8 R-row + 050 milestone）+ acceptance C-V1~C-V10 final + push outer feature branch + merge + SHA backfill。

- [ ] T026 outer commit 3 — base-web SHA pin bump：`BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)`、`git add base-web`、`git commit -m "chore(submodule): bump base-web 到 ${BASE_WEB_SHA} — 050 049-R1 Dockerfile comment polish"`。per [quickstart Step 4.1](./quickstart.md)。Depends on T021 完成。對應 [CLAUDE.md §4.1](../../CLAUDE.md)。
- [ ] T027 outer commit 4 — rust-api SHA pin bump：`RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)`、`git add rust-api`、`git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 050 bundled 4 issues (036-R1 / 037-R1 / 044-R1 / 044-R2)"`。per [quickstart Step 4.2](./quickstart.md)。Depends on T015 完成。
- [ ] T028 [P] C-V2 partial update verify（036-R1）：curl POST `/systemManage/updateMenu` body 只送部分 field（不送 query/buttons/fixedIndexInTab）+ psql `SELECT query, buttons, fixed_index_in_tab FROM sys_menu WHERE id=...` 確認值保持為 before_row。Depends on T024（rust-api restart）。對應 SC-002、per [contracts C-V2](./contracts/verification-commands.md)。
- [ ] T029 [P] C-V3 037-R1 grouping rule sync + GeneralUser deny acceptance：建臨時 role + mock 插 g rule via psql + curl rename + 確認 g rule v1 sync + audit_log payload 含 `g_rules_updated_count: 1` + GeneralUser curl POST `/systemManage/updateRole` 拿 403 (Casbin deny)。Depends on T024。對應 SC-003、per [contracts C-V3](./contracts/verification-commands.md)。
- [ ] T030 [P] C-V5 route label template verify (044-R2)：curl 多 endpoint（`/route/auth-route/1` `/role/auth-route/2`）+ curl prom `/api/v1/query?query=http_request_duration_seconds_count` + jq `[.data.result[] | .metric.route] | sort | unique`、expect 含 template path（`/route/auth-route/:roleId` 或 `/route/auth-route/{role_id}`）、無 raw numeric ID。Depends on T024。對應 SC-005、per [contracts C-V5](./contracts/verification-commands.md)。
- [ ] T031 [P] C-V6 spec hygiene amend verify：grep `user 拍板可加大` `specs/046-spec-hygiene-pass-3/spec.md` ≥1 + grep `050 sprint 補 retro` ≥1 + grep `046 entry budget enlargement` INTEGRATION-CHECKLIST footnote ≥1。Depends on T005（outer commit 1）。對應 SC-006、per [contracts C-V6](./contracts/verification-commands.md)。
- [ ] T032 [P] C-V7 049-R1 Dockerfile polish verify：grep `nodeLinker: hoisted` `base-web/Dockerfile` 0 hit + grep `shamefully-hoist=true` 0 hit + grep `strict isolation` ≥1 + grep `packageManager field` ≥1 + verify line 33-34 preserved。Depends on T020（base-web commit）。對應 SC-007、per [contracts C-V7](./contracts/verification-commands.md)。
- [ ] T033 outer commit 5 — INTEGRATION-CHECKLIST 8 R-row cleanup + 050 milestone + Current Focus update + CLAUDE.md SPECKIT marker idle：(a) 衍生 follow-up table 移 6 R-row（036/037/044-R1/044-R2/046/049-R1）+ 加 footnote「5 Important + 1 Polish 結案 via 050」；(b) 2 R-row Critical（038-R1/039-R1）仍 active；(c) 已完成里程碑加 050 entry（SHA placeholder）；(d) Current Focus「現狀」加 050 + 「下一步」更新（dedicated sprint 2 + 條件觸發 + 長期 3 段）；(e) CLAUDE.md SPECKIT marker idle。`git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md && git commit`。per [data-model §E4](./data-model.md) + [quickstart Step 4.3](./quickstart.md)。Depends on T026 + T027。對應 FR-013、SC-008。
- [ ] T034 C-V8 governance docs verify：grep `### §4\.4\.3` `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥1 + grep `050 spec-hygiene-pass-4` ≥1 + grep 6 R-row 已從 active table 移除 + grep 2 R-row Critical 仍 active + grep 050 milestone entry 加 + verify SPECKIT marker idle。Depends on T033。對應 SC-008、per [contracts C-V8](./contracts/verification-commands.md)。
- [ ] T035 C-V9 boundary verify：`cd base-web && git diff --name-only f6efe906 HEAD` 命中 Dockerfile only + base-web src/ + packages/ 0 diff + rust-api migration 0 diff + 0 Constitution amendment + 0 new workspace cargo dep。Depends on T021 + T015。對應 SC-009、per [contracts C-V9](./contracts/verification-commands.md)。
- [ ] T036 (optional、per FR-014 implementer-stage expansion) base ≤3 + user 拍板可加大 拾取候選：(a) 036-R1 cascade（per R-6.1、0 site）/ (b) 044-R1 alert rule（per R-6.2、拒拾）/ (c) 044-R2 grafana dashboard panel query update（per R-6.3、≤3 panel）；implementer Phase 1 grep audit 確認後拍板、超限拒拾、登 050+ follow-up。對應 FR-014。
- [ ] T037 C-V10 final acceptance + git status clean verify：跑全 C-V1~C-V9 final run + `git status --short` clean + outer 5+ commit + rust-api 1 commit + base-web 1 commit + 13 service healthy。Depends on T034 + T035 + (optional T036)。對應 SC-001~010 全 PASS、per [contracts C-V10](./contracts/verification-commands.md)。
- [ ] T038 push origin outer 050 feature branch **（須 user 同意）**：`git push origin 050-spec-hygiene-pass-4`。Depends on T037 完成 + T021 + T015 完成（worktree 必須先 push、避免 outer gitlink SHA 引用 unpushed commit）。對應 [CLAUDE.md §5](../../CLAUDE.md)。
- [ ] T039 merge 050 → rev1-admin-root **（須 user 同意執行）**：`git checkout rev1-admin-root && git pull --ff-only origin rev1-admin-root && git merge --no-ff 050-spec-hygiene-pass-4 -m "Merge feature 050-spec-hygiene-pass-4"`；push origin rev1-admin-root **須 user 再次同意**。對應 [CLAUDE.md §5](../../CLAUDE.md)、[quickstart Step 6](./quickstart.md)。
- [ ] T040 backfill outer/merge/base-web/rust-api SHA + push **（須 user 同意）**：merge 後拿 4 SHA、回填進兩處 placeholder：(a) `docs/INTEGRATION-CHECKLIST.md` 050 entry 的 SHA placeholder、(b) `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.3 050 entry 4 個 SHA placeholder；small chore commit（per 040/049 體例）+ push **須 user 同意**。對應 SC-008、[quickstart Step 7](./quickstart.md)。

**Checkpoint**：050 整 feature 落地、acceptance C-V1~C-V10 全綠、6 R-row 結案（5 Important + 1 Polish）+ 2 R-row Critical（038-R1/039-R1）留 dedicated sprint backlog + 050 milestone entry 加、Constitution 5/5 PASS（無 amendment、dynamic 行使）、TS-DepGraph-Hygiene 軌道 dynamic 文件權威首次行使完成。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 1 Setup (T001 — baseline check)
   │
Phase 2 Foundational (skipped — 2 US 跨 commit boundary、無共用 foundational)
   │
   ├─→ US1 governance restructure (T002 → T003 → optional T004 → T005、SDD prerequisite、outer commit 1)
   │        │
   │        └─→ US2 6 issues impl bundled
   │              │
   │              ├─ Phase 4a rust-api (T006 spike → T007/T008 [sys_menu DTO + service] → T009 [sys_role] + T010 [operation_log] + T011 [Cargo.toml] + T012 [cleanup main] → T013 cargo check → T014 rust-api commit → T015 push)
   │              ├─ Phase 4b infra + base-web (T016 + T017 + optional T018 + T019 [base-web Dockerfile] → T020 base-web commit → T021 base-web push)
   │              ├─ Phase 4c outer commit + dev stack restart (T022 outer infra commit → T023 pushgateway up → T024 rust-api rebuild + restart → T025 cleanup binary smoke)
   │              │
   │              └─→ Phase 5 Polish (T026-T040、SHA pin + INTEGRATION-CHECKLIST + acceptance + push + merge + backfill)
```

US1 為 P1 MVP（governance restructure 為 verifiable evidence、dynamic 行使首次）；US2 為同 P1（rust-api/infra/base-web bundled、tightly coupled with US1 via SDD「先合法化、再執行」、不可順序顛倒）；Phase 5 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 (baseline check) | — |
| T002 (DESIGN §4.4.3 050 entry) | T001 |
| T003 (046 spec FR-015 amend) | T001 |
| T004 (044 spec FR-005 polish、optional) | T001 |
| T005 (outer commit 1) | T002 + T003 + (optional T004) |
| T006 (spike Option<Option<T>> + MatchedPath) | T005 |
| T007 (sys_menu DTO) | T006 |
| T008 (sys_menu_service selective merge) | T007 |
| T009 (sys_role_service ptype='g') | T006 |
| T010 (operation_log MatchedPath) | T006 |
| T011 (cleanup Cargo.toml feature flag) | T006 |
| T012 (cleanup main.rs recorder) | T011 |
| T013 (cargo check + clippy) | T008 + T009 + T010 + T012 |
| T014 (rust-api commit bundled) | T013 |
| T015 (push rust-api、user 同意) | T014、**user 同意** |
| T016 (docker-compose pushgateway) | T015 |
| T017 (prometheus.yml scrape) | T015 |
| T018 (grafana dashboard polish、optional) | T015 |
| T019 (base-web Dockerfile comment) | T015 |
| T020 (base-web commit) | T019 |
| T021 (push base-web、user 同意) | T020、**user 同意** |
| T022 (outer infra commit) | T016 + T017 + (optional T018) |
| T023 (pushgateway up + verify) | T022 |
| T024 (rust-api rebuild + restart) | T023 |
| T025 (cleanup binary smoke + pushgateway/prom verify) | T024 |
| T026 (outer commit 3 base-web SHA pin) | T021 完成 |
| T027 (outer commit 4 rust-api SHA pin) | T015 完成 |
| T028 (C-V2 partial update) | T024 |
| T029 (C-V3 grouping rule + deny) | T024 |
| T030 (C-V5 route template) | T024 |
| T031 (C-V6 spec amend) | T005 |
| T032 (C-V7 Dockerfile) | T020 |
| T033 (outer commit 5 INTEGRATION-CHECKLIST + SPECKIT) | T026 + T027 |
| T034 (C-V8 governance docs) | T033 |
| T035 (C-V9 boundary verify) | T021 + T015 |
| T036 (optional expansion ≤3) | T033（user 同意後）|
| T037 (C-V10 final acceptance) | T034 + T035 + (optional T036) |
| T038 (push outer feature branch、user 同意) | T037 完成 + T021 + T015、**user 同意** |
| T039 (merge + push rev1-admin-root) | T038 全 PASS、**user 同意** |
| T040 (SHA backfill + push) | T039、**user 同意** |

---

## Implementation Strategy（per quickstart Step 1-7 流程）

### 推薦執行批次（with subagent parallelism）

**Batch 1 — Phase 1 Setup（T001、~5 min）**：
- T001 baseline check

→ 約 5 min；baseline confirmed。

**Batch 2 — Phase 3 US1 governance restructure（T002-T005、~30 min）**：
- T002 DESIGN §4.4.3 050 entry（~25 line edit）
- T003 046 spec FR-015 amend + retro footnote（~5 line edit）
- T004 (optional) 044 spec FR-005 polish（~2 line edit）
- T005 outer commit 1

→ 約 30 min（spec wording 已 brainstorm 拍板、~32 line edit total）；**Phase 0 完成、SDD「先合法化、再執行」紀律滿足**、**MVP-1 達成**。

**Batch 3 — Phase 4a rust-api bundled（T006-T015、~90-120 min）**：
- T006 spike Option<Option<T>> + MatchedPath（~15-20 min）
- T007/T008 [P logical] sys_menu DTO + service selective merge（~30-40 min、~25 line edit）
- T009 [P logical] sys_role_service ptype='g' UPDATE + audit（~10 min、~5 line edit）
- T010 [P logical] operation_log MatchedPath（~10 min、~5 line edit）
- T011 + T012 [P logical] cleanup Cargo.toml + main.rs recorder（~20 min、~31 line edit）
- T013 cargo check + clippy（~5 min）
- T014 rust-api commit（~5 min）
- T015 push rust-api（user 同意）（~5 min）

→ 約 90-120 min（spike + 4 issues bundled impl + verify + commit）；MVP-2a rust-api 部分達成。

**Batch 4 — Phase 4b infra + base-web（T016-T021、~20-30 min）**：
- T016 + T017 + (optional T018) [P] infra config（~10 min、~17 line edit）
- T019 base-web Dockerfile polish（~5 min、~8 line replace）
- T020 base-web commit（~5 min）
- T021 push base-web（user 同意）（~5 min）

→ 約 20-30 min；MVP-2b infra + base-web 部分達成。

**Batch 5 — Phase 4c outer + dev stack restart + impl-side acceptance（T022-T025、~30-40 min）**：
- T022 outer infra commit（~5 min）
- T023 pushgateway up + verify（~10 min）
- T024 rust-api rebuild + restart（~10-15 min、docker build 為主要時間）
- T025 cleanup binary smoke + pushgateway/prom verify（~5 min）

→ 約 30-40 min；US2 整 PASS、待 Phase 5 final acceptance + 結案。

**Batch 6 — Phase 5 outer SHA pin + INTEGRATION-CHECKLIST cleanup + acceptance（T026-T037、~30-45 min）**：
- T026 + T027 outer SHA pin x2（~5 min）
- T028-T032 [P] C-V2/V3/V5/V6/V7（~15-20 min、可平行跑）
- T033 outer commit 5 INTEGRATION-CHECKLIST + SPECKIT（~10 min）
- T034 + T035 C-V8/V9（~5 min）
- T036 (optional) expansion ≤3（~5 min if 拾、0 if 不拾）
- T037 C-V10 final acceptance（~5 min）

→ 約 30-45 min。

**Batch 7 — Phase 5 push + merge + backfill（T038-T040、user-gated）**：
- T038 push outer feature branch（~3 min）
- T039 merge + push rev1-admin-root（~5 min）
- T040 SHA backfill + push（~5 min）

→ 約 13-20 min 含 user 同意等待（3 user 同意關卡、不含 user thinking time）。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-0（Phase 1 Setup only）**：baseline check 確認、不交付任何 user value。
- **MVP-1（Phase 1 + US1）**：DESIGN §4.4.3 050 entry + 046 spec FR-015 amend + retro footnote。**僅交軌道 governance dynamic 行使**（最高 procedural value、TS-DepGraph-Hygiene 軌道 dynamic 文件權威首次行使、未來軌道內 sprint 可用 dynamic 機制）。6 issues impl 留後。
- **MVP-2（Phase 1 + US1 + US2 Phase 4a/4b/4c）**：+ Phase 4 rust-api 4 issues bundled + infra pushgateway + base-web Dockerfile。**完整 6 R-row（5 Important + 1 Polish）結案**。可 deliver 全套 spec hygiene + impl fix。
- **Full feature（MVP-2 + 完整 Polish）**：依 Batch 1-7 完整跑（推薦、bundled feature 一次清完、acceptance C-V1~C-V10 全 PASS、8 R-row 結案 6 + 2 Critical 留 dedicated sprint）。

User 偏好：Full feature 一次到位（per brainstorm 7 Q 拍板 + 050 mixed sprint 紀律 / acceptance 全綠 / merge 紀律）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 偵測 subagent 可用後派遣 `superpowers:subagent-driven-development`：把 user story task 各派 fresh implementer subagent；每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~014 + SC-001~010）→ ② code quality（rust idiom / serde / casbin SQL / axum API / docker-compose / prometheus.yml / Constitution 紀律 / 軌道紀律 boundary）。

每 implementer 完成 task 後勾 `[x]`、記錄關鍵實機結果（grep 計數、`cargo check` PASS、`docker compose ps` healthy、curl + psql output、commit SHA）。

**Phase 5** 必須在 US1+US2 全部 PASS 後執行（含 user 同意 push / merge / backfill 三個關卡）。

**Implementer-stage Expansion budget**（per 046 FR-015 amend wording 050 落地後生效、本 sprint follow new wording）：base ≤3 處 + user 拍板可加大（commit message body 明示拍板原委 + budget enlargement 計數）；候選 (a) 0 site (R-6.1) / (b) cleanup alert rule（不拾、R-6.2）/ (c) grafana dashboard panel query update（≤3 panel、R-6.3 implementer Phase 1 grep 後拍板）；超限拒拾、登 050+ follow-up。

---

## Summary

- **Total tasks**: 40（含 2 optional）
- **By phase**: Setup 1 / Foundational 0 / US1 4 / US2 20 / Polish 15
- **By user story**: US1 = 4 / US2 = 20（共 24 user story tasks）+ Setup 1 + Polish 15（含 3 user gate T038/T039/T040）
- **Parallel opportunities**：
  - US2 Phase 4a 內部 T007/T008 / T009 / T010 / T011（不同檔 [P] logical、T013 cargo check sequential）
  - US2 Phase 4b 內部 T016 / T017 / T018 / T019（不同檔 [P]）
  - Phase 5 T028 / T029 / T030 / T031 / T032 [P] acceptance（不同 C-V 平行跑）
- **Independent test criteria**: 每個 US 對應 C-V1~C-V10 中 1-3 條（per spec.md SC-001~010）
- **Suggested MVP scope**: MVP-1（Phase 1 + US1）—— DESIGN §4.4.3 050 entry + 046 spec FR-015 amend；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 40 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
