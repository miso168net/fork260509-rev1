# Phase 0 Research — W-FW3 role-crud-wiring

brainstorm doc（`docs/superpowers/033-feature-role-crud-wiring.md`）列 3 個開放問題，本檔逐一查證解決。

## R-Q1 — `sys_role` root pid 慣例值

- **Decision**: `add_role` transform 注入 `pid = "0"`。
- **Rationale**: DB 實查 `sys_role` —— `ROLE_SUPER` id=`1` pid=`0`（root）、`ROLE_ADMIN` id=`2` pid=`1`、`ROLE_USER` id=`3` pid=`1`。root role 的 pid 慣例為 `"0"`。base-web role 頁為扁平表、無階層 UI，故 base-web 建立的 role 一律落 root（`pid="0"`）—— 即與 ROLE_SUPER 同層的獨立 top-level role。
- **Alternatives considered**: 注入 `"1"`（掛在 ROLE_SUPER 下）—— 否決：base-web 無樹 UI、無語意依據選某個父 role；root 是唯一中性預設。
- **Note**: `sys_role.id` 為 string 欄；seed role 為 `"1"/"2"/"3"`，`create_role` 新建用 `Ulid::new().to_string()`。混用無妨（同為 string 欄）。

## R-Q2 — base-web `Api.SystemManage.Role['id']` 型別

- **Decision**: rust delete / batch DTO 用 `String` / `Vec<String>`；base-web service function 參數型別衍生自 `Api.SystemManage.Role['id']`，**不需** `.map(Number)` coercion。
- **Rationale**: `sys_role.id` 為 string 欄、runtime JSON 為字串。base-web `Api.SystemManage.Role = Common.CommonRecord<{ roleName, roleCode, roleDesc, status }>`，`id` 由 `CommonRecord` 帶入（TS 宣告為 `number`）—— 與既有 `MenuRoute.id` 同類的 minor 型別不符（runtime 實為 string）。但接線不受影響：base-web 將 runtime 字串值原樣送出、rust serde `String` 收下。**異於 W-FW2 menu**（menu id 為真 int、`handleBatchDelete` 需 `.map(Number)`）。
- **Alternatives considered**: 改 base-web `Role['id']` 型別宣告 → 否決：撞 W-WEBUI §4「不碰型別定義」邊界；此 minor 型別不符登 INTEGRATION-CHECKLIST minor 技術債（同既記的 `MenuRoute.id` 類項）。

## R-Q3 — `SysRoleService::get_role` 可用性

- **Decision**: `update_role_for_systemmanage` transform 用 `SysRoleService::get_role(&str)` fetch 既有 role，取既有 `code` / `pid`。
- **Rationale**: `get_role(&self, id: &str) -> Result<SysRoleModel, AppError>` 確認在 `TRoleService` trait（`sys_role_service.rs:38`）與 impl（`:154`）—— 可從 API 層經 service trait 呼叫。
- **Alternatives considered**: 在 transform 直接查 DB → 否決：重造 service 已封裝的查詢、繞過 soft-delete scoped finder。

## 既有行為查證（brainstorm Q1 依據，plan 階段複核）

- `update_role`（`sys_role_service.rs:164`）建 `SysRoleActiveModel` 時 `status` **不在 `Set` 清單**、由 `..before.clone().into()` 帶入 → status-drop 屬實。E4 修正：補 `status: Set(input.role.status)`。
- `update_role` 對 `code` 做 `Set`、無 Casbin 重同步 → 改 code 會孤兒化 `casbin_rule`（角色授權以 roleCode 為 `v0`）。E2 update transform 的 code-lock 規避之。
- `create_role`（`:110`）`id` 用 `Ulid::new()`、無 sequence → 確認無 W-FW2 menu 的 int sequence desync 問題。
- `check_role_exists_in_txn`：create / update 皆查 code 唯一性 → code-lock 下 update 傳既有 code、唯一性檢查（排除自身 id）自然通過。
