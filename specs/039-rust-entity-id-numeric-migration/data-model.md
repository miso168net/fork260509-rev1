# Data Model — 039 rust-entity-id-numeric-migration

5 entity 各加 `display_id` BIGINT UNIQUE 副欄、ULID PK 保留、~25 個改動點。Phase 0 research（R-Q1~R-Q6）已 resolved；本檔列具體改動位置 + 細節。

## 既有實體（schema 0 結構改動 OR 加副欄）

| Table | PK | display_id（新加） | FK 用法 | base-web 接通狀態 |
|---|---|---|---|---|
| `sys_user` | id VARCHAR(ULID) | **新加 BIGINT UNIQUE NOT NULL** | sys_user_role.user_id / sys_tokens.user_id 引用 ULID PK | ✅ W-FW1 / W-FW5 接通 |
| `sys_role` | id VARCHAR(ULID) | **新加 BIGINT UNIQUE NOT NULL** | sys_user_role.role_id / sys_role_menu.role_id 引用 ULID PK | ✅ W-FW3 / W-FW4 / W-FW6 接通 |
| `sys_endpoint` | id VARCHAR(deterministic hash from path+method) | **新加 BIGINT UNIQUE NOT NULL** | （無 FK 從別表指過來）| ✅ W-FW8 接通 |
| `sys_organization` | id VARCHAR(ULID) | **新加 BIGINT UNIQUE NOT NULL** | （目前無 base-web 接通 CRUD） | ⏳ 預備（typings 已宣告 number） |
| `sys_access_key` | id VARCHAR(ULID) | **新加 BIGINT UNIQUE NOT NULL** | （目前無 base-web 接通 CRUD） | ⏳ 預備 |
| `sys_menu` | id INTEGER | 不動（已 i32 對齊 typings number） | sys_role_menu.menu_id 引用 i32 PK | ✅（既有）|
| `sys_domain` | id VARCHAR(ULID) | 不動（後端 internal、base-web 不直接看） | sys_user.domain / 各表 domain 引用 string code | N/A |
| `sys_login_log` / `sys_operation_log` / `sys_tokens` | id VARCHAR(ULID) | 不動（log/token 自身 PK、不暴露 base-web） | 自身 PK | N/A |
| `casbin_rule` / `sys_user_role` / `sys_role_menu` | 略 | 不動（FK 表、跟 5 entity FK 仍 ULID） | 引用 ULID | N/A |

## A — 雙欄 schema 擴充

### A1 — Snowflake i64 generator helper（新檔）

新檔 `rust-api/server/global/src/snowflake.rs`（~50-80 行、self-roll 首選；fallback `idgenerator` crate）：

```rust
//! Snowflake i64 generator for 5 業務 entity display_id（W-FW9 同類設計 / 此 feature 039）。
//! Structure: 41bit timestamp ms from EPOCH_2020 + 10bit machine_id + 12bit sequence。
//! machine_id 從 HOSTNAME env hash 取（自動、無 manual config、跟 W-F11 多 replica 預備對齊）。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

const EPOCH_2020_MS: u64 = 1577836800000;  // 2020-01-01 UTC
const MACHINE_BITS: u64 = 10;
const SEQ_BITS: u64 = 12;
const SEQ_MASK: u64 = (1 << SEQ_BITS) - 1;
const MAX_MACHINE_ID: u64 = (1 << MACHINE_BITS) - 1;

static MACHINE_ID: OnceLock<u64> = OnceLock::new();
static LAST_STATE: AtomicU64 = AtomicU64::new(0);  // (timestamp_ms << SEQ_BITS) | seq

fn machine_id() -> u64 {
    *MACHINE_ID.get_or_init(|| {
        let hostname = std::env::var("HOSTNAME").unwrap_or_else(|_| "rev1-default".to_string());
        let mut hash: u64 = 5381;
        for b in hostname.as_bytes() { hash = hash.wrapping_mul(33).wrapping_add(*b as u64); }
        hash & MAX_MACHINE_ID
    })
}

pub fn next_display_id() -> i64 {
    loop {
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        let now_ms = now_ms.saturating_sub(EPOCH_2020_MS);
        let prev = LAST_STATE.load(Ordering::Acquire);
        let prev_ts = prev >> SEQ_BITS;
        let prev_seq = prev & SEQ_MASK;
        let (ts, seq) = if now_ms > prev_ts {
            (now_ms, 0)
        } else if now_ms == prev_ts && prev_seq < SEQ_MASK {
            (now_ms, prev_seq + 1)
        } else {
            // clock 倒退 OR seq 用完、等到下一個 ms
            std::thread::sleep(std::time::Duration::from_millis(1));
            continue;
        };
        let new_state = (ts << SEQ_BITS) | seq;
        if LAST_STATE.compare_exchange(prev, new_state, Ordering::Release, Ordering::Acquire).is_ok() {
            return ((ts << (MACHINE_BITS + SEQ_BITS)) | (machine_id() << SEQ_BITS) | seq) as i64;
        }
        // CAS lost → retry
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_unique_and_time_ordered() {
        let mut ids = Vec::with_capacity(1000);
        for _ in 0..1000 { ids.push(next_display_id()); }
        let unique: HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), 1000, "1000 个连续生成的 display_id MUST 不重复");
        for w in ids.windows(2) { assert!(w[0] < w[1], "MUST time-ordered: {} < {}", w[0], w[1]); }
        // 範圍檢查: < 2^53 JS safe integer
        for id in &ids {
            assert!(*id > 0 && (*id as u64) < (1u64 << 53), "id {} 必須在 JS safe integer 範圍", id);
        }
    }
}
```

`server/global/src/lib.rs` 加 `pub mod snowflake;`。

`server/global/Cargo.toml` 不需新增 dep（self-roll 0 dep）。

### A2 — 5 entity sea-orm entity struct 同步

每個檔加 `pub display_id: i64`：

```rust
// server/model/src/admin/entities/sys_user.rs:13 加
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(table_name = "sys_user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub display_id: i64,  // ← NEW (W-FW9 / 039)
    // ... 其他既有欄
}
```

同理 sys_role / sys_endpoint / sys_organization / sys_access_key 的 entity Model + ActiveModel。

### A3 — 5 entity schema migration（新檔）

新檔 `rust-api/migration/src/schemas/m20260524_d_add_display_id_to_business_entities.rs`：

```rust
//! 039 rust-entity-id-numeric-migration (A3 schema)：5 業務 entity 加 display_id BIGINT 副欄 + INDEX。
//! NOT NULL DEFAULT 0 先設、待 A4 backfill 後 DROP DEFAULT + ADD UNIQUE。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in &["sys_user", "sys_role", "sys_endpoint", "sys_organization", "sys_access_key"] {
            manager.alter_table(
                Table::alter().table(Alias::new(*table))
                    .add_column(ColumnDef::new(Alias::new("display_id")).big_integer().not_null().default(0))
                    .to_owned()
            ).await?;
            manager.create_index(
                Index::create().table(Alias::new(*table))
                    .name(&format!("idx_{}_display_id", table)).col(Alias::new("display_id"))
                    .to_owned()
            ).await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in &["sys_user", "sys_role", "sys_endpoint", "sys_organization", "sys_access_key"] {
            manager.drop_index(
                Index::drop().table(Alias::new(*table)).name(&format!("idx_{}_display_id", table)).to_owned()
            ).await?;
            manager.alter_table(
                Table::alter().table(Alias::new(*table))
                    .drop_column(Alias::new("display_id"))
                    .to_owned()
            ).await?;
        }
        Ok(())
    }
}
```

Register in `migration/src/lib.rs` 末端、緊接 W-FW8 `m20260524_c`。也 `migration/src/schemas/mod.rs` `pub mod m20260524_d_...`.

### A4 — 5 entity backfill migration（新檔）

新檔 `rust-api/migration/src/datas/m20260524_e_backfill_display_id.rs`：

```rust
//! 039 rust-entity-id-numeric-migration (A4 backfill)：對 5 entity 既有 row UPDATE display_id 為 Snowflake i64。
//! 之後 ALTER TABLE ... DROP DEFAULT; ADD UNIQUE。

use sea_orm_migration::{prelude::*, sea_orm::{Statement, ConnectionTrait}};
use server_global::snowflake::next_display_id;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for table in &["sys_user", "sys_role", "sys_endpoint", "sys_organization", "sys_access_key"] {
            // SELECT 既有 row id
            let select_sql = format!("SELECT id FROM {}", table);
            let rows = db.query_all(Statement::from_string(manager.get_database_backend(), select_sql)).await?;
            for row in rows {
                let id: String = row.try_get("", "id").map_err(|e| DbErr::Custom(e.to_string()))?;
                let display_id = next_display_id();
                let update_sql = format!("UPDATE {} SET display_id = $1 WHERE id = $2", table);
                db.execute(Statement::from_sql_and_values(
                    manager.get_database_backend(), &update_sql,
                    vec![display_id.into(), id.into()],
                )).await?;
                // sleep 1ms 確保跨 row time-ordered（next_display_id 內已等下一個 ms 若 seq 用完）
            }
            // DROP DEFAULT + ADD UNIQUE
            let alter_sql = format!(
                "ALTER TABLE {} ALTER COLUMN display_id DROP DEFAULT; \
                 ALTER TABLE {} ADD CONSTRAINT uq_{}_display_id UNIQUE (display_id);",
                table, table, table
            );
            db.execute(Statement::from_string(manager.get_database_backend(), alter_sql)).await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for table in &["sys_user", "sys_role", "sys_endpoint", "sys_organization", "sys_access_key"] {
            let drop_sql = format!("ALTER TABLE {} DROP CONSTRAINT IF EXISTS uq_{}_display_id;", table, table);
            db.execute(Statement::from_string(manager.get_database_backend(), drop_sql)).await?;
        }
        Ok(())
    }
}
```

Register in `migration/src/lib.rs` 末端、緊接 A3。`migration/src/datas/mod.rs` `pub mod m20260524_e_...`.

### A5 — 5 entity service create path 改寫

#### A5.1 sys_user_service.rs:165 `create_user`

```rust
let user = SysUserActiveModel {
    id: Set(Ulid::new().to_string()),
    display_id: Set(snowflake::next_display_id()),  // ← NEW
    // ... 其他欄
};
```

import: `use server_global::snowflake;`.

#### A5.2 sys_role_service.rs:136 `create_role`、A5.3 sys_access_key_service.rs:138 `create_access_key`、A5.4 sys_organization_service.rs `create_organization`（若有）

同上 pattern：加 `display_id: Set(snowflake::next_display_id())`。

#### A5.5 sys_endpoint sync —— `router_initialization.rs:388 process_collected_routes`

```rust
SysEndpoint {
    id: generate_id(&route.path, &route.method.to_string()),
    display_id: snowflake::next_display_id(),  // ← NEW (per startup-time 即時生成、deterministic for runtime row)
    // ... 其他欄
}
```

注意：startup 時新建立的 endpoint row 用 next_display_id；既有 row 由 A4 backfill；upsert_endpoint_with_audit 內若更新既有 row、display_id 保留（不覆寫）。

## B — Snowflake helper（如 A1 已列）

略——A1 已含完整 implementation。

## C — API 邊界 transform

### C1 — Output struct id 改型 + From impl

#### C1.1 sys_user.rs:12 UserOutput / sys_user.rs:25 UserWithoutPassword

```rust
// 改前: pub id: String,
// 改後: pub id: i64,
```

對應 From impl（若有）改 `id: model.display_id`（從 `id: model.id` 改）。

#### C1.2 sys_system_manage.rs:21 SystemManageRoleOutput / :52 SystemManageAllRoleOutput / :71 SystemManageUserOutput

各 struct `pub id: String` → `pub id: i64`；對應 From impl 內 `id: model.display_id`。

#### C1.3 sys_endpoint.rs:6 EndpointTree

```rust
pub struct EndpointTree {
    pub id: i64,  // ← was String
    // ... 其他欄
}
```

#### C1.4 EndpointTreeNode（W-FW8 加、見 sys_endpoint.rs）

```rust
pub struct EndpointTreeNode {
    pub key: String,  // 保留 String（NTree key shape；leaf 用 display_id.to_string()）
    pub label: String,
    // ... 其他欄
}
```

leaf 構造改：`key: format!("{}", ep.display_id)` （從 `key: ep.id.clone()` 改）。

### C2 — Input DTO 改型（R-Q2 9 處）

#### C2.1 sys_authorization.rs

```rust
// AssignPermissionDto
pub struct AssignPermissionDto {
    pub domain: String,
    pub role_id: i64,                  // was String
    pub permissions: Vec<i64>,         // was Vec<String>
}

// AssignRouteDto
pub struct AssignRouteDto {
    pub domain: String,
    pub role_id: i64,                  // was String
    pub route_ids: Vec<i32>,           // 不動（menu.id i32）
}

// AssignUserDto
pub struct AssignUserDto {
    pub role_id: i64,                  // was String
    pub user_ids: Vec<i64>,            // was Vec<String>
}

// SystemManageAssignRoleEndpointsInput
pub struct SystemManageAssignRoleEndpointsInput {
    pub role_id: i64,                  // was String
    pub endpoint_ids: Vec<i64>,        // was Vec<String>
}
```

`Validate` macro `length(min=1)` 對 i64 不適用 —— 改 `range(min=1)` 或拿掉（business validity 由 lookup 階段 reject）。

#### C2.2 sys_role.rs UpdateRoleHomeInput (W-FW6 N2)

```rust
pub struct UpdateRoleHomeInput {
    pub role_id: i64,                  // was String
    pub home: Option<String>,
}
```

### C3 — Handler Path + Lookup helper（R-Q5 6 處）

每個 handler：
- `Path<String>` → `Path<i64>`
- 加 lookup 段：`let role_ulid = role_service.lookup_ulid_by_display_id(input.role_id).await?;`
- 業務 service call 用 ULID

#### C3.1 service trait method 新增（5 service 各 1 method）

```rust
// SysRoleService
async fn lookup_ulid_by_display_id(&self, display_id: i64) -> Result<String, AppError> {
    let role = sys_role::find_active()
        .filter(sys_role::Column::DisplayId.eq(display_id))
        .one(db.as_ref()).await?
        .ok_or(AuthorizationError::RoleNotFound)?;
    Ok(role.id)
}
```

同理 SysUserService / SysEndpointService / SysOrganizationService / SysAccessKeyService。

#### C3.2 6 處 handler 改寫

| handler | 改型 lookup |
|---|---|
| `sys_system_manage_api.rs:333 get_role_menu_ids` | `Path(display_id): Path<i64>` + `let role_id = svc.lookup_ulid_by_display_id(display_id).await?;` |
| `sys_system_manage_api.rs:361 get_role_home` (W-FW6) | 同上 |
| `sys_system_manage_api.rs:436 get_role_endpoint_ids` (W-FW8) | 同上 |
| `sys_role_api.rs:38 get_role_by_id` | 同上 |
| `sys_role_api.rs:54 delete_role_by_id` | 同上 |
| `sys_user_api.rs:82 get_user_by_id` | `Path<i64>` + `let user_id = svc.lookup_ulid_by_display_id(display_id).await?;` |
| `sys_user_api.rs:98 delete_user_by_id` | 同上 |
| `sys_access_key_api.rs:39 access_key get_by_id` | `Path<i64>` + `let ak_id = svc.lookup_ulid_by_display_id(display_id).await?;` |

#### C3.3 assignment-type handler input DTO lookup

```rust
// assign_role_endpoints_for_systemmanage handler
pub async fn assign_role_endpoints_for_systemmanage(
    Extension(user): Extension<User>,
    Extension(service): Extension<Arc<SysAuthorizationService>>,
    Extension(role_svc): Extension<Arc<SysRoleService>>,
    Extension(endpoint_svc): Extension<Arc<SysEndpointService>>,
    Extension(mut cache_enforcer): Extension<CasbinAxumLayer>,
    Json(input): Json<SystemManageAssignRoleEndpointsInput>,
) -> Result<Res<bool>, AppError> {
    let actor = Actor::from(&user);
    let domain = user.domain().to_string();
    let enforcer = cache_enforcer.get_enforcer();
    
    // lookup ULID（W-FW9 / 039 新加）
    let role_id_ulid = role_svc.lookup_ulid_by_display_id(input.role_id).await?;
    let mut endpoint_ids_ulid = Vec::with_capacity(input.endpoint_ids.len());
    for display_id in &input.endpoint_ids {
        // 或 batch lookup 一次拿全（optimisation；非必要）
        let ulid = endpoint_svc.lookup_ulid_by_display_id(*display_id).await?;
        endpoint_ids_ulid.push(ulid);
    }
    
    service.assign_permission(domain, role_id_ulid, endpoint_ids_ulid, enforcer, &actor).await
        .map(|_| Res::new_data(true))
}
```

類似改 `assign_routes` / `assign_users` / `assign_permission` / `update_role_home` 等 handler。

## D — Rust internal SoT 保留（**0 改動**）

完整保留：
- `audit_log::write_in_txn` + payload_before/after JSON 內 `roleId` / `userId` / `endpointIds` / `menuIds` 字串
- `audit_log.entity_id` VARCHAR ULID
- `JwtClaim.sub: String` (ULID 內容)
- Casbin `g` rule (`g, user_id_ULID, role_code, domain`)
- FK schema: `sys_user_role.{user_id, role_id} VARCHAR` / `sys_role_menu.role_id VARCHAR` / `sys_tokens.user_id VARCHAR` / `sys_login_log.user_id VARCHAR` / `sys_operation_log.user_id VARCHAR`

**Reason**: rust internal 業務邏輯一致以 ULID 為 SoT、X1 雙欄設計核心安全網。

## 命名與型別摘要

| 層 | 5 entity id 表現 | rust 內部 | wire (base-web) |
|---|---|---|---|
| PostgreSQL | `id VARCHAR(ULID PK)` + `display_id BIGINT UNIQUE NOT NULL` | — | — |
| Sea-ORM entity Model | `pub id: String` + `pub display_id: i64` | both available | — |
| Service layer | 業務邏輯以 `entity.id`（ULID）為 SoT | ULID | — |
| Input DTO | `role_id: i64` / `user_ids: Vec<i64>` / 等 | i64（base-web 送的 display_id）→ lookup 反查 ULID | i64 (number) |
| Output struct | `id: i64`（從 model.display_id） | i64 | i64 (number) |
| API handler | `Path<i64>` + lookup `ulid_by_display_id` | i64 → ULID | — |
| audit_log payload | `roleId: ULID string` / `userIds: ULID[]` | ULID | — |
| JWT sub claim | `sub: ULID string` | ULID | — |
| Casbin g rule | `g, user_id_ULID, role_code, domain` | ULID | — |
| FK | sys_user_role.user_id / sys_role_menu.role_id (VARCHAR ULID) | ULID | — |
| Snowflake helper | `next_display_id() -> i64` | i64 | — |
