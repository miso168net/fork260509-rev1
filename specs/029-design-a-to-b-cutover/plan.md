# Implementation Plan: F14 — design-a-to-b-cutover

**Branch**: `029-design-a-to-b-cutover` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/029-design-a-to-b-cutover/spec.md`

## Summary

DESIGN-A §6.1 Phase 5(P5)第二個、也是最後一個 feature — nestjs 退場、DESIGN-B(rust-only)形態正式生效。F13 已在 rust-api 補實作 `POST /auth/refreshToken`(rust 與 nestjs 共存);F14 把 nginx routing 從 nestjs 切到 rust、移除 nestjs container、刪除 Track DESIGN-A 三件套(W-FA1/W-FA2/W-FA3)留下的過渡結構。

技術途徑:**設定拔除型** feature — 無新程式邏輯。① nginx:以 `sed` range-delete 刪 `default.conf`(80+443 server)+ `default.conf.prod`(443 server)共 3 個 machine-deletable TRANSITIONAL block,`/api/auth/refreshToken` 自然落到既有 `location /api/` → rust upstream ② docker-compose:移除 3 個 compose 檔的 nestjs service block(`track-a` profile 隨之失效)③ 刪 `deploy/build-nestjs.sh` ④ R3:`sys_user_error.rs` 的 5 個 `1xxx` inline literal 改引用新增於 `code.rs` 的 `CODE_USER_*` 常數(零行為改變)⑤ R4:補 `deploy/secrets/cleanup_database_url.txt.example` ⑥ doc 收尾:`CLAUDE.md` §5.2/§5.2.1 + `deploy/front-nginx/README.md` 清理、DESIGN-A doc 標註已被取代、DESIGN-B doc 標註現行設計、`INTEGRATION-CHECKLIST.md` 更新。

**Phase 0 research 關鍵發現**:拔除點精確定位完成 — 3 個 TRANSITIONAL block 行範圍確定、`sed` 刪除安全(`default.conf` 刪後無 resolver 殘留亦無需 resolver);nestjs service block 邊界確定、`track-a` profile 唯 nestjs 用;`sys_user_error.rs` 5 個碼為 inline literal、`code.rs` namespace 命名慣例確定。**關鍵 gotcha**:`refresh_token_secret` secret **必留**(rust-api `APP_JWT_REFRESH_SECRET_FILE` 仍用)、`default.conf.prod` http-context resolver **必留**(W-F11 `resolve` 用)、R3 嚴格限 `sys_user_error.rs` 5 個 `1xxx`。

**兩段式 commit**:R3 動 rust-api worktree(`code.rs` + `sys_user_error.rs`)→ Stage 1;其餘全為 outer 改動 → Stage 2。

> ⚠️ **Time gate**:F14 屬 P5,依 DESIGN-A §6.2「過渡橋 F10 在 DESIGN-A 形態運行 N 週驗證」後才應 `/speckit-implement`。本 plan 為設計先行。pre-cutover 盤點(28 feature 全 spec-complete、0 GAPS)即 time gate 想要的驗證證據。

## Technical Context

**Language/Version**: 無新程式碼 — R3 為 Rust(edition 對齊 rust-api workspace、不指定版本);其餘為 nginx config / YAML / shell / markdown 改動
**Primary Dependencies**: 無新增。R3 觸及 `server-core`(`web::code` namespace 表、既有 crate);其餘改動為 `deploy/front-nginx/conf.d/*.conf`(nginx)、`docker-compose*.yml`、`deploy/`、`CLAUDE.md`、`docs/`
**Storage**: N/A — F14 **不改 DB schema、不增表、無 migration**;不讀寫任何 table
**Testing**: 無 rust unit test(R3 為常數登記、無可測純函式面;cutover 無程式邏輯);acceptance = curl + psql + `docker compose exec` / `nginx -t` / `grep` / `git diff`(per spec FR-027)
**Target Platform**: Linux container — front-nginx(`nginx:1.27-alpine`)+ rust-api docker image
**Project Type**: deployment cutover feature — outer repo 設定拔除為主 + rust-api worktree 1 個附帶 code-hygiene 改動(R3)
**Performance Goals**: N/A — cutover 為一次性設定改動
**Constraints**: base-web 0 diff(Constitution IV)、無 DB schema 改、無 migration、不刪 `refresh_token_secret` secret、不拔 Casbin redis pub-sub channel、不改 rust refresh endpoint 業務邏輯、不刪 nestjs fork 源碼目錄
**Scale/Scope**: outer **~11 個檔改 + 1 個檔刪 + 1 個檔新增**(`default.conf` + `default.conf.prod` + `docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.prod.yml` + `deploy/front-nginx/README.md` + `CLAUDE.md` + 3 份 design/checklist doc 改;刪 `deploy/build-nestjs.sh`;新增 `cleanup_database_url.txt.example`)+ rust-api worktree **2 個檔改**(`core/src/web/code.rs` + `service/src/admin/errors/sys_user_error.rs`)

無 NEEDS CLARIFICATION — brainstorm 3 拍板點 + 途徑 2 saturated、`/speckit-clarify` 0 question(taxonomy 全 Clear)、Phase 0 research 7 個 R-Q 已解。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | F14 不碰 Casbin enforce 邏輯、不碰 `casbin_rule`;nestjs 退場後 enforcement 全由 rust 單一負責(強化 Principle I「Casbin 後端為唯一權威」、消除過渡期雙後端) |
| II | Soft Delete + Audit | **PASS** | F14 無 DB 寫入、無 migration、不碰任何 entity / audit 路徑。R3 為 error code 常數登記、與 audit 無關 |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | F14 是 Principle III 的**收尾**:移除 nestjs 後系統回到單一後端、無服務間 forward、每個 endpoint 由 rust 單一 enforcement。Principle III line 62「DESIGN-A 過渡期 nestjs-bound location 須包在 TRANSITIONAL marker block 內」— F14 把該 block 整段刪除,過渡狀態正式結束 |
| IV | base 不改動邊界 | **PASS** | F14 不動 `base-web/` 任何檔(spec FR-023 / SC-009);R1 已查證 base-web HTTP 層成功判定 `String(code)==="0"`、吃 rust `code:0`,cutover 後 refresh response 由 nestjs `code:200` 變 rust `code:0` 反而修復 base-web silent refresh — 後端適應 base、base 零改 |
| V | 漸進收縮 | **PASS** | F14 = DESIGN-A→DESIGN-B 收縮的**最後一步**。Constitution Principle V line 87 明定遷移路徑「只動 nginx config(刪 TRANSITIONAL block + 改路由)+ docker-compose(移除 nestjs service);DB / 應用層 / 業務 code 零改動」— F14 cutover 本體(FR-001~FR-012)完全符合。〔R3 註記:R3 觸及 rust-api `code.rs` + `sys_user_error.rs`,屬 F14 附帶的 code-hygiene cleanup(user brainstorm Q1 拍板納入)、**非「遷移路徑」本身**;R3 為 error code 常數 namespace 登記、**零行為改變**(FR-015)、非業務邏輯改動,不違反 Principle V — line 87 描述的是 migration 本身的範圍,不禁止在同一 feature 內附帶 code-hygiene 修補〕 |

**架構約束檢查**:
- **部署形態**:F14 改 `docker-compose*.yml`(移除一個 service)— 在既有 docker-compose 單機運行形態內,N/A violation
- **資料庫**:F14 **無 migration、不改 schema** — N/A
- **快取與 pub-sub**:Casbin `casbin:policy:invalidate` channel **保留**;Constitution line 98「單 instance 部署亦預設啟用 pub-sub 機制(self-publish/self-subscribe 無 harm)」明確支持保留(W-F11 已使其 rust-to-rust)— PASS
- **TLS**:F14 不改 TLS 結構(443 ssl server block 本體保留、只刪其內 TRANSITIONAL location block)— N/A
- **Secret 注入**:F14 保留 `refresh_token_secret` 的 `_FILE` pattern、補 R4 `cleanup_database_url.txt.example` — 與 Constitution「Docker secrets + `_FILE` pattern」一致、PASS
- **Port / Observability / Backup / 背景工作 / CI/CD**:F14 移除 nestjs `:11082` port;不碰 observability / backup / 背景工作;`deploy/build-nestjs.sh` 為本機 helper script、非 CI platform config — N/A

**Gate 結果**:**5 PASS / 0 N/A-as-violation / 0 violation** — Constitution Check 通過、無需 Complexity Tracking。F14 為 Constitution Principle III + V 的具體收尾 feature(過渡結束、漸進收縮到位)。

## Project Structure

### Documentation (this feature)

```text
specs/029-design-a-to-b-cutover/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出 — R-Q1~R-Q7 ✓
├── data-model.md        # Phase 1 產出 — E1~E6 變更模型
├── quickstart.md        # Phase 1 產出
├── contracts/
│   └── verification-commands.md   # Phase 1 產出 — C-V1~C-V11
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(本指令不產)
```

### Source (outer repo + rust-api worktree)

```text
# === Stage 1:rust-api worktree(R3)===
rust-api/server/core/src/web/code.rs                       # 改:加 5 個 CODE_USER_* 常數
rust-api/server/service/src/admin/errors/sys_user_error.rs # 改:fn code() 5 個 inline literal 改引用常數

# === Stage 2:outer repo ===
deploy/front-nginx/conf.d/default.conf          # 改:刪 2 個 TRANSITIONAL block(38-48 / 82-92)
deploy/front-nginx/conf.d/default.conf.prod     # 改:刪 1 個 TRANSITIONAL block(52-62)
deploy/front-nginx/README.md                    # 改:移除 line 86 nestjs/TRANSITIONAL boundary note
docker-compose.yml                              # 改:移除 nestjs service block(240-291)+ 修檔頭註解
docker-compose.dev.yml                          # 改:移除 nestjs stanza(28-30)+ 修檔頭註解
docker-compose.prod.yml                         # 改:移除 nestjs stanza(21-23)+ 修檔頭註解
deploy/build-nestjs.sh                          # 刪除(W-FA3)
deploy/secrets/cleanup_database_url.txt.example # 新增(R4)
deploy/secrets/refresh_token_secret.txt.example # 改:首行註解「for nestjs」改指 rust-api
CLAUDE.md                                       # 改:§5.2/§5.2.1 移除 nestjs/track-a/build-nestjs;§10 SPECKIT marker
docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md        # 改:檔頭加「已被取代」註記
docs/INTEGRATION-DESIGN-B-RUST-ONLY.md          # 改:檔頭加「現行設計」註記
docs/INTEGRATION-CHECKLIST.md                   # 改:F14 row + Current Focus + 里程碑 + R3/R4 勾掉
（無 DB migration、無 base-web 改、不刪 fork260509-soybean-admin-nestjs/ 源碼目錄）
```

**Structure Decision**: F14 為**設定拔除型** feature — 主體是 outer repo 的 nginx / docker-compose / deploy / doc 改動(類 W-F5/W-F6/W-F7 純 outer),但因 brainstorm Q1 拍板納入 R3(rust-api `code.rs` + `sys_user_error.rs` 的 code-hygiene),整體為**兩段式 commit**:Stage 1 rust-api worktree(R3、2 檔)、Stage 2 outer(其餘)。無新 crate、無新模組、無 migration。

## Phase 0: research(見 [research.md](research.md))

F14 brainstorm 已 saturated(3 拍板點 + 途徑 2);Phase 0 由一支 codebase research agent 對 outer + rust-api 調查,解 spec 列的 7 個 R-Q:
- R-Q1:3 個 TRANSITIONAL block 行範圍(`default.conf` 38-48/82-92、`default.conf.prod` 52-62)、`sed` 刪除安全、刪後落 `location /api/`
- R-Q2:nestjs service block 邊界(3 檔)、`track-a` profile 唯 nestjs、`refresh_token_secret` 必留
- R-Q3:`sys_user_error.rs` 5 個 inline literal、`code.rs` namespace 命名慣例、R3 為 additive 零行為改變
- R-Q4:CLAUDE.md §5.2/§5.2.1 nestjs 引用點清單
- R-Q5:front-nginx README 僅 line 86 一處
- R-Q6:刪 block 後 nginx -t 預期通過、無補償改動
- R-Q7:DESIGN-A/B doc 檔頭結構、狀態註記插入位置

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 nginx TRANSITIONAL block 拔除 / E2 docker-compose nestjs service 移除 / E3 build script 刪除 / E4 R3 error code namespace 登記 / E5 R4 secret 範本 / E6 doc 收尾;含 cutover 後 refresh data flow
- **contracts/verification-commands.md**:C-V1~C-V11 — rust-api image rebuild / dev stack 無 nestjs healthy / nginx -t + grep TRANSITIONAL 0 / refresh 經 nginx 走 rust / login→refresh 循環 / track-a profile no-op / R3 code.rs 常數 / R4 .txt.example / build-nestjs.sh 不存在 / design doc 檔頭 / 三邊 scope
- **quickstart.md**:F14 落地操作(Stage 1 R3 + Stage 2 拔除 + acceptance + 兩段式 commit)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — data-model E1-E6 確認無 DB schema 改、無 base-web 改、無服務間 forward、不刪 `refresh_token_secret`、不拔 Casbin pub-sub;cutover 本體完全符合 Principle V line 87 遷移路徑;R3 為零行為改變的 code-hygiene、不違反任一 principle;**5 PASS / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
