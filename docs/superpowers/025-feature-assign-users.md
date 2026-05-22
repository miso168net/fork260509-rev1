# F8 — assign-users

**Date**: 2026-05-20
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-20(3 顯式拍板 Q + 1 approach 拍板;F7/F7.1/F7.2 base manage/* 跑通鏈收尾後第一個 application Phase 3 第三個 feature、收 Phase 3 至 3/3)

---

## Scope summary

rev1 **application Phase 3 第三個也是最後一個 feature** — F7/F7.1/F7.2 把 base manage/* 後台讀路徑與 role code 對齊跑通後,F8 補上唯一缺的寫路徑:**user ↔ role 指派**。

DESIGN-A §3.1 定義 F8 = 新增 `POST /authorization/assign-users` endpoint。Brainstorm 階段 grep 確認:rev1 rust-api 的 `assign_users` **DTO + trait + service impl 三層全已存在**,F8 唯一缺口是 **HTTP wiring**(API handler + route mount + Casbin policy seed)。F8 因此是純 wiring feature、性質同 F7.1。

| 對齊面 | F8 deliverable |
|---|---|
| **US1 P1 user-role 指派 endpoint** | 新增 `SysAuthenticationApi::assign_users` handler + `init_authorization_router` mount `POST /authorization/assign-users` + 1 筆 Casbin `p` policy seed(ROLE_SUPER allow);接上既有 `SysAuthorizationService::assign_users(role_id, user_ids)` service method(寫 `sys_user_role` join table、整組覆蓋語意) |

範疇刻意收緊到「**1 個 backend user-role 指派 endpoint wiring + curl/psql acceptance**」、**不改 base src / 不改 base `.env` / 不改 nestjs / 不動 docker-compose / 不動 DB schema / 不重寫 service method / 不改 login role 機制**。

**Commit 模式**(F8 固定):
- **兩段式** commit(per CLAUDE.md §4.1、類 F5.1/F6/F10.x/F11/F9/F7/F7.1/F7.2):rust-api worktree 1 commit + outer 1 commit + merge `--no-ff` + SHA fill follow-up;**無 docker-compose.yml 改**;**有 1 個新 Casbin seed migration**(對比 F7.2 無 migration、同 F6/F9/F7 有 migration)。

---

## Authoritative parents

- [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) — Current Focus 下一步段「application Phase 3 第三個 feature F8 assign-users」+ F7/F7.1/F7.2 里程碑「解鎖 F8 assign-users」— 本 feature 承接、收尾 Phase 3
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §3.1(line 157)— F8 = `/authorization/assign-users`(rust 新做)
  - §6.1(line 375)— F8 依賴 F7、交付「完整 user × role 關聯管理」、Phase 3 第三個 feature
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle I「RBAC fail-safe」— F8 新 Casbin seed 只 1 row(ROLE_SUPER allow、最窄)、不放寬既有 enforce、不擴 scope
  - Principle II「Soft Delete + Audit」— F8 不新增 DB-write pattern;`assign_users` service method 對 `sys_user_role` join table 的 INSERT/DELETE 為**既有 service 行為**、F8 只暴露不改寫(`sys_user_role` 為純 join table、hard delete 為既有設計);audit 與否繼承既有 service method 行為
  - Principle IV「base 不改動邊界」— F8 嚴守 `base-web/`(含 `src/` 與 `.env`)+ `fork260509-soybean-admin-nestjs/` 全 0 diff;endpoint 為 rust 後端交付、base-web example 分支不消費
  - Principle V「漸進收縮」— `/authorization/assign-users` 為 rust 自有 endpoint、跨 DESIGN-A/B 繼承 identical、nestjs 不涉及
- F7.2 outer `68410df` + merge `476ca88`、rust-api `84cbc19`(F8 baseline、本 branch `025-assign-users` 從 `rev1-admin-root` 衍生)
- F7.1 implement-time pattern「wiring feature、無 unit test、curl acceptance」— F8 沿用
- F6 / F9 / F7 implement-time pattern「新 Casbin policy seed migration + `datas/mod.rs` + `lib.rs` Migrator 註冊」— F8 沿用

---

## 既有現況(brainstorm 階段 grep 確認、2026-05-20)

**F8 三層基礎已就緒**:

| F8 元件 | 狀態 | 位置 |
|---|---|---|
| `AssignUserDto`(`{roleId, userIds}`、`role_id`/`user_ids` 各 validate min 1、`#[serde(rename_all="camelCase")]`) | ✅ 已存在 + 已 re-export | `server/model/src/admin/input/sys_authorization.rs:30-38`、`input/mod.rs:3` |
| `assign_users` trait method(`assign_users(&self, role_id: String, user_ids: Vec<String>) -> Result<(), AppError>`) | ✅ 已宣告 | `server/service/src/admin/sys_authorization_service.rs:69` |
| `assign_users` service impl(查 role/user 存在 → transaction:diff 既有 `sys_user_role` vs 新清單、INSERT 新增 + DELETE 移除) | ✅ 已實作 | `server/service/src/admin/sys_authorization_service.rs:302` |
| `assign_users` API handler | ❌ **不存在**(F8 補) | — |
| route mount + `RouteInfo` | ❌ **不存在**(F8 補) | — |
| Casbin `p` policy seed row | ❌ **不存在**(F8 補) | — |

**既有 sibling 對照**(`init_authorization_router`、`server/router/src/admin/sys_authentication_route.rs:63-95`):
- `/authorization/assign-permission` POST → `SysAuthenticationApi::assign_permission`(handler 需 `enforcer`)
- `/authorization/assign-routes` POST → `SysAuthenticationApi::assign_routes`(handler 不需 enforcer、F8 的 handler 比照此者)
- Casbin seed `m20241024_082926_insert_casbin_rule.rs:57-58` — 兩個 sibling 都只 seed `ROLE_SUPER`

**user-role 關聯與 login 生效機制**:
- `sys_user_role` join table(`(user_id, role_id)` 複合主鍵)為 user-role 關聯權威來源
- login `pwd_login` → `get_user_roles(user_id)`(`sys_auth_service.rs:256`)**join `sys_user_role` table** 取 `sys_role.code` → 進 JWT `Claims.role`
- 故 `assign_users` 寫 `sys_user_role` join table → 被異動 user **下次 login 即生效**;不需寫 Casbin `g` rule

---

## Clarifications(brainstorm 2026-05-20、3 顯式拍板 Q + 1 approach 拍板)

- **Q1 (brainstorm)**: F8 成功標準?→ **A:後端 endpoint 交付 + curl 驗收**。F8 = 交付 `POST /authorization/assign-users` 後端 endpoint、用 curl + psql + re-login 驗收(同 F7/F7.1/F7.2/F9 後端-only 模式);base-web example 分支維持 stub、0 diff;收尾 application Phase 3(3/3)。對比「連 base-web SPA UI 一起跑通」會破 Constitution IV「base 不改動」邊界。

- **Q2 (brainstorm)**: user→role 寫入走哪個機制?→ **A:用既有 service method、只寫 `sys_user_role` join table**。F8 endpoint 直接接既有 `assign_users` service method(寫 join table、diff INSERT/DELETE);不寫 Casbin `g` rule — 因 login `get_user_roles` 讀 join table、寫 join table 即生效。**DESIGN-A §3.1「寫 Casbin `g` rule」對 rev1 codebase 不精確**(rev1 實際機制 = join table、service method 已正確處理)、視為 spec drift 文件化(同 F7 R-Q-AT1 / F9 R-Q1 modal pattern「實作前 catch + 文件化」)。對比「雙寫 g rule」= dead write(g rule 在 rev1 enforce 路徑未被用)、「全面改走 g rule」= 需改 login、blast radius 過大。

- **Q3 (brainstorm)**: 誰能呼叫 `POST /authorization/assign-users`?→ **A:只 ROLE_SUPER**。F8 Casbin seed migration 只插 1 row(ROLE_SUPER 對 `/authorization/assign-users` POST allow)、對齊既有 sibling `assign-permission`/`assign-routes`(都只 ROLE_SUPER);user-role 指派為高權限 RBAC 管理動作、限超管。對比「ROLE_SUPER + ROLE_ADMIN」會破 `/authorization/assign-*` 家族 ROLE_SUPER-only 一致性。

- **Approach 拍板**: → **Approach A — 薄 wiring,只補 `/authorization/assign-users`**。因 DTO + trait + service impl 三層已就緒,F8 架構上只有一條合理路線,差別僅在是否擴大。Approach A 只補 handler + route mount + Casbin seed migration、對齊 DESIGN-A 明寫的 `/authorization/assign-users` 與 sibling。對比 Approach B(額外加 F9-style `/systemManage/*` alias)= base-web example 分支無此呼叫、DESIGN-A 明寫 `/authorization/` 家族、屬 over-building、rejected。

---

## 設計

### 1. 範疇與架構

後端 endpoint 交付:新增 `POST /authorization/assign-users`,把既有 `SysAuthorizationService::assign_users` service method 接上 HTTP。Role-centric(指定一個 role、設定它的 user 集合)。對齊 sibling `assign-permission`/`assign-routes`、對齊 DESIGN-A §3.1。base-web / nestjs / docker-compose / DB schema 零改動。

### 2. 元件改動(5 file ~35 LOC)

| # | File | 改動 |
|---|---|---|
| 1 | `server/api/src/admin/sys_authentication_api.rs` | 加 `SysAuthenticationApi::assign_users` handler(比照既有 `assign_routes`:`Extension<Arc<SysAuthorizationService>>` + `ValidatedForm<AssignUserDto>` → `service.assign_users(input.role_id, input.user_ids)` → `Res::new_data(())`);`AssignUserDto` 加進既有 `server_service::admin::{...}` import 清單 |
| 2 | `server/router/src/admin/sys_authentication_route.rs` | `init_authorization_router` 的 `routes` vec 加 1 條 `RouteInfo::new(".../assign-users", Method::POST, "SysAuthorizationApi", "分配用户")`;`authorization_router` 加 `.route("/assign-users", post(SysAuthenticationApi::assign_users))` |
| 3 | `migration/src/datas/m20260522_a_f8_assign_users_seed.rs`(新建) | `up`:INSERT 1 row `('p','ROLE_SUPER','built-in','/authorization/assign-users','POST','','')`;`down`:scope-limited DELETE 同 row。檔名日期排在現有最新 `m20260521`(F7)之後 |
| 4 | `migration/src/datas/mod.rs` | 註冊新 migration module |
| 5 | `migration/src/lib.rs` | Migrator vec 加新 migration |

### 3. Data flow

`POST /api/authorization/assign-users` body `{roleId, userIds:[]}` → nginx → rust-api JWT auth + Casbin enforce(ROLE_SUPER 經新 seed row 放行)→ `ValidatedForm<AssignUserDto>`(validate `roleId` 非空、`userIds` 非空)→ `SysAuthorizationService::assign_users(role_id, user_ids)` → 查 role 存在 + user 存在 → transaction:diff 既有 `sys_user_role` vs 新清單、INSERT 新增 + DELETE 移除 → envelope `{code:0, success:true}`。

**生效路徑**:被異動的 user 下次 login → `get_user_roles` join 更新後的 `sys_user_role` → 新 role code 進 JWT → `getUserInfo`/`getUserRoutes` 反映新 role。

### 4. 關鍵語意 — set-semantics(整組覆蓋)

`assign_users(role_id, user_ids)` 是**整組覆蓋**而非增量:`assign_users(role_2, [user_3])` 會把 ROLE_ADMIN 的 user 集合設成「只剩 user_3」、把原本的 user_2 移除。語意是「set this role's full user list」、非「add a user」。此為既有 service method 與 `AssignUserDto` 的設計(與 sibling `assign-routes` 一致)、F8 不改。

→ **acceptance 必須採 capture → assign → verify → restore 模式**:擷取 role 現有 user 集合、做加項異動、驗證、再還原原集合,避免污染 seed 資料(同 F6/F9 soft-delete-then-restore 紀律)。

### 5. 錯誤處理 / edge case

| 場景 | 行為 |
|---|---|
| `userIds` 空陣列 | `AssignUserDto` validate `min 1` 擋下(與 sibling `AssignRouteDto` 一致)→ validation error。意涵:無法用此 endpoint「清空 role 的所有 user」— 接受現況(DTO 既有、對齊 sibling) |
| `roleId` 空字串 | `AssignUserDto` validate `min 1` 擋下 |
| role / user 不存在 | service method 查存在性 → `AppError` → F4 envelope error code |
| 非 ROLE_SUPER 呼叫 | Casbin enforce deny → `{code:5001, success:false}` HTTP 200(F11 R-Q6 `casbin_envelope_adapter` envelope wrap) |
| 重複指派同一組 user | diff 無變化 → no-op transaction → 仍回 `code:0` |

### 6. 測試 / 驗收

- **無 unit test**(F8 為純 wiring、無 pure function 可獨立測;service method 為既有、F8 範疇外)— 同 F7.1 precedent
- **acceptance = curl + psql**(對齊 F7/F7.1/F7.2/F9 慣例、不新建 deploy script、不引入 e2e framework),在 W-FA1 dev `--profile track-a` stack 上跑
- C-V 草案(實際 C-V 編號與命令於 `/speckit-plan` contracts 定):
  - image rebuild OK
  - ROLE_SUPER login → POST assign-users(capture role 現有 user → 加項異動)→ HTTP 200 + envelope `code:0`
  - psql `sys_user_role` 反映異動(新 row 在、被移除 row 不在)
  - 被異動 user re-login → `getUserInfo` `roles` 反映新 role(經 F7.2 alias 映射為 `R_*`)
  - restore — 還原 role 原 user 集合、psql 驗證 seed 未污染
  - 非 ROLE_SUPER(ROLE_ADMIN)呼叫 → `{code:5001, success:false}`
  - sibling regression — `assign-permission` / `assign-routes` 不退化
  - 三邊 scope — base-web src 0 diff + nestjs fork 0 diff + docker-compose 0 diff + rust-api ~5 file
  - W-FA1 stack 6 service healthy + rust-api 剛 recreated + migration exited 0

---

## 範疇外

- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV;含 manage/user `user-operate-drawer` 的 `userRoles` stub 欄位 — F8 不碰 base-web UI)
- ❌ 不動 `fork260509-soybean-admin-nestjs/` 任何 file
- ❌ 不改 `docker-compose*.yml` / nginx config / Dockerfile
- ❌ 不動 DB schema(`sys_user_role` 表既有、F8 不改;只新增 1 個 Casbin `p` policy seed migration、不改 schema)
- ❌ 不重寫 `assign_users` service method、不改 `AssignUserDto`、不改 `TAuthorizationService` trait
- ❌ 不寫 Casbin `g` rule、不改 login `get_user_roles` 機制(per Q2)
- ❌ 不加 user-centric「assign roles to a user」endpoint(F8 = role-centric `/authorization/assign-users`、per feature 名 + DESIGN-A + 既有 service method 方向)
- ❌ 不加 `/systemManage/*` alias(per Approach A、base-web example 分支無此呼叫)
- ❌ 不放寬 ROLE_ADMIN 對 `/authorization/assign-users` 的存取(per Q3、ROLE_SUPER-only)

---

## Naming / 編號

- Brainstorm doc:`docs/superpowers/025-feature-assign-users.md`(本檔)
- Spec 目錄:`specs/025-assign-users/`(`/speckit-specify` 產生)
- Feature branch:`025-assign-users`(`before_specify` pre-hook 產生)
- 新 Casbin migration:`migration/src/datas/m20260522_a_f8_assign_users_seed.rs`(日期排在最新 `m20260521` 之後)
