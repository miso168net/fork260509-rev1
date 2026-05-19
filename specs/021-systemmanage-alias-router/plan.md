# Implementation Plan: F9 — systemManage-alias-router

**Branch**: `021-systemmanage-alias-router` | **Date**: 2026-05-20 | **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `/specs/021-systemmanage-alias-router/spec.md`

## Summary

rev1 **DESIGN-A §4.2 抽離項清單收尾 feature**(F11 補 4 條 stub 後接續、F9 補最後 1 條 batchDeleteUser stub + 完整 9 條 /systemManage/* alias = 10 條完整交付)。實作策略 = RESEARCH §6.2 方案 B「rust 加 /systemManage/* alias router」:5 個重用直接 mount + 3 個變形 wrapper + 2 個新做完整 + 1 個新做 stub,Casbin policy seed 20 row(2 role × 10 endpoint)、v4='' 沿用 F11 R-Q5 baseline。技術 approach:

- **File org**(per brainstorm Q4):wrapper handler 加進對應 entity api 檔(sys_user_api.rs / sys_role_api.rs / sys_menu_api.rs)、route 集中新建 `sys_system_manage_route.rs`、Casbin migration 新建 `m20260520_a_f9_system_manage_alias_seed.rs`
- **兩段式 commit**(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1-2 commit + merge --no-ff + SHA fill follow-up、無 docker-compose.yml 改
- **Acceptance**:10 個 C-V scenarios(curl + psql + audit log grep)、對齊 F11 7 C-V 結構等比放大、不驗 base-web e2e(per Q2)
- **Implement-time finding 沿用**:F11 R-Q5(v4='' baseline)+ R-Q6(deny path 走 casbin_envelope_adapter HTTP 200 + envelope {code:5001, success:false})

## Technical Context

**Language/Version**: Rust 1.86 stable(rust-api、對齊 W-F1 既有 Dockerfile);bash(acceptance scripts)
**Primary Dependencies**: axum 0.8(rust HTTP framework)、sea-orm 1.x(rust ORM + migration)、sea-orm-migration、tokio、tracing(既有);新增無第三方依賴(F9 不加 Cargo.toml workspace dep、對比 F11 加 serde_json/tracing/chrono)
**Storage**: PostgreSQL 17.4(既有、F9 不改 schema、新加 20 row 到 casbin_rule 表、SELECT 對 sys_role / sys_menu / sys_user)、Redis-stack 7.4.0-v3(既有、F9 不動)
**Testing**: F9 **不加 rust unit test**(per spec FR-017 + F11 Q3 同精神);**acceptance 用 curl + psql + grep**(per FR-019)在 host bash 跑、無 rust-side test
**Target Platform**: WSL2 dev(`docker compose -f -f -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`)+ prod(`docker-compose.prod.yml`、F9 不動)
**Project Type**: Web service backend integration(rust-api worktree + outer rev1-admin-root spec docs)
**Performance Goals**: F9 handler latency ≤ 50ms p99(per NFR-006、繼承既有 service 性能);batchDeleteUser per-row loop 為 O(N) DB call、無 batch upper limit(per FR-026)
**Constraints**:
- F9 rust-api 改動 ~12 file ~330 LOC(per NFR-002 + spec Section 2 file 結構)
- F9 acceptance ≤ 15s(per NFR-001、不含 stack 啟動 + rust image rebuild)
- F9 image rebuild ≤ 5 min warm(per NFR-005)
- F9 **三邊零改動**:base-web src 0 diff(per FR-010 + SC-011)、nestjs fork 0 diff(per FR-011 + SC-012)、docker-compose 0 diff(per FR-012 + SC-013)
- F9 不改既有 m20241024 Casbin policy(per FR-014、A-006 紀律)
**Scale/Scope**: 10 條 alias endpoint(5 重用 + 3 變形 + 2 新做完整 + 1 新做 stub)、20 Casbin row、繼承 rev1 既有 stack scale(W-FA1 6 service healthy)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — RBAC Fail-safe(Casbin 後端強制)

| 檢查 | F9 對齊 |
|---|---|
| 後端 Casbin enforce 為唯一 authorization 權威 | ✅ `SysSystemManageRouter` 用 `merge_router!(true, true, None)` Casbin enforce 開啟(對齊 F11 `init_protected_router` flip pattern) |
| 前端 menu 隱藏 / button disable 不作為 access control | ✅ F9 acceptance C-V6 驗 GeneralUser deny 走 backend Casbin(不靠前端 hide) |
| Casbin policy 主寫權威為 rust | ✅ F9 加 m20260520 migration 為 rust 主寫;nestjs read-only |
| 抽離項 stub 多數 role deny / test/demo role allow | ✅ Q1 拍 Soybean + Admin allow / GeneralUser default deny;對應 rev1 admin 範疇紀律 |
| 不在 nginx 層砍 endpoint | ✅ F9 不改 nginx config(per FR-013) |

**Verdict**: ✅ PASS

### Principle II — Soft Delete + 全域 Audit Log(NON-NEGOTIABLE)

| 檢查 | F9 對齊 |
|---|---|
| DELETE 一律 soft delete(`deleted_at`) | ✅ F9 batchDeleteUser per-row call 既有 `SysUserService::delete_user`、繼承既有 soft delete 邏輯(per A-004) |
| 寫入操作寫 sys_operation_log | ✅ F9 batchDeleteUser per-row call 既有 service hook、audit 寫入繼承(per FR-016、SC-005 驗 ≥ 1 row) |
| 業務寫入 + audit 同一 transaction | ✅ F9 不另寫 audit、繼承既有 service tx 紀律 |
| sys_operation_log 永久保留 | ✅ F9 不動 sys_operation_log 表 |
| SELECT 過濾 `deleted_at IS NULL` | ✅ F9 `getAllPages` 顯式 WHERE deleted_at IS NULL(per FR-006 + Q5);`getAllRoles` 用 status=Enabled filter(per FR-005);其他重用 handler 繼承既有 find_active() / soft delete scoped finder |
| 跨資源 side effect 不在 audit 範疇 | ✅ F9 不觸發跨資源 side effect |

**Verdict**: ✅ PASS

### Principle III — 嚴版禁 Forward + 單一職責

| 檢查 | F9 對齊 |
|---|---|
| 後端服務間禁 HTTP/RPC | ✅ F9 純 rust handler、不 forward 給 nestjs |
| 跨服務狀態同步走 postgres / redis | ✅ F9 不跨服務同步狀態 |
| 每個 endpoint 由一個後端負責 | ✅ F9 10 條 alias 全由 rust 負責 |
| nginx config 明確標 backend owner | ✅ F9 不動 nginx config、繼承既有 `/api/*` → rust upstream |
| nestjs-bound location 包 TRANSITIONAL marker | N/A(F9 不加 nestjs 路徑) |

**Verdict**: ✅ PASS

### Principle IV — base 不改動邊界

| 檢查 | F9 對齊 |
|---|---|
| 不動 base-web `src/views/` `src/components/` `src/service*/api/*.ts` `src/router/` `src/store/` | ✅ FR-010 + SC-011 強制 base-web src 0 diff |
| 可動 `.env`(F9 不需) | N/A |
| base example mock 保留 prod 不啟 | N/A(F9 不動 mock) |
| API 路徑 / 方法 / payload GAP 由後端適應 | ✅ F9 為 RESEARCH §6.2 方案 B「rust 加 alias router」對 base /systemManage/* 適應的標誌實作 |
| response shape 對齊由 rust 處理 | ⚠️ F9 不解 B3 camelCase GAP(per FR-024)、留 follow-up feature(per Q2)。**符合 Principle IV 精神 — 不修 base、由後端 follow-up 解** |
| success code 對齊由 base `.env` 微調 | N/A(F9 沿用 F4 既有 code=0 envelope) |

**Verdict**: ✅ PASS(B3 camelCase 留 follow-up 為已知 spec consistency 差異、A-006 已紀錄、Principle IV 精神 ≠ 必須一次解全)

### Principle V — 漸進收縮(DESIGN-A → DESIGN-B)

| 檢查 | F9 對齊 |
|---|---|
| nestjs 不擴張 endpoint 範圍 | ✅ F9 純 rust feature、不動 nestjs |
| 過 「未來 nestjs 拔掉時順嗎」濾鏡 | ✅ F9 alias router 在 DESIGN-B 完全繼承(per DESIGN-B §4.2 + §6 identical);nestjs 退場時 F9 不需任何改動 |
| DB schema / JWT secret / sys_tokens / Casbin schema / pub-sub channel 由 rust 主導 | ✅ F9 加 m20260520 Casbin migration 為 rust 主寫;F9 不動其他共識資源 |
| nestjs source 不改 | ✅ F9 不動 nestjs fork(per FR-011 + SC-012) |
| DESIGN-A → DESIGN-B 遷移只動 nginx + docker-compose、DB / 應用層零改動 | ✅ F9 不動 nginx config + 不動 docker-compose;F9 落地後 DESIGN-B cutover 不需改 F9 任何 file |
| 抽離項升級時只動 rust handler + Casbin policy、nginx / 前端 / DB schema 零改動 | ✅ F9 batchDeleteUser stub 升級(per DESIGN-A §4.2 升級路徑「loop in batch-level transaction + per-row audit + casbin policy cleanup + 批量上限 100 + chunking 策略」)時只需改 `SysUserApi::batch_delete_users` handler + Casbin policy 擴開放對象;nginx / 前端 / DB schema 零改動 |

**Verdict**: ✅ PASS

### 架構約束 Compliance

| 約束 | F9 對齊 |
|---|---|
| docker-compose 單機 + multi-stage Dockerfile | ✅ 繼承 W-F1 + W-F3 既有 |
| PostgreSQL 17.4 rust 主導 migration | ✅ F9 加 m20260520 migration |
| Redis 必要依賴 | ✅ 繼承 W-F3 + W-F4 既有、F9 不動 |
| TLS 對外流量 | ✅ 繼承 W-F6 既有、F9 不動 nginx |
| Secret 注入 `_FILE` pattern | ✅ 繼承 W-F4 既有、F9 不加 secret |
| DB migration init container | ✅ 繼承 W-FA1 既有、F9 1 個新 migration 預期 rerun |
| Port 1XXXX 前綴 | ✅ F9 不改 port |
| Observability(promtail/Loki/prometheus/grafana) | ✅ 繼承 W-F4 既有;F9 不主動 instrument 新 metric(per NFR-006、留 W-F11) |
| 結構化 log JSON | ✅ F9 繼承既有 rust tracing JSON config |
| Backup pg_basebackup + WAL | ✅ F9 不影響 backup 紀律 |
| 背景工作 cleanup-job / outbox-worker / backup-job | N/A(F9 不加 cron job;batchDeleteUser per-row loop 非 background) |
| CI/CD platform | N/A(F9 不動 CI/CD;繼承 W-FA3 既有 build script) |

**Verdict**: ✅ PASS(所有架構約束對齊或 N/A、無 violation)

### 開發流程 Compliance

| 流程 | F9 對齊 |
|---|---|
| spec-kit `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` | ✅ 本 plan.md 為 `/speckit-plan` 階段輸出(`/speckit-clarify` 0 question 已跑) |
| Constitution Check 失敗處理(Complexity Tracking) | N/A(F9 0 violation、無需 Complexity Tracking) |
| 兩段式 commit | ✅ FR-015 明寫、對齊 CLAUDE.md §6.1 |
| Commit message Conventional Commits + 中文 subject | ✅ 本 feature commit message 對齊 F11 pattern |
| Push 確認紀律 | ✅ 等 user 同意才 push(per CLAUDE.md §5) |
| TLS 紀律 | N/A(F9 不動 nginx / TLS 配置) |
| DESIGN 文件權威 | ✅ spec.md 引用 DESIGN-A §3.1 + §4.2 + §6.1 + DESIGN-B §4.2 + §6 + RESEARCH §6.2 |
| 抽離項升級紀律 | ✅ FR-026 batchDelete 升級時零改動 base/nginx/DB schema |

**Verdict**: ✅ PASS

### Constitution Check 總計

- **Pass**: 5 個 Principle + 12 個架構約束 + 8 個開發流程 = **25 PASS**
- **N/A**: 5 個架構約束(F9 範圍外) + 2 個開發流程(F9 範圍外) = **7 N/A**
- **Violation**: **0**

**整體 verdict**: ✅ PASS — proceed to Phase 0 research(無需 Complexity Tracking)

## Project Structure

### Documentation (this feature)

```text
specs/021-systemmanage-alias-router/
├── plan.md              # This file(/speckit-plan command output)
├── research.md          # Phase 0 output(R-Q1..R-Qn implement-time finding)
├── data-model.md        # Phase 1 output(E1..E9 entity + handler + DTO + migration shape)
├── quickstart.md        # Phase 1 output(human-readable 故障排查 + happy path)
├── contracts/
│   └── verification-commands.md  # Phase 1 output(C-V1..C-V10 acceptance scenarios)
├── checklists/
│   └── requirements.md  # Generated by /speckit-specify(14 項全 PASS)
├── spec.md              # /speckit-specify 階段輸出(328 行、5 brainstorm Q 拍板)
└── tasks.md             # Phase 2 output(由 /speckit-tasks 生、本 plan 不負責)
```

### Source Code(repository root)

**Worktree(rust-api、~12 file ~330 LOC)**:

```text
rust-api/
├── server/
│   ├── api/src/admin/
│   │   ├── sys_user_api.rs              # 改、+~55 LOC(加 update_user_post / delete_user_by_body / batch_delete_users)
│   │   ├── sys_role_api.rs              # 改、+~25 LOC(加 get_all_roles)
│   │   └── sys_menu_api.rs              # 改、+~20 LOC(加 get_all_pages)
│   ├── service/src/admin/
│   │   ├── sys_role_service.rs          # 改、+~20 LOC(加 find_all_enabled)
│   │   └── sys_menu_service.rs          # 改、+~15 LOC(加 find_all_page_keys)
│   ├── model/src/admin/input/
│   │   └── sys_user.rs                  # 改、+~15 LOC(加 DeleteUserByBodyInput + BatchDeleteUserInput DTO)
│   ├── router/src/admin/
│   │   ├── sys_system_manage_route.rs   # **新建**、~80 LOC(SysSystemManageRouter + 10 條 route mount + 10 個 RouteInfo)
│   │   └── mod.rs                       # 改、+1 LOC(mod + re-export SysSystemManageRouter)
│   └── initialize/src/
│       └── router_initialization.rs     # 改、+~8 LOC(import SysSystemManageRouter + merge_router!(true, true, None))
└── migration/src/
    ├── datas/
    │   ├── m20260520_a_f9_system_manage_alias_seed.rs  # **新建**、~80 LOC(MigrationTrait impl + up() INSERT 20 row + down() DELETE)
    │   └── mod.rs                                       # 改、+1 LOC(mod register)
    └── lib.rs                                           # 改、+2 LOC(Migrator vec 加 Box::new)
```

**Outer(spec docs + meta + rust-api SHA pin、4 file + 1 untracked dir)**:

```text
specs/021-systemmanage-alias-router/    # untracked、本 plan + spec + research/data-model/quickstart/contracts/checklists
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/verification-commands.md
├── checklists/requirements.md
├── spec.md
└── tasks.md                             # 由 /speckit-tasks 生

# 改動的既有 outer file:
.specify/feature.json                    # 已由 /speckit-specify 改、指 specs/021-*
CLAUDE.md                                 # SPECKIT marker 區間更新指 plan.md
docs/INTEGRATION-CHECKLIST.md            # Active feature 改 F9 + 已完成里程碑 +5 條 SHA placeholder
# rust-api gitlink                        # outer 記 SHA pin 變動
```

**Worktree(不動)**:`base-web/` / `fork260509-soybean-admin-nestjs/` / `docker-compose*.yml` / nginx config / 既有 m20241024 migration(per FR-010 + FR-011 + FR-012 + FR-013 + FR-014)

**Structure Decision**:
- **Worktree(rust-api)scope = 12 file**(7 改 entity + 1 新建 router + 1 新建 migration + 3 register/mod 改動、per brainstorm Q4 file org B「wrapper handler 加 entity 檔、route 集中新建」)
- **Outer scope = 4 file + 1 untracked dir**(對齊 F11 pattern)
- **無 docker-compose 改**(對比 F10.1、W-FA1 既有 wire 已涵蓋)
- **兩段式 commit**(per FR-015、CLAUDE.md §6.1)

## Phase 0 Research(see [`research.md`](research.md))

**Approach**:
- Resolve unknowns in Technical Context — 主要為 implement-time finding 紀錄(從 F11 R-Q5 + R-Q6 沿用為 baseline、F9 預期無新 finding 但保留紀錄空間)
- 由 spec.md A-001 ~ A-012 12 個 assumption + R-1 ~ R-6 6 個 risk 衍生的 research question
- Grep evidence 既有 rust handler/service signature + Casbin policy seed pattern + axum route 字面解析

**Expected research questions**:
- **R-Q1**:既有 `SysUserService::update_user / delete_user` signature(取 id 型別、payload 型別 — `String` 或 `Uuid` 或 `i64`?影響 F9 DTO 字段型別)
- **R-Q2**:既有 `SysRoleService` 是否已有 `find_all_enabled` 或類似 method(避免重複實作)
- **R-Q3**:既有 `SysMenuService` 是否已有「找全部 menu name」相似 method
- **R-Q4**:axum route `.route("/getMenuList/v2", get(...))` 字面解析確認 + nest 在 `/systemManage` 下後 / 在 init_router 內 mount 規則
- **R-Q5**:既有 m20241024 Casbin policy 對 `/user/{id}` `/role/{id}` 等 with path-param endpoint 的 row 是否含 path-param 或只 base path
- **R-Q6**:F9 預期 implement-time finding(沿用 F11 R-Q5/R-Q6 baseline、F9 在 acceptance 階段可能再 surface 新 finding)

每個 question 在 implement 階段 grep 既有 file 解、不需 spec-level brainstorm。

## Phase 1 Design & Contracts

**Prerequisites**: research.md complete(grep evidence + decision)

**Phase 1 outputs**:

1. **`data-model.md`** — Entity + handler signature + DTO + Casbin migration shape:
   - E1:`SysUserApi` 既有 8 handler + F9 加 3 個(`update_user_post` / `delete_user_by_body` / `batch_delete_users`)
   - E2:`SysRoleApi` 既有 5 handler + F9 加 1 個(`get_all_roles`)
   - E3:`SysMenuApi` 既有 9 handler + F9 加 1 個(`get_all_pages`)
   - E4:`SysRoleService::find_all_enabled` 新 method shape + SQL
   - E5:`SysMenuService::find_all_page_keys` 新 method shape + SQL
   - E6:`SysSystemManageRouter` 新建 file shape + 10 條 mount + RouteInfo + nest 結構
   - E7:DTO 2 個新建(`DeleteUserByBodyInput` / `BatchDeleteUserInput`)+ 1 個重用(`UpdateUserInput`)
   - E8:Casbin migration m20260520 INSERT/DELETE SQL + 20 row 表
   - E9:既有 `Res<T>` envelope shape(F11 R-Q4 沿用、F9 不改)

2. **`contracts/verification-commands.md`** — 10 C-V acceptance scenarios:
   - C-V1:rust-api image rebuild OK
   - C-V2:Casbin migration 20 row 落 casbin_rule
   - C-V3:Soybean 5 個重用 mount endpoint 全 HTTP 200
   - C-V4:Soybean 3 個變形 wrapper endpoint(updateUser / deleteUser / batchDeleteUser counter)
   - C-V5:Soybean 2 個新做完整 handler endpoint(getAllRoles / getAllPages)
   - C-V6:GeneralUser deny(getUserList 代表、envelope `{code:5001, success:false}`)
   - C-V7:batchDeleteUser audit log 寫入驗(sys_operation_log per-row)
   - C-V8:三邊 scope verify(base-web/nestjs 0 diff + rust-api 12 file + 0 docker-compose diff)
   - C-V9:W-FA1 stack regression(6 service healthy)
   - C-V10:既有 `/user/*` `/role/*` `/route/*` 3 條 endpoint 不退化

3. **`quickstart.md`** — Step-by-step happy path + 故障排查:
   - Step 1:確認 prerequisites(F11 已 merge / stack 已起 / image ready)
   - Step 2:Rust source 改 12 file(按 spec.md Section 1 Endpoint 表 + Section 2 file 結構)
   - Step 3:rust-api docker image rebuild(warm ≤ 5 min)
   - Step 4:Force-recreate rust-api + migration container(F9 migration init rerun)
   - Step 5:跑 C-V1 ~ C-V10 acceptance(per contracts/verification-commands.md)
   - Step 6:兩段式 commit + push 等 user 同意
   - 故障排查段:常見 friction 點對齊 R-1 ~ R-6 緩解

4. **Agent context update**: CLAUDE.md SPECKIT marker 區間指 `specs/021-systemmanage-alias-router/plan.md`

## Post-Phase 1 Constitution Re-check

(Phase 1 完成後評估、若有新 design choice 違反 Principle I-V 需在 Complexity Tracking 表內合理化)

Phase 1 預期不引入新 violation(F9 設計 100% follow F11 baseline + 5 brainstorm Q 拍板已過 Principle 濾鏡)。Phase 1 完成後此節 verdict = **PASS**(待 research.md / data-model.md 寫完後 final 確認)。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **(none)** | — | F9 Constitution Check 17 PASS / 13 N/A / 0 violation,無需 complexity justification |
