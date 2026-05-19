---
description: "Task list for F10.2 — rust-tokenstatus-string-align implementation"
---

# Tasks: F10.2 — rust-tokenstatus-string-align

**Input**: Design documents from `/specs/019-rust-tokenstatus-string-align/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F10.2 為 rust source change feature(類 F5.1/F6/F10.1 兩段式 commit)、含 1 個 rust unit test(per spec FR-017 + Q4 brainstorm SHOULD)
- Unit test 對 R-1 derive 行為提供 stack-不可見 sanity check
- **Acceptance**:per spec US1 P1 3 + US2 P2 1 + US3 P3 1 + unit test 1 + zero-regression 2 = 8 個 scenario(對齊 7 個 C-V)

**Organization**:F10.2 為 3 user story feature、Setup(2)+ Foundational(1)+ US1 impl + unit + acceptance(5)+ US2 acceptance(1)+ US3 acceptance(1)+ Zero-regression(2)+ Doc(2)+ 兩段式 Commit(3)= **17 task**(對齊 NFR-002 ≤ 15 預估、單 file enum 改 + 純 acceptance 收尾紀律)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F10.2 row + Current Focus + 已完成里程碑 + Phase 4 收尾)
  - 改:`CLAUDE.md` §10 active feature(SOP hook 已處理、`/speckit-plan` 已 update 指 019)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
- **Worktree(改、`rust-api/`、~18 LOC、單 file)**:
  - 改:`rust-api/server/constant/src/definition/consts.rs`(serialize_all + 2 per-variant override + 1 unit test 6 assert)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-006 + FR-009);rust-api 其他 file 不動(`access_token_event.rs` 等 callsite 自動跟著新 serialize 字串值)
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` 等 host-side bash)
- **Image / artifact**:F10.2 需 rebuild rust-api docker image(per Step 3、cold ~5-7 min,改 1 source file 仍觸 server crate dep tree recompile)
- **無 docker-compose.yml 改**(對比 F10.1)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `019-rust-tokenstatus-string-align` + rust-api worktree branch = `rev1-admin-rust-api`、F10 + F10.1 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F10 完成|F10\.1' | head -3 && cd rust-api && git branch --show-current && git status --short && cd ..`(預期 outer branch=019-*、rust-api branch=rev1-admin-rust-api、history 含 F10 merge `8f0e84c` + F10.1 merge `48b70e6`、rust-api worktree clean)
- [ ] T002 [P] 確認 W-FA1 stack 可起 + F10.1 baseline 仍 work、F10.2 acceptance 預期 R-7 修點對齊,執行 `docker images nestjs:rev1-admin-nestjs -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -5`(預期 image SHA 非空、compose config 無 error)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起 + F10.1 R-8 修 + R-7 friction 仍 surface(F10.2 修對象)。

- [ ] T010 起 7 service stack(若未起)、確認 F10.1 baseline 仍 work:`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0);選擇性跑 F10.1 C-V3 baseline 確認 HTTP 500 with `'Token has already been used.'`(對比 F10.2 修後 HTTP 200)

---

## Phase 3: User Story 1 — R-7 修 + refreshToken end-to-end pass(Priority: P1)🎯 MVP

**Goal**:rust `TokenStatus` enum strum serialize 改 lowercase + per-variant override 對齊 nestjs、修 R-7;落地後 refreshToken HTTP 200 + 新 token pair + nestjs log no error。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 用該 refresh_token 跑 refreshToken endpoint → 預期 HTTP **200** + body 含 `token` + `refreshToken` 新 pair(非 4xx/5xx with `'Token has already been used.'`)+ nestjs log grep `'Token has already been used'|JsonWebTokenError|jwt malformed` = 0 line。

### US1 implementation(rust source patch、~18 LOC、單 file)

- [ ] T020 [US1] 改 `rust-api/server/constant/src/definition/consts.rs`(per data-model.md §E1):
  - 改 enum-level attribute:`#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]` → `#[strum(serialize_all = "snake_case")]`(1 line)
  - 加 per-variant override 在 `Active`:`#[strum(serialize = "unused")]`(1 line + 對齊 nestjs UNUSED='unused')
  - 加 per-variant override 在 `Refreshed`:`#[strum(serialize = "used")]`(1 line + 對齊 nestjs USED='used')
  - `Revoked` 不動(走 snake_case default → "revoked"、per Q1 brainstorm 拍板)
  - `impl TokenStatus { is_valid / can_refresh }` 邏輯不動(只 match `Active` variant、與 string repr 無關)
  - 預期 ~5 LOC enum 改

- [ ] T021 [US1] **TDD red-green** unit test(per FR-017 + Q4 brainstorm SHOULD):在 `rust-api/server/constant/src/definition/consts.rs` 末尾加 `#[cfg(test)] mod tests`:
  ```rust
  #[cfg(test)]
  mod tests {
      use super::*;
      use std::str::FromStr;

      #[test]
      fn test_token_status_serialize_aligns_with_nestjs() {
          // forward: Display via strum derive(.to_string() 走 std blanket impl)
          assert_eq!(TokenStatus::Active.to_string(), "unused");
          assert_eq!(TokenStatus::Refreshed.to_string(), "used");
          assert_eq!(TokenStatus::Revoked.to_string(), "revoked");

          // reverse: EnumString from_str(per R-Q5 strum 對稱性)
          assert_eq!(TokenStatus::from_str("unused").unwrap(), TokenStatus::Active);
          assert_eq!(TokenStatus::from_str("used").unwrap(), TokenStatus::Refreshed);
          assert_eq!(TokenStatus::from_str("revoked").unwrap(), TokenStatus::Revoked);
      }
  }
  ```
  ~12 LOC、6 個 assert(3 forward + 3 reverse)
  跑 C-V1(per contracts/verification-commands.md):
  ```bash
  docker run --rm \
    -v /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api:/work \
    -v /tmp/cargo-cache-rev1/registry:/usr/local/cargo/registry \
    -v /tmp/cargo-cache-rev1/git:/usr/local/cargo/git \
    -w /work rust:1.86-slim-bookworm \
    bash -c "apt-get update -qq && apt-get install -y --no-install-recommends pkg-config libssl-dev git >/dev/null 2>&1 && cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs -- --nocapture 2>&1 | tail -15"
  ```
  預期 PASS(`1 passed; 0 failed`)。如 red → 改 enum 設計(可能改 Option B 全 per-variant override)

### US1 stack acceptance(對齊 contracts/verification-commands.md C-V2~C-V4)

- [ ] T030 [US1] Rebuild rust-api docker image(per Step 2 of quickstart):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -3
  ```
  預期 cold ~5-7 min / warm ~2-3 min(per NFR-005;若 fail → check cargo build output、可能 strum_macros 版本不相容)

- [ ] T031 [US1] 起 stack(force-recreate rust-api、其他 service 不動):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -10
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 rust-api 重啟 healthy + 其他 5 service 仍 healthy + migration init container exited 0;rust-api 不 restart loop 表 enum derive expand OK + secret_loader 仍 work

- [ ] T032 [US1] **C-V2 + C-V3 + C-V4 inline**(per contracts/verification-commands.md):
  ```bash
  LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['refreshToken'])")
  echo "C-V2: length=${#REFRESH_TOKEN}, dots=$(echo -n $REFRESH_TOKEN | tr -dc . | wc -c)"
  # C-V2 預期 length > 100 + dots == 2(F10.1 JWT format regression)

  echo "C-V3: refreshToken HTTP test"
  curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" http://127.0.0.1:11080/api/auth/refreshToken | head -c 800
  # C-V3 預期 HTTP 200 + body 含 token + refreshToken 新 pair(R-7 修)

  echo "C-V4 R-7+R-8 evidence count (應 0):"
  docker compose logs nestjs --tail=200 2>&1 | grep -cE "Token has already been used|JsonWebTokenError|jwt malformed"
  # C-V4 預期 0 line(R-7 + R-8 全清)
  ```

**Checkpoint**:US1 完成 — R-7 修確認、refreshToken end-to-end pass、F10/F10.1/F10.2 application Phase 4 整套就位。

---

## Phase 4: User Story 2 — DB 準據驗 sys_tokens state transition(Priority: P2)

**Goal**:psql 查 sys_tokens 確認 rust 寫入新 row `status='unused'`(對齊 nestjs)+ nestjs refreshToken 用過後改 `status='used'`(state transition)。

**Independent Test**:US1.1 + US1.2 完成後查 sys_tokens 表最新 2 row、驗 status 值對齊 nestjs `'unused'` / `'used'`。

### US2 acceptance(對齊 C-V5)

- [ ] T040 [US2] **C-V5 psql sys_tokens 雙 row state transition**:
  ```bash
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT status, char_length(refresh_token) AS rt_len, to_char(created_at,'HH24:MI:SS') AS created FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 2"
  ```
  預期 2 row、最新 `status='unused'`(rust 新登入寫入、對齊 nestjs)、次新 `status='used'`(nestjs refreshToken 用過後改、state transition 正確)、rt_len > 100(per spec SC-004 + FR-002)

**Checkpoint**:US2 完成 — rust 寫入字串值對齊 + state transition 驗、F10.2 acceptance 主體完成。

---

## Phase 5: User Story 3 — F10.1 secret 對齊 regression(Priority: P3)

**Goal**:F10.2 不動 secret wiring、但須 regression 驗 F10.1 fallback chain 維持。

**Independent Test**:`docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"`,兩個 envvar 同 value。

### US3 acceptance(對齊 C-V6)

- [ ] T050 [US3] **C-V6 nestjs env secret 對齊 regression**:
  ```bash
  docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"
  ```
  預期:`REFRESH_TOKEN_SECRET=<value>` == `JWT_SECRET=<value>`(F10.1 fallback chain 對齊維持、F10.2 不退化、per spec SC-005)

**Checkpoint**:US3 完成 — F10.1 secret 對齊 regression PASS、F10.2 不破壞 F10.1。

---

## Phase 6: Zero-regression(對齊 W-F* / W-FA* / F10 / F10.1 標配)

**Goal**:base-web + nestjs fork 零改動 + rust-api scope 收緊到單 file(`consts.rs`)+ W-FA1 stack 仍健康。

### Zero-regression verification

- [ ] T060 [P] **C-V7a three sides scope verify**:
  ```bash
  echo "=== base-web/src/ diff lines (預期 0) ==="
  git diff HEAD -- base-web/src/ | wc -l

  echo "=== fork260509-soybean-admin-nestjs/ diff lines (預期 0) ==="
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l

  echo "=== rust-api scope (預期 1 file: consts.rs ~18 LOC) ==="
  (cd rust-api && git diff HEAD --stat)

  echo "=== outer scope (預期 CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + rust-api gitlink + specs/019-* untracked、無 docker-compose.yml diff) ==="
  git status --short
  ```
  預期:per spec SC-007 + SC-008 + SC-011 + plan structure decision

- [ ] T061 [P] **C-V7b W-FA1 stack regression**:
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期:6 healthy + rust-api uptime 較短(just recreated)+ 其他 5 service uptime 較長(per spec NFR-004 zero-regression 條件)

**Checkpoint**:Phase 6 完成 — 三邊 scope 對齊 + W-FA1 stack regression PASS。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc 反映 F10.2 落地。

- [ ] T070 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-016):
  - Current Focus 三段更新(Phase / Active feature 改無、F10.2 outer commit pending push / 下一步 F11 + 並行)
  - Application Phase 4 Roadmap 表 F10.2 row 從「未啟」改「完成」(`outer <sha-pending>`、`rust-api <sha-pending>`、7/7 acceptance PASS + 1 unit test)
  - 已完成里程碑加 F10.2 條目(對齊 F10.1 同 application-phase style + 兩段式 commit、SHA placeholder)
  - **Application Phase 4 整套收尾紀錄**(F10 wire-up + F10.1 R-8 修 + F10.2 R-7 修完整、refreshToken end-to-end pass、三邊零改動)
  - 列 F11 為 next-step(extracted stubs 範疇可清楚定義)

- [ ] T071 [P] **doc grep verify**:
  ```bash
  grep -cE "F10\.2\b|rust-tokenstatus-string-align" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F10.2" docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:≥ 5 match、INTEGRATION-CHECKLIST.md 多處 F10.2 引用(Current Focus + 已完成里程碑 + Phase 4 Roadmap row)

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.1 慣例)

**Goal**:落實**兩段式 commit** 紀律(F10.2 動 rust-api worktree、純 outer 不夠)、push 等 user 同意。

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push:
  ```bash
  cd rust-api
  git status --short
  # 預期 modified: server/constant/src/definition/consts.rs (1 file)

  git add server/constant/src/definition/consts.rs

  git commit -m "$(cat <<'EOF'
  feat(rust-api): F10.2 對齊 TokenStatus enum 字串值到 nestjs(R-7 修)

  rev1 application Phase 4 第三個也是最後一個 feature(F10 wire-up + F10.1 R-8 修
  後收尾、F11/F13 之前)。修 F10/F10.1 acceptance surface 的 R-7 friction(nestjs
  tokens.entity.ts:33 對 rust 寫入 status="ACTIVE" throw 'Token has already been
  used.'):rust TokenStatus enum strum serialize 從 SCREAMING_SNAKE_CASE 改
  snake_case + 2 個 per-variant override(Active="unused"、Refreshed="used"、
  Revoked 走 snake_case default → "revoked"、rust-only 狀態 per Q1)。落地後
  refreshToken end-to-end pass(HTTP 200 + 新 token pair + sys_tokens state
  transition unused → used)。

  改動範圍(rust-api、~18 LOC、單 file):
  - server/constant/src/definition/consts.rs:
    - serialize_all: SCREAMING_SNAKE_CASE → snake_case (1 line)
    - Active +#[strum(serialize = "unused")] (1 line、對齊 nestjs UNUSED='unused')
    - Refreshed +#[strum(serialize = "used")] (1 line、對齊 nestjs USED='used')
    - Revoked 不動 (走 snake_case default → "revoked")
    - 加 #[cfg(test)] mod tests with test_token_status_serialize_aligns_with_nestjs
      (1 fn / 6 assert: 3 forward + 3 reverse)

  Brainstorm 4 顯式拍板 Q:
  - Q1: Revoked variant 處理 → 保留 rust-only、"revoked" lowercase
  - Q2: enum serialize 路徑 → strum serialize_all="snake_case" + per-variant override
  - Q3: DB backward compat → 不處理舊 row、acceptance 重 login
  - Q4: unit test 紀律 → SHOULD、1 個 test 對 3 variant serialize + reverse from_str

  Acceptance:US1 P1 MVP 3/3(C-V2 login JWT regression / C-V3 refreshToken HTTP 200
  + 新 token pair / C-V4 nestjs log no error 0 line)+ US2 P2 1/1(C-V5 psql sys_tokens
  最新 unused + 次新 used state transition)+ US3 P3 1/1(C-V6 nestjs PID 1 env
  REFRESH_TOKEN_SECRET==JWT_SECRET F10.1 fallback chain regression)+ zero-regression
  2/2(C-V7a three-side scope + C-V7b W-FA1 stack)+ unit test 1/1
  (test_token_status_serialize_aligns_with_nestjs 6 assert)= **8/8 PASS**(對齊
  spec NFR-004)。

  base-web + nestjs fork 兩邊 zero diff(per FR-006 + FR-009 + SC-007 + SC-008);
  rust-api 改動單 file(per SC-011 + plan structure decision);W-FA1 stack 6 service
  healthy + migration exited 0 維持;rust-api image rebuild ~5-7 min cold。

  Constitution Check 17 PASS / 13 N/A / 0 violation(Principle V「漸進收縮」
  DESIGN-B 階段 lowercase enum 保留、無破壞性)。**Application Phase 4 整套收尾**:
  F10 wire-up + F10.1 R-8 修 + F10.2 R-7 修完整、refreshToken end-to-end pass、
  解鎖 F11 extracted-stubs + F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git push origin rev1-admin-rust-api
  ```

### Stage 2 — outer commit(rev1-admin-root via 019 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md + rust-api SHA pin、**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current  # 預期 019-rust-tokenstatus-string-align
  git status --short
  # 預期 modified: CLAUDE.md / docs/INTEGRATION-CHECKLIST.md / .specify/feature.json /
  #            rust-api(new SHA pin)
  # untracked: specs/019-rust-tokenstatus-string-align/

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F10.1 pattern):
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          specs/019-rust-tokenstatus-string-align/ \
          rust-api

  git commit -m "$(cat <<EOF
  feat(spec): F10.2 rust-tokenstatus-string-align — R-7 修 + Phase 4 收尾

  outer side of F10.2 application Phase 4 第三個也是最後一個 feature(rust-api
  worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit 為 spec docs + rust-api SHA pin
  + INTEGRATION-CHECKLIST.md Phase 4 收尾紀錄 + CLAUDE.md SOP marker)。

  改動範圍(outer):
  - specs/019-rust-tokenstatus-string-align/{spec, plan, research, data-model,
    quickstart, contracts/verification-commands, checklists/requirements, tasks}.md
    新建(/speckit-specify + /speckit-clarify(無 question)+ /speckit-plan +
    /speckit-tasks 全跑完)
  - CLAUDE.md SPECKIT marker 區間自動更新(Active feature 改 F10.2 019-*)
  - docs/INTEGRATION-CHECKLIST.md F10.2 row + Current Focus + 已完成里程碑
    (Phase 4 Roadmap F10.2 從「未啟」改「完成」、加新里程碑條目、Phase 4 整套收尾)
  - .specify/feature.json 指 specs/019-rust-tokenstatus-string-align
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**(對比 F10.1、F10.2 不需動 deploy 配置)。

  Acceptance(走完 8/8、對齊 spec NFR-004):見 rust-api ${RUST_API_SHORT_SHA}
  commit body 詳細。

  Constitution Check 17 PASS / 13 N/A / 0 violation(Principle V「漸進收縮」
  DESIGN-B 階段 lowercase enum 保留、無破壞性);base-web + nestjs fork 兩邊
  zero diff;W-FA1 stack 6 service healthy + migration exited 0 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F10/F10.1 等 pattern、merge 後再補。

  **Application Phase 4 整套收尾**(F10 wire-up + F10.1 R-8 修 + F10.2 R-7 修):
  refreshToken end-to-end pass、base-web + rust-api + nestjs fork 三邊零改動、
  解鎖 F11 extracted-stubs + F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F10.2 兩段式 commit 已落(rust-api 已推 origin、outer 在本機),要不要 push outer 019-rust-tokenstatus-string-align 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    git push origin 019-rust-tokenstatus-string-align
    git switch rev1-admin-root
    git merge --no-ff 019-rust-tokenstatus-string-align -m "Merge branch '019-rust-tokenstatus-string-align' into rev1-admin-root: F10.2 完成"
    # SHA fill follow-up commit(對齊 W-FA*/F10/F10.1 pattern)
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F10.2" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F10.2 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root
    ```

**Checkpoint**:Phase 8 完成 — F10.2 落地、兩段式 commit 紀律遵守、application Phase 4 整套收尾、F11 extracted-stubs follow-up baseline 明確、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational | Phase 3(stack 必須先起、確認 F10.1 R-8 修仍 work)| Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 7 + 8 | Phase 1 + 2 + rust-api image rebuild |
| Phase 4 US2 | Phase 7 | Phase 3(login + refreshToken 完成、sys_tokens 有 2 row)|
| Phase 5 US3 | Phase 7 | Phase 3(stack with F10.2 image 起後)|
| Phase 6 Zero-regression | Phase 7 | Phase 3 + 5(改動完成後驗 scope)|
| Phase 7 Doc | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(rust source patch + 1 unit test + 3 stack acceptance C-V2/C-V3/C-V4)
- US2(P2):純 acceptance、依賴 US1 login + refreshToken 完成
- US3(P3):純 acceptance(env grep)、依賴 US1 stack 起 + F10.1 既有 secret wire

實際:**US1 = impl(rust source)+ acceptance(stack);US2/US3 = acceptance only**。

## Parallel Execution

### Phase 1 部分並行
T001 序列(branch + status)、T002 [P] 並行

### Phase 2 序列
T010(stack up + baseline check)序列、blocking Phase 3+

### Phase 3 半並行(within phase)
- T020 序列(enum 改 必先)
- T021 序列(unit test 接 T020 後、依賴 enum 新 serialize 字串值)
- T030 序列(rebuild image 接 T020 + T021 改完)
- T031 序列(restart stack 接 T030)
- T032 序列(3 個 inline curl/grep 接 T031)

### Phase 4 序列
T040 接 T032 login + refreshToken 完成後

### Phase 5 序列
T050 接 T031 stack 起後

### Phase 6 全可並行
T060 / T061 全 [P] 並行(獨立 git diff / docker ps)

### Phase 7 部分並行
T070 序列(改 INTEGRATION-CHECKLIST.md)、T071 [P](grep verify)

### Phase 8 嚴格序列
T100 → T101 → T102(兩段式 commit + push wait、無法並行)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F10.2 R-7 修確認、refreshToken end-to-end pass、可定義 F11 acceptance baseline。US2 + US3 + Zero-regression + Doc + Commit 為驗證 + 收尾 phase。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 F5.1/F6/F10.1 同 session 模式)、不 US1-only commit。

**並行 vs 序列建議**:
- 全 17 task 預估時間 15-30 分鐘(rust image rebuild 占 5-7 min、unit test cold compile 占 5-10 min、其他 task 各 30s-2 min)
- Critical path:T001 → T002 → T010 → T020 → T021(unit test)→ T030(rebuild)→ T031 → T032 → T040 → T050 → T060/T061 → T070 → T100 → T101 → T102

**故障排查**(per quickstart 故障排查段):
- T021 unit test fail:strum derive 對 per-variant override 行為與預期不符(R-1)→ 改 Option B 全 per-variant override 或加 `to_string` attribute 雙重
- T030 build fail:cargo dependency 或 strum_macros 版本不相容 → 檢 build log + Cargo.toml
- T031 stack restart loop:enum derive expand panic / 退化 → 檢 docker compose logs rust-api
- T032 C-V3 HTTP 500 with "Token has already been used":F10.2 enum 改未生效(image 未 rebuild / container 未 recreate)→ 強制 `docker compose up -d --wait --force-recreate rust-api`
- T032 C-V3 HTTP 500 with "jwt malformed":F10.1 R-8 退化、不應發生、abort F10.2 + 檢 F10.1 source
- T032 C-V4 R-7 grep ≥ 1:同 T032 C-V3 HTTP 500 模式、檢 enum + image
- T040 最新 row status='ACTIVE':同 T032 C-V3 模式、檢 image rebuild + force-recreate
- T040 只有 1 row:T032 未完整跑、重跑 C-V2 + C-V3 順序
- T050 nestjs env 為空:nestjs entrypoint 失效、F10.1 部署退化、abort F10.2 + 檢 F10.1 + W-FA1
- T060 git diff > 0 在 base-web/nestjs:意外改動、abort F10.2 + 改正
- T100 conventional commit hook fail:檢 message format、必要時調整 + 新建 NEW commit(per CLAUDE.md §5、不 amend)

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T032 [US1] / T040 [US2] / T050 [US3]) |
| Setup / Foundational / Zero-regression / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
