# Implementation Plan: F10.1 — rust-jwt-refresh-token-signing

**Branch**: `018-rust-jwt-refresh-token-signing` | **Date**: 2026-05-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/018-rust-jwt-refresh-token-signing/spec.md`

## Summary

修 F10 acceptance surface 的 **R-8 friction**(`nestjs jwtService.verifyAsync` 對 rust Ulid throw `jwt malformed`):rust `AuthOutput.refresh_token` 從 `Ulid::new().to_string()` 改為 **HS256 JWT** with **極簡 `RefreshClaims` struct**(`sub`/`exp`/`iat`/`nbf`/`jti`/`iss` 6 field)。Secret 從 W-FA1 既有 `refresh_token_secret` Docker secret(per `APP_JWT_REFRESH_SECRET_FILE` _FILE pattern)載入;**empty file fallback 用 `jwt_secret` 同 value**(per clarify Q1、mirror nestjs entrypoint)。落地後 R-7 friction(rust `TokenStatus="ACTIVE"` vs nestjs `"unused"`)預期 surface、為 F10.2 修點。

**技術路徑**:5-6 file rust patch(jwt_config.rs +2 field / secret_loader.rs ~10 LOC extend / jwt.rs ~35 LOC(struct + global + method)/ sys_auth_service.rs 1 line / docker-compose.yml ~3 line / optional application.yaml ~2 line)+ 2 個 rust unit test(per clarify Q3 MUST、~30 LOC)= 總 ~85 LOC、預估 12-15 task。

**Commit**:兩段式 — rust-api worktree 1 commit + outer 1-2 commit(spec docs + docker-compose.yml + SHA pin)+ merge `--no-ff`。

## Technical Context

**Language/Version**: Rust 1.84+(rust-api 既有 toolchain、edition 2021、`cargo` build)
**Primary Dependencies**:
- `jsonwebtoken = 9.x`(既有、HS256 JWT 簽 + decode)
- `serde` + `serde_derive`(既有、`RefreshClaims` derive Serialize/Deserialize)
- `ulid`(既有、`jti` 用)
- `chrono`(既有、`exp`/`iat`/`nbf` timestamp)
- `tokio::sync::Mutex` + `OnceCell`(既有、`REFRESH_KEYS` global pattern)
- `config-rs`(既有、yaml + env override)

**Storage**: PostgreSQL `sys_tokens` 表(W-FA1 已驗對齊、F10.1 不改 schema、只改寫入 refresh_token column 內容)

**Testing**:
- `cargo test --workspace`(2 個 unit test、per FR-022):
  - `generate_refresh_token` 簽 + decode roundtrip
  - `secret_loader` empty-file fallback + non-empty 行為
- Stack acceptance:`curl` + `psql` + `docker compose exec` + `docker compose logs` host-side bash(per FR-016)

**Target Platform**: Linux container(rust-api docker image、W-F1 既有 multi-stage Dockerfile、`debian:bookworm-slim` runtime base)

**Project Type**: Web-service rust backend(rust-api crate workspace、`server/` + `config/` + `core/` + `service/` + ... 多 crate;F10.1 觸及 `config/` + `core/` + `service/` 3 個 crate)

**Performance Goals**:
- F10.1 acceptance ≤ 15s(per NFR-001、不含 stack 啟動 + rebuild)
- `generate_refresh_token` 簽 latency:可忽略(HS256 ~µs 級、同 access_token)

**Constraints**:
- 不動 nestjs source(per FR-006)
- 不動 base-web src(per FR-009、Constitution Principle IV)
- 不動 sys_tokens schema(per FR-008)
- rust image rebuild ≤ 6 min(per NFR-005、依賴 cargo cache hit + BuildKit cache mount)

**Scale/Scope**:
- Dev only feature(prod 啟用需先填 `refresh_token_secret.txt` non-empty)
- Single tenant(Soybean user 為 acceptance、無 concurrent token 簽負載)
- Scope:5-6 file rust patch、~55 LOC core + ~30 LOC unit test + ~5 LOC docker-compose = ~90 LOC 總

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — RBAC Fail-safe(Casbin 後端強制)

| 項目 | 評估 |
|---|---|
| F10.1 是否影響 Casbin enforce 路徑 | **N/A** — refresh_token 簽署 不涉 authorization decision、Casbin enforce 在 endpoint handler 層、F10.1 改 `generate_auth_output` 返回值而非 auth flow |
| 是否引入新 protected endpoint | N/A — refreshToken endpoint 既有(nginx → nestjs)、F10.1 不動 |
| 前端 access check | N/A |
| **判定** | **N/A / PASS** |

### Principle II — Soft Delete + 全域 Audit Log(NON-NEGOTIABLE)

| 項目 | 評估 |
|---|---|
| F10.1 是否改寫入 `sys_tokens` | **YES**(refresh_token column 內容從 Ulid 變 JWT) |
| 寫入是否在同一 transaction 寫 audit | **YES, by inheritance** — F10.1 不動 `AccessTokenEvent::handle()`(per F5.1)、event handler 內既有 audit 寫入紀律不動、`generate_auth_output` 只改 return value、不改 transaction boundary |
| 是否引入 hard delete | N/A — F10.1 不刪資料 |
| `sys_operation_log` 寫入 | N/A — login flow audit 已 F5.1 處理、F10.1 不改 login flow audit、只改 refresh_token field |
| **判定** | **PASS**(inheritance,F10.1 在既有 audit-wrapped write 內只改一 column 值) |

### Principle III — 嚴版禁 Forward + 單一職責

| 項目 | 評估 |
|---|---|
| F10.1 是否引入 HTTP/RPC 跨服務 forward | **NO** — rust 簽 JWT 為 single-process action、無 forward |
| 跨服務狀態同步路徑 | postgres `sys_tokens` 表(F10 wire-up 已驗)+ docker secret file(F10.1 新加 wire path、但仍是「共用基礎設施」)— 符合 Principle III 允許路徑 |
| nginx config endpoint ownership | N/A — F10.1 不動 nginx config |
| **判定** | **PASS** |

### Principle IV — base 不改動邊界

| 項目 | 評估 |
|---|---|
| 是否改 base-web src | **NO**(per FR-009、SC-009 + git diff verify) |
| 是否改 base-web .env | NO |
| 是否改 nestjs fork source | **NO**(per FR-006、SC-008、Q1 brainstorm + Q2 + Q5 拍板) |
| API/payload shape 是否動 | NO — `/api/auth/login` response envelope 不變(refresh_token 仍為 string、只值改 JWT)、`/api/auth/refreshToken` request 不變(client 仍送 refresh_token string) |
| **判定** | **PASS**(strict zero-base-change + strict zero-nestjs-source-change) |

### Principle V — 漸進收縮(DESIGN-A 過渡 → DESIGN-B 終局)

| 項目 | 評估 |
|---|---|
| nestjs source 是否擴張 | **NO**(per FR-006、F10.1 不動 nestjs source) |
| F10.1 在「nestjs 拔掉時順嗎」濾鏡下 | **PASS** — F10.1 讓 rust 簽 valid JWT、DESIGN-B 時 rust 自己 verify 同 JWT(F13 範疇)、F10.1 為此鋪路。rust 簽 JWT 在 DESIGN-A 與 DESIGN-B 都成立。 |
| DB schema 改動 | NO(per FR-008) |
| JWT secret schema | 加 `refresh_secret` field 為 schema 擴張、與 nestjs 共讀同一 docker secret;DESIGN-B 時保留 |
| Casbin / sys_tokens schema | 不改 |
| **判定** | **PASS**(F10.1 是 DESIGN-A 過渡期內為 DESIGN-B 鋪路的設計、符合 Principle V 漸進收縮意圖) |

### 架構約束(Architectural Constraints)

| 約束 | 評估 |
|---|---|
| 部署形態(docker + docker-compose) | ✅ F10.1 不動部署形態 |
| 資料庫(PostgreSQL 為唯一持久狀態) | ✅ F10.1 不動 schema |
| 快取與 pub-sub(redis) | N/A |
| TLS | N/A(F10.1 不動 TLS 配置) |
| Secret 注入(Docker secrets + `_FILE` pattern) | ✅ F10.1 `APP_JWT_REFRESH_SECRET_FILE` 完全對齊 Constitution + W-FA1 + F1.1 既有 _FILE pattern |
| DB migration trigger | N/A(F10.1 無 schema change) |
| Port 規劃 | N/A |
| Observability(promtail / Loki / prometheus) | N/A(F10.1 不改 log structure) |
| 結構化 log(JSON 統一) | ✅ rust 既有 tracing 結構化 log 不動、F10.1 新增 log 對齊既有 pattern |
| Backup | N/A |
| 背景工作(cleanup-job 等) | N/A |
| CI/CD platform | N/A(F10.1 不改 CI config) |

### 開發流程

| 紀律 | 評估 |
|---|---|
| spec-kit 流程完整跑 | ✅ /speckit-specify ✓ → /speckit-clarify ✓ → /speckit-plan(本檔)→ /speckit-tasks(下一步) |
| Constitution Check 失敗處理 | ✅ 全 PASS / N/A、無需 Complexity Tracking |
| 兩段式 commit 紀律 | ✅ FR-010 明訂、per CLAUDE.md §6.1 |
| Commit message conventional + 中文 subject | ✅ 沿用 F5.1/F6 既有 pattern |
| Push 確認紀律 | ✅ 沿用全域 ~/.claude/CLAUDE.md §5 |
| TLS 紀律 | N/A |
| DESIGN 文件權威 | ✅ DESIGN-A §3.2 + §6 為 source、F10.1 spec ref |
| 抽離項升級紀律 | N/A(F10.1 不涉抽離項) |

### Constitution Check 結果

**全 17 項 PASS / 11 項 N/A / 0 violation**。**無 Complexity Tracking 需求**。可進 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/018-rust-jwt-refresh-token-signing/
├── plan.md                          # This file (/speckit-plan command output)
├── spec.md                          # /speckit-specify output (含 3 個 clarify Q&A)
├── research.md                      # Phase 0 output (本次 /speckit-plan 產出)
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── verification-commands.md     # Phase 1 output (7 個 C-V + 2 個 unit test)
├── checklists/
│   └── requirements.md              # /speckit-specify output
└── tasks.md                         # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Worktree changes (rust-api):
rust-api/server/                          # rust workspace root
├── config/src/
│   ├── model/jwt_config.rs               # [改] +2 field: refresh_secret + refresh_expire
│   └── secret_loader.rs                  # [改] ~10 LOC: extend apply_jwt_secret_hardening
│                                         #         加 APP_JWT_REFRESH_SECRET_FILE + empty-file fallback
├── core/src/web/
│   └── jwt.rs                            # [改] ~35 LOC: RefreshClaims struct + REFRESH_KEYS global
│                                         #         + JwtUtils::generate_refresh_token method
│                                         #         + init_refresh_keys() bootstrap
└── service/src/admin/
    └── sys_auth_service.rs               # [改] 1 line @line 358: refresh_token 賦值改 generate_refresh_token

rust-api/server/resources/application.yaml    # [可能改] +2 line: jwt.refresh_secret + jwt.refresh_expire 預設
                                              # (per OQ-3 plan 階段決:看 secret_loader 是否需 yaml 預設)

# Outer changes (rev1-admin-root branch 018-rust-jwt-refresh-token-signing):
docker-compose.yml                            # [改] ~3 line: rust-api service 加
                                              #       APP_JWT_REFRESH_SECRET_FILE envvar
                                              #       + secrets ref refresh_token_secret

CLAUDE.md                                     # [改、SOP hook 處理] SPECKIT marker 已自動指本 plan
docs/INTEGRATION-CHECKLIST.md                 # [改] F10.1 milestone + Application Phase 4 Roadmap update
.specify/feature.json                         # [/speckit-specify 已自動更新]
```

**Structure Decision**:F10.1 為 application-feature(類 F5.1 / F6 但小、僅 1 個 endpoint 行為改 + secret wire);**兩段式 commit 必要**(per CLAUDE.md §6.1、改 rust-api worktree):
- **worktree commit** 含 rust-api/server/{config,core,service}/ 改動 + optional application.yaml(若 OQ-3 決定動)
- **outer commit** 含 docker-compose.yml + INTEGRATION-CHECKLIST.md + spec docs + .specify/feature.json + SHA pin bump

## Phase 0: Outline & Research

**Status**: ✅ 完成、見 [research.md](research.md)

**Research items**(8 個 finding、resolve 3 個 brainstorm OQ + 5 個 implement-time concern):

1. **R-Q1**:OQ-2 — `init_refresh_keys` 是否合併 `init_keys`?
2. **R-Q2**:OQ-3 — `application.yaml` 是否需動?
3. **R-Q3**:clarify Q1 deep-dive — secret_loader empty-file fallback 實作位置(`apply_jwt_secret_hardening` vs `load_secret_from_file_if_set` vs `JwtConfig::resolve_refresh_secret`)
4. **R-Q4**:rust `Keys` struct 實際定義(encoding key 是否與 decoding key 分開、是否需 second decoding key for refresh)
5. **R-Q5**:`Header::default()` HS256 確認(nestjs `@nestjs/jwt` HS256 預設對齊)
6. **R-Q6**:`Claims::new` constructor signature 確認(`RefreshClaims::new(user_id)` 仿照模式)
7. **R-Q7**:rust unit test 在哪個 crate / 檔案掛(jwt.rs `#[cfg(test)] mod tests` vs 獨立 tests/)
8. **R-Q8**:rust image rebuild 對 cargo cache 影響(F10.1 改 config/core/service 3 crate、cache invalidation 範圍)

## Phase 1: Design & Contracts

**Status**: ✅ 完成、見 [data-model.md](data-model.md) + [contracts/verification-commands.md](contracts/verification-commands.md) + [quickstart.md](quickstart.md)

### data-model.md 內容

- `RefreshClaims` struct(6 field、derive `Serialize, Deserialize, Debug, Clone`)
- `JwtConfig` 改動(+2 field、與既有 3 field 合 5 field)
- `Keys` 用法(既有 + 加 `REFRESH_KEYS` 同 pattern)
- `sys_tokens` row 寫入差異(`refresh_token` column 內容 from Ulid 26 char → JWT ~150 char、其他 column 不變)
- entity 關係:`JwtUtils::generate_refresh_token` → `RefreshClaims::new(user_id)` → encode via `REFRESH_KEYS`

### contracts/verification-commands.md 內容

7 個 C-V + 2 個 unit test contract:

- **C-V1**:`cargo test refresh_token` rust unit test PASS(2 個 unit test)
- **C-V2**:rust login HTTP envelope + refresh_token JWT format(R-8 修)
- **C-V3**:`/api/auth/refreshToken` HTTP 非 500 jwt malformed(R-8 修)+ HTTP 4xx with `'Token has already been used.'`(R-7 surface)
- **C-V4**:nestjs log grep — `'Token has already been used.'`(R-7)+ 無 `JsonWebTokenError`(R-8 修)
- **C-V5**:psql sys_tokens.refresh_token = JWT 字串、status = `"ACTIVE"`
- **C-V6**:secret 對齊驗(rust-api env + nestjs env + secret file)
- **C-V7**:zero diff(base-web + nestjs fork)+ rust-api 5-6 file change + two-stage commit verify

### quickstart.md 內容

5 個 Step:
1. 確認 prerequisite(F10 已 merge、stack 已起、Soybean credentials)
2. Build rust-api image with F10.1 patches(`docker compose build rust-api` or full build)
3. 起 W-FA1 stack(`docker compose -f -f --profile track-a up -d --wait`)
4. 跑 C-V1~C-V7 acceptance
5. 紀錄 R-7 friction 結果(如 surface 預期、F10.2 acceptance baseline)+ 故障排查段

### Agent context update

- `CLAUDE.md` `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` marker 區間更新 plan 引用 path

## Complexity Tracking

> Constitution Check 17 PASS / 11 N/A / 0 violation — 無需 Complexity Tracking 條目。

**設計選擇紀錄**(非違反、但有 trade-off 值得紀錄):

- **`REFRESH_KEYS` 新 global vs reuse `KEYS`**:選新 global(per Q1 brainstorm + Constitution Principle V「DESIGN-B 階段 refresh_secret 仍獨立」)。Reuse `KEYS` 雖少 1 個 global init,但破壞 secret 分離設計、不便於未來 RS256 升級 + key rotation;新 global 設計純度高、~5 LOC 多。
- **`RefreshClaims` 新 struct vs reuse `Claims`**:選新 struct(per clarify Q2 confirmed)。重用 Claims 雖少 1 個 struct,但破壞 minimum-payload security 紀律、refresh token 攜 role_codes 等不必要 authorization 資訊;新 struct 30 LOC 多但語意明確。
- **`secret_loader` empty-file fallback 位置**(per R-Q3):選在 `apply_jwt_secret_hardening` 內處理(per research.md R-Q3 結論)、不污染 `load_secret_from_file_if_set` generic helper;`load_secret_from_file_if_set` 保持「讀檔 → Some(content)」單純語義、empty fallback 由 caller(`apply_jwt_secret_hardening`)決定。
- **2 unit test vs 1**:選 2 個(per clarify Q3 MUST)。1 個雖少 ~15 LOC 但缺 Q1 critical path 覆蓋(secret_loader empty-file fallback、stack-level 不可見);2 個覆蓋完整。
