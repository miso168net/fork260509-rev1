# 030 — systemManage status/gender alignment

**Date**: 2026-05-21
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-21（F14 `design-a-to-b-cutover` 落地後,CDP 全功能巡檢抓到的 base-web↔rust-api 契約落差 follow-up；3 個釐清問題 + 1 個拆分決策）

> 無 time gate — DESIGN-A §6.1 全 14 feature 已於 F14 收尾,本 feature 為 DESIGN-B 形態下的一般 follow-up enhancement。

---

## 緣由

F14 cutover 後以 CDP（127.0.0.1:9229）對 base-web 做全功能巡檢:登入、dashboard、user/role/menu 三大管理頁、refresh 路由全部通暢,**但**抓到一個既有瑕疵 —

三張管理表的「狀態」欄全部空白,且 console 重複噴 `SyntaxError: 17`。定位:

- `SyntaxError: 17` = vue-i18n core 的 `INVALID_ARGUMENT`(error code 17)。
- 成因:rust-api 的 `/api/systemManage/getRoleList | getUserList | getMenuList/v2` 三端點,`status` 欄位回傳字串 enum **`"enabled"` / `"disabled"`**;base-web `Api.Common.EnableStatus` 型別只認 **`'1' | '2'`**,`enableStatusRecord` 以 `'1'/'2'` 為 key。
- base-web 表格 render:`if (row.status === null) return null;` 之後 `$t(enableStatusRecord[row.status])`。`"enabled"` 非 null → 通過 null-guard → `enableStatusRecord["enabled"]` = `undefined` → `$t(undefined)` → `INVALID_ARGUMENT`。

此瑕疵在 base-web `example` 分支自身 bundle,F14 全程 base-web 0 diff —— 是 base-web↔rust-api 既有的 enum 形態落差,**非 F14 引入**。屬 F7 `manage-crud-alignment` 同族(F7 已對齊 `menuType`/`iconType`,獨缺 `status`)。

巡檢另確認:`userGender` 欄位 rust 回 `null`,base-web render `if (row.userGender === null) return null;` **有 null-guard 攔截** → 空白 cell、**不報錯**。gender 欄空白是「該用戶無性別資料」的正常優雅處理,**不是 bug**。

---

## Brainstorm 釐清紀錄

- **Q1（範圍）**:要對齊哪些欄位?→ user 選「全面 enum 對齊掃揃」。掃揃結果:**只有 `status` 是壞的**;`menuType`/`iconType` F7 已對齊正常;`gender` 是無資料、非錯誤。
- **Q2（gender、前提有誤）**:當時基於「base-web render 無 null-guard」的錯誤前提詢問 gender 處理 → user 選「rust 補 gender 到 DB」。
- **更正**:複查 base-web render 後確認 **有 null-guard** —— gender(`null`)被攔截、不報錯。i18n 錯誤的**唯一**成因是 `status`(非 null 的無效值繞過 null-guard)。已向 user 更正此查證錯誤。
- **Q3（更正後範圍）**:基於更正事實重定 scope → user 選「status 修正 + gender 功能新增」。gender-to-DB 不再是「修 bug」,而是把目前永遠空白的 gender 欄變成真正可用欄位的**功能新增**。
- **拆分決策**:user 一度希望連 base-web create 表單的 gender 也端到端完善。但 base-web `example` 分支的 user 新增/編輯抽屜 `handleSubmit` 是**純 stub**(`// request` 留空、直接 `$message.success`),`system-manage.ts` 無任何 user 寫入 API。「完善 create」需改 base-web、跨越 Constitution IV「base 不改動」邊界,且本質是「完成整個 user CRUD feature」。→ 拍板**拆分**:本 feature 走純 rust-side、base-web 0 diff;**base-web user create/edit CRUD 端到端接線另開獨立 follow-up feature**(該 feature 須正式評估 Constitution IV 例外、走自己的 brainstorm)。

---

## Scope summary

本 feature = **systemManage 列表 enum 對齊** —— 純 rust-side、base-web 0 diff。兩部分:

| Part | 性質 | 內容 |
|---|---|---|
| **A — status 對齊** | bug fix | rust `Status` enum → base-web `EnableStatus`（`'1'/'2'`）映射,消除 vue-i18n `INVALID_ARGUMENT` |
| **B — gender 功能新增** | feature | rust 補 `sys_user.gender` 欄位,讓 base-web 既有性別 UI（表格欄、搜尋篩選）拿到真實資料 |

base-web 端的 gender UI（表格欄 + null-guard、搜尋面板 `userGender=` param、create 表單男/女 radio）**已完整存在** —— Part B 本質是「rust 補上欄位、讓 base-web 既有 UI 生效」,正是 rev1「後端適應 base」策略。

---

## 設計

### Part A — status 對齊

純 rust-side,改 `rust-api/server/model/src/admin/output/sys_system_manage.rs`:

- 新增 `fn map_status(Status) -> String`:`Enabled → "1"` / `Disabled → "2"` / `Banned → "2"`。`Banned` 為 base-web 無對應的概念 → 收斂為 `"2"`（非啟用態）並 `tracing::warn`,比照同檔既有 `map_icon_type` 的 unexpected-arm warn 慣例。`map_status` 為 total function。
- 三個 Output DTO —— `SystemManageRoleOutput` / `SystemManageUserOutput` / `SystemManageMenuOutput` —— 的 `pub status: Status` 改 `pub status: String`;對應三個 `From` impl 的 `status: m.status` 改 `status: map_status(m.status)`。

base-web-side 改（改 `EnableStatus` 型別）會違反 Constitution IV,不採。

### Part B — gender（rust-side）

採 **domain-typed** 方案（比照 `Status` 的建模方式,而非把展示值 `'1'/'2'` 直存 DB）:

| 元件 | 改動 |
|---|---|
| **migration**（新檔） | ① domain-typed `Gender`（`Male` / `Female`,比照 `Status` 的 PG enum 模型）② `sys_user` 加 `gender` 欄,**nullable**（base-web 型別為 `UserGender \| null`、表單非必填,null 為合法狀態）③ seed 3 個預設用戶（Soybean / Administrator / GeneralUser）gender,給混合值使男/女皆可見 |
| `sys_user` entity | 加 `gender: Option<Gender>` |
| `UserWithoutPassword` 中介模型 | 加 `gender` 欄（getUserList service 查詢需帶出） |
| `SystemManageUserOutput` | 加 `fn map_gender(Option<Gender>) -> Option<String>`（`Some(Male)→Some("1")` / `Some(Female)→Some("2")` / `None→None`);`From` impl 的 `user_gender: None`（既有硬寫值）改 `user_gender: map_gender(m.gender)` |
| `UserInput`（create/update 共用） | 加 `gender: Option<Gender>` 欄;create/update service 寫入 `sys_user.gender` |
| getUserList service | `userGender=` query param 接線（base-web 搜尋面板已送、目前 rust 忽略）→ 有值則 filter |

> `UserInput` 的 gender 寫路徑在 base-web `example` 分支**目前無 UI consumer**（create 抽屜是 stub）—— 納入本 feature 是為 rust API 自身完整（curl 可建帶 gender 的 user）、並為日後 base-web CRUD 接線 follow-up 鋪路。

### 錯誤處理

- `map_status` / `map_gender` 皆為 total function、無 panic 面。
- getUserList 的 `userGender` query 帶非法值 → 視為無篩選（不 500）。
- create/update 帶非法 `gender` → serde 反序列化階段即拒,走既有 `ValidatedForm` envelope。

### 測試 / 驗收

- **rust unit test**:`map_status`（3 variant 含 Banned）、`map_gender`（Male / Female / None）—— 純函式,比照 F7.2 `test_map_role_alias` precedent。（本 feature 有可測純函式面,依 CLAUDE.md §4「production logic → 寫測試」。）
- **migration 驗收**:migration apply 成功、`gender` 欄存在、seed row 在。
- **C-V 驗收**(curl + psql + CDP):
  - curl getRoleList / getUserList / getMenuList → `status` 值為 `"1"/"2"`。
  - curl getUserList → seeded user `userGender` 為 `"1"/"2"`;`userGender=` filter 生效。
  - **CDP smoke 重跑** → base-web 三表狀態欄正常渲染、vue-i18n `INVALID_ARGUMENT` console error **歸零**。
- **三邊 scope**:base-web 0 diff、nestjs fork 0 diff。

### Commit 模型

純 rust-side → 兩段式 commit(per CLAUDE.md §4.1):rust-api worktree 1 commit（entity + migration + Output DTO + input DTO + service）+ outer 1 commit（rust-api SHA pin + spec docs）+ merge `--no-ff` + SHA fill follow-up。**有 migration**。

### Constitution Check（初判）

| Principle | 判定 | 理由 |
|---|---|---|
| I RBAC Fail-safe | PASS | 不碰 Casbin / enforce |
| II Soft Delete + Audit | PASS | migration 加欄、不碰軟刪/audit 路徑 |
| III 單一職責 / 禁 Forward | PASS | 純 rust 單後端、無服務間 forward |
| IV base 不改動邊界 | PASS | base-web 0 diff —— rust 補欄位讓 base 既有 UI 生效 |
| V 漸進收縮 | N/A | DESIGN-B 已生效,本 feature 非遷移範疇 |

---

## 範圍外

- ❌ **base-web 任何改動**（Constitution IV）—— 含 create 表單接線。
- ❌ **base-web user create/edit CRUD 端到端接線** —— 拆為獨立 follow-up feature(須評估 Constitution IV 例外、走自己的 brainstorm)。
- ❌ `menuType` / `iconType` —— F7 已對齊,本 feature 不動(僅於文件記錄已對齊)。
- ❌ base-web `EnableStatus` / `UserGender` 型別本身 —— 不改 base-web。
- ❌ `Status` enum 的 `Banned` 語意擴充 / base-web 加第 3 狀態 —— 本 feature 僅在序列化邊界把 `Banned` 收斂為 `"2"`。

---

## 待 `/speckit-specify` 後續釐清(brainstorm 已 saturated、列為 research 點)

- R-Q:`Gender` 採 PG enum type 抑或 text 欄位backed 的 Rust active enum —— 設計傾向比照 `Status`（PG enum）,確切實作於 `/speckit-plan` Phase 0 定。
- R-Q:`UserWithoutPassword` 中介模型與 getUserList service 查詢的確切改動點。
- R-Q:base-web create 送出的 user payload 欄位命名(`userName` vs `username` 等)現況 —— 影響 `UserInput` 的 gender 欄位 serde 命名;但因 base-web create 為 stub、無立即 consumer,本 feature 以 rust 慣例命名即可,確切對齊待 base-web CRUD follow-up feature。
- R-Q:3 個預設用戶的 gender seed 值(cosmetic、取混合值)。
