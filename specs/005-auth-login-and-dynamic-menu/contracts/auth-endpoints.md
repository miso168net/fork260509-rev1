# Auth + Route Endpoints Contract — F5.1

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-15
**Source**: [`spec.md`](../spec.md) §Key Entities + spec FR-001 ~ FR-021

> F5.1 涉 4 個 endpoint：3 個 protected（login flow 後可呼）+ 1 個 public（constant routes）。本 doc 列每個 endpoint 的 path / method / request / response shape contract，作為 base-web ↔ rust-api 整合的權威 reference。

---

## 1. `POST /auth/login`（public）

### Request

- **Method**：POST
- **Path**：`/auth/login`
- **Auth**：none（public、Casbin 不 enforce）
- **Content-Type**：`application/json`
- **Body**：
  ```json
  {
    "identifier": "Soybean",
    "password": "123456"
  }
  ```
  - `identifier`：user 帳號（rev1 預設 3 user：Soybean / Administrator / GeneralUser）
  - `password`：plaintext password（rev1 預設 `123456`）

### Response — Success（HTTP 200 + F4 envelope）

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "token": "<JWT-string-11-claims>",
    "refreshToken": "<placeholder-string>"
  }
}
```

- `token`：JWT 含 11 claims（per F1.1 [`claim-contract.md`](../../004-jwt-secrets/contracts/claim-contract.md)）
- `refreshToken`：F5.1 階段為 placeholder（F10 補 rotation 實作）

### Response — Errors（HTTP 200 + F4 envelope error code）

| 情境 | envelope code | 數值 | 來源 |
|---|---|---|---|
| 密碼錯 / user 不存在 / user 已軟刪 | `CODE_BUSINESS_ENTITY_NOT_FOUND` | 6001 | DbErr::RecordNotFound or UserError mapping |
| Validation 失敗（identifier 空 / password 空） | `CODE_VALIDATION_REQUIRED_FIELD` | 4001 | ValidatedForm |
| DB 錯誤 | `CODE_SERVER_DB_ERROR` | 9001 | DbErr 其他變體 |

### Side effects

- `sys_operation_log` 新增 1 row：
  - Success → `operation = login_succeeded`、`payload_after` 含 user_id / username / client_ip / user_agent / request_id（**不**含 plaintext password、per F2.1 redaction + spec Q1 拍板）
  - Failure → `operation = login_failed`（若 auth_event_handler emit、tasks 階段 verify）

---

## 2. `GET /auth/getUserInfo`（protected）

### Request

- **Method**：GET
- **Path**：`/auth/getUserInfo`
- **Auth**：Bearer JWT token（header `Authorization: Bearer <token>`）
- **Casbin enforce**：subject=role、object="/auth/getUserInfo"、action="GET"、domain=user.domain
- **F3 G9 軟刪 user 8888 check**：jwt_auth_middleware 自動觸發

### Response — Success（HTTP 200 + F4 envelope）

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "userId": "<ULID>",
    "userName": "Soybean",
    "roles": ["ROLE_SUPER_ADMIN"],
    "buttons": []
  }
}
```

- `buttons`：F5.1 為 `[]`、F7+ button-level RBAC 填入
- `roles`：user 對應 role 列表

### Response — Errors

| 情境 | envelope code | 數值 |
|---|---|---|
| Token 無 / 簽錯 / 過期 | `CODE_EXPIRED_TOKEN_SIGNATURE` 或 `CODE_EXPIRED_ACCESS_TOKEN` | 3333 / 9999 |
| User 在 token 簽出後軟刪（F3 G9 layer） | `CODE_LOGOUT_SESSION_INVALIDATED` | 8888 |
| Casbin enforce 拒絕（role 對 path 無 policy） | `CODE_PERMISSION_CASBIN_DENY` | 5001 |

---

## 3. `GET /route/getUserRoutes`（protected、F5.1 path align）

### Request

- **Method**：GET
- **Path**：`/route/getUserRoutes`（F5.1 從 `/auth/getUserRoutes` 移動而來；舊 path 已刪）
- **Auth**：Bearer JWT token
- **Casbin enforce**：subject=role、object="/route/getUserRoutes"、action="GET"、domain=user.domain
- **F3 G9 軟刪 user 8888 check**：自動觸發

### Response — Success（HTTP 200 + F4 envelope）

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "routes": [
      {
        "name": "home",
        "path": "/home",
        "component": "layout.base$view.home",
        "meta": {
          "title": "首页",
          "i18nKey": "route.home",
          "keepAlive": false,
          "constant": false,
          "icon": "mdi:home",
          "order": 1,
          "href": null,
          "hideInMenu": false,
          "activeMenu": null,
          "multiTab": false
        },
        "children": [],
        "id": 1,
        "pid": 0
      }
      // ... 更多 menu，per sys_role_menu 對應
    ],
    "home": "/home"
  }
}
```

- `routes`：menu tree（per sys_role_menu JOIN sys_role → menu_ids → sys_menu find_active → TreeBuilder）
- `home`：用戶 home 路由（預設 `/home`、可由 sys_user.home column 覆蓋若有）

### Response — Edge cases

| 情境 | response |
|---|---|
| `role_codes` 為空 | `{"routes": [], "home": "/home"}` |
| 所有對應 menu 軟刪 / disabled | `{"routes": [], "home": "/home"}` |

### Response — Errors

同 `/auth/getUserInfo` 錯誤 mapping。

---

## 4. `GET /route/getConstantRoutes`（public）

### Request

- **Method**：GET
- **Path**：`/route/getConstantRoutes`
- **Auth**：none（public、Casbin 不 enforce）

### Response — Success（HTTP 200 + F4 envelope）

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "name": "login",
      "path": "/login",
      "component": "layout.blank$view.login",
      "meta": { "title": "登录", "constant": true, ... },
      "children": [],
      "id": 100,
      "pid": 0
    }
    // ... 更多 constant routes
  ]
}
```

- `data`：constant routes 列表（per sys_menu where constant=true）
- 注：response shape 與 `getUserRoutes` 不同（getUserRoutes 包 `{routes, home}`、getConstantRoutes 直接返 `[]` array）— 對齊 base `Api.Route.MenuRoute[]` typing

---

## 5. Endpoint summary

| Endpoint | Path | Method | Auth | Casbin | F5.1 change |
|---|---|---|---|---|---|
| login | `/auth/login` | POST | none | none | none（audit verify）|
| getUserInfo | `/auth/getUserInfo` | GET | Bearer | enforce | none（audit verify）|
| getUserRoutes | `/route/getUserRoutes` | GET | Bearer | enforce | **path moved from `/auth/getUserRoutes`** |
| getConstantRoutes | `/route/getConstantRoutes` | GET | none | none | none（audit verify）|

---

## 6. Contract guarantees（F5.1）

- 4 個 endpoint 的 path / method / request body / response shape 在 F5.1 後**穩定**、與 base-web `Api.Auth.*` / `Api.Route.*` typings 100% 對齊
- 既有 deployed token（F1.1 之前 + F5.1 之前簽的）F5.1 後仍可解（JWT secret + algorithm 不變、JWT validation path 不動）
- F5.1 後新加 endpoint（如 F8 `/authorization/*`）不破壞 F5.1 既有 4 個 endpoint contract
