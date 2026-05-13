# Research: F4 — response-shape-alignment

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) + [`plan.md`](./plan.md) + 2026-05-14 rust-api / base-web codebase audit

## Audit Summary（執行於 2026-05-14）

| Audit Item | 結果 |
|---|---|
| `Res<T>` envelope 既有狀態 | 4 欄位（`code: u16` / `data: Option<T>` / `msg: String` / `success: bool`）齊全；success path 5 處用 `StatusCode::OK.as_u16()` (=200) |
| `Res::` 既有引用數 | 50 處（grep `Res::`） |
| `AuthOutput` 當前 | `{ token: String, refresh_token: String }` — 無 rename，輸出 snake_case `refresh_token`（違反 dimension C scenario 9） |
| `UserInfoOutput` 當前 | `{ user_id, user_name, roles: Vec<String> }` + 2 處 per-field rename for camelCase；**缺 `buttons` 欄位**（違反 FR-016/017） |
| `UserRoute` / `MenuRoute` | UserRoute 欄位（routes / home）單字無 case 差異；MenuRoute 在 `sys_menu.rs` 有 6 處 per-field rename for camelCase（`menuType` / `routeName` 等）|
| 既有 struct-level `rename_all = "camelCase"` | 7+ 處（`sys_login_log.rs` / `sys_operation_log.rs` / `sys_authorization.rs` × 3 / `sys_user.rs` 等） |
| 既有 per-field `rename = ` 用途分類 | (a) **enum variant** rename（`redis_config.rs` / `sea_orm_active_enums.rs`）— **保留**（不在 F4 範圍）；(b) **field camelCase** rename（`sys_menu.rs` × 6 / `sys_authentication.rs` × 2）— **F4 替換目標** |
| Middleware violation（FR-021） | 確認：`api_key_middleware.rs:129/133` 用 `StatusCode::UNAUTHORIZED.as_u16()` / `BAD_REQUEST.as_u16()` 作 envelope code（=401/400）；`web/auth.rs:126` 同（=401）— 都應改為 5xxx 業務 code |
| base TS interface 對齊目標（`base-web/src/typings/api/auth.d.ts`） | ✅ 100% 對齊 spec dimension C 預期：`Auth.LoginToken { token, refreshToken }` + `Auth.UserInfo { userId, userName, roles: string[], buttons: string[] }` |
| `base-web/.env` 結構 | 3 檔：`.env`（base）、`.env.prod`、`.env.test`（**無 `.env.dev`**）；`VITE_SERVICE_SUCCESS_CODE=0000` 只在 `.env`、prod/test 未覆寫 — F4 唯一改動點為 `.env` |

---

## Resolved Decisions（R1 ~ R7）

### R1 — Code constants module 路徑（resolve FR-018）

- **Decision**: 新增 `rust-api/server/core/src/web/code.rs`，與既有 `res.rs` 並列，namespace `server_core::web::code`
- **Rationale**:
  - 既有 `server/core/src/web/` 已是 envelope (`res.rs`) + 錯誤 (`error.rs`) + middleware (`auth.rs`, `jwt.rs`, `request_id.rs`) + log (`operation_log.rs`) + util (`util.rs`) 集中地
  - `code.rs` 與 `res.rs` 並列最符合「response 相關語意集中」
  - 既有 `mod.rs` 加一行 `pub mod code;` 即可暴露
- **Alternatives considered**:
  - `server/api/src/code.rs`：被 handler crate 引用、但 `web/` 是更基礎的層（middleware 也要引用），api crate 不適合放共用常數
  - `server/core/src/code.rs`（top-level、與 `web/` 平行）：與 `web::res::Res` 在不同層級、引用路徑變長 `server_core::code::CODE_*` vs `server_core::web::code::CODE_*` — 後者命名更貼近 envelope 上下文

### R2 — Code constants 命名規範（resolve clarify-deferred Q3）

- **Decision**: **SCREAMING_SNAKE_CASE + flat namespace + semantic suffix**，格式 `CODE_<群>_<語意>`
  - 範例：`CODE_SUCCESS`（0）/ `CODE_LOGOUT_SESSION_INVALIDATED`（8888）/ `CODE_VALIDATION_REQUIRED_FIELD`（4001）/ `CODE_PERMISSION_CASBIN_DENY`（5001）/ `CODE_BUSINESS_ENTITY_NOT_FOUND`（6001）/ `CODE_SERVER_DB_ERROR`（9001）
- **Rationale**:
  - 單一模組 + flat namespace：引用 `code::CODE_VALIDATION_REQUIRED_FIELD` 比子模組 `code::validation::REQUIRED_FIELD` 短且 grep 友善
  - `CODE_<群>_*` prefix pattern 讓 `grep "CODE_VALIDATION_"` 一次找出 4xxx 全部
  - rust idiom SCREAMING_SNAKE_CASE 為 `const` 標準
- **Alternatives considered**:
  - 子模組分層（`code::validation::REQUIRED`）：引用路徑長、需多 `use` statement
  - 無 prefix（`VALIDATION_REQUIRED_FIELD`）：與其他 const 容易撞名（缺 namespace 區別性）

### R3 — `msg` 欄位語言規範（resolve clarify-deferred Q2）

- **Decision**: **全英文**（i18n-neutral）
  - 範例：`"field 'email' is required"` / `"user not found"` / `"session invalidated"` / `"casbin policy denied"`
- **Rationale**:
  - 統一語言便於 log / sentry / grafana 處理（避免中英混雜噪音）
  - 未來 i18n feature 啟動時，base 用 code 作 lookup key 翻譯（msg 變成 fallback、不需從中文翻譯）
  - 開發者面向 log 比 user 面向 msg 多（debug / on-call 需要英文）
- **Alternatives considered**:
  - 全中文：admin UI 顯示直觀、但 log 不便 grep（特別跨語言 stack）
  - mix（程式錯誤英文、業務訊息中文）：規範模糊、handler 實作時要判斷、易不一致
  - 留 `/speckit-tasks` 拍板：實作階段才決會散亂（先寫的 handler 不知未來規範）

### R4 — FR-013 audit 邊界（entity 直接 return 含 wrapper 嗎？）

- **Decision**: **凡是 `axum::response::IntoResponse` 路徑上被 serialize 的 struct 都納入 audit**，含 `Vec<EntityModel>` 與 `PaginatedData<EntityModel>` wrapper 內的 element type
  - audit 工具：grep `Res<.*Model>` / `Res<Vec<.*Model>>` / `Res<PaginatedData<.*Model>>`
- **Rationale**:
  - rename_all 不遞迴（spec Edge Cases 已明示）— wrapper 加 rename_all 對內層 element 無效
  - 即使 wrapper 是 admin DTO struct、內層 element 是 entity，內層仍需要自己的 rename_all
- **Alternatives considered**:
  - 只 audit handler 直接 return 的 outer struct：漏 nested element、會留 snake_case 漏洞

### R5 — 既有 per-field rename 替換策略

- **Decision**: 分兩類處理 per-field `#[serde(rename = "...")]`
  - **(a) enum variant rename** (`redis_config.rs` / `sea_orm_active_enums.rs`)：**保留不動**（FR-011 規範 case 對齊、與 enum variant 業務命名無關）
  - **(b) field camelCase rename**（`sys_menu.rs` × 6 / `sys_authentication.rs` × 2）：**移除 per-field rename + 加 struct-level `rename_all = "camelCase"`**
- **Rationale**:
  - enum variant rename 是改 serialized value（如 `Banned` → `"banned"`）、不是 case 風格
  - struct-level rename_all 只影響 field 名、不影響 enum variant
  - 替換等價性驗證：`user_id` + per-field rename `"userId"` = `user_id` + struct-level `rename_all = "camelCase"`（已知等價、spec Edge Cases 已明示）
- **Alternatives considered**:
  - 全部 per-field rename 都改 struct-level：會 break enum variant 序列化

### R6 — Middleware error 對應 code 映射（resolve FR-021）

- **Decision**：

| Middleware | 既有 error | F4 後 envelope code |
|---|---|---|
| `api_key_middleware.rs:129` 缺 API key | `StatusCode::UNAUTHORIZED.as_u16()` (=401) | `CODE_PERMISSION_API_KEY_MISSING` (=5003) |
| `api_key_middleware.rs:133` 簽章不符 | `StatusCode::BAD_REQUEST.as_u16()` (=400) | `CODE_PERMISSION_API_KEY_SIGNATURE_INVALID` (=5004) |
| `web/auth.rs:126` JWT 未授權 | `StatusCode::UNAUTHORIZED.as_u16()` (=401) | `CODE_PERMISSION_CASBIN_DENY` (=5001) 或 `CODE_PERMISSION_ROLE_INSUFFICIENT` (=5002) — 視 enforcement 來源 |
| `operation_log.rs:426/440` | `StatusCode::BAD_REQUEST` | 視具體情境取 4xxx 群 — `/speckit-tasks` 階段個別決議 |
| JWT middleware token 過期 | (新增) | `CODE_EXPIRED_ACCESS_TOKEN` (=9999) |
| JWT middleware 簽章失敗 | (新增) | `CODE_EXPIRED_TOKEN_SIGNATURE` (=3333) |

- **Rationale**:
  - HTTP 永遠 200（FR-001）；middleware 全經 `IntoResponse` 轉 `Res` envelope（既有機制已就緒，see res.rs:68）
  - code 對應 spec.md 23 條 namespace
- **Alternatives considered**:
  - 用通用 `CODE_PERMISSION_DENIED`（單一 code 5000）：失粒度、debug 困難

### R7 — `Res<T>` envelope 既有 shape vs F4 預期

- **Audit 結論**: ✅ 4 欄位已齊全（`code` / `data` / `msg` / `success`）
- **唯一差異**: success path 5 處用 `StatusCode::OK.as_u16()` (=200)，F4 要求改為 `0`（=`CODE_SUCCESS`）
- **Decision**: 
  - 在 `code.rs` 定義 `pub const CODE_SUCCESS: u16 = 0;`
  - `res.rs` 內 `new_success` / `new_paginated` / `new_message` / `new_data` 5 處 `StatusCode::OK.as_u16()` 全部替換為 `CODE_SUCCESS`
  - `success: bool` 邏輯維持（既有 method 已正確設定）
- **Rationale**: 既有 envelope shape 完全相容、只是 success path code 值的常數來源換掉
- **Cascade impact**: 既有 50 處 `Res::new_success` / `Res::new_data` 等引用，**無需個別改動**（success path code 值由 envelope 內部決定、handler 透傳）

---

## Outstanding Items（plan 階段未拍板、留 `/speckit-tasks` 階段處理）

| Item | 為何 defer | Owner phase |
|---|---|---|
| 確切影響的 output / input / entity struct 完整清單 | 需 grep 全 codebase + 對 FR-013 audit 邊界（含 wrapper）逐個 verify | `/speckit-tasks` 階段 audit phase |
| `operation_log.rs` 內部 error code 對應 | 需細看 line 426/440 context | `/speckit-tasks` 階段 |
| handler-level error 既有 `Res::new_error(<magic>)` 替換清單 | 需 grep `Res::new_error\(` 加上各 callsite context 判斷該用哪個 code 常數 | `/speckit-tasks` 階段 |

---

**Phase 0 結論**：✅ 所有 [NEEDS CLARIFICATION] 都已 resolve 為具體 decision；codebase audit 已掌握實際改動範圍與既有對齊基礎。可進入 Phase 1 (data-model / contracts / quickstart)。
