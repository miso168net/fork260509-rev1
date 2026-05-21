# Data Model: 030 — systemManage status/gender alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

本 feature 動 DB schema(`sys_user` 加一欄 + 新 PG enum type)。「data model」此處為**變更模型** —— 6 組元件、每組精確改動。全部 rust-api worktree、base-web 0 diff。

元件總覽:

| # | 元件 | 位置 | 性質 |
|---|---|---|---|
| E1 | `Gender` domain enum 新增 | `server/model/src/admin/entities/sea_orm_active_enums.rs` | 改 |
| E2 | `sys_user.gender` 欄位 + migration | `entities/sys_user.rs` + 新 migration 檔 | 改 + 新增 |
| E3 | `map_status` + status 欄位型別對齊 | `output/sys_system_manage.rs` | 改 |
| E4 | `map_gender` + `SystemManageUserOutput.user_gender` | `output/sys_system_manage.rs` | 改 |
| E5 | `UserWithoutPassword.gender` + getUserList `userGender` 篩選 | `output/sys_user.rs` + `input/sys_user.rs` + `service/sys_user_service.rs` | 改 |
| E6 | `UserInput.gender` + create/update 寫入 | `input/sys_user.rs` + `service/sys_user_service.rs` | 改 |

---

## E1: `Gender` domain enum（改、`sea_orm_active_enums.rs`）

新增 `Gender` active enum,比照同檔 `Status` / `MenuType`:

```rust
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Deserialize, Serialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "gender")]
pub enum Gender {
    #[sea_orm(string_value = "male")]
    #[serde(rename = "male")]
    Male,
    #[sea_orm(string_value = "female")]
    #[serde(rename = "female")]
    Female,
}
```

**設計要點**:小寫 snake_case(per 同檔 PG 命名規範註解);2 變體對應 base-web `UserGender = '1'|'2'`。

---

## E2: `sys_user.gender` 欄位 + migration（改 entity + 新增 migration）

**E2-a `sys_user` entity**(`entities/sys_user.rs`):於 `status: Status` 後加:

```rust
#[sea_orm(nullable)]
pub gender: Option<Gender>,
```

import 加 `Gender`(同 `use super::sea_orm_active_enums::Status;` 一行)。

**E2-b 新 migration 檔**(`migration/src/datas/m20260523_a_030_user_gender.rs`,命名比照既有日期前綴):

| up() 步驟 | 內容 |
|---|---|
| 1 | Postgres 分支:`CREATE TYPE gender AS ENUM ('male','female')`(`Type::create().as_enum(...)`);MySql/Sqlite 跳過,比照 `m20240815` |
| 2 | `ALTER TABLE sys_user ADD COLUMN gender gender NULL` |
| 3 | `UPDATE sys_user`:Soybean→`male`、Administrator→`male`、GeneralUser→`female`(per research R-Q6) |

`down()`:drop column + drop type。註冊進 `migration/src/lib.rs` 的 `Migrator` vec(+ `datas/mod.rs`)。**不編輯**歷史 migration。

**設計要點**:nullable —— 既有 user(本 feature 前建立)gender 為 `null`、相容、不需 backfill(spec E-6 / SC-008)。

---

## E3: `map_status` + status 欄位型別對齊（改、`sys_system_manage.rs`）

新增轉換函式(置於既有 `map_menu_type` / `map_icon_type` 旁):

```rust
fn map_status(rust_status: Status) -> String {
    match rust_status {
        Status::Enabled => "1".to_string(),
        Status::Disabled => "2".to_string(),
        Status::Banned => {
            warn!("systemManage Output: status `Banned` 收斂為 base-web \"2\"(非啟用態)");
            "2".to_string()
        }
    }
}
```

三個 Output DTO 欄位型別改 + From impl 套用:

| DTO | 欄位改動 | From impl 改動 |
|---|---|---|
| `SystemManageRoleOutput` | `pub status: Status` → `pub status: String` | `status: m.status` → `status: map_status(m.status)` |
| `SystemManageUserOutput` | 同上 | 同上 |
| `SystemManageMenuOutput` | 同上 | 同上 |

**設計要點**:序列化值改變(`"enabled"`→`"1"`)—— 此即 base-web 期望(`EnableStatus = '1'|'2'`),消除 vue-i18n `INVALID_ARGUMENT`。DB `Status` 值不變(FR-005)。

---

## E4: `map_gender` + `SystemManageUserOutput.user_gender`（改、`sys_system_manage.rs`）

新增:

```rust
fn map_gender(rust_gender: Option<Gender>) -> Option<String> {
    match rust_gender {
        Some(Gender::Male) => Some("1".to_string()),
        Some(Gender::Female) => Some("2".to_string()),
        None => None,
    }
}
```

`SystemManageUserOutput` 既有欄位 `pub user_gender: Option<String>`(型別已正確、不改);`From<UserWithoutPassword>` 的 `user_gender: None`(硬寫)改 `user_gender: map_gender(m.gender)`。

---

## E5: `UserWithoutPassword.gender` + getUserList `userGender` 篩選（改）

**E5-a `UserWithoutPassword`**(`output/sys_user.rs`):加 `pub gender: Option<Gender>`;`From<SysUserModel>` 加 `gender: model.gender`。

**E5-b `UserPageRequest`**(`input/sys_user.rs`):加 `pub user_gender: Option<String>`(`#[serde(rename_all = "camelCase")]` → `userGender`,接 base-web 既送的 query param)。

**E5-c `find_paginated_users`**(`service/sys_user_service.rs`):查詢組 `Condition` 時,若 `params.user_gender` 為 `Some("1")` → 加 `gender = Male` 條件、`Some("2")` → `gender = Female`、其餘(空 / 非法)→ 不加條件(per spec E-3)。

---

## E6: `UserInput.gender` + create/update 寫入（改）

**E6-a `UserInput`**(`input/sys_user.rs`):加 `pub gender: Option<Gender>`(optional;`CreateUserInput = UserInput`、`UpdateUserInput` 內含 `UserInput`、自動涵蓋)。

**E6-b `create_user` / `update_user`**(`service/sys_user_service.rs`):`SysUserActiveModel` 加 `gender: Set(input.gender)`。未提供 → `Set(None)`。

**設計要點**:create/update gender 寫路徑在 base-web example 分支無 UI consumer(create 抽屜為 stub),納入為 rust API 完整(curl 可驅動)。

---

## 變更後 data flow

```
base-web /manage/user, /role, /menu
   │  GET /api/systemManage/getRoleList | getUserList | getMenuList
   ▼
rust systemManage handler → service → Output DTO From impl
   │  map_status(Status) → "1"/"2"          ← E3(三 DTO)
   │  map_gender(Option<Gender>) → Option<"1"/"2">  ← E4(user DTO)
   ▼
JSON response { status: "1"/"2", userGender: "1"/"2"/null, ... }
   │
base-web render:enableStatusRecord["1"] = i18n key → $t(key) ✓(不再 INVALID_ARGUMENT)
                userGenderRecord["1"] = i18n key → $t(key) ✓

getUserList?userGender=1 → UserPageRequest.user_gender → find_paginated_users 加 Gender::Male 篩選  ← E5
create/update user { gender } → UserInput.gender → SysUserActiveModel.gender = Set(...)  ← E6
```

---

## Data Model 完成標誌

- ✅ E1 `Gender` domain enum(比照 `Status`)
- ✅ E2 `sys_user.gender` nullable 欄位 + 單一 migration(建 enum + 加欄 + seed 3 用戶)
- ✅ E3 `map_status` + 三 Output DTO `status` 型別 `Status`→`String`
- ✅ E4 `map_gender` + `SystemManageUserOutput.user_gender` From impl
- ✅ E5 `UserWithoutPassword.gender` + `UserPageRequest.user_gender` + `find_paginated_users` 篩選
- ✅ E6 `UserInput.gender` + create/update service 寫入
- ✅ base-web 0 diff、無 nestjs、Casbin/audit/soft-delete 路徑不碰

**Constitution Re-check(post data-model)**:E1-E6 確認 —— 純 rust-side、base-web 0 diff(IV);DB migration 由 rust 主導(架構約束);無服務間 forward(III);不碰 Casbin enforce(I);migration seed 比照既有 seed migration、create/update 既有 audit hook 不受 gender 欄影響(II)。**5 PASS / 0 violation 維持**。
