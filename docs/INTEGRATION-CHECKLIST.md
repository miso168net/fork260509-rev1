# INTEGRATION-CHECKLIST — rev1 整合進度追蹤

> 此檔 = 進度追蹤 + brainstorming 決策快照 + 跨 feature 待驗證項。
> 不放原則（→ `.specify/memory/constitution.md`）、不放規格細節（→ `specs/<NNN>/`）、不放操作參考事實（如預設帳號 → CLAUDE.md §5）。
> 每次 session SOP hook（`.claude/hook-git-submodule-SOP.sh`）自動 cat 本檔 head section 注入到 Claude session 第一輪 additional context。

---

## 🎯 Current Focus

**Phase**：P1 基礎設施（必先 4 個 feature）— **2/4 完成**
**Active feature**：F2 `audit-log-infrastructure` ✅ F2.1 spec + clarify + plan + **tasks** 完成（`specs/003-audit-log-infrastructure/` 含 spec.md / plan.md / research.md / data-model.md / contracts/internal-api.md / quickstart.md / checklists/requirements.md / **tasks.md 37 tasks**）— **待 `/speckit-analyze`（optional）或 `/speckit-implement` 接手**
**Next after F2.1**：F1 `jwt-secrets`（P1 最後一塊；F2.1 / F1 任一順序皆可、per DESIGN-A §6.2）

---

## 已完成里程碑

- [x] outer git init + push（`miso168net/fork260509-rev1`、default branch `rev1-admin-root`）
- [x] worktree + submodule 配置（`base-web` / `rust-api` 雙重身分；CLAUDE.md §9 操作手冊）
- [x] spec-kit v0.8.7 + extensions（before_specify pre-hook → `speckit.git.feature`）
- [x] constitution v1.0.0（`.specify/memory/constitution.md`、Principle I-V）
- [x] **F4 response-shape-alignment** ✅（2026-05-12 完成；outer `3d357e5`、rust-api `82bbde5`；spec `specs/001-response-shape-alignment/`）
- [x] **F3 soft-delete-infrastructure** ✅（2026-05-14 完成；outer `6941788` + merge `0f1c5c3`、rust-api `2a65e2c`；spec `specs/002-soft-delete-infrastructure/`）

---

## Phase 1 P1 Roadmap（per DESIGN-A §6.1）

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| F1 | `jwt-secrets` | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | 待 brainstorm |
| F2 | `audit-log-infrastructure` | ✅ | ✅ | ✅ | ✅ | ⏳ | 待 `/speckit-implement` |
| F3 | `soft-delete-infrastructure` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**（commits 上方） |
| F4 | `response-shape-alignment` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**（commits 上方） |

§6.2 規則：**P1 4 個任一順序皆可（平行 spec-kit）、但必須全部完成才能動 P2**。

Phase 2-5 features（F5-F14）待 P1 全完成後啟動。

---

## Brainstorming 決策快照

### F2.1 `audit-log-infrastructure`（進行中、brainstorm 2026-05-14 起）

> Source: `docs/superpowers/003-feature-audit-log-infrastructure.md`（brainstorm 完成後存檔）
> Parent design：DESIGN-A §1.5（全域 audit 紀律）+ §5.2.1（audit 完整性）

| # | Decision | Choice |
|---|---|---|
| 1 | F2 scope 拆分 | **F2.1 先交**：schema 擴 + transaction 紀律 + INSERT/UPDATE audit + 統一 audit path；outbox + Redis subscriber TTL fallback 留 F2.2 |
| 2 | audit 寫入路徑 | 統一為單一 audit context API（取代 HTTP middleware path + F3 `method="INTERNAL"` sentinel hack 並存）|
| 3 | sys_operation_log schema 新欄 | 4 個：`operation` enum（INSERT/UPDATE/SOFT_DELETE/RESTORE/HARD_DELETE）+ `entity_id` + `payload_before` JSONB + `payload_after` JSONB |
| 4 | INSERT/UPDATE 觸發 | Manual — service handler 顯式呼叫（同 F3 facade soft_delete 風格）|
| 5 | payload 內容格式 | Entity 完整 snapshot（`serde_json::to_value(&model)`、storage 成本 admin-heavy 場景可接受）|
| 6 | sensitive field redaction | Trait-based — `AuditSerialize::redacted_fields() -> &[&str]`、sys_user 含 `password`、sys_access_key 含 `access_key_secret` |
| 7 | Implementation approach | **Approach A**：`AuditEvent` struct + `audit_log::write_in_txn` helper（漸進演進 F3 既有 pattern）|

#### `/speckit-clarify` Session 2026-05-14 額外 3 個拍板

| # | Decision | Choice |
|---|---|---|
| 8 | HTTP middleware + service-level audit 雙寫 row 怎麼鎖？ | **Always double-write** — 同一 admin HTTP write 留 2 row（HTTP 視角 method=POST 等 + service-level method=INTERNAL）、middleware 不 dedupe |
| 9 | HTTP middleware audit row entity_type 怎麼填？ | **Hybrid rule** — URL match 7 條 admin pattern `/api/sys-(user|role|menu|domain|organization|endpoint|access-key)/*` 對應 `sys_<x>`、不 match fallback `"http_event"` |
| 10 | Migration `datas/*` seeding INSERT 是否 audit？ | **Exempt** — F2.1 audit 範圍只含 application runtime write（service + middleware）；seeding 走 git tracked migration 檔留紀錄 |

→ Spec / plan / research / data-model / contracts / quickstart 全在 `specs/003-audit-log-infrastructure/`、待 `/speckit-tasks` 接手產 dependency-ordered tasks.md。

### F3 `soft-delete-infrastructure`（已完成、archived）

→ `docs/superpowers/002-feature-soft-delete-infrastructure.md`

### F4 `response-shape-alignment`（已完成、archived）

→ `docs/superpowers/001-feature-response-shape-alignment.md`

---

## 跨 feature 的待驗證項（Assumptions）

依 constitution §IV「上游驗證」規則 — 帶上 feature spec.md Assumptions 段、實作時驗、驗完勾掉並回填結果。

- [x] **預設密碼 = `123456`** — 舊 workspace fork260509 已驗、CLAUDE.md §5.1 已記錄；rev1 第一個 login flow feature 跑通時再次動態驗證
- [ ] **rev1 dev DB 起動 + migrations 套用 OK** — F3 G11 acceptance test 需此；deploy/ stack 起來才能驗
- [ ] **F3 quickstart Step 7 端到端**（curl login + admin soft-delete + 8888 envelope）— 需 real postgres + redis + rust-api server 起；目前 deploy/ 尚未建立
- [ ] **F3 acceptance tests 跑通**（`cargo test --test soft_delete_basics -- --ignored` × 3 test files、共 9 個 `#[ignore]` test fn）— 需 export `TEST_DATABASE_URL` + migration up
- [ ] **CI lint workflow 在實際 PR 觸發 + block merge** — `.github/workflows/ci-soft-delete-lint.yml` 已建、待第一個 PR 觸發驗證

---

## Deferred / future backlog

### F3 完成後留下的 follow-up

| ID | 範疇 | 處理 | 備註 |
|---|---|---|---|
| F3-N1 | `sys_endpoint::insert_many` fully-qualified | F2.1 評估 | 服務內 `server_model::admin::entities::sys_endpoint::Entity::insert_many(...)` 繞 facade、註解明示合規（facade 只封 SELECT/DELETE）；若 F2.1 audit path 要納 INSERT，facade 補 `insert_many` wrapper 是自然動作 |
| F3-N2 | `sys_access_key` delete atomicity gap | F2.2 / F12 評估 | facade commit → `sign::remove_key` validator 兩行間 process crash 留 validator orphan key；改 DB-as-truth + initialize 重 reload pattern；F2.2 outbox 模式或 F12 cleanup-job 階段處理 |
| F3-N3 | `sys_endpoint::batch_remove_endpoints` partial-failure | F2.1 / F2.2 | 改 log-and-continue 後失去 atomicity；F2.2 outbox 模式可重整 |
| F3-N4 | pre-existing `print!("user is {:#?}", user)` debug 痕 | 任一後續 feature 順手清 | F3 G6 review 發現既有 pre-F3 code、F3 沒清；3 處：sys_user_api / sys_menu_api / sys_authorization_service |
| F3-N5 | `data-model.md §E4` 範例 path 與實際 impl 位置 drift | spec hygiene | spec §E4 範例假設 impls 在 server-core、實際因循環 dep 落在 server-model/src/admin/soft_delete_impls.rs（per analyse C3 precedent）；建議補 errata 一行 |
| F3-N6 | F2 audit-log schema 升級後 F3 helper 對齊 | F2.1 內處理 | F3 FR-022 已預告「F2 升級 sys_operation_log schema 時、F3 callsite 不需動」— F2.1 refactor write_in_txn 時順帶完成 |

---

## 維護指引

每次 feature 推進後，**在同一個 commit 內**更新本檔：

| 階段 | 改 roadmap 表的哪欄 |
|---|---|
| brainstorm 完成（`docs/superpowers/<NNN>-feature.md` 寫定）| Brainstorm 欄改 ✅ + 決策快照寫入本檔對應 section |
| `/speckit-specify` 完成 | spec 欄改 ✅ |
| `/speckit-plan` 完成 | plan 欄改 ✅ |
| `/speckit-tasks` 完成 | tasks 欄改 ✅ |
| 實作 merge 回 default | impl 欄改 ✅、狀態欄改「完成」、加 outer + worktree commit SHA |
| 上游驗證項 done | 把對應勾選改 ✅、結果回填 CLAUDE.md（操作事實）或 spec.md（feature-specific）|

驗證證據（cargo test log、curl 輸出、psql 結果）放在 spec.md / plan.md / quickstart.md、本檔僅勾選與簡述。
