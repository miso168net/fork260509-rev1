---
description: "Task list for F10 — refresh-token-nestjs-bridge implementation(post-Option A reset)"
---

# Tasks: F10 — refresh-token-nestjs-bridge

**Input**: Design documents from `/specs/017-refresh-token-nestjs-bridge/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F10 為 wire-up + friction 紀錄 feature(post-Option A reset)、tests = `curl` HTTP + `psql` DB + `docker compose logs` grep + `git diff` 等 host-side bash command
- 無 unit test / integration test code(F10 不動 rust / nestjs source)
- **Acceptance**:per spec US1 P1 3 + US2 P2 1 + US3 P2 1 = 5 個 scenario(對齊 7 個 C-V)

**Organization**:F10 為 3 user story feature(reset 後)、Setup(2)+ Foundational(1)+ US1 impl + acceptance(4)+ US2 acceptance(1)+ US3 doc(2)+ Zero-regression(2)+ Polish/單段 commit(2)= **14 task**。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(F10 純 outer feature、無 worktree 動)

## Path Conventions

- **Outer(動)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F10 row + Active feature + 已完成里程碑)
  - 改:`CLAUDE.md` §10 active feature(SOP hook 自動 OR 手動)
  - 改(spec-kit 機制):`.specify/feature.json`(/speckit-specify 已自動更新)
- **Worktree**:**全程不動**(per FR-008 post-Option A + FR-014 + Constitution Principle IV/V)
  - `base-web/` / `rust-api/` / `fork260509-soybean-admin-nestjs/` 都不動
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` 等 host-side bash)
- **Image / artifact**:F10 用 W-FA1 stack 既有 nestjs image(無新 build)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `017-refresh-token-nestjs-bridge`,執行 `git branch --show-current && git status --short`(預期 branch=017-refresh-token-nestjs-bridge、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified;**base-web / rust-api / nestjs fork 全程不該 modified**)
- [ ] T002 [P] 確認 W-FA1 stack 可起 + nestjs image 已 build,執行 `docker images nestjs:rev1-admin-nestjs -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -5`(預期 image SHA 非空、compose config 無 error;若 image 缺 → `bash deploy/build-nestjs.sh` 先 build)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:起 W-FA1 stack(track-a profile)為 F10 acceptance 環境。

- [ ] T010 起 7 service stack 並 wait 健康:`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 service healthy + migration exited 0;若任一 fail → 回 W-FA1 SOP 故障排查、F10 暫停)

---

## Phase 3: User Story 1 — wire-up + friction surface(Priority: P1)🎯 MVP

**Goal**:跑 rust login 拿 refresh_token → 跑 nestjs refreshToken endpoint → 預期 friction surface(per R-7/R-8)→ 紀錄 friction 落點。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 跑 refreshToken endpoint → 預期 HTTP 非 200 + nestjs container log 含 R-7/R-8 friction 訊息。

### US1 acceptance(對齊 contracts/verification-commands.md C-V1~C-V3)

- [ ] T020 [US1] **C-V1 rust login HTTP envelope**:執行
  ```bash
  LOGIN_RESPONSE=$(curl -fsS -X POST \
    -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' \
    http://127.0.0.1:11080/api/auth/login)
  echo "$LOGIN_RESPONSE" | head -c 400
  ```
  預期:HTTP 200(`-f` 保 non-2xx fail)、body 含 `"code":"0000"` + `"data":{"token":"...", "refreshToken":"..."}`(per US1.1 / SC-001 / FR-001)

- [ ] T021 [US1] **C-V2 取 refresh_token + curl refreshToken(預期 friction)**:
  ```bash
  REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.refreshToken')
  echo "refresh_token: $REFRESH_TOKEN (length: ${#REFRESH_TOKEN})"
  # 預期 length=26、Ulid 字串(R-8 evidence)

  curl -s -w "\n---HTTP %{http_code}\n" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
    http://127.0.0.1:11080/api/auth/refreshToken
  ```
  預期:HTTP **非 200**(預期 401 / 4xx / 500、friction surface 點)+ length=26 確認 R-8 evidence(per US1.2 / SC-002)

- [ ] T022 [US1] [P] **C-V3 nestjs log grep friction 落點**:
  ```bash
  docker compose logs nestjs --tail=50 2>&1 | grep -iE "jwt|token|refresh|JsonWebToken|NotFoundException|malformed" | head -20
  ```
  預期:log 含 `JsonWebTokenError: jwt malformed`(R-8 evidence)、OR 含 `'Token has already been used.'`(R-7 evidence、若 R-8 已修);**紀錄 grep 結果**到 `quickstart.md` 故障排查段(per US1.3 / SC-002 / SC-003 / FR-001)

**Checkpoint**:US1 完成 — friction surface 點紀錄、R-7/R-8 evidence 落地。

---

## Phase 4: User Story 2 — rust login 寫 sys_tokens self-consistent 驗(Priority: P2)

**Goal**:psql 查 sys_tokens 確認 rust login 寫入正確、status = `"ACTIVE"`(R-7 evidence 源頭)。

**Independent Test**:US1.1 完成後查 sys_tokens 表、對 rust TokenStatus::Active 期望值對齊。

### US2 acceptance(對齊 C-V4)

- [ ] T030 [US2] **C-V4 psql sys_tokens 確認 rust 寫入**:
  ```bash
  DB_PASSWORD=$(cat deploy/secrets/postgres_password.txt 2>/dev/null || echo "postgres")
  PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust \
    -c "SELECT id, status, refresh_token, created_at FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"
  ```
  預期:1 row、status = `"ACTIVE"`(SCREAMING_SNAKE_CASE、R-7 evidence)、refresh_token 為 Ulid 字串 26 char(R-8 evidence)(per US2.1 / SC-004 / FR-002 / FR-013)

**Checkpoint**:US2 完成 — rust login 寫入 sys_tokens 正確、R-7/R-8 evidence 雙重確認。

---

## Phase 5: User Story 3 — F10.1 / F10.2 follow-up 範疇定義(Priority: P2)

**Goal**:`quickstart.md` 故障排查段 + `INTEGRATION-CHECKLIST.md` F10 row 明確列 F10.1 / F10.2 follow-up 範疇 + 預估改動處數 + 解鎖條件。

**Independent Test**:grep 結果含 F10.1 / F10.2 引用、範疇定義完整。

### US3 documentation tasks

- [ ] T040 [US3] 在 `specs/017-refresh-token-nestjs-bridge/quickstart.md` 故障排查段填入 T022 grep 結果(實際 log lines、用 `[F10 friction R-7/R-8]` prefix 標記):
  - 已 pre-written F10.1 / F10.2 範疇定義段(可能小幅調整)
  - friction 段補實際 log line(取 T022 grep 結果)
- [ ] T041 [US3] [P] **C-V5 doc grep verify**:
  ```bash
  grep -E "F10\.1|F10\.2|rust-jwt-refresh-token-signing|rust-tokenstatus-string-align" \
    specs/017-refresh-token-nestjs-bridge/quickstart.md docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:quickstart.md 故障排查段含 F10.1 / F10.2 範疇定義、INTEGRATION-CHECKLIST.md F10 row 列 F10.1 / F10.2 outbound dependency(per US3 / SC-005 / FR-002b / FR-018)

**Checkpoint**:US3 完成 — F10.1 / F10.2 follow-up 範疇定義就位、後續 brainstorm 階段有 ground。

---

## Phase 6: Zero-regression(對齊 W-F* / W-FA* 標配)

**Goal**:三邊源零改動 + W-FA1 stack 仍健康。

### Zero-regression verification

- [ ] T050 [P] **C-V6 three sides zero diff**:
  ```bash
  git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/ | wc -l
  echo "(預期 0)"
  ```
  預期:輸出 `0`(per FR-003 + FR-008 post-Option A + FR-014 / SC-007 / SC-008)

- [ ] T051 [P] **W-FA1 stack regression**:
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期:6 service healthy + migration exited 0(stack 整體不退化、F10 acceptance 過程不破壞 W-FA1 baseline)

**Checkpoint**:Phase 6 完成 — three sides 零改動驗 + W-FA1 stack regression PASS。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc 反映 F10 落地。

- [ ] T060 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-018):
  - Current Focus 三段更新(Active feature 改無 / 下一步改 F10.1 + F10.2 follow-up + F11/F12 並行)
  - 加 application Phase 4 Roadmap 表 含 F10 row「完成」(`outer <sha-pending>`、5/5 acceptance PASS)+ F10.1 / F10.2 row「未啟」+ F11 row「未啟」+ F12 row「未啟」
  - 已完成里程碑加 F10 條目(對齊 W-FA*/F6 風格、SHA placeholder)
  - 列 F10.1 / F10.2 為 next-step、application Phase 4 後續

- [ ] T061 [P] **doc grep verify**:
  ```bash
  grep -cE "F10\b|refresh-token-nestjs-bridge" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F10" docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:≥ 6 match、CLAUDE.md SPECKIT marker + INTEGRATION-CHECKLIST.md 多處 F10 + F10.1 + F10.2 引用

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 單段 Commit + Push wait(per CLAUDE.md §6.1 W-F*/W-FA* 慣例)

**Goal**:落實**單段 commit** 紀律(F10 post-Option A 純 outer、無 worktree 動)、push 等 user 同意。

- [ ] T100 Stage outer 改動 + 單段 commit(per quickstart Step):
  ```bash
  git status --short
  # 預期:
  #   modified: CLAUDE.md
  #   modified: docs/INTEGRATION-CHECKLIST.md
  #   modified: .specify/feature.json
  #   untracked: specs/017-refresh-token-nestjs-bridge/

  git add CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          specs/017-refresh-token-nestjs-bridge/

  git commit -m "$(cat <<'EOF'
  feat(spec): F10 refresh-token-nestjs-bridge wire-up baseline + R-7/R-8 surface

  rev1 application Phase 4 第一個 feature(W-FA1/W-FA2/W-FA3 三件套 deploy 結構
  完整後接續、F10.1/F10.2/F11/F12/F13 之前)。post-Option A scope reset = wire-up
  + friction 紀錄 feature(0 rust patch、acceptance 改 expected fail at friction
  第一發生點 + 紀錄 friction 落點),rust patch 工作拆 F10.1 rust-jwt-refresh-
  token-signing + F10.2 rust-tokenstatus-string-align 兩 follow-up。

  改動範圍(outer 純文件、0 worktree、0 source):
  - specs/017-refresh-token-nestjs-bridge/{spec, plan, research, data-model,
    quickstart, contracts/verification-commands, checklists/requirements, tasks}.md 新建
  - CLAUDE.md SPECKIT marker 更新(Active feature 改 F10)
  - docs/INTEGRATION-CHECKLIST.md F10 row + Application Phase 4 roadmap +
    Current Focus + 已完成里程碑
  - .specify/feature.json 指向 specs/017-refresh-token-nestjs-bridge

  Phase 0 Research 重大 finding(R-7 + R-8):
  - R-7: rust TokenStatus 序列化 SCREAMING_SNAKE_CASE("ACTIVE"/"REFRESHED"/
    "REVOKED")vs nestjs TokenStatus lowercase("unused"/"used")完全不對齊
  - R-8: rust 簽 refresh_token 用 Ulid 字串(明文)vs nestjs jwtService.verifyAsync
    期 JWT(三段、含 exp claims)
  - 加總:5-9 處 rust patch 超 brainstorm Q3 1-3 上限、觸發 R-4 abort path

  brainstorm 5 顯式拍板 Q + plan Option A 拍板:
  - Q1 範疇(end-to-end + audit MVP)
  - Q2 audit(不動 nestjs source、不驗 audit、留 F13)
  - Q3 rust source(原 1-3 處、reset 為 0)
  - Q4 acceptance 深度(HTTP + DB)
  - Q5 friction in nestjs side(rust 遷就 nestjs)
  - Plan Option A: F10 wire-up only、F10.1+F10.2 拆 follow-up

  Acceptance:US1 P1 3/3(login PASS / refreshToken expected fail with friction
  surface / nestjs log grep R-7 R-8 evidence)+ US2 P2 1/1(psql sys_tokens
  status="ACTIVE" R-7 source)+ US3 P2 1/1(quickstart + INTEGRATION-CHECKLIST
  含 F10.1/F10.2 範疇)= 5/5 PASS;
  base-web/rust-api/nestjs fork 三邊零改動(per FR-008 post-Option A + FR-014);
  W-FA1 stack 7 service expected state 維持;單段 outer commit。

  Constitution Check 17 PASS / 4 N/A / 0 violation(F10 reset 強化 Principle
  IV/V);DESIGN-A → DESIGN-B 遷移路徑透過 F10.1 + F10.2 + F11 + F13 + F14 完成。
  解鎖 F10.1 rust-jwt-refresh-token-signing + F10.2 rust-tokenstatus-string-
  align follow-up,Application Phase 4 起點。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] T101 **C-V7 single-commit verify**:
  ```bash
  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```
  預期:last commit 為 F10 主要落地 commit、diff stat 顯示 outer file 改動(無 worktree gitlink SHA 變動)

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F10 單段 outer commit 已落、要不要 push origin 017-refresh-token-nestjs-bridge?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑:
    ```bash
    git push origin 017-refresh-token-nestjs-bridge
    # 視情況也 merge --no-ff 回 rev1-admin-root + follow-up docs(checklist) 填 SHA
    ```

**Checkpoint**:Phase 8 完成 — F10 落地、單段 commit 紀律遵守、application Phase 4 第一個 feature 就位、F10.1 / F10.2 follow-up 範疇明確、base-web/rust-api/nestjs fork 三邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational | Phase 3 + 4 + 6 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 7 + 8 | Phase 1 + 2 |
| Phase 4 US2 | Phase 7 | Phase 3(psql 接 login 寫入) |
| Phase 5 US3 | Phase 7 | Phase 3(quickstart 補 T022 grep 結果) |
| Phase 6 Zero-regression | Phase 7 | Phase 1 + 2(stack 起後驗 zero diff)|
| Phase 7 Doc | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(curl 3 個 endpoint + log grep)
- US2(P2):純 acceptance、依賴 US1 stack 起 + login 完成
- US3(P2):純 doc 補 + grep verify、依賴 US1/T022 grep 結果

實際:**US1 = wire-up + friction surface;US2/US3 = acceptance + doc**。

## Parallel Execution

### Phase 1 部分並行
T001 序列(branch + status 確認)、T002 並行

### Phase 2 序列
T010(stack up)序列、blocking Phase 3+

### Phase 3 部分並行
- T020 序列(login 拿 refresh_token)
- T021 序列(接 T020 拿 refresh_token、curl refreshToken)
- T022 [P](接 T021 後跑 log grep)

### Phase 4 序列
T030(psql)序列、接 T020 後跑

### Phase 5 部分並行
- T040 序列(填 quickstart、接 T022 grep)
- T041 [P](grep verify、接 T040 後跑)

### Phase 6 全可並行
T050 / T051 全並行(獨立 git diff / docker compose ps)

### Phase 7 序列 + 並行
T060 序列(改 INTEGRATION-CHECKLIST.md)、T061 [P](grep verify、接 T060)

### Phase 8 序列
T100(stage + commit)→ T101(verify)→ T102(push wait)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F10 wire-up + friction surface 落地、R-7/R-8 evidence 紀錄、F10.1/F10.2 follow-up 範疇可定義、value delivered。US2/US3 + Zero-regression/Doc/Commit 為驗證 + 收尾 phase。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 W-F5/W-F6/W-F7/W-FA1/W-FA2/W-FA3 同 session 模式),不 US1-only commit。

**並行 vs 序列建議**:
- 全 14 task 預估時間 5-10 分鐘(F10 純 acceptance + doc、無 build / 無 source 改動)
- Critical path:T001/T002 → T010 stack up → T020 login → T021 refreshToken(expected fail)→ T022 log grep → T030 psql → T040 quickstart 補 → T041 grep verify → T050/T051 zero-regression → T060 INTEGRATION-CHECKLIST → T061 grep verify → T100/T101/T102 commit

**故障排查**(per quickstart 故障排查段):
- T020 login fail:stack 未起完整 / F5.1 既有 bug / DB 連線 → 回 W-FA1 SOP
- T021 預期 fail 變 HTTP 200:nestjs source 改了(違反 OOS-001、F10 abort);或 W-FA2 nginx routing 退化(回 W-FA2 SOP)
- T022 grep 無 friction log:可能 nestjs 已 silent error(屬 W-FA1 healthcheck 應 surface)或 log level 設過高;檢 `docker compose logs nestjs --tail=200`
- T030 psql 連 fail:postgres host port forward 退化(回 W-F7 SOP);credential 不對(per CLAUDE.md §5.1 確認 dev pwd)
- T050 git diff > 0:檢哪邊改動 / 是否意外 stage worktree、abort F10 + 改正

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T022 [US1] / T030 [US2] / T040-T041 [US3]) |
| Setup / Foundational / Zero-regression / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement` 或 `/speckit-analyze`**。
