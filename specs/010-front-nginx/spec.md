# Feature Specification: W-F5 — front-nginx 反向代理

**Feature Branch**: `010-front-nginx`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "W-F5 front-nginx — 反向代理 service:處理 /api → rust-api proxy_pass、SPA fallback 給 base-web、internal network 整合"

**Source**: 直接從 [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §4(反向代理 + TLS、W-F5 跳過 brainstorm 階段、DESIGN-W §4 為 authoritative source)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §4.1(front-nginx 角色)、§4.2(nginx config 結構 — 含 upstream + location 範例)、§4.4(Track DESIGN-B,W-F5 對應)、§11.1(W-F5 scope 描述)、§11.2(W-2 P2 依賴序)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(架構約束「對外流量 MUST 走 TLS」— W-F5 範疇內**不**對外、TLS 留 W-F6;Principle III 嚴版禁 Forward — nginx config 為 endpoint ownership 唯一權威、location 標 backend owner)
- [`specs/008-compose-base-structure/`](../008-compose-base-structure/)(W-F3,既有 5 service stack;W-F5 加第 6 個 service `front-nginx`)
- [`specs/006-dockerfile-rust-api/`](../006-dockerfile-rust-api/)(W-F1,rust-api `/health` route 在 root、`/auth/login` 等 endpoint 也在 root — **無 `/api/` 前綴**)
- [`specs/007-dockerfile-base-web/`](../007-dockerfile-base-web/)(W-F2,base-web nginx 配置 listen 8080、`/health` exact + assets cache + SPA fallback;**base-web 不 proxy `/api/*`** — 留 W-F5 範疇)
- [`docker-compose.yml`](../../docker-compose.yml)(W-F4 產出,W-F5 加 `front-nginx` service)

**Scope summary**:rev1 deploy Phase W **P2 第一個 feature**(per DESIGN-W §11.2 P2 解鎖 P1 後)— 新增 `front-nginx` service 作為 stack 內反向代理、解決 base-web SPA(`VITE_SERVICE_BASE_URL=/api`)與 rust-api(實際 mount `/auth/login` 等 root 路徑、無 `/api/` 前綴)之間的 URL prefix mismatch。新建 `deploy/front-nginx/conf.d/default.conf` 含 2 upstreams(`base_web` / `rust_api`)+ **3 location block**(`= /health` front-nginx self 返 200 ok / `/api/` proxy 帶 trailing `/` 切前綴 → rust-api / `/` proxy → base-web SPA);加 5 個 X-Forwarded-* header forwarding 給 rust audit log。**stack 只 listen container port 80、無 host port forwarding**(W-F7 範疇)、**無 TLS**(W-F6 範疇)、**無 acme.sh**(W-F6 範疇)、**無 Track DESIGN-A nestjs transitional block**(W-FA1 範疇)、**無 rate limiting**(留後續 feature)。完成後 stack 內可透過 `docker compose exec <any-service> curl http://front-nginx/...` 驗 routing 正確;**stack 仍對外不可達**(W-F7 還沒開 host port)。

## Clarifications

### Session 2026-05-16(spec-kit `/speckit-clarify` 階段拍板)

- Q: front-nginx healthcheck 用的 `/health` 來源(FR-015 plan-stage open)? → A: **Option A front-nginx 自身 `/health`** — `location = /health { return 200 "ok"; add_header Content-Type text/plain; }`,不透傳給 rust-api;對齊 W-F2 base-web 既有 self `/health` 模式、與 backend health 解耦、不依賴 rust-api alive、不增加 rust-api 額外負載

### Session 2026-05-16(spec-kit `/speckit-analyze` 階段 remediation 拍板)

- Q: spec 內多處 stale "2 location" / "可選 /health" / "4-5 header" / "13 acceptance scenario" / edge case open ref 不一致 → A: **採 analyze 報告建議全 4 項修**:
  - **I1**:多處 "2 location" 改 "3 location";scenario 3 改「至少 3 個 location 區塊」;`/health` 不再標「可選」(已 mandatory per clarify Q1)
  - **I2**:FR-016 "4-5 個 header forwarding" 改 "5 個"(對齊 data-model E4 + contracts C-F5 + tasks T023)
  - **I3**:Independent Test "13 個 acceptance scenario" 改「18 個 acceptance scenario 合併執行為 13 個 acceptance task」(對齊 W-F4 U2 修正模式)
  - **A1**:edge case `/api/` 純前綴 改「**不顯式 resolve、留 follow-up if proven issue**」(實務 SPA 不會發此 path);edge case "front-nginx 自己的 /health" 改「per clarify Q1 Option A 拍板、mandatory」

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 跑 stack、front-nginx 正確 demux `/api/` 與 `/`(Priority: P1,唯一 US)🎯 MVP

operator 在乾淨 docker host 上完成 W-F4 既有準備(`deploy/secrets/*.txt` 填值)+ `docker compose up -d`。stack 啟動 6 service(postgres + redis + migration exited 0 + rust-api + base-web + **front-nginx 新加**),front-nginx healthcheck pass、其他 5 service 對齊 W-F4 acceptance。

operator 從 docker network 內部跑驗證(per Constitution、W-F5 不開 host port):

1. **SPA 入口**:`docker compose exec rust-api curl -fsS http://front-nginx/` → 取得 base-web `index.html` 內容(SPA root)
2. **Static 資產**:`docker compose exec rust-api curl -fsS http://front-nginx/assets/index-<hash>.js` → 200 + 30d immutable cache header(W-F2 既有 nginx 行為穿透)
3. **API proxy `/api/auth/login`**:`docker compose exec rust-api curl -fsS -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://front-nginx/api/auth/login` → 200 + 含 token 的 login response;front-nginx 把 `/api/auth/login` 切前綴後轉發為 `rust-api:11081/auth/login`、rust-api 取得 client 真實 IP(透過 `X-Forwarded-For` header)寫入 sys_operation_log
4. **/health 透傳**:`docker compose exec rust-api curl -fsS http://front-nginx/api/health` → `ok`(rust-api root `/health` route);**或** `curl http://front-nginx/health` 由 front-nginx 自己提供(spec 階段拍板)
5. **SPA fallback**:`docker compose exec rust-api curl -fsS http://front-nginx/some-spa-route` → SPA fallback 返 `index.html`(client-side router 接管)

**Why this priority (P1,唯一 US,no further decomposition)**:

W-F5 6 個交付片段(`front-nginx` service in compose / `deploy/front-nginx/` 結構 / nginx config 主體 / 2 upstream / 3 location / header forwarding)**並非獨立可交付**:

- 單獨加 service 但無 nginx config → container 起不來
- 單獨寫 nginx config 但無 service → 沒地方 mount
- 單獨加 `/api/` proxy 但無 `/` proxy → base-web SPA 無法載入(只能打 API)
- 單獨加 `/` proxy 但無 `/api/` proxy → SPA 載入但 API 全 404
- 單獨加 upstream 但無 location → 配置不生效
- 單獨加 location 但無 header forwarding → rust audit log 拿不到真實 client IP

W-F5 是 **rev1 deploy Phase W P2 的開門 feature**;W-F1 + W-F2 image / W-F3 compose stack / W-F4 secret 安全性 / **W-F5 反向代理** 共組 prod-ready stack 的 routing 層基礎。完成後 **stack 內部 SPA + API 整合驗證 work**;對外可達仍待 W-F6(TLS)+ W-F7(host port forwarding)。

**Independent Test**:**18 個 acceptance scenario**(spec Dimension A-E)合併執行為 **13 個 acceptance task**(per [tasks.md](tasks.md) T030-T053,Dim A 3 scenario → 3 task / Dim B 4 scenario → 4 task / Dim C 3 scenario 由 T026-T028 stack verify task 涵蓋 / Dim D 6 scenario → 6 task / Dim E 2 scenario → 3 task)涵蓋 front-nginx service 加入 + nginx config 結構 + `/api/` proxy 切前綴 + `/` SPA proxy + header forwarding + W-F4 regression。需要的環境:乾淨 docker host + W-F1/W-F2/W-F4 image 已 build + W-F4 stack 模式做底 + `deploy/secrets/*.txt` 填值。

**Acceptance Scenarios**:

#### Dimension A — `deploy/front-nginx/` 配置結構(FR-001 ~ FR-003)

1. **Given** W-F5 implement 完成,**When** `ls deploy/front-nginx/`,**Then** 至少含 `conf.d/default.conf`(主配置檔)+ `README.md`(說明)
2. **Given** W-F5 完成,**When** `cat deploy/front-nginx/conf.d/default.conf | grep upstream`,**Then** 2 個 upstream block(`base_web` + `rust_api`)、各指對應 internal service host + port(`base-web:8080` + `rust-api:11081`)
3. **Given** W-F5 完成,**When** `cat deploy/front-nginx/conf.d/default.conf | grep -E "location (= /|/api/|/)"`,**Then** **至少 3 個** location 區塊(per `/speckit-clarify` Q1 拍板):`= /health` exact + `/api/` proxy 帶 trailing slash + `/` proxy

#### Dimension B — `docker-compose.yml` front-nginx 配置(FR-004 ~ FR-007)

4. **Given** docker-compose.yml W-F5 改動完成,**When** `docker compose config | grep -A 8 "front-nginx:"`,**Then** 命中 service 定義、image `nginx:1.27-alpine`、有 `depends_on` 段引用 base-web + rust-api、有 `networks: - internal`
5. **Given** docker-compose.yml,**When** `docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep -E "volumes|configs"`,**Then** 命中 `deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro` 樣式的 mount(把配置目錄掛進去)
6. **Given** docker-compose.yml,**When** `docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep ports`,**Then** **0 命中**(W-F5 嚴守不開 host port、留 W-F7)
7. **Given** docker-compose.yml,**When** 檢 front-nginx healthcheck,**Then** 命中 `curl -f http://localhost/health` 樣式 — 或同類驗 nginx alive 機制

#### Dimension C — stack 啟動 + service healthy(FR-008 ~ FR-010)

8. **Given** `deploy/secrets/*.txt` 已備 + `docker compose up -d` + sleep 60,**When** `docker compose ps`,**Then** **6 service** 全在(postgres + redis + migration exited 0 + rust-api + base-web + **front-nginx**)、4 long-running services healthy
9. **Given** stack healthy,**When** `docker compose exec front-nginx nginx -t`,**Then** `syntax is ok` + `test is successful`(nginx config 通過)
10. **Given** stack healthy,**When** `docker compose logs front-nginx --tail 10`,**Then** 含 nginx start log、無 error / panic / warn 級訊息

#### Dimension D — routing 行為(FR-011 ~ FR-016)

11. **Given** stack healthy,**When** `docker compose exec rust-api curl -fsS http://front-nginx/`,**Then** 取得 base-web `index.html`(`<title>` 或 SPA root 內容)、200 OK
12. **Given** stack healthy,**When** `docker compose exec rust-api curl -fsS -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://front-nginx/api/auth/login`,**Then** 200(rust-api 路徑切 `/api/` 後變 `/auth/login`、login handler 處理、返 token)
13. **Given** stack healthy,**When** `docker compose exec rust-api curl -fsS -o /dev/null -w "%{http_code}" http://front-nginx/api/nonexistent`,**Then** 404(透傳 rust-api 的 404、不被 nginx default page 攔)
14. **Given** stack healthy,**When** `docker compose exec rust-api curl -fsS http://front-nginx/some-spa-route`,**Then** 200 + 返 base-web `index.html`(SPA fallback、base-web 內部 nginx try_files 接管)
15. **Given** stack healthy,**When** `docker compose exec rust-api curl -fsS http://front-nginx/health`,**Then** 200 + body `ok`(front-nginx self `/health`、per clarify Q1 Option A;**不**透傳給 rust-api、與 rust-api 自身 `/health` 解耦)
16. **Given** stack healthy + rust-api logs,**When** 跑 scenario 12 的 login + 看 rust-api logs / audit log,**Then** rust-api 收到的 `X-Forwarded-For` / `X-Real-IP` header 含真實 client(docker network IP)、非 `front-nginx` 自身 IP

#### Dimension E — W-F4 regression + 整體相容(FR-017 ~ FR-018)

17. **Given** W-F5 升級完成,**When** 跑 W-F4 quickstart.md scenario 12-15 subset(stack healthy / env 不洩明文 / redis ps 不洩 / /health 通),**Then** 全 pass(W-F5 不破 W-F4 secret pattern)
18. **Given** stack down + 重 up + 跑 W-F3 regression subset(DNS / volume 持久),**Then** 全 pass(W-F5 不破既有 service 互連)

### Edge Cases

- **base-web 或 rust-api 任一 down**:front-nginx 仍然 starts(depends_on 是 `service_healthy` 等待),但若 backend 突然 down、front-nginx 接到 request 後 proxy 失敗 → 502 Bad Gateway。可接受、healthcheck 由 backend 自己抓
- **`/api/auth/login` 從 nginx 切前綴後得 `/auth/login`**:rust-api routing trailing slash 行為 — `proxy_pass http://rust_api/` 帶 trailing `/`、rust-api 端 axum 預設嚴格 routing(`/auth/login` 與 `/auth/login/` 不同),經驗證 rust-api `/auth/login` (no trailing) 對 — 不需 nginx rewrite
- **`/api/`(只 prefix、無後續 path)**:nginx `/api/` location match 後 proxy 到 `rust_api/` → rust-api 收到 `/`(root)→ 命中 W-F1 `/health` 路由、返 `ok`。**不顯式 resolve、留 follow-up if proven issue**(per `/speckit-analyze` A1 拍板):實務 SPA 不會發 `/api/` 純前綴 request、operator 也不應、edge case acceptance 偶遇返 `ok` 視為可接受(rust-api `/health` 本意 public route)
- **SPA route conflict 路徑**:若 SPA 有 route 名為 `/api`(理論可能),browser 走 `/api` 會被 nginx 命中 `/api/` location 而轉 rust-api;rev1 base-web 既有路由都在 `/login` / `/dashboard` 等、無 `/api`、安全
- **front-nginx 自己的 `/health`**:per `/speckit-clarify` Q1 Option A 拍板、**mandatory** — `location = /health { return 200 "ok"; add_header Content-Type text/plain; }`,front-nginx 自己直接答、不轉發給 rust-api。對齊 W-F2 base-web 既有 self `/health` 模式、healthcheck 與 backend health 解耦
- **WebSocket 升級**:DESIGN-W §4.2 未顯式提 WebSocket;rev1 暫無 WebSocket 需求(audit log + 一般 admin CRUD);若後續引入,需加 `proxy_set_header Upgrade $http_upgrade;` + `Connection upgrade`(W-F5 範疇外、留 follow-up)
- **upstream keepalive**:DESIGN-W §4.2 範例 `keepalive 32` for rust_api;base_web 無 keepalive 設定。W-F5 沿 DESIGN-W 樣式即可
- **長連線 / SSE**:rev1 暫無 SSE / streaming endpoint;`proxy_read_timeout 60s` 對一般 admin CRUD 足夠

## Requirements *(mandatory)*

### Functional Requirements

#### A. `deploy/front-nginx/` 配置結構

- **FR-001**: 新建 `deploy/front-nginx/` 目錄(outer repo root),含 `conf.d/default.conf`(主 nginx config 檔、git-tracked)+ `README.md`(操作說明、git-tracked)。配置目錄由 docker-compose mount 到 container `/etc/nginx/conf.d/` read-only
- **FR-002**: `conf.d/default.conf` MUST 定義 2 個 upstream block:
  - `upstream base_web { server base-web:8080; }`(對應 W-F2 image 內 nginx listen)
  - `upstream rust_api { server rust-api:11081; keepalive 32; }`(對應 W-F1 image rust-api server port、含 keepalive per DESIGN-W §4.2)
- **FR-003**: `conf.d/default.conf` MUST 定義 **3 個** location block(per `/speckit-clarify` Q1 Option A 拍板):
  - `location = /health { return 200 "ok"; add_header Content-Type text/plain; }`(**exact match 優先於 prefix `/`** — front-nginx 自身 healthcheck endpoint、不透傳;對齊 W-F2 base-web 模式)
  - `location /api/ { proxy_pass http://rust_api/; ...headers }`(**注意 trailing `/` — 把 `/api/` 前綴切掉、剩餘 path 給 rust-api**;per DESIGN-W §4.2)
  - `location / { proxy_pass http://base_web; ...headers }`(SPA + static 資產 — base-web 內部 nginx 處理 SPA fallback)

#### B. docker-compose.yml `front-nginx` service

- **FR-004**: docker-compose.yml 加新 service `front-nginx`,image `nginx:1.27-alpine`(對齊 W-F2 base-web 既有 nginx 版本、減少 image churn)
- **FR-005**: `front-nginx` service `volumes:` mount `./deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro`(read-only、operator 改 config 重啟 service 生效)
- **FR-006**: `front-nginx` service `depends_on:` 段引用 `base-web` 與 `rust-api`、用 `condition: service_healthy`(等兩 backend 都 healthy 才 start front-nginx,避免 cold start 期間 502)
- **FR-007**: `front-nginx` service **MUST NOT** 含 `ports:` 段(per W-F7 邊界、stack 對外不可達);**MUST 加** `networks: - internal`(per W-F3 network 結構);**MUST 加** `healthcheck:` 跑 `curl -f http://localhost/health` 或同類 + `restart: unless-stopped`

#### C. Stack 啟動 + service healthy

- **FR-008**: `docker compose up -d` + sleep 60 後,`docker compose ps` 顯示 **6 service**(W-F4 既有 5 + W-F5 加的 front-nginx)、4 long-running services 全 healthy
- **FR-009**: `docker compose exec front-nginx nginx -t` MUST 返 `syntax is ok` + `test is successful`(nginx config 合法)
- **FR-010**: `docker compose logs front-nginx` MUST 無 error / panic / fatal 級訊息;warn 級可接受(只要不阻斷服務)

#### D. Routing 行為

- **FR-011**: `curl http://front-nginx/` MUST 返 base-web `index.html`(200 OK + HTML content type)— 經由 `/` location 轉發到 `base_web` upstream → base-web 內部 nginx → static `index.html`
- **FR-012**: `curl -X POST http://front-nginx/api/auth/login` 帶 valid body MUST 經由 `/api/` location 切前綴 → 轉發 `rust_api/auth/login` → rust-api 處理 login → 200 + token response(per F5.1 既有行為)
- **FR-013**: `curl http://front-nginx/api/nonexistent` MUST 返 rust-api 自身 404(透傳),**不**返 nginx default 404 page
- **FR-014**: `curl http://front-nginx/some-spa-route`(非真實 file path)MUST 返 base-web `index.html`(SPA fallback;由 base-web 內部 nginx try_files 處理)
- **FR-015**: front-nginx **自身** `/health` endpoint MUST 返 200 + `ok`(per `/speckit-clarify` Q1 Option A 拍板):`location = /health { return 200 "ok"; add_header Content-Type text/plain; }`、不透傳給 rust-api;對齊 W-F2 base-web self `/health` 模式;優點:與 backend health 解耦、不依賴 rust-api alive、不增加 rust-api 負載。**注意 nginx location 解析優先序**:`exact = /health` 優於 `prefix /`,SPA `/` location 不會 match 到 `/health`;與 `prefix /api/` 也無衝突(不同前綴)
- **FR-016**: `/api/` location MUST 加 **5 個** header forwarding(per DESIGN-W §4.2、analyze I2 拍板):
  - `proxy_set_header Host $host;`
  - `proxy_set_header X-Real-IP $remote_addr;`
  - `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
  - `proxy_set_header X-Forwarded-Proto $scheme;`
  - `proxy_set_header X-Request-ID $request_id;`(W-F5 範圍內加、rust audit log 可用)

#### E. W-F4 regression + 相容性

- **FR-017**: W-F5 升級**不破壞** W-F4 既有 acceptance:跑 W-F4 quickstart.md scenario 12 / 13 / 15(stack healthy / env 不洩 / /health)應仍 pass
- **FR-018**: W-F5 升級**不破壞** W-F3 既有 service interconnection:DNS 解析 + volume 持久化 + service_healthy chain 維持

#### F. 範疇邊界保護

- **FR-019**: W-F5 **MUST NOT** 加 TLS(`listen 443 ssl`)/ HTTPS redirect(`return 301 https://...`)/ ssl_certificate(留 W-F6)
- **FR-020**: W-F5 **MUST NOT** 加 acme.sh service / Let's Encrypt cert volume(留 W-F6)
- **FR-021**: W-F5 **MUST NOT** 在 `front-nginx` service 加 `ports:` 段、不開 host port 80/443(留 W-F7)
- **FR-022**: W-F5 **MUST NOT** 加 Track DESIGN-A 的 `nestjs` upstream / `track-a.inc` / TRANSITIONAL block(留 W-FA1)
- **FR-023**: W-F5 **MUST NOT** 加 rate limiting / WAF / IP whitelist(留 follow-up;DESIGN-W §4.1 標「可選」)
- **FR-024**: W-F5 **MUST NOT** 動 W-F1 / W-F2 image 內部結構;**不**動 rust-api source code(W-F5 純配置 layer feature、不要求 rust source 改)
- **FR-025**: W-F5 **MUST NOT** 動 W-F4 secrets 機制(front-nginx 不需要任何 secret — 路由配置無敏感資訊)

### Key Entities *(include if data involved)*

- **`deploy/front-nginx/` directory**:outer repo root 新建子目錄、含 `conf.d/default.conf` + `README.md`
- **`front-nginx` service**:docker-compose.yml 新加第 6 個 service、image `nginx:1.27-alpine`、internal-only(無 host port)
- **2 upstreams**:`base_web`(指 `base-web:8080`)+ `rust_api`(指 `rust-api:11081` + keepalive 32)
- **3 location blocks**:`= /health`(exact、front-nginx self return 200 ok、per clarify Q1)+ `/api/`(proxy_pass 帶 trailing slash 切前綴 → rust-api)+ `/`(proxy_pass → base-web SPA)
- **Header forwarding**:`/api/` location 內 5 個 `proxy_set_header`(Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto / X-Request-ID)
- **HTTP request flow**:`<any container in internal> → front-nginx:80 → {base_web | rust_api}` — stack 內 SPA + API 同源 routing 完成

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在乾淨 docker host 上跑 `docker compose up -d` + sleep 60,**6 service 全 healthy**(W-F4 5 個 + W-F5 加 front-nginx),時間對齊 W-F4 SC-001(60-90 sec)
- **SC-002**: front-nginx 加入後 stack 啟動時間 overhead ≤ 5 sec(對 W-F4 baseline);startup latency 影響小於 cold-start 容忍度
- **SC-003**: stack 內透過 `curl http://front-nginx/`(SPA)+ `/api/auth/login`(API)兩種 routing 都通(200 OK + 預期 content),驗證 W-F5 核心價值「同源 SPA + API integration」
- **SC-004**: rust audit log 收到的 `client_ip` 為真實 client IP(非 front-nginx 自己 IP),透過 `X-Forwarded-For` header forwarding 機制
- **SC-005**: W-F5 不破壞 W-F4 acceptance — 跑 W-F4 quickstart.md 3 個 representative scenario(12 / 13 / 15)全 pass
- **SC-006**: 13 個 W-F5 acceptance scenario(Dimension A-E 對應 FR-001 ~ FR-018)100% pass
- **SC-007**: `docker compose exec front-nginx nginx -t` 通過(config syntax 正確)
- **SC-008**: Phase W deploy P2 第一個 feature 達成、解鎖後續 P2(W-F6 TLS 於 W-F5 既有 nginx server 加 443 listen + ssl;W-F7 對外 host port 給 front-nginx 加 `ports:` 80 / 443 → host 11080 / 11443)

## Assumptions

- **base-web 內部 nginx 已 listen 8080**:per W-F2 既有設計,base-web container 內 nginx config `server { listen 8080; ... }`、container EXPOSE 8080;W-F5 front-nginx upstream `base_web` 指此 port 即可。W-F2 既有 80/tcp 與 8080/tcp 都暴露但 only 8080 是 nginx server、80 沒用上
- **rust-api 已 listen 11081**:per W-F1 + W-F4,rust-api server `APP_SERVER_PORT=11081`、F5.1 等 endpoints 在 root path(`/auth/login` 等、無 `/api/` 前綴);**W-F5 front-nginx 透過 `proxy_pass http://rust_api/;` 帶 trailing slash 把 `/api/` 前綴透明切掉**
- **`/api/` 前綴是 nginx 層責任**:base-web SPA build-time `VITE_SERVICE_BASE_URL=/api`、browser 發 `/api/auth/login`;W-F5 front-nginx 切前綴後 rust-api 收到 `/auth/login`、handler 處理。**rust-api source 不動**(per FR-024;rev1 設計刻意把 `/api` 前綴責任放 nginx、rust-api routes 不帶前綴、利於後續微服務拆分)
- **`/api/` location 帶 trailing slash 切前綴**:nginx 文件已知行為 — `proxy_pass http://upstream/;` 帶 `/` → strip location prefix;`proxy_pass http://upstream;` 無 `/` → 保留 location prefix
- **base-web 內 nginx 不 proxy `/api/`**:per W-F2 spec FR-028 + plan FR-028,base-web 內部 nginx **明確不**處理 `/api/*`;W-F5 front-nginx 為唯一 `/api/*` 處理層
- **rust-api `/health` 在 root**(per W-F1、是 public route bypassing JWT middleware)**與 front-nginx 自身 `/health` 同 path 但不衝突**:per `/speckit-clarify` Q1 Option A,W-F5 front-nginx 自己提供 `location = /health` exact match、**不**透傳給 rust-api;nginx location 優先序確保 `exact = /health` > `prefix /api/` > `prefix /`,SPA / 與 /api/ 都不會 match 到 /health。rust-api 自身 `/health` 仍可被 `curl http://rust-api:11081/health` 直連存取(W-F4 既有 healthcheck 用此路徑)、與 front-nginx 解耦
- **front-nginx 不需 secret**:純路由配置、無 sensitive value;W-F4 secrets 機制 (`secrets: - <name>`) 不需引用
- **DESIGN-A Track 留 W-FA1**:track-a.inc + nestjs upstream + TRANSITIONAL block 不在 W-F5 範疇
- **TLS 留 W-F6**:`listen 443 ssl` + `ssl_certificate*` + HTTP→HTTPS redirect 不在 W-F5 範疇;W-F5 只 listen 80(內部 plain HTTP)
- **Host port 留 W-F7**:`ports:` 段不加;stack 對外仍不可達(W-F5 acceptance 透過 `docker compose exec` 內部驗)
- **base-web image 重 build 不必要**:W-F5 不動 W-F2 image / base-web nginx config / build-arg;只在 outer compose 與 nginx 配置層改
- **rust-api image 重 build 不必要**:W-F5 不動 W-F1 image / rust-api source(W-F4 image 已含 secret_loader 改動);front-nginx 純獨立 nginx container
- **linux/amd64 only**:per W-F1 Q2 inherit
- **依 CLAUDE.md §6.1 W-F5 走單段 commit**(只動 outer:compose / deploy/front-nginx/ / spec docs;**不**動 rust-api worktree / base-web worktree)
