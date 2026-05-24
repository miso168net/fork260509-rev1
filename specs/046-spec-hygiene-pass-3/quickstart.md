# Quickstart — 046 spec-hygiene-pass-3

**Phase**：1（Design & Contracts、Phase 1 產出）
**Audience**：implementer（人或 AI）執行 046 的步驟手冊。

依執行順序：US1+US2 spec md erratum → US3 println cleanup → US4 test helper + 12 test fix → US5 docker-compose footer → docker rebuild + dev stack restart → 8 C-V acceptance → INTEGRATION-CHECKLIST cleanup → 多段式 commit + merge。

---

## 前置假設

- dev stack 既有 12 service healthy（5 既有 + 7 observability、044 落地後 baseline）
- outer branch 為 `046-spec-hygiene-pass-3`（pre-hook 已建、`git branch --show-current` 確認）
- rust-api worktree branch 為 `rev1-admin-rust-api`
- 預設帳號 `Soybean`/`123456`（per CLAUDE.md §8.1）
- `PC` shell alias：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`
- Phase 0 research 已完 → 6 個 research item 全 resolve（per research.md）；helper signature refine 為 closure-based（per R-2）

---

## Step 1 — US1+US2 045 spec md erratum（FR-001 ~ FR-006）

### 1.1 — 045 data-model.md §E1.2 兩處 erratum

per data-model §E2.1：

```bash
# Sub 1a：line 56 whole-Model == → semantic compare 描述
# Sub 1b：line 114 tracing target:target → target=target

# 用 Edit tool 編輯（手寫或 AI subagent）改 2 處：
# - line 56-65 區段：whole-Model == → same_business 6 業務欄位 compare + UPDATE preserve created_at/display_id
# - line 113-116 區段：target: target → target = target + 1-2 行 rationale
```

### 1.2 — 045 contracts/verification-commands.md 5 處對齊

per data-model §E2.2：

```bash
# Sub 2a：lines 58, 271 entity_type → module_name + Insert/Update → INSERT/UPDATE
# Sub 2b：lines 108, 126, 136, 172, 174 /api/accessKey → /api/access-key + body 加 domain
# Sub 2c：lines 225, 261 addUser body shape（userName + status='1' + userRoles role code）
# Sub 2d：lines 295, 301 PUT updateUser → POST + 無 path param + body 加 id + status='1' + userRoles role code
```

對應 C-V2 + C-V3。

---

## Step 2 — US3 044-N1 production println cleanup（FR-007）

per data-model §E3：

```bash
# rust-api/server/service/src/admin/sys_authorization_service.rs:140/154/168
# 3 處 println! → tracing::debug!(?var, "assign_permission: <name>")
```

對應 C-V4。

---

## Step 3 — US4 042-N1 test helper + 12 ignored test 改寫（FR-008/009/010）

### 3.1 — 新檔 `rust-api/server/model/tests/common/audit_pipeline.rs`

per data-model §E1.1 完整 source。

### 3.2 — `rust-api/server/model/tests/common/mod.rs` append

per data-model §E1.2：

```rust
pub mod audit_pipeline;
```

### 3.3 — 4 test file 12 個 ignored test 改寫

per data-model §E1.3 / §E4：

per file 依序處理：
1. `tests/audit_basics.rs` — 5 個 ignored test、5 helper call
2. `tests/audit_http_middleware.rs` — 2 個 ignored test、3-4 helper call（HTTP request 寫多 row、用 `wait_for_audit_count`）
3. `tests/audit_transaction_rollback.rs` — 2 個 ignored test、2 helper call
4. `tests/soft_delete_audit_integration.rs` — 3 個 ignored test、3 helper call

每個 test 內：
- 找 `sys_operation_log::Entity::find()...one(&txn).await.unwrap();assert!(...is_some())` 或同等 pattern
- 改用 helper closure pattern（per §E1.3）
- `#[ignore = "requires real postgres + migration up"]` 改 `#[ignore = "requires dev stack drainer running (audit outbox → sys_operation_log async pipeline)"]`

對應 C-V5（grep verify）+ C-V6（manual cargo test --ignored）。

---

## Step 4 — US5 docker-compose footer（FR-011）

per data-model §E5：

```bash
# docker-compose.yml line 4：
# Before: # 8 service stack:postgres + redis + migration + rust-api + base-web + front-nginx + acme + cleanup
# After: # 主 stack 8 service:postgres + redis + migration + rust-api + base-web + front-nginx + acme(prod profile) + cleanup(jobs profile)
#        # 與 docker-compose.observability.yml(044 加 7 service:promtail + Loki + prometheus + grafana + postgres_exporter + redis_exporter + nginx-exporter)合計 dev stack 12 service。
```

對應 C-V7。

---

## Step 5 — Docker rebuild + dev stack restart + C-V acceptance

### 5.1 Rebuild rust-api image

```bash
docker build -t rust-api:rev1-admin-rust-api ./rust-api
# 預估 5-15min（cargo full build）
# 注意：本 feature US3 (3 line) + US4 (1 new file + 4 test file 12 callsite) 影響不大、incremental build 應快
```

### 5.2 Restart rust-api（保留 obs stack 跑著）

```bash
$PC up -d --force-recreate --no-deps rust-api
sleep 12
$PC ps --format "table {{.Service}}\t{{.Status}}"
# expect: 12 service healthy（rust-api 起來 healthy 表示 build + drainer task OK）
```

### 5.3 跑 C-V1~C-V8 acceptance

per [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑：
- C-V1 (12 service health) — auto
- C-V2 (US1 grep) — fast
- C-V3 (US2 grep) — fast
- C-V4 (US3 grep) — fast
- C-V5 (US4 grep) — fast
- C-V6 (US4 manual `cargo test --ignored`) — 跑 4 test file 全 12 test、預估 < 5s 總時間（包含 dev stack 連線）
- C-V7 (US5 grep) — fast
- C-V8 (boundary + INTEGRATION-CHECKLIST cleanup) — fast

FAIL 則 debug + 修 + 重 build / 重跑、全 PASS 才進下一 step。

---

## Step 6 — INTEGRATION-CHECKLIST cleanup（FR-014）

修改 `docs/INTEGRATION-CHECKLIST.md`：

### 6.1 衍生 follow-up table 移除 3 row

- `045-N2 | 045 implementer 階段 | 045 spec docs 多處 spec rot ...`
- `044-N1 | 044 implementer 發現 | sys_authorization_service.rs 3 處 production println! ...`
- `042-N1 | 042 implementer concern | 4 個 #[ignore] integration test ...`

### 6.2 已完成里程碑加 046 entry

按 044 / 045 體例：

```markdown
- [x] **046 spec-hygiene-pass-3** ✅（2026-05-XX 完成；outer `<SHA>` + merge `<SHA>`、rust-api `<SHA>`、base-web 0 改動；spec `specs/046-spec-hygiene-pass-3/`）— bundle 045-N2 + 044-N1 + 042-N1 + docker-compose footer trivial = 5 US：US1+US2 045 spec docs 5 sub-erratum（data-model.md §E1.2 same_business compare + tracing target macro syntax + contracts/verification-commands.md C-V2/V4-V6/V8/V10 schema column / endpoint path / body shape / HTTP verb / userRoles 型對齊實 code）+ US3 sys_authorization_service.rs 3 處 production println! → tracing::debug! (W-F12 JSON formatter 對齊) + US4 tests/common/audit_pipeline.rs 新 helper `wait_for_audit_row` + `wait_for_audit_count` (closure-based、輪詢 sys_operation_log、500ms budget / 50ms interval) + 12 個 ignored test (4 檔) 改用 helper + `#[ignore]` 註解改 "requires dev stack drainer running" + US5 docker-compose.yml 檔頭服務數註解 8→12 (含 observability.yml overlay 說明)；軌道外 rust-api + outer + spec md、0 base-web、0 schema migration、0 新 entity、0 新 workspace dep；C-V1~C-V8 acceptance 全 PASS（含 12 ignored test cargo test --ignored 全綠）；implementer-stage expansion ≤3 處 budget（041/043 體例）；下一步：047 sandbox-protect-route-fix (045-N1)
```

### 6.3 Current Focus 「下一步」改向

從目前的 5 階段順序更新：046 已落地、下一步指向 047 sandbox-protect-route-fix。

對應 C-V8。

---

## Step 7 — 多段式 commit（per CLAUDE.md §4.1）

### 7.1 rust-api worktree commits（estimated 2 個）

```bash
cd rust-api
git status  # 確認 rev1-admin-rust-api branch

# US3 044-N1 println cleanup
git add server/service/src/admin/sys_authorization_service.rs
git commit -m "fix(rust-api): 046 US3 sys_authorization_service.rs 3 處 production println! → tracing::debug!（044-N1）"

# US4 042-N1 test helper + 12 test fix（可選擇拆 2 commit）
# Option A: 單 commit
git add server/model/tests/common/audit_pipeline.rs server/model/tests/common/mod.rs server/model/tests/{audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration}.rs
git commit -m "feat(rust-api): 046 US4 audit_pipeline test helper + 12 ignored test 改 closure-based sleep+poll（042-N1）"

# Option B: 拆 2 commit（helper-add + callsite-migrate）— bisect 友好
# git add server/model/tests/common/audit_pipeline.rs server/model/tests/common/mod.rs
# git commit -m "feat(rust-api): 046 US4 audit_pipeline test helper（042-N1 part 1）"
# git add server/model/tests/{audit_basics,audit_http_middleware,audit_transaction_rollback,soft_delete_audit_integration}.rs
# git commit -m "feat(rust-api): 046 US4 12 ignored test 改用 wait_for_audit_row helper（042-N1 part 2）"

# push 須 user 同意
# git push origin rev1-admin-rust-api
cd ..
```

### 7.2 outer rev1-admin-root commits（estimated 5-6 個）

```bash
# US1 045 data-model erratum
git add specs/045-facade-atomicity-pass/data-model.md
git commit -m "docs(spec-hygiene): 046 US1 045 data-model.md §E1.2 兩處 erratum（045-N2 a+b）"

# US2 045 contracts erratum
git add specs/045-facade-atomicity-pass/contracts/verification-commands.md
git commit -m "docs(spec-hygiene): 046 US2 045 contracts/verification-commands.md C-V2/V4-V6/V8/V10 對齊實 code（045-N2 c+d+e）"

# US5 docker-compose footer
git add docker-compose.yml
git commit -m "docs(spec-hygiene): 046 US5 docker-compose.yml 檔頭 8→12 service 註解擴寫（trivial）"

# rust-api SHA pin bump
git add rust-api
git commit -m "chore(submodule): bump rust-api to <SHA>: 046 spec-hygiene-pass-3（US3 + US4）"

# INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "docs(spec-hygiene): 046 INTEGRATION-CHECKLIST cleanup（FR-014）+ CLAUDE.md SPECKIT marker → idle"

# push 須 user 同意
# git push origin 046-spec-hygiene-pass-3
```

### 7.3 Merge 回 default

```bash
# acceptance 全 PASS 後：
git checkout rev1-admin-root
git merge --no-ff 046-spec-hygiene-pass-3 -m "Merge feature 046-spec-hygiene-pass-3"
# push 須 user 同意
# git push origin rev1-admin-root
```

### 7.4 SHA backfill + push

merge 後拿 outer SHA + merge SHA + rust-api worktree latest SHA、回填進 INTEGRATION-CHECKLIST 046 entry 的 `<SHA>` placeholder、small chore commit（per 041/042/043/044/045 體例）+ push 須 user 同意。

---

## 收尾 checklist

- [ ] Step 1 US1+US2 045 spec md erratum（data-model §E1.2 兩處 + contracts/verification-commands.md 5 處）
- [ ] Step 2 US3 sys_authorization_service.rs 3 處 println → tracing::debug!
- [ ] Step 3 US4 audit_pipeline helper + 4 test file 12 callsite + `#[ignore]` 註解
- [ ] Step 4 US5 docker-compose.yml 檔頭 8→12 服務數註解
- [ ] Step 5 docker rebuild + restart + C-V1~C-V8 全 PASS（含 manual cargo test --ignored 12/12）
- [ ] Step 6 INTEGRATION-CHECKLIST 3 row 移除 + 046 entry + Current Focus 下一步
- [ ] Step 7.1 rust-api worktree 多段 commit（user 同意 push）
- [ ] Step 7.2 outer feature branch 多段 commit（user 同意 push）
- [ ] Step 7.3 merge 回 rev1-admin-root（user 同意才 push）
- [ ] Step 7.4 SHA backfill commit + push
- [ ] 通知 user 進入下一 follow-up（047 sandbox-protect-route-fix 或其他）
