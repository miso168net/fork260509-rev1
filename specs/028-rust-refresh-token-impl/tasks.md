---
description: "Task list for F13 — rust-refresh-token-impl implementation"
---

# Tasks: F13 — rust-refresh-token-impl

**Input**: Design documents from `/specs/028-rust-refresh-token-impl/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F13 為 **wiring feature**(新增 endpoint、複用既有元件)— 主流程為 JWT crypto + DB IO 邊界、無顯著純函式可測面;比照 F8 wiring precedent **不寫 rust unit test**(per spec FR-023 「MAY」、plan Testing)。若 implement 階段發現 `validate_refresh_token` 析出可獨立判斷的純面則 MAY 補 `#[cfg(test)]`、非必要。
- **Acceptance**:curl + psql + `docker compose exec` / `run`(per spec FR-023)→ 對齊 **10 個 C-V**(per contracts/verification-commands.md C-V1~C-V10)。

**Organization**:F13 為單一 user story feature(US1 P1)、Setup(2)+ Foundational(1)+ US1 impl(5)+ shared build/acceptance(10)+ Doc(2)+ 兩段式 Commit(3)= **23 task**。實際 impl task 5 個(1 DTO + 1 驗證函式 + 1 service method + 1 handler + 1 router mount、皆改既有檔)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Worktree(改、`rust-api/`、皆既有檔):**
  - 改:`rust-api/server/model/src/admin/input/sys_authentication.rs`(加 `RefreshTokenInput` DTO)
  - 改:`rust-api/server/model/src/admin/input/mod.rs`(re-export `RefreshTokenInput`)
  - 改:`rust-api/server/core/src/web/jwt.rs`(加 `validate_refresh_token` 函式)
  - 改:`rust-api/server/service/src/admin/sys_auth_service.rs`(加 `refresh_token` service method + 輪替 transaction)
  - 改:`rust-api/server/api/src/admin/sys_authentication_api.rs`(加 `refresh_token_handler`)
  - 改:`rust-api/server/router/src/admin/sys_authentication_route.rs`(`init_authentication_router` 加 `/refreshToken` mount)
- **Outer(改):**
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F13 row + Current Focus + 完成里程碑)
  - 改(已由 `/speckit-plan` 完成):`CLAUDE.md` §10 SPECKIT marker(指 028)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
  - 已 commit(brainstorm 階段、`6742482`):`docs/superpowers/028-feature-rust-refresh-token-impl.md`
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-020);rust-api 既有 `/auth/login` token issuance 路徑不動(per FR-021)、`AccessTokenEvent` 不改;**無 migration、無 DB schema 改、不碰 `casbin_rule`**
- **不動**:`docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml`、`deploy/front-nginx/`(nginx routing 切換為 F14、per FR-018 / FR-019)
- **Acceptance test 執行**:outer repo root host-side bash、**dev stack**;refresh 端點直連 rust `:11081`(nginx `/api/auth/refreshToken` 仍 → nestjs、F14 才切)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `028-rust-refresh-token-impl` + rust-api worktree branch = `rev1-admin-rust-api`、F10/F10.1/F10.2 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F10' | head -4 && (cd rust-api && git branch --show-current)`(預期 outer branch=028-*、rust-api branch=rev1-admin-rust-api、history 含 F10 merge `8f0e84c` / F10.1 `48b70e6` / F10.2 `851ec79`)

- [ ] T002 [P] 確認 F13 acceptance 前置就位,執行 `docker images rust-api:rev1-admin-rust-api -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format '{{.Service}} {{.State}}'`(預期 rust-api image SHA 非空 + dev stack service 在;若 stack 未起見 T031)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 F13 重用的 F10/F10.1/F10.2 + login 既有元件就位(F13 全部重用、僅新增 `validate_refresh_token` 一個函式)。

- [ ] T010 確認 F13 重用的既有元件存在,執行:
  ```bash
  grep -rn "pub async fn generate_auth_output\|fn get_user_roles" rust-api/server/service/src/admin/sys_auth_service.rs
  grep -rnE "pub async fn generate_refresh_token|struct RefreshClaims|pub async fn validate_token" rust-api/server/core/src/web/jwt.rs
  grep -rn "REFRESH_KEYS" rust-api/server/global/src/global.rs
  grep -rn "pub fn find_active" rust-api/server/model/src/admin/facade/sys_user.rs
  grep -rnE "enum TokenStatus|fn can_refresh" rust-api/server/constant/src/definition/consts.rs
  grep -rn "pub async fn handle" rust-api/server/service/src/admin/events/access_token_event.rs
  ```
  預期:`generate_auth_output` + `get_user_roles` 存在 + `generate_refresh_token` + `RefreshClaims` + `validate_token` 存在(F13 加對稱的 `validate_refresh_token`)+ `REFRESH_KEYS` 存在(F10.1)+ `sys_user::find_active` 存在 + `TokenStatus` enum + `can_refresh()` 存在(F10.2)+ `AccessTokenEvent::handle`(sys_tokens INSERT 參考、不改)— per research R-Q1~R-Q7

---

## Phase 3: User Story 1 — 已登入使用者以 refresh token 換發新 token(Priority: P1)🎯 MVP

**Goal**:rust-api 新增 `POST /auth/refreshToken` public endpoint — 驗 refresh token(JWT 簽章 + DB status)→ 完整輪替(核發新 access + 新 refresh、舊 `sys_tokens` row 標 `used`、單一 transaction)→ 回 `{token, refreshToken}`;新 access token 身分於 refresh 時重查 user 重建。

**Independent Test**:直連 rust `:11081` `/auth/login` 取 refresh token → `POST /auth/refreshToken` 驗回新 token pair → psql 驗舊 row→`used` + 新 row `unused` → 新 access token 打受保護端點通 → 舊 refresh token 重用被拒。

### US1 implementation — rust refresh endpoint(rust-api worktree)

- [ ] T020 [P] [US1] 依 data-model.md E1 改 `rust-api/server/model/src/admin/input/sys_authentication.rs` + `input/mod.rs`:
  - 加 `RefreshTokenInput` struct — 單一欄位 `refresh_token: String`、camelCase 序列化(對齊 base-web 送 `{"refreshToken":"..."}`)、`#[validate(...)]` non-empty(走 `ValidatedForm` → 缺欄位/空值 HTTP 400)
  - `input/mod.rs` re-export `RefreshTokenInput`
  - 比照 F11 既有在此檔加的 3 個 stub DTO 風格;per data-model E1

- [ ] T021 [P] [US1] 依 data-model.md E2 改 `rust-api/server/core/src/web/jwt.rs`:
  - 新增 `pub async fn validate_refresh_token(token: &str) -> Result<TokenData<RefreshClaims>, JwtError>` — 取 `global::REFRESH_KEYS` decoding key、建 `Validation`(`Algorithm::HS256` + `set_issuer` 對齊 config + `validate_nbf = true` + **`validate_aud = false`**(`RefreshClaims` 無 `aud`)+ leeway 60s 對齊既有)、`decode::<RefreshClaims>`
  - 比照既有 `validate_token`(access token、`KEYS`)+ jwt.rs 既有 unit test(`:186-218`)的 Validation 形態;per research R-Q2

- [ ] T022 [US1] 依 data-model.md E3 + E4 改 `rust-api/server/service/src/admin/sys_auth_service.rs` 加 `refresh_token` service method:
  - orchestration:`validate_refresh_token(&refresh_token)`(Err → `AppError` code 3333)→ `sys_tokens::Entity::find().filter(RefreshToken.eq(&refresh_token)).one(db)`(None → code 3333)→ status == `TokenStatus::Active` 檢查(否 → code 3333)→ `sys_user::find_active().filter(Id.eq(&refresh_claims.sub)).one(db)`(None → code 8888 軟刪;Some → 取 username + domain)→ `get_user_roles(&user_id, db)` → `generate_auth_output(user_id, username, role_codes, domain, None, audience)` 產新 access + 新 refresh token
  - **輪替 transaction**(E4):`txn = db.begin()` → `sys_tokens::Entity::update_many().col_expr(Column::Status, TokenStatus::Refreshed 字串).filter(Column::RefreshToken.eq(&舊 refresh_token)).filter(Column::Status.eq(TokenStatus::Active 字串)).exec(&txn)`(`rows_affected != 1` → rollback + code 3333、解並行競態 E-7)→ 新 `SysTokensActiveModel { ... status: Active、user_id/username/domain、login_time=now、ip/port/address/user_agent/request_id 取自 refresh request context、type、created_by=username }.insert(&txn)` → `txn.commit()`
  - 失敗一律 `AppError` + F4 envelope;不寫 `sys_operation_log` / `sys_login_log`(per Q2 / FR-016);不改既有 `AccessTokenEvent`(login 路徑不動、FR-021)
  - per data-model E3/E4、research R-Q1/R-Q4/R-Q5/R-Q7

- [ ] T023 [US1] 依 data-model.md E5 改 `rust-api/server/api/src/admin/sys_authentication_api.rs` 加 `refresh_token_handler`:
  - 比照 `login_handler` 的 axum extractor:`ConnectInfo<SocketAddr>`(ip fallback + port)、`HeaderMap`(`ClientIp::get_real_ip`)、`TypedHeader<UserAgent>`、`Extension<RequestId>`、`Extension<Arc<SysAuthService>>`、`ValidatedForm<RefreshTokenInput>`
  - `address` 由 `xdb::searcher::search_by_ip(client_ip)`;組連線 context → call `service.refresh_token(refresh_token, ctx)` → 回 `Res<AuthOutput>`(重用 login 的 `AuthOutput`)
  - per data-model E5、research R-Q3;接 T020 + T022

- [ ] T024 [US1] 依 data-model.md E6 改 `rust-api/server/router/src/admin/sys_authentication_route.rs`:
  - `init_authentication_router()`(public router、`/login` 所在)加 `.route("/refreshToken", post(SysAuthenticationApi::refresh_token_handler))`
  - **不需** `RouteInfo` / `add_route` 註冊(public route 無 RBAC、per research R-Q6);不掛 `init_protected_router`(refresh 不需有效 access token、FR-002)
  - 接 T023

---

## Phase 4: Shared Build + Acceptance(US1)

### Build

- [ ] T030 **C-V1** rebuild rust-api docker image(per quickstart Step 3):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 build exit 0。若 fail → check `validate_refresh_token` 簽名 / `RefreshTokenInput` DTO / `refresh_token` service method / handler / router mount。接 T020-T024

- [ ] T031 **C-V9(起 stack)** 起 dev stack(track-a):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"
  curl -fsS http://127.0.0.1:11081/health -w " <- rust-api\n"
  ```
  預期 dev stack service 全 healthy、rust-api `/health` 正常。接 T030

### US1 acceptance(對齊 contracts/verification-commands.md C-V2~C-V10)

- [ ] T032 [US1] **C-V2** refresh 成功回新 token pair(核心、per contracts):login(直連 `:11081`)取 refresh token → `POST /auth/refreshToken` → 驗回 HTTP 200 + envelope `{code:0, data:{token, refreshToken}}`、新 `refreshToken` ≠ 登入時的舊值。接 T031

- [ ] T033 [US1] **C-V3** 輪替 sys_tokens(核心、per contracts):承 T032 → psql 驗舊 refresh token 對應 row status=`used`、新 refresh token 對應 row 存在 status=`unused`。接 T032

- [ ] T034 [US1] **C-V4** 新 access token 可用(per contracts):承 T032 → 以新 access token `Authorization: Bearer` 打 `/auth/getUserInfo`(直連 `:11081`)→ 驗 HTTP 200 + envelope code 0 + roles 正確。接 T032

- [ ] T035 [US1] **C-V5** 已用 refresh token 重用被拒(一次性、per contracts):承 T032(舊 refresh token 已輪替)→ 再以舊 refresh token 呼叫 `POST /auth/refreshToken` → 驗回 envelope `code:3333`、`sys_tokens` 筆數不變(無新 row)。接 T033

- [ ] T036 [P] [US1] **C-V6** 無效 / 缺欄位(per contracts):亂填 `refreshToken` → envelope `code:3333` + `sys_tokens` 不變;body 缺 `refreshToken` 欄 → HTTP 400。接 T031、可平行

- [ ] T037 [P] [US1] **C-V7** 軟刪 user 被拒(per contracts):GeneralUser login 取 refresh token → psql `UPDATE sys_user SET deleted_at=now() WHERE username='GeneralUser'` → refresh → 驗回 envelope `code:8888` → psql `UPDATE sys_user SET deleted_at=NULL WHERE username='GeneralUser'` 還原。接 T031、可平行

- [ ] T038 [P] [US1] **C-V8** refresh 不寫 operation_log / login_log(per contracts、FR-016):login 後記 `sys_operation_log` + `sys_login_log` baseline → 一次成功 refresh → 驗兩表筆數不變。接 T031、可平行

- [ ] T039 [P] **C-V9 regression + C-V10 three-side scope**(per contracts):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"   # 既有 stack healthy
  grep -c "TRANSITIONAL" deploy/front-nginx/conf.d/default.conf                                                 # nginx W-FA2 block 仍在(未動)
  git diff HEAD -- base-web/ | wc -l                                                                            # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l                                                # 預期 0
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml deploy/front-nginx/ | wc -l # 預期 0
  (cd rust-api && git diff HEAD -- migration/ | wc -l)                                                          # 預期 0
  (cd rust-api && git diff HEAD --stat && git status --short)                                                   # 6 既有檔改
  git status --short
  ```
  預期:base-web / nestjs / docker-compose(3 檔)/ nginx conf / migration 各 0 diff;rust-api scope = 6 既有檔改(`input/sys_authentication.rs` + `input/mod.rs` + `core/web/jwt.rs` + `service/sys_auth_service.rs` + `api/sys_authentication_api.rs` + `router/sys_authentication_route.rs`);nginx TRANSITIONAL marker 仍在;`casbin_rule` 0 改動。接 T020-T024 後、可平行於 T032-T038

**Checkpoint**:Phase 4 完成 — C-V1~C-V10 acceptance 10/10 PASS;測試操作(login token / GeneralUser 軟刪)已還原(無 seed 污染)。

---

## Phase 5: Documentation Update

- [ ] T040 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-024):
  - DESIGN-A §6.1 Phase 5 Roadmap 表 F13 row 的 spec / plan / tasks / impl 欄推進(brainstorm 已 ✅;spec/plan/tasks 落地後改 ✅)
  - 已完成里程碑加 F13 條目(對齊 F8/W-F11/F12 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - Current Focus 更新(Phase / Active feature 改 F13 落地、下一步推進 F14)
  - F13 為 **DESIGN-A §6.1 Phase 5(P5)第一個 feature、DESIGN-A→DESIGN-B 遷移起點** — 對應段落註記;time gate 維持註記

- [ ] T041 [P] **doc grep verify**:
  ```bash
  grep -cE "F13|rust-refresh-token" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep -n "028-rust-refresh-token-impl" CLAUDE.md docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期:CLAUDE.md + INTEGRATION-CHECKLIST.md 多處 F13 引用、028-rust-refresh-token-impl 連結正確

**Checkpoint**:Phase 5 完成 — doc 改動到位、Phase 6 commit。

---

## Phase 6: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F8/F12 慣例)

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 6 既有檔 modified
  git add server/model/src/admin/input/ server/core/src/web/jwt.rs \
          server/service/src/admin/sys_auth_service.rs \
          server/api/src/admin/sys_authentication_api.rs \
          server/router/src/admin/sys_authentication_route.rs Cargo.lock
  git commit -m "feat(rust-api): F13 rust-refresh-token-impl — 新增 POST /auth/refreshToken refresh token 輪替"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```
  > 若 build 未動 `Cargo.lock` 則 add list 移除之

### Stage 2 — outer commit(rev1-admin-root via 028 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + rust-api SHA pin + CLAUDE.md + INTEGRATION-CHECKLIST;**無 docker-compose 改、無 nginx 改、無 migration**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 028-rust-refresh-token-impl
  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
  git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md .specify/feature.json rust-api specs/028-rust-refresh-token-impl/
  git commit -m "feat(spec): F13 rust-refresh-token-impl — refresh endpoint + spec docs"
  ```
  > outer commit 訊息帶 rust-api 短 SHA + fork 提交主旨;outer + merge SHA 留 `<sha-pending>` placeholder、merge 後 T102 補。brainstorm doc `028-feature-*.md` 已於 `6742482` commit、不重複 add

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F13 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 028-rust-refresh-token-impl
    git switch rev1-admin-root
    git merge --no-ff 028-rust-refresh-token-impl -m "Merge branch '028-rust-refresh-token-impl' into rev1-admin-root: F13 完成"
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F13 rust-refresh-token-impl" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F13 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```

**Checkpoint**:Phase 6 完成 — F13 落地、兩段式 commit 紀律遵守、base-web + nestjs 兩邊零改動、push 等 user 同意、**解鎖 F14 design-a-to-b-cutover**。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-6 | — |
| Phase 2 Foundational(T010) | Phase 3 | Phase 1 |
| Phase 3 US1 impl(T020-T024) | Phase 4 build | Phase 1 + 2 |
| Phase 4 build(T030+T031) | Phase 4 acceptance + 5 + 6 | T020-T024 |
| Phase 4 acceptance(T032-T039) | Phase 5 | T031 |
| Phase 5 Doc(T040-T041) | Phase 6 | Phase 4 全 PASS |
| Phase 6 Commit(T100-T102) | — | 全 5 phase PASS |

**rust impl 內部依賴**:T020(DTO)+ T021(`validate_refresh_token`)獨立檔、可並行 [P];T022(service method)依賴 T021(用 `validate_refresh_token`);T023(handler)依賴 T020(用 `RefreshTokenInput`)+ T022(call service);T024(router mount)依賴 T023(mount handler)。

**Story 獨立性檢核**:
- US1(P1 MVP):rust refresh endpoint(DTO T020 + 驗證函式 T021 + service method T022 + handler T023 + router mount T024)+ acceptance C-V1~C-V10
- 單一 user story、無跨 story 依賴

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 3**:T020 + T021 [P](獨立檔)、T022→T023→T024 序列
- **Phase 4**:T030→T031 序列(build→stack);T032→T033 / T032→T034 / T033→T035 序列鏈;T036 [P] + T037 [P] + T038 [P] + T039 [P](接 T031 / T020-T024)
- **Phase 5**:T040 序列、T041 [P]
- **Phase 6**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 rust `POST /auth/refreshToken` endpoint 就位;build + acceptance + doc + commit 為驗證 + 收尾。

**MVP commit policy**:推薦走完整 Phase 1-6 一次到位(對齊 F8/F12 同 session 模式)。

> ⚠️ **Time gate**:F13 屬 DESIGN-A §6.1 Phase 5(P5),依 §6.2「過渡橋 F10 在 DESIGN-A 形態運行 N 週驗證」後才應 `/speckit-implement`。tasks.md 為設計先行產出;implement 時機由 time gate 決定。

**全 23 task 預估時間**:30-45 分鐘(rust image rebuild 占 2-3 min、dev stack 已起、refresh endpoint 為 wiring + 重用既有元件、acceptance C-V2-C-V8 含 login/refresh/psql ~數分鐘)。

**Critical path**:T001 → T002 → T010 →(T020/T021 並行)→ T022 → T023 → T024 → T030 → T031 → T032 → T033 → T035 →(T034/T036/T037/T038/T039 並行)→ T040/T041 → T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1] | ✓(T020-T024 / T032-T038 [US1]) |
| Setup / Foundational / shared build / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(T002/T020/T021/T036/T037/T038/T039/T041 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或(time gate 通過後)`/speckit-implement`**。
