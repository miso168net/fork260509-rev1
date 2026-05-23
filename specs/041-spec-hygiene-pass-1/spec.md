# Feature Specification: 041 spec-hygiene-pass-1

**Feature Branch**: `041-spec-hygiene-pass-1`
**Created**: 2026-05-24
**Status**: Draft
**Input**: User description: "041 spec-hygiene-pass-1: R4 (regression 2026-05-24 撞到 6 處 spec rot) + F3-N5 (F3 階段遺留) bundled — 7 處 spec md errata + 1 處 rust-api NormalizePathLayer。軌道外 rust-only + spec md。詳見 docs/superpowers/041-feature-spec-hygiene-pass-1.md brainstorm 文件"

**前置文件**：[`docs/superpowers/041-feature-spec-hygiene-pass-1.md`](../../docs/superpowers/041-feature-spec-hygiene-pass-1.md)（brainstorm 設計、scope 已敲定）

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Regression operator 重跑 C-V 不再踩 spec rot 坑 (Priority: P1)

整合維護者（人類或 AI）依 `specs/<NNN>/contracts/verification-commands.md` 重跑既有 feature 的 C-V acceptance 命令時，命令本身應與當前實作對齊、不會因 spec 與 code 的 drift（field 命名、URL 路徑、期望值）而誤判 FAIL。本 user story 涵蓋 6 處由 2026-05-24 regression 親自撞到的 drift（030 C-V8/9、039 C-V31、040 C-V10/12、022 C-V3、021 C-V10、021 C-V2）。

**Why this priority**：spec rot 直接侵蝕「C-V 是真實驗證」的可信度——如果跑 spec 命令撞坑必須先自行 debug 命令本身、再判斷是 regression、操作成本翻倍。是 R4 的核心痛點。

**Independent Test**：在 dev stack 健康（5 service）狀態下，依 6 處改正後的 spec 命令逐條重跑，全部 PASS（envelope OK、psql 期望符合）。無需動到 rust-api 即可完整驗證（spec md 修正獨立於 ⑧ middleware 改動）。

**Acceptance Scenarios**：

1. **Given** dev stack baseline、Soybean token；**When** 依 030 C-V8 改正後命令送 `POST /api/systemManage/addUser` body `{"userName":"...", "userGender":"1", ...}`；**Then** envelope `code:0 success:true`、DB 新增 row（過去因 `username`/`gender` snake 命名被 422 拒）。
2. **Given** 已登入 user token；**When** 依 039 C-V31 改正後命令送 `POST /api/auth/changePassword body` `{"currentPassword":"...","newPassword":"..."}`；**Then** envelope `code:0`（過去因 `oldPassword` 命名被 422 拒）。
3. **Given** Soybean token；**When** 依 040 C-V10 改正後 `GET /api/role?current=1&size=10`；**Then** envelope 0 + paginated `{current,records,size,total}`（過去 `/api/role/list` 404）。
4. **Given** 從 `getRoleList` 取得 records；**When** 對照 022 C-V3 改正後 expected shape；**Then** `userGender`/`userRoles`/`status` 為實值（過去 spec 寫 hardcode null/[]、實際已是實值、誤導讀者）。
5. **Given** Soybean token + 改正前後的 021 C-V10 命令；**When** 跑 `GET /api/user?page=1` 與 `GET /api/role?page=1`；**Then** 兩者皆 HTTP 200 + envelope 0（前後皆 PASS，因主命令改為無 trailing slash）。
6. **Given** `casbin_rule` table；**When** 依 021 C-V2 改正後查 `SELECT COUNT(*) FROM casbin_rule WHERE ...`；**Then** 結果 ≥20（過去 spec 寫死 `=20`、實際 50、字面比對 FAIL）。

---

### User Story 2 — API consumer 帶 trailing slash request 不再 404 (Priority: P2)

任何呼叫 rust-api `/api/<nested>/` 形式的 consumer（curl 手測、scripts、未來新增的 base-web 程式碼、第三方整合）若 URL 含 trailing slash，應收到正常 paginated 結果，而非 HTTP 404 `nothing to see here`。

**Why this priority**：當前 base-web 是 no-slash 寫法、未撞坑；但 axum nested router 行為違反 REST 慣例（多數框架兩種寫法等價）、屬於潛在地雷。修掉可降低未來 onboarding 與整合摩擦。

**Independent Test**：rust-api 加 `NormalizePathLayer::trim_trailing_slash()` 後，curl 帶與不帶 trailing slash 對至少 5 個 nested 端點（`/api/user/`、`/api/role/`、`/api/menu/`、`/api/api-endpoint/`、`/api/domain/`）皆回 HTTP 200。可獨立於 spec md 改動驗證。

**Acceptance Scenarios**：

1. **Given** Soybean token、rust-api 已 deploy NormalizePathLayer；**When** `GET /api/user/?page=1&size=10`；**Then** HTTP 200 + envelope 0 + paginated records（過去 404）。
2. **Given** 同上；**When** `GET /api/role/?page=1&size=10`；**Then** HTTP 200 + envelope 0（過去 404）。
3. **Given** GeneralUser token（無 admin 權限）；**When** `GET /api/role/?page=1`（trailing slash）；**Then** envelope `code:5001 success:false`（Casbin enforce 在 normalized path 上仍生效、無權限繞過）。
4. **Given** Soybean token；**When** 對 3 個其他 nested 端點 `/api/menu/`、`/api/api-endpoint/`、`/api/domain/` 抽樣 trailing slash request；**Then** 皆 HTTP 200 + 正確 envelope（fix 全局生效、非單點 patch）。

---

### User Story 3 — Future spec reader 看到準確 design 描述 (Priority: P3)

未來閱讀 `specs/002-soft-delete-infrastructure/data-model.md` §E4 範例 path 的讀者，應看到實際 impl 落地位置而非已 drift 的舊路徑。

**Why this priority**：F3-N5 在 backlog 自 F3 完成（2026-05-14）以來閒置；對重跑 regression 無直接影響、但對閱讀 design 文件造成輕度誤導；bundle 進 041 一次清完即可。

**Independent Test**：grep `specs/002-.../data-model.md` §E4 看到的 path 與實際檔案系統位置一致。

**Acceptance Scenarios**：

1. **Given** `specs/002-soft-delete-infrastructure/data-model.md` §E4；**When** 對範例 path `<P>` 跑 `ls <P>`；**Then** 檔案存在（過去 drift path 不存在）。

---

### Edge Cases

- **NormalizePathLayer 順序錯放**：若放在 Casbin enforce layer **之內**（之後），Casbin 看到的可能是 un-normalized path、與 `sys_endpoint` 表記錄不一致、原本工作的端點突然被拒。Mitigation：實作時 layer 必須放在 Casbin/audit/middleware chain **最外層**（最先 apply、最先處理 request path）。Acceptance Scenario US2#3 涵蓋此案。
- **NormalizePathLayer 對 query string 不影響**：`?` 後內容不變、僅 path trailing `/` 被 trim。為預期行為、非 bug。
- **021 C-V10 改 spec 後 trailing slash 寫法的去處**：spec 主命令改為無 slash（保守）、但加一行 errata 註明「亦可帶 trailing slash（041 後支援）」、讓未來讀者理解兩種寫法皆對。
- **022 C-V3 shape 描述準確時點**：spec 描述的「實值」shape 對應 2026-05-24 當下的 F8/039 落地狀態；若未來再有 user/role/status 演進、可能再次 drift、需 spec-hygiene-pass-2 補。本 feature 不預測未來、只修當前。
- **rust-api 未開 tower-http `normalize-path` feature flag**：若 `Cargo.toml` 未開、`use tower_http::normalize_path::NormalizePathLayer` 編譯不過。實作時須先 `cargo tree --features` 確認、必要時加 feature 開關（plan 階段細化）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**：`specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md` 內 C-V8 與 C-V9 的 curl payload 必須使用 camelCase 欄位名（`userName`、`userGender`、`userEmail`、`userPhone`）而非舊 snake (`username`/`gender`/`email`/`phone`)。
- **FR-002**：`specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md` 內 C-V31 的 curl payload 必須使用 `currentPassword`（非 `oldPassword`）。
- **FR-003**：`specs/040-wire-id-consistency/contracts/verification-commands.md` 內 C-V10 與 C-V12 的 URL 必須使用 paginated root 路徑（`/api/role?...`、`/api/user?...`），不使用 `/list` suffix；並補一行 errata 註明 paginated root pattern 慣例。
- **FR-004**：`specs/022-manage-crud-alignment/contracts/verification-commands.md` 內 C-V3 的 expected shape 描述必須對齊 F8/039 後實際行為——`userGender`/`userRoles`/`status` 為實值、非 hardcode `null`/`[]`/`'enabled'`。
- **FR-005**：`specs/021-systemmanage-alias-router/contracts/verification-commands.md` 內 C-V10 的主命令 URL 必須使用無 trailing slash 形式（`/user?page=...`、`/role?page=...`）、並附加一行 errata 註明 trailing slash 亦支援（041 NormalizePathLayer 後）。
- **FR-006**：`specs/021-systemmanage-alias-router/contracts/verification-commands.md` 內 C-V2 的期望 casbin row 數必須使用 `≥20` 形式、並註明「隨後續 alias 成長」（避免硬編碼 count 隨 feature 演進失準）。
- **FR-007**：`specs/002-soft-delete-infrastructure/data-model.md` §E4 內範例 path 必須對齊實際 impl 位置（為 `server-model/soft_delete_impls.rs` 或實際 grep 確認的路徑、以 grep 結果為準）。
- **FR-008**：rust-api top-level admin router 必須在 routing chain 最外層套用 `NormalizePathLayer::trim_trailing_slash()` 等價的 path normalization、使 nested `Router::new().route("/", ...)` 模式的端點對「帶與不帶 trailing slash」request 皆回 HTTP 200（而非當前 404）。
- **FR-009**：path normalization 必須在 Casbin enforce、audit、所有 protected middleware 之前 apply、確保 enforce/audit 看到 normalized path、與 `sys_endpoint` 表記錄字面一致。
- **FR-010**：本 feature 0 base-web 改動、0 schema migration、0 新 entity、0 nestjs（已退場、F14）。
- **FR-011**：本 feature 不批量檢視所有 spec md 尋找其他可能 rot——scope 嚴格限於 R4 (6 處) + F3-N5 (1 處) = 7 處 spec md edit；其他發現於分開 hygiene-pass-2 處理。
- **FR-012**：本 feature 完成後 `docs/INTEGRATION-CHECKLIST.md` 的「衍生 follow-up」table 必須移除 R4 與 F3-N5 兩 row、且「已完成里程碑」加一行 041 entry。

### Key Entities

*(此 feature 無新資料 entity；僅 doc + middleware 改動，故省略本節。)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：7 處 spec md edit 完成後、重跑本次 regression 受影響 C-V（030 C-V8/9、039 C-V31、040 C-V10/12、022 C-V3、021 C-V2/C-V10）全 PASS（之前 6 處撞坑 → 全綠）。
- **SC-002**：rust-api deploy NormalizePathLayer 後、`GET /api/user/?page=1` 與 `GET /api/role/?page=1` 從 HTTP 404 → HTTP 200 + 正確 paginated envelope（trailing-slash fix 對受影響端點生效）。
- **SC-003**：抽樣 3 個其他 nested 端點（`/api/menu/`、`/api/api-endpoint/`、`/api/domain/`）trailing-slash request 也回 HTTP 200（fix 全局生效、無單點 patch 之嫌）。
- **SC-004**：GeneralUser token 對 admin nested 端點 trailing-slash request 仍 envelope `code:5001 success:false`（Casbin enforce 在 normalized path 上正常、無權限繞過）。
- **SC-005**：rust-api cargo build clean、無 unused import warning、無 new clippy 違規。
- **SC-006**：grep 確認 7 處 spec md edit 後對應檔內舊字串（`username`、`oldPassword`、`/api/role/list`、`/api/user/list` 等）在應修區域回 0 hit。
- **SC-007**：0 base-web 改動、0 schema migration、0 新 cargo crate dep（最多 +1 既有 dep 的 feature flag）。
- **SC-008**：本 feature merge 後、`docs/INTEGRATION-CHECKLIST.md` 衍生 follow-up table 不再含 R4、F3-N5 兩 row；已完成里程碑加一行 041 entry。

## Assumptions

- `tower-http` 的 `NormalizePathLayer::trim_trailing_slash()` 是合適的 layer 選擇（業界 axum 應用 standard remedy）；plan 階段會驗證 `tower-http` 已是 dep（rust-api 既有），最多需開 `normalize-path` feature flag。
- 改 spec md 不影響 spec-kit 工具鏈 parsing（受影響檔僅 `contracts/verification-commands.md` 與 `data-model.md`、非 `spec.md`/`plan.md`/`tasks.md`、不被 `/speckit-analyze` consistency check 用為 truth source）。
- dev stack 健康（5 service：postgres / redis / rust-api / front-nginx / base-web）；無 nestjs（F14 已退場）。
- rust-api 重 build + dev stack restart 是可接受的驗證 cost（已是日常 flow）。
- 021 C-V2 期望「≥20」格式不被任何自動化工具當成 hard count（人類 + 自動化都讀得懂「至少 20」）。
- F3-N5 在 specs/002 data-model §E4 的 drift 為單一路徑、修法為 1 行替換；若實際讀檔發現是多處或結構性 drift、plan 階段可選擇升等 scope 或拆出獨立 hygiene-pass。
- 「regression operator 重跑 C-V」場景對應的人/AI 已熟悉 dev stack baseline 操作（per `CLAUDE.md` §8）、無需在本 spec 內重述操作前置。
- NormalizePathLayer 對 `POST`/`PUT`/`DELETE` 的 trailing slash 行為一致（不僅 GET）—— acceptance 主測 GET、但 fix 對所有 method 生效（middleware 為 method-agnostic）。
