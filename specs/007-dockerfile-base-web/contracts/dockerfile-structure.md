# Contract: base-web Dockerfile + nginx config structure

**Feature**: 007-dockerfile-base-web
**Paths**:
- `base-web/Dockerfile`(W-F2 新建主檔)
- `base-web/deploy/nginx.conf`(W-F2 新建 nginx config)
- `base-web/.dockerignore`(W-F2 新建)
**Format**: Dockerfile syntax v1.x(BuildKit-aware)+ nginx 1.27 config

此 contract 規範 W-F2 產出的 Dockerfile + nginx config + .dockerignore **結構性約束**。對齊 W-F1 contracts/dockerfile-structure.md C-D1~C-D7 模式。

---

## C-D1: ARG 宣告(top of Dockerfile)

**Frozen by W-F2**:
```dockerfile
ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27
ARG PNPM_VERSION=10.18.0
ARG APP_PORT=8080
ARG TZ=Asia/Shanghai
ARG VITE_SERVICE_BASE_URL=/api
ARG VITE_SERVICE_SUCCESS_CODE=0
```

**Constraints**:
- `NODE_VERSION` MUST 是 minor pin(`22` 而非 `22.0.0`)— Cargo.lock equivalent pnpm-lock.yaml 保 dep reproducibility
- `NGINX_VERSION` MUST 是 minor pin(`1.27` minor、不 patch pin)
- `PNPM_VERSION` MUST 是 patch pin(per R-003 reproducibility,`corepack prepare pnpm@${PNPM_VERSION} --activate` 才能 deterministic)
- `APP_PORT` MUST 是 `8080`(per FR-014;非對外 host port、W-F5 front-nginx 反代與 W-F7 對外 port forwarding 才動 host-mapping)
- `TZ` MUST 是 `Asia/Shanghai`
- `VITE_SERVICE_BASE_URL` MUST default 是 `/api`(per Q2 clarify、rev1 deploy 走同源 nginx 反代)
- `VITE_SERVICE_SUCCESS_CODE` MUST default 是 `0`(per F4 envelope success=0)

**Future flexibility**(W-F5 / W-F17 階段可動):
- 外部 `--build-arg VITE_SERVICE_BASE_URL=<other>` override(staging / prod 不同 endpoint)
- `PNPM_VERSION` 升 patch / minor 時改 ARG default

---

## C-D2: Builder stage 結構

**Frozen by W-F2**:
```dockerfile
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Deps-first COPY layer(per R-005 / FR-004)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ packages/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Source + build with build-arg env override(per R-002 / Q2 clarify)
COPY . .

ARG VITE_SERVICE_BASE_URL
ARG VITE_SERVICE_SUCCESS_CODE
ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL
ENV VITE_SERVICE_SUCCESS_CODE=$VITE_SERVICE_SUCCESS_CODE

RUN pnpm build
```

**Constraints**:
- Base MUST 是 `node:${NODE_VERSION}-slim`(per FR-002、debian-slim 衍生、無 native-compile 工具但夠 pnpm install)
- MUST `corepack enable` + `corepack prepare pnpm@${PNPM_VERSION} --activate`(per FR-003 + R-003 顯式 pin)
- Deps-first COPY MUST 含 4 個 file/dir set:`package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `packages/`(per FR-004 + R-005)
- BuildKit cache mount target MUST 是 `/root/.local/share/pnpm/store`(per FR-005 + R-008)
- `pnpm install` MUST 帶 `--frozen-lockfile`(reproducibility)
- `COPY . .` MUST 在 install 之後(per deps-first cache strategy)
- VITE_* ARG/ENV re-declaration MUST 在 source COPY 之後 + `pnpm build` 之前(per FR-006、ENV 必須在 build 時 active)
- MUST 跑 `pnpm build`(透過 `package.json` "build": "vite build --mode prod")

**Future flexibility**:
- W-F11 / W-F17 階段可加 `RUSTFLAGS` 類等價(Vite manualChunks via `vite.config.ts` patch — 但屬 source code 改、需 FR-025 例外 justify)

---

## C-D3: Runtime stage 結構

**Frozen by W-F2**:
```dockerfile
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

**Constraints**:
- Base MUST 是 `nginx:${NGINX_VERSION}-alpine`(per FR-008)
- `apk install` MUST 至少含 `tzdata curl`(per FR-009;curl 給 W-F3 healthcheck 用、tzdata 給 TZ)
- TZ MUST symlink `ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime`(per FR-010)
- COPY dist MUST 從 builder stage `/app/dist` → `/usr/share/nginx/html`(per FR-011)
- COPY nginx config MUST `deploy/nginx.conf` → `/etc/nginx/conf.d/default.conf`(per FR-012;**注意 from builder context**、不是 from builder stage)
- USER MUST `nginx`(per FR-013;by name not uid、image 內建)
- EXPOSE MUST `${APP_PORT}`(per FR-014;`8080` default)
- ENV MUST 含 `TZ`(per FR-010)
- CMD MUST `["nginx", "-g", "daemon off;"]`(per FR-014;daemon off 為 docker container 必要)

**Future flexibility**:
- W-F12 / W-F13 observability:可加 nginx exporter side-car、access log format JSON 等(W-F2 不動)

---

## C-D4: nginx config 結構(`base-web/deploy/nginx.conf`)

**Frozen by W-F2**:
```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Priority 1: exact match /health (per FR-016 + R-006)
    location = /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }

    # Priority 2: regex match assets (per FR-017)
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Priority 3: prefix match SPA fallback (per FR-018 + FR-019 + R-007)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }
}
```

**Constraints**:
- `listen` MUST `8080`(對齊 Dockerfile EXPOSE)
- `server_name` `_`(catch-all、由 W-F5 front-nginx 控制 host header)
- `root` MUST `/usr/share/nginx/html`(對齊 Dockerfile COPY 路徑)
- 3 個 location MUST 都存在,優先級順序由 nginx 預設(exact `=` > regex `~*` > prefix `/`)決定 — per R-006
- `location = /health` MUST `return 200 "ok"` + `Content-Type text/plain`(per FR-016)
- `location ~* \.(js|css|...)$` MUST 套 `expires 30d` + `Cache-Control "public, immutable"`(per FR-017、對 Vite 帶 hash 的 assets 安全套 immutable)
- `location /` MUST `try_files $uri $uri/ /index.html`(per FR-018;SPA fallback)
- `location /` MUST 套 `Cache-Control "no-cache, no-store, must-revalidate"` + `Pragma no-cache`(per FR-019 + R-007;確保 deploy 新版時瀏覽器拉新 index.html)

**Forbidden**:
- ❌ `proxy_pass` 到 rust-api(per FR-028;那是 W-F5 front-nginx 工作)
- ❌ TLS / SSL config(W-F6 front-nginx 範疇)

---

## C-D5: 不允許出現的 pattern(W-F2 範疇邊界)

下列 pattern MUST NOT 出現在 W-F2 Dockerfile / nginx config:

- ❌ `--platform=$BUILDPLATFORM` ARG(per FR-027 multi-arch 留 W-F17)
- ❌ `RUN docker secrets` / `RUN --mount=type=secret`(留 W-F4)
- ❌ `HEALTHCHECK` directive(留 W-F3 docker-compose healthcheck;對齊 W-F1 contracts C-D5)
- ❌ `LABEL` 注入(W-F17 CI 階段拍板 metadata schema)
- ❌ `:latest` 任何 tag 引用(per FR-024)
- ❌ proxy_pass `/api/*` 到 rust-api(per FR-028)
- ❌ TLS / SSL config(留 W-F6)
- ❌ 修改 `vite.config.ts` 或 source code(per FR-025 + Constitution Principle IV)
- ❌ 修改 `.env*`(per FR-026 + Q2 clarify)

---

## C-D6: `.dockerignore` 結構

**File**: `base-web/.dockerignore`(W-F2 新建)

**MUST exclude**(per FR-020):
- `node_modules/`(builder install)
- `dist/`(builder rebuild)
- `.env`,`.env.test`
- `.git`,`.github`
- `.vscode`,`.idea`
- `CHANGELOG*.md`,`README*.md`,`LICENSE`
- `*.log`,`.DS_Store`,`coverage/`
- `**/.DS_Store`(macOS)
- `**/Dockerfile*`(避免 self-recursive)

**MUST NOT exclude**(per FR-021):
- `package.json`,`pnpm-lock.yaml`,`pnpm-workspace.yaml`
- `packages/`,`packages/*/package.json`,`packages/*/src/`(workspace)
- `src/`,`public/`,`build/`,`index.html`
- `vite.config.ts`,`tsconfig.json`,`eslint.config.js`
- `.env.prod`(builder 載入、Vite loadEnv 讀)
- `deploy/nginx.conf`(builder 將 COPY 此檔)

**Validation**:`docker build` 成功 = 不漏排除 / 不誤排除

---

## C-D7: Image 屬性 contract(W-F3 / 後續 feature 可依賴)

W-F2 產出的 image 提供下列**穩定保證**,W-F3 / W-F5 / W-F17 feature 可依賴:

| 屬性 | 保證值 | Verification |
|---|---|---|
| CMD | `["nginx", "-g", "daemon off;"]` | `docker inspect base-web:<tag>` |
| EXPOSE | `8080/tcp` | 同上 |
| USER | `nginx`(uid 預期 101、由 image 決定) | `docker run --entrypoint id` |
| `/health` endpoint(after startup) | 200 + body `ok` + Content-Type `text/plain` | `curl -f http://<container>:8080/health` |
| `/` SPA root | 200 + body 含 `<title>` | `curl -f http://<container>:8080/` |
| `/<unknown-path>` SPA fallback | 200 + 同 index.html | `curl -f http://<container>:8080/foo/bar` |
| `/assets/*.{js,css,...}` cache header | `Cache-Control: public, immutable` | `curl -I http://<container>:8080/assets/<file>` |
| `/` cache header(index.html)| `Cache-Control: no-cache, no-store, must-revalidate` | `curl -I http://<container>:8080/` |
| TZ | `Asia/Shanghai` | `docker run --entrypoint date` |
| arch | `linux/amd64` | `docker inspect --format='{{.Architecture}}'` |
| size | < 100MB target / < 130MB acceptable | `docker image inspect --format='{{.Size}}'` |
| SPA bundle 含 `/api` literal | grep `\"/api\"` /usr/share/nginx/html/assets/*.js ≥ 1 命中 | `docker run --entrypoint sh` + grep |

W-F3 ~ W-F18 spec 可引用上表作為 W-F2 提供的 contract、不需重新驗證。
