# Phase 0 Research — 043 spec-hygiene-pass-2

**日期**：2026-05-24
**Phase**：Phase 0（research、resolve assumptions + 驗證 brainstorm 階段假設）
**前置**：[`spec.md`](./spec.md)（16/16 PASS、0 NEEDS CLARIFICATION）+ [`docs/superpowers/043-feature-spec-hygiene-pass-2.md`](../../docs/superpowers/043-feature-spec-hygiene-pass-2.md)（brainstorm 3 Q&A 拍板）

依 [`CLAUDE.md §3 Phase 0 research 紀律`](../../CLAUDE.md)：必含實際 grep 結果 + 真實 reproducer 驗證、不信 brainstorm 階段的抽象假設。

---

## R-1：TZ bug 真實 reproducer

**Decision**：TZ bug 確認存在、但**只在 time-window < server TZ offset** 時才表現為 0-row 誤判；對寬窗口（e.g. `24 hours`）postgres 仍能正確過濾。

**Rationale**（postgres 跑 dev stack 實測）：

```sql
SELECT NOW() AS now_pg_tz_aware,
       (NOW() AT TIME ZONE 'UTC')::timestamp AS now_pg_utc_naive,
       (SELECT MAX(created_at) FROM sys_operation_log) AS latest_log_naive;

-- 實機結果:
--   now_pg_tz_aware       | 2026-05-24 19:37:59.316375+08
--   now_pg_utc_naive      | 2026-05-24 11:37:59.316375
--   latest_log_naive      | 2026-05-24 11:00:43.679478
```

關鍵觀察：
- postgres 容器 timezone = `Asia/Taipei` (+08)；`NOW()` 返回 TIMESTAMPTZ（含時區）
- `sys_operation_log.created_at` 為 `TIMESTAMP without time zone`（Rust `Utc::now().naive_utc()` 寫入、無 TZ info）
- postgres 比較 `TIMESTAMP > TIMESTAMPTZ` 時、會把 TIMESTAMP 用 server timezone 解釋成 TIMESTAMPTZ
- 因此 `created_at=11:00:43`（被 server 認作 `+08`）→ 真實 UTC moment 為 `2026-05-24 03:00:43 UTC`
- `NOW() - INTERVAL '10 seconds'` ≈ `11:37:49 UTC` → `03:00:43 < 11:37:49` → **過濾掉**

**寬窗口無誤差**：

```sql
SELECT COUNT(*) FROM sys_operation_log WHERE created_at > NOW() - INTERVAL '24 hours';
--   old_filter_hits | 770

SELECT COUNT(*) FROM sys_operation_log WHERE created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '24 hours';
--   new_filter_hits | 770
```

兩者結果一致是因為 `24h >> 8h offset`、舊 SQL 仍 cover 全部 row。

**窄窗口才咬人**：對 `10 seconds` / `5 seconds` / `5 minutes` 等 spec 用的窄窗口、8h offset 直接過濾掉所有真實 row（C-V12 Part B 重跑時親自踩坑）。

**Alternatives considered**：
- 改 `sys_operation_log.created_at` schema 為 `TIMESTAMPTZ`：拒——影響面太大、需動 migration + Sea-ORM entity + 全 audit pipeline、scope 翻倍（per spec assumption「rust-api `Utc::now().naive_utc()` 寫入慣例不變」）
- 改 postgres container timezone 為 UTC：拒——影響 prod / dev 一致性、運維成本未必更低；spec 層級修正更 surgical

---

## R-2：fix pattern 正確性驗證

**Decision**：採 `(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'` pattern。實測 dev stack postgres 正確、與 `sys_operation_log.created_at` UTC naive 型別語意對齊。

**Rationale**：
- `NOW() AT TIME ZONE 'UTC'` 把 TIMESTAMPTZ 轉成 UTC TIMESTAMP（仍含 TZ info）
- `::timestamp` cast 剝離 TZ → TIMESTAMP without time zone（與 `sys_operation_log.created_at` 同型別）
- 兩者直接比較不再經 server timezone 轉換、結果一致

**驗證 plan**（acceptance 階段執行）：

```sql
-- 觸發 1 個 admin write、產生 sys_operation_log row
-- 跑改後 query:
SELECT COUNT(*) FROM sys_operation_log
WHERE created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds';
-- 預期 ≥1 row（剛剛產生的 audit row）
```

**Alternatives considered**：
- `created_at AT TIME ZONE 'UTC' > NOW() - INTERVAL ...`：拒——postgres 把 TIMESTAMP `AT TIME ZONE 'UTC'` 解作 "this naive timestamp is UTC, convert to TIMESTAMPTZ" → 結果是 TIMESTAMPTZ，要再 cast 才對；繞圈
- `created_at > NOW()::timestamp - INTERVAL ...`：拒——`NOW()::timestamp` 直接 cast 會保留 server TZ time（`19:37:59` 而非 `11:37:59`），仍與 UTC naive 不符

---

## R-3：10 處 hit 精確 enumerate

**Decision**：10 處 hit 在 5 個檔、3 個 spec；grep 確認、無遺漏。

**Rationale**：

```bash
grep -rn "NOW() - INTERVAL" specs/ --include="*.md"
```

```
specs/003-audit-log-infrastructure/quickstart.md:249
specs/021-systemmanage-alias-router/spec.md:115
specs/021-systemmanage-alias-router/tasks.md:180
specs/021-systemmanage-alias-router/tasks.md:182
specs/021-systemmanage-alias-router/contracts/verification-commands.md:330
specs/021-systemmanage-alias-router/contracts/verification-commands.md:334
specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md:296
specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md:307
specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md:433
specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md:512
```

共 10 行、3 specs（003 / 021 / 042）、5 files。

**分布**：
- spec 003: 1 hit（quickstart.md cleanup query）
- spec 021: 5 hit（spec.md acceptance + tasks.md 2 + verification-commands.md 2）
- spec 042: 4 hit（verification-commands.md C-V7 / C-V8 / C-V12）

---

## R-4：spec 005 contracts/auth-endpoints.md 現有結構

**Decision**：在 spec 005 contracts/auth-endpoints.md 末段新增「§5 Logout（無 server endpoint by design）」、不修現有 4 endpoint § 內容。

**Rationale**（read 確認）：

spec 005 contracts/auth-endpoints.md 現有 § 結構：
- §1 `POST /auth/login`（public）
- §2 `GET /auth/getUserInfo`（protected）
- §3 `GET /route/getUserRoutes`（protected）
- §4 `GET /route/getConstantRoutes`（public）

新 §5 插入點：第 4 個 § 之後（最末段、不擾動既有編號）。

---

## R-5：Token revocation 3 pattern 比較

**Decision**：US2 doc 涵蓋 3 個常見 token revocation pattern + 2 個 trigger scenario class + W-F12/13/14 hook。

**Pattern 比較**（research findings）：

### Pattern A — Redis token blacklist

- 機制：active JWT 加入 Redis blacklist key（值 = exp 時間）；middleware 驗證時先查 blacklist、命中即拒
- 優點：與 042 audit:events stream 同基礎設施、複用度高；revoke 立即生效
- 缺點：每 request 多 1 次 Redis lookup（middleware overhead）；blacklist 自動 expire 需設 TTL

### Pattern B — Short-TTL access token + refresh token rotation

- 機制：access token TTL 短（e.g. 5 分鐘）、client 用 refresh token 換新；revoke 透過撤銷 refresh token
- 優點：access token validation 無 Redis lookup（純 JWT verify）；revoke 半延遲（最多 TTL 時間）
- 缺點：refresh flow 複雜度；token rotation 失敗易導致 UX 中斷
- 現況：rust-api 已有 refresh token flow（F10 / F13）、可直接擴展

### Pattern C — JWT versioning

- 機制：每 user 維護 `token_version` 欄位；JWT 內含 user version；middleware 驗證時比對 DB / cache 的 user version、不符即拒
- 優點：force-logout-all-sessions 1 行 SQL `UPDATE sys_user SET token_version = token_version + 1`
- 缺點：每 request 多 1 次 user version lookup（除非 cached）；schema 改動

### Trigger scenarios

- **Admin-driven revoke**：admin 撤權 / 停用帳號（合規 / 安全事件）
- **Anomaly-driven revoke**：W-F12 session anomaly detection（異地登入、暴衝 request rate 等）

### W-F12/13/14 hook

W-F12 observability feature brainstorm 階段可從本 § 直接取 design input、決定該 feature 是否要實作 server-side revocation（若決定要、推薦 Pattern A 因與 042 audit:events stream 基礎設施複用度高）。

---

## R-6：spec 002 §E4 use 行對照

**Decision**：line 158 `use server_model::admin::entities::{...}` → `use crate::admin::entities::{...}` 為唯一 fix（同檔 line 186 / 362 已是正確 form）。

**Rationale**（read 確認 spec 002 data-model.md）：

```
line 158: use server_model::admin::entities::{
              sys_user, sys_role, sys_menu, ...
          };

line 186: use crate::admin::entities::sys_user as _entity;   ← 已 correct
line 362: use crate::admin::entities::sys_operation_log::ActiveModel as SysOperationLogActiveModel;  ← 已 correct
```

line 158 為 brainstorm 期殘留、F3 真實 impl 已用 `use crate::admin::entities::{...}` 對齊（grep 確認 server-model crate 內檔案 100% 使用 `use crate::...`）。

**Implementer-stage expansion R-7 預掃結果**（per FR-008 紀律）：

```bash
grep -rn "use server_model::admin::entities" specs/ --include="*.md"
```

```
specs/002-soft-delete-infrastructure/data-model.md:158       ← 唯一 paste-able use 行 rot
specs/002-soft-delete-infrastructure/tasks.md:111            ← CI lint pattern reference（正確 context）
specs/002-soft-delete-infrastructure/tasks.md:292            ← lint output 樣本（正確 context）
specs/002-soft-delete-infrastructure/tasks.md:293            ← lint output 樣本（正確 context）
specs/002-soft-delete-infrastructure/tasks.md:298            ← lint output 樣本（正確 context）
```

tasks.md 4 hits 為 CI lint pattern reference（grep target path string）、實際 lint 本就應抓 `server_model::admin::entities::...` 為 target 字串、context 正確。**只有 data-model.md line 158 是 rot**。

---

## R-7：Implementer-stage expansion 候選預掃

**Decision**：執行 brainstorm doc §2.5「implementer 階段擴展紀律」、grep 候選 ≤3 處上限；本 phase 預掃結果為**0 額外候選**。

**Rationale**（grep results）：

### Candidate A — `TIMESTAMP without time zone` vs `TIMESTAMPTZ` 不一致

```bash
grep -rn "TIMESTAMPTZ\|TIMESTAMP WITH TIME ZONE" specs/ --include="*.md"
```

Hits：
- spec 002 spec.md:73 — 明示「F3 `deleted_at` 用 TIMESTAMP 而非 TIMESTAMPTZ、設計決策」（不是 rot、是 documented design choice）
- spec 042 research.md / data-model.md — `sys_audit_outbox` 表 schema 用 TIMESTAMPTZ（正確、不是 rot）

→ 0 expansion candidate from this category

### Candidate B — Stale use 行類似 patterns

per R-6 grep：tasks.md 4 hits 均為 CI lint pattern reference、context 正確、非 rot。

→ 0 expansion candidate from this category

### Candidate C — Stale `/api/<verb>` prefix

依 042 落地時發現「nginx strip `/api/`」，spec 003 / 021 / 042 內 `/api/role`、`/api/user` 等 URL 寫法可能有 spec rot（reader 不確定該寫 `/api/role` 還是 `/role`）。但 042-N2 follow-up 已明確 defer 到 P2（W-F12/13/14 順手吸收），**不**在 043 scope。

→ 0 expansion candidate (deferred to W-F12 era)

**Phase 0 結論：0 implementer-stage expansion 候選**。043 scope 嚴格 = 10 + 1 + 1 = 12 處 spec md edits（10 TZ + 1 R5 § + 1 use 行）+ 1 INTEGRATION-CHECKLIST cleanup。如 implementer 階段有意外發現、走 FR-008 紀律（plan/tasks 登記 + user 確認）。

---

## Phase 0 結論

- 7 個 research item 全 PASS、無 NEEDS CLARIFICATION 殘留
- brainstorm 3 個 Q&A 拍板假設全與真實 codebase 對齊（grep + dev stack 實測確認）
- 改動範圍精確：12 處 spec md edits + 1 INTEGRATION-CHECKLIST cleanup
- 0 rust-api code 改動、0 base-web 改動、0 schema migration、0 新 cargo crate dep
- 0 implementer-stage expansion candidate（如有意外發現走 FR-008 紀律）

Ready for Phase 1（data-model.md / contracts/verification-commands.md / quickstart.md）。
