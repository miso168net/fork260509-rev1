# Feature Specification: 030 — systemManage status/gender alignment

**Feature Branch**: `030-systemmanage-status-gender-alignment`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "systemManage status/gender alignment — rust Status enum 映射成 base-web EnableStatus '1'/'2' 消除 vue-i18n INVALID_ARGUMENT;rust 補 sys_user.gender 欄位讓 base-web 既有性別 UI 生效。純 rust-side、base-web 0 diff。"

**Source**: [`docs/superpowers/030-feature-systemmanage-status-gender-alignment.md`](../../docs/superpowers/030-feature-systemmanage-status-gender-alignment.md)（brainstorming 2026-05-21 session — F14 cutover 後 CDP 全功能巡檢的 follow-up;3 個釐清問題 + 1 個拆分決策）

**Authoritative parents**:
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)：Principle IV「base 不改動邊界」— 本 feature 全程 base-web 0 diff、rust 補欄位讓 base 既有 UI 生效（rev1「後端適應 base」策略）。
- F7 `manage-crud-alignment`（merge `136b1eb`）：同族先例 — F7 已用 `map_menu_type` / `map_icon_type` 把 `menuType` / `iconType` 對齊 base-web `'1'/'2'`,獨缺 `status`。本 feature 補上 `status`、並比照其 mapping pattern。
- F14 `design-a-to-b-cutover`（merge `1f20a0d`）：F14 後對 base-web 的 CDP 全功能巡檢抓到本 feature 處理的 base-web↔rust-api enum 契約落差。

> 無 time gate — DESIGN-A §6.1 全 14 個 application feature 已於 F14 收尾,本 feature 為 DESIGN-B 形態下的一般 follow-up enhancement。

## Scope summary

本 feature = **systemManage 列表 enum 對齊** — 純 rust-side、base-web 0 diff。F14 後的 CDP 巡檢發現 base-web 三張管理表（user/role/menu）的「狀態」欄全部空白且 console 持續噴 vue-i18n `INVALID_ARGUMENT`（error code 17）。根因:rust-api 的 `systemManage` 列表端點 `status` 欄位回傳字串 enum `"enabled"/"disabled"`,base-web 型別只認 `'1'/'2'`。

| 面向 | deliverable |
|---|---|
| **status 對齊** | rust `Status` enum 經新增的 `map_status` 映射成 base-web `EnableStatus` 的 `'1'/'2'`;`systemManage` 三個 Output DTO 套用。消除 vue-i18n `INVALID_ARGUMENT`。 |
| **gender 欄位** | rust `sys_user` 補 `gender` 欄位（migration + entity + seed），`systemManage` user 列表回傳真實 `userGender`、支援 `userGender` 篩選,create/update 接受 `gender`。讓 base-web 既有性別 UI 拿到真實資料。 |

**範疇外**:
- ❌ 不改 `base-web/` 任何 file（Constitution IV）— 含 base-web 的 `EnableStatus` / `UserGender` 型別、表格 render、create 表單。
- ❌ base-web user create/edit CRUD 端到端接線（base-web 該抽屜目前是 stub）— 已於 brainstorm 拍板拆為**獨立 follow-up feature**,須各自評估 Constitution IV 例外。
- ❌ `menuType` / `iconType` — F7 已對齊,本 feature 不動。
- ❌ `Status` enum 定義本身、base-web 加第 3 狀態 — 本 feature 僅在序列化邊界把 `Banned` 收斂為 `"2"`。
- ❌ 無 nestjs 相關（DESIGN-B 形態,nestjs 已退場）。

## Clarifications

### Session 2026-05-21（brainstorming 階段拍板）

- **Q1（範圍）**: 要對齊哪些 enum 欄位?→ **A: 全面 enum 對齊掃揃**。掃揃結果:**只有 `status` 是壞的**;`menuType`/`iconType` F7 已對齊正常;`gender` 為無資料、非錯誤。
- **Q2（gender，前提有誤）**: 基於「base-web render 無 null-guard」的錯誤前提詢問 → A 選「rust 補 gender 到 DB」。
- **更正**: 複查 base-web render 後確認 user/role/menu 三表的 status/gender render **皆有 `if (row.X === null) return null;` null-guard**。`userGender` 為 `null` 時被攔截、不報錯 — gender 欄空白是「無性別資料」的正常優雅處理,**不是 bug**。vue-i18n 錯誤的**唯一**成因是 `status`:非 null 的無效值 `"enabled"` 繞過 null-guard、命中 `$t(record["enabled"])` = `$t(undefined)`。
- **Q3（更正後範圍）**: → **A: status 修正 + gender 功能新增**。gender-to-DB 改定位為「把永遠空白的 gender 欄變成真正可用欄位」的功能新增,非 bug fix。
- **拆分決策**: base-web 的 user create/edit 抽屜 `handleSubmit` 為純 stub（不打 API）、`system-manage.ts` 無 user 寫入 API。「完善 base-web create」需改 base-web、跨 Constitution IV 邊界且本質是「完成整個 user CRUD feature」→ 拍板**拆分**:本 feature 純 rust-side、base-web 0 diff;base-web user CRUD 端到端接線另開獨立 follow-up feature。本 feature 的 gender 寫路徑（`UserInput` 接 gender）僅為 rust API 自身完整,base-web example 分支暫無 UI consumer。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — status 對齊、消除 i18n 錯誤（Priority: P1）🎯 MVP

base-web 管理者開啟 user / role / menu 三張管理表時,「狀態」欄應正常顯示「啟用 / 禁用」標籤,瀏覽器 console 不應有 vue-i18n 錯誤。F14 之前,rust 回的 `status: "enabled"` 與 base-web 的 `'1'/'2'` 型別不符,導致狀態欄空白 + `INVALID_ARGUMENT` 錯誤洗版。本故事讓 rust 在 `systemManage` 三端點把 `Status` enum 映射成 base-web 期望的 `'1'/'2'`。

**Why this priority**: 這是本 feature 的核心 bug fix — 唯一造成 vue-i18n 錯誤、唯一讓使用者看到欄位破損的成因。修掉它即達成 MVP。

**Independent Test**: 改 `map_status` + 三個 Output DTO 後 rebuild rust image → curl `getRoleList`/`getUserList`/`getMenuList` 確認 `status` 為 `"1"/"2"` → CDP 重跑 base-web smoke,三表狀態欄渲染「啟用/禁用」標籤、console `INVALID_ARGUMENT` 歸零。

**Acceptance Scenarios**:

1. **Given** rust 已套用 `map_status`,**When** curl `GET /api/systemManage/getRoleList`,**Then** 回傳每筆 role 的 `status` 為字串 `"1"` 或 `"2"`(非 `"enabled"/"disabled"`)。
2. **Given** 同上,**When** curl `getUserList` 與 `getMenuList`,**Then** 各筆的 `status` 同為 `"1"/"2"`。
3. **Given** rust 已部署,**When** base-web 載入 `/manage/user`、`/manage/role`、`/manage/menu`,**Then** 三表「狀態」欄顯示「啟用/禁用」標籤、瀏覽器 console 無 vue-i18n `INVALID_ARGUMENT` 錯誤。
4. **Given** 一筆 DB `status` 為 `Banned` 的資料,**When** 經 `systemManage` 端點序列化,**Then** `status` 回傳 `"2"`(收斂為非啟用態)且 server log 有一筆 `warn`。

### User Story 2 — gender 欄位顯示與篩選（Priority: P2）

base-web 管理者在 user 管理表看「性別」欄、用搜尋面板的性別篩選時,應能看到 / 篩出真實性別資料。F14 之前 rust `sys_user` 無 gender 欄位、`systemManage` user DTO 硬回 `null`,性別欄永遠空白、性別篩選無效。本故事讓 rust 補上 `gender` 欄位,user 列表回傳真實 `userGender`、支援 `userGender` 篩選。

**Why this priority**: 把目前永遠空白 / 失效的 gender UI 變成可用;非 bug、不阻 MVP,但完成 base-web 既有性別 UI 的價值。

**Independent Test**: migration apply 後 → curl `getUserList` 確認 seed 用戶的 `userGender` 為 `"1"/"2"` → curl `getUserList?userGender=1` 確認只回男性用戶 → CDP 確認 base-web user 表性別欄顯示標籤、搜尋面板性別篩選生效。

**Acceptance Scenarios**:

1. **Given** migration 已 apply 且 seed,**When** curl `GET /api/systemManage/getUserList`,**Then** 預設用戶的 `userGender` 為 `"1"`(男)或 `"2"`(女),無性別資料者為 `null`。
2. **Given** 同上,**When** curl `getUserList?userGender=1`,**Then** 只回傳 `userGender` 為 `"1"` 的用戶。
3. **Given** rust 已部署,**When** base-web 載入 `/manage/user`,**Then** 性別欄對有性別的用戶顯示「男/女」標籤、對 `null` 者顯示空白(無錯誤)。

### User Story 3 — create/update 接受 gender（Priority: P3）

透過 rust API 建立或更新使用者時,應能設定其性別。本故事讓 rust 的 user create/update 輸入接受 optional `gender`、寫入 `sys_user.gender`。

**Why this priority**: 讓 gender 成為真正可寫的欄位、rust API 自身完整(否則 gender 僅能靠 migration seed、永遠唯讀)。base-web example 分支的 create 表單目前是 stub、無 UI consumer,故為 P3。

**Independent Test**: curl 建立一個帶 `gender` 的 user → curl `getUserList` 確認該 user `userGender` 反映所設值;curl 更新既有 user 的 `gender` → 確認變更生效。

**Acceptance Scenarios**:

1. **Given** rust create-user 端點接受 `gender`,**When** curl 建立帶 `gender:"1"` 的 user,**Then** 該 user 落 DB 的 `gender` 為男、`getUserList` 回 `userGender:"1"`。
2. **Given** 一個既有 user,**When** curl update 設其 `gender:"2"`,**Then** 變更持久化、`getUserList` 反映 `"2"`。
3. **Given** create/update 未帶 `gender`,**When** 執行,**Then** 該 user `gender` 為 `null`(欄位 optional、不破壞既有建立流程)。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | DB `status` 為 `Banned` | `systemManage` 序列化回 `"2"` + server `warn`;base-web 顯示為禁用標籤 |
| E-2 | user `gender` 為 `null` | `getUserList` 回 `userGender: null`;base-web null-guard 顯示空白、無錯誤 |
| E-3 | `getUserList?userGender=` 帶非法值(非 1/2) | 視為無篩選、回全部;不 500 |
| E-4 | create/update 帶非法 `gender` 值 | 反序列化階段即拒、回既有 validation envelope;不寫入 |
| E-5 | migration 重複套用 | idempotent — 不重複加欄、seed 不重複 |
| E-6 | 既有未經本 feature 的 user(無 gender) | gender 欄為 `null`、相容;不需 backfill |

## Requirements *(mandatory)*

### Functional Requirements

**A. status 對齊**

- **FR-001**: 系統 MUST 提供一個把 rust `Status` enum 映射為 base-web `EnableStatus`(`'1'/'2'`)字串的轉換:`Enabled → "1"`、`Disabled → "2"`、`Banned → "2"`。
- **FR-002**: 當 `Status` 為 `Banned`(base-web 無對應概念)被收斂為 `"2"` 時,系統 MUST 輸出一筆 `warn` 等級 log(比照 F7 `map_icon_type` 的 unexpected-arm warn 慣例)。
- **FR-003**: `systemManage` 的 role / user / menu 三個列表 Output DTO 的 `status` 欄位 MUST 序列化為 `"1"/"2"` 字串,不再序列化為 `"enabled"/"disabled"/"banned"`。
- **FR-004**: `GET /api/systemManage/getRoleList`、`getUserList`、`getMenuList/v2` 的回應 MUST 對每筆資料的 `status` 回 `"1"` 或 `"2"`。
- **FR-005**: status 映射 MUST 為零語意改變 — `"1"` 對應啟用、`"2"` 對應非啟用(disabled 或 banned);DB 儲存的 `Status` 值不變。

**B. gender 欄位**

- **FR-006**: `sys_user` 資料表 MUST 新增一個 `gender` 欄位,**可為 null**(無性別資料為合法狀態)。
- **FR-007**: `gender` MUST 為 domain-typed 列舉(語意值:男 / 女),比照 `Status` 既有的建模方式;base-web 的展示值 `'1'/'2'` 只存在於序列化邊界、不存入 DB。
- **FR-008**: 資料庫遷移 MUST 為 3 個預設用戶(Soybean / Administrator / GeneralUser)填入 gender 值(混合男女使兩種值皆可在 UI 觀察到)。
- **FR-009**: `GET /api/systemManage/getUserList` 回應 MUST 對每筆 user 回 `userGender`,值為 `"1"`(男)/`"2"`(女)/`null`。
- **FR-010**: `getUserList` MUST 支援 `userGender` 查詢參數篩選;帶 `"1"` 或 `"2"` 時只回對應性別的 user,帶空 / 非法值時視為無篩選。
- **FR-011**: rust 的 user create 與 update 輸入 MUST 接受 optional `gender`,並於建立 / 更新時寫入 `sys_user.gender`;未提供時該 user `gender` 為 `null`。

**C. 保留 / 範疇紀律**

- **FR-012**: 本 feature MUST NOT 改動 `base-web/` 內任何 file。
- **FR-013**: 本 feature MUST NOT 改動 base-web 的 `EnableStatus` / `UserGender` 型別定義或表格 render 邏輯。
- **FR-014**: 本 feature MUST NOT 改動 `menuType` / `iconType` 的既有映射(F7 已對齊)。
- **FR-015**: 本 feature MUST NOT 改動 rust `Status` enum 的定義,也 MUST NOT 為 base-web 引入第 3 種狀態值。

**D. commit / 驗收**

- **FR-016**: 本 feature commit 模式 = 兩段式(per CLAUDE.md §6.1):rust-api worktree 1 commit（entity + migration + Output DTO + input DTO + service）+ outer 1 commit（rust-api SHA pin + spec docs）+ merge `--no-ff` + SHA fill follow-up。
- **FR-017**: status 與 gender 的映射轉換 MUST 有 rust 單元測試覆蓋(`map_status` 涵蓋 Enabled/Disabled/Banned、`map_gender` 涵蓋 男/女/None),比照 F7.2 `test_map_role_alias` 慣例。
- **FR-018**: acceptance MUST 用 curl + psql + CDP browser smoke;CDP smoke MUST 驗證三表狀態欄正常渲染且 vue-i18n `INVALID_ARGUMENT` 錯誤歸零。

### Key Entities

- **`Status`（既有 rust enum）**: rust 既有的啟用狀態列舉,3 值 `enabled` / `disabled` / `banned`。本 feature 不改其定義,僅在 `systemManage` 序列化邊界映射為 base-web 的 `'1'/'2'`。
- **`EnableStatus`（base-web 既有型別）**: base-web 的啟用狀態型別,僅 `'1' | '2'`。本 feature 不改;rust 適應之。
- **`gender`（新增）**: `sys_user` 的新欄位,domain-typed 列舉(男 / 女),可為 null。對應 base-web 既有的 `UserGender` 型別(`'1' | '2'`)。
- **`map_status` / `map_gender`（新增轉換）**: `systemManage` Output DTO 的序列化邊界轉換函式,把 rust domain 值映射為 base-web 展示值;為純函式、有單元測試。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: base-web 載入 user / role / menu 三張管理表時,瀏覽器 console 的 vue-i18n `INVALID_ARGUMENT` 錯誤數為 **0**(F14 後巡檢為每次 reload 數十筆)。
- **SC-002**: base-web 三張管理表的「狀態」欄對每筆資料顯示「啟用 / 禁用」標籤,不再空白。
- **SC-003**: `systemManage` 三個列表端點回應的 `status` 欄位值 100% 為 `"1"` 或 `"2"`。
- **SC-004**: base-web user 管理表的「性別」欄對有性別資料的 user 顯示「男 / 女」標籤;搜尋面板的性別篩選能正確篩出對應性別的 user。
- **SC-005**: 透過 rust API 建立 / 更新 user 時可設定其 gender,設定後於 user 列表正確反映。
- **SC-006**: 本 feature 不改動 `base-web/`(`git diff` 無輸出)、不改動 nestjs fork 源碼。
- **SC-007**: status / gender 的映射轉換有單元測試、且測試通過。
- **SC-008**: 既有(本 feature 前建立的)user 在新增 gender 欄後仍可正常讀取,gender 為 `null`、不需資料 backfill。

## Assumptions

- **A-001**: base-web `example` 分支 user / role / menu 三表的 status / gender render 皆含 `if (row.X === null) return null;` null-guard(brainstorm 已查證)— 故 `null` 值優雅顯示空白、不報錯;vue-i18n 錯誤僅由非 null 的無效值(`status` 的 `"enabled"` 等)造成。
- **A-002**: base-web 的 `userGender` 型別為 `UserGender | null`、create 表單性別欄非必填 — gender 為 `null` 是 base-web 端合法且已處理的狀態。
- **A-003**: base-web 經 `/api/systemManage/getUserList` 已送出 `userGender=` 查詢參數(搜尋面板既有),rust 目前忽略;本 feature 補上其篩選語意。
- **A-004**: F7 已使 `menuType` / `iconType` 對齊 base-web `'1'/'2'`(經 CDP 巡檢確認 menu 表類型欄正常顯示)— 本 feature 不需重做。
- **A-005**: base-web example 分支的 user create / edit 抽屜為 UI stub、不打真實 API — 故本 feature 的 gender 寫路徑無 base-web UI consumer,僅供 rust API 完整性與日後 base-web CRUD follow-up。
- **A-006**: 3 個預設用戶的具體 gender seed 值為 cosmetic(取混合值即可),不影響功能正確性。

## Dependencies

### Inbound（本 feature 依賴）

- **F7** `manage-crud-alignment`（merge `136b1eb`）：`systemManage` Output DTO + `map_menu_type` / `map_icon_type` mapping pattern 的來源。✅
- **F9** `systemManage-alias-router`（merge `b2f910c`）：`/api/systemManage/*` alias 端點(`getUserList` 等)。✅
- **F14** `design-a-to-b-cutover`（merge `1f20a0d`）：F14 後 CDP 巡檢為本 feature 的問題來源。✅

### Outbound（本 feature 解鎖 / 收尾）

- 收尾 base-web↔rust-api 的 systemManage enum 契約落差(F7 對齊系列的最後一塊 — `status`)。
- gender 欄位就位後,為日後「base-web user create/edit CRUD 端到端接線」follow-up feature 鋪路。

### Follow-up（本 feature 範疇外、留後續）

- base-web user create / edit CRUD 端到端接線(`system-manage.ts` 補寫入 API + 抽屜 `handleSubmit` 接線)— 獨立 feature,須評估 Constitution IV 例外。
