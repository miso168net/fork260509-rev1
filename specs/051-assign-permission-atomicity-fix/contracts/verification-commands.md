# Verification Commands — 051 assign-permission-atomicity-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

7 個 C-V contract = 本 sprint 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-009）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 13 service**（per 050 baseline）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
```

---

## C-V1：dev stack 13 service healthy + rust-api drainer 跑著（baseline）

對應 SC-001（接 050 baseline、不退化）。

```bash
echo "=== 13 service health ==="
$PCO ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer / outbox 跑著 ==="
$PCO logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox|casbin" | head -5

echo ""
echo "=== rust-api worktree HEAD = post-051 commit ==="
cd rust-api && git log --oneline -1 && cd ..
```

**Expected**：13 service `Up`（既有 12 obs + rust-api healthy、含 pushgateway 從 050 落地）；rust-api log 含 drainer/outbox/casbin 訊息；rust-api worktree HEAD 為本 sprint 落地的新 commit。

---

## C-V2：happy path — assign_permission 寫 casbin_rule + audit 同 txn

對應 SC-002、FR-001。

**前置**：rust-api image rebuild + restart（含 051 改動）；準備測試 role + endpoint clean state。

```bash
# 拿 Soybean token
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Soybean","password":"123456"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

# 建測試 role
ROLE_RESP=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/addRole" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleName":"CV2_ATOMICITY","roleCode":"R_CV2_AT","roleDesc":"051 C-V2 test","status":"1"}')
ROLE_DISPLAY_ID=$(echo "$ROLE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['displayId'])")
echo "Role created: display_id=$ROLE_DISPLAY_ID"

# 取 3 個 endpoint id
ENDPOINTS=$(curl -s -X GET "http://127.0.0.1:11080/api/systemManage/getAllEndpoints" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join([str(e['id']) for e in d['data'][:3]]))")
echo "Endpoints: $ENDPOINTS"

# === BEFORE: casbin_rule + sys_operation_log baseline ===
echo "--- casbin_rule (role baseline) ---"
docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c \
  "SELECT count(*) FROM casbin_rule WHERE ptype='p' AND v0='R_CV2_AT';"
# expect: 0

# === Run assign_permission ===
ENDPOINTS_JSON=$(echo "$ENDPOINTS" | python3 -c "import sys; print(','.join([f'\"{x}\"' for x in sys.stdin.read().strip().split()]))")
curl -s -X POST "http://127.0.0.1:11080/api/systemManage/assignRoleEndpoints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"roleId\":\"$ROLE_DISPLAY_ID\",\"domain\":\"built-in\",\"endpointIds\":[$ENDPOINTS_JSON]}" \
  | python3 -m json.tool | head -5

# === AFTER: casbin_rule + audit ===
echo "--- casbin_rule AFTER (expect 3 rows) ---"
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT id, ptype, v0, v1, v2, v3 FROM casbin_rule WHERE ptype='p' AND v0='R_CV2_AT';"

echo "--- sys_operation_log AFTER (expect 1 audit row、payload_after.endpointIds 含 3 id) ---"
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT payload_after FROM sys_operation_log WHERE entity_type='sys_role' AND payload_after::text LIKE '%endpointIds%R_CV2_AT%' OR payload_after::text LIKE '%${ROLE_DISPLAY_ID}%' ORDER BY created_at DESC LIMIT 1;"
# 簡化: 查最近的 sys_role audit row
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c \
  "SELECT operation, entity_id, payload_after FROM sys_operation_log WHERE entity_type='sys_role' AND created_at > NOW() - INTERVAL '1 minute' ORDER BY created_at DESC LIMIT 1;"

# Cleanup
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c \
  "DELETE FROM casbin_rule WHERE v0='R_CV2_AT'; DELETE FROM sys_role WHERE code='R_CV2_AT';"
```

**Expected**：casbin_rule 從 0 row → 3 row（ptype='p' / v0='R_CV2_AT' / v1='built-in' / v2/v3 為 endpoint path/method）；sys_operation_log 新增 1 audit row（entity_type='sys_role'、payload_after 含 endpointIds 3 ids、operation='UPDATE'）；round-trip < 500ms。

---

## C-V3 ⭐：atomicity 反證 — audit 失敗 → casbin_rule 也 rollback

對應 SC-003、FR-006（**本 sprint 最關鍵 acceptance**）。

**前置**：暫改 `rust-api/server/model/src/admin/audit_log.rs::write_in_txn` 開頭加 1 行強制回 Err、docker rebuild、restart（per [research R-4](../research.md) Option A）。

```bash
# === Step 1: fault injection — 暫改 audit_log.rs::write_in_txn ===
# 在 fn 開頭加: return Err(AppError { code: 500, message: "C-V3 fault injection".to_string() });
# (手動 edit、不 commit、不 push)

# === Step 2: docker rebuild rust-api ===
docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3
$PCO up -d --force-recreate --no-deps rust-api
# wait healthy
until $PCO ps --format "{{.Service}}: {{.Status}}" | grep -q "rust-api.*(healthy)"; do sleep 3; done

# === Step 3: snapshot baseline ===
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login -H "Content-Type: application/json" -d '{"userName":"Soybean","password":"123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")
ROLE_DISPLAY_ID=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/addRole" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"roleName":"CV3_FAULT","roleCode":"R_CV3_AT","roleDesc":"051 C-V3 test","status":"1"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['displayId'])")
# Note: addRole 也走 audit、注入 fault 後可能失敗 → role create 可能也 5xx
# 改用 psql 直接插入 test role 避開 addRole 路徑
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c \
  "INSERT INTO sys_role (id, display_id, code, name, description, pid, status, created_at, created_by) VALUES ('test_cv3_role_id', 999999003, 'R_CV3_AT', 'CV3_FAULT', '051 C-V3', '0', 'enabled', NOW(), '1');"

# casbin_rule baseline count
CASBIN_BEFORE=$(docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c "SELECT count(*) FROM casbin_rule;")
OPLOG_BEFORE=$(docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c "SELECT count(*) FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '5 minutes';")
echo "Baseline casbin_rule count: $CASBIN_BEFORE"
echo "Baseline sys_operation_log (5min) count: $OPLOG_BEFORE"

# === Step 4: 跑 assign_permission with fault injection ===
ENDPOINTS=$(curl -s -X GET "http://127.0.0.1:11080/api/systemManage/getAllEndpoints" -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join([f'\"{e[\"id\"]}\"' for e in d['data'][:3]]))")
RESPONSE=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/assignRoleEndpoints" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"roleId\":\"999999003\",\"domain\":\"built-in\",\"endpointIds\":[$ENDPOINTS]}")
echo "Response (expect code != 0): $RESPONSE"

# === Step 5: verify NO mutation ===
CASBIN_AFTER=$(docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c "SELECT count(*) FROM casbin_rule;")
OPLOG_AFTER=$(docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c "SELECT count(*) FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '5 minutes';")
echo "AFTER casbin_rule count: $CASBIN_AFTER (expect = $CASBIN_BEFORE)"
echo "AFTER sys_operation_log (5min) count: $OPLOG_AFTER (expect = $OPLOG_BEFORE)"

# atomicity rollback verification
[ "$CASBIN_AFTER" = "$CASBIN_BEFORE" ] && echo "✅ casbin_rule rollback PASS" || echo "❌ casbin_rule changed!"
[ "$OPLOG_AFTER" = "$OPLOG_BEFORE" ] && echo "✅ sys_operation_log rollback PASS" || echo "❌ audit row leaked!"

# === Step 6: cleanup test role ===
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c \
  "DELETE FROM sys_role WHERE code='R_CV3_AT';"

# === Step 7: REVERT audit_log.rs fault injection ===
# 手動 revert 那行 return Err、git diff 應為 0
# 再 docker rebuild + restart
docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3
$PCO up -d --force-recreate --no-deps rust-api
until $PCO ps --format "{{.Service}}: {{.Status}}" | grep -q "rust-api.*(healthy)"; do sleep 3; done

# === Step 8: confirm happy path 仍 PASS (re-run C-V2 simplified) ===
echo "happy path regression after revert:"
# 跑一次 C-V2 簡化版確認沒留 fault injection 殘渣
```

**Expected**：
- response code != 0（5xx 或 audit 失敗訊息）
- `casbin_rule` count AFTER == BEFORE（rollback 完整）
- `sys_operation_log` (last 5 min) count AFTER == BEFORE（audit 0 新 row）
- revert + rebuild + restart 後 happy path C-V2 仍 PASS

---

## C-V4：W-F11 pub-sub reload — Casbin enforce 收 new policy

對應 SC-004、FR-007。

**前置**：C-V2 happy path 已落地新 policy。

```bash
# === verify Casbin enforce reload via W-F11 ===
echo "=== rust-api log: Casbin policy reload events (last 1 min) ==="
$PCO logs --since 1m rust-api 2>/dev/null | grep -iE "casbin.*(reload|policy|sync)" | head -5

# === 試命中新 policy ===
# 建立測試 user + assign role + curl enforce 路徑
# 簡化: 用既有 GeneralUser 試命中 endpoint (應該 deny per Casbin)
# 改: 用 Soybean role 已有 endpoint 試命中 (應該 allow per Casbin)
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login -H "Content-Type: application/json" -d '{"userName":"Soybean","password":"123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X GET "http://127.0.0.1:11080/api/systemManage/getMenuList/v2" -H "Authorization: Bearer $TOKEN"
# expect: 200 (既有 policy enforcing 正常)
```

**Expected**：rust-api log 顯示 Casbin policy reload / sync 訊息（W-F11 subscriber 收 pub-sub）；既有 endpoint enforcement 仍 200（不退化）。

---

## C-V5：GeneralUser deny regression（W-FW8 既有 acceptance）

對應 SC-005、FR-001 enforce 不變。

```bash
GENERAL_TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"GeneralUser","password":"123456"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('token','NO_TOKEN'))")

# GeneralUser 試 POST /systemManage/assignRoleEndpoints
DENY_RESP=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/assignRoleEndpoints" \
  -H "Authorization: Bearer $GENERAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleId":"123","domain":"built-in","endpointIds":[]}')
echo "Deny response: $DENY_RESP"

# expect: code != 0 (Casbin 拒絕)
echo "$DENY_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('✅ DENY PASS' if d.get('code', 0) != 0 else '❌ ALLOWED!')"
```

**Expected**：GeneralUser 被 Casbin enforcement 拒絕、code != 0（deny path 既有 W-FW8 behavior 不變）。

---

## C-V6：clear-all E-4（既有 spec）

對應 SC-006、FR-004 audit shape。

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login -H "Content-Type: application/json" -d '{"userName":"Soybean","password":"123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

# 建測試 role + 先 assign 2 endpoint
ROLE_DISPLAY_ID=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/addRole" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"roleName":"CV6_CLEAR","roleCode":"R_CV6_CL","roleDesc":"051 C-V6 clear-all","status":"1"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['displayId'])")
ENDPOINTS=$(curl -s -X GET "http://127.0.0.1:11080/api/systemManage/getAllEndpoints" -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join([f'\"{e[\"id\"]}\"' for e in d['data'][:2]]))")
curl -s -X POST "http://127.0.0.1:11080/api/systemManage/assignRoleEndpoints" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"roleId\":\"$ROLE_DISPLAY_ID\",\"domain\":\"built-in\",\"endpointIds\":[$ENDPOINTS]}" > /dev/null
docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c "SELECT count(*) FROM casbin_rule WHERE v0='R_CV6_CL';"
# expect: 2

# Now clear-all: send endpointIds=[]
curl -s -X POST "http://127.0.0.1:11080/api/systemManage/assignRoleEndpoints" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"roleId\":\"$ROLE_DISPLAY_ID\",\"domain\":\"built-in\",\"endpointIds\":[]}" | python3 -m json.tool | head -3

# verify casbin_rule 0 row + audit payload_after.endpointIds=[]
docker compose exec postgres psql -U soybean -d soybean_admin_rust -tA -c "SELECT count(*) FROM casbin_rule WHERE v0='R_CV6_CL';"
# expect: 0
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "SELECT payload_after FROM sys_operation_log WHERE entity_type='sys_role' AND payload_after::text LIKE '%R_CV6_CL%' OR payload_after::text LIKE '%$ROLE_DISPLAY_ID%' ORDER BY created_at DESC LIMIT 1;"

# cleanup
docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='R_CV6_CL';"
```

**Expected**：assign 2 endpoint → casbin_rule 2 row → clear-all 後 0 row + audit row 紀錄 payload_after `endpointIds:[]`。

---

## C-V7：scope discipline boundary verify

對應 SC-007、FR-008 boundary。

```bash
echo "=== sync_role_permissions 應已刪 ==="
grep -rn "fn sync_role_permissions\b" rust-api/server/ 2>&1 | head -5
# expect: 0 hit

echo ""
echo "=== assign_permission signature 應 4 params (drop enforcer) ==="
grep -A 8 "fn assign_permission" rust-api/server/service/src/admin/sys_authorization_service.rs | head -20
# expect: 看 trait + impl 都是 domain / role_id / permissions / actor 4 params + &self

echo ""
echo "=== 0 schema migration ==="
cd rust-api && git diff --name-only origin/rev1-admin-rust-api~1 HEAD -- migration/ 2>&1 | head -5 && cd ..
# expect: empty

echo ""
echo "=== 0 base-web 改動 ==="
cd base-web && git log --oneline -3 && cd ..
# expect: HEAD 仍為 64af823b (050 落地後 baseline、未動)

echo ""
echo "=== 0 Constitution amendment ==="
git diff origin/rev1-admin-root..HEAD .specify/memory/constitution.md 2>&1 | wc -l
# expect: 0

echo ""
echo "=== 0 新 workspace cargo dep ==="
cd rust-api && git diff origin/rev1-admin-rust-api~1 HEAD -- Cargo.toml 2>&1 | head -5 && cd ..
# expect: empty (only server/service/Cargo.toml or sub-crate Cargo.toml allowed if any)
```

**Expected**：所有 boundary 規則 PASS — sync_role_permissions deleted (0 hit)、enforcer param dropped (4 params signature)、0 migration、0 base-web 改動、0 Constitution amendment、0 新 workspace cargo dep。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 13 service healthy + drainer | SC-001 | infra baseline |
| C-V2 | happy path: casbin_rule 寫 + audit 同 txn | SC-002、FR-001/004 | impl gate |
| **C-V3** ⭐ | atomicity 反證 (audit 失敗 → casbin_rule rollback) | SC-003、FR-006 | impl gate（**本 sprint 最關鍵**）|
| C-V4 | W-F11 pub-sub Casbin enforce reload | SC-004、FR-007 | infra impl gate |
| C-V5 | GeneralUser deny regression | SC-005、FR-001 | regression |
| C-V6 | clear-all E-4 既有 spec | SC-006、FR-004 | regression |
| C-V7 | boundary verify (scope discipline) | SC-007、FR-008 | scope discipline |

C-V1~C-V7 全 PASS = acceptance PASS、ready for outer + worktree commit + push + merge + backfill。
