# Research: 030 — systemManage status/gender alignment

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-21

Brainstorm 已 saturated;Phase 0 對 rust-api worktree 調查,解 spec 的 4 個 research 點 + 補齊實作定位。

---

## R-Q1: `Gender` domain 型別表示法（PG enum vs text）

**Question**: gender 欄位採 PostgreSQL enum type 抑或 text 欄位?

**Evidence**:
- `Status` / `MenuType` 皆為 **PG enum type** —— `migration/src/schemas/m20240815_082808_create_enum_status.rs` 用 `Type::create().as_enum(Alias::new("status")).values([...])` 建型別;`server/model/src/admin/entities/sea_orm_active_enums.rs` 對應 `#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "status")]` 的 `DeriveActiveEnum`。
- 該檔註解明示專案規範:PG 標識符一律小寫 snake_case。

**Decision**: `Gender` 採 **PG enum type**,完全比照 `Status` 建模。`sea_orm_active_enums.rs` 新增 `Gender` active enum(變體 `Male` / `Female`,`string_value = "male"/"female"`、`enum_name = "gender"`)。

**Rationale**: 與既有 `Status`/`MenuType` 一致、domain-typed、型別安全;base-web 的展示值 `'1'/'2'` 只活在序列化邊界的 `map_gender`,不入 DB。

**Alternatives considered**: text 欄位直存 `'1'/'2'` —— 破壞 enum 慣例、DB 存展示值無語意,否決。

---

## R-Q2: `sys_user.gender` 欄位 nullability 與 entity

**Evidence**: base-web `Api.SystemManage.UserGender = '1' | '2'`、row 型別 `userGender: UserGender | null`;create 表單性別非必填。`sys_user` entity（`server/model/src/admin/entities/sys_user.rs`)既有 nullable 欄位範例:`avatar: Option<String>` with `#[sea_orm(column_type = "Text", nullable)]`。

**Decision**: `gender` 欄位 **nullable**。`sys_user` entity 加 `pub gender: Option<Gender>`(`#[sea_orm(nullable)]`)。null = 無性別資料,為合法狀態。

---

## R-Q3: `map_status` / `map_gender` 放置與 status 欄位型別

**Evidence**: `server/model/src/admin/output/sys_system_manage.rs` 既有 `fn map_menu_type(MenuType) -> String`（line 132）、`fn map_icon_type(Option<i32>) -> Option<String>`（line 139,含 unexpected-arm `warn!`）。三個 Output DTO（`SystemManageRoleOutput` line 25 / `SystemManageUserOutput` line 78 / `SystemManageMenuOutput` line 119）皆 `pub status: Status`、From impl `status: m.status` passthrough。

**Decision**:
- `sys_system_manage.rs` 新增 `fn map_status(Status) -> String`:`Enabled → "1"` / `Disabled → "2"` / `Banned → "2"`（`Banned` arm 加 `warn!`,比照 `map_icon_type`）。
- 新增 `fn map_gender(Option<Gender>) -> Option<String>`:`Some(Male)→Some("1")` / `Some(Female)→Some("2")` / `None→None`(total、無 warn)。
- 三個 Output DTO 的 `pub status: Status` 改 `pub status: String`;三個 From impl 的 `status: m.status` 改 `status: map_status(m.status)`。
- import 改:`sea_orm_active_enums` 改引入 `Gender`(`MenuType` 保留);`Status` 仍需(map_status 參數型別)。

---

## R-Q4: `UserWithoutPassword` 中介模型 + getUserList 篩選

**Evidence**:
- `server/model/src/admin/output/sys_user.rs` 的 `UserWithoutPassword`(line 21)欄位:id/domain/username/nick_name/avatar/email/phone_number/status/created_at/created_by/updated_at/updated_by —— **無 gender**;`From<SysUserModel>` 逐欄映射。
- getUserList handler(`sys_system_manage_api.rs:42`):`Query(params): Query<UserPageRequest>` → `service.find_paginated_users(params)`。
- `UserPageRequest`(`input/sys_user.rs`):`{ page_details: PageRequest(flatten), keywords: Option<String> }` —— **目前僅 `keywords` + 分頁**。base-web 送的 `status=` / `userName=` / `userGender=` / `nickName=` / `userPhone=` / `userEmail=` 個別篩選參數 rust **目前全部忽略**。

**Decision**:
- `UserWithoutPassword` 加 `pub gender: Option<Gender>`;`From<SysUserModel>` 加 `gender: model.gender`。
- `SystemManageUserOutput` 的 From impl 既有 `user_gender: None`(硬寫)改 `user_gender: map_gender(m.gender)`。
- `UserPageRequest` 加 `pub user_gender: Option<String>`(camelCase → `userGender`);`find_paginated_users` 在 `user_gender` 有合法值(`"1"/"2"`)時加 `Condition` 篩選(`"1"→Gender::Male`、`"2"→Gender::Female`、空/非法 → 不加條件)。

> **範疇邊界**:base-web 的其他個別篩選參數(`status` / `userName` / `nickName` / `userPhone` / `userEmail`)rust 目前同樣忽略 —— 此為 pre-existing,**不在本 feature 範疇**(spec FR-010 僅要求 `userGender` 篩選)。

---

## R-Q5: create/update user 的 gender 寫入

**Evidence**: `server/service/src/admin/sys_user_service.rs` 的 `create_user`(line 116)組 `SysUserActiveModel { ..., status: Set(input.status), ... }`(line 127-137);`update_user`(line 176)同型。`UserInput`(`input/sys_user.rs:17`)欄位 domain/username/password/nick_name/avatar/email/phone_number/status —— 無 gender。

**Decision**:
- `UserInput` 加 `pub gender: Option<Gender>`(optional)。
- `create_user` / `update_user` 的 `SysUserActiveModel` 加 `gender: Set(input.gender)`。未提供 → `None`。

---

## R-Q6: migration 結構與 gender seed

**Evidence**: `Status` PG enum 由 `migration/src/schemas/m20240815_082808_create_enum_status.rs` 建;user seed 在 `migration/src/datas/m20241024_033005_insert_sys_user.rs`;新近 feature migration 範例 `datas/m20260522_a_f8_assign_users_seed.rs`(F8)。

**Decision**: 新增**單一 migration 檔**(命名比照既有日期前綴慣例,如 `m20260523_a_030_user_gender.rs`),內含三步:
1. `CREATE TYPE gender AS ENUM ('male','female')`(Postgres 分支;MySql/Sqlite 跳過,比照 `m20240815`)。
2. `ALTER TABLE sys_user ADD COLUMN gender gender NULL`。
3. `UPDATE` 3 個預設用戶 gender —— Soybean→`male`、Administrator→`male`、GeneralUser→`female`(cosmetic、取混合值使男/女皆可在 UI 觀察)。

`down()` 對應 drop column + drop type。註冊進 `migration/src/lib.rs` 的 `Migrator`(+ `datas/mod.rs` 或 `schemas/mod.rs` 視置放;此檔含 schema+data,比照 F8 seed 置 `datas/`)。**不編輯**歷史 migration `m20241024_033005`。

---

## R-Q7: `Banned` 收斂語意

**Evidence**: rust `Status` 3 值 `enabled`/`disabled`/`banned`;base-web `EnableStatus` 僅 `'1'|'2'`(enable/disable)。

**Decision**: `map_status` 的 `Banned → "2"`(非啟用態,與 disabled 同 base-web 展示),加 `warn!` log 紀錄此 lossy 收斂。base-web 不引入第 3 狀態(spec FR-015、Constitution IV)。`Banned` 在 rust 端語意不變(DB 值不動)。

---

## Phase 0 完成標誌

- ✅ R-Q1 `Gender` 採 PG enum、比照 `Status`
- ✅ R-Q2 `gender` 欄位 nullable、entity `Option<Gender>`
- ✅ R-Q3 `map_status`/`map_gender` 置 `sys_system_manage.rs`、status 欄位型別改 `String`
- ✅ R-Q4 `UserWithoutPassword` + `UserPageRequest` 加 gender、`find_paginated_users` 接 `userGender` 篩選
- ✅ R-Q5 `UserInput` + create/update service 寫 gender
- ✅ R-Q6 單一 migration:建 enum + 加欄 + seed 3 用戶
- ✅ R-Q7 `Banned → "2"` + warn

**無 spec correction** —— brainstorm 已 saturated;Phase 0 為實作點精確定位。關鍵 gotcha:`UserPageRequest` 目前僅 `keywords`、base-web 個別篩選參數全被忽略(本 feature 僅補 `userGender`、其餘 pre-existing 不碰);三個 Output DTO 的 `status` 欄位型別需從 `Status` 改 `String`(序列化值改變,但 base-web 期望如此)。
