# Contract: F6 `/route/isRouteExist` endpoint(request / response)

**Feature**: F6 route-guard
**Contract type**: HTTP endpoint interface
**Date**: 2026-05-18

> 本契約定義 `/route/isRouteExist` 的 request format / response shape / error code / auth requirements。

---

## C-E1:Endpoint URL + method + auth

**URL**:`/route/isRouteExist`(rust-api 內部 path;經 W-F5 nginx 反代為 `/api/route/isRouteExist`)
**HTTP method**:`GET`
**Auth**:`Authorization: Bearer <jwt-access-token>` MUST present + valid(per F5.1 既有 auth middleware)
**Casbin enforce**:passing — seed migration `m20260518_a_f6_isRouteExist_seed` 對 3 既有 role allow `/route/isRouteExist GET`(per E-5)

**Verification**:
```bash
curl -fsS -H "Authorization: Bearer <token>" 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home'
```

---

## C-E2:Request query parameter

| Param | Type | Required | Validation | Note |
|---|---|---|---|---|
| `routeName` | string | yes | `length(min = 1)` | camelCase、對齊 base-web `fetchIsRouteExist(routeName)` 既有呼叫 |

**Verification**(plan 階段確認 rename 對齊):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec rust-api \
  curl -fsS http://localhost:11081/route/isRouteExist?routeName=home -H "Authorization: Bearer <token>"
```

---

## C-E3:Success response shape

```json
{
  "code": 0,
  "msg": "ok",
  "data": true
}
```

或 `data: false`。

**契約**:
- `code` MUST 為 F4 既有 success code(per F4 spec、預期 `0`)
- `msg` MUST 為非空字串(per F4 既有 helper、預期 `"ok"` 或 i18n msg)
- `data` MUST 為 **plain boolean**(`true` 或 `false`)、**非** object `{exists: true}`(對齊 base-web `<boolean>` 型別 + `Boolean(data)` 抽取 per `store/modules/route/index.ts:306`)

**Verification**:
```bash
curl -fsS -H "Authorization: Bearer <token>" '...?routeName=home' | jq '.data | type'
# 預期:"boolean"
curl -fsS -H "Authorization: Bearer <token>" '...?routeName=home' | jq '.data'
# 預期:true(對 seed 含 home menu)
```

---

## C-E4:Failure response shapes

### C-E4a:Auth fail(401)— per E-1 / E-2

**Trigger**:無 token / token 過期 / token 無效。

**Response**:HTTP 401 + body:
```json
{
  "code": <auth-error-code>,
  "msg": "<auth-error-msg>",
  "data": null
}
```

對齊 F5.1 既有 auth middleware error envelope shape(per F5.1 FR-017 + spec FR-004)。

### C-E4b:Casbin enforce deny(403)— **不該發生** if E-5 seed 已 up

**Trigger**:role 沒對應 policy entry(理論上 seed 上去後 3 既有 role 全 allow、不該觸發);若拿了非標準 role 的 token 訪問會觸發。

**Response**:HTTP 403 + body 同 C-E4a shape、`code` 為 F5.1 既有 Casbin deny code。

### C-E4c:Input validation fail(per E-4 / E-5)

**Trigger**:`routeName` query 完全缺漏 或 為空字串。

**Response**:Plan 階段確認 — 兩個可能行為:
1. **axum Query deserialize fail**:HTTP 400 + body 為 axum 預設 plain text(若 F5.1 既有未統一 wrap into F4 envelope、F6 對齊)
2. **`input.validate()?` 顯式 call**:HTTP 200 + F4 envelope `{code: <validation-code>, msg, data: null}`

Plan 階段 grep F5.1 既有 Query handler validation 模式(若 sys_user_api.rs 等 Query handler 有顯式 validate、F6 加;若無、F6 對齊不加、靠 sql 查不到自然回 false 對非空但無效 routeName)。

**MVP behavior**:接受**任一**行為(無顯式 validate、靠 deserialize fail 或 ε 字串自然 false)— 屬 plan 階段 OQ 解、不阻 MVP。

### C-E4d:Internal error(500)

**Trigger**:DB connection lost / sea-orm error。

**Response**:HTTP 500 + body F4 envelope per 既有 global error handler。

---

## C-E5:`routeName` 特殊字元處理

**Contract**:`routeName` query 經 URL-decode 後直接傳 sea-orm `.eq(decoded_value)`、無 SQL injection 風險(sea-orm parameterized query)。

**Verification**:
```bash
# 特殊字元 routeName(極端 case、預期 sys_menu 無此 route_name)
curl -fsS -H "Authorization: Bearer <token>" 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=user%2Fadmin'
# 預期:{code:0, data:false}(decoded 為 "user/admin"、sys_menu 無此 route_name)

# SQL injection attempt
curl -fsS -H "Authorization: Bearer <token>" "http://127.0.0.1:11080/api/route/isRouteExist?routeName=home'%20OR%20'1'='1"
# 預期:{code:0, data:false}(decoded 為 "home' OR '1'='1"、sea-orm parameterized、SQL injection 不發生、sys_menu 無此 route_name)
```

---

## Contracts 數量

| Contract | 場景 |
|---|---|
| C-E1 | URL + method + auth 必要 |
| C-E2 | query param routeName camelCase |
| C-E3 | success shape boolean data |
| C-E4a | auth fail 401 |
| C-E4b | Casbin deny 403(不該發生) |
| C-E4c | input validation fail(plan 階段 OQ)|
| C-E4d | internal error 500 |
| C-E5 | URL encode + SQL injection safety |

**8 個 endpoint contract、涵蓋 success + 4 error mode + 2 input edge case**。
