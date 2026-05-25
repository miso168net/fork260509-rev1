# Data Model: 051 assign-permission-atomicity-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

051 為 atomicity impl fix、**無 application data entity 改動**（0 schema migration、0 entity 改、0 base-web src/ diff、0 新 column）。本檔以「rust-api 3 file 改動 diff」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

涉及既有 entity（read/write but not modified）：
- `casbin_rule`（既有 Sea-ORM entity、在 prelude）— 本 fix 對 row INSERT/DELETE/SELECT、schema 不變
- `sys_operation_log`（既有 audit table）— audit row 寫入路徑不變
- `sys_endpoint`（既有 endpoint catalog）— SELECT 用、不變

---

## E1. `rust-api/server/service/src/admin/sys_authorization_service.rs` 改寫（per FR-001 / FR-002 / FR-003 / FR-004 / FR-005 / FR-006）

### E1.1 — 刪除 `sync_role_permissions` private fn（per FR-002）

per [research R-3](./research.md) 確認 0 caller after fix、整段移除。

**BEFORE**（line 128~205、78 line）：
```rust
async fn sync_role_permissions(
    &self,
    role_code: &str,
    domain: &str,
    new_permissions: Vec<server_model::admin::facade::sys_endpoint::Model>,
    enforcer: Arc<RwLock<impl CoreApi + MgmtApi + RbacApi + Send + Sync>>,
) -> Result<(), AppError> {
    // ... 78 line 內容（既有 enforcer read/write、policy diff、add_policies/remove_policies、notify_casbin_changed）
}
```

**AFTER**: 整段刪除。

**Diff**：~-78 line

### E1.2 — 改寫 `assign_permission` impl（per FR-001 / FR-003 / FR-004 / FR-005 / FR-006）

per [research R-1 / R-5](./research.md)、 [brainstorm doc Section 4.3](../../docs/superpowers/051-feature-assign-permission-atomicity-fix.md) 完整 pseudo code。

**BEFORE**（line 210~306、97 line）：
- signature 含 `enforcer: Arc<RwLock<impl CoreApi + MgmtApi + RbacApi + Send + Sync>>` 參數
- 內部呼叫 `self.sync_role_permissions(...)` 寫 enforcer
- 之後另開 `let txn = db.begin().await?` 為 audit 單獨開 txn

**AFTER**:
```rust
async fn assign_permission(
    &self,
    domain: String,
    role_id: String,
    permissions: Vec<String>,
    actor: &Actor,
) -> Result<(), AppError> {
    use std::collections::HashMap;
    use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
    use server_model::admin::entities::prelude::CasbinRule;
    use server_model::admin::entities::casbin_rule::{
        ActiveModel as CasbinRuleActiveModel,
        Column as CasbinRuleColumn,
    };

    // ① 既有 validate logic（在 txn 外、不變）
    let (domain_code, _, role_code) = self.check_domain_and_role(&domain, &role_id).await?;
    let db = db_helper::get_db_connection().await?;
    let valid_permissions = sys_endpoint::find_active()
        .filter(SysEndpointColumn::Id.is_in(permissions.clone()))
        .all(db.as_ref())
        .await
        .map_err(AppError::from)?;
    if !permissions.is_empty() && valid_permissions.is_empty() {
        return Err(AuthorizationError::PermissionsNotFound.into());
    }

    // ② path/method → endpoint_id 反映表（per research R-5、txn 外建）
    let all_active_endpoints = sys_endpoint::find_active().all(db.as_ref()).await?;
    let path_method_to_id: HashMap<(String, String), String> = all_active_endpoints
        .iter()
        .map(|ep| ((ep.path.clone(), ep.method.clone()), ep.id.clone()))
        .collect();

    // ③ 開 txn — single all-or-nothing scope
    let txn = db.begin().await.map_err(AppError::from)?;

    // ④ txn 內 SELECT 現有 ptype='p' policies for (role_code, domain_code) — per research R-1
    let existing_rows = CasbinRule::find()
        .filter(CasbinRuleColumn::Ptype.eq("p"))
        .filter(CasbinRuleColumn::V0.eq(&role_code))
        .filter(CasbinRuleColumn::V1.eq(&domain_code))
        .all(&txn)
        .await
        .map_err(AppError::from)?;

    let mut existing_endpoint_ids: Vec<String> = existing_rows
        .iter()
        .filter_map(|r| {
            let v2 = r.v2.clone()?;
            let v3 = r.v3.clone()?;
            path_method_to_id.get(&(v2, v3)).cloned()
        })
        .collect();
    existing_endpoint_ids.sort();
    existing_endpoint_ids.dedup();

    // ⑤ 算 diff
    let mut new_endpoint_ids: Vec<String> = valid_permissions
        .iter()
        .map(|p| p.id.clone())
        .collect();
    new_endpoint_ids.sort();
    new_endpoint_ids.dedup();

    let new_path_method: Vec<(String, String)> = valid_permissions
        .iter()
        .map(|p| (p.path.clone(), p.method.clone()))
        .collect();
    let existing_path_method: Vec<(String, String)> = existing_rows
        .iter()
        .filter_map(|r| Some((r.v2.clone()?, r.v3.clone()?)))
        .collect();

    let rows_to_add: Vec<CasbinRuleActiveModel> = new_path_method
        .iter()
        .filter(|pm| !existing_path_method.contains(pm))
        .map(|(path, method)| CasbinRuleActiveModel {
            ptype: Set("p".to_string()),
            v0: Set(Some(role_code.clone())),
            v1: Set(Some(domain_code.clone())),
            v2: Set(Some(path.clone())),
            v3: Set(Some(method.clone())),
            v4: Set(None),
            v5: Set(None),
            ..Default::default()
        })
        .collect();

    let ids_to_delete: Vec<i64> = existing_rows
        .iter()
        .filter(|r| {
            match (r.v2.clone(), r.v3.clone()) {
                (Some(v2), Some(v3)) => !new_path_method.contains(&(v2, v3)),
                _ => false,
            }
        })
        .map(|r| r.id)
        .collect();

    // ⑥ 寫 casbin_rule (txn 內)
    if !rows_to_add.is_empty() {
        CasbinRule::insert_many(rows_to_add)
            .exec(&txn)
            .await
            .map_err(AppError::from)?;
    }
    if !ids_to_delete.is_empty() {
        CasbinRule::delete_many()
            .filter(CasbinRuleColumn::Id.is_in(ids_to_delete))
            .exec(&txn)
            .await
            .map_err(AppError::from)?;
    }

    // ⑦ audit 同 txn（payload shape 不變、camelCase per W-FW8 體例）
    audit_log::write_in_txn(
        &txn,
        AuditEvent {
            actor,
            operation: AuditOperation::Update,
            entity_type: "sys_role",
            entity_id: role_id.clone(),
            payload_before: Some(serde_json::json!({
                "roleId": &role_id,
                "domain": &domain_code,
                "endpointIds": &existing_endpoint_ids,
            })),
            payload_after: Some(serde_json::json!({
                "roleId": &role_id,
                "domain": &domain_code,
                "endpointIds": &new_endpoint_ids,
            })),
            description: None,
            source: AuditSource::Internal,
            request_id: None,
        },
    )
    .await?;

    // ⑧ single commit point
    txn.commit().await.map_err(AppError::from)?;

    // ⑨ 通知所有 replica reload enforcer（既有 W-F11 pattern、fire-and-log）
    notify_casbin_changed().await;

    Ok(())
}
```

**Diff**：~+60 line / -97 line = net ~-37 line（更精簡、邏輯更清晰）

### E1.3 — Trait signature drop `enforcer` 參數（per FR-003）

per [research R-3](./research.md) 確認 fix 後 enforcer 不再需要。

**BEFORE**（line 57~62）:
```rust
#[async_trait]
pub trait TAuthorizationService {
    async fn assign_permission(
        &self,
        domain: String,
        role_id: String,
        permissions: Vec<String>,
        enforcer: Arc<RwLock<impl CoreApi + MgmtApi + RbacApi + Send + Sync>>,
        actor: &Actor,
    ) -> Result<(), AppError>;
    // ... 其他 method
}
```

**AFTER**:
```rust
#[async_trait]
pub trait TAuthorizationService {
    async fn assign_permission(
        &self,
        domain: String,
        role_id: String,
        permissions: Vec<String>,
        actor: &Actor,
    ) -> Result<(), AppError>;
    // ... 其他 method
}
```

**Diff**：-1 line（拿掉 enforcer 那行）

注意：如果 trait 用 `impl Trait` 而非 generic、可能要從 trait 拿掉 import；spike 時驗證。

### E1.4 — `sys_authorization_service.rs` 總計

| Section | Operation | est line diff |
|---|---|---|
| E1.1 sync_role_permissions 刪除 | -78 line |
| E1.2 assign_permission 改寫 | +60 / -97 = net -37 |
| E1.3 trait signature drop enforcer | -1 line |
| **小計** | | **~-116 line net**（從 ~400 line → ~284 line）|

---

## E2. `rust-api/server/api/src/admin/sys_authentication_api.rs` callsite drop（per FR-003）

per spec FR-003、既有 line 152 callsite。

**BEFORE**（line 152）:
```rust
.assign_permission(input.domain, role_ulid, permission_ulids, enforcer, &actor)
```

**AFTER**:
```rust
.assign_permission(input.domain, role_ulid, permission_ulids, &actor)
```

**Diff**：-1 line（拿掉 `enforcer,` 參數）

注意：handler fn 上層也可能拿了 `enforcer` 變數但只給此 callsite 用 → 若 unused、cargo clippy 會 warn → 順手清理 import / let。

---

## E3. `rust-api/server/api/src/admin/sys_system_manage_api.rs` callsite drop（per FR-003）

per spec FR-003、既有 line 554 callsite（W-FW8 US2 `/systemManage/assignRoleEndpoints` alias）。

**BEFORE**（line 554）:
```rust
.assign_permission(domain, role_ulid, endpoint_ulids, enforcer, &actor)
```

**AFTER**:
```rust
.assign_permission(domain, role_ulid, endpoint_ulids, &actor)
```

**Diff**：-1 line

同樣注意 handler 上層 unused enforcer 變數清理。

---

## E4. INTEGRATION-CHECKLIST cleanup（per FR-010）

### E4.1 — 衍生 follow-up table 移除 038-R1 row

per spec.md FR-010(a)：將 `038-R1` ⚠️ Critical row 從 INTEGRATION-CHECKLIST 「衍生 follow-up」table 移除、改為 footnote「038-R1 結案 via 051」格式。

預期 footnote：
```markdown
> **038-R1 結案（051 assign-permission-atomicity-fix 落地、2026-05-25）**：post-merge code review 衍生 R-row 038-R1 ⚠️ Critical 已於 051 sprint 結案：
> - 038-R1 FR-008 assign_permission split-txn → single Sea-ORM txn（`casbin_rule` 直寫 + audit 同 txn）；Constitution Principle II「業務寫入 + audit 同 txn」NON-NEGOTIABLE 承諾從 violation → fulfillment 收斂；C-V3 fault injection 反證 atomicity rollback
```

### E4.2 — 039-R1 仍留 active

per spec.md FR-010(b) — 039-R1 仍留 active backlog（unchanged、等下一 dedicated sprint）。

### E4.3 — 已完成里程碑加 051 entry

格式對齊 050 / 049 / 048 體例（單 row、SHA placeholder 留 Phase 5 SHA backfill）：

```markdown
- [x] **051 assign-permission-atomicity-fix** ✅（2026-05-25 完成；outer `<OUTER_SHA>` + merge `<MERGE_SHA>`、rust-api `<RUST_API_SHA>`、base-web 0 改動；spec `specs/051-assign-permission-atomicity-fix/`）— 038-R1 ⚠️ Critical 結案 dedicated sprint：sys_authorization_service::assign_permission 從 split-txn (Casbin policy 寫 + audit 寫各自 commit) 改為 single Sea-ORM DatabaseTransaction（casbin_rule 直寫 INSERT/DELETE + audit_log::write_in_txn 同 txn + single commit）+ 刪除 sync_role_permissions private fn + trait signature drop unused enforcer param（2 handler callsite 同步調整）+ W-F11 notify_casbin_changed pub-sub reload 既有 pattern 重用；軌道**外** feature、0 base-web 改動、0 schema migration、0 新 entity、0 新 endpoint、0 新 workspace cargo dep、0 Constitution amendment（Principle II 強化從 violation → fulfillment 收斂、無需修文）；C-V1~C-V7 全 PASS（含 C-V3 fault injection 反證 atomicity rollback：暫改 audit_log::write_in_txn 強制 Err → curl → psql 看 casbin_rule + sys_operation_log 雙方 0 變動 → revert + happy path 仍 PASS）；連帶 R-row 039-R1 ⚠️ Critical 留下一 dedicated sprint
```

### E4.4 — Current Focus update

**現狀** 段尾加 051 sprint：
```markdown
... 049/050 + **051 assign-permission-atomicity-fix 落地** —— 051 = 038-R1 ⚠️ Critical 結案 dedicated sprint = ...（如 E4.3 entry 描述）
```

**Active feature**：—（051 已完成、見已完成里程碑）

**下一步** update：
```markdown
**下一步**（user 2026-05-25 拍板 5 階段順序前 5 階段 + 051 已交付、剩 dedicated sprint Critical 1 條 + 條件觸發 4 條 + 長期 3 段）：
1. dedicated sprint（Critical、需排）：039-R1 wire shape leak（4 endpoint 漏 wrap、接 040 W-FW9 D 體例）
2. 條件觸發：042-N4 / 042-N5 / 048-N1 (d) / 050-N1（cleanup binary DATABASE_URL secret file）各自獨立（trigger driven）
3. 長期：F1.2 / W-F6b / W-F15/16 各自獨立
```

### E4.5 — CLAUDE.md SPECKIT marker idle

```markdown
<!-- SPECKIT START -->
**Active Spec**: —
**Active Plan**: —
**Phase**: idle
**下一步**: dedicated sprint 排（039-R1 Critical 獨立）+ 條件觸發 follow-up backlog（042-N4 / 042-N5 / 048-N1 (d) / 050-N1 各自獨立）+ 長期（F1.2 / W-F6b / W-F15/16）
<!-- SPECKIT END -->
```

### E4.6 — Phase 3 cleanup 總計

| File | Operation | est line diff |
|---|---|---|
| `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up table | -1 row（038-R1）+ footnote ~5 line | ~+4 line |
| `docs/INTEGRATION-CHECKLIST.md` 已完成里程碑 | +051 entry | +1 line |
| `docs/INTEGRATION-CHECKLIST.md` Current Focus | 現狀 + 下一步 update | ~+5 line |
| `CLAUDE.md` SPECKIT marker | idle | refresh 4 line |
| **小計** | | **~+10 line（淨）**|

---

## E5. file:line diff summary table

| Phase | item | file | 改動 |
|---|---|---|---|
| Phase 1 (rust-api) | assign_permission 改寫 | `rust-api/server/service/src/admin/sys_authorization_service.rs` | ~+60 / -97 = net -37 |
| Phase 1 | sync_role_permissions 刪除 | same as above | ~-78 line |
| Phase 1 | trait signature drop enforcer | same as above | ~-1 line |
| Phase 1 | callsite drop arg | `rust-api/server/api/src/admin/sys_authentication_api.rs:152` | ~-1 line |
| Phase 1 | callsite drop arg | `rust-api/server/api/src/admin/sys_system_manage_api.rs:554` | ~-1 line |
| Phase 3 (Polish) | INTEGRATION-CHECKLIST 038-R1 結案 + 051 entry + Current Focus | `docs/INTEGRATION-CHECKLIST.md` 多處 | ~+10 line（淨） |
| Phase 3 | SPECKIT marker idle | `CLAUDE.md` SPECKIT 區段 | refresh |

**改動總計**：~-118 line rust-api + ~+10 line outer = **net ~-108 line**（重 fix、code shrink）跨 5 file（3 rust-api source + 1 INTEGRATION-CHECKLIST + 1 CLAUDE.md）。

---

## E6. Out-of-scope（051 不做、但相關）

- 039-R1 ⚠️ Critical（4 endpoint raw Model wire shape leak）→ 下一 dedicated sprint
- W-WEBUI 軌道範圍改動 → W-WEBUI 軌道、本 sprint 不動
- TS-Typing-Sync 軌道範圍改動 → TS-Typing-Sync 軌道、本 sprint 不動
- TS-DepGraph-Hygiene 軌道範圍改動 → TS-DepGraph-Hygiene 軌道、本 sprint 不動
- base-web src/ 任何 logic 改動 → scope creep、本 sprint 0 base-web 改動
- rust-api 新 endpoint / schema migration / 新 entity → 0 改動、本 sprint 不動（per FR-008）
- assign_routes / assign_users / update_role atomicity audit 補強 → 已 atomic（W-FW6 N3 / W-FW8 US2 / 037-R1）、不重複評估
- `SELECT ... FOR UPDATE` 加入 enforce stricter consistency → 不需（R-2 拍板）
- 抽 helper `sync_role_permissions_in_txn` → premature abstraction（Q2 minimum scope）
- enforcer in-memory write-through（commit 後直 enforcer.write().add_policy）→ 不擴範圍、用既有 pub-sub
- Constitution II wording 增強（明示 Casbin policy）→ 本 fix impl 路徑、無需 amendment
- 042-N4 latency optimization / 042-N5 dev compose multi-replica / 048-N1 (d) pnpm 升級 / 050-N1 cleanup env → 條件觸發、本 sprint 不動
- F1.2 JWT algorithm / W-F6b acme cert / W-F15/16 backup-job → 長期、與 038-R1 無關
