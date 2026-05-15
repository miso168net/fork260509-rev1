# Data Model: W-F5 — front-nginx 反向代理

**Phase 1 output** — 5 個 entity:E1 front-nginx service / E2 `deploy/front-nginx/` 結構 / E3 nginx config(upstream + location) / E4 header forwarding / E5 HTTP request flow。

---

## E1 — `front-nginx` service(docker-compose.yml 新加)

```yaml
front-nginx:
  image: nginx:1.27-alpine
  environment:
    TZ: ${TZ:-Asia/Shanghai}
  volumes:
    - ./deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro
  depends_on:
    base-web:
      condition: service_healthy
    rust-api:
      condition: service_healthy
  networks:
    - internal
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost/health"]
    interval: 30s
    timeout: 5s
    retries: 3
  restart: unless-stopped
```

**Validation rules**:
- image 為 `nginx:1.27-alpine`(對齊 W-F2 base-web 內部 nginx 版本)
- volumes mount `deploy/front-nginx/conf.d` → `/etc/nginx/conf.d` read-only
- depends_on long syntax + `service_healthy`(對齊 W-F3 rust-api depends_on 模式)
- networks 加 `internal`(per W-F3 既有 network)
- healthcheck 用 curl /health
- **MUST NOT** 含 `ports:` 段(per spec FR-021、留 W-F7)
- **MUST NOT** 含 `secrets:` 段(per spec FR-025、不需 secret)

**State transitions**:無(stateless reverse proxy)。

---

## E2 — `deploy/front-nginx/` 目錄結構

```text
deploy/front-nginx/
├── README.md                ← git-tracked、operator 說明
└── conf.d/
    └── default.conf         ← git-tracked、主 nginx config(2 upstream + 3 location)
```

**Validation rules**:
- `conf.d/` 子目錄為 nginx 標準 include 路徑(`/etc/nginx/nginx.conf` 預設 `include /etc/nginx/conf.d/*.conf;`)
- 只 1 個 `default.conf`(W-F5 範圍內、Track DESIGN-A 的 `track-a.inc` 留 W-FA1 加)
- `README.md` 內容:operator 操作流程(restart for config reload)+ W-F5 範疇邊界(無 TLS / 無 host port)

---

## E3 — `default.conf` 結構(2 upstream + 3 location)

### E3.1 Upstream

```nginx
upstream base_web {
    server base-web:8080;
}

upstream rust_api {
    server rust-api:11081;
    keepalive 32;
}
```

**Validation rules**:
- 2 個 upstream block:`base_web` 指 `base-web:8080`(W-F2 image listen)、`rust_api` 指 `rust-api:11081`(W-F1 image APP_SERVER_PORT)
- `rust_api` 加 `keepalive 32`(per R-005);`base_web` 不加(per R-010)
- upstream 名用 `_`(snake_case)— nginx 慣例

### E3.2 Server(listen 80)

```nginx
server {
    listen 80;
    server_name _;

    # Priority 1: front-nginx self healthcheck(per clarify Q1 Option A、不透傳)
    location = /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }

    # Priority 2: /api/* → rust-api(trailing slash 切前綴 per R-001)
    location /api/ {
        proxy_pass http://rust_api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_read_timeout 60s;
    }

    # Priority 3: 其他全部 → base-web(SPA + static、base-web 內 nginx 接管 SPA fallback)
    location / {
        proxy_pass http://base_web;
        proxy_set_header Host $host;
    }
}
```

**Validation rules**:
- 3 個 location:`= /health`(exact)/ `/api/`(prefix + trailing slash + 5 header)/ `/`(prefix)
- `listen 80`(無 SSL — 留 W-F6;無 host port — 留 W-F7)
- `server_name _;`(catch-all、無 vhost 區分)
- `proxy_pass` 結尾 trailing slash:**`rust_api/` 有**(切前綴)、**`base_web` 無**(保留完整 path 給 base-web 內部 nginx 處理 try_files)

### E3.3 Location 優先序

| Priority | Selector | Path | Forward to | 用途 |
|---|---|---|---|---|
| 1(exact)| `= /health` | `/health` only | self return | front-nginx healthcheck |
| 2(prefix longer)| `/api/` | `/api/*` | rust_api(切前綴) | API |
| 3(prefix shorter)| `/` | 其他全部 | base_web(保留 path) | SPA + static |

---

## E4 — Header Forwarding(/api/ location)

| Header | nginx variable | 用途 |
|---|---|---|
| `Host` | `$host` | preserve original Host header(rust 看到 client 用的 hostname) |
| `X-Real-IP` | `$remote_addr` | single client IP(immediate downstream)|
| `X-Forwarded-For` | `$proxy_add_x_forwarded_for` | IP chain(client + intermediate proxies) |
| `X-Forwarded-Proto` | `$scheme` | http / https(W-F5 純 http;W-F6 加 TLS 後 https) |
| `X-Request-ID` | `$request_id` | nginx 自動 generate UUID for request correlation |

**Validation rules**:
- 5 個 header **MUST** 全部加在 `/api/` location 內(per spec FR-016)
- `/` location 只加 `Host`(per E3.2);base-web SPA serving 不需 client IP
- nginx 自動 forward `Connection` header — 對 keepalive 必要、不需顯式設

---

## E5 — HTTP request flow(internal docker network)

```
<any container> ──HTTP──> front-nginx:80
                            │
                            ├─ location = /health → return 200 "ok"
                            │
                            ├─ location /api/ → proxy_pass http://rust_api/  (strip /api/)
                            │                       └─> rust-api:11081/<path-after-api/>
                            │                              └─> F5.1 等 handler
                            │
                            └─ location / → proxy_pass http://base_web  (keep path)
                                              └─> base-web:8080/<original-path>
                                                     └─> W-F2 nginx try_files
                                                          ├─ file exists → serve static
                                                          └─ else → index.html (SPA fallback)
```

**Examples**:

| Request | front-nginx 路由 | rust-api / base-web 收到 | 結果 |
|---|---|---|---|
| `GET /` | location `/` → base_web | base-web:8080`/` | `index.html`(SPA root) |
| `GET /login` | location `/` → base_web | base-web:8080`/login` | SPA fallback → `index.html`、vue-router 顯示 login 頁 |
| `GET /assets/index-abc.js` | location `/` → base_web | base-web:8080`/assets/index-abc.js` | 30d immutable cache(W-F2 既有 location `~*` regex) |
| `POST /api/auth/login` | location `/api/` → rust_api/ | rust-api:11081`/auth/login` | F5.1 login handler 200 + token |
| `GET /api/health` | location `/api/` → rust_api/ | rust-api:11081`/health` | rust-api 自身 /health 200 ok |
| `GET /health` | location `= /health` → return | (不轉發) | front-nginx self 200 ok |
| `GET /api/nonexistent` | location `/api/` → rust_api/ | rust-api:11081`/nonexistent` | rust-api fallback 404 |

**Validation rules**:
- Request flow MUST 對 5 種 path 全 work(per spec scenario 11-16)
- `/health` 由 front-nginx 自身回(per E3.2 priority 1、不轉發);若 operator 想驗 rust-api 自身 `/health` 仍可直連 `curl http://rust-api:11081/health` 或經 `/api/health` 路徑(per Examples 第 5 列)

---

## 結論

5 個 entity 拍板:
- E1(front-nginx service in compose)
- E2(deploy/front-nginx/ 結構)
- E3(2 upstream + 3 location nginx config)
- E4(5 header forwarding)
- E5(HTTP request flow + 7 examples)

進 contracts/front-nginx-routing.md(C-F1~C-F8)+ quickstart.md(13 acceptance scenario)。
