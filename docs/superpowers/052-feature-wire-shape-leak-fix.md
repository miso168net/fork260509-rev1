# 052 wire-shape-leak-fix — brainstorm 設計

**日期**：2026-05-26
**Feature**：`052-wire-shape-leak-fix`（039-R1 ⚠️ Critical 結案 dedicated sprint）
**前置**：
- 039 `rust-entity-id-numeric-migration`（merge `e53581b`）：5 業務 entity 加 `display_id BIGINT UNIQUE NOT NULL`、Snowflake 41/5/7 = 53bit、API output i64 / input DTO i64→ULID cascade
- 040 `wire-id-consistency`（merge `34dc03d`、W-FW9）：D 段為 sys_role / sys_user / sys_access_key 3 entity 加 `RoleDetail` / `UserDetail` / `AccessKeyDetail` wire DTO、handler `.map(Detail::from)` wrap
- 051 `assign-permission-atomicity-fix`（merge `fc56f97`、038-R1 結案）：post-merge code review backlog 順序消化、preceding dedicated sprint
- post-merge code review (2026-05-25) 發現 039-R1：4 endpoint 仍 leak raw entity Model `id: ULID-string`、040 D 漏掉

---

## 1. 觸發背景

040 D 修了 sys_role / sys_user / sys_access_key 3 個 raw endpoint，但**漏 4 個**：

| Endpoint | 現況 return | 問題 |
|---|---|---|
| (a) `GET /org` (`sys_organization_api.rs:12`) | `Res<PaginatedData<SysOrganizationModel>>` | 整 Model serialize、含 `id: ULID-string` + `display_id: i64` 雙欄、`deleted_at` 也漏到 wire |
| (b) `POST /systemManage/addRole` (`sys_system_manage_api.rs:285`) | `Res<SysRoleModel>` | 整 Model serialize、同問題；systemManage 其他 handler 已用 `SystemManageRoleOutput` 但 addRole 漏 |
| (c) `POST /systemManage/updateRole` (`sys_system_manage_api.rs:305`) | `Res<SysRoleModel>` | 同 (b) |
| (d) `GET /endpoint/page` (`sys_endpoint_api.rs:16`) | `Res<PaginatedData<SysEndpointModel>>` | 同 (a)、含 `deleted_at` 等 internal 欄位 |

**Why critical**：wire shape 不一致是 forensics chain / contract surface 缺口；base-web 0 binds 這 4 個 response shape（FE TS compile-gate 不觸發）、但 wire 對任何 admin tool / 第三方 consumer 都暴露 internal SoT，違反「rust internal SoT 表示 ≠ wire shape」紀律（039 X1 雙欄設計核心）。

040 W-FW9 D Q2 拍板「Full D wire DTO wrap」+ 「Model 應保持 internal SoT 表示」，本 sprint 完成 D 範圍。

---

## 2. 範圍與 Constitution 處理

### 2.1 scope（Q1 拍板：縮在 CHECKLIST 4 個）

- ✅ 4 endpoint wire DTO wrap（per Section 3 detail）
- ❌ **不**做 full sweep audit（其他 sys_* entity 的 GET/POST handler 不在 039-R1 範圍、若 plan 階段 grep 發現新漏 → 登 follow-up、不本 sprint 包）
- ❌ **不**動 internal SoT（Sea-ORM Model 0 改動、audit_log payload + JWT claim + Casbin policy + FK schema 0 改動、與 039 X1 設計一致）
- ❌ **不**動 base-web（軌道**外** feature；4 endpoint base-web 0 binds response shape）

### 2.2 Constitution Check 預期

`v1.6.0` 5 Principle 全 PASS（軌道**外**、wire 收斂、無新原則）：

| Principle | 評估 |
|---|---|
| I RBAC Fail-safe | 0 動 Casbin enforcement / RBAC 邏輯 → ✅ PASS |
| II Soft Delete + Audit Log | 0 動 audit_log path（wire 收斂、internal SoT 保留）→ ✅ PASS |
| III 嚴版禁 Forward + 單一職責 | 0 跨服務 HTTP、0 新 endpoint → ✅ PASS |
| IV base 不改動邊界 | 軌道**外**（無 W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene 範圍 file）→ ✅ PASS |
| V 漸進收縮 DESIGN-A → DESIGN-B | 0 nestjs、純 rust-api wire DTO → ✅ PASS |

0 Constitution amendment、`Complexity Tracking` 空白。

---

## 3. 拍板問題 (3 Q)

### Q1 — scope 取捨（2026-05-26 拍板）

**用戶問**：CHECKLIST 勾勒 4 endpoint，要縮在 4 還是 grep audit 拾 full sweep？

**答**：**縮在 4 個（⚡ minimum）**。其餘 entity 漏 wire 收斂屬 spec-hygiene 軌道、若 plan grep 發現新漏登 follow-up、本 sprint 不包。

**Rationale**：sprint 紀律 = bounded scope。040 已立 D pattern、本 sprint 補 040 漏點即可、broader audit 不對齊「dedicated sprint Critical 結案」定位。

### Q2 — DTO 命名紀律（2026-05-26 拍板）

**用戶問**：4 endpoint 跨 raw API + systemManage 兩 namespace，如何對齊？

**答**：**混合策略**：
- (a) `/org` + (d) `/endpoint/page` → raw API namespace → **新加** `OrganizationDetail` / `EndpointDetail`（對齊 040 sibling Detail pattern）
- (b) addRole + (c) updateRole → systemManage namespace → **複用既有** `SystemManageRoleOutput`（已 i64、`From<sys_role::Model>` 既備、`get_role_for_systemmanage` 等已用）

**Rationale**：minimum diff aligned with precedent。systemManage 已有 i64-shape Output、再造一個 `RoleDetail` 是重複 DTO。raw API 走 sibling Detail 對齊 040 體例。

### Q3 — acceptance 深度（2026-05-26 拍板）

**用戶問**：base-web 0 binds response shape、curl 即足，要不要加 CDP smoke？

**答**：**+ CDP browser smoke**（C-V6）。

**Rationale**：040 D 因 CDP smoke defer 漏看 critical body roleId String/number bug、被 base-web TS compile-gate 救回（但有 cascade 撞）。本 sprint base-web 不 bind response，理論 0 風險、但 CDP smoke 為 reassurance（防 040 critical bug 重演）+ 對齊 037/038 既有體例。

---

## 4. 影響範圍與工程細節（per Q1+Q2+Q3）

### 4.1 改動檔表

| File | Operation | est line |
|---|---|---|
| `rust-api/server/model/src/admin/output/sys_organization.rs` | **新檔**（OrganizationDetail struct + `From<Model>`）| +~35 |
| `rust-api/server/model/src/admin/output/sys_endpoint.rs` | **新檔**（EndpointDetail struct + `From<Model>`）| +~30 |
| `rust-api/server/model/src/admin/output/mod.rs` | 加 2 mod 行 | +2 |
| `rust-api/server/service/src/admin/mod.rs` | re-export 2 DTO（per 040 體例）| +2 |
| `rust-api/server/api/src/admin/sys_organization_api.rs:12` | handler return + `.map(\|p\| p.map(OrganizationDetail::from))` | ~3 |
| `rust-api/server/api/src/admin/sys_endpoint_api.rs:16` | 同上、`.map(EndpointDetail::from)` | ~3 |
| `rust-api/server/api/src/admin/sys_system_manage_api.rs:285` (addRole) | handler return + `.map(SystemManageRoleOutput::from)` | ~2 |
| `rust-api/server/api/src/admin/sys_system_manage_api.rs:305` (updateRole) | 同上 | ~2 |
| **合計** | 8 file rust-api、bundled 1 commit | **~+79 line / -0 line**（純加、舊 raw Model wire path 由 type system 收斂）|

### 4.2 DTO struct shape

對齊 040 D-pattern：`pub id: i64`（← `model.display_id`）+ 不含敏感欄位 + **不含 `deleted_at`**（soft-delete 屬 internal forensics、不上 wire）。

**`OrganizationDetail`**（10 欄位）：id + code + name + description + pid + status + created_at + created_by + updated_at + updated_by
- 故意不含：`sys_organization::Model::id` (ULID)、`deleted_at`

**`EndpointDetail`**（9 欄位）：id + path + method + action + resource + controller + summary + created_at + updated_at
- 故意不含：`sys_endpoint::Model::id` (ULID)、`deleted_at`

**`SystemManageRoleOutput`**（既成、0 改動）：id (i64) + role_name + role_code + role_desc + status + created_at + created_by + updated_at + updated_by；`impl From<sys_role::Model> for SystemManageRoleOutput` 已存在。

4 DTO 都加 `#[serde(rename_all = "camelCase")]` 對齊 wire JS 慣例。

### 4.3 PaginatedData::map 用法

`server_core::web::page::PaginatedData` 既有 `.map(F)` helper（040 D5 用過），把 `Vec<T>` → `Vec<U>` 不動 `total`。handler 結構：

```rust
service
    .find_paginated_organizations(params)
    .await
    .map(|p| p.map(OrganizationDetail::from))
    .map(Res::new_data)
```

---

## 5. Acceptance C-V matrix（7 條）

| C-V | Goal | 對應 FR |
|---|---|---|
| C-V1 | dev stack 13 service healthy baseline | SC-001 |
| C-V2 | (a) GET `/org` → response `data.records[].id` i64、無 `id: ULID`、無 `deletedAt` | FR-001/005 |
| C-V3 | (b) POST `/systemManage/addRole` → response `data` shape == `SystemManageRoleOutput`、`id` i64 | FR-002 |
| C-V4 | (c) POST `/systemManage/updateRole` → 同 C-V3 shape | FR-003 |
| C-V5 | (d) GET `/endpoint/page` → response 同 C-V2 形 | FR-004 |
| **C-V6 ⭐ CDP smoke** | base-web role-list 頁登入 + 新增 modal + 編輯 modal + toast「修改成功」regression（per 037/038 體例 + memory `reference_cdp_smoke_technique.md`）| FR-006 |
| C-V7 | scope boundary：grep `Res<SysRoleModel>\|PaginatedData<SysOrganizationModel>\|PaginatedData<SysEndpointModel>` 0 hit + 0 migration + 0 base-web diff + 0 Constitution diff + 0 cargo dep diff | FR-007 |

C-V6 defer 條件：若 CDP setup 失敗（pre-existing infra issue、非本 sprint 引入），登 follow-up C-V6-N1、acceptance 走 C-V2~C-V5 + C-V7 結案。

---

## 6. Commit shape（per CLAUDE.md §4.1）

- **rust-api**：1 commit（8 file bundled、`fix(rust-api): 052 wire-shape-leak-fix (039-R1 結案)`）
- **base-web**：0 commit（軌道外）
- **outer rev1-admin-root**：3 commit（SHA pin / INTEGRATION-CHECKLIST 039-R1 結案 + SPECKIT marker idle / SHA backfill post-merge）

User-gate 4 個：worktree push / outer feature branch push / merge to rev1-admin-root + push / SHA backfill push（同 051 體例）。

---

## 7. 估時

| Phase | Task | 估時 |
|---|---|---|
| Setup | baseline check | ~5 min |
| Impl | 8 file edit + cargo check + clippy | ~45 min |
| Acceptance | curl + psql C-V2-V5 + grep C-V7 | ~25 min |
| Acceptance | CDP smoke C-V6 | ~30 min |
| Polish | outer SHA pin + INTEGRATION-CHECKLIST + push + merge + backfill | ~30 min |
| **合計** | | **~2.5 hr** |

---

## 8. Out-of-scope（052 不做、但相關）

- ❌ 其他 sys_* entity 的 wire shape audit（若 plan grep 發現新漏 → follow-up、本 sprint 不包）
- ❌ Sea-ORM Model 改動（internal SoT 保留）
- ❌ base-web typings / src/ 改動（軌道外、0 改動）
- ❌ 新 schema migration / 新 entity / 新 endpoint / 新 cargo dep
- ❌ Constitution amendment
- ❌ audit_log path 改動
- ❌ 條件觸發 follow-up（042-N4 / 042-N5 / 048-N1 (d) / 050-N1）
- ❌ 長期 follow-up（F1.2 / W-F6b / W-F15/16）

---

## 9. 下一步

`/speckit-specify` 餵本 brainstorm doc 為 input、產出 `specs/052-wire-shape-leak-fix/spec.md`；before_specify pre-hook 同步建 `052-wire-shape-leak-fix` outer feature branch（per CLAUDE.md §3）。
