# Implementation Plan: F7.2 — role-code-alignment

**Branch**: `024-role-code-alignment` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/024-role-code-alignment/spec.md`

## Summary

F7.1 fix-route-getuserroutes-wiring merge `efe910e` 後第一個 follow-up — F7.1 CDP browser smoke demo 階段為了讓 base-web static 模式路由過濾通過、用了 `Fetch.requestPaused` 攔 `/auth/getUserInfo` 注入 `R_SUPER`/`R_ADMIN` role alias 的 demo-only workaround。F7.2 收掉這個 workaround:

**US1 P1 role code alias 映射** — `get_user_info` handler 對回傳的 `roles[]` 套一個純函式 role-code alias 映射(`ROLE_SUPER`→`R_SUPER` / `ROLE_ADMIN`→`R_ADMIN` / `ROLE_USER`→`R_USER`、未知 code 原樣 pass through),讓 base-web example 分支 static 模式的 3 處 role 比對(`filterAuthRoutesByRoles` / route guard / `isStaticSuper`)原生接通。

技術途徑:1 file rust source 改(~10 LOC + 1 unit test fn)、無 migration、無 docker-compose 改;JWT `Claims.role` / `casbin_rule.v0` / `sys_role.code` 三者全不動、映射只在 `getUserInfo` response 邊界;acceptance compensate = curl + CDP smoke(不帶 workaround);兩段式 commit。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api 既有 workspace、不指定版本)
**Primary Dependencies**: axum(`get_user_info` handler)、`server_model::admin::output::UserInfoOutput`、`server_core::web::auth::User`(`subject()` 回 `Vec<String>`)
**Storage**: PostgreSQL(F7.2 不改 schema、不寫 row、不動 migration)
**Testing**: 1 個 rust unit test(mapping helper 純函式、per spec FR-013 + F10.2 precedent);acceptance = curl + node CDP smoke script
**Target Platform**: Linux container(rust-api docker image、W-FA1 stack profile track-a)
**Project Type**: web-service backend(rust-api worktree、傘狀 monorepo submodule)
**Performance Goals**: N/A — 純記憶體 string 映射(每 user 數個 role、無 DB call、無 IO)
**Constraints**: base-web + nestjs fork 三邊零改動(Constitution IV)、無 docker-compose 改、acceptance ≤ 30s
**Scale/Scope**: 1 file rust patch(`sys_authentication_api.rs` ~10 LOC + 1 unit test fn)、F7.1 的小型 follow-up

無 NEEDS CLARIFICATION — brainstorm 2 Q + 1 Approach 全拍板、spec 0 個 [NEEDS CLARIFICATION] marker、`/speckit-clarify` 0 question(taxonomy scan 全 Clear)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | F7.2 不改 Casbin policy、不擴 scope、不改 enforce flag。role code 映射只在 `getUserInfo` response 邊界;後端 Casbin enforce 路徑(JWT `Claims.role` × `casbin_rule.v0`)維持 `ROLE_*` 不變。Principle I 明言「前端 menu 隱藏為 UX 優化」— F7.2 修的正是 SPA static route filter(UX 層)、不碰後端 authorization 決策 |
| II | Soft Delete + Audit | **N/A** | F7.2 無 DB 寫入操作(無 migration、無 row;`getUserInfo` 為 read path、role code 映射為純記憶體轉換) |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | F7.2 不引入服務間 HTTP/RPC;映射為單一 handler 內純函式轉換。`getUserInfo` endpoint ownership 仍 rust(nginx config 不改) |
| IV | base 不改動邊界 | **PASS** | F7.2 嚴守 `base-web/` 全 0 diff(FR-008、含 `src/` 與 `.env`)、nestjs fork 0 diff(FR-009);role code 映射是「後端適應 base 既有 API 期望」— base example static filter 用 `R_*`、rust `getUserInfo` 適應輸出,正是 Principle IV「所有 API 路徑/方法/payload 形狀 GAP 由後端適應」精神 |
| V | 漸進收縮 | **PASS** | F7.2 role code 映射在 DESIGN-B(rust-only)階段完全繼承(identical);`getUserInfo` 為 rust 自有 endpoint、跨 DESIGN-A/B;nestjs 不涉及、退場時零改動 |

**架構約束檢查**:
- 部署形態 / DB / redis / TLS / secret / migration trigger / port / observability / backup / 背景工作 / CI — F7.2 全 N/A(1 file rust source 改、不動 deploy / infra 配置)

**Gate 結果**:**4 PASS / 1 N/A(Principle II)/ 0 violation** — Constitution Check 通過、無需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/024-role-code-alignment/
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
└── server/api/src/admin/
    └── sys_authentication_api.rs   # 改 ~10 LOC(US1、role-code alias 映射 helper + get_user_info handler roles 套映射 + #[cfg(test)] 1 fn)
（其餘全不動）
```

**Structure Decision**:F7.2 為 rust-api worktree 內 **1 file** 改的小型 follow-up patch、無新建 file、無 migration、無 module register 改。對比 F7.1(2 file)、F7(9 file)— F7.2 scope 再收緊,因為唯一改動是在既有 `get_user_info` handler 加一個純函式映射 helper + 套用 + 1 unit test。outer 端只動 spec docs + INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker + rust-api SHA pin。

## Phase 0: research(見 [research.md](research.md))

F7.2 為小型 follow-up、brainstorm 已 saturated;Phase 0 紀錄 3 個 implement-time pattern 確認(非 spec 級 unknown):
- R-Q1:role-code alias 映射 helper 的形式與放置位置確認(明確 `match` 純函式、放 `sys_authentication_api.rs`)
- R-Q2:base-web example 分支 static 模式 role 消費點全覆蓋確認(brainstorm grep 結果固化)
- R-Q3:F7.1 CDP smoke setup 沿用 + 移除 role alias 注入段的紀律確認

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 role-code alias 映射 helper 細目(input/output/match arms/unknown pass-through)+ E2 `get_user_info` handler 改動細目 + E3 既有 `UserInfoOutput` envelope shape(F7.2 不改)+ E4 映射前後 `getUserInfo` response 對照
- **contracts/verification-commands.md**:C-V1~C-V9 verification scenario(curl + CDP smoke 不帶 workaround + unit test)
- **quickstart.md**:F7.2 落地操作步驟(rebuild + restart + acceptance + 兩段式 commit)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — F7.2 data-model 確認無 schema 改、無 Casbin row、無 base-web 改、無 JWT 改;**4 PASS / 1 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
