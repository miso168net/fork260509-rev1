# Quickstart: 049 base-web-dep-hygiene-and-track-restructure

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

Implementer 操作手冊 —— 7 Phase 落地步驟 + 多段式 commit + merge 順序。對齊 [`CLAUDE.md §3 / §4.1`](../../CLAUDE.md) feature 開發紀律 + SDD「先合法化、再執行」順序紀律（per spec FR-009）。

---

## Step 0：前置確認

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current     # expect: 049-base-web-dep-hygiene
(cd base-web && git branch --show-current)   # expect: rev1-admin-base-web
(cd base-web && git log --oneline -1)        # expect: b4453385 (048 + env-repair adjacent baseline)
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC ps --format "{{.Service}}: {{.Status}}" | head -15
# expect: 12 service Up healthy
```

---

## Step 1：Phase 0 — Constitution v1.5→v1.6 + DESIGN merge + plan-template + CLAUDE 索引

**SDD「先合法化、再執行」紀律**：必須**先**完成 Phase 0、**之後**才能改 base-web。

依 [`data-model.md §E1`](./data-model.md) + [`research R-2/R-3/R-4/R-5/R-6/R-7/R-8`](./research.md) 落地。

### 1.1 改 `.specify/memory/constitution.md` v1.5.0 → v1.6.0

per [research R-4](./research.md)：
- 替換檔頭 Sync Impact Report block（v1.5 → v1.6、~30 line）
- §IV 主體段落改寫：3 軌道並列、wording 保留 W-WEBUI + TS-Typing-Sync 段不動、加 TS-DepGraph-Hygiene 段、Rationale 改 unified（~30 line）
- Version footer line update：`1.5.0 → 1.6.0`

### 1.2 `git mv docs/INTEGRATION-DESIGN-W-WEBUI.md` → `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`

```bash
git mv docs/INTEGRATION-DESIGN-W-WEBUI.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md
```

保留 git history（`git log --follow docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 之後仍應顯示 W-WEBUI 完整歷史）。

### 1.3 重構新 doc 為 4 § umbrella structure

per [research R-5 + R-6](./research.md)：
- §1 軌道總覽（新加、含 table + 三節 sub-§、~50 line）
- §2 W-WEBUI 軌道（原 W-WEBUI.md 內容 mapping 成 §2.1-§2.5、wording 1:1 搬移）
- §3 TS-Typing-Sync 軌道（從 TYPING-ALIGN.md 內容 merge、§3.1-§3.6、§3.5 wording 改 unified context）
- §4 TS-DepGraph-Hygiene 軌道（新加、與 §2/§3 同構、含 049 首發 + 048 retro、~120 line）

### 1.4 從 TYPING-ALIGN merge 進 §3

```bash
# 把 docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md 內容 copy 進 docs/INTEGRATION-DESIGN-W-BASE-WEB.md §3
# wording 1:1 搬移、只改 §1→§3.1 / §2→§3.2 / ... / §6→§3.6
```

### 1.5 `git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`

```bash
git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
```

### 1.6 改 `.specify/templates/plan-template.md`

per [research R-7](./research.md)：軌道辨識條目改 4 選一（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene / 軌道外）、doc reference 統一指向 BASE-WEB.md。

### 1.7 改 `CLAUDE.md`

per [research R-8](./research.md)：
- §1 line 36 footnote：改 3 軌道 wording
- §7 line 336 索引：remove W-WEBUI + TYPING-ALIGN ref、加 W-BASE-WEB unified ref

### 1.8 本機 verify 前 commit

```bash
# 跑一次本機 verify、確認新 doc 結構 + Constitution + plan-template + CLAUDE 一致
grep -cE "1\.6\.0|TS-DepGraph-Hygiene" .specify/memory/constitution.md
grep -cE "^## §[1-4] " docs/INTEGRATION-DESIGN-W-BASE-WEB.md
grep -cE "W-WEBUI 軌道|TS-Typing-Sync 軌道|TS-DepGraph-Hygiene 軌道|軌道外" .specify/templates/plan-template.md
grep -c "INTEGRATION-DESIGN-W-BASE-WEB" CLAUDE.md
```

### 1.9 outer commit 1（Phase 0 amendment + DESIGN merge + plan-template + CLAUDE）

```bash
git status      # expect: modified .specify/memory/constitution.md / .specify/templates/plan-template.md / CLAUDE.md
                # + renamed docs/INTEGRATION-DESIGN-W-WEBUI.md -> docs/INTEGRATION-DESIGN-W-BASE-WEB.md (修改後)
                # + deleted docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
git add .specify/memory/constitution.md \
        docs/INTEGRATION-DESIGN-W-BASE-WEB.md \
        docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md \
        .specify/templates/plan-template.md \
        CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(constitution): v1.5.0→v1.6.0 新增 TS-DepGraph-Hygiene 軌道 + unified DESIGN doc (049 Phase 0)

Constitution Principle IV「base 不改動邊界」新增第 3 條受管例外軌道
TS-DepGraph-Hygiene（與 W-WEBUI + TS-Typing-Sync 並列、三軌道互斥不重疊）：

  - 軌道權威: docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4
  - 可動範圍: base-web build/dep config (Dockerfile / package.json /
    pnpm-workspace.yaml / .npmrc / packages/*/package.json; 不含 src/)
  - 動機限定: pnpm / node / Vite / TS 工具鏈 hygiene
  - 仍不得動: src/ + W-WEBUI / TS-Typing-Sync 範圍
  - 兩段式 commit 紀律同其他軌道
  - 048 sprint d521c819 + b4453385 retrospective 認定為 047.5 retro-member

軌道 governance restructure：3 條軌道 governance 從各獨立 DESIGN doc 收成
unified DESIGN-W-BASE-WEB.md（新 umbrella、含 §1 軌道總覽 + §2 W-WEBUI +
§3 TS-Typing-Sync + §4 TS-DepGraph-Hygiene 四 § 章節）。

  - git mv docs/INTEGRATION-DESIGN-W-WEBUI.md → DESIGN-W-BASE-WEB.md
    (保留 git history、原 W-WEBUI 內容變 §2 sub-tree、§5/§7 14 W-FW
    子項紀錄保留)
  - git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md (內容 merged 進
    新 doc §3、TS-Typing-Sync 軌道首發 048 紀錄保留進 §3.4.1)
  - 新加 §1 軌道總覽 + §4 TS-DepGraph-Hygiene 全段

plan-template.md Constitution Check 段加 4-選一軌道辨識條目（W-WEBUI /
TS-Typing-Sync / TS-DepGraph-Hygiene / 軌道外、v1.6.0 起）。

CLAUDE.md §1 軌道辨識 footnote 改 3 軌道 + §7 整合設計文件索引 remove
W-WEBUI + W-TYPING-ALIGN ref、加 W-BASE-WEB unified ref。

Rationale: 047/048 期間出現 host vs container pnpm version drift /
pnpm 11 hoist 失效 / Dockerfile ARG vs package.json packageManager
field 雙 source-of-truth 等紀律需求；setting nodeLinker: hoisted 是「向後
相容急救」但長期應採 pnpm 11+ 預設 strict isolation + explicit devDeps +
packageManager pin（per 048-N1 follow-up）。設立 TS-DepGraph-Hygiene 為
第三受控軌道、unified DESIGN doc 結構避免未來軌道再增加時 doc proliferation；
049 為首發 sprint、048 d521c819+b4453385 retro 認定。

SDD「先合法化、再執行」紀律：本 commit 為 049 Phase 0 prerequisite、
之後 Phase 1 才能合法改 base-web build/dep config。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**✅ Phase 0 完成後才能進 Phase 1**。

---

## Step 2：Phase 1 — base-web dep hygiene impl

依 [`data-model.md §E2`](./data-model.md) + [`research R-1 audit methodology`](./research.md) 落地。

### 2.1 Run audit grep

per [research R-1.1](./research.md) audit script：

```bash
cd base-web

# Step 1: import sources
grep -rEh "^\s*import\s+.*from\s+['\"]([^'\"]+)['\"]" \
     src/ build/ packages/*/src/ \
     --include="*.ts" --include="*.vue" --include="*.tsx" \
     | grep -oP "from\s+['\"]\K[^'\"]+" \
     | grep -v "^[.@]\|^@sa/\|^node:\|^@/\|^@unocss/preset-uno\|^uno:\|^virtual:" \
     | awk -F'/' '{print $1}' | sort -u > /tmp/049-imports-unscoped.txt

grep -rEh "^\s*import\s+.*from\s+['\"]@[^'\"]+['\"]" \
     src/ build/ packages/*/src/ \
     --include="*.ts" --include="*.vue" --include="*.tsx" \
     | grep -oP "from\s+['\"]\K@[^'\"]+" \
     | awk -F'/' '{print "@"$1"/"$2}' | sed 's/^@@/@/' \
     | grep -v "@sa/\|@/" | sort -u > /tmp/049-imports-scoped.txt

cat /tmp/049-imports-unscoped.txt /tmp/049-imports-scoped.txt | sort -u > /tmp/049-imports.txt

# Step 2: declared deps
{
  for pj in package.json packages/*/package.json; do
    grep -oP '^\s*"\K[^"]+(?=":\s*"[^"]*"\s*[,}])' "$pj" 2>/dev/null
  done
} | sort -u > /tmp/049-declared.txt

# Step 3: phantom = imports - declared
comm -23 /tmp/049-imports.txt /tmp/049-declared.txt > /tmp/049-phantom.txt
cat /tmp/049-phantom.txt
```

**Expected**：~4-10 phantom 出現（per [research R-1.2](./research.md) expected list）；超 10 個觸發 [R-9.1 (a)](../research.md) expansion candidate（user 拍板）。

### 2.2 提升 phantom 為直接 devDeps（per [data-model E2.3 / E2.4](./data-model.md)）

- `@iconify/utils` → base-web/package.json devDependencies
- `axios` → base-web/package.json dependencies（runtime type import）
- `@unocss/core`, `@unocss/preset-mini` → packages/uno-preset/package.json devDependencies
- 其他 audit 發現 → 根據 import 來源 file 所在 package 加進對應 package.json

版本 pin **exact**（per codebase convention）、用 pnpm-lock.yaml 既有 resolved version。

### 2.3 移 `nodeLinker: hoisted` from pnpm-workspace.yaml

per [data-model E2.1](./data-model.md)：直接 edit `base-web/pnpm-workspace.yaml`、刪掉 `nodeLinker: hoisted` 行。

### 2.4 移 `shamefully-hoist=true` from .npmrc

per [data-model E2.2](./data-model.md)：直接 edit `base-web/.npmrc`、刪掉 `shamefully-hoist=true` 行。保留 registry + ignore-workspace-root-check + link-workspace-packages。

### 2.5 加 `"packageManager": "pnpm@11.0.8"` 進 base-web/package.json

per [data-model E2.3](./data-model.md)：加 top-level field（typically 放 "version" field 之後、"scripts" 之前）。

### 2.6 改 Dockerfile（remove ARG PNPM_VERSION + corepack prepare）

per [data-model E2.5](./data-model.md)：
- Remove `ARG PNPM_VERSION=11.0.8`（line 18）
- Remove `ARG PNPM_VERSION`（line 28、builder stage 內）
- Change `RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate`（line 31）→ `RUN corepack enable`
- 加 inline 註解：`# corepack 自動讀 base-web/package.json packageManager field`

### 2.7 修 `build/plugins/unocss.ts:24` implicit any

per [data-model E2.6](./data-model.md)：把 `(svg) => transformSVG(svg)` 改為 `(svg: string) => transformSVG(svg)`。

### 2.8 本機 verify

```bash
rm -rf node_modules packages/*/node_modules
pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -8

# C-V3 + C-V4
node_modules/.bin/vue-tsc --noEmit --skipLibCheck 2>&1 | grep -cE "error TS"
# expect 0

node_modules/.bin/vite build --mode prod 2>&1 | tail -5
# expect: Build successful
ls -la dist/

cd ..
```

### 2.9 base-web worktree commit 1（單 commit、Part B 整體）

```bash
cd base-web
git status                    # expect modified 6+ files: Dockerfile + package.json + pnpm-workspace.yaml + .npmrc + packages/uno-preset/package.json + build/plugins/unocss.ts
git add Dockerfile \
        package.json \
        pnpm-workspace.yaml \
        .npmrc \
        packages/uno-preset/package.json \
        build/plugins/unocss.ts
# 若 audit 發現額外 sub-package 需動、git add 之
git commit -m "$(cat <<'EOF'
feat(base-web): 049 dep-hygiene — strict isolation + explicit devDeps + packageManager pin + Dockerfile 簡化

軌道：TS-DepGraph-Hygiene（Constitution v1.6.0 首發 sprint）。

改動清單（per spec FR-004~007 + data-model E2）：

  - pnpm-workspace.yaml: remove nodeLinker: hoisted (回 pnpm 預設 strict
    isolation、撤 048 期間急救 commit d521c819 之 hoisted setting、改採
    explicit devDeps 紀律)
  - .npmrc: remove shamefully-hoist=true (pnpm 10 慣例 vestige、pnpm 11
    不讀; 保留 registry + ignore-workspace-root-check + link-workspace-packages)
  - package.json: 加 "packageManager": "pnpm@11.0.8" + 加 explicit devDeps
    (@iconify/utils + axios + audit 發現項)
  - packages/uno-preset/package.json: 加 @unocss/core + @unocss/preset-mini
    devDeps
  - Dockerfile: remove ARG PNPM_VERSION=11.0.8 (line 18 + builder stage)
    + remove corepack prepare command (line 31)、改為 corepack enable
    (pnpm 版本由 package.json packageManager field 提供); 撤 048 期間
    commit b4453385 之 Dockerfile pnpm 10→11 bump 之 ARG pin (已 obsolete
    by packageManager field)
  - build/plugins/unocss.ts:24: 修 implicit any (svg) → (svg: string)
    (同檔 audit 範圍順道修)

comprehensive audit grep + phantom transitive 全提升為直接 devDeps、
strict isolation 下 vue-tsc + vite build 雙 PASS、Docker build 也過、
host + container pnpm version 對齊單一 source of truth (package.json
packageManager field)。

048-N1 follow-up (a) hoist 策略 review + (b) explicit devDeps + (c)
packageManager pin 三項全結案；(d) 下次 pnpm 升級重新檢視 trigger-driven 留。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 2.10 push origin（**須 user 同意**、per CLAUDE.md §5）

```bash
git push origin rev1-admin-base-web    # 須 user 同意
cd ..
```

---

## Step 3：docker rebuild base-web image + restart + CDP smoke

依 [contracts/verification-commands.md C-V5 + C-V6](./contracts/verification-commands.md) 執行：

```bash
docker build -t base-web:rev1-admin-base-web ./base-web 2>&1 | tail -10
# expect: 最後 "naming to docker.io/library/base-web:rev1-admin-base-web done"

$PC up -d --force-recreate --no-deps base-web 2>&1 | tail -5
sleep 30
$PC ps --format "{{.Service}}: {{.Status}}" | grep base-web
# expect: Up X seconds (healthy)

# C-V6: reuse 048 cdp-smoke.js（無需重寫）
node specs/048-base-typings-sync/contracts/cdp-smoke.js 2>&1 | tail -20
# expect: 8/8 PASS
```

---

## Step 4：Outer feature branch 多段 commit（per CLAUDE.md §4.1）

### 4.1 outer commit 2：base-web SHA pin bump

```bash
git status      # expect "modified: base-web" (gitlink change)
BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)
git add base-web
git commit -m "$(cat <<EOF
chore(submodule): bump base-web 到 ${BASE_WEB_SHA} — 049 dep-hygiene Part B

049 Part B base-web dep hygiene impl 整體（per spec FR-004~007、data-model E2）：
  - pnpm-workspace.yaml: remove nodeLinker: hoisted
  - .npmrc: remove shamefully-hoist=true vestige
  - package.json: 加 packageManager + explicit devDeps (audit-driven)
  - packages/uno-preset/package.json: 加 @unocss/core + @unocss/preset-mini
  - Dockerfile: remove ARG PNPM_VERSION + corepack prepare、改 corepack enable only
  - build/plugins/unocss.ts: 修 implicit any (line 24)

軌道：TS-DepGraph-Hygiene (Constitution v1.6.0 首發 sprint)。

pnpm install --frozen-lockfile + vue-tsc + vite build 三 PASS、
docker build PASS、base-web service restart healthy、CDP smoke 8 路徑
全 PASS（reuse 048 cdp-smoke.js）。

048-N1 follow-up (a)+(b)+(c) 結案、(d) trigger-driven 留。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.2 outer commit 3：INTEGRATION-CHECKLIST update + SPECKIT marker

per [data-model E3](./data-model.md)：
- 048-N1 衍生 follow-up row 改為 footnote「已結案 (a)+(b)+(c)、(d) trigger-driven 留」格式
- 已完成里程碑加 049 entry（outer/merge/base-web SHA placeholder 留 backfill）
- Current Focus「現狀」加 049、「下一步」改為條件觸發第 1 段（042-N4 / 042-N5 / 048-N1 (d) 各自獨立）
- CLAUDE.md SPECKIT marker idle

```bash
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: 049 收尾 INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker (049 Polish)

INTEGRATION-CHECKLIST.md：
  - 衍生 follow-up 048-N1 row 改為 footnote「已結案 (a)+(b)+(c)、(d)
    trigger-driven 留」格式 (保留歷史脈絡)
  - 已完成里程碑加 049 entry (outer/merge/base-web SHA placeholder 留
    backfill、由 Step 6 post-merge 階段回填)
  - Current Focus 「現狀」更新含 049 + 「下一步」改向條件觸發 follow-up
    backlog 第 1 階段 (042-N4 / 042-N5 / 048-N1 (d) 各自獨立、wait
    for trigger)

CLAUDE.md SPECKIT marker：Active Spec / Active Plan idle、Phase idle、
下一步指向條件觸發。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.3 outer commit 4：DESIGN-W-BASE-WEB.md §4.4.2 完整性 verify（無 commit、純檢查）

```bash
grep -E "049 base-web-dep-hygiene|<TBD post-merge>" docs/INTEGRATION-DESIGN-W-BASE-WEB.md | head -3
# expect: 049 條目命中 + SHA placeholder
```

若 Step 1 建檔時 §4.4.2 完整、本 task 純 verify pass；若漏掉、補完並 amend 到 Step 1.9 commit 或新獨立 commit。

### 4.4 push origin（**須 user 同意**）

```bash
git push origin 049-base-web-dep-hygiene    # 須 user 同意
```

---

## Step 5：merge 回 rev1-admin-root（**須 user 同意**、per CLAUDE.md §5）

```bash
git checkout rev1-admin-root
git pull --ff-only origin rev1-admin-root
git merge --no-ff 049-base-web-dep-hygiene -m "Merge feature 049-base-web-dep-hygiene"

# push rev1-admin-root 須 user 再次同意
git push origin rev1-admin-root
```

---

## Step 6：SHA backfill post-merge（**須 user 同意**）

```bash
# 拿 outer (feature branch last) / merge / base-web SHA
OUTER_SHA=$(git log --first-parent rev1-admin-root --oneline | grep -m1 "049 收尾" | awk '{print $1}')
MERGE_SHA=$(git log --merges -1 --format=%h)
BASE_WEB_SHA=$(cd base-web && git rev-parse --short HEAD)
echo "outer=$OUTER_SHA merge=$MERGE_SHA base-web=$BASE_WEB_SHA"

# 編兩處 placeholder 換成真 SHA：
# 1. docs/INTEGRATION-CHECKLIST.md 049 entry placeholder
# 2. docs/INTEGRATION-DESIGN-W-BASE-WEB.md §4.4.2 049 sprint commit placeholder

git add docs/INTEGRATION-CHECKLIST.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md
git commit -m "chore: backfill 049 milestone entry SHA (outer $OUTER_SHA + merge $MERGE_SHA + base-web $BASE_WEB_SHA)"
git push origin rev1-admin-root    # 須 user 同意
```

---

## Step 7：Acceptance final verification

跑 [contracts/verification-commands.md](./contracts/verification-commands.md) C-V1~C-V10 全 10 條：

| C-V | 內容 | PASS criterion |
|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer | 12 service Up + drainer log |
| C-V2 | host pnpm install --frozen-lockfile PASS | Done in X.Xs、無 lockfile drift |
| C-V3 | host vue-tsc 0 error | 0 TS error、baseline 15 全清 |
| C-V4 | host vite build --mode prod PASS | Build successful、dist 產出 |
| C-V5 | docker rebuild + container healthy | container `Up (healthy)`、HTTP 200 |
| C-V6 | CDP smoke 8 路徑 | 8/8 PASS（reuse 048 cdp-smoke.js）|
| C-V7 | grep audit verification | nodeLinker/shamefully-hoist/ARG/corepack prepare 全 0、packageManager/corepack enable/svg: string 全命中 |
| C-V8 | boundary verify | base-web src/ + rust-api + schema migration + cargo dep 全 0 diff |
| C-V9 | Constitution v1.6.0 + DESIGN-W-BASE-WEB.md 完整性 | v1.6.0 bump + 4 § + 049 §4.4.2 + plan-template 4 軌道 + CLAUDE 索引 unified |
| C-V10 | INTEGRATION-CHECKLIST cleanup | 048-N1 footnote + 049 entry + 下一步條件觸發 + SPECKIT idle |

C-V1~C-V10 全 PASS = 049 acceptance PASS、ready for `superpowers:executing-plans`（per CLAUDE.md §3）→ subagent-driven-development。

---

## 預估時間

| 階段 | 估時 |
|---|---|
| Step 1 (Phase 0 Constitution + DESIGN merge + plan-template + CLAUDE + outer commit 1) | ~60-90 min（DESIGN merge restructure 為主要時間佔比）|
| Step 2 (audit grep + Part B base-web impl + 本機 verify + worktree commit) | ~60-90 min（comprehensive audit + dep 提升 + config cleanup）|
| Step 3 (docker rebuild + restart + CDP smoke) | ~30-45 min（含 base-web image build ~5-10min + smoke ~20-30min）|
| Step 4 (outer commits 2-3 + DESIGN §4.4.2 verify) | ~10 min |
| Step 5 (push + merge + push rev1-admin-root、user 同意關卡 ×3) | ~10-15 min |
| Step 6 (SHA backfill + push、user 同意關卡 ×1) | ~5 min |
| Step 7 (acceptance final C-V1~C-V10) | ~10 min |
| **合計** | **~3-4 hr**（含 user 同意等待、~少於 brainstorm §7 估時 5-6hr 因 audit + DESIGN merge 為主要不確定性、實作熟練度因素）|

---

## 紀律總結

- **限 base-web build/dep config 範圍**（FR-008、軌道嚴禁邊界）
- **0 base-web src/ diff**（FR-008）
- **0 rust-api 改動 / 0 schema migration / 0 新 cargo dep / 0 新 npm dep**（FR-008、純 transitive → direct 提升、無新版本）
- **W-WEBUI 軌道 + TS-Typing-Sync 軌道範圍 0 diff**（FR-008、軌道互斥）
- **SDD「先合法化、再執行」順序**（FR-009、Phase 0 必先）
- **implementer-stage expansion ≤3**（FR-012、Phase 1 audit 拾取候選 (a)(b)(c)、超限拒）
- **push / merge 須 user 同意**（per CLAUDE.md §5）
- **reuse 048 cdp-smoke.js**（不動、specs/048-base-typings-sync/contracts/cdp-smoke.js）
