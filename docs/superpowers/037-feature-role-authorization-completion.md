# W-FW6 role-authorization-completion — brainstorm spec-design

**Feature 編號**：037（spec-kit 階段 A 起手取得 `specs/037-role-authorization-completion/`）
**短名**：`role-authorization-completion`
**軌道**：W-WEBUI follow-up（W-FW7 之後第三個；W-WEBUI follow-up 軌道收尾、唯獨 N1 button-auth 推遲為 W-FW8）
**Brainstorm 日期**：2026-05-23
**Source 整併項**（DESIGN-W-WEBUI §7.2 原規劃 4 項中的 3 項）：
- **W-FW4-N2**：role 首頁持久化（base-web menu-auth-modal 的 `home` 欄目前 stub、需 `sys_role` schema + 讀寫端點）
- **W-FW4-N3**：`assign_routes` audit gap（整個 sys_authorization_service 都無 audit、本 feature 一併補 `assign_users`）
- **W-FW3-N1**：role code 安全改名（W-FW3 採 transform-layer code-lock 過渡、本 feature 提供完整安全方案）

**範疇外（推遲）**：
- **W-FW4-N1**：button-auth modal 接通 —— 推遲為獨立 feature **W-FW8**，理由：rust-api 無「按鈕」model，至少 3 條候選路線（`sys_endpoint` + `assign_permission` API 權限 vs `sys_menu.buttons` W-FW7 剛持久化的 button 定義 vs 新增 `sys_role_button` 關聯表），需 Phase 0 research 設計新 RBAC 子系統，獨立排避免拖累 W-FW6 進度（W-FW4 brainstorm 已預警）。

**Authoritative parents**：
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」的**受管例外 — W-WEBUI 軌道**（v1.2.0，列舉含 `W-FW1`–`W-FW7`、准動範圍含「§4 授權下最小 UI 新增」）。
- [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §7.2 W-FW6 + §4 base-web 修改範圍邊界。
- W-FW3 `role-crud-wiring`（033，merge `729dbf9`）：本 feature N4 = W-FW3-N1 完整解；W-FW3 採 transform-layer code-lock 過渡，本 feature 以 rust 端安全機制取代並拿掉 code-lock。
- W-FW4 `role-authorization-wiring`（034，merge `ff5ea63`）：本 feature N2/N3 = W-FW4-N2/N3 補完；W-FW4 已接通 menu 授權主路徑（getRoleMenuIds + assignRoleMenus），本 feature 補完 home 持久化 + audit gap。

---

## 1. 範疇

W-WEBUI follow-up 軌道收尾 feature。把 W-FW3/W-FW4 過渡留下的 3 個關鍵 follow-up 一次補完：(N2) role 首頁從 hardcoded "home" 變成可持久化、可在 menu-auth-modal 設定；(N3) authorization service 補 audit；(N4) role code 改名安全機制（同步 Casbin policy）。完成後 W-WEBUI 軌道剩唯一 W-FW8 button-auth 待規劃。

| 子項 | deliverable |
|---|---|
| **N2 role home 持久化** | `sys_role` 加 `home_route_name VARCHAR NULL`、entity 同步、兩 systemManage alias 端點（getRoleHome / updateRoleHome、validation reject 不存在 active route_name）、base-web menu-auth-modal getHome/updateHome 接真 API、既有 role 全 null 向後相容。 |
| **N3 assign_routes/users audit gap** | sys_authorization_service.rs 的 `assign_routes` + `assign_users` 各補 `audit_log::write_in_txn`（單 event、whole-snapshot before/after、entity_type='sys_role'、operation=UPDATE）。**不**動 `assign_permission`（留 W-FW8 button-auth 用到時一併補）。 |
| **N4 role code 安全改名** | rust `update_role` detect code 變動時同步 `casbin_rule.v0`（policy + grouping 兩種 ptype 皆覆蓋）；拿掉 W-FW3 `update_role_for_systemmanage` 的 transform-layer code-lock（`code: existing.code` → `code: input.role_code`）；base-web drawer **不改**（drawer roleCode 維持 editable、user 改即生效、native 安全處理）。 |

### 範疇外

- ❌ **W-FW4-N1 button-auth**（推遲 W-FW8）—— 見開頭說明
- ❌ assign_permission audit（雖屬同類 pre-existing gap、但未透過 base-web 暴露、留 W-FW8 button-auth 用到時一併補）
- ❌ sys_role 其他 schema 變更（只加 home_route_name 一欄）
- ❌ 既有 role/menu/user CRUD 行為（W-FW3/W-FW4 已接、不重做）
- ❌ base-web `src/typings` 改動（home 欄走 service function 介面、不動型別宣告）
- ❌ nestjs fork 改動（DESIGN-B、nestjs 已退場）

---

## 2. Brainstorm 拍板紀錄（2026-05-23）

### Q1 — W-FW6 範疇取捨

**A：拆分 — W-FW6 = N2 + N3 + N4；N1 button-auth 另立 W-FW8**。考量 N1 包含 Phase 0 research 且可能需設計新 RBAC 子系統，獨立排避免拖累 W-FW6 進度。W-FW4 brainstorm 已預警「button-auth 的 Phase 0 research 結果若顯示工作量過大、得再行拆分」—— 本 brainstorm 在 explore 階段確認 rust-api 無 button model、最近候選有 3 條路線（sys_endpoint / sys_menu.buttons / 新表），語意對齊未決、本就應拆。

### Q2 — N2 home 欄型別

**A：`home_route_name VARCHAR nullable`**。存 menu 的 `route_name`（例如 `'home'` / `'manage_user'` / `'wfw7-test-menu'`），與 base-web vue-router 的 route name 一致、與 frontend 語意完全對齊（menu-auth-modal 現狀 hardcode `'home'` 就是這個鄰域的值）。否決 `home_menu_id INTEGER`（base-web menu-auth-modal home 選單現以 route_name 為 key、用 id 需多一層查表）與 `home_route_path VARCHAR`（與既有 menu-auth-modal home 選單用的 route_name 不一致、需手動轉換）。

### Q3 — N4 UX / 防護組合

**A：拿掉 W-FW3 transform-layer code-lock + base-web drawer 不改**。rust native `update_role` 安全處理 code 變更（同步 casbin_rule v0）、拿掉 W-FW3 `update_role_for_systemmanage` 的 code 截斷、base-web drawer 維持 roleCode editable。結果：user 能在 role-operate-drawer 直接改 roleCode、送出即生效（同步 casbin）。**0 base-web 改動**（同 W-FW7 慣例）、完整烏頭功能。否決 (drawer 改唯讀 + 拿掉 code-lock)（撞 §4 邊界、且後端能力反而被 UI 鎖住、矛盾）與 (只加 native safety net 保留 code-lock)（無 user-visible 變化、達不到 N4 原始目標）。

### Q4 — N3 audit 範圍

**A：assign_routes + assign_users**。補有 base-web endpoint expose 的兩個（W-FW6 主要 + F8 已 expose 的 assign_users）；assign_permission 留 W-FW8 button-auth 動到時一併補（YAGNI、避免 overbuild、目前無 base-web endpoint expose）。否決 (只補 assign_routes)（assign_users 同類 gap 留在同一檔、日後要再回來）與 (三個都補)（assign_permission 目前無 expose、本 feature 補 audit 是 overbuild）。

### Q5 — N2 端點 + validation

**A：兩端點 + reject 不存在 active route_name**。
- `GET /systemManage/getRoleHome/:roleId` → 回 envelope `{ code: 0, data: string | null }`
- `POST /systemManage/updateRoleHome` body `{ roleId, home: string | null }` → 回 `{ code: 0, data: true }`
- Validation: home 非 null 時 reject 不存在的 active route_name（查 `sys_menu` `find_active`、防 admin direct curl 寫入無效值、UI 端 NSelect 本就限 active menu）

否決 (寬鬆不 validation)（admin 可 curl 寫入無效值、frontend 導航會 404）與 (單端點合併在 getRoleList)（menu-auth-modal getHome 需改成讀 props.roleData 入參、不如獨立端點乾淨）。

### Q6 — N3 audit event 形狀

**A：單 event + whole-snapshot before/after**。一次 assign_routes/users call 寫 1 條 sys_operation_log row、entity_id = role_id、payload_before = `{ role_id, menu_ids/user_ids: [...existing] }`、payload_after = `{ role_id, menu_ids/user_ids: [...new] }`、operation=UPDATE。與既有 menu/role/user update audit pattern (audit_snapshot 整個 entity) 合乎同一慣例、查詢直觀。否決 (多 event)（noisy、reassemble 麻煩）與 (單 event diff)（要 reconstruct 全狀態需累積歷史 event、與既有 whole-snapshot 體例不一致）。

### 整體設計選擇（架構）

**整 1 feature vs 細分 3 sub-feature**（採 整 1 feature）。理由：(1) DESIGN-W-WEBUI §7.2 整併原則；(2) 3 子項都動 sys_role / sys_authorization 同範疇後端、共用 acceptance 驗收路徑（curl + psql + CDP）；(3) base-web 改動限於 menu-auth-modal home 段（N2）+ 0 其他、scope 緊湊；(4) 3 子項彼此無依賴、可平行實作再合 build。

---

## 3. 設計

### 3.1 N2 role home 持久化

#### DB Schema（migration）

新 schema migration `rust-api/migration/src/schemas/m20260524_a_wfw6_add_home_to_sys_role.rs`：

| 欄位 | 型別 | nullable | 預設 |
|---|---|---|---|
| `home_route_name` | `VARCHAR` | yes | `NULL` |

含對稱 down migration（`ALTER TABLE sys_role DROP COLUMN IF EXISTS home_route_name`）、register `migration/src/lib.rs` 末端。Casbin policy seed migration 另立（3 role × 2 endpoint = 6 row）。

#### Sea-ORM entity

`server/model/src/admin/entities/sys_role.rs` 加：
```rust
#[sea_orm(column_type = "Text", nullable)]
pub home_route_name: Option<String>,
```

#### Service

`server/service/src/admin/sys_role_service.rs` 新增兩 method：
- `get_role_home(&self, role_id: String) -> Result<Option<String>, AppError>`：fetch sys_role.home_route_name（含 soft-delete 過濾）
- `update_role_home(&self, role_id: String, home: Option<String>, actor: &Actor) -> Result<(), AppError>`：
  1. fetch before (full role)
  2. validation: home 非 None → check sys_menu find_active by route_name；不存在 → return RoleError::HomeRouteNotFound
  3. txn: ActiveModel update sys_role.home_route_name = Set(home.clone())
  4. audit_log::write_in_txn(operation=UPDATE, payload_before=audit_snapshot(&before), payload_after=audit_snapshot(&updated))

#### API handlers + input DTO

`server/model/src/admin/input/sys_role.rs` 加：
```rust
#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRoleHomeInput {
    pub role_id: String,
    pub home: Option<String>,  // None 為「清除 home」、Some 為設定
}
```

`server/api/src/admin/sys_system_manage_api.rs` 加：
- `get_role_home_for_systemmanage(Path(role_id), Extension(service))` → `Res<Option<String>>`
- `update_role_home_for_systemmanage(Extension(service), Extension(user), Json(input))` → `Res<bool>`

#### Router + Casbin seed

`server/api/src/router.rs`（或對等檔）註冊：
- `.route("/getRoleHome/:roleId", get(...))`
- `.route("/updateRoleHome", post(...))`

Casbin policy seed migration `migration/src/datas/m20260524_b_wfw6_role_home_alias_seed.rs`（3 role × 2 endpoint × method = 6 row）。

#### base-web 接線（§4 准動）

`base-web/src/service/api/system-manage.ts`：
```ts
export function fetchGetRoleHome(roleId: string) {
  return request<string | null>({ url: `/systemManage/getRoleHome/${roleId}` });
}
export function fetchUpdateRoleHome(data: { roleId: string; home: string | null }) {
  return request<boolean>({ url: '/systemManage/updateRoleHome', method: 'post', data });
}
```

`base-web/src/views/manage/role/modules/menu-auth-modal.vue`（已在 §4 准動清單）：
```ts
async function getHome() {
  const { data } = await fetchGetRoleHome(String(props.roleId));
  home.value = data ?? 'home';  // null fallback 'home' 為 UI 預設
}
async function updateHome(val: string) {
  const { error } = await fetchUpdateRoleHome({ roleId: String(props.roleId), home: val });
  if (!error) home.value = val;
}
```

### 3.2 N3 assign_routes/users audit gap

`server/service/src/admin/sys_authorization_service.rs`：

**assign_routes** body 內，在 txn `commit()` 前加：
```rust
audit_log::write_in_txn(&txn, AuditEvent {
    actor,
    operation: AuditOperation::Update,
    entity_type: "sys_role",
    entity_id: role_id.clone(),
    payload_before: Some(json!({ "role_id": &role_id, "menu_ids": &existing_route_ids })),
    payload_after: Some(json!({ "role_id": &role_id, "menu_ids": &route_ids })),
    description: None,
    source: AuditSource::Internal,
    request_id: None,
}).await?;
```

**assign_users** body 內同樣（payload_before/after `user_ids` 集合）。

**assign_permission** 不動（留 W-FW8）。

**Note**: trait signature 變動 —— assign_routes / assign_users 需新增 `actor: &Actor` 參數（既有 trait 簽名沒有）。callsite 改動：
- `sys_authorization_api.rs` 的 assign-routes / assign-users handler 傳入 `Actor::from(&user)`
- `sys_system_manage_api.rs` 的 assign_role_menus_for_systemmanage 同樣傳入

### 3.3 N4 role code 安全改名

#### rust update_role（`server/service/src/admin/sys_role_service.rs`）

在 update_role body 內，**txn commit 前**、ActiveModel update 之後、audit 之前加 code 變更檢查 + casbin policy 同步：

```rust
// 若 role.code 有變更, 同步 casbin_rule.v0
if before.code != input.role.code {
    let conn = txn.get_connection();  // or use raw SQL
    // 用 raw SQL 更新 casbin_rule, 覆蓋 p (policy) + g (grouping) 兩種 ptype
    conn.execute_unprepared(&format!(
        "UPDATE casbin_rule SET v0 = '{}' WHERE v0 = '{}' AND ptype IN ('p', 'g')",
        escape_sql(&input.role.code),
        escape_sql(&before.code),
    )).await?;
}
```

實際實作會用 prepared statement 或 sea-orm 的 query builder（避 SQL injection、且 escape_sql 不存在於 codebase）—— plan 階段細化。

#### rust update_role_for_systemmanage（`server/api/src/admin/sys_system_manage_api.rs`）

拿掉 W-FW3 transform-layer code-lock：
```rust
// W-FW3 過渡:
//   code: existing.code,  // ← 拿掉
// W-FW6 改回直送:
   code: input.role_code,
```

#### base-web

**0 改動**（drawer roleCode 維持 editable、user 改即生效）。

### 3.4 audit 全覆蓋確認（Constitution Principle II）

| 子項 | 變動範圍 | audit 路徑 |
|---|---|---|
| N2 update_role_home | sys_role.home_route_name | 新加 service method 內含 audit_log::write_in_txn |
| N3 assign_routes | sys_role_menu rows | 補 audit_log::write_in_txn |
| N3 assign_users | sys_user_role rows | 補 audit_log::write_in_txn |
| N4 update_role code | sys_role.code + casbin_rule.v0 | 既有 update_role audit 自動涵蓋 code 變更（audit_snapshot 對整 entity）；casbin_rule 同步為 side effect、若需單獨 audit casbin 變更可後續再加（本 feature 不做） |

### 3.5 Constitution 對齊

| Principle | 結論 |
|---|---|
| I RBAC Fail-safe | N4 拿掉 W-FW3 code-lock + 加 native casbin 同步：role code 改名後 Casbin policy 仍對齊（無 orphan）、enforcement 不退化。N2/N3 不改 auth 機制。 ✅ |
| II Audit | N3 補 audit gap、N2 update_role_home 走 audit_snapshot path、N4 既有 update_role audit 涵蓋 code 變更。assign_permission 留 W-FW8 補（YAGNI、目前無 expose）。 ✅ |
| III 單一進程 | rust 單 owner、無跨服務呼叫（Casbin 同步用 raw SQL 對 casbin_rule 表、同進程 enforcer reload 由 Casbin redis pub-sub 觸發 — W-F11 既有機制）。 ✅ |
| IV base 邊界 | W-WEBUI follow-up 軌道（v1.2.0 列舉含 W-FW6）、§4 受管例外；base-web 改動限 menu-auth-modal.vue + system-manage.ts ≤ 2 檔；不動 typings/router/store/i18n、不新增 UI render（只接 service function）。 ✅ |
| V 漸進收縮 | 0 nestjs；sys_role schema 加 1 欄 additive（home_route_name VARCHAR nullable）、向後相容、既有 role 全 null；casbin_rule 表結構不變（只 UPDATE 既有 row）。 ✅ |

---

## 4. Testing / Acceptance 概述

無新單元測試（wiring/schema 類 feature，比照 W-FW1~W-FW7；正確性由 acceptance 覆蓋）。C-V acceptance 矩陣的細節由 spec-kit `contracts/verification-commands.md` 階段撰寫；本檔僅列骨架（預估 ~18-22 項）：

- **C-V build / migration**：rust-api image build、dev stack `up -d --wait`、新 schema migration（home_route_name 加 1 欄）+ Casbin seed migration（6 row）套用乾淨、down migration 對稱可回退。
- **C-V N2 寫入 + 讀回**：
  - curl `GET /api/systemManage/getRoleHome/:roleId` 對既有 role 回 null（向後相容）
  - curl `POST /api/systemManage/updateRoleHome` 帶 home='home' / 'manage_user' → envelope 0；getRoleHome round-trip 回真值；psql sys_role.home_route_name 持久化
  - curl updateRoleHome 帶 home=null → 寫 NULL（明示清除）
  - curl updateRoleHome 帶 home='xyz-not-exist' → reject envelope 非 0（validation）
  - curl updateRoleHome 帶 home=existing soft-deleted route_name → reject（validation 過 find_active）
- **C-V N3 audit**：
  - curl assignRoleMenus（W-FW4 既有 path）→ psql sys_operation_log 新增 1 row：operation=UPDATE, entity_type=sys_role, entity_id=role_id, payload_before/after.menu_ids 集合差異正確
  - curl assignUsersToRole（F8 既有 path）→ psql 同樣驗 user_ids 集合差異
- **C-V N4 role code 改名**：
  - curl `POST /api/systemManage/updateRole` 改 roleCode（例如 R_TEST → R_TEST_RENAMED）→ envelope 0；psql sys_role.code 變；psql casbin_rule WHERE v0='R_TEST_RENAMED' 數量 > 0、WHERE v0='R_TEST' 數量 = 0
  - 改 code 後驗 enforcement 仍生效：該 role user 仍能訪問既有授權 endpoint
  - 對既有 ROLE_SUPER / ROLE_ADMIN 等 system role 改 code 應該也照規則同步（不需特殊處理）
- **C-V CDP**：
  - `/manage/role`：開 menu-auth-modal、home 選單預填正確（既有 role 為預設 'home'、改過 home 的 role 為實際值）、改 home 送出 → 重開預填一致
  - `/manage/role`：開 role-operate-drawer、改 roleCode 送出 → 列表反映新 roleCode、policy enforcement 仍生效
- **C-V regression**：
  - menu-auth-modal 既有菜單授權 path（getRoleMenuIds + assignRoleMenus）行為不變
  - role CRUD 既有 path（addRole / deleteRole / batchDeleteRole）行為不變
  - user CRUD（W-FW1 / W-FW5）行為不變
  - assign_users（F8）行為不變、audit 新增不影響行為
- **C-V scope diff**：
  - rust-api 改動 ~12 處
  - base-web 改動 ≤ 2 檔（menu-auth-modal.vue + system-manage.ts）
  - sys_role schema 僅 home_route_name 1 欄擴充、其他表 0 變更
  - 0 nestjs、0 typings

---

## 5. 給 `/speckit-specify` 的提示

本檔作為 `/speckit-specify` 的輸入產出 `specs/037-role-authorization-completion/spec.md`。需被帶上的關鍵點：

- 範疇與範疇外（§1）—— 特別 N1 button-auth 推遲 W-FW8、assign_permission 不在 N3 範圍。
- 6 個 brainstorm 拍板（§2 Q1-Q6）—— spec.md `## Clarifications` 段。
- Constitution v1.2.0 W-WEBUI 軌道受管例外（含 W-FW6）—— Authoritative parents。
- W-FW3 / W-FW4 父 feature merge SHA（W-FW3=`729dbf9`、W-FW4=`ff5ea63`）—— inbound dependency。
- 3 子項各自的 deliverable（§3.1/§3.2/§3.3）作為 spec User Stories（3 個 US，可獨立交付）：
  - US1 N2 role home 持久化（P1 MVP，最大範圍）
  - US2 N3 audit gap（P2，純後端、無 UI 影響）
  - US3 N4 role code 安全改名（P2，與 US2 同 priority）
- Casbin policy seed migration 6 row（3 role × 2 endpoint）—— spec.md Functional Requirements。
- assign_routes / assign_users trait signature 加 `actor: &Actor` 參數 + callsite 改動（~3 處 handler）—— spec.md 後端元件清單。

`/speckit-plan` Phase 0 research 需處理：
- (R-Q1) casbin_rule UPDATE 在 transaction 內的並發安全（W-F11 多 replica + redis pub-sub 場景下 Casbin enforcer reload 時機）。
- (R-Q2) audit_snapshot 對 `Vec<i32>` / `Vec<String>` 集合的 serialize 體例（既有有無 precedent？）— W-FW5 assign_roles_to_user 是否有類似 audit？查 sys_user_service.rs。
- (R-Q3) home_route_name validation 對 `constant=true` menu 的處理（home 設定為 constant menu 的 route_name 是否合理？例如 'login' / '403' / '404'）—— spec 應排除這些。

---

**brainstorm 完成 → 下一步 `/speckit-specify`，input = 本檔。**
