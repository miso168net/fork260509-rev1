# Data Model: W-F11 — rust-horizontal-scaling

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

W-F11 **不動 DB schema、不增表、不改 entity model、無 migration**。「data model」此處為 W-F11 的**元件模型** — Casbin pub-sub 一致性機制(rust source)+ 部署配置(compose + nginx)。唯一新增的「資料物件」為 redis pub-sub channel `casbin:policy:invalidate` 上的最小訊號訊息。

元件總覽:

| # | 元件 | 位置 | 性質 |
|---|---|---|---|
| E1 | `casbin:policy:invalidate` channel + 訊息 | redis | 新增 |
| E2 | `notify_casbin_changed()` publisher helper | `server_global`(rust source) | 新增 |
| E3 | Casbin sync subscriber 背景 task | `server_initialize`(rust source) | 新增 |
| E4 | publish call-site instrumentation | `server_service` + `server_api`(rust source) | 改 |
| E5 | rust-api `deploy.replicas` | `docker-compose.prod.yml` | 改 |
| E6 | `rust_api` nginx upstream auto-discovery | `default.conf.prod` | 改 |

---

## E1: `casbin:policy:invalidate` channel 與訊息(新增)

- **Channel 名**:`casbin:policy:invalidate`(常數、對齊 DESIGN-B §149;跨 DESIGN-A/B 一致)。
- **訊息 payload**:**最小訊號** — subscriber 收到後做 full `load_policy()`、不需從訊息得知改了什麼。payload 可為固定短字串(如 `"1"` 或空字串);**不攜帶** role / path / 異動類型等 semantics。
- **常數定義位置**:`server_global`(publisher 與 subscriber 共用)。
- **語意**:fan-out 廣播「Casbin policy 已異動,請 reload」。redis pub-sub 為 at-most-once、無持久化 — instance 不在線時錯過的訊息不補送(殘留 window 處理見 research R-Q6 / spec E-5)。

---

## E2: `notify_casbin_changed()` publisher helper(新增)

**位置**:`server_global`(owns `GLOBAL_PRIMARY_REDIS`;`server_service` 與 `server_api` 皆已依賴 `server_global`,避免 circular dep — 不可放 `server_initialize`,因 `server_initialize` 依賴 service/api)。

**簽章(概念)**:
```rust
/// publish 一則 Casbin policy invalidate 訊號到 redis channel。
/// fire-and-forget:redis 不可用 / 非 Single 模式 → log warning、不回傳 error、不阻斷呼叫端。
pub async fn notify_casbin_changed() { ... }
```

**行為**:
1. 從 `GLOBAL_PRIMARY_REDIS` 取連線;`RedisConnection::Single(client)` → 開 async 連線 `PUBLISH casbin:policy:invalidate <payload>`。
2. `RedisConnection::Cluster(_)` 或 `None`(未初始化)→ log warning、no-op(rev1 stack 用 single redis、cluster 不在範疇,per research R-Q2)。
3. publish 失敗(redis 不可用)→ log warning、**不** panic、**不**回傳 error(per spec FR-006)。

**設計要點**:
| 項目 | 決策 |
|---|---|
| 回傳型別 | 無 error(`()` 或內部吞掉)— 呼叫端不需處理失敗(per FR-006) |
| 阻塞性 | publish 為 await 但快(單一 redis 指令);失敗快速 log 返回、不阻斷 policy 異動主流程 |
| 連線 | 每次 publish 開短連線或用 multiplexed;不佔用 subscriber 的專用連線 |

**LOC delta**:~30-40 LOC(新 module 或併入既有 `server_global` 檔)+ lib.rs 註冊。

---

## E3: Casbin sync subscriber 背景 task(新增)

**位置**:`server/initialize/src/casbin_sync_initialization.rs`(新建、比照既有 `casbin_initialization.rs` / `event_channel_initialization.rs`);於 `server/initialize/src/lib.rs` 註冊 + re-export。

**簽章(概念)**:
```rust
/// spawn 背景 task:訂閱 casbin:policy:invalidate、收到訊息對 enforcer load_policy()。
pub fn spawn_casbin_sync_subscriber(enforcer: Arc<RwLock<CachedEnforcer>>) { ... }
```

**行為**:
1. `tokio::spawn` 一個長駐 task,`move` 捕獲 `enforcer: Arc<RwLock<CachedEnforcer>>`(per research R-Q1 — 不經全域、就地捕獲)。
2. task 主迴圈(reconnect loop):
   - 從 `GLOBAL_PRIMARY_REDIS` 取 `redis::Client` → 開**專用** async pub-sub 連線(`get_async_pubsub()`)→ `subscribe("casbin:policy:invalidate")`。
   - `on_message()` stream loop:每收到一則訊息 → `enforcer.write().await.load_policy().await`(full reload;⚠️ `CachedEnforcer` result-cache 行為見下方設計要點)。
   - 連線錯誤 / 斷線 → log warning → sleep backoff → 重連(per spec E-2)。
   - redis 全域尚未初始化(啟動早期)→ 等待重試。

**呼叫點**:`initialize_casbin()`(`server/initialize/src/casbin_initialization.rs`)建出 `CasbinAxumLayer` 後,取 `layer.get_enforcer()` 的 `Arc` clone、呼叫 `spawn_casbin_sync_subscriber(...)`。subscriber 與 axum handler 共用同一 `Arc<RwLock<CachedEnforcer>>`。

**設計要點**:
| 項目 | 決策 |
|---|---|
| enforcer handle | 就地 spawn 捕獲 `Arc` clone(per R-Q1)— 不加全域 |
| reload 策略 | full `load_policy()`(per brainstorm、policy ~30 row、無 incremental drift) |
| ⚠️ `CachedEnforcer` cache(analyze M1) | enforcer 為 `CachedEnforcer`(casbin 2.10 feature `cached`、會 cache enforce 結果)。implement 時 **MUST** 先驗 `CachedEnforcer::load_policy()` 是否同步使 enforce 結果快取失效;若否,subscriber 收到訊息時須在 `load_policy()` 之外額外呼叫 cache 清除(例如 `enforcer.set_enforce_result_cache_size(...)` / casbin 2.10 對應 API),否則 reload 後舊 enforce 判斷仍命中 cache、跨 instance coherence 無聲失效。C-V4 acceptance 會抓到(rust-api-2 mutate 後仍 stale)— 但 implement 時提前驗證可省一次 rebuild 迴圈 |
| self-receive | publisher 自己也收到自己的訊息 → reload 一次、idempotent、不 self-skip(per FR-005) |
| reconnect | loop + backoff(per E-2);斷線期間該 instance 可能 stale、重連後恢復 |
| 啟動順序 | subscriber task 內部容忍 redis 全域稍晚就緒(retry);spawn 時點在 casbin init |

**LOC delta**:~60-80 LOC(新檔)+ lib.rs 註冊 + `casbin_initialization.rs` ~3 LOC spawn 呼叫。

---

## E4: publish call-site instrumentation(改)

在 3 個 Casbin enforcer 異動點、異動完成後呼叫 `server_global::...::notify_casbin_changed()`(per research R-Q3):

| # | File | 擺放點 |
|---|---|---|
| 1 | `server/service/src/admin/sys_authorization_service.rs` | `sync_role_permissions` 結尾(`remove_policies` + `add_policies` 都完成後、`Ok(())` 前)publish 一次 |
| 2 | `server/api/src/admin/sys_user_api.rs` | `SysUserApi::remove_policies` 的 `remove_policies().await` 之後 |
| 3 | `server/api/src/admin/sys_user_api.rs` | `SysUserApi::add_policies` 的 `add_policy().await` 之後 |

**設計要點**:
| 項目 | 決策 |
|---|---|
| 擺放時機 | enforcer 異動 await 回來後(`CachedEnforcer` 經 SeaOrmAdapter 同步寫 DB、await 即 DB committed)→ publish 後 subscriber reload 讀得到 |
| 不改業務行為 | 只在既有異動點後**加一行** publish 呼叫;不改 `sync_role_permissions` diff 邏輯、不改 endpoint response(per FR-008) |
| `assign_routes` / `assign_users` | **不** instrument — 它們寫 `sys_role_menu`/`sys_user_role` join table、不碰 Casbin enforcer |

**LOC delta**:~3-6 LOC(3 個 call site,各 1 行 publish + 必要 import)。

---

## E5: rust-api `deploy.replicas`(改 `docker-compose.prod.yml`)

`docker-compose.prod.yml` 給 rust-api service 加:
```yaml
rust-api:
  deploy:
    replicas: 2
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| replica 數 | `2`(證明水平擴展最小值;per spec A-002) |
| 命名 | rust-api service 無 `container_name` → Compose 自動命名 `rev1-admin-rust-api-1` / `-2` |
| dev | `docker-compose.dev.yml` **不動**、rust-api 維持單實例 + `127.0.0.1:11081`(per FR-010) |
| healthcheck / depends_on | 既有設定不改;replica 各自跑 healthcheck、front-nginx 等全部 healthy(per R-Q4) |

**改動範圍**:`docker-compose.prod.yml` 加 `deploy.replicas` block(~3 LOC)。

---

## E6: `rust_api` nginx upstream auto-discovery(改 `default.conf.prod`)

`deploy/front-nginx/conf.d/default.conf.prod` 的 `rust_api` upstream 由靜態單 server 改為 resolver-based:
```nginx
resolver 127.0.0.11 valid=10s ipv6=off;   # Docker 內嵌 DNS(http context)

upstream rust_api {
    zone rust_api 64k;                      # resolve 需 shared memory zone
    server rust-api:11081 resolve;          # nginx 1.27.5 支援
    keepalive 32;
}
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| `resolver` | `127.0.0.11`(Docker 內嵌 DNS)、`valid=10s` re-resolve 週期、`ipv6=off` |
| `zone` | `resolve` 的硬性前提(dynamic upstream 需 shared memory) |
| `keepalive` | 維持既有 `keepalive 32`(per FR-014) |
| dev/共用 `default.conf` | **不動**(維持靜態 `server rust-api:11081;`、per FR-013) |
| `resolver` 擺放 | http context(或 upstream 內);實際對 1.27.5 行為 implement 階段微調 |

**改動範圍**:`default.conf.prod` 的 `rust_api` upstream block + 1 條 `resolver`(~5-7 LOC)。

---

## 元件互動 — 一致性 data flow

```
ROLE_SUPER POST /api/authorization/assign-permission
  → front-nginx(upstream rust_api、resolve)round-robin → rust-api-A
  → A: SysAuthorizationService::assign_permission → sync_role_permissions
        → enforcer_write.remove_policies/add_policies(改 A 記憶體 + SeaOrmAdapter 寫 DB)
        → [E4] notify_casbin_changed()  ──PUBLISH──┐
  → redis channel casbin:policy:invalidate         │ fan-out
  ┌────────────────────────────────────────────────┘
  ├→ A 的 subscriber task [E3] → A.enforcer.load_policy()  (self-receive、idempotent)
  └→ B 的 subscriber task [E3] → B.enforcer.load_policy()  (B 未處理該異動 → 靠此收斂)
  ⇒ 之後 nginx 不論導到 A 或 B,Casbin enforce 結果一致
```

---

## Data Model 完成標誌

- ✅ E1 channel `casbin:policy:invalidate` + 最小訊號訊息
- ✅ E2 `notify_casbin_changed()` publisher — `server_global`、fire-and-forget(per FR-006)
- ✅ E3 subscriber 背景 task — `server_initialize`、就地 spawn 捕獲 enforcer `Arc`、reconnect loop
- ✅ E4 3 個 publish call site instrumentation(per R-Q3)
- ✅ E5 `docker-compose.prod.yml` `deploy.replicas: 2`
- ✅ E6 `default.conf.prod` `rust_api` upstream resolver-based auto-discovery
- ✅ 無 DB schema 改、無 migration、無 base-web 改、無 nestjs 改
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E6 確認 — pub-sub channel 為 constitution 架構約束明文要求的機制(Principle I/III PASS)、無新 DB write code(Principle II PASS、附 rationale)、無服務間 HTTP forward(Principle III PASS)、base-web 0 diff(Principle IV PASS)、channel 名跨 DESIGN-A/B 一致(Principle V PASS)。**5 PASS / 0 N/A / 0 violation 維持**。
