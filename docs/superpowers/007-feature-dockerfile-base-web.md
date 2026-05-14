# Feature Specification: W-F2 — dockerfile-base-web

**Feature ID**: W-F2(per [`DESIGN-W-DEPLOYMENT`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11.1 Phase W-1 P1 — deploy 階段第二個 feature)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `007-dockerfile-base-web`)
**Created**: 2026-05-15
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-15 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §2.2(base-web Dockerfile multi-stage 草稿)、§2.4(image tagging convention)、§3.3(healthcheck 期望)、§11.1(W-F2 scope 描述)、§11.2(W-F 依賴序 P1 必先 4 個)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」— `.env*` 屬「可動」但 W-F2 走 build-arg pattern 不動 .env.prod、保持 source code 不污染)
- [`docs/superpowers/006-feature-dockerfile-rust-api.md`](006-feature-dockerfile-rust-api.md)(W-F1,已完成 — image tagging convention / non-root user / image platform amd64-only / `/health` endpoint pattern 全部繼承)
- [`specs/006-dockerfile-rust-api/contracts/dockerfile-structure.md`](../../specs/006-dockerfile-rust-api/contracts/dockerfile-structure.md)(W-F1 Dockerfile contracts C-D1~C-D7 為 W-F2 對應 contract 模板基礎)
- **無**既有 [`base-web/Dockerfile`](../../base-web/)(per DESIGN-W §2.2 預期 + grep 確認 → W-F2 從 0 建)
- **無**既有 `base-web/.dockerignore`(grep 確認 → W-F2 從 0 建)
- **無**既有 `base-web/deploy/`(W-F2 新建子目錄存 nginx config)

**Scope summary**:rev1 deploy 階段第二個 feature — **新建** base-web Vue3 SPA 的 docker image build 機制。base-web 源倉沒有任何 Dockerfile / nginx config / .dockerignore,W-F2 全部從 0 建。image 內含 Vite-built SPA static files + nginx 1.27 alpine web server(只 serve 自身 static,**不**反向代理 /api/ 到 rust-api、那是 W-F5 範圍)。W-F2 範疇刻意收緊:**只動 base-web/ worktree 內 3 個新建檔**(Dockerfile + deploy/nginx.conf + .dockerignore)、不動 source code(per Constitution Principle IV)、不動 .env.prod(走 build-arg `VITE_SERVICE_BASE_URL=/api` override pattern)、不動 compose / secret / TLS / front-nginx 等部署層配套(留 W-F3 ~ W-F18)。

## Clarifications

### Session 2026-05-15(brainstorming 階段拍板、3 項)

- **Q1**: Runtime base image 走 nginx:1.27-alpine vs debian:bookworm-slim+nginx? → **A: nginx:1.27-alpine**(沿用 DESIGN-W §2.2 草稿)。理由:image ~30-40MB vs debian-slim+nginx ~80-100MB 大一倍;nginx 在 alpine 上是業界最成熟 stack、官方 nginx image 預設亦 alpine;nginx 為 pure static server 不需要 glibc-only 類依賴(與 W-F1 rust-api 需要 libssl3+glibc 不同)。代價接受:W-F1(debian)+ W-F2(alpine)base 不一致,但兩者 image 本身互不交集(都是獨立 container)不影響部署;未來 W-F5 front-nginx 亦推薦 alpine、將來 nginx 類 service 都 alpine 一致。

- **Q2**: VITE_SERVICE_BASE_URL 怎麼針對 rev1 deploy 設?既有 `.env.prod` 內是 mock URL `https://mock.apifox.cn/m1/3109515-0-default`,rev1 deploy 需要 `/api`(走同源 nginx 反向代理)。CLAUDE.md §1 明示 `.env*` 屬「可動」但 W-F2 對 base source 觸碰最小化原則。 → **A: Build-arg only**(Dockerfile `ARG VITE_SERVICE_BASE_URL=/api` + `ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL` 在 Vite build 時 process.env override .env.prod 內容)。理由:`.env.prod` 保留 mock URL 不動(不動 base source、Principle IV 保守解);image build 時 default 是 `/api`;外部 build 亦可 `--build-arg VITE_SERVICE_BASE_URL=<other>` override(W-F5/W-F17 階段 staging/prod 不同 endpoint 可彈性切換)。代價接受:差異隱藏在 Dockerfile、source code grep .env.prod 看不出 `/api`(但 image 取出 bundle 內是 `/api`)、acceptance test 透過 dist grep 驗證真有注入。

- **Q3**: nginx healthcheck endpoint 怎麼設?W-F1 對 rust-api 加了 `/health`、W-F3 compose healthcheck 對 base-web 也需一個方式驗 nginx 起著。 → **A: 加 `location = /health` 返 200 "ok"**(對齊 W-F1 紀律)。nginx config 加 1 行 `location = /health { return 200 "ok"; add_header Content-Type text/plain; }`;使用 exact match (`=`) 不影響 SPA fallback location(`location /`);W-F3 compose healthcheck 統一用 `curl -f http://localhost:8080/health` 對齊 W-F1 / 未來 W-F5 front-nginx upstream healthcheck;rev1 各 web service 都用 `/health` 對 ops 認知負擔最小。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 在乾淨 docker 環境 build + run rev1 base-web image(Priority: P1,唯一 US)🎯 MVP

operator(或 CI agent)在乾淨 docker 環境執行 `cd base-web && docker build -t base-web:test .`。Builder 階段從 `node:22-slim` 起、`corepack enable` 取對應 pnpm 版本、`COPY package.json pnpm-lock.yaml pnpm-workspace.yaml + packages/` 觸發 dep layer cache、`pnpm install --frozen-lockfile` 用 BuildKit cache mount(`/root/.local/share/pnpm/store`)加速、`COPY . .` 整個 base-web source、`ENV VITE_SERVICE_BASE_URL=/api VITE_SERVICE_SUCCESS_CODE=0` override `.env.prod` 內 mock URL、`pnpm build` 跑 Vite production build 產出 `dist/`。Runtime 階段切到 `nginx:1.27-alpine`、apk install `tzdata curl`、symlink TZ 為 `Asia/Shanghai`、`COPY --from=builder /app/dist /usr/share/nginx/html`、`COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf`、`USER nginx`(uid=101 image 內建)、`EXPOSE 8080`、`CMD nginx -g daemon off;`。image 產出 size < 100MB。`docker run -d -p 8080:8080 base-web:test` → nginx 啟動 serve static、`curl -f http://localhost:8080/health` 回 200 + `ok`、`curl http://localhost:8080/` 回 200 + index.html 含 `<title>` + 完整 SPA shell。

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F2 的 5 個交付片段(Dockerfile multi-stage / nginx.conf SPA + healthcheck / .dockerignore / VITE_* build-arg 注入機制 / acceptance test)**並非獨立可交付**:

- 單獨建 Dockerfile → 無 nginx config → SPA fallback / health 都不會 work
- 單獨建 nginx config → 無 Dockerfile → 沒 image 可以跑、純文件無價值
- 單獨設 build-arg → 無 SPA bundle 證明 /api 真注入 → 部署上線 base-web 拿 mock URL silent 失敗
- 單獨跑 acceptance test → 無 image 改造 → 無物可驗
- 單獨改 .dockerignore → 無 builder → context 排不排沒人踩到

W-F2 是 **rev1 deploy P1 4 個 feature 第二片**;W-F1 提供 rust-api image、W-F2 提供 base-web image、共組 W-F3 compose 兩個 service entry。5 個片段是同一 atomic deploy increment 的 acceptance dimensions。

**Independent Test**:12 個 acceptance check(AC-1 ~ AC-12 涵蓋 build / image structure / non-root / nginx valid / port / healthcheck / SPA root / SPA fallback / assets cache / VITE 注入驗證 / TZ)。需要的環境:乾淨 docker host + 至少一次 build 確認 pnpm install + Vite build 跑通。`/health` + SPA 可達性驗證**不需 minimal stack**(base-web image 自包,nginx 起就有 SPA 可 serve、不依賴 postgres / redis / rust-api)— **比 W-F1 acceptance 更獨立**。

**Acceptance Scenarios**:

#### Dimension A — Dockerfile 結構建立(AC-1 ~ AC-3)

1. **Given** 乾淨 docker host,**When** `cd base-web && docker build -t base-web:test .`,**Then** exit 0、output 顯示 builder(node:22-slim)+ runtime(nginx:1.27-alpine)兩 stage
2. **Given** image build 完成,**When** `docker image inspect base-web:test --format='{{.Size}}'`,**Then** < 100MB
3. **Given** 第一次 build 完成,**When** 立即重 build(BuildKit cache 不 prune),**Then** < 30 sec(cache mount + COPY layer cache 命中)

#### Dimension B — Non-root user + nginx config 結構(AC-4 ~ AC-5)

4. **Given** image build 完成,**When** `docker run --rm --entrypoint id base-web:test`,**Then** uid=101 名稱 `nginx`(alpine nginx image 內建 user)
5. **Given** image build 完成,**When** `docker run --rm --entrypoint nginx base-web:test -t`,**Then** `nginx: configuration file ... test is successful`

#### Dimension C — Runtime + healthcheck(AC-6 ~ AC-7)

6. **Given** `docker run -d --name w-f2-test -p 8080:8080 base-web:test` + `sleep 3`,**When** `nc -zv localhost 8080`,**Then** connection succeeded
7. **Given** 同 container,**When** `curl -fsS http://localhost:8080/health`,**Then** 200 + body `ok`

#### Dimension D — SPA 路由 + assets cache(AC-8 ~ AC-10)

8. **Given** 同 container,**When** `curl -fsS http://localhost:8080/`,**Then** 200 + body 含 `<title>` + Vue/SoybeanAdmin SPA shell HTML
9. **Given** 同 container,**When** `curl -fsS http://localhost:8080/some/unknown/route` (SPA fallback path),**Then** 200 + body 同 `/`(index.html、SPA route 由前端 vue-router 處理)
10. **Given** 同 container,**When** `curl -I http://localhost:8080/assets/<某-js-bundle>`,**Then** response header 含 `Cache-Control: public, immutable`

#### Dimension E — VITE 注入 + TZ(AC-11 ~ AC-12)

11. **Given** image build 完成,**When** `docker run --rm --entrypoint sh base-web:test -c 'grep -r "\"/api\"" /usr/share/nginx/html/assets/*.js' | head -3`,**Then** ≥ 1 命中(證明 `VITE_SERVICE_BASE_URL=/api` build-arg 真的注入 SPA bundle,過 .env.prod mock URL override)
12. **Given** image build 完成,**When** `docker run --rm --entrypoint date base-web:test`,**Then** 顯示 `Asia/Shanghai` 時區(CST 2026、UTC+8)

### Edge Cases

- **pnpm install 在 builder 跑很慢**(workspace 多 dep)→ BuildKit cache mount `/root/.local/share/pnpm/store` + deps-first COPY layer cache 命中後 second build 應 < 30 sec
- **Vite process.env override .env.prod 行為不符預期**:若 grep dist 找不到 `/api`、acceptance test AC-11 直接 catch、plan 階段加 fallback 改用 `vite.config.ts` 內 explicit override
- **packages/ workspace sub-package 沒 COPY 完整** → pnpm install 失敗;deps-first COPY 階段 `COPY packages/ packages/` 必須在 install 前
- **nginx user 對 /var/log/nginx 寫入權限** → alpine nginx image 自帶設定可寫,無 volume mount 不衝突
- **`.env.prod` 內 mock URL 與 bundled `/api` 不一致** → source 看 .env.prod 是 mock、但 image 內 bundle 是 `/api`、可能令未來開發者困惑 → AC-11 + spec 內 Q2 拍板紀錄
- **assets cache header 對 index.html 也套了** → 不該、index.html 應該 no-cache(否則 deploy 新版用戶看舊 SPA)、nginx config 須:`location ~* \.(js|css...)$` 才套 cache,index.html 不在此 regex 內、走 SPA fallback location `/` 預設無 cache header(OK)
- **VITE_SERVICE_SUCCESS_CODE 注入**:`.env.prod` 沒此 env,Dockerfile build-arg 注入 `0` 對齊 F4 envelope success=0、需確認 base-web service client 有讀取此 env(若無、build-arg 多餘但 harmless)
- **`vite build --mode prod` 行為**:`package.json` scripts `"build": "vite build --mode prod"`;`pnpm build` 透過 corepack pnpm 跑此命令、ENV override 仍有效

## 範圍邊界(明示)

### W-F2 範圍內

- **新建 base-web/Dockerfile**:multi-stage(node:22-slim builder + nginx:1.27-alpine runtime)、ARG 6 個(NODE_VERSION / NGINX_VERSION / APP_PORT / TZ / VITE_SERVICE_BASE_URL / VITE_SERVICE_SUCCESS_CODE)、deps-first COPY + pnpm install --frozen-lockfile with cache mount、Vite build with ENV override、runtime apk tzdata+curl、USER nginx、EXPOSE 8080
- **新建 base-web/deploy/nginx.conf**:server block listen 8080、root /usr/share/nginx/html、`location = /health` 返 200 ok、SPA fallback `try_files`、assets regex cache 30d immutable
- **新建 base-web/.dockerignore**:排除 node_modules / dist / .env / .env.test / .git / CHANGELOG / README / coverage 等
- **Image tagging convention 文件化**(沿用 W-F1 contracts/dockerfile-structure.md C-D1 模板)
- **Acceptance test**:12 個 AC(Dimension A-E)

### W-F2 範圍外(留後續 W-F feature)

- **docker-compose 結構** → W-F3
- **Docker secrets** → W-F4(base-web 通常無 secret、build-arg 接 API key 等 future)
- **Front-nginx 反向代理**(proxy /api/* → rust-api、proxy / → base-web upstream) → W-F5
- **TLS cert 管理** → W-F6
- **對外 port forwarding** → W-F7
- **rust-api migration init container / 背景工作** → W-F8 / W-F9 / W-F10(屬 rust-api 範疇)
- **水平擴展** → W-F11
- **Observability** → W-F12 / W-F13 / W-F14
- **Backup / DR / CI/CD** → W-F15 / W-F16 / W-F17 / W-F18
- **Track DESIGN-A nestjs 專屬** → W-FA1 / W-FA2 / W-FA3

## Components / Data Flow

```
[CI / 開發者 host]
  cd base-web && docker build \
    --build-arg VITE_SERVICE_BASE_URL=/api \
    --build-arg VITE_SERVICE_SUCCESS_CODE=0 \
    -t base-web:<short-sha> .
    ↓
[Stage 1: builder (node:22-slim)]
  ↓ corepack enable (取 packageManager 對應 pnpm 版本)
  ↓ COPY package.json pnpm-lock.yaml pnpm-workspace.yaml + packages/
  ↓ --mount=type=cache pnpm install --frozen-lockfile
  ↓ COPY . . (全 source)
  ↓ ARG → ENV (VITE_SERVICE_BASE_URL=/api etc.)
  ↓ pnpm build (vite build --mode prod、ENV override .env.prod)
  ↓ produces /app/dist/
    ↓
[Stage 2: runtime (nginx:1.27-alpine)]
  ↓ apk install tzdata curl
  ↓ symlink TZ Asia/Shanghai
  ↓ COPY --from=builder /app/dist → /usr/share/nginx/html
  ↓ COPY deploy/nginx.conf → /etc/nginx/conf.d/default.conf
  ↓ USER nginx (uid=101, image-builtin)
  ↓ EXPOSE 8080 / ENV TZ
  ↓ CMD ["nginx", "-g", "daemon off;"]
    ↓
[Output image]
  base-web:<short-sha>
  size 預期 < 100MB
  含 SPA dist + nginx config + non-root + healthcheck endpoint

[Runtime 使用情境]
  ┌─ docker run -d -p 8080:8080 base-web:<sha>
  │     → nginx daemon 啟動 serve SPA on :8080
  │     → /health → 200 ok (W-F3 compose healthcheck 用)
  │     → / / /home / /any-spa-route → SPA fallback (index.html)
  │     → /assets/*.{js,css,...} → cached 30d immutable
  │
  └─ W-F5 front-nginx upstream:
        upstream base_web { server base-web:8080; }
        location / { proxy_pass http://base_web; }
```

## Dockerfile 草稿

```dockerfile
# =============================================================================
# base-web Dockerfile — rev1 deploy 版本(W-F2)
#
# 新建 — base-web 源倉無既有 Dockerfile。
#
# 設計要點:
# - builder node:22-slim(>=20.19 滿足、22 LTS)
# - runtime nginx:1.27-alpine(image ~30MB,對齊 DESIGN-W §2.2)
# - corepack 取 packageManager 對應 pnpm 版本
# - deps-first COPY + BuildKit cache mount → 第二次 build < 30s
# - VITE_* 透過 ARG/ENV 在 build time override .env.prod
# - nginx alpine 內建 nginx user(uid=101)、直接 USER 切換、不需 useradd
#
# 不在 W-F2 範疇:compose / secret / TLS / front-nginx / 對外 port forward 等
# (留 W-F3 ~ W-F18)
# =============================================================================

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27
ARG APP_PORT=8080
ARG TZ=Asia/Shanghai
ARG VITE_SERVICE_BASE_URL=/api
ARG VITE_SERVICE_SUCCESS_CODE=0

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
RUN corepack enable

# dep layer — COPY package manifests first for cache hit
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# source + build with build-arg env override(per Q2 clarify)
COPY . .

ARG VITE_SERVICE_BASE_URL
ARG VITE_SERVICE_SUCCESS_CODE
ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL
ENV VITE_SERVICE_SUCCESS_CODE=$VITE_SERVICE_SUCCESS_CODE

RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 2: runtime
# -----------------------------------------------------------------------------
FROM nginx:${NGINX_VERSION}-alpine AS runtime

ARG APP_PORT
ARG TZ

RUN apk add --no-cache tzdata curl && \
    ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

USER nginx
EXPOSE ${APP_PORT}

ENV TZ=${TZ}

CMD ["nginx", "-g", "daemon off;"]
```

## nginx config 草稿(`deploy/nginx.conf`)

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # /health endpoint(exact match — priority highest、bypass SPA fallback、對齊 W-F1 紀律)
    location = /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }

    # Static assets cache(30d、immutable;不含 index.html)
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback(最低 priority、index.html no-cache 預設行為)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**設計要點**:
- location 優先級:exact `=` > regex `~*` > prefix `/` → `/health` 最高 / assets 次 / SPA fallback 最低
- index.html 走 SPA fallback location、無 cache header → deploy 新版用戶能立即拉到新 index.html(新 bundle URL)
- assets `*.js / *.css` 等 immutable cache 30 天 — Vite build 對 assets 加 hash 後綴,新 build SHA 不同檔名、不衝突
- 不 proxy `/api/*`(那是 W-F5 front-nginx 的工作、base-web container 內 nginx 只 serve 自身 static)

## Acceptance Criteria

| # | Check | 命令 | 期望 |
|---|---|---|---|
| AC-1 | Build success | `cd base-web && docker build -t base-web:test .` | exit 0、含 builder + runtime stage |
| AC-2 | Image size | `docker image inspect base-web:test --format='{{.Size}}'` | < 100MB |
| AC-3 | Cache hit | 第二次 build | < 30 sec |
| AC-4 | non-root user | `docker run --rm --entrypoint id base-web:test` | `uid=101(nginx) gid=101(nginx)` |
| AC-5 | nginx config valid | `docker run --rm --entrypoint nginx base-web:test -t` | `test is successful` |
| AC-6 | Port listening | 起 container + `nc -zv localhost 8080` | succeeded |
| AC-7 | /health | `curl -fsS http://localhost:8080/health` | 200 + body `ok` |
| AC-8 | SPA root | `curl -fsS http://localhost:8080/` | 200 + index.html 含 `<title>` |
| AC-9 | SPA fallback | `curl -fsS http://localhost:8080/some/unknown` | 200 + 同 index.html |
| AC-10 | Assets cache header | `curl -I http://localhost:8080/assets/<any>.js` | `Cache-Control: public, immutable` |
| AC-11 | VITE_SERVICE_BASE_URL 注入 | `docker run --rm --entrypoint sh base-web:test -c 'grep "\"/api\"" /usr/share/nginx/html/assets/*.js \| head -3'` | ≥ 1 命中 |
| AC-12 | TZ | `docker run --rm --entrypoint date base-web:test` | CST 2026 / UTC+8 |

## 風險

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| pnpm install 在 builder 慢(workspace 多 dep)| 高 | 中 | BuildKit cache mount `/root/.local/share/pnpm/store` + deps-first COPY layer cache;第一次 build 接受 5-10 min |
| Vite process.env override .env.prod 行為不如預期 | 中 | 高 | AC-11 grep dist 直接 catch;plan 階段如不 work,fallback 為 vite.config.ts 內 explicit override 或寫 `.env.local` 暫時注入 |
| `packages/` workspace COPY 順序錯 | 中 | 中 | deps-first COPY pattern:先 package.json + pnpm-lock + pnpm-workspace + packages/、再 install、然後 COPY 整 source |
| image size > 100MB | 低 | 中 | nginx alpine ~30MB + 預期 bundle ~50MB(NaiveUI + UnoCSS + AntV chart libs 等),極限 ~90MB;若超過 acceptance log 記錄、可考慮 Vite manualChunks 拆 bundle |
| assets cache header 對 index.html 誤套 | 低 | 中 | nginx regex `~* \.(js\|css\|...)$` 不含 .html、index.html 走 SPA fallback location 無 cache;測 AC-10 + 手工 curl index.html 看無 immutable |
| .env.prod 內 mock URL 仍存源碼但 bundle 用 /api | — | 低 | AC-11 確認 bundle 確實是 /api;source 不一致由 Q2 拍板紀錄 |
| nginx user 對 /var/cache/nginx / /var/log/nginx 寫入 | 低 | 低 | nginx alpine image 自帶設定可寫、無 volume mount 不衝突 |

## 跨 feature 的待驗證項(Assumptions)

依 constitution §IV「上游驗證」規則 — 帶上 feature spec.md Assumptions 段、實作時驗、驗完勾掉並回填結果。

- [ ] **`pnpm install --frozen-lockfile` 在 builder 環境跑通**(`pnpm-lock.yaml` 完整、無 platform-specific dep 問題)— W-F2 plan 階段第一個前置驗
- [ ] **`pnpm build` 在 node:22-slim + 與 `package.json engines.node >= 20.19.0` 相容**(Vite7 + workspace 各 sub-package compile pass)— W-F2 plan 階段第二個前置驗
- [ ] **Vite process.env override .env.prod 真的生效**(grep dist 看 `/api` 注入)— AC-11 驗
- [ ] **`.env.prod` 內 `VITE_SERVICE_SUCCESS_CODE` 確實沒設**(grep .env* 全)、build-arg 注入 `0` 為新增 default — plan 階段先 grep 驗

## spec-kit feature 階段(W-F2)輸出

依 rev1 spec-kit 工作流(對齊 F1-F5 + W-F1 模式):

- `specs/007-dockerfile-base-web/spec.md`(從本 brainstorm doc 轉)
- `specs/007-dockerfile-base-web/plan.md`(builder/runtime stage 拆解、nginx config 驗證任務、VITE 注入驗證任務)
- `specs/007-dockerfile-base-web/research.md`(pnpm install 驗 / Vite env override 驗 / packages/ workspace COPY 順序 audit)
- `specs/007-dockerfile-base-web/data-model.md`(image / SPA dist / nginx config / .dockerignore / image tag entity)
- `specs/007-dockerfile-base-web/contracts/`(`/health` endpoint OpenAPI + Dockerfile structure contract C-D1~C-D7 對齊 W-F1)
- `specs/007-dockerfile-base-web/quickstart.md`(docker build + run + curl 全 12 AC reproducer)
- `specs/007-dockerfile-base-web/tasks.md`(spec-kit `/speckit-tasks` 階段產出)

實作落 `base-web/` worktree(rev1-admin-base-web 分支):

```
base-web/
├── Dockerfile          # 新建(主)
├── deploy/
│   └── nginx.conf      # 新建
└── .dockerignore       # 新建
```

兩段 commit:

1. **第一段**(`base-web/` worktree → `rev1-admin-base-web` 分支):3 個新建檔
2. **第二段**(outer `007-dockerfile-base-web` feature branch):`specs/007-dockerfile-base-web/` spec docs + bump base-web SHA pin

Feature branch 完成後 merge 回 `rev1-admin-root`,Phase W deploy P1 進度 2/4(W-F3 / W-F4 待動)。
