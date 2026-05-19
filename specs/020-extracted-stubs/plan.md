# Implementation Plan: F11 — extracted-stubs

**Branch**: `020-extracted-stubs` | **Date**: 2026-05-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-extracted-stubs/spec.md`

## Summary

補 DESIGN-A §3.1 + §4.2 抽離項清單 **4 條 stub endpoint**(`POST /auth/sendCaptcha` 回固定碼 `000000` / `POST /auth/verifyCaptcha` 一律 success / `GET /auth/error` 反 echo / `GET /mock/getLastTime` 回 ISO timestamp)+ **1 個 Casbin policy seed migration**(`Soybean (ROLE_SUPER) + Administrator (ROLE_ADMIN) allow`、INSERT 8 row、`GeneralUser` default deny)。落地後 base-web demo button 可呼叫 stub endpoint 並由 Casbin enforce 控管(per Principle I);未來真實 SMS provider 接入或 demo/test role 加入時、只改 rust handler 或 Casbin policy、不破壞前端與 nginx。

**技術路徑**:`rust-api/server/api/src/admin/sys_authentication_api.rs` 加 3 個 stub handler(~50 LOC)+ 新建 `sys_mock_api.rs` / `sys_mock_route.rs`(~55 LOC)+ `sys_authentication_route.rs` 加 3 route mount + RouteInfo(~15 LOC)+ DTO 加在 `sys_authentication.rs`(既有 file、~20 LOC)+ `router_initialization.rs` 加 MockRouter import + register(~6 LOC、per analyze G2)+ Casbin migration `m20260519_a_f11_extracted_stubs_seed.rs`(~50 LOC)+ mod.rs register(~5 LOC)= ~201 LOC、10 file、0 docker-compose 改、0 nginx 改、0 base-web 改、0 nestjs fork 改。Application Phase 4 收尾後**第一個** post-Phase-4 feature(F10/F10.1/F10.2 三件套全完成後接續、F9/F12/F13 之前可並行)。

**Commit**:兩段式 — rust-api worktree 1 commit + outer 1 commit(spec docs + SHA pin、**無 docker-compose.yml 改**)+ merge `--no-ff` + SHA fill follow-up。

## Technical Context

**Language/Version**: Rust 1.86(rust-api 既有 toolchain、edition 2021、`cargo` build、對齊 F10.1 / F10.2 / W-F1 baseline)
**Primary Dependencies**:
- `axum` + `tokio`(既有、HTTP framework、F11 加 4 個 handler)
- `serde` + `serde_json`(既有、JSON envelope + DTO Deserialize)
- `chrono`(既有、`Utc::now().to_rfc3339()` for `/mock/getLastTime`)
- `tracing`(既有、`tracing::info!` for sendCaptcha log)
- `sea-orm` + `sea-orm-migration`(既有、Casbin policy seed migration、F6 既有 pattern)

**Storage**: PostgreSQL `casbin_rule` 表(F6 已驗 schema、F11 INSERT 8 row `p` policy)、不改 schema、不加 sys_menu seed、不加新 sys_role

**Testing**:
- F11 **不加** rust unit test(per spec FR-014 + brainstorm Q3、stub 邏輯 stack-可見、curl 驗即可)
- Stack acceptance:`curl` + `psql` + `docker compose exec` + `docker compose logs` host-side bash(per FR-016、對齊 F10.1 / F10.2 acceptance pattern)

**Target Platform**: Linux container(rust-api docker image、W-F1 既有 multi-stage Dockerfile、`debian:bookworm-slim` runtime base)

**Project Type**: Web-service rust backend(rust-api crate workspace、F11 觸及 **3 crate**:`server-api`(改既有 + 新 file)、`server-router`(改既有 + 新 file)、`server-migration`(新 file)、加上 DTO 在 `server-model`)

**Performance Goals**:
- F11 acceptance ≤ 10s(per NFR-001、4 stub curl + 1 deny curl + 1 psql + 1 log grep、不含 stack 啟動 + rebuild)
- stub handler latency p99 ≤ 50ms(per NFR-006、無 DB write 純記憶體操作、不主動 benchmark)

**Constraints**:
- 不動 base-web src(per FR-007、Constitution Principle IV)
- 不動 nestjs fork(per FR-008、W-FA*/F10/F10.1/F10.2 三邊零改動延伸)
- 不動 docker-compose.yml(per FR-009、對比 F10.1)
- 不動 nginx config(per FR-010、stub 在 rust router 註冊、nginx 透明)
- 不加 sys_menu seed(per FR-019、Casbin enforce 一層防線)
- 不加新 sys_role(per FR-020、用既有 ROLE_SUPER / ROLE_ADMIN / ROLE_USER 3 role)
- rust image rebuild ≤ 5 min warm(per NFR-005)

**Scale/Scope**:
- Dev only feature(F11 為 stub-only、prod 部署留 W-F6b + 後續)
- Multi-tenant(F5.1 既有 3 seed user × 3 role、F11 Casbin policy 對 ROLE_SUPER / ROLE_ADMIN allow)
- Scope:**10 file** rust patch、~170-205 LOC、0 docker-compose / 0 nestjs / 0 base-web / 0 schema 改動

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — RBAC Fail-safe(Casbin 後端強制)

| 項目 | 評估 |
|---|---|
| F11 是否影響 Casbin enforce 路徑 | **YES**(F11 4 條 stub endpoint 全過 Casbin enforce middleware、F6 既有 wire);F11 加 INSERT 8 row(2 role × 4 endpoint)Casbin allow policy、預期 ROLE_USER default deny |
| 是否引入新 protected endpoint | **YES**(4 條 stub endpoint:sendCaptcha / verifyCaptcha / auth/error / mock/getLastTime) |
| 前端 access check | N/A — F11 不動 base-web src、base-web hardcode 路徑呼叫 stub endpoint、後端 Casbin enforce 為單一權威 |
| US2 deny 路徑驗證 | ✅ FR-006 + US2 + SC-004 明訂 GeneralUser 收 HTTP 403(per Principle I + Q1 拍板) |
| **判定** | **PASS** — Casbin enforce + GeneralUser deny 必驗 |

### Principle II — Soft Delete + 全域 Audit Log(NON-NEGOTIABLE)

| 項目 | 評估 |
|---|---|
| F11 是否改寫入 sys_tokens / sys_user / 任何業務表 | **NO**(4 條 stub 全 stateless、無 DB write) |
| Migration `m20260519_a_f11_extracted_stubs_seed.rs` INSERT casbin_rule 是否需 audit | **NO** — migration `datas/*` seeding 屬「application runtime write」範疇外(per F2.1 brainstorm Q10 + constitution Principle II 註解);migration 走 git tracked migration 檔留紀錄 |
| 是否引入 hard delete | N/A — F11 不刪資料 |
| `sys_operation_log` 寫入 | N/A — F11 stub 不觸 audit、login flow audit 已 F5.1 處理 |
| **判定** | **N/A**(F11 無 DB write、不觸 audit 紀律) |

### Principle III — 嚴版禁 Forward + 單一職責

| 項目 | 評估 |
|---|---|
| F11 是否引入 HTTP/RPC 跨服務 forward | **NO** — rust handler 直接回 response、無 forward 到 nestjs |
| 跨服務狀態同步路徑 | N/A — F11 不涉跨服務狀態 |
| nginx config endpoint ownership | ✅ F11 4 條 stub 不在 `TRANSITIONAL` block、預設走 rust;nginx W-F5 + W-FA2 既有設計除 `/api/auth/refreshToken` 走 nestjs、其餘 `/api/*` 都 rust |
| 單一職責 | ✅ stub handler 一條 path 一個 handler、無 cross-router 邏輯 |
| **判定** | **PASS** |

### Principle IV — base 不改動邊界

| 項目 | 評估 |
|---|---|
| 是否改 base-web src | **NO**(per FR-007、SC-007 + git diff verify) |
| 是否改 base-web .env | NO |
| 是否改 nestjs fork source | **NO**(per FR-008、SC-008、brainstorm + W-FA*/F10/F10.1/F10.2 三邊零改動延伸) |
| API/payload shape 是否動 | NO — stub endpoint 是**新增**、不改既有 endpoint;F11 不動 `/auth/login` / `/auth/refreshToken` 等既有路徑 |
| **判定** | **PASS**(strict zero-base-change + strict zero-nestjs-source-change) |

### Principle V — 漸進收縮(DESIGN-A 過渡 → DESIGN-B 終局)

| 項目 | 評估 |
|---|---|
| nestjs source 是否擴張 | **NO**(per FR-008、F11 不動 nestjs source) |
| F11 在「nestjs 拔掉時順嗎」濾鏡下 | **PASS** — F11 4 條 stub 在 rust 內、DESIGN-B 時 rust 仍主導、無 nestjs-specific 依賴;stub 行為(回固定碼 / 反 echo / ISO timestamp)為通用 demo vocabulary、無破壞 |
| DB schema 改動 | NO(per FR-007 spec OOS-002 + 本 plan 不改 schema) |
| Casbin policy schema | F11 寫 8 row `p` policy + `allow`、policy schema(`ptype/v0/v1/v2/v3/v4`)既有不變、F11 沿用 F6 既有 row pattern |
| 抽離項升級路徑 | ✅ DESIGN-A §4.2 升級路徑明確:sendCaptcha 接真 SMS provider 時改 rust handler + Casbin policy 擴開放對象、不改 nginx / 前端 / DB schema(per Principle V 抽離項升級紀律) |
| **判定** | **PASS**(F11 為 DESIGN-A 過渡期內 stub 補位、為 DESIGN-B 鋪路無破壞、符合 Principle V 漸進收縮意圖) |

### 架構約束(Architectural Constraints)

| 約束 | 評估 |
|---|---|
| 部署形態(docker + docker-compose) | ✅ F11 不動部署形態、不改 docker-compose.yml |
| 資料庫(PostgreSQL 為唯一持久狀態) | ✅ F11 不動 schema、只 INSERT 8 row casbin_rule |
| 快取與 pub-sub(redis) | N/A(F11 不觸 redis) |
| TLS | N/A(F11 不動 TLS 配置、W-F6 dev 自簽 / prod acme 留 W-F6b) |
| Secret 注入(Docker secrets + `_FILE` pattern) | N/A(F11 不動 secret wiring、無新 envvar / secret) |
| DB migration trigger | ✅ F11 1 個新 migration(`m20260519_a_f11_extracted_stubs_seed.rs`)、走 W-FA1 既有 migration init container 機制、自動 rerun |
| Port 規劃 | N/A |
| Observability(promtail / Loki / prometheus) | N/A(F11 不改 log structure、tracing log 沿用既有 stdout) |
| 結構化 log(JSON 統一) | ✅ rust 既有 tracing 結構化 log 不動、F11 sendCaptcha 加 1 個 `tracing::info!` 行(per FR-001) |
| Backup | N/A |
| 背景工作(cleanup-job 等) | N/A |
| CI/CD platform | N/A(F11 不改 CI config) |

### 開發流程

| 紀律 | 評估 |
|---|---|
| spec-kit 流程完整跑 | ✅ /speckit-specify ✓ → /speckit-clarify ✓(0 question、brainstorm saturated)→ /speckit-plan(本檔)→ /speckit-tasks(下一步) |
| Constitution Check 失敗處理 | ✅ 全 PASS / N/A、無需 Complexity Tracking |
| 兩段式 commit 紀律 | ✅ FR-012 明訂、per CLAUDE.md §6.1 |
| Commit message conventional + 中文 subject | ✅ 沿用 F10.1 / F10.2 / F5.1 / F6 既有 pattern |
| Push 確認紀律 | ✅ 沿用全域 ~/.claude/CLAUDE.md §5 |
| TLS 紀律 | N/A |
| DESIGN 文件權威 | ✅ DESIGN-A §3.1 + §4.2 為 source、F11 spec ref |
| 抽離項升級紀律 | ✅ F11 為**抽離項本體** + DESIGN-A §4.2 升級路徑明確 |

### Constitution Check 結果

**全 17 項 PASS / 13 項 N/A / 0 violation**。**無 Complexity Tracking 需求**。可進 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/020-extracted-stubs/
├── plan.md                          # This file (/speckit-plan command output)
├── spec.md                          # /speckit-specify output (含 5 個 brainstorm Q&A)
├── research.md                      # Phase 0 output (本次 /speckit-plan 產出)
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── verification-commands.md     # Phase 1 output (7 個 C-V)
├── checklists/
│   └── requirements.md              # /speckit-specify output (PASS w/ 2 PARTIAL note)
└── tasks.md                         # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Worktree changes (rust-api、10 file、~170-205 LOC):
rust-api/server/api/src/admin/
├── sys_authentication_api.rs         # [改] +3 handler:send_captcha / verify_captcha / auth_error
│                                     #   ~50 LOC
└── sys_mock_api.rs                   # [新建] SysMockApi struct + get_last_time handler ~30 LOC
rust-api/server/api/src/admin/mod.rs  # [改] pub mod sys_mock_api; ~1 LOC

rust-api/server/router/src/admin/
├── sys_authentication_route.rs       # [改] +3 route mount + RouteInfo ~15 LOC
└── sys_mock_route.rs                 # [新建] MockRouter::init_mock_router() ~25 LOC
rust-api/server/router/src/admin/mod.rs  # [改] pub mod sys_mock_route + register ~3 LOC

rust-api/server/model/src/admin/input/
└── sys_authentication.rs             # [改] +3 DTO:SendCaptchaInput / VerifyCaptchaInput / AuthErrorQuery ~20 LOC
                                      #   (對齊既有 LoginInput 同檔慣例、不新建 sys_stub_dto.rs)

rust-api/server/initialize/src/
└── router_initialization.rs          # [改] import MockRouter + merge_router! register 5-args
                                      #   (對齊既有 SysSandboxRouter 5-args pattern、~6 LOC)

rust-api/migration/src/datas/
├── m20260519_a_f11_extracted_stubs_seed.rs  # [新建] 8 row INSERT + down() DELETE ~50 LOC
└── mod.rs                            # [改] pub mod m20260519_*; + register ~2 LOC

# Outer changes (rev1-admin-root branch 020-extracted-stubs):
CLAUDE.md                             # [改、SPECKIT marker auto-update] 指 020 plan
docs/INTEGRATION-CHECKLIST.md         # [改] F11 milestone + Application Phase 4 後續 progress
.specify/feature.json                 # [/speckit-specify 已自動更新]

# 不動 (對比 F10.1):
docker-compose.yml                    # [不動] F11 不加新 envvar / secret ref
docker-compose.dev.yml                # [不動]
docker-compose.prod.yml               # [不動]
deploy/front-nginx/conf.d/            # [不動] stub 透過 rust router、nginx 透明
rust-api/server/config/               # [不動] 無新 JwtConfig / secret_loader 改
rust-api/server/core/                 # [不動] 無新 jwt.rs / RefreshClaims 改
rust-api/server/initialize/           # [不動] 無新 initialization 改
rust-api/server/resources/            # [不動] application.yaml / application-test.yaml 不動
fork260509-soybean-admin-nestjs/      # [不動] 三邊零改動
base-web/                             # [不動] 三邊零改動
```

**Structure Decision**:F11 為 application-feature(類 F10.1 / F10.2 / F6、scope 中等);**兩段式 commit 必要**(per CLAUDE.md §6.1、改 rust-api worktree):
- **worktree commit** 含 `rust-api/server/api/src/admin/{sys_authentication_api.rs, sys_mock_api.rs, mod.rs}` + `rust-api/server/router/src/admin/{sys_authentication_route.rs, sys_mock_route.rs, mod.rs}` + `rust-api/server/model/src/admin/input/sys_authentication.rs` + `rust-api/server/initialize/src/router_initialization.rs`(MockRouter register、per G2 grounding)+ `rust-api/migration/src/datas/{m20260519_a_f11_extracted_stubs_seed.rs, mod.rs}`(10 file)
- **outer commit** 含 spec docs(`specs/020-extracted-stubs/` 8 file)+ `CLAUDE.md` SPECKIT marker + `docs/INTEGRATION-CHECKLIST.md` milestone + `.specify/feature.json` + rust-api SHA pin bump

## Phase 0: Outline & Research

**Status**: ✅ 完成、見 [research.md](research.md)

**Research items**(4 個 finding、resolve 2 個 brainstorm derive concern + 2 個 implement-time check):

1. **R-Q1**:既有 rust `SysAuthenticationApi` 5 handler 的 file 結構是否容納 F11 3 個新 handler(`SysAuthenticationApi` 既存 / 新加方式 / 順序)?(R-2 file 過大緩解 evidence)
2. **R-Q2**:既有 rust router 結構對 `MockRouter` 新建的 mount 點(`sys_sandbox_route.rs` 模式 vs `sys_authentication_route.rs` 模式)?(Q5 結構決策驗證)
3. **R-Q3**:F6 既有 Casbin migration `m20260518_a_f6_is_route_exist_seed.rs` 內 INSERT row 的具體 syntax(sea-orm migration API、column reference、INSERT pattern)?(F11 沿用 pattern)
4. **R-Q4**:既有 rust `ApiResponse::ok` envelope 對 `serde_json::Value` body 的 wrap 邏輯(F4 envelope shape 是否會 wrap 還是直譯)?(stub response shape 對齊驗證)

## Phase 1: Design & Contracts

**Status**: ✅ 完成、見 [data-model.md](data-model.md) + [contracts/verification-commands.md](contracts/verification-commands.md) + [quickstart.md](quickstart.md)

### data-model.md 內容

- 4 個 stub handler 改動(`SysAuthenticationApi` 3 個 + `SysMockApi` 1 個)、code shape + envelope shape 完整
- 既有 `SysAuthenticationApi` impl 結構展開(F11 加 3 個 handler 位置 + 既有 5 個 handler 不動)
- `SysMockApi` 新建 struct + handler shape
- 3 個 DTO(`SendCaptchaInput` / `VerifyCaptchaInput` / `AuthErrorQuery`)
- Casbin migration code shape(`up()` INSERT 8 row、`down()` DELETE 對應 row)
- `casbin_rule` 表 row shape(`ptype='p' / v0=ROLE_SUPER|ROLE_ADMIN / v1=built-in / v2=endpoint / v3=METHOD / v4=allow`)
- entity 關係:F11 不改 entity、只用 `casbin_rule` 表 INSERT

### contracts/verification-commands.md 內容

7 個 C-V contract:

- **C-V1**:rust-api image rebuild OK(warm ≤ 5 min、cold ≤ 7 min、`docker build -t rust-api:rev1-admin-rust-api ./rust-api/`)
- **C-V2**:migration init container rerun + 8 row 落 casbin_rule(`psql ... SELECT COUNT(*) WHERE v2 IN (4 endpoint) AND v4='allow'` = 8)
- **C-V3**:Soybean 4 endpoint 全 HTTP 200 + 預期 response shape(sendCaptcha → `{code:"000000"}` / verifyCaptcha → `{verified:true|false}` / auth/error → `{code, msg}` / getLastTime → `{time:"<ISO>"}`)
- **C-V4**:GeneralUser 1 endpoint HTTP 403(F4 envelope 或 raw 403、Casbin enforce fail-safe)
- **C-V5**:tracing log 有 `phone` field(sendCaptcha)、`docker compose logs rust-api --tail=200 | grep "F11 stub: sendCaptcha"` ≥ 1 line
- **C-V6**:three-side scope verify(base-web 0 diff + nestjs 0 diff + rust-api 10 file ~170-205 LOC + 0 docker-compose diff、per analyze G2)
- **C-V7**:W-FA1 stack regression(6 service healthy + migration exited 0 + rust-api 剛 recreated)

### quickstart.md 內容

5 個 Step:
1. 確認 prerequisite(F10/F10.1/F10.2 已 merge、F6 Casbin migration pattern 在 DB、stack 已起、Soybean + GeneralUser seed user)
2. 改 rust source(10 file、per analyze G2)+ Casbin migration 新建
3. Rebuild rust-api image + 起 stack(force-recreate rust-api + 等 migration 收到 rerun)
4. 跑 C-V1~C-V7 acceptance
5. 紀錄 F11 完成里程碑 + Application Phase 4 後續 next-step

### Agent context update

- `CLAUDE.md` `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` marker 區間更新 plan 引用 path(從 019 改 020)

## Complexity Tracking

> Constitution Check 17 PASS / 13 N/A / 0 violation — 無需 Complexity Tracking 條目。

**設計選擇紀錄**(非違反、但有 trade-off 值得紀錄):

- **auth 3 條加既有 `sys_authentication_api.rs` vs 拆 `sys_stub_api.rs`**:選前者(per Q5 brainstorm)。拆出 file 更顯式但 file 數 +2(stub_api.rs + stub_route.rs)、未來 stub 多時再拆;選前者讓 file 數最小(9 vs 11)、auth 名前綴邏輯內聚。trade-off:`sys_authentication_api.rs` 從 ~150 LOC 變 ~200 LOC、仍合理。
- **`/mock/getLastTime` 1 條拆出 `sys_mock_api.rs` + `sys_mock_route.rs` vs 塞 sys_sandbox_api.rs**:選前者(per Q5)。sandbox 為 rust 獨有 API key sign demo、與 `/mock/getLastTime` polling demo 異質;選前者讓 mock 語意獨立、未來 mock-only stub 加時 file 結構清晰。trade-off:加 2 個 file(sys_mock_api.rs + sys_mock_route.rs)~55 LOC,而非塞既有 file ~10 LOC。
- **不加 sys_menu seed**(per Q2):scope 最小化。Alternative:加 menu seed + sys_role_menu 關聯 seed,但 scope 變 ~250+ LOC、跨 2-3 migration 檔、grep base-web menu API 路徑、複雜度上升。F11 範疇紀律高過雙重 gate 完整性、acceptance 用 Casbin enforce 一層防線足驗(per US2)。
- **Casbin policy 用既有 ROLE_SUPER + ROLE_ADMIN allow vs 加新 test/demo role**(per Q1):選前者。Alternative:加新 sys_role(test/demo)+ user-role assignment + 對應 Casbin policy,但 scope ~250-300 LOC、跨 sys_role + sys_user_role + casbin migration、複雜度提升。F11 用既有 role 對齊 DESIGN-A「admin」精神、未來 demo/test role 產生時 Casbin migration 拓展即可。
- **無 rust unit test**(per Q3):stub 邏輯 stack-可見、curl 驗即可、無 derive macro 等隱藏層。F10.1(stack-不可見 fallback、MUST)/ F10.2(derive 隱藏行為、SHOULD)/ F11(全 stack-可見、0 test)的紀律分層對齊複雜度差異。Alternative:加 unit test 對 4 handler / migration row 驗、但邊際效益低、scope ~250 LOC。
