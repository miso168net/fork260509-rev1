# Contract: nginx config 結構(W-F6)

**Feature**: W-F6 tls-cert-management
**Contract type**: nginx configuration interface
**Date**: 2026-05-18

> 本契約定義 `default.conf`(dev)+ `default.conf.prod`(prod)+ `proxy_headers.inc`(snippet)的結構、行為、差異不變式。

---

## C-N1:upstream 區塊(dev/prod 一字不差)

**Contract**:兩份 config 開頭 `upstream` 區塊**完全相同**(W-F5 既有不動):

```nginx
upstream base_web { server base-web:8080; }
upstream rust_api { server rust-api:11081; keepalive 32; }
```

**Verification**:
```bash
diff <(sed -n '/^upstream/,/^}/p' deploy/front-nginx/conf.d/default.conf) \
     <(sed -n '/^upstream/,/^}/p' deploy/front-nginx/conf.d/default.conf.prod)
# 預期:無輸出(完全相同)
```

---

## C-N2:dev `default.conf` 80 server block 行為(serve)

**Contract**:80 server 含 3 個 location,實際 serve(W-F7 既有 HTTP 流程不破):

```nginx
server {
    listen 80;
    server_name _;

    location = /health { return 200 "ok"; add_header Content-Type text/plain; }
    location /api/      { proxy_pass http://rust_api/; include /etc/nginx/snippets/proxy_headers.inc; }
    location /          { proxy_pass http://base_web; proxy_set_header Host $host; }
}
```

**MUST NOT 含**:
- `return 301 https://...`
- redirect 邏輯

**Verification**:
```bash
grep -A 10 "^server {" deploy/front-nginx/conf.d/default.conf | head -10 | grep "return 301"
# 預期無輸出(dev 80 server 不應含 redirect)
```

---

## C-N3:prod `default.conf.prod` 80 server block 行為(redirect + acme-challenge 例外)

**Contract**:80 server 強制 301 redirect 443、但保留 `/.well-known/acme-challenge/` 例外 serve:

```nginx
server {
    listen 80;
    server_name _;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

**MUST 含**:
- `location ^~ /.well-known/acme-challenge/`(prefix `^~` 確保優先級高於 `location /`)
- `return 301 https://$host$request_uri;`

**MUST NOT 含**:
- 一般 `location /api/`、`location = /health`(由 443 server 處理)

**Verification**:
```bash
grep -c "return 301 https" deploy/front-nginx/conf.d/default.conf.prod
# 預期 ≥ 1

grep "location ^~ /.well-known/acme-challenge/" deploy/front-nginx/conf.d/default.conf.prod
# 預期命中
```

---

## C-N4:443 ssl server block(dev/prod 一字不差)

**Contract**:兩份 config 的 443 server **完全相同**(實作 DRY、per R-5 + SC-005)。

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name _;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    location = /health { return 200 "ok"; add_header Content-Type text/plain; }
    location /api/      { proxy_pass http://rust_api/; include /etc/nginx/snippets/proxy_headers.inc; }
    location /          { proxy_pass http://base_web; proxy_set_header Host $host; }
}
```

**Verification**(per SC-005 — 443 段 diff = 0):
```bash
# extract 443 server from each(基於 listen 443 ssl 起到下一 server 或 EOF)
extract_443 () {
  awk '/^server \{/,/^}/' "$1" | awk '/listen 443/{flag=1} flag; /^}/{if(flag){flag=0; print "---END---"}}'
}
diff <(extract_443 deploy/front-nginx/conf.d/default.conf) \
     <(extract_443 deploy/front-nginx/conf.d/default.conf.prod)
# 預期:無輸出(443 段一字不差)
```

或更簡單:
```bash
# 兩份 config 443 server 開始行直接 grep + diff
grep -A 30 "listen 443 ssl" deploy/front-nginx/conf.d/default.conf > /tmp/443-dev.txt
grep -A 30 "listen 443 ssl" deploy/front-nginx/conf.d/default.conf.prod > /tmp/443-prod.txt
diff /tmp/443-dev.txt /tmp/443-prod.txt
# 預期:無輸出
```

---

## C-N5:`http2 on;` directive(nginx ≥ 1.25 寫法)

**Contract**:443 server 必用 `listen 443 ssl;` + `http2 on;`(分兩行),**不可**用 deprecated `listen 443 ssl http2;`。

**Verification**:
```bash
grep "listen 443 ssl http2" deploy/front-nginx/conf.d/default.conf deploy/front-nginx/conf.d/default.conf.prod
# 預期:無輸出(deprecated 寫法不該出現)

grep "http2 on;" deploy/front-nginx/conf.d/default.conf deploy/front-nginx/conf.d/default.conf.prod
# 預期:兩個檔各 ≥ 1 行命中
```

---

## C-N6:ssl_protocols 限 TLSv1.2 + TLSv1.3

**Contract**:443 server `ssl_protocols TLSv1.2 TLSv1.3;` —禁用 TLS 1.0 / 1.1(Constitution「對外流量 MUST 走 TLS」現代基線)。

**Verification**:
```bash
grep "ssl_protocols" deploy/front-nginx/conf.d/default.conf
# 預期:"ssl_protocols TLSv1.2 TLSv1.3;"

grep -E "ssl_protocols.*(TLSv1\.0|TLSv1\.1|SSLv)" deploy/front-nginx/conf.d/default.conf*
# 預期:無輸出(不可含舊版 protocol)
```

---

## C-N7:snippet include(`/etc/nginx/snippets/proxy_headers.inc`)

**Contract**:`/api/` location 用 `include /etc/nginx/snippets/proxy_headers.inc;` 載入 5 個 header + timeout,**不**內聯重複寫。

**Verification**(per data-model E6 共用機制):
```bash
grep -c "include /etc/nginx/snippets/proxy_headers.inc" deploy/front-nginx/conf.d/default.conf
# 預期 ≥ 2(80 server + 443 server 各 1)

grep -c "include /etc/nginx/snippets/proxy_headers.inc" deploy/front-nginx/conf.d/default.conf.prod
# 預期 ≥ 1(443 server)

# snippet 檔本身存在
test -f deploy/front-nginx/snippets/proxy_headers.inc && echo "OK"
```

---

## C-N8:snippet 內容 — 5 header + timeout(per FR-010)

**Contract**:`proxy_headers.inc` 內容固定 6 行(5 header + 1 timeout):

```nginx
proxy_set_header Host                $host;
proxy_set_header X-Real-IP           $remote_addr;
proxy_set_header X-Forwarded-For     $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto   $scheme;
proxy_set_header X-Request-ID        $request_id;
proxy_read_timeout                   60s;
```

**Verification**:
```bash
# 5 header
grep -c "proxy_set_header" deploy/front-nginx/snippets/proxy_headers.inc
# 預期:5

# 1 timeout
grep -c "proxy_read_timeout" deploy/front-nginx/snippets/proxy_headers.inc
# 預期:1
```

---

## C-N9:nginx -t syntax 驗

**Contract**:兩份 config 透過 nginx -t syntax check,無 error / warning。

**Verification**(dev mode):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec front-nginx nginx -t
# 預期:nginx: the configuration file ... syntax is ok
#       nginx: configuration file ... test is successful
#       no deprecated warning(per C-N5)
```

prod mode 同上 + 多一行 default.conf 路徑 → default.conf.prod 內容:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
docker compose exec front-nginx nginx -t
# 預期同上
```

---

## Contracts 數量

| Contract | 規範範疇 | 驗證點 |
|---|---|---|
| C-N1 | upstream 區塊一字不差 | dev/prod diff = 0 |
| C-N2 | dev 80 server serve(無 redirect)| W-F7 既有不破 |
| C-N3 | prod 80 server redirect(+ acme exception)| Constitution TLS 紀律 |
| C-N4 | 443 server dev/prod 一字不差 | DRY / SC-005 |
| C-N5 | `http2 on;` 寫法(非 deprecated)| nginx 1.27 best practice |
| C-N6 | ssl_protocols 限現代 | 安全 baseline |
| C-N7 | snippet include(80+443 / dev/prod)| C-N8 共用 |
| C-N8 | snippet 內容 5 header + timeout | FR-010 |
| C-N9 | nginx -t syntax pass | implement validation |

**9 個 nginx config contract、3 個 config 檔(default.conf / default.conf.prod / proxy_headers.inc)100% 涵蓋**。
