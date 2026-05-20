# Data Model: F12 — cleanup-job

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

F12 **不動 DB schema、不增表、不改 entity model、無 migration**。「data model」此處為 F12 的**元件模型** — 一個獨立 cron job binary(rust source)+ 部署配置(docker-compose service + PG role setup SQL)。唯一觸碰的「資料」是 7 張軟刪表(物理刪除既有 row)與 `sys_operation_log`(新增 `HARD_DELETE` 紀錄)— 兩者 schema 皆既有、F12 不改。

元件總覽:

| # | 元件 | 位置 | 性質 |
|---|---|---|---|
| E1 | `server/cleanup` crate + `cleanup` binary | rust-api workspace | 新增 |
| E2 | retention 設定 + cutoff 計算 | `cleanup` binary | 新增 |
| E3 | dry-run vs `--execute` CLI 模式 | `cleanup` binary | 新增 |
| E4 | per-table sweep + per-row delete transaction | `cleanup` binary | 新增 |
| E5 | `HARD_DELETE` audit 寫入 | `cleanup` binary(重用 `write_in_txn`) | 新增(機制重用) |
| E6 | `cleanup_job` PG role + setup SQL + secret | `deploy/cleanup/` + Postgres | 新增 |
| E7 | docker-compose `cleanup` service | `docker-compose.yml` | 改 |

---

## E1: `server/cleanup` crate + `cleanup` binary(新增)

- **新 crate**:`rust-api/server/cleanup/`,package `server-cleanup`,`[[bin]] name = "cleanup"`、`path = "src/main.rs"`。
- **workspace 註冊**:`rust-api/Cargo.toml` 的 `[workspace] members` 加 `"server/cleanup"`。
- **dependencies**(per research R-Q1):
  | dep | 用途 |
  |---|---|
  | `server-model`(`path = "../model"`) | 7 entity、7 facade、`admin::audit_log::write_in_txn`、`admin::audit_serialize::audit_snapshot` + `AuditSerialize`、`admin::soft_delete_impls`(`SoftDeletable` impls) |
  | `server-core`(`path = "../core"`) | `web::audit::{Actor, AuditEvent, AuditOperation, AuditSource}`、`web::error::AppError` |
  | `sea-orm`(workspace) | `Database::connect`、`EntityTrait`、`TransactionTrait`、`DatabaseTransaction`、`ColumnTrait`、`QueryFilter` |
  | `tokio`(workspace、`rt-multi-thread` + `macros`) | async runtime、`#[tokio::main]` |
  | `chrono`(workspace) | cutoff timestamp(`Utc::now() - Duration::days(n)`) |
  | `tracing`(選、workspace) | log(對齊 `endpoint_sync` 風格) |
- **不依賴**:`server-service` / `server-api` / `server-global` / `server-config` / axum / redis(per research R-Q1 / R-Q4)。
- **Dockerfile 改**:`cargo build --release` 加 `--bin cleanup`;`COPY --from=builder /tmp/cleanup /usr/local/bin/cleanup`(比照既有 `server` / `migration` 兩 binary 的 build + COPY 模式)。

**LOC delta**:新 `main.rs` ~150-200 LOC + `Cargo.toml` 新建 + `rust-api/Cargo.toml` 1 行 + `Dockerfile` ~2 行。

---

## E2: retention 設定 + cutoff 計算(新增)

- **retention 來源**:環境變數 `CLEANUP_RETENTION_DAYS`(per research R-Q4 — 比照 `migration` binary 的 env-var 模式、不走 `server-config`)。
- **預設值**:`90`(天)— 環境未設時用此預設(per spec FR-006 / A-004)。
- **cutoff 計算**:`cutoff = Utc::now() - chrono::Duration::days(retention_days)`;F12 刪除條件 = `deleted_at < cutoff`。
- **驗證**:`CLEANUP_RETENTION_DAYS` 若存在但非正整數(空字串、`0`、負數、非數字)→ binary 拒跑(per spec FR-007 / E-1):log error、`exit(非 0)`、不連 DB、不刪任何 row。
- **純函式**:retention 字串 → `Result<u32, _>` 的 parse/validate + retention → cutoff timestamp 為純函式 → 可 unit test(per spec FR-025)。

**設計要點**:
| 項目 | 決策 |
|---|---|
| 設定機制 | env var(`migration`-style)、不寫死、不引 `server-config` |
| 預設 | 90 天 |
| 無效值 | 拒跑、exit≠0、不碰 DB |

---

## E3: dry-run vs `--execute` CLI 模式(新增)

- **CLI 參數**:單一旗標 `--execute`。
  | 呼叫 | 模式 | 行為 |
  |---|---|---|
  | `cleanup` | **dry-run**(預設) | 查詢各表過期 row、印「將刪 N row + 各表明細」、**不刪、不開 write transaction、不寫 audit** |
  | `cleanup --execute` | execute | 真刪(E4)+ 寫 audit(E5) |
- **arg parse**:極簡 — 掃 `std::env::args()` 找 `--execute`;不引入 `clap` 等 arg framework(YAGNI、單一旗標)。
- **dry-run 報表格式**:每表一行「`<table>`: N row 將刪(deleted_at < `<cutoff>`)」+ 總計;為純函式可 unit test。
- 兩模式共用「查詢過期 row」邏輯;dry-run 止於查詢+報表、execute 續行刪除。

---

## E4: per-table sweep + per-row delete transaction(新增、execute 模式)

對 7 張軟刪表(`sys_user` / `sys_role` / `sys_menu` / `sys_domain` / `sys_organization` / `sys_endpoint` / `sys_access_key`)依序 sweep。每張表:

1. `SELECT` 該表 `deleted_at IS NOT NULL AND deleted_at < cutoff` 的全部 row(取完整 `Model`、作 before-snapshot 用)。
2. 對每一 row(**per-row transaction**、per research R-Q2):
   ```
   txn = db.begin()
     audit_event = AuditEvent { operation: HardDelete, ... payload_before: audit_snapshot(&model) ... }   // E5
     write_in_txn(&txn, audit_event)                          // INSERT sys_operation_log
     Entity::delete_many().filter(<pk> eq model.id).exec(&txn) // 物理 DELETE、預期 rows_affected == 1
   txn.commit()
   ```
3. 單筆 row 的 txn 失敗 → log error、`txn` 自然 rollback、**continue 下一筆**(log-and-continue、per spec FR-013 / E-3);記錄「曾有失敗」旗標。
4. 全表 sweep 完 → 報告該表刪除筆數。

**設計要點**:
| 項目 | 決策 |
|---|---|
| 刪除 API | `Entity::delete_many().filter(pk_col.eq(id)).exec(&txn)`(per R-Q2;回 `DeleteResult.rows_affected`) |
| txn 粒度 | **per-row**(brainstorm 拍板)— DELETE + audit INSERT 同 txn;單筆失敗不影響其他 row |
| 7 表處理 | per-entity block(各 ~5-7 LOC)或小 macro — `SoftDeletable` 未露 PK column、`sys_menu` i32 PK 須個別處理(per R-Q2) |
| 失敗策略 | log-and-continue;結束 exit code 反映(E2 / 下方) |
| 順序 | 7 表固定順序;F12 不碰 `casbin_rule`、不處理跨表 FK cascade(軟刪表彼此無物理 FK 連動需求 — implement 階段 psql 確認無 `ON DELETE` 衝突) |

**exit code**(per spec FR-008):全程無失敗 → `0`;retention 無效(E2)或任一 row 刪除失敗 → 非 `0`。

> ⚠️ 7 表 FK 拓樸由 tasks.md **T011** 先行確認(grep migration schema source);T021 sweep 順序依其結論排(無跨表 FK → 任意;有 FK → referencing 先於 referenced、self-ref 階層 `sys_menu` / `sys_organization` child 先於 parent);殘留撞 FK 的 row 走 log-and-continue(per spec FR-013;brainstorm Q2 已定 F12 不做跨表 cascade)。

---

## E5: `HARD_DELETE` audit 寫入(新增、機制重用)

每筆物理刪除在 E4 的 per-row txn 內、`DELETE` 之前或之後(同 txn)呼叫 `write_in_txn` 寫一筆 `sys_operation_log`(per research R-Q3、F2.1 已預埋全部元件):

```rust
AuditEvent {
    actor:          Actor::system("cleanup_job"),   // user_id=username="cleanup_job", domain="_system"
    operation:      AuditOperation::HardDelete,      // → "HARD_DELETE"(F2.1 預留變體)
    source:         AuditSource::Cleanup,            // → method "CLEANUP"(F2.1 已存在)
    entity_type:    <E as SoftDeletable>::ENTITY_TYPE,   // 如 "sys_user"
    entity_id:      Some(<deleted row id>.to_string()),  // sys_menu i32 → to_string()
    payload_before: Some(audit_snapshot(&model)),    // 被刪 row 完整狀態、redaction 自動
    payload_after:  None,                            // 物理刪除無 after
    description / request_id / ... : 適當預設
}
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| audit 機制 | 100% 重用 `server_model::admin::audit_log::write_in_txn` — 零新機制 |
| actor | `Actor::system("cleanup_job")`(既有 API、doc 明文點名;precedent `endpoint_sync`) |
| operation / source | `AuditOperation::HardDelete` / `AuditSource::Cleanup`(F2.1 已預埋、無需新增) |
| schema | `sys_operation_log` 既有欄位足夠 — **F12 無 migration、無 schema 改** |
| 原子性 | audit INSERT 與 `DELETE` 同一 per-row txn(per Constitution II / DESIGN-A §1.5) |
| dry-run | 不開 txn、不呼叫 `write_in_txn`(per spec FR-015) |

---

## E6: `cleanup_job` PG role + setup SQL + secret(新增)

- **PG role**:`cleanup_job`,最小權限(per research R-Q5 / spec FR-016):
  - `GRANT SELECT, DELETE ON` 7 張軟刪表
  - `GRANT SELECT, INSERT ON sys_operation_log`
  - `GRANT USAGE ON SCHEMA public`(+ 視 `sys_operation_log` PK 為 sequence 時 `GRANT USAGE ON SEQUENCE`)
- **setup SQL**:`deploy/cleanup/setup-role.sql`(新建)— idempotent:
  - `CREATE ROLE` 包在 `DO` block + `IF NOT EXISTS (SELECT FROM pg_roles ...)`(`CREATE ROLE` 無原生 `IF NOT EXISTS`)
  - `GRANT` 本身 idempotent(重跑無害)
  - role 密碼用 `psql` 變數(`:'cleanup_pw'`)、ops 以 `psql -v cleanup_pw=...` 帶入
- **secret**:`deploy/cleanup/` 不放密碼;新 secret 檔 `deploy/secrets/cleanup_database_url.txt`(gitignored、ops 提供)— 內含 `cleanup_job` role 的完整連線字串(密碼須與 setup SQL 帶入值一致)。
- **bootstrap 流程**(ops 首次部署、quickstart 詳列):ops 跑 `setup-role.sql` 建 role → 寫 `cleanup_database_url.txt` → 完成。**不走 migration**(per spec Q4 / FR-017)。

**設計要點**:
| 項目 | 決策 |
|---|---|
| role 建立 | 文件化手動 `psql`(非 migration) |
| 最小權限 | 7 表 SELECT/DELETE + `sys_operation_log` SELECT/INSERT + schema USAGE |
| 密碼 | `psql` 變數帶入;與 secret 檔連線字串一致(ops 負責) |
| idempotency | `DO` block 包 `CREATE ROLE`;`GRANT` 天然 idempotent |

---

## E7: docker-compose `cleanup` service(改 `docker-compose.yml`)

`docker-compose.yml`(base)新增 `cleanup` service(per research R-Q6):

```yaml
cleanup:
  image: rust-api:${IMAGE_TAG:-rev1-admin-rust-api}      # 複用 rust-api image
  profiles: ["jobs"]                                      # 不隨 docker compose up 自動起
  entrypoint: ["sh", "-c",
    "DATABASE_URL=\"$$(cat /run/secrets/cleanup_database_url)\" exec /usr/local/bin/cleanup \"$$@\"", "sh"]
  environment:
    TZ: ${TZ:-Asia/Shanghai}
    CLEANUP_RETENTION_DAYS: ${CLEANUP_RETENTION_DAYS:-90}
  secrets:
    - cleanup_database_url
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - internal
  restart: "no"
```

+ `secrets:` 區塊註冊 `cleanup_database_url`(指向 `deploy/secrets/cleanup_database_url.txt`)。

**設計要點**:
| 項目 | 決策 |
|---|---|
| image | 複用 `rust-api` image(第 3 個 binary、比照 `migration` service) |
| profile | `profiles: ["jobs"]` — `docker compose up` 不自動起;host cron 用 `docker compose run --rm cleanup [--execute]` 觸發 |
| entrypoint | shell wrapper `cat` secret 注入 `DATABASE_URL` env、`exec ... "$@"` 透傳 `--execute` |
| 觸發 | host crontab(F12 不在 stack 內提供排程、per spec A-005) |
| 範圍 | **只改 base `docker-compose.yml`**;`docker-compose.dev.yml` / `docker-compose.prod.yml` 不動(per spec FR-024) |

---

## 元件互動 — cleanup data flow

```
host crontab ──> docker compose -f docker-compose.yml [-f <env>.yml] run --rm cleanup [--execute]
                        │  entrypoint: DATABASE_URL=$(cat /run/secrets/cleanup_database_url)
                        ▼
                  cleanup binary [E1]
                        │  讀 CLEANUP_RETENTION_DAYS [E2] → 無效則拒跑 exit≠0
                        │  cutoff = now − retention
                        ▼
              ┌─ dry-run(無 --execute)[E3] ─ 查詢 7 表過期 row → 印報表 → exit 0(不刪不寫)
              │
              └─ --execute [E3] ─ 對 7 表逐表 sweep [E4]:
                        每筆過期 row:
                          txn = begin()
                            write_in_txn(&txn, AuditEvent{HardDelete, cleanup_job, before-snapshot}) [E5]
                            Entity::delete_many().filter(pk eq id).exec(&txn)
                          commit()    ← DELETE + audit 原子
                        單筆失敗 → log + rollback + continue;結束 exit code 反映
```

連線身分 = `cleanup_job` PG role [E6](最小權限);compose service [E7] profile-gated、host cron 觸發。

---

## Data Model 完成標誌

- ✅ E1 `server/cleanup` crate + binary、dep set 確定、Dockerfile 多 binary 模式
- ✅ E2 retention `CLEANUP_RETENTION_DAYS` env + cutoff、無效值拒跑
- ✅ E3 dry-run(預設)vs `--execute`、單一旗標、報表純函式
- ✅ E4 7 表 per-table sweep + per-row delete transaction、log-and-continue、exit code
- ✅ E5 `HARD_DELETE` audit — 100% 重用 `write_in_txn`、`Actor::system("cleanup_job")`、F2.1 預埋元件、無 schema 改
- ✅ E6 `cleanup_job` 最小權限 PG role + idempotent setup SQL + `cleanup_database_url` secret
- ✅ E7 docker-compose `cleanup` service(profile-gated、複用 rust-api image、只改 base compose)
- ✅ 無 DB schema 改、無 migration、無 base-web 改、無 nestjs 改、不碰 `casbin_rule`
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E7 確認 — F12 為 Constitution Principle II 明文要求機制(獨立 cleanup job + cleanup 自身寫 audit)的實作(II PASS);無服務間 forward(III PASS);base-web 0 diff(IV PASS);純 DB job、DESIGN-B 沿用零改(V PASS);不碰 Casbin(I PASS)。**5 PASS / 0 N/A / 0 violation 維持**。
