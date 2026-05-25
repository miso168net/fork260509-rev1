# Quickstart: 048 base-typings-sync

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

Implementer 操作手冊 —— 5 Phase 落地步驟 + 多段式 commit + merge 順序。對齊 [`CLAUDE.md §3 / §4.1`](../../CLAUDE.md) feature 開發紀律 + SDD「先合法化、再執行」順序紀律（per spec FR-008）。

---

## Step 0：前置確認

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current     # expect: 048-base-typings-sync
(cd base-web && git branch --show-current)   # expect: rev1-admin-base-web
(cd base-web && git log --oneline -1)        # expect: 496f301b (040 follow-up baseline)
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC ps --format "{{.Service}}: {{.Status}}" | head -15
# expect: 12 service Up healthy
```

---

## Step 1：Phase 0 — Constitution amendment + DESIGN-W-TYPING-ALIGN 新文件 + plan-template + CLAUDE 索引

**SDD「先合法化、再執行」紀律**：必須**先**完成 Phase 0、**之後**才能改 base-web typings。

依 [`data-model.md §E2`](./data-model.md)（constitution full diff）+ [`§E3`](./data-model.md)（DESIGN-W-TYPING-ALIGN 6 節完整）+ [`§E4`](./data-model.md)（plan-template 軌道辨識）落地。

### 1.1 改 `.specify/memory/constitution.md`

per data-model §E2（v1.4.0 → v1.5.0）：
- 標頭 Version field：`Version: 1.4.0` → `Version: 1.5.0`
- 標頭區 wording（Version change / Modified principles / Templates / Follow-up TODOs）—— 完整內容見 data-model §E2.1
- §IV. base 不改動邊界 段追加 TS-Typing-Sync 受管例外段（在既有 W-WEBUI 受管例外段後）—— 完整內容見 data-model §E2.2
- Version History 段加 1.4.0 → 1.5.0 條目 —— 內容見 data-model §E2.3

### 1.2 建 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 新文件

完整 6 節內容見 [data-model §E3](./data-model.md)：
- §1 軌道定位
- §2 可動範圍（硬邊界、不擴張）
- §3 動機限定
- §4 軌道成員（含 §4.1 048 base-typings-sync 首發 sprint placeholder）
- §5 與 W-WEBUI 軌道的邊界
- §6 預期 sprint 模式

### 1.3 改 `.specify/templates/plan-template.md`

per [data-model §E4](./data-model.md) 加軌道辨識條目於 Constitution Check 段 Principle IV row。具體 wording 由 implementer Phase 0 grep 既有 template 結構後微調（屬 R-7.1 expansion candidate）。

### 1.4 改 `CLAUDE.md`

§1 工作區用途 + §7 整合設計文件索引 段補 DESIGN-W-TYPING-ALIGN 引用（與 DESIGN-A / DESIGN-B / DESIGN-W-DEPLOYMENT / DESIGN-W-WEBUI 並列）。預估 ~3-5 line edit。

### 1.5 outer commit 1（Phase 0 amendment + DESIGN + plan-template + CLAUDE）

```bash
git status      # expect: modified 4 files
git add .specify/memory/constitution.md \
        docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md \
        .specify/templates/plan-template.md \
        CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(constitution): v1.4.0→v1.5.0 新增 TS-Typing-Sync 軌道受管例外 (048 Phase 0)

Constitution Principle IV「base 不改動邊界」新增第二條受管例外軌道
TS-Typing-Sync（與 W-WEBUI 並列、互斥不重疊）：

  - 軌道權威：docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md（同步建檔）
  - 可動範圍：src/typings/api/*.d.ts (only)
  - 動機限定：對齊 rust wire 真實序列化型（TS lying-to-itself 修正）
  - 仍不得動：其他 typings/* + W-WEBUI 軌道範圍
  - 兩段式 commit 紀律同 W-WEBUI

DESIGN-W-TYPING-ALIGN.md 完整 6 節：§1 軌道定位 / §2 可動範圍硬邊界
/ §3 動機限定 / §4 軌道成員（§4.1 048 base-typings-sync 首發 sprint
placeholder、post-merge backfill 真 SHA）/ §5 與 W-WEBUI 軌道邊界 / §6
預期 sprint 模式（非常駐軌道、1-3 feature/year）。

plan-template.md Constitution Check 段加軌道辨識條目：feature 改
base-web 時必須明示屬 W-WEBUI 軌道 / TS-Typing-Sync 軌道 / 軌道外 三選一。

CLAUDE.md §1/§7 索引補 DESIGN-W-TYPING-ALIGN 引用（與 DESIGN-A/B/W-DEPLOYMENT
/W-WEBUI 並列）。

Rationale：post-039 entity id migration（display_id i64 from Snowflake
53-bit）+ post-040 wire DTO 變更後、base-web 與 rust wire 真實型出現
type lie（如 MenuRoute.id: string vs rust serialized number）；W-WEBUI
軌道 FR-015 禁碰 src/typings 無法修。設立 TS-Typing-Sync 為第二受控軌道、
補回編譯期型別安全；048 為首發 sprint。

SDD「先合法化、再執行」紀律：本 commit 為 048 Phase 0 prerequisite、
之後 Phase 1 才能合法改 base-web typings。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**✅ Phase 0 完成後才能進 Phase 1**。

---

## Step 2：Phase 1 — base-web typings 對齊（M1+M2+M3+D1+D2+D3 同 commit）

依 [data-model §E1](./data-model.md) 4 處 typing edit complete diff 落地。

### 2.1 改 `base-web/src/typings/api/route.d.ts` — M1 + M2

per [data-model §E1.1](./data-model.md)：
- `MenuRoute.id: string` → `id: number` + 加 JSDoc（rust i32、pre-048 mismatch 註）
- 新增 `pid: string` field + 加 JSDoc（rust pid: String、camelCase rule 註）

### 2.2 改 `base-web/src/typings/api/system-manage.d.ts` — M3 + D2

per [data-model §E1.2](./data-model.md)：
- `Menu.parentId` 上方加 D2 JSDoc（root menu sentinel / `menu-operate-modal.vue:137` 依賴點）
- `MenuTree.pId: number` → `pid: string` + 加 JSDoc（rename + retype、rust pid: String 對齊）

### 2.3 改 `base-web/src/typings/api/common.d.ts` — D1

per [data-model §E1.3](./data-model.md)：
- `CommonRecord.id` 上方加 D1 JSDoc（post-039 i64 from Snowflake 53-bit、fills `Number.MAX_SAFE_INTEGER`、無精度 loss、與 `Auth.UserInfo.userId` ULID 為不同表示）

### 2.4 改 `base-web/src/typings/api/auth.d.ts` — D3

per [data-model §E1.4](./data-model.md)：
- `UserInfo.userId` 上方加 D3 JSDoc（rust ULID String、JWT subject、與 `User.id` i64 display_id 不同表示）

### 2.5 本機 typecheck + build verify（C-V2 + C-V3 預跑）

```bash
cd base-web
pnpm typecheck 2>&1 | tail -10
# expect: 0 error、Done.

pnpm build 2>&1 | tail -10
# expect: dist/ 產出成功
cd ..
```

### 2.6 base-web worktree commit 1（單 commit US1+US2）

```bash
cd base-web
git status                    # expect modified 4 files: route.d.ts + system-manage.d.ts + common.d.ts + auth.d.ts
git add src/typings/api/route.d.ts \
        src/typings/api/system-manage.d.ts \
        src/typings/api/common.d.ts \
        src/typings/api/auth.d.ts
git commit -m "$(cat <<'EOF'
feat(base-web): typings/api 對齊 rust wire 真實序列化型 (048 US1+US2)

US1 mismatch fix（3 處）：
  M1: Route.MenuRoute.id: string → number
      （rust MenuRoute.id: i32 → JSON number、pre-048 為 type lie）
  M2: Route.MenuRoute 新增 pid: string
      （rust MenuRoute.pid: String 序列化、TS 端未宣告、pre-048 為 missing
      field declaration）
  M3: SystemManage.MenuTree.pId: number → pid: string
      （rust MenuTree.pid: String + serde camelCase rule lowercase
      `pid`、TS 端 field name + type 雙不對、pre-048 為 dual mismatch）

US2 JSDoc audit（3 處、不改 type shape、純註解）：
  D1: Common.CommonRecord.id JSDoc — post-039 為 i64 from Snowflake
      41/5/7=53bit display_id、fills Number.MAX_SAFE_INTEGER、無精度 loss、
      應用 5 業務 entity (user/role/endpoint/organization/access_key)、
      與 Auth.UserInfo.userId (ULID) 為不同 id 表示
  D2: SystemManage.Menu.parentId JSDoc — `0` = root menu sentinel
      (rust input DTO parent_id: i32、menu-operate-modal.vue:137 model
      .parentId === 0 為 showLayout sentinel 依賴點)
  D3: Auth.UserInfo.userId JSDoc — rust internal ULID String (JWT subject、
      audit log actor)、與 User.id (i64 display_id) 為不同 id 表示
      (rust SoT 雙欄設計、ULID + display_id 並存)

軌道：TS-Typing-Sync（Constitution v1.5.0 首發 sprint）。
0 consumer cascade（Phase 0 grep 確認 MenuRoute.id/pid + MenuTree.pId
均 0 consumer hit、純 type-level 對齊）。
Menu.parentId === 0 sentinel comparison 保留不動。

pnpm typecheck + pnpm build 雙 PASS（0 error / dist/ 產出）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 2.7 push origin（**須 user 同意**、per CLAUDE.md §5）

```bash
git push origin rev1-admin-base-web    # 須 user 同意
cd ..
```

---

## Step 3：docker rebuild base-web image + restart + C-V6 CDP smoke

依 [contracts/verification-commands.md C-V4 + C-V6](./contracts/verification-commands.md) 執行：

```bash
docker build -t base-web:rev1-admin-base-web ./base-web 2>&1 | tail -10
# expect: 最後 "naming to docker.io/library/base-web:rev1-admin-base-web done"

$PC up -d --force-recreate --no-deps base-web 2>&1 | tail -5
sleep 12
$PC ps --format "{{.Service}}: {{.Status}}" | grep base-web
# expect: Up X seconds (healthy)
```

跑 C-V6 CDP browser smoke 8 路徑（per spec FR-012 + contracts C-V6 + brainstorm §3.2）。

---

## Step 4：Outer feature branch 多段 commit（per CLAUDE.md §4.1）

### 4.1 outer commit 2：base-web SHA pin bump

```bash
git status      # expect "modified: base-web" (gitlink change)
BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)
git add base-web
git commit -m "$(cat <<EOF
chore(submodule): bump base-web 到 ${BASE_WEB_SHA} — 048 US1+US2 typings/api 對齊 rust wire 真實型

US1 mismatch fix M1+M2+M3 (Route.MenuRoute / SystemManage.MenuTree
3 處 type / field name 對齊 rust serialized shape)。

US2 JSDoc audit D1+D2+D3 (CommonRecord.id Snowflake 53-bit / Menu.parentId
root sentinel / Auth.UserInfo.userId ULID vs display_id)。

軌道：TS-Typing-Sync (Constitution v1.5.0 首發 sprint)。

pnpm typecheck + pnpm build PASS、docker build PASS、base-web service
restart healthy、CDP smoke 8 路徑全 PASS。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.2 outer commit 3：INTEGRATION-CHECKLIST inline note refresh + 048 entry + SPECKIT marker

per [data-model §E5](./data-model.md)：
- 衍生 follow-up `base-web TS id 型別債` inline note refresh 為「post-039+040+048 三階段完成紀錄」格式（保留歷史脈絡、不刪、改為已完成標示）
- 已完成里程碑加 048 entry（outer/merge/base-web SHA placeholder、`<TBD>`）
- Current Focus「現狀」加 048、「下一步」改向條件觸發 follow-up backlog 順序第 2 段
- CLAUDE.md SPECKIT marker idle

```bash
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: 048 收尾 INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker (048 Polish)

INTEGRATION-CHECKLIST.md：
  - 衍生 follow-up `base-web TS id 型別債` inline note 改寫為
    「已分階段完成」格式（保留 039 / 040 / 048 三階段歷史脈絡、
    Open Q1 推薦保留改寫不刪）。
  - 已完成里程碑加 048 entry（outer/merge/base-web SHA placeholder 留
    backfill、SHA 由 Step 5 post-merge 階段回填）。
  - Current Focus 「現狀」更新含 048 + 「下一步」改向條件觸發 follow-up
    backlog 順序第 2 段（042-N4 / 042-N5 各自獨立、wait for trigger）。

CLAUDE.md SPECKIT marker：Active Spec / Active Plan idle、Phase idle、
下一步指向條件觸發 follow-up。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.3 outer commit 4：DESIGN-W-TYPING-ALIGN §4.1 加 048 sprint 落地紀錄

per data-model §E3 §4.1 + R-4.1 wording：

```bash
# 編 docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md §4.1 048 sprint 條目
# 將 placeholder SHA 換成 <TBD post-merge>（merge 後才有真 SHA）
git add docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
git commit -m "$(cat <<'EOF'
docs(typing-align): 加 048 base-typings-sync 落地紀錄 (§4.1 sprint 條目)

TS-Typing-Sync 軌道首發 sprint (048 base-typings-sync) 落地紀錄登記
於 §4.1：
  - 日期：2026-05-25
  - scope：M1 MenuRoute.id string→number / M2 MenuRoute 加 pid:string /
    M3 MenuTree.pId→pid 名+型 rename / D1+D2+D3 JSDoc audit
  - 觸發：030-034 W-WEBUI 軌道遺留 + 039+040 wire DTO 變更
  - acceptance：C-V1~C-V9 全 PASS
  - spec：specs/048-base-typings-sync/

outer/merge/base-web SHA 留 <TBD post-merge> placeholder、Step 5 backfill。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.4 outer commit 5（optional）：implementer-stage expansion 拾取

若 user 確認後拾取 candidate (a)(b)(c) 任一（per [research R-7](./research.md)）：
- (a) plan-template 軌道辨識條目 wording 微調
- (b) INTEGRATION-CHECKLIST inline note refresh wording 細化
- (c) DESIGN-W-TYPING-ALIGN §6 sprint 模式 wording 具體化

否則跳過此 commit。**≤3 budget 內、超限拒拾並登 048+ follow-up**。

### 4.5 push origin（**須 user 同意**）

```bash
git push origin 048-base-typings-sync    # 須 user 同意
```

---

## Step 5：merge 回 rev1-admin-root（**須 user 同意**、per CLAUDE.md §5）

```bash
git checkout rev1-admin-root
git pull --ff-only origin rev1-admin-root
git merge --no-ff 048-base-typings-sync -m "Merge feature 048-base-typings-sync"

# push rev1-admin-root 須 user 再次同意
git push origin rev1-admin-root
```

---

## Step 6：SHA backfill post-merge（**須 user 同意**）

```bash
# 拿 outer (feature branch last) / merge / base-web SHA
OUTER_SHA=$(git log --first-parent rev1-admin-root --oneline | grep -m1 "048 收尾" | awk '{print $1}')
MERGE_SHA=$(git log --merges -1 --format=%h)
BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)
echo "outer=$OUTER_SHA merge=$MERGE_SHA base-web=$BASE_WEB_SHA"

# 編兩處 placeholder 換成真 SHA：
# 1. docs/INTEGRATION-CHECKLIST.md 048 entry placeholder
# 2. docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md §4.1 048 sprint commit placeholder

git add docs/INTEGRATION-CHECKLIST.md docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
git commit -m "chore: backfill 048 milestone entry SHA (outer $OUTER_SHA + merge $MERGE_SHA + base-web $BASE_WEB_SHA)"
git push origin rev1-admin-root    # 須 user 同意
```

---

## Step 7：Acceptance final verification

跑 [contracts/verification-commands.md](./contracts/verification-commands.md) C-V1~C-V9 全 9 條：

| C-V | 內容 | PASS criterion |
|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer | 12 service Up healthy + drainer log |
| C-V2 | base-web pnpm typecheck PASS | vue-tsc 0 error |
| C-V3 | base-web pnpm build PASS | dist/ 產出成功 |
| C-V4 | docker rebuild base-web + restart healthy | container `Up (healthy)` |
| C-V5 | grep verification 3 mismatch fix + 3 JSDoc 命中 | M1-M3 全命中 + D1-D3 JSDoc 命中 + 舊 `pId: number` 0 hit |
| C-V6 | CDP browser smoke deep 8 路徑 | 8/8 PASS + 無 console error |
| C-V7 | boundary verify | 軌道紀律全綠（4 檔 only / 其他 0 diff / rust-api 0 diff / parentId === 0 保留） |
| C-V8 | Constitution + DESIGN-W-TYPING-ALIGN 完整性 | v1.5.0 bump + 6 節 + §4.1 048 sprint + plan-template + CLAUDE 索引 |
| C-V9 | INTEGRATION-CHECKLIST cleanup | inline note refresh + 048 entry + 下一步條件觸發 + SPECKIT marker idle |

C-V1~C-V9 全 PASS = 048 acceptance PASS、ready for `superpowers:executing-plans`（per CLAUDE.md §3）→ subagent-driven-development。

---

## 預估時間

| 階段 | 估時 |
|---|---|
| Step 1 (Phase 0 constitution + DESIGN + plan-template + CLAUDE 索引 + outer commit 1) | ~30-45 min |
| Step 2 (base-web typings 4 file edit + pnpm typecheck + pnpm build + worktree commit) | ~30 min |
| Step 3 (docker rebuild base-web + restart + CDP smoke 8 path) | ~30-45 min（含 base-web image build ~5-10min + smoke ~20-30min） |
| Step 4 (outer commits 2-4 + optional commit 5) | ~15 min |
| Step 5 (push + merge + push rev1-admin-root、user 同意關卡 ×3) | ~10-15 min |
| Step 6 (SHA backfill + push、user 同意關卡 ×1) | ~5 min |
| Step 7 (acceptance final C-V1~C-V9) | ~5-10 min |
| **合計** | **~2-2.5 hr**（含 user 同意等待、per brainstorm §4.4 估時） |

---

## 紀律總結

- **限 base-web `src/typings/api/*.d.ts` 範圍**（FR-007、軌道嚴禁邊界）
- **0 rust-api 改動 / 0 schema migration / 0 新 cargo dep / 0 新 npm dep**（FR-006）
- **W-WEBUI 軌道範圍 0 diff**（FR-007、軌道互斥）
- **其他 typings 0 diff**（FR-007、軌道嚴禁邊界）
- **`Menu.parentId === 0` sentinel comparison 保留**（FR-004 D2 JSDoc 防誤改）
- **SDD「先合法化、再執行」順序**（FR-008、Phase 0 必先）
- **implementer-stage expansion ≤3**（FR-014、Phase 0 grep 拾取候選 (a)(b)(c)、超限拒）
- **push / merge 須 user 同意**（per CLAUDE.md §5）
