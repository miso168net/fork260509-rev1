# Phase 1 Data Model: W-F6 tls-cert-management

**Feature**: W-F6 — tls-cert-management
**Date**: 2026-05-18

> W-F6 為 deploy 層 TLS / 對外 port / cert lifecycle skeleton feature、無 DB entity。本檔以「**配置 entity**」描述 12 個觸及檔案 / volume / secret。

---

## E-1:`docker-compose.yml`(W-F7 既有檔、W-F6 改)

**Type**:Docker Compose YAML v2 主檔
**Location**:outer repo root
**W-F6 改動範圍**:加 `front_nginx_certs` named volume + acme service(profile=prod)+ `acme_email` secret + front-nginx cert volume mount(**不**加 ports — per Clarify Q1 Option A)

### 改動 schema

```yaml
services:
  front-nginx:
    # ... W-F5/W-F7 既有不動
    volumes:
      - ./deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro        # 既有
      - front_nginx_certs:/etc/nginx/certs:ro                   # ★ W-F6 新增

  acme:                                                          # ★ W-F6 新增整個 service
    image: neilpang/acme.sh:latest
    profiles: ["prod"]
    command: ["daemon"]                                          # daemon 模式;若 crash 改 sleep infinity(per R-6)
    volumes:
      - front_nginx_certs:/acme.sh
    environment:
      - ACME_EMAIL_FILE=/run/secrets/acme_email
    secrets:
      - acme_email
    restart: unless-stopped

volumes:
  postgres_data:        # 既有
  redis_data:           # 既有
  front_nginx_certs:    # ★ W-F6 新增

secrets:
  jwt_secret:           # 既有
  database_url:         # 既有
  redis_url:            # 既有
  postgres_password:    # 既有
  redis_password:       # 既有
  acme_email:           # ★ W-F6 新增
    file: ./deploy/secrets/acme_email.txt
```

### 不動範圍

- front-nginx **無 ports**(per Clarify Q1 + W-F7 FR-005)
- 主 compose 不加 host port
- W-F5 既有 nginx config mount 路徑不變
- 既有 5 secret 結構不變

---

## E-2:`docker-compose.dev.yml`(W-F7 既有檔、W-F6 改)

**Type**:Docker Compose YAML v2 dev override
**Location**:outer repo root
**W-F6 改動範圍**:加 dev-certs file mount(覆蓋 named volume)+ 加 `127.0.0.1:11443:443` ports entry(11080 既有 ports W-F7 已寫保留不動)

### W-F6 新增片段

```yaml
services:
  front-nginx:
    ports:
      # W-F7 既有:- "127.0.0.1:11080:80"
      - "127.0.0.1:11443:443"                                    # ★ W-F6 新增
    volumes:
      - ./deploy/dev-certs:/etc/nginx/certs:ro                   # ★ W-F6 新增(覆蓋 named volume per R-2)

  rust-api:                                                       # W-F7 既有不動
    ports:
      - "127.0.0.1:11081:11081"

  postgres:                                                       # W-F7 既有不動
    ports:
      - "127.0.0.1:15432:5432"

  redis:                                                          # W-F7 既有不動
    ports:
      - "127.0.0.1:16379:6379"
```

### W-F6 後 dev mode 行為

| 行為 | 描述 |
|---|---|
| host port binding | 5 個 entries:11080→80(127.0.0.1)、11443→443(127.0.0.1)、11081→11081、15432→5432、16379→6379 — 全 loopback only |
| cert source | host file `./deploy/dev-certs/*.pem`(per R-2 mount 覆蓋) |
| nginx config | main `default.conf`(80 serve + 443 ssl) |
| acme | **不啟動**(profile=prod 隔離) |

---

## E-3:`docker-compose.prod.yml`(W-F6 新建)

**Type**:Docker Compose YAML v2 prod override
**Location**:outer repo root
**W-F6 新建範圍**:override front-nginx mount `default.conf.prod` 替換 default.conf + 加 prod ports

### Schema

```yaml
# docker-compose.prod.yml — W-F6 prod override
# 用法:docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
# 對外 binding 0.0.0.0(prod 需 LAN/公網可達)、80 強制 redirect 443、443 ssl
# acme service 預設不啟、需加 --profile prod 才啟

services:
  front-nginx:
    ports:
      - "11080:80"                                               # 0.0.0.0:11080
      - "11443:443"                                              # 0.0.0.0:11443
    volumes:
      - ./deploy/front-nginx/conf.d/default.conf.prod:/etc/nginx/conf.d/default.conf:ro
      # ↑ 覆蓋主 compose default.conf mount(per R-2)
```

### W-F6 後 prod mode 行為

| 模式 | 命令 | 啟用 service | 80 行為 | cert 來源 |
|---|---|---|---|---|
| prod baseline | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait` | 6 service(無 acme)| 301 redirect 443 | named volume(空、需先 seed)|
| prod + acme | 同上 + `--profile prod` | 7 service(含 acme)| 同上 | acme.sh 自動 issue(W-F6b 落地後)|

---

## E-4:`deploy/front-nginx/conf.d/default.conf`(W-F5 既有、W-F6 改)

**Type**:nginx config(dev default)
**W-F6 改動範圍**:保留 W-F5 既有 80 server block(無 redirect)+ 加 443 ssl server block + 抽 snippet

### Schema

```nginx
# 既有(W-F5):
upstream base_web { server base-web:8080; }
upstream rust_api { server rust-api:11081; keepalive 32; }

# 既有 80 server block(W-F5 - dev serve 行為、W-F6 不動):
server {
    listen 80;
    server_name _;

    location = /health { return 200 "ok"; add_header Content-Type text/plain; }
    location /api/      { proxy_pass http://rust_api/; include /etc/nginx/snippets/proxy_headers.inc; }   # ★ W-F6 改用 snippet
    location /          { proxy_pass http://base_web; proxy_set_header Host $host; }
}

# ★ W-F6 新增整個 443 server block:
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

### 對 W-F5 既有的變動

- 80 server 內 `location /api/` 從**內聯 5 header** 改為 `include snippets/proxy_headers.inc`(DRY、per R-5)
- 80 server 其他 location 不動(`= /health` + `/`)
- 加整個 443 server block

---

## E-5:`deploy/front-nginx/conf.d/default.conf.prod`(W-F6 新建)

**Type**:nginx config(prod variant)
**W-F6 新建範圍**:80 server 改 redirect-only + 保留 `/.well-known/acme-challenge/` + 443 server 與 dev 一字不差

### Schema

```nginx
# default.conf.prod — W-F6 prod variant
# 用法:docker-compose.prod.yml mount 進 /etc/nginx/conf.d/default.conf

upstream base_web { server base-web:8080; }                       # 同 dev
upstream rust_api { server rust-api:11081; keepalive 32; }         # 同 dev

# 80 server(prod 強制 redirect、保 Let's Encrypt HTTP-01 challenge 路徑):
server {
    listen 80;
    server_name _;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;   # acme.sh HTTP-01 challenge 路徑;未來 W-F6b 配置時 acme container 寫入 / nginx serve
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# 443 server — 與 default.conf 443 段一字不差(per R-5 DRY 紀律)
server {
    listen 443 ssl;
    http2 on;
    # ... 與 default.conf 443 段完全相同(SSL config + 3 location + snippet)
}
```

### 對 default.conf 的 diff 規格

| 段 | 行數 diff | 內容差別 |
|---|---|---|
| upstream(2 行)| 0 | 一字不差 |
| 80 server | ~10 行 | dev: location = /health + /api/ + /;prod: location ^~ /.well-known/acme-challenge/ + location / return 301 |
| 443 server | 0 | 一字不差 — 透過 include snippets 保證 |

per SC-005:diff ≤ 15 行(估約 10 行)

---

## E-6:`deploy/front-nginx/snippets/proxy_headers.inc`(W-F6 新建)

**Type**:nginx config snippet
**W-F6 新建範圍**:5 個 proxy header + 1 個 timeout、80/443/dev/prod 共用

### Schema

```nginx
# proxy_headers.inc — W-F6 DRY snippet for /api/ proxy headers
# include by:default.conf + default.conf.prod、80 server + 443 server
# 5 個 X-Forwarded-* header 確保 rust audit log 取真實 client info

proxy_set_header Host                $host;
proxy_set_header X-Real-IP           $remote_addr;
proxy_set_header X-Forwarded-For     $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto   $scheme;
proxy_set_header X-Request-ID        $request_id;
proxy_read_timeout                   60s;
```

### 共用機制

- mount path:`/etc/nginx/snippets/proxy_headers.inc`(透過 `docker-compose.yml` front-nginx volume mount `./deploy/front-nginx/snippets:/etc/nginx/snippets:ro`)
- 引用點:default.conf 80/443 `location /api/` + default.conf.prod 443 `location /api/` 共 3 處
- 改一處全變:加 1 行 header 只需改 1 個檔

---

## E-7:`deploy/generate-dev-cert.sh`(W-F6 新建)

**Type**:POSIX shell script
**W-F6 新建範圍**:openssl 一條命令自簽 cert 生成、輸出至 `deploy/dev-certs/`

### Schema(對齊 spec FR-006)

```bash
#!/bin/sh
# Generate dev self-signed cert for front-nginx HTTPS(W-F6)
# Usage:  bash deploy/generate-dev-cert.sh
# Output: deploy/dev-certs/{fullchain,privkey}.pem
# Trust:  瀏覽器第一次訪 https://127.0.0.1:11443 會 warning、可選 import fullchain.pem 進系統信任

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/dev-certs"
mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$CERT_DIR/privkey.pem" \
  -out    "$CERT_DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$CERT_DIR/privkey.pem"
chmod 644 "$CERT_DIR/fullchain.pem"

echo "✓ Dev cert generated at $CERT_DIR/"
echo "  - fullchain.pem(public、可 import 進 browser/system trust store)"
echo "  - privkey.pem(只在本機 dev、勿 commit)"
echo ""
echo "驗:openssl x509 -in $CERT_DIR/fullchain.pem -noout -ext subjectAltName"
```

### 行為

| 行為 | 描述 |
|---|---|
| 冪等 | 重跑會覆蓋 cert、不報錯 |
| validity | 365 天 |
| key | RSA 4096(unencrypted、`-nodes`) |
| SAN | `DNS:localhost, IP:127.0.0.1`(per FR-006 + SC-004) |
| permissions | privkey 600、fullchain 644 |

---

## E-8:`deploy/dev-certs/`(W-F6 新建 dir + tracked README.md)

**Type**:Local cert storage dir
**Git status**:dir 含 tracked `README.md` 佔位、`*.pem` 由 `.gitignore` 排除

### README.md schema

```markdown
# dev-certs/

W-F6 dev 自簽 cert 存放位置。

## 操作

```bash
bash ../generate-dev-cert.sh
ls -la *.pem
# fullchain.pem(public、644)
# privkey.pem(private、600、勿 commit)
```

## 對應 mount

docker-compose.dev.yml:
```yaml
services:
  front-nginx:
    volumes:
      - ./deploy/dev-certs:/etc/nginx/certs:ro
```

## 範疇

- 本目錄存放**dev / staging 自簽 cert only**
- prod cert 由 acme.sh 寫進 named volume `front_nginx_certs`(W-F6b 落地)
- *.pem gitignored、operator 個人本機儲存
```

---

## E-9:`deploy/secrets/acme_email.txt.example`(W-F6 新建)

**Type**:Secret template(per W-F4 mode)
**Git status**:tracked、operator cp 為 `acme_email.txt`(gitignored)後填值

### Schema

```text
# acme_email.txt.example — W-F6 acme.sh email(per W-F4 secret pattern)
# Usage:
#   cp acme_email.txt.example acme_email.txt
#   編輯 acme_email.txt 填真實 email
# Used by:
#   - acme.sh `--register-account` 到期通知 + abuse contact
#   - Let's Encrypt CA 連絡郵箱
# 範疇:prod 啟動 (--profile prod) 前必填;dev 不需

admin@example.com
```

---

## E-10:`.gitignore`(改、既有檔)

**W-F6 改動範圍**:加 2 條排除規則

### Schema(預期 inline 加在 secrets 相關段)

```
# 既有(W-F4):
deploy/secrets/*.txt
!deploy/secrets/*.txt.example

# ★ W-F6 新增:
deploy/dev-certs/*.pem
```

> `deploy/secrets/*.txt` 已涵蓋 `acme_email.txt`(W-F6 不需另加)。

---

## E-11:`CLAUDE.md` §5.2 + §5.2.1(改、既有檔)

**W-F6 改動範圍**:更新「目前現況」+ 擴充「dev 啟動命令範例」段

### 改動 1:「目前現況」段

Before(W-F7 落地後):
```
**目前現況**(W-F7 落地、dev 4 port 已暴露、prod 維持 internal-only):
...
```

After(W-F6 落地):
```
**目前現況**(W-F6 + W-F7 落地、TLS 結構就位、3 種啟動模式):
- **dev**:127.0.0.1 loopback、HTTP `:11080` + HTTPS `:11443`(自簽 cert)+ 直連 backend port
- **prod baseline**:0.0.0.0 對外、80 強制 redirect 443、acme 不啟(需先 seed cert)
- **prod + acme**:同 prod baseline + acme.sh skeleton(實際 cert acquisition 留 W-F6b)
```

### 改動 2:§5.2.1 啟動命令範例

加 3 個段(dev / prod baseline / prod + acme)+ HTTPS 驗證命令 + cert 生成步驟

---

## E-12:`docs/INTEGRATION-CHECKLIST.md`(改、既有檔)

**W-F6 改動範圍**:Current Focus 進度 3/4 + Roadmap W-F6 row ✅ + 已完成里程碑加 W-F6 條目

---

## 跨 entity 關係

```
E-1 主 compose ──[volume]──> E-? (front_nginx_certs named volume)
                ──[secret]──> E-9 acme_email.txt.example
                ──[acme]──>  (neilpang/acme.sh image)
                ──[mount]──> E-4 default.conf

E-2 dev.yml ──[mount override]──> E-? (dev-certs dir → cert volume)
            ──[ports add]──> "127.0.0.1:11443:443"

E-3 prod.yml ──[mount override]──> E-5 default.conf.prod (replaces default.conf)
             ──[ports add]──> "0.0.0.0:11080,11443"

E-4 default.conf ──[include]──> E-6 proxy_headers.inc
E-5 default.conf.prod ──[include]──> E-6 proxy_headers.inc

E-7 generate-dev-cert.sh ──[output]──> deploy/dev-certs/{fullchain,privkey}.pem
                                       ↑ E-2 mount source
```

**強耦合**:12 個 entity 同一 commit 中變動(per FR-018 單段 commit + Constitution「兩段式 commit」對應「W-F7 + W-F6 純 outer = 單段」)

---

**Phase 1 data-model 完成、contracts + quickstart 啟動條件滿足**。
