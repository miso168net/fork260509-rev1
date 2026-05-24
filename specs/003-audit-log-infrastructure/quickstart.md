# Quickstart: F2.1 — audit-log-infrastructure

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**目的**：實際 verify F2.1 在本機跑通的最小步驟集；對應 SC-001 ~ SC-010 共 10 個成功指標

---

## 前置（一次性）

```bash
# 在 outer repo 內、確認 feature branch
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current   # 預期：003-audit-log-infrastructure

# 確認 worktree 狀態 clean
git submodule status        # 預期：base-web 與 rust-api 行首皆空格（SHA 對齊）

# 確認 postgres + redis 跑著（per DESIGN-W §6.1 + deploy/ stack）
docker compose ps
```

---

## Step 1 — 套用 1 個 migration（schema 4 新欄）

```bash
cd rust-api
cargo run --bin migration -- up
# 預期：印出 "Applied migration ... extend_sys_operation_log_audit_fields"

# psql 驗 4 新欄
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin -c "\d sys_operation_log"
# 期望 output 含:
#   operation        | character varying(20)  | not null default 'LEGACY'::character varying
#   entity_id        | text                   | nullable
#   payload_before   | jsonb                  | nullable
#   payload_after    | jsonb                  | nullable
```

**Pass 條件 (SC-001)**：4 新欄 + 18 既有欄全部都在；`\d` 顯示 22 columns。

---

## Step 2 — 既有 row backfill 行為驗證

```bash
# 已存在的 sys_operation_log row（F3 留下）operation 應自動標 LEGACY
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT operation, entity_id, payload_before, payload_after FROM sys_operation_log LIMIT 5;"
# 期望：operation = 'LEGACY'、其他 3 欄全 NULL
```

---

## Step 3 — 跑 acceptance tests（含 F3 backward compat）

```bash
cd rust-api
# F3 既有 test（refactor 後仍 pass）
export TEST_DATABASE_URL=postgresql://postgres:123456@127.0.0.1:5432/new_admin_test
cargo test --test soft_delete_basics -- --ignored 2>&1 | tail -10
cargo test --test soft_delete_audit_integration -- --ignored 2>&1 | tail -10
cargo test --test soft_delete_auth_gate -- --ignored 2>&1 | tail -10
# 預期：全綠（SC-002）

# F2.1 新 test（plan-tasks 產出後）
cargo test --test audit_basics -- --ignored 2>&1 | tail -10
cargo test --test audit_transaction_rollback -- --ignored 2>&1 | tail -10
```

**Pass 條件 (SC-002 + SC-006/007/008)**: F3 + F2.1 test 全綠。

---

## Step 4 — AuditSerialize 存在 + redacted_fields 驗證（SC-003）

```bash
cd rust-api

# 7 個 impl AuditSerialize 都存在
grep -c '^impl AuditSerialize for ' server/model/src/admin/audit_serialize.rs
# 預期：>= 7

# sys_user redaction
grep -A 2 'impl AuditSerialize for sys_user::Model' server/model/src/admin/audit_serialize.rs | grep '"password"'
# 預期：found

# sys_access_key redaction
grep -A 2 'impl AuditSerialize for sys_access_key::Model' server/model/src/admin/audit_serialize.rs | grep '"access_key_secret"'
# 預期：found
```

---

## Step 5 — AuditLogCtx deprecation + 0 active callsite（SC-004）

```bash
cd rust-api

# AuditLogCtx 只應在 deprecation declaration 處出現
grep -rn 'AuditLogCtx' server --include='*.rs' | grep -v 'web/audit.rs' | grep -v '#\[deprecated' | grep -v 'From<&AuditEvent'
# 預期：empty (0 active callsite)
```

---

## Step 6 — CI lint 驗證（SC-005）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1

# 正常情境
bash rust-api/scripts/ci-audit-coverage-lint.sh
# 預期 output: "✅ ci-audit-coverage-lint pass"

# 故意刪一個 service 內 audit 呼叫測試（手動 backup + 改檔）
cp rust-api/server/service/src/admin/sys_user_service.rs /tmp/sys_user_service.rs.bak
# 編輯 sys_user_service.rs::create_user method、註解掉 audit_log::write_in_txn 那行
bash rust-api/scripts/ci-audit-coverage-lint.sh
# 預期：exit 1 + 列出 file:line + "missing audit_log::write_in_txn ..."

# 還原
cp /tmp/sys_user_service.rs.bak rust-api/server/service/src/admin/sys_user_service.rs
bash rust-api/scripts/ci-audit-coverage-lint.sh
# 預期：✅ pass
```

---

## Step 7 — 端到端 CRUD + audit row 驗證（SC-006）

### 7a. admin login + create user

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
# 起 rust-api (背景)
cd rust-api && cargo run --bin server > /tmp/rust-api.log 2>&1 &

# 等 rust-api 起來 (~5s)

# admin 登入取 token
TOKEN=$(curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' | jq -r '.data.token')

# CREATE test user
TEST_USER_RESP=$(curl -s -X POST http://127.0.0.1:10001/api/sys-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"default","username":"auditTestUser","password":"testpass123","nickName":"AuditTest","status":"enabled"}')
TEST_USER_ID=$(echo $TEST_USER_RESP | jq -r '.data.id')

# 驗 sys_operation_log 雙寫 row（HTTP 視角 + service-level、per clarify Q1）
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT method, operation, entity_id, payload_after->>'username' AS new_username, 
             payload_after->>'password' AS pw_redacted
      FROM sys_operation_log 
      WHERE entity_id = '$TEST_USER_ID' AND operation = 'INSERT' 
      ORDER BY created_at;"
# 預期 2 row:
#   POST     | INSERT | $TEST_USER_ID | auditTestUser | <redacted>      (method=POST, HTTP middleware row)
#   INTERNAL | INSERT | $TEST_USER_ID | auditTestUser | <redacted>      (method=INTERNAL, service-level row)
```

**Pass 條件 (SC-006 + SC-007 + Q1 double-write + Q2 Hybrid entity_type)**：2 row、operation=INSERT、entity_id 對應、password 在 payload_after 為 `<redacted>`、entity_type='sys_user'。

### 7b. UPDATE user nick_name

```bash
curl -s -X PUT http://127.0.0.1:10001/api/sys-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$TEST_USER_ID\",\"nickName\":\"UpdatedNick\"}"

# 驗 UPDATE audit row（service-level）
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT operation, 
             payload_before->>'nickName' AS old_nick, 
             payload_after->>'nickName' AS new_nick,
             payload_after->>'password' AS pw_redacted
      FROM sys_operation_log 
      WHERE entity_id = '$TEST_USER_ID' AND operation = 'UPDATE' AND method = 'INTERNAL';"
# 預期：UPDATE | AuditTest | UpdatedNick | <redacted>
```

### 7c. DELETE user（F3 既有路徑、refactor 後驗）

```bash
curl -s -X DELETE "http://127.0.0.1:10001/api/sys-user/$TEST_USER_ID" \
  -H "Authorization: Bearer $TOKEN"

# 驗 SOFT_DELETE audit row（operation enum 取代 F3 既有 description hack）
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT method, operation, entity_id, 
             payload_before->>'username' AS deleted_username,
             payload_after  -- 應為 NULL（軟刪 = no after state）
      FROM sys_operation_log 
      WHERE entity_id = '$TEST_USER_ID' AND operation = 'SOFT_DELETE';"
# 預期 2 row:
#   DELETE   | SOFT_DELETE | $TEST_USER_ID | auditTestUser | <NULL>
#   INTERNAL | SOFT_DELETE | $TEST_USER_ID | auditTestUser | <NULL>
```

### 7d. 同 username 軟刪後可重用（F3 既有 partial unique、F2.1 不破壞）

```bash
# 再 CREATE 同 username — 應 success（partial unique allow active reuse、per F3 Q1）
curl -s -X POST http://127.0.0.1:10001/api/sys-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"default","username":"auditTestUser","password":"newpass","nickName":"Reuse","status":"enabled"}' | jq .
# 預期：{"code":0, "success":true, ...}
```

---

## Step 8 — Transaction rollback 驗證（SC-008）

### 8a. 故意觸發 unique violation

```bash
# CREATE user X
curl -s -X POST http://127.0.0.1:10001/api/sys-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"default","username":"rollbackTest","password":"pwd","nickName":"X","status":"enabled"}' > /dev/null

# 再次 CREATE 同 username（active unique violation）
RESP=$(curl -s -X POST http://127.0.0.1:10001/api/sys-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"default","username":"rollbackTest","password":"pwd2","nickName":"Y","status":"enabled"}')
echo $RESP | jq .
# 預期：error envelope（unique violation 或 6001 等）

# 驗 audit row 沒寫（only 1 row 對應第一次 success、沒有第二次的 row）
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT COUNT(*) FROM sys_operation_log 
      WHERE operation = 'INSERT' 
        AND payload_after->>'username' = 'rollbackTest' 
        AND method = 'INTERNAL';"
# 預期：1（第一次 success）、非 2（不會留失敗 attempt 的 audit）

# 清理：cleanup SQL
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "DELETE FROM sys_user WHERE username IN ('auditTestUser', 'rollbackTest');"
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "DELETE FROM sys_operation_log WHERE entity_id IS NOT NULL AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '1 hour';"
```

**Pass 條件 (SC-008)**：失敗的業務變動不留 audit row。

---

## Step 9 — HTTP middleware audit 路徑驗證（SC-009 + clarify Q2）

```bash
# admin POST /api/auth/login - non-admin URL、走 fallback "http_event"
curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' > /dev/null

# 驗 audit row entity_type = "http_event"（per clarify Q2）
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT module_name, method, url FROM sys_operation_log 
      WHERE url = '/api/auth/login' AND operation = 'INSERT' 
      ORDER BY created_at DESC LIMIT 1;"
# 預期：http_event | POST | /api/auth/login
```

**Pass 條件 (SC-009)**：non-admin URL → entity_type fallback `"http_event"`；admin URL → entity_type=`sys_<x>`。

---

## Step 10 — cargo check 全 workspace（SC-010）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
cargo check 2>&1 | tail -10
# 預期：Finished `dev` profile [unoptimized + debuginfo] target(s) in Xs
# 預期：0 errors、0 warnings (-D unused-imports / dead_code)
```

**Pass 條件 (SC-010)**：cargo check 全 workspace pass、無 warning。

---

## 失敗排查指南

| 症狀 | 可能原因 | 排查 |
|---|---|---|
| Migration 跑失敗 cite ALTER TABLE | sys_operation_log 表已被其他工具改 | psql `\d sys_operation_log` 確認；若已有 operation/entity_id 欄、視為 partial state、需手動 reconcile |
| `cargo test` 編譯失敗 cite `AuditEvent` | trait import path 不對或 lib.rs 沒 pub mod audit_serialize | 看 `rust-api/server/model/src/admin/mod.rs` |
| audit row 內 password 沒 redacted | `AuditSerialize for sys_user::Model` 沒 impl 或 redacted_fields() 錯欄名（如 `"password"` vs `"passwordHash"`）| 看 `rust-api/server/model/src/admin/audit_serialize.rs`；entity Model field 名以 `#[serde(rename_all="camelCase")]` 影響、grep `pub password` 在 entity 內確認實際 serialize key |
| HTTP middleware audit 只寫 1 row（沒 service-level row）| service handler 沒呼叫 audit_log::write_in_txn | CI lint 應 catch；手動 grep 服務 create/update 函式內 |
| entity_type 全部都是 "http_event"（admin URL 也是）| Hybrid rule 沒實作或 prefix match 邏輯錯 | 看 `server/middleware/src/operation_log_middleware.rs` |
| 業務變動 success 但 audit row 沒寫 | `txn.commit()` 之前漏呼 audit 或 audit 寫失敗被吞 | 查 `/tmp/rust-api.log` 找 audit error；確認 service handler 內 `audit_log::write_in_txn(...).await?` 有 `?` 早 return |

---

**完成 verifier 標準**：Step 1-10 全部 Pass = F2.1 達成 SC-001 ~ SC-010 全 10 個 measurable outcome。
