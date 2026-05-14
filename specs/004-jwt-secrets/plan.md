# Implementation Plan: F1.1 — jwt-secrets

**Branch**: `004-jwt-secrets` | **Date**: 2026-05-14 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from [`spec.md`](./spec.md)

## Summary

F1.1 = rev1 rust-api JWT secret config 的 **prod hardening + envvar 注入機制 + claim 對齊 doc** 基礎建設。技術手段：(1) `server-config::config_init` 內、`global::init_config::<JwtConfig>` 載入後執行 **strict validation**（empty / placeholder blacklist / length<32 三條 rule、panic on fail）；(2) 新增 `load_secret_from_file_if_set(base_envvar)` helper 提供 `APP_JWT_JWT_SECRET_FILE` 路徑讀取 + `.trim()` + read failure panic；(3) `_FILE` precedence > bare envvar；(4) `application.yaml` `jwt_secret` 改 placeholder value `"change-me-jwt-secret"`、`application.yaml.example` 新建 template、`application-test.yaml` 改 32-char dev secret；(5) `specs/004-jwt-secrets/contracts/claim-contract.md` 新建、列 Claims 11 fields 用途 + F1.2 / F10 future extensions reserved。Algorithm 升級（HS256 → RS256）+ key versioning（kid header）+ refresh token 預埋 全部留 F1.2 / F10 階段（與 F10 refresh-token-bridge 同期）。

## Technical Context

**Language/Version**: Rust（rust-api 既定 toolchain 1.86.0、cargo workspace、edition 各 crate 既定）
**Primary Dependencies**: `server-config`（既有、含 envy + serde_yaml/toml/json 載入 path）、`std::fs`（讀 `_FILE` content）— **F1.1 不引入新 crate**
**Storage**: N/A（F1.1 不涉 DB schema、不涉持久狀態；secret 值由 envvar / file 注入、不寫回 DB）
**Testing**: cargo test — F1.1 主走 unit test（pure Rust、`validate_jwt_secret` 各 rule + `load_secret_from_file_if_set` 各 path）+ 少數 integration test（boot panic via `std::panic::catch_unwind`）；無 real-postgres 依賴
**Target Platform**: docker container（per [`DESIGN-W`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)）；rev1 prod 為 Docker secrets + `_FILE` mount pattern（per Constitution §架構約束）
**Project Type**: web-service / config infrastructure（rust-api 為 axum HTTP service、F1.1 改動範圍純 rust 側 `server-config` crate + resources files + 1 spec doc、不動 base / nestjs / nginx）
**Performance Goals**: N/A（boot-time validation 一次性、無 runtime perf impact；既有 token 簽/驗 path 不動）
**Constraints**:
- jwt_secret 必通過 strict validation 才能 boot（Constitution §架構約束 + spec FR-001~004）
- `_FILE` precedence over bare envvar（spec FR-007、無 warn 設計簡化）
- panic on fail（per spec FR-001~009、與既有 codebase boot config error 偏好 panic 風格一致）
- panic message leak-free for real secret values（per spec edge case + FR-003）
- Claims struct 不動於 F1.1（per spec FR-014、backward compat 既有 token）
- algorithm / key versioning / refresh token 全留 F1.2 / F10（per spec FR-015~017）
**Scale/Scope**: 1 個 strict validation helper + 1 個 `_FILE` loader helper + ~2 行 integration 到既有 `init_from_file` flow + 3 個 resources files 修改 + 1 個 contract doc + ~5-8 個 unit test fn

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Phase 0 Pre-check（基於 spec.md 設計意圖）

| Principle | F1.1 影響 | 評估 | 註 |
|---|---|---|---|
| **I. RBAC Fail-safe** | F1.1 不動 Casbin enforcement / JWT 簽驗 runtime logic、只動 secret config 載入 path | ✅ N/A | 既有 RBAC layer 不受影響 |
| **II. Soft Delete + 全域 Audit** | F1.1 不涉 entity 寫入 / audit 路徑 | ✅ N/A | boot panic 不走 audit（panic→process exit） |
| **III. 嚴版禁 Forward + 單一職責** | F1.1 純 rust 內部（server-config crate + resources）、不涉跨服務 | ✅ N/A | |
| **IV. base 不改動邊界** | F1.1 不動 base-web 任何檔 | ✅ Compliant | |
| **V. 漸進收縮** | F1.1 是 rust 側單服務 config hardening；rev1 階段無 nestjs、F10 階段加 multi-service secret 共識（F1.2 才升級 algorithm）；nestjs 退場時 F1.1 config infra zero 改動 | ✅ Compliant | F1.1 為 future-proof prep but not premature impl |

### 架構約束（Architectural Constraints）

| 約束 | F1.1 影響 | 評估 |
|---|---|---|
| 部署形態（docker compose） | F1.1 deployment 與 docker compose env / secrets 機制對齊 | ✅ Compliant |
| DB（PostgreSQL） | F1.1 不涉 DB | ✅ N/A |
| 快取與 pub-sub（redis） | F1.1 不涉 | ✅ N/A |
| TLS | F1.1 不涉 | ✅ N/A |
| **Secret 注入：Docker secrets + `_FILE` pattern 為 prod 預設** | F1.1 **核心交付**：實作 `_FILE` precedence loader、prod jwt_secret 不入 process env | ✅ Direct compliance — F1.1 落實此約束 |
| DB migration trigger | F1.1 不涉 migration（不涉 schema 改動） | ✅ N/A |
| Port 規劃 | F1.1 不涉 | ✅ N/A |
| Observability | F1.1 boot panic 訊息走 stderr / process exit code（standard Rust panic 行為）；orchestrator (docker/k8s) 可由 exit code != 0 偵測 + restart loop | ✅ Compliant |
| 結構化 log | F1.1 不引入新 log；既有 `project_error!` / `project_info!` 已 JSON 格式（既有 codebase）| ✅ Compliant |
| Backup / 背景工作 / CI/CD | F1.1 不涉 | ✅ N/A |

### 開發流程

| 流程 | F1.1 對齊 | 評估 |
|---|---|---|
| spec-kit 流程紀律 | specify → clarify（無新增 — 5 個拍板已在 brainstorming 階段） → plan → tasks/implement 接續 | ✅ Compliant |
| 兩段式 commit | F1.1 implementation 階段：rust-api worktree commit + push fork、outer 在 `004-jwt-secrets` feature branch 更新 SHA pin（per CLAUDE.md §6.1） | ✅ Planned |
| Commit message 規範 | Conventional Commits 中文 subject + Co-Authored-By trailer | ✅ Planned |
| Push 確認紀律 | 所有 push 等 user 同意 | ✅ Planned |
| DESIGN 文件權威 | spec.md 已引用 DESIGN-A §3.3 / §6.1 F1 + Constitution §架構約束 | ✅ Compliant |

**Phase 0 Gate 結論**：✅ **All gates pass、無 violation、Complexity Tracking 表免填**。

### Phase 1 Post-check（基於 data-model.md / contracts/ 設計後）

設計層產物未引入新 violation：
- data-model.md 範圍純 Rust function + struct + module 新增（無 schema 改動、無 breaking change）
- contracts/claim-contract.md 純 doc reference（Claims 11 fields 用途說明、F1.2 / F10 future extensions reserved）
- quickstart.md 用本機 dev 環境 + `cargo run --bin server` + `export APP_JWT_JWT_SECRET=...` 多種 deployment 場景驗

✅ **Post-design Gate pass**。

## Project Structure

### Documentation (this feature)

```text
specs/004-jwt-secrets/
├── plan.md                  # 本檔
├── spec.md                  # /speckit-specify 產出（feature spec + brainstorm 5 clarifications）
├── research.md              # /speckit-plan Phase 0 產出（R1~R6 decisions）
├── data-model.md            # /speckit-plan Phase 1 產出（function / struct / module 詳細）
├── quickstart.md            # /speckit-plan Phase 1 產出（驗證 F1.1 跑通流程）
├── contracts/
│   └── claim-contract.md    # /speckit-plan Phase 1 產出（Claims 11 fields 用途 + future extensions）
├── checklists/
│   └── requirements.md      # /speckit-specify 階段 quality checklist
└── tasks.md                 # /speckit-tasks 產出（尚未建立）
```

### Source Code (repository root)

```text
fork260509-rev1/                                  # 外層 monorepo (feature branch: 004-jwt-secrets)
├── rust-api/                                     # worktree (long-running branch: rev1-admin-rust-api)
│   ├── server/config/
│   │   ├── src/
│   │   │   ├── config_init.rs                    # MODIFY (在 init_from_file 內 init_config::<JwtConfig> 之後加 _FILE override + validate_jwt_secret call)
│   │   │   ├── model/jwt_config.rs               # MODIFY (擴 doc comment 說明 _FILE precedence + validation rules)
│   │   │   ├── secret_loader.rs                  # NEW (PLACEHOLDER_SECRETS + load_secret_from_file_if_set + validate_jwt_secret 三項集中模組)
│   │   │   └── lib.rs                            # MODIFY (pub mod secret_loader;)
│   │   └── tests/
│   │       └── jwt_secret_validation.rs          # NEW (unit test、Pattern 1-3 per spec testing section)
│   ├── server/initialize/tests/
│   │   └── jwt_boot_integration.rs               # NEW (boot panic via std::panic::catch_unwind、SC-005 + SC-006 + SC-007)
│   └── server/resources/
│       ├── application.yaml                      # MODIFY (jwt_secret value → "change-me-jwt-secret")
│       ├── application-test.yaml                 # MODIFY (jwt_secret value → 32-char dev secret)
│       └── application.yaml.example              # NEW (deployment template、含 dev / prod / _FILE 範例 + openssl rand 指引)
```

**Structure Decision**：F1.1 動 1 個 crate（`server-config`、含 model/jwt_config.rs + config_init.rs + 新模組 secret_loader.rs + lib.rs pub mod）+ 1 個 test crate（server-config/tests/ + server-initialize/tests/）+ 3 個 resources files。新增 1 個 contract doc。**不**改 `server-core::web::jwt` / `web::auth::Claims` / `server-middleware::jwt`（per spec FR-014/015/018 範圍邊界）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

✅ **無 violation 需要 Complexity Tracking** — Phase 0 + Phase 1 Constitution Check 全 pass。

---

**Phase 0 / Phase 1 產物**：見同目錄 [`research.md`](./research.md)、[`data-model.md`](./data-model.md)、[`contracts/claim-contract.md`](./contracts/claim-contract.md)、[`quickstart.md`](./quickstart.md)。

**下一步**：執行 `/speckit-tasks` 產生 dependency-ordered tasks.md。
