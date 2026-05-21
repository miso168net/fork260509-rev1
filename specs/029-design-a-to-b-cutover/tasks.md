---
description: "Task list for F14 — design-a-to-b-cutover implementation"
---

# Tasks: F14 — design-a-to-b-cutover

**Input**: Design documents from `/specs/029-design-a-to-b-cutover/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F14 為 **設定拔除型** feature(刪 nginx block / 移除 compose service / 刪 script / 改 doc)— 無新程式邏輯;R3 為 error code 常數登記、無可獨立測之純函式面。比照 F8 / W-F5/6/7 precedent **不寫 rust unit test**(per spec FR-027)。
- **Acceptance**:curl + psql + `docker compose exec` + `nginx -t` + `grep` + `git diff`(per spec FR-027)→ 對齊 **11 個 C-V**(C-V1~C-V11)+ C-V12 base-web CDP smoke best-effort(per contracts/verification-commands.md)。

**Organization**:F14 = 3 user story(US1 nestjs 退場 P1 MVP / US2 R3 code namespace P2 / US3 R4+doc 收尾 P3)。Setup(2)+ Foundational(1)+ US1(5)+ US2(2)+ US3(7)+ shared build/acceptance(12)+ 兩段式 Commit(3)= **32 task**。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1/US2/US3 標籤;Setup / Foundational / shared build/acceptance / Commit 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Stage 1 — rust-api worktree(改、R3):**
  - 改:`rust-api/server/core/src/web/code.rs`(加 5 個 `CODE_USER_*` 常數)
  - 改:`rust-api/server/service/src/admin/errors/sys_user_error.rs`(`fn code()` 改引用常數)
- **Stage 2 — outer(改 / 刪 / 新增):**
  - 改:`deploy/front-nginx/conf.d/default.conf`(刪 2 block)/ `default.conf.prod`(刪 1 block)/ `deploy/front-nginx/README.md`
  - 改:`docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`(移除 nestjs)
  - 刪:`deploy/build-nestjs.sh`
  - 新增:`deploy/secrets/cleanup_database_url.txt.example`
  - 改:`deploy/secrets/refresh_token_secret.txt.example`(首行註解)/ `CLAUDE.md` §5.2/§5.2.1 / `docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md` / `docs/INTEGRATION-DESIGN-B-RUST-ONLY.md` / `docs/INTEGRATION-CHECKLIST.md`
- **不動**:`base-web/` 全程不動(per FR-023);`refresh_token_secret` secret 條目本身、Casbin redis pub-sub channel、rust refresh endpoint、DB/migration、`fork260509-soybean-admin-nestjs/` 源碼目錄
- **Acceptance test 執行**:outer repo root host-side bash、**dev stack**;refresh 經 front-nginx `:11080`(F14 後 routing 指 rust)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `029-design-a-to-b-cutover` + rust-api worktree branch = `rev1-admin-rust-api`、F13 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F13' | head -2 && (cd rust-api && git branch --show-current)`(預期 outer branch=029-*、rust-api branch=rev1-admin-rust-api、history 含 F13 merge `4e9cf07`)

- [ ] T002 [P] 確認 F14 acceptance 前置就位,執行 `docker images rust-api:rev1-admin-rust-api -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format '{{.Service}} {{.State}}'`(預期 rust-api image SHA 非空;dev stack 現況記錄 — F14 拔除前可能含 nestjs)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 F14 拔除標的存在於 research 指出的位置(拔除前 baseline)。

- [ ] T010 確認 F14 拔除標的就位,執行:
  ```bash
  grep -nc "TRANSITIONAL" deploy/front-nginx/conf.d/default.conf          # 預期 4(2 block × BEGIN+END)
  grep -nc "TRANSITIONAL" deploy/front-nginx/conf.d/default.conf.prod      # 預期 2(1 block)
  grep -n "nestjs:" docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml
  ls deploy/build-nestjs.sh
  grep -nE "=> *100[1-5]" rust-api/server/service/src/admin/errors/sys_user_error.rs   # 預期 5 行 inline literal
  ls deploy/secrets/cleanup_database_url.txt.example 2>&1 || echo "(缺 — R4 待補)"
  grep -rn "pub async fn refresh_token" rust-api/server/service/src/admin/sys_auth_service.rs  # F13 endpoint 在
  ```
  預期:`default.conf` 2 個 TRANSITIONAL block + `default.conf.prod` 1 個 + nestjs service block 3 檔在 + `build-nestjs.sh` 在 + `sys_user_error.rs` 5 個 inline `1xxx` + `cleanup_database_url.txt.example` 缺 + F13 `refresh_token` service method 在 — per research R-Q1~R-Q3

---

## Phase 3: User Story 1 — nestjs 退場、refresh 由 rust 經 nginx 服務(Priority: P1)🎯 MVP

**Goal**:刪除 nginx TRANSITIONAL block + 從 docker-compose 移除 nestjs service + 刪 W-FA3 build script — `/api/auth/refreshToken` 改由 rust 經 nginx 服務,nestjs 退出運行 stack。

**Independent Test**:刪 block + 移除 service 後起 dev stack(不含 nestjs)→ `nginx -t` OK、stack 無 nestjs healthy → 經 front-nginx `/api/auth/login` 取 token → `/api/auth/refreshToken` 回 rust F4 envelope `code:0` + 新 token pair。

### US1 implementation — nestjs 退場(outer)

- [ ] T020 [P] [US1] 依 data-model E1 改 `deploy/front-nginx/conf.d/default.conf`:刪 2 個 TRANSITIONAL block(80 server 行 38-48 + 443 server 行 82-92),用 `sed -i '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' deploy/front-nginx/conf.d/default.conf`;刪後確認 `/api/auth/refreshToken` 落到既有 `location /api/`、無 `nestjs` / `$nestjs_upstream` 殘留(per research R-Q1/R-Q6)

- [ ] T021 [P] [US1] 依 data-model E1 改 `deploy/front-nginx/conf.d/default.conf.prod`:刪 1 個 TRANSITIONAL block(443 server 行 52-62),用 `sed -i '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d' deploy/front-nginx/conf.d/default.conf.prod`;**保留** http-context resolver(line 3、W-F11 `upstream rust_api ... resolve` 用、per research R-Q1/R-Q6)

- [ ] T022 [US1] 依 data-model E2 改 `docker-compose.yml`:移除整個 `nestjs:` service block(行 240-291);**保留** top-level `secrets:` 的 `refresh_token_secret` 條目 + `rust-api` service 對它的引用(per research R-Q2、FR-010);修正檔頭過時 service 數註解(行 4「5 service stack」→ F14 後 8 service)

- [ ] T023 [P] [US1] 依 data-model E2 改 `docker-compose.dev.yml`(移除 nestjs stanza 行 28-30 + 檔頭 track-a 字樣)+ `docker-compose.prod.yml`(移除 nestjs stanza 行 21-23 + 檔頭 track-a 字樣);接 T022、可平行於 T020/T021

- [ ] T024 [P] [US1] 依 data-model E3 刪除 `deploy/build-nestjs.sh`(W-FA3 build script);可平行

---

## Phase 4: User Story 2 — legacy error code 收進 F4 namespace(Priority: P2)

**Goal**:`sys_user_error.rs` 的 5 個 `1xxx` legacy error code 登記進 `code.rs` F4 namespace 表;數值與行為零改變。

**Independent Test**:grep `code.rs` 確認 5 個 `CODE_USER_*` 常數;grep `sys_user_error.rs` 確認改引用常數、無殘留 inline `1xxx`;rust-api image rebuild build OK。

### US2 implementation — R3(rust-api worktree)

- [ ] T030 [P] [US2] 依 data-model E4-a 改 `rust-api/server/core/src/web/code.rs`:新增 5 個 `pub const CODE_USER_*: u16` 常數(`CODE_USER_NOT_FOUND=1001` / `CODE_USER_WRONG_PASSWORD=1002` / `CODE_USER_AUTHENTICATION_FAILED=1003` / `CODE_USER_USERNAME_ALREADY_EXISTS=1004` / `CODE_USER_INVALID_STATUS=1005`),命名 + 排版對齊既有 `CODE_*` group 慣例;per research R-Q3

- [ ] T031 [US2] 依 data-model E4-b 改 `rust-api/server/service/src/admin/errors/sys_user_error.rs`:加 `use server_core::web::code;`、`fn code(&self) -> u16` 內 5 個 inline `1xxx` literal 改引用對應 `code::CODE_USER_*` 常數;**數值不變、零行為改變**(per FR-015);接 T030

---

## Phase 5: User Story 3 — secret 範本補齊 + 設計文件收尾(Priority: P3)

**Goal**:補 `cleanup_database_url.txt.example`(R4);清理 `CLAUDE.md` / `README.md` 的 nestjs 引用;DESIGN-A doc 標註已封存、DESIGN-B doc 標註現行設計;`INTEGRATION-CHECKLIST.md` 更新。

**Independent Test**:`deploy/secrets/` 每個 secret 都有 `.txt.example`;DESIGN-A/B doc 檔頭狀態可分辨;`INTEGRATION-CHECKLIST.md` F14 row + Current Focus 更新。

### US3 implementation — R4 + doc 收尾(outer)

- [ ] T040 [P] [US3] 依 data-model E5 新增 `deploy/secrets/cleanup_database_url.txt.example`:格式對齊既有 6 個 `.txt.example`(單行 placeholder、無註解);`.gitignore` 既有 `!/deploy/secrets/*.txt.example` 規則自動追蹤

- [ ] T041 [P] [US3] 依 data-model E2 改 `deploy/secrets/refresh_token_secret.txt.example`:首行註解「for nestjs」改指 rust-api `APP_JWT_REFRESH_SECRET_FILE`(secret 本身保留、per research R-Q2 gotcha)

- [ ] T042 [P] [US3] 依 data-model E6 改 `deploy/front-nginx/README.md`:移除 line 86 nestjs/TRANSITIONAL boundary note(或改為「TRANSITIONAL block 已於 F14 移除」歷史註記);per research R-Q5

- [ ] T043 [P] [US3] 依 data-model E6 改 `CLAUDE.md` §5.2 + §5.2.1:§5.2 port 表移除 nestjs `:11082` 列 + 「目前現況」描述移除 DESIGN-A track-a 變體;§5.2.1 移除整段「DESIGN-A 路線 dev」(`--profile track-a` 啟動變體 + `build-nestjs.sh` + nestjs refreshToken 驗命令、行 165-184 區域),只餘 dev / prod baseline / prod+acme 三模式;per research R-Q4(§10 SPECKIT marker 已由 `/speckit-plan` 更新、不在此 task)

- [ ] T044 [P] [US3] 依 data-model E6 改 `docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`:檔頭 line 1 後插入 `>` blockquote「**[F14 已封存]** DESIGN-A 過渡期結束(F14 cutover 完成);此文件保留為歷史參考,現行架構見 DESIGN-B」;per research R-Q7

- [ ] T045 [P] [US3] 依 data-model E6 改 `docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`:檔頭 line 1 後插入 `>` blockquote「**[F14 現行設計]** DESIGN-A cutover 完成(F14);本檔為 rev1 現行架構、nestjs 已完全退場」;per research R-Q7

- [ ] T046 [US3] 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-020):
  - Application Phase 5 Roadmap 表 F14 row 的 spec / plan / tasks / impl 欄推進
  - 已完成里程碑加 F14 條目(對齊 F12/F13 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - Current Focus 更新(Phase / Active feature 改 F14 落地、DESIGN-A §6.1 全 14 feature 完成、DESIGN-B 形態生效)
  - 「跨 feature 待驗證項」的 R3 / R4 待辦項勾掉(`[ ]`→`[x]`、註記 F14 已處理)

---

## Phase 6: Shared Build + Acceptance

### Build

- [ ] T060 **C-V1** rebuild rust-api docker image(R3 改 `code.rs`):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 build exit 0。若 fail → check `code.rs` 5 常數語法 / `sys_user_error.rs` 的 `use server_core::web::code;`。接 T030-T031

- [ ] T061 **C-V2** 起 dev stack(不含 nestjs、不帶 `--profile track-a`):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"
  ```
  預期:啟動 service 不含 nestjs、postgres/redis/rust-api/base-web/front-nginx 全 healthy + migration exited 0。接 T060 + T020-T024

### Acceptance(對齊 contracts/verification-commands.md C-V3~C-V12)

- [ ] T062 [US1] **C-V3** nginx TRANSITIONAL block 已刪、設定有效:`grep -c TRANSITIONAL` 對 `default.conf` + `default.conf.prod` 皆 0;`grep -rn nestjs deploy/front-nginx/conf.d/` 無輸出;`docker compose exec front-nginx nginx -t` 回 syntax OK。接 T020/T021/T061

- [ ] T063 [US1] **C-V4** refresh 經 nginx 路由到 rust(核心):login 經 front-nginx `:11080/api/auth/login` 取 refresh token → `POST :11080/api/auth/refreshToken` → 驗回 HTTP 200 + rust F4 envelope `{code:0, data:{token, refreshToken}}`、新 `refreshToken` ≠ 舊值。接 T061/T062

- [ ] T064 [US1] **C-V5** login→refresh 循環 + sys_tokens 輪替:承 T063 → psql 驗舊 refresh token row status=`used`、新 row status=`unused`。接 T063

- [ ] T065 [P] [US1] **C-V6** `--profile track-a` 不再帶起 nestjs:`docker compose ... --profile track-a config --services` 清單不含 `nestjs`。接 T022-T023、可平行

- [ ] T066 [P] [US2] **C-V7** R3 error code 登記進 namespace:`grep CODE_USER_ code.rs` 有 5 常數;`grep code::CODE_USER_ sys_user_error.rs` 有 5 引用;`grep '=> *100[1-5]' sys_user_error.rs` 無殘留 inline literal。接 T030-T031、可平行

- [ ] T067 [P] [US3] **C-V8** R4 secret 範本:`ls deploy/secrets/cleanup_database_url.txt.example` 存在;`git ls-files` 確認 git-tracked;`ls deploy/secrets/*.txt.example | wc -l` = 8。接 T040、可平行

- [ ] T068 [P] [US1] **C-V9** build script 已刪:`ls deploy/build-nestjs.sh` 不存在;`git ls-files deploy/build-nestjs.sh` 無輸出。接 T024、可平行

- [ ] T069 [P] [US3] **C-V10** 設計文件檔頭狀態:`head -3 docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md` 含「[F14 已封存]」;`head -3 docs/INTEGRATION-DESIGN-B-RUST-ONLY.md` 含「[F14 現行設計]」。接 T044/T045、可平行

- [ ] T070 [P] **C-V11** 三邊 scope verify:
  ```bash
  git diff HEAD -- base-web/ | wc -l                                          # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l               # 預期 0
  (cd rust-api && git diff HEAD -- migration/ | wc -l)                         # 預期 0
  (cd rust-api && git diff HEAD --stat)                                        # 預期 2 檔 code.rs + sys_user_error.rs
  grep -c "refresh_token_secret" docker-compose.yml                            # 預期 > 0(未誤刪)
  git status --short
  ```
  預期:base-web / nestjs fork / `rust-api/migration/` 各 0 diff;rust-api scope = 2 檔;`refresh_token_secret` 仍在;Casbin channel 未動。接 T020-T046、可平行

- [ ] T071 [P] **C-V12(best-effort)** base-web CDP SPA silent-refresh smoke:CDP 控制 Edge 開 base-web、login、觸發 silent refresh、確認成功不被登出。Edge debug port 不通則記 deferred manual-eyeball(比照 F7 C-V10)。非 go/no-go gate。可平行

**Checkpoint**:Phase 6 完成 — C-V1~C-V11 acceptance 11/11 PASS(+ C-V12 best-effort);測試操作(login token)無 seed 污染。

---

## Phase 7: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F12/F13 慣例)

### Stage 1 — worktree commit(rust-api、R3)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 2 檔 modified(code.rs + sys_user_error.rs)
  git add server/core/src/web/code.rs server/service/src/admin/errors/sys_user_error.rs
  git commit -m "refactor(rust-api): F14 R3 — 5 個 1xxx user error code 登記進 code.rs F4 namespace"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit(rev1-admin-root via 029 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + nginx + compose×3 + 刪 build-nestjs.sh + R4 + CLAUDE.md + 3 份 docs + rust-api SHA pin;**無 migration**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 029-design-a-to-b-cutover
  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
  git add deploy/ docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml \
          CLAUDE.md docs/ .specify/feature.json rust-api specs/029-design-a-to-b-cutover/
  git commit -m "feat(spec): F14 design-a-to-b-cutover — nestjs 退場 + spec docs"
  ```
  > `deploy/build-nestjs.sh` 的刪除由 `git add deploy/` 帶入;brainstorm doc `029-feature-*.md` 已於前置 commit 落、不重複 add。outer + merge SHA 留 `<sha-pending>`、merge 後 T102 補

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F14 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 029-design-a-to-b-cutover
    git switch rev1-admin-root
    git merge --no-ff 029-design-a-to-b-cutover -m "Merge branch '029-design-a-to-b-cutover' into rev1-admin-root: F14 完成"
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F14 design-a-to-b-cutover" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F14 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```
  - F14 完成後順手更新 `project_nestjs_transitional` memory(nestjs 已退場、非 git scope)

**Checkpoint**:Phase 7 完成 — F14 落地、兩段式 commit 紀律遵守、base-web + nestjs fork 零改動、push 等 user 同意、**DESIGN-A §6.1 全 14 application feature(F1–F14)收尾、DESIGN-B 形態正式生效**。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-7 | — |
| Phase 2 Foundational(T010) | Phase 3-5 | Phase 1 |
| Phase 3 US1(T020-T024) | Phase 6 build/acceptance | Phase 2 |
| Phase 4 US2(T030-T031) | Phase 6 build/acceptance | Phase 2 |
| Phase 5 US3(T040-T046) | Phase 6 acceptance | Phase 2 |
| Phase 6 build(T060+T061) | Phase 6 acceptance + Phase 7 | T020-T046 |
| Phase 6 acceptance(T062-T071) | Phase 7 | T061 |
| Phase 7 Commit(T100-T102) | — | 全 6 phase PASS |

**Story 獨立性**:US1(nestjs 退場、純 outer)/ US2(R3、rust-api worktree)/ US3(R4+doc、純 outer)三者**檔案不重疊、可獨立並行實作**;唯 Phase 6 build 需 US2(R3 改 code.rs)、acceptance 需三者全到位 + stack 起。

**內部依賴**:T020/T021/T024 獨立 [P];T022→T023 序列(同 compose 體系);T030→T031 序列(R3);T040-T045 獨立 [P]、T046 序列(INTEGRATION-CHECKLIST 集中改);T060→T061 序列(build→stack)。

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 3 US1**:T020 + T021 + T024 [P];T022→T023 序列
- **Phase 4 US2**:T030→T031 序列
- **Phase 5 US3**:T040 + T041 + T042 + T043 + T044 + T045 [P];T046 序列
- **跨 story**:US1 / US2 / US3 三 story 可並行(檔案不重疊)
- **Phase 6**:T060→T061 序列;T062→T063→T064 序列鏈;T065/T066/T067/T068/T069/T070/T071 [P]
- **Phase 7**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 nestjs 退場、`/api/auth/refreshToken` 經 nginx 由 rust 服務(cutover 本體)。US2(R3)+ US3(R4+doc)為附帶清理、可在 MVP 後增量交付,但 F14 推薦走完整 Phase 1-7 一次到位(對齊 F12/F13 同 session 模式)。

> ⚠️ **Time gate**:F14 屬 DESIGN-A §6.1 Phase 5(P5),依 §6.2「過渡橋 F10 在 DESIGN-A 形態運行 N 週驗證」後才應 `/speckit-implement`。tasks.md 為設計先行產出;implement 時機由 time gate 決定。

**全 32 task 預估時間**:25-40 分鐘(無新程式邏輯 — 多為 sed / 編輯 / 刪檔;rust image rebuild 占 2-3 min(R3 改 1 source file、warm cache);acceptance C-V 為 curl/grep/psql ~數分鐘)。

**Critical path**:T001 → T002 → T010 →(US1 T020-T024 / US2 T030-T031 / US3 T040-T046 三路並行)→ T060 → T061 → T062 → T063 → T064 →(T065-T071 並行)→ T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1]/[US2]/[US3] | ✓(T020-T024 US1 / T030-T031 US2 / T040-T046 US3 / 部分 acceptance 帶 story 標籤) |
| Setup / Foundational / build / Commit 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓ |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或(time gate 通過後)`/speckit-implement`**。
