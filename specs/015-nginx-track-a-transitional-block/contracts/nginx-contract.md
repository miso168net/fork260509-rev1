# Contract: W-FA2 nginx config TRANSITIONAL block 契約

**Feature**: W-FA2 — nginx-track-a-transitional-block
**Contract type**: nginx config inline block interface
**Date**: 2026-05-18

> 本契約定義 W-FA2 對 `default.conf` / `default.conf.prod` 的改動規格。

---

## C-N1:TRANSITIONAL marker block 結構(全 3 處共用)

```nginx
    # >>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點(per W-FA2) <<<<<
    # 過渡期由 nestjs 補位 refreshToken;F13 rust 補實作後 F14 cutover 刪整段
    # 用 variable proxy_pass + resolver(127.0.0.11)讓 DNS 延遲到 request time
    # default profile / DESIGN-B 退場 nginx 仍可啟動 + nginx -t OK
    location = /api/auth/refreshToken {
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $nestjs_upstream "nestjs:9528";
        proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;
        include /etc/nginx/snippets/proxy_headers.inc;
    }
    # <<<<< TRANSITIONAL END >>>>>
```

**Required directives**(per spec FR-003 ~ FR-008):

| Directive | 用途 | 來源 |
|---|---|---|
| marker comment(BEGIN / END) | F14 cutover sed 機械刪除 anchor | FR-003 |
| `location = /api/auth/refreshToken` | exact match、優先級高於 `/api/` prefix | FR-004 |
| `resolver 127.0.0.11 valid=10s ipv6=off;` | Docker 內建 DNS、lazy 解析 + 10s cache + 跳過 AAAA | FR-005 / R-1 / R-2 |
| `set $nestjs_upstream "nestjs:9528";` | 觸發 variable proxy_pass、避 startup DNS | FR-006 / R-1 |
| `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;` | 對齊 nestjs GLOBAL_PREFIX `/v1` + container port 9528 | FR-007 / R-5 |
| `include /etc/nginx/snippets/proxy_headers.inc;` | 沿用 W-F6 共用 5 header + 60s timeout | FR-008 |

---

## C-N2:`default.conf` dev 80 server block 加入位置

**File**:`deploy/front-nginx/conf.d/default.conf`
**Insertion point**:既有 `server { listen 80; ... }` 內、`location /api/ { ... }` block **之後**、`location / { ... }` SPA fallback **之前**

**Reasoning**:
- nginx location matching 優先級 `=` exact > prefix,順序不影響語意 — 但放 `/api/` 旁邊有 grouping 易讀
- `location /` SPA fallback 是 catch-all、放在最後

---

## C-N3:`default.conf` dev 443 server block 加入位置

**File**:`deploy/front-nginx/conf.d/default.conf`
**Insertion point**:既有 `server { listen 443 ssl; http2 on; ... }` 內、與 C-N2 相同邏輯位置

---

## C-N4:`default.conf.prod` prod 443 server block 加入位置

**File**:`deploy/front-nginx/conf.d/default.conf.prod`
**Insertion point**:既有 `server { listen 443 ssl; http2 on; ... }` 內、與 C-N2 相同邏輯位置

**Note**:`default.conf.prod` 內 80 server block(`return 301 https://$host$request_uri;`)**不加** TRANSITIONAL block — refreshToken request 走 80 會被 redirect 到 443、443 server 內的 TRANSITIONAL 接住即可。

---

## C-N5:TRANSITIONAL block 不引入 upstream block

**契約**(per spec FR-012 + Q2 拍板):

W-FA2 全程使用 **variable proxy_pass + resolver lazy DNS** 設計、**MUST NOT** 加 nginx upstream block(如 `upstream nestjs_transitional { server nestjs:9528; keepalive 16; }`)。

**Reasoning**:
- upstream block 會 trigger nginx startup-time DNS resolution、default profile / DESIGN-B 退場下 `nestjs` hostname 不解析 → nginx 啟動 fail
- 失 keepalive 副作用對 refreshToken 低頻場景可接受(per A-006 + NFR-002)

---

## C-N6:不引入新 nginx config file / 不抽 snippet

**契約**(per spec FR-015 + 自然推論):

W-FA2 **MUST NOT** 創建新 nginx config file(如 `conf.d/track-a.inc`)。TRANSITIONAL block 3 處 **inline duplicate** 在 default.conf / default.conf.prod 內、各自 self-contained。

**Reasoning**:
- Q2 拍板「inline + variable proxy_pass」、不抽 snippet 避免 Q2 拍板的隱含取捨被反悔
- 3 處 inline 雖有 duplication(~27 LOC)但每個 server block self-contained、易於 mental model + sed 機械刪除

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-N1 | TRANSITIONAL marker block 結構(全 3 處共用) |
| C-N2 | dev 80 server block 加入位置 |
| C-N3 | dev 443 server block 加入位置 |
| C-N4 | prod 443 server block 加入位置 |
| C-N5 | 不引入 upstream block 紀律 |
| C-N6 | 不引入新 config file / 不抽 snippet 紀律 |

**6 個 nginx contract、涵蓋 W-FA2 對 nginx config 全部觸及點**。
