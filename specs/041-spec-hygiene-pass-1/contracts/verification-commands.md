# Verification Commands — 041 spec-hygiene-pass-1

**Phase**: 1（Design & Contracts）
**日期**：2026-05-24

11 個 C-V contract = 本 feature 的 verification scenarios。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack**。psql 經 `docker compose exec -T postgres`。endpoint 經 front-nginx `:11080`。預設帳號 `Soybean`/`123456`、`Administrator`/`123456`、`GeneralUser`/`123456`。`PC = docker compose -f docker-compose.yml -f docker-compose.dev.yml`。

`TOKEN` 取得（後續 C-V 復用）：
```bash
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
echo "Token len=${#TOKEN}"
```

---

## C-V1: rust-api build clean（NormalizePathLayer 加入後）

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -10
```
**Expected**：build exit 0、無 unused import warning、無 new clippy 違規。對應 SC-005。

---

## C-V2: regression — `/api/user?page=1` 仍 HTTP 200

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:11080/api/user?page=1&size=10"
```
**Expected**：`HTTP 200`。對應 FR-008 regression。

---

## C-V3: fix — `/api/user/?page=1` 從 404 → HTTP 200

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:11080/api/user/?page=1&size=10"
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:11080/api/user/?page=1&size=10" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'code={r[\"code\"]} records={len(r[\"data\"][\"records\"])}')"
```
**Expected**：`HTTP 200`、envelope `code=0`、records 為非空陣列。對應 SC-002。

---

## C-V4: fix — `/api/role/?page=1` 從 404 → HTTP 200

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:11080/api/role/?page=1&size=10"
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:11080/api/role/?page=1&size=10" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'code={r[\"code\"]} records={len(r[\"data\"][\"records\"])}')"
```
**Expected**：`HTTP 200`、envelope `code=0`、records 為非空陣列。對應 SC-002。

---

## C-V5: 跨 router scope verify — admin / auth / authorization 全涵蓋（per Clarifications 2026-05-24）

```bash
echo "=== admin 類（注：menu router 實 mount 在 /route、非 /menu、per grep init_protected_menu_router）==="
for path in "/api/route/" "/api/domain/" "/api/api-endpoint/"; do
  printf "%-30s " "$path"
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080$path"
done

echo "=== auth 類 ==="
printf "%-30s " "/api/auth/getUserInfo/"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/auth/getUserInfo/"

echo "=== authorization 類 ==="
printf "%-30s " "/api/authorization/assign-users/ (POST、空 body 預期 422)"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:11080/api/authorization/assign-users/"
```
**Expected**：admin 類全 `HTTP 200`、auth `HTTP 200`、authorization POST 為 `HTTP 200` 含業務 envelope（422 / 400 / 0 視 body validation；**不為 404**）。對應 SC-003、FR-009。

---

## C-V6: Casbin enforce 在 normalized path 上仍正常（trailing-slash 無權限繞過）

```bash
GENERAL_TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"GeneralUser","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "=== GeneralUser 對 admin 端點 trailing-slash request ==="
curl -fsS -H "Authorization: Bearer $GENERAL_TOKEN" \
  "http://127.0.0.1:11080/api/role/?page=1" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'code={r[\"code\"]} success={r[\"success\"]} msg={r.get(\"msg\",\"\")[:50]}')"

echo "=== GeneralUser 對同 endpoint 無 trailing-slash request（對照組） ==="
curl -fsS -H "Authorization: Bearer $GENERAL_TOKEN" \
  "http://127.0.0.1:11080/api/role?page=1" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'code={r[\"code\"]} success={r[\"success\"]}')"
```
**Expected**：兩 request 皆 envelope `code=5001 success=false`（Casbin enforce 一致拒絕）。對應 SC-004、FR-009。

---

## C-V7: grep 確認 7 處 spec md edit 後舊字串清乾淨

```bash
echo "=== ① 030 C-V8/9: 期望 0 hit ==="
grep -E "username|gender" specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md \
  | grep -E '"username"|"gender"' || echo "  (clean)"

echo "=== ② 039 C-V31: 期望出現 currentPassword 並含完整 curl block ==="
grep -E "currentPassword|oldPassword" specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md

echo "=== ③ 040 C-V10/12: 期望 0 hit ==="
grep -E "/api/(role|user)/list" specs/040-wire-id-consistency/contracts/verification-commands.md || echo "  (clean)"

echo "=== ④ 022 C-V3: 期望「hardcode None」「hardcode vec![]」描述消失或被 errata 覆蓋 ==="
grep -E "hardcode (None|vec!\\[\\])" specs/022-manage-crud-alignment/contracts/verification-commands.md

echo "=== ⑤ 021 C-V10: 期望主命令無 trailing slash ==="
grep -E "GET /user/ |GET /role/ " specs/021-systemmanage-alias-router/contracts/verification-commands.md || echo "  (clean，已改 no-slash 或保留 with errata)"

echo "=== ⑥ 021 C-V2: 期望「20 row」改「≥20 row」 ==="
grep -E "20 row|COUNT = 20" specs/021-systemmanage-alias-router/contracts/verification-commands.md

echo "=== ⑦ 002 §E4 path: 期望指向 server/model/src/admin/soft_delete_impls.rs ==="
grep -n "soft_delete_impls\|server/core/src/db/soft_delete.rs" specs/002-soft-delete-infrastructure/data-model.md
```
**Expected**：①③⑤ 為 0 hit 或只剩 errata 行；②含 `currentPassword`、無 `oldPassword`；④⑥ 為 errata 行覆蓋；⑦顯示 `soft_delete_impls.rs` 路徑。對應 SC-006。

---

## C-V8: 重跑 2026-05-24 regression 受影響 C-V—— 預期 PASS

執行受影響的 6 條 C-V（030 C-V8/9、039 C-V31、040 C-V10/12、022 C-V3、021 C-V2/C-V10）：

```bash
echo "=== 030 C-V8: addUser camelCase ==="
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/addUser" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"userName":"CV041Test","userGender":"1","nickName":"041Test","status":"1"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'addUser code={r[\"code\"]}')"
${PC:-docker compose -f docker-compose.yml -f docker-compose.dev.yml} exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT username, gender FROM sys_user WHERE username='CV041Test';"

echo "=== 030 C-V9: updateUser gender male→female ==="
# updateUser DTO `id` 為 i64 (=sys_user.display_id、F8/039 後 wire id 格式)、非 ULID。
# 取 display_id 並不加引號傳數字（per 030 C-V9 errata 041 擴展第7項）。
GTID=$(${PC:-docker compose -f docker-compose.yml -f docker-compose.dev.yml} exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT display_id FROM sys_user WHERE username='CV041Test';" | tr -d ' \r\n')
curl -fsS -X POST "http://127.0.0.1:11080/api/systemManage/updateUser" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"id\":$GTID,\"userName\":\"CV041Test\",\"userGender\":\"2\",\"nickName\":\"041Test\",\"status\":\"1\"}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'updateUser code={r[\"code\"]}')"

echo "=== 039 C-V31: changePassword currentPassword（用 Administrator、需 role 不能用 CV041Test）==="
# 注：addUser 建的 CV041Test 預設無 role 賦予、被 casbin `/auth/changePassword` rule（ROLE_SUPER/ADMIN/USER）拒 401。
# 用 Administrator（既有 admin user、有 ROLE_ADMIN role）測 + 立即 revert 避免污染。
ADMIN_TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Administrator","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -fsS -X POST "http://127.0.0.1:11080/api/auth/changePassword" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"123456","newPassword":"new_pwd_041_temp"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'changePassword code={r[\"code\"]}')"
# revert：用新密碼登入、改回 123456
ADMIN_TOKEN_NEW=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Administrator","password":"new_pwd_041_temp"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -fsS -X POST "http://127.0.0.1:11080/api/auth/changePassword" \
  -H "Authorization: Bearer $ADMIN_TOKEN_NEW" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"new_pwd_041_temp","newPassword":"123456"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'revert code={r[\"code\"]}')"

echo "=== 040 C-V10: /api/role paginated ==="
curl -fsS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/role?current=1&size=10" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'role list code={r[\"code\"]} records={len(r[\"data\"][\"records\"])}')"

echo "=== 040 C-V12: /api/user paginated ==="
curl -fsS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/user?current=1&size=10" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'user list code={r[\"code\"]} records={len(r[\"data\"][\"records\"])}')"

echo "=== 022 C-V3c: getUserList userGender 為實值或 null ==="
curl -fsS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/systemManage/getUserList?current=1&size=10" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
first = r['data']['records'][0]
print(f'userName={first[\"userName\"]} userGender={first[\"userGender\"]} userRoles={first.get(\"userRoles\")}')"

echo "=== 021 C-V2: casbin row 數 ≥20 ==="
${PC:-docker compose -f docker-compose.yml -f docker-compose.dev.yml} exec -T postgres psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT COUNT(*) FROM casbin_rule WHERE v2 LIKE '/systemManage/%';"

echo "=== 021 C-V10a/b: /user 與 /role no-slash form（regression）==="
for path in "/api/user?page=1&size=10" "/api/role?page=1&size=10"; do
  printf "%-40s " "$path"
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080$path"
done
```

**Expected**：
- 030 C-V8/C-V9：addUser/updateUser envelope `code=0`、DB `gender` 變更（male/female）。
- 039 C-V31：changePassword envelope `code=0`、新密碼可登入（implementer 自驗）。
- 040 C-V10/C-V12：list envelope `code=0` + records 非空。
- 022 C-V3c：`userGender` 為 `"1"`/`"2"`/`null`（非「全 null」）、`userRoles` 為 array（非空）。
- 021 C-V2：count ≥ 20（實測 ~50）。
- 021 C-V10a/b：兩 path 皆 HTTP 200。

對應 SC-001。**Cleanup**：測完 `DELETE FROM sys_user WHERE username='CV041Test';` 清測試 user。

---

## C-V9: F3-N5 修正後、§E4 範例 path 與實際 impl 位置一致

```bash
echo "=== 抓 §E4 範例 comment 行 ==="
grep -n -B1 -A2 "soft_delete_impls\|server/core/src/db/soft_delete" specs/002-soft-delete-infrastructure/data-model.md

echo "=== 驗實際 impl 位置 ==="
test -f rust-api/server/model/src/admin/soft_delete_impls.rs && echo "  ✓ soft_delete_impls.rs exists"
test -f rust-api/server/core/src/db/soft_delete.rs && echo "  ✓ soft_delete.rs (trait def 處) exists"
grep -c "^impl SoftDeletable" rust-api/server/model/src/admin/soft_delete_impls.rs
grep -c "^impl SoftDeletable" rust-api/server/core/src/db/soft_delete.rs
```
**Expected**：§E4 範例 comment 指向 `soft_delete_impls.rs`；該檔含 7 個 `impl SoftDeletable` block；`soft_delete.rs` 含 0 個 impl block（trait def only）。對應 SC-006 / FR-007 / US3。

---

## C-V10: 三邊 scope verify（zero-regression）

```bash
echo "=== base-web 0 改動 ==="
(cd base-web && git diff HEAD --stat)

echo "=== rust-api 改動限 2 檔（Cargo.toml feature flag + main.rs wrap）==="
(cd rust-api && git diff HEAD --stat)

echo "=== outer 改動 ==="
git diff HEAD --stat
```
**Expected**：
- base-web 0 diff。
- rust-api 限 2 檔：`server/initialize/Cargo.toml`（加 `normalize-path` feature）+ `server/bin/src/main.rs`（wrap NormalizePathLayer）。
- outer 改動限 6 處 spec md + `docs/INTEGRATION-CHECKLIST.md`（移除 R4、F3-N5、加 041 entry）+ submodule SHA pin。

對應 FR-010、SC-007。

---

## C-V11: post-merge backlog 清理（FR-012）

```bash
grep -E "R4 |F3-N5 " docs/INTEGRATION-CHECKLIST.md
grep -c "041 spec-hygiene-pass-1" docs/INTEGRATION-CHECKLIST.md
```
**Expected**：
- R4 / F3-N5 兩 row 不再出現於「衍生 follow-up」table（grep 0 hit 或只剩歷史說明）。
- 「已完成里程碑」加 1 行 041 entry（grep ≥ 1 hit）。

對應 SC-008。

---

## Summary table

| C-V | Goal | 對應 FR / SC |
|---|---|---|
| C-V1 | rust-api build clean | SC-005 |
| C-V2 | `/api/user?page` regression HTTP 200 | FR-008 |
| C-V3 | `/api/user/?page` 從 404 → 200 | SC-002 |
| C-V4 | `/api/role/?page` 從 404 → 200 | SC-002 |
| C-V5 | 跨 router scope（admin/auth/authorization）trailing-slash 一致 | SC-003 / FR-009 |
| C-V6 | Casbin enforce 在 normalized path 上不繞過 | SC-004 / FR-009 |
| C-V7 | 7 處 spec md edit 後 grep 確認 | SC-006 / FR-001–007 |
| C-V8 | 重跑 6 條受影響 regression C-V | SC-001 |
| C-V9 | F3-N5 §E4 path 對齊實 impl | FR-007 / US3 |
| C-V10 | 三邊 scope verify（base-web 0 / rust-api 2 / outer 6+1+SHA）| FR-010 / SC-007 |
| C-V11 | post-merge backlog 清理 | FR-012 / SC-008 |

C-V1 ~ C-V11 全 PASS = acceptance PASS、ready for 兩段式 commit（rust-api 第一段 + outer 第二段、per CLAUDE.md §4.1）。
