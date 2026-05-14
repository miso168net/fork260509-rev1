# Data Model: F1.1 — jwt-secrets

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) §Key Entities + [`research.md`](./research.md) R1-R6

> F1.1 涉及純 Rust function + module 新增、resources files 修改、無 DB schema 改動、無 Rust struct 改動（Claims 不動於 F1.1）。

---

## E1. `secret_loader` 新模組（NEW）

### 檔案 path

`rust-api/server/config/src/secret_loader.rs`（NEW）

### 內容範式

```rust
//! F1.1 jwt-secrets — strict secret validation + _FILE pattern loader。
//!
//! 集中放：
//! - `PLACEHOLDER_SECRETS` 黑名單
//! - `load_secret_from_file_if_set(base_envvar)` 讀 `<envvar>_FILE` content
//! - `validate_jwt_secret(&secret)` 對 3 條 rule 跑 panic-on-fail validation
//!
//! per F1.1 spec FR-001~009 + data-model.md §E1。

use std::env;
use std::fs;

/// 已知 placeholder secret values — 任一命中就 panic
pub const PLACEHOLDER_SECRETS: &[&str] = &[
    "soybean-admin-rust",      // 既有 yaml hardcoded fake、F1.1 改後仍可能在舊 deploy
    "change-me",
    "change-me-jwt-secret",    // F1.1 後 application.yaml default
    "your-secret-here",
    "PLACEHOLDER",
    "TODO",
];

/// 從 `<base_envvar>_FILE` 環境變數指向的 file 讀 secret content。
///
/// - `_FILE` env var 未 set → 返 None（caller 走 bare envvar / yaml path）
/// - `_FILE` set + file 讀成功 → trim 後返 Some(content)
/// - `_FILE` set 但 read 失敗（不存在 / permission denied / dir） → panic
///
/// per spec FR-005 + FR-008。
pub fn load_secret_from_file_if_set(base_envvar: &str) -> Option<String> {
    let file_envvar = format!("{}_FILE", base_envvar);
    match env::var(&file_envvar) {
        Ok(path) => {
            match fs::read_to_string(&path) {
                Ok(content) => Some(content.trim().to_string()),
                Err(e) => panic!(
                    "F1.1: {} = '{}' read failed: {}\n\
                     Fix: check Docker secrets mount (mode 0444, owner uid={{appuser uid}}) or file path correctness",
                    file_envvar, path, e
                ),
            }
        }
        Err(_) => None,
    }
}

/// 對 jwt_secret 跑 strict validation：empty / placeholder / length < 32。
///
/// 失敗時 panic with friendly error message（含 source label + 修正建議）。
///
/// per spec FR-001 ~ FR-004。
pub fn validate_jwt_secret(secret: &str) {
    if secret.is_empty() {
        panic!(
            "F1.1: jwt_secret resolved to empty value.\n\
             Sources checked (in precedence order):\n\
               1. APP_JWT_JWT_SECRET_FILE (file path)\n\
               2. APP_JWT_JWT_SECRET (bare envvar)\n\
               3. application.yaml jwt.jwt_secret (yaml default)\n\
             Fix: generate via `openssl rand -hex 32` + set APP_JWT_JWT_SECRET or APP_JWT_JWT_SECRET_FILE"
        );
    }
    if PLACEHOLDER_SECRETS.contains(&secret) {
        panic!(
            "F1.1: jwt_secret = '{}' is a known placeholder (not a real secret).\n\
             Placeholders blacklist: {:?}\n\
             Fix: generate via `openssl rand -hex 32` + set APP_JWT_JWT_SECRET or APP_JWT_JWT_SECRET_FILE",
            secret, PLACEHOLDER_SECRETS
        );
    }
    if secret.len() < 32 {
        panic!(
            "F1.1: jwt_secret length = {} bytes < 32 (HS256 minimum security baseline).\n\
             Fix: generate via `openssl rand -hex 32` (produces 64-char hex = 32 bytes) + set APP_JWT_JWT_SECRET or APP_JWT_JWT_SECRET_FILE",
            secret.len()
        );
    }
}
```

### 模組註冊

`rust-api/server/config/src/lib.rs` 加：

```rust
pub mod secret_loader;
```

---

## E2. `config_init.rs` integration（既有 init_from_file 修）

### 既有 callsite

`rust-api/server/config/src/config_init.rs:66` 既有：

```rust
global::init_config::<JwtConfig>(config.jwt).await;
```

### F1.1 修改

在 `global::init_config::<JwtConfig>` 之前、jwt config 從 `config.jwt` 取出時、跑 `_FILE` override + strict validation：

```rust
// 既有 init_from_file flow 內、parse_config 完成後、init_config 之前：
let mut jwt_config = config.jwt;

// F1.1 step 1: _FILE precedence override
if let Some(secret_from_file) = secret_loader::load_secret_from_file_if_set("APP_JWT_JWT_SECRET") {
    jwt_config.jwt_secret = secret_from_file;
}

// F1.1 step 2: Strict validation (panic on fail)
secret_loader::validate_jwt_secret(&jwt_config.jwt_secret);

// 既有：
global::init_config::<JwtConfig>(jwt_config).await;
```

注：具體 callsite 順序 / yaml-loaded vs env-override JwtConfig 整合細節由 implementer 階段量化（per research.md outstanding 「init_from_file integration 位置 tasks 階段選一致位置」）；推薦在所有 yaml 反序列化 + env override 都完成後、init_config 之前。

---

## E3. `JwtConfig` struct doc 擴充（既有結構不動）

### 檔案 path

`rust-api/server/config/src/model/jwt_config.rs`（既有）

### F1.1 修改

僅擴 doc comment、struct 不動：

```rust
use serde::Deserialize;

/// JWT 配置
///
/// 環境變數（rev1 prod 推薦 _FILE pattern、dev 可用 bare envvar）：
/// - APP_JWT_JWT_SECRET — 直接設 secret 值（dev 用、prod 避免）
/// - APP_JWT_JWT_SECRET_FILE — 指 file path、讀取檔案內容為 secret 值（prod 用、per Constitution §架構約束）
///   precedence: _FILE > bare envvar > yaml default（per F1.1 spec FR-007）
/// - APP_JWT_ISSUER — issuer 字串（非 secret、bare envvar OK）
/// - APP_JWT_EXPIRE — 整數秒（非 secret、bare envvar OK）
///
/// Strict validation 規則（per F1.1 spec FR-001~004、config_init 載入點 fail-fast）：
/// - jwt_secret MUST NOT 為空
/// - jwt_secret MUST NOT in `PLACEHOLDER_SECRETS` 黑名單
///   （`"soybean-admin-rust"` / `"change-me"` / `"change-me-jwt-secret"` /
///    `"your-secret-here"` / `"PLACEHOLDER"` / `"TODO"`）
/// - jwt_secret.len() MUST >= 32 bytes（HS256 minimum security baseline）
///
/// per spec FR-001~009 + data-model.md §E3。
#[derive(Deserialize, Debug, Clone)]
pub struct JwtConfig {
    /// JWT 密钥（envvar APP_JWT_JWT_SECRET / APP_JWT_JWT_SECRET_FILE）
    pub jwt_secret: String,

    /// JWT 签发者（envvar APP_JWT_ISSUER）
    pub issuer: String,

    /// JWT 过期时间（秒；envvar APP_JWT_EXPIRE）
    pub expire: i64,
}
```

---

## E4. Resources files 修

### `application.yaml`（既有、F1.1 修）

```yaml
jwt:
    # F1.1: prod 必透過 APP_JWT_JWT_SECRET_FILE 或 APP_JWT_JWT_SECRET envvar 設真 secret；
    # 此處 placeholder 值會被 config_init strict validation panic 拒絕、避免誤啟動。
    # 產生方式：openssl rand -hex 32
    jwt_secret: "change-me-jwt-secret"
    issuer: "https://github.com/ByteByteBrew/soybean-admin-rust"
    expire: 7200
```

### `application-test.yaml`（既有、F1.1 修）

```yaml
jwt:
    # F1.1: test secret、32-char 合規值通過 strict validation；公開於 yaml 不影響 prod
    jwt_secret: "dev-test-secret-padded-to-thirty-two!"
    issuer: "https://github.com/ByteByteBrew/soybean-admin-rust"
    expire: 7200
```

### `application.yaml.example`（NEW、F1.1 新建）

```yaml
# F1.1 rev1 deployment template — copy to application.yaml + override secrets via envvar / _FILE

jwt:
    # MUST 透過環境變數 override（per F1.1 strict validation）
    # 此 placeholder 值會被 boot-time validation 攔下 panic
    jwt_secret: "REPLACE_VIA_ENV_OR_FILE"
    issuer: "https://your-rev1-deployment.example.com"
    expire: 7200

# === 環境變數注入範例 ===
#
# Dev（bare envvar、convenience）:
#   export APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"
#   export APP_JWT_ISSUER="https://dev-rev1.example.com"
#
# Prod（Docker secrets + _FILE pattern、per Constitution §架構約束）:
#   $ openssl rand -hex 32 | docker secret create jwt_secret -
#   compose.yaml:
#     services:
#       rust-api:
#         secrets: [jwt_secret]
#         environment:
#           APP_JWT_JWT_SECRET_FILE: /run/secrets/jwt_secret
#           APP_JWT_ISSUER: https://rev1.prod.example.com
#     secrets:
#       jwt_secret:
#         external: true
#
# === 注入 precedence（F1.1 spec FR-007） ===
#   1. APP_JWT_JWT_SECRET_FILE (highest)
#   2. APP_JWT_JWT_SECRET
#   3. application.yaml jwt.jwt_secret (lowest、會被 placeholder validation 攔)
```

---

## E5. `Claims` struct（既有、不動於 F1.1）

`server_core::web::auth::Claims`（F4 + F3 既有、F1.1 完全不改）。11 fields 結構：

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    // Standard JWT claims (per RFC 7519)
    sub: String,                  // user_id（ULID）
    exp: Option<usize>,           // expiration timestamp
    iss: Option<String>,          // issuer (per APP_JWT_ISSUER)
    aud: String,                  // audience（"ManagementPlatform" or ...）
    iat: Option<usize>,           // issued at timestamp
    nbf: Option<usize>,           // not before (= iat)
    jti: Option<String>,          // JWT ID（ULID，防重放）

    // Custom claims
    username: String,             // user 顯示名（不是 user_id）
    role: Vec<String>,            // user role 列表
    domain: String,               // user domain（multi-tenant context）
    org: Option<String>,          // user org（optional）
}
```

F1.1 **不**改 struct、不 add / remove / rename / re-type 任何 field。

Future extensions（F1.2 / F10 階段可加、不破壞 F1.1）：
- `token_type: String` — F10 refresh-token-bridge
- header `kid` (key id) — F1.2 key versioning
- `family_id` — F10 refresh rotation chain

---

## E6. Boot-time validation Flow

```
docker compose up rust-api（or cargo run --bin server）
  ↓
process env vars 提供：
  APP_JWT_JWT_SECRET="..."              (dev 場景、可選)
  APP_JWT_JWT_SECRET_FILE="/run/secrets/jwt_secret"  (prod 場景、可選)
  APP_JWT_ISSUER="https://..."
  APP_JWT_EXPIRE="7200"
  ↓
server-config::init_from_file("application.yaml")
  ├─ parse_config (yaml / toml / json) → Config struct
  ├─ env_config / multi_instance_env override (envy from_env merge)
  ↓ jwt_config = config.jwt （此時 jwt_secret = APP_JWT_JWT_SECRET OR yaml default）
  ↓
  ├─ F1.1: _FILE precedence check
  │   secret_loader::load_secret_from_file_if_set("APP_JWT_JWT_SECRET")
  │     if APP_JWT_JWT_SECRET_FILE set:
  │       fs::read_to_string(path) → trim → Some(value)
  │     if read fail (file 不存在 / permission denied / IO) → panic
  │   if Some(v) → jwt_config.jwt_secret = v (override bare envvar / yaml)
  ↓
  ├─ F1.1: Strict validation
  │   secret_loader::validate_jwt_secret(&jwt_config.jwt_secret)
  │     - is_empty?              → panic "must set non-empty secret"
  │     - in placeholder set?    → panic with list + 修法
  │     - length < 32 bytes?     → panic "minimum 32 bytes for HS256"
  ↓
  └─ global::init_config::<JwtConfig>(jwt_config).await    (既有、不動)

↓ (config 完成、Keys 初始化階段、不動)

server-initialize::initialize_keys_and_validation()
  └─ global::Keys::new(jwt_config.jwt_secret.as_bytes())
       = EncodingKey::from_secret(secret) + DecodingKey::from_secret(secret)
       (既有、不動)
```

**結果**：server boot 成功 = jwt_secret 通過 strict validation；任何失敗都 boot panic、log 帶清晰 envvar 名 + 修正方式。

---

## E7. 影響檔案清單

### Code（server-config crate）

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/config/src/secret_loader.rs` | **NEW** | ~70 行（PLACEHOLDER_SECRETS const + 2 fn + doc）|
| `rust-api/server/config/src/lib.rs` | MODIFY | 1 行（`pub mod secret_loader;`）|
| `rust-api/server/config/src/config_init.rs` | MODIFY | ~5 行（_FILE override + validate call、插入 init_config 之前）|
| `rust-api/server/config/src/model/jwt_config.rs` | MODIFY | doc comment 擴充（~15 行新註解、struct 不動）|

### Tests

| 檔案 | 改動類型 | 量級 |
|---|---|---|
| `rust-api/server/config/tests/jwt_secret_validation.rs` | **NEW** | ~7 個 unit test fn（validate_jwt_secret + load_secret_from_file_if_set 各 rule / path） |
| `rust-api/server/initialize/tests/jwt_boot_integration.rs` | **NEW** | ~2-3 個 integration test fn（boot panic via std::panic::catch_unwind） |

### Resources

| 檔案 | 改動類型 |
|---|---|
| `rust-api/server/resources/application.yaml` | MODIFY (jwt_secret → "change-me-jwt-secret") |
| `rust-api/server/resources/application-test.yaml` | MODIFY (jwt_secret → 32-char dev secret) |
| `rust-api/server/resources/application.yaml.example` | **NEW** |

### Specs

| 檔案 | 改動類型 |
|---|---|
| `specs/004-jwt-secrets/contracts/claim-contract.md` | **NEW**（per spec FR-013） |

---

**Phase 1 data-model 結論**：✅ Function signatures / module structure / resources file 內容 / boot flow / 影響檔案清單全部就位。下一步進 contracts / quickstart。
