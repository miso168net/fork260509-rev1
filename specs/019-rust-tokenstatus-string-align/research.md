# Research: F10.2 — rust-tokenstatus-string-align

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-19
**Status**: ✅ 完成

5 個 research finding(3 個 brainstorm derive concern + 2 個 implement-time grep pre-check)。所有 NEEDS CLARIFICATION 已 resolve(brainstorm 階段 4 Q 拍板 + Phase 0 pre-check 確認)。

---

## R-Q1: strum per-variant override 覆蓋 serialize_all 行為

**Decision**: strum `#[strum(serialize = "...")]` per-variant override 真覆蓋 `#[strum(serialize_all = "...")]` enum-level setting。

**Rationale**:
- strum 0.x derive macro 設計約定:per-variant `serialize` attribute 為「明確覆寫」、優先於 enum-level `serialize_all` 自動轉換
- `serialize_all` 是 default rule(影響無顯式 override 的 variant);per-variant override 是 escape hatch
- strum doc 範例(`https://docs.rs/strum/latest/strum/`)明示此優先級語意
- F10.2 設計依此:`Active` + `Refreshed` 用 per-variant override 對齊 nestjs("unused"/"used"),`Revoked` 走 serialize_all default 得 "revoked"

**Alternatives considered**:
- **Option B 全 per-variant override(3 個)**:`Revoked` 加 `#[strum(serialize = "revoked")]` 變 redundant(等於 snake_case default);更冗長 4 行 vs 3 行,語意較不乾淨(讓人疑「為何 Revoked 也要 override」)。
- **Option C 改 callsite manual mapping**:enum 零改但邏輯散在 callsite、未來多 callsite 重複、enum derive 紀律失守。

**Verification**: C-V1 unit test 對 3 forward(Active="unused" / Refreshed="used" / Revoked="revoked")assert,如 derive 行為意外則 unit test red、改回 Option B 全 per-variant override。

---

## R-Q2: `TokenStatus::Active.to_string()` 來自 Display vs AsRefStr derive

**Decision**: `.to_string()` 走 `std::fmt::Display::to_string()` blanket impl(由 strum `Display` derive 提供);與 `AsRefStr` 並存無衝突。

**Rationale**:
- rust std `to_string()` 是 `Display` 的 blanket impl(`impl<T: Display + ?Sized> ToString for T`)
- strum `Display` derive 為 enum 實作 `impl Display`,使用 enum-level `serialize_all` + per-variant `serialize` 規則生成輸出
- `AsRefStr` derive 提供 `as_ref::<str>()` method(zero-copy `&str` return)、與 `Display` 字串值相同但 API 不同
- F10.2 `access_token_event.rs:30` 用 `.to_string()` → 走 Display derive → 自動跟著新 serialize 字串值

**Evidence**:
```rust
// rust-api/server/constant/src/definition/consts.rs:4
#[derive(Debug, Clone, PartialEq, Eq, AsRefStr, Display, EnumString)]
//                                              ^^^^^^^ to_string() 透過此 derive
```

```rust
// rust-api/server/service/src/admin/events/access_token_event.rs:30
status: Set(TokenStatus::Active.to_string()),
//                              ^^^^^^^^^^^ 觸發 Display::fmt
```

**Verification**: C-V1 unit test 用 `TokenStatus::Active.to_string()` 形式 assert(對齊 callsite 實際路徑),如 Display 與 AsRefStr 不一致則 surface(預期一致、strum derive 保證)。

---

## R-Q3: SQL hard-code SCREAMING literal pre-check(FR-019 / R-2)

**Decision**: rust-api source 無 SCREAMING-quoted SQL hard-code literal、R-2 / FR-019 pre-check PASS。

**Rationale**: Phase 0 grep 驗:
```bash
cd rust-api && grep -rn "'ACTIVE'\|'REFRESHED'\|'REVOKED'" --include="*.rs" .
# 結果: 0 match
```

無任何 rust source 用 raw SQL literal `'ACTIVE'` / `'REFRESHED'` / `'REVOKED'`(沒有 hard-coded WHERE status='ACTIVE' 等 hack)。

**Evidence**: `access_token_event.rs:30` 是唯一 sys_tokens.status writeback callsite,走 enum API。F10.2 改 enum serialize 字串值會自動透過 callsite 反映到 DB,無 by-pass 路徑。

**Alternatives considered**: 若 grep surfaces hard-code literal、F10.2 spec 需加 FR 把該 literal 同步改、或拆 follow-up;Phase 0 grep 確認後 F10.2 scope 紀律維持。

**Verification**: 已執行 grep(0 line)、FR-019 已 PASS、R-2 緩解達成。spec phase + plan phase 雙保險。

---

## R-Q4: `TokenStatus::from_str` callsite pre-check(R-3)

**Decision**: rust-api production source 無 `TokenStatus::from_str` callsite、R-3 risk 完全緩解。

**Rationale**: Phase 0 grep 驗:
```bash
cd rust-api && grep -rn "TokenStatus::from_str\|FromStr.*TokenStatus" --include="*.rs" .
# 結果: 0 match
```

無 production code 用 from_str 反向 parse `"ACTIVE"` 字串、F10.2 改 serialize 字串值無 production callsite 受影響。

**Implication**: F10.2 unit test 的 reverse from_str assert(per FR-017 後半 + Q4 brainstorm)純為 **strum derive 行為 sanity check**(驗 EnumString derive 同時對齊 per-variant override、即 `from_str("unused") == Active`),非 production critical path 覆蓋。

**Alternatives considered**: 若 grep surfaces production from_str callsite、F10.2 spec 需評估該 callsite 是否能接受新字串值;Phase 0 確認後 F10.2 scope 不需擴張、unit test reverse assert 仍保留為 derive 行為 sanity。

**Verification**: 已執行 grep(0 line)、R-3 risk 完全緩解。reverse assert in C-V1 unit test 為 strum 紀律 sanity check。

---

## R-Q5: strum EnumString 反向 parse 對齊 per-variant override

**Decision**: strum `EnumString` derive 自動對齊 `#[strum(serialize = "...")]` per-variant override,`TokenStatus::from_str("unused")` returns `Ok(TokenStatus::Active)`。

**Rationale**:
- strum 0.x `EnumString` derive macro 設計約定:從 serialize 字串值反向解析、per-variant override 影響 parse 規則對稱於 serialize 規則
- 文件來源:`https://docs.rs/strum_macros/latest/strum_macros/derive.EnumString.html`
- 對稱性是 strum 預設行為:同 serialize 字串值能 round-trip(serialize → parse → 同 variant)

**Verification**: C-V1 unit test 3 reverse assert(`from_str("unused")==Active` / `from_str("used")==Refreshed` / `from_str("revoked")==Revoked`)。如反向不對齊則 unit test red、需用 `#[strum(serialize = "X", to_string = "X")]` 雙重 attribute 對齊(F10.2 預期不需、strum default 行為已滿足)。

**Alternatives considered**: 若 EnumString 反向 parse 預設用 enum variant name 而非 serialize value,F10.2 需加額外 attribute 對齊;Phase 0 確認 strum 設計為對稱、不需額外處理。

---

## Phase 0 完成標誌

- ✅ R-Q1 ~ R-Q5 全 5 個 finding 完成
- ✅ FR-019 SQL hard-code pre-check PASS(0 match)
- ✅ R-2 / R-3 risk 緩解達成
- ✅ 無 NEEDS CLARIFICATION 殘留
- ✅ Ready for Phase 1(data-model.md + contracts/ + quickstart.md)
