# Data Model: F10.2 — rust-tokenstatus-string-align

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-19

F10.2 不動 sys_tokens schema、不增 rust enum variant、不動 callsite。**唯一改動**:rust `TokenStatus` enum strum derive attribute(serialize_all + 2 per-variant override)。

---

## E1: rust `TokenStatus` enum(改動主體、~5 LOC)

**File**: `rust-api/server/constant/src/definition/consts.rs:6-13`

**改動前**(F10/F10.1 baseline):
```rust
#[derive(Debug, Clone, PartialEq, Eq, AsRefStr, Display, EnumString)]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenStatus {
    Active,      // serialize → "ACTIVE"
    Refreshed,   // serialize → "REFRESHED"
    Revoked,     // serialize → "REVOKED"
}
```

**改動後**(F10.2 拍板):
```rust
#[derive(Debug, Clone, PartialEq, Eq, AsRefStr, Display, EnumString)]
#[strum(serialize_all = "snake_case")]
pub enum TokenStatus {
    #[strum(serialize = "unused")]
    Active,      // serialize → "unused"  (per Q2 對齊 nestjs UNUSED='unused')
    #[strum(serialize = "used")]
    Refreshed,   // serialize → "used"    (per Q2 對齊 nestjs USED='used')
    Revoked,     // serialize → "revoked" (snake_case default、rust-only 狀態 per Q1)
}
```

**Diff scope**:
- `serialize_all` attribute 值:`"SCREAMING_SNAKE_CASE"` → `"snake_case"`(1 line)
- `Active` 加 `#[strum(serialize = "unused")]` attribute(1 line)
- `Refreshed` 加 `#[strum(serialize = "used")]` attribute(1 line)
- `Revoked` 不動(走 snake_case default → `"revoked"`)
- 變動字符:~3 LOC 新增、1 LOC 修改 = ~5 LOC enum 改

**Variant 不增不減**:`Active` / `Refreshed` / `Revoked` 三個 variant 在 F10.2 後仍存在,只字串值改;`impl TokenStatus { is_valid / can_refresh }` 邏輯不變(只 match `Active` variant、與 string repr 無關)。

---

## E2: strum derive macro 行為(per R-Q1 + R-Q2 + R-Q5)

**`Display` derive**(`AsRefStr + Display + EnumString`):
- 為 `TokenStatus` 實作 `impl fmt::Display`(來自 strum_macros::Display derive)
- `Display::fmt` 邏輯依 `serialize_all` + per-variant `serialize` 規則生成輸出
- `.to_string()` 透過 std blanket impl `impl<T: Display + ?Sized> ToString for T` 觸發 Display

**`AsRefStr` derive**:
- 為 `TokenStatus` 實作 `impl AsRef<str>`、提供 `.as_ref::<str>()` method
- 字串值與 Display 相同(同 serialize 規則)、API 不同(zero-copy `&str` vs heap `String`)
- F10.2 不直接用 AsRefStr(`access_token_event.rs:30` 用 `.to_string()`)、保留為其他 callsite 可選用

**`EnumString` derive**(per R-Q5):
- 為 `TokenStatus` 實作 `impl FromStr`、提供 `TokenStatus::from_str("unused") → Ok(Active)` 反向 parse
- 反向 parse 規則對稱於 serialize:`"unused"` → `Active`(因 `#[strum(serialize = "unused")]` 對 Active)
- F10.2 production 無 from_str callsite(per R-Q4 grep 0 line)、unit test reverse assert 為 derive 行為 sanity check

**per-variant override 優先級**(per R-Q1):
- strum 0.x 設計:`#[strum(serialize = "...")]` per-variant override **明確覆寫** enum-level `serialize_all` 自動轉換
- `Active` 有 `#[strum(serialize = "unused")]` → 用 "unused"(覆寫 snake_case 自動產生的 "active")
- `Refreshed` 有 `#[strum(serialize = "used")]` → 用 "used"
- `Revoked` 無 per-variant override → 走 serialize_all default snake_case → "revoked"

---

## E3: rust `AccessTokenEvent::handle` callsite(不動、行為自動跟著)

**File**: `rust-api/server/service/src/admin/events/access_token_event.rs:22-49`(F10.2 不動)

**callsite line 30**:
```rust
status: Set(TokenStatus::Active.to_string()),
//          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ F10.2 後自動 expand 為 "unused"
```

**行為差異**:
- F10.1 baseline:`TokenStatus::Active.to_string()` returns `"ACTIVE"`(SCREAMING_SNAKE_CASE)
- F10.2 後:同 callsite returns `"unused"`(per-variant override)
- callsite 一字未改、enum derive 改動自動透過 std `Display` blanket impl 反映

**sea-orm `Set<String>`**:
- `Set` 是 sea-orm `ActiveValue::Set` wrapper、表「明確設定此 column 值」(vs `NotSet` / `Unchanged`)
- F10.2 後 `Set(String::from("unused"))` 經 sea-orm INSERT 寫入 PG `sys_tokens.status TEXT` column
- PG schema 無 enum constraint(W-FA1 + W-FA1 spec 對齊驗:`status` 為 plain TEXT column)、F10.2 寫入 lowercase 字串值無 schema 問題

---

## E4: sys_tokens 表 schema(不動、F10.2 只改 status column 寫入字串值)

**PG schema**(W-FA1 + F1.1 + F5.1 累積就位):
```sql
CREATE TABLE sys_tokens (
    id            TEXT PRIMARY KEY,         -- Ulid
    access_token  TEXT NOT NULL,            -- JWT 字串
    refresh_token TEXT NOT NULL,            -- JWT 字串(F10.1 後從 Ulid 改 JWT)
    status        TEXT NOT NULL,            -- F10.2 前: "ACTIVE"; F10.2 後: "unused"
    user_id       TEXT NOT NULL,
    username      TEXT NOT NULL,
    domain        TEXT NOT NULL,
    login_time    TIMESTAMP NOT NULL,
    ip            TEXT NOT NULL,
    port          INTEGER,
    address       TEXT NOT NULL,
    user_agent    TEXT NOT NULL,
    request_id    TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL,
    created_by    TEXT NOT NULL
);
```

**F10.2 範疇內**:`status` column 寫入字串值改(rust 寫入 `"unused"` 代替 `"ACTIVE"`)、schema 結構不變、column type / nullability / index 不動。

**F10.2 範疇外**:
- 不加 CHECK constraint(`CHECK (status IN ('unused', 'used', 'revoked'))`)、留 future hardening
- 不加 enum type(`CREATE TYPE token_status AS ENUM ('unused', 'used', 'revoked')`)、留 F13 + 後續
- 不改 column 型別(`TEXT` 不變、避免 migration init container rerun)
- 不加 migration(per FR-008 + Q3 brainstorm、scope 最小)

---

## E5: State transition flow(F10.2 後 rust + nestjs 對齊)

**Flow**(login → refresh):

```
[Step 1: rust login]
  AccessTokenEvent::handle 寫 sys_tokens 新 row:
    status = TokenStatus::Active.to_string() = "unused"   ← F10.2 後對齊 nestjs

[Step 2: client POST /api/auth/refreshToken]
  nginx 路由到 nestjs(W-FA2 wire)
  nestjs jwtService.verifyAsync(refresh_token, { secret: refreshJwtSecret })
    ↓ F10.1 後 PASS(rust 簽 HS256 JWT、secret 對齊 fallback)

[Step 3: nestjs refreshTokenCheck]
  讀 DB sys_tokens row WHERE refresh_token=<token>:
    status = "unused"
  if (status !== TokenStatus.UNUSED) throw new Error('Token has already been used.')
    ↓ F10.2 後 status === "unused" → PASS、不 throw

[Step 4: nestjs RefreshTokenUsedEvent]
  UPDATE sys_tokens SET status='used' WHERE refresh_token=<token>
    ↓ DB row status: "unused" → "used"

[Step 5: nestjs return new token pair]
  HTTP 200 + body { token, refreshToken }   ← F10.2 acceptance C-V3 預期
```

**F10.2 acceptance C-V5 驗證點**:
- 跑完一次 login + refreshToken 後、sys_tokens 應有 2 row(新 login 寫的 "unused" + nestjs refresh 改的 "used")
- LIMIT 2 ORDER BY created_at DESC 取最新 2 row,最新 = "unused"(新 login)、次新 = "used"(被 refresh 過)

---

## E6: 跨 enum mapping table(rust ↔ nestjs ↔ DB)

| 狀態語意 | rust variant | rust serialize | DB column 值 | nestjs enum | nestjs read 行為 |
|---|---|---|---|---|---|
| 剛簽未用 | `Active` | `"unused"`(F10.2 後) | `"unused"` | `UNUSED='unused'` | PASS、進 refresh flow |
| 已被 refresh 用過 | `Refreshed` | `"used"`(F10.2 後) | `"used"` | `USED='used'` | throw `'Token has already been used.'`(預期 deny) |
| 已被 admin 撤銷 | `Revoked` | `"revoked"`(F10.2 後) | `"revoked"` | (無 mapping) | throw `'Token has already been used.'`(等同 deny、符合 revoked 直覺、per E-2) |

**對齊 driver**:F10.2 rust 對齊 nestjs(Constitution Principle IV「base 不改動邊界」延伸至 nestjs);DESIGN-B 階段 rust 主導,lowercase 字串值仍合理為通用 token state vocabulary(per E-2 brainstorm)。

---

## E7: Rust unit test data shape(per FR-017 + R-Q5)

**File**: `rust-api/server/constant/src/definition/consts.rs`(在既有 file 加 `#[cfg(test)] mod tests`、~12 LOC)

**Test fn**: `test_token_status_serialize_aligns_with_nestjs`(1 fn / 6 assert)

**6 個 assertion**(3 forward Display + 3 reverse FromStr):
```
forward:
  TokenStatus::Active.to_string()    == "unused"
  TokenStatus::Refreshed.to_string() == "used"
  TokenStatus::Revoked.to_string()   == "revoked"

reverse:
  TokenStatus::from_str("unused")    == Ok(TokenStatus::Active)
  TokenStatus::from_str("used")      == Ok(TokenStatus::Refreshed)
  TokenStatus::from_str("revoked")   == Ok(TokenStatus::Revoked)
```

**Imports**:
- `super::*` for TokenStatus enum
- `std::str::FromStr` trait for `from_str` method

**LOC**:1 `#[cfg(test)] mod tests` + 1 fn + 1 `use` + 6 assert = ~12 LOC

---

## Data Model 完成標誌

- ✅ E1 enum diff 5 LOC 明確
- ✅ E2 strum derive 3 macro 行為 + 優先級 + 對稱性紀錄
- ✅ E3 callsite zero-change 驗證
- ✅ E4 schema 不動驗證 + future hardening 標記
- ✅ E5 state transition flow 文字化(login → refresh → check → update → return)
- ✅ E6 跨 enum mapping table(rust ↔ nestjs ↔ DB)
- ✅ E7 unit test data shape ~12 LOC
- ✅ Ready for contracts/verification-commands.md + quickstart.md
