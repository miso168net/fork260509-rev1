# Implementation Plan: F10.2 — rust-tokenstatus-string-align

**Branch**: `019-rust-tokenstatus-string-align` | **Date**: 2026-05-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/019-rust-tokenstatus-string-align/spec.md`

## Summary

修 F10/F10.1 acceptance surface 的 **R-7 friction**(`nestjs tokens.entity.ts:33` 對 rust 寫入 `status="ACTIVE"` throw `'Token has already been used.'`):rust `TokenStatus` enum strum serialize 從 `#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]` 改為 `#[strum(serialize_all = "snake_case")]` + 2 個 per-variant override(`Active` → `"unused"`、`Refreshed` → `"used"`、`Revoked` 走 snake_case default → `"revoked"`)。落地後 `AccessTokenEvent::handle()` 寫入 sys_tokens 的 `status` 字串為 `"unused"`、nestjs `refreshTokenCheck` 比對 `TokenStatus.UNUSED` PASS、refreshToken end-to-end pass(HTTP 200 + 新 token pair + sys_tokens 雙 row state transition)。

**技術路徑**:單一 file 改(`rust-api/server/constant/src/definition/consts.rs`)~5 LOC enum attribute + ~12 LOC unit test = ~18 LOC、0 docker-compose 改、0 nestjs / base-web / sys_tokens schema / migration 改動。Application Phase 4 **第三個也是最後一個** feature(F10 wire-up → F10.1 R-8 修 → F10.2 R-7 修 收尾)。

**Commit**:兩段式 — rust-api worktree 1 commit + outer 1 commit(spec docs + SHA pin、**無 docker-compose.yml 改**)+ merge `--no-ff` + SHA fill follow-up。

## Technical Context

**Language/Version**: Rust 1.86(rust-api 既有 toolchain、edition 2021、`cargo` build、對齊 F10.1 + W-F1 baseline)
**Primary Dependencies**:
- `strum` + `strum_macros = 0.x`(既有、`AsRefStr` + `Display` + `EnumString` derive macro + `serialize_all` + per-variant `serialize` override)
- `serde` + `serde_derive`(既有、序列化支援)
- `sea-orm`(既有、`Set(TokenStatus::Active.to_string())` callsite 用、F10.2 不動 callsite)

**Storage**: PostgreSQL `sys_tokens` 表(W-FA1 已驗對齊、F10.2 不改 schema、只改寫入 `status` column 字串值)

**Testing**:
- `cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs`(1 個 unit test、3 forward + 3 reverse assert、per FR-017)
- Stack acceptance:`curl` + `psql` + `docker compose exec` + `docker compose logs` host-side bash(per FR-011、對齊 F10.1 acceptance pattern)

**Target Platform**: Linux container(rust-api docker image、W-F1 既有 multi-stage Dockerfile、`debian:bookworm-slim` runtime base)

**Project Type**: Web-service rust backend(rust-api crate workspace、F10.2 觸及 **唯一 1 crate** `server-constant`、單一 file `consts.rs`、enum derive attribute 改)

**Performance Goals**:
- F10.2 acceptance ≤ 10s(per NFR-001、不含 stack 啟動 + rebuild)
- `TokenStatus::to_string()` latency:可忽略(derive macro 內聯展開、無 dynamic dispatch)

**Constraints**:
- 不動 nestjs source(per FR-006)
- 不動 base-web src(per FR-009、Constitution Principle IV)
- 不動 sys_tokens schema(per FR-007)
- 不加 DB backward compat migration(per FR-008、Q3 brainstorm 拍板)
- rust image rebuild ≤ 7 min(per NFR-005、依賴 cargo cache hit + BuildKit cache mount)

**Scale/Scope**:
- Dev only feature(F10/F10.1/F10.2 序列收尾、prod 部署留 W-F6b + 後續)
- Single tenant(Soybean user 為 acceptance、無 concurrent token 簽負載)
- Scope:**1 file** rust patch、~5 LOC enum 改 + ~12 LOC unit test = ~18 LOC、0 docker-compose / 0 nestjs / 0 base-web / 0 schema 改動

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — RBAC Fail-safe(Casbin 後端強制)

| 項目 | 評估 |
|---|---|
| F10.2 是否影響 Casbin enforce 路徑 | **N/A** — TokenStatus enum 字串值改、不涉 authorization decision、Casbin enforce 在 endpoint handler 層、F10.2 不改 endpoint handler |
| 是否引入新 protected endpoint | N/A — refreshToken endpoint 既有(nginx → nestjs)、F10.2 不動 |
| 前端 access check | N/A |
| **判定** | **N/A / PASS** |

### Principle II — Soft Delete + 全域 Audit Log(NON-NEGOTIABLE)

| 項目 | 評估 |
|---|---|
| F10.2 是否改寫入 `sys_tokens` | **YES**(status column 寫入字串值從 `"ACTIVE"` 變 `"unused"`) |
| 寫入是否在同一 transaction 寫 audit | **YES, by inheritance** — F10.2 不動 `AccessTokenEvent::handle()`(per F5.1)、event handler 內既有 audit 寫入紀律不動、enum to_string() 只改 return value、不改 transaction boundary |
| 是否引入 hard delete | N/A — F10.2 不刪資料 |
| `sys_operation_log` 寫入 | N/A — login flow audit 已 F5.1 處理、F10.2 不改 login flow audit、只改 enum 字串值 |
| **判定** | **PASS**(inheritance、F10.2 在既有 audit-wrapped write 內只改 enum serialize 字串值) |

### Principle III — 嚴版禁 Forward + 單一職責

| 項目 | 評估 |
|---|---|
| F10.2 是否引入 HTTP/RPC 跨服務 forward | **NO** — rust enum 字串值改為 single-process action、無 forward |
| 跨服務狀態同步路徑 | postgres `sys_tokens` 表(W-FA1 + F10.1 已驗、F10.2 改寫入字串值、共用基礎設施)— 符合 Principle III 允許路徑 |
| nginx config endpoint ownership | N/A — F10.2 不動 nginx config |
| **判定** | **PASS** |

### Principle IV — base 不改動邊界

| 項目 | 評估 |
|---|---|
| 是否改 base-web src | **NO**(per FR-009、SC-008 + git diff verify) |
| 是否改 base-web .env | NO |
| 是否改 nestjs fork source | **NO**(per FR-006、SC-007、brainstorm + F10/F10.1 Q 延伸) |
| API/payload shape 是否動 | NO — `/api/auth/login` response envelope 不變(refresh_token 仍為 JWT 字串、F10.1 沿用)、`/api/auth/refreshToken` request 不變(client 仍送 refresh_token string)、`sys_tokens.status` column 字串值改但 schema 不變 |
| **判定** | **PASS**(strict zero-base-change + strict zero-nestjs-source-change) |

### Principle V — 漸進收縮(DESIGN-A 過渡 → DESIGN-B 終局)

| 項目 | 評估 |
|---|---|
| nestjs source 是否擴張 | **NO**(per FR-006、F10.2 不動 nestjs source) |
| F10.2 在「nestjs 拔掉時順嗎」濾鏡下 | **PASS** — F10.2 改 rust enum 字串值對齊 nestjs 業務語意;DESIGN-B 時 rust 自管 status enum 紀律、lowercase 字串值仍合理(`"unused"`/`"used"`/`"revoked"` 為通用 token state vocabulary、無 nestjs-specific bias)、無破壞性 |
| DB schema 改動 | NO(per FR-007) |
| TokenStatus schema | enum variant 不增不減(維持 Active/Refreshed/Revoked)、只改 serialize 字串值;DESIGN-B 時保留 |
| Casbin / sys_tokens schema | 不改 |
| **判定** | **PASS**(F10.2 是 DESIGN-A 過渡期內 enum 字串值對齊、為 DESIGN-B 鋪路無破壞、符合 Principle V 漸進收縮意圖) |

### 架構約束(Architectural Constraints)

| 約束 | 評估 |
|---|---|
| 部署形態(docker + docker-compose) | ✅ F10.2 不動部署形態、不改 docker-compose.yml |
| 資料庫(PostgreSQL 為唯一持久狀態) | ✅ F10.2 不動 schema、只改寫入 status column 字串值 |
| 快取與 pub-sub(redis) | N/A |
| TLS | N/A(F10.2 不動 TLS 配置) |
| Secret 注入(Docker secrets + `_FILE` pattern) | N/A(F10.2 不動 secret wiring、F10.1 既有設計沿用) |
| DB migration trigger | N/A(F10.2 無 schema change、無 migration、per FR-008 Q3 拍板) |
| Port 規劃 | N/A |
| Observability(promtail / Loki / prometheus) | N/A(F10.2 不改 log structure) |
| 結構化 log(JSON 統一) | ✅ rust 既有 tracing 結構化 log 不動 |
| Backup | N/A |
| 背景工作(cleanup-job 等) | N/A |
| CI/CD platform | N/A(F10.2 不改 CI config) |

### 開發流程

| 紀律 | 評估 |
|---|---|
| spec-kit 流程完整跑 | ✅ /speckit-specify ✓ → /speckit-clarify ✓(無 question)→ /speckit-plan(本檔)→ /speckit-tasks(下一步) |
| Constitution Check 失敗處理 | ✅ 全 PASS / N/A、無需 Complexity Tracking |
| 兩段式 commit 紀律 | ✅ FR-010 明訂、per CLAUDE.md §6.1 |
| Commit message conventional + 中文 subject | ✅ 沿用 F10.1 / F5.1 / F6 既有 pattern |
| Push 確認紀律 | ✅ 沿用全域 ~/.claude/CLAUDE.md §5 |
| TLS 紀律 | N/A |
| DESIGN 文件權威 | ✅ DESIGN-A §3.2 + §6 為 source、F10.2 spec ref |
| 抽離項升級紀律 | N/A(F10.2 不涉抽離項) |

### Constitution Check 結果

**全 17 項 PASS / 13 項 N/A / 0 violation**。**無 Complexity Tracking 需求**。可進 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/019-rust-tokenstatus-string-align/
├── plan.md                          # This file (/speckit-plan command output)
├── spec.md                          # /speckit-specify output (含 4 個 brainstorm Q&A)
├── research.md                      # Phase 0 output (本次 /speckit-plan 產出)
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── verification-commands.md     # Phase 1 output (6 個 C-V + 1 個 unit test)
├── checklists/
│   └── requirements.md              # /speckit-specify output (16/16 PASS)
└── tasks.md                         # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Worktree changes (rust-api):
rust-api/server/constant/src/definition/
└── consts.rs                          # [改] ~5 LOC enum + ~12 LOC unit test = ~18 LOC
                                       # - serialize_all: SCREAMING_SNAKE_CASE → snake_case
                                       # - Active +#[strum(serialize = "unused")]
                                       # - Refreshed +#[strum(serialize = "used")]
                                       # - Revoked 不動 (走 snake_case default → "revoked")
                                       # - 加 #[cfg(test)] mod tests with 1 fn 3 forward + 3 reverse assert

# Outer changes (rev1-admin-root branch 019-rust-tokenstatus-string-align):
CLAUDE.md                              # [改、SPECKIT marker auto-update] 指 019 plan
docs/INTEGRATION-CHECKLIST.md          # [改] F10.2 milestone + Application Phase 4 Roadmap update + Phase 4 收尾紀錄
.specify/feature.json                  # [/speckit-specify 已自動更新]

# 不動 (對比 F10.1):
docker-compose.yml                     # [不動] F10.2 不加新 envvar / secret ref
rust-api/server/config/                # [不動] 不動 JwtConfig / secret_loader
rust-api/server/core/                  # [不動] 不動 jwt.rs / RefreshClaims (F10.1 已落)
rust-api/server/global/                # [不動] 不動 KEYS / REFRESH_KEYS
rust-api/server/initialize/            # [不動] 不動 jwt_initialization
rust-api/server/service/               # [不動] 不動 sys_auth_service.rs / access_token_event.rs (callsite zero diff)
rust-api/server/resources/             # [不動] 不動 application.yaml / application-test.yaml
```

**Structure Decision**:F10.2 為 application-feature(類 F10.1 但 scope 更小、僅 1 個 enum attribute 改);**兩段式 commit 必要**(per CLAUDE.md §6.1、改 rust-api worktree):
- **worktree commit** 僅含 `rust-api/server/constant/src/definition/consts.rs`(1 file)
- **outer commit** 含 spec docs(`specs/019-rust-tokenstatus-string-align/` 8 file)+ `CLAUDE.md` SPECKIT marker + `docs/INTEGRATION-CHECKLIST.md` milestone + `.specify/feature.json` + rust-api SHA pin bump

## Phase 0: Outline & Research

**Status**: ✅ 完成、見 [research.md](research.md)

**Research items**(5 個 finding、resolve 3 個 brainstorm derive concern + 2 個 implement-time check):

1. **R-Q1**:strum `#[strum(serialize = "...")]` per-variant override 是否真覆蓋 `serialize_all` 行為?(R-1 緩解 evidence)
2. **R-Q2**:`TokenStatus::Active.to_string()` 實際 expand 來自 `Display` derive 還是 `AsRefStr` derive?(影響 unit test assert 路徑)
3. **R-Q3**:rust workspace 是否有 SCREAMING-quoted SQL hard-code literal(`'ACTIVE'` / `'REFRESHED'` / `'REVOKED'`)?(R-2 / FR-019 緩解 pre-check)
4. **R-Q4**:rust workspace 是否有 `TokenStatus::from_str` callsite(production code)?(R-3 緩解 pre-check)
5. **R-Q5**:strum derive macro EnumString 反向 parse 是否同時對齊 per-variant override(`from_str("unused") → Active`)?(unit test reverse assert 對齊 strum 語義)

## Phase 1: Design & Contracts

**Status**: ✅ 完成、見 [data-model.md](data-model.md) + [contracts/verification-commands.md](contracts/verification-commands.md) + [quickstart.md](quickstart.md)

### data-model.md 內容

- `TokenStatus` enum 改動(serialize_all attribute + 2 per-variant override、3 variant 不增不減)
- strum derive 行為(`AsRefStr` / `Display` / `EnumString` 三者與 per-variant override 互動)
- `sys_tokens.status` column 寫入 字串值差異(`"ACTIVE"` → `"unused"` / `"REFRESHED"` → `"used"` / `"REVOKED"` → `"revoked"`、其他 column 不變)
- entity 關係:`AccessTokenEvent::handle` → `TokenStatus::Active.to_string()` → `Set(...)` → sea-orm INSERT(callsite 不變、行為自動跟著 serialize 字串值)

### contracts/verification-commands.md 內容

6 個 C-V + 1 個 unit test contract:

- **C-V1**:`cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs` PASS(3 forward + 3 reverse、~30s)
- **C-V2**:rust login HTTP envelope + refresh_token JWT format(F10.1 regression)
- **C-V3**:`/api/auth/refreshToken` HTTP **200** + 新 token pair(R-7 修)
- **C-V4**:nestjs log grep `'Token has already been used'|JsonWebTokenError|jwt malformed` = 0 line(R-7 + R-8 全清)
- **C-V5**:psql `sys_tokens` 最新 2 row、最新 `status='unused'` + 次新 `status='used'`(state transition 對齊)
- **C-V6**:nestjs PID 1 env `REFRESH_TOKEN_SECRET=<value>` == `JWT_SECRET=<value>`(F10.1 fallback chain regression)
- **C-V7**:zero diff(base-web + nestjs fork)+ rust-api 1 file change(`consts.rs`)+ two-stage commit verify

### quickstart.md 內容

5 個 Step:
1. 確認 prerequisite(F10/F10.1 已 merge、stack 已起、Soybean credentials、舊 ACTIVE row 不阻塞 acceptance per R-6)
2. Build rust-api image with F10.2 patches(`docker build -t rust-api:rev1-admin-rust-api ./rust-api/`)
3. 起 W-FA1 stack(`docker compose -f -f --profile track-a up -d --wait --force-recreate rust-api`)
4. 跑 C-V1~C-V7 acceptance
5. 紀錄 R-7 修結果 + F10.2 完成里程碑 + 故障排查段

### Agent context update

- `CLAUDE.md` `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` marker 區間更新 plan 引用 path(從 018 改 019)

## Complexity Tracking

> Constitution Check 17 PASS / 13 N/A / 0 violation — 無需 Complexity Tracking 條目。

**設計選擇紀錄**(非違反、但有 trade-off 值得紀錄):

- **strum `serialize_all = "snake_case"` + 2 per-variant override vs 3 全 per-variant override**:選前者(per Q2 brainstorm)。3 全 override 更顯式但 Revoked 變 redundant(`#[strum(serialize = "revoked")]` 等於 snake_case default);選擇前者讓 enum 更簡潔、3 行 vs 4 行差異微小但語意更乾淨(「Revoked 走 default」明示對齊 enum convention)。
- **rust unit test 加在 consts.rs `#[cfg(test)] mod tests` vs 獨立 `server-constant/tests/`**:選前者(per Q4 brainstorm 提示)。consts.rs 既有 mod 不存在 tests、F10.2 新加 mod;~12 LOC 小 module 不開新 file;避免 server-constant crate 結構過度擴張(F10.2 為單 file feature 強約束)。
- **不加 DB backward compat migration**(per Q3):舊 ACTIVE row 自然過期。Alternative:加 SeaORM migration `m20260519_align_token_status.rs` UPDATE 舊 row,但會把 ~18 LOC 變 ~35 LOC + migration init container 需 rerun + scope 從單 file 變多 file。F10.2 範疇紀律高過 backward compat 完整性、acceptance 用新 login 不取舊 row(per R-6 緩解)。
- **不動 `access_token_event.rs:30` callsite**:`Set(TokenStatus::Active.to_string())` 在 F10.2 後自動寫 `"unused"`(strum derive macro 內聯展開、enum 字串值改變自動跟著);F10.2 不需動 callsite 也不需改其他 consumer。若有 SQL hard-code literal `'ACTIVE'`(non-enum path、FR-019 grep pre-check 確認無)則 risk surfaces;確認後 callsite 零改安全。
