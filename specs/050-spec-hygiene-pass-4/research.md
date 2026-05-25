# Research: 050 spec-hygiene-pass-4

**Phase**：0（Outline & Research）
**日期**：2026-05-25

依 [plan.md §Phase 0 outcomes](./plan.md) 列出 R-1 ~ R-6 audit + 拍板結果。本 sprint 為 post-merge code review 衍生 5 Important + 1 Polish bundled hygiene-pass、Phase 0 研究目標**確認 implementation pattern + image tag stability + axum API 用法 + DESIGN/spec wording 設計 + expansion 候選**。

---

## R-1 — 036-R1 DTO `Option<Option<T>>` double-option pattern spike（FR-003 對齊）

### R-1.1 — 問題本質

spec 036 FR-004「omitted (missing key/null) MUST NOT 覆寫既有值」要求區分「未送 field」與「explicit null」二態。serde 預設 deserialize 行為：

- `Option<T>` field：未送 → `None`、explicit null → `None`（**無法區分**）
- `Option<Option<T>>` field：未送 → `None`、explicit null → `Some(None)`、有值 → `Some(Some(v))`（**可區分**）

### R-1.2 — serde + sea-orm 支援度

**serde**：原生支援 `Option<Option<T>>`、需配合 `#[serde(default, deserialize_with = "...")]` 或 `#[serde(default)]` + `#[serde(skip_serializing_if = "Option::is_none")]`。

**sea-orm**：ActiveModel 支援 `Set`/`NotSet`/`Unchanged` 3-state，配合 `Option<Option<T>>` handler logic 應該可用：
```rust
match input.query {
    None => ActiveValue::NotSet,            // 未送、保留 before_row
    Some(None) => ActiveValue::Set(None),   // explicit null clear
    Some(Some(v)) => ActiveValue::Set(Some(v)), // set value
}
```

### R-1.3 — Fallback pattern: update mask

若 spike 後 `Option<Option<T>>` 撞 serde compatibility 問題（例如某 derive macro 或 inline type conflict）、降級用 **update mask** 模式：

```rust
#[derive(Deserialize)]
pub struct SystemManageUpdateMenuInput {
    pub id: String,
    pub name: Option<String>,
    pub query: Option<JsonValue>,
    pub buttons: Option<JsonValue>,
    pub fixed_index_in_tab: Option<i32>,
    #[serde(default)]
    pub fields_to_clear: Vec<String>,  // explicit field names to set NULL
}
```

implementer logic：incoming `query=Some(v)` set、`query=None` && `fields_to_clear` 不含「query」則 preserve before_row、`fields_to_clear` 含「query」則 set NULL。

### R-1.4 — Decision

**首選：`Option<Option<T>>` double-option**（serde 原生、cleanest）；implementer Phase 1 Step 1 spike 1-2 hr 確認；若不可行降級 update mask。

**spec freedom**：plan.md 已 disclose 二 pattern、implementer 階段拍板（per FR-003 wording「`Option<Option<T>>` double-option pattern 或 update mask + per-field check」）。

### R-1.5 — Cascade audit

036-R1 fix 是否影響其他 systemManage handler？

- `add_user_for_systemmanage` / `update_user_for_systemmanage`：spec 035 FR 含 password optional 已用 `Option<String>` pattern（未送 = 不改）—— 既有設計符合 selective merge 紀律；無需動。
- `add_role_for_systemmanage` / `update_role_for_systemmanage`：role 內 nullable field 有 `home_route_name`（037 N2）—— 037 既有 sentinel `'home' → NULL`、屬 explicit 訊號、不在 036-R1 selective merge 範疇。

**結論**：036-R1 fix limited to `update_menu_for_systemmanage`、無 cascade impact、無 expansion 觸發。

---

## R-2 — 044-R1 prometheus pushgateway image + cleanup binary recorder（FR-005 / FR-006 對齊）

### R-2.1 — pushgateway image stable tag verify（per Clarifications Q1）

`prom/pushgateway` docker hub：
- `v1.10.0` 為 2024-12 release（per release notes）、stable
- 對齊 rev1 既有 service 版本 pin 體例：`prom/prometheus:v2.x` / `grafana/grafana:11.x` / `redis:7.x`
- `~/.claude/CLAUDE.md §6 tool installation discipline`「應 pin specific stable tag」

**Decision**：image `prom/pushgateway:v1.10.0`（per Clarifications Q1）。

### R-2.2 — cleanup binary recorder crate selection

**既有 rust-api 用 `metrics-exporter-prometheus`**（per 044 spec.md tracing/metric init）—— 此 crate 支援 pushgateway export 模式嗎？

查 `metrics-exporter-prometheus` docs：
- 預設為 HTTP listener mode（拉模式、長 running service）
- 支援 `with_push_gateway` builder method、配合 `metrics-exporter-prometheus` feature flag `"push-gateway"` enable
- push 模式 API：`PrometheusBuilder::new().with_push_gateway(endpoint, interval, username, password)?.install()?`

**Decision**：
- 沿用 `metrics-exporter-prometheus` 同 crate（不引新 dep）
- cleanup binary `Cargo.toml` 加 feature flag `metrics-exporter-prometheus = { version = "x.y", features = ["push-gateway"] }`、屬 per-crate feature enable、非新 workspace dep
- 配合 brainstorm 紀律「0 新 workspace cargo dep」維持

### R-2.3 — cron-driven 短命 process push pattern

cleanup binary cron job 跑完即 exit、不是 long-running listener。pushgateway 設計為「短命 process push metric」場景、契合。

**on-exit flush 紀律**：
- `with_push_gateway(..., interval=10s, ...)` 安排 background 10s push
- on-exit handler（`std::process::exit` 前）顯式呼 `.flush()` 確保最後一次 push 落地
- 或者：cleanup binary main 結尾 sleep 5s（保 background push 完成）—— 不推薦（不精確）

**Decision**：使用 `with_push_gateway` builder 配 background 10s interval push + on-exit explicit `.flush()`（如 crate 提供 flush API、否則 sleep 5s 為 fallback）。implementer Phase 1 spike 確認 flush API 可用性。

### R-2.4 — pushgateway service network alias / port

- docker network alias `pushgateway`（既有 dev stack pattern：`prometheus`/`grafana`/`loki`/`redis` 都用 service-name alias）
- host port bind: 9091:9091（per pushgateway 預設）
- healthcheck: `curl -f http://localhost:9091/-/healthy || exit 1`（per pushgateway docs）
- network: 同 prometheus 既有 network（per docker-compose.observability.yml）

### R-2.5 — prometheus.yml scrape job

```yaml
scrape_configs:
  - job_name: 'pushgateway'
    honor_labels: true   # 重要：保留 cleanup binary 自定 instance/job label
    static_configs:
      - targets: ['pushgateway:9091']
    scrape_interval: 15s
```

`honor_labels: true` 紀律：pushgateway 暫存的 metric label 含 cleanup binary push 時的 `instance`/`job` 標記、scrape 時優先採用（不被 prometheus override）。

---

## R-3 — 044-R2 axum MatchedPath layer 順序 spike（FR-007 對齊）

### R-3.1 — axum 0.8 MatchedPath API

axum 0.8 提供 `axum::extract::MatchedPath` extractor：

```rust
use axum::extract::MatchedPath;

async fn middleware(
    matched_path: Option<MatchedPath>,
    req: Request,
    next: Next,
) -> Response {
    let route_template = matched_path
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| "unmatched".to_string());
    // ... record histogram with route_template label
}
```

### R-3.2 — layer 順序需求

`MatchedPath` 在 axum router internal 內 inject 進 request extensions、需 middleware **在 router routes 已 matched 後** extract 才能拿到。

- 若 middleware 加在 router 內部（per-route layer / route group layer）→ MatchedPath 可 extract（推薦）
- 若 middleware 加在 router 外部（outermost、套在 Router 上）→ MatchedPath 可能不可 extract（fallback `"unmatched"`）

### R-3.3 — 既有 rust-api instrument middleware 位置

`server/core/src/web/operation_log.rs` 內 OperationLogLayer（per 042 sprint mount in `apply_layers` innermost、tower-http TraceLayer 同套）—— innermost 即「router 內部、routes 已 matched 後」、應該 extract MatchedPath OK。

### R-3.4 — Spike confirm

Phase 1 開始前實機 spike：
```rust
// 在 OperationLogLayer middleware fn 內加：
let mp = req.extensions().get::<MatchedPath>().cloned();
tracing::debug!(matched_path = ?mp.as_ref().map(|p| p.as_str()), "spike");
```

跑 curl 多 endpoint 看 log、確認 MatchedPath 可 extract、值為 template path（如 `/role/{id}`）。

### R-3.5 — Fallback strategy

若 spike 失敗 / layer 順序需重 arrange、fallback：
- (a) middleware 改加在 router internal（重新 organize layer order）
- (b) 用 `request.extensions().get::<MatchedPath>()` clone、middleware 不直接接 extractor
- (c) record `"unmatched"` 為 label value（cardinality leak prevention）

### R-3.6 — Decision

**首選**：直接用 `Option<MatchedPath>` extractor + fallback `"unmatched"`；Phase 1 spike 確認可行。

---

## R-4 — DESIGN-W-BASE-WEB.md §4.4.3 050 entry wording 設計（FR-001 對齊）

### R-4.1 — 對齊既有 §4.4.1 + §4.4.2 體例

§4.4.1 047.5 retrospective 結構：
- **日期**
- **commits**：commit hash + 一句話描述
- **scope**：env-repair adjacent fixes
- **acceptance**：「048 期間 C-V2/C-V3 從 baseline broken → 0 error」
- **spec**：N/A（無獨立 sprint spec）

§4.4.2 049 sprint 結構：
- **日期**
- **commit**：outer + merge + base-web SHA
- **scope**：bullet list comprehensive audit + 7 改動列舉
- **觸發**：「048-N1 (a)+(b)+(c) follow-up 結案 + pnpm 11+ best practice 對齊」
- **acceptance**：「C-V1~C-V10 全 PASS（含 CDP browser smoke 8 路徑）」
- **spec**：`specs/049-base-web-dep-hygiene/`

### R-4.2 — 050 entry wording

```markdown
#### §4.4.3 050 spec-hygiene-pass-4（post-merge review-derived hygiene、TS-DepGraph-Hygiene 軌道 dynamic 行使首例）

- **日期**：2026-05-25 落地
- **commit**：outer `<TBD post-merge>` + merge `<TBD>` + base-web `<TBD>` + rust-api `<TBD>`
- **scope**（軌道內限）：
  - 049-R1 base-web/Dockerfile line 35-42 stale comment block 改為「pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005)」描述（撤回 047.5 retro 期間 outdated hoisted reference + .npmrc shamefully-hoist=true 註解）
- **觸發**：050 sprint 為 post-merge code review 衍生 follow-up 結案載體（5 Important + 1 Polish bundled mixed sprint）；軌道內 049-R1 為其 Polish 條目
- **acceptance**：C-V1~C-V10 全 PASS（含軌道紀律 boundary verify、grep base-web/Dockerfile 確認 stale ref 清乾淨）
- **spec**：[`specs/050-spec-hygiene-pass-4/`](../specs/050-spec-hygiene-pass-4/)
- **軌道授權說明**：本 sprint 為 TS-DepGraph-Hygiene 軌道 **dynamic 文件權威首次行使**（per Constitution v1.6.0 既有設計、無需 amendment）—— 加本 §4.4.3 entry 至 DESIGN 文件即取得授權；同 W-FW9 對 DESIGN-W-WEBUI.md §7 dynamic 體例
```

**估行數**：~25 line

---

## R-5 — 046 spec.md FR-015 amend wording 設計（FR-002 對齊）

### R-5.1 — 046 spec FR-015 現況

`specs/046-spec-hygiene-pass-3/spec.md` 內 FR-015 原 wording（per 046 spec docs）：
```
**FR-015**: implementer-stage expansion 拾取上限 MUST ≤ 3 處；候選由 Phase 0 research grep 後拍板；超限拒絕並登記 046+ follow-up。
```

### R-5.2 — Amend wording（per Clarifications Q? + brainstorm Q6）

```
**FR-015**: implementer-stage expansion 拾取上限 base **≤ 3 處**；user 拍板可加大、需於 commit message body 明示拍板原委 + budget enlargement 計數；候選由 Phase 0 research grep 後拍板；超限（無 user 拍板）拒絕並登記 046+ follow-up。

> **2026-05-25 retro footnote**：046 sprint US4 implementer-stage expansion 實際 18 sites（17 display_id + 1 home_route_name + dev-dep `tokio "time"` feature）為 pre-existing E0063 build-gate fix、user 拍板加大、屬本 generalized wording 首次行使（050 sprint 補 retro）。
```

### R-5.3 — INTEGRATION-CHECKLIST 046 entry footnote

INTEGRATION-CHECKLIST 內 046 milestone entry（line 99）末尾「下一步：047 sandbox-protect-route-fix...」前加 footnote：

```markdown
> **046 entry budget enlargement footnote（050 retro 補登）**：046 US4 implementer-stage expansion 實際 18 sites（17 display_id ActiveModel/Model field + 1 home_route_name）+ dev-dep `tokio "time"` feature flag 為 pre-existing E0063 build-gate fix、user 拍板加大；屬 046 spec FR-015 generalized amend 後（050 sprint 落地）的首次行使。
```

**估行數**：spec.md ~5 line edit + INTEGRATION-CHECKLIST ~3 line footnote

---

## R-6 — Implementer-stage Expansion 候選（per FR-014 base ≤3 + user 拍板可加大）

### R-6.1 — 候選 (a)：036-R1 cascade 影響其他 systemManage handler

per R-1.5 cascade audit、036-R1 fix limited to `update_menu_for_systemmanage`、無 cascade impact、無 expansion 觸發。**0 site**。

### R-6.2 — 候選 (b)：044-R1 cascade 影響 grafana dashboard alert rule

044 sprint declared `cleanup_job_rows_deleted_total` 為 metric series、但無 alert rule（per 044 spec.md FR-005 8 metric / 6 alert）—— 050 補 instrument 後是否需加 alert? 例如「cleanup_job 24h 無 push = 異常」？

**Decision**：屬 044-R1 fix 的合理 cascade、但「24h 無 push = 異常」屬 monitoring policy 議題、不在 spec hygiene-pass 範疇；plan 階段 0 主動拾取、留 future feature；implementer 拒拾。

### R-6.3 — 候選 (c)：044-R2 cascade 影響既有 dashboard panel query

044 sprint 6 dashboard panel 可能 query 內含 raw URI path（如 `http_request_duration_seconds_count{route=~"/role/.*"}`）—— 050 改 template path 後 panel query 是否要更新？

**Decision**：implementer Phase 1 跑 grafana provisioning grep + curl panel JSON 看 query string、確認改動範圍；若 ≤3 panel query 需動、拾取 expansion；若 >3、user 拍板。預估 ≤3 panel（因 route label 之前剛 added 044 期、panel query 可能還未 finalize route filter）。

### R-6.4 — R-6 總結

| 候選 | 來源 | 內容 | 估計 | Decision |
|---|---|---|---|---|
| (a) | R-1.5 audit | 036-R1 cascade 影響其他 systemManage handler | 0 site | 不拾 |
| (b) | R-9 audit | 044-R1 cascade 加 cleanup_job alert rule | ≤1 alert | 不拾、留 monitoring policy 議題 |
| (c) | implementer Phase 1 | 044-R2 cascade 影響 dashboard panel query | ≤3 panel query | implementer Phase 1 grep audit 後拍板（base budget 內） |

**Decision**：base ≤3 budget 內、候選 (c) 為主要 expansion 候選（≤3 panel query）；超限拒拾、登 050+ follow-up。

---

## Phase 0 結論

6 個 research item 全 resolve、precise pattern 確認、wording 拍板：

| Open Q | Decision | 依據 |
|---|---|---|
| 036-R1 DTO pattern | `Option<Option<T>>` double-option（首選）/ update mask（fallback）；implementer Phase 1 spike 1-2 hr | R-1 |
| 044-R1 pushgateway image | `prom/pushgateway:v1.10.0` per Clarifications Q1 | R-2.1 |
| 044-R1 recorder crate | 沿用 `metrics-exporter-prometheus` + feature flag `"push-gateway"` | R-2.2 |
| 044-R1 push pattern | `with_push_gateway` + on-exit flush | R-2.3 |
| 044-R2 axum API | `Option<MatchedPath>` extractor + fallback `"unmatched"` | R-3 |
| DESIGN §4.4.3 wording | ~25 line 對齊 §4.4.1/§4.4.2 體例 | R-4 |
| 046 spec FR-015 amend wording | base ≤3 + user 拍板可加大 + commit msg 紀錄 + 046 retro footnote | R-5 |
| Expansion 候選 | (a) 0 site / (b) 不拾 / (c) ≤3 panel query 拾取（implementer 拍板）| R-6 |

**Ready for Phase 1**：Phase 0 outputs feed Phase 1 design（data-model.md + contracts/ + quickstart.md）。
