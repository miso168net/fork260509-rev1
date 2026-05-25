# Verification Commands — 050 spec-hygiene-pass-4

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

10 個 C-V contract = 本 sprint 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-010）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 13 service**（既有 12 + 新 pushgateway）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
```

---

## C-V1：dev stack 13 service healthy + drainer 跑著（baseline）

對應 SC-001（接 049 baseline、不退化 + 新 pushgateway 加入）。

```bash
echo "=== 13 service health ==="
$PCO ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer 跑著 ==="
$PCO logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox" | head -5

echo ""
echo "=== pushgateway healthy ==="
curl -sI http://127.0.0.1:9091/-/healthy | head -3
```

**Expected**：13 service `Up`（既有 12 + 新 pushgateway healthy）；rust-api log 顯示 drainer / outbox 背景 task；pushgateway HTTP `/health` 200 OK。

---

## C-V2：036-R1 partial update missing field preserve（C-V6 對齊 spec 036 FR-004）

對應 SC-002。

**前置**：Phase 1 sys_menu DTO `Option<Option<T>>` double-option + sys_menu_service selective merge logic 落地。

```bash
# 拿 Soybean token + 取一個現有 menu 的 id + query/buttons/fixed_index_in_tab 既有值
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Soybean","password":"123456"}' | jq -r '.data.token')

# 拿一個有 query/buttons 填值的 menu（從 menu list）
MENU_BEFORE=$(curl -s -X POST http://127.0.0.1:11080/api/systemManage/getMenuList \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq '.data.records[] | select(.query != null) | .' | head -50)
MENU_ID=$(echo "$MENU_BEFORE" | jq -r '.id')

# 跑 partial update：只送 name 改、不送 query/buttons/fixedIndexInTab
curl -s -X POST http://127.0.0.1:11080/api/systemManage/updateMenu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$MENU_ID\", \"name\":\"renamed_by_cv2\"}"

# 拿 update 後 menu、確認 query/buttons/fixedIndexInTab 仍為 before 值
MENU_AFTER=$(curl -s -X POST http://127.0.0.1:11080/api/systemManage/getMenuList \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq ".data.records[] | select(.id == \"$MENU_ID\") | .")

# Diff 3 field：query / buttons / fixedIndexInTab
diff <(echo "$MENU_BEFORE" | jq '{query, buttons, fixedIndexInTab}') \
     <(echo "$MENU_AFTER" | jq '{query, buttons, fixedIndexInTab}')
```

**Expected**：`diff` 0 output（3 field 值 identical before/after、partial update 未覆蓋 missing field）；C-V6 partial update acceptance test PASS。

---

## C-V3：037-R1 grouping rule sync + GeneralUser deny C-V

對應 SC-003。

**前置**：Phase 1 sys_role_service.update_role 加 ptype='g' defensive UPDATE + audit g_rules_updated_count 落地。

```bash
# 拿 Soybean token + role list、選一個非 ROLE_SUPER role
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Soybean","password":"123456"}' | jq -r '.data.token')

# 拿一個 test role（先用 curl 建 if not exists、name=CV050_GROUP_TEST、code=R_CV050_OLD）
ROLE_ID=$(curl -s -X POST http://127.0.0.1:11080/api/systemManage/addRole \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"CV050_GROUP_TEST", "code":"R_CV050_OLD", "status":"1", "pid":null, "description":"050 C-V3 test"}' | jq -r '.data.id')

# Mock insert g rule via psql
docker compose exec -T postgres psql -U postgres -d soybean_admin \
  -c "INSERT INTO casbin_rule (ptype, v0, v1) VALUES ('g', 'cv050_user', 'R_CV050_OLD');"

# Verify g rule exists
docker compose exec -T postgres psql -U postgres -d soybean_admin \
  -c "SELECT ptype, v0, v1 FROM casbin_rule WHERE ptype='g' AND v1='R_CV050_OLD';"

# Rename role: R_CV050_OLD → R_CV050_NEW
curl -s -X POST http://127.0.0.1:11080/api/systemManage/updateRole \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$ROLE_ID\", \"name\":\"CV050_GROUP_TEST_RENAMED\", \"code\":\"R_CV050_NEW\", \"status\":\"1\", \"pid\":null}"

# Verify g rule v1 sync 為 R_CV050_NEW
docker compose exec -T postgres psql -U postgres -d soybean_admin \
  -c "SELECT ptype, v0, v1 FROM casbin_rule WHERE ptype='g' AND v0='cv050_user';"
# expect: v1 = R_CV050_NEW (synced from R_CV050_OLD)

# Verify audit_log payload 含 g_rules_updated_count = 1
docker compose exec -T postgres psql -U postgres -d soybean_admin \
  -c "SELECT payload FROM sys_operation_log WHERE entity_type='sys_role' AND created_at > NOW() - INTERVAL '5 minutes' ORDER BY created_at DESC LIMIT 1;" | grep g_rules_updated_count

# === GeneralUser deny C-V ===
GENERAL_TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"GeneralUser","password":"123456"}' | jq -r '.data.token')

# GeneralUser 試 POST updateRole、應 deny
curl -s -X POST http://127.0.0.1:11080/api/systemManage/updateRole \
  -H "Authorization: Bearer $GENERAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$ROLE_ID\", \"name\":\"general_should_fail\", \"code\":\"R_CV050_NEW\", \"status\":\"1\", \"pid\":null}" \
  | jq -r '.code, .msg'
# expect: code != 0 (deny by Casbin)

# Cleanup
docker compose exec -T postgres psql -U postgres -d soybean_admin \
  -c "DELETE FROM casbin_rule WHERE v0='cv050_user';"
curl -s -X POST http://127.0.0.1:11080/api/systemManage/deleteRole \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$ROLE_ID\"}"
```

**Expected**：psql 看 g rule v1 已 sync 為 R_CV050_NEW；audit_log payload 含 `g_rules_updated_count: 1`；GeneralUser updateRole 被 Casbin deny（code != 0）。

---

## C-V4：044-R1 pushgateway scrape + cleanup_job_rows_deleted_total series 出現

對應 SC-004。

**前置**：Phase 1 cleanup binary pushgateway recorder install + Phase 2 docker-compose pushgateway service + prometheus scrape job 落地。

```bash
# 觸發 cleanup binary 跑一次（手動）
docker compose exec rust-api /app/cleanup
sleep 5

# 看 pushgateway 收到 cleanup binary 推送的 metric
curl -s http://127.0.0.1:9091/metrics | grep -E "^cleanup_job_rows_deleted_total"

# 看 prometheus scrape 後 series
curl -s "http://127.0.0.1:9090/api/v1/query?query=cleanup_job_rows_deleted_total" \
  | jq '.data.result | length'

# 看 prom series 含 7 sweep label
curl -s "http://127.0.0.1:9090/api/v1/query?query=cleanup_job_rows_deleted_total" \
  | jq '[.data.result[] | .metric.sweep] | sort | unique'
```

**Expected**：pushgateway `/metrics` 看到 `cleanup_job_rows_deleted_total{sweep="*"}` series（7 sweep）；prometheus query result length ≥ 7；sweep label set 含 7 sweep 名（cleanup 各 entity sweep）。

---

## C-V5：044-R2 route label template path（無 numeric ID cardinality）

對應 SC-005。

**前置**：Phase 1 operation_log.rs MatchedPath fallback 落地。

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Soybean","password":"123456"}' | jq -r '.data.token')

# 觸發多個 path-parameterized endpoint（不同 ID）
for i in 1 2 3; do
  curl -s "http://127.0.0.1:11080/api/route/auth-route/$i" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
done

sleep 2  # wait for prometheus scrape

# 看 prom series route label
curl -s "http://127.0.0.1:9090/api/v1/query?query=http_request_duration_seconds_count" \
  | jq '[.data.result[] | .metric.route] | sort | unique'
```

**Expected**：route label 含 template path（如 `/route/auth-route/{role_id}` 或 `/route/auth-route/:roleId`）、無 raw numeric ID（如 `/route/auth-route/1` `/route/auth-route/2` `/route/auth-route/3` 各為獨立 series）；3 個 curl 觸發 1 個 series（cardinality 限制）。

---

## C-V6：046-R1 spec FR-015 amend + 046 entry footnote

對應 SC-006。

```bash
echo "=== 046 spec.md FR-015 amend ==="
grep -A2 "FR-015" specs/046-spec-hygiene-pass-3/spec.md | head -5

echo ""
echo "=== user 拍板可加大 wording ==="
grep -c "user 拍板可加大" specs/046-spec-hygiene-pass-3/spec.md
echo "(expect ≥1)"

echo ""
echo "=== 046 retro footnote ==="
grep -c "046 entry budget enlargement\|046 sprint US4 implementer-stage expansion 實際 18 sites" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

echo ""
echo "=== 050 retro 補登 footnote in 046 spec ==="
grep "050 sprint 補 retro" specs/046-spec-hygiene-pass-3/spec.md | head -2
```

**Expected**：046 spec FR-015 wording 含「user 拍板可加大」+ 050 retro 補登 footnote；INTEGRATION-CHECKLIST 含 046 budget enlargement footnote。

---

## C-V7：049-R1 Dockerfile comment polish（line 35-42 block）

對應 SC-007。

```bash
echo "=== Dockerfile line 35-42 block content ==="
sed -n '35,42p' base-web/Dockerfile

echo ""
echo "=== outdated ref 0 hit ==="
grep -c "nodeLinker: hoisted" base-web/Dockerfile
echo "(expect 0)"
grep -c "shamefully-hoist=true" base-web/Dockerfile
echo "(expect 0)"

echo ""
echo "=== strict isolation 紀律 keyword present ==="
grep -c "strict isolation" base-web/Dockerfile
echo "(expect ≥1)"

echo ""
echo "=== packageManager field 提及 ==="
grep -c "packageManager field" base-web/Dockerfile
echo "(expect ≥1)"

echo ""
echo "=== line 33-34 preserved ==="
sed -n '33,34p' base-web/Dockerfile | grep -c "Deps-first COPY\|BuildKit cache"
echo "(expect ≥1 — Deps-first / BuildKit context 保留)"
```

**Expected**：Dockerfile line 35-42 block 含「strict isolation」/「packageManager field」keyword；無「nodeLinker: hoisted」/「shamefully-hoist=true」outdated reference；line 33-34 preserve。

---

## C-V8：governance docs（DESIGN §4.4.3 + INTEGRATION-CHECKLIST cleanup + SPECKIT idle）

對應 SC-008、FR-001/013。

```bash
echo "=== DESIGN-W-BASE-WEB.md §4.4.3 050 entry ==="
grep -c "### §4\.4\.3" docs/INTEGRATION-DESIGN-W-BASE-WEB.md
echo "(expect ≥1)"
grep -c "050 spec-hygiene-pass-4" docs/INTEGRATION-DESIGN-W-BASE-WEB.md
echo "(expect ≥1)"

echo ""
echo "=== INTEGRATION-CHECKLIST 6 R-row 結案 footnote ==="
grep -c "5 Important + 1 Polish 結案（050 spec-hygiene-pass-4 落地" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

echo ""
echo "=== 6 R-row 已從 active table 移除 ==="
for rid in 036-R1 037-R1 044-R1 044-R2 046-R1 049-R1; do
  count=$(grep -c "^| \*\*${rid}\*\*\|^| ${rid}" docs/INTEGRATION-CHECKLIST.md)
  echo "$rid in active table: $count (expect 0)"
done

echo ""
echo "=== 2 R-row Critical 仍 active ==="
grep -c "^| \*\*038-R1\*\*\|^| \*\*039-R1\*\*" docs/INTEGRATION-CHECKLIST.md
echo "(expect 2)"

echo ""
echo "=== 050 milestone entry ==="
grep -c "^- \[x\] \*\*050 spec-hygiene-pass-4\*\*" docs/INTEGRATION-CHECKLIST.md
echo "(expect 1)"

echo ""
echo "=== SPECKIT marker idle ==="
grep -A4 "<!-- SPECKIT START -->" CLAUDE.md | head -5
echo "(expect: Active Spec —、Active Plan —、Phase idle)"
```

**Expected**：DESIGN §4.4.3 + 050 entry 命中、6 R-row 移為結案 footnote 且不在 active table、2 R-row Critical 仍 active、050 milestone 加、SPECKIT idle。

---

## C-V9：boundary verify（軌道紀律 + scope discipline）

對應 SC-009、FR-010。

```bash
echo "=== base-web 改動限定範圍 ==="
echo "--- base-web changed files (本 sprint diff vs f6efe906 baseline) ---"
cd base-web && git diff --name-only f6efe906 HEAD && cd ..
echo "(expect: Dockerfile only)"

echo ""
echo "=== base-web src/ 0 diff ==="
cd base-web && git diff --stat f6efe906 HEAD -- src/ 2>&1 | wc -l && cd ..
echo "(expect 0)"

echo ""
echo "=== base-web packages/ 0 diff ==="
cd base-web && git diff --stat f6efe906 HEAD -- packages/ 2>&1 | wc -l && cd ..
echo "(expect 0 — 軌道內 1 file 限 Dockerfile 註解)"

echo ""
echo "=== rust-api changed files ==="
cd rust-api && git diff --name-only origin/rev1-admin-rust-api HEAD 2>&1 | head -10 && cd ..

echo ""
echo "=== 0 schema migration ==="
find rust-api/migration/src -name "*.rs" -newer specs/050-spec-hygiene-pass-4/spec.md 2>/dev/null
echo "(expect empty)"

echo ""
echo "=== 0 new cargo workspace dep (Cargo.toml not in /server/cleanup/) ==="
git diff origin/rev1-admin-root..HEAD rust-api/Cargo.toml 2>&1 | wc -l
echo "(expect 0)"

echo ""
echo "=== 0 Constitution amendment ==="
git diff origin/rev1-admin-root..HEAD .specify/memory/constitution.md 2>&1 | wc -l
echo "(expect 0)"
```

**Expected**：軌道紀律 boundary 全 PASS — base-web 限 Dockerfile only、src/ + packages/ 0 diff、0 schema migration、0 workspace cargo dep、0 Constitution amendment。

---

## C-V10：C-V1~C-V9 全 PASS final check + acceptance summary

對應 SC-001~010。

```bash
echo "===== 050 spec-hygiene-pass-4 final acceptance ====="
echo ""
echo "--- C-V1 13 service healthy ---"
$PCO ps --format "{{.Service}}: {{.Status}}" | grep -c "Up"
echo "(expect 13)"

echo "--- C-V2 partial update preserve ---"
echo "(run C-V2 script、見上)"

echo "--- C-V3 ptype='g' sync + audit + GeneralUser deny ---"
echo "(run C-V3 script、見上)"

echo "--- C-V4 cleanup_job pushgateway scrape ---"
curl -s "http://127.0.0.1:9090/api/v1/query?query=cleanup_job_rows_deleted_total" \
  | jq '.data.result | length'
echo "(expect ≥7)"

echo "--- C-V5 route label template ---"
curl -s "http://127.0.0.1:9090/api/v1/query?query=http_request_duration_seconds_count" \
  | jq '[.data.result[] | .metric.route] | unique | length'
echo "(expect ≤ pattern count、不爆炸)"

echo "--- C-V6 046 FR-015 amend ---"
grep -c "user 拍板可加大" specs/046-spec-hygiene-pass-3/spec.md
echo "(expect ≥1)"

echo "--- C-V7 Dockerfile strict isolation ---"
grep -c "strict isolation" base-web/Dockerfile
echo "(expect ≥1)"

echo "--- C-V8 DESIGN §4.4.3 ---"
grep -c "### §4\.4\.3" docs/INTEGRATION-DESIGN-W-BASE-WEB.md
echo "(expect ≥1)"

echo "--- C-V9 boundary verify ---"
cd base-web && git diff --name-only f6efe906 HEAD && cd ..
echo "(expect Dockerfile only)"

echo ""
echo "===== git status final ====="
git status --short
```

**Expected**：C-V1~C-V9 全 PASS、git status clean、ready for outer push / merge / backfill。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 13 service healthy + pushgateway + drainer | SC-001 | infra baseline |
| C-V2 | 036-R1 partial update missing field preserve | SC-002、FR-003 | impl gate |
| C-V3 | 037-R1 ptype='g' sync + audit + GeneralUser deny | SC-003、FR-004 | impl gate |
| C-V4 | 044-R1 cleanup_job pushgateway scrape series | SC-004、FR-005/006 | infra impl gate |
| C-V5 | 044-R2 route label template path | SC-005、FR-007 | impl gate |
| C-V6 | 046-R1 spec FR-015 amend + footnote | SC-006、FR-002 | spec hygiene |
| C-V7 | 049-R1 Dockerfile strict isolation comment | SC-007、FR-009 | base-web hygiene |
| C-V8 | DESIGN §4.4.3 + CHECKLIST cleanup + SPECKIT idle | SC-008、FR-001/013 | governance docs |
| C-V9 | boundary verify (scope discipline + 0 amendment) | SC-009、FR-010 | scope discipline |
| C-V10 | final acceptance summary | SC-001~010 全 PASS | overall |

C-V1~C-V10 全 PASS = acceptance PASS、ready for outer + worktree commit + merge + backfill。
