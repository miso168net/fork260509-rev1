# Feature Specification: 050 spec-hygiene-pass-4

**Feature Branch**: `050-spec-hygiene-pass-4`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "050 spec-hygiene-pass-4 — 詳見 brainstorm doc `docs/superpowers/050-feature-spec-hygiene-pass-4.md`（已 commit `56d3e4a`、含 7 Q user-approved 拍板：軌道分類 Mixed sprint、036-R1 selective merge、037-R1 ptype='g' defensive UPDATE、044-R1 install pushgateway、044-R2 axum MatchedPath、046-R1 FR-015 generalized amend、049-R1 Dockerfile strict isolation comment）。Sprint goal: post-merge code review 衍生 5 Important + 1 Polish bundled、軌道內 base-web Dockerfile comment + 軌道外 rust-api/spec docs/infra 改動、Constitution v1.6.0 dynamic doc 權威首次行使 (DESIGN-W-BASE-WEB §4.4.3 add 050 entry、無 amendment)、C-V1~C-V10 全綠後 8 R-row 結案 + 050 milestone。"

**前置文件**：
- [`docs/superpowers/050-feature-spec-hygiene-pass-4.md`](../../docs/superpowers/050-feature-spec-hygiene-pass-4.md)（brainstorm 設計、7 Q 已 user-approved、commit `56d3e4a`）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)（v1.6.0、本 sprint 無 amendment）
- [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md)（§4.4.3 將新增 050 entry、dynamic 文件權威首次行使）
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md)（8 R-row follow-up 來源）

## Clarifications

### Session 2026-05-25

- Q: pushgateway image version pin policy？ → A: pin specific stable tag `prom/pushgateway:v1.10.0`（對齊 rev1 既有 service 版本 pin 體例 + `~/.claude/CLAUDE.md §6 Tool installation discipline`）
- Q: 037-R1 audit_log payload `g_rules_updated_count` strictness（MUST vs MAY）？ → A: MUST include（per Constitution Principle II audit completeness、未來 g rule 觸發時可 forensic、cost 微）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Maintainer 開 unified DESIGN doc 看到 050 sprint 取得 dynamic 授權、046 spec FR-015 已 amend 為 generalized expansion budget（Priority: P1）🎯 MVP

維護 rev1 整合的 maintainer / AI implementer / code reviewer 開 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 應看到 §4.4.3 新加 050 sprint condition entry（含 scope 描述 + commit SHA placeholder）、確認 TS-DepGraph-Hygiene 軌道 dynamic 文件權威首次行使（Constitution v1.6.0 既有設計、無需 amendment）；同步 `specs/046-spec-hygiene-pass-3/spec.md` FR-015 wording 從原「expansion budget ≤3」改為「base ≤3 + user 拍板可加大（commit message body 明示拍板原委 + budget enlargement 計數）」，046 entry footnote 紀此次 budget enlargement 為 retro precedent。

**Why this priority**：governance 改動是 base-web 改動 (049-R1) 的 prerequisite — SDD「先合法化、再執行」紀律（per 049 Phase 0 體例）。spec.md FR-015 wording 是 spec hygiene 必要 reconcile、保留 spec/impl 一致性紀律。MVP-worthy 因為 governance restructure 本身有獨立 verification value（grep DESIGN §4.4.3 + 046 spec FR-015 wording amend）。

**Independent Test**：grep `^### §4\.4\.3` 命中 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` + grep `050 spec-hygiene-pass-4` `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥1 hit + grep `user 拍板可加大` `specs/046-spec-hygiene-pass-3/spec.md` ≥1 hit + grep `046 entry budget enlargement` `docs/INTEGRATION-CHECKLIST.md` footnote ≥1 hit。

**Acceptance Scenarios**：

1. **Given** Phase 0 DESIGN §4.4.3 entry + 046 spec FR-015 amend + INTEGRATION-CHECKLIST 046 footnote 全完成；**When** grep `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.3 段落；**Then** 050 sprint entry 含 scope（comprehensive review-derived hygiene + 6 issues 列舉）+ `<TBD post-merge>` SHA placeholder + 對齊 §4.4.1 / §4.4.2 既有體例。
2. **Given** 046 spec FR-015 amend wording + footnote 落地；**When** 跑 spec-kit 流程的後續 hygiene-pass feature；**Then** Constitution Check 段對齊新 wording、implementer-stage expansion 紀律明示 user 拍板 escape gate。
3. **Given** 050 spec.md 寫成、Phase 0 commit 落地；**When** 後續 base-web Dockerfile comment 改動（049-R1）；**Then** DESIGN §4.4.3 dynamic 授權已就位、軌道內改動合法（無需 Constitution amendment）。

---

### User Story 2 — Developer 看 rust-api code + cleanup binary metric + base-web Dockerfile 看到 6 issues 全 fix、acceptance C-V 全綠（Priority: P1）

維護 rev1 整合的 rust developer / observability operator / base-web build pipeline 在 6 issues fix 落地後應看到：
- **036-R1**：`sys_menu` partial update missing field preserve before_row 值（selective merge logic）
- **037-R1**：role code rename 同步 sync `ptype='g'` Casbin rule v1（defensive UPDATE on empty set）
- **044-R1**：`cleanup_job_rows_deleted_total` 在 dev stack 13 service（含新 pushgateway）內收到 7 sweep counter、prometheus series 出現非 0
- **044-R2**：`http_request_duration_seconds.route` label 用 axum template path（無 numeric ID 爆炸）
- **049-R1**：base-web/Dockerfile line 35-42 comment 清乾淨改為 strict isolation 紀律說明（per 049 FR-004/005）

**Why this priority**：6 issues 都是 post-merge code review 發現的 spec/impl drift 或 architectural debt、修完 acceptance C-V 全綠才能結案 6 R-row（5 Important + 1 Polish；連帶 2 Critical 留 dedicated sprint）。MVP-worthy 因為每個 issue 都有 verifiable evidence（curl + psql / grep / metric series check）。

**Independent Test**：5 issues 各自 PASS — (a) 036-R1：curl partial update menu + psql before/after 確認 missing field preserve；(b) 037-R1：role code rename + curl 確認 g rule 一併 sync（mocked g rule 注入）；(c) 044-R1：cleanup binary cron 跑一次 + curl pushgateway `/metrics` 看 7 series + curl prom `/api/v1/query` 看 cleanup_job_rows_deleted_total series；(d) 044-R2：grep prom series 看 route label 為 template path、無 raw numeric ID；(e) 049-R1：grep base-web/Dockerfile 確認 `nodeLinker: hoisted` 0 hit + `strict isolation` ≥1 hit。

**Acceptance Scenarios**：

1. **Given** 036-R1 selective merge logic 落地、`sys_menu` DTO 改 `Option<Option<T>>` double-option pattern；**When** curl POST `/systemManage/updateMenu` body 只送 `name` 改、不送 `query`/`buttons`/`fixed_index_in_tab`；**Then** psql 看 row 內 3 nullable field 值保持為 before_row（未 NULL 覆蓋）；C-V6 partial update acceptance test PASS。
2. **Given** 037-R1 ptype='g' defensive UPDATE 落地、`update_role` txn 內加 `UPDATE casbin_rule SET v1=$1 WHERE ptype='g' AND v1=$2`；**When** mock 插 1 個 g rule (`INSERT INTO casbin_rule (ptype, v0, v1) VALUES ('g', 'user_x', 'ROLE_OLD')`) + curl POST `/systemManage/updateRole` 改 ROLE_OLD → ROLE_NEW；**Then** psql 看 g rule v1 已 sync 為 ROLE_NEW、無 silent orphan；GeneralUser 試 POST /role 確認 Casbin 拒絕（FR-006 deny path C-V）。
3. **Given** 044-R1 pushgateway service 落地、cleanup binary recorder + on-exit flush 實作；**When** cron 跑 cleanup binary 一次（手動觸發 `docker compose exec rust-api /app/cleanup` 或 wait scheduled run）；**Then** curl pushgateway `/metrics` 看 `cleanup_job_rows_deleted_total{sweep="*"}` 7 series 存在、值反映 sweep 真實刪除 row 數；curl prom `/api/v1/query?query=cleanup_job_rows_deleted_total` 拉到 scrape 後 series。
4. **Given** 044-R2 axum MatchedPath template 落地、instrument middleware 改用 MatchedPath extractor；**When** curl 多 endpoint（如 `/role/123` + `/role/456` + `/menu/789`）+ curl prom `/api/v1/query?query=http_request_duration_seconds_count`；**Then** route label 為 template path（如 `/role/{id}` `/menu/{id}`）、無 raw numeric ID（series cardinality 限制）。
5. **Given** 049-R1 Dockerfile line 35-42 comment 改 strict isolation 紀律說明；**When** grep `base-web/Dockerfile` 看 line 35-42 區塊；**Then** 無 `nodeLinker: hoisted` / `shamefully-hoist=true` outdated reference、有「pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005)」+ packageManager field + `--ignore-scripts rationale」內容。
6. **Given** US1 + US2 全完成 + Phase 3 INTEGRATION-CHECKLIST cleanup；**When** grep INTEGRATION-CHECKLIST；**Then** 6 R-row（036-R1/037-R1/044-R1/044-R2/046-R1/049-R1）狀態更新（5 Important + 1 Polish 移為「已結案」footnote、2 Critical 038-R1/039-R1 留 active backlog 等 dedicated sprint）+ 050 milestone entry 加進已完成里程碑 + Current Focus update。

---

### Edge Cases

- **036-R1 DTO double-option 體例 spike**：rev1 既有 codebase 可能沒 `Option<Option<T>>` pattern；Phase 1 開始前先 spike 1-2 hr 確認可行 pattern（serde + sea-orm 支援度）；若 double-option 過複雜、降級用 update mask（`Vec<String>` 顯式 field name list）—— pattern 不對 spec impl 細節（per Constitution / Q 設計時 freedom）。
- **044-R1 pushgateway service 部署**：新 prometheus pushgateway service（port 9091）撞既有 service network alias 衝突風險低（既有 12 service 無 pushgateway）；docker network 內 cleanup binary 連 pushgateway 需 confirm service discovery（用 `pushgateway:9091` 而非 `127.0.0.1:9091`、cleanup binary 在 rust-api container 內跑）。Phase 2 spike pushgateway up 確認 healthy 再整合 dev stack。
- **044-R2 MatchedPath layer 順序**：axum MatchedPath extractor 需在 router routes 已 register 後才能 extract；middleware layer 順序若不對拿不到（fallback "unmatched"）—— Phase 1 spike 確認 layer placement。若 middleware 在 router 外（outermost layer）、可能需 `request.extensions().get::<MatchedPath>()` 在 router-injected extension 內 take。
- **037-R1 GeneralUser deny C-V**：dev 環境 GeneralUser 可能已被別 feature 賦予 systemManage role（contamination）；C-V 跑前先 reset GeneralUser roles 為空、或建臨時 user `cv050_deny_test` 無 role。
- **046-R1 FR-015 wording amend cascade**：本 sprint 自身 spec.md FR 對應「expansion budget」也須 follow new wording；本 sprint Phase 1 若撞 expansion 觸發、跟從 generalized wording（base ≤3 + user 拍板）。
- **049-R1 Dockerfile comment 與既有 line 36-43 context**：line 33-34「Deps-first COPY layer」+「BuildKit cache mount」描述須 preserve（與 049-R1 替換的 line 35-42 是不同 concern、line 33-34 不動）。確保 replace 範圍精準。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4 章節 MUST 新增 `### §4.4.3 050 spec-hygiene-pass-4` sub-section、含 scope 描述（comprehensive review-derived hygiene + 6 issues 列舉）+ commit SHA placeholder（`<TBD post-merge>`）+ trigger 描述（post-merge code review 衍生 follow-up 結案載體）+ acceptance ref（C-V1~C-V10 全 PASS）+ spec ref（`specs/050-spec-hygiene-pass-4/`）；對齊 §4.4.1 047.5 retro + §4.4.2 049 sprint 既有體例。
- **FR-002**：`specs/046-spec-hygiene-pass-3/spec.md` FR-015 wording MUST amend 為「base ≤3 expansion budget；user 拍板可加大、需於 commit message body 明示拍板原委 + budget enlargement 計數」；046 spec entry footnote MUST 加 retro 紀錄此次 budget enlargement（17 display_id + 1 home_route_name + dev-dep `tokio "time"` feature 為 pre-existing E0063 build-gate fix、user 拍板）。
- **FR-003**：`rust-api/server/service/src/admin/sys_menu_service.rs` MUST 改 `update_menu_for_systemmanage` handler 為 selective merge：incoming missing/null field 則 preserve `before_row` 值；DTO `SystemManageUpdateMenuInput` 改為支援「未送」與「explicit null」二態區分（`Option<Option<T>>` double-option pattern 或 update mask + per-field check）；對 `query` / `buttons` / `fixed_index_in_tab` 3 nullable field 同步施作。
- **FR-004**：`rust-api/server/service/src/admin/sys_role_service.rs` MUST 在 `update_role` txn 內、既有 `UPDATE casbin_rule SET v0=$1 WHERE ptype='p' AND v0=$2` 後加 `UPDATE casbin_rule SET v1=$1 WHERE ptype='g' AND v1=$2`（idempotent on empty set）；audit_log payload MUST 加 `g_rules_updated_count` 數值欄（per Clarifications Session 2026-05-25 Q2、Constitution Principle II audit completeness、未來 g rule 觸發時可 forensic）；補 GeneralUser deny C-V（Casbin 拒絕 GeneralUser POST `/systemManage/updateRole`）。
- **FR-005**：`rust-api/server/cleanup/src/main.rs` MUST 加 prometheus pushgateway recorder install（`metrics-exporter-prometheus` crate）+ on-exit flush（每 cron run 末端 push 一次到 pushgateway service `pushgateway:9091`）；`rust-api/server/cleanup/Cargo.toml` MUST 加對應 dep（同 workspace cargo dep / 或 per-crate dep 視 spike 結果）。
- **FR-006**：`docker-compose.observability.yml` MUST 新增 `pushgateway` service（image `prom/pushgateway:v1.10.0`、port 9091:9091、healthcheck、network alias `pushgateway`；per Clarifications Session 2026-05-25 Q1 pin specific stable tag）；`deploy/prometheus.yml` MUST 新增 scrape job `pushgateway`（target `pushgateway:9091`、interval 15s 對齊 prometheus 既有 scrape）；`deploy/grafana-provisioning/dashboards/*.json` 對應 `cleanup_job_rows_deleted_total` panel 的「no data」placeholder 註解 MAY 移除。
- **FR-007**：`rust-api/server/core/src/web/operation_log.rs`（或 instrument middleware 對應檔）MUST 改 `http_request_duration_seconds` histogram 的 `route` label 為 axum `MatchedPath` extractor 取得的 route template（如 `/role/{id}` `/menu/{id}`）而非 raw URI path（含 numeric ID）；若 MatchedPath 取不到（layer 順序問題）、降級 fallback 為 `"unmatched"` 避免 cardinality leak。
- **FR-008**：`specs/044-observability-and-cleanup-pass/spec.md` FR-005 wording MAY polish（補明示 `route` label 為 axum template path、含 path params placeholder）；本 polish 為輕量 doc 對齊、屬軌道外 spec md edit。
- **FR-009**：`base-web/Dockerfile` line 35-42 註解 block MUST 整段 replace 為新 wording（per brainstorm Q7 拍板）：
  ```
  # pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005):
  # - package.json packageManager field 是唯一 pnpm 版本 source of truth
  #   (host + container 共享、取代 047.5 retro 期間的 Dockerfile ARG)
  # - 4 phantom transitive 已提為 explicit devDeps、無需 hoist
  # - --ignore-scripts 保留: pnpm 11 strict mode 拒絕 transitive build script
  #   (esbuild / simple-git-hooks / unrs-resolver / etc.)、container 無互動 shell
  ```
  line 33-34「Deps-first COPY layer」+「BuildKit cache mount」描述 MUST preserve（不動）。
- **FR-010**：本 sprint MUST 0 Constitution amendment（dynamic doc 權威首次行使 via DESIGN §4.4.3 entry）、0 new entity、0 new schema migration、0 new rust-api endpoint、0 base-web src/ diff；唯一 base-web 改動限 `Dockerfile`（line 35-42 comment polish only）。
- **FR-011**：本 sprint Phase 0 MUST 先完成 DESIGN §4.4.3 entry + 046 spec FR-015 amend（SDD「先合法化、再執行」紀律）；之後才能進 Phase 1 rust-api impl + Phase 2 infra（docker-compose pushgateway）+ Phase 3 base-web Dockerfile polish。
- **FR-012**：dev stack 13 service（既有 12 + 新 pushgateway）+ rust-api drainer 跑著；prometheus scrape job 拉到 pushgateway 暫存 metric；grafana cleanup_job dashboard panel 顯示真實 data（不再 placeholder）；C-V1~C-V10 acceptance 全 PASS。
- **FR-013**：本 sprint 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST：(a) 5 R-row Important + 1 R-row Polish（036/037/044-R1/044-R2/046/049-R1）移除 active table、改為 footnote「已結案 via 050」格式（保留歷史脈絡）；(b) 2 R-row Critical（038-R1/039-R1）仍留 active table 等 dedicated sprint；(c) 已完成里程碑加 050 entry；(d) Current Focus「現狀」加 050 + 「下一步」更新（仍剩 Critical 2 + 042-N4/042-N5/048-N1 (d) condition trigger + 長期 F1.2/W-F6b/W-F15/16）；(e) CLAUDE.md SPECKIT marker idle。
- **FR-014**：本 sprint implementer-stage expansion budget follow 新 wording（per FR-002 amend）：base ≤3 + user 拍板可加大（commit message body 明示）；候選由 Phase 1 spike 後拍板（如 036-R1 cascade 影響 update_user 等其他 systemManage handler / 044-R1 cascade 影響 grafana dashboard alert rule / 044-R2 cascade 影響既有 dashboard panel query）。

### Key Entities

本 sprint 為 spec hygiene + impl fix + infra add + governance dynamic 行使、**無 application data entity 改動**（0 schema migration、0 新 entity）。本節省略。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、13 service（既有 12 + 新 pushgateway）全 healthy state；rust-api 啟動 + drainer 跑著（接 049 baseline、不退化）。
- **SC-002**：036-R1 partial update acceptance：curl POST `/systemManage/updateMenu` body 只送部分 field（不送 `query`/`buttons`/`fixed_index_in_tab` 3 nullable field）、psql 看 row 內 3 nullable field 值保持為 before_row（未 NULL 覆蓋）；對齊 spec 036 FR-004 原 promise。
- **SC-003**：037-R1 grouping rule sync：mock 插 1 g rule + curl rename role + psql 看 g rule v1 已 sync 為新 role code；GeneralUser deny C-V：curl as GeneralUser POST `/systemManage/updateRole` 拿 403。
- **SC-004**：044-R1 pushgateway 接通：cleanup binary 跑一次後、curl `http://pushgateway:9091/metrics` 看 `cleanup_job_rows_deleted_total{sweep="*"}` 7 series 存在、值反映真實刪除；curl prom `/api/v1/query?query=cleanup_job_rows_deleted_total` 拉到 scrape 後 series；grafana 對應 dashboard panel 顯示真實 data（不再 placeholder）。
- **SC-005**：044-R2 route label template：curl prom `/api/v1/query?query=http_request_duration_seconds_count` 看 series 內 `route` label 為 axum template path（如 `/role/{id}`）、無 raw numeric ID。
- **SC-006**：046-R1 spec amend：grep `user 拍板可加大` `specs/046-spec-hygiene-pass-3/spec.md` ≥1 hit + grep `046 entry budget enlargement` `docs/INTEGRATION-CHECKLIST.md` footnote ≥1 hit。
- **SC-007**：049-R1 Dockerfile polish：grep `nodeLinker: hoisted` `base-web/Dockerfile` 0 hit + grep `strict isolation` `base-web/Dockerfile` ≥1 hit + grep `shamefully-hoist=true` `base-web/Dockerfile` 0 hit + grep `packageManager field` `base-web/Dockerfile` ≥1 hit。
- **SC-008**：governance docs：grep `### §4\.4\.3` `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥1 hit + grep `050 spec-hygiene-pass-4` `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` ≥1 hit + INTEGRATION-CHECKLIST 8 R-row 狀態 update（6 移為 footnote 結案 / 2 留 active）+ 050 milestone entry 加 + Current Focus update。
- **SC-009**：軌道紀律 boundary verify 全 PASS — `git diff` 顯示 base-web 改動限：`Dockerfile`（line 35-42 comment polish only）；`git diff base-web/src/` 0 line；`git diff rust-api/migration/` 0 line（無新 migration）；本 sprint 0 Constitution amendment。
- **SC-010**：Constitution Check post-amendment：5/5 PASS（Principle I/II/III/IV/V 皆無 violation；TS-DepGraph-Hygiene 軌道 dynamic 行使 via DESIGN §4.4.3 已就位）；Complexity Tracking 空白。

## Assumptions

- **dev stack 健康** — 12 service healthy（per 049 baseline、SOP hook verified）+ rust-api drainer 跑著（baseline 接 049 commit `cd5114f` merge 後狀態）。
- **base-web worktree baseline** — `rev1-admin-base-web` 分支 HEAD = `f6efe906`（049 落地後狀態）；Phase 1 驗 `cd base-web && git rev-parse rev1-admin-base-web` 為此 SHA、未退化。
- **無 Constitution amendment 需要** — Constitution v1.6.0「DESIGN doc dynamic 文件權威」設計已就位、新 sprint 加 DESIGN §4.4.3 entry 即取得授權、無需 amendment（per 040 W-FW9 對 DESIGN-W-WEBUI.md §7 dynamic 體例、本 sprint 為 TS-DepGraph-Hygiene 軌道首次 dynamic 行使）。
- **036-R1 DTO double-option 可行性** — rev1 既有 codebase 雖無此 pattern、但 serde + sea-orm 支援 `Option<Option<T>>`（serde `default` + `skip_serializing_if`）；Phase 1 spike 1-2 hr 確認；若不可行降級用 update mask（`Vec<String>` field name list）為 backup pattern。
- **037-R1 0 current g rule confirmation** — psql `SELECT count(*) FROM casbin_rule WHERE ptype='g'` 預期 0（per 037 commit msg R-Q3 empirically safe 紀錄）；defensive UPDATE 對當前 0 row 為 no-op、後續 g rule 出現時自動 sync。
- **044-R1 pushgateway 可用性** — `prom/pushgateway` docker image stable / well-maintained；`metrics-exporter-prometheus` crate 支援 pushgateway export（檢查最新 release notes confirm）；cleanup binary cron 模式契合 pushgateway「短命 process push metric」場景。
- **044-R2 axum MatchedPath 可用性** — axum 0.8 既有 API；`request.extensions().get::<MatchedPath>()` 在 router-injected extension 內可 take（per axum docs）；middleware layer 順序若撞 不能 extract、降級 fallback `"unmatched"` 避免 cardinality leak。
- **implementer-stage expansion budget follow 新 wording** — 本 sprint Phase 0 完成 046-R1 amend 後、Phase 1+ implementer-stage 紀律 immediately 跟從 generalized wording（base ≤3、user 拍板可加大）。
- **046-R1 retro-amend 不影響歷史 acceptance** — 046 sprint 已 merged、本次 amend 僅 spec md wording 對齊紀律、不影響 046 sprint 既有 acceptance / commits / merge。
- **C-V1~C-V10 acceptance 設計時** — 各 C-V 對應 1-2 個 FR/SC（per spec.md SC-001~010），acceptance 全綠才結案；C-V tooling 沿用既有 curl + psql + grep + grafana scrape（無新 acceptance tool 引入）。
