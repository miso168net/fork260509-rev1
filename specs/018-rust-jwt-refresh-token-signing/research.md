# Phase 0 Research: F10.1 — rust-jwt-refresh-token-signing

**Date**: 2026-05-19
**Status**: Complete(8 個 finding 全 resolved、含 2 個 brainstorm OQ + 1 個 clarify Q1 deep-dive + 5 個 implement-time concern)

> 全程透過 Explore agent 對既有 rust 與 nestjs code 做 read-only evidence collection。0 source 改動、0 commit 觸發。

---

## R-Q1(OQ-2 resolved): `init_refresh_keys` merge 還是分開?

**Decision**: **SEPARATE**(`init_refresh_keys` 獨立 fn、緊接 `init_keys` 之後 call)

**Rationale**:
- 既有 `Keys` struct(`/server/global/src/global.rs:85-99`)= 簡單 `{ encoding, decoding }` 雙 key 從同 secret 建、`OnceCell<Arc<Mutex<Keys>>>` wrapper。
- 既有 `KEYS` global init pattern 約 5-10 LOC、`init_refresh_keys` 鏡像同 pattern ~5 LOC。
- Merge `init_jwt_keys(jwt_secret, refresh_secret)` 雖少 1 個 fn call site、但混合 KEYS 與 REFRESH_KEYS init 責任、難維護 + F1.2 升 RS256 時拆回更困難。
- Separate 對齊既有「1 global = 1 init fn」紀律(類 KEYS/CONFIG/DB pool 各自獨立 init pattern)。

**Alternatives considered**:
- **Merge**:`init_jwt_keys(jwt_secret, refresh_secret)`,reject 因混合責任、未來 RS256 升級需拆回。
- **Inline init in main.rs**:不抽 fn,直接 main bootstrap 寫 `REFRESH_KEYS.set(...)`,reject 因破壞既有 init 抽象、 callsite 暴露 OnceCell mechanic。

---

## R-Q2(OQ-3 resolved): `application.yaml` 是否需動?

**Decision**: **YES、加 2 line**(`jwt.refresh_secret: "change-me-refresh-secret"` + `jwt.refresh_expire: 7200`)

**Rationale**:
- `application.yaml` 是 precedence chain 最底層(_FILE > bare envvar > yaml、per `apply_jwt_secret_hardening` line 79-104)。
- 若 `JwtConfig.refresh_secret: String` 為 non-Option 必有值欄位、yaml 必須提供 default、否則 config_init 階段 deserialize fail。
- 既有 yaml(`/server/resources/application.yaml`)`jwt` section 3 field、加 2 field 對齊既有 placeholder pattern(`change-me-*` 觸發 F1.1 validation panic、避免 prod 誤啟動)。
- 對 dev:`refresh_token_secret.txt` 空檔 → clarify Q1 fallback 用 `jwt_secret` 同 value、yaml refresh_secret 預設值不會被 use(precedence chain _FILE empty + fallback 完勝)、純 startup placeholder。
- 對 prod:`refresh_token_secret.txt` 必填、yaml default 仍是 fail-safe。

**Alternatives considered**:
- **Skip yaml, make refresh_secret Option<String>**:reject 因 type 複雜化 + 既有 jwt_secret 不是 Option。
- **`#[serde(default = "...")]` macro 內提供 default**:reject 因散佈 default 到 Rust code、yaml 仍 source of truth 更清楚。
- **Skip yaml, validate at runtime panic if missing**:reject 因違反 F1.1 validation pattern。

---

## R-Q3(clarify Q1 deep-dive): secret_loader empty-file fallback 實作位置

**Decision**: **在 `apply_jwt_secret_hardening` 內 extend、不污染 `load_secret_from_file_if_set` generic helper**

**Rationale**:
- `load_secret_from_file_if_set(base_envvar)` 為 F1.1 generic helper(`/server/config/src/secret_loader.rs:24-44`):純讀檔 → trim → `Some(content)` / `None`、語義單純、可被多 callsite 重用(jwt + database_url + redis_url 等)。
- Empty-file fallback to `jwt_secret` 是 **F10.1 specific 邏輯**(其他 secret 不適用此 fallback、e.g. database_url empty 不能 fallback 到 jwt_secret)、屬 caller 邏輯。
- `apply_jwt_secret_hardening` 已是 jwt-specific wrapper、加 refresh_secret 處理屬 same scope。

**Implementation sketch**(per data-model.md §E2):
```rust
pub fn apply_jwt_secret_hardening(jwt: &mut crate::JwtConfig) {
    // (既有)Step 1-3: jwt_secret hardening
    // ... line 95-103 既有 code ...
    validate_jwt_secret(&jwt.jwt_secret);

    // (F10.1 新加)Step 4-6: refresh_secret hardening
    if let Some(content) = load_secret_from_file_if_set("APP_JWT_REFRESH_SECRET") {
        // F10.1 clarify Q1: empty file → fallback to jwt_secret (mirror nestjs entrypoint)
        jwt.refresh_secret = if content.is_empty() {
            jwt.jwt_secret.clone()
        } else {
            content
        };
    } else if let Ok(bare) = std::env::var("APP_JWT_REFRESH_SECRET") {
        jwt.refresh_secret = bare;
    }
    // else: yaml default (placeholder 會被 validate 拒)
    validate_jwt_secret(&jwt.refresh_secret);
}
```

**Alternatives considered**:
- **Add empty-check to `load_secret_from_file_if_set` helper**:reject 因污染 generic helper、破壞 single-responsibility。
- **新 fn `apply_refresh_secret_hardening(jwt)`**:reject 因兩個 fn 重複 ~5 LOC 共同 boilerplate、不如合在一起。
- **In JwtConfig::resolve_refresh_secret() method**:reject 因 hardening 是 config_init 階段邏輯、不該掛在 model struct。

---

## R-Q4(Keys struct 確認): refresh KEYS 設計

**Evidence**(`/server/global/src/global.rs:85-99`):
```rust
pub struct Keys {
    pub encoding: EncodingKey,
    pub decoding: DecodingKey,
}
impl Keys { pub fn new(secret: &[u8]) -> Self { ... } }
pub static KEYS: OnceCell<Arc<Mutex<Keys>>> = OnceCell::const_new();
```

**Finding**:`Keys` struct 同 encoding + decoding pair(從同 secret 建)。F10.1 `REFRESH_KEYS` 可重用 `Keys` struct(reuse type、不新建)、只新加 global instance:

```rust
pub static REFRESH_KEYS: OnceCell<Arc<Mutex<Keys>>> = OnceCell::const_new();
```

**Decision**:**重用 `Keys` struct**、不為 refresh 新 `RefreshKeys` struct。Decoding key F10.1 不用(rust 只簽不驗、verify 由 nestjs)、但 `Keys::new` 自動建 decoding 副產物無 cost、未來 F13 rust 補 verify 時直接可用。

---

## R-Q5(HS256 confirmed): JWT algorithm 對齊

**Evidence**:
- rust `JwtUtils::generate_token` 用 `encode(&Header::default(), ...)` — `Header::default()` 即 HS256(per `jsonwebtoken@9.x` default)。
- nestjs `@nestjs/jwt@11.0.0` `jwtService` 預設 algorithm 為 HS256(per `nestjs/jwt` doc)。

**Finding**:雙端 HS256 對齊、F10.1 `generate_refresh_token` 沿用 `Header::default()` 即可、無需顯式設 algorithm。F1.2 升 RS256 時兩端同步改、屬 future scope。

**Decision**:**HS256 confirmed**(0 patch needed for algorithm wiring)。

---

## R-Q6(Claims::new pattern): `RefreshClaims::new` signature

**Evidence**(`/server/core/src/web/auth.rs:7-67`):
- `Claims::new(sub, aud, username, role, domain, org) -> Self`:7 個 required field at construction、5 個 JWT 標準 claim(`exp`/`iss`/`iat`/`nbf`/`jti`)初始為 `None`、由 setter 動態填。
- Pattern 適合「dynamic claim」場景(exp/iat 必 runtime 計算)。

**Decision**:`RefreshClaims::new(sub: String) -> Self` 鏡像 same pattern,只接 sub(user_id)、其他 5 claim(`exp`/`iat`/`nbf`/`jti`/`iss`)初始 `None`、setter 填。

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefreshClaims {
    sub: String,
    exp: Option<usize>,
    iss: Option<String>,
    iat: Option<usize>,
    nbf: Option<usize>,
    jti: Option<String>,
}

impl RefreshClaims {
    pub fn new(sub: String) -> Self {
        Self { sub, exp: None, iss: None, iat: None, nbf: None, jti: None }
    }
    pub fn set_exp(&mut self, exp: usize) { self.exp = Some(exp); }
    pub fn set_iss(&mut self, iss: String) { self.iss = Some(iss); }
    pub fn set_iat(&mut self, iat: usize) { self.iat = Some(iat); }
    pub fn set_nbf(&mut self, nbf: usize) { self.nbf = Some(nbf); }
    pub fn set_jti(&mut self, jti: String) { self.jti = Some(jti); }
}
```

**Alternative considered**:`RefreshClaims::new(sub, exp, iss)` 多參數 constructor、reject 因不對齊既有 Claims pattern + setter 留彈性。

---

## R-Q7(test convention): F10.1 unit test 掛點

**Evidence**:
- 既有 codebase 18+ 個檔含 `#[cfg(test)] mod tests`(inline)。
- 既有 `tests/` directory(`/server/initialize/tests/`)整合測試:`#[tokio::test]` async test。
- env-var test 用 `static ENV_MUTEX: std::sync::Mutex<()>` guard 防並行 test 競爭(per `secret_loader.rs:145-244`)。

**Decision**:
- **Unit test (a)** `JwtUtils::generate_refresh_token`:**inline `#[cfg(test)] mod tests` 在 `jwt.rs` 同檔**(對齊 utility function test convention、不需 async tokio、可 simple `#[test]`)。
- **Unit test (b)** `secret_loader` empty-file fallback:**inline 在 `secret_loader.rs` 同檔**、加新 test fn 到既有 `mod tests`(既有 ENV_MUTEX 可重用、避免新建檔)。

**Implementation sketch**:

```rust
// jwt.rs 底部 (約 line 100 處、jwt.rs 既有 mod tests 或新建)
#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{decode, DecodingKey, Validation};

    #[tokio::test]
    async fn test_generate_refresh_token_signs_valid_hs256_jwt_with_refresh_claims() {
        // 1. init REFRESH_KEYS with test secret
        // 2. call generate_refresh_token("test-user-id")
        // 3. decode JWT with same secret + RefreshClaims target
        // 4. assert sub == "test-user-id", exp set, iat set, etc.
    }
}

// secret_loader.rs 既有 mod tests 加 test fn
#[test]
fn test_apply_jwt_refresh_secret_empty_file_fallback_to_jwt_secret() {
    let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    // 1. create temp empty file
    // 2. set APP_JWT_REFRESH_SECRET_FILE=<temp empty file>
    // 3. create JwtConfig with jwt_secret="fake-secret", refresh_secret="yaml-default"
    // 4. apply_jwt_secret_hardening(&mut jwt)
    // 5. assert jwt.refresh_secret == jwt.jwt_secret (= "fake-secret")
}
```

---

## R-Q8(rust image rebuild cache): cargo cache invalidation 範圍

**Decision**:**Cold build:5-6 min、Warm build with cache:2-3 min**(per W-F1 baseline + F10.1 改 3 crate scope)

**Rationale**:
- F10.1 改 3 個 rust crate:`config/`(+jwt_config + secret_loader)、`core/`(+jwt.rs)、`service/`(+sys_auth_service.rs)。
- Cargo 依賴圖:`service` depends on `core` depends on `config`,改 `config` → invalidate `core` + `service` 也要 rebuild、cascading invalidation。
- W-F1 既有 BuildKit cache mount(`/usr/local/cargo/registry` + `target/`)會保 dependency cache(`tokio` / `axum` / `sea-orm` etc 等不需重 build)、只 invalidate F10.1 改的 crate + downstream。
- Warm build 預估 2-3 min(改 3 crate + final link)、cold build 5-6 min(對齊 W-F1 acceptance)。

**Mitigation**(per spec R-6):
- Build 前可 `docker builder prune --filter "until=24h"` 清舊 dangling layer。
- 持續 build 過程觀察 `docker compose build rust-api --progress=plain` log、若超 10 min 主動 abort + 檢查 cache hit rate。

---

## Phase 0 Findings Summary

| R-Q | Topic | Decision |
|---|---|---|
| R-Q1 | OQ-2 init_refresh_keys merge vs separate | **Separate**(`init_refresh_keys` 鏡像 KEYS pattern)|
| R-Q2 | OQ-3 application.yaml whether to modify | **YES、加 2 line**(`refresh_secret` + `refresh_expire` 預設)|
| R-Q3 | secret_loader empty-file fallback 位置 | **`apply_jwt_secret_hardening` 內 extend**(不污染 generic helper)|
| R-Q4 | Keys struct refresh design | **重用 `Keys` struct + 新 `REFRESH_KEYS` global**(不新 struct)|
| R-Q5 | HS256 algorithm 對齊 | **Confirmed**(`Header::default()` HS256 雙端對齊、0 patch)|
| R-Q6 | RefreshClaims::new signature | **`new(sub: String)` 1 參數**(對齊 Claims setter pattern)|
| R-Q7 | Unit test 掛點 | **Inline `#[cfg(test)]` 在 jwt.rs + secret_loader.rs 各加 1 test**(重用既有 ENV_MUTEX)|
| R-Q8 | rust image rebuild cache 影響 | **Cold 5-6 min / Warm 2-3 min**(對齊 W-F1 + BuildKit cache mount)|

**Phase 0 Status**: ✅ Complete、無 NEEDS CLARIFICATION 剩、可進 Phase 1 Design。
