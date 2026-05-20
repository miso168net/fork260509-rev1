# Implementation Plan: F12 — cleanup-job

**Branch**: `027-cleanup-job` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/027-cleanup-job/spec.md`

## Summary

DESIGN-A §6.1 Phase 4(P4)最後一個 application feature — **DESIGN-A 本體(F1–F12)收尾**。F3 給 7 張 admin 表加 `deleted_at`、刪除改軟刪;軟刪 row 永遠留表內 → F12 提供一個獨立 cron job 物理清除過期軟刪 row。

技術途徑:rust workspace 新增獨立 crate `server/cleanup`(產 binary `cleanup`、比照既有 `server` / `migration` 多 binary 模式、複用 rust-api docker image)。binary 為一次性執行:讀 retention(`CLEANUP_RETENTION_DAYS` env、預設 90)算出 cutoff、掃 7 張軟刪表 `deleted_at < cutoff` 的 row;dry-run(預設)只報告、`--execute` 才真刪。每筆物理刪除在單一 DB transaction 內 `DELETE` + 寫一筆 `HARD_DELETE` audit(`Actor::system("cleanup_job")`)。outer 端加 `docker-compose.yml` 的 `cleanup` service(profile-gated)+ `deploy/cleanup/setup-role.sql`(`cleanup_job` 最小權限 PG role)。無 DB schema 改、無 migration;base-web / nestjs / `casbin_rule` 零改動;acceptance = psql + `docker compose run/exec`;兩段式 commit。

**Phase 0 research 關鍵發現**:F2.1 已預埋 F12 所需全部 audit 元件 — `AuditOperation::HardDelete`、`AuditSource::Cleanup`、`Actor::system("cleanup_job")` 皆已存在(`Actor::system` doc 明文點名 cleanup_job);`server_model::admin::audit_log::write_in_txn(&txn, AuditEvent)` 為 `pub`、吃 `&DatabaseTransaction`、可組進 caller 的 transaction。F12 的 audit 側零新機制。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api 既有 workspace、不指定版本)
**Primary Dependencies**: `sea-orm`(DB 連線 + `delete_many` + transaction、既有 workspace dep)、`tokio` 1(async runtime、既有)、`chrono`(cutoff timestamp 計算、既有)、`server-model`(7 entity + facade + `admin::audit_log::write_in_txn` + `AuditSerialize`、既有 crate)、`server-core`(`Actor` / `AuditEvent` / `AuditOperation` / `AuditSource` / `AppError`、既有 crate);docker-compose v2(`docker compose run` + `profiles`);PostgreSQL role / `GRANT`
**Storage**: PostgreSQL — F12 **不改 schema、不增表、無 migration**;物理刪除 7 張軟刪表 row + 寫 `sys_operation_log`(`sys_operation_log` schema 經 F2.1 已含 `operation` / `entity_id` / `payload_before` 欄位、F12 不需改)
**Testing**: rust unit test 限純函式(retention → cutoff timestamp 計算、無效 retention 拒跑判斷、dry-run 報表格式);物理刪除為 DB IO 邊界 → acceptance = psql + `docker compose run` / `docker compose exec`(per spec FR-023 / FR-025)
**Target Platform**: Linux container — `cleanup` binary 為 rust-api docker image 內第 3 個 binary;一次性執行
**Project Type**: backend job binary(rust workspace 新 crate)+ 部署配置(docker-compose service + setup SQL)
**Performance Goals**: N/A — cleanup 為低頻 cron job、離峰執行、正確性 > 速度;per-row transaction(rev1 軟刪 row 量小、per-row 換「單筆失敗不影響其他」)
**Constraints**: base-web + nestjs 0 diff(Constitution IV)、無 DB schema 改、無 migration、不碰 `casbin_rule`、docker-compose 只改 base `docker-compose.yml`(dev/prod overlay 0 diff)
**Scale/Scope**: 新 crate `server/cleanup`(`main.rs` ~150-200 LOC:retention parse + cutoff + 7 per-entity delete block + per-row txn + dry-run 報表)+ Dockerfile ~2 行改 + `docker-compose.yml` 加 service ~12 行 + `deploy/cleanup/setup-role.sql` ~20 行

無 NEEDS CLARIFICATION — brainstorm 4 拍板點 saturated、`/speckit-clarify` 0 question(taxonomy 全 Clear)、Phase 0 research 6 個 R-Q 已解。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | F12 不碰 Casbin enforce 邏輯、不碰 `casbin_rule`、不改任何 endpoint;純 DB 維運 job、與 authorization 決策路徑無交集 |
| II | Soft Delete + Audit | **PASS**(F12 直接實現此原則) | Principle II 明文要求「物理刪除 MUST 由獨立 cleanup job 執行;cleanup 自身**也寫** audit(actor=`cleanup_job`)」「HARD_DELETE MUST 寫 `sys_operation_log` 一筆」「業務寫入 + audit 同一 DB transaction」「`sys_operation_log` 不 soft delete、不 cleanup、永久保留」— **F12 即此 mandate 的實作**:獨立 `cleanup` binary、per-row `DELETE` + `write_in_txn` 同 transaction、`Actor::system("cleanup_job")`、F12 範疇明確排除 cleanup `sys_operation_log` 自身 |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | F12 為獨立一次性 binary、不呼叫任何後端 API(rust / nestjs)、只直連 PostgreSQL;無服務間 HTTP/RPC forward |
| IV | base 不改動邊界 | **PASS** | F12 純後端 job + 部署配置;`base-web/` 全 0 diff(spec FR-019) |
| V | 漸進收縮 | **PASS** | F12 純 DB-level job、不涉 nestjs(不動 nestjs fork、spec FR-020);DESIGN-B(rust-only)形態下 F12 原樣沿用、零改動 — 通過「nestjs 退場濾鏡」 |

**架構約束檢查**:
- **背景工作**:Constitution 架構約束明文「cleanup-job(cron)+ outbox-worker + backup-job 為 prod 必要;獨立最小權限 credential」— **F12 即實作此約束的 cleanup-job**,完全對齊(獨立 `cleanup_job` PG role、最小權限 = 7 表 `SELECT`/`DELETE` + `sys_operation_log` `SELECT`/`INSERT`)
- **DB migration**:架構約束「rust 主導所有 migration」— F12 **無 migration**(`cleanup_job` role 走文件化手動 `psql` setup、per spec Q4);F12 根本不需 schema 改、不增 migration ≠ 違反「rust 主導 migration」
- **部署形態**:F12 用 docker-compose service(profile-gated、`docker compose run` 觸發)+ host cron;符合「docker-compose 單機運行」、不引入 k8s
- **Secret 注入**:F12 的 `cleanup_database_url` 沿用既有 Docker secrets + secret 檔機制(per W-F4)
- TLS / observability / backup / CI / Port — F12 全 N/A(不改這些配置)

**Gate 結果**:**5 PASS / 0 N/A / 0 violation** — Constitution Check 通過、無需 Complexity Tracking。F12 為直接落實 Constitution Principle II「物理刪除由獨立 cleanup job 執行 + cleanup 自身寫 audit」與架構約束「cleanup-job 背景工作、獨立最小權限 credential」的 feature。

## Project Structure

### Documentation (this feature)

```text
specs/027-cleanup-job/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出(/speckit-plan)— R-Q1~R-Q6
├── data-model.md        # Phase 1 產出(/speckit-plan)— E1~E7 元件模型
├── quickstart.md        # Phase 1 產出(/speckit-plan)
├── contracts/
│   └── verification-commands.md   # Phase 1 產出 — C-V1~C-V9
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(本指令不產)
```

### Source Code (rust-api worktree + outer 配置)

```text
rust-api/                                  (worktree)
├── Cargo.toml                             # 改(workspace members 加 "server/cleanup")
├── Dockerfile                             # 改(cargo build 加 --bin cleanup + COPY cleanup binary)
└── server/cleanup/                        # 新 crate(package server-cleanup)
    ├── Cargo.toml                         # 新建([[bin]] name = "cleanup")
    └── src/main.rs                        # 新建(retention parse + cutoff + 7 表 sweep + per-row txn + dry-run 報表)

<outer repo rev1-admin-root>
├── docker-compose.yml                     # 改(加 cleanup service、profile-gated)
└── deploy/cleanup/
    └── setup-role.sql                     # 新建(cleanup_job PG role + GRANT、idempotent)
（docker-compose.dev.yml / docker-compose.prod.yml 全不動;無 migration）
```

**Structure Decision**:F12 為 rust-api worktree 新增 1 個 crate(`server/cleanup`、~150-200 LOC)+ 2 個既有檔微改(`Cargo.toml` workspace members、`Dockerfile`)+ outer 2 檔(`docker-compose.yml` 加 service、`deploy/cleanup/setup-role.sql` 新建)的中小型 feature。新 crate 比照 `migration` — 同級的獨立一次性 job crate;dep 為 `server-model` + `server-core` + `sea-orm` + `tokio` + `chrono`(不依賴 `server-service` / `server-api` / `server-global` / axum / redis)。對比 W-F11(改既有 crate、無新 crate、有 docker-compose.prod 改)— F12 首次新增 workspace crate、改 base `docker-compose.yml`、且無 migration。

## Phase 0: research(見 [research.md](research.md))

F12 brainstorm 已 saturated(4 拍板點);Phase 0 由一支 codebase research agent 對 `rust-api/` 調查,解 brainstorm doc §9 的 6 個 implement-time R-Q:
- R-Q1:audit-write helper = `server_model::admin::audit_log::write_in_txn(&DatabaseTransaction, AuditEvent)`、`pub`、可組進 caller txn → `server/cleanup` dep = `server-model` + `server-core` + `sea-orm` + `tokio` + `chrono`
- R-Q2:before-snapshot 用 `audit_snapshot(&model)`(7 Model 皆 impl `AuditSerialize`、含 redaction);物理刪除用 `Entity::delete_many().filter(pk eq id).exec(&txn)`;`SoftDeletable` 露 `DELETED_AT_COLUMN` + `ENTITY_TYPE` 可泛用、但 PK column 未露 + `sys_menu` 為 i32 PK → 7 個 per-entity block(或 macro)
- R-Q3:`Actor::system("cleanup_job")` 已存在(doc 明文點名)、precedent `Actor::system("endpoint_sync")`;`AuditOperation::HardDelete` + `AuditSource::Cleanup` 已存在(F2.1 預埋)→ **F12 無需 schema 改、無需 sentinel user**
- R-Q4:F12 比照 `migration` binary — 讀 `DATABASE_URL` env(compose entrypoint `cat` secret 檔注入)+ 新 `CLEANUP_RETENTION_DAYS` env、`Database::connect(url)`;不需 `server-config` dep
- R-Q5:`cleanup_job` PG role `CREATE ROLE` 無 `IF NOT EXISTS` → setup SQL 用 `DO` block 包;`GRANT SELECT,DELETE` on 7 表 + `GRANT SELECT,INSERT` on `sys_operation_log`
- R-Q6:`docker compose run --rm <service>` 對 `profiles:` gated service 正常運作(profile 只擋 `up` 自動起、不擋 `run`)

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 `server/cleanup` crate + binary / E2 retention 設定 + cutoff / E3 dry-run vs execute CLI / E4 per-table sweep + per-row delete transaction / E5 `HARD_DELETE` audit / E6 `cleanup_job` PG role + setup SQL + secret / E7 docker-compose `cleanup` service;含 cleanup data flow 圖
- **contracts/verification-commands.md**:C-V1~C-V9 — image rebuild / role setup + 最小權限驗 / dry-run 不刪不寫 / `--execute` 物理刪 + audit / 未到期不刪 / idempotent 重跑 / retention 無效拒跑 / dev compose regression / three-side scope
- **quickstart.md**:F12 落地操作(新 crate + Dockerfile + docker-compose + setup SQL + acceptance + 兩段式 commit)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — data-model E1-E7 確認無 DB schema 改、無 base-web 改、無 nestjs 改、無服務間 forward;F12 為 Constitution Principle II 明文要求機制的實作、`Actor`/`operation`/`source` 全用既有 API;**5 PASS / 0 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
