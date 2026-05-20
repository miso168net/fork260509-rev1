---
description: "Task list for W-F11 — rust-horizontal-scaling implementation"
---

# Tasks: W-F11 — rust-horizontal-scaling

**Input**: Design documents from `/specs/026-rust-horizontal-scaling/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- W-F11 **無 rust unit test**(per spec FR-019;pub-sub publish/subscribe 為 IO 邊界、無可獨立測之純函式;coherence 屬 stack-level 行為)— 同 F7.1/F8 wiring feature precedent
- **Acceptance**:curl + psql + `docker compose exec`(per spec FR-020、capture→mutate→verify→restore per FR-021)→ 對齊 **9 個 C-V**(per contracts/verification-commands.md C-V1~C-V9)

**Organization**:W-F11 為單一 user story feature(US1 P1)、Setup(2)+ Foundational(1)+ US1 impl(6)+ shared build(2)+ shared acceptance(7)+ Doc(2)+ 兩段式 Commit(3)= **23 task**。實際 impl task 6 個(rust pub-sub 5 + outer config 2、其中 2 個 outer [P])。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Outer(改)**:
  - 改:`docker-compose.prod.yml`(US1、E5 `deploy.replicas: 2`)
  - 改:`deploy/front-nginx/conf.d/default.conf.prod`(US1、E6 nginx upstream resolver)
  - 改:`docs/INTEGRATION-CHECKLIST.md`(W-F11 row + Current Focus + W-F11 mislabel 修正 + Phase W P2 3/3)
  - 改(已由 `/speckit-plan` 完成):`CLAUDE.md` §10 SPECKIT marker(指 026、Phase W P2 3/4→3/3 已修)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
  - 已 commit(brainstorm 階段):`docs/superpowers/026-feature-rust-horizontal-scaling.md`
- **Worktree(改、`rust-api/`、~7-8 file):**
  - 新增:`rust-api/server/global/src/` Casbin pub-sub publisher(`notify_casbin_changed()` + `CASBIN_INVALIDATE_CHANNEL`)
  - 改:`rust-api/server/global/src/lib.rs`(註冊 + re-export publisher)
  - 新建:`rust-api/server/initialize/src/casbin_sync_initialization.rs`(subscriber 背景 task)
  - 改:`rust-api/server/initialize/src/lib.rs`(註冊 + re-export)
  - 改:`rust-api/server/initialize/src/casbin_initialization.rs`(spawn subscriber)
  - 改:`rust-api/server/service/src/admin/sys_authorization_service.rs`(`sync_role_permissions` publish)
  - 改:`rust-api/server/api/src/admin/sys_user_api.rs`(2 endpoint publish)
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-016 + FR-017);rust-api 其他 file 不動;**無 migration、無 DB schema 改**
- **不動**:`docker-compose.yml` / `docker-compose.dev.yml` / `deploy/front-nginx/conf.d/default.conf`(共用)(per FR-010 + FR-013)
- **Acceptance test 執行**:outer repo root(`curl` / `psql` / `docker compose exec` / `git diff` host-side bash)、**prod stack**(replica 只在 prod)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `026-rust-horizontal-scaling` + rust-api worktree branch = `rev1-admin-rust-api`、F8 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F8' | head -2 && (cd rust-api && git branch --show-current)`(預期 outer branch=026-*、rust-api branch=rev1-admin-rust-api、history 含 F8 merge `c2b0912`)

- [ ] T002 [P] 確認 W-F11 acceptance 前置就位,執行 `docker images rust-api:rev1-admin-rust-api -q && ls deploy/dev-certs/fullchain.pem deploy/dev-certs/privkey.pem`(預期 rust-api image SHA 非空 + dev-certs 兩檔存在 — prod stack cert seed 用)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 redis 為 stack 內既有 service(W-F11 pub-sub 依賴)。

- [ ] T010 確認 redis service 與 rust-api 既有 redis 連線基礎就位,執行 `grep -n "redis:" docker-compose.yml | head -2 && grep -rn "GLOBAL_PRIMARY_REDIS" rust-api/server/global/src/global.rs`(預期 redis service 定義存在 + `GLOBAL_PRIMARY_REDIS` 全域存在 — per research R-Q2)

---

## Phase 3: User Story 1 — operator 水平擴展 rust-api 且授權跨 instance 一致(Priority: P1)🎯 MVP

**Goal**:rust-api 新增 Casbin redis pub-sub 一致性機制(publisher + subscriber)+ `docker-compose.prod.yml` `deploy.replicas: 2` + nginx prod upstream auto-discovery,使多 replica 下 Casbin policy 異動跨 instance 一致。

**Independent Test**:prod stack 起 2 replica → exec 進 rust-api-1 改 Casbin policy → exec 進 rust-api-2 驗 enforce 反映新 policy(pub-sub 傳播)→ restore。

### US1 implementation — rust Casbin pub-sub(rust-api worktree、~7-8 file)

- [ ] T020 [US1] 依 data-model.md E2 加 Casbin pub-sub **publisher**(`rust-api/server/global/src/`):
  - 新增 `notify_casbin_changed()` async fn + `pub const CASBIN_INVALIDATE_CHANNEL: &str = "casbin:policy:invalidate";`(新 module 檔或併入既有 `server_global` 檔)
  - 行為:從 `GLOBAL_PRIMARY_REDIS` 取 `RedisConnection::Single(client)` → 開 async 連線 `PUBLISH casbin:policy:invalidate <minimal payload>`;`Cluster` / `None` → log warning no-op;publish 失敗 → log warning、不回傳 error、不 panic(per FR-006)
  - 改 `rust-api/server/global/src/lib.rs` 註冊 + re-export
  - per research R-Q2;放 `server_global` 避 circular dep(`server_service`/`server_api` 皆依賴 `server_global`)

- [ ] T021 [US1] 依 data-model.md E3 新建 Casbin pub-sub **subscriber** 背景 task:
  - 新建 `rust-api/server/initialize/src/casbin_sync_initialization.rs` — `pub fn spawn_casbin_sync_subscriber(enforcer: Arc<RwLock<CachedEnforcer>>)`:`tokio::spawn` 長駐 task、`move` 捕獲 enforcer `Arc`;task 主迴圈 = reconnect loop(從 `GLOBAL_PRIMARY_REDIS` 取 `redis::Client` → 專用 pub-sub 連線 → `subscribe("casbin:policy:invalidate")` → `on_message` loop:每收訊息 `enforcer.write().await.load_policy().await`;斷線/error → log + backoff + 重連;redis 全域未就緒 → 等待重試)
  - 改 `rust-api/server/initialize/src/lib.rs` 註冊 module + re-export `spawn_casbin_sync_subscriber`
  - ⚠️ **`CachedEnforcer` cache 驗證**(analyze M1):enforcer 為 `CachedEnforcer`(會 cache enforce 結果)— 寫 reload 邏輯前先確認 casbin 2.10 `CachedEnforcer::load_policy()` 是否同步清 enforce 結果快取;若否,收到訊息時須在 `load_policy()` 外額外呼叫 cache 清除 API,否則 reload 後舊判斷仍命中 cache、C-V4 會失敗(per data-model E3 設計要點)
  - per research R-Q1 + R-Q2;比照既有 `event_channel_initialization.rs` spawn 模式

- [ ] T022 [US1] 依 data-model.md E3 在 enforcer 建立點 spawn subscriber:
  - 改 `rust-api/server/initialize/src/casbin_initialization.rs` — `initialize_casbin()` 建出 `CasbinAxumLayer` 後、回傳前,取 `layer.get_enforcer()`(`Arc<RwLock<CachedEnforcer>>` clone)、呼叫 `spawn_casbin_sync_subscriber(enforcer)`
  - subscriber 與 axum handler 共用同一 `Arc` enforcer(per research R-Q1 — 不新增全域)

- [ ] T023 [US1] 依 data-model.md E4 在 3 個 Casbin policy 異動點加 publish 呼叫:
  - 改 `rust-api/server/service/src/admin/sys_authorization_service.rs` — `sync_role_permissions` 結尾(`remove_policies` + `add_policies` 都完成後、`Ok(())` 前)呼叫 `notify_casbin_changed().await`
  - 改 `rust-api/server/api/src/admin/sys_user_api.rs` — `SysUserApi::remove_policies` 的 `remove_policies().await` 之後 + `SysUserApi::add_policies` 的 `add_policy().await` 之後,各加 `notify_casbin_changed().await`
  - 必要 import `server_global` 的 publisher;不改既有業務邏輯與 response(per FR-008)
  - per research R-Q3;`assign_routes` / `assign_users` 不 instrument(它們寫 join table、不碰 enforcer)

### US1 implementation — outer 部署配置(可並行 rust patch)

- [ ] T024 [P] [US1] 依 data-model.md E5 改 `docker-compose.prod.yml`:rust-api service 加 `deploy: { replicas: 2 }`;不動 `docker-compose.yml` / `docker-compose.dev.yml`(per FR-009 + FR-010);rust-api service 確認無 `container_name`(per FR-011)

- [ ] T025 [P] [US1] 依 data-model.md E6 改 `deploy/front-nginx/conf.d/default.conf.prod`:`rust_api` upstream 改 `zone rust_api 64k;` + `server rust-api:11081 resolve;` + 加 `resolver 127.0.0.11 valid=10s ipv6=off;`(http context);維持 `keepalive 32`;不動共用 `default.conf`(per FR-012 + FR-013 + FR-014、research R-Q5)

---

## Phase 4: Shared Build + Acceptance(US1)

### Build

- [ ] T030 **C-V1** rebuild rust-api docker image(per quickstart Step 3):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 exit 0。若 fail → check `notify_casbin_changed()` redis API / subscriber task / `casbin_sync_initialization` 註冊。接 T020-T023 done

- [ ] T031 **C-V2** 起 prod stack(cert seed + `deploy.replicas: 2`):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans 2>&1 | tail -2
  docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
    sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait 2>&1 | tail -8
  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
  ```
  預期 rust-api 出現 2 replica(`rev1-admin-rust-api-1` / `-2`)、皆 healthy;migration exited 0;其他 service healthy。接 T030 + T024 + T025

### US1 acceptance(對齊 contracts/verification-commands.md C-V3~C-V9)

- [ ] T032 [US1] **C-V3** nginx upstream auto-discovery(per contracts):`docker compose ... exec front-nginx nginx -T` 確認 `upstream rust_api` 含 `zone` + `server rust-api:11081 resolve`;`exec front-nginx getent hosts rust-api` 回 ≥ 2 IP;經 nginx(`https://127.0.0.1:11443/api/auth/login`)login HTTP 200。接 T031

- [ ] T033 [US1] **C-V4** Casbin 跨 instance 一致性核心測試(capture→mutate-on-replica-1→verify-replica-2→restore、per contracts + spec FR-021):
  - capture:psql 擷取受測 role 對某 `<probe-path>` 的 Casbin policy baseline(該 role 對該 path 無 allow)
  - pre-check:`exec rust-api-2` 受測 role token 打 `<probe-path>` → 預期 deny(`code:5001`)
  - mutate:`exec rust-api-1` 由 ROLE_SUPER `assign-permission` 授予受測 role `<probe-path>` 權限
  - verify:`exec rust-api-2`(未處理該異動)再打 `<probe-path>` → 預期 allow(`code:0`)— 證 pub-sub 傳播;`exec rust-api-1`(self-receive)亦 allow
  - restore:`exec rust-api-1` `assign-permission` 還原受測 role 原權限集;verify rust-api-2 回 deny
  - 接 T032
  > `<probe-path>` / assign-permission body / role token 實際值以 seed 為準、先 psql 確認(per contracts C-V4 註)

- [ ] T034 [P] [US1] **C-V5** JWT 跨 replica 共享(per contracts):經 nginx login 拿 token → 該 token `exec` 到 rust-api-1 與 rust-api-2 各直打 `/auth/getUserInfo` → 兩 replica 皆 HTTP 200。接 T031、可平行於 T032-T033

- [ ] T035 [US1] **C-V6** publish 失敗不阻斷(per contracts、edge case E-1):`docker compose ... stop redis` → `exec rust-api-1` 執行一次 `assign-permission` Casbin 異動 → 預期仍 envelope `code:0`(異動寫 DB 成功)+ rust-api log 出現 publish 失敗 warning;`start redis` 還原。接 T033(redis 停前先完成 T033)

- [ ] T036 [US1] **C-V7** subscriber reconnect(per contracts、edge case E-2):承 T035 redis 重啟後,`exec rust-api-1` 做新 `assign-permission` 異動 → `sleep 2` → `exec rust-api-2` 驗 enforce 反映新異動(reconnect loop 生效)。接 T035

- [ ] T037 **C-V8** dev regression(per contracts):prod stack `down` → 起 dev stack(`-f docker-compose.dev.yml --profile track-a`)→ 確認 rust-api **單一**容器(非 -1/-2)、`127.0.0.1:11081/health` 直連 OK、經 nginx login HTTP 200、6 service healthy。接 T036

- [ ] T038 [P] **C-V9** three-side scope verify(per contracts):
  ```bash
  git diff HEAD -- base-web/ | wc -l                                              # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l                  # 預期 0
  git diff HEAD -- docker-compose.yml docker-compose.dev.yml | wc -l              # 預期 0
  git diff HEAD -- deploy/front-nginx/conf.d/default.conf | wc -l                 # 預期 0
  (cd rust-api && git diff HEAD --stat && git status --short)                     # 預期 ~7-8 file pub-sub
  git status --short
  ```
  預期:base-web/nestjs/dev-compose/共用-nginx-conf 各 0 diff + rust-api ~7-8 file(publisher + subscriber + 3 call-site + 註冊)+ outer scope(`docker-compose.prod.yml` + `default.conf.prod` + `CLAUDE.md` + `INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + rust-api gitlink + `specs/026-*`);無 migration diff。接 T020-T025 後、可平行於 T032-T037

**Checkpoint**:Phase 4 完成 — C-V1~C-V9 acceptance 9/9 PASS。

---

## Phase 5: Documentation Update

- [ ] T040 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-022):
  - **修正 W-F11 mislabel**:CHECKLIST §11.2 / Current Focus / next-step 的「W-F11 observability」改為「W-F11 rust-horizontal-scaling」;「W-2 P2:3/4、剩 W-F11」改為「W-2 P2:3/3 完成(W-F5/W-F6/W-F7)」;W-F11 歸 Phase W-4 P4
  - Current Focus 更新(Phase / Active feature 改 W-F11、W-F11 outer commit pending push)
  - 已完成里程碑加 W-F11 條目(對齊 F8 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - Phase W deploy roadmap 表加 W-F11 row(或更新狀態);observability(W-F12-14)為後續候選

- [ ] T041 [P] **doc grep verify**:
  ```bash
  grep -cE "W-F11|rust-horizontal-scaling" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep -n "observability" docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期:CLAUDE.md + INTEGRATION-CHECKLIST.md 多處 W-F11 引用;`observability` 不再與 W-F11 綁定(W-F11 mislabel 已修正)

**Checkpoint**:Phase 5 完成 — doc 改動到位、W-F11 mislabel 修正、Phase 6 commit。

---

## Phase 6: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F5.1/F6/F10.x/F11/F9/F7/F7.1/F7.2/F8 慣例)

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 ~7-8 file pub-sub
  git add server/global/src/ server/initialize/src/ \
          server/service/src/admin/sys_authorization_service.rs \
          server/api/src/admin/sys_user_api.rs
  git commit -m "$(cat <<'EOF'
  feat(rust-api): W-F11 加 Casbin redis pub-sub 跨 instance 一致性

  Phase W deploy Phase W-4(P4)— rust-api 水平擴展的 Casbin 一致性前提。

  多 replica 下各 instance 的記憶體 Casbin enforcer 各自獨立,policy 異動只
  生效於處理該請求的 instance;本 commit 加 redis pub-sub 廣播使全部 instance
  收斂。

  改動(rust-api、~7-8 file):
  - server/global/src — 加 notify_casbin_changed() publisher + CASBIN_INVALIDATE
    _CHANNEL 常數(放 server_global 避 circular dep)
  - server/initialize/src/casbin_sync_initialization.rs(新建)— subscriber 背景
    task:訂閱 casbin:policy:invalidate、收到訊息對 enforcer load_policy() full
    reload、reconnect loop
  - server/initialize/src/casbin_initialization.rs — initialize_casbin 內就地
    spawn subscriber、move 捕獲 enforcer Arc(不新增全域)
  - server/service/.../sys_authorization_service.rs + server/api/.../sys_user_api.rs
    — 3 個 Casbin policy 異動點加 notify_casbin_changed() publish 呼叫

  publish 為 fire-and-forget:redis 不可用只 log warning、不阻斷 policy 異動;
  full load_policy() reload(policy 集小、無 incremental drift);pub-sub code
  永遠啟用、不靠環境分支(dev 單實例 self-publish/subscribe 無 harm)。

  落實 Constitution 架構約束「Casbin policy 變更走 casbin:policy:invalidate
  channel」。Constitution Check 5 PASS / 0 N/A / 0 violation。

  無 migration、無 DB schema 改。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit(rev1-admin-root via 026 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + `docker-compose.prod.yml` + nginx prod conf + rust-api SHA pin + CLAUDE.md + INTEGRATION-CHECKLIST;**有 docker-compose.prod.yml 改、無 migration**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 026-rust-horizontal-scaling
  git status --short

  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  RUST_API_SUBJECT=$(cd rust-api && git log -1 --format=%s)

  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

  git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md docker-compose.prod.yml \
          deploy/front-nginx/conf.d/default.conf.prod \
          .specify/feature.json rust-api specs/026-rust-horizontal-scaling/

  git commit -m "$(cat <<EOF
  feat(spec): W-F11 rust-horizontal-scaling — Casbin pub-sub + compose replicas + nginx upstream

  outer side of W-F11 — rust-api worktree 已 commit ${RUST_API_SHORT_SHA}、本 commit
  為 docker-compose.prod.yml + nginx prod conf + rust-api SHA pin + spec docs +
  CLAUDE.md SPECKIT marker + INTEGRATION-CHECKLIST(含 W-F11 mislabel 修正)。

  改動範圍(outer):
  - docker-compose.prod.yml — rust-api deploy.replicas: 2
  - deploy/front-nginx/conf.d/default.conf.prod — rust_api upstream resolver-based
    auto-discovery(resolver 127.0.0.11 + zone + server ... resolve)
  - docs/INTEGRATION-CHECKLIST.md — W-F11 row + Current Focus + 修正 W-F11
    mislabel(observability → rust-horizontal-scaling)+ Phase W P2 3/4 → 3/3
  - CLAUDE.md SPECKIT marker(Active feature 改 W-F11 026-*)
  - specs/026-rust-horizontal-scaling/(spec/plan/research/data-model/contracts/quickstart/tasks)
  - chore(submodule): bump rust-api 到 ${RUST_API_SHORT_SHA} — ${RUST_API_SUBJECT}

  **無 migration、無 DB schema 改**;dev compose + 共用 nginx conf 零改動。

  Acceptance C-V1~C-V9 = 9/9 PASS:見 rust-api ${RUST_API_SHORT_SHA} commit body。

  Constitution Check 5 PASS / 0 N/A / 0 violation;base-web + nestjs fork
  兩邊 zero diff。W-F11 為 Phase W-4(P4)第一個 feature。

  outer + merge SHA 留 \`<sha-pending>\` placeholder、SHA fill follow-up 對齊
  F7/F8 等 pattern、merge 後再補。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"

  git log --oneline -1
  ```

### Stage 3 — Push 等 user 同意

- [ ] T102 Push 等 user 同意:
  - 告知 user:「W-F11 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push outer 026-rust-horizontal-scaling 到 origin + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push outer**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 026-rust-horizontal-scaling
    git switch rev1-admin-root
    git merge --no-ff 026-rust-horizontal-scaling -m "Merge branch '026-rust-horizontal-scaling' into rev1-admin-root: W-F11 完成"
    OUTER_SHA=$(git log --oneline | grep "feat(spec): W-F11 rust-horizontal-scaling" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): W-F11 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```

**Checkpoint**:Phase 6 完成 — W-F11 落地、兩段式 commit 紀律遵守、base-web + nestjs fork 兩邊零改動、push 等 user 同意、Phase W-4(P4)第一個 feature 完成。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-6 | — |
| Phase 2 Foundational(T010) | Phase 3 | Phase 1 |
| Phase 3 US1 impl(T020-T025) | Phase 4 build | Phase 1 + 2 |
| Phase 4 build(T030+T031) | Phase 4 acceptance + 5 + 6 | T020-T025 |
| Phase 4 acceptance(T032-T038) | Phase 5 | T031(T038 接 T020-T025 後) |
| Phase 5 Doc(T040-T041) | Phase 6 | Phase 4 全 PASS |
| Phase 6 Commit(T100-T102) | — | 全 5 phase PASS |

**rust impl 內部依賴**:T020(publisher)先於 T023(call site 用 publisher);T021(subscriber)先於 T022(spawn subscriber);T024 / T025 為 outer config、獨立於 rust patch([P])。

**Story 獨立性檢核**:
- US1(P1 MVP):rust pub-sub(publisher T020 + subscriber T021 + spawn T022 + call-site T023)+ outer config(replicas T024 + nginx T025)+ acceptance C-V1~C-V9
- 單一 user story、無跨 story 依賴

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 3**:rust patch 有內部序(T020→T023、T021→T022);T024 + T025(outer config)[P]、可平行於整個 rust patch
- **Phase 4**:T030→T031 序列(build→prod stack);T032→T033 序列;T034 [P](JWT、接 T031);T035→T036 序列(redis stop→reconnect、接 T033 後);T037(dev regression、接 T036);T038 [P](scope)
- **Phase 5**:T040 序列、T041 [P]
- **Phase 6**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 Casbin pub-sub 一致性機制 + prod replica 配置就位;build + acceptance + doc + commit 為驗證 + 收尾。

**MVP commit policy**:推薦走完整 Phase 1-6 一次到位(對齊 F5.1/F6/F10.x/F11/F9/F7/F7.1/F7.2/F8 同 session 模式)。

**全 23 task 預估時間**:40-60 分鐘(rust image rebuild 占 2-3 min、prod stack 起含 cert seed ~1-2 min、subscriber/publisher 實作為主要 impl 工作、acceptance C-V4 coherence 測試含 capture/restore ~數分鐘)。

**Critical path**:T001 → T002 → T010 → T020/T021 → T022/T023 → (T024/T025 並行)→ T030 → T031 → T032 → T033 → T035 → T036 → T037 →(T034/T038 並行)→ T040/T041 → T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1] | ✓(T020-T025 / T032 / T033 / T034 / T035 / T036 [US1]) |
| Setup / Foundational / shared build / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(T002/T024/T025/T034/T038/T041 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
