# Verification Commands — 048 base-typings-sync

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

9 個 C-V contract = 本 sprint 的 acceptance verification scenarios（per spec.md SC-001 ~ SC-008）。

執行環境：host bash、outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、**dev stack 12 service**（5 既有 + 7 observability healthy、per 044 / 046 / 047 baseline）+ rust-api drainer 跑著。

```bash
# Shorthand alias（建議 export）
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

---

## C-V1：dev stack 12 service healthy + drainer 跑著（baseline）

對應 SC-001（接 047 baseline 不退化）。

```bash
echo "=== 12 service health ==="
$PC ps --format "table {{.Service}}\t{{.Status}}"

echo ""
echo "=== rust-api drainer 跑著 ==="
$PC logs --tail=200 rust-api 2>/dev/null | grep -iE "drainer|outbox" | head -5
```

**Expected**：12 service `Up (healthy)`（044/046/047 baseline；redis_exporter / nginx-exporter / promtail "Up" without healthcheck by design）；rust-api log 顯示 drainer / outbox 背景 task。

---

## C-V2：base-web pnpm typecheck PASS

對應 SC-002、FR-001/002/003/004/005（typing 改後 vue-tsc 0 error）。

```bash
cd base-web
pnpm typecheck 2>&1 | tail -10
cd ..
```

**Expected**：vue-tsc 跑完無 error、輸出末尾「Done.」或 0 error 訊息。

若 vue-tsc 報 type error → 修正 typing diff（往往是 consumer code 撞 typing change、屬 implementer-stage debug、或 R-2 grep 漏抓 consumer）。

---

## C-V3：base-web pnpm build PASS

對應 SC-002（同 C-V2 互補：build 含 compile + bundle、catch typecheck miss）。

```bash
cd base-web
pnpm build 2>&1 | tail -20
cd ..

ls -la base-web/dist/ 2>&1 | head -5
```

**Expected**：vite build 跑完無 error、dist/ 產出含 index.html + assets/、build summary 顯示 modules transformed > 0。

---

## C-V4：docker rebuild base-web image + service restart healthy

對應 SC-003 前置（image 重 build 後才能 CDP smoke）。

**前置**：C-V2 + C-V3 PASS（typecheck + build 過、確認 typing fix 不阻 build）。

```bash
docker build -t base-web:rev1-admin-base-web ./base-web 2>&1 | tail -10
# expect: 最後 "naming to docker.io/library/base-web:rev1-admin-base-web done"

$PC up -d --force-recreate --no-deps base-web 2>&1 | tail -5
sleep 12
$PC ps --format "{{.Service}}: {{.Status}}" | grep base-web
# expect: Up X seconds (healthy)
```

**Expected**：base-web image build 成功、container restart 後 status `Up (healthy)`、front-nginx 拉新 base-web image SPA assets。

---

## C-V5：grep verification — 3 mismatch fix + 3 JSDoc 命中

對應 SC-004 + SC-005、FR-001/002/003/004/005。

```bash
echo "=== M1: MenuRoute.id: number 命中 ==="
grep "id: number" base-web/src/typings/api/route.d.ts
echo "(expect ≥1)"

echo ""
echo "=== M2: MenuRoute.pid: string 命中 ==="
grep "pid: string" base-web/src/typings/api/route.d.ts
echo "(expect ≥1)"

echo ""
echo "=== M3 a: MenuTree.pid: string 命中 ==="
grep "pid: string" base-web/src/typings/api/system-manage.d.ts
echo "(expect ≥1)"

echo ""
echo "=== M3 b: 舊 pId: number 完全移除 ==="
grep "pId: number" base-web/src/typings/api/system-manage.d.ts
echo "(expect 0 hits)"

echo ""
echo "=== D1: CommonRecord.id JSDoc 含 Snowflake/53bit/MAX_SAFE_INTEGER ==="
grep -E "Snowflake|53bit|MAX_SAFE_INTEGER" base-web/src/typings/api/common.d.ts
echo "(expect ≥1 of each keyword)"

echo ""
echo "=== D2: Menu.parentId JSDoc 含 root menu sentinel / 0 / menu-operate-modal.vue:137 ==="
grep -E "root menu sentinel|\\\`0\\\`|menu-operate-modal.vue:137" base-web/src/typings/api/system-manage.d.ts
echo "(expect ≥1 of each keyword)"

echo ""
echo "=== D3: UserInfo.userId JSDoc 含 ULID / JWT subject / display_id ==="
grep -E "ULID|JWT subject|display_id" base-web/src/typings/api/auth.d.ts
echo "(expect ≥1 of each keyword)"
```

**Expected**：M1-M3 全命中（+ M3 舊宣告完全移除）；D1-D3 JSDoc 關鍵字全命中。

---

## C-V6：CDP browser smoke deep 8 路徑

對應 SC-003、FR-012。

**前置**：C-V1~C-V4 全 PASS、Edge `:9229` debug port 開著。

```bash
# 啟 Edge debug instance（若未開）
# Windows host: msedge.exe --remote-debugging-port=9229 --user-data-dir=C:\tmp\edge-cdp-profile
# WSL 內存取：透過 mirrored networking 直連 127.0.0.1:9229

# CDP smoke node script 路徑（per 037/038/040 體例）
node specs/048-base-typings-sync/contracts/cdp-smoke.js 2>&1 | tail -40
```

**期望輸出格式**（per 037/038/040 體例的 PASS/FAIL 摘要）：

```text
[CDP smoke 048] 8 路徑驗證
========================================
1. Login (Soybean / 123456)              PASS  (1.2s)
2. Dynamic menu 載入                       PASS  (0.8s)  M1+M2 驗
3. role 列表 → 編輯 modal                  PASS  (1.5s)
4. role 編輯 → 菜单权限 modal NTree         PASS  (2.1s)  M3 驗
5. menu 列表                              PASS  (1.0s)
6. menu 新增 modal root (parentId=0)      PASS  (1.4s)  D2 驗 showLayout=true
7. menu 新增 modal child (parentId>0)     PASS  (1.4s)  D2 驗 showLayout=false
8. user 列表                              PASS  (1.0s)
========================================
總計：8/8 PASS、無 console error
```

**Expected**：8/8 PASS、無 runtime error、無 console.error / console.warn。

**失敗預案**（per brainstorm §3.4）：若任一路徑 fail → debug 該 consumer（fix consumer code + 補 C-V5 grep pattern）+ 重 build + 重 CDP；超 ≤3 expansion budget → 拒拾、登 048-N# follow-up。

**注意**：本 sprint **不**包含 cdp-smoke.js script 本身的 implementation（屬 implementer-stage 工作、用 037/038/040 體例既有 helper / pattern 改寫）。Phase 0 implementer 階段如有需要可 grep 既有 CDP smoke script reference（037/038/040 spec 內 references）。

---

## C-V7：boundary verify（軌道紀律、scope discipline）

對應 SC-006、FR-006/007（軌道紀律 boundary）。

```bash
echo "=== FR-007: TS-Typing-Sync 軌道內 4 檔 ONLY 有 diff ==="
git diff --name-only main..HEAD base-web/src/ 2>&1 | sort
echo "(expect: 只有 src/typings/api/route.d.ts / system-manage.d.ts / common.d.ts / auth.d.ts 4 檔)"

echo ""
echo "=== FR-007: 其他 typings 0 diff ==="
git diff base-web/src/typings/app.d.ts base-web/src/typings/router.d.ts base-web/src/typings/components.d.ts base-web/src/typings/elegant-router.d.ts 2>&1 | wc -l
echo "(expect 0)"

echo ""
echo "=== FR-007: W-WEBUI 軌道範圍 0 diff ==="
for d in base-web/src/views base-web/src/components base-web/src/service base-web/src/store base-web/src/router base-web/src/locales; do
  N=$(git diff --stat "$d" 2>&1 | wc -l)
  echo "  $d: $N line"
done
echo "(expect 全 0)"

echo ""
echo "=== FR-006: 0 rust-api 改動 ==="
git diff --stat rust-api/ 2>&1 | head -5
echo "(expect 0)"

echo ""
echo "=== FR-006: 0 schema migration ==="
find rust-api/migration/src -name "*.rs" -newer specs/048-base-typings-sync/spec.md 2>/dev/null
echo "(expect empty)"

echo ""
echo "=== FR-006: 0 新 workspace cargo dep ==="
git diff rust-api/Cargo.toml 2>&1 | wc -l
echo "(expect 0)"

echo ""
echo "=== Menu.parentId === 0 comparison preserved (sentinel) ==="
grep -n "parentId === 0" base-web/src/views/manage/menu/modules/menu-operate-modal.vue 2>/dev/null
echo "(expect 1 hit、保留 D2 sentinel 語意)"
```

**Expected**：軌道紀律 boundary 全 PASS — 只有 4 檔 typings/api/ 有 diff、其他 0 diff、rust-api 0 diff、sentinel 保留。

---

## C-V8：Constitution + DESIGN-W-TYPING-ALIGN 完整性驗

對應 SC-007、FR-008/009/010。

```bash
echo "=== Constitution v1.5.0 bump 命中 ==="
grep "1\.5\.0\|TS-Typing-Sync" .specify/memory/constitution.md | head -5
echo "(expect ≥3 hits — Version field + IV. 新段落 + Version History)"

echo ""
echo "=== Constitution §IV TS-Typing-Sync 段落內容驗 ==="
grep -E "TS-Typing-Sync 軌道|INTEGRATION-DESIGN-W-TYPING-ALIGN" .specify/memory/constitution.md | head -5
echo "(expect ≥3 hits)"

echo ""
echo "=== DESIGN-W-TYPING-ALIGN.md 新文件存在 + 6 section 命中 ==="
ls -la docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md 2>&1 | head -3
echo "---"
grep -cE "^## §[1-6] " docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
echo "(expect ≥6)"

echo ""
echo "=== DESIGN-W-TYPING-ALIGN §4.1 048 sprint 條目 ==="
grep "048 base-typings-sync" docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
echo "(expect ≥1 hit)"

echo ""
echo "=== plan-template 軌道辨識條目 ==="
grep -E "W-WEBUI|TS-Typing-Sync|軌道辨識" .specify/templates/plan-template.md
echo "(expect ≥1 hit)"

echo ""
echo "=== CLAUDE.md §1/§7 索引補 DESIGN-W-TYPING-ALIGN ==="
grep "INTEGRATION-DESIGN-W-TYPING-ALIGN" CLAUDE.md
echo "(expect ≥1 hit)"
```

**Expected**：Constitution v1.5.0 bump 完整、DESIGN-W-TYPING-ALIGN.md 新文件 6 節到位、§4.1 048 sprint 條目就位、plan-template 軌道辨識 wording 加入、CLAUDE.md 索引補上。

---

## C-V9：INTEGRATION-CHECKLIST cleanup + 048 entry + 下一步指向條件觸發

對應 SC-008、FR-013。

```bash
echo "=== FR-013(a): base-web TS id 型別債 inline note refresh ==="
grep -n "已分階段完成\|post-039+040+048" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1 hit — note 改寫為已完成標示、保留歷史脈絡)"

echo ""
echo "=== FR-013(b): 048 milestone entry 就位 ==="
grep -c "048 base-typings-sync" docs/INTEGRATION-CHECKLIST.md
echo "(expect ≥1)"

echo ""
echo "=== FR-013(c): 下一步指向條件觸發 follow-up backlog 順序第 2 段 ==="
grep -cE "條件觸發|042-N4|042-N5" docs/INTEGRATION-CHECKLIST.md | head -3
echo "(expect ≥1)"

echo ""
echo "=== CLAUDE.md SPECKIT marker idle ==="
grep -A4 "<!-- SPECKIT START -->" CLAUDE.md | head -6
echo "(expect: Active Spec —、Active Plan —、Phase idle、下一步指向條件觸發)"
```

**Expected**：inline note 改寫為「已分階段完成」格式（保留 030-034 / 039 / 040 / 048 三階段歷史）、048 entry ≥1 hit、SPECKIT marker idle。

---

## Summary table

| C-V | Goal | 對應 SC / FR | Phase |
|---|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer | SC-001 | infra baseline |
| C-V2 | base-web pnpm typecheck PASS | SC-002、FR-001~005 | US1+US2 MVP gate |
| C-V3 | base-web pnpm build PASS | SC-002 | US1+US2 MVP gate (互補 C-V2) |
| C-V4 | docker rebuild base-web + restart healthy | SC-003 前置 | runtime |
| C-V5 | grep verification 3 mismatch fix + 3 JSDoc 命中 | SC-004、SC-005 | static |
| C-V6 | CDP browser smoke deep 8 路徑 | SC-003、FR-012 | runtime acceptance |
| C-V7 | boundary verify（軌道紀律、scope discipline） | SC-006、FR-006/007 | scope discipline |
| C-V8 | Constitution + DESIGN-W-TYPING-ALIGN 完整性 | SC-007、FR-008/009/010 | docs |
| C-V9 | INTEGRATION-CHECKLIST cleanup + 048 entry + 下一步 | SC-008、FR-013 | docs |

C-V1~C-V9 全 PASS = acceptance PASS、ready for outer + worktree commit + merge。
