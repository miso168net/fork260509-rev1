# Feature Specification: 051 assign-permission-atomicity-fix

**Feature Branch**: `051-assign-permission-atomicity-fix`
**Created**: 2026-05-25
**Status**: Draft
**Input**: User description: "038-R1 結案：sys_authorization_service::assign_permission split-txn 修為 single Sea-ORM txn (casbin_rule 直寫 + audit 同 txn)、強化 Constitution Principle II 同-txn 承諾、配 notify_casbin_changed pub-sub reload"

**前置文件**：
- [`docs/superpowers/051-feature-assign-permission-atomicity-fix.md`](../../docs/superpowers/051-feature-assign-permission-atomicity-fix.md)（brainstorm 設計、Q1-Q3 拍板、10 sections / 274 line、commit `92c919a`）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.6.0 Principle II（NON-NEGOTIABLE）「業務寫入 + audit 寫入 MUST 在同一 DB transaction」承諾被本 fix 強化、無 amendment 需要
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) 衍生 follow-up 行 **038-R1** ⚠️ Critical（post-merge code review、2026-05-25 登記）
- [`docs/INTEGRATION-DESIGN-W-BASE-WEB.md`](../../docs/INTEGRATION-DESIGN-W-BASE-WEB.md)（本 sprint 軌道外、無 §4 entry 需求）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Developer / Auditor 看 `assign_permission` 寫入鏈條為 single atomic txn、Casbin policy 與 audit 同 commit / 同 rollback（Priority: P1）🎯 MVP

維護 rev1 整合的 rust developer / compliance auditor / security reviewer 在 fix 落地後應確認：

- **assign_permission write path 完全 atomic**：`casbin_rule` 寫入（INSERT/DELETE 為 ptype='p' policies）與 `sys_operation_log` 寫入（audit row）在同一個 Sea-ORM `DatabaseTransaction` 內、單一 `commit()` 後才生效。
- **失敗路徑 100% rollback**：包括 SELECT 失敗 / INSERT 失敗 / DELETE 失敗 / audit_log 寫失敗 / commit 失敗 — 任一環節失敗 → txn 整段 rollback → `casbin_rule` 與 `sys_operation_log` 都 0 變動。
- **Constitution Principle II 承諾全保留**：「業務寫入 + audit 寫入 MUST 在同一 DB transaction」NON-NEGOTIABLE 紀律在 W-FW8 US2 落地時被違反（split-txn）、本 fix 收斂、Principle II 自此**強化、不軟化**。
- **既有 Casbin enforcement / RBAC 行為 0 變化**：enforcer in-memory 在 commit 後 via `notify_casbin_changed()` redis pub-sub 廣播給所有 replica（含本機 subscriber）非同步 reload；同 037-R1 / W-FW6 N4 既有 ptype='p'/'g' UPDATE pattern。GeneralUser deny 等 W-FW8 既有 acceptance behavior 不變。

**Why this priority**：post-merge code review 揭示這是當前 Constitution II 唯一持續 violation；038-R1 標 ⚠️ Critical；fix 強化 NON-NEGOTIABLE 承諾、消除 forensics chain 斷裂風險。MVP-worthy 因為 fix 本身為 single-fn atomic refactor、verifiable evidence 直接（acceptance C-V3 fault injection 可定性證明）。

**Independent Test**：(a) curl `POST /systemManage/assignRoleEndpoints` → psql 看 `casbin_rule` 內新增 row + `sys_operation_log` 內 audit row（payload `endpointIds` before/after 對齊）；(b) 注入 audit_log 寫失敗 path → curl 預期 5xx → psql 看 `casbin_rule` 與 `sys_operation_log` **同步 0 變動**（atomicity 反證）；(c) Casbin enforcement 試命中新 policy → 200（W-F11 pub-sub reload 正常）；(d) GeneralUser deny regression（既有 W-FW8 C-V）。

**Acceptance Scenarios**：

1. **Given** Soybean token + 有效 role R_TEST + 有效 endpoint id 清單；**When** curl `POST /systemManage/assignRoleEndpoints` 送 `{roleId, endpointIds:[id1, id2, id3]}`；**Then** response 200、psql `casbin_rule` 新增 3 row (ptype='p', v0=R_TEST 對應 role_code, v1=domain, v2=path, v3=method)、psql `sys_operation_log` 新增 1 audit row、payload_before/payload_after 含 `endpointIds` 對齊 incoming + diff。
2. **Given** 同上 + audit_log internal write path 暫時故意回 Err（test build fault injection）；**When** curl `POST /systemManage/assignRoleEndpoints`；**Then** response 5xx、psql `casbin_rule` row count **0 變動**（rollback 證明）、psql `sys_operation_log` 對應時段 0 新 row（雙方鏈條同捨）。
3. **Given** assign_permission 已落地新 policy via fix；**When** 各 replica 的 spawn_casbin_sync_subscriber 收 redis pub-sub message + enforcer.load_policy() reload；**Then** ~10-50ms 後 enforcer in-memory 已含新 policy、後續 enforce 路徑命中新 policy → 200。
4. **Given** GeneralUser token；**When** curl `POST /systemManage/assignRoleEndpoints`；**Then** Casbin 拒絕、response code != 0（deny path、既有 W-FW8 acceptance regression）。
5. **Given** Soybean token + role R_TEST + 既有 policy；**When** curl 送 `{roleId, endpointIds:[]}`（E-4 clear-all 既有 spec）；**Then** psql `casbin_rule` 該 role 的 ptype='p' rows 全 DELETE、audit payload_after `endpointIds:[]` 紀錄。
6. **Given** fix 落地後；**When** grep `sync_role_permissions` 全 rust-api source；**Then** 0 hit（private fn 已刪、fix 後無 caller）。

---

### Edge Cases

- **空陣列 clear-all（E-4 既有 spec）**：incoming `endpointIds:[]` MUST 視為「清空 role 所有 ptype='p' policies」、既有 sync_role_permissions 體例。txn 內 SELECT 拿現有 rows → 全 mark for delete → DELETE → audit payload_after `endpointIds:[]`。對齊 `assign_routes` (W-FW6 N3) / `assign_users` (W-FW8 US2) 既有 clear-all 紀律。
- **全 invalid input（非空 + 0 個 active endpoint）**：既有 logic 不動 — `if !raw_input.is_empty() && valid_permissions.is_empty()` 早退 `AuthorizationError::PermissionsNotFound`、無 txn 開、無 mutation。
- **idempotent re-assign 同集合**：incoming = existing；diff 計算結果 rows_to_add = 0、ids_to_delete = 0；INSERT/DELETE 都跳過；audit payload_before == payload_after（紀錄 no-op、保留 audit 完整性）。Constitution II 不要求「無變動就 skip audit」、本 sprint 不變既有 behavior。
- **並發 race（同 role + domain 兩個 caller 同時 assign）**：Postgres 預設 `READ COMMITTED` isolation；兩 caller 各自 txn 內 SELECT 看到 commit 前狀態、INSERT/DELETE 各自 apply。若撞 unique constraint / phantom read、後 commit 一方拿 conflict error、整 txn rollback；Sea-ORM `from_err` 回 AppError 給 caller。需 stricter consistency 屬 follow-up（不在本 sprint 範圍）。
- **`notify_casbin_changed` 失敗（redis pub-sub 異常）**：DB 已 commit、policy 已落地、enforcer in-memory 暫時不 reload — eventual consistency 接受、log warn、下次 message 或 subscriber 啟動時補 reload。NOT 影響 txn outcome / acceptance。既有 W-F11 pattern、本 fix 不變。
- **trait signature drop `enforcer` param 影響其他 caller**：2 callsite 已枚舉（`sys_authentication_api.rs:152` / `sys_system_manage_api.rs:554`）、本 sprint 同步調整；無外部 trait impl callsite。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`rust-api/server/service/src/admin/sys_authorization_service.rs::assign_permission` impl（`TAuthorizationService` trait）MUST 改寫為 single Sea-ORM `DatabaseTransaction`：txn 開頭 SELECT `casbin_rule` WHERE `ptype='p' AND v0=role_code AND v1=domain` 取既有 policies → 計算 diff（rows_to_add / ids_to_delete）→ `CasbinRule::insert_many(rows_to_add).exec(&txn)` + `CasbinRule::delete_many().filter(...is_in(ids_to_delete)).exec(&txn)` → `audit_log::write_in_txn(&txn, AuditEvent { ... endpointIds before/after })` → `txn.commit()` → `notify_casbin_changed()`（fire-and-log）。改動目標：以「Casbin policy 寫與 audit 寫同 txn」消除 split-txn violation。
- **FR-002**：fix 後 `sys_authorization_service.rs` 內 `sync_role_permissions` private fn（既有 line 128~205、走 enforcer.write_handle + add_policies/remove_policies 的 helper）MUST 整段移除；落地後 grep `fn sync_role_permissions\b` 在 rust-api 全 source 0 hit（無外部 caller 待清理）。
- **FR-003**：`TAuthorizationService::assign_permission` trait signature MUST drop `enforcer: Arc<RwLock<impl CoreApi + MgmtApi + RbacApi + Send + Sync>>` 參數（fix 後 write path 不再經 enforcer、reload via 既有 `notify_casbin_changed()` pub-sub）；trait + impl + 2 handler callsite（`sys_authentication_api.rs:152` / `sys_system_manage_api.rs:554`）同步調整、cargo check pass、0 dead arg。
- **FR-004**：audit_log payload shape MUST 與既有 W-FW8 US2 體例完全一致：
  - `entity_type: "sys_role"`
  - `entity_id: role_id`（caller-provided ULID string）
  - `operation: AuditOperation::Update`
  - `source: AuditSource::Internal`
  - `payload_before`: `{"roleId": <role_id>, "domain": <domain_code>, "endpointIds": [<existing_endpoint_ids 排序 dedup>]}`
  - `payload_after`: `{"roleId": <role_id>, "domain": <domain_code>, "endpointIds": [<new_endpoint_ids 排序 dedup>]}`
  - **endpointIds 反映表**：txn 開頭 SELECT 全 active sys_endpoint、建 `(path, method) → endpoint_id` HashMap、從 `casbin_rule` 既有 row 的 `v2/v3` 反映回 endpoint_id（既有 W-FW8 reverse-map 體例）。
- **FR-005**：`casbin_rule` INSERT rows 內容 MUST 對齊 Casbin policy structure：`ptype = "p"`、`v0 = role_code`、`v1 = domain_code`、`v2 = endpoint.path`、`v3 = endpoint.method`、`v4 = None`、`v5 = None`（與既有 `sync_role_permissions` 寫 enforcer 時的 4-tuple 一致）。Sea-ORM `CasbinRuleActiveModel`（entity 已在 `rust-api/server/model/src/admin/entities/prelude.rs:4` 暴露、無需新 entity）。
- **FR-006**：失敗路徑全 rollback 紀律 — 任一環節失敗（SELECT / INSERT / DELETE / audit_log::write_in_txn / commit）MUST 透過 `?` early-return + txn drop（Postgres ROLLBACK 自動）達成 `casbin_rule` 與 `sys_operation_log` **同步 0 變動**；caller 拿 AppError、無 partial commit、無 silent grant 風險。
- **FR-007**：fix 後 enforcer in-memory cache MUST 在 txn commit 後透過既有 `notify_casbin_changed()` 廣播；本機 + 跨 replica 的 `spawn_casbin_sync_subscriber` 收 message 後呼 `enforcer.load_policy()` 從 DB 重載；同 037-R1 / W-FW6 N4 既有 ptype='p'/'g' UPDATE 之 eventual consistency 體例（~10-50ms window 接受）。本 fix 不引入新 reload 機制。
- **FR-008**：本 sprint MUST 0 Constitution amendment（fix 強化 Principle II 既有承諾、未引入新原則）；0 新 schema migration（沿用既有 `casbin_rule` table）；0 新 entity（`casbin_rule::Entity` 已 exposed in prelude）；0 新 workspace cargo dep；0 base-web 改動；0 nestjs 殘留；0 新 endpoint；0 新 redis channel。
- **FR-009**：本 sprint MUST 為**軌道外** feature（無 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 軌道相關 file）；plan.md Constitution Check 段 4-選一軌道辨識為「軌道外」、無 DESIGN doc 條目 add 需求。
- **FR-010**：本 sprint 完成後 `docs/INTEGRATION-CHECKLIST.md` MUST：(a) 衍生 follow-up table 移除 `038-R1` ⚠️ Critical row、加 footnote「038-R1 結案 via 051」；(b) `039-R1` ⚠️ Critical row 仍留 active 等下一 dedicated sprint；(c) 已完成里程碑加 051 entry（SHA placeholder 留 SHA backfill）；(d) Current Focus「現狀」加 051 + 「下一步」更新（剩 039-R1 + 條件觸發 / 長期）；(e) CLAUDE.md SPECKIT marker idle。

### Key Entities

本 feature 為 atomicity impl fix、**無 application data entity 改動**（0 schema migration、0 新 entity、0 新 column）。涉及既有 entity：

- **`casbin_rule`**（Sea-ORM entity at `rust-api/server/model/src/admin/entities/casbin_rule.rs`、已在 prelude 暴露）— Casbin policy storage、本 fix 改為由 service 層直 write（取代既有 enforcer.add/remove_policies）；schema 不變（id i64 PK / ptype / v0~v5）。
- **`sys_operation_log`**（既有 audit log table）— audit row 寫入透過 `audit_log::write_in_txn`、payload shape 不變、本 fix 改為與 `casbin_rule` 寫入同 txn。
- **`sys_endpoint`**（既有 endpoint catalog）— 為 endpoint_id ↔ (path, method) 反映表來源；本 fix 不變、僅 SELECT 用。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：dev stack healthy 啟動後、13 service 全 healthy state；rust-api 啟動 + drainer 跑著（接 050 baseline、不退化）。
- **SC-002**：happy path atomicity 證明 — curl `POST /systemManage/assignRoleEndpoints` 送 3 endpoint id；psql 看 `casbin_rule` 新增 3 row（ptype='p' / v0=role_code / v1=domain / v2=path / v3=method）+ `sys_operation_log` 新增 1 audit row（payload_after.endpointIds 含同 3 id 排序 dedup）；單 round-trip < 500ms。
- **SC-003** ⭐ **rollback atomicity 反證**（本 sprint 最關鍵）— 透過注入 audit_log 內部寫失敗（test-only fault injection、acceptance 後 revert）→ curl `POST /systemManage/assignRoleEndpoints` 預期 response 5xx → psql 看 `casbin_rule` 對應 role 的 row 集合 **與 fault injection 前完全相同**（diff 0 row）+ `sys_operation_log` 對應時段 0 新 row。fault injection revert 後 happy path 仍 SC-002 PASS。
- **SC-004**：Casbin enforce reload via W-F11 pub-sub — assign_permission 落地新 policy 後 sleep 100ms → 本機 enforcer in-memory 已 reload（grep rust-api log 命中 `Casbin policy reloaded` / `casbin_sync_subscriber` 訊息 ≥1 次）→ 後續 curl 命中新 policy 路徑 → 200。
- **SC-005**：GeneralUser deny regression — GeneralUser curl `POST /systemManage/assignRoleEndpoints` → response code != 0（既有 W-FW8 acceptance、不退化）。
- **SC-006**：clear-all E-4 既有 spec — Soybean 送 `endpointIds:[]` → psql `casbin_rule` 該 role 的 ptype='p' rows 全 0 + `sys_operation_log` 紀錄 payload_after `endpointIds:[]`。
- **SC-007**：boundary verify — grep `fn sync_role_permissions\b` 全 rust-api source 0 hit + grep `enforcer:` in `assign_permission` 4 params signature 0 hit（drop 確認）+ rust-api `migration/` 0 diff + 0 base-web 改動 + 0 Constitution amendment。
- **SC-008**：INTEGRATION-CHECKLIST 更新 — `038-R1` row 從 active table 移為 footnote「038-R1 結案 via 051」+ `039-R1` 仍留 active + 051 milestone entry 加入已完成里程碑 + Current Focus 「現狀」+「下一步」反映 post-051 狀態 + CLAUDE.md SPECKIT marker idle。
- **SC-009**：Constitution Check post-fix — 5/5 PASS（Principle I/II/III/IV/V 皆無 violation；Principle II「業務寫入 + audit 同 txn」承諾從 violation → fulfillment 收斂）；`Complexity Tracking` 空白；0 Constitution amendment。
  > **驗證性質**：結構性 design-time gate、由 plan.md `Constitution Check` 段斷言；無 runtime task；對齊 050 / 049 / 046 spec-hygiene-pass 既有體例。

## Assumptions

- **dev stack 健康** — 13 service healthy（per 050 baseline、SOP hook verified）+ rust-api drainer 跑著（接 050 commit `bb5e470` + 050-N1 followup `5a8b717` merge 後狀態）。
- **rust-api worktree baseline** — `rev1-admin-rust-api` 分支 HEAD = `1a7ef2a`（050 落地 + rustls fix 後狀態）；Phase 1 驗 `cd rust-api && git rev-parse rev1-admin-rust-api` 為此 SHA、未退化。
- **0 Constitution amendment 需要** — Principle II「業務寫入 + audit 同 txn」NON-NEGOTIABLE 承諾為既有設計、本 fix 強化（消除 violation）、無需修文。對齊 brainstorm doc Section 5 Constitution Check 預期。
- **`CasbinRule::find/insert_many/delete_many` schema 對齊** — Sea-ORM entity `casbin_rule.rs` 與 sea-orm-adapter migration 共享 table；Phase 0 spike 1 hr 驗 cargo build pass + 簡單 round-trip（INSERT 1 row → SELECT → DELETE）。
- **Postgres `READ COMMITTED` isolation 足夠** — 不需 `SELECT ... FOR UPDATE` lock；並發 race 撞 unique constraint 走既有 Postgres conflict → AppError 路徑、後 commit caller rollback。Phase 0 spike 驗（多 caller 同 role+domain 同時 assign）。
- **既有 W-F11 pub-sub 體例不變** — `notify_casbin_changed()` 廣播 + `spawn_casbin_sync_subscriber` 重載 pattern 為既有設計（W-F11 落地、037 / 050 已重用）；本 fix 沿用、不擴範圍。
- **C-V3 fault injection technique** — test build 暫改 `audit_log::write_in_txn` 強制回 Err、acceptance 跑完後 revert；不留 test artefact 在 master commit；對齊 brainstorm doc Section 6 C-V3 設計。
- **2 handler callsite drop arg 影響為 contained** — `sys_authentication_api.rs:152` + `sys_system_manage_api.rs:554` 各 1 line 刪 enforcer arg；無第三 callsite（grep verified）。
- **無新 unit test 需要** — Constitution II 強化由 acceptance C-V3 fault injection 定性證明、wiring/shape feature 無新純函式邏輯（對齊 050 / 049 / 046 既有 acceptance-only via C-V 體例）。對齊 [`CLAUDE.md §3`](../../CLAUDE.md) TDD 紀律例外條款。
