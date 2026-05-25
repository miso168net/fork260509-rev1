# DESIGN-W-BASE-WEB：base-web 改動 3 條受管例外軌道（W-WEBUI / TS-Typing-Sync / TS-DepGraph-Hygiene）

> **軌道權威**：本文件為 Constitution Principle IV「base 不改動邊界」**3 條受管例外軌道集合**的統一權威 doc（v1.6.0 起）。
> 軌道範圍變更 / 新 sprint 落地 / 邊界調整一律在此登記。
> 與 [`DESIGN-A`](INTEGRATION-DESIGN-A-RUST-NESTJS.md) / [`DESIGN-B`](INTEGRATION-DESIGN-B-RUST-ONLY.md) / [`DESIGN-W-DEPLOYMENT`](INTEGRATION-DESIGN-W-DEPLOYMENT.md) 並列。

**版本歷史**：
- v1.0（2026-05-21 隨 W-WEBUI 軌道首發建檔，原名 DESIGN-W-WEBUI.md）
- v2.0（2026-05-25 隨 049 sprint `git mv` rename + restructure 為 4 § umbrella + TS-Typing-Sync merge + TS-DepGraph-Hygiene 新加）

---

## §1 軌道總覽

DESIGN-W-BASE-WEB 為 Constitution Principle IV「base 不改動邊界」**3 條受管例外軌道集合**的統一權威 doc（v1.6.0 起）：

### §1.1 三軌道並列、互斥不重疊

| 軌道 | 範圍 | 動機 | 引入版本 |
|---|---|---|---|
| **W-WEBUI**（§2）| `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` / `src/locales/` wiring 範圍 | 管理後台 stub 接線、最小 UI 新增 | Constitution v1.1.0（2026-05-21）|
| **TS-Typing-Sync**（§3）| `src/typings/api/*.d.ts` only | TS↔rust wire 序列化型對齊 | Constitution v1.5.0（2026-05-25）|
| **TS-DepGraph-Hygiene**（§4）| build/dep config (Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json) | pnpm/node/Vite/TS 工具鏈 hygiene（依賴宣告齊全、版本 pin 一致、phantom dep elimination） | Constitution v1.6.0（2026-05-25）|

三軌道**範圍互斥不重疊**、跨軌道 feature 必須拆成 2 feature。

### §1.2 軌道辨識義務（plan-template 強制）

每個改 `base-web/` 的 feature 在 spec-kit `plan.md` Constitution Check 段 MUST 明示屬哪條軌道（或軌道外）；spec-kit `plan-template.md` Constitution Check 段含 4-選一軌道辨識條目強制（v1.6.0 起）。

### §1.3 與 Constitution Principle IV 的關係

Constitution Principle IV「base 不改動邊界」預設**禁動 base-web**、三條軌道為**唯一可動例外**（per `INTEGRATION-DESIGN-W-BASE-WEB.md` §2/§3/§4 嚴格範圍）；軌道外 feature 對 base-web 仍 MUST 0 diff。

---

## §2 W-WEBUI 軌道（base-web 管理後台 CRUD 接線）

### §2.1 軌道定位

base-web 來源是 soybean-admin 的 `example` 分支 —— 一個 starter / demo 專案。它的列表頁(user / role / menu)有完整表格 UI,但**新增 / 編輯 / 刪除等操作表單的 `handleSubmit` 全是 stub**:只跳成功訊息、關抽屜,不打任何後端 API。

rev1 整合至今(DESIGN-A F1–F14 + DESIGN-B 形態 + F030)的策略是「後端適應 base、base 前端不動」。這條策略讓 base-web 的**讀路徑**(登入、動態 menu、各列表 GET)完全跑通,但**寫路徑**從未被觸碰 —— 管理後台目前是「看得到、改不了」。

**W-WEBUI 軌道 = 把 base-web 管理後台從 UI 殼補成可用 CRUD。** 這必然要修改 base-web 前端程式碼,因此本軌道是 DESIGN-B §1.3 / Constitution Principle IV 的明文例外。

**受管例外:base-web 修改授權**

Constitution Principle IV「base 不改動邊界」**維持為預設原則** —— 一般 feature 仍不得改 base-web。W-WEBUI 是其上的受管例外:

- W-WEBUI 軌道內的 feature **被明文授權修改 base-web**,但範圍受控(見 §2.3)。
- 修改僅限「補接線」性質:把既有 stub `handleSubmit` 接到 service API、補 service function、接 list 頁的 delete handler。**不**改型別定義、表格 render、router、store、設計風格。
- base-web 修改一律走 worktree 兩段式 commit(CLAUDE.md §4.1)—— 與 rust-api 改動同等紀律。

### §2.2 現況盤點（2026-05-21 稽核）

> **盤點基準**:稽核以 base-web 的 `example` 分支為基礎。執行對象為 `base-web/` worktree(`rev1-admin-base-web` 分支,從 `origin/example` 衍生)。`rev1-admin-base-web` 相對 `example` 僅多 4 個 commit(W-F2 Dockerfile / W-F3 nginx cache / F4 `.env` success code / branch-origin 紀錄),全為部署與設定檔;經 `git diff origin/example HEAD -- src/` 驗證 **`src/` 0 差異**。盤點對象(`src/views/**`、`src/service/api/`、`src/service-alova/` 等)全在 `src/` 底下,故本盤點等同於對 `example` 分支執行。

對 base-web `src/views/**` 全面稽核所有有提交動作的表單,共 **23 個**,分三類:

| 分類 | 數量 | 定義 |
|---|---|---|
| **A 已接線** | 3 | submit 真的打到 rust-api 既有端點 |
| **B mock 攔截** | 1 | 有呼叫 service,但 dev 走 mock adapter、prod 才打真 API |
| **C 純 stub** | 19 | submit handler 不打任何 API |

- **A（3）**:密碼登入(`/auth/login`)、user 列表搜尋(GET)、role 列表搜尋(GET)。
- **B（1）**:`alova/scenes` 的驗證碼表單(dev 被 mock adapter 攔截)。
- **C（19）**:其中 **5 個是 `src/views/pro-naive/` 的元件展示頁**(ProForm / ProSearchForm / 可編輯表格等,純前端 demo,**非業務功能**);其餘 **14 個是業務操作表單**。

#### §2.2.1 14 個業務 stub 表單

| # | 表單位置 | 操作 | rust-api 端點現況 |
|---|---|---|---|
| 1 | `manage/user/modules/user-operate-drawer.vue` | 新增/編輯 user | ✅ `/systemManage/{addUser,updateUser}` 已存在 |
| 2 | `manage/user/index.vue` | 刪除 user | ✅ `/systemManage/deleteUser` 已存在 |
| 3 | `manage/user/index.vue` | 批次刪除 user | ✅ `/systemManage/batchDeleteUser` 已存在(F9 交付) |
| 4 | `manage/role/modules/role-operate-drawer.vue` | 新增/編輯 role | ⚠️ 原生 `/role/*` 存在;`/systemManage/` 無 role 寫入 alias |
| 5 | `manage/role/index.vue` | 刪除 role | ⚠️ 同上 |
| 6 | `manage/role/index.vue` | 批次刪除 role | ⚠️ 同上 |
| 7 | `manage/role/modules/menu-auth-modal.vue` | 角色菜單授權儲存 | ⚠️ `/route/auth-route/:roleId`(GET）+ `/authorization/assign-routes`(POST）存在;前端連 `getChecks`/`getHome` 都是寫死假資料 |
| 8 | `manage/role/modules/button-auth-modal.vue` | 角色按鈕授權儲存 | ⚠️ 前端 `getAllButtons`/`getChecks` 全寫死;後端「全部按鈕來源」端點待查 |
| 9 | `manage/menu/modules/menu-operate-modal.vue` | 新增/編輯/加子菜單 | ⚠️ 原生 `/route/*` 存在;`/systemManage/` 無 menu 寫入 alias |
| 10 | `manage/menu/index.vue` | 刪除 menu | ⚠️ 同上 |
| 11 | `manage/menu/index.vue` | 批次刪除 menu | ⚠️ 同上 |
| 12 | `login/modules/code-login.vue` | 驗證碼登入 | ❌ rust-api 無真實端點(僅 F11 stub) |
| 13 | `login/modules/register.vue` | 用戶註冊 | ❌ 同上 |
| 14 | `login/modules/reset-pwd.vue` | 重設密碼 | ❌ 同上 |

#### §2.2.2 與 DESIGN-B §4.2「抽離項清單」的區別

DESIGN-B §4.2 的「抽離項清單」(`sendCaptcha` / `verifyCaptcha` / `/auth/error` / `batchDeleteUser` / `/mock/getLastTime`)指的是**後端 stub** —— rust-api 端回固定/簡化回應,由 F9/F11 交付。

W-WEBUI 處理的是**另一個 gap**:base-web **前端表單**本身沒接線。兩者正交 —— 例如 `batchDeleteUser` 後端早由 F9 補齊(§2.2.1 #3 標 ✅),但前端 `handleBatchDelete` 至今仍是 stub。W-WEBUI 補的是前端那一半。

### §2.3 範圍

#### §2.3.1 涵蓋（11 個 manage 模組表單）

§2.2.1 的 #1–#11 —— User CRUD、Role CRUD、Menu CRUD、角色菜單授權、角色按鈕授權。以**前端接線為主**,加少量後端(`/systemManage/` 寫入 alias、Casbin seed、授權端點查證)。

#### §2.3.2 明確排除

- **登入類 3 個**（§2.2.1 #12–#14:驗證碼登入 / 註冊 / 重設密碼）—— rust-api 需先補真實業務端點(目前僅 F11 stub);這是「後端先行」性質、與 W-WEBUI 的「前端接線」性質不同,**另立 follow-up**。
- **`pro-naive/` 5 個元件展示頁** —— soybean-admin 的元件 demo,非 rev1 業務功能,永久排除。
- **不改** base-web 的型別定義、表格 render 邏輯、`src/router`/`src/store`、`.env`、設計風格。

#### §2.3.3 base-web 修改範圍邊界（硬邊界）

W-WEBUI 軌道內的 feature,base-web 修改**僅限**以下三類檔案:

| 准動 | 性質 |
|---|---|
| `src/service/api/system-manage.ts` | 補寫入 service function（`addX`/`updateX`/`deleteX`/`batchDeleteX`），比照同檔既有 GET function 體例 |
| `src/views/manage/**/modules/*-operate-*.vue` | 把 stub `handleSubmit` 接到上述 service function;送出參數、處理成功/失敗、`emit('submitted')` 觸發列表 refresh |
| `src/views/manage/**/index.vue` | 把 stub `handleDelete` / `handleBatchDelete` 接到 service function |
| `src/views/manage/role/modules/{menu,button}-auth-modal.vue` | 把寫死假資料的 `getChecks`/`getHome`/`getAllButtons` 換成真 GET;`handleSubmit` 接授權 POST |
| `src/views/manage/user/modules/user-operate-drawer.vue`（password 欄）、`src/views/user-center/index.vue`（修改密碼面板）| **W-FW5 amendment 例外（見下方）**：為接通既有後端密碼能力所必需的最小 UI 新增 |

**不准動**:型別(`src/typings/`、`Api.SystemManage.*`)、表格 column render、`src/router`、`src/store`、i18n key、`.env`、UI 樣式。若接線過程發現需要動到這些,停下來、當作 spec 的 open question 升級處理,不擅自擴大。

**既有後端行為沿用**:rust-api 的 audit log、soft delete、Casbin enforce 在這些寫入端點上已就位(F3/F2.1/F7 交付),W-WEBUI 不碰這些路徑 —— 只是讓 base-web 真的去呼叫它們。

> **§2.3.3 amendment（2026-05-22,W-FW5 `user-role-and-password-wiring`）**:W-WEBUI 軌道原則為「只接線、不改 UI」。W-FW5 的密碼 UX 需要兩處**為接通既有後端能力所必需的最小 UI 新增**,明文授權如下、**僅限 W-FW5**:
> - `user-operate-drawer.vue`:新增一個**選填 password 表單欄**(建立時設初始密碼 / 編輯時 admin 重設;留空則沿 W-FW1 既有行為)。
> - `user-center/index.vue`(現為 `<LookForward/>` stub):補成一個**最小「修改密碼」面板**(舊密碼 / 新密碼 / 確認新密碼欄)。
>
> 此放寬僅及「為接通既有後端能力所必需的最小 UI 新增」—— **不**及版面重構、**不**及非密碼功能(個人資料 / 頭像等)、**不**動 router / store / 型別。上方「不准動」清單其餘項續用。Constitution Principle IV 已於 2026-05-22 同步 amend 至 **v1.2.0**(W-WEBUI 軌道列舉擴至 `W-FW1`–`W-FW7`、准動範圍納入「§2.3.3 明文授權下必需的最小 UI 新增」;§2.3.3 為 base-web 准動範圍唯一細節權威)。依據:`docs/superpowers/035-feature-user-role-and-password-wiring.md` brainstorm Q1。

### §2.4 Feature 切分（W-FW1 ~ W-FW9）

> W-WEBUI 軌道 feature 切分歷史與權威登記點。新 W-FW 子項在此 § 登記。

#### §2.4.1 W-FW1 `user-crud-wiring`

- **範疇**:`manage/user` 的 新增/編輯 drawer + 刪除 + 批次刪除,接 `/systemManage/{addUser,updateUser,deleteUser,batchDeleteUser}`。
- **後端分量**:**零** —— 4 個 alias 端點 F9 已交付、F030 已補 `gender` 寫入。
- **前端改動**:`system-manage.ts` 補 4 個 service function;`user-operate-drawer.vue` `handleSubmit`;`user/index.vue` `handleDelete` / `handleBatchDelete`。
- **驗收方向**:CDP 走訪 `/manage/user`,建立/編輯/刪除 user,確認落 DB + 列表 refresh + audit log 寫入。
- **定位**:最單純(純前端接線),建議**第一個做** —— 確立 W-WEBUI 的接線模式(service function 體例、`handleSubmit` 寫法、錯誤處理、列表 refresh)供後續 feature 比照。

#### §2.4.2 W-FW2 `menu-crud-wiring`

- **範疇**:`manage/menu` 的 新增/編輯/加子菜單 modal + 刪除 + 批次刪除。
- **後端分量**:**小** —— 補 `/systemManage/` 的 menu 寫入 alias（create / update / delete,F9-style thin wrapper 包既有原生 `/route/*`）+ Casbin seed migration。**一致性拍板**:base-web 三個 manage 模組(user / menu / role)寫入路徑統一走 `/systemManage/`,不走原生 `/route/*`。
- **前端改動**:`system-manage.ts` 補 menu 寫入 service function;`menu-operate-modal.vue` `handleSubmit`(已有 `getSubmitParams()` 備好參數);`menu/index.vue` delete handler。
- **驗收方向**:CDP 走訪 `/manage/menu`,CRUD menu,確認落 DB + 動態 menu 反映。

#### §2.4.3 W-FW3 `role-crud-wiring`

- **範疇**:`manage/role` 的 新增/編輯 drawer + 刪除 + 批次刪除。
- **後端分量**:**小** —— 補 `/systemManage/` 的 role 寫入 alias（create / update / delete）+ Casbin seed migration（拍板:走 systemManage alias、與 User/Menu 一致,不走原生 `/role/*`）。
- **前端改動**:`system-manage.ts` 補 role 寫入 service function;`role-operate-drawer.vue` `handleSubmit`;`role/index.vue` delete handler。
- **驗收方向**:CDP 走訪 `/manage/role`,CRUD role,確認落 DB。
- **定位**:與 W-FW2 同為「alias + Casbin seed + 前端接線」pattern,**可與 W-FW2 平行**。

#### §2.4.4 W-FW4 `role-authorization-wiring`

- **範疇**:角色菜單授權 modal + 角色按鈕授權 modal —— 含把目前寫死假資料的 `getChecks` / `getHome` / `getAllButtons` 換成真 GET、`handleSubmit` 接授權 POST。
- **後端分量**:**中** ——
  - 菜單授權:`/systemManage/getMenuTree`(全菜單樹）+ `/route/auth-route/:roleId`(角色現有授權）+ `/authorization/assign-routes`（儲存）大多已備,需確認 base-web modal 的資料形狀對齊。
  - 按鈕授權:base-web `getAllButtons` 目前寫死硬編陣列 —— rust-api 是否有「列出全部權限按鈕」的來源端點**待 Phase 0 research**;可能需補端點。
- **前端改動**:`menu-auth-modal.vue` + `button-auth-modal.vue` 的 `getChecks`/`getHome`/`getAllButtons`/`handleSubmit`/`updateHome`。
- **驗收方向**:CDP 對某 role 調整菜單/按鈕授權,確認 Casbin policy 變更生效(該 role 重新登入後 menu/權限反映)。
- **定位**:最複雜(依賴 research、牽涉 Casbin policy 寫入),建議**最後做**。

> W-FW1~W-FW4 完成後（2026-05-22，4 feature 全 merge 回 `rev1-admin-root`），各 feature 在 brainstorm / implement / review 階段累積出 **7 個 follow-up 工作項**（INTEGRATION-CHECKLIST 原列為 W-FW1-N1 / N2、W-FW2-N1、W-FW3-N1、W-FW4-N1 / N2 / N3）。下方 §2.4.5~§2.4.8 把這 7 項整併為 **4 個 coherent feature**（W-FW5 / W-FW6 / W-FW7 / W-FW9），作為後續 `/speckit-specify` 開 `NNN-<feature-name>` 的依據。

W-WEBUI 受管例外（Constitution Principle IV，**v1.2.0 起**）涵蓋 W-FW5~W-FW7 的 base-web 修改 —— v1.2.0（2026-05-22）把軌道列舉自 `W-FW1`–`W-FW4` 擴至 `W-FW1`–`W-FW7`、並把准動範圍納入「§2.3.3 明文授權下必需的最小 UI 新增」；§2.3.3 base-web 修改範圍邊界（含其 amendment）續用。W-FW6 / W-FW7 另含 rust-api schema 變更（role 表 / `sys_menu` 表）—— 屬 rust-api 側、不受 §2.3.3 base-web 邊界約束，仍須各自走 spec-kit Constitution Check。

#### §2.4.5 W-FW5 `user-role-and-password-wiring`

- **整併**：W-FW1-N1（user→roles 指派）+ W-FW1-N2（password UX）。
- **範疇**：補完 W-FW1 未做的 user 管理兩塊 ——
  - **user→roles 指派**：base-web user drawer 的角色多選欄接線（讀 user 現有 roles + 寫）；rust-api 補 user→roles 寫入路徑 + Casbin `g` rule 同步（`SystemManageUserOutput.user_roles` 現硬寫 `vec![]`、rust 無 user→roles 寫入路徑）。
  - **password UX**：建立時設密碼 / admin 重設 / user 自改；連帶修 `update_user` password 未 hash 的 pre-existing TODO。
- **後端分量**：中 —— user-role 寫入 + Casbin `g` rule 同步；password hash 修正（pre-existing bug）。
- **前端改動**：`user-operate-drawer.vue` 角色多選欄 + password 欄接線；`system-manage.ts` 對應 service function。
- **定位**：把 user 管理從「W-FW1 的 CRUD」補成「完整可用」。W-FW1 spec FR-016 當時明示「userRoles 提交後端忽略」—— 解除此限制即 W-FW5 主要交付。

#### §2.4.6 W-FW6 `role-authorization-completion`

- **整併**：W-FW4-N1（button-auth modal）+ W-FW4-N2（role 首頁持久化）+ W-FW4-N3（`assign_routes` audit gap）+ W-FW3-N1（role code 安全改名）。
- **範疇**：補完 W-FW4 未做的 role 授權部分 + 連帶 RBAC 正確性收尾 ——
  - **button-auth modal**：`getAllButtons` / `getChecks` 換真 GET、`handleSubmit` 接授權 POST。**需 Phase 0 research**：rust-api 是否有「全部權限按鈕來源」端點、「UI 按鈕 vs API 端點」語意如何對齊（可能需補端點）。
  - **role 首頁持久化**：`menu-auth-modal` 的角色首頁選單 —— 需 rust-api role 資料表結構變更 + 讀寫端點。
  - **`assign_routes` audit gap**：native `assign_routes` 補寫 `sys_operation_log`（W-FW4 thin wiring 未補的 pre-existing native gap）。
  - **role code 安全改名**：rust `update_role` 改 code 時重同步 `casbin_rule`（`v0`）+ base-web roleCode edit 唯讀（W-FW3 採 transform-layer code-lock 為過渡機制）。
- **後端分量**：大 —— button 來源 research + 可能新端點、role 表 schema 變更、native audit 補寫、casbin `v0` 重同步。
- **前端改動**：`button-auth-modal.vue` + `menu-auth-modal.vue` 的 `getAllButtons` / `getChecks` / `getHome` / `updateHome` / `handleSubmit`；`role-operate-drawer.vue` roleCode 欄唯讀；`system-manage.ts` 對應 service function。
- **定位**：W-WEBUI 軌道收尾最複雜的 feature。brainstorm 階段須認真評估是否仍需細分 —— 尤其 button-auth 的 Phase 0 research 結果若顯示工作量過大，得再行拆分。

#### §2.4.7 W-FW7 `menu-field-persistence`

- **整併**：W-FW2-N1（menu `query` / `buttons` / `fixedIndexInTab` 持久化）。
- **範疇**：base-web `menu-operate-modal` 已有的 `query` / `buttons` / `fixedIndexInTab` UI 欄位目前送出後不被持久化 —— 補 `sys_menu` schema + entity + `MenuInput` / Output DTO、讀寫雙向接通。
- **後端分量**：大 —— `sys_menu` schema migration + entity + 雙向 DTO。
- **前端改動**：`menu-operate-modal.vue` 把既有 UI 欄位納入送出參數；`system-manage.ts`（若需要）。
- **定位**：純 schema 擴充類 feature，與 W-FW5 / W-FW6 不相干、可獨立排程。
- **open question（brainstorm Phase 0 處理）**：讀回這些欄位是否需動 `Api.SystemManage.Menu` 型別（§2.3.3 不准動 `src/typings`）—— starter UI 已含這些欄位、型別宣告可能已具備，brainstorm 查證；若確需動型別則升級為 spec open question。

#### §2.4.8 W-FW9 `wire-id-consistency`（040 落地、Constitution v1.4.0 dynamic 授權首次案例）

- **整併**：039 `rust-entity-id-numeric-migration` 落地後外顯 3 個遺留 + 032 留下的 parentId deserializer workaround：
  - **A critical 修**：base-web 2 modal（`button-auth-modal.vue` + `menu-auth-modal.vue`）body 內 `roleId: String(props.roleId)` 撞 039 後 rust DTO `i64`（serde "expected i64 got string"）—— `src/service/api/system-manage.ts` 4 處 inline type annotation 從 `string` 改 `Api.SystemManage.Role['id']`、2 modal 拿掉 `String(...)`；TS compile gate。
  - **B URL path String() 餘料**：A 副產品、4 處 cosmetic `String(...)` 自然消（template literal 自動轉）。
  - **C 拆 032 parentId deserializer workaround**（軌道**外**、rust-only）：`server/model/src/admin/input/sys_menu.rs` 內 `deserialize_i32_or_string` 函式 + `SystemManageAddMenuInput.parent_id` + `SystemManageUpdateMenuInput.parent_id` `serde(deserialize_with = ...)` 屬性全拆，base-web typings 已 number-only 安全。
  - **D raw endpoint wire DTO wrap**（軌道**外**、rust-only）：為 sys_role / sys_user / sys_access_key 新增 `RoleDetail` / `UserDetail` / `AccessKeyDetail` 3 wire DTO + handler `.map(Detail::from)` wrap、wire 上 `id: i64` from `display_id`、無 `id: ULID-string` + `displayId: i64` 重複欄位；Sea-ORM Model 0 改動(internal SoT 完整保留)。
- **後端分量**：中 —— 7 rust 檔（1 deserializer drop + 3 output struct + 3 api handler）+ 0 schema migration、0 新 entity、0 input DTO 改動（039 T030.5 已完成）。
- **前端改動**：3 base-web 檔（service.ts + 2 modal）—— §2.3.3 邊界內。typings/api 0 改動（grep 證實 `*Params` 型在 typings 不存在、Param 全為 service.ts inline type）。
- **定位**：Constitution v1.4.0「DESIGN-W-WEBUI 文件權威 dynamic 模式」生效後**首次行使**—— 加 W-FW9 條目至本 §2.4 即取得授權、不需 Constitution amendment。混 W-WEBUI 軌道內（A+B base-web）+ 軌道外（C+D rust-only）；單 feature 內歸屬明示。
- **Acceptance summary（040 C-V matrix）**：C-V3/V4/V6 base-web cleanup PASS；C-V7/V8 parentId workaround PASS；C-V9/V11/V12 wire DTO wrap PASS；C-V15/V16/V17 039 alias regression PASS；C-V18/V19/V21/V22 039 internal SoT PASS；C-V23/V24/V27 scope discipline PASS；C-V1/V2 CDP smoke defer 同 039 慣例。

### §2.5 依賴與執行順序

```
Constitution IV amendment（前置,/speckit-constitution）
        │
        ▼
   W-FW1 user-crud-wiring（純前端,確立接線模式）
        │
        ├──────────────┐
        ▼              ▼
   W-FW2 menu-crud   W-FW3 role-crud   （可平行;同為 alias+Casbin seed pattern）
        │              │
        └──────┬───────┘
               ▼
   W-FW4 role-authorization-wiring（最後;依賴 Phase 0 research）
        │
        ▼
   W-FW5 user-role-and-password-wiring  ─┐
   W-FW7 menu-field-persistence         ─┤  三者互不相干、無強制順序
   W-FW6 role-authorization-completion  ─┘  （W-FW6 最複雜、含 research，建議獨立排）

   W-FW9 wire-id-consistency            ─── 039 落地後接著做、4 themes bundled
```

- **前置**:Constitution Principle IV amendment / 例外登記(§2.1) —— W-FW1 啟動前完成（Constitution v1.1.0 已 ratify）。
- **W-FW1 先行**:純前端、零後端,確立 W-WEBUI 的接線模式與驗收手法,供 W-FW2/3/4 比照。
- **W-FW2 / W-FW3 可平行**:兩者皆為「補 `/systemManage/` 寫入 alias + Casbin seed migration + 前端接線」同型工作。
- **W-FW4 最後**:複雜度最高、需 Phase 0 research(按鈕授權來源端點)。
- W-FW5/W-FW6/W-FW7 三個 feature 彼此無依賴，可依資源任意排序；W-FW6 含 Phase 0 research 與最大後端分量，建議獨立排。
- W-FW9 為 039 落地後的 wire-side consumer cleanup + 移除 historical workaround；先決條件 = 039 落地。
- 每個 feature 各自走 spec-kit 設計鏈（step 0 brainstorm → SDD → TDD）、兩段式 commit（W-FW9 為三段式：base-web + rust-api + outer）、CDP 驗收、merge 回 `rev1-admin-root`。

---

## §3 TS-Typing-Sync 軌道（base-web TS typing 對齊 rust wire 真實序列化型）

### §3.1 軌道定位

TS-Typing-Sync 為 Constitution Principle IV「base 不改動邊界」**v1.5.0 起新增的第二條受管例外軌道**（第一為 W-WEBUI 軌道、v1.1.0 引入）。

**軌道目的**：對齊 base-web TypeScript 宣告與 rust-api wire 真實序列化型；補回編譯期型別安全（TS lying-to-itself 修正）。

**觸發背景**：post-039 entity id migration（display_id i64 from Snowflake 53-bit）+ post-040 wire DTO 重新設計後、TS 與 rust wire 出現 type mismatch；W-WEBUI 軌道 FR-015 禁碰 `src/typings/` 無法修。設立 TS-Typing-Sync 為**第二受控軌道**、補回編譯期型別安全。

### §3.2 可動範圍（硬邊界、不擴張）

**可動**：
- **ONLY** `base-web/src/typings/api/*.d.ts`（含 `route.d.ts` / `system-manage.d.ts` / `common.d.ts` / `auth.d.ts` 等、未來新加 `typings/api/` 檔同此規則）

**嚴禁動**（typings 系列）：
- `typings/app.d.ts`
- `typings/router.d.ts`
- `typings/components.d.ts`
- `typings/elegant-router.d.ts`
- `typings/package.d.ts`
- `typings/vite-env.d.ts`
- `typings/global.d.ts`
- `typings/naive-ui.d.ts`
- `typings/storage.d.ts`
- `typings/union-key.d.ts`
- 其他未列出的 `typings/*.d.ts`

**嚴禁動**（W-WEBUI 軌道範圍）：
- `src/views/`
- `src/components/`
- `src/service*/api/*.ts`
- `src/service*/request/`
- `src/store/`
- `src/router/`
- `src/locales/`

### §3.3 動機限定

每個 sprint 必須**舉證** TS 宣告 vs rust wire 不一致（grep rust 對應 output struct 為證、spec.md 內 FR 明示對齊規格）。

**允許動作**：
- type alignment（type 改 / field rename / field add / field remove 以對齊 rust wire shape）
- JSDoc 註解補 non-obvious 語意（如 sentinel value / 兩種 id 並存等）

**不允許**：
- 純命名統一 / refactor 無 wire mismatch 證據
- 新增 runtime 型別 guard（zod / io-ts）— 屬另一軌道議題
- W-WEBUI 範圍 wiring / component 改

### §3.4 軌道成員（sprint 歷史）

#### §3.4.1 048 base-typings-sync（首發 sprint）

- **日期**：2026-05-25 落地
- **commit**：outer `b903ead` + merge `f2e2177` + base-web `4e05d478`
- **scope**：
  - **M1**: `Route.MenuRoute.id` 改 `string` → `number`（rust `i32` → JSON number）
  - **M2**: `Route.MenuRoute` 加 `pid: string`（rust `pid: String` 序列化但 TS 未宣告）
  - **M3**: `SystemManage.MenuTree.pId: number` → `pid: string`（rename + retype；rust camelCase `pid` lowercase + String type）
  - **D1**: `Common.CommonRecord.id` 加 JSDoc 說明 Snowflake 53-bit display_id
  - **D2**: `SystemManage.Menu.parentId` 加 JSDoc 說明 `0` = root sentinel
  - **D3**: `Auth.UserInfo.userId` 加 JSDoc 說明 ULID vs `User.id`（i64）兩種 id 表示
- **觸發**：030-034 W-WEBUI 軌道遺留型別債（FR-015 禁碰 typings 無法修）+ 039+040 wire DTO 變更後新 mismatch
- **acceptance**：C-V1~C-V9 全 PASS（含 CDP browser smoke 8 路徑）
- **spec**：[`specs/048-base-typings-sync/`](../specs/048-base-typings-sync/)

### §3.5 與其他軌道邊界

詳見 §1.1 三軌道並列 table；TS-Typing-Sync 與 W-WEBUI / TS-DepGraph-Hygiene 範圍**互斥不重疊**：

| 維度 | W-WEBUI（§2）| TS-Typing-Sync（§3）| TS-DepGraph-Hygiene（§4）|
|---|---|---|---|
| 可動 file | src/views/components/service/store/router/locales | src/typings/api/*.d.ts | Dockerfile / package.json / pnpm-workspace.yaml / .npmrc / packages/*/package.json / build/* |
| 動機 | UI 接線 | TS↔rust wire 對齊 | 工具鏈 hygiene |
| **不**動 | typings/ + build/dep config | views/components/service/etc. + build/dep config | src/ 任何檔 |

**Feature spec.md 軌道辨識義務**：每個改 base-web source 的 feature 在 Constitution Check 段必須明示屬哪條軌道；跨軌道需求必須拆成兩個 feature。

### §3.6 預期 sprint 模式

**非常駐軌道**：不定期觸發、觸發訊號驅動（rust wire shape 重大變動後）。

**預期頻率**：1-3 feature/year（per 042/043/046 spec hygiene 軌道體例）。

**典型觸發訊號**：
- rust entity id 制度重大變動（如 039 ULID → Snowflake i64 display_id migration）
- rust wire DTO 重新設計（如 040 RoleDetail/UserDetail/AccessKeyDetail 新增）
- 大規模 base-web upstream rebase 後撞 typing 不一致
- 新 rust entity 加 wire 端點且 TS 端缺對應 typing

**非觸發訊號**：
- 純後端 cleanup（→ spec-hygiene-pass 軌道）
- base-web stub 接線（→ W-WEBUI 軌道）
- 文件更新（→ docs 直接 commit）
- 純 npm dep 升級（→ chore commit）

---

## §4 TS-DepGraph-Hygiene 軌道（base-web build/dep config hygiene）

### §4.1 軌道定位

TS-DepGraph-Hygiene 為 Constitution Principle IV「base 不改動邊界」**v1.6.0 起新增的第三條受管例外軌道**（前兩條為 W-WEBUI v1.1.0 + TS-Typing-Sync v1.5.0）。

**軌道目的**：base-web 工具鏈（pnpm / node / Vite / TS / Dockerfile）build/dep config hygiene — 依賴宣告齊全、版本 pin 一致、phantom dep elimination、host + container 工具鏈紀律對齊。

**觸發背景**：pnpm 11 改 hoist 設定 location（`.npmrc shamefully-hoist=true` → `pnpm-workspace.yaml nodeLinker: hoisted`）、host vs container pnpm version drift、Dockerfile ARG vs package.json packageManager field 雙 source-of-truth 等紀律需求出現；setting `nodeLinker: hoisted` 雖修 048 期間 host build 但屬「向後相容急救」、長期應採 pnpm 11+ 預設 strict isolation + explicit devDeps + packageManager pin。

### §4.2 可動範圍（硬邊界、不擴張）

**可動**：
- `base-web/Dockerfile`
- `base-web/package.json`
- `base-web/pnpm-workspace.yaml`
- `base-web/.npmrc`
- `base-web/packages/*/package.json`
- `base-web/build/*`（vite plugins / build scripts、限 audit 觸發的 implicit any 等 type 註解、不含 logic 改動）

**嚴禁動**：
- `base-web/src/` 任何檔（views / components / typings / store / router / locales / service / 等）
- W-WEBUI 軌道範圍
- TS-Typing-Sync 軌道範圍

### §4.3 動機限定

每個 sprint 必須**舉證** build/dep config 紀律違反：
- phantom transitive use（import 來源未在 package.json 宣告）
- 雙 source-of-truth 版本 pin（如 Dockerfile ARG + host system 雙來源 pnpm version）
- pnpm major upgrade adjacency（如 pnpm 10 → 11 hoist 行為變、setting location 變）
- vue-tsc / vite build phantom resolution error
- 其他 pnpm/node/Vite/TS 工具鏈 hygiene 紀律違反

**允許動作**：
- explicit devDep declarations（提升 phantom transitive 為直接 devDeps）
- 版本 pin 一致化（packageManager field / Dockerfile ARG 合一）
- 工具鏈 config cleanup（如 vestige `.npmrc` 設定）
- 同檔 audit 順道修 implicit any 等 type 註解

**不允許**：
- src/ 任何 runtime feature 改動
- W-WEBUI 範圍 wiring 改
- TS-Typing-Sync 範圍 typing 改
- 純 dep refactor 無紀律證據

### §4.4 軌道成員（sprint 歷史）

#### §4.4.1 047.5 retrospective（048 sprint 期間的 cross-boundary env-repair commits）

- **日期**：2026-05-25（與 048 sprint 同期、retrospective 認定為 TS-DepGraph-Hygiene 軌道首兩筆）
- **commits**：
  - `d521c819` fix(base-web): pnpm-workspace.yaml 加 nodeLinker: hoisted（修 pnpm 11 hoist 失效）
  - `b4453385` fix(base-web): Dockerfile pnpm 10.18.0 → 11.0.8 + --ignore-scripts（修 host vs container pnpm version drift）
- **scope**：env-repair adjacent fixes、user 拍板 cross-boundary minimal
- **acceptance**：048 期間 C-V2/C-V3 從 baseline broken → 0 error、container `Up (healthy)`
- **spec**：N/A（無獨立 sprint spec、屬 048 implementer-stage cross-boundary fix）

#### §4.4.2 049 base-web-dep-hygiene（首發 sprint）

- **日期**：2026-05-25 落地
- **commit**：outer `b860cc6` + merge `cd5114f` + base-web `f6efe906`
- **scope**：
  - comprehensive audit grep base-web + packages 所有 phantom transitive use、提升為直接 devDeps
  - 移除 `nodeLinker: hoisted` from pnpm-workspace.yaml（回 pnpm 預設 strict isolation）
  - 移除 `shamefully-hoist=true` from .npmrc（vestige）
  - 加 `"packageManager": "pnpm@11.0.8"` 進 base-web/package.json
  - Dockerfile 簡化（remove `ARG PNPM_VERSION` + `corepack prepare`、改吃 packageManager field）
  - 順道修 `build/plugins/unocss.ts:24` implicit any（+1 line type 註解）
- **觸發**：048-N1 (a)+(b)+(c) follow-up 結案 + pnpm 11+ best practice 對齊
- **acceptance**：C-V1~C-V10 全 PASS（含 CDP browser smoke 8 路徑）
- **spec**：[`specs/049-base-web-dep-hygiene/`](../specs/049-base-web-dep-hygiene/)

#### §4.4.3 050 spec-hygiene-pass-4（post-merge review-derived hygiene、TS-DepGraph-Hygiene 軌道 dynamic 行使首例）

- **日期**：2026-05-25 落地
- **commit**：outer `3243fe6` + merge `dd872ce` + base-web `64af823b` + rust-api `1a7ef2a`
- **scope**：050 為 post-merge code review 衍生 comprehensive hygiene-pass、bundled 6 issues（5 Important + 1 Polish）：
  - **軌道內（TS-DepGraph-Hygiene §4 範圍）**：
    - 049-R1 base-web/Dockerfile line 35-42 stale comment block 改為「pnpm 11+ 預設 strict isolation 紀律 (per 049 FR-004/005)」描述（撤回 047.5 retro 期間 outdated hoisted reference + .npmrc shamefully-hoist=true 註解）
  - **軌道外（per 050 FR-001 sprint 全景列舉、由 spec.md 主管、非本軌道成員）**：
    - 036-R1 sys_menu partial update selective merge（`Option<Option<T>>` double-option DTO + service handler）
    - 037-R1 Casbin grouping rule (`ptype='g'`) defensive UPDATE + audit `g_rules_updated_count` + GeneralUser deny C-V
    - 044-R1 install prometheus pushgateway service (`prom/pushgateway:v1.10.0`) + cleanup binary recorder + scrape job
    - 044-R2 instrument middleware 改用 axum `MatchedPath` template route label（取代 raw URI path、cardinality 控制）
    - 046-R1 046 spec FR-015 wording generalized amend（base ≤3 + user 拍板可加大、commit msg 紀錄）
- **觸發**：050 sprint 為 post-merge code review 衍生 follow-up 結案載體（5 Important + 1 Polish bundled mixed sprint）；軌道內 049-R1 為其 Polish 條目
- **acceptance**：C-V1~C-V10 全 PASS（含軌道紀律 boundary verify、grep base-web/Dockerfile 確認 stale ref 清乾淨）
- **spec**：[`specs/050-spec-hygiene-pass-4/`](../specs/050-spec-hygiene-pass-4/)
- **軌道授權說明**：本 sprint 為 TS-DepGraph-Hygiene 軌道 **dynamic 文件權威首次行使**（per Constitution v1.6.0 既有設計、無需 amendment）—— 加本 §4.4.3 entry 至 DESIGN 文件即取得授權；同 W-FW9 對 DESIGN-W-WEBUI.md §7 dynamic 體例

### §4.5 與其他軌道邊界

詳見 §1.1 三軌道並列 table；TS-DepGraph-Hygiene 與 W-WEBUI / TS-Typing-Sync 範圍**互斥不重疊**（見 §3.5 三軌道對照 table）。

### §4.6 預期 sprint 模式

**非常駐軌道**：不定期觸發、觸發訊號驅動。

**預期頻率**：1-2 feature/year（pnpm 大版本升級或 dep tree 結構大變動觸發、比 TS-Typing-Sync 還少見）。

**典型觸發訊號**：
- pnpm major version upgrade（pnpm 10 → 11、未來 11 → 12 等）
- node/Vite/TS major version upgrade 撞 dep resolution 變動
- 大量 phantom transitive 累積撞 vue-tsc / vite build 錯誤
- Dockerfile / package.json / .npmrc / pnpm-workspace.yaml 等 config 出現 multi-source-of-truth 紀律違反

**非觸發訊號**：
- 純 npm dep 升級 patch/minor 版（→ chore commit）
- src/ feature 工作（→ W-WEBUI / TS-Typing-Sync 軌道）
- 文件更新（→ docs 直接 commit）
- 後端 cleanup（→ spec-hygiene-pass 軌道）

---

## 附錄：與其他 DESIGN 文件的關係

- **DESIGN-B** 仍是 rev1 現行架構權威;本檔的三軌道不改 DESIGN-B 的後端架構,只在其 §1.3 邊界上開三條受管例外軌道。
- **DESIGN-W-DEPLOYMENT** 管部署形態(compose / nginx / TLS / port);本檔三軌道與之正交,不碰部署。
- W-WEBUI 完成後,base-web 管理後台從「demo UI 殼」成為「可用管理後台」—— 這是 rev1 從「整合 starter」走向「自有產品」的一步,Constitution IV 的 amendment 正式承認了這個轉變。
- TS-Typing-Sync + TS-DepGraph-Hygiene 為「工具鏈紀律」軌道、補回 base-web 編譯期型別安全 + build/dep config 一致性。
