# F7.2 — role-code-alignment

**Date**: 2026-05-20
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-20(2 顯式拍板 Q + 1 approach 拍板 + F7.1 CDP demo role alias workaround 承接 + F7/F7.1 「後端適應 base」shape-mapping pattern 延續)

---

## Scope summary

rev1 **F7.1 fix-route-getuserroutes-wiring merge 後第一個 follow-up feature** — F7.1 CDP browser smoke demo 階段為了讓 base-web static 模式的路由過濾通過、用了 `Fetch.requestPaused` 攔 `/auth/getUserInfo` 注入 `R_SUPER`/`R_ADMIN` role alias 的 demo-only workaround。F7.2 把這個 workaround 收掉:讓 rust `getUserInfo` 直接回傳 base-web static 模式接受的 role code。

**根因**:rust `sys_role.code` = `ROLE_SUPER`/`ROLE_ADMIN`/`ROLE_USER`,但 base-web example 分支 static 路由過濾期望 `R_SUPER`/`R_ADMIN`(`src/router/elegant/routes.ts` 的 `meta.roles` hardcoded + `.env` `VITE_STATIC_SUPER_ROLE=R_SUPER`)。字串不符 → `userInfo.roles` 無法 match `meta.roles` → static auth routes 全被濾掉。

| 對齊面 | F7.2 deliverable |
|---|---|
| **US1 P1 role code alias 映射** | `server/api/src/admin/sys_authentication_api.rs::get_user_info` handler 對回傳的 `roles[]` 套一個 role-code alias 映射 helper(`ROLE_SUPER`→`R_SUPER` / `ROLE_ADMIN`→`R_ADMIN` / `ROLE_USER`→`R_USER`、未知 code 原樣 pass through)。base-web static 模式的 `filterAuthRoutesByRoles` / route guard / `isStaticSuper` 三處 role 比對全部接通、F7.1 CDP role alias workaround 不再需要 |

範疇刻意收緊到「**1 個 backend response-layer role code 映射 + base manage/* 3 view CDP smoke acceptance(不帶 workaround)**」、**不改 base src / 不改 base `.env` / 不改 nestjs / 不動 migration / 不動 docker-compose / 不動 Casbin / 不切 dynamic auth route mode**。

**Commit 模式**(F7.2 固定):
- **兩段式** commit(per CLAUDE.md §6.1、類 F5.1/F6/F10.1/F10.2/F11/F9/F7/F7.1):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**、**無 migration 改**。

---

## Authoritative parents

- [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) — F7.1 里程碑條目尾段「role code mismatch(`R_SUPER`/`R_ADMIN` vs `ROLE_*`)留 F7.2 role-code-alignment follow-up」+ Current Focus 下一步段 — 本 feature 承接
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1 Application Phase 3 — F7.2 是 F7/F7.1 base manage/* 跑通的收尾補完(CDP demo 不再需 workaround)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle I「RBAC fail-safe」— F7.2 不動 Casbin、不擴 scope;role code 映射只在 getUserInfo response 邊界、enforce 路徑(JWT role × `casbin_rule.v0`)維持 `ROLE_*` 不變
  - Principle IV「base 不改動邊界」— F7.2 嚴守 `base-web/`(含 `src/` 與 `.env`)+ `fork260509-soybean-admin-nestjs/` 全 0 diff、映射集中 rust 端;這正是「後端適應 base API 預期」精神(對齊 F7 shape mapping / RESEARCH §6.2 方案 B)
  - Principle V「漸進收縮」— F7.2 role code alias 映射在 DESIGN-B 階段繼承(identical);`getUserInfo` 為 rust 自有 endpoint、跨 DESIGN-A/B、nestjs 不涉及
- F7.1 outer `554436f` + merge `efe910e`、rust-api `4de171a`(F7.2 baseline、本 branch 從 `rev1-admin-root` 衍生)
- F7 implement-time pattern:「後端適應 base API 預期」的 shape mapping(F7 `output/sys_system_manage.rs` 5 個 Output DTO + From impl)— F7.2 role code 映射為同精神、更小規模
- F10.2 implement-time precedent:純函式 mapping(`TokenStatus` serialize 對齊)加 1 個 unit test fn — F7.2 mapping helper 為純函式、沿用此 precedent

---

## 既有現況(brainstorm 階段 grep 確認、2026-05-20)

- **rust role code 來源**:`migration/src/datas/m20241024_034526_insert_sys_role.rs` seed `sys_role.code` = `ROLE_SUPER`/`ROLE_ADMIN`/`ROLE_USER`;login 流程 `sys_auth_service::get_user_roles` 回 `role.code` → 進 JWT `Claims.role`;`get_user_info` handler 現為 `roles: user.subject()`(`User::subject()` 回 `claims.role` 即 `ROLE_*`)
- **base-web role 消費點**(static 模式、`VITE_AUTH_ROUTE_MODE=static`):
  - `src/store/modules/route/shared.ts::filterAuthRouteByRoles` — `routeRoles.some(role => roles.includes(role))` 比對 `meta.roles`
  - `src/router/guard/route.ts` — route guard `userInfo.roles.some(role => routeRoles.includes(role))`
  - `src/store/modules/auth/index.ts::isStaticSuper` — `userInfo.roles.includes(VITE_STATIC_SUPER_ROLE)`(`.env` `VITE_STATIC_SUPER_ROLE=R_SUPER`)
  - `src/router/elegant/routes.ts` — `meta.roles` hardcoded `['R_SUPER']` / `['R_ADMIN']`(elegant-router 產生檔)
- **不對齊本質**:rust `getUserInfo` 回 `ROLE_*`、base-web 全部期望 `R_*` → static auth routes 被 `filterAuthRoutesByRoles` 全濾掉

---

## Clarifying Q(2 個 brainstorm 拍板 + 1 approach 拍板)

### Q1: F7.2 目標範疇 — 只解 role code 字串不符,還是順便處理 base-web auth route mode?

**A: Option A — 只解 role code 對齊**。

**理由**:
- F7.2 純粹讓 `getUserInfo` 回傳的 role code 被 base-web static 模式接受、消除 F7.1 CDP role alias workaround;auth route mode 維持 `static` 不動
- 與 feature 名 `role-code-alignment` 一致、scope 最緊
- 對比:Option B(role code + 評估 dynamic mode)會動 base-web `.env`(`VITE_AUTH_ROUTE_MODE=dynamic`)、scope 顯著放大、且 dynamic mode 切換涉及 `/route/getUserRoutes` 動態菜單整套驗證 — 屬獨立 feature 範疇

### Q2: rust 多處輸出 role code,F7.2 對齊哪些 surface?

**A: Option A — 只 getUserInfo.roles**。

**理由**:
- `getUserInfo.roles` 是唯一「功能性 gate」(static route filter / route guard / `isStaticSuper` bypass 三處 role 比對)
- F7 manage/role 表 `roleCode`、F9 `getAllRoles` 等繼續顯示真實 code `ROLE_*` — admin 看 role registry 應看真實值;若映射成 `R_*`,admin 看到的 roleCode 與 DB/Casbin 實際值不同、更易誤導,且 F8 assign-users 需真實 code
- scope 最緊、與 F8 不衝突

### Approach 拍板:role code 對齊的實作方向

**A: Approach A — rust `getUserInfo` response 層 role code alias 映射**。

**理由**:
- 跟 F7(shape mapping)、F7.1(wiring fix)同一脈絡「後端適應 base API 預期」、嚴守 Constitution IV
- scope 最小:1 file ~10 LOC、無 migration、三邊零改動
- 對比:
  - **Approach B**(改 base-web `.env` + `routes.ts`):`routes.ts` 是 elegant-router 產生檔、改它 = base-web src diff 違 Principle IV;且 `.env` `VITE_STATIC_SUPER_ROLE` 只能解 super、admin 的 `meta.roles` 仍 hardcoded — 否決
  - **Approach C**(rust `sys_role.code` migration rename `ROLE_*`→`R_*`):需新 migration UPDATE `sys_role.code` + 全部 `casbin_rule.v0` row + JWT 簽發對齊 — Casbin enforce 依賴 JWT role × `casbin_rule.v0`、改 code 等於動遍每個既有 seed migration 的資料面、blast radius 過大、為一個顯示字串不符不值得 — 否決

---

## 設計

### 機制

`get_user_info` handler(`server/api/src/admin/sys_authentication_api.rs`)目前:

```rust
let user_info = UserInfoOutput {
    ...
    roles: user.subject(),   // 回 ["ROLE_SUPER"] 等
    ...
};
```

F7.2 加一個純函式 role-code alias 映射 helper,套在 `roles` vec 上:

| DB / JWT / Casbin code | getUserInfo 回傳(映射後) |
|---|---|
| `ROLE_SUPER` | `R_SUPER` |
| `ROLE_ADMIN` | `R_ADMIN` |
| `ROLE_USER` | `R_USER` |
| 其他未知 code | 原樣 pass through(不丟、不報錯) |

- helper 為純函式、3-entry 明確 `match`(**不用** `ROLE_`→`R_` prefix transform — 那種寫法耦合命名假設、未來新 role 不 follow 即壞;明確 `match` 讓新增 role 時開發者必須有意識補一筆)
- 未知 code pass through:未來新 role 沒補 map entry 時行為等同現況(不匹配 static `meta.roles`)、無 regression
- helper 放 `sys_authentication_api.rs` handler 模組內(getUserInfo-only per Q2、不外擴)
- **JWT `Claims.role` / `casbin_rule.v0` / `sys_role.code` DB 三者全不動** — 映射只發生在 `getUserInfo` response 邊界;Casbin enforce 路徑(JWT role × `casbin_rule.v0`)維持 `ROLE_*` 一致

規模:1 file、helper ~6-8 LOC + handler 1 行改、無 migration。

### Acceptance(curl + CDP smoke 補償、沿用 F7/F7.1 慣例)

| ID | 驗證 | 預期 |
|---|---|---|
| C-V1 | rust-api image rebuild | exit 0 + 新 image SHA |
| C-V2 | Soybean curl `/auth/getUserInfo` | `roles` 含 `R_SUPER`(非 `ROLE_SUPER`) |
| C-V3 | Administrator curl `/auth/getUserInfo` | `roles` 含 `R_ADMIN` |
| C-V4 | GeneralUser curl `/auth/getUserInfo` | `roles` 含 `R_USER` |
| C-V5 | CDP smoke manage 3 view **不帶** `Fetch.requestPaused` role alias 注入 | `/manage/menu` + `/manage/user` + `/manage/role` 3 view 原生 render(證 F7.1 workaround 已不需要) |
| C-V6 | regression | login + `/route/getUserRoutes` HTTP 200 + Casbin enforce 不退化(Casbin 仍用 `ROLE_*`) |
| C-V7 | rust unit test | mapping helper 1 個 unit test fn — 驗 3 known code 映射 + 1 unknown pass-through |
| C-V8 | zero-regression scope | base-web/nestjs/docker-compose/migration 0 diff、rust-api 1 file |
| C-V9 | W-FA1 stack regression | 6 service healthy + rust-api 剛 recreated |

CDP smoke 沿用 F7/F7.1 setup(WSL2 host Edge 148 + `--remote-debugging-port=9229`);F7.2 的 C-V5 關鍵差異 = node script **移除** `Fetch.requestPaused` role alias 注入段,直接驗原生 role code 即可通過 base-web static 過濾。若 CDP setup 異常 → graceful degradation:C-V2~C-V4 curl 驗 role code 已是 `R_*` 即視為 US1 核心通過、C-V5 標 deferred manual。

### 單元測試

F7.2 mapping helper 是純函式 — 比照 F10.2 precedent(`test_token_status_serialize_aligns_with_nestjs`)加 **1 個 unit test fn**(驗 3 known code 映射 + 1 unknown pass-through)。這與 F7/F7.1「wiring 無 unit test」不同 — F7.2 核心是可獨立測的純函式、值得 unit test。

### Scope 邊界(明確不動)

- JWT `Claims.role` / `casbin_rule.v0` / `sys_role.code` DB 全 `ROLE_*` 不動、**無 migration**
- F7 manage/role 表 `roleCode`、F9 `getAllRoles` 維持 `ROLE_*`(per Q2)
- `base-web/` 任何 file 0 diff(含 `src/` 與 `.env`)、`fork260509-soybean-admin-nestjs/` 0 diff(per Principle IV)
- `docker-compose*.yml` 0 diff
- auth route mode 維持 `static`(per Q1、不切 dynamic)
- 不碰 F8 assign-users

---

## File Changes(預估)

**Worktree(改、`rust-api/`、~1 file ~10 LOC + 1 unit test):**
- 改:`rust-api/server/api/src/admin/sys_authentication_api.rs`(role-code alias 映射 helper ~6-8 LOC + `get_user_info` handler 1 行改 + `#[cfg(test)] mod tests` 1 fn)

**Outer(改):**
- 改:`docs/INTEGRATION-CHECKLIST.md`(F7.2 row + Current Focus)
- 改:`CLAUDE.md` §10 SPECKIT marker(`/speckit-specify` 後)
- 新建:`docs/superpowers/024-feature-role-code-alignment.md`(本檔)
- spec docs:`specs/<NNN>-role-code-alignment/`(`/speckit-specify` 後)

**不動**:`base-web/` 全部、`fork260509-soybean-admin-nestjs/`、`rust-api/migration/`、`docker-compose*.yml`。

---

## Risks

- **R-1**(極低)**映射只改 getUserInfo response、base-web 其他 role 消費點是否全涵蓋**:brainstorm 階段 grep 確認 base-web static 模式所有 role 比對(`filterAuthRoutesByRoles` / route guard / `isStaticSuper`)都讀 `authStore.userInfo.roles`、來源單一 = `getUserInfo` response → 映射 getUserInfo 即全涵蓋。**緩解**:C-V5 CDP smoke 3 view 不帶 workaround 直接驗。
- **R-2**(極低)**base-web 是否把 `userInfo.roles` 回送 rust 供 rust 再比對**:rust Casbin enforce 從 JWT(`ROLE_*`)+ `casbin_rule.v0`(`ROLE_*`)、不依賴 client 送的 role。getUserInfo `roles` 為 SPA 顯示/路由過濾用、單向 output。**緩解**:C-V6 regression 驗 Casbin enforce 不退化。
- **R-3**(低)**CDP smoke setup flaky**:沿用 F7/F7.1 既有 setup;若異常 → graceful degradation 為 C-V2~C-V4 curl 驗 role code 已是 `R_*`(per Acceptance 段)。
- **R-4**(極低)**未知 role code pass-through 行為**:未來新增 role 沒補 map entry → 該 role 維持 `ROLE_X`、不匹配 static `meta.roles` — 行為等同 F7.2 前現況、無 regression;明確 `match` 設計讓新增 role 時開發者會注意到要補。

---

## Next step

`/speckit-specify` — 產出 `specs/<NNN>-role-code-alignment/spec.md`(NNN 由 `before_specify` pre-hook 衍生 feature branch 時決定、預期 `024`)。
