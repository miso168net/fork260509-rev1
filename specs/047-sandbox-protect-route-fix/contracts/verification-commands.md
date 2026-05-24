# Verification Commands — 047 sandbox-protect-route-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

5 個 C-V contract = 本 feature 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-006）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 12 service**（5 既有 + 7 observability healthy、per 044 / 046 baseline）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

---

## C-V1：dev stack 12 service healthy + drainer 跑著（baseline）

對應 SC-001。

```bash
echo "=== 12 service health ==="
$PC ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer 跑著（log 含 drainer task spawned）==="
$PC logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox" | head -5
```

**Expected**：12 service `Up (healthy)`（044 / 046 baseline；redis_exporter / nginx-exporter / promtail "Up" without healthcheck by design）；rust-api log 顯示 drainer / outbox 背景 task。

---

## C-V2：US2 — 8 個 unit test 全 PASS（cargo test）

對應 SC-002、FR-008。

```bash
cd rust-api
cargo test -p server-core sign::api_key_middleware -- --nocapture 2>&1 | tail -40
cd ..
```

**Expected**：輸出含 `test result: ok. 9 passed; 0 failed` 或 `test result: ok. 8 passed; 0 failed`（既有 `test_api_key_sign` 為第 9 個、本 feature 不動既有；本 feature 加的 8 個 unit test 全 PASS）；無 `#[ignore]` 標註、跑時間 < 2 second。

檢驗 grep（spec-md verification）：

```bash
echo "=== 8 個 new unit test 命名命中 ==="
F=rust-api/server/core/src/sign/api_key_middleware.rs
for fn in simple_missing_api_key_returns_401_with_www_authenticate \
          simple_invalid_api_key_returns_401_with_www_authenticate \
          simple_valid_api_key_passes_through \
          simple_non_protected_path_passes_through \
          complex_missing_field_returns_401_with_www_authenticate \
          complex_invalid_signature_returns_401_with_www_authenticate \
          complex_valid_signed_request_passes_through \
          complex_invalid_timestamp_returns_401_with_www_authenticate; do
    HITS=$(grep -cE "async fn $fn" $F || true)
    [ "$HITS" = "1" ] && echo "PASS: $fn" || echo "FAIL: $fn (hits=$HITS)"
done
```

**Expected**：8 fn 全 PASS（each 1 hit）。

---

## C-V3：US1 — 雙端點 8 case curl real-wire 驗證

對應 SC-003、FR-001~004。

**前置**：rust-api docker image 已重 build（含本 feature production fix）+ rust-api service restart healthy + drainer 跑著。

```bash
echo "===== Simple endpoint: /sandbox/simple-api-key ====="

echo ""
echo "--- Case 1: valid x-api-key=test-api-key ---"
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  -H "x-api-key: test-api-key" \
  "http://127.0.0.1:11080/api/sandbox/simple-api-key"
cat /tmp/resp.txt | head -3
echo "(expect HTTP 200 + body code:0)"

echo ""
echo "--- Case 2: invalid x-api-key=bogus-XYZ ---"
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  -H "x-api-key: bogus-XYZ" \
  "http://127.0.0.1:11080/api/sandbox/simple-api-key"
cat /tmp/resp.txt | head -3
grep -i "www-authenticate" /tmp/h.txt
echo "(expect HTTP 401 + WWW-Authenticate: ApiKey + body code:5004)"

echo ""
echo "--- Case 3: no x-api-key header ---"
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  "http://127.0.0.1:11080/api/sandbox/simple-api-key"
cat /tmp/resp.txt | head -3
grep -i "www-authenticate" /tmp/h.txt
echo "(expect HTTP 401 + WWW-Authenticate: ApiKey + body code:5003)"

echo ""
echo "--- Case 4: empty x-api-key: ---"
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  -H "x-api-key:" \
  "http://127.0.0.1:11080/api/sandbox/simple-api-key"
cat /tmp/resp.txt | head -3
grep -i "www-authenticate" /tmp/h.txt
echo "(expect HTTP 401 + WWW-Authenticate: ApiKey + body code:5003)"

echo ""
echo "===== Complex endpoint: /sandbox/complex-api-key ====="

# Need to construct signed query for valid case; use python helper for HMAC
echo ""
echo "--- Case 5: valid signed query ---"
TS=$(date +%s%3N)
NONCE="nonce_${TS}"
# AccessKeyId=test-access-key, sorted params (A < n < t), default ApiKeyConfig
# algorithm = Md5 (per rust-api/server/core/src/sign/api_key.rs L29-34 default)
# signing string format: sorted_params + "&key=" + secret, then MD5 hex
# （此處 C-V3 Case 5 algorithm erratum 修正：047 落地 T011 wire test 發現原寫
#  HMAC-SHA256 是錯的、實際 default 是 MD5+`&key=` 後綴；參 api_key.rs L198）
SIGNING_STR=$(printf "AccessKeyId=test-access-key&n=%s&t=%s" "$NONCE" "$TS")
SIGN=$(printf '%s&key=test-secret-key' "$SIGNING_STR" | md5sum | awk '{print $1}')
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  "http://127.0.0.1:11080/api/sandbox/complex-api-key?${SIGNING_STR}&sign=${SIGN}"
cat /tmp/resp.txt | head -3
echo "(expect HTTP 200 + body code:0)"

echo ""
echo "--- Case 6: invalid signature ---"
TS=$(date +%s%3N)
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  "http://127.0.0.1:11080/api/sandbox/complex-api-key?AccessKeyId=test-access-key&t=${TS}&n=nonce_x&sign=wronghex"
cat /tmp/resp.txt | head -3
grep -i "www-authenticate" /tmp/h.txt
echo "(expect HTTP 401 + WWW-Authenticate: ApiKey + body code:5004)"

echo ""
echo "--- Case 7: missing AccessKeyId field ---"
TS=$(date +%s%3N)
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  "http://127.0.0.1:11080/api/sandbox/complex-api-key?t=${TS}&n=nonce_x&sign=anything"
cat /tmp/resp.txt | head -3
grep -i "www-authenticate" /tmp/h.txt
echo "(expect HTTP 401 + WWW-Authenticate: ApiKey + body code:5003 + msg 含 Missing AccessKeyId)"

echo ""
echo "--- Case 8: invalid timestamp (non-numeric) ---"
curl -s -o /tmp/resp.txt -D /tmp/h.txt -w "HTTP %{http_code}\n" \
  "http://127.0.0.1:11080/api/sandbox/complex-api-key?AccessKeyId=test-access-key&t=not-a-number&n=nonce_x&sign=anything"
cat /tmp/resp.txt | head -3
grep -i "www-authenticate" /tmp/h.txt
echo "(expect HTTP 401 + WWW-Authenticate: ApiKey + body code:5003 + msg 'Invalid timestamp')"
```

**Expected**：Simple 4 case + Complex 4 case 全 PASS（Case 1/5 為 HTTP 200 + valid handler response；Case 2/3/4/6/7/8 為 HTTP 401 + WWW-Authenticate header + body envelope `success:false` + 對應 code 5003/5004）。

---

## C-V4：FR-005/006/007/010 boundary verify（envelope contract + 0 base-web + 0 schema + 0 new dep + 0 jwt/casbin 改動）

對應 SC-004、SC-005、FR-005/006/007/010。

```bash
echo "=== FR-007: 0 base-web 改動 ==="
git diff --stat base-web/ 2>&1 | head -5
echo "(expect 0 line change)"
(cd base-web && git log --oneline rev1-admin-base-web -1)
echo "(expect HEAD 與 045/046 同、未變)"

echo ""
echo "=== FR-006: 0 schema migration ==="
find rust-api/migration/src -name "*.rs" -newer specs/047-sandbox-protect-route-fix/spec.md 2>/dev/null
echo "(expect empty)"

echo "=== FR-006: 0 新 application entity ==="
find rust-api/server/model/src/admin/entities -name "sys_*.rs" -newer specs/047-sandbox-protect-route-fix/spec.md 2>/dev/null
echo "(expect empty)"

echo "=== FR-006: 0 新 workspace cargo dep ==="
git diff rust-api/Cargo.toml 2>&1 | head -10
echo "(expect 0 line change in [workspace.dependencies] 段)"

echo "=== FR-006: server-core dev-deps tower util 加（per-crate change、允許）==="
git diff rust-api/server/core/Cargo.toml 2>&1 | head -10
echo "(expect 1 line add: tower = { workspace = true, features = [\"util\"] } 在 [dev-dependencies] 段)"

echo ""
echo "=== FR-010: jwt + casbin envelope adapter 不動 ==="
git diff rust-api/server/middleware/src/jwt.rs rust-api/server/middleware/src/casbin_envelope_adapter.rs 2>&1 | head -5
echo "(expect 0 line change)"

echo ""
echo "=== FR-005: Res<T>::IntoResponse 既有實作不變 ==="
git diff rust-api/server/core/src/web/res.rs 2>&1 | head -5
echo "(expect 0 line change)"

echo ""
echo "=== SC-004: api_key_middleware fn signature 不變 ==="
grep -c "pub async fn api_key_middleware" rust-api/server/core/src/sign/api_key_middleware.rs
echo "(expect 1 hit — function signature 不變、僅內部 error response 構造改)"

echo ""
echo "=== SC-004: 8 個 unit test fn 命中 ==="
grep -cE "async fn (simple|complex)_(missing|invalid|valid|non_protected)" rust-api/server/core/src/sign/api_key_middleware.rs
echo "(expect ≥8)"
```

**Expected**：base-web 0 diff、0 migration、0 新 entity、0 workspace dep 改動、jwt+casbin 0 改動、Res 0 改動；server-core dev-deps 加 tower util 1 line；api_key_middleware fn signature 不變；8 個 test fn 全命中。

---

## C-V5：FR-009 — INTEGRATION-CHECKLIST cleanup + 047 entry + 下一步指向 base-web sprint

對應 SC-006、FR-009。

```bash
echo "=== FR-009: 045-N1 row 移除 ==="
HITS=$(grep -cE "^\| 045-N1 " docs/INTEGRATION-CHECKLIST.md || true)
[ "$HITS" = "0" ] && echo "PASS: 045-N1 已移除" || echo "FAIL: 045-N1 殘留 ($HITS)"

echo ""
echo "=== FR-009: 047 milestone entry 就位 ==="
grep -c "047 sandbox-protect-route-fix" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

echo ""
echo "=== FR-009: 下一步指向 base-web TS id 型別債 cleanup sprint ==="
grep -cE "base-web TS .?id.? 型別債|base-web sprint" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

echo ""
echo "=== CLAUDE.md SPECKIT marker idle ==="
grep -A4 "<!-- SPECKIT START -->" CLAUDE.md | head -6
echo "(expect: Active Spec —、Active Plan —、Phase idle、下一步指向 base-web sprint)"
```

**Expected**：045-N1 row 0 hit（已移）、047 entry ≥1 hit、下一步 base-web sprint ≥1 hit、SPECKIT marker 為 idle 狀態。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer 跑著 | SC-001 | infra baseline |
| C-V2 | 8 個 unit test 全 PASS（cargo test）+ fn 命名 grep | SC-002、FR-008 | US2 MVP |
| C-V3 | 雙端點 8 case curl real-wire 驗證 | SC-003、FR-001/002/003/004 | US1 |
| C-V4 | boundary verify（0 base-web / 0 schema / 0 dep / jwt+casbin 0 改動 / Res 0 改動 / api_key_middleware signature 不變 / 8 test fn 命中） | SC-004/005、FR-005/006/007/010 | scope discipline |
| C-V5 | INTEGRATION-CHECKLIST cleanup + 047 entry + 下一步 update | SC-006、FR-009 | docs |

C-V1~C-V5 全 PASS = acceptance PASS、ready for outer + worktree commit + merge。
