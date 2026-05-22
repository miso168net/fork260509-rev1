# F12 — cleanup-job

**Date**: 2026-05-21
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-21(4 拍板點;W-F11 收尾 Phase W deploy P4 後,回 DESIGN-A 本體做最後一個 application feature — DESIGN-A §6.1 Phase 4 P4 的 F12)

---

## Scope summary

F12 = **soft-delete 資料生命週期收尾** — 一個獨立 cron job,物理刪除已軟刪超過保留期的 row。DESIGN-A §6.1 Phase 4(P4)最後一個 application feature、**DESIGN-A 本體(F1–F12)收尾**。

F3 `soft-delete-infrastructure` 給 7 張 admin 表加了 `deleted_at`、刪除操作改為軟刪;但軟刪 row 永遠留在表內 → 需要一個獨立機制定期物理清除過期軟刪 row,否則表無限成長。F12 即此機制。

| 面向 | 內容 |
|---|---|
| **執行形態** | rust workspace 新增第 3 個 binary `cleanup`(比照既有 `server` / `migration` 多 binary 模式)、複用 rust-api docker image |
| **觸發** | 一次性 binary(跑完即退),host crontab `docker compose run --rm cleanup --execute` 週期觸發 |
| **刪除範疇** | 7 張軟刪表 `deleted_at < (now − retention)` 的 row;**不碰 `casbin_rule`** |
| **安全姿態** | dry-run 為預設、真刪需顯式 `--execute`;獨立最小權限 DB credential |
| **audit** | 每筆物理刪除寫一筆 `sys_operation_log`(`HARD_DELETE`、`actor=cleanup_job`)、與 `DELETE` 同 transaction |

範疇刻意收緊到「**物理清除過期軟刪 row + 寫 audit + curl/psql/docker-exec acceptance**」、**不改 base-web / 不改 nestjs / 不碰 casbin_rule / 不做通知 / 不 cleanup audit 表本身**。

**Commit 模式**(F12 固定):
- **兩段式** commit(per CLAUDE.md §4.1、類 F8/W-F11):rust-api worktree 1 commit(新 crate `server/cleanup` + Dockerfile 改)+ outer 1 commit(`docker-compose.yml` `cleanup` service + `deploy/` setup SQL + spec docs + INTEGRATION-CHECKLIST)+ merge `--no-ff` + SHA fill follow-up。
- **有 docker-compose.yml 改**(加 profiled service);**無 DB migration**(`cleanup_job` role 走文件化的手動 `psql` setup、見 Q4)。

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §6.1 — F12 `cleanup-job`:「獨立 cron job(rust binary 或 standalone container);threshold 從 config 讀;dry-run mode;獨立最小 credential;物理刪除寫 audit」;依賴「F3, F2」、Phase 4(P4)
  - §5.2.3 — Cleanup job 安全 + Audit log 成長:風險(誤刪非預期 row、共用 credential 擴大攻擊面、重跑非 idempotent)+ 緩解(獨立最小權限 credential、threshold 從 config、dry-run、物理刪除寫 audit、idempotent 基於 `deleted_at < threshold`)
  - §5.2.2 — Soft delete 衍生:soft-delete 三風險;其中「User soft delete 後 casbin policy orphan」的 cascade「spec-kit 階段拍板」— **實際從未實作**(見既有現況)
  - §1.5 / §5.2.1 — 資料變動原則:業務變動 + audit **同一 DB transaction**
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle II「Soft Delete + Audit」— F12 的物理刪除是 soft-delete 生命週期的終點;每筆物理刪除寫 audit,延續「全域 audit」紀律
  - Principle I「RBAC fail-safe」— F12 不碰 enforce 邏輯;獨立最小權限 credential 收斂攻擊面
- [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) Deferred backlog:
  - F3-N2 `sys_access_key` validator orphan key — 標註「F2.2 / F12 評估」;brainstorm 判定屬 soft-delete-time atomicity gap(F2.2 outbox 範疇)、**非 F12 hard-delete cleanup 範疇**,F12 不納入
- W-F11 baseline(剛 merge):outer `d02c7c9` + merge `d2d4c4c`、rust-api `d122b23`(F12 從 `rev1-admin-root` 衍生)
- F3 `soft-delete-infrastructure`(merge `0f1c5c3`)/ F2.1 `audit-log-infrastructure`(merge `209a2c8`)— F12 直接前置;F8 / W-F11 的「兩段式 commit、curl + psql acceptance、無 e2e framework」pattern — F12 沿用

---

## 既有現況(brainstorm 階段 grep 確認、2026-05-21)

**soft-delete 範疇(F3 交付)**:

| 元件 | 狀態 / 位置 |
|---|---|
| 7 張軟刪表 | `sys_user` / `sys_role` / `sys_menu` / `sys_domain` / `sys_organization` / `sys_endpoint` / `sys_access_key` — 各加 `deleted_at`(migration `m20260514_a`–`g`) |
| `SoftDeletable` trait | `server-core::db::soft_delete::SoftDeletable`;7 個 impl 在 `server/model/src/admin/soft_delete_impls.rs`(每 impl 帶 `DELETED_AT_COLUMN` + `ENTITY_TYPE`) |
| 軟刪 + audit pattern | `facade::sys_user::soft_delete_by_id` — 開 txn、fetch before-snapshot(`deleted_at IS NULL` 的 active row)、軟刪、寫 audit、commit。F12 物理刪除比照此 fetch-before + audit-in-txn 模式 |
| `casbin_rule` | **無 `deleted_at`** — 不在軟刪範疇;欄位僅 `id / ptype / v0..v5`。user/role soft-delete **不** cascade `casbin_rule`(§5.2.2 的 cascade「spec-kit 階段拍板」實際從未實作)→ F12 v1 不碰(見 Q2) |

**rust-api binary / 部署現況**:

| 元件 | 狀態 / 位置 |
|---|---|
| 多 binary 模式 | Dockerfile 已 `cargo build --bin server --bin migration`、兩個 binary 都 `COPY` 進 image;`server/bin` crate 產 `server`、`migration/` crate 產 `migration` |
| job service 先例 | `docker-compose.yml` 的 `migration` service:複用 `image: rust-api:...`、`entrypoint` override、`restart: "no"`、`secrets: [database_url]`、`depends_on: postgres healthy` — 一次性 job 的既成 pattern |
| 排程 | stack 內**無任何 cron / 排程機制**;`migration` 是 stack 啟動時跑一次。F12 的週期觸發須新引入(見 Q1) |
| secret | per W-F4,secret 為 `deploy/secrets/*.txt` gitignored 檔、ops 手動提供、compose `secrets:` 注入 |

---

## Clarifications(brainstorm 2026-05-21、4 拍板點)

- **Q1 (brainstorm)**: F12 怎麼被定期觸發?→ **A:一次性 binary + host cron**。cleanup binary 跑完即退(像 `migration`);host crontab 定時 `docker compose run --rm cleanup --execute`。packaging 沿用 `migration` 先例(rust workspace 加第 3 個 binary、同 Dockerfile build、複用 rust-api image、compose service 帶獨立 secret)。對比「binary 自帶常駐排程」(多一個長駐容器)與「cron-sidecar 容器」(多一個 image + crontab 配置)。

- **Q2 (brainstorm)**: 物理刪除時要不要連帶清 `casbin_rule` orphan?→ **A:F12 v1 narrow、不碰 `casbin_rule`**。F12 只物理刪 7 張軟刪表。理由:(1) §6.1 與 §5.2.3 的 F12 定義都沒提 casbin;(2) §5.2.3 明訂獨立 credential =「DELETE 對 entity 表 + INSERT 對 sys_operation_log」未含 `casbin_rule`;(3) hard-deleted user/role 永不再認證/指派 → orphan casbin row 是 inert clutter、非安全漏洞;(4) `casbin_rule` 無 `deleted_at`、套不上 `deleted_at < threshold` 的 idempotent 模式。casbin orphan cleanup 留 follow-up。

- **Q3 (brainstorm)**: dry-run / 安全姿態?→ **A:dry-run 為預設、真刪需顯式 `--execute`**。`cleanup`(無參數)= dry-run(查詢 + 印「將刪 N row / 各表明細」、不刪、不寫 audit);`cleanup --execute` 才真刪。理由:§5.2.3 把「誤刪非預期 row、threshold 配錯」列為首要風險;忘加 flag 的後果是「沒刪」(安全)而非「誤刪」(危險);首次部署/改 config 後都能無腦先跑一次看 N。

- **Q4 (brainstorm)**: 獨立最小權限 DB credential 怎麼 bootstrap?→ **A:文件化的一次性 `psql` setup**。F12 附 idempotent setup SQL(`CREATE ROLE cleanup_job` + `GRANT`)+ quickstart/runbook;ops 首次部署手動跑一次。cleanup binary 讀獨立 secret 檔 `cleanup_database_url`。理由:避開「migration 無法讀 secret」的雞生蛋;role + grant 屬基礎設施 setup 非 schema;與既有 secret 本就是 ops 手動提供的概念一致(W-F4)。對比「migration 建 role」(密碼兩處同步、migration 帶 credential 不乾淨)與「v1 複用 app credential」(違 §5.2.3 核心緩解)。

---

## 設計

### 1. 範疇與架構

```
host crontab ──> docker compose run --rm cleanup [--execute]
                          │
                  cleanup binary (一次性、跑完即退)
                          │  讀 cleanup_database_url secret(獨立最小權限 role)
                          ▼
                  ┌─ 7 張軟刪表 ─┐  每筆過期軟刪 row:
                  │ deleted_at < │   per-row transaction {
                  │ now−90d      │     DELETE FROM <table> WHERE id=...
                  └──────────────┘     INSERT sys_operation_log (HARD_DELETE)
                                     }
```

F12 = soft-delete 生命週期收尾。base-web / nestjs / `casbin_rule` / DB schema 零改動。

### 2. 元件與打包

- **新 crate `server/cleanup`**(workspace member、package `server-cleanup`、`[[bin]] name = "cleanup"`)— 與 `migration` 同級的獨立 job crate。dep:`server-model`(7 entity + facade)、`server-core`(db helper / audit write)、`server-config`(讀 retention 設定)。
- **Dockerfile**:`cargo build --release --bin server --bin migration --bin cleanup`、`COPY` cleanup binary 進 image(沿用既有 multi-binary 模式)。
- **`docker-compose.yml`**(base)加 `cleanup` service:`image: rust-api:...` 複用、`entrypoint: /usr/local/bin/cleanup`、`restart: "no"`、`profiles: ["jobs"]`(不隨 `docker compose up` 自動起)、`depends_on: postgres healthy`、`secrets: [cleanup_database_url]`。
- **觸發**:host crontab → `docker compose -f docker-compose.yml -f <env>.yml run --rm cleanup --execute`(週期由 host cron 定;quickstart 給範例 crontab line)。

### 3. CLI 行為

| 呼叫 | 行為 |
|---|---|
| `cleanup`(無參數) | **dry-run**:查詢過期軟刪 row、印「將刪 N row、各表明細」,**不刪、不寫 audit** |
| `cleanup --execute` | 真刪(per-row transaction:`DELETE` + audit `INSERT`) |

- retention 從 env 讀:`CLEANUP_RETENTION_DAYS`,**預設 90**(可由 compose env 覆寫);不寫死。
- 未配置 / 無效值(非正整數)→ 拒跑、exit code ≠ 0。
- exit code:成功 0;有任一 row 失敗 → 非 0(host cron 可偵測告警)。

### 4. 刪除邏輯

- 範疇:7 張軟刪表(`sys_user` / `sys_role` / `sys_menu` / `sys_domain` / `sys_organization` / `sys_endpoint` / `sys_access_key`)。
- 條件:`deleted_at IS NOT NULL AND deleted_at < (now − CLEANUP_RETENTION_DAYS)`。
- **每筆刪除 = 一個 transaction**:`DELETE FROM <table> WHERE id=<id>` + `INSERT sys_operation_log`(同 txn,per §1.5 / §5.2.1 業務 + audit 原子)。per-row 失敗 → log-and-continue 下一筆、最後 exit ≠ 0。
- **不碰 `casbin_rule`**(Q2)。
- Idempotent:基於 `deleted_at < threshold` 條件查詢,重跑無副作用(已刪的 row 不再出現在查詢結果)。

### 5. Audit

- 每筆物理刪除寫一筆 `sys_operation_log`:`operation = HARD_DELETE`、`actor = cleanup_job`(job 自身即 actor、非 user)、含 before-snapshot(被刪 row 的完整狀態)。
- 比照 F3 `soft_delete_by_id` 的 fetch-before + audit-in-txn 模式。
- dry-run 模式**不寫** audit。

### 6. 獨立 credential

- 新 Postgres role `cleanup_job`,最小權限:`SELECT` + `DELETE` on 7 張軟刪表、`SELECT` + `INSERT` on `sys_operation_log`。(`SELECT` 為查詢待刪 row + 組 before-snapshot 所需。)
- F12 附 idempotent setup SQL(`deploy/cleanup/setup-role.sql`:`DO` block `CREATE ROLE` + `GRANT`);ops 首次部署手動 `psql` 跑一次(quickstart / runbook 說明)。
- 新 secret 檔 `deploy/secrets/cleanup_database_url.txt`(gitignored、ops 提供);compose `cleanup` service mount。

### 7. 錯誤處理 / edge case

| 場景 | 行為 |
|---|---|
| `CLEANUP_RETENTION_DAYS` 未配置 / 無效 | 拒跑、exit ≠ 0、不執行任何刪除 |
| DB 連不上 | log error、exit ≠ 0 |
| 單筆 row 的 txn 失敗 | log error、跳過該 row 繼續下一筆;結束時 exit ≠ 0 表示有失敗 |
| 無過期 row | 正常結束 exit 0、報「0 row」 |
| 重跑 | idempotent — 已刪 row 不再出現於查詢、無副作用 |

### 8. 測試 / 驗收

- **單元測試**:純函式部分 — retention → cutoff timestamp 計算、無效 retention 值的拒跑判斷、dry-run 報表格式。實際刪除為 DB IO 邊界、不寫 unit test(同 F8/W-F11 precedent)。
- **acceptance = curl + psql + `docker compose exec`**(沿用 F8/W-F11 慣例、不新建 deploy script、不引入 e2e framework)。
- C-V 草案(實際 C-V 編號與命令於 `/speckit-plan` contracts 定):
  - image rebuild OK(含新 `cleanup` binary)
  - psql 植入測試軟刪 row(`deleted_at` 設為超過 retention 的過去時間)
  - `docker compose run --rm cleanup`(dry-run)→ 驗報表列出待刪 row、表內 row **未**減少、`sys_operation_log` 未增
  - `cleanup --execute` → 驗測試 row 物理消失、`sys_operation_log` 多對應 `HARD_DELETE` 筆(`actor=cleanup_job` + before-snapshot)
  - 重跑 `cleanup --execute` → idempotent(0 row、無副作用)
  - retention 未配置 / 無效 → 拒跑 exit ≠ 0
  - `cleanup_job` role 最小權限驗:能 `DELETE` 7 表 + `INSERT` operation_log,**不能** `SELECT` 無關表 / `DROP` / 改 schema
  - 三邊 scope:base-web src 0 diff + nestjs fork 0 diff;`casbin_rule` 0 改動

### 9. Research-time 確認項(交 `/speckit-plan` Phase 0)

- **R-Q1**:`server/cleanup` crate 的 dep 邊界 — audit 寫入 helper(F2/F3 的 write-in-txn pattern)目前在哪 crate、能否被 cleanup binary 直接調用,還是需抽共用 helper;7 entity 與 `SoftDeletable` trait 的可重用性。
- **R-Q2**:7 entity 的 hard-delete + before-snapshot 取法 — sea-orm `delete_by_id` / `delete_many`;before-snapshot 的 audit payload 格式(比照 `soft_delete_by_id` 的 before snapshot 怎麼序列化)。
- **R-Q3**:`sys_operation_log` 的 `actor` 欄位結構 — F2 audit 的 `Actor` 型別是否支援非-user(system / job)actor;`cleanup_job` 作為 actor 怎麼填(有無既有 system-actor 先例)。
- **R-Q4**:retention 設定讀取 — `CLEANUP_RETENTION_DAYS` 從 env 或 `application.yaml`;`server-config` 的既有設定載入路徑能否被一次性 binary 重用。
- **R-Q5**:`cleanup_job` PG role 的精確 `GRANT` 語法 + setup SQL 的 idempotency(`CREATE ROLE` 無 `IF NOT EXISTS` → `DO` block 包);role 密碼如何進 `cleanup_database_url` 連線字串。
- **R-Q6**:`docker compose run --rm` 對 `profiles:` gated service 的行為、secret mount、network 連通性確認。

---

## 範疇外

- ❌ 不碰 `casbin_rule` — casbin orphan cleanup 留 follow-up(per Q2)
- ❌ 物理刪除前 N 天通知(§5.2.3「可選」;stack 無通知基礎設施 → YAGNI)
- ❌ per-table 不同 retention(單一全域 `CLEANUP_RETENTION_DAYS`)
- ❌ `sys_operation_log` 自身的 cleanup / partition / retention(§5.2.3 點出 audit 表成長、但「audit 本身不 cleanup」、partition / retention 屬另議)
- ❌ F3-N2 `sys_access_key` validator orphan key(屬 soft-delete-time atomicity gap、F2.2 outbox 範疇,非 hard-delete cleanup)
- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV)
- ❌ 不動 `fork260509-soybean-admin-nestjs/`;F12 為純 DB-level job、不涉 nestjs
- ❌ 無 DB migration(`cleanup_job` role 走文件化手動 `psql` setup、per Q4)
- ❌ 不改 Casbin enforce 邏輯、不改 soft-delete handler、不實作 §5.2.2 的 soft-delete-time cascade

---

## DESIGN-A → DESIGN-B 一致性

F12 為純 DB-level job、不涉 nestjs;DESIGN-B(rust-only)形態下 F12 原樣沿用、零改動 — 通過「nestjs 退場時順嗎」濾鏡。

---

## Naming / 編號

- Brainstorm doc:`docs/superpowers/027-feature-cleanup-job.md`(本檔)
- Spec 目錄:`specs/027-cleanup-job/`(`/speckit-specify` 產生)
- Feature branch:`027-cleanup-job`(`before_specify` pre-hook 產生)
- 新 crate:`server/cleanup`(package `server-cleanup`、binary `cleanup`)
- 新 secret:`deploy/secrets/cleanup_database_url.txt`(gitignored)
- 新檔:`deploy/cleanup/setup-role.sql`(`cleanup_job` PG role setup)
- 無 DB migration
- PG role:`cleanup_job`
