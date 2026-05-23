# rust-entity-id-numeric-migration — brainstorm spec-design

**Feature 編號**：039（spec-kit 階段 A 起手取得 `specs/039-rust-entity-id-numeric-migration/`）
**短名**：`rust-entity-id-numeric-migration`
**軌道**：獨立 P5 backlog feature（rust-only、base-web 0 改動）—— **不**屬 W-WEBUI 軌道、**不**屬 Phase W deploy；性質為「rust 端適應 base-web typings 的設計反思 cleanup」、回歸 Constitution Principle IV 原意（「後端適應 base、base 不改」嚴格化到型別形狀層）。
**Brainstorm 日期**：2026-05-23
**Source 反思**：在 038 W-FW8 收尾後、user 提出根本性反思——「應該以 base-web TS 為基礎（除非新功能/新頁面、不然盡可能不要動它）；應該在 rust-api 那層、就以 base-web 為主要依據、返回適合的 type」。原本 backlog 規劃的「base-web TS `id` 型別債 cleanup」（rev INTEGRATION-CHECKLIST：CommonRecord.id `number` ↔ rust ULID string mismatch）被此反思取代——改為 rust 端適應 base-web typings，不動 base-web。

**Authoritative parents**：
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) Principle IV「base 不改動邊界」**v1.4.0**（受管例外授權模型已改為 DESIGN-W-WEBUI 文件權威；本 feature 屬軌道**外**、base-web 0 diff、完全符合預設原則、**不**動用受管例外、**不**觸發 constitution 變更）。
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md) DESIGN-B 拍板 §1.3「base 不改動邊界」——本 feature 是這條原則在「型別形狀」這層的嚴格化實踐。
- 既有 W-FW1~W-FW8 落地的 base-web 端 `String(roleId)` / `String(props.roleId)` 等字串轉換——本 feature 之後變多餘但**仍 work**（`String(number)` → `"number"` 仍 truthy 對齊 backend 期望邏輯），故不順手清；留 backlog 由將來 base-web cleanup sprint 處理。
- W-F11 `rust-horizontal-scaling`（merge `d2d4c4c`）：W-F11 已落地多 replica 預備、Snowflake i64 distributed id 對齊此擴展。

**範疇外（沿用既有設計、不重新規劃）**：
- **base-web 改動**：0 diff、完全保留 starter typings 樣貌、未來 upstream rebase 摩擦最小化。
- **JWT sub claim / Casbin g rule / audit_log payload / FK schema**：**全不動**——rust 內部 SoT 仍 ULID。
- **log/token 類 entity**（`sys_login_log` / `sys_operation_log` / `sys_tokens`）：自身 PK 仍 ULID、不暴露給 base-web、不需 display_id。
- **`sys_menu`**：本就 i32 PK + base-web typings number、已對齊、不動。
- **`sys_domain`**：後端 internal、base-web 不直接看、不加 display_id。
- **nestjs**：DESIGN-B、nestjs 已退場、0 改動。

---

## 1. 範疇

把 rust-api 5 個業務 entity（`sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key`）加一個 `display_id` BIGINT UNIQUE 欄（Snowflake i64）；API 邊界 output 把 `id` 序列化為 display_id 數值（base-web typings 對齊）、input 收 number 反查 display_id 拿 ULID PK；rust 內部業務邏輯（service、audit、JWT、Casbin、FK cascade）全部繼續用 ULID。

| 子項 | deliverable |
|---|---|
| **A 雙欄 schema 擴充**（主） | 5 entity 各加 `display_id BIGINT UNIQUE NOT NULL` + INDEX；既有 row 透過 backfill migration 一次填充 Snowflake i64；ULID PK 完全保留。 |
| **B Snowflake i64 generator helper** | 新檔 `server/global/src/snowflake.rs`（用 `idgenerator` crate 或自寫 lightweight ~50 行）+ machine_id 從 container hostname hash mod 1024（多 replica 衝突低機率 + 0 manual config）。 |
| **C API 邊界 transform** | 5 entity 的 output struct `From<Model>` impl 內 `id = model.display_id`；input handler 開頭加 `lookup_ulid_by_display_id(i64) -> String` 反查；既有 `i_d: String` 型 input DTO 改 `i64`（~10 處 cascade）。 |

---

## 2. 動機與設計反思

### 2.1 過去設計的型別債

`sys_user` / `sys_role` / `sys_endpoint` 等業務 entity PK 是 VARCHAR ULID，base-web typings 卻宣告 `id: number`（`Api.Common.CommonRecord.id`）。runtime 透過 JS 動態型別 + 局部 deserializer workaround（032 commit `149dc52`）勉強跑通，但 TS 編譯器無法捕捉未來 regression、且每次新接通 base-web 頁面都要再寫一次 workaround。

W-WEBUI 軌道（W-FW1~W-FW8）為了「不動 base-web typings」開了一條「base-web 改 .vue / .ts 接線但不動 typings」的受管例外路、累積了 W-FW8 後**正反兩個方向**的選項：

- **layer 2「base-web 改 typings 對齊 rust」**：違反 Principle IV「base 不改動」、需要新例外條款、且未來 upstream rebase 衝突。
- **layer 3「rust 改 entity ID 對齊 typings」（本 feature）**：完全符合 Principle IV 原意、base-web 0 diff、保留 upstream 升級能力。

### 2.2 為什麼保留 ULID PK（X1 雙欄而非全改 BIGINT）

直接「drop ULID PK、改 BIGINT PK」也能對齊 base-web typings，但會丟失 ULID 的真實 value：

- **JWT sub claim 從 ULID 改 BIGINT**：token 簽發/驗證/refresh 流程 cascade、既有 token volume 失效。
- **audit_log.entity_id 從 ULID 改 BIGINT**：歷史 audit row 不兼容、查歷史紀錄 entity 失效。
- **Casbin g rule (user_id, role_code, domain)**：user_id ULID 改 BIGINT、Casbin policy 全部重寫。
- **FK cascade**（sys_user_role / sys_role_menu / sys_tokens / etc.）：5+ FK 表 schema 改、cascade rebuild。

X1 雙欄設計把這些**全保留** ULID 不動，只在 API 邊界加一層 transform——成本是「每 entity 多一欄 + API 邊界一層 lookup」、收益是「rust 內部 0 業務邏輯改動 + 保留 ULID 特性（distributed、time-ordered）+ 保留歷史 audit/token/Casbin policy」。

### 2.3 為什麼 Snowflake 而非 i32 sequence

Snowflake i64 = ULID 的 numeric 親戚（time-ordered + distributed + 64-bit unique），保留 ULID 的核心特性。i32 sequence 需要單一 DB lock、不適合 W-F11 多 replica 已落地的架構；Snowflake 跨 replica 安全（每 replica 取不同 machine_id）。

---

## 3. 設計拍板

| Q | 拍板 | 替代方案（已否決） |
|---|---|---|
| **Q1** ULID 替代型 | **Snowflake i64**（保留 distributed + time-ordered 特性、跟 W-F11 多 replica 對齊） | i32/i64 sequence（單一 DB lock、不適多 replica）/ UUID string（仍是 string、不解決問題） |
| **Q2/X1** ULID 是否保留 | **保留 ULID PK + 新增 `display_id` BIGINT UNIQUE 欄、API 邊界 transform**（雙欄設計、rust 內部 0 業務邏輯改動） | drop ULID 改 BIGINT PK（FK/JWT/Casbin/audit 全 cascade、規模大、丟失歷史相容）/ API hash transform（collision 風險 + lookup cache 複雜） |
| **Q3** entity 範圍 | **5 entity**：user / role / endpoint / organization / access_key（現班 + 快將接通的） | 最小 3（user/role/endpoint、未來再補 organization/access_key、多次 feature 拆分浪費）/ 全業務 entity（log/token 暴露給 base-web 機率低、加欄 bloat） |
| **Q4** Snowflake machine_id | **container hostname hash mod 1024**（自動、無 config、container 重啟 hostname 通常一致；衝突需「同 ms + 同 machine_id + 同 seq」三撞、低機率） | env var SNOWFLAKE_MACHINE_ID（手動 config 負擔、scale 加 replica 麻煩）/ redis-based 動態分配（lock + heartbeat、最穩但設計成本高、為 1 feature 過度） |
| **Q5** API 邊界 transform 機制 | **output struct From impl 改 `id: model.display_id`**（直接、可讀、5 entity 不需抽象） | serde custom serializer hook（避免改 struct field 但仍需 attr）/ trait + macro 自動化（過度抽象、5 entity 不值） |
| **Q6** base-web `String(...)` 餘料清理 | **不清留 backlog**（W-FW1~W-FW8 既有 `String(roleId)` 等仍 work、不會 break；屬另一個 base-web cleanup sprint 範圍、不該包進 rust feature） | 順手清（base-web 第三段 commit、~10 處改 number assertion） |

---

## 4. Architecture

```text
                                       ┌─────────────────────┐
                                       │ base-web (typings   │
                                       │  number、wire number)│
                                       └─────────┬───────────┘
                                                 │
                                                 ▼  JSON 邊界
┌──────────────────────────────────────────────────────────────┐
│ API Layer (api/admin/*_api.rs + transform handlers)           │
│   - output:  struct field id = entity.display_id (i64)        │
│   - input:   收 number → lookup display_id → 取 entity.id(ULID)│
└──────────────────────────────────┬───────────────────────────┘
                                   │ ULID (內部 SoT)
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│ Service Layer (service/admin/*_service.rs)                    │
│   - 業務邏輯全用 ULID（不變）                                 │
│   - audit_log payload 內 roleId/userId = ULID（不變）         │
│   - JWT sub = user.id ULID（不變）                            │
│   - Casbin g rule = (ULID user_id, role_code, domain)（不變）  │
└──────────────────────────────────┬───────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│ DB Schema                                                     │
│   sys_user / sys_role / sys_endpoint / sys_organization /     │
│   sys_access_key: id (VARCHAR ULID PK) +                      │
│                   display_id (BIGINT UNIQUE NOT NULL) ← 新     │
│   FK cascade: 全用 ULID（不動）                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. 改動分項

### A · Snowflake i64 generator helper（新）

新檔 `rust-api/server/global/src/snowflake.rs`：

```rust
// 採 idgenerator crate 或自寫 lightweight ~50 行
// machine_id = std::env::var("HOSTNAME").unwrap_or("rev1-admin-rust-api-1")
//                  .hash() mod 1024
pub fn next_display_id() -> i64 { /* Snowflake (timestamp 41b + machine_id 10b + seq 12b) */ }
```

新 dep 加 `server/global/Cargo.toml`：`idgenerator = "<latest stable，plan Phase 0 R-Q1 拍板>"` (或自寫無 dep — R-Q1 同步評估「外部 crate vs ~50 行 self-roll」)。

### B · 5 entity schema migration（新 schema migration）

新檔 `rust-api/migration/src/schemas/m20260524_d_add_display_id_to_business_entities.rs`：
- 對 5 entity (`sys_user` / `sys_role` / `sys_endpoint` / `sys_organization` / `sys_access_key`) 各加 `display_id BIGINT NOT NULL DEFAULT 0`（先 default 0 才能 NOT NULL backfill）
- 對既有 row backfill：UPDATE 一次跑、每 row call Snowflake 生成（或在第二個 data migration 內處理）
- 加 INDEX(`display_id`) for input lookup（UNIQUE constraint 在 backfill 後 ALTER 加）
- Down 對稱：DROP INDEX + DROP COLUMN

實作上可拆兩個 migration：
1. `m20260524_d_schema`：ADD COLUMN display_id BIGINT NOT NULL DEFAULT 0 + INDEX（非 UNIQUE）
2. `m20260524_e_backfill`：UPDATE 既有 row 填 Snowflake i64 + ALTER ADD UNIQUE

### C · 5 entity sea-orm model 同步

`server/model/src/admin/entities/sys_{user,role,endpoint,organization,access_key}.rs`：每個加 `pub display_id: i64` 欄。

### D · Service create_x 改寫 — 加 display_id 生成

5 個 service 的 create/insert path（檔行號）：
- `sys_user_service.rs:165` create_user
- `sys_role_service.rs:136` create_role
- `sys_access_key_service.rs:138` create_access_key
- `sys_domain_service.rs:134` ← 不在 5-entity 範圍、不動
- `sys_endpoint` 的 sync_endpoints 路徑（自動同步、非 service create）— 需要在 `sync_endpoints` 時也填 display_id
- `sys_organization_service.rs` 的 create path（待 grep 確認）

每個 create insert ActiveModel 加 `display_id: Set(snowflake::next_display_id())`。

### E · 5 entity output struct transform

`server/model/src/admin/output/sys_system_manage.rs`：
- `SystemManageUserOutput`：`id: model.display_id`（從 `model.id` 改）
- `SystemManageRoleOutput`：同上
- 其他 5 entity output 同理

具體 5 處 From impl 改 `id` 字段來源從 `model.id` (ULID) 改 `model.display_id` (i64)。

### F · API input 反查 layer

base-web 送 `roleId: 1234567890` (number) → input DTO 收 `i64` → handler 內：

```rust
let role = sys_role::find_active()
    .filter(Column::DisplayId.eq(input.role_id))
    .one(db).await?
    .ok_or(AuthorizationError::RoleNotFound)?;
let role_ulid = role.id;  // ULID string
// 業務 service call 用 role_ulid
```

每個 5-entity 相關 handler 開頭加這個 lookup（或抽 helper `lookup_role_ulid_by_display_id(i64) -> String`）。

### G · 改 5 entity 既有 `id: String` input DTO

- `AssignPermissionDto.role_id: String` → `i64`
- `SystemManageAssignRoleEndpointsInput.role_id: String` + `endpoint_ids: Vec<String>` → `i64` + `Vec<i64>`
- `AssignRouteDto.role_id: String` → `i64`
- `AssignUserDto.role_id: String` + `user_ids: Vec<String>` → `i64` + `Vec<i64>`
- 其他 `deleteUser` / `deleteRole` / `updateUser` / `updateRole` / `getUserById` 等 path 與 body 內帶 id 的 ~10 處

### H · base-web 端 `String(...)` 餘料清理（**不做、留 backlog**）

W-FW1~W-FW8 落地的 `String(roleId)` / `String(props.roleId)` 等仍 work，不 break。屬下一個 base-web cleanup sprint 範圍。

### I · Audit / JWT / Casbin / FK — **全不動**

- audit_log.entity_id 仍 ULID（歷史 + 新紀錄一致、跨期可查）
- audit payload_before/after 內 `roleId/userId` 仍 ULID
- JWT sub claim 仍 ULID
- Casbin g rule 仍 ULID user_id
- sys_user_role / sys_role_menu / sys_tokens FK 仍 ULID

---

## 6. Data flow（典型 endpoint：assignRoleEndpoints）

```text
[base-web]  POST /systemManage/assignRoleEndpoints
           body: { roleId: 1234567890, endpointIds: [9876543210] }
              │
              ▼
[API handler]  收 i64 → lookup
   let role = sys_role::find_active().filter(DisplayId.eq(1234567890)).one(db);
   let endpoints = sys_endpoint::find_active().filter(DisplayId.is_in([9876543210])).all(db);
   let role_id_ulid = role.id;          // ULID string
   let endpoint_ids_ulid = endpoints.iter().map(|e| e.id).collect();  // ULID strings
              │
              ▼
[Service]  assign_permission(domain, role_id_ulid, endpoint_ids_ulid, enforcer, &actor)
   audit_log payload: { "roleId": ULID, "endpointIds": [ULID, ULID] }  ← ULID 不動
              │
              ▼
[Casbin]  enforcer.add_policies([[role_code, domain, path, method]])
[DB]       commit
              │
              ▼
[API output]  ← service Ok(()) → handler return Res::new_data(true)
```

---

## 7. Constitution Check 預判

對齊 `.specify/memory/constitution.md` v1.4.0：

| Principle | 評估 | 結論 |
|---|---|---|
| **I RBAC Fail-safe** | Casbin policy 邏輯不動、enforce path 不動、Casbin policy 主寫權威仍 rust | ✅ PASS |
| **II Soft Delete + Audit** | audit payload + write_in_txn 不動、entity_id ULID 保留歷史一致性、soft_delete 不變 | ✅ PASS |
| **III 嚴禁 Forward + 單一職責** | rust 內部 service 呼叫、無後端間 HTTP/RPC、無 nginx config 改動 | ✅ PASS |
| **IV base 不改動邊界** | **base-web 0 diff、完全符合預設原則、不動用受管例外、不觸發 constitution 變更** | ✅ PASS |
| **V 漸進收縮** | rust-only、0 nestjs、無新表類型、漸進加欄、可對稱回退 | ✅ PASS |

**5/5 PASS、Complexity Tracking 留空**。

---

## 8. 範疇紀律

- base-web 改動：**0 diff**（最重要的 SC）
- nestjs：0
- schema migration：1 schema + 1 backfill（5 entity 全在這 2 migration 內）
- 新 table：0（純加欄）
- rust-api：~5 entity model + ~5 service create + ~5 output From impl + ~10 input DTO + ~10 handler lookup + 1 snowflake helper + 2 migration
- 估 commits：rust-api 2-3 commit（schema migration / service+model / API 邊界）、outer 2 commit（SHA pin + checklist marker 更新）、acceptance 跑一輪
- 比照 W-FW6/W-FW7 規模（中等 rust-only feature）

---

## 9. Acceptance（C-V matrix scope）

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | A schema migration | rust-api image build clean；migration up 套用乾淨；5 entity 各加 display_id 欄+ UNIQUE + INDEX |
| C-V2 | A backfill | psql 查 5 entity 既有 row、display_id 全填 + 唯一 + range 合理（高 41 bits = current timestamp） |
| C-V3 | A migration down 對稱 | 臨時 DB 對稱 down 乾淨 |
| C-V4 | B snowflake | rust unit test 1000 個 next_display_id() 全唯一、time-ordered |
| C-V5 | C output transform | curl `getUserList` / `getRoleList` / `getAllEndpoints` 收 envelope 0、`id` 為 number（非 ULID string）、value 對得上 backend display_id |
| C-V6 | F input lookup | curl `assignRoleEndpoints` body `{roleId: 1234567890, endpointIds: [9876543210]}`（用 C-V5 取回的具體 display_id i64 值）envelope 0；既有 W-FW8 assign / Casbin 邏輯不退化 |
| C-V7 | G input DTO 變更 | curl 5 entity 全 CRUD（add/update/delete/get）用 number id 一輪、不退化 |
| C-V8 | I audit 不動 | 跑 C-V6 後 psql sys_operation_log 確認 payload_before/after 內 `roleId/endpointIds` 仍 ULID（rust internal SoT 不變） |
| C-V9 | I JWT 不動 | 跑 login + 既有受保護 endpoint 認證流程 OK、JWT sub claim 仍 ULID |
| C-V10 | I Casbin 不動 | 跑 RBAC deny（GeneralUser 對 admin endpoint 5001）+ ROLE_SUPER 對全 endpoint 通過 |
| C-V11 | base-web 不退化 | CDP browser smoke via Edge :9229 — login、user 列表、role 列表、menu 列表、role edit drawer、button-auth modal 全 work；C-V21 既有 W-FW8 modal 不退化 |
| C-V12 | scope SC | git diff：base-web 0 改動、rust-api 改動範圍對齊 §8 |
| C-V13 | scope SC | psql `\d sys_user` / `\d sys_role` / `\d sys_endpoint` / `\d sys_organization` / `\d sys_access_key` 各多 display_id BIGINT UNIQUE 一欄；其他 schema 0 變更 |
| C-V14 | scope SC | grep `Ulid::new()` in `rust-api/server/` 命中數量 = brainstorm 前+5（5 entity create path 新增）；ULID 別處（jwt/audit/log）保留 |
| C-V15 | regression | W-FW6 N3 audit / W-FW6 N4 role rename / W-FW8 button-auth / W-FW7 menu field 全 endpoint 不退化（重跑既有 C-V 矩陣 subset） |

---

## 10. 風險與 mitigation

| 風險 | 程度 | mitigation |
|---|---|---|
| **Snowflake clock 漂移**（timestamp 倒退 → id collision） | 中 | container 用 NTP 同步；極端 case 可加 sequence wait-for-next-ms 邏輯 |
| **machine_id hash 衝突**（兩 container 撞同 hash） | 低（1024 個 slot、實務幾十個 container 衝突機率 < 5%） | dev/staging accept；prod 若 scale 上百 replica 改 redis-based 分配 |
| **既有 ULID base-web 端 cache（無）** | 0 | base-web 端目前 0 改動、無 client-side ULID cache 需處理 |
| **歷史 audit payload 內 roleId（ULID）跟新 wire 看到 roleId（number）不對應** | 中 | 設計拍板「rust internal SoT 不變」決定 audit 保 ULID；base-web 若未來要顯示 audit 查得回對應 entity，可透過 ULID lookup（或 audit 顯示 page 加一層 ULID→display_id transform） |
| **migration backfill 對大型 prod DB 慢** | 低（rev1 未上 prod、5 entity row 量小、UPDATE 全表幾秒完） | dev/staging OK；prod 上線時若必要可拆 batch UPDATE |
| **input lookup query 性能**（每次 input 加一次 DB read） | 低（INDEX(display_id)、O(1) lookup） | INDEX 確保；高頻 endpoint 可加 redis cache（未來優化） |

---

## 11. Spec-kit 階段 A 起手準備

`/speckit-specify` 起手時：
- 取 NNN = 039（038 W-FW8 已 merge）
- feature short name = `rust-entity-id-numeric-migration`
- `before_specify` pre-hook 自動建 `039-rust-entity-id-numeric-migration` feature branch（從 `rev1-admin-root` 衍生）
- input = 本 brainstorm doc 全文（不需 v1.X.X Constitution amendment 前置；本 feature 5/5 PASS）

階段 A 後續：
- `/speckit-clarify`：掃 spec 內 NEEDS CLARIFICATION（預期 0、本 brainstorm 已涵蓋設計拍板）
- `/speckit-plan`：產 plan.md + research.md（R-Q1 idgenerator crate 選擇 / R-Q2 既有 input DTO 改動清單盤點 / R-Q3 既有 output struct 改動清單盤點） + data-model.md + contracts/verification-commands.md + quickstart.md
- `/speckit-tasks`：tasks.md（依 user story 分相、A schema → B helper → C-F API 邊界 cascade → D service 寫入路徑、acceptance C-V1~C-V15）
- `/speckit-analyze`：跨檔 consistency 報告

階段 B（superpowers:executing-plans）：subagent-driven implementer + spec/code review、CDP browser smoke acceptance、多段式 commit。

---

## 12. 結論

W-WEBUI 軌道（W-FW1~W-FW8）落地後 user 的設計反思——「應該以 base-web TS 為基礎、rust 端適應 base-web typings」——是 Constitution Principle IV 原意在「型別形狀」層的嚴格化。本 feature 透過 X1 雙欄設計（ULID PK 保留 + display_id Snowflake i64 給 base-web）做最 conservative 的實踐：rust 內部業務邏輯（service / audit / JWT / Casbin / FK）0 改動、ULID 特性完整保留、base-web 0 diff、typings 對齊。

完成後 rev1 進入「rust 端真正適應 base-web」的穩態：未來 base-web upstream rebase 摩擦最小、後續 cleanup feature（base-web 端 `String(...)` 餘料 + typings deserializer workaround 移除）可獨立啟動而不阻塞 rust。下一步推薦：observability（W-F12/13/14、Phase W deploy 最後 phase）。
