# W-F11 — rust-horizontal-scaling

**Date**: 2026-05-20
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-20(5 拍板點 + 1 個 doc 矛盾發現;F8 收尾 application Phase 3 後第一個 Phase W deploy feature、Phase W-4 P4 水平擴展)

---

## Scope summary

W-F11 = **rust-api 水平擴展能力**(DESIGN-W §11 Phase W-4 / P4)。單一 feature 一次交付三塊互相依賴的工作:

| 塊 | 內容 |
|---|---|
| **A. Casbin redis pub-sub 一致性** | redis channel `casbin:policy:invalidate`;每個 rust-api instance 為 publisher 兼 subscriber;policy 異動後 publish、收到訊息後 `load_policy()` full reload |
| **B. compose 多 replica** | `docker-compose.prod.yml` 給 rust-api 加 `deploy.replicas: 2`;dev 維持單實例 |
| **C. nginx upstream auto-discovery** | `default.conf.prod` 的 `rust_api` upstream 改 `resolver` + `server ... resolve`(Docker 內嵌 DNS、nginx 1.27.5 支援) |

A 是 B/C 能正確運作的**硬前提** — 沒有 A,多 replica 下各 instance 的記憶體 Casbin enforcer 會 diverge,nginx 把請求 round-robin 到 stale instance 會產生錯誤授權判斷。

範疇刻意收緊到「**rust 水平擴展 + Casbin 跨 instance 一致性 + curl/psql/docker-exec acceptance**」、**不改 base-web / 不改 nestjs / 不動 DB schema / 不做 metrics 監控 / 不做 autoscaling**。

**Commit 模式**(W-F11 固定):
- **兩段式** commit(per CLAUDE.md §4.1、類 F8/F7.x/F6/F9):rust-api worktree 1 commit(Casbin pub-sub code)+ outer 1 commit(`docker-compose.prod.yml` + nginx prod conf + rust-api SHA pin + spec docs)+ merge `--no-ff` + SHA fill follow-up。
- **有 docker-compose.prod.yml 改 + nginx prod conf 改**(對比 F8 無 compose 改);**無 migration、無 DB schema 改、無 Casbin seed**。

---

## 關鍵發現:roadmap doc 矛盾(brainstorm 階段 catch)

對照 **DESIGN-W §11(roadmap 權威來源、line 1102 / 1147)** 與 `INTEGRATION-CHECKLIST.md` / `CLAUDE.md §6`,發現後者有命名/計數錯誤:

| | DESIGN-W §11(權威) | CHECKLIST / CLAUDE.md(錯誤) |
|---|---|---|
| **W-F11** | `rust-horizontal-scaling`(Phase W-4 / P4) | 誤標為 "observability" |
| **Phase W P2** | W-F5 + W-F6 + W-F7 共 3 個、全 ✅ → **P2 已 3/3 完成** | 誤算為「3/4、剩 W-F11」 |
| **Observability** | W-F12 `log-aggregation-loki` / W-F13 `metrics-prometheus` / W-F14 `grafana-dashboards`(Phase W-5 / P5) | — |

→ **W-F11 的 feature 流程(spec / INTEGRATION-CHECKLIST 更新 task)須一併修正此 mislabel**:CHECKLIST §11.2「剩 W-F11 / W-2 P2:3/4」改為「P2 3/3 完成」、CLAUDE.md §6 與 CHECKLIST next-step 的「W-F11 observability」label 更正為「W-F11 rust-horizontal-scaling」。brainstorm 階段先文件化、不在本 commit 動 CHECKLIST(留 W-F11 doc-update task)。

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md):
  - §11 line 1102 — W-F11 `rust-horizontal-scaling`:「rust-api replicas + front-nginx upstream auto-discovery;JWT secret 共享驗證;Casbin pub-sub coherence 測試」;依賴「W-F5, DESIGN-B F5」
  - §11.2 line 1147 — Phase W-4 P4:「W-F11 — 水平擴展能力(DESIGN-B v1 即支援,可在較後階段驗證)」
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md):
  - §line 149 — redis pub-sub channel `casbin:policy:invalidate`(**必要、非可選**):「DESIGN-B v1 即支援 rust 多 instance 水平擴展,不延後到擴展時才補 pub-sub。每個 rust instance 都是 publisher 兼 subscriber」
  - §line 154 — DESIGN-A 的 pub-sub 為「rust → nestjs subscriber」、DESIGN-B 為「rust instance → 其他 rust instance」;**channel 名稱與訊息格式保持一致**(為 DESIGN-A→B 遷移零改動)
  - F5(line 216)— `auth-login-and-dynamic-menu` + redis pub-sub channel 跨 rust instance cache invalidation(DESIGN-W W-F11 依賴清單列的「DESIGN-B F5」)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle I「RBAC fail-safe」— Casbin 跨 instance 一致性是 fail-safe 的一環:多 replica 下若某 instance policy stale,可能放行已撤銷權限;W-F11 的 pub-sub 機制正是消除此 staleness window
  - Principle III「嚴版禁 Forward + 單一職責」— pub-sub 為 rust instance↔rust instance 的 cache invalidation 訊號、非服務間業務 forward;不引入跨服務 RPC
  - Principle V「漸進收縮」— channel `casbin:policy:invalidate` 命名與訊息格式跨 DESIGN-A/B 保持一致(per DESIGN-B §154)、DESIGN-A→B 遷移時 rust 端零改動;nestjs 不涉及
- F8 baseline(剛 merge):outer `08d4756` + merge `c2b0912`、rust-api `90f37d1`(W-F11 從 `rev1-admin-root` 衍生)
- F8 / F7.x implement-time pattern「兩段式 commit、curl + psql acceptance、無 e2e framework」— W-F11 沿用
- W-F5 `front-nginx-reverse-proxy`(merge `dff14c2`)、W-F7 `port-mapping`(merge `62b3475`)— W-F11 改 prod nginx conf 的 baseline

---

## 既有現況(brainstorm 階段 grep 確認、2026-05-20)

**Casbin 一致性機制現況 — 無跨 instance 同步**:

| 元件 | 狀態 | 位置 / 說明 |
|---|---|---|
| Casbin enforcer | per-instance 記憶體物件 | `Extension<CasbinAxumLayer>`、`Arc<RwLock<Enforcer>>`、per-request 注入 |
| policy 異動 → 生效 | 直接改**呼叫到的那個 instance** 的記憶體 enforcer + 寫 DB | `assign_permission`/`sync_role_permissions`(`sys_authorization_service.rs:122-216`)、`sys_user_api.rs:50/65`(`add_policy`/`remove_policies`)— sea-orm-adapter 同步持久化到 DB |
| Casbin watcher / redis pub-sub | ❌ **不存在** | 無任何 watcher;redis 僅用於 connection pool / cache(`redis_initialization.rs`、`GLOBAL_PRIMARY_REDIS`) |
| in-process `mpsc` event channel | 存在、但與 Casbin **無關** | `server/global/src/global.rs` 的 `EventChannels` 為 F2.1 audit-log 轉發用(`sys_operation_log_service.rs:35`) |

→ **多 replica 下的硬傷**:instance A 處理 policy 異動 → 改 A 的記憶體 enforcer + DB;instance B 的記憶體 enforcer 仍 stale。下一個被 nginx round-robin 到 B 的請求 → 用過時 policy 授權。

**部署現況**:
- nginx `nginx:1.27-alpine`、實際 1.27.5 — open-source 1.27.3+ 支援 upstream `server ... resolve` 參數
- `default.conf`(dev/共用)+ `default.conf.prod`(prod)雙 conf;`rust_api` upstream 現為 `server rust-api:11081; keepalive 32;`(單一靜態 server)
- `docker-compose.dev.yml` 把 rust-api 直綁 `127.0.0.1:11081:11081`(debug 直連)— **一個 host port 綁不了多個 replica**,故 dev 不能 scale
- rust-api compose service **無 `container_name`** — replica 可自動命名 `rev1-admin-rust-api-1`/`-2`
- redis 已在 stack 內、rust-api 已有 redis 連線基礎(`init_primary_redis`)

---

## Clarifications(brainstorm 2026-05-20、5 拍板點)

- **Q1 (brainstorm)**: 下一個 feature 做哪個?→ **A:W-F11 `rust-horizontal-scaling`**。F8 收尾 application Phase 3 後,從 Phase W deploy roadmap 挑;原以為是 observability(因 CHECKLIST mislabel),探索 DESIGN-W §11 後確認 W-F11 實為水平擴展(P4)、observability 是 W-F12-14(P5)。使用者明確選 W-F11 rust-horizontal-scaling。

- **Q2 (brainstorm)**: W-F11 卡在「Casbin 跨 instance 一致性」未完成前置,scope 怎麼切?→ **A:一次包到底**。把 Casbin redis pub-sub + compose replicas + nginx upstream + coherence 測試**全合在單一 W-F11 feature**。對比「先做 Casbin pub-sub 薄 feature、W-F11 留薄」(roadmap-faithful、DESIGN-W 把 pub-sub 列為 DESIGN-B F5 前置)與「W-F11 只做 infra、一致性 gap 後補」(違 DESIGN-B「必要非可選」、會 ship 有缺陷的多實例部署)。一次包到底:單一 spec 收完整、不留半成品。

- **Q3 (brainstorm)**: replica + nginx upstream 拓樸?→ **A:`deploy.replicas` + nginx `resolve`**。rust-api service 加 `deploy.replicas: N`(單一 service、Docker DNS 回多 A record),nginx `resolver 127.0.0.11` + upstream `server rust-api:11081 resolve`。真正的 auto-discovery、scale 不用改 config、對齊 DESIGN-W「upstream auto-discovery」字面。對比「顯式命名 service `rust-api-1`/`-2`」= replica 數寫死、compose 配置重複、非 auto-discovery、rejected。

- **Q4 (brainstorm)**: 哪些環境跑多 replica?→ **A:僅 prod scale、dev 維持單實例**。dev 保留 rust-api 直綁 `127.0.0.1:11081` debug port(單實例);prod 才 `deploy.replicas: 2`。避開 host port 與 replica 衝突、dev/prod 關注點分離。pub-sub code 在單實例 dev 下發訊息給自己、reload 一次,無害。

- **Q5 (brainstorm)**: pub-sub code 是否靠環境分支?→ **A:永遠啟用、不靠環境分支**。pub-sub publish/subscribe 程式碼一律啟用,dev 單實例下 publisher = 唯一 subscriber、收到自己的訊息 reload 一次(idempotent、無害)。程式更簡單、無 dev/prod code path 分歧。

---

## 設計

### 1. 範疇與架構

```
              ┌─ rust-api-1 ─┐   每個 instance:
front-nginx ──┤              ├──   - 自己的記憶體 Casbin enforcer (Arc<RwLock>)
upstream      └─ rust-api-2 ─┘     - publisher:policy 異動後 publish
(resolve)            │              - subscriber:收到訊息 → load_policy() full reload
                     └──── redis pub-sub ────┘
                       channel: casbin:policy:invalidate
```

W-F11 = rust 水平擴展。三塊(A Casbin pub-sub / B compose replicas / C nginx upstream)同一 feature 交付。base-web / nestjs / DB schema 零改動。

### 2. (A) Casbin redis pub-sub 一致性 — rust-api 改動

- **Channel**:`casbin:policy:invalidate`(對齊 DESIGN-B §149 命名;DESIGN-A→B 遷移沿用)。
- **Publish**:新增薄 helper `notify_casbin_changed()`,在每個 Casbin policy 異動點**異動完成(DB 已 commit)後**呼叫,publish 一則**最小訊號**訊息(不帶 payload semantics — full reload 不需要知道改了什麼)。異動點:`sys_authorization_service.rs` 的 `assign_permission`/`sync_role_permissions`、`sys_user_api.rs` 的 `add_policy`/`remove_policies`(實際 call site 清單於 `/speckit-plan` Phase 0 R-Q 確認)。
- **Subscribe**:啟動時 spawn 背景 task(比照既有 `initialize_event_channel` 的 spawn 模式),訂閱 channel;收到任一訊息 → 取全域 enforcer → `enforcer.load_policy()` **full reload**(policy 集 ~30 row、全量重載零成本、無 incremental drift 風險、符合 simplicity-first)。
- Publisher 自己也會收到訊息並 reload — idempotent、無害,**不做 self-skip**(YAGNI)。
- pub-sub code **永遠啟用**、不靠環境分支(per Q5)。

### 3. (B) compose 多 replica

- `docker-compose.prod.yml` 給 rust-api 加 `deploy.replicas: 2`(Compose v2 非 swarm 下 `docker compose up` 即生效;service 無 `container_name`、replica 自動命名)。
- **dev 不變** — `docker-compose.dev.yml` 維持單實例 + 直綁 `127.0.0.1:11081`。
- 預設 `2` replica(證明水平擴展的最小值;不做 autoscaling、不做動態 replica 數)。

### 4. (C) nginx upstream auto-discovery

只改 `deploy/front-nginx/conf.d/default.conf.prod` 的 `rust_api` upstream:
```nginx
resolver 127.0.0.11 valid=10s;        # Docker 內嵌 DNS
upstream rust_api {
    zone rust_api 64k;                 # resolve 需 shared memory zone
    server rust-api:11081 resolve;     # nginx 1.27.5 支援(open-source 1.27.3+)
    keepalive 32;
}
```
dev/共用的 `default.conf`(單實例 `server rust-api:11081;`)**不動**。

### 5. Data flow（一致性場景）

```
ROLE_SUPER POST /api/authorization/assign-permission
  → nginx round-robin → rust-api-A
  → A: enforcer_write.add_policy()  (改 A 記憶體 enforcer + sea-orm-adapter 寫 DB)
  → A: notify_casbin_changed()      (DB commit 後 publish casbin:policy:invalidate)
  → redis fan-out → A 與 B 的 subscriber task 都收到
  → A.load_policy() / B.load_policy()  (兩 instance 都從 DB full reload)
  → 之後不論 nginx 導到 A 或 B,enforce 結果一致
```

### 6. 錯誤處理 / edge case

| 場景 | 行為 |
|---|---|
| redis 短暫不可用、publish 失敗 | publish 失敗只 log warning、不阻斷 policy 異動主流程(異動已寫 DB);subscriber 重連後靠下次異動或啟動 reload 收斂。`/speckit-plan` 評估是否需「啟動時一次 reload」兜底 |
| subscriber task 斷線 | 背景 task 需 reconnect loop;斷線期間該 instance 可能 stale — plan 階段定 reconnect 策略 |
| dev 單實例 | publisher = 唯一 subscriber,收到自己訊息 reload 一次、無害 |
| publisher 自己 reload | idempotent — 重讀剛寫入的同一份 DB state,無風險 |

### 7. 測試 / 驗收

- **無 rust unit test**(pub-sub publish/subscribe 為 IO 邊界、無純函式;coherence 屬 stack-level 行為)— 同 F7.1/F8 wiring precedent;acceptance 以 stack 行為驗。
- **acceptance = curl + psql + `docker compose exec`**(沿用 F8 慣例、不新建 deploy script、不引入 e2e framework)。
- C-V 草案(實際 C-V 編號與命令於 `/speckit-plan` contracts 定):
  - image rebuild OK(含新 pub-sub code)
  - prod stack 起、2 個 rust-api replica healthy、nginx upstream resolve 到 2 個 backend
  - **一致性測試(核心)**:經 nginx 改一筆 Casbin policy(assign-permission)→ 分別 `docker compose exec` 進 rust-api-1 **與** rust-api-2 直打 `localhost:11081` 受影響 endpoint → **兩 instance 都反映新 policy**(其中至少一個沒處理該異動 → 證明 pub-sub 傳播)
  - JWT 共享:instance A 發的 token、exec 到 instance B 直打可接受(同一 `jwt_secret` Docker secret)
  - dev regression:dev stack 仍單實例、`127.0.0.1:11081` debug port 正常、功能不退化
  - 三邊 scope:base-web src 0 diff + nestjs fork 0 diff
  - W-FA1 / prod stack service 全 healthy

### 8. Research-time 確認項(交 `/speckit-plan` Phase 0)

- **R-Q1**:背景 subscriber task 如何取得與 request-time `Extension<CasbinAxumLayer>` **同一個** `Arc<RwLock<Enforcer>>` handle — 可能需把 enforcer 放全域(`server_global`)。
- **R-Q2**:`redis` crate 的 async pub-sub API 形態、subscriber 專用連線(pub-sub 連線不能跑其他指令)、reconnect loop。
- **R-Q3**:Casbin policy 異動 call site 完整清單(`assign_permission` / `sync_role_permissions` / `sys_user_api` add/remove)、`notify_casbin_changed()` 的擺放點。
- **R-Q4**:`deploy.replicas` 配 `docker compose up`(v2 非 swarm)+ `depends_on: service_healthy` + healthcheck 的互動。
- **R-Q5**:nginx upstream `resolve` + `zone` + `resolver` 在 1.27.5 open-source 的精確語法與 `valid=` TTL。
- **R-Q6**:是否需要「啟動時一次 `load_policy()`」兜底(instance 啟動期間錯過 invalidate 訊息的收斂)。

---

## 範疇外

- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV)
- ❌ 不動 `fork260509-soybean-admin-nestjs/` 任何 file;nestjs **不 scale**、不納入 `casbin:policy:invalidate` channel(W-F11 = rust 水平擴展;DESIGN-A 的 rust→nestjs pub-sub 是 W-F10/F14 範疇的另一回事)
- ❌ 不改 `docker-compose.dev.yml`(dev 維持單實例)、不改 dev/共用 `default.conf`
- ❌ 不動 DB schema、無 migration、無 Casbin policy seed(W-F11 純 compose + nginx + rust pub-sub code)
- ❌ 不做 scaling 的 metrics / 監控 dashboard(→ W-F13 `metrics-prometheus` / W-F14)
- ❌ 不做 autoscaling、動態 replica 數、session affinity(JWT stateless 不需要)
- ❌ 不改 Casbin enforce 邏輯本身、不改 policy schema、不改 `assign_*` 家族的業務行為(只加 invalidate 訊號)
- ❌ 不做 incremental policy sync(full `load_policy()` reload 已足夠、policy 集小)

---

## Naming / 編號

- Brainstorm doc:`docs/superpowers/026-feature-rust-horizontal-scaling.md`(本檔)
- Spec 目錄:`specs/026-rust-horizontal-scaling/`(`/speckit-specify` 產生)
- Feature branch:`026-rust-horizontal-scaling`(`before_specify` pre-hook 產生)
- 無新 migration(W-F11 不動 DB)
- redis channel:`casbin:policy:invalidate`(per DESIGN-B §149)
