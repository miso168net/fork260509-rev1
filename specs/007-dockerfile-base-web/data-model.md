# Data Model: W-F2 dockerfile-base-web

**Feature**: 007-dockerfile-base-web
**Phase**: 1 (design)
**Date**: 2026-05-15
**Source**: spec.md `## Key Entities` 段 + research.md R-001~R-009

**Scope note**:W-F2 為 infrastructure / deploy feature,無 DB schema 改動、無 persistent entity。本 data-model 描述 **build-time + runtime** 的 entity / artifact 結構與關聯。

---

## Entities

### E1: `base-web-image` (Docker Image)

**Type**: build artifact(docker image)

**Identity**: image tag(3 種模式,DESIGN-W §2.4 + W-F1 contracts/dockerfile-structure.md C-D1 對齊):

| Tag 模式 | 格式 | 不可變 |
|---|---|---|
| 主 tag | `<registry>/base-web:<short-git-sha>` (7-char SHA) | ✅ |
| 輔助 tag | `<registry>/base-web:<branch>` (e.g. `base-web:rev1-admin-base-web`) | ❌ |
| Prod tag | `<registry>/base-web:prod-<YYYYMMDD>` | ❌ |

**Forbidden**: `:latest`(per spec FR-024)

**Attributes**:
- `image_size`(bytes)— target < 100MB(SC-002 / R-009 估計 80-120MB)
- `arch`— `linux/amd64`(per W-F1 Q2 inherit)
- `base_runtime`— `nginx:1.27-alpine`
- `cmd`— `["nginx", "-g", "daemon off;"]`
- `exposed_port`— `8080`
- `user`— `nginx`(uid 由 alpine image 決定、預期 101)
- `workdir`— 預設(image 內 nginx working dir、無顯式 WORKDIR)

**Contents**(image layout):
```
/usr/share/nginx/html/      # E2: SPA dist files
├── index.html              # Vue SPA shell (no-cache)
├── assets/                 # Vite build hashed assets (immutable cache)
│   ├── *.js                # Hashed JS bundles (含 /api literal injected)
│   ├── *.css               # Hashed CSS
│   └── ...                 # Images / fonts / etc
├── favicon.ico
└── ...

/etc/nginx/conf.d/default.conf   # E3: nginx server config
```

**Lifecycle**:
- **build**:`cd base-web && docker build [--build-arg VITE_SERVICE_BASE_URL=/api] -t <tag> .` → builder stage(pnpm install + vite build)→ runtime stage(nginx alpine + SPA dist + config)
- **run**:被 W-F3 docker-compose 引用 / 被 W-F5 front-nginx 作為 upstream
- **tag/push**:W-F17 CI 階段 push(W-F2 範圍外)

**Relationships**:
- contains → E2(SPA dist)
- contains → E3(nginx config)
- consumes → E4(build-time env override)
- exposes → E5(`/health` endpoint via E3)

**Validation**(spec → acceptance):
- AC-1 ~ AC-3 → Dockerfile build / size / cache hit(Dimension A)
- AC-4 ~ AC-5 → non-root user / nginx config valid(Dimension B)

---

### E2: SPA dist(內含於 E1)

**Type**:Vite production build artifact

**Source**:`base-web/` Vue3 SPA source(主要 `src/`、`public/`、`packages/*/`)

**Path in image**:`/usr/share/nginx/html/`

**Owner**:預設(nginx image 內 root 擁有、nginx user 讀取)

**Build process**:
1. Builder stage `pnpm build` → 跑 `vite build --mode prod`
2. Vite 載入 `.env.prod` + `.env`(via `loadEnv`)+ process.env(per R-002 high priority)
3. `import.meta.env.VITE_SERVICE_BASE_URL` 經 Vite define plugin replace 為 `/api`(literal substitution)
4. 輸出 `/app/dist/` 含 hashed assets

**Content properties**:
- `index.html`:單一 SPA shell,Vue mount point;**不帶 hash 後綴**;由 nginx `location /` SPA fallback serve
- `assets/*`:JS / CSS / images / fonts,**帶 hash 後綴**(Vite 預設 `[name]-[hash][extname]`);由 nginx assets regex location serve 並套 immutable cache

**Validation**:
- AC-7 / AC-8 / AC-9 → SPA index.html + fallback 行為(Dimension C / D)
- AC-10 → assets cache header(Dimension D)
- AC-11 → `/api` literal 注入驗證(Dimension E)

---

### E3: nginx config(`/etc/nginx/conf.d/default.conf`)

**Type**:nginx server config

**Source**:builder stage `base-web/deploy/nginx.conf`(W-F2 新建)

**Path in image**:`/etc/nginx/conf.d/default.conf`(覆蓋 nginx alpine default)

**Server block 結構**(per R-006 / R-007):

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Priority 1: exact match /health (per FR-016)
    location = /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }

    # Priority 2: regex match assets (per FR-017)
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Priority 3: prefix match / (SPA fallback, per FR-018 + R-007 no-cache)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }
}
```

**Location matching order**(per R-006、nginx 預設行為):
1. `=` exact match(highest)
2. `~*` regex match
3. `/` prefix match(lowest)

**Validation**:
- AC-5 → `nginx -t` 語法 OK
- AC-7 → `/health` 200 + `ok`
- AC-9 / AC-8 → SPA fallback 對任何 path 返 index.html + no-cache header(R-007)
- AC-10 → assets immutable cache header

---

### E4: Build-time env override(VITE_*)

**Type**:Dockerfile build args + container ENV(builder stage)

**Mechanism**(per R-002 / Q2 clarify):

```
[host docker build]
  --build-arg VITE_SERVICE_BASE_URL=/api
  --build-arg VITE_SERVICE_SUCCESS_CODE=0
       ↓
[Dockerfile builder stage]
  ARG VITE_SERVICE_BASE_URL
  ARG VITE_SERVICE_SUCCESS_CODE
  ENV VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL
  ENV VITE_SERVICE_SUCCESS_CODE=$VITE_SERVICE_SUCCESS_CODE
       ↓
[container 內 pnpm build → vite build --mode prod]
  process.env.VITE_SERVICE_BASE_URL = "/api"  (highest priority)
  loadEnv("prod", cwd, ["VITE_"])
    → reads .env.prod (mock URL)
    → merge process.env (override mock URL)
    → returns viteEnv with VITE_SERVICE_BASE_URL = "/api"
       ↓
[Vite define plugin]
  import.meta.env.VITE_SERVICE_BASE_URL → literal "/api"
       ↓
[bundle output]
  assets/*.js 內含 "/api" literal (per AC-11)
```

**Build-arg defaults**(in Dockerfile):
- `VITE_SERVICE_BASE_URL=/api`(per Q2)
- `VITE_SERVICE_SUCCESS_CODE=0`(per F4 envelope success code,base-web 客戶端 default)

**Override**:外部 `docker build --build-arg ...` 可改;W-F5 / W-F17 staging / prod 不同 endpoint 場景使用。

**Not in W-F2**:
- 任何 secret 類 env(`_FILE` pattern)留 W-F4
- runtime ENV(W-F2 runtime stage 只有 `TZ`)

---

### E5: `/health` endpoint(runtime service)

**Type**:HTTP route(W-F2 新增,by nginx config)

**Route definition**:
- Method:`GET`
- Path:`/health`(exact match in nginx)
- Mount:`deploy/nginx.conf` 內 `location = /health` block

**Response**:
- Status:200 OK(unconditional)
- Body:`ok`(plain text)
- Content-Type:`text/plain`(顯式 by `add_header`)

**Behavior**:
- 不過 application logic(純 nginx return)
- 不查 backend / DB / redis
- 不發出 access log(nginx default,但可選由 `access_log off` 顯式;W-F2 不額外處理、W-F12 階段考慮)
- p99 latency < 50ms(per SC-004)

**Validation**(spec → acceptance Dimension C):
- Scenario 6:port 8080 listening
- Scenario 7:`curl -f /health` → 200 + `ok`

**Consumers**(future):
- W-F3 compose healthcheck:`test: ["CMD", "curl", "-f", "http://localhost:8080/health"]`
- W-F5 front-nginx upstream healthcheck(可選、由 W-F5 拍板)

---

### E6: `.dockerignore` (build context filter)

**Type**: build configuration(W-F2 新建)

**Path**: `base-web/.dockerignore`

**MUST exclude**(per FR-020):
- `node_modules/`(builder 自己 install)
- `dist/`(host 殘留 / builder rebuild)
- `.env`,`.env.test`(secret / test config 不入 image)
- `.git`,`.github`(版控 meta)
- `.vscode`,`.idea`(IDE meta)
- `CHANGELOG*.md`,`README*.md`,`LICENSE`(文件、不入 image)
- `*.log`,`.DS_Store`,`coverage/`

**MUST NOT exclude**(per FR-021、builder 必需):
- `package.json`,`pnpm-lock.yaml`,`pnpm-workspace.yaml`
- `packages/`(8 sub-package)
- `src/`,`public/`,`build/`,`index.html`
- `vite.config.ts`,`tsconfig.json`,`eslint.config.js`
- `.env.prod`(builder 載入)

**Validation**:`docker build` 成功 = `.dockerignore` 不漏排除 / 不誤排除

---

### E7: Image tag entity

**Type**:image registry reference(W-F1 contracts C-D1 模板繼承)

**Three categories**:
- **主 tag**:`<registry>/base-web:<short-git-sha>` — 不可變、build 觸發、CI artifact
- **輔助 tag**:`<registry>/base-web:<branch>` — 移動、指向 branch latest build
- **Prod tag**:`<registry>/base-web:prod-<YYYYMMDD>` — manual / W-F17 pipeline 觸發

**Registry placeholder**:W-F1 / W-F2 階段用 `local/base-web` 或 `ghcr.io/miso168net/base-web`;具體 registry 由 W-F17 拍。

**Forbidden**:`:latest`(per spec FR-024)

---

## Entity Relationship Diagram

```
                  ┌─────────────────────────────────────┐
                  │ E1: base-web-image                  │
                  │ (linux/amd64, nginx:1.27-alpine     │
                  │  + Vue SPA dist, < 100MB target)    │
                  └────┬────────┬────────┬──────────────┘
        ┌──────────────┼────────┼────────┼──────────────┐
        │              │        │        │              │
        ▼              ▼        ▼        ▼              ▼
   ┌──────────┐  ┌─────────────────┐  ┌──────────┐  ┌─────────────┐
   │ E2: SPA  │  │ E3: nginx.conf  │  │ E4: env  │  │ E7: image   │
   │ dist     │  │ (3 location:    │  │ override │  │ tag         │
   │ (Vite    │  │  =/health,      │  │ (build-  │  │ (3 patterns)│
   │  build)  │  │  ~*assets,      │  │  arg)    │  │             │
   │          │  │  /SPA fallback) │  │          │  │             │
   └────┬─────┘  └────────┬────────┘  └────┬─────┘  └─────────────┘
        │                  │                │
        │ injected         │ exposes        │ replaces
        │ /api literal     │                │ .env.prod mock URL
        │                  ▼                │
        │           ┌──────────────────┐    │
        │           │ E5: /health      │    │
        │           │ endpoint         │    │
        │           │ (200 + "ok")     │    │
        │           └──────────────────┘    │
        │                                    │
        └───── consumed by import.meta.env ──┘

[Build-time configuration]
   ┌──────────────────┐
   │ E6: .dockerignore│
   │ (filters builder │
   │  context)        │
   └──────────────────┘
```

---

## Reference: W-F2 範圍外的 entity(供後續 W-F feature 對接參考)

下列 entity **不在 W-F2 spec 內定義**,在此列出方便後續 W-F3 ~ W-F18 spec-kit feature 引用:

- **W-F3 docker-compose base-web service**:image = E1、healthcheck test = `curl -f http://localhost:8080/health`、network `internal`、無對外 port forward(由 front-nginx 代理)
- **W-F5 front-nginx upstream**:`upstream base_web { server base-web:8080; }` + `location / { proxy_pass http://base_web; }` + `location /api/ { proxy_pass http://rust_api/; }`(後者連 W-F1 image)
- **W-F17 CI build pipeline**:E1 build / tag / push 自動化、多 arch + build-arg 配置由 W-F17 拍
