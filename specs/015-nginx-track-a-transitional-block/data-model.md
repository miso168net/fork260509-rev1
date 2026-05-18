# Data Model: W-FA2 — nginx-track-a-transitional-block

**Phase 1 output** | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

> W-FA2 為 nginx config 改動 feature、無業務 entity / DB schema / API 介面。本 data-model 列出 spec FR-* 描述的 **檔案層 entity**(nginx config block / doc edit)+ 結構契約。

---

## E-1:`default.conf` dev 80 server block TRANSITIONAL inline block

**Location**:`deploy/front-nginx/conf.d/default.conf` 內既有 `server { listen 80; ... }`(W-F5 + W-F6 落地)、在 `location /` SPA fallback **之前**(優先級需高於 `/api/`)加入。

**Structure**(per spec FR-001 + FR-003 ~ FR-008 + R-1):

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

**Required keys**:`location =` exact match path / resolver / set / proxy_pass / include snippets

**Insertion point**:在既有 `location /api/ { ... }` block **之後**(順序無影響因 exact match 優先級高、但放 `/api/` 旁邊有 grouping 易讀)、`location / { ... }` SPA fallback **之前**

**Cutover**:F14 階段 `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 整段刪 + 改 rust-api 補實作 `proxy_pass` 指 `rust_api/auth/refreshToken`(F13 範疇)

---

## E-2:`default.conf` dev 443 server block TRANSITIONAL inline block

**Location**:`deploy/front-nginx/conf.d/default.conf` 內既有 `server { listen 443 ssl; http2 on; ... }`(W-F6 落地)、同 E-1 規格(僅 server block 不同)。

**Structure**:同 E-1(完全 inline duplicate;per Q2 + 自然推論 不抽 snippet)

---

## E-3:`default.conf.prod` prod 443 server block TRANSITIONAL inline block

**Location**:`deploy/front-nginx/conf.d/default.conf.prod` 內既有 `server { listen 443 ssl; http2 on; ... }`(W-F6 prod 落地)、同 E-1 規格。

**Structure**:同 E-1(完全 inline duplicate)

**Note**:`default.conf.prod` 內 80 server block 只做 `return 301 https://$host$request_uri;` redirect + `/.well-known/acme-challenge/`(W-F6 既有),**不加** TRANSITIONAL block — refreshToken request 在 prod 被 redirect 到 443、走 443 server block 內 TRANSITIONAL 即可。

---

## E-4:`CLAUDE.md` §5.2.1 加 track-a refreshToken curl 範例

**Location**:`CLAUDE.md` §5.2.1「dev 啟動命令範例」、在第 4 個範例「DESIGN-A 路線 dev」(W-FA1 加的)**之後**接著加:

**Structure**(per spec FR-010):

```bash
# === DESIGN-A 路線 refreshToken 驗(W-FA2 落地後、需先 --profile track-a 啟 stack)===
# 驗 nginx routing 接通 nestjs(business 邏輯正確性留 F10)
curl -X POST -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid-test-token"}' \
  http://127.0.0.1:11080/api/auth/refreshToken | head -c 200
# 預期:不回 HTTP 404、回 nestjs ApiRes envelope shape(invalid token 會回 4xx code + msg、但 envelope shape 正確)
```

**Estimated LOC**:~6-8 行(含 comment + curl + 預期說明)

---

## E-5:`docs/INTEGRATION-CHECKLIST.md` Phase W-7 + Current Focus + 已完成里程碑

**Location**:`docs/INTEGRATION-CHECKLIST.md` 三段:

**1. Current Focus**(per spec FR-011):
```diff
- **Phase**:Phase W deploy P7 Track DESIGN-A 三件套(W-FA1 ✅、剩 W-FA2 + W-FA3)...
+ **Phase**:Phase W deploy P7 Track DESIGN-A 三件套(W-FA1 + W-FA2 ✅、剩 W-FA3)...
- **Active feature**:無(W-FA1 全完成、merge `b095d55` 已推 origin/rev1-admin-root)
+ **Active feature**:無(W-FA2 全完成、merge `<sha-pending>` 已推 origin/rev1-admin-root)
- **下一步**:W-FA2 nginx-track-a-transitional-block → F10 ...
+ **下一步**:F10 refresh-token-nestjs-bridge → W-FA3 cicd-nestjs-build-job;application 並行 F7 / F8 / F9 / W-F11 / W-F6b
```

**2. Phase W-7 deploy Roadmap 表 W-FA2 row**:
```diff
- | W-FA2 | `nginx-track-a-transitional-block` | — | — | — | — | — | 未啟 |
+ | W-FA2 | `nginx-track-a-transitional-block` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `<sha-pending>` + merge `<sha-pending>`、12/12 acceptance PASS)|
```

**3. 已完成里程碑**:加 W-FA2 條目(對齊 W-FA1 / F6 / W-F6 風格、後 commit 完成填 SHA)

**Estimated LOC**:~10 行

---

## Entity Summary

| # | Entity | Location | Type | LOC 估計 | 改動類型 |
|---|---|---|---|---|---|
| E-1 | TRANSITIONAL block(dev 80) | `default.conf` | nginx inline block | ~9 行 | 新增 |
| E-2 | TRANSITIONAL block(dev 443) | `default.conf` | nginx inline block | ~9 行 | 新增 |
| E-3 | TRANSITIONAL block(prod 443) | `default.conf.prod` | nginx inline block | ~9 行 | 新增 |
| E-4 | track-a curl 範例 | `CLAUDE.md` §5.2.1 | bash code block + comment | ~7 行 | 新增 |
| E-5 | Phase W-7 + Current Focus + milestone | `docs/INTEGRATION-CHECKLIST.md` | markdown text | ~10 行 | 改動 |

**Total**:5 個 entity、~44 行 LOC 改動(對齊 plan.md NFR-001 SHOULD ≤ 35 行 nginx + ~10 行 doc = ~45 行 預估)。

**無 application code entity、無 DB schema entity、無 API endpoint entity**(W-FA2 純 nginx + doc layer)。

---

## Validation Rules

| Rule | 描述 | 對應 FR |
|---|---|---|
| V-1 | E-1 / E-2 / E-3 marker comment 必含 `>>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點(per W-FA2) <<<<<` + `<<<<< TRANSITIONAL END >>>>>` | FR-003 |
| V-2 | E-1 / E-2 / E-3 location MUST 用 `=` exact match path `/api/auth/refreshToken` | FR-004 |
| V-3 | E-1 / E-2 / E-3 含 `resolver 127.0.0.11 valid=10s ipv6=off;` directive | FR-005 |
| V-4 | E-1 / E-2 / E-3 含 `set $nestjs_upstream "nestjs:9528";` directive | FR-006 |
| V-5 | E-1 / E-2 / E-3 含 `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;` directive | FR-007 |
| V-6 | E-1 / E-2 / E-3 含 `include /etc/nginx/snippets/proxy_headers.inc;` 沿用 W-F6 snippet | FR-008 |
| V-7 | E-3 只在 prod 443 server block(prod 80 redirect server 不加) | FR-002 |
| V-8 | 全 entity 改動為單段 outer commit | FR-009 |
| V-9 | 不引入新 docker compose override file | FR-014 |
| V-10 | 不引入新 nginx config file | FR-015 |
| V-11 | 不引入 nginx upstream block | FR-012 |
| V-12 | 三邊 source(base-web / rust-api / nestjs fork)零改動 | FR-013 |
