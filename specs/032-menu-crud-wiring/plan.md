# Implementation Plan: W-FW2 — menu-crud-wiring（base-web menu CRUD 接線）

**Branch**: `032-menu-crud-wiring` | **Date**: 2026-05-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/032-menu-crud-wiring/spec.md`

## Summary

W-WEBUI 軌道第二個 feature —— 把 base-web `manage/menu` 的新增 / 編輯 / 加子菜單 modal + 單筆刪除 + 批次刪除 5 個 stub 操作接上 rust-api。比照 W-FW1（031）模式,兩部分:

- **後端（rust-api worktree）— systemManage menu 寫入 alias 轉換層**:`/systemManage/` 新增 4 條 menu 寫入 alias（`addMenu` / `updateMenu` POST、`deleteMenu` / `batchDeleteMenu` DELETE）。新增 base-web-shaped input DTO（`SystemManageAddMenuInput` / `SystemManageUpdateMenuInput` / `DeleteMenuByBodyInput` / `BatchDeleteMenuInput`），薄 transform handler 把 base-web 表單形狀（`menuType` / `iconType` / `status` `'1'/'2'`、`parentId` number、`order`）對映為後端 domain 形狀（`MenuType` enum、`icon_type` i32、`Status` enum、`pid` String、`sequence`），呼既有 `create_menu` / `update_menu` / `delete_menu` service。`batchDeleteMenu` 為 native 無對應的新 alias（per-row loop）。新增 Casbin policy seed migration（4 條新 path）。
- **前端（base-web worktree）— 接線**:`service/api/system-manage.ts` 補 4 個寫入 service function;`menu-operate-modal.vue` `handleSubmit` 接 add / update;`menu/index.vue` `handleDelete` / `handleBatchDelete` 接 delete / batchDelete。

**Phase 0 research 關鍵發現**:`MenuType` enum 序列化為 `"directory"/"menu"`、不接受 base-web 的 `'1'/'2'` → 必經 transform;`MenuInput.pid` validator `min=1`、root 菜單 `parentId 0` → `pid "0"` 剛好通過;`UpdateMenuInput` 雖 `#[serde(flatten)]` 但 transform handler 在 Rust 端直接構造、**不需 un-flatten**,`sys_menu_service.rs` 零改動。

**多段式 commit**:base-web worktree commit + rust-api worktree commit + outer。**有 Casbin seed migration、無 `sys_menu` schema 改**。

## Technical Context

**Language/Version**: Rust（rust-api worktree）+ TypeScript / Vue 3（base-web worktree）
**Primary Dependencies**: 無新增 —— rust 端 `axum` / `sea-orm` / 既有 `server-model`·`server-api`·`server-service`·`server-router`·`migration`;base-web 端既有 `@/service/request`、Naive UI、`useTableOperate` hook
**Storage**: PostgreSQL —— **無 `sys_menu` schema 改**;唯一 DB 變動為 Casbin policy seed migration（4 條新 alias path 的 allow rule）
**Testing**: rust 端無新純函式（transform / 對映 helper 以 acceptance 覆蓋,比照 W-FW1 / F8 wiring feature 慣例）;acceptance = CDP browser smoke + curl + psql（per spec FR-019）
**Target Platform**: Linux container — rust-api docker image + base-web docker image + postgres
**Project Type**: web —— frontend（base-web worktree）+ backend（rust-api worktree）雙 worktree feature
**Performance Goals**: N/A — admin CRUD、無效能面
**Constraints**: base-web 改動限 W-WEBUI §4 受控範圍（menu 模組 service/api + modal handleSubmit + index delete handler）;不改型別 / render / router / store / i18n / `shared.ts`;不擴 `sys_menu` schema（`query`/`buttons`/`fixedIndexInTab` scope out）;不動 nestjs fork
**Scale/Scope**: rust-api worktree ~8 檔（input DTO `sys_menu.rs` + `input/mod.rs` re-export + `service/admin/mod.rs` re-export + transform handler `sys_system_manage_api.rs` + route `sys_system_manage_route.rs` + 新 Casbin seed migration + `datas/mod.rs` + `lib.rs`）;base-web worktree 3 檔（`system-manage.ts` + `menu-operate-modal.vue` + `menu/index.vue`）;無 schema migration、無新 crate

無 NEEDS CLARIFICATION —— spec 0 marker、`/speckit-clarify` 0 question（taxonomy 全 Clear）、Phase 0 research 6 個 R-Q 已解。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | 新增的 4 條 `/systemManage/{addMenu,updateMenu,deleteMenu,batchDeleteMenu}` alias path 由新 Casbin seed migration 補 policy（Soybean ROLE_SUPER + Administrator ROLE_ADMIN allow、GeneralUser default deny）;Casbin enforcement 由既有 middleware 自動沿用、transform handler 在 enforcement 之後 |
| II | Soft Delete + Audit | **PASS** | delete 走既有 `delete_menu` soft-delete service;create / update 既有 `audit_log::write_in_txn` hook 沿用（transform handler 只調整輸入形狀、不繞 audit） |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | 純 rust 單後端、無服務間 forward |
| IV | base 不改動邊界 | **PASS（W-WEBUI 受管例外）** | W-FW2 修改 base-web `system-manage.ts` + `menu-operate-modal.vue` handleSubmit + `menu/index.vue` delete handler —— 全在 constitution v1.1.0 Principle IV「受管例外 — W-WEBUI 軌道」+ DESIGN-W-WEBUI §4 受控範圍內;不碰型別 / render / router / store / `shared.ts` |
| V | 漸進收縮 | **N/A** | DESIGN-B（rust-only）形態,非 DESIGN-A→B 遷移範疇 |

**架構約束檢查**:
- **資料庫**:有 1 個 migration —— **僅 Casbin policy seed、無 `sys_menu` schema 改**;rust 主導 migration（per 架構約束）— PASS
- **快取 / pub-sub / TLS / Secret / Port / Observability / Backup / 背景工作 / CI-CD / 部署形態**:皆不碰 — N/A

**Gate 結果**:**4 PASS / 1 N/A / 0 violation** —— Constitution Check 通過、無需 Complexity Tracking。本 feature 為 Constitution v1.1.0「W-WEBUI 受管例外」第二次行使（W-FW1 之後）。

## Project Structure

### Documentation (this feature)

```text
specs/032-menu-crud-wiring/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔（/speckit-plan）
├── research.md          # Phase 0 — R-Q1~R-Q6 ✓
├── data-model.md        # Phase 1 — E1~E6 變更模型 ✓
├── quickstart.md        # Phase 1 ✓
├── contracts/
│   └── verification-commands.md   # Phase 1 — C-V1~C-V11 ✓
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出（本指令不產）
```

### Source（雙 worktree）

```text
# rust-api worktree
rust-api/server/model/src/admin/input/sys_menu.rs              # E1:4 個 alias input DTO
rust-api/server/model/src/admin/input/mod.rs                   # E1:re-export 4 DTO
rust-api/server/service/src/admin/mod.rs                       # E2:entity re-export 加 MenuType
rust-api/server/api/src/admin/sys_system_manage_api.rs         # E2:4 transform handler + map_menu_type/map_icon_type
rust-api/server/router/src/admin/sys_system_manage_route.rs    # E3:4 條 menu 寫入 alias route + RouteInfo
rust-api/server/migration/src/datas/m20260522_*_menu_alias_seed.rs  # E4:新建 — Casbin policy seed
rust-api/server/migration/src/datas/mod.rs                     # E4:register 新 migration
rust-api/server/migration/src/lib.rs                           # E4:Migrator vec 加新 migration

# base-web worktree
base-web/src/service/api/system-manage.ts                      # E5:fetchAddMenu / fetchUpdateMenu / fetchDeleteMenu / fetchBatchDeleteMenu
base-web/src/views/manage/menu/modules/menu-operate-modal.vue  # E6:handleSubmit 接 add / update
base-web/src/views/manage/menu/index.vue                       # E6:handleDelete / handleBatchDelete 接 delete / batchDelete
（無 sys_menu schema migration、無 base-web 型別 / render / router / store / shared.ts 改、不動 nestjs、sys_menu_service.rs 零改動）
```

**Structure Decision**: 雙 worktree feature —— 後端 systemManage menu 寫入 alias 轉換層（rust-api worktree、~8 檔含 Casbin seed migration）+ 前端接線（base-web worktree、3 檔）。比照 F9 / W-FW1 alias 體例（transform handler 置 `sys_system_manage_api.rs`、alias DTO 置 `input/sys_menu.rs`、Casbin seed 置新 migration）。多段式 commit:Stage 1a rust-api worktree、Stage 1b base-web worktree、Stage 2 outer（兩 SHA pin + spec docs）。

## Phase 0: research（見 [research.md](research.md)）

Phase 0 對 rust-api + base-web worktree 調查,解 6 個 R-Q:
- R-Q1:`menuType` / `iconType` / `status` write 方向值域對映表（F7 Output `map_*` 反向）
- R-Q2:`parentId`（number）→ `pid`（String）`.to_string()`;root 慣例 pid `"0"`（`min=1` validator 剛好通過）
- R-Q3:`deleteMenu` body-id 變形 handler（`DeleteMenuByBodyInput`,比照 F9 `delete_user_by_body`）
- R-Q4:`batchDeleteMenu` per-row loop（`BatchDeleteMenuInput`,比照 F9 `batch_delete_users`、無 cascade）
- R-Q5:alias URL 命名（`addMenu`/`updateMenu`/`deleteMenu`/`batchDeleteMenu`）+ Casbin seed migration
- R-Q6:base-web `request` helper 錯誤呈現（沿用 W-FW1）

關鍵 gotcha:`MenuType` 不接受 `'1'/'2'`、`pid` validator `min=1`、`UpdateMenuInput` 不需 un-flatten、`MenuType` 需補 `server_service::admin` re-export。

## Phase 1: Design & Contracts（見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md)）

- **data-model.md**:E1 alias DTO（4 個）/ E2 transform handler（4 個）+ 對映 helper / E3 route / E4 Casbin seed migration / E5 base-web service function / E6 base-web handleSubmit + delete handler;含變更後 data flow。
- **contracts/verification-commands.md**:C-V1~C-V11 —— image rebuild / dev stack + migration / curl addMenu（頂層 + 加子菜單）·updateMenu·deleteMenu·batchDeleteMenu / 形狀對映驗 / `query`/`buttons`/`fixedIndexInTab` 忽略驗 / soft delete 驗 / audit 驗 / Casbin seed + deny / CDP smoke / 三邊 scope。
- **quickstart.md**:落地操作（改動清單 + 實作順序 + build/驗證 + 多段式 commit）。

**Constitution Re-check（post-design）**:Phase 1 設計後重新檢查 —— data-model E1-E6 確認:base-web 改動限 §4 受控範圍（IV W-WEBUI 例外）;新 alias path 由 E4 Casbin seed 補 policy（I）;delete 走既有 soft-delete service、create/update audit hook 不受影響（II）;無服務間 forward（III）;`sys_menu` schema 不動。**4 PASS / 1 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
