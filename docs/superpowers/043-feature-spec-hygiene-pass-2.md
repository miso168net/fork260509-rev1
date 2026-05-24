# 043 spec-hygiene-pass-2 — brainstorm 設計

**日期**：2026-05-24
**Feature**：`043-spec-hygiene-pass-2`
**來源**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) 衍生 follow-up 三 P1 項目 bundle（042-N3 + R5 + 041-N2）+ 041 體例擴展紀律

---

## 1. 觸發背景

2026-05-24 042 audit-outbox-and-http-mount merge 後盤點 backlog：14 條衍生 follow-up + 3 條規劃中。User 拍板優先順序：

- **P1 — 042-N3 / R5 / 041-N2**：低 effort、可一次清掉 spec/doc 層污染、不阻塞 W-F12/13/14 → 立刻啟動為「043 spec-hygiene-pass-2」
- **P2**：W-F12/13/14 啟動時順手吸收（042-N2 / 042-N6 / F3-N4）
- **P3**：合併「F-facade-atomicity-pass」大重構（F3-N1/N2/N3 / 035-N1）

041 spec-hygiene-pass-1 precedent：6 處 spec rot + 1 處 rust-api code（NormalizePathLayer）一次清完、implementer 階段擴 3 處意外修正、軌道外 rust-only + spec md。本 feature 沿用體例 + 紀律、純 spec-md（**0 rust-api code 改動**）。

---

## 2. 範圍與 Constitution 處理

### 2.1 三 user story = 三項 P1 follow-up

| US | Priority | Follow-up ID | 範圍 |
|---|---|---|---|
| US1 | P1 | **042-N3** | spec 003 / 021 / 042 內 `NOW() - INTERVAL` C-V time-window SQL TZ bug 修正（10 hits / 5 files / 3 specs）|
| US2 | P2 | **R5** | spec 005 contracts/auth-endpoints.md 補 `/auth/logout` 設計 note + token revocation research + W-F12/13/14 observability hook |
| US3 | P3 | **041-N2** | spec 002 data-model.md §E4 line 158 use 行 brainstorm 推測 path 修正 |

### 2.2 US1 — TZ fix concrete hits

`NOW() - INTERVAL '...'` pattern 在 postgres 是 timezone-aware（local TZ，e.g. `+08`），但 `sys_operation_log.created_at` 是 `TIMESTAMP without time zone`（Rust `Utc::now().naive_utc()` 寫入），兩者直接比較有 timezone offset bug（多時區誤差、e.g. 台北 +08 即 8h offset），導致 time-window query 過濾掉真實 row。

**修法 pattern**：`NOW() - INTERVAL '...'` → `(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'`。

**精確 hits**（grep 確認）：

| # | File | Line | Note |
|---|---|---|---|
| ① | `specs/003-audit-log-infrastructure/quickstart.md` | 249 | DELETE FROM sys_operation_log cleanup query |
| ② | `specs/021-systemmanage-alias-router/tasks.md` | 180 | Task acceptance audit log query |
| ③ | `specs/021-systemmanage-alias-router/tasks.md` | 182 | Task acceptance COUNT query |
| ④ | `specs/021-systemmanage-alias-router/spec.md` | 115 | US1.3 audit verification acceptance scenario |
| ⑤ | `specs/021-systemmanage-alias-router/contracts/verification-commands.md` | 330 | C-V audit query |
| ⑥ | `specs/021-systemmanage-alias-router/contracts/verification-commands.md` | 334 | C-V COUNT query |
| ⑦ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 296 | C-V7 outbox stats time filter |
| ⑧ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 307 | C-V7 sys_audit_outbox cleanup |
| ⑨ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 433 | C-V8 outbox pending after redis 恢復 |
| ⑩ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 512 | C-V12 Part A cleanup |

**Acceptance**：每處 fix 後跑修正版 C-V SQL，確認回傳 row 數對齊 spec expected。

### 2.3 US2 — /auth/logout doc + research + W-F12 hook

**現狀**：
- spec 005 contracts/auth-endpoints.md 列 4 endpoint（`POST /auth/login` / `GET /auth/getUserInfo` / `GET /route/getUserRoutes` / `GET /route/getConstantRoutes`）
- rust-api 無 `/auth/logout` endpoint（HTTP 404）
- base-web 走 client-side discards token（`VITE_SERVICE_LOGOUT_CODES` env 控、配套 401/403/4xx response code）

**修法**：spec 005 contracts/auth-endpoints.md 加新 §「Logout（無 server endpoint by design）」：

1. **Current design** — 為何無 server-side logout：JWT stateless、token 過期靠 `exp` claim、client-side discard 即等效 logout
2. **Token revocation research** — 何時需要 server-side：
   - Pattern A: Redis token blacklist（active token 加入 blacklist 直到 `exp`）
   - Pattern B: Short-TTL access token + refresh token rotation
   - Pattern C: JWT versioning（每 user 一個 token version、user 操作 force version bump）
3. **何時需 trigger** — 觸發點：強制登出（admin 撤權）、token 洩漏、合規場景（HIPAA / PCI-DSS 等）
4. **W-F12/13/14 hook** — observability 三件套若加入 session tracking / anomaly detection、可在該 feature 內補完 server-side revocation（Pattern A Redis blacklist 與 042 audit:events stream 同基礎設施、複用程度高）

**Acceptance**：human review only（純 doc-only、無 acceptance script）。

### 2.4 US3 — 002 §E4 use 行 fix

**現狀**：`specs/002-soft-delete-infrastructure/data-model.md` line 158：

```rust
use server_model::admin::entities::{
    sys_user, sys_role, sys_menu, sys_domain, sys_organization, sys_endpoint, sys_access_key
};
```

實作位置在 `server-model` crate 內、應該 `use crate::admin::entities::{...}`（同檔 line 186 / 362 已是正確 form）。本處為 brainstorm 期推測殘留、F2.1 / F3 既有 impl 已對齊。

**修法**：line 158 改 `use crate::admin::entities::{...}`。

**Acceptance**：grep 確認改完、不再有 `use server_model::admin::entities` 殘留。

### 2.5 implementer 階段擴展紀律（per 041 體例）

implementer 若 grep 發現鄰近 spec rot（同類 TZ pattern、同類 brainstorm-period stale use 行、同類 spec command drift）：

1. 在 plan 階段於 「Implementer-stage Expansion Allowed」表登記候選
2. 動手前回報 user 確認該處要不要拾取
3. 拾取的處所在 tasks.md 個別 task 顯式記錄
4. 拾取上限：≤3 處（避免 scope creep）

### 2.6 Boundary & Constitution

- **0 base-web 改動** — 與 W-WEBUI 軌道無關
- **0 rust-api code 改動** — 與 041 不同、本 feature 純 spec-md
- **0 schema migration**、**0 新 entity**、**0 nestjs**（已退場、F14）
- 軌道屬性：軌道**外**、純 spec md（同 041 模式但更純）
- **不需** Constitution amendment、**不**更新 [`DESIGN-W-WEBUI`](../INTEGRATION-DESIGN-W-WEBUI.md)
- Constitution v1.4.0 五大 Principle 全 PASS（純 spec md errata）

---

## 3. Q & A 拍板

**Q1**：042-N3 TZ fix scope 從哪到哪？
**A1**：主動掃 + 一次修所有 hit（cross-spec、不留尾巴）。grep 證實只有 003 / 021 / 042 三 spec hit pattern、027 並無此 pattern（user 原列為候選實 grep 後排除）。

**Q2**：R5 /auth/logout doc 多深？
**A2**：補 design note + token revocation research + W-F12/13/14 hook（最深選項）。產出可作為 W-F12 觀測 feature 的 prerequisite design input。

**Q3**：implementer 階段發現鄰近 spec rot 是否順手修？
**A3**：順手修、同 041 體例（允許擴展、需 user 確認、≤3 處上限）。

---

## 4. Acceptance criteria

### 4.1 US1 — TZ fix acceptance

dev stack 健康下、跑每處改後 SQL：

- ① spec 003 quickstart cleanup：執行 1 個 admin write 後跑 cleanup query、預期成功刪除 row
- ②③④⑤⑥ spec 021：跑改後 batchDeleteUser audit verification、COUNT ≥ 1
- ⑦⑧⑨⑩ spec 042：跑改後 C-V time-window query、預期回 ≥1 row（前面 C-V12 重跑時 N3 同 bug 已親自踩過）

### 4.2 US2 — /auth/logout doc acceptance

- spec 005 contracts/auth-endpoints.md 含新 §「Logout (no server endpoint)」
- §內列：current design / research / triggering scenarios / W-F12 hook
- W-F12 brainstorm doc（若已存）加一行「W-F12 spec 內若決定加 server-side revocation、可參考 043 spec 005 logout § design」

### 4.3 US3 — 002 §E4 use 行 fix acceptance

- spec 002 data-model.md line 158 已改 `use crate::admin::entities::{...}`
- `grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/` 期望 0 hit

### 4.4 全 feature 完成 acceptance

- 14 follow-up 衍生 table 移除 042-N3 + R5 + 041-N2 三 row
- 已完成里程碑加 043 entry
- Current Focus 下一步從「043 進行中」→「W-F12/13/14 observability」

---

## 5. 估時 + 階段時序

| 階段 | 內容 | 估時 |
|---|---|---|
| spec-kit specify | `/speckit-specify`（with /speckit-clarify 0 question expected） | 30min |
| spec-kit plan | `/speckit-plan`（research + data-model + contracts + quickstart） | 1h |
| spec-kit tasks | `/speckit-tasks` | 15min |
| spec-kit analyze | `/speckit-analyze` | 15min |
| Implement | US1 (10 hit fix + verify) + US2 (research + doc) + US3 (line fix) | 2.5h |
| Acceptance + commit + merge | C-V replay + INTEGRATION-CHECKLIST cleanup + 兩段式 commit + merge | 30min |
| **總計** | | **~5h**（含 spec-kit 全套件） |

User 原估「<3h」為純 impl 時間、含 spec-kit framework overhead 後 ~5h 較合理。如要壓縮：略 research 深度或併 US2 至 spec hygiene 系列下次 pass。

---

## 6. 軌道分類

軌道**外**、純 spec md：

- workspace-level spec md edits（per CLAUDE.md §1：直接落 outer feature branch、無 base-web/rust-api SHA pin 變動）
- outer feature branch `043-spec-hygiene-pass-2`（per spec-kit before_specify pre-hook 自動建）
- merge `--no-ff` 回 `rev1-admin-root`（per CLAUDE.md §4.1 + 041 體例）
- **無**第一段 worktree commit（無 rust-api / base-web 改動）

---

## 7. Out of scope（明確排除）

- **0 rust-api code 改動**（與 041 之 NormalizePathLayer 不同）
- **0 base-web 改動**
- 不修 P2 項目（042-N2 / 042-N6 / F3-N4 — 由 W-F12/13/14 順手）
- 不修 P3 項目（F3-N1/N2/N3 / 035-N1 — F-facade-atomicity-pass 統一處理）
- **不**實作 `/auth/logout` server endpoint（僅 doc note + research、實作留 W-F12 觀測 feature）
- **不**改 `sys_operation_log.created_at` schema 為 TIMESTAMPTZ（rust-api 100% UTC + naive 為設計、本 fix 只動 spec SQL）

---

## 8. 下一步

`/speckit-specify` with input：「043 spec-hygiene-pass-2: 042-N3 (C-V SQL TZ bug 跨 003/021/042 共 10 hits) + R5 (/auth/logout design note + token revocation research + W-F12 hook) + 041-N2 (spec 002 §E4 use 行 fix) bundled。軌道外 pure spec md、0 rust-api / 0 base-web。implementer 階段擴展紀律 per 041 體例。詳見 docs/superpowers/043-feature-spec-hygiene-pass-2.md brainstorm 文件」
