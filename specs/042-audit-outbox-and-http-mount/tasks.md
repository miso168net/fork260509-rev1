---
description: "Task list for 042 audit-outbox-and-http-mount"
---

# Tasks: 042 audit-outbox-and-http-mount

**Input**: Design documents from `/specs/042-audit-outbox-and-http-mount/`
**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/verification-commands.md](./contracts/verification-commands.md), [quickstart.md](./quickstart.md)

**Tests**: 本 feature 含 1 個 pure fn unit test（`url_to_entity_type` per data-model E2）+ acceptance C-V1~C-V11 全覆蓋。Drainer batch logic 為 wiring（mock DB + mock Redis 測試 ROI 低）、由 C-V5/C-V7/C-V8 integration 形式涵蓋；middleware mount + audit helper refactor 為形狀對映、由 C-V3/C-V4 acceptance 覆蓋。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) 紀律「無新純函式測試時由 acceptance 覆蓋、明示理由」。

**Organization**：依 spec.md 三個 user story（US1 P1 / US2 P2 / US3 P3）+ Setup / Foundational / Polish 分 phase；每 phase 內標 [P] 平行可跑 task。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：不同檔、無 incomplete dependency、可平行跑
- **[Story]**：對應 spec.md user story
- 每 task 含 exact file path 與具體動作

---

## Phase 1: Setup（Shared Infrastructure）

無 setup task（本 feature 無 project init、無新 crate、無新 build system 配置）。

---

## Phase 2: Foundational（Blocking Prerequisites）

**Purpose**：sys_audit_outbox 表 + Sea-ORM entity + config struct 為所有 user story 共用前置；建完才能進 US1 P1 主體實作。

- [x] T001 [P] Create migration file `rust-api/migration/src/schemas/m20260524_e_audit_outbox_table.rs`（up + down）— per quickstart §1.1 template、執行 `CREATE TABLE sys_audit_outbox` (BIGSERIAL + JSONB + partial index)、down 為 `DROP TABLE IF EXISTS`、用 `execute_unprepared` multi-statement（per research R-7 039 落地教訓）。
- [x] T002 Register migration in `rust-api/migration/src/schemas/mod.rs` (+1 line `pub mod m20260524_e_audit_outbox_table;`) + `rust-api/migration/src/lib.rs` Migrator::migrations() vec (+1 line `Box::new(schemas::m20260524_e_audit_outbox_table::Migration),`)（depends on T001）。
- [x] T003 [P] Create Sea-ORM entity `rust-api/server/model/src/admin/entities/sys_audit_outbox.rs` + register in `entities/mod.rs` (+1 line) + `entities/prelude.rs` (+1 line re-export `Entity as SysAuditOutbox`)— per quickstart §1.4 + data-model E1 6-column schema。
- [x] T004 [P] Create config struct `rust-api/server/config/src/model/audit_outbox_config.rs` (AuditOutboxConfig + Default impl: batch_size=100, sleep_ms=100, max_retry=5, redis_stream_maxlen=10000) + register in `config/src/model/mod.rs` + `config/src/model/config.rs::Config` (+1 field) — per research R-8。
- [x] T005 [P] Add `audit_outbox:` section to `rust-api/server/resources/application.yaml` + `application-test.yaml`（drainer_batch_size: 100, drainer_sleep_interval_ms: 100, drainer_max_retry: 5, redis_stream_maxlen_approx: 10000）— per research R-8。
- [x] T006 Run migration via dev stack: `$PC up -d migration --force-recreate --wait` + verify `\d sys_audit_outbox` shows 6 column + partial index `idx_sys_audit_outbox_pending`（depends on T002）。對應 C-V2。

**Checkpoint**：sys_audit_outbox 表存在、entity 可用、config 可讀；可進 US1 主體。

---

## Phase 3: User Story 1 — Forensic 雙視角 + 0-loss outbox（Priority: P1）🎯 MVP

**Goal**：admin write 自動產 2 row（INTERNAL + HTTP）、Redis 或 sys_operation_log 暫斷不丟、drainer 異步消化 outbox。

**Independent Test**：dev stack 健康下、POST /api/role → 1 秒內 sys_operation_log 2 row（per US1 Acceptance Scenario 1）；Redis 暫停期 outbox 累積 + 恢復後消化（per US1 AS-2/3）。

### Implementation for User Story 1

- [x] T007 [P] [US1] Pure fn `url_to_entity_type(url: &str) -> &'static str` + unit-test — 新增於 `rust-api/server/model/src/admin/audit_log.rs`（或新 `rust-api/server/core/src/web/url_entity_type.rs`、implementer 判斷）；unit-test 覆蓋 data-model E2 完整 table、檔案 `rust-api/server/model/tests/url_entity_type.rs`（per CLAUDE.md §3「有可獨立測純函式邏輯 → test-first」紀律）。
- [x] T008 [P] [US1] `AuditEventFull` + `HttpExtras` Rust struct — 加到 `rust-api/server/model/src/admin/audit_log.rs`（Serialize + Deserialize、含 `#[serde(flatten)]` event + skip_serializing_if Option http_extras）。
- [x] T009 [US1] Refactor `audit_log::write_in_txn` 內部目標改 outbox（caller API 不變）— `rust-api/server/model/src/admin/audit_log.rs`：移除直接 INSERT sys_operation_log 邏輯、改 serde_json::to_value(AuditEventFull) → INSERT sys_audit_outbox via SysAuditOutboxActiveModel；caller signature `(txn, event)` + Result 不變（depends on T003 + T008）。對應 FR-009。
- [x] T010 [US1] New helper `audit_log::write_outbox_for_http(ctx: OperationLogContext) -> Result<(), AppError>` — 同檔案；操作：依 ctx.method match `AuditOperation`（GET/HEAD/OPTIONS/TRACE skip）→ build `AuditEvent` + `AuditSource::Http`、URL→entity_type 用 T007 pure fn、self-managed txn INSERT outbox、failure log warn（depends on T007 + T008 + T009）。對應 FR-007 / FR-008。
- [x] T011 [P] [US1] New `rust-api/server/global/src/audit_publisher.rs` — Redis Stream XADD audit:events MAXLEN ~ 10000 + cluster mode graceful skip + Redis 未初始化/連線失敗 graceful skip（沿 `casbin_notify.rs` 體例、per research R-5 template）；新增 `pub const AUDIT_STREAM_KEY: &str = "audit:events"` + `pub async fn publish_audit_event(audit_event_json, maxlen)`；register in `rust-api/server/global/src/lib.rs` (+1 line `pub mod audit_publisher;`)。對應 FR-005 / Edge Case Redis Cluster。
- [x] T012 [US1] New `rust-api/server/service/src/admin/sys_audit_outbox_drainer.rs` — `pub async fn run_drainer_loop(config: AuditOutboxConfig)` + `async fn drainer_one_batch(config) -> Result<usize>` + `async fn process_one_row(txn, row, config)` + `fn build_operation_log_active_model(full) -> OperationLogActiveModel`：
  - SELECT outbox WHERE published_at IS NULL AND retry_count < max_retry ORDER BY id ASC LIMIT batch_size FOR UPDATE SKIP LOCKED
  - for each row: publish_audit_event(json, maxlen) + INSERT sys_operation_log（從 audit_event_json deserialize AuditEventFull、map to SysOperationLogActiveModel per data-model R-4 mapping table）+ UPDATE published_at = NOW()
  - on error: UPDATE retry_count++、last_error=error message
  - register in `rust-api/server/service/src/admin/mod.rs`（depends on T003 + T008 + T011）。對應 FR-002 / FR-010 / FR-011。
- [x] T013 [US1] New `rust-api/server/initialize/src/audit_outbox_initialization.rs` — `pub async fn initialize_audit_outbox_drainer()` 從 config 拿 AuditOutboxConfig + tokio::spawn(run_drainer_loop(config))；register in `rust-api/server/initialize/src/lib.rs` (+ pub mod + pub use)（depends on T012）。
- [x] T014 [US1] Hook into main.rs — `rust-api/server/bin/src/main.rs` 在 `init_redis_pools().await;`（line 25）之後加 `server_initialize::initialize_audit_outbox_drainer().await;`（depends on T013）。
- [x] T015 [US1] OperationLogLayer mount in apply_layers — `rust-api/server/initialize/src/router_initialization.rs::apply_layers` 函式末段加 `router = router.layer(OperationLogLayer::new(true));` + use line；5 處 apply_layers caller 自動涵蓋（per research R-3）。對應 FR-003。
- [x] T016 [US1] Middleware refactor: fire event → spawn outbox write — `rust-api/server/core/src/web/operation_log.rs:145` 改 `global::send_dyn_event(...)` 為 `tokio::spawn(async move { if let Err(e) = server_model::admin::audit_log::write_outbox_for_http(context).await { tracing::warn!(...) } })`；移除 use line `use server_global::global::send_dyn_event` 或 `SystemEvent::AuditOperationLoggedEvent`（depends on T010）。
- [x] T017 [US1] Remove HTTP audit listener event 註冊 — `rust-api/server/initialize/src/event_channel_initialization.rs:19` 移除 `(SystemEvent::AuditOperationLoggedEvent.to_string(), Box::new(|rx| Box::pin(sys_operation_log_listener(rx))))` tuple；保留 auth_login_listener / jwt_created_listener / api_key_validate_listener；`sys_operation_log_listener` 函式本身（`sys_operation_log_service.rs:193`）保留為 standby（加 `#[allow(dead_code)]` 或 `#[deprecated]`）。
- [x] T018 [P] [US1] Remove redundant per-route OperationLogLayer mount — `rust-api/server/router/src/admin/sys_menu_route.rs:16` 移除 `.layer(OperationLogLayer::new(true))` + 移除 use line；統一掛在 apply_layers 後此處冗餘（per research R-3）。
- [x] T019 [US1] cargo check + clippy clean — `cd rust-api && cargo check --workspace 2>&1 | tail -10` 預期 0 error；`cargo clippy --workspace -- -D warnings 2>&1 | tail -10` 預期無新 warning（depends on T007-T018）。對應 SC-009 sanity。如 host 無 cargo、跳過走 T020 docker build 為實質 build gate。
- [x] T020 [US1] Docker build rust-api image — `DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -10`（depends on T019）。對應 C-V1。
- [x] T021 [US1] Dev stack restart rust-api — `$PC up -d rust-api --force-recreate --wait`；`$PC ps` 確認 5 service healthy（depends on T020）。
- [x] T022 [US1] C-V3 雙視角 row verify — 跑 contracts/verification-commands.md C-V3：POST /api/role → 1 秒內 sys_operation_log 2 row（INTERNAL + POST）、request_id 串聯（depends on T021）。對應 SC-001、FR-001、US1 AS-1。
- [x] T023 [US1] C-V4 跨 router mount 全涵蓋 — 跑 C-V4：8 endpoint 抽樣（admin POST / systemManage POST / auth POST / authorization POST）皆產 HTTP-source row（depends on T021）。對應 SC-008、FR-003。
- [x] T024 [US1] C-V5 Drainer 啟動消化 backlog — 跑 C-V5：手塞 3 row outbox → 2 秒後全 published、sys_operation_log 對應 3 row（depends on T021）。對應 SC-001、FR-002、drainer 啟動驗。
- [x] T025 [US1] C-V8 Redis 暫停 retry + 恢復消化 — 跑 C-V8：停 Redis 5 秒、發 5 admin write、查 outbox pending + retry_count > 0；啟 Redis 10 秒消化、查 outbox pending 回 baseline + sys_operation_log 補齊（depends on T021）。對應 SC-002、FR-002 / FR-011、US1 AS-2/3。

**Checkpoint**：US1 完成 — admin write 自動產 2 row、outbox 0-loss、drainer 工作正常。可獨立 deliver（MVP-worthy、US2 / US3 未做也 OK）。

---

## Phase 4: User Story 2 — Redis stream subscriber + fallback contract（Priority: P2）

**Goal**：Redis stream `audit:events` 存在、含完整 JSON event entry、retention window 工作；subscribers 取得 + gap fallback contract 文件就位（subscriber 實作不在本 feature scope）。

**Independent Test**：發起 admin write 後、redis-cli XLEN / XREAD 取最新 entry、JSON 含完整 audit fields。

### Implementation for User Story 2

- [x] T026 [US2] C-V6 Redis Stream verify — 跑 C-V6：POST /api/role → 1 秒後 XLEN 增加 + XREVRANGE 最後 5 entry 含 audit JSON、可解 actor / operation / entity_type / source（depends on T021）。對應 SC-005、FR-005、US2 AS-1。

**Checkpoint**：US2 完成 — Redis stream interface 工作；subscriber 端對接由下游 feature（W-F12/13/14）實作。

---

## Phase 5: User Story 3 — 失敗登入產 HTTP audit row（R2 自動結案）（Priority: P3）

**Goal**：POST /auth/login 失敗（錯誤密碼）→ sys_operation_log 出現 1 HTTP-source row（user_id 空、ip/user_agent 完整）。R2 follow-up 自動結案。

**Independent Test**：POST /auth/login 用錯密碼、查 sys_operation_log 對應 row。

### Implementation for User Story 3

- [x] T027 [US3] C-V11 失敗登入 audit + cleanup verify — 跑 C-V11：POST /auth/login 用錯密碼 → 1 秒後查 sys_operation_log url=/api/auth/login method=POST user_id 空 ip/user_agent 完整；同步驗 INTEGRATION-CHECKLIST cleanup（R2/R3/F2.2 row 移除 + 042 entry 加）（depends on T021 + T032）。對應 SC-007、SC-010、FR-013、US3 AS-1。

**Checkpoint**：US3 完成 — R2 失敗登入 audit 自動有；spec 003 §1.5 audit 完整性對齊。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**：W-F11 多 replica 驗 + URL prefix 規則 verify + scope verify + INTEGRATION-CHECKLIST cleanup + commit + merge。

- [x] T028 C-V7 multi-replica drainer 不重複處理 — 跑 C-V7：`$PC up -d --scale rust-api=2 rust-api --force-recreate --wait` + 連發 50 POST /api/role + sleep 3 + 驗 outbox 100 row 全 published + sys_operation_log 100 row 無重複 + scale 回 1 + cleanup（depends on T021）。對應 SC-003、FR-010、US1 AS-4。
- [x] T029 [P] C-V9 URL → entity_type 抽樣 verify — 跑 C-V9：5 endpoint 抽樣 trigger（/api/user / /api/systemManage/addUser / /api/role / /api/route / /api/auth/login）+ 驗 entity_type 對應正確（depends on T021）。對應 SC-008、FR-004、data-model E2。
- [x] T030 C-V10 三邊 scope verify — 跑 C-V10：base-web `git diff HEAD --stat` 空、rust-api `git diff HEAD --stat` ~11 files（per plan Structure Decision）、outer `git diff HEAD --stat` 含 INTEGRATION-CHECKLIST + rust-api SHA pin（depends on T021 + T032）。對應 SC-009、FR-012。
- [x] T036 [P] C-V12 Latency benchmark — 跑 C-V12 Part A（POST /api/role 100 iterations、mean response latency ≤ 50ms surrogate evidence for SC-004 ≤1ms middleware overhead）+ Part B（20 events publish→XREAD-receive 延遲、p50 ≤ 100ms / p95 ≤ 500ms per SC-005）；如 p50 > 100ms 可調 application.yaml `drainer_sleep_interval_ms` 平衡 trade-off（depends on T021）。對應 SC-004、SC-005、FR-007。
- [x] T031 INTEGRATION-CHECKLIST 移除 R2/R3/F2.2 + 加 042 entry — `docs/INTEGRATION-CHECKLIST.md`：
  - 從「衍生 follow-up」table 移除 R2 row（F5.1 登入失敗無 audit、由本 feature 自動結案）
  - 從「衍生 follow-up」table 移除 R3 row（HTTP middleware audit gap、本 feature 核心修）
  - 從「規劃中、未排程」table 移除 F2.2 row（audit-log outbox + Redis subscriber TTL fallback、本 feature 落地）
  - 「已完成里程碑」加 1 行 042 entry（per quickstart §8.3 體例：日期 + outer/merge/rust-api SHA + spec link + 一句話描述）
  - Current Focus 下一步從「042 進行中」→「W-F12/13/14 observability」（depends on T022-T030）。對應 FR-013、SC-010、SC-011。
- [ ] T032 第一段 commit — rust-api worktree — `cd rust-api && git status`（確認 branch `rev1-admin-rust-api`）+ `git add` 全 11 改/新檔（per quickstart §7.1 完整清單）+ `git commit -m` per quickstart §7.1 messageBody + **push 須 user 同意**（per ~/.claude/CLAUDE.md §5）：`git push origin rev1-admin-rust-api`（depends on T020）。
- [ ] T033 第二段 commit — outer feature branch — 回 outer root、確認 branch `042-audit-outbox-and-http-mount` + `git add rust-api docs/INTEGRATION-CHECKLIST.md` + `git commit -m` per quickstart §7.2 messageBody（含 SHA、TBD 後補）（depends on T031 + T032）。
- [x] T034 C-V11 backlog cleanup verify — `grep -nE "^\| R2 |^\| R3 |^\| F2.2 " docs/INTEGRATION-CHECKLIST.md` 期望 0 hit；`grep -cn "042 audit-outbox-and-http-mount" docs/INTEGRATION-CHECKLIST.md` 期望 ≥1 hit（depends on T031）。對應 SC-010。
- [ ] T035 git merge 042 → rev1-admin-root — **user 同意才執行**：`git checkout rev1-admin-root && git merge --no-ff 042-audit-outbox-and-http-mount -m "Merge feature 042-audit-outbox-and-http-mount"`；merge 後 backfill outer/merge SHA 進 INTEGRATION-CHECKLIST 042 entry（small chore commit、per 041 體例）+ push 須 user 再次同意（depends on T033 + T034）。

**Checkpoint**：042 整 feature 落地、acceptance 全綠、backlog 已 cleanup、merge 回 default。

---

## Dependencies & Execution Order

### Story Independence Graph

```
Phase 2 Foundational (T001-T006、blocking 全 US)
   │
   ├─→ US1 (T007-T025、主要實作 + acceptance；MVP-worthy 可獨立 deliver)
   │
   ├─→ US2 (T026、Redis stream verify；depends on T021 dev stack)
   │
   └─→ US3 (T027、R2 結案 verify；depends on T021 + T031)
                                            │
Phase 6 Polish (T028-T035、collect、commit、merge) ──┘
```

3 個 user story 完全獨立、可任意順序或平行執行（subject to Phase 2 完成）。Polish phase 為唯一彙整點。

### Task-level Dependencies

| Task | Depends on |
|---|---|
| T001 | — |
| T002 | T001 |
| T003–T005 | — |
| T006 | T002 |
| T007–T008 | — |
| T009 | T003 + T008 |
| T010 | T007 + T008 + T009 |
| T011 | — |
| T012 | T003 + T008 + T011 |
| T013 | T012 |
| T014 | T013 |
| T015 | — |
| T016 | T010 |
| T017 | — |
| T018 | — |
| T019 | T007-T018 |
| T020 | T019 |
| T021 | T020 |
| T022–T025 | T021 |
| T026 | T021 |
| T027 | T021 + T031 |
| T028 | T021 |
| T029 | T021 |
| T030 | T021 + T032 |
| T031 | T022–T030 + T036 |
| T032 | T020（建議 acceptance T022-T025 全 PASS 後做）|
| T033 | T031 + T032 |
| T034 | T031 |
| T035 | T033 + T034（**user 同意**）|
| T036 | T021 |

---

## Implementation Strategy（per quickstart Step 1-8 流程）

### 推薦執行批次

**Batch 1 — Phase 2 Foundational**（T001-T006）：
- T001 + T003 + T004 + T005 平行起手（4 個 [P] task、互不衝突）
- T002 等 T001
- T006 等 T002（跑 migration）

→ 4 個 task 平行 + 2 個 sequential、約 30 分鐘。

**Batch 2 — US1 Implementation**（T007-T018）：
- T007 + T008 + T011 + T015 + T017 + T018 平行起手（5 個 [P]、不同檔互不衝突）
- T009 等 T003 + T008
- T010 等 T007 + T008 + T009
- T012 等 T003 + T008 + T011
- T013 等 T012
- T014 等 T013
- T016 等 T010

→ 5 個平行 + 7 個 sequential（with internal deps）、約 2-4 小時程式碼撰寫。

**Batch 3 — Build & Restart**（T019-T021）：
- T019（cargo check、host 無 cargo 則 skip）→ T020（docker build、~3-5 分鐘）→ T021（restart、~1 分鐘）

→ sequential、約 5-10 分鐘。

**Batch 4 — US1 Acceptance**（T022-T025）：
- T022 + T023 + T024 + T025 sequential（依賴 dev stack ready、互可不平行因都用 rust-api stack 且彼此 cleanup 共享）

→ 約 15-20 分鐘。

**Batch 5 — US2 + US3 Acceptance**（T026 + T027）：
- T026 獨立、約 5 分鐘
- T027 等 T031（INTEGRATION-CHECKLIST cleanup）

**Batch 6 — Polish + Commits + Merge**（T028-T036）：
- T028 + T029 + T036 平行（不同 endpoint scope；T036 latency benchmark 約 5 分鐘）
- T030 + T031 sequential（T031 為 backlog cleanup、T030 verify scope）
- T032（rust-api commit + push 需 user）→ T033（outer commit）→ T034 verify backlog → T035 merge 需 user

→ 約 35-50 分鐘、含 user 同意等待。

### MVP Option（per spec-kit framework）

若需 incremental delivery：

- **MVP-1（US1 only）**：完 Phase 2 + Batch 2/3/4。**0 base-web 改動**、即可 deliver「forensic 雙視角 + outbox 0-loss」MVP。
- **MVP-2（US1+US2）**：+ T026（Redis stream verify）、subscriber 仍 defer。
- **Full feature（US1+US2+US3 + Polish）**：依 Batch 1-6 完整跑。

User 偏好（per project_followup_processing_order memory）：R3→W-F12/13/14 順序、本 feature（042）為 R3+F2.2 bundle 整體 deliver、不採 MVP 拆分（W-F12/13/14 subscriber 才用得到本 feature 的 stream）。

---

## Implementer 指引（per CLAUDE.md §3）

實作一律走 **`superpowers:executing-plans`**（**不**用 `/speckit-implement`、per CLAUDE.md §3 紀律）。`executing-plans` 會讀本 tasks.md、偵測 subagent 可用後派遣（或本 conversation 內逐 task 執行）。每完成一單元做兩階段 review：① spec compliance（對照 spec.md FR-001~FR-014 + SC-001~SC-011）→ ② code quality（rust-api 改動部分）。

每 implementer 完成 task 後、勾 `[x]`、記錄關鍵實機結果（C-V 命令 actual output、grep 確認、commit SHA）。

---

## Summary

- **Total tasks**: 36
- **By user story**: Foundational = 6 tasks（T001-T006）、US1 = 19 tasks（T007-T025）、US2 = 1 task（T026）、US3 = 1 task（T027）、Polish = 9 tasks（T028-T036）
- **Parallel opportunities**: T001/T003/T004/T005 [P] Foundational 4 並；T007/T008/T011/T015/T017/T018 [P] US1 6 並；T028/T029/T036 [P] Polish 3 並
- **Independent test criteria**: US1 = C-V3/C-V4/C-V5/C-V8（雙視角 + mount 涵蓋 + drainer + Redis 暫停）/ US2 = C-V6（Redis stream）/ US3 = C-V11（R2 結案 + backlog cleanup）；C-V12 latency benchmark 為 cross-cutting performance verify
- **Suggested MVP scope**: US1 only（per spec-kit framework P1 = MVP）；user 已選 Full feature 一次到位
- **Format validation**: ✅ 全 36 task 符合 `- [ ] TXXX [P?] [Story?] Description with file path` checklist 格式
