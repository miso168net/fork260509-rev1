# Contract: W-F5 front-nginx 反向代理結構約束

**Phase 1 output** — 8 個 contract(C-F1 ~ C-F8):涵蓋 `deploy/front-nginx/` 結構、docker-compose service、nginx 3 location、2 upstream、5 header、healthcheck、network 邊界、`nginx -t` syntax 驗。

對齊 W-F1 C-D1~C-D7 / W-F3 C-C1~C-C11 / W-F4 C-S1~C-S9 風格(Subject + MUST / MAY / MUST NOT + Verification)。

---

## C-F1:`deploy/front-nginx/` 目錄結構

**Subject**:`deploy/front-nginx/` outer repo root 子目錄(new in W-F5)。

**MUST**:
- 含 `conf.d/default.conf`(主 nginx 配置、git-tracked)
- 含 `README.md`(操作說明:restart for config reload / W-F5 範疇邊界 / 下一步 W-F6 W-F7 提示)

**MUST NOT**:
- 不含 secret(per spec FR-025、front-nginx 純路由配置)
- 不含 `track-a.inc`(留 W-FA1)

**Verification**:`ls deploy/front-nginx/` → 至少 `conf.d/` + `README.md`;`ls deploy/front-nginx/conf.d/` → 至少 `default.conf`;`grep -r "ssl_certificate\|secret\|track-a" deploy/front-nginx/` → 0 命中。

---

## C-F2:`docker-compose.yml` front-nginx service

**Subject**:outer `docker-compose.yml` 加第 6 個 service `front-nginx`。

**MUST**:
- image `nginx:1.27-alpine`(對齊 W-F2)
- `volumes:` 段 mount `./deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro`(read-only)
- `depends_on:` long syntax 含 `base-web: condition: service_healthy` + `rust-api: condition: service_healthy`
- `networks: - internal`(per W-F3 既有 network)
- `healthcheck:` 用 `["CMD", "curl", "-f", "http://localhost/health"]`、interval / timeout / retries 與其他 service 同模式
- `restart: unless-stopped`
- `environment:` 含 `TZ: ${TZ:-Asia/Shanghai}`(對齊其他 service)

**MUST NOT**:
- 不含 `ports:` 段(per spec FR-021、留 W-F7)
- 不含 `secrets:` 段(per spec FR-025、不需 secret)
- 不含 `command:` / `entrypoint:` override(用 image default `nginx -g 'daemon off;'`)

**Verification**:`docker compose config | awk '/front-nginx:/,/^  [a-z]/'` → 命中 service 完整定義;`docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep ports` → 0 命中;`docker compose ps front-nginx`(stack up 後)→ `Up X minutes (healthy)`。

---

## C-F3:nginx config 2 upstream

**Subject**:`deploy/front-nginx/conf.d/default.conf` 內 upstream block。

**MUST**:
- 2 個 upstream block:
  - `upstream base_web { server base-web:8080; }`(對應 W-F2 image nginx listen)
  - `upstream rust_api { server rust-api:11081; keepalive 32; }`(對應 W-F1 image rust-api server port、含 keepalive per R-005)

**MUST NOT**:
- 不含 `upstream nestjs*`(留 W-FA1)
- 不含其他 upstream

**Verification**:`grep -c "^upstream " deploy/front-nginx/conf.d/default.conf` → 2;`grep -A 3 "upstream base_web" deploy/front-nginx/conf.d/default.conf` → 含 `base-web:8080`;`grep -A 3 "upstream rust_api" deploy/front-nginx/conf.d/default.conf` → 含 `rust-api:11081` + `keepalive 32`。

---

## C-F4:nginx config 3 location(priority 排序)

**Subject**:`default.conf` 內 `server { listen 80; }` 區塊內 3 個 location。

**MUST**:
- Priority 1:`location = /health { return 200 "ok"; add_header Content-Type text/plain; }`(exact match、front-nginx self healthcheck)
- Priority 2:`location /api/ { proxy_pass http://rust_api/; ... }`(prefix、**`http://rust_api/` 必含 trailing `/` 切前綴**;含 5 header + proxy_read_timeout)
- Priority 3:`location / { proxy_pass http://base_web; proxy_set_header Host $host; }`(prefix、**`http://base_web` 無 trailing slash 保留 path**)

**MUST NOT**:
- 不含 `listen 443 ssl`(留 W-F6)
- 不含 `return 301 https://...` HTTPS redirect(留 W-F6)
- 不含 regex location `~ /api`(per R-002 用 prefix simpler)

**Verification**:`grep -c "location " deploy/front-nginx/conf.d/default.conf` → 3;`grep "location = /health" deploy/front-nginx/conf.d/default.conf` → 1 行;`grep "proxy_pass http://rust_api/" deploy/front-nginx/conf.d/default.conf` → 1 行(注意 trailing `/`);`grep "proxy_pass http://base_web" deploy/front-nginx/conf.d/default.conf` → 1 行(無 trailing `/`)。

---

## C-F5:nginx config 5 header forwarding(/api/ location 內)

**Subject**:`default.conf` `location /api/` 內 5 個 `proxy_set_header`。

**MUST**:
- `proxy_set_header Host $host;`
- `proxy_set_header X-Real-IP $remote_addr;`
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
- `proxy_set_header X-Forwarded-Proto $scheme;`
- `proxy_set_header X-Request-ID $request_id;`
- `proxy_read_timeout 60s;`

**MAY**:
- `/` location 加 `Host` header(SPA serving 無需 X-Forwarded-*、可省;對齊 DESIGN-W §4.2 範例只在 `/api/` 加 X-*)

**Verification**:`grep -c "proxy_set_header" deploy/front-nginx/conf.d/default.conf` → 至少 6 行(5 in /api/ + 1 in /);`grep "X-Real-IP\|X-Forwarded-For\|X-Forwarded-Proto\|X-Request-ID" deploy/front-nginx/conf.d/default.conf | wc -l` → 至少 4。

---

## C-F6:`nginx -t` syntax 驗證

**Subject**:nginx config 合法性 — `nginx -t` 必須無 error。

**MUST**:
- `docker compose exec front-nginx nginx -t` 返:
  ```
  nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
  nginx: configuration file /etc/nginx/nginx.conf test is successful
  ```
- 無 syntax error / unknown directive / duplicate location 等問題

**Verification**:per SC-007 / FR-009;stack healthy 後執行。

---

## C-F7:Network 邊界(stack 內 only)

**Subject**:front-nginx 對外可達性(W-F5 範疇:**不**對外)。

**MUST**:
- front-nginx 只在 `internal` network 內可達(其他 service 可 `curl http://front-nginx/...`)
- container 內 nginx listen `80;`(隱含 0.0.0.0、container 內部 ipv4)

**MUST NOT**:
- 不在 compose `ports:` 段 expose 80 / 443 給 host(per spec FR-021、留 W-F7)
- 不從 host 機 `curl http://localhost:80` 可達 front-nginx(host port 留 W-F7)

**Verification**:`docker compose ps | grep front-nginx` → port section 應為 `80/tcp`(container only)、無 `0.0.0.0:80->80` host binding;`curl -m 3 http://localhost:80/` from host → connection refused / timeout(W-F7 前不可達)。

---

## C-F8:Service dependency + restart 策略

**Subject**:front-nginx 在 stack 生命週期內的依賴關係與重啟行為。

**MUST**:
- `depends_on:` 含 base-web + rust-api(各 `condition: service_healthy`)— cold start 期間先等 backend healthy、避免 502 風暴(per R-006)
- `restart: unless-stopped`(對齊其他 service)
- W-F3 既有 `migration` service 不在 front-nginx depends_on 內(migration 是 one-shot init container、與 front-nginx 無 runtime 依賴;migration 跑完 exit 0、與 rust-api `depends_on migration: service_completed_successfully` 串通即可)

**MAY**:
- 加 `links:` 顯式 link base-web + rust-api 用於 nginx config resolution — **不需要**:同 `networks:` 已提供 docker DNS resolution(W-F3 R-007 sticky)

**Verification**:`docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep -A 5 depends_on` → 含 base-web + rust-api、各 `condition: service_healthy`;清空 stack 起 + 用 `docker compose logs front-nginx --tail 20` → 開頭幾秒應顯 "starting" + nginx ready log、無 "upstream timeout" / "502" 訊息。

---

## 結論

8 個 contract 涵蓋 W-F5 所有改動的結構約束:
- C-F1 / C-F2:`deploy/front-nginx/` 結構 + docker-compose service 定義
- C-F3 / C-F4 / C-F5:nginx config 3 子段(upstream / location / header)
- C-F6:`nginx -t` syntax 驗證
- C-F7 / C-F8:network 邊界 + service dependency

acceptance scenarios(quickstart.md)分 5 個 Dimension(A-E)對應 spec.md 18 個 scenarios。
