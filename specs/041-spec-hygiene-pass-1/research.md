# Phase 0 Research — 041 spec-hygiene-pass-1

**日期**：2026-05-24
**Phase**：Phase 0（research、resolve NEEDS CLARIFICATION + 驗 brainstorm 假設）
**前置**：[`spec.md`](./spec.md)（含 Clarifications session 2026-05-24 Q1 = 全 router scope）

依 [`CLAUDE.md §3 Phase 0 research 紀律`](../../CLAUDE.md)（040 落地後加入）：必含實際 grep 結果、不信 brainstorm 階段的命名/抽象假設。

---

## R-1: rust-api tower-http dep + NormalizePathLayer feature flag 狀態

**Decision**: 用 `tower_http::normalize_path::NormalizePathLayer::trim_trailing_slash()`，須在 `rust-api/server/initialize/Cargo.toml` 加 `"normalize-path"` feature flag。

**Rationale**:
- `rust-api/Cargo.toml:48`：`tower-http = "0.6"` 已是 workspace dep（無新 crate）。
- `rust-api/server/initialize/Cargo.toml:26`：`tower-http = { workspace = true, features = ["trace"] }` —— 當前只開 `trace` feature。`NormalizePathLayer` 在 `normalize-path` feature 下、須補開。
- 全 rust-api codebase grep `tower_http::` 只有 1 處（`server/initialize/src/router_initialization.rs:30` 的 `TraceLayer`），無既有 `NormalizePath` 使用、無 conflict。

**Alternatives considered**:
- 自實作 middleware：拒——`trim_trailing_slash` 是 4 行邏輯但屬於 tower-http 標準 layer、有測試覆蓋、無自實作必要。
- 用 axum 內建 `redirect_to`：拒——302 redirect 需 client 多一 round-trip、不如 internal normalize 透明。

---

## R-2: rust-api router compose 結構 + NormalizePathLayer 插入點

**Decision**: 在 `rust-api/server/bin/src/main.rs:30` `initialize_admin_router()` 回來後、`axum::serve` 之前、用 `NormalizePathLayer::trim_trailing_slash().layer(app)` 包整個 Router。

**Rationale**:
- `initialize_admin_router()` 在 `rust-api/server/initialize/src/router_initialization.rs:99` 定義、返 `Router`。它內部已 compose 完所有 sub-router（authentication / authorization / protected / menu / protected_menu / user / domain / role / endpoint / access_key / login_log / operation_log / organization / sandbox / mock / system_manage / /health）+ fallback `handler_404`。
- caller 為 `rust-api/server/bin/src/main.rs:30`：`let app = server_initialize::initialize_admin_router().await;`，之後 axum serve。
- NormalizePathLayer 屬於「path 改寫」layer、依 tower-http 文件須 wrap 在 routing **之前**——這意味著 layer 須包**整個 Router**（含 fallback）、不能放在 sub-router 內部（會錯過 sub-router 之間 dispatch 階段）。
- 兩個合法插入點：
  - (a) `initialize_admin_router()` 內部、`return app` 前 wrap：缺點是返回型由 `Router` 改 `NormalizePath<Router>`、影響既有 tests（`server/initialize/tests/auth_login_e2e.rs:113` 也呼叫）。
  - (b) main.rs `serve` 前 wrap：clean、不影響函式簽名、不影響 test（test 自呼 `Router`、不經 main、若要測 trailing-slash 行為加獨立 test）。

→ **採 (b)**：main.rs `serve` 前一行 wrap。

**Alternatives considered**:
- 在 `apply_layers()` 函式內加：拒——`apply_layers` 是 per-sub-router 包 trace/casbin/jwt 等、若每 sub-router 各加一個 NormalizePathLayer 違反 Clarifications 2026-05-24 的「單一外層 layer」決議。
- 改寫 `initialize_admin_router()` 返回型：拒——副作用大、影響 tests。

**Layer 順序確認**（per FR-009）：
- (b) 在 axum serve 前 wrap 整個 app；所有 sub-router 的 trace/casbin/jwt/api-key middleware 都在 NormalizePathLayer **之內**（更深層）。
- request 到達順序：NormalizePathLayer（最先處理 path）→ axum routing → sub-router middleware（含 casbin enforce、看到 normalized path）。✅ 滿足 FR-009。

---

## R-3: 7 處 spec rot 實際內容驗證（per CLAUDE.md §3 grep 紀律）

逐條 grep、確認 brainstorm/spec 描述與檔案實際內容是否對齊。

### ① 030 C-V8/9（FR-001）— ✅ 對齊

grep `specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md`：
- Line 90: `## C-V8 [US3]: create user 帶 gender`
- Line 95（payload）：`-d '{"domain":"built-in","username":"GenderTest030","password":"123456","nickName":"GenderTest","status":"enabled","gender":"male"}'`
- Line 124（update payload）：`-d "{\"id\":\"$GTID\",\"domain\":\"built-in\",\"username\":\"GenderTest030\",\"password\":\"123456\",\"nickName\":\"GenderTest\",\"status\":\"enabled\",\"gender\":\"female\"}"`

**確認的 rot**：`username`→`userName`、`gender`→`userGender`（共 4 處 string）。`domain`/`password`/`nickName`/`status` 為**正確** camelCase、不動。

**實作策略**：4 處 string replace + 補一行 errata 註明命名 rename 源自 W-FW5/039 後。

### ② 039 C-V31（FR-002）— ⚠️ Spec 假設與實情有出入

grep `specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md`：
- Line 37：`| C-V31 | regression W-FW5/W-FW6/W-FW7 | curl `/api/auth/changePassword` (W-FW5 自助改密碼)、curl `/api/systemManage/getRoleHome/<i64>` + updateRoleHome (W-FW6 N2)、curl getMenuList/v2 顯示 query/buttons/fixedIndexInTab (W-FW7) —— 全 envelope 0 |`
- **全 specs 樹 grep `oldPassword` → 0 hit**（連 035、其他都沒有）

**實情**：039 C-V31 是 summary 表格描述、**無實際 curl payload bash block**。Group D regression agent 自己拼 payload 時憑慣例用 `oldPassword`、被 rust DTO 拒（rust DTO 用 `currentPassword`），改 `currentPassword` 後 PASS。

**真正的 rot**：039 C-V31 缺 concrete curl example、operator 須自行猜 payload。spec 原 FR-002「string replace」假設誤、實際需要的是「**augment** 該 C-V31 row 加 payload example」。

**實作策略**（plan 階段執行）：
- 不做 string replace。
- 改為**新增**一段獨立 `### C-V31a [regression W-FW5]: changePassword` 子節（緊跟 line 37 後）、含完整 curl payload bash block：
  ```bash
  curl -fsS -X POST "http://127.0.0.1:11080/api/auth/changePassword" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"currentPassword":"123456","newPassword":"new_pwd_xyz"}'
  ```
- 加 errata 一行：「`currentPassword`（非 `oldPassword`、per W-FW5 035 spec/research.md）」。

**FR-002 spec wording 處理**：本研究結果 surface 後、原 FR-002 字面「使用 `currentPassword`（非 `oldPassword`）」對 implementer 仍可解讀（intent 對、precision 偏差）。**保留 FR-002 wording**、在 plan 階段 implementation 解釋為「augment 而非 replace」；待 /speckit-analyze 階段再決定是否需 spec.md 修字。

### ③ 040 C-V10/12（FR-003）— ✅ 對齊

grep `specs/040-wire-id-consistency/contracts/verification-commands.md`：
- Line 16：`| C-V10 | D1+D4 sys_role 分頁 list | curl `GET /api/role/list?current=1&size=10` → envelope 0、... |`
- Line 18：`| C-V12 | D2+D5 sys_user raw endpoint | curl `GET /api/user/<i64>` → 同 C-V9 pattern；curl `GET /api/user/list` → 同 C-V10 pattern |`

**確認的 rot**：`/api/role/list` 與 `/api/user/list` 各 1 處。實際 endpoint 為 `/api/role` 與 `/api/user`（root paginated、無 `/list` suffix）。

**實作策略**：2 處 string replace + 補一行 errata 註 paginated root pattern「rust-api 慣例：list endpoint = root path GET，不用 `/list` suffix」。

### ④ 022 C-V3（FR-004）— ✅ 對齊

grep `specs/022-manage-crud-alignment/contracts/verification-commands.md`：
- Line 74（Goal）：`...response data 含 base TS type 預期 field name + 缺欄位 hardcode null/[]。`
- Lines 130–140（expected output 描述）：
  - `userGender` 為 `null`（hardcode None per Q2）
  - `userRoles` 為 `[]`（hardcode vec![] per Q2）
  - `buttons` / `children` 為 `null`（hardcode None）
- Lines 145–149（Pass criteria）：`C-V3c userGender:hardcode None`、`C-V3d buttons/children null`

**確認的 rot**：F8/039 已實裝 `userGender`/`userRoles`、不再 hardcode null/[]。Group D regression 實測：`userGender='1' not null`、`userRoles=['ROLE_SUPER'] not []`。`buttons`/`children` 仍 hardcode null（不算 rot、跟此 feature 無關）。

**實作策略**：
- Line 74 Goal 描述：「缺欄位 hardcode null/[]」改「實作裝載 user/role 等實值；少數欄位（如 menu buttons/children）仍 hardcode null/[]」。
- Lines 130–140 expected：`userGender` 改「為 string（"1" male / "2" female）或 null（未設值）」；`userRoles` 改「為 string[] of role codes（如 `['ROLE_SUPER']`、`['ROLE_ADMIN','ROLE_USER']`）」。
- Lines 145–149 pass criteria：對應 update。
- 補一行 errata 註 F8/039 後實值化。

### ⑤ 021 C-V10（FR-005）— ✅ 對齊（且行為由 ⑧ middleware 改變）

grep `specs/021-systemmanage-alias-router/contracts/verification-commands.md`：
- Line 442：`## C-V10: 既有 /user/* /role/* /route/* 3 條 endpoint 不退化(per spec US3.3 + SC-009 + FR-014)`
- Line 448：`echo "=== C-V10a: 既有 GET /user/ ==="`
- Line 453：`echo "=== C-V10b: 既有 GET /role/ ==="`
- Line 458：`echo "=== C-V10c: 既有 GET /route/tree ==="`

**確認的 rot**：C-V10a/b 用 `/user/` `/role/` trailing slash 形式（regression 證 404）。

**實作策略**：
- C-V10a/b 主命令 URL 改 `/user?page=...` `/role?page=...`（無 slash、保守確定 PASS）。
- 加一行 errata：「（041 NormalizePathLayer 後、`/user/` `/role/` trailing slash 形式亦回 HTTP 200）」。
- C-V10c 用的是 `/route/tree`（非 trailing slash 結尾、無需改）。

### ⑥ 021 C-V2（FR-006）— ✅ 對齊

grep `specs/021-systemmanage-alias-router/contracts/verification-commands.md`：
- Line 38：`## C-V2: migration init container rerun + 20 row 落 casbin_rule`
- Line 490（summary table）：`| C-V2 | migration rerun + 20 row | COUNT = 20 + ... |`

**確認的 rot**：spec 硬編碼 `20 row` / `COUNT = 20`；Group C 實測 50 row（25 endpoint × 2 role、含 040 加 addMenu/addRole/deleteMenu 等）。

**實作策略**：
- Line 38 標題：`20 row` 改 `≥20 row（成長中）`。
- Line 490 summary：`COUNT = 20` 改 `COUNT ≥ 20`。
- 補一行 errata：「（隨後續 feature 新增 systemManage alias 而成長；2026-05-24 regression 實測 50）」。

### ⑦ F3-N5（FR-007）— ✅ 對齊（+ comment block 內容修正）

grep `specs/002-soft-delete-infrastructure/data-model.md`：
- Line 121：`## E4. `SoftDeletable` trait（簡化版、per R4 decision）`
- Line 158：`// server/core/src/db/soft_delete.rs（同檔內）`（comment block 內、code fence 開頭）
- Lines 160–168：7 個 `impl SoftDeletable for ...` block 範例

實際 impl 位置 grep：
- `rust-api/server/model/src/admin/soft_delete_impls.rs` — **真正** 7 個 `impl SoftDeletable` block 落點（line 16/21/26/31/36/41/46）。
- `rust-api/server/core/src/db/soft_delete.rs` — **只有** trait definition + 預設 method、無 impl block。

**確認的 rot**：§E4 範例 comment `// server/core/src/db/soft_delete.rs（同檔內）` 誤導——實 impl 在 `server/model/src/admin/soft_delete_impls.rs`（model crate）、不在 `server/core/src/db/soft_delete.rs`（core crate、trait def 處）。當初應為 F3 brainstorm 期推測位置、後 implementer 移到 model crate（避循環依賴、見 F3 R6）但未回 update spec。

**實作策略**：1 行 string replace：`// server/core/src/db/soft_delete.rs（同檔內）` → `// server/model/src/admin/soft_delete_impls.rs（model crate、避循環依賴 per F3 R6）`。

---

## R-4: dev stack baseline 與 acceptance 驗證 cost

**Decision**: rust-api build + dev stack restart（per CLAUDE.md memory `reference_image_build.md`：`docker build -t rust-api:rev1-admin-rust-api ./rust-api`、然後 `docker compose ... up -d --wait rust-api`）。

**Rationale**:
- 改 `rust-api/server/initialize/Cargo.toml` + `rust-api/server/bin/src/main.rs` → 須重 build rust-api image。
- compose 無 build: 段、必須手動 `docker build` 再 up（per memory）。
- dev stack 已健康（5 service：postgres/redis/rust-api/front-nginx/base-web）、其他 service 不動。

**Alternatives considered**:
- host `cargo build` 跑 binary：拒——dev stack 用 container、test runtime 與 prod 不一致。
- full `down -v + up -d --wait`：拒——過殺、無需動 DB volume。

**Acceptance verify steps**（plan / quickstart 細化）：
1. `docker build -t rust-api:rev1-admin-rust-api ./rust-api`
2. `docker compose ... up -d rust-api --force-recreate --wait`
3. 跑 contracts/verification-commands.md 全 C-V

---

## R-5: 不需要 data-model.md

**Decision**: 本 feature 跳過 `data-model.md` 產出。

**Rationale**:
- spec FR-010 明示「0 schema migration、0 新 entity」。
- 7 處 spec md edit + 1 處 rust-api middleware change，無新 entity、無新欄位、無 state 機。
- per plan template「Define interface contracts (if project has external interfaces)... Skip if project is purely internal」精神同類延伸。

---

## R-6: Acceptance contracts 結構

**Decision**: 用 `contracts/verification-commands.md`（同 030–040 體例）、不另開 `contracts/<api-spec>.yaml`。

**Rationale**:
- 本 feature 不引入新 API endpoint、只動現有 endpoint behavior（trailing slash）+ spec md。
- C-V 結構（curl/psql/grep 命令 + Expected）足以涵蓋。

---

## NEEDS CLARIFICATION resolved

- Spec 階段已有 1 個 Clarification（Session 2026-05-24 Q1 NormalizePathLayer scope）。
- Phase 0 grep 後**無新 NEEDS CLARIFICATION**。
- FR-002 的「假設與實情出入」由 plan 階段以「augment 而非 replace」策略處理、不再 round-trip 回 /speckit-clarify。

---

## Phase 0 結論

- 7 處 spec rot 中 6 處精準對齊 brainstorm 描述（FR-001/003/004/005/006/007）—— 直接做。
- 1 處（FR-002）描述偏差（無 `oldPassword` 字串可 replace）—— 策略改 augment，FR-002 wording 保留。
- 1 處 code change（FR-008/009 / NormalizePathLayer）—— dep 已備、feature flag 需開、插入點為 main.rs `serve` 前。
- 0 個 NEEDS CLARIFICATION 殘留。

Ready for Phase 1（contracts / quickstart / agent context update）。
