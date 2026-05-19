---
description: "Task list for F11 — extracted-stubs implementation"
---

# Tasks: F11 — extracted-stubs

**Input**: Design documents from `/specs/020-extracted-stubs/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F11 為 rust source change feature(類 F5.1/F6/F10.1/F10.2 兩段式 commit)、**無 rust unit test**(per spec FR-014 + brainstorm Q3、stub 邏輯 stack-可見)
- Acceptance compensate:tracing log + curl + psql 三類驗證(per FR-023)
- **Acceptance**:per spec US1 P1 3 + US2 P2 1 + US3 P3 2 + zero-regression 1 = **7 個 scenario**(對齊 7 個 C-V)

**Organization**:F11 為 3 user story feature、Setup(2)+ Foundational(1)+ US1 impl + acceptance(12)+ US2 acceptance(1)+ US3 acceptance(2)+ Zero-regression(1)+ Doc(2)+ 兩段式 Commit(3)= **24 task**(對齊 NFR-002 ~20-25 task 範圍、10 file rust-source feature 每 file 各 1 task + stack acceptance 3 task)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F11 row + Current Focus + 已完成里程碑)
  - 改:`CLAUDE.md` §10 active feature(SOP hook 已處理、`/speckit-plan` 已 update 指 020)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
- **Worktree(改、`rust-api/`、~170-205 LOC、10 file、per analyze G1 + G2 grounding)**:
  - 改:`rust-api/server/api/src/admin/sys_authentication_api.rs`(+3 handler、~50 LOC)
  - 新建:`rust-api/server/api/src/admin/sys_mock_api.rs`(~30 LOC)
  - 改:`rust-api/server/api/src/admin/mod.rs`(+1 LOC `pub mod sys_mock_api;`)
  - 改:`rust-api/server/router/src/admin/sys_authentication_route.rs`(+3 route + RouteInfo、~15 LOC)
  - 新建:`rust-api/server/router/src/admin/sys_mock_route.rs`(~25 LOC)
  - 改:`rust-api/server/router/src/admin/mod.rs`(+1 LOC `pub mod sys_mock_route;`)
  - 改:`rust-api/server/initialize/src/router_initialization.rs`(import MockRouter + `merge_router!` 5-args register、~6 LOC、per analyze G2)
  - 改:`rust-api/server/model/src/admin/input/sys_authentication.rs`(+3 DTO、~20 LOC、對齊既有 `LoginInput` 同檔)
  - 新建:`rust-api/migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs`(~50 LOC)
  - 改:`rust-api/migration/src/datas/mod.rs`(+2 LOC + lib register)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-007 + FR-008);rust-api 其他 file 不動
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` 等 host-side bash)
- **Image / artifact**:F11 需 rebuild rust-api docker image(per Step 3、warm ~3-5 min、cold ~5-7 min)
- **無 docker-compose.yml 改**(對比 F10.1)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `020-extracted-stubs` + rust-api worktree branch = `rev1-admin-rust-api`、F10.2 + F6 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F10\.2|F6 完成|F6\s' | head -3 && cd rust-api && git branch --show-current && git status --short && cd ..`(預期 outer branch=020-*、rust-api branch=rev1-admin-rust-api、history 含 F10.2 merge `851ec79` + F6 merge `a431215`、rust-api worktree clean)
- [ ] T002 [P] 確認 W-FA1 stack 可起 + F10.2 baseline 仍 work,執行 `docker images rust-api:rev1-admin-rust-api -q && docker images nestjs:rev1-admin-nestjs -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -5`(預期 image SHA 兩個都非空、compose config 無 error)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起 + F10.2 baseline 仍 work + F5.1 seed user 在 DB(F11 acceptance 需 login)。

- [ ] T010 起 7 service stack(若未起)、確認 F10.2 baseline 仍 work + 確認 seed user 存在:`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0);如未授權跑 psql 預檢、跳過(F11 acceptance 階段會驗 F5.1 seed user)。

---

## Phase 3: User Story 1 — Soybean 4 endpoint allow + 行為對齊(Priority: P1)🎯 MVP

**Goal**:rust 4 條 stub endpoint 註冊成功 + Casbin policy allow 對 ROLE_SUPER 生效 + stub 行為對齊 DESIGN-A §4.2 直譯;落地後 Soybean 4 endpoint 全 HTTP 200 + 預期 response shape + tracing log 含 `phone=` field。

**Independent Test**:用 `Soybean` user login 拿 access_token → 用該 token 跑 4 條 stub endpoint(5 sub-case)→ 預期 4/4 endpoint HTTP 200 + 預期 response shape(`sendCaptcha → data.code="000000"` / `verifyCaptcha(000000) → data.verified=true` / `verifyCaptcha(111111) → data.verified=false` / `auth/error → data={code,msg}` / `mock/getLastTime → data.time=ISO`)+ tracing log grep `"F11 stub: sendCaptcha"` ≥ 1 line。

### US1 implementation(rust source patch、~170-205 LOC、10 file)

- [ ] T020 [US1] 改 `rust-api/server/model/src/admin/input/sys_authentication.rs`(per data-model.md §E5、既有 12 行檔含 `LoginInput`):加 3 個 DTO 在既有 `LoginInput` 之後:
  - `SendCaptchaInput { pub phone: String }`(`#[derive(Debug, Deserialize)]`)
  - `VerifyCaptchaInput { pub phone: String, pub code: String }`
  - `AuthErrorQuery { pub code: Option<String>, pub msg: Option<String> }`
  - `use serde::Deserialize;` 既有 file 頭已有
  - re-export 視 `rust-api/server/model/src/admin/input/mod.rs` 既有 pattern(若有 `pub use sys_authentication::LoginInput;` 則同 pattern 加)
  - ~20 LOC

- [ ] T021 [US1] 改 `rust-api/server/api/src/admin/sys_authentication_api.rs`(per data-model.md §E1):在既有 5 handler 後加 3 個 stub handler(`send_captcha` / `verify_captcha` / `auth_error`):
  ```rust
  pub async fn send_captcha(
      Json(input): Json<SendCaptchaInput>,
  ) -> Result<Res<serde_json::Value>, AppError> {
      tracing::info!(phone = %input.phone, "F11 stub: sendCaptcha called");
      Ok(Res::new_data(json!({ "code": "000000" })))
  }
  pub async fn verify_captcha(...) -> ... { Ok(Res::new_data(json!({ "verified": input.code == "000000" }))) }
  pub async fn auth_error(Query(q): Query<AuthErrorQuery>) -> ... { Ok(Res::new_data(json!({"code": q.code.unwrap_or_default(), "msg": q.msg.unwrap_or_default()}))) }
  ```
  確認 imports 含 `Json` / `Query` / `serde_json::{json}` / `SendCaptchaInput` 等;~50 LOC。

- [ ] T022 [P] [US1] 新建 `rust-api/server/api/src/admin/sys_mock_api.rs`(per data-model.md §E2):`SysMockApi` struct + `get_last_time` handler 回 `{time: chrono::Utc::now().to_rfc3339()}`;~30 LOC。

- [ ] T023 [US1] 改 `rust-api/server/api/src/admin/mod.rs`:加 `pub mod sys_mock_api;` + 若有 re-export pattern 補 `pub use sys_mock_api::SysMockApi;`;~1-2 LOC。

- [ ] T024 [US1] 改 `rust-api/server/router/src/admin/sys_authentication_route.rs`(per data-model.md §E4):在 `init_protected_router()` 內加 3 個 stub route mount + 3 個 RouteInfo register(對齊既有 `init_authorization_router` pattern);~15 LOC。

- [ ] T025 [P] [US1] 新建 `rust-api/server/router/src/admin/sys_mock_route.rs`(per data-model.md §E3):`MockRouter` struct + `init_mock_router()` 含 `/mock/getLastTime` GET、`Router::new().nest("/mock", router)`、對齊 `sys_sandbox_route.rs` 模式;~25 LOC。

- [ ] T026 [US1] 改 2 處(per data-model.md §E3 analyze G2 grounding):
  - `rust-api/server/router/src/admin/mod.rs`:加 1 行 `pub mod sys_mock_route;`
  - `rust-api/server/initialize/src/router_initialization.rs`:① file 頭 import block 加 `MockRouter`(line ~16-20、`use server_router::admin::{ ... };` 內)② 在既有 `SysSandboxRouter` register block 後加 `merge_router!(MockRouter::init_mock_router().await, None, false, false, None)`(line ~320 附近、`// W-F1 T020: public /health route` 之前)。~6 LOC 總計。

- [ ] T027 [US1] 新建 `rust-api/migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs`(per data-model.md §E6):`MigrationTrait` impl + `up()` raw SQL INSERT 8 row + `down()` DELETE 對應 row(`v4='allow'` 顯式);沿用 F6 `m20260518_a_f6` pattern;~50 LOC。

- [ ] T028 [US1] 改 `rust-api/migration/src/datas/mod.rs` + lib register:`pub mod m20260519_a_f11_extracted_stubs_seed;` + 在 `Migrator::migrations()` vec 加 `Box::new(m20260519_a_f11_extracted_stubs_seed::Migration)`(對齊 `m20260518_a_f6` register location);~2 LOC。

### US1 stack acceptance(對齊 contracts/verification-commands.md C-V1~C-V5)

- [ ] T029 [US1] **C-V1** rebuild rust-api docker image(per Step 3 of quickstart):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -5
  ```
  預期 warm ~3-5 min / cold ~5-7 min(per NFR-005;若 fail → check cargo build output、可能 import 缺漏)

- [ ] T030 [US1] 起 stack(force-recreate rust-api、其他 service 不動、migration init container 自動 rerun):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 rust-api 重啟 healthy + 其他 5 service 仍 healthy + migration init container exited 0(F11 migration rerun 完成)

- [ ] T031 [US1] **C-V3 + C-V5 inline**(per contracts/verification-commands.md):
  ```bash
  LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

  # 4 endpoint 5 sub-case curl(see contracts):
  curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"phone":"13800138000"}' \
    http://127.0.0.1:11080/api/auth/sendCaptcha
  # ... (其他 4 個 sub-case)

  # C-V5 tracing log grep:
  docker compose logs rust-api --tail=200 2>&1 | grep "F11 stub: sendCaptcha"
  ```
  預期:5/5 sub-case HTTP 200 + envelope `{code:0, data, msg:"success", success:true}` + 各 stub data shape 對齊;tracing log grep ≥ 1 line + `phone=` field

**Checkpoint**:US1 完成 — 4 條 stub endpoint Soybean allow path 全通、F11 核心交付完成。

---

## Phase 4: User Story 2 — GeneralUser deny(Priority: P2)

**Goal**:Casbin policy deny GeneralUser(ROLE_USER)對 F11 stub endpoint 生效、RBAC fail-safe 紀律維持(per Principle I + Q1 拍板)。

**Independent Test**:用 `GeneralUser` user login 拿 access_token → curl `sendCaptcha`(代表 endpoint)→ 預期 HTTP 403。

### US2 acceptance(對齊 C-V4)

- [ ] T040 [US2] **C-V4 GeneralUser deny verify**:
  ```bash
  GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Authorization: Bearer $GU_TOKEN" \
    -H "Content-Type: application/json" -d '{"phone":"13800138000"}' \
    http://127.0.0.1:11080/api/auth/sendCaptcha
  ```
  預期 HTTP **403**(或 F4 envelope `{code:403, success:false}`)、不含 `data.code:"000000"`(deny 路徑生效)

**Checkpoint**:US2 完成 — Casbin enforce 對 ROLE_USER deny 確認、Principle I fail-safe PASS。

---

## Phase 5: User Story 3 — Casbin migration + W-FA1 stack regression(Priority: P3)

**Goal**:F11 Casbin migration `m20260519_a_f11` 真執行、8 row 落 casbin_rule + W-FA1 stack 6 service 仍 healthy + migration init container exited 0。

**Independent Test**:psql 查 casbin_rule `WHERE v2 IN (4 endpoint) AND v4='allow'` 回 8 row + `docker compose ps` 6 healthy。

### US3 acceptance(對齊 C-V2 + C-V7)

- [ ] T050 [US3] **C-V2 Casbin migration row 驗**:
  ```bash
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT v0, v2, v3, v4 FROM casbin_rule WHERE v2 IN ('/auth/sendCaptcha','/auth/verifyCaptcha','/auth/error','/mock/getLastTime') AND v4='allow' ORDER BY v0, v2"
  docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
    -c "SELECT COUNT(*) FROM casbin_rule WHERE v2 IN ('/auth/sendCaptcha','/auth/verifyCaptcha','/auth/error','/mock/getLastTime') AND v4='allow'"
  ```
  預期 8 row(2 role × 4 endpoint、ROLE_SUPER + ROLE_ADMIN 各 4)、COUNT = 8(per FR-005 + FR-006 + SC-005)

- [ ] T051 [US3] **C-V7 W-FA1 stack regression**:
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ rust-api uptime 較短(剛 recreated)+ migration exited 0(per SC-012 + FR-018)

**Checkpoint**:US3 完成 — Casbin policy 8 row 落 DB + W-FA1 stack regression PASS。

---

## Phase 6: Zero-regression(對齊 W-F* / W-FA* / F10 / F10.1 / F10.2 標配)

**Goal**:base-web + nestjs fork 零改動 + rust-api scope 收緊到 10 file(per spec SC-007 + SC-008 + SC-011 + plan structure decision)。

### Zero-regression verification

- [ ] T060 [P] **C-V6 three-side scope verify**:
  ```bash
  echo "=== base-web/src/ diff lines (預期 0) ==="
  git diff HEAD -- base-web/src/ | wc -l

  echo "=== fork260509-soybean-admin-nestjs/ diff lines (預期 0) ==="
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l

  echo "=== rust-api scope (預期 10 file ~170-205 LOC) ==="
  (cd rust-api && git diff HEAD --stat)

  echo "=== docker-compose 變動 (預期 0) ==="
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l

  echo "=== outer scope (預期 CLAUDE.md + INTEGRATION-CHECKLIST.md + .specify/feature.json + rust-api gitlink + specs/020-* untracked、無 docker-compose.yml diff) ==="
  git status --short
  ```
  預期:per spec SC-007 + SC-008 + SC-009 + SC-011 + plan structure decision、4 個 0 line + rust-api 10 file + outer 4 file + 1 untracked dir

**Checkpoint**:Phase 6 完成 — 三邊 scope 對齊驗證 PASS。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc 反映 F11 落地。

- [ ] T070 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-022):
  - Current Focus 三段更新(Phase / Active feature 改 F11、F11 outer commit pending push / 下一步並行候選)
  - 已完成里程碑加 F11 條目(對齊 F10.2 同 application-phase style + 兩段式 commit、SHA placeholder)
  - 加新「DESIGN-A §4.2 抽離項清單交付進度」紀錄(4/5 stub 已交付、batchDeleteUser 留 F9)
  - 列 F11 後 next-step:F9 / F7 / F12 / W-F11 / W-F6b 並行候選(per spec Dependencies「並行可選」段)

- [ ] T071 [P] **doc grep verify**:
  ```bash
  grep -cE "F11\b|extracted-stubs" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F11" docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:≥ 5 match、INTEGRATION-CHECKLIST.md 多處 F11 引用(Current Focus + 已完成里程碑 + DESIGN-A §4.2 進度)

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.1/F10.2 慣例)

**Goal**:落實**兩段式 commit** 紀律(F11 動 rust-api worktree、純 outer 不夠)、push 等 user 同意。

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push:
  ```bash
  cd rust-api
  git status --short
  # 預期 modified + new file:10 file total

  git add server/api/src/admin/sys_authentication_api.rs \
          server/api/src/admin/sys_mock_api.rs \
          server/api/src/admin/mod.rs \
          server/router/src/admin/sys_authentication_route.rs \
          server/router/src/admin/sys_mock_route.rs \
          server/router/src/admin/mod.rs \
          server/model/src/admin/input/sys_authentication.rs \
          server/initialize/src/router_initialization.rs \
          migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs \
          migration/src/datas/mod.rs

  git commit -m "$(cat <<'EOF'
  feat(rust-api): F11 補 4 條抽離項 stub endpoint + Casbin policy seed

  rev1 application Phase 4 收尾後第一個 post-Phase-4 feature(F10/F10.1/F10.2 三件套
  全完成、refreshToken end-to-end pass 後接續)。補 DESIGN-A §3.1 + §4.2 抽離項
  清單 4 條 stub endpoint(其餘 batchDeleteUser 1 條留 F9 統一交付):

  - POST /auth/sendCaptcha:接 {phone}、tracing::info! log + 回固定碼 {"code":"000000"}
  - POST /auth/verifyCaptcha:接 {phone, code}、code=="000000" 為 {verified:true}
  - GET /auth/error?code=&msg=:demo only、反 echo
  - GET /mock/getLastTime:回 {time: chrono::Utc::now().to_rfc3339()}

  加 1 個 Casbin policy seed migration(m20260519_a_f11_extracted_stubs_seed.rs):
  INSERT 8 row(ROLE_SUPER + ROLE_ADMIN × 4 endpoint × p policy with allow);
  GeneralUser(ROLE_USER)default deny。

  改動範圍(rust-api、10 file、~170-205 LOC):
  - server/api/src/admin/sys_authentication_api.rs(+3 handler、~50 LOC)
  - server/api/src/admin/sys_mock_api.rs(新建、~30 LOC)
  - server/api/src/admin/mod.rs(+1 LOC)
  - server/router/src/admin/sys_authentication_route.rs(+3 route + RouteInfo、~15 LOC)
  - server/router/src/admin/sys_mock_route.rs(新建、~25 LOC)
  - server/router/src/admin/mod.rs(+3 LOC + register)
  - server/model/src/admin/input/sys_authentication.rs(+3 DTO、~20 LOC、對齊既有 LoginInput)
  - server/initialize/src/router_initialization.rs(import + merge_router! register、~6 LOC、per analyze G2)
  - migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs(新建、~50 LOC)
  - migration/src/datas/mod.rs(+2 LOC + lib register)

  Brainstorm 5 顯式拍板 Q:
  - Q1: Casbin role allow → Soybean + Administrator(避免加新 sys_role scope 爆)
  - Q2: sys_menu seed → 不加(Casbin enforce 一層防線)
  - Q3: handler 進階 → 紫極簡 stub(無 unit test / 無 validation / 無 audit)
  - Q4: acceptance → Soybean × 4 endpoint + GeneralUser × 1 = 5 個 curl
  - Q5: file 組織 → auth 3 條加 sys_authentication_api.rs、mock 新建 sys_mock_*

  Acceptance:US1 P1 MVP 3/3(C-V1 image rebuild OK / C-V3 Soybean 4 endpoint
  5 sub-case 全 HTTP 200 + 預期 response shape / C-V5 tracing log phone=)+ US2
  P2 1/1(C-V4 GeneralUser sendCaptcha HTTP 403)+ US3 P3 2/2(C-V2 psql
  casbin_rule 8 row + C-V7 W-FA1 6 service healthy)+ zero-regression 1/1
  (C-V6 三邊 scope)= 7/7 PASS(對齊 spec FR-018 NFR-004、無 unit test、
  tracing log compensate)。

  base-web + nestjs fork 兩邊 zero diff(per FR-007 + FR-008 + SC-007 + SC-008);
  rust-api 改動 10 file(per SC-011 + plan structure decision);無 docker-compose.yml
  改(對比 F10.1);W-FA1 stack 6 service healthy + migration exited 0 維持。

  Constitution Check 17 PASS / 13 N/A / 0 violation(Principle I RBAC fail-safe
  + Principle V 漸進收縮 — stub 為 DESIGN-A 過渡、未來升級路徑明確改 rust handler
  + Casbin policy、nginx / 前端 / DB schema 零改動)。

  1 implement-time finding(per research.md R-Q4):rust Res<T> envelope serialize
  shape 為 {code, data, msg, success}(用 msg 非 message、加 success: bool field);
  spec.md US1.2 文字寫 message 為 wording inaccuracy、contracts 已修正用 actual
  msg、業務語意(code=0 + data 對齊)不變。

  DESIGN-A §4.2 抽離項清單交付進度:4 / 5 條 stub 已交付(剩 batchDeleteUser
  留 F9)。F11 解鎖 F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover、
  並行可選 F9 / F7 / F12 / W-F11 / W-F6b。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git push origin rev1-admin-rust-api
  ```

### Stage 2 — outer commit(rev1-admin-root via 020 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md + rust-api SHA pin、**無 docker-compose.yml**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current  # 預期 020-extracted-stubs
  git status --short
  # 預期 modified: CLAUDE.md / docs/INTEGRATION-CHECKLIST.md / .specify/feature.json /
  #            rust-api(new SHA pin)
  # untracked: specs/020-extracted-stubs/

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  # 先填 rust-api SHA 在 INTEGRATION-CHECKLIST.md(per F10.2 pattern):
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          specs/020-extracted-stubs/ \
          rust-api

  git commit -m "$(cat <<EOF
  feat(spec): F11 extracted-stubs — 4 條抽離項 stub + Casbin policy seed

  outer side of F11 application Phase 4 收尾後第一個 post-Phase-4 feature
  (rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit 為 spec docs +
  rust-api SHA pin + INTEGRATION-CHECKLIST.md F11 row + 抽離項清單 4/5 進度紀錄
  + CLAUDE.md SOP marker)。

  改動範圍(outer):
  - specs/020-extracted-stubs/{spec, plan, research, data-model, quickstart,
    contracts/verification-commands, checklists/requirements, tasks}.md
    新建(/speckit-specify + /speckit-clarify(0 question)+ /speckit-plan +
    /speckit-tasks 全跑完)
  - CLAUDE.md SPECKIT marker 區間自動更新(Active feature 改 F11 020-*)
  - docs/INTEGRATION-CHECKLIST.md F11 row + Current Focus + 已完成里程碑
    (DESIGN-A §4.2 抽離項清單 4/5 進度、F11 解鎖 F13/F14 + 並行 F9/F7/F12)
  - .specify/feature.json 指 specs/020-extracted-stubs
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 docker-compose.yml 改**(對比 F10.1、F11 不需動 deploy 配置)。

  Acceptance(走完 7/7、對齊 spec NFR-004):見 rust-api ${RUST_API_SHORT_SHA}
  commit body 詳細。

  Constitution Check 17 PASS / 13 N/A / 0 violation(Principle I RBAC fail-safe
  + Principle V 漸進收縮 — stub 為 DESIGN-A 過渡、無破壞性);base-web + nestjs
  fork 兩邊 zero diff;W-FA1 stack 6 service healthy + migration exited 0 維持。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F10/F10.1/F10.2 等 pattern、merge 後再補。

  **DESIGN-A §4.2 抽離項清單交付進度** 4 / 5(剩 batchDeleteUser 留 F9 統一交付)。
  F11 解鎖 F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover、並行可選
  F9 / F7 / F12 / W-F11 / W-F6b。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F11 兩段式 commit 已落(rust-api 已推 origin、outer 在本機),要不要 push outer 020-extracted-stubs 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    git push origin 020-extracted-stubs
    git switch rev1-admin-root
    git merge --no-ff 020-extracted-stubs -m "Merge branch '020-extracted-stubs' into rev1-admin-root: F11 完成"
    # SHA fill follow-up commit(對齊 W-FA*/F10/F10.1/F10.2 pattern)
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F11" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F11 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root
    ```

**Checkpoint**:Phase 8 完成 — F11 落地、兩段式 commit 紀律遵守、DESIGN-A §4.2 抽離項清單 4/5 完成、F9 收尾 batchDeleteUser 後可進 DESIGN-B 階段(F13/F14)、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational | Phase 3(stack 必須先起)| Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 6 + 7 + 8 | Phase 1 + 2 + rust-api image rebuild |
| Phase 4 US2 | Phase 7 | Phase 3(stack 起 + Casbin migration rerun 完成)|
| Phase 5 US3 | Phase 7 | Phase 3(stack with F11 image 起後 + migration rerun)|
| Phase 6 Zero-regression | Phase 7 | Phase 3(改動完成後驗 scope)|
| Phase 7 Doc | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(rust source 10 file + 3 stack acceptance C-V1 C-V3 C-V5)
- US2(P2):純 acceptance(C-V4 GeneralUser deny)、依賴 US1 stack 起 + Casbin migration rerun
- US3(P3):純 acceptance(C-V2 psql + C-V7 stack ps)、依賴 US1 stack 起 + Casbin migration rerun

實際:**US1 = impl(rust source 10 file)+ acceptance(stack rebuild + restart + curl + log);US2/US3 = acceptance only**。

## Parallel Execution

### Phase 1 部分並行
T001 序列(branch + status)、T002 [P] 並行

### Phase 2 序列
T010(stack up + baseline check)序列、blocking Phase 3+

### Phase 3 半並行(within phase)
- T020(DTO)序列
- T021(SysAuthenticationApi 3 handler)序列、依賴 T020 DTO
- T022 [P](SysMockApi 新檔)並行於 T021
- T023(mod.rs register sys_mock_api)序列、接 T022
- T024(sys_authentication_route 加 mount)序列、依賴 T021
- T025 [P](sys_mock_route 新檔)並行於 T024
- T026(mod.rs register sys_mock_route)序列、接 T025
- T027(migration 新檔)獨立、可平行
- T028(migration mod.rs + lib register)序列、接 T027
- T029(rebuild image)序列、接 T020-T028 全 done
- T030(restart stack)序列、接 T029
- T031(C-V3 + C-V5)序列、接 T030

### Phase 4 序列
T040(C-V4)接 T030 stack 起後

### Phase 5 序列
T050(C-V2 psql)接 T030;T051(C-V7 ps)接 T030,可平行

### Phase 6 全可並行
T060 全 [P] 並行(獨立 git diff)

### Phase 7 部分並行
T070 序列(改 INTEGRATION-CHECKLIST.md)、T071 [P](grep verify)

### Phase 8 嚴格序列
T100 → T101 → T102(兩段式 commit + push wait、無法並行)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F11 4 條 stub endpoint 可被 Soybean 用、Casbin enforce 對 ROLE_USER 自動 deny;US2 + US3 + Zero-regression + Doc + Commit 為驗證 + 收尾 phase。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 F5.1/F6/F10.1/F10.2 同 session 模式)、不 US1-only commit。

**並行 vs 序列建議**:
- 全 24 task 預估時間 60-90 分鐘(rust image rebuild 占 3-7 min、cargo unit test 跳過(per Q3)、其他 task 各 30s-2 min;rust source 改 10 file 為主要時間)
- Critical path:T001 → T002 → T010 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031 → T040 → T050 → T051 → T060 → T070 → T100 → T101 → T102

**故障排查**(per quickstart 故障排查段):
- T020-T028 cargo error:檢 strum / serde / chrono / sea-orm import、DTO derive、module register
- T029 build fail:cargo dependency / DTO 未 re-export → 檢 build log
- T030 stack restart loop:handler panic / migration UNIQUE constraint fail → 檢 docker compose logs rust-api / migration
- T031 C-V3 HTTP 404:endpoint 未註冊、router mount 漏 → 檢 sys_authentication_route + sys_mock_route 的 `.route(...)`
- T031 C-V3 HTTP 403:Casbin policy 未 allow ROLE_SUPER、C-V2 應同時 fail → 檢 migration init 是否 rerun
- T031 C-V5 grep 0 line:handler 沒被 invoke / tracing INFO level 未開 → 檢 rust-api log config
- T040 GeneralUser HTTP 200(該 403):Casbin policy 對 ROLE_USER 也 allow(誤加 row)→ 檢 C-V2 row 不該含 ROLE_USER
- T050 COUNT < 8:migration 沒跑、lib register 漏 → 檢 mod.rs + lib.rs register
- T050 COUNT > 8:rerun INSERT 重複(idempotency bug)→ 檢 seaql_migrations 表
- T051 stack 非 6 healthy:意外退化、abort F11 + 檢 docker compose logs <service>
- T060 git diff > 0 在 base-web/nestjs:意外改動、abort F11 + 改正
- T100 conventional commit hook fail:檢 message format、必要時調整 + 新建 NEW commit(per CLAUDE.md §5、不 amend)

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T031 [US1] / T040 [US2] / T050-T051 [US3]) |
| Setup / Foundational / Zero-regression / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
