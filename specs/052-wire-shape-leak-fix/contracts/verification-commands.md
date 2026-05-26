# Verification Commands — 052 wire-shape-leak-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-26

7 個 C-V contract = 本 sprint 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-009）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 13 service**（per 051 baseline）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
```

---

## C-V1：dev stack 13 service healthy + rust-api drainer 跑著（baseline）

對應 SC-001（接 051 baseline、不退化）。

```bash
echo "=== 13 service health ==="
$PCO ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer / outbox 跑著 ==="
$PCO logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox|casbin" | head -5

echo ""
echo "=== rust-api worktree HEAD = post-052 commit ==="
cd rust-api && git log --oneline -1 && cd ..
```

**Expected**：13 service `Up`（既有 12 obs + rust-api healthy、含 pushgateway 從 050 落地）；rust-api log 含 drainer/outbox/casbin 訊息；rust-api worktree HEAD 為本 sprint 落地的新 commit。

---

## C-V2：(a) GET /org wire shape

對應 SC-002、FR-001 / FR-005。

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Soybean","password":"123456"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")
echo "token len: ${#TOKEN}"

echo ""
echo "=== curl GET /org?current=1&size=10 ==="
START=$(date +%s%3N)
RESPONSE=$(curl -s -X GET "http://127.0.0.1:11080/api/org?current=1&size=10" \
  -H "Authorization: Bearer $TOKEN")
END=$(date +%s%3N)
echo "Elapsed: $((END - START)) ms"
echo "$RESPONSE" | python3 -m json.tool | head -40

echo ""
echo "=== shape inspect: data.records[0] ==="
echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
records = d.get('data', {}).get('records', [])
if not records:
    print('NO RECORDS (org table may be empty)')
    sys.exit(0)
r0 = records[0]
print(f'id type: {type(r0[\"id\"]).__name__} value: {r0[\"id\"]}')
assert isinstance(r0['id'], int), 'FAIL: id should be int (i64)'
assert 'deletedAt' not in r0, 'FAIL: deletedAt should not be in wire'
print('expected keys: id, pid, code, name, description, status, createdAt, createdBy, updatedAt, updatedBy')
print(f'actual keys:   {sorted(r0.keys())}')
unexpected = [k for k in r0.keys() if k not in {'id', 'pid', 'code', 'name', 'description', 'status', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'}]
assert not unexpected, f'FAIL: unexpected keys: {unexpected}'
print('✅ shape PASS')
"
```

**Expected**：response 200、`data.records[0].id` typeof int（i64）、無 `deletedAt`、10 欄位嚴格對齊 OrganizationDetail（pid/code/name/description/status/createdAt/createdBy/updatedAt/updatedBy + id）；round-trip < 500ms。

---

## C-V3：(b) POST /systemManage/addRole wire shape

對應 SC-003、FR-002。

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login -H "Content-Type: application/json" -d '{"userName":"Soybean","password":"123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

echo "=== curl POST /systemManage/addRole ==="
RESPONSE=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/addRole" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"roleName":"CV3_R1","roleCode":"R_CV3_R1","roleDesc":"052 C-V3 test","status":"1"}')
echo "$RESPONSE" | python3 -m json.tool | head -20

echo ""
echo "=== shape inspect: data ==="
echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
data = d.get('data', {})
print(f'id type: {type(data[\"id\"]).__name__} value: {data[\"id\"]}')
assert isinstance(data['id'], int), 'FAIL: id should be int'
expected = {'id', 'roleName', 'roleCode', 'roleDesc', 'status', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'}
actual = set(data.keys())
unexpected = actual - expected
missing = expected - actual
assert not unexpected, f'FAIL: unexpected keys: {unexpected}'
print(f'actual keys: {sorted(actual)}')
print('✅ shape PASS (SystemManageRoleOutput aligned)')
"

echo ""
echo "=== cleanup ==="
docker compose exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "DELETE FROM sys_role WHERE code='R_CV3_R1';"
```

**Expected**：response 200、`data.id` typeof int、`data` keys 嚴格符合 SystemManageRoleOutput 9 欄位（id/roleName/roleCode/roleDesc/status/createdAt/createdBy/updatedAt/updatedBy）、無 `pid` / `description` / `homeRouteName` 等 raw Model 欄位。

---

## C-V4：(c) POST /systemManage/updateRole wire shape

對應 SC-004、FR-003。

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login -H "Content-Type: application/json" -d '{"userName":"Soybean","password":"123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

# 先建 test role
ADD_RESP=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/addRole" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"roleName":"CV4_R1","roleCode":"R_CV4_R1","roleDesc":"052 C-V4 test","status":"1"}')
ROLE_DISPLAY_ID=$(echo "$ADD_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
echo "test role display_id: $ROLE_DISPLAY_ID"

echo ""
echo "=== curl POST /systemManage/updateRole ==="
RESPONSE=$(curl -s -X POST "http://127.0.0.1:11080/api/systemManage/updateRole" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"id\":$ROLE_DISPLAY_ID,\"roleName\":\"CV4_R1_EDITED\",\"roleCode\":\"R_CV4_R1\",\"roleDesc\":\"052 C-V4 edited\",\"status\":\"1\"}")
echo "$RESPONSE" | python3 -m json.tool | head -20

echo ""
echo "=== shape inspect (same as C-V3) ==="
echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
data = d.get('data', {})
assert isinstance(data['id'], int)
assert data['id'] == $ROLE_DISPLAY_ID, f'FAIL: id mismatch'
assert data['roleName'] == 'CV4_R1_EDITED', 'FAIL: roleName not updated'
expected = {'id', 'roleName', 'roleCode', 'roleDesc', 'status', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'}
unexpected = set(data.keys()) - expected
assert not unexpected, f'unexpected keys: {unexpected}'
print('✅ shape PASS')
"

echo ""
echo "=== cleanup ==="
docker compose exec -T postgres psql -U soybean -d soybean_admin_rust -c \
  "DELETE FROM sys_role WHERE code='R_CV4_R1';"
```

**Expected**：response 200、shape 同 C-V3、`id` 對應原 role display_id、`roleName` 為 edited 後值。

---

## C-V5：(d) GET /endpoint/page wire shape

對應 SC-005、FR-004 / FR-006。

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login -H "Content-Type: application/json" -d '{"userName":"Soybean","password":"123456"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

echo "=== curl GET /endpoint/page?current=1&size=10 ==="
RESPONSE=$(curl -s -X GET "http://127.0.0.1:11080/api/endpoint/page?current=1&size=10" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESPONSE" | python3 -m json.tool | head -40

echo ""
echo "=== shape inspect: data.records[0] ==="
echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
records = d.get('data', {}).get('records', [])
if not records:
    print('NO RECORDS (endpoint table may be empty)')
    sys.exit(0)
r0 = records[0]
print(f'id type: {type(r0[\"id\"]).__name__} value: {r0[\"id\"]}')
assert isinstance(r0['id'], int), 'FAIL: id should be int'
assert 'deletedAt' not in r0, 'FAIL: deletedAt should not be in wire'
expected = {'id', 'path', 'method', 'action', 'resource', 'controller', 'summary', 'createdAt', 'updatedAt'}
unexpected = set(r0.keys()) - expected
assert not unexpected, f'FAIL: unexpected keys: {unexpected}'
print(f'actual keys: {sorted(r0.keys())}')
print('✅ shape PASS (EndpointDetail aligned, 9 fields, no createdBy/updatedBy)')
"
```

**Expected**：response 200、`data.records[0]` 9 欄位嚴格對齊 EndpointDetail（id/path/method/action/resource/controller/summary/createdAt/updatedAt）、**無** `createdBy` / `updatedBy`（sys_endpoint Model 本身無此 2 欄）、無 `deletedAt`。

---

## C-V6 ⭐：base-web role-list 頁面 CDP browser smoke

對應 SC-006、FR-008（base-web 0 改動 regression、reassurance、防 040 critical bug 重演）。

**前置**：Edge 啟動含 `--remote-debugging-port=9229`；CDP smoke node script per 037/038 既有體例 + memory `reference_cdp_smoke_technique.md`。

```bash
# CDP smoke 腳本（implementer 階段建檔、或 reuse 040/048 既有 cdp-smoke.js scaffold）
# 流程：
# 1. Launch Edge --remote-debugging-port=9229
# 2. Navigate http://127.0.0.1:11080/login
# 3. Fill userName=Soybean / password=123456 → click「确认」
# 4. Wait 1s → Navigate /system-manage/role
# 5. Wait list table loaded
# 6. Click「新增」按鈕（topbar）
# 7. Fill modal: roleName=CV6_R1 / roleCode=R_CV6_R1 / status=enabled
# 8. Click「确认」
# 9. Wait 1s → assert role list table 含 CV6_R1
# 10. Click CV6_R1 row「編輯」按鈕
# 11. Modal 開、改 roleName 為 CV6_R1_EDITED
# 12. Click「确认」
# 13. Wait toast 「修改成功」
# 14. assert list row 反映新 name
# 15. cleanup: psql DELETE WHERE code='R_CV6_R1'
```

**Expected**：CDP smoke 流程 14 步全綠、無 console error、modal 行為正常（base-web 0 binds response shape 但 wire shape 改變後 base-web 仍 OK）。

**Fallback**（若 CDP setup 失敗）：
- 登 follow-up `C-V6-N1`
- acceptance 走 C-V2~C-V5 + C-V7 結案
- 對齊 040 D 體例（CDP smoke defer 後 follow-up 補測）
- 不本 sprint 修 infra（pre-existing issue）

---

## C-V7：scope discipline boundary verify

對應 SC-007、FR-008 boundary。

```bash
echo "=== grep raw Model wire path（expect 0 hit）==="
grep -rn "Res<SysRoleModel>\|Res<PaginatedData<SysOrganizationModel>>\|Res<PaginatedData<SysEndpointModel>>" rust-api/server/api/ 2>&1 | head -10
# expect: 0 hit

echo ""
echo "=== 0 schema migration ==="
cd rust-api && git diff --name-only origin/rev1-admin-rust-api~1 HEAD -- migration/ 2>&1 | head -5 && cd ..
# expect: empty

echo ""
echo "=== 0 base-web 改動 ==="
cd base-web && git log --oneline -1 && cd ..
# expect: HEAD 為 64af823b (051 落地後 baseline、未動)

echo ""
echo "=== 0 Constitution amendment ==="
git diff origin/rev1-admin-root..HEAD .specify/memory/constitution.md 2>&1 | wc -l
# expect: 0

echo ""
echo "=== 0 新 workspace cargo dep ==="
cd rust-api && git diff origin/rev1-admin-rust-api~1 HEAD -- Cargo.toml 2>&1 | head -5 && cd ..
# expect: empty

echo ""
echo "=== 0 audit_log 改動 ==="
cd rust-api && git diff --name-only origin/rev1-admin-rust-api~1 HEAD -- server/model/src/admin/audit_log.rs 2>&1 && cd ..
# expect: empty

echo ""
echo "=== 0 Sea-ORM Model 改動 ==="
cd rust-api && git diff --name-only origin/rev1-admin-rust-api~1 HEAD -- 'server/model/src/admin/entities/*.rs' 2>&1 && cd ..
# expect: empty
```

**Expected**：所有 boundary 規則 PASS — raw Model wire path 0 hit、0 migration、0 base-web 改動、0 Constitution amendment、0 新 workspace cargo dep、0 audit_log 改動、0 Sea-ORM Model 改動。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 13 service healthy + drainer | SC-001 | infra baseline |
| C-V2 | (a) GET /org wire shape | SC-002、FR-001/005 | impl gate |
| C-V3 | (b) POST /systemManage/addRole wire shape | SC-003、FR-002 | impl gate |
| C-V4 | (c) POST /systemManage/updateRole wire shape | SC-004、FR-003 | impl gate |
| C-V5 | (d) GET /endpoint/page wire shape | SC-005、FR-004/006 | impl gate |
| **C-V6** ⭐ | base-web role-list CDP smoke (reassurance) | SC-006、FR-008 | regression |
| C-V7 | boundary verify (scope discipline) | SC-007、FR-008 | scope discipline |

C-V1~C-V7 全 PASS = acceptance PASS、ready for outer + worktree commit + push + merge + backfill。
