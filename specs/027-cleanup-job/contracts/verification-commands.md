# Verification Commands: F12 — cleanup-job

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

9 個 C-V contract = F12 的 verification scenario(US1 P1 7 acceptance scenario → C-V mapping + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)。

> **F12 acceptance 在 dev stack 跑** — F12 的 `cleanup` service 為 profile-gated、跨環境一致(spec FR-024:只改 base `docker-compose.yml`、dev/prod 同行為)。dev stack 起法見 CLAUDE.md §5.2.1。
> psql 連線經 `docker compose exec postgres`(DB `soybean_admin_rust`、user `soybean`)。
> 測試資料採 **capture → 植入過期軟刪 row → 跑 cleanup → 驗證 → 清理** 模式;測試 row 用明顯可識別的 id 前綴(如 `f12-test-*`),避免污染 seed。
> `cleanup` service profile-gated → 用 `docker compose ... run --rm cleanup [--execute]` 觸發(不是 `up`)。

---

## C-V1: rust-api image rebuild OK(含 cleanup binary)

**Goal**:驗 F12 新增的 `server/cleanup` crate cargo build 成功、`cleanup` binary 進 image。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
docker run --rm --entrypoint sh rust-api:rev1-admin-rust-api -c "ls -l /usr/local/bin/cleanup /usr/local/bin/server /usr/local/bin/migration"
```

**Expected**:build exit 0;image 內 `/usr/local/bin/` 同時有 `cleanup` / `server` / `migration` 三個 binary。
**Pass criteria**:cargo build exit 0、`cleanup` binary 存在於 image。
**Failure handling**:check `server/cleanup/Cargo.toml` dep、`rust-api/Cargo.toml` workspace members、Dockerfile `--bin cleanup` + `COPY`。

---

## C-V2: `cleanup_job` role setup + 最小權限驗證

**Goal**:驗 `deploy/cleanup/setup-role.sql` 可套用、`cleanup_job` role 權限恰為最小集。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# 套用 setup SQL(idempotent — 重跑亦應 OK)
$PC exec -T postgres psql -U soybean -d soybean_admin_rust \
  -v cleanup_pw="'f12testpw'" -f - < deploy/cleanup/setup-role.sql
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -f - < deploy/cleanup/setup-role.sql  # 重跑驗 idempotent
# 最小權限驗:cleanup_job 能 DELETE 軟刪表、能 INSERT operation_log
$PC exec -T postgres psql -U cleanup_job -d soybean_admin_rust -tAc \
  "SELECT has_table_privilege('cleanup_job','sys_user','DELETE'), has_table_privilege('cleanup_job','sys_operation_log','INSERT');"
# 最小權限驗:cleanup_job 不能改 schema / 不能讀無關表
$PC exec -T postgres psql -U cleanup_job -d soybean_admin_rust -tAc \
  "SELECT has_table_privilege('cleanup_job','casbin_rule','DELETE'), has_table_privilege('cleanup_job','sys_operation_log','DELETE');"
```

**Expected**:setup SQL 兩次套用皆成功(idempotent);`cleanup_job` 對 `sys_user` DELETE = `t`、對 `sys_operation_log` INSERT = `t`;對 `casbin_rule` DELETE = `f`、對 `sys_operation_log` DELETE = `f`。
**Pass criteria**:role 建立成功、權限恰為最小集(7 表 SELECT/DELETE + operation_log SELECT/INSERT、無其他)。
**Failure handling**:check setup SQL `DO` block / `GRANT` 對象表清單。

> `cleanup_database_url.txt` secret 內連線字串的密碼須與 `-v cleanup_pw` 帶入值一致;acceptance 用 `f12testpw`。

---

## C-V3: dry-run — 報告但不刪不寫

**Goal**:驗無旗標執行為 dry-run、只報表不副作用。

**Command**(capture → 植入 → dry-run → 驗):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# capture baseline
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM sys_endpoint; SELECT count(*) FROM sys_operation_log;"
# 植入一筆過期軟刪 sys_endpoint row(deleted_at = 1 年前)
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "INSERT INTO sys_endpoint (id, path, method, action, resource, controller, summary, created_at, deleted_at) \
   VALUES ('f12-test-ep-1','/f12/probe','GET','read','f12','f12','f12 test', now(), now() - interval '365 days');"
# dry-run(無 --execute)
$PC run --rm cleanup 2>&1 | tail -15
# 驗:f12-test row 仍在、operation_log 未增
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM sys_endpoint WHERE id='f12-test-ep-1';"
```

**Expected**:dry-run 報表列出「`sys_endpoint`: ≥1 row 將刪」、回 exit 0;`f12-test-ep-1` 仍存在(count=1)、`sys_operation_log` 筆數不變。
**Pass criteria**:dry-run 報告待刪 row 但 7 表 row 與 `sys_operation_log` 皆未變。
**Failure handling**:dry-run 若刪了 row → check `--execute` 旗標判斷邏輯。

> sys_endpoint 欄位以實際 schema 為準、implement 階段 psql `\d sys_endpoint` 確認 INSERT 欄位列表。

---

## C-V4: `--execute` — 物理刪除 + HARD_DELETE audit(核心)

**Goal**:驗 `--execute` 物理刪過期 row、每筆寫對 audit。

**Command**(承 C-V3 已植入 `f12-test-ep-1`):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC run --rm cleanup --execute 2>&1 | tail -15
# 驗:f12-test row 物理消失
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM sys_endpoint WHERE id='f12-test-ep-1';"
# 驗:sys_operation_log 多一筆 HARD_DELETE、actor=cleanup_job、含 before-snapshot
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT operation, user_id, username, entity_type, entity_id, (payload_before IS NOT NULL), (payload_after IS NULL) \
   FROM sys_operation_log WHERE operation='HARD_DELETE' AND entity_id='f12-test-ep-1';"
```

**Expected**:`f12-test-ep-1` 從 `sys_endpoint` 物理消失(count=0);`sys_operation_log` 出現一筆 `operation=HARD_DELETE`、`user_id=username=cleanup_job`、`entity_type=sys_endpoint`、`entity_id=f12-test-ep-1`、`payload_before` 非 null、`payload_after` 為 null。
**Pass criteria**:過期 row 物理刪除 + 對應 `HARD_DELETE` audit(actor + before-snapshot 正確)。
**Failure handling**:row 未刪 → check delete `filter`;audit 未寫 → check `write_in_txn` 呼叫 / `AuditEvent` 組裝。

---

## C-V5: 未到保留期的 row 不刪

**Goal**:驗 `deleted_at` 未超過保留期的軟刪 row 不受影響。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# 植入一筆「最近才軟刪」的 row(deleted_at = 1 天前、< 90 天保留期)
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "INSERT INTO sys_endpoint (id, path, method, action, resource, controller, summary, created_at, deleted_at) \
   VALUES ('f12-test-ep-recent','/f12/recent','GET','read','f12','f12','f12 test', now(), now() - interval '1 day');"
$PC run --rm cleanup --execute 2>&1 | tail -8
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT count(*) FROM sys_endpoint WHERE id='f12-test-ep-recent';"
# 清理測試 row
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "DELETE FROM sys_endpoint WHERE id='f12-test-ep-recent';"
```

**Expected**:`f12-test-ep-recent`(軟刪僅 1 天)`--execute` 後仍存在(count=1)— 未到 90 天保留期。
**Pass criteria**:未到期軟刪 row 不被刪。

---

## C-V6: idempotent 重跑

**Goal**:驗 `--execute` 重跑無副作用。

**Command**(承 C-V4 — `f12-test-ep-1` 已被刪):
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# 記錄當前 operation_log 筆數
BEFORE=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_operation_log;")
$PC run --rm cleanup --execute 2>&1 | tail -8
AFTER=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT count(*) FROM sys_operation_log;")
echo "operation_log before=$BEFORE after=$AFTER（預期相等 — 已無過期 row、無新 audit）"
```

**Expected**:第二次 `--execute` 報告 0 筆待刪 / 0 筆刪除;`sys_operation_log` 筆數不變(`before == after`)。
**Pass criteria**:重跑 idempotent — 無 row 被刪、無新 audit。

---

## C-V7: retention 未配置 / 無效 → 拒跑

**Goal**:驗無效 retention 時 cleanup 拒跑、不刪任何 row。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# 用無效值覆寫 CLEANUP_RETENTION_DAYS
$PC run --rm -e CLEANUP_RETENTION_DAYS=abc cleanup --execute 2>&1 | tail -5; echo "exit=$?"
$PC run --rm -e CLEANUP_RETENTION_DAYS=-5 cleanup --execute 2>&1 | tail -5; echo "exit=$?"
$PC run --rm -e CLEANUP_RETENTION_DAYS=0 cleanup --execute 2>&1 | tail -5; echo "exit=$?"
```

**Expected**:三種無效值(`abc` / `-5` / `0`)cleanup 皆拒跑、回非 0 exit code、log 明確 error、不刪任何 row。
**Pass criteria**:無效 retention → 拒跑 + exit≠0 + 不碰資料。

---

## C-V8: dev stack regression(cleanup service profile-gated)

**Goal**:驗 `cleanup` service 不影響既有 stack、profile gating 生效。

**Command**:
```bash
PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC --profile track-a up -d --wait 2>&1 | tail -5
$PC ps --format "table {{.Service}}\t{{.State}}" | grep -c cleanup || echo "cleanup 未在 up 服務中(預期 — profile-gated)"
$PC ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
curl -fsS http://127.0.0.1:11081/health -w " <- rust-api\n"
```

**Expected**:`docker compose up` 後 `cleanup` service **不出現**在運行容器中(profile `jobs` 未啟用);既有 dev stack service(base-web / front-nginx / postgres / redis / rust-api、track-a 含 nestjs)全 healthy、rust-api `/health` 正常。
**Pass criteria**:cleanup service profile-gated 不自動起、既有 stack 不退化。

---

## C-V9: three-side scope verify(zero-regression)

**Command**:
```bash
echo "base-web/ diff (預期 0):" && git diff HEAD -- base-web/ | wc -l
echo "nestjs fork diff (預期 0):" && git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "docker-compose.dev.yml diff (預期 0):" && git diff HEAD -- docker-compose.dev.yml | wc -l
echo "docker-compose.prod.yml diff (預期 0):" && git diff HEAD -- docker-compose.prod.yml | wc -l
echo "migration/ diff (預期 0 — 無新 migration):" && (cd rust-api && git diff HEAD -- migration/ | wc -l)
echo "rust-api scope:" && (cd rust-api && git diff HEAD --stat && git status --short)
echo "outer scope:" && git status --short
```

**Expected**:
- base-web/ + nestjs fork + `docker-compose.dev.yml` + `docker-compose.prod.yml` + `rust-api/migration/` 各 **0 line** diff
- rust-api scope = 新 crate `server/cleanup/`(`Cargo.toml` + `src/main.rs`)+ `Cargo.toml`(workspace members)+ `Dockerfile`
- outer scope:`docker-compose.yml`(加 cleanup service)+ `deploy/cleanup/setup-role.sql`(新)+ rust-api SHA pin + spec docs + `CLAUDE.md` + `INTEGRATION-CHECKLIST.md`

**Pass criteria**:base-web / nestjs / dev+prod compose overlay / migration 各 0 diff;`casbin_rule` 零改動;無新 migration、無 DB schema 改。

---

## 完成標誌

9 個 verification 全 PASS = F12 acceptance 9/9 PASS、ready for 兩段式 commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | image rebuild + cleanup binary | build exit 0 + 3 binary 在 image |
| C-V2 | cleanup_job role setup + 最小權限 | setup SQL idempotent + 權限恰最小集 |
| C-V3 | dry-run 不刪不寫 | 報告待刪 row 但 0 副作用 |
| C-V4 | `--execute` 物理刪 + audit(核心) | 過期 row 刪除 + `HARD_DELETE` audit 正確 |
| C-V5 | 未到期 row 不刪 | `deleted_at` 未過保留期 row 保留 |
| C-V6 | idempotent 重跑 | 重跑 0 刪、0 新 audit |
| C-V7 | retention 無效拒跑 | 無效值 → 拒跑 + exit≠0 + 不碰資料 |
| C-V8 | dev stack regression | cleanup profile-gated 不自動起、stack 不退化 |
| C-V9 | three-side scope | base-web/nestjs/dev+prod compose/migration 0 diff |
