# 041 spec-hygiene-pass-1 — brainstorm 設計

**日期**：2026-05-24
**Feature**：`041-spec-hygiene-pass-1`
**來源**：[`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) 衍生 follow-up R4（regression 2026-05-24 撞到 6 處 spec rot）+ F3-N5（F3 階段遺留、bundled 進來一次清完）

---

## 1. 觸發背景

2026-05-24 整套 28 feature regression（4 平行 batch + W-WEBUI CDP smoke）共 234 條 C-V、實際 PASS 159 / hard FAIL 3 / SKIP 75。3 條 hard FAIL 經查皆**非新 regression**：

- F003 C-V8（HTTP middleware audit gap）— 長期已知 gap，記為 R3
- F005 `/auth/logout` 404 — client-side logout 設計，記為 R5
- F021 C-V10 trailing slash → 404 — Axum nest 行為與 spec command 寫法不一致

但 regression 過程中順帶撞到 **6 處 spec rot**（程式對、文件舊、重跑 regression 會踩坑）+ 既有 backlog 中 **F3-N5**（F3 階段 data-model 範例 path drift）共 **7 處 spec md 偏離真實**。

本 feature 目標：一次清完 7 處 spec rot，並把 trailing slash 問題從「spec command 改寫迴避」昇級為「rust-api 全局 NormalizePathLayer 真正修掉」。Pareto 取向、小範圍、軌道外 rust-only + spec md。

---

## 2. 範圍與 Constitution 處理

### 2.1 8 處改動

**Spec md edits（7 處、純文字、outer 追蹤）**

| # | 檔案 | 改法 | 來源 |
|---|---|---|---|
| ① | `specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md` C-V8/9 | curl payload `username`→`userName`、`gender`→`userGender`（W-FW5/039 後 camelCase rename） | R4 |
| ② | `specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md` C-V31 | curl payload `oldPassword`→`currentPassword` | R4 |
| ③ | `specs/040-wire-id-consistency/contracts/verification-commands.md` C-V10/12 | URL `/api/role/list?...`→`/api/role?...`、`/api/user/list?...`→`/api/user?...`；補一行 errata 註 paginated root pattern | R4 |
| ④ | `specs/022-manage-crud-alignment/contracts/verification-commands.md` C-V3 | 描述：`userGender`/`userRoles`/`status` 自 F8/039 後填實值（不再 hardcode null/[]）；列新 expected shape | R4 |
| ⑤ | `specs/021-systemmanage-alias-router/contracts/verification-commands.md` C-V10 | URL `/user/?page=...`→`/user?page=...`、`/role/?page=...`→`/role?page=...`；補 errata「亦可帶 trailing slash（041 NormalizePathLayer 後支援）」 | R4 |
| ⑥ | `specs/021-systemmanage-alias-router/contracts/verification-commands.md` C-V2 | 期望 casbin row `20` → `≥20`、註「隨後續 alias 成長」（目前 50） | R4 |
| ⑦ | `specs/002-soft-delete-infrastructure/data-model.md` §E4 | path 範例由 spec drift 改成實際 impl 位置 `server-model/soft_delete_impls.rs` | F3-N5 |

**Code edit（1 處、rust-api worktree）**

| # | 檔案 | 改法 | 來源 |
|---|---|---|---|
| ⑧ | `rust-api/server/initialize/src/router_initialization.rs` | top-level admin router 加 `tower_http::normalize_path::NormalizePathLayer::trim_trailing_slash()`、讓 nested `Router::new().route("/", ...)` 模式的端點也接受 trailing slash request（如 `/api/user/`、`/api/role/`） | R4 升級 |

### 2.2 Boundary & Constitution

- **0 base-web 改動** — 與 W-WEBUI 軌道無關、Constitution Principle IV 不觸發、**不**動用「W-WEBUI 受管例外」。
- **0 schema migration**、**0 新 entity**、**0 nestjs**（已退場、F14）。
- 軌道屬性：軌道**外**、rust-only + spec md（同 039 模式）。
- **不需** Constitution amendment、**不**更新 [`DESIGN-W-WEBUI`](../INTEGRATION-DESIGN-W-WEBUI.md)。
- cargo dep：可能 +1 `tower-http` feature flag `normalize-path`（若未開）；不新增 crate dep。

---

## 3. 設計細節

### 3.1 Theme A — 7 處 spec md errata（純文字）

每處皆 1–5 行 string edit、無需運行時驗證。改後重跑對應 C-V 應從 FAIL/PARTIAL 轉 PASS（已被 2026-05-24 regression 證明改法為「對齊現實」）。

⑤ 比較特殊：spec command 本身就改為 no-slash 寫法（保守、確定 work），同時加 errata 行說明 trailing slash 在 ⑧ middleware 落地後也支援（為了讓未來讀者理解兩種寫法都對）。

### 3.2 Theme B — Axum NormalizePathLayer（1 處 code change）

**Root cause**：rust-api 的 `Router::new().route("/", get(handler)).nest("/user", subrouter)` 模式產生 routing tree 對 `/user` 與 `/user/` 行為不對稱。實測：
- `GET /api/user?page=1` → HTTP 200
- `GET /api/user/?page=1` → HTTP 404 `nothing to see here`

`tower-http::normalize_path::NormalizePathLayer::trim_trailing_slash()` 是 standard remedy、套在 `Router` 外層（必須在 routing **之前** apply、所以是 outermost layer）即可：

```rust
let app = NormalizePathLayer::trim_trailing_slash().layer(app);
```

**重要 layer 順序考量**：
- 必須在 Casbin enforce layer **之前**（外層）— normalize 後的 path 才會傳給 Casbin、與 `sys_endpoint` 表記錄的 path 字面一致。
- 必須在 audit / operation_log layer **之前**（同理）。
- 實作時要 grep 現有 `apply_layers`、確認插入位置不破壞既有 layer chain。

### 3.3 Two-stage commit shape

依 [`CLAUDE.md §4.1`](../../CLAUDE.md) 兩段式：

**第一段 — rust-api worktree**：1 commit
```
feat(rust-api): 加全局 NormalizePathLayer 收 trailing-slash request

router_initialization 在 admin router 外層套 NormalizePathLayer::trim_trailing_slash()，
使 nested `/` routes（如 /user、/role）對 /user/、/role/ 請求不再回 404。
layer 在 Casbin enforce 之外（在前）以確保 enforce 看到 normalized path。
```

**第二段 — outer rev1-admin-root**：1 commit
```
chore(submodule): bump rust-api to <SHA> — 041 spec hygiene pass 1

- rust-api SHA pin 同步（NormalizePathLayer）
- 7 處 spec md errata：
  · specs/021/022/030/039/040/002 全為 regression 2026-05-24 撞到 + F3-N5
  · 對齊現實、無 production 行為變化、cleanup-only
- 更新 docs/INTEGRATION-CHECKLIST.md：
  · 移除 R4 與 F3-N5 條目（已完成）
  · 已完成里程碑加 041 一行
```

### 3.4 Verification（spec-kit tasks.md 階段會展開）

| # | 內容 | 工具 |
|---|---|---|
| C-V1 | rust-api cargo build clean（NormalizePathLayer + 1 use 行） | host `cargo build` 或 docker build |
| C-V2 | regression：`/api/user?page=1` 仍 HTTP 200 + envelope ok | curl |
| C-V3 | fix：`/api/user/?page=1` 從 404 → HTTP 200 + envelope ok | curl |
| C-V4 | fix：`/api/role/?page=1` 從 404 → HTTP 200 + envelope ok | curl |
| C-V5 | 抽樣 3 個其他 nested 端點驗 trailing-slash 不破：`/api/menu/`、`/api/api-endpoint/`、`/api/domain/` | curl |
| C-V6 | Casbin enforce regression：GeneralUser → 仍 envelope `code:5001 success:false`（normalized path 不繞過權限） | curl |
| C-V7 | 7 處 spec md edit 後 grep 對應檔內 `username`/`oldPassword`/`/api/role/list`/`/api/user/list` 等舊字串回 0 hit（限於應修區域） | grep |
| C-V8 | 重跑本次 regression 受影響 C-V：030 C-V8/9、039 C-V31、040 C-V10/12、022 C-V3、021 C-V2/C-V10 全 PASS | curl + psql |

### 3.5 Risks & non-goals

**Risk（低）**：
- NormalizePathLayer **layer 順序錯放** → Casbin enforce 看到 un-normalized path、`sys_endpoint` 表記錄 path 字面不對應、原本工作的端點突然被拒。Mitigation：⑧ 改動的 review 必看 `apply_layers` 內 layer chain 順序；C-V6 涵蓋。
- NormalizePathLayer 對 query string、fragment 不會動，僅 path trailing slash。低風險。

**Non-goals（明示排除、不在本 feature scope）**：
- R3（HTTP middleware audit gap）— 下一輪 follow-up、scope 較大
- R5（`/auth/logout` doc note）— 屬 spec-only minor、留下次 hygiene pass 或併入 R3
- R2（F5.1 login fail no audit）— 待 R3 後重新評估
- base-web TS `id` 型別債 — 需 base-web cleanup sprint、跨多檔
- 批量檢視所有 spec md 找其他可能 rot — scope 嚴格限「regression 2026-05-24 + F3-N5」共 7 處；其他發現新開 hygiene-pass-2
- F1.2 / F3-N1/N2/N3 / 035-N1 / W-F6b — 各自獨立 follow-up
- Axum nested router 「`/`-rooted handler」設計是否要全面 refactor — 本 feature 用 middleware 取巧、不動 router 結構

---

## 4. 下一步（spec-kit 設計鏈接棒）

依 [`CLAUDE.md §3`](../../CLAUDE.md)：

1. ✅ **step 0 brainstorm**（本檔）
2. → **`/speckit-specify`**（input = 本檔）— 由 `before_specify` pre-hook 建 `041-spec-hygiene-pass-1` outer feature branch、產 `specs/041-spec-hygiene-pass-1/spec.md`
3. → `/speckit-clarify`（可選；scope 已清晰、可能 skip）
4. → `/speckit-plan` — 含 Constitution Check（預期不觸發 amendment）
5. → `/speckit-tasks` — dependency-ordered tasks.md
6. → `/speckit-analyze` — spec/plan/tasks consistency
7. → **`superpowers:executing-plans`** 實作（**不** `/speckit-implement`、per CLAUDE.md §3 紀律）
8. → `superpowers:finishing-a-development-branch` → 兩段式 commit → `git merge --no-ff` 回 `rev1-admin-root`

完成後 `docs/INTEGRATION-CHECKLIST.md`：
- 移除「衍生 follow-up」table 中 R4 與 F3-N5 兩 row
- 「已完成里程碑」加一行 041
- 「Current Focus 下一步」更新為 R3（依 user 2026-05-24 拍板順序：041 → R3 → W-F12/13/14 → F3-N4 → R5）
