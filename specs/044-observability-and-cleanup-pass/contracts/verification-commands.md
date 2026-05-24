# Verification Commands — 044 observability-and-cleanup-pass

**Phase**：1（Design & Contracts）
**日期**：2026-05-24

23 個 C-V contract = 本 feature 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-013）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 12 service**（5 既有 + 7 observability healthy）。psql 經 `docker compose exec -T postgres`；rust-api 經 front-nginx `:11080`；grafana `:13000`；prometheus `:13090`。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
```

---

## C-V1：12 service healthy + 7 prometheus targets UP

對應 SC-001、FR-001/FR-006/FR-007/FR-010。

```bash
echo "=== 12 service health ==="
$PC ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== prometheus targets UP ==="
curl -fsS "http://127.0.0.1:13090/api/v1/targets" | \
  python3 -c "import sys, json; data = json.load(sys.stdin); active = data['data']['activeTargets']; print(f'total={len(active)}'); [print(f\"  {t['labels']['job']}: {t['health']}\") for t in active]"
```

**Expected**：12 service `Up (healthy)`；prometheus targets ≥7 全 `up`。

---

## C-V2：rust-api stdout JSON format + DESIGN-W §8.1 schema

對應 SC-002、FR-002/FR-003。

```bash
echo "=== rust-api stdout JSON 5 row sample ==="
$PC logs --tail=50 rust-api 2>/dev/null | grep -E '^\{' | head -5

echo ""
echo "=== JSON 5 row 是否含必要 5 欄 ==="
$PC logs --tail=50 rust-api 2>/dev/null | grep -E '^\{' | head -5 | while read row; do
  echo "$row" | python3 -c "
import sys, json
row = json.loads(sys.stdin.read())
required = ['timestamp', 'level', 'service', 'request_id', 'msg']
missing = [k for k in required if k not in row]
status = 'PASS' if not missing else f'FAIL missing: {missing}'
print(f\"  {status}: keys={list(row.keys())[:6]}...\")"
done
```

**Expected**：≥5 row JSON、每 row 必要 5 欄全有。

---

## C-V3：tracing span request_id 跨 log + audit row 對齊

對應 SC-003、FR-002/FR-003。

```bash
echo "=== 1. POST /api/role 取 request_id ==="
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
RESP=$(curl -fsS -i -X POST "http://127.0.0.1:11080/api/role" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"code":"ROLE_CV044_3","name":"044-cv3","description":"","status":"enabled","pid":""}')
REQ_ID=$(echo "$RESP" | grep -i "^x-request-id:" | awk '{print $2}' | tr -d '\r')
echo "request_id: $REQ_ID"
sleep 2

echo ""
echo "=== 2. log JSON 含 request_id ==="
$PC logs rust-api 2>/dev/null | grep -E '^\{' | python3 -c "
import sys, json
req_id = '$REQ_ID'
hits = 0
for line in sys.stdin:
    try:
        row = json.loads(line)
        if row.get('request_id') == req_id:
            hits += 1
    except: pass
print(f'log JSON hits with request_id: {hits} (expect ≥3)')"

echo ""
echo "=== 3. sys_operation_log row 含同 request_id ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_operation_log WHERE request_id = '$REQ_ID' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '30 seconds';"

echo ""
echo "=== cleanup ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='ROLE_CV044_3';" > /dev/null
```

**Expected**：
- log JSON request_id 命中 ≥3 row
- sys_operation_log row 命中 ≥2 row（INTERNAL + HTTP 雙視角、042 already）

---

## C-V4：rust-api `/metrics` endpoint + 8 metric 全暴

對應 SC-004、FR-005。

```bash
echo "=== /metrics endpoint 200 ==="
curl -fsS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:13090/metrics"

echo ""
echo "=== 8 業務 metric 全暴（series 0 也算暴）==="
METRICS=$(curl -fsS "http://127.0.0.1:13090/metrics")
for m in http_request_duration_seconds audit_log_writes_total casbin_enforcement_total casbin_policy_cache_invalidate_total outbox_pending_events sys_tokens_active cleanup_job_rows_deleted_total backup_completed_total; do
  count=$(echo "$METRICS" | grep -cE "^# (HELP|TYPE) $m" )
  status=$([ $count -gt 0 ] && echo "PASS" || echo "FAIL")
  echo "  $status: $m (TYPE/HELP hits: $count)"
done
```

**Expected**：200 OK + 8 metric 全 TYPE/HELP line present。

---

## C-V5：audit_log_writes_total counter increments on admin write

對應 SC-005、FR-005。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "=== baseline audit_log_writes_total ==="
BASELINE=$(curl -fsS "http://127.0.0.1:13090/metrics" | grep -E '^audit_log_writes_total\{.*operation="Create".*entity_type="sys_role"' | awk '{print $NF}')
echo "baseline: ${BASELINE:-0}"

curl -fsS -X POST "http://127.0.0.1:11080/api/role" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"code":"ROLE_CV044_5","name":"044-cv5","description":"","status":"enabled","pid":""}' > /dev/null
sleep 2

echo ""
echo "=== after POST audit_log_writes_total ==="
AFTER=$(curl -fsS "http://127.0.0.1:13090/metrics" | grep -E '^audit_log_writes_total\{.*operation="Create".*entity_type="sys_role"' | awk '{print $NF}')
echo "after: ${AFTER:-0}"
echo "delta: $(echo "${AFTER:-0} - ${BASELINE:-0}" | bc)"

$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='ROLE_CV044_5';" > /dev/null
```

**Expected**：delta ≥ 2（INTERNAL + HTTP 雙視角、042 already）。

---

## C-V6：grafana datasource auto-load + dashboard 4-6 + alert ≥6

對應 SC-006、FR-008/FR-009。

```bash
GRAFANA_PASS=$(cat deploy/secrets/grafana_admin_password.txt)

echo "=== Loki + Prometheus datasource health ==="
curl -fsS -u "admin:$GRAFANA_PASS" "http://127.0.0.1:13000/api/datasources" | \
  python3 -c "import sys, json; ds = json.load(sys.stdin); print(f'count={len(ds)}'); [print(f\"  {d['name']}: {d['type']}\") for d in ds]"

echo ""
echo "=== dashboards count 4-6 ==="
curl -fsS -u "admin:$GRAFANA_PASS" "http://127.0.0.1:13000/api/search?type=dash-db" | python3 -c "import sys, json; print(f'dashboard count: {len(json.load(sys.stdin))}')"

echo ""
echo "=== alerting rules ≥6 ==="
curl -fsS -u "admin:$GRAFANA_PASS" "http://127.0.0.1:13000/api/v1/provisioning/alert-rules" | python3 -c "import sys, json; print(f'alert rule count: {len(json.load(sys.stdin))}')"
```

**Expected**：≥2 datasource（Loki + Prometheus）、4-6 dashboard、≥6 alert rule。

---

## C-V7：US4 — extract_entity_id_from_url hybrid rule

對應 SC-007、FR-011。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "=== native path /api/role/<id> 行為不變 ==="
ROLE_ID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT id FROM sys_role WHERE code='ROLE_SUPER' LIMIT 1;")
# 隨便 PUT 一次（不真改）讓 audit row 寫入
curl -fsS -X GET "http://127.0.0.1:11080/api/role/$ROLE_ID" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
sleep 1
echo "  audit entity_id for native /api/role:"
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT entity_id FROM sys_operation_log WHERE url LIKE '/role/%' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds' ORDER BY created_at DESC LIMIT 1;"

echo ""
echo "=== systemManage path /api/systemManage/deleteX/<id> entity_id 取 id 不取 verb ==="
# 找一個無傷的 menu 操作觸發 systemManage path 寫入 audit
MENU_ID=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT id FROM sys_menu WHERE deleted_at IS NULL LIMIT 1;")
curl -fsS -X GET "http://127.0.0.1:11080/api/systemManage/getMenu/$MENU_ID" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
sleep 1
echo "  audit entity_id for systemManage path:"
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT entity_id, url FROM sys_operation_log WHERE url LIKE '/systemManage/%' AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds' ORDER BY created_at DESC LIMIT 1;"
```

**Expected**：
- native path entity_id 為 `<id>`（不退化）
- systemManage path entity_id 為 `<id>` 而非 `<verb>`

---

## C-V8：US5 — module_name + description 實值（無 "TODO"）

對應 SC-008、FR-012。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -fsS -X POST "http://127.0.0.1:11080/api/role" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"code":"ROLE_CV044_8","name":"044-cv8","description":"","status":"enabled","pid":""}' > /dev/null
sleep 2

echo "=== module_name + description 應為實值 ==="
$PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT module_name, description FROM sys_operation_log WHERE created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds' AND entity_type='sys_role' LIMIT 2;"

echo ""
echo "=== grep verify 無 TODO ==="
COUNT=$($PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM sys_operation_log WHERE (module_name='TODO' OR description='TODO') AND created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds';")
echo "TODO count: $COUNT (expect 0)"

$PC exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='ROLE_CV044_8';" > /dev/null
```

**Expected**：module_name = `"sys_role"` / description = `"HTTP POST /api/role"`（或對齊 hybrid rule）；TODO count = 0。

---

## C-V9：US6 — `print!` 0 stdout hit

對應 SC-009、FR-013。

```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "=== 觸發 sys_user_api print! callsite（GET /api/user）==="
curl -fsS -X GET "http://127.0.0.1:11080/api/user?page=1&size=5" -H "Authorization: Bearer $TOKEN" > /dev/null
sleep 1

echo ""
echo "=== docker compose logs rust-api 'user is' grep ==="
HITS=$($PC logs --tail=200 rust-api 2>/dev/null | grep -ci "user is")
echo "hits: $HITS (expect 0)"
```

**Expected**：0 hit。

---

## C-V10：tokio::spawn callsite 含 `.instrument(span)` 包裹

對應 SC-013、FR-004。

```bash
echo "=== grep tokio::spawn callsite + 同檔內 .instrument 包裹 ==="
SPAWNS=$(grep -rnE "tokio::spawn|tokio::task::spawn" rust-api/server/ 2>/dev/null | grep -v test | grep -v spawn_blocking | grep -v "//" | wc -l)
INSTRUMENTS=$(grep -rnE "\.instrument\(" rust-api/server/ 2>/dev/null | grep -v test | grep -v "//" | wc -l)
echo "tokio::spawn (async): ~$SPAWNS"
echo ".instrument() callsite: ~$INSTRUMENTS"
echo "expect: 每個 async spawn 都附近有 .instrument() (ratio 1:1)"
```

**Expected**：async spawn 與 instrument 比例 ~1:1（per FR-004 9 個 spawn callsite 全 wrap）。

---

## C-V11：US7 errata grep（041-N1 status enum 仍 0 hit）

對應 SC-010、FR-014。

```bash
echo "=== rust-api status string 1/2 literal ==="
grep -rn 'status.*=.*"1"' rust-api/server/ 2>/dev/null | grep -v test | grep -v "//" | wc -l

echo ""
echo "=== base-web status === '1' / '2' ==="
grep -rn 'status === .1.\|status === .2.' base-web/src/ 2>/dev/null | wc -l
```

**Expected**：兩個 grep 都 0 hit、與 plan research.md R-6 結果一致。

---

## C-V12：INTEGRATION-CHECKLIST cleanup

對應 SC-012、FR-017。

```bash
echo "=== 4 row 衍生 follow-up 已移除 ==="
grep -nE "^\| 042-N2 |^\| 042-N6 |^\| F3-N4 |^\| 041-N1 " docs/INTEGRATION-CHECKLIST.md && echo "FAIL: row 殘留" || echo "PASS: 4 row 已移除"

echo ""
echo "=== 3 row 規劃中已移除 ==="
grep -nE "^\| W-F12 |^\| W-F13 |^\| W-F14 " docs/INTEGRATION-CHECKLIST.md && echo "FAIL: planning row 殘留" || echo "PASS"

echo ""
echo "=== 044 entry 在已完成里程碑 ==="
grep -cn "044 observability-and-cleanup-pass" docs/INTEGRATION-CHECKLIST.md
# Expected: ≥1
```

**Expected**：衍生 follow-up table 4 row 全移、規劃中 table 3 row 全移、044 entry ≥1 hit。

---

## C-V13~C-V20：其餘 metric / alert / dashboard / log query / log retention / nginx-exporter / scrape_interval / spawn_propagation

為節制本文檔長度、其餘 8 條 C-V 留 implementer 階段補完：

- **C-V13**：6 active metric 各觸發 ≥1 次操作後 prometheus query 看到值上升
- **C-V14**：2 declared 0 series metric 在 /metrics 暴 series 但 value=0
- **C-V15**：grafana master overview dashboard 開啟、12 service health panel 顯示對齊 C-V1 results
- **C-V16**：trigger RustApi5xxRate alert（手動 trigger 5xx）+ grafana alert UI 紅標
- **C-V17**：trigger AuditPipelineStalled alert（暫停 rust-api、5 分鐘無增量）
- **C-V18**：loki retention 30d（dev 7d）verify（看 loki_chunk_store_index_entries）
- **C-V19**：nginx-exporter scrape stub_status 200、metric `nginx_connections_active` 暴
- **C-V20**：spawn callsite drainer 處理 audit event 的 log JSON 含 parent request_id
- **C-V21**：promtail scrape rate 對齊 `rate(loki_distributor_lines_received_total[5m])` > 0
- **C-V22**：prometheus retention 7d (dev) verify
- **C-V23**：base-web 0 改動 verify（git diff base-web/ 0 lines）

---

## Summary table

| C-V | Goal | 對應 SC / FR |
|---|---|---|
| C-V1 | 12 service healthy + 7 prom targets up | SC-001、FR-001/006/007/010 |
| C-V2 | rust-api JSON log schema 對齊 | SC-002、FR-002/003 |
| C-V3 | tracing span request_id cross log + audit | SC-003、FR-003 |
| C-V4 | /metrics endpoint + 8 metric 全暴 | SC-004、FR-005 |
| C-V5 | audit_log_writes_total +2 per admin write | SC-005、FR-005 |
| C-V6 | grafana datasource + 4-6 dashboard + ≥6 alert | SC-006、FR-008/009 |
| C-V7 | US4 systemManage entity_id hybrid rule | SC-007、FR-011 |
| C-V8 | US5 module_name + description 實值 | SC-008、FR-012 |
| C-V9 | US6 print! 0 hit | SC-009、FR-013 |
| C-V10 | tokio::spawn .instrument propagation | SC-013、FR-004 |
| C-V11 | US7 errata grep 0 hit | SC-010、FR-014 |
| C-V12 | INTEGRATION-CHECKLIST cleanup | SC-012、FR-017 |
| C-V13~C-V23 | 其餘 metric / alert / dashboard / log / nginx / scrape detail | various |

C-V1~C-V23 全 PASS = acceptance PASS、ready for outer + worktree 多段 commit + merge。
