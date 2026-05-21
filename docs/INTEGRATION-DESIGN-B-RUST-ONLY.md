# DESIGN-B：rust-only 整合（DESIGN-A 的最終遷移形態）

> **[F14 現行設計]** DESIGN-A cutover 完成(F14);本檔為 rev1 現行架構、nestjs 已完全退場。

> 日期：2026-05-14
> 範圍：rev1 base-web（`fork260509-soybean-admin-base` 的 `example` 分支）↔ rev1 rust-api（`fork260509-soybean-admin-rust` 的 `main` 分支）— **單一後端**
> 資料來源：[`INTEGRATION-RESEARCH.md`](INTEGRATION-RESEARCH.md) + [`INTEGRATION-DESIGN-A-RUST-NESTJS.md`](INTEGRATION-DESIGN-A-RUST-NESTJS.md)
> 性質：本檔為 **設計階段**，與 [`DESIGN-A`](INTEGRATION-DESIGN-A-RUST-NESTJS.md) 兩條軌道並存
> 與 DESIGN-A 的關係：DESIGN-B 是 DESIGN-A 的最終遷移目標（DESIGN-A 中 nestjs 退場後 rev1 進入 DESIGN-B 形態）；同時 DESIGN-B 也適合 greenfield 部署（直接走 rust-only 跳過 DESIGN-A 的過渡複雜性）
> 撰寫策略：DESIGN-B 與 DESIGN-A **大部分章節 identical**，採 **Hybrid 鏡像 + brief reference** — 同節以「繼承 DESIGN-A §X.Y」標明，差異節完整重寫
> 部署統合留 [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)

---

## §1 設計原則

### §1.1 RBAC 中心原則

**繼承 DESIGN-A §1.1**（identical） — Casbin + menu「不符權限不顯示」為設計支柱；runtime 動態 menu + Menu CRUD 兩條主軸並重；未實作功能（如 SMS captcha）也進 menu 表、靠 Casbin policy 對多數 role deny / test role allow。

### §1.2 rust 單後端原則

> 對應 DESIGN-A 的 §1.2 雙服務協作原則，DESIGN-B 形態下重寫。

- **rust 為唯一後端**：負責全部 endpoint、Casbin RBAC enforcement、data layer、`/systemManage/*` alias、refresh token rotation（DESIGN-A 中由 nestjs 補位的部分在 DESIGN-B 內由 rust 自實作）
- **無 cross-service forward 議題**：單服務本就無法 forward，DESIGN-A 的「嚴版禁 forward」原則在 DESIGN-B 形態下自然不需強調
- **共識資源簡化為 rust 內部資源管理**（詳見 §3.2 — DESIGN-B 文中沒有 DESIGN-A 的 §3.3「介接面」，因無跨服務介接）：
  - **postgres**：仍是事實源（user / role / menu / Casbin policy / sys_tokens / sys_operation_log）
  - **redis**：**必要依賴**（非可選） — 角色為「Casbin policy 跨 rust instance 同步通道 + 進程內 cache 輔助」；DESIGN-B v1 即支援 rust 水平擴展，不延後到擴展時才補 pub-sub
  - **JWT secret**：單一 envvar，rust 自簽自驗
- **nestjs 蹤跡**：DESIGN-B 起點即無 nestjs（與 DESIGN-A 起點的「rust + nestjs 雙服務」對比）

### §1.3 base 不改動邊界

**繼承 DESIGN-A §1.3**（identical） — `src/views/`、`src/components/`、`src/service*/api/*.ts`、`src/router/`、`src/store/` 不動；`.env`、`.env.dev`、`.env.prod` 可動；mock 保留但 prod 不啟。

### §1.4 範圍宣告

**繼承 DESIGN-A §1.4** 大部分；唯一差別：

- **refresh token 處理**：DESIGN-A 中由 nestjs 補位，DESIGN-B 中 **由 rust 主負（自實作 rotation）**
- 其他項（UI 範圍 ~40+ view、後端 ~19 條核心 + `/systemManage/*` 10 條 alias、抽離項清單、抽離項升級繼承 §1.5）與 DESIGN-A 相同

### §1.5 資料變動原則：soft delete + 全域 audit log

**繼承 DESIGN-A §1.5**（identical） — 所有 DELETE 為 soft delete、所有寫入必寫 audit、audit log 一等公民不 cleanup、物理刪除由獨立 cleanup job、寫入量 2N trade-off 接受。

---

## §2 架構

### §2.1 水平分層

```
┌──────────────┐
│   client     │ browser (base SPA)
└──────┬───────┘
       │  TLS（DESIGN-W-DEPLOYMENT 決議）
┌──────▼───────────────────────────────────────┐
│   nginx                                      │ 唯一對外入口
│   - serve base-web static                    │ 路由分流權威
│   - reverse proxy /api/* → rust-api          │
└──────────────┬───────────────────────────────┘
               │
               │ /api/*
               │
        ┌──────▼─────────────────────┐
        │   rust-api                 │ 唯一後端
        │   - auth/login/getInfo     │
        │   - auth/refreshToken      │ ← DESIGN-B 形態下 rust 自實作
        │   - /route/* (動態 menu)    │
        │   - /user, /role, /menu    │
        │   - Casbin enforce         │
        │   - /systemManage/*        │
        │     (alias router)         │
        │   - 抽離項 stubs            │
        └──────┬─────────────────────┘
               │
   ┌───────────▼────────────┐ ┌────────────────────┐
   │   postgres             │ │   redis (必要)     │
   │   - 共用 entity 表     │ │   - Casbin policy  │
   │   - casbin_rule        │ │     跨 instance    │
   │   - sys_tokens         │ │     pub-sub        │
   │   - sys_operation_log  │ │   - 進程內 cache   │
   │   - 事實源             │ │     輔助           │
   └────────────────────────┘ └────────────────────┘
```

**分層原則**（與 DESIGN-A 對比）：
- **nginx**：角色不變（最外緣、TLS、static、`/api/*` 反代）
- **rust**：唯一後端、單一 ownership；無「雙服務協作」議題
- **共用基礎設施**：postgres 角色不變（事實源）；redis 為**必要依賴**，承擔 Casbin policy 跨 rust instance pub-sub + 進程內 cache 輔助（DESIGN-B v1 即支援水平擴展）
- **單向流向**：所有 request `client → nginx → rust → postgres/redis`，無分支

### §2.2 nginx 路由分流規則

| Location | 上游 | 用途 | 狀態 |
|---|---|---|---|
| `/` | base-web static | SPA assets | 永久 |
| `/api/*` | rust-api | 全部後端 endpoint（含 auth/refreshToken、`/systemManage/*` alias、抽離項 stub） | 永久 |

**設計要點**：

- **無 TRANSITIONAL marker block**：DESIGN-B 形態下 nginx config 不需區分過渡 / 永久 endpoint
- **base 的 `VITE_SERVICE_BASE_URL`** 設成相對 path `/api`（同 A），具體 nginx config 細節留 [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)
- **抽離項不在 nginx 層處理**（同 A）：抽離項由 rust handler 註冊 stub + Casbin policy 控管，nginx 對其完全透明

---

## §3 後端任務拆解

### §3.1 rust 主負責 endpoint（DESIGN-B v1）

| Endpoint 群 | 狀態 | 主要工作 |
|---|---|---|
| `/auth/{login, getUserInfo}` | 既有 | response shape 對齊（§4.1）|
| `/auth/refreshToken` | **rust 自實作** | refresh token rotation：寫 `sys_tokens` 表（rotation_chain）、JWT 重簽、舊 token 標 revoked；rust 主寫主讀 |
| `/auth/{sendCaptcha, verifyCaptcha}` | **抽離項 stub** | 同 DESIGN-A — 補 handler、回固定碼 `000000`、log；Casbin policy 預設多數 role deny、test role allow |
| `/auth/error` | **抽離項 stub** | 同 DESIGN-A — demo only，echo `?code=&msg=` |
| `/route/{getConstantRoutes, getUserRoutes}` | 既有 | response shape 對齊 |
| `/route/isRouteExist` | **新做（簡單）** | 同 DESIGN-A — 查表回 boolean |
| `/user, /role, /menu, /domain` CRUD | 既有 | response shape 對齊、軟刪 + audit 繼承 §1.5 |
| `/api-endpoint, /access-key, /log-audit/*, /org` | 既有 | 同上 |
| `/sandbox/{simple-api-key, complex-api-key}` | 既有 | 同 DESIGN-A — API key sign demo（rust 獨有）|
| `/authorization/assign-users` | **rust 新做** | 同 DESIGN-A — 寫 Casbin `g` rule，pattern 同 `/user/add_policies` |
| `/systemManage/*` | **alias router** | 同 DESIGN-A — 10 條 thin wrapper |

**與 DESIGN-A 的差異**：僅 `/auth/refreshToken` 從「nestjs 補位」轉為「rust 自實作」；其他 endpoint group 與工作項目完全一致。

**實作守則**：（同 DESIGN-A §3.1） 抽離項 stub 必須註冊、Casbin policy 控管、`/systemManage/*` alias 重用既有 service、所有 CRUD 隱含 soft delete + audit。

### §3.2 rust 內部資源管理

> 對應 DESIGN-A 的 §3.3「介接面（共識資源 × 跨後端協調）」，DESIGN-B 形態下無跨服務介接，因此本節改為「rust 內部資源管理」。

四個資源、各自的 rust 內部角色：

#### JWT 簽章
- **單一 envvar 注入**（docker compose 注入 rust container），rust 內 sign + verify 同源
- **演算法 + claim format**：rust 內部一致即可（無需跨服務共識）；具體選擇（HS256 vs RS256）仍留 spec-kit 拍板
- **claim 欄位**至少含 `sub, exp, iat, roles`

#### sys_tokens 表
- **rust = 主寫主讀**：refresh 時寫新 token row + 標舊 token revoked、記 rotation_chain；驗 token valid 時查表
- **schema**：rust 主導 migration（與 DESIGN-A 中 rust 主導 migration 一致；DESIGN-B 形態下 nestjs 不存在，無 schema 對齊問題）
- **用途**：revocation list + rotation chain；JWT 簽章自帶驗證、sys_tokens 表只作敏感操作的補充查詢

#### Casbin policy 表
- **rust = 主寫主讀**：admin 透過 `manage/role` view 走 rust，policy 變更只在 rust 觸發
- **enforcer cache 機制**：rust 進程內 cache（可重用 in-process LRU 或類似結構）
- **redis pub-sub channel `casbin:policy:invalidate`（必要、非可選）**：DESIGN-B v1 即支援 rust 多 instance 水平擴展，不延後到擴展時才補 pub-sub。每個 rust instance 都是 publisher 兼 subscriber：
  - 寫 policy 後在同 transaction commit 後 publish 到 channel
  - 訂閱端收到訊息 invalidate 自身進程內 cache，下次讀時從 DB reload
  - 單 instance 部署：self-publish + self-subscribe，無實際 cross-instance 效果但機制就位、無 harm
  - 多 instance 部署：自動跨 instance 同步、無 cache stale
- **與 DESIGN-A 的差異**：DESIGN-A 的 pub-sub 為「rust → nestjs subscriber」設計；DESIGN-B 的 pub-sub 為「rust instance → 其他 rust instance」設計。channel 名稱與訊息格式可保持一致（為 DESIGN-A → DESIGN-B 遷移時零改動）

#### sys_operation_log 表（全域 audit）
- **rust = 主寫**：所有業務 endpoint 改 entity 時同 transaction 寫 audit
- **schema**：rust 主導 migration、擴充欄位（actor_user_id / timestamp / operation / entity_type / entity_id / payload before & after / client_ip）
- **cleanup job = 寫**：物理刪除時 actor = `cleanup_job` 寫 audit
- **與 DESIGN-A 的差異**：無 nestjs 也需寫 audit 的協作要求（refresh 動作由 rust 寫，已含 audit）

#### 內部資源守則總結
- 所有 resource 集中管理在 envvar / migration / config，集中於 rust 自身
- DESIGN-B 形態下無「cross-service 共識」議題，但 **redis pub-sub 為 Casbin cache cross-instance 同步必要機制、非可選**；channel `casbin:policy:invalidate` 在 DESIGN-A → DESIGN-B 遷移時直接沿用（DESIGN-W-DEPLOYMENT 拍板部署形態）

---

## §4 GAP 解法

### §4.1 跨欄位 GAP 拍板

**繼承 DESIGN-A §4.1**（identical）：

- **B1 + B2: success code + 多碼系統** — 路線 II（rust HTTP 永遠 200 + body code 為 business code；base `.env` 改 `VITE_SERVICE_SUCCESS_CODE=0`）
- **B3: camelCase ↔ snake_case** — rust 全 request/response struct 加 `#[serde(rename_all = "camelCase")]`
- **B5: User info 形狀對齊** — rust user info DTO 對齊 base `Api.Auth.UserInfo` 欄位
- **B4 Refresh token rotation** — DESIGN-B 形態下由 rust 自實作（§3.1）
- **B6 Captcha 整套** — 歸 §4.2 抽離項

### §4.2 抽離項清單 × stub 行為 × 升級路徑

**繼承 DESIGN-A §4.2**（identical） — 5 條抽離項清單：sendCaptcha / verifyCaptcha / `/auth/error` / `batchDeleteUser` / `/mock/getLastTime`；stub 行為、UI 影響（test/demo/admin role gate）、升級路徑（換真實作 + Casbin 擴 allow）與 DESIGN-A 完全一致。**5 條中 `batchDeleteUser` 由 F9 `systemManage-alias-router` 統一交付、其餘 4 條由 F11 `extracted-stubs` 統一交付**。

---

## §5 風險與一致性

### §5.1 雙服務一致性（在 DESIGN-B 形態下不適用）

> DESIGN-A 的 §5.1（JWT 共識 / 雙重 RBAC enforcement 防呆 / User info + sys_tokens 跨服務同源）在 DESIGN-B 形態下**整組消失**：單後端、無雙服務協作、無 cross-service consistency 議題。

JWT secret / Casbin enforcement / user info 等項目在 DESIGN-B 內為「進程內單一實作」、無需協調 — 風險自然不存在。

### §5.2 資料變動原則衍生

**繼承 DESIGN-A §5.2** 全部三個子節（identical）：

- **§5.2.1 Audit log 完整性** — 業務 + audit 同 transaction；audit 範疇邊界（DB 原子單位內事實 vs 跨資源 side effect）；補償機制（Outbox / TTL fallback / 定期 full reload / Subscriber health check）— DESIGN-B 形態下 outbox 仍適用（為未來水平擴展準備）、TTL fallback 仍適用（為進程內 cache 兜底）、定期 reload 仍適用、subscriber health check 在無 subscriber 時不必需
- **§5.2.2 Soft delete 衍生** — 三項風險（filter 忘記、UNIQUE 撞軟刪 row、Casbin policy orphan）與緩解全同 DESIGN-A
- **§5.2.3 Cleanup job 安全 + Audit log 成長** — cleanup job 獨立 credential、threshold config、dry-run、idempotent；audit log 表 partition by month、retention 策略 — 全同 DESIGN-A

---

## §6 spec-kit feature 切分建議

### §6.1 Feature 清單（執行順序）

| # | Feature | 範疇 | 與 DESIGN-A 關係 |
|---|---|---|---|
| **Phase 1：基礎設施（P1）** ||||
| F1 | `jwt-secrets` | JWT secret（單服務簡化版）、algorithm 拍板、claim 欄位列表；docker compose envvar 注入 | 繼承 DESIGN-A F1（簡化：無雙服務共識） |
| F2 | `audit-log-infrastructure` | sys_operation_log schema、transaction 邊界守則、補償機制（outbox / TTL）| 繼承 DESIGN-A F2（identical） |
| F3 | `soft-delete-infrastructure` | entity 表 migration、Sea-ORM scoped finder、partial unique index、Casbin orphan cleanup | 繼承 DESIGN-A F3（identical） |
| F4 | `response-shape-alignment` | 路線 II + camelCase + user info DTO | 繼承 DESIGN-A F4（identical） |
| **Phase 2：核心 auth + RBAC menu（P2）** ||||
| F5 | `auth-login-and-dynamic-menu` | `/auth/{login, getUserInfo}` + `/route/getUserRoutes` + Casbin enforce + **redis pub-sub channel `casbin:policy:invalidate` 跨 rust instance cache invalidation 機制（強制：DESIGN-B v1 即支援水平擴展）** | 繼承 DESIGN-A F5 + 擴大 scope（新增 pub-sub channel；DESIGN-A 中 Casbin pub-sub 設計見 §3.3「Casbin policy 表」，落地時點為 F10 nestjs bridge；DESIGN-B 改放 F5 是因為 Casbin enforce 在 F5 首次啟用） |
| F6 | `route-guard` | `/route/{getConstantRoutes, isRouteExist}` + base vue-router guard | 繼承 DESIGN-A F6（identical） |
| **Phase 3：主流業務 endpoint（P3）** ||||
| F7 | `manage-crud-alignment` | manage/* 4 module CRUD shape 對齊 + audit + 軟刪 + Menu CRUD | 繼承 DESIGN-A F7（identical） |
| F8 | `assign-users` | rust `/authorization/assign-users` 補位 | 繼承 DESIGN-A F8（identical） |
| F9 | `systemManage-alias-router` | rust 10 條 alias thin wrapper | 繼承 DESIGN-A F9（identical） |
| **Phase 4：補位 + 抽離項 + cleanup（P4）** ||||
| F10 | `rust-refresh-token` | rust 自實作 refresh token rotation：寫 sys_tokens（rotation_chain）、JWT 重簽、舊 token revoke；含相關 Casbin policy 設定 | **DESIGN-B 內取代 DESIGN-A F10 + DESIGN-A F13**（DESIGN-A 的「nestjs bridge + 後續 rust 補位」在 DESIGN-B 內合併為單一 feature） |
| F11 | `extracted-stubs` | 4 條抽離項 stub + Casbin policy | 繼承 DESIGN-A F11（identical） |
| F12 | `cleanup-job` | 獨立 cron job + dry-run + 獨立 credential | 繼承 DESIGN-A F12（identical） |

**DESIGN-B 中不適用的 DESIGN-A feature**：
- ~~DESIGN-A 的 F10 `refresh-token-nestjs-bridge`~~ — DESIGN-B 無 nestjs，直接由 DESIGN-B 的 F10 `rust-refresh-token` 取代
- ~~DESIGN-A 的 F13 `rust-refresh-token-impl`~~ — DESIGN-B 起點即 rust-only，併入 DESIGN-B 的 F10
- ~~DESIGN-A 的 F14 `design-a-to-b-cutover`~~ — DESIGN-B 起點即為目標形態，無 cutover 動作

### §6.2 依賴與拍板優先序

```
                  ┌─ F1 (JWT) ─┐
                  │            ├─ F5 ─ F6 ─┐
              ┌─ F2 (audit) ─┤             ├─ F7 ─ F8     ─┐
              │              │             │     └─ F9      │
P1 foundation ┼─ F3 (soft)  ─┤             │                ├─ F10 (rust-refresh-token)
              │              │             │                ├─ F11 (stubs)
              └─ F4 (shape) ─┘             │                └─ F12 (cleanup job)
```

**P1（必先）**：F1-F4 — 任何 endpoint 動工前必須先就位
**P2（解鎖 base 主體）**：F5-F6 — 登入 + 動態 menu 跑通
**P3（解鎖 manage/* 與 systemManage）**：F7-F9 — base `manage/*` 4 view + alias 跑通
**P4（補位 + 邊角 + 維運）**：F10-F12 — refresh token + 抽離項 + cleanup

**拍板原則**：
- P1 4 個 feature 任一順序皆可（平行 spec-kit），但**必須**全部完成才能動 P2
- P2 → P3 → P4 嚴格順序（後者依賴前者）
- F10 / F11 / F12 之間可平行；F10 建議優先（refresh token rotation 是 auth flow 完整性必需）

**與 DESIGN-A 拍板原則差異**：
- DESIGN-B 無 P5 migration phase
- DESIGN-B 無 F10/F11「都建議等 F9 完成」的約束（DESIGN-B 內 F10 是 rust 自實作、不存在「partial state 暴露給 base」風險）

---

## 附錄：從 DESIGN-A 遷移到 B

若 rev1 起點走 DESIGN-A（過渡有 nestjs），最終 cutover 到 DESIGN-B 形態時的步驟（高層）：

1. **F13 `rust-refresh-token-impl` 在 DESIGN-A 內完成**：rust 補實作 refresh token rotation，與 nestjs 共存運行驗證
2. **F14 `design-a-to-b-cutover` 在 DESIGN-A 內執行**：
   - nginx routing 從 nestjs upstream 改 rust upstream（刪除 §2.2 的 TRANSITIONAL marker block）
   - docker-compose 移除 nestjs container
   - redis Casbin pub-sub channel 可選保留（為未來 rust 水平擴展準備）或拔除
3. **DESIGN 切換**：以 DESIGN-B 為設計權威；DESIGN-A 文件保留作為歷史記錄

若 rev1 起點直接走 DESIGN-B（greenfield rust-only），則跳過上述遷移步驟，本檔即為設計權威。

---

> **下一步**：本 DESIGN-B 完成後，進入 [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)（統合 DESIGN-A/DESIGN-B 兩種部署形態）。具體 code/config patch 由 spec-kit `specify → plan → tasks → implement` 階段落地。
