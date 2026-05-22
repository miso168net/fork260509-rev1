# Implementation Plan: W-FW3 — role-crud-wiring

**Branch**: `033-role-crud-wiring` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-role-crud-wiring/spec.md`

## Summary

base-web `manage/role` 的新增 / 編輯 drawer 送出與列表單筆 / 批次刪除接上 rust-api。rust-api 在 `/systemManage/` 補 4 個 role 寫入 alias（`addRole` / `updateRole` / `deleteRole` / `batchDeleteRole`），各為 base-web-shaped DTO → 既有 native role service（`create_role` / `update_role` / `delete_role`）的 transform handler。一併修 `update_role` 不持久 `status`（FR-006），並以 transform-layer code-lock 鎖定 roleCode 不可編輯、防孤兒化 Casbin policy（FR-007）。base-web 端補 4 個 service function 並接 drawer / list handler。比照 W-FW1（031）/ W-FW2（032）接線模式。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM，rust-api worktree）/ TypeScript + Vue 3 + naive-ui（base-web worktree）
**Primary Dependencies**: axum router、Sea-ORM、Casbin enforcement；base-web `request` helper、naive-ui NDrawer / NDataTable
**Storage**: PostgreSQL —— `sys_role`（role 主表，`id` 為 string 欄）、`casbin_rule`（授權政策）、`sys_operation_log`（audit）
**Testing**: acceptance-only —— CDP browser smoke + curl + psql；wiring feature、無新純函式單元測試（transform / 對映由 acceptance 覆蓋，比照 W-FW1 / W-FW2 慣例）
**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis）
**Project Type**: web —— rust-api backend + base-web frontend，雙 worktree
**Performance Goals**: N/A（admin CRUD、低 throughput）
**Constraints**: W-WEBUI §4 base-web 修改邊界（僅 service function + handleSubmit + delete handler，不碰型別 / render / router / store / i18n）；多段式 commit（CLAUDE.md §4.1）
**Scale/Scope**: rust-api 5 元件（E1 DTO / E2 transform handler / E3 route / E4 status fix / E5 Casbin seed migration）+ base-web 3 檔

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | 4 個新 role 寫入 alias 由後端 Casbin enforce；E5 migration 補對應 `casbin_rule` policy（ROLE_SUPER + ROLE_ADMIN allow）。前端不做 access control。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | `delete_role` 為 soft delete（既有 `soft_delete_by_id`）；create / update / delete 經既有 native service 的 audit path（業務 + audit 同 txn）。本 feature 不繞過。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | alias 與 native service 同進程、無後端間 HTTP / RPC；`/systemManage/*` 由 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW3 屬 **W-WEBUI 軌道受管例外**（Principle IV「受管例外 — W-WEBUI 軌道」，W-FW1–W-FW4）。base-web 改動嚴格限 §4 範圍：`system-manage.ts` 寫入 function + `role-operate-drawer.vue` handleSubmit + `role/index.vue` delete handler；不碰型別 / render / router / store / i18n。 | ✅ PASS（W-WEBUI 例外明文適用） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態、nestjs 已退場）；rust-only。DB schema 零改動。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。Phase 1 設計未引入新 violation，post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/033-role-crud-wiring/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出
├── research.md          # Phase 0 —— R-Q1/R-Q2/R-Q3 resolved
├── data-model.md        # Phase 1 —— alias DTO / transform 對映 / Casbin seed
├── quickstart.md        # Phase 1 —— dev stack 啟動 + 驗證流程
├── contracts/
│   └── verification-commands.md   # Phase 1 —— C-V acceptance contract
├── checklists/
│   └── requirements.md  # /speckit-specify 產出
└── tasks.md             # /speckit-tasks 產出（非本指令產生）
```

### Source Code (worktree)

```text
rust-api/  (worktree, branch rev1-admin-rust-api)
├── server/model/src/admin/input/sys_role.rs              # E1: + 4 alias DTO
├── server/model/src/admin/input/mod.rs                   # E1: re-export
├── server/api/src/admin/sys_system_manage_api.rs         # E2: + 4 transform handler
├── server/router/src/admin/sys_system_manage_route.rs    # E3: + 4 route + RouteInfo
├── server/service/src/admin/sys_role_service.rs          # E4: update_role status 修正
└── migration/src/datas/m20260522_d_wfw3_role_alias_seed.rs  # E5: Casbin seed（+ mod.rs / lib.rs register）

base-web/  (worktree, branch rev1-admin-base-web)
├── src/service/api/system-manage.ts                      # + fetchAddRole / Update / Delete / BatchDelete
├── src/views/manage/role/modules/role-operate-drawer.vue # handleSubmit 接 add / update
└── src/views/manage/role/index.vue                       # handleDelete / handleBatchDelete 接線
```

**Structure Decision**: 雙 worktree（rust-api + base-web）。rust-api 5 元件 E1–E5、base-web 3 檔。多段式 commit（worktree commit + push fork → outer 更新 SHA pin）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation,本表留空。
