# Quickstart — 043 spec-hygiene-pass-2

**Phase**：1（Design & Contracts、Phase 1 產出）
**Audience**：implementer（人或 AI）執行 043 的步驟手冊。

依執行順序：TZ fix（10 處）→ logout § 補完 → use 行 fix → acceptance → 單段式 commit → backlog 清理。

---

## 前置假設

- dev stack 健康（5 service：postgres / redis / rust-api / front-nginx / base-web、見 [`CLAUDE.md §8.2`](../../CLAUDE.md)）
- 預設帳號可登入（`Soybean`/`123456` 等）
- outer branch 為 `043-spec-hygiene-pass-2`、base-web / rust-api worktree **不動**
- `PC` shell alias（建議）：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`

---

## Step 1 — TZ fix（US1、10 處）

### 1.1 機械式 sed 替換

per [data-model.md §E1](./data-model.md) 表、5 個檔分別處理：

```bash
# spec 003: 1 hit
sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" \
  specs/003-audit-log-infrastructure/quickstart.md

# spec 021: 5 hits（3 files）
sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" \
  specs/021-systemmanage-alias-router/spec.md \
  specs/021-systemmanage-alias-router/tasks.md \
  specs/021-systemmanage-alias-router/contracts/verification-commands.md

# spec 042: 4 hits（1 file）
sed -i "s|created_at > NOW() - INTERVAL|created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL|g" \
  specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md
```

### 1.2 verify

```bash
echo "=== TZ pattern hits 應為 0（除 043 自身範例外）==="
grep -rn "NOW() - INTERVAL" specs/ --include="*.md" | grep -v "043-spec-hygiene-pass-2"

echo ""
echo "=== fix pattern hits 應為 10 ==="
grep -rn "(NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL" specs/ --include="*.md" | grep -v "043-spec-hygiene-pass-2" | wc -l
```

對應 C-V1 + C-V2。

---

## Step 2 — Logout § 補完（US2、1 處）

per [data-model.md §E1 Patch Type 2](./data-model.md) + [research.md R-5](./research.md)。

### 2.1 在 spec 005 contracts/auth-endpoints.md 末段新增 §5

`specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md` 末段補：

```markdown
## 5. Logout (no server endpoint by design)

### Current Design (DESIGN-B baseline)

- rust-api: **無 `/auth/logout` endpoint**（HTTP 404）
- base-web client-side: token discard 透過 `VITE_SERVICE_LOGOUT_CODES` env 配 4xx 響應碼判斷、localStorage 移除 token
- 機制：JWT stateless、token 過期靠 `exp` claim、client-side discard 即等效 logout
- 適用範圍：rev1 為 admin-heavy + low-throughput 場景、token 洩漏風險低 / 合規未硬性要求 server-side revocation

### Token Revocation Research（未來 server-side 補強 3 方案）

**Pattern A — Redis token blacklist**

- 機制：active JWT 加入 Redis blacklist key（值 = exp 時間）；middleware 驗證時先查 blacklist、命中即拒
- 優點：與 042 `audit:events` Redis Stream 同基礎設施、複用度高；revoke 立即生效
- 缺點：每 request 多 1 次 Redis lookup（middleware overhead）；blacklist 自動 expire 需設 TTL

**Pattern B — Short-TTL access token + refresh token rotation**

- 機制：access token TTL 短（e.g. 5 分鐘）、client 用 refresh token 換新；revoke 透過撤銷 refresh token
- 優點：access token validation 無 Redis lookup（純 JWT verify）；revoke 半延遲（最多 TTL 時間）
- 缺點：refresh flow 複雜度；token rotation 失敗易導致 UX 中斷
- 現況：rust-api 已有 refresh token flow（F10 / F13）、可直接擴展

**Pattern C — JWT versioning**

- 機制：每 user 維護 `token_version` 欄位；JWT 內含 user version；middleware 驗證時比對 DB / cache、不符即拒
- 優點：force-logout-all-sessions 1 行 SQL `UPDATE sys_user SET token_version = token_version + 1`
- 缺點：每 request 多 1 次 user version lookup（除非 cached）；schema 改動

### 何時需要 server-side revocation（trigger scenarios）

1. **Admin-driven**: admin 強制撤權 / 停用帳號（合規 / 安全事件）
2. **Anomaly-driven**: W-F12 session anomaly detection（異地登入、暴衝 request rate 等）

### W-F12/13/14 Observability Hook

W-F12 observability feature brainstorm 時可從本 § 直接取 design input。若 W-F12 決定加入 session anomaly detection、推薦 Pattern A（Redis blacklist）——與 042 `audit:events` Redis Stream 同基礎設施、複用度高。

> Spec hygiene reference: 本 § 為 R5 follow-up 結案（per 043 spec hygiene pass 2）。
```

### 2.2 verify

```bash
grep -n "Logout (no server endpoint by design)" specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md
# Expected: 1 hit
```

對應 C-V3。

---

## Step 3 — Use 行 fix（US3、1 處）

per [data-model.md §E1 Patch Type 3](./data-model.md)。

### 3.1 fix line 158

`specs/002-soft-delete-infrastructure/data-model.md` line 158:

```diff
- use server_model::admin::entities::{
+ use crate::admin::entities::{
      sys_user, sys_role, sys_menu, sys_domain, sys_organization, sys_endpoint, sys_access_key
  };
```

### 3.2 verify

```bash
grep -n "use server_model::admin::entities" specs/002-soft-delete-infrastructure/data-model.md
# Expected: 0 hit（fix 後）
grep -n "use crate::admin::entities" specs/002-soft-delete-infrastructure/data-model.md | head -3
# Expected: ≥3 hit（含 line 158 修後 + line 186 / 362 既有）
```

對應 C-V4。

---

## Step 4 — Acceptance（contracts/verification-commands.md C-V1~C-V5）

依 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 跑 C-V1 ~ C-V5。

順序建議：
- C-V1 grep verify（fast、無需 dev stack）
- C-V2 TZ fix SQL 真實 match audit row（dev stack）
- C-V3 logout § coverage（無需 dev stack）
- C-V4 use 行 fix（無需 dev stack）
- C-V5 INTEGRATION-CHECKLIST cleanup（依賴 Step 5）

每 C-V 結果記錄；FAIL 則 debug、修、重跑該 C-V 直到全 PASS。

---

## Step 5 — INTEGRATION-CHECKLIST cleanup（feature 收尾、per FR-009）

依 spec FR-009 + SC-004、更新 `docs/INTEGRATION-CHECKLIST.md`：

### 5.1 從衍生 follow-up table 移除 3 row

- `042-N3 | 042 acceptance / CDP smoke | C-V verification SQL ...`
- `R5 | regression 2026-05-24 / F005 | /auth/logout rust-api 未實作 ...`
- `041-N2 | 041 implementer 發現 | 002 §E4 第二段範例 code block 內 use 行 ...`

### 5.2 「已完成里程碑」加 1 entry

按既有體例（每 feature 1 行、限 outer/merge SHA + spec 連結 + 一句話）：

```markdown
- [x] **043 spec-hygiene-pass-2** ✅（2026-05-XX 完成；outer `<SHA>` + merge `<SHA>`、base-web 0 改動、rust-api 0 改動；spec `specs/043-spec-hygiene-pass-2/`）— 042-N3 + R5 + 041-N2 bundled = 12 處 spec md edits：10 處 TZ fix（spec 003/021/042、`(NOW() AT TIME ZONE 'UTC')::timestamp` pattern）+ spec 005 contracts/auth-endpoints.md 新 § Logout (no server endpoint by design)（含 token revocation 3 pattern + W-F12 hook）+ spec 002 §E4 line 158 use 行對齊；軌道外 pure spec md、0 rust-api / 0 base-web；C-V1~C-V5 全 PASS
```

### 5.3 Current Focus 下一步

從「043 進行中」→「W-F12/13/14 observability（Phase W deploy P5）」。

---

## Step 6 — 單段式 commit（per CLAUDE.md §4.1 外層專屬檔）

### 6.1 outer feature branch commit

```bash
git branch --show-current  # 確認 043-spec-hygiene-pass-2
git status                 # 應只看 spec md + docs/INTEGRATION-CHECKLIST.md modified
git add specs/002-soft-delete-infrastructure/data-model.md \
        specs/003-audit-log-infrastructure/quickstart.md \
        specs/005-auth-login-and-dynamic-menu/contracts/auth-endpoints.md \
        specs/021-systemmanage-alias-router/spec.md \
        specs/021-systemmanage-alias-router/tasks.md \
        specs/021-systemmanage-alias-router/contracts/verification-commands.md \
        specs/042-audit-outbox-and-http-mount/contracts/verification-commands.md \
        docs/INTEGRATION-CHECKLIST.md
git diff --staged --stat
git commit -m "$(cat <<'EOF'
docs(spec-hygiene): 042-N3 TZ fix + R5 logout doc + 041-N2 use 行 fix (043)

12 處 spec md edits + INTEGRATION-CHECKLIST cleanup：
- US1 (042-N3): 10 處 NOW() - INTERVAL TZ fix
  跨 spec 003 quickstart.md / spec 021 spec.md+tasks.md+contracts/verification-commands.md /
  spec 042 contracts/verification-commands.md
  pattern: `created_at > (NOW() AT TIME ZONE 'UTC')::timestamp - INTERVAL '...'`
  postgres NOW() 是 timezone-aware、sys_operation_log.created_at 是 UTC naive、
  原 pattern 對窄時窗（10 seconds / 5 minutes）會 8h offset 過濾掉真實 row
- US2 (R5): spec 005 contracts/auth-endpoints.md 新 § Logout (no server endpoint by design)
  含 current design + 3 pattern research (Redis blacklist / Short-TTL refresh / JWT versioning)
  + triggers (admin / anomaly) + W-F12 observability hook
- US3 (041-N2): spec 002 data-model.md §E4 line 158 use server_model::admin::entities → use crate::admin::entities
- INTEGRATION-CHECKLIST: 移除 042-N3 + R5 + 041-N2 三 row、加 043 entry、Current Focus 指向 W-F12/13/14

軌道外 pure spec-md、0 rust-api / 0 base-web、0 schema migration、0 新 cargo crate dep
Constitution v1.4.0 5/5 PASS、C-V1~C-V5 全 PASS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Push 前需 user 同意**（per ~/.claude/CLAUDE.md §5）。

### 6.2 Merge 回 default

acceptance 全 PASS 後：

```bash
git checkout rev1-admin-root
git merge --no-ff 043-spec-hygiene-pass-2 -m "Merge feature 043-spec-hygiene-pass-2"
# 再次 push 前須 user 同意
git push origin rev1-admin-root  # 須 user OK
```

### 6.3 Backfill SHA + Push

merge 後 backfill outer/merge SHA 進 INTEGRATION-CHECKLIST 043 entry（small chore commit、per 041 / 042 體例）+ push 須 user 再次同意。

---

## 收尾 checklist

- [ ] Step 1 TZ fix 10 處 sed 完
- [ ] Step 2 spec 005 logout § 補完 4 aspect
- [ ] Step 3 spec 002 §E4 line 158 use 行 fix
- [ ] Step 4 C-V1~C-V5 全 PASS
- [ ] Step 5 INTEGRATION-CHECKLIST 移除 3 row + 加 043 entry
- [ ] Step 6.1 outer 單段 commit（user 同意 push）
- [ ] Step 6.2 merge 回 default（user 同意才 push）
- [ ] Step 6.3 SHA backfill commit
- [ ] 通知 user 進入下一 follow-up（W-F12/13/14 observability）
