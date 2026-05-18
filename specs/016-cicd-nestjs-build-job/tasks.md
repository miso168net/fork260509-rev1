---
description: "Task list for W-FA3 cicd-nestjs-build-job implementation"
---

# Tasks: W-FA3 — cicd-nestjs-build-job

**Input**: Design documents from `/specs/016-cicd-nestjs-build-job/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/script-contract.md`](contracts/script-contract.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- W-FA3 為 deploy-track feature、tests = `bash -n` syntax check + `bash deploy/build-nestjs.sh` execution + `docker compose exec / ps` + `git diff` acceptance scenarios(per verification-commands.md C-V1~C-V12)
- 無 unit test / integration test code(不涉 application source code)
- **Acceptance**:per spec US1 P1 MVP 3 + US2 P2 1 + US3 P3 2 + US4 P2 2 = 8 個 scenario

**Organization**:W-FA3 為 4 user story feature。Setup(3)+ Foundational(2)+ US1 impl + acceptance(7)+ US2 acceptance(1)+ US3 acceptance(2)+ US4 acceptance(3)+ Doc(3)+ Polish/單段 commit(2)= ~21 task。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 / US4 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`(W-FA3 純 outer feature、無 worktree 動)

## Path Conventions

- **Outer(動)**:
  - 新建:`deploy/build-nestjs.sh`
  - 改:`CLAUDE.md` / `docs/INTEGRATION-CHECKLIST.md`
  - 改(spec-kit 機制):`.specify/feature.json`(/speckit-specify 自動更新)
- **Worktree**:**全程不動**(per FR-013 + Constitution Principle IV/V)
  - `base-web/` / `rust-api/` / `fork260509-soybean-admin-nestjs/` 都不動
- **Acceptance test 執行**:outer repo root(`bash` / `docker` / `git diff` / `wc -l` / `grep`)
- **Image build**:W-FA3 跑 script 是 build automation,build 出來的 image = `nestjs:rev1-admin-nestjs:<tag>`(對齊 W-FA1 既有 tag pattern、不是新 image artifact)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `016-cicd-nestjs-build-job`,執行 `git branch --show-current && git status --short`(預期 branch=016-cicd-nestjs-build-job、可有 spec docs untracked / `.specify/feature.json` 與 `CLAUDE.md` modified;**base-web / rust-api / nestjs fork 全程不該 modified**)
- [ ] T002 [P] 確認 W-FA1 既有 nestjs Dockerfile + fork repo 結構就位(W-FA3 build target),執行 `ls fork260509-soybean-admin-nestjs/backend/Dockerfile fork260509-soybean-admin-nestjs/backend/package.json 2>&1`(預期兩檔存在;若無、operator 補拉 fork repo)
- [ ] T003 [P] 確認 docker daemon 啟動 + BuildKit 可用,執行 `docker version --format '{{.Server.Version}}' 2>&1`(預期 docker 24+;若 daemon 未啟、`sudo service docker start` 或 Docker Desktop 啟動)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:grep 既有 W-F6 script 風格 + W-FA1 build cmd reference + W-FA1 落定 image 確認 baseline。

- [ ] T010 [P] grep 既有 `deploy/generate-dev-cert.sh`(W-F6 落地 shell script 風格參考),執行 `cat deploy/generate-dev-cert.sh | head -30`(預期看到 ~25 行 bash + shebang + set -euo pipefail + minimal arg parsing 慣例)
- [ ] T011 [P] grep `CLAUDE.md` §5.2.1 line 165-181「DESIGN-A 路線 dev」段(W-FA3 改動目標),執行 `sed -n '165,183p' CLAUDE.md`(預期看到 W-FA1 加的 inline build cmd 6 行 + 啟 stack cmd)

---

## Phase 3: User Story 1 — operator 跑 build script 一次性 build nestjs image(Priority: P1)🎯 MVP

**Goal**:完成 W-FA3 唯一 implementation-bearing scenario — `deploy/build-nestjs.sh` 新建 + chmod + syntax check + cold build + image 落地 + size feedback。

**Independent Test**:刪 `nestjs:rev1-admin-nestjs` image 後跑 `bash deploy/build-nestjs.sh` → image 落地 + size 印出 + exit 0,W-FA1 stack 起得來 7 service healthy。

### Script implementation(outer、1 個新 file)

- [ ] T020 [US1] 新建 `deploy/build-nestjs.sh`(per data-model E-1 + C-S1~C-S8 全 contract):~28 行 bash script、含:
  ```bash
  #!/usr/bin/env bash
  # W-FA3 — nestjs image build script(Track DESIGN-A transitional、F14 cutover 整支刪)
  # 對齊 W-FA1 quickstart Step 1 inline cmd、自動化 build cmd + NODE_VERSION + tag 處理
  set -euo pipefail

  TAG=latest

  usage() {
    cat <<EOF
  Usage: bash deploy/build-nestjs.sh [--tag <name>] [--help]
    --tag <name>, -t <name>   Image tag (default: latest)
    --help, -h                Show this help
  Build context: fork260509-soybean-admin-nestjs/backend/
  Image:         nestjs:rev1-admin-nestjs:<tag>
  NODE_VERSION:  22.11.0 (built-in、per W-FA1 implement-time A-002)
  EOF
  }

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag|-t)
        [[ -n "${2:-}" ]] || { echo "[W-FA3 ERROR] --tag requires a value" >&2; exit 1; }
        TAG="$2"; shift 2 ;;
      --help|-h)
        usage; exit 0 ;;
      *)
        echo "[W-FA3 ERROR] unknown arg: $1" >&2; usage >&2; exit 1 ;;
    esac
  done

  DOCKER_BUILDKIT=1 docker build \
    --build-arg NODE_VERSION=22.11.0 \
    -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
    -t "nestjs:rev1-admin-nestjs:${TAG}" \
    fork260509-soybean-admin-nestjs/backend/

  docker images "nestjs:rev1-admin-nestjs:${TAG}" \
    --format "[W-FA3] Built {{.Repository}}:{{.Tag}} ({{.Size}})"
  ```

- [ ] T021 [US1] `chmod +x deploy/build-nestjs.sh`(per FR-006、對齊 `generate-dev-cert.sh` 755 mode),執行 `chmod +x deploy/build-nestjs.sh && ls -la deploy/build-nestjs.sh`(預期 `-rwxr-xr-x` 或對應 755 mode)

### Script syntax + help + error 快驗(無 docker、~1 秒)

- [ ] T022 [US1] [P] **C-V1 syntax check**:`bash -n deploy/build-nestjs.sh; echo "exit: $?"`(預期 exit 0、stderr 空)
- [ ] T023 [US1] [P] **C-V2 help verify + NFR-002 wrapper overhead**:
  ```bash
  time bash deploy/build-nestjs.sh --help
  echo "exit: $?"
  ```
  預期 exit 0、stdout 含 5 行 usage、stderr 空、real time ≤ 1s(per NFR-002 wrapper overhead;`--help` 不觸 docker build、純測 bash parsing + cat overhead)
- [ ] T024 [US1] [P] **C-V3 missing-value error**:`bash deploy/build-nestjs.sh --tag; echo "exit: $?"`(預期 exit 1、stderr 含 `[W-FA3 ERROR] --tag requires a value`)

### US1 acceptance(cold build US1 P1 MVP、~3-5 分鐘)

- [ ] T030 [US1] **AC US1.1 + C-V4** cold build:
  ```bash
  docker rmi nestjs:rev1-admin-nestjs 2>/dev/null || true
  time bash deploy/build-nestjs.sh
  ```
  預期 cold ~3-5 min、exit 0、stdout 最後 1 行符合 `[W-FA3] Built nestjs:rev1-admin-nestjs:latest (870MB)` pattern

- [ ] T031 [US1] [P] **AC US1.2 + C-V4** image 存在 + size baseline 對齊:
  ```bash
  docker images nestjs:rev1-admin-nestjs -q
  docker images nestjs:rev1-admin-nestjs --format "{{.Repository}}:{{.Tag}} {{.Size}}"
  ```
  預期 image SHA 非空、size ~870MB(對齊 W-FA1 baseline)

- [ ] T032 [US1] [P] **AC US1.3 + C-V7** W-FA1 stack 用 W-FA3 image 起 7 service healthy:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 7 service healthy(對齊 W-FA1 baseline、證 W-FA3 build artifact 與 W-FA1 inline cmd 等義)

**Checkpoint**:US1 完成 — W-FA3 script 落地、syntax/help/error 全綠、cold build 走通、image 落地 size baseline 對齊、W-FA1 stack 7 service healthy。

---

## Phase 4: User Story 2 — Script 第二次跑走 docker cache(Priority: P2)

**Goal**:驗 idempotent + docker BuildKit layer cache 機制。

**Independent Test**:接 US1 後再跑一次 script、real time < 30s + `CACHED` keyword 多 step。

### US2 acceptance

- [ ] T040 [US2] **AC US2 + C-V5** idempotent + cache hit:
  ```bash
  time bash deploy/build-nestjs.sh 2>&1 | tee /tmp/build-nestjs-run2.log
  grep -c "CACHED" /tmp/build-nestjs-run2.log
  ```
  預期 `real` time < 30s、`CACHED` keyword 多 step 命中(grep count >= 5)、stdout 最後 1 行 image size feedback 對齊

**Checkpoint**:US2 完成 — script idempotent + BuildKit cache 走通。

---

## Phase 5: User Story 3 — Custom tag override(Priority: P3)

**Goal**:驗 `--tag <name>` flag 改 image tag、預設 `latest` 不受影響。

**Independent Test**:`bash deploy/build-nestjs.sh --tag rev1-test` → `:rev1-test` image 落地、`:latest` 不變。

### US3 acceptance

- [ ] T050 [US3] **AC US3.1 + C-V6** custom tag override:
  ```bash
  bash deploy/build-nestjs.sh --tag rev1-test 2>&1 | tail -3
  docker images nestjs:rev1-admin-nestjs:rev1-test -q
  ```
  預期 script exit 0、stdout 最後 1 行符合 `[W-FA3] Built nestjs:rev1-admin-nestjs:rev1-test (<size>)`;`:rev1-test` image SHA 非空

- [ ] T051 [US3] [P] **AC US3.2 + C-V6** `:latest` tag 不受影響:
  ```bash
  docker images nestjs:rev1-admin-nestjs:latest -q
  ```
  預期 `:latest` image SHA 仍為 US1 cold build 的版本(per C-S8 idempotency)

**Checkpoint**:US3 完成 — `--tag` override 機制驗證、`:latest` 不被誤動。

---

## Phase 6: User Story 4 — Zero-regression + 三邊源零改動(Priority: P2)

**Goal**:W-F* / W-FA* 標配零回歸 + 三邊源零改動 + W-FA2 refreshToken endpoint regression。

**Independent Test**:`git diff` 三邊路徑無輸出 + W-FA2 refreshToken curl 仍走通。

### US4 acceptance

- [ ] T060 [US4] [P] **AC US4.1 + C-V9** three sides zero diff:
  ```bash
  git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/ | wc -l
  ```
  預期輸出 `0`(per FR-013 三邊零改動;**特別含 `fork260509-soybean-admin-nestjs/` 內 `.github/` 也零改動、per Q2 + FR-014**)

- [ ] T061 [US4] **AC US4.2 + C-V8** W-FA2 refreshToken endpoint regression(US1/T032 stack 已啟):
  ```bash
  curl -s -w "\n---HTTP %{http_code}\n" -X POST \
    -H "Content-Type: application/json" \
    -d '{"refreshToken":"invalid-test-token"}' \
    http://127.0.0.1:11080/api/auth/refreshToken | head -c 400
  ```
  預期 HTTP 4xx + nestjs envelope(具體 status code 視 nestjs business、對齊 W-FA2 落地 nginx → nestjs routing)

- [ ] T062 [US4] [P] **C-V10 LOC ≤ 30 (NFR-001 + SC-007)**:
  ```bash
  wc -l deploy/build-nestjs.sh
  ```
  預期行數 ≤ 30

**Checkpoint**:US4 完成 — three sides 零改動驗 + W-FA2 refreshToken regression PASS + LOC 符合 NFR-001。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc(CLAUDE.md + INTEGRATION-CHECKLIST.md)反映 W-FA3 落地。

- [ ] T070 改 `CLAUDE.md` §5.2.1 line 167-172(per data-model E-2 + FR-008):把 W-FA1 加的 inline build cmd(6 行)換成 1 行 `bash deploy/build-nestjs.sh` + 保 NODE_VERSION reference comment(~3 行)
- [ ] T071 改 `docs/INTEGRATION-CHECKLIST.md`(per data-model E-3 + FR-009):
  - Current Focus 三段更新(Phase 改三件套全完成、Active feature 改無、下一步改 F10 為主)
  - Phase W-7 表 W-FA3 row 改 `未啟` → ✅ 全部 + 狀態改 `**完成**(outer <sha-pending> + merge <sha-pending>、8/8 acceptance PASS)`
  - 已完成里程碑加 W-FA3 條目(對齊 W-FA1 / W-FA2 / F6 風格、SHA placeholder)
- [ ] T072 [P] **C-V11 doc grep verify**:
  ```bash
  grep -cE "W-FA3|build-nestjs\.sh" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep -A 2 "DESIGN-A 路線 dev" CLAUDE.md | head -10
  grep "W-FA3" docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期 ≥ 6 match、CLAUDE.md §5.2.1 內 inline cmd 替換成 `bash deploy/build-nestjs.sh`、INTEGRATION-CHECKLIST.md W-FA3 row 顯示「完成」

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 單段 Commit + Push wait(per CLAUDE.md §6.1 W-F* / W-FA* 慣例)

**Goal**:落實**單段 commit** 紀律(W-FA3 純 outer、無 worktree 動)、push 等 user 同意。

- [ ] T100 Stage outer 改動 + 單段 commit(per quickstart Step 10):
  ```bash
  git status --short
  # 預期:
  #   modified: CLAUDE.md
  #   modified: docs/INTEGRATION-CHECKLIST.md
  #   modified: .specify/feature.json
  #   untracked: deploy/build-nestjs.sh
  #   untracked: specs/016-cicd-nestjs-build-job/

  git add deploy/build-nestjs.sh \
          CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          specs/016-cicd-nestjs-build-job/

  git commit -m "$(cat <<'EOF'
  feat(deploy): W-FA3 加 nestjs image build script + Track DESIGN-A 三件套收尾

  rev1 deploy 階段 Track DESIGN-A 三件套第三個也是最後一個 feature(W-FA1 + W-FA2
  後接續、Track DESIGN-A deploy 結構收尾、F10/F13/F14 之前)。把 W-FA1 落地的
  nestjs image build cmd 抽象成 local shell script deploy/build-nestjs.sh、
  自動化 build cmd + NODE_VERSION build-arg 內建 + --tag <name> 選項 + 結尾印
  image size feedback。

  改動範圍(3 個 outer file、~50 LOC):
  - deploy/build-nestjs.sh:新建 ~28 行 bash script(shebang + set -euo pipefail
    + tag parsing + --help + docker build + image size feedback、mode 755)
  - CLAUDE.md §5.2.1:把 inline build cmd(line 167-172)換成
    bash deploy/build-nestjs.sh
  - docs/INTEGRATION-CHECKLIST.md:Phase W-7 W-FA3 row + Current Focus + 已完成里程碑

  設計拍板(brainstorm 3 顯式 Q + 5 自然推論、見 docs/superpowers/013):
  - Q1 模式:Local docker build script(無 CI/CD 平台、不 push registry)
  - Q2 nestjs fork 零改動:不放 workflow yaml,且 nestjs fork repo 完全零改動
  - Q3 image size 優化:不納入、留 backlog(YAGNI)
  - 5 自然推論:script 路徑 deploy/build-nestjs.sh + image tag 預設 latest +
    NODE_VERSION=22.11.0 內建(per W-FA1 implement-time)+ script 不主動驗
    prereq + 結尾印 image size

  Acceptance:US1 P1 MVP 3/3 + US2 P2 1/1 + US3 P3 2/2 + US4 P2 2/2 = 8/8 PASS;
  base-web/rust-api/nestjs fork 三邊零改動(per FR-013 + Constitution Principle
  IV/V 延伸);W-FA1 stack 7 service healthy(per US1.3 / US4.2);W-FA2
  refreshToken endpoint 仍走通(per US4.2);LOC = ~28 行(per NFR-001、SC-007);
  docker cache hit 第二次跑 < 30s(per SC-003)。

  Constitution Check 6 PASS / 17 N/A / 0 violation;DESIGN-A → DESIGN-B 遷移
  時整支刪除 `rm deploy/build-nestjs.sh` + 改回 CLAUDE.md §5.2.1 即可、無 DB /
  application 改動。Track DESIGN-A 三件套(W-FA1/W-FA2/W-FA3)deploy 結構
  wire-up 完整、下一步 F10 refresh-token-nestjs-bridge。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] T101 **C-V12 single-commit verify**:
  ```bash
  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```
  預期 last commit 為 W-FA3 主要落地 commit、diff stat 顯示 outer file 改動(無 worktree gitlink SHA 變動)

- [ ] T102 Push 等 user 同意:
  - 告知 user:「W-FA3 單段 outer commit 已落、要不要 push origin 016-cicd-nestjs-build-job?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑:
    ```bash
    git push origin 016-cicd-nestjs-build-job
    # 視情況也 merge --no-ff 回 rev1-admin-root + follow-up docs(checklist) 填 SHA
    ```

**Checkpoint**:Phase 8 完成 — W-FA3 落地、單段 commit 紀律遵守、Track DESIGN-A 三件套全完成、base-web/rust-api/nestjs fork 三邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational | Phase 3 + 7 | Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 6 + 7 + 8 | Phase 1 + 2 |
| Phase 4 US2 | Phase 7 | Phase 3(idempotent 接 US1 cold build) |
| Phase 5 US3 | Phase 7 | Phase 3(tag override 接 US1 image baseline) |
| Phase 6 US4 | Phase 7 | Phase 3(US4.2 需 US1/T032 stack 已啟) |
| Phase 7 Doc | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(outer 1 個新 script + chmod + cold build + W-FA1 stack regression)
- US2(P2):純 acceptance + idempotent 驗、依賴 US1 已 build image
- US3(P3):純 acceptance + tag override 驗、依賴 US1 已 build image baseline
- US4(P2):純 acceptance + zero-diff + W-FA2 refreshToken regression + LOC、依賴 US1/T032 stack 已啟

實際:**US1 = implement;US2/US3/US4 = 純驗證**。

## Parallel Execution

### Phase 1 全可並行
T002 / T003 全並行(獨立 ls / docker version)

### Phase 2 全可並行
T010 / T011 全並行(獨立 grep)

### Phase 3 部分並行
- T020 / T021 序列(寫完 script 才能 chmod)
- T022 / T023 / T024 全並行(獨立 bash 命令、且都是 dry-run 無 docker)
- T030 序列(cold build、改 docker state)
- T031 / T032 部分並行(T031 是查 image、T032 是 stack up;T032 需 T030 完成才有 image、然後 T031 / T032 可並行驗)

### Phase 4 序列
T040(idempotent build)序列、接 T030 後跑

### Phase 5 序列 + 並行
T050(tag override build)序列 → T051(查 latest)並行

### Phase 6 部分並行
T060 / T062 並行(獨立 git diff / wc);T061 序列(curl 接 T030/T032 stack)

### Phase 7 序列 + 並行
T070 / T071 並行(獨立 doc edit);T072(grep)序列、接 T070/T071 後跑

### Phase 8 序列
T100(stage + commit)→ T101(verify)→ T102(push wait)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 W-FA3 wire-up 完整、operator 跑 `bash deploy/build-nestjs.sh` 可一次性 build nestjs image、value delivered。US2~US4 為驗證 phase、確認 idempotent / tag override / zero-regression。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 W-F5/W-F6/W-F7/W-FA1/W-FA2 同 session 模式),不 US1-only commit。

**並行 vs 序列建議**:
- 全 ~21 task 預估時間 15-20 分鐘(主要是 cold build ~3-5 min + W-FA1 stack up ~2-3 min)
- Critical path:T020 寫 script → T021 chmod → T022/T023/T024 syntax/help/error 快驗 → T030 cold build → T031/T032 image + stack 驗 → T040 idempotent → T050/T051 tag override → T060/T061/T062 zero-regression → T070/T071/T072 doc → T100/T101/T102 commit

**故障排查**(per quickstart 故障排查段):
- `bash deploy/build-nestjs.sh` 報 `permission denied`:沒 chmod、跑 T021
- 跑時報 `unable to prepare context`:fork dir 不存在、補拉 fork(per A-002)
- Image size = 0 但 script exit 0:`set -e` 未 propagate、檢 script 是否漏 `set -euo pipefail`(per FR-001)
- `--tag rev1-test` 後 `latest` 被改:理解錯 docker `-t` 行為(per C-S8、不會發生)
- Second run > 30s 不走 cache:fork backend/ 改過、BuildKit cache invalidated(預期)
- `bash -n` 報 syntax error:對照 data-model E-1 樣板檢 case 語法

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3/US4] | ✓(T020-T032 [US1] / T040 [US2] / T050-T051 [US3] / T060-T062 [US4]) |
| Setup / Foundational / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-implement` 或 `/speckit-analyze`**。
