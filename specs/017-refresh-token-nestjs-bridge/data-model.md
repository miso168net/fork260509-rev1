# Phase 1 — Data Model: F10 refresh-token-nestjs-bridge

**Source**: [spec.md](spec.md) + [research.md](research.md)
**Date**: 2026-05-19
**Status**: post-Option A reset(F10 = wire-up + friction 紀錄 feature、0 rust patch、無新 entity)

---

## E-1: `sys_tokens` table(既有、F10 不改 schema)

**Source**: `rust-api/migration/src/schemas/m20241023_091204_create_sys_tokens.rs`

| Column | Type | Owner write | Owner read |
|---|---|---|---|
| `id` | String NOT NULL PRIMARY KEY | rust login | nestjs refreshToken |
| `access_token` | String NOT NULL | rust login | nestjs(未直接 query) |
| `refresh_token` | String NOT NULL | rust login(Ulid 字串、R-8 surface) | nestjs(`findUnique({where:{refreshToken}})`) |
| `status` | String NOT NULL | rust login(`"ACTIVE"` SCREAMING_SNAKE_CASE、R-7 surface) | nestjs(期 `"unused"` lowercase) |
| `user_id` | String NOT NULL | rust login | nestjs |
| `username` | String NOT NULL | rust login | nestjs(用於 generateAccessToken) |
| `domain` | String NOT NULL | rust login | nestjs(用於 generateAccessToken) |
| `login_time` | Timestamp NOT NULL | rust login | nestjs |
| `ip` | String NOT NULL | rust login | nestjs |
| `port` | Integer NULLABLE | rust login | nestjs |
| `address` | String NOT NULL | rust login | nestjs |
| `user_agent` | String NOT NULL | rust login | nestjs |
| `request_id` | String NOT NULL | rust login | nestjs |
| `type` | String NOT NULL | rust login | nestjs |
| `created_at` | Timestamp NOT NULL DEFAULT NOW | rust login | nestjs |
| `created_by` | String NOT NULL | rust login | nestjs |

**State transitions**(per rust `TokenStatus` enum + nestjs `TokenStatus` enum):

| State (rust) | State (nestjs 期) | Mismatch |
|---|---|---|
| `Active` → `"ACTIVE"` | n/a (nestjs 不識此值) | R-7 |
| `Refreshed` → `"REFRESHED"` | n/a | R-7 |
| `Revoked` → `"REVOKED"` | n/a | R-7 |
| n/a | `UNUSED` → `"unused"`(refresh 前) | R-7 |
| n/a | `USED` → `"used"`(refresh 後) | R-7 |

**F10 acceptance 範疇**:US2.1 驗 rust 寫入正確(status = `"ACTIVE"`)、**不**驗 nestjs 讀後變動(留 F10.1+F10.2 之後)。

---

## E-2: rust `AuthOutput` DTO(既有、F10 不改)

**Source**: `rust-api/server/model/src/admin/output/sys_authentication.rs:11` + `sys_auth_service.rs:355-360`

```rust
pub struct AuthOutput {
    pub token: String,           // JWT(用 jwt_secret 簽、HS256 default、含 exp/sub/iss/iat/nbf/jti claims、per generate_token)
    pub refresh_token: String,   // Ulid 字串(26 char、明文、非 JWT、R-8 surface)
}
```

camelCase serialization via `#[serde(rename_all = "camelCase")]`(per F4 既有 + W-FA1 sanity)。

---

## E-3: nestjs `RefreshTokenDTO`(既有、F10 不改、F10 不動 nestjs source)

**Source**: `apps/base-system/src/lib/bounded-contexts/iam/authentication/application/dto/refresh-token.dto.ts`

```typescript
class RefreshTokenDTO {
  refreshToken: string;
  ip: string;
  region: string;
  userAgent: string;
  requestId: string;
  type: string;
  port?: number;
}
```

---

## E-4: nestjs `RefreshTokenUsedEvent`(既有、F10 不改、F10 不動 nestjs source)

**Source**: `apps/base-system/src/lib/bounded-contexts/iam/tokens/domain/events/refreshtoken-used.event.ts`

```typescript
class RefreshTokenUsedEvent {
  refreshToken: string;
  status: string;  // 值 = TokenStatus.USED = "used"(per tokens.entity.ts:refreshTokenCheck)
}
```

---

## Validation Rules

(F10 不引入新 validation、純驗既有 rust + nestjs interaction)

- rust login: `status = TokenStatus::Active.to_string()` per `access_token_event.rs:30`
- rust login: `refresh_token = Ulid::new().to_string()` per `sys_auth_service.rs:357`
- nestjs refreshToken: `jwtService.verifyAsync(refreshToken, refreshJwtSecret)` 必 fail(R-8、Ulid 非 JWT)
- nestjs refreshTokenCheck: `if (status !== "unused") throw` 必 fail(R-7、rust 寫 "ACTIVE" 不等於 "unused")

---

## Out of Scope(data model)

- 加新 column 到 sys_tokens(F10 不改 schema、留 F10.1+F10.2 之後)
- nestjs prisma model 改動(per spec OOS-001 + Constitution Principle IV/V)
- 跨服務 schema 對齊新表(per spec OOS-007)
