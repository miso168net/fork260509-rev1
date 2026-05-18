---
description: "Task list for W-FA2 nginx-track-a-transitional-block implementation"
---

# Tasks: W-FA2 — nginx-track-a-transitional-block

**Input**: Design documents from `/specs/015-nginx-track-a-transitional-block/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/nginx-contract.md`](contracts/nginx-contract.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- W-FA2 為 deploy-track feature、tests = nginx -t / docker compose exec / curl / sed acceptance scenarios(per verification-commands.md C-V1~C-V12)
- 無 unit test / integration test code(不涉 application source code)
- **Acceptance**:per spec US1 P1 MVP 3 + US2 P2 3 + US3 P2 3 + US4 P2 3 = 12 個 scenario

**Organization**:W-FA2 為 4 user story feature。Setup(4)+ Foundational(4)+ US1 impl + acceptance(9)+ US2 acceptance(3)+ US3 acceptance(3)+ US4 acceptance(3)+ Doc(3)+ Polish/單段 commit(3)= ~32 task。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 / US4 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(W-FA2 純 outer feature、無 worktree 動)

## Path Conventions

- **Outer(動)**:
  - 改:`deploy/front-nginx/conf.d/default.conf` / `deploy/front-nginx/conf.d/default.conf.prod` / `CLAUDE.md` / `docs/INTEGRATION-CHECKLIST.md`
  - 新:無(per FR-014 + FR-015 不引入新 file)
- **Worktree**:**全程不動**(per FR-013 + Constitution Principle IV/V)
  - `base-web/` / `rust-api/` / `fork260509-soybean-admin-nestjs/` 都不動
- **Acceptance test 執行**:outer repo root(`docker compose exec front-nginx nginx -t` / `curl` / `docker cp` / `sed`)
- **Image build**:無(W-FA2 不 build 任何 image)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `015-nginx-track-a-transitional-block`,執行 `git branch --show-current && git status --short`(預期 branch=015-nginx-track-a-transitional-block、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified;**base-web / rust-api / nestjs fork 全程不該 modified**)
- [ ] T002 [P] 確認 nestjs image `nestjs:rev1-admin-nestjs` 已 build(W-FA1 落地產物),執行 `docker images nestjs:rev1-admin-nestjs --format "{{.Repository}}:{{.Tag}} {{.Size}}"`(預期看到 image + ~870MB size;若無、跑 W-FA1 quickstart Step 1-2 build)
- [ ] T003 [P] 確認 `deploy/secrets/refresh_token_secret.txt` 已備(W-FA1 落地、本機可空檔走 fallback),執行 `ls -la deploy/secrets/refresh_token_secret.txt`(預期檔存在;若無、`touch deploy/secrets/refresh_token_secret.txt`)
- [ ] T004 [P] 確認 W-FA1 stack 可正常啟動(track-a profile baseline),執行:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
  docker compose ps
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a down --remove-orphans
  ```
  預期 7 service healthy(baseline、W-FA2 之前的 stack 狀態)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:grep 既有 nginx config 結構 + snippets + nestjs fork endpoint 對齊,確認 W-FA2 改動起點。

- [ ] T010 grep 既有 `default.conf` server block + location 結構(對齊 W-FA2 inline TRANSITIONAL block 加入位置),執行:
  ```bash
  grep -nE "^server \{|^    listen|^    location|^    include" deploy/front-nginx/conf.d/default.conf | head -20
  ```
  預期看到 2 個 server block(80 + 443)、各含 `location = /health` / `location /api/` / `location /` 三個 location;W-FA2 加 `location = /api/auth/refreshToken` 在 `/api/` 之後、`/ ` 之前
- [ ] T011 [P] grep 既有 `default.conf.prod` server block 結構,執行 `grep -nE "^server \{|^    listen|^    location|^    include|^    return" deploy/front-nginx/conf.d/default.conf.prod | head -15`(預期看到 2 個 server block:80 redirect 301 / 443 ssl + location;W-FA2 只在 443 server 加 TRANSITIONAL block、80 不加)
- [ ] T012 [P] grep 既有 `snippets/proxy_headers.inc` 內容(對齊 W-FA2 inline block include 用法),執行 `cat deploy/front-nginx/snippets/proxy_headers.inc`(預期看到 5 個 proxy_set_header + proxy_read_timeout 60s)
- [ ] T013 [P] 驗 nestjs fork `POST refreshToken` endpoint 存在(per R-5、已 brainstorm 階段確認、implement 前 re-verify),執行 `grep -nE "@Post\(['\"]refreshToken['\"]|@Public" fork260509-soybean-admin-nestjs/backend/apps/base-system/src/api/iam/rest/authentication.controller.ts | head -10`(預期看到 `@Public()` + `@Post('refreshToken')`、行號 ~58-59)

---

## Phase 3: User Story 1 — DESIGN-A track-a 模式下 refreshToken 走通 nginx → nestjs(Priority: P1)🎯 MVP

**Goal**:完成 W-FA2 全部 nginx config 改動 + reload + track-a stack up + 3 個 US1 acceptance scenario PASS。

**Independent Test**:3 處 inline TRANSITIONAL block 加入到位、reload nginx 後 nginx -t OK、track-a stack 7 service healthy、curl POST refreshToken 回 nestjs envelope(非 404)— 不依賴 US2~US4。

### artifact 改動(outer、3 個 file)

- [ ] T020 [US1] 改 `deploy/front-nginx/conf.d/default.conf` dev 80 server block 加 inline TRANSITIONAL block(per data-model E-1 + C-N1/C-N2):在既有 `location /api/ { ... }` block **之後**、`location / { ... }` SPA fallback **之前**插入 ~9 行:
  ```nginx
      # >>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點(per W-FA2) <<<<<
      # 過渡期由 nestjs 補位 refreshToken;F13 rust 補實作後 F14 cutover 刪整段
      # 用 variable proxy_pass + resolver(127.0.0.11)讓 DNS 延遲到 request time
      # default profile / DESIGN-B 退場 nginx 仍可啟動 + nginx -t OK
      location = /api/auth/refreshToken {
          resolver 127.0.0.11 valid=10s ipv6=off;
          set $nestjs_upstream "nestjs:9528";
          proxy_pass http://$nestjs_upstream/v1/auth/refreshToken;
          include /etc/nginx/snippets/proxy_headers.inc;
      }
      # <<<<< TRANSITIONAL END >>>>>
  ```

- [ ] T021 [US1] 改 `deploy/front-nginx/conf.d/default.conf` dev 443 server block 加同樣 inline TRANSITIONAL block(per data-model E-2 + C-N1/C-N3):同 T020 結構、放在 443 server block 內 `/api/` 之後 `/` 之前(與 T020 同檔不同 server、需序列)

- [ ] T022 [US1] [P] 改 `deploy/front-nginx/conf.d/default.conf.prod` prod 443 server block 加 inline TRANSITIONAL block(per data-model E-3 + C-N1/C-N4):同 T020 結構、放在 443 ssl server block 內 `/api/` 之後 `/` 之前(prod 80 server 只 `return 301`、**不加** TRANSITIONAL block)

### nginx reload + 驗 syntax(2 tasks)

- [ ] T023 [US1] 啟 stack with track-a profile(若未啟)+ reload nginx(per quickstart Step 5):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
  docker compose exec -T front-nginx nginx -s reload
  ```
  預期 7 service healthy、reload 完成無 error

- [ ] T024 [US1] [P] **AC US1.1 + C-V1** nginx -t syntax check:
  ```bash
  docker compose exec -T front-nginx nginx -t
  echo "exit: $?"
  ```
  預期 exit 0、stdout/stderr 含 `nginx: configuration file ... is successful`

### US1 acceptance scenarios(per spec US1 3 scenarios + C-V3/C-V4)

- [ ] T030 [US1] **AC US1.2 + C-V3** curl POST refreshToken happy path:
  ```bash
  curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"refreshToken":"invalid-test-token"}' \
    http://127.0.0.1:11080/api/auth/refreshToken | head -c 500
  echo ""
  ```
  預期 response 不是 HTTP 404(若回 404 = W-FA2 wire-up 失敗、被 rust-api `/api/` 攔)、是 nestjs ApiRes envelope shape(具 `code` / `msg` / `data` field、可能是 4xx invalid token、envelope shape 對齊 nestjs)

- [ ] T031 [US1] [P] **AC US1.3 + C-V4** nestjs log 看到 refreshToken request:
  ```bash
  docker compose logs nestjs --since 2m 2>&1 | grep -E "POST /v1/auth/refreshToken"
  ```
  預期至少 1 hit(證 nginx 確實 forward request 到 nestjs)

- [ ] T032 [US1] [P] **驗 W-FA2 改動到位 + base-web/rust-api/nestjs-fork 三邊零改動驗**(per C-V10):
  ```bash
  git diff --name-only HEAD
  # 預期只列 outer file:default.conf / default.conf.prod / CLAUDE.md / INTEGRATION-CHECKLIST.md / .specify/feature.json + spec docs untracked
  git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
  # 預期無輸出(per FR-013)
  ```

**Checkpoint**:US1 完成 — W-FA2 全部 nginx 改動到位、3 處 TRANSITIONAL block 就位、reload 後 nginx -t OK、refreshToken 走通 nginx → nestjs、base-web/rust-api/nestjs-fork 三邊零改動。

---

## Phase 4: User Story 2 — DESIGN-B / default profile 下 nginx 不被 nestjs 缺席影響(Priority: P2)

**Goal**:驗 variable proxy_pass + resolver lazy DNS 設計 — default profile 啟動 nginx 仍 healthy + nginx -t OK、refreshToken 回 502/504 不 crash、F6 既有 wiring 不破。

**Independent Test**:down stack with track-a profile + up without profile + 3 個 docker / curl / 驗。

### US2 acceptance(per spec US2 3 scenarios + C-V5/C-V6)

- [ ] T040 [US2] **AC US2.1 setup** Down stack with track-a + up without profile(per C-V5 Step 1-2):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a down --remove-orphans
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
  docker compose ps --format "{{.Service}}\t{{.State}}"
  docker compose exec -T front-nginx nginx -t
  ```
  預期 5 service running(無 nestjs、migration exited)、nginx -t exit 0

- [ ] T041 [US2] [P] **AC US2.2 + C-V5 Step 4** curl POST refreshToken 在 default profile 回 502/504:
  ```bash
  curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST \
    -H "Content-Type: application/json" \
    -d '{"refreshToken":"x"}' \
    http://127.0.0.1:11080/api/auth/refreshToken
  docker inspect rev1-admin-front-nginx-1 --format='{{.State.Health.Status}}'
  ```
  預期 HTTP 502 或 504(nginx 無法 reach nestjs upstream、非 crash 非 404);front-nginx 自己仍 `healthy`

- [ ] T042 [US2] [P] **AC US2.3 + C-V6** F6 login flow 在 default profile 仍 PASS:
  ```bash
  TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    http://127.0.0.1:11080/api/auth/login | grep -oP '"token":"\K[^"]+')
  echo "Token len: ${#TOKEN}"
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -c 150
  ```
  預期 Token len > 100、F6 endpoint 回 `{"code":0,"data":true,"msg":"success","success":true}`(證 W-FA2 inline block 不影響既有 `/api/` prefix routing)

**Checkpoint**:US2 完成 — default profile 下 nginx 仍 healthy + nginx -t OK + refreshToken 502/504 + F6 login PASS、graceful degradation 設計驗證。

---

## Phase 5: User Story 3 — prod config 結構 + syntax parity(Priority: P2)

**Goal**:驗 `default.conf.prod` 加 TRANSITIONAL block 後 prod 模式 nginx 啟動 OK、TLS 不破、track-a profile 下 prod 也能走 refreshToken。

**Independent Test**:3 個 docker compose config / up / curl 驗。

### US3 acceptance(per spec US3 3 scenarios + C-V7/C-V8/C-V9)

- [ ] T050 [US3] [P] **AC US3.1 + C-V7** prod config syntax sanity:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a config --quiet 2>&1
  echo "exit: $?"
  ```
  預期 exit 0(yaml + nginx config 結構 valid)

- [ ] T051 [US3] **AC US3.2 + C-V8** prod baseline + track-a 啟動(若 dev cert 已 seed):
  ```bash
  # Prereq:確認 named volume 已 seed cert(W-F6 quickstart)
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
  docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
    sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile track-a up -d --wait
  docker compose ps
  docker compose exec -T front-nginx nginx -t
  ```
  預期 7 service healthy、nginx -t OK(若 prod cert 未 seed、降為 syntax-only verify per C-V11 W-F6 既有降級慣例)

- [ ] T052 [US3] [P] **AC US3.3 + C-V9** prod refreshToken HTTPS verify:
  ```bash
  curl -k -fsS -X POST -H "Content-Type: application/json" \
    -d '{"refreshToken":"invalid-test-token"}' \
    https://127.0.0.1:11443/api/auth/refreshToken | head -c 500
  ```
  預期同 T030(nestjs envelope、非 404、非 502);`-k` 跳自簽 cert 驗

**Checkpoint**:US3 完成 — prod config TRANSITIONAL block 加入後 prod 啟動 OK、HTTPS 不破、track-a 模式 prod 也能走 refreshToken。

---

## Phase 6: User Story 4 — zero-regression + marker 整段刪驗(Priority: P2)

**Goal**:W-F* 標配零回歸 + 驗 marker block 整段可機械刪除、證 F14 cutover 路徑乾淨。

**Independent Test**:3 個 git diff / curl / sed + docker cp + nginx -t 驗。

### US4 acceptance(per spec US4 3 scenarios + C-V10/C-V6/C-V11)

- [ ] T060 [US4] [P] **AC US4.1 + C-V10** zero-diff three sides:
  ```bash
  git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/
  ```
  預期無輸出(per FR-013 三邊零改動)

- [ ] T061 [US4] **AC US4.2 + C-V6** F6 browser login regression 在 track-a 模式(需先 re-up with track-a 因 T040 已 down):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
  TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    http://127.0.0.1:11080/api/auth/login | grep -oP '"token":"\K[^"]+')
  echo "Token len: ${#TOKEN}"
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -c 150
  ```
  預期 Token len > 100、F6 endpoint 回 envelope success:true(track-a 模式 + default 模式都 PASS、證 W-FA2 不影響既有 wiring)

- [ ] T062 [US4] **AC US4.3 + C-V11** cutover dry-run via sed + docker cp + nginx -t:
  ```bash
  # Step 1:sed 刪除 marker block 產出 cutover-version
  sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' \
    deploy/front-nginx/conf.d/default.conf > /tmp/default.conf.cutover
  sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' \
    deploy/front-nginx/conf.d/default.conf.prod > /tmp/default.conf.prod.cutover
  
  # Step 2:diff 看刪除範圍
  diff deploy/front-nginx/conf.d/default.conf /tmp/default.conf.cutover | head -30
  
  # Step 3:docker cp swap default.conf + nginx -t 驗
  docker cp /tmp/default.conf.cutover rev1-admin-front-nginx-1:/etc/nginx/conf.d/default.conf
  docker compose exec -T front-nginx nginx -t
  CUTOVER_EXIT=$?
  
  # Step 4:還原
  docker cp deploy/front-nginx/conf.d/default.conf rev1-admin-front-nginx-1:/etc/nginx/conf.d/default.conf
  docker compose exec -T front-nginx nginx -t
  echo "Cutover exit: $CUTOVER_EXIT (expect 0)"
  ```
  預期 cutover exit 0(證 F14 cutover 機械刪除路徑乾淨、不會 break nginx)

**Checkpoint**:US4 完成 — W-FA2 加 nginx routing 後 base-web/rust-api/nestjs fork 三邊零改動驗、F6 login 仍 PASS、marker block sed 機械刪除 + nginx -t 驗證 F14 cutover dry-run 通過。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc(CLAUDE.md + INTEGRATION-CHECKLIST.md)反映 W-FA2 落地。

- [ ] T070 改 `CLAUDE.md` §5.2.1 加 track-a refreshToken curl 範例(per data-model E-4 + FR-010):在第 4 個範例「DESIGN-A 路線 dev」(W-FA1 加的)之後加 ~7 行:
  ```bash
  # === DESIGN-A 路線 refreshToken 驗(W-FA2 落地後、需先 --profile track-a 啟 stack)===
  curl -X POST -H "Content-Type: application/json" \
    -d '{"refreshToken":"invalid-test-token"}' \
    http://127.0.0.1:11080/api/auth/refreshToken | head -c 200
  # 預期:不回 HTTP 404、回 nestjs ApiRes envelope shape
  ```

- [ ] T071 改 `docs/INTEGRATION-CHECKLIST.md`(per data-model E-5 + FR-011):
  - Current Focus 更新:Phase 改 `(W-FA1 + W-FA2 ✅、剩 W-FA3)` + Active feature 改「無(W-FA2 全完成、merge `<sha-pending>` 已推 origin/rev1-admin-root)」+ 下一步改 `F10 → W-FA3 → application 並行 ...`
  - Phase W-7 表 W-FA2 row 改:`未啟` → ✅ 全部 + 狀態改 `**完成**(outer <sha-pending> + merge <sha-pending>、12/12 acceptance PASS)`
  - 已完成里程碑加 W-FA2 條目(對齊 W-FA1 / F6 風格、SHA placeholder)

- [ ] T072 [P] 驗 doc 改動 grep:
  ```bash
  grep -E "W-FA2|track-a|refreshToken|11082" CLAUDE.md docs/INTEGRATION-CHECKLIST.md | head -15
  ```
  預期至少 6 match(SPECKIT marker + §5.2.1 範例 + Phase W-7 表 + 已完成里程碑)

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 單段 Commit + Push wait(per CLAUDE.md §6.1 W-F* 慣例)

**Goal**:落實**單段 commit** 紀律(W-FA2 純 outer、無 worktree 動)、push 等 user 同意。

- [ ] T100 Stage outer 改動:
  ```bash
  git status --short
  # 預期:
  #   modified: deploy/front-nginx/conf.d/default.conf
  #   modified: deploy/front-nginx/conf.d/default.conf.prod
  #   modified: CLAUDE.md
  #   modified: docs/INTEGRATION-CHECKLIST.md
  #   modified: .specify/feature.json
  #   untracked: specs/015-nginx-track-a-transitional-block/
  
  git add deploy/front-nginx/conf.d/default.conf \
          deploy/front-nginx/conf.d/default.conf.prod \
          CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          specs/015-nginx-track-a-transitional-block/
  ```

- [ ] T101 單段 outer commit(per quickstart Step 7):
  ```bash
  git commit -m "$(cat <<'EOF'
  feat(deploy): W-FA2 加 nginx TRANSITIONAL marker block + refreshToken → nestjs upstream

  rev1 deploy 階段 Track DESIGN-A 三件套第二個 feature(W-FA1 後接續、F10 / F13 / F14
  之前)。把 POST /api/auth/refreshToken 補上 nginx 反代到 nestjs upstream、用 inline
  TRANSITIONAL marker block(per DESIGN-A §2.2 convention)+ variable proxy_pass +
  resolver lazy DNS 設計(default profile / DESIGN-B 退場 nginx 仍可啟動)。

  改動範圍(4 個 outer file、~52 LOC):
  - deploy/front-nginx/conf.d/default.conf:dev 80 + dev 443 兩 server block 各加
    inline TRANSITIONAL block(~9 行/block)
  - deploy/front-nginx/conf.d/default.conf.prod:prod 443 server block 加 inline
    TRANSITIONAL block(prod 80 只 redirect、不加)
  - CLAUDE.md §5.2.1:加 track-a 模式下 curl POST refreshToken 範例
  - docs/INTEGRATION-CHECKLIST.md:Phase W-7 W-FA2 row + Current Focus + 已完成里程碑

  Acceptance:US1 P1 MVP 3/3 + US2 P2 3/3 + US3 P2 3/3 + US4 P2 3/3 = 12/12 PASS;
  base-web/rust-api/nestjs fork 三邊零改動(per FR-013 + Constitution Principle IV/V
  延伸);default profile 下 nginx -t 仍 OK、refreshToken 回 502/504 不 crash
  (per FR-017 + Q2 lazy DNS 設計);F14 cutover dry-run sed + nginx -t exit 0
  (per SC-005、證 marker convention 機械刪除路徑乾淨)。

  Constitution Check 8 PASS / 15 N/A / 0 violation;DESIGN-A → DESIGN-B 遷移時
  整組刪除 3 處 marker block + 改 proxy_pass 指 rust_api 即可、無 DB / application
  改動。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] T102 Push 等 user 同意:
  - 告知 user:「W-FA2 單段 outer commit 已落、要不要 push origin 015-nginx-track-a-transitional-block?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑:
    ```bash
    git push origin 015-nginx-track-a-transitional-block
    # 視情況也 merge 回 rev1-admin-root(對齊 W-F5/W-F6/W-F7/W-FA1 模式、merge --no-ff 留 merge commit + 補 SHA 進 CHECKLIST)
    ```

**Checkpoint**:Phase 8 完成 — W-FA2 落地、單段 commit 紀律遵守、base-web/rust-api/nestjs fork 三邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational | Phase 3 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 6 + 7 + 8 | Phase 1 + 2 |
| Phase 4 US2 | Phase 6(US4.2 需 track-a re-up)+ Phase 7 | Phase 3(US2 改 stack 狀態) |
| Phase 5 US3 | Phase 7 | Phase 3(US3 prod 模式可獨立驗) |
| Phase 6 US4 | Phase 7 | Phase 3 + Phase 4(US4.2 需 track-a re-up after Phase 4 down) |
| Phase 7 Doc | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(outer 3 nginx file 改 + reload + 3 acceptance)
- US2(P2):純 acceptance + 改 stack 狀態(down + up without profile)、依賴 US1 已加 inline block
- US3(P2):純 acceptance + prod 模式驗、依賴 US1 已加 inline block
- US4(P2):純 acceptance + zero-diff + sed cutover dry-run、依賴 US1 + Phase 4 後 stack re-up

實際:**US1 = implement;US2/US3/US4 = 純驗證(US2 改 stack 狀態、US3 切 prod 模式、US4 zero-diff + cutover dry-run)**。

## Parallel Execution

### Phase 1 全可並行
T002 / T003 / T004 全並行(獨立 docker / ls 命令)

### Phase 2 全可並行
T010 / T011 / T012 / T013 全並行(獨立 grep)

### Phase 3 部分並行
- T020 / T021 同檔 default.conf、需序列(避免 conflict)
- T022 / T020 並行(不同檔 default.conf vs default.conf.prod)
- T023(reload)/ T024(nginx -t)序列
- T030 / T031 / T032 並行(獨立 curl / docker exec / git diff)

### Phase 4 序列 + 並行
T040(down + up without profile)→ T041 / T042 並行

### Phase 5 部分並行
T050 / T052 並行(獨立 docker config / curl);T051(prod 啟動)序列、改 stack 狀態

### Phase 6 序列 + 並行
T060 並行;T061(stack restart with track-a)序列;T062(sed + docker cp)序列

### Phase 7 序列 + 並行
T070 在前;T071 / T072 並行(獨立 doc edit / grep)

### Phase 8 序列
T100(stage)→ T101(commit)→ T102(push wait)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 W-FA2 nginx wire-up 完整、SPA refreshToken call 可走通 nginx → nestjs、value delivered。US2~US4 為驗證 phase、確認 graceful degradation / prod parity / zero-regression / cutover 路徑。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 W-F5/W-F6/W-F7/W-FA1 同 session 模式),不 US1-only commit。

**並行 vs 序列建議**:
- 全 ~22 task 預估時間 20-30 分鐘(主要是 docker compose up/down 切換約 2-3 分鐘/次、跑 4 次)
- Critical path:T020-T022 改動 → T023 reload → T024 nginx -t → T030-T032 US1 acceptance → T040 down+up + T041-T042 US2 acceptance → T050 prod config / T051-T052 prod acceptance → T060-T062 US4 acceptance → T070-T071 doc + T072 grep → T100-T102 commit

**故障排查**(per quickstart 故障排查段):
- nginx -t 報 `unknown directive "ipv6"`:nginx 版本太舊、確認 image = 1.27-alpine
- curl POST refreshToken 回 404:nginx 沒 reload(`nginx -s reload`)或 location 順序錯
- curl POST refreshToken 在 track-a 模式回 502:nestjs container 不健康(check W-FA1 healthcheck)
- curl POST refreshToken 在 default profile 回 500 而非 502:resolver directive 漏或寫錯
- sed 刪除後 nginx -t fail:marker comment 不在獨佔行 / pattern 不對

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3/US4] | ✓(T020-T032 [US1] / T040-T042 [US2] / T050-T052 [US3] / T060-T062 [US4]) |
| Setup / Foundational / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement` 或 `/speckit-analyze`**。
