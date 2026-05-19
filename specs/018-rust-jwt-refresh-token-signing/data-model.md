# Data Model: F10.1 — rust-jwt-refresh-token-signing

**Date**: 2026-05-19
**Status**: Phase 1 Design

> F10.1 不引入新 DB entity、不改 schema。本檔聚焦於 **rust in-process data structure** 改動(struct + enum + global state)+ `sys_tokens` row 寫入內容差異。

---

## §E1 — `RefreshClaims` struct(新)

**File**: `rust-api/server/core/src/web/jwt.rs`(新加)、近 既有 `Claims` struct(目前在 `auth.rs`、F10.1 加 RefreshClaims 也可放同處或拉到 jwt.rs)

**Fields**(6 個、per spec FR-002 + clarify Q1 拍板極簡):

| Field | Type | JWT std claim | 來源 | 必填? |
|---|---|---|---|---|
| `sub` | `String` | ✓(subject)| `user_id` from `generate_auth_output()` 參數 | required at construction |
| `exp` | `Option<usize>` | ✓(expiration unix ts)| `Utc::now() + jwt_config.refresh_expire`(setter 填)| deferred(setter)|
| `iss` | `Option<String>` | ✓(issuer)| `jwt_config.issuer` 字串(setter 填)| deferred |
| `iat` | `Option<usize>` | ✓(issued at unix ts)| `Utc::now()` timestamp(setter 填)| deferred |
| `nbf` | `Option<usize>` | ✓(not before unix ts)| 同 `iat`(setter 填)| deferred |
| `jti` | `Option<String>` | ✓(JWT ID)| `Ulid::new().to_string()`(setter 填、26 char)| deferred |

**Derive**: `#[derive(Debug, Serialize, Deserialize, Clone)]`

**Constructor**:
```rust
pub fn new(sub: String) -> Self {
    Self { sub, exp: None, iss: None, iat: None, nbf: None, jti: None }
}
```

**Setter methods**(per R-Q6 mirror Claims pattern):
- `set_exp(&mut self, exp: usize)`
- `set_iss(&mut self, iss: String)`
- `set_iat(&mut self, iat: usize)`
- `set_nbf(&mut self, nbf: usize)`
- `set_jti(&mut self, jti: String)`

**不含 fields**(per clarify Q2):
- ❌ `aud`(nestjs verify 不用、refresh token 不需 audience claim)
- ❌ `username` / `role` / `domain` / `org`(refresh token 不攜 authorization payload、minimum security 紀律)

**Relationship**:
- `RefreshClaims` ↔ `Claims`(既有 access token claim 結構):兩者不繼承、不轉換、各自獨立。`generate_refresh_token` 與 `generate_token` 並行 method、各用對應 claim struct。

---

## §E2 — `JwtConfig` struct(改)

**File**: `rust-api/server/config/src/model/jwt_config.rs`(既有、改)

**Before(F1.1 結束 state)**:
```rust
#[derive(Deserialize, Debug, Clone)]
pub struct JwtConfig {
    pub jwt_secret: String,
    pub issuer: String,
    pub expire: i64,
}
```

**After(F10.1 結束 state、+2 field)**:
```rust
#[derive(Deserialize, Debug, Clone)]
pub struct JwtConfig {
    pub jwt_secret: String,        // 既有、access token 簽用
    pub refresh_secret: String,    // F10.1 新加、refresh token 簽用、空檔 fallback jwt_secret(clarify Q1)
    pub issuer: String,            // 既有、access + refresh 共用 iss
    pub expire: i64,               // 既有、access token exp(秒)
    pub refresh_expire: i64,       // F10.1 新加、refresh token exp(秒、預設 7200 對齊 nestjs)
}
```

**Envvar 對應**:

| Field | yaml key | bare envvar | _FILE envvar(production)|
|---|---|---|---|
| `jwt_secret` | `jwt.jwt_secret` | `APP_JWT_JWT_SECRET` | `APP_JWT_JWT_SECRET_FILE` |
| `refresh_secret`(F10.1)| `jwt.refresh_secret` | `APP_JWT_REFRESH_SECRET` | `APP_JWT_REFRESH_SECRET_FILE` |
| `issuer` | `jwt.issuer` | `APP_JWT_ISSUER` | — |
| `expire` | `jwt.expire` | `APP_JWT_EXPIRE` | — |
| `refresh_expire`(F10.1)| `jwt.refresh_expire` | `APP_JWT_REFRESH_EXPIRE` | — |

**Precedence chain**(per F1.1):`_FILE > bare envvar > yaml`

**F10.1 empty-file fallback**(per clarify Q1、在 `apply_jwt_secret_hardening` 內處理):
- `APP_JWT_REFRESH_SECRET_FILE` 指向 empty file(trim 後)→ effective `refresh_secret` = `jwt_secret` value(clone)
- `APP_JWT_REFRESH_SECRET_FILE` 指向 non-empty file → effective `refresh_secret` = file 內容
- 無 `_FILE` 但 `APP_JWT_REFRESH_SECRET` 設 → 用 bare envvar value
- 無 `_FILE` 無 bare envvar → 用 yaml default(prod 應觸 `validate_jwt_secret` panic 因 placeholder)

---

## §E3 — `Keys` struct(既有)+ `REFRESH_KEYS` global(新)

**File**: `rust-api/server/global/src/global.rs`(既有、可能加 global)or new file `refresh_keys.rs`(per project layout)

**Reuse**:`Keys` struct(既有、含 `encoding: EncodingKey` + `decoding: DecodingKey`)— F10.1 **不新建 struct**。

**New global**:
```rust
pub static REFRESH_KEYS: OnceCell<Arc<Mutex<Keys>>> = OnceCell::const_new();
```

**Init pattern**(per R-Q1 separate decision):
```rust
// 既有 init_keys()
pub async fn init_keys(jwt_config: &JwtConfig) -> Result<(), Error> {
    let keys = Keys::new(jwt_config.jwt_secret.as_bytes());
    KEYS.set(Arc::new(Mutex::new(keys))).map_err(...)
}

// F10.1 新加 init_refresh_keys() — 緊接 init_keys() call
pub async fn init_refresh_keys(jwt_config: &JwtConfig) -> Result<(), Error> {
    let keys = Keys::new(jwt_config.refresh_secret.as_bytes());
    REFRESH_KEYS.set(Arc::new(Mutex::new(keys))).map_err(...)
}
```

**Callsite**(bootstrap、可能在 main.rs / lib.rs):
```rust
// 既有
init_keys(&jwt_config).await?;
// F10.1 新加
init_refresh_keys(&jwt_config).await?;
```

---

## §E4 — `JwtUtils::generate_refresh_token` method(新)

**File**: `rust-api/server/core/src/web/jwt.rs`(既有 `JwtUtils` impl 加 method)

**Signature**:
```rust
pub async fn generate_refresh_token(user_id: String) -> Result<String, JwtError> {
    let keys_arc = global::REFRESH_KEYS.get().ok_or(JwtError::KeysNotInitialized)?;
    let keys = keys_arc.lock().await;

    let now = Utc::now();
    let timestamp = now.timestamp() as usize;
    let jwt_config = global::get_config::<JwtConfig>().await.unwrap();

    let mut claims = RefreshClaims::new(user_id);
    claims.set_exp((now + Duration::seconds(jwt_config.refresh_expire)).timestamp() as usize);
    claims.set_iss(jwt_config.issuer.to_string());
    claims.set_iat(timestamp);
    claims.set_nbf(timestamp);
    claims.set_jti(Ulid::new().to_string());

    encode(&Header::default(), &claims, &keys.encoding)
        .map_err(|e| JwtError::TokenCreationError(e.to_string()))
}
```

**Mirror `generate_token`**:相同結構、不同 secret(REFRESH_KEYS)+ 不同 exp(`refresh_expire`)+ 不同 claim struct(RefreshClaims)。

**No `send_string_event` side effect**:既有 `generate_token` 有 `global::send_string_event(tok.clone())` for audit/observe;F10.1 `generate_refresh_token` 同樣加(對齊 access token wiring、不破壞既有 audit hook 行為)。**Actually**:per Phase 1 review, 是否需要 send_string_event 對 refresh token 留 plan 階段 implementation 階段決(屬 implementation detail);本 data-model 不強制。

---

## §E5 — `sys_tokens` table row 寫入差異

**File**: `rust-api/migration/src/schemas/m20241023_091204_create_sys_tokens.rs`(F10.1 **不動**、per FR-008、OOS-003)

**Schema unchanged**(per W-FA1 acceptance、F10 baseline):
- 16 column、含 `id`(Ulid 26 char)/ `username`(String)/ `refresh_token`(String、column type unchanged)/ `status`(String、SCREAMING_SNAKE_CASE)/ `created_at` 等。

**Write content 差異**(F10 vs F10.1):

| Column | F10(baseline)| F10.1(after fix)|
|---|---|---|
| `id` | Ulid 26 char | Ulid 26 char(同)|
| `username` | `"Soybean"` | 同 |
| `status` | `"ACTIVE"`(SCREAMING_SNAKE_CASE)| **同**(R-7 不修、F10.2 才修)|
| `refresh_token` | **Ulid 26 char 純字串**(R-8 source)| **HS256 JWT ~150 char + 含 2 個 `.`**(R-8 修)|
| `created_at` | timestamp | 同 |
| 其他 11 column | 不變 | 不變 |

**Write callsite**(per F5.1):`AccessTokenEvent::handle()`(`rust-api/server/service/src/admin/events/access_token_event.rs`)— F10.1 **不動 event handler**、只動 `generate_auth_output` 返回的 `AuthOutput.refresh_token` 內容、event handler 仍 transparent 寫入。

---

## §E6 — `AuthOutput` struct(既有)

**File**: `rust-api/server/service/src/admin/sys_auth_service.rs`(struct 不動、欄位語義 reinterpret)

```rust
pub struct AuthOutput {
    pub token: String,         // Access token JWT(既有、F10.1 不改)
    pub refresh_token: String, // Refresh token: F10 Ulid 26 char → F10.1 HS256 JWT ~150 char
}
```

**Field type 不變、語意改**:F10.1 後 `refresh_token` 仍是 `String`、但內容從 Ulid plaintext 變 JWT 三段 base64url 字串。

---

## §E7 — Entity relationships(F10.1 in-process)

```
generate_auth_output(user_id, ...)
    ├─ generate_token(claims) → access_token JWT          [既有、不動]
    └─ generate_refresh_token(user_id) [F10.1 新]
         │
         ├─ RefreshClaims::new(user_id)                    [F10.1 §E1]
         ├─ set_exp(refresh_expire) / set_iss / set_iat / set_nbf / set_jti
         ├─ global::REFRESH_KEYS.get()                     [F10.1 §E3]
         └─ encode(Header::default(), &claims, &keys.encoding) → JWT String

AuthOutput { token, refresh_token } [§E6, refresh_token 內容變]
    │
    └─ event::AccessTokenEvent::handle() writes sys_tokens row [既有、F5.1 提供]
         └─ refresh_token column: from Ulid 26 char → JWT ~150 char [§E5 diff]
```

---

## §E8 — State transitions

F10.1 **不引入新 state transition**。既有 sys_tokens.status enum 仍為 `"ACTIVE"` / `"REFRESHED"` / `"REVOKED"`(F10.2 修對齊 nestjs `"unused"` / `"used"`、F10.1 不動)。

---

## §E9 — Validation rules

F10.1 新增 validation:
- `refresh_secret` 經 `validate_jwt_secret(&jwt.refresh_secret)`(per F1.1、複用既有 fn)— 拒 placeholder `change-me-*`、確保 entropy 足夠。
- `refresh_expire` 沒額外 validate(範圍 i64 > 0)— 若有需要可在 plan 階段加。
