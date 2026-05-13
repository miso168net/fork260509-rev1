# Quickstart: F4 — response-shape-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**目的**：實際 verify F4 在本機跑通的最小步驟集；對應 SC-001 / SC-002 / SC-003 三大成功指標

---

## 前置（一次性）

```bash
# 在 outer repo 內、確認 feature branch
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current   # 預期：001-response-shape-alignment

# 確認 worktree 狀態 clean
git submodule status        # 預期：base-web 與 rust-api 行首皆空格（SHA 對齊）

# 確認 postgres + redis 跑著（CLAUDE.md §5.2 / DESIGN-W §6.1）
docker compose ps           # 或視當前 deploy/ 狀態
```

---

## Step 1 — 啟動 rust-api（本機 dev）

```bash
cd rust-api
cargo run --bin server   # 預設 listen :10001（per application.yaml）
# 預期啟動 log："Server listening on 0.0.0.0:10001"
```

> **rev1 提議的 port 11081 尚未套用**（per CLAUDE.md §5.2「目前現況」）— 維持 :10001 即可，F4 不涉 port 改動。

---

## Step 2 — 驗證 SC-001（HTTP 200 規則）

隨機抽 5 個 endpoint curl 驗證、**全 200**：

```bash
# 抽樣 1：login（成功 path）
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}'
# 預期：200

# 抽樣 2：login（失敗 path — 故意錯帳號）
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"NotExist","password":"wrong"}'
# 預期：200（業務失敗、HTTP 仍 200、body 含 code 4001/6001）

# 抽樣 3：getUserInfo（無 token → middleware error）
curl -s -o /dev/null -w "%{http_code}\n" \
  http://127.0.0.1:10001/api/auth/getUserInfo
# 預期：200（per FR-021、body 含 code 5001/9999）

# 抽樣 4 + 5：其他 admin endpoint 隨機抽
```

**Pass 條件**：5 個 endpoint HTTP status 全 200。

---

## Step 3 — 驗證 SC-002（login flow round-trip）

### 3a. 取 token

```bash
TOKEN_BLOB=$(curl -s -X POST http://127.0.0.1:10001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}')

echo "$TOKEN_BLOB" | jq .
# 預期 JSON：
# {
#   "code": 0,
#   "data": { "token": "eyJ...", "refreshToken": "eyJ..." },
#   "msg": "success",
#   "success": true
# }
```

**Pass 條件**：
- `code == 0`
- `data.token` 為非空 string
- `data.refreshToken` 為非空 string（**注意 camelCase 命名，非 `refresh_token`**）
- `success == true`

### 3b. 啟動 base-web 跑 UI

```bash
cd base-web
pnpm install              # 第一次
pnpm dev                  # 啟動 dev server（預設 :9527）
```

開瀏覽器 → `http://127.0.0.1:9527` → 輸入帳密 `Soybean / 123456` → 點登入

**Pass 條件**：
- base 進入 home view（首頁渲染成功）
- 開 DevTools console → **無 `onBackendFail` 警告**
- 開 DevTools Network 看 `/api/auth/login` response → JSON 同 3a

---

## Step 4 — 驗證 SC-003（getUserInfo 對齊）

### 4a. curl 取 userInfo

```bash
TOKEN=$(echo "$TOKEN_BLOB" | jq -r '.data.token')

curl -s http://127.0.0.1:10001/api/auth/getUserInfo \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Pass 條件**：

```json
{
  "code": 0,
  "data": {
    "userId": "<uuid 字串>",
    "userName": "Soybean",
    "roles": ["R_SUPER"],
    "buttons": []
  },
  "msg": "success",
  "success": true
}
```

- `data` 物件**剛好 4 個 key**：`userId / userName / roles / buttons`（無多無少）
- `roles` 為 JSON array
- `buttons` 為 JSON array（F4 階段為 `[]`）
- 所有 key 為 camelCase（無 snake_case）

### 4b. JSON shape 對照 TS interface

```bash
# 在 base-web 內檢查 TS interface
cat base-web/src/typings/api/auth.d.ts | grep -A 5 "interface UserInfo"
```

對照 curl 結果 — **欄位數、欄位名、型別三維度全對齊**。

---

## Step 5 — 驗證 SC-004（無 snake_case 漏網）

```bash
# 跑 base + rust 全流程後，dump 一段 admin endpoint response 看是否含 snake_case
curl -s http://127.0.0.1:10001/api/auth/getUserInfo \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json,re; \
                data=json.load(sys.stdin); \
                txt=json.dumps(data); \
                m=re.findall(r'\"[a-z]+_[a-z]+\"', txt); \
                print(f'snake_case keys found: {len(m)}'); \
                [print(' ',k) for k in m]"
# 預期：snake_case keys found: 0
```

抽樣 5 個 endpoint 重複此檢查、全 0 即 pass。

---

## Step 6 — 驗證 SC-005 / SC-006 / SC-007（cargo test + grep）

```bash
cd rust-api

# SC-005: 跑 11 個 acceptance test scenarios
cargo test --test response_shape_alignment   # 預期：11 個 case 全 pass

# SC-006: 確認無 magic number
grep -rn 'Res::new_error\([0-9]' server --include='*.rs' | wc -l
# 預期：0（所有 error 都用 code:: 常數）

# SC-007: 4 群業務 code 各至少 1 test case
grep -rn 'CODE_VALIDATION\|CODE_PERMISSION\|CODE_BUSINESS\|CODE_SERVER' \
     server/tests --include='*.rs' | wc -l
# 預期：>= 4
```

---

## 失敗排查指南

| 症狀 | 可能原因 | 排查 |
|---|---|---|
| 3a curl 回 `"refresh_token"`（snake） | `AuthOutput` 未加 `rename_all = "camelCase"` | 看 `rust-api/server/model/src/admin/output/sys_authentication.rs` |
| 3b base console 有 `onBackendFail` | rust 仍回 `code: 200` 不是 `0` | 看 `rust-api/server/core/src/web/res.rs` 5 處 success path |
| 4a `data` 缺 `buttons` | `UserInfoOutput` 未補 `buttons: Vec<String>` field | 同上檔 |
| 4a 多了 `password` / `created_at` 等欄位 | UserInfoOutput shape 漏控（非 4 欄位剛好） | 同上、需個別 audit |
| Step 2 抽樣到的 endpoint 回 401/403/500 | middleware 未經 `IntoResponse` 轉 envelope | 看 `api_key_middleware.rs` / `web/auth.rs` / `web/error.rs` |
| `cargo test` 編譯失敗 cite `code::` | `mod.rs` 未加 `pub mod code;` | 看 `rust-api/server/core/src/web/mod.rs` |

---

**完成 verifier 標準**：Step 2-6 全部 Pass = F4 達成 SC-001 ~ SC-007 全 7 個 measurable outcome。
