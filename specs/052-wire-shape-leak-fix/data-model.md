# Data Model: 052 wire-shape-leak-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-26

052 為 wire shape 對齊 impl fix、**無 application data entity 改動**（0 schema migration、0 entity 改、0 base-web src/ diff、0 新 column）。本檔以「rust-api 8 file 改動 diff」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

涉及既有 entity（read/write but not modified）：
- `sys_organization` (entities/sys_organization.rs)：本 fix 對 Model 套 `OrganizationDetail::from` wire transform、Model schema 不變
- `sys_endpoint` (entities/sys_endpoint.rs)：本 fix 套 `EndpointDetail::from`、Model schema 不變
- `sys_role` (entities/sys_role.rs)：本 fix 套既成 `SystemManageRoleOutput::from`、Model schema 不變

---

## E1. `rust-api/server/model/src/admin/output/sys_organization.rs`（**新檔**、per FR-005）

### E1.1 — 完整 source（對齊 040 D1 RoleDetail 體例）

```rust
//! 052 wire-shape-leak-fix D-pattern extension: raw endpoint output wire DTO for sys_organization.
//! 隔離 Sea-ORM Model（internal SoT、`id: ULID` + `display_id: i64` + `deleted_at`）與 wire 表示。
//! Sea-ORM Model 不動、本 DTO 為 wire-shape 包裝；wire 上 `id: i64`、無 `displayId` 重複欄、無 `deletedAt`。

use chrono::NaiveDateTime;
use serde::Serialize;

use crate::admin::entities::{sea_orm_active_enums::Status, sys_organization};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationDetail {
    pub id: i64,
    pub pid: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub status: Status,
    pub created_at: NaiveDateTime,
    pub created_by: String,
    pub updated_at: Option<NaiveDateTime>,
    pub updated_by: Option<String>,
}

impl From<sys_organization::Model> for OrganizationDetail {
    fn from(m: sys_organization::Model) -> Self {
        Self {
            id: m.display_id,
            pid: m.pid,
            code: m.code,
            name: m.name,
            description: m.description,
            status: m.status,
            created_at: m.created_at,
            created_by: m.created_by,
            updated_at: m.updated_at,
            updated_by: m.updated_by,
        }
    }
}
```

**Diff**：+35 line（新檔）

**故意 drop** 2 欄位：`sys_organization::Model::id`（ULID string、internal SoT）+ `deleted_at`（soft-delete forensics 屬 internal、不上 wire）

---

## E2. `rust-api/server/model/src/admin/output/sys_endpoint.rs`（**既有檔**、加 EndpointDetail per FR-006）

### E2.1 — 既有檔結構

已含 `EndpointTree` + `EndpointTreeNode` 2 struct（W-FW8 US1 用、layer route tree wire shape）；本 sprint 在尾端追加 `EndpointDetail`、imports 加 chrono::NaiveDateTime + entities::sys_endpoint。

**imports diff**：
```rust
// 既有
use serde::Serialize;

// 加（本 sprint）
use chrono::NaiveDateTime;
use crate::admin::entities::sys_endpoint;
```

### E2.2 — 追加 EndpointDetail struct + From impl

```rust
//! 052 wire-shape-leak-fix D-pattern extension: raw endpoint output wire DTO for sys_endpoint (paginated).
//! 隔離 Sea-ORM Model 與 wire 表示；wire 上 `id: i64`、無 `displayId` 重複欄、無 `deletedAt`。

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointDetail {
    pub id: i64,
    pub path: String,
    pub method: String,
    pub action: String,
    pub resource: String,
    pub controller: String,
    pub summary: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: Option<NaiveDateTime>,
}

impl From<sys_endpoint::Model> for EndpointDetail {
    fn from(m: sys_endpoint::Model) -> Self {
        Self {
            id: m.display_id,
            path: m.path,
            method: m.method,
            action: m.action,
            resource: m.resource,
            controller: m.controller,
            summary: m.summary,
            created_at: m.created_at,
            updated_at: m.updated_at,
        }
    }
}
```

**Diff**：+30 line（既有檔尾端追加）

**注意**：sys_endpoint::Model 本身就無 `created_by` / `updated_by`（與其他 sys_* 不同、設計時 endpoint catalog 為 system seed、不追作者）；EndpointDetail 隨之省這 2 欄。

**故意 drop**：`sys_endpoint::Model::id`（ULID）+ `deleted_at`

---

## E3. `rust-api/server/model/src/admin/output/mod.rs`（per FR-007）

### E3.1 — 既有結構（spike 確認）

```rust
pub use sys_access_key::AccessKeyDetail;
pub use sys_authentication::{AuthOutput, UserInfoOutput, UserRoute};
pub use sys_domain::DomainOutput;
pub use sys_endpoint::{EndpointTree, EndpointTreeNode};
pub use sys_menu::{MenuRoute, MenuTree, RouteMeta};
pub use sys_role::RoleDetail;
pub use sys_system_manage::{
    SystemManageAllRoleOutput, SystemManageMenuOutput, SystemManageMenuTreeNodeOutput,
    SystemManageRoleOutput, SystemManageUserOutput,
};
pub use sys_user::{UserDetail, UserWithDomainAndOrgOutput, UserWithoutPassword};

mod sys_access_key;
mod sys_authentication;
mod sys_domain;
mod sys_endpoint;
mod sys_menu;
mod sys_role;
pub mod sys_system_manage;
mod sys_user;
```

### E3.2 — 本 sprint 改動 2 處

**(a) 改 `pub use sys_endpoint::{...}` 行加 `EndpointDetail`**：
```rust
// BEFORE
pub use sys_endpoint::{EndpointTree, EndpointTreeNode};
// AFTER
pub use sys_endpoint::{EndpointDetail, EndpointTree, EndpointTreeNode};
```

**(b) 加 2 行對 sys_organization**：
```rust
// 加 pub use line（按字母順排在 sys_menu 後 / sys_role 前）
pub use sys_organization::OrganizationDetail;

// 加 mod line（按字母順排在 sys_menu 後 / sys_role 前）
mod sys_organization;
```

**Diff**：+2 line（1 modify + 2 add - 1 unchanged）

---

## E4. `rust-api/server/service/src/admin/mod.rs`（per FR-007、0 改動）

### E4.1 — 既有 wildcard re-export

```rust
pub use server_model::admin::{
    entities::{ ... },
    facade::{ ... },
    input::*,
    output::*,       // ← 自動暴露 output/mod.rs 內所有 pub use 的 type
};
```

`output::*` 已涵蓋 `RoleDetail` / `UserDetail` / `AccessKeyDetail` 等 040 加的 DTO；本 sprint 在 output/mod.rs 加 `EndpointDetail` + `OrganizationDetail` 後、自動經此 wildcard 暴露為 `server_service::admin::EndpointDetail` + `server_service::admin::OrganizationDetail`。

**Diff**：0 line（不動 service/admin/mod.rs）

---

## E5. `rust-api/server/api/src/admin/sys_organization_api.rs::get_paginated_organizations`（per FR-001）

### E5.1 — 既有 handler

```rust
use server_service::admin::{
    OrganizationPageRequest, SysOrganizationModel, SysOrganizationService, TOrganizationService,
};
// ...

pub async fn get_paginated_organizations(
    Query(params): Query<OrganizationPageRequest>,
    Extension(service): Extension<Arc<SysOrganizationService>>,
) -> Result<Res<PaginatedData<SysOrganizationModel>>, AppError> {
    service
        .find_paginated_organizations(params)
        .await
        .map(Res::new_data)
}
```

### E5.2 — 改寫

```rust
use server_service::admin::{
    OrganizationDetail, OrganizationPageRequest, SysOrganizationModel,  // ← 加 OrganizationDetail
    SysOrganizationService, TOrganizationService,
};
// ...

pub async fn get_paginated_organizations(
    Query(params): Query<OrganizationPageRequest>,
    Extension(service): Extension<Arc<SysOrganizationService>>,
) -> Result<Res<PaginatedData<OrganizationDetail>>, AppError> {   // ← was SysOrganizationModel
    service
        .find_paginated_organizations(params)
        .await
        .map(|page| PaginatedData {
            current: page.current,
            size: page.size,
            total: page.total,
            records: page.records.into_iter().map(OrganizationDetail::from).collect(),
        })
        .map(Res::new_data)
}
```

**Diff**：~+7 line / -1 line = net +6 line（imports + return type + body reconstruction）

注意：`SysOrganizationModel` import 可保留（若該 file 有其他 handler 用、否則清掉、cargo clippy 會 warn）；spike 時驗 import 是否仍需。

---

## E6. `rust-api/server/api/src/admin/sys_endpoint_api.rs::get_paginated_endpoints`（per FR-004）

### E6.1 — 既有 handler

```rust
pub async fn get_paginated_endpoints(
    Query(params): Query<EndpointPageRequest>,
    Extension(service): Extension<Arc<SysEndpointService>>,
) -> Result<Res<PaginatedData<SysEndpointModel>>, AppError> {
    service
        .find_paginated_endpoints(params)
        .await
        .map(Res::new_data)
}
```

### E6.2 — 改寫（同 E5 pattern）

```rust
pub async fn get_paginated_endpoints(
    Query(params): Query<EndpointPageRequest>,
    Extension(service): Extension<Arc<SysEndpointService>>,
) -> Result<Res<PaginatedData<EndpointDetail>>, AppError> {   // ← was SysEndpointModel
    service
        .find_paginated_endpoints(params)
        .await
        .map(|page| PaginatedData {
            current: page.current,
            size: page.size,
            total: page.total,
            records: page.records.into_iter().map(EndpointDetail::from).collect(),
        })
        .map(Res::new_data)
}
```

imports 加 `EndpointDetail`、保留既有 imports（spike 驗 SysEndpointModel 是否仍需）。

**Diff**：~+7 line / -1 line = net +6 line

---

## E7. `rust-api/server/api/src/admin/sys_system_manage_api.rs::add_role_for_systemmanage`（per FR-002）

### E7.1 — 既有 handler

```rust
pub async fn add_role_for_systemmanage(
    Extension(service): Extension<Arc<SysRoleService>>,
    Extension(user): Extension<User>,
    Json(input): Json<SystemManageAddRoleInput>,
) -> Result<Res<SysRoleModel>, AppError> {
    let actor = Actor::from(&user);
    let create_input = CreateRoleInput {
        pid: "0".to_string(),
        code: input.role_code,
        name: input.role_name,
        status: map_status(&input.status)?,
        description: input.role_desc,
    };
    service.create_role(create_input, &actor).await.map(Res::new_data)
}
```

### E7.2 — 改寫

```rust
pub async fn add_role_for_systemmanage(
    Extension(service): Extension<Arc<SysRoleService>>,
    Extension(user): Extension<User>,
    Json(input): Json<SystemManageAddRoleInput>,
) -> Result<Res<SystemManageRoleOutput>, AppError> {   // ← was SysRoleModel
    let actor = Actor::from(&user);
    let create_input = CreateRoleInput {
        pid: "0".to_string(),
        code: input.role_code,
        name: input.role_name,
        status: map_status(&input.status)?,
        description: input.role_desc,
    };
    service
        .create_role(create_input, &actor)
        .await
        .map(SystemManageRoleOutput::from)   // ← 加 .map
        .map(Res::new_data)
}
```

`SystemManageRoleOutput` 應已 in scope（同 file 內其他 handler 已用、否則 imports 確認）。

**Diff**：~+2 line / -1 line = net +1 line

---

## E8. `rust-api/server/api/src/admin/sys_system_manage_api.rs::update_role_for_systemmanage`（per FR-003）

### E8.1 — 改寫（同 E7 pattern）

```rust
pub async fn update_role_for_systemmanage(
    Extension(service): Extension<Arc<SysRoleService>>,
    Extension(user): Extension<User>,
    Json(input): Json<SystemManageUpdateRoleInput>,
) -> Result<Res<SystemManageRoleOutput>, AppError> {   // ← was SysRoleModel
    let actor = Actor::from(&user);
    let role_ulid = service.lookup_ulid_by_display_id(input.id).await?;
    let existing = service.get_role(&role_ulid).await?;
    let update_input = UpdateRoleInput {
        id: input.id,
        role: RoleInput {
            pid: existing.pid,
            code: input.role_code,
            name: input.role_name,
            status: map_status(&input.status)?,
            description: input.role_desc,
        },
    };
    service
        .update_role(&role_ulid, update_input, &actor)
        .await
        .map(SystemManageRoleOutput::from)   // ← 加 .map
        .map(Res::new_data)
}
```

**Diff**：~+1 line / -1 line = net 0 line（return type 改 + .map 加、原 `.await` 後沒 `.map` 加 1 行）

---

## E9. INTEGRATION-CHECKLIST cleanup（per FR-010）

### E9.1 — 衍生 follow-up table 移除 039-R1 row

per spec.md FR-010(a)：將 `039-R1` ⚠️ Critical row 從 INTEGRATION-CHECKLIST 「衍生 follow-up」table 移除、改為 footnote「039-R1 結案 via 052」格式。

預期 footnote（per 051 體例）：

```markdown
> **039-R1 結案（052 wire-shape-leak-fix 落地、2026-05-26）**：post-merge code review 衍生 R-row 039-R1 ⚠️ Critical 已於 052 sprint 結案：
> - 4 endpoint (a) GET /org / (b) POST /systemManage/addRole / (c) POST /systemManage/updateRole / (d) GET /endpoint/page raw entity Model wire shape leak 補齊 wire DTO wrap（接 040 W-FW9 D 體例）：(a)(d) 新加 OrganizationDetail / EndpointDetail @ output/sys_*.rs（sibling Detail pattern）+ (b)(c) reuse 既成 SystemManageRoleOutput；handler return type + .map(Detail::from) + PaginatedData manual struct reconstruction；C-V2~C-V7 全 PASS（含 C-V6 CDP browser smoke base-web role-list 新增 + 編輯 modal regression）
```

### E9.2 — 已完成里程碑加 052 entry

格式對齊 051 / 050 / 049 / 048 體例（單 row、SHA placeholder 留 T021 SHA backfill）：

```markdown
- [x] **052 wire-shape-leak-fix** ✅（2026-05-26 完成；outer `<OUTER_SHA>` + merge `<MERGE_SHA>`、rust-api `<RUST_API_SHA>`、base-web 0 改動；spec `specs/052-wire-shape-leak-fix/`）— 039-R1 ⚠️ Critical 結案 dedicated sprint：4 endpoint raw entity Model wire shape leak 補齊（接 040 W-FW9 D 體例）；(a)(d) 新加 OrganizationDetail / EndpointDetail @ output/sys_*.rs（sibling Detail pattern、id=display_id i64、不含 ULID id + deleted_at）+ (b)(c) systemManage handler reuse 既成 SystemManageRoleOutput（minimum diff aligned with precedent、0 DTO 新增）+ output/mod.rs 加 2 mod + 2 pub use selective re-export（service/admin/mod.rs `output::*` wildcard 自動暴露）；軌道**外** feature、0 base-web 改動、0 schema migration、0 新 entity、0 新 endpoint、0 新 workspace cargo dep、0 Constitution amendment（純 wire 收斂、無新原則）；C-V1~C-V7 全 PASS（含 C-V6 CDP browser smoke base-web role-list 新增 + 編輯 modal regression、無 console error）；連帶 R-row 0 條 Critical 留 dedicated sprint（039-R1 為最後一條 Critical follow-up、本 sprint 結案後 backlog 進入「條件觸發 4 條 + 長期 3 段」狀態）
```

### E9.3 — Current Focus update

**現狀** 段尾加 052 sprint：
```markdown
... 050 spec-hygiene-pass-4 落地 + **051 assign-permission-atomicity-fix（038-R1 結案）+ 052 wire-shape-leak-fix（039-R1 結案）落地** —— 052 = 039-R1 ⚠️ Critical 結案 dedicated sprint（如 E9.2 entry 描述）。**Critical dedicated sprint backlog 全清**、剩條件觸發 + 長期 follow-up。
```

**Active feature**：—（052 已完成、見已完成里程碑）

**下一步** update：
```markdown
**下一步**（user 2026-05-25 拍板 5 階段順序前 5 階段全部交付 + 051 + 052 dedicated sprint Critical 全清、剩條件觸發 4 條 + 長期 3 段）：
1. ~~dedicated sprint（Critical、需排）：~~ ✅ **全清**（038-R1 由 051 結案、039-R1 由 052 結案）
2. 條件觸發：042-N4 / 042-N5 / 048-N1 (d) / 050-N1 各自獨立（trigger driven）
3. 長期：F1.2 / W-F6b / W-F15/16 各自獨立
```

### E9.4 — CLAUDE.md SPECKIT marker idle

```markdown
<!-- SPECKIT START -->
**Active Spec**: —
**Active Plan**: —
**Phase**: idle
**下一步**: dedicated sprint Critical 全清；條件觸發 follow-up backlog（042-N4 / 042-N5 / 048-N1 (d) / 050-N1 各自獨立）+ 長期（F1.2 / W-F6b / W-F15/16）
<!-- SPECKIT END -->
```

### E9.5 — Phase 3 cleanup 總計

| File | Operation | est line diff |
|---|---|---|
| `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up table | -1 row（039-R1）+ footnote ~4 line | ~+3 line |
| `docs/INTEGRATION-CHECKLIST.md` 已完成里程碑 | +052 entry | +1 line |
| `docs/INTEGRATION-CHECKLIST.md` Current Focus | 現狀 + 下一步 update | ~+5 line |
| `CLAUDE.md` SPECKIT marker | idle | refresh 4 line |
| **小計** | | **~+10 line（淨）**|

---

## E10. file:line diff summary table

| Phase | item | file | 改動 |
|---|---|---|---|
| Phase 1 (rust-api) | OrganizationDetail 新加 | `rust-api/server/model/src/admin/output/sys_organization.rs`（新檔）| +~35 line |
| Phase 1 | EndpointDetail 加（既有檔尾端） | `rust-api/server/model/src/admin/output/sys_endpoint.rs` | +~30 line |
| Phase 1 | output/mod.rs 加 2 mod + 改 1 pub use | `rust-api/server/model/src/admin/output/mod.rs` | +3 / -1 = net +2 |
| Phase 1 | get_paginated_organizations 改寫 | `rust-api/server/api/src/admin/sys_organization_api.rs:12` | +~7 / -1 = net +6 |
| Phase 1 | get_paginated_endpoints 改寫 | `rust-api/server/api/src/admin/sys_endpoint_api.rs:16` | +~7 / -1 = net +6 |
| Phase 1 | add_role_for_systemmanage 改 return + .map | `rust-api/server/api/src/admin/sys_system_manage_api.rs:285` | +~2 / -1 = net +1 |
| Phase 1 | update_role_for_systemmanage 改 return + .map | `rust-api/server/api/src/admin/sys_system_manage_api.rs:305` | +~1 / -1 = net 0 |
| Phase 3 (Polish) | INTEGRATION-CHECKLIST 039-R1 結案 + 052 entry + Current Focus | `docs/INTEGRATION-CHECKLIST.md` 多處 | ~+9 line（淨） |
| Phase 3 | SPECKIT marker idle | `CLAUDE.md` SPECKIT 區段 | refresh |

**改動總計**：~+80 line rust-api + ~+10 line outer = **net ~+90 line**（主要為 2 新 DTO struct + From impl + handler transform）跨 9 file（4 rust-api source handler + 2 rust-api output DTO + 1 output mod + 1 INTEGRATION-CHECKLIST + 1 CLAUDE.md）。

> **注意**：本 sprint commit shape 為 rust-api 8 file bundled 1 commit（4 handler + 2 DTO + 1 output/mod.rs = 8 file，service/admin/mod.rs 0 改動不算）；outer 3 commit（SHA pin + INTEGRATION-CHECKLIST/CLAUDE.md + SHA backfill）。

---

## E11. Out-of-scope（052 不做、但相關）

- ❌ 其他 sys_* entity 的 wire shape audit（若 plan grep 發現新漏 → follow-up、本 sprint 不包；per brainstorm Q1 拍板）
- ❌ Sea-ORM Model 改動（internal SoT 保留、per FR-008）
- ❌ base-web typings / src/ 改動（軌道外、0 改動、per FR-008）
- ❌ 新 schema migration / 新 entity / 新 endpoint / 新 cargo dep（per FR-008）
- ❌ Constitution amendment（per FR-008）
- ❌ audit_log path 改動 / Casbin policy 改動（per FR-008）
- ❌ input DTO 改動（rust 端、039 T030.5 已完）
- ❌ 加 `impl<T> PaginatedData<T> { fn map<U, F>(...)}` helper（per R-4 拒、本 sprint 沿用 manual reconstruction）
- ❌ 擴 `SystemManageRoleOutput` 加 home_route_name（per R-3 拒、scope creep）
- ❌ org tree base-web 端 pid string→i64 對齊（per spec Assumptions、屬長期、不本 sprint）
- ❌ 條件觸發 follow-up（042-N4 / 042-N5 / 048-N1 (d) / 050-N1）
- ❌ 長期 follow-up（F1.2 / W-F6b / W-F15/16）
