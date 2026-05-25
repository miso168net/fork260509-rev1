# Data Model: 048 base-typings-sync

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

048 為 base-web TS typing 對齊 rust wire 真實序列化型 + 同步 Constitution amendment + 新 DESIGN-W-TYPING-ALIGN 軌道權威文件、**無 application data entity 改動**（0 schema migration、0 rust DTO 改）；本檔以「typing diff + JSDoc + Constitution diff + DESIGN-W-TYPING-ALIGN 完整內容 + plan-template wording」取代傳統 entity 章節、per [plan.md Phase 1 outcomes](./plan.md)。

---

## E1. 4 處 typing edit complete diff（FR-001 / FR-002 / FR-003 / FR-004 / FR-005、per [research R-1 / R-2](./research.md)）

### E1.1 `base-web/src/typings/api/route.d.ts` — M1 + M2

**BEFORE**（現況）：

```typescript
declare namespace Api {
  /**
   * namespace Route
   *
   * backend api module: "route"
   */
  namespace Route {
    type ElegantConstRoute = import('@elegant-router/types').ElegantConstRoute;

    interface MenuRoute extends ElegantConstRoute {
      id: string;
    }

    interface UserRoute {
      routes: MenuRoute[];
      home: import('@elegant-router/types').LastLevelRouteKey;
    }
  }
}
```

**AFTER**：

```typescript
declare namespace Api {
  /**
   * namespace Route
   *
   * backend api module: "route"
   */
  namespace Route {
    type ElegantConstRoute = import('@elegant-router/types').ElegantConstRoute;

    interface MenuRoute extends ElegantConstRoute {
      /**
       * menu id (rust-api `sys_menu.id`, i32).
       * Serialized as JSON number; mismatch in pre-048 was `id: string`.
       */
      id: number;
      /**
       * parent menu id (rust-api `sys_menu.pid`, String column).
       * Serialized as JSON string under camelCase rule (`pid` stays lowercase).
       * Mismatch in pre-048: field was not declared on TS side at all.
       */
      pid: string;
    }

    interface UserRoute {
      routes: MenuRoute[];
      home: import('@elegant-router/types').LastLevelRouteKey;
    }
  }
}
```

**Diff 估計**：+8 line（JSDoc 註）/ -1 line（`id: string`）/ +2 line（`id: number` + `pid: string`）= 淨 +9 line。

### E1.2 `base-web/src/typings/api/system-manage.d.ts` — M3 + D2

**BEFORE**（現況 line 105-127 + line 132-137）：

```typescript
    type Menu = Common.CommonRecord<{
      /** parent menu id */
      parentId: number;
      /** menu type */
      menuType: MenuType;
      // ...其他欄位...
    }> &
      MenuPropsOfRoute;

    /** menu list */
    type MenuList = Common.PaginatingQueryRecord<Menu>;

    type MenuTree = {
      id: number;
      label: string;
      pId: number;
      children?: MenuTree[];
    };
```

**AFTER**：

```typescript
    type Menu = Common.CommonRecord<{
      /**
       * parent menu id (rust-api input DTO `parent_id: i32`).
       *
       * `0` = root menu sentinel — `menu-operate-modal.vue:137`
       * `model.value.parentId === 0` computes `showLayout` (root menu
       * picks layout, child menu picks page). DO NOT change sentinel
       * comparison logic without coordinated rust input DTO change.
       */
      parentId: number;
      /** menu type */
      menuType: MenuType;
      // ...其他欄位...
    }> &
      MenuPropsOfRoute;

    /** menu list */
    type MenuList = Common.PaginatingQueryRecord<Menu>;

    type MenuTree = {
      /**
       * menu node id (rust-api `MenuTree.id`, i32 from `sys_menu.id`).
       * Serialized as JSON number.
       */
      id: number;
      label: string;
      /**
       * parent menu id (rust-api `MenuTree.pid`, String column).
       * Serialized as JSON string under camelCase rule (`pid` stays lowercase).
       * Mismatch in pre-048: TS declared `pId: number` (name + type wrong).
       */
      pid: string;
      children?: MenuTree[];
    };
```

**Diff 估計**：M3（`pId: number` → `pid: string` + 5 line JSDoc）+ D2（Menu.parentId 上方 8 line JSDoc）= 淨 +13 line / -1 line = +12 line。

### E1.3 `base-web/src/typings/api/common.d.ts` — D1

**BEFORE**（line 35-48）：

```typescript
    /** common record */
    type CommonRecord<T = any> = {
      /** record id */
      id: number;
      /** record creator */
      createBy: string;
      // ...
    } & T;
```

**AFTER**：

```typescript
    /** common record */
    type CommonRecord<T = any> = {
      /**
       * record id.
       *
       * Post-039 (rust-entity-id-numeric-migration): rust-api wire 序列化為
       * i64 from `display_id` (Snowflake 41/5/7=53bit, by-design fills
       * `Number.MAX_SAFE_INTEGER` = 2^53-1). No precision loss in JS Number
       * representation. Applies to sys_user / sys_role / sys_endpoint /
       * sys_organization / sys_access_key 5 entities.
       *
       * Note: this is the wire-friendly numeric id, NOT the rust internal
       * ULID identity (see `Auth.UserInfo.userId` for the ULID variant).
       */
      id: number;
      /** record creator */
      createBy: string;
      // ...
    } & T;
```

**Diff 估計**：+9 line JSDoc / -1 line（既有 `/** record id */`）= 淨 +8 line。

### E1.4 `base-web/src/typings/api/auth.d.ts` — D3

**BEFORE**（line 13-18）：

```typescript
    interface UserInfo {
      userId: string;
      userName: string;
      roles: string[];
      buttons: string[];
    }
```

**AFTER**：

```typescript
    interface UserInfo {
      /**
       * user id (rust-api `UserInfoOutput.user_id: String`).
       *
       * This is the rust internal ULID identity (JWT subject, audit log
       * actor, internal references). Distinct from `User.id: number`
       * (i64 from `display_id`, wire-friendly numeric id used in CRUD
       * endpoints). Two id representations coexist by-design (rust SoT
       * = ULID, wire = display_id i64).
       */
      userId: string;
      userName: string;
      roles: string[];
      buttons: string[];
    }
```

**Diff 估計**：+9 line JSDoc = 淨 +9 line。

### E1.5 總計 base-web 改動行數

| 檔 | M/D | 估計 |
|---|---|---|
| `src/typings/api/route.d.ts` | M1 + M2 | +9 line |
| `src/typings/api/system-manage.d.ts` | M3 + D2 | +12 line |
| `src/typings/api/common.d.ts` | D1 | +8 line |
| `src/typings/api/auth.d.ts` | D3 | +9 line |
| **合計** | 6 處改動跨 4 檔 | **+38 line** |

略高於 spec.md scale/scope 估計（~25-30 line）—— JSDoc 詳述後實際行數略浮動、不違 FR-007。

---

## E2. Constitution v1.4.0 → v1.5.0 amendment full diff（FR-008、per [research R-3](./research.md)）

### E2.1 標頭區 wording（檔頭註解區）

```text
Version change: 1.4.0 → 1.5.0 (MINOR — 新增 TS-Typing-Sync 軌道受管例外)
Modified principles:
  - IV. base 不改動邊界 — 新增第二條受管例外軌道:
    (a) 既有「W-WEBUI 軌道」例外不變（仍不得動 typings/...）
    (b) 新增「TS-Typing-Sync 軌道」例外:
        - 軌道權威：docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md
        - 可動範圍：src/typings/api/*.d.ts (only)
        - 動機限定：對齊 rust wire 真實序列化型 (TS lying-to-itself 修正)
        - 仍不得動：typings/app.d.ts/router.d.ts/components.d.ts/elegant-router.d.ts/其他
        - 仍不得動：W-WEBUI 軌道範圍 (src/views/components/service/store/router)
        - 兩段式 commit 紀律同 W-WEBUI
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check 段加軌道辨識條目
  - ✅ docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md — 新文件
  - ✅ docs/INTEGRATION-CHECKLIST.md — Current Focus 加 TS-Typing-Sync 軌道條目
  - ✅ CLAUDE.md — §1 / §7 索引補
Follow-up TODOs: 無
```

### E2.2 §IV. base 不改動邊界 段落主體追加 wording

在既有 W-WEBUI 受管例外段（line ~95-102）**之後**追加：

```markdown
**受管例外 — TS-Typing-Sync 軌道**（v1.5.0 起）：第二條得修改 base-web source 的例外為 **TS-Typing-Sync 軌道**（[`docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](../../docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md)）：

- TS-Typing-Sync 軌道**整體**為受管例外；軌道權威為 [`INTEGRATION-DESIGN-W-TYPING-ALIGN.md`](../../docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md)
- 可動範圍**嚴格限定**於 `base-web/src/typings/api/*.d.ts`（即 `route.d.ts` / `system-manage.d.ts` / `common.d.ts` / `auth.d.ts` 等 4 檔，未來新增 typings/api/ 檔同此規則）
- 軌道目的：對齊 base-web TS 宣告與 rust-api wire 真實序列化型（TS lying-to-itself 修正、編譯期型別安全恢復）
- 動機限定：每個 feature 必須舉證「TS 宣告 vs rust wire 不一致」（grep rust 對應 output struct 為證、spec.md FR 內明示對齊規格）；純命名統一 / refactor 無 mismatch 證據者 reject
- **仍不得動**：`typings/app.d.ts` / `typings/router.d.ts` / `typings/components.d.ts` / `typings/elegant-router.d.ts` / `typings/package.d.ts` / `typings/vite-env.d.ts` / `typings/global.d.ts` / `typings/naive-ui.d.ts` / `typings/storage.d.ts` / `typings/union-key.d.ts` 等其他 typings/
- **仍不得動**：W-WEBUI 軌道範圍（`src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/`）；TS-Typing-Sync 軌道與 W-WEBUI 軌道**互斥不重疊**、feature spec.md 須明示屬哪條軌道
- TS-Typing-Sync 軌道對 base-web 的修改一律走兩段式 commit（base-web worktree → push fork → outer 更新 SHA pin），同 W-WEBUI 紀律
- 此例外**僅適用 TS-Typing-Sync 軌道**；軌道外所有 feature 的 Constitution Check 對 base-web source 改動仍 MUST 為 0 diff

**Rationale**：post-039 entity id migration（display_id i64 from Snowflake 53-bit）+ post-040 wire DTO 變更後、base-web 與 rust wire 真實型出現 type lie（如 `MenuRoute.id: string` vs rust 序列化 number）；W-WEBUI 軌道 FR-015 禁碰 `src/typings/` 無法修。設立 TS-Typing-Sync 為**第二受控軌道**、補回編譯期型別安全；非常駐軌道、觸發訊號驅動（rust wire shape 重大變動後）、預期 1-3 feature/year。
```

### E2.3 Version History 段加條目

於 Version History 區塊（檔頭附近、現有 1.0.0 → 1.4.0 條目下）加：

```markdown
- (2026-05-25) 1.4.0 → 1.5.0: 新增 TS-Typing-Sync 軌道受管例外
  (W-WEBUI 軌道之外的第二受控軌道、限 src/typings/api/*.d.ts、動機限定為對齊 rust wire 真實型)
```

### E2.4 同步更新 Version field（檔頭 line 1 附近）

```diff
- Version: 1.4.0
+ Version: 1.5.0
```

（或同等 yaml metadata field、依既有 constitution.md 結構而定）

### E2.5 估計 Constitution amendment 改動行數

| 區段 | 估計 |
|---|---|
| 檔頭 Version 改 + 標頭區 wording | +20 line |
| §IV 主體段落追加（TS-Typing-Sync 受管例外 + Rationale） | +18 line |
| Version History 條目 | +2 line |
| **合計** | **+40 line** |

---

## E3. `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md` 完整 6 節內容（FR-009、per [research R-4](./research.md)）

per research R-4.1 骨架，6 節完整內容（implementer 階段直接落地、~120-150 line 新文件）：

```markdown
# DESIGN-W-TYPING-ALIGN — base-web TS typing 對齊 rust wire 真實序列化型

> **軌道權威**：本文件為 Constitution v1.5.0 「TS-Typing-Sync 軌道受管例外」的單一真相。
> 軌道範圍變更 / 新 sprint 落地 / 邊界調整一律在此登記。
> 與 [`INTEGRATION-DESIGN-W-WEBUI.md`](INTEGRATION-DESIGN-W-WEBUI.md) 並列、互斥不重疊。

**版本歷史**：
- v1.0（2026-05-25 隨 048 sprint 同步建檔）— 軌道首發、§4.1 048 base-typings-sync sprint 條目

---

## §1 軌道定位

TS-Typing-Sync 為 Constitution Principle IV「base 不改動邊界」**v1.5.0 起新增的第二條受管例外軌道**（第一為 W-WEBUI 軌道、v1.1.0 引入）。

**軌道目的**：對齊 base-web TypeScript 宣告與 rust-api wire 真實序列化型；補回編譯期型別安全（TS lying-to-itself 修正）。

**觸發背景**：post-039 entity id migration（display_id i64 from Snowflake 53-bit）+ post-040 wire DTO 重新設計後、TS 與 rust wire 出現 type mismatch；W-WEBUI 軌道 FR-015 禁碰 `src/typings/` 無法修。設立 TS-Typing-Sync 為**第二受控軌道**、補回編譯期型別安全。

---

## §2 可動範圍（硬邊界、不擴張）

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

---

## §3 動機限定

每個 sprint 必須**舉證** TS 宣告 vs rust wire 不一致（grep rust 對應 output struct 為證、spec.md 內 FR 明示對齊規格）。

**允許動作**：
- type alignment（type 改 / field rename / field add / field remove 以對齊 rust wire shape）
- JSDoc 註解補 non-obvious 語意（如 sentinel value / 兩種 id 並存等）

**不允許**：
- 純命名統一 / refactor 無 wire mismatch 證據
- 新增 runtime 型別 guard（zod / io-ts）— 屬另一軌道議題
- W-WEBUI 範圍 wiring / component 改

---

## §4 軌道成員（sprint 歷史）

### §4.1 048 base-typings-sync（首發 sprint）

- **日期**：2026-05-25 落地
- **commit**：outer `<TBD post-merge>` + merge `<TBD>` + base-web `<TBD>`
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

---

## §5 與 W-WEBUI 軌道的邊界

| 維度 | W-WEBUI 軌道 | TS-Typing-Sync 軌道 |
|---|---|---|
| 軌道權威 | `INTEGRATION-DESIGN-W-WEBUI.md` | `INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（本檔） |
| 可動範圍 | `src/views/` / `src/components/` / `src/service*/api/*.ts` / `src/store/` / `src/router/` 等 wiring 範圍 | `src/typings/api/*.d.ts` only |
| 動機 | base-web 管理後台接線（接 stub form 到 service API、補必需的最小 UI 新增） | TS 對齊 rust wire 真實序列化型 |
| 引入版本 | Constitution v1.1.0（2026-05-21） | Constitution v1.5.0（2026-05-25） |
| 軌道屬性 | 接線軌道（030-038 + 040 W-FW1~W-FW9 系列） | 對齊軌道（048 起首發） |
| **不重疊 hard rule** | **不**動 typings/ | **不**動 W-WEBUI 範圍 |

**Feature spec.md 軌道辨識義務**：每個改 base-web source 的 feature 在 Constitution Check 段必須明示屬哪條軌道；跨軌道需求必須拆成兩個 feature（一落 W-WEBUI、一落 TS-Typing-Sync）。

---

## §6 預期 sprint 模式

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
```

---

## E4. `.specify/templates/plan-template.md` 軌道辨識條目 wording（FR-010、per [research R-5](./research.md)）

### E4.1 改動位置

`.specify/templates/plan-template.md` Constitution Check 段（既有區塊、針對 Principle IV. base 不改動邊界 row）。

### E4.2 wording（plan 階段 reference、implementer 階段 Phase 0 grep 既有 template 結構後微調）

加軌道辨識 sub-note（在 Principle IV row 描述欄內、或單獨成 row 都可、Phase 0 implementer 拍板）：

```markdown
| **IV. base 不改動邊界** | <feature 對 base-web 改動描述、必須先判定屬哪條軌道：> <br>**軌道辨識**（v1.5.0+、三選一）：<br>(a) **W-WEBUI 軌道**：feature 屬 `INTEGRATION-DESIGN-W-WEBUI.md §5/§7` 登記項、改 `src/views`/`src/components`/`src/service*/api/*.ts`/`src/store`/`src/router`、**不**動 typings/<br>(b) **TS-Typing-Sync 軌道**（v1.5.0+）：feature 屬 `INTEGRATION-DESIGN-W-TYPING-ALIGN.md §4` 登記項、改 `src/typings/api/*.d.ts`、**不**動 W-WEBUI 範圍<br>(c) **軌道外**：0 base-web diff、預設原則涵蓋（同 039/041/042/043/044/045/046/047 體例） | ✅/❌ |
```

### E4.3 估計改動行數

~10-15 line edit in `.specify/templates/plan-template.md` Constitution Check 段（具體位置由 Phase 0 implementer grep 既有 template 結構後拍板；可選擇 plug into Principle IV row 描述欄、或單獨成段、依既有結構而定）。

---

## E5. INTEGRATION-CHECKLIST cleanup（FR-013、per Open Q1 推薦改寫保留）

### E5.1 衍生 follow-up inline note refresh wording

原 inline note（INTEGRATION-CHECKLIST.md 內衍生 follow-up backlog 後）：

```markdown
> **base-web TS `id` 型別債**（030–034 回顧 review 三處命中）：`src/typings` 的 `CommonRecord.id` 宣告 `number`、`Menu.parentId` 宣告 `number`，但 rust-api runtime 實際回字串（user / role id 為 ULID、menu `parentId` 為字串；另 `MenuRoute.id` rust `i32` ↔ base-web TS `string` 同類）。runtime 靠 JS 動態型別恰好可運作，TS 編譯器無法捕捉未來 regression。**032 的 `parentId` 字串/數字 deserializer fix（`149dc52`）本質即此型別債的後果**。W-WEBUI 軌道因 FR-015 禁碰 `src/typings` 無法修。建議 base-web cleanup sprint 統一：`CommonRecord.id` / `parentId` 改 `string`、複查相依比較邏輯（如 `parentId === 0`）。
```

改寫為（per Open Q1 推薦保留歷史、改為已完成標示）：

```markdown
> **base-web TS `id` 型別債（已分階段完成）**：原 030–034 W-WEBUI 軌道遺留（`src/typings` 與 rust wire 真實型不一致）已分三階段結案：
> - **039 rust-entity-id-numeric-migration**（2026-05-24）：rust 端 5 業務 entity 加 `display_id BIGINT` 副欄 + Snowflake 53-bit generator + wire 邊界 transform，post-039 wire `id` 為 i64 number 而非 ULID string；`CommonRecord.id: number` 與 `Menu.parentId: number` 因此**自然對齊**（不需 TS 改）。
> - **040 wire-id-consistency**（2026-05-24）：base-web W-WEBUI 軌道修 service inline type + button-auth-modal / menu-auth-modal 內部 cascade；拆掉 032 留下的 `deserialize_i32_or_string` workaround；W-FW9 條目。
> - **048 base-typings-sync**（2026-05-25）：TS-Typing-Sync 軌道首發 sprint、修剩餘 3 處 mismatch（`MenuRoute.id` string→number、`MenuRoute` 加 `pid` 宣告、`MenuTree.pId` rename + retype 為 `pid: string`）+ 3 處 JSDoc audit（`CommonRecord.id` Snowflake / `Menu.parentId === 0` sentinel / `Auth.UserInfo.userId` ULID vs display_id）。原 inline note 中「`CommonRecord.id` / `parentId` 改 `string`」建議在 039 後實際是反方向（保留 number、補 JSDoc 說明）。
```

### E5.2 已完成里程碑加 048 entry

格式對齊 047 / 046 體例（一行 entry、含 outer/merge/base-web SHA placeholder、spec link、scope 簡述、軌道屬性 = TS-Typing-Sync 首發、下一步指向 follow-up backlog 順序第 2 段）：

```markdown
- [x] **048 base-typings-sync** ✅（2026-05-25 完成；outer `<OUTER_SHA>` + merge `<MERGE_SHA>`、base-web `<BASE_WEB_SHA>`、rust-api 0 改動；spec `specs/048-base-typings-sync/`）— TS-Typing-Sync 軌道首發 sprint（Constitution v1.5.0 同步落地）：3 mismatch fix（MenuRoute.id string→number + 加 pid string、MenuTree.pId→pid rename + retype）+ 3 JSDoc audit（CommonRecord.id Snowflake 53-bit / Menu.parentId root sentinel / Auth.UserInfo.userId ULID vs display_id）；軌道內 base-web 4 檔 typings/api edit、軌道外 outer（amendment + 新 DESIGN-W-TYPING-ALIGN.md + plan-template 軌道辨識條目）；0 rust-api 改動、0 schema migration、0 新 cargo dep；Constitution 5/5 PASS、含 amendment v1.4.0→v1.5.0
```

### E5.3 Current Focus update + CLAUDE.md SPECKIT marker update

更新「現狀」段加 048；「下一步」改向**條件觸發 follow-up backlog 順序第 2 段**（042-N4 / 042-N5 各自獨立、wait for trigger）；CLAUDE.md SPECKIT marker idle、Active Spec/Plan = `—`、下一步指向條件觸發。

---

## E6. 2 US 落點 file:line table（per plan.md §Source Code）

| US | item | file | 改動 |
|---|---|---|---|
| US1 M1 | `MenuRoute.id` string→number | `base-web/src/typings/api/route.d.ts` lines 10-12 | -1 / +5 line |
| US1 M2 | `MenuRoute.pid` 新增 | `base-web/src/typings/api/route.d.ts` lines 10-12 | +5 line |
| US1 M3 | `MenuTree.pId → pid` rename + retype | `base-web/src/typings/api/system-manage.d.ts` lines 132-137 | -1 / +6 line |
| US2 D1 | `CommonRecord.id` JSDoc | `base-web/src/typings/api/common.d.ts` lines 35-38 | +9 line |
| US2 D2 | `Menu.parentId` JSDoc | `base-web/src/typings/api/system-manage.d.ts` lines 105-108 | +8 line |
| US2 D3 | `UserInfo.userId` JSDoc | `base-web/src/typings/api/auth.d.ts` lines 13-14 | +9 line |
| Phase 0 amendment | constitution v1.4.0→v1.5.0 | `.specify/memory/constitution.md` 多處 | +40 line |
| Phase 0 new doc | DESIGN-W-TYPING-ALIGN | `docs/INTEGRATION-DESIGN-W-TYPING-ALIGN.md`（新）| +130 line |
| Phase 0 plan-template | 軌道辨識條目 | `.specify/templates/plan-template.md` Constitution Check 段 | +10 line |
| Phase 0 CLAUDE 索引 | §1 / §7 補 DESIGN-W-TYPING-ALIGN | `CLAUDE.md` 多處 | +5 line |
| Phase 4 outer | INTEGRATION-CHECKLIST refresh + 048 entry + SPECKIT marker | `docs/INTEGRATION-CHECKLIST.md` + `CLAUDE.md` | +15 line |

**改動總計**：~250-280 line 新加 / 改動跨 8 file（4 base-web typings + 4 outer rev1 整合層）。

---

## E7. Out-of-scope（048 不做、但相關）

- W-WEBUI 軌道範圍 wiring 改動（views / components / service / store / router）→ W-WEBUI 軌道、本 sprint 不動
- 其他 typings 改動（app.d.ts / router.d.ts / components.d.ts / elegant-router.d.ts / 等）→ 軌道嚴禁、不動
- runtime 型別 guard（zod / io-ts）→ scope creep、clarify C 已 reject、登 048+ 長期 follow-up
- rust wire shape 改動 → 本軌道為「TS → rust 單向 sync」、rust 不動
- `Auth.UserInfo.userId` vs `User.id` 命名統一 → 屬 rust 內 SoT 設計、本 sprint 不統一
- Snowflake 41-bit cutoff date doc（2095-12-25 估）→ 屬另一層長期 follow-up、本 sprint D1 JSDoc 只說「fills Number.MAX_SAFE_INTEGER」
- `MenuRoute.children` / `MenuRoute.path` 等其他 field 對齊驗 → R-1 grep 確認 `ElegantConstRoute` extension 自帶、本 sprint 不動
