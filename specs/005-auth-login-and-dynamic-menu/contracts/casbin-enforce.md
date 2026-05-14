# Casbin Enforce Contract — F5.1

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-15
**Source**: [`spec.md`](../spec.md) FR-016 ~ FR-018 + spec Q2 拍板 + [`research.md`](../research.md) R2

> F5.1 是 Casbin enforce 首次啟用、是 DESIGN-A 設計支柱第一條落地。本 doc 列 Casbin enforce 在 F5.1 後的完整 behavior contract：subject / object / action / domain 對應規則 + reject 時返 F4 envelope 機制。

---

## 1. Casbin enforce subject / object / action / domain 對應

### 既有 wire（per [`research.md`](../research.md) audit）

`server/initialize/src/router_initialization.rs:72-76` 已對 protected admin router 加 `CasbinAxumLayer` layer（per `need_casbin=true` flag）。

`jwt_auth_middleware` 在 JWT 驗 + 軟刪 user check 通過後、注入 `CasbinVals { subject: roles, domain }` 進 request extensions。

`axum_casbin::CasbinAxumMiddleware::call` 從 request extensions 取 `CasbinVals`、用 `enforce_mut([subject, domain, path, action])` 跑 enforce。

### Mapping table

| Casbin arg | 來源 | 範例 |
|---|---|---|
| `subject` | `User.subject()` = user role codes (`Vec<String>`、`["ROLE_SUPER_ADMIN", ...]`) | `ROLE_SUPER_ADMIN` |
| `domain` | `User.domain()` = user.domain（rev1 預設 `"built-in"`、寫死 LoginContext） | `built-in` |
| `object` | `request.uri().path()` | `/auth/getUserInfo` / `/route/getUserRoutes` |
| `action` | `request.method().as_str()` | `GET` / `POST` |

### Casbin model

`rust-api/server/resources/rbac_model.conf`（既有、F5.1 不動）— RBAC with domains pattern：

```text
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && r.act == p.act
```

---

## 2. Casbin reject response 既狀（F5.1 前）

`axum-casbin/middleware.rs:153-197` 對 4 種情境直接返 plain text response（未 hook F4 envelope）：

| 情境 | HTTP status | Body fragment |
|---|---|---|
| Casbin enforce 拒絕（role 對 path 無 policy） | 403 FORBIDDEN | "You do not have the necessary permissions to access this resource. Please contact support if you believe this is an error." |
| No CasbinVals 注入（即 jwt_auth_middleware 未 run / token 無效） | 401 UNAUTHORIZED | "No authentication token was provided. Please ensure your request includes a valid token." |
| Subject 為空（user.subject() == []） | 401 UNAUTHORIZED | "No token provided or invalid token type" |
| Enforcement error（Casbin policy 載入失敗 / 異常） | 502 BAD_GATEWAY | "We encountered an unexpected error while processing your request. Our team has been notified, and we are investigating the issue." |

---

## 3. F5.1 thin adapter middleware 介入後

### 目標 contract

F5.1 thin adapter（per [`data-model.md`](../data-model.md) §E2）攔 Casbin reject 的 plain text response、轉成 F4 envelope。**只攔 403 FORBIDDEN**（401 / 502 由 jwt_auth_middleware / 其他 path 處理、保 既有 behavior）。

### Reject → F4 envelope mapping

| 情境 | HTTP status (out) | F4 envelope |
|---|---|---|
| Casbin enforce 拒絕（adapter 攔 403 + body 含 "do not have the necessary permissions"） | 200 (F4 always-200 紀律) | `{"code": 5001, "msg": "您没有访问该资源的权限，请联系管理员", "data": null}` |
| Casbin enforce 通過 | inner handler response | inner handler shape |
| jwt_auth_middleware 401（無 token / 過期） | 200 (F4) | `{"code": 9999, "msg": "...", "data": null}`（per JwtError mapping）|
| Enforcement error 502 | 502 BAD_GATEWAY | 不動（adapter 不攔 502）— Casbin policy 異常為 server 故障、保 HTTP 502 + plain text |

### Envelope code 對齊

- `CODE_PERMISSION_CASBIN_DENY = 5001`（既有、per F4 code table）
- F5.1 不引入新 envelope code（per spec FR-027 sub-implication「F5.1 不引入新 envelope code」+ R3 拍板）

---

## 4. Adapter wire 位置

per [`data-model.md`](../data-model.md) §E3：在 `router_initialization.rs::apply_layers` 內、`need_casbin` block 之後加 `.layer(from_fn(casbin_envelope_adapter))`：

```text
router
  .layer(Extension(casbin.clone()))
  .layer(casbin)                              // Casbin enforce layer (既有)
  .layer(from_fn(casbin_envelope_adapter))    // F5.1 NEW envelope adapter
  // 其他 layers (TraceLayer, RequestIdLayer, jwt_auth, ...)
```

注：`from_fn` middleware 在 axum 為「先跑 inner、後跑 wrapper」模式 — adapter wrapper 攔截 Casbin 已返的 response 進行 envelope 轉換。

---

## 5. Policy seed contract

F5.1 acceptance test 跑前需確保 `sys_casbin_rule` 內含 minimum policy（per [`research.md`](../research.md) R5、若缺由 F5.1 範圍內補）：

### Policy rules 範例

```text
# p (subject, domain, object, action) — allow rules
p, ROLE_SUPER_ADMIN, built-in, /auth/getUserInfo, GET
p, ROLE_SUPER_ADMIN, built-in, /route/getUserRoutes, GET
p, ROLE_SUPER_ADMIN, built-in, /route/getConstantRoutes, GET
p, ROLE_ADMIN, built-in, /auth/getUserInfo, GET
p, ROLE_ADMIN, built-in, /route/getUserRoutes, GET
p, ROLE_USER, built-in, /auth/getUserInfo, GET
p, ROLE_USER, built-in, /route/getUserRoutes, GET

# g (user_id, role, domain) — role assignment
g, <Soybean-user-id>, ROLE_SUPER_ADMIN, built-in
g, <Administrator-user-id>, ROLE_ADMIN, built-in
g, <GeneralUser-user-id>, ROLE_USER, built-in
```

注：`/auth/login` + `/route/getConstantRoutes` 為 public（Casbin layer 不 wire、無需 policy）；只有 protected 3 endpoint 需 policy。

### Acceptance test 期望

- Soybean / Administrator / GeneralUser 各自 login 後 `/auth/getUserInfo` + `/route/getUserRoutes` 都 200 + envelope `code:0`
- 三 user 各自 `getUserRoutes` 返不同 menu tree（per sys_role_menu 對應）
- 假 role / 缺 policy 對 protected endpoint 走 envelope `code:5001`（CASBIN_DENY）

---

## 6. Contract guarantees（F5.1）

- Casbin enforce 在 protected admin router 完整啟用、reject 統一走 F4 envelope `{code:5001, msg, data:null}`
- 既有 axum-casbin upstream crate 不 fork、F5.1 adapter 為 after-layer wrapper、保 upstream upgrade 順暢
- F5.2 階段加 redis pub-sub `casbin:policy:invalidate` channel 時、F5.1 adapter 不需改（pub-sub 是 policy reload trigger、不影響 enforce 結果 envelope）
