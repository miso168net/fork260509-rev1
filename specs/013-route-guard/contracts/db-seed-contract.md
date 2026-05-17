# Contract: F6 DB seed + sys_menu filter

**Feature**: F6 route-guard
**Contract type**: database seed + query filter 契約
**Date**: 2026-05-18

> 本契約定義 F6 對 DB 的改動範圍(僅 casbin_rule 3 row seed)+ sys_menu 查詢 filter 必須含的 3 個 condition。

---

## C-D1:Casbin policy seed(新建 3 row、per E-5)

**Migration file**:`rust-api/migration/src/datas/m20260518_a_f6_isRouteExist_seed.rs`

**Up SQL**:
```sql
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4, v5) VALUES
('p', 'ROLE_SUPER', 'built-in', '/route/isRouteExist', 'GET', '', ''),
('p', 'ROLE_ADMIN', 'built-in', '/route/isRouteExist', 'GET', '', ''),
('p', 'ROLE_USER',  'built-in', '/route/isRouteExist', 'GET', '', '');
```

**Down SQL**:
```sql
DELETE FROM casbin_rule
WHERE ptype = 'p' AND v1 = 'built-in'
  AND v2 = '/route/isRouteExist' AND v3 = 'GET'
  AND v0 IN ('ROLE_SUPER', 'ROLE_ADMIN', 'ROLE_USER');
```

**Verification**(implement T1 / T2):
```bash
# Up 後驗:
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  psql -U postgres -d soybean-admin-rust -c \
  "SELECT v0, v2 FROM casbin_rule WHERE v2 = '/route/isRouteExist' ORDER BY v0;"
# 預期 3 row:
#   ROLE_ADMIN | /route/isRouteExist
#   ROLE_SUPER | /route/isRouteExist
#   ROLE_USER  | /route/isRouteExist

# Down 後驗:
docker compose ... psql ... -c \
  "SELECT count(*) FROM casbin_rule WHERE v2 = '/route/isRouteExist';"
# 預期:0
```

---

## C-D2:Migration registration

**Mod file**:`rust-api/migration/src/datas/mod.rs`

**Required addition**:
```rust
pub mod m20260518_a_f6_isRouteExist_seed;

// 在 Migrator::migrations() vec 末尾加:
Box::new(m20260518_a_f6_isRouteExist_seed::Migration),
```

**Verification**:
```bash
cd rust-api && cargo run -p migration -- up
# 預期:含 "Applying migration: M20260518_A_F6IsRouteExistSeed" log line
```

---

## C-D3:sys_menu SQL filter 3 個必含 condition(per R-7 + spec FR-003)

```rust
sys_menu::Entity::find()
    .filter(sys_menu::Column::RouteName.eq(route_name))    // (1) exact match
    .filter(sys_menu::Column::DeletedAt.is_null())          // (2) F3 soft-delete 紀律
    .filter(sys_menu::Column::Status.eq(Status::Enabled))   // (3) status enabled only
    .count(&self.db)
    .await
```

**3 個 filter MUST 同時存在**(per US3 紀律驗 + spec FR-003):
- 缺(2)→ soft-deleted menu row 返 true(false positive)
- 缺(3)→ `Status::Disabled` / `Banned` row 返 true(false positive)
- 缺(1)→ 整表 count、回 true if 任何 row 存在(完全錯誤)

**Verification**(US3 scenario 1+2):
```sql
-- Setup: 軟刪某 active menu
UPDATE sys_menu SET deleted_at = NOW() WHERE route_name = 'demo-soft-delete-test';
-- 然後 curl 該 routeName 應返 false

-- Setup: 把 status 改 disabled
UPDATE sys_menu SET status = 'disabled' WHERE route_name = 'demo-disabled-test';
-- 然後 curl 該 routeName 應返 false

-- Cleanup(acceptance 結束):
UPDATE sys_menu SET deleted_at = NULL WHERE route_name = 'demo-soft-delete-test';
UPDATE sys_menu SET status = 'enabled' WHERE route_name = 'demo-disabled-test';
```

---

## C-D4:sys_endpoint 表自動 sync(per R-6)

**Mechanism**:`init_protected_menu_router` 加 `RouteInfo::new("/route/isRouteExist", Method::GET, ...)` 進 routes vec、boot 階段 `add_route()` push 進 `ROUTE_COLLECTOR` global、另一個 init step 從 ROUTE_COLLECTOR 同步寫 sys_endpoint 表。

**F6 MUST 走既有 sync 機制、不手動 INSERT sys_endpoint row**(對齊 F5.1 既有 pattern)。

**Verification**(boot 後):
```sql
SELECT path, method, service_name, description
FROM sys_endpoint
WHERE path = '/route/isRouteExist' AND method = 'GET';
-- 預期 1 row:path='/route/isRouteExist', method='GET', service_name='SysMenuApi', description='查询路由是否存在'
```

若 boot 後 row 不存在,可能 sync 機制有問題(F5.1 既有 /route/getUserRoutes 應也有此 row、可作為基準)— plan 階段 grep boot init sequence 確認 sync 機制 actual implementation。

---

## C-D5:既有 sys_menu schema 不動(per A-005)

**Contract**:F6 **不**動 sys_menu 表 schema(`route_name` / `status` / `deleted_at` 三個 column F3 + F5.1 已就位)。

**Verification**:
```bash
git diff HEAD -- rust-api/migration/src/structures/
# 預期:無輸出(F6 不動 schema migration)

git diff HEAD -- rust-api/server/model/src/admin/entities/sys_menu.rs
# 預期:無輸出(F6 不動 entity 定義)
```

---

## C-D6:既有 `sys_menu(route_name)` unique index(per A-005 + plan 階段確認)

**Expected**:`sys_menu.route_name` 有 unique index(per entity `#[sea_orm(unique)]` attribute、line 19 of `entities/sys_menu.rs`)。

**Plan 階段 verification**:
```bash
grep -rE "route_name.*UNIQUE|unique.*route_name" rust-api/migration/src/structures/ 2>/dev/null
# 預期:命中 1 次(若無、F6 範疇加 1 個 schema migration 加 index)
```

若 plan 階段確認既有 schema migration 已有 UNIQUE INDEX、F6 不必加 schema migration(僅加 seed migration、per FR-002)。若無、F6 範疇加 1 個 schema migration。

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-D1 | Casbin policy seed(3 row up/down)|
| C-D2 | Migration registration(mod.rs)|
| C-D3 | sys_menu SQL filter 3 個必含 condition |
| C-D4 | sys_endpoint 自動 sync(per add_route)|
| C-D5 | 既有 sys_menu schema 不動 |
| C-D6 | 既有 unique index 確認(plan stage verify)|

**6 個 DB seed / filter / schema contract、涵蓋 F6 對 DB 全部觸及點**。
