# Quickstart: F1.1 — jwt-secrets

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**目的**：實際 verify F1.1 在本機跑通的最小步驟集；對應 SC-001 ~ SC-011 共 11 個成功指標

---

## 前置（一次性）

```bash
# 在 outer repo 內、確認 feature branch
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current   # 預期：004-jwt-secrets

# 確認 worktree 狀態 clean
git submodule status        # 預期：rust-api 行首空格（SHA 對齊）

# 工具確認
openssl version              # 用於產 32-byte secret
```

---

## Step 1 — application.yaml 內 placeholder 確認（SC-008）

```bash
cd rust-api
grep '"change-me-jwt-secret"' server/resources/application.yaml
# 預期：1 hit、值在 PLACEHOLDER_SECRETS 黑名單內

grep 'soybean-admin-rust' server/resources/application-test.yaml
# 預期：0 hit（F1.1 已改為 32-char dev secret）

ls -la server/resources/application.yaml.example
# 預期：file 存在、含 deployment template
```

**Pass 條件 (SC-008)**：placeholder 在 application.yaml、test yaml 用 32-char dev secret、example template 存在。

---

## Step 2 — 無 env override 觸發 boot panic（SC-005）

```bash
cd rust-api
unset APP_JWT_JWT_SECRET
unset APP_JWT_JWT_SECRET_FILE

cargo run --bin server 2>&1 | tail -10
# 預期：boot panic、error msg 含 "placeholder" + 值 "change-me-jwt-secret" + 修正建議
#       `openssl rand -hex 32`；server 不啟動、exit code != 0
```

**Pass 條件 (SC-005)**：placeholder 命中 → boot panic with friendly error msg.

---

## Step 3 — bare envvar 提供合規 secret（SC-006）

```bash
export APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"   # 64-char hex = 32 bytes
echo "Set APP_JWT_JWT_SECRET length: ${#APP_JWT_JWT_SECRET}"  # 預期：64

cargo run --bin server &
sleep 5
# 預期：server 成功 boot、無 panic；listening on host:port

# verify token generation 可運作
curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | jq -r '.data.token'
# 預期：JWT token string

# cleanup
kill %1 2>/dev/null
unset APP_JWT_JWT_SECRET
```

**Pass 條件 (SC-006)**：bare envvar real secret → boot 成功 + token 簽得出來。

---

## Step 4 — `_FILE` pattern（SC-007）

```bash
echo -n "$(openssl rand -hex 32)" > /tmp/jwt_secret
chmod 0444 /tmp/jwt_secret   # read-only 模擬 Docker secret mount

export APP_JWT_JWT_SECRET_FILE="/tmp/jwt_secret"
unset APP_JWT_JWT_SECRET

cargo run --bin server &
sleep 5
# 預期：server 成功 boot；jwt_secret 從 file 載入

curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | jq -r '.data.token'
# 預期：JWT token string

# cleanup
kill %1 2>/dev/null
unset APP_JWT_JWT_SECRET_FILE
rm /tmp/jwt_secret
```

**Pass 條件 (SC-007 part 1)**：`_FILE` pattern → boot 成功。

### Step 4b — `_FILE` precedence over bare envvar（SC-007 part 2）

```bash
echo -n "$(openssl rand -hex 32)" > /tmp/jwt_secret
export APP_JWT_JWT_SECRET_FILE="/tmp/jwt_secret"
export APP_JWT_JWT_SECRET="change-me-jwt-secret"   # 故意設 placeholder

cargo run --bin server &
sleep 5
# 預期：boot 成功（_FILE 覆寫 bare、validation 用 _FILE 內容過）

kill %1 2>/dev/null
unset APP_JWT_JWT_SECRET_FILE APP_JWT_JWT_SECRET
rm /tmp/jwt_secret
```

**Pass 條件 (SC-007 part 2)**：_FILE 優先、bare envvar placeholder 被 ignore、boot 成功。

---

## Step 5 — `_FILE` 指向不存在 file → boot panic（FR-008）

```bash
export APP_JWT_JWT_SECRET_FILE="/nonexistent/path/xyz"
cargo run --bin server 2>&1 | tail -10
# 預期：boot panic、error msg 含 file path "/nonexistent/path/xyz" + IO error +
#       "check Docker secrets mount / file permissions" hint
unset APP_JWT_JWT_SECRET_FILE
```

**Pass 條件 (FR-008)**：`_FILE` read failure → boot panic with friendly error msg.

---

## Step 6 — `_FILE` 內容違反 validation（FR-009 + Scenario 9）

```bash
echo "soybean-admin-rust" > /tmp/jwt_bad   # 寫 placeholder 進 file
export APP_JWT_JWT_SECRET_FILE="/tmp/jwt_bad"

cargo run --bin server 2>&1 | tail -10
# 預期：boot panic、error msg 含 "placeholder" + 值 "soybean-admin-rust" + 修正建議
#       （即使從 _FILE 讀的也經過 strict validation）

unset APP_JWT_JWT_SECRET_FILE
rm /tmp/jwt_bad
```

**Pass 條件 (FR-009)**：`_FILE` 讀出的 secret 仍經過 strict validation、無 source-based 豁免。

---

## Step 7 — unit test 跑通（SC-001 ~ SC-004）

```bash
cd rust-api
cargo test -p server-config jwt_secret_validation 2>&1 | tail -10
# 預期：N 個 unit test 全 pass
#   - validate_empty_secret_panics
#   - validate_placeholder_secret_panics (x N for each blacklist value)
#   - validate_short_secret_panics
#   - validate_valid_secret_ok
#   - file_loader_reads_trimmed_content
#   - file_loader_panics_on_missing_file
#   - file_envvar_precedence_over_bare
```

**Pass 條件 (SC-001 ~ SC-004)**：所有 unit test 綠燈。

---

## Step 8 — F3 既有 acceptance test 仍 pass（SC-009）

```bash
cd rust-api
export TEST_DATABASE_URL=postgresql://postgres:123456@127.0.0.1:5432/new_admin_test

cargo test --test soft_delete_basics -- --ignored 2>&1 | tail -5
cargo test --test soft_delete_audit_integration -- --ignored 2>&1 | tail -5
cargo test --test soft_delete_auth_gate -- --ignored 2>&1 | tail -5
# 預期：F3 既有 9 個 #[ignore] test 全 pass（F1.1 不改 JWT 簽驗 path、F3 G9 FR-028 layer 仍存在）
```

**Pass 條件 (SC-009)**：F3 既有 acceptance test 在 F1.1 後仍 pass、backward compat 成立。

---

## Step 9 — claim contract doc + cargo check（SC-010 + SC-011）

```bash
ls -la specs/004-jwt-secrets/contracts/claim-contract.md
# 預期：file 存在
grep -c '^| \`' specs/004-jwt-secrets/contracts/claim-contract.md
# 預期：>= 11（11 fields table rows）

cd rust-api
cargo check 2>&1 | tail -5
# 預期：Finished `dev` profile (...) - 0 errors / 0 warnings
```

**Pass 條件 (SC-010 + SC-011)**：claim-contract.md 存在 + cargo check 全 workspace 通過。

---

## Step 10 — Integration boot test（auto verify）

```bash
cd rust-api
cargo test --test jwt_boot_integration 2>&1 | tail -10
# 預期：boot integration test 全 pass
#   - boot_panics_on_placeholder_secret_in_yaml
#   - boot_succeeds_with_env_override
#   - boot_succeeds_with_file_envvar
```

**Pass 條件**：boot integration test 全綠。

---

## 失敗排查指南

| 症狀 | 可能原因 | 排查 |
|---|---|---|
| Step 2 沒 panic、boot 成功 | `application.yaml` jwt_secret 未改 placeholder | psql `\d` 或 cat yaml 確認；F1.1 spec FR-010 未實作 |
| Step 2 panic 但訊息無 "placeholder" 字樣 | `validate_jwt_secret` 順序不對（length check 先於 placeholder check）| 看 `secret_loader.rs` rule 順序、調整 |
| Step 3 boot fail | env override 未被 envy 載入 | `echo $APP_JWT_JWT_SECRET` 確認 export；envvar prefix `APP_JWT_` + field name `jwt_secret` → 自動 `APP_JWT_JWT_SECRET`（double JWT 是 envy 行為）|
| Step 4 boot fail | `_FILE` 沒讀到、走 fallback bare/yaml | 確認 `cat /tmp/jwt_secret` 有內容；確認 `APP_JWT_JWT_SECRET_FILE` 已 export |
| Step 4b precedence 沒生效 | `load_secret_from_file_if_set` 沒 callsite or 順序錯 | 看 `config_init.rs` 內 `_FILE` override 是否在 validate 之前 |
| Step 5 panic 但無 file path 字樣 | panic msg 沒含 path | 看 `load_secret_from_file_if_set` error path 寫法 |
| Step 6 _FILE placeholder 通過 validation | secret 從 _FILE 路徑跳過 validation | 確認 `validate_jwt_secret` 是在 `_FILE override` 之後呼叫 |
| Step 7 unit test compile fail | secret_loader 模組未 pub mod | 看 `server/config/src/lib.rs` |
| Step 8 F3 test fail | F1.1 不慎改了 JWT 簽驗 path / Claims struct | grep `JwtUtils` / `Claims` diff、確認 F1.1 不動 |

---

**完成 verifier 標準**：Step 1-10 全部 Pass = F1.1 達成 SC-001 ~ SC-011 全 11 個 measurable outcome。
