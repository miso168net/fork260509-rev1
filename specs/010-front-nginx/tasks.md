---
description: "Task list for W-F5 front-nginx implementation"
---

# Tasks: W-F5 — front-nginx 反向代理

**Input**: Design documents from `/specs/010-front-nginx/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/front-nginx-routing.md`](contracts/front-nginx-routing.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- **No rust unit test**(W-F5 純配置 layer feature、不動 source code)
- **nginx config syntax**:`docker compose exec front-nginx nginx -t`(per C-F6)
- **Integration**:`docker compose config` 渲染驗 + `docker compose up + ps` stack 啟動驗(per quickstart.md 13 scenarios)
- **Acceptance**:per quickstart.md Dimension A-E

**Organization**:W-F5 為單一 P1 user story feature;Setup + Foundational(W-F4 stack baseline + nginx config knowledge)+ US1(deploy/front-nginx/ + compose service + 13 acceptance + 1 cleanup 共 28)+ Polish(**單段 commit** per CLAUDE.md §6.2 — W-F5 不動 worktree)四階段。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案編輯 / 獨立 docker command / 獨立 grep 操作)
- **[Story]**:僅 User Story phase 用 `[US1]` 標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(全 W-F5 範疇)

## Path Conventions

- **Outer (010-front-nginx feature branch)**:
  - 新建:`deploy/front-nginx/conf.d/default.conf` / `deploy/front-nginx/README.md`
  - 修改:`docker-compose.yml`(加第 6 個 service)/ `CLAUDE.md` SPECKIT marker(plan 階段已動)/ `.specify/feature.json`(specify 階段已動)
  - spec docs:`specs/010-front-nginx/`
- **Acceptance test 執行**:outer repo root(`docker compose ...`)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch 為 `010-front-nginx`,執行 `git branch --show-current && git status --short`(預期 branch=010-front-nginx、無 uncommitted source 改動;spec docs 7 個 untracked 為 specify+plan 階段產出)
- [ ] T002 [P] 確認 docker compose v2+,執行 `docker compose version`(預期 v2.x;per W-F4 既有 baseline)
- [ ] T003 [P] 確認 W-F1 / W-F2 image 本地存在,執行 `docker image ls --filter "reference=rust-api:*" --filter "reference=base-web:*"`(預期 2 image 列表非空、含 rev1-admin-* tag)
- [ ] T004 [P] 確認 `nginx:1.27-alpine` image 本地 cached,執行 `docker image ls nginx:1.27-alpine`(預期非空、W-F2 build 已 pull;若 missing 跑 `docker pull nginx:1.27-alpine`)
- [ ] T005 [P] 確認 `deploy/secrets/*.txt` 已備(W-F4 既有流程),執行 `ls deploy/secrets/*.txt 2>/dev/null | wc -l`(預期 ≥ 5;若 missing 跑 W-F4 quickstart scenario 12 cp 流程填 dev 值)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:W-F4 baseline stack verify + rust-api route prefix 確認(spec stage live test 已驗、tasks 階段引用)。

- [ ] T010 讀 `docker-compose.yml` 全檔,記下 W-F3+W-F4 既有 5 個 service(postgres / redis / migration / rust-api / base-web)的位置、確認 W-F5 新加 `front-nginx` block 插入點(建議放在 `base-web` 之後、`networks:` top-level 段之前)
- [ ] T011 [P] 確認 base-web internal listen port 為 8080,執行 `grep -E "listen|EXPOSE" base-web/Dockerfile base-web/deploy/nginx.conf 2>/dev/null | head -5`(預期 base-web nginx config listen 8080;W-F5 upstream `base_web` 對齊此 port)
- [ ] T012 [P] 確認 rust-api server port 為 11081,執行 `grep -E "APP_SERVER_PORT|EXPOSE|listen" rust-api/Dockerfile 2>/dev/null | head -5`(預期 ENV APP_SERVER_PORT=11081 / EXPOSE 11081;W-F5 upstream `rust_api` 對齊此 port)
- [ ] T013 [P] 確認 rust-api `/auth/login` route 存在(無 `/api/` 前綴)— 透過 spec stage live test 文檔引用(已驗於 spec.md user story 第 3 點 + research.md R-001);若需重驗:起 stack 後 `docker compose exec rust-api curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://localhost:11081/auth/login`(預期 200)
- [ ] T014 W-F4 baseline 起動驗:`docker compose up -d && sleep 60 && docker compose ps`(預期 5 long-running services healthy + migration exited 0);跑完後 **不**`docker compose down`,留 stack 給 T030+ acceptance 用
- [ ] T015 [P] 讀 `docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md` §4.2 nginx config 範例(line ~371-424)+ §4.4 Track DESIGN-B 段(W-F5 對應)— 確認 W-F5 nginx config 對齊範例、無 nestjs upstream 與 TRANSITIONAL block(留 W-FA1)

---

## Phase 3: US1 Implementation — `deploy/front-nginx/` + `docker-compose.yml`

**Goal**:新建 nginx 配置檔(2 upstream + 3 location + 5 header)+ docker-compose.yml 加第 6 個 service(無 ports / 無 secrets / depends_on backends / healthcheck)。

**Independent Test**:
- `nginx -t` 配置 syntax 通過(per C-F6 / FR-009)
- `docker compose config` yaml 渲染通過(per FR-008)
- 5 種 routing path 全通(per quickstart Dim D scenario 11-16)

### outer 配置檔新建(4 tasks)

- [ ] T020 [US1] 新建 `deploy/front-nginx/conf.d/default.conf`(per data-model E3 + contracts C-F3 + C-F4 + C-F5):
  - 2 upstream block:`base_web` → `base-web:8080`、`rust_api` → `rust-api:11081` + `keepalive 32`
  - server block `listen 80; server_name _;`
  - 3 location block(優先序):`= /health` 自身返 200 ok / `/api/` proxy `http://rust_api/`(trailing `/` 切前綴)+ 5 header / `/` proxy `http://base_web`(無 trailing `/` 保留 path)+ Host header
- [ ] T021 [US1] [P] 新建 `deploy/front-nginx/README.md`(per data-model E2):
  - 概覽:W-F5 front-nginx 角色(stack 內 gateway、解 `/api/` prefix mismatch)
  - 操作:改 `default.conf` 後 `docker compose restart front-nginx`(或 `docker compose exec front-nginx nginx -s reload` graceful)
  - 範疇邊界:**無 TLS / 無 host port / 無 rate limiting / 無 nestjs**(分別留 W-F6 / W-F7 / follow-up / W-FA1)
  - 對齊風格參考 `deploy/secrets/README.md`(W-F4 既有)
- [ ] T022 [US1] 驗證 `default.conf` 結構:`grep -c "^upstream " deploy/front-nginx/conf.d/default.conf`(預期 2)、`grep -c "location " deploy/front-nginx/conf.d/default.conf`(預期 ≥ 3)、`grep "proxy_pass http://rust_api/" deploy/front-nginx/conf.d/default.conf`(命中、注意 trailing `/`)、`grep "proxy_pass http://base_web" deploy/front-nginx/conf.d/default.conf`(命中、無 trailing `/`)
- [ ] T023 [US1] 驗證 `default.conf` 5 個 header forwarding:`grep -E "X-Real-IP|X-Forwarded-For|X-Forwarded-Proto|X-Request-ID|proxy_set_header Host" deploy/front-nginx/conf.d/default.conf | wc -l`(預期 ≥ 5、在 `/api/` location 內;`/` location 可選加 `Host`)

### docker-compose.yml 加 service(2 tasks)

- [ ] T024 [US1] 修改 `docker-compose.yml`:加第 6 個 service `front-nginx`(per data-model E1 + contracts C-F2),插入點建議在 `base-web` service 之後、`networks:` top-level 段之前:
  ```yaml
  front-nginx:
    image: nginx:1.27-alpine
    environment:
      TZ: ${TZ:-Asia/Shanghai}
    volumes:
      - ./deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      base-web:
        condition: service_healthy
      rust-api:
        condition: service_healthy
    networks:
      - internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
  ```
  **MUST NOT** 加 `ports:` / `secrets:` / `command:` / `entrypoint:`(per C-F2 / FR-021 / FR-025)
- [ ] T025 [US1] [P] `docker compose config > /tmp/wf5-compose-render.yaml 2>&1` 驗 yaml syntax + render(per FR-008 + C-F2 verification);exit code 應 0;render output 含 `front-nginx` block 完整定義

### Stack restart + nginx config 驗(3 tasks)

- [ ] T026 [US1] 重啟 stack 含 front-nginx:`docker compose up -d front-nginx` 或 `docker compose up -d`(若 stack 已 healthy 後者僅 create 新 service);sleep 60 給 nginx 啟動;`docker compose ps`(預期 6 service、front-nginx healthy)
- [ ] T027 [US1] `docker compose exec front-nginx nginx -t`(per FR-009 + C-F6 + SC-007);預期:`syntax is ok` + `test is successful`
- [ ] T028 [US1] [P] `docker compose logs front-nginx --tail 20`(per FR-010);預期含 nginx start log;**無** `[error]` / `[crit]` / panic / 也無 `host not found in upstream` 訊息

### Acceptance — Dimension A 配置結構(3 tasks)

- [ ] T030 [US1] [P] **Scenario 1**:`ls deploy/front-nginx/`(預期 `README.md` + `conf.d/`)、`ls deploy/front-nginx/conf.d/`(預期 `default.conf`)
- [ ] T031 [US1] [P] **Scenario 2**:`grep "^upstream " deploy/front-nginx/conf.d/default.conf`(預期 2 行 — `base_web` + `rust_api`)
- [ ] T032 [US1] [P] **Scenario 3**:`grep -E "location (= /|/api/|/)" deploy/front-nginx/conf.d/default.conf`(預期 ≥ 3 行)

### Acceptance — Dimension B docker-compose 配置(4 tasks)

- [ ] T033 [US1] [P] **Scenario 4-5**:`docker compose config | awk '/front-nginx:/,/^  [a-z]/' | head -30`(預期含 image + depends_on + networks + healthcheck);`docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep -A 3 volumes`(預期含 `deploy/front-nginx/conf.d:/etc/nginx/conf.d:ro`)
- [ ] T034 [US1] [P] **Scenario 6**:`docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep ports`(預期 **0 命中** per FR-021)
- [ ] T035 [US1] [P] **Scenario 7**:`docker compose config | awk '/front-nginx:/,/^  [a-z]/' | grep -A 5 healthcheck`(預期含 `curl -f http://localhost/health` 樣式)
- [ ] T036 [US1] [P] **Scenario 8 (= T026 確認)**:`docker compose ps` 6 service / 5 long-running healthy(已於 T026 / T027 驗、本 task 重 check 在 acceptance phase 起點)

### Acceptance — Dimension D routing 行為(6 tasks)

- [ ] T040 [US1] [P] **Scenario 11**:SPA root `/` — `docker compose exec rust-api curl -fsS http://front-nginx/ | head -5`(預期 HTML 含 `<html` + `<title>`、200 OK)
- [ ] T041 [US1] **Scenario 12**:API proxy `/api/auth/login` — `docker compose exec rust-api curl -fsS -w "\nHTTP: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://front-nginx/api/auth/login`(預期 HTTP 200 + body 含 token;rust-api 切前綴後處理 `/auth/login`)
- [ ] T042 [US1] [P] **Scenario 13**:`/api/nonexistent` 透傳 404 — `docker compose exec rust-api curl -s -o /dev/null -w "%{http_code}\n" http://front-nginx/api/nonexistent`(預期 `404`、rust-api fallback、nginx 不攔)
- [ ] T043 [US1] [P] **Scenario 14**:SPA fallback — `docker compose exec rust-api curl -fsS http://front-nginx/some-spa-route | head -5`(預期 HTML 含 `<html` + `<title>`;base-web 內 nginx try_files 接管返 `index.html`)
- [ ] T044 [US1] [P] **Scenario 15**:front-nginx self `/health` — `docker compose exec rust-api curl -fsS http://front-nginx/health`(預期 `ok`、front-nginx 自己返、不轉發 per clarify Q1 Option A)
- [ ] T045 [US1] **Scenario 16**:Header forwarding — 跑 T041 login(若已跑可省);看 rust-api logs `docker compose logs rust-api --tail 50 | grep -E "client_ip|X-Forwarded-For|auth"`(預期 audit log / log entry 含真實 client IP — docker network 內 source、非 front-nginx 自己 IP)

### Acceptance — Dimension E W-F4 / W-F3 regression(3 tasks)

- [ ] T050 [US1] [P] **Scenario 17a W-F4 secrets**:`docker compose exec rust-api env | grep -E "APP_(JWT_JWT_SECRET|DATABASE_URL|REDIS_URL)"`(預期只命中 `*_FILE` 變量、無明文)
- [ ] T051 [US1] [P] **Scenario 17b /health 通**:`docker compose exec rust-api curl -fsS http://localhost:11081/health`(預期 `ok`、rust-api 自身 `/health` 不受 W-F5 影響)
- [ ] T052 [US1] **Scenario 18**:W-F3 regression — DNS + volume 持久:
  - `docker compose exec front-nginx getent hosts base-web`(預期解析 OK)
  - `docker compose exec front-nginx getent hosts rust-api`(預期解析 OK)
  - `docker compose down && docker compose up -d && sleep 30`(stack 重起)
  - `docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "SELECT count(*) FROM sys_user;"`(預期 count > 0、volume 持久化)

### Cleanup(1 task)

- [ ] T053 [US1] `docker compose down`(stop stack、保留 volume + `.txt` secret 不刪、便於後續 W-F6+ feature)

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**:單段 commit + push(user 同意)+ merge + INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker reset。

- [ ] T060 outer 單段 commit:`cd /home/anew/x_Project/fork260509-rev1 && git add docker-compose.yml deploy/front-nginx/ specs/010-front-nginx/ CLAUDE.md .specify/feature.json` + conventional commit(中文 subject、per CLAUDE.md §6.3);範例 commit message:
  ```
  feat(deploy): W-F5 front-nginx 反向代理落地(Phase W deploy P2 第一個 feature)

  - 新建 deploy/front-nginx/conf.d/default.conf:
    - 2 upstream(base_web → base-web:8080 / rust_api → rust-api:11081 + keepalive 32)
    - 3 location(= /health front-nginx self / /api/ → rust_api/ 切前綴 / / → base_web)
    - 5 header forwarding(Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto / X-Request-ID)
  - 新建 deploy/front-nginx/README.md
  - docker-compose.yml 加第 6 個 service `front-nginx`(nginx:1.27-alpine、無 ports、無 secrets)
  - specs/010-front-nginx/ 全套 spec docs(spec + plan + research + data-model + contracts + quickstart + tasks)
  - CLAUDE.md SPECKIT marker 更新

  W-F5 acceptance 全 PASS(13 task / 18 scenario):
  - 6 service healthy
  - nginx -t syntax OK
  - 5 種 routing path 全通(/ / /api/auth/login / /api/nonexistent 透傳 / SPA fallback / /health self)
  - W-F4 secrets + W-F3 DNS/volume 不破

  Phase W deploy P2 第一個 feature 達成,解鎖 W-F6(TLS)+ W-F7(對外 port)。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- [ ] T061 [P] **Push 010-front-nginx + merge 到 rev1-admin-root**(per CLAUDE.md §5、**須 user 同意**):
  - `git push origin 010-front-nginx`
  - `git switch rev1-admin-root`
  - `git merge --no-ff 010-front-nginx -m "Merge branch '010-front-nginx' into rev1-admin-root: W-F5 front-nginx 完成"`
  - `git push origin rev1-admin-root`
- [ ] T062 修改 `docs/INTEGRATION-CHECKLIST.md`(在 rev1-admin-root branch):
  - Current Focus 改為 `Phase W deploy P2:1/4 完成(W-F5 ✅)、剩 W-F6 / W-F7 / W-F11 等`
  - 已完成里程碑 加 W-F5 條目(outer merge SHA + acceptance 結果)
  - Phase W deploy Roadmap 表 W-F5 列改 ✅
  - 提交 `docs(checklist): W-F5 front-nginx 完成、Phase W deploy P2 進度 1/n` 單獨 commit(對齊 W-F4 模式)
- [ ] T063 修改 `CLAUDE.md` §10 SPECKIT marker(在 rev1-admin-root branch):
  - Active feature 改為「無(W-F5 全完成、下一步 W-F6 TLS 或 W-F7 對外 port)」
  - Phase 改為「Done」
  - Previous features 加 W-F5 條目 + merge SHA
  - 提交 `docs: CLAUDE.md SPECKIT marker 更新 W-F5 完成`(對齊 W-F4 模式、可獨立 commit 或併 T062)
- [ ] T064 [P] **Push docs commits**:`git push origin rev1-admin-root`(把 T062 + T063 commits 推到 remote、user 同意後)
- [ ] T065 最終 verify:`git submodule status`(預期兩 submodule 都 clean、無 `+`、SHA 維持 W-F4 既有 pin — W-F5 不動 worktree)+ `git log --oneline -5`(預期 W-F5 merge + docs commits 在 head)

---

## Dependencies

- **P1 Setup**(T001-T005):無內部依賴;T001 先(branch check)、其他可並行
- **P2 Foundational**(T010-T015):依賴 P1;T010 → T011-T015 內部多並行(read 為主)
- **P3 US1 Implementation**:
  - **outer 配置檔**(T020-T023):T020(default.conf 主檔)→ T021(README、並行於 T020 之後)→ T022 + T023(驗證 T020 結果、並行)
  - **compose service**(T024-T025):依賴 T020(`default.conf` 存在才能 mount);T024 → T025(yaml render 驗)
  - **stack + nginx config 驗**(T026-T028):依賴 T024 + T025;T026 → T027 → T028
  - **Acceptance Dim A** (T030-T032):依賴 T020-T023;T030-T032 並行(獨立 grep)
  - **Acceptance Dim B** (T033-T036):依賴 T024-T025;T033-T036 並行(獨立 compose config grep + docker compose ps)
  - **Acceptance Dim D**(T040-T045):依賴 T026 stack healthy;T040-T044 並行(獨立 curl);T045 在 T041 後(依賴 login log)
  - **Acceptance Dim E**(T050-T052):T050-T051 並行(獨立 docker exec);T052 sequential(stack down + up + psql)
  - **Cleanup**(T053):依賴 T050-T052 完成
- **P4 Polish**:依賴 P3 全 acceptance pass;T060 → T061(user 同意 push)→ T062 + T063 並行(獨立 docs commits)→ T064(user 同意 push)→ T065

---

## Parallel Execution Examples

**P1 Setup 並行**(T002-T005):
```bash
docker compose version &
docker image ls --filter "reference=rust-api:*" --filter "reference=base-web:*" &
docker image ls nginx:1.27-alpine &
ls deploy/secrets/*.txt 2>/dev/null | wc -l &
wait
```

**P3 Acceptance Dim D 並行**(T040-T044):
```bash
docker compose exec rust-api curl -fsS http://front-nginx/ -o /tmp/spa.html &
docker compose exec rust-api curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://front-nginx/api/auth/login -o /tmp/login.json &
docker compose exec rust-api curl -s -o /dev/null -w "%{http_code}\n" http://front-nginx/api/nonexistent > /tmp/404.txt &
docker compose exec rust-api curl -fsS http://front-nginx/some-spa-route -o /tmp/fallback.html &
docker compose exec rust-api curl -fsS http://front-nginx/health > /tmp/health.txt &
wait
```

**P3 Acceptance Dim B 並行**(T033-T036):同模式、4 個 grep 各跑 `docker compose config | ...`、結果獨立。

---

## Implementation Strategy

### MVP scope(US1 唯一 P1 user story)

完成 P1 + P2 + P3(T001-T053)即達 **Phase W deploy P2 第一個 feature MVP**;P4 polish 為 commit + merge + docs。

### Incremental delivery 路徑(若需要 split)

W-F5 設計上**不適合 split**(per spec.md「Why this priority」6 條 — 6 個交付片段不可獨立交付)。若強制 split 可:
- 段 1:`deploy/front-nginx/` 結構 + nginx config 主體(T020-T023)→ commit(但無 service mount、實際無功能)
- 段 2:compose service 加 + acceptance(T024 後)→ commit(才實際 work)

不推薦 — 整批 W-F5 一個 PR / 1 個 feature branch 落地對齊 spec 設計。

### Single-stage commit reminder(per CLAUDE.md §6.2)

W-F5 **不動 rust-api / base-web worktree**(W-F5 純 outer 配置層):
- **單段 commit**(per CLAUDE.md §6.2):outer feature branch commit + push(user 同意)→ merge `rev1-admin-root` + push(user 同意)
- T061 / T064 兩次 push 均須 user 明確同意

---

## Format validation

✓ All **43** tasks 使用 `- [ ] T###` 格式
✓ Setup phase(T001-T005,5 個)無 [US1] 標籤 — 對
✓ Foundational phase(T010-T015,6 個)無 [US1] 標籤 — 對
✓ User Story phase(T020-T053,共 **26** 個)全部 [US1] 標籤 — 對
✓ Polish phase(T060-T065,6 個)無 [US1] 標籤 — 對
✓ [P] marker 標在獨立檔案編輯 / 獨立 docker config grep / 獨立並行 acceptance 操作上
✓ 每個 task 含具體 file path / docker command / 操作 target

**Total**:**43** tasks(Setup 5 + Foundational 6 + US1 配置 4 + US1 compose 2 + US1 stack verify 3 + US1 acceptance Dim A 3 + Dim B 4 + Dim D 6 + Dim E 3 + cleanup 1 + Polish 6)

**Task count per user story**:**US1 = 26 tasks**(T020-T053)

**Parallel opportunities identified**:多數 grep / read / 獨立檔案編輯均標 [P]、可批次並行

**Independent test criteria**:
- nginx config syntax(T027):`nginx -t` PASS
- compose syntax(T025 + T033-T036):`docker compose config` PASS + 4 grep 命中
- stack acceptance(T026 + T040-T044):6 service healthy + 5 種 routing 全通
- W-F4/W-F3 regression(T050-T052):secrets 不洩、/health 通、DNS 解析、volume 持久

**vs W-F1 (48) / W-F2 (40) / W-F3 (39) / W-F4 (50) 比較**:W-F5 task **38**(最少)、反映:
- 純配置 layer feature(無 source code 改動、無 image rebuild、無 worktree commit)
- 單段 commit 簡化 Phase 4(vs W-F1/W-F2/W-F4 兩段 commit)
- 13 acceptance scenario 對齊 W-F4 規模
- 無 rust unit test(W-F4 有 3 個)
- 無 image build / 無 secret file 操作
