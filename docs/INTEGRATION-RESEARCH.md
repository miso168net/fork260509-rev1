# 整合評估：rev1 — base (example) × rust-api × nestjs 三方協作

> 日期：2026-05-12
> 範圍：rev1 base-web (`fork260509-soybean-admin-base` 的 `example` 分支) ↔ rev1 rust-api (`fork260509-soybean-admin-rust` 的 `main` 分支) ↔ nestjs (`fork260509-soybean-admin-nestjs`，作為 API provider candidate)
> 資料來源：直接讀 source（base/rust/nestjs/docs 各自源倉）+ `graphify-out/` 知識圖譜（注意限制見 [`GRAPHIFY-NOTES.md`](GRAPHIFY-NOTES.md)）
> 角色：本 doc 為 **研究階段**（事實盤點 + GAP 找出 + 策略候選），具體決策落 `INTEGRATION-PLAN.md`、具體 code/config 留實作 feature 階段

---

## 1. 整合背景與設計目標

### 1.1 為何要重做（rev1 vs fork260509）

`fork260509` workspace 過去做過一輪整合研究與計畫，但有幾個關鍵差異使其結論**不能直接套用 rev1**：

| 維度 | fork260509 | rev1 |
|---|---|---|
| base 來源分支 | `main`（極小 starter，僅 home + _builtin） | `example`（含 plugin/function/alova/pro-naive/multi-menu + manage 4 個 sys_ 模組） |
| base API 表面 | ~7 條 | ~19 條（systemManage 整套 + auth captcha 等多出 12 條） |
| nestjs 定位 | 「不在整合範圍內，僅參考」 | **API provider candidate**（rust + nestjs 共同提供，按各自實作完整度分工） |
| rust 角色 | 唯一後端 | 主後端（Casbin 權限控管），nestjs 補 rust 缺的 |
| 整合決策繼承 | — | **不繼承**（nginx 同源 / Sea-ORM pool / DB-backed refresh / migration init container / docker compose 部署形態等都需重評估） |

### 1.2 整合原則（rev1 約束）

1. **base 盡可能不改動已存在的程式碼** — 後端要配合 base 既有 API 路徑、payload shape、success code 等。base 改動範圍限於 `.env` / 路由配置 等 application-level config，不動 component / service 業務程式碼。
2. **rust 是主要後端**，負責 Casbin RBAC、low-level data layer、安全相關。可變動（base path / handler 補實 / payload reshape 等）。
3. **nestjs 不改動，但可被「拽進來」補 rust 缺失** — 同源於 fork260509 後端設計、與 rust 結構高度相似但細節有別（如 `POST /auth/refreshToken` rust 缺、nestjs 有）。三方協作下 nestjs 變成「現成可用的 API provider」而非單純參考材料。
4. **docs 不改動，僅作 base 設計理念來源** — 解 base 為何採雙 client、success code 為何用字串等問題。
5. **部署形態已定**：docker 容器內編譯 + docker-compose 運行（細節留 PLAN）。

### 1.3 4 個源倉的角色

| 源倉 | rev1 角色 | 改動策略 |
|---|---|---|
| `fork260509-soybean-admin-base` | 前端 starter（example 分支衍生 `rev1-admin-base-web`） | 盡量不改 |
| `fork260509-soybean-admin-rust` | 主後端（main 分支衍生 `rev1-admin-rust-api`） | 主要施工點 |
| `fork260509-soybean-admin-nestjs` | 補位後端 / 設計參考 | 不改動，按需「拽進來」 |
| `fork260509-soybean-admin-docs` | base 設計理念來源 | 不改動，只引用 |

### 1.4 RESEARCH 與 PLAN 的分工

| 文件 | 性質 | 內容 |
|---|---|---|
| `INTEGRATION-RESEARCH.md`（本檔） | 研究 | 事實盤點、GAP 找出、策略候選與 trade-offs |
| `INTEGRATION-PLAN.md`（待建） | 計畫 | 具體實施順序、code/config patch、Dockerfile/compose 內容 |
| `INTEGRATION-CHECKLIST.md`（待建） | 追蹤 | 進度 + retrospective |

---

## 2. base 設計理念盤點（從 docs/ 參考）

### 2.1 Vue 3 stack（基線技術選型）

- **Vue 3 + TypeScript + Vite7** — 標準 SFC，<script setup>，Vite 為 build/dev server
- **Naive UI** — 主元件庫（example 分支內所有業務 view 用 NaiveUI）
- **Pinia** — 狀態管理
- **vue-router 4** — 路由
- **UnoCSS atomic CSS** — utility-first CSS，搭配 `@unocss/preset-icons` icon system
- **pnpm monorepo**（base 內部）：`packages/*` 含 `@sa/axios`、`@sa/alova`、`@sa/hooks`、`@sa/scripts` 等 internal package

設計理念詳見 `fork260509-soybean-admin-docs/src/zh/guide/intro.md` 與 `zh/guide/quick-start.md`。

### 2.2 雙 API client：alova + axios

base 內**同時存在**兩套 service：

```
src/
├── service/                 ← axios-based (傳統)
│   ├── api/{auth,route,system-manage,index}.ts
│   └── request/{index,shared,type}.ts
└── service-alova/           ← alova-based (現代化、含 mock)
    ├── api/{auth,route,system-manage,index}.ts
    ├── mocks/feature-users-20241014.ts
    └── request/{index,shared,type}.ts
```

兩套 API 規範**完全一致**（同 endpoint、同 method、同 payload shape）— 應用層在 view 內可選擇 import `service/` 或 `service-alova/`。alova 版多了 mock 能力（`@sa/alova/mock` 提供 defineMock）。

設計考量（推測，待 docs 驗證）：alova 提供更精細的 cache / auto-request / dependency tracking，axios 為 fallback / 對 legacy 環境相容。base example 內**大部分 view 用 alova client**（特別是 plugin/function/manage demo），少數 hook 用 axios。

文件出處：`fork260509-soybean-admin-docs/src/zh/guide/request/` 章節（待 deep dive）。

### 2.3 Elegant Router 檔案路由系統

`@elegant-router/vue` — 一套以**檔案路徑自動生成 vue-router config** 的工具：
- `src/views/manage/menu/index.vue` 自動對應 `/manage/menu` 路由
- 路由 metadata 寫在 view 內 SFC `<script>` 的 `metaSlot` 物件
- 自動產生 `src/router/elegant/{routes,imports,transform}.ts` 三個檔案
- 兩種模式：**static**（route 寫死在程式碼）vs **dynamic**（從後端 `GET /route/getUserRoutes` 動態載入）

base example 預設 `VITE_AUTH_ROUTE_MODE=static`（靜態模式），但 dynamic 模式仍是被支援的（後端要提供 `getConstantRoutes` + `getUserRoutes` + `isRouteExist`）。

文件出處：`fork260509-soybean-admin-docs/src/zh/guide/router/`。

### 2.4 主題系統 + UnoCSS

- `src/store/modules/theme` — 主題狀態（dark/light + 主色 + 圓角等）
- `unocss.config.ts` — atomic CSS preset + presetIcons + shortcuts
- 主題切換透過 Naive UI provider + CSS variables
- icon system：`unocss.config.ts` 設 `VITE_ICON_PREFIX=icon` + `VITE_ICON_LOCAL_PREFIX=icon-local`，元件用 `<icon-mdi:menu />` 直接 inline

文件出處：`fork260509-soybean-admin-docs/src/zh/guide/theme/`。

### 2.5 多碼錯誤碼系統（`.env` 驅動）

base 的 `request/index.ts` 內 `onBackendFail` 處理多套錯誤碼：

```env
VITE_SERVICE_SUCCESS_CODE=0000          # success
VITE_SERVICE_LOGOUT_CODES=8888,8889     # immediate logout
VITE_SERVICE_MODAL_LOGOUT_CODES=7777,7778  # logout with modal
VITE_SERVICE_EXPIRED_TOKEN_CODES=9999,9998,3333  # trigger refresh token
```

意思：
- `code === "0000"`（**字串**比對）→ success
- `code ∈ {8888, 8889}` → 直接 logout
- `code ∈ {7777, 7778}` → 跳 modal 提示後 logout
- `code ∈ {9999, 9998, 3333}` → expired，自動 refresh token 後重發 request

這套設計**強假設後端 response 用字串型 `code` 欄位**，而非 HTTP status code。對 rust/nestjs 雙後端都是 GAP。

### 2.6 example 分支 vs main 分支

example 分支（rev1 base）比 main 分支多出：

| 類別 | 主要內容 |
|---|---|
| 業務 view（核心管理） | `manage/{menu, role, user, user-detail}` 4 個 module（main 分支只有 home/_builtin） |
| Framework demo | `function/*`（hide-child, multi-tab, request, super-page, tab, toggle-auth）6 個 |
| Plugin demo | `plugin/*`（barcode, charts, copy, editor, excel, gantt, icon, map, pdf, pinyin, print, swiper, tables, typeit, video）16 個 |
| Alova demo | `alova/{request, scenes}` 2 個 |
| Naive UI 進階 | `pro-naive/{form, table}` 2 個 |
| 多層選單 demo | `multi-menu/*` 2 個 |
| 其他 | `about`, `user-center`, `home` |

→ example 分支對後端 API 的需求**遠多於 fork260509 RESEARCH 評估的 7 條**。

### 2.7 預設 backend：apifox mock

`.env.prod`：
```env
VITE_SERVICE_BASE_URL=https://mock.apifox.cn/m1/3109515-0-default
```

base example 在沒有 rev1 整合的情況下，**預設指向 apifox 線上 mock**。`request/index.ts` 帶 `apifoxToken: 'XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2'` header — 這個 token 寫死在 source 內，apifox mock 用此認證。

意涵：base example 開箱即用、不需要任何後端。整合到 rust + nestjs 時要改 `VITE_SERVICE_BASE_URL` 指向 rev1 後端。

---

## 3. base example API 需求逐 view 盤點

### 3.1 API 端點清單（按 src/service*/ 提取）

base 內 axios `service/` 與 alova `service-alova/` 兩套 client 暴露**完全一致**的 API 表面：

#### `/auth/*`（6 條，認證系）

| Method | Path | Request | 用途 | 觸發 view |
|---|---|---|---|---|
| POST | `/auth/login` | `{ userName, password }` | 登入取 token | `_builtin/login` |
| GET | `/auth/getUserInfo` | — | 取使用者資料 | App 啟動、refresh 後 |
| POST | `/auth/refreshToken` | `{ refreshToken }` | refresh access token | request 攔截器自動觸發（expired codes） |
| POST | `/auth/sendCaptcha` | `{ phone }` | 發送驗證碼 | `_builtin/login`（手機驗證流程） |
| POST | `/auth/verifyCaptcha` | `{ phone, code }` | 驗證驗證碼 | `_builtin/login` |
| GET | `/auth/error` | `?code=&msg=` | 自定義錯誤測試 | `function/request`（demo） |

#### `/route/*`（3 條，路由系）

| Method | Path | Request | 用途 | 觸發 view |
|---|---|---|---|---|
| GET | `/route/getConstantRoutes` | — | 取靜態 route 列表 | App 啟動（static 模式） |
| GET | `/route/getUserRoutes` | — | 取使用者動態 route | 登入後（dynamic 模式） |
| GET | `/route/isRouteExist` | `?routeName=` | 檢查 route 是否存在 | 路由守衛（vue-router guard） |

#### `/systemManage/*`（10 條，系統管理系 — base example 設計的「虛擬規範」）

| Method | Path | Request | 用途 | 觸發 view |
|---|---|---|---|---|
| GET | `/systemManage/getRoleList` | params | 角色分頁列表 | `manage/role` |
| GET | `/systemManage/getAllRoles` | — | 所有啟用角色 | `manage/user`（角色選單） |
| GET | `/systemManage/getUserList` | params | 使用者分頁列表 | `manage/user`, `manage/user-detail` |
| POST | `/systemManage/addUser` | `UserModel` | 新增使用者 | `manage/user` modules |
| POST | `/systemManage/updateUser` | `UserModel` | 更新使用者 | `manage/user` modules |
| DELETE | `/systemManage/deleteUser` | `{ id }` | 刪除使用者 | `manage/user` |
| DELETE | `/systemManage/batchDeleteUser` | `{ ids }` | 批次刪除 | `manage/user` |
| GET | `/systemManage/getMenuList/v2` | — | 菜單列表 | `manage/menu` |
| GET | `/systemManage/getAllPages` | — | 所有頁面（key 列表） | `manage/menu`（綁定頁面用） |
| GET | `/systemManage/getMenuTree` | — | 菜單樹 | `manage/menu`（樹狀檢視） |

**重要**：`/systemManage/*` 是 base example **自訂的 API 路徑**，**rust 與 nestjs 都沒有原生提供**此 prefix（兩者用 `/user`, `/role`, `/route` 等獨立 router）。base 預設用 apifox mock 跑通。

### 3.2 view × API 觸發場景對照

| view 群組 | views | 主要呼叫 API | 註 |
|---|---|---|---|
| `_builtin/login` | login, login/modules | `/auth/login`, `/auth/sendCaptcha`, `/auth/verifyCaptcha`, `/auth/getUserInfo`, `/auth/refreshToken` | 認證流程主入口 |
| `_builtin/{403,404,500,iframe-page}` | 4 個 | 無（純 client view） | error pages |
| `home`, `about`, `user-center` | 3 個 | 可能 `/auth/getUserInfo`（refresh） | 個人資訊頁 |
| `manage/menu` | menu | `/systemManage/{getMenuList/v2, getMenuTree, getAllPages}` | 菜單 CRUD |
| `manage/role` | role | `/systemManage/{getRoleList, getAllRoles}` | 角色管理 |
| `manage/user`, `manage/user-detail` | 2 個 | `/systemManage/{getUserList, addUser, updateUser, deleteUser, batchDeleteUser, getAllRoles}` | 使用者 CRUD |
| `multi-menu/*` | 2 個 | 無 | 多層選單 demo（純 layout） |
| `alova/{request, scenes}` | 2 個 | alova auto-request 範例（含 `/mock/getLastTime` 等 mock-only） | demo |
| `function/{hide-child, multi-tab, request, super-page, tab, toggle-auth}` | 6 個 | `function/request` 用 `/auth/error`；`toggle-auth` 切換 super-role | framework 行為 demo |
| `plugin/*` | 16 個 | 大部分純客戶端（地圖、圖表、編輯器、PDF 等用 npm package） | 不需後端 |
| `pro-naive/{form, table}` | 2 個（含子目錄） | 純元件 demo | 不需後端 |

→ **需要後端的 view 集中在**：`_builtin/login` + `home/user-center/about`（auth）+ `manage/*` 4 個 module（systemManage）+ 路由初始化（`/route/*`）。`alova/scenes`、`function/request`、`function/toggle-auth` 少量觸碰後端。**約 12 個 view 真實需要後端 API；其餘 30+ 個 view 純客戶端 demo。**

---

## 4. rust-api 路由 + service + middleware 盤點

### 4.1 Router mount 與 endpoint 一覽

從 `rust-api/server/router/src/admin/*.rs`：

| Mount | Router file | Endpoints |
|---|---|---|
| `/auth` | `sys_authentication_route.rs` | `POST /auth/login`、`GET /auth/getUserInfo`、`GET /auth/getUserRoutes` |
| `/authorization` | `sys_authentication_route.rs` | `POST /authorization/assign-permission`、`POST /authorization/assign-routes`、`GET /authorization/getUserRoutes` |
| `/route` | `sys_menu_route.rs` | `GET /route/getConstantRoutes`、`GET /route/`、`GET /route/tree`、`POST /route/`、`GET /route/{id}`、`PUT /route/`、`DELETE /route/{id}`、`GET /route/auth-route/{roleId}` |
| `/user` | `sys_user_route.rs` | `GET /user/users`、`GET /user/`、`POST /user/`、`GET /user/{id}`、`PUT /user/`、`DELETE /user/{id}`、`GET /user/add_policies`、`GET /user/remove_policies` |
| `/role` | `sys_role_route.rs` | `GET /role/`、`POST /role/`、`GET /role/{id}`、`PUT /role/`、`DELETE /role/{id}` |
| `/domain` | `sys_domain_route.rs` | `GET /domain/`、`POST /domain/`、`GET /domain/{id}`、`PUT /domain/`、`DELETE /domain/{id}` |
| `/api-endpoint` | `sys_endpoint_route.rs` | `GET /api-endpoint/`、`GET /api-endpoint/tree`、PUT auth |
| `/login-log` | `sys_login_log_route.rs` | `GET /login-log/` |
| `/operation-log` | `sys_operation_log_route.rs` | `GET /operation-log/` |
| `/org` | `sys_organization_route.rs` | `GET /org/` |
| `/access-key` | `sys_access_key_route.rs` | `GET /access-key/`、`POST /access-key/`、`DELETE /access-key/{id}` |
| `/sandbox` | `sys_sandbox_route.rs` | `GET /sandbox/simple-api-key`、`GET /sandbox/complex-api-key`（API key 簽章驗證 sandbox） |

**特別注意**：rust 用 `init_protected_router` 把 `getUserInfo` / `getUserRoutes` 放在 `/auth` 下，但 **沒有 `/auth/refreshToken`**。

### 4.2 Middleware stack

`rust-api/server/initialize/src/router_initialization.rs:initialize_admin_router()` 的 layer 順序（已在 §3 bridge audit 內驗證）：

```
TraceLayer (request span)
  → RequestIdLayer
  → [CasbinAxumLayer]?  (need_casbin=true 才加)
  → [api_key_middleware]?  (sandbox 用)
  → [jwt_auth_middleware]?  (need_auth=true 才加)
  → 業務 router
```

每個 sub-router 註冊時可獨立配 `need_casbin`/`need_auth`/`api_validation` 三個 flag。13 個業務 sub-router 中 11 個用 jwt+casbin，2 個 sandbox 用 api_key。

### 4.3 Service trait + Casbin Adapter

- `SysAuthService` — login、token 簽發、user info 查詢
- `SysAuthorizationService` — assign-permission、assign-routes
- `SysUserService`, `SysRoleService`, `SysMenuService`, `SysDomainService`, `SysEndpointService`, `SysAccessKeyService`, `SysLoginLogService`, `SysOperationLogService`, `SysOrganizationService` — 各業務 service
- `AuthZService` (community 0 "NestJS AuthZ Service" 是混雜 label，**這個其實是 rust Casbin enforcer 抽象**，不是 NestJS) — Casbin enforcer 包裝
- `SeaOrmAdapter` (`sea-orm-adapter` crate) — Casbin policy 持久化到 PostgreSQL via Sea-ORM

關鍵設計：**rust 的 RBAC 走 axum-casbin middleware + sea-orm-adapter**，policy 存 DB、enforcer 動態 reload。

### 4.4 Response shape

`Res<T>` 定義在 `rust-api/server/core/src/web/res.rs:13-18`：

```rust
#[derive(Debug, Serialize, Default)]
pub struct Res<T> {
    pub code: u16,
    pub data: Option<T>,
    pub msg: String,
    pub success: bool,
}
```

注意 `code: u16` — **是 HTTP status code 範圍**（200, 401, 500 等），不是字串型 "0000"。`Res::<()>::new_error(StatusCode::UNAUTHORIZED.as_u16(), msg)` 這種用法明示 code 跟 HTTP status 對齊。

→ 直接對 base 設定（`VITE_SERVICE_SUCCESS_CODE=0000` 字串對比）**形狀完全不一致**。GAP。

### 4.5 Application config

`rust-api/server/resources/application.yaml`：
- `server.port: 10001`
- `database.url: "postgres://soybean:soybean@123.@pgbouncer:6432/soybean_admin_rust"` — 走 pgbouncer
- 其他 Redis / JWT / log 設定

→ rev1 提議 port 規劃（CLAUDE.md §5.2）將改 server port 為 `11081`、container 內 postgres 仍 `5432`、是否保留 pgbouncer 留 PLAN 評估。

---

## 5. nestjs 路由 + 業務邏輯盤點（rev1 不取，但作為 API provider candidate）

### 5.1 Apps 結構

`fork260509-soybean-admin-nestjs/backend/apps/`：
- `base-system/` — 主業務 app（auth/authorization/iam/log-audit/access-key/endpoint 等）
- `base-demo/` — demo 服務

`base-system/src/api/` 內 controllers：

| Controller | Prefix | File |
|---|---|---|
| AuthenticationController | `/auth` | `iam/rest/authentication.controller.ts` |
| AuthorizationController | `/authorization` | `iam/rest/authorization.controller.ts` |
| MenuController | `/route` | `iam/rest/menu.controller.ts` |
| UserController | `/user` | `iam/rest/user.controller.ts` |
| RoleController | `/role` | `iam/rest/role.controller.ts` |
| DomainController | `/domain` | `iam/rest/domain.controller.ts` |
| EndpointController | `/api-endpoint` | `endpoint/rest/endpoint.controller.ts` |
| AccessKeyController | `/access-key` | `access-key/rest/access_key.controller.ts` |
| LoginLogController | `/login-log` | `log-audit/login-log/rest/login-log.controller.ts` |
| OperationLogController | `/operation-log` | `log-audit/operation-log/rest/operation-log.controller.ts` |

→ 路徑 prefix 與 rust **完全一致**（都是 fork260509 同源衍生），但個別 controller 的 endpoint 集合略有差異。

### 5.2 nestjs vs rust endpoint 差異

| Endpoint | rust | nestjs | 備註 |
|---|---|---|---|
| `POST /auth/login` | ✓ | ✓ | 兩者都有 |
| `GET /auth/getUserInfo` | ✓ | ✓ | 兩者都有 |
| `POST /auth/refreshToken` | ✗ | ✓ | **nestjs 獨有**（rust 缺 — fork260509 RESEARCH GAP-1）|
| `GET /auth/getUserRoutes` | ✓（也在 `/authorization` 下） | ✓（只在 `/authorization` 下） | rust 兩處都有 |
| `POST /authorization/assign-permission` | ✓ | ✓ | 一致 |
| `POST /authorization/assign-routes` | ✓ | ✓ | 一致 |
| `POST /authorization/assign-users` | ✗ | ✓ | **nestjs 獨有** |
| `GET /route/getConstantRoutes` | ✓ | ✓ | 一致 |
| `/route` CRUD + `/route/tree` + `/route/auth-route/:roleId` | ✓ | ✓ | 一致 |
| `/user` CRUD + `/user/users` + `/user/add_policies` + `/user/remove_policies` | ✓ | 部分（無 `/users`、無 `/add_policies`、`/remove_policies`） | **rust 獨有 Casbin 政策直連 API** |
| `/role`, `/domain` CRUD | ✓ | ✓ | 一致 |
| `/api-endpoint` 系 | ✓（`/api-endpoint/tree`、`PUT` auth） | ✓（含 `/auth-api-endpoint/:roleCode`） | 一致大方向，細節略不同 |
| `/sandbox/{simple-api-key, complex-api-key}` | ✓ | ✗ | **rust 獨有**（API key 簽章 sandbox）|
| `/access-key`, `/login-log`, `/operation-log` | ✓ | ✓ | 一致 |

**結論**：兩個後端**結構同源、覆蓋 90% 一致**，但 rust 缺 `refreshToken` + `assign-users`、nestjs 缺 Casbin 政策直連 API 與 sandbox。

### 5.3 nestjs 業務邏輯特性（rust 移植或拽進來的考量點）

- **CQRS 模式**：commands（寫操作）與 queries（讀操作）分離，透過 `@nestjs/cqrs` 與 dispatcher 處理。rust 沒採用 CQRS、走直接 service method。
- **Casbin policy 動態加載**：透過 `@lib/infra/casbin` 模組的 `AuthZModule` + `PrismaAdapter`（policy 存 Prisma-managed DB）。rust 用 `sea-orm-adapter` 也達成同樣動態加載。**兩者底層不同但 enforcer 行為一致**。
- **Refresh token rotation**：`AuthenticationController.refreshToken` (`@Post('refreshToken')`，line 59) — 具體 rotation 邏輯（是否 sliding / 是否 invalidate old / 用什麼表存 token）需 deeper read。
- **API key signing**：nestjs `apps/base-system/src/api/access-key/` 有 access-key CRUD，但**沒有 sandbox simple/complex sign 驗證 endpoint**（rust 獨有）。
- **事件 saga 處理**：CQRS 配套有 EventBus / saga（操作日誌、其他 cross-cutting concerns）。rust 用 `server_global::global::send_dyn_event` event channel（前面 bridge audit `validate_request` 看到的 `AuthApiKeyValidatedEvent`）。

### 5.4 nestjs response shape（待確認）

從 `@lib/infra/rest/res.response.ts` `Res<T>` / `ApiRes` 等 type 推測，nestjs 跟 rust 用相近的 response wrap（code/data/msg），但**確切 code 用 number 或 string、預設 success code 是 0 / 200 / 還是 "0000"** 需要直接讀 source 驗證（本 RESEARCH 階段未深入）。

→ 假設與 rust 同樣 number 型 code，與 base `"0000"` 預期同樣有 GAP。若 nestjs 已配 string code 對齊 base，則 nestjs 端 GAP 小於 rust。

---

## 6. base API × {rust, nestjs} 對照表（GAP 與分流策略）

### 6.1 三方對照矩陣

| # | base 期望（path + method + payload） | rust 現況 | nestjs 現況 | GAP 類型 | 分流策略建議 |
|---|---|---|---|---|---|
| A1 | `POST /auth/login` `{ userName, password }` | ✓（路徑 method 一致；payload 形狀待 verify） | ✓ | 可能 B1 (camelCase) | rust 主負，nestjs 同步可用 |
| A2 | `GET /auth/getUserInfo` | ✓ | ✓ | 形狀待對齊 | rust 主負 |
| A3 | `POST /auth/refreshToken` `{ refreshToken }` | ✗ | ✓ | D 缺失 | **nestjs 補位**（或 rust 新增）|
| A4 | `POST /auth/sendCaptcha` `{ phone }` | ✗ | ✗ | D 兩端都缺 | rust / nestjs 任一新做 |
| A5 | `POST /auth/verifyCaptcha` `{ phone, code }` | ✗ | ✗ | D 兩端都缺 | 同上 |
| A6 | `GET /auth/error?code=&msg=` | ✗ | ✗ | D 兩端都缺 | demo 用，可選擇實作 |
| R1 | `GET /route/getConstantRoutes` | ✓ | ✓ | 形狀待對齊 | rust 主負 |
| R2 | `GET /route/getUserRoutes` | ✓（在 `/auth` 與 `/authorization` 下） | ✓（在 `/authorization` 下） | A 路徑略不一致 | nginx rewrite 或 rust 補 `/route/getUserRoutes` alias |
| R3 | `GET /route/isRouteExist?routeName=` | ✗ | ✗ | D 兩端都缺 | rust 補位（簡單實作） |
| S1 | `GET /systemManage/getRoleList` | ✗（rust 有 `GET /role/`） | ✗（nestjs 有 `GET /role/`） | A 路徑完全不一致 | **重要**：詳見 §6.2 |
| S2 | `GET /systemManage/getAllRoles` | 半 ✗（rust `/role/?status=enabled` 可能） | 半 ✗ | A 路徑不一致 | 同上 |
| S3 | `GET /systemManage/getUserList` | ✗（rust 有 `GET /user/`） | ✗（nestjs 同樣） | A 路徑不一致 | 同上 |
| S4 | `POST /systemManage/addUser` `UserModel` | ✗（rust 有 `POST /user/`） | ✗ | A 路徑不一致 + B payload | 同上 |
| S5 | `POST /systemManage/updateUser` `UserModel` | ✗（rust 有 `PUT /user/`） | ✗ | A 路徑 + method 不一致 | 同上（method GAP 多一道）|
| S6 | `DELETE /systemManage/deleteUser` `{ id }` | ✗（rust 有 `DELETE /user/{id}`） | ✗ | A 路徑 + 參數位置不一致 | 同上 |
| S7 | `DELETE /systemManage/batchDeleteUser` `{ ids }` | ✗ | ✗ | D 兩端都缺 | 新做 |
| S8 | `GET /systemManage/getMenuList/v2` | ✗（rust 有 `GET /route/`） | ✗ | A 路徑不一致 | 同 S1-S6 |
| S9 | `GET /systemManage/getAllPages` | ✗ | ✗ | D 兩端都缺 | 新做（菜單管理需要） |
| S10 | `GET /systemManage/getMenuTree` | ✗（rust 有 `GET /route/tree`） | ✗ | A 路徑不一致 | 同 S1-S8 |

### 6.2 `/systemManage/*` 整套 GAP 的處理候選方案

`/systemManage/*` 是 base example 自定義的「虛擬規範」，rust 跟 nestjs **都沒有原生對應**。處理方式有 4 個候選：

#### 方案 A: nginx URL rewrite（不改 base、不改後端）

在 nginx reverse proxy 加 rewrite rule：
```nginx
rewrite ^/systemManage/getUserList$ /user/ break;
rewrite ^/systemManage/addUser$ /user/ break;  # POST → POST (path 改即可)
rewrite ^/systemManage/updateUser$ /user/ break;  # POST → PUT 需要更複雜處理
rewrite ^/systemManage/deleteUser$ /user/$query.id break;  # body 內 id → URL param
...
```

**Pros**：兩邊不動。
**Cons**：(1) `POST /addUser` vs `POST /user/` 沒問題；(2) `POST /updateUser` vs `PUT /user/` **method 不一致**，nginx 改 method 麻煩（要用 `proxy_method` 或 lua）；(3) `DELETE /deleteUser { id }` vs `DELETE /user/{id}` 要從 body 抽 id 放 URL，nginx 不擅長；(4) batch delete 後端兩邊都缺，不能純 rewrite。**綜合：method+payload 移動範圍 nginx 難以乾淨做**。

#### 方案 B: 後端加 `/systemManage/*` alias router

在 rust（或 nestjs）新增一組 controller / router 對應 `/systemManage/*`，內部 forward 到既有 `/user`, `/role`, `/route` service。

```rust
// rust 偽碼
let system_manage = Router::new()
    .route("/getUserList", get(SysUserApi::get_paginated_users))     // 包現有 handler
    .route("/addUser", post(SysUserApi::create_user))
    .route("/updateUser", post(SysUserApi::update_user_post))         // 新 handler wrap update_user
    .route("/deleteUser", delete(SysUserApi::delete_user_by_body))    // 新 handler 從 body 抽 id
    .route("/batchDeleteUser", delete(SysUserApi::batch_delete_users)) // 新做
    .route("/getRoleList", get(SysRoleApi::get_paginated_roles))
    ...
```

**Pros**：handler 重用、route 一行；可實作 batch delete。
**Cons**：要寫 ~10-12 個 thin wrapper handler；payload 形狀對齊（如 `DELETE /deleteUser` body 取 id）需要新 handler。

#### 方案 C: BFF 層（在 base 與後端之間插一個輕量 BFF service）

新增 BFF 服務（可能用 nestjs base-demo 改裝，或新做 Node/Rust BFF），對 base 暴露 `/systemManage/*`、對下游叫 rust。

**Pros**：徹底隔離。
**Cons**：多一個 service，違反 rev1 三方協作精神（不是新加第四方）；維運成本。

#### 方案 D: 改 base 的 service 把 URL 改成 rust 原生路徑

修改 `src/service*/api/system-manage.ts`，把 `/systemManage/getUserList` 改 `/user/`。

**Pros**：對齊最徹底、後端不需 alias。
**Cons**：**違反「base 不改動已存在的程式碼」原則**（前面 §1.2 約束）。

#### 建議分流策略

| API 群 | 推薦方案 |
|---|---|
| `/auth/{login, getUserInfo}` | 已對齊，rust 主負 |
| `/auth/refreshToken` | **nestjs 補位**（已有實作，省 rust 開發成本）|
| `/auth/{sendCaptcha, verifyCaptcha, error}` | rust 新做（簡單 demo 邏輯）或標為「不在 rev1 範圍」 |
| `/route/{getConstantRoutes, getUserRoutes}` | rust 主負 + nginx `/route/getUserRoutes → /auth/getUserRoutes` rewrite |
| `/route/isRouteExist` | rust 補位（簡單）|
| `/systemManage/*` | **方案 B（後端 alias router）**，由 rust 實作，重用既有 service。10 個 thin wrapper + 1 個新做（batch delete）。 |

### 6.3 跨欄位 GAP 類別

除路徑/方法 GAP 外，**形狀/語義級 GAP** 影響全部 endpoint：

| GAP | 描述 | 影響範圍 | 修補方向 |
|---|---|---|---|
| **B1: success code 對齊** | base 期望 `code: "0000"` 字串；rust `Res<T>` 用 `code: u16`（HTTP status）；nestjs 待 verify | 全部 endpoint | rust 改 `Res<T>` 序列化（code as string，或 success_code 常數）；或改 base `.env` 對齊 HTTP status |
| **B2: 多碼錯誤系列** | base 認 logout/modal-logout/expired-token 多套 code（8888/7777/9999 系列）；rust 預設用 HTTP status；nestjs 待 verify | error handling | rust 補多碼設計；或改 base 多碼設定 |
| **B3: camelCase ↔ snake_case** | base 是 TS naturally camelCase（`userName`、`refreshToken`）；rust 預設 serde snake_case；nestjs 預設 camelCase | request body / response payload | rust struct 加 `#[serde(rename_all = "camelCase")]`（fork260509 GAP-0c 已驗證） |
| **B4: Refresh token rotation** | base 在 expired 時自動呼叫 `/auth/refreshToken`，要 backend 實作 rotation（讓 old token invalidate）| auth 整套 | 由 nestjs 提供（已有），或 rust 補做 |
| **B5: User info 形狀對齊** | base `Api.Auth.UserInfo` 預期欄位（含 `buttons` 等 fork260509 GAP-0d）| `/auth/getUserInfo` | 後端對齊 |
| **B6: Captcha 整套** | base 設計有 sendCaptcha + verifyCaptcha 流程，後端兩邊都缺；需 SMS gateway 或 mock 服務 | login 流程 | 設計選擇：不實作、用 mock、或接 SMS 服務 |

---

## 7. 整合策略取捨

### 7.1 後端分工策略

#### 策略 1: rust-only — 所有 API 由 rust 補實作

rust 負責：base 全部 19 條 endpoint + `/systemManage/*` alias + refresh token + assign-users + captcha + batch delete + 多碼 + camelCase + Casbin（既有）+ sandbox（既有）。

**Pros**：單一後端、運維簡單、語言一致（Rust 整個 stack）、無雙 service 一致性問題。
**Cons**：rust 開發成本大（refresh token rotation、CQRS-equivalent saga、systemManage 整套 wrapping）；nestjs 既有實作浪費；rust 不擅長 CQRS（要重發明輪子）。

#### 策略 2: rust + nestjs 並用（**推薦**）

rust 負責：主流業務 API（`/auth/{login, getUserInfo}`、`/route/*`、`/user/*`、`/role/*`、`/domain/*`、`/api-endpoint/*`、`/access-key/*`、`/log-audit/*`、`/org/*`、`/sandbox/*`）+ Casbin RBAC 主要 enforcement + `/systemManage/*` alias。

nestjs 負責：複雜 / 已現成的 API — 主要是 `POST /auth/refreshToken`（與 token rotation 邏輯）。可能也補 `POST /authorization/assign-users` 與 captcha（若 nestjs 也沒則新做）。

**Pros**：分工合理、nestjs 既有成果不浪費、rust 主負 RBAC + 主流業務、nestjs 補複雜 auth 邏輯；雙 service 都用 Casbin 但 enforcement 主要在 rust 層（nginx 把保護路由先打 rust 驗 token 再回頭走 nestjs）。
**Cons**：兩個 service 維運（容器、log、metrics）；token 共識需協調（兩端要識別同樣 JWT、同 secret）；雙重 RBAC enforcement 風險（見 §9）。

#### 策略 3: nestjs-only — rust 退場

base 全走 nestjs。

**Pros**：nestjs 已有最完整實作（refresh token、CQRS、Casbin 都齊）、單一後端。
**Cons**：**違反 rev1 設計目標**（CLAUDE.md §1：rust 是後端，Casbin RBAC 主要載體）；rust worktree 與 fork branch 失去意義。**不建議**。

### 7.2 覆蓋範圍

| 覆蓋範圍 | 涵蓋 view | 主要 API 需求 | 後端工作量估算 |
|---|---|---|---|
| **完整 example** | 全部 ~40+ view | base 19 條 + 完整 `/systemManage/*` + 多碼系 + captcha | 高（含 SMS gateway 抉擇） |
| **核心管理 + 部分 demo** | `_builtin/login` + `home/about/user-center` + `manage/*` (4 個 module) + `function/{request, toggle-auth}` + `alova/scenes`（部分） | base ~17 條（除 captcha / batch delete 可選） | 中 |
| **只核心管理** | `_builtin/login` + `home` + `manage/*` (4 個 module) + `/route/*` | base ~14 條（不含 captcha、batch delete、`/auth/error`、`function` demo 對應）| 低 |

### 7.3 推薦組合（策略 × 範圍 matrix）

|  | 完整 example | 核心管理 + 部分 demo | 只核心管理 |
|---|---|---|---|
| **rust-only** | 工作量過大、不推薦 | 可行但浪費 nestjs 既有 | 可行（最快上線）|
| **rust + nestjs 並用** | 雙 service 開全功能、適中複雜度 | ⭐ **首推**：rust 主流業務 + nestjs 補 refresh + 適度 demo | 雙 service 顯得 over-kill |
| **nestjs-only** | 不推薦 | 不推薦 | 不推薦 |

**rev1 首推**：`rust + nestjs 並用` × `核心管理 + 部分 demo`
- 整合先把「登入 + 管理後台核心」打通（rust 主負）
- refresh token 走 nestjs（拿現成）
- captcha / batch delete / `/auth/error` 留下階段（rev1 整合 v1 不需要）
- demo views（plugin/function 大部分）純客戶端展示，後端 API 不需對接
- 最終 PLAN 階段可依 user 需求收緊或放寬範圍

---

## 8. 部署方向（mention，不深入）

### 8.1 已固化決策

- **docker 容器內編譯**（不 host build artifact 再 COPY；用 multi-stage 在 build container 內跑 `pnpm build` / `cargo build`）
- **docker-compose 運行**

### 8.2 服務拆分（待 PLAN 細化）

最小服務集合：
- `base-web` container（nginx + base build artifact）
- `rust-api` container
- `nestjs` container（若採策略 2）
- `postgres` container
- `redis` container
- 可選：`pgbouncer` container（待 INTEGRATION-PLAN 評估是否保留）

對外暴露 port 規劃見 `CLAUDE.md §5.2`（rev1 提議：web `:11080`、rust `:11081`、postgres host `:15432`）。

### 8.3 nginx 分流概念

```
client → nginx:11080
          ├─ /              → base-web container (static)
          ├─ /api/auth/refreshToken → nestjs container
          ├─ /api/*         → rust-api container :11081
          └─ /api/systemManage/* → rust-api (透過 rust 內 alias router 或 nginx rewrite)
```

具體 nginx `location` block 與 rewrite rule 留 INTEGRATION-PLAN。

---

## 9. 風險與已知限制

### 9.1 graphify 圖譜限制

詳見 [`GRAPHIFY-NOTES.md`](GRAPHIFY-NOTES.md)。本 RESEARCH 主要受影響的盲點：
- **NestJS DI 結構破碎** — `@Module` decorator 不解析，nestjs 內 service ↔ controller ↔ module 依賴關係 graphify 抓不到。本 RESEARCH §5 的 nestjs 內容**主要靠直接讀 controller files**，graphify 只作邊緣輔助。
- **Vue component composition 破碎** — base 內 view ↔ component import 關係 graphify 抓不到。§3 的 view × API 觸發場景**主要靠 grep src/views/* 跟 src/service*/* 互相對照**。
- **Rust macro / trait dispatch 漏邊** — rust router 註冊用 `merge_router!` macro、Casbin enforcement 用 trait method dispatch、event bus 用 trait object — 這些 graphify 都漏。§4 的 rust router 表**主要靠直接讀 `sys_*_route.rs` files**。

### 9.2 三方協作的 consistency 風險

採策略 2（rust + nestjs 並用）時：

| 風險 | 描述 | 緩解方向 |
|---|---|---|
| **Token 共識** | base 拿到的 JWT 必須兩個後端都認；簽章 secret 必須共享 | 同 secret + 同 algorithm + 同 claim format，並在 PLAN 階段標清「JWT signing key 必須跨兩個後端共享」 |
| **雙重 RBAC enforcement** | rust 用 sea-orm-adapter 跑 Casbin、nestjs 用 PrismaAdapter 跑 Casbin，policy 表理論上同一份，但實作分歧（policy reload 觸發 / cache invalidation 等可能不一致）| 策略選擇：(1) policy 只由其中一邊管（rust 主），另一邊 read-only 同步 (2) 兩邊各自有獨立 policy 表（重複問題）(3) 共享一張 policy 表，兩邊各自有 reload 通知機制（複雜） |
| **User info 一致性** | rust 跟 nestjs 都能查 user info；同一個 user 在兩個後端要顯示一致 | 同一張 `sys_user` 表（單一來源 of truth），兩個後端都 read-only 查 |
| **Refresh token 寫入** | nestjs 處理 refresh、但新 token 要 rust 也能驗 | JWT 簽章共享 secret + nestjs 在 refresh 時寫 `sys_tokens` 表記錄（rust 也讀此表驗 token valid）|

### 9.3 雙重 RBAC enforcement 的資安考量

如果 base 對某 API 同時打 rust 跟 nestjs（route 失誤 / 開發誤配），兩個後端都跑 Casbin enforce — 看似多一道保護，實則**可能 policy 不同步時放行不該放行的 request**。

→ PLAN 階段需明定：每個 API endpoint 只由一個後端負責 RBAC 決策；nginx routing 必須對齊「endpoint owner」配置。

### 9.4 example vs main 分支差異風險

graphify 圖譜內 NestJS 部分是 fork260509 main 分支時抓的（前面 graphify update 後 rev1 base example src/ 才加入）。所以：
- nestjs 抓圖內容**仍是 fork260509 那次的 main**（不會變）
- base 抓圖反映 rev1 example src/

→ §5 nestjs 內容若引用 graphify，可能對應 fork260509 main 分支的舊 nestjs（雖然 nestjs 源倉本身沒變）。引用前以實際 nestjs 源倉 read 為準。

### 9.5 nestjs 業務邏輯複雜度

nestjs 用 CQRS + 多 events + Casbin + Prisma — 維運門檻高。

→ 採策略 2 時，nestjs 部分**盡量限縮在 refresh token 等少數 endpoint**，不要拿太多進來，否則 rev1 變成「兩個複雜 stack 各自演化」。

### 9.6 rev1 不繼承 fork260509 PLAN 決策

如 CLAUDE.md §4 disclaimer 所述，fork260509 過往決策（nginx 同源 / Sea-ORM pool / DB-backed refresh / migration init container / docker compose 部署形態）**都不視為 rev1 預設值**。INTEGRATION-PLAN 階段需逐項重新評估，避免反射性套用。

### 9.7 base example 預設 apifox mock 的隱性影響

base example 在沒 backend 時用 apifox mock 跑通 — 意味著開發者拿 base 起來時**無需任何後端就能進入 manage/user**、看到假資料。這對開發體驗很友善，但也意味著：

- 若整合到 rev1 後端、`/systemManage/getUserList` 沒實作或形狀不對，**base 不會 fallback 到 mock，直接整頁 error**
- 整合測試時要記得改 `VITE_SERVICE_BASE_URL`，否則仍 hit mock
- apifox token 寫死在 source（`apifoxToken: 'XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2'`）— 不算敏感（mock 帳號的），但 rev1 上線時應確保不影響

---

## 附錄 A：關鍵檔案位置

### A.1 base (`fork260509-soybean-admin-base/` / `base-web/` worktree)

| 用途 | 路徑 |
|---|---|
| API service (axios) | `src/service/api/{auth, route, system-manage, index}.ts` |
| API service (alova) | `src/service-alova/api/{auth, route, system-manage, index}.ts` |
| Alova mock | `src/service-alova/mocks/feature-users-20241014.ts` |
| Request 攔截 + success code | `src/service/request/index.ts` / `src/service-alova/request/index.ts` |
| Route metadata（Elegant Router） | `src/router/elegant/{routes, imports, transform}.ts` |
| Route guard | `src/router/guard/*.ts` |
| Env 配置 | `.env`, `.env.dev`, `.env.prod` |
| 主題 store | `src/store/modules/theme/` |
| Views | `src/views/{_builtin, about, alova, function, home, manage, multi-menu, plugin, pro-naive, user-center}/` |

### A.2 rust (`fork260509-soybean-admin-rust/` / `rust-api/` worktree)

| 用途 | 路徑 |
|---|---|
| Router | `server/router/src/admin/sys_*_route.rs` |
| Router 集成 | `server/initialize/src/router_initialization.rs` |
| Service | `server/service/src/admin/sys_*_service.rs` |
| Service helper (DB connection) | `server/service/src/helper/db_helper.rs` |
| API handler | `server/api/src/admin/sys_*_api.rs` |
| Middleware | `server/middleware/src/jwt.rs`、`server/core/src/sign/api_key_middleware.rs`、`axum-casbin/src/middleware.rs` |
| Casbin enforcer wrapper | `axum-casbin/src/lib.rs` |
| Sea-ORM Casbin adapter | `sea-orm-adapter/src/{adapter, action}.rs` |
| Response shape | `server/core/src/web/res.rs` |
| Application config | `server/resources/application.yaml` |
| Migration | `migration/src/{schemas, datas}/m*.rs` |

### A.3 nestjs (`fork260509-soybean-admin-nestjs/`)

| 用途 | 路徑 |
|---|---|
| Apps | `backend/apps/{base-system, base-demo}/` |
| Auth controller | `backend/apps/base-system/src/api/iam/rest/authentication.controller.ts` |
| Authorization controller | `backend/apps/base-system/src/api/iam/rest/authorization.controller.ts` |
| Menu / Route controller | `backend/apps/base-system/src/api/iam/rest/menu.controller.ts` |
| User / Role / Domain controller | `backend/apps/base-system/src/api/iam/rest/{user, role, domain}.controller.ts` |
| Endpoint / AccessKey controller | `backend/apps/base-system/src/api/{endpoint, access-key}/rest/*.controller.ts` |
| Log-audit controller | `backend/apps/base-system/src/api/log-audit/{login-log, operation-log}/rest/*.controller.ts` |
| Module 註冊 | `backend/apps/base-system/src/{app, api/api}.module.ts` |
| Shared lib | `backend/libs/{infra/casbin, infra/guard, infra/filters, infra/strategies, infra/rest, global, bootstrap, config, logger, ...}/` |
| Response shape | `backend/libs/infra/rest/src/res.response.ts` |

### A.4 docs (`fork260509-soybean-admin-docs/`)

| 用途 | 路徑 |
|---|---|
| 中文 guide | `src/zh/guide/{request, router, theme, icon, hooks, cli}/` |
| 中文 standard | `src/zh/standard/{ts, vue, naming, lint, tools, synthesis}.md` |
| 中文 intro | `src/zh/index.md` |
| 中文 quick-start / sync | `src/zh/guide/{quick-start, sync, intro}.md` |
| 教學 | `src/zh/tutorial/` |
| FAQ | `src/zh/faq/` |

---

## 附錄 B：graphify query 範例（rev1 設計時可重複用）

> 使用前先讀 [`GRAPHIFY-NOTES.md`](GRAPHIFY-NOTES.md) 內 11 條已知限制，特別是 NestJS DI / Vue component / Rust macro 三條盲點。

### B.1 rust 端 query（圖譜可信度高）

```bash
graphify query "rust-api 內所有 axum middleware 與套用順序"
graphify query "Casbin enforcer 如何從 DB 載入 policy 並動態 reload"
graphify query "axum router 內哪些 endpoint 不需 jwt auth"
graphify query "sys_tokens 表的寫入時機"   # refresh token 設計
graphify explain "initialize_admin_router()"   # bridge node 已分析過
```

### B.2 base 端 query（注意 .vue 元件孤立）

```bash
graphify query "base 內哪些 view 用 alova client、哪些用 axios"
graphify query "base 路由守衛 guard 的執行順序"
graphify query "Elegant Router 如何把 view 檔名映射到 vue-router config"
graphify path "useAuthStore" "request"   # 找 store 與 request 的關聯
```

### B.3 nestjs 端 query（限制大，建議直接讀 source）

```bash
# NestJS DI 圖譜破碎，下面 query 可能只回 file-level node，需要直接 read
graphify query "nestjs authentication.controller 的 refreshToken handler 怎麼 rotate token"
# → 真實答案要 read backend/apps/base-system/src/api/iam/rest/authentication.controller.ts
```

### B.4 跨源倉對照 query

```bash
graphify query "rust 跟 nestjs 對 /auth/getUserInfo 的實作差異"
graphify path "SysAuthenticationApi::login_handler" "AuthenticationController.login"
```

---

> **下一步**：本 RESEARCH 完成後，由 `INTEGRATION-PLAN.md`（待建）拍板分流策略 × 覆蓋範圍、寫出具體 docker-compose / nginx config / rust `/systemManage/*` alias router code patch 等實作細節。具體 feature 開發以 `INTEGRATION-CHECKLIST.md`（待建）追蹤。
