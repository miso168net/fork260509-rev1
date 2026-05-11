# CLAUDE.md — workspace 指引

> 此檔覆寫並補充全域 `~/.claude/CLAUDE.md`。專案特定規則優先；通用規則沿用全域。
> 本工作區是 `fork260509` 的 **rev1 重建**：相同設計骨幹、不同命名（短名 base/rust、長名 rev1-）。

---

## 1. 工作區用途

這是**跨 fork 的整合研究與設計工作區**，也是傘狀整合 repo（`rev1-admin-root`）的根。最終結構由三個 git 物件組成：

| 命名 | 是什麼 | 對應目錄 | remote / 來源 | 在外層 git |
|---|---|---|---|---|
| `rev1-admin-root` | 傘狀 monorepo（**就是當前 workspace**） | `.` | `miso168net/fork260509-rev1.git` | 自身 |
| `rev1-admin-base-web` | `fork260509-soybean-admin-base` 上的新分支（從 `example` 衍生） | `base-web/`（worktree） | push 回 `miso168net/fork260509-soybean-admin-base` 的 `rev1-admin-base-web` 分支 | submodule（記 SHA pin） |
| `rev1-admin-rust-api` | `fork260509-soybean-admin-rust` 上的新分支（從 `main` 衍生） | `rust-api/`（worktree） | push 回 `miso168net/fork260509-soybean-admin-rust` 的 `rev1-admin-rust-api` 分支 | submodule（記 SHA pin） |

**短名 vs 長名 — 命名用法分工**：實務上有兩組稱呼，依場景挑：

| 用 | 場景 | 例 |
|---|---|---|
| **短名** `base-web` / `rust-api` | 檔案、目錄、source code、worktree dir 等**檔案層面** | `cd base-web`、`改 base-web/.env`、`rust-api/server/...` |
| **長名** `rev1-admin-base-web` / `rev1-admin-rust-api` | git branch、docker compose service、image tag、runtime 行為等**服務層面** | `git push origin rev1-admin-base-web`、`docker compose up rev1-admin-rust-api`、「rev1-admin-rust-api 回 code:200」 |

兩者指同一元件、僅描述視角不同。混用一般無妨，但寫文件時依此分工最清楚。

`base-web/` 與 `rust-api/` 是**worktree + submodule 雙重身分**：
- **本機**：透過 `git worktree add -b <branch>` 建立，`.git` 是 file 指向源倉的 `worktrees/`，`cd base-web && git commit/push` 直接寫回 fork repo 的對應分支。
- **外層 `rev1-admin-root`**：把它們當 submodule 處理（gitlink + `.gitmodules`），每次外層 commit 紀錄當下使用的 fork SHA。**外層看不到檔案 diff，只看到 SHA pin 變動**。
- **別人 clone 外層**：`git clone --recurse-submodules` 會拉 fork repo 到 base-web/ rust-api/（變正常 clone 而非 worktree，但內容相同）。

兩段式 commit 是日常工作流，詳見 §6 與 §9 操作手冊。

**目前狀態**：worktree + submodule 已建立、`.gitmodules` 已註冊；尚無 feature work。base-web 從 `example` 分支衍生、rust-api 從 `main` 分支衍生。

## 2. 目錄結構

```
fork260509-rev1/                            ← workspace root（傘狀 repo rev1-admin-root 的工作目錄）
├── CLAUDE.md                              ← 本檔（workspace 指引）
├── .gitignore                             ← 排除 fork 源倉與 graphify cache（不排除 base-web/rust-api，它們是 submodule）
├── .gitattributes                         ← LF 強制（避免 Windows host autocrlf 把 .sh/.yaml/.conf 改 CRLF）
├── .gitmodules                            ← base-web / rust-api 的 submodule 設定（指 fork remote）
├── .claude/                               ← Claude Code 設定（hook + settings.json，credentials gitignored）
│   ├── settings.json                      ← SessionStart hook 註冊
│   └── hook-git-submodule-SOP.sh          ← 每次 session 開頭執行的 SOP 檢查
├── .specify/                              ← spec-kit 安裝結構（templates / scripts / memory / extensions / integrations / workflows）
├── docs/             (尚未建立)            ← 未來：整合設計產出（INTEGRATION-RESEARCH.md、INTEGRATION-PLAN.md、INTEGRATION-CHECKLIST.md）
├── specs/            (尚未建立)            ← 未來：spec-kit feature spec 目錄
├── graphify-out/                          ← 知識圖譜輸出（外層 git 只追蹤 graph.json + GRAPH_REPORT.md）
│   ├── GRAPH_REPORT.md                    ← 含 god nodes / surprises / suggested questions
│   ├── graph.json                         ← 結構化圖譜資料（可被 graphify query 查）
│   ├── manifest.json           (gitignored, --update 增量基準，個人化)
│   ├── cost.json               (gitignored, token 用量帳單，個人化)
│   ├── cache/                  (gitignored, LLM 擷取快取，可重產)
│   ├── obsidian/               (gitignored, Obsidian 筆記)
│   └── graph.html              (gitignored, 互動視覺化)
├── fork260509-soybean-admin-base/         ← Vue 3 starter，base-web worktree 源倉（gitignored，本機必留）
├── fork260509-soybean-admin-docs/         ← 文件站（gitignored，整合不用，僅參考）
├── fork260509-soybean-admin-nestjs/       ← NestJS backend + Vue frontend（gitignored，整合不用，僅參考）
├── fork260509-soybean-admin-rust/         ← Rust axum + Casbin backend，rust-api worktree 源倉（gitignored，本機必留）
├── base-web/                              ← worktree + submodule（外層記 gitlink SHA）
├── rust-api/                              ← worktree + submodule（外層記 gitlink SHA）
└── deploy/           (尚未建立)            ← 未來：docker-compose / nginx / .env.example
```

**關鍵事實**：
- `base-web/` `rust-api/` 是 worktree + submodule 雙重身分（見 §1 與 §9 操作手冊）— 外層 commit 只記 SHA pin、不記檔案 diff；別人 clone 用 `--recurse-submodules`。
- `fork260509-*` 4 個源倉 gitignored，但**本機必須留著**（worktree 源倉）；別台機器若用 submodule clone 重來則不需要這 4 個源倉。
- Vue 源倉 GitHub repo 名稱 = `fork260509-soybean-admin-base`（從原 `fork260509-soybean-admin` rename 而來，舊 URL 仍 redirect）。
- 知識圖譜報告 `GRAPH_REPORT.md` 只存在 `graphify-out/`，docs/ 不放 symlink（Windows TortoiseGit 對 symlink 處理異常）。要看就直接開 `graphify-out/GRAPH_REPORT.md`。
- 外層 git 追蹤：`CLAUDE.md`、`.gitignore`、`.gitattributes`、`.gitmodules`、`.claude/{settings.json, hook-git-submodule-SOP.sh}`、`.specify/`（spec-kit 結構）、`graphify-out/{graph.json, GRAPH_REPORT.md}`、以及 `base-web` `rust-api` 兩個 gitlink SHA。

## 3. 知識圖譜（graphify）

圖譜已建好（3,616 nodes / 3,543 edges / 1058 communities，跨 4 個 fork — 從 fork260509 抄入，可作 rev1 設計起點參考）。

**使用方式**：
- 查問題：在 workspace root 執行 `graphify query "你的問題"` — 走 BFS 預設、`--dfs` 改 DFS、`--budget N` 限 token
- 解釋節點：`graphify explain "節點名"`
- 找路徑：`graphify path "節點A" "節點B"`
- 增量更新：`graphify update`（會用 `manifest.json` 比對變更）

**已知圖譜限制**（重要 — 推論前要記得）：
- **NestJS DI 結構在圖中是破碎的**：AST extractor 看不懂 `@Module({ imports, providers })` decorator 也沒解 ES6 `import`。22 個 NestJS module + ~1900 個 .ts file-level node 是孤立的。問 NestJS 部分時要直接讀檔，別只信圖。
- **Vue component composition 也破碎**：182 個 `.vue` 元件孤立（因為 `<template>` 標籤對應到 import 元件的關係沒被抓）。
- **Rust 部分圖譜可信**：god nodes / cohesion / bridges 都站得住腳。
- **PNG 流程圖（如 router-guard-flow.png）擷取準確 ~94%**，但**沒連到實作**：33 個流程節點與 `router/guard/route.ts` 的 4 個函式之間 0 邊。
- **`get_db_connection()` 的 48 條 INFERRED edge 方向是反的**（實際是 caller→callee，圖譜寫成 callee→caller）。

> rev1 的 base-web 來源是 `example` 分支（不是 `main`），與 fork260509 的圖譜抓取點不完全一致。具體 file structure 上的 GAP 分析需要對 rev1 的 worktree 重做。

## 4. 整合計畫的高層決策（從 fork260509/docs/INTEGRATION-PLAN.md 帶過來的泛用部分）

| 主題 | 決策 |
|---|---|
| 倉儲結構 | 傘狀 monorepo `rev1-admin-root/{base-web, rust-api, deploy, docs}` — `base-web/` 與 `rust-api/` 同時是 git worktree（本機操作）+ git submodule（外層記 SHA pin） |
| Reverse proxy | nginx（解 CORS via 同源）— 不在 Rust 加 CorsLayer |
| Database 連線 | 不用 pgbouncer，Sea-ORM 內建 pool 即可 |
| Refresh token | DB-backed（用既有 `sys_tokens` 表）— 不用 stateless JWT |
| Migration | init container（`docker compose run --rm migration`） |
| Dev workflow | docker compose 起 infra+rust-api，host 跑 `pnpm dev`（vite proxy 到 :10001） |
| Prod workflow | 全 docker compose；對外只暴露 base-web :8080 |

> GAP 清單（fork260509 對 main 分支做過的 ~10 個 GAP 分析）**未帶入 rev1** — rev1 的 base-web 基於 `example` 分支，GAP 內容可能不同，需重做分析。

## 5. 操作參考資料 (Operational Reference)

> 此節為 reference data（不是 principle、不是 checklist），放在 CLAUDE.md 是為了讓我每次 session 都直接看到、不用 Read 額外檔案 — 特別是 CDP 自動化登入時要立刻有密碼可用。

### 5.1 預設帳號（dev 用）

依 `rust-api/migration/src/datas/m20241024_033005_insert_sys_user.rs`：

| 帳號 | 角色 | 密碼 |
|---|---|---|
| `Soybean` | 超級管理員 | `123456`（待 rev1 重新驗證） |
| `Administrator` | admin | 同上 |
| `GeneralUser` | 一般 | 同上 |

3 個 user 共用同一個 argon2id 雜湊。**fork260509 已驗證**：plaintext = `123456`，README 文件提到 `Soybean@123.` 是錯的。rev1 的 rust-api 從同一 upstream main 分支建，行為應一致，但建議 rev1 第一個 login flow feature 跑完時再次動態驗證。

### 5.2 對外 endpoint（待 deploy/ 建好後生效）

- base-web：`http://localhost:8080`（變數 `WEB_PORT` 預設 8080）
- rust-api（同源）：`http://localhost:8080/api/*` → nginx 反代到 `rev1-admin-rust-api:10001`
- Login API：`POST /api/auth/login` body `{"identifier": "Soybean", "password": "123456"}`

## 6. 開發守則（workspace-specific）

### 6.1 兩段式 commit（submodule 模式的核心紀律）

改 `base-web/` 或 `rust-api/` 內檔案後，**永遠是兩段 commit**：

```bash
# === 第一段：在 worktree 內 commit + push 到 fork ===
cd base-web
git status                                    # 確認在 rev1-admin-base-web 分支
git add <files> && git commit -m "..."
git push origin rev1-admin-base-web           # 推到 miso168net/fork260509-soybean-admin-base

# === 第二段：回外層更新 SHA pin ===
cd ..
git status                                    # 應該看到 "modified content" 在 base-web
git add base-web                              # 只 add 目錄即可（記 SHA，不記檔案）
git commit -m "bump base-web to <短 SHA>: <一行描述>"
git push                                      # 推到外層 rev1-admin-root remote
```

第二段的 outer commit 訊息**建議帶 SHA 與 fork 提交標題**，以後在外層 log 看得懂：

```
bump base-web to abc1234: GAP-0a fix success code
bump rust-api to def5678: GAP-1 add refresh handler
```

### 6.2 其他守則

1. **改 fork 源倉**（如要拉 upstream rebase）：`cd fork260509-soybean-admin-base && git fetch upstream && git rebase ...`。worktree 自動跟著走（共用 .git database）；之後仍要回外層 `git add base-web && git commit` 更新 pin。
2. **CLAUDE.md / docs/ 改動**：在外層 `rev1-admin-root` repo 改、commit、push（單段 commit，不需第二段）。
3. **不要在 docs/ 重新建 symlink** 指向 graphify-out/（Windows TortoiseGit 對 symlink 處理會出問題）。GRAPH_REPORT.md 唯一位置就是 `graphify-out/GRAPH_REPORT.md`，要在 docs/ 看到「凍結快照」就 `cp graphify-out/GRAPH_REPORT.md docs/` 並 commit 為實檔。
4. **graphify 重跑前**：先讀 `graphify-out/cost.json` 看是否真有需要（一次 ~440K input / 190K output token）。多數時候 `graphify update` 即可。
5. **不要改 `graphify-out/cache/`**：那是 graphify 內部的 LLM 擷取結果快取，手改會破壞下次 update 的 diff。
6. **新功能設計問題**先用 `graphify query "..."` 試 — 但 NestJS / Vue component 部分要警覺圖譜盲點（§3），且 rev1 base-web 來源是 example 分支與圖譜抓取點不一致。

### 6.3 Commit message 規範

**格式**：[Conventional Commits](https://www.conventionalcommits.org/)、**訊息一律中文**。

```
<type>(<scope>): <subject>          ← subject 用中文

<body 可選，中文>

<footer 可選，中文，例如 BREAKING CHANGE / Closes #N>
```

**常用 type**：

| type | 用途 | 範例 |
|---|---|---|
| `feat` | 新功能 | `feat(rust-api): 加入 POST /auth/refreshToken` |
| `fix` | 修 bug | `fix(base-web): 修正 success code 對齊（0000 → 200）` |
| `docs` | 純文件改動 | `docs: INTEGRATION-PLAN §3 補上 submodule 註冊流程` |
| `chore` | 雜項（設定、submodule pin、依賴） | `chore: 註冊 base-web/rust-api 為 submodule` |
| `refactor` | 重構（不改功能、不修 bug） | `refactor(rust-api): 抽出 token 產生器 helper` |
| `style` | 格式調整（不影響邏輯） | `style: 統一 .env 排版` |
| `perf` | 效能優化 | `perf(rust-api): get_db_connection 加 lazy init` |
| `test` | 增加測試 | `test(rust-api): refresh handler 單元測試` |
| `build` | 建置系統 / 外部依賴 | `build(base-web): 升 vite 8.0.8 → 8.1.0` |
| `ci` | CI 設定 | `ci: 加入 base-web build workflow` |
| `revert` | 還原 commit | `revert: 撤回 chore: 註冊 submodule` |

**scope 建議**（本專案）：`base-web` / `rust-api` / `deploy` / `docs` / `graphify` / `submodule` 等；可省略。

**兩段式 commit 的 message 慣例**（搭配 §6.1）：

第一段（worktree 內，正常 conventional commit）：
```
feat(rust-api): 加入 POST /auth/refreshToken

實作 refresh token 處理器，使用 sys_tokens 表查詢 + rotate。
~80 行 Rust。
```

第二段（外層更新 SHA pin，用 `chore(submodule)`）：
```
chore(submodule): bump rust-api 到 abc1234 — refresh handler
```

> outer commit 訊息**務必帶上短 SHA 與 fork 提交主旨**，這樣外層 log 一眼看出每次 pin 移動對應哪個改動。

### 6.4 Claude session 開場 SOP

每次 session 開頭由 `.claude/hook-git-submodule-SOP.sh` 自動執行，回報：

```bash
git status                            # 外層狀態
git submodule status                  # submodule SHA 對齊狀況（行首空格=clean, +=SHA 不一致, -=未 init）
ls -la base-web/.git rust-api/.git    # 確認還是 worktree（檔而非目錄）
git log --oneline -5                  # 最近 5 個外層 commit，看 pin 變動歷史
```

若 `git submodule status` 看到 `+` 開頭，代表 worktree 的 HEAD 已超前 outer 記的 SHA pin — 主動提示使用者：「base-web/ 或 rust-api/ 的 worktree 已超前 outer pin，要不要更新 pin？」

## 7. 不要做的事

- ❌ 不要在外層 `rev1-admin-root` repo `git add fork260509-*/`（4 個源倉 gitignored，會變 embedded git）。`base-web/` `rust-api/` **可以** add（它們是 submodule，唯一正確方式就是 `git add base-web` 記 SHA pin）。
- ❌ 不要 `git submodule add ../<...> base-web`：這會嘗試 clone 進 base-web/、與既有 worktree 衝突。submodule 設定要**手寫 .gitmodules**（見 §9）。
- ❌ 不要在 worktree 裡跑 `git push` 不指定 remote/branch — `cd base-web` 預設推到 fork260509-soybean-admin-base，可能誤推到非預期分支；用 `git push origin rev1-admin-base-web` 顯式指定。
- ❌ 不要忘記第二段 commit：worktree 內改完 push 完，**一定要回外層 `git add base-web && git commit`** 更新 pin，否則外層下次 commit 才會包進去（容易混淆 SHA 對應關係）。
- ❌ 不要在 Rust `application.yaml` 直接改 hardcode（建議用 envsubst template，後續 deploy/ feature 時統一處理）。
- ❌ 不要在 Rust 加 CorsLayer（決策走 nginx 同源；改 CorsLayer 會讓 prod 路徑分歧）。
- ❌ 不要碰 `fork260509-soybean-admin-docs/` 與 `fork260509-soybean-admin-nestjs/`（不在整合範圍內，留作參考）。
- ℹ️ `README.md` 是給人類首次 onboarding 用的（特別是新機器 setup）；CLAUDE.md 是給 dev assistant 內部用的。兩者目的不同，不要混合 — 若 README 章節變多到開始重疊 CLAUDE.md 內容，把細節留 CLAUDE，README 只放「快速開始 + 指引到 CLAUDE」。

## 8. 進度追蹤

**目前狀態**：剛初始化的純結構重建。

- ✅ **已完成**：
  - Outer GitHub repo (`miso168net/fork260509-rev1`) 建立
  - 4 個 fork 源倉本機 clone
  - `.gitignore` / `.gitattributes` / `.claude/{settings.json, hook-git-submodule-SOP.sh}` / `.specify/`（spec-kit 結構）就位
  - `base-web/` worktree（從 `fork260509-soybean-admin-base` 的 `example` 分支建 `rev1-admin-base-web`）
  - `rust-api/` worktree（從 `fork260509-soybean-admin-rust` 的 `main` 分支建 `rev1-admin-rust-api`）
  - `.gitmodules` 註冊兩個 submodule
  - graphify-out（從 fork260509 抄入，4 個源倉的圖譜可作起點參考）
- ⏳ **待補**：
  - 推 `rev1-admin-base-web` / `rev1-admin-rust-api` 分支到各自 fork remote
  - 第一次 outer commit（register submodules + workspace 指引）
  - constitution 建立（如果要走 spec-kit 流程）
  - GAP 重新分析（rev1 的 example 分支與 fork260509 main 分支有差，需重評估）
  - `docs/` / `deploy/` / `specs/` 都尚未建立

## 9. Submodule 操作手冊（給未來 Claude session）

> 此節是讓我（Claude）在後續對話接手時知道怎麼處理 submodule 的權威來源。
> User 的角色是審核與下達指令；實際操作與檢查由我執行。

### 9.1 一次性初始化（worktree + 手寫 .gitmodules）

> **rev1 已完成此步驟**，保留本節作為日後新機器重建或破壞後恢復的參考。

```bash
# Step 1：建立 worktree（從 fork 源倉開新分支）
cd fork260509-soybean-admin-base
git fetch origin
git worktree add -b rev1-admin-base-web ../base-web origin/example
cd ..

cd fork260509-soybean-admin-rust
git fetch origin
git worktree add -b rev1-admin-rust-api ../rust-api origin/main
cd ..

# Step 2：把 worktree 分支推到 fork remote（submodule 必須有 url 可指）
cd base-web && git push -u origin rev1-admin-base-web && cd ..
cd rust-api && git push -u origin rev1-admin-rust-api && cd ..

# Step 3：手寫 .gitmodules（不能用 git submodule add，會與 worktree 衝突）
cat > .gitmodules << 'EOF'
[submodule "base-web"]
    path = base-web
    url = https://github.com/miso168net/fork260509-soybean-admin-base.git
    branch = rev1-admin-base-web
[submodule "rust-api"]
    path = rust-api
    url = https://github.com/miso168net/fork260509-soybean-admin-rust.git
    branch = rev1-admin-rust-api
EOF

# Step 4：把 submodule 註冊進 outer git config（讓 git submodule status 認得）
git config -f .gitmodules submodule.base-web.path base-web
git config -f .gitmodules submodule.rust-api.path rust-api
git submodule init

# Step 5：outer 第一次 add 兩個 gitlink + .gitmodules
#   小心：git 會跳 "warning: adding embedded git repository"，正常
git add .gitmodules base-web rust-api
git commit -m "init: register base-web/rust-api as submodules"
```

### 9.2 平時工作流（兩段 commit）

詳見 §6.1。

### 9.3 同步檢查（每次 session 開頭）

```bash
git submodule status
# 範例輸出：
#  abc1234 base-web (heads/rev1-admin-base-web)        ← 開頭空格 = clean
# +def5678 rust-api (heads/rev1-admin-rust-api-2-gxyz) ← 開頭 + = SHA 不一致
# -                  base-web                          ← 開頭 - = 未 init（需 git submodule update --init）
```

行為對照：
- **空格開頭**：outer pin == worktree HEAD，乾淨。
- **`+` 開頭**：worktree HEAD 已超前 outer pin。**主動提示**使用者：「base-web/ worktree 已超前 outer pin，要不要 `git add base-web && git commit -m '...'` 更新？」
- **`-` 開頭**：在新 clone 的機器上，submodule 還沒 init。跑 `git submodule update --init --recursive`。

### 9.4 別台機器 clone 流程

```bash
git clone --recurse-submodules https://github.com/miso168net/fork260509-rev1.git rev1-admin-root
cd rev1-admin-root
git submodule update --init --recursive
# 此時 base-web/ rust-api/ 是「正常 clone」（不是 worktree），但內容相同
# 若要恢復 worktree 模式（需要源倉），手動 init fork 源倉再 worktree
```

### 9.5 升級 fork branch 到最新（拉 upstream rebase 後）

```bash
cd base-web
git fetch upstream                    # upstream 是原 soybeanjs 的 repo
git rebase upstream/example           # 對 rev1-admin-base-web，base 是 example
git push --force-with-lease           # 推自己的 fork（會改寫 history，注意）
cd ..

# 同步 outer pin
git add base-web
git commit -m "bump base-web: rebase on upstream <短 SHA>"
```

### 9.6 故障處理速查

| 症狀 | 原因 | 處理 |
|---|---|---|
| `git status` 在外層顯示 `modified: base-web (modified content)` | worktree 內有未 commit 的變動 | 進 worktree commit，再回外層更新 pin |
| `git status` 顯示 `modified: base-web (new commits)` | worktree HEAD 超前 outer pin | 回外層 `git add base-web && git commit` 更新 pin |
| `git submodule update` 想覆蓋本機改動 | outer pin SHA 與本機 worktree HEAD 不同 | **不要 submodule update**！會 reset worktree。應走「更新 pin」方向 |
| 別人 clone 後 base-web/ 是空的 | 沒跑 `--recurse-submodules` | 補跑 `git submodule update --init --recursive` |
| `warning: adding embedded git repository` | 正常警告，git 提醒這是 gitlink 行為 | 忽略，可用 `git config advice.addEmbeddedRepo false` 永久關掉 |

### 9.7 我（Claude）每次接手前的快速健檢

```bash
# 跑這 4 個指令並回報結果（hook-git-submodule-SOP.sh 自動執行）：
git status                            # 外層狀態
git submodule status                  # submodule SHA 對齊狀況
ls -la base-web/.git rust-api/.git    # 確認還是 worktree（檔而非目錄）
git log --oneline -5                  # 最近 5 個外層 commit，看 pin 變動歷史
```

若發現 worktree 不存在（`.git` 不在），代表使用者可能在新機器或 worktree 被誤刪 — 提示走 §9.1 重建。
