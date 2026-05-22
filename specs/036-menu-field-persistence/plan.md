# Implementation Plan: W-FW7 — menu-field-persistence

**Branch**: `036-menu-field-persistence` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/036-menu-field-persistence/spec.md`

## Summary

補完 W-FW2 留下的 menu 欄位持久化缺口（W-FW2-N1）。`sys_menu` 加 3 個 nullable 欄位 —— `query`（JSONB，路由查詢參數 `{key,value}[]`）/ `buttons`（JSONB，菜單按鈕定義 `{code,desc}[]`）/ `fixed_index_in_tab`（INTEGER，固定頁籤索引）。三欄寫入由 systemManage transform 路徑透傳至 native `MenuInput` 與 menu service（單筆 `sys_menu` row 同 transaction）；admin 讀回由 `SystemManageMenuOutput`（`From<MenuTree>`）填真值（取代既有硬寫 `None`）；runtime 動態路由由 `RouteMeta` 加 `query` + `fixedIndexInTab`（**不**加 `buttons`，Q2 拍板）使前端路由系統生效。base-web **0 改動**（exploration + Phase 0 R-Q1/R-Q2 已驗證 modal UI 已 render 3 欄、handleInitModel 已含 null 防護）。比照 W-FW1~W-FW5 接線模式。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM，rust-api worktree）；無 base-web 改動（exploration 已驗證 modal UI 與型別齊備）
**Primary Dependencies**: Sea-ORM `JsonBinary` column type、`serde_json::Value`、既有 menu service / transform handler / `getUserRoutes` 組裝；audit log（既有路徑自動涵蓋）
**Storage**: PostgreSQL —— `sys_menu`（既有 23 欄 + 本 feature 新增 3 欄）
**Testing**: acceptance-only —— curl + psql + CDP browser smoke；wiring / schema 擴充類 feature，無新純函式（資料寫入 / 讀出由 Sea-ORM 自動 derive、新 JSONB 欄位序列化由 serde 既有體例承擔），正確性由 acceptance 的 psql 結構檢查 + curl round-trip + CDP modal 互動覆蓋，比照 W-FW1~W-FW5 慣例
**Target Platform**: Linux container（docker-compose dev stack:front-nginx + rust-api + postgres + redis）
**Project Type**: web —— rust-api backend（雙 worktree 仍然存在，但 base-web 本 feature 0 改動）
**Performance Goals**: N/A（admin 管理操作 + runtime route 讀取，低 throughput、查詢負載沿用既有 menu 列表 / `getUserRoutes`）
**Constraints**: W-WEBUI §4 base-web 修改邊界（本 feature 預期 0 改動）；多段式 commit（CLAUDE.md §4.1）；向後相容（FR-009、E-6 — runtime route meta 新欄 `Option::is_none` 不出現）
**Scale/Scope**: rust-api ~10 元件（A1 migration / A2 entity / B1 native MenuInput / B2 transform DTO / B3 transform handler / B4 menu service / C1 SystemManageMenuOutput `From` / C2 MenuTree / D1 RouteMeta / D2 MenuRoute 組裝）+ base-web 0 檔（exploration 已確認）

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。對照 `.specify/memory/constitution.md` v1.2.0。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | 不改 auth；3 個新欄位無權限語意（buttons 的 runtime 權限消費由 W-FW6 處理、本 feature 僅持久化定義）。`/systemManage/{addMenu,updateMenu,getMenuList}` 與 `/route/getUserRoutes` 沿用 Casbin enforcement 不變。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | menu create/update 既有 audit 路徑（`audit_log::write_in_txn` + `audit_snapshot(&menu_model)`）對 entity 全欄序列化 → 新 3 欄自動進 audit payload，**無需新增 audit 邏輯**。3 欄為 menu entity 自身欄位（非新表 / 新 M:N 關聯）—— 沿用 menu 既有 soft delete / cleanup 機制。 | ✅ PASS（既有 audit 路徑自動涵蓋） |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP / RPC。`/systemManage/*` 與 `/route/*` 由 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW7 屬 **W-WEBUI 軌道受管例外**（Constitution IV v1.2.0，列舉含 `W-FW1`–`W-FW7`）。base-web 預期 **0 改動** —— Phase 0 R-Q1/R-Q2 已驗證 modal UI 已 render 3 欄、handleInitModel 已含 null 防護、`Api.SystemManage.Menu` 既有型別涵蓋 3 欄。若實作期發現需微調，限於 `menu-operate-modal.vue` 單檔（§4 准動清單內）。**0 typings 改動**、0 router/store/i18n/版面改動。 | ✅ PASS（行使 v1.2.0 W-WEBUI 受管例外；預期 0 base-web 改動） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態）；rust-only。DB schema 變更 = `sys_menu` 加 3 欄（W-FW2-N1 既有 follow-up 範疇、本 feature 整個工作的核心），additive、現有 row 全 nullable 不受影響、含對稱 down migration。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。

> **註 — Constitution v1.2.0 行使**：本 feature 為 v1.2.0「W-WEBUI 軌道受管例外」第二次行使（首次 = 035 W-FW5）。`W-FW1`–`W-FW7` 列舉含本 feature；本 feature 不需新增 amendment（base-web 預期 0 改動、無新增 UI）。Phase 1 設計未引入新 violation，post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/036-menu-field-persistence/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出
├── research.md          # Phase 0 —— R-Q1 / R-Q2 / R-Q3 resolved
├── data-model.md        # Phase 1 —— schema + entity + DTO + RouteMeta 改動
├── quickstart.md        # Phase 1 —— dev stack 啟動 + 驗證流程
├── contracts/
│   └── verification-commands.md   # Phase 1 —— C-V acceptance contract
├── checklists/
│   └── requirements.md  # /speckit-specify 產出（16/16 PASS）
└── tasks.md             # /speckit-tasks 產出（非本指令產生）
```

### Source Code (worktree)

```text
rust-api/  (worktree, branch rev1-admin-rust-api)
├── migration/src/schemas/m<timestamp>_add_menu_fields_to_sys_menu.rs   # A1: schema migration（3 欄 + down）
├── migration/src/lib.rs                                                # A1: register 新 migration
├── server/model/src/admin/entities/sys_menu.rs                         # A2: entity 加 3 欄（query/buttons JsonBinary nullable + fixed_index_in_tab i32 nullable）
├── server/model/src/admin/input/sys_menu.rs                            # B1+B2: native MenuInput + transform DTO（SystemManageAddMenuInput / SystemManageUpdateMenuInput）各加 3 欄
├── server/api/src/admin/sys_system_manage_api.rs                       # B3: transform handler（add/update menu）對映 3 欄至 native MenuInput
├── server/service/src/admin/sys_menu_service.rs                        # B4: menu service create/update 寫 3 欄進 sys_menu ActiveModel；既有 audit 自動涵蓋
├── server/model/src/admin/output/sys_system_manage.rs                  # C1: SystemManageMenuOutput.From<MenuTree> 對映 3 欄真值（取代硬寫 None）
├── server/service/src/admin/sys_menu_service.rs（同 B4 檔）            # C2: MenuTree 加 3 欄 / menu list 查詢帶 3 欄（與 C1 同檔群聚）
├── server/model/src/admin/output/sys_menu.rs                           # D1+D2: RouteMeta 加 query + fixed_index_in_tab（皆 skip_serializing_if）；MenuRoute 組裝（getUserRoutes 路徑）填這 2 欄

base-web/  (worktree, branch rev1-admin-base-web)
└── （預期 0 改動 —— exploration + R-Q1/R-Q2 已驗證 modal UI / 型別 / null 防護齊備）
```

**Structure Decision**: 雙 worktree（rust-api + base-web）但 base-web 本 feature 0 改動；rust-api ~10 元件、單一 transaction 寫入（同 `sys_menu` row）。多段式 commit（rust-api worktree commit + push fork → outer 更新 SHA pin）；base-web 0 改動故第一段 commit 只有 rust-api。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
