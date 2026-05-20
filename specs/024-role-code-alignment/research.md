# Research: F7.2 — role-code-alignment

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-20

F7.2 為 F7.1 fix-route-getuserroutes-wiring 後的小型 follow-up — 收掉 F7.1 CDP demo 的 `Fetch.requestPaused` role alias workaround。Brainstorm 已 saturated(per [`docs/superpowers/024-feature-role-code-alignment.md`](../../docs/superpowers/024-feature-role-code-alignment.md)、2 顯式 Q + 1 Approach 拍板)、spec 0 個 [NEEDS CLARIFICATION] marker。Phase 0 紀錄為 implement-time pattern 確認,不解 spec 級 unknown。

---

## R-Q1: role-code alias 映射 helper 該用什麼形式、放哪裡?

**Question**: F7.2 要把 `getUserInfo` 回傳的 `roles[]`(`ROLE_*`)映射成 base-web 期望的 `R_*`。用 prefix transform(`ROLE_`→`R_`)還是明確 lookup?放哪個 module?

**Evidence**(2026-05-20 grep + 既有 code):
- `get_user_info` handler(`server/api/src/admin/sys_authentication_api.rs` line 63-73)現為 `roles: user.subject()`;`User::subject()`(`server/core/src/web/auth.rs:87`)回 `self.role.clone()`(`Vec<String>`、來自 JWT `Claims.role`)
- rust seed 只有 3 個 role(`m20241024_034526_insert_sys_role.rs`:`ROLE_SUPER` / `ROLE_ADMIN` / `ROLE_USER`)
- F10.2 precedent:`TokenStatus` serialize 對齊(純函式 mapping)以明確 per-variant 處理 + `#[cfg(test)] mod tests` 1 fn,F9 R-① lesson「不要 add speculative / 過度聰明的轉換」

**Decision**: F7.2 用**明確 3-entry `match` 純函式**、放 `sys_authentication_api.rs` module level:
```rust
fn map_role_alias(code: &str) -> String {
    match code {
        "ROLE_SUPER" => "R_SUPER".to_string(),
        "ROLE_ADMIN" => "R_ADMIN".to_string(),
        "ROLE_USER" => "R_USER".to_string(),
        other => other.to_string(),
    }
}
```
- handler 改 `roles: user.subject().iter().map(|c| map_role_alias(c)).collect()`
- module 內加 `#[cfg(test)] mod tests` 1 fn 驗 3 known + 1 unknown

**Rationale**:
- **不用** `ROLE_`→`R_` prefix transform — 那種寫法耦合命名假設(假設所有 role code 都 `ROLE_` 開頭),未來若加一個不 follow 此前綴的 role 即靜默產生錯誤映射;明確 `match` 讓新增 role 時開發者必須有意識補一筆 arm
- unknown code `other => other.to_string()` pass through:未來新 role 沒補 arm 時行為等同現況(維持原 code、不匹配 base-web static `meta.roles`)、無 regression
- 放 `sys_authentication_api.rs` module level(getUserInfo-only per spec Q2)— 不外擴成共用 util、避免引導未來誤用到其他 surface

**Spec impact**: spec FR-001~FR-003 對齊;data-model E1 列 helper 細目。

**Alternatives considered**:
- **prefix transform `code.strip_prefix("ROLE_").map(|r| format!("R_{r}"))`**:行數更少但耦合命名、未知 role 靜默誤映射 — rejected
- **共用 util crate / `server-constant`**:F7.2 getUserInfo-only、不需跨 crate 共用;放共用層反而引導未來誤套到 manage/role 表 — rejected

---

## R-Q2: base-web example 分支 static 模式 role 消費點是否全由 getUserInfo 覆蓋?

**Question**: F7.2 只映射 `getUserInfo` response,base-web 其他 role 比對點會不會漏?

**Evidence**(2026-05-20 grep base-web/src):
- `src/store/modules/route/index.ts:200` — `filterAuthRoutesByRoles(staticAuthRoutes, authStore.userInfo.roles)`(static 模式路由過濾)
- `src/store/modules/route/shared.ts::filterAuthRouteByRoles` — `routeRoles.some(role => roles.includes(role))` 比對 `route.meta.roles`
- `src/router/guard/route.ts:31` — route guard `authStore.userInfo.roles.some(role => routeRoles.includes(role))`
- `src/store/modules/auth/index.ts:35` — `isStaticSuper` = `userInfo.roles.includes(VITE_STATIC_SUPER_ROLE)`(`.env` `VITE_STATIC_SUPER_ROLE=R_SUPER`)
- 4 處 role 比對全讀 `authStore.userInfo.roles`、來源單一 = `getUserInfo` response 寫入 auth store
- `src/router/elegant/routes.ts` `meta.roles` hardcoded `['R_SUPER']` / `['R_ADMIN']`(elegant-router 產生檔)

**Decision**: 映射 `getUserInfo` response 的 `roles[]` **即覆蓋 base-web static 模式所有 role 比對點** — `userInfo.roles` 是 SPA 端 role 的唯一事實源。

**Rationale**:
- base-web 不把 `userInfo.roles` 回送 rust;rust Casbin enforce 從 JWT(`ROLE_*`)+ `casbin_rule.v0`(`ROLE_*`)、與 SPA `roles` 無關
- `getUserInfo` 為單向 output、映射安全完整

**Spec impact**: spec A-001 + A-002 對齊;C-V5 CDP smoke 3 view 不帶 workaround 直接驗。

---

## R-Q3: F7.1 CDP smoke setup 沿用 + 移除 role alias 注入段

**Question**: F7.2 acceptance CDP smoke 怎麼跑?與 F7.1 差異?

**Evidence**(F7.1 CDP demo 實作 `/tmp/cdp-f71-smoke.js`):
- F7.1 CDP script 有 `Fetch.enable` + `Fetch.requestPaused` 攔 `/auth/getUserInfo`、把 `roles` 注入 `R_SUPER`/`R_ADMIN` alias(demo-only workaround、因 rust 當時回 `ROLE_*`)
- 其餘 setup:WSL2 host Edge 148 + `--remote-debugging-port=9229` + node `ws` driver + clear storage + POST login + inject `SOY_token` + navigate manage views + count `.n-data-table-tbody .n-data-table-tr`

**Decision**: F7.2 CDP smoke **沿用 F7.1 setup、但移除 `Fetch` 攔截 + role alias 注入整段** — 直接驗 rust 原生回傳的 `R_*` role code 通過 base-web static 過濾。這是 F7.2 的核心驗收差異(spec FR-017):若 3 view 不帶 workaround 仍 render,證明 F7.2 映射生效、workaround 已不需要。

**Rationale**:
- F7.2 的目的就是消除 workaround — acceptance 必須在「無 workaround」狀態下跑才有意義
- 移除 `Fetch.enable` / `Fetch.requestPaused` / `Fetch.fulfillRequest` 段後 script 更簡單
- graceful degradation(per spec A-004):CDP setup 異常時降級為 C-V2~C-V4 curl 驗 role code 已是 `R_*`、C-V5 標 deferred manual

**Spec impact**: spec FR-017 + C-V5 對齊。

---

## Phase 0 Research 完成標誌

- ✅ R-Q1 映射 helper 用明確 3-entry `match` 純函式、放 `sys_authentication_api.rs`、unknown pass through
- ✅ R-Q2 映射 `getUserInfo` response 即覆蓋 base-web static 模式所有 role 比對點(`userInfo.roles` 為 SPA 唯一 role 事實源)
- ✅ R-Q3 CDP smoke 沿用 F7.1 setup、移除 role alias 注入段(無 workaround 驗收)
- ✅ Ready for Phase 1(data-model.md / contracts/verification-commands.md / quickstart.md)

**無 spec correction** — F7.2 brainstorm 已 saturated、Phase 0 純 pattern 確認。
