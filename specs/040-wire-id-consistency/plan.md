# Implementation Plan: wire-id-consistency

**Branch**: `040-wire-id-consistency` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/040-wire-id-consistency/spec.md`

## Summary

把 039 之後 wire 層仍未對齊 numeric id 的 3 條餘料一次清乾淨：**(A)** 修 base-web 2 modal body roleId `String(...)` cascade（修 039 acceptance 漏掉的 critical 422 bug、CDP smoke defer 跳過 + curl 直送 number 走通因此 missed）—— typings + service.ts + 2 modal 對齊 number；**(B)** A 的副產品、cosmetic URL path `String()` 餘料自然消；**(C)** 拆 032 留下的 rust parentId deserializer workaround（base-web typings 已 number-only 後安全）；**(D)** 為 3 entity raw endpoint 新增 wire DTO（`RoleDetail` / `UserDetail` / `AccessKeyDetail`）handler `.map(...)` wrap、不再 serialize Sea-ORM Model 直送、消除 wire 上 `id: ULID-string` + `displayId: i64` 重複。

**設計選擇**：wire DTO wrap 而非 Model serde 改 attr —— rust internal SoT 表示（Model）與 wire 表示（Detail DTO）分離；audit_log / debug print 等 internal serialize 不受影響；行為與既有 `SystemManage*Output` alias DTO 對稱。Theme A+B 屬 W-WEBUI 軌道（base-web 改動 §4 邊界內、新增 W-FW9）；Theme C+D 屬軌道外 rust-only（同 039 模式）。

base-web 改動 = 4 檔（typings + service + 2 modal）；rust-api 改動 = ~7 檔（1 deserializer drop + 3 output struct 加 + 3 api handler 修）+ 1 doc 更新（DESIGN-W-WEBUI §7）；0 schema migration、0 新 entity、0 input DTO 改動（039 T030.5 已完成）。比 039 中等規模小、比 W-FW8 中等規模。

## Technical Context

**Language/Version**: 
- base-web: TypeScript / Vue 3（W-WEBUI §4 邊界內改動：typings + service + 2 modal）
- rust-api: Rust（axum + Sea-ORM + serde；移除既有 workaround + 新增 wire DTO）

**Primary Dependencies**:
- base-web: `src/typings/api/system-manage.d.ts`、`src/service/api/system-manage.ts`、`src/views/manage/role/modules/{button-auth-modal, menu-auth-modal}.vue`
- rust-api: 既有 `sys_role_api.rs` / `sys_user_api.rs` / `sys_access_key_api.rs`（handler 加 wire DTO wrap）+ `sys_menu.rs` input（拆 deserializer）+ 3 個新 output struct（`RoleDetail` / `UserDetail` / `AccessKeyDetail`）
- 039 落地的 5 entity `display_id` 雙欄 + Snowflake helper —— wire DTO `id: i64` 對映 `model.display_id`
- 既有 Sea-ORM Model trait（不動、internal SoT 保留）

**Storage**: PostgreSQL —— 0 schema 改動（純 wire 表示層 + 客戶端對齊）。

**Testing**: acceptance-only（curl + psql + CDP browser smoke）—— 本 feature 為 wire-shape 對映 + 移除既有 workaround 類，無新純函式邏輯，比照 039 / W-FW7 慣例（無單元測試、acceptance matrix 覆蓋）。

**Target Platform**: Linux container（docker-compose dev stack：front-nginx + rust-api + postgres + redis + base-web）。

**Project Type**: web —— base-web frontend + rust-api backend（同 039 / W-WEBUI 系列模式、跨 worktree feature）。

**Performance Goals**: 
- raw endpoint wire DTO `.map(...)` wrap 開銷可忽略（一次 i64 copy + Vec 移動、~50 行 row 級規模、< 1ms 對應）
- deserializer 拆除後 path 更直接、無 perf regression
- base-web modal POST request 不增加 round-trip（純 body 型對齊）

**Constraints**:
- W-WEBUI §4 邊界紀律：base-web 只動 typings + service + 2 modal 4 檔；不擴大 scope（E-1/E-7 typecheck cascade 超出 §4 邊界留 follow-up）
- 三段式 commit（CLAUDE.md §4.1）—— base-web worktree 第一段 + rust-api worktree 第二段 + outer SHA pin 第三段
- 向後相容 + rust internal SoT 保留（FR-014/015/016 — audit_log / JWT / Casbin / FK / `Ulid::new()` 0 改動）
- Constitution v1.4.0 預設原則 + W-WEBUI dynamic 授權（無 amendment 需求）

**Scale/Scope**: base-web 改動 ~4 檔、rust-api 改動 ~7 檔 + 1 doc：
- base-web typings field 改 ~6 處（5 entity 對應 Param 型）
- base-web service signature 改 ~5 function（自動隨 typings）
- base-web modal `String(...)` 拿掉 4 處
- rust parentId deserializer drop（~17 行）
- rust 3 個新 output struct（`RoleDetail` / `UserDetail` / `AccessKeyDetail`、~30 行/檔）
- rust 3 api file handler `.map(...)` wrap（每 file 2-4 handler）
- `docs/INTEGRATION-DESIGN-W-WEBUI.md` §7 加 W-FW9 條目（~20 行）

## Constitution Check

*GATE：Phase 0 前須通過；Phase 1 後複查。對照 `.specify/memory/constitution.md` v1.4.0。*

| Principle | 評估 | 結論 |
|---|---|---|
| **I. RBAC Fail-safe** | Casbin policy 邏輯不動、enforce path 不動、Casbin policy 主寫權威仍 rust；本 feature 0 RBAC 改動。 | ✅ PASS |
| **II. Soft Delete + 全域 Audit** | audit_log payload / `write_in_txn` / entity_id ULID 保留歷史一致性；wire DTO wrap 不破壞 audit serialize 路徑（Phase 0 R-Q1 已驗證 Model.id 在 audit 仍 ULID）；soft_delete 邏輯不變；本 feature 0 audit 改動。 | ✅ PASS |
| **III. 嚴版禁 Forward + 單一職責** | 全程 rust 單一進程內 service 呼叫、無後端間 HTTP/RPC；nginx config 0 改動；endpoint ownership 不變；wire DTO wrap 純 handler-level 改動。 | ✅ PASS |
| **IV. base 不改動邊界** | Theme A+B base-web 改動限定 W-WEBUI §4 邊界內（typings/api + service/api + 2 modal vue）；Theme C+D rust-only 軌道外、預設原則涵蓋；新增 W-FW9 條目至 DESIGN-W-WEBUI §7 即取得 Constitution v1.4.0 dynamic 授權、不需 amendment。 | ✅ PASS（W-FW9 受管例外）|
| **V. 漸進收縮** | 0 nestjs、0 新 entity、0 schema 改動、純去除既有 workaround（C）+ 引入 wire/internal 表示分離（D）+ 客戶端對齊（A+B）；漸進改善方向、無回退。 | ✅ PASS |

**Gate 結果**：5 principle 全 PASS、無 violation → `Complexity Tracking` 留空。

> **註**：本 feature 為 W-WEBUI 軌道下次受管例外行使（W-FW9 拍板加入 DESIGN-W-WEBUI §7 即完成授權）—— Constitution v1.4.0 dynamic 模式生效後第一個案例。Phase 1 設計未引入新 violation；post-design 複查結論不變。

## Project Structure

### Documentation (this feature)

```text
specs/040-wire-id-consistency/
├── plan.md              # 本檔
├── spec.md              # /speckit-specify 產出（16/16 PASS、0 NEEDS CLARIFICATION）
├── research.md          # Phase 0 —— R-Q1 / R-Q2 / R-Q3 / R-Q4 / R-Q5 resolved
├── data-model.md        # Phase 1 —— 元件清單 + 改動細節
├── quickstart.md        # Phase 1 —— dev stack 啟動 + base-web build + 驗證流程
├── contracts/
│   └── verification-commands.md   # Phase 1 —— C-V acceptance contract
├── checklists/
│   └── requirements.md  # /speckit-specify 產出（16/16 PASS）
└── tasks.md             # /speckit-tasks 產出（非本指令產生）
```

### Source Code (worktree)

```text
base-web/  (worktree, branch rev1-admin-base-web)
├── src/typings/api/system-manage.d.ts                          # A1: 6+ Param 型 roleId/userIds/endpointIds string→number
├── src/service/api/system-manage.ts                            # A2: 5 function signature 自動隨 typings + URL path template literal
├── src/views/manage/role/modules/button-auth-modal.vue         # A3: line 33 + 45 String(...) 拿掉
└── src/views/manage/role/modules/menu-auth-modal.vue           # A3: line 37 + 46 String(...) 拿掉

rust-api/  (worktree, branch rev1-admin-rust-api)
├── server/model/src/admin/input/sys_menu.rs                    # C1: 拆 deserialize_parent_id_compat 函式 + parent_id 改 plain serde
├── server/model/src/admin/output/sys_role.rs (新檔或加進既有)   # D1: RoleDetail struct + From<sys_role::Model>
├── server/model/src/admin/output/sys_user.rs (擴展既有檔)       # D2: UserDetail struct + From<sys_user::Model>
├── server/model/src/admin/output/sys_access_key.rs (新檔)      # D3: AccessKeyDetail struct + From<sys_access_key::Model>
├── server/model/src/admin/output/mod.rs                        # D: 註冊新 module（若有新檔）
├── server/api/src/admin/sys_role_api.rs                        # D4: get_paginated_roles / get_role / update_role / get_all_roles handler 加 .map(RoleDetail::from)
├── server/api/src/admin/sys_user_api.rs                        # D5: get_all_users / get_paginated_users / get_user / update_user handler 加 .map(UserDetail::from)
└── server/api/src/admin/sys_access_key_api.rs                  # D6: get_paginated_access_keys handler 加 .map(AccessKeyDetail::from)

docs/  (outer repo)
└── INTEGRATION-DESIGN-W-WEBUI.md                               # §7 加 §7.4 W-FW9 wire-id-consistency 條目（§7.4 執行順序 → §7.5）
```

**Structure Decision**: 跨 2 worktree（base-web + rust-api）+ outer doc；W-WEBUI §4 邊界內 base-web 4 檔 + rust-api 7 檔 + outer 1 doc。三段式 commit：base-web worktree 第一段（push fork）→ rust-api worktree 第二段（push fork）→ outer 第三段（SHA pin + DESIGN-W-WEBUI doc + INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker）。

## Complexity Tracking

無 —— Constitution Check 全 5 principle PASS、0 violation，本表留空。
