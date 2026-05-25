# Implementation Plan: 050 spec-hygiene-pass-4

**Branch**: `050-spec-hygiene-pass-4` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/050-spec-hygiene-pass-4/spec.md`

## Summary

post-merge code review (specs 030~049 跑 superpowers:requesting-code-review) 衍生 8 R-row follow-up（2 Critical 留 dedicated sprint / 5 Important + 1 Polish 本 sprint 結案）。Mixed sprint 跨 2 軌道：

**軌道內 TS-DepGraph-Hygiene §4**：
- 049-R1 base-web/Dockerfile line 35-42 stale comment 改 strict isolation 紀律說明

**軌道外 (rust-api + spec docs + infra)**：
- 036-R1 sys_menu partial update selective merge (impl fix、保留 spec 036 FR-004 原 promise)
- 037-R1 Casbin grouping rule (ptype='g') defensive UPDATE + GeneralUser deny C-V + audit MUST 含 g_rules_updated_count (per clarify Q2)
- 044-R1 install prometheus pushgateway service (image `prom/pushgateway:v1.10.0` per clarify Q1) + cleanup binary recorder + scrape job + grafana panel polish
- 044-R2 instrument middleware 改用 axum MatchedPath template route label (取代 raw URI path、cardinality 控制)
- 046-R1 046 spec FR-015 wording generalized amend (base ≤3 + user 拍板可加大、commit msg 紀錄)

技術 approach（per spec FR-001~014 + brainstorm Q1~Q7 + clarify Q1~Q2）：
- **SDD「先合法化、再執行」**：Phase 0 DESIGN §4.4.3 entry + 046 spec FR-015 amend 必先、之後才能進 Phase 1+
- **無 Constitution amendment**：TS-DepGraph-Hygiene 軌道 v1.6.0「DESIGN doc dynamic 文件權威」首次行使、加 DESIGN §4.4.3 entry 即取得授權
- **036-R1 selective merge DTO**：Phase 1 spike 1-2 hr 確認 `Option<Option<T>>` double-option pattern 可行性；不可行降級用 update mask
- **044-R1 pushgateway**：cron-driven cleanup binary push 模式契合（短命 process）；image pin `v1.10.0` per CLAUDE.md §6
- **044-R2 MatchedPath layer**：spike 確認 layer 順序；middleware 拿不到時 fallback `"unmatched"` 避免 cardinality leak
- **commit shape**：base-web worktree 1 commit (049-R1 Dockerfile) + rust-api worktree 1 commit (036/037/044-R1/044-R2 bundled) + outer 5-6 commit (Phase 0 governance / Phase 2 infra / 2 SHA pin / INTEGRATION-CHECKLIST + SPECKIT / SHA backfill)
- **expansion budget**：follow 新 wording（per Phase 0 完成 046-R1 amend 後）—base ≤3 + user 拍板可加大（commit msg 明示）

> **Phase 命名對照**：plan.md 內「Phase 0 governance / Phase 1 rust-api / Phase 2 infra / Phase 3 polish」(brainstorm 4-phase 模式) 對應 tasks.md「Phase 1 Setup / Phase 2 Foundational skip / Phase 3 US1 / Phase 4 US2 / Phase 5 Polish」(spec-kit 5-phase 模式)；語意一致、僅 prefix 不同。

## Technical Context

**Language/Version**：Rust 1.7x（rust-api 既有 toolchain）；TypeScript 5.x（base-web 不動 src/）；YAML / TOML（infra config）

**Primary Dependencies**：
- 既有 rust-api：`sea-orm` / `casbin` / `axum` 0.8 / `tracing` / `tokio` / `metrics` / `metrics-exporter-prometheus`
- 新加 rust-api dep（cleanup binary）：pushgateway recorder 支援（`metrics-exporter-prometheus` 既有 / 待 spike 確認 push mode 是否需新 crate；可能 0 新 workspace dep、per-crate dep enable feature flag 即可）
- 既有 infra：prometheus / grafana / loki / postgres / redis（共 12 service）
- 新加 infra service：`prom/pushgateway:v1.10.0`（per Clarifications Q1）
- **0 新 base-web npm dep / 0 新 schema migration / 0 新 entity**

**Storage**：N/A — 無 application storage（純 hygiene + infra add）；pushgateway 為 in-memory transient store（process 重啟後 metric 重置、適合 cron job push 體例）

**Testing**：
- Static：grep audit（per SC-001~010）
- Runtime acceptance：
  - C-V2 curl + psql for 036-R1 partial update
  - C-V6 curl + mock g rule + psql for 037-R1
  - C-V3 cleanup binary cron 跑 + curl pushgateway `/metrics` + curl prom `/api/v1/query`
  - C-V4 curl 多 endpoint + curl prom 看 route label template
  - C-V5 grep base-web/Dockerfile + grep DESIGN docs + grep INTEGRATION-CHECKLIST
- 無新 unit test（hygiene-pass 性質、acceptance-only via C-V matrix；對齊 046/043/041 體例）

**Target Platform**：rust-api container（既有）、base-web container（不動 src/、只動 Dockerfile comment）、prometheus pushgateway container（新）；dev WSL2 + Docker Desktop

**Project Type**：mixed-軌道 spec-hygiene-pass（跨 TS-DepGraph-Hygiene 軌道 §4 + 軌道外 rust-api + spec docs + infra）；對齊 040 W-FW9 mixed sprint 體例

**Performance Goals**：
- C-V2 partial update：curl roundtrip < 200ms（既有 rust-api baseline）
- C-V3 pushgateway scrape：prometheus 15s interval 內可拉 cleanup binary push 之 series
- C-V4 route label cardinality：series 數 ≤ endpoint pattern 數 × replica 數 × method 數（限制版上限）、非 raw URI path 爆炸
- docker pushgateway service 啟動：~5 sec to healthy

**Constraints**：
- 限 base-web `Dockerfile` line 35-42 comment polish（FR-009）；base-web src/ + packages/ 0 diff（FR-010）
- 限 rust-api 4 file（per FR-003/004/005/007）；無新 endpoint、無 schema migration、無新 entity（FR-010）
- 0 Constitution amendment（dynamic doc 權威首次行使 via DESIGN §4.4.3、FR-010）
- SDD「先合法化、再執行」順序紀律（FR-011）
- implementer-stage expansion budget follow 新 wording（per FR-002 amend、base ≤3 + user 拍板可加大、FR-014）

**Scale/Scope**：
- Phase 0 改動：DESIGN-W-BASE-WEB.md §4.4.3 entry ~30 line + 046 spec.md FR-015 amend ~5 line + INTEGRATION-CHECKLIST 046 footnote ~5 line + 044 spec.md FR-005 polish ~2 line
- Phase 1 改動：rust-api 4 file（036-R1 selective merge ~30-50 line + 037-R1 ptype='g' UPDATE +5 line + 044-R1 pushgateway recorder ~30 line + 044-R2 MatchedPath ~10-20 line）
- Phase 2 改動：docker-compose.observability.yml +1 service block ~20 line + prometheus.yml +1 scrape job ~5 line + grafana dashboard ~5 line + base-web/Dockerfile line 35-42 polish 8 line
- Phase 3 改動：INTEGRATION-CHECKLIST 8 R-row 狀態 update ~30 line + 050 milestone entry +1 line + Current Focus update ~5 line + CLAUDE.md SPECKIT marker idle
- 總計 ~150-200 line outer diff + ~80-110 line rust-api diff + ~10 line base-web diff
- ~3.5-5 hr 落地（per brainstorm §8 估時）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) **v1.6.0**：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 037-R1 補 Casbin `ptype='g'` defensive UPDATE 強化既有 Casbin 一致性、不動 enforcement model；補 GeneralUser deny C-V test、補強 IV.1「後端 Casbin enforcement 為唯一權威」紀律。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 037-R1 audit_log payload MUST 加 `g_rules_updated_count` 數值欄（per clarify Q2、強化 audit completeness）；036-R1 selective merge 經既有 `audit_snapshot` 自動涵蓋 before/after；044-R1 cleanup binary instrumentation 經 audit 框架既有路徑；不動 audit 寫入 in-txn 紀律。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 0 跨服務 HTTP 呼叫；pushgateway 為 prometheus 內部 push model（非業務 HTTP）、rust-api 對 pushgateway push 為 metric instrumentation 不是 service-to-service forward；無新 endpoint、無 nginx config 改動。 | ✅ PASS |
| **IV. base 不改動邊界**（**TS-DepGraph-Hygiene 軌道 dynamic 行使**）| 軌道內 049-R1 屬 TS-DepGraph-Hygiene 軌道、軌道權威 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4`、本 sprint 加 §4.4.3 entry 即取得授權（per Constitution v1.6.0 dynamic doc 文件權威設計、首次行使）；可動範圍限 `base-web/Dockerfile` line 35-42 comment polish；base-web src/ + W-WEBUI + TS-Typing-Sync 範圍全 forbidden（FR-010 boundary verify）；動機限定為「047.5 retro 期間 outdated comment 對齊 049 strict isolation 紀律」（spec.md FR-009 舉證）。同 W-WEBUI / TS-Typing-Sync 軌道兩段式 commit 紀律。**0 Constitution amendment**。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 hygiene fix + spec amend；不引 nestjs / DESIGN-A 殘留；強化 DESIGN-B 形態（observability 紀律對齊 + spec hygiene 紀律對齊）。 | ✅ PASS |

**軌道辨識**（v1.6.0+、四選一）：

- **W-WEBUI 軌道**：0 命中
- **TS-Typing-Sync 軌道**：0 命中
- **TS-DepGraph-Hygiene 軌道**（v1.6.0+）：**049-R1** 命中（base-web/Dockerfile line 35-42 comment polish；軌道權威 [`DESIGN-W-BASE-WEB.md §4`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md)、本 sprint 加 §4.4.3 entry）
- **軌道外**：036-R1 + 037-R1 + 044-R1 + 044-R2 + 046-R1（rust-api + spec docs + infra）

**050 自己選擇**：**Mixed sprint**（per 040 W-FW9 mixed 軌道體例）—— TS-DepGraph-Hygiene 軌道內 1 條 + 軌道外 5 條 bundled。

**架構約束** 同步檢查：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 044-R2 改 route label 為 template path、屬 metric instrumentation 不影響 log format
- §Observability「promtail → Loki + prometheus + grafana 為**必要**stack」→ 044-R1 加 pushgateway 為 prometheus push-mode 子系統、補強 observability stack
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 044-R1 補 cleanup-job metric instrument、無新背景 task

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**0 Constitution amendment**（dynamic doc 權威首次行使）。

## Project Structure

### Documentation (this feature)

```text
specs/050-spec-hygiene-pass-4/
├── spec.md                # /speckit-specify 產出（無 NEEDS CLARIFICATION、checklist 16/16 PASS、含 Clarifications Q1+Q2）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：036-R1 DTO pattern spike + 044-R1 pushgateway image stable tag + 044-R2 axum MatchedPath layer + recorder crate selection + expansion candidates
├── data-model.md          # Phase 1：Phase 0 改動全 diff（DESIGN §4.4.3 + 046 spec FR-015）+ Phase 1 改動全 diff（rust-api 4 file）+ Phase 2 改動全 diff（infra + Dockerfile）+ Phase 3 改動（INTEGRATION-CHECKLIST cleanup）
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V10 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（7 Phase 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**內** TS-DepGraph-Hygiene 1 file（line 35-42 comment polish）+ 跨軌道外 rust-api + spec docs + infra：

```text
base-web/                                                # worktree、單 commit
└── Dockerfile                                           # line 35-42 comment block polish (FR-009)

rust-api/                                                # worktree、單 commit (bundled 4 issues)
├── server/service/src/admin/
│   ├── sys_menu_service.rs                              # 036-R1 selective merge logic (FR-003)
│   └── sys_role_service.rs                              # 037-R1 ptype='g' defensive UPDATE + audit g_rules_updated_count (FR-004)
├── server/model/src/admin/input/
│   └── sys_menu.rs                                      # 036-R1 DTO Option<Option<T>> double-option pattern (FR-003)
├── server/cleanup/
│   ├── src/main.rs                                      # 044-R1 pushgateway recorder install + on-exit flush (FR-005)
│   └── Cargo.toml                                       # 044-R1 +1 dep (or per-crate feature flag)
└── server/core/src/web/
    └── operation_log.rs                                 # 044-R2 axum MatchedPath route extract (FR-007)

outer/                                                   # rev1-admin-root、多 commit per logical
├── docker-compose.observability.yml                    # 044-R1 +pushgateway service block (FR-006)
├── deploy/
│   ├── prometheus.yml                                   # 044-R1 +scrape job pushgateway (FR-006)
│   └── grafana-provisioning/dashboards/*.json           # 044-R1 panel polish (FR-006、optional MAY)
├── docs/
│   ├── INTEGRATION-DESIGN-W-BASE-WEB.md                 # +§4.4.3 050 sprint entry (FR-001)
│   └── INTEGRATION-CHECKLIST.md                        # 8 R-row 結案 + 050 milestone + Current Focus + 046 footnote (FR-013、FR-002)
├── specs/
│   ├── 046-spec-hygiene-pass-3/spec.md                  # FR-015 wording amend (FR-002)
│   └── 044-observability-and-cleanup-pass/spec.md       # FR-005 route label polish (FR-008、optional)
└── CLAUDE.md                                            # SPECKIT marker idle (FR-013)
```

**Structure Decision**：
- **base-web worktree commits**：1 個（Dockerfile line 35-42 comment polish）
- **rust-api worktree commits**：1 個（bundled 4 issues：036/037/044-R1/044-R2 sequential edit 同 commit）
- **outer rev1-admin-root commits**：5-6 個（Phase 0 governance / Phase 2 infra / base-web SHA pin / rust-api SHA pin / INTEGRATION-CHECKLIST + SPECKIT / SHA backfill post-merge）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**base-web worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| 049-R1 Dockerfile comment polish | 1 commit | `Dockerfile`（line 35-42 block replace） |

**rust-api worktree commits（estimated 1 個 bundled）**：

| Topic | est | files |
|---|---|---|
| 050 bundled 4 issues (036-R1 selective merge + 037-R1 ptype='g' + 044-R1 pushgateway recorder + 044-R2 MatchedPath) | 1 commit | `server/service/src/admin/sys_menu_service.rs` + `server/model/src/admin/input/sys_menu.rs` + `server/service/src/admin/sys_role_service.rs` + `server/cleanup/src/main.rs` + `server/cleanup/Cargo.toml` + `server/core/src/web/operation_log.rs` |

**Outer rev1-admin-root commits（estimated 5-6 個）**：

| Topic | est | files |
|---|---|---|
| **Phase 0** DESIGN-W-BASE-WEB.md §4.4.3 050 entry + 046 spec.md FR-015 amend + 044 spec.md FR-005 polish | 1 commit | `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` + `specs/046-spec-hygiene-pass-3/spec.md` + `specs/044-observability-and-cleanup-pass/spec.md` |
| **Phase 2 infra** docker-compose pushgateway service + prometheus.yml scrape + grafana dashboard polish | 1 commit | `docker-compose.observability.yml` + `deploy/prometheus.yml` + (optional) `deploy/grafana-provisioning/dashboards/*.json` |
| base-web SHA pin bump | 1 commit | gitlink `base-web` |
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST 8 R-row 結案 + 050 entry + Current Focus update + CLAUDE.md SPECKIT marker idle | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| SHA backfill（post-merge） | 1 commit | `docs/INTEGRATION-CHECKLIST.md` 050 entry placeholder + `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.3 050 commit SHA placeholder |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：036-R1 DTO `Option<Option<T>>` double-option pattern spike + serde + sea-orm 支援度確認 + fallback update mask pattern
- **R-2**：044-R1 prometheus pushgateway image `v1.10.0` stable tag verify + cleanup binary recorder crate selection (`metrics-exporter-prometheus` push mode vs alternative) + cron-driven 短命 process push 體例 + on-exit flush 紀律
- **R-3**：044-R2 axum 0.8 MatchedPath extractor 用法 + middleware layer 順序 spike + fallback `"unmatched"` cardinality leak prevention
- **R-4**：DESIGN-W-BASE-WEB.md §4.4.3 050 entry wording 設計（對齊 §4.4.1 047.5 retro + §4.4.2 049 sprint 體例）
- **R-5**：046 spec.md FR-015 amend wording 設計（base ≤3 + user 拍板可加大 + commit message body 紀錄 + 046 footnote retro 體例）
- **R-6**：Implementer-stage Expansion 候選（per FR-014 base ≤3 + user 拍板可加大）

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：Phase 0 改動全 diff（DESIGN §4.4.3 + 046/044 spec amend）+ Phase 1 rust-api 4 file diff + Phase 2 infra (docker-compose pushgateway + prometheus.yml + grafana) + Phase 3 INTEGRATION-CHECKLIST cleanup
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V10 acceptance commands
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（7 Phase 落地步驟）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation；TS-DepGraph-Hygiene 軌道 dynamic 行使 via §4.4.3 entry 已就位）
- contracts/verification-commands.md 引入 10 個 C-V、全為 acceptance 驗證手段、不引入新 functional path
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律 + SDD「先合法化、再執行」順序）
- INTEGRATION-CHECKLIST cleanup（FR-013）為 plan 內已界定的後續、無爭議
- DESIGN-W-BASE-WEB.md §4.4.3 entry 為 dynamic 行使、與 Constitution v1.6.0 既有設計同步、無 amendment 需要

**Constitution Check post-Phase 1（v1.6.0）：5/5 PASS、Complexity Tracking 仍空白、0 amendment**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。TS-DepGraph-Hygiene 軌道 dynamic 行使為 Constitution v1.6.0 既有設計、非 Principle violation。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 30-40 tasks：
- Phase 0 (DESIGN §4.4.3 + 046 spec amend + 044 spec polish) — 4-6 tasks
- Phase 1 (rust-api 4 issues bundled impl) — 10-14 tasks
- Phase 2 (docker-compose pushgateway + prometheus scrape + base-web Dockerfile polish + 2 SHA pin) — 6-10 tasks
- Phase 3 (INTEGRATION-CHECKLIST cleanup + acceptance C-V1~C-V10 + outer commits + merge + push + SHA backfill) — 8-12 tasks

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
