# F11 — extracted-stubs

**Date**: 2026-05-19
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-19(5 顯式拍板 Q + project context exploration via grep)

---

## Scope summary

rev1 application Phase 4 收尾後**第一個** post-Phase-4 feature(F10 wire-up + F10.1 R-8 修 + F10.2 R-7 修 三件套全完整、refreshToken end-to-end pass 後接續、F9/F12/F13 之前可選擇任一)。**補 4 條抽離項 stub endpoint**(per [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §4.2):

| Endpoint | Method | Stub 行為 |
|---|---|---|
| `/auth/sendCaptcha` | POST | 接 `{phone}`、log + 回固定碼 `{"code":"000000"}` |
| `/auth/verifyCaptcha` | POST | 接 `{phone, code}`、`code=="000000"` 為 `{"verified":true}` |
| `/auth/error` | GET | demo only,接 `?code=&msg=` query 反 echo |
| `/mock/getLastTime` | GET | 回 `{"time":"<ISO 8601>"}` |

加 **1 個 Casbin policy seed migration**:`Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN) allow / GeneralUser deny`、INSERT 8 row(2 role × 4 endpoint)。

範疇刻意收緊到「**4 條 stub 補位 + Casbin enforce + 三邊零改動**」、**不加 sys_menu seed / 不加新 role / 不寫 audit log / 不加 unit test / 不驗 base-web e2e / 不接真 SMS provider**。

**Commit 模式**(post brainstorm 拍板):**兩段式**(per CLAUDE.md §6.1、類 F10.1/F10.2/F6/F5.1):rust-api worktree 1 commit + outer 1-2 commit(spec docs + INTEGRATION-CHECKLIST.md milestone + SHA pin + CLAUDE.md SOP marker;**無 docker-compose.yml 改**,W-FA1 既有 wire 已涵蓋)。

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1「抽離項管理」 + §4.2「抽離項清單 × stub 行為 × 升級路徑」(F11 主來源)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 4(F11 在 F10/F10.1/F10.2 後、與 F9/F12 並行)
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) §4.2 + §6(F11 在 DESIGN-B 完全繼承、identical)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I「RBAC fail-safe」 + IV「base 不改動邊界」 + V「漸進收縮」— F11 stub 是過渡、未來升級路徑明確)
- 既有 rust `SysAuthenticationApi`(`rust-api/server/api/src/admin/sys_authentication_api.rs`、5 個 handler:login_handler / get_user_info / get_user_routes / assign_permission / assign_routes、F11 加 3 個 stub handler)
- 既有 rust router 結構(`rust-api/server/router/src/admin/`、12 個 route file、F11 新建 `sys_mock_route.rs`)
- 既有 F6 Casbin policy seed pattern(`m20260518_a_f6_is_route_exist_seed.rs`、F11 沿用 INSERT casbin_rule pattern)
- 既有 F5.1 seed user(Soybean/ROLE_SUPER、Administrator/ROLE_ADMIN、GeneralUser、3 user 共用密碼 `123456`)

---

## Clarifying Q(5 個 brainstorm 拍板)

### Q1 — Casbin policy 哪些 role allow?

**A:Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN) allow、GeneralUser deny**。

理由:
- DESIGN-A §4.2 寫「test / demo / admin」、但 rev1 seed user 只有 3 個 role(ROLE_SUPER / ROLE_ADMIN / ROLE_USER)、無 test / demo role
- 加新 role(test/demo)= F11 scope 從 ~170-200 LOC 變 ~250-300 LOC、跨多 migration 表、複雜度提升、不在 v1 範疇
- Soybean + Administrator allow 對應 DESIGN-A 「admin」精神;GeneralUser deny 對應 DESIGN-A「多數 role deny」紀律
- 未來 demo / test role 產生時加 Casbin migration 拓展、不破壞 F11 結構

對比:
- **Option B 只 Soybean allow**:最保守、但 Administrator 也應有 admin 級 stub 權限
- **Option C 三 role 全 allow**:不符 DESIGN-A「多數 role deny」、GeneralUser 不該看到 SMS 驗證碼按鈕
- **Option D 加新 role test/demo**:正確路徑但 over-engineering、scope ~250 LOC、複雜度提升、跨 sys_role + sys_user_role + casbin migration

### Q2 — sys_menu 表 seed 加不加?

**A:不加 menu seed、只加 endpoint + Casbin policy**。

理由:
- F11 scope 最小化、只 Casbin enforce 一層防線(DESIGN-A 寫「雙重 gate」、F11 第二層 menu × role 留後續)
- stub endpoint 可被前端 hardcode 路徑呼叫(`/auth/sendCaptcha` 在 base-web example login view 是寫死 button)、不依賴 menu API
- base-web example branch 已有對應 view、F11 不驗 base-web e2e、不必確認 menu API 是否帶出
- 加 menu seed = scope ~3-5 條 menu 新增 + sys_role_menu 關聯 seed、跨 2-3 migration 檔、grep base-web menu API 路徑、複雜度上升

對比:
- **Option B 加 menu seed**:scope 變大、跨 2-3 migration、grep base-web 工作量增加
- **Option C 拆 F11.1/F11.2**:過度顆粒、F11 已是小 scope 不需拆

### Q3 — Handler 進階設計(unit test / validation / audit)該不該加?

**A:紫極簡 stub、無 unit test、無 input validation、無 audit log**。

理由:
- stub 邏輯 stack-可見(curl 驗 200 + 預期 response 即可)、無 enum derive macro 等隱藏層、unit test 邊際效益低
- stub handler 無 DB write、不觸 Principle II audit 紀律(N/A)
- input 用 serde `Deserialize` derive 預設行為 reject malformed JSON、validation 邏輯留真接 SMS provider 時加
- DESIGN-A §4.2 寫「stub 行為:接收 phone、log + 回固定碼 `000000`」直譯實作、不 over-engineering
- 對齊 F10.2 「精簡單 file 補 + 1 unit test SHOULD」、F11 「精簡 stub + 0 unit test」更精簡

對比:
- **Option B 加 unit test**:F6 unit test 為 0、F10.1 為 MUST(stack-不可見 fallback)、F10.2 為 SHOULD(stack-不可見 derive 行為);F11 4 條 stub 全 stack-可見、unit test 邊際效益低
- **Option C 加 input validation**:過度約束 stub、留未來真接時加
- **Option D Full**:over-engineering、不符 DESIGN-A v1「低代價 stub」意圖

### Q4 — Acceptance 範疇主體(多忙驗 Casbin enforce)?

**A:Soybean allow 4 endpoint + GeneralUser deny 1 endpoint = 5 個 acceptance curl**。

理由:
- Soybean 4/4 endpoint 200 = stub handler 行為對齊驗證(每個 stub 各 1 curl)
- GeneralUser × 1 endpoint deny 驗 Casbin fail-safe(per Principle I);1 個 endpoint 足證 enforce 機制 work、4 endpoint Casbin policy 同 row pattern、不必重複驗
- Administrator 是 Casbin functional duplicate of Soybean(同 allow 對 4 endpoint)、跑也只是冗餘
- 對比 Option B「3 role × 4 endpoint = 12 curl」太繁、acceptance 5-7 min 過長

對比:
- **Option B 12 個 curl matrix**:腦粉複雜、acceptance time 過長、邊際效益低
- **Option C 三 role 各 1 endpoint**:endpoint 覆蓋不全、3 條 curl 但漏 stub 行為驗
- **Option D + base-web SPA e2e**:over-engineering、不符 v1 stub 意圖

### Q5 — Endpoint file 組織 + Casbin migration 組織?

**A:auth 3 條加 `sys_authentication_api.rs`、`/mock/getLastTime` 新建 `sys_mock_api.rs` + `sys_mock_route.rs`、Casbin 1 個 single migration**。

理由:
- `/auth/*` 3 條與既有 5 個 auth handler 同名前綴、合邏輯放同檔(file 從 ~150 LOC 變 ~200 LOC、仍合理)
- `/mock/*` 1 條與 auth 語意不同(mock 是 demo 用、auth 是業務 endpoint)、拆出 `sys_mock_api.rs` 避免同檔混雜、對齊 `sys_sandbox_api.rs` rust 獨有 demo 慣例
- Single migration = INSERT 8 row 一次性、down() DELETE 對應 8 row、乾淨可 rollback;4 個 per-endpoint migration = 過度顆粒(per Q5 Option C)
- 對齊 F6 既有 pattern(`m20260518_a_f6_is_route_exist_seed.rs`、single migration)

對比:
- **Option B 全 1 file**:mock 與 auth 混雜、未來誤讀
- **Option C 4 migration**:過度顆粒、不推薦
- **Option D mock 1 條塞 sys_sandbox_api.rs**:`sandbox` 為 API key sign demo、與 `/mock/getLastTime` polling demo 異質、不適合複用

---

## Implementation outline

### File-by-file 改動明細

**Worktree(`rust-api/`、~9 file、~170-200 LOC)**:

| # | File | 改動 | 預估 LOC |
|---|---|---|---|
| 1 | `server/api/src/admin/sys_authentication_api.rs` | +3 handler:`send_captcha` / `verify_captcha` / `auth_error` | +50 |
| 2 | `server/api/src/admin/sys_mock_api.rs` | **新建**、1 struct `SysMockApi` + 1 handler `get_last_time` | +30 |
| 3 | `server/api/src/admin/mod.rs` | `pub mod sys_mock_api;` 1 line | +1 |
| 4 | `server/router/src/admin/sys_authentication_route.rs` | +3 route mount + 對應 RouteInfo | +15 |
| 5 | `server/router/src/admin/sys_mock_route.rs` | **新建**、`MockRouter::init_mock_router()` 含 `/mock/getLastTime` GET | +25 |
| 6 | `server/router/src/admin/mod.rs` | `pub mod sys_mock_route;` + register MockRouter | +3 |
| 7 | `server/model/src/input/sys_auth.rs` 或 `sys_stub_dto.rs` | DTO:`SendCaptchaInput` / `VerifyCaptchaInput` / `AuthErrorQuery` | +20 |
| 8 | `migration/src/datas/m20260519_a_f11_extracted_stubs_seed.rs` | **新建**、MigrationTrait impl + 8 row INSERT + down() DELETE | +50 |
| 9 | `migration/src/datas/mod.rs` | `pub mod m20260519_*;` + lib register | +2 |

**總計 ~196 LOC、9 file**(實作可能 ~170-200 區間)。

### Handler code shape(範例)

```rust
// sys_authentication_api.rs (新加 3 個)

#[derive(Debug, Deserialize)]
pub struct SendCaptchaInput { pub phone: String }

pub async fn send_captcha(
    Json(input): Json<SendCaptchaInput>,
) -> Result<ApiResponse<serde_json::Value>, AppError> {
    tracing::info!(phone = %input.phone, "F11 stub: sendCaptcha called");
    Ok(ApiResponse::ok(json!({ "code": "000000" })))
}

#[derive(Debug, Deserialize)]
pub struct VerifyCaptchaInput { pub phone: String, pub code: String }

pub async fn verify_captcha(
    Json(input): Json<VerifyCaptchaInput>,
) -> Result<ApiResponse<serde_json::Value>, AppError> {
    let verified = input.code == "000000";
    Ok(ApiResponse::ok(json!({ "verified": verified })))
}

#[derive(Debug, Deserialize)]
pub struct AuthErrorQuery { pub code: Option<String>, pub msg: Option<String> }

pub async fn auth_error(
    Query(q): Query<AuthErrorQuery>,
) -> Result<ApiResponse<serde_json::Value>, AppError> {
    Ok(ApiResponse::ok(json!({
        "code": q.code.unwrap_or_default(),
        "msg":  q.msg.unwrap_or_default(),
    })))
}
```

```rust
// sys_mock_api.rs (新 file)

pub struct SysMockApi;
impl SysMockApi {
    pub async fn get_last_time() -> Result<ApiResponse<serde_json::Value>, AppError> {
        Ok(ApiResponse::ok(json!({
            "time": chrono::Utc::now().to_rfc3339(),
        })))
    }
}
```

### Migration code shape(`m20260519_a_f11_extracted_stubs_seed.rs`)

```rust
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let stubs = [
            ("/auth/sendCaptcha",   "POST"),
            ("/auth/verifyCaptcha", "POST"),
            ("/auth/error",         "GET"),
            ("/mock/getLastTime",   "GET"),
        ];
        for role in ["ROLE_SUPER", "ROLE_ADMIN"] {
            for (obj, act) in &stubs {
                let stmt = Query::insert()
                    .into_table(CasbinRule::Table)
                    .columns([CasbinRule::Ptype, CasbinRule::V0, CasbinRule::V1,
                              CasbinRule::V2, CasbinRule::V3, CasbinRule::V4])
                    .values_panic(["p".into(), role.into(), "built-in".into(),
                                   (*obj).into(), (*act).into(), "allow".into()])
                    .to_owned();
                manager.exec_stmt(stmt).await?;
            }
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // DELETE WHERE ptype='p' AND v2 IN (...) AND v4='allow'
        // ...
    }
}
```

---

## Constitution Check 預估

| Principle | F11 評估 |
|---|---|
| **I — RBAC Fail-safe** | ✅ PASS — 4 stub endpoint Casbin enforce、GeneralUser deny 必驗 |
| **II — Soft Delete + Audit** | N/A — F11 無 DB write、不觸 audit 紀律 |
| **III — 嚴版禁 Forward + 單一職責** | ✅ PASS — rust handler 直接回 response、不 forward 到 nestjs |
| **IV — base 不改動邊界** | ✅ PASS — base-web + nestjs fork 三邊零改動延伸 |
| **V — 漸進收縮** | ✅ PASS — stub 是 DESIGN-A 過渡、DESIGN-B 階段升級為真實作或保留(per DESIGN-A §4.2)、無破壞性 |

**判定**:5 項全 PASS / N/A、無 Complexity Tracking。

---

## Acceptance(7 個 C-V、對齊 F10.2 同 pattern)

| ID | Goal |
|---|---|
| **C-V1** | rust-api image rebuild OK(warm ~2-3 min) |
| **C-V2** | migration init container rerun + 8 row 落 casbin_rule(`SELECT COUNT(*) WHERE ...` = 8) |
| **C-V3** | Soybean 4 endpoint 全 HTTP 200(`sendCaptcha` / `verifyCaptcha` / `auth/error` / `mock/getLastTime`)+ 預期 response shape |
| **C-V4** | GeneralUser 1 endpoint HTTP 403(Casbin enforce fail-safe、Principle I) |
| **C-V5** | Stub 回應 shape 正確(`sendCaptcha → {code:"000000"}` / `verifyCaptcha → {verified:true}` / `auth_error → {code, msg}` / `getLastTime → {time:"<ISO>"}`) |
| **C-V6** | Tracing log 有 `phone` field(sendCaptcha) |
| **C-V7a** | Three-side scope:base-web 0 diff / nestjs 0 diff / rust-api 9 file ~170-200 LOC / **無 docker-compose.yml 改** |
| **C-V7b** | W-FA1 stack regression:6 service healthy + migration exited 0 (rerun) + rust-api 重啟 |

共 8 個 verification、~5-7 min(不含 image rebuild)。

---

## Risks

| ID | 風險 | 機率 | 緩解 |
|---|---|---|---|
| **R-1** | Casbin `v0=ROLE_SUPER/ROLE_ADMIN` 與既有 seed user role assignment 不對齊 | 低 | F6 已驗 `ROLE_SUPER`(Soybean) / `ROLE_ADMIN`(Administrator)在 sys_user_role 既有對應、F11 沿用同名 |
| **R-2** | sys_authentication_api.rs 既有 5 handler + F11 +3 致 file 過大 | 低 | ~200 LOC 仍合理、F11 不重構既有 handler、未來需拆再說 |
| **R-3** | `/mock/getLastTime` mock 名前綴未來膨脹 | 極低 | DESIGN-A §4.2 寫「不升級(永久 demo 用)」、不會擴張 |
| **R-4** | Casbin `g` rule(user-role)既有 seed 缺 Administrator | 極低 | F6 acceptance 已驗 Administrator 行 sys-user 等 endpoint、`g` rule 已 in DB |
| **R-5** | nestjs fork 既有 `/auth/sendCaptcha` 與 rust 重疊(nginx 路由衝突) | 極低 | nginx W-F5 + W-FA2 既有設計除 `/api/auth/refreshToken` 走 nestjs、其餘 `/api/*` 都 rust、F11 4 條 stub 不在 TRANSITIONAL block |
| **R-6** | base-web example 對 captcha shape 期待更複雜 | 中 | F11 不驗 base-web e2e(per Q3 / Q4 拍板)、shape 用 DESIGN-A §4.2 「回固定碼 `000000`」直譯;若實際 base-web 期更複雜留 F11.1 follow-up |

---

## Out of Scope

- ❌ 不加 sys_menu seed row(per Q2)
- ❌ 不加新 sys_role(test / demo)+ user-role assignment(per Q1)
- ❌ 不寫 sys_operation_log audit(per Q3、stub 無 DB write)
- ❌ 不加 unit test(per Q3)
- ❌ 不加 input validation 比 serde 預設更嚴(per Q3)
- ❌ 不改 base-web SPA src / 不跑 SPA e2e(per Q4)
- ❌ 不改 nestjs fork source(三邊零改動標配)
- ❌ 不改 nginx config(stub 在 rust router 註冊、nginx 透明、per DESIGN-A §3.1)
- ❌ 不改 docker-compose / Dockerfile(對比 F10.1)
- ❌ 不接真 SMS provider / 不接 prod error tracking(per DESIGN-A §4.2、留 future feature)
- ❌ 不在 nginx 配 captcha rate limit(留 W-F11 或 future)

---

## Commit 模式

**兩段式**(per CLAUDE.md §6.1 + F5.1/F6/F10.1/F10.2 慣例):

- **Stage 1 — rust-api worktree commit**:9 file ~170-200 LOC、message `feat(rust-api): F11 補 4 條抽離項 stub endpoint + Casbin policy seed`
- **Stage 2 — outer commit on `020-extracted-stubs` feature branch**:specs/020-extracted-stubs/(spec docs)+ CLAUDE.md SOP marker + docs/INTEGRATION-CHECKLIST.md milestone + .specify/feature.json + rust-api SHA pin;**無 docker-compose.yml 改**(F11 不需動 deploy 配置);message `feat(spec): F11 extracted-stubs — 4 條抽離項 stub + Casbin policy seed`
- **Stage 3 — push 等 user 同意 + merge --no-ff + SHA fill follow-up**(per F10/F10.1/F10.2 pattern)

---

## Dependencies

### Inbound(F11 依賴)

- **F2** `audit-log-infrastructure`:audit 設計、F11 無 DB write 不觸 audit 但繼承 spirit。✅(F2.1 merge `209a2c8`)
- **F3** `soft-delete-infrastructure`:soft delete 設計、F11 無 DELETE 不觸但繼承 spirit。✅(merge `0f1c5c3`)
- **F4** `response-shape-alignment`:envelope shape、F11 acceptance 沿用。✅(commit `3d357e5`)
- **F5.1** `auth-login-and-dynamic-menu`:seed user(Soybean/Administrator/GeneralUser)+ `g` rule、F11 acceptance 需 login。✅(merge `e71aefe`)
- **F6** `route-guard`:Casbin migration seed pattern、F11 沿用。✅(merge `a431215`)
- **F10/F10.1/F10.2** `refresh-token-* + tokenstatus-string-align`:DESIGN-A §4.2 寫「F10 後可平行 F11」、F10.2 收尾後系統穩定。✅(merge `851ec79`)
- **W-FA1/W-FA2/W-FA3** `compose-nestjs-service + nginx-track-a-* + cicd-nestjs-build-job`:DESIGN-A 部署結構、F11 不動但需 stack 起。✅(全 merge)

### Outbound(F11 解鎖)

- **F13** `rust-refresh-token-impl`:DESIGN-B 階段 rust 自驗、F11 stub 補完讓 rust 端 API surface 完整
- **F14** `design-a-to-b-cutover`:F11 stub 在 DESIGN-B 階段升級或保留、邊界明確
- **base-web SPA 完整體驗**:demo role 在 login view 看到 captcha button works、`/function/request` view demo 跑通(未來 demo/test role 加時)

### 與 F11 並行可選

- **F9** `systemManage-alias-router`(含 batchDeleteUser stub、與 F11 同 DESIGN-A §4.2 抽離項清單但拆給 F9)
- **F7** `manage-crud-alignment`(Phase 3、依賴 F5、不直接依賴 F11)
- **F12** `cleanup-job`(Phase 4、F11/F12 可並行 per DESIGN-A §6.2)
- **W-F11** `observability`(Phase W deploy P2 剩餘、F11 不依賴)
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up、F11 不依賴)

---

## Assumptions

- **A-001**: F10.2 已 merge(application Phase 4 收尾、merge `851ec79`、refreshToken end-to-end pass 後 stack 穩定)。✅
- **A-002**: F6 Casbin policy seed pattern 仍 work(`m20260518_a_f6_is_route_exist_seed.rs` 落地 + INSERT 行為驗過)。✅
- **A-003**: F5.1 seed user + `g` rule 仍 in DB(Soybean=ROLE_SUPER/Administrator=ROLE_ADMIN/GeneralUser=ROLE_USER)。✅
- **A-004**: F4 envelope shape 不變(F11 acceptance 沿用 200 + 4xx envelope)。✅
- **A-005**: rust-api image rebuild ~2-3 min warm(對齊 F10.2 baseline)。
- **A-006**: nestjs fork 既有 `/auth/sendCaptcha` 等 endpoint **不**透過 nginx 路由到 rust;nginx W-F5 + W-FA2 設計 `/api/*` 默認走 rust、只 `/api/auth/refreshToken` 走 nestjs。✅
- **A-007**: base-web example branch 內既有 view(captcha button / demo button)hardcode 路徑、不依賴 menu API。
- **A-008**: F11 不需動 docker-compose.yml(W-FA1 既有 wire 涵蓋、rust-api 不加新 envvar/secret)。

---

## Open questions for /speckit-specify

(Brainstorm 階段 5 個 Q 已拍板、無未決問題。spec 階段預期 0 個 `/speckit-clarify` Q、與 F10.2 同性質。)
