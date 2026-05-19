# Implementation Plan: F10 — refresh-token-nestjs-bridge

**Branch**: `017-refresh-token-nestjs-bridge` | **Date**: 2026-05-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-refresh-token-nestjs-bridge/spec.md`

## Summary

rev1 application 階段 Phase 4 **第一個** feature(W-FA1/W-FA2/W-FA3 三件套 deploy 結構完整後接續、F11/F12/F13 之前)。**verification-heavy + 視 friction 補 patch** 模式 — 跑通 end-to-end refreshToken flow(rust `/api/auth/login` → 真 token → nginx → nestjs `/api/auth/refreshToken` → 回新 token pair → 新 token 可用),5 個 acceptance scenario(HTTP 層 + DB 準據 loose assert),預期 0-3 處 rust source 改動。

**核心技術方法**:
- W-FA1 dev + `--profile track-a` profile 起 7 service stack 為 baseline 環境
- inline bash + `contracts/verification-commands.md`(類 W-FA2 慣例、無新 deploy script)
- US1 跑 3 步 curl(login → refreshToken → /route/getUserRoutes 用新 token)
- US2 跑 2 個 psql query 對 sys_tokens 表(login 後 1 row + refreshToken 後 loose assert status 變動 OR 新 row、per Clarify Q1)
- 出 friction 時 rust source 1-3 處 patch(R-1 預估落點:JWT secret 簽用 jwt_secret vs refresh_token_secret)
- Friction 落 nestjs 側時 rust 遷就(per spec Q5)
- commit 模式視 rust 改動數:0 → 單段;1-3 → 兩段式

## Technical Context

**Language/Version**:
- rust-api: Rust 1.75+(對齊 W-F1 既有 toolchain)
- nestjs source: TypeScript 5+ / Node 22.11.0(對齊 W-FA1 落定 NODE_VERSION)— **F10 不動 nestjs source**
- spec docs: Markdown
- acceptance scripts: bash(F10 inline、無新 .sh)

**Primary Dependencies**:
- rust-api: axum + sea-orm + jsonwebtoken + Casbin(對齊 F5.1 既有)
- nestjs: NestJS + Prisma + @nestjs/jwt + @nestjs/cqrs(沿用 W-FA1 既有 image)
- redis: ioredis(JWT token cache、Casbin policy cache — F10 不主動操作)
- postgres: pg client(F10 直接 psql 驗 sys_tokens)
- nginx: 1.27-alpine + variable proxy_pass + lazy DNS(W-FA2 落定、F10 不改 config)

**Storage**:
- postgres 唯一持久狀態(sys_tokens / sys_user / Casbin policy)
- redis 輔助 cache(F10 不直接操作)

**Testing**:
- F10 = verification-heavy feature、無 unit test code(不寫新 rust test / no nestjs source 改動)
- Acceptance:bash + curl + psql + docker compose ps 等 host-side tooling
- 對齊 W-FA2 acceptance 模式(per spec FR-015 自然推論)

**Target Platform**:
- WSL2 Linux(host)+ docker 29.4.0
- W-FA1 stack:7 service(postgres / redis / migration / rust-api / base-web / front-nginx / nestjs、dev profile=track-a)

**Project Type**:rev1 application Phase 4 feature、跨服務 end-to-end verification + 視情況 rust-side compatibility patch

**Performance Goals**:
- F10 acceptance 跑時間 ≤ 10s(5 個 curl + psql、不含 stack 啟動、per NFR-002)
- 不規範 nestjs / rust runtime performance(那是 application 通用考量)

**Constraints**:
- **不動 nestjs source**(嚴守 DESIGN-A §3.2、Constitution Principle IV/V 延伸、per spec Q2 + Q5)
- **不寫 / 不驗 audit log**(per spec Q2、留 F13)
- **不做 Casbin pub-sub channel**(per spec Q1 implicit、留 F11/F13)
- **不驗 base-web SPA e2e**(per spec Q4)
- **不驗 JWT shape claim assertion**(per spec Q4、留 F13)
- rust source 改動上限 1-3 處(per spec Q3、超出觸發 R-4 abort + F10.1 follow-up)

**Scale/Scope**:
- F10 spec ~215 行(對齊 W-FA3 200 行慣例、NFR-001)
- 預估 ~10-15 task(對齊 NFR-001、F10 是 application feature 而非 deploy feature、規模較 W-FA3 21 task 略小)
- 5 acceptance scenario(US1 3 + US2 2、per spec)
- 0-3 處 rust source 改動 LOC ≤ 30 行(per FR-008 + SC-006)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles(5 個)

| Principle | F10 對齊 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe** | F10 不改 Casbin policy / enforcer 邏輯;refreshToken endpoint @Public bypass(per nestjs source);新 access_token 用 /route/getUserRoutes(rust Casbin enforce、F5.1 既有) | PASS |
| **II. Soft Delete + Audit Log** | F10 acceptance 不直接驗 audit(per Q2 退場);但 rust login 既有 AccessTokenEvent 寫 sys_tokens 含 audit、F10 不破壞此既有紀律 | PASS |
| **III. 嚴版禁 Forward + 單一職責** | F10 nestjs refreshToken endpoint 走 nginx TRANSITIONAL block(W-FA2 落定)、不引入 backend 互呼;refreshToken endpoint 唯一由 nestjs 負責 enforcement、rust login + /route/getUserRoutes 各自 owner、無重疊 | PASS |
| **IV. base 不改動邊界** | F10 嚴禁改 base-web src(FR-014)、嚴禁改 nestjs source(FR-003、Principle V 延伸);只可動 rust source 1-3 處 | PASS |
| **V. 漸進收縮** | F10 為 DESIGN-A 過渡 feature(F13 rust 接手後 F14 cutover 整段退場);spec 明列「F13 rust 補實作 + F14 cutover」outbound dependency;F10 不引入 nestjs source 改動 + 不引入 schema 改動 → DESIGN-B 退場時 zero schema 改動 | PASS |

### 架構約束(12 個 + 1 個 nestjs 部署形態)

| 約束 | F10 對齊 | 狀態 |
|---|---|---|
| 部署形態(docker + compose) | F10 用 W-FA1 既有 dev + track-a profile、不新建 docker resource | PASS |
| PostgreSQL 唯一持久 | F10 sys_tokens 驗 + rust login 寫 + nestjs refreshToken read 都走同一 postgres | PASS |
| redis pub-sub | F10 不主動操作 redis pub-sub channel(per spec OOS-003);但既有 stack 內 redis 仍啟、不破壞 | PASS |
| TLS | F10 用 dev http(127.0.0.1:11080)、對齊 W-F6 dev 慣例;prod 不在 F10 範疇驗 | PASS |
| Secret 注入 | F10 用 W-FA1 既有 _FILE pattern(jwt_secret + refresh_token_secret);若 friction R-1 觸發改 rust 用哪個 secret 也走 _FILE pattern | PASS |
| DB migration | F10 不動 migration、不引新 migration | PASS |
| Port 規劃 | F10 用 W-F7 + W-FA1 既有 port(11080 / 15432 / 16379 / 11082);無新 port | PASS |
| Observability | F10 acceptance 失敗時可 grep nestjs/rust log(NFR-003);不引入新 log infrastructure | PASS |
| 結構化 log | 不改動 — 既有 logs 維持結構化 JSON、F10 只查 | PASS |
| Backup | 不在範疇、F10 不動 backup | N/A |
| 背景工作 | 不在範疇、F10 不動 background job | N/A |
| CI/CD platform | 不在範疇、F10 是 application verification(不像 W-F17 CI/CD pipeline) | N/A |
| nestjs 部署形態(transitional)| F10 用 W-FA1 nestjs container(profile=track-a);F14 cutover 後 F10 acceptance 失效(預期、那是 F13 replace 後 rust 自實作)| PASS(per Principle V) |

### 開發流程(6 個)

| 流程 | F10 對齊 | 狀態 |
|---|---|---|
| spec-kit 流程紀律 | F10 走 brainstorm 014 → /speckit-specify → /speckit-clarify(Q1)→ /speckit-plan(此文件)→ /speckit-tasks → /speckit-implement | PASS |
| Constitution Check 失敗處理 | 此 plan 階段 17 條 Constitution Check 全 PASS、無 violation 進 Complexity Tracking | PASS |
| 兩段式 commit | F10 視 rust source 改動數(0 → 單段、1-3 → 兩段式)、per spec FR-009 + CLAUDE.md §6.1 | PASS |
| Commit message | Conventional + 中文 subject + Co-Authored-By(對齊 W-F*/W-FA*) | PASS |
| Push 確認 | 沿襲 CLAUDE.md §5;F10 落 commit 後等 user 同意 push | PASS |
| TLS 紀律 | F10 dev http、無 prod 觸及、合 dev 慣例 | PASS |
| DESIGN 文件權威 | spec 引用 DESIGN-A §6/§3.2/§3.3 + 既有 W-FA*/F5.1/F1.1/F4 spec 為 source | PASS |

**結論**:Constitution Check **17 PASS / 4 N/A / 0 violation**。無需 Complexity Tracking 表內合理化任何違反。

## Project Structure

### Documentation (this feature)

```text
specs/017-refresh-token-nestjs-bridge/
├── plan.md              # 本檔(/speckit-plan 輸出)
├── spec.md              # /speckit-specify 階段已建(215 行、含 Clarifications 2026-05-19 Q1)
├── research.md          # Phase 0 輸出(/speckit-plan、本回合即建)
├── data-model.md        # Phase 1 輸出(/speckit-plan、本回合即建)
├── quickstart.md        # Phase 1 輸出(/speckit-plan、本回合即建)
├── contracts/
│   └── verification-commands.md  # Phase 1 輸出(/speckit-plan、本回合即建、5 個 C-V 對應 5 AC)
├── checklists/
│   └── requirements.md  # /speckit-specify 階段已建(checklist 全 PASS)
└── tasks.md             # Phase 2 輸出(/speckit-tasks 階段、不由 /speckit-plan 建)
```

### Outer repo 改動(F10 implement 階段預期變動範圍)

```text
fork260509-rev1/
├── specs/017-refresh-token-nestjs-bridge/
│   ├── spec.md          # 已建(無變動)
│   ├── plan.md          # 本檔(無 implement-time 變動)
│   ├── research.md      # 本回合建(無 implement-time 變動)
│   ├── data-model.md    # 本回合建(無 implement-time 變動)
│   ├── quickstart.md    # 本回合建(無 implement-time 變動)
│   ├── contracts/verification-commands.md  # 本回合建(無 implement-time 變動)
│   ├── checklists/requirements.md  # 已建(無變動)
│   └── tasks.md         # /speckit-tasks 階段建
├── docs/INTEGRATION-CHECKLIST.md   # implement 階段更新(Active feature / 已完成里程碑 / application Phase 4 進度)
├── CLAUDE.md            # 可能微調 §5.2.1(F10 acceptance curl 範例、FR-017 MAY)+ §10 active feature(SOP hook 自動)
└── .specify/feature.json  # /speckit-specify 階段已更新
```

### Worktree 改動(視 friction、0-3 處 rust source)

```text
rust-api/ (worktree、長期分支 rev1-admin-rust-api)
└── server/
    └── service/src/admin/events/access_token_event.rs  # 視 friction 改 1 處
    └── ... (其他預期落點視 R-1/R-2 surface)
# 0 改動為理想路徑(spec 與既有 source 完全對齊、F10 純驗證 feature)
# 1-3 改動 = compatibility patch feature、走兩段式 commit
# > 3 改動 = R-4 abort 觸發、拆 F10.1 follow-up
```

### Image / artifact 改動(無新)

```text
# F10 用 W-FA3 落定的 deploy/build-nestjs.sh 跑 nestjs image build
# 不新建 docker image / volume / network
# 不改 docker compose 配置(FR-012)
```

**Structure Decision**:F10 屬 outer + 視情況 worktree feature(類 F5.1 / F6 application Phase pattern)、不涉及 deploy 結構改動(W-FA1/W-FA2/W-FA3 已就位)。Application source 改動上限為 rust source 1-3 處(per Q3 + Q5)、若 friction surface 上限 → R-4 abort path 拆 F10.1。

## Complexity Tracking

> No constitution violations to track. F10 設計嚴守 5 Core Principles + 12 架構約束;Q1-Q5 brainstorm 拍板皆指向最小侵入路徑(0 nestjs source 改動、0-3 rust patch)。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (無) | — | — |

---

## Phase 0 — Outline & Research(由本 /speckit-plan 執行)

per Outline:跑 research、解 NEEDS CLARIFICATION、產 `research.md`。F10 spec 階段 Q1 已 clarify、無 NEEDS CLARIFICATION 殘留。Phase 0 主要研究:

1. **nestjs refreshToken endpoint dependency tree**:確認 `authentication.service.ts::refreshToken()` 在 `tokenDetails` 查 sys_tokens 後是否 cascade 查 sys_user / sys_role / sys_menu(影響 R-3 Status PG enum cascade 風險)
2. **rust login flow refresh_token 簽用哪個 secret**:grep `LoginService` / `JwtService`,看 `jwt_secret` vs `refresh_token_secret`(per R-1、影響 friction 預判)
3. **nestjs `RefreshTokenUsedEvent` status 值**:grep `tokens-aggregate` / `tokens-entity` / event emit 路徑,確認 refreshToken 後 sys_tokens row 變動細節(per Clarify Q1 loose assert 已決、但研究確認後可在 quickstart 補 background)

**Output**:`research.md`(本回合即建)

## Phase 1 — Design & Contracts(由本 /speckit-plan 執行)

per Outline:抽 entities + 定 interface contracts + 寫 quickstart + update agent context。

1. **Entities**(`data-model.md`):
   - `sys_tokens` table schema(W-FA1 已驗、F10 不改、僅 reference)
   - `LoginInput` / `LoginResponse`(rust handler shape、F5.1 已建、F10 acceptance 期 envelope)
   - `RefreshTokenInput` / `RefreshTokenResponse`(nestjs DTO、既有 shape、F10 acceptance 期回 `{token, refreshToken}`)
   - State transitions:Active(rust login 寫)→ (per nestjs handler)變動(F10 不 hard-code、loose assert per Clarify Q1)

2. **Contracts**(`contracts/verification-commands.md`):5 個 C-V 對應 5 AC + 額外 zero-regression 驗
   - C-V1 curl login(US1.1)
   - C-V2 curl refreshToken(US1.2)
   - C-V3 curl getUserRoutes(US1.3)
   - C-V4 psql sys_tokens login 後 1 row(US2.1)
   - C-V5 psql sys_tokens refreshToken 後 loose assert(US2.2)
   - C-V6 git diff three sides zero(SC-007 / SC-008)
   - C-V7 single/兩段 commit verify(SC-006)
   - 無 contracts/script-contract.md(F10 不新建 shell script)

3. **Quickstart**(`quickstart.md`):
   - operator 走完 F10 acceptance 的完整流程(stack up → run 5 curl/psql → cleanup)
   - 含 happy path + 故障排查段(per W-FA2 / W-FA3 慣例)

4. **Agent context update**:更新 `CLAUDE.md` 的 SPECKIT START/END marker 之間的 plan ref

**Output**:`research.md`(Phase 0)、`data-model.md` / `contracts/verification-commands.md` / `quickstart.md`(Phase 1)、`CLAUDE.md` SPECKIT marker(Phase 1)

## Phase 2 — Tasks(由 `/speckit-tasks` 階段執行、不由本 /speckit-plan 建)

per W-FA3 慣例,~10-15 task,Phase organization:
- Phase 1 Setup(~2-3 task):git branch / docker daemon / stack 起 / W-FA1 baseline 確認
- Phase 2 Foundational(~2 task):grep 既有 rust login / nestjs refreshToken source 確認 reference 路徑、grep nestjs `refresh-token-used-event.handler.ts` 確認 status 變動行為
- Phase 3 US1 Acceptance(~3-5 task):curl login / curl refreshToken / curl getUserRoutes + verify
- Phase 4 US2 Acceptance(~2 task):psql sys_tokens login 後 / psql refreshToken 後 loose assert
- Phase 5 Friction Handling(視 acceptance result、0-3 處 rust patch):surface friction → grep rust source → patch → re-verify → 兩段式 commit;若 > 3 處 → abort F10 + 拆 F10.1
- Phase 6 Zero-regression(~2 task):base-web/rust-api/nestjs fork 三邊零改動驗 + W-FA1 stack 仍 7 service healthy
- Phase 7 Documentation(~2 task):CLAUDE.md §10 active feature update + INTEGRATION-CHECKLIST.md F10 row 補
- Phase 8 Commit(~2 task):視 rust 改動數(0 → 單段 outer commit / 1-3 → 兩段式 commit)+ push 等 user 同意

---

## Re-evaluate Constitution Check Post-Design(2026-05-19 post-Phase 1)

**結果**:Constitution Check 仍 **17 PASS / 4 N/A / 0 violation**(Phase 0 research surface R-7/R-8 finding 推翻 spec Q3 上限,user 拍板 Option A、F10 範疇 reset 為 wire-up + friction 紀錄 feature、0 rust patch、拆 F10.1+F10.2 follow-up — 此 reset 強化 Principle V「漸進收縮」、Principle IV「base 不改動邊界」、Principle III「禁 Forward」對齊)。

| Principle | Post-Option A 對齊度變化 |
|---|---|
| I. RBAC Fail-safe | 無變化(F10 不改 Casbin policy / enforcer 邏輯)|
| II. Soft Delete + Audit | 無變化(F10 不驗 audit、留 F13)|
| III. 嚴版禁 Forward | 強化(F10 不引入 backend 互呼;F10.1/F10.2 follow-up 也守此 principle)|
| IV. base 不改動邊界 | 強化(F10 reset 後固定 0 應用層改動、嚴守 base / rust / nestjs 三邊零改動;原 1-3 處 rust patch 改為 0)|
| V. 漸進收縮 | 強化(F10 scope 收緊更貼「DESIGN-A 過渡 feature 不擴張 nestjs 範圍」原則;F10.1/F10.2 follow-up 動 rust 而非 nestjs、對齊 DESIGN-B 終局)|

**Phase 0 finding(R-7/R-8) → spec.md / plan.md patch 列表**:
- spec.md `Clarifications` 段加 Plan Phase 0 R-7/R-8 finding + Option A 拍板
- spec.md US1 改 `expected fail at friction surface`(原 happy path)
- spec.md US2 收緊到 1 AC(rust login 寫 sys_tokens self-consistent 驗、不驗跨服務變動)
- spec.md US3 加(F10.1 + F10.2 follow-up 範疇定義)
- spec.md FR-001/002/008/009/SC-001~009 對齊 reset
- spec.md Risks 加 R-7 / R-8 + 緩解走 F10.1 / F10.2 follow-up
- spec.md Outbound 加 F10.1 / F10.2(F11/F12/F13/F14 仍存)
- spec.md Commit 模式固定單段 outer commit
- plan.md Technical Context + Project Structure 改 worktree 改動 = 0
- plan.md Complexity Tracking 仍空(0 violation)

**Phase 1 artifact 規模(post-Option A)**:
- `data-model.md`:4 entity(sys_tokens / rust AuthOutput / nestjs RefreshTokenDTO / nestjs RefreshTokenUsedEvent)+ state transitions table
- `contracts/verification-commands.md`:7 C-V(C-V1~7 對齊 spec SC + zero diff + single commit)
- `quickstart.md`:含 6 Step + 故障排查段(F10 friction 紀錄 + F10.1/F10.2 follow-up 範疇)

下一步:`/speckit-tasks` 階段生 tasks.md(預期 ~10 task、F10 reset 後規模更輕)。
