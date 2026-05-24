# Quickstart — 041 spec-hygiene-pass-1

**Phase**: 1（Design & Contracts、Phase 1 產出）
**Audience**: implementer（人或 AI）執行 041 的步驟手冊。

依執行順序：rust-api 改動 → rust-api build + dev stack restart → 7 處 spec md edit → acceptance（contracts/verification-commands.md 全 C-V）→ 兩段式 commit → backlog 清理。

---

## 前置假設

- dev stack 健康（5 service：postgres / redis / rust-api / front-nginx / base-web、見 [`CLAUDE.md §8.2`](../../CLAUDE.md)）。
- 預設帳號可登入（`Soybean`/`123456` 等）。
- outer branch 為 `041-spec-hygiene-pass-1`、rust-api worktree branch 為 `rev1-admin-rust-api`、base-web 不動。
- `PC` shell alias（可選）：`export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"`。

---

## Step 1 — rust-api 改動（2 檔）

### 1.1 開啟 tower-http `normalize-path` feature flag

檔案：`rust-api/server/initialize/Cargo.toml`

```diff
-tower-http = { workspace = true, features = ["trace"] }
+tower-http = { workspace = true, features = ["trace", "normalize-path"] }
```

### 1.2 main.rs 包整個 Router

檔案：`rust-api/server/bin/src/main.rs`

定位 `let app = server_initialize::initialize_admin_router().await;`（line ~30）這行後、`axum::serve(...)` 之前。

```diff
+use tower::Layer;
+use tower_http::normalize_path::NormalizePathLayer;
+
 let app = server_initialize::initialize_admin_router().await;
+let app = NormalizePathLayer::trim_trailing_slash().layer(app);
+let app = tower::ServiceExt::into_service(app);
 // ... 既有 axum::serve / listener 設定
```

> **實作 note**：tower-http 0.6 的 `NormalizePathLayer` 需 wrap 在 routing **之前**。`NormalizePathLayer::trim_trailing_slash().layer(app)` 返 `NormalizePath<Router>`。axum 0.7 `serve` 可接受任何 `Service<Request<Body>>`，但若型別推導有問題、用 `tower::ServiceExt::into_service(app)` 或 `app.into_make_service()` 確保 trait alignment（plan 階段須實機驗證、可能需小幅調 import）。

### 1.3 build clean check

```bash
cd rust-api && cargo check --workspace 2>&1 | tail -10
# 預期：0 error；可能有 normalize-path feature 啟用相關 info、無新 warning
```

---

## Step 2 — rust-api image rebuild + dev stack restart

依 `reference_image_build` memory（compose 無 `build:` 段、必須手動 build）：

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/

$PC up -d rust-api --force-recreate --wait
$PC ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}" | grep -E "rust-api|postgres|redis|front-nginx|base-web"
# 預期 5 service all healthy
```

---

## Step 3 — 7 處 spec md edit

依 [`research.md R-3`](./research.md) 的明確 string replace / augment 策略。建議用 `Edit` 工具逐檔執行、避免 grep 跨 file 誤改。

### 3.1 ① 030 C-V8/9 — 4 處 camelCase rename + errata

檔案：`specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md`

- Line 95 `-d '...':"username":"GenderTest030"...,"gender":"male"...'` → `"userName":"GenderTest030"..."userGender":"1"...`（其他欄位如 `nickName`/`status` 已對；`gender` value 由 `"male"` → `"1"` 對齊實際 enum 字串、per F8/039）
- Line 124 update payload 同上 替換 `username`→`userName`、`gender`→`userGender`、值 `"female"`→`"2"`
- 補一行 errata 在 C-V8 開頭：「> **errata 041**：payload 欄位於 W-FW5/039 後改 camelCase（`userName`/`userGender`）；value enum 用字串 `"1"`(male)/`"2"`(female) 對應 base TS。」

### 3.2 ② 039 C-V31 — augment 加完整 curl block + errata

檔案：`specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md`

定位 line 37 (現為 summary table row)、在表後新增一個獨立 sub-section（或在 table row 註 footnote 指 sub-section）：

```markdown
---

### C-V31 詳述 — changePassword payload 例

**errata 041**：原 line 37 summary 僅標 `/api/auth/changePassword`、未列 payload 欄位名。實際 DTO 為 `currentPassword`（非常見的 `oldPassword`、per W-FW5 035 `change_password` service）。

```bash
# 先以某 user token（非 Soybean、避免影響其他測試）發 changePassword
USER_TOKEN=$(curl -fsS -X POST "http://127.0.0.1:11080/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"<test-user>","password":"<old>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -fsS -X POST "http://127.0.0.1:11080/api/auth/changePassword" \
  -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"<old>","newPassword":"<new>"}'
```

**Expected**：envelope `code:0`；該 user 可用 `<new>` 重 login、`<old>` 失效。
```

### 3.3 ③ 040 C-V10/12 — 2 處 URL replace + errata

檔案：`specs/040-wire-id-consistency/contracts/verification-commands.md`

- Line 16：`curl `GET /api/role/list?current=1&size=10`` → `curl `GET /api/role?current=1&size=10``
- Line 18：`curl `GET /api/user/list`` → `curl `GET /api/user``
- 在 C-V10 / C-V12 表格列尾各加一條：「> **errata 041**：rust-api paginated list endpoint 慣例 = root path GET、無 `/list` suffix。」

### 3.4 ④ 022 C-V3 — description 重寫 + errata

檔案：`specs/022-manage-crud-alignment/contracts/verification-commands.md`

- Line 74 Goal：「缺欄位 hardcode null/[]」改「實作裝載 user/role 等實值；少數欄位仍 hardcode null/[]（如 menu `buttons`/`children`、見 C-V3d）」。
- Line 132 `userGender 為 null（hardcode None per Q2）` → `userGender 為 string "1"(male) / "2"(female) / null（未設值；F8/039 後實值化）`。
- Line 134 `userRoles 為 [] (hardcode vec![] per Q2)` → `userRoles 為 string[]（role code list、如 ["ROLE_SUPER"] / []；F8/039 後實值化）`。
- Line 146-149 Pass criteria 對應更新：`C-V3c userGender:hardcode None` → `C-V3c userGender:實值 or null`、`C-V3c userRoles:[]` → `C-V3c userRoles:array`。
- 在 C-V3 開頭補一行 errata：「> **errata 041**：F8/039 後 `userGender`/`userRoles`/`status` 已實值化、不再 hardcode null/[]/`'enabled'`。下方 C-V3c expected 已更新。」

### 3.5 ⑤ 021 C-V10 — 2 處 URL no-slash + errata

檔案：`specs/021-systemmanage-alias-router/contracts/verification-commands.md`

- Line 448 `=== C-V10a: 既有 GET /user/ ===` → `=== C-V10a: 既有 GET /user (no-slash) ===`、command URL `/user/` → `/user`
- Line 453 同上：`/role/` → `/role`
- 在 C-V10 開頭補 errata：「> **errata 041**：主命令採無 trailing slash（避免 nested router `/`-rooted endpoint 在 axum 0.7 對 trailing slash 回 404 的歷史行為）。041 NormalizePathLayer 落地後、`/user/` `/role/` 帶 trailing slash form 亦回 HTTP 200。」

### 3.6 ⑥ 021 C-V2 — 數字格式 + errata

檔案：`specs/021-systemmanage-alias-router/contracts/verification-commands.md`

- Line 38 標題 `20 row` → `≥20 row（持續成長）`。
- Line 490 summary `COUNT = 20` → `COUNT ≥ 20`。
- 在 C-V2 開頭補 errata：「> **errata 041**：原硬編 `20` 為 F9 落地時數；後續 feature 新增 systemManage alias 而成長（2026-05-24 regression 實測 50）。判定改為 `≥20`。」

### 3.7 ⑦ F3-N5 002 §E4 — 1 行 path replace + errata

檔案：`specs/002-soft-delete-infrastructure/data-model.md`

- Line 158 comment：`// server/core/src/db/soft_delete.rs（同檔內）` → `// server/model/src/admin/soft_delete_impls.rs（model crate、避循環依賴 per F3 R6）`。
- 在 §E4 開頭補 errata：「> **errata 041 (F3-N5)**：原 brainstorm 期推測 7 個 `impl SoftDeletable` block 落於 `server/core/src/db/soft_delete.rs`（trait def 處）；implementer 移到 `server/model/src/admin/soft_delete_impls.rs`（model crate、避循環依賴 per F3 R6）後未回 update 範例 comment、此 errata 補正。」

---

## Step 4 — 跑 acceptance（contracts/verification-commands.md 全 C-V）

依 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 跑 C-V1 ~ C-V11。

順序建議：
- 先跑 C-V1（build clean check）—— Step 2 已含、再 verify 一次。
- 再跑 C-V2 / C-V3 / C-V4 / C-V5 / C-V6（rust-api 行為）。
- 再跑 C-V7 / C-V8 / C-V9（spec md edit 驗證）。
- 最後跑 C-V10 / C-V11（scope + backlog）。

每 C-V 結果記錄；FAIL 則 debug、修、重跑該 C-V，直到全 PASS。

---

## Step 5 — 兩段式 commit（per CLAUDE.md §4.1）

### 5.1 第一段 — rust-api worktree

```bash
cd rust-api
git status                                    # 確認在 rev1-admin-rust-api 分支
git add server/initialize/Cargo.toml server/bin/src/main.rs
git diff --staged                             # review
git commit -m "$(cat <<'EOF'
feat(rust-api): 加全局 NormalizePathLayer 收 trailing-slash request

NormalizePathLayer::trim_trailing_slash() wrap 在 main.rs `serve` 之前、
跨整個 admin/auth/authorization router compose 最外層，使 nested `/`-rooted
endpoint（如 /user、/role）對 trailing slash request 不再回 404。

- Cargo.toml: tower-http 加 `normalize-path` feature flag（既有 dep、僅 +1 flag）
- main.rs: NormalizePathLayer::trim_trailing_slash().layer(app) wrap

per spec 041 FR-008/009、Clarifications 2026-05-24 Q1（全 router scope）
EOF
)"
git push origin rev1-admin-rust-api
cd ..
```

### 5.2 第二段 — outer rev1-admin-root（feature branch 041）

```bash
git branch --show-current                     # 確認 041-spec-hygiene-pass-1
git status                                    # 應看到：
#   - modified: rust-api (new commits)
#   - 6 處 spec md modified
#   - docs/INTEGRATION-CHECKLIST.md modified
git diff --stat
git add \
  rust-api \
  specs/030-systemmanage-status-gender-alignment/contracts/verification-commands.md \
  specs/039-rust-entity-id-numeric-migration/contracts/verification-commands.md \
  specs/040-wire-id-consistency/contracts/verification-commands.md \
  specs/022-manage-crud-alignment/contracts/verification-commands.md \
  specs/021-systemmanage-alias-router/contracts/verification-commands.md \
  specs/002-soft-delete-infrastructure/data-model.md \
  docs/INTEGRATION-CHECKLIST.md
git commit -m "$(cat <<'EOF'
chore(submodule): bump rust-api to <SHA> — 041 spec hygiene pass 1

- rust-api SHA pin 同步（NormalizePathLayer 全局 wrap）
- 7 處 spec md errata（regression 2026-05-24 撞到 6 處 + F3-N5）：
  · 030 C-V8/9 username→userName / gender→userGender
  · 039 C-V31 augment changePassword payload example（currentPassword）
  · 040 C-V10/12 /api/role,user/list → /api/role,user（paginated root）
  · 022 C-V3 hardcode null/[] → 實值描述（F8/039 後）
  · 021 C-V10 主命令 no-slash + errata（NormalizePathLayer 後雙形支援）
  · 021 C-V2 「20 row」→「≥20 row」（隨 alias 成長）
  · 002 §E4 path → server/model/src/admin/soft_delete_impls.rs (F3-N5)
- INTEGRATION-CHECKLIST: 移除 R4、F3-N5、加 041 entry
- spec 041 設計鏈：brainstorm + spec/plan/research/contracts/quickstart 全套
EOF
)"
```

**Push 前需 user 同意**（per [`~/.claude/CLAUDE.md §5`](~/.claude/CLAUDE.md) global）。

### 5.3 Merge 回 default

acceptance 全 PASS 後：

```bash
git checkout rev1-admin-root
git merge --no-ff 041-spec-hygiene-pass-1 -m "Merge feature 041-spec-hygiene-pass-1"
# 再次 push 前須 user 同意
```

---

## Step 6 — backlog 清理（FR-012、SC-008）

依 spec FR-012、更新 `docs/INTEGRATION-CHECKLIST.md`：

### 6.1 從「衍生 follow-up」table 移除 2 row

刪除：
- `R4 | regression 2026-05-24 / 6 處 spec rot | ...`
- `F3-N5 | F3 analyse | ... | spec hygiene（補 errata 一行）`

### 6.2 「已完成里程碑」加 1 entry

按既有體例（每 feature 1 行、限 outer/merge/worktree SHA + spec 連結 + 一句話）：

```markdown
- [x] **041 spec-hygiene-pass-1** ✅（2026-05-24 完成；outer `<SHA>` + merge `<SHA>`、rust-api `<SHA>`、base-web 0 改動；spec `specs/041-spec-hygiene-pass-1/`）— 7 處 spec md errata（R4 6 處 + F3-N5）+ rust-api 全局 NormalizePathLayer（FR-008/009）；軌道外 rust-only + spec md
```

### 6.3 Current Focus 下一步

從「041 進行中」→「R3 HTTP middleware audit gap」（per [`project_followup_processing_order`](../../) memory）。

---

## 收尾 checklist

- [ ] Step 1 rust-api 2 檔改、`cargo check` 通過
- [ ] Step 2 image rebuild、dev stack 5 service healthy
- [ ] Step 3 7 處 spec md edit 完
- [ ] Step 4 C-V1~C-V11 全 PASS
- [ ] Step 5.1 第一段 rust-api commit + push
- [ ] Step 5.2 第二段 outer commit（不 push）
- [ ] Step 5.3 merge 回 default（user 同意才 push）
- [ ] Step 6 backlog 清理完成
- [ ] 通知 user 進入下一 follow-up（R3）
