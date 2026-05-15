---
description: "Task list for W-F3 compose-base-structure implementation"
---

# Tasks: W-F3 — compose-base-structure

**Input**: Design documents from `/specs/008-compose-base-structure/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/`](contracts/) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:跑 `docker compose up / ps / exec / down` 命令 + curl /health(per quickstart.md 17 scenarios);**unit test** 不適用(W-F3 為 infrastructure / yaml config feature)。

**Organization**:W-F3 為單一 P1 user story feature;Setup + Foundational(image pre-pull verification)+ US1(3 implementation + 18 acceptance + 1 cleanup)+ Polish(**單段** commit per CLAUDE.md §6.2 — W-F3 不動 worktree)四階段。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立 docker pull / 獨立檔案編輯)
- **[Story]**:僅 User Story phase 用 `[US1]` 標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(全 W-F3 範疇)

## Path Conventions

- **Outer (rev1-admin-root + feature branch)**:
  - 新建:`docker-compose.yml` / `.env.example`
  - 修改:`.gitignore`(加 `/.env`)/ `CLAUDE.md` SPECKIT marker(plan 階段已動)/ `.specify/feature.json`(specify 階段已動)
  - spec docs:`specs/008-compose-base-structure/`
  - Acceptance test 執行:outer repo root

---

## Phase 1: Setup(Shared Infrastructure)

**Purpose**:環境前置 / branch / docker compose v2 / W-F1+W-F2 image 已就位確認

- [ ] T001 確認 outer 在 feature branch `008-compose-base-structure`:`git -C . branch --show-current` 應 output `008-compose-base-structure`;若不在 → `git switch 008-compose-base-structure`
- [ ] T002 [P] 確認 docker compose v2:`docker compose version` 顯示 `v2.x` 或 `Compose version 2.x`(per R-007 depends_on long-syntax 需 v2)
- [ ] T003 [P] 確認 host arch:`uname -m` 應 `x86_64`(per W-F1 Q2 inherit)
- [ ] T004 [P] 確認 W-F1 image local 存在:`docker image ls rust-api --format '{{.Tag}}'` 應含 `rev1-admin-rust-api` 或 `<short-sha>`;若無 → 回 W-F1 acceptance 階段重 build
- [ ] T005 [P] 確認 W-F2 image local 存在:`docker image ls base-web --format '{{.Tag}}'` 應含 `rev1-admin-base-web` 或 `<short-sha>`;若無 → 回 W-F2 acceptance 階段重 build

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:預拉外部 image,確保 stack 啟動快(W-F1 acceptance T040 已 pull 過,plan 階段 re-confirm)

- [ ] T010 [P] 確認 `postgres:17.4` local 存在或 pull:`docker image ls postgres:17.4 --format '{{.Tag}}'` 命中、或 `docker pull postgres:17.4`(per R-001;W-F1 acceptance T040 已 pull)
- [ ] T011 [P] 確認 `redis/redis-stack:7.4.0-v3` local 存在或 pull:`docker image ls redis/redis-stack:7.4.0-v3 --format '{{.Tag}}'` 命中、或 `docker pull redis/redis-stack:7.4.0-v3`(per R-001)
- [ ] T012 [P] grep 確認 outer 既有 `.gitignore` 是否含 `/.env` 或類似:`grep -E "^/?\.env\b" .gitignore` — 不命中即 T022 須補

**Checkpoint**:Foundational ready — US1 implementation 可開始

---

## Phase 3: User Story 1 — operator `docker compose up -d` 起完整 rev1 deploy stack(Priority: P1)🎯 MVP

**Story 來源**:spec.md `## User Story 1`(唯一 US,P1)

**Goal**:產出可運行的 rev1 deploy `docker-compose.yml` 主檔(5 service / 1 network / 2 volumes)+ `.env.example` 模板,透過 17 個 acceptance scenarios(AC-1 ~ AC-17 對應 Dimension A-E)100% pass 驗證,解鎖 W-F4 secret-injection。

**Independent Test**:跑 quickstart.md 全 17 scenario(Dimension A 1-3 / B 4-8 / C 9-11 / D 12-14 / E 15-17)100% pass + SC-001~SC-006 量化目標達標。**stack 完整起動所需 W-F1+W-F2 image local 已 build**(per T004/T005);其他 image(postgres/redis)pull 即可(per T010/T011)。

### Implementation tasks(outer repo root)

- [ ] T020 [US1] 新建 `docker-compose.yml` — 內容嚴格對齊 [`contracts/compose-structure.md`](contracts/compose-structure.md) C-C2(5 services)+ C-C3(postgres)+ C-C4(redis)+ C-C5(migration)+ C-C6(rust-api)+ C-C7(base-web)+ C-C8(networks/volumes)+ C-C9 forbidden patterns(無 version: / 無 ports: / 無 secrets: / 無 _FILE / 無 profiles / 無 build / 無 :latest / 無 extends);無 `version:` 段(per R-008 modern convention)
- [ ] T021 [P] [US1] 新建 `.env.example` — 內容對齊 [`contracts/compose-structure.md`](contracts/compose-structure.md) C-C1:含 7 env(COMPOSE_PROJECT_NAME=rev1-admin / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB / REDIS_PASSWORD / APP_JWT_JWT_SECRET / IMAGE_TAG / BASE_WEB_TAG)+ URL encoding 警告註解 + `openssl rand -hex 32` 替換指令
- [ ] T022 [P] [US1] 補 `.gitignore` 加 `/.env`(若 T012 已含則 skip):`echo "/.env" >> .gitignore`(或更精準位置)— 確保 user 編輯的 .env 不被 git track

### Acceptance verification(走 quickstart.md — outer repo root 執行)

#### Setup(scenarios prep)

- [ ] T030 [US1] 準備 acceptance 用 .env:`cp .env.example .env` + `sed -i` 替換 POSTGRES_PASSWORD / REDIS_PASSWORD / APP_JWT_JWT_SECRET 為 hex string(per quickstart.md Setup 章節);驗 `grep -E "^(POSTGRES_PASSWORD|REDIS_PASSWORD|APP_JWT_JWT_SECRET)=" .env` 內容含 hex(非 `change-me-*` placeholder)

#### Dimension A — Compose 結構 + service 集合(per quickstart.md Scenario 1-3)

- [ ] T031 [US1] Scenario 1(SC-001 wall clock 量化、解 analyze remediation E2):`docker compose down -v` cleanup → `START=$(date +%s) && docker compose up -d ; END=$(date +%s) ; echo "compose up wall_clock=$((END-START))s"`(`up -d` 自身 ~5 sec)→ 然後 `sleep 60`(讓 healthchecks 通)→ `echo "to-healthy wall_clock=$((($(date +%s)-START)))s"` → **預期 < 60 sec(SC-001)**;若 > 60 sec 記錄到 acceptance log + audit healthcheck retry tuning
- [ ] T032 [US1] Scenario 2(SC-002):`docker compose ps --format '{{.Name}} {{.Status}}'` + `sleep 60`(等 healthchecks 全通)→ 5 lines 對應:postgres healthy / redis healthy / migration Exited(0) / rust-api healthy / base-web healthy
- [ ] T033 [P] [US1] Scenario 3(FR-002 verify):`docker compose config` → exit 0、output 含 5 services + 1 network(`internal`)+ 2 volumes(`postgres_data` / `redis_data`)、無 unresolved env / syntax error

#### Dimension B — Healthcheck + depends_on 串接(per quickstart.md Scenario 4-8)

- [ ] T034 [US1] Scenario 4(FR-008):`docker compose logs migration | head -20` → log 顯示 migration 在 postgres healthy 後啟、跑 sea-orm migrations、最後 exit 0(`migration Exited (0)`)
- [ ] T035 [US1] Scenario 5(FR-009):`docker compose logs rust-api | head -5` + 比較 migration exit timestamp + rust-api 啟動 timestamp → rust-api 啟動晚於 migration exit(per `service_completed_successfully` condition)
- [ ] T036 [P] [US1] Scenario 6(SC-003 functional):`docker compose exec rust-api curl -fsS http://localhost:11081/health` → 200 + body `ok`
- [ ] T036b [US1] Scenario 6b(SC-003 p99 量化驗、解 analyze remediation E1):`for i in 1..10; do docker compose exec -T rust-api curl -s http://localhost:11081/health > /dev/null; done`(warmup、丟棄)+ `rm -f /tmp/health-latency.log && for i in $(seq 1 100); do docker compose exec -T rust-api sh -c '/usr/bin/time -f "%e" curl -s http://localhost:11081/health -o /dev/null' 2>> /tmp/health-latency.log; done`(N=100、從 container 內測避 docker-exec overhead 過大)+ `sort -n /tmp/health-latency.log | awk 'NR==99'` → **p99 < 0.05 秒(50ms)per SC-003**;Methodology:warmup 10 跳過、N=100 樣本、from container 內 curl loopback;若 docker exec overhead 主導、改用 host port-forward(臨時 `-p` flag、不寫 compose.yml)再 host curl 量化
- [ ] T037 [P] [US1] Scenario 7(SC-003):`docker compose exec base-web curl -fsS http://localhost:8080/health` → 200 + body `ok`
- [ ] T038 [US1] Scenario 8:`sleep 60` + `RUST_API_CID=$(docker compose ps rust-api -q) && docker inspect "$RUST_API_CID" --format '{{.State.Health.Status}}'` → `healthy`

#### Dimension C — Network + volume 持久化(per quickstart.md Scenario 9-11)

- [ ] T039 [P] [US1] Scenario 9(FR-011):`docker compose exec rust-api sh -c 'getent hosts postgres'` + `docker compose exec rust-api sh -c 'getent hosts redis'` → 各返內部 IP(172.x.x.x);證明 internal network DNS 通
- [ ] T040 [US1] Scenario 10(SC-005、FR-013 + FR-020):postgres 寫測試 row 或讀現有 `sys_operation_log` count → `docker compose down`(不 -v)→ `docker compose up -d` + sleep 60 healthy → 重讀 count → 相同;證明 volume 持久
- [ ] T041 [P] [US1] Scenario 11(SC-004、FR-024):從 host 跑 `nc -zv localhost 5432 / 6379 / 11081 / 8080` → 4/4 全 fail(connection refused / timeout);證明嚴守 W-F7 邊界、無對外 host port

#### Dimension D — Secret + env 配置(per quickstart.md Scenario 12-14)

- [ ] T042 [P] [US1] Scenario 12(FR-016):grep `.env.example` 內容驗 7 env + URL encoding 警告 + `openssl rand` 指令存在
- [ ] T043 [US1] Scenario 13(SC-006、FR-017):清掉 `APP_JWT_JWT_SECRET`(`.env` 內設空 / 或暫 mv .env)+ `docker compose up -d` → compose error `APP_JWT_JWT_SECRET required` 或 rust-api 啟動後 F1.1 panic;stack 不健康。**驗完恢復 .env**
- [ ] T044 [US1] Scenario 14:恢復 `.env` 內正確 `APP_JWT_JWT_SECRET` + `docker compose up -d` + sleep 60 + curl /health → 200(secret 驗證通、stack healthy)

#### Dimension E — Cleanup + down 行為(per quickstart.md Scenario 15-17)

- [ ] T045 [US1] Scenario 15(FR-020):`docker compose down`(不 -v)後 `docker volume ls --filter "name=rev1-admin_"` → 2 volume `rev1-admin_postgres_data` + `rev1-admin_redis_data` 仍在
- [ ] T046 [US1] Scenario 16(FR-020):`docker compose up -d` → `docker compose down -v` → `docker volume ls` 應**空**(2 volume 被刪);驗完接 T047 之前須 up -d 重起 stack
- [ ] T047 [US1] Scenario 17:`docker compose up -d` + sleep 60 → `docker compose restart rust-api` + sleep 10 → `docker compose ps rust-api` 顯示 Up healthy、其他 4 service 不受影響仍 Up

#### Cleanup

- [ ] T048 [US1] 完成 acceptance 後 cleanup:`docker compose down -v`(stack + volume 全清),驗 `docker compose ps -a` 空、`docker volume ls --filter "name=rev1-admin_"` 空

**Checkpoint**:17 個 acceptance scenarios + SC-001 ~ SC-006 全 pass → US1 完成、解鎖 Polish

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**:**單段** commit(per CLAUDE.md §6.2、W-F3 無 worktree 改動)+ merge + checklist + 解鎖 W-F4

### 單段 commit(outer 008-compose-base-structure feature branch)

- [ ] T050 review outer changes:`git status --short` 應顯示 modified `.specify/feature.json` / `CLAUDE.md` / `.gitignore`(T022 補)+ untracked `docker-compose.yml` / `.env.example` / `specs/008-compose-base-structure/`
- [ ] T051 outer stage + commit:`git add docker-compose.yml .env.example .gitignore .specify/feature.json CLAUDE.md specs/008-compose-base-structure/` + `git commit -m "feat(deploy): W-F3 compose-base-structure 落地（5 service docker-compose stack）..."`(commit message 內容含 5 service / Constitution 23 gate PASS / acceptance 17 scenarios 全 PASS / SC-001~006 達標、image size / startup time 等實測數據 / 引用 spec-kit 全套產出)
- [ ] T052 outer push(**需 user 同意,per CLAUDE.md §5**):`git push origin 008-compose-base-structure`

### Merge 回 rev1-admin-root + 解鎖

- [ ] T053 切回 rev1-admin-root + merge:`git switch rev1-admin-root && git merge --no-ff 008-compose-base-structure -m "Merge branch '008-compose-base-structure' into rev1-admin-root"`(對齊 W-F1 / W-F2 merge pattern)
- [ ] T054 merge push(**需 user 同意**):`git push origin rev1-admin-root`
- [ ] T055 更新 `docs/INTEGRATION-CHECKLIST.md`:加 W-F3 完成里程碑(模仿 W-F1 / W-F2 紀錄模式 — 「W-F3 compose-base-structure ✅ 完成(2026-05-15 完成;outer <short-sha> + merge <short-sha>;spec specs/008-compose-base-structure/)」)+ 更新 Phase W deploy Roadmap 表(W-F3 完成、W-F4 待動)+ 更新 Current Focus 段反映 W-F3 完成、進度 3/4
- [ ] T056 commit checklist 更新:`git add docs/INTEGRATION-CHECKLIST.md && git commit -m "docs(checklist): W-F3 compose-base-structure 完成、Phase W deploy P1 進度 3/4"` + push(**需 user 同意**)

### 結束 / 後續準備

- [ ] T057 [P] 通知 user W-F3 完成 + 提示下一步:**W-F4 `secret-injection`** 為 Phase W P1 第四個(也是最後一個)P1 feature,依賴 W-F3(現解鎖);W-F4 完成後 Phase W P1 100% 達成、可解鎖 P2(W-F5 front-nginx 等)

---

## Dependencies

```
T001 ─┬─ T002 [P]
      ├─ T003 [P]
      ├─ T004 [P](W-F1 image 已存在)
      └─ T005 [P](W-F2 image 已存在)   ─── Phase 1 ───
          │
          ▼
       T010 [P](postgres:17.4 pull)
       T011 [P](redis-stack pull)
       T012 [P](.gitignore audit)        ─── Phase 2 ───
          │
          ▼
       T020(docker-compose.yml)─┐
       T021 [P](.env.example)  ─┼─→ T030(prep .env with secrets)
       T022 [P](.gitignore +)  ─┘                     │
                                                       ▼
                                  T031 → T032 → T033 [P]   ─ Dimension A ─
                                  T034 → T035
                                  T036 [P] → T036b / T037 [P]
                                  T038                       ─ Dimension B(含 p99 量化)─
                                  T039 [P]
                                  T040
                                  T041 [P]                   ─ Dimension C ─
                                  T042 [P]
                                  T043 → T044                ─ Dimension D ─
                                  T045 → T046 → T047         ─ Dimension E ─
                                  T048                        ─ cleanup ─
                                                              ─── Phase 3 ───
                                  │
                                  ▼
       T050 → T051 → T052 (user push)   ─ 單段 commit ─
                  │
                  ▼
       T053 → T054 (user push)            ─ Merge to root ─
                  │
                  ▼
       T055 → T056 (user push)            ─ Checklist 更新 ─
                  │
                  ▼
       T057 [P]                            ─ notify
                                          ─── Phase 4 ───
```

**Story dependencies**:單一 US1、無 cross-story 依賴。

**Critical path**(必經、不可平行):
T001 → T010 → T020 → T030 → T031 → T032 → T034 → T035 → T038 → T040 → T043 → T044 → T045 → T046 → T047 → T048 → T050 → T051 → T053 → T055 → T056

**Parallel opportunities**:
- Phase 1:T002 / T003 / T004 / T005 全 [P]
- Phase 2:T010 / T011 / T012 [P] 全並行
- Phase 3 implementation:T021 / T022 [P] 與 T020 並行
- Phase 3 acceptance:T033 / T036 / T037 / T039 / T041 / T042 [P] 並行
- Phase 4:T057 [P]

---

## Independent Test 對照

| Dimension | quickstart scenarios | Tasks | Test 標準 |
|---|---|---|---|
| A. Compose 結構 + service 集合 | 1-3 | T031 / T032 / T033 | up -d exit 0 / 5 service 預期狀態 / config syntax OK |
| B. Healthcheck + depends_on + p99 | 4-8 + 6b | T034 / T035 / T036 / **T036b** / T037 / T038 | migration after pg healthy / rust-api after migration / /health 200 / **p99 < 50ms** / healthy state |
| C. Network + volume | 9-11 | T039 / T040 / T041 | internal DNS / volume 持久 / 無對外 host port |
| D. Secret + env | 12-14 | T042 / T043 / T044 | .env.example 完整 / 無 secret panic / 有 secret healthy |
| E. Cleanup + down | 15-17 | T045 / T046 / T047 | down 保留 volume / down -v 刪 volume / restart 局部不影響 |

---

## MVP Scope

**MVP = T001 ~ T048**(Setup + Foundational + US1 含 acceptance + cleanup)即可宣布 W-F3 deliverable 完成。

**Phase 4 (Polish)** 屬合併到 main 流程、與實際 deliverable 分開:
- T050-T052:必經(單段 commit + push 後 W-F3 才落 git history)
- T053-T054:必經(merge 後 rev1-admin-root 含 W-F3 / W-F4 解鎖)
- T055-T056:必經(INTEGRATION-CHECKLIST.md 更新追蹤 Phase W 進度)
- T057:可選(notify)

**最小可交付狀態**:T001~T048 + T050-T054 完成 = W-F3 已 merged 到 rev1-admin-root、W-F4 可開新 feature branch。

---

## Format validation

✓ All **39** tasks 使用 `- [ ] T###[a-z]?` 格式(含 analyze remediation 新增 T036b)
✓ Setup phase(T001-T005,5 個)無 [US1] 標籤 — 對
✓ Foundational phase(T010-T012,3 個)無 [US1] 標籤 — 對
✓ User Story phase(T020-T048 含新增 T036b,共 **23** 個)全部 [US1] 標籤 — 對
✓ Polish phase(T050-T057,8 個)無 [US1] 標籤 — 對
✓ [P] marker 標在獨立 docker pull / 獨立 command / 獨立 grep 操作上(共 **16** 個 [P])
✓ 每個 task 含具體 file path / docker command / 操作 target

**Total**: **39** tasks(Setup 5 + Foundational 3 + US1 implementation 3 + US1 prep 1 + US1 acceptance 18 + US1 cleanup 1 + Polish 8)

**Parallel opportunities identified**: 16 個 [P] task

**Analyze remediation tasks(2026-05-15)**:
- **T036b**(N=100 curl p99 量化、SC-003 p99 < 50ms)解 analyze E1
- T031 改 `time docker compose up -d`(wall clock 量化、SC-001)解 analyze E2
- (spec FR-008 + contracts C-C5 + data-model E2c 直接修 env `DATABASE_URL` → `APP_DATABASE_URL`)解 analyze I1 + U1

**vs W-F1 (48 tasks) / W-F2 (40 tasks) 比較**:W-F3 task 中等(39),反映:
- 無 worktree 改動 / 單段 commit 簡化 Phase 4(W-F1/W-F2 兩段 commit)
- 無 image build 階段(W-F3 引用既有 W-F1/W-F2 image)
- 較多 acceptance scenarios(18 個含 p99 量化 vs W-F1 15+1 / W-F2 12+1,反映 stack-level 驗證多層次)
