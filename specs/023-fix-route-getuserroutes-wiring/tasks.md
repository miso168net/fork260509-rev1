---
description: "Task list for F7.1 — fix-route-getuserroutes-wiring implementation"
---

# Tasks: F7.1 — fix-route-getuserroutes-wiring

**Input**: Design documents from `/specs/023-fix-route-getuserroutes-wiring/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F7.1 為 rust source change feature(類 F5.1/F6/F10.1/F10.2/F11/F9/F7 兩段式 commit)、**無 rust unit test**(per spec FR-015 + F7 FR-021 同精神、wiring/wrapper 邏輯 stack-可見)
- Acceptance compensate:curl + CDP smoke 二類驗證(per spec FR-016)
- **Acceptance**:per spec US1 P1 3 + US2 P2 2 = **5 個 US scenario** → 對齊 **10 個 C-V**(per contracts/verification-commands.md C-V1~C-V10)

**Organization**:F7.1 為 2 user story feature、Setup(2)+ Foundational(1)+ US1 impl(1)+ US2 impl(1)+ shared build(2)+ shared acceptance(5)+ Doc(2)+ 兩段式 Commit(3)= **17 task**(對齊 NFR-002 ~10-14 task 範圍略超、因 acceptance C-V 細目拆分;實際 impl task 僅 2 個、F7.1 為小型 follow-up patch)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F7.1 row + Current Focus)
  - 改:`CLAUDE.md` §10 SPECKIT marker(`/speckit-plan` 已 update 指 023)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
  - 新建(brainstorm 階段已 commit):`docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md`
- **Worktree(改、`rust-api/`、~25 LOC、2 file):**
  - 改:`rust-api/server/initialize/src/router_initialization.rs`(US1、~15 LOC、`init_protected_menu_router` wiring)
  - 改:`rust-api/server/api/src/admin/sys_system_manage_api.rs`(US2、~10 LOC、`list_menu_for_systemmanage` paginated)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-010 + FR-011);rust-api 其他 file + migration 不動(per FR-007/FR-008/FR-013)
- **Acceptance test 執行**:outer repo root(`curl` / `docker compose` / `git diff` host-side bash + CDP node script via WSL2 host Edge 148)
- **Image / artifact**:F7.1 需 rebuild rust-api docker image(per C-V1、warm ~2-3 min)
- **無 docker-compose.yml 改 / 無 migration 改**(對比 F7 有 migration)

> **重要**:F7.1 的 2 file 改在 F7 CDP demo 階段已先 in-place 完成(uncommitted 在 rust-api worktree);T020/T021 為「對照 data-model E1/E2 驗證改動正確」而非從零寫。

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `023-fix-route-getuserroutes-wiring` + rust-api worktree branch = `rev1-admin-rust-api`、F7 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F7 完成|F7 manage-crud' | head -2 && cd rust-api && git branch --show-current && cd ..`(預期 outer branch=023-*、rust-api branch=rev1-admin-rust-api、history 含 F7 merge `136b1eb`)

- [ ] T002 [P] 確認 W-FA1 stack image 就位,執行 `docker images rust-api:rev1-admin-rust-api -q && docker images nestjs:rev1-admin-nestjs -q`(預期 image SHA 兩個都非空)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起(F7.1 acceptance 需 login + curl + CDP smoke 走 SPA)。

- [ ] T010 起 7 service stack(若未起):`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0)

---

## Phase 3: User Story 1 — `/route/getUserRoutes` wiring fix(Priority: P1)🎯 MVP

**Goal**:`init_protected_menu_router` 從 `merge_router!` 單 service 注入改為 manual layer pattern + `Arc<SysAuthService>` Extension layer、解 `/route/getUserRoutes` HTTP 500。

**Independent Test**:Soybean login → curl `/route/getUserRoutes` → 預期 HTTP 200 + envelope code:0 + routes count = 4 + manage 含 4 children。

### US1 implementation(rust source patch、~15 LOC、1 file)

- [ ] T020 [US1] 對照 data-model.md E1 驗證 `rust-api/server/initialize/src/router_initialization.rs` `init_protected_menu_router` 改動正確:
  - `merge_router!(SysMenuRouter::init_protected_menu_router().await, SysMenuService, true, true, None)` 已改為 manual layer pattern
  - `let protected_menu_router = SysMenuRouter::init_protected_menu_router().await.layer(Extension(Arc::new(SysMenuService) as Arc<SysMenuService>)).layer(Extension(Arc::new(SysAuthService) as Arc<SysAuthService>));`
  - 接 `apply_layers(protected_menu_router, Services::None(std::marker::PhantomData::<()>), true, true, None, casbin.clone(), audience).await;`
  - `app = app.merge(protected_menu_router);`
  - 保留 `need_casbin=true` + `need_auth=true`(per FR-003)
  - inline comment 標明 F5.1 wiring fix per INTEGRATION-CHECKLIST §1 ⚠️
  - 若改動不存在或不符 → 依 data-model E1 修正

---

## Phase 4: User Story 2 — `/systemManage/getMenuList/v2` paginated wrapper(Priority: P2)

**Goal**:`list_menu_for_systemmanage` return type 改 `Res<PaginatedData<SystemManageMenuOutput>>`、對齊 base-web `Api.SystemManage.MenuList` paginated 預期。

**Independent Test**:Soybean login → curl `/systemManage/getMenuList/v2` → 預期 envelope `data` 含 `{current, size, total, records}` 4 key。

### US2 implementation(rust source patch、~10 LOC、1 file)

- [ ] T021 [P] [US2] 對照 data-model.md E2 驗證 `rust-api/server/api/src/admin/sys_system_manage_api.rs` `list_menu_for_systemmanage` 改動正確:
  - return type 已從 `Res<Vec<SystemManageMenuOutput>>` 改為 `Res<PaginatedData<SystemManageMenuOutput>>`
  - body:`let raw = service.get_menu_list().await?; let records: Vec<SystemManageMenuOutput> = raw.into_iter().map(Into::into).collect(); let total = records.len() as u64; Ok(Res::new_data(PaginatedData { current: 1, size: total, total, records }))`
  - F7 既有 4 個其他 handler(`list_roles` / `list_all_roles` / `list_users` / `tree_menu`)不動(per FR-007)
  - F7 既有 `SystemManageMenuOutput` Output DTO 不動(per FR-008)
  - inline comment 標明 F7 follow-up paginated 修正
  - 並行於 T020(獨立 file);若改動不存在或不符 → 依 data-model E2 修正

---

## Phase 5: Shared Build + Acceptance(US1 + US2 共用)

### Build

- [ ] T030 **C-V1** rebuild rust-api docker image(per quickstart Step 2):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 exit 0 + warm ~2-3 min(per NFR-005);若 fail → check `SysAuthService` / `PaginatedData` import(per research R-Q3、預期既有)。接 T020 + T021 全 done

- [ ] T031 restart rust-api(force-recreate、其他 service 不動):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5
  ```
  預期 rust-api 重啟 healthy + 其他 5 service 仍 healthy。接 T030

### US1 acceptance(對齊 contracts/verification-commands.md C-V2-C-V4)

- [ ] T032 [US1] **C-V2 + C-V3 + C-V4** inline(per contracts/verification-commands.md):Soybean / Administrator / GeneralUser 三 user login → curl `/route/getUserRoutes` → 各 HTTP 200 + envelope code:0;Soybean(C-V2)額外驗 `data.routes` len=4 + `data.home="home"` + manage 含 4 children。預期 3/3 user 全 HTTP 200(非 HTTP 500 `Missing request extension`)。接 T031

### US2 acceptance(對齊 C-V5)

- [ ] T033 [US2] **C-V5** inline(per contracts/verification-commands.md):Soybean access_token → curl `/systemManage/getMenuList/v2` → 預期 envelope code:0 + `data` 為 dict 含 `{current, size, total, records}` 4 key、`current=1`、`size=total=records.len`、`records.len` ≥ 9、`records[0]` 22 field（menuType "1"/"2" / parentId String / buttons null）。接 T031、可平行於 T032

### Shared CDP smoke acceptance(對齊 C-V6 + C-V7 + C-V8)

- [ ] T034 **C-V6 + C-V7 + C-V8 CDP browser smoke test 3 view**(per spec US2.2 + research R-Q3):
  ```bash
  # 沿用 F7 CDP demo node script setup:WSL2 host Edge 148 + --remote-debugging-port=9229
  # node script:clear storage → POST login + inject SOY_token → Fetch.requestPaused 攔
  #   /auth/getUserInfo 注入 R_SUPER/R_ADMIN role alias(demo-only workaround)
  #   → navigate /manage/menu + /manage/user + /manage/role → 各 count DOM .n-data-table-tr
  ```
  預期 3 view 全 PASS:`/manage/menu` row ≥ 5(C-V6、不再「无数据」)+ `/manage/user` row ≥ 3(C-V7)+ `/manage/role` row ≥ 3(C-V8)。
  若 CDP setup fail / Edge 不可達 → graceful degradation(per spec A-005 + R-3):C-V5 curl paginated shape PASS 即視 US2 核心通過、C-V6-8 標 deferred manual。接 T032 + T033

### Zero-regression(對齊 C-V9 + C-V10)

- [ ] T035 [P] **C-V9 three-side scope verify**(per contracts):
  ```bash
  git diff HEAD -- base-web/src/ | wc -l                                    # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l             # 預期 0
  (cd rust-api && git diff HEAD --stat)                                      # 預期 2 file ~25 LOC
  (cd rust-api && git diff HEAD --stat -- migration/)                        # 預期 空
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l  # 預期 0
  git status --short
  ```
  預期:base-web/nestjs/docker-compose/migration 各 0 diff + rust-api 2 file(`router_initialization.rs` + `sys_system_manage_api.rs`)+ outer scope（CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + docs/superpowers/023-* + rust-api gitlink + specs/023-*）。接 T020+T021 後、可平行於 T032-T034

- [ ] T036 [P] **C-V10 W-FA1 stack regression**:`docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 service healthy + rust-api uptime 較短剛 recreated + migration exited 0)。接 T031、可平行於 T032-T035

**Checkpoint**:Phase 5 完成 — C-V1~C-V10 acceptance 10/10 PASS(C-V6-8 可 graceful degradation)。

---

## Phase 6: Documentation Update

- [ ] T040 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-019):
  - Current Focus 更新(Phase / Active feature 改 F7.1、F7.1 outer commit pending push)
  - 已完成里程碑加 F7.1 條目(對齊 F7 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - 加 F7.1 為 F7 acceptance 完成度補完說明(Application Phase 3 進度 2/3 不變、F8 仍待)
  - 列 F7.1 後 next-step:F8 / F12 / W-F11 / W-F6b 並行候選 + F7.2 role-code-alignment follow-up

- [ ] T041 [P] **doc grep verify**:
  ```bash
  grep -cE "F7\.1|fix-route-getuserroutes-wiring" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F7.1" docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期:≥ 3 match、INTEGRATION-CHECKLIST.md 多處 F7.1 引用(Current Focus + 已完成里程碑)

**Checkpoint**:Phase 6 完成 — doc 改動到位、Phase 7 commit。

---

## Phase 7: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.1/F10.2/F11/F9/F7 慣例)

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 2 file modified
  git add server/initialize/src/router_initialization.rs \
          server/api/src/admin/sys_system_manage_api.rs
  git commit -m "$(cat <<'EOF'
  fix(rust-api): F7.1 修 /route/getUserRoutes wiring + menu paginated wrapper

  F7 manage-crud-alignment merge 後 CDP demo 過程 catch 出 2 個 backend
  acceptance gap、F7.1 follow-up 修齊。

  US1 P1 — F5.1 wiring bug fix:
  init_protected_menu_router 的 merge_router! 只注入 SysMenuService 一個
  Extension、但 mount 的 /getUserRoutes handler(SysAuthenticationApi::
  get_user_routes)期 Extension<Arc<SysAuthService>> → HTTP 500「Missing
  request extension」。改 F9 R-③ multi-service manual layer pattern(對齊
  init_authorization_router):.layer(Extension(Arc<SysMenuService>)) +
  .layer(Extension(Arc<SysAuthService>)) + apply_layers(Services::None ...)。

  US2 P2 — menu paginated wrapper fix:
  list_menu_for_systemmanage 回 Res<Vec<SystemManageMenuOutput>> 扁平 array、
  base-web Api.SystemManage.MenuList = PaginatingQueryRecord<Menu> 預期
  paginated → base manage/menu view 顯示「无数据」。改 return
  Res<PaginatedData<SystemManageMenuOutput>>、current=1 / size=total=
  records.len()(rust 端不分頁、全集當 1 頁)、對齊 F7 既有 list_roles/
  list_users paginated handler pattern。

  改動範圍(rust-api、2 file ~25 LOC):
  - server/initialize/src/router_initialization.rs(~15 LOC、US1)
  - server/api/src/admin/sys_system_manage_api.rs(~10 LOC、US2)

  Acceptance:C-V1 image rebuild OK / C-V2-4 三 user /route/getUserRoutes
  HTTP 200 + envelope code:0(非 HTTP 500)/ C-V5 getMenuList/v2 paginated
  envelope 4 key / C-V6-8 CDP smoke manage/menu+user+role 3 view render /
  C-V9 三邊 scope(base-web/nestjs/docker-compose/migration 0 diff +
  rust-api 2 file)/ C-V10 stack 6 healthy = **10/10 PASS**(對齊 spec
  FR-016 NFR-004、無 unit test per FR-015)。

  base-web + nestjs fork 三邊零改動(per FR-010 + FR-011);無 migration 改
  (per FR-013);無 docker-compose.yml 改;無 Casbin policy 改(per FR-009)。

  Constitution Check 3 PASS / 1 N/A(Principle II soft-delete/audit、F7.1
  無 DB 寫入)/ 0 violation。

  F7.1 解 F7 acceptance C-V10 deferred 的 CDP smoke baseline、解鎖 F8
  assign-users;role code mismatch(R_SUPER/R_ADMIN vs ROLE_*)留 F7.2
  role-code-alignment follow-up。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit(rev1-admin-root via 023 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + brainstorm doc + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md + rust-api SHA pin、**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 023-fix-route-getuserroutes-wiring
  git status --short

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F7 pattern)
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md \
          docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md \
          .specify/feature.json rust-api specs/023-fix-route-getuserroutes-wiring/

  git commit -m "$(cat <<EOF
  fix(spec): F7.1 fix-route-getuserroutes-wiring — F5.1 wiring + menu paginated

  outer side of F7.1 — rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit
  為 spec docs(specs/023-fix-route-getuserroutes-wiring/ 8 file)+ brainstorm doc
  + INTEGRATION-CHECKLIST.md F7.1 row + rust-api SHA pin + CLAUDE.md SPECKIT marker。

  改動範圍(outer):
  - CLAUDE.md SPECKIT marker 區間自動更新(Active feature 改 F7.1 023-*)
  - docs/INTEGRATION-CHECKLIST.md F7.1 row + Current Focus
  - docs/superpowers/023-feature-fix-route-getuserroutes-wiring.md(brainstorm doc)
  - .specify/feature.json 指 specs/023-fix-route-getuserroutes-wiring
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**(對比 F10.1);**無 migration 改**(對比 F7)。

  Acceptance(走完 10/10、對齊 spec NFR-004):見 rust-api ${RUST_API_SHORT_SHA}
  commit body 詳細。

  Constitution Check 3 PASS / 1 N/A / 0 violation;base-web + nestjs fork
  兩邊 zero diff;W-FA1 stack 6 service healthy 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F7/F9/F11 等 pattern、merge 後再補。

  F7.1 為 F7 manage-crud-alignment 的 CDP demo 過程 catch 出 backend acceptance
  gap 的 follow-up 修補;F7.1 解 F7 acceptance C-V10 deferred CDP smoke baseline、
  解鎖 F8;role code mismatch 留 F7.2 role-code-alignment follow-up。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F7.1 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push outer 023-fix-route-getuserroutes-wiring 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 023-fix-route-getuserroutes-wiring
    git switch rev1-admin-root
    git merge --no-ff 023-fix-route-getuserroutes-wiring -m "Merge branch '023-fix-route-getuserroutes-wiring' into rev1-admin-root: F7.1 完成"
    # SHA fill follow-up commit(對齊 F7/F9/F11 pattern)
    OUTER_SHA=$(git log --oneline | grep "fix(spec): F7.1" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F7.1 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```

**Checkpoint**:Phase 7 完成 — F7.1 落地、兩段式 commit 紀律遵守、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-7 | — |
| Phase 2 Foundational(T010) | Phase 5(stack 必須先起) | Phase 1 |
| Phase 3 US1 impl(T020) | Phase 5 build | Phase 1 |
| Phase 4 US2 impl(T021) | Phase 5 build | Phase 1;可平行於 T020 |
| Phase 5 build(T030+T031) | Phase 5 acceptance + 6 + 7 | T020 + T021 |
| Phase 5 acceptance(T032-T036) | Phase 6 | T031(C-V9 T035 接 T020+T021 後) |
| Phase 6 Doc(T040-T041) | Phase 7 | Phase 5 全 PASS |
| Phase 7 Commit(T100-T102) | — | 全 6 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):rust source 1 file 改(`router_initialization.rs`)+ acceptance C-V2-C-V4
- US2(P2):rust source 1 file 改(`sys_system_manage_api.rs`)+ acceptance C-V5;與 US1 獨立 file、可平行 impl
- Shared:C-V1 build + C-V6-C-V8 CDP smoke + C-V9-C-V10 regression 共用

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P] 並行
- **Phase 3+4**:T020(US1)+ T021 [P](US2)獨立 file、可並行 impl
- **Phase 5**:T030→T031 序列(build→restart);T032(US1 acc)+ T033(US2 acc)+ T035 [P](scope)+ T036 [P](stack)接 T031 後可並行;T034(CDP smoke)接 T032+T033
- **Phase 6**:T040 序列、T041 [P]
- **Phase 7**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 `/route/getUserRoutes` wiring 修復、F7 acceptance C-V10 deferred CDP smoke baseline 接通;US2 + shared acceptance + doc + commit 為驗證 + 收尾。

**MVP commit policy**:推薦走完整 Phase 1-7 一次到位(對齊 F5.1/F6/F10.1/F10.2/F11/F9/F7 同 session 模式)、不 US1-only commit。

**全 17 task 預估時間**:25-40 分鐘(rust image rebuild 占 2-3 min、cargo unit test 跳過 per FR-015、curl acceptance 各 ~10s、CDP smoke ~10-20s/view;impl task 僅 2 個 in-place 驗證)。

**Critical path**:T001 → T002 → T010 → T020/T021(並行)→ T030 → T031 → T032/T033/T035/T036(並行)→ T034 → T040/T041(並行)→ T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2] | ✓(T020 [US1] / T021 [US2] / T032 [US1] / T033 [US2]) |
| Setup / Foundational / shared / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(T002/T021/T035/T036/T041 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
