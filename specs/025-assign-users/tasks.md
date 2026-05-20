---
description: "Task list for F8 — assign-users implementation"
---

# Tasks: F8 — assign-users

**Input**: Design documents from `/specs/025-assign-users/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F8 **無 rust unit test**(per spec FR-014;F8 為純 HTTP wiring、無可獨立測之 pure function;`assign_users` service method 既有、範疇外)— 同 F7.1 wiring feature precedent
- Acceptance compensate:curl + psql(per spec FR-015、capture→assign→verify→restore per FR-018)
- **Acceptance**:per spec US1 P1 7 個 acceptance scenario → 對齊 **12 個 C-V**(per contracts/verification-commands.md C-V1~C-V12)

**Organization**:F8 為單一 user story feature(US1 P1)、Setup(2)+ Foundational(1)+ US1 impl(2)+ shared build(2)+ shared acceptance(7)+ Doc(2)+ 兩段式 Commit(3)= **19 task**(實際 impl task 2 個、F8 為 F7/F7.1/F7.2 鏈的 Phase 3 收尾 wiring feature)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F8 row + Current Focus + Phase 3 進度)
  - 改:`CLAUDE.md` §10 SPECKIT marker(`/speckit-plan` 已 update 指 025)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
  - 已 commit(brainstorm 階段):`docs/superpowers/025-feature-assign-users.md`
- **Worktree(改、`rust-api/`、~35 LOC、5 file):**
  - 改:`rust-api/server/api/src/admin/sys_authentication_api.rs`(US1、E1 `assign_users` handler + `AssignUserDto` import)
  - 改:`rust-api/server/router/src/admin/sys_authentication_route.rs`(US1、E2 route mount + `RouteInfo`)
  - 新建:`rust-api/migration/src/datas/m20260522_a_f8_assign_users_seed.rs`(US1、E3 Casbin `p` policy seed)
  - 改:`rust-api/migration/src/datas/mod.rs`(US1、E3 register)
  - 改:`rust-api/migration/src/lib.rs`(US1、E3 Migrator vec register)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-010 + FR-011);rust-api 其他 file + DB schema 不動(per FR-005 + FR-009)
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` host-side bash)
- **Image / artifact**:F8 需 rebuild rust-api docker image(per C-V1、warm ~2-3 min)+ recreate `migration` init-container(per C-V2、apply `m20260522`)
- **無 docker-compose.yml 改 / 無 DB schema 改(只 1 個 Casbin policy seed migration)**

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `025-assign-users` + rust-api worktree branch = `rev1-admin-rust-api`、F7.2 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F7.2' | head -2 && cd rust-api && git branch --show-current && cd ..`(預期 outer branch=025-*、rust-api branch=rev1-admin-rust-api、history 含 F7.2 merge `476ca88`)

- [ ] T002 [P] 確認 W-FA1 stack image 就位,執行 `docker images rust-api:rev1-admin-rust-api -q && docker images nestjs:rev1-admin-nestjs -q`(預期 image SHA 兩個都非空)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起(F8 acceptance 需 login + curl + psql 走 stack)。

- [ ] T010 起 7 service stack(若未起):`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0)

---

## Phase 3: User Story 1 — `assign-users` user-role 指派 endpoint(Priority: P1)🎯 MVP

**Goal**:新增 `POST /authorization/assign-users` endpoint,把既有 `SysAuthorizationService::assign_users` service method 接上 HTTP;ROLE_SUPER 可指派 user 集合給 role(整組覆蓋語意、寫 `sys_user_role` join table)、非 ROLE_SUPER 被 Casbin deny。

**Independent Test**:Soybean login → curl `POST /authorization/assign-users`(capture ROLE_USER 現有 user → additive assign)→ HTTP 200 + code:0;psql 驗 `sys_user_role`;被加入 user re-login `getUserInfo` 反映;restore。

### US1 implementation(rust source patch、~35 LOC、5 file)

- [ ] T020 [US1] 依 data-model.md E1 + E2 改 rust source(2 file):
  - **E1** `rust-api/server/api/src/admin/sys_authentication_api.rs`:`impl SysAuthenticationApi` 內、緊接既有 `assign_routes` handler 之後加 `assign_users` handler — `Extension<Arc<SysAuthorizationService>>` + `ValidatedForm<AssignUserDto>` → `service.assign_users(input.role_id, input.user_ids).await?` → `Res::new_data(())`,加 3 行 doc comment;既有 `use server_service::{ admin::{ ... AssignPermissionDto, AssignRouteDto, ... }, Audience }` 清單加入 `AssignUserDto`
  - **E2** `rust-api/server/router/src/admin/sys_authentication_route.rs`:`init_authorization_router` 的 `routes` vec 緊接既有 `assign-routes` 那筆後加 `RouteInfo::new(&format!("{}/assign-users", base_path), Method::POST, service_name, "分配用户")`;`authorization_router` 緊接 `.route("/assign-routes", ...)` 後加 `.route("/assign-users", post(SysAuthenticationApi::assign_users))`
  - 不動 `sys_authentication_api.rs` 其他 handler、不動 `init_protected_*` 其他 router、不動 `assign_permission`/`assign_routes`
  - 比照 sibling `assign_routes`(無 `enforcer`、per research R-Q1)

- [ ] T021 [US1] 依 data-model.md E3 加 Casbin policy seed migration(3 file):
  - 新建 `rust-api/migration/src/datas/m20260522_a_f8_assign_users_seed.rs` — `MigrationTrait`、`up` INSERT 1 row `('p','ROLE_SUPER','built-in','/authorization/assign-users','POST','','')`、`down` scope-limited DELETE;沿用 F7 `m20260521` 的 `Statement::from_string` raw SQL pattern、`v4=''`(per F11 R-Q5 baseline)
  - 改 `rust-api/migration/src/datas/mod.rs` — 末尾加 `pub mod m20260522_a_f8_assign_users_seed;`
  - 改 `rust-api/migration/src/lib.rs` — Migrator vec 末尾加 `Box::new(datas::m20260522_a_f8_assign_users_seed::Migration),`
  - 只 1 row、只 ROLE_SUPER(per FR-007 + brainstorm Q3);無 DB schema 改

---

## Phase 4: Shared Build + Acceptance(US1)

### Build

- [ ] T030 **C-V1** rebuild rust-api docker image(per quickstart Step 2):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 exit 0 + warm ~2-3 min;image 含 `server` + `migration` 兩 binary(F8 新 migration 隨 `migration` binary 編入)。若 fail → check `assign_users` handler 語法 / `AssignUserDto` import / `m20260522` 語法 / `mod.rs`+`lib.rs` 註冊。接 T020 + T021 done

- [ ] T031 **C-V2** recreate `migration` + `rust-api`(migration init-container apply `m20260522`):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -8
  docker compose logs migration 2>&1 | tail -15
  ```
  預期 `migration` init-container exited 0(log 見 `m20260522` 套用)+ `rust-api` recreated healthy + 其他 5 service 仍 healthy。接 T030

### US1 acceptance(對齊 contracts/verification-commands.md C-V3~C-V9)

- [ ] T032 [US1] **C-V3** psql 驗 F8 Casbin policy row 落 DB(per contracts):查 `casbin_rule` WHERE `v2='/authorization/assign-users'` → 預期剛好 1 row `p|ROLE_SUPER|built-in|/authorization/assign-users|POST`(`v4` 空)。接 T031

- [ ] T033 [US1] **C-V4 + C-V5 + C-V6 + C-V7** assign-users happy path(capture→assign→verify→restore、per contracts + spec FR-018):
  - capture:psql 擷取 `ROLE_USER`(role 3)現有 `sys_user_role` user 集合(baseline 預期 user 3)
  - Soybean(ROLE_SUPER)login → curl `POST /api/authorization/assign-users` body `{"roleId":"3","userIds":["3","2"]}` → 預期 HTTP 200 + envelope code:0(C-V4)
  - psql 驗 `sys_user_role` role 3 含 `(user_id=2)` row(C-V5)
  - Administrator(user 2)re-login → curl `/auth/getUserInfo` → `data.roles` 含 `R_USER`(C-V6)
  - restore:curl `assign-users` body `{"roleId":"3","userIds":["3"]}` → HTTP 200 + code:0;psql 驗 role 3 回 baseline(只 user 3、無污染)(C-V7)
  - 接 T032
  > role_id / user_id 實際值以 seed 為準、先 psql 確認真實 id 型別與值(per contracts C-V4 註)

- [ ] T034 [US1] **C-V8** 非 ROLE_SUPER deny(per contracts):Administrator + GeneralUser 各 login → curl `POST /api/authorization/assign-users` → 各 HTTP 200 + envelope `{code:5001, success:false}`(Casbin deny、per F11 R-Q6 envelope wrap);psql 確認未實際寫入 `sys_user_role`。接 T033

- [ ] T035 [P] [US1] **C-V9** sibling endpoint regression(per contracts、非破壞性 probe):ROLE_SUPER 對 `/authorization/assign-permission` + `/authorization/assign-routes` 各送缺欄位 body `{}` → 預期兩者皆**非 HTTP 404**(route 仍掛載、F8 router 改動未退化 sibling)。接 T031、可平行於 T032-T034

### Zero-regression(對齊 C-V10 + C-V11)

- [ ] T036 [P] **C-V10 three-side scope verify**(per contracts):
  ```bash
  git diff HEAD -- base-web/ | wc -l                                         # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l              # 預期 0
  (cd rust-api && git diff HEAD --stat && git status --short)                 # 預期 ~5 file(2 改 + 1 新建 migration + 2 register)
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l  # 預期 0
  git status --short
  ```
  預期:base-web/nestjs/docker-compose 各 0 diff + rust-api ~5 file + outer scope(CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + docs/superpowers/025-* + rust-api gitlink + specs/025-*)。接 T020 + T021 後、可平行於 T032-T035

- [ ] T037 [P] **C-V11 W-FA1 stack regression**:`docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 service healthy + rust-api uptime 較短剛 recreated + migration exited 0)。接 T031、可平行於 T032-T036

- [ ] T038 [P] [US1] **C-V12** 空輸入 validation rejection(per contracts、edge case E-1 + E-2):Soybean(ROLE_SUPER)login → curl `POST /api/authorization/assign-users` 帶空 `userIds`(`{"roleId":"3","userIds":[]}`)+ 帶空 `roleId`(`{"roleId":"","userIds":["3"]}`)→ 兩請求各 envelope 非 `code:0`(既有 `AssignUserDto` `min 1` validation 擋下、`success:false`);psql 確認 `sys_user_role` role 3 未被寫入。接 T031、可平行於 T032-T037

**Checkpoint**:Phase 4 完成 — C-V1~C-V12 acceptance 12/12 PASS。

---

## Phase 5: Documentation Update

- [ ] T040 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-019):
  - Current Focus 更新(Phase / Active feature 改 F8、F8 outer commit pending push)
  - 已完成里程碑加 F8 條目(對齊 F7.2 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - Application Phase 3 進度說明改 **3/3 完成**(F9 + F7 + F8、F8 為第三個也是最後一個)
  - 列 F8 後 next-step:F12 / W-F11 / W-F6b 並行候選

- [ ] T041 [P] **doc grep verify**:
  ```bash
  grep -cE "F8 |assign-users" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F8" docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期:≥ 3 match、INTEGRATION-CHECKLIST.md 多處 F8 引用(Current Focus + 已完成里程碑 + Phase 3 進度 3/3)

**Checkpoint**:Phase 5 完成 — doc 改動到位、Phase 6 commit。

---

## Phase 6: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.x/F11/F9/F7/F7.1/F7.2 慣例)

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 5 file(2 改 + 1 新建 + 2 register)
  git add server/api/src/admin/sys_authentication_api.rs \
          server/router/src/admin/sys_authentication_route.rs \
          migration/src/datas/m20260522_a_f8_assign_users_seed.rs \
          migration/src/datas/mod.rs migration/src/lib.rs
  git commit -m "$(cat <<'EOF'
  feat(rust-api): F8 加 POST /authorization/assign-users endpoint

  application Phase 3 第三個也是最後一個 feature — 補上 user ↔ role 指派寫路徑。

  brainstorm grep 確認:assign_users 的 DTO + trait + service impl 三層已存在,
  F8 唯一缺口是 HTTP wiring。

  改動(rust-api、5 file ~35 LOC):
  - server/api/src/admin/sys_authentication_api.rs
    - 加 SysAuthenticationApi::assign_users handler(比照 sibling assign_routes、
      無 enforcer)+ AssignUserDto import
  - server/router/src/admin/sys_authentication_route.rs
    - init_authorization_router 加 POST /authorization/assign-users route + RouteInfo
  - migration/src/datas/m20260522_a_f8_assign_users_seed.rs(新建)
    - Casbin p policy seed 1 row(ROLE_SUPER × /authorization/assign-users × POST)
  - migration/src/datas/mod.rs + migration/src/lib.rs — 註冊新 migration

  user→role 只寫 sys_user_role join table(整組覆蓋語意)、不寫 Casbin g rule;
  只 ROLE_SUPER 可呼叫(對齊 sibling assign-permission/assign-routes)。

  Acceptance:C-V1 image rebuild / C-V2 migration apply m20260522 / C-V3 Casbin
  row 落 DB / C-V4-7 ROLE_SUPER assign-users happy path(capture→assign→verify
  →restore)/ C-V8 ROLE_ADMIN+ROLE_USER deny code:5001 / C-V9 sibling regression /
  C-V10 三邊 scope(base-web/nestjs/docker-compose 0 diff)/ C-V11 stack 6 healthy /
  C-V12 空輸入 validation rejection = 12/12 PASS。

  base-web + nestjs fork 三邊零改動(per FR-010 + FR-011);無 docker-compose.yml
  改;無 DB schema 改(只 1 個 Casbin policy seed migration)。

  Constitution Check 5 PASS / 0 N/A / 0 violation。

  F8 收尾 application Phase 3(F9 + F7 + F8 = 3/3)。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit(rev1-admin-root via 025 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs 已由 spec-kit after_* hook commit、本 commit 主要 INTEGRATION-CHECKLIST.md + rust-api SHA pin + CLAUDE.md;**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 025-assign-users
  git status --short

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F7.x pattern)
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json rust-api specs/025-assign-users/

  git commit -m "$(cat <<EOF
  feat(spec): F8 assign-users — user-role 指派 endpoint

  outer side of F8 — rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit
  為 INTEGRATION-CHECKLIST.md F8 row + Current Focus + rust-api SHA pin +
  CLAUDE.md SPECKIT marker + specs/025-assign-users/ spec-kit 全套。

  改動範圍(outer):
  - CLAUDE.md SPECKIT marker(Active feature 改 F8 025-*)
  - docs/INTEGRATION-CHECKLIST.md F8 row + Current Focus + Phase 3 進度 3/3
  - specs/025-assign-users/(spec/plan/research/data-model/contracts/quickstart/tasks)
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**;**無 DB schema 改**(只 1 個 Casbin policy seed)。

  Acceptance C-V1~C-V12 = 12/12 PASS(對齊 spec NFR/FR):見 rust-api
  ${RUST_API_SHORT_SHA} commit body 詳細。

  Constitution Check 5 PASS / 0 N/A / 0 violation;base-web + nestjs fork
  兩邊 zero diff;W-FA1 stack 6 service healthy 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F7/F7.1/F7.2/F9 等 pattern、merge 後再補。

  F8 收尾 application Phase 3(F9 + F7 + F8 = 3/3)。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F8 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push outer 025-assign-users 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 025-assign-users
    git switch rev1-admin-root
    git merge --no-ff 025-assign-users -m "Merge branch '025-assign-users' into rev1-admin-root: F8 完成"
    # SHA fill follow-up commit(對齊 F7/F7.1/F7.2/F9 pattern)
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F8 assign-users" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F8 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```

**Checkpoint**:Phase 6 完成 — F8 落地、兩段式 commit 紀律遵守、base-web + nestjs fork 兩邊零改動、push 等 user 同意、application Phase 3 收尾 3/3。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-6 | — |
| Phase 2 Foundational(T010) | Phase 4(stack 必須先起) | Phase 1 |
| Phase 3 US1 impl(T020+T021) | Phase 4 build | Phase 1 |
| Phase 4 build(T030+T031) | Phase 4 acceptance + 5 + 6 | T020 + T021 |
| Phase 4 acceptance(T032-T038) | Phase 5 | T031(T035-T038 接 T031 後;T036 接 T020+T021 後) |
| Phase 5 Doc(T040-T041) | Phase 6 | Phase 4 全 PASS |
| Phase 6 Commit(T100-T102) | — | 全 5 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):rust source 2 file 改(`sys_authentication_api.rs` + `sys_authentication_route.rs`)+ 1 新建 migration + 2 register + acceptance C-V3~C-V9
- Shared:C-V1 build + C-V2 migration apply + C-V10-C-V11 regression 共用
- US1 acceptance:C-V3~C-V9 + C-V12(curl + psql + validation probe)

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P] 並行
- **Phase 3**:T020(source wiring)+ T021(migration)— 兩者獨立檔案、可並行,但同屬 US1、建議同 session 一起做
- **Phase 4**:T030→T031 序列(build→recreate);T032(psql)→ T033(assign happy path、接 T032)→ T034(deny、接 T033)序列;T035 [P](sibling regression)+ T036 [P](scope)+ T037 [P](stack)+ T038 [P](validation rejection)接 T031 後可並行
- **Phase 5**:T040 序列、T041 [P]
- **Phase 6**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 `POST /authorization/assign-users` endpoint 落地;build + acceptance + doc + commit 為驗證 + 收尾。

**MVP commit policy**:推薦走完整 Phase 1-6 一次到位(對齊 F5.1/F6/F10.x/F11/F9/F7/F7.1/F7.2 同 session 模式)。

**全 19 task 預估時間**:25-35 分鐘(rust image rebuild 占 2-3 min、migration recreate ~30s、curl/psql acceptance 各 ~10s;impl task 2 個 ~35 LOC)。

**Critical path**:T001 → T002 → T010 → T020 + T021 → T030 → T031 → T032 → T033 → T034 / T035 / T036 / T037 / T038(部分並行)→ T040/T041 → T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1] | ✓(T020 / T021 / T032 / T033 / T034 / T035 / T038 [US1]) |
| Setup / Foundational / shared build / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(T002/T035/T036/T037/T038/T041 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
