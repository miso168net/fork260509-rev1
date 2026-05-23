---

description: "Task list for 039 rust-entity-id-numeric-migration implementation"
---

# Tasks: 039 — rust-entity-id-numeric-migration

**Input**: Design documents from `/specs/039-rust-entity-id-numeric-migration/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 1 unit test（A1 Snowflake helper 的 `test_unique_and_time_ordered`）+ acceptance-only（curl + psql + CDP browser smoke）—— schema migration / API transform / service wiring 類 feature 無新純函式邏輯（除 Snowflake generator 本身），正確性由 acceptance matrix（C-V1~C-V31）覆蓋。比照 W-FW1~W-FW8 慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 P1 MVP = rust 端適應 base-web typings；US2 P2 = rust internal SoT 保留、純 acceptance、無實作 task）。Foundational 階段 = A1 Snowflake i64 generator helper（所有後續 task 依賴此 helper）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2）
- 路徑相對 worktree root（`rust-api/`）；本 feature base-web **0 改動**

---

## Phase 1: Setup

- [ ] T001 確認環境：outer 在 `039-rust-entity-id-numeric-migration` feature branch、rust-api worktree 在 `rev1-admin-rust-api`、base-web worktree 在 `rev1-admin-base-web`、Constitution v1.4.0 amendment 已落地（grep Principle IV 軌道權威為 INTEGRATION-DESIGN-W-WEBUI 文件、版本 1.4.0、Last Amended 2026-05-23）、dev stack `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` healthy（quickstart.md）

---

## Phase 2: Foundational

**所有 US1 task 共同前置** —— A1 Snowflake i64 generator helper：

- US1 A2-A4 schema/backfill migration 需呼叫 `snowflake::next_display_id()` 生成既有 row 的 display_id
- US1 A5 5 entity service create path 需呼叫同一 helper 生成新 row display_id
- US1 acceptance C-V1 需跑 Snowflake helper unit test

故 T002 必須在 US1 開始前完成。

- [ ] T002 rust-api 新檔 `server/global/src/snowflake.rs` —— Snowflake i64 generator helper（self-roll ~50-80 行 + 1 unit test `test_unique_and_time_ordered`）：41bit timestamp from EPOCH_2020_MS + 10bit machine_id from `HOSTNAME` env hash mod 1024 + 12bit seq；clock 倒退 wait-for-next-ms；`AtomicU64 LAST_STATE` + CAS retry；unit test 跑 1000 連續 id 全唯一 + time-ordered + < 2^53 JS safe integer。register in `server/global/src/lib.rs`（加 `pub mod snowflake;`）。data-model.md A1 含完整 skeleton implementation。**0 新 cargo dep**（self-roll、不引入外部 crate；若 implementer 偏好 well-tested crate 可改 `idgenerator = "0.4"` 等價、皆可）。

**Checkpoint**: Foundational 完成、US1 可開始。

---

## Phase 3: User Story 1 — rust 端適應 base-web typings (P1) 🎯 MVP

**Goal**: 5 業務 entity（user / role / endpoint / organization / access_key）schema 加 `display_id BIGINT UNIQUE NOT NULL` 副欄、Snowflake i64 生成；既有 row 全 backfill；service create path 新 row 自動填 display_id；API output `id` 序列化為 display_id 數值給 base-web（typings number 對齊）、API input 收 number 反查 display_id 取 ULID PK；既有業務邏輯維持以 ULID 為 SoT 工作。

**Independent test**: curl `GET /api/systemManage/getUserList`（Soybean token）→ `records[].id` 為 JSON number、非 ULID string；curl `POST /api/systemManage/assignRoleEndpoints` body `{roleId: <number-from-getRoleList>, endpointIds: [<number-from-getAllEndpoints>]}` → envelope 0、Casbin 寫入正確；psql 查 sys_user / sys_role / sys_endpoint / sys_organization / sys_access_key 全 row `display_id` 唯一且 != 0；CDP browser smoke `/manage/role` 開 button-auth modal 勾 + 確認 → 「修改成功」 toast。

### Phase 3a: Schema + Backfill（依 T002）

- [ ] T003 [US1] rust-api 新 schema migration `migration/src/schemas/m20260524_d_add_display_id_to_business_entities.rs` —— 對 5 entity（`sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key`）各加 `display_id BIGINT NOT NULL DEFAULT 0` 欄 + `idx_<table>_display_id` 非 UNIQUE INDEX；對稱 down 跑 DROP INDEX + DROP COLUMN 全 5 entity；沿用既有 schema migration 體例（W-FW6 `m20260524_a_wfw6_add_home_to_sys_role.rs`）。register in `migration/src/lib.rs` 末端、緊接 W-FW8 `m20260524_c` + `migration/src/schemas/mod.rs` `pub mod m20260524_d_...`（data-model.md A3）

- [ ] T004 [US1] rust-api 新 data migration `migration/src/datas/m20260524_e_backfill_display_id.rs` —— 對 5 entity 既有 row SELECT id → loop UPDATE display_id = `snowflake::next_display_id()`；之後 ALTER TABLE DROP DEFAULT + ADD CONSTRAINT uq_<table>_display_id UNIQUE；對稱 down 跑 DROP CONSTRAINT；沿用既有 data migration 體例。register in `migration/src/lib.rs` 末端、緊接 T003 + `migration/src/datas/mod.rs` `pub mod m20260524_e_...`（data-model.md A4）

### Phase 3b: Sea-ORM Entity + Service Create Path（[P] 各檔互不相關）

- [ ] T005 [P] [US1] rust-api `server/model/src/admin/entities/sys_user.rs` 加 `pub display_id: i64` 欄（緊接 `pub id: String` 之後）（data-model.md A2）

- [ ] T006 [P] [US1] rust-api `server/model/src/admin/entities/sys_role.rs` 加 `pub display_id: i64`（data-model.md A2）

- [ ] T007 [P] [US1] rust-api `server/model/src/admin/entities/sys_endpoint.rs` 加 `pub display_id: i64`（data-model.md A2）

- [ ] T008 [P] [US1] rust-api `server/model/src/admin/entities/sys_organization.rs` 加 `pub display_id: i64`（data-model.md A2）

- [ ] T009 [P] [US1] rust-api `server/model/src/admin/entities/sys_access_key.rs` 加 `pub display_id: i64`（data-model.md A2）

- [ ] T010 [US1] rust-api `server/service/src/admin/sys_user_service.rs` `create_user` (line ~163-165) ActiveModel 加 `display_id: Set(snowflake::next_display_id())` + import `use server_global::snowflake;`（依 T005；data-model.md A5.1）

- [ ] T011 [US1] rust-api `server/service/src/admin/sys_role_service.rs` `create_role` (line ~134-136) 加同（依 T006；data-model.md A5.2）

- [ ] T012 [US1] rust-api `server/service/src/admin/sys_access_key_service.rs` `create_access_key` (line ~137-138) 加同（依 T009；data-model.md A5.3）

- [ ] T013 [US1] rust-api `server/service/src/admin/sys_organization_service.rs` 若有 create_organization 加同；若無（grep 0 命中）則此 task 跳過、organization 既有 row 由 T004 backfill 涵蓋（依 T008；data-model.md A5.4）

- [ ] T014 [US1] rust-api `server/initialize/src/router_initialization.rs` `process_collected_routes` (line ~388) 構造 `SysEndpoint` 時加 `display_id: snowflake::next_display_id()`（startup 階段為新 endpoint 生成；既有 endpoint row 由 T004 backfill 涵蓋）（依 T007；data-model.md A5.5）

### Phase 3c: Output Struct + From Impl（[P] 各 struct 改型互不相關）

- [ ] T015 [P] [US1] rust-api `server/model/src/admin/output/sys_user.rs` —— `UserOutput.id: String → i64`（line 12）+ `UserWithoutPassword.id: String → i64`（line 25）+ 對應 `From<Model>` impl 內 `id: model.display_id`（從 `id: model.id` 改）（data-model.md C1.1）

- [ ] T016 [P] [US1] rust-api `server/model/src/admin/output/sys_system_manage.rs` —— `SystemManageRoleOutput.id`（line 21）+ `SystemManageAllRoleOutput.id`（line 52）+ `SystemManageUserOutput.id`（line 71）全 `String → i64` + 對應 From impl `id: model.display_id`（data-model.md C1.2）

- [ ] T017 [P] [US1] rust-api `server/model/src/admin/output/sys_endpoint.rs` —— `EndpointTree.id: String → i64`（line 6）+ 對應 From impl `id: model.display_id`；`EndpointTreeNode`（W-FW8 加）的 `key` 字段保留 String、leaf 構造改 `key: format!("{}", ep.display_id)`（從 `key: ep.id.clone()` 改）（data-model.md C1.3 + C1.4）

### Phase 3d: Input DTO + Validate macro（依 T005-T009 entity, [P] 各 input file 互不相關）

- [ ] T018 [P] [US1] rust-api `server/model/src/admin/input/sys_authorization.rs` —— 4 個 DTO 改型：
  - `AssignPermissionDto.role_id: String → i64` + `permissions: Vec<String> → Vec<i64>`（line 11, 14）
  - `AssignRouteDto.role_id: String → i64`（line 24）；`route_ids: Vec<i32>` 不動（menu.id 本就 i32）
  - `AssignUserDto.role_id: String → i64` + `user_ids: Vec<String> → Vec<i64>`（line 34, 37）
  - `SystemManageAssignRoleEndpointsInput.role_id: String → i64` + `endpoint_ids: Vec<String> → Vec<i64>`（line 47, 49）
  - `Validate` macro `length(min=1)` 改 `range(min=1)` 或拿掉（i64 不適用 length）
  （data-model.md C2.1）

- [ ] T019 [P] [US1] rust-api `server/model/src/admin/input/sys_role.rs` —— `UpdateRoleHomeInput.role_id: String → i64`（W-FW6 N2、line ~88-99）；`Validate` macro 同改（data-model.md C2.2）

### Phase 3e: Service Trait + Lookup Helper（[P] 各 service 互不相關）

- [ ] T020 [P] [US1] rust-api `server/service/src/admin/sys_user_service.rs` `TUserService` trait + impl 加 `async fn lookup_ulid_by_display_id(&self, display_id: i64) -> Result<String, AppError>`：query `sys_user::find_active().filter(sys_user::Column::DisplayId.eq(display_id)).one(db)` → not found 時 reject UserNotFound 4xxx（data-model.md C3.1）

- [ ] T021 [P] [US1] rust-api `server/service/src/admin/sys_role_service.rs` 同上 pattern、`lookup_ulid_by_display_id` → not found 時 reject RoleNotFound 4001（沿用既有 error code、data-model.md C3.1）

- [ ] T022 [P] [US1] rust-api `server/service/src/admin/sys_endpoint_service.rs` 同上 pattern、`lookup_ulid_by_display_id` → not found 時 reject EndpointNotFound（data-model.md C3.1）

- [ ] T023 [P] [US1] rust-api `server/service/src/admin/sys_organization_service.rs` + `sys_access_key_service.rs` 同上 pattern（data-model.md C3.1）

### Phase 3f: API Handler Path + Lookup Cascade（依 T018/T019 input + T020-T023 lookup）

- [ ] T024 [US1] rust-api `server/api/src/admin/sys_system_manage_api.rs` 3 處 handler 改 `Path<String> → Path<i64>` + 加 lookup：
  - line ~333 `get_role_menu_ids_for_systemmanage` (role_id)
  - line ~361 `get_role_home_for_systemmanage` (role_id, W-FW6)
  - line ~436 `get_role_endpoint_ids_for_systemmanage` (role_id, W-FW8)
  pattern: `Path(display_id): Path<i64>` + `let role_id = role_svc.lookup_ulid_by_display_id(display_id).await?;` + 業務 service call 用 role_id ULID（data-model.md C3.2）

- [ ] T025 [US1] rust-api `server/api/src/admin/sys_authentication_api.rs` `assign_permission` / `assign_routes` / `assign_users` handler 加 input DTO i64 lookup cascade：
  - `let role_id_ulid = role_svc.lookup_ulid_by_display_id(input.role_id).await?;`
  - `let endpoint_ids_ulid = ... lookup batch ...` (assign_permission)
  - `let user_ids_ulid = ... lookup batch ...` (assign_users)
  - 業務 service call 全用 ULID 集合（data-model.md C3.3）

- [ ] T026 [US1] rust-api `server/api/src/admin/sys_system_manage_api.rs` `assign_role_endpoints_for_systemmanage` (W-FW8 加、line ~480) 加同 cascade：role_id lookup + endpoint_ids batch lookup + 用 ULID 集合 call service.assign_permission；Extension 加 `Extension(role_svc): Extension<Arc<SysRoleService>>` + `Extension(endpoint_svc): Extension<Arc<SysEndpointService>>`（data-model.md C3.3）

- [ ] T027 [US1] rust-api `server/api/src/admin/sys_system_manage_api.rs` `update_role_home_for_systemmanage` handler（W-FW6 line ~365）input.role_id 改 i64 + lookup ULID + service call 用 ULID（data-model.md C3.3）

- [ ] T028 [US1] rust-api `server/api/src/admin/sys_role_api.rs` 2 處 raw handler 改 Path<i64> + lookup：
  - line ~38 `get_role_by_id`
  - line ~54 `delete_role_by_id`
  pattern: `Path(display_id): Path<i64>` + `let role_id = role_svc.lookup_ulid_by_display_id(display_id).await?;`（data-model.md C3.2）

- [ ] T029 [US1] rust-api `server/api/src/admin/sys_user_api.rs` 2 處 raw handler 改 Path<i64> + lookup：
  - line ~82 `get_user_by_id`
  - line ~98 `delete_user_by_id`
  同 T028 pattern（data-model.md C3.2）

- [ ] T030 [US1] rust-api `server/api/src/admin/sys_access_key_api.rs` `Path(id): Path<String>` (line ~39) 改 `Path<i64>` + access key lookup（data-model.md C3.2）

### Phase 3g: Build + US1 Acceptance（依 T003-T030）

- [ ] T031 [US1] build rust-api image + dev stack 重啟：`DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api` + `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`；含 migration 自動套用（schema + backfill）；base-web image **不需 rebuild**（0 改動）。依 T003-T030；quickstart.md

- [ ] T032 [US1] US1 acceptance（contracts/verification-commands.md C-V1~C-V18 + C-V29~C-V31）：
  - C-V1 cargo test snowflake 1000-id 唯一 + time-ordered + < 2^53
  - C-V2 schema migration 5 entity 全加 display_id + INDEX
  - C-V3 backfill 5 entity 全 row 唯一、!= 0
  - C-V4 range 檢查（< 2^53、合理 epoch）
  - C-V5 down 對稱（臨時 DB）
  - C-V6 / C-V7 / C-V8 output wire id 為 JSON number（5 entity）
  - C-V9 / C-V10 / C-V11 / C-V12 / C-V13 input DTO i64 寫入正確
  - C-V14 / C-V15 / C-V16 Path<i64> raw entity endpoint
  - C-V17 lookup not-found → 4001
  - C-V18 wrong-type input → 4xx serde deser error
  - C-V29 CDP smoke `/manage/role` 開 button-auth modal + 勾 + 確認 + toast（W-FW8 不退化）
  - C-V30 CDP smoke `/manage/user` `/manage/menu` `/manage/role` 既有 manage CRUD 不退化
  - C-V31 W-FW5 changePassword + W-FW6 N2 updateRoleHome + W-FW7 menu field 不退化
  依 T031；contracts/verification-commands.md

**Checkpoint**: US1 可獨立交付 —— 5 entity 端到端 number id wire 對齊 + base-web 0 改動 + base-web typings 100% 對齊 wire 型 + rust internal 業務邏輯 0 退化。

---

## Phase 4: User Story 2 — rust internal 業務邏輯零變動 (P2)

**Goal**: 確認 rust internal SoT（audit_log / JWT / Casbin / FK cascade）100% 不退化、ULID 完全保留為 internal SoT。

**Independent test**: psql 查 sys_operation_log 內 W-FW1~W-FW8 落地的 audit row payload_before/after JSON 內 `roleId/userId/endpointIds` 仍為 ULID 字串；JWT decode sub claim 仍為 ULID（如 `'1'` for seed Soybean）；Casbin g rule v0 仍為 user_id ULID 字串；sys_user_role / sys_role_menu / sys_tokens FK 表結構 0 改動。

**Note**: 本 phase **無實作 task** —— 純 acceptance 驗證（rust internal SoT 不變是 US1 設計選擇 X1 雙欄的本質保證）。若 US1 acceptance 過了、US2 應該自動 pass。

- [ ] T033 [US2] US2 acceptance（contracts/verification-commands.md C-V19~C-V22 + C-V28）：
  - C-V19 audit_log payload + entity_id 仍 ULID（執行 C-V9 後 psql 查 sys_operation_log）
  - C-V20 JWT sub claim 仍 ULID（用 Soybean 登入、decode token、訪問 getUserInfo 仍 work）
  - C-V21 Casbin g rule v0 仍 ULID user_id（psql 查 casbin_rule WHERE ptype='g'）+ RBAC enforce 對 3 類 token 一致（Soybean / Administrator / GeneralUser）
  - C-V22 FK schema 0 改動（psql `\d sys_user_role` 等仍 VARCHAR）
  - C-V28 grep `Ulid::new()` in rust-api/server/ 命中數 = brainstorm 前 + 0（5 entity service create path 都加 display_id 沒拿掉 ULID 生成）
  依 T032；contracts/verification-commands.md

**Checkpoint**: US2 可獨立驗證 —— rust internal SoT 100% 保留、X1 雙欄設計核心安全網生效。

---

## Phase 5: Polish & 收尾

- [ ] T034 全 C-V 矩陣 C-V1~C-V31 跑完一輪（含 scope C-V23 既有 endpoint 不退化 / C-V24 base-web 0 diff / C-V25 nestjs 0 / C-V26 不該動 schema 0 改動 / C-V27 5 entity 全有 display_id） —— `contracts/verification-commands.md`

- [ ] T035 兩段式 commit + push（base-web 0 改動、無 fork push、簡化為 2 段）：
  - **第一段** rust-api worktree commit + push fork（`rev1-admin-rust-api`）
  - **第二段** outer `git add rust-api` 更新 SHA pin + commit on `039-rust-entity-id-numeric-migration` feature branch、push origin
  CLAUDE.md §4.1

- [ ] T036 INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker 更新：
  - `docs/INTEGRATION-CHECKLIST.md`「已完成里程碑」加 039 entry（依日期升冪插入正確位置、含 outer SHA + merge SHA 待回填 + rust-api SHA + 0 base-web SHA + spec 路徑 + scope summary）
  - `docs/INTEGRATION-CHECKLIST.md`「Current Focus」更新 W-WEBUI follow-up 軌道後續、新增 039 完成、下一步推薦 observability
  - `CLAUDE.md` SPECKIT marker：Active Spec / Active Plan 改 「無」、Phase 改 「無」、下一步推薦 observability W-F12/13/14（簡潔 4 行格式、不擴張內容）

- [ ] T037 invoke `superpowers:finishing-a-development-branch` —— merge 039 feature branch 回 `rev1-admin-root`（CLAUDE.md §3 step 標準收尾）+ 刪 feature branch + 回填 outer/merge SHA commit（同 W-FW6/7/8 體例：rust-api fork push → outer feature branch push → outer git switch rev1-admin-root → git merge --no-ff → 刪 feature branch local + remote → 回填 SHA + push rev1-admin-root）

---

## Dependencies

```text
T001 (Setup) → T002 (Foundational: Snowflake helper)
                  │
                  ▼
              Phase 3 US1（P1 MVP、rust 端適應 base-web）
              ├── Phase 3a Schema/Backfill
              │     T003 (schema migration)
              │     T004 (backfill migration, 依 T003)
              ├── Phase 3b Entity + Service create [P 5 個 + 串 5 個]
              │     T005-T009 [P] (5 entity Model field)
              │     T010 (依 T005)
              │     T011 (依 T006)
              │     T012 (依 T009)
              │     T013 (依 T008)
              │     T014 (依 T007)
              ├── Phase 3c Output struct [P 3 個]
              │     T015-T017 [P]
              ├── Phase 3d Input DTO [P 2 個]
              │     T018-T019 [P]
              ├── Phase 3e Service lookup helper [P 4 個]
              │     T020-T023 [P]
              ├── Phase 3f Handler Path + lookup cascade [7 個串行 / 跨檔交叉]
              │     T024 (sys_system_manage 3 處、依 T018/T019 + T021/T022)
              │     T025 (sys_authentication 3 處、依 T018 + T020-T022)
              │     T026 (W-FW8 assign_role_endpoints、依 T018 + T021/T022)
              │     T027 (updateRoleHome、依 T019 + T021)
              │     T028 (raw role 2 處、依 T021)
              │     T029 (raw user 2 處、依 T020)
              │     T030 (access key 1 處、依 T023)
              └── Phase 3g Build + Acceptance
                    T031 (build + dev stack 重啟、依 T003-T030)
                    T032 (US1 acceptance C-V1~C-V18 + C-V29-31、依 T031)
                  │
                  ▼
              Phase 4 US2（P2、純 acceptance）
                    T033 (US2 acceptance C-V19~C-V22 + C-V28、依 T032)
                  │
                  ▼
              Phase 5 Polish & 收尾
                    T034 (全 C-V matrix 一輪)
                    T035 (兩段式 commit + push、依 T034)
                    T036 (checklist + marker 更新、依 T035)
                    T037 (finishing-a-development-branch、依 T036)
```

**Story 獨立性**: US1 P1 MVP 為主要實作；US2 P2 為純 acceptance、依 US1 落地後驗證 rust internal SoT 不退化。**檔案重疊**：US1 跨 ~30+ 檔（5 entity Model + 5 service create + 5 service lookup + 3 output struct + 2 input DTO + ~7 handler + 2 migration）；US2 0 額外實作（純驗證）。

## Parallel Execution

- **Phase 2 Foundational**：T002 單 task、無 [P]
- **Phase 3 US1 內**：
  - **Phase 3b T005-T009 [P]**（5 entity Model field 加欄、各檔互不相關、可一起 patch）
  - **Phase 3c T015-T017 [P]**（3 個 output struct 改型、各檔互不相關）
  - **Phase 3d T018-T019 [P]**（2 個 input DTO 檔、互不相關）
  - **Phase 3e T020-T023 [P]**（4 個 service lookup helper、各檔互不相關）
  - **跨 phase 3b/3c/3d/3e 平行**：T005-T009、T015-T017、T018-T019、T020-T023 都可同時 dispatch 給多 implementer subagent（總計 14 個 [P] task、各檔不衝突）
  - **Phase 3a T003-T004 序列**（T004 依 T003 schema 存在）
  - **Phase 3b 串列段 T010-T014**：T010 (依 T005) / T011 (依 T006) / T012 (依 T009) / T013 (依 T008) / T014 (依 T007) —— 各對應 entity 的 Model 加欄完成後才能 cascade，但**跨 entity 的 T010 vs T011 vs T012 vs T013 vs T014 互不相關、可平行**（5 個 service create patch）
  - **Phase 3f T024-T030 串行優先（同 handler 結構）+ T024-T030 跨檔可平行**（5 個 *_api.rs 檔互不相關、視 implementer 是否 batch 處理）
  - **T031 build / T032 acceptance 序列**

- **跨 US1 / US2**：T033 (US2 acceptance) 依 T032 完成；本 feature US2 0 實作 task、跑完 US1 + acceptance 後 US2 acceptance 即可

## Implementation Strategy

- **MVP = US1**（Phase 1 + 2 + 3）：5 entity 端到端 number id wire 對齊即達 MVP（可獨立驗收）。
- **增量交付**: US1 → US2 依優先序；每 story phase 完成即為可獨立驗收增量。
- **build 批次**: tasks 列了 per-phase build（T031 build for US1）—— 執行時若 US1 + US2 都跑、可 batch 合一（T031 已涵蓋 US2 因 US2 0 額外實作）
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。建議執行單元：
  - ① Foundational（T002）—— 1 subagent 寫 Snowflake helper + unit test
  - ② US1 Phase 3a Schema/Backfill（T003 + T004）—— 1 subagent
  - ③ US1 Phase 3b Entity + Service create（T005-T014）—— 1 subagent batch、5 entity Model + 5 service create
  - ④ US1 Phase 3c-3e Output + Input + Lookup（T015-T023）—— 1 subagent batch、14 個 [P] task 一次 patch
  - ⑤ US1 Phase 3f Handler Path + cascade（T024-T030）—— 1 subagent batch、~7 個 handler 改 Path/lookup
  - ⑥ 一次 build（T031）—— controller 自行
  - ⑦ acceptance + 收尾（T032 + T033 + T034 + T035 + T036 + T037）—— controller + finishing-a-development-branch
- **base-web 改動 = 0**：本 feature 對 base-web 0 diff、預設原則完全符合、無 W-WEBUI 受管例外動用。
- **比照 W-FW7 規模**（中等 rust-only feature）：rust-api ~25 改動 + 2 migration、base-web 0、nestjs 0。
