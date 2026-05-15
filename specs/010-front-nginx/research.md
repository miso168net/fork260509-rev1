# Research: W-F5 — front-nginx 反向代理

**Phase 0 output** — 解 plan.md Technical Context 11 個 unknown / dependency / pattern 點。

對齊 W-F3 / W-F4 R-001~R-011 風格;3-line format (Decision / Rationale / Alternatives considered)。

---

## R-001:nginx `proxy_pass` trailing slash 切前綴行為

**Decision**:`location /api/ { proxy_pass http://rust_api/; }`(`http://rust_api/` 帶 trailing `/`)→ nginx 把 location 匹配的 `/api/` 前綴**切掉**、剩餘 path 傳給 upstream。`/api/auth/login` → `rust_api/auth/login`。

**Rationale**:
- nginx 官方文件明示此行為:`proxy_pass http://upstream/;` 帶 `/` → strip location prefix;`proxy_pass http://upstream;` 無 `/` → 保留 location prefix
- spec stage live test 已驗 — `POST /auth/login` 在 rust-api 回 200(login handler 路徑)、`POST /api/auth/login` 直連 rust-api 是 404(無此 route);front-nginx 切前綴後 rust-api 收到的是 `/auth/login`、命中 handler
- base-web SPA build-time `VITE_SERVICE_BASE_URL=/api` 與 rust-api routes 在 root path 的 mismatch 由此 nginx pattern 解決

**Alternatives considered**:
- (a) rust-api routes 改帶 `/api/` 前綴(`/api/auth/login` etc)— **拒**:per spec FR-024、Constitution Principle IV「base 不改動邊界」延伸 — rev1 設計把 `/api` 前綴責任放 nginx、rust-api routes 不帶前綴、利於後續微服務拆分(每個 service 自己有 root path、由 gateway aggregate)
- (b) base-web 改 `VITE_SERVICE_BASE_URL=""`(無前綴)— **拒**:base-web example fork 既有設計、Principle IV 禁改 base
- (c) nginx 不切前綴、`proxy_pass http://rust_api;` 無 trailing `/` → 保留 `/api/` 前綴給 rust-api → rust-api source 加 `/api/` prefix — **拒**:同 (a) — 違反設計意圖

---

## R-002:nginx location 優先序(`= exact` / prefix `/api/` / prefix `/`)

**Decision**:nginx location 解析優先序:
1. `= /path`(exact match、最高優先)
2. `^~ /path`(prefix 加 ^~ 跳過 regex、優於 regex)
3. `~ /pattern` 或 `~* /pattern`(regex、case-sensitive 或 insensitive)
4. `/path`(prefix、無修飾、最長 match wins)

W-F5 3 個 location:
- `location = /health` exact → 永遠優先
- `location /api/` prefix → match `/api/*`
- `location /` prefix → match all else(SPA fallback 含 static)

**Rationale**:
- exact `= /health` 確保 `curl http://front-nginx/health` 不被 SPA `/` location 攔到、不轉發給 base-web
- `/api/` prefix 比 `/` prefix 更長,nginx「最長 match wins」rule 確保 `/api/*` 走 rust-api、不走 base-web
- 三段邏輯不衝突、覆蓋完整

**Alternatives considered**:
- (a) 用 regex location `~ ^/api/` 取代 prefix — **拒**:regex 比 prefix 慢、無 functional 收益;DESIGN-W §4.2 範例用 prefix
- (b) `/health` 用 prefix `location /health` 而非 exact `= /health` — **可接受替代**:rev1 沒有 `/health/*` 子 path、prefix 效果同 exact;但 **exact 更明確、與 W-F2 base-web 一致**、選 exact

---

## R-003:`nginx:1.27-alpine` image 已 local cached

**Decision**:W-F5 service 引用 `nginx:1.27-alpine` — **不需單獨 build**,W-F2 base-web image runtime stage 已用同版本(`FROM nginx:1.27-alpine`),docker layer cache 已 pull。`docker image ls` 確認 `nginx:1.27-alpine` 已存。

**Rationale**:
- 統一 nginx 版本減少 stack 內 nginx 行為差異(base-web 內部 nginx + front-nginx 同版本、location/proxy 行為一致)
- 跨 service 共享 image layer cache、節省 disk 與 pull time
- 1.27 為 mainline、含 http/2 + 現代 directives,W-F6 加 TLS 直接支援

**Alternatives considered**:
- (a) 用 `nginx:1.27`(完整 debian-based image)— **拒**:image 大 ~10×、無功能收益;alpine 已含所需 modules
- (b) 用 `nginx:stable-alpine`(穩定線)— **拒**:版本不固定、與 W-F2 inconsistent;固定 1.27 reproducibility 高

---

## R-004:5 個 header forwarding(per DESIGN-W §4.2)

**Decision**:`/api/` location 內加 5 個 `proxy_set_header`:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-ID $request_id;
proxy_read_timeout 60s;
```

**Rationale**:
- Constitution Principle II 含 audit log「who / when / what entity」要求,rust 端 `client_ip` 從 `X-Forwarded-For` 取(W-F5 提供此 header forwarding);若無此 header,rust 看到的 `client_ip` 是 nginx 自己 docker network IP
- `X-Real-IP` + `X-Forwarded-For` 雙寫(前者 single IP、後者 chain)是 standard pattern
- `X-Forwarded-Proto` 為 W-F6 TLS 階段、rust 知道 client 用 https 還是 http(W-F5 純 http、為 W-F6 forward-compatible)
- `X-Request-ID` 用 `$request_id`(nginx 自動產生 unique ID)— per Constitution「結構化 log 必要欄位含 request_id」、log correlation 跨 service 需要
- `proxy_read_timeout 60s` 防止 rust-api 卡死時 nginx 永遠等

**Alternatives considered**:
- (a) 不加 X-Request-ID(由 rust-api 自己生)— **拒**:Constitution 要求 request_id 跨 service correlation、nginx 為 entry point 統一生較合理
- (b) 只加 X-Real-IP 不加 X-Forwarded-For — **拒**:後者是 web standard、未來若 W-F5 上面再加 CDN / reverse proxy 鏈、需要 chain 形式
- (c) 加 X-Original-URI 等更多 header — **拒**:over-engineering、無實際使用

---

## R-005:`upstream rust_api` 帶 `keepalive 32`

**Decision**:`upstream rust_api { server rust-api:11081; keepalive 32; }` — keepalive 32 為 nginx → rust-api 連線池大小、降低短連線 overhead。

**Rationale**:
- nginx → rust-api 高頻 API 路徑(每次 admin CRUD / login / route 取得都打)、TCP handshake overhead 累積
- keepalive 32 為 nginx workers × 32 連線(實際 = workers × 32);W-F5 single instance、worker 預設為 CPU count、約 32-128 連線足夠 admin-heavy 場景
- DESIGN-W §4.2 範例給此值、本 feature 沿用

**Alternatives considered**:
- (a) 不加 keepalive — **拒**:每 request 都重建 TCP、latency overhead 約 1ms per request、admin 場景累積
- (b) 加更大(如 128 / 256)— **拒**:rev1 流量不需要、占 rust-api 連線池資源(若 rust-api 設了 max_connections)、無實際收益

---

## R-006:`depends_on` 用 `condition: service_healthy`

**Decision**:`front-nginx` service `depends_on:` long syntax:
```yaml
depends_on:
  base-web:
    condition: service_healthy
  rust-api:
    condition: service_healthy
```
等兩 backend 都 healthy 才 start front-nginx,避免 cold start 期間 nginx 啟動先、backend 還沒 ready、收到 request 返 502。

**Rationale**:
- 對齊 W-F3 既有 rust-api depends_on migration/postgres/redis healthy 模式
- 對 operator 體驗:`docker compose up -d` 後一段時間沒收到 502、healthy 才放行
- compose v2+ 原生支援 long syntax(W-F3 R-007 sticky)

**Alternatives considered**:
- (a) `condition: service_started`(只等 container start、不等 healthy)— **拒**:start 不等於 ready,backend 還在初始化時 nginx 已啟、收 request 返 502 / 500
- (b) 不加 depends_on — **拒**:cold start 期間 502 風暴

---

## R-007:front-nginx 自身 healthcheck 機制

**Decision**:`healthcheck:` 跑 `curl -f http://localhost/health` 內 container;成功時 nginx self `/health` location 返 200 + `ok`(per clarify Q1 Option A)。

**Rationale**:
- alpine container 內 `localhost` 解析為 ipv4 / ipv6;nginx `listen 80;`(隱含 0.0.0.0)接 ipv4 OK
- `curl -f` 對 non-2xx exit code != 0、healthcheck 抓 fail
- 與 W-F2 / W-F4 既有 service healthcheck 模式對齊(curl /health 風格)

**Alternatives considered**:
- (a) 用 `wget --quiet --tries=1 --spider http://localhost/health` — **可接受替代**:alpine 內 wget 也有;curl 更通用、選 curl
- (b) 用 `nginx -t` 為 healthcheck — **拒**:`-t` 只驗 config syntax、不驗 nginx 是否真活著
- (c) tcp probe `nc -zv localhost 80` — **拒**:port listen 不等於 nginx healthy(可能 hang on response)

---

## R-008:nginx access log 預設 combined format(deferred 到 W-F12)

**Decision**:W-F5 **不**覆寫 nginx `log_format` directive、沿 `combined` 預設;`access.log` 寫 `/var/log/nginx/access.log`(container 內、可由 `docker compose logs front-nginx` 觀察)。

**Rationale**:
- Constitution 架構約束「nginx 統一 JSON 格式」嚴格說 W-F5 應改 log_format JSON
- 但 W-F12 引入 promtail + Loki 才需要 JSON log 餵 ingestion pipeline;此時 log_format 需要對配 promtail 預期 schema、避免 W-F5 + W-F12 重工
- W-F5 範疇:暫沿 combined、operator 已可 `docker compose logs` 看;Complexity Tracking 已記、W-F12 階段一起改

**Alternatives considered**:
- (a) W-F5 立刻改 JSON log_format — **拒**:per Complexity Tracking entry、避免與 W-F12 promtail 配置脫節
- (b) W-F5 改 main + access 雙寫(combined + JSON 並存)— **拒**:over-engineering、container disk overhead

---

## R-009:`proxy_pass http://rust_api;` vs `http://rust_api/;`(尾 `/` 差異)

**Decision**:W-F5 用 **`proxy_pass http://rust_api/;`**(帶 trailing `/`)→ 切 `/api/` 前綴。

**Rationale**:
- 同 R-001、R-001 已 confirm
- nginx 官方 documented behavior、無 surprise

**Alternatives considered**:
- (a) `proxy_pass http://rust_api;`(無 trailing `/`)→ 保留 `/api/` 前綴 → rust-api 收到 `/api/auth/login` → 404 — **拒**:rust-api routes 無 `/api/` 前綴

---

## R-010:`base_web` upstream 不加 `keepalive`

**Decision**:`upstream base_web { server base-web:8080; }` — 不加 keepalive directive。

**Rationale**:
- base-web 路徑是 static SPA + index.html、request 量比 API 路徑低(一次 SPA 載入 + 少量 assets fetch、之後 client-side router 接管)
- keepalive 對 base-web 邊際收益低、不加保持簡單

**Alternatives considered**:
- (a) 加 `keepalive 16` — **可接受替代**:無 downside、但無 demonstrated upside;簡化 vs over-spec、選不加
- (b) 加 `keepalive 32`(同 rust_api)— **拒**:不對稱 base-web vs rust-api 流量模式

---

## R-011:front-nginx 與 base-web 內部 nginx 共存無衝突

**Decision**:front-nginx(獨立 container、listen 80)+ base-web 內部 nginx(W-F2 image runtime stage、listen 8080)兩 nginx process 各司其職、不衝突。

**Rationale**:
- 不同 container、不同 namespace、不同 port — 隔離完整
- W-F2 base-web 內部 nginx 處理 static SPA + SPA fallback try_files(per W-F2 nginx.conf:34 既有);front-nginx 透過 upstream 把 `/` 轉發到 base-web:8080 → base-web 內部 nginx 接管 SPA serving
- 兩個 nginx **不**重複處理:base-web 內部 nginx 不 proxy `/api/`(W-F2 spec FR-028 明確、已 verified);front-nginx 不 serve static(`/` location 純 proxy_pass)

**Alternatives considered**:
- (a) 把 base-web SPA 直接 build 進 front-nginx image — **拒**:破壞 base-web image 獨立性、與 W-F2 設計脫節
- (b) 只用 base-web 內部 nginx、不用 front-nginx — **拒**:base-web 內部 nginx 不能 proxy `/api/`(W-F2 spec FR-028 明確)、且 base-web image 不應該知道 rust-api 存在(關注點分離);front-nginx 為 gateway 是正確抽象

---

## 結論

W-F5 設計沿 DESIGN-W §4.2 既有 config 範例 + 對齊 W-F3 既有 compose pattern + W-F2 既有 nginx 行為。**0 violation**(per plan.md Constitution Check)、1 partial(nginx log format JSON 留 W-F12、Complexity Tracking 記)。可進 Phase 1 (data-model + contracts + quickstart)。
