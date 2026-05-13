# Feature Specification: F4 — response-shape-alignment

**Feature Branch**: `001-response-shape-alignment`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: "讀取 docs/superpowers/001-feature-response-shape-alignment.md 的設計文件產出規格書"

**Source brainstorming**: [`docs/superpowers/001-feature-response-shape-alignment.md`](../../docs/superpowers/001-feature-response-shape-alignment.md)（2026-05-14 superpowers:brainstorming session 產出）

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1 / §4.1 / §6.1 F4
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §4.1（與 DESIGN-A 同）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（Principle II audit + Principle IV base 不改動 + 架構約束）

**Scope summary**：rust-api admin endpoint 全表面 response shape 對齊 base 既有預期 — 涵蓋 (A) HTTP 永遠 200 + body code 路線、(B) JSON camelCase 序列化、(C) `/auth/*` 與 `/auth/getUserInfo` 欄位補齊三個維度。一次性解決 [`docs/INTEGRATION-RESEARCH.md`] B1 + B2 + B3 + B5 共 4 個 GAP。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rust admin response shape 全面對齊 base 預期（Priority: P1）🎯 MVP

base-web 對任何 rust admin endpoint 的 response，能在**形狀、欄位名、業務 code 分類**三個維度上原生對接、無需手動 mapping。整個 base 可以在 F4 完成後啟動 `_builtin/login` → `home` → `manage/*` 各 view 不再因 shape mismatch 而 broken。

**Why this priority (P1，唯一 US，no further decomposition)**：

F4 的 3 個 GAP 群（B1+B2 code 路線 / B3 camelCase / B5 欄位補齊）**並非獨立可交付**：

- 單獨修 B1+B2 → base 能判斷成敗，但 `data.refresh_token` undefined（TS 期望 `refreshToken`）→ login flow 仍 broken
- 單獨修 B3 → 欄位 camelCase 對了，但 code=200 ≠ 0 → base 永遠走 onBackendFail → 整個 flow 不通
- 單獨修 B5 → 補了 `buttons` 等欄位，但 code 與 camelCase 都不對 → base 到不了 getUserInfo

任一單一 GAP 修了、另外的沒修，對 base 都是「整體 broken」、不是「部分能用」。F4 是 **infrastructure 性質的原子 MVP increment** — 3 個 GAP 是同一個 user story 的 3 個 acceptance dimensions，不是 3 個 user stories。

**Independent Test**：base + rust + postgres + redis 起來，跑「Soybean / 123456 登入」 → 預期 base 進入 home view 且瀏覽器 console 無 `onBackendFail` 警告（涵蓋 dimension A + B + C 端到端）。

#### Acceptance Scenarios — Dimension A：Response code 路線 II 落地（GAP B1 + B2）

1. **Given** base `.env` 設 `VITE_SERVICE_SUCCESS_CODE=0`，**When** base 收到 rust HTTP 200 + body `{code: 0, data: {...}, msg: "success", success: true}`，**Then** base 觸發 `onBackendSuccess`、`data` 進入 view layer
2. **Given** base `.env` 設 `VITE_SERVICE_LOGOUT_CODES=8888,8889`，**When** base 收到 rust HTTP 200 + body `{code: 8889, msg: "credential 已換", success: false}`，**Then** base 觸發 immediate logout flow
3. **Given** base `.env` 設 `VITE_SERVICE_MODAL_LOGOUT_CODES=7777,7778`，**When** base 收到 rust HTTP 200 + body `{code: 7778, msg: "帳號暫停用", success: false}`，**Then** base 顯示 modal 確認、按下後 logout
4. **Given** base `.env` 設 `VITE_SERVICE_EXPIRED_TOKEN_CODES=9999,9998,3333`，**When** base 收到 rust HTTP 200 + body `{code: 9999, msg: "access token expired", success: false}`，**Then** base 自動呼叫 `/auth/refreshToken` + retry 原 request
5. **Given** rust handler raise validation error（如必填欄位缺失），**When** base 收到 rust HTTP 200 + body `{code: 4001, msg: "field 'email' is required", success: false}`，**Then** base default error handler 觸發、UI 顯示 msg（4001 不在 base 任何 list、走預設路徑）

#### Acceptance Scenarios — Dimension B：camelCase 序列化（GAP B3）

6. **Given** rust struct 含 `refresh_token: String`，**When** serialize，**Then** JSON 欄位為 `refreshToken`（無 `refresh_token`）
7. **Given** rust struct 含 nested struct（如 `UserRoute { routes: Vec<MenuRoute>, home }`、`MenuRoute` 內含 `route_name` 等），**When** serialize，**Then** 各層級欄位都 camelCase（`routes`/`home`/`routeName`/...）
8. **Given** 既有 `UserInfoOutput` 含 per-field `#[serde(rename = "userId")]`，**When** 套用 F4 後改為 struct-level `#[serde(rename_all = "camelCase")]`，**Then** JSON 輸出與舊版完全等價（`user_id` → `userId`）

#### Acceptance Scenarios — Dimension C：Auth / UserInfo 欄位補齊（GAP B5）

9. **Given** rust `/auth/login` response，**When** base parse，**Then** `data` 物件含 `token: string` 與 `refreshToken: string` 兩欄位（透過 Dimension B 的 camelCase 達成、無需獨立改 code）
10. **Given** rust `/auth/getUserInfo` response，**When** base parse，**Then** `data` 物件含 `userId, userName, roles, buttons` 4 個欄位（齊全、無多無少、`roles` 與 `buttons` 為 array 型別）
11. **Given** F4 階段不涉及 button-level RBAC 配置，**When** user 取 getUserInfo，**Then** `buttons: []`（空陣列、欄位存在）；具體 button RBAC 內容來源（per-role config / menu-derived）留 **F7 manage-crud-alignment** 或更後續 feature

### Edge Cases

- **空集合 vs null**：rust `Vec<T>` 預設 serialize 為 `[]`；`Option<Vec<T>>::None` serialize 為 `null` — 對 base TS `string[]` 期望，所有 collection 欄位 MUST 用 `Vec<T>` 而非 `Option<Vec<T>>`（統一輸出 `[]`）
- **Pagination wrapper**：`PaginatedData<T>` 也是 `Res` 的 `data` 內容、必須遵守 camelCase 規則；分頁欄位（`page` / `pageSize` / `total` / `records`）需對齊 base 期望
- **Date/time 欄位**：預設 ISO 8601 字串；欄位名透過 rename_all 從 `created_at` 變 `createdAt`（值格式不變）
- **既有 per-field rename**：UserInfoOutput 中 `#[serde(rename = "userId")]` 與 struct-level `rename_all = "camelCase"` 對 `user_id` 輸出**等價**；統一改用 struct-level
- **Middleware-level errors**：Casbin deny / JWT 過期 / API key 無效 — 都 MUST 經 `IntoResponse` 轉成 `Res` 形式（HTTP 200 + body code），不可裸 HTTP 401/403
- **Axum pre-handler errors**：body parse fail / router 404 / panic recover — **不在 F4 範圍**（這些在 handler 抵達前發生，由 axum 預設行為處理）；base 需另外處理 network-level error
- **Nested struct rename**：rename_all **不遞迴** — 每個 struct（含 nested）都 MUST 各自有 rename_all attribute
- **Sea-ORM entity 直接 return**：rust handler 若直接 return DB entity struct（非 DTO wrapper），該 entity 也 MUST 加 rename_all（`/speckit-plan` 階段 audit 列出）

---

## Requirements *(mandatory)*

### Functional Requirements

#### Response envelope（FR-001 ~ FR-004）

- **FR-001**：所有 rust admin handler 在正常執行路徑 MUST return HTTP status 200（無論業務 success 或 error）
- **FR-002**：所有 admin handler response body MUST 用統一 envelope 結構，含 `code` / `data` / `msg` / `success` 四欄位（型別見 §Key Entities）
- **FR-003**：業務成功 MUST 設 `code: 0` 與 `success: true`
- **FR-004**：業務失敗 MUST 設 `success: false`（無論 code 屬哪個分群）

#### Code namespace（FR-005 ~ FR-009 + FR-018 ~ FR-020）

- **FR-005**：所有 error response code 值 MUST 來自 §Key Entities「Business code namespace」表（含 base 既有 8 條 + rust 新增 15 條）— 禁 magic number
- **FR-006**：rust validation error MUST 用 4xxx 群（4001 / 4002 / 4003）
- **FR-007**：rust permission error MUST 用 5xxx 群（5001 / 5002 / 5003 / 5004）
- **FR-008**：rust business logic error MUST 用 6xxx 群（6001 / 6002 / 6003 / 6004）
- **FR-009**：rust server-side error MUST 用 9xxx 群（9001 ~ 9005）；**禁用** 9998 / 9999 / 3333（base 保留作 expired token）
- **FR-018**：新增 rust business code constants MUST 定義在單一共用模組（如 `server_core::web::code` 或類似 path、由 `/speckit-plan` 拍板），其他 handler 透過引用該模組常數使用
- **FR-019**：base `.env` MUST 更新 `VITE_SERVICE_SUCCESS_CODE=0`（從 `0000`）
- **FR-020**：base `.env` 其他 list（`LOGOUT_CODES` / `MODAL_LOGOUT_CODES` / `EXPIRED_TOKEN_CODES`）值 MUST 保持不變（rust 配合輸出 base 既有 8 條 code）

#### Serialization（FR-010 ~ FR-014）

- **FR-010**：所有 rust 直接參與 (de)serialization 的 input / output struct MUST 加 struct-level `#[serde(rename_all = "camelCase")]`
- **FR-011**：既有 per-field `#[serde(rename = "...")]` directive MUST 移除，由 struct-level `rename_all` 取代（在輸出 JSON 等價的前提下；不等價的例外須在 `/speckit-plan` 階段個別合理化）
- **FR-012**：所有 collection 欄位 MUST 用 `Vec<T>` 而非 `Option<Vec<T>>`（空 vs missing 統一輸出 `[]`，不為 `null`）
- **FR-013**：Sea-ORM entity struct 若**直接**被 handler return（非透過 DTO wrapper），MUST 加 `rename_all`；`/speckit-plan` 階段須 audit 列出此類 entity
- **FR-014**：所有 nested struct（包含於其他 struct 的欄位類型）MUST 各自有 `rename_all`（rename_all 不遞迴、不依賴外層）

#### 特定欄位 GAP（FR-015 ~ FR-017）

- **FR-015**：`AuthOutput` MUST serialize 為 `{token, refreshToken}`（透過 FR-010 達成）
- **FR-016**：`UserInfoOutput` MUST 新增 `buttons: Vec<String>` 欄位
- **FR-017**：`UserInfoOutput` 最終 JSON shape MUST 為 `{userId, userName, roles, buttons}` 4 欄位齊全；F4 階段 `buttons` 預設輸出 `[]`、實際 RBAC 內容留 F7+ feature

#### Middleware 整合（FR-021）

- **FR-021**：rust middleware 層產生的錯誤（Casbin deny / JWT 無效 / API key 缺失）MUST 經 `IntoResponse` 轉為統一 envelope 形式（HTTP 200 + body 對應 code）；禁裸 HTTP 401 / 403

#### 範圍邊界（FR-022 ~ FR-023）

- **FR-022**：F4 **不**涵蓋 axum pre-handler error（body parse fail / 404 / panic recover）的 response shape 對齊 — 這些走 axum 預設、由 base network error handler 接住
- **FR-023**：F4 **不**包含 refresh token rotation 業務邏輯（GAP B4），僅負責 `refresh_token` → `refreshToken` 欄位 rename；rotation 邏輯由 F10 / F13 處理

### Key Entities

#### `Res<T>` envelope（標準 response 結構）

承 rust 既有 `server/core/src/web/res.rs`，4 欄位：

- `code: u16` — business code（見下表）
- `data: Option<T>` — 業務 payload，失敗時 `None`
- `msg: String` — 訊息（success 預設 `"success"`、failure 含具體錯誤描述）
- `success: bool` — `code == 0` 時為 `true`，否則 `false`

#### Business code namespace（完整 23 條對照表）

| Code | 群 | 語意 | 來源 | rust handler 觸發情境 |
|---|---|---|---|---|
| **0** | success | 業務成功 | base 既有 | 任何 `Res::new_success` / `new_data` / `new_message` |
| **8888** | logout | session 已被 server 端 invalidate | base 既有 | admin 強制踢除 / user banned |
| **8889** | logout | credential 已換、舊 session 全 invalidate（rust 內部語意區分） | base 既有 | password reset handler |
| **7777** | modal logout | 偵測 concurrent login | base 既有 | login conflict detection |
| **7778** | modal logout | 帳號暫時停用，需通知後登出 | base 既有 | account suspended detection |
| **9999** | expired | access token 過期（base 自動 refresh + retry） | base 既有 | JWT middleware 偵測 exp |
| **9998** | expired | refresh token 也過期（base 強制重新登入） | base 既有 | refresh handler 偵測 |
| **3333** | expired | token 簽章驗證失敗（強制重新登入） | base 既有 | JWT middleware 簽章 check |
| **4001** | validation | 必填欄位缺失 | **rust 新** | request body parse / DTO validation |
| **4002** | validation | 欄位值格式不合（email / phone / UUID 等） | **rust 新** | DTO validator |
| **4003** | validation | 約束違反（長度、範圍、enum 不符等） | **rust 新** | DTO validator |
| **5001** | permission | Casbin RBAC enforcement deny | **rust 新** | axum-casbin middleware |
| **5002** | permission | 角色不足（非 Casbin 結果，其他層級 check） | **rust 新** | handler-level guard |
| **5003** | permission | API key 缺失或無效 | **rust 新** | api_key_middleware |
| **5004** | permission | API key 簽章不符 | **rust 新** | api_key_middleware |
| **6001** | business | 實體不存在（user / role / menu / ... not found） | **rust 新** | service layer |
| **6002** | business | 重複 / 唯一性違反（DB level pre-check） | **rust 新** | service layer |
| **6003** | business | 狀態衝突（如更新已刪除 entity、操作不允許當前 state） | **rust 新** | service layer |
| **6004** | business | 依賴缺失（如 assign 不存在的 role） | **rust 新** | service layer |
| **9001** | server | DB error（connection lost / query fail / transaction 失敗） | **rust 新** | db_helper / Sea-ORM |
| **9002** | server | Cache error（redis 不可達 / 操作失敗） | **rust 新** | redis adapter |
| **9003** | server | 外部 service error（SMS / email gateway 等） | **rust 新** | 抽離項 stub 升級為實作後 |
| **9004** | server | Configuration error（envvar 缺失 / config 非法） | **rust 新** | startup / lazy init |
| **9005** | server | 內部 bug / panic recover | **rust 新** | panic handler |

**設計守則**：

- code 為**業務分類粒度**，不是「每個 endpoint 一個」；具體 endpoint 哪裡錯由 `msg` 帶
- rust 新增 codes 在 `/speckit-plan` 階段 MUST 產出常數定義（避免 magic number — FR-018）
- 8888 vs 8889、7777 vs 7778、9999 vs 9998 vs 3333 的 rust 內部語意區分**為 rust 決策**（base 對同 group 行為一致、不區分）
- base `.env` 4 個 list **不擴張**（保持 base 不改動原則）；rust 新增的 4xxx/5xxx/6xxx/9xxx code 都不在 base list、預設走 default error handler 顯示 msg

#### Code constants module（rust 共用模組）

rust 新增的單一共用模組（例如 `server_core::web::code` 或類似 path）— 集中定義 4001 / 4002 / ... / 9005 等常數。具體模組路徑由 `/speckit-plan` 階段拍板。

#### Rename convention（serialization 預設規則）

- **預設**：所有對外 serialize 的 struct（含 input / output / nested）使用 struct-level `#[serde(rename_all = "camelCase")]`
- **例外**：per-field `#[serde(rename = "...")]` 僅限**確有必要**（如欄位名不符合 camelCase 換 PascalCase / kebab-case 等特殊需求），且需在 `/speckit-plan` 階段個別合理化

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：100% rust admin endpoint 在正常 handler 路徑 return HTTP 200（隨機抽 5 個 endpoint 用 curl 驗證、全為 200）
- **SC-002**：base `_builtin/login` flow round-trip 跑通 — base 啟動 → 輸入 `Soybean / 123456` → rust 回 `{code:0, data:{token, refreshToken}, ...}` → base 進入 home view（瀏覽器 console 無 `onBackendFail` 警告）
- **SC-003**：`/auth/getUserInfo` response 結構 100% 對齊 base `Api.Auth.UserInfo` TS interface — curl 後 JSON 對照欄位數 = 4、欄位名一致（`userId, userName, roles, buttons`）、`roles` 與 `buttons` 為 array 型別
- **SC-004**：0 個 rust output struct 在 JSON output 含 snake_case 欄位名（grep + serialize test 驗證；snake_case pattern `[a-z]_[a-z]` 命中數 = 0）
- **SC-005**：4 個 GAP（B1 / B2 / B3 / B5）落入 3 個 dimensions（B1+B2 → A、B3 → B、B5 → C）對應 acceptance scenarios（共 11 個 scenario：5 + 3 + 3）全數通過
- **SC-006**：0 個 magic number — rust 全部 business code 引用都指向 Code constants module（grep `Res::new_error\([0-9]` 命中數 = 0，全部替換為常數引用）
- **SC-007**：rust validation / permission / business / server 各群至少有 1 個 acceptance test case 證明 code 範圍正確（4 群 × 至少 1 個 = 4 個 case）

---

## Assumptions

- **base `.env` 可被修改**（per [`DESIGN-A`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §1.3「可動：.env」原則 + Constitution v1.0.0 Principle IV）
- **`buttons` 欄位內容來源**（per-role config / menu-derived / hardcoded）為 **F7+ feature 範圍**；F4 只負責欄位存在且預設空陣列
- **Sea-ORM entity struct 直接被 handler return 的情況存在但有限**（`/speckit-plan` 階段 audit 數量）— 不直接 return 的 entity 不在 F4 範圍
- **B4 Refresh token rotation 業務邏輯不在 F4 範圍**（僅欄位 rename）— rotation 邏輯由 F10 / F13 處理
- **既有 per-field `#[serde(rename = "...")]` 替換為 struct-level `rename_all = "camelCase"` 後輸出 JSON 等價**（已驗證 `user_id` → `userId` 兩者結果一致）
- **F4 不引入新的 rust crate 依賴**（既有 validator 機制重用）
- **多語系 msg 不在 F4 範圍**（msg 預設中文或英文皆可，未來 i18n 留後續 feature）
- **F4 與 F1 / F2 / F3 可平行進行**（無依賴關係，per [`DESIGN-A`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.2）
