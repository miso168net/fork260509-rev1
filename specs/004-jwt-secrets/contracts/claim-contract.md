# JWT Claims Contract — F1.1

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](../spec.md) §Key Entities + spec FR-013 / FR-014

> F1.1 **不**改 `Claims` struct（per spec FR-014、backward compat 既有 token）。本檔僅作為 reference doc、明示 11 fields 用途 + F1.2 / F10 future extensions reserved。

---

## Source

`rust-api/server/core/src/web/auth.rs`（既有、F4 + F3 G9 已 layer FR-028 軟刪 user check）：

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    sub: String,
    exp: Option<usize>,
    iss: Option<String>,
    aud: String,
    iat: Option<usize>,
    nbf: Option<usize>,
    jti: Option<String>,
    username: String,
    role: Vec<String>,
    domain: String,
    org: Option<String>,
}
```

---

## Standard claims (per RFC 7519)

| Claim | Type | Set by | 用途 | RFC reference |
|---|---|---|---|---|
| `sub` | `String` | login flow（`sys_auth_service::pwd_login`）| user_id（ULID）— Subject identifies the user | RFC 7519 §4.1.2 |
| `exp` | `Option<usize>` | `JwtUtils::generate_token`（per `JwtConfig::expire`）| 過期 timestamp（unix epoch seconds、now + expire 秒）| RFC 7519 §4.1.4 |
| `iss` | `Option<String>` | `JwtUtils::generate_token`（per `JwtConfig::issuer`）| issuer URL（環境配 envvar `APP_JWT_ISSUER`）| RFC 7519 §4.1.1 |
| `aud` | `String` | login flow | audience（e.g. `"ManagementPlatform"`、由 router 區分）| RFC 7519 §4.1.3 |
| `iat` | `Option<usize>` | `JwtUtils::generate_token` | issued at timestamp（unix epoch seconds、now）| RFC 7519 §4.1.6 |
| `nbf` | `Option<usize>` | `JwtUtils::generate_token` | not before timestamp（= iat、可選提早或同 iat）| RFC 7519 §4.1.5 |
| `jti` | `Option<String>` | `JwtUtils::generate_token` | JWT ID（ULID 防重放）| RFC 7519 §4.1.7 |

---

## Custom claims

| Claim | Type | Set by | 用途 |
|---|---|---|---|
| `username` | `String` | login flow | user 顯示名（非 user_id；rev1 admin / soybean 等）|
| `role` | `Vec<String>` | login flow | user role 列表（per Casbin enforce + RBAC routing 計算）|
| `domain` | `String` | login flow | user domain（multi-tenant context、`"default"` / `"built-in"` etc.）|
| `org` | `Option<String>` | login flow | user organization（optional、per sys_organization tree）|

---

## Validation rules (既有、F1.1 不動)

`JwtUtils::validate_token` 透過 `jsonwebtoken::decode<Claims>` 走：

1. **Signature**：HS256 + `Keys::decoding`（per F1.1 strict-validated jwt_secret）
2. **`exp`**：自動 check（per `jsonwebtoken::Validation` 預設 + 60 秒 leeway）
3. **`iss`**：自動 check（per `validation.set_issuer(&[jwt_config.issuer])`）
4. **`aud`**：自動 check（per `validation.set_audience(&[audience])` 在 caller 傳入）
5. **`nbf`**：自動 check（per jsonwebtoken Validation 預設）

F3 G9 既有 additional check：
6. **軟刪 user**：JWT 驗證通過後、注入 User extension 之前、跑 `sys_user::find_active().filter(Id.eq(user_id)).one(db)`；None → envelope 8888 `LOGOUT_SESSION_INVALIDATED`（per F3 spec FR-028 + clarify Q3）

F1.1 對 validation rules **完全不動**（per spec FR-018）。

---

## F1.2 / F10 future extensions reserved

下列 fields 在 F1.1 階段 **預留命名 + 用途**、F1.1 **不**加實作；F1.2 / F10 階段擴 Claims struct 時用此命名以避免分歧：

### `token_type: String`（→ F10 refresh-token-bridge）

- 用途：區分 access token vs refresh token
- 預設值：`"access"`（rev1 現階段所有 token 都是 access）
- F10 階段：加 `"refresh"` variant、refresh handler enforce `token_type == "refresh"`
- 對 F1.1 backward compat：serde Deserialize `#[serde(default = "default_token_type")]` 或 `Option<String>` wrapper、舊 token 缺欄位視為 `"access"`

### `kid` (header field)（→ F1.2 key versioning）

- 用途：multi-key rotation 時 key id 識別（per RFC 7515 §4.1.4 JWS Header Parameter）
- 預設：F1.1 / F1.2 之前無 `kid`
- F1.2 階段：`Header::new(Algorithm::HS256)` → `Header::new(Algorithm::RS256)` 加 `header.kid = Some(key_id)`、decode 時依 kid 選對應 key
- 對 F1.1 backward compat：F1.2 升級時、舊 token 無 kid → 用 fallback key（last key without kid）

### `family_id: String`（→ F10 refresh token rotation chain）

- 用途：refresh token rotation chain 標識（per OWASP refresh token rotation pattern）
- 預設：F1.1 階段無此 field
- F10 階段：refresh token 同 family_id 視為同一 chain；舊 refresh token 被 use 後 family revoke（防 stolen token replay）
- 對 F1.1 backward compat：F10 加 field 不破壞 F1.1 既有 access token

---

## Contract guarantees（F1.1）

- F1.1 完成後 `Claims` struct 結構**等同既有**（11 fields、無新增 / 刪除 / rename）
- 既有 deployed token（同 jwt_secret 簽的）F1.1 後仍可解（per FR-018 + spec Edge Case「既有 deployed token backward compat」）
- F1.2 / F10 加 future extensions 時、F1.1 spec 不需 patch（claim-contract.md future extensions section 已 reserved）

---

**結論**：F1.1 spec FR-013 的 contract doc 落地、F1.4 / F10 階段不需重新 brainstorming claim 命名 / 用途。
