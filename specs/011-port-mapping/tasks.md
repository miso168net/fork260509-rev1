---
description: "Task list for W-F7 port-mapping(dev host port forward)implementation"
---

# Tasks: W-F7 — port-mapping(dev host port forward)

**Input**: Design documents from `/specs/011-port-mapping/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/dev-override-merge.md`](contracts/dev-override-merge.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- **No rust unit test**(W-F7 純 yaml 配置 layer feature、不動 source code)
- **Compose syntax + merge**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml config`(per FR-010 / C-V8)
- **Integration**:`docker compose up + ps` + 4 host 驗證命令(per quickstart.md)
- **Acceptance**:per spec.md US1(7 scenarios)+ US2(4 scenarios)+ US3(2 scenarios)= 13 scenarios

**Organization**:W-F7 為 3 個 user story feature(P1 dev 可達 / P2 prod safety / P3 binding 範圍)。Setup(5)+ Foundational(4)+ US1 impl + acceptance(12)+ US2 acceptance(4)+ US3 acceptance(2)+ Doc(3)+ Polish(2)= ~32 task。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立 docker command / 獨立 grep 操作)
- **[Story]**:User Story phase 用 `[US1]` / `[US2]` / `[US3]` 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(全 W-F7 範疇、不動 worktree)

## Path Conventions

- **Outer (011-port-mapping feature branch)**:
  - 新建:`docker-compose.dev.yml`
  - 修改:`CLAUDE.md`(§5.2)/ `docs/INTEGRATION-CHECKLIST.md`(W-F7 row + Current Focus + 已完成里程碑)/ `.specify/feature.json`(specify 階段已動)/ `CLAUDE.md` SPECKIT marker(plan 階段已動)
  - spec docs:`specs/011-port-mapping/`(已產出)
- **Acceptance test 執行**:outer repo root(`docker compose ...`)
- **worktree 0 改動**:`base-web/` / `rust-api/` 全程不動

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch 為 `011-port-mapping`,執行 `git branch --show-current && git status --short`(預期 branch=011-port-mapping、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified 自 specify+plan 階段、無 worktree 改動)
- [ ] T002 [P] 確認 docker compose v2+,執行 `docker compose version`(預期 `v2.x.x`;若 v1 提示升級 — per R-4)
- [ ] T003 [P] 確認 W-F5 結束的 `docker-compose.yml` 主檔存在 6 service,執行 `yq '.services | keys' docker-compose.yml`(預期含 `postgres` / `redis` / `migration` / `rust-api` / `base-web` / `front-nginx` 6 個)
- [ ] T004 [P] 確認 `deploy/secrets/*.txt` 5 個檔已備(W-F4 既有要求),執行 `ls deploy/secrets/*.txt 2>/dev/null | wc -l`(預期 ≥ 5;若 missing 跑 W-F4 quickstart cp 流程填 dev 值)
- [ ] T005 [P] 確認 host 機 4 個 port 無既有 listener,執行 `ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'`(預期無輸出;若有衝突依 quickstart 故障排查 §2 處理)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:W-F5 baseline 完整性 sanity(主 compose 4 個目標 service 都無 ports 區塊、不會與 dev.yml 衝突)+ 環境 prerequisite 確認。

- [ ] T010 驗主 `docker-compose.yml` 對 4 個目標 service 無既有 ports 區塊(per C-M2):
  ```bash
  grep -A 30 "^  front-nginx:" docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
  grep -A 30 "^  rust-api:"    docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
  grep -A 30 "^  postgres:"    docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
  grep -A 30 "^  redis:"       docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
  ```
  若任一命中、停止 implement、重新評估 merge 行為(per C-M2 contract)
- [ ] T011 [P] 確認 W-F5 baseline stack 可正常 internal up(不必跑、但若不確定可:`docker compose up -d --wait` + `docker compose ps` + `docker compose down --remove-orphans` 留乾淨環境給 T030+ 用)
- [ ] T012 [P] 讀 `docker-compose.yml` 找好插入 host port 區塊的 service 段位置(W-F7 不動主檔、但 implement 時需對齊 dev.yml 內 service name 與主檔完全一致 — 4 個 service name 短-連字、無 alias)
- [ ] T013 [P] 讀 `docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md` §6.1 確認 port 規劃對齊(11080 / 11081 / 15432 / 16379 4 個值與本 spec FR-002 完全一致;Constitution 架構約束「Port 規劃 1XXXX」核對)

---

## Phase 3: User Story 1 — Dev 環境啟動 + host 機驗證 stack 對外可達(Priority: P1)🎯 MVP

**Goal**:新增 `docker-compose.dev.yml` 1 個檔(~25 行)、dev `-f -f` 啟動 6 service healthy、host 機 4 條 curl/psql/redis-cli 全成功 + SPA login e2e 通。

**Independent Test**:6 service stack 起來 + 7 個 acceptance scenario(US1.1 ~ US1.7)全 PASS — 不需 US2 / US3 / 後續任何 feature。

### outer 配置檔新建(5 tasks)

- [ ] T020 [US1] 新建 `docker-compose.dev.yml`(per data-model E1 + contracts C-M1~M7):
  - Top-level 註解區塊 5-6 行(用法 / 範疇邊界 / binding loopback only / 11443 留 W-F6 / 0.0.0.0 不支援)
  - `services:` 4 entry,各只列 service name + `ports:` 區塊(per C-M3 不重複 body):
    - `front-nginx:` → `- "127.0.0.1:11080:80"`(行末註解 `# SPA + /api/ 反向代理對外入口`)
    - `rust-api:` → `- "127.0.0.1:11081:11081"`(行末註解 `# rust-api 直連(跳過 nginx debug)`)
    - `postgres:` → `- "127.0.0.1:15432:5432"`(行末註解 `# psql / DBeaver 直連`)
    - `redis:` → `- "127.0.0.1:16379:6379"`(行末註解 `# redis-cli / RedisInsight 直連`)
  - 行數目標 ≤ 30(per NFR-001)、yaml 2-space 縮排對齊主 compose 風格
- [ ] T021 [US1] [P] 靜態檢查 dev.yml 所有 ports binding 含 `127.0.0.1:` 前綴(per FR-004 + C-M4):
  ```bash
  grep -E '^\s+- "' docker-compose.dev.yml | grep -vE '^\s+- "127\.0\.0\.1:[0-9]+:[0-9]+"$'
  # 預期無輸出(任何違反 binding 規格的 entry 都不能命中)
  ```
- [ ] T022 [US1] [P] 靜態檢查 dev.yml service entry 只有 `ports` 區塊、無重複 body(per C-M3):
  ```bash
  for svc in front-nginx rust-api postgres redis; do
    keys=$(yq ".services.$svc | keys" docker-compose.dev.yml)
    echo "$svc: $keys"
    # 預期每行只顯示 "- ports"
  done
  ```
- [ ] T023 [US1] [P] 靜態檢查 dev.yml 不對 base-web / migration 加 ports(per C-M7):
  ```bash
  yq '.services.base-web.ports'   docker-compose.dev.yml  # 預期 null
  yq '.services.migration.ports' docker-compose.dev.yml  # 預期 null
  ```
- [ ] T024 [US1] [P] `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` 渲染驗 yaml 解析 + merge(per FR-010 + C-V8 + C-M1):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml config | \
    yq '.services.front-nginx.ports, .services.rust-api.ports, .services.postgres.ports, .services.redis.ports'
  # 預期 4 個 list,各 1 條 entry,IP/port 對齊 T020 設計
  ```

### US1 acceptance scenarios(7 tasks)

- [ ] T030 [US1] **AC US1.1** dev 啟動 + 6 service healthy:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  docker compose ps
  # 預期 60-75s 內 6 service 全 healthy(migration exited 0)、`--wait` exit code 0
  ```
- [ ] T031 [US1] [P] **AC US1.2** front-nginx /health host 可達(per C-V1):
  ```bash
  curl -fsS http://127.0.0.1:11080/health
  # 預期:exit 0 + stdout 含 "ok"
  ```
- [ ] T032 [US1] [P] **AC US1.3** Login e2e via front-nginx /api/(per C-V3):
  ```bash
  curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    http://127.0.0.1:11080/api/auth/login
  # 預期:exit 0 + JSON body 含 "token"
  ```
- [ ] T033 [US1] [P] **AC US1.4** rust-api /health 直連(per C-V2):
  ```bash
  curl -fsS http://127.0.0.1:11081/health
  # 預期:exit 0 + HTTP 200
  ```
- [ ] T034 [US1] [P] **AC US1.5** postgres pg_isready(per C-V4):
  ```bash
  pg_isready -h 127.0.0.1 -p 15432
  # 預期:exit 0 + stdout "127.0.0.1:15432 - accepting connections"
  ```
- [ ] T035 [US1] [P] **AC US1.6** redis ping(per C-V5):
  ```bash
  redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping
  # 預期:exit 0 + stdout "PONG"
  ```
- [ ] T036 [US1] **AC US1.7** SPA login e2e 人工驗(per C-V9):
  - host 機(WSL 內 / Win 瀏覽器)訪問 `http://127.0.0.1:11080`
  - 輸入 `Soybean` / `123456` 點登入
  - 預期:30 秒內進入 dashboard、看到 menu(per SC-005)
  - 若 Win host 不通而 WSL 內通 → WSL2 NAT mode、依 quickstart 故障排查 §1 處理

**Checkpoint**:US1 完成 — dev 環境完整對外可達、stack healthy、e2e login work、W-F7 主要價值達成。

---

## Phase 4: User Story 2 — Prod baseline 啟動不誤暴露 host port(Priority: P2)

**Goal**:確認不帶 `-f docker-compose.dev.yml` 的 `docker compose up -d` 起來後、4 個 dev port 在 host 機**無任何 listener**、`curl --max-time 5` refused、stack 內仍 work。

**Independent Test**:單獨啟動 prod baseline + 4 個 scenario(US2.1 ~ US2.4)全 PASS。

### US2 acceptance scenarios(4 tasks)

- [ ] T040 [US2] **AC US2.1** prod baseline 啟動 6 service healthy:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
  docker compose up -d --wait
  docker compose ps
  # 預期:60-75s 內 6 service 全 healthy(同 W-F5 baseline acceptance)
  ```
- [ ] T041 [US2] [P] **AC US2.2** prod baseline host 無 listener(per C-V7 命令 1 + C-M5):
  ```bash
  ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
  # 預期:無輸出
  ```
- [ ] T042 [US2] [P] **AC US2.3** prod baseline host curl refused(per C-V7 命令 2):
  ```bash
  curl -fsS http://127.0.0.1:11080/health --max-time 5; echo "exit: $?"
  # 預期:exit 非 0、stderr 含 "Connection refused" 或 "Operation timed out"
  ```
- [ ] T043 [US2] [P] **AC US2.4** prod baseline stack 內仍 work(per C-V7 命令 3):
  ```bash
  docker compose exec front-nginx wget -qO- http://localhost/health
  # 預期:exit 0 + stdout "ok"(stack 內 routing 完全不受 W-F7 影響)
  ```

**Checkpoint**:US2 完成 — prod safe by default 紀律可驗證、dev 拆檔機制不引入 prod 誤暴露風險。

---

## Phase 5: User Story 3 — Binding 限 loopback 驗證(Priority: P3)

**Goal**:dev 環境(US1.1 完成)後、用 `ss` 命令確認 4 個 port 都綁 `127.0.0.1`(非 `0.0.0.0` / `*` / `[::]`);可選驗 LAN 第二台機不可達。

**Independent Test**:dev mode + 2 個 scenario(US3.1 + US3.2 optional)PASS。

### Phase 5 啟動前(若 US2 把 stack down 了、需重起 dev mode)

- [ ] T049 重起 dev mode 給 US3 用:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  ```

### US3 acceptance scenarios(2 tasks)

- [ ] T050 [US3] **AC US3.1** Binding 限 loopback(per C-V6 + FR-004):
  ```bash
  ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
  # 預期:4 行輸出
  # 每行 Local Address 欄位 = 127.0.0.1:<port>
  # 不可有 0.0.0.0:<port> / *:<port> / [::]:<port>
  ```
  若任一行不合格 → 違反 FR-004,修 dev.yml ports entry 的 IP 前綴
- [ ] T051 [US3] [P] **AC US3.2 (可選)** LAN 第二台機驗不可達:若手邊有同網段第二台機(LAN host IP = `192.168.x.y`):
  ```bash
  # 從第二台機跑
  curl http://192.168.x.y:11080/health --max-time 3
  # 預期:timeout / connection refused
  ```
  若無第二台機,T050 已足夠驗證 binding 限 loopback、跳過 T051

**Checkpoint**:US3 完成 — Q2 拍板的 127.0.0.1 binding 範圍可驗證、安全細節落實。

---

## Phase 6: Documentation Update(W-F7 文件落地)

**Goal**:同步更新 `CLAUDE.md` §5.2 + `docs/INTEGRATION-CHECKLIST.md`、為下一個 session / 別人 clone 後立即看到 W-F7 落地後的操作指南與進度。

- [ ] T060 改 `CLAUDE.md` §5.2(per data-model E2 + FR-008):
  - 改寫「目前現況」段落 — 從「rev1 提議尚未套用」改為「W-F7 落地、dev 4 port 已暴露(127.0.0.1)、prod 維持 internal-only」並改寫 3 條子點(dev 啟動引用下節 / dev 4 port 列表 / prod baseline 維持 internal-only + W-F6 範疇說明)
  - 新增子節 `### 5.2.1 dev 啟動命令範例(W-F7 落地後)` — 含 1 行 dev 啟動 + 4 條 host 驗證(curl front-nginx / curl rust-api / pg_isready / redis-cli)+ 1 段 prod baseline 啟動 + 1 條 WSL2 NAT mode 提示
- [ ] T061 [P] 改 `docs/INTEGRATION-CHECKLIST.md`(per data-model E3 + FR-009):
  - **Current Focus** 段:`W-2 P2:1/4` → `W-2 P2:2/4`、`(W-F5 完成)` → `(W-F5 + W-F7 完成)`、`剩 W-F6 / W-F7 / W-F11` → `剩 W-F6 / W-F11`、Active feature 改為「無(W-F7 全完成、dev 環境對外可達)」、下一步改為「W-F6 prod TLS + 對外 port / W-F11 obs(平行)」
  - **Phase W deploy Roadmap** 表:W-F7 row 改為 `| W-F7 | port-mapping | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;dev 4 port 已落地、prod baseline 仍 internal-only)|`(brainstorm ✅ + spec ✅ + plan ✅ + tasks ✅ + impl ✅ 5 段)
  - **已完成里程碑** 段:加 W-F7 ✅ 條目(per data-model E3 改動 3 範本、含 outer commit SHA + Phase W deploy P2 第二個 feature 達成、acceptance pass 數、單段 commit 模式說明、解鎖 W-F6 / W-F11)
- [ ] T062 [P] 驗 doc 改動(grep 確認 W-F7 進度與內容已寫進):
  ```bash
  grep "W-F7 落地" CLAUDE.md                        # 至少 1 match
  grep "dev 啟動命令範例" CLAUDE.md                   # 至少 1 match
  grep -E "W-F7.*✅" docs/INTEGRATION-CHECKLIST.md  # 至少 2 match(row + 里程碑)
  grep -E "W-2 P2:2/4" docs/INTEGRATION-CHECKLIST.md  # 至少 1 match(Current Focus)
  ```

**Checkpoint**:Phase 6 完成 — doc 改動到位、SOP hook 注入第一輪 context 時 user / Claude 看到 W-F7 已落地的 surface area。

---

## Phase 7: Polish & Single Commit(W-F7 純 outer 改動、單段 commit per CLAUDE.md §6.1)

**Goal**:落實「**單段 commit**」紀律(只動 outer、不動 worktree)、確認 worktree 0 改動、commit message 用 Conventional Commits + 中文 subject。

- [ ] T070 確認 worktree 全程零改動:
  ```bash
  cd base-web && git status --short && cd ..
  cd rust-api && git status --short && cd ..
  # 預期兩個 worktree 都 clean、無 untracked / modified
  ```
  若有改動 → 違反 FR-011 + Constitution Principle IV、必須 stash / discard 後重做
- [ ] T071 outer 單段 commit:
  ```bash
  # Stack down(清乾淨)
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans  # 不帶 -v 保留 volume

  # 確認 staging
  git status                                # 應看到:
                                            #   modified: .specify/feature.json
                                            #   modified: CLAUDE.md
                                            #   modified: docs/INTEGRATION-CHECKLIST.md
                                            #   new file: docker-compose.dev.yml
                                            #   new file: specs/011-port-mapping/
                                            #   (任何 base-web / rust-api 改動 → fail,回 T070)
  git add docker-compose.dev.yml CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json specs/011-port-mapping/

  git commit -m "$(cat <<'EOF'
  feat(deploy): W-F7 dev host port forward(docker-compose.dev.yml + CLAUDE/checklist 更新)

  Phase W deploy P2 第二個 feature(2/4)— 新增 outer-repo root docker-compose.dev.yml
  拆檔、為 dev 場景顯式暴露 4 個 host port(127.0.0.1:11080 front-nginx / 11081
  rust-api / 15432 postgres / 16379 redis),全綁 127.0.0.1 loopback。

  主 docker-compose.yml 嚴格不動(維持 W-F5 結束的 internal-only baseline、prod
  safe by default);dev 啟動 docker compose -f docker-compose.yml -f
  docker-compose.dev.yml up -d --wait、prod baseline docker compose up -d 不帶
  dev 檔。同步更新 CLAUDE.md §5.2(目前現況 + 新增 dev 啟動命令範例段)+
  docs/INTEGRATION-CHECKLIST.md(W-F7 ✅ + Current Focus 進度 2/4)。

  Acceptance 13/13 scenario PASS:US1 7 個(dev 4 port host 可達 + login e2e)、
  US2 4 個(prod baseline 無 listener / curl refused / stack 內仍 work)、US3 2 個
  (binding 限 127.0.0.1 / LAN 不可達)。

  範疇外:HTTPS 11443 / TLS / prod 對外暴露(W-F6)、override.yml auto-load
  (prod 誤暴露風險)、0.0.0.0 LAN binding(不支援)、Makefile target、CI/CD
  改動(W-F17 / W-F18)。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
- [ ] T072 push 等候 user 同意:
  ```bash
  # 不主動 push、告知 user:
  # "W-F7 commit 已落地、要不要 push origin 011-port-mapping?"
  # 等 user 明確 "ok push" 後才 git push origin 011-port-mapping(per CLAUDE.md §5)
  ```

**Checkpoint**:Phase 7 完成 — W-F7 落地、單段 commit 紀律遵守、worktree 零改動、push 紀律維持(待 user 同意)。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 | — |
| Phase 2 Foundational | Phase 3 + 4 + 5 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4(US2 acceptance 需先 down dev) | Phase 1 + 2 |
| Phase 4 US2 | Phase 5(US3 需重起 dev) | Phase 3 完(因 US2.1 down dev 後重起 prod) |
| Phase 5 US3 | Phase 6 | Phase 4(via T049 重起 dev) |
| Phase 6 Doc | Phase 7 | Phase 3 + 4 + 5 全 acceptance PASS |
| Phase 7 Commit | — | 全 6 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一不依賴任何其他 US 完成的 phase — implement T020-T024 + acceptance T030-T036 可獨立交付。
- US2(P2):依賴 US1 完成的 docker-compose.dev.yml 存在(才有 dev 拆檔可 down / up 切換驗證)。
- US3(P3):依賴 US1 stack up + dev.yml 存在(才能驗 binding 限 loopback)。

實際上 US2 / US3 都是「**驗證**」性質的 phase,不增/改 artifact、只跑 ss / curl 命令。可視為 US1 implement 完成後對「拆檔機制」的兩個 verification angle。

## Parallel Execution

### Phase 1 全可並行
T002 / T003 / T004 / T005 可並行(獨立 docker / ls / ss 命令)

### Phase 2 部分並行
T011 / T012 / T013 可並行(獨立 read / verify);T010 是 prerequisite

### Phase 3 acceptance 全可並行
T031 / T032 / T033 / T034 / T035 可並行(獨立 curl / pg / redis cmd、命中 stack 不同 endpoint)
T036 e2e 人工驗、與 T031-T035 不衝突可同時跑

### Phase 4 acceptance 部分並行
T040 必先(prod baseline 起來);T041 / T042 / T043 可並行

### Phase 6 部分並行
T061 / T062 可並行(獨立 doc edit + grep);T060 是改 CLAUDE.md 主步驟先做

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1) — 完成後 dev 環境對外可達、整個 W-F7 核心價值達成。**US2 / US3 為 verification phase**、不交付新 artifact(只驗 spec 性質、Polish 階段才有 doc + commit)。

**MVP commit policy**:US1 acceptance pass 後**可單獨**先 commit(若需要早期 merge),但本 feature 範疇小、推薦走完整 Phase 1-7 一次到位再 commit(避免兩次 review / merge)。

**並行 vs 序列建議**:
- 全 32 task 預估時間 30-45 分鐘(主要被 Phase 3-5 的 stack up/down/wait 60-75 sec 佔據)
- 若同時開 2 個 shell window 並行跑 acceptance、可省 5-10 分鐘
- 不建議省略人工 e2e(T036)— 30 秒驗 SPA login 是最完整的 e2e 信號

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] 標籤 | ✓(T020-T036 [US1]、T040-T043 [US2]、T050-T051 [US3]) |
| Setup / Foundational / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per 上方 Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 32 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement`**。
