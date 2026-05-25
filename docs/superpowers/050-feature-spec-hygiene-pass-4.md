# 050 spec-hygiene-pass-4 — brainstorm 設計

> **日期**：2026-05-25
> **狀態**：brainstorm 拍板完成、待 `/speckit-specify` 起 SDD 設計鏈
> **觸發來源**：post-merge code review (specs/030-049 對照 spec.md 跑 superpowers:requesting-code-review、登記 8 個 R-row follow-up 到 INTEGRATION-CHECKLIST 衍生 backlog)
> **體例對齊**：041 / 043 / 046 三 spec-hygiene-pass 沿革；040 W-FW9 mixed 軌道 sprint 沿革

---

## §1 Background

2026-05-25 對 specs 030~049 跑 post-merge code review、回報 14 PASS / 6 PARTIAL / 2 Critical：

- **Critical**（dedicated sprint 範疇、**本 sprint 不處理**）：038-R1 FR-008 audit/Casbin atomicity + 039-R1 5 endpoint raw Model wire shape leak
- **Important**（本 sprint 處理、5 條）：036-R1 / 037-R1 / 044-R1 / 044-R2 / 046-R1
- **Polish**（base-web 註解 cleanup、軌道內）：049-R1

5 條 Important + 1 條 Polish = 6 issues bundled、跨 2 軌道（軌道外 + TS-DepGraph-Hygiene 軌道內）；本 sprint 以 mixed 軌道 sprint（per 040 W-FW9 體例）一次清完。

---

## §2 軌道辨識 + Constitution Check

### §2.1 軌道分類

| 軌道 | 範圍 | 本 sprint 命中 |
|---|---|---|
| **TS-DepGraph-Hygiene 軌道**（DESIGN-W-BASE-WEB.md §4） | base-web build/dep config | 049-R1（base-web/Dockerfile line 35-42 comment polish） |
| **軌道外** | rust-api + spec docs + infra | 036-R1 / 037-R1 / 044-R1 / 044-R2 / 046-R1 |

軌道內 049-R1 透過 Constitution v1.6.0「DESIGN doc dynamic 文件權威」首次行使—— 在 DESIGN-W-BASE-WEB.md §4.4.3 加 050 sprint condition entry、取得授權、**無需 Constitution amendment**。同 W-FW9 對 W-WEBUI 軌道 §7 dynamic 行使體例。

### §2.2 Constitution Principle 對照

| Principle | 評估 | 狀態 |
|---|---|---|
| **I RBAC Fail-safe** | 037-R1 補 Casbin grouping rule (ptype='g') sync、強化既有 Casbin 一致性、不動 enforcement model | ✅ PASS |
| **II Audit + Soft Delete** | 036-R1 selective merge 不影響 audit pipeline；既有 `audit_snapshot` 自動涵蓋變更欄位 before/after | ✅ PASS |
| **III 嚴版禁 Forward** | 0 跨服務 HTTP 呼叫、無新 endpoint、pushgateway 為 prometheus 內部 push model（非業務 HTTP） | ✅ PASS |
| **IV base 不改動邊界** | 049-R1 屬 TS-DepGraph-Hygiene 軌道、DESIGN §4.4.3 註冊條目即取得授權；其他 5 條軌道外、0 base-web src/ diff | ✅ PASS |
| **V 漸進收縮** | 0 nestjs、純 hygiene fix | ✅ PASS |

**Constitution Check**: 5/5 PASS、Complexity Tracking 空白、**0 amendment**。

---

## §3 Scope: 6 issues 拍板

### §3.1 036-R1 — FR-004 omitted 不覆寫 drift

**問題**：spec 036 FR-004 明示「omitted (missing key/null) MUST NOT 覆寫既有值」、但實作為 full overwrite (per W-FW7 `update_menu_for_systemmanage` handler)；C-V6 acceptance 被 relax 對齊 impl、spec 文字未 amend。

**拍板**：**Impl fix 為 selective merge**（保留 spec promise）。

**改動範圍**：
- rust handler `update_menu_for_systemmanage` 改 selective update：incoming missing/null 則 preserve `before_row` 值
- DTO 設計 `Option<Option<T>>` double-option pattern（`None` = field 未送、`Some(None)` = explicit clear、`Some(Some(v))` = set value）；或用 update mask + per-field check
- 對 `query` / `buttons` / `fixed_index_in_tab` 3 nullable field 同步施作
- C-V6 acceptance 補 partial update test（送一個 menu update 含 `name` 改、`query` 不送、確認 DB `query` 未被 NULL 覆蓋）

**改動 file**：
- `rust-api/server/service/src/admin/sys_menu_service.rs`（selective merge logic）
- `rust-api/server/model/src/admin/input/sys_menu.rs`（DTO double-option 設計）
- 視 cascade 可能影響 `SystemManageUpdateMenuInput` shape

### §3.2 037-R1 — Casbin grouping rule (ptype='g') 未 sync

**問題**：037 `update_role` 改 code 時 txn 內 UPDATE `casbin_rule SET v0=$1 WHERE ptype='p' AND v0=$2`、未含 `ptype='g'` v1；當前 0 g rule（W-FW8 button-auth 用 p rule、無 g rule）故 empirically safe、但未來插 g rule 時 silent orphan。

**拍板**：**加 defensive UPDATE for ptype='g' v1**。

**改動範圍**：
- rust `update_role` 在 txn 內加 1 SQL: `UPDATE casbin_rule SET v1=$1 WHERE ptype='g' AND v1=$2`（idempotent on empty set）
- audit_log payload 加 `g_rules_updated_count`（optional）紀錄 sync 結果
- 補 GeneralUser deny C-V test（Casbin 拒絕 GeneralUser update_role）—— 037 review 提到 FR-006 未測 deny path

**改動 file**：
- `rust-api/server/service/src/admin/sys_role_service.rs`（+1 SQL line in `update_role` txn）

### §3.3 044-R1 — cleanup_job_rows_deleted_total silent no-op

**問題**：`cleanup_job_rows_deleted_total` metric 在 cleanup binary 內有 7 sweep fn increment、但 cleanup binary 是獨立 cron-driven process（不是 long-running service）、無 `PrometheusBuilder` recorder install → counter increment 全 silent no-op；FR-005 列為 active 但實質 declared-0；alert + dashboard panel 永遠空。

**拍板**：**Install pushgateway**（per user 拍板的「重」路線）。

**改動範圍**：
- (a) `docker-compose.observability.yml` 加 prometheus pushgateway service（image `prom/pushgateway:latest`、port 9091、healthcheck）
- (b) `rust-api/server/cleanup/src/main.rs` + `Cargo.toml` 加 `metrics-exporter-prometheus` pushgateway recorder install + on-exit flush（每 cron run 末端 push 一次到 pushgateway）
- (c) `deploy/prometheus.yml` 加 scrape job `pushgateway`（拉 pushgateway 暫存的 metric series）
- (d) `deploy/grafana-provisioning/dashboards/` 對應 dashboard panel 移除「no data」placeholder 註

**改動 file**：
- `docker-compose.observability.yml`（+1 service block）
- `rust-api/server/cleanup/Cargo.toml`（+1 dep）
- `rust-api/server/cleanup/src/main.rs`（recorder install + on-exit flush）
- `deploy/prometheus.yml`（+1 scrape job）
- `deploy/grafana-provisioning/dashboards/*.json`（移 placeholder 註）

### §3.4 044-R2 — http_request_duration_seconds.route cardinality

**問題**：`http_request_duration_seconds.route` label 用 raw URI path（含 ID 如 `/role/123` / `/role/456` 為不同 series）、cardinality 爆炸風險、不相容 spec Edge Cases 的 7-day retention 假設；044 source comment 承認但 code 仍 ship。

**拍板**：**axum MatchedPath template**。

**改動範圍**：
- rust server/core instrument middleware（操作 `http_request_duration_seconds` histogram 處）改用 `axum::extract::MatchedPath` extractor 拿 route template（`/role/{id}`）取代 raw URI path
- 若 MatchedPath 在 middleware 取不到（layer 順序問題）、降級用 `request.extensions().get::<MatchedPath>()` 或 fallback 為「unmatched」（避免 cardinality leak）
- spec 044 FR-005 `route` label description 補明示「為 axum template path、含 path params placeholder」

**改動 file**：
- `rust-api/server/core/src/web/operation_log.rs` 或 instrument middleware 對應檔（route extract logic）
- `specs/044-observability-and-cleanup-pass/spec.md` FR-005 wording polish（route label 描述）

### §3.5 046-R1 — FR-015 expansion budget breach

**問題**：spec 046 FR-015 明示 ≤3 expansion budget、但 046 實際 18 sites（17 display_id + 1 home_route_name）+ dev-dep `tokio "time"` feature；user 口頭加大但 spec.md / FR-015 未 amend。

**拍板**：**Amend FR-015 generalized**。

**改動範圍**：
- `specs/046-spec-hygiene-pass-3/spec.md` FR-015 wording 改為：「base ≤3 expansion budget；user 拍板可加大、需於 commit message body 明示拍板原委 + budget enlargement 計數」
- INTEGRATION-CHECKLIST 046 entry 加 footnote 紀此次 budget enlargement 為 retro precedent（17 display_id + 1 home_route_name 為 pre-existing E0063 build-gate fix、user 拍板）
- **本 sprint（050）自身 FR 跟從新 wording**：base ≤3、若 implementer-stage 發現需加大、user 拍板後 commit message 明示

**改動 file**：
- `specs/046-spec-hygiene-pass-3/spec.md` FR-015 wording
- `docs/INTEGRATION-CHECKLIST.md` 046 entry footnote

### §3.6 049-R1 — Dockerfile stale comment block

**問題**：base-web/Dockerfile line 35-42 註解仍 claim `nodeLinker: hoisted` active + `.npmrc shamefully-hoist=true 仍保留 (pnpm 10 fallback、無 harm)`、但 049 已撤回；polish commit `f6efe906` 只修 line 9 漏這 block；未來 reader 會被 mislead。

**拍板**：**改為「strict isolation 紀律說明」**。

**改動範圍**：
- `base-web/Dockerfile` line 35-42 8 行 block 整段 replace：
  ```
  # pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005):
  # - package.json packageManager field 是唯一 pnpm 版本 source of truth
  #   (host + container 共享、取代 047.5 retro 期間的 Dockerfile ARG)
  # - 4 phantom transitive 已提為 explicit devDeps、無需 hoist
  # - --ignore-scripts 保留: pnpm 11 strict mode 拒絕 transitive build script
  #   (esbuild / simple-git-hooks / unrs-resolver / etc.)、container 無互動 shell
  ```
- 對齊 049 FR-004/005 + 047.5 retrospective entry（DESIGN-W-BASE-WEB.md §4.4.1）

**改動 file**：
- `base-web/Dockerfile`（line 35-42 8 行 comment polish、無實質 code 改動）

---

## §4 Architecture / Commit shape

### §4.1 改動 file 分類（per 軌道）

```
== TS-DepGraph-Hygiene 軌道內 (base-web worktree 1 commit) ==
base-web/
└── Dockerfile (line 35-42 comment polish only、無 code 改動)

== 軌道外 (rust-api worktree 1 commit、bundled 4 issues) ==
rust-api/
├── server/service/src/admin/sys_menu_service.rs        (036-R1 selective merge)
├── server/model/src/admin/input/sys_menu.rs            (036-R1 DTO double-option)
├── server/service/src/admin/sys_role_service.rs        (037-R1 ptype='g' defensive)
├── server/core/src/web/operation_log.rs                (044-R2 MatchedPath)
├── server/cleanup/src/main.rs                          (044-R1 pushgateway recorder)
└── server/cleanup/Cargo.toml                           (044-R1 +1 dep)

== 軌道外 outer rev1-admin-root (多 commit) ==
docker-compose.observability.yml                       (044-R1 pushgateway service)
deploy/
├── prometheus.yml                                      (044-R1 scrape job)
└── grafana-provisioning/dashboards/*.json              (044-R1 panel placeholder polish)
docs/
├── INTEGRATION-DESIGN-W-BASE-WEB.md                    (§4.4.3 050 sprint entry)
└── INTEGRATION-CHECKLIST.md                            (8 R-row 結案 + 050 milestone)
specs/046-spec-hygiene-pass-3/spec.md                  (046-R1 FR-015 amend + footnote)
CLAUDE.md                                               (SPECKIT marker)
```

### §4.2 Commit shape（estimated）

| Topic | est | files |
|---|---|---|
| **base-web worktree** | 1 commit | `Dockerfile` (line 35-42 polish) |
| **rust-api worktree** | 1 commit (bundled) | 6 file (036/037/044-R1/044-R2 4 issues) |
| **outer Phase 0** | 1 commit | DESIGN §4.4.3 050 entry + 046 spec FR-015 amend |
| **outer Phase 2** | 1 commit | docker-compose pushgateway + prometheus.yml + grafana |
| **outer SHA pin** | 1 commit | gitlink `base-web` |
| **outer SHA pin** | 1 commit | gitlink `rust-api` |
| **outer INTEGRATION-CHECKLIST** | 1 commit | 8 R-row 結案 + 050 milestone + SPECKIT |
| **outer SHA backfill** | 1 commit | placeholder 換真 SHA (post-merge) |

合計：base-web 1 + rust-api 1 + outer 5-6 commit；merge `--no-ff` 回 `rev1-admin-root`。Push / merge / backfill 須 user 同意（CLAUDE.md §5）。

---

## §5 Phase 設計

```
Phase 0 (合法化、必先)
   - DESIGN-W-BASE-WEB.md §4.4.3 050 entry 加 (049-R1 軌道內授權)
   - 046 spec.md FR-015 amend wording (046-R1 reconcile)
   - outer commit 1
        │
        ▼
Phase 1 (rust-api impl、bundled)
   - 036-R1 selective merge (sys_menu_service + DTO)
   - 037-R1 ptype='g' defensive (sys_role_service)
   - 044-R2 MatchedPath (operation_log middleware)
   - 044-R1 pushgateway recorder (cleanup binary + Cargo.toml)
   - rust-api worktree commit
        │
        ▼
Phase 2 (infra + base-web)
   - docker-compose pushgateway service + prometheus.yml scrape (044-R1)
   - base-web Dockerfile line 35-42 polish (049-R1)
   - base-web worktree commit
   - outer infra commit + 2 SHA pin commit
        │
        ▼
Phase 3 (Polish + acceptance + merge)
   - INTEGRATION-CHECKLIST 8 R-row 結案 + 050 entry
   - CLAUDE SPECKIT marker idle
   - C-V1~C-V10 acceptance run
   - merge --no-ff 回 rev1-admin-root
   - SHA backfill
```

---

## §6 Acceptance C-V matrix（est 10 contracts）

| C-V | Goal | 對應 issue |
|---|---|---|
| C-V1 | dev stack 13 service healthy（既有 12 + 新 pushgateway）+ rust-api drainer | infra baseline |
| C-V2 | cleanup binary 跑一次後 pushgateway 收到 7 sweep counter（curl pushgateway `/metrics` 看 series） | 044-R1 |
| C-V3 | prometheus `cleanup_job_rows_deleted_total{sweep="*"}` series 出現非 0 值（curl prom API） | 044-R1 |
| C-V4 | `http_request_duration_seconds.route` label 為 axum template path（grep series 內無 numeric ID） | 044-R2 |
| C-V5 | sys_menu partial update missing field preserves before_row（curl + psql before/after） | 036-R1 |
| C-V6 | role code rename + 模擬 insert g rule、確認 g rule v1 一併 sync casbin | 037-R1 |
| C-V7 | GeneralUser deny test (Casbin 拒絕 GeneralUser POST /role) | 037-R1 |
| C-V8 | 046 spec.md FR-015 wording amend grep + 046 entry footnote present | 046-R1 |
| C-V9 | base-web Dockerfile line 35-42 grep audit（無 `nodeLinker: hoisted` / `shamefully-hoist=true` ref、有 `strict isolation` keyword） | 049-R1 |
| C-V10 | DESIGN §4.4.3 050 entry grep + INTEGRATION-CHECKLIST 8 R-row 結案 + 050 milestone entry + SPECKIT marker idle | governance docs |

---

## §7 Implementer-stage Expansion 候選（per 新 FR-015 wording）

base ≤3 expansion budget；user 拍板可加大（commit message body 明示）：

| 候選 | 來源 | 內容 | 估計 |
|---|---|---|---|
| (a) | 036-R1 cascade | DTO `Option<Option<T>>` 改動可能影響其他 systemManage handler（如 `update_user_for_systemmanage` 是否亦該 selective）| TBD per audit |
| (b) | 044-R1 cascade | grafana dashboard panel 描述 / alert rule 對 cleanup metric 是否要新加（spec 044 declared-0 series 可能未含 alert） | ≤2 alert rule |
| (c) | 044-R2 cascade | 既有 6 dashboard panel 是否需 update query 對應新 route label shape | ≤3 panel query |

implementer 階段 audit 後確認、user 拍板拾取。

---

## §8 預估時間 + 風險

| Phase | 估時 |
|---|---|
| Phase 0 (governance + 046 spec amend、outer commit 1) | ~30 min |
| Phase 1 (rust-api bundled 4 issues) | ~90-120 min（036-R1 selective merge DTO 設計為主、044-R1 pushgateway recorder install ~30 min）|
| Phase 2 (infra + base-web Dockerfile) | ~30-45 min（pushgateway docker-compose + prometheus scrape ~20 min + base-web Dockerfile ~5 min + 2 SHA pin commit ~10 min） |
| Phase 3 (Polish + acceptance + merge + backfill、含 user 同意關卡) | ~30-45 min |
| **合計** | **~3.5-5 hr** |

### §8.1 風險點

1. **036-R1 DTO `Option<Option<T>>` 體例設計**：rev1 既有 codebase 可能沒此 pattern、需參考 sea-orm 或 serde 慣例；若選用 update mask（顯式 bitset / vec<field-name>）需 DTO shape 較大改動。Phase 1 開始前 spike 1-2 hr 確認可行 pattern。
2. **044-R1 pushgateway service**：新 infra service、prometheus 9091 port + docker-compose 設定可能撞 既有 service network alias 衝突；docker network 內 cleanup binary 連 pushgateway 需確認 service discovery 正常。
3. **044-R2 MatchedPath layer 順序**：axum MatchedPath extractor 需在 router 內 routes 已 register 後才能 extract、middleware layer 順序若不對會拿不到（fallback "unmatched"）。Phase 1 spike 確認 layer placement。
4. **037-R1 GeneralUser deny C-V**：可能需要建立測試 user 或 reset role（避免 dev 環境其他 user contamination）；簡單 curl + token 應該足夠。

### §8.2 Mitigation

- Phase 1 開始前先用 Explore subagent spike 036-R1 + 044-R2 兩個高風險點、確認 pattern 後再 spec.md FR 細節化
- Phase 2 pushgateway 部署測試先單獨 docker compose up 確認 healthy 再整合進 dev stack
- 全程 implementer-stage expansion ≤3 紀律維持、超限拒拾、登 050+ follow-up

---

## §9 紀律總結

- **限軌道內 1 file（base-web/Dockerfile comment polish）+ 軌道外 4 issues**；0 base-web src/ diff、0 rust-api 新 entity / schema migration
- **新 npm dep 0、新 cargo dep 1**（cleanup binary `metrics-exporter-prometheus` for pushgateway recorder）— 屬 044-R1 必要 infra
- **新 infra service 1**（prometheus pushgateway）— 屬 044-R1 必要、observability 軌道延伸
- **無 Constitution amendment**（dynamic doc 權威首次行使 via DESIGN §4.4.3 add entry）
- **SDD「先合法化、再執行」順序**：Phase 0 DESIGN §4.4.3 + 046 spec FR-015 amend 必先完成、Phase 1+ 才合法
- **5 條 Important + 1 條 Polish bundled** 一個 sprint、acceptance C-V1~C-V10 全綠才結案
- **push / merge / backfill 須 user 同意**（per CLAUDE.md §5）

---

## §10 brainstorm Q 拍板紀錄（per session 2026-05-25）

| Q | 拍板 | 影響 |
|---|---|---|
| Q1 軌道分類 | Mixed sprint (per 040 W-FW9 體例) | 整 sprint 跨 2 軌道、無 Constitution amendment |
| Q2 036-R1 | Impl fix selective merge | rust handler + DTO 改 selective、保留 spec promise |
| Q3 037-R1 | 加 defensive UPDATE for ptype='g' v1 + GeneralUser deny C-V | +1 SQL line + 1 C-V test |
| Q4 044-R1 | Install pushgateway | +1 infra service + cleanup binary recorder + scrape job |
| Q5 044-R2 | axum MatchedPath template | server/core middleware route extract 改 idiomatic axum |
| Q6 046-R1 | Amend FR-015 generalized | spec md edit + INTEGRATION-CHECKLIST footnote |
| Q7 049-R1 | Dockerfile comment 改 strict isolation 紀律說明 | 8 line comment block replace |

---

**Ready for `/speckit-specify`**：以本檔為 input、起 spec-kit 設計鏈（spec → plan → tasks → analyze → executing-plans）；spec_kit `before_specify` pre-hook 自動建 `050-spec-hygiene-pass-4` feature branch。
