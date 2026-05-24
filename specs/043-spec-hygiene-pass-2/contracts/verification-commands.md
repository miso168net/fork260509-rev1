# Verification Commands — 043 spec-hygiene-pass-2

**Phase**：1（Design & Contracts）
**日期**：2026-05-24

5 個 C-V contract = 本 feature 的 acceptance verification scenarios。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack**（5 service healthy）。psql 經 `docker compose exec -T postgres`；endpoint 經 front-nginx `:11080`。預設帳號 `Soybean`/`123456`。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

---

## C-V1：12 處 spec md edits 精確 enumerate verify

```bash
echo "=== TZ pattern hits should be 0 after fix ==="
grep -rn "NOW() - INTERVAL" specs/ --include="*.md" | grep -v "043-spec-hygiene-pass-2" | head

echo ""
echo "=== fix pattern hits should be ≥10 after fix ==="
grep -rn "(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL" specs/ --include="*.md" | grep -v "043-spec-hygiene-pass-2" | wc -l

echo ""
echo "=== logout § exists in spec 005 ==="
grep -n "Logout (no server endpoint by design)" specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md

echo ""
echo "=== use 行 fix in spec 002 ==="
grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md | grep -v "tasks.md"  # tasks.md 4 hits 為 CI lint pattern、保留正確
```

**Expected**：
- TZ pattern hits（grep -v 043 排除本 spec 自身）：**0 hit**（10 處全 fixed）
- fix pattern hits：**≥10**（10 處全 fixed、可能更多若 implementer 階段擴展）
- logout § 存在：1 hit
- spec 002 data-model.md `use server_model::admin::entities` 殘留：**0 hit**

對應 SC-001 + SC-003 + FR-001 + FR-003 + FR-004。

---

## C-V2：TZ fix SQL 真實 match 近期 audit row

```bash
echo "=== 1. 產生 1 個 admin write ==="
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -fsS -X POST "http://127.0.0.1:11080/api/role" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"code":"ROLE_CV043_2","name":"043-cv2","description":"","status":"enabled","pid":""}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'role create code={r[\"code\"]}')"
sleep 2

echo ""
echo "=== 2. 跑改前 SQL pattern（預期 0 row 或漏看）==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_operation_log WHERE module_name='sys_role' AND created_at > NOW() - INTERVAL '10 seconds';"

echo ""
echo "=== 3. 跑改後 SQL pattern（預期 ≥2 row，因 042 雙視角）==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT COUNT(*) FROM sys_operation_log WHERE module_name='sys_role' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds';"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='ROLE_CV043_2';" > /dev/null
```

**Expected**：
- Step 2 改前 SQL：0 row（TZ offset 過濾掉）
- Step 3 改後 SQL：**≥2 row**（INTERNAL + HTTP 雙視角、042 already）
- 證明 fix pattern 對窄窗口（10 seconds）正確 match 近期 audit row

對應 SC-001、FR-002、US1 Acceptance Scenario 1。

---

## C-V3：spec 005 contracts/auth-endpoints.md logout § 涵蓋 4 aspect

```bash
echo "=== 1. logout § 存在 ==="
grep -n "Logout" specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md

echo ""
echo "=== 2. 4 aspect coverage check ==="
for keyword in "Current Design" "Token Revocation Research|Pattern A|Redis token blacklist" "trigger scenarios|Anomaly-driven|Admin-driven" "W-F12|Observability Hook"; do
  count=$(grep -cE "$keyword" specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md)
  echo "  '$keyword' hits: $count"
done

echo ""
echo "=== 3. 3 pattern names enumerate ==="
grep -cE "Redis token blacklist|Short-TTL.*refresh|JWT versioning" specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md
```

**Expected**：
- Step 1：≥2 hit（§ heading + cross-reference）
- Step 2：每個 aspect keyword ≥1 hit、4/4 aspect coverage
- Step 3：3 pattern 名稱 ≥3 hit（at least 1 per pattern）

對應 SC-002、FR-003、US2 Acceptance Scenario 1+2。

---

## C-V4：spec 002 §E4 use 行 fix

```bash
echo "=== before-fix（基準）：spec 002 data-model.md ==="
grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md

echo ""
echo "=== expected after fix：0 hit ==="
# 上面 grep 應該 0 row 返回（exit code 1）
grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md && echo "FAIL: 仍有殘留" || echo "PASS: 0 hit"

echo ""
echo "=== same file: use crate::admin::entities should exist ==="
grep -n "use crate::admin::entities" specs/002-soft-delete-infrastructure/data-model.md | head -3
```

**Expected**：
- before-fix 基準：1 hit（line 158）
- after-fix：**0 hit**
- 同檔 `use crate::admin::entities` ≥2 hit（既有 line 186 / 362）

對應 SC-003、FR-004、US3 Acceptance Scenario 1。

---

## C-V5：INTEGRATION-CHECKLIST cleanup

```bash
echo "=== 042-N3 / R5 / 041-N2 已從衍生 follow-up table 移除 ==="
grep -nE "^\| 042-N3 |^\| R5 |^\| 041-N2 " docs/INTEGRATION-CHECKLIST.md && echo "FAIL: row 殘留" || echo "PASS: 3 row 已移除"

echo ""
echo "=== 043 entry 在已完成里程碑 ==="
grep -cn "043 spec-hygiene-pass-2" docs/INTEGRATION-CHECKLIST.md
# Expected: ≥1 hit

echo ""
echo "=== Current Focus 指向 W-F12/13/14 ==="
grep -n "下一步.*W-F12\|下一步.*observability" docs/INTEGRATION-CHECKLIST.md | head
```

**Expected**：
- R2/R3/F2.2 grep 0 hit（041-N2 / 042-N3 / R5 已 cleanup）
- 043 entry hit ≥1
- Current Focus 提到 W-F12 或 observability

對應 SC-004、FR-009。

---

## Summary table

| C-V | Goal | 對應 FR / SC |
|---|---|---|
| C-V1 | 12 處 spec md edits 全 cover | SC-001、SC-003、FR-001、FR-003、FR-004 |
| C-V2 | TZ fix 對窄窗口真實 match audit row | SC-001、FR-002、US1 AS-1 |
| C-V3 | logout § 4 aspect coverage | SC-002、FR-003、US2 AS-1+2 |
| C-V4 | spec 002 use 行 fix | SC-003、FR-004、US3 AS-1 |
| C-V5 | INTEGRATION-CHECKLIST cleanup | SC-004、FR-009 |

C-V1 ~ C-V5 全 PASS = acceptance PASS、ready for outer 單段 commit（per CLAUDE.md §4.1 外層專屬檔）。
