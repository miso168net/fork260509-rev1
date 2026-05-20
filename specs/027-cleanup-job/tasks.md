---
description: "Task list for F12 — cleanup-job implementation"
---

# Tasks: F12 — cleanup-job

**Input**: Design documents from `/specs/027-cleanup-job/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- F12 **有純函式 rust unit test**(per spec FR-025;retention 字串 parse/validate、retention→cutoff timestamp、dry-run 報表格式為純函式)— 與 W-F11 wiring feature 不同;物理刪除為 DB IO 邊界、不寫 unit test
- **Acceptance**:psql + `docker compose run/exec`(per spec FR-023、植入 `f12-test-*` 過期軟刪 row→驗→清理)→ 對齊 **9 個 C-V**(per contracts/verification-commands.md C-V1~C-V9)

**Organization**:F12 為單一 user story feature(US1 P1)、Setup(2)+ Foundational(2)+ US1 impl(5)+ shared build/acceptance(9)+ Doc(2)+ 兩段式 Commit(3)= **23 task**。實際 impl task 5 個(新 crate skeleton + main.rs + Dockerfile + 2 個 outer config [P])。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1 標籤;Setup / Foundational / Doc / Polish 無標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`、worktree = `rust-api/`

## Path Conventions

- **Worktree(改、`rust-api/`):**
  - 新建:`rust-api/server/cleanup/Cargo.toml`(package `server-cleanup`、`[[bin]]` cleanup)
  - 新建:`rust-api/server/cleanup/src/main.rs`(cleanup binary 全部邏輯)
  - 改:`rust-api/Cargo.toml`(`[workspace] members` 加 `"server/cleanup"`)
  - 改:`rust-api/Dockerfile`(`cargo build` 加 `--bin cleanup` + `COPY` cleanup binary)
- **Outer(改):**
  - 改:`docker-compose.yml`(加 `cleanup` service、`profiles: ["jobs"]` + `secrets:` 註冊 `cleanup_database_url`)
  - 新建:`deploy/cleanup/setup-role.sql`(`cleanup_job` PG role + `GRANT`、`DO` block idempotent)
  - 改:`docs/INTEGRATION-CHECKLIST.md`(F12 row + Current Focus + 完成里程碑)
  - 改(已由 `/speckit-plan` 完成):`CLAUDE.md` §10 SPECKIT marker(指 027)
  - 改(spec-kit 機制):`.specify/feature.json`(已自動更新)
  - 已 commit(brainstorm 階段):`docs/superpowers/027-feature-cleanup-job.md`
- **Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` 全程不動(per FR-019 + FR-020);rust-api 其他既有 file 不動;**無 migration、無 DB schema 改、不碰 `casbin_rule`**
- **不動**:`docker-compose.dev.yml` / `docker-compose.prod.yml`(per FR-024)
- **Acceptance test 執行**:outer repo root(`psql` / `docker compose run` / `docker compose exec` host-side bash)、**dev stack**(F12 cleanup service 跨環境一致、dev 跑)

---

## Phase 1: Setup(Shared Infrastructure)

- [ ] T001 確認當前 outer branch = `027-cleanup-job` + rust-api worktree branch = `rev1-admin-rust-api`、W-F11 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'W-F11' | head -2 && (cd rust-api && git branch --show-current)`(預期 outer branch=027-*、rust-api branch=rev1-admin-rust-api、history 含 W-F11 merge `d2d4c4c`)

- [ ] T002 [P] 確認 F12 acceptance 前置就位,執行 `docker images rust-api:rev1-admin-rust-api -q && ls deploy/dev-certs/fullchain.pem 2>/dev/null; grep -rn '\[\[bin\]\]' rust-api/migration/Cargo.toml rust-api/server/bin/Cargo.toml`(預期 rust-api image SHA 非空 + 既有 multi-binary 模式參考就位)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**:確認 F2/F3 預埋的 audit + soft-delete 元件就位(F12 全部重用、不新增機制)。

- [ ] T010 確認 F12 重用的 F2/F3 元件存在,執行:
  ```bash
  grep -rn "pub async fn write_in_txn" rust-api/server/model/src/admin/audit_log.rs
  grep -rn "fn system" rust-api/server/core/src/web/audit.rs
  grep -rnE "HardDelete|Cleanup" rust-api/server/core/src/web/audit.rs | head -4
  grep -rn "fn audit_snapshot" rust-api/server/model/src/admin/audit_serialize.rs
  grep -c "impl SoftDeletable" rust-api/server/model/src/admin/soft_delete_impls.rs
  ```
  預期:`write_in_txn` 存在 + `Actor::system` 存在 + `AuditOperation::HardDelete` / `AuditSource::Cleanup` 存在 + `audit_snapshot` 存在 + 7 個 `SoftDeletable` impl(per research R-Q1/R-Q2/R-Q3)

- [ ] T011 確認 7 張軟刪表之間的 FK 拓樸(供 T021 決定 per-row hard-delete 安全順序、解 analyze finding F1),執行:
  ```bash
  grep -rinE "foreign|references|\.to\(|\.from\(" rust-api/migration/src/schemas/ rust-api/migration/src/datas/ \
    | grep -iE "sys_user|sys_role|sys_menu|sys_domain|sys_organization|sys_endpoint|sys_access_key"
  ```
  記錄 7 表彼此間有無 DB-level FK constraint + 各 FK 的 `ON DELETE` 行為。結論交 T021:**無跨表 FK** → sweep 順序任意;**有跨表 FK** → T021 以「referencing 表先刪、referenced 表後刪」排序、同表 self-ref 階層(`sys_menu` / `sys_organization` 若有 parent 欄)child 先於 parent;殘留撞 FK 的 row 由 T021 log-and-continue 兜底(per data-model E4 / spec FR-013)。

---

## Phase 3: User Story 1 — operator 定期物理清除過期軟刪資料(Priority: P1)🎯 MVP

**Goal**:rust workspace 新增獨立 `cleanup` binary(複用 rust-api image)、物理刪除 7 張軟刪表過期 row + 寫 `HARD_DELETE` audit;outer 加 docker-compose `cleanup` service + `cleanup_job` 最小權限 role。

**Independent Test**:psql 植入 `deleted_at` 超過保留期的測試 row → `cleanup` dry-run 驗報表(不刪)→ `cleanup --execute` 驗 row 物理消失 + `sys_operation_log` 多 `HARD_DELETE` → 重跑驗 idempotent。

### US1 implementation — rust cleanup binary(rust-api worktree)

- [ ] T020 [US1] 依 data-model.md E1 新建 `server/cleanup` crate skeleton:
  - 新建 `rust-api/server/cleanup/Cargo.toml` — package `server-cleanup`、`[[bin]] name = "cleanup"` `path = "src/main.rs"`;dep:`server-model`(`path = "../model"`)、`server-core`(`path = "../core"`)、`sea-orm`(workspace)、`tokio`(workspace、`rt-multi-thread` + `macros`)、`chrono`(workspace)、(選)`tracing`(workspace)
  - 改 `rust-api/Cargo.toml` — `[workspace] members` 加 `"server/cleanup"`
  - per research R-Q1 dep set;比照 `migration` crate 為同級獨立 job crate

- [ ] T021 [US1] 依 data-model.md E2-E5 實作 `rust-api/server/cleanup/src/main.rs`(cleanup binary 全部邏輯、~150-200 LOC):
  - `#[tokio::main]` entry;讀 `CLEANUP_RETENTION_DAYS` env(預設 90)→ parse/validate → 無效(非正整數)log error + `exit(非 0)`、不連 DB(E2、per FR-007)
  - `cutoff = Utc::now() - Duration::days(retention)`
  - 掃 `std::env::args()` 判斷 dry-run(預設)/ `--execute`(E3、單一旗標、不引 arg framework)
  - `Database::connect(env DATABASE_URL)`(per research R-Q4)
  - 7 表 per-table sweep(`sys_user`/`sys_role`/`sys_menu`/`sys_domain`/`sys_organization`/`sys_endpoint`/`sys_access_key`):`SELECT deleted_at < cutoff` 的 row(E4);7 個 per-entity block(`sys_menu` i32 PK、其餘 String PK、per research R-Q2)
  - **sweep 順序**:依 T011 的 FK 拓樸結論排 per-table sweep 順序(無跨表 FK → 任意;有 FK → referencing 先於 referenced、self-ref 階層 child 先於 parent);殘留 FK 衝突 row 由下方 log-and-continue 兜底(解 analyze F1)
  - dry-run:印「各表 N row 將刪 + 總計」報表、不刪不寫(E3、per FR-004/FR-015)
  - `--execute`:每筆 row 開 per-row transaction → `write_in_txn(&txn, AuditEvent{ Actor::system("cleanup_job"), AuditOperation::HardDelete, AuditSource::Cleanup, entity_type, entity_id, payload_before: audit_snapshot(&model), payload_after: None })` + `Entity::delete_many().filter(pk eq id).exec(&txn)` → `commit`(E4/E5、per FR-009/FR-011/FR-014)
  - 單筆 txn 失敗 → log error + continue(log-and-continue、per FR-013/E-3);exit code:全成功 0、有失敗非 0(per FR-008)
  - **rust unit test**(per FR-025):retention 字串 parse/validate(空/0/負/非數字 → Err)、retention→cutoff timestamp、dry-run 報表格式 — 純函式、`#[cfg(test)]`
  - per data-model E2-E5;不依賴 `server-config`(per research R-Q4)

- [ ] T022 [US1] 依 data-model.md E1 改 `rust-api/Dockerfile`:
  - `cargo build --release` 加 `--bin cleanup`
  - `cp target/release/cleanup /tmp/cleanup` + `strip` 納入 cleanup
  - 加 `COPY --from=builder /tmp/cleanup /usr/local/bin/cleanup`
  - 比照既有 `server` / `migration` 兩 binary 的 build + COPY 模式

### US1 implementation — outer 部署配置(可並行 rust patch)

- [ ] T023 [P] [US1] 依 data-model.md E7 改 `docker-compose.yml`:加 `cleanup` service(`image: rust-api:...` 複用、`profiles: ["jobs"]`、`entrypoint` shell wrapper `cat /run/secrets/cleanup_database_url` 注入 `DATABASE_URL` + `exec /usr/local/bin/cleanup "$@"` 透傳、`environment` `CLEANUP_RETENTION_DAYS`、`secrets: [cleanup_database_url]`、`depends_on postgres healthy`、`restart: "no"`)+ 頂層 `secrets:` 區塊註冊 `cleanup_database_url`(指 `deploy/secrets/cleanup_database_url.txt`);不動 `docker-compose.dev.yml` / `docker-compose.prod.yml`(per FR-024)

- [ ] T024 [P] [US1] 依 data-model.md E6 新建 `deploy/cleanup/setup-role.sql`:`cleanup_job` PG role — `CREATE ROLE` 包 `DO` block + `IF NOT EXISTS (SELECT FROM pg_roles ...)`、role 密碼用 `psql` 變數 `:'cleanup_pw'`;`GRANT SELECT, DELETE ON` 7 張軟刪表 + `GRANT SELECT, INSERT ON sys_operation_log` + `GRANT USAGE ON SCHEMA public`(+ 視 `sys_operation_log` PK 為 sequence 補 `GRANT USAGE ON SEQUENCE`);idempotent(可重跑)、per research R-Q5

---

## Phase 4: Shared Build + Acceptance(US1)

### Build

- [ ] T030 **C-V1** rebuild rust-api docker image(per quickstart Step 1):
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  docker run --rm --entrypoint sh rust-api:rev1-admin-rust-api -c "ls -l /usr/local/bin/cleanup /usr/local/bin/server /usr/local/bin/migration"
  ```
  預期 exit 0 + image 內 3 個 binary(cleanup/server/migration)。若 fail → check `server/cleanup/Cargo.toml` dep / `rust-api/Cargo.toml` workspace members / Dockerfile。接 T020-T022

- [ ] T031 **C-V2 + C-V8(起 stack)** 起 dev stack + 建 `cleanup_job` role:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"   # 確認 cleanup 不在(profile-gated)
  echo 'postgres://cleanup_job:f12testpw@postgres:5432/soybean_admin_rust' > deploy/secrets/cleanup_database_url.txt
  docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -v cleanup_pw="'f12testpw'" -f - < deploy/cleanup/setup-role.sql
  ```
  + 重跑 setup SQL 驗 idempotent + `has_table_privilege` 驗最小權限(per contracts C-V2)。預期 dev stack service 全 healthy、`cleanup` service 不自動起、`cleanup_job` role 權限恰最小集。接 T030 + T023 + T024

### US1 acceptance(對齊 contracts/verification-commands.md C-V3~C-V9)

- [ ] T032 [US1] **C-V3** dry-run 不刪不寫(per contracts):psql 植入過期軟刪 `f12-test-ep-1`(`sys_endpoint`、`deleted_at` = 365 天前)→ `docker compose ... run --rm cleanup`(無旗標)→ 驗報表列出待刪 row、`f12-test-ep-1` 仍在、`sys_operation_log` 未增。接 T031

- [ ] T033 [US1] **C-V4** `--execute` 物理刪 + `HARD_DELETE` audit 核心測試(per contracts + spec FR-009/FR-014):承 T032 → `docker compose ... run --rm cleanup --execute` → 驗 `f12-test-ep-1` 物理消失 + `sys_operation_log` 出現 `operation=HARD_DELETE`、`user_id=username=cleanup_job`、`entity_type=sys_endpoint`、`entity_id=f12-test-ep-1`、`payload_before` 非 null、`payload_after` null。接 T032

- [ ] T034 [P] [US1] **C-V5** 未到保留期 row 不刪(per contracts):psql 植入 `f12-test-ep-recent`(`deleted_at` = 1 天前)→ `cleanup --execute` → 驗該 row 仍在 → psql 清理該測試 row。接 T031、可平行於 T032-T033

- [ ] T035 [US1] **C-V6** idempotent 重跑(per contracts):承 T033 → 記錄 `sys_operation_log` 筆數 → 再跑 `cleanup --execute` → 驗報告 0 筆待刪、`sys_operation_log` 筆數不變。接 T033

- [ ] T036 [P] [US1] **C-V7** retention 無效拒跑(per contracts、spec E-1):`docker compose ... run --rm -e CLEANUP_RETENTION_DAYS=abc cleanup --execute`(及 `-5` / `0`)→ 驗三者皆拒跑、exit≠0、log error、不刪任何 row。接 T031、可平行

- [ ] T037 **C-V8** dev stack regression(per contracts):確認 `docker compose ps` 中 `cleanup` service 不在運行容器(profile `jobs` 未啟用)、既有 dev stack service 全 healthy、`curl 127.0.0.1:11081/health` 正常。接 T031(stack 已起)

- [ ] T038 [P] **C-V9** three-side scope verify(per contracts):
  ```bash
  git diff HEAD -- base-web/ | wc -l                                       # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l           # 預期 0
  git diff HEAD -- docker-compose.dev.yml docker-compose.prod.yml | wc -l  # 預期 0
  (cd rust-api && git diff HEAD -- migration/ | wc -l)                     # 預期 0(無新 migration)
  (cd rust-api && git diff HEAD --stat && git status --short)              # 新 crate server/cleanup + Cargo.toml + Dockerfile
  git status --short
  ```
  預期:base-web/nestjs/dev+prod-compose/migration 各 0 diff + rust-api(新 crate `server/cleanup/` + `Cargo.toml` + `Dockerfile`)+ outer scope(`docker-compose.yml` + `deploy/cleanup/setup-role.sql` + `CLAUDE.md` + `INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + rust-api gitlink + `specs/027-*`);`casbin_rule` 0 改動。接 T020-T024 後、可平行於 T032-T037

**Checkpoint**:Phase 4 完成 — C-V1~C-V9 acceptance 9/9 PASS;測試 `f12-test-*` row 已清理(無 seed 污染)。

---

## Phase 5: Documentation Update

- [ ] T040 改 `docs/INTEGRATION-CHECKLIST.md`(per FR-026):
  - Application Phase 4 Roadmap 表 F12 row 的 spec / plan / tasks / impl 欄推進(brainstorm 已 ✅;spec/plan/tasks 落地後改 ✅)
  - 已完成里程碑加 F12 條目(對齊 F8/W-F11 同 style + 兩段式 commit、SHA placeholder `<sha-pending>`)
  - Current Focus 更新(Phase / Active feature 改 F12 落地、下一步推進)
  - F12 為 **DESIGN-A 本體(F1–F12)收尾** — 對應段落註記

- [ ] T041 [P] **doc grep verify**:
  ```bash
  grep -cE "F12|cleanup-job" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
  grep -n "027-cleanup-job" CLAUDE.md docs/INTEGRATION-CHECKLIST.md | head -5
  ```
  預期:CLAUDE.md + INTEGRATION-CHECKLIST.md 多處 F12 引用、027-cleanup-job 連結正確

**Checkpoint**:Phase 5 完成 — doc 改動到位、Phase 6 commit。

---

## Phase 6: Polish & 兩段式 Commit + Push wait(per CLAUDE.md §6.1 F8/W-F11 慣例)

### Stage 1 — worktree commit(rust-api)

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 server/cleanup/ 新 + Cargo.toml + Dockerfile + Cargo.lock
  git add Cargo.toml Cargo.lock Dockerfile server/cleanup/
  git commit -m "feat(rust-api): F12 cleanup-job — 新增 cleanup binary 物理刪除過期軟刪 row"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit(rev1-admin-root via 027 feature branch)

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + `docker-compose.yml` + `deploy/cleanup/setup-role.sql` + rust-api SHA pin + CLAUDE.md + INTEGRATION-CHECKLIST;**有 docker-compose.yml 改、無 migration**):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 027-cleanup-job
  RUST_API_SHORT_SHA=$(cd rust-api && git rev-parse --short HEAD)
  sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHORT_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
  git add CLAUDE.md docs/INTEGRATION-CHECKLIST.md docker-compose.yml deploy/cleanup/ \
          .specify/feature.json rust-api specs/027-cleanup-job/
  git commit -m "feat(spec): F12 cleanup-job — cleanup service + cleanup_job role + spec docs"
  ```
  > outer commit 訊息帶 rust-api 短 SHA + fork 提交主旨;outer + merge SHA 留 `<sha-pending>` placeholder、merge 後 T102 補

- [ ] T102 Push 等 user 同意:
  - 告知 user:「F12 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後跑 push + merge sequence:
    ```bash
    cd rust-api && git push origin rev1-admin-rust-api && cd ..
    git push origin 027-cleanup-job
    git switch rev1-admin-root
    git merge --no-ff 027-cleanup-job -m "Merge branch '027-cleanup-job' into rev1-admin-root: F12 完成"
    OUTER_SHA=$(git log --oneline | grep "feat(spec): F12 cleanup-job" | awk '{print $1}')
    MERGE_SHA=$(git log --oneline -1 | awk '{print $1}')
    sed -i "s/outer \`<sha-pending>\` + merge \`<sha-pending>\`/outer \`${OUTER_SHA}\` + merge \`${MERGE_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md
    git add docs/INTEGRATION-CHECKLIST.md
    git commit -m "docs(checklist): F12 SHA 填入(outer ${OUTER_SHA} + merge ${MERGE_SHA})"
    git push origin rev1-admin-root  # 等 user 二次同意 default branch push
    ```

**Checkpoint**:Phase 6 完成 — F12 落地、兩段式 commit 紀律遵守、base-web + nestjs 兩邊零改動、push 等 user 同意、**DESIGN-A 本體(F1–F12)收尾**。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-6 | — |
| Phase 2 Foundational(T010+T011) | Phase 3 | Phase 1 |
| Phase 3 US1 impl(T020-T024) | Phase 4 build | Phase 1 + 2 |
| Phase 4 build(T030+T031) | Phase 4 acceptance + 5 + 6 | T020-T024 |
| Phase 4 acceptance(T032-T038) | Phase 5 | T031 |
| Phase 5 Doc(T040-T041) | Phase 6 | Phase 4 全 PASS |
| Phase 6 Commit(T100-T102) | — | 全 5 phase PASS |

**rust impl 內部依賴**:T011(7 表 FK 拓樸)先於 T021(決定 per-table sweep 安全順序);T020(crate skeleton)先於 T021(main.rs);T021 先於 T022(Dockerfile build 需 main.rs);T023 / T024 為 outer config、獨立於 rust patch([P])。

**Story 獨立性檢核**:
- US1(P1 MVP):rust cleanup binary(crate T020 + main.rs T021 + Dockerfile T022)+ outer config(compose T023 + role SQL T024)+ acceptance C-V1~C-V9
- 單一 user story、無跨 story 依賴

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 3**:rust patch 有內部序(T020→T021→T022);T023 + T024(outer config)[P]、可平行於整個 rust patch
- **Phase 4**:T030→T031 序列(build→stack+role);T032→T033→T035 序列(dry-run→execute→idempotent);T034 [P] + T036 [P](未到期 / retention 無效、接 T031);T037(regression);T038 [P](scope)
- **Phase 5**:T040 序列、T041 [P]
- **Phase 6**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 cleanup binary + compose service + role 就位;build + acceptance + doc + commit 為驗證 + 收尾。

**MVP commit policy**:推薦走完整 Phase 1-6 一次到位(對齊 F8/W-F11 同 session 模式)。

**全 22 task 預估時間**:40-60 分鐘(rust image rebuild 占 2-3 min、dev stack 起 ~1-2 min、cleanup binary 實作為主要 impl 工作、acceptance C-V3-C-V7 含植入/清理測試 row ~數分鐘)。

**Critical path**:T001 → T002 → T010 → T011 → T020 → T021 → T022 →(T023/T024 並行)→ T030 → T031 → T032 → T033 → T035 → T037 →(T034/T036/T038 並行)→ T040/T041 → T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1] | ✓(T020-T024 / T032 / T033 / T034 / T035 / T036 [US1]) |
| Setup / Foundational / shared build / Doc / Polish 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓(T002/T023/T024/T034/T036/T038/T041 標 [P]) |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或直接 `/speckit-implement`**。
