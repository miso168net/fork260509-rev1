# Feature Specification: W-F2 — dockerfile-base-web

**Feature Branch**: `007-dockerfile-base-web`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "W-F2 dockerfile-base-web — rev1 deploy 階段第二個 feature(per DESIGN-W §11.1 Phase W-1 P1)。新建 base-web/Dockerfile + deploy/nginx.conf + .dockerignore(base-web 源倉無既有檔案、全部從 0 建)。Multi-stage:node:22-slim builder + nginx:1.27-alpine runtime。Vite build 透過 build-arg ARG VITE_SERVICE_BASE_URL=/api + ENV process.env override .env.prod 內 mock URL。nginx config:SPA fallback + assets cache 30d immutable + location = /health 返 200 ok。"

**Source brainstorming**: [`docs/superpowers/007-feature-dockerfile-base-web.md`](../../docs/superpowers/007-feature-dockerfile-base-web.md)(2026-05-15 superpowers:brainstorming session 產出、3 個 clarification 拍板)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §2.2(base-web Dockerfile 草稿)、§2.4(image tagging convention)、§3.3(healthcheck 期望)、§11.1(W-F2 scope 描述)、§11.2(W-F 依賴序 P1 必先 4 個)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」— `.env*` 屬「可動」但 W-F2 保守解走 build-arg 不動 source)
- [`specs/006-dockerfile-rust-api/spec.md`](../006-dockerfile-rust-api/spec.md)(W-F1,已完成 — image tagging convention / non-root user / image platform amd64-only / `/health` endpoint 紀律 全部繼承)
- [`specs/006-dockerfile-rust-api/contracts/dockerfile-structure.md`](../006-dockerfile-rust-api/contracts/dockerfile-structure.md)(W-F1 Dockerfile contracts C-D1~C-D7 為 W-F2 對應 contract 模板基礎)
- 既有 [`base-web/.env.prod`](../../base-web/.env.prod)(內含 `VITE_SERVICE_BASE_URL=https://mock.apifox.cn/...` mock URL,W-F2 不動、走 build-arg override)
- 既有 [`base-web/package.json`](../../base-web/package.json)(Vue3 + Vite7 + TypeScript + pnpm workspace,version 2.1.0,`engines.node >= 20.19.0`)
- **無**既有 [`base-web/Dockerfile`](../../base-web/)(grep 確認、W-F2 從 0 建)
- **無**既有 `base-web/.dockerignore`(grep 確認、W-F2 從 0 建)
- **無**既有 `base-web/deploy/`(W-F2 新建子目錄)

**Scope summary**:rev1 deploy 階段第二個 feature — 從 0 建立 base-web Vue3 SPA 的 docker image build 機制。base-web 源倉沒有任何 Dockerfile / nginx config / .dockerignore,W-F2 新建 3 個檔案:Dockerfile multi-stage(node:22-slim builder + nginx:1.27-alpine runtime)、`deploy/nginx.conf`(SPA fallback + assets cache + /health endpoint)、`.dockerignore`。image 內含 Vite-built SPA static files,nginx 1.27 alpine 作 web server 只 serve 自身 static(**不**反向代理 /api/ 到 rust-api、那是 W-F5 範圍)。W-F2 範疇刻意收緊:**只動 base-web/ worktree 內 3 個新建檔**、不動 source code(per Constitution Principle IV)、不動 .env.prod(走 build-arg override pattern)、不動 compose / secret / TLS / front-nginx 等部署層配套(留 W-F3 ~ W-F18)。

## Clarifications

### Session 2026-05-15(brainstorming 階段拍板、3 項)

- **Q1**: Runtime base image 走 nginx:1.27-alpine vs debian+nginx?W-F1 (rust-api) 已用 debian(為 glibc + libssl3),但 nginx serve static 不需 glibc-only 依賴。 → **A: nginx:1.27-alpine**(沿用 DESIGN-W §2.2 草稿)。理由:image ~30-40MB vs debian+nginx ~80-100MB 大一倍;nginx 在 alpine 上是業界最成熟 stack、官方 nginx image 預設亦 alpine;nginx 為 pure static server 不需 glibc-only 類依賴。W-F1(debian)+ W-F2(alpine)base 不一致但兩者 image 本身互不交集(都是獨立 container)不影響部署;未來 W-F5 front-nginx 亦推薦 alpine、nginx 類 service 都 alpine 一致。

- **Q2**: VITE_SERVICE_BASE_URL 怎麼針對 rev1 deploy 設?既有 `.env.prod` 內是 mock URL `https://mock.apifox.cn/m1/3109515-0-default`、但 rev1 deploy 需要 `/api`(走同源 nginx 反向代理)。CLAUDE.md §1 明示 `.env*` 屬「可動」但 W-F2 對 base source 觸碰最小化原則。 → **A: Build-arg only**(Dockerfile `ARG VITE_SERVICE_BASE_URL=/api` + `ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL` 在 Vite build 時 process.env override .env.prod 內容)。理由:`.env.prod` 保留 mock URL 不動;image build 時 default 是 `/api`;外部 build 亦可 `--build-arg VITE_SERVICE_BASE_URL=<other>` override(W-F5/W-F17 階段不同 endpoint 彈性切換)。代價接受:差異隱藏在 Dockerfile、source code grep .env.prod 看不出 `/api`(但 image 取出 bundle 內是 `/api`)、acceptance test 透過 dist grep 驗證真有注入。

- **Q3**: nginx healthcheck endpoint 怎麼設?W-F1 對 rust-api 加了 `/health`,W-F3 compose healthcheck 對 base-web 也需一個方式驗 nginx 起著。 → **A: `location = /health` 返 200 "ok"**(對齊 W-F1 紀律)。nginx config 加 `location = /health { return 200 "ok"; add_header Content-Type text/plain; }`;使用 exact match (`=`) 不影響 SPA fallback location;W-F3 compose healthcheck 統一用 `curl -f http://localhost:8080/health` 對齊 W-F1 / 未來 W-F5 front-nginx upstream healthcheck;rev1 各 web service 都用 `/health` 對 ops 認知負擔最小。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 在乾淨 docker 環境 build + run rev1 base-web image(Priority: P1,唯一 US)🎯 MVP

operator(或 CI agent)在乾淨 docker 環境執行 `cd base-web && docker build -t base-web:test .`。Builder 階段從 `node:22-slim` 起、`corepack enable` 取對應 pnpm 版本、deps-first COPY(`package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `packages/`)觸發 layer cache、`pnpm install --frozen-lockfile` 配 BuildKit cache mount(`/root/.local/share/pnpm/store`)加速、COPY 整 source、`ENV VITE_SERVICE_BASE_URL=/api VITE_SERVICE_SUCCESS_CODE=0` override .env.prod 內 mock URL、`pnpm build` 跑 Vite production build 產出 `/app/dist/`。Runtime 階段切到 `nginx:1.27-alpine`、apk install `tzdata curl`、symlink TZ 為 `Asia/Shanghai`、COPY dist 到 `/usr/share/nginx/html`、COPY `deploy/nginx.conf` 到 `/etc/nginx/conf.d/default.conf`、`USER nginx`(uid=101 image 內建)、`EXPOSE 8080`、`CMD nginx -g daemon off;`。image 產出 size < 100MB。`docker run -d -p 8080:8080 base-web:test` → nginx 啟動 serve static;`curl -f http://localhost:8080/health` 回 200 + `ok`(W-F3 compose healthcheck 對齊);`curl http://localhost:8080/` 回 200 + index.html 含 `<title>`;`curl http://localhost:8080/some/spa/route` 返 200 + index.html(SPA fallback);`curl -I http://localhost:8080/assets/<x>.js` 返 `Cache-Control: public, immutable`;`grep "/api" /usr/share/nginx/html/assets/*.js` 至少 1 命中(證明 build-arg 確實注入)。

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F2 的 5 個交付片段(Dockerfile multi-stage / nginx.conf SPA + healthcheck / .dockerignore / VITE_* build-arg 注入機制 / acceptance test)**並非獨立可交付**:

- 單獨建 Dockerfile → 無 nginx config → SPA fallback / health 都不會 work
- 單獨建 nginx config → 無 Dockerfile → 沒 image 可以跑、純文件無價值
- 單獨設 build-arg → 無 SPA bundle 證明 /api 真注入 → 部署上線 base-web 拿 mock URL silent 失敗
- 單獨跑 acceptance test → 無 image 改造 → 無物可驗
- 單獨改 .dockerignore → 無 builder → context 排不排沒人踩到

W-F2 是 **rev1 deploy P1 4 個 feature 第二片**;W-F1 提供 rust-api image、W-F2 提供 base-web image、共組 W-F3 compose 兩個 service entry。5 個片段是同一 atomic deploy increment 的 acceptance dimensions。

**Independent Test**:12 個 acceptance check(AC-1 ~ AC-12)涵蓋 build / image structure / non-root / nginx valid / port / healthcheck / SPA root / SPA fallback / assets cache / VITE 注入驗證 / TZ。`/health` + SPA 可達性驗證**不需 minimal stack**(base-web image 自包,nginx 起就有 SPA 可 serve、不依賴 postgres / redis / rust-api)— **比 W-F1 acceptance 更獨立**、純 standalone container 即可驗。

**Acceptance Scenarios**:

#### Dimension A — Dockerfile 結構建立(AC-1 ~ AC-3)

1. **Given** 乾淨 docker host(無 image layer cache),**When** `cd base-web && docker build -t base-web:test .`,**Then** exit 0、output 顯示 builder(node:22-slim)+ runtime(nginx:1.27-alpine)兩 stage
2. **Given** image build 完成,**When** `docker image inspect base-web:test --format='{{.Size}}'`,**Then** < 100MB(nginx alpine ~30MB + SPA bundle ~50MB)
3. **Given** 第一次 build 完成,**When** 立即重 build(BuildKit cache 不 prune),**Then** < 30 sec(cache mount + COPY layer cache 命中)

#### Dimension B — Non-root user + nginx config 結構(AC-4 ~ AC-5)

4. **Given** image build 完成,**When** `docker run --rm --entrypoint id base-web:test`,**Then** uid=101 名稱 `nginx`(alpine nginx image 內建 user、無需顯式 useradd)
5. **Given** image build 完成,**When** `docker run --rm --entrypoint nginx base-web:test -t`,**Then** stderr 含 `test is successful`(nginx config 語法檢查 pass)

#### Dimension C — Runtime + healthcheck(AC-6 ~ AC-7)

6. **Given** `docker run -d --name w-f2-test -p 8080:8080 base-web:test` + `sleep 3`,**When** `nc -zv localhost 8080`,**Then** connection succeeded(nginx 確實 listen on 8080)
7. **Given** 同 container,**When** `curl -fsS http://localhost:8080/health`,**Then** 200 + body `ok`(plain text、Content-Type: text/plain)

#### Dimension D — SPA 路由 + assets cache(AC-8 ~ AC-10)

8. **Given** 同 container,**When** `curl -fsS http://localhost:8080/`,**Then** 200 + body 含 `<title>` + Vue SPA shell HTML(index.html 內容)
9. **Given** 同 container,**When** `curl -fsS http://localhost:8080/some/unknown/route`(SPA route 不存在 server-side),**Then** 200 + body 同 `/`(SPA fallback、index.html、SPA route 由前端 vue-router 處理)
10. **Given** 同 container,**When** `curl -I http://localhost:8080/assets/<某-js-bundle>`,**Then** response header 含 `Cache-Control: public, immutable` + `Expires`(30 天後)

#### Dimension E — VITE 注入 + TZ(AC-11 ~ AC-12)

11. **Given** image build 完成,**When** `docker run --rm --entrypoint sh base-web:test -c 'grep "\"/api\"" /usr/share/nginx/html/assets/*.js | head -3'`,**Then** ≥ 1 命中(證明 `VITE_SERVICE_BASE_URL=/api` build-arg 真的注入 SPA bundle、override .env.prod mock URL)
12. **Given** image build 完成,**When** `docker run --rm --entrypoint date base-web:test`,**Then** 顯示 `Asia/Shanghai` 時區(CST 2026、UTC+8、與 host UTC 差 8 小時)

### Edge Cases

- **pnpm install 在 builder 慢**(workspace 多 dep):接受第一次 5-10 min;BuildKit cache mount + deps-first COPY layer cache 命中後 second build 應 < 30 sec
- **Vite process.env override .env.prod 行為不符預期**:若 grep dist 找不到 `/api`、AC-11 直接 catch;plan 階段加 fallback 改用 vite.config.ts 內 explicit override 或 .env.local injection
- **`packages/` workspace sub-package COPY 順序錯** → pnpm install 失敗;deps-first COPY 階段必須先 `COPY packages/ packages/` 然後 install
- **nginx user 對 `/var/log/nginx` 寫入權限** → alpine nginx image 自帶設定可寫、無 volume mount 不衝突
- **`.env.prod` 內 mock URL 與 bundled `/api` 不一致** → source 看 .env.prod 是 mock、但 image bundle 是 `/api`、可能令未來開發者困惑 → AC-11 + spec 內 Q2 拍板明示
- **assets cache header 對 index.html 誤套** → nginx regex `~* \.(js|css|...)$` 不含 .html、index.html 走 SPA fallback location `/` 預設無 cache header(OK,deploy 新版用戶能拉新 index.html)
- **VITE_SERVICE_SUCCESS_CODE 注入**:`.env.prod` 沒此 env,Dockerfile build-arg 注入 `0` 對齊 F4 envelope success=0;需確認 base-web service client 有讀此 env(若無、build-arg 多餘但 harmless)
- **`vite build --mode prod` 行為**:`package.json` scripts `"build": "vite build --mode prod"`;`pnpm build` 透過 corepack pnpm 跑此命令;ENV override 仍有效(process.env 優先級高於 .env.prod)

## Requirements *(mandatory)*

### Functional Requirements

#### A. Dockerfile 結構(新建)

- **FR-001**: `base-web/Dockerfile` MUST 使用 multi-stage build:builder stage + runtime stage 兩階段、`FROM ... AS builder` + `FROM ... AS runtime` 結構
- **FR-002**: Builder stage MUST 以 `node:22-slim` 為 base(`engines.node >= 20.19.0` 滿足、22 LTS)
- **FR-003**: Builder stage MUST 跑 `corepack enable` 後 **`corepack prepare pnpm@${PNPM_VERSION} --activate` 顯式 pin pnpm 版本**(預設 `PNPM_VERSION=10.18.0`、per analyze remediation 2026-05-15 修 I1 spec drift / research.md R-003 reproducibility);**理由**:`package.json` 無 `packageManager` field、corepack default pnpm 版本飄移風險(每次 build 不同 host 可能拿到不同 pnpm minor)、Dockerfile 內顯式 pin 比加 `packageManager` field 更不污染 base source(per FR-025 Principle IV)
- **FR-004**: Builder stage MUST 使用 **deps-first COPY pattern**:先 COPY `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `packages/`、然後跑 `pnpm install --frozen-lockfile`、最後 `COPY . .` 整 source(讓 BuildKit layer cache 在 source 變動但 dep 未變時命中)
- **FR-005**: Builder stage MUST 用 BuildKit cache mount `/root/.local/share/pnpm/store` 加速 pnpm install(per FR-003 corepack 安裝的 pnpm 預設 store 路徑)
- **FR-006**: Builder stage MUST 透過 `ARG VITE_SERVICE_BASE_URL=/api` + `ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL` 注入 build-time env、同時 `ARG VITE_SERVICE_SUCCESS_CODE=0` + `ENV` 注入 success code
- **FR-007**: Builder stage MUST 跑 `pnpm build`(透過 `package.json` `"build": "vite build --mode prod"` 執行 Vite production build)

#### B. Runtime stage 配置

- **FR-008**: Runtime stage MUST 以 `nginx:1.27-alpine` 為 base
- **FR-009**: Runtime stage MUST apk install 至少 `tzdata curl` 兩個 runtime dep(curl 給 W-F3 compose healthcheck 用、tzdata 給 TZ 設定)
- **FR-010**: Runtime stage MUST 設定 TZ:`ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime` + `ENV TZ=Asia/Shanghai`
- **FR-011**: Runtime stage MUST COPY `--from=builder /app/dist` 到 `/usr/share/nginx/html`(SPA static files)
- **FR-012**: Runtime stage MUST COPY `deploy/nginx.conf` 到 `/etc/nginx/conf.d/default.conf`(替換 nginx 預設 server block)
- **FR-013**: Runtime stage MUST `USER nginx`(uid=101、image 內建,無需顯式 `useradd`)
- **FR-014**: Runtime stage MUST `EXPOSE 8080` + `CMD ["nginx", "-g", "daemon off;"]`

#### C. nginx config(新建 `base-web/deploy/nginx.conf`)

- **FR-015**: `deploy/nginx.conf` MUST 包含 `listen 8080`、`root /usr/share/nginx/html`、`index index.html`
- **FR-016**: `deploy/nginx.conf` MUST 包含 **`location = /health`**(exact match)、`return 200 "ok"` + `add_header Content-Type text/plain`(priority 最高、bypass SPA fallback)
- **FR-017**: `deploy/nginx.conf` MUST 包含 **assets cache location** regex `~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)$`、`expires 30d` + `add_header Cache-Control "public, immutable"`(對 hashed assets 套 30d immutable cache)
- **FR-018**: `deploy/nginx.conf` MUST 包含 **SPA fallback** `location / { try_files $uri $uri/ /index.html; }`(處理 SPA route 不存在 server-side 時返 index.html)
- **FR-019**: SPA fallback location MUST 對 index.html **顯式套 `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` header**(per analyze remediation 2026-05-15 修 I2 spec drift / research.md R-007);**理由**:nginx 預設無 Cache-Control header 不等於瀏覽器 no-cache(瀏覽器 heuristic cache 可能 cache 數小時),deploy 新版時用戶若 cache 舊 index.html 會繼續載舊 hashed bundle URL → 必須顯式 no-cache 才確保新版立即生效

#### D. `.dockerignore`(新建)

- **FR-020**: `base-web/.dockerignore` MUST 排除 `node_modules/`、`dist/`、`.env`、`.env.test`、`.git`、`.github`、`.vscode`、`.idea`、`CHANGELOG*.md`、`README*.md`、`LICENSE`、`*.log`、`.DS_Store`、`coverage/`
- **FR-021**: `base-web/.dockerignore` MUST NOT 排除 builder 所需:`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`packages/`、`src/`、`public/`、`build/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`eslint.config.js`、`.env.prod`(builder 載入)

#### E. Image tagging convention(沿用 W-F1 contracts/dockerfile-structure.md C-D1)

- **FR-022**: W-F2 spec 與 plan MUST 明示主 tag pattern:`<registry>/base-web:<short-git-sha>` (7-char SHA、每次 build 對應一個 commit、不可變)
- **FR-023**: W-F2 spec 與 plan MUST 明示輔助 tag pattern:`<registry>/base-web:<branch>` (e.g. `base-web:rev1-admin-base-web`、移動標籤)、與 prod tag pattern:`<registry>/base-web:prod-<YYYYMMDD>`(manual / W-F17 pipeline 觸發)
- **FR-024**: W-F2 spec 與 plan MUST 明示**不使用 `:latest` tag**;具體 registry 留 W-F17 拍板、W-F1 / W-F2 暫用 placeholder

#### F. 範疇邊界保護

- **FR-025**: W-F2 MUST NOT 動 base-web source code(除 3 個新建檔:Dockerfile / deploy/nginx.conf / .dockerignore)、MUST NOT 動 src/、components/、router/、store/、service*/(per Constitution Principle IV「base 不改動邊界」)
- **FR-026**: W-F2 MUST NOT 動 base-web `.env*` 任一檔內容(per Q2 clarify 拍板走 build-arg override)
- **FR-027**: W-F2 MUST NOT 動 docker-compose 結構(留 W-F3)、MUST NOT 動 Docker secrets 注入(留 W-F4)、MUST NOT 動 front-nginx 反向代理(留 W-F5)、MUST NOT 動 TLS cert(留 W-F6)、MUST NOT 動對外 port forwarding(留 W-F7)、MUST NOT 動 observability stack(留 W-F12 ~ W-F14)、MUST NOT 動 CI/CD pipeline(留 W-F17 / W-F18)、MUST NOT 預埋多 arch build 機制(linux/amd64 only,per W-F1 Q2 拍板繼承)
- **FR-028**: W-F2 內 `deploy/nginx.conf` MUST NOT proxy `/api/*` 到 rust-api(那是 W-F5 front-nginx 範疇);base-web 內 nginx 只 serve 自身 SPA static、為 front-nginx upstream 的一個 backend

### Key Entities *(include if data involved)*

- **base-web image**:單一 docker image,內含 Vue3 SPA static files(Vite-built `dist/`)+ nginx 1.27 alpine web server + `deploy/nginx.conf`。`linux/amd64` only(per W-F1 Q2 拍板繼承)。image size < 100MB target。
- **SPA dist**:Vite production build 產出的 HTML / CSS / JS bundle(`/app/dist/` 從 builder COPY 到 runtime `/usr/share/nginx/html`)。`assets/*.{js,css,...}` 帶 hash 後綴(Vite 預設)、支援 immutable cache;`index.html` 不帶 hash、no-cache。
- **nginx config**:單一 `deploy/nginx.conf` 檔、3 個 location block + listen 8080。優先級:exact `=` > regex `~*` > prefix `/`。
- **`/health` endpoint**:`GET /health` → 200 + plain text `"ok"`(by nginx return,no application logic)。Public、不過任何 middleware。
- **`.dockerignore`**:builder context filter,排除 host 殘留 + 不需入 image 的 meta files。
- **Image tag**:三類(主 short-sha 不可變 / 輔助 branch 移動 / prod 日期)、不用 `:latest`。具體 registry hostname 由 W-F17 拍板。
- **Build-time env override**:`VITE_SERVICE_BASE_URL` + `VITE_SERVICE_SUCCESS_CODE` 透過 Dockerfile ARG → ENV → process.env → Vite build 注入 bundle、override .env.prod 內 mock URL。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在乾淨 docker host 上 `cd base-web && docker build -t base-web:test .` 可成功完成、無 build error、第一次無 cache build 預期 5-10 分鐘內(pnpm install + Vite build、取決於 host CPU)
- **SC-002**: 產出 image size < 100MB(nginx alpine runtime ~30MB + SPA bundle ~50MB;若超過則 acceptance 看 100-130MB 區間決定是否 plan 階段優化、超過 150MB 須 plan 階段 audit bundle size)
- **SC-003**: 第二次 build(有 BuildKit cache)時間 < 30 sec(pnpm store cache + COPY layer cache 全命中)
- **SC-004**: `curl -f http://localhost:8080/health` p99 latency < 50ms(local docker network、nginx static return)
- **SC-005**: image 內 12 個 acceptance check(AC-1 ~ AC-12 對應 Dimension A-E)100% pass
- **SC-006**: SPA fallback 正確 — 任何不存在於 server 的 path(e.g. `/home`、`/login`、`/user-management/list`)都返 200 + index.html(SPA client routing 接管)
- **SC-007**: VITE build-arg 注入機制驗證 — `grep -r "/api" /usr/share/nginx/html/assets/*.js` ≥ 1 命中(證明 `.env.prod` mock URL 已被 process.env override、bundle 內是 `/api`)
- **SC-008**: W-F3 / W-F4 兩個 P1 後續 feature 在 spec / plan / implement 過程中無 W-F2 相關 blocker 出現(rev1 deploy P1 進度 2/4 → 3/4 → 4/4)

## Assumptions

- **base-web 源倉無既有 Dockerfile / nginx config / .dockerignore**:grep + ls 確認、W-F2 從 0 建。
- **`engines.node >= 20.19.0` 與 node:22-slim 相容**:node 22 是 LTS、滿足 minimum 20.19、Vite7 與 NaiveUI 等 dep 在 node 22 上應 work(若 fail、降回 node:20-slim)。
- **`corepack enable` 自動取對應 pnpm 版本**:`package.json` 若無 `packageManager` field、corepack 用 default pnpm version(現代 corepack default 為較新 pnpm 10.x);plan 階段先 grep `package.json` 是否含 `packageManager` field、若無則接受 corepack default(也可在 Dockerfile 內 `corepack prepare pnpm@<ver> --activate` 顯式 pin)。
- **`pnpm install --frozen-lockfile` 在 builder 環境跑通**:`pnpm-lock.yaml` 完整、無 platform-specific dep 問題(若有 native binding 需要編譯、`apt install python3 make g++` 可能要加)— plan 階段第一個前置 task 即跑 host 驗。
- **`pnpm build` 在 node:22-slim + Vite7 環境跑通**:base-web Vite 配置(`vite.config.ts`)+ TypeScript compile + UnoCSS / NaiveUI / AntV 等 plugin 全 work — plan 階段第二個前置 task 跑 host 驗。
- **Vite process.env override .env.prod 機制有效**:Vite 對 `import.meta.env.VITE_*` 的 loading priority 是 `process.env > .env.[mode] > .env`;build-arg 注入 ENV 後 process.env 應 win — plan 階段透過 dist grep `/api` 驗證(SC-007)。
- **`VITE_SERVICE_SUCCESS_CODE=0` 為 base-web service client 預期**:F4 envelope success=0、base-web client code 應已對齊;若 .env.prod 沒此 env、build-arg 注入是新增 default(harmless)。
- **`.env.prod` 內 mock URL 在 W-F2 範疇外**:per Q2 拍板不動 .env.prod、image bundle 用 build-arg override 為 `/api`、source vs bundle 不一致可接受。
- **image size 上限 100MB 為設計目標、非 hard fail**:若 build 後實際 size 落 100-130MB,acceptance 接受但 plan 階段須在 risk 段記錄;> 150MB 須優化(Vite manualChunks / 拆 bundle)。
- **W-F2 image target platform = `linux/amd64` only**:per W-F1 Q2 clarify 繼承(無 multi-arch);若未來 arm64 需求出現由 W-F17 CI 階段補。
- **`packages/` workspace sub-package COPY 順序**:deps-first COPY pattern;先 COPY workspace manifest + packages/ 後 pnpm install、再 COPY 整 source — pnpm 對 workspace 解析需 `pnpm-workspace.yaml` + packages/*/package.json 完整。
- **W-F2 acceptance test 不交付 compose 配置**:Dimension C/D 驗證 base-web container 自身、不需 postgres / redis / rust-api(比 W-F1 acceptance 更獨立);W-F3 才交付 compose 主結構。
- **依 CLAUDE.md §6.1 兩段式 commit 紀律**:本 feature 實作的 base-web 改動(Dockerfile + deploy/nginx.conf + .dockerignore)落 `rev1-admin-base-web` 分支、需 worktree 內 commit + push 到 fork remote;spec docs(`specs/007-dockerfile-base-web/`)落本 feature branch `007-dockerfile-base-web` outer git。Feature 完成後 outer feature branch merge 回 `rev1-admin-root`、submodule SHA pin 更新。
