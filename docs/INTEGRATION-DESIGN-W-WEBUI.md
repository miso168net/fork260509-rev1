# DESIGN-W-WEBUI：base-web 管理後台 CRUD 接線（「base 不改動邊界」的受管例外軌道）

> 日期：2026-05-21
> 範圍：rev1 base-web（`fork260509-soybean-admin-base` 的 `example` 分支衍生 `rev1-admin-base-web`）管理後台操作表單 ↔ rust-api
> 性質：本檔為 **follow-up feature 軌道的範圍規劃**;與 [`DESIGN-A`](INTEGRATION-DESIGN-A-RUST-NESTJS.md) / [`DESIGN-B`](INTEGRATION-DESIGN-B-RUST-ONLY.md) / [`DESIGN-W-DEPLOYMENT`](INTEGRATION-DESIGN-W-DEPLOYMENT.md) 並列
> 與 DESIGN-B 的關係：W-WEBUI 是 DESIGN-B [§1.3「base 不改動邊界」](INTEGRATION-DESIGN-B-RUST-ONLY.md)的**受管例外軌道** —— DESIGN-B 主體不變,W-WEBUI 是其上明文授權、範圍受控的 base-web 修改軌道(體例類比 DESIGN-A 的 W-FA track-a 部署軌)
> 觸發：F14 cutover + F030 `systemManage status/gender alignment` 後,對 base-web 的全功能稽核(2026-05-21)發現管理後台的操作表單幾乎全是未接線的 UI stub

---

## §1 軌道定位與原則

### §1.1 W-WEBUI 是什麼

base-web 來源是 soybean-admin 的 `example` 分支 —— 一個 starter / demo 專案。它的列表頁(user / role / menu)有完整表格 UI,但**新增 / 編輯 / 刪除等操作表單的 `handleSubmit` 全是 stub**:只跳成功訊息、關抽屜,不打任何後端 API。

rev1 整合至今(DESIGN-A F1–F14 + DESIGN-B 形態 + F030)的策略是「後端適應 base、base 前端不動」。這條策略讓 base-web 的**讀路徑**(登入、動態 menu、各列表 GET)完全跑通,但**寫路徑**從未被觸碰 —— 管理後台目前是「看得到、改不了」。

**W-WEBUI 軌道 = 把 base-web 管理後台從 UI 殼補成可用 CRUD。** 這必然要修改 base-web 前端程式碼,因此本軌道是 DESIGN-B §1.3 的明文例外。

### §1.2 受管例外:base-web 修改授權

DESIGN-B §1.3「base 不改動邊界」**維持為預設原則** —— 一般 feature 仍不得改 base-web。W-WEBUI 是其上的受管例外:

- W-WEBUI 軌道內的 feature **被明文授權修改 base-web**,但範圍受控(見 §4)。
- 修改僅限「補接線」性質:把既有 stub `handleSubmit` 接到 service API、補 service function、接 list 頁的 delete handler。**不**改型別定義、表格 render、router、store、設計風格。
- base-web 修改一律走 worktree 兩段式 commit(CLAUDE.md §6.1)—— 與 rust-api 改動同等紀律。

### §1.3 Constitution IV 的處理

`.specify/memory/constitution.md` Principle IV「base 不改動邊界」目前是硬性原則,歷來每個 feature 的 Constitution Check 都驗證 base-web 0 diff。W-WEBUI 軌道會讓這個檢查項**首次合法地不通過**。

**處理方式**:W-WEBUI 軌道啟動前,需要一個 Constitution Principle IV 的 amendment 或正式例外登記 —— 把「W-WEBUI 軌道內的 feature 得在 §4 受控範圍內修改 base-web」寫進 constitution(或其例外條款)。**本設計文件不擅自改 constitution**;此為 W-WEBUI 第一個 feature(W-FW1)啟動前的前置動作,由 `/speckit-constitution` 處理。

> 在該 amendment 落地前,W-FW1–W-FW4 的 spec-kit Constitution Check 會卡在 Principle IV。這是預期的 gate,不是錯誤。

---

## §2 現況盤點（2026-05-21 稽核）

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

### §2.1 14 個業務 stub 表單

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

### §2.2 與 DESIGN-B §4.2「抽離項清單」的區別

DESIGN-B §4.2 的「抽離項清單」(`sendCaptcha` / `verifyCaptcha` / `/auth/error` / `batchDeleteUser` / `/mock/getLastTime`)指的是**後端 stub** —— rust-api 端回固定/簡化回應,由 F9/F11 交付。

W-WEBUI 處理的是**另一個 gap**:base-web **前端表單**本身沒接線。兩者正交 —— 例如 `batchDeleteUser` 後端早由 F9 補齊(§2.1 #3 標 ✅),但前端 `handleBatchDelete` 至今仍是 stub。W-WEBUI 補的是前端那一半。

---

## §3 範圍

### §3.1 涵蓋（11 個 manage 模組表單）

§2.1 的 #1–#11 —— User CRUD、Role CRUD、Menu CRUD、角色菜單授權、角色按鈕授權。以**前端接線為主**,加少量後端(`/systemManage/` 寫入 alias、Casbin seed、授權端點查證)。

### §3.2 明確排除

- **登入類 3 個**（§2.1 #12–#14:驗證碼登入 / 註冊 / 重設密碼）—— rust-api 需先補真實業務端點(目前僅 F11 stub);這是「後端先行」性質、與 W-WEBUI 的「前端接線」性質不同,**另立 follow-up**。
- **`pro-naive/` 5 個元件展示頁** —— soybean-admin 的元件 demo,非 rev1 業務功能,永久排除。
- **不改** base-web 的型別定義、表格 render 邏輯、`src/router`/`src/store`、`.env`、設計風格。

---

## §4 base-web 修改範圍邊界

W-WEBUI 軌道內的 feature,base-web 修改**僅限**以下三類檔案:

| 准動 | 性質 |
|---|---|
| `src/service/api/system-manage.ts` | 補寫入 service function（`addX`/`updateX`/`deleteX`/`batchDeleteX`），比照同檔既有 GET function 體例 |
| `src/views/manage/**/modules/*-operate-*.vue` | 把 stub `handleSubmit` 接到上述 service function;送出參數、處理成功/失敗、`emit('submitted')` 觸發列表 refresh |
| `src/views/manage/**/index.vue` | 把 stub `handleDelete` / `handleBatchDelete` 接到 service function |
| `src/views/manage/role/modules/{menu,button}-auth-modal.vue` | 把寫死假資料的 `getChecks`/`getHome`/`getAllButtons` 換成真 GET;`handleSubmit` 接授權 POST |

**不准動**:型別(`src/typings/`、`Api.SystemManage.*`)、表格 column render、`src/router`、`src/store`、i18n key、`.env`、UI 樣式。若接線過程發現需要動到這些,停下來、當作 spec 的 open question 升級處理,不擅自擴大。

**既有後端行為沿用**:rust-api 的 audit log、soft delete、Casbin enforce 在這些寫入端點上已就位(F3/F2.1/F7 交付),W-WEBUI 不碰這些路徑 —— 只是讓 base-web 真的去呼叫它們。

---

## §5 Feature 切分（W-FW1 ~ W-FW4）

4 個 feature,各自走 spec-kit `/speckit-specify` → `plan` → `tasks` → `implement`、CDP 驗收。

### §5.1 W-FW1 `user-crud-wiring`

- **範疇**:`manage/user` 的 新增/編輯 drawer + 刪除 + 批次刪除,接 `/systemManage/{addUser,updateUser,deleteUser,batchDeleteUser}`。
- **後端分量**:**零** —— 4 個 alias 端點 F9 已交付、F030 已補 `gender` 寫入。
- **前端改動**:`system-manage.ts` 補 4 個 service function;`user-operate-drawer.vue` `handleSubmit`;`user/index.vue` `handleDelete` / `handleBatchDelete`。
- **驗收方向**:CDP 走訪 `/manage/user`,建立/編輯/刪除 user,確認落 DB + 列表 refresh + audit log 寫入。
- **定位**:最單純(純前端接線),建議**第一個做** —— 確立 W-WEBUI 的接線模式(service function 體例、`handleSubmit` 寫法、錯誤處理、列表 refresh)供後續 feature 比照。

### §5.2 W-FW2 `menu-crud-wiring`

- **範疇**:`manage/menu` 的 新增/編輯/加子菜單 modal + 刪除 + 批次刪除。
- **後端分量**:**小** —— 補 `/systemManage/` 的 menu 寫入 alias（create / update / delete,F9-style thin wrapper 包既有原生 `/route/*`）+ Casbin seed migration。**一致性拍板**:base-web 三個 manage 模組(user / menu / role)寫入路徑統一走 `/systemManage/`,不走原生 `/route/*`。
- **前端改動**:`system-manage.ts` 補 menu 寫入 service function;`menu-operate-modal.vue` `handleSubmit`(已有 `getSubmitParams()` 備好參數);`menu/index.vue` delete handler。
- **驗收方向**:CDP 走訪 `/manage/menu`,CRUD menu,確認落 DB + 動態 menu 反映。

### §5.3 W-FW3 `role-crud-wiring`

- **範疇**:`manage/role` 的 新增/編輯 drawer + 刪除 + 批次刪除。
- **後端分量**:**小** —— 補 `/systemManage/` 的 role 寫入 alias（create / update / delete）+ Casbin seed migration（拍板:走 systemManage alias、與 User/Menu 一致,不走原生 `/role/*`）。
- **前端改動**:`system-manage.ts` 補 role 寫入 service function;`role-operate-drawer.vue` `handleSubmit`;`role/index.vue` delete handler。
- **驗收方向**:CDP 走訪 `/manage/role`,CRUD role,確認落 DB。
- **定位**:與 W-FW2 同為「alias + Casbin seed + 前端接線」pattern,**可與 W-FW2 平行**。

### §5.4 W-FW4 `role-authorization-wiring`

- **範疇**:角色菜單授權 modal + 角色按鈕授權 modal —— 含把目前寫死假資料的 `getChecks` / `getHome` / `getAllButtons` 換成真 GET、`handleSubmit` 接授權 POST。
- **後端分量**:**中** ——
  - 菜單授權:`/systemManage/getMenuTree`(全菜單樹）+ `/route/auth-route/:roleId`(角色現有授權）+ `/authorization/assign-routes`（儲存）大多已備,需確認 base-web modal 的資料形狀對齊。
  - 按鈕授權:base-web `getAllButtons` 目前寫死硬編陣列 —— rust-api 是否有「列出全部權限按鈕」的來源端點**待 Phase 0 research**;可能需補端點。
- **前端改動**:`menu-auth-modal.vue` + `button-auth-modal.vue` 的 `getChecks`/`getHome`/`getAllButtons`/`handleSubmit`/`updateHome`。
- **驗收方向**:CDP 對某 role 調整菜單/按鈕授權,確認 Casbin policy 變更生效(該 role 重新登入後 menu/權限反映)。
- **定位**:最複雜(依賴 research、牽涉 Casbin policy 寫入),建議**最後做**。

---

## §6 依賴與執行順序

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
```

- **前置**:Constitution Principle IV amendment / 例外登記(§1.3)—— W-FW1 啟動前完成。
- **W-FW1 先行**:純前端、零後端,確立 W-WEBUI 的接線模式與驗收手法,供 W-FW2/3/4 比照。
- **W-FW2 / W-FW3 可平行**:兩者皆為「補 `/systemManage/` 寫入 alias + Casbin seed migration + 前端接線」同型工作。
- **W-FW4 最後**:複雜度最高、需 Phase 0 research(按鈕授權來源端點)。
- 每個 feature 各自兩段式 commit(base-web worktree + rust-api worktree 視該 feature 後端分量而定 + outer)、CDP 驗收、merge 回 `rev1-admin-root`。

---

## 附錄：與其他 DESIGN 文件的關係

- **DESIGN-B** 仍是 rev1 現行架構權威;W-WEBUI 不改 DESIGN-B 的後端架構,只在其 §1.3 邊界上開一條受管例外軌。
- **DESIGN-W-DEPLOYMENT** 管部署形態(compose / nginx / TLS / port);W-WEBUI 與之正交,不碰部署。
- W-WEBUI 完成後,base-web 管理後台從「demo UI 殼」成為「可用管理後台」—— 這是 rev1 從「整合 starter」走向「自有產品」的一步,Constitution IV 的 amendment 正式承認了這個轉變。
