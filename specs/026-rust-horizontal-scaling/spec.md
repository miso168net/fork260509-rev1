# Feature Specification: W-F11 — rust-horizontal-scaling

**Feature Branch**: `026-rust-horizontal-scaling`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "W-F11 rust-horizontal-scaling — rust-api 水平擴展能力。per docs/superpowers/026-feature-rust-horizontal-scaling.md brainstorm doc(5 拍板點 + 1 doc 矛盾發現)。單一 feature 一次交付三塊互相依賴的工作:(A) Casbin redis pub-sub 跨 instance 一致性 — channel `casbin:policy:invalidate`、每個 rust-api instance 為 publisher 兼 subscriber、policy 異動後 publish、收到訊息後 `load_policy()` full reload;(B) compose 多 replica — `docker-compose.prod.yml` 給 rust-api 加 `deploy.replicas: 2`、dev 維持單實例;(C) nginx upstream auto-discovery — `default.conf.prod` 的 `rust_api` upstream 改 resolver + `server ... resolve`。A 為 B/C 正確運作的硬前提。base-web/nestjs/DB schema 零改動、無 migration。"

**Source**: [`docs/superpowers/026-feature-rust-horizontal-scaling.md`](../../docs/superpowers/026-feature-rust-horizontal-scaling.md)(brainstorming 2026-05-20 session、5 拍板點 + 1 doc 矛盾發現)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11 line 1102 — W-F11 `rust-horizontal-scaling`:「rust-api replicas + front-nginx upstream auto-discovery;JWT secret 共享驗證;Casbin pub-sub coherence 測試」;§11.2 line 1147 — Phase W-4 P4「水平擴展能力」
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md) §line 149 — redis pub-sub channel `casbin:policy:invalidate`(**必要、非可選**);§line 154 — channel 名稱與訊息格式跨 DESIGN-A/B 保持一致
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle I「RBAC fail-safe」、Principle III「嚴版禁 Forward + 單一職責」、Principle V「漸進收縮」
- F8 baseline:outer `08d4756` + merge `c2b0912`、rust-api `90f37d1`(本 branch `026-rust-horizontal-scaling` 從 `rev1-admin-root` 衍生)
- 既有 sibling W-F5 `front-nginx-reverse-proxy`(merge `dff14c2`)+ W-F7 `port-mapping`(merge `62b3475`)— W-F11 改 prod nginx conf 的 baseline;F8 / F7.x「兩段式 commit、curl + psql acceptance」pattern — W-F11 沿用

**Scope summary**:rev1 **Phase W deploy roadmap Phase W-4(P4)第一個 feature** — F8 收尾 application Phase 3 後,W-F11 交付 rust-api 的水平擴展能力。單一 feature 一次交付三塊互相依賴的工作:

| 塊 | W-F11 deliverable |
|---|---|
| **A. Casbin redis pub-sub 一致性** | rust-api 新增 redis pub-sub:每個 instance 在 Casbin policy 異動後 publish 到 channel `casbin:policy:invalidate`、背景 subscriber task 收到訊息後 `load_policy()` full reload。消除多 replica 下記憶體 enforcer diverge 的授權 staleness window |
| **B. compose 多 replica** | `docker-compose.prod.yml` 給 rust-api 加 `deploy.replicas: 2`;`docker-compose.dev.yml` 維持單實例不變 |
| **C. nginx upstream auto-discovery** | `deploy/front-nginx/conf.d/default.conf.prod` 的 `rust_api` upstream 改用 `resolver` + `server rust-api:11081 resolve`(Docker 內嵌 DNS、nginx 1.27.5 支援);dev/共用 `default.conf` 不變 |

A 是 B/C 能正確運作的**硬前提** — 沒有 A,多 replica 下各 instance 記憶體 Casbin enforcer 會 diverge、nginx round-robin 到 stale instance 會產生錯誤授權判斷。範疇刻意收緊到「rust 水平擴展 + Casbin 跨 instance 一致性 + curl/psql/docker-exec acceptance」。

**Roadmap doc 矛盾修正**(brainstorm 階段 catch):`INTEGRATION-CHECKLIST.md` / `CLAUDE.md §10` 把 W-F11 誤標為 "observability"、Phase W P2 誤算為「3/4、剩 W-F11」。DESIGN-W §11 權威定義 W-F11 = `rust-horizontal-scaling`(P4)、P2 實為 W-F5+W-F6+W-F7 共 3 個全完成(3/3)、observability 是 W-F12-14(P5)。W-F11 的 doc-update task 須一併修正此 mislabel。

**Commit 模式**(W-F11 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F8/F7.x/F6/F9):rust-api worktree 1 commit(Casbin pub-sub code)+ outer 1 commit(`docker-compose.prod.yml` + nginx prod conf + rust-api SHA pin + spec docs + INTEGRATION-CHECKLIST 修正)+ merge `--no-ff` + SHA fill follow-up。
- **有 `docker-compose.prod.yml` 改 + nginx prod conf 改**(對比 F8 無 compose 改);**無 migration、無 DB schema 改、無 Casbin seed**。

**範疇外**:
- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV)
- ❌ 不動 `fork260509-soybean-admin-nestjs/` 任何 file;nestjs **不 scale**、不納入 `casbin:policy:invalidate` channel(W-F11 = rust 水平擴展;DESIGN-A 的 rust→nestjs pub-sub 屬另一範疇)
- ❌ 不改 `docker-compose.dev.yml`(dev 維持單實例)、不改 dev/共用 `default.conf`
- ❌ 不動 DB schema、無 migration、無 Casbin policy seed
- ❌ 不做 scaling 的 metrics / 監控 dashboard(→ W-F13 `metrics-prometheus` / W-F14)
- ❌ 不做 autoscaling、動態 replica 數、session affinity(JWT stateless 不需要)
- ❌ 不改 Casbin enforce 邏輯本身、不改 `assign_*` 家族業務行為(只加 invalidate 訊號)
- ❌ 不做 incremental policy sync(full `load_policy()` reload 已足夠)

## Clarifications

### Session 2026-05-20(brainstorming 階段拍板、5 拍板點)

- **Q1 (brainstorm)**: 下一個 feature 做哪個?→ **A:W-F11 `rust-horizontal-scaling`**。F8 收尾 application Phase 3 後從 Phase W deploy roadmap 挑;探索 DESIGN-W §11 後確認 W-F11 = 水平擴展(P4),observability 為 W-F12-14(P5)。

- **Q2 (brainstorm)**: W-F11 卡在「Casbin 跨 instance 一致性」未完成前置,scope 怎麼切?→ **A:一次包到底**。Casbin redis pub-sub + compose replicas + nginx upstream + coherence 測試**全合單一 W-F11 feature**。對比「先做 Casbin pub-sub 薄 feature、W-F11 留薄」與「W-F11 只做 infra、一致性 gap 後補」(後者違 DESIGN-B「必要非可選」、會 ship 有缺陷的多實例部署)。

- **Q3 (brainstorm)**: replica + nginx upstream 拓樸?→ **A:`deploy.replicas` + nginx `resolve`**。rust-api service 加 `deploy.replicas: N`(單一 service、Docker DNS 回多 A record),nginx `resolver 127.0.0.11` + upstream `server rust-api:11081 resolve`。真正 auto-discovery、scale 不用改 config。對比「顯式命名 service `rust-api-1`/`-2`」(replica 數寫死、配置重複、rejected)。

- **Q4 (brainstorm)**: 哪些環境跑多 replica?→ **A:僅 prod scale、dev 維持單實例**。dev 保留 rust-api 直綁 `127.0.0.1:11081` debug port(單實例);prod 才 `deploy.replicas: 2`。避開 host port 與 replica 衝突。

- **Q5 (brainstorm)**: pub-sub code 是否靠環境分支?→ **A:永遠啟用、不靠環境分支**。pub-sub publish/subscribe 程式碼一律啟用,dev 單實例下 publisher = 唯一 subscriber、收到自己訊息 reload 一次(idempotent、無害)。程式更簡單、無 dev/prod code path 分歧。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 水平擴展 rust-api 且授權判斷跨 instance 一致(Priority: P1)🎯 MVP

`operator` 在 prod 環境把 rust-api 從單實例 scale 成多 replica(`deploy.replicas: 2`)。front-nginx 透過 upstream auto-discovery 把請求 round-robin 到所有 replica。當任一 client(如 `Soybean` ROLE_SUPER)經 nginx 呼叫一個會異動 Casbin policy 的 endpoint(如 `POST /authorization/assign-permission`),該異動透過 redis channel `casbin:policy:invalidate` 廣播,**所有 rust-api replica 的記憶體 Casbin enforcer 都重新載入 policy**;之後不論 nginx 把後續請求導到哪個 replica,Casbin enforce 結果一致 — 不會出現「某 instance 用過時 policy 放行已撤銷權限」或「用過時 policy 拒絕已授予權限」。

**Why this priority**:W-F11 唯一 deliverable。沒有它,rev1 rust-api 只能單實例運行 — 一旦 scale 成多 replica,各 instance 的記憶體 Casbin enforcer 各自獨立、policy 異動只生效於處理該請求的 instance,其餘 instance 停留在 stale 狀態,授權判斷依 nginx round-robin 結果而不確定。這是 DESIGN-B 明列「必要、非可選」的水平擴展前提。

**Independent Test**:prod stack 起 2 個 rust-api replica → 經 nginx 改一筆 Casbin policy → 分別 `docker compose exec` 進每個 replica 直打其 `localhost:11081` → 驗證每個 replica 都反映新 policy(其中至少一個並未親自處理該異動 → 證明 pub-sub 傳播)→ 還原。

**Acceptance Scenarios**:

1. **Given** prod stack 起且 rust-api `deploy.replicas: 2`,**When** 查 `docker compose ps`,**Then** 出現 2 個 rust-api replica 容器(`...-rust-api-1` / `...-rust-api-2`)、皆 healthy。
2. **Given** US1.1 PASS,**When** 檢查 front-nginx 對 `rust_api` upstream 的解析,**Then** upstream 解析到 2 個 backend(auto-discovery 生效)、經 nginx 的 API 請求可被任一 replica 服務。
3. **Given** US1.1-1.2 PASS + capture 某 role 對某 path 的現有 Casbin policy 狀態,**When** `Soybean`(ROLE_SUPER)經 nginx 呼叫一個會異動 Casbin policy 的 endpoint,**Then** HTTP 200 + envelope `{code:0}`,且 redis channel `casbin:policy:invalidate` 收到一則 invalidate 訊息。
4. **Given** US1.3 的 policy 異動已完成,**When** 分別 `docker compose exec` 進 rust-api-1 與 rust-api-2 直打 `localhost:11081` 上受該 policy 影響的 endpoint,**Then** 2 個 replica 的 enforce 結果都反映異動後的新 policy(無 stale instance)。
5. **Given** 多 replica 運行,**When** 由某 replica 簽發的 JWT access_token 拿去 `docker compose exec` 到另一 replica 直打受保護 endpoint,**Then** HTTP 200 + envelope `{code:0}`(JWT secret 為共享 Docker secret、token 跨 replica 通用)。
6. **Given** W-F11 落地,**When** 用 `docker-compose.dev.yml` 起 dev stack,**Then** rust-api 仍為單實例、`127.0.0.1:11081` debug port 直連正常、功能不退化(dev regression)。
7. **Given** W-F11 落地,**When** capture→異動→驗證後執行還原,**Then** 受測 Casbin policy 回到 W-F11 執行前狀態(acceptance 無污染 seed)。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | redis 短暫不可用、publish 失敗 | publish 失敗只 log warning、**不阻斷** policy 異動主流程(異動已寫 DB);redis 恢復後靠下次異動或 instance 啟動收斂 |
| E-2 | subscriber 背景 task 與 redis 斷線 | subscriber 須有 reconnect loop;斷線期間該 instance 可能 stale — reconnect 後恢復接收 invalidate 訊息 |
| E-3 | dev 單實例 | pub-sub code 仍啟用;publisher = 唯一 subscriber、收到自己訊息 `load_policy()` 一次 — idempotent、無害 |
| E-4 | publisher 自己也收到自己發的訊息 | publisher reload — 重讀剛寫入的同一份 DB state、idempotent;不做 self-skip(YAGNI) |
| E-5 | instance 啟動期間錯過 invalidate 訊息 | instance 啟動時 Casbin enforcer 本就從 DB 載入最新 policy → 啟動後即最新;啟動「過程中」短暫 miss window 由下次異動收斂(是否加顯式啟動 reload 兜底留 plan Phase 0 評估) |
| E-6 | 多筆 policy 連續異動 | 每筆異動各 publish 一則訊息;subscriber 每收到一則就 full reload — 最終一致,無 incremental drift |

## Requirements *(mandatory)*

### Functional Requirements

**A. Casbin redis pub-sub 一致性(rust-api source)**

- **FR-001**: rust-api MUST 在每個 Casbin policy 異動點(`assign_permission` / `sync_role_permissions` / `sys_user_api` 的 `add_policy`/`remove_policies` 等,完整 call site 清單於 plan Phase 0 確認)的**異動完成且 DB 已 commit 後**,publish 一則訊息到 redis pub-sub channel `casbin:policy:invalidate`。
- **FR-002**: publish 的訊息 MUST 為**最小訊號**(不攜帶 payload semantics);subscriber 收到後做 full reload、不需從訊息得知改了什麼。
- **FR-003**: rust-api MUST 在啟動時 spawn 一個背景 subscriber task,訂閱 `casbin:policy:invalidate` channel;收到任一訊息後 MUST 對該 instance 的記憶體 Casbin enforcer 執行 `load_policy()` **full reload**(全量重載、非 incremental)。
- **FR-004**: pub-sub publish/subscribe 程式碼 MUST 永遠啟用、不靠環境變數或 dev/prod 分支(per brainstorm Q5);dev 單實例下 publisher 即唯一 subscriber、收到自己訊息 reload 一次為可接受行為。
- **FR-005**: publisher 收到自己發出的 invalidate 訊息並 reload MUST 為可接受行為(idempotent);W-F11 MUST NOT 實作 self-skip 機制(per brainstorm、YAGNI)。
- **FR-006**: redis publish 失敗 MUST NOT 阻斷或回滾 Casbin policy 異動主流程(異動已寫 DB);publish 失敗 MUST 記錄 warning log。
- **FR-007**: redis channel 名稱 MUST 為 `casbin:policy:invalidate`(對齊 DESIGN-B §149 命名、跨 DESIGN-A/B 一致)。
- **FR-008**: W-F11 MUST NOT 改變 Casbin enforce 邏輯本身、MUST NOT 改變 `assign_*` 家族 endpoint 的業務行為與 response — 只在既有異動點之後**加** invalidate 訊號。

**B. compose 多 replica**

- **FR-009**: `docker-compose.prod.yml` MUST 給 rust-api service 設定 `deploy.replicas: 2`。
- **FR-010**: W-F11 MUST NOT 改 `docker-compose.dev.yml`;dev 環境 rust-api MUST 維持單實例 + 既有 `127.0.0.1:11081` debug port 直綁。
- **FR-011**: rust-api compose service MUST NOT 設定 `container_name`(讓 replica 可由 Compose 自動命名 `...-rust-api-1` / `-2`)。

**C. nginx upstream auto-discovery**

- **FR-012**: `deploy/front-nginx/conf.d/default.conf.prod` 的 `rust_api` upstream MUST 改用 Docker 內嵌 DNS resolver + `server rust-api:11081 resolve`,使 nginx 能在 rust-api scale 後自動發現所有 replica(無需改 config)。
- **FR-013**: W-F11 MUST NOT 改 dev/共用的 `deploy/front-nginx/conf.d/default.conf`(dev 單實例、upstream 維持靜態 `server rust-api:11081`)。
- **FR-014**: nginx 對 rust-api 的 `keepalive` 等既有 proxy 行為 MUST 維持(W-F11 只改 upstream 解析方式、不退化既有反向代理功能)。

**通用範疇 / 紀律**

- **FR-015**: W-F11 MUST 不動 DB schema、不新增 migration、不新增 Casbin policy seed。
- **FR-016**: W-F11 MUST 不動 `base-web/` 任何 file(per Constitution Principle IV;`src/` 與 `.env` 全 0 diff)。
- **FR-017**: W-F11 MUST 不動 `fork260509-soybean-admin-nestjs/` 任何 file;nestjs MUST NOT 被 scale、MUST NOT 訂閱 `casbin:policy:invalidate` channel。
- **FR-018**: W-F11 commit 模式 = **兩段式**(per CLAUDE.md §6.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**有 `docker-compose.prod.yml` 改 + nginx prod conf 改**。
- **FR-019**: W-F11 MUST **不**加 rust unit test(pub-sub publish/subscribe 為 IO 邊界、無可獨立測之純函式;coherence 屬 stack-level 行為)— 對齊 F7.1/F8 wiring feature precedent;acceptance 以 stack 行為驗證。
- **FR-020**: W-F11 acceptance MUST 用 inline bash(`curl` + `psql` + `docker compose exec`)+ `contracts/verification-commands.md`(per F7/F8 慣例)、不新建 deploy script、不引入 e2e test framework。
- **FR-021**: W-F11 acceptance MUST 採 capture → 異動 → verify → restore 模式,確保受測 Casbin policy 不污染 seed 資料。
- **FR-022**: `docs/INTEGRATION-CHECKLIST.md` 與 `CLAUDE.md §10` MUST 更新:修正 W-F11 mislabel(observability → rust-horizontal-scaling)、Phase W P2 計數(改為 3/3 完成)、加 W-F11 完成里程碑。

### Key Entities

- **Casbin invalidate 訊號**(redis pub-sub channel `casbin:policy:invalidate`、W-F11 新增)— 最小訊號訊息,跨 rust-api instance 廣播「Casbin policy 已異動、請 reload」。
- **rust-api Casbin pub-sub publisher**(rust-api source、W-F11 新增、薄 helper)— 在既有 Casbin policy 異動點之後 publish invalidate 訊號。
- **rust-api Casbin pub-sub subscriber**(rust-api source、W-F11 新增、啟動時 spawn 的背景 task)— 訂閱 channel、收到訊息對記憶體 enforcer `load_policy()`。
- **既有 per-instance Casbin enforcer**(`Extension<CasbinAxumLayer>`、`Arc<RwLock<Enforcer>>`)— W-F11 不改其結構,只加「收到 invalidate → reload」的觸發路徑。
- **rust-api compose service 的 `deploy.replicas`**(`docker-compose.prod.yml`、W-F11 新增)— prod 環境 rust-api 的 replica 數(= 2)。
- **front-nginx `rust_api` upstream**(`default.conf.prod`、W-F11 改)— 由靜態單 server 改為 resolver-based auto-discovery。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: W-F11 落地後,prod stack 以 `deploy.replicas: 2` 啟動 → `docker compose ps` 顯示 2 個 rust-api replica 容器、皆 healthy。
- **SC-002**: W-F11 落地後,front-nginx 的 `rust_api` upstream 自動解析到全部 rust-api replica(scale 數量改變時無需改 nginx config)。
- **SC-003**: W-F11 落地後,經 nginx 對某 Casbin policy 做一次異動 → 全部 rust-api replica 的記憶體 enforcer 都反映新 policy(由 `docker compose exec` 逐 replica 直連驗證,含未親自處理該異動的 replica)。
- **SC-004**: W-F11 落地後,由某 replica 簽發的 JWT token 在其他 replica 上被接受(JWT secret 跨 replica 共享)。
- **SC-005**: W-F11 落地後,redis publish 失敗時 Casbin policy 異動主流程仍成功(異動寫入 DB)、且記錄 warning log。
- **SC-006**: W-F11 落地後,dev stack(`docker-compose.dev.yml`)rust-api 仍為單實例、`127.0.0.1:11081` debug port 正常、功能不退化。
- **SC-007**: W-F11 不動 base-web(`git diff HEAD -- base-web/` 無輸出,per FR-016)。
- **SC-008**: W-F11 不動 nestjs fork(`git diff HEAD -- fork260509-soybean-admin-nestjs/` 無輸出,per FR-017)。
- **SC-009**: W-F11 不動 DB schema、無新 migration(per FR-015)。
- **SC-010**: W-F11 不改 `docker-compose.dev.yml` 與 dev/共用 `default.conf`(`git diff` 無輸出,per FR-010 + FR-013)。
- **SC-011**: W-F11 acceptance 採 capture→異動→verify→restore、完成後受測 Casbin policy 回到執行前狀態(無污染)。
- **SC-012**: W-F11 完成里程碑 commit 數 = **兩段式**(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。
- **SC-013**: `docs/INTEGRATION-CHECKLIST.md` / `CLAUDE.md §10` 的 W-F11 mislabel 與 Phase W P2 計數獲修正(per FR-022)。

## Assumptions

- **A-001**: rev1 rust-api 的 Casbin enforcer 為 per-instance 記憶體物件(`Arc<RwLock<Enforcer>>`),policy 異動直接改呼叫到的 instance 的記憶體 enforcer + 經 sea-orm-adapter 同步寫 DB;目前無 watcher、無 redis pub-sub(brainstorm 階段 grep 確認)。
- **A-002**: prod 環境 `deploy.replicas` 預設值為 **2**(證明水平擴展的最小值;不做 autoscaling、不做動態 replica 數)。
- **A-003**: redis 已在 stack 內、為 rust-api 既有依賴(connection pool / cache),W-F11 額外用其 pub-sub 能力;subscriber 需專用連線(pub-sub 連線不能跑其他指令)。
- **A-004**: `deploy.replicas` 在 Docker Compose v2 非 swarm 模式下被 `docker compose up` honor;rust-api compose service 目前無 `container_name`,replica 可自動命名。
- **A-005**: front-nginx 為 `nginx:1.27-alpine`(實際 1.27.5),open-source nginx 1.27.3+ 支援 upstream `server ... resolve` 參數(配 `zone` + `resolver`)。
- **A-006**: Casbin policy 集規模小(~30 row 量級),`load_policy()` full reload 成本可忽略,無需 incremental sync。
- **A-007**: JWT secret 為 Docker secret(`/run/secrets/jwt_secret`)、所有 rust-api replica 讀同一檔案 → token 天然跨 replica 通用,W-F11 不需額外 code、只需 acceptance 驗證。
- **A-008**: dev 環境保留 rust-api `127.0.0.1:11081` debug port 直綁(單實例);prod 不對外直綁 rust-api port(經 nginx)。

## Dependencies

### Inbound(本 feature 依賴)

- **W-F5** `front-nginx-reverse-proxy`:front-nginx 與 `rust_api` upstream 主結構 — W-F11 在此 upstream 上改 auto-discovery。✅(merge `dff14c2`)
- **W-F4** `secret-injection`:Docker secrets(含 `jwt_secret`)— W-F11 的「JWT 跨 replica 共享」依賴此既有機制。✅
- **W-F3** `compose-base-structure`:`docker-compose.yml` 主結構含 rust-api / redis service。✅
- **F8** `assign-users`:application Phase 3 收尾 — W-F11 的 Casbin 異動點包含 F8 新增的 `assign-users` 路徑(及既有 `assign-permission`/`assign-routes` 等)。✅(merge `c2b0912`)

### Outbound(本 feature 解鎖)

- **Phase W deploy roadmap**:W-F11 完成後 Phase W-4(P4)達成,rust-api 具備水平擴展能力。
- **DESIGN-B 遷移準備**:`casbin:policy:invalidate` channel 為 DESIGN-B v1 即支援水平擴展的核心機制(per DESIGN-B §149),DESIGN-A→B 遷移時直接沿用。

### 與 W-F11 並行可選

- **W-F12 / W-F13 / W-F14**(observability、Phase W-5 P5)/ **F12** `cleanup-job` / **W-F6b** `acme-cert-acquisition`
