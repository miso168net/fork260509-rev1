# Implementation Plan: 030 — systemManage status/gender alignment

**Branch**: `030-systemmanage-status-gender-alignment` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/030-systemmanage-status-gender-alignment/spec.md`

## Summary

F14 cutover 後 CDP 全功能巡檢抓到的 base-web↔rust-api enum 契約落差 follow-up。兩部分,**純 rust-side、base-web 0 diff**:

- **Part A — status 對齊(bug fix)**:`systemManage` 三個列表 Output DTO 的 `status` 目前序列化為 rust `Status` enum 字串(`"enabled"/"disabled"`),base-web `EnableStatus` 型別只認 `'1'/'2'` → base-web 表格 render `$t(enableStatusRecord["enabled"])` = `$t(undefined)` → vue-i18n `INVALID_ARGUMENT`(error 17)。新增 `map_status` 把 `Status` 映射成 `'1'/'2'`(比照 F7 既有 `map_menu_type`)、三個 DTO 套用。
- **Part B — gender 功能新增**:rust `sys_user` 無 gender 欄位、`systemManage` user DTO 硬回 `userGender: None`。補 `Gender` domain enum + `sys_user.gender` nullable 欄位 + migration(建 PG enum + 加欄 + seed 3 預設用戶)+ `map_gender` + getUserList 回傳/篩選 + create/update 寫入,讓 base-web 既有性別 UI(表格欄、搜尋面板)拿到真實資料。

技術途徑:**rust-api worktree 內的 entity / migration / Output DTO / input DTO / service 改動**,無新 crate。`Gender` 比照 `Status` 建模(PG enum + sea-orm `DeriveActiveEnum`)。展示值 `'1'/'2'` 只活在 `map_status`/`map_gender` 序列化邊界,DB 維持 domain 語意值。

**Phase 0 research 關鍵發現**:`Gender` 採 PG enum(比照 `Status`/`MenuType`);三個 Output DTO 的 `status` 欄位型別需 `Status`→`String`;`SystemManageUserOutput` 已有 `user_gender: Option<String>` 欄位(F7 預留、硬寫 `None`)— 本 feature 接上真實值;`UserPageRequest` 目前僅 `keywords`、base-web 個別篩選參數全被忽略,本 feature 僅補 `userGender` 篩選(其餘 pre-existing 不碰)。

**兩段式 commit**:全改動在 rust-api worktree → Stage 1;spec docs + SHA pin → Stage 2。**有 migration**。

> 無 time gate — DESIGN-A §6.1 全 14 feature 已於 F14 收尾,本 feature 為 DESIGN-B 形態下一般 follow-up。

## Technical Context

**Language/Version**: Rust(edition 對齊 rust-api workspace、不指定版本)
**Primary Dependencies**: 無新增 — `sea-orm`(`DeriveActiveEnum` / migration)、既有 `server-model` / `server-service` crate;`tracing`(`map_status` 的 Banned warn,`sys_system_manage.rs` 既已 `use tracing::warn`)
**Storage**: PostgreSQL — **新增 1 個 PG enum type(`gender`)+ `sys_user` 加 1 個 nullable 欄位**;有 migration;不改既有表結構、不動既有欄位
**Testing**: rust 單元測試 — `map_status`(Enabled/Disabled/Banned)、`map_gender`(Male/Female/None)純函式(比照 F7.2 `test_map_role_alias`);acceptance = curl + psql + `docker compose exec` + CDP browser smoke(per spec FR-017/FR-018)
**Target Platform**: Linux container — rust-api docker image + postgres
**Project Type**: backend feature — rust-api worktree 內 entity / migration / DTO / service 改動,無新 crate、無新模組
**Performance Goals**: N/A — `map_status`/`map_gender` 為 O(1) 純函式映射、無效能面
**Constraints**: base-web 0 diff(Constitution IV);不改 `Status` enum 定義;不為 base-web 引入第 3 狀態;不改 `menuType`/`iconType`(F7 已對齊);不碰 Casbin / audit / soft-delete 路徑
**Scale/Scope**: rust-api worktree **~7 個檔改 + 1 個 migration 新增**(`sea_orm_active_enums.rs` + `sys_user.rs` entity + `sys_system_manage.rs` + `sys_user.rs` output + `sys_user.rs` input + `sys_user_service.rs` + migration 註冊;新增 1 migration 檔)

無 NEEDS CLARIFICATION — brainstorm saturated、`/speckit-clarify` 0 question(taxonomy 全 Clear)、Phase 0 research 7 個 R-Q 已解。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | 判定 | 理由 |
|---|---|---|---|
| I | RBAC Fail-safe | **PASS** | 不碰 Casbin enforce、不碰 `casbin_rule`;`getUserList` 等端點的 enforcement 路徑不動 |
| II | Soft Delete + Audit | **PASS** | 無 `DELETE`;migration 加欄 + seed 3 用戶為 schema-migration,比照既有 seed migration(`m20241024` 等)、不經 runtime audit;`create_user`/`update_user` 既有 audit hook 不因新增 `gender` 欄而改變(只是 ActiveModel 多一欄) |
| III | 嚴版禁 Forward + 單一職責 | **PASS** | 純 rust 單後端、無服務間 forward;DESIGN-B 形態 |
| IV | base 不改動邊界 | **PASS** | 本 feature **體現** Principle IV — base-web 0 diff,所有 API 形狀 GAP(`status` enum 值、`userGender` 欄位)由後端適應(`map_status`/`map_gender`/rust 補 gender 欄位);base 既有 UI(表格 render、搜尋面板、性別 radio)不動而生效 |
| V | 漸進收縮 | **N/A** | DESIGN-B(rust-only)已於 F14 正式生效;本 feature 非 DESIGN-A→B 遷移範疇 |

**架構約束檢查**:
- **資料庫**:本 feature 加 1 PG enum + 1 nullable 欄位、有 migration — migration 由 rust 主導(符合架構約束「rust 主導所有 migration」);MySql/Sqlite 分支跳過 enum 建立(比照 `m20240815`)— PASS
- **快取與 pub-sub / TLS / Secret / Port / Observability / Backup / 背景工作 / CI/CD**:本 feature 皆不碰 — N/A
- **部署形態**:不改 docker-compose、不改 nginx — N/A

**Gate 結果**:**4 PASS / 1 N/A / 0 violation** — Constitution Check 通過、無需 Complexity Tracking。本 feature 為 Constitution Principle IV「base 不改動 / 後端適應」的具體實踐。

## Project Structure

### Documentation (this feature)

```text
specs/030-systemmanage-status-gender-alignment/
├── spec.md              # /speckit-specify 產出 ✓
├── plan.md              # 本檔(/speckit-plan)
├── research.md          # Phase 0 產出 — R-Q1~R-Q7 ✓
├── data-model.md        # Phase 1 產出 — E1~E6 變更模型 ✓
├── quickstart.md        # Phase 1 產出 ✓
├── contracts/
│   └── verification-commands.md   # Phase 1 產出 — C-V1~C-V13 ✓
├── checklists/
│   └── requirements.md  # /speckit-specify 產出 ✓
└── tasks.md             # /speckit-tasks 產出(本指令不產)
```

### Source（rust-api worktree）

```text
rust-api/server/model/src/admin/entities/sea_orm_active_enums.rs   # E1:加 Gender active enum
rust-api/server/model/src/admin/entities/sys_user.rs               # E2a:entity 加 gender: Option<Gender>
rust-api/migration/src/datas/m20260523_a_030_user_gender.rs        # E2b:新 migration(建 gender PG enum + ALTER sys_user + seed 3 用戶)
rust-api/migration/src/datas/mod.rs + rust-api/migration/src/lib.rs # E2b:註冊 migration
rust-api/server/model/src/admin/output/sys_system_manage.rs        # E3+E4:map_status / map_gender + 3 Output DTO
rust-api/server/model/src/admin/output/sys_user.rs                 # E5a:UserWithoutPassword 加 gender
rust-api/server/model/src/admin/input/sys_user.rs                  # E5b+E6a:UserPageRequest + UserInput 加 gender
rust-api/server/service/src/admin/sys_user_service.rs              # E5c+E6b:find_paginated_users 篩選 + create/update 寫入
（無 base-web 改、無 docker-compose 改、無 nginx 改、不刪任何檔）
```

**Structure Decision**: 本 feature 為 **backend contract-alignment feature** — 全改動落 rust-api worktree,無新 crate、無新模組。兩段式 commit:Stage 1 rust-api worktree(7 檔改 + 1 migration 新增)、Stage 2 outer(spec docs + SHA pin)。比照 F7 `manage-crud-alignment` 同族 — F7 已對齊 `menuType`/`iconType`,本 feature 補 `status` + 新增 `gender`。

## Phase 0: research（見 [research.md](research.md)）

Phase 0 對 rust-api worktree 調查,解 7 個 R-Q:
- R-Q1:`Gender` 採 PG enum(比照 `Status`/`MenuType`)
- R-Q2:`gender` 欄位 nullable、entity `Option<Gender>`
- R-Q3:`map_status`/`map_gender` 置 `sys_system_manage.rs`、三 DTO `status` 型別 `Status`→`String`
- R-Q4:`UserWithoutPassword` + `UserPageRequest` 加 gender、`find_paginated_users` 接 `userGender` 篩選(其餘個別篩選參數 pre-existing 不碰)
- R-Q5:`UserInput` + create/update service 寫 gender
- R-Q6:單一 migration — 建 enum + 加欄 + seed 3 用戶
- R-Q7:`Banned → "2"` + warn

## Phase 1: Design & Contracts（見 [data-model.md](data-model.md) / [contracts/verification-commands.md](contracts/verification-commands.md) / [quickstart.md](quickstart.md)）

- **data-model.md**:E1 `Gender` enum / E2 `sys_user.gender` 欄位+migration / E3 `map_status`+status 型別 / E4 `map_gender`+user DTO / E5 `UserWithoutPassword`+getUserList 篩選 / E6 `UserInput`+create/update;含變更後 data flow。
- **contracts/verification-commands.md**:C-V1~C-V13 — image rebuild / migration(enum+欄位+seed)/ dev stack / getRoleList·getUserList·getMenuList status / userGender 篩選 / create·update gender / Banned 收斂 / unit test / CDP smoke INVALID_ARGUMENT 歸零 / 三邊 scope。
- **quickstart.md**:落地操作(改動清單 + 實作順序 + build/驗證 + 兩段式 commit)。

**Constitution Re-check(post-design)**:Phase 1 設計後重新檢查 — data-model E1-E6 確認純 rust-side、base-web 0 diff(IV);DB migration 由 rust 主導;無服務間 forward(III);不碰 Casbin enforce(I);migration seed 比照既有 seed、create/update 既有 audit hook 不受影響(II)。**4 PASS / 1 N/A / 0 violation 維持**。

## Complexity Tracking

> 無 Constitution violation — 本表不適用。
