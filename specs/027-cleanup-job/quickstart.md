# Quickstart: F12 — cleanup-job

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

F12 落地操作摘要 — 給 implement 階段與日後維運參考。詳細任務拆解見 `/speckit-tasks` 產出的 `tasks.md`。

---

## 1. rust-api worktree — 新增 `cleanup` binary

```text
rust-api/
├── Cargo.toml                    # 改:[workspace] members 加 "server/cleanup"
├── Dockerfile                    # 改:cargo build 加 --bin cleanup + COPY cleanup binary
└── server/cleanup/               # 新 crate
    ├── Cargo.toml                # package server-cleanup、[[bin]] name = "cleanup"
    └── src/main.rs               # cleanup 邏輯
```

`server/cleanup/Cargo.toml` dep:`server-model`(`../model`)、`server-core`(`../core`)、`sea-orm`、`tokio`、`chrono`、(選)`tracing` — 見 data-model E1。

`src/main.rs` 結構(~150-200 LOC):
- `#[tokio::main]` → 讀 `CLEANUP_RETENTION_DAYS`(預設 90)→ 無效則 log error + `exit(1)`
- 算 `cutoff = Utc::now() - Duration::days(retention)`
- 掃 `std::env::args()` 判斷 dry-run(預設)/ `--execute`
- `Database::connect(env DATABASE_URL)`
- 7 表逐表 sweep:`SELECT deleted_at < cutoff` 的 row → dry-run 印報表 / `--execute` 對每 row 開 per-row txn 做 `write_in_txn` + `delete_many().filter(pk eq id)` + commit
- 結束 exit code:全成功 0、有失敗非 0

`Dockerfile` 改(比照既有 `server` / `migration`):
```dockerfile
cargo build --release --bin server --bin migration --bin cleanup
cp target/release/cleanup /tmp/cleanup
strip /tmp/server /tmp/migration /tmp/cleanup
COPY --from=builder /tmp/cleanup /usr/local/bin/cleanup
```

---

## 2. outer — docker-compose service + role setup SQL

`docker-compose.yml` 加 `cleanup` service(profile `jobs`、複用 rust-api image、entrypoint `cat` secret 注入 `DATABASE_URL`)+ `secrets:` 註冊 `cleanup_database_url` — 見 data-model E7。

`deploy/cleanup/setup-role.sql`(新建)— `cleanup_job` PG role + 最小權限 `GRANT`,`CREATE ROLE` 包 `DO` block — 見 data-model E6 / research R-Q5。

---

## 3. ops 首次部署一次性步驟

```bash
# (1) 建 cleanup_job role(idempotent、可重跑)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -v cleanup_pw="'<選一組密碼>'" \
  -f - < deploy/cleanup/setup-role.sql

# (2) 備 cleanup_database_url secret(gitignored;密碼須與上面一致)
echo 'postgres://cleanup_job:<同上密碼>@postgres:5432/soybean_admin_rust' \
  > deploy/secrets/cleanup_database_url.txt
```

---

## 4. 觸發 cleanup

```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

# dry-run(預設、無旗標)— 只報告「將刪 N row」、不刪不寫
$PC run --rm cleanup

# 真刪 — host crontab 排此行(範例:每日 03:30)
$PC run --rm cleanup --execute

# 改保留期(預設 90 天)
$PC run --rm -e CLEANUP_RETENTION_DAYS=180 cleanup            # dry-run 看 180 天門檻
```

host crontab 範例(每日 03:30 跑正式清除):
```cron
30 3 * * * cd /path/to/fork260509-rev1 && docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm cleanup --execute >> /var/log/cleanup-job.log 2>&1
```

---

## 5. Acceptance

依 `contracts/verification-commands.md` C-V1~C-V9 逐項驗:image rebuild + cleanup binary / role setup + 最小權限 / dry-run 不刪不寫 / `--execute` 物理刪 + `HARD_DELETE` audit / 未到期不刪 / idempotent 重跑 / retention 無效拒跑 / dev stack regression / three-side scope。

acceptance 採「植入 `f12-test-*` 過期軟刪 row → 跑 cleanup → 驗 → 清理」模式、不污染 seed。

---

## 6. 兩段式 commit(per CLAUDE.md §6.1)

```bash
# === Stage 1:rust-api worktree ===
cd rust-api
git add Cargo.toml Dockerfile server/cleanup/
git commit -m "feat(rust-api): F12 cleanup-job — 新增 cleanup binary 物理刪除過期軟刪 row"
# push 等 user 同意
cd ..

# === Stage 2:outer ===
git add docker-compose.yml deploy/cleanup/ rust-api \
        specs/027-cleanup-job/ CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json
git commit -m "feat(spec): F12 cleanup-job — cleanup service + cleanup_job role + spec docs"
# push + merge --no-ff + SHA fill follow-up — 等 user 同意
```

**有 `docker-compose.yml` 改、無 DB migration**;base-web + nestjs 兩邊零改動。

---

## 完成標誌

- ✅ 新 crate `server/cleanup` + `cleanup` binary 進 image
- ✅ `docker-compose.yml` `cleanup` service(profile-gated)+ `deploy/cleanup/setup-role.sql`
- ✅ dry-run 預設 / `--execute` 真刪 / 每筆 `HARD_DELETE` audit / 獨立 `cleanup_job` 最小權限 credential
- ✅ C-V1~C-V9 acceptance 9/9 PASS
- ✅ 無 migration、無 DB schema 改、不碰 `casbin_rule`、base-web + nestjs 零改動
- ✅ 兩段式 commit、DESIGN-A 本體(F1–F12)收尾
