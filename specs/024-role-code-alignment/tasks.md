---
description: "Task list for F7.2 — role-code-alignment implementation"
---

# Tasks: F7.2 — role-code-alignment

**Input**: Design documents from `/specs/024-role-code-alignment/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F7.2 含 **1 個 rust unit test**(`test_map_role_alias` 純函式、per spec FR-013 + F10.2 precedent)— 與 F7/F7.1「無 unit test」不同,因 F7.2 核心是可獨立測的純函式
- Acceptance compensate:curl + CDP smoke(不帶 workaround、per spec FR-014 + FR-017)
- **Acceptance**:per spec US1 P1 5 個 acceptance scenario → 對齊 **9 個 C-V**(per contracts/verification-commands.md C-V1~C-V9)

**Organization**:F7.2 為單一 user story feature(US1 P1)、Setup(2)+ Foundational(1)+ US1 impl(1)+ shared build(2)+ shared acceptance(6)+ Doc(2)+ 兩段式 Commit(3)= **17 task**(實際 impl task 僅 1 個、F7.2 為 F7.1 的小型 follow-up patch)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F7.2 row + Current Focus)
  - 改:`CLAUDE.md` §10 SPECKIT marker(`/speckit-plan` 已 update 指 024)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
  - 已 commit(brainstorm 階段):`docs/superpowers/024-feature-role-code-alignment.md`
- **Worktree(改、`rust-api/`、~10 LOC core + 1 unit test、1 file):**
  - 改:`rust-api/server/api/src/admin/sys_authentication_api.rs`(US1、`map_role_alias` helper + `get_user_info` handler 套映射 + `#[cfg(test)] mod tests`)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-008 + FR-009);rust-api 其他 file + migration 不動(per FR-007/FR-011)
- **Acceptance test 執行**:outer repo root(`curl` / `docker compose` / `git diff` host-side bash + CDP node script via WSL2 host Edge 148)
- **Image / artifact**:F7.2 需 rebuild rust-api docker image(per C-V1、warm ~2-3 min)
- **無 docker-compose.yml 改 / 無 migration 改**

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `024-role-code-alignment` + rust-api worktree branch = `rev1-admin-rust-api`、F7.1 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F7.1 完成|F7.1 fix-route' | head -2 && cd rust-api && git branch --show-current && cd ..`(預期 outer branch=024-*、rust-api branch=rev1-admin-rust-api、history 含 F7.1 merge `efe910e`)

- [ ] T002 [P] 確認 W-FA1 stack image 就位,執行 `docker images rust-api:rev1-admin-rust-api -q && docker images nestjs:rev1-admin-nestjs -q`(預期 image SHA 兩個都非空)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起(F7.2 acceptance 需 login + curl + CDP smoke 走 SPA)。

- [ ] T010 起 7 service stack(若未起):`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0)

---

## Phase 3: User Story 1 — `getUserInfo` role code alias 映射(Priority: P1)🎯 MVP

**Goal**:`get_user_info` handler 對回傳的 `roles[]` 套 role-code alias 映射(`ROLE_*`→`R_*`、未知 pass through)、base-web static 模式 role 比對接通、消除 F7.1 CDP role alias workaround。

**Independent Test**:Soybean login → curl `/auth/getUserInfo` → `data.roles` 含 `R_SUPER`;CDP smoke navigate manage 3 view 不帶 workaround 仍 render。

### US1 implementation(rust source patch、~10 LOC core + 1 unit test、1 file)

- [ ] T020 [US1] 依 data-model.md E1 + E2 + E3 改 `rust-api/server/api/src/admin/sys_authentication_api.rs`:
  - **E1**:module level 加 `map_role_alias(code: &str) -> String` 純函式 — 明確 3-entry `match`(`ROLE_SUPER`→`R_SUPER` / `ROLE_ADMIN`→`R_ADMIN` / `ROLE_USER`→`R_USER`)+ `other => other.to_string()` unknown pass through;加 4 行 doc comment 標明 F7.2 role-code-alignment + 「只用於 getUserInfo response 邊界、JWT/Casbin/sys_role.code 維持 ROLE_*」
  - **E2**:`get_user_info` handler 的 `roles: user.subject()` 改為 `roles: user.subject().iter().map(|c| map_role_alias(c)).collect()` + 1 行 inline comment;handler signature / `user_id` / `user_name` / `buttons` 不變
  - **E3**:module 加 `#[cfg(test)] mod tests` 含 `test_map_role_alias` 1 fn — `use super::map_role_alias`、assert 3 known code 映射 + 1 unknown(`ROLE_FUTURE`)pass-through
  - **不用** `ROLE_`→`R_` prefix transform(per research R-Q1、明確 match)
  - 不動 `sys_authentication_api.rs` 其他 handler、不動 `UserInfoOutput` struct、不動 `User::subject()`、不加新 import(`map_role_alias` 為 module-private free fn)

---

## Phase 4: Shared Build + Acceptance(US1)

### Build

- [ ] T030 **C-V1** rebuild rust-api docker image(per quickstart Step 2):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 exit 0 + warm ~2-3 min;`cargo build` 階段順帶編譯 `#[cfg(test)]`。若 fail → check `map_role_alias` 語法 / `mod tests` 的 `use super::map_role_alias`。接 T020 done

- [ ] T031 restart rust-api(force-recreate、其他 service 不動):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5
  ```
  預期 rust-api 重啟 healthy + 其他 5 service 仍 healthy。接 T030

### US1 acceptance(對齊 contracts/verification-commands.md C-V2~C-V6)

- [ ] T032 [US1] **C-V2 + C-V3 + C-V4** inline(per contracts/verification-commands.md):Soybean / Administrator / GeneralUser 三 user login → curl `/auth/getUserInfo` → 各 HTTP 200 + envelope code:0 + `data.roles` 各為 `R_SUPER` / `R_ADMIN` / `R_USER`(不含 `ROLE_*`)。預期 3/3 user role code 已映射。接 T031

- [ ] T033 [US1] **C-V5** CDP browser smoke test 3 view **不帶** role alias workaround(per spec FR-017 + research R-Q3):
  ```bash
  # 沿用 F7.1 CDP setup(WSL2 host Edge 148 + --remote-debugging-port=9229)、
  #   但 node script 移除 Fetch.enable / Fetch.requestPaused / role alias 注入整段
  # node script:clear storage → POST login + inject SOY_token
  #   → navigate /manage/menu + /manage/user + /manage/role → 各 count DOM .n-data-table-tr
  node /tmp/cdp-f72-smoke.js
  ```
  預期 3 view 全 PASS:`/manage/menu` row ≥ 5 + `/manage/user` row ≥ 3 + `/manage/role` row ≥ 3、皆不「无数据」。
  若 CDP setup fail / Edge 不可達 → graceful degradation(per spec A-004):C-V2~C-V4 curl role code 已 `R_*` 即視 US1 核心通過、C-V5 標 deferred manual。接 T032

- [ ] T034 [P] [US1] **C-V6** Casbin enforce regression inline(per contracts):三 user login → curl `/route/getUserRoutes` → 各 HTTP 200 + envelope code:0(Casbin enforce 仍用 `ROLE_*` × `casbin_rule.v0`、F7.2 不退化)。接 T031、可平行於 T032+T033

- [ ] T035 [P] [US1] **C-V7** rust unit test(per contracts、FR-013):跑 `test_map_role_alias`(host cargo `cd rust-api && cargo test -p server-api map_role_alias`、對齊 F10.1 host-mounted cargo cache observation;若 host 無 cargo 則 C-V1 docker build `cargo build` 階段已編譯驗 + 標記實際執行環境)。預期 `test_map_role_alias` ok(3 known + 1 unknown)。接 T020、可平行於 T032-T034

### Zero-regression(對齊 C-V8 + C-V9)

- [ ] T036 [P] **C-V8 three-side scope verify**(per contracts):
  ```bash
  git diff HEAD -- base-web/ | wc -l                                         # 預期 0(含 .env)
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l              # 預期 0
  (cd rust-api && git diff HEAD --stat)                                       # 預期 1 file
  (cd rust-api && git diff HEAD --stat -- migration/)                         # 預期 空
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l  # 預期 0
  git status --short
  ```
  預期:base-web/nestjs/docker-compose/migration 各 0 diff + rust-api 1 file(`sys_authentication_api.rs`)+ outer scope（CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + docs/superpowers/024-* + rust-api gitlink + specs/024-*）。接 T020 後、可平行於 T032-T035

- [ ] T037 [P] **C-V9 W-FA1 stack regression**:`docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 service healthy + rust-api uptime 較短剛 recreated + migration exited 0)。接 T031、可平行於 T032-T036

**Checkpoint**:Phase 4 完成 — C-V1~C-V9 acceptance 9/9 PASS(C-V5 可 graceful degradation)。

---

## Phase 5: Documentation Update

- [ ] T040 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-018):
  - Current Focus 更新(Phase / Active feature 改 F7.2、F7.2 outer commit pending push)
  - 已完成里程碑加 F7.2 條目(對齊 F7.1 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - Application Phase 3 進度說明(2/3 不變、F7.2 為 F7/F7.1 base manage/* 跑通收尾、F8 仍待)
  - 列 F7.2 後 next-step:F8 / F12 / W-F11 / W-F6b 並行候選

- [ ] T041 [P] **doc grep verify**:
  ```bash
  grep -cE "F7\.2|role-code-alignment" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F7.2" docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期:≥ 3 match、INTEGRATION-CHECKLIST.md 多處 F7.2 引用(Current Focus + 已完成里程碑)

**Checkpoint**:Phase 5 完成 — doc 改動到位、Phase 6 commit。

---

## Phase 6: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.x/F11/F9/F7/F7.1 慣例)

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 1 file modified
  git add server/api/src/admin/sys_authentication_api.rs
  git commit -m "$(cat <<'EOF'
  fix(rust-api): F7.2 getUserInfo role code alias 映射 ROLE_* → R_*

  F7.1 CDP demo 為了讓 base-web static 模式路由過濾通過、用了 Fetch.requestPaused
  攔 /auth/getUserInfo 注入 R_SUPER/R_ADMIN alias 的 demo-only workaround。
  F7.2 收掉 workaround。

  根因:rust sys_role.code = ROLE_SUPER/ROLE_ADMIN/ROLE_USER,base-web example
  分支 static 路由過濾期望 R_SUPER/R_ADMIN(routes.ts meta.roles hardcoded +
  .env VITE_STATIC_SUPER_ROLE=R_SUPER)。

  改動(rust-api、1 file ~10 LOC core + 1 unit test):
  - server/api/src/admin/sys_authentication_api.rs
    - 加 map_role_alias 純函式(明確 3-entry match、未知 code pass through)
    - get_user_info handler 的 roles 套 map_role_alias
    - #[cfg(test)] mod tests 加 test_map_role_alias(3 known + 1 unknown)

  JWT Claims.role / casbin_rule.v0 / sys_role.code 三者全不動、映射只在
  getUserInfo response 邊界;Casbin enforce 路徑維持 ROLE_*。

  Acceptance:C-V1 image rebuild OK / C-V2-4 三 user getUserInfo roles 各
  R_SUPER/R_ADMIN/R_USER / C-V5 CDP smoke manage 3 view 不帶 workaround
  render / C-V6 Casbin enforce regression 3 user /route/getUserRoutes
  HTTP 200 / C-V7 test_map_role_alias unit test ok / C-V8 三邊 scope
  (base-web/nestjs/docker-compose/migration 0 diff + rust-api 1 file)/
  C-V9 stack 6 healthy = 9/9 PASS。

  base-web + nestjs fork 三邊零改動(per FR-008 + FR-009);無 migration 改;
  無 docker-compose.yml 改;無 Casbin policy 改(per FR-006)。

  Constitution Check 4 PASS / 1 N/A(Principle II soft-delete/audit、F7.2
  無 DB 寫入)/ 0 violation。

  F7.2 消除 F7.1 CDP role alias workaround、base manage/* CDP smoke 原生通、
  解鎖 F8 assign-users。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit(rev1-admin-root via 024 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs 已由 spec-kit after_* hook commit、本 commit 主要 INTEGRATION-CHECKLIST.md + rust-api SHA pin + CLAUDE.md;**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 024-role-code-alignment
  git status --short

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F7.1 pattern)
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json rust-api

  git commit -m "$(cat <<EOF
  fix(spec): F7.2 role-code-alignment — getUserInfo role code 對齊

  outer side of F7.2 — rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit
  為 INTEGRATION-CHECKLIST.md F7.2 row + Current Focus + rust-api SHA pin +
  CLAUDE.md SPECKIT marker。spec docs(specs/024-role-code-alignment/)+ brainstorm
  doc 已由 spec-kit after_* hook 先 commit。

  改動範圍(outer):
  - CLAUDE.md SPECKIT marker(Active feature 改 F7.2 024-*)
  - docs/INTEGRATION-CHECKLIST.md F7.2 row + Current Focus
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**;**無 migration 改**。

  Acceptance C-V1~C-V9 = 9/9 PASS(對齊 spec NFR/FR):見 rust-api
  ${RUST_API_SHORT_SHA} commit body 詳細。

  Constitution Check 4 PASS / 1 N/A / 0 violation;base-web + nestjs fork
  兩邊 zero diff;W-FA1 stack 6 service healthy 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F7/F7.1/F9 等 pattern、merge 後再補。

  F7.2 為 F7.1 後 follow-up — 消除 F7.1 CDP role alias workaround;解鎖 F8。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F7.2 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push outer 024-role-code-alignment 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 024-role-code-alignment
    git switch rev1-admin-root
    git merge --no-ff 024-role-code-alignment -m "Merge branch '024-role-code-alignment' into rev1-admin-root: F7.2 完成"
    # SHA fill follow-up commit(對齊 F7/F7.1/F9 pattern)
    OUTER_SHA=$(git log --oneline | grep "fix(spec): F7.2" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F7.2 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```

**Checkpoint**:Phase 6 完成 — F7.2 落地、兩段式 commit 紀律遵守、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-6 | — |
| Phase 2 Foundational(T010) | Phase 4(stack 必須先起) | Phase 1 |
| Phase 3 US1 impl(T020) | Phase 4 build | Phase 1 |
| Phase 4 build(T030+T031) | Phase 4 acceptance + 5 + 6 | T020 |
| Phase 4 acceptance(T032-T037) | Phase 5 | T031(T035/T036 接 T020 後) |
| Phase 5 Doc(T040-T041) | Phase 6 | Phase 4 全 PASS |
| Phase 6 Commit(T100-T102) | — | 全 5 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):rust source 1 file 改(`sys_authentication_api.rs`)+ acceptance C-V2~C-V7
- Shared:C-V1 build + C-V8-C-V9 regression 共用

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P] 並行
- **Phase 3**:T020 單一 impl task
- **Phase 4**:T030→T031 序列(build→restart);T032(curl)+ T033(CDP smoke、接 T032)+ T034 [P](Casbin regression)+ T035 [P](unit test)+ T036 [P](scope)+ T037 [P](stack)接 T031 後可並行
- **Phase 5**:T040 序列、T041 [P]
- **Phase 6**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 `getUserInfo` role code 映射落地;build + acceptance + doc + commit 為驗證 + 收尾。

**MVP commit policy**:推薦走完整 Phase 1-6 一次到位(對齊 F5.1/F6/F10.x/F11/F9/F7/F7.1 同 session 模式)。

**全 17 task 預估時間**:25-35 分鐘(rust image rebuild 占 2-3 min、curl acceptance 各 ~10s、CDP smoke ~10-20s/view、unit test ~秒級;impl task 僅 1 個 ~10 LOC core)。

**Critical path**:T001 → T002 → T010 → T020 → T030 → T031 → T032 → T033 / T034 / T035 / T036 / T037(並行)→ T040/T041 → T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1] | ✓(T020 / T032 / T033 / T034 / T035 [US1]) |
| Setup / Foundational / shared build / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(T002/T034/T035/T036/T037/T041 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
