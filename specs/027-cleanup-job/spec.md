# Feature Specification: F12 — cleanup-job

**Feature Branch**: `027-cleanup-job`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "F12 cleanup-job — 獨立 cron job,物理刪除已軟刪超過保留期的 row,完成 soft-delete 資料生命週期。per docs/superpowers/027-feature-cleanup-job.md brainstorm doc(4 拍板點)。一次性 `cleanup` binary(複用 rust-api image、比照 migration 多 binary)+ host cron 觸發;物理刪 7 張軟刪表 deleted_at < 保留期 的 row;dry-run 為預設、真刪需 --execute;每筆刪除寫 HARD_DELETE audit;獨立最小權限 DB credential;不碰 casbin_rule;無 migration。"

**Source**: [`docs/superpowers/027-feature-cleanup-job.md`](../../docs/superpowers/027-feature-cleanup-job.md)(brainstorming 2026-05-21 session、4 拍板點)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §6.1 — F12 `cleanup-job`:「獨立 cron job(rust binary 或 standalone container);threshold 從 config 讀;dry-run mode;獨立最小 credential;物理刪除寫 audit」;Phase 4(P4)、依賴 F3 + F2
  - §5.2.3 — Cleanup job 安全 + Audit log 成長:風險(誤刪非預期 row、共用 credential 擴大攻擊面、重跑非 idempotent)+ 緩解(獨立最小權限 credential、threshold 從 config、dry-run、物理刪除寫 audit、idempotent 基於 `deleted_at < threshold`)
  - §1.5 / §5.2.1 — 資料變動原則:業務變動 + audit **同一 DB transaction**
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle II「Soft Delete + Audit」、Principle I「RBAC fail-safe」、Principle IV「base 不改動邊界」
- F3 `soft-delete-infrastructure`(merge `0f1c5c3`)+ F2.1 `audit-log-infrastructure`(merge `209a2c8`)— F12 直接前置
- W-F11 baseline(剛 merge):outer `d02c7c9` + merge `d2d4c4c`、rust-api `d122b23`(本 branch `027-cleanup-job` 從 `rev1-admin-root` 衍生)
- F8 / W-F11 implement-time pattern「兩段式 commit、curl + psql + docker exec acceptance、無 e2e framework」— F12 沿用

**Scope summary**:F12 = **DESIGN-A 本體(F1–F12)收尾** — DESIGN-A §6.1 Phase 4(P4)最後一個 application feature。F3 給 7 張 admin 表加 `deleted_at`、刪除改軟刪;軟刪 row 永遠留表內 → F12 提供一個獨立 cron job 定期物理清除過期軟刪 row。

| 面向 | F12 deliverable |
|---|---|
| **執行形態** | rust workspace 新增獨立 binary `cleanup`(新 crate `server/cleanup`)、比照既有 `server`/`migration` 多 binary、複用 rust-api docker image |
| **觸發** | 一次性 binary(跑完即退、回 exit code),host crontab `docker compose run --rm cleanup --execute` 週期觸發 |
| **刪除範疇** | 7 張軟刪表 `deleted_at < (now − 保留期)` 的 row;**不碰 `casbin_rule`** |
| **安全姿態** | dry-run 為預設、真刪需顯式 `--execute`;獨立最小權限 DB credential |
| **audit** | 每筆物理刪除寫一筆 `sys_operation_log`(`HARD_DELETE`、`actor=cleanup_job`)、與 `DELETE` 同 transaction |

**Commit 模式**(F12 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F8/W-F11):rust-api worktree 1 commit(新 crate `server/cleanup` + Dockerfile 改)+ outer 1 commit(`docker-compose.yml` `cleanup` service + `deploy/` setup SQL + spec docs + INTEGRATION-CHECKLIST)+ merge `--no-ff` + SHA fill follow-up。
- **有 `docker-compose.yml` 改**(加 profiled service);**無 DB migration**(`cleanup_job` role 走文件化手動 `psql` setup)。

**範疇外**:
- ❌ 不碰 `casbin_rule` — casbin orphan cleanup 留 follow-up
- ❌ 物理刪除前 N 天通知(§5.2.3「可選」、stack 無通知基礎設施 → YAGNI)
- ❌ per-table 不同 retention(單一全域保留天數)
- ❌ `sys_operation_log` 自身的 cleanup / partition / retention(audit 本身不 cleanup)
- ❌ F3-N2 `sys_access_key` validator orphan key(屬 soft-delete-time atomicity gap、F2.2 outbox 範疇)
- ❌ 不改 base-web SPA src / `.env`、不動 nestjs fork
- ❌ 無 DB migration、不改 DB schema、不實作 §5.2.2 的 soft-delete-time casbin cascade

## Clarifications

### Session 2026-05-21(brainstorming 階段拍板、4 拍板點)

- **Q1 (brainstorm)**: F12 怎麼被定期觸發?→ **A:一次性 binary + host cron**。cleanup binary 跑完即退(像 `migration`);host crontab 定時 `docker compose run --rm cleanup --execute`。packaging 沿用 `migration` 先例(rust workspace 加第 3 個 binary、同 Dockerfile build、複用 rust-api image、compose service 帶獨立 secret)。對比「binary 自帶常駐排程」與「cron-sidecar 容器」。

- **Q2 (brainstorm)**: 物理刪除時要不要連帶清 `casbin_rule` orphan?→ **A:F12 v1 narrow、不碰 `casbin_rule`**。F12 只物理刪 7 張軟刪表。理由:§6.1/§5.2.3 的 F12 定義都沒提 casbin;§5.2.3 獨立 credential 明訂未含 `casbin_rule`;hard-deleted user/role 永不再認證/指派 → orphan casbin row 是 inert clutter、非安全漏洞;`casbin_rule` 無 `deleted_at`、套不上 idempotent 模式。casbin orphan cleanup 留 follow-up。

- **Q3 (brainstorm)**: dry-run / 安全姿態?→ **A:dry-run 為預設、真刪需顯式 `--execute`**。`cleanup`(無參數)= dry-run(查詢 + 報告、不刪、不寫 audit);`cleanup --execute` 才真刪。理由:§5.2.3 把「誤刪非預期 row、threshold 配錯」列為首要風險;忘加 flag 的後果是「沒刪」(安全)而非「誤刪」(危險)。

- **Q4 (brainstorm)**: 獨立最小權限 DB credential 怎麼 bootstrap?→ **A:文件化的一次性 `psql` setup**。F12 附 idempotent setup SQL(`CREATE ROLE cleanup_job` + `GRANT`)+ quickstart/runbook;ops 首次部署手動跑一次。cleanup binary 讀獨立 secret 檔 `cleanup_database_url`。理由:避開「migration 無法讀 secret」的雞生蛋;role + grant 屬基礎設施 setup 非 schema。對比「migration 建 role」與「v1 複用 app credential」。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 定期物理清除過期軟刪資料(Priority: P1)🎯 MVP

`operator` 在部署環境設定一條 host cron,週期性觸發 cleanup job。job 物理刪除 7 張軟刪表中 `deleted_at` 已超過保留期(預設 90 天)的 row,使軟刪資料不無限累積。每筆物理刪除都寫一筆 `HARD_DELETE` audit log(留痕),且 job 用一組僅能刪這 7 張表 + 寫 audit 的最小權限 DB credential 執行。首次部署或調整保留期時,operator 可先以 dry-run 模式(預設、不加旗標)跑一次,確認「將刪幾筆、各表明細」無誤後,才在 crontab 用 `--execute` 排正式刪除。

**Why this priority**:F12 唯一 deliverable,也是 DESIGN-A 本體(F1–F12)的最後一塊。沒有它,F3 軟刪的 row 永遠留在表內、表無限成長、查詢效率與儲存持續惡化 — soft-delete 資料生命週期不完整。

**Independent Test**:psql 在某軟刪表植入一筆 `deleted_at` 設為超過保留期的測試 row → 跑 `cleanup`(dry-run)確認報告列出該 row 且表內 row 數不變 → 跑 `cleanup --execute` 確認該 row 物理消失、`sys_operation_log` 多一筆對應 `HARD_DELETE` → 重跑確認 idempotent(0 row)。

**Acceptance Scenarios**:

1. **Given** rust-api image 已含 `cleanup` binary、`cleanup_job` DB role 已建立,**When** 執行 `docker compose run --rm cleanup`(無旗標),**Then** job 報告「將刪 N row、各表明細」、回 exit code 0,且 7 張表 row 數與 `sys_operation_log` 筆數**皆不變**(dry-run 不刪不寫)。
2. **Given** 某軟刪表有一筆 `deleted_at` 超過保留期的 row,**When** 執行 `cleanup --execute`,**Then** 該 row 從表內物理消失,且 `sys_operation_log` 新增一筆 `operation=HARD_DELETE`、`actor=cleanup_job`、含該 row before-snapshot 的紀錄。
3. **Given** US1.2 的 `--execute` 已跑過,**When** 再次執行 `cleanup --execute`,**Then** job 報告 0 筆待刪、無任何 row 被刪、無新 audit(idempotent)。
4. **Given** 某軟刪表有一筆 `deleted_at` **未**超過保留期的 row,**When** 執行 `cleanup --execute`,**Then** 該 row **不**被刪(未到保留期)。
5. **Given** retention 設定缺失或為無效值(非正整數),**When** 執行 `cleanup`,**Then** job 拒絕執行、回非 0 exit code、不刪任何 row。
6. **Given** `cleanup_job` DB role,**When** 用它嘗試 `SELECT` 非軟刪範疇的表 / `DROP` / 改 schema,**Then** 被 Postgres 權限拒絕(最小權限驗證)。
7. **Given** F12 落地,**When** 檢查 base-web / nestjs fork / DB migration,**Then** base-web 與 nestjs fork 零改動、無新 migration、`casbin_rule` 零改動。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `CLEANUP_RETENTION_DAYS` 未設定 / 無效值 | job 拒跑、回非 0 exit code、不刪任何 row(per US1.5) |
| E-2 | DB 連不上 | job log error、回非 0 exit code、不刪任何 row |
| E-3 | 單筆 row 的刪除 transaction 失敗 | log error、跳過該 row 繼續下一筆;job 結束時回非 0 exit code 表示有失敗 |
| E-4 | 無任何過期 row | job 正常結束、回 exit code 0、報告「0 row」 |
| E-5 | 重跑(同一保留期、無新軟刪) | idempotent — 已刪 row 不再出現於查詢、無副作用、無新 audit |
| E-6 | dry-run 模式 | 只查詢 + 報告,絕不刪除、絕不寫 audit |

## Requirements *(mandatory)*

### Functional Requirements

**A. cleanup binary 與打包**

- **FR-001**: rust workspace MUST 新增獨立 binary `cleanup`(新 crate),與既有 `server` / `migration` binary 同 Dockerfile build、`cleanup` binary MUST 被 COPY 進 rust-api docker image。
- **FR-002**: `cleanup` MUST 為一次性執行(執行一輪 sweep 後即退出、回 exit code);MUST NOT 為常駐進程、MUST NOT 自帶內部排程。
- **FR-003**: `docker-compose.yml` MUST 新增 `cleanup` service(複用 rust-api image、entrypoint 指向 cleanup binary、`restart: "no"`、置於一個 profile 下使其不隨 `docker compose up` 自動啟動、`depends_on` postgres healthy)。

**B. CLI 行為與設定**

- **FR-004**: `cleanup` 無旗標執行時 MUST 為 **dry-run** — 只查詢過期軟刪 row 並報告「將刪 N row 及各表明細」,MUST NOT 刪除任何 row、MUST NOT 寫任何 audit。
- **FR-005**: `cleanup` MUST 僅在收到顯式 `--execute` 旗標時才執行物理刪除。
- **FR-006**: 保留期 MUST 從設定(環境變數 `CLEANUP_RETENTION_DAYS`)讀取、MUST NOT 寫死於程式;預設值為 **90** 天。
- **FR-007**: 保留期設定缺失或為無效值(非正整數)時,`cleanup` MUST 拒絕執行、回非 0 exit code、不刪任何 row。
- **FR-008**: `cleanup` MUST 以 process exit code 表示結果 — 全程成功回 0、有任一刪除失敗回非 0(供 host cron 偵測告警)。

**C. 刪除邏輯**

- **FR-009**: `cleanup --execute` MUST 物理刪除 7 張軟刪表(`sys_user` / `sys_role` / `sys_menu` / `sys_domain` / `sys_organization` / `sys_endpoint` / `sys_access_key`)中符合 `deleted_at IS NOT NULL AND deleted_at < (now − 保留期)` 的 row。
- **FR-010**: F12 MUST NOT 觸碰 `casbin_rule`(casbin orphan cleanup 不在 F12 範疇,per Q2)。
- **FR-011**: 每筆物理刪除 MUST 在單一 DB transaction 內完成 `DELETE` + audit `INSERT`(per Constitution Principle II / DESIGN-A §1.5 / §5.2.1 — 業務變動與 audit 原子)。
- **FR-012**: `cleanup` MUST 為 idempotent — 基於 `deleted_at < 保留期 cutoff` 條件查詢,重跑無副作用。
- **FR-013**: 單筆 row 的刪除 transaction 失敗 MUST 記錄 error 並繼續處理下一筆(log-and-continue);job 結束時 MUST 以非 0 exit code 反映曾有失敗。

**D. Audit**

- **FR-014**: `cleanup --execute` 的每筆物理刪除 MUST 寫一筆 `sys_operation_log`,`operation = HARD_DELETE`、`actor = cleanup_job`(job 自身為 actor)、含被刪 row 的 before-snapshot。
- **FR-015**: dry-run 模式 MUST NOT 寫任何 audit 紀錄。

**E. 獨立 credential**

- **FR-016**: `cleanup` MUST 使用獨立的最小權限 DB credential(專屬 Postgres role,權限限於 7 張軟刪表的 `SELECT` + `DELETE`、`sys_operation_log` 的 `SELECT` + `INSERT`);MUST NOT 複用一般 backend 的 app DB credential。
- **FR-017**: F12 MUST 提供文件化的 idempotent role setup SQL(`CREATE ROLE` + `GRANT`)與 runbook 說明,由 ops 首次部署手動執行;MUST NOT 用 DB migration 建立該 role。
- **FR-018**: `cleanup` MUST 從獨立 secret 檔(`cleanup_database_url`)讀取其 DB 連線;該 secret MUST 為 gitignored、由 ops 提供。

**F. 通用範疇 / 紀律**

- **FR-019**: F12 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV)。
- **FR-020**: F12 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file。
- **FR-021**: F12 MUST 不新增 DB migration、不改 DB schema。
- **FR-022**: F12 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**有 `docker-compose.yml` 改、無 migration**。
- **FR-023**: F12 acceptance MUST 用 inline bash(`curl` 非必要、`psql` + `docker compose run` / `docker compose exec`)+ `contracts/`,不新建 deploy script、不引入 e2e test framework。
- **FR-024**: F12 對 docker-compose 的改動 MUST 只限 base `docker-compose.yml`(新增 `cleanup` service);MUST 不改 `docker-compose.dev.yml` / `docker-compose.prod.yml`。
- **FR-025**: F12 MAY 為純函式部分(保留期 → cutoff timestamp 計算、無效保留期判斷、dry-run 報表格式)加 rust unit test;物理刪除為 DB IO 邊界、以 acceptance 驗證。
- **FR-026**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新(F12 row 的 spec/plan/tasks/impl 欄推進、加 F12 完成里程碑、Current Focus 推進)。

### Key Entities

- **過期軟刪 row** — 7 張軟刪表中 `deleted_at` 已超過保留期 cutoff 的 row,F12 物理刪除的對象。
- **`HARD_DELETE` audit 紀錄**(`sys_operation_log`、F12 寫入)— 每筆物理刪除對應一筆,`operation=HARD_DELETE`、`actor=cleanup_job`、含 before-snapshot。
- **`cleanup_job` DB role**(Postgres role、F12 新增、文件化手動建立)— 獨立最小權限 credential,僅能刪 7 張軟刪表 + 寫 `sys_operation_log`。
- **保留期設定**(`CLEANUP_RETENTION_DAYS`、預設 90)— 決定 row「過期」的天數門檻,從設定讀取、不寫死。
- **`cleanup` binary / compose service**(rust-api image 內第 3 個 binary;`docker-compose.yml` 的 profiled service)— 一次性執行單元,host cron 透過 `docker compose run` 觸發。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F12 落地後,`cleanup` 無旗標執行只報告不刪除 — 7 張表 row 數與 `sys_operation_log` 筆數在 dry-run 前後完全不變。
- **SC-002**: F12 落地後,`cleanup --execute` 物理刪除全部 `deleted_at` 超過保留期的軟刪 row,且未超過保留期的軟刪 row 與 active row 不受影響。
- **SC-003**: F12 落地後,每筆物理刪除在 `sys_operation_log` 留下一筆 `HARD_DELETE` 紀錄(`actor=cleanup_job` + before-snapshot)。
- **SC-004**: F12 落地後,`cleanup --execute` 重跑為 idempotent — 第二次執行刪 0 row、無新 audit、無副作用。
- **SC-005**: F12 落地後,保留期設定缺失/無效時 `cleanup` 拒跑並回非 0 exit code、不刪任何 row。
- **SC-006**: F12 落地後,`cleanup_job` DB role 僅能對 7 張軟刪表 `SELECT`/`DELETE` 與對 `sys_operation_log` `SELECT`/`INSERT`,對其他操作(讀無關表、`DROP`、改 schema)被 Postgres 拒絕。
- **SC-007**: F12 不動 base-web(`git diff` 無輸出)。
- **SC-008**: F12 不動 nestjs fork(`git diff` 無輸出)。
- **SC-009**: F12 無新 DB migration、不改 DB schema、`casbin_rule` 零改動。
- **SC-010**: F12 對 docker-compose 的改動只限 base `docker-compose.yml`(`docker-compose.dev.yml` / `docker-compose.prod.yml` `git diff` 無輸出)。
- **SC-011**: F12 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。
- **SC-012**: `docs/INTEGRATION-CHECKLIST.md` 的 F12 row 與 Current Focus 獲更新(per FR-026)。

## Assumptions

- **A-001**: F3 `soft-delete-infrastructure` 已為 7 張 admin 表(`sys_user` / `sys_role` / `sys_menu` / `sys_domain` / `sys_organization` / `sys_endpoint` / `sys_access_key`)加上 `deleted_at` 欄位;F12 物理刪除範疇即此 7 張表。
- **A-002**: F2 `audit-log-infrastructure` 已建立 `sys_operation_log` 與 audit 寫入機制;F12 沿用其寫入路徑寫 `HARD_DELETE` 紀錄,`actor` 欄位可表示非-user 的 system/job actor(`cleanup_job`)— 實際 actor 欄位結構於 plan Phase 0 確認。
- **A-003**: rust-api Dockerfile 既有 multi-binary build 模式(已同時 build `server` + `migration`);F12 加 `cleanup` 為第 3 個 binary、沿用此模式。
- **A-004**: 保留期預設 90 天為合理預設值(可由部署環境經 `CLEANUP_RETENTION_DAYS` 覆寫)。
- **A-005**: 排程由部署主機的 host cron 負責(`docker compose run --rm cleanup --execute`);F12 不在 stack 內提供排程機制。
- **A-006**: 部署環境的 Postgres 允許建立額外 role 並授權;`cleanup_job` role 由 ops 依 F12 提供的 setup SQL 於首次部署手動建立。
- **A-007**: secret 以 gitignored 檔案 + compose `secrets:` 注入(per W-F4 既有機制);F12 新增 `cleanup_database_url` secret 沿用此機制。
- **A-008**: `casbin_rule` 無 `deleted_at`、不在軟刪範疇;hard-deleted user/role 的 orphan casbin row 為 inert clutter、不構成安全問題 → F12 v1 不處理(per Q2)。

## Dependencies

### Inbound(本 feature 依賴)

- **F3** `soft-delete-infrastructure`:7 張表的 `deleted_at` 欄位與軟刪機制 — F12 物理刪除的前提。✅(merge `0f1c5c3`)
- **F2.1** `audit-log-infrastructure`:`sys_operation_log` 與 audit 寫入機制 — F12 的 `HARD_DELETE` audit 依賴此。✅(merge `209a2c8`)
- **W-F4** `secret-injection`:Docker secrets 機制 — F12 的 `cleanup_database_url` secret 沿用。✅

### Outbound(本 feature 解鎖)

- **DESIGN-A 本體完成**:F12 完成後,DESIGN-A §6.1 的 F1–F12 application feature 全落地,DESIGN-A 本體收尾。
- 後續(非 F12 解鎖、屬 DESIGN-A→B 遷移):F13 `rust-refresh-token-impl` / F14 `design-a-to-b-cutover`。

### Follow-up(F12 範疇外、留後續)

- `casbin_rule` orphan cleanup(F12 不碰、per Q2)。
- `sys_operation_log` 自身的 partition / retention 策略(§5.2.3 點出 audit 表成長)。
- F3-N2 `sys_access_key` validator orphan key(soft-delete-time atomicity gap、F2.2 outbox 範疇)。
