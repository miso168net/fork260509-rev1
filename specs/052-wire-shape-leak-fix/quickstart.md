# Quickstart: 052 wire-shape-leak-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-26

Implementer 操作手冊 —— 5 Phase 落地步驟 + 多段式 commit + merge 順序。對齊 [`CLAUDE.md §3 / §4.1`](../../CLAUDE.md) feature 開發紀律。

---

## Step 0：前置確認

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current     # expect: 052-wire-shape-leak-fix
(cd rust-api && git branch --show-current)   # expect: rev1-admin-rust-api
(cd rust-api && git log --oneline -1)        # 取 rust-api baseline SHA (預期 6d64190 = 051 落地後)
(cd base-web && git log --oneline -1)        # 0 改動、HEAD 應為 64af823b (051 落地後 baseline)
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
$PCO ps --format "{{.Service}}: {{.Status}}" | head -15
# expect: 13 service Up healthy (per 051 baseline)
```

---

## Step 1：Phase 1 — rust-api impl fix

依 [`data-model.md §E1~§E8`](./data-model.md) + [`research R-1~R-6`](./research.md) 落地。

### 1.1 Phase 0 spike (~20 min)

開始 impl 前先 spike 確認既有體例：

```bash
# (a) 040 D pattern reference 確認
cat rust-api/server/model/src/admin/output/sys_role.rs | head -50
# expect: RoleDetail struct + From<sys_role::Model> impl + Serialize derive

# (b) output/mod.rs 既有體例確認
cat rust-api/server/model/src/admin/output/mod.rs | head -25
# expect: `mod sys_*;` (private) + `pub use sys_*::Type;` (selective)

# (c) PaginatedData<T> 確認無 .map helper
grep -A 10 "pub struct PaginatedData" rust-api/server/core/src/web/page.rs
# expect: pure struct, no .map method

# (d) SystemManageRoleOutput::From 既備
grep -A 15 "impl From<sys_role::Model> for SystemManageRoleOutput" rust-api/server/model/src/admin/output/sys_system_manage.rs
# expect: From impl 既有, role_desc 用 unwrap_or_default, status 用 map_status, 不含 home_route_name

# (e) sys_endpoint.rs 既有檔（含 EndpointTree）
head -10 rust-api/server/model/src/admin/output/sys_endpoint.rs
# expect: pub struct EndpointTree { ... } 既備
```

### 1.2 新加 `rust-api/server/model/src/admin/output/sys_organization.rs`

per [data-model E1](./data-model.md)。完整 file content per E1.1（35 line、含 imports + struct + From impl）。

### 1.3 擴 `rust-api/server/model/src/admin/output/sys_endpoint.rs` 加 EndpointDetail

per [data-model E2](./data-model.md)：
- imports 加 `use chrono::NaiveDateTime;` + `use crate::admin::entities::sys_endpoint;`
- 既有檔尾端追加 EndpointDetail struct + From impl（per E2.2）

### 1.4 改 `rust-api/server/model/src/admin/output/mod.rs`

per [data-model E3.2](./data-model.md)：
- 改 `pub use sys_endpoint::{...}` 行加 `EndpointDetail`
- 加 `pub use sys_organization::OrganizationDetail;` + `mod sys_organization;` 2 行（按字母順排在 sys_menu 後 / sys_role 前）

### 1.5 改 4 handler

per [data-model E5~E8](./data-model.md)：

- `rust-api/server/api/src/admin/sys_organization_api.rs:12` `get_paginated_organizations`：return type + manual PaginatedData reconstruction + imports 加 `OrganizationDetail`
- `rust-api/server/api/src/admin/sys_endpoint_api.rs:16` `get_paginated_endpoints`：return type + manual PaginatedData reconstruction + imports 加 `EndpointDetail`
- `rust-api/server/api/src/admin/sys_system_manage_api.rs:285` `add_role_for_systemmanage`：return type + `.map(SystemManageRoleOutput::from)`
- `rust-api/server/api/src/admin/sys_system_manage_api.rs:305` `update_role_for_systemmanage`：同上

### 1.6 本機 cargo check + clippy

```bash
docker run --rm -v "$PWD/rust-api:/work" -w /work rust:1.86-slim-bookworm cargo check 2>&1 | tail -5
```

`cargo check` 必 0 error。`--all-features` 因 casbin 上游 dep 衝突會失敗（per memory `reference_cargo_check_pitfalls.md`）、預設 profile PASS 即可。

clippy 可選：
```bash
docker run --rm -v "$PWD/rust-api:/work" -w /work rust:1.86-slim-bookworm sh -c "rustup component add clippy 2>/dev/null && cargo clippy --no-deps -p server-api -p server-model 2>&1 | tail -10"
```

新加 fn 預期 0 new warning；pre-existing strict-mode warnings 在 untouched files 不算（per 051 體例）。

### 1.7 rust-api worktree commit 1（單 commit、bundled 8 file）

```bash
cd rust-api
git status
git add server/model/src/admin/output/sys_organization.rs \
        server/model/src/admin/output/sys_endpoint.rs \
        server/model/src/admin/output/mod.rs \
        server/api/src/admin/sys_organization_api.rs \
        server/api/src/admin/sys_endpoint_api.rs \
        server/api/src/admin/sys_system_manage_api.rs
git commit -m "$(cat <<'EOF'
fix(rust-api): 052 wire-shape-leak-fix (039-R1 結案)

軌道：軌道外 spec-impl-fix（per 052 spec FR-001~FR-007、wire DTO 補齊
接 040 W-FW9 D 體例、4 endpoint raw entity Model wire shape leak 收斂）。

改動清單（per data-model.md §E1~§E8）：

  - 新加 OrganizationDetail (output/sys_organization.rs 新檔):
    pub struct OrganizationDetail (10 欄位 id: i64 ← display_id、不含
    ULID id / deleted_at) + impl From<sys_organization::Model>；對齊
    040 D1 RoleDetail sibling pattern

  - 擴 sys_endpoint.rs 加 EndpointDetail (既有檔含 EndpointTree/EndpointTreeNode):
    pub struct EndpointDetail (9 欄位、不含 createdBy/updatedBy —
    Model 本身就無) + impl From<sys_endpoint::Model>

  - output/mod.rs:
    pub use sys_endpoint::{EndpointDetail, EndpointTree, EndpointTreeNode}
    + mod sys_organization + pub use sys_organization::OrganizationDetail
    (service/admin/mod.rs `output::*` wildcard 自動暴露、無需擴)

  - sys_organization_api.rs:12 get_paginated_organizations:
    Res<PaginatedData<SysOrganizationModel>> → Res<PaginatedData<OrganizationDetail>>
    + manual PaginatedData reconstruction (per 040 D5 pattern、無
    PaginatedData::map helper)

  - sys_endpoint_api.rs:16 get_paginated_endpoints: 同上 pattern

  - sys_system_manage_api.rs:285 add_role_for_systemmanage:
    Res<SysRoleModel> → Res<SystemManageRoleOutput> + .map(SystemManageRoleOutput::from)

  - sys_system_manage_api.rs:305 update_role_for_systemmanage: 同上

039-R1 R-row 結案: wire surface 紀律「rust internal SoT 表示 ≠ wire shape」
(039 X1 雙欄設計核心) 完整對齊、raw entity Model wire path 0 hit。

acceptance: 本 commit 不獨立 verify、待 outer SHA pin + Phase 2 acceptance
(含 C-V6 base-web role-list CDP smoke regression) 全綠才結案。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 1.8 push origin（**須 user 同意**、per CLAUDE.md §5）

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
# C-V1 baseline
$PCO ps --format "table {{.Service}}\t{{.Status}}"

# C-V2 GET /org wire shape (curl + jq shape inspect)
# C-V3 POST /addRole wire shape
# C-V4 POST /updateRole wire shape
# C-V5 GET /endpoint/page wire shape
# C-V6 ⭐ base-web role-list CDP smoke (新增 + 編輯 modal regression)
# C-V7 boundary verify (grep raw Model wire 0 hit + 各 0 改動 check)
```

C-V6 為**本 sprint 最關鍵 regression acceptance**（防 040 critical bug 重演）；其餘 C-V 為 wire shape impl gate / boundary。

---

## Step 3：Outer SHA pin + INTEGRATION-CHECKLIST cleanup

### 3.1 outer commit 1：rust-api SHA pin bump

```bash
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
git add rust-api
git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 052 wire-shape-leak-fix (039-R1 結案)"
```

### 3.2 outer commit 2：INTEGRATION-CHECKLIST 039-R1 row 移除 + 052 milestone + SPECKIT marker

per [data-model.md §E9](./data-model.md)：
- 衍生 follow-up table 移除 039-R1 row + 加 footnote「039-R1 結案 via 052」
- 已完成里程碑加 052 entry（SHA placeholder 留 Step 6 backfill）
- Current Focus 現狀 + 下一步 update（**Critical dedicated sprint backlog 全清**、剩條件觸發 + 長期）
- CLAUDE.md SPECKIT marker idle

```bash
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "docs: 052 收尾 INTEGRATION-CHECKLIST 039-R1 結案 + 052 milestone + SPECKIT marker idle"
```

---

## Step 4：Acceptance final + push outer feature branch

per [contracts/verification-commands.md](./contracts/verification-commands.md) C-V1~C-V7 跑全、全 PASS 才結案。

### 4.1 push outer feature branch（**須 user 同意**）

```bash
git push origin 052-wire-shape-leak-fix    # 須 user 同意
```

---

## Step 5：merge 回 rev1-admin-root（**須 user 同意**、per CLAUDE.md §5）

```bash
git checkout rev1-admin-root
git pull --ff-only origin rev1-admin-root
git merge --no-ff 052-wire-shape-leak-fix -m "Merge feature 052-wire-shape-leak-fix"

# push rev1-admin-root 須 user 再次同意
git push origin rev1-admin-root
```

---

## Step 6：SHA backfill post-merge（**須 user 同意**）

```bash
OUTER_SHA=$(git log --first-parent rev1-admin-root --oneline | grep -m1 "052 收尾" | awk '{print $1}')
MERGE_SHA=$(git log --merges -1 --format=%h)
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
echo "outer=$OUTER_SHA merge=$MERGE_SHA rust-api=$RUST_API_SHA"

# 編 INTEGRATION-CHECKLIST 052 entry SHA placeholder 換成真 SHA
git add docs/INTEGRATION-CHECKLIST.md
git commit -m "chore: backfill 052 milestone entry SHA (outer $OUTER_SHA + merge $MERGE_SHA + rust-api $RUST_API_SHA)"
git push origin rev1-admin-root    # 須 user 同意
```

---

## 預估時間

| 階段 | 估時 |
|---|---|
| Step 1 (Phase 1 rust-api impl + spike + cargo check + worktree commit + push) | ~50 min |
| Step 2 (docker rebuild + restart + C-V1~C-V7 含 C-V6 CDP smoke) | ~50 min |
| Step 3 (outer SHA pin + INTEGRATION-CHECKLIST commit) | ~15 min |
| Step 4 (acceptance final + push outer feature branch、user 同意 ×1) | ~5 min |
| Step 5 (merge + push rev1-admin-root、user 同意 ×2) | ~10 min |
| Step 6 (SHA backfill + push、user 同意 ×1) | ~5 min |
| **合計** | **~2.5 hr** |

---

## 紀律總結

- **限 rust-api 8 file + outer 2 file**（per FR-001~007 + FR-010）
- **0 base-web 改動**（軌道外 feature）
- **0 schema migration / 0 新 entity / 0 新 endpoint / 0 新 workspace cargo dep**（per FR-008）
- **0 Constitution amendment**（純 wire 收斂、無新原則）
- **0 audit_log 改動 / 0 Casbin policy 改動 / 0 Sea-ORM Model 改動**（per FR-008）
- **C-V6 CDP smoke** 為**本 sprint 最關鍵 regression acceptance**（base-web role-list 新增 + 編輯 modal、reassurance、防 040 critical bug 重演）；若 CDP setup fail → 登 follow-up C-V6-N1、acceptance 走 C-V2~C-V5 + C-V7 結案
- **push / merge / backfill 須 user 同意**（per CLAUDE.md §5、共 ~4 個 user gate）
- **reuse 既有 acceptance tool**（curl + jq + psql + grep + CDP smoke、無新 acceptance tool 引入）
