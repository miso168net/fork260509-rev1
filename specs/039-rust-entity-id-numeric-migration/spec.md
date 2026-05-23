# Feature Specification: rust-entity-id-numeric-migration

**Feature Branch**: `039-rust-entity-id-numeric-migration`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "rust 端適應 base-web typings — 業務 entity 加 display_id (Snowflake i64) 雙欄、API 邊界 transform、ULID PK + audit/JWT/Casbin/FK 全保留"

**Source**: [`docs/superpowers/039-feature-rust-entity-id-numeric-migration.md`](../../docs/superpowers/039-feature-rust-entity-id-numeric-migration.md)（brainstorming 2026-05-23 session — W-FW8 收尾後 user 設計反思「應在 rust-api 那層、就以 base-web 為主要依據、返回適合的 type」；Q1-Q6 全 6 個拍板 + X1 雙欄設計選定）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 Principle IV「base 不改動邊界」**預設原則**（軌道外 feature、base-web 0 diff、完全符合預設、**不**動用 W-WEBUI 受管例外、**不**觸發 constitution amendment）。
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) DESIGN-B §1.3「base 不改動邊界」—— 本 feature 是這條原則在「型別形狀」層的嚴格化實踐。
- W-F11 `rust-horizontal-scaling`（merge `d2d4c4c`）：W-F11 已落地多 replica 預備、Snowflake i64 distributed id 對齊此擴展。
- 既有 `sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key` entity（VARCHAR ULID PK）—— 本 feature **PK 完全保留、僅加 display_id 副欄**。
- 既有 audit_log / JWT / Casbin / FK cascade：**全部不動**——rust 內部 SoT 維持 ULID。

## Scope summary

把 rust-api 5 個業務 entity（被 base-web 看到 id 的）加一個 `display_id` BIGINT UNIQUE NOT NULL 欄（Snowflake i64）；API 邊界 output 把 `id` 序列化為 display_id 數值給 base-web、input 收 number 反查 display_id 拿 ULID PK；rust 內部業務邏輯（service / audit / JWT / Casbin / FK cascade）全部繼續用 ULID。完成後 base-web typings `id: number` 與 wire 型別完全對齊、rust 端 0 業務邏輯改動、ULID 特性完整保留。

| 子項 | deliverable |
|---|---|
| **A 雙欄 schema 擴充**（主） | 5 entity（user / role / endpoint / organization / access_key）各加 `display_id BIGINT UNIQUE NOT NULL` + INDEX；既有 row 透過 backfill migration 一次填充 Snowflake i64；ULID PK 完全保留。 |
| **B Snowflake i64 generator helper** | 新檔 `server/global/src/snowflake.rs`（外部 crate 或自寫 lightweight）+ machine_id 從 container hostname hash mod 1024（多 replica 衝突低機率 + 0 manual config）。 |
| **C API 邊界 transform** | 5 entity output struct `From<Model>` impl 內 `id = model.display_id`；input handler 開頭加 `lookup_ulid_by_display_id(i64) -> String` 反查;既有 `xxx_id: String` 型 input DTO 改 `i64`（~10 處 cascade）。 |

**範疇外**：

- ❌ **base-web 改動**：0 diff、保留 starter typings 樣貌、upstream rebase 摩擦最小。
- ❌ **JWT sub claim / Casbin g rule / audit_log payload / FK schema**：**全不動**——rust 內部 SoT 仍 ULID。
- ❌ **log/token 類 entity**（`sys_login_log` / `sys_operation_log` / `sys_tokens`）：自身 PK 仍 ULID、不暴露給 base-web、不加 display_id。
- ❌ **`sys_menu`**：本就 i32 PK + base-web typings number、已對齊、不動。
- ❌ **`sys_domain`**：後端 internal、base-web 不直接看、不加 display_id。
- ❌ **nestjs**：DESIGN-B、nestjs 已退場、0 改動。
- ❌ **drop ULID PK 改 BIGINT PK**：X1 雙欄設計刻意保留 ULID、避免 JWT/audit/Casbin/FK 全 cascade。
- ❌ **base-web 端 `String(...)` 餘料清理**：W-FW1~W-FW8 既有 `String(roleId)` 等仍 work、不 break；屬另一個 base-web cleanup sprint 範圍、不包進本 rust feature。

## Clarifications

### Session 2026-05-23（brainstorming 階段拍板、共 6 項）

- **Q1（ULID 替代型）**：**Snowflake i64**。保留 distributed + time-ordered 特性、跟 W-F11 多 replica 對齊。否決 i32/i64 sequence（單 DB lock、不適多 replica）/ UUID string（仍是 string、不解決問題）。
- **Q2/X1（ULID 是否保留）**：**保留 ULID PK + 新增 display_id BIGINT UNIQUE 欄、API 邊界 transform**（雙欄設計）。rust 內部 0 業務邏輯改動。否決 drop ULID 改 BIGINT PK（JWT/audit/Casbin/FK 全 cascade、規模大、丟失歷史相容）/ API hash transform（collision 風險 + lookup cache 複雜）。
- **Q3（entity 範圍）**：**5 entity** —— user / role / endpoint / organization / access_key（現班接通 + 快將接通的）。否決最小 3（未來再補多次 feature 拆分浪費）/ 全業務 entity（log/token 暴露給 base-web 機率低、加欄 bloat）。
- **Q4（Snowflake machine_id）**：**container hostname hash mod 1024**（自動、無 config、container 重啟 hostname 通常一致；衝突需「同 ms + 同 machine_id + 同 seq」三撞、低機率）。否決 env var SNOWFLAKE_MACHINE_ID（手動 config 負擔、scale 麻煩）/ redis-based 動態分配（lock + heartbeat、為 1 feature 過度設計）。
- **Q5（API 邊界 transform 機制）**：**output struct From impl 改 `id: model.display_id`**（直接、可讀、5 entity 不需抽象）。否決 serde custom serializer hook（仍需 attr、價值低）/ trait + macro 自動化（過度抽象、5 entity 不值）。
- **Q6（base-web `String(...)` 餘料清理）**：**不清留 backlog**。W-FW1~W-FW8 既有 `String(roleId)` 等仍 work、不會 break；屬另一個 base-web cleanup sprint 範圍、不該包進 rust feature。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — base-web 接收 5 entity id 為 number、typings 對齊 runtime（Priority: P1）🎯 MVP

base-web 端透過既有 service function（`fetchGetUserList` / `fetchGetRoleList` / `fetchGetAllEndpoints` / 任何 user-role-endpoint-organization-access_key CRUD endpoint）收到的 entity `id` 字段、JSON wire 型為 number（不是 ULID string）；TS typings 宣告 `Api.Common.CommonRecord.id: number` 與 wire 型完全對齊；既有所有 base-web manage 頁面（user 列表 / role 列表 / endpoint button-auth modal）操作不退化、可正確 render 與互動。

**Why this priority**：本 feature 主要目標——把 rust 端適應 base-web typings 的設計實踐落地。完成後 base-web 端無 TS 型別違規、未來 upstream rebase 摩擦最小、且解除 W-FW1~W-FW8 累積的「runtime string 配 typings number」型別債（依賴 JS 動態型別與 deserializer workaround）。

**Independent Test**：直接 curl 任一 5 entity GET endpoint（如 `/api/systemManage/getUserList`），envelope response.data 內 user `.id` 為 JSON number（如 `1234567890`）而非 ULID string（如 `"01KS9..."`）；對應 base-web 頁面 CDP smoke 確認列表 render 與 row 操作（編輯、刪除）正確。

**Acceptance Scenarios**:

1. **Given** rust-api 已 build + dev stack 重啟、5 entity 既有 row 全 backfill 完 display_id，**When** base-web 端透過 `/systemManage/getUserList` GET 收到 user 列表回應，**Then** 每筆 record 的 `id` 字段為 JSON number 型（如 `1234567890`）、TS typings `Api.SystemManage.User.id: number` 完全對齊、列表正確 render。
2. **Given** admin 在 base-web 角色管理頁開啟「按钮权限」modal，**When** 該 modal 透過 `/systemManage/getAllEndpoints` 取 endpoint tree，**Then** 每個 endpoint leaf 的 `key` 字段為 number string（display_id i64 轉字串、tree shape 需要 string key）但對應的 `id` 概念為 number；勾選 + 確認後 POST `/assignRoleEndpoints` body `{roleId: <number>, endpointIds: [<number>]}` 仍正確寫入 Casbin policy。
3. **Given** rust internal service 邏輯（assign_permission / assign_routes / assign_users）執行成功，**When** psql 查 sys_operation_log，**Then** audit_log payload_before/after 內 `roleId` / `userId` / `endpointIds` 仍為 ULID 字串（rust internal SoT 不變、跨期一致）。
4. **Given** GeneralUser token 登入後，**When** 對受 RBAC 保護的 admin endpoint 發送請求，**Then** Casbin 仍正確 enforce 5001 deny（user_id ULID 經 g rule 對映 role_code、邏輯不退化）；對被授權 endpoint 訪問成功。

---

### User Story 2 — rust internal 業務邏輯零變動、ULID + audit/JWT/Casbin 全保留（Priority: P2）

rust-api 內部所有業務邏輯（service-layer 操作、audit_log 寫入、JWT 簽發與驗證、Casbin policy 寫入與 enforce、跨 entity FK cascade）100% 不受 display_id 引入影響、繼續以 ULID 為 SoT 工作。既有 W-FW1~W-FW8 acceptance 與 base-web manage 頁面 CRUD 流程跨 user/role/endpoint/organization/access_key 5 entity 一輪不退化。

**Why this priority**：本 feature 的核心安全網——X1 雙欄設計的價值就在「rust 內部 0 業務邏輯改動」。若這條失守、就退回 layer B「drop ULID PK 改 BIGINT」規模、本 feature scope 失控。

**Independent Test**：grep `Ulid::new()` 在 rust-api/server/ 命中數量為 brainstorm 前+5（5 entity create path 新增的 ULID 仍生成）；ULID 別處用法（JWT jti / request_id / audit/log/token entity 自身 PK）保留不動。跑既有 W-FW1~W-FW8 acceptance C-V matrix subset、全通過、0 退化。

**Acceptance Scenarios**:

1. **Given** 5 entity migration 已套用、display_id 全 backfill，**When** grep `audit_log::write_in_txn` in `rust-api/server/service/src/admin/sys_authorization_service.rs`，**Then** 命中 3 處（assign_routes + assign_users + assign_permission）—— W-FW6 N3 + W-FW8 留下的 audit gap 不退化。
2. **Given** dev stack 重啟，**When** 用 Soybean token 訪問 `/auth/getUserInfo`，**Then** JWT sub claim 仍為 ULID 字串（`'1'` 或 admin 新建 user 的 ULID）；token 簽發 / 驗證 / refresh 流程不退化。
3. **Given** base-web admin 在角色管理頁修改 role 的菜單授權，**When** rust 寫入 sys_role_menu FK + Casbin policy，**Then** FK 仍存 role_id ULID + menu_id i32；Casbin g rule v0 仍為 role_code（不變）；操作成功 + audit log 寫入。

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | Snowflake clock 倒退（NTP 失誤 / container time 漂移） | next_display_id() 偵測 timestamp 倒退、等到下一個 ms 再生成（避免 id 重複）；極端 case 可加 sequence wait-for-next-ms 邏輯。 |
| E-2 | 兩個 container 撞同 hostname hash slot（machine_id 衝突） | 1024 個 slot 中實務幾十個 container 衝突機率 < 5%；若衝突 + 同 ms + 同 seq 才會撞 id（極低機率）；dev/staging 接受；prod 若 scale 上百 replica 改 redis-based 分配。 |
| E-3 | Snowflake i64 序列化 JSON 超過 JS Number.MAX_SAFE_INTEGER（2^53） | Snowflake 結構：sign 1bit + timestamp 41bit + machine_id 10bit + seq 12bit = 64bit 含 sign；實務值 < 2^53 安全範圍（時間在合理 epoch 內）；本 feature 採此設計保證 base-web JS 正確 parse。 |
| E-4 | backfill migration 對大型 DB 慢 | rev1 未上 prod、5 entity 既有 row 量小（dev 數十 row 級）、UPDATE 全表幾秒完；prod 上線時若必要拆 batch UPDATE。 |
| E-5 | 既有歷史 audit_log row 內 payload roleId（ULID）跟新 wire 看到 roleId（number）跨期不對應 | 設計接受。rust internal SoT 不變、audit 保 ULID；未來 audit 顯示 page 加 ULID→display_id transform 解決（屬另一 feature 範圍）。 |
| E-6 | 既有 admin 用 ULID-style id（admin 自建 user / role 的 ULID PK）對 base-web 端的影響 | base-web 透過 display_id i64 操作、ULID PK 不暴露；admin 端不需感知 ULID 的存在。 |
| E-7 | display_id input lookup 找不到對應 entity（誤傳不存在的 number） | 既有 entity not found error 路徑（RoleNotFound / UserNotFound / EndpointNotFound）正確 bubble、envelope 4001 等 error code。 |
| E-8 | base-web 端送舊 ULID string 給新 i64 input DTO（過渡期測試誤用） | rust serde 解析 number 失敗、envelope 4xx 帶清楚錯誤訊息「expected i64, got string」。base-web 端不會送 ULID（typings 宣告 number）。 |

## Requirements *(mandatory)*

### Functional Requirements

**A. 雙欄 schema 擴充**

- **FR-001**: 後端 MUST 對 5 個業務 entity（`sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key`）各加一個 `display_id BIGINT UNIQUE NOT NULL` 欄；ULID PK（`id VARCHAR`）完全保留、不動。
- **FR-002**: 後端 MUST 對 5 entity 的 `display_id` 欄加 UNIQUE INDEX（input lookup 性能 + 全域唯一保證）。
- **FR-003**: 後端 MUST 在 migration up 時對既有 row backfill display_id（每 row 透過 Snowflake i64 generator 即時生成）；對稱 down 時 DROP COLUMN + DROP INDEX。
- **FR-004**: 後端 MUST 對 5 entity 的 create / insert path（service-layer）寫 entity 時加 `display_id: Set(snowflake::next_display_id())`；既有 ULID `id` 生成（`Ulid::new().to_string()`）仍保留、不動。

**B. Snowflake i64 generator helper**

- **FR-005**: 後端 MUST 提供 `next_display_id() -> i64` helper、結構為 Snowflake 標準（41bit timestamp + 10bit machine_id + 12bit sequence）；連續呼叫 MUST 唯一 + time-ordered（newer > older）。
- **FR-006**: machine_id MUST 從 container hostname hash mod 1024 自動取得（無 manual config）；若 hostname 不可用 fallback 預設值（如 `'rev1-admin-rust-api-1'` hash）保證 deterministic。
- **FR-007**: Snowflake 生成器 MUST 處理 clock 倒退情境（timestamp ms 比上次小 → wait 到下一個 ms 再生成，避免 id 重複）。

**C. API 邊界 transform**

- **FR-008**: 5 entity 的 API output struct（如 `SystemManageUserOutput` / `SystemManageRoleOutput` 等）的 `id` 字段 MUST 序列化為 `model.display_id` 的 i64 值（不是 model.id 的 ULID 字串）；wire 上 JSON `id` 為 number 型、與 base-web typings 對齊。
- **FR-009**: 5 entity 相關的 API input DTO（handler 收 `roleId` / `userId` / `endpointIds` / `organizationId` / `accessKeyId` 等字段）MUST 將型別從 `String` 改為 `i64`（單值）或 `Vec<i64>`（集合）；既有 `AssignPermissionDto.role_id: String` / `SystemManageAssignRoleEndpointsInput.role_id: String` / `endpoint_ids: Vec<String>` / `AssignRouteDto.role_id: String` / `AssignUserDto.role_id: String` / `user_ids: Vec<String>` 等 ~10 處 cascade。
- **FR-010**: 5 entity 相關 handler MUST 在收 input 後加一層 lookup：`query .filter(Column::DisplayId.eq(input.<id>_i64)) .one(db)` 取 entity ULID PK → 業務 service call 用 ULID。
- **FR-011**: input lookup 失敗（display_id 不存在 / soft-deleted）MUST reject 既有 entity-not-found error code（如 RoleNotFound 4001 / UserNotFound 等）—— 既有 error 路徑沿用、不新增 error code。

**D. rust internal SoT 保留**

- **FR-012**: rust internal service-layer 業務邏輯 MUST 繼續以 ULID（entity.id）為 SoT；audit_log payload_before/after JSON 內 `roleId` / `userId` / `endpointIds` 等 MUST 仍為 ULID 字串；audit_log.entity_id 欄 MUST 仍為 ULID 字串（歷史 row 跨期一致）。
- **FR-013**: JWT sub claim MUST 仍為 user.id ULID 字串；token 簽發 / 驗證 / refresh 流程零變動。
- **FR-014**: Casbin g rule（user_id, role_code, domain）MUST 仍以 ULID user_id 工作；Casbin policy `casbin_rule` 表結構不動。
- **FR-015**: 跨 entity FK（`sys_user_role.{user_id, role_id}` / `sys_role_menu.role_id` / `sys_tokens.user_id` / `sys_login_log.user_id` / `sys_operation_log.user_id`）MUST 仍存 ULID 字串、cascade 邏輯不動。

**E. 範疇紀律**

- **FR-016**: 本 feature 對 base-web 的修改 MUST 為 **0 diff**（`git diff base-web` 為空）；不動 `src/`、`pnpm-workspace.yaml`、`.env`、任何檔案。
- **FR-017**: 本 feature 對 nestjs fork 的修改 MUST 為 0（DESIGN-B、nestjs 已退場）。
- **FR-018**: 本 feature 對 `sys_menu` / `sys_domain` / log/token 類 entity（`sys_login_log` / `sys_operation_log` / `sys_tokens`）MUST 0 schema 改動。
- **FR-019**: 本 feature MUST 不變更 `casbin_rule` / `sys_user_role` / `sys_role_menu` 表結構（FK 仍 VARCHAR ULID）。
- **FR-020**: commit MUST 為多段式（rust-api worktree + outer SHA pin、base-web 0 segment）per CLAUDE.md §4.1。
- **FR-021**: acceptance MUST 用 curl + psql + CDP browser smoke 三者覆蓋（比照 W-FW1~W-FW8 慣例）；本 feature 為 schema 擴充 + API transform 類，由 acceptance matrix 覆蓋正確性、無新純函式單元測試（除 Snowflake generator 本身 1000-id 唯一性 + time-ordered unit test）。

### Key Entities

- **`sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key`**：5 個業務 entity 各加 `display_id BIGINT UNIQUE NOT NULL` 副欄；ULID PK 完全保留；既有 row 透過 backfill 一次填充。FK 仍以 ULID 工作。
- **Snowflake i64 display_id**：64bit numeric id（sign 1bit + timestamp 41bit ms + machine_id 10bit + sequence 12bit）；用於 API 邊界與 base-web 對應 typings number；UNIQUE 全域、time-ordered、< 2^53 JS safe integer 範圍。
- **既有 `casbin_rule` / `sys_user_role` / `sys_role_menu` / log/token 表**：本 feature **0 結構改動**；FK 與 audit / JWT / Casbin policy 邏輯全保留以 ULID 工作。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 5 entity 的 base-web 端 wire 型驗證 100% 通過 ——`/api/systemManage/{getUserList, getRoleList, getAllEndpoints}` 等 GET endpoint 回應內 `id` 字段為 JSON number 型（不是 ULID string）、與 base-web typings `Api.SystemManage.{User, Role, Menu}.id: number` 對齊。
- **SC-002**: Snowflake display_id 在 1000 次連續生成內 0 重複、time-ordered（newer display_id > older display_id、單 machine_id 內保證）；跨多 replica（不同 machine_id）weakly time-ordered（接受 ms 級偏差）。
- **SC-003**: rust internal 業務邏輯（audit_log payload / JWT sub claim / Casbin g rule / FK cascade）100% 不退化 —— grep `audit_log::write_in_txn` 命中 3 處（W-FW8 落地狀態）、JWT sub claim 內容仍為 ULID 字串、Casbin enforce 對 GeneralUser/Admin/Super 三類 token 一致。
- **SC-004**: 本 feature 對 base-web 的改動 = **0 diff**（`git -C base-web diff --name-only` 為空）；對 nestjs 改動 = 0。
- **SC-005**: schema migration 對齊範圍 —— 5 entity 各加 display_id 一欄、`sys_menu` / `sys_domain` / log/token 類 entity / `casbin_rule` / `sys_user_role` / `sys_role_menu` 全 0 schema 改動（psql `\d` 命令驗證）。
- **SC-006**: 既有 W-FW1~W-FW8 acceptance 100% 通過、不退化 —— 重跑既有 C-V matrix subset（user CRUD / role CRUD / endpoint button-auth modal / role 菜單授權 / role home 設定 / audit log）全綠。
- **SC-007**: migration 對稱 down 在臨時 DB 乾淨退場（5 entity display_id 欄 + UNIQUE INDEX + 全資料完整移除）；正式 dev DB 不跑 down。
- **SC-008**: stub UI / W-FW8 modal / W-FW1~7 既有功能 CDP browser smoke（via Edge :9229）全通過、modal 開、tree render、submit toast 正確；wire 內 id 改 number 後 base-web JS 端零 runtime error。

## Assumptions

- **A-001**: rev1 未上 prod、dev DB drop+reseed 接受（既有業務 entity row 透過 backfill 一次填 display_id，不必對映表保留 ULID→i64 lookup）。**已驗證**：dev stack 自 F4 起常態運行、無 prod 部署。
- **A-002**: container hostname 在 docker-compose `up -d` 後通常一致（`rev1-admin-rust-api-1`）—— machine_id 自動穩定；container 重啟（同 compose）hostname 不變。**已驗證**：docker compose project name `rev1-admin` + 預設容器命名規則。
- **A-003**: Snowflake i64 結構（41bit timestamp + 10bit machine_id + 12bit seq）保證生成值 < 2^53 JS safe integer 範圍（時間 epoch 在合理範圍內、總 bit 數 < 53）；base-web JS 端 `JSON.parse()` 正確 parse 為 number。**已驗證**：標準 Snowflake 41bit timestamp from epoch 2020 → ~2089 年仍 < 2^41 < 2^53。
- **A-004**: 既有 W-FW1~W-FW8 acceptance 跨 user / role / endpoint / menu CRUD 流程完全跑通 —— 本 feature 不破壞其 acceptance；ULID PK 保留 + service-layer 0 業務邏輯改動 + 邊界 transform 是足夠的「rust internal 不退化」保證。
- **A-005**: Snowflake `idgenerator` crate（或同類）在 rust ecosystem 內成熟可用、license 兼容（MIT / Apache 2.0）；若否 self-roll lightweight implementation（~50 行）符合 brainstorm Q4 預備。**待 plan Phase 0 R-Q1 驗證**。
- **A-006**: 既有 5 entity input/output DTO 改動範圍可控（~10 處 cascade）；plan Phase 0 R-Q2 / R-Q3 全面盤點 input DTO / output struct + handler 改動清單。**待 plan Phase 0 驗證**。
- **A-007**: 既有 base-web 端 `String(roleId)` / `String(props.roleId)` 等字串轉換在收到 number 後仍 work（`String(123)` → `"123"`，JS 動態型別自然處理）—— 本 feature 不破壞 base-web runtime；改寫成 number assertion 是另一個 cleanup feature 範圍。

## Dependencies

### Inbound（本 feature 依賴）

- **W-F11** `rust-horizontal-scaling`（merge `d2d4c4c`）：W-F11 已落地多 replica 預備、Casbin redis pub-sub reload；Snowflake i64 distributed id 對齊此擴展、不引入新分散式機制。✅
- **038 W-FW8** `button-auth-completion`（merge `5c9ea69`）：W-FW8 落地的 `getAllEndpoints` / `getRoleEndpointIds/:roleId` / `assignRoleEndpoints` 3 systemManage alias endpoint 在本 feature 後仍 work（display_id 改動後 input/output 對應調整）。✅
- **Constitution v1.4.0**：受管例外授權模型已改 DESIGN-W-WEBUI 文件權威；本 feature 屬軌道**外**、base-web 0 diff、不動用受管例外、不觸發 amendment。✅

### Follow-up（本 feature 範疇外）

- **base-web 端 `String(...)` 餘料清理**：W-FW1~W-FW8 落地的字串轉換 + 既有 deserializer workaround（032 commit `149dc52` 的 parentId 字串/數字轉換）— 屬另一個 base-web cleanup sprint feature、本 feature 落地後可獨立啟動。
- **未來 base-web typings 收斂**（如 `Api.SystemManage.MenuTree.pId` 與 rust `pid` 字段名不對齊）：屬 base-web cleanup sprint 範圍、不在本 feature。
- **observability（W-F12/13/14）**：Phase W deploy 最後 phase；本 feature 落地後可繼續推進。
