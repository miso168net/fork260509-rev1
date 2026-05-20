# Implementation Plan: F7.1 — fix-route-getuserroutes-wiring

**Branch**: `023-fix-route-getuserroutes-wiring` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/023-fix-route-getuserroutes-wiring/spec.md`

## Summary

F7 manage-crud-alignment merge `136b1eb` 後、F7 CDP browser smoke demo 過程 catch 出 2 個 backend acceptance gap,本 feature(F7.1)修齊:

1. **US1 P1 F5.1 wiring bug fix** — `init_protected_menu_router()` 把 `merge_router!` 單 service 注入改為 multi-service manual layer pattern(對齊 F9 R-③ + `init_authorization_router` 既有 pattern)、顯式加 `Arc<SysAuthService>` Extension layer。解 `/route/getUserRoutes` HTTP 500 `Missing request extension`。
2. **US2 P2 F7 menu paginated wrapper fix** — `list_menu_for_systemmanage` return type 從 `Res<Vec<SystemManageMenuOutput>>` 改為 `Res<PaginatedData<SystemManageMenuOutput>>`、對齊 base-web TS type `Api.SystemManage.MenuList = Common.PaginatingQueryRecord<Menu>`。解 base manage/menu view 顯示「无数据」。

技術途徑:2 file rust source 改(~25 LOC)、無 migration、無 docker-compose 改、無 unit test;acceptance compensate = curl + CDP smoke;兩段式 commit。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api 既有 workspace、不指定版本)
**Primary Dependencies**: axum(`Extension` extractor / `Router`)、`server_service::admin::{SysAuthService, SysMenuService}`、`server_core::web::{page::PaginatedData, res::Res}`
**Storage**: PostgreSQL(F7.1 不改 schema、不寫 row、不動 migration)
**Testing**: 無 rust unit test(per spec FR-015 + F7 FR-021 / F11/F9 同精神);acceptance = curl + node CDP smoke script
**Target Platform**: Linux container(rust-api docker image、W-FA1 stack profile track-a)
**Project Type**: web-service backend(rust-api worktree、傘狀 monorepo submodule)
**Performance Goals**: handler latency 不主動 benchmark(wiring fix 無新 DB call、paginated wrapper 為純記憶體 Vec → struct 包裝)
**Constraints**: base-web + nestjs fork 三邊零改動(Constitution IV)、無 docker-compose 改、acceptance ≤ 30s(NFR-001)
**Scale/Scope**: 2 file ~25 LOC rust patch(`router_initialization.rs` ~15 LOC + `sys_system_manage_api.rs` ~10 LOC)、~10-14 task、F7 小型 follow-up

無 NEEDS CLARIFICATION — brainstorm 3 Q 全拍板、spec 0 個 [NEEDS CLARIFICATION] marker。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | F7.1 不改 Casbin policy(FR-009)、不改 enforce flag(FR-003 維持 `need_casbin=true`)。`/route/getUserRoutes` allow 由 F5.1 m20260515 seed 既有 cover。wiring fix 純修 Extension 注入、不放寬 authorization |
| II | Soft Delete + Audit | **N/A** | F7.1 無 DB 寫入操作(無 migration、無 row、wiring fix 與 menu list paginated wrapper 都是 read path) |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | F7.1 不引入服務間 HTTP/RPC;wiring fix 為 router-level Extension 注入(同進程 axum layer)、非跨服務呼叫。`/route/getUserRoutes` endpoint ownership 仍 rust(nginx config 不改) |
| IV | base 不改動邊界 | **PASS** | F7.1 嚴守 `base-web/` 全 0 diff(FR-010、含 `.env`)、nestjs fork 0 diff(FR-011);所有 fix 集中 rust 端。menu paginated wrapper 是「後端適應 base API 期望」(`Api.SystemManage.MenuList` paginated contract)、正是 Principle IV 精神 |
| V | 漸進收縮 | **PASS** | F7.1 wiring fix + paginated wrapper 在 DESIGN-B(rust-only)階段完全繼承(identical);`/route/getUserRoutes` 為 rust 自有 endpoint、跨 DESIGN-A/B;nestjs 不涉及 |

**架構約束檢查**:
- 部署形態 / DB / redis / TLS / secret / migration trigger / port / observability / backup / 背景工作 / CI — F7.1 全 N/A(2 file rust source 改、不動 deploy / infra 配置)

**Gate 結果**:**3 PASS / 1 N/A(Principle II)/ 0 violation** — Constitution Check 通過、無需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/023-fix-route-getuserroutes-wiring/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出(/speckit-plan)
├── data-model.md        # Phase 1 產出(/speckit-plan)
├── quickstart.md        # Phase 1 產出(/speckit-plan)
├── contracts/
│   └── verification-commands.md   # Phase 1 產出(/speckit-plan)
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(非本命令)
```

### Source Code (rust-api worktree)

```text
rust-api/
├── server/
│   ├── initialize/src/
│   │   └── router_initialization.rs       # 改 ~15 LOC(US1、init_protected_menu_router wiring)
│   └── api/src/admin/
│       └── sys_system_manage_api.rs       # 改 ~10 LOC(US2、list_menu_for_systemmanage paginated)
└── (其餘全不動)
```

**Structure Decision**:F7.1 為 rust-api worktree 內 2 file 改的小型 follow-up patch、無新建 file、無 migration、無 module register 改。對比 F7(9 file 含新建 Output DTO / API / migration)— F7.1 scope 顯著收緊,因為兩個 fix 都是改既有 handler / wiring 的 in-place 修正。outer 端只動 spec docs + INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker + rust-api SHA pin。

## Phase 0: research(見 [research.md](research.md))

F7.1 為小型 follow-up、brainstorm 已 saturated;Phase 0 紀錄 3 個 implement-time pattern 確認(非 spec 級 unknown):
- R-Q1:`init_protected_menu_router` wiring fix 對齊 F9 R-③ manual layer pattern 確認
- R-Q2:`list_menu_for_systemmanage` paginated wrapper 對齊 F7 既有 3 個 paginated handler pattern 確認
- R-Q3:F11 R-Q5/R-Q6 + F7 R-Q4 CDP smoke setup 沿用紀律確認

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 `init_protected_menu_router` wiring 改動細目 + E2 `list_menu_for_systemmanage` paginated wrapper 改動細目 + E3 既有 `PaginatedData<T>` envelope shape(F7.1 不改)
- **contracts/verification-commands.md**:C-V1~C-V10 verification scenario(curl + CDP smoke)
- **quickstart.md**:F7.1 落地操作步驟(rebuild + restart + acceptance)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — F7.1 data-model 確認無 schema 改、無 Casbin row、無 base-web 改;**3 PASS / 1 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
