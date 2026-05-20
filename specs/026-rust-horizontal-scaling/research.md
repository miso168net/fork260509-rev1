# Research: W-F11 — rust-horizontal-scaling

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-20

W-F11 為 Phase W deploy Phase W-4(P4)feature。Brainstorm 已 saturated(5 拍板點)、`/speckit-clarify` 0 question。Phase 0 解 brainstorm doc §8 列的 6 個 implement-time R-Q,主體由一支 codebase research agent 對 `rust-api/` 調查 R-Q1/R-Q2/R-Q3 取得 evidence。

---

## R-Q1: 背景 subscriber task 如何取得 Casbin enforcer handle?

**Question**: 啟動時 spawn 的背景 subscriber task,要對與 request-time handler 同一個 enforcer 執行 `load_policy()`,怎麼拿到 handle?

**Evidence**(research agent、2026-05-20):
- Enforcer 型別 = `Arc<RwLock<CachedEnforcer>>`(`casbin` crate 2.10 feature `cached`);包在 `CasbinAxumLayer { enforcer: Arc<RwLock<CachedEnforcer>> }`(`axum-casbin/src/middleware.rs:32-50`)。
- `CasbinAxumLayer::get_enforcer(&mut self) -> Arc<RwLock<CachedEnforcer>>` 回傳 `Arc` clone。
- 建立點:`server/initialize/src/casbin_initialization.rs:10-22` `initialize_casbin()` → 在 `router_initialization.rs:103-108` 被呼叫、layer clone 進 axum Extension(`router_initialization.rs:73-79`)。
- **enforcer 目前不存在任何全域**(`server/global/src/global.rs` 有 DB/redis/mongo/s3 全域、無 enforcer);只活在 axum router 的 Extension layer。

**Decision**: **在 enforcer 建立點直接 `tokio::spawn` subscriber task、以 `move` 捕獲 `Arc<RwLock<CachedEnforcer>>` clone — 不新增全域**。

`initialize_casbin()` 建出 `CasbinAxumLayer` 後,取 `layer.get_enforcer()`(`Arc` clone)、`tokio::spawn` subscriber task 把該 `Arc` move 進去。task 與 handler 共用同一個 `Arc<RwLock<CachedEnforcer>>`,`load_policy()` 對兩者皆生效。

**Rationale**:
- research agent 提的「加 `GLOBAL_ENFORCER` 全域」是「從 `main.rs` 另外 spawn」才需要;在 enforcer 建立點就地 spawn 即可直接捕獲 — 更簡、且不必讓 `server_global` 新增 `casbin` crate 依賴。
- `CachedEnforcer` 的 `load_policy()` 來自 `CoreApi` trait;subscriber task 持 `Arc`、`enforcer.write().await.load_policy().await`。
- ⚠️ **analyze M1 caveat**:enforcer 為 `CachedEnforcer`(feature `cached`、額外 cache enforce 結果)。`load_policy()` 重載 policy,但 implement 時 **MUST** 確認其是否同步使 enforce 結果快取失效;若否,subscriber reload 後須額外清 cache,否則跨 instance coherence 無聲失效。詳見 data-model.md E3 設計要點 / tasks.md T021。

**Alternatives considered**:
- 加 `GLOBAL_ENFORCER: Lazy<RwLock<Option<Arc<RwLock<CachedEnforcer>>>>>` 到 `server_global` — rejected:`server_global` 需新增 `casbin` 依賴、且就地 spawn 已足夠,全域屬非必要狀態。

**Spec impact**: data-model E3(subscriber task)細目。

---

## R-Q2: redis pub-sub API 形態、subscriber 專用連線、reconnect

**Question**: rust-api 怎麼做 redis publish 與 subscribe?

**Evidence**(research agent):
- `redis = "0.32"`(`rust-api/Cargo.toml:70`);async 為 0.32 預設(配 `tokio 1`)、無需額外 feature flag。
- redis 全域 `GLOBAL_PRIMARY_REDIS: Lazy<RwLock<Option<RedisConnection>>>`(`server/global/src/global.rs:57`);`RedisConnection::Single(Arc<redis::Client>)` 或 `Cluster(Arc<ClusterClient>)`。
- 初始化:`server/initialize/src/redis_initialization.rs` — `redis::Client::open(url)` → `RedisConnection::Single(Arc::new(client))`。
- **codebase 目前無任何 pub-sub 使用**(無 `into_pubsub` / `subscribe` / `publish`)。
- 主 stack 用 single redis(`docker-compose.yml` 的 `redis` service);`deploy/docker-compose-redis-cluster.yml` 為 fork 既有、rev1 stack 不啟。

**Decision**:
- **Publish**:`notify_casbin_changed()` 從 `GLOBAL_PRIMARY_REDIS` 取 `RedisConnection::Single` 的 `redis::Client`,開一個 async 連線、`PUBLISH casbin:policy:invalidate <minimal payload>`。fire-and-forget、失敗只 log warning。
- **Subscribe**:subscriber task 從同一 `redis::Client` 取**專用** async pub-sub 連線(`Client::get_async_pubsub()`、pub-sub 連線不可跑其他指令)、`subscribe("casbin:policy:invalidate")`、`on_message()` stream loop。
- **Reconnect**:subscriber task 外層包 `loop { connect → subscribe → recv loop;斷線/error → log + sleep backoff → 重連 }`。
- **redis 模式**:W-F11 實作 `RedisConnection::Single` 路徑(rev1 stack 預設);`Cluster` 模式 pub-sub 不在 W-F11 範疇(rev1 不啟 cluster redis)— 若全域為 `Cluster`,publisher/subscriber log warning 並 no-op(degraded、與「redis 不可用」同級)。

**Rationale**:
- single redis 為 rev1 stack 既定形態(constitution 架構約束「docker-compose 單機運行」);cluster pub-sub 複雜且 rev1 不用,YAGNI。
- subscriber 專用連線是 redis pub-sub 的硬性要求(SUBSCRIBE 後該連線只能收訊息)。
- reconnect loop 對齊 spec edge case E-2。

**Alternatives considered**:
- 用 `GLOBAL_REDIS_POOL` 的 pooled 連線做 subscribe — rejected:pub-sub 需獨佔長連線、不該回收進 pool。

**Spec impact**: data-model E2(publisher)/ E3(subscriber)細目;spec FR-006 / E-2 對齊。

---

## R-Q3: Casbin policy 異動 call site 清單與 publish 擺放點

**Question**: 哪些地方 runtime 異動 Casbin enforcer policy?`notify_casbin_changed()` 擺哪?

**Evidence**(research agent、grep `add_policy`/`add_policies`/`remove_policy`/`remove_policies` 等):

| # | File:line | function | 觸發 |
|---|---|---|---|
| 1 | `server/service/src/admin/sys_authorization_service.rs:172` | `sync_role_permissions`(被 `assign_permission` 呼叫) | `remove_policies` — role 權限指派 |
| 2 | `server/service/src/admin/sys_authorization_service.rs:182` | `sync_role_permissions`(同上) | `add_policies` — role 權限指派 |
| 3 | `server/api/src/admin/sys_user_api.rs:50` | `SysUserApi::remove_policies` | test/demo GET endpoint(hardcoded role/path) |
| 4 | `server/api/src/admin/sys_user_api.rs:65` | `SysUserApi::add_policies` | test/demo GET endpoint(hardcoded role/path) |

- runtime Casbin `p` policy 異動**集中**於 2 個 function:`sync_role_permissions`(主、business、`remove_policies`+`add_policies` 成對)與 `sys_user_api.rs` 2 個 test/demo endpoint。
- `assign_routes` / F8 `assign_users` 寫 `sys_role_menu` / `sys_user_role` join table、**不**碰 Casbin enforcer,不需 publish。
- migration seed(`m20260521`/`m20260522` 等)直接 SQL INSERT `casbin_rule`、在 migration init-container 跑、rust-api 啟動時 enforcer 從 DB 全量載入 — 非 runtime 異動,不需 publish。

**Decision**: `notify_casbin_changed()` 呼叫點 = **3 處**:
1. `sync_role_permissions` 結尾(`remove_policies` + `add_policies` 都完成後、publish 一次)
2. `SysUserApi::remove_policies` 的 `remove_policies().await` 之後
3. `SysUserApi::add_policies` 的 `add_policy().await` 之後

publish 一律在 enforcer 異動完成後(`CachedEnforcer` 的 `add/remove_policies` 經 SeaOrmAdapter 同步寫 DB、await 回來即 DB 已 commit)。

**Rationale**:
- 4 個 mutation 收斂在 3 個 publish 點(`sync_role_permissions` 內 remove+add 合併 publish 一次)、call site 少、明確。
- test/demo endpoint 雖非 business 主流程,仍異動 enforcer、為 coherence 正確性一併 instrument(成本極低)。

**Spec impact**: data-model E4(call-site instrumentation);spec FR-001 對齊。

---

## R-Q4: `deploy.replicas` 與 `docker compose up` / healthcheck / depends_on 互動

**Question**: prod compose 加 `deploy.replicas: 2` 後,`docker compose up` 與既有 healthcheck / depends_on 怎麼配合?

**Evidence / Decision**:
- Docker Compose v2 非 swarm 模式下 `docker compose up` honor `deploy.replicas`(自 Compose v2.x);rust-api compose service 無 `container_name`(brainstorm 確認)→ replica 自動命名 `rev1-admin-rust-api-1` / `-2`。
- rust-api 既有 `healthcheck`(`curl -f http://localhost:11081/health`)逐 replica 各自跑;`front-nginx` 對 rust-api 的 `depends_on: condition: service_healthy` 在 replica 模式下等**所有** replica healthy。
- rust-api 對 `migration` 的 `depends_on: service_completed_successfully` — 每個 replica 各自等 migration init-container 完成、migration 仍只跑一次,無衝突。
- prod 不對 rust-api 綁 host port(經 nginx)→ 無「一 port 綁多容器」衝突;dev 不 scale、保留 `127.0.0.1:11081`。

**Spec impact**: data-model E5(compose);spec FR-009 / FR-010 / FR-011 對齊。

---

## R-Q5: nginx upstream `resolve` 語法(1.27.5 open-source)

**Question**: `default.conf.prod` 的 `rust_api` upstream 怎麼改成 auto-discovery?

**Evidence / Decision**:
- nginx `nginx:1.27-alpine`(實際 1.27.5);open-source nginx **1.27.3+** 支援 `upstream` 區塊內 `server ... resolve` 參數(配 `resolver` + `zone`)。
- 改 `deploy/front-nginx/conf.d/default.conf.prod`:
  ```nginx
  resolver 127.0.0.11 valid=10s ipv6=off;   # Docker 內嵌 DNS
  upstream rust_api {
      zone rust_api 64k;                      # resolve 需 shared memory zone
      server rust-api:11081 resolve;
      keepalive 32;
  }
  ```
- `resolver` 置於 `http` context(或 upstream 區塊內);`127.0.0.11` 為 Docker 內嵌 DNS 固定位址;`valid=10s` 控 re-resolve 頻率;`ipv6=off` 避免 Docker DNS 回 AAAA 雜訊。
- `zone` 為 `resolve` 的硬性前提(dynamic upstream 需 shared memory)。
- dev/共用 `default.conf` **不動**(維持靜態 `server rust-api:11081;`)。

**Rationale**: nginx 1.27.5 原生支援、無需 nginx-plus;Docker DNS 對單一 service 名回全部 replica IP。實際 `resolver` 擺放位置(http vs upstream context)與 `valid` 值於 implement 階段對 1.27.5 行為微調。

**Spec impact**: data-model E6(nginx);spec FR-012 / FR-013 / FR-014 對齊。

---

## R-Q6: instance 啟動期間錯過 invalidate 訊息的收斂

**Question**: 需要顯式「啟動時 `load_policy()` 兜底」嗎?

**Evidence / Decision**:
- `CachedEnforcer::new()`(`initialize_casbin` 內)建立時即從 SeaOrmAdapter(DB)全量載入 policy → **rust-api 啟動時 enforcer 本就是最新**。
- 唯一殘留 window:enforcer 載入完成 → subscriber task 連上 redis 之間,若剛好有 policy 異動則該則訊息會被該 instance miss。此 window 極短(秒級內)。
- **Decision**:**不加**額外顯式啟動 reload。enforcer 啟動載入已涵蓋「啟動時刻的最新狀態」;極短 window 的 miss 由「下一次任何 policy 異動」收斂(下次異動 publish、該 instance 已連上 → reload)。屬可接受殘留風險、文件化於 spec edge case E-5。

**Rationale**: 啟動載入 + pub-sub 已覆蓋 99.9% 情境;為極短 window 加顯式兜底屬 over-engineering(simplicity-first)。若日後實測有問題,加「subscriber 連上後做一次 `load_policy()`」是 1 行的後續強化。

**Spec impact**: spec edge case E-5 對齊。

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 — subscriber task 在 enforcer 建立點就地 spawn、`move` 捕獲 `Arc<RwLock<CachedEnforcer>>`、不新增全域
- ✅ R-Q2 — publisher 用 `redis::Client` 開連線 PUBLISH;subscriber 用專用 pub-sub 連線 + reconnect loop;single redis 模式、cluster 不在範疇
- ✅ R-Q3 — 3 個 publish 呼叫點(`sync_role_permissions` ×1 + `sys_user_api` ×2)
- ✅ R-Q4 — `deploy.replicas: 2` 於 Compose v2 `docker compose up` 生效、healthcheck/depends_on 相容
- ✅ R-Q5 — nginx 1.27.5 `resolver` + upstream `zone` + `server ... resolve`
- ✅ R-Q6 — 不加顯式啟動兜底、啟動載入 + pub-sub 已足夠
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — W-F11 brainstorm 已 saturated、Phase 0 為 implement-time pattern 確認。
