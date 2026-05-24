# Verification Commands — 045 facade-atomicity-pass

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

12 個 C-V contract = 本 feature 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-009）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 12 service**（5 既有 + 7 observability healthy、per 044 baseline）。psql 經 `docker compose exec -T postgres`；rust-api 經 front-nginx `:11080`；prometheus `:13090`。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

---

## C-V1：12 service healthy + 7 prometheus targets UP

對應 SC-001（接 044 baseline 不退化）。

```bash
echo "=== 12 service health ==="
$PC ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== prometheus targets UP ==="
curl -fsS "http://127.0.0.1:13090/api/v1/targets" | \
  python3 -c "import sys, json; data = json.load(sys.stdin); active = data['data']['activeTargets']; print(f'total={len(active)}'); [print(f\"  {t['labels'].get('job','?')}: {t['health']}\") for t in active]"
```

**Expected**：12 service `Up (healthy)`（044 baseline；redis_exporter / nginx-exporter "Up" without healthcheck by design）；prometheus targets ≥7 全 `up`。

---

## C-V2：F3-N1 facade upsert_with_audit 新 API + sync_endpoints 改走 facade

對應 SC-002 / SC-003、FR-001/003。

```bash
echo "=== facade 含 upsert_with_audit + batch_soft_delete_with_audit ==="
grep -E "pub async fn upsert_with_audit|pub async fn batch_soft_delete_with_audit" \
  rust-api/server/model/src/admin/facade/sys_endpoint.rs

echo ""
echo "=== service sys_endpoint_service.rs 不再含 internal upsert_endpoint_with_audit ==="
grep -cE "fn upsert_endpoint_with_audit" rust-api/server/service/src/admin/sys_endpoint_service.rs
echo "  (expect 0)"

echo ""
echo "=== service 不再有 fully-qualified Sea-ORM INSERT/UPDATE call for sys_endpoint ==="
grep -cE "sys_endpoint::Entity::insert|sys_endpoint::ActiveModel::insert|_entity::ActiveModel::insert" \
  rust-api/server/service/src/admin/sys_endpoint_service.rs
echo "  (expect 0)"

echo ""
echo "=== sync_endpoints 跑後 endpoint audit row 數 ≥ rust-api 註冊 endpoint 數 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_operation_log WHERE module_name='sys_endpoint' AND operation IN ('INSERT','UPDATE');"
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_endpoint WHERE deleted_at IS NULL;"
echo "  (audit count >= endpoint count)"
```

**Expected**：
- facade 含 2 個新 fn（upsert + batch_soft_delete）
- service 內 `upsert_endpoint_with_audit` 0 hit（已搬到 facade）
- service 內 fully-qualified Sea-ORM INSERT 0 hit
- audit count ≥ endpoint count

---

## C-V3：F3-N1 既有 facade API 不退化（regression）

對應 SC-003、FR-001/003。

```bash
echo "=== facade 既有 API surface ==="
grep -E "pub (async )?fn (find_active|find_with_deleted|soft_delete_by_id|restore_by_id)" \
  rust-api/server/model/src/admin/facade/sys_endpoint.rs

echo ""
echo "=== 觸發 sync_endpoints reload（restart rust-api）+ 看 endpoint 數穩定 ==="
$PC restart rust-api && sleep 8
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_endpoint WHERE deleted_at IS NULL;"
echo "  (數量應穩定、與改前對齊)"
```

**Expected**：4 個既有 API 都在 facade；restart 後 endpoint 數穩定（不誤刪 / 不重複建）。

---

## C-V4：F3-N2 redis pub-sub channel `api_key:invalidate` 收 publish 訊號

對應 SC-005、FR-004。

```bash
echo "=== 開 redis-cli SUBSCRIBE 在 background 監聽 channel（5 秒）==="
timeout 5 $PC exec -T redis redis-cli -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning SUBSCRIBE api_key:invalidate &
SUBSCRIBE_PID=$!
sleep 1  # 給 SUBSCRIBE 起來時間

echo ""
echo "=== 觸發 1 個 DELETE access_key ==="
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
# 拿一個現存 access_key display_id
AK_DISPLAY_ID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT display_id FROM sys_access_key WHERE deleted_at IS NULL LIMIT 1;" | tr -d '[:space:]')
curl -fsS -X DELETE "http://127.0.0.1:11080/api/access-key/$AK_DISPLAY_ID" -H "Authorization: Bearer $TOKEN" > /dev/null

wait $SUBSCRIBE_PID
echo "  (expect: 看到 'message api_key:invalidate 1' 在 output)"
```

**Expected**：redis-cli SUBSCRIBE output 含 `1) "message"` + `2) "api_key:invalidate"` + `3) "1"` (payload)。

---

## C-V5：F3-N2 DELETE access_key 後 in-memory invalidated < 500ms

對應 SC-004、FR-004/005/006/007。

> **post-047 PASS（2026-05-25）**：045 acceptance 階段本 C-V5 blocked-by-045-N1 — sandbox `/sandbox/simple-api-key` 對任何非空 `x-api-key` header 都回 200、無法端到端驗 in-memory invalidation。047 sandbox-protect-route-fix 結案 045-N1（middleware 兩 error 分支 HTTP 200 → 401 + WWW-Authenticate header + body envelope 保留），本 C-V5 line 147 `[ "$POST" = "401" ]` 條件現可正常驗證；045 F3-N2 redis pub-sub + clear/reload 機制本身 045 階段已經 C-V4 / C-V6 + subscriber log + DB `deleted_at` 三方證實正常，047 後本 C-V5 即可在 dev stack 端到端跑通。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 1. create a fresh access_key (避免影響其他 test)
RESP=$(curl -fsS -X POST "http://127.0.0.1:11080/api/access-key" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"domain":"dev","description":"045-cv5-test","status":"1"}')
AK_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
AK_KEY=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessKeyId'])")

# 2. 測 key 仍有效（用 sandbox/simple-api-key endpoint）
PRE=$(curl -fsS -o /dev/null -w "%{http_code}" -H "x-api-key: $AK_KEY" "http://127.0.0.1:11080/api/sandbox/simple-api-key")
echo "before delete: HTTP $PRE (expect 200)"

# 3. DELETE access_key
START=$(date +%s%3N)
curl -fsS -X DELETE "http://127.0.0.1:11080/api/access-key/$AK_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
END=$(date +%s%3N)
DELETE_LATENCY=$((END - START))
echo "DELETE latency: ${DELETE_LATENCY}ms"

# 4. 立刻試 key → 應 401（in-memory state synced via redis pub-sub）
POST=$(curl -fsS -o /dev/null -w "%{http_code}" -H "x-api-key: $AK_KEY" "http://127.0.0.1:11080/api/sandbox/simple-api-key")
END2=$(date +%s%3N)
TOTAL_LATENCY=$((END2 - START))
echo "after delete (total ${TOTAL_LATENCY}ms): HTTP $POST (expect 401)"

if [ "$POST" = "401" ] && [ "$TOTAL_LATENCY" -lt 500 ]; then
  echo "PASS: SC-004 < 500ms"
else
  echo "FAIL: SC-004 — POST=$POST, total=${TOTAL_LATENCY}ms"
fi
```

**Expected**：DELETE 後 5xx-free + total elapsed < 500ms + retry sandbox 回 401。

---

## C-V6：F3-N2 `api_key_invalidate_total` + `api_key_reload_total` counter +1

對應 SC-005、FR-010。

```bash
echo "=== baseline /metrics ==="
$PC exec -T prometheus wget -qO- http://rust-api:11081/metrics | grep -E "^(api_key_invalidate_total|api_key_reload_total)( |$)"
BASELINE_INV=$($PC exec -T prometheus wget -qO- http://rust-api:11081/metrics | grep -E "^api_key_invalidate_total " | awk '{print $NF}')
BASELINE_REL=$($PC exec -T prometheus wget -qO- http://rust-api:11081/metrics | grep -E "^api_key_reload_total " | awk '{print $NF}')
echo "baseline: invalidate=${BASELINE_INV:-0} reload=${BASELINE_REL:-0}"

echo ""
echo "=== trigger 1 DELETE access_key ==="
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
RESP=$(curl -fsS -X POST "http://127.0.0.1:11080/api/access-key" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"domain":"dev","description":"045-cv6-test","status":"1"}')
AK_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
curl -fsS -X DELETE "http://127.0.0.1:11080/api/access-key/$AK_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
sleep 2

echo ""
echo "=== after /metrics ==="
AFTER_INV=$($PC exec -T prometheus wget -qO- http://rust-api:11081/metrics | grep -E "^api_key_invalidate_total " | awk '{print $NF}')
AFTER_REL=$($PC exec -T prometheus wget -qO- http://rust-api:11081/metrics | grep -E "^api_key_reload_total " | awk '{print $NF}')
echo "after:    invalidate=${AFTER_INV:-0} reload=${AFTER_REL:-0}"
echo "delta:    invalidate=$((${AFTER_INV:-0} - ${BASELINE_INV:-0})) reload=$((${AFTER_REL:-0} - ${BASELINE_REL:-0}))"
echo "  (expect each +1)"
```

**Expected**：兩 counter 各 +1。

---

## C-V7：F3-N3 batch_soft_delete_with_audit 介面就位 + service 改走

對應 SC-002、FR-002/003。

```bash
echo "=== facade 含 BatchDeletePolicy enum + BatchDeleteResult struct ==="
grep -nE "enum BatchDeletePolicy|struct BatchDeleteResult|FailFast|LogAndContinue" \
  rust-api/server/model/src/admin/facade/sys_endpoint.rs

echo ""
echo "=== service batch_remove_endpoints 改走 facade ==="
grep -nA 6 "fn batch_remove_endpoints" rust-api/server/service/src/admin/sys_endpoint_service.rs | head -15

echo ""
echo "=== endpoint_sync warn log 形狀（若有 row 需移除）==="
$PC logs --tail=200 rust-api 2>/dev/null | grep -E "target.*endpoint_sync" | head -5
echo "  (沒 row 需移除時 0 hit、有的話看到 JSON line with id + error fields)"
```

**Expected**：enum + struct 都在 facade；service fn 改走 facade；若 endpoint_sync 有 row 移除則 warn log 形狀對齊。

---

## C-V8：035-N1 systemManage addUser valid path — atomic commit

對應 SC-007、FR-008/009。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 1. 拿一個 valid role display_id（如 R_SUPER）
ROLE_DID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT display_id FROM sys_role WHERE code='ROLE_SUPER' LIMIT 1;" | tr -d '[:space:]')

# 2. POST systemManage addUser with valid user_roles
START=$(date +%s%3N)
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"userName\":\"cv8user\",\"nickName\":\"cv8\",\"password\":\"test1234\",\"status\":\"1\",\"userRoles\":[\"ROLE_SUPER\"]}"
sleep 2

# 3. 查 user + sys_user_role + INTERNAL audit
USER_ROW=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT id, created_at FROM sys_user WHERE username='cv8user' AND deleted_at IS NULL;")
echo "user row: $USER_ROW"
USER_ID=$(echo "$USER_ROW" | cut -d'|' -f1)

USER_ROLE_COUNT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_user_role WHERE user_id='$USER_ID';")
echo "sys_user_role count: $USER_ROLE_COUNT (expect ≥1)"

AUDIT_COUNT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_operation_log WHERE module_name IN ('sys_user','sys_user_role') AND method='INTERNAL' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '30 seconds';")
echo "INTERNAL audit count (sys_user + sys_user_role, last 30s): $AUDIT_COUNT (expect ≥2)"

# 4. 查 audit 兩 row created_at 差 < 50ms（同 outer txn 同 commit）
AUDIT_SPAN_MS=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000 FROM sys_operation_log WHERE module_name IN ('sys_user','sys_user_role') AND method='INTERNAL' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '30 seconds';")
echo "audit span ms: $AUDIT_SPAN_MS (expect < 50)"

# cleanup
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_user_role WHERE user_id='$USER_ID'; DELETE FROM sys_user WHERE username='cv8user';" > /dev/null
```

**Expected**：user 存在、user_role 1+ row、INTERNAL audit ≥2 row、span < 50ms。

---

## C-V9：035-N1 systemManage addUser invalid path — rollback、user 不殘留

對應 SC-006、FR-008/009。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 1. POST with invalid user_roles (display_id 不存在、e.g. 999999999)
RESP=$(curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"userName":"cv9user","nickName":"cv9","password":"test1234","status":"1","userRoles":["BOGUS_ROLE_NO_EXIST"]}' 2>&1 || echo "(expected error)")
echo "response: $(echo $RESP | head -c 200)"
sleep 2

# 2. 驗 user row 0
USER_COUNT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_user WHERE username='cv9user';")
echo "sys_user count: $USER_COUNT (expect 0)"

# 3. 驗 INTERNAL audit 0 row（HTTP audit row 1 by 042 不算）
INTERNAL_AUDIT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_operation_log WHERE method='INTERNAL' AND module_name='sys_user' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds';")
echo "INTERNAL audit for sys_user (last 10s): $INTERNAL_AUDIT (expect 0)"

# 4. 驗 HTTP audit row 1（per 042 design、outcome-agnostic）
HTTP_AUDIT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_operation_log WHERE method='POST' AND url LIKE '%addUser%' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds';")
echo "HTTP audit for /addUser (last 10s): $HTTP_AUDIT (expect ≥1, per 042)"
```

**Expected**：user 0、INTERNAL audit 0、HTTP audit 1（confirms 042 outcome-agnostic design + 045 outer-txn rollback 同時生效）。

---

## C-V10：035-N1 update_user happy + negative

對應 SC-006/007、FR-008/009。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 1. happy: 拿現存 user + valid role display_id、PUT update
USER_DID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT display_id FROM sys_user WHERE username='GeneralUser' LIMIT 1;" | tr -d '[:space:]')
ROLE_DID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT display_id FROM sys_role WHERE code='ROLE_SUPER' LIMIT 1;" | tr -d '[:space:]')

curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/updateUser" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"id\":$USER_DID,\"nickName\":\"cv10-update\",\"status\":\"1\",\"userRoles\":[\"ROLE_SUPER\"]}" > /dev/null
sleep 1
HAPPY_USER=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT nick_name FROM sys_user WHERE display_id=$USER_DID;")
echo "happy update: nick_name = $HAPPY_USER (expect 'cv10-update')"

# 2. negative: PUT with invalid role
RESP=$(curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/updateUser" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"id\":$USER_DID,\"nickName\":\"cv10-negative\",\"status\":\"1\",\"userRoles\":[\"BOGUS_ROLE_NO_EXIST\"]}" 2>&1 || echo "(expected error)")
sleep 1
NEGATIVE_USER=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT nick_name FROM sys_user WHERE display_id=$USER_DID;")
echo "after negative: nick_name = $NEGATIVE_USER (expect remain 'cv10-update'、未被改、negative rollback)"
```

**Expected**：happy update 生效 + negative path 留 happy 結果（negative rollback、未被 partial update）。

---

## C-V11：FR-012/013 boundary verify（0 base-web + 0 schema migration + 0 新 entity）

對應 SC-008、FR-012/013。

```bash
echo "=== FR-012: 0 base-web 改動 ==="
git diff --stat base-web/ 2>&1 | head
cd base-web && git status --short && git log --oneline -3 rev1-admin-base-web 2>&1 | head -3
cd ..

echo ""
echo "=== FR-013: 0 新 schema migration（045 不該加 m2026...） ==="
find rust-api/migration/src -name "*.rs" -newer specs/045-facade-atomicity-pass/spec.md 2>/dev/null
echo "  (expect 0 file)"

echo ""
echo "=== FR-013: 0 新 entity（045 不該加 entities/sys_*.rs） ==="
find rust-api/server/model/src/admin/entities -name "sys_*.rs" -newer specs/045-facade-atomicity-pass/spec.md 2>/dev/null
echo "  (expect 0 file)"
```

**Expected**：base-web 0 diff、0 新 migration、0 新 entity。

---

## C-V12：INTEGRATION-CHECKLIST cleanup

對應 SC-009、FR-014。

```bash
echo "=== 4 衍生 follow-up row 已移除 ==="
for row in "F3-N1" "F3-N2" "F3-N3" "035-N1"; do
    if grep -qE "^\| $row " docs/INTEGRATION-CHECKLIST.md; then
        echo "FAIL: $row row 殘留"
    else
        echo "PASS: $row row 已移除"
    fi
done

echo ""
echo "=== 045 entry 在已完成里程碑 ==="
grep -c "045 facade-atomicity-pass" docs/INTEGRATION-CHECKLIST.md
echo "  (expect ≥1)"
```

**Expected**：4 row 全移、045 entry ≥1 hit。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | 12 service healthy + 7 prom targets up（接 044 baseline） | SC-001 | infra regression |
| C-V2 | F3-N1 facade upsert + service refactor | SC-002 / SC-003、FR-001/003 | US1 |
| C-V3 | F3-N1 既有 facade API 不退化 | SC-003、FR-001/003 | US1 regression |
| C-V4 | F3-N2 redis pub-sub publish signal | SC-005、FR-004 | US2 |
| C-V5 | F3-N2 DELETE → in-memory invalidated < 500ms | SC-004、FR-004/005/006/007 | US2 MVP |
| C-V6 | F3-N2 api_key_{invalidate,reload}_total +1 | SC-005、FR-010 | US2 |
| C-V7 | F3-N3 batch facade + service refactor | SC-002、FR-002/003 | US3 |
| C-V8 | 035-N1 addUser valid → atomic commit | SC-007、FR-008/009 | US4 happy |
| C-V9 | 035-N1 addUser invalid → rollback | SC-006、FR-008/009 | US4 negative |
| C-V10 | 035-N1 updateUser happy + negative | SC-006/007、FR-008/009 | US4 |
| C-V11 | FR-012/013 boundary（0 base-web/migration/entity） | SC-008 | scope discipline |
| C-V12 | INTEGRATION-CHECKLIST cleanup（4 row 移除 + 045 entry） | SC-009、FR-014 | docs |

C-V1~C-V12 全 PASS = acceptance PASS、ready for outer + worktree 多段 commit + merge。
