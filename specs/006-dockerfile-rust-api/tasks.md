---
description: "Task list for W-F1 dockerfile-rust-api implementation"
---

# Tasks: W-F1 — dockerfile-rust-api

**Input**: Design documents from `/specs/006-dockerfile-rust-api/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/`](contracts/) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**: 本 feature acceptance test 走 `docker build` / `docker run` / `docker exec` / `curl` 等運行時驗證(per quickstart.md 15 scenarios)+ R-003 提及的 integration test(`/health` 路由不過 layer 驗);**unit test** 屬可選增量(W-F1 範疇主要靠 acceptance scenarios 驗、unit test 補 health_handler 字面行為)。

**Organization**: W-F1 為單一 P1 user story feature(spec.md 「唯一 US」);Setup + Foundational(pre-implement validation T1/T2)+ US1(實作)+ Polish(commit/push/merge)四階段。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel(different files / different worktrees / 不互依)
- **[Story]**: 僅 User Story phase 用 [US1] 標籤;Setup / Foundational / Polish 不標
- 路徑用 repo-relative 或 worktree-relative,outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`,rust-api worktree = outer 內 `rust-api/`

## Path Conventions

- **Outer (rev1-admin-root + feature branch)**: `specs/006-dockerfile-rust-api/*` / `CLAUDE.md` / `.specify/feature.json`
- **rust-api worktree (rev1-admin-rust-api 分支)**: `rust-api/Dockerfile` / `rust-api/.dockerignore` / `rust-api/server/initialize/src/router_initialization.rs`(改動點)
- **acceptance test execution**: docker host(outer repo root)

---

## Phase 1: Setup(Shared Infrastructure)

**Purpose**: 環境前置 / branch state 檢查 / docker 工具就位

- [ ] T001 確認 outer 在 feature branch `006-dockerfile-rust-api`:`git -C . branch --show-current` 應 output `006-dockerfile-rust-api`;若不在 → `git switch 006-dockerfile-rust-api`(spec-kit pre-hook 應該已建)
- [ ] T002 [P] 確認 rust-api worktree 在 `rev1-admin-rust-api` 分支:`git -C rust-api branch --show-current` 應 output `rev1-admin-rust-api`(per CLAUDE.md §1 worktree+submodule 雙重身分)
- [ ] T003 [P] 確認 docker BuildKit 可用:`docker buildx version` exit 0(per quickstart.md Prerequisites)
- [ ] T004 [P] 確認 host arch:`uname -m` 應 `x86_64`(per Q2 clarify、W-F1 target = linux/amd64)
- [ ] T005 [P] docker host disk 至少 5GB free:`df -h $(docker info --format '{{.DockerRootDir}}')`(per quickstart.md;builder cache + image storage)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**: 解 spec.md 的兩個 plan-stage validation assumption(R-001 cargo build / R-002 env binding);**完成這 2 個 task 才能進 US1 實作**

**⚠️ CRITICAL**: T010 / T011 必須 pass 才能進 Phase 3;若 fail,W-F1 範疇可能需要 case-by-case 擴大(per research.md plan-stage action)

- [ ] T010 在 docker container 內驗 host cargo build debian glibc 可 build(R-001):跑 `docker run --rm -v "$(pwd)/rust-api:/app" -w /app rust:1.86-slim-bookworm sh -c "apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates git && cargo build --release --bin server --bin migration"` — exit 0 為 pass;若 fail → audit stderr 找 missing dep / openssl symbol mismatch / etc.,plan 階段 case-by-case 補 apt package 或 Cargo.toml `[features]`
- [ ] T011 驗 `APP_SERVER_PORT` env 確實 override application.yaml server.port(R-002):從 host 跑 `cd rust-api && APP_SERVER_PORT=11081 APP_JWT_JWT_SECRET=$(openssl rand -hex 32) cargo run --bin server 2>&1 | head -20`(無 DB 會 retry、但 startup log 應在最初幾行印 listen port);抓 listen port log 行確認是 `11081` 而非 `10001`。若 fail → audit `rust-api/server/config/src/env_config.rs` 看 separator 配置可能為 `__` 或其他;若 binding 不支援、本 task 擴成「補 minimal config crate 改動」屬本 feature scope 例外
- [ ] T012 [P] grep audit existing /health route不存在(per research.md R-003 前提):`grep -rn -i "health\|readyz\|liveness" rust-api/server/ --include="*.rs" | grep -v test` 0 命中;若有命中、本 task fail、實作策略改成「擴 既有 endpoint」而非「新增」
- [ ] T013 [P] audit router_initialization.rs 結構:`grep -n "let mut app" rust-api/server/initialize/src/router_initialization.rs` 與 `grep -n "app.merge" rust-api/server/initialize/src/router_initialization.rs` 看 `app: Router` 在 fn 內哪行起始 + merge 呼叫位置(供 T020 mount /health 找正確 insertion point)

**Checkpoint**: Foundational ready — US1 implementation 可以開始

---

## Phase 3: User Story 1 — operator 在乾淨 docker 環境 build + run rev1 rust-api image(Priority: P1)🎯 MVP

**Story 來源**: spec.md `## User Story 1`(唯一 US,P1)

**Goal**: 產出可運行的 rev1 rust-api Docker image(debian+glibc multi-stage、含 server + migration binary、含 `/health` endpoint),透過 15 個 acceptance scenarios(Dimension A-E)100% pass 驗證,解鎖 W-F2 / W-F3 / W-F4 後續 P1 feature

**Independent Test**: 跑 quickstart.md 全 15 個 scenario(Scenario 1-3 Dimension A / 4-6 Dimension B / 7-9 + 9b Dimension C / 10-12 + 12b Dimension D / 13-15 Dimension E)100% pass + SC-001 ~ SC-005 量化目標達標

### Implementation tasks(rust-api worktree — `rev1-admin-rust-api` 分支)

- [ ] T020 [US1] 在 `rust-api/server/initialize/src/router_initialization.rs` `initialize_admin_router()` fn 末尾(所有 `merge_router!` / `app.merge(auth_router)` 之後、return `app` 之前),append `app = app.merge(Router::new().route("/health", get(|| async { "ok" })));`(per R-003 拍板 + data-model.md E5 + dockerfile-structure.md C-D2 ~ C-D3 結構);若 file 開頭未 import `get` from `axum::routing` 或未 import `Router` from `axum`,順便補 import
- [ ] T021 [US1] 覆寫 `rust-api/Dockerfile`(刪既有 alpine 版本、寫 debian 版本)— 結構嚴格對齊 contracts/dockerfile-structure.md C-D1(ARG 宣告)+ C-D2(builder stage)+ C-D3(runtime stage)+ C-D5(forbidden patterns: 不出現 HEALTHCHECK / `:latest` / `--platform` / RUN secrets / migration entrypoint / cleanup-job entrypoint);ENV 必含 `TZ=Asia/Shanghai LANG=en_US.UTF-8 RUST_ENV=production APP_SERVER_PORT=11081`;ENTRYPOINT 必為 `["/usr/local/bin/server"]`
- [ ] T022 [P] [US1] 微調 `rust-api/.dockerignore`(per FR-019 / FR-020 + dockerfile-structure.md C-D6):確認既有排除 `/target /deploy /.idea /.vscode /bin LICENSE README.md **/.env **/Dockerfile*` 全保留;確認**不**排除 `Cargo.toml / Cargo.lock / server/ / axum-casbin/ / sea-orm-adapter/ / migration/ / xdb/ / .cargo/`(若任一被排會 builder 階段 compile fail)
- [ ] T023 [US1] (optional)補 unit test for /health handler:在 `rust-api/server/initialize/` 或 `rust-api/server/router/` 內加 `#[tokio::test]` 驗 `health_handler().await == "ok"`(per data-model.md E5 contract);此 task 為增量,若 acceptance scenario 12 + 12b 都 pass 可省略

### Acceptance verification(走 quickstart.md — outer repo root 執行 docker)

#### Dimension A — Dockerfile 結構重寫(per quickstart.md Scenario 1-3)

- [ ] T030 [US1] Scenario 1:`docker builder prune -f` + `cd rust-api && time docker build -t rust-api:test .` → exit 0、output 顯示 builder + runtime 兩 stage、第一次 build 5-10 分鐘(per SC-001);**記錄 wall clock time 到 acceptance log**
- [ ] T030b [US1] Scenario 1b(SC-003 cache hit 驗,解 analyze report E3):**不 prune cache**,立即重跑 `cd rust-api && time docker build -t rust-api:test .` 第二次 → 預期 < 1 分鐘(per SC-003)、stderr / stdout 應大量出現 `CACHED` 標記表示 layer + BuildKit cache mount hit;若 > 1 分鐘 → audit `docker buildx version` 與 host BuildKit cache driver 配置
- [ ] T031 [US1] Scenario 2:`docker image inspect rust-api:test --format='{{.Size}}'` → < 250MB(SC-002 target);250-300MB acceptable 紀錄到 plan 風險段;> 300MB 須回頭優化
- [ ] T032 [P] [US1] Scenario 3:`docker history rust-api:test` → 看不到 builder stage 中間 layer(multi-stage 正確、build deps 不混進 runtime)

#### Dimension B — Non-root user 配置(per quickstart.md Scenario 4-6)

- [ ] T033 [P] [US1] Scenario 4:`docker run --rm --entrypoint whoami rust-api:test` → stdout = `rust-api`
- [ ] T034 [P] [US1] Scenario 5:`docker run --rm --entrypoint id rust-api:test` → 含 `uid=10001(rust-api) gid=10001(rust-api)`
- [ ] T035 [P] [US1] Scenario 6:`docker run --rm --entrypoint ls rust-api:test -la /app/server/resources/` → 3 個檔(application.yaml / ip2region.xdb / rbac_model.conf),owner = `rust-api:rust-api`

#### Dimension C — Binary 可用性(per quickstart.md Scenario 7-9 + 9b)

- [ ] T036 [P] [US1] Scenario 7:`docker run --rm --entrypoint /usr/local/bin/migration rust-api:test help` → 顯示 sea-orm migration CLI help(含 up/down/fresh/refresh/reset/status/generate)
- [ ] T037 [US1] Scenario 8:`docker run --rm rust-api:test` 無任何 env → 啟動 panic、stderr 含 F1.1 secret 缺失訊息(substring "jwt_secret" / "APP_JWT_JWT_SECRET")、exit != 0
- [ ] T038 [US1] Scenario 9(修正:rust-api 實際 fail-fast on DB):`docker run -d --name w-f1-debug -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) rust-api:test` + `sleep 6` + `docker logs w-f1-debug 2>&1 | tail -25` + `docker inspect w-f1-debug --format '{{.State.ExitCode}}'` → log 應顯示:F1.1 secret 驗證通過(無 placeholder 訊息)+ config 載入 + xdb 初始化 + `Failed to connect to primary database: ... Name or service not known` 然後 exit code = 1(不 retry);證明 W-F1 image 啟動序列正確、F1.1 layer 對應 brainstorm Q3 解 + 後續 init stage 跑通
- [ ] T039 [US1] Scenario 9b:`docker run -d --name w-f1-port-test -p 11081:11081 -e APP_JWT_JWT_SECRET=$(openssl rand -hex 32) rust-api:test` + `sleep 3` + `docker exec w-f1-port-test sh -c 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null'` → listen `0.0.0.0:11081`(而非 :10001);證明 `APP_SERVER_PORT=11081` env override 生效
- [ ] T039b [US1] Scenario 9c(FR-011 其餘 3 個 ENV 驗,解 analyze report E2):同 container 起著時跑 `docker exec w-f1-port-test sh -c 'echo "TZ=$TZ"; echo "LANG=$LANG"; echo "RUST_ENV=$RUST_ENV"; date'` → 4 行 output 分別含 `TZ=Asia/Shanghai`、`LANG=en_US.UTF-8`、`RUST_ENV=production`、上海時區的 `date` 輸出(`+0800` 時區標記、與 UTC 不同);驗完 `docker stop w-f1-port-test && docker rm w-f1-port-test`

#### Dimension D — `/health` endpoint(per quickstart.md Scenario 10-12 + 12b)

> Note: Dimension D 需要 minimal stack(postgres + redis)— quickstart.md 提供 ad-hoc docker run + network 步驟(非 W-F3 deliverable)

- [ ] T040 [US1] minimal stack setup:依 quickstart.md `## Prerequisites - 準備 minimal stack` 段跑 `docker network create rev1-w-f1-test` + 起 postgres / redis container + 跑 migration up + 起 rust-api container
- [ ] T041 [US1] Scenario 10:`docker exec w-f1-rust-api curl -f http://localhost:11081/health` → 200 + body `ok`(functional check)
- [ ] T041b [US1] Scenario 10b(SC-004 p99 量化驗,解 analyze report E4 + B1):**從 host 跑 N=100 次 latency 量化**:`for i in {1..10}; do curl -s http://localhost:11081/health > /dev/null; done`(warmup、丟棄)+ `for i in {1..100}; do /usr/bin/time -f "%e" curl -s http://localhost:11081/health -o /dev/null 2>> /tmp/health-latency.log; done` + `sort -n /tmp/health-latency.log | awk 'NR==95'` 看 p95、`awk 'NR==99'` 看 p99 → **p99 < 0.05 秒(50ms)per SC-004**。Methodology:warmup 10 次跳過、N=100 樣本、不含 docker exec overhead(從 host 直接 curl 11081 port forward);若 ab 工具可用、改 `ab -n 100 -c 1 http://localhost:11081/health` 看 "99% < ?ms" 行
- [ ] T042 [P] [US1] Scenario 11:`curl -v http://localhost:11081/health 2>&1 | grep -E "^< HTTP|^ok$"` → 看到 `< HTTP/1.1 200 OK` + `ok`(無 Authorization header 也 200,證明 public)
- [ ] T043 [P] [US1] Scenario 12:`grep -rn "/health" rust-api/server/router/src/ rust-api/server/initialize/src/router_initialization.rs` → 至少 1 命中(`.route("/health", get(...))` 樣式)
- [ ] T044 [US1] Scenario 12b(INFO log silent):tail rust-api container log → `for i in 1..10; do curl -s http://localhost:11081/health; done` → diff log 前後應 0 個 `/health` 相關 row;改 `RUST_LOG=debug` 重起 container + 重複 → 有 debug 級別 trace 命中
- [ ] T044b [US1] Scenario 12c(SC-008 F5.1 regression 驗,解 analyze report E1):**用 W-F1 image 跑通 F5.1 acceptance subset 確認 musl→glibc 切換不破壞既有 login flow**(per quickstart.md SC-008 verification 對照):(a) `curl -s -X POST http://localhost:11081/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}'` → response code:0 + data.token + data.refreshToken(F4 envelope camelCase、per F5.1 spec);(b) export TOKEN=...; `curl -s http://localhost:11081/api/auth/getUserInfo -H "Authorization: Bearer $TOKEN"` → response code:0 + data.userId / data.userName / data.roles / data.buttons;(c) `curl -s http://localhost:11081/api/route/getUserRoutes -H "Authorization: Bearer $TOKEN"` → response code:0 + data.routes / data.home。3 個 endpoint 全 pass = SC-008 ✓ 證明既有 F5.1 user story 在 W-F1 image 上仍 work、無 regression。若任一 fail → 須 debug musl→glibc 是否影響 BCrypt / JWT / Casbin / sea-orm 等行為
- [ ] T045 [US1] minimal stack cleanup:`docker stop w-f1-rust-api w-f1-postgres w-f1-redis` + `docker rm` + `docker network rm rev1-w-f1-test`

#### Dimension E — Image tagging convention(per quickstart.md Scenario 13-15)

- [ ] T046 [P] [US1] Scenario 13:`grep -E "^- \*\*FR-01[678]\*\*" specs/006-dockerfile-rust-api/spec.md` → 3 行命中(FR-016 + FR-017 + FR-018)
- [ ] T047 [P] [US1] Scenario 14:`SHA=$(cd rust-api && git rev-parse --short=7 HEAD) && docker build -t rust-api:${SHA} rust-api/` → tag 創建成功
- [ ] T048 [P] [US1] Scenario 15:`docker build -t rust-api:rev1-admin-rust-api rust-api/` → branch tag 創建成功

**Checkpoint**: 15 個 acceptance scenarios + SC-001~SC-005 全 pass → US1 完成、解鎖 Polish

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: 兩段式 commit(per CLAUDE.md §6.1)+ SHA pin update + outer commit + push 確認 + merge 回 rev1-admin-root + 解鎖 W-F2/W-F3/W-F4

### 第一段 commit:rust-api worktree → rev1-admin-rust-api 分支

- [ ] T050 在 rust-api worktree 內 review changes:`cd rust-api && git status` 應顯示 modified `Dockerfile` / `.dockerignore` / `server/initialize/src/router_initialization.rs`(若 T023 有跑、含 test file)
- [ ] T051 在 rust-api worktree 內 stage + commit(conventional commit,中文 subject):`cd rust-api && git add Dockerfile .dockerignore server/initialize/src/router_initialization.rs` + `git commit -m "feat(rust-api): W-F1 dockerfile-rust-api 落地（debian+glibc multi-stage + /health endpoint）

實作 W-F1（per specs/006-dockerfile-rust-api/）：

- Dockerfile 從 alpine+musl 改寫為 debian+glibc multi-stage
- 統一 build server + migration 兩個 binary（同 image / 不同 entrypoint）
- runtime apt 加 curl（W-F3 healthcheck 用）
- non-root user 名 appuser → rust-api（uid 10001 沿用）
- 新增 ENV APP_SERVER_PORT=11081（走 F1.1 env-override / application.yaml 不動）
- 新增 /health endpoint（root level mount，跳過 apply_layers / 自動 silent INFO log + public）
- .dockerignore 微調確認 builder 必要 source 不被排除

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"`
- [ ] T052 在 rust-api worktree 內 push(**需 user 同意,per CLAUDE.md §5**):`cd rust-api && git push origin rev1-admin-rust-api`

### 第二段 commit:outer feature branch 006-dockerfile-rust-api

- [ ] T053 回 outer review:`cd .. && git status` 應顯示 modified `rust-api`(submodule SHA changed)+ untracked `specs/006-dockerfile-rust-api/`(若尚未 tracked)+ modified `.specify/feature.json` / `CLAUDE.md`(plan 階段已 modified、未 commit)
- [ ] T054 outer stage + commit:`git add rust-api specs/006-dockerfile-rust-api/ .specify/feature.json CLAUDE.md` + `git commit -m "chore(submodule): bump rust-api 到 $(cd rust-api && git rev-parse --short=7 HEAD) — W-F1 dockerfile-rust-api 完整落地 + spec-kit 全套

W-F1 為 rev1 deploy 階段第一個 feature（per DESIGN-W §11.1 Phase W-1 P1）。

Spec-kit 全套文件落 specs/006-dockerfile-rust-api/：
- spec.md（3 brainstorm 拍板 + 3 clarify 拍板）
- plan.md（Constitution Check 12 gate PASS、0 violation）
- research.md（6 個 R-XXX 解 Assumption）
- data-model.md（6 個 entity）
- contracts/（/health OpenAPI + Dockerfile structure C-D1~C-D7）
- quickstart.md（15 acceptance scenarios reproducer）
- tasks.md（4 phase task list,含本 commit 在內）
- checklists/requirements.md（spec quality validation PASS）

rust-api SHA pin 更新對應 W-F1 落地的 Dockerfile + .dockerignore + /health endpoint。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"`
- [ ] T055 outer push(**需 user 同意**):`git push origin 006-dockerfile-rust-api`

### Merge 回 rev1-admin-root + 解鎖

- [ ] T056 切回 rev1-admin-root + merge feature branch:`git switch rev1-admin-root && git merge --no-ff 006-dockerfile-rust-api -m "Merge branch '006-dockerfile-rust-api' into rev1-admin-root"`(merge --no-ff 保留 feature branch 結構,對齊 F1.1-F5.1 既有 merge pattern)
- [ ] T057 merge push(**需 user 同意**):`git push origin rev1-admin-root`
- [ ] T058 更新 `docs/INTEGRATION-CHECKLIST.md`:加 W-F1 完成里程碑(以對齊 F1.1-F5.1 紀錄模式 — 「W-F1 dockerfile-rust-api ✅ 完成(2026-05-15 完成;outer <short-sha>、rust-api <short-sha>;spec specs/006-dockerfile-rust-api/)」)+ 標 P2 後續 features(W-F2 / W-F3 / W-F4)解鎖
- [ ] T059 commit checklist 更新:`git add docs/INTEGRATION-CHECKLIST.md && git commit -m "docs(checklist): W-F1 dockerfile-rust-api 完成、P W-1 進度 1/4"` + push(需 user 同意)

### 結束 / 後續準備

- [ ] T060 [P] 補 memory(可選):若有 W-F1 過程拍板的非 obvious convention(例:`APP_SERVER_PORT` env naming pattern、`/health` mount 不過 apply_layers 慣例),用 auto memory 寫 1-2 條 feedback / project memory(per 全域 CLAUDE.md auto memory 紀律)
- [ ] T061 [P] 通知 user W-F1 完成 + 提示下一步:可選 W-F2(`base-web` Dockerfile)/ W-F3(compose 結構)為下個 spec-kit feature 入口(per DESIGN-W §11.2 依賴序)

---

## Dependencies

```
T001 ─┬─ T002 [P]
      ├─ T003 [P]   ─── Phase 1 ───
      ├─ T004 [P]
      └─ T005 [P]
          │
          ▼
       T010(R-001 cargo build 驗)
       T011(R-002 env binding 驗)
       T012 [P](existing /health audit)
       T013 [P](router 結構 audit)
          │            ─── Phase 2 ───
          ▼
       T020(/health route mount)
          │
          ├─→ T021(Dockerfile 覆寫)
          ├─→ T022 [P](.dockerignore 微調)
          └─→ T023 [P](optional unit test)
                 │
                 ▼
       T030 → T030b → T031 → T032 [P]   ─ Dimension A ─
       T033 [P]
       T034 [P]                          ─ Dimension B ─
       T035 [P]
       T036 [P]
       T037 → T038 → T039 → T039b        ─ Dimension C ─
       T040 → T041 → T041b → T042 [P]
              T043 [P]                    ─ Dimension D ─
              T044 → T044b → T045
       T046 [P]
       T047 [P]                           ─ Dimension E ─
       T048 [P]
                                 ─── Phase 3 ───
                 │
                 ▼
       T050 → T051 → T052 (user push)  ─ 第一段 commit ─
                 │
                 ▼
       T053 → T054 → T055 (user push)  ─ 第二段 commit ─
                 │
                 ▼
       T056 → T057 (user push)         ─ Merge to root ─
                 │
                 ▼
       T058 → T059 (user push)         ─ Checklist 更新 ─
                 │
                 ▼
       T060 [P]                        ─ memory ─
       T061 [P]                        ─ user notify
                                       ─── Phase 4 ───
```

**Story dependencies**: 單一 US1、無 cross-story 依賴。

**Critical path**(必經、不可平行):
T001 → T010 → T011 → T020 → T021 → T030 → T030b → T031 → T037 → T038 → T039 → T039b → T040 → T041 → T041b → T044 → T044b → T050 → T051 → T053 → T054 → T056

**Parallel opportunities**:
- Phase 1: T002-T005 全 [P]
- Phase 2: T012 / T013 [P] 與 T010-T011 並行
- Phase 3 implementation: T021-T022 [P]、T023 [P]
- Phase 3 acceptance: T032/T033-T035/T036/T042-T043/T046-T048 [P]
- Phase 4: T060 / T061 [P]

---

## Independent Test 對照

| Acceptance dimension | quickstart scenarios | Tasks | Test 標準 |
|---|---|---|---|
| A. Dockerfile 結構 | 1-3 | T030 / **T030b** / T031 / T032 | exit 0 + cache hit < 1min + size < 250MB + history 看不到 builder layer |
| B. Non-root user | 4-6 | T033 / T034 / T035 | whoami=rust-api / uid=10001 / 3 個 resource owner 對 |
| C. Binary 可用 | 7-9 + 9b + 9c | T036 / T037 / T038 / T039 / **T039b** | migration help / panic without env / DB retry with env / listen 11081 / TZ-LANG-RUST_ENV 對 |
| D. /health endpoint | 10-12 + 12b + 12c | T041 / **T041b** / T042 / T043 / T044 / **T044b** | 200 + ok / **p99 < 50ms** / public / source grep / silent INFO log / **F5.1 regression pass** |
| E. Image tagging | 13-15 | T046 / T047 / T048 | spec FR 引用對 / short-sha / branch tag 合法 |

---

## MVP Scope

**MVP = T001 ~ T048 + T030b / T039b / T041b / T044b**(Setup + Foundational + US1 含 analyze remediation 4 個)即可宣布 W-F1 deliverable 完成。

**Phase 4 (Polish)** 屬合併到 main 流程、與實際 deliverable 分開:
- T050-T055:必經(兩段 commit + push 後 W-F1 才落 git history)
- T056-T059:必經(merge + checklist 更新解鎖後續 feature)
- T060-T061:可選(memory + 通知)

**最小可交付狀態**:T001~T048 + T050-T056 完成 = W-F1 已 merged 到 rev1-admin-root、W-F2/W-F3/W-F4 可開新 feature branch。

---

## Format validation

✓ All **48** tasks 使用 `- [ ] T###[a-z]?` 格式(grep verified)
✓ Setup phase(T001-T005)無 [US1] 標籤 — 對
✓ Foundational phase(T010-T013)無 [US1] 標籤 — 對
✓ User Story phase(T020-T048 含 T030b/T039b/T041b/T044b,共 **27** 個)全部 [US1] 標籤 — 對(grep verified)
✓ Polish phase(T050-T061)無 [US1] 標籤 — 對
✓ [P] marker 標在獨立檔案 / 獨立 docker command / 獨立 grep 操作上(共 19 個 [P],grep verified)
✓ 每個 task 含具體 file path 或 docker command 或 grep target

**Total**: **48** tasks(Setup 5 + Foundational 4 + US1 implementation 4 + US1 acceptance 23 + Polish 12)

**Parallel opportunities identified**: 19 個 [P] task(分布在 Phase 1 / 2 / 3 acceptance / 4 cleanup)

**Analyze remediation tasks(2026-05-15)**:
- **T030b**(SC-003 cache hit timing)解 analyze E3
- **T039b**(FR-011 TZ/LANG/RUST_ENV 三 env 驗)解 analyze E2
- **T041b**(SC-004 p99 latency 量化)解 analyze E4 + B1
- **T044b**(SC-008 F5.1 regression)解 analyze E1(HIGH severity gap)

**Independent Test criteria**: 唯一 US1 透過 quickstart.md 15 個 scenario(對應 spec Dimension A-E)100% pass 驗證
