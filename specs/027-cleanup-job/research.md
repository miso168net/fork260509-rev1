# Research: F12 — cleanup-job

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-21

F12 為 DESIGN-A §6.1 Phase 4(P4)最後一個 application feature。Brainstorm 已 saturated(4 拍板點)、`/speckit-clarify` 0 question。Phase 0 由一支 codebase research agent 對 `rust-api/` 調查,解 brainstorm doc §9 列的 6 個 implement-time R-Q。

---

## R-Q1: audit-write helper 的位置與可重用性

**Question**: F12 cleanup binary 怎麼寫 `sys_operation_log` audit row?既有 audit-write 機制在哪、能否被獨立 binary 重用?

**Evidence**(research agent、2026-05-21):
- audit-write helper = `server_model::admin::audit_log::write_in_txn`(`rust-api/server/model/src/admin/audit_log.rs:29-32`):
  ```rust
  pub async fn write_in_txn(txn: &DatabaseTransaction, event: AuditEvent<'_>) -> Result<(), AppError>
  ```
- helper 只 `INSERT` `sys_operation_log` row、**不 commit / rollback**(doc 明示「Caller 負責 commit / rollback」)→ 可組進 caller 自有 transaction。
- module doc(`audit_log.rs:3`)明文點名:「所有 admin write 路徑(service-level + HTTP middleware + **F12 cleanup-job**)共用此入口」。
- `soft_delete_by_id`(`facade/sys_user.rs:69-83`)即以 `&txn`(來自 `db.begin()`)呼叫 `write_in_txn` — F12 比照同模式。
- `write_in_txn` 吃**具體** `&DatabaseTransaction`(非泛型 `&C: ConnectionTrait`)→ F12 cleanup 迴圈須 `db.begin()` 取 `DatabaseTransaction`、`&txn` 傳給 `delete` 與 `write_in_txn`、再 `txn.commit()`。

**Decision**: F12 直接重用 `server_model::admin::audit_log::write_in_txn` — 不新增任何 audit 機制。

**`server/cleanup` crate 最小 dep set**:
- `server-model`(`../model`)— `admin::audit_log::write_in_txn`、7 entity、7 facade、`admin::audit_serialize::audit_snapshot` + `AuditSerialize` impls、`admin::soft_delete_impls`
- `server-core`(`../core`)— `web::audit::{Actor, AuditEvent, AuditOperation, AuditSource}`、`web::error::AppError`
- `sea-orm`(workspace dep)— `Database::connect`、`EntityTrait`、`TransactionTrait`、`DatabaseTransaction`、`ColumnTrait`、`QueryFilter`
- `tokio`(workspace、`rt-multi-thread` + `macros`)— async runtime
- `chrono`(workspace)— cutoff timestamp 計算
- (選)`tracing` — log
- `rust-api/Cargo.toml` workspace `members` 須加 `"server/cleanup"`

**Rationale**: F12 不需 `server-service` / `server-api` / `server-global` / axum / redis;DB 連線獨立用 `Database::connect`(見 R-Q4)、不走 `server-global` 的 `GLOBAL_PRIMARY_DB` 全域。

**Spec impact**: data-model E1 / E5;plan Technical Context dep 清單。

---

## R-Q2: 7 entity 的 hard-delete 與 before-snapshot 取法

**Question**: 怎麼物理刪除 7 張軟刪表的 row、怎麼組 audit 的 before-snapshot?

**Evidence**(research agent):
- **before-snapshot**:`soft_delete_by_id` 以 `Entity::find()...one(&txn)` 取 `Option<Model>`、經 `audit_snapshot(&model)`(`audit_serialize.rs:31-44`)轉 `serde_json::Value`、放進 `AuditEvent.payload_before`。7 個 entity Model 全 impl `AuditSerialize`(`audit_serialize.rs:50-66`)、含 top-level 欄位 redaction(`sys_user` redact `password`、`sys_access_key` redact `accessKeySecret`、其餘 5 個無)。
- **物理 DELETE API**:codebase production code 物理刪除用 `Entity::delete_many().filter(...).exec(&txn)`(`sys_authorization_service.rs:288` / `:361` 刪 join table);`delete_by_id` 僅見於 test code。
- **uniform shape**:`server-core::db::soft_delete::SoftDeletable`(`server/core/src/db/soft_delete.rs:15-31`)露 `const DELETED_AT_COLUMN: Self::Column` + `const ENTITY_TYPE: &'static str`(7 impl 在 `model/src/admin/soft_delete_impls.rs:16-49`)。**但** trait 未露 primary-key column、且 `sys_menu` 為 `i32` PK(其餘 6 個 `String` PK)→ 完全泛型的刪除迴圈受阻於 PK 處理。

**Decision**:
- 物理刪除用 `Entity::delete_many().filter(<pk> eq id).exec(&txn)`(回 `DeleteResult { rows_affected }`、F12 可 assert 恰刪 1 row)。
- before-snapshot 用 `audit_snapshot(&model)`(7 entity 統一、redaction 自動)。
- 「找出過期 row 的 filter」與「`entity_type` 標籤」可泛用 `<E as SoftDeletable>::DELETED_AT_COLUMN` / `::ENTITY_TYPE`;但 fetch-before + `delete_many(pk eq id)` + `entity_id.to_string()`(`sys_menu` i32)須 **per-entity block**(7 個小 block、各 ~5-7 LOC)或小 macro。

**Rationale**: 完全泛型須新增 `SoftDeletable` 之上的 trait surface(露 PK)— 屬非必要;7 個 per-entity block 對齊既有 per-facade 風格、simplicity-first。

**Spec impact**: data-model E4。

---

## R-Q3: `sys_operation_log` actor 欄位與非-user actor

**Question**: cleanup_job 作為非-user actor 怎麼寫 audit?`sys_operation_log` actor 欄位結構為何?`HARD_DELETE` enum 值是否已存在?

**Evidence**(research agent):
- `sys_operation_log` actor 相關欄位 = `user_id` / `username` / `domain`,皆 `Text NOT NULL`、**無 FK 約束**(`model/src/admin/entities/sys_operation_log.rs:13-18`);無專屬 `actor` / `operator` 欄位。
- `Actor` 型別(`server-core/src/web/audit.rs:21-29`)= 3 個 `String` 欄位 `id` / `username` / `domain`。**已有 `Actor::system(name)` 建構子**(`audit.rs:31-41`):set `id = name`、`username = name`、`domain = "_system"`;doc 明文「用於 cleanup job / migration 等非 user 觸發的 audit 寫入」、欄位 doc 點名範例 actor 名 `"cleanup_job"` / `"migration"`。
- **production code 已有非-user actor 先例**:`sys_endpoint_service.rs:115` / `:166` 用 `Actor::system("endpoint_sync")`。
- `operation` 欄位:DB 為 `Text` string;Rust 用 enum `AuditOperation`(`audit.rs:58-79`),5 變體 `Insert` / `Update` / `SoftDelete` / `Restore` / **`HardDelete`**;`HardDelete.as_str() = "HARD_DELETE"`。`HardDelete` 變體已存在(`audit.rs:64-65` 註「F2.1 預留 enum 值、實作留 F12 cleanup-job」)。
- `AuditSource::Cleanup` 變體亦已存在(`audit.rs:99-100`)、`write_in_txn` 已處理(→ `method = "CLEANUP"`、`audit_log.rs:48-53`)。

**Decision**: F12 用 `Actor::system("cleanup_job")` 寫 audit — audit row 得 `user_id = username = "cleanup_job"`、`domain = "_system"`。`operation = AuditOperation::HardDelete`、`source = AuditSource::Cleanup`、`payload_before = Some(audit_snapshot(&deleted_model))`、`payload_after = None`、`entity_type = <E as SoftDeletable>::ENTITY_TYPE`、`entity_id = <id>.to_string()`。

**Rationale**: F2.1 已預埋 F12 所需全部 audit 元件 — 無需新 schema、無需在 `sys_user` 建 sentinel user row(`sys_operation_log` actor 欄位為 free-text、非 FK)。

**Spec impact**: data-model E5;spec FR-014 對齊;確認 F12 無 migration(spec FR-021)。

---

## R-Q4: 設定載入 — DB 連線與 retention

**Question**: F12 cleanup binary 怎麼取得 DB 連線與 retention 天數?

**Evidence**(research agent):
- rust-api app 用 `server-config` 讀 `application.yaml` + env override + secret `_FILE` pattern。
- **但** `migration` binary **不用** `server-config` — 它是 `sea-orm-migration` CLI、直接讀 `DATABASE_URL` env(sea-orm-cli 慣例);`migration/Cargo.toml` dep 僅 `async-std` / `sea-orm-adapter` / `sea-orm-migration`、無 `server-*`。
- docker-compose `migration` service(`docker-compose.yml:96`)entrypoint:`sh -c "DATABASE_URL=\"$(cat /run/secrets/database_url)\" exec /usr/local/bin/migration up"` — entrypoint shell wrapper `cat` secret 檔注入 env。
- `Database::connect(url)` 為 codebase 既有連線 API(`initialize/src/db_initialization.rs:13` 等)。

**Decision**: F12 比照 `migration` precedent(最小、與 sibling 一次性 binary 對稱)— `cleanup` binary 讀 `std::env::var("DATABASE_URL")` 取連線字串 + `std::env::var("CLEANUP_RETENTION_DAYS")` 取 retention 天數;`Database::connect(url)` 連線。docker-compose `cleanup` service entrypoint 用同 `sh -c "DATABASE_URL=$(cat /run/secrets/cleanup_database_url) exec /usr/local/bin/cleanup ..."` wrapper pattern(secret 檔換為 `cleanup_database_url`)。F12 **不依賴 `server-config`**。

**Rationale**: F12 為一次性 binary、無 `application.yaml`-shaped 設定面、輸入只有「DB 連線字串」+「retention 天數」;`migration`-style env var 最小、dep graph 最乾淨、與 sibling 一次性 binary 一致。retention 天數在 codebase 無既有設定欄位 → 為全新 env var、預設 90。

**Alternatives considered**: 用 `server-config` + `application.yaml` + `APP_DATABASE_URL_FILE` `_FILE` hardening — rejected:F12 無 `application.yaml`-shaped 設定、引入 `server-config` dep 與 yaml 檔依賴屬非必要。

**Spec impact**: data-model E2 / E6;spec FR-006 / FR-018 對齊。

---

## R-Q5: `cleanup_job` PG role setup SQL 與 GRANT 語法

> ⚠️ **F12 實作修正(2026-05-21)**:下方 `DO $$ … :'cleanup_pw' … $$` 寫法不可行 — 實測 psql 不在 `DO $$ $$` dollar-quoted block 內做變數插值(`syntax error at or near ":"`)。實際 `deploy/cleanup/setup-role.sql` 改用頂層 `SELECT … WHERE NOT EXISTS \gexec` 條件建 role + `\if :{?cleanup_pw}` gate 的頂層 `ALTER ROLE … PASSWORD :cleanup_pw`(bare `:cleanup_pw`、ops 帶引號值 `-v cleanup_pw="'<pw>'"`)。詳見 INTEGRATION-CHECKLIST F12 里程碑 finding ②。

**Question**: `cleanup_job` 最小權限 Postgres role 怎麼建?setup SQL 怎麼 idempotent?

**Evidence / Decision**:
- PostgreSQL `CREATE ROLE` **無 `IF NOT EXISTS`** → setup SQL 用 `DO` block 包:
  ```sql
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cleanup_job') THEN
      CREATE ROLE cleanup_job LOGIN PASSWORD :'cleanup_pw';
    END IF;
  END $$;
  ```
- 最小權限 `GRANT`(idempotent — `GRANT` 重跑無害):
  - `GRANT SELECT, DELETE ON sys_user, sys_role, sys_menu, sys_domain, sys_organization, sys_endpoint, sys_access_key TO cleanup_job;`
  - `GRANT SELECT, INSERT ON sys_operation_log TO cleanup_job;`
  - `GRANT USAGE ON SCHEMA public TO cleanup_job;`(連線後存取 schema 所需)
  - `sys_operation_log` 若 `id` 為 sequence/serial → `GRANT USAGE ON SEQUENCE <seq> TO cleanup_job;`(INSERT 取 id 所需 — 實際 PK 型別 implement 階段 psql 確認)
- role 密碼:setup SQL 用 `psql` 變數(`:'cleanup_pw'`)、ops 執行時以 `psql -v cleanup_pw=...` 帶入;ops 須讓該密碼與 `deploy/secrets/cleanup_database_url.txt` 連線字串內的密碼一致。

**Rationale**: `DO` block 是 PG「idempotent CREATE ROLE」的標準寫法;`GRANT` 本身 idempotent。role + grant 屬基礎設施 setup、非 schema → 不走 migration(per spec Q4)。

**Spec impact**: data-model E6;spec FR-016 / FR-017。

---

## R-Q6: `docker compose run` 對 profile-gated service 的行為

**Question**: `cleanup` service 用 `profiles:` 擋住 `docker compose up` 自動起,`docker compose run --rm cleanup` 還能跑嗎?

**Evidence / Decision**:
- docker-compose v2:`profiles:` 只影響 `docker compose up`(未啟用該 profile 時 service 不自動起);`docker compose run <service>` **不受 profile gating 影響**、可直接跑 profile-gated service。
- `docker compose run` 預設會啟動該 service 的 `depends_on`(postgres);F12 host cron 觸發時 stack 通常已 up、postgres 已在 — 無衝突。
- `--rm` 確保 run 完即移除一次性容器。
- arg 透傳:`docker compose run --rm cleanup --execute` 會把 `--execute` 接在 service command 後;`cleanup` service entrypoint 為 shell wrapper 時須 `exec /usr/local/bin/cleanup "$@"` 形式透傳(`$@` 接 run 附加的 arg)。

**Decision**: `cleanup` service 置於 `profiles: ["jobs"]`(或類似)— `docker compose up` 不自動起;host cron 用 `docker compose -f ... run --rm cleanup --execute` 觸發;entrypoint shell wrapper 透傳 `"$@"`。

**Spec impact**: data-model E7;spec FR-003 / FR-024。

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 — audit-write = `server_model::admin::audit_log::write_in_txn`、可重用;`server/cleanup` dep set 確定
- ✅ R-Q2 — `delete_many().filter(pk eq id)` + `audit_snapshot`;7 per-entity block(`sys_menu` i32 PK)
- ✅ R-Q3 — `Actor::system("cleanup_job")` + `AuditOperation::HardDelete` + `AuditSource::Cleanup` 皆 F2.1 已預埋;F12 無 schema 改、無 sentinel user
- ✅ R-Q4 — 比照 `migration` binary 讀 `DATABASE_URL` + `CLEANUP_RETENTION_DAYS` env;不依賴 `server-config`
- ✅ R-Q5 — `cleanup_job` role setup SQL 用 `DO` block 包 `CREATE ROLE`、`GRANT` 最小權限
- ✅ R-Q6 — `docker compose run` 對 profile-gated service 正常;entrypoint wrapper 透傳 `"$@"`
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — F12 brainstorm 已 saturated、Phase 0 為 implement-time pattern 確認;且發現 F2.1 已預埋 F12 全部 audit 元件,F12 較 brainstorm 預期更乾淨(audit 側零新機制)。
