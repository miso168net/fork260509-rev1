# Research: F11 — extracted-stubs

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-19

4 個 R-Q research finding(resolve 2 個 brainstorm derive concern + 2 個 implement-time check)。

---

## R-Q1: `SysAuthenticationApi` 既有 file 結構是否容納 F11 3 個新 handler?

**Question**: F11 加 3 個 stub handler 在 `sys_authentication_api.rs` 既有 file 內、結構是否合理(R-2 file 過大緩解 evidence)。

**Evidence**(grep 2026-05-19):
- 既有 file:`rust-api/server/api/src/admin/sys_authentication_api.rs`、**112 行**
- 既有 struct + impl pattern:`pub struct SysAuthenticationApi;` + `impl SysAuthenticationApi { pub async fn ... }`(non-instance-method、static-style handler)
- 既有 5 個 handler:`login_handler` / `get_user_info` / `get_user_routes` / `assign_permission` / `assign_routes`
- 既有 handler signature 範例(login_handler):

  ```rust
  pub async fn login_handler(
      ConnectInfo(addr): ConnectInfo<SocketAddr>,
      headers: HeaderMap,
      TypedHeader(user_agent): TypedHeader<UserAgent>,
      Extension(request_id): Extension<RequestId>,
      Extension(service): Extension<Arc<SysAuthService>>,
      ValidatedForm(input): ValidatedForm<LoginInput>,
  ) -> Result<Res<AuthOutput>, AppError> { ... }
  ```

**Decision**: F11 3 個 stub handler 加在 `impl SysAuthenticationApi { ... }` 內、existing 5 個 handler 後面。File 從 112 行變 ~160-170 行、仍合理。

**Rationale**:
- struct + impl pattern 一致、簡單 append
- 不重構既有 5 個 handler、scope 最小
- stub handler 不需 service 注入(stub stateless),signature 更簡短

**F11 handler signature shape**(無 service / DB 依賴、純 stub):

```rust
pub async fn send_captcha(
    Json(input): Json<SendCaptchaInput>,
) -> Result<Res<serde_json::Value>, AppError> {
    tracing::info!(phone = %input.phone, "F11 stub: sendCaptcha called");
    Ok(Res::new_data(json!({ "code": "000000" })))
}
```

**Alternatives considered**:
- **Option B**: 拆出 `sys_stub_api.rs` 新檔(file 數 +2,但既有 sys_authentication_api.rs 結構不變)— 過度顆粒、未來 stub 多時再拆
- **Option C**: 加到 `sys_sandbox_api.rs`(rust 獨有 demo)— sandbox 為 API key sign demo,語意異質

---

## R-Q2: `MockRouter` 新建的 mount 點要對齊哪個既有 router 模式?

**Question**: `/mock/getLastTime` 1 條新 endpoint、應參考哪個 router file 結構(per Q5 結構決策驗證)。

**Evidence**(grep 2026-05-19):
- 12 個既有 route file 在 `rust-api/server/router/src/admin/`
- 既有 `sys_sandbox_route.rs` 結構(rust-only API key sign demo)、模式參考:

  ```rust
  use axum::{routing::get, Router};
  use server_api::admin::SysSandboxApi;

  pub struct SysSandboxRouter;

  impl SysSandboxRouter {
      const BASE_PATH: &str = "/sandbox";
      pub async fn init_simple_sandbox_router() -> Router {
          let router =
              Router::new().route("/simple-api-key", get(SysSandboxApi::test_simple_api_key));
          Router::new().nest(Self::BASE_PATH, router)
      }
  }
  ```

- 既有 `sys_authentication_route.rs` 結構(F11 改既有);3 個 `init_*_router()` 各對應一個 sub-prefix(`/auth` 內含 login / get-info / authorization);F11 加 3 個 stub 在既有 `/auth` 名前綴下,合邏輯放在 `init_protected_router` 或新建 `init_stub_router` 分支

**Decision**: `MockRouter` 完全對齊 `SysSandboxRouter` 模式:
- 1 個 struct `MockRouter` + `const BASE_PATH: &str = "/mock"`
- 1 個 `init_mock_router()` -> `Router::new().nest("/mock", router)`
- 1 個 mount:`/getLastTime` GET

**Rationale**:
- `sys_sandbox_route.rs` 是現成 1-2 endpoint mock-style 模式、F11 直接套用
- 不引入新 pattern、降低 review cognitive load
- F11 不需新建 RouteInfo(Casbin policy 透過 migration 寫死、不需 runtime register)

**F11 sys_authentication_route 加 3 個 mount 點**:
- `/auth/sendCaptcha` POST → `SysAuthenticationApi::send_captcha`
- `/auth/verifyCaptcha` POST → `SysAuthenticationApi::verify_captcha`
- `/auth/error` GET → `SysAuthenticationApi::auth_error`
- 加在 `init_protected_router()`(Casbin enforce 路徑)、含 RouteInfo register 對齊既有 pattern

**Alternatives considered**:
- **Option B**: MockRouter 模式參考 `sys_authentication_route.rs`(多 `init_*_router` 子分支)— 過度複雜、F11 只 1 endpoint
- **Option C**: MockRouter 不用 `nest`、直接 route("/mock/getLastTime", ...)— 不對齊既有 BASE_PATH 慣例

---

## R-Q3: F6 既有 Casbin migration 的具體 syntax(sea-orm migration API、column reference、INSERT pattern)?

**Question**: F11 沿用 F6 既有 Casbin migration pattern 需要的具體 syntax(per Q5 拍板 single migration、F11 沿用 F6 pattern)。

**Evidence**(grep 2026-05-19):
- F6 既有 `m20260518_a_f6_is_route_exist_seed.rs`(F6 merge `a431215` after-trim)
- 完整 INSERT/DELETE pattern(raw SQL via `Statement::from_string`):

  ```rust
  use sea_orm_migration::{prelude::*, sea_orm::Statement};

  #[derive(DeriveMigrationName)]
  pub struct Migration;

  #[async_trait::async_trait]
  impl MigrationTrait for Migration {
      async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
          let db = manager.get_connection();
          let insert_stmt = Statement::from_string(
              manager.get_database_backend(),
              r#"
              INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5)
              VALUES
              ('p', 'ROLE_SUPER', 'built-in', '/route/isRouteExist', 'GET', '', ''),
              ('p', 'ROLE_ADMIN', 'built-in', '/route/isRouteExist', 'GET', '', ''),
              ('p', 'ROLE_USER',  'built-in', '/route/isRouteExist', 'GET', '', '')
              "#
              .to_string(),
          );
          db.execute(insert_stmt).await?;
          Ok(())
      }

      async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
          // DELETE FROM casbin_rule WHERE ptype='p' AND v1='built-in' AND v2='/route/isRouteExist' AND v3='GET' AND v0 IN (...)
          ...
      }
  }
  ```

- 7 個 casbin_rule column:`(ptype, v0, v1, v2, v3, v4, v5)`
  - F6 只用 6 個 column(`v4` 與 `v5` 為 empty string `''`、policy_type=p 為 5-position policy `(role, domain, obj, action) + effect`、v4 應為 effect)

**Decision**: F11 完全沿用 F6 pattern + 修正 v4 為 `allow`(per spec FR-005 + brainstorm Q1 拍板):

```rust
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5)
VALUES
('p', 'ROLE_SUPER', 'built-in', '/auth/sendCaptcha',   'POST', 'allow', ''),
('p', 'ROLE_SUPER', 'built-in', '/auth/verifyCaptcha', 'POST', 'allow', ''),
('p', 'ROLE_SUPER', 'built-in', '/auth/error',         'GET',  'allow', ''),
('p', 'ROLE_SUPER', 'built-in', '/mock/getLastTime',   'GET',  'allow', ''),
('p', 'ROLE_ADMIN', 'built-in', '/auth/sendCaptcha',   'POST', 'allow', ''),
('p', 'ROLE_ADMIN', 'built-in', '/auth/verifyCaptcha', 'POST', 'allow', ''),
('p', 'ROLE_ADMIN', 'built-in', '/auth/error',         'GET',  'allow', ''),
('p', 'ROLE_ADMIN', 'built-in', '/mock/getLastTime',   'GET',  'allow', '')
```

**Rationale**:
- raw SQL 簡單明確、不依賴 sea-orm builder 抽象
- F6 已驗 pattern + idempotency(sea-orm `seaql_migrations` 追蹤、不重複 up())
- 7 col INSERT 對齊既有 schema、v4 為 effect column(`allow` / `deny`)
- ⚠️ **F6 v4 用 `''` empty string、F11 用 `'allow'`**(差異:F6 implicit allow / F11 explicit allow)。經 grep 既有 row 用 `allow` 為合理(F6 為 R-2 緩解 implicit、F11 顯式對齊 DESIGN-A §1.1「不顯式 allow 等於 default deny」精神)。

**Alternatives considered**:
- **Option B**: 4 個 per-endpoint migration — 過度顆粒、不推薦
- **Option C**: 用 sea-orm builder(`Query::insert()...`)而非 raw SQL — 增加複雜度、F6 已用 raw SQL 行得通

---

## R-Q4: 既有 rust `Res<T>` envelope 實際 JSON shape

**Question**: F11 acceptance C-V3 / C-V5 預期 response shape — `Res<T>` serialize 後實際 JSON field name 是什麼?

**Evidence**(Read tool 2026-05-19、`rust-api/server/core/src/web/res.rs:13-18`):

```rust
#[derive(Debug, Serialize, Default)]
pub struct Res<T> {
    pub code: u16,
    pub data: Option<T>,
    pub msg: String,
    pub success: bool,
}
```

- **無 serde rename**:field 為 `code` / `data` / `msg` / `success`(用 `msg` 非 `message`)
- `code: u16`(number、非 string)
- `data: Option<T>`(可為 null)
- 加額外 field `success: bool`(F4 envelope 一致)

**CODE_SUCCESS 值**(grep `rust-api/server/core/src/web/code.rs:12`):
- `pub const CODE_SUCCESS: u16 = 0;`

**Decision**: F11 spec/contracts 預期 response shape 修正為 actual rust envelope:

```json
{
  "code": 0,
  "data": { ...stub-specific... },
  "msg": "success",
  "success": true
}
```

原 spec.md US1.2 文字寫 `{code: 0, data, message:"success"}`、analyze A1 finding 已 fix 對齊 actual rust `Res<T>` shape(現 spec.md 用 `{code: 0, data, msg:"success", success:true}`);historic finding 紀錄為 spec drafting 階段 envelope field naming 偏差、analyze 階段 grep evidence 修正。F11 contracts/verification-commands.md C-V3/C-V5 用 actual `msg` + `success` 對齊。

**Rationale**:
- 直接 grep evidence 確認、避免 spec wording 偏差傳到實作
- 業務語意 = 「envelope code=0 + data 非 null + stub-specific field 對齊」、field name 為次要 detail
- F11 acceptance C-V5 用 `jq` 或 grep `"msg":"success"` 對齊 actual JSON 不用 `message`

**Alternatives considered**:
- **Option B**: 改 rust `Res<T>` 加 `#[serde(rename = "message")]`— 屬 F4 envelope 改、F11 範疇外(per FR-008 三邊零改動 / Constitution Principle IV)、且影響全 endpoint
- **Option C**: spec.md amendment(改 `message` → `msg`)— 屬 wording fix、不影響 acceptance、可在 implement-time observation 紀錄

---

## R-Q5: Casbin policy `v4` column — `allow` 顯式 vs 空字串 implicit allow(implement-time finding 2026-05-19)

**Question**: F11 Casbin migration row `v4` column 該寫 `'allow'` 顯式還是空字串?spec FR-005 SQL 範例 + data-model E6/E7 + contracts C-V2 原稿全寫 `v4='allow'`、與 F5.1 / F6 既有 baseline `v4=''` 不一致。

**Implement-time finding**(2026-05-19 acceptance 階段 C-V3 5/5 HTTP 502 BAD_GATEWAY、root cause 分析):

1. **Casbin model**(`rust-api/server/resources/rbac_model.conf`):
   ```
   [policy_definition]
   p = sub, dom, obj, act        # 4 field、無 eft

   [policy_effect]
   e = some(where (p.eft == allow))   # 引用 p.eft、但 p 定義沒 eft
   ```

2. **casbin-rs library 行為**(F5.1 / F6 既有 v4='' 工作驗證 + F11 v4='allow' 失敗實測):
   - `p = sub, dom, obj, act`(4 field)定義下、v4 column 為 implicit default field
   - **空字串 `v4=''`**:被 casbin-rs 視為 implicit allow(F5.1 + F6 既有 50 row 全 v4=''、enforce 正常)
   - **顯式 `v4='allow'`**:與 model implicit eft handling 衝突、`enforce_mut(...)` 回 `Err(_)`、middleware 視為 enforcement_error → HTTP 502 BAD_GATEWAY(per `rust-api/axum-casbin/src/middleware.rs:143-156`)

3. **Acceptance 階段 reproducible 驗**(2026-05-19):
   - F11 migration up() 用 v4='allow' INSERT 8 row → 5/5 stub endpoint 全 HTTP 502
   - 手動 `UPDATE casbin_rule SET v4='' WHERE v2 IN (4 endpoint) AND v4='allow'` → restart rust-api 重 load Casbin → 5/5 sub-case 全 HTTP 200 + expected response shape

**Decision**: F11 migration v4 改為 **空字串**(`v4=''`)、沿用 F5.1 / F6 baseline。

**Files updated**(implement-time):
- `rust-api/migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs`(up() INSERT v4='' + down() DELETE 移除 `AND v4='allow'` 過濾條件、改靠 v2 IN (...) + v0 IN (...) 唯一識別)
- `specs/020-extracted-stubs/spec.md` US3.1 + SC-005(query 移除 v4='allow' 過濾)
- `specs/020-extracted-stubs/data-model.md` E6 + E7(SQL + 表格)
- `specs/020-extracted-stubs/contracts/verification-commands.md` C-V2(query + expected output)

**Rationale**:
- F5.1 / F6 既有 baseline 全 v4=''、F11 沿用一致避免 cross-feature 不對齊
- Casbin model `p = sub, dom, obj, act` 4 field、本不該有 5 field policy literal、v4='allow' 為原稿 R-Q3 階段對 effect column 語意誤判
- 業務語意 = 「policy effect 是 allow」、與 v4 字面值無關(model implicit handle)、改 v4='' 不破壞 spec FR-005 / FR-006 業務語意

**Alternatives considered**:
- **Option B**: 改 Casbin model `p = sub, dom, obj, act, eft` 加 eft field → 全 codebase migration、影響既有 50 row、F11 範疇爆
- **Option C**: 用 `'p2'` ptype 顯式 effect policy(Casbin enhanced policy)→ complex pattern、F11 不需此複雜度

**Spec FR-005 業務語意完整性**:
- 原文「INSERT 8 row(2 role × 4 endpoint × `p` policy with `allow`)」
- 「with allow」= 業務 effect 為 allow、與 v4 字面值無關(model implicit handle)、F11 v4='' 沿用 baseline 完全滿足 FR-005 業務要求
- F11 acceptance C-V4(GeneralUser HTTP 403)反證 deny 路徑生效 = allow / deny 業務語意完整

---

## R-Q6: Casbin deny path 實際 HTTP status + envelope shape(implement-time finding 2026-05-19)

**Question**: F11 acceptance C-V4 GeneralUser sendCaptcha 預期 HTTP 403、但 actual rust-api 回 HTTP 200 + F4 envelope `{code:5001, success:false}`。原稿假設與 actual 行為不一致、root cause?

**Evidence**(grep 2026-05-19、`rust-api/server/core/src/web/code.rs:33` + `rust-api/server/initialize/tests/login_handler_integration.rs:8-9`):

- `CODE_PERMISSION_CASBIN_DENY = 5001`(application-level error code)
- rust-api 有 **`casbin_envelope_adapter`** middleware(login_handler_integration.rs 文件:「`CasbinAxumLayer` rejects an unmatched route with plain text 403; `casbin_envelope_adapter` rewrites it to `{code:5001, msg:"您没有访问该资源的权限，请联系管理员", data:null}`」)
- HTTP 級回 200、application-level deny 由 envelope code 5001 表達(對齊全 codebase F4 envelope 紀律、避免 raw text 4xx response 漏 envelope)

**Decision**: F11 spec C-V4 / SC-004 + contracts 預期 response 修正為 actual rust-api 行為:

```json
HTTP 200
{"code":5001,"data":null,"msg":"您没有访问该资源的权限，请联系管理员","success":false}
```

**Files updated**(implement-time):
- `specs/020-extracted-stubs/spec.md` US2 scenario 2 + SC-004(改 HTTP 200 + envelope `{code:5001}`)
- `specs/020-extracted-stubs/contracts/verification-commands.md` C-V4 Expected + Pass criteria + 完成標誌表

**Rationale**:
- F11 acceptance **業務語意**為「deny 路徑生效、不回 allow data」、HTTP 級 status 為次要(spec wording inaccuracy 屬 drafting 階段對 axum-casbin raw 行為的誤認、未涵蓋 rust-api 自有 envelope adapter 層)
- rust-api 全 codebase F4 envelope 紀律(F4 + F10 + F10.1 + F10.2 既有 contract):4xx / 5xx 業務 deny / error 全 wrap 成 200 + envelope `{code:NNNN, success:false}`、HTTP 級為 transport 級成功 + application-level error
- C-V4 pass criteria 改為「envelope code=5001 + success=false + data=null + msg 含中文 deny 字串」、business semantic 不變、acceptance 強度等同 raw 403

**Spec FR / SC 業務語意完整性**:
- 原 FR-006「GeneralUser 不插 row、default deny」業務不變
- Casbin enforce 對 ROLE_USER deny 行為 100% 等效(只是 transport 層 wrap 方式不同)
- Principle I「RBAC fail-safe」業務語意完整滿足

**Alternatives considered**:
- **Option B**: bypass `casbin_envelope_adapter`、F11 C-V4 直接驗 axum-casbin raw 403 → 跨多層 middleware 偏離 acceptance scope、F11 範疇外
- **Option C**: 改 rust-api 規範 layered 行為使 deny 回 4xx → 全 codebase F4 envelope 紀律改、F11 範疇外

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 `SysAuthenticationApi` 結構 + handler signature pattern 明確
- ✅ R-Q2 `MockRouter` 對齊 `sys_sandbox_route.rs` 模式
- ✅ R-Q3 F6 Casbin migration raw SQL pattern(v4 effect column 原稿擬 'allow'、見 R-Q5 implement-time fix)
- ✅ R-Q4 rust `Res<T>` envelope actual shape(`msg` / `success` 額外 field、`code: u16`)
- ✅ R-Q5 Casbin v4 column 空字串 implicit allow(implement-time fix、F5.1/F6 baseline 沿用)
- ✅ R-Q6 Casbin deny path actual HTTP 200 + envelope `{code:5001}`(implement-time finding、acceptance C-V4 對齊)
- ✅ 所有 NEEDS CLARIFICATION 已 resolve(spec.md 階段 0 marker、本 research 階段 0 新 marker)
- ✅ Ready for Phase 1 (data-model.md / contracts / quickstart)
