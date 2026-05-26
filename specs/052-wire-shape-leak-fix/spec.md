# Feature Specification: 052 wire-shape-leak-fix

**Feature Branch**: `052-wire-shape-leak-fix`
**Created**: 2026-05-26
**Status**: Draft
**Input**: User description: "039-R1 結案：4 endpoint raw entity Model wire shape leak (接 040 W-FW9 D 體例) — sys_organization GET /org + sys_endpoint /endpoint/page 加 OrganizationDetail / EndpointDetail wire DTO；systemManage addRole / updateRole handler return 改 SystemManageRoleOutput（既成複用）；對齊 040 體例（id=display_id i64、不含敏感欄位、不含 deleted_at、Sea-ORM Model 不動）"

**前置文件**：
- [`docs/superpowers/052-feature-wire-shape-leak-fix.md`](../../docs/superpowers/052-feature-wire-shape-leak-fix.md)（brainstorm 設計、Q1-Q3 拍板、9 sections / 183 line、commit `81af8d9`）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.6.0：本 sprint 軌道**外** spec-impl-fix、5/5 Principle PASS、0 amendment
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) 衍生 follow-up 行 **039-R1** ⚠️ Critical（post-merge code review、2026-05-25 登記）
- [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md)（本 sprint 軌道外、無 §4 entry 需求）
- 040 `wire-id-consistency`（merge `34dc03d`、W-FW9）已立 D-pattern：`RoleDetail` / `UserDetail` / `AccessKeyDetail` sibling DTO @ `output/sys_*.rs`

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Developer / Auditor 看 4 endpoint wire shape 完全對齊 040 D-pattern、internal SoT 不外洩（Priority: P1）🎯 MVP

維護 rev1 整合的 rust developer / API consumer / compliance auditor 在 fix 落地後應確認：

- **4 endpoint wire shape 一致**：(a) GET `/org` / (d) GET `/endpoint/page` 走 `PaginatedData<*Detail>` 形（id 為 i64 number、無 ULID `id` 重複欄、無 `deletedAt`）；(b) POST `/systemManage/addRole` / (c) POST `/systemManage/updateRole` 走 `SystemManageRoleOutput`（id 為 i64、shape 與 `get_role_for_systemmanage` 等已對齊的 systemManage handler 一致）。
- **internal SoT 完全保留**：Sea-ORM Model（`SysOrganizationModel` / `SysEndpointModel` / `SysRoleModel`）0 改動；audit_log payload + JWT claim + Casbin policy + FK schema 全保持以 ULID 為 internal SoT；本 fix 只影響 wire serialize path。
- **0 base-web 改動**：4 endpoint base-web 端 0 binds response shape（`fetchAddRole` / `fetchUpdateRole` 無 generic、`/org` + `/endpoint/page` 0 hit）；wire shape 收斂自然不影響 base-web behavior。
- **040 D-pattern 體例完整補齊**：sys_organization + sys_endpoint 加入 sibling Detail DTO 行列（與 040 既加的 `RoleDetail` / `UserDetail` / `AccessKeyDetail` 一致）；addRole/updateRole 走 systemManage namespace 既成 Output DTO（minimum diff aligned with precedent）。

**Why this priority**：post-merge code review 揭示這是當前 wire 表面唯一仍 leak raw entity Model 的 4 處；039-R1 標 ⚠️ Critical；fix 消除 `id: ULID-string` + `displayId: i64` 重複欄 + `deletedAt` internal forensics 欄外洩風險、強化「rust internal SoT 表示 ≠ wire shape」紀律（039 X1 雙欄設計核心）。MVP-worthy 因為 fix 本身為單一 logical unit、verifiable evidence 直接（acceptance C-V2~C-V5 curl + jq 即可驗）。

**Independent Test**：(a) curl Soybean → GET `/org` → response `data.records[0].id` typeof number、無 `id: ULID-string` 重複欄、無 `deletedAt`；(b) curl → POST `/systemManage/addRole` → response `data.id` typeof number + shape 比對 `SystemManageRoleOutput`；(c) curl → POST `/systemManage/updateRole` → 同 (b) shape；(d) curl → GET `/endpoint/page` → 同 (a)；(e) base-web role-list 頁面 CDP smoke：新增 + 編輯 modal regression PASS（reassurance、防 040 critical bug 重演）。

**Acceptance Scenarios**：

1. **Given** Soybean token；**When** curl `GET /org?current=1&size=10`；**Then** response 200、`data.records[]` 每 row `id` 為 i64 number（非 ULID string）、無 `id` ULID 重複欄、無 `deletedAt` 欄；`pid` / `code` / `name` / `description` / `status` / `created_at` / `created_by` / `updated_at` / `updated_by` 對齊 `OrganizationDetail` 規格。
2. **Given** Soybean token；**When** curl `POST /systemManage/addRole` 送 `{roleName:"CV3_R1", roleCode:"R_CV3_R1", roleDesc:"052 test", status:"1"}`；**Then** response 200、`data.id` 為 i64 number、`data` shape 為 `SystemManageRoleOutput`（含 roleName / roleCode / roleDesc / status / created_at / created_by / updated_at / updated_by）、無 raw `SysRoleModel` 欄位（如 `pid` / `description` / `homeRouteName` 等 internal naming）。
3. **Given** Soybean token + 既有 test role；**When** curl `POST /systemManage/updateRole` 改 roleName；**Then** response 200、`data` shape 同 #2、`data.id` 對應原 role display_id（不是 ULID）。
4. **Given** Soybean token；**When** curl `GET /endpoint/page?current=1&size=10`；**Then** response 200、`data.records[]` 每 row `id` 為 i64 number、無 `id` ULID 重複欄、無 `deletedAt`；`path` / `method` / `action` / `resource` / `controller` / `summary` / `created_at` / `updated_at` 對齊 `EndpointDetail`。
5. **Given** base-web role 管理頁 + Soybean 登入；**When** CDP smoke 跑「新增角色」→「編輯角色」→「確認」流程；**Then** list refresh 含新 row、編輯 toast「修改成功」、無 console error、shape 改動 0 base-web 退化。
6. **Given** fix 落地後；**When** grep `Res<SysRoleModel>` / `PaginatedData<SysOrganizationModel>` / `PaginatedData<SysEndpointModel>` 全 rust-api source；**Then** 0 hit（raw Model wire path 已全收斂）。

---

### Edge Cases

- **paginated empty result**：`GET /org` 在 `total=0` 時 `data.records=[]`、shape 仍 `PaginatedData<OrganizationDetail>` 不是 raw Model；驗 `data.total` 為 0、`data.records.length === 0`。
- **soft-deleted row 不入 pagination**：底層 service `find_active()` 已過濾 `deleted_at IS NULL`、本 fix 不變；驗 manually soft-delete 一 org 後 list 不含該 row、且既存 audit 機制（internal SoT）仍有完整紀錄（不上 wire）。
- **`SystemManageRoleOutput` 既成 `From<sys_role::Model>` impl 行為**：041/050 體例下未變、本 fix 只 reuse 不擴；addRole 後 `data.id` 為 `model.display_id`（i64）、與 `get_role_for_systemmanage` 等對齊 handler 一致。
- **`Status` enum serialize**：`OrganizationDetail.status` 沿用 `sea_orm_active_enums::Status`、JSON serialize 與既有 systemManage handler 一致（per spec 030 status enum 紀律）；不引入 status 轉換。
- **base-web typings 0 改動**：4 endpoint response shape 改變、但 base-web 0 binds response（grep 過）、TS compile 不受影響；驗 base-web docker rebuild PASS、無 type error。
- **CDP smoke setup 失敗（pre-existing infra issue）**：登 follow-up C-V6-N1、acceptance 走 C-V2~C-V5 + C-V7 結案、不本 sprint 修 infra。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`rust-api/server/api/src/admin/sys_organization_api.rs::get_paginated_organizations` handler MUST 改 return type 從 `Res<PaginatedData<SysOrganizationModel>>` 為 `Res<PaginatedData<OrganizationDetail>>`、handler body 加 `.map(|p| p.map(OrganizationDetail::from))` 對 paginated rows 套 transform；底層 service `find_paginated_organizations` 0 改動。
- **FR-002**：`rust-api/server/api/src/admin/sys_system_manage_api.rs::add_role_for_systemmanage` handler MUST 改 return type 從 `Res<SysRoleModel>` 為 `Res<SystemManageRoleOutput>`、handler body 加 `.map(SystemManageRoleOutput::from)` 對 single role result 套 transform；底層 service `create_role` 0 改動。
- **FR-003**：`rust-api/server/api/src/admin/sys_system_manage_api.rs::update_role_for_systemmanage` handler MUST 同 FR-002 pattern：return type 改 `Res<SystemManageRoleOutput>`、handler body 加 `.map(SystemManageRoleOutput::from)`；底層 service `update_role` 0 改動。
- **FR-004**：`rust-api/server/api/src/admin/sys_endpoint_api.rs::get_paginated_endpoints` handler MUST 改 return type 從 `Res<PaginatedData<SysEndpointModel>>` 為 `Res<PaginatedData<EndpointDetail>>`、handler body 加 `.map(|p| p.map(EndpointDetail::from))`；底層 service `find_paginated_endpoints` 0 改動。
- **FR-005**：新增 `rust-api/server/model/src/admin/output/sys_organization.rs`（**新檔**）含：
  - `pub struct OrganizationDetail` 含 10 欄位：`id: i64`（← `m.display_id`）、`code: String`、`name: String`、`description: Option<String>`、`pid: String`、`status: Status`、`created_at: NaiveDateTime`、`created_by: String`、`updated_at: Option<NaiveDateTime>`、`updated_by: Option<String>`
  - `impl From<sys_organization::Model> for OrganizationDetail` 完整映射 10 欄位（id ← display_id）
  - `#[serde(rename_all = "camelCase")]` derive、對齊 wire JS 慣例
  - **故意不含**：`sys_organization::Model::id`（ULID string、保留 internal SoT 不上 wire）、`deleted_at`（soft-delete forensics 屬 internal、不上 wire）
- **FR-006**：新增 `rust-api/server/model/src/admin/output/sys_endpoint.rs`（**新檔**）含：
  - `pub struct EndpointDetail` 含 9 欄位：`id: i64`（← `m.display_id`）、`path: String`、`method: String`、`action: String`、`resource: String`、`controller: String`、`summary: Option<String>`、`created_at: NaiveDateTime`、`updated_at: Option<NaiveDateTime>`
  - `impl From<sys_endpoint::Model> for EndpointDetail` 完整映射 9 欄位（id ← display_id）
  - `#[serde(rename_all = "camelCase")]` derive
  - **故意不含**：`sys_endpoint::Model::id`（ULID）、`deleted_at`
- **FR-007**：`rust-api/server/model/src/admin/output/mod.rs` MUST 加 2 mod 暴露行：`pub mod sys_endpoint;` + `pub mod sys_organization;`；`rust-api/server/service/src/admin/mod.rs` MUST 加 2 re-export 行對齊 040 體例：`pub use server_model::admin::output::sys_organization::OrganizationDetail;` + `pub use server_model::admin::output::sys_endpoint::EndpointDetail;`（讓 server-api crate import 簡潔）。
- **FR-008**：本 sprint MUST 0 Constitution amendment（純 wire shape 收斂、未引入新原則）；0 新 schema migration（沿用既有 `sys_organization` / `sys_endpoint` / `sys_role` schema）；0 新 entity（Sea-ORM Model 不動）；0 新 workspace cargo dep；0 base-web 改動（軌道外、4 endpoint base-web 0 binds response）；0 nestjs 殘留；0 新 endpoint（4 個 endpoint route 不動、只動 handler return）；0 新 redis channel；0 audit_log path 改動；0 Casbin policy 改動；0 input DTO 改動（input 已 i64 / 039 T030.5 已完）。
- **FR-009**：本 sprint MUST 為**軌道外** feature（無 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 軌道相關 file）；plan.md Constitution Check 段 4-選一軌道辨識為「軌道外」、無 DESIGN doc 條目 add 需求。
- **FR-010**：本 sprint 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST：(a) 衍生 follow-up table 移除 `039-R1` ⚠️ Critical row、加 footnote「039-R1 結案 via 052」；(b) 已完成里程碑加 052 entry（SHA placeholder 留 SHA backfill）；(c) Current Focus「現狀」加 052 + 「下一步」更新（剩條件觸發 / 長期、無 Critical dedicated sprint 待排）；(d) CLAUDE.md SPECKIT marker 052 active during sprint、idle on completion。

### Key Entities

本 feature 為 wire shape 對齊 fix、**無 application data entity 改動**（0 schema migration、0 新 entity、0 新 column）。新加 2 wire DTO 為 output transform、非 application data entity：

- **`OrganizationDetail`**（新 wire output DTO @ `output/sys_organization.rs`）— `sys_organization::Model` 的 wire-shape transform、不含 ULID `id` + `deleted_at`；handler `.map(OrganizationDetail::from)` wrap 使用。
- **`EndpointDetail`**（新 wire output DTO @ `output/sys_endpoint.rs`）— `sys_endpoint::Model` 的 wire-shape transform、同上紀律。
- **`SystemManageRoleOutput`**（既成 wire output DTO @ `output/sys_system_manage.rs`、已 i64、`From<sys_role::Model>` 既備）— addRole / updateRole handler 改 reuse、0 改動。

涉及既有 application entity（read but not modified）：
- **`sys_organization`** — 為 `OrganizationDetail.from` 來源；schema 不變。
- **`sys_endpoint`** — 為 `EndpointDetail.from` 來源；schema 不變。
- **`sys_role`** — 為 `SystemManageRoleOutput.from` 來源；schema 不變。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、13 service 全 healthy state；rust-api 啟動 + drainer 跑著（接 051 baseline、不退化）。
- **SC-002**：(a) GET `/org` wire shape — curl Soybean 帶 `current=1&size=10` → response 200、`data.records[]` 每 row `id` 為 i64 number（typeof === "number"、不是 ULID string）、無 `id` ULID 重複欄、無 `deletedAt` 欄；單 round-trip < 500ms。
- **SC-003**：(b) POST `/systemManage/addRole` wire shape — curl Soybean 建測試 role → response 200、`data.id` 為 i64 number、`data` 完整 shape == `SystemManageRoleOutput`（含 roleName/roleCode/roleDesc/status/created_at/created_by/updated_at/updated_by + id 共 9 欄位）；無 `SysRoleModel` raw 欄（如 `pid`、`description`、`home_route_name` 等 internal name）。
- **SC-004**：(c) POST `/systemManage/updateRole` wire shape — curl Soybean 改測試 role → response 200、`data` shape 同 SC-003。
- **SC-005**：(d) GET `/endpoint/page` wire shape — curl Soybean → response 200、`data.records[]` 每 row `id` 為 i64 number、無 ULID `id`、無 `deletedAt`、9 欄位對齊 `EndpointDetail`。
- **SC-006**：base-web role-list regression — CDP smoke 走「登入 Soybean → 開角色管理頁 → 新增角色 modal 提交 + 確認 list 含新 row → 編輯 modal 開 + 改名 + 提交 → toast 『修改成功』」全綠、無 console error。
- **SC-007**：boundary verify — grep `Res<SysRoleModel>` / `Res<PaginatedData<SysOrganizationModel>>` / `Res<PaginatedData<SysEndpointModel>>` rust-api handler 0 hit + rust-api `migration/` 0 diff + 0 base-web 改動 + 0 Constitution amendment + 0 Cargo.toml diff + 0 audit_log 改動。
- **SC-008**：INTEGRATION-CHECKLIST 更新 — `039-R1` row 從 active table 移為 footnote「039-R1 結案 via 052」+ 052 milestone entry 加入已完成里程碑 + Current Focus 「現狀」+「下一步」反映 post-052 狀態 + CLAUDE.md SPECKIT marker idle。
- **SC-009**：Constitution Check post-fix — 5/5 PASS（Principle I/II/III/IV/V 皆無 violation；軌道外、wire 收斂、internal SoT 保留）；`Complexity Tracking` 空白；0 Constitution amendment。
  > **驗證性質**：結構性 design-time gate、由 plan.md `Constitution Check` 段斷言；無 runtime task；對齊 051 / 050 / 049 / 046 spec-hygiene-pass 既有體例。

## Assumptions

- **dev stack 健康** — 13 service healthy（per 051 baseline、SOP hook verified）+ rust-api drainer 跑著（接 051 commit `6d64190` + outer `677ac72` merge 後狀態）。
- **rust-api worktree baseline** — `rev1-admin-rust-api` 分支 HEAD = `6d64190`（051 落地後狀態）；Phase 1 驗 `cd rust-api && git rev-parse rev1-admin-rust-api` 為此 SHA、未退化。
- **0 Constitution amendment 需要** — 軌道外、純 wire 收斂、internal SoT 保留、無新原則。對齊 brainstorm doc Section 2.2 預期。
- **`SystemManageRoleOutput` 既成 + `From<sys_role::Model>` impl 0 改動** — 既有定義在 `output/sys_system_manage.rs`、本 sprint reuse 不擴；驗 grep 確認 impl 存在。
- **`PaginatedData::map` helper 既備** — `server_core::web::page::PaginatedData` 既有 `.map(F)` helper（040 D5 用過）、把 `Vec<T>` → `Vec<U>` 不動 `total`；本 sprint reuse 不擴。
- **base-web 0 binds 4 endpoint response shape** — brainstorm 階段 grep 確認：`fetchAddRole` / `fetchUpdateRole` 無 response generic、`/org` + `/endpoint/page` 在 base-web 0 hit；wire shape 改變不觸發 base-web TS compile error / runtime regression。
- **CDP smoke 體例可用** — 037 / 038 / 040 / 048 / 049 CDP smoke 既有體例（per memory `reference_cdp_smoke_technique.md`）；node global WebSocket 驅動 Edge :9229；登入鈕「确认」、role 表格顯示 roleName / roleCode。
- **無新 unit test 需要** — wire shape 收斂屬 wiring/shape feature、無新純函式邏輯、acceptance C-V2~C-V5 curl + jq 即定性驗證；對齊 051 / 050 / 049 / 046 既有 acceptance-only via C-V 體例。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。
- **`OrganizationDetail.pid` 維持 String** — 對齊 sys_organization tree 結構（parent ULID）、暫不轉 i64（org tree base-web 端未跑型對齊 sprint）；後續若整合 org tree 軌道時再處理（屬 long-term、不本 sprint）。
- **CDP smoke setup 可能 defer** — 若 pre-existing infra issue（如 :9229 binding / Edge crash）、登 follow-up C-V6-N1、acceptance 走 C-V2~C-V5 + C-V7 結案；對齊 040 D 體例（CDP smoke defer 後 follow-up 補測）。
