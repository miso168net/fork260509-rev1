# Quickstart: 051 assign-permission-atomicity-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

Implementer 操作手冊 —— 5 Phase 落地步驟 + 多段式 commit + merge 順序。對齊 [`CLAUDE.md §3 / §4.1`](../../CLAUDE.md) feature 開發紀律。

---

## Step 0：前置確認

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current     # expect: 051-assign-permission-atomicity-fix
(cd rust-api && git branch --show-current)   # expect: rev1-admin-rust-api
(cd rust-api && git log --oneline -1)        # 取 rust-api baseline SHA (預期 1a7ef2a 或更新、含 050 結案 + rustls fix)
(cd base-web && git log --oneline -1)        # 0 改動、HEAD 應為 64af823b (050 落地後 baseline)
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
$PCO ps --format "{{.Service}}: {{.Status}}" | head -15
# expect: 13 service Up healthy (per 050 baseline)
```

---

## Step 1：Phase 1 — rust-api impl fix

依 [`data-model.md §E1`](./data-model.md) + [`research R-1/R-2/R-3/R-5`](./research.md) 落地。

### 1.1 Phase 0 spike (~30 min)

開始 impl 前先 spike 2 高風險點：

```bash
# (a) Sea-ORM entity 對齊 spike: 確認 CasbinRule::find/insert_many/delete_many cargo build pass
cd rust-api/server/service
cargo check 2>&1 | tail -5
# expect: baseline pass

# (b) 既有 sync_role_permissions / assign_permission caller grep
cd ../..  # back to rust-api/
grep -rn "fn sync_role_permissions\|assign_permission\b" server/ | head -15
# expect: 1 trait + 1 impl signature for sync_role_permissions (about to delete);
#         2 handler callsite for assign_permission (about to drop arg)
cd ..
```

### 1.2 改 `rust-api/server/service/src/admin/sys_authorization_service.rs`

per [data-model E1.1 + E1.2 + E1.3](./data-model.md)：
- **刪除 sync_role_permissions private fn** (line 128~205、~-78 line)
- **改寫 assign_permission impl** (line 210~306、~+60 / -97)
- **trait signature drop enforcer param** (line 57~62、~-1 line)
- **import 新增**: `use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, Set}; use server_model::admin::entities::prelude::CasbinRule; use server_model::admin::entities::casbin_rule::{ActiveModel as CasbinRuleActiveModel, Column as CasbinRuleColumn};`（per actual spike confirm）

### 1.3 改 `rust-api/server/api/src/admin/sys_authentication_api.rs` callsite (line 152)

per [data-model E2](./data-model.md)：拿掉 `enforcer,` 第 4 個 arg；若 handler fn 上層拿了 enforcer 變數但只給此處用 → unused → 清 import + let。

### 1.4 改 `rust-api/server/api/src/admin/sys_system_manage_api.rs` callsite (line 554)

per [data-model E3](./data-model.md)：同 1.3、line 554 callsite drop `enforcer,` arg；handler unused enforcer 變數清理。

### 1.5 本機 cargo check + clippy

```bash
cd rust-api
cargo check --all-features 2>&1 | tail -5
cargo clippy --no-deps 2>&1 | tail -10
cd ..
```

`cargo check` 必 0 error（fix 後）。`cargo clippy` 預期 0 new warning（本 sprint 改的 fn）；pre-existing strict-mode warnings 在 untouched files 不算（per 050 體例）。

### 1.6 rust-api worktree commit 1（單 commit、bundled）

```bash
cd rust-api
git status
git add server/service/src/admin/sys_authorization_service.rs \
        server/api/src/admin/sys_authentication_api.rs \
        server/api/src/admin/sys_system_manage_api.rs
git commit -m "$(cat <<'EOF'
fix(rust-api): 051 assign_permission atomicity (038-R1 結案、Constitution II 強化)

軌道：軌道外 spec-impl-fix（per 051 spec FR-001~FR-007、Constitution Principle II
NON-NEGOTIABLE 承諾從 violation → fulfillment 收斂）。

改動清單（per data-model.md §E1~§E3）：

  - sys_authorization_service::assign_permission impl 改寫:
    split-txn (Casbin policy 寫 + audit 寫各自 commit) → single Sea-ORM
    DatabaseTransaction (casbin_rule INSERT/DELETE + audit_log::write_in_txn
    同 commit、single all-or-nothing point); Sea-ORM CasbinRule::find /
    insert_many / delete_many via 既有 entity (prelude already exposes); diff
    snapshot via txn 開頭 SELECT casbin_rule (per research R-1); endpoint_id
    反映表沿用 W-FW8 reverse-map 體例 (per research R-5)
  - sys_authorization_service::sync_role_permissions private fn 整段刪除
    (fix 後 0 caller、~-78 line)
  - TAuthorizationService::assign_permission trait signature drop enforcer
    param (fix 後 write path 不再經 enforcer、reload via 既有 W-F11
    notify_casbin_changed pub-sub broadcast)
  - sys_authentication_api.rs:152 callsite drop enforcer arg
  - sys_system_manage_api.rs:554 callsite drop enforcer arg

038-R1 R-row 結案: Constitution Principle II「業務寫入 + audit 同 txn」
NON-NEGOTIABLE 承諾全保留、silent grant 風險消除、forensics chain 不斷裂。

acceptance: 本 commit 不獨立 verify、待 outer SHA pin + Phase 2 acceptance
(含 C-V3 fault injection 反證 atomicity rollback) 全綠才結案。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 1.7 push origin（**須 user 同意**、per CLAUDE.md §5）

```bash
git push origin rev1-admin-rust-api    # 須 user 同意
cd ..
```

---

## Step 2：Phase 2 — Docker rebuild + restart + acceptance C-V

依 [contracts/verification-commands.md](./contracts/verification-commands.md) 落地。

### 2.1 docker rebuild rust-api image

```bash
docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3
$PCO up -d --force-recreate --no-deps rust-api
# wait healthy
until $PCO ps --format "{{.Service}}: {{.Status}}" | grep -q "rust-api.*(healthy)"; do sleep 3; done
```

### 2.2 跑 acceptance C-V1~C-V7

per contracts/verification-commands.md：

```bash
# C-V1 baseline (13 service healthy)
$PCO ps --format "table {{.Service}}\t{{.Status}}"

# C-V2 happy path (casbin_rule 寫 + audit 同 txn)
# 跑 contracts/verification-commands.md C-V2 script

# C-V3 ⭐ atomicity 反證 (fault injection)
# 暫改 audit_log.rs::write_in_txn 強制 Err、docker rebuild、acceptance、revert
# (詳細步驟見 contracts/verification-commands.md C-V3)

# C-V4 W-F11 pub-sub reload
# C-V5 GeneralUser deny regression
# C-V6 clear-all E-4
# C-V7 scope discipline boundary verify
```

C-V3 為**本 sprint 最關鍵 acceptance**（atomicity 定性證明）；其餘 C-V 為 regression / sanity。

---

## Step 3：Outer SHA pin + INTEGRATION-CHECKLIST cleanup

### 3.1 outer commit 1：rust-api SHA pin bump

```bash
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
git add rust-api
git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 051 assign_permission atomicity fix (038-R1 結案)"
```

### 3.2 outer commit 2：INTEGRATION-CHECKLIST 038-R1 row 移除 + 051 milestone + SPECKIT marker

per [data-model.md §E4](./data-model.md)：
- 衍生 follow-up table 移除 038-R1 row + 加 footnote「038-R1 結案 via 051」
- 已完成里程碑加 051 entry（SHA placeholder 留 Phase 5 backfill）
- Current Focus 現狀 + 下一步 update（剩 039-R1 + 條件觸發 + 長期）
- CLAUDE.md SPECKIT marker idle

```bash
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "docs: 051 收尾 INTEGRATION-CHECKLIST 038-R1 結案 + 051 milestone + SPECKIT marker idle"
```

---

## Step 4：Acceptance final + push outer feature branch

per [contracts/verification-commands.md](./contracts/verification-commands.md) C-V1~C-V7 跑全、全 PASS 才結案。

### 4.1 push outer feature branch（**須 user 同意**）

```bash
git push origin 051-assign-permission-atomicity-fix    # 須 user 同意
```

---

## Step 5：merge 回 rev1-admin-root（**須 user 同意**、per CLAUDE.md §5）

```bash
git checkout rev1-admin-root
git pull --ff-only origin rev1-admin-root
git merge --no-ff 051-assign-permission-atomicity-fix -m "Merge feature 051-assign-permission-atomicity-fix"

# push rev1-admin-root 須 user 再次同意
git push origin rev1-admin-root
```

---

## Step 6：SHA backfill post-merge（**須 user 同意**）

```bash
OUTER_SHA=$(git log --first-parent rev1-admin-root --oneline | grep -m1 "051 收尾" | awk '{print $1}')
MERGE_SHA=$(git log --merges -1 --format=%h)
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
echo "outer=$OUTER_SHA merge=$MERGE_SHA rust-api=$RUST_API_SHA"

# 編 INTEGRATION-CHECKLIST 050 entry SHA placeholder 換成真 SHA
git add docs/INTEGRATION-CHECKLIST.md
git commit -m "chore: backfill 051 milestone entry SHA (outer $OUTER_SHA + merge $MERGE_SHA + rust-api $RUST_API_SHA)"
git push origin rev1-admin-root    # 須 user 同意
```

---

## 預估時間

| 階段 | 估時 |
|---|---|
| Step 1 (Phase 1 rust-api impl + spike + cargo check + worktree commit + push) | ~1.5 hr |
| Step 2 (docker rebuild + restart + C-V1~C-V7 含 C-V3 fault injection) | ~1.5 hr |
| Step 3 (outer SHA pin + INTEGRATION-CHECKLIST commit) | ~15 min |
| Step 4 (acceptance final + push outer feature branch、user 同意 ×1) | ~5 min |
| Step 5 (merge + push rev1-admin-root、user 同意 ×2) | ~10 min |
| Step 6 (SHA backfill + push、user 同意 ×1) | ~5 min |
| **合計** | **~3.5 hr** |

---

## 紀律總結

- **限 rust-api 3 file + outer 2 file**（per FR-001/002/003 + FR-010）
- **0 base-web 改動**（軌道外 feature）
- **0 schema migration / 0 新 entity / 0 新 endpoint / 0 新 workspace cargo dep**（per FR-008）
- **0 Constitution amendment**（Principle II 強化從 violation → fulfillment 收斂、無需修文）
- **C-V3 fault injection** 為**本 sprint 最關鍵 acceptance**（atomicity 反證、未跑 = 未結案）
- **push / merge / backfill 須 user 同意**（per CLAUDE.md §5、共 ~4 個 user gate）
- **reuse 既有 acceptance tool**（curl + psql + grep、無新 acceptance tool 引入）
