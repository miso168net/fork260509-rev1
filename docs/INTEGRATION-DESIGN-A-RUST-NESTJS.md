# DESIGN-A：rust + nestjs 三方協作整合（過渡至 DESIGN-B）

> 日期：2026-05-14
> 範圍：rev1 base-web（`fork260509-soybean-admin-base` 的 `example` 分支）↔ rev1 rust-api（`fork260509-soybean-admin-rust` 的 `main` 分支）↔ nestjs（`fork260509-soybean-admin-nestjs`，過渡性補位）
> 資料來源：[`INTEGRATION-RESEARCH.md`](INTEGRATION-RESEARCH.md) + 直接讀 source + `graphify-out/`（圖譜限制見 [`GRAPHIFY-NOTES.md`](GRAPHIFY-NOTES.md)）
> 性質：本檔為 **設計階段**（拍板方案 + 抽離項清單 + spec-kit feature 切分）；具體 code/config patch 由 spec-kit `specify → plan → tasks → implement` 階段落地
> 兩條軌道並存：[`INTEGRATION-DESIGN-B-RUST-ONLY.md`](INTEGRATION-DESIGN-B-RUST-ONLY.md)（最終形態）+ [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)（部署統合）— 撰寫順序為 A → B → W

---

## §1 設計原則

### §1.1 RBAC 中心原則

DESIGN-A 的設計支柱：**Casbin + menu「不符權限不顯示」**。落實在兩條主軸並重：

- **Runtime 動態 menu**（user 端首要）：base 啟動時呼叫 `GET /route/getUserRoutes`，rust 依當前 user 的 role × Casbin policy × role-menu 關聯，回算出該 user **可見** 的 menu 樹。前端僅接收後端結果，不在前端做 access check（前端 hide 只是 UX，後端 enforce 才是 fail-safe）。
- **Menu CRUD**（admin 端管理）：admin 透過 `manage/menu` view，對 menu 表 + role-menu 關聯做 CRUD（base 期望 `/systemManage/getMenuTree`、`getMenuList/v2`、`getAllPages`；rust 用 `/route/*` 滿足，透過 alias 對外）。

**含意**：未實作的功能（如 SMS captcha、batch delete）也要進 menu 表，靠 Casbin policy 預設**多數 role deny，test role allow（給少數測試者）** — 用 RBAC「不顯示」自然遮蔽，而不是 view 砍掉。

### §1.2 雙服務協作原則

- **rust 主後端**：主要 endpoint、Casbin RBAC enforcement、主要 data layer、`/systemManage/*` alias。
- **nestjs 補位**：填 rust 缺的特定功能（首要 `POST /auth/refreshToken`），沿用 nestjs source、不改 code。
- **單一職責、不互相 forward（嚴版）**：每個 endpoint 只由一個後端負責 enforcement；nginx config 拍板誰負責什麼，**禁止**後端間 HTTP/RPC 呼叫對方 API。跨服務狀態同步**只能**透過共用 DB（postgres）與 redis pub-sub。
- **nestjs 為過渡性補位 — 最終目標是 nestjs 退場、全面遷移到 [`DESIGN-B`](INTEGRATION-DESIGN-B-RUST-ONLY.md)**；每個 A 階段決策都要過「未來 nestjs 拔掉時順嗎」這道濾鏡。
- **共識資源**：JWT secret、postgres、Casbin policy 表、`sys_operation_log` 表（詳見 §3.3）。

### §1.3 base 不改動邊界

- **不動**：`src/views/`、`src/components/`、`src/service*/api/*.ts`（business code）、`src/router/`、`src/store/`。
- **可動**：`.env`、`.env.dev`、`.env.prod`（application-level config）。
- **特例**：`apifoxToken` 寫死在 source — 整合後不打 apifox、自然失效、不需動。
- **mock 保留**：`src/service-alova/mocks/` 保留但 prod 不啟（既有 `import.meta.env.DEV` gate）。

### §1.4 範圍宣告

- **UI 範圍**：base example 全部 ~40+ view 保留，不砍。
- **後端 endpoint 範圍**：base 期望 ~19 條核心 + `/systemManage/*` 10 條 alias，完整對接。
- **抽離項（DESIGN-A v1 暫不真實作、以 stub + Casbin gate）**：見 §4.2。
- **抽離項的 menu 處理**：在 menu 表，靠 Casbin policy 多數 role deny / test 或 demo role allow — 用 RBAC 自然隱藏，避免 view 砍掉破壞 example 結構。
- **抽離項升級時**繼承 §1.5 規範（soft delete + audit），不再單獨寫。

### §1.5 資料變動原則：soft delete + 全域 audit log

- **所有 DELETE 操作均為 soft delete**：DB row 不物理刪除，只標 `deleted_at TIMESTAMPTZ`（或等價 flag）；既有 row 物理留存。
- **所有 SELECT 預設過濾**：`WHERE deleted_at IS NULL`；Sea-ORM 層提供 scoped finder（避忘記 filter）。
- **所有寫入操作必寫 audit**：INSERT / UPDATE / SOFT_DELETE / RESTORE / HARD_DELETE 全進 `sys_operation_log`（rust 既有表，schema 擴充對齊全 entity）。
- **Audit log 為一等公民**：本表**不 soft delete、不 cleanup**，永久保留（retention policy 留 spec-kit）。
- **物理刪除由獨立 cleanup job 負責**：cron 排程定期物理刪除 `deleted_at < threshold` 的 row；**cleanup job 本身也寫 audit**（operation = `HARD_DELETE`）。
- **資料完整性 trade-off**：寫入量 2N（業務 + audit），rev1 admin-heavy 低 throughput 場景接受此代價以換取 forensics / compliance。

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
│   - reverse proxy /api/* → backends          │
└──┬─────────────────────┬─────────────────────┘
   │                     │
   │ /api/auth/refresh*  │ /api/*（其餘）
   │ （Transitional）     │
┌──▼────────────┐     ┌───▼─────────────────────┐
│   nestjs      │     │   rust-api              │
│   過渡補位     │     │   主後端                 │
│   - refresh   │     │   - auth/login/getInfo  │
│     token     │     │   - /route/* (動態 menu) │
│   (A → B 拔)  │     │   - /user, /role, /menu │
│               │     │   - Casbin enforce      │
│               │     │   - /systemManage/*     │
│               │     │     (alias router)      │
└──┬────────────┘     └───┬─────────────────────┘
   │  ❌ 不互相呼叫        │
   │      (嚴版禁止)       │
   └──────┬───────────────┘
          │
   ┌──────▼─────────────────┐ ┌──────────────┐
   │   postgres             │ │   redis      │
   │   - 共用 entity 表      │ │   - Casbin   │
   │   - casbin_rule        │ │     policy   │
   │   - sys_tokens         │ │     pub-sub  │
   │   - sys_operation_log  │ │   - cache    │
   │   - 事實源              │ │              │
   └────────────────────────┘ └──────────────┘
```

**分層原則**：
- **nginx 在最外緣**：TLS 終止、static 服務、`/api/*` 反向代理；不做業務邏輯
- **rust 是主後端、nestjs 是過渡補位**：兩者**平級**（不存在 nestjs → rust forward 或 rust → nestjs forward）
- **共用基礎設施 = 事實源**：postgres 是**唯一持久狀態權威**（user / role / menu / Casbin policy / sys_tokens / sys_operation_log 全在這）；redis 是**輔助通道**（cache + Casbin policy invalidation pub-sub）
- **嚴版禁令具現化**：圖中後端之間是 ❌ 線，不是 ↔ 線；任何兩端協調都需經過 postgres 或 redis

### §2.2 nginx 路由分流規則

| Location | 上游 | 用途 | 狀態 |
|---|---|---|---|
| `/` | base-web static | SPA assets | 永久 |
| `/api/auth/refreshToken` | nestjs | Refresh token rotation | **Transitional**（A → B 改 rust）|
| `/api/*`（其餘） | rust-api | 主要 endpoint + Casbin enforce + `/systemManage/*` alias + 抽離項 stub | 永久 |

**設計要點**：

- **base 的 `VITE_SERVICE_BASE_URL`** 設成相對 path `/api`（不再指 apifox mock），所有 API call 自動經 nginx 分流；具體 nginx config 細節留 [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)
- **抽離項不在 nginx 層處理**：抽離項由 rust handler 註冊 stub + Casbin policy 控管，nginx 對其完全透明（見 §4.2）
- **單向流向**：所有跨後端協調走 postgres / redis（如圖示），nginx 不參與任何「rust → nestjs」或反向的中繼

**nginx config 強制慣例**：所有 nestjs-bound location 及對應 upstream 宣告必須包在以下 marker block 內，A → B 遷移時直接刪除整個 block + 把對應 location 的 `proxy_pass` 改指 rust-api：

```nginx
# ============================================================
# >>>>> TRANSITIONAL BEGIN — A → B 拔除點 <<<<<
# 以下整段（含 upstream）在 nestjs 退場時刪除
# ============================================================
upstream nestjs_transitional {
    server nestjs:3000;
}

location = /api/auth/refreshToken {
    # Transitional: 過渡期由 nestjs 補位
    proxy_pass http://nestjs_transitional/auth/refreshToken;
    # ...其他 proxy_set_header / timeout ...
}

# ============================================================
# <<<<< TRANSITIONAL END >>>>>
# ============================================================
```

---

## §3 後端任務拆解

### §3.1 rust 主負責 endpoint（DESIGN-A v1）

| Endpoint 群 | 狀態 | 主要工作 |
|---|---|---|
| `/auth/{login, getUserInfo}` | 既有 | response shape 對齊（success code / camelCase / userInfo 欄位 — §4.1）|
| `/auth/{sendCaptcha, verifyCaptcha}` | **抽離項 stub** | 補 handler，回固定碼 `000000` + log；Casbin policy 預設多數 role deny、test role allow |
| `/auth/error` | **抽離項 stub** | demo only，echo `?code=&msg=` 為 response；未來不會接生產用途 |
| `/route/{getConstantRoutes, getUserRoutes}` | 既有 | response shape 對齊 |
| `/route/isRouteExist` | **新做（簡單）** | 查表回 boolean |
| `/user, /role, /menu, /domain` CRUD | 既有 | response shape 對齊，保留 Casbin enforce；軟刪 + audit 自動繼承 §1.5 |
| `/api-endpoint, /access-key, /log-audit/*, /org` | 既有 | 同上 |
| `/sandbox/{simple-api-key, complex-api-key}` | 既有 | API key sign demo（rust 獨有，保留）|
| `/authorization/assign-users` | **rust 新做** | 寫 Casbin `g` rule 把 user 加到 role；pattern 同既有 `/user/add_policies` |
| `/systemManage/*` | **alias router** | 10 條 thin wrapper 包既有 handler（RESEARCH §6.2 方案 B）；含 batch delete stub |

**實作守則**：
- 抽離項 stub handler **必須在 rust router 註冊**（不能不存在），Casbin policy 控管「誰能用」
- `/systemManage/*` alias 重用既有 `/user, /role, /route` service；新增約 2 個 thin wrapper（`update_user_post` 用 POST 包 PUT 邏輯、`delete_user_by_body` 從 body 抽 id）
- response shape 對齊細節（B1/B2/B3/B5）在 §4.1 統一拍板，不在 §3 重複
- 所有 CRUD endpoint **隱含** soft delete + audit（§1.5），不需 endpoint-by-endpoint 寫

### §3.2 nestjs 補位 endpoint（DESIGN-A v1，過渡）

| Endpoint | 用途 | A → B 拔除策略 |
|---|---|---|
| `POST /auth/refreshToken` | refresh token rotation | rust 補齊後 nginx 改路由、刪 TRANSITIONAL block |

**守則**：
- nestjs source **不改**，只用既有 build artifact / docker image
- endpoint 列表 **保持最小、不擴張**；A → B 過程中只縮減不擴增（`assign-users` 不放 nestjs — 違反 §3.3 「Casbin policy 主寫權威唯一為 rust」原則）
- 每個 nestjs-bound endpoint 在 nginx config 都包在 §2.2 的 TRANSITIONAL marker block 內
- nestjs 寫 `sys_tokens` 時必須同步寫 `sys_operation_log`（§1.5 全域 audit）
- 共識資源（JWT secret / sys_tokens 表 / Casbin policy 表 / sys_operation_log）細節見 §3.3

### §3.3 介接面（共識資源 × 跨後端協調）

四個共識資源、各自權威與讀寫分工：

#### JWT 簽章
- **共用 signing secret**：docker compose 用同一個 envvar 注入兩 container（具體 envvar 名 / 注入方式留 W-DEPLOYMENT）
- **演算法 + claim format 兩端共識**：HS256 vs RS256 拍板留 spec-kit；claim 至少含 `sub, exp, iat, roles`，欄位列表兩端 align
- **DESIGN-A → DESIGN-B**：nestjs 退場後 rust 持續用同一 secret 簽 + 驗，**零遷移成本**

#### sys_tokens 表
- **nestjs = 寫入者**（refresh 時寫新 token row、舊 token 標 revoked / 記 rotation_chain）
- **rust = 讀取者**（驗 token valid 時查表；logout 時可選寫入 revoke）
- **表 schema 共識**：rust 在 DESIGN-A v1 雖不寫，**migration 仍預先建立 sys_tokens schema**（rust 主導 migration，nestjs 既有 prisma schema 對齊到此 schema）— 讓 A → B 時 rust 直接接手寫，不需 schema 變動
- **DESIGN-A → DESIGN-B**：rust 接手 refresh handler，繼續用同表

#### Casbin policy 表
- **rust = 主寫權威**：admin 透過 `manage/role` view 走 rust，policy 變更只在 rust 觸發
- **nestjs = read-only**：為自己 enforcement 載 policy；**不寫**（即使 nestjs source 內可能有 write capability 也不啟用 — DESIGN-A v1 紀律）
- **redis pub-sub channel** `casbin:policy:invalidate`：rust 寫 policy 後 publish；nestjs 訂閱後 reload enforcer cache
- **DESIGN-A → DESIGN-B**：nestjs 退場後 channel 無訂閱者，rust 可選保留 publish（無 effect 但 future-proof）或一併拔除

#### sys_operation_log 表（全域 audit）
- **rust = 主寫**：所有業務 endpoint 改 entity 時同 transaction 寫 audit
- **nestjs = 必寫**：refresh token 動作必寫 audit row（actor / timestamp / operation = REFRESH_TOKEN）
- **schema 共識**：rust 主導 migration、擴充欄位（actor_user_id / timestamp / operation / entity_type / entity_id / payload before & after / client_ip）
- **cleanup job = 寫**：物理刪除時 actor = `cleanup_job` 寫 audit
- **DESIGN-A → DESIGN-B**：rust 接手所有寫入、schema 不變

#### 共識守則總結
- 所有共識點集中管理在 envvar / migration / config，**不散落在 nestjs 與 rust 各自的 code path**
- DESIGN-A → DESIGN-B 遷移影響範圍：拔 nestjs container、改 nginx routing、redis pub-sub 可選保留 — **不需 DB migration**

---

## §4 GAP 解法

### §4.1 跨欄位 GAP 拍板

#### B1 + B2: success code + 多碼系統（路線 II）

**拍板：rust HTTP 永遠 200 + body code 為 business code**

- HTTP 層只用 200（除 server-level error）；body `code: u16` 為 business code（0 success、8888 logout、7777 modal、9999 expired…）
- rust 全 handler 改：error path 不用 `StatusCode::UNAUTHORIZED.as_u16()`，改 business code
- base `.env` 改 1 var（`VITE_SERVICE_SUCCESS_CODE=0`），其他保留（8888/7777/9999）
- nestjs 同樣 HTTP 200 + body code（spec-kit verify nestjs 既有預設）
- 比對機制可信：base 用 `String(data.code) === VITE_SERVICE_SUCCESS_CODE` — number 0 → `"0"` → 通過

**理由**：
- HTTP transport 與 business 語意**分離**（rev1 整合期紀律）
- axios `validateStatus` 行為一致（全 200 → onBackendSuccess → base 用 body code 判斷成敗）
- HTTP standard 不需被當「business code 命名空間」勉強塞 7+ 個語意

#### B3: camelCase ↔ snake_case

- rust 所有 request body / response payload struct 加 `#[serde(rename_all = "camelCase")]`
- 工作量：每個 struct 加一行 attribute

#### B5: User info 形狀對齊

- rust `SysAuthService` 的 user info DTO 對齊 base `Api.Auth.UserInfo` 預期欄位（含 `buttons`、`userInfo`、`roles` 等）
- 具體欄位列表在 spec-kit `auth-login-and-dynamic-menu` feature 階段逐欄位 align

#### 其他 GAP

- **B4 Refresh token rotation**：已歸 §3.2 nestjs 補位
- **B6 Captcha 整套**：已歸 §4.2 抽離項

### §4.2 抽離項清單 × stub 行為 × 升級路徑

承 §3.1 的抽離項：

| Endpoint | Stub 行為（DESIGN-A v1） | UI 影響 | 升級路徑（spec-kit feature） |
|---|---|---|---|
| `/auth/sendCaptcha` | 接收 `phone`、log + 回固定碼 `000000` | test role 看得到「發送驗證碼」按鈕、點下去得到 success；其他 role 看到 menu 隱藏；按一般登入流程不需驗證碼 | rust handler 改接真 SMS provider；Casbin policy 擴到所有 role |
| `/auth/verifyCaptcha` | 接收 `phone, code`、`000000` 為一律驗證成功 | 同上 | 同上 |
| `/auth/error` | demo only，未來不會接生產用途；echo `?code=&msg=` 為 response | demo role 在 `function/request` view 看到 demo button works；其他 role menu 隱藏該 view（或顯示但點下去 403）| 不升級 |
| `/systemManage/batchDeleteUser` | 接收 `{ ids: [] }`、迴圈呼叫單筆 soft delete + audit（per-row 仍同 transaction、滿足 §1.5）；**無 batch-level transaction（中途失敗無法 atomic rollback）、無 casbin orphan cleanup** | admin role 可用、但缺批次原子性與 policy 清理 | spec-kit feature：loop in batch-level transaction + per-row audit + casbin policy cleanup + 批量上限 100 + chunking 策略；三維度（原子性 / performance / audit）trade-off 在 spec-kit 階段拍板 |
| `/mock/getLastTime` | 回 `{ time: server now }` | demo role 在 `alova/scenes` polling-request 看得到 polling demo；其他 role menu 隱藏該 view | 不升級（永久 demo 用） |

**抽離項管理紀律**：
- 所有 stub handler **必須**在 rust router 註冊（不能不存在）
- 預設 Casbin policy：抽離項只開給 `test` / `demo` / `admin` 等明確角色，其餘 role deny
- Menu 表內**保留**該 menu 項，靠 `role × menu` 關聯 + Casbin policy 雙重 gate
- spec-kit feature 階段升級任一 stub 時：實作真 handler + Casbin policy 擴開放對象 + nginx 與前端**零改動**
- 升級時繼承 §1.5 規範（soft delete + audit）

---

## §5 風險與一致性

風險分兩大類：**A. 雙服務協作風險**（DESIGN-A 過渡期間）；**B. 資料變動原則衍生風險**（§1.5 soft delete + audit log）。

### §5.1 雙服務一致性

#### §5.1.1 JWT 共識
- **風險**：兩端 secret / algorithm / claim format 任一不一致 → token verify 失敗或安全漏洞
- **緩解**：docker compose 同一 envvar 注入兩 container；algorithm（HS256 vs RS256）與 claim 欄位列表（至少 `sub, exp, iat, roles`）spec-kit 階段拍板共識；單一處修改、兩端同步
- **DESIGN-A → DESIGN-B**：nestjs 退場後 rust 仍用同一 secret，零遷移成本

#### §5.1.2 雙重 RBAC enforcement 防呆
- **風險**：同一 endpoint 兩個後端都 enforce → policy 不同步時放行不該放行的 request
- **緩解**：嚴版禁 forward + 單一職責（§1.2）已大幅降低；nginx config 內每個 location 明確標 backend owner；spec-kit 階段加 CI 檢查（防 nginx 同 endpoint 出現多 upstream）
- **DESIGN-A → DESIGN-B**：問題消失（單後端無雙重 enforce）

#### §5.1.3 User info + sys_tokens 跨服務同源
- **風險**：rust 與 nestjs 對同 user 的 view 不一致；nestjs 寫 sys_tokens 後 rust 不認 schema
- **緩解**：共用 sys_user 表 read-only 對齊；sys_tokens schema rust 主導 migration（即使 A v1 rust 不寫）；JWT 簽章自帶驗證，sys_tokens 表只作 revocation list / rotation chain（避免每次 request 都查表）
- **DESIGN-A → DESIGN-B**：rust 接手寫入，零 schema 改動

### §5.2 資料變動原則衍生

#### §5.2.1 Audit log 完整性

- **風險（兩面）**：
  - **內向**：業務寫成功、audit 寫失敗 → 操作未留痕，違反「全域 audit」總則
  - **外向**：audit 寫成功但跨資源 side effect（redis pub-sub / SMS / 外部 API）失敗 → audit 紀錄正確、系統實際狀態與紀錄漂移

- **緩解（原子性層）**：業務 + audit **同一 DB transaction**（一起 commit / rollback）；audit 寫失敗即整體 rollback、user 看到 error；不容許 application-level retry「補寫 audit」（破壞 forensics 完整性）

- **設計原則：Audit log 的範疇邊界**
  - **Audit log 紀錄的事實 = 「DB 原子單位內已 commit 的狀態變動」**：誰、何時、對哪個 entity 做了什麼 SQL-level 變更
  - **Audit log 不紀錄**：跨資源 side effect 的成敗（redis pub-sub 是否送達、SMS 是否實際發出、外部 API call 是否成功、訂閱者 cache 是否 reload）
  - 跨資源狀態一致性**透過獨立 event 機制處理**，與 audit log 解耦

- **具體場景示意**（admin 改 Casbin policy）：

  ```
  ┌─ TRANSACTION 內 (DB 原子單位) ─────────────────┐
  │ UPDATE casbin_rule ...                       │
  │ INSERT INTO sys_operation_log ...            │ ← audit 確認此 DB 變動已 commit
  │ COMMIT                                       │
  └────────────────────────────────────────────────┘
                ↓ (transaction 結束、audit 已寫定)
  ┌─ Outside transaction (跨資源 side effect) ────┐
  │ Redis PUBLISH casbin:policy:invalidate       │ ← 失敗也不影響 audit 正確性
  └───────────────────────────────────────────────┘
  ```

  若 publish 失敗 → nestjs enforcer cache 暫時不同步、短時間內 read-side stale → **但 audit 紀錄並無錯誤**（DB 變動確實已 commit、誰做的也記得）。

- **跨資源補償機制**（具體選哪個 + 怎麼實作留 spec-kit `audit-log-infrastructure`）：

  | 機制 | 角色 | 對 DESIGN-A → B 遷移影響 |
  |---|---|---|
  | **Outbox 模式** | transaction 內同時寫業務 + audit + outbox event row；獨立 worker 讀 outbox 並重試 publish 直到成功 | nestjs 退場後 outbox 仍可用，或單服務時直接無 publish 需求 |
  | **TTL fallback** | nestjs enforcer cache 設 TTL（如 5 分鐘）；publish 漏掉時 cache 自然失效、重 load from DB | nestjs 退場後此機制無需，rust 進程內 cache 行為由 rust 自定 |
  | **定期 full reload** | nestjs 定期（每小時）full reload Casbin policy from DB；pub-sub 之外的 idempotent fallback | 同上 |
  | **Subscriber health check** | 監控 redis subscriber lag；偵測偏移時 alarm + 強制 reload | 同上 |

- **DESIGN-A v1 最低紀律**：
  - 業務 + audit **必須**同 transaction（spec-kit 強制）
  - Outbox / TTL fallback / health check 等補償機制**至少擇一**在 spec-kit `audit-log-infrastructure` 落地（推薦 outbox + TTL 雙保險）
  - nestjs enforcer cache 必須有 TTL（即使無 outbox / health check）→ 兜底保證最終一致

#### §5.2.2 Soft delete 衍生

- **風險（三項）**：
  - 開發者忘記 `WHERE deleted_at IS NULL` filter → 軟刪資料漏出 SELECT 結果
  - `UNIQUE(username)` 撞軟刪 row → 無法用同名重建
  - User soft delete 後 Casbin policy `g, user_X, role_Y` 是 orphan
- **緩解**：
  - Sea-ORM 提供 base entity trait 預設加 filter（spec-kit `soft-delete-infrastructure` 建立）
  - DB schema 用 **partial unique index** `WHERE deleted_at IS NULL`（unique 只對 active row 約束）
  - User soft delete handler **連帶軟刪**對應 casbin_rule（cascade 規則 spec-kit 階段拍板）

#### §5.2.3 Cleanup job 安全 + Audit log 成長

- **Cleanup job 風險**：誤刪非預期 row（threshold 配錯）、與一般 backend 共用 credential 擴大攻擊面、重跑非 idempotent
- **Cleanup job 緩解**：
  - 獨立 DB credential（最小權限 — DELETE 對 entity 表 + INSERT 對 sys_operation_log）
  - Threshold 從 config 讀、不寫死；首次部署提供 dry-run mode 列印「將刪 N row」
  - 物理刪除前 N 天可選通知（spec-kit feature 設計）
  - **物理刪除必寫 audit**（`operation = HARD_DELETE, actor = cleanup_job`），cleanup job 自身即 actor
  - Idempotent：基於 `deleted_at < threshold` 條件查詢，重跑無副作用
- **Audit log 成長風險**：寫入量 2N，audit 表持續成長 → DB I/O / 查詢效率下降；audit 本身**不 cleanup**
- **緩解**：sys_operation_log 表 partition by month；retention 策略（cold storage / archive table）spec-kit 階段拍板；index 限縮（actor_user_id + timestamp + entity_type）

---

## §6 spec-kit feature 切分建議

### §6.1 Feature 清單（執行順序）

| # | Feature | 範疇 | 主要交付 | 依賴 |
|---|---|---|---|---|
| **Phase 1：基礎設施（P1）** ||||
| F1 | `jwt-secrets` | JWT secret 共享、algorithm（HS256 vs RS256）拍板、claim 欄位列表（sub/exp/iat/roles/...）對齊；docker compose envvar 注入機制 | rust + nestjs 雙端共識，A → B 後 rust 沿用 | — |
| F2 | `audit-log-infrastructure` | `sys_operation_log` schema 擴充（含 actor/timestamp/operation/entity_type/entity_id/payload before & after）；transaction 邊界守則；outbox 模式落地；redis subscriber TTL fallback | 全域 audit 紀律（§1.5 + §5.2.1）；spec-kit 內定義「業務 + audit 同 transaction」測試規範 | — |
| F3 | `soft-delete-infrastructure` | 所有 entity 表 migration 加 `deleted_at`；Sea-ORM scoped finder trait；partial unique index；Casbin orphan cleanup 規則拍板 | 全域 soft delete 紀律（§1.5 + §5.2.2） | — |
| F4 | `response-shape-alignment` | rust 全 handler 改用 path II（HTTP 200 + body business code）；全 request/response struct 加 `#[serde(rename_all="camelCase")]`；user info DTO 對齊 base `Api.Auth.UserInfo` 欄位 | B1/B2/B3/B5 GAP 一次性解決 | — |
| **Phase 2：核心 auth + RBAC menu（P2）** ||||
| F5 | `auth-login-and-dynamic-menu` | `/auth/{login, getUserInfo}` + `/route/getUserRoutes` 整套（Casbin enforce + role-menu 關聯計算）；A 的設計支柱第一條落地 | base `_builtin/login` 跑通 + 登入後動態 menu | F1, F2, F3, F4 |
| F6 | `route-guard` | `/route/{getConstantRoutes, isRouteExist}` + base vue-router guard 串接 | base 路由守衛行為符合預期 | F5 |
| **Phase 3：主流業務 endpoint（P3）** ||||
| F7 | `manage-crud-alignment` | manage/* 4 個 module（user / role / menu / domain）對應 endpoint shape 對齊 + Casbin enforce + 軟刪 + audit；包含 menu CRUD（A 設計支柱第二條） | base `manage/*` 4 view 跑通 | F5 |
| F8 | `assign-users` | `/authorization/assign-users`（rust 補位，pattern 同既有 `/user/add_policies`） | 完整 user × role 關聯管理 | F7 |
| F9 | `systemManage-alias-router` | rust 10 條 `/systemManage/*` thin wrapper（含 `update_user_post` POST 包 PUT、`delete_user_by_body` 從 body 抽 id、`batch_delete_users` stub） | base 既有 service 對 systemManage 全跑通 | F7 |
| **Phase 4：過渡橋 + 抽離項 + cleanup（P4）** ||||
| F10 | `refresh-token-nestjs-bridge` | nestjs container 部署、`sys_tokens` schema 共識（rust 主導 migration）、nginx TRANSITIONAL block、Casbin policy redis pub-sub channel | refresh token rotation 跑通（過渡狀態） | F1, F2, F5 |
| F11 | `extracted-stubs` | 4 條抽離項 stub 統一交付：sendCaptcha / verifyCaptcha / `/auth/error` / `/mock/getLastTime`（batchDeleteUser stub 在 F9 內已含）；對應 Casbin policy（test/demo role only） | demo 與 test 環境 view 跑通；prod 對一般 role 隱藏 | F2, F3, F4 |
| F12 | `cleanup-job` | 獨立 cron job（rust binary 或 standalone container）；threshold 從 config 讀；dry-run mode；獨立最小 credential；物理刪除寫 audit | 軟刪資料生命週期完整 | F3, F2 |
| **Phase 5：DESIGN-A → DESIGN-B 遷移（P5，未來）** ||||
| F13 | `rust-refresh-token-impl` | rust 補實作 refresh token rotation（取代 nestjs `/auth/refreshToken`）；繼承 F10 的 `sys_tokens` schema 與 redis pub-sub | rust 在 cutover 前準備就緒、共存運行驗證 | F10 |
| F14 | `design-a-to-b-cutover` | nginx routing 從 nestjs 改 rust；docker-compose 移除 nestjs container；redis pub-sub 可選保留或拔除；TRANSITIONAL block 整段刪除 | DESIGN-B 形態正式生效 | F13 |

### §6.2 依賴與拍板優先序

```
                  ┌─ F1 (JWT) ─┐
                  │            ├─ F5 ─ F6 ─┐
              ┌─ F2 (audit) ─┤             ├─ F7 ─ F8      ─┐
              │              │             │     └─ F9      │
P1 foundation ┼─ F3 (soft)  ─┤             │                ├─ F11 (stubs)
              │              │             │                ├─ F10 (refresh bridge)
              └─ F4 (shape) ─┘             │                │       └─ F13 ─ F14 (cutover, DESIGN-B)
                                           │                └─ F12 (cleanup job)
```

**P1（必先）**：F1-F4 — 任何 endpoint 動工前必須先就位
**P2（解鎖 base 主體）**：F5-F6 — 把登入 + 動態 menu 跑通，base `_builtin/login` + `home` + 路由守衛 OK
**P3（解鎖 manage/* 與 systemManage）**：F7-F9 — base `manage/*` 4 view + alias 跑通
**P4（過渡 + 邊角 + 維運）**：F10-F12 — nestjs 過渡橋 + 抽離項 stub + 物理 cleanup
**P5（DESIGN-B 遷移，未來）**：F13-F14 — 與 DESIGN-B 對應

**拍板原則**：
- P1 4 個 feature 任一順序皆可（平行 spec-kit），但**必須**全部完成才能動 P2
- P2 → P3 → P4 嚴格順序（後者依賴前者）
- F11 stubs 與 F12 cleanup 之間可平行
- F10 refresh bridge 與 F11 抽離項可平行，但**都建議等 F9 完成**（不然系統 partial state 暴露給 base）
- P5 在 P1-P4 全部穩定 + spec-kit feature 完成後才啟動；過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證

---

> **下一步**：本 DESIGN-A 完成後，依撰寫順序進入 [`INTEGRATION-DESIGN-B-RUST-ONLY.md`](INTEGRATION-DESIGN-B-RUST-ONLY.md)（將以「DESIGN-A 去 nestjs 維度」的簡化視角撰寫），然後 [`INTEGRATION-DESIGN-W-DEPLOYMENT.md`](INTEGRATION-DESIGN-W-DEPLOYMENT.md)（統合 A/B 兩種部署形態）。具體 code/config patch 由 spec-kit `specify → plan → tasks → implement` 階段落地。
