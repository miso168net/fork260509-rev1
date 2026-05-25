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
