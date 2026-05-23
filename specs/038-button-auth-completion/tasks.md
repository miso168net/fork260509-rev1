# Tasks: W-FW8 — button-auth-completion

**Input**: Design documents from `/specs/038-button-auth-completion/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 無單元測試 task —— wiring + transform layer + audit gap fill + Casbin 同步類 feature（資料寫入由 Sea-ORM derive、Casbin SQL 由既有 `sync_role_permissions` helper covered、audit_log helper 已 covered by F2.1，native 程式碼無新純函式邏輯），正確性由 acceptance（curl + psql + CDP browser smoke）覆蓋。比照 W-FW1~W-FW7 慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 P1 MVP = button-auth modal 接通；US2 P2 = assign_permission audit）。Foundational 階段含 assign_permission trait signature 末尾 append `actor: &Actor` + 既有 handler cascade（為 US1 transform handler A6 與 US2 audit body 共用前置；同 W-FW6 N3 trait 改造 + cascade 體例）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2）
- 路徑相對 worktree root（`rust-api/` 或 `base-web/`）

---

## Phase 1: Setup

- [ ] T001 確認 worktree 分支正確（`rust-api` 在 `rev1-admin-rust-api`、`base-web` 在 `rev1-admin-base-web`、outer 在 `038-button-auth-completion`）、dev stack 可 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起（quickstart.md）；確認 Constitution v1.3.0 amendment 已落地（grep `W-FW1`–`W-FW8` 在 `.specify/memory/constitution.md` 命中、版本 1.3.0、Last Amended 2026-05-23）

---

## Phase 2: Foundational

**跨 story 共用前置** —— `assign_permission` trait signature 變動是 US1 transform handler A6 與 US2 audit body 共同依賴：

- US1 A6 `assign_role_endpoints_for_systemmanage` transform handler call `service.assign_permission(..., &actor)` —— trait 末尾必須先 append `actor: &Actor` 才能編譯
- US2 B1b audit body 寫在 assign_permission impl 內 —— impl signature 必須先含 `actor: &Actor` 才能 audit 拿到 actor

故 T002 + T003 必須在 US1 與 US2 開始前完成。

- [ ] T002 rust-api `sys_authorization_service.rs` 改 `assign_permission` trait + impl signature 末尾 append `actor: &Actor`：trait declaration (line ~56-63) 加參數；impl declaration (line ~209) 同步加參數；**body 暫不改 audit**（B1b 留 US2 phase 加）。同 W-FW6 N3 assign_routes/users trait 改造體例（data-model.md B1 part-A、research.md「既有 assign_permission signature」）

- [ ] T003 rust-api `sys_authentication_api.rs` 改 `assign_permission` handler cascade：加 `Extension(user): Extension<User>` 第一個參數（若還沒有）+ body 加 `let actor = Actor::from(&user);` + 末尾傳 `&actor`；User / Actor import 既有（W-FW6 N3 時已 import）。依 T002（trait signature 變動需 cascade callsite）（data-model.md B2）

**Checkpoint**: Foundational 完成、US1 + US2 可平行開始。實作層級兩 user story 完全可平行（A 各檔 vs B 在 assign_permission body）；建議單 implementer 走 US1 → US2 序列、batch build 一次。

---

## Phase 3: User Story 1 — A button-auth modal 接通 (P1) 🎯 MVP

**Goal**: base-web `button-auth-modal.vue` stub 接通 3 個新 systemManage alias 端點；admin 在 modal 勾選 endpoint 後 Casbin policy 真寫入 + 跨 replica reload + 該 role user 對未授權 endpoint 立即 deny。

**Independent test**: 在 `/manage/role` 開某 role 編輯抽屜 → 點「按钮权限」 → modal 開、NTree 13 group 展開、勾選對得上 Casbin policy；改勾選送出 → 重開預填一致 + 該 role user 對應 endpoint 訪問結果反映 admin 設定；psql 直接 query 既有 W-FW6 N3 audit 不退化。

- [ ] T004 [US1] rust-api 新 Casbin policy seed migration `migration/src/datas/m20260524_c_wfw8_endpoint_alias_seed.rs`：6 row（ROLE_SUPER + ROLE_ADMIN × getAllEndpoints GET + getRoleEndpointIds/:roleId GET + assignRoleEndpoints POST），沿用 `m20260524_b_wfw6_role_home_alias_seed.rs` 體例（`Statement::from_string` + raw SQL INSERT）；register in `migration/src/lib.rs` 末端、緊接 W-FW6 `m20260524_b`（data-model.md A1）

- [ ] T005 [P] [US1] rust-api 新 input DTO `SystemManageAssignRoleEndpointsInput { role_id: String, endpoint_ids: Vec<String> }`：在 `server/model/src/admin/input/sys_authorization.rs`（或 sys_role.rs，視 placement）；`#[derive(Debug, Deserialize, Validate)]` + `#[serde(rename_all = "camelCase")]` + role_id `#[validate(length(min = 1))]`；同時 `server/model/src/admin/input/mod.rs` 加 `pub use` re-export（data-model.md A2）

- [ ] T006 [P] [US1] rust-api 新 output DTO `EndpointTreeNode { key, label, children: Option<Vec<EndpointTreeNode>>, method: Option<String>, path: Option<String>, is_leaf: bool }`：在 `server/model/src/admin/output/sys_endpoint.rs` 或 sys_authorization.rs（視 placement）；`#[derive(Debug, Serialize)]` + `#[serde(rename_all = "camelCase")]` + `#[serde(skip_serializing_if = "Option::is_none")]` 於 children / method / path（data-model.md A3）

- [ ] T007 [US1] rust-api `sys_system_manage_api.rs` 加 transform handler `get_all_endpoints_for_systemmanage`：query `sys_endpoint::find_active().all(db)` → group by resource (BTreeMap) → reshape into `Vec<EndpointTreeNode>`（research.md R-Q2 implementation snippet）；leaf label = `format!("{}（{}）", summary 或 fallback, method)`；imports: `sys_endpoint` facade、`SysEndpointModel`、`EndpointTreeNode`、`BTreeMap`、`db_helper`（data-model.md A4）

- [ ] T008 [US1] rust-api `sys_system_manage_api.rs` 加 transform handler `get_role_endpoint_ids_for_systemmanage`：fetch role.code → enforcer.get_filtered_policy(0, [role_code, domain]) → fetch all active sys_endpoint into HashMap<(path,method), id> → reverse-map policies to ids → dedup + sort（research.md R-Q3）；imports: `SysRoleService`、`CasbinAxumLayer`、`HashMap`（data-model.md A5）

- [ ] T009 [US1] rust-api `sys_system_manage_api.rs` 加 transform handler `assign_role_endpoints_for_systemmanage`：`Actor::from(&user)` + 末尾參數傳 `&actor` 給 `service.assign_permission(domain, input.role_id, input.endpoint_ids, &actor)`；依 T002 trait signature + T005 DTO；imports: `SystemManageAssignRoleEndpointsInput`、`SysAuthorizationService`（data-model.md A6）

- [ ] T010 [US1] rust-api `sys_system_manage_route.rs` 加 3 條 RouteInfo（for Casbin policy 自動發現）+ Router::route 註冊：
  - `RouteInfo /systemManage/getAllEndpoints GET` + `.route("/getAllEndpoints", get(SysSystemManageApi::get_all_endpoints_for_systemmanage))`
  - `RouteInfo /systemManage/getRoleEndpointIds/:roleId GET` + `.route("/getRoleEndpointIds/{roleId}", get(...))`
  - `RouteInfo /systemManage/assignRoleEndpoints POST` + `.route("/assignRoleEndpoints", post(...))`
  註冊位置：與 W-FW6 `updateRoleHome` 群聚（依 T007-T009；data-model.md A7）

- [ ] T011 [P] [US1] base-web `src/service/api/system-manage.ts` 加 3 service function：
  - inline `type EndpointTreeNode = { key, label, children?, method?, path?, isLeaf? }`（research.md R-Q1 體例、不動 src/typings）
  - `fetchGetAllEndpoints()` → `request<EndpointTreeNode[]>({ url: '/systemManage/getAllEndpoints', method: 'get' })`
  - `fetchGetRoleEndpointIds(roleId: string)` → `request<string[]>({ url: \`/systemManage/getRoleEndpointIds/${roleId}\`, method: 'get' })`
  - `fetchAssignRoleEndpoints(data: { roleId: string; endpointIds: string[] })` → `request<boolean>({ url: '/systemManage/assignRoleEndpoints', method: 'post', data })`
  （data-model.md E1）

- [ ] T012 [US1] base-web `src/views/manage/role/modules/button-auth-modal.vue` 接通：
  - 拿掉 line 36-47 硬編 mock buttons（10 個 `{id, label, code}`）
  - 拿掉 line 50 `checks: number[]`、改為 `string[]`（endpoint.id 為 string）
  - 拿掉 `getAllButtons()` / `getChecks()` console.log stub
  - 改寫 init：`onMounted` 或同 menu-auth-modal 既有 `watch(visible)` 體例觸發 → `Promise.all([fetchGetAllEndpoints(), fetchGetRoleEndpointIds(String(props.roleId))])` + setLoading + 處理 envelope error
  - 改寫 confirm：call `fetchAssignRoleEndpoints({ roleId: String(props.roleId), endpointIds: checks.value })`；成功顯示 `window.$message?.success($t('common.modifySuccess'))` toast；失敗顯示 toast「更新失敗」
  - import 改：加 `fetchGetAllEndpoints, fetchGetRoleEndpointIds, fetchAssignRoleEndpoints` 從 `@/service/api`
  （依 T011；data-model.md E2）

- [ ] T013 [US1] build rust-api + base-web image + dev stack 重啟（`DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api` + `DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web ./base-web` + `up -d --wait`）；含 migration 自動套用（依 T002-T012；quickstart.md）

- [ ] T014 [US1] US1 acceptance：psql 驗 Casbin seed 6 row（C-V1）；migration down 對稱（C-V2 臨時 DB）；curl getAllEndpoints → 13-group tree、67 leaf、中文 summary label（C-V3 / C-V4）；curl getRoleEndpointIds/1 → 非空 endpoint.id 集合（C-V5）；新 test role getRoleEndpointIds → `[]`（C-V6）；invalid role → 4001（C-V7）；assignRoleEndpoints `[id1,id2]` → casbin_rule 2 row（C-V8）；diff change `[id2,id3]` → 該 role 仍 2 row、id1 移除 id3 add（C-V9）；clear `[]` → casbin_rule 該 role 0 row（C-V10）；含 bogus id → 過濾後 valid 寫入（C-V11）；GeneralUser token 三條 alias 全 5001 deny（C-V12）；rust-api log 含 Casbin invalidate reload 訊號（C-V17）；該 role user 訪問被授權 endpoint 200、被取消 endpoint 5001（C-V18）；CDP via Edge :9229 開 `/manage/role` → ROLE_SUPER 編輯抽屜 → 按鈕权限 modal 開、tree 13 group 展開、勾選 + 確認 + toast（C-V19 / C-V20 / C-V21）（依 T013）

**Checkpoint**: US1 可獨立交付 —— button-auth modal 端到端通、Casbin server-side 真實 enforce、stub 完全移除。

---

## Phase 4: User Story 2 — B assign_permission audit (P2)

**Goal**: `sys_authorization_service.assign_permission` 補 `audit_log::write_in_txn`（payload before/after camelCase `{roleId, domain, endpointIds:[...]}`、entity_type='sys_role'、operation=UPDATE）；補完 W-FW6 N3 留下的最後 audit gap → sys_authorization_service.rs `audit_log::write_in_txn` 落地後 3 次（assign_routes + assign_users + assign_permission）；既有 N3 audit 路徑 0 退化。

**Independent test**: 直接 curl `/authorization/assign-permission`（不透過 US1 transform）後 psql 查 sys_operation_log 應 +1 row、payload 結構正確；連續 2 次 distinct set assign → +2 row 對得上各次操作；txn rollback 場景 0 audit row。

**Note**: 與 US1 在 sys_authorization_service.rs（trait/impl）有 overlap、但 US1 在 transform handler、US2 在 service body —— 不同函式區段、可序列 patch 不衝突。建議 US1 完整跑完（含 acceptance）再做 US2、避免 US1 acceptance 受 US2 進度影響。

- [ ] T015 [US2] rust-api `sys_authorization_service.rs` `assign_permission` impl 加 `audit_log::write_in_txn`（在既有 sync 內 `txn.commit()` 前）：
  ```rust
  audit_log::write_in_txn(&txn, AuditEvent {
      actor,
      operation: AuditOperation::Update,
      entity_type: "sys_role",
      entity_id: role_id.clone(),
      payload_before: Some(serde_json::json!({
          "roleId": &role_id,
          "domain": &domain_code,
          "endpointIds": &existing_endpoint_ids
      })),
      payload_after: Some(serde_json::json!({
          "roleId": &role_id,
          "domain": &domain_code,
          "endpointIds": &permissions
      })),
      description: None,
      source: AuditSource::Internal,
      request_id: None,
  }).await?;
  ```
  **變數命名**：`existing_endpoint_ids` 為既有 service 在 sync 流程中 fetch 出來的 row 集合 —— **需先讀既有 impl 確認該變數命名**（assign_routes 體例為 `existing_route_ids`、assign_users 為 `existing_user_ids`、本 service 可能用其他名）；若既有 sync 不存 fetch existing_endpoint_ids、需先補 fetch（同 assign_routes 模式 line ~254）。`permissions` 為 input endpoint_ids、若 sync 內過濾 bogus、audit `payload_after.endpointIds` 應為**實際寫入** Casbin 的有效集合（非原始 input）。imports（已既有 W-FW6 N3 落地時加入）：`audit_log`、`AuditEvent`、`AuditOperation`、`AuditSource`、`serde_json`（data-model.md B1 part-B）

- [ ] T016 [US2] rust-api rebuild + dev stack 重啟（incremental from T013 base、可合併於 T013 build 中若 US1 + US2 同次走；若 US2 後做、單獨 `docker build ./rust-api` + `up -d --wait`）（依 T015；quickstart.md）

- [ ] T017 [US2] US2 acceptance：curl `/authorization/assign-permission` body `{domain:"built-in", roleId:"<testRoleId>", permissions:[id1,id2]}` → envelope 0；psql sys_operation_log 對 testRoleId entity_id + `payload_after ? 'endpointIds'` 查 1 row、payload_before/after 含 `endpointIds` 集合差異正確（C-V13）；連續 2 次不同集合 assign → 2 row audit、bf/af 對得上（C-V14）；grep `audit_log::write_in_txn` in rust-api/server/service/src/admin/sys_authorization_service.rs：應命中 3 處（assign_routes + assign_users + assign_permission），不應 4 處（C-V15）；模擬 txn rollback（bogus role_id 4001 reject）→ sys_operation_log 無新 row（C-V16）（依 T016）

**Checkpoint**: US2 可獨立交付 —— sys_authorization_service.rs 三個 assign_* 全有 audit 紀錄；W-FW6 留下的最後 audit gap 補齊。

---

## Phase 5: Polish & 收尾

- [ ] T018 全 C-V 矩陣 C-V1~C-V27 跑完一輪（含 edge case C-V26 軟刪 endpoint 不入 tree (E-2) / C-V27 assignRoleEndpoints 對軟刪 role reject + 0 audit (E-9) / regression 段 C-V22 既有 endpoint 不退化 / scope 段 C-V23 git diff 統計 / C-V24 button-auth-modal.vue 0 stub leftover grep / C-V25 schema 0 變更 psql 驗）—— `contracts/verification-commands.md`

- [ ] T019 多段式 commit + push：base-web worktree commit + push fork（rev1-admin-base-web）→ rust-api worktree commit + push fork（rev1-admin-rust-api）→ outer `git add base-web rust-api` 更新兩 SHA pin + 第三段 commit on `038-button-auth-completion` feature branch、push origin（CLAUDE.md §4.1）

- [ ] T020 INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker 更新：
  - `docs/INTEGRATION-CHECKLIST.md`「已完成里程碑」加 038 entry（依日期升冪插入正確位置、含 outer SHA + merge SHA + rust-api SHA + base-web SHA + spec 路徑 + scope summary）
  - `docs/INTEGRATION-CHECKLIST.md`「Current Focus」更新 **W-WEBUI follow-up 軌道清空**、「規劃中」表移除 W-FW8 entry
  - `CLAUDE.md` SPECKIT marker：Active feature → 無、Previous features 加 038（含 merge SHA、scope、acceptance 結果概要）
  - **W-FW8 落地後 W-WEBUI follow-up 軌道收尾、不再有新 W-FW**；下個推薦排程：observability（W-F12）

- [ ] T021 invoke `superpowers:finishing-a-development-branch` —— merge 038 feature branch 回 `rev1-admin-root`（CLAUDE.md §3 step 標準收尾）+ 刪 feature branch + 回填 outer/merge SHA commit（同 W-FW6 037 收尾流程：base-web/rust-api fork push → outer feature branch push → outer git switch rev1-admin-root → git merge --no-ff → 刪 feature branch → 回填 SHA + push rev1-admin-root）

---

## Dependencies

```text
T001 (Setup)
  └─ Phase 2 Foundational:
        T002 (assign_permission trait + impl signature append actor: &Actor)
          → T003 (sys_authentication_api.rs handler cascade depends on T002)
                      ↓
  ┌───────────────────┴────────────────────────────┐
  │                                                │
Phase 3 US1（MVP、P1）                          Phase 4 US2（P2）
T004 (Casbin seed migration)                    T015 (audit body in assign_permission impl)
T005 [P] (input DTO)                              → 依賴 T002 (impl signature 含 actor: &Actor)
T006 [P] (output DTO EndpointTreeNode)          T016 (rebuild, 可合 T013)
T007 (transform getAllEndpoints, BTreeMap)      T017 (US2 acceptance: C-V13~C-V16)
T008 (transform getRoleEndpointIds, reverse-map)
T009 (transform assignRoleEndpoints, 依 T002 + T005)
T010 (router 3 condition: 依 T007/T008/T009)
T011 [P] (base-web service fn, 不動 rust)
T012 (base-web modal, 依 T011)
T013 (rust + base-web build)
T014 (US1 acceptance: C-V1~C-V12, C-V17~C-V21)
                                          
  └────────────────────── Phase 5 Polish ─────────────────────┘
        T018 (全 C-V matrix run) → T019 (multi-stage commit + push) →
        T020 (checklist 更新) → T021 (finishing-a-development-branch merge)
```

**Story 獨立性**: US1 / US2 功能獨立、可各自獨立驗收。**檔案重疊**：US1 動 sys_authorization_service.rs 0（不動、只 import 既有 service）+ sys_system_manage_api.rs（3 transform）+ sys_system_manage_route.rs + 兩個 model 檔（input DTO + output DTO）+ migration 1 + base-web 2 檔；US2 動 sys_authorization_service.rs (assign_permission body 內加 audit_log::write_in_txn) + sys_authentication_api.rs handler cascade（已於 T003 完成）。US1 + US2 在 sys_authorization_service.rs 都觸碰、但 US1 transform 只 call、US2 改 body —— 不同函式區段、序列 patch 不衝突。

## Parallel Execution

- **跨 Phase 2 → US1**：T002 / T003 序列（trait → cascade callsite）；T002 完成後 US1 可開始
- **US1 內**：T005 / T006 / T011 各檔互不相關、可平行（[P]）；T007 / T008 / T009 / T010 / T012 / T013 / T014 各依賴前置、序列
  - T005 input DTO 與 T011 base-web service fn 完全平行（rust 與 base-web 兩 worktree）
  - T005 / T006 / T011 三個 [P] task 可一起做（單 implementer 看 3 個檔）
- **US2 內**：T015 → T016 → T017 序列
- **跨 US1 / US2**：批次優化：建議 US1 完整跑完（含 T013 build + T014 acceptance）後再 T015 — T013 build 只一次（rust + base-web）；US2 incremental T016 也可省去若 US1+US2 同 patch、build 合一

## Implementation Strategy

- **MVP = US1**（Phase 1 + 2 + 3）：button-auth modal 接通 + Casbin server-side enforce 即達 MVP（可獨立驗收）。
- **增量交付**: US1 → US2 依優先序；每 story phase 完成即為可獨立驗收增量。
- **build 批次**: tasks 列了 per-story build（T013 / T016）—— 執行時 controller 可批次合一（如 US1 + US2 改動一次 build），不必逐 story 重 build。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。建議執行單元：
  - ① Foundational（T002 + T003）—— 1 subagent 連續 patch
  - ② US1 rust-api foundational + transform handler（T004 + T005 + T006 + T007 + T008 + T009 + T010）—— 1 subagent
  - ③ US1 base-web 接線（T011 + T012）—— 1 subagent
  - ④ US2 audit body（T015）—— 1 subagent
  - ⑤ 一次 build（T013 + T016 合）—— controller 自行
  - ⑥ acceptance + 收尾（T014 + T017 + T018 + T019 + T020 + T021）—— controller + finishing-a-development-branch
- **base-web 改動 ≤ 2 檔**：system-manage.ts + button-auth-modal.vue、都在 §4 准動清單（Constitution v1.3.0 W-WEBUI 受管例外行使 —— W-WEBUI 受管例外總計第 4 次行使（前 3 次行 v1.2.0：035 W-FW5 首次、036 W-FW7 第 2 次、037 W-FW6 第 3 次）；v1.3.0 列舉擴 W-FW1–W-FW8 後 W-FW8 為 v1.3.0 首次行使）。
