# API Contracts: F4 — response-shape-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-14
**Source**: [`spec.md`](../spec.md) §Acceptance Scenarios + [`data-model.md`](../data-model.md) E1-E5

> F4 不引入新 endpoint。本檔列出**既有 endpoint 的對齊後 response shape contract**，供 implementation 階段對照與 acceptance test 撰寫。

---

## C1. `/auth/login`（dimension A + C 端到端）

**Scenario**: spec.md Acceptance Scenario 1（dimension A）+ 9（dimension C）+ SC-002

### Request

```http
POST /api/auth/login HTTP/1.1
Content-Type: application/json

{"identifier": "Soybean", "password": "123456"}
```

### Response — Success path（HTTP 200 + code 0）

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "code": 0,
  "data": {
    "token": "eyJ...",
    "refreshToken": "eyJ..."
  },
  "msg": "success",
  "success": true
}
```

**對齊 base TS**：`Api.Auth.LoginToken { token: string; refreshToken: string }` ✓

### Response — Error path 範例（HTTP 200 + code 4001，dimension A scenario 5）

```json
{
  "code": 4001,
  "data": null,
  "msg": "field 'identifier' is required",
  "success": false
}
```

---

## C2. `/auth/getUserInfo`（dimension C 焦點）

**Scenario**: spec.md Acceptance Scenario 10 + 11（dimension C）+ SC-003

### Request

```http
GET /api/auth/getUserInfo HTTP/1.1
Authorization: Bearer eyJ...
```

### Response — Success（HTTP 200 + code 0）

```json
{
  "code": 0,
  "data": {
    "userId": "<uuid>",
    "userName": "Soybean",
    "roles": ["R_SUPER"],
    "buttons": []
  },
  "msg": "success",
  "success": true
}
```

**對齊 base TS**：`Api.Auth.UserInfo { userId, userName, roles: string[], buttons: string[] }` ✓
**4 欄位完整、無多無少**（per FR-017 + SC-003）
**`buttons: []`**：F4 階段預設空陣列（per FR-016 + Assumption「buttons 內容留 F7+」）

---

## C3. `/auth/refreshToken`（dimension A scenario 4）

**Scenario**: spec.md Acceptance Scenario 4 — base 偵測 code 9999 自動呼叫此 endpoint

### Request

```http
POST /api/auth/refreshToken HTTP/1.1
Content-Type: application/json

{"refreshToken": "eyJ..."}
```

### Response — Success（HTTP 200 + code 0）

```json
{
  "code": 0,
  "data": {
    "token": "eyJ...",
    "refreshToken": "eyJ..."
  },
  "msg": "success",
  "success": true
}
```

### Response — Refresh token 也過期（HTTP 200 + code 9998）

```json
{
  "code": 9998,
  "data": null,
  "msg": "refresh token expired, re-login required",
  "success": false
}
```

base 收到 9998 → 強制重新登入（per spec.md E2 namespace）。

> **B4 業務邏輯不在 F4 範圍**（per FR-023）— F4 只保證 response shape 對齊；rotation 邏輯由 F10 / F13 處理。

---

## C4. `/route/getUserRoutes`（dimension B 焦點 — nested struct rename）

**Scenario**: spec.md Acceptance Scenario 7（dimension B）

### Request

```http
GET /api/route/getUserRoutes HTTP/1.1
Authorization: Bearer eyJ...
```

### Response — Success（HTTP 200 + code 0）

```json
{
  "code": 0,
  "data": {
    "routes": [
      {
        "name": "home",
        "path": "/home",
        "component": "layout.base$view.home",
        "meta": {
          "title": "首頁",
          "icon": "mdi:home"
        }
      },
      {
        "name": "manage",
        "path": "/manage",
        "component": "layout.base",
        "meta": {...},
        "children": [...]
      }
    ],
    "home": "home"
  },
  "msg": "success",
  "success": true
}
```

**對齊規範**：
- 外層 `UserRoute { routes, home }` 與 nested `MenuRoute { route_name → name? routeName? }`、`MenuMeta { ... }` 各自 MUST 有 struct-level `rename_all = "camelCase"`（per FR-014）
- 具體 nested struct rename audit 由 `/speckit-tasks` 階段完成

---

## C5. Middleware Error Path（dimension A + FR-021）

**Scenario**: spec.md Acceptance Scenario 5 + 8 + Edge Case「Middleware-level errors」

### Casbin RBAC deny（per R6 mapping）

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "code": 5001,
  "data": null,
  "msg": "casbin policy denied: GET /api/manage/users requires r:admin",
  "success": false
}
```

### JWT 過期（base auto-refresh 觸發）

```json
{
  "code": 9999,
  "data": null,
  "msg": "access token expired",
  "success": false
}
```

### API key 缺失

```json
{
  "code": 5003,
  "data": null,
  "msg": "api key required for this endpoint",
  "success": false
}
```

### API key 簽章不符

```json
{
  "code": 5004,
  "data": null,
  "msg": "api key signature invalid",
  "success": false
}
```

**規範**：所有 middleware error MUST 經 `IntoResponse` 轉 `Res<()>` envelope，**禁裸 HTTP 401/403**（per FR-021 + spec Edge Case）。

---

## C6. Server-side Error（dimension A + FR-008/-009）

**Scenario**: spec.md Acceptance Scenario 5 邊界 + 9001~9005 namespace 落地

### DB 不可達

```json
{
  "code": 9001,
  "data": null,
  "msg": "database connection failed",
  "success": false
}
```

### Redis 不可達

```json
{
  "code": 9002,
  "data": null,
  "msg": "cache service unavailable",
  "success": false
}
```

### Configuration 缺失（rust startup）

```json
{
  "code": 9004,
  "data": null,
  "msg": "missing required env var: DATABASE_URL",
  "success": false
}
```

### Panic recover

```json
{
  "code": 9005,
  "data": null,
  "msg": "internal server error",
  "success": false
}
```

---

## C7. 範圍邊界（FR-022 / FR-023）— 不在 F4 對齊範圍

| 情境 | 行為 | 處理 |
|---|---|---|
| Body parse fail（malformed JSON） | axum 預設 400 Bad Request（**裸 HTTP**） | F4 不對齊；base 走 network error handler |
| Router 404 | axum 預設 404 Not Found | 同上 |
| Panic 在 middleware 前 | axum 預設 500 | 同上 |
| Refresh token rotation 業務邏輯（B4） | F4 不實作 | 由 F10 / F13 處理 |

---

**Contract testing**：每個 C1-C6 都有對應 acceptance scenario（spec.md），`/speckit-tasks` 階段產出對應 cargo test 案例。
