# Data Model: F7.2 — role-code-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F7.2 **不動 DB schema、不增 row、不動 entity model、不動 migration、不動 JWT `Claims`**。code 改動主體:**1 個 in-place fix** — 在 `sys_authentication_api.rs` 加一個 role-code alias 映射純函式 + `get_user_info` handler 套用 + 1 unit test。無新建 file、無 module register。

---

## E1: role-code alias 映射 helper(US1 P1、新增純函式)

**File**: `rust-api/server/api/src/admin/sys_authentication_api.rs`(F5.1 既有檔、F7.2 加 module-level 純函式)

**新增**:
```rust
/// F7.2 role-code-alignment:rust sys_role.code(ROLE_*)→ base-web example
/// static route filter 期望的 role code(R_*)alias 映射。
/// 只用於 getUserInfo response 邊界;JWT Claims.role / casbin_rule.v0 /
/// sys_role.code DB 維持 ROLE_*、Casbin enforce 不受影響。
fn map_role_alias(code: &str) -> String {
    match code {
        "ROLE_SUPER" => "R_SUPER".to_string(),
        "ROLE_ADMIN" => "R_ADMIN".to_string(),
        "ROLE_USER" => "R_USER".to_string(),
        other => other.to_string(),
    }
}
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| 形式 | 明確 3-entry `match`(非 `ROLE_`→`R_` prefix transform、per research R-Q1) |
| input / output | `&str` → `String` |
| 映射表 | `ROLE_SUPER`→`R_SUPER` / `ROLE_ADMIN`→`R_ADMIN` / `ROLE_USER`→`R_USER` |
| 未知 code | `other => other.to_string()` 原樣 pass through(不丟、不報錯) |
| 可見性 | module-private `fn`(getUserInfo-only、不外擴成共用 util) |

**LOC delta**:~9 LOC(4 行 comment + 6 行 fn body)

---

## E2: `get_user_info` handler 改動(US1 P1)

**File**: `rust-api/server/api/src/admin/sys_authentication_api.rs`(F7.2 改 ~1 LOC)

**Before**(F5.1 既有、line 63-73):
```rust
pub async fn get_user_info(
    Extension(user): Extension<User>,
) -> Result<Res<UserInfoOutput>, AppError> {
    let user_info = UserInfoOutput {
        user_id: user.user_id(),
        user_name: user.username(),
        roles: user.subject(),
        buttons: vec![],
    };

    Ok(Res::new_data(user_info))
}
```

**After**(F7.2):
```rust
pub async fn get_user_info(
    Extension(user): Extension<User>,
) -> Result<Res<UserInfoOutput>, AppError> {
    let user_info = UserInfoOutput {
        user_id: user.user_id(),
        user_name: user.username(),
        // F7.2: 映射 role code 對齊 base-web static route filter(見 map_role_alias)
        roles: user.subject().iter().map(|c| map_role_alias(c)).collect(),
        buttons: vec![],
    };

    Ok(Res::new_data(user_info))
}
```

**改動要點**:
| 項目 | Before | After |
|---|---|---|
| `roles` 來源 | `user.subject()`(回 `Vec<String>` of `ROLE_*`) | `user.subject().iter().map(map_role_alias).collect()`(`R_*`) |
| handler signature | 不變 | 不變 |
| `UserInfoOutput` 其他 field | `user_id` / `user_name` / `buttons` | 不變 |
| `user.subject()` 本身 | — | 不改(`User::subject()` 仍回 JWT `Claims.role` 的 `ROLE_*`) |

**LOC delta**:~1 LOC(1 行 `roles:` 改 + 1 行 inline comment)

---

## E3: 1 個 rust unit test(US1 P1、per spec FR-013)

**File**: `rust-api/server/api/src/admin/sys_authentication_api.rs`(F7.2 加 `#[cfg(test)] mod tests`)

```rust
#[cfg(test)]
mod tests {
    use super::map_role_alias;

    #[test]
    fn test_map_role_alias() {
        // 3 known role code → R_* alias
        assert_eq!(map_role_alias("ROLE_SUPER"), "R_SUPER");
        assert_eq!(map_role_alias("ROLE_ADMIN"), "R_ADMIN");
        assert_eq!(map_role_alias("ROLE_USER"), "R_USER");
        // unknown code → pass through 原樣
        assert_eq!(map_role_alias("ROLE_FUTURE"), "ROLE_FUTURE");
    }
}
```

**設計要點**:對齊 F10.2 precedent(`test_token_status_serialize_aligns_with_nestjs`、純函式 mapping 加 1 unit test fn);覆蓋 3 筆 known code 映射 + 1 筆 unknown pass-through。**LOC delta**:~12 LOC。

> 註:F7.2 整體 LOC ≈ E1(9) + E2(2) + E3(12) ≈ 23 LOC;spec Scope summary「~10 LOC」指核心 production code(E1 + E2 ≈ 11 LOC)、不含 unit test — acceptance 階段以 production LOC 為準。

---

## E4: `getUserInfo` response 映射前後對照

**Handler**: `SysAuthenticationApi::get_user_info`、envelope 為 F4 既有 `{code, data, msg, success}`(F7.2 不改 envelope)

**Before**(F7.2 前、`Soybean` login):
```json
{ "code": 0, "data": { "userId": "1", "userName": "Soybean", "roles": ["ROLE_SUPER"], "buttons": [] }, "msg": "success", "success": true }
```

**After**(F7.2、`Soybean` login):
```json
{ "code": 0, "data": { "userId": "1", "userName": "Soybean", "roles": ["R_SUPER"], "buttons": [] }, "msg": "success", "success": true }
```

三 user 對照:`Soybean`→`roles:["R_SUPER"]`、`Administrator`→`roles:["R_ADMIN"]`、`GeneralUser`→`roles:["R_USER"]`。

> 註:`UserInfoOutput` struct(`output/sys_authentication.rs`:`roles: Vec<String>`)F7.2 不改;只是 handler 填入的值經 `map_role_alias` 轉換。`userId` / `userName` / `buttons` 不變。

---

## Data Model 完成標誌

- ✅ E1 role-code alias 映射 helper — 明確 3-entry `match` 純函式、unknown pass through(per FR-001~FR-003)
- ✅ E2 `get_user_info` handler — `roles` 套 `map_role_alias`(per FR-004、handler signature / 其他 field 不變)
- ✅ E3 1 個 rust unit test — 3 known + 1 unknown(per FR-013 + F10.2 precedent)
- ✅ E4 `getUserInfo` response 映射前後對照(F4 envelope 不變、只 `data.roles` 值轉換)
- ✅ 無 schema 改、無 migration、無 Casbin row、無 base-web 改、無 JWT `Claims` 改、無 module register 改
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E4 確認 — 無 DB 寫入(Principle II N/A)、無 Casbin 放寬(Principle I PASS、enforce 路徑維持 `ROLE_*`)、無服務間 forward(Principle III PASS)、base-web 0 diff(Principle IV PASS)、DESIGN-B 繼承 identical(Principle V PASS)。**4 PASS / 1 N/A / 0 violation 維持**。
