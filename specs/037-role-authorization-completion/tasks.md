# Tasks: W-FW6 — role-authorization-completion

**Input**: Design documents from `/specs/037-role-authorization-completion/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 無單元測試 task —— wiring / schema 擴充 / audit gap fill / Casbin 同步類 feature（資料寫入/讀出由 Sea-ORM derive、Casbin SQL 為 UPDATE 一條、audit_log helper 已 covered by F2.1 unit test、native 程式碼無新純函式邏輯），正確性由 acceptance（curl + psql + CDP browser smoke）覆蓋。比照 W-FW1~W-FW7 慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 N2 role home / US2 N3 audit / US3 N4 role code rename）。Foundational 階段含 schema migration + Casbin seed migration + entity（3 個 US 共用前置）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2 / US3）
- 路徑相對 worktree root（`rust-api/` 或 `base-web/`）

---

## Phase 1: Setup

- [ ] T001 確認 worktree 分支正確（`rust-api` 在 `rev1-admin-rust-api`、`base-web` 在 `rev1-admin-base-web`、outer 在 `037-role-authorization-completion`）、dev stack 可 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起（quickstart.md）

---

## Phase 2: Foundational

**跨 story 共用前置** —— Schema migration（N2-A1）+ Casbin seed migration（N2-A2）+ Sea-ORM entity（N2-A3）為 US1 前置：

- US1 的 home 讀寫端點需要 DB 欄位存在 + entity 載入 + Casbin policy seed allow 對應 role
- US2 / US3 不直接依賴 N2 schema、可平行起步（但 build 與 acceptance 可合）

故 T002 + T003 + T004 應在 US1 開始前完成；US2 / US3 可平行於 N2 設計鏈。

- [ ] T002 rust-api 新 schema migration `migration/src/schemas/m20260524_a_wfw6_add_home_to_sys_role.rs`：`sys_role` 加 `home_route_name VARCHAR NULL`（用 `execute_unprepared` `ALTER TABLE` 體例，沿用 `m20260523_c_wfw7_add_menu_fields_to_sys_menu.rs`），含對稱 down migration（`DROP COLUMN IF EXISTS`）；register in `migration/src/lib.rs` Vec 末端、晚於 W-FW7 `m20260523_c`（data-model.md N2-A1、research.md R-Q3）

- [ ] T003 rust-api 新 data migration `migration/src/datas/m20260524_b_wfw6_role_home_alias_seed.rs`：Casbin policy seed 4 row（ROLE_SUPER + ROLE_ADMIN × 2 endpoint `getRoleHome/:roleId` GET + `updateRoleHome` POST），沿用 `m20260522_d_wfw3_role_alias_seed.rs` 體例（`Statement::from_string` + raw SQL INSERT）；register `migration/src/lib.rs` 緊接 T002 之後（data-model.md N2-A2）

- [ ] T004 rust-api `sys_role` Sea-ORM entity（`server/model/src/admin/entities/sys_role.rs`）加 1 欄：在 `pub status: Status,` 之後、`pub created_at: DateTime,` 之前**插入** `#[sea_orm(column_type = "Text", nullable)] pub home_route_name: Option<String>,`（依 T002 結構；data-model.md N2-A3）

**Checkpoint**: Foundational 完成、user story 可平行開始（US1 必依此；US2/US3 不依、可平行起步）。

---

## Phase 3: User Story 1 — N2 role home 持久化 (P1) 🎯 MVP

**Goal**: base-web menu-auth-modal 的「角色首頁」段接通真 API，admin 可在抽屜設定/讀回每 role 的 home_route_name；validation reject 不存在 / soft-deleted / constant menu。

**Independent test**: 在 `/manage/role` 開某 role 菜單授權抽屜 → 改首頁送出 → 重開預填一致 → psql 該 role.home_route_name 持久化；curl getRoleHome / updateRoleHome 完整 round-trip + validation reject 4 種類別。

- [ ] T005 [US1] rust-api input DTO（`server/model/src/admin/input/sys_role.rs`）加 `UpdateRoleHomeInput { role_id: String, home: Option<String> }`，`#[derive(Debug, Deserialize, Validate)]` + `#[serde(rename_all = "camelCase")]` + role_id `#[validate(length(min = 1))]`；同時 `server/service/src/admin/mod.rs` 加 `pub use sys_role::UpdateRoleHomeInput` re-export（data-model.md N2-B1）

- [ ] T006 [US1] rust-api `sys_role_service.rs` 加新 trait method + impl：`get_role_home(role_id) -> Result<Option<String>, AppError>` + `update_role_home(input: UpdateRoleHomeInput, actor: &Actor) -> Result<(), AppError>`；trait 同步加；update_role_home body 包含 fetch before + validation reject（home 非空時查 sys_menu find_active + status=Enabled + constant=false）+ ActiveModel update + audit_log::write_in_txn（payload_before/after = audit_snapshot(&before/&updated)）+ txn commit（data-model.md N2-B2）

- [ ] T007 [US1] rust-api `sys_role_error.rs` 加 `RoleError::HomeRouteNotFound` variant + `AppError::from` mapping（含對應 code 與 message、沿用既有 RoleError pattern；用於 T006 validation reject）（data-model.md N2-B2 Error type 新增）

- [ ] T008 [US1] rust-api `sys_system_manage_api.rs` 加 2 handler：
  ① `get_role_home_for_systemmanage(Path(role_id), Extension(service))` → `Res<Option<String>>`，body：`service.get_role_home(role_id).await.map(Res::new_data)`
  ② `update_role_home_for_systemmanage(Extension(service), Extension(user), Json(input))` → `Res<bool>`，body：`Actor::from(&user)` + `service.update_role_home(input, &actor).await.map(|_| Res::new_data(true))`
  同時 import `UpdateRoleHomeInput`（依 T005 + T006；data-model.md N2-C1）

- [ ] T009 [US1] rust-api router 註冊 2 條 route：在 systemManage route 註冊處（查 `server/api/src/admin/mod.rs` 或 `router.rs` 找既有 W-FW3/W-FW4 alias 註冊體例）加：`.route("/getRoleHome/:roleId", get(SysSystemManageApi::get_role_home_for_systemmanage))` + `.route("/updateRoleHome", post(SysSystemManageApi::update_role_home_for_systemmanage))`（依 T008；data-model.md N2-D1）

- [ ] T010 [US1] base-web `src/service/api/system-manage.ts` 加 2 service function：`fetchGetRoleHome(roleId: string)` → `request<string | null>({ url: \`/systemManage/getRoleHome/${roleId}\`, method: 'get' })` + `fetchUpdateRoleHome(data: { roleId: string; home: string | null })` → `request<boolean>({ url: '/systemManage/updateRoleHome', method: 'post', data })`（research.md R-Q1 確認 primitive generic、不動 `src/typings`；data-model.md N2-E1）

- [ ] T011 [US1] base-web `src/views/manage/role/modules/menu-auth-modal.vue` 修改 getHome / updateHome：
  ① import `fetchGetRoleHome` / `fetchUpdateRoleHome` 進來
  ② `getHome` 改 call `fetchGetRoleHome(String(props.roleId))`、`home.value = data ?? 'home'`（null fallback 預設值 'home'）
  ③ `updateHome(val)` 改 call `fetchUpdateRoleHome({ roleId: String(props.roleId), home: val === 'home' ? null : val })`（預設值 'home' 對應 null）；`if (!error) home.value = val`
  **注意**：'home' fallback 邏輯若 implementation 時驗證 'home' 是合法 active route_name、則直接寫入 'home' 不轉 null（細節 implementation 階段決定）（依 T010；data-model.md N2-E2）

- [ ] T012 [US1] rust-api + base-web build（`DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api` + `DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web ./base-web` + `up -d --wait`）；含 migration 自動套用（依 T002–T011；quickstart.md）

- [ ] T013 [US1] US1 acceptance：psql `\d sys_role` 確認 home_route_name 欄存在 + Casbin seed 4 row（C-V1 部分）；curl getRoleHome 對既有 role 回 null（C-V3）/ 對設定後 role 回真值（C-V5）；curl updateRoleHome 設定 home（C-V4）/ 送空 / null（C-V6）/ reject 不存在 route_name（C-V7）/ reject constant menu（C-V8）/ reject soft-deleted menu（C-V9）；psql sys_operation_log 含 1 row audit（C-V10）；curl getRoleHome / updateRoleHome 用 GeneralUser token reject（C-V11）；CDP `/manage/role` 開菜單授權抽屜 → home 下拉 render + 預填 + 改 home 送出 + 重開預填一致（C-V23）（依 T012）

**Checkpoint**: US1 可獨立交付 —— role home 持久化 + admin CRUD round-trip 端到端通。

---

## Phase 4: User Story 2 — N3 assign_routes/users audit gap (P2)

**Goal**: sys_authorization_service.rs assign_routes + assign_users 補 audit_log::write_in_txn 單 event whole-snapshot；assign_permission 不動（留 W-FW8）。

**Independent test**: curl assignRoleMenus / assignUsersToRole（W-FW4 + F8 既有 path）後 psql sys_operation_log 新增 1 row、payload_before/after 含集合差異；txn rollback 時 audit 不寫入。

**Note**: 與 US1 / US3 無檔案重疊（US2 動 sys_authorization_service.rs + sys_authorization_api.rs + sys_system_manage_api.rs assign_role_menus handler；US1 動 sys_role_service.rs + entity；US3 動 sys_role_service.rs + sys_system_manage_api.rs update_role handler）；可平行起步但 build 可合（T012 + T019 + T023 為同一次）。

- [ ] T014 [P] [US2] rust-api `sys_authorization_service.rs` 改 `assign_routes`：
  ① trait signature `async fn assign_routes(&self, domain, role_id, route_ids, actor: &Actor)` （append actor 末尾）
  ② impl body 在 txn `commit()` 前加：
  ```rust
  audit_log::write_in_txn(&txn, AuditEvent {
      actor,
      operation: AuditOperation::Update,
      entity_type: "sys_role",
      entity_id: role_id.clone(),
      payload_before: Some(serde_json::json!({
          "role_id": &role_id,
          "domain": &domain_code,
          "menu_ids": &existing_route_ids
      })),
      payload_after: Some(serde_json::json!({
          "role_id": &role_id,
          "domain": &domain_code,
          "menu_ids": &route_ids
      })),
      description: None,
      source: AuditSource::Internal,
      request_id: None,
  }).await?;
  ```
  確保 import audit_log / AuditEvent / AuditOperation / AuditSource（從 server_model::admin::audit_log + server_core::web::audit）；確保 `existing_route_ids` 變數在 audit 寫入時仍 in scope（既有 impl 在 fetch existing_routes 後即 collect）（data-model.md N3-B4）

- [ ] T015 [US2] rust-api `sys_authorization_service.rs` 改 `assign_users`：同 T014 模式 —— trait signature 加 `actor: &Actor`、impl body 在 commit 前加 audit_log::write_in_txn（payload `{role_id, user_ids: ...}` 集合，無 domain 欄因 sys_user_role schema 無 domain）。需先 read 既有 assign_users impl 確認 existing_user_ids 變數命名（沿用體例）（依 T014 同檔；data-model.md N3-B5）

- [ ] T016 [US2] rust-api `sys_authorization_api.rs` 改 assign_routes handler：加 `Extension(user): Extension<User>`（若還沒有）+ body 內 `let actor = Actor::from(&user);` + 末尾參數傳 `&actor`（依 T014；data-model.md N3-C3）

- [ ] T017 [US2] rust-api `sys_system_manage_api.rs` 改 `assign_role_menus_for_systemmanage`（W-FW4 transform handler）：既有已有 `Extension(user)`、body 加 `Actor::from(&user)` + 末尾參數傳 `&actor`（依 T014；data-model.md N3-C4）

- [ ] T018 [US2] rust-api `sys_authorization_api.rs` 改 assign_users handler：同 T016 模式（依 T015；data-model.md N3-C5）

- [ ] T019 [US2] rust-api build（若 US1+US2+US3 一起做，可與 T012 合併一次 build）（依 T014-T018；quickstart.md）

- [ ] T020 [US2] US2 acceptance：curl assignRoleMenus 後 psql sys_operation_log 1 row（C-V12）/ 連續改變 2 個獨立 audit row（C-V13）；curl assignUsersToRole 後 psql 同樣驗（C-V14）；模擬 txn rollback（assignRoleMenus 帶不存在 menu_id）→ psql 無 audit row（C-V15）；grep audit_log::write_in_txn in sys_authorization_service.rs：應在 assign_routes + assign_users 各 1 處、**不**在 assign_permission（C-V16）（依 T019）

**Checkpoint**: US2 可獨立交付 —— assign_routes/users 完整 audit trail。

---

## Phase 5: User Story 3 — N4 role code 安全改名 (P2)

**Goal**: rust update_role detect code 變動時同步 casbin_rule（ptype='p' 單 SQL、R-Q3 確認）+ 主動呼叫 notify_casbin_changed 觸發 W-F11 enforcer reload；拿掉 W-FW3 transform-layer code-lock；base-web drawer 不改。

**Independent test**: curl updateRole 改 roleCode 後 psql sys_role.code 變 + casbin_rule v0 同步、改名後該 role user 訪問既有授權 endpoint 不退化；不改 roleCode 時 casbin_rule 不被觸發。

**Note**: 與 US1 / US2 無檔案重疊（US3 動 sys_role_service.rs update_role 函式 + sys_system_manage_api.rs update_role 一處 lock 拿掉）；可平行起步。但 sys_role_service.rs 與 US1 T006 同檔、若同 implementer 做需順序處理（不可平行 patch）—— 若分不同 implementer subagent 則需協調 commit 順序。

- [ ] T021 [US3] rust-api `sys_role_service.rs` 改 `update_role`：在 ActiveModel update 後、audit 前、txn commit 前加：
  ```rust
  if before.code != input.role.code {
      use sea_orm::{Statement, DbBackend};
      txn.execute(Statement::from_sql_and_values(
          DbBackend::Postgres,
          "UPDATE casbin_rule SET v0 = $1 WHERE ptype = 'p' AND v0 = $2",
          [
              sea_orm::Value::String(Some(Box::new(input.role.code.clone()))),
              sea_orm::Value::String(Some(Box::new(before.code.clone()))),
          ],
      )).await.map_err(AppError::from)?;
  }
  ```
  txn commit 後加：
  ```rust
  if before.code != updated_role.code {
      server_global::notify_casbin_changed().await;
  }
  ```
  確保 import `server_global::notify_casbin_changed` + `sea_orm::Statement / DbBackend`（research.md R-Q2 confirmed commit 後 publish；R-Q3 confirmed ptype='p' 單 SQL；data-model.md N4-B3）

- [ ] T022 [US3] rust-api `sys_system_manage_api.rs` 改 `update_role_for_systemmanage`：line 271-289 約略的 `code: existing.code,`（W-FW3 transform-layer code-lock）改為 `code: input.role_code,`；line 269-270 註解更新為「W-FW6 N4：pid 沿用既有值（避免擾動角色樹）；code 直送 input（rust update_role 同步 Casbin policy）」（data-model.md N4-C2）

- [ ] T023 [US3] rust-api build（若 US1+US2+US3 一起做，可與 T012 合併一次 build）（依 T021-T022；quickstart.md）

- [ ] T024 [US3] US3 acceptance：建 test role（curl addRole + psql seed Casbin policy 1 row）；curl updateRole 改 roleCode → psql sys_role.code 變 + casbin_rule v0 同步（C-V17）；curl updateRole 不改 roleCode → casbin_rule 不變（C-V18）；驗 atomicity（C-V19，留至實作時設計 mock scenario）；驗拿掉 W-FW3 code-lock（C-V20）；改名後該 role user 訪問既有 endpoint 不退化（C-V21）；改名後該 role user 重 login 回新 roleCode（C-V22）；CDP `/manage/role` 改 roleCode（C-V24）（依 T023）

**Checkpoint**: US3 可獨立交付 —— role code 改名安全 + Casbin policy 同步。

---

## Phase 6: Polish & 收尾

- [ ] T025 全 C-V 矩陣 C-V1~C-V27 跑完（含 C-V1 schema + Casbin seed 完整驗 / C-V2 migration down 對稱 / C-V25 regression / C-V26 C-V27 scope diff）—— contracts/verification-commands.md

- [ ] T026 多段式 commit：base-web worktree commit + push fork → rust-api worktree commit + push fork → outer `git add base-web rust-api` 更新兩 SHA pin + 第三段 commit（CLAUDE.md §4.1）

- [ ] T027 INTEGRATION-CHECKLIST 更新：「已完成里程碑」加 037 entry（依日期升冪插入正確位置）、「Current Focus」更新（W-WEBUI follow-up 軌道剩 W-FW8 / N1 button-auth + assign_permission audit）、「規劃中」表移除 W-FW6 + 加 W-FW8 entry；CLAUDE.md SPECKIT marker 更新（Active feature → 無、Previous features 加 037 entry）

---

## Dependencies

```text
T001 (Setup)
  └─ Phase 2 Foundational:
        T002 (schema migration) → T003 (Casbin seed) → T004 (entity)
                      ↓
  ┌───────────────────┴────────────────────────────┐
  │                                                │
Phase 3 US1（MVP）                          Phase 4 US2          Phase 5 US3
T005 (input DTO)                            T014 [P] (assign_routes)  T021 [P] (update_role code sync)
  → T006 (service)                          T015 (assign_users 同檔)  → T022 (拿掉 code-lock)
  → T007 (RoleError variant)                → T016 (api handler)      → T023 (build, 可與 T012/T019 合)
  → T008 (api handlers)                     → T017 (transform handler)  → T024 (US3 acceptance)
  → T009 (router register)                  → T018 (api handler)
  → T010 (base-web service fn)              → T019 (build, 可與 T012 合)
  → T011 (base-web modal)                   → T020 (US2 acceptance)
  → T012 (rust + base-web build)
  → T013 (US1 acceptance)
                                          
  └────────────────────── Phase 6 Polish ─────────────────────┘
        T025 (全 C-V matrix) → T026 (multi-stage commit) → T027 (checklist 更新)
```

**Story 獨立性**: US1/US2/US3 功能獨立、可各自獨立驗收。**檔案重疊**：US1 動 sys_role_service.rs (B2 method) + entity + DTO + api handler + router；US2 動 sys_authorization_service.rs + 2 個 api handler；US3 動 sys_role_service.rs (B3 update_role 內 detect code) + 1 個 api handler。US1 + US3 同 sys_role_service.rs 但不同函式區段、可序列 patch 不衝突。Foundational (T002-T004) 為 US1 唯一前置；US2/US3 不依 foundational、可平行起步但建議 batch build 一次（T012 + T019 + T023 合）。

## Parallel Execution

- **跨 story**：T014（US2 assign_routes）、T021（US3 update_role code sync）分屬不同檔（sys_authorization_service.rs vs sys_role_service.rs）、無相依 → 可平行。建議單 implementer 走 P1 → P2 → P3 序列、batch build 一次（T012 與 T019 / T023 合）。
- **US1 內**：T005 與 T006/T007 依賴鏈（T005 input DTO → T006 service 用 → T007 error variant 用）；T008/T009 各檔但 T008 依 T005+T006、T009 依 T008；T010/T011 同 worktree、T011 依 T010 import；T012 依全部前置；T013 依 T012 —— 大致序列。
- **US2 內**：T014/T015 同檔（sys_authorization_service.rs）、不可平行；T016/T017/T018 各 api handler、可平行但都依賴 T014/T015 trait signature 變動；T019 依 T016-T018；T020 依 T019。
- **US3 內**：T021 → T022 序列；T023 依 T021+T022；T024 依 T023。

## Implementation Strategy

- **MVP = US1**（Phase 1 + 2 + 3）：base-web menu-auth-modal home 段接通 + 後端 sys_role.home_route_name 持久化 + admin round-trip 即達 MVP（可手動 round-trip 驗證、CDP 互動 OK）。
- **增量交付**: US1 → US2 → US3 依優先序；每 story phase 完成即為可獨立驗收增量。
- **build 批次**: tasks 列了 per-story build（T012 / T019 / T023）—— 執行時 controller 可批次（如 US1+US2+US3 的 rust + base-web 改動一次 build），不必逐 story 重 build。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。建議執行單元：① rust-api foundational + US1 後端（T002-T009）② base-web US1 接線（T010-T011）③ rust-api US2 audit gap + cascade（T014-T018）④ rust-api US3 code rename + 拿掉 code-lock（T021-T022）⑤ 一次 build（T012+T019+T023 合）⑥ acceptance + 收尾（T013+T020+T024+T025-T027）。
- **base-web 改動 ≤ 2 檔**：system-manage.ts + menu-auth-modal.vue、都在 §4 准動清單（Constitution v1.2.0 W-WEBUI 受管例外第三次行使）。
