# Implementation Plan: F4 — response-shape-alignment

**Branch**: `001-response-shape-alignment` | **Date**: 2026-05-14 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from [`spec.md`](./spec.md)

## Summary

F4 = rust-api admin endpoint 全表面 response shape 對齊 base-web 預期，三維度（A: HTTP 200 + body `code` 路線 II / B: JSON camelCase 序列化 / C: `AuthOutput` 補 `refreshToken` + `UserInfoOutput` 補 `buttons`）。技術手段：在既有 `Res<T>` envelope（已 4 欄位齊全）基礎上 (1) 把 success path 的 `code` 從 `StatusCode::OK.as_u16()` (=200) 改 `0` + base `.env` 同步 `VITE_SERVICE_SUCCESS_CODE=0`；(2) 新增 `server/core/src/web/code.rs` 集中 23 條 business code 常數、handler / middleware 引用常數取代 magic number；(3) rust 全表面 `#[serde(rename_all = "camelCase")]` 統一替換 per-field rename（保留 enum variant rename 不動）。

## Technical Context

**Language/Version**: Rust（rust-api 既定 toolchain，cargo workspace、edition 由各 crate 既定）
**Primary Dependencies**: serde + serde_json（既有）、axum（既有、IntoResponse trait）、sea-orm（既有、entity struct）、validator（既有、DTO validation）— **F4 不引入新 crate**
**Storage**: PostgreSQL（既有、F4 **不動 schema**）
**Testing**: cargo test（既有 unit + integration、F4 新增 acceptance test cases 覆蓋 11 scenarios）
**Target Platform**: docker container（per [`DESIGN-W`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)）
**Project Type**: web-service（rust-api 為 axum HTTP service、F4 改動範圍純 rust 側 + base `.env` 一個值）
**Performance Goals**: N/A（F4 是 contract spec、不規範 perf；既有 latency 保持不變）
**Constraints**: HTTP 永遠 200（FR-001）、JSON 全 camelCase（FR-010~014）、無 magic number（FR-018 + SC-006）、Casbin enforce 行為不變（Constitution Principle I）
**Scale/Scope**: 既有 50 處 `Res::` 引用、~10 個 admin handler crate、~20 個 output struct + ~15 個 input struct（具體數量由 `/speckit-tasks` audit phase 確認）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Phase 0 Pre-check（基於 spec.md 設計意圖）

| Principle | F4 影響 | 評估 | 註 |
|---|---|---|---|
| **I. RBAC Fail-safe** | F4 不動 Casbin enforcement；FR-021 規範 middleware error 走 envelope = 不破壞 enforce 流程 | ✅ Compliant | middleware deny 仍 enforce、只改 error response shape |
| **II. Soft Delete + 全域 Audit** | F4 不寫 DB、不發 audit log | ✅ N/A | response shape 改變不影響 audit 義務 |
| **III. 嚴版禁 Forward + 單一職責** | F4 不涉跨服務、純 rust 內部 | ✅ N/A | |
| **IV. base 不改動邊界** | base `src/`、`router/`、`store/`、`service*/api/` **不動**；只改 `base-web/.env` 內 `VITE_SERVICE_SUCCESS_CODE=0000 → 0`（per Principle IV 明示「可動：.env」） | ✅ Compliant | spec FR-019 明確且 .env 結構已確認（`base-web/.env` 為唯一含 SUCCESS_CODE 的檔） |
| **V. 漸進收縮** | F4 是 rust 側 standalone feature、不依賴 nestjs；DESIGN-A → DESIGN-B 過渡時 F4 結果 zero 改動（response shape 已標準化） | ✅ Compliant | |

### 架構約束（Architectural Constraints）

| 約束 | F4 影響 | 評估 |
|---|---|---|
| 部署形態（docker compose） | F4 不涉部署 | ✅ N/A |
| DB（PostgreSQL）| F4 不動 schema | ✅ N/A |
| 快取與 pub-sub（redis） | F4 不涉 | ✅ N/A |
| TLS | F4 不涉 | ✅ N/A |
| Secret 注入 | F4 不涉 | ✅ N/A |
| DB migration trigger | F4 不涉 | ✅ N/A |
| Port 規劃 | F4 不涉 | ✅ N/A |
| Observability | F4 影響：middleware error 經 envelope 後仍應 log（含 code + msg）— 由既有結構化 log 機制覆蓋、F4 不引入新 logger | ✅ Compliant |
| 結構化 log | 既有 JSON log 機制涵蓋、F4 不改 logger | ✅ Compliant |
| Backup / 背景工作 / CI/CD | F4 不涉 | ✅ N/A |

### 開發流程

| 流程 | F4 對齊 | 評估 |
|---|---|---|
| spec-kit 流程紀律 | 已執行 specify → clarify → plan；tasks/implement 接續 | ✅ Compliant |
| 兩段式 commit | F4 implementation 階段：rust-api worktree commit + push fork、outer 在 `001-response-shape-alignment` feature branch 更新 SHA pin（per CLAUDE.md §6.1 + Outer branch 模式） | ✅ Planned |
| Commit message 規範 | Conventional Commits 中文 subject + Co-Authored-By trailer | ✅ Planned |
| Push 確認紀律 | 所有 push 等 user 同意 | ✅ Planned |
| DESIGN 文件權威 | spec.md 已引用 [`DESIGN-A`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.1/4.1/6.1 | ✅ Compliant |

**Phase 0 Gate 結論**：✅ **All gates pass、無 violation、Complexity Tracking 表免填**。

### Phase 1 Post-check（基於 data-model.md / contracts/ 設計後）

設計層產物（data-model + contracts + quickstart）未引入新 violation：
- data-model.md 範圍純 response envelope + struct rename pattern，不涉 DB schema / RBAC / 跨服務
- contracts/ 範圍純既有 admin endpoint response shape 對齊，不引入新 endpoint
- quickstart.md 用既有 Soybean/123456 帳號（per CLAUDE.md §5.1）跑 acceptance test

✅ **Post-design Gate pass**。

## Project Structure

### Documentation (this feature)

```text
specs/001-response-shape-alignment/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出（feature spec）
├── research.md          # /speckit-plan Phase 0 產出（R1~R7 decisions）
├── data-model.md        # /speckit-plan Phase 1 產出（Res<T> 與 code namespace 細節）
├── quickstart.md        # /speckit-plan Phase 1 產出（驗證 F4 跑通流程）
├── contracts/
│   └── api-contracts.md # /speckit-plan Phase 1 產出（關鍵 endpoint response shape）
├── checklists/
│   └── requirements.md  # /speckit-specify 階段 quality checklist
└── tasks.md             # /speckit-tasks 產出（尚未建立）
```

### Source Code (repository root)

```text
fork260509-rev1/                          # 外層 monorepo (feature branch: 001-response-shape-alignment)
├── rust-api/                              # worktree (long-running branch: rev1-admin-rust-api)
│   └── server/
│       ├── core/src/
│       │   ├── sign/
│       │   │   └── api_key_middleware.rs  # MODIFY: 401/400 → 5003/5004 envelope code
│       │   └── web/
│       │       ├── res.rs                 # MODIFY: success path code 200 → 0、引用 CODE_SUCCESS const
│       │       ├── code.rs                # NEW: 23 條 business code 常數模組
│       │       ├── error.rs               # MODIFY: refactor 既有 error 用新 code 常數
│       │       ├── auth.rs                # MODIFY: 401 → 5001 (JWT) / 5003 (api_key) envelope code
│       │       └── mod.rs                 # MODIFY: pub mod code;
│       ├── model/src/admin/
│       │   ├── output/
│       │   │   ├── sys_authentication.rs  # MODIFY: AuthOutput + UserInfoOutput 改 rename_all + 補 buttons
│       │   │   ├── sys_menu.rs            # MODIFY: 移除 6 處 per-field rename for camelCase、加 struct-level
│       │   │   └── *.rs                   # AUDIT: 其他 output struct 補 rename_all
│       │   ├── input/
│       │   │   └── *.rs                   # AUDIT: input struct 補 rename_all（FR-010）
│       │   └── entities/
│       │       └── *.rs                   # AUDIT: 直接被 handler return 的 entity（FR-013）
│       └── api/                          # AUDIT: 既有 handler 是否裸 HTTP 401/403/500（違反 FR-001）
└── base-web/                              # worktree (long-running branch: rev1-admin-base-web)
    └── .env                              # MODIFY: VITE_SERVICE_SUCCESS_CODE=0000 → 0（FR-019）
```

**Structure Decision**：F4 是 cross-cutting refactor（rust 全表面 + base 一個 env value），無新增 crate / 無新增 service / 無新增資料夾。新增唯一檔案是 `rust-api/server/core/src/web/code.rs`（business code constants module，FR-018 規範）。其他改動全為 in-place modification（既有檔內加 rename_all、移除 per-field rename、替換 magic number 為常數引用）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

✅ **無 violation 需要 Complexity Tracking** — Phase 0 + Phase 1 Constitution Check 全 pass。

---

**Phase 0 / Phase 1 產物**：見同目錄 [`research.md`](./research.md)、[`data-model.md`](./data-model.md)、[`contracts/api-contracts.md`](./contracts/api-contracts.md)、[`quickstart.md`](./quickstart.md)。

**下一步**：執行 `/speckit-tasks` 產生 dependency-ordered tasks.md。
