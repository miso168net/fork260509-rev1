# Research: 052 wire-shape-leak-fix

**Phase**：0（Outline & Research）
**日期**：2026-05-26
**Spec**：[spec.md](./spec.md) FR-001~FR-010 + SC-001~SC-009

本 sprint 為軌道外 spec-impl-fix、無 NEEDS CLARIFICATION marker（per checklist 16/16 PASS）；Phase 0 為**對齊 040 D-pattern 既有體例**的 spike + 6 條 read-only fact 收集、為 implementer 提供準確基線。

---

## R-1. 040 D-pattern 既有體例 spike

### R-1.1 — Decision

新加 2 wire DTO (`OrganizationDetail` / `EndpointDetail`) 完全對齊 040 既有 sibling Detail pattern：
- 落點：`rust-api/server/model/src/admin/output/sys_*.rs`（與 sys_role.rs / sys_user.rs / sys_access_key.rs sibling）
- 結構：`pub struct *Detail { pub id: i64, ... }` + `#[serde(rename_all = "camelCase")]` derive
- transform：`impl From<sys_*::Model> for *Detail { id: m.display_id, ... }`
- handler wrap：`.map(*Detail::from)` for single result / `.map(|p| p.map(*Detail::from))` for paginated

### R-1.2 — Rationale

040 D 已立此 pattern、3 entity（sys_role/sys_user/sys_access_key）使用驗證 OK；本 sprint 補 sys_organization + sys_endpoint 對齊；minimum diff + maximum precedent reuse。

### R-1.3 — Alternatives considered

- **Min D：Model `#[serde(skip_serializing)]` on id + rename display_id → id**（拒、040 Q2 已駁回：會破壞 audit_log 等 internal serialize 路徑、Model 應保持 internal SoT 表示）
- **Drop D：raw endpoint 不動**（拒、CHECKLIST 039-R1 ⚠️ Critical、wire surface 不該重複 `id` + `displayId`）

### R-1.4 — Reference

既有 040 D-pattern 3 例：
- `RoleDetail` @ `rust-api/server/model/src/admin/output/sys_role.rs`（12 欄位、含 home_route_name）
- `UserDetail` @ `output/sys_user.rs`（13 欄位、不含 password）
- `AccessKeyDetail` @ `output/sys_access_key.rs`（7 欄位、不含 secret）

---

## R-2. SysOrganizationModel / SysEndpointModel schema 對齊

### R-2.1 — Decision

兩 entity Sea-ORM Model 已有 `display_id: i64` + `deleted_at: Option<DateTime>`、本 sprint 0 schema 改動、純 wire transform。

### R-2.2 — Rationale

039 migration 加 display_id 已完整覆蓋 sys_organization + sys_endpoint；本 sprint 只 consume display_id、不擴 schema。

### R-2.3 — `SysOrganizationModel` 欄位完整列舉

```rust
pub struct Model {
    pub id: String,           // ULID
    pub display_id: i64,      // 039 加
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub pid: String,          // parent ULID（org tree）
    pub status: Status,       // sea_orm_active_enums::Status
    pub created_at: DateTime,
    pub created_by: String,
    pub updated_at: Option<DateTime>,
    pub updated_by: Option<String>,
    pub deleted_at: Option<DateTime>,
}
```

`OrganizationDetail` 保留 10 欄位（drop `id` ULID + `deleted_at`）；`pid` 維持 String（per Assumption「org tree 結構、parent ULID」、長期由 org tree alignment sprint 處理）。

### R-2.4 — `SysEndpointModel` 欄位完整列舉

```rust
pub struct Model {
    pub id: String,           // ULID
    pub display_id: i64,      // 039 加
    pub path: String,
    pub method: String,
    pub action: String,
    pub resource: String,
    pub controller: String,
    pub summary: Option<String>,
    pub created_at: DateTime,
    pub updated_at: Option<DateTime>,
    pub deleted_at: Option<DateTime>,
}
```

`EndpointDetail` 保留 9 欄位（drop `id` ULID + `deleted_at`）；**沒有** `created_by` / `updated_by`（sys_endpoint Model 本身就無、本 sprint 不擴）。

### R-2.5 — Alternatives considered

- 動 Sea-ORM Model 加 `#[serde(skip)]` on `id` / `deleted_at`：040 Q2 已駁回（影響 internal serialize）
- 加新 schema migration：本 sprint 不必要（spec FR-008 明文）

---

## R-3. SystemManageRoleOutput + From impl 既備驗證

### R-3.1 — Decision

(b)(c) addRole/updateRole handler reuse 既成 `SystemManageRoleOutput` + `From<sys_role::Model>` impl、0 DTO 新增、handler 改 return type + `.map(SystemManageRoleOutput::from)` 即可。

### R-3.2 — Rationale

`output/sys_system_manage.rs` 內 `SystemManageRoleOutput` 已 i64-shape、`From<sys_role::Model>` impl 已備（grep 確認）、其他 systemManage handler（`get_role_for_systemmanage` 等）已用此 DTO；本 sprint reuse 不擴。

### R-3.3 — `SystemManageRoleOutput` 既有定義（grep 確認）

```rust
// rust-api/server/model/src/admin/output/sys_system_manage.rs
pub struct SystemManageRoleOutput {
    pub id: i64,                            // ← m.display_id
    pub role_name: String,                  // ← m.name
    pub role_code: String,                  // ← m.code
    pub role_desc: String,                  // ← m.description.unwrap_or_default()? 待 grep 驗證 impl
    pub status: String,                     // ← m.status.into() Status enum → String
    pub created_at: NaiveDateTime,
    pub created_by: String,
    pub updated_at: Option<NaiveDateTime>,
    pub updated_by: Option<String>,
}

impl From<sys_role::Model> for SystemManageRoleOutput { /* 既備 */ }
```

**注意點**：sys_role::Model 含 `home_route_name: Option<String>`（037 W-FW6 N2 加）、但 `SystemManageRoleOutput` 不含 — fix 後 addRole/updateRole response 也不含 homeRouteName（base-web role 編輯 modal 用 separate `getRoleHome` endpoint 取得、不依賴 addRole/updateRole 回 home）。

### R-3.4 — Alternatives considered

- 新加 `RoleDetail` 對齊 sibling pattern（拒、Q2 拍板 reuse 為 minimum diff）
- 擴 `SystemManageRoleOutput` 加 home_route_name（拒、scope creep、其他 systemManage handler 不需）

---

## R-4. PaginatedData<T> manual struct reconstruction 體例

### R-4.1 — Decision

`server_core::web::page::PaginatedData<T>` 為**純資料 struct**（無 `.map(F)` method）；040 D pattern 採 manual struct reconstruction 對 paginated rows 套 transform。

### R-4.2 — Rationale

`PaginatedData<T>` 定義（spike 確認）：
```rust
pub struct PaginatedData<T> {
    pub current: u64,
    pub size: u64,
    pub total: u64,
    pub records: Vec<T>,
}
```
不含 `impl<T> PaginatedData<T> { fn map<U, F>(self, f: F) -> PaginatedData<U> }` helper；040 sys_role/sys_user/sys_access_key paginated handler 全採 manual reconstruction（grep `get_paginated_roles` 確認）。

### R-4.3 — usage pattern (040 D5 既有)

```rust
// 既有 040 D5 pattern (rust-api/server/api/src/admin/sys_role_api.rs::get_paginated_roles)
service
    .find_paginated_roles(params)
    .await
    .map(|page| PaginatedData {
        current: page.current,
        size: page.size,
        total: page.total,
        records: page.records.into_iter().map(RoleDetail::from).collect(),
    })
    .map(Res::new_data)
```

本 sprint (a) `get_paginated_organizations` + (d) `get_paginated_endpoints` 套同 pattern。

### R-4.4 — Alternatives considered

- 加 `impl<T> PaginatedData<T> { fn map<U, F>(...)}` helper（拒、scope creep、本 sprint 軌道外 + 軌道紀律「reuse precedent without expanding」+ 既有 040 D5 已立 manual pattern、若改 helper 影響 3 handler regression）
- handler 改 fn signature 收 `service` 端做 transform（拒、wire transform 屬 handler 邊界職責、service 應保持 domain shape）

---

## R-5. base-web 0 binds 4 endpoint response shape 驗證

### R-5.1 — Decision

4 endpoint response shape 改變對 base-web 0 影響（compile / runtime）；wire DTO wrap 安全進行。

### R-5.2 — Rationale

brainstorm 階段 grep 確認：
- `fetchAddRole(...)` @ `base-web/src/service/api/system-manage.ts:28`：`return request({...})` — 無 generic type、response 為 unknown、base-web 自然不 bind shape
- `fetchUpdateRole(...)` @ same file line 37：同 pattern
- `GET /org` consumer：base-web 0 hit（grep `'/org'` / `/org/page` / `getPaginatedOrgan` 全空）
- `GET /endpoint/page` consumer：base-web 0 hit（grep `get_paginated_endpoints` / `getPaginatedEndpoints` / `/endpoint/page` 全空）

### R-5.3 — Acceptance plan

- C-V6 CDP smoke 涵蓋 base-web role-list 新增 + 編輯 modal regression（reassurance）
- C-V7 grep 0 hit boundary（rust-api source）
- 額外 sanity：base-web docker rebuild healthy（plan 階段 baseline check 驗）

### R-5.4 — Alternatives considered

- 不做 CDP smoke、純 curl + jq 驗（拒、Q3 拍板 + CDP smoke、防 040 critical bug 重演）
- 加 base-web typings 對齊 fetchAddRole/UpdateRole response type（拒、軌道外 feature、0 base-web 改動原則、登 follow-up 待 W-WEBUI / TS-Typing-Sync 軌道）

---

## R-6. CDP browser smoke 體例可用性

### R-6.1 — Decision

C-V6 採 CDP smoke 經 Edge :9229、對齊 037/038/040 既有體例；node global WebSocket 驅動、無 playwright 依賴。

### R-6.2 — Rationale

memory `reference_cdp_smoke_technique.md` 紀錄此 pattern 為本 workspace 既有 CDP smoke 體例；button 標籤「确认」（simplified Chinese、base-web 預設 lang zh-cn）；role 表格顯示 roleName / roleCode 對齊既有 column。

### R-6.3 — CDP smoke 概要

```
1. Launch Edge with --remote-debugging-port=9229
2. Navigate http://127.0.0.1:11080/system-manage/role
3. 登入 Soybean / 123456
4. 點「新增」按鈕
5. 填 roleName=CV6_R1 / roleCode=R_CV6_R1 / status=enabled
6. 點「确认」
7. assert role list table 含 CV6_R1
8. 點 CV6_R1 row「編輯」
9. 改 roleName 為 CV6_R1_EDITED
10. 點「确认」
11. assert toast 「修改成功」+ list row 反映新 name
12. cleanup: psql DELETE WHERE code='R_CV6_R1'
```

### R-6.4 — Fallback

若 CDP setup 失敗（pre-existing infra issue、e.g. :9229 binding error、Edge crash、WSL networking）：
- 登 follow-up C-V6-N1
- acceptance 走 C-V2~C-V5 + C-V7 結案（4 個 endpoint wire shape 仍 verifiable 經 curl + jq）
- 對齊 040 D 體例（CDP smoke defer 後 follow-up 補測）

### R-6.5 — Alternatives considered

- playwright（拒、引入新 dep、與既有 037/038 體例不對齊）
- 純 curl + jq、跳 CDP（拒、Q3 拍板「+ CDP smoke」）

---

## Research 完成檢核

| 項目 | 狀態 |
|---|---|
| 0 NEEDS CLARIFICATION marker | ✅（spec checklist 16/16 PASS、brainstorm Q1-Q3 已 user 拍板） |
| 040 D-pattern 對齊紀律 | ✅ R-1 |
| 2 新 entity Model schema 確認 | ✅ R-2 |
| SystemManageRoleOutput reuse 可行性 | ✅ R-3 |
| PaginatedData::map helper 既備 | ✅ R-4 |
| base-web 0 改動可行性 | ✅ R-5 |
| CDP smoke 體例可用 | ✅ R-6 |

ready for Phase 1 design + contracts。
