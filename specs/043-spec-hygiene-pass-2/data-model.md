# Data Model — 043 spec-hygiene-pass-2

**Phase**：1（Design & Contracts、Phase 1 產出）
**日期**：2026-05-24
**前置**：[`spec.md`](./spec.md)、[`research.md`](./research.md)

本 feature **無 data entity**（純 spec md edits、不動 schema、不引新 entity、不動 row）。為對齊 spec-kit 流程模板、本檔以 **「Spec Rot Inventory」** 表取代典型 entity 章節，作為 implementer 操作的 single source of truth。

---

## E1. Spec Rot Inventory（12 處精確 edit）

對齊 [`research.md`](./research.md) R-3 / R-5 / R-6 結果。

### Patch Type 1 — TZ Fix（US1、10 處）

| # | File | Line | Current Pattern | Fix To |
|---|---|---|---|---|
| ① | `specs/003-audit-log-infrastructure/quickstart.md` | 249 | `created_at > NOW() - INTERVAL '1 hour'` | `created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '1 hour'` |
| ② | `specs/021-systemmanage-alias-router/spec.md` | 115 | `created_at > NOW() - INTERVAL '5 minutes'` | `created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '5 minutes'` |
| ③ | `specs/021-systemmanage-alias-router/tasks.md` | 180 | `created_at > NOW() - INTERVAL '5 minutes'` | 同上 fix pattern |
| ④ | `specs/021-systemmanage-alias-router/tasks.md` | 182 | 同上 | 同上 |
| ⑤ | `specs/021-systemmanage-alias-router/contracts/verification-commands.md` | 330 | 同上 | 同上 |
| ⑥ | `specs/021-systemmanage-alias-router/contracts/verification-commands.md` | 334 | 同上 | 同上 |
| ⑦ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 296 | `created_at > NOW() - INTERVAL '10 seconds'` | `created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '10 seconds'` |
| ⑧ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 307 | 同上 | 同上 |
| ⑨ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 433 | `created_at > NOW() - INTERVAL '5 seconds'` | `created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '5 seconds'` |
| ⑩ | `specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md` | 512 | 同上 | 同上 |

**Implementer note**：每處可用 sed 機械式替換、但**逐處跑修後 SQL** 驗證 acceptance（避免 collateral edit、確認語意正確）。

```bash
# 批次 sed example（單檔）
sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" specs/<spec>/<file>.md
```

### Patch Type 2 — Logout Doc Section（US2、1 處）

| # | File | Operation | Spec |
|---|---|---|---|
| ⑪ | `specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md` | 末段新增 §5 「Logout (no server endpoint by design)」 | 4 aspect（current design / 3 pattern research / triggers / W-F12 hook）|

**新 §5 結構**（per FR-003）：

```markdown
## 5. Logout (no server endpoint by design)

### Current Design (DESIGN-B baseline)

- rust-api: **no `/auth/logout` endpoint exists**（HTTP 404）
- base-web client-side: token discard 透過 `VITE_SERVICE_LOGOUT_CODES` env 配 4xx 響應碼判斷、touch localStorage 移除 token
- 機制：JWT stateless、token 過期靠 `exp` claim、client-side discard 即等效 logout
- 適用範圍：rev1 為 admin-heavy + low-throughput 場景、token 洩漏風險低 / 合規未硬性要求 server-side revocation

### Token Revocation Research（未來 server-side 補強的 3 個方案）

- **Pattern A — Redis token blacklist**: ...（per research.md R-5）
- **Pattern B — Short-TTL access + refresh rotation**: ...
- **Pattern C — JWT versioning**: ...

### 何時需要 server-side revocation（trigger scenarios）

1. **Admin-driven**: admin 強制撤權 / 停用帳號（合規 / 安全事件）
2. **Anomaly-driven**: W-F12 session anomaly detection（異地登入、暴衝 request rate 等）

### W-F12/13/14 Observability Hook

W-F12 observability feature brainstorm 時可從此 § 直接取 design input。若 W-F12 決定加入 session anomaly detection、推薦 Pattern A（Redis blacklist）——與 042 `audit:events` Redis Stream 同基礎設施、複用度高。

> Spec hygiene reference: 本 § 為 R5 follow-up 結案（per 043 spec hygiene pass 2）。
```

### Patch Type 3 — Use 行 Fix（US3、1 處）

| # | File | Line | Current | Fix To |
|---|---|---|---|---|
| ⑫ | `specs/002-soft-delete-infrastructure/data-model.md` | 158 | `use server_model::admin::entities::{...}` | `use crate::admin::entities::{...}` |

**Implementer note**：對齊同檔 line 186 / 362 既有正確 form；server-model crate 內檔案不可 self-reference 自己 crate name。

### Patch Type 4 — INTEGRATION-CHECKLIST Cleanup（feature 收尾、1 處）

| # | File | Operation |
|---|---|---|
| ⑬ | `docs/INTEGRATION-CHECKLIST.md` | 衍生 follow-up table 移除 042-N3 / R5 / 041-N2 三 row、已完成里程碑加 043 entry、Current Focus 下一步從「043 進行中」→「W-F12/13/14 observability」|

---

## E2. Acceptance Verification Patterns

對 12 處 edit 的 acceptance approach：

| Patch Type | Acceptance Approach |
|---|---|
| TZ Fix (1-10) | dev stack 健康下、跑 1 個 admin write trigger、然後跑改後 SQL；預期回 ≥1 row（非 0）。對應 contracts/verification-commands.md C-V2 |
| Logout Doc (11) | human read-through、確認 4 aspect 涵蓋（current design / 3 pattern / triggers / W-F12 hook）。對應 C-V3 |
| Use 行 Fix (12) | `grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md` 期望 0 hit。對應 C-V4 |
| INTEGRATION-CHECKLIST (13) | `grep` R2/R3/F2.2 row 已移除... 等同 042 C-V11 體例。對應 C-V5 |

---

## E3. Implementer-stage Expansion 候選

per FR-008 + research.md R-7 預掃：

| Category | Hits | Phase 0 結論 |
|---|---|---|
| `TIMESTAMP without time zone` vs `TIMESTAMPTZ` 不一致 | 2 (002 spec.md / 042 schema) | 皆 documented design choice、非 rot、不收 |
| 同類 stale `use server_model::admin::entities` | 4 (002 tasks.md) | CI lint pattern reference、context 正確、非 rot、不收 |
| Stale `/api/<verb>` prefix（nginx strip） | TBD | 屬 042-N2 P2 follow-up、defer 至 W-F12 era、不收 |

**Phase 0 結論：0 implementer-stage expansion 候選**。若 implementer 階段 grep 出新 candidate、走 FR-008 紀律（plan/tasks 登記 + user 確認 + ≤3 處上限）。

---

## Phase 1 結論

- 12 處精確 spec md edits + 1 INTEGRATION-CHECKLIST cleanup
- 0 data entity、0 schema 改動、0 新 cargo crate dep
- 4 個 patch type 各自 acceptance verification approach 明確
- 0 implementer-stage expansion 候選（per R-7 預掃）

Ready for contracts/verification-commands.md（C-V1~C-V5 verification 設計）+ quickstart.md（implementer 操作手冊）。
