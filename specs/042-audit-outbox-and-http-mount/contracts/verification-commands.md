# Verification Commands — 042 audit-outbox-and-http-mount

**Phase**：1（Design & Contracts）
**日期**：2026-05-24

11 個 C-V contract = 本 feature 的 acceptance verification scenarios。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack**（5 service healthy）。psql 經 `docker compose exec -T postgres`；redis 經 `docker compose exec -T redis redis-cli`；endpoint 經 front-nginx `:11080`。預設帳號 `Soybean`/`123456`、`Administrator`/`123456`、`GeneralUser`/`123456`。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
# Redis password
export REDIS_PW=$(cat deploy/secrets/redis_password.txt)
```

TOKEN 取得：
```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
echo "Token len=${#TOKEN}"
```

---

## C-V1：rust-api build clean

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -10
```
**Expected**：build exit 0、無 unused import warning、無 new clippy 違規。對應 SC-009（無新 crate dep）+ 落地 sanity。

---

## C-V2：`sys_audit_outbox` schema migration up + down 對稱

```bash
echo "=== migration up（重啟 migration container）==="
$PC up -d migration --force-recreate --wait
$PC logs migration --tail 5

echo ""
echo "=== schema 驗證 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_audit_outbox"
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "\di sys_audit_outbox*"

echo ""
echo "=== row 0（新表初始空）==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_audit_outbox;"

echo ""
echo "=== sys_operation_log 0 改動驗證（schema 不變）==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_operation_log" | head -30
```

**Expected**：
- migration up exit 0
- `\d sys_audit_outbox` 顯示 6 column（id BIGSERIAL / audit_event_json JSONB / published_at TIMESTAMPTZ / retry_count INTEGER / last_error TEXT / created_at TIMESTAMPTZ）
- `\di` 顯示 `idx_sys_audit_outbox_pending` partial index
- 初始 0 row
- sys_operation_log schema 含既有 22 column、不退化

對應 SC-009 + data-model E1。

**Failure handling**：migration 失敗 → 檢 `m20260524_e_audit_outbox_table.rs` execute_unprepared 語法（multi-statement 用 unprepared、不能拆 prepared per 039 教訓）

---

## C-V3：POST /api/role → 1 秒內 sys_operation_log 2 row（INTERNAL + HTTP）

```bash
echo "=== 0. baseline counts ==="
BASELINE_OP=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_operation_log;")
echo "sys_operation_log baseline: $BASELINE_OP"

echo ""
echo "=== 1. POST /api/role 建新 role ==="
curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"ROLE_CV042","name":"CV042Test","description":"042 acceptance","status":"enabled"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'create code={r[\"code\"]}')"

echo ""
echo "=== 2. 等 1 秒讓 drainer 消化 outbox ==="
sleep 1

echo ""
echo "=== 3. sys_operation_log 多 2 row（INTERNAL + HTTP）==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT method, operation, entity_type, entity_id, request_id
FROM sys_operation_log
WHERE entity_type = 'sys_role'
ORDER BY created_at DESC
LIMIT 4;
"

echo ""
echo "=== 4. request_id 串聯 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT request_id, COUNT(*) AS row_count, ARRAY_AGG(method ORDER BY method) AS methods
FROM sys_operation_log
WHERE entity_type = 'sys_role'
GROUP BY request_id
HAVING COUNT(*) >= 2
ORDER BY MAX(created_at) DESC
LIMIT 1;
"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='ROLE_CV042';"
```

**Expected**：
- create code=0
- sys_operation_log 多 2 row、entity_type 皆 sys_role、entity_id 相同、request_id 相同
- methods array 含 `{INTERNAL, POST}`
- row_count = 2、symmetric pair

對應 SC-001、FR-001、US1 Acceptance Scenario 1。

---

## C-V4：跨 router OperationLogLayer 全掛驗證（8 endpoint 抽樣）

```bash
echo "=== 8 endpoint trigger（POST 為主、其他 write）==="
# admin POST
curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"ROLE_CV042_4a","name":"4a","description":"","status":"enabled"}' > /dev/null
# admin systemManage alias
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addRole" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"roleCode":"ROLE_CV042_4b","roleName":"4b","roleDesc":"","status":"enabled"}' > /dev/null
# auth (no token needed)
curl -sS -o /dev/null -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"WrongUser","password":"wrong"}'
# authorization (assign-users)
curl -sS -o /dev/null -X POST "http://127.0.0.1:11080/api/authorization/assign-users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'

sleep 1

echo ""
echo "=== 各 endpoint HTTP-source row 驗證 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT method, url, entity_type
FROM sys_operation_log
WHERE created_at > NOW() - INTERVAL '5 seconds'
  AND method != 'INTERNAL'
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_role WHERE code IN ('ROLE_CV042_4a', 'ROLE_CV042_4b');
"
```

**Expected**：list 含至少 4 row、其中：
- url=/api/role、entity_type=sys_role
- url=/api/systemManage/addRole、entity_type=sys_role
- url=/api/auth/login、entity_type=http_event
- url=/api/authorization/assign-users、entity_type=sys_role

對應 SC-008、FR-003、US1 Acceptance Scenario 1。

---

## C-V5：Drainer 啟動後消化既有 outbox row、published_at 正確標

```bash
echo "=== 1. 手動塞 3 row 到 outbox（模擬 backlog）==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
INSERT INTO sys_audit_outbox (audit_event_json) VALUES
  ('{\"actor\":{\"id\":\"test\",\"username\":\"test\",\"domain\":\"built-in\"},\"operation\":\"INSERT\",\"entity_type\":\"sys_role\",\"entity_id\":\"cv5-1\",\"payload_before\":null,\"payload_after\":{},\"source\":{\"type\":\"Internal\"},\"request_id\":\"cv5-req-1\"}'::jsonb),
  ('{\"actor\":{\"id\":\"test\",\"username\":\"test\",\"domain\":\"built-in\"},\"operation\":\"INSERT\",\"entity_type\":\"sys_role\",\"entity_id\":\"cv5-2\",\"payload_before\":null,\"payload_after\":{},\"source\":{\"type\":\"Internal\"},\"request_id\":\"cv5-req-2\"}'::jsonb),
  ('{\"actor\":{\"id\":\"test\",\"username\":\"test\",\"domain\":\"built-in\"},\"operation\":\"INSERT\",\"entity_type\":\"sys_role\",\"entity_id\":\"cv5-3\",\"payload_before\":null,\"payload_after\":{},\"source\":{\"type\":\"Internal\"},\"request_id\":\"cv5-req-3\"}'::jsonb);
"

echo ""
echo "=== 2. 確認 outbox 3 row pending ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT id, retry_count, published_at IS NULL AS pending
FROM sys_audit_outbox
WHERE audit_event_json->>'request_id' LIKE 'cv5-req-%';
"

echo ""
echo "=== 3. 等 2 秒讓 drainer 消化 ==="
sleep 2

echo ""
echo "=== 4. outbox 3 row published_at 全 NOT NULL ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT id, retry_count, published_at IS NOT NULL AS published
FROM sys_audit_outbox
WHERE audit_event_json->>'request_id' LIKE 'cv5-req-%';
"

echo ""
echo "=== 5. sys_operation_log 出現對應 3 row ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT entity_id, method, operation, request_id
FROM sys_operation_log
WHERE request_id LIKE 'cv5-req-%'
ORDER BY request_id;
"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_operation_log WHERE request_id LIKE 'cv5-req-%';
DELETE FROM sys_audit_outbox WHERE audit_event_json->>'request_id' LIKE 'cv5-req-%';
"
```

**Expected**：
- step 2：3 row pending=t
- step 4：3 row published=t（drainer 消化完）
- step 5：sys_operation_log 含 3 row、entity_id 為 cv5-1/2/3

對應 SC-001、FR-002、drainer 啟動驗證。

---

## C-V6：Redis stream `audit:events` 落入 + XLEN > 0

```bash
echo "=== 1. baseline XLEN ==="
BASELINE_XLEN=$($PC exec -T redis redis-cli -a "$REDIS_PW" --no-auth-warning XLEN audit:events 2>/dev/null || echo "0")
echo "audit:events baseline: $BASELINE_XLEN"

echo ""
echo "=== 2. POST /api/role 觸發 audit ==="
curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"ROLE_CV042_6","name":"6","description":"","status":"enabled"}' > /dev/null

sleep 1

echo ""
echo "=== 3. XLEN 增加 ==="
NEW_XLEN=$($PC exec -T redis redis-cli -a "$REDIS_PW" --no-auth-warning XLEN audit:events)
echo "audit:events new XLEN: $NEW_XLEN"
echo "delta: $((NEW_XLEN - BASELINE_XLEN))"

echo ""
echo "=== 4. XREAD 最後 5 entry 驗證 JSON 結構 ==="
$PC exec -T redis redis-cli -a "$REDIS_PW" --no-auth-warning XREVRANGE audit:events + - COUNT 5

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='ROLE_CV042_6';"
```

**Expected**：
- new XLEN ≥ baseline + 2（每 write 2 row）
- XREVRANGE 最後 5 entry 含 audit JSON、可看到 actor / operation / entity_type / source fields

對應 SC-005、FR-005、US2 Acceptance Scenario 1。

---

## C-V7：multi-replica drainer 不重複處理（SKIP LOCKED 驗）

```bash
echo "=== 1. dev stack scale rust-api=2 ==="
$PC up -d --scale rust-api=2 rust-api --force-recreate --wait

echo ""
echo "=== 2. 連發 50 個 POST /api/role ==="
for i in {1..50}; do
  curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"code\":\"ROLE_CV042_7_$i\",\"name\":\"7_$i\",\"description\":\"\",\"status\":\"enabled\"}" > /dev/null
done

sleep 3

echo ""
echo "=== 3. outbox 應有 100 row（50 INTERNAL + 50 HTTP）、全 published ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT
  COUNT(*) AS total_outbox,
  COUNT(*) FILTER (WHERE published_at IS NOT NULL) AS published_count,
  COUNT(DISTINCT (audit_event_json->>'request_id')) AS unique_requests
FROM sys_audit_outbox
WHERE audit_event_json->'actor'->>'username' = 'Soybean'
  AND created_at > NOW() - INTERVAL '10 seconds';
"

echo ""
echo "=== 4. sys_operation_log 應有 100 row、無重複 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT
  COUNT(*) AS total_log,
  COUNT(DISTINCT id) AS unique_log_id
FROM sys_operation_log
WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV042_7_%')
  AND created_at > NOW() - INTERVAL '10 seconds';
"

echo ""
echo "=== 5. scale 回 1 + cleanup ==="
$PC up -d --scale rust-api=1 rust-api --wait
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV042_7_%');
DELETE FROM sys_audit_outbox WHERE audit_event_json->>'request_id' IN (
  SELECT request_id FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV042_7_%')
);
DELETE FROM sys_role WHERE code LIKE 'ROLE_CV042_7_%';
"
```

**Expected**：
- step 3：total_outbox = 100、published_count = 100、unique_requests = 50
- step 4：total_log = 100、unique_log_id = 100（無重複）

對應 SC-003、FR-010、US1 Acceptance Scenario 4。

**Failure handling**：若 total_log > 100 → drainer SKIP LOCKED 未生效、檢 SELECT FOR UPDATE SKIP LOCKED 寫法

---

## C-V8：Redis 暫停 → drainer retry_count++、Redis 恢復後消化

```bash
echo "=== 1. baseline ==="
BASELINE_OUTBOX=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_audit_outbox WHERE published_at IS NULL;")
echo "outbox pending baseline: $BASELINE_OUTBOX"

echo ""
echo "=== 2. 停 Redis ==="
$PC stop redis

echo ""
echo "=== 3. 連發 5 個 POST /api/role（Redis 不可用）==="
for i in {1..5}; do
  curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"code\":\"ROLE_CV042_8_$i\",\"name\":\"8_$i\",\"description\":\"\",\"status\":\"enabled\"}" > /dev/null 2>&1 || true
done

sleep 5

echo ""
echo "=== 4. outbox 多 ~10 pending row、retry_count > 0 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT
  COUNT(*) AS pending_now,
  COUNT(*) FILTER (WHERE retry_count > 0) AS retry_count_gt_0
FROM sys_audit_outbox
WHERE published_at IS NULL;
"

echo ""
echo "=== 5. 啟 Redis、等 10 秒消化 ==="
$PC start redis
sleep 10

echo ""
echo "=== 6. outbox pending 回到 baseline ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT COUNT(*) AS pending_after FROM sys_audit_outbox WHERE published_at IS NULL;
"

echo ""
echo "=== 7. sys_operation_log 補齊 10 row ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT COUNT(*) AS log_count_recovered FROM sys_operation_log
WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV042_8_%');
"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV042_8_%');
DELETE FROM sys_audit_outbox WHERE audit_event_json->>'request_id' IN (
  SELECT request_id FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV042_8_%')
);
DELETE FROM sys_role WHERE code LIKE 'ROLE_CV042_8_%';
"
```

**Expected**：
- step 4：pending_now > baseline + ~5、retry_count_gt_0 > 0
- step 6：pending_after ≈ baseline（drainer 消化完）
- step 7：log_count_recovered = 10（5 role × 2 row/role）

對應 SC-002、FR-002、FR-011、US1 Acceptance Scenario 2 + 3。

---

## C-V9：URL → entity_type 規則抽樣驗證

```bash
echo "=== 8 endpoint 抽樣 trigger ==="
# /api/user
curl -fsS -X POST "http://127.0.0.1:11080/api/user" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"username":"cv9user","email":"","nickName":"","password":"x"}' > /dev/null 2>&1 || true
# /api/systemManage/addUser
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"userName":"cv9sysuser","userGender":"1","nickName":"cv9","status":"1"}' > /dev/null 2>&1 || true
# /api/role
curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"ROLE_CV9","name":"cv9","description":"","status":"enabled"}' > /dev/null 2>&1 || true
# /api/route（GET 不算、改用 POST 不存在 endpoint 也能進 middleware）
curl -sS -X POST "http://127.0.0.1:11080/api/route" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{}' > /dev/null 2>&1 || true
# /api/auth/login (fail)
curl -sS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"badwrongman","password":"bad"}' > /dev/null

sleep 1

echo ""
echo "=== entity_type 對應驗證 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT url, entity_type, method
FROM sys_operation_log
WHERE created_at > NOW() - INTERVAL '5 seconds'
  AND method != 'INTERNAL'
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_user WHERE username IN ('cv9user', 'cv9sysuser');
DELETE FROM sys_role WHERE code='ROLE_CV9';
"
```

**Expected**：
- `/api/user` → entity_type=`sys_user`
- `/api/systemManage/addUser` → entity_type=`sys_user`
- `/api/role` → entity_type=`sys_role`
- `/api/route` → entity_type=`sys_menu`
- `/api/auth/login` → entity_type=`http_event`

對應 SC-008、FR-004、data-model E2。

---

## C-V10：三邊 scope verify

```bash
echo "=== base-web 0 改動 ==="
(cd base-web && git diff HEAD --stat)
echo "(空 = 0 改動)"

echo ""
echo "=== rust-api 改動列 ==="
(cd rust-api && git diff HEAD --stat)

echo ""
echo "=== outer 改動 ==="
git diff HEAD --stat
```

**Expected**：
- base-web 0 改動
- rust-api 改 ~11 files（per plan Structure Decision）：
  - server/core/src/web/operation_log.rs（modify）
  - server/model/src/admin/audit_log.rs（modify + new helper）
  - server/model/src/admin/entities/{mod.rs, prelude.rs, sys_audit_outbox.rs}（3 改/新）
  - server/service/src/admin/{sys_audit_outbox_drainer.rs, sys_operation_log_service.rs}（1 new + 1 modify）
  - server/global/src/{audit_publisher.rs, lib.rs}（1 new + 1 re-export）
  - server/initialize/src/{audit_outbox_initialization.rs, event_channel_initialization.rs, router_initialization.rs, lib.rs}（1 new + 3 modify）
  - server/router/src/admin/sys_menu_route.rs（modify、移既 OperationLogLayer mount）
  - server/resources/application*.yaml（modify、加 audit_outbox section）
  - server/config/src/model/{audit_outbox_config.rs, mod.rs, config.rs}（1 new + 2 modify）
  - migration/src/schemas/m20260524_e_audit_outbox_table.rs（new）
  - migration/src/schemas/mod.rs（modify）
  - migration/src/lib.rs（modify）
- outer 改 INTEGRATION-CHECKLIST.md + rust-api SHA pin + spec docs（已存）

對應 SC-009、FR-012。

---

## C-V11：R2 失敗登入自動結案 + INTEGRATION-CHECKLIST cleanup

```bash
echo "=== 1. POST /auth/login 用錯密碼 ==="
curl -sS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"badusernameforcv11","password":"wrong"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'login code={r[\"code\"]} success={r[\"success\"]}')"

sleep 1

echo ""
echo "=== 2. sys_operation_log 有 HTTP-source row ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
SELECT method, url, user_id, username, ip, user_agent IS NOT NULL AS has_ua
FROM sys_operation_log
WHERE url = '/api/auth/login'
  AND created_at > NOW() - INTERVAL '5 seconds'
ORDER BY created_at DESC
LIMIT 1;
"

echo ""
echo "=== 3. INTERGRATION-CHECKLIST cleanup verify ==="
grep -nE "^\| R2 |^\| R3 |^\| F2.2 " docs/INTEGRATION-CHECKLIST.md && echo "  ✗ row 仍存在" || echo "  ✓ R2/R3/F2.2 已移除"
grep -cn "042 audit-outbox-and-http-mount" docs/INTEGRATION-CHECKLIST.md
```

**Expected**：
- step 1：login code=1003、success=False
- step 2：row 1 筆、method=POST、url=/api/auth/login、user_id 為空、ip 完整、has_ua=t
- step 3：R2/R3/F2.2 row 已移除（grep 0 hit）；042 entry 在已完成里程碑（grep ≥1 hit）

對應 SC-007、SC-010、SC-011、FR-013、US3 Acceptance Scenario 1。

---

## C-V12：Latency benchmark（SC-004 HTTP middleware overhead + SC-005 Redis stream publish→consume）

### Part A：HTTP middleware overhead（SC-004 surrogate）

```bash
echo "=== Part A: POST /api/role 100 iterations、量 mean response latency ==="
TOTAL=0
ITERATIONS=100
for i in $(seq 1 $ITERATIONS); do
  T=$(curl -sS -o /dev/null -w "%{time_total}" -X POST "http://127.0.0.1:11080/api/role" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"code\":\"ROLE_CV12_A_$i\",\"name\":\"12A_$i\",\"description\":\"\",\"status\":\"enabled\"}")
  TOTAL=$(echo "$TOTAL + $T" | bc -l)
done
MEAN_MS=$(echo "scale=4; $TOTAL / $ITERATIONS * 1000" | bc -l)
printf "Mean POST /api/role latency: %.2fms over %d iterations\n" "$MEAN_MS" "$ITERATIONS"

echo ""
echo "=== Part A cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV12_A_%');
DELETE FROM sys_audit_outbox WHERE audit_event_json->>'request_id' IN (
  SELECT request_id FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV12_A_%')
);
DELETE FROM sys_role WHERE code LIKE 'ROLE_CV12_A_%';
"
```

**Expected (Part A)**：
- Mean latency ≤ **50ms** on dev stack（absolute threshold as surrogate for SC-004 ≤1ms delta；middleware overhead 結構上 ≤1ms via tokio::spawn fire-and-forget pattern、無同步 audit DB 寫入於 response path、總 latency 主要為業務 INSERT + Casbin enforce + JWT decode；50ms threshold 為 dev stack baseline + middleware 不顯著 regress 的 safety margin）。
- 若 mean > 50ms：表示某層阻塞、需 profile（檢 middleware spawn 是否誤改為 await、檢 audit_log::write_outbox_for_http 是否被誤同步呼叫）。

### Part B：Redis stream publish→consume latency（SC-005 直接量測）

```bash
echo "=== Part B: 量測 20 events 的 publish→XREAD-receive 延遲 ==="
LATENCIES=()
for i in $(seq 1 20); do
  # 取現在 stream 最後 id（作為 XREAD 起點）
  LAST_ID=$($PC exec -T redis redis-cli -a "$REDIS_PW" --no-auth-warning XINFO STREAM audit:events 2>/dev/null \
    | grep -A 1 "last-generated-id" | tail -1 | tr -d ' "' || echo "0-0")

  # 記 publish 開始時間（millisecond precision）
  T0=$(date +%s%3N)

  # trigger 1 個 admin write（產 outbox row、drainer 應在 ~100ms 內消化 + XADD）
  curl -fsS -X POST "http://127.0.0.1:11080/api/role" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"code\":\"ROLE_CV12_B_$i\",\"name\":\"12B_$i\",\"description\":\"\",\"status\":\"enabled\"}" > /dev/null

  # XREAD BLOCK 5s wait for next entry
  $PC exec -T redis redis-cli -a "$REDIS_PW" --no-auth-warning XREAD BLOCK 5000 COUNT 1 STREAMS audit:events "$LAST_ID" > /dev/null 2>&1

  # 記收到時間
  T1=$(date +%s%3N)
  LAT=$((T1 - T0))
  LATENCIES+=($LAT)
done

# 排序計算 p50 + p95
SORTED=$(printf "%s\n" "${LATENCIES[@]}" | sort -n)
P50=$(echo "$SORTED" | awk 'NR==10')   # 20 events 取 NR==10 為近 p50
P95=$(echo "$SORTED" | awk 'NR==19')   # 取 NR==19 為近 p95
echo "publish→consume latency over 20 events: p50=${P50}ms, p95=${P95}ms"

echo ""
echo "=== Part B cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "
DELETE FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV12_B_%');
DELETE FROM sys_audit_outbox WHERE audit_event_json->>'request_id' IN (
  SELECT request_id FROM sys_operation_log WHERE entity_id IN (SELECT id::text FROM sys_role WHERE code LIKE 'ROLE_CV12_B_%')
);
DELETE FROM sys_role WHERE code LIKE 'ROLE_CV12_B_%';
"
```

**Expected (Part B)**：
- p50 ≤ **100ms**、p95 ≤ **500ms**（per SC-005 dev stack target）
- 此延遲鏈包含：HTTP request → middleware spawn → outbox INSERT commit → drainer 下次 SELECT 抓 row (sleep_interval=100ms 上界) → XADD Redis；故 p50 預期落在 ~100-200ms 範圍（drainer sleep_interval 主導）
- 若 p50 > 100ms、p95 > 500ms：表 drainer sleep_interval 過長或 SELECT FOR UPDATE SKIP LOCKED 競爭過久；可調 application.yaml `drainer_sleep_interval_ms` 至 50（trade DB load vs latency）

對應 SC-004（Part A surrogate）、SC-005（Part B 直接量測）、FR-007、US2 AS-1。

**Failure handling**：
- Part A failed：profile rust-api log、檢 middleware 是否誤改為 await `write_outbox_for_http`（應為 tokio::spawn）
- Part B failed：檢 drainer log 是否 batch 處理時間過長、檢 sleep_interval_ms config、檢 Redis 連線是否健康（XADD 是否 timeout）

---

## Summary table

| C-V | Goal | 對應 FR / SC |
|---|---|---|
| C-V1 | rust-api build clean | sanity |
| C-V2 | sys_audit_outbox migration up/down + sys_operation_log 0 改動 | SC-009 |
| C-V3 | POST /api/role → 1 秒內 sys_operation_log 2 row（INTERNAL + HTTP） | SC-001、FR-001、US1 AS-1 |
| C-V4 | 跨 router OperationLogLayer 全掛（8 endpoint 抽樣） | SC-008、FR-003 |
| C-V5 | Drainer 消化既有 outbox row、published_at 標 | SC-001、FR-002 |
| C-V6 | Redis stream audit:events XLEN > 0 + JSON 結構 | FR-005、US2 AS-1 |
| C-V7 | multi-replica drainer 不重複處理 | SC-003、FR-010、US1 AS-4 |
| C-V8 | Redis 暫停 retry + 恢復消化 | SC-002、FR-002、FR-011、US1 AS-2/3 |
| C-V9 | URL → entity_type 規則抽樣（含 systemManage alias） | SC-008、FR-004 |
| C-V10 | 三邊 scope（base-web 0、rust-api ~11 files、outer SHA pin + spec md） | SC-009、FR-012 |
| C-V11 | R2 失敗登入自動結案 + INTEGRATION-CHECKLIST cleanup | SC-007、SC-010、FR-013、US3 AS-1 |
| C-V12 | Latency benchmark Part A mount overhead + Part B publish→consume | SC-004、SC-005、FR-007 |

C-V1 ~ C-V12 全 PASS = acceptance PASS、ready for 兩段式 commit（rust-api 第一段 + outer 第二段、per CLAUDE.md §4.1）。
