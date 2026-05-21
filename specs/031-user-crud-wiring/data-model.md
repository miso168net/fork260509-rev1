# Data Model: W-FW1 — user-crud-wiring

**Phase**: 1（Design & Contracts）
**Date**: 2026-05-22

本 feature **不動 DB schema**（無 migration）。「data model」此處為**變更模型** —— 6 組元件、每組精確改動。後端 rust-api worktree（E1-E4）+ 前端 base-web worktree（E5-E6）。

| # | 元件 | 位置 | worktree | 性質 |
|---|---|---|---|---|
| E1 | alias input DTO + `UpdateUserInput` un-flatten | `model/src/admin/input/sys_user.rs` | rust-api | 改 |
| E2 | `update_user` password 條件式 Set | `service/src/admin/sys_user_service.rs` | rust-api | 改 |
| E3 | addUser / updateUser transform handler | `api/src/admin/sys_system_manage_api.rs` | rust-api | 改 |
| E4 | addUser / updateUser route 重指 | `router/src/admin/sys_system_manage_route.rs` | rust-api | 改 |
| E5 | 4 個寫入 service function | `base-web/src/service/api/system-manage.ts` | base-web | 改 |
| E6 | handleSubmit + delete handler 接線 | `user-operate-drawer.vue` + `user/index.vue` | base-web | 改 |

---

## E1: alias input DTO + `UpdateUserInput`（改、`input/sys_user.rs`）

**E1-a 新增 base-web-shaped DTO**（比照 F9 `DeleteUserByBodyInput` 同檔體例,`#[serde(rename_all = "camelCase")]`):

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageAddUserInput {
    pub user_name: String,             // → username
    pub user_gender: Option<String>,   // "1"/"2"/None
    pub nick_name: String,
    pub user_phone: Option<String>,    // → phone_number
    pub user_email: Option<String>,    // → email
    pub status: String,                // "1"/"2"
    // userRoles 等其他欄:serde 預設忽略未知欄、不需宣告
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemManageUpdateUserInput {
    pub id: String,
    pub user_name: String,
    pub user_gender: Option<String>,
    pub nick_name: String,
    pub user_phone: Option<String>,
    pub user_email: Option<String>,
    pub status: String,
}
```

**E1-b `UpdateUserInput` un-flatten + password optional**（per research R-Q2):

現況 `UpdateUserInput { id, #[serde(flatten)] user: UserInput }` 改為獨立欄位集,`password` 為 `Option<String>`:

```rust
#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserInput {
    pub id: String,
    pub domain: String,
    #[validate(length(min = 1, max = 50))]
    pub username: String,
    #[validate(length(min = 6, max = 100))]
    pub password: Option<String>,      // ← 由 flatten 的必填 String 改 Option;None = 不改密碼
    #[validate(length(min = 1, max = 50))]
    pub nick_name: String,
    pub avatar: Option<String>,
    #[validate(email)]
    pub email: Option<String>,
    #[validate(length(max = 20))]
    pub phone_number: Option<String>,
    pub status: Status,
    pub gender: Option<Gender>,
}
```

`CreateUserInput`（= `UserInput`,`password: String` 必填)**不變**。原生 `/user` PUT handler 取 `input.user.X` 改 `input.X`（un-flatten 後欄位直接在 `UpdateUserInput` 上）。

**設計要點**:`UpdateUserInput` 原本 flatten `UserInput` 是為了 DRY,但這使 update 的 password 無法獨立 optional。un-flatten 後兩者解耦 —— create 必填、update optional。

---

## E2: `update_user` password 條件式（改、`sys_user_service.rs`）

`update_user` 內 `user.password = Set(input.user.password)` 改為:

```rust
// 其餘欄位 input.user.X → input.X（un-flatten）
user.domain = Set(input.domain);
user.username = Set(input.username);
if let Some(pw) = input.password {
    user.password = Set(pw);           // 有送才改;維持既有未 hash 行為（hash 修正屬 W-FW1-N2）
}
user.nick_name = Set(input.nick_name);
// ... avatar / email / phone_number / status / gender 同 un-flatten 取值
```

`None` → 完全不 touch `password` 欄,`user.update()` 不含該欄。audit `payload_before` / `payload_after`、txn 邊界不變。

---

## E3: addUser / updateUser transform handler（改、`sys_system_manage_api.rs`）

新增 2 個 transform handler,比照 F9 alias handler 體例（同 extractor 集):

```rust
// add_user_for_systemmanage:
//   1. 收 SystemManageAddUserInput
//   2. 轉 CreateUserInput:
//      domain    = "built-in"
//      username  = input.user_name
//      password  = "123456"                       ← per research R-Q5 預設密碼
//      nick_name = input.nick_name
//      email     = input.user_email
//      phone_number = input.user_phone
//      status    = map: "1"→Enabled / "2"→Disabled / 其他→驗證錯誤 envelope
//      gender    = map: Some("1")→Some(Male) / Some("2")→Some(Female) / None→None / 其他→驗證錯誤
//      avatar    = None
//   3. 呼既有 SysUserService::create_user
//
// update_user_for_systemmanage:
//   1. 收 SystemManageUpdateUserInput
//   2. 轉 UpdateUserInput:同上對映 + id = input.id + password = None（不改密碼)
//   3. 呼既有 SysUserService::update_user
```

回應 envelope 沿用既有 `create_user` / `update_user` 回的 `UserWithoutPassword`（F4 路線 II `Res`)。形狀對映失敗（`status` / `gender` 非法值)回既有驗證錯誤 envelope（per spec E-4 / research R-Q6)。

---

## E4: addUser / updateUser route 重指（改、`sys_system_manage_route.rs`）

```text
.route("/addUser",    post(SysUserApi::create_user))   →  post(SysSystemManageApi::add_user_for_systemmanage)
.route("/updateUser", post(SysUserApi::update_user))   →  post(SysSystemManageApi::update_user_for_systemmanage)
.route("/deleteUser",      delete(SysUserApi::delete_user_by_body))   ← 不改
.route("/batchDeleteUser", delete(SysUserApi::batch_delete_users))    ← 不改
```

route path / HTTP method 不變 → Casbin p-rule 既有、enforcement 自動沿用。RouteInfo 註冊（若 F9 alias 有)維持。

---

## E5: base-web 寫入 service function（改、`system-manage.ts`）

比照同檔 `fetchGetRoleList` 體例新增 4 個:

```ts
export function fetchAddUser(data: ...) {
  return request({ url: '/systemManage/addUser', method: 'post', data });
}
export function fetchUpdateUser(data: ...) {
  return request({ url: '/systemManage/updateUser', method: 'post', data });
}
export function fetchDeleteUser(data: { id: ... }) {
  return request({ url: '/systemManage/deleteUser', method: 'delete', data });
}
export function fetchBatchDeleteUser(data: { ids: ... }) {
  return request({ url: '/systemManage/batchDeleteUser', method: 'delete', data });
}
```

`data` 直送 drawer model（含 `userName`/`userGender`/`status` 等 base-web 形狀);值轉換在後端 E3。型別以既有 `Api.SystemManage.User` 衍生,**不新增 / 不改 `src/typings`**（W-WEBUI §4)。

---

## E6: base-web handleSubmit + delete handler（改）

**E6-a `user-operate-drawer.vue` `handleSubmit`**:

```text
await validate()
const { error } = props.operateType === 'add'
  ? await fetchAddUser(model.value)
  : await fetchUpdateUser({ ...model.value, id: props.rowData!.id })
if (error) return            // request helper / base-web 既有錯誤呈現;不關抽屜
window.$message?.success(...)
closeDrawer()
emit('submitted')            // 觸發 user/index.vue getDataByPage 列表 refresh
```

**E6-b `user/index.vue`**:

```text
async function handleDelete(id) {
  const { error } = await fetchDeleteUser({ id })
  if (error) return
  onDeleted()                // useTableOperate 內建:成功訊息 + 列表 refresh
}
async function handleBatchDelete() {
  const { error } = await fetchBatchDeleteUser({ ids: checkedRowKeys.value })
  if (error) return
  onBatchDeleted()
}
```

不動型別、表格 `columns` render、router、store、i18n（W-WEBUI §4）。drawer 的 `userRoles` 多選欄維持顯示、`model` 仍含 `userRoles` —— 送出後由 E1 後端 DTO serde 忽略（Q3 範疇外)。

---

## 變更後 data flow

```
base-web /manage/user
  ├─ 新增/編輯抽屜 handleSubmit
  │    └─ fetchAddUser / fetchUpdateUser  → POST /api/systemManage/{addUser,updateUser}
  │         └─ rust transform handler（E3）: base-web shape → CreateUserInput/UpdateUserInput
  │              └─ create_user / update_user（E2）→ sys_user 寫入 + audit_log（同 txn）
  └─ 列表 handleDelete / handleBatchDelete
       └─ fetchDeleteUser / fetchBatchDeleteUser → DELETE /api/systemManage/{deleteUser,batchDeleteUser}
            └─ 既有 delete_user_by_body / batch_delete_users → soft delete + audit

回應:F4 路線 II envelope { code, data, msg, success }
  ├─ code 0 → base-web 成功訊息 + 列表 refresh
  └─ code≠0 → base-web 既有錯誤呈現、抽屜不關
```

---

## Data Model 完成標誌

- ✅ E1 alias DTO（`SystemManageAddUserInput` / `SystemManageUpdateUserInput`)+ `UpdateUserInput` un-flatten / password→Option
- ✅ E2 `update_user` password 條件式 Set
- ✅ E3 addUser / updateUser transform handler（形狀對映 + 預設值)
- ✅ E4 route 重指（path/method 不變、Casbin 沿用）
- ✅ E5 base-web 4 個寫入 service function
- ✅ E6 base-web handleSubmit + delete handler 接線
- ✅ 無 migration、無 base-web 型別 / render / router / store 改、無 Casbin seed 改、不動 nestjs

**Constitution Re-check（post data-model）**:E1-E6 確認 —— base-web 改動限 §4 受控範圍（IV W-WEBUI 例外）;`update_user` 調整無 schema 改、audit hook 不受影響（II);alias path / Casbin 不動（I);無服務間 forward（III);DESIGN-B 形態（V N/A）。**4 PASS / 1 N/A / 0 violation 維持**。
