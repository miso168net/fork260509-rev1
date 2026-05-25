# 051 feature — assign-permission-atomicity-fix（038-R1 結案）

**brainstorm 日期**：2026-05-25
**起源 follow-up**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) 衍生 follow-up 行 **038-R1** ⚠️ Critical
**Status**：brainstorm spec、user-approved；接 `/speckit-specify`

---

## 1. 問題

`rust-api/server/service/src/admin/sys_authorization_service.rs::assign_permission`（W-FW8 US2 落地的 fn）的 write path **不是 atomic**：

```text
1. sync_role_permissions(...)              → Casbin policies 寫 DB（透過 enforcer write API、走 SeaOrmAdapter 的 long-lived DatabaseConnection、auto-commit）✅ committed
2. db.begin().await → audit_log::write_in_txn → txn.commit()  → audit row 寫 sys_operation_log
```

兩步是**兩個獨立 txn**。失敗模式：

- step 1 成功 + step 2 失敗 → **Casbin policy 已生效、audit row 缺失** = silent permission grant、forensics 鏈條斷裂
- 違反 Constitution Principle II「業務寫入 + audit 寫入 MUST 在**同一 DB transaction**」（NON-NEGOTIABLE）

當前 source comment 承認「rare DB-error path」但 spec 條款未軟化、production 仍有失序風險。

對比鏈條：
- `assign_routes`（同檔 W-FW6 N3 fix）✅ atomic — 寫 `sys_role_menu` 直接走 Sea-ORM、audit 同 txn
- `update_role` ptype='p'/'g' UPDATE（W-FW6 N4 + 037-R1 / 050 結案）✅ atomic — 寫 `casbin_rule` 直接走 raw SQL `Statement::from_sql_and_values` in txn、audit 同 txn

`assign_permission` 是 cross-Casbin-write 三大 service fn 中**唯一漏網**的 split-txn。

---

## 2. User-approved 拍板（Q1-Q3）

| # | 問題 | 拍板 |
|---|---|---|
| Q1 | atomicity 方向 | **真 atomicity（impl fix）** — 不軟化 spec / Constitution；強化 Principle II 承諾 |
| Q2 | scope 範圍 | **只修 assign_permission** — 不抽 helper、不順道改 update_role / assign_routes（已 atomic、不重複評估）|
| Q3 | diff 源頭 | **Sea-ORM 讀 casbin_rule** — txn 開頭 SELECT、與 037-R1 / W-FW6 N4 同骨架；不用 enforcer in-memory cache |

---

## 3. 三 approach 對比

| Approach | 內容 | Verdict |
|---|---|---|
| **A. 直 SQL via Sea-ORM ORM ✅採用** | txn 開頭 `CasbinRule::find()...all(&txn)` → 算 diff → `CasbinRule::insert_many` + `CasbinRule::delete_many` `.exec(&txn)` → `audit_log::write_in_txn(&txn, ...)` → `txn.commit()` → `notify_casbin_changed()`（既有 W-F11 pub-sub）。`sync_role_permissions` private fn 刪除（0 caller after fix）。骨架同 037-R1 ptype='p'/'g' UPDATE + assign_routes。 | 採用 |
| **B. 保留 enforcer call、改 adapter 替換 txn 版** | 想讓 `enforcer.add_policies` 走 external `DatabaseTransaction`。但 `Arc<RwLock<Enforcer>>` 在 init 時 adapter 已綁長 lifetime `DatabaseConnection`、替換成 txn 版需重構 enforcer wrapper、跨 `axum-casbin` boundary。 | reject — 不可行 in scope |
| **C. 抽 helper `sync_role_permissions_in_txn`** | 同 A 但抽成可複用 fn。 | reject — 1 個 client、premature abstraction（per Q2 minimum scope）|

---

## 4. 改動範圍（file:line 級）

### 4.1 觸碰檔

| File | 操作 | 估行數 |
|---|---|---|
| `rust-api/server/service/src/admin/sys_authorization_service.rs` | 改寫 `assign_permission` impl (line 210~306) + 刪除 `sync_role_permissions` private fn (line 128~205) + trait `TAuthorizationService::assign_permission` signature drop `enforcer` param (line 57) | ~ -78 / +60 |
| `rust-api/server/api/src/admin/sys_authentication_api.rs:152` | callsite drop `enforcer` arg | ~ -1 line |
| `rust-api/server/api/src/admin/sys_system_manage_api.rs:554` | callsite drop `enforcer` arg | ~ -1 line |

### 4.2 不動

- **0 schema migration** — 沿用既有 `casbin_rule` table
- **0 新 entity** — `casbin_rule::Entity` 已在 `rust-api/server/model/src/admin/entities/prelude.rs:4` 暴露
- **0 新 cargo workspace dep**
- **0 base-web 改動**
- **0 nestjs** — F14 已退場
- **0 Constitution amendment** — fix 強化 Principle II 既有承諾

### 4.3 新 assign_permission 骨架（pseudo）

```rust
async fn assign_permission(
    &self,
    domain: String,
    role_id: String,
    permissions: Vec<String>,
    actor: &Actor,
) -> Result<(), AppError> {
    use std::collections::HashMap;

    // ① 既有 validate logic 不動（在 txn 外）
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

    // ② path/method → endpoint_id 反映表（後面 audit 需要）
    let all_active_endpoints = sys_endpoint::find_active().all(db.as_ref()).await?;
    let path_method_to_id: HashMap<(String, String), String> =
        all_active_endpoints.iter()
            .map(|ep| ((ep.path.clone(), ep.method.clone()), ep.id.clone()))
            .collect();

    // ③ 開 txn — single all-or-nothing scope
    let txn = db.begin().await.map_err(AppError::from)?;

    // ④ txn 內 SELECT 現有 ptype='p' policies for (role, domain)
    let existing_rows = CasbinRule::find()
        .filter(CasbinRuleColumn::Ptype.eq("p"))
        .filter(CasbinRuleColumn::V0.eq(&role_code))
        .filter(CasbinRuleColumn::V1.eq(&domain_code))
        .all(&txn)
        .await
        .map_err(AppError::from)?;

    let mut existing_endpoint_ids: Vec<String> = existing_rows.iter()
        .filter_map(|r| {
            let (v2, v3) = (r.v2.clone()?, r.v3.clone()?);
            path_method_to_id.get(&(v2, v3)).cloned()
        })
        .collect();
    existing_endpoint_ids.sort();
    existing_endpoint_ids.dedup();

    // ⑤ 算 diff
    let mut new_endpoint_ids: Vec<String> =
        valid_permissions.iter().map(|p| p.id.clone()).collect();
    new_endpoint_ids.sort();
    new_endpoint_ids.dedup();

    let new_path_method: Vec<(String, String)> =
        valid_permissions.iter()
            .map(|p| (p.path.clone(), p.method.clone()))
            .collect();
    let existing_path_method: Vec<(String, String)> = existing_rows.iter()
        .filter_map(|r| Some((r.v2.clone()?, r.v3.clone()?)))
        .collect();

    let rows_to_add: Vec<CasbinRuleActiveModel> = new_path_method.iter()
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

    let ids_to_delete: Vec<i64> = existing_rows.iter()
        .filter(|r| {
            let pm = match (r.v2.clone(), r.v3.clone()) {
                (Some(v2), Some(v3)) => (v2, v3),
                _ => return false,
            };
            !new_path_method.contains(&pm)
        })
        .map(|r| r.id)
        .collect();

    // ⑥ 寫 casbin_rule (txn 內)
    if !rows_to_add.is_empty() {
        CasbinRule::insert_many(rows_to_add).exec(&txn).await.map_err(AppError::from)?;
    }
    if !ids_to_delete.is_empty() {
        CasbinRule::delete_many()
            .filter(CasbinRuleColumn::Id.is_in(ids_to_delete))
            .exec(&txn)
            .await
            .map_err(AppError::from)?;
    }

    // ⑦ audit 同 txn（payload shape 不變、camelCase per W-FW8 體例）
    audit_log::write_in_txn(&txn, AuditEvent {
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
    }).await?;

    // ⑧ single commit point
    txn.commit().await.map_err(AppError::from)?;

    // ⑨ 通知所有 replica reload enforcer（既有 W-F11 pattern、fire-and-log）
    notify_casbin_changed().await;

    Ok(())
}
```

---

## 5. Constitution Check（pre-spec、5/5 PASS 預期）

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe** | 0 動 Casbin enforcement model / RBAC 邏輯；本 fix 為 Casbin policy 寫 path atomicity 升級、不變 enforce semantics | ✅ |
| **II. Soft Delete + 全域 Audit Log（NON-NEGOTIABLE）** | **本 fix 直接強化此 Principle**：把 split-txn 改為 single Sea-ORM txn、`casbin_rule` 寫與 `sys_operation_log` 寫同 commit；先前 violation 收斂 | ✅（強化） |
| **III. 嚴版禁 Forward + 單一職責** | 0 跨服務 HTTP 呼叫；`notify_casbin_changed` 為 internal redis pub-sub（既有 W-F11、non-business path）；無新 endpoint | ✅ |
| **IV. base 不改動邊界** | 0 base-web 改動、無軌道相關 | ✅（軌道外 feature） |
| **V. 漸進收縮 DESIGN-A → DESIGN-B** | 0 nestjs；純 rust-api impl fix；DESIGN-B 形態強化 | ✅ |

**0 Constitution amendment** 需要。

---

## 6. Acceptance C-V matrix（per Section 4 design）

| C-V | scenario | 驗 |
|---|---|---|
| **C-V1** | dev stack 13 service Up healthy（接 050 baseline） | `$PCO ps` |
| **C-V2** | happy path: assign → casbin_rule 寫入 + audit 同 txn | curl `assignRoleEndpoints` → psql `casbin_rule` 看新 row + psql `sys_operation_log` payload `endpointIds` before/after 對齊 |
| **C-V3** ⭐ atomicity 證明 | 注入 audit 失敗 → casbin_rule **零變動** rollback | (i) 暫改 audit_log::write_in_txn 強制回 Err（test build 一次性）→ curl → psql diff casbin_rule 前後 0 變動 + sys_operation_log 0 新 row + 抽 fault injection、acceptance 完成 revert |
| **C-V4** | Casbin enforce 收 new policy via W-F11 pub-sub reload | 加 policy 後 R_TEST role 試命中 endpoint → 200；log grep `Casbin policy reloaded` |
| **C-V5** | GeneralUser deny（regression、038 既有 C-V）| GeneralUser curl POST `/systemManage/assignRoleEndpoints` → code != 0 deny |
| **C-V6** | 空陣列 clear-all（regression、E-4 既有 spec）| 送 `endpointIds:[]` → psql casbin_rule 該 role 0 row + audit payload after `endpointIds:[]` |
| **C-V7** | scope discipline boundary | grep `sync_role_permissions` 全 codebase 0 hit; grep `fn assign_permission` 含 4 params (drop enforcer); 0 schema migration; 0 new entity; 0 workspace cargo dep; 0 base-web src/ diff |

**C-V3 為最關鍵 acceptance** — 證明真 atomic、否則跟現況同。實作方式：直 fault injection、暫改 audit_log internal fn 回 Err、跑完 acceptance revert（不留 test artefact）。

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `CasbinRule::find/insert_many/delete_many` 走 Sea-ORM ORM 時 column name / schema 與 sea-orm-adapter migration 不一致 | Sea-ORM entity 在 `rust-api/server/model/src/admin/entities/casbin_rule.rs` 已存在 + 在 prelude 暴露、與 sea-orm-adapter 的 entity 共享 schema（同 table）；spike 1 hr 驗 |
| 並發 race：A 跟 B 同時 assign_permission 同 role+domain、txn isolation 不夠強導致 phantom read | Postgres 預設 `READ COMMITTED` 應足；若撞冷門問題、加 `SELECT ... FOR UPDATE` 在 txn 開頭 lock relevant rows。Phase 0 spike 確認 |
| `notify_casbin_changed` 失敗 → 其他 replica enforcer 不 reload、用 stale cache | 既有 W-F11 設計接受 eventual consistency；本 fix 不變此 behavior。若需 strict consistency 為單獨 feature（與 038-R1 無關）|
| Enforcer in-memory 跟 DB 短暫不一致（commit 後 ~10-50ms） | 同 037-R1 / W-FW6 N4 既有 ptype='p'/'g' UPDATE pattern 接受此 window；本 fix 不變、不擴大 |
| `enforcer` param drop 影響其他 handler 編譯 | 2 handler callsite 已枚舉、改動 ~2 line；爲明確 contained scope |

---

## 8. 估時

| 階段 | 估時 |
|---|---|
| Phase 0 spike：`CasbinRule::find/insert_many/delete_many` schema 對齊 + isolation level 確認 | ~30 min |
| Phase 1 impl：assign_permission 改寫 + sync_role_permissions 刪除 + 2 callsite drop arg | ~1 hr |
| Phase 2 cargo check + clippy | ~10 min |
| Phase 3 acceptance C-V1~C-V7（含 C-V3 fault injection setup + revert）| ~1.5 hr |
| Phase 4 worktree + outer commit + push + merge + backfill | ~30 min（含 user gate）|
| **合計** | **~3.5 hr** |

---

## 9. 軌道辨識

軌道**外** feature（rust-api only、0 base-web、0 軌道內 file）。Constitution Principle IV「base 不改動邊界」**預設原則**不行使，無軌道紀律議題。

---

## 10. 下一步

1. `/speckit-specify` 起手、input = 本文件
2. spec.md 內 FR-001~FR-N + SC-001~SC-N、繼承本文件 Section 4 設計 + Section 6 C-V matrix
3. `/speckit-plan` + `/speckit-tasks` + `/speckit-analyze`
4. `superpowers:executing-plans` 實作（**不**用 `/speckit-implement`、per CLAUDE.md §3）
