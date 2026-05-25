# Data Model: 049 base-web-dep-hygiene-and-track-restructure

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

049 為 base-web build/dep config hygiene + Constitution governance restructure、**無 application data entity 改動**（0 schema migration、0 rust DTO 改、0 src/ runtime entity）；本檔以「Part A governance edits + Part B base-web edits + INTEGRATION-CHECKLIST cleanup」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. Part A — 軌道 governance restructure（per FR-001/002/003、per [research R-2/R-3/R-4/R-5/R-6/R-7/R-8](./research.md)）

### E1.1 — `.specify/memory/constitution.md` v1.5.0 → v1.6.0 amendment

完整 amendment 內容見 [research R-4](./research.md)（檔頭 Sync Impact Report block 替換 + §IV 主體段落改寫為 3 軌道 + unified Rationale + Version footer line update）。

**估行數**：~40 line edit（檔頭 block ~30 + §IV 段 ~30 改寫 + Version footer 1 line）

### E1.2 — `docs/INTEGRATION-DESIGN-W-WEBUI.md` → `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` rename + restructure

**Step 1**：`git mv docs/INTEGRATION-DESIGN-W-WEBUI.md docs/INTEGRATION-DESIGN-W-BASE-WEB.md`（保留 git history）

**Step 2**：重構新檔內容為 4 § umbrella structure：

| 新 § | 來源 | 行 |
|---|---|---|
| §1 軌道總覽 | **新加**、per [research R-5](./research.md) | ~50 line |
| §2 W-WEBUI 軌道 | 原 W-WEBUI.md 整檔內容 mapping、per [R-2](./research.md) | ~255 line |
| §3 TS-Typing-Sync 軌道 | 從 DESIGN-W-TYPING-ALIGN.md merge、per [R-3](./research.md) | ~116 line |
| §4 TS-DepGraph-Hygiene 軌道 | **新加**、per [R-6](./research.md) | ~120 line |
| **合計** | | ~540 line |

**Step 3**：原 `docs/INTEGRATION-DESIGN-W-WEBUI.md` 整檔內容（255 line）改成 §2 的 sub-§（§2.1-§2.5、wording 1:1 搬移、只改 § numbering）。

**Step 4**：從 `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 把內容 copy 進新 doc §3（§3.1-§3.6、wording 1:1 搬移、只改 § numbering、§3.5 「與其他軌道邊界」wording 改為 unified context ref §1.1）。

**Step 5**：`git rm docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（內容已 merged）

**估行數**：~540 line（新 BASE-WEB.md 全檔）+ delete 116 line（原 TYPING-ALIGN.md）

### E1.3 — `.specify/templates/plan-template.md` 軌道辨識條目 update

per [research R-7](./research.md)：line 36-42 既有 2-軌道 wording → 改為 4-選一（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene / 軌道外）；doc reference 統一指向 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §2/§3/§4。

**估行數**：~8 line edit（既有 7 line 改為 9 line、淨 +2）

### E1.4 — `CLAUDE.md` §1/§7 索引 update

per [research R-8](./research.md)：
- §1 line 36 footnote：改 3 軌道 wording、doc reference unified 指向 `docs/INTEGRATION-DESIGN-W-BASE-WEB.md`
- §7 line 336：remove DESIGN-W-WEBUI + DESIGN-W-TYPING-ALIGN ref、加 DESIGN-W-BASE-WEB ref（含「unified（含 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 三軌道）」標示）

**估行數**：~5 line edit（§1 footnote 1 line + §7 索引 1 line + ref 改）

### E1.5 — Part A 總計

| File | Operation | est line diff |
|---|---|---|
| `.specify/memory/constitution.md` | edit (v1.5→v1.6) | ~40 |
| `docs/INTEGRATION-DESIGN-W-WEBUI.md` | `git mv` → BASE-WEB.md + restructure | rename + add ~290 (§1 + §3 + §4) |
| `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` | `git rm` (content merged) | -116 |
| `.specify/templates/plan-template.md` | edit | ~+2 |
| `CLAUDE.md` | edit (§1/§7) | ~+1 |
| **Part A 合計** | | **~217 net line + rename + delete** |

---

## E2. Part B — base-web dep hygiene impl（per FR-004/005/006/007、per [research R-1](./research.md)）

### E2.1 — `base-web/pnpm-workspace.yaml`

**BEFORE**：
```yaml
packages:
  - 'packages/*'
nodeLinker: hoisted
```

**AFTER**：
```yaml
packages:
  - 'packages/*'
```

**Diff**：`-1 line`（移除 `nodeLinker: hoisted`）

### E2.2 — `base-web/.npmrc`

**BEFORE**：
```
registry=https://registry.npmmirror.com/
shamefully-hoist=true
ignore-workspace-root-check=true
link-workspace-packages=true
```

**AFTER**：
```
registry=https://registry.npmmirror.com/
ignore-workspace-root-check=true
link-workspace-packages=true
```

**Diff**：`-1 line`（移除 `shamefully-hoist=true` vestige、保留 registry + workspace settings）

### E2.3 — `base-web/package.json`

**BEFORE**（line 1-10）：
```json
{
  "name": "soybean-admin",
  "type": "module",
  "version": "2.1.0",
  ...
  "scripts": { ... },
  "dependencies": {
    ...既有 deps...
  },
```

**AFTER**：
```json
{
  "name": "soybean-admin",
  "type": "module",
  "version": "2.1.0",
  "packageManager": "pnpm@11.0.8",
  ...
  "scripts": { ... },
  "dependencies": {
    ...既有 deps...
    "axios": "1.13.6",          // 新加、from packages/axios/pnpm-lock resolved version
  },
  "devDependencies": {
    ...既有 devDeps...
    "@iconify/utils": "3.1.0",       // 新加、for build/plugins/unocss.ts
  }
```

**注意**：
- 版本 pin **exact**（無 `^` 或 `~`、per codebase convention）；版本值用 `pnpm-lock.yaml` 既有 resolved version
- `axios` 加進 dependencies（runtime type import）、`@iconify/utils` 加進 devDependencies（build-time only）
- audit 後可能發現額外 phantom（per [research R-9](./research.md) expansion budget）

**Diff**：~+3 line（packageManager field + 2 explicit devDeps、audit 後可能 +3-5 line if more phantom）

### E2.4 — `base-web/packages/uno-preset/package.json`

**BEFORE**（estimated）：
```json
{
  "name": "@sa/uno-preset",
  "type": "module",
  ...
  "devDependencies": {
    ...既有 devDeps（可能無）...
  }
}
```

**AFTER**：
```json
{
  "name": "@sa/uno-preset",
  "type": "module",
  ...
  "devDependencies": {
    "@unocss/core": "<resolved-version>",         // 新加
    "@unocss/preset-mini": "<resolved-version>",  // 新加
    ...其他 既有 devDeps...
  }
}
```

**Diff**：~+2 line（2 devDeps、version 由 `pnpm-lock.yaml` resolved value 填）

**注意**：若 audit 發現 packages/ 其他 sub-package 也需動（如 packages/scripts/ 含 bumpp/cac/c12/execa/rimraf phantom）、屬 [R-9.2 (b)](./research.md) expansion candidate。

### E2.5 — `base-web/Dockerfile`

**BEFORE**（line 17-31）：
```dockerfile
ARG NGINX_VERSION=1.27
ARG PNPM_VERSION=11.0.8       # ← 移除
ARG APP_PORT=8080
...

FROM node:${NODE_VERSION}-slim AS builder
ARG PNPM_VERSION              # ← 移除
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
```

**AFTER**：
```dockerfile
ARG NGINX_VERSION=1.27
ARG APP_PORT=8080
...

FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

RUN corepack enable
# corepack 自動讀 base-web/package.json packageManager field、pnpm 版本由此提供
```

**Diff**：`-3 line` + `+1 line comment`（淨 -2、移除 ARG 宣告 2 處 + corepack prepare command、改為 corepack enable + 註解）

**注意**：原 commit `b4453385` 內 Dockerfile 註解區段（49-56 行的 `# pnpm 11 改 hoist 行為...` 等註解）保留不動（仍有歷史價值說明）。

### E2.6 — `base-web/build/plugins/unocss.ts` (line 24 implicit any fix)

**BEFORE**（line 24）：
```typescript
(svg) => transformSVG(svg)
```

**AFTER**：
```typescript
(svg: string) => transformSVG(svg)
```

**Diff**：`+1 line type 註解`（換 1 line、淨 +0）

**注意**：本 fix 屬 audit 範圍同檔順道修、per FR-007；非 scope creep。

### E2.7 — Part B 總計

| File | Operation | est line diff |
|---|---|---|
| `base-web/pnpm-workspace.yaml` | remove nodeLinker | -1 |
| `base-web/.npmrc` | remove shamefully-hoist | -1 |
| `base-web/package.json` | + packageManager + 2 explicit devDeps（audit 後可能更多） | +3 (~+8 max) |
| `base-web/packages/uno-preset/package.json` | + 2 devDeps | +2 |
| `base-web/packages/<other-sub>/package.json` | TBD per audit (expansion) | TBD (0-5) |
| `base-web/Dockerfile` | -3 line + 1 line | net -2 |
| `base-web/build/plugins/unocss.ts` | implicit any fix | 0 (替換) |
| **Part B 合計** | | **~+1 net line（main path）+ 0-5 expansion** |

---

## E3. INTEGRATION-CHECKLIST cleanup（per FR-011）

### E3.1 — 048-N1 衍生 follow-up row 處理

**Decision**：標記為「已結案 (a)+(b)+(c)、(d) trigger-driven 留」格式、保留 row 但內容改寫（同 `base-web TS id 型別債` 已分階段完成 footnote 體例）。

從 table row 改為 footnote 段落（移出 table、加進「衍生 follow-up」section 內 footnote 區）：

```markdown
> **048-N1 pnpm 11 hoist env-repair（已結案 (a)+(b)+(c)、(d) trigger-driven 留）**：原 048 sprint 期間 host vs container pnpm version drift / pnpm 11 hoist 失效之 env-repair adjacent issue 已分兩階段結案：
> - **048 期間 retrospective**（2026-05-25）：commits `d521c819`（pnpm-workspace.yaml 加 nodeLinker: hoisted、修 host build）+ `b4453385`（Dockerfile pnpm 10.18.0 → 11.0.8 + --ignore-scripts、host + container 對齊）、user 拍板 cross-boundary minimal；retrospective 認定為 TS-DepGraph-Hygiene 軌道 047.5 retro-member。
> - **049 base-web-dep-hygiene**（2026-05-25）：TS-DepGraph-Hygiene 軌道首發 sprint、結案 (a) hoist 策略 review（strict isolation + explicit devDeps 取代 hoisted）+ (b) explicit devDep declarations 完整 audit + (c) packageManager pin 進 package.json（取代 Dockerfile ARG + host system 雙來源）。
> - **未結案 (d)**：「下次 pnpm 升級重新檢視」屬 trigger-driven、留 backlog 等 pnpm 12 或 newer corepack 強制 sha hash 等觸發訊號出現。
```

### E3.2 — 已完成里程碑加 049 entry

格式對齊 048 / 047 體例：
```markdown
- [x] **049 base-web-dep-hygiene-and-track-restructure** ✅（2026-05-25 完成；outer `<OUTER_SHA>` + merge `<MERGE_SHA>`、base-web `<BASE_WEB_SHA>`、rust-api 0 改動；spec `specs/049-base-web-dep-hygiene/`）— TS-DepGraph-Hygiene 軌道首發 sprint（Constitution v1.6.0 同步落地、軌道 governance 從 3 doc 收成 1 unified doc DESIGN-W-BASE-WEB.md）：comprehensive audit + 提升 phantom transitive 為直接 devDeps（@iconify/utils + @unocss/core + @unocss/preset-mini + axios + audit 發現項）+ 移除 nodeLinker: hoisted 回 pnpm 預設 strict isolation + 移除 .npmrc shamefully-hoist=true vestige + 加 packageManager: "pnpm@11.0.8" pin 進 package.json + Dockerfile remove ARG PNPM_VERSION/corepack prepare + 順道修 unocss.ts:24 implicit any；軌道內 base-web build/dep config + 軌道外 outer（Constitution amendment v1.5→v1.6 + DESIGN-W-WEBUI.md → DESIGN-W-BASE-WEB.md rename + restructure + TS-Typing-Sync content merge + DESIGN-W-TYPING-ALIGN.md 刪除 + plan-template 3-軌道辨識 + CLAUDE §1/§7 索引）；0 rust-api 改動、0 schema migration、0 新 cargo dep、0 base-web src/ diff；Constitution 5/5 PASS（post-v1.6.0 amendment）；C-V1~C-V10 全 PASS（含 CDP smoke 8/8、reuse 048 cdp-smoke.js）；048-N1 follow-up (a)+(b)+(c) 結案、(d) trigger-driven 留
```

### E3.3 — Current Focus update

**現狀** 段尾加 049：
```markdown
... 047 sandbox-protect-route-fix + 048 base-typings-sync + **049 base-web-dep-hygiene 落地** —— 049 = TS-DepGraph-Hygiene 軌道首發 sprint（Constitution v1.6.0 同步落地、軌道 governance 從 3 doc 收成 1 unified DESIGN-W-BASE-WEB.md）= comprehensive audit + 提升 phantom transitive 為直接 devDeps + 移除 nodeLinker: hoisted + 加 packageManager pin + Dockerfile 簡化；軌道內 base-web build/dep config + 軌道外 outer（Constitution v1.6.0 + DESIGN merge + plan-template + CLAUDE 索引）；0 rust-api 改動、0 base-web src/ diff。
```

**Active feature**：—（049 base-web-dep-hygiene 已完成、見已完成里程碑）

**下一步** update：
```markdown
**下一步**（user 2026-05-25 拍板的 follow-up bundle 順序、046/047/048/049 四 sprint 已完成、剩條件觸發 + 長期兩段、048-N1 已結案 (a)+(b)+(c)）：
1. 條件觸發：042-N4 / 042-N5 / 048-N1 (d) 各自獨立（trigger driven、剩 048-N1 (d) 留 pnpm 升級觸發）
2. 長期：F1.2 / W-F6b / W-F15/16 各自獨立
```

### E3.4 — CLAUDE.md SPECKIT marker idle

```markdown
<!-- SPECKIT START -->
**Active Spec**: —
**Active Plan**: —
**Phase**: idle
**下一步**: 條件觸發 follow-up backlog active items（042-N4 / 042-N5 / 048-N1 (d) 各自獨立、wait for trigger）
<!-- SPECKIT END -->
```

---

## E4. file:line diff summary table

| Phase | item | file | 改動 |
|---|---|---|---|
| Phase 0 (Part A) | Constitution v1.5→v1.6 amendment | `.specify/memory/constitution.md` 多處 | ~+40 line |
| Phase 0 (Part A) | git mv W-WEBUI.md → BASE-WEB.md + restructure | `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` 全檔 | ~540 line（含原 W-WEBUI 255 + §1+§3+§4 ~290 新增） |
| Phase 0 (Part A) | TS-Typing-Sync content merge into §3 | `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §3 | ~116 line（merged from TYPING-ALIGN.md） |
| Phase 0 (Part A) | git rm TYPING-ALIGN.md | `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` | -116 line |
| Phase 0 (Part A) | plan-template 3-軌道辨識 | `.specify/templates/plan-template.md` 軌道辨識條目 | ~+2 line |
| Phase 0 (Part A) | CLAUDE.md §1/§7 索引 | `CLAUDE.md` 多處 | ~+1 line（淨）|
| Phase 1 (Part B) | pnpm-workspace.yaml | `base-web/pnpm-workspace.yaml` | -1 line |
| Phase 1 (Part B) | .npmrc cleanup | `base-web/.npmrc` | -1 line |
| Phase 1 (Part B) | package.json packageManager + devDeps | `base-web/package.json` | ~+3 line（main path + 0-5 audit expansion）|
| Phase 1 (Part B) | uno-preset devDeps | `base-web/packages/uno-preset/package.json` | ~+2 line |
| Phase 1 (Part B) | other sub-package devDeps (TBD) | `base-web/packages/<other>/package.json` | ~+0-5 line (expansion) |
| Phase 1 (Part B) | Dockerfile 簡化 | `base-web/Dockerfile` | net -2 line |
| Phase 1 (Part B) | unocss.ts implicit any | `base-web/build/plugins/unocss.ts` | ~+0 (line replace) |
| Phase 2 (Polish) | INTEGRATION-CHECKLIST 048-N1 + 049 entry + Current Focus | `docs/INTEGRATION-CHECKLIST.md` 多處 | ~+15 line |
| Phase 2 (Polish) | SPECKIT marker idle | `CLAUDE.md` SPECKIT 區段 | ~+0 line（refresh） |

**改動總計**：~600+ line 跨 12 file（4 base-web build/dep config + 1 base-web sub-package + 1 base-web build script + 6 outer rev1 整合層）。

---

## E5. Out-of-scope（049 不做、但相關）

- W-WEBUI 軌道範圍 wiring 改動（views / components / service / store / router / locales）→ W-WEBUI 軌道、本 sprint 不動
- TS-Typing-Sync 軌道範圍 typing 改動（typings/api/*.d.ts）→ TS-Typing-Sync 軌道、本 sprint 不動
- runtime feature 改動（base-web src/ 任何 logic）→ scope creep、本 sprint 不動
- rust-api / nginx / docker compose 其他 config 改動 → 不在 TS-DepGraph-Hygiene 軌道範圍
- pnpm version bump（11.0.8 → newer）→ 屬 048-N1 (d) trigger-driven、本 sprint 不動
- packageManager field 加 sha512 hash → 若 newer corepack 強制再補、屬 048-N1 (d) trigger 場景
- 其他 .npmrc setting cleanup（如 registry mirror 改 default、workspace-root-check 改）→ 048-N1 (d) 觸發後一起 review
- F1.2 JWT algorithm / W-F6b acme cert / W-F15/16 backup-job → 屬其他軌道 / 外部阻擋、與 049 無關
