# Data Model: F4 — response-shape-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) §Key Entities + [`research.md`](./research.md) R1-R7

> F4 不涉 DB schema 改動。本檔範圍僅限 **wire-level response data model**（rust serialize → JSON → base parse）。

---

## E1. `Res<T>` Response Envelope

**Source**: `rust-api/server/core/src/web/res.rs`（既有、4 欄位已齊全）

### Schema

```rust
#[derive(Debug, Serialize, Default)]
pub struct Res<T> {
    pub code: u16,       // business code（見 E2）
    pub data: Option<T>, // 業務 payload；error 時為 None → serialize 成 JSON `null` 或省略
    pub msg: String,     // 訊息（success 預設 "success"；error 含具體描述、全英文 per R3）
    pub success: bool,   // code == 0 為 true、否則 false（既有 method 已正確設定）
}
```

### JSON 輸出範例

| 情境 | JSON |
|---|---|
| Success (data) | `{"code":0,"data":{...},"msg":"success","success":true}` |
| Success (message-only) | `{"code":0,"data":null,"msg":"operation completed","success":true}` |
| Error (validation) | `{"code":4001,"data":null,"msg":"field 'email' is required","success":false}` |
| Error (logout) | `{"code":8889,"data":null,"msg":"credential rotated","success":false}` |
| Error (expired token) | `{"code":9999,"data":null,"msg":"access token expired","success":false}` |

### Validation Rules

- `code` MUST 為 §E2「Business code namespace」表中 23 條之一（FR-005、SC-006）
- `success` MUST 反映 `code == 0`（既有 method enforce、handler 不直接設定）
- `msg` 全英文（per R3 decision、convention 不 enforce by code、由 review + sample test 守護）

### State Transitions

N/A — `Res<T>` 為單次 response、無 lifecycle。

---

## E2. Business Code Namespace（23 條）

**Source**: spec.md §Key Entities + [`research.md`](./research.md) R2 命名規範

### 常數定義（將寫入 `rust-api/server/core/src/web/code.rs`）

```rust
// Success (1 條)
pub const CODE_SUCCESS: u16 = 0;

// Logout (2 條) — base 既有
pub const CODE_LOGOUT_SESSION_INVALIDATED: u16 = 8888;
pub const CODE_LOGOUT_CREDENTIAL_ROTATED: u16 = 8889;

// Modal Logout (2 條) — base 既有
pub const CODE_MODAL_LOGOUT_CONCURRENT_LOGIN: u16 = 7777;
pub const CODE_MODAL_LOGOUT_ACCOUNT_SUSPENDED: u16 = 7778;

// Expired Token (3 條) — base 既有
pub const CODE_EXPIRED_ACCESS_TOKEN: u16 = 9999;
pub const CODE_EXPIRED_REFRESH_TOKEN: u16 = 9998;
pub const CODE_EXPIRED_TOKEN_SIGNATURE: u16 = 3333;

// Validation (3 條) — rust 新
pub const CODE_VALIDATION_REQUIRED_FIELD: u16 = 4001;
pub const CODE_VALIDATION_FORMAT_INVALID: u16 = 4002;
pub const CODE_VALIDATION_CONSTRAINT_VIOLATED: u16 = 4003;

// Permission (4 條) — rust 新
pub const CODE_PERMISSION_CASBIN_DENY: u16 = 5001;
pub const CODE_PERMISSION_ROLE_INSUFFICIENT: u16 = 5002;
pub const CODE_PERMISSION_API_KEY_MISSING: u16 = 5003;
pub const CODE_PERMISSION_API_KEY_SIGNATURE_INVALID: u16 = 5004;

// Business (4 條) — rust 新
pub const CODE_BUSINESS_ENTITY_NOT_FOUND: u16 = 6001;
pub const CODE_BUSINESS_DUPLICATE_VIOLATION: u16 = 6002;
pub const CODE_BUSINESS_STATE_CONFLICT: u16 = 6003;
pub const CODE_BUSINESS_DEPENDENCY_MISSING: u16 = 6004;

// Server (5 條) — rust 新
pub const CODE_SERVER_DB_ERROR: u16 = 9001;
pub const CODE_SERVER_CACHE_ERROR: u16 = 9002;
pub const CODE_SERVER_EXTERNAL_SERVICE_ERROR: u16 = 9003;
pub const CODE_SERVER_CONFIGURATION_ERROR: u16 = 9004;
pub const CODE_SERVER_INTERNAL_ERROR: u16 = 9005;
```

### Base `.env` 4 個 list 對應

base `.env` 內 4 個 code list（per FR-019/020）：

| `.env` key | base 既有值 | F4 改動 |
|---|---|---|
| `VITE_SERVICE_SUCCESS_CODE` | `0000` | **`0`**（FR-019、唯一改動點） |
| `VITE_SERVICE_LOGOUT_CODES` | `8888,8889` | 不變 |
| `VITE_SERVICE_MODAL_LOGOUT_CODES` | `7777,7778` | 不變 |
| `VITE_SERVICE_EXPIRED_TOKEN_CODES` | `9999,9998,3333` | 不變 |

**4xxx / 5xxx / 6xxx / 9xxx 群均不在 base list 內** — 走 base default error handler 顯示 `msg`（per FR-009 設計守則）。

---

## E3. `AuthOutput`（login response data）

**Source**: `rust-api/server/model/src/admin/output/sys_authentication.rs:5-11`（既有、需改）

### Current shape (rust)
```rust
#[derive(Clone, Debug, Serialize)]
pub struct AuthOutput {
    pub token: String,
    pub refresh_token: String,   // ← 無 rename、JSON 輸出 snake_case
}
```

### Target shape (F4)
```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]   // ← 新增
pub struct AuthOutput {
    pub token: String,
    pub refresh_token: String,        // ← 自動序列化為 "refreshToken"
}
```

### JSON 對齊 base TS `Api.Auth.LoginToken`

```ts
// base-web/src/typings/api/auth.d.ts:8-11（既有、不動）
interface LoginToken {
  token: string;
  refreshToken: string;
}
```

**對齊驗證**：rust `{token, refreshToken}` ↔ base `{ token, refreshToken }` ✓

---

## E4. `UserInfoOutput`（getUserInfo response data）

**Source**: `rust-api/server/model/src/admin/output/sys_authentication.rs:13-20`（既有、需大幅改）

### Current shape (rust)
```rust
#[derive(Debug, Serialize)]
pub struct UserInfoOutput {
    #[serde(rename = "userId")]      // ← 移除
    pub user_id: String,
    #[serde(rename = "userName")]    // ← 移除
    pub user_name: String,
    pub roles: Vec<String>,
    // ← 缺 buttons
}
```

### Target shape (F4)
```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]    // ← 新增
pub struct UserInfoOutput {
    pub user_id: String,               // → "userId"
    pub user_name: String,             // → "userName"
    pub roles: Vec<String>,
    pub buttons: Vec<String>,          // ← 新增（F4 階段預設 `Vec::new()` = JSON `[]`）
}
```

### JSON 對齊 base TS `Api.Auth.UserInfo`

```ts
// base-web/src/typings/api/auth.d.ts:13-18（既有、不動）
interface UserInfo {
  userId: string;
  userName: string;
  roles: string[];
  buttons: string[];
}
```

**對齊驗證**：rust `{userId, userName, roles, buttons}` ↔ base 4 欄位 ✓
**`buttons` 內容來源**：F4 階段 `Vec::new()`、實際 RBAC 內容留 F7+（per FR-017 + Assumption）

---

## E5. Rename Convention Pattern

**Source**: spec.md FR-010 ~ FR-014 + [`research.md`](./research.md) R5

### Pattern A — struct-level rename_all（**F4 預設**）

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SomeOutput {
    pub field_one: String,    // → "fieldOne"
    pub field_two: Vec<Sub>,  // → "fieldTwo"；Sub 必須各自有 rename_all
}
```

**適用**：所有 input / output / nested struct（FR-010、FR-014）

### Pattern B — per-field rename（**保留場景**：enum variant、非 camelCase 改名）

```rust
// 保留範例：enum variant 改外觀
#[derive(Serialize, Deserialize)]
pub enum UserStatus {
    #[serde(rename = "banned")]    // 改 variant value
    Banned,
    #[serde(rename = "disabled")]
    Disabled,
}

// 保留範例：非 camelCase 目標 case（罕見、需 plan 個別合理化）
#[derive(Serialize)]
pub struct LegacyDto {
    #[serde(rename = "PascalCase")]
    pub field_name: String,
}
```

**不適用 F4 改動**：(a) `redis_config.rs` enum variant 2 處、(b) `sea_orm_active_enums.rs` enum variant 5 處 — 全部保留

### Pattern C — Collection 欄位 MUST `Vec<T>`（FR-012）

```rust
// ✅ 對：空集合 serialize 為 []
pub struct Output {
    pub items: Vec<String>,           // 空時 JSON 為 []
}

// ❌ 錯：Option<Vec<T>>::None 序列化為 null
pub struct Output {
    pub items: Option<Vec<String>>,   // None 時 JSON 為 null（與 base TS `string[]` 不符）
}
```

---

## E6. 影響檔案清單（plan 階段已確認 / `/speckit-tasks` 待 audit）

### 已確認影響（plan 階段 audit 結果）

| 檔案 | 改動類型 | 行/數量 |
|---|---|---|
| `rust-api/server/core/src/web/code.rs` | **NEW** | 新增 ~30 行 (23 const + module doc) |
| `rust-api/server/core/src/web/mod.rs` | MODIFY | 加 `pub mod code;` 1 行 |
| `rust-api/server/core/src/web/res.rs` | MODIFY | 5 處 `StatusCode::OK.as_u16()` → `code::CODE_SUCCESS` |
| `rust-api/server/core/src/web/auth.rs:126` | MODIFY | `StatusCode::UNAUTHORIZED.as_u16()` → 對應 code 常數 |
| `rust-api/server/core/src/web/error.rs` | MODIFY | refactor 用新 code 常數（細節 `/speckit-tasks` 確認） |
| `rust-api/server/core/src/sign/api_key_middleware.rs:129,133` | MODIFY | 401/400 → 5003/5004 |
| `rust-api/server/model/src/admin/output/sys_authentication.rs` | MODIFY | AuthOutput 加 rename_all；UserInfoOutput 改 rename_all + 補 `buttons` |
| `rust-api/server/model/src/admin/output/sys_menu.rs` | MODIFY | 移除 6 處 per-field rename camelCase、加 struct-level |
| `base-web/.env` | MODIFY | `VITE_SERVICE_SUCCESS_CODE=0000` → `=0` |

### `/speckit-tasks` 階段待 audit

| 範圍 | 預期數量 | 方法 |
|---|---|---|
| `rust-api/server/model/src/admin/output/*.rs` 其他檔 | ~10-15 個 struct | grep `derive(.*Serialize)` 內無 rename_all 者 |
| `rust-api/server/model/src/admin/input/*.rs` 其他檔 | ~10-15 個 struct | 同上 |
| `rust-api/server/model/src/admin/entities/*.rs` 直接 return | ~3-5 個 entity | grep handler 內 `Res<.*Entity>` / `Res<Vec<.*Entity>>` / `Res<PaginatedData<.*Entity>>` |
| `rust-api/server/api/` handler 內 `Res::new_error(<magic>)` | ~10-30 處 | grep `Res::new_error\(` + 逐個對應 code 常數 |
