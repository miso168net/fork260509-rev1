# F10.2 — rust-tokenstatus-string-align

**Date**: 2026-05-19
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-19(4 顯式拍板 Q + project context exploration via grep)

---

## Scope summary

rev1 application Phase 4 **第三個** feature(F10 wire-up + F10.1 R-8 修後接續、F11/F13 之前)。**修 R-7**:rust `TokenStatus` enum strum serialize 從 `SCREAMING_SNAKE_CASE` 改 `snake_case` + 2 個 per-variant override 對齊 nestjs `TokenStatus` enum(`UNUSED = 'unused'` / `USED = 'used'`)。落地後 F10/F10.1 acceptance surface 的 R-7 friction(`'Token has already been used.'`)消除、refreshToken end-to-end pass(login → refreshToken HTTP 200 + 新 token pair + sys_tokens 雙 row state transition)。範疇刻意收緊到「**rust TokenStatus enum 字串值對齊**」、**不動 nestjs source / 不改 sys_tokens schema / 不加 DB migration backward compat / 不驗 base-web e2e / 不升 RS256**。

**Application Phase 4 第三個 feature**(F10/F10.1 已落):wire-up baseline + R-8 修完整、R-7 修 = F10.2 收尾,Phase 4 完成後 refreshToken end-to-end pass、F11/F13/F14 解鎖。

**Commit 模式**:**兩段式**(per CLAUDE.md §4.1、類 F10.1/F5.1/F6):rust-api worktree 1 commit + outer 1-2 commit(spec docs + INTEGRATION-CHECKLIST.md milestone + rust-api SHA pin;**無 docker-compose.yml 改**,F10.1 wire 已涵蓋)。

---

## Authoritative parents

- [`specs/017-refresh-token-nestjs-bridge/spec.md`](../../specs/017-refresh-token-nestjs-bridge/spec.md)(F10 spec、R-7 finding source、F10.2 解鎖 follow-up 之一)
- [`specs/018-rust-jwt-refresh-token-signing/spec.md`](../../specs/018-rust-jwt-refresh-token-signing/spec.md)(F10.1 spec、明列 F10.2 為 outbound 解鎖 + R-7 surface 為 F10.1 acceptance 預期結果)
- F10.1 acceptance C-V3 + C-V4 evidence(R-7 surface 屬實:`tokens.entity.ts:27:19 refreshTokenCheck` stack trace + `'Token has already been used.'` 3 line)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.2「nestjs source **不改**,只用既有 build artifact / docker image」(F10.2 嚴守、改 rust 遷就 nestjs)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 application Phase 4(F10/F10.1/F10.2 series 收尾)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork 完全零改動;Principle V「漸進收縮」— F10.2 修 friction 屬過渡,DESIGN-B 階段 lowercase enum 仍保留)
- 既有 rust `TokenStatus` enum(`rust-api/server/constant/src/definition/consts.rs:6-13`、3 variant + strum derive macro)
- 既有 rust `access_token_event.rs:30`(`status: Set(TokenStatus::Active.to_string())` 唯一寫入 callsite、F10.2 不動但行為自動跟著新 serialize)
- 既有 rust `TokenStatus::is_valid()` / `can_refresh()`(line 15-23、只 match Active variant、與 string repr 無關、F10.2 不動)
- 既有 nestjs `TokenStatus` enum(`fork260509-soybean-admin-nestjs/backend/apps/base-system/src/lib/bounded-contexts/iam/tokens/constants.ts:5-8`、`UNUSED = 'unused'` / `USED = 'used'`)
- 既有 nestjs `tokens.entity.ts:33`(`if (this.status !== TokenStatus.UNUSED) throw new Error('Token has already been used.')` — F10.2 對齊點)
- 既有 nestjs `token-generated.event.handler.ts:22`(`status: TokenStatus.UNUSED` — nestjs 自寫 sys_tokens status 為 `"unused"`、F10.2 後 rust + nestjs 寫入字串值對齊)

---

## Clarifying Q (4 個 brainstorm 拍板)

### Q1 — Revoked variant 怎麼處理?

**A:保留 rust-only 狀態、serialize 為 `"revoked"`**。

理由:
- nestjs 只有 2 狀態(unused/used)、無 revoked 對應
- rust 既有 Revoked 用於 admin 手動撤銷 token 場景(語意上「security 強制終止」),保留是高審潔語意
- nestjs 看到 `"revoked"` !== `"unused"` 仍 throw deny → 等同 admin block 效果(符合 revoked 直覺)
- DESIGN-B 階段 rust 自管 revoke 紀律不以 nestjs 為準、Revoked variant 保留無破壞

對比:
- **Option B 刪除 Revoked**:過度約束、丟失 admin revoke capability
- **Option C 混合 SCREAMING/snake**:讀起來不一致、無語意收益

### Q2 — enum serialize 實作路徑

**A:strum `serialize_all = "snake_case"` + per-variant override**(Active="unused"、Refreshed="used")、~3-4 LOC enum 改。

最終 mapping 表:

| rust variant | strum attribute | 寫入 DB | nestjs 讀取期望 | 結果 |
|---|---|---|---|---|
| `Active` | `#[strum(serialize = "unused")]` override | `"unused"` | `"unused"` | refreshToken 走通 |
| `Refreshed` | `#[strum(serialize = "used")]` override | `"used"` | `"used"` | already-used 判定對齊 |
| `Revoked` | (snake_case default) | `"revoked"` | — | rust-only,nestjs 看到 !== unused 仍 deny |

理由:
- per-variant override 明確、覆蓋自動 serialize_all 行為
- snake_case default 自動處理 Revoked(無需第 3 個 override line)
- enum 本身 ~3-4 LOC 改 + callsite 零改(`access_token_event.rs:30` `TokenStatus::Active.to_string()` 自動換值)

對比:
- **Option A 純 serialize_all=snake_case**:Active 變 `"active"` 而非 `"unused"`,R-7 不修
- **Option C 改 callsite manual mapping**:enum 零改但邏輯散在 callsite、未來多 callsite 重複

### Q3 — DB backward compat

**A:不處理舊 row,acceptance 重 login**。

理由:
- 舊 `"ACTIVE"` row 為 F10.1 測試遺留、未來自然過期 or 手動清
- acceptance 設計為證 = login 拿新 token → refreshToken work、舊 row 路徑非 F10.2 證明目標
- spec 不動 schema / 不加 migration、scope 最小
- nestjs 對舊 `"ACTIVE"` 仍 throw R-7 message — 但這是「舊 row 路徑」的預期行為、不影響新登入用 token 的 refresh 流程

對比:
- **Option B 加 migration UPDATE 舊 row**:F10.2 規模從 ~18 LOC 變 ~35 LOC、migration init container 需 rerun、過度
- **Option C rust 讀取面 backward compat**:解決 rust 自己讀但不解 nestjs 讀、不解本問題

### Q4 — rust unit test 紀律

**A:SHOULD、1 個 unit test 對 3 variant serialize + 3 reverse from_str assert**(~12 LOC、加在既有 consts.rs `#[cfg(test)] mod tests` 或新加 module)。

理由:
- F10.2 邏輯 stack-可見(refreshToken HTTP 200 即驗 enum serialize 對),unit test 提供 fast feedback(rebuild image ~5-7 min vs unit test ~30s)
- enum derive macro 行為(per-variant override 真覆蓋 serialize_all 嗎)是 stack-不可見的微妙點、unit test 是適合 layer
- 比 F10.1 unit test(2 個、~30 LOC)規模小,但同性質紀律維持

對比 F10.1 clarify Q3 結論:F10.1 是 MUST(critical path 含 stack-不可見 fallback 邏輯),F10.2 是 SHOULD(critical path stack-可見),反映兩 feature LOC + 邏輯複雜度差異。

---

## Implementation

**改動範圍**(~5-6 LOC core + ~12 LOC unit test = ~18 LOC total、**單一 file** `rust-api/server/constant/src/definition/consts.rs`):

```rust
#[derive(Debug, Clone, PartialEq, Eq, AsRefStr, Display, EnumString)]
#[strum(serialize_all = "snake_case")]  // F10.2: SCREAMING_SNAKE_CASE → snake_case
pub enum TokenStatus {
    /// 活跃状态，可以正常使用(F10.2 對齊 nestjs `UNUSED = 'unused'`)
    #[strum(serialize = "unused")]
    Active,
    /// 已被刷新，表示该 token 已被新 token 替换(F10.2 對齊 nestjs `USED = 'used'`)
    #[strum(serialize = "used")]
    Refreshed,
    /// 已被撤销(rust-only 狀態、無 nestjs 對應、serialize 為 "revoked")
    Revoked,
}

impl TokenStatus {
    pub fn is_valid(&self) -> bool {
        matches!(self, TokenStatus::Active)
    }

    pub fn can_refresh(&self) -> bool {
        matches!(self, TokenStatus::Active)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_token_status_serialize_aligns_with_nestjs() {
        // forward: Display via strum AsRefStr / Display
        assert_eq!(TokenStatus::Active.to_string(), "unused");
        assert_eq!(TokenStatus::Refreshed.to_string(), "used");
        assert_eq!(TokenStatus::Revoked.to_string(), "revoked");

        // reverse: EnumString from_str (對齊 nestjs 字串 → rust enum 反向解析)
        assert_eq!(TokenStatus::from_str("unused").unwrap(), TokenStatus::Active);
        assert_eq!(TokenStatus::from_str("used").unwrap(), TokenStatus::Refreshed);
        assert_eq!(TokenStatus::from_str("revoked").unwrap(), TokenStatus::Revoked);
    }
}
```

**不需動的**:
- `access_token_event.rs:30`(`TokenStatus::Active.to_string()` 自動換值、callsite 零改)
- `is_valid()` / `can_refresh()` 邏輯不變(只 match Active variant、與 string repr 無關)
- 其他 TokenStatus consumer(若有、grep 確認)— 全走 enum API、自動跟著新 serialize
- **無 yaml / 無 envvar / 無 docker-compose / 無 base-web / 無 nestjs / 無 migration / 無 application.yaml**

**Two-stage commit**(per CLAUDE.md §4.1):
- **Stage 1 rust-api worktree commit**:1 file(`consts.rs`)~18 LOC、conventional commit `feat(rust-api): F10.2 對齊 TokenStatus enum 字串值到 nestjs`
- **Stage 2 outer commit**:spec docs(`specs/019-rust-tokenstatus-string-align/` 8 file)+ CLAUDE.md SOP marker + INTEGRATION-CHECKLIST.md milestone + `.specify/feature.json` + rust-api SHA pin、conventional commit `feat(spec): F10.2 rust-tokenstatus-string-align — R-7 修 + refreshToken end-to-end pass`
- **Stage 3 push wait**:user 同意後 push rust-api + outer 019 + merge --no-ff + SHA fill follow-up + push rev1-admin-root

**Acceptance scope**:6 個 C-V + 1 個 unit test = **7/7**(spec 階段定 NFR ≤ 15s acceptance phase)

---

## Acceptance

**stack**:W-FA1 dev + `--profile track-a`(F10.1 落地後同 stack)。**user**:`Soybean`(對齊 F10/F10.1)。

### US1 P1 MVP — R-7 修 + refreshToken end-to-end pass

**C-V1 unit test**:
```bash
cd rust-api && cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs
```
預期 PASS(3 forward + 3 reverse assert)

**C-V2 login → refreshToken HTTP 200**:
```bash
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['refreshToken'])")
curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" http://127.0.0.1:11080/api/auth/refreshToken | head -c 400
```
預期 HTTP **200** + body 含 `token` + `refreshToken`(新 pair)— R-7 修確認、refreshToken 業務流程走通

**C-V3 nestjs log 無 error**:
```bash
docker compose logs nestjs --tail=80 2>&1 | grep -E "Token has already been used|JsonWebTokenError|jwt malformed"
```
預期 **0 line**(R-7 修 + F10.1 R-8 仍修)

### US2 P2 — DB 準據驗 sys_tokens state transition

**C-V4 psql sys_tokens 雙 row state transition**:
```bash
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT status, char_length(refresh_token) AS rt_len, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 2"
```
預期 2 row:最新 `status='unused'`(rust 新登入寫入)、次新 `status='used'`(nestjs refreshToken 用過後寫入)

### US3 P3 — F10.1 secret 對齊 regression

**C-V5 fallback chain regression**:
```bash
docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"
```
預期 `REFRESH_TOKEN_SECRET=<value>` == `JWT_SECRET=<value>`(F10.1 既有對齊維持)

### Zero-regression(對齊 F10.1 same pattern)

**C-V6 three-side scope verify + W-FA1 stack regression**:
```bash
git diff HEAD -- base-web/src/ | wc -l                                        # 預期 0
git diff HEAD -- fork260509-soybean-admin-nestjs/ | wc -l                    # 預期 0
(cd rust-api && git diff HEAD --stat)                                         # 預期 1 file (consts.rs) ~18 LOC
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"     # 預期 6 service healthy + migration exited 0
```

### 完成標誌

- **US1 3/3 + US2 1/1 + US3 1/1 + zero-regression 1/1 = 6/6 PASS + unit test 1/1 = 7/7**
- rust-api **1 file** ~5 LOC enum 改 + ~12 LOC unit test = ~18 LOC
- outer **0 docker-compose** / 1 INTEGRATION-CHECKLIST.md / 1 CLAUDE.md(SOP marker)/ 1 `.specify/feature.json` / 8 spec docs
- 兩段式 commit(per F10.1 / F6 慣例)
- rust-api image rebuild ~5-7 min cold(只改 1 source file,builder 仍 recompile)

---

## Constitution Check

| Principle | 評估 |
|---|---|
| I — RBAC Fail-safe(Casbin 後端強制) | N/A — 不涉 Casbin enforce |
| II — Soft Delete + 全域 Audit | PASS by inheritance — 不動 `AccessTokenEvent::handle()` audit boundary、只改 status enum 字串值 |
| III — 嚴禁 Forward + 單一職責 | PASS — rust enum local 改、無 forward |
| IV — base 不改動邊界 | PASS — base-web + nestjs fork 兩邊 zero diff(per FR + SC) |
| V — 漸進收縮(DESIGN-B 終局) | PASS — F10.2 屬 DESIGN-A 過渡修;DESIGN-B 階段 rust 自驗 refresh token 時 status 邏輯換 rust 主導、F10.2 的 lowercase enum 仍可保留(無破壞性、語意中性) |

**架構約束**:Secret 注入 / DB schema / TLS / port / observability / backup / 背景工作 / CI/CD 全 N/A;結構化 log rust 既有 tracing 不動。

**開發流程**:spec-kit 全跑 / 兩段式 commit / conventional commit 中文 subject / push 確認 / TLS N/A / DESIGN 文件權威 / 抽離項升級 N/A — 全 PASS。

**Constitution Check 結果**:**5 Principle 全 PASS(II inheritance)+ 13 N/A architectural + 6 PASS 流程 = 24 PASS / 13 N/A / 0 violation,無需 Complexity Tracking**。

---

## Risks

- **R-1**(極低)**strum per-variant override 與 serialize_all 互動意外**:strum derive macro 對 `#[strum(serialize = "...")]` per-variant override 是否真覆蓋 `serialize_all` 行為。**緩解**:C-V1 unit test 對 3 forward + 3 reverse assert、如 derive 行為意外則 unit test red、改 enum 設計(可能改 Option B 全 per-variant override)。

- **R-2**(低)**未涵蓋的 TokenStatus consumer**:`access_token_event.rs:30` 是唯一 grep 出的 callsite,但若有 SQL hard-coded `'ACTIVE'` literal(非透過 enum)會 silent fail。**緩解**:grep `'ACTIVE'|'REFRESHED'|'REVOKED'` SCREAMING-quoted literal 確認無 SQL hard-code;C-V4 psql 雙 row 驗 status transition,如有 hard-code 會 surface。

- **R-3**(極低)**EnumString reverse parse 在 callsite**:`TokenStatus::from_str("unused")` 是否被生產程式碼用到。**緩解**:grep `TokenStatus::from_str|FromStr.*TokenStatus`,若有 callsite 確認舊 string 已不再被 parse;F10.2 acceptance phase 重 login、無舊 row from_str 路徑。

- **R-4**(低)**rust image rebuild 改 1 source file 仍觸 builder recompile**:cargo `--bin server` 改 1 source = 整 server crate dep tree recompile、~5-7 min cold。**緩解**:NFR 容忍;build cache 可能 hit constant crate 以外 dep。

- **R-5**(極低)**`is_valid` / `can_refresh` 邏輯仍只 match `Active`**:F10.2 後 `Active` variant 仍存在(只改字串值)、helper 邏輯不變。R-5 屬「驗證 R-2 不漏」次要點。

- **R-6**(極低)**舊 sys_tokens row backward compat 仍可能干擾 acceptance**:若 acceptance 跑時 DB 有 `"ACTIVE"` 舊 row,C-V4 sort by created_at DESC LIMIT 2 可能取到舊 row。**緩解**:C-V2 acceptance 先用全新 login(會寫新 row 為 `"unused"`),再跑 refreshToken(把該 row 改成 `"used"`),C-V4 兩 row 必是 F10.2 路徑;舊 row 排在 LIMIT 之外。

---

## Out of Scope

- nestjs source 任何改動(嚴守 DESIGN-A §3.2 + F10/F10.1 Q 延伸)
- sys_tokens schema 結構改動(W-FA1 已驗對齊)
- DB backward compat migration 改舊 row(per Q3 拍板、scope 最小)
- rust 自實作 refresh token rotation(F13)
- rust 自驗 refresh token(F13)
- JWT 演算法升 RS256 / key versioning(F1.2)
- base-web SPA e2e refreshToken 自動化(F11 之後)
- audit log sys_operation_log 寫入(F13)
- TokenStatus 增加新 variant(如 Expired)
- refresh_secret rotation / key rolling(F1.2)

---

## Dependencies

### Inbound(本 feature 依賴)

- **F10** `refresh-token-nestjs-bridge`:wire-up baseline。✅(merge `8f0e84c`)
- **F10.1** `rust-jwt-refresh-token-signing`:R-8 修(rust 簽 HS256 JWT)、F10.2 前提(nestjs verify 須 pass 才走到 status check)。✅(merge `48b70e6`)
- **W-FA1/W-FA2/W-FA3** Track DESIGN-A 三件套。✅
- **F1.1** `jwt-secrets`、**F4** `response-shape-alignment`、**F5.1** `auth-login-and-dynamic-menu`。✅

### Outbound(本 feature 解鎖)

- **F11** `extracted-stubs`:F10/F10.1/F10.2 完整通後 nestjs refreshToken end-to-end pass、F11 剩餘 stub endpoint 範疇可清楚定義
- **F13** `rust-refresh-token-impl`:rust 自驗 refresh token 時 status enum 字串值已對齊 nestjs / DB / sys_tokens 邏輯、F13 不需再對齊
- **F14** `design-a-to-b-cutover`:F10.2 lowercase enum 在 DESIGN-B 階段保留(rust 主導、nestjs 退出後仍是 lowercase、無破壞性)

---

## Assumptions

- **A-001**: F10 已 merge(`8f0e84c`)。✅
- **A-002**: F10.1 已 merge(`48b70e6`)。✅
- **A-003**: W-FA1/W-FA2/W-FA3 已 merge,track-a stack 7 service expected state 可起。✅
- **A-004**: F4 + F5.1 + F6 已 merge,login flow + envelope shape 維持。✅
- **A-005**: nestjs prisma SysTokens model + rust sys_tokens schema 對齊(W-FA1 已驗、F10.2 不重做)。✅
- **A-006**: rust + nestjs HS256 algorithm 對齊(F10.1 已驗)。✅
- **A-007**: `refresh_token_secret` Docker secret file 在 dev 為空、走 F10.1 fallback 路徑(兩端 effective secret 對齊)。✅
- **A-008**: rust-api image rebuild ~5-7 min cold(對齊 F10.1 baseline + W-F1)。
- **A-009**: rust `TokenStatus` 只有 `access_token_event.rs:30` 唯一寫入 callsite(grep 驗、無其他 hard-coded SQL `'ACTIVE'` literal)— R-2 緩解。
- **A-010**: 舊 `sys_tokens` row(F10.1 acceptance 遺留)不干擾 F10.2 acceptance(per R-6 緩解、LIMIT 2 取新登入 + 新 refresh 兩 row)。

---

## Naming + numbering

- **Outer branch + spec dir**:`019-rust-tokenstatus-string-align`(spec-kit before_specify hook 自動建)
- **Brainstorm doc**:`docs/superpowers/019-feature-rust-tokenstatus-string-align.md`(本檔)
- **Application Phase 4 third feature**:F10.2(F10 wire-up → F10.1 R-8 修 → F10.2 R-7 修)

---

## Next Steps

1. ✅ Brainstorm doc(本檔)
2. `/speckit-specify` — 由 brainstorm 產生 spec
3. `/speckit-clarify` — 若 spec 有未明點(預期不會、4 個 Q 已拍板)
4. `/speckit-plan` — Phase 0 research + Phase 1 design + data-model + contracts + quickstart
5. `/speckit-tasks` — 預估 8-12 task(較 F10.1 20 task 緊湊、單 file scope)
6. `/speckit-implement` 或 subagent-driven-development 跑完
7. 兩段式 commit + push wait + merge --no-ff + SHA fill follow-up
