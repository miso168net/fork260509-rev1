<!--
Sync Impact Report (2026-05-23)
================================================================
Version change: 1.3.0 → 1.4.0 (MINOR — 受管例外授權模型從「具名列舉」改為「DESIGN 文件 = 軌道權威」)
Modified principles:
  - IV. base 不改動邊界 — 受管例外條款授權模型轉換:
    (a) 舊：列舉具名 feature W-FW1–W-FW8（每加新 W-FW 都需 bump constitution，
        v1.1.0 / v1.2.0 / v1.3.0 三次 amendment 均為列舉延伸）
    (b) 新：W-WEBUI 軌道**整體**為受管例外；軌道範圍以
        `docs/INTEGRATION-DESIGN-W-WEBUI.md`（含其 §5 / §7 / 後續 amendment）
        為單一真相；新 W-FW 子項只要在該 DESIGN 文件內登記即落入軌道、
        不再需要 amend constitution
    (c) 范圍邊界仍由 `INTEGRATION-DESIGN-W-WEBUI.md §4`（含其 amendment）
        嚴格限定（v1.2.0 起的現況不變）
    (d) 不准動清單（typings / column render / router / store / i18n / 版面）
        與兩段式 commit 紀律**皆不變**
    其餘 principle（I / II / III / V）皆**不變**
Added sections: None
Removed sections: None
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check runtime
    消費 principle、無需模板改動
  - ✅ .specify/templates/spec-template.md — 無直接 constitution ref
  - ✅ .specify/templates/tasks-template.md — 無直接 ref
  - ✅ .specify/templates/checklist-template.md — generic、無 change
  - ✅ docs/INTEGRATION-DESIGN-W-WEBUI.md — 自身內容不需改動；本 amendment
    把它**升格為**軌道範圍權威（即「在此文件 §5 / §7 / 後續 amendment 登記
    的 W-FW 子項都自動落入受管例外」）；未來新增 W-FW 子項只需在此 DESIGN
    文件內登記、不需動 constitution
  - ✅ docs/INTEGRATION-CHECKLIST.md — 無直接引用此條款、無需改動
  - ✅ CLAUDE.md — 無直接引用此條款的具名列舉、無需改動
Follow-up TODOs: None
Prior reports:
  - (2026-05-23) 1.2.0 → 1.3.0: 受管例外列舉延伸（W-FW1–W-FW7 → W-FW1–W-FW8）
  - (2026-05-22) 1.1.0 → 1.2.0: 受管例外條款範圍擴充
    (W-FW1–W-FW4 → W-FW1–W-FW7、准動範圍擴「最小 UI 新增」)
  - (2026-05-21) 1.0.0 → 1.1.0: 新增受管例外條款
  - (2026-05-14) (initial template) → 1.0.0 initial ratification
================================================================
-->

# rev1 整合（rev1 Integration） Constitution

## Core Principles

### I. RBAC Fail-safe（Casbin 後端強制）

後端 Casbin enforce 為 authorization 決策的唯一權威來源。

- 後端 MUST 對每個受保護 endpoint 執行 Casbin enforcement；通過才回應業務邏輯
- 前端 menu 隱藏 / button disable 為 UX 優化，**不允許**作為 access control
- `/route/getUserRoutes` 返回的 menu 樹由後端依 Casbin policy × role-menu 關聯計算；前端僅 render
- Casbin policy 表（`casbin_rule`）的**主寫權威唯一為 rust**；其他服務（如 DESIGN-A 過渡期的 nestjs）read-only
- 抽離項（未實作完整功能的 endpoint）以 Casbin policy 多數 role deny / test 或 demo role allow 的方式 gate；**不在 nginx 層砍 endpoint**

**Rationale**: 前端 access check 可被繞過（DevTools 改 state、手構 request）。Casbin 後端決策是唯一可信來源。Casbin policy 多寫入點容易不同步，rust 為單一主寫者降低 invalidation 複雜度。

### II. Soft Delete + 全域 Audit Log（NON-NEGOTIABLE）

所有資料變動行為必有 audit 紀錄；DELETE 一律為 soft delete。

- 所有 DB `DELETE` MUST 為 soft delete（標 `deleted_at TIMESTAMPTZ`）；**禁止**物理 DELETE
- 物理刪除 MUST 由獨立 cleanup job 執行；cleanup 自身**也寫** audit（actor=`cleanup_job`）
- 所有寫入操作（INSERT / UPDATE / SOFT_DELETE / HARD_DELETE / RESTORE）MUST 寫 `sys_operation_log` 一筆記錄（who / when / what entity / before & after payload）
- 業務寫入 + audit 寫入 MUST 在**同一 DB transaction**（一起 commit / rollback）；audit 寫失敗即整體 rollback；不允許 application-level retry「補寫 audit」
- `sys_operation_log` **不 soft delete、不 cleanup、永久保留**；retention 透過 partition + cold storage 處理
- SELECT 操作預設 MUST 過濾 `WHERE deleted_at IS NULL`；Sea-ORM 透過 scoped finder trait 強制
- 跨資源 side effect（redis pub-sub / SMS / 外部 API）成敗**不在** audit log 範疇；其一致性靠 Outbox 模式 / TTL fallback / 訂閱者 health check 等獨立機制處理

**Rationale**: admin-heavy + RBAC 中心系統需可追溯性（forensics / compliance）。寫入量 2N 的代價以 audit 完整性換取，rev1 低 throughput 場景接受。soft delete 配 audit 提供完整變動歷史 + 復原能力。

### III. 嚴版禁 Forward + 單一職責

後端服務之間禁止 HTTP/RPC 呼叫；跨服務狀態同步只能透過共用基礎設施。

- 後端服務（rust / 過渡期的 nestjs）**禁止** HTTP/RPC 呼叫對方 API
- 跨服務狀態同步 MUST 走共用 postgres（事實源）或 redis pub-sub channel
- 每個 endpoint 只由一個後端負責 enforcement；nginx config 為 endpoint ownership 唯一權威
- nginx config 內每個 location MUST 明確標示 backend owner（comment 或 upstream block）
- DESIGN-A 過渡期的 nestjs-bound location MUST 包在 `# >>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點 <<<<<` 與 `# <<<<< TRANSITIONAL END >>>>>` marker block 內

**Rationale**: 後端間 HTTP forward 引入循環依賴、雙重 enforcement 風險、failure isolation 困難。共用 DB + redis 已是事實源、足夠協調；服務獨立部署 / 重啟 / 升級的能力比「順手 forward」的便利更值得。

### IV. base 不改動邊界

base-web source code 為「對齊目標」；後端與 nginx 須適應 base 既有 API 期望。base 不改動為**預設原則**；唯一例外為受管的 W-WEBUI 軌道（見下）。

- **預設不動**：base-web 的 `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/router/` / `src/store/`
- **可動**：`.env` / `.env.dev` / `.env.prod`（application-level config 層）
- base example 中 mock（`src/service-alova/mocks/`）保留但 prod 不啟（既有 `import.meta.env.DEV` gate 隔離）
- 所有 API 路徑 / 方法 / payload 形狀 GAP MUST 由**後端適應**（如 `/systemManage/*` alias router 重用既有 service）；base 不修
- response shape 對齊：rust HTTP **永遠**回 200 + body `code` 為 business code（路線 II）；camelCase 透過 rust struct 加 `#[serde(rename_all = "camelCase")]`
- success code 對齊由 base `.env` 微調（`VITE_SERVICE_SUCCESS_CODE=0`）+ rust handler 統一改 error code path

**受管例外 — W-WEBUI 軌道**：唯一得修改 base-web source 的例外為 **W-WEBUI 軌道**（[`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md)）：

- W-WEBUI 軌道**整體**為受管例外；**軌道範圍以 [`INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) 整份文件為單一真相**——含 §5 主軌（目前 W-FW1–W-FW4）、§7 follow-up 切分（目前 W-FW5–W-FW7，含 W-FW6 brainstorm Q1 拆分新增的 W-FW8），以及未來在該文件 §5 / §7 / 後續 amendment 內登記的新 W-FW 子項。落入軌道的 feature **得修改 base-web source**，範圍受 `INTEGRATION-DESIGN-W-WEBUI.md §4`（含其後續 amendment）嚴格限定；§4 為 base-web 准動範圍的唯一細節權威
- 新 W-FW 子項 MUST 先在 `INTEGRATION-DESIGN-W-WEBUI.md` 內登記（§5 主軌 / §7 follow-up / 或新增子節）；登記本身**不**觸發本憲法 amendment（避免「每加新 W-FW 都需 bump constitution」的歷史擴張）
- 准動範圍以接線為主 —— 把既有 stub 表單的 `handleSubmit` / list 頁 delete handler 接到 service API、補 `src/service/api/*.ts` 寫入 function；並得在 §4 明文授權下，為接通既有後端能力做**必需的最小 UI 新增**（如表單欄位、既有占位頁補面板）
- W-WEBUI 軌道**仍不得**改動 base-web 的型別定義（`src/typings/`）、表格 column render 邏輯、`src/router/` / `src/store/`、i18n key、版面重構 / 設計風格
- 此例外**僅適用 W-WEBUI 軌道**；軌道外所有 feature 的 Constitution Check 對 base-web source 改動仍 MUST 為 0 diff
- W-WEBUI 軌道對 base-web 的修改一律走兩段式 commit（base-web worktree → push fork → outer 更新 SHA pin）

**Rationale**: base example 是上游持續演化的 starter；rev1 為使用者，不為改寫者 — 此立場在「後端適應 API GAP」範疇內成立，使未來 base 升級（pull upstream rebase）阻力最小。但 base example 的管理後台操作表單本質為未接線的 UI stub，僅靠後端適應無法讓其運作；F14 cutover 後 rev1 成為自有產品，base-web 即 rev1 自有前端，補接線為必要的產品工作而非「改寫上游」。W-WEBUI 為此設**受控例外**：例外範圍明文受限（接線為主，並僅在 §4 明文授權下做必需的最小 UI 新增，不碰型別 / column render / router / store / 版面重構），使「預設不動 base」對其餘所有 feature 維持完整效力，同時不讓管理後台永久停在 demo 殼。

### V. 漸進收縮（DESIGN-A 過渡 → DESIGN-B 終局）

DESIGN-A（rust + nestjs）為過渡形態；DESIGN-B（rust-only）為終局目標。

- nestjs 為過渡性補位，不擴張其 endpoint 範圍；DESIGN-A → DESIGN-B 過程中只縮減不擴增
- 每個 DESIGN-A 階段決策 MUST 通過「未來 nestjs 拔掉時順嗎」濾鏡；不通過則重新設計
- DB schema / JWT secret / sys_tokens schema / Casbin policy schema / redis pub-sub channel 名 — 都由 rust 主導 / 共識；nestjs 退場時 zero schema 改動
- nestjs source code **不改**；只用既有 build artifact / docker image（per [`fork260509-soybean-admin-nestjs/backend/Dockerfile`](../../fork260509-soybean-admin-nestjs/backend/Dockerfile)）
- DESIGN-A → DESIGN-B 遷移路徑：只動 nginx config（刪 TRANSITIONAL block + 改路由）+ docker-compose（移除 nestjs service）；DB / 應用層 / 業務 code **零**改動
- 抽離項升級時（例如 SMS captcha 接真實服務）只動 rust handler 與 Casbin policy；nginx / 前端 / DB schema 零改動

**Rationale**: rev1 長期方向為單語言後端（Rust + Casbin），避免雙 stack 各自演化的維運負擔。nestjs 過渡期間的所有決策需可逆轉、無僵化耦合，否則「過渡」會變「長期共存」。

## 架構約束（Architectural Constraints）

以下約束為 spec-kit feature 設計時的硬性邊界；違反需在 `Complexity Tracking` 表內合理化：

- **部署形態**：docker 容器內編譯（multi-stage Dockerfile）+ docker-compose 單機運行；k8s 遷移為 future scope
- **資料庫**：PostgreSQL 為唯一持久狀態權威；rust 主導所有 migration；nestjs（DESIGN-A 期）read-only 對齊 schema
- **快取與 pub-sub**：redis 為**必要依賴**（DESIGN-B v1 即支援 rust 多 instance 水平擴展）；Casbin policy 變更走 `casbin:policy:invalidate` channel；單 instance 部署亦預設啟用 pub-sub 機制（self-publish/self-subscribe 無 harm）
- **TLS**：對外流量 MUST 走 TLS；prod 用 Let's Encrypt（acme.sh auto-renew），dev / staging 用自簽（提供生成腳本）；HTTP only 僅限本機 dev
- **Secret 注入**：Docker secrets + `_FILE` pattern 為 prod 預設機制；secret **不進** process env；dev 可用 envvar fallback（透過 `_FILE` 缺省）
- **DB migration trigger**：init container 模式（rust-api 共 image、不同 entrypoint）；migration container 用獨立 write-schema credential，rust runtime 用低權限 data-only credential
- **Port 規劃**：對外 port 用 `1XXXX` 前綴避開 fork260509 既有 port（具體值見 `CLAUDE.md §8.2` 與 [`DESIGN-W §6.1`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)）
- **Observability**：promtail → Loki + grafana（logs）+ prometheus + grafana（metrics）為**必要**stack；prod 必啟，dev 可選
- **結構化 log**：rust / nestjs / nginx 統一 JSON 格式，必要欄位含 `timestamp / level / service / request_id / msg`
- **Backup**：pg_basebackup + WAL archive（PITR）為 prod 必要；audit log 表 partition by month；retention policy 透過 spec-kit feature 拍板
- **背景工作**：cleanup-job（cron）+ outbox-worker（service）+ backup-job（cron）為 prod 必要；獨立最小權限 credential
- **CI/CD platform**：DESIGN 層不綁定 platform；spec-kit feature 階段拍板（推薦 GitHub Actions + ghcr.io，鑒於源倉位置）

## 開發流程（Development Workflow）

- **spec-kit 流程紀律**：所有 feature 在 implement 前 MUST 通過 `speckit-specify` → `speckit-clarify`（必要時）→ `speckit-plan` → `speckit-tasks` 流程；spec/plan 階段執行 Constitution Check
- **Constitution Check 失敗處理**：plan 階段若違反本憲法任一 principle，MUST 在 `plan.md` 的 `Complexity Tracking` 表內陳述 violation + rationale + simpler alternative rejected 理由；無法陳述合理性 → 重新設計而非繞過
- **兩段式 commit 紀律**（base-web / rust-api worktree）：worktree 內 conventional commit → push fork → outer repo `git add <submodule>` 更新 SHA pin + 第二段 commit；詳見 `CLAUDE.md §4.1`
- **Commit message**：[Conventional Commits](https://www.conventionalcommits.org/) 格式，**subject 用中文**；body 必要時補 why；footer 含 `Co-Authored-By` 標示協作來源
- **Push 確認紀律**：push 到 remote 之前 MUST 取得 user 明確授權（沿用全域 `~/.claude/CLAUDE.md §5`）；branch protection 例外見全域守則
- **TLS 紀律**：dev 環境可用自簽 cert；prod / staging **不容**跳過 TLS（HTTP only 在 prod 為違憲）
- **DESIGN 文件權威**：rev1 整合相關設計決策以 [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md) / [`-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) / [`-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) / [`-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md) 為權威；spec-kit feature 階段 `spec.md` 引用對應 DESIGN 章節
- **抽離項升級紀律**：抽離項 stub 升級為實作時 MUST 同步：(a) 換真 handler 實作；(b) Casbin policy 擴 allow 對象；(c) audit log 與 soft delete 自動繼承 §1.5（無需特別配置）；(d) nginx / 前端 **零改動**

## Governance

本憲法對 rev1 整合所有 spec-kit feature 開發具強制效力。

- **修訂流程**：任何 principle 修改 MUST 透過 git commit 紀錄；MAJOR 修改 MUST 取得 user 明確同意
- **版本規則**（semver）：
  - **MAJOR**：移除 / 顛覆性重定義 principle、刪除 mandatory section
  - **MINOR**：新增 principle 或 section、實質擴充指引
  - **PATCH**：澄清 / 字詞 / typo / 非語義修正
- **Compliance Review**：每個 spec-kit `/speckit-plan` 執行時自動進 Constitution Check；違反需在 `plan.md` 的 `Complexity Tracking` 表內合理化
- **依賴文件權威關係**：本憲法**補充而非取代**以下文件：
  - [`docs/INTEGRATION-RESEARCH.md`](../../docs/INTEGRATION-RESEARCH.md)：事實 + GAP 盤點 + 策略候選
  - [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md)：DESIGN-A 拍板
  - [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md)：DESIGN-B 拍板（最終形態）
  - [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md)：部署統合
  - [`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../../docs/INTEGRATION-DESIGN-W-WEBUI.md)：W-WEBUI 軌道拍板（base-web 管理後台接線、Principle IV 受管例外範圍）
- **衝突解決**：Constitution 與 DESIGN 文件衝突時，以本憲法為最終權威；DESIGN 文件如有不一致需同步修正
- **Runtime guidance**：日常開發決策參考 `CLAUDE.md`（workspace）+ `~/.claude/CLAUDE.md`（全域）；當 runtime guidance 與本憲法衝突，以本憲法為準

**Version**: 1.4.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-23
