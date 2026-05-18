# Research: W-FA2 — nginx-track-a-transitional-block

**Phase 0 output** | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

> 本 phase 0 解析 spec 與 plan 階段提到的 implementation-time research question(R-#)。spec 階段 0 NEEDS CLARIFICATION marker、plan 階段亦無新 OQ;本檔記錄 brainstorm 階段已落、需在 implement 前再次驗證的技術 reference。

---

## R-1:variable proxy_pass + resolver lazy DNS 設計細節

**問題**:nginx config 用 `set $var "host:port"; proxy_pass http://$var/path;` 的變數式 proxy_pass — 是否真的延遲 DNS lookup 到 request 時?nginx -t 是否仍通?

**Research**:
- nginx 原生 `upstream { server <host>:<port>; }` block 在 nginx **startup 階段** resolve hostname(透過 `/etc/resolv.conf` 或 `resolver` directive)— 若 hostname 不解析,nginx 啟動 fail or `nginx -t` 報 `host not found in upstream`
- `proxy_pass http://$variable/path;`(變數值)觸發 **lazy resolution** — DNS lookup 延遲到每次 request、需配 `resolver` directive 指明 DNS 來源、否則報 `no resolver defined to resolve <host>`
- Docker compose v2 內建 DNS server bind 在 `127.0.0.11`(internal network 內所有 service 都透此解析、不需 host /etc/resolv.conf)
- `resolver 127.0.0.11 valid=10s ipv6=off;`:
  - `valid=10s`:cache TTL 10s,nestjs container 重啟改 IP 後 nginx 最多 10s 自動 re-resolve、無需手動 reload
  - `ipv6=off`:避免 AAAA query 延遲(Docker 內建 DNS 僅 IPv4)

**Decision**:用 `resolver 127.0.0.11 valid=10s ipv6=off;` + `set $nestjs_upstream "nestjs:9528";` + `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;` 三件套。

**Rationale**:
- nginx -t startup-time DNS resolution 在 default profile(nestjs 不啟)下會 fail、不符 FR-017「default profile 仍能正常啟動 6 service healthy + nginx -t OK」
- variable proxy_pass + resolver 解此問題、副作用是失 upstream keepalive、但 refreshToken 是低頻 endpoint(per A-006、~每小時 1 次/user)、影響可忽略
- 此模式為 nginx + docker 整合的標準做法、線上文檔大量先例

**Alternatives considered**:
- A1:upstream block + server `nestjs:9528;` + 手動 cutover — startup-time DNS,在 default profile 啟動 fail。**拒絕**(per Q2 拍板)。
- A2:用 `try_files` + fallback to rust-api、避免 502 — 增加 nginx 邏輯複雜度、且 fallback 行為 ambiguous(rust-api 無此 endpoint、會回 404 與 nestjs ApiRes envelope shape 不一致)。**拒絕**(不在 Q2 拍板範圍)。
- A3:nginx Dockerfile entrypoint 用 envsubst 動態決定 upstream(profile-aware include)— 引入 image-level conditional、operator UX 變重。**拒絕**(per Q2 拍板)。

---

## R-2:Docker compose v2 內建 DNS resolver `127.0.0.11` 在 rev1 internal network 內可用性

**問題**:rev1 既有 `internal` network 是 docker-compose 自動建的 bridge network(per W-F3 既有)— internal 內每個 container 是否都能透過 `127.0.0.11` resolver 解 service hostname?

**Research**:
- Docker compose v2 + default bridge network 自動內建 embedded DNS server bind 在 `127.0.0.11`(per Docker 官方文檔)
- 所有 service 在 internal network 內可解 hostname:`postgres` / `redis` / `rust-api` / `base-web` / `front-nginx` / `nestjs` / `migration`
- 即使 service 未啟(如 profile-filtered),hostname 仍 reserved 在 docker DNS — query 會回 NXDOMAIN(per Docker 行為);variable proxy_pass + resolver 在 request 時收到 NXDOMAIN → nginx 回 502

**Decision**:沿用 docker 內建 resolver `127.0.0.11`(已驗在 W-F1 ~ W-FA1 任何 service 都可解 hostname)。

**Rationale**:
- 對齊 W-F3 既有 `internal` network 配置、不需新 config
- W-FA1 落地後 `nestjs` hostname 在 track-a profile 啟動時可被任何 stack 內 service 解
- 用 `valid=10s` 控 cache、無需 manual nginx reload

**Alternatives considered**:
- B1:用 host machine `/etc/resolv.conf` 預設 resolver — Docker 內 container 不該依賴 host resolver(且不同 Docker 版本行為不同、break portability)。**拒絕**。
- B2:用外部 DNS server(如 8.8.8.8)— 解析 internal `nestjs` hostname 不可能(外部 DNS 不認 internal)。**拒絕**。

---

## R-3:nginx 1.27-alpine 對 `ipv6=off` + variable proxy_pass + resolver 的支援

**問題**:rev1 使用 `nginx:1.27-alpine`(per W-F5 既有 image)— 是否支援上述 directive?

**Research**:
- `resolver ipv6=off`:nginx ≥ 1.5.8 支援(per nginx changelog)、1.27 遠遠新於此
- `set $var "value"; proxy_pass http://$var/path;`:nginx 自 0.7+ 支援 variable in proxy_pass(屬基礎功能)
- `valid=Ns` cache TTL:nginx 自 0.6.18+ 支援

**Decision**:確認 1.27-alpine 支援全部三個 directive、無版本相容性風險。Implement 階段第一個 task 直接 `docker compose exec front-nginx nginx -t` 驗 syntax。

**Rationale**:
- nginx 1.27 = mainline branch、與 1.26 LTS 並行;directive 都是穩定基礎功能、不會有 deprecation 風險
- W-F5 既有 image 已實戰驗過 nginx config reload + healthcheck;升級或重新 build image 都不需要

**Alternatives considered**:
- C1:升 nginx 到 1.28+(若 1.27 出問題) — 無此需要。**拒絕**(per A-004 + R-3 確認)。

---

## R-4:exact match `location =` 與 prefix `location /api/` 的優先級

**問題**:既有 nginx config 有 `location /api/` prefix 反代到 `rust_api` upstream;W-FA2 加 `location = /api/auth/refreshToken` exact match — 兩者重疊時 nginx 如何選?

**Research**:
- nginx location matching 優先級(per nginx 官方文檔):
  1. `=` exact match(最高)
  2. `^~` literal prefix(non-regex preferred)
  3. `~` / `~*` regex match
  4. `/` literal prefix(default)
- W-FA2 用 `=` exact match → 對 `POST /api/auth/refreshToken` request **完全優先於** `/api/` prefix → 不會 fall through 到 rust-api

**Decision**:用 `location = /api/auth/refreshToken`(per FR-004),確保 W-FA2 加 route 不被既有 `/api/` prefix 攔截。

**Rationale**:
- exact match 是 nginx routing 最 deterministic 的方式、未來易 grep / sed 操作
- 對齊 nginx best practice(健康檢查 `= /health` 等用 exact match 顯式優先)

**Alternatives considered**:
- D1:用 `~ ^/api/auth/refreshToken$` regex match — 過度複雜、可讀性差。**拒絕**。
- D2:用 `^~ /api/auth/refreshToken` literal prefix — 不夠精確(會匹配 `/api/auth/refreshTokenAndMore` 等變體);refreshToken 應只匹配精確 path。**拒絕**。

---

## R-5:nestjs `POST /v1/auth/refreshToken` endpoint 真實可達性 + body 格式

**問題**:nestjs fork `authentication.controller.ts` 是否真有 `POST refreshToken` endpoint?Body 格式為何?能否接 SPA 既有 `{refreshToken: "..."}` body?

**Research**(brainstorm 階段已 grep 確認、實 implement 階段再驗一次):
- 檔案:`fork260509-soybean-admin-nestjs/backend/apps/base-system/src/api/iam/rest/authentication.controller.ts:58-83`
- 內容:
  ```typescript
  @Public()
  @Post('refreshToken')
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Request() request: FastifyRequest,
  ): Promise<ApiRes<any>> { ... }
  ```
- 完整 path = `/v1` global prefix + `/auth` controller prefix + `/refreshToken` route = `POST /v1/auth/refreshToken`
- `@Public()` decorator 表此 endpoint 不需 JWT auth(routing 層 wire-up 可在無 valid token 下驗)
- `@Body('refreshToken')` 從 request body 取 `refreshToken` field — 對齊 base-web `auth.ts:35` 送的 `{refreshToken: ...}` body

**Decision**:`proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;` 對齊真實 path、body 格式不需轉換。

**Rationale**:
- W-FA2 是 wire-up feature、不負責驗 business 邏輯;只需確認 routing 接通 + body 透傳 → nestjs 處理(可能 4xx 因 invalid token、但 envelope 仍是 nestjs ApiRes shape、達 SC-001 條件)

**Alternatives considered**:
- E1:寫 `proxy_pass http://$nestjs_upstream/auth/refreshToken;`(漏 `/v1` prefix、對齊 DESIGN-W §4.3 草稿 literal)— nestjs 會回 404(無此 endpoint)。**拒絕**(DESIGN-W 草稿 outdated、應對齊現實)。

---

## R-6:`sed` 機械刪除 marker block 的兼容性 + nginx -t 驗證方法

**問題**:US4.3 acceptance 要求「`sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 對 default.conf + default.conf.prod 刪除後 nginx -t 仍通」— 怎麼跑這驗證(不要 commit 刪除版的 config、只在 implement 階段 dry-run)?

**Research**:
- GNU sed `address range delete`:`sed '/PATTERN1/,/PATTERN2/d' <file>` 把從匹配 PATTERN1 的行到匹配 PATTERN2 的行(含兩端)整段刪
- 風險:若 file 內 PATTERN1 出現多次 / PATTERN1 與 PATTERN2 不成對 → 行為 unexpected;W-FA2 marker 用獨特 magic string `>>>>> TRANSITIONAL BEGIN` + `<<<<< TRANSITIONAL END`、極不可能誤匹配
- Dry-run 驗證方法選項:
  - A:把 sed 結果寫到 temp file(`/tmp/default.conf.cutover`)→ 用 `docker cp` 拷進 front-nginx container 取代既有 config → `nginx -t` → 拷回(若刪錯)
  - B:用 docker volume mount 把 temp file 蓋在 `/etc/nginx/conf.d/`(`-v /tmp/default.conf.cutover:/etc/nginx/conf.d/default.conf:ro`)
  - C:用 here-doc + `docker run --rm nginx:1.27-alpine` 開 ephemeral container 跑 nginx -t

**Decision**:用方法 A(`docker cp` swap + 還原)— 最直接、不需開新 container、可在 acceptance 階段順手跑。

**Rationale**:
- 簡單、明確、不會影響 production stack
- `nginx -t` 在 running container 內跑、配置驗證最接近 prod 環境

**Alternatives considered**:
- F1:把 marker 刪除版 commit 進 branch(commit + verify + revert)— 增加 git history 噪音、不值得。**拒絕**。

---

## Summary

| R-# | 主題 | Decision |
|---|---|---|
| R-1 | variable proxy_pass + resolver lazy DNS 設計 | `resolver 127.0.0.11 valid=10s ipv6=off;` + `set $nestjs_upstream "nestjs:9528";` + `proxy_pass http://$var/v1/auth/refreshToken;` |
| R-2 | Docker compose v2 內建 DNS resolver 可用性 | `127.0.0.11` resolver(對齊 W-F3 既有 internal network)|
| R-3 | nginx 1.27-alpine 支援度 | 全支援 ipv6=off / variable proxy_pass / resolver;無相容性風險 |
| R-4 | exact match vs prefix location 優先級 | `location =` 優於 `location /api/`,W-FA2 用 `=` 不被既有 `/api/` 攔 |
| R-5 | nestjs `POST /v1/auth/refreshToken` 可達性 + body | 已驗 endpoint 存在 + `@Public()` + body shape 對齊 SPA |
| R-6 | sed 刪除 marker block + nginx -t 驗 | sed `/BEGIN/,/END/d` + docker cp swap + nginx -t、acceptance 階段 dry-run |

**6 個 R-# 全部 resolved、無 unknown、無 NEEDS CLARIFICATION**。Phase 1 design ready。
