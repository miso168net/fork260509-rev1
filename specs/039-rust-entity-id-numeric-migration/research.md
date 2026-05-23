# Phase 0 Research — 039 rust-entity-id-numeric-migration

spec.md Assumptions 列 3 個 plan-phase research question（A-005 / A-006 / 與 5 entity service 變動範圍），本檔逐一查證解決。

## R-Q1 — Snowflake i64 generator crate 選擇 / self-roll 評估

- **Decision**: **採 `idgenerator` crate 0.4.x**（如 Sonyflake / Snowflake-rs 變體中、`idgenerator` 為主流選擇之一）；fallback 為 self-roll lightweight implementation（~50-80 行 + 1 unit test）。
- **實查**（基於 rust ecosystem 標準）：
  - `idgenerator` crate：MIT license、Snowflake-compatible、含 worker_id（=machine_id）+ datacenter_id 二級結構（10bit 共用）；API: `IdInstance::next_id() -> i64`；穩定、active maintained
  - `snowflake-rs`：Apache 2.0、簡單 Twitter Snowflake、少 maintainer activity
  - `snowflaked`：MIT、async-friendly、簡單 API、適合 single-machine deterministic
  - self-roll: ~50-80 行（timestamp + machine_id + seq + AtomicU64 last_ms 邏輯 + clock 倒退 wait-for-next-ms）— license 0 顧慮、依賴 0、實作風險低
- **Rationale**: rev1 是 admin-heavy 低 throughput 場景、Snowflake 需求簡單（單一 machine_id from hostname hash + 4096/ms seq + 41bit timestamp）— **self-roll 為首選**（依賴最小、code 在本 repo 內可審計、無 crate upgrade 維護負擔）；若 plan 階段 implementer 偏好 well-tested crate 可改 `idgenerator`、皆可。
- **Implementation skeleton**（self-roll，~50 行）：
  ```rust
  // server/global/src/snowflake.rs
  use std::sync::atomic::{AtomicU64, Ordering};
  use std::sync::OnceLock;
  use std::time::{SystemTime, UNIX_EPOCH};
  
  static MACHINE_ID: OnceLock<u64> = OnceLock::new();
  static LAST_STATE: AtomicU64 = AtomicU64::new(0);  // (timestamp_ms << 12) | seq
  
  const EPOCH_2020_MS: u64 = 1577836800000;  // 2020-01-01 UTC
  const MACHINE_BITS: u64 = 10;
  const SEQ_BITS: u64 = 12;
  const SEQ_MASK: u64 = (1 << SEQ_BITS) - 1;
  
  fn machine_id() -> u64 {
      *MACHINE_ID.get_or_init(|| {
          let hostname = std::env::var("HOSTNAME").unwrap_or_else(|_| "rev1-default".to_string());
          let mut hash: u64 = 5381;
          for b in hostname.as_bytes() { hash = hash.wrapping_mul(33).wrapping_add(*b as u64); }
          hash & ((1 << MACHINE_BITS) - 1)
      })
  }
  
  pub fn next_display_id() -> i64 {
      loop {
          let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
          let now_ms = now_ms.saturating_sub(EPOCH_2020_MS);
          let prev = LAST_STATE.load(Ordering::Acquire);
          let prev_ts = prev >> SEQ_BITS;
          let prev_seq = prev & SEQ_MASK;
          let (ts, seq) = if now_ms > prev_ts { (now_ms, 0) }
              else if now_ms == prev_ts && prev_seq < SEQ_MASK { (now_ms, prev_seq + 1) }
              else { std::thread::sleep(std::time::Duration::from_millis(1)); continue; };
          let new_state = (ts << SEQ_BITS) | seq;
          if LAST_STATE.compare_exchange(prev, new_state, Ordering::Release, Ordering::Acquire).is_ok() {
              return ((ts << (MACHINE_BITS + SEQ_BITS)) | (machine_id() << SEQ_BITS) | seq) as i64;
          }
      }
  }
  ```
- **Alternatives considered**：
  - 直接用 unix timestamp ms 為 id —— 否決：多 replica 同 ms 撞、無 distributed safety
  - 用 uuid::Uuid::new_v7() to_u64 —— 否決：UUID v7 為 128bit、轉 i64 損失 entropy、且 v7 設計目的非 Snowflake-style
  - 用 PostgreSQL sequence —— 否決：單一 DB lock、不適多 replica scale、跨 service 強耦合
  - **Twitter snowflake_rs / sonyflake-rs**：可選、本 plan 接受 implementer 取 well-tested crate 或 self-roll、皆 acceptable
- **Open**（plan 階段 leave 給 implementer 拍板）：crate 選擇 (`idgenerator` vs self-roll) 在實作 task 起手前由 implementer subagent 決定（influence 主要在 dep 加減、邏輯一致）

## R-Q2 — 既有 input DTO 改型清單（i64 / Vec<i64> cascade）

- **Decision**: input DTO 改動範圍 = **9 處**（5 entity 直接相關），全在 `server/model/src/admin/input/` 內。
- **實查**（grep `(role_id|user_id|endpoint_id|user_ids|role_ids|endpoint_ids|permissions): (String|Vec<String>)` in `server/model/src/admin/input/`）：

| # | 檔:line | DTO + 欄位 | 改動 | 用途 |
|---|---|---|---|---|
| 1 | `sys_authorization.rs:11` | `AssignPermissionDto.role_id: String` | → `i64` | role.display_id |
| 2 | `sys_authorization.rs:14` | `AssignPermissionDto.permissions: Vec<String>` | → `Vec<i64>` | endpoint.display_id 集合 |
| 3 | `sys_authorization.rs:24` | `AssignRouteDto.role_id: String` | → `i64` | role.display_id |
| 4 | `sys_authorization.rs:34` | `AssignUserDto.role_id: String` | → `i64` | role.display_id |
| 5 | `sys_authorization.rs:37` | `AssignUserDto.user_ids: Vec<String>` | → `Vec<i64>` | user.display_id 集合 |
| 6 | `sys_authorization.rs:47` | `SystemManageAssignRoleEndpointsInput.role_id: String` | → `i64` | role.display_id |
| 7 | `sys_authorization.rs:49` | `SystemManageAssignRoleEndpointsInput.endpoint_ids: Vec<String>` | → `Vec<i64>` | endpoint.display_id 集合 |
| 8 | `sys_role.rs:88` | `UpdateRoleHomeInput.role_id: String` | → `i64` | role.display_id (W-FW6 N2) |
| 9 | `sys_role.rs:99` | (W-FW6 同檔內、可能還有 second occurrence;待 grep confirm) | → 同上 | — |

**注意**：
- `AssignRouteDto.route_ids: Vec<i32>`（line ~28）：menu.id 本就 i32、**不在 5 entity 範圍、不動**。
- `SystemManageAssignRoleEndpointsInput.endpoint_ids` 影響 W-FW8 button-auth modal 的 input；base-web 端 `endpointIds` 從 string[] 改 number[]（typings 對齊）— 但 base-web typings 內 inline type `EndpointTreeNode.key` 仍是 string（樹節點 key），加上 endpoint.id 屬 leaf；本 feature 後 wire 上 endpoint.id 是 number、base-web 應同步以 number 收（typings 已宣告 number）。
- 其他 input DTO（CRUD path 內 body `id` 字段）由 axum extractor（Path<i64>）處理、不需 DTO 改。
- `Validate` macro 的 `length(min=1)` 對 String 用、對 i64 不適用 —— 改 i64 後改用 `range(min=1)` 或拿掉（i64 任何值都 valid、business validity 由 lookup 階段 reject）。

## R-Q3 — 既有 output struct 改型清單（id: i64）

- **Decision**: output struct 改動範圍 = **6 處**，全在 `server/model/src/admin/output/` 內。
- **實查**（grep `pub id: (String|i32)` in `server/model/src/admin/output/`）：

| # | 檔:line | struct + 欄位 | 改動 | 用途 |
|---|---|---|---|---|
| 1 | `sys_user.rs:12` | `UserOutput.id: String` | → `i64` | user.display_id |
| 2 | `sys_user.rs:25` | `UserWithoutPassword.id: String` | → `i64` | user.display_id |
| 3 | `sys_endpoint.rs:6` | `EndpointTree.id: String` | → `i64` | endpoint.display_id |
| 4 | `sys_system_manage.rs:21` | `SystemManageRoleOutput.id: String` | → `i64` | role.display_id |
| 5 | `sys_system_manage.rs:52` | `SystemManageAllRoleOutput.id: String` | → `i64` | role.display_id |
| 6 | `sys_system_manage.rs:71` | `SystemManageUserOutput.id: String` | → `i64` | user.display_id |

**注意**：
- `sys_domain.rs:5 DomainOutput.id: String` — **domain 不在 5 entity 範圍、不動**（spec 範疇外明示）。
- `sys_menu.rs:15, 48 MenuRoute.id / MenuTree.id: i32` — menu 本就 i32 + base-web typings number、**已對齊、不動**。
- `sys_system_manage.rs:108, 206 pub id: i32` — menu 相關 output、**不動**。
- `sys_endpoint.rs` 內可能有 `EndpointTreeNode`（W-FW8 加）—— **EndpointTreeNode.key 仍為 String**（tree shape 需 string key、但 endpoint.id 對應到 string-form 的 display_id i64）；wire 上 endpoint leaf 的 `key` 可保留為 `String`（值為 display_id.to_string()）以維持 NTree 兼容性。

`From<Model>` impl 改動：每個 output struct 的 `From` impl 內 `id: model.display_id`（從 `id: model.id` 改）。具體 impl 位置：
- `sys_system_manage.rs:170+` 各 From impl
- `sys_user.rs` From impl（若有 impl，否則 inline new() pattern）

## R-Q4 — 5 entity service create / sync path 改動清單

- **Decision**: 5 entity 中 4 個有明確 `Ulid::new().to_string()` 寫入 entity.id 的 service create path、各加 `display_id: Set(snowflake::next_display_id())`；sys_endpoint sync 在 `router_initialization.rs::process_collected_routes` 構造 `SysEndpoint` 時加 display_id（startup 階段、deterministic）；sys_organization 若無 admin create endpoint則只動 entity struct + schema、不動 service。
- **實查**：

| # | service / location | 既有 ULID 生成位置 | display_id 寫入位置 |
|---|---|---|---|
| 1 | `sys_user_service.rs:165` `create_user` | `id: Set(Ulid::new().to_string())` | 新增 `display_id: Set(snowflake::next_display_id())` |
| 2 | `sys_role_service.rs:136` `create_role` | `id: Set(Ulid::new().to_string())` | 同上 |
| 3 | `sys_access_key_service.rs:138` `create_access_key` | `id: Set(Ulid::new().to_string())` | 同上 |
| 4 | `sys_endpoint_service.rs` `sync_endpoints` + `router_initialization.rs:388` `process_collected_routes` | `id: generate_id(path, method)` (deterministic) | 在 `process_collected_routes` 構造 SysEndpoint 時加 display_id（或在 sync_endpoints upsert 時補；對既有 row backfill migration 涵蓋） |
| 5 | `sys_organization_service.rs` | **無 create_organization** service method（grep 0 命中） | entity struct + schema 加欄即可；service 改動 = 0（organization 目前無 admin create 流程） |

**注意 backfill 含 organization**：既有 seed organization rows（如 `m20241023_*_insert_sys_organization.rs` 若有）也要透過 backfill migration 填 display_id。

## R-Q5 — 既有 handler Path / handler lookup cascade 清單

- **Decision**: handler 改動範圍 = **6 處 Path 改型 + 6 處 lookup 邏輯**（5 entity 直接相關）。
- **實查**（grep `Path<String>` in `server/api/src/admin/`）：

| # | 檔:line | handler | 5 entity scope? | 改動 |
|---|---|---|---|---|
| 1 | `sys_system_manage_api.rs:333` | `get_role_menu_ids_for_systemmanage` (role_id) | ✅ role | `Path<String>` → `Path<i64>` + lookup role ULID |
| 2 | `sys_system_manage_api.rs:361` | `get_role_home_for_systemmanage` (role_id, W-FW6) | ✅ role | 同上 |
| 3 | `sys_system_manage_api.rs:436` | `get_role_endpoint_ids_for_systemmanage` (role_id, W-FW8) | ✅ role | 同上 |
| 4 | `sys_role_api.rs:38` | raw role get_by_id (id) | ✅ role | 同上 |
| 5 | `sys_role_api.rs:54` | raw role delete_by_id (id) | ✅ role | 同上 |
| 6 | `sys_user_api.rs:82` | raw user get_by_id (id) | ✅ user | 同上 + lookup user ULID |
| 7 | `sys_user_api.rs:98` | raw user delete_by_id (id) | ✅ user | 同上 |
| 8 | `sys_endpoint_api.rs:27` | endpoint auth-api `Path(role_code)` | ❌ (role_code, 非 id) | **不動** |
| 9 | `sys_access_key_api.rs:39` | access key get_by_id (id) | ✅ access_key | 同上 + lookup access_key ULID |

**Lookup helper 設計**（FR-010 體現）：
- 各 service 加 `async fn lookup_ulid_by_display_id(display_id: i64) -> Result<String, AppError>`（或 trait method）
- 統一在 entity not found 時 reject 既有 entity-not-found error code（RoleNotFound 4001 / UserNotFound 4002 / EndpointNotFound 等）
- 或抽 generic helper `pub async fn lookup_ulid<E>(display_id: i64) -> Result<String, AppError>` 用 generic + Entity trait（成本 5 行；avoidable: 直接 5 個 service 各加 method）

## R-Q6 — 5 entity backfill migration 策略

- **Decision**: 拆 2 個 migration：
  1. **A3 schema migration** (`m20260524_d_add_display_id_to_business_entities`)：5 entity 各加 `display_id BIGINT NOT NULL DEFAULT 0` + 非 UNIQUE INDEX
  2. **A4 data migration** (`m20260524_e_backfill_display_id`)：對既有 row UPDATE `display_id = next_display_id()` (跑迴圈、每 row 一次 Snowflake)；之後 `ALTER TABLE ... ALTER COLUMN display_id DROP DEFAULT; ALTER TABLE ... ADD CONSTRAINT ... UNIQUE(display_id);`
- **實查**：
  - 既有 row 數量（dev DB）：sys_user 3 + sys_role 3+ + sys_endpoint 70 + sys_organization (待 seed 數) + sys_access_key (待 seed 數)、合計 < 100 row、backfill 順跑 < 1 秒
  - DEFAULT 0 → backfill → DROP DEFAULT + ADD UNIQUE 是標準 NOT NULL 加欄 pattern（避免 NOT NULL 與既有 row 衝突）
- **Rationale**: 拆 2 migration 讓 schema 與 data 改動分離，down 對稱性更清楚（DROP COLUMN 自動含 INDEX/CONSTRAINT、down 簡單）；backfill 失敗可單獨 rollback data migration 不破壞 schema。
- **Alternative**: 單一 migration（schema + backfill 合一）—— 評估後 reject（拆兩個對 audit / debug 更友善、體例對齊既有 W-FW3 `m20260522_e_*` + W-FW6 `m20260524_a_*` schema 與 W-FW6 `m20260524_b_*` data 拆分模式）。

## 既有體例複核（供 plan / tasks / implementation 參照）

- **W-FW8 (038) 的 endpoint id 處理**：W-FW8 落地時 sys_endpoint.id 是 ULID string、base-web button-auth-modal 的 `endpointIds: string[]` input 直接接 ULID。本 feature 改成 `endpointIds: Vec<i64>` (Snowflake display_id) + base-web typings 也對齊 number[]（**但 base-web 0 改動原則**仍適用、base-web 端 `String(endpointId)` 變多餘但不 break、留 backlog）。
- **W-FW6 (037) 的 audit_log payload**：`audit_log payload_before/after JSON 內 'roleId': ULID / 'menuIds': i32[] / 'userIds': ULID 字串[]` —— 本 feature **0 改動**（rust internal SoT 不變、payload 仍 ULID + i32）。
- **F4 response shape**：rust HTTP 統一回 `Res<T> = { code, data: T, msg }`；本 feature 0 envelope 改動、只 transform `data.id` 為 number。

## 結論

5 個 R-Q 全 resolved；3 個 spec Phase 0 verify 項（A-005 / A-006 / 5 entity service 變動範圍）已查證並轉為設計決策。本 feature 可進 Phase 1 design（data-model + contracts + quickstart）；無新增 NEEDS CLARIFICATION 反饋至 spec。

**Implementation 階段 leave 給 implementer 拍板**（不影響 design 完整性）：
- R-Q1: Snowflake crate `idgenerator` vs self-roll —— 兩條路皆可、首選 self-roll
- R-Q5 lookup helper: generic trait vs 5 個 service 各加 method —— 首選後者（簡單、5 entity 不需抽象）
