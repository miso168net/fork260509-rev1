# Implementation Plan: 041 spec-hygiene-pass-1

**Branch**: `041-spec-hygiene-pass-1` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/041-spec-hygiene-pass-1/spec.md`

## Summary

R4（2026-05-24 regression 撞到 6 處 spec rot）+ F3-N5（F3 階段遺留 1 處）bundled = **7 處 spec md errata**（across `specs/021/022/030/039/040` `contracts/verification-commands.md` + `specs/002/data-model.md`）+ **1 處 rust-api code change**（`server/initialize/Cargo.toml` 加 `normalize-path` feature flag + `server/bin/src/main.rs` 用 `NormalizePathLayer::trim_trailing_slash()` wrap 整個 router compose、跨 admin/auth/authorization 全 router 一致涵蓋、per Clarifications 2026-05-24 Q1）。軌道**外**、rust-only + spec md（同 039 模式）。0 base-web 改動、0 schema migration、0 nestjs（已退場）。

技術 approach（per Phase 0 research）：
- spec md：6 處 string replace + 1 處 augment（039 C-V31 加完整 curl block，因該 row 為 summary-only 缺 payload 例）+ 各加 1 行 errata。
- rust-api：`tower-http` 已是 workspace dep（0.6）；當前只開 `trace` feature、加 `normalize-path` 即可；NormalizePathLayer 包在 main.rs `axum::serve` 前（不改 `initialize_admin_router()` 函式簽名、不影響 既有 test）。

## Technical Context

**Language/Version**: Rust 1.x（沿用 rust-api 既有；spec md edit 為純 markdown、無語言）
**Primary Dependencies**:
- `tower-http = "0.6"`（已 workspace dep；只加 `normalize-path` feature flag、非新 crate）
- `axum 0.7+`（已 dep；NormalizePathLayer 與 axum Router 透過 `tower::Layer` 整合）
- 既有 dev stack：postgres 17.4 / redis 7.4 / nginx 1.27 / rust-api / base-web

**Storage**: 不動 schema（spec FR-010）；postgres 既有 baseline、無 migration。
**Testing**:
- rust-api：`cargo check --workspace`（Step 1 build 驗）；既有 `server/initialize/tests/auth_login_e2e.rs` 不動（test 直呼 `initialize_admin_router()`、不經 main 的 wrap、無 break）。
- acceptance：[`contracts/verification-commands.md`](./contracts/verification-commands.md) 全 C-V（curl + psql + grep）。
- spec md edit：grep-based 驗證 + 重跑既有 regression（per SC-001 / C-V8）。

**Target Platform**: Linux server（dev container 內 rust runtime）；spec md edit 跨平台 markdown。
**Project Type**: Web service hardening + documentation cleanup（spec md errata）。
**Performance Goals**: 不引入新 performance budget。NormalizePathLayer trim_trailing_slash 為 4-行 string check、overhead sub-microsecond、可忽略（Assumptions 已記）。
**Constraints**:
- 0 base-web 改動（FR-010）
- 0 schema migration（FR-010）
- 0 新 cargo crate dep（最多 +1 既有 dep feature flag，SC-007）
- spec md edit scope 限 7 處（FR-011）；不批量檢視其他 spec rot

**Scale/Scope**:
- rust-api 2 檔改：`Cargo.toml` +1 line（feature flag）、`main.rs` +3 line（wrap）
- spec md 6 檔改：每檔 1–5 line edit + 1 行 errata
- contracts 11 個 C-V、acceptance 階段執行
- 預估 implementer effort：1–2hr（含 acceptance + commit）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.4.0 五大 Principle：

| Principle | 評估 | 狀態 |
|---|---|---|
| **I. RBAC Fail-safe（Casbin 後端強制）** | NormalizePathLayer 包在 Casbin enforce **外層**（path 先 normalize、再進 routing + casbin）；normalized path 與 `sys_endpoint` 表記錄字面一致（per FR-009 + C-V6 verify）。Casbin 為唯一 enforcement、前端 0 改動、無權限繞過。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit Log** | 0 新寫入路徑、0 schema 改動；既有 audit 紀律不變。本 feature 不引入新 DB write。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 0 service-to-service HTTP call 改動；NormalizePathLayer 只動 path 預處理、不改 endpoint ownership。nginx config 不動。 | ✅ PASS |
| **IV. base 不改動邊界** | **0 base-web 改動**（FR-010 / C-V10 verify）；本 feature **軌道外**、屬「預設原則」涵蓋、**不**動用 W-WEBUI 受管例外、**不**觸發 Constitution amendment。同 039 模式（軌道外 rust-only）。 | ✅ PASS |
| **V. 漸進收縮（DESIGN-A → DESIGN-B）** | 0 nestjs（F14 已退場）；rust-only；DESIGN-B 形態無 schema 變動、無 nginx 變動、無新 endpoint。 | ✅ PASS |

**Constitution Check 結論**：5/5 Principle PASS、**0 violation**、`Complexity Tracking` 表保持空白。**無需 Constitution amendment**、**無需 DESIGN-W-WEBUI 更新**（軌道外）。

## Project Structure

### Documentation (this feature)

```text
specs/041-spec-hygiene-pass-1/
├── spec.md                # /speckit-specify + /speckit-clarify 產出（已 commit）
├── plan.md                # 本檔（/speckit-plan 產出）
├── research.md            # Phase 0 grep + 假設驗證（R-1 ~ R-6）
├── contracts/
│   └── verification-commands.md   # C-V1 ~ C-V11
├── quickstart.md          # implementer 操作手冊（Step 1 ~ Step 6）
├── checklists/
│   └── requirements.md    # /speckit-specify quality validation
└── tasks.md               # /speckit-tasks 產出（尚未產）
```

（**無 `data-model.md`**：feature 無新 entity / schema、見 research R-5。）

### Source Code (repository root)

本 feature 為 rust-api code edit + spec md edit；無新 source 結構。實際改動：

```text
rust-api/                                              # worktree、branch rev1-admin-rust-api
├── server/
│   ├── initialize/
│   │   └── Cargo.toml                                 # +1 line: tower-http features 加 "normalize-path"
│   └── bin/
│       └── src/
│           └── main.rs                                # +3 line: import + 1 行 NormalizePathLayer wrap
└── （其他全不動；既有 tests/auth_login_e2e.rs 不破、無新 test）

specs/                                                  # outer 追蹤
├── 002-soft-delete-infrastructure/
│   └── data-model.md                                  # §E4 path comment 1 行修 + errata
├── 021-systemmanage-alias-router/
│   └── contracts/verification-commands.md             # C-V2 數字 + C-V10 主 URL + 2 errata
├── 022-manage-crud-alignment/
│   └── contracts/verification-commands.md             # C-V3 description + Pass criteria + errata
├── 030-systemmanage-status-gender-alignment/
│   └── contracts/verification-commands.md             # C-V8/9 payload + errata
├── 039-rust-entity-id-numeric-migration/
│   └── contracts/verification-commands.md             # C-V31 augment（加完整 curl block）+ errata
└── 040-wire-id-consistency/
    └── contracts/verification-commands.md             # C-V10/12 URL + errata

docs/
└── INTEGRATION-CHECKLIST.md                           # 移除 R4 + F3-N5 row、加 041 entry（post-merge、FR-012）
```

**Structure Decision**：本 feature **無新 source structure**、不引入新 module / 新檔。所有改動為 in-place edit；rust-api 改 2 既有檔、outer 改 6 既有 spec 檔 + 1 個 backlog 檔。worktree + submodule SHA pin 兩段式 commit（per [`CLAUDE.md §4.1`](../../CLAUDE.md)）。

### Two-stage commit shape（依 CLAUDE.md §4.1）

- **第一段（rust-api worktree、branch `rev1-admin-rust-api`）**：1 commit
  - `feat(rust-api): 加全局 NormalizePathLayer 收 trailing-slash request`
  - Files: `server/initialize/Cargo.toml` + `server/bin/src/main.rs`
- **第二段（outer rev1-admin-root、feature branch `041-spec-hygiene-pass-1`）**：1 commit
  - `chore(submodule): bump rust-api to <SHA> — 041 spec hygiene pass 1`
  - Files: rust-api SHA pin + 6 處 spec md edit + `docs/INTEGRATION-CHECKLIST.md`
- **Merge 回 default**：`git merge --no-ff 041-spec-hygiene-pass-1` to `rev1-admin-root`、user 同意後 push。

詳見 [`quickstart.md`](./quickstart.md) Step 5。

## Phase 0 outcomes（reference）

詳見 [`research.md`](./research.md)。重點：

- **R-1**：tower-http 0.6 已 dep；`normalize-path` feature flag 須開啟（既有 dep + 1 flag）。
- **R-2**：NormalizePathLayer wrap 在 `main.rs` `serve` 前（不在 `initialize_admin_router()` 內）；不影響既有 tests 簽名。
- **R-3**：7 處 spec rot grep 結果 — 6 處對齊 spec 描述（FR-001/003-007）、1 處（FR-002）描述偏差（無 `oldPassword` 字串）—— 策略改 augment、spec FR-002 wording 保留。
- **R-4**：acceptance 路徑為 docker build + dev stack `up -d rust-api --force-recreate --wait`。
- **R-5**：skip `data-model.md`（無新 entity）。
- **R-6**：用 `contracts/verification-commands.md`（同 030–040 體例）、不另開 yaml。

## Phase 1 outcomes（reference）

- [`contracts/verification-commands.md`](./contracts/verification-commands.md)：11 個 C-V（C-V1 build / C-V2-6 rust-api 行為 / C-V7-9 spec md edit 驗證 / C-V10 scope / C-V11 backlog）
- [`quickstart.md`](./quickstart.md)：6-step implementer 手冊（rust-api edit / build / spec md edit / acceptance / two-stage commit / backlog cleanup）
- 已更新 `CLAUDE.md` SPECKIT marker 區（指向本 plan）

## Constitution Check（Phase 1 re-evaluation）

Phase 1 設計完成後重 check：

- 5 大 Principle 仍 PASS（無新增 violation）。
- contracts/verification-commands.md 引入 11 C-V、但全為 acceptance 驗證手段、不引入新功能 / 新 path / 新 schema。
- quickstart.md 內 commit shape 明確兩段式（符合 §4.1 紀律）。
- backlog cleanup（FR-012）為 plan 內已界定的後續、無爭議。

**Constitution Check post-Phase 1：5/5 PASS、Complexity Tracking 仍空白**。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_ |

**無 violation**、無需合理化。

## Plan complete — Ready for `/speckit-tasks`

下一步：`/speckit-tasks` 產出 dependency-ordered `tasks.md`，將 spec FR-001~FR-012 + quickstart Step 1~6 拆成 implement units（每個有 T-NN 編號、user story mapping、dependencies、parallel marker）。

之後 `/speckit-analyze` cross-artifact consistency check、最後 `superpowers:executing-plans`（**不**用 `/speckit-implement`、per [`CLAUDE.md §3`](../../CLAUDE.md)）。
