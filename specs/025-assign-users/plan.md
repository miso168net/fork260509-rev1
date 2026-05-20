# Implementation Plan: F8 — assign-users

**Branch**: `025-assign-users` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/025-assign-users/spec.md`

## Summary

application Phase 3 第三個也是最後一個 feature — F7/F7.1/F7.2 把 base manage/* 後台讀路徑與 role code 對齊跑通後,F8 補上唯一缺的寫路徑「user ↔ role 指派」。

**US1 P1 user-role 指派 endpoint** — 新增 `POST /authorization/assign-users`,把既有 `SysAuthorizationService::assign_users(role_id, user_ids)` service method 接上 HTTP。Brainstorm grep 確認 `AssignUserDto` + `assign_users` trait + service impl 三層全已存在,F8 唯一缺口是 HTTP wiring。

技術途徑:rust-api ~5 file 改(~35 LOC)— 加 `SysAuthenticationApi::assign_users` handler(比照 sibling `assign_routes`)+ `init_authorization_router` 加 route mount + `RouteInfo` + 新 Casbin policy seed migration(1 `p` row、ROLE_SUPER allow)+ `datas/mod.rs` / `lib.rs` 註冊。無 DB schema 改、無 docker-compose 改;role-centric 整組覆蓋語意;user→role 只寫 `sys_user_role` join table、不寫 Casbin `g` rule;acceptance = curl + psql(capture→assign→verify→restore);兩段式 commit。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api 既有 workspace、不指定版本)
**Primary Dependencies**: axum(handler)、`server_service::admin::{SysAuthorizationService, AssignUserDto, TAuthorizationService}`、`server_core::web::{validator::ValidatedForm, res::Res}`、sea-orm migration(Casbin policy seed)
**Storage**: PostgreSQL — F8 不改 schema、不改表結構;唯一 DB 物件變更為新增 1 個 Casbin policy seed migration(`casbin_rule` 表 INSERT 1 `p` row)
**Testing**: 無 rust unit test(F8 為純 wiring、無 pure function;service method 既有、範疇外);acceptance = curl + psql(per spec FR-014 + FR-015)
**Target Platform**: Linux container(rust-api docker image、W-FA1 stack profile track-a)
**Project Type**: web-service backend(rust-api worktree、傘狀 monorepo submodule)
**Performance Goals**: N/A — 單次 join table diff + INSERT/DELETE(每 role 數個 user、無顯著 IO)
**Constraints**: base-web + nestjs fork 三邊零改動(Constitution IV)、無 docker-compose 改、無 DB schema 改、acceptance ≤ 30s
**Scale/Scope**: ~5 file rust patch(`sys_authentication_api.rs` + `sys_authentication_route.rs` 改 2 + 新 Casbin migration 1 + `datas/mod.rs` + `lib.rs` 註冊 2)、~35 LOC、F7/F7.1/F7.2 鏈的 Phase 3 收尾 feature

無 NEEDS CLARIFICATION — brainstorm 3 顯式 Q + 1 Approach 全拍板、spec 0 個 `[NEEDS CLARIFICATION]` marker、`/speckit-clarify` 0 question(taxonomy scan 全 Clear)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | F8 新 endpoint `/authorization/assign-users` 在 Casbin enforce 下(對齊 sibling `assign-permission`/`assign-routes`);F8 新 Casbin seed 只 1 row(ROLE_SUPER allow、最窄)、不放寬既有 policy、不擴 scope。Casbin policy 主寫權威維持 rust。符合 Principle I「每個受保護 endpoint 執行 Casbin enforcement」 |
| II | Soft Delete + Audit | **PASS**(附 rationale) | F8 **不新增任何 DB write code** — 只 wiring 既有 `assign_users` service method。該 method 對 `sys_user_role` 做 transaction 內 `insert_many` + `delete_many`。**`sys_user_role` 為純 association/join table**(複合主鍵 `(user_id, role_id)`、schema 無 `deleted_at`)— F3 soft-delete infrastructure 的 entity-soft-delete 紀律適用於 entity 表,非 many-to-many 關聯 row。既有 `assign_*` 家族(assign_permission→`casbin_rule` / assign_routes→`sys_role_menu` / assign_users→`sys_user_role`)全為 association/policy 表寫入、rev1 既有設計皆不 soft-delete/audit 此類關聯 row。F8 沿用此既有 sibling pattern、不改 service method(per spec FR-005)。F8 唯一 migration 為 Casbin policy seed、per F2.1 clarify Q10「migration seeding INSERT exempt from audit」。→ PASS。**Follow-up 觀察**:若 rev1 日後決定 `assign_*` 操作須 audit,屬橫切三 sibling 的獨立 feature、非 F8 範疇 |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | F8 不引入服務間 HTTP/RPC;`/authorization/assign-users` endpoint ownership 為 rust(nginx config 不改);handler 為單一 service method 的薄 wiring |
| IV | base 不改動邊界 | **PASS** | F8 嚴守 `base-web/` 全 0 diff(FR-010、含 `src/` 與 `.env`)、nestjs fork 0 diff(FR-011);F8 為純 rust 後端 endpoint 交付、base-web example 分支不消費 |
| V | 漸進收縮 | **PASS** | `/authorization/assign-users` 為 rust 自有 endpoint、跨 DESIGN-A/B 繼承 identical;nestjs 不涉及、退場時零改動;DB schema 不變(僅 Casbin policy seed) |

**架構約束檢查**:
- DB migration:F8 新增 1 個 Casbin policy seed migration(data seed、非 schema 變更);init-container migration 模式不變、Migrator vec 既有機制延用
- 部署形態 / redis / TLS / secret / port / observability / backup / 背景工作 / CI — F8 全 N/A(~5 file rust source 改、不動 deploy / infra 配置)

**Gate 結果**:**5 PASS / 0 N/A / 0 violation** — Constitution Check 通過、無需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/025-assign-users/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出(/speckit-plan)
├── data-model.md        # Phase 1 產出(/speckit-plan)
├── quickstart.md        # Phase 1 產出(/speckit-plan)
├── contracts/
│   └── verification-commands.md   # Phase 1 產出(/speckit-plan)
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(本指令不產)
```

### Source Code (rust-api worktree)

```text
rust-api/
├── server/api/src/admin/
│   └── sys_authentication_api.rs        # 改(US1、加 SysAuthenticationApi::assign_users handler + AssignUserDto import)
├── server/router/src/admin/
│   └── sys_authentication_route.rs      # 改(US1、init_authorization_router 加 route mount + RouteInfo)
└── migration/src/
    ├── datas/
    │   ├── m20260522_a_f8_assign_users_seed.rs   # 新建(Casbin p policy seed、1 row)
    │   └── mod.rs                                 # 改(註冊新 migration module)
    └── lib.rs                                     # 改(Migrator vec 加新 migration)
（其餘全不動）
```

**Structure Decision**:F8 為 rust-api worktree 內 ~5 file 改的小型 wiring feature(2 改 source + 1 新建 migration + 2 register)。對比 F7.1(2 file 純 source)、F7.2(1 file)、F6(8 file 有 migration)、F9(13 file)、F7(9 file)— F8 scope 收緊,因 `assign_users` 的 DTO + trait + service impl 三層已存在,唯一改動是 HTTP wiring(handler + route mount)+ 1 個 Casbin policy seed migration。outer 端只動 spec docs + INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker + rust-api SHA pin。

## Phase 0: research(見 [research.md](research.md))

F8 為小型 wiring feature、brainstorm 已 saturated;Phase 0 紀錄 3 個 implement-time pattern 確認(非 spec 級 unknown):
- R-Q1:`assign_users` handler 形態確認(比照 sibling `assign_routes`、無 `enforcer` 參數)
- R-Q2:`init_authorization_router` route mount + `RouteInfo` 註冊 pattern 確認
- R-Q3:Casbin policy seed migration 形態與檔名日期確認(對齊 F6/F9/F7 既有 seed migration pattern)

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 `assign_users` handler 細目 + E2 route mount + `RouteInfo` 細目 + E3 Casbin policy seed migration 細目 + E4 既有 `AssignUserDto` / `assign_users` service method(F8 不改、只重用)+ E5 `sys_user_role` 整組覆蓋語意對照
- **contracts/verification-commands.md**:C-V1~C-Vn verification scenario(image rebuild + curl assign-users + psql `sys_user_role` + re-login getUserInfo + restore + ROLE_ADMIN deny + sibling regression + scope + stack)
- **quickstart.md**:F8 落地操作步驟(rust patch + rebuild + restart + acceptance + 兩段式 commit)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — F8 data-model 確認無 DB schema 改、無 base-web 改、無服務間 forward、Casbin seed 1 row ROLE_SUPER-only、不寫 Casbin `g` rule;**5 PASS / 0 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
