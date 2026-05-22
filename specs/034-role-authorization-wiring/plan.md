# Implementation Plan: W-FW4 — role-authorization-wiring

**Branch**: `034-role-authorization-wiring` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/034-role-authorization-wiring/spec.md`

## Summary

base-web `manage/role` 的菜單授權 modal（`menu-auth-modal.vue`）接上 rust-api。rust-api 在 `/systemManage/` 補 2 條 role 菜單授權 alias（`getRoleMenuIds` 讀 / `assignRoleMenus` 寫），各為 base-web-shaped 形狀 → 既有 native service（`SysMenuService::get_menu_ids_by_role_id` / `SysAuthorizationService::assign_routes`）的 thin transform handler，domain 由 JWT actor 伺服器端注入。rust 端另需補一層 `SysAuthorizationService` 的 Extension wiring（systemManage router 現缺）。base-web 端接 `menu-auth-modal.vue` 的 `getChecks`（讀）/ `handleSubmit`（寫）。按鈕授權 modal 與角色首頁選單為範疇外 follow-up（W-FW4-N1 / W-FW4-N2）。比照 W-FW1（031）/ W-FW2（032）/ W-FW3（033）接線模式。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM，rust-api worktree）/ TypeScript + Vue 3 + naive-ui（base-web worktree）
**Primary Dependencies**: axum router、Sea-ORM、Casbin enforcement；base-web `request` helper、naive-ui NModal / NTree
**Storage**: PostgreSQL —— `sys_role_menu`（role↔menu M:N 關聯表）、`sys_menu`、`casbin_rule`（端點授權政策）
**Testing**: acceptance-only —— CDP browser smoke + curl + psql；wiring feature、無新純函式單元測試（transform / 對映由 acceptance 覆蓋，比照 W-FW1/W-FW2/W-FW3 慣例）
**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis）
**Project Type**: web —— rust-api backend + base-web frontend，雙 worktree
**Performance Goals**: N/A（admin 授權設定、低 throughput）
**Constraints**: W-WEBUI §4 base-web 修改邊界（僅 service function + modal 的讀 / 送出 handler，不碰型別 / render / router / store / i18n）；多段式 commit（CLAUDE.md §4.1）
**Scale/Scope**: rust-api 5 元件（E1 DTO / E2 transform handler / E3 route / E4 Extension wiring / E5 Casbin seed migration）+ base-web 2 檔

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | 2 條新 alias 由後端 Casbin enforce；E5 migration 補對應 `casbin_rule` policy（ROLE_SUPER + ROLE_ADMIN allow）。菜單授權本身即 RBAC 設定、寫 `sys_role_menu`；前端不做 access control。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | 寫操作經既有 native `assign_routes`、單一 transaction 內 delta 更新 `sys_role_menu`（M:N 關聯表 de-association 慣例、非業務實體軟刪範疇）。**實查發現** native `assign_routes` 未寫 `sys_operation_log` —— pre-existing native audit gap、非 W-FW4 引入；W-FW4 為 thin wiring、不新增未稽核寫入路徑、亦不補 native gap（撞「不重做業務邏輯」），該 gap 登 follow-up W-FW4-N3（比照 backlog R2 處理慣例）。 | ✅ PASS（W-FW4 不引入新違反；native audit gap 既有、已登 follow-up W-FW4-N3） |
| **III. 嚴版禁 Forward + 單一職責** | alias 與 native service 同進程、無後端間 HTTP / RPC；`/systemManage/*` 由 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW4 屬 **W-WEBUI 軌道受管例外**（Principle IV「受管例外 — W-WEBUI 軌道」，W-FW1–W-FW4）。base-web 改動嚴格限：`system-manage.ts` service function + `menu-auth-modal.vue` 的 `getChecks` / `handleSubmit`；不碰型別 / render / router / store / i18n。**註**：`getChecks` 為讀 handler，Constitution IV 例外條文列舉「handleSubmit / delete handler / 寫入 function」，而 IV 條文對 W-WEBUI 軌道精確範圍 defer 至 `INTEGRATION-DESIGN-W-WEBUI.md`；該文 §5.4 W-FW4 明文把 `getChecks` 納入本 feature 前端改動 → 在受管例外範圍內。 | ✅ PASS（W-WEBUI 例外明文適用；getChecks 讀 handler 經 DESIGN §5.4 明文納入） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態、nestjs 已退場）；rust-only。DB schema 零改動（唯一 DB 變動為 Casbin seed）。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。Phase 1 設計未引入新 violation，post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/034-role-authorization-wiring/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出
├── research.md          # Phase 0 —— R-Q1/R-Q2/R-Q3/R-Q4 resolved
├── data-model.md        # Phase 1 —— alias DTO / transform 對映 / Extension wiring / Casbin seed
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
├── server/model/src/admin/input/sys_role.rs              # E1: + AssignRoleMenusInput
├── server/model/src/admin/input/mod.rs                   # E1: re-export
├── server/api/src/admin/sys_system_manage_api.rs         # E2: + 2 transform handler
├── server/router/src/admin/sys_system_manage_route.rs    # E3: + 2 route + RouteInfo
├── server/initialize/src/router_initialization.rs        # E4: systemManage router + SysAuthorizationService Extension
└── migration/src/datas/m20260522_e_wfw4_role_auth_alias_seed.rs  # E5: Casbin seed（+ mod.rs / lib.rs register）

base-web/  (worktree, branch rev1-admin-base-web)
├── src/service/api/system-manage.ts                      # + fetchGetRoleMenuIds / fetchAssignRoleMenus
└── src/views/manage/role/modules/menu-auth-modal.vue     # getChecks / handleSubmit 接線
```

**Structure Decision**: 雙 worktree（rust-api + base-web）。rust-api 5 元件 E1–E5、base-web 2 檔。多段式 commit（worktree commit + push fork → outer 更新 SHA pin）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
