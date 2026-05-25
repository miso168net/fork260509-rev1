# Verification Commands — 049 base-web-dep-hygiene-and-track-restructure

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

10 個 C-V contract = 本 sprint 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-008）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 12 service**（5 既有 + 7 observability healthy、per 044/046/047/048 baseline）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

---

## C-V1：dev stack 12 service healthy + drainer 跑著（baseline）

對應 SC-001（接 048 baseline 不退化）。

```bash
echo "=== 12 service health ==="
$PC ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer 跑著 ==="
$PC logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox" | head -5
```

**Expected**：12 service `Up`（9 healthy + 3 by-design no-healthcheck：nginx-exporter / promtail / redis_exporter）；rust-api log 顯示 drainer / outbox 背景 task。

---

## C-V2：host `pnpm install --frozen-lockfile --ignore-scripts` PASS

對應 SC-002（lockfile 仍 frozen-able、無 dep 衝突、為 strict isolation + explicit devDeps 後的 baseline）。

**前置**：Phase 1 base-web 改動完成（package.json 加 explicit devDeps + pnpm-workspace.yaml remove nodeLinker: hoisted）。

```bash
cd base-web
pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -10
cd ..
```

**Expected**：`Done in X.Xs using pnpm v11.0.8` 結尾、無「lockfile is out of sync」error、無 missing dep warning。

**失敗預案**：若撞 lockfile drift → user 拍板是否重 generate lockfile（屬 [research R-9.1 (a)](../research.md) expansion candidate）。

---

## C-V3：host `vue-tsc --noEmit --skipLibCheck` 0 error

對應 SC-002 + SC-004（strict isolation 下 typecheck PASS、phantom dep 全 declared）。

```bash
cd base-web
node_modules/.bin/vue-tsc --noEmit --skipLibCheck 2>&1 | grep -cE "error TS"
echo "(expect 0)"

# 確認 048 baseline 15 error 已全清
node_modules/.bin/vue-tsc --noEmit --skipLibCheck 2>&1 | grep -E "error TS" | head -5
cd ..
```

**Expected**：`0` error；無 「Cannot find module」/「implicitly has an 'any' type」/「response.data is of type unknown」等 baseline error。

**失敗預案**：若撞 missing module error → audit 漏抓 phantom、補加進 package.json（屬 [research R-9.1 (a)](../research.md) expansion candidate）。

---

## C-V4：host `vite build --mode prod` PASS、dist 產出

對應 SC-002（runtime build 也過 strict isolation）。

```bash
cd base-web
node_modules/.bin/vite build --mode prod 2>&1 | tail -5

ls -la dist/ 2>&1 | head -5
ls dist/assets 2>&1 | head -3
cd ..
```

**Expected**：`Build successful` 結尾、`dist/` 含 `index.html` + `favicon.svg` + `assets/`；assets 含多個 .js / .css 檔（modules transformed > 0）。

**失敗預案**：若 build fail → 跟 C-V3 相關、修 typecheck 即可（vite 用 esbuild、TS strict 不阻 build、但 module resolution 真的有問題會 fail）。

---

## C-V5：docker rebuild base-web image + container `Up (healthy)`

對應 SC-003 前置（container 內也 strict isolation 過、corepack 從 packageManager field 讀 pnpm version）。

**前置**：C-V2 + C-V3 + C-V4 PASS（host 過 + Dockerfile 改完）。

```bash
docker build -t base-web:rev1-admin-base-web ./base-web 2>&1 | tail -10
# expect: 最後 "naming to docker.io/library/base-web:rev1-admin-base-web done"

$PC up -d --force-recreate --no-deps base-web 2>&1 | tail -5
sleep 12
$PC ps --format "{{.Service}}: {{.Status}}" | grep base-web
# expect: Up X seconds (health: starting) → 後續 healthy
sleep 20
$PC ps --format "{{.Service}}: {{.Status}}" | grep base-web
# expect: Up X seconds (healthy)

# SPA accessible
curl -sI http://127.0.0.1:11080/ 2>&1 | head -3
# expect: HTTP/1.1 200 OK
```

**Expected**：docker build 成功（corepack 從 packageManager field 讀 pnpm@11.0.8、容器內 strict isolation 通）；container restart 後 status `Up (healthy)`、SPA HTTP 200 OK。

---

## C-V6：CDP browser smoke deep 8 路徑（reuse 048 cdp-smoke.js）

對應 SC-003、FR-010。

**前置**：C-V1~C-V5 全 PASS、Edge `:9229` debug port 開著。

```bash
# 確認 Edge debug 開著（per memory: reference_cdp_smoke_technique）
curl -s --connect-timeout 3 http://127.0.0.1:9229/json/version 2>&1 | head -5

# reuse 048 cdp-smoke.js（無需重寫）
node specs/048-base-typings-sync/contracts/cdp-smoke.js 2>&1 | tail -20
```

**Expected**：8/8 PASS、無 console error。期望輸出（per 048 體例）：

```text
[CDP smoke 048] 8 path verification
=========================================
  ✓ 1. Login (Soybean/123456): PASS — redirected to /home
  ✓ 2. Dynamic menu loaded (M1+M2): PASS — N menu items rendered
  ✓ 3. /manage/role list: PASS — N rows
  ✓ 4. menu-auth modal NTree (M3): PASS — N tree nodes
  ✓ 5. /manage/menu list: PASS — N rows
  ✓ 6. menu add modal root (D2 showLayout=true): PASS
  ✓ 7. menu add modal child (D2 showLayout=false): PASS
  ✓ 8. /manage/user list: PASS — N rows
=========================================
Total: 8/8 PASS、0 FAIL
```

**注意**：runtime 不退化是本 sprint 的「不能撞到的 fail」標準；049 改動 build/dep config + 移 hoisted → strict、runtime 行為應該完全等同 048 落地後狀態。

**失敗預案**：若任一路徑 fail → 視為 base-web runtime regression（dep 提升 + isolation 改動實質影響 SPA）、debug + 修 + 重 build + 重 CDP；超 ≤3 expansion budget → 拒拾、登 049-N# follow-up。

---

## C-V7：grep audit verification（軌道紀律 + spec FR）

對應 SC-004。

```bash
echo "=== FR-004 (a): nodeLinker: hoisted 移除 ==="
grep -c "nodeLinker: hoisted" base-web/pnpm-workspace.yaml
echo "(expect 0)"

echo ""
echo "=== FR-004 (b): .npmrc shamefully-hoist=true 移除 ==="
grep -c "shamefully-hoist=true" base-web/.npmrc
echo "(expect 0)"

echo ""
echo "=== FR-005 (a): package.json packageManager field 加 ==="
grep -cE '"packageManager".*"pnpm@' base-web/package.json
echo "(expect ≥1)"

echo ""
echo "=== FR-005 (b): Dockerfile ARG PNPM_VERSION 移除 ==="
grep -c "ARG PNPM_VERSION" base-web/Dockerfile
echo "(expect 0)"

echo ""
echo "=== FR-005 (c): Dockerfile corepack prepare 移除 ==="
grep -c "corepack prepare" base-web/Dockerfile
echo "(expect 0)"

echo ""
echo "=== FR-005 (d): Dockerfile corepack enable 保留 ==="
grep -c "corepack enable" base-web/Dockerfile
echo "(expect ≥1)"

echo ""
echo "=== FR-007: build/plugins/unocss.ts implicit any 修 ==="
grep -E "\(svg(:\s*string)?\)" base-web/build/plugins/unocss.ts | head -3
echo "(expect 'svg: string' present)"

echo ""
echo "=== 048 baseline 15 error 全清 ==="
cd base-web && node_modules/.bin/vue-tsc --noEmit --skipLibCheck 2>&1 | grep -E "error TS" | wc -l && cd ..
echo "(expect 0)"
```

**Expected**：所有 grep PASS — `nodeLinker: hoisted` 0、`shamefully-hoist=true` 0、`packageManager.*pnpm@` ≥1、`ARG PNPM_VERSION` 0、`corepack prepare` 0、`corepack enable` ≥1、`svg: string` present、baseline 15 error 全清為 0。

---

## C-V8：boundary verify（軌道紀律、scope discipline）

對應 SC-005、FR-008。

```bash
echo "=== FR-008: TS-DepGraph-Hygiene 軌道內 base-web 改動限定範圍 ==="
echo "--- base-web changed files (本 sprint diff vs origin/rev1-admin-base-web) ---"
cd base-web && git diff --name-only origin/rev1-admin-base-web..HEAD && cd ..
echo "(expect: Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/uno-preset/package.json [+ possibly other sub-packages] / build/plugins/unocss.ts only)"

echo ""
echo "=== FR-008: base-web src/ 0 diff ==="
cd base-web && git diff --stat HEAD origin/rev1-admin-base-web -- src/ 2>&1 | wc -l && cd ..
echo "(expect 0)"

echo ""
echo "=== FR-008: rust-api 0 diff ==="
git diff --stat origin/rev1-admin-root..HEAD rust-api/ 2>&1 | wc -l
echo "(expect 0)"

echo ""
echo "=== FR-008: 0 schema migration ==="
find rust-api/migration/src -name "*.rs" -newer specs/049-base-web-dep-hygiene/spec.md 2>/dev/null
echo "(expect empty)"

echo ""
echo "=== FR-008: 0 新 cargo dep ==="
git diff origin/rev1-admin-root..HEAD rust-api/Cargo.toml 2>&1 | wc -l
echo "(expect 0)"

echo ""
echo "=== 048 cdp-smoke.js 不動（reuse） ==="
git diff origin/rev1-admin-root..HEAD specs/048-base-typings-sync/contracts/cdp-smoke.js 2>&1 | wc -l
echo "(expect 0)"
```

**Expected**：軌道紀律 boundary 全 PASS — 只有 base-web 限定範圍內檔有 diff、src/ + rust-api/ + schema migration + cargo dep 全 0 diff、048 cdp-smoke.js 不動。

---

## C-V9：Constitution v1.6.0 + DESIGN-W-BASE-WEB.md 完整性驗

對應 SC-006、FR-001/002/003。

```bash
echo "=== Constitution v1.6.0 bump 命中 ==="
grep -cE "1\.6\.0|TS-DepGraph-Hygiene" .specify/memory/constitution.md
echo "(expect >=4)"

echo ""
echo "=== Constitution §IV TS-DepGraph-Hygiene 段落內容驗 ==="
grep -cE "TS-DepGraph-Hygiene 軌道|INTEGRATION-DESIGN-W-BASE-WEB" .specify/memory/constitution.md
echo "(expect >=3)"

echo ""
echo "=== DESIGN-W-BASE-WEB.md 新 unified doc 存在 + 4 section 命中 ==="
ls -la docs/INTEGRATION-DESIGN-W-BASE-WEB.md 2>&1 | head -3
grep -cE "^## §[1-4] " docs/INTEGRATION-DESIGN-W-BASE-WEB.md
echo "(expect 4)"

echo ""
echo "=== DESIGN-W-BASE-WEB.md §4.4.2 049 sprint 條目 ==="
grep -c "049 base-web-dep-hygiene" docs/INTEGRATION-DESIGN-W-BASE-WEB.md
echo "(expect ≥1)"

echo ""
echo "=== DESIGN-W-TYPING-ALIGN.md 已刪除 ==="
ls docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md 2>&1 | head -1
echo "(expect 'No such file or directory')"

echo ""
echo "=== DESIGN-W-WEBUI.md 已 rename（git history 透過 git log --follow 仍可追溯）==="
ls docs/INTEGRATION-DESIGN-W-WEBUI.md 2>&1 | head -1
echo "(expect 'No such file or directory')"
git log --follow --oneline docs/INTEGRATION-DESIGN-W-BASE-WEB.md 2>&1 | head -3
echo "(expect: 多 commit、含原 W-WEBUI.md history)"

echo ""
echo "=== plan-template 3-軌道辨識條目 ==="
grep -cE "W-WEBUI 軌道|TS-Typing-Sync 軌道|TS-DepGraph-Hygiene 軌道|軌道外" .specify/templates/plan-template.md
echo "(expect ≥4)"

echo ""
echo "=== CLAUDE.md §7 索引 unified ==="
grep -c "INTEGRATION-DESIGN-W-BASE-WEB" CLAUDE.md
echo "(expect ≥2)"
grep -c "INTEGRATION-DESIGN-W-WEBUI\|INTEGRATION-DESIGN-W-TYPING-ALIGN" CLAUDE.md
echo "(expect 0、舊 ref 全 cleanup)"
```

**Expected**：Constitution v1.6.0 bump 完整、DESIGN-W-BASE-WEB.md 新 unified doc 4 § 到位、§4.4.2 049 sprint 條目就位、TYPING-ALIGN.md 已刪除、W-WEBUI.md 已 rename（git history 透過 git log --follow 仍可追溯）、plan-template 4-選一 wording 加入、CLAUDE.md 索引 unified（無舊 ref 殘留）。

---

## C-V10：INTEGRATION-CHECKLIST cleanup + 049 entry + 048-N1 結案

對應 SC-007 + SC-008、FR-011。

```bash
echo "=== FR-011(a): 048-N1 row 處理（改為 footnote 已結案格式） ==="
grep -c "048-N1 pnpm 11 hoist env-repair（已結案" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

# 確認 048-N1 不再在 table row
grep "^| 048-N1" docs/INTEGRATION-CHECKLIST.md
echo "(expect: 0 hit — table row 已移除)"

echo ""
echo "=== FR-011(b): 049 milestone entry 就位 ==="
grep -c "049 base-web-dep-hygiene-and-track-restructure" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

echo ""
echo "=== FR-011(c): 下一步指向條件觸發（含 048-N1 (d) 標示） ==="
grep -E "048-N1 \(d\)|042-N4|042-N5" docs/INTEGRATION-CHECKLIST.md | head -3

echo ""
echo "=== FR-011(d): CLAUDE.md SPECKIT marker idle ==="
grep -A4 "<!-- SPECKIT START -->" CLAUDE.md | head -6
echo "(expect: Active Spec —、Active Plan —、Phase idle、下一步指向條件觸發)"

echo ""
echo "=== SC-008: 048-N1 (a)+(b)+(c) 結案 confirm ==="
grep -E "結案 \(a\)\+\(b\)\+\(c\)|(a) hoist 策略|(b) explicit devDep|(c) packageManager pin" docs/INTEGRATION-CHECKLIST.md | head -5
echo "(expect ≥3 hits — 3 項都明示結案)"
```

**Expected**：048-N1 row 改為 footnote「已結案 (a)+(b)+(c)」格式、保留歷史脈絡 + (d) trigger-driven 留 + 049 entry ≥1 hit + SPECKIT marker idle + 3 項結案明示。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer | SC-001 | infra baseline |
| C-V2 | host pnpm install --frozen-lockfile PASS | SC-002、FR-004/006 | strict isolation install gate |
| C-V3 | host vue-tsc 0 error | SC-002、FR-004/006 | type gate（含 implicit any fix）|
| C-V4 | host vite build --mode prod PASS | SC-002 | runtime build gate |
| C-V5 | docker rebuild base-web + restart healthy | SC-003、FR-005 | container build gate |
| C-V6 | CDP browser smoke 8 路徑（reuse 048）| SC-003、FR-010 | runtime acceptance |
| C-V7 | grep audit verification | SC-004、FR-004/005/007 | static |
| C-V8 | boundary verify（軌道紀律、scope discipline）| SC-005、FR-008 | scope discipline |
| C-V9 | Constitution v1.6.0 + DESIGN-W-BASE-WEB.md 完整性 | SC-006、FR-001/002/003 | governance docs |
| C-V10 | INTEGRATION-CHECKLIST + 049 entry + 048-N1 結案 | SC-007、SC-008、FR-011 | docs |

C-V1~C-V10 全 PASS = acceptance PASS、ready for outer + worktree commit + merge。
