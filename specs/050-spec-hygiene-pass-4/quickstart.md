# Quickstart: 050 spec-hygiene-pass-4

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

Implementer 操作手冊 —— 7 Phase 落地步驟 + 多段式 commit + merge 順序。對齊 [`CLAUDE.md §3 / §4.1`](../../CLAUDE.md) feature 開發紀律 + SDD「先合法化、再執行」順序紀律（per spec FR-011）。

---

## Step 0：前置確認

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current     # expect: 050-spec-hygiene-pass-4
(cd base-web && git branch --show-current)   # expect: rev1-admin-base-web
(cd base-web && git log --oneline -1)        # expect: f6efe906 (049 落地後 baseline)
(cd rust-api && git branch --show-current)   # expect: rev1-admin-rust-api
(cd rust-api && git log --oneline -1)        # 取 rust-api baseline SHA
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
export PCO="docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml"
$PC ps --format "{{.Service}}: {{.Status}}" | head -15
# expect: 12 service Up healthy
```

---

## Step 1：Phase 0 — Governance restructure

**SDD「先合法化、再執行」紀律**：必須**先**完成 Phase 0、**之後**才能進 Phase 1 / 2。

依 [`data-model.md §E1`](./data-model.md) + [`research R-4 / R-5`](./research.md) 落地。

### 1.1 加 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.3 050 entry

per [research R-4.2](./research.md) wording (~25 line)、加在 §4.4.2 049 entry 之後、§4.5 前。

### 1.2 改 `specs/046-spec-hygiene-pass-3/spec.md` FR-015 wording + retro footnote

per [research R-5.2](./research.md)：FR-015 改 generalized wording + retro footnote。

### 1.3 改 `specs/044-observability-and-cleanup-pass/spec.md` FR-005 route label polish（optional）

per [research R-5](./research.md) + spec FR-008（MAY）：補 route label「為 axum template path」描述。

### 1.4 本機 verify 前 commit

```bash
grep -c "### §4\.4\.3" docs/INTEGRATION-DESIGN-W-BASE-WEB.md
grep -c "user 拍板可加大" specs/046-spec-hygiene-pass-3/spec.md
grep -c "axum template path" specs/044-observability-and-cleanup-pass/spec.md
```

### 1.5 outer commit 1（Phase 0 governance）

```bash
git status   # expect modified: DESIGN-W-BASE-WEB.md / 046 spec.md / 044 spec.md
git add docs/INTEGRATION-DESIGN-W-BASE-WEB.md \
        specs/046-spec-hygiene-pass-3/spec.md \
        specs/044-observability-and-cleanup-pass/spec.md
git commit -m "$(cat <<'EOF'
feat(governance): 050 sprint dynamic 行使 + 046/044 spec hygiene amend (050 Phase 0)

TS-DepGraph-Hygiene 軌道 dynamic 文件權威首次行使（per Constitution v1.6.0
既有設計、無需 amendment）：

  - docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4.4.3 加 050 sprint entry
    (scope: 049-R1 Dockerfile comment polish; trigger: post-merge review-derived
    hygiene-pass 結案載體; acceptance: C-V1~C-V10 全 PASS)
  - 對齊 §4.4.1 047.5 retro + §4.4.2 049 sprint 既有體例

spec hygiene amend (per 050 spec.md FR-002、050-R1 結案前置):
  - specs/046-spec-hygiene-pass-3/spec.md FR-015 wording generalized:
    base ≤3 + user 拍板可加大、需於 commit message body 明示拍板原委
    + budget enlargement 計數；超限（無 user 拍板）拒絕並登 046+ follow-up
  - 加 050 retro footnote 紀 046 sprint US4 expansion 18 sites 為首次行使

044 spec.md FR-005 route label polish (optional、per 050 FR-008、050-R2 配套):
  - http_request_duration_seconds.route label 補明示「為 axum template
    path、含 path params placeholder」

SDD「先合法化、再執行」紀律：本 commit 為 050 Phase 0 prerequisite、
之後 Phase 1+ 才能合法進 rust-api impl / Phase 2 infra / Phase 3 base-web。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**✅ Phase 0 完成後才能進 Phase 1**。

---

## Step 2：Phase 1 — rust-api bundled 4 issues impl

依 [`data-model.md §E2`](./data-model.md) + [`research R-1/R-2/R-3`](./research.md) 落地。

### 2.1 Spike confirm (036-R1 + 044-R2)

開始 impl 前先 spike 2 高風險 pattern：

```bash
# 036-R1 Option<Option<T>> serde compat spike
cd rust-api/server/model
cargo build -p server-model 2>&1 | tail -3  # baseline pass
# 寫 test struct with Option<Option<T>>、cargo build confirm OK

# 044-R2 axum MatchedPath spike (read existing layer order in operation_log.rs)
grep -n "MatchedPath\|apply_layers\|TraceLayer" server/core/src/web/operation_log.rs
cd ../..
```

### 2.2 036-R1 sys_menu DTO `Option<Option<T>>` + selective merge

per [data-model E2.1 + E2.2](./data-model.md)：
- `server/model/src/admin/input/sys_menu.rs`：3 nullable field 改 `Option<Option<T>>` + serde attrs
- `server/service/src/admin/sys_menu_service.rs`：`update_menu_for_systemmanage` 改 selective update logic（3 match arm）

### 2.3 037-R1 ptype='g' defensive UPDATE + audit g_rules_updated_count

per [data-model E2.3](./data-model.md)：
- `server/service/src/admin/sys_role_service.rs`：`update_role` txn 內、既有 ptype='p' UPDATE 後加 ptype='g' UPDATE
- audit_log payload 加 `g_rules_updated_count` 數值欄（MUST、per Clarifications Q2）

### 2.4 044-R2 operation_log.rs axum MatchedPath fallback

per [data-model E2.4](./data-model.md)：
- `server/core/src/web/operation_log.rs` 記錄 histogram 處改用 MatchedPath extractor + fallback `"unmatched"`

### 2.5 044-R1 cleanup binary pushgateway recorder

per [data-model E2.5 + E2.6](./data-model.md)：
- `server/cleanup/src/main.rs`：`install_pushgateway_recorder()` fn + main 內呼叫 + on-exit flush
- `server/cleanup/Cargo.toml`：`metrics-exporter-prometheus` 加 feature flag `"push-gateway"`

### 2.6 本機 cargo check + clippy

```bash
cd rust-api
cargo check --all-features 2>&1 | tail -3
cargo clippy --all-features --no-deps 2>&1 | tail -3
cd ..
```

### 2.7 rust-api worktree commit 1（單 commit、bundled）

```bash
cd rust-api
git status
git add server/model/src/admin/input/sys_menu.rs \
        server/service/src/admin/sys_menu_service.rs \
        server/service/src/admin/sys_role_service.rs \
        server/core/src/web/operation_log.rs \
        server/cleanup/src/main.rs \
        server/cleanup/Cargo.toml
git commit -m "$(cat <<'EOF'
feat(rust-api): 050 bundled 4 issues — selective merge + Casbin g sync + pushgateway + MatchedPath

軌道：軌道外 spec-hygiene-pass-4（per 050 spec FR-003~007）。

改動清單（per data-model.md §E2）：

  - sys_menu DTO Option<Option<T>> double-option (036-R1):
    SystemManageUpdateMenuInput 3 nullable field (query/buttons/
    fixed_index_in_tab) 改 double-option、區分「未送」與「explicit null」二態
  - sys_menu_service selective merge (036-R1):
    update_menu_for_systemmanage handler 改 selective update、保留 spec
    036 FR-004「omitted MUST NOT 覆寫既有值」原 promise
  - sys_role_service ptype='g' defensive UPDATE + audit (037-R1):
    update_role txn 內加 UPDATE casbin_rule SET v1=$1 WHERE ptype='g'
    AND v1=$2 (idempotent on empty set); audit_log payload MUST 加
    g_rules_updated_count 數值欄 (per Clarifications Q2)
  - operation_log MatchedPath template (044-R2):
    http_request_duration_seconds.route label 改用 axum MatchedPath
    extractor 取得 route template (如 /role/{id})、fallback "unmatched"
    避免 cardinality leak
  - cleanup binary pushgateway recorder (044-R1):
    install_pushgateway_recorder() + on-exit flush 配合 prom/pushgateway
    v1.10.0 (per Clarifications Q1); metrics-exporter-prometheus 加
    feature flag "push-gateway" (per-crate enable、無新 workspace dep)

050 R-row 結案: 036-R1 / 037-R1 / 044-R1 (rust 側) / 044-R2
連帶 Phase 2 將補: 044-R1 infra (docker-compose pushgateway / prometheus.yml)

acceptance: 本 commit 不獨立 verify、待 Phase 2 infra 落地後 C-V2~C-V5
acceptance 全綠才結案。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 2.8 push origin（**須 user 同意**、per CLAUDE.md §5）

```bash
git push origin rev1-admin-rust-api    # 須 user 同意
cd ..
```

---

## Step 3：Phase 2 — Infra (pushgateway) + base-web Dockerfile polish

依 [data-model §E3](./data-model.md) + [research R-2.4 / R-2.5](./research.md) 落地。

### 3.1 docker-compose.observability.yml pushgateway service

per [data-model E3.1](./data-model.md)。

### 3.2 deploy/prometheus.yml scrape job

per [data-model E3.2](./data-model.md)。

### 3.3 base-web/Dockerfile line 35-42 comment polish

per [data-model E3.4](./data-model.md)。

### 3.4 base-web worktree commit (049-R1)

```bash
cd base-web
git status   # expect: modified Dockerfile
git add Dockerfile
git commit -m "$(cat <<'EOF'
style(base-web): Dockerfile line 35-42 strict isolation 紀律 comment polish (049-R1)

軌道：TS-DepGraph-Hygiene (Constitution v1.6.0 dynamic 行使、per DESIGN-W-BASE-WEB.md §4.4.3、050 sprint Polish 條目)。

改動 (per 050 spec FR-009、050 data-model §E3.4):
  - line 35-42 stale comment block 整段 replace
  - 原內容 outdated 提及 nodeLinker: hoisted / .npmrc shamefully-hoist=true
    為 active strategy、但 049 已撤回此 hoisted setting
  - 改為「pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005)」描述
    含 packageManager field source of truth + 4 phantom proomoted + --ignore-scripts rationale
  - line 33-34「Deps-first COPY layer + BuildKit cache mount」描述保留

acceptance: C-V7 grep 確認 nodeLinker: hoisted / shamefully-hoist=true 0 hit、
strict isolation / packageManager field 各 ≥1 hit。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 3.5 push base-web origin（**須 user 同意**）

```bash
git push origin rev1-admin-base-web    # 須 user 同意
cd ..
```

### 3.6 outer commit 2（Phase 2 infra）

```bash
git status
git add docker-compose.observability.yml deploy/prometheus.yml
# (optional MAY) git add deploy/grafana-provisioning/dashboards/*.json
git commit -m "$(cat <<'EOF'
feat(infra): 050 pushgateway service + prometheus scrape job (044-R1 infra)

軌道：軌道外 (per 050 spec FR-006)。

  - docker-compose.observability.yml +pushgateway service block
    (image prom/pushgateway:v1.10.0 per Clarifications Q1、port 9091:9091、
    healthcheck、network alias pushgateway)
  - deploy/prometheus.yml +scrape job pushgateway (honor_labels: true、
    target pushgateway:9091、interval 15s)

044-R1 結案配套: rust-api cleanup binary recorder push 已於 Phase 1 落地、
Phase 2 補對應 infra service + scrape job、acceptance C-V4 即可全鏈跑通。

dev stack 從 12 service → 13 service (+pushgateway healthy)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 3.7 dev stack restart + acceptance Phase 2

```bash
$PCO up -d pushgateway 2>&1 | tail -5
sleep 10
$PCO ps --format "{{.Service}}: {{.Status}}" | grep pushgateway
# expect: Up (healthy)

# rust-api restart 套用 cleanup binary 新版（如已 rebuild image）
docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -3
$PCO up -d --force-recreate --no-deps rust-api
sleep 10

# 跑 cleanup binary 手動觸發
docker compose exec rust-api /app/cleanup
sleep 5

# verify pushgateway 收到
curl -s http://127.0.0.1:9091/metrics | grep -E "^cleanup_job_rows_deleted_total"
```

---

## Step 4：Outer SHA pin + INTEGRATION-CHECKLIST cleanup

### 4.1 outer commit 3：base-web SHA pin bump

```bash
BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)
git add base-web
git commit -m "chore(submodule): bump base-web 到 ${BASE_WEB_SHA} — 050 dep-hygiene 049-R1 comment polish"
```

### 4.2 outer commit 4：rust-api SHA pin bump

```bash
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
git add rust-api
git commit -m "chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 050 bundled 4 issues (036-R1 / 037-R1 / 044-R1 / 044-R2)"
```

### 4.3 outer commit 5：INTEGRATION-CHECKLIST 8 R-row cleanup + 050 milestone + SPECKIT marker

per [data-model §E4](./data-model.md)：
- 衍生 follow-up table 移 6 R-row + 加 footnote「5 Important + 1 Polish 結案」
- 已完成里程碑加 050 entry（SHA placeholder 留 Phase 5 backfill）
- Current Focus 現狀 + 下一步 update
- CLAUDE.md SPECKIT marker idle

```bash
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "docs: 050 收尾 INTEGRATION-CHECKLIST 8 R-row cleanup + SPECKIT marker (050 Polish)"
```

---

## Step 5：Acceptance C-V1~C-V10 跑全

per [contracts/verification-commands.md](./contracts/verification-commands.md) 逐條跑、全 PASS 才結案。

```bash
# 跑全套
bash specs/050-spec-hygiene-pass-4/contracts/verification-commands.md  # 或手動逐 C-V
```

### 5.1 push outer feature branch（**須 user 同意**）

```bash
git push origin 050-spec-hygiene-pass-4    # 須 user 同意
```

---

## Step 6：merge 回 rev1-admin-root（**須 user 同意**、per CLAUDE.md §5）

```bash
git checkout rev1-admin-root
git pull --ff-only origin rev1-admin-root
git merge --no-ff 050-spec-hygiene-pass-4 -m "Merge feature 050-spec-hygiene-pass-4"

# push rev1-admin-root 須 user 再次同意
git push origin rev1-admin-root
```

---

## Step 7：SHA backfill post-merge（**須 user 同意**）

```bash
OUTER_SHA=$(git log --first-parent rev1-admin-root --oneline | grep -m1 "050 收尾" | awk '{print $1}')
MERGE_SHA=$(git log --merges -1 --format=%h)
BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
echo "outer=$OUTER_SHA merge=$MERGE_SHA base-web=$BASE_WEB_SHA rust-api=$RUST_API_SHA"

# 編兩處 placeholder 換成真 SHA：
# 1. docs/INTEGRATION-CHECKLIST.md 050 entry placeholder
# 2. docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4.4.3 050 entry SHA placeholder

git add docs/INTEGRATION-CHECKLIST.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md
git commit -m "chore: backfill 050 milestone entry SHA (outer $OUTER_SHA + merge $MERGE_SHA + base-web $BASE_WEB_SHA + rust-api $RUST_API_SHA)"
git push origin rev1-admin-root    # 須 user 同意
```

---

## 預估時間

| 階段 | 估時 |
|---|---|
| Step 1 (Phase 0 governance + outer commit 1) | ~30 min |
| Step 2 (Phase 1 rust-api bundled + spike + cargo check + worktree commit + push) | ~90-120 min |
| Step 3 (Phase 2 infra + base-web Dockerfile + dev stack restart + acceptance) | ~30-45 min |
| Step 4 (outer SHA pin x2 + INTEGRATION-CHECKLIST cleanup commit) | ~15 min |
| Step 5 (C-V1~C-V10 acceptance run + outer push) | ~20-30 min |
| Step 6 (merge + push rev1-admin-root、user 同意 ×3) | ~10-15 min |
| Step 7 (SHA backfill + push、user 同意 ×1) | ~5 min |
| **合計** | **~3.5-4.5 hr** |

---

## 紀律總結

- **限軌道內 1 file（base-web/Dockerfile comment polish）+ 軌道外 5 issues**（FR-010 boundary）
- **0 base-web src/ diff**（FR-010）
- **0 rust-api 新 entity / schema migration / new endpoint**（FR-010）
- **0 Constitution amendment**（dynamic doc 權威首次行使 via DESIGN §4.4.3、FR-010）
- **SDD「先合法化、再執行」順序**（FR-011、Phase 0 必先）
- **implementer-stage expansion budget follow 新 wording**（per FR-002 amend、base ≤3 + user 拍板可加大）
- **push / merge / backfill 須 user 同意**（per CLAUDE.md §5）
- **reuse 既有 acceptance tool**（curl + psql + grep + grafana scrape、無新 acceptance tool）
