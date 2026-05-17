# Contract: host 驗證命令(F6)

**Feature**: F6 route-guard
**Contract type**: verification command interface
**Date**: 2026-05-18

> 本契約定義 F6 acceptance / debug 階段的驗證命令、預期輸出、失敗判讀。implement 階段 task + acceptance scenario(US1 + US2 + US3)以此為基準。

---

## C-V1:Dev stack startup(F6 不改 W-stack、但 acceptance 依賴)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps
# 預期:6 service healthy(同 W-F6 baseline)、F6 implement 後仍正常
```

**Failure**:F6 implement 破壞 migration(如 mod.rs 有 syntax error)、rust-api healthcheck fail → check `docker compose logs rust-api --tail 30`

---

## C-V2:Login 拿 token(US1 / US2 / US3 prereq)

```bash
TOKEN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  http://127.0.0.1:11080/api/auth/login | jq -r '.data.token')
echo "$TOKEN" | head -c 50
# 預期:JWT 字串開頭(eyJ...)
```

---

## C-V3:US1 — `routeName` 存在回 true(per spec US1 scenario 1 + C-E3)

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq
# 預期:{"code": 0, "msg": "...", "data": true}
```

**Variations**:
```bash
# 對其他 active route name 試(per US1 scenario 2)
for name in home about user_role manage_user; do
  echo "--- $name ---"
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:11080/api/route/isRouteExist?routeName=$name" | jq -r '.data'
done
# 預期:已 seed 的 active route name 回 true、未 seed 的回 false
```

**Failure**:
- `data: false` 對應理應存在的 routeName → 該 routeName 未 seed 或被軟刪 / disabled
- HTTP 403 + Casbin deny → seed migration 未 up,跑 `docker compose exec migration ./migration up` 重試

---

## C-V4:US2 — `routeName` 不存在回 false(per spec US2 scenario 1 + C-E3)

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=non-existent-xyz-2026' | jq
# 預期:{"code": 0, "data": false}
```

---

## C-V5:US2 scenario 2 — `routeName` 為空字串(per spec US2 scenario 2 + C-E4c)

```bash
curl -fsSI -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=' | head -3
# 預期:HTTP 400(或 200 + validation error envelope,plan 階段 OQ 解後確認)

# 或缺漏 query
curl -fsSI -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist'
# 預期:同上
```

**判讀**:依 plan 階段 OQ-C-E4c 拍板;接受兩種(deserialize fail 400 或 顯式 validate envelope)— 但**不該回** `data: false`(那會混淆 user 給空字串 vs 給有效但不存在 name)。

---

## C-V6:US3 — soft-deleted menu 回 false(per spec US3 scenario 1 + C-D3)

```bash
# Setup:
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "UPDATE sys_menu SET deleted_at = NOW() WHERE route_name = 'home';"

# Verify:
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq -r '.data'
# 預期:false(F3 soft-delete 紀律 honor)

# Cleanup:
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "UPDATE sys_menu SET deleted_at = NULL WHERE route_name = 'home';"
```

---

## C-V7:US3 scenario 2 — disabled menu 回 false(per spec US3 scenario 2 + C-D3)

```bash
# Setup:
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "UPDATE sys_menu SET status = 'disabled' WHERE route_name = 'home';"

# Verify:
curl -fsS -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | jq -r '.data'
# 預期:false(status filter 紀律 honor)

# Cleanup:
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "UPDATE sys_menu SET status = 'enabled' WHERE route_name = 'home';"
```

---

## C-V8:Auth fail — 無 token(per spec E-1 + C-E4a)

```bash
curl -fsSI 'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -3
# 預期:HTTP 401(無 Authorization header)

# 或無效 token
curl -fsSI -H "Authorization: Bearer fake-token-xyz" \
  'http://127.0.0.1:11080/api/route/isRouteExist?routeName=home' | head -3
# 預期:HTTP 401
```

---

## C-V9:Casbin seed verify(per C-D1)

```bash
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "SELECT v0, v2, v3 FROM casbin_rule WHERE v2 = '/route/isRouteExist' ORDER BY v0;"
# 預期 3 row:ROLE_ADMIN / ROLE_SUPER / ROLE_USER 各對 /route/isRouteExist GET
```

---

## C-V10:sys_endpoint sync verify(per C-D4)

```bash
PGPASSWORD=$(cat deploy/secrets/postgres_password.txt) \
  psql -h 127.0.0.1 -p 15432 -U postgres -d soybean-admin-rust \
  -c "SELECT path, method, service_name FROM sys_endpoint WHERE path = '/route/isRouteExist';"
# 預期 1 row:path='/route/isRouteExist', method='GET', service_name='SysMenuApi'
```

---

## C-V11:rust-api `cargo check` / `cargo build`(implement 階段必驗)

```bash
cd rust-api && cargo check -p server-api -p server-service -p server-model -p migration
# 預期:exit 0、無 compile error / warning(per F5.1 既有 strict warnings)
```

---

## C-V12:base-web src 零改動(per spec FR-011)

```bash
git diff HEAD -- base-web/src/
# 預期:無輸出
```

---

## C-V13:鏈路完整驗 — base-web 瀏覽器(可選 manual)

1. dev stack up(per C-V1)
2. host 機瀏覽器訪 `http://127.0.0.1:11080`(或 `https://127.0.0.1:11443`)
3. login Soybean/123456
4. 訪不存在路徑(如 `/non-existent-page`)
5. 預期:留在 not-found 頁(因為 isRouteExist 回 false、guard 不重導)
6. 訪 disabled 路徑(若有 disabled menu seed)
7. 預期:重導 `/403`(因為 isRouteExist 回 false、guard 不重導 — wait,這邏輯與「重導 403」相反!)

> **重要 logic clarification**:base guard `router/guard/route.ts:113-118`:
> ```ts
> const exist = await routeStore.getIsAuthRouteExist(to.path as RoutePath);
> if (exist) {
>   const location: RouteLocationRaw = { name: noPermissionRoute };
>   return location;
> }
> return null;  // 留 not-found
> ```
> isRouteExist 回 `true` → 重導 `/403`(route 存在但 user 無權限);回 `false` → 留 not-found。
> 
> 所以正確驗證情境是:**訪 disabled menu route → isRouteExist 回 false → 留 not-found**(不是預期重導 403)。
> 若想驗 403 重導、要找「sys_menu 有 active row 但 user role 在 sys_role_menu 表無對應」的 route — 這需要先 seed 一個 only-SUPER-can-access 的 menu、然後 login 一個 USER role 訪它。F7 manage 完整後較易構造,F6 acceptance 階段可選跳過此 manual 驗。

---

## Contracts 數量

| Contract | 場景 |
|---|---|
| C-V1 | Dev stack up sanity |
| C-V2 | Login token prereq |
| C-V3 | US1 routeName 存在 → true |
| C-V4 | US2 routeName 不存在 → false |
| C-V5 | US2 空字串 / 缺漏 → validation fail |
| C-V6 | US3 soft-deleted → false |
| C-V7 | US3 disabled → false |
| C-V8 | Auth fail 401 |
| C-V9 | Casbin seed 3 row verify |
| C-V10 | sys_endpoint sync verify |
| C-V11 | cargo check / build |
| C-V12 | base-web src 零改動 |
| C-V13 | base-web 瀏覽器 manual e2e(可選)|

**13 個 verification contract、涵蓋 US1+US2+US3 全 8 個 acceptance scenario + 5 個補強驗 + 1 個 manual e2e**。
