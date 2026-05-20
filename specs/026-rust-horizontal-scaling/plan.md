# Implementation Plan: W-F11 — rust-horizontal-scaling

**Branch**: `026-rust-horizontal-scaling` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/026-rust-horizontal-scaling/spec.md`

## Summary

Phase W deploy roadmap Phase W-4(P4)— rust-api 水平擴展能力。單一 feature 一次交付三塊互相依賴的工作:

- **A. Casbin redis pub-sub 一致性**:rust-api 新增 publisher(`notify_casbin_changed()`、`server_global`)+ subscriber 背景 task(`server_initialize` 的 `casbin_sync_initialization`),在每個 Casbin policy 異動點 publish 到 redis channel `casbin:policy:invalidate`、收到訊息對記憶體 `CachedEnforcer` 做 `load_policy()` full reload。
- **B. compose 多 replica**:`docker-compose.prod.yml` 給 rust-api 加 `deploy.replicas: 2`;dev 維持單實例。
- **C. nginx upstream auto-discovery**:`default.conf.prod` 的 `rust_api` upstream 改 `resolver` + `server rust-api:11081 resolve`。

A 為 B/C 正確運作的硬前提 — 沒有 A,多 replica 下各 instance 記憶體 enforcer diverge、nginx round-robin 到 stale instance 會錯誤授權。

技術途徑:rust-api worktree ~7-8 file(pub-sub publisher + subscriber task + 3 個 publish call-site instrumentation + 模組註冊)+ outer 2 個配置檔(`docker-compose.prod.yml` + `default.conf.prod`)。無 DB schema 改、無 migration、無 Casbin seed;base-web / nestjs / dev compose / 共用 nginx conf 零改動;acceptance = curl + psql + `docker compose exec`(prod stack、capture→mutate→verify→restore);兩段式 commit。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api 既有 workspace、不指定版本)
**Primary Dependencies**: `redis` 0.32(async pub-sub、既有依賴)、`casbin` 2.10 feature `cached`(`CachedEnforcer`、既有)、`axum-casbin`(`CasbinAxumLayer`、既有)、`tokio` 1(背景 task spawn、既有);docker-compose v2(`deploy.replicas`);nginx 1.27.5(upstream `resolve`)
**Storage**: PostgreSQL — W-F11 **不改 schema、不增表、無 migration**;redis pub-sub channel `casbin:policy:invalidate`(非持久化、at-most-once 廣播)
**Testing**: 無 rust unit test(pub-sub publish/subscribe 為 IO 邊界、無可獨立測之純函式;coherence 屬 stack-level 行為)— per spec FR-019;acceptance = curl + psql + `docker compose exec`(per FR-020)
**Target Platform**: Linux container(rust-api docker image;prod stack `deploy.replicas: 2` 多實例)
**Project Type**: web-service backend(rust-api worktree)+ 部署配置(docker-compose + nginx)
**Performance Goals**: N/A — Casbin invalidate 傳播為 redis pub-sub(sub-second)、`load_policy()` 對 ~30 row policy 集成本可忽略
**Constraints**: base-web + nestjs 0 diff(Constitution IV)、`docker-compose.dev.yml` + 共用 `default.conf` 0 diff、無 DB schema 改、無 migration
**Scale/Scope**: rust-api worktree ~7-8 file(publisher ~30-40 LOC + subscriber ~60-80 LOC + 3 call-site ~6 LOC + 註冊 + spawn 點)+ outer 2 配置檔(~10 LOC);prod replica 數 = 2

無 NEEDS CLARIFICATION — brainstorm 5 拍板點 saturated、`/speckit-clarify` 0 question(taxonomy 全 Clear);6 個 implement-time R-Q 已由 Phase 0 research 解決。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS**(W-F11 強化此原則) | W-F11 消除多 replica 下「stale instance 用過時 policy 放行已撤銷權限」的 staleness window — 直接服務 Principle I「後端 Casbin enforce 為唯一權威」。Casbin policy 主寫權威維持 rust;pub-sub 只做 cache invalidation 訊號、不改 enforce 邏輯、不改 policy schema。subscriber `load_policy()` 從 DB(事實源)全量重載 → 多 instance 收斂到同一 DB 真相 |
| II | Soft Delete + Audit | **PASS**(附 rationale) | W-F11 **不新增任何 DB write code** — Casbin policy 異動為既有 `assign_permission` / test endpoint 行為、W-F11 只在其後**加** invalidate 訊號。redis pub-sub publish 為跨資源 side effect;Constitution II 末條明文「跨資源 side effect(redis pub-sub / SMS / 外部 API)成敗**不在** audit log 範疇;其一致性靠 Outbox / TTL fallback / 訂閱者 health check 等獨立機制處理」— W-F11 的 reconnect loop + full reload 即此「獨立機制」。→ PASS |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | W-F11 的 pub-sub 為 **rust instance ↔ rust instance** 的 cache invalidation 訊號、走**共用 redis**;Constitution III 明文「跨服務狀態同步 MUST 走共用 postgres 或 redis pub-sub channel」— W-F11 用的正是 sanctioned 機制,非後端間 HTTP/RPC forward。nginx upstream 仍只指 rust-api endpoint owner、ownership 不變 |
| IV | base 不改動邊界 | **PASS** | W-F11 嚴守 `base-web/` 全 0 diff(FR-016)、nestjs fork 0 diff(FR-017);純 rust 後端 + 部署配置 feature |
| V | 漸進收縮 | **PASS** | channel `casbin:policy:invalidate` 命名與訊息格式跨 DESIGN-A/B 一致(per DESIGN-B §154)、DESIGN-A→B 遷移時 rust 端零改動;nestjs 不 scale、不訂閱此 channel;無 DB / schema 改動 |

**架構約束檢查**:
- **快取與 pub-sub**:Constitution 架構約束明文「redis 為必要依賴;Casbin policy 變更走 `casbin:policy:invalidate` channel;單 instance 部署亦預設啟用 pub-sub(self-publish/self-subscribe 無 harm)」— **W-F11 即是實作此 constitutional 約束的 feature**,完全對齊(channel 名一致、pub-sub code 永遠啟用 per FR-004)
- **部署形態**:W-F11 用 docker-compose `deploy.replicas`、不引入 k8s;單機多容器、符合「docker-compose 單機運行」
- **Port 規劃**:W-F11 不改 port;prod 不對 rust-api 綁 host port(經 nginx)
- DB migration / TLS / secret / observability / backup / CI — W-F11 全 N/A(無 migration、不改 TLS/secret/observability/backup/CI 配置)

**Gate 結果**:**5 PASS / 0 N/A / 0 violation** — Constitution Check 通過、無需 Complexity Tracking。W-F11 為直接落實 Constitution 架構約束「Casbin policy 走 `casbin:policy:invalidate` channel」的 feature。

## Project Structure

### Documentation (this feature)

```text
specs/026-rust-horizontal-scaling/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出(/speckit-plan)— R-Q1~R-Q6
├── data-model.md        # Phase 1 產出(/speckit-plan)— E1~E6 元件模型
├── quickstart.md        # Phase 1 產出(/speckit-plan)
├── contracts/
│   └── verification-commands.md   # Phase 1 產出(/speckit-plan)— C-V1~C-V9
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(本指令不產)
```

### Source Code (rust-api worktree + outer 配置)

```text
rust-api/                                          (worktree)
├── server/global/src/
│   ├── <casbin pub-sub publisher>                 # 新增 notify_casbin_changed() + CASBIN_INVALIDATE_CHANNEL 常數
│   └── lib.rs                                     # 改(註冊 + re-export publisher)
├── server/initialize/src/
│   ├── casbin_sync_initialization.rs              # 新建(spawn_casbin_sync_subscriber + reconnect loop)
│   ├── casbin_initialization.rs                   # 改(initialize_casbin 內 spawn subscriber)
│   └── lib.rs                                     # 改(註冊 + re-export casbin_sync)
├── server/service/src/admin/
│   └── sys_authorization_service.rs               # 改(sync_role_permissions 結尾 publish)
└── server/api/src/admin/
    └── sys_user_api.rs                            # 改(add_policies/remove_policies 2 endpoint publish)
（其餘全不動;Cargo.toml 視 redis pub-sub feature 需要、預期不改）

<outer repo rev1-admin-root>
├── docker-compose.prod.yml                        # 改(rust-api 加 deploy.replicas: 2)
└── deploy/front-nginx/conf.d/default.conf.prod    # 改(rust_api upstream resolver-based)
（docker-compose.dev.yml / docker-compose.yml / default.conf 全不動）
```

**Structure Decision**:W-F11 為 rust-api worktree 內 ~7-8 file 改 + outer 2 個部署配置檔的中型 feature。rust 端核心為新增 Casbin pub-sub 一致性機制(publisher 在 `server_global` 避 circular dep、subscriber 在 `server_initialize` 比照既有 `event_channel_initialization`);outer 端為 prod-only 的 `deploy.replicas` + nginx upstream auto-discovery。對比 F8(5 file 純 wiring、有 migration)— W-F11 無 migration、但 rust 改動較深(背景 task + redis pub-sub)、且首次動 `docker-compose.prod.yml` 與 nginx prod conf。

## Phase 0: research(見 [research.md](research.md))

W-F11 brainstorm 已 saturated;Phase 0 由一支 codebase research agent 對 `rust-api/` 調查、解 brainstorm doc §8 的 6 個 implement-time R-Q:
- R-Q1:enforcer = `Arc<RwLock<CachedEnforcer>>`、不存全域 → subscriber task 在 `initialize_casbin` 就地 `tokio::spawn`、`move` 捕獲 `Arc` clone(不新增全域)
- R-Q2:redis 0.32 async 預設;publisher 用 `redis::Client` 開連線 PUBLISH、subscriber 用專用 pub-sub 連線 + reconnect loop;single redis 模式(cluster 不在範疇)
- R-Q3:Casbin enforcer 異動 call site 4 處 → 3 個 publish 點(`sync_role_permissions` ×1 + `sys_user_api` ×2)
- R-Q4:`deploy.replicas: 2` 於 Compose v2 `docker compose up` 生效、healthcheck/depends_on 相容
- R-Q5:nginx 1.27.5 `resolver 127.0.0.11` + upstream `zone` + `server ... resolve`
- R-Q6:不加顯式啟動兜底 — enforcer 啟動即從 DB 全量載入、極短 miss window 由下次異動收斂

## Phase 1: Design & Contracts(見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md))

- **data-model.md**:E1 channel + 訊息 / E2 `notify_casbin_changed()` publisher / E3 subscriber 背景 task / E4 3 個 publish call-site instrumentation / E5 `deploy.replicas` / E6 nginx upstream auto-discovery;含一致性 data flow 圖
- **contracts/verification-commands.md**:C-V1~C-V9 — image rebuild / prod stack 2 replica / nginx auto-discovery / **Casbin 跨 instance 一致性核心測試** / JWT 跨 replica / publish 失敗不阻斷 / subscriber reconnect / dev regression / three-side scope
- **quickstart.md**:W-F11 落地操作(rust patch + outer 配置 + prod stack 起 + acceptance + 兩段式 commit)

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — data-model E1-E6 確認無 DB schema 改、無 base-web 改、pub-sub channel 為 constitution 架構約束明文要求的機制、無服務間 HTTP forward、channel 名跨 DESIGN-A/B 一致;**5 PASS / 0 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
