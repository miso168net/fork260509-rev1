---
description: "Task list for W-FA1 compose-nestjs-service implementation"
---

# Tasks: W-FA1 — compose-nestjs-service

**Input**: Design documents from `/specs/014-compose-nestjs-service/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/compose-contract.md`](contracts/compose-contract.md) ✓ / [`contracts/secret-contract.md`](contracts/secret-contract.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- W-FA1 為 deploy-track feature、tests = docker compose lifecycle + curl + psql acceptance scenarios(per verification-commands.md C-V1~C-V13)
- 無 unit test / integration test code(不涉 application source code)
- **Acceptance**:per spec US1 P1 MVP 3 + US2 P1 3 + US3 P2 3 + US4 P2 3 + US5 P3 2 + US6 P2 3 = 17 個 scenario

**Organization**:W-FA1 為 6 user story feature。Setup(5)+ Foundational(5)+ US1 impl + acceptance(13)+ US2 acceptance(3)+ US3 acceptance(3)+ US4 acceptance(3)+ US5 acceptance(2)+ US6 acceptance(3)+ Doc(3)+ Polish/單段 commit(3)= ~43 task。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 / US4 / US5 / US6 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(W-FA1 純 outer feature、無 worktree 動)

## Path Conventions

- **Outer(動)**:
  - 改:`docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml` / `CLAUDE.md` / `docs/INTEGRATION-CHECKLIST.md`
  - 新:`deploy/secrets/refresh_token_secret.txt.example`(tracked) + 可選 `deploy/secrets/refresh_token_secret.txt`(gitignored、可空)
- **Worktree**:**全程不動**(per FR-018 + Constitution Principle IV/V)
  - `base-web/` / `rust-api/` / `fork260509-soybean-admin-nestjs/` 都不動
- **Acceptance test 執行**:outer repo root(`docker compose` / `docker compose exec` / `curl` / `psql`)
- **Image build**:本機 docker daemon(透 BuildKit、不 push registry、留 W-FA3)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `014-compose-nestjs-service`,執行 `git branch --show-current && git status --short`(預期 branch=014-compose-nestjs-service、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified;**base-web / rust-api / nestjs fork 全程不該 modified**)
- [ ] T002 [P] 確認 docker compose v2+,執行 `docker compose version`(預期 v2.x)
- [ ] T003 [P] 確認 nestjs fork repo 本機 ready,執行 `ls -la fork260509-soybean-admin-nestjs/backend/Dockerfile && head -30 fork260509-soybean-admin-nestjs/backend/Dockerfile`(預期 Dockerfile 存在、含 `FROM node:${NODE_VERSION}-alpine AS base`)
- [ ] T004 [P] 確認 `deploy/secrets/*.txt` 5 個既有 secret 已備,`ls deploy/secrets/*.txt | grep -v example | wc -l` 預期 ≥ 5
- [ ] T005 [P] 確認 W-F6 stack 可正常啟動(可選實際跑):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  docker compose ps
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
  ```
  預期 6 service healthy(baseline,W-FA1 之前的 stack 狀態)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:grep 既有 docker-compose.yml 結構 + nestjs fork Dockerfile + 既有 secret 模式,確認 W-FA1 改動起點。

- [ ] T010 grep 既有 `docker-compose.yml` rust-api service block(對齊 W-FA1 nestjs block 風格),執行:
  ```bash
  grep -nE "^  rust-api:|profiles:|depends_on:|service_completed_successfully|service_healthy|networks:|internal" docker-compose.yml | head -20
  ```
  預期看到 rust-api 完整 yaml 結構(image / secrets / depends_on / healthcheck / networks / restart),W-FA1 nestjs block mirror 此 pattern
- [ ] T011 [P] grep 既有 `docker-compose.yml` secrets section,執行 `grep -nE "^secrets:|jwt_secret:|file: deploy/secrets/" docker-compose.yml | head -15`(預期看到 secrets: section 起始 + 5 個既有 secret 條目;W-FA1 加 refresh_token_secret 對齊此 pattern)
- [ ] T012 [P] grep 既有 `docker-compose.dev.yml` ports override,執行 `grep -nE "^  [a-z]+:|ports:|127.0.0.1" docker-compose.dev.yml | head -20`(預期看到 4 個既有 service override 含 ports 條目;W-FA1 加 nestjs 11082:9528 對齊 loopback pattern)
- [ ] T013 [P] grep 既有 `docker-compose.prod.yml` 結構,執行 `head -50 docker-compose.prod.yml`(預期看到 front-nginx prod override 0.0.0.0 + 443 + acme.sh 條目;W-FA1 加 nestjs prod override 對齊 minimal placeholder pattern)
- [ ] T014 [P] grep nestjs fork Dockerfile entry + package.json start:prod,執行:
  ```bash
  grep -nE "WORKDIR|USER|EXPOSE|CASBIN" fork260509-soybean-admin-nestjs/backend/Dockerfile | head -10
  grep -A 2 "start:prod" fork260509-soybean-admin-nestjs/backend/package.json
  ```
  預期看到 `WORKDIR /usr/src/app/soybean/backend` + `USER node` + `EXPOSE` + `node dist/apps/base-system/src/main`、W-FA1 entrypoint wrapper 對齊此 entry point

---

## Phase 3: User Story 1 — DESIGN-A profile 啟動 nestjs 加入 stack(Priority: P1)🎯 MVP

**Goal**:完成 W-FA1 全部 outer 改動 + nestjs image build + dev stack `--profile track-a up` + 7 service healthy + US1 3 個 acceptance scenario PASS。

**Independent Test**:6 outer file 改動到位 + nestjs image build 成功 + dev stack 7 service 全 healthy + curl /v1/route/getConstantRoutes 200 — 不依賴 US2~US6。

### artifact 改動(outer、6 個 file)

- [ ] T020 [US1] 改 `docker-compose.yml` 加 nestjs service block(per data-model E-1 + C-C1/C-C2/C-C3/C-C4):在既有 6 service 之後 append ~30 行 yaml:
  ```yaml
  nestjs:
    image: nestjs:${NESTJS_IMAGE_TAG:-rev1-admin-nestjs}
    profiles: ["track-a"]
    entrypoint:
      - sh
      - -c
      - |
        export JWT_SECRET=$$(cat /run/secrets/jwt_secret)
        RTS=$$(cat /run/secrets/refresh_token_secret 2>/dev/null)
        export REFRESH_TOKEN_SECRET=$${RTS:-$$JWT_SECRET}
        export DATABASE_URL=$$(cat /run/secrets/database_url)
        export REDIS_PASSWORD=$$(cat /run/secrets/redis_password)
        exec node dist/apps/base-system/src/main
    environment:
      TZ: Asia/Shanghai
      NODE_ENV: production
      APP_PORT: 9528
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      JWT_EXPIRE_IN: 3600
      REFRESH_TOKEN_EXPIRE_IN: 7200
      CASBIN_MODEL: model.conf
      DOC_SWAGGER_ENABLE: "false"
    secrets:
      - jwt_secret
      - database_url
      - redis_password
      - refresh_token_secret
    depends_on:
      migration:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9528/v1/route/getConstantRoutes || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    networks:
      - internal
    restart: unless-stopped
  ```
  注:用 robust fallback(`RTS=...; ${RTS:-$JWT_SECRET}`)per C-S2、處理「refresh_token_secret 存在但空檔」也 fallback;`exec node` 保 SIGTERM 傳遞;`DOC_SWAGGER_ENABLE: "false"` yaml string 避免 boolean cast

- [ ] T021 [US1] 改 `docker-compose.yml` 加 refresh_token_secret 條目進 `secrets:` section(per data-model E-2 + C-C5):在既有 5 個 secret 之後 append:
  ```yaml
    refresh_token_secret:
      file: deploy/secrets/refresh_token_secret.txt
  ```

- [ ] T022 [US1] [P] 改 `docker-compose.dev.yml` 加 nestjs ports override(per data-model E-3 + C-C6):在既有 4 個 dev override 之後 append ~3 行:
  ```yaml
    nestjs:
      ports:
        - "127.0.0.1:11082:9528"
  ```

- [ ] T023 [US1] [P] 改 `docker-compose.prod.yml` 加 nestjs prod override(per data-model E-4 + C-C7):append ~2 行:
  ```yaml
    nestjs:
      # prod 不暴露 host port — 僅內部訪問、透 W-FA2 nginx routing(後續 feature)
      restart: always
  ```

- [ ] T024 [US1] [P] 新建 `deploy/secrets/refresh_token_secret.txt.example`(tracked、per data-model E-5 + C-S3):
  ```
  # Refresh token signing secret for nestjs (W-FA1 / F10 future use)
  # Generate via: openssl rand -hex 32
  # Or leave file empty / missing → entrypoint fallback JWT_SECRET (per W-FA1 spec FR-005)
  REPLACE_WITH_64_HEX_CHARS_OR_LEAVE_EMPTY_FOR_FALLBACK
  ```

- [ ] T025 [US1] 備本機 `deploy/secrets/refresh_token_secret.txt`(operator action、gitignored、可空檔):
  ```bash
  touch deploy/secrets/refresh_token_secret.txt   # 走 fallback to JWT_SECRET
  # 或:openssl rand -hex 32 > deploy/secrets/refresh_token_secret.txt  # 獨立 secret
  ```
  注:docker compose 要 secret file 存在、否則啟動 fail-fast、所以**必須 touch 或寫內容**

### nestjs image build + dev stack up(3 tasks)

- [ ] T026 [US1] [P] Build nestjs image(per C-V1):
  ```bash
  DOCKER_BUILDKIT=1 docker build \
    -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
    -t nestjs:rev1-admin-nestjs \
    fork260509-soybean-admin-nestjs/backend/ 2>&1 | tail -10
  docker images nestjs:rev1-admin-nestjs --format "{{.Repository}}:{{.Tag}} {{.Size}}"
  ```
  預期 exit 0、Size ≤ 500MB(per NFR-001)、cold 5min / warm 30s

- [ ] T027 [US1] Dev stack `--profile track-a` 起(per quickstart Step 4):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
  docker compose ps
  ```
  預期 7 service 全 healthy(postgres / redis / migration exited / rust-api / base-web / front-nginx / nestjs)、耗時 ≤ 180s cold

- [ ] T028 [US1] [P] 驗 W-FA1 改動到位 + base-web/rust-api/nestjs-fork 三邊零改動驗(per C-V9):
  ```bash
  git diff --name-only HEAD
  # 預期只列 outer file:6 個改 + spec docs 新建
  git diff HEAD -- base-web/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
  # 預期無輸出(per FR-018)
  ```

### US1 acceptance scenarios(per spec US1 3 scenarios + C-V2/C-V7)

- [ ] T030 [US1] **AC US1.1** 7 service 全 healthy(per C-V2):
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.Status}}"
  ```
  預期 7 service 全 `(healthy)`、含 nestjs

- [ ] T031 [US1] [P] **AC US1.2** nestjs container internal endpoint(per C-V6 inline):
  ```bash
  docker compose exec -T nestjs sh -c 'curl -fsS http://localhost:9528/v1/route/getConstantRoutes' | head -c 200
  ```
  預期 HTTP 200 + JSON envelope

- [ ] T032 [US1] [P] **AC US1.3** host port 11082 直連(per C-V7):
  ```bash
  curl -fsS -o /dev/null -w "HTTP %{http_code} time_total=%{time_total}s\n" \
    http://127.0.0.1:11082/v1/route/getConstantRoutes
  ```
  預期 HTTP 200、time_total ≤ 1s

**Checkpoint**:US1 完成 — W-FA1 全部 outer 改動到位、nestjs image build 過、7 service 全 healthy、host port 11082 work、base-web/rust-api/nestjs-fork 三邊零改動。

---

## Phase 4: User Story 2 — Secret _FILE bridge(Priority: P1)

**Goal**:驗 4 個 secret 透過 entrypoint wrapper bridge 進 env、且不洩 plaintext 到外部。

**Independent Test**:US1 stack 已起、3 個 docker compose exec / inspect 命令驗。

### US2 acceptance(per spec US2 3 scenarios + C-V4)

- [ ] T040 [US2] [P] **AC US2.1** 4 個 secret 都 bridge 進 env(per C-V4):
  ```bash
  docker compose exec -T nestjs sh -c 'env | grep -cE "^(JWT_SECRET|REFRESH_TOKEN_SECRET|DATABASE_URL|REDIS_PASSWORD)="'
  ```
  預期 `4`

- [ ] T041 [US2] [P] **AC US2.2** JWT_SECRET length = 64(對齊 rev1 jwt_secret.txt):
  ```bash
  docker compose exec -T nestjs sh -c 'echo -n $JWT_SECRET | wc -c'
  ```
  預期 `64`

- [ ] T042 [US2] [P] **AC US2.3** plaintext 不洩(per C-V4 + SC-005):
  ```bash
  docker inspect rev1-admin-nestjs-1 | jq '.[0].Config.Env' | grep -iE "jwt_secret|password|database_url" | head -5
  ```
  預期只顯示 `_FILE` path 或 secrets ref、不顯示 plaintext value

**Checkpoint**:US2 完成 — secret _FILE pattern 對齊 W-F4 紀律、4 個 secret 透過 entrypoint sh wrapper bridge 進 env、外部 inspection 不洩 plaintext。

---

## Phase 5: User Story 3 — DB 共享 + sys_tokens schema verify(Priority: P2)

**Goal**:驗 nestjs container 可 connect rev1 既有 postgres + sys_tokens schema acceptance(若不存在降級)。

**Independent Test**:US1 stack 已起、3 個 docker compose exec 命令驗。

### US3 acceptance(per spec US3 3 scenarios + C-V5)

- [ ] T050 [US3] [P] **AC US3.1** sys_tokens 表存在驗(per C-V5,允許降級):
  ```bash
  docker compose exec -T postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens" 2>&1 | head -15
  ```
  預期:
  - 若 sys_tokens 表存在(rust-api migration 已落):顯示 schema(columns + types)→ US3.1 完整 PASS
  - 若不存在(`Did not find any relation`):W-FA1 acceptance **降級**為「驗 connectivity-only、留 F10 follow-up 加 sys_tokens migration」、仍算 US3 PASS

- [ ] T051 [US3] [P] **AC US3.2** nestjs logs 無 DB connection error(per C-V5):
  ```bash
  docker compose logs nestjs --tail 50 2>&1 | grep -iE "connection refused|ENOTFOUND postgres|auth failed for user soybean"
  ```
  預期無 hit(empty output)

- [ ] T052 [US3] [P] **AC US3.3** healthcheck PASS 隱含 DB connect OK(per C-V6 重用):
  ```bash
  docker inspect rev1-admin-nestjs-1 --format='{{json .State.Health.Status}}'
  ```
  預期 `"healthy"`(若 DB connect fail、nestjs 啟動 fail、healthcheck 不會 PASS)

**Checkpoint**:US3 完成 — nestjs connect rev1 postgres OK、sys_tokens schema 對齊驗(或降級為 connectivity-only)、留 F10 follow-up。

---

## Phase 6: User Story 4 — nestjs healthcheck 機制(Priority: P2)

**Goal**:驗 nestjs healthcheck 透過 `/v1/route/getConstantRoutes` 業務 endpoint 正常 work、`depends_on` 可用此 health 狀態。

**Independent Test**:US1 stack 已起、3 個 docker compose ps / inspect 命令驗。

### US4 acceptance(per spec US4 3 scenarios + C-V6)

- [ ] T060 [US4] [P] **AC US4.1** nestjs ps 顯示 healthy:
  ```bash
  docker compose ps nestjs --format "{{.Status}}"
  ```
  預期 `Up X seconds (healthy)` 字串

- [ ] T061 [US4] [P] **AC US4.2** State.Health.Status = healthy + FailingStreak = 0:
  ```bash
  docker inspect rev1-admin-nestjs-1 --format='{{json .State.Health}}' | jq '{Status, FailingStreak}'
  ```
  預期 `{"Status": "healthy", "FailingStreak": 0}`

- [ ] T062 [US4] [P] **AC US4.3** healthcheck 日誌看 last 3 entries 都 exit 0:
  ```bash
  docker inspect rev1-admin-nestjs-1 --format='{{json .State.Health.Log}}' | jq '.[-3:] | map({ExitCode})'
  ```
  預期 `[{"ExitCode": 0}, {"ExitCode": 0}, {"ExitCode": 0}]`

**Checkpoint**:US4 完成 — nestjs healthcheck 規格與 nestjs fork 既有 endpoint 對齊、W-FA2 後續可用此 health 狀態。

---

## Phase 7: User Story 5 — DESIGN-B 形態 nestjs 不啟動(Priority: P3)

**Goal**:驗 profile 機制 work — 不帶 `--profile track-a` 啟 stack、nestjs 不啟動。

**Independent Test**:down + 不帶 profile up + verify 6 service。

### US5 setup + acceptance(per spec US5 2 scenarios + C-V3)

- [ ] T070 [US5] Down stack + 不帶 profile up:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  ```
  注:此 task 改變 stack 狀態(7 → 6 service)、會影響 US1~US4 的後續 re-test、所以放 Phase 7 序列

- [ ] T071 [US5] [P] **AC US5.1** 6 service 無 nestjs(per C-V3):
  ```bash
  docker compose ps --format "{{.Service}}" | sort
  ```
  預期 6 行(postgres / redis / migration 已 exited / rust-api / base-web / front-nginx)、無 nestjs

- [ ] T072 [US5] [P] **AC US5.2** ps --services grep nestjs exit 1:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --services 2>&1 | grep nestjs
  echo "exit: $?"
  ```
  預期 exit code 1(無 hit、grep 找不到 nestjs)

**Checkpoint**:US5 完成 — profile 機制 verified、DESIGN-B 形態下 nestjs 不啟動、DESIGN-A → DESIGN-B 遷移路徑 work。

---

## Phase 8: User Story 6 — base-web / rust-api / 既有 W-F* 零回歸(Priority: P2)

**Goal**:驗 W-FA1 落地後 F6 / F5.1 既有 browser login flow 仍 PASS、三邊 source 零改動、front-nginx self health 200。

**Independent Test**:可在 track-a profile 或 default profile 都跑(US6 不要求特定 profile);用 curl 驗(不需 CDP)。

### US6 acceptance(per spec US6 3 scenarios + C-V8/C-V9)

- [ ] T080 [US6] **AC US6.1** F6 browser login regression via curl(per C-V8):
  ```bash
  # 先重起 stack with track-a(若 T070 cleanup 後想 re-verify、可選)
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait

  # F6 login + isRouteExist 驗
  TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    http://127.0.0.1:11080/api/auth/login | grep -oP '"token":"\K[^"]+')
  echo "Token len: ${#TOKEN}"

  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -c 150
  ```
  預期 token len > 100、F6 endpoint 回 `{"code":0,"data":true,"msg":"success","success":true}`

- [ ] T081 [US6] [P] **AC US6.2** zero-diff 三邊驗(per C-V9):
  ```bash
  git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
  ```
  預期無輸出(空 diff、per FR-018)

- [ ] T082 [US6] [P] **AC US6.3** front-nginx self health(per C-V13 補強):
  ```bash
  curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:11080/health
  ```
  預期 HTTP 200(W-F5 既有 health endpoint、W-FA1 不破)

**Checkpoint**:US6 完成 — W-FA1 加 nestjs 服務不影響既有 stack 行為、F6 browser login 仍 PASS、三邊 source 零改動。

---

## Phase 9: Documentation Update

**Goal**:同步更新 outer doc(CLAUDE.md + INTEGRATION-CHECKLIST.md)反映 W-FA1 落地。

- [ ] T090 改 `CLAUDE.md` §5.2 + §5.2.1 加 track-a profile 啟動命令 + nestjs port 11082(per data-model E-6 + FR-013):
  - §5.2 對外 endpoint 與 port 規劃 表加 1 行:`| nestjs (對外、僅 dev) | nestjs fork :9528 | :11082(dev only、profile=track-a 啟用時) |`
  - §5.2.1 加第 4 個啟動範例「DESIGN-A 路線 dev(profile=track-a、加 nestjs 進 stack)」:
    ```bash
    docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
    docker compose ps  # 7 service healthy(含 nestjs)
    curl -fsS http://127.0.0.1:11082/v1/route/getConstantRoutes  # nestjs 直連驗
    ```
  - §10 SPECKIT marker(已由 /speckit-plan 階段自動更新指 W-FA1、tasks 階段不需改動)

- [ ] T091 [P] 改 `docs/INTEGRATION-CHECKLIST.md`(per data-model E-7 + FR-014):
  - Current Focus 更新:
    ```diff
    - **Phase**:application Phase 2 ...
    + **Phase**:Phase W deploy P7 Track DESIGN-A 三件套啟動(W-FA1 進行中)— DESIGN-A 路線 deploy chain 起點;application Phase 2 並行 F5.1 + F6 完成
    - **Active feature**:無(F6 全完成、...)
    + **Active feature**:W-FA1 `compose-nestjs-service` 進行中
    - **下一步**:F7 manage-crud-alignment ...
    + **下一步**:W-FA1 implement → W-FA2 nginx-track-a-transitional-block → F10 refresh-token-nestjs-bridge → W-FA3 cicd-nestjs-build-job
    ```
  - 加新段 Phase W-7 Roadmap 表(per data-model E-7):
    ```markdown
    ## Phase W-7 deploy Roadmap — Track DESIGN-A 三件套(per DESIGN-W §11 line 1114-1116)

    | # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
    |---|---|---|---|---|---|---|---|
    | W-FA1 | `compose-nestjs-service` | ✅ | ✅ | ✅ | ✅ | — | **進行中**(implement 階段)|
    | W-FA2 | `nginx-track-a-transitional-block` | — | — | — | — | — | 未啟 |
    | W-FA3 | `cicd-nestjs-build-job` | — | — | — | — | — | 未啟 |
    ```
  - 已完成里程碑加 W-FA1 條目(implement + acceptance PASS 後填、`<sha-pending>` placeholder)

- [ ] T092 [P] 驗 doc 改動 grep:
  ```bash
  grep -E "W-FA1|track-a|11082" CLAUDE.md docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期至少 4 match(SPECKIT marker + port 規劃 + 啟動範例 + Phase W-7 表)

**Checkpoint**:Phase 9 完成 — doc 改動到位、Phase 10 commit。

---

## Phase 10: Polish & 單段 Commit + Push wait(per CLAUDE.md §6.1 W-F* 慣例)

**Goal**:落實**單段 commit** 紀律(W-FA1 純 outer、無 worktree 動)、push 等 user 同意。

- [ ] T100 Stage outer 改動:
  ```bash
  git status --short
  # 預期:
  #   modified: docker-compose.yml
  #   modified: docker-compose.dev.yml
  #   modified: docker-compose.prod.yml
  #   modified: CLAUDE.md
  #   modified: docs/INTEGRATION-CHECKLIST.md
  #   modified: .specify/feature.json
  #   untracked: deploy/secrets/refresh_token_secret.txt.example
  #   untracked: specs/014-compose-nestjs-service/

  git add docker-compose.yml \
          docker-compose.dev.yml \
          docker-compose.prod.yml \
          deploy/secrets/refresh_token_secret.txt.example \
          CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          specs/014-compose-nestjs-service/
  ```

- [ ] T101 單段 outer commit(per quickstart 模式 3):
  ```bash
  git commit -m "$(cat <<'EOF'
  feat(deploy): W-FA1 加 nestjs service + profile=track-a + JWT secret _FILE bridge

  rev1 deploy 階段 Track DESIGN-A 專屬第一個 feature(P7 三件套 W-FA1/W-FA2/W-FA3
  中最先動)。把 nestjs service 加進 rev1 docker compose stack、走 profile=track-a
  啟動模式、共享 rev1 既有 postgres + redis、JWT secret 透過 W-F4 _FILE pattern
  與 rust-api 共享。

  改 / 新建(6 個 outer file + 1 個 local image artifact):
  - docker-compose.yml:加 nestjs service block + secrets 加 refresh_token_secret
  - docker-compose.dev.yml:加 nestjs ports override 127.0.0.1:11082:9528
  - docker-compose.prod.yml:加 nestjs prod override(無 ports、restart always)
  - deploy/secrets/refresh_token_secret.txt.example
  - CLAUDE.md §5.2/§5.2.1 加 track-a 啟動 + port 11082
  - docs/INTEGRATION-CHECKLIST.md Phase W-7 Track-A roadmap + W-FA1 進度
  - nestjs:rev1-admin-nestjs image build(local、未 push registry、留 W-FA3)

  Acceptance:US1 P1 MVP 3/3 + US2 P1 3/3 + US3 P2 3/3 + US4 P2 3/3 +
  US5 P3 2/2 + US6 P2 3/3 = 17/17 PASS;sys_tokens schema 對齊驗若不存在
  降級為 connectivity-only(F10 follow-up);base-web/rust-api/nestjs fork
  三邊零改動 (per FR-018 + Constitution Principle IV/V 延伸)。

  Constitution Check 13 PASS / 16 N/A / 0 violation;DESIGN-A → DESIGN-B
  遷移時整組刪除 3 處(service block / secret 條目 / host port)、無
  DB / application 改動。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] T102 Push 等 user 同意:
  - 告知 user:「W-FA1 單段 outer commit 已落、要不要 push origin 014-compose-nestjs-service?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑:
    ```bash
    git push origin 014-compose-nestjs-service
    # 視情況也 merge 回 rev1-admin-root(對齊 W-F5/W-F6/W-F7 模式、merge --no-ff 留 merge commit + 補 SHA 進 CHECKLIST)
    ```

**Checkpoint**:Phase 10 完成 — W-FA1 落地、單段 commit 紀律遵守、base-web/rust-api/nestjs fork 三邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 | — |
| Phase 2 Foundational | Phase 3 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 6 + 7 + 8 + 9 + 10 | Phase 1 + 2 |
| Phase 4 US2 | Phase 9 | Phase 3(stack up 後可驗) |
| Phase 5 US3 | Phase 9 | Phase 3(stack up 後可驗) |
| Phase 6 US4 | Phase 9 | Phase 3(stack up 後可驗) |
| Phase 7 US5 | Phase 8 | Phase 3(US5 改 stack 狀態、影響後續) |
| Phase 8 US6 | Phase 9 | Phase 3 + Phase 7(US5 down 後須重啟 with track-a 再驗 US6) |
| Phase 9 Doc | Phase 10 | Phase 3-8 全 PASS |
| Phase 10 Commit | — | 全 9 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(outer 6 file 改 + image build + stack up + 3 acceptance)
- US2(P1):純 acceptance phase、依賴 US1 已啟 stack
- US3(P2):純 acceptance phase + manual SQL、依賴 US1 已啟 stack
- US4(P2):純 acceptance phase、依賴 US1 已啟 stack
- US5(P3):純 acceptance phase + 改 stack 狀態、依賴 US1 stack 起過至少 1 次
- US6(P2):純 acceptance phase + 跨 stack 模式驗、可在 track-a profile 或 default profile 跑

實際:**US1 = implement;US2/US3/US4/US6 = 純驗證(stack up);US5 = 純驗證(stack down + re-up without profile)**。

## Parallel Execution

### Phase 1 全可並行
T002 / T003 / T004 / T005 全並行(獨立 docker / ls / git 命令)

### Phase 2 全可並行
T010 / T011 / T012 / T013 / T014 全並行(獨立 grep)

### Phase 3 部分並行
- T020 / T021 / T022 / T023 / T024 大致序列(T020 + T021 同檔 docker-compose.yml、需序列;T022 / T023 / T024 / T025 / T026 並行 — 不同檔)
- T025 + T026 並行(本機 secret 備 + image build 獨立)
- T027 / T028 序列(stack up 後 verify)
- T030 + T031 + T032 並行(獨立 curl / docker exec)

### Phase 4 全可並行
T040 / T041 / T042 並行(獨立 docker compose exec / inspect)

### Phase 5 全可並行
T050 / T051 / T052 並行(獨立 psql / logs / inspect)

### Phase 6 全可並行
T060 / T061 / T062 並行(獨立 docker compose ps / inspect)

### Phase 7 序列
T070(down + up)→ T071 / T072 並行

### Phase 8 序列(US6.1 需重啟 stack with track-a)+ 並行(zero-diff / health)
T080 序列(stack restart with profile 再驗 F6);T081 / T082 並行

### Phase 9 序列 + 並行
T090 在前(改 CLAUDE.md);T091 / T092 並行(獨立 doc edit / grep)

### Phase 10 序列
T100(stage)→ T101(commit)→ T102(push wait)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 nestjs container 進 stack + healthy + secret bridge 完整、value delivered。US2~US6 為驗證 phase、確認 secret bridge / DB / healthcheck / DESIGN-B 切換 / 零回歸。

**MVP commit policy**:推薦走完整 Phase 1-10 一次到位(對齊 W-F5/W-F6/W-F7 同 session 模式),不 US1-only commit。

**並行 vs 序列建議**:
- 全 ~43 task 預估時間 60-90 分鐘(主要是 nestjs image build cold ~5 min、stack up/down ~2 min 切換)
- Phase 3 acceptance + Phase 4-6 acceptance 並行 docker exec 可省 5-10 分鐘
- Critical path:T020-T024 改動 → T026 image build → T027 stack up → T030+T031+T032 US1 acceptance → T040+~T062 US2-US4 並行 acceptance → T070 stack restart → T071+T072 US5 → T080 stack with profile re-up + T081+T082 US6 → T090+T091 doc → T100-T102 commit

**故障排查**(per quickstart 故障排查段):
- nestjs image build fail:check pnpm-lock.yaml 完整性(屬 fork 維護紀律、W-FA1 範疇外)
- nestjs container unhealthy:`docker compose logs nestjs --tail 100` 看 secret / DB / Casbin model 路徑問題
- port 11082 conflict:殺占用 process 或改 W-FA1 host port
- refresh_token_secret.txt 缺:`touch deploy/secrets/refresh_token_secret.txt`(走 fallback)

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3/US4/US5/US6] | ✓(T020-T032 [US1] / T040-T042 [US2] / T050-T052 [US3] / T060-T062 [US4] / T070-T072 [US5] / T080-T082 [US6]) |
| Setup / Foundational / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement` 或 `/speckit-analyze`**。
