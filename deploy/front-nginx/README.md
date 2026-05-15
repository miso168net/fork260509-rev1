# `deploy/front-nginx/` — 反向代理 + SPA gateway(W-F5)

per [`specs/010-front-nginx/`](../../specs/010-front-nginx/) 設計、[`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §4。

stack 內第 6 個 service、解決 base-web SPA(`VITE_SERVICE_BASE_URL=/api`)與 rust-api(routes 在 root path、無 `/api/` 前綴)之間的 URL prefix mismatch。

## 結構

```
deploy/front-nginx/
├── README.md                    ← 本檔
└── conf.d/
    └── default.conf             ← 主 nginx 配置(2 upstream + 3 location + 5 header)
```

`conf.d/` 由 docker-compose mount 到 container `/etc/nginx/conf.d/` read-only。

## 設計概覽

### 2 upstream

| name | target | 備註 |
|---|---|---|
| `base_web` | `base-web:8080` | 對齊 W-F2 image 內部 nginx listen |
| `rust_api` | `rust-api:11081` | 對齊 W-F1 image rust-api server port、加 `keepalive 32` |

### 3 location(per `/speckit-clarify` Q1 Option A)

| priority | match | behavior |
|---|---|---|
| 1 | `= /health` | exact、front-nginx 自身返 `ok`、**不**透傳給 rust-api(與 backend health 解耦) |
| 2 | `/api/` | prefix、`proxy_pass http://rust_api/` **trailing `/` 切前綴**(`/api/auth/login` → rust-api `/auth/login`)+ 5 個 X-Forwarded-* header |
| 3 | `/` | prefix、`proxy_pass http://base_web` 保留 path、base-web 內部 nginx 處理 SPA fallback |

nginx location 優先序確保 `exact = /health` > `prefix /api/` > `prefix /`、3 段互不衝突。

### 5 header forwarding(只在 `/api/` location)

- `Host` / `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Request-ID`
- 給 rust audit log 寫真實 client IP(非 nginx 自身 IP)

## 操作流程

### 修改配置後 reload

```bash
# 編輯 deploy/front-nginx/conf.d/default.conf
docker compose restart front-nginx              # 簡單方式:整 container 重啟
# 或
docker compose exec front-nginx nginx -s reload # graceful reload、無 downtime
```

### syntax 驗

```bash
docker compose exec front-nginx nginx -t
# 預期:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### routing 驗(stack 內 only;W-F7 前對外不可達)

```bash
# SPA root → base-web index.html
docker compose exec rust-api curl -fsS http://front-nginx/ | head -5

# API login → rust-api(切前綴後 /auth/login)
docker compose exec rust-api curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://front-nginx/api/auth/login

# front-nginx 自身 health
docker compose exec rust-api curl -fsS http://front-nginx/health
# 預期:ok
```

## 範疇邊界

W-F5 **嚴守邊界**、以下**不在範疇**:

- **TLS / HTTPS**:留 W-F6(加 `listen 443 ssl` + ssl_certificate + HTTP→HTTPS redirect)
- **對外 host port**:留 W-F7(`ports: - "11080:80"` + `"11443:443"`)
- **rate limiting / WAF / IP whitelist**:留後續 follow-up(DESIGN-W §4.1 標「可選」)
- **Track DESIGN-A nestjs upstream / `track-a.inc` / TRANSITIONAL block**:留 W-FA1
- **WebSocket 升級**:rev1 暫無需求、留 follow-up if proven need
- **nginx access log JSON 格式**:留 W-F12 observability stack 階段一起改(配對 promtail / Loki expected schema)

## 下一步

完成 W-F5 後解鎖:

- **W-F6 TLS**:於 W-F5 既有 nginx server 加 `listen 443 ssl;` + `ssl_certificate*` + HTTP→HTTPS redirect
- **W-F7 對外 host port**:給 `front-nginx` service 加 `ports: - "11080:80" - "11443:443"`(W-F6 之後)
