# Quickstart: F5.1 — auth-login-and-dynamic-menu

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-15
**目的**：實際 verify F5.1 在本機跑通的最小步驟集；對應 SC-001 ~ SC-011 共 11 個成功指標

---

## 前置（一次性）

```bash
# 在 outer repo 內、確認 feature branch
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current   # 預期：005-auth-login-and-dynamic-menu

# 確認 worktree 狀態 clean
git submodule status        # 預期：rust-api 行首空格（SHA 對齊）

# DB 起動 + migration 套用（用於 acceptance test）
# 假設 postgres host 127.0.0.1:5432 + user soybean + db soybean_admin_rust（rev1 dev 配置）
export TEST_DATABASE_URL="postgresql://soybean:soybean@123.@127.0.0.1:5432/soybean_admin_rust"
cd rust-api
cargo run -p migration   # 套 schema + datas
```

---

## Step 1 — Endpoint path align grep verify（SC-001 + SC-002）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
grep -n '/auth/getUserRoutes' server/router/src/admin/sys_authentication_route.rs
# 預期：0 hit（既有舊 path 已刪除）

grep -n '/getUserRoutes' server/router/src/admin/sys_menu_route.rs
# 預期：≥1 hit（新 path 已 mount 在 /route 內）

grep -rn 'SysAuthenticationApi::get_user_routes' server/router/src/admin/
# 預期：1 hit 在 sys_menu_route.rs（handler 引用、router 內）
```

**Pass 條件 (SC-001 + SC-002)**：grep 對齊預期。

---

## Step 2 — Unit test 跑通（SC-003）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
cargo test -p server-service --test auth_login_shapes 2>&1 | tail -15
# 預期：N 個 unit test 全 pass
#   - auth_output_serde_camelcase
#   - user_info_output_serde_camelcase
#   - user_route_serde_camelcase
#   - menu_route_route_meta_serde_camelcase
#   - tree_builder_empty
#   - tree_builder_single
#   - tree_builder_multi_level
#   - find_first_valid_route_*
```

**Pass 條件 (SC-003)**：所有 unit test 綠燈。

---

## Step 3 — Integration test 跑通（SC-004）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
cargo test -p server-initialize --test login_handler_integration 2>&1 | tail -15
# 預期：2-3 個 integration test 全 pass
#   - login_handler_returns_auth_output_envelope
#   - jwt_auth_middleware_rejects_missing_token
#   - casbin_envelope_adapter_converts_403_to_envelope
```

**Pass 條件 (SC-004)**：integration test 全綠（驗 Casbin envelope adapter 行為對齊）。

---

## Step 4 — Acceptance test 跑通（SC-005 + SC-008 + SC-009 + SC-010）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
export TEST_DATABASE_URL=postgresql://soybean:soybean@123.@127.0.0.1:5432/soybean_admin_rust
cargo test -p server-service --test auth_login_e2e -- --ignored 2>&1 | tail -20
# 預期：3 個 acceptance test fn 全 pass
#   - login_succeeds_returns_token_and_refresh (Soybean / 123456)
#     + verify sys_operation_log row login_succeeded、payload grep password 0 hit
#   - get_user_info_returns_user_with_roles (用 token 跨)
#   - get_user_routes_returns_tree_with_home (3 user 各自不同 menu tree)
```

**Pass 條件 (SC-005 + SC-008 + SC-009 + SC-010)**：3 acceptance test 全綠 + audit row 寫入 + payload redaction verify。

---

## Step 5 — F3 既有 acceptance test 仍 pass（SC-006）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
cargo test --test soft_delete_basics -- --ignored 2>&1 | tail -5
cargo test --test soft_delete_audit_integration -- --ignored 2>&1 | tail -5
cargo test --test soft_delete_auth_gate -- --ignored 2>&1 | tail -5
# 預期：F3 既有 9 個 #[ignore] test 全 pass
```

**Pass 條件 (SC-006)**：F3 既有 acceptance test 在 F5.1 後仍 pass、backward compat 成立。

---

## Step 6 — cargo check 全 workspace pass（SC-011）

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
cargo check --workspace 2>&1 | tail -5
# 預期：Finished `dev` profile (...) - 0 errors / 0 warnings 由 F5.1 引入
```

**Pass 條件 (SC-011)**：cargo check 全 workspace 通過、無 F5.1 引入新 warning。

---

## Step 7 — 完整 deploy stack e2e curl（SC-007）

> 注：Step 7 依賴 `deploy/` 建後完整 stack（postgres + redis + rust-api release build + base-web）；rev1 階段 deploy/ 尚未建、留 user verify。

### Step 7a — 起 rust-api server

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api
export APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"
cargo run --release --bin server &
sleep 5
# 預期：server boot 成功、listening on 0.0.0.0:10001
```

### Step 7b — login

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | jq -r '.data.token')
echo "Token: $TOKEN"
# 預期：JWT token string、envelope code=0
```

### Step 7c — getUserInfo

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:10001/api/auth/getUserInfo | jq '.'
# 預期：envelope {code:0, msg:"success", data:{userId, userName, roles, buttons:[]}}
```

### Step 7d — getUserRoutes

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:10001/api/route/getUserRoutes | jq '.'
# 預期：envelope {code:0, msg:"success", data:{routes:[...], home:"/home"}}
```

### Step 7e — getConstantRoutes（public）

```bash
curl -s http://127.0.0.1:10001/api/route/getConstantRoutes | jq '.'
# 預期：envelope {code:0, data:[...constant routes]}
```

### Step 7f — Casbin reject envelope（用 假 role / 缺 policy）

```bash
# 用無 policy 的 endpoint or 構造假 token role
# 略：tasks 階段量化具體 verify 方式
# 預期：envelope {code:5001, msg:"您没有访问该资源的权限...", data:null}
```

### Step 7g — base-web login + dynamic menu

```bash
# 假設 base-web 已 build + serve on http://127.0.0.1:11080
# 開瀏覽器 http://127.0.0.1:11080/_builtin/login
# 輸 Soybean / 123456
# 預期：登入後跳 home page、看到 menu tree
```

```bash
# cleanup
kill %1 2>/dev/null
unset APP_JWT_JWT_SECRET
```

**Pass 條件 (SC-007)**：Step 7a-g 全步驟 OK。

---

## Step 8 — Payload password redaction DB verify（補強 SC-008）

```bash
# 假設 DB 已 connected
psql "$TEST_DATABASE_URL" -c "
  SELECT payload_after FROM sys_operation_log
  WHERE operation = 'login_succeeded'
  ORDER BY created_at DESC LIMIT 1;
" | grep -i password
# 預期：0 hit（payload 不含 plaintext password）
```

**Pass 條件**：DB grep verify 通過、確認 F2.1 redaction trait 工作。

---

## 失敗排查指南

| 症狀 | 可能原因 | 排查 |
|---|---|---|
| Step 1 grep 1 hit 在 sys_authentication_route.rs | 舊 path 未刪 | 看 sys_authentication_route.rs:20、刪除既有 `.route("/getUserRoutes", ...)` line |
| Step 1 grep 0 hit 在 sys_menu_route.rs | 新 path 未 mount | 看 sys_menu_route.rs init_protected_menu_router、加 `.route("/getUserRoutes", get(SysAuthenticationApi::get_user_routes))` |
| Step 3 integration test fail `casbin_envelope_adapter_*` | adapter 未 wire 或 body fragment match 不對 | 看 router_initialization.rs apply_layers 內 `.layer(from_fn(casbin_envelope_adapter))` + casbin_envelope_adapter.rs body fragment 對照 |
| Step 4 acceptance test fail login_succeeds | DB 未 migrate / 預設 user 不存在 / password hash 不對 | psql 確認 `SELECT * FROM sys_user WHERE username='Soybean'`、確認 hashed password 與 `123456` argon2id match |
| Step 4 acceptance test fail get_user_routes | sys_role_menu 缺 seed | 看 migration `datas/*` 是否有 3 user × role × menu policy；若缺、F5.1 補 minimum migration |
| Step 4 acceptance test fail payload_after grep password 1+ hit | F2.1 redaction trait 未套用 / LoginInput 直接 serialize | 看 auth_event_handler.rs LoginSucceeded struct、確認無 password field；或加 AuditSerialize impl redact password |
| Step 5 F3 acceptance test fail | F5.1 不慎改了 軟刪 / audit middleware path | grep `jwt_auth_middleware` / `sys_user::find_active` diff、確認 F3 G9 layer 不動 |
| Step 7 server fail to boot | F1.1 secret validation panic / DB connection fail / migration 未套 | 看 stderr panic msg、確認 env var + DB ready + migration 套用 |
| Step 7 curl 401/403 plain text 而非 envelope | adapter 未 wire / wire 順序錯 | 看 router_initialization.rs `apply_layers` middleware order |

---

**完成 verifier 標準**：Step 1-8 全部 Pass = F5.1 達成 SC-001 ~ SC-011 全 11 個 measurable outcome。Step 7 依 deploy/ 建立後完整 verify、Step 1-6 + Step 8 為 F5.1 acceptance baseline。
