# CLAUDE.md — workspace 指引

> 此檔覆寫並補充全域 `~/.claude/CLAUDE.md`。專案特定規則優先；通用規則沿用全域。
> 本工作區是 `fork260509` 的 **rev1 重建**：相同設計骨幹、不同命名（短名 base-web/rust-api、長名 rev1-）。

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
- **外層 `rev1-admin-root`**：把它們當 submodule 處理（gitlink + `.gitmodules`），每次外層 commit 可能含當下使用的 fork SHA pin 變動，也可能含其他追蹤檔（`CLAUDE.md` / `.specify/` / `specs/` / `docs/` 等）的正常 diff。**`base-web` 與 `rust-api` 這兩列 gitlink 只看到 SHA 字串前後不同**（不展開檔案 diff）；其他追蹤檔仍是一般 git diff。
- **別人 clone 外層**：`git clone --recurse-submodules` 會拉 fork repo 到 base-web/ rust-api/（變正常 clone 而非 worktree，但內容相同）。

**Outer branch 模式**：default branch 為 `rev1-admin-root`；spec-kit 流程啟動時（完整 feature 工作流見 §3），`before_specify` mandatory pre-hook（`speckit.git.feature`，見 `.specify/extensions/git/scripts/bash/create-new-feature.sh`）會從當前 default 衍生短期 `NNN-<short-name>` feature branch（命名與 `specs/NNN-<short-name>/` 目錄對齊），spec docs（`spec.md` / `plan.md` / `tasks.md` / `checklists/`）+ 該 feature 對應的 submodule SHA pin 變動都落在這個 feature branch 上；feature 完成後 merge 回 `rev1-admin-root`。workspace-wide 設定 / 文件變動（`CLAUDE.md` / `.gitignore` / `.specify/` 結構等）可直接落 default branch。worktree（`base-web/` / `rust-api/`）維持各自長期分支不變、**不**為 feature 另開新分支。

兩段式 commit 是日常工作流，詳見 §4 操作手冊。

## 2. 目錄結構

```
fork260509-rev1/                            ← workspace root（傘狀 repo rev1-admin-root 的工作目錄）
├── CLAUDE.md                              ← 本檔（workspace 指引）
├── .gitignore                             ← 排除 fork 源倉與 graphify cache（不排除 base-web/rust-api，它們是 submodule）
├── .gitattributes                         ← LF 強制（避免 Windows host autocrlf 把 .sh/.yaml/.conf 改 CRLF）
├── .graphifyignore                        ← graphify 掃描排除（worktrees / lock files / meta 文件 CLAUDE.md README.md / 等）
├── .gitmodules                            ← base-web / rust-api 的 submodule 設定（指 fork remote）
├── .claude/                               ← Claude Code 設定（hook + settings.json，credentials gitignored）
│   ├── settings.json                      ← SessionStart hook 註冊
│   ├── hook-git-submodule-SOP.sh          ← 每次 session 開頭執行的 SOP 檢查
│   └── skills/                            ← 本地 skill 集合
├── .specify/                              ← spec-kit 安裝結構（templates / scripts / memory / extensions / integrations / workflows）
├── docs/                                  ← 整合設計 / 進度 / brainstorm 文件（見 §7 索引）
├── specs/                                 ← spec-kit feature 規格目錄（每 feature 一個 NNN-<short-name>/；工作流見 §3）
├── graphify-out/                          ← 知識圖譜輸出（外層 git 追蹤 GRAPH_REPORT.md + graph.json + graph.html + obsidian/ 內 notes；只排除個人化/可重產項目）
│   ├── GRAPH_REPORT.md                    ← 含 god nodes / surprises / suggested questions
│   ├── graph.json                         ← 結構化圖譜資料（可被 graphify query 查）
│   ├── graph.html                         ← 互動視覺化（3MB+ 內嵌 JS，刻意 git-tracked）
│   ├── obsidian/                          ← Obsidian vault（5000+ markdown notes + graph.canvas，刻意 git-tracked）
│   │   └── .obsidian/          (gitignored, Obsidian app 本機 config，個人化)
│   ├── manifest.json           (gitignored, --update 增量基準，個人化)
│   ├── cost.json               (gitignored, token 用量帳單，個人化)
│   └── cache/                  (gitignored, LLM 擷取快取，可重產)
├── fork260509-soybean-admin-base/         ← Vue 3 starter，base-web worktree 源倉（gitignored，本機必留）
├── fork260509-soybean-admin-docs/         ← 文件站（gitignored，整合不用，僅參考）
├── fork260509-soybean-admin-nestjs/       ← NestJS backend + Vue frontend（gitignored，整合不用，僅參考）
├── fork260509-soybean-admin-rust/         ← Rust axum + Casbin backend，rust-api worktree 源倉（gitignored，本機必留）
├── base-web/                              ← worktree + submodule（外層記 gitlink SHA）
├── rust-api/                              ← worktree + submodule（外層記 gitlink SHA）
├── docker-compose.yml                     ← outer root compose；dev/prod override = docker-compose.{dev,prod}.yml（見 §8.2）
└── deploy/                                ← 部署支援檔（nginx conf / secrets / dev-certs / cleanup 等；見 §8.2）
```

**關鍵事實**：
- `base-web/` `rust-api/` 是 worktree + submodule 雙重身分（見 §1 與 §4 操作手冊）— 外層 commit 只記 SHA pin、不記檔案 diff；別人 clone 用 `--recurse-submodules`。
- `fork260509-*` 4 個源倉 gitignored，但**本機必須留著**（worktree 源倉）；別台機器若用 submodule clone 重來則不需要這 4 個源倉。
- Vue 源倉 GitHub repo 名稱 = `fork260509-soybean-admin-base`（從原 `fork260509-soybean-admin` rename 而來，舊 URL 仍 redirect）。
- 知識圖譜輸出 `GRAPH_REPORT.md` / `graph.json` / `graph.html` 都只存在 `graphify-out/`；要看就直接開 `graphify-out/GRAPH_REPORT.md`，或瀏覽器開 `graphify-out/graph.html` 看互動圖。
- 外層 git 追蹤：`CLAUDE.md`、`.gitignore`、`.gitattributes`、`.graphifyignore`、`.gitmodules`、`docker-compose*.yml`、`.claude/{settings.json, hook-git-submodule-SOP.sh, skills/}`、`.specify/`（spec-kit 結構）、`docs/`、`specs/`、`deploy/`、`graphify-out/{graph.json, GRAPH_REPORT.md, graph.html, obsidian/}`（graph.html 與 obsidian vault 內 markdown notes 都 tracked）、以及 `base-web` `rust-api` 兩個 gitlink SHA。

## 3. feature 開發工作流（SDD 設計鏈 → TDD 實作）

> 每個 feature 走「**TDD + SDD 混合工作流**」：step 0 brainstorm 定調後，
> **SDD（Spec-Driven Development＝github spec-kit）** 設計鏈產出 spec/plan/tasks，
> 交棒給 **TDD（Test-Driven Development＝superpowers）** 讀 tasks 實作。
> **★ 核心紀律：實作一律用 `superpowers:executing-plans` 起手，從不使用 `/speckit-implement`。**

**step 0 · 前置 brainstorm**（不屬 SDD/TDD 任一階段）
`superpowers:brainstorming` 探索需求與設計、產出初步規格「spec-design」，存
`docs/superpowers/<NNN>-feature-<short-name>.md`；餵給階段 A 的 `/speckit-specify`。

**階段 A · SDD 設計鏈（github spec-kit）**

| 步驟 | 指令 | 產出 |
|---|---|---|
| specify | `/speckit-specify`（input＝step 0 brainstorm 文件）| `specs/<NNN>-<short-name>/spec.md`；`before_specify` pre-hook 同步建 `NNN-<short-name>` feature branch |
| clarify（optional）| `/speckit-clarify` | spec.md 補 `## Clarifications` 段 |
| plan | `/speckit-plan` | `plan.md` + `research.md`／`data-model.md`／`contracts/`／`quickstart.md`；含 Constitution Check（對照 `.specify/memory/constitution.md`）|
| tasks | `/speckit-tasks` | `tasks.md`（dependency-ordered task 清單）|
| analyze | `/speckit-analyze` | spec／plan／tasks 跨檔 consistency 報告（不產檔）|

**═══ 交棒物件：`specs/<NNN>-<short-name>/tasks.md` ═══**

**階段 B · TDD 實作（superpowers）**

實作一律用 **`superpowers:executing-plans`**（**不是 `/speckit-implement`**）：

- `executing-plans` 讀 `specs/<NNN>-<short-name>/tasks.md`；偵測 subagent 可用 → 轉 `superpowers:subagent-driven-development`，把 task 編成執行單元。
- **每單元派 fresh implementer subagent** 實作；完成後**兩階段 review**：① **spec compliance**（對照 `specs/<NNN>-<short-name>/spec.md` 逐項驗、抓缺漏／overbuild）→ ② **code quality**。有 issue → 同一 subagent 修 → 再 review，通過才換下一單元；全單元完成後跑整體 final review。
- 每個 implementer subagent 走 **TDD**：有可獨立測的純函式邏輯 → test-first（red → green）；wiring／形狀對映類 feature 無新純函式測試時 → 由 acceptance 覆蓋（`specs/<NNN>-<short-name>/contracts/` 的 C-V contract：CDP browser smoke + curl + psql），且須在 `tasks.md`／`plan.md` **明示「無單元測試」及理由**（對齊全域 `~/.claude/CLAUDE.md` §4）。
- 收尾：`superpowers:finishing-a-development-branch` → 多段式 commit（§4.1）→ `git merge --no-ff` 回 `rev1-admin-root`。

**branch 紀律**：`/speckit-specify` 起 pre-hook 自動建 `NNN-<short-name>` feature branch、outer 即切於此；spec docs + submodule SHA pin 落此 branch，feature 完成 `merge --no-ff` 回 `rev1-admin-root`（workspace 層級檔如 CLAUDE.md 才直接落 default）。

## 4. Git / submodule 操作手冊

> `base-web` / `rust-api` 的 worktree+submodule 雙重身分操作權威來源 —— 日常兩段式 commit（§4.1）、session 健檢（§4.3）、一次性 / 偶發操作（§4.4–4.7）。User 審核下令、Claude 執行。

### 4.1 兩段式 commit（submodule 模式的核心紀律）

改 `base-web/` 或 `rust-api/` 內檔案後，**永遠是兩段 commit**：

```bash
# === 第一段：在 worktree 內 commit + push 到 fork ===
cd base-web
git status                                    # 確認在 rev1-admin-base-web 分支
git add <files> && git commit -m "..."
git push origin rev1-admin-base-web           # 推到 miso168net/fork260509-soybean-admin-base

# === 第二段：回外層更新 SHA pin ===
cd ..
git branch --show-current                     # 確認當前 outer branch（spec-kit feature 開發中應為 NNN-<short-name>；workspace-level 改動才在 rev1-admin-root）
git status                                    # 應該看到 "modified content" 在 base-web
git add base-web                              # 只 add 目錄即可（記 SHA，不記檔案）
git commit -m "bump base-web to <短 SHA>: <一行描述>"
git push origin "$(git branch --show-current)"   # outer feature branch 或 rev1-admin-root（取決於上面那行）
```

> **Outer branch 預期**：§3 feature 工作流自 `/speckit-specify`（階段 A）起、到 `superpowers:executing-plans` 實作（階段 B）止全程，outer 都應該在對應 `NNN-<short-name>` feature branch 上（由 `before_specify` pre-hook 在 specify 步自動建）。第二段 commit 自然落在這個 feature branch；feature 完成後 merge 回 `rev1-admin-root`。如果跑 spec-kit 流程前發現 outer 不在 `NNN-<short-name>` 上、又即將改 spec / code 相關檔，先讓 pre-hook 跑（或手動 `git switch -c NNN-<short-name>`）對齊。

第二段的 outer commit 訊息**建議帶 SHA 與 fork 提交標題**，以後在外層 log 看得懂：

```
bump base-web to abc1234: <fork 提交主旨一行>
bump rust-api to def5678: <fork 提交主旨一行>
```

> **外層專屬檔的單段 commit**：`CLAUDE.md` / `docs/` / `.specify/` 等非 worktree 追蹤檔的改動，直接在 `rev1-admin-root` 改、commit、push —— 單段、無第二段 SHA pin。

### 4.2 Commit message 規範

**格式**：[Conventional Commits](https://www.conventionalcommits.org/)、**訊息一律中文**。

```
<type>(<scope>): <subject>          ← subject 用中文

<body 可選，中文>

<footer 可選，中文，例如 BREAKING CHANGE / Closes #N>
```

**常用 type**：

| type | 用途 | 範例 |
|---|---|---|
| `feat` | 新功能 | `feat(rust-api): 加入 <endpoint>` |
| `fix` | 修 bug | `fix(base-web): 修正 <模組> 的 <症狀>` |
| `docs` | 純文件改動 | `docs: CLAUDE.md §X 補上 <主題>` |
| `chore` | 雜項（設定、submodule pin、依賴） | `chore: 註冊 base-web/rust-api 為 submodule` |
| `refactor` | 重構（不改功能、不修 bug） | `refactor(rust-api): 抽出 <helper>` |
| `style` | 格式調整（不影響邏輯） | `style: 統一 .env 排版` |
| `perf` | 效能優化 | `perf(rust-api): <fn> 加 lazy init` |
| `test` | 增加測試 | `test(rust-api): <feature> 單元測試` |
| `build` | 建置系統 / 外部依賴 | `build(base-web): 升 vite <舊版> → <新版>` |
| `ci` | CI 設定 | `ci: 加入 <pipeline> workflow` |
| `revert` | 還原 commit | `revert: 撤回 chore: 註冊 submodule` |

**scope 建議**（本專案）：`base-web` / `rust-api` / `deploy` / `docs` / `graphify` / `submodule` 等；可省略。

**兩段式 commit 的 message 慣例**（搭配 §4.1）：

第一段（worktree 內，正常 conventional commit）：
```
feat(rust-api): 加入 <endpoint 或功能>

<body：簡述實作方式、檔案範圍、行數量級>
```

第二段（外層更新 SHA pin，用 `chore(submodule)`）：
```
chore(submodule): bump rust-api 到 abc1234 — <fork 提交主旨>
```

> outer commit 訊息**務必帶上短 SHA 與 fork 提交主旨**，這樣外層 log 一眼看出每次 pin 移動對應哪個改動。

### 4.3 session 開場健檢

每次 session 開頭由 `.claude/hook-git-submodule-SOP.sh`（SessionStart hook）自動執行並回報：

```bash
git status                            # 外層狀態
git submodule status                  # submodule SHA 對齊（行首 空格=clean / +=超前 / -=未 init）
ls -la base-web/.git rust-api/.git    # 確認仍是 worktree（.git 為檔案而非目錄）
git log --oneline -5                  # 最近 5 個外層 commit、看 pin 變動
```

hook 另會 cat `docs/INTEGRATION-CHECKLIST.md` 全檔注入 session context（見 §6）。

`git submodule status` 行首判讀與處置：
- **空格** — outer pin == worktree HEAD，乾淨。
- **`+`** — worktree HEAD 已超前 outer pin。**主動提示** user：「base-web/ 或 rust-api/ worktree 已超前 outer pin，要不要 `git add <dir> && git commit` 更新 pin？」
- **`-`** — 新 clone 的機器、submodule 尚未 init。跑 `git submodule update --init --recursive`。

若 worktree 的 `.git` 不存在（被誤刪或在新機器）→ 提示走 §4.4 重建。

### 4.4 一次性初始化（worktree + 手寫 .gitmodules）

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

### 4.5 別台機器 clone 流程

```bash
git clone --recurse-submodules https://github.com/miso168net/fork260509-rev1.git rev1-admin-root
cd rev1-admin-root
git submodule update --init --recursive
# 此時 base-web/ rust-api/ 是「正常 clone」（不是 worktree），但內容相同
# 若要恢復 worktree 模式（需要源倉），手動 init fork 源倉再 worktree
```

### 4.6 升級 fork branch（拉 upstream rebase 後）

> ⚠️ **前置設定**：fork 源倉需要設定 upstream remote 指向 soybeanjs 官方。**rev1 目前機器已設好**（含 push 保護）；若日後新機器或重建源倉，補設步驟：
> ```bash
> cd fork260509-soybean-admin-base
> git remote add upstream https://github.com/soybeanjs/soybean-admin.git
> git remote set-url --push upstream no_push    # 保護：避免誤推到 upstream
> cd ../fork260509-soybean-admin-rust
> git remote add upstream https://github.com/soybeanjs/soybean-admin-rust.git
> git remote set-url --push upstream no_push
> cd ..
> ```
> （fetch 前用 `git remote -v` 確認：push 應顯示 `no_push`、fetch 應顯示 soybeanjs URL。）

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

### 4.7 故障處理速查

| 症狀 | 原因 | 處理 |
|---|---|---|
| `git status` 在外層顯示 `modified: base-web (modified content)` | worktree 內有未 commit 的變動 | 進 worktree commit，再回外層更新 pin |
| `git status` 顯示 `modified: base-web (new commits)` | worktree HEAD 超前 outer pin | 回外層 `git add base-web && git commit` 更新 pin |
| `git submodule update` 想覆蓋本機改動 | outer pin SHA 與本機 worktree HEAD 不同 | **不要 submodule update**！會 reset worktree。應走「更新 pin」方向 |
| 別人 clone 後 base-web/ 是空的 | 沒跑 `--recurse-submodules` | 補跑 `git submodule update --init --recursive` |
| `warning: adding embedded git repository` | 正常警告，git 提醒這是 gitlink 行為 | 忽略，可用 `git config advice.addEmbeddedRepo false` 永久關掉 |

## 5. 不要做的事

- ❌ 不要在外層 `rev1-admin-root` repo `git add fork260509-*/`（4 個源倉 gitignored，會變 embedded git）。`base-web/` `rust-api/` **可以** add（它們是 submodule，唯一正確方式就是 `git add base-web` 記 SHA pin）。
- ❌ 不要 `git submodule add ../<...> base-web`：這會嘗試 clone 進 base-web/、與既有 worktree 衝突。submodule 設定要**手寫 .gitmodules**（見 §4.4）。
- ❌ 不要在 worktree 裡跑 `git push` 不指定 remote/branch — `cd base-web` 預設推到 fork260509-soybean-admin-base，可能誤推到非預期分支；用 `git push origin rev1-admin-base-web` 顯式指定。
- ❌ 不要忘記第二段 commit：worktree 內改完 push 完，**一定要回外層 `git add base-web && git commit`** 更新 pin，否則外層下次 commit 才會包進去（容易混淆 SHA 對應關係）。
- ❌ 不要直接編輯 `fork260509-soybean-admin-*/` 四個源倉的檔案：base 與 rust 兩個應透過 `base-web/` / `rust-api/` worktree 改；docs / nestjs 兩個源倉不在整合範圍（nestjs 已於 F14 退場、現為 DESIGN-B rust-only）。
- ❌ 不要跳過 spec-kit `.specify/extensions.yml` 內 `optional: false` 的 mandatory pre-hook（如 `before_specify` → `speckit.git.feature` 為 feature 開短期 outer branch）。即使當前 outer branch 是 `rev1-admin-root`（傘狀 monorepo default），spec-kit feature branch 模式**仍是預期工作流**（見 §1 Outer branch 模式）。pre-hook 只在 local 建分支、**不** push，符合「push 前須 user 同意」紀律（§4.1）。

## 6. 進度追蹤

整合進度的單一真相在 [`docs/INTEGRATION-CHECKLIST.md`](docs/INTEGRATION-CHECKLIST.md) —— Current Focus（現狀）/ Follow-up Backlog（衍生工作）/ 已完成里程碑 / Roadmap & Phase 狀態 / 跨 feature 待驗證項。每 session SOP hook（`.claude/hook-git-submodule-SOP.sh`）自動 cat 全檔注入（見 §4.3）。

下方 `<!-- SPECKIT -->` marker 區為 spec-kit 維護的當前 feature 快照 —— **marker 由 spec-kit 使用，勿刪**：

<!-- SPECKIT START -->
- **Active feature**: `037` `role-authorization-completion`（W-FW6、W-WEBUI follow-up 軌道第三個 feature）—— spec-kit 設計鏈進行中：specify / clarify / plan 完成，plan `specs/037-role-authorization-completion/plan.md`；待 `/speckit-tasks`。
- **Phase**: 設計中 — brainstorm(`docs/superpowers/037-feature-role-authorization-completion.md`)+ spec(16/16 quality checklist 全通過、0 NEEDS CLARIFICATION) + clarify(掃描無歧義、未改 spec) + plan(Constitution Check 5/5 PASS、Phase 0 research R-Q1~R-Q3 resolved — R-Q1 base-web service function 用 primitive generic、0 typings 改動;R-Q2 UPDATE casbin_rule 後需主動呼叫 notify_casbin_changed 觸發 W-F11 redis pub-sub reload;R-Q3 既有 casbin_rule 0 ptype='g' rule、N4 同步簡化為單一 ptype='p' SQL)。整併 W-FW4-N2(role home 持久化:sys_role 加 home_route_name VARCHAR + 2 systemManage alias 端點 + base-web menu-auth-modal home 接真 API)+W-FW4-N3(assign_routes/users audit gap;不動 assign_permission 留 W-FW8)+W-FW3-N1(role code 安全改名:rust update_role detect code 變動同步 casbin_rule + notify_casbin_changed + 拿掉 W-FW3 code-lock + drawer 不改)。N1 button-auth 推遲 W-FW8。比照 W-FW5/W-FW7。
- **Previous features**: W-F1 merge `430ada9` / W-F2 merge `ac79ed0` / W-F3 merge `04671d0` / W-F4 merge `ab658d7` / W-F5 merge `dff14c2` / W-F7 merge `62b3475` / W-F6 merge `5e38030` / F6 merge `a431215` / W-FA1 merge `b095d55` / W-FA2 merge `c5b7840` / W-FA3 merge `f23f38e` / F10 merge `8f0e84c` / F10.1 merge `48b70e6` / F10.2 merge `851ec79` / F11 merge `81ecb0d` / F9 merge `b2f910c` / F7 merge `136b1eb` / F7.1 merge `efe910e` / F7.2 merge `476ca88` / F8 merge `c2b0912` / W-F11 merge `d2d4c4c` / F12 merge `86e56e5` / F13 merge `4e9cf07` / F14 merge `1f20a0d` / 030 merge `0ed2e85` / 031 merge `a09d316` / 032 merge `8ccc4b4` / 033 merge `729dbf9` / 034 merge `ff5ea63` / 035 merge `7020899`(均已 push、acceptance PASS;F13 為 DESIGN-A §6.1 Phase 5 P5 第一個 feature — rust 補實作 POST /auth/refreshToken refresh token 輪替;F14 為 P5 第二個也是最後一個 feature — nestjs 退場、DESIGN-B(rust-only)形態正式生效、DESIGN-A §6.1 全 14 feature 收尾;031 為 W-WEBUI 軌道第一個 feature — base-web user CRUD 接線、Constitution v1.1.0「W-WEBUI 受管例外」首次行使、11/11 C-V acceptance PASS;032 為 W-WEBUI 軌道第二個 feature — base-web menu CRUD 接線、Constitution v1.1.0「W-WEBUI 受管例外」第二次行使、11/11 C-V acceptance PASS、含 sys_menu id sequence desync + parentId 字串/數字落差 2 個 bug fix;033 為 W-WEBUI 軌道第三個 feature — base-web role CRUD 接線、Constitution v1.1.0「W-WEBUI 受管例外」第三次行使、14/14 C-V acceptance PASS、含 update_role status-drop 修正 + roleCode transform-layer code-lock 2 個 role-edit 正確性處理;034 為 W-WEBUI 軌道第四個也是最後一個 feature — base-web 角色菜單授權接線、Constitution v1.1.0「W-WEBUI 受管例外」第四次行使、13/13 C-V acceptance PASS、含 assign_routes 空清單 clear-all + 成功訊息 optional chaining 2 個 code review 修正;035 為 W-WEBUI follow-up 軌道第一個 feature — 補完 W-FW1 留下的 user→roles 指派 + 密碼 UX、Constitution v1.2.0「W-WEBUI 受管例外擴 W-FW1–W-FW7 + §4 最小 UI 新增」首次行使、20/20 C-V acceptance PASS、含 change_password audit actor 型別 build-gate 修正 + user 抽屜角色欄 mock scaffolding 殘留去重 2 個收尾修正;036 為 W-WEBUI follow-up 軌道第二個 feature — 補完 W-FW2 留下的 menu 欄位持久化缺口 W-FW2-N1、sys_menu 加 query/buttons (JSONB) + fixed_index_in_tab (INTEGER) 3 欄、entity 同步、雙向 DTO 接通寫入+admin CRUD 讀回+runtime 路由 meta、buttons 不進 RouteMeta(Q2 拍板)、Constitution v1.2.0「W-WEBUI 受管例外」第二次行使、20/20 C-V acceptance PASS、base-web 0 改動 R-Q1/R-Q2 已驗證 modal UI 與 null 防護齊備、既有 audit 路徑自動涵蓋無需新邏輯) / 036 merge `dd7de46`
<!-- SPECKIT END -->

## 7. 整合設計文件索引

rev1 整合的研究與設計文件（authoritative，本檔不重複內容）：

- **研究** — [`docs/INTEGRATION-RESEARCH.md`](docs/INTEGRATION-RESEARCH.md)
- **設計** — DESIGN-A 過渡 rust+nestjs [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) ／ DESIGN-B 現行 rust-only [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) ／ DESIGN-W-DEPLOYMENT [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) ／ DESIGN-W-WEBUI [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](docs/INTEGRATION-DESIGN-W-WEBUI.md)
- **原則** — [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- **進度** — [`docs/INTEGRATION-CHECKLIST.md`](docs/INTEGRATION-CHECKLIST.md)（見 §6）
- **brainstorm 決策** — `docs/superpowers/<NNN>-feature-<short-name>.md`（見 §3 step 0）

## 8. 操作參考與工具

> 此節為 reference data（不是 principle、不是 checklist），放在 CLAUDE.md 是為了讓我每次 session 都直接看到、不用 Read 額外檔案 — 特別是 CDP 自動化登入時要立刻有密碼可用。

### 8.1 預設帳號（dev 用）

依 `rust-api/migration/src/datas/m20241024_033005_insert_sys_user.rs`：

| 帳號 | 角色 | 密碼 |
|---|---|---|
| `Soybean` | 超級管理員 | `123456` |
| `Administrator` | admin | 同上 |
| `GeneralUser` | 一般 | 同上 |

3 個 user 共用同一個 argon2id 雜湊；plaintext = `123456`（migration 檔案直接埋的測試帳號雜湊，逆推驗證過）。F5.1 auth-login feature 已實機驗證 `123456` 可登入。

### 8.2 對外 endpoint 與 port 配置

> 以下為 rev1 現行 port 配置（刻意用 1XXXX 前綴避開 fork260509 既有 port，方便兩個 workspace 並存）；已落地於 `deploy/` 的 docker-compose、dev stack 實機運行中。

| 角色 | 參考專案 fork260509（既有） | rev1（現行） |
|---|---|---|
| Web (對外) | `:8080` | `:11080` |
| Rust API（內部，僅 dev 期間 host 直連用） | `:10001` | `:11081` |
| Postgres | host `:5432` ↔ container `:5432` | container 內仍 `:5432`（不改）；host 暴露 `15432:5432` |
| docker compose project name | `new-admin`（預設由目錄名衍生） | `rev1-admin`（透過 `COMPOSE_PROJECT_NAME` 環境變數設定） |

**啟動模式**（3 種；TLS 結構已就位）：
- **dev**（`-f -f dev.yml`）：127.0.0.1 loopback、HTTP `:11080` + HTTPS `:11443`（自簽 cert）+ 直連 backend port `:11081 :15432 :16379`（範例見 §8.2.1）
- **prod baseline**（`-f -f prod.yml`、不帶 `--profile prod`）：0.0.0.0 對外、80 強制 redirect 443、acme.sh 不啟（需先 seed cert into named volume `front_nginx_certs`）
- **prod + acme**（`-f -f prod.yml --profile prod`）：同 prod baseline + acme.sh skeleton（實際 cert acquisition 留 W-F6b、需真實 domain + DNS provider）

#### 8.2.1 dev / prod 啟動命令範例

```bash
# === 第一次：生成 dev 自簽 cert（只需跑一次、每年 renew）===
bash deploy/generate-dev-cert.sh

# === dev 啟動（暴露 4 個 host port、限 127.0.0.1、HTTP + HTTPS）===
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# === host 機驗證（WSL2 mirrored networking 下從 Windows host 亦可）===
curl -fsS http://127.0.0.1:11080/health                              # HTTP front-nginx self
curl -kfsS https://127.0.0.1:11443/health                            # HTTPS front-nginx self
curl -fsS http://127.0.0.1:11081/health                              # rust-api 直連
pg_isready -h 127.0.0.1 -p 15432                                    # postgres
redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" --no-auth-warning ping  # redis

# TLS handshake + cert SAN 驗
openssl s_client -connect 127.0.0.1:11443 -servername localhost </dev/null 2>&1 | grep "subject="
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName

# === prod baseline 啟動（0.0.0.0 對外、80 redirect 443、無 acme）===
# 先 seed cert 進 named volume（W-F6 階段；W-F6b 後 acme 自動 issue）：
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"

# 啟 prod baseline：
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait

# === prod + acme（7 service、acme skeleton sanity 用）===
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose exec acme acme.sh --version    # sanity check
```

> WSL2 NAT mode 不可用 `127.0.0.1` — 設 `.wslconfig` `[wsl2] networkingMode=mirrored`（Win11 22H2+ 預設）、或用 `wsl hostname -I` 拿 WSL IP。
> 實際 acme.sh cert acquisition / renew 流程留 W-F6b（需公網 + 真實 domain + DNS provider creds）。

### 8.3 知識圖譜（graphify）

**使用方式**：
- 查問題：在 workspace root 執行 `graphify query "你的問題"` — 走 BFS 預設、`--dfs` 改 DFS、`--budget N` 限 token
- 解釋節點：`graphify explain "節點名"`
- 找路徑：`graphify path "節點A" "節點B"`
- 增量更新：`graphify update`（會用 `manifest.json` 比對變更）

> 📖 **圖譜現況統計** 與 **已知抽取限制** 等細節 — **推論前必讀** [`docs/GRAPHIFY-NOTES.md`](docs/GRAPHIFY-NOTES.md)。

**graphify 守則**：
- 重跑前先讀 `graphify-out/cost.json` 看是否真有需要 —— 多數時候 `graphify update`（增量）即可。
- 不要改 `graphify-out/cache/` —— graphify 內部 LLM 擷取快取，手改破壞下次 update 的 diff。
- 新功能設計問題先用 `graphify query "..."` 試 —— 但 NestJS / Vue component 部分警覺圖譜盲點（見 `docs/GRAPHIFY-NOTES.md`），且 base-web 來源是 example 分支、與圖譜抓取點不一致。
