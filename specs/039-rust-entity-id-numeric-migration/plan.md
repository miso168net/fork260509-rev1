# Implementation Plan: rust-entity-id-numeric-migration

**Branch**: `039-rust-entity-id-numeric-migration` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/039-rust-entity-id-numeric-migration/spec.md`

## Summary

把 rust-api 5 個業務 entity（`sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key`）加一個 `display_id` BIGINT UNIQUE NOT NULL 副欄（Snowflake i64 生成）；API output 把 `id` 序列化為 display_id 數值（base-web typings number 對齊）、API input 收 number 反查 display_id 拿 ULID PK；rust 內部業務邏輯（service / audit / JWT / Casbin / FK cascade）**全部繼續以 ULID 為 SoT**。

**設計選擇**：X1 雙欄（ULID PK 保留 + display_id 副欄）—— 比 layer B「drop ULID PK 改 BIGINT」conservative，避免 JWT/audit/Casbin/FK 全 cascade，保留 ULID 特性（distributed + time-ordered）；比 X2「API hash transform」可靠，避免 collision + lookup cache 複雜度。

**Snowflake 為 ULID 的 numeric 親戚**（41bit timestamp + 10bit machine_id + 12bit seq = 64bit）、time-ordered + distributed + < 2^53 JS safe integer。machine_id 從 container hostname hash mod 1024 自動取得、無 manual config、跟 W-F11 多 replica 預備對齊。

base-web 改動 = **0 diff**、nestjs = 0、0 schema migration 對 `sys_menu` / `sys_domain` / log/token / `casbin_rule` / `sys_user_role` / `sys_role_menu`；rust-api ~10 input DTO + ~6 output struct + ~6 handler Path + 5 entity service create path + 1 Snowflake helper + 2 migration（schema + backfill）。比照 W-FW7 規模（中等 rust-only feature）。

## Technical Context

**Language/Version**: Rust（axum + Sea-ORM + Casbin、rust-api worktree）；base-web TypeScript / Vue 3（**0 改動**、保留 starter typings 樣貌）

**Primary Dependencies**:
- 既有 `sys_user_service.rs` / `sys_role_service.rs` / `sys_endpoint_service.rs` / `sys_organization_service.rs` / `sys_access_key_service.rs`（create / list / lookup 路徑、本 feature 加 display_id 寫入 + 反查）
- 既有 `audit_log::write_in_txn`（F2.1）+ `Actor::from(&user)`（W-FW6 N3）+ `notify_casbin_changed`（W-F11）——**全部不動**
- 新 Snowflake i64 generator helper（plan Phase 0 R-Q1 拍板 crate vs self-roll）
- 既有 sea-orm migration framework（schema + backfill）

**Storage**: PostgreSQL —— 5 entity 各加 `display_id BIGINT UNIQUE NOT NULL` 欄 + INDEX；其他 11+ table（`sys_menu` / `sys_domain` / `sys_login_log` / `sys_operation_log` / `sys_tokens` / `casbin_rule` / `sys_user_role` / `sys_role_menu` 等）schema **0 改動**

**Testing**: acceptance-only + 1 Snowflake unit test —— wiring / schema migration / API transform 類 feature 由 acceptance matrix（curl + psql + CDP browser smoke）覆蓋；Snowflake generator 本身加 1 個 unit test（1000-id 唯一性 + time-ordered + clock 倒退處理），純函式邏輯，比照 W-FW1~W-FW8 慣例（既有 native helper 不重測）

**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis）

**Project Type**: web —— rust-api backend only（base-web frontend 0 改動）

**Performance Goals**: 
- Snowflake `next_display_id()` 生成 < 1ms（每次至少 1ms 等待保證 time-ordered + 12bit seq = 4096/ms 上限）
- display_id lookup 透過 UNIQUE INDEX、O(log n)、< 5ms（5 entity 合計 < 100 row dev 級）
- 整體 endpoint 不顯著退化（既有 W-FW8 acceptance latency 對照）

**Constraints**:
- W-WEBUI 軌道**外** feature、base-web 0 diff、Principle IV 預設原則（不動用受管例外）
- 多段式 commit（CLAUDE.md §4.1）—— 但 base-web 0 改、單段（rust-api worktree + outer SHA pin）
- 向後相容（FR-012/013/014/015 — rust internal SoT 仍 ULID、既有 W-FW1~W-FW8 acceptance 不退化）
- Snowflake i64 必須 < 2^53 JS safe integer（標準 Snowflake 結構保證）
- Constitution v1.4.0 預設原則（無 amendment 需求、5/5 PASS 預判）

**Scale/Scope**: rust-api ~25 改動
- A1 Snowflake i64 generator helper（`server/global/src/snowflake.rs`，~50-100 行 + 1 unit test）
- A2 5 entity sea-orm entity struct 加 `pub display_id: i64`
- A3 5 entity schema migration（ADD COLUMN display_id BIGINT + INDEX）
- A4 5 entity backfill migration（UPDATE 既有 row 填 Snowflake i64）
- A5 5 entity service create path 加 `display_id: Set(snowflake::next_display_id())`
- A6 input DTO 改型（`role_id: String → i64` / `user_ids: Vec<String> → Vec<i64>` / `endpoint_ids: Vec<String> → Vec<i64>` ~10 處）
- A7 handler Path 改型（`Path<String> → Path<i64>` ~6 處 systemManage transform + raw role/user endpoint）
- A8 handler 加 `lookup_ulid_by_display_id(i64) -> String` ~6 處（5 entity service 各 1 處 + Lookup helper 可抽 trait）
- A9 5 entity output struct `From<Model>` impl 改 `id: model.display_id`（6 處：UserOutput x2 + RoleOutput x2 + EndpointOutput x1 + Organization/AccessKey）
- A10 base-web 0 改動

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。對照 `.specify/memory/constitution.md` v1.4.0。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | Casbin policy 邏輯不動、enforce path 不動、Casbin policy 主寫權威仍 rust；本 feature 0 RBAC 改動。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | audit_log payload / write_in_txn / entity_id ULID 保留歷史一致性；soft_delete 邏輯不變；本 feature 0 audit 改動。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP/RPC；nginx config 0 改動；endpoint ownership 不變。 | ✅ PASS |
| **IV. base 不改動邊界** | **base-web 0 diff、完全符合預設原則**；不動用 W-WEBUI 受管例外、不觸發 constitution amendment；nestjs 0 改動。 | ✅ PASS（預設原則） |
| **V. 漸進收縮** | 0 nestjs 改動（DESIGN-B 形態）；rust-only；schema 純加欄不破壞、可對稱回退；5 entity 範圍清楚、非全 entity bloat。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。

> **註**：本 feature 為 Constitution Principle IV「預設原則」（軌道外 base-web 0 diff）的回歸實踐——把 W-WEBUI 軌道後遺留的 typings/runtime mismatch 在 rust 端解決、不動 base-web。Phase 1 設計未引入新 violation；post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/039-rust-entity-id-numeric-migration/
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
├── server/global/src/snowflake.rs (新)                                       # A1: Snowflake i64 generator + unit test
├── server/global/src/lib.rs                                                  # A1: pub mod snowflake;
├── server/global/Cargo.toml                                                  # A1: 加 dep（or 自寫 no-dep）
├── server/model/src/admin/entities/sys_user.rs                               # A2: 加 pub display_id: i64
├── server/model/src/admin/entities/sys_role.rs                               # A2
├── server/model/src/admin/entities/sys_endpoint.rs                           # A2
├── server/model/src/admin/entities/sys_organization.rs                       # A2
├── server/model/src/admin/entities/sys_access_key.rs                         # A2
├── migration/src/schemas/m20260524_d_add_display_id_to_business_entities.rs (新)  # A3: 5 entity ADD COLUMN display_id BIGINT + INDEX
├── migration/src/datas/m20260524_e_backfill_display_id.rs (新)               # A4: UPDATE 既有 row + ALTER ADD UNIQUE
├── migration/src/lib.rs                                                      # A3/A4: register 新 migration
├── migration/src/schemas/mod.rs                                              # A3: pub mod
├── migration/src/datas/mod.rs                                                # A4: pub mod
├── server/service/src/admin/sys_user_service.rs                              # A5: create_user 加 display_id: Set(...)
├── server/service/src/admin/sys_role_service.rs                              # A5: create_role 加 display_id: Set(...)
├── server/service/src/admin/sys_endpoint_service.rs                          # A5: sync_endpoints / batch_create 加 display_id 邏輯
├── server/service/src/admin/sys_organization_service.rs                      # A5: create 加 display_id
├── server/service/src/admin/sys_access_key_service.rs                        # A5: create_access_key 加 display_id
├── server/model/src/admin/input/sys_authorization.rs                         # A6: AssignPermissionDto/AssignRouteDto/AssignUserDto/SystemManageAssignRoleEndpointsInput role_id / user_ids / endpoint_ids / permissions 改 i64 / Vec<i64>
├── server/model/src/admin/input/sys_role.rs                                  # A6: UpdateRoleHomeInput.role_id 改 i64
├── server/model/src/admin/input/sys_user.rs                                  # A6: 各 User input DTO 含 id 字段 cascade
├── server/model/src/admin/input/sys_endpoint.rs                              # A6: 各 Endpoint input cascade
├── server/api/src/admin/sys_system_manage_api.rs                             # A7+A8: Path<String> → Path<i64> + lookup helper
├── server/api/src/admin/sys_authentication_api.rs                            # A7+A8: assign_permission / assign_routes / assign_users handler cascade
├── server/api/src/admin/sys_role_api.rs                                      # A7+A8: raw role endpoint Path / lookup
├── server/api/src/admin/sys_user_api.rs                                      # A7+A8: raw user endpoint cascade
├── server/api/src/admin/sys_endpoint_api.rs                                  # A7+A8: endpoint 相關 path / 0 改動於 role_code 路徑（不在 5 entity 範圍）
├── server/api/src/admin/sys_access_key_api.rs                                # A7+A8: access key 相關 path
├── server/model/src/admin/output/sys_user.rs                                 # A9: UserOutput.id 改 i64（2 處）
├── server/model/src/admin/output/sys_endpoint.rs                             # A9: EndpointTree.id 改 i64
└── server/model/src/admin/output/sys_system_manage.rs                        # A9: SystemManageUserOutput.id / SystemManageRoleOutput.id / SystemManageAllRoleOutput.id 改 i64（3-5 處）

base-web/  (worktree, branch rev1-admin-base-web)
└── 0 改動（本 feature 對 base-web 0 diff）
```

**Structure Decision**: 單 worktree（rust-api）；rust-api ~25 元件 + 2 migration；base-web 0 改動。雙欄設計避免 JWT/audit/Casbin/FK 全 cascade，rust 內部業務邏輯 0 變動。多段式 commit：rust-api worktree 第一段 + outer 第二段 SHA pin（base-web 無第三段、無 fork push）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
