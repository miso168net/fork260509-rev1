# Implementation Plan: W-FA2 — nginx-track-a-transitional-block

**Branch**: `015-nginx-track-a-transitional-block` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-nginx-track-a-transitional-block/spec.md`

## Summary

W-FA2 是 rev1 deploy 階段 Track DESIGN-A 三件套第二個 feature(W-FA1 後接續、F10/F13/F14 之前)— 把 `POST /api/auth/refreshToken` 路由補上 nginx 反代到 nestjs upstream、用 inline TRANSITIONAL marker block 包在 default.conf / default.conf.prod 內;走 **variable proxy_pass + resolver lazy DNS** 設計讓 nginx 在 default profile / DESIGN-B 退場時不因 nestjs 缺席而 fail。**Plan 階段對齊 brainstorm + spec 拍板(無新 OQ)**,範疇對齊 spec FR-001~017。

**Technical approach**(per [research.md](research.md)):

- **Inline TRANSITIONAL marker block × 3**(per Q2)— `default.conf` dev 80 + dev 443 + `default.conf.prod` 443 各加 ~9 行 `location = /api/auth/refreshToken` block;每處 self-contained、不抽 snippet(per 自然推論);F14 cutover 用 `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 機械刪除
- **Variable proxy_pass + resolver lazy DNS**(per Q2 + R-1)— `resolver 127.0.0.11 valid=10s ipv6=off;` + `set $nestjs_upstream "nestjs:9528";` + `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;`;default profile 下 nestjs 不啟、nginx -t 仍通(DNS 延遲到 request 時);副作用:失 upstream keepalive、對 refreshToken 低頻可接受
- **沿用既有 snippets/proxy_headers.inc**(per 自然推論)— W-F6 抽出共用 5 header + 60s timeout、TRANSITIONAL block 用 `include /etc/nginx/snippets/proxy_headers.inc;` 不重寫
- **單段 commit**(per W-F1~W-F7 + W-FA1 慣例)— 只動 outer repo、`default.conf` + `default.conf.prod` + `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` 同一 commit

**Pre-implement validation tasks**(per [research.md](research.md)):

- **T1**:nginx 1.27-alpine 支援 `ipv6=off` + variable proxy_pass + resolver(per R-2、A-004)— acceptance 階段 `nginx -t` 驗
- **T2**:track-a profile up + curl POST refreshToken → 不回 404、回 nestjs envelope(per US1.2、SC-001)
- **T3**:default profile up + curl POST refreshToken → 回 502/504、front-nginx 仍 healthy(per US2.2/2.3、SC-003)
- **T4**:F6 login regression(`POST /api/auth/login` + `GET /api/route/isRouteExist`)PASS — track-a 模式 + default 模式都驗(per US4.2)
- **T5**:`sed` 機械刪除 marker block 後 `nginx -t` 仍通(per US4.3、SC-005)

## Technical Context

**Language/Version**:nginx 1.27-alpine(W-F5 既有 image、W-FA2 不升級)

**Primary Dependencies**:
- **W-F5 既有 `default.conf` + `default.conf.prod`**:80/443 server block 主結構、`/api/` prefix location、`include snippets/proxy_headers.inc` 共用 header 紀律
- **W-F6 既有 `snippets/proxy_headers.inc`**:5 個 `proxy_set_header` + `proxy_read_timeout 60s`、W-FA2 inline TRANSITIONAL block 透 `include` 沿用
- **W-FA1 既有 nestjs container**:`nestjs:9528` hostname 內部解析 + GLOBAL_PREFIX `/v1` + `POST /v1/auth/refreshToken` endpoint
- **Docker compose 內建 DNS resolver**:`127.0.0.11`(per R-2)

**Storage**:
- **`deploy/front-nginx/conf.d/default.conf`**(改)— dev 80 + dev 443 兩 server block 各加 ~9 行 inline TRANSITIONAL block
- **`deploy/front-nginx/conf.d/default.conf.prod`**(改)— prod 443 server block 加 ~9 行 inline TRANSITIONAL block(prod 80 只 redirect、不加)
- **`CLAUDE.md`**(改)— §5.2.1 加 track-a 模式下 curl POST refreshToken 範例
- **`docs/INTEGRATION-CHECKLIST.md`**(改)— Phase W-7 W-FA2 row「進行中」→「完成」+ Current Focus + 已完成里程碑

**Testing**:
- **nginx config syntax verification**:`docker compose exec front-nginx nginx -t` exit 0
- **track-a upstream wire-up verification**:curl POST `/api/auth/refreshToken` HTTP status code 非 404 + response body shape `ApiRes envelope`
- **default profile graceful degradation**:curl POST `/api/auth/refreshToken` → HTTP 502/504、front-nginx 仍 `(healthy)`
- **F6 login regression**:`POST /api/auth/login` + `GET /api/route/isRouteExist?routeName=home` 透 host port 11080 全 2xx + envelope success:true
- **Cutover dry-run**:`sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` 對 default.conf + default.conf.prod 刪除後產出 diff 透臨時 mount 跑 `nginx -t` exit 0
- **Zero-diff verification**:`git diff HEAD -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 應 empty

**Target Platform**:docker compose v2 + Linux host(WSL2 mirrored networking、Win11 22H2+)+ host curl(dev/prod 都用 curl 驗、不需 browser)

**Project Type**:**deploy-track feature**(對齊 W-F5/W-F6/W-F7 + W-FA1)— rev1 nginx config 改動、無 application source code 改動;最小範疇純 outer 改 3 個 nginx block

**Performance Goals**:
- 改動量 ≤ 35 行 nginx config(per NFR-001)
- refreshToken response latency ≤ rust-api login + 20ms 額外 DNS overhead(per NFR-002、低頻 acceptable)
- nginx -t syntax check ≤ 1s(W-F5/F6 既有 baseline)

**Constraints**:
- `MUST NOT` 動 base-web src(per Constitution Principle IV + FR-013)
- `MUST NOT` 動 rust-api worktree(per Constitution Principle IV + FR-013)
- `MUST NOT` 動 nestjs fork source(per Constitution Principle IV 延伸 + FR-013)
- `MUST NOT` 引入新 docker compose override file(per Q2 + FR-014;保 operator UX 不變、無新 `-f` flag)
- `MUST NOT` 引入新 nginx config file(per 自然推論 + FR-015;不抽 snippet 到 conf.d/track-a.inc)
- `MUST NOT` 引入 nginx upstream block(per Q2 + FR-012;全用 variable proxy_pass + resolver、副作用失 keepalive、refreshToken 低頻可接受)
- `MUST NOT` 影響既有 `/api/` prefix routing(per FR-004 `=` exact match 優先級高於 `/api/` prefix)
- `MUST NOT` 改動 nginx upstream definition(全保留 W-F5 既有 `upstream base_web` / `upstream rust_api`)
- `MUST` default profile 啟動 stack 仍 6 service healthy + `nginx -t` OK(per FR-017)
- `MUST` `POST /api/auth/refreshToken` 在 default profile 下回 HTTP 502/504 而非 crash / 404(per FR-017)
- `MUST` 為單段 commit(per FR-009 + W-F1~W-F7 + W-FA1 慣例)

**Scale/Scope**:
- 改動 / 新建檔案數:**4 個 outer file**(`default.conf` + `default.conf.prod` + `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md`)、**0 個新檔**(per FR-014 + FR-015)
- LOC 量級:~27 行 nginx config(3 個 server block 各 ~9 行 TRANSITIONAL block)+ ~10 行 CLAUDE.md(curl 範例)+ ~15 行 INTEGRATION-CHECKLIST.md = ~52 行 total
- Acceptance scenario 數:US1 P1 MVP 3 + US2 P2 3 + US3 P2 3 + US4 P2 3 = **12 個 scenario**(spec 已列)
- 預估 task 數:~20-25 task(per NFR-004、小於 W-FA1 ~43 task)
- Commit 模式:**單段 commit**(per W-FA1 同模式)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ✅ **N/A**(W-FA2 純 nginx routing、不涉 Casbin enforcement;refreshToken 業務 RBAC 邏輯由 nestjs 端 + F10 範疇處理、nginx 只透傳)
- **II. Soft Delete + Audit Log** — ✅ **N/A**(W-FA2 為 nginx config 改動、不涉業務寫入 / soft delete / audit log;refreshToken business 邏輯 sys_tokens 寫入 + sys_operation_log audit 由 nestjs handle、F10 範疇)
- **III. 嚴版禁 Forward + 單一職責** — ✅ **PASS**(W-FA2 nginx 是邊緣反代、加 TRANSITIONAL marker block 明示 transitional 補位機制;不引 backend ↔ backend forward;nginx 嚴守路由分流職責、不混業務邏輯;DESIGN-A §2.2 紀律完整對齊)
- **IV. base 不改動邊界** — ✅ **PASS**(W-FA2 不動 base-web src 任何 file;延伸至 rust-api worktree + nestjs fork source 也不動 — per FR-013 + 沿襲 W-FA1 FR-018)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-FA2 marker block 設計直接為 F14 cutover 服務 — 3 處 `sed` 整段刪 + 改 `proxy_pass` 指 rust_api 即可、無 DB / application 改動;通過「未來 nestjs 拔掉時順嗎」濾鏡;且 default profile / DESIGN-B 退場 nginx 仍可啟動的設計也讓 cutover 不需中斷服務)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **PASS**(W-FA2 透 docker compose v2 既有 stack、不引新部署形態)
- **資料庫 PostgreSQL** — ✅ **N/A**(W-FA2 不涉 DB、refreshToken DB 互動由 nestjs handle、F10 範疇)
- **快取 redis** — ✅ **N/A**(W-FA2 不涉 redis)
- **TLS 對外** — ✅ **PASS**(W-FA2 sticky on W-F6 既有 TLS 結構、443 server block 加 TRANSITIONAL location、不改 ssl_protocols / cipher / cert 配置)
- **Secret 注入** — ✅ **N/A**(W-FA2 不涉 secret、refreshToken JWT secret 由 W-FA1 既有 entrypoint wrapper bridge)
- **DB migration trigger init container** — ✅ **N/A**(W-FA2 不涉 DB migration)
- **Port 規劃 `1XXXX`** — ✅ **PASS**(W-FA2 不開新 host port、`refreshToken` 透 W-F7 既有 host port 11080/11443 進 nginx;internal `nestjs:9528` 對齊 W-FA1 落定)
- **Observability(Loki + grafana + prometheus)** — ✅ **N/A**(W-FA2 不引入 observability、nginx access log 走 docker compose 預設 driver、未來 W-F12 promtail 啟動時自動 picked up)
- **結構化 log JSON** — ✅ **N/A**(W-F12 範疇、nginx 既有 log 格式維持)
- **Backup PITR** — ✅ **N/A**(W-FA2 不涉 backup)
- **背景工作** — ✅ **N/A**(W-FA2 不引入 background job)
- **CI/CD platform** — ✅ **N/A**(W-FA2 純 nginx config 改、本機立刻 reload 生效、無 CI/CD;W-FA3 範疇)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(brainstorm → /speckit-specify → /speckit-clarify(0 Q)→ /speckit-plan 流程完整;tasks + implement 流程後續)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、0 violation、0 partial)
- **兩段式 commit 紀律** — ✅ **N/A**(W-FA2 單段 commit、只動 outer repo、不動 worktree;對齊 W-F1~W-F7 + W-FA1 慣例)
- **Conventional Commits 中文 subject** — ✅ **PASS**(預期 commit subject:`feat(deploy): W-FA2 加 nginx TRANSITIONAL marker block + refreshToken → nestjs upstream`)
- **Push 確認紀律** — ✅ **PASS**(implement 完成後 push 需 user 同意;對齊 F6 / 全 W-F* + W-FA1 既有紀律)
- **TLS 紀律** — ✅ **PASS**(W-FA2 在 443 server 加 TRANSITIONAL block、不破壞 W-F6 既有 TLS 配置;對齊 W-F6 紀律)

**Gate result**:**8 PASS / 15 N/A / 0 Partial / 0 violation**。Phase 0 起 gate 通過、無 Complexity Tracking entry 需要。

## Project Structure

### Documentation (this feature)

```text
specs/015-nginx-track-a-transitional-block/
├── plan.md                              # This file(/speckit-plan output)
├── research.md                          # Phase 0 — R-1 + R-2 + R-3 解 + deploy 細節
├── data-model.md                        # Phase 1 — 4 個 entity(nginx blocks / doc edits)
├── quickstart.md                        # Phase 1 — operator implement + acceptance guide
├── contracts/                           # Phase 1
│   ├── nginx-contract.md                #   C-N* nginx config TRANSITIONAL block 契約
│   └── verification-commands.md         #   C-V* host docker / curl / nginx -t / sed 驗
├── checklists/
│   └── requirements.md                  # /speckit-specify 階段已產出
├── spec.md                              # /speckit-specify 階段已產出
└── tasks.md                             # Phase 2 output(/speckit-tasks、NOT in this command)
```

### Outer repo 改動(W-FA2 implement 階段預期變動範圍 — 純 outer、不動 worktree)

```text
fork260509-rev1/                                  # outer repo root(動;單段 commit)
├── deploy/front-nginx/conf.d/
│   ├── default.conf                              # ★ W-FA2 改:dev 80 + dev 443 server block 各加 inline TRANSITIONAL block(~9 行/block)
│   └── default.conf.prod                         # ★ W-FA2 改:prod 443 server block 加 inline TRANSITIONAL block(prod 80 只 redirect、不加)
├── CLAUDE.md                                     # ★ W-FA2 改:§5.2.1 加 track-a 模式下 curl POST refreshToken 範例
└── docs/
    └── INTEGRATION-CHECKLIST.md                  # ★ W-FA2 改:W-FA2 row「進行中」→「完成」+ Current Focus + 已完成里程碑
```

### Worktree 改動(無)

```text
base-web/                                # 不動(per FR-013)
rust-api/                                # 不動(per FR-013)
fork260509-soybean-admin-nestjs/         # 不動(per FR-013 + Constitution Principle IV 延伸)
```

### Image / artifact 改動(無)

W-FA2 不 build 任何 image、不引入新 file、不 push registry。

**Structure Decision**:W-FA2 為 **deploy-track outer-only feature**(對齊 W-F5/W-F6/W-F7 + W-FA1 純 outer single-commit 慣例)。改動範圍極緊湊:4 個 outer file、~52 LOC;無新檔、無 worktree 改動、無 application source 改動、無 image artifact。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**無 violation、本表保留為空**(per Gate result 8 PASS / 15 N/A / 0 partial / 0 violation)。

---

**Phase 0 / 1 outputs**:見同目錄 [`research.md`](research.md)、[`data-model.md`](data-model.md)、[`quickstart.md`](quickstart.md)、[`contracts/`](contracts/)。
