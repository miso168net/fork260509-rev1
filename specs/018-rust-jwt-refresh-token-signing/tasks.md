---
description: "Task list for F10.1 — rust-jwt-refresh-token-signing implementation"
---

# Tasks: F10.1 — rust-jwt-refresh-token-signing

**Input**: Design documents from `/specs/018-rust-jwt-refresh-token-signing/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F10.1 為 rust source change feature(類 F5.1/F6 兩段式 commit)、含 2 個 rust unit test(per clarify Q3 MUST)
- Unit test 對 R-1 + Q1 critical path 提供 stack-level 不可見覆蓋
- **Acceptance**:per spec US1 P1 3 + US2 P2 1 + US3 P3 2 + unit test 2 = 8 個 scenario(對齊 9 個 C-V)

**Organization**:F10.1 為 3 user story feature、Setup(2)+ Foundational(1)+ US1 impl + unit + acceptance + outer wire(11)+ US2 acceptance(1)+ US3 acceptance(1)+ Zero-regression(2)+ Doc(2)+ 兩段式 Commit(3)= **20 task**(略超 NFR-002 ≤ 15 預估,但 task 細粒度提高、單 task 範疇緊湊、可控;包含 T029a outer docker-compose wire 解 /speckit-analyze C1 gap)。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 / US2 / US3 標籤;Setup / Foundational / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docker-compose.yml`(rust-api service 加 envvar + secret ref)
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F10.1 row + Active feature)
  - 改:`CLAUDE.md` §10 active feature(SOP hook 已處理、`/speckit-plan` 已 update)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
- **Worktree(改、`rust-api/`、~85 LOC)**:
  - 改:`rust-api/server/config/src/model/jwt_config.rs`(+2 field)
  - 改:`rust-api/server/config/src/secret_loader.rs`(~10 LOC extend + 1 unit test)
  - 改:`rust-api/server/core/src/web/jwt.rs`(~35 LOC + 1 unit test)
  - 改:`rust-api/server/global/src/global.rs`(or 等同位置、+1 global `REFRESH_KEYS`)
  - 改:`rust-api/server/service/src/admin/sys_auth_service.rs`(1 line)
  - 改:`rust-api/server/resources/application.yaml`(+2 line)
  - 改:rust-api bootstrap(`main.rs` or `lib.rs`、+1 call `init_refresh_keys`)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-006 + FR-009)
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose` / `git diff` 等 host-side bash)
- **Image / artifact**:F10.1 需 rebuild rust-api docker image(per Step 3、cold ~5-6 min)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `018-rust-jwt-refresh-token-signing` + rust-api worktree branch = `rev1-admin-rust-api`,執行 `git branch --show-current && git status --short && cd rust-api && git branch --show-current && git status --short && cd ..`(預期 outer branch=018-*、rust-api branch=rev1-admin-rust-api、兩邊 clean working tree)
- [ ] T002 [P] 確認 W-FA1 stack 可起 + F10 baseline 仍 work,執行 `docker images nestjs:rev1-admin-nestjs -q && docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -5`(預期 image SHA 非空、compose config 無 error)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 stack 可起 + F10 R-8 friction 仍 surface(F10.1 修對象)。

- [ ] T010 起 7 service stack(若未起)、確認 F10 R-8 baseline:`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait && docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"`(預期 6 healthy + migration exited 0);選擇性跑 F10 C-V2 baseline 確認 refresh_token 仍是 26 char Ulid(對比 F10.1 修後變 JWT)

---

## Phase 3: User Story 1 — R-8 修 + R-7 surface(Priority: P1)🎯 MVP

**Goal**:rust 簽 refresh_token 為 HS256 JWT、修 R-8;落地後 R-7 friction(`'Token has already been used.'`)預期 surface 為 F10.2 baseline。

**Independent Test**:用 `Soybean` user login 拿 refresh_token → 驗 JWT 三段格式(length > 100、含 2 dots)→ 用該 refresh_token 跑 refreshToken endpoint → 預期 HTTP 4xx with `'Token has already been used.'` + nestjs log 無 `jwt malformed` + 含 R-7 evidence。

### US1 implementation(rust source patch、~85 LOC、5-6 file)

- [ ] T020 [US1] 改 `rust-api/server/config/src/model/jwt_config.rs`:`JwtConfig` struct 加 2 field — `pub refresh_secret: String` + `pub refresh_expire: i64`(per data-model §E2;對齊既有 jwt_secret / expire pattern、`#[derive(Deserialize, Debug, Clone)]` 不變)
- [ ] T021 [P] [US1] 改 `rust-api/server/resources/application.yaml`:`jwt` section 加 2 line — `refresh_secret: "change-me-refresh-secret"` + `refresh_expire: 7200`(per research R-Q2、F1.1 placeholder pattern 對齊)
- [ ] T022 [US1] 改 `rust-api/server/config/src/secret_loader.rs`:extend `apply_jwt_secret_hardening` ~10 LOC — 加 `APP_JWT_REFRESH_SECRET_FILE` 載入(若 empty-after-trim → fallback `jwt.refresh_secret = jwt.jwt_secret.clone()`、若 non-empty → 寫入 file content)+ 加 `APP_JWT_REFRESH_SECRET` bare envvar fallback + `validate_jwt_secret(&jwt.refresh_secret)`(per research R-Q3 + clarify Q1)
- [ ] T023 [P] [US1] **TDD red-green** unit test (b):改 `rust-api/server/config/src/secret_loader.rs` 既有 `#[cfg(test)] mod tests`,加 `test_apply_jwt_refresh_secret_empty_file_fallback_to_jwt_secret`(重用既有 `ENV_MUTEX` guard):
  ```rust
  // pseudo:
  let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
  let tmp = NamedTempFile::new().unwrap();  // empty file
  std::env::set_var("APP_JWT_REFRESH_SECRET_FILE", tmp.path());
  let mut jwt = JwtConfig {
      jwt_secret: "fake-jwt-secret-32-char-padded!".to_string(),
      refresh_secret: "placeholder-from-yaml".to_string(),
      issuer: "test".to_string(),
      expire: 3600,
      refresh_expire: 7200,
  };
  apply_jwt_secret_hardening(&mut jwt);
  assert_eq!(jwt.refresh_secret, "fake-jwt-secret-32-char-padded!");
  std::env::remove_var("APP_JWT_REFRESH_SECRET_FILE");
  ```
  跑 `cargo test -p config test_apply_jwt_refresh_secret_empty_file_fallback`、預期 PASS
- [ ] T024 [US1] 改 `rust-api/server/core/src/web/jwt.rs`(or `core/src/web/auth.rs` 視 Claims 位置):加 `RefreshClaims` struct(6 field per data-model §E1)+ `RefreshClaims::new(sub: String)` + 5 setter(`set_exp` / `set_iss` / `set_iat` / `set_nbf` / `set_jti`、對齊 Claims setter pattern per research R-Q6)
- [ ] T025 [P] [US1] 改 `rust-api/server/global/src/global.rs`:加 `pub static REFRESH_KEYS: OnceCell<Arc<Mutex<Keys>>> = OnceCell::const_new();`(per data-model §E3;**重用既有 `Keys` struct、不新建**)
- [ ] T026 [US1] 改 `rust-api/server/core/src/web/jwt.rs`:加 `JwtUtils::generate_refresh_token(user_id: String) -> Result<String, JwtError>` method(per data-model §E4;mirror `generate_token` 結構 + 用 `REFRESH_KEYS` + `jwt_config.refresh_expire`;`Header::default()` HS256 per R-Q5)
- [ ] T027 [US1] 改 rust-api bootstrap(`main.rs` / `lib.rs` / `initialize/` 視 project layout):加 `init_refresh_keys(&jwt_config).await?;` 緊接 既有 `init_keys()` call(per research R-Q1 separate fn);若無對應 init helper、可 inline `REFRESH_KEYS.set(Arc::new(Mutex::new(Keys::new(jwt_config.refresh_secret.as_bytes())))).map_err(...)`
- [ ] T028 [US1] 改 `rust-api/server/service/src/admin/sys_auth_service.rs:358`:1 line — `refresh_token: Ulid::new().to_string(),` 改 `refresh_token: JwtUtils::generate_refresh_token(user_id.clone()).await?,`(per data-model §E4 callsite;`user_id` 已在 fn 參數 line 338、`.clone()` 因 user_id 後續可能還用)
- [ ] T029a [P] [US1] **改 `docker-compose.yml` rust-api service block**(outer file、與 worktree rust source patch 並行):
  - `environment` section 加 1 line:`APP_JWT_REFRESH_SECRET_FILE: /run/secrets/refresh_token_secret`
  - `secrets` section 加 1 line ref:`- refresh_token_secret`(top-level `secrets:` section 已含此 entry、W-FA1 line 284-285)
  - 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | grep -A2 "rust-api" | head -30` 驗 envvar + secrets ref 都 resolved
  - 預期:`config` output 顯示 rust-api service 含 `APP_JWT_REFRESH_SECRET_FILE` envvar + `refresh_token_secret` secret list 中(per spec FR-015 + data-model §E2 + quickstart Step 4 + analyze C1 gap fill)
- [ ] T029 [P] [US1] **TDD red-green** unit test (a):改 `rust-api/server/core/src/web/jwt.rs` 加 `#[cfg(test)] mod tests`(or 既有 mod tests 加 test fn),加 `test_generate_refresh_token_signs_valid_hs256_jwt_with_refresh_claims`:
  ```rust
  // pseudo:
  #[tokio::test]
  async fn test_generate_refresh_token_signs_valid_hs256_jwt_with_refresh_claims() {
      // init test JwtConfig + REFRESH_KEYS
      // (用 setup helper、可能需要 global::CONFIG.set + REFRESH_KEYS.set)
      let token = JwtUtils::generate_refresh_token("test-user-id".to_string()).await.unwrap();
      assert!(token.matches('.').count() == 2);  // JWT 三段
      assert!(token.len() > 100);
      let decoded = decode::<RefreshClaims>(&token, &DecodingKey::from_secret(b"test-secret"),
                                            &Validation::new(Algorithm::HS256)).unwrap();
      assert_eq!(decoded.claims.sub, "test-user-id");
      // assert exp / iat / nbf set
  }
  ```
  跑 `cargo test -p core test_generate_refresh_token`、預期 PASS

### US1 stack acceptance(對齊 contracts/verification-commands.md C-V2~C-V4)

- [ ] T030 [US1] Rebuild rust-api docker image:`docker compose build rust-api --progress=plain`(預期 cold ~5-6 min / warm ~2-3 min per R-Q8;若 fail → check cargo build output、可能 cargo dependency 缺 import 等)
- [ ] T031 [US1] 起 stack(若 image rebuild 後需 recreate):`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`(預期 7 service expected state、6 healthy + migration exited 0;rust-api 不 restart loop 表 secret_loader work)
- [ ] T032 [US1] **C-V2 + C-V3 + C-V4 inline**:
  ```bash
  LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
  REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.refreshToken')
  echo "length=${#REFRESH_TOKEN}, dots=$(echo "$REFRESH_TOKEN" | tr -dc '.' | wc -c)"
  # C-V2 預期 length > 100, dots >= 2(R-8 修)

  curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" http://127.0.0.1:11080/api/auth/refreshToken
  # C-V3 預期 HTTP 4xx with "Token has already been used." (R-7 surface)

  docker compose logs nestjs --tail=80 2>&1 | grep -E "JsonWebTokenError|jwt malformed" | head -5
  # C-V4 預期 0 lines(R-8 修)
  docker compose logs nestjs --tail=80 2>&1 | grep -E "Token has already been used|refreshTokenCheck" | head -5
  # C-V4 預期 ≥ 1 line(R-7 surface)
  ```

**Checkpoint**:US1 完成 — R-8 修 + R-7 surface baseline 紀錄、可定義 F10.2 acceptance。

---

## Phase 4: User Story 2 — DB 準據驗 sys_tokens JWT format(Priority: P2)

**Goal**:psql 查 sys_tokens 確認 rust 寫入 refresh_token 為 JWT 字串、status 仍 `"ACTIVE"`(R-7 source 仍在、F10.2 修)。

**Independent Test**:US1.1 完成後查 sys_tokens 表、驗 refresh_token JWT 格式 + status R-7 source 仍在。

### US2 acceptance(對齊 C-V5)

- [ ] T040 [US2] **C-V5 psql sys_tokens**:
  ```bash
  DB_PASSWORD=$(cat deploy/secrets/postgres_password.txt 2>/dev/null || echo "postgres")
  PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 15432 -U soybean -d soybean_admin_rust \
    -c "SELECT char_length(refresh_token) AS rt_len, status, refresh_token FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 1"
  ```
  預期 1 row、`rt_len > 100`、refresh_token 含 2 個 `.`、`status = "ACTIVE"`(R-7 source 仍在、per spec SC-004 + FR-002)

**Checkpoint**:US2 完成 — JWT 格式在 DB 層也對齊、status R-7 source 紀錄。

---

## Phase 5: User Story 3 — secret 對齊驗(Priority: P3)

**Goal**:確認 rust 與 nestjs 兩端 effective refresh_secret 對齊(per clarify Q1 fallback chain symmetry)。

**Independent Test**:rust-api + nestjs env 都正確 set、兩端 secret 在 dev empty-file 路徑下都 fallback 到 jwt_secret。

### US3 acceptance(對齊 C-V6)

- [ ] T050 [US3] **C-V6 secret 對齊**:
  ```bash
  docker compose exec rust-api env | grep -E "APP_JWT_REFRESH_SECRET|APP_JWT_JWT_SECRET" | head -5
  docker compose exec rust-api sh -c "ls -la /run/secrets/refresh_token_secret /run/secrets/jwt_secret && wc -c /run/secrets/refresh_token_secret"
  docker compose exec nestjs env | grep -E "JWT_SECRET|REFRESH_TOKEN_SECRET" | head -5
  ```
  預期:rust-api 看到 `APP_JWT_REFRESH_SECRET_FILE=/run/secrets/refresh_token_secret`、兩個 secret file mount OK、`refresh_token_secret` file 為空(dev 預設、`wc -c` ≈ 0、走 clarify Q1 fallback);nestjs `REFRESH_TOKEN_SECRET=<value>` 非空(per W-FA1 entrypoint fallback);**effective secret 對齊**(rust 走 empty-file fallback to jwt_secret、nestjs 走 `${RTS:-$JWT_SECRET}`、兩端 jwt_secret 同來源)(per spec SC-005 + SC-006 + FR-003)

**Checkpoint**:US3 完成 — secret wiring + fallback chain 兩端對稱、F10.1 dev 安全。

---

## Phase 6: Zero-regression(對齊 W-F* / W-FA* / F10 標配)

**Goal**:base-web + nestjs fork 零改動 + rust-api scope 符合 spec(5-6 file)+ W-FA1 stack 仍健康。

### Zero-regression verification

- [ ] T060 [P] **C-V7a three sides scope verify**:
  ```bash
  echo "=== base-web + nestjs fork zero diff ==="
  git diff HEAD -- base-web/src/ fork260509-soybean-admin-nestjs/ | wc -l
  # 預期 0 (per FR-006 + FR-009 + SC-008 + SC-009)

  echo ""
  echo "=== rust-api scope: 5-6 file change ==="
  (cd rust-api && git diff HEAD --stat | head -10)
  # 預期 5-6 file: jwt_config.rs + secret_loader.rs + jwt.rs + global.rs(可能)+ sys_auth_service.rs + application.yaml + bootstrap

  echo ""
  echo "=== outer scope: docker-compose.yml + spec docs ==="
  git diff HEAD --stat | head -15
  # 預期: docker-compose.yml + INTEGRATION-CHECKLIST.md + specs/018-* + .specify/feature.json + CLAUDE.md (SOP)
  ```

- [ ] T061 [P] **W-FA1 stack regression**:
  ```bash
  docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期:6 healthy + migration exited 0(stack 整體不退化、F10.1 build + restart 過程不破壞 W-FA1 baseline)

**Checkpoint**:Phase 6 完成 — 三邊 scope 對齊 + W-FA1 stack regression PASS。

---

## Phase 7: Documentation Update

**Goal**:同步更新 outer doc 反映 F10.1 落地。

- [ ] T070 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-021):
  - Current Focus 三段更新(Phase / Active feature 改無、F10.1 outer commit pending push / 下一步 F10.2 + F11/F12 並行)
  - Application Phase 4 Roadmap 表 F10.1 row 從「未啟」改「完成」(`outer <sha-pending>`、`rust-api <sha-pending>`、8/8 acceptance PASS + 2 unit test)
  - 已完成里程碑加 F10.1 條目(對齊 F6 / F10 同 application-phase style + 兩段式 commit、SHA placeholder)
  - 列 F10.2 為 next-step(R-7 修、緊接)

- [ ] T071 [P] **doc grep verify**:
  ```bash
  grep -cE "F10\.1\b|rust-jwt-refresh-token-signing" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep "F10.1" docs/INTEGRATION-CHECKLIST.md | head -10
  ```
  預期:≥ 5 match、INTEGRATION-CHECKLIST.md 多處 F10.1 引用(Current Focus + 已完成里程碑 + Phase 4 Roadmap row)

**Checkpoint**:Phase 7 完成 — doc 改動到位、Phase 8 commit。

---

## Phase 8: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6 慣例)

**Goal**:落實**兩段式 commit** 紀律(F10.1 動 rust-api worktree、純 outer 不夠)、push 等 user 同意。

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push:
  ```bash
  cd rust-api
  git status --short
  # 預期 modified: server/config/src/model/jwt_config.rs / server/config/src/secret_loader.rs
  #            server/core/src/web/jwt.rs / server/global/src/global.rs(若改)
  #            server/service/src/admin/sys_auth_service.rs / server/resources/application.yaml
  #            server/<main or initialize>/...(bootstrap)

  git add server/config/src/model/jwt_config.rs \
          server/config/src/secret_loader.rs \
          server/core/src/web/jwt.rs \
          server/global/src/global.rs \
          server/service/src/admin/sys_auth_service.rs \
          server/resources/application.yaml \
          server/initialize/src/lib.rs  # or 對應 bootstrap path
  # 視實際改 file 增減

  git commit -m "$(cat <<'EOF'
  feat(rust-api): F10.1 加 refresh_token JWT 簽 + 修 R-8 friction

  rev1 application Phase 4 第二個 feature(F10 wire-up + friction surface 後接續、
  F10.2 之前)。修 F10 acceptance surface 的 R-8 friction(nestjs jwtService.
  verifyAsync 對 rust Ulid throw "jwt malformed"):rust refresh_token 從
  Ulid::new().to_string() 改為 HS256 JWT、用極簡 RefreshClaims struct(6 field:
  sub/exp/iat/nbf/jti/iss)、用 W-FA1 既有 refresh_token_secret docker secret +
  APP_JWT_REFRESH_SECRET_FILE _FILE pattern 簽。落地後 R-7 friction(rust
  TokenStatus="ACTIVE" vs nestjs "unused")預期 surface、為 F10.2 修點 baseline。

  改動範圍(rust-api、~85 LOC across 5-7 file):
  - server/config/src/model/jwt_config.rs(+2 field:refresh_secret/refresh_expire)
  - server/config/src/secret_loader.rs(~10 LOC extend apply_jwt_secret_hardening
    + empty-file fallback 到 jwt_secret per clarify Q1 + 1 unit test)
  - server/core/src/web/jwt.rs(~35 LOC:RefreshClaims struct + generate_refresh_token
    + 1 unit test)
  - server/global/src/global.rs(+1 global REFRESH_KEYS 重用 Keys struct)
  - server/service/src/admin/sys_auth_service.rs:358(1 line:Ulid → JWT)
  - server/resources/application.yaml(+2 line:refresh_secret + refresh_expire)
  - server/<bootstrap>(+1 call init_refresh_keys 緊接 init_keys)

  Brainstorm 1 顯式拍板 Q + 3 clarify Q:
  - Brainstorm Q1: RefreshClaims claim shape → 極簡 6 field(無 aud / role / org)
  - Clarify Q1: empty-file fallback → mirror nestjs entrypoint、fallback 到 jwt_secret
  - Clarify Q2: aud field → 不含(極簡延伸)
  - Clarify Q3: unit test → MUST、2 個(generate_refresh_token + secret_loader fallback)

  Acceptance:US1 P1 MVP 3/3(C-V2 login JWT 格式 / C-V3 R-8 修 + R-7 surface /
  C-V4 nestjs log evidence)+ US2 P2 1/1(C-V5 psql JWT format)+ US3 P3 2/2
  (C-V6 secret 對齊)+ unit test 2/2(generate_refresh_token + secret_loader
  empty-file fallback)= 8/8 PASS;base-web + nestjs fork 兩邊零改動(per FR-006
  + FR-009 + Constitution Principle IV);W-FA1 stack 7 service expected state 維持。

  Constitution Check 17 PASS / 11 N/A / 0 violation。解鎖 F10.2 rust-tokenstatus-
  string-align follow-up(R-7 修),Application Phase 4 第二個 feature 完成。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git push origin rev1-admin-rust-api
  ```

### Stage 2 — outer commit(rev1-admin-root via 018 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + docker-compose.yml + INTEGRATION-CHECKLIST.md + .specify/feature.json + CLAUDE.md + rust-api SHA pin):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current  # 預期 018-rust-jwt-refresh-token-signing
  git status --short
  # 預期 modified: CLAUDE.md / docs/INTEGRATION-CHECKLIST.md / .specify/feature.json /
  #            docker-compose.yml / rust-api(new SHA pin)
  # untracked: specs/018-rust-jwt-refresh-token-signing/

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  git add CLAUDE.md \
          docs/INTEGRATION-CHECKLIST.md \
          .specify/feature.json \
          docker-compose.yml \
          specs/018-rust-jwt-refresh-token-signing/ \
          rust-api

  git commit -m "$(cat <<EOF
  feat(spec): F10.1 rust-jwt-refresh-token-signing — R-8 修 + R-7 surface baseline

  outer side of F10.1 application Phase 4 第二個 feature(rust-api worktree 已
  commit + push、本 commit 為 spec docs + docker-compose.yml wire + rust-api SHA pin)。

  改動範圍(outer):
  - specs/018-rust-jwt-refresh-token-signing/{spec, plan, research, data-model,
    quickstart, contracts/verification-commands, checklists/requirements, tasks}.md 新建
  - CLAUDE.md SPECKIT marker 更新(Active feature 改 F10.1)
  - docs/INTEGRATION-CHECKLIST.md F10.1 row + Current Focus + 已完成里程碑
  - docker-compose.yml rust-api service 加 APP_JWT_REFRESH_SECRET_FILE envvar +
    refresh_token_secret secret ref
  - .specify/feature.json 指 specs/018-rust-jwt-refresh-token-signing
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  Acceptance(走完 8/8):見 rust-api worktree commit body 詳細。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  git diff HEAD~1 HEAD --stat
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F10.1 兩段式 commit 已落(rust-api 已推 origin、outer 在本機),要不要 push outer 018-rust-jwt-refresh-token-signing 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    git push origin 018-rust-jwt-refresh-token-signing
    git switch rev1-admin-root
    git merge --no-ff 018-rust-jwt-refresh-token-signing -m "Merge ... F10.1 完成"
    # SHA fill follow-up commit(對齊 W-FA*/F10 pattern)
    git push origin rev1-admin-root
    ```

**Checkpoint**:Phase 8 完成 — F10.1 落地、兩段式 commit 紀律遵守、application Phase 4 第二個 feature 就位、F10.2 rust-tokenstatus-string-align follow-up baseline 明確、base-web + nestjs fork 兩邊零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup | Phase 2 + 3 + 4 + 5 + 6 + 7 + 8 | — |
| Phase 2 Foundational | Phase 3(stack 必須先起、確認 F10 R-8 baseline)| Phase 1 |
| Phase 3 US1(MVP) | Phase 4 + 5 + 7 + 8 | Phase 1 + 2 + rust-api image rebuild |
| Phase 4 US2 | Phase 7 | Phase 3(login 寫 sys_tokens 完成)|
| Phase 5 US3 | Phase 7 | Phase 3(stack with F10.1 image 起後)|
| Phase 6 Zero-regression | Phase 7 | Phase 3 + 5(改動完成後驗 scope)|
| Phase 7 Doc | Phase 8 | Phase 3-6 全 PASS |
| Phase 8 Commit | — | 全 7 phase PASS |

**Story 獨立性檢核**:
- US1(P1 MVP):唯一含 implementation 的 phase(rust source patch + 2 unit test + 3 stack acceptance)
- US2(P2):純 acceptance、依賴 US1 stack 起 + login 完成
- US3(P3):純 acceptance(env grep + secret file check)、依賴 US1 stack 起

實際:**US1 = impl(rust source)+ acceptance(stack);US2/US3 = acceptance only**。

## Parallel Execution

### Phase 1 部分並行
T001 序列(branch + status)、T002 [P] 並行

### Phase 2 序列
T010(stack up + baseline check)序列、blocking Phase 3+

### Phase 3 大幅並行(within phase)
- T020 序列(jwt_config 必先改、其他 file 依賴此 type)
- T021 [P] 並行於 T020 之後(application.yaml 獨立 file、與 secret_loader 並行)
- T022 序列(secret_loader 接 T020 後、依賴 JwtConfig new field)
- T023 [P] 並行於 T022 後(unit test 接 secret_loader 改完)
- T024 序列(jwt.rs RefreshClaims struct 必先)
- T025 [P] 並行於 T024 後(global REFRESH_KEYS 獨立檔)
- T026 序列(jwt.rs generate_refresh_token 接 T024 + T025)
- T027 序列(bootstrap 接 T025 init_refresh_keys call)
- T028 序列(sys_auth_service 接 T026 generate_refresh_token 可用)
- T029 [P] 並行於 T026 + T027 後(unit test 接 jwt.rs 改完)
- T029a [P] 全程可並行(docker-compose.yml 屬 outer file、與 worktree rust patch 獨立、必須在 T031 stack restart 前完成;邏輯位置 = T020 之後任意時點)
- T030 序列(rebuild image 接所有 source 改完)
- T031 序列(restart stack 接 T030 + T029a)
- T032 序列(3 個 inline curl/grep 接 T031)

### Phase 4 序列
T040 接 T032 login 完成後

### Phase 5 序列
T050 接 T031 stack 起後

### Phase 6 全可並行
T060 / T061 全 [P] 並行(獨立 git diff / docker ps)

### Phase 7 部分並行
T070 序列(改 INTEGRATION-CHECKLIST.md)、T071 [P](grep verify)

### Phase 8 嚴格序列
T100 → T101 → T102(兩段式 commit + push wait、無法並行)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 F10.1 R-8 修 + R-7 surface baseline 紀錄、可定義 F10.2 acceptance。US2 + US3 + Zero-regression + Doc + Commit 為驗證 + 收尾 phase。

**MVP commit policy**:推薦走完整 Phase 1-8 一次到位(對齊 F5.1/F6 同 session 模式),不 US1-only commit。

**並行 vs 序列建議**:
- 全 19 task 預估時間 30-60 分鐘(rust image rebuild 占 5-10 min、其他 task 各 1-3 min)
- Critical path:T001 → T002 → T010 → T020 → T022 → T024 → T026 → T027 → T028 → T030(rebuild)→ T031 → T032 → T040 → T050 → T060/T061 → T070 → T100 → T101 → T102

**故障排查**(per quickstart 故障排查段):
- T023/T029 unit test fail:rust code 有 bug,red-green TDD style 修
- T030 build fail:cargo dependency 或 import 缺、檢 build log
- T031 stack restart loop:secret_loader panic、檢 yaml + docker-compose envvar
- T032 C-V2 length=26:image 沒 rebuild、`docker compose build rust-api --no-cache` 強制 rebuild
- T032 C-V2 length>100 但 C-V3 HTTP 500 jwt malformed:nestjs verify fail、可能 secret 不對齊(C-V6 驗)、回 T022 + T024 + T026 檢 generate_refresh_token 是否真用 REFRESH_KEYS
- T032 C-V4 R-7 grep 0 line:nestjs 走別路徑、abort F10.2 重評範疇(per R-5 極低機率)
- T040 rt_len = 26:同 T032 length=26 模式
- T060 git diff > 0 在 base-web/nestjs:意外改動、abort F10.1 + 改正
- T100 conventional commit hook fail:檢 message format、必要時調整 + 新建 NEW commit(per CLAUDE.md §5、不 amend)

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1/US2/US3] | ✓(T020-T032 + T029a [US1] / T040 [US2] / T050 [US3]) |
| Setup / Foundational / Zero-regression / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(per Parallel Execution 段對照) |
| 每個 task 含明確檔案路徑或具體命令 | ✓(全 task 均有命令 inline 或檔案路徑) |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
