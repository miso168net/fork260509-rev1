# Implementation Plan: 047 sandbox-protect-route-fix

**Branch**: `047-sandbox-protect-route-fix` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/047-sandbox-protect-route-fix/spec.md`

## Summary

針對 sandbox endpoints (`/sandbox/{simple,complex}-api-key`) 的 `api_key_middleware`，將兩個 error 分支（missing 5003 / invalid 5004）的 response 從「HTTP 200 + body envelope」升級為「HTTP 401 + `WWW-Authenticate: ApiKey` header + body envelope 保留」，對齊 RFC 7235 / 9110 standard REST 語義。同步在 `api_key_middleware.rs::tests` 新增 8 個 unit test（Simple 4 + Complex 4、Q1 clarification 拍板雙覆蓋）涵蓋全行為（missing / invalid / valid / non-protected / invalid timestamp 等）。

技術 approach（per spec.md + brainstorm 7 section + Q1 clarify 雙覆蓋拍板）：

- **US1 production fix**：`api_key_middleware.rs::api_key_middleware` 函式 `match validate_request(...)` 兩 error 分支抽 helper `unauthorized_response(code, msg)`、用 `(StatusCode::UNAUTHORIZED, Json(Res::<()>::new_error(code, msg))).into_response()` tuple form 構造 + `WWW-Authenticate: ApiKey` response header。production fix 同時覆蓋 Simple validator 與 Complex validator 兩 path（同一 match block）。
- **US2 unit test**：同檔 `#[cfg(test)] mod tests` 加 8 個 `#[tokio::test]`，用 `tower::ServiceExt::oneshot` 驅 minimal `axum::Router` + dummy `get(|| async { "ok" })` handler、send mock `Request`，assert response status + headers + body envelope。Simple 4 tests 涵蓋 missing/invalid/valid/non-protected；Complex 4 tests 涵蓋 missing-field/invalid-signature/valid-signed/invalid-timestamp（valid case 用 `add_key_secret` + HMAC sig build per `test_api_key_sign` 既有 pattern）。
- **jwt + casbin envelope adapter 不動**（per spec.md FR-010 + A1 scope 拍板）：保留 F4 envelope flow design + base-web `onBackendFail` logout/refresh-token path；Constitution Principle IV「base 不改動邊界」預設原則保留、不觸發 W-WEBUI 受管例外 / amendment。

implementer-stage expansion budget ≤3（per 041 / 043 / 046 體例）；若 Phase 0 grep 發現同類鄰近 stale → user 確認後拾取、否則登 047+ follow-up。

## Technical Context

**Language/Version**: Rust 1.86（rust-api worktree、既有 toolchain）；無新 language
**Primary Dependencies**:
- 既有 crate：`axum` (Router / Json / middleware / IntoResponse / `http::{header, HeaderValue, StatusCode}`)、`tower` (`ServiceExt::oneshot` for tests)、`serde` / `serde_json` (body envelope)
- 新加：**0 workspace cargo dep**；若 `tower::ServiceExt` 路徑經 `axum` re-export 無法達、`server-core` dev-deps 加 `tower = { workspace = true, features = ["util"] }`（per-crate 改動、非 workspace 新 dep、不違 FR-006）
**Storage**:
- N/A — 純 middleware HTTP status / header 改 + unit test、不動 DB / redis / 任何 storage
**Testing**: 8 unit tests 跟 `cargo test` 一般執行流程跑（無 `#[ignore]`、無 dev stack 依賴、`< 2s` 總計）；real-wire acceptance 透過 dev stack + curl 雙端點 8 case
**Target Platform**: Linux x86_64 docker container（rust-api）；dev WSL2 + Docker Desktop
**Project Type**: spec-hygiene-adjacency security fix（rust-api middleware HTTP status + header 升級 + 同檔 unit test）；軌道**外** rust-api 純後端
**Performance Goals**:
- Unit test runtime: 8 tests 合計 `< 2 second`（無 DB / dev stack）
- Production HTTP 401 response overhead: 與 HTTP 200 envelope response 同 order（純 status code + header 設定、`Json::into_response` cost 不變）
- 不影響其他 middleware path performance
**Constraints**:
- 0 base-web 改動（FR-007）
- 0 schema migration、0 新 application entity、0 新 workspace cargo dep、0 新 redis channel、0 新 metric pre-declare、0 新 rust-api endpoint（FR-006）
- jwt + casbin envelope adapter 不改（FR-010）—— 保留 base-web `onBackendFail` flow
- implementer-stage expansion ≤3 處（FR-011）
**Scale/Scope**:
- 改動 ~12 line production diff + ~150-180 line unit test code（Q1 拍板 8 tests 較原 4 tests 翻倍、Complex valid case + HMAC setup 額外 ~80 line）
- ~2-3hr 落地（spec-kit 階段 ~1hr + executing-plans subagent + docker rebuild + acceptance ~1.5-2hr）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | 不動 Casbin / JWT；api_key middleware 為**獨立** credential check layer、非 RBAC permission scope；本 fix 純改 HTTP status / header semantic、不動 enforcement logic。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 不動 audit / soft delete pipeline；本 fix 不寫 sys_operation_log、不動任何 DB / outbox / drainer。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 純 1 middleware 函式內 HTTP status / header 改、無新 service / endpoint / channel / metric / service-to-service call。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-007 verify）；軌道**外**、預設原則涵蓋；**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment、**不**需更新 `DESIGN-W-WEBUI` 文件。同 039 / 041 / 042 / 043 / 044 / 045 / 046 模式。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；純 rust-api middleware 小修；強化 DESIGN-B 形態（補 security middleware standard REST 合規）；不引 nestjs / DESIGN-A 任何殘留。 | ✅ PASS |

**架構約束** 同步檢查：
- §結構化 log「rust / nestjs / nginx 統一 JSON 格式」→ 0 影響（middleware error response 走 Json body envelope、不寫 log）
- §Observability「promtail → Loki + prometheus + grafana 為**必要**stack」→ 0 影響（HTTP 401 對 grafana RustApi5xxRate alert 不算 5xx、不誤觸發；可選擇後續 047-N1 follow-up 加 401 監控、屬 044 observability scope）
- §背景工作「cleanup-job / outbox-worker / backup-job 為 prod 必要」→ 不動既有 3 background task

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/047-sandbox-protect-route-fix/
├── spec.md                # /speckit-specify 產出 + /speckit-clarify Q1 整合
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0：grep 確認 + tower::ServiceExt 可用性驗 + Complex valid sig build pattern 細節
├── data-model.md          # Phase 1：unauthorized_response helper signature + Response 構造 pattern + 8 unit test scenarios spec
├── contracts/
│   └── verification-commands.md   # Phase 1：C-V1~C-V5 acceptance commands
├── quickstart.md          # Phase 1：implementer 操作手冊（2 US 落地步驟 + commit shape）
├── checklists/
│   └── requirements.md    # /speckit-specify 產出（16/16 PASS）
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

### Source Code (repository root)

軌道**外** rust-api 純後端、0 base-web 改動：

```text
rust-api/                                                # worktree、單 commit
└── server/
    └── core/src/sign/
        └── api_key_middleware.rs                        # 唯一 production file 改動
                                                          # US1: api_key_middleware fn 兩 error 分支抽 helper +
                                                          #      unauthorized_response + WWW-Authenticate header
                                                          # US2: #[cfg(test)] mod tests 加 8 unit test
                                                          #      (Simple 4 + Complex 4)

outer/                                                   # rev1-admin-root、多段 commit per logical
├── docs/INTEGRATION-CHECKLIST.md                        # 移 045-N1 row + 加 047 entry + 下一步 update (FR-009)
└── CLAUDE.md                                            # SPECKIT marker 區指向 047 plan.md
```

**Structure Decision**：
- **rust-api worktree commits**：1 個（US1 + US2 一體：production fix + 8 unit test 同檔不可拆）
- **outer rev1-admin-root commits**：3-4 個（rust-api SHA pin / INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker / 可選 045 C-V5 update if expansion 拾 / SHA backfill post-merge）
- merge `--no-ff` 回 `rev1-admin-root`、user 同意後 push

### Commit shape (per CLAUDE.md §4.1)

**rust-api worktree commits（estimated 1 個）**：

| Topic | est | files |
|---|---|---|
| US1+US2 api_key middleware HTTP 401 + WWW-Authenticate header + 8 unit test (Simple 4 + Complex 4) | 1 commit | `server/core/src/sign/api_key_middleware.rs` |

**Outer rev1-admin-root commits（estimated 3-4 個）**：

| Topic | est | files |
|---|---|---|
| rust-api SHA pin bump | 1 commit | gitlink `rust-api` |
| INTEGRATION-CHECKLIST cleanup（045-N1 移除 + 047 entry） + CLAUDE.md SPECKIT marker | 1 commit | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` |
| 045 自家 C-V5 grep expectation 對齊（若 implementer-stage expansion 拾取、user 確認後）| 1 commit（optional） | `specs/045-facade-atomicity-pass/contracts/verification-commands.md` |
| SHA backfill（post-merge） | 1 commit | `docs/INTEGRATION-CHECKLIST.md` 047 entry placeholder |

**Push 須 user 同意**（per CLAUDE.md §5）；最終 merge `--no-ff` 回 default `rev1-admin-root`。

詳見 [`quickstart.md`](./quickstart.md)。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：grep 確認 `tower::ServiceExt::oneshot` 從 server-core dev-deps 路徑可達性（透過 `axum` re-export 或 server-core 自身 deps）；fallback decision「若不可、server-core dev-deps 加 `tower = { features = ["util"] }` per-crate change」
- **R-2**：4 case Simple unit test setup pattern（minimal `Router` + dummy handler + `protect_route(unique_path)` + Simple validator + mock `Request` + ServiceExt::oneshot send）
- **R-3**：4 case Complex unit test setup pattern（重點：valid signed case 需 build query string with HMAC sig per `test_api_key_sign` line 250 既有 pattern + `add_key_secret` + NonceStore mock 或 memory store）
- **R-4**：production fix code shape — `unauthorized_response` helper signature 抉擇（with `&str` vs owned `String` msg、是否回 `Response<Body>` vs `impl IntoResponse`）
- **R-5**：`is_protected_path` 對非 protect_route 路徑 short-circuit 行為驗（spec FR-004 要求）的 unit test 構造（path 不在 `PROTECTED_PATHS` set、middleware 直接 pass-through）
- **R-6**：implementer-stage expansion 候選 grep（per FR-011 ≤3）：
  - (a) 045 自家 `contracts/verification-commands.md` C-V5 grep expectation 對齊新 HTTP 401 + WWW-Auth 行為（user 確認後拾、屬 045-N1 結案延伸、~3-5 line edit）
  - (b) sandbox `complex-api-key` 端點是否同步驗 spec md（已含 Q1 clarification 8 acceptance、Phase 0 grep 確認後可能 0 額外 edit）
  - (c) `Res::IntoResponse` 是否該擴展接 optional `StatusCode`（後續其他 middleware 重用）—— scope creep 警告、Phase 0 grep 後**拒絕拾取** 機率高

## Phase 1 outcomes（reference）

- [`data-model.md`](./data-model.md)：`unauthorized_response` helper API + `(StatusCode, Json)` tuple construct pattern + `header::WWW_AUTHENTICATE` insert + 8 unit test scenario spec table（Simple 4 + Complex 4 with HMAC build pattern）
- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：C-V1~C-V5 acceptance commands（dev stack baseline + cargo test + 雙端點 8 case curl + boundary verify + INTEGRATION-CHECKLIST cleanup verify）
- [`quickstart.md`](./quickstart.md)：implementer 操作手冊（2 US 落地步驟 + 1 rust-api commit + 3-4 outer commits + merge 順序）
- CLAUDE.md SPECKIT marker 區更新（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）
- contracts/verification-commands.md 引入 5 個 C-V、全為 acceptance 驗證手段、不引入新 functional path
- quickstart.md 內 commit shape 明確多段式（符合 §4.1 worktree + outer 紀律）
- INTEGRATION-CHECKLIST cleanup（FR-009）為 plan 內已界定的後續、無爭議

**Constitution Check post-Phase 1：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`、預估 10-15 tasks（小規模 security fix、規模略小於 041 / 043 / 046；2 US 各自單 file 改動、Polish phase 4-5 tasks）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
