# Quickstart: F3 — soft-delete-infrastructure

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**目的**：實際 verify F3 在本機跑通的最小步驟集；對應 SC-001 ~ SC-010 共 10 個成功指標

---

## 前置（一次性）

```bash
# 在 outer repo 內、確認 feature branch
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current   # 預期：002-soft-delete-infrastructure

# 確認 worktree 狀態 clean
git submodule status        # 預期：base-web 與 rust-api 行首皆空格（SHA 對齊）

# 確認 postgres + redis 跑著（CLAUDE.md §5.2 / DESIGN-W §6.1）
docker compose ps           # 或視當前 deploy/ 狀態
```

---

## Step 1 — 套用 7 個 migration

```bash
cd rust-api

# Sea-ORM migration CLI（rust-api 內既有 sea-orm-cli 安裝）
cargo run --bin migration -- up
# 或 (依 sea-orm-cli setup)
# sea-orm-cli migrate up

# 預期：印出 "Applied migration ... add_soft_delete_to_sys_user" 等 7 行
```

**Pass 條件 (SC-001)**：psql `\d sys_user` 應看到 `deleted_at | timestamp` 欄位、其他 6 個 entity 同樣。

```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin -c "\d sys_user"
# 期望 output 含: deleted_at | timestamp without time zone | null
```

抽 5 個 entity 重複此檢查、全部含 deleted_at 即 pass。

---

## Step 2 — 驗證 partial unique index（SC-002）

```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin -c "\d+ sys_user"
# 期望看到:
#   "sys_user_username_active_uidx" UNIQUE, btree (username) WHERE deleted_at IS NULL
#   "sys_user_email_active_uidx" UNIQUE, btree (email) WHERE deleted_at IS NULL  
#   "sys_user_phone_number_active_uidx" UNIQUE, btree (phone_number) WHERE deleted_at IS NULL
```

驗 partial unique 真的生效：

```sql
-- 用 psql 跑：
INSERT INTO sys_user (id, username, password, domain, built_in, nick_name, status, created_at, created_by)
  VALUES ('test-1', 'TestAlice', 'pwd', 'default', false, 'Alice', 'enabled', NOW(), 'system');
-- 預期：success

UPDATE sys_user SET deleted_at = NOW() WHERE id = 'test-1';
-- 預期：success（軟刪）

INSERT INTO sys_user (id, username, password, domain, built_in, nick_name, status, created_at, created_by)
  VALUES ('test-2', 'TestAlice', 'pwd', 'default', false, 'Alice2', 'enabled', NOW(), 'system');
-- 預期：success（partial unique 允許、因為 test-1 已軟刪）

INSERT INTO sys_user (id, username, password, domain, built_in, nick_name, status, created_at, created_by)
  VALUES ('test-3', 'TestAlice', 'pwd', 'default', false, 'Alice3', 'enabled', NOW(), 'system');
-- 預期：ERROR（partial unique 阻擋、因為 test-2 active）

-- 清理：
DELETE FROM sys_user WHERE id LIKE 'test-%';
```

---

## Step 3 — 啟動 rust-api 並執行 acceptance tests

```bash
cd rust-api
cargo test --test soft_delete_acceptance 2>&1 | tail -20
# 預期：~12 個 test case 全 pass（對應 spec scenarios 1-12 + SC-006/007/009/010）
```

**Pass 條件 (SC-006 / SC-007 / SC-009 / SC-010)**: 全 test pass。

---

## Step 4 — 驗證 SoftDeletable trait + facade module 存在（SC-003 / SC-004）

```bash
# SC-003: 7 個 entity 的 impl SoftDeletable 都存在
grep -c 'impl SoftDeletable' rust-api/server/core/src/db/soft_delete.rs
# 預期：>= 7

# SC-004: 7 個 facade module 都存在且 re-export 正確
for entity in sys_user sys_role sys_menu sys_domain sys_organization sys_endpoint sys_access_key; do
  echo "=== $entity ==="
  
  # facade file 必存在
  test -f "rust-api/server/model/src/admin/facade/$entity.rs" \
    && echo "  ✓ facade file exists" \
    || echo "  ✗ MISSING facade file"
  
  # Entity 必 NOT 在 re-export 列表
  if grep -E 'pub use.*::Entity\b' "rust-api/server/model/src/admin/facade/$entity.rs" >/dev/null; then
    echo "  ✗ Entity is re-exported (forbidden)"
  else
    echo "  ✓ Entity not re-exported (correct)"
  fi
  
  # 4 個 bare-function helper 都齊
  for fn in find_active find_with_deleted soft_delete_by_id restore_by_id; do
    if grep -E "pub (async )?fn $fn\b" "rust-api/server/model/src/admin/facade/$entity.rs" >/dev/null; then
      echo "  ✓ $fn"
    else
      echo "  ✗ MISSING $fn"
    fi
  done
done
```

**Pass 條件**：全部 ✓、無 ✗。

---

## Step 5 — 驗證 CI lint 鎖住 entities 直 import（SC-005）

```bash
# 跑 CI lint script — 應該 pass
bash rust-api/scripts/ci-soft-delete-lint.sh
# 預期 output: "✅ ci-soft-delete-lint pass"

# 故意在 service / api / router 加違規 import — 應該 fail
cat > /tmp/violation_test.rs << 'EOF'
use server_model::admin::entities::sys_user;  // 違規
EOF
cp /tmp/violation_test.rs rust-api/server/service/src/admin/_violation_test.rs
bash rust-api/scripts/ci-soft-delete-lint.sh
# 預期 output: "❌ Direct entities import ..." + exit 1

# 清理：
rm rust-api/server/service/src/admin/_violation_test.rs
```

**Pass 條件 (SC-005)**：正常情況 lint pass、人為違規 lint fail（exit 1）。

---

## Step 6 — 驗證 service code migration 完成（SC-008）

```bash
# 對 7 個 entity 跑 grep — service 內 0 個 raw Entity::find/delete callsite
for entity in sys_user sys_role sys_menu sys_domain sys_organization sys_endpoint sys_access_key; do
  count=$(grep -rE "$entity::Entity::(find\(|find_by_id|delete_by_id|delete_many)" \
    rust-api/server/service --include='*.rs' | wc -l)
  echo "$entity: $count raw callsite (expected 0)"
done
```

**Pass 條件 (SC-008)**：7 個 entity 全為 0。

---

## Step 7 — 端到端 login + admin soft-delete + auth gate 流程

### 7a. 啟動 base + rust + 跑 admin 軟刪 user

```bash
# 起 rust-api (背景)
cd rust-api && cargo run --bin server > /tmp/rust-api.log 2>&1 &

# 等 rust-api 起來 (~5s)

# admin 登入取 token
TOKEN=$(curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' | jq -r '.data.token')
echo "Admin token: $TOKEN"

# 建立測試 user
curl -s -X POST http://127.0.0.1:10001/api/sys-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"default","username":"testQuickstartUser","password":"testpass123","nickName":"TestUser","status":"enabled"}'

# 測試 user 登入取 token
TEST_TOKEN=$(curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testQuickstartUser","password":"testpass123"}' | jq -r '.data.token')
echo "Test user token: $TEST_TOKEN"

# admin 軟刪測試 user (取得 user id 先)
TEST_USER_ID=$(curl -s "http://127.0.0.1:10001/api/sys-user/list?keywords=testQuickstartUser" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.records[0].id')
echo "Test user id: $TEST_USER_ID"

curl -s -X DELETE "http://127.0.0.1:10001/api/sys-user/$TEST_USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 預期：{"code":0, "success":true, ...}

# DB 驗證：deleted_at 已設
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT id, username, deleted_at FROM sys_user WHERE id = '$TEST_USER_ID';"
# 預期：deleted_at = 2026-05-14 ...（非 NULL）

# DB 驗證：sys_operation_log 有對應 SOFT_DELETE row
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "SELECT module_name, description FROM sys_operation_log 
      WHERE module_name = 'sys_user' AND description LIKE 'SOFT_DELETE id=$TEST_USER_ID%' 
      ORDER BY created_at DESC LIMIT 1;"
# 預期：sys_user | SOFT_DELETE id=<TEST_USER_ID>
```

### 7b. 軟刪後拒絕 login（scenario 9、SC-006）

```bash
# 用同樣帳密再 login — 應該被拒絕
curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testQuickstartUser","password":"testpass123"}' | jq .
# 預期：{"code": 6001 (ENTITY_NOT_FOUND), "msg": "...", "success": false}
```

### 7c. 軟刪 user 持舊 JWT 打 API → 8888（scenario 10、SC-010）

```bash
# 用先前抓到的 TEST_TOKEN (軟刪前抓的) 打 /auth/getUserInfo
curl -s "http://127.0.0.1:10001/api/auth/getUserInfo" \
  -H "Authorization: Bearer $TEST_TOKEN" | jq .
# 預期：{"code": 8888 (LOGOUT_SESSION_INVALIDATED), 
#         "msg": "session invalidated: user no longer active", 
#         "success": false}
```

### 7d. restore 還原 user（scenario 7、SC-006）

```bash
# 透過 Rust binary tool 或 manual SQL 還原（F3 不提供 HTTP restore endpoint）
psql -h 127.0.0.1 -p 5432 -U postgres -d new_admin \
  -c "UPDATE sys_user SET deleted_at = NULL WHERE id = '$TEST_USER_ID';"

# 再 login — 應該成功
curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testQuickstartUser","password":"testpass123"}' | jq .
# 預期：{"code": 0, "data": {"token": "...", "refreshToken": "..."}, "success": true}
```

> 注：production-level restore 應透過 `sys_user::restore_by_id(db, id, actor)` programmatic API、寫 RESTORE audit row。本 quickstart 用 raw UPDATE 為 demo 簡化、實際 admin tool 由 F7+ feature 提供。

---

## Step 8 — sys_menu 樹狀 cascade 防護驗證（SC-009、scenarios 11/12）

### 8a. 創建有子節點的 menu

```bash
# 用 admin token 創建父 menu
PARENT_ID=$(curl -s -X POST "http://127.0.0.1:10001/api/sys-menu" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"menuType":"directory","menuName":"TestParent","routeName":"test-parent","routePath":"/test-parent","component":"layout.base","pid":"0","sequence":99,"status":"enabled","constant":false}' \
  | jq -r '.data.id')
echo "Parent menu id: $PARENT_ID"

# 創建 child menu（pid = PARENT_ID）
CHILD_ID=$(curl -s -X POST "http://127.0.0.1:10001/api/sys-menu" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"menuType\":\"menu\",\"menuName\":\"TestChild\",\"routeName\":\"test-child\",\"routePath\":\"/test-child\",\"component\":\"view.test\",\"pid\":\"$PARENT_ID\",\"sequence\":1,\"status\":\"enabled\",\"constant\":false}" \
  | jq -r '.data.id')
echo "Child menu id: $CHILD_ID"
```

### 8b. 嘗試刪 parent（有 active child）— 應該拒絕

```bash
curl -s -X DELETE "http://127.0.0.1:10001/api/sys-menu/$PARENT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 預期：{"code": 6003 (STATE_CONFLICT), 
#         "msg": "cannot delete: 1 active children exist",
#         "success": false}
```

### 8c. 先刪 child、再刪 parent — 應該成功

```bash
curl -s -X DELETE "http://127.0.0.1:10001/api/sys-menu/$CHILD_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 預期：{"code": 0, "success": true}

curl -s -X DELETE "http://127.0.0.1:10001/api/sys-menu/$PARENT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 預期：{"code": 0, "success": true}
```

---

## 失敗排查指南

| 症狀 | 可能原因 | 排查 |
|---|---|---|
| Migration 跑失敗 cite DROP CONSTRAINT | 既有 constraint name 跟 sea-orm-codegen 預設不同 | psql `\d <table>` 確認實際 constraint name、調整 migration |
| `cargo test` 編譯失敗 cite `SoftDeletable` | trait import path 不對或 lib.rs 沒 pub mod db | 看 `rust-api/server/core/src/lib.rs` |
| `find_active` 返回軟刪 row | DELETED_AT_COLUMN 常數設錯（指錯欄位）| 看 `soft_delete.rs` 7 個 impl block |
| 7c 沒回 8888 而是回 6001 | FR-028 jwt middleware 沒加 active check | 看 `server/middleware/src/jwt.rs` |
| 8b 沒回 6003 而是直接軟刪 parent | FR-026 tree cascade check 沒在 facade `sys_menu::soft_delete_by_id` 內 | 看 `server/model/src/admin/facade/sys_menu.rs` |
| service 內仍可直 import entities::sys_xxx | CI lint script 沒跑或 whitelist 太寬 | 跑 `bash rust-api/scripts/ci-soft-delete-lint.sh` |

---

**完成 verifier 標準**：Step 1-8 全部 Pass = F3 達成 SC-001 ~ SC-010 全 10 個 measurable outcome。
