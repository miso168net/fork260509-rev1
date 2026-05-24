# Verification Commands — 046 spec-hygiene-pass-3

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

8 個 C-V contract = 本 feature 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-009）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 12 service**（5 既有 + 7 observability healthy、per 044 baseline）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

---

## C-V1：dev stack 12 service healthy + drainer 跑著

對應 SC-001。

```bash
echo "=== 12 service health ==="
$PC ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer 跑著（log 含 drainer task spawned）==="
$PC logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox" | head -5
```

**Expected**：12 service `Up (healthy)`（044 baseline；redis_exporter / nginx-exporter / promtail "Up" without healthcheck by design）；rust-api log 顯示 drainer / outbox 背景 task。

---

## C-V2：US1 — 045 data-model.md §E1.2 兩處 erratum

對應 SC-002、FR-001/002。

```bash
echo "=== 1a whole-Model == 已從 §E1.2 移除 ==="
grep -cE "before_row == endpoint" specs/045-facade-atomicity-pass/data-model.md || true
echo "  (expect 0)"

echo ""
echo "=== 1a same_business semantic compare 描述就位 ==="
grep -cE "same_business|6 業務欄位 semantic compare|business-field semantic compare" specs/045-facade-atomicity-pass/data-model.md
echo "  (expect ≥1)"

echo ""
echo "=== 1a UPDATE 路徑 preserve created_at + display_id 描述 ==="
grep -cE "preserve.*created_at|preserve.*display_id|before_row\.created_at|before_row\.display_id" specs/045-facade-atomicity-pass/data-model.md
echo "  (expect ≥1)"

echo ""
echo "=== 1b tracing target macro structured field 改完 ==="
grep -cE "target: target" specs/045-facade-atomicity-pass/data-model.md || true
echo "  (expect 0)"
grep -cE "target = target" specs/045-facade-atomicity-pass/data-model.md
echo "  (expect ≥1)"
```

**Expected**：whole-Model `==` 與 `target: target` 雙 0 hit；`same_business` + `preserve` + `target = target` 三 ≥1 hit。

---

## C-V3：US2 — 045 contracts/verification-commands.md 5 處對齊

對應 SC-003、FR-003/004/005/006。

```bash
echo "=== 2a C-V2 schema column entity_type → module_name ==="
grep -cE "entity_type='sys_(endpoint|user)'" specs/045-facade-atomicity-pass/contracts/verification-commands.md || true
echo "  (expect 0)"
grep -cE "module_name='sys_(endpoint|user)'" specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (expect ≥2)"

echo ""
echo "=== 2a operation case Insert/Update → INSERT/UPDATE ==="
grep -cE "operation IN \('Insert','Update'\)" specs/045-facade-atomicity-pass/contracts/verification-commands.md || true
echo "  (expect 0)"
grep -cE "operation IN \('INSERT','UPDATE'\)" specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (expect ≥1)"

echo ""
echo "=== 2b access_key endpoint path ==="
grep -cE "/api/accessKey" specs/045-facade-atomicity-pass/contracts/verification-commands.md || true
echo "  (expect 0)"
grep -cE "/api/access-key" specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (expect ≥5)"

echo ""
echo "=== 2b access_key create body 含 domain 欄 ==="
grep -cE '"domain":"dev"|"domain": *"' specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (expect ≥1)"

echo ""
echo "=== 2c addUser body shape userName + status='1' ==="
grep -cE 'curl.*POST.*addUser' specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (curl POST addUser lines: expect 2)"
grep -cE 'curl.*POST.*addUser.*userName' specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (其中含 userName 的: expect 2 — 全部 addUser body 改 camelCase；psql 'WHERE username=' 為 DB column 保留不算)"

echo "=== status: 'enabled' → '1' in addUser/updateUser body ==="
grep -cE '"status":"enabled"' specs/045-facade-atomicity-pass/contracts/verification-commands.md || true
echo "  (expect 0 in body shape positions、留 access_key body 可能仍含)"

echo ""
echo "=== 2d updateUser HTTP verb PUT → POST ==="
grep -cE "PUT.*systemManage/updateUser" specs/045-facade-atomicity-pass/contracts/verification-commands.md || true
echo "  (expect 0)"
grep -cE "POST.*systemManage/updateUser" specs/045-facade-atomicity-pass/contracts/verification-commands.md
echo "  (expect ≥2)"

echo "=== 2d updateUser URL 無 path param ==="
grep -cE "/systemManage/updateUser/\\\$USER_DID" specs/045-facade-atomicity-pass/contracts/verification-commands.md || true
echo "  (expect 0)"
```

**Expected**：5 sub 全 PASS（舊 stale pattern 0、新對齊 pattern 命中）。

---

## C-V4：US3 — sys_authorization_service.rs println cleanup

對應 SC-004、FR-007。

```bash
echo "=== 0 production println! ==="
grep -cE "println!" rust-api/server/service/src/admin/sys_authorization_service.rs || true
echo "  (expect 0)"

echo ""
echo "=== ≥3 tracing::debug! structured field ==="
grep -cE "tracing::debug!" rust-api/server/service/src/admin/sys_authorization_service.rs
echo "  (expect ≥3)"

echo ""
echo "=== structured field key 命名對齊 ==="
grep -cE "\?existing_permissions|\?new_policies|\?existing_policies" rust-api/server/service/src/admin/sys_authorization_service.rs
echo "  (expect ≥3 — 3 個 Debug-formatter field key)"
```

**Expected**：0 production `println!`、≥3 `tracing::debug!`、3 個 structured field key 命中。

---

## C-V5：US4 — audit_pipeline helper + 12 ignored test 改寫

對應 SC-005、FR-008/009/010。

```bash
echo "=== helper file 存在 + signature ==="
test -f rust-api/server/model/tests/common/audit_pipeline.rs && echo "PASS file exists" || echo "FAIL"
grep -nE "pub async fn wait_for_audit_row|pub async fn wait_for_audit_count" rust-api/server/model/tests/common/audit_pipeline.rs

echo ""
echo "=== common/mod.rs 暴 helper ==="
grep -nE "pub mod audit_pipeline" rust-api/server/model/tests/common/mod.rs
echo "  (expect 1)"

echo ""
echo "=== 4 test file 改用 helper（僅 polling-needs 測試）==="
for f in audit_basics audit_http_middleware audit_transaction_rollback soft_delete_audit_integration; do
    HITS=$(grep -cE "wait_for_audit_row|wait_for_audit_count" rust-api/server/model/tests/$f.rs || true)
    echo "  $f.rs: $HITS helper call"
done
echo "  (expect: audit_basics 2 + audit_http_middleware 3 + audit_transaction_rollback 0 + soft_delete_audit_integration 1 = 合計 ≥6)"

echo ""
echo "=== #[ignore] 註解全更新為 'requires dev stack drainer running' ==="
for f in audit_basics audit_http_middleware audit_transaction_rollback soft_delete_audit_integration; do
    HITS=$(grep -cE 'ignore = "requires dev stack drainer running' rust-api/server/model/tests/$f.rs || true)
    echo "  $f.rs: $HITS hits"
done
echo "  (expect total ≥12 — 12 個 #[ignore] 標註全改、含不需 drainer 的純單測 / absence 測試)"
```

**Expected**：helper file 存在 + 2 fn signature 命中；mod.rs `pub mod audit_pipeline` 1 hit；4 file 合計 ≥6 helper call（**僅 polling-needs 測試 migrate**：audit_basics 2 + audit_http_middleware 3 + soft_delete_audit_integration 1；audit_transaction_rollback 2 個 absence-assertion 測試 + audit_basics 3 個 audit_snapshot 純單測**保留原 query pattern 不動**、helper 對「assert 不出現」/ 純 in-memory 函式無語意）；12 個 `#[ignore]` 註解全改新文（不論是否依賴 drainer、保持註解一致）。

---

## C-V6：US4 — `cargo test --ignored` 12/12 PASS（manual）

對應 SC-006、FR-008/010。

```bash
echo "=== dev stack drainer 跑著 ==="
$PC ps --format "{{.Service}}: {{.Status}}" | grep -E "rust-api|postgres|redis"
echo "(expect 三者 Up healthy)"

echo ""
echo "=== set TEST_DATABASE_URL + 跑 4 test file ==="
export TEST_DATABASE_URL="postgres://soybean:soybean@127.0.0.1:15432/soybean_admin_rust"
cd rust-api
for f in audit_basics audit_http_middleware audit_transaction_rollback soft_delete_audit_integration; do
    echo "--- cargo test --test $f -- --ignored ---"
    cargo test --test $f -- --ignored --nocapture 2>&1 | tail -8
    echo ""
done
cd ..
```

**Expected**：4 file 合計輸出 `test result: ok. 12 passed; 0 failed`；平均 test 跑時間 < 500ms timeout budget（個別 test 跑 < 200ms 預期、helper poll 50ms × 1-4 round）。

**troubleshoot**：若 timeout 撞牆 → 排查 (a) dev stack drainer 是否 healthy / (b) `drainer_sleep_interval_ms` 是否 > 50ms / (c) postgres connection / TEST_DATABASE_URL 是否正確設好。

---

## C-V7：US5 — docker-compose footer comment

對應 SC-007、FR-011。

```bash
echo "=== 舊 '8 service stack' 0 hit ==="
grep -cE "^# 8 service stack" docker-compose.yml || true
echo "  (expect 0)"

echo ""
echo "=== 主 stack 8 + obs overlay 7 = 12 service 描述 ==="
grep -cE "主 stack 8 service|12 service|observability\.yml" docker-compose.yml
echo "  (expect ≥2 — 含主 stack 描述 + observability 提及)"
```

**Expected**：原 `# 8 service stack:` 0 hit；新註解含「主 stack 8」+ observability.yml 引用 + dev 12 service 合計。

---

## C-V8：FR-012/013/014 boundary + INTEGRATION-CHECKLIST cleanup verify

對應 SC-008、SC-009、FR-012/013/014。

```bash
echo "=== FR-012: 0 base-web 改動 ==="
git diff --stat base-web/ 2>&1 | head -5
echo "(expect 0 line change in base-web/)"
(cd base-web && git log --oneline rev1-admin-base-web -3)
echo "(expect HEAD 與 045 同、未變)"

echo ""
echo "=== FR-013: 0 新 migration ==="
find rust-api/migration/src -name "*.rs" -newer specs/046-spec-hygiene-pass-3/spec.md 2>/dev/null
echo "(expect empty)"

echo "=== FR-013: 0 新 application entity ==="
find rust-api/server/model/src/admin/entities -name "sys_*.rs" -newer specs/046-spec-hygiene-pass-3/spec.md 2>/dev/null
echo "(expect empty)"

echo "=== FR-013: 0 新 workspace cargo dep ==="
git diff rust-api/Cargo.toml 2>&1 | head -10
echo "(expect 0 line change in [workspace.dependencies])"

echo ""
echo "=== FR-014: INTEGRATION-CHECKLIST 3 row 移 + 046 entry ==="
for row in "045-N2" "044-N1" "042-N1"; do
    HITS=$(grep -cE "^\| $row " docs/INTEGRATION-CHECKLIST.md || true)
    [ "$HITS" = "0" ] && echo "PASS: $row 已移除" || echo "FAIL: $row 殘留 ($HITS hits)"
done
grep -c "046 spec-hygiene-pass-3" docs/INTEGRATION-CHECKLIST.md
echo "  (expect ≥1 — 046 milestone entry 就位)"

echo ""
echo "=== FR-014: 下一步 update ==="
grep -cE "047 sandbox-protect-route-fix" docs/INTEGRATION-CHECKLIST.md
echo "  (expect ≥1 — 下一步指向 047)"
```

**Expected**：base-web 0 diff、0 migration、0 新 entity、0 dep 改動；3 row 全移、046 entry + 047 提及全命中。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer 跑著 | SC-001 | infra baseline |
| C-V2 | 045 data-model.md §E1.2 2 處 erratum | SC-002、FR-001/002 | US1 |
| C-V3 | 045 contracts/verification-commands.md 5 處對齊 | SC-003、FR-003/004/005/006 | US2 |
| C-V4 | sys_authorization_service.rs production println cleanup | SC-004、FR-007 | US3 |
| C-V5 | audit_pipeline helper + 12 ignored test 改用 | SC-005、FR-008/009/010 | US4 |
| C-V6 | cargo test --ignored 12/12 PASS（manual）| SC-006、FR-008/010 | US4 MVP |
| C-V7 | docker-compose footer comment | SC-007、FR-011 | US5 |
| C-V8 | FR-012/013/014 boundary + INTEGRATION-CHECKLIST cleanup | SC-008、SC-009、FR-012/013/014 | scope discipline + docs |

C-V1~C-V8 全 PASS = acceptance PASS、ready for outer + worktree 多段 commit + merge。
