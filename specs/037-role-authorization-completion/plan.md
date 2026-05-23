# Implementation Plan: W-FW6 — role-authorization-completion

**Branch**: `037-role-authorization-completion` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/037-role-authorization-completion/spec.md`

## Summary

W-WEBUI follow-up 軌道收尾 feature，整併 W-FW3/W-FW4 過渡留下的 3 個關鍵 follow-up：

- **N2 role home 持久化**：`sys_role` 加 `home_route_name VARCHAR NULL`、entity 同步、兩 `/systemManage/` alias 端點（getRoleHome + updateRoleHome、validation reject 不存在 active route_name + active enabled + 排除 constant menu）、base-web menu-auth-modal home 段接真 API、既有 role 升級後 null 向後相容。
- **N3 assign_routes/users audit gap**：sys_authorization_service.rs 的 `assign_routes` + `assign_users` 各補 `audit_log::write_in_txn`（單 event、whole-snapshot before/after 含集合差異）+ trait signature 加 `actor: &Actor` 參數（cascade 至 ~3 處 handler）。**不**動 `assign_permission`（留 W-FW8）。
- **N4 role code 安全改名**：rust `update_role` detect code 變動時同步 `casbin_rule` policy rule（**只** ptype='p' 一條 SQL、R-Q3 確認既有資料 0 grouping rule）+ 主動呼叫 `notify_casbin_changed()` 觸發 enforcer reload；拿掉 W-FW3 transform-layer code-lock；base-web drawer 不改。

base-web 改動 ≤ 2 檔（`menu-auth-modal.vue` + `system-manage.ts`、§4 准動清單）、rust-api ~14 處（schema migration + Casbin policy seed migration + entity + 2 service method + 2 api handler + 1 input DTO + router 2 條 + 3 個既有函式改 + assign_* trait signature cascade）、0 nestjs、sys_role 加 1 欄 additive。比照 W-FW5/W-FW7 接線模式 + W-F11 既有 Casbin redis pub-sub 機制（reload trigger）。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM + Casbin、rust-api worktree）；base-web TypeScript / Vue 3（menu-auth-modal home 段接線 + 1 個 service function 對、§4 准動清單）

**Primary Dependencies**: Sea-ORM `VarChar` / `String` column type、既有 `audit_log::write_in_txn` + `audit_snapshot` helper（F2.1）、既有 `notify_casbin_changed()` helper（W-F11 / `server_global::casbin_notify`）、既有 sys_role_service.rs `update_role` / `get_role` / soft-delete facade、既有 sys_authorization_service.rs assign_routes / assign_users、既有 sys_menu_service.rs find_active

**Storage**: PostgreSQL —— `sys_role`（既有 11 欄 + 本 feature 新增 1 欄 home_route_name）、`casbin_rule`（既有 schema 不變、UPDATE 既有 row）、`sys_operation_log`（既有 F2.1 schema、N2/N3 新增 audit row）

**Testing**: acceptance-only —— curl + psql + CDP browser smoke；wiring / schema 擴充 / audit gap fill / Casbin 同步類 feature，無新純函式（資料寫入/讀出由 Sea-ORM derive、Casbin SQL 為 UPDATE 一條、audit_log helper 已 covered by F2.1 unit test），正確性由 acceptance 的 psql 結構檢查 + curl round-trip + CDP modal 互動覆蓋，比照 W-FW1~W-FW7 慣例

**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis）

**Project Type**: web —— rust-api backend + base-web frontend（≤ 2 檔改動）

**Performance Goals**: N/A（admin 管理操作 + N4 改 role code 為低頻管理操作；N2 home 讀寫端點與既有 systemManage alias 同 throughput；N3 audit 寫入額外 1 row per operation、與既有 audit 同量級）

**Constraints**: 
- W-WEBUI §4 base-web 修改邊界（本 feature ≤ 2 檔、不動 typings/router/store/i18n/版面）
- 多段式 commit（CLAUDE.md §4.1）
- 向後相容（FR-001/FR-015、E-1/E-8 — 既有 role home null、Casbin 同步失敗整體 rollback）
- N4 同步 Casbin 必須在同 transaction（FR-012）+ 主動 publish reload（R-Q2）

**Scale/Scope**: rust-api ~14 元件
- A1 migration（home_route_name 加 1 欄）
- A2 Casbin policy seed migration（3 role × 2 endpoint = 6 row）
- A3 sys_role entity 加 1 欄
- B1 input DTO `UpdateRoleHomeInput`
- B2 sys_role_service.rs 加 2 method（get_role_home / update_role_home）
- B3 sys_role_service.rs update_role detect code 變動 + UPDATE casbin_rule + notify_casbin_changed
- B4 sys_authorization_service.rs assign_routes 補 audit + trait signature 加 actor
- B5 sys_authorization_service.rs assign_users 補 audit + trait signature 加 actor
- C1 sys_system_manage_api.rs 加 2 handler（get_role_home_for_systemmanage / update_role_home_for_systemmanage）
- C2 sys_system_manage_api.rs update_role_for_systemmanage 拿掉 W-FW3 code-lock
- C3 sys_authorization_api.rs assign_routes handler 傳 actor（cascade）
- C4 sys_system_manage_api.rs assign_role_menus_for_systemmanage 傳 actor（cascade）
- C5 sys_authorization_api.rs assign_users handler 傳 actor（cascade）
- D1 router 註冊 2 條新 endpoint

+ base-web 2 檔
- E1 system-manage.ts 加 2 service function（fetchGetRoleHome / fetchUpdateRoleHome）
- E2 menu-auth-modal.vue getHome / updateHome 接真 API

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。對照 `.specify/memory/constitution.md` v1.2.0。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | N2 兩新端點受 Casbin 保護（A2 seed 6 row）、與既有 systemManage alias 一致。N4 拿掉 W-FW3 transform-layer code-lock + 加 rust native casbin 同步（在同 txn + reload publish）—— Casbin policy 仍對齊 role code、無孤兒、enforcement 不退化（R-Q3 確認既有資料 ptype='p' 一條 SQL 即夠）。N3 audit 補寫不改 auth 機制。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | N3 補 sys_authorization_service.rs 三個 assign_* 中的兩個（assign_routes / assign_users），補完 W-FW4 thin wiring 留下的 pre-existing gap；assign_permission 留 W-FW8 button-auth 動到時一併補（YAGNI、目前無 base-web expose）。N2 update_role_home 走專屬 service method 加 audit_log::write_in_txn + audit_snapshot(&role)。N4 既有 update_role audit 路徑自動涵蓋 code 變更（audit_snapshot 對整 entity）。Casbin policy UPDATE 為 side effect、屬「跨資源 side effect」範疇、Principle II 不要求 audit（同 W-F11 sync 既有 sys_user assign_roles_to_user path 不對 casbin UPDATE 單獨 audit）。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP/RPC。Casbin 同步用 `txn.execute` 直接 SQL（同進程 + 同 txn 原子性）；enforcer reload 透過 W-F11 既有 redis pub-sub channel（`casbin:policy:invalidate`、`notify_casbin_changed()` 函式）—— 共用基礎設施，非 service 間 HTTP。`/systemManage/getRoleHome` / `/systemManage/updateRoleHome` 由 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW6 屬 **W-WEBUI 軌道受管例外**（Constitution IV v1.2.0，列舉含 `W-FW1`–`W-FW7`）。base-web 改 ≤ 2 檔：`menu-auth-modal.vue`（接 home 端點、替換既有 stub function、無新 UI render）+ `system-manage.ts`（加 2 service function、無新型別）；不動 typings/router/store/i18n/版面/role-operate-drawer.vue/button-auth-modal.vue。R-Q1 確認 service function 用 primitive 型別 generic `request<string \| null>` / `request<boolean>`、不需新增 `Api.SystemManage.*` 型別宣告（§4 不准動 typings）。 | ✅ PASS（行使 v1.2.0 W-WEBUI 受管例外、≤ 2 檔變動皆在准動範圍） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態）；rust-only。DB schema 變更 = `sys_role` 加 1 欄（home_route_name VARCHAR nullable）、additive、現有 row 全 null 不受影響、含對稱 down migration。Casbin policy schema 0 變更（只 INSERT seed row + UPDATE 既有 row）。W-FW3 過渡的 transform-layer code-lock 拿掉 —— 屬「漸進收縮」精神：過渡限制由 native 安全機制取代。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。

> **註 — Constitution v1.2.0 行使**：本 feature 為 v1.2.0「W-WEBUI 軌道受管例外」第三次行使（首次 = 035 W-FW5、二次 = 036 W-FW7）。`W-FW1`–`W-FW7` 列舉含本 feature；本 feature 不需新增 amendment（base-web 改 ≤ 2 檔、無新增 UI render、屬「最小 UI / 服務層接通」准動範圍）。Phase 1 設計未引入新 violation，post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/037-role-authorization-completion/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出
├── research.md          # Phase 0 —— R-Q1 / R-Q2 / R-Q3 resolved
├── data-model.md        # Phase 1 —— schema + entity + DTO + service + handler 改動
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
├── migration/src/schemas/m<timestamp>_a_wfw6_add_home_to_sys_role.rs   # A1: schema migration（home_route_name + down）
├── migration/src/datas/m<timestamp>_b_wfw6_role_home_alias_seed.rs     # A2: Casbin policy seed (6 row)
├── migration/src/lib.rs                                                # A1+A2: register 兩新 migration
├── server/model/src/admin/entities/sys_role.rs                         # A3: entity 加 home_route_name: Option<String>
├── server/model/src/admin/input/sys_role.rs                            # B1: 加 UpdateRoleHomeInput DTO
├── server/service/src/admin/sys_role_service.rs                        # B2+B3: 加 get_role_home / update_role_home + update_role detect code 變動 + Casbin sync + notify_casbin_changed
├── server/service/src/admin/sys_authorization_service.rs               # B4+B5: assign_routes / assign_users 補 audit + trait signature 加 actor 參數
├── server/api/src/admin/sys_system_manage_api.rs                       # C1+C2+C4: 加 get_role_home / update_role_home 兩 handler + update_role_for_systemmanage 拿掉 code-lock + assign_role_menus_for_systemmanage 傳 actor
├── server/api/src/admin/sys_authorization_api.rs                       # C3+C5: assign_routes / assign_users handler 傳 actor
├── server/api/src/admin/router.rs (或對等註冊處)                       # D1: 註冊 /systemManage/getRoleHome /:roleId + /systemManage/updateRoleHome
└── server/service/src/admin/mod.rs (或對等 re-export)                  # B1: pub use UpdateRoleHomeInput

base-web/  (worktree, branch rev1-admin-base-web)
├── src/service/api/system-manage.ts                                    # E1: 加 fetchGetRoleHome + fetchUpdateRoleHome
└── src/views/manage/role/modules/menu-auth-modal.vue                   # E2: getHome / updateHome 接真 API
```

**Structure Decision**: 雙 worktree（rust-api + base-web）；rust-api ~14 元件、base-web 2 檔。N2/N3/N4 三子項彼此無檔案重疊（N2 主要動 sys_role_service + sys_system_manage_api + entity / N3 主要動 sys_authorization_service + 兩 api 檔 cascade / N4 主要動 sys_role_service + sys_system_manage_api 一處 lock 拿掉），可平行實作後合 build。多段式 commit（base-web 第一段 + rust-api 第二段 → outer 第三段 SHA pin）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
