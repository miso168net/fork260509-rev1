# Implementation Plan: W-FW8 — button-auth-completion

**Branch**: `038-button-auth-completion` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/038-button-auth-completion/spec.md`

## Summary

W-WEBUI follow-up 軌道收尾 feature，整併 W-FW4 / W-FW6 過渡留下的最後 2 個 follow-up：

- **A button-auth modal 接通**（主、US1 P1 MVP）：3 個 `/systemManage/` alias 端點（`getAllEndpoints` tree by resource / `getRoleEndpointIds/:roleId` 反查 Casbin policy 對應 endpoint.id 集合 / `assignRoleEndpoints` transform call 既有 `assign_permission`）+ Casbin policy seed 6 row（ROLE_SUPER + ROLE_ADMIN × 3 alias）；base-web `button-auth-modal.vue` 拿掉硬編 10 mock buttons + getAllButtons/getChecks console.log stub，接通真 API。
- **B assign_permission audit 補寫**（順手、US2 P2）：`sys_authorization_service.assign_permission` trait + impl 末尾 append `actor: &Actor`、txn `commit()` 前加 `audit_log::write_in_txn`（payload camelCase `{roleId, domain, endpointIds:[...]}`、entity_type='sys_role'、operation=UPDATE）；cascade 至 ~2 callsite handler。比照 W-FW6 N3 體例。

**Backend model 選擇**：複用 `sys_endpoint`（67 endpoint、12 controller、13 resource、含中文 `summary`）+ 既有 `assign_permission`（已寫 Casbin policy）。Path A 採用、Path B（新 junction）+ Path C（推遲）否決於 brainstorm Q2。**0 新 table、0 schema migration**。

base-web 改動 ≤ 2 檔（`button-auth-modal.vue` + `system-manage.ts`、§4 准動清單）、rust-api ~12 處（3 service handler + 1 service method 改造 + 4 router + 4 transform + audit cascade）、1 data migration（Casbin seed）、0 nestjs。比照 W-FW6/W-FW7 接線模式 + W-F11 既有 Casbin redis pub-sub 機制（reload trigger 既有、本 feature 不引入新）。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM + Casbin、rust-api worktree）；base-web TypeScript / Vue 3（button-auth-modal NTree 接線 + 3 個 service function、§4 准動清單）

**Primary Dependencies**: 既有 `sys_endpoint_service`（讀全部 active endpoint）、既有 `sys_authorization_service.assign_permission`（Casbin policy diff + add/remove + notify_casbin_changed）、既有 `audit_log::write_in_txn` helper（F2.1）、既有 Casbin enforcer + W-F11 redis pub-sub reload 機制、既有 `Actor::from(&user)` helper、既有 systemManage transform handler 體例（W-FW3/W-FW4/W-FW6）

**Storage**: PostgreSQL —— `sys_endpoint`（既有 7 欄、本 feature **0 改動**僅讀 67 row）、`casbin_rule`（既有 schema 不變、本 feature 透過既有 service add/remove policy row）、`sys_operation_log`（既有 F2.1 schema、B 新增 audit row 對應 `assign_permission`）

**Testing**: acceptance-only —— curl + psql + CDP browser smoke；wiring + transform layer + audit gap fill + Casbin 同步類 feature，無新純函式（資料寫入由 Sea-ORM derive、Casbin SQL 由既有 `sync_role_permissions` helper covered、audit_log helper 已 covered by F2.1），正確性由 acceptance 矩陣覆蓋（curl envelope + psql casbin_rule diff + psql sys_operation_log audit row + Casbin reload log + CDP modal 互動），比照 W-FW1~W-FW7 慣例

**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis）

**Project Type**: web —— rust-api backend + base-web frontend（≤ 2 檔改動）

**Performance Goals**: N/A（admin 管理操作低頻；67 endpoint 量級 modal tree render 為小數據量；Casbin add/remove 已 covered by 既有 service；W-F11 reload 機制 5 秒內跨 replica consistency 由 redis pub-sub 既有 SLA 保障）

**Constraints**: 
- W-WEBUI §4 base-web 修改邊界（本 feature ≤ 2 檔、不動 typings/router/store/i18n/版面）
- 多段式 commit（CLAUDE.md §4.1）
- 向後相容（FR-009 / E-1 — 既有 role 0 endpoint 授權正常開 modal、既有 W-FW6 N3 audit 不退化）
- Constitution v1.3.0 amendment 已落地（Principle IV 列舉擴 W-FW8）

**Scale/Scope**: rust-api ~12 元件
- A1 Casbin policy seed migration（6 row、純 data、無 schema）
- A2 transform input DTO `SystemManageAssignRoleEndpointsInput`（在 input/sys_authorization.rs 或 input/sys_role.rs）
- A3 sys_system_manage_api.rs 加 3 transform handler（getAllEndpoints + getRoleEndpointIds + assignRoleEndpoints）
- A4 sys_system_manage_route.rs 加 3 條 RouteInfo + Router::route 註冊
- B1 sys_authorization_service.rs `assign_permission` trait 末尾 append `actor: &Actor` + impl 改 + 補 audit_log::write_in_txn（txn commit 前）
- B2 sys_authentication_api.rs `assign_permission` handler cascade（加 Extension<User> + Actor::from + 傳 &actor）
- C1 sys_endpoint_service.rs 補（若需）`find_all_active` 或對等 fn（R-Q2 plan Phase 0 verify）
- C2 Casbin policy reverse-map helper（sys_endpoint.path + method ↔ id 對應，可在 sys_system_manage_api.rs transform handler 內 inline 或抽 helper）

+ base-web 2 檔
- E1 system-manage.ts 加 3 service function（fetchGetAllEndpoints / fetchGetRoleEndpointIds / fetchAssignRoleEndpoints）
- E2 button-auth-modal.vue：拿掉硬編 mock + 接 3 endpoint + setLoading + onMounted Promise.all + 確認送出 + error toast + 成功 toast

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。對照 `.specify/memory/constitution.md` v1.3.0（amendment 已落地、列舉擴 `W-FW1`–`W-FW8`）。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | 3 新 systemManage alias 端點受 Casbin 保護（A1 seed 6 row）、與既有 systemManage alias endpoint 一致。`assign_permission` 既有 Casbin server-side enforcement 為單一決策權威；本 feature **真實寫 Casbin policy** —— admin 改完權限後該 role user 對 endpoint 訪問結果由後端 Casbin 決定（非僅 UI hide）。Casbin policy 主寫權威仍為 rust，無新寫入點。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | B 補完 sys_authorization_service.rs 三個 `assign_*` 中最後一個（assign_permission），補完 W-FW6 N3 留下的最後 audit gap → grep `audit_log::write_in_txn` in sys_authorization_service.rs 後落地應為 3 次（assign_routes + assign_users + assign_permission）。audit 寫入與 Casbin policy 變更同 txn（atomicity）。Casbin policy UPDATE 為 side effect、屬「跨資源 side effect」範疇、Principle II 不要求 audit（同 W-F11 / W-FW6 N4 既有設計）。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP/RPC。Casbin policy 同步透過既有 enforcer API；跨 replica reload 透過 W-F11 既有 redis pub-sub channel（`casbin:policy:invalidate`、既有 `notify_casbin_changed()` 函式於 `assign_permission` commit 後呼叫）—— 共用基礎設施，非 service 間 HTTP。3 alias 端點由 rust 單一 owner enforce。 | ✅ PASS |
| **IV. base 不改動邊界** | W-FW8 屬 **W-WEBUI 軌道受管例外**（Constitution v1.3.0、列舉 `W-FW1`–`W-FW8`，amendment 已於 plan 階段前完成）。base-web 改 ≤ 2 檔：`button-auth-modal.vue`（拿掉硬編 mock 接 3 endpoint、替換既有 stub function、無新 UI render 結構）+ `system-manage.ts`（加 3 service function、無新型別）；不動 typings/router/store/i18n/版面/role-operate-drawer.vue/menu-auth-modal.vue。v-permission directive 推遲、不在本 feature 範圍。R-Q1 已確認 service function 用 primitive generic、不需新增 `Api.SystemManage.*` 型別宣告（§4 不准動 typings）。 | ✅ PASS（行使 v1.3.0 W-WEBUI 受管例外、≤ 2 檔變動皆在准動範圍） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態）；rust-only。**0 schema migration / 0 新 table**；DB 變更僅 Casbin policy 6 row data seed（A1）、可對稱回退、不影響既有 row。「複用 sys_endpoint」符合「漸進收縮」精神 —— 既有 RBAC 能力（API endpoint 權限）直接套上 UI，避免新增 RBAC 子系統的維護負擔（否決 Path B 新 junction 表）。W-FW6 過渡留下的 `assign_permission` audit gap 由本 feature 補完，W-WEBUI follow-up 軌道收尾。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。

> **註 — Constitution v1.3.0 行使**：本 feature 觸發 v1.3.0 amendment（v1.2.0 列舉 W-FW1–W-FW7 → v1.3.0 列舉 W-FW1–W-FW8、純列舉延伸、性質與 v1.2.0 W-FW1–W-FW4→W-FW1–W-FW7 同類型範圍擴充、其餘條款不變）。amendment 已在本 plan 階段 Constitution Check 前完成（per FR-017 pre-gate 要求）。`docs/INTEGRATION-DESIGN-W-WEBUI.md` §7.2 W-FW4-N1 button-auth path 即為本 feature 來源、不需文件 amendment。Phase 1 設計未引入新 violation，post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/038-button-auth-completion/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出
├── research.md          # Phase 0 —— R-Q1 / R-Q2 / R-Q3 resolved
├── data-model.md        # Phase 1 —— 元件清單 + 改動細節
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
├── migration/src/datas/m<timestamp>_wfw8_endpoint_alias_seed.rs            # A1: Casbin policy seed (6 row)
├── migration/src/lib.rs                                                    # A1: register 新 migration
├── server/model/src/admin/input/sys_authorization.rs (或 sys_role.rs)      # A2: SystemManageAssignRoleEndpointsInput DTO
├── server/service/src/admin/sys_authorization_service.rs                   # B1: assign_permission trait + impl 末尾 append actor: &Actor + audit_log::write_in_txn
├── server/api/src/admin/sys_system_manage_api.rs                           # A3: 3 新 transform handler (getAllEndpoints + getRoleEndpointIds + assignRoleEndpoints)
├── server/api/src/admin/sys_authentication_api.rs                          # B2: assign_permission handler cascade (Extension<User> + Actor::from + 傳 &actor)
├── server/router/src/admin/sys_system_manage_route.rs                      # A4: 3 RouteInfo + Router::route 註冊
├── server/service/src/admin/sys_endpoint_service.rs (若需擴 find_all_active)  # C1: 視 Phase 0 R-Q2 結果（既有不夠則加）
└── server/service/src/admin/mod.rs (或對等 re-export)                      # A2: pub use SystemManageAssignRoleEndpointsInput

base-web/  (worktree, branch rev1-admin-base-web)
├── src/service/api/system-manage.ts                                        # E1: 加 3 service function (primitive generic)
└── src/views/manage/role/modules/button-auth-modal.vue                     # E2: 拿掉硬編 mock + 接 3 endpoint + Promise.all + setLoading + toast
```

**Structure Decision**: 雙 worktree（rust-api + base-web）；rust-api ~12 元件 + 1 data migration、base-web 2 檔。A（modal 接通）與 B（audit gap）彼此 ~80% 不重疊但同 PR 配套（A 觸碰 sys_system_manage_api / sys_system_manage_route / sys_authorization_service / sys_authentication_api，B 觸碰 sys_authorization_service / sys_authentication_api，重疊在 sys_authorization_service.rs assign_permission 與 sys_authentication_api.rs handler——B trait signature 改動會被 A 端的 transform handler cascade 看到、應一次 commit 完整）。多段式 commit（base-web 第一段 + rust-api 第二段 → outer 第三段 SHA pin）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
