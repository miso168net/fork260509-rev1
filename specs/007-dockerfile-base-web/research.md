# Research: W-F2 dockerfile-base-web

**Feature**: 007-dockerfile-base-web
**Phase**: 0 (research)
**Date**: 2026-05-15
**Inputs**:
- [`spec.md`](spec.md)(W-F2 functional + non-functional 拍板)
- [`docs/superpowers/007-feature-dockerfile-base-web.md`](../../docs/superpowers/007-feature-dockerfile-base-web.md)(brainstorm)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §2.2 / §3.3 / §11
- [`specs/006-dockerfile-rust-api/`](../006-dockerfile-rust-api/)(W-F1 contracts + plan 為對應模板基礎)

**Purpose**:解 spec.md `## Assumptions` 段 12 個前置 assumption,確認 W-F2 plan-stage 不踩 unknown blocker。

---

## R-001: pnpm install + Vite build 在 node:22-slim glibc 環境可跑

**Question**:base-web workspace(Vue3 + Vite7 + NaiveUI + AntV 等 60+ dep + 8 workspace sub-package)在 `node:22-slim` builder image 內可成功 `pnpm install --frozen-lockfile && pnpm build`?

**Audit method**:
1. grep `package.json` engines + 對應 node version 要求
2. grep workspace `packages/*/package.json` 看是否有 native binding(node-gyp 需 python + make + g++)
3. 對照 W-F1 R-001 模式(host build verify)在 plan-stage 用 docker run 驗

**Findings**:
- `package.json` engines `node >= 20.19.0`、node:22 LTS 滿足 ✓
- Vite 7.3.1 pinned;主要 dep:`vue` 3.x / `naive-ui` 2.x / `@antv/g2` / `@antv/g6` / `@unocss/*` / `@better-scroll/*` 等都是 pure JS、無 node-gyp 編譯
- 8 個 workspace sub-package(`@sa/alova` / `@sa/axios` / `@sa/color` / `@sa/hooks` / `@sa/materials` / `@sa/scripts` / `@sa/uno-preset` / `@sa/utils`)— 都是 internal source library、無 native binding 需求
- node:22-slim 預裝 dpkg / coreutils 等基本工具、無 python3 / make / g++(若需要 native compile 須額外 apt install)

**Decision**:走 `node:22-slim` builder image,沿用 `pnpm install --frozen-lockfile + pnpm build` 命令,**不額外裝 python3 / make / g++**(預期無需要)。

**Rationale**:base-web 為純 frontend SPA 場景、無 native binding;node:22-slim 約 80MB(vs node:22 ~ 250MB)、image 較小、apt 仍可裝補丁。

**Alternatives considered**:
- node:22-alpine builder:image 更小(~60MB)、但 musl libc 與部分 npm package native module 可能不相容(現代 npm package 大多有 prebuilt for musl,但意外 risk 比 slim 高)— **rejected**
- node:20-alpine / node:20-slim:符合 engines 但已非最新 LTS — **rejected**(走 22 LTS)
- Full node:22(non-slim):多 ~170MB 包含 git / build-essential 等,但 W-F2 builder 不需要,**rejected**

**Plan-stage action**:
- **T1**:在 plan/implement 階段第一個前置 task 即跑 `docker run --rm -v "$(pwd)/base-web:/app" -w /app node:22-slim sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm build"` host 驗證 — exit 0 為 pass;若 fail → audit stderr 找 missing deps、補 apt install。

---

## R-002: Vite process.env override .env.prod 機制(Q2 clarify build-arg pattern)

**Question**:Q2 clarify 拍板「Dockerfile `ENV VITE_SERVICE_BASE_URL=/api` 在 Vite build 時透過 process.env override .env.prod 內 mock URL」— 此機制在 Vite 7.3 上是否 work?

**Audit method**:
1. 讀 `base-web/vite.config.ts` 看 env 載入機制(`loadEnv` 用法)
2. 讀 Vite 7.3 source 看 `loadEnv` 是否 merge `process.env`(per Vite docs 描述)
3. 確認 `src/service/request/index.ts` 消費機制(`import.meta.env.VITE_SERVICE_BASE_URL`)

**Findings**:
- `vite.config.ts` 用 `loadEnv(configEnv.mode, process.cwd())`(預設 prefix `VITE_`)— 標準用法
- Vite 7 `loadEnv` source 行為:讀 `.env` / `.env.[mode]` 等檔到 parsed map,**然後 merge process.env 內 prefix-match keys 並以 process.env 為高優先**(per [Vite source `packages/vite/src/node/env.ts`](https://github.com/vitejs/vite/blob/v7.3.1/packages/vite/src/node/env.ts) 約 line 38 起);關鍵段:
  ```ts
  for (const key of Object.keys(process.env)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      env[key] = process.env[key] as string  // override .env file value
    }
  }
  ```
- `src/service/request/index.ts:11` 用 `getServiceBaseURL(import.meta.env, isHttpProxy)` 消費 — `import.meta.env.VITE_SERVICE_BASE_URL` 由 Vite build 階段做 literal substitution(define plugin)
- 因此鏈條:Dockerfile ARG → ENV → container 內 process.env → `loadEnv` → viteEnv map → 傳給 `setupVitePlugins(viteEnv, ...)` 與 `define` plugin → bundle 內 `import.meta.env.VITE_SERVICE_BASE_URL` 被 literal 替換為 `"/api"` ✓

**Decision**:**Q2 clarify build-arg pattern work**。Dockerfile 加 `ARG VITE_SERVICE_BASE_URL=/api` + `ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL`、然後 `pnpm build`,bundle 內會出現 `/api` literal(可 grep dist 驗 per AC-11)。

**Rationale**:Vite 標準行為、無需 vite.config.ts 改動(per FR-025 不動 source code)。

**Alternatives considered**:
- 寫 `.env.prod.local`(Vite 載入優先級高於 `.env.prod`)by `RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local`:若 R-002 confirmed 行為失敗時的 fallback,**目前 not needed**
- 修改 `vite.config.ts` 內 `loadEnv` 後手動 merge process.env:**rejected**(違反 FR-025)

**Plan-stage action**:
- **T2**:plan/implement 階段 AC-11 驗證:`grep "/api" /usr/share/nginx/html/assets/*.js` ≥ 1 命中 → 確認 build-arg 真的 inject;若 fail → 切 R-002 fallback(寫 `.env.prod.local`)。

---

## R-003: corepack default pnpm 版本

**Question**:`package.json` 無 `packageManager` field,`corepack enable` 後 `pnpm` 命令會用哪個版本?

**Audit method**:
1. `grep packageManager` in base-web/package.json — 無命中
2. corepack 預設行為:若無 packageManager field、用 `corepack prepare` cache 內 latest installed,否則 fetch latest stable

**Findings**:
- 無 `packageManager` field
- corepack 預設行為 = 取最新 stable pnpm(目前 pnpm 10.x)
- 每次 build 在不同時間 / 不同 host 上、pnpm 版本可能略有不同 → reproducibility 風險(雖然 dep 由 `pnpm-lock.yaml` lock,但 pnpm 版本本身可能影響 install behavior、cache structure 等)

**Decision**:**Dockerfile 內顯式 pin pnpm 版本 via `corepack prepare pnpm@10.18.0 --activate`**(或當前 stable 版本,plan-stage 拍具體 patch)。

**Rationale**:
- 對齊 W-F1 紀律(rust toolchain minor pin):pnpm 也走 minor 級 pin(`10.18.x` 內 patch 差異無實質影響、Cargo.lock 對應 pnpm-lock.yaml 保 dep 版本)
- 不需在 `package.json` 加 `packageManager` field(per FR-025 + Principle IV 不動 source code)
- Dockerfile build args 可未來 override(`--build-arg PNPM_VERSION=10.19.0`)

**Alternatives considered**:
- 加 `packageManager` field in package.json:**rejected**(動 source)
- 接受 corepack default:**rejected**(reproducibility 風險)

**Plan-stage action**:
- **T3**:Dockerfile 加 `ARG PNPM_VERSION=10.18.0` + `RUN corepack prepare pnpm@${PNPM_VERSION} --activate`;具體 patch 版號 plan-stage 確定當下 pnpm 10.x 最新 stable。

---

## R-004: nginx:1.27-alpine 內建 user uid 驗證

**Question**:spec FR-013 + AC-4 assert `USER nginx` 對應 uid=101。實際 nginx:1.27-alpine image 內 nginx user 是否 uid=101?

**Audit method**:`docker run --rm --entrypoint id nginx:1.27-alpine -u nginx` 一次驗

**Findings**:
- nginx official alpine image 自 nginx 1.13 起內建 `nginx` system user
- alpine 預設 system user uid 範圍 100-999,nginx 一般取 100 或 101
- 具體版本(1.27-alpine)需 plan-stage 直接 docker pull + id 驗證

**Decision**:接受 `USER nginx`(symbolic 不依賴具體 uid 數值),AC-4 驗時觀察實際 uid number 並紀錄(spec.md AC-4 設 uid=101 為期望,若實際是 100 屬可接受 deviation、會在 acceptance log 紀錄)。

**Rationale**:`USER nginx` 用 user name 而非 uid 數值 — Dockerfile 不 hardcode uid;具體 uid 由 nginx alpine image 決定、image 升級時 uid 可能變(但 user name 不變)。

**Plan-stage action**:
- **T4**:`docker run --rm --entrypoint id nginx:1.27-alpine` 驗實際 uid;若非 101、acceptance scenario 4 description 微調為「uid 在 100-110 範圍、user name = `nginx`」(spec.md 已寫 101,plan 階段 implement 時若實際是 100 可微調 AC description 不算 spec drift)。

---

## R-005: `packages/` workspace COPY 順序與 pnpm 解析

**Question**:8 個 workspace sub-package(`packages/{alova,axios,color,hooks,materials,scripts,uno-preset,utils}/`),pnpm `--frozen-lockfile` install 需要哪些檔可正確解析 workspace 依賴?

**Audit method**:
1. `ls packages/*/` 看每 sub-package 有什麼檔
2. 確認 pnpm workspace install 需要的最小 file set

**Findings**:
- 每個 `packages/*/` 含 `package.json`(8 個)定義 `@sa/*` workspace package 名 + dependencies
- pnpm install with `pnpm-workspace.yaml + pnpm-lock.yaml` 解析 workspace dep 需要:
  - root `package.json` ✓
  - `pnpm-lock.yaml` ✓
  - `pnpm-workspace.yaml`(`packages: ['packages/*']` 宣告)✓
  - `packages/*/package.json` × 8(workspace member 自身的 package.json)✓
- 不需要 sub-package 的 source code(`src/` 等)— install 階段只 resolve dep graph、不 compile

**Decision**:deps-first COPY 必要檔:
```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
COPY . .  # 最後 COPY 完整 source(含 packages/*/src/)
```

**Rationale**:
- `COPY packages/ packages/` 一次性 COPY 所有 sub-package(含 src),雖然 install 階段只用 package.json,但 dir 整個 COPY 比 selective COPY 每個 package.json 簡單
- Trade-off:若 `packages/*/src/` 變動會 invalidate dep layer cache;但 sub-package source 變動頻率與 main src 接近、影響可接受
- Alternative `COPY packages/*/package.json packages/` 路徑展開行為 docker COPY 不支援、需逐 dir COPY 或用 build helper、複雜

**Alternatives considered**:
- 逐 sub-package COPY package.json:`COPY packages/alova/package.json packages/alova/` × 8 行 — 過繁雜、acceptance trade-off 不值得
- 寫 dummy main.ts 後 install + 再 COPY source:Vite SPA 場景無此需求

**Plan-stage action**:無(走 deps-first COPY 完整 packages/ dir)。

---

## R-006: nginx config location 優先級 + assets cache regex

**Question**:`location = /health` exact match、assets regex `~*`、SPA fallback `/` prefix — 三者的 nginx 內部優先級順序確認?

**Findings**:nginx location matching 優先級(高 → 低):
1. `location =` exact match(`= /health` 完全等於)
2. `location ^~` prefix match(literal, no regex)
3. `location ~` / `~*` regex match(case-sensitive / insensitive)
4. `location /` prefix match(longest matching prefix)

對 W-F2 config:
- `GET /health` → matches `location = /health` ✓(不會 fallthrough 到 SPA fallback)
- `GET /assets/main.abc123.js` → matches `location ~* \.(js|css|...)$` ✓(immutable cache 套用)
- `GET /` → matches `location /` ✓(SPA fallback → index.html、無 cache header)
- `GET /home/some/route` → matches `location /`(SPA fallback、try_files 找不到 path 返 /index.html)
- `GET /health/sub` → matches `location /`(NOT `= /health`,exact match 不含子路徑)— acceptable

**Decision**:採 spec FR-016 ~ FR-019 設計,location 優先級利用 nginx 預設行為。

**Plan-stage action**:無(nginx 預設 + spec 已正確涵蓋)。

---

## R-007: index.html cache 行為(no-cache 驗證)

**Question**:spec FR-019 規定 SPA fallback 不對 index.html 套 cache header(讓 deploy 新版時用戶能立即拉新 index.html)。實際 nginx 行為如何?

**Findings**:
- nginx `location /` block 內無 `expires` / `add_header Cache-Control` directive → response 預設無 Cache-Control header
- 瀏覽器看到無 Cache-Control 通常套 heuristic cache(typically 10% of (now - Last-Modified))— 不可控
- **想要確保 index.html no-cache**,需顯式加:`add_header Cache-Control "no-cache, no-store, must-revalidate"`

**Decision**:spec FR-019 規定「不套 cache header」可改善為「顯式 add no-cache header」 — plan 階段在 nginx config `location /` 內加:
```nginx
location / {
    try_files $uri $uri/ /index.html;
    # Ensure index.html (and SPA fallback) is NOT browser-cached
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
}
```

**Rationale**:
- nginx 預設無 Cache-Control 不等於瀏覽器無 cache(heuristic)
- 顯式 no-cache 確保 deploy 新版時瀏覽器拉新 index.html
- spec FR-019 意圖 = "新版 deploy 後用戶立即見"、實作上需 explicit no-cache header

**Plan-stage action**:
- **T7**:nginx config 內 `location /` 加 no-cache header;AC-8 / AC-9 額外驗 `curl -I /` 含 `Cache-Control: no-cache, no-store, must-revalidate`。

---

## R-008: BuildKit cache mount + pnpm store 路徑

**Question**:`pnpm install` 預設 store 路徑為何?BuildKit cache mount 應 mount 到哪個 target 路徑?

**Findings**:
- pnpm default global store: `$XDG_DATA_HOME/pnpm/store` or `~/.local/share/pnpm/store`(Linux)
- 在 docker container 內(root user)= `/root/.local/share/pnpm/store`
- BuildKit cache mount target 對應此路徑

**Decision**:`--mount=type=cache,target=/root/.local/share/pnpm/store`(per spec FR-005、已正確)。

**Alternatives considered**:
- mount `/app/node_modules`:不適合(node_modules 是 install 後的 hoisted result、不是 source store);若 mount 則 install 後檔丟 cache 而 build 時讀不到、build fail。**rejected**
- mount `/root/.npm`:npm 用、pnpm 不用 — **rejected**

**Plan-stage action**:無(spec 已正確)。

---

## R-009: Vite production build 對 SPA route 處理 + bundle 大小估計

**Question**:Vite 7 production build for Vue3 + NaiveUI + AntV(g2/g6)+ UnoCSS 預期 bundle size 是?image 100MB 目標是否合理?

**Findings**:
- Vite production build 預設啟用 minification + tree-shaking + code splitting
- 主要 dep size 估計:
  - Vue3 runtime ~ 40KB gzipped
  - NaiveUI ~ 200KB gzipped(tree-shake 後)
  - AntV g2/g6 ~ 500KB-1MB gzipped(charts 多時更大)
  - UnoCSS runtime ~ 30KB
- 預估 SPA bundle ~ 30-80MB uncompressed dist/(含 sourcemap-less assets + 圖片 + fonts)
- nginx:1.27-alpine ~ 30MB base
- Total image size 估 ~ 60-110MB

**Decision**:spec SC-002 image size threshold(< 100MB target / 100-130MB acceptable / > 150MB optimize)合理,實際可能落 80-120MB 區間。

**Plan-stage action**:
- T1 host build 驗證後可量化實際 bundle size、確認 SC-002 threshold;若 > 130MB plan 階段加 Vite `build.manualChunks` 拆 vendor bundle(屬 W-F2 scope **例外**、需配 FR-025 違例 justify)

---

## 解決 spec.md `## Assumptions` 對照

| Spec Assumption | Research 結果 | 狀態 |
|---|---|---|
| base-web 源倉無既有 Dockerfile / nginx config / .dockerignore | grep + ls 確認 ✓ | ✅ Resolved |
| node:22-slim 與 `engines.node >= 20.19.0` 相容 | node 22 LTS 滿足 ✓ | ✅ Resolved |
| `corepack enable` 自動取 pnpm | R-003 plan 階段 pin `pnpm@10.18.x` | ✅ **plan T3 拍** |
| `pnpm install --frozen-lockfile` 跑通 | R-001 + R-005 deps-first COPY pattern | ✅ **plan T1 驗** |
| `pnpm build` 跑通 | R-001 同上 + R-002 process.env override | ✅ **plan T1 + T2 驗** |
| Vite process.env override .env.prod 有效 | R-002 confirmed by Vite source convention | ✅ **plan T2 驗** |
| `VITE_SERVICE_SUCCESS_CODE=0` 為 base-web 預期 | spec 接受 build-arg 注入 default、若 source 未讀 harmless | ✅ Resolved |
| `.env.prod` 內 mock URL 在 W-F2 範疇外 | per Q2 拍板不動、build-arg override | ✅ Resolved |
| image size 100MB 為設計目標、非 hard fail | R-009 估計 80-120MB 區間、tiered acceptance | ✅ Resolved |
| W-F2 image target = `linux/amd64` only | W-F1 Q2 clarify 繼承 | ✅ Resolved |
| `packages/` workspace COPY 順序 | R-005 deps-first pattern | ✅ Resolved |
| W-F2 acceptance test 不交付 compose | per spec、standalone container | ✅ Resolved |
| 兩段式 commit 紀律 | CLAUDE.md §6.1 已定 | ✅ Resolved |

**結論**:0 個 unresolved blocker。plan 階段執行 T1 / T2 / T3 / T4 / T7 5 個 validation+config task 即可進 implement。

---

## 額外發現(spec 補強建議)

- **R-007 index.html cache**:spec FR-019 原寫「不套 cache header」,實作上需「顯式加 no-cache header」否則瀏覽器 heuristic cache 可能讓 deploy 新版用戶看舊 SPA。**plan/tasks 階段更新 nginx config 加 no-cache + acceptance T7 驗**。屬 spec 細節補強、不視為 clarify 漏失。
