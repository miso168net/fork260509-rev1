# Data Model: 050 spec-hygiene-pass-4

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

050 為 spec hygiene + impl fix + infra add + governance dynamic 行使、**無 application data entity 改動**（0 schema migration、0 entity 改、0 base-web src/ diff）；本檔以「Phase 0 governance + Phase 1 rust-api impl + Phase 2 infra + Phase 3 INTEGRATION-CHECKLIST cleanup」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. Phase 0 — Governance restructure（per FR-001 / FR-002 / FR-008、per [research R-4 / R-5](./research.md)）

### E1.1 — `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` §4.4.3 新增 050 sprint entry

per [research R-4.2](./research.md) wording (~25 line edit)、加在 §4.4.2 049 entry 之後、§4.5 與其他軌道邊界 之前：

```markdown
#### §4.4.3 050 spec-hygiene-pass-4（post-merge review-derived hygiene、TS-DepGraph-Hygiene 軌道 dynamic 行使首例）

- **日期**：2026-05-25 落地
- **commit**：outer `<TBD post-merge>` + merge `<TBD>` + base-web `<TBD>` + rust-api `<TBD>`
- **scope**（軌道內限）：
  - 049-R1 base-web/Dockerfile line 35-42 stale comment block 改為「pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005)」描述
- **觸發**：050 sprint 為 post-merge code review 衍生 follow-up 結案載體（5 Important + 1 Polish bundled mixed sprint）；軌道內 049-R1 為其 Polish 條目
- **acceptance**：C-V1~C-V10 全 PASS（含軌道紀律 boundary verify、grep base-web/Dockerfile 確認 stale ref 清乾淨）
- **spec**：[`specs/050-spec-hygiene-pass-4/`](../specs/050-spec-hygiene-pass-4/)
- **軌道授權說明**：本 sprint 為 TS-DepGraph-Hygiene 軌道 **dynamic 文件權威首次行使**（per Constitution v1.6.0 既有設計、無需 amendment）—— 加本 §4.4.3 entry 至 DESIGN 文件即取得授權；同 W-FW9 對 DESIGN-W-WEBUI.md §7 dynamic 體例
```

**估行數**：~25 line（含 SHA placeholder 留 Phase 3 SHA backfill）

### E1.2 — `specs/046-spec-hygiene-pass-3/spec.md` FR-015 amend + retro footnote

per [research R-5.2 / R-5.3](./research.md)：

**BEFORE**（estimated、查 046 spec.md 實際）:
```
**FR-015**: implementer-stage expansion 拾取上限 MUST ≤ 3 處；候選由 Phase 0 research grep 後拍板；超限拒絕並登記 046+ follow-up。
```

**AFTER**:
```
**FR-015**: implementer-stage expansion 拾取上限 base **≤ 3 處**；user 拍板可加大、需於 commit message body 明示拍板原委 + budget enlargement 計數；候選由 Phase 0 research grep 後拍板；超限（無 user 拍板）拒絕並登記 046+ follow-up。

> **2026-05-25 retro footnote**：046 sprint US4 implementer-stage expansion 實際 18 sites（17 display_id + 1 home_route_name + dev-dep `tokio "time"` feature）為 pre-existing E0063 build-gate fix、user 拍板加大、屬本 generalized wording 首次行使（050 sprint 補 retro）。
```

**估行數**：~5 line edit（FR-015 wording amend + retro footnote）

### E1.3 — `specs/044-observability-and-cleanup-pass/spec.md` FR-005 route label polish（optional）

per spec.md FR-008（MAY、不必須）：

**BEFORE**（estimated、查 044 spec.md 實際）:
```
`http_request_duration_seconds` (histogram, labels: route, method, status)
```

**AFTER**:
```
`http_request_duration_seconds` (histogram, labels: route [axum template path、含 path params placeholder]、method, status)
```

**估行數**：~2 line edit（FR-005 wording polish）

### E1.4 — Phase 0 總計

| File | Operation | est line diff |
|---|---|---|
| `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` | +§4.4.3 050 entry | +25 |
| `specs/046-spec-hygiene-pass-3/spec.md` | FR-015 amend + retro footnote | +5 |
| `specs/044-observability-and-cleanup-pass/spec.md` | FR-005 route label polish (optional) | +2 |
| **Phase 0 合計** | | **~+32 line** |

---

## E2. Phase 1 — rust-api impl（per FR-003/004/005/007、per [research R-1/R-2/R-3](./research.md)）

### E2.1 — `rust-api/server/model/src/admin/input/sys_menu.rs` (036-R1 DTO)

per [research R-1.2 / R-1.3](./research.md)：

**BEFORE**（estimated）:
```rust
#[derive(Deserialize, Serialize, Validate)]
pub struct SystemManageUpdateMenuInput {
    pub id: String,
    pub name: String,
    pub query: Option<JsonValue>,
    pub buttons: Option<JsonValue>,
    pub fixed_index_in_tab: Option<i32>,
    // ... 其他 field
}
```

**AFTER**（首選 `Option<Option<T>>` double-option）:
```rust
#[derive(Deserialize, Serialize, Validate)]
pub struct SystemManageUpdateMenuInput {
    pub id: String,
    pub name: Option<String>,
    // 3 nullable field 改 Option<Option<T>> double-option:
    // None → 未送、保留 before_row
    // Some(None) → explicit null clear
    // Some(Some(v)) → set value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<Option<JsonValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub buttons: Option<Option<JsonValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fixed_index_in_tab: Option<Option<i32>>,
    // ... 其他 field
}
```

**Diff**：~+5 line（3 field 加 `Option<Option<T>>` + serde attrs；其他 field 保持）

**Fallback**：若 spike 撞 serde 問題、降級用 update mask（+1 field `Vec<String> fields_to_clear`）。

### E2.2 — `rust-api/server/service/src/admin/sys_menu_service.rs` (036-R1 selective merge logic)

per [research R-1.2](./research.md) sea-orm `Set`/`NotSet` pattern：

`update_menu_for_systemmanage` handler 改 selective update logic：

```rust
let mut active = before_row.into_active_model();

// name: Option<String>、None = 未送 = 保留
if let Some(name) = input.name {
    active.name = Set(name);
}

// 3 nullable: Option<Option<T>>、None = 未送 = NotSet（保留）
match input.query {
    None => {}                                    // 未送、不改
    Some(None) => active.query = Set(None),       // explicit null
    Some(Some(v)) => active.query = Set(Some(v)), // set value
}
// 同樣處理 buttons / fixed_index_in_tab
```

**Diff**：~+20 line（3 nullable field × 3 match arm + helper / refactor 既有 update 邏輯）

### E2.3 — `rust-api/server/service/src/admin/sys_role_service.rs` (037-R1 ptype='g' defensive UPDATE + audit)

per [research R-?](./research.md) + spec FR-004：

`update_role` txn 內、既有 ptype='p' UPDATE 後加 ptype='g' UPDATE + audit payload 加 `g_rules_updated_count`：

```rust
// 既有 ptype='p' UPDATE...
let p_rows_updated = txn.execute(/* UPDATE casbin_rule SET v0=$1 WHERE ptype='p' AND v0=$2 */).await?;

// 新加 ptype='g' defensive UPDATE
let g_rows_updated = txn.execute(/* UPDATE casbin_rule SET v1=$1 WHERE ptype='g' AND v1=$2 */).await?;

// audit payload (MUST 加 g_rules_updated_count、per Clarifications Q2)
let audit_payload = json!({
    "before": before_snapshot,
    "after": after_snapshot,
    "p_rules_updated_count": p_rows_updated.rows_affected(),
    "g_rules_updated_count": g_rows_updated.rows_affected(),  // 新加、MUST
});
audit_log::write_in_txn(&txn, ..., &audit_payload).await?;
```

**Diff**：~+5 line（+1 SQL UPDATE line + 1 audit field）

### E2.4 — `rust-api/server/core/src/web/operation_log.rs` (044-R2 axum MatchedPath)

per [research R-3.1 / R-3.4](./research.md)：

**BEFORE**（estimated、既有 record histogram 處）:
```rust
let route_label = req.uri().path();  // raw URI path、含 numeric ID
HISTOGRAM.with_label_values(&[route_label, method, status]).observe(elapsed_secs);
```

**AFTER**:
```rust
// per axum 0.8 MatchedPath、fallback "unmatched" 避免 cardinality leak
let route_template = req.extensions()
    .get::<axum::extract::MatchedPath>()
    .map(|p| p.as_str())
    .unwrap_or("unmatched");
HISTOGRAM.with_label_values(&[route_template, method, status]).observe(elapsed_secs);
```

**Diff**：~+5 line（取 MatchedPath + fallback）

### E2.5 — `rust-api/server/cleanup/src/main.rs` (044-R1 pushgateway recorder)

per [research R-2.3](./research.md)：

```rust
use metrics_exporter_prometheus::PrometheusBuilder;
use std::time::Duration;

fn install_pushgateway_recorder() -> Result<PrometheusHandle, Box<dyn std::error::Error>> {
    let endpoint = std::env::var("PUSHGATEWAY_URL")
        .unwrap_or_else(|_| "http://pushgateway:9091".to_string());
    let job = "cleanup";
    let instance = std::env::var("HOSTNAME").unwrap_or_else(|_| "cleanup-binary".to_string());

    let handle = PrometheusBuilder::new()
        .with_push_gateway(
            format!("{}/metrics/job/{}/instance/{}", endpoint, job, instance),
            Duration::from_secs(10),
            None,  // no username
            None,  // no password
        )?
        .install_recorder()?;
    Ok(handle)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _handle = install_pushgateway_recorder()?;
    // ... 既有 cleanup sweep logic（無變）

    // on-exit flush（per R-2.3）
    // 若 metrics-exporter-prometheus 提供 flush API、直接呼；否則 sleep 5s 保 background push interval 完成
    tokio::time::sleep(Duration::from_secs(5)).await;
    Ok(())
}
```

**Diff**：~+30 line（recorder install + on-exit flush）

### E2.6 — `rust-api/server/cleanup/Cargo.toml` (044-R1 dep)

per [research R-2.2](./research.md) feature flag enable（不引新 workspace dep）：

**BEFORE**（estimated）:
```toml
[dependencies]
metrics-exporter-prometheus = { workspace = true }
```

**AFTER**:
```toml
[dependencies]
metrics-exporter-prometheus = { workspace = true, features = ["push-gateway"] }
```

**Diff**：1 line edit（per-crate feature flag enable）

### E2.7 — Phase 1 總計

| File | Operation | est line diff |
|---|---|---|
| `rust-api/server/model/src/admin/input/sys_menu.rs` | +Option<Option<T>> 3 field | ~+5 |
| `rust-api/server/service/src/admin/sys_menu_service.rs` | +selective merge logic | ~+20 |
| `rust-api/server/service/src/admin/sys_role_service.rs` | +1 SQL UPDATE + audit field | ~+5 |
| `rust-api/server/core/src/web/operation_log.rs` | +MatchedPath fallback | ~+5 |
| `rust-api/server/cleanup/src/main.rs` | +pushgateway recorder | ~+30 |
| `rust-api/server/cleanup/Cargo.toml` | feature flag enable | ~+1 |
| **Phase 1 合計** | | **~+66 line** |

---

## E3. Phase 2 — Infra + base-web Dockerfile（per FR-006/009、per [research R-2.4 / R-2.5](./research.md)）

### E3.1 — `docker-compose.observability.yml` (044-R1 pushgateway service)

per [research R-2.4](./research.md)：

加在既有 prometheus service block 之後：

```yaml
  pushgateway:
    image: prom/pushgateway:v1.10.0
    container_name: rev1-admin-pushgateway-1
    restart: unless-stopped
    ports:
      - "9091:9091"
    networks:
      - rev1-admin-network
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9091/-/healthy || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Diff**：+12 line

### E3.2 — `deploy/prometheus.yml` (044-R1 scrape job)

per [research R-2.5](./research.md)：

加在 既有 scrape_configs 末尾：

```yaml
  - job_name: 'pushgateway'
    honor_labels: true
    static_configs:
      - targets: ['pushgateway:9091']
    scrape_interval: 15s
```

**Diff**：+5 line

### E3.3 — `deploy/grafana-provisioning/dashboards/*.json` (044-R1 panel polish、optional)

per FR-006 MAY：對應 `cleanup_job_rows_deleted_total` panel 描述移除「no data」placeholder 註解；不在 spec MUST 範圍。

**Diff**：~0-5 line（MAY、implementer 拍板）

### E3.4 — `base-web/Dockerfile` (049-R1 line 35-42 comment polish)

per [spec.md FR-009](./spec.md) inline wording：

**BEFORE** (line 35-42):
```dockerfile
# 注意:pnpm 11 改 hoist 行為,從 .npmrc shamefully-hoist=true (pnpm 10 慣例)
# 改為 pnpm-workspace.yaml nodeLinker: hoisted (per 048-N1 follow-up、commit
# d521c819)。container 與 host (pnpm 11.0.8) 一致依賴 workspace.yaml 設定;
# .npmrc shamefully-hoist=true 仍保留 (pnpm 10 fallback、無 harm),但 pnpm 11
# 不讀。--ignore-scripts 必要:pnpm 11 strict mode 對 transitive dep 的 build
# script (esbuild / simple-git-hooks / unrs-resolver / 等) 預設拒絕、無
# pnpm approve-builds 互動 → exit 1。container 內無 .git/、無互動 shell、
# build script 對 prod runtime 無 functional 影響、--ignore-scripts 為合適選擇。
```

**AFTER**:
```dockerfile
# pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005):
# - package.json packageManager field 是唯一 pnpm 版本 source of truth
#   (host + container 共享、取代 047.5 retro 期間的 Dockerfile ARG)
# - 4 phantom transitive 已提為 explicit devDeps、無需 hoist
# - --ignore-scripts 保留: pnpm 11 strict mode 拒絕 transitive build script
#   (esbuild / simple-git-hooks / unrs-resolver / etc.)、container 無互動 shell
```

**Diff**：~-2 line（8 line → 6 line、淨 -2）

### E3.5 — Phase 2 總計

| File | Operation | est line diff |
|---|---|---|
| `docker-compose.observability.yml` | +pushgateway service block | +12 |
| `deploy/prometheus.yml` | +scrape job | +5 |
| `deploy/grafana-provisioning/dashboards/*.json` | panel polish (optional MAY) | 0-5 |
| `base-web/Dockerfile` | line 35-42 comment block replace | -2 |
| **Phase 2 合計** | | **~+15-20 line** |

---

## E4. Phase 3 — INTEGRATION-CHECKLIST cleanup（per FR-013）

### E4.1 — 5 R-row Important + 1 R-row Polish 移除 active table 改 footnote

per spec.md FR-013(a) 將以下 6 row（036-R1 / 037-R1 / 044-R1 / 044-R2 / 046-R1 / 049-R1）從 INTEGRATION-CHECKLIST 「衍生 follow-up」table 移除、改為 footnote「已結案 via 050」格式。

預期 footnote 結構：
```markdown
> **5 Important + 1 Polish 結案（050 spec-hygiene-pass-4 落地、2026-05-25）**：post-merge code review 衍生 R-row 6 條已於 050 sprint 結案：
> - 036-R1 FR-004 omitted 不覆寫 drift → impl fix selective merge（`Option<Option<T>>` double-option / sys_menu_service handler / DTO）
> - 037-R1 grouping rule 'g' 未 sync → defensive UPDATE for ptype='g' v1 + audit g_rules_updated_count + GeneralUser deny C-V
> - 044-R1 cleanup_job_rows_deleted_total silent no-op → install pushgateway service + cleanup binary recorder
> - 044-R2 route cardinality → axum MatchedPath template + fallback "unmatched"
> - 046-R1 FR-015 expansion budget breach → generalized amend wording + 046 entry retro footnote
> - 049-R1 Dockerfile stale comment → line 35-42 改 strict isolation 紀律說明
```

### E4.2 — 2 R-row Critical 仍留 active table

per spec.md FR-013(b) — 038-R1 + 039-R1 留 active backlog（unchanged、等 dedicated sprint）。

### E4.3 — 已完成里程碑加 050 entry

格式對齊 049 / 048 體例（單 row、SHA placeholder 留 Phase 3 SHA backfill）：

```markdown
- [x] **050 spec-hygiene-pass-4** ✅（2026-05-25 完成；outer `<OUTER_SHA>` + merge `<MERGE_SHA>`、base-web `<BASE_WEB_SHA>`、rust-api `<RUST_API_SHA>`；spec `specs/050-spec-hygiene-pass-4/`）— post-merge code review 衍生 5 Important + 1 Polish bundled mixed sprint：036-R1 sys_menu selective merge (`Option<Option<T>>` double-option) + 037-R1 Casbin ptype='g' defensive UPDATE + g_rules_updated_count audit + GeneralUser deny C-V + 044-R1 install prometheus pushgateway service (v1.10.0) + cleanup binary recorder + 044-R2 axum MatchedPath route template + 046-R1 FR-015 generalized amend wording + retro footnote + 049-R1 Dockerfile strict isolation 紀律 comment polish；軌道內 TS-DepGraph-Hygiene 1 條 (049-R1、DESIGN §4.4.3 dynamic 行使首次) + 軌道外 5 條 (rust-api 4 file + spec docs + infra)；0 Constitution amendment、0 base-web src/ diff、0 schema migration、0 new entity、0 new endpoint；C-V1~C-V10 全 PASS；連帶 R-row 038-R1 + 039-R1 Critical 留 dedicated sprint
```

### E4.4 — Current Focus update

**現狀** 段尾加 050 sprint：
```markdown
... 049 base-web-dep-hygiene + **050 spec-hygiene-pass-4 落地** —— 050 為 post-merge code review 衍生 5 Important + 1 Polish bundled mixed sprint = ...（如 E4.3 entry 描述）
```

**Active feature**：—（050 spec-hygiene-pass-4 已完成、見已完成里程碑）

**下一步** update：
```markdown
**下一步**（user 2026-05-25 拍板的 follow-up bundle、046/047/048/049/050 五 sprint 已完成、剩 dedicated sprint 2 條 Critical + 條件觸發 + 長期）：
1. dedicated sprint（Critical、需排）：038-R1 audit/Casbin atomicity / 039-R1 wire shape leak
2. 條件觸發：042-N4 / 042-N5 / 048-N1 (d) 各自獨立（trigger driven）
3. 長期：F1.2 / W-F6b / W-F15/16 各自獨立
```

### E4.5 — CLAUDE.md SPECKIT marker idle

```markdown
<!-- SPECKIT START -->
**Active Spec**: —
**Active Plan**: —
**Phase**: idle
**下一步**: dedicated sprint 排（038-R1 / 039-R1 各自獨立）+ 條件觸發 follow-up backlog（042-N4 / 042-N5 / 048-N1 (d) 各自獨立）
<!-- SPECKIT END -->
```

### E4.6 — Phase 3 總計

| File | Operation | est line diff |
|---|---|---|
| `docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up table | -6 row + footnote | -30 line + footnote ~15 line |
| `docs/INTEGRATION-CHECKLIST.md` 已完成里程碑 | +050 entry | +1 line |
| `docs/INTEGRATION-CHECKLIST.md` Current Focus | 現狀 + 下一步 update | ~+5 line |
| `CLAUDE.md` SPECKIT marker | idle | refresh 4 line |
| **Phase 3 合計** | | **~-15 line（淨）**|

---

## E5. file:line diff summary table

| Phase | item | file | 改動 |
|---|---|---|---|
| Phase 0 (governance) | DESIGN §4.4.3 050 entry | `docs/INTEGRATION-DESIGN-W-BASE-WEB.md` | ~+25 line |
| Phase 0 | 046 spec FR-015 amend + retro footnote | `specs/046-spec-hygiene-pass-3/spec.md` | ~+5 line |
| Phase 0 | 044 spec FR-005 route label polish (optional) | `specs/044-observability-and-cleanup-pass/spec.md` | ~+2 line |
| Phase 1 (rust-api) | sys_menu DTO Option<Option<T>> | `rust-api/server/model/src/admin/input/sys_menu.rs` | ~+5 line |
| Phase 1 | sys_menu_service selective merge | `rust-api/server/service/src/admin/sys_menu_service.rs` | ~+20 line |
| Phase 1 | sys_role_service ptype='g' UPDATE + audit | `rust-api/server/service/src/admin/sys_role_service.rs` | ~+5 line |
| Phase 1 | operation_log MatchedPath fallback | `rust-api/server/core/src/web/operation_log.rs` | ~+5 line |
| Phase 1 | cleanup main.rs pushgateway recorder | `rust-api/server/cleanup/src/main.rs` | ~+30 line |
| Phase 1 | cleanup Cargo.toml feature flag | `rust-api/server/cleanup/Cargo.toml` | ~+1 line |
| Phase 2 (infra) | pushgateway service block | `docker-compose.observability.yml` | ~+12 line |
| Phase 2 | prometheus scrape job | `deploy/prometheus.yml` | ~+5 line |
| Phase 2 | grafana dashboard panel polish (optional) | `deploy/grafana-provisioning/dashboards/*.json` | 0-5 line |
| Phase 2 | base-web Dockerfile comment polish | `base-web/Dockerfile` | ~-2 line（line 35-42 8→6） |
| Phase 3 (Polish) | INTEGRATION-CHECKLIST 6 R-row 結案 + 050 entry + Current Focus | `docs/INTEGRATION-CHECKLIST.md` 多處 | ~-15 line（淨） |
| Phase 3 | SPECKIT marker idle | `CLAUDE.md` SPECKIT 區段 | refresh |

**改動總計**：~+100 line outer + ~+66 line rust-api + ~-2 line base-web 跨 14 file（3 spec md + 1 DESIGN doc + 4 rust-api source + 1 rust-api Cargo.toml + 1 docker-compose + 1 prometheus.yml + (optional) grafana JSON + 1 base-web Dockerfile + 1 INTEGRATION-CHECKLIST + 1 CLAUDE.md）。

---

## E6. Out-of-scope（050 不做、但相關）

- 038-R1 FR-008 audit/Casbin atomicity violation → dedicated sprint（Critical、留 active backlog）
- 039-R1 5 endpoint raw Model wire shape leak → dedicated sprint（Critical、留 active backlog）
- W-WEBUI 軌道範圍 改動（views/components/service/store/router/locales）→ W-WEBUI 軌道、本 sprint 不動
- TS-Typing-Sync 軌道範圍 改動（typings/api/*.d.ts）→ TS-Typing-Sync 軌道、本 sprint 不動
- base-web src/ 任何 logic 改動 → scope creep、本 sprint 不動
- rust-api 新 endpoint / schema migration / 新 entity → 0 改動、本 sprint 不動（per FR-010）
- pnpm version bump / packageManager field 加 sha hash → 屬 048-N1 (d) trigger-driven、本 sprint 不動
- pushgateway / metrics-exporter-prometheus 升級 → 出新 stable tag 才考慮、本 sprint 用 v1.10.0
- cleanup_job_rows_deleted_total alert rule → 屬 monitoring policy 議題、本 sprint 不動
- 042-N4 latency optimization / 042-N5 dev compose multi-replica / 048-N1 (d) pnpm 升級 → 條件觸發、本 sprint 不動
- F1.2 JWT algorithm / W-F6b acme cert / W-F15/16 backup-job → 長期、與 050 無關
