# Feature Specification: W-FA2 — nginx-track-a-transitional-block

**Feature ID**: W-FA2(per [`DESIGN-W-DEPLOYMENT`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11 line 1115 — Phase W-7 Track DESIGN-A 三件套第二個 feature、W-FA1 後)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `015-nginx-track-a-transitional-block`)
**Created**: 2026-05-18
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-18 session

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §4.3(track-a.inc 草稿、用 port 3000、未拍板 profile-aware 機制)、§11 line 1115(W-FA2 scope 描述)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §2.2(nginx 路由分流規則 + TRANSITIONAL marker convention)、§3.2(nestjs-bound endpoint 列表 = refreshToken-only、嚴格不擴張)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle III「嚴版禁 Forward」延伸至 nginx 邊緣;Principle V「漸進收縮 DESIGN-A → DESIGN-B」— marker block 設計直接服務 F14 cutover)
- [`docs/superpowers/011-feature-compose-nestjs-service.md`](011-feature-compose-nestjs-service.md) W-FA1(落定 nestjs container port = 9528、GLOBAL_PREFIX = /v1、與 DESIGN-W §4.3 草稿 port 3000 + /auth/refreshToken 漏 prefix 兩處不一致、本 feature 對齊現實)
- [`docs/superpowers/010-feature-route-guard.md`](010-feature-route-guard.md) F6(F5.1 + F6 既有 SPA → nginx → rust-api 路由模式不變、W-FA2 只加 1 條新 exact-match location 不影響既有)
- 既有 [`deploy/front-nginx/conf.d/default.conf`](../../deploy/front-nginx/conf.d/default.conf)(W-F5 + W-F6 落地、80 + 443 兩 server block、W-FA2 各加 1 個 TRANSITIONAL inline block)
- 既有 [`deploy/front-nginx/conf.d/default.conf.prod`](../../deploy/front-nginx/conf.d/default.conf.prod)(W-F6 落地、80 redirect 443 + 443 ssl、W-FA2 在 443 server 加 inline block)
- 既有 [`deploy/front-nginx/snippets/proxy_headers.inc`](../../deploy/front-nginx/snippets/proxy_headers.inc)(W-F6 抽出共用 5 header + 60s timeout、W-FA2 沿用)
- 既有 [`base-web/src/service/api/auth.ts`](../../base-web/src/service/api/auth.ts)(SPA fetchRefreshToken 已 call `POST /auth/refreshToken` body `{refreshToken: <token>}`、透過 VITE_SERVICE_BASE_URL=/api 變 `/api/auth/refreshToken`、W-FA2 補上 nginx routing)
- 既有 [`fork260509-soybean-admin-nestjs/backend/apps/base-system/src/api/iam/rest/authentication.controller.ts`](../../fork260509-soybean-admin-nestjs/backend/apps/base-system/src/api/iam/rest/authentication.controller.ts)(`@Controller('auth')` + global prefix `/v1` → endpoint `POST /v1/auth/refreshToken`、`@Public()` 不需 JWT、`@Body('refreshToken')` 接 SPA body 對齊)

**Scope summary**:rev1 deploy 階段 Track DESIGN-A 三件套第二個 feature。**把 `POST /api/auth/refreshToken` 路由補上 nginx 反代到 nestjs upstream**、用 inline TRANSITIONAL marker block 包在 default.conf / default.conf.prod 內;走 **variable proxy_pass + resolver** 設計讓 DNS 延遲到 request time、default profile / DESIGN-B 退場時 nginx 不因 nestjs 缺席而 fail startup。範疇刻意收緊到「nginx 加 1 條 exact-match location + variable proxy_pass 機制 + 3 處 marker block 結構」、不含 nestjs application 改動(F10)、不含 rust 補實作(F13)、不含實際 cutover(F14)。

**Commit 模式**:**單段 commit**(per W-F1~W-F7 + W-FA1 慣例)— 只動 outer repo、不動 worktree、不動 nestjs fork。

**範疇外**:nestjs application source code 改動 / rust-api 補實作 refreshToken / DESIGN-A → DESIGN-B 實際 cutover 執行 / rate limiting / refreshToken 防爆機制 / upstream keepalive(Q2 拍板捨棄、refreshToken 低頻可接受)/ nestjs 任何非 refreshToken endpoint route。

---

## Clarifications

### Session 2026-05-18(brainstorming 階段拍板、3 項顯式 Q + 5 項自然推論)

- **Q1**: W-FA2 加哪些 nestjs-bound endpoint? → **A: refreshToken-only**。對齊 DESIGN-A §3.2「endpoint 列表保持最小、不擴張」紀律;F13 rust 補實作後 F14 cutover 整段刪。

- **Q2**: nginx TRANSITIONAL block 怎麼做 profile-aware? → **A: variable proxy_pass + inline TRANSITIONAL block**(`resolver 127.0.0.11` + `set $nestjs_upstream "nestjs:9528"` + `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken`、變數式 proxy_pass 觸發 lazy DNS、default profile / DESIGN-B 退場 nginx 仍能啟動;副作用:不能用 upstream block 故失 keepalive、refreshToken 低頻可接受)。對比方案 A(新建 `docker-compose.track-a.yml` override + `track-a.inc` + profile-aware volume mount)需 operator 加 `-f` flag、operator UX 變重;方案 C(upstream block + 手動退場)破壞 default profile nginx -t 可用性。

- **Q3**: TRANSITIONAL block 進哪些 nginx config 檔? → **A: dev + prod 都加**。對齊 W-FA1 FR-012「prod 不暴露 nestjs host port — 僅內部訪問、透 W-FA2 nginx routing」明示;dev/prod 3 個 server block(dev 80 + dev 443 + prod 443、prod 80 只 redirect 不加)都加 location 條目;設計一致、prod 部署能走 refreshToken。

- **自然推論**:**upstream path 對齊 nestjs GLOBAL_PREFIX `/v1`** — DESIGN-W §4.3 草稿寫 `proxy_pass http://nestjs_transitional/auth/refreshToken;`(漏 `/v1` prefix)、實際 nestjs `app.setGlobalPrefix('v1')`(per fork main.ts:88)+ `@Controller('auth')` → 真實 endpoint path = `/v1/auth/refreshToken`。W-FA2 對齊現實寫 `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken`。

- **自然推論**:**upstream port = 9528 不是 DESIGN-W 草稿 3000** — W-FA1 落定 nestjs container port = 9528(per fork EXPOSE 9528 + nestjs 自帶 `APP_PORT=9528`);DESIGN-W §4.3 草稿 `server nestjs:3000;` 已過時、W-FA2 對齊 `nestjs:9528`。

- **自然推論**:**resolver 127.0.0.11** — Docker 內建 DNS、所有 compose internal network 內 service 都透此解析;`valid=10s` 控制 nestjs container 重啟後 nginx 自動 re-resolve(無需手動 nginx -s reload);`ipv6=off` 避免 AAAA 查詢延遲。

- **自然推論**:**沿用既有 snippets/proxy_headers.inc** — W-F6 抽出共用 5 header + 60s timeout、W-FA2 TRANSITIONAL block 用 `include /etc/nginx/snippets/proxy_headers.inc;` 不重寫 header set。

- **自然推論**:**marker block 在每個 server 各自獨立** — 不抽 snippet 到 conf.d/track-a.inc(避免「Q2 拍板 inline」的隱含取捨被反悔);3 處 inline 雖有 duplication 但每個 server block self-contained、F14 cutover 用 `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 機械刪除即可。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — DESIGN-A track-a 模式下 refreshToken 走通 nginx → nestjs(Priority: P1)🎯 MVP

operator 啟 stack `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait` + nginx config 已加 TRANSITIONAL block(W-FA2 落地)、SPA 或 curl 發 `POST /api/auth/refreshToken` body `{refreshToken: <token>}` → nginx 反代到 nestjs `/v1/auth/refreshToken` → nestjs handler 收到 + 回 ApiRes envelope。

**Why this priority**:

W-FA2 唯一 implementation-bearing scenario。沒 nginx routing,SPA 的 refreshToken call 會走到 rust-api(無此 endpoint)、回 404,token rotation 無宿主。US1 證明 W-FA2 wire-up 完整。

**Independent Test**:dev stack track-a profile up + curl POST refreshToken + 看 nestjs logs grep refreshToken — 不依賴 US2~US4。

**Acceptance Scenarios**:

1. **Given** dev stack `--profile track-a up` 7 service healthy、W-FA2 落地的 nginx config 已 reload,**When** `nginx -t` from inside front-nginx container,**Then** exit 0 syntax OK
2. **Given** stack 已啟,**When** `curl -X POST -H "Content-Type: application/json" -d '{"refreshToken":"invalid-test-token"}' http://127.0.0.1:11080/api/auth/refreshToken`,**Then** response 不是 404(證明不被 rust-api `/api/` prefix 攔)、是 nestjs ApiRes envelope(具體 code/msg 視 nestjs token 驗證邏輯、W-FA2 不負責 business 正確性、留 F10)
3. **Given** stack 已啟,**When** `docker compose logs nestjs --since 1m | grep -E "POST /v1/auth/refreshToken"`,**Then** 至少 1 hit(證 nginx 確實 forward 到 nestjs)

---

### User Story 2 — DESIGN-B / default profile 下 nginx 不被 nestjs 缺席影響(Priority: P2)

**Goal**:驗 variable proxy_pass + resolver 的 lazy DNS 設計 — default profile up(nestjs 不啟)、nginx 仍啟動 healthy、其他 route 正常、refreshToken endpoint 回 502 / 504 而非 nginx crash。

**Why this priority**:

證 F14 cutover 前 DESIGN-B 切換路徑可走、且 W-FA2 不破壞 rev1 stack default profile 可用性 invariant(對齊 W-F5/W-F6/W-F7 紀律)。

**Acceptance Scenarios**:

1. **Given** stack 已啟(track-a),**When** `docker compose down --remove-orphans` + `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`(不帶 profile),**Then** 6 service healthy(無 nestjs)、`nginx -t` from front-nginx OK
2. **Given** default profile stack 已啟,**When** `curl -X POST -H "Content-Type: application/json" -d '{"refreshToken":"x"}' http://127.0.0.1:11080/api/auth/refreshToken`,**Then** HTTP 502 / 504(nginx 報 upstream 不可達、不是 crash 不是 404)
3. **Given** default profile stack 已啟,**When** F6 login flow(`POST /api/auth/login` Soybean/123456 + `GET /api/route/isRouteExist?routeName=home`)curl,**Then** 全 PASS(2xx + envelope `success: true`、證 `/api/` prefix route 不受 W-FA2 inline block 影響)

---

### User Story 3 — prod config 結構 + syntax parity(Priority: P2)

**Goal**:驗 `default.conf.prod` 加 TRANSITIONAL block 後 prod 模式 nginx 啟動 OK、TLS 不破、track-a profile 下 prod 也能走 refreshToken。

**Why this priority**:

W-FA1 FR-012 + DESIGN-W §11.5 明示 prod 部署也要支援 track-a;若 prod nginx config 沒同步、prod 部署的 refreshToken 失效。

**Acceptance Scenarios**:

1. **Given** W-FA2 落地後,**When** `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a config --quiet`,**Then** exit 0(yaml + nginx config 結構 valid)
2. **Given** dev cert 已 seed 進 named volume(per W-F6 quickstart),**When** `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a up -d --wait`,**Then** 7 service healthy + `nginx -t` from front-nginx OK
3. **Given** prod baseline + track-a 啟動(seed cert),**When** `curl -k -X POST -H "Content-Type: application/json" -d '{"refreshToken":"x"}' https://127.0.0.1:11443/api/auth/refreshToken`,**Then** 行為對齊 dev US1.2(nestjs envelope、非 404、非 502 — 因 nestjs 在 track-a 啟用);若 prod cert 未 seed,降為 syntax-only verify

---

### User Story 4 — zero-regression + marker 整段刪驗(Priority: P2)

**Goal**:W-F* 標配零回歸 + 驗 marker block 整段可機械刪除、證 F14 cutover 路徑乾淨。

**Why this priority**:

對齊 W-FA1 FR-018 三邊零改動紀律 + Constitution Principle IV/V;F14 cutover dry-run 證 marker convention 可機械化操作、無遺漏。

**Acceptance Scenarios**:

1. **Given** W-FA2 落地,**When** `git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/`,**Then** 無輸出(三邊零改動、per FR-018 延伸)
2. **Given** W-FA2 落地 stack track-a 啟,**When** F6 browser login regression curl(`POST /api/auth/login` Soybean/123456 + `GET /api/route/isRouteExist`),**Then** 全 PASS(F6 + F5.1 既有 wiring 不受 W-FA2 影響)
3. **Given** W-FA2 落地的 default.conf / default.conf.prod,**When** `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' <file>` 對 2 個 nginx config 都跑、產出 diff 給 `nginx -t` 驗(臨時掛 volume),**Then** 刪除後 `nginx -t` 仍 exit 0(證 F14 cutover 機械刪除路徑可行、不會 break)

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | track-a 啟動但 nestjs container unhealthy(per W-FA1 healthcheck) | `depends_on` 已在 W-FA1 處理;nginx 不受影響、refreshToken 走到 nestjs 但 nestjs 自己 5xx |
| E-2 | nestjs container 重啟(新 IP)後 nginx 沒 reload | `resolver valid=10s` 控制 — 最多 10s 後 nginx 自動 re-resolve、無需手動 nginx -s reload |
| E-3 | DESIGN-B 退場 nestjs container 拔除(F14)| nginx 仍 healthy、refreshToken endpoint 回 502;rust 在 F13 補實作完成後 marker block 整段 sed 刪 + 改 `proxy_pass` 指 rust_api 即可 |
| E-4 | nestjs upstream rebase 改 endpoint path(如 `/v1` prefix 改 `/v2`) | nginx config 須對齊改 `/v1/auth/refreshToken` → `/v2/auth/refreshToken`;屬 fork drift、W-FA2 不負責 future-proof(per W-FA1 E-7 same) |
| E-5 | SPA 發送的 body 格式不合 nestjs DTO(如 missing `refreshToken` field) | nestjs 回 4xx + ApiRes envelope;nginx 完全透傳、不干涉 |
| E-6 | base-web 升 upstream 改 fetchRefreshToken endpoint path | 屬 base 邊界外、W-FA2 不負責;base-web upstream rebase 時對齊 |
| E-7 | docker compose 重啟 nestjs container 期間 SPA refreshToken request 進來 | resolver lazy DNS 命中失敗(`nestjs` 暫時不解析)、回 502;SPA 應有 retry 機制(屬 base-web 邊界)|

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: W-FA2 MUST 在 `deploy/front-nginx/conf.d/default.conf` 的 dev 80 server block + dev 443 server block 內各加 1 個 inline TRANSITIONAL marker block,含 `location = /api/auth/refreshToken`。
- **FR-002**: W-FA2 MUST 在 `deploy/front-nginx/conf.d/default.conf.prod` 的 443 server block 內加 1 個 inline TRANSITIONAL marker block(prod 80 只 redirect、不加)。
- **FR-003**: TRANSITIONAL block MUST 用 marker comment `# >>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點(per W-FA2) <<<<<` 開始、`# <<<<< TRANSITIONAL END >>>>>` 結束(對齊 DESIGN-A §2.2 convention)。
- **FR-004**: TRANSITIONAL location block MUST 用 `location = /api/auth/refreshToken`(exact match、優先順序高於 `/api/` prefix)。
- **FR-005**: TRANSITIONAL location block MUST 含 `resolver 127.0.0.11 valid=10s ipv6=off;`(Docker 內建 DNS、lazy 解析機制)。
- **FR-006**: TRANSITIONAL location block MUST 用 `set $nestjs_upstream "nestjs:9528";` 設變數(觸發 variable proxy_pass、避 startup-time DNS lookup)。
- **FR-007**: TRANSITIONAL location block MUST 用 `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;`(顯式對齊 nestjs GLOBAL_PREFIX `/v1`、修正 DESIGN-W §4.3 草稿漏 prefix)。
- **FR-008**: TRANSITIONAL location block MUST 用 `include /etc/nginx/snippets/proxy_headers.inc;` 沿用 W-F5/W-F6 共用 5 header + 60s timeout。
- **FR-009**: W-FA2 MUST 為 **單段 commit**(對齊 W-F1~W-F7 + W-FA1 慣例、只動 outer repo)。
- **FR-010**: `CLAUDE.md` §5.2.1 MUST 加 track-a 模式下 curl POST refreshToken 範例(對齊 dev 啟動範例風格)。
- **FR-011**: `docs/INTEGRATION-CHECKLIST.md` MUST 加 W-FA2 row 進 Phase W-7 roadmap + Current Focus 更新 + 已完成里程碑加 W-FA2 條目。
- **FR-012**: W-FA2 MUST 不引入任何 nginx upstream block(全程用 variable proxy_pass + resolver、per Q2 拍板)。
- **FR-013**: W-FA2 MUST 不動 base-web src(per Constitution Principle IV + 沿襲 W-FA1 FR-018)、不動 rust-api worktree、不動 nestjs fork source。
- **FR-014**: W-FA2 MUST 不引入新 docker compose override file(per Q2 拍板捨棄 Option A、保 operator UX 不變)。
- **FR-015**: W-FA2 MUST 不引入新 nginx config file(per 自然推論 inline 不抽 snippet)。
- **FR-016**: W-FA2 acceptance MUST 含「`sed` 機械刪除 marker block 後 `nginx -t` 仍通」測試(US4.3、證 F14 cutover 路徑乾淨)。
- **FR-017**: W-FA2 落地後 default profile(不帶 `--profile track-a`)啟動 stack MUST 仍能正常啟動 6 service healthy(per FR-014 + Q2 lazy DNS)、`/api/auth/refreshToken` 回 502/504 而非 nginx crash 或 404。

### Non-Functional Requirements

- **NFR-001**: nginx config 改動量 SHOULD ≤ 35 行(3 個 server block 各 ~9 行 TRANSITIONAL block + 5-10 行 doc)。
- **NFR-002**: variable proxy_pass + resolver 失 upstream keepalive、refreshToken response latency SHOULD ≤ 既有 rust-api login flow + 20ms 額外 DNS resolution overhead(可接受、refreshToken 低頻場景)。
- **NFR-003**: marker block 內 nginx directive 順序 SHOULD 對齊既有 `/api/` location pattern(resolver → set → proxy_pass → include)、易讀性對齊 W-F5 慣例。
- **NFR-004**: W-FA2 spec / plan / tasks 規模 SHOULD 小於 W-FA1(估 ~20-25 task、~3-4 個檔案改動)。

### Key Entities

- **`deploy/front-nginx/conf.d/default.conf` TRANSITIONAL block × 2**(dev 80 server + dev 443 server)
- **`deploy/front-nginx/conf.d/default.conf.prod` TRANSITIONAL block × 1**(prod 443 server)
- **`CLAUDE.md` §5.2.1**(加 track-a refreshToken curl 範例)
- **`docs/INTEGRATION-CHECKLIST.md`**(W-FA2 row + Current Focus + 已完成里程碑)
- **base-web / rust-api / nestjs fork**(不動、per FR-013)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: dev stack `--profile track-a up -d --wait` + `curl -X POST /api/auth/refreshToken` 透過 host port 11080 → response 不是 404(證 nginx route 不被 rust-api `/api/` 攔)、是 nestjs 回的 ApiRes envelope shape。
- **SC-002**: dev stack default profile(不帶 profile)`up -d --wait` 仍能 6 service healthy、`nginx -t` 過、F6 login flow(`POST /api/auth/login` + `GET /api/route/isRouteExist`)PASS。
- **SC-003**: dev stack default profile + `curl POST /api/auth/refreshToken` 回 HTTP 502/504(nginx upstream 不可達、不是 crash)。
- **SC-004**: prod compose `--profile track-a config --quiet` exit 0、prod baseline + track-a up 後 nginx -t OK。
- **SC-005**: `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 對 default.conf + default.conf.prod 刪除後產出 diff 跑 `nginx -t`(臨時 volume mount)exit 0。
- **SC-006**: `git diff HEAD -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 無輸出(per FR-013 三邊零改動)。
- **SC-007**: W-FA2 為單段 commit、`git log --oneline -1` 為 W-FA2 主要落地 commit、無「兩段式」紀律。

## Assumptions

- **A-001**: nestjs fork repo `apps/base-system/src/api/iam/rest/authentication.controller.ts:59` `@Public @Post('refreshToken')` endpoint 已實作(W-FA2 verify date 2026-05-18 grep 確認、business 邏輯正確性留 F10)。
- **A-002**: nestjs `@Body('refreshToken')` 接 SPA fetchRefreshToken 送的 `{refreshToken: <token>}` body 格式 — 對齊現有 base-web `auth.ts:30` 既有 wiring(SPA 不改、W-FA2 only nginx routing)。
- **A-003**: docker 內建 DNS resolver `127.0.0.11` 在 rev1 compose internal network 內可用、`nestjs` hostname 在 track-a profile 啟動後可被 nginx 解析。
- **A-004**: nginx 1.27-alpine(W-F5 既有 image)支援 variable proxy_pass + resolver + ipv6=off directive(主流功能、無版本相容性風險)。
- **A-005**: W-FA1 落定的 nestjs container port 9528 + GLOBAL_PREFIX `/v1` 在 W-FA2 落地時不變(W-FA1 已 merge `b095d55`、stable)。
- **A-006**: refreshToken endpoint 低頻場景下、失 upstream keepalive 不會造成 noticeable latency 問題(business 場景:user 操作 token 過期才觸發、~每小時 1 次/user)。

## Dependencies

### Inbound(本 feature 依賴)

- **W-F5** `front-nginx`:`default.conf` + `default.conf.prod` 主結構、`/api/` prefix location pattern、`include snippets/proxy_headers.inc` 共用 header 紀律。✅(merge `dff14c2`)
- **W-F6** `tls-cert-management`:`default.conf.prod` 80 redirect 443 + 443 ssl 結構、snippets/proxy_headers.inc 抽出。✅(merge `5e38030`)
- **W-FA1** `compose-nestjs-service`:nestjs container 在 track-a profile 下可達(`nestjs:9528` hostname 內部解析)、GLOBAL_PREFIX `/v1` 落定、`@Public POST /v1/auth/refreshToken` endpoint 可訪。✅(merge `b095d55`)
- **F5.1** `auth-login-and-dynamic-menu`:base-web `fetchRefreshToken` 既有 wiring、SPA 透過 VITE_SERVICE_BASE_URL=/api 發 POST /api/auth/refreshToken。✅(merge `e71aefe` + follow-up `1bdbc2f`)

### Outbound(本 feature 解鎖)

- **F10** `refresh-token-nestjs-bridge`:nestjs application 改 sys_tokens prisma model 對齊 + refreshToken endpoint 行為對齊 rust-api + Casbin pub-sub channel 訂閱 + W-F4 `_FILE` pattern 原生對齊。W-FA2 落地後 F10 可在 wire-up 既就位的環境下實際對齊 business 邏輯。
- **W-FA3** `cicd-nestjs-build-job`:nestjs image build pipeline、push registry。W-FA2 落地後 W-FA3 可在 routing 既就位的環境下測 image push + 部署回歸。
- **F13** `rust-refresh-token-impl`:rust 補實作 refresh token rotation 取代 nestjs。W-FA2 落定的 nginx routing 結構 + marker convention 讓 F13 / F14 cutover 機械化(sed 刪 + 改 proxy_pass 指 rust_api)。
- **F14** `design-a-to-b-cutover`:DESIGN-A → DESIGN-B 形態正式生效;W-FA2 marker block convention 直接服務此 cutover。

## Out of Scope

- **OOS-001**: nestjs application source code 改動 — F10 範疇。
- **OOS-002**: rust-api 補實作 refreshToken — F13 範疇(W-FA2 是過渡 wire-up)。
- **OOS-003**: DESIGN-A → DESIGN-B 實際 cutover 執行 — F14 範疇(W-FA2 只驗 marker block 可機械刪)。
- **OOS-004**: rate limiting / refreshToken 防爆機制 — 留 W-F12 observability 階段或 application security follow-up。
- **OOS-005**: upstream keepalive 補回 — Q2 拍板捨棄 keepalive、若未來流量需要可重構為 upstream block + profile-aware mount(回到 Q2 Option A)、屬獨立 feature 範疇。
- **OOS-006**: nestjs `/v1/*` 任何非 refreshToken endpoint — per Q1 拍板 refreshToken-only、嚴格不擴張(per DESIGN-A §3.2 紀律)。
- **OOS-007**: nginx access log JSON 格式對齊 — W-F12 observability 範疇。
- **OOS-008**: nestjs image push to container registry — W-FA3 範疇。
- **OOS-009**: refreshToken response shape 對齊 rust-api 既有 ApiRes envelope — F10 範疇(W-FA2 透傳、不干涉 body 格式)。
- **OOS-010**: nginx config 跨 dev/prod DRY 重構(如抽 server block 共用部分到 snippet) — 屬 nginx config 重構 feature 範疇、不在 W-FA2。
