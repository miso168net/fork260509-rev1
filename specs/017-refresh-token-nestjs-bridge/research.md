# Phase 0 — Research: F10 refresh-token-nestjs-bridge

**Source**: [spec.md](spec.md) + [docs/superpowers/017-feature-refresh-token-nestjs-bridge.md](../../docs/superpowers/017-feature-refresh-token-nestjs-bridge.md)
**Date**: 2026-05-19
**Status**: ⚠️ Plan 階段 surface 2 個重大 cross-impl mismatch、預估 rust source 改動超 Q3 1-3 處上限

---

## R-Q1: nestjs refreshToken endpoint cascade dependency tree

**Question**: nestjs `authentication.service.ts::refreshToken()` 在 `tokenDetails` 找到後是否 cascade 查 sys_user / sys_role / sys_menu(影響 R-3 Status PG enum cascade 風險)?

**Investigation**:讀 `apps/base-system/src/lib/bounded-contexts/iam/authentication/application/service/authentication.service.ts::refreshToken()` 完整 method body。

**Decision**: **No cascade query to sys_user / sys_role / sys_menu**。完整 flow:
1. `queryBus.execute(TokensByRefreshTokenQuery)` → 查 sys_tokens(only)
2. `jwtService.verifyAsync(refreshToken, refreshJwtSecret)` → 純 JWT verify、不查 DB
3. `new TokensEntity(tokenDetails)` → 內存 aggregate、不查 DB
4. `tokensAggregate.refreshTokenCheck()` → 純 status 字串檢查、不查 DB
5. `this.generateAccessToken(userId, username, domain)` → 簽新 JWT(在 service 內、用 `tokenDetails` 已有的 username/domain、**不查 sys_user**)
6. Apply `TokenGeneratedEvent` → 寫新 sys_tokens row

**Rationale**:`refreshToken` flow 完全閉鎖於 sys_tokens 表、無 cascade 查其他表。R-3 Status PG enum cascade 風險 → **無觸發路徑**、可降為極低機率(R-3 在 spec 已寫低機率、本 research 進一步確認)。

**Alternatives considered**:無需考慮 — flow 已單純。

---

## R-Q2: rust login flow 簽 refresh_token 用哪個 secret + 格式?

**Question**:rust `LoginService` / `JwtUtils` 簽 refresh_token 用 jwt_secret 還是 refresh_token_secret?用 JWT 還是其他格式?

**Investigation**:讀 `rust-api/server/service/src/admin/sys_auth_service.rs` (line 357-359)、`rust-api/server/core/src/web/jwt.rs::generate_token()`(line 60+)、`rust-api/server/service/src/admin/events/access_token_event.rs`。

**Decision**:**rust refresh_token = `Ulid::new().to_string()`、非 JWT、無簽 secret**。

```rust
// rust-api/server/service/src/admin/sys_auth_service.rs:355-360
Ok(AuthOutput {
    token,
    refresh_token: Ulid::new().to_string(),  // 26-char Ulid、明文不簽
})
```

對比 nestjs 期望:
```typescript
// fork260509-soybean-admin-nestjs/backend/apps/.../authentication.service.ts:refreshToken()
await this.jwtService.verifyAsync(tokenDetails.refreshToken, {
  secret: this.securityConfig.refreshJwtSecret,  // 期望 JWT 用 REFRESH_TOKEN_SECRET 驗
});
```

**結論 — 跨端 refresh_token 格式 mismatch(critical finding R-7)**:
- rust 寫:Ulid 字串(26 char、無 sig、無 claims、無 exp)
- nestjs 期讀:JWT(header.payload.sig 三段、含 exp 等 claims、用 `REFRESH_TOKEN_SECRET` envvar 驗)

**Mitigation 預估**(若採 Q5 拍板「rust 遷就 nestjs」):
- rust `sys_auth_service.rs` 改 `refresh_token: Ulid::new().to_string()` → 用 `JwtUtils::generate_refresh_token(claims, refresh_secret)` 簽 JWT
- rust 加新 method `generate_refresh_token`(類 `generate_token` 但用 refresh_secret)
- rust `JwtConfig` 結構加 `refresh_secret: String`(對齊 W-FA1 既有 `refresh_token_secret` _FILE pattern)
- rust `LoginService` 用 refresh_secret 簽 refresh_token
- **預估 rust 改動 3 處**(method 新增 + config 加 field + caller 換)

**Alternatives considered**:nestjs 改用 Ulid 驗(不簽)— ❌ 違反 spec Q2「不動 nestjs source」

---

## R-Q3: nestjs `RefreshTokenUsedEvent` status 值 + sys_tokens 寫入路徑

**Question**:nestjs refreshToken 後 sys_tokens row status 變動細節?(已知 spec Q1 拍板 loose assert、本 research 補 background)

**Investigation**:讀 `fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/tokens/domain/`:
- `tokens.entity.ts::refreshTokenCheck()`
- `events/refreshtoken-used.event.ts`
- `constants.ts::TokenStatus` enum

**Decision**:

```typescript
// nestjs constants.ts
export enum TokenStatus {
  UNUSED = 'unused',
  USED = 'used',
}

// nestjs tokens.entity.ts:refreshTokenCheck()
async refreshTokenCheck() {
  if (this.status !== TokenStatus.UNUSED) {  // 期 'unused'、非 'unused' 就 throw
    throw new Error('Token has already been used.');
  } else {
    this.apply(
      new RefreshTokenUsedEvent(this.refreshToken, TokenStatus.USED),  // 變 'used'
    );
  }
}
```

對比 rust:

```rust
// rust constant/src/definition/consts.rs
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenStatus {
    Active,      // → "ACTIVE"
    Refreshed,   // → "REFRESHED"
    Revoked,     // → "REVOKED"
}

// rust access_token_event.rs
status: Set(TokenStatus::Active.to_string()),  // 寫 'ACTIVE'
```

**結論 — TokenStatus 字串值 mismatch(critical finding R-8)**:
- rust 寫:`"ACTIVE"` / `"REFRESHED"` / `"REVOKED"`(SCREAMING_SNAKE_CASE)
- nestjs 期讀:`"unused"`(才允許 refresh)/ `"used"`(被視為已用)— **完全不同 value space**

**衝擊 — F10 acceptance**:
- US1.2 rust login 後 sys_tokens.status = `"ACTIVE"`
- nestjs refreshToken `refreshTokenCheck()`:`"ACTIVE" !== "unused"` → throw `'Token has already been used.'`
- US1.2 必 fail with HTTP 5xx(Internal Server Error from uncaught throw、不是 NotFoundException)

**Mitigation 預估**:
- rust 改 `TokenStatus` enum serialize_all 對齊 nestjs(`"unused"` / `"used"`)
- OR rust 加 `Unused` variant 取代 `Active`、保 enum 為 lowercase
- 影響面:rust enum 定義 + 所有 use sites(login 寫 + Casbin policy 內 token validation)
- **預估 rust 改動 2 處**(enum 定義 + write site;若有 read site 額外)

**Alternatives considered**:nestjs `TokenStatus` enum 改用 `"ACTIVE"` — ❌ 違反 spec Q2「不動 nestjs source」

---

## R-Q4: 加總 rust source 改動數預估 + 對 spec Q3 1-3 處上限的衝擊

**Aggregated estimate**(R-Q2 + R-Q3):
- refresh_token JWT 化(3 處):method 新增 + config 加 field + caller 換
- TokenStatus enum 對齊(2 處):enum 定義 + write site(可能 + read site = 3 處)
- JWT claim shape 對齊 nestjs jwtService.verifyAsync 期望(0-2 處、視 nestjs 期 claims)
- 既有 schema column type 對齊(0-1 處、可能 sys_tokens schema 改 column lengths 容納 JWT vs Ulid 不同長度)

**Total**:**5-9 處 rust source 改動**(中位數 ~6)

**對比 spec FR-008 + Q3 拍板**:
- 上限 1-3 處
- LOC ≤ 30 行(SC-006)

**結論 — R-4 風險升級觸發路徑**:
- 5-9 處改動 > 3 處上限 → **R-4 觸發**
- 對 spec FR-008 + Q3 + SC-006 形成壓力,F10 不該硬走

**選項**:
- **Option A**:abort F10 + 拆 F10.1 / F10.2 兩個 follow-up
  - F10.1 `rust-jwt-refresh-token-signing`(改 refresh_token 為 JWT、3 處 rust)
  - F10.2 `rust-tokenstatus-string-align`(改 enum 字串值、2-3 處 rust)
  - F10 自身 reset 為 verification-only(0 rust 改動、acceptance 預期 fail at HTTP 4xx 5xx、記 wire-up + friction 落點)
- **Option B**:回 /speckit-clarify 重新評估 Q3,升上限 1-3 → 3-9 處
- **Option C**:接受 R-1 R-2 R-7 R-8 全 surface 後在 F10 範疇內動 5-9 處(違反 spec FR-008、需 spec patch 補 R-7/R-8 + Q3 上限更新)

**Recommendation**:**Option A**(abort F10 + 拆 F10.1/F10.2、F10 reset 為 wire-up + friction surface 紀錄 feature)。理由:
- 對齊 spec R-4 mitigation 路徑「abort F10 + 拆 follow-up」
- 保 spec Q3 上限不變、避免 spec.md 一輪改回 clarify
- F10.1 / F10.2 各自緊湊、易拍板
- F10 自身仍有價值:as wire-up + friction 紀錄 + DESIGN-A baseline reference

**Alternatives considered**:
- Option B:回 /speckit-clarify 拆 spec — 流程 overhead 大、不對齊 W-* feature 模式
- Option C:F10 範疇內動 5-9 處 — 違反 spec NFR-001(小於 W-FA3 規模)、F10 變大、單 commit 風險

---

## R-Q5: nestjs jwtService.verifyAsync 期 JWT claims

**Investigation**:讀 nestjs `authentication.service.ts` + `securityConfig` + `RefreshTokenDTO` + 既有 JWT generation flow。

**Decision**(部分推論、待 F10.1 細查):
- nestjs `jwtService.verifyAsync(refreshToken, { secret: refreshJwtSecret })` 用 default Validator
- 預期 claims:`exp`(必、否則 verifyAsync 默 throw)、`iat`(soft)、`sub`(可選、若 nestjs 後續用)
- alg 預設 HS256(@nestjs/jwt default、未 override)
- 期 JWT signature 用 same `refreshJwtSecret`(對應 W-FA1 envvar `REFRESH_TOKEN_SECRET` _FILE)

**對齊路徑**(F10.1 / F10 內若採 Option C):
- rust 簽 refresh_token JWT 用 HS256 + refresh_secret + exp claim
- claim shape 可保持簡(JWT 標準 claims、不引業務 claims、因為 nestjs 拿 username/domain 從 sys_tokens row、非從 JWT)

---

## R-Q6: rust JWT access_token 配 nestjs verify(US1.3 acceptance)

**Question**:US1.3 用新 access_token 跑 rust `/route/getUserRoutes`:rust 簽 access_token + rust 自驗 access_token(`KEYS` static 用 jwt_secret)、無 cross-impl mismatch?

**Investigation**:讀 `rust-api/server/core/src/web/jwt.rs::validate_token()` + `generate_token()` 兩端用 `KEYS.encoding/decoding`。

**Decision**:**rust access_token = rust 簽 + rust 驗 round trip、無跨 impl mismatch**(都用同一個 `KEYS`、`jwt_secret`)。US1.3 預期 PASS、無 friction。

**對齊 US1.3 acceptance**:HTTP 200 + body envelope(F4 既有 shape)。

---

## Phase 0 結論

| 研究問題 | Finding | F10 acceptance 衝擊 |
|---|---|---|
| R-Q1 nestjs cascade query | No cascade(只查 sys_tokens)| ✅ R-3 PG enum cascade 風險降為極低 |
| R-Q2 rust refresh_token 格式 | **Ulid 字串、非 JWT**(critical R-7)| ❌ US1.2 必 fail at nestjs verifyAsync |
| R-Q3 TokenStatus 字串值 | **rust SCREAMING_SNAKE_CASE vs nestjs lowercase**(critical R-8)| ❌ US1.2 必 fail at refreshTokenCheck(若 R-7 修了)|
| R-Q4 rust 改動估算 | **5-9 處、超 Q3 1-3 上限** | ❌ R-4 觸發、需 Option A/B/C 拍板 |
| R-Q5 nestjs JWT 期望 | HS256 + refresh_secret + exp claim(預設) | F10.1 設計參考 |
| R-Q6 rust access_token 驗證 | rust 簽 + rust 驗、round trip | ✅ US1.3 預期 PASS |

**Recommendation**:abort F10、執行 Option A 拆 F10.1 + F10.2 follow-up;F10 範疇收縮為:
- (a) acceptance 跑、surface 5 個 friction(US1.2 fail at refresh_token JWT verify + sys_tokens TokenStatus 不符)
- (b) 紀錄 friction 落點 + 兩 follow-up feature 拆案
- (c) 不改 rust source、不改 nestjs source、wire-up 100% baseline 紀錄

或者 user 拍板 Option B / C。下一步請 user 看完 research 後決定。
