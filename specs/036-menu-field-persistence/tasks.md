# Tasks: W-FW7 — menu-field-persistence

**Input**: Design documents from `/specs/036-menu-field-persistence/`
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: 無單元測試 task —— wiring / schema 擴充類 feature（新欄位寫入 / 讀出 / 序列化由 Sea-ORM derive + serde 既有體例承擔、無新純函式邏輯），正確性由 acceptance（curl + psql + CDP browser smoke）覆蓋。比照 W-FW1~W-FW5 慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 持久化 + admin CRUD / US2 runtime 動態路由）。Foundational 階段含 DB schema + entity（兩 story 共用前置）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2）
- 路徑相對 worktree root（`rust-api/`）—— base-web 預期 0 改動

---

## Phase 1: Setup

- [ ] T001 確認 worktree 分支正確（`rust-api` 在 `rev1-admin-rust-api`；`base-web` 本 feature 0 改動但 worktree 應在 `rev1-admin-base-web`）、dev stack 可 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起（quickstart.md）

---

## Phase 2: Foundational

**跨 story 共用前置** —— Schema migration（A1）+ Sea-ORM entity（A2）為兩 user story 共同前置:

- US1 的寫入 / admin 讀回路徑需要 DB 欄位存在 + entity 能載入這 3 欄。
- US2 的 runtime 動態路由路徑亦讀同一張 `sys_menu` 表、需要 entity 載入這 3 欄。

故 T002（migration）+ T003（entity）必須在任一 user story 開始實作前完成。

- [ ] T002 rust-api 新 schema migration `migration/src/schemas/m<timestamp>_add_menu_fields_to_sys_menu.rs`：`sys_menu` 加 3 欄 —— `query JSONB NULL` / `buttons JSONB NULL` / `fixed_index_in_tab INTEGER NULL`（用 `execute_unprepared` `ALTER TABLE` 體例，沿用 `m20260514_h_extend_sys_operation_log_audit_fields.rs`），含對稱 down migration（`DROP COLUMN IF EXISTS`，順序與 up 相反）；register in `migration/src/lib.rs` Vec 末端（timestamp 晚於現有最大 `m20260523_b_wfw5_change_password_seed`）（data-model.md A1、research.md R-Q3）

- [ ] T003 rust-api `sys_menu` Sea-ORM entity（`server/model/src/admin/entities/sys_menu.rs`）加 3 欄：`#[sea_orm(column_type = "JsonBinary", nullable)] pub query: Option<JsonValue>`、`#[sea_orm(column_type = "JsonBinary", nullable)] pub buttons: Option<JsonValue>`、`pub fixed_index_in_tab: Option<i32>`；若檔頂無 `use serde_json::Value as JsonValue;` 補上（依 T002 結構；data-model.md A2、research.md R-Q3）

**Checkpoint**: Foundational 完成、user story 可平行開始。

---

## Phase 3: User Story 1 — 持久化 + admin CRUD round-trip (P1) 🎯 MVP

**Goal**: base-web menu modal 已有的 `query` / `buttons` / `fixedIndexInTab` 三欄真正寫入 `sys_menu`、admin getMenuList round-trip 回傳真值。

**Independent test**: 在 `/manage/menu` 編輯任一 menu 填入 3 欄非空值送出 → psql 該 menu row 3 欄持久化 → 重開編輯 modal 預填一致 → curl getMenuList 確認回傳真值。

**Note**: base-web **0 改動**（Phase 0 R-Q1/R-Q2 已驗證 modal UI 與 null 防護齊備）。

- [ ] T004 [US1] rust-api native `MenuInput`（`server/model/src/admin/input/sys_menu.rs`）加 3 欄：`#[serde(default)] pub query: Option<serde_json::Value>` / `#[serde(default)] pub buttons: Option<serde_json::Value>` / `#[serde(default)] pub fixed_index_in_tab: Option<i32>`；`#[serde(default)]` 確保「未提供」對映 `None`、與 `Some(empty array)` 明示空清單區別（FR-004 / E-3 / E-4；data-model.md B1）

- [ ] T005 [US1] rust-api transform DTO `SystemManageAddMenuInput` / `SystemManageUpdateMenuInput`（同檔 `sys_menu.rs` 的 systemManage 區段）各加同 3 欄（同 T004 attribute 配置）—— `#[serde(rename_all = "camelCase")]` 已套用故收 `fixedIndexInTab`；同檔不與 T004 平行但可同 commit 一併改（依 T004；data-model.md B2）

- [ ] T006 [US1] rust-api transform handler menu add/update（`server/api/src/admin/sys_system_manage_api.rs` 的 `add_menu` / `update_menu`）：在 systemManage input → native `MenuInput` 對映處，加 `query: input.query` / `buttons: input.buttons` / `fixed_index_in_tab: input.fixed_index_in_tab` 三行（依 T004 + T005；data-model.md B3）

- [ ] T007 [US1] rust-api menu service create/update（`server/service/src/admin/sys_menu_service.rs` 的 `create_menu` / `update_menu`）：組 `sys_menu` ActiveModel 處加 3 欄 `Set(input.<field>)`；update_menu 若採 `if let Some(v) = input.<field> { active.<field> = Set(Some(v)); }` 體例（比照 update_user 對 optional 欄位的處理），3 欄沿用同一模式（未提供＝不動、提供＝寫該值，含明示空陣列）—— **未提供時不動該欄、明示空陣列持久化為 `[]`**（FR-004 / E-3 / E-4）。既有 audit 路徑（`audit_log::write_in_txn` + `audit_snapshot`）自動涵蓋新 3 欄（依 T003 + T004；data-model.md B4）

- [ ] T008 [US1] rust-api `MenuTree` 加 3 欄：
  ① struct 定義在 `server/model/src/admin/output/sys_menu.rs:43` —— 加 `pub query: Option<serde_json::Value>` / `pub buttons: Option<serde_json::Value>` / `pub fixed_index_in_tab: Option<i32>`
  ② 構造點在 `server/service/src/admin/sys_menu_service.rs:64` 的 `build_menu_tree(menu: &SysMenuModel) -> MenuTree` —— 在 `MenuTree { … }` 字面值內加 `query: menu.query.clone(), buttons: menu.buttons.clone(), fixed_index_in_tab: menu.fixed_index_in_tab,`（`Option<JsonValue>` 需 `.clone()`）
  （依 T003；data-model.md C2）

- [ ] T009 [US1] rust-api `SystemManageMenuOutput`（`server/model/src/admin/output/sys_system_manage.rs`）：
  ① **先改型別**：line 117 `pub buttons: Option<Vec<serde_json::Value>>` → `pub buttons: Option<serde_json::Value>`（與同 struct 的 `query` 一致；W-FW2 時 `buttons` 硬寫 `None` 從未被填充過、無 consumer 依賴 `Vec` 形狀；serde 序列化 `Value::Array` 與 `Vec<Value>` JSON 結果相同、base-web 端無感）
  ② **改 `From<MenuTree>` impl**：把硬寫的 `buttons: None` / `fixed_index_in_tab: None` / `query: None` 改為 `buttons: m.buttons` / `fixed_index_in_tab: m.fixed_index_in_tab` / `query: m.query`
  （依 T008；data-model.md C1）

- [ ] T010 [US1] rust-api build（`DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api` + `up -d --wait`）；含 migration 自動套用（依 T002–T009；quickstart.md）

- [ ] T011 [US1] US1 acceptance：psql `\d sys_menu` 確認 3 欄存在（C-V1 schema 部分）；curl `addMenu` 帶 3 欄（C-V3）/ `updateMenu` 改 3 欄（C-V4）/ 送 `[]`（C-V5）/ 省略（C-V6）；curl `getMenuList` 回傳真值（C-V7）/ 既有 row 為 null（C-V8）；curl updateMenu 無權限 token（C-V13）；psql `sys_operation_log` 含 3 欄 audit（C-V14）；CDP `/manage/menu` 編輯 modal 預填 + 調整送出 + 再開一致（C-V15）+ 新 menu 不填 3 欄（C-V16）；regression `/manage/menu` 既有 CRUD（C-V17）（依 T010）

**Checkpoint**: US1 可獨立交付 —— 三欄持久化 + admin CRUD round-trip 端到端通。

---

## Phase 4: User Story 2 — runtime 動態路由生效 (P2)

**Goal**: 動態路由端點（`getUserRoutes` / `getConstantRoutes`）回傳的路由 meta 帶 `query` + `fixedIndexInTab`（不帶 `buttons`），使前端路由系統據其運作。

**Independent test**: 對某 menu 設定 `query` / `fixedIndexInTab` 後，curl `getUserRoutes` 回傳該 menu 對應路由的 meta 反映所設值；buttons 不出現。

**Note**: 與 US1 無檔案重疊（D1/D2 改 `output/sys_menu.rs`）；理論可平行起步，但建議 P1→P2 增量。

- [ ] T012 [P] [US2] rust-api `RouteMeta`（`server/model/src/admin/output/sys_menu.rs`）加 2 欄：`#[serde(skip_serializing_if = "Option::is_none")] pub query: Option<serde_json::Value>` / `#[serde(skip_serializing_if = "Option::is_none")] pub fixed_index_in_tab: Option<i32>`。**`buttons` 不加**（Q2 拍板）（依 T003；data-model.md D1）

- [ ] T013 [US2] rust-api `MenuRoute` 組裝（**兩個構造點**，均為 explicit struct literal、加 T012 的 2 欄後將觸發 missing-field compile error → 必須同步填）：
  ① `server/service/src/admin/sys_auth_service.rs:184` 的 `get_user_routes`（對 `/getUserRoutes`，JWT-protected）
  ② `server/service/src/admin/sys_menu_service.rs:170` 的 `get_constant_routes`（對 `/getConstantRoutes`，public）
  兩處的 `RouteMeta { … }` 字面值末尾各加：`query: menu.query.clone(), fixed_index_in_tab: menu.fixed_index_in_tab,`（`Option<JsonValue>` 需 `.clone()`）；`buttons` **不填**（Q2 拍板）。
  同步檢查 tests：`server/model/tests/response_shape_alignment_dimension_b.rs:34,109` 與 `server/service/tests/auth_login_shapes.rs:30,105` 若有 explicit `RouteMeta` literal、補 2 欄為 `None` 即可（tests 不關心新欄行為）。
  （依 T012；data-model.md D2）

- [ ] T014 [US2] rust-api build（若 US1 + US2 一起做，可與 T010 合併一次 build）（依 T012 + T013；quickstart.md）

- [ ] T015 [US2] US2 acceptance：curl `getUserRoutes` 確認 meta 含 `query` + `fixedIndexInTab` 真值（C-V9）/ null 不出現對應欄（C-V10）/ `buttons` 不出現（C-V11）；curl `getConstantRoutes` 同行為（C-V12）；CDP 登入 + 動態 menu 載入正常（C-V18 regression）（依 T014）

**Checkpoint**: US2 可獨立交付 —— runtime 動態路由 meta 反映 query + fixedIndexInTab 端到端通。

---

## Phase 5: Polish & 收尾

- [ ] T016 全 C-V 矩陣 C-V1~C-V20 跑完（含 C-V2 migration down 對稱、C-V19 schema 邊界、C-V20 scope diff）—— contracts/verification-commands.md

- [ ] T017 多段式 commit：rust-api worktree conventional commit + push fork → outer `git add rust-api` 更新 SHA pin + 第二段 commit（base-web 本 feature 0 改動故不 add）（CLAUDE.md §4.1）

- [ ] T018 INTEGRATION-CHECKLIST 更新：「已完成里程碑」加 036 entry（依日期升冪插入正確位置）、「Current Focus」更新（W-FW7 完成 → W-WEBUI follow-up 軌道剩 W-FW6）、「規劃中」表移除 W-FW7;CLAUDE.md SPECKIT marker 更新（Active feature → 無、Previous features 加 036 entry）

- [ ] T019 contingency：若 acceptance 中 CDP 階段發現 base-web menu-operate-modal 預填或送出有微調需要（不期望發生 —— Phase 0 R-Q1/R-Q2 已驗證），限於 `base-web/src/views/manage/menu/modules/menu-operate-modal.vue` 單檔（§4 准動清單內）—— 若觸發則需第二輪 base-web build + 多段式 commit 加 base-web；若未觸發則 skip 本 task（spec FR-011）

---

## Dependencies

```text
T001 (Setup)
  └─ Phase 2 Foundational:
        T002 (migration) → T003 (entity)
                      ↓
  ┌───────────────────┴────────────────────┐
  │                                        │
Phase 3 US1（MVP）                  Phase 4 US2
T004 (MenuInput)
  → T005 (transform DTO，同檔)
  → T006 (transform handler)
  → T007 (menu service write)
  → T008 (MenuTree)
  → T009 (SystemManageMenuOutput.From)
  → T010 (build)                          T012 (RouteMeta) [P 與 T004]
  → T011 (US1 acceptance)                 → T013 (MenuRoute 組裝)
                                          → T014 (build，可與 T010 合)
                                          → T015 (US2 acceptance)
                                          
  └───── Phase 5 Polish ─────┘
        T016 (全 C-V matrix) → T017 (multi-stage commit) → T018 (checklist 更新)
        T019 (contingency base-web，僅 acceptance 觸發時)
```

**Story 獨立性**: US1 / US2 功能獨立、可各自獨立驗收。**檔案重疊**:無 —— US1 改 input DTO + transform handler + menu service + admin output；US2 改 route output。Foundational(T002 entity + T003 schema)為兩 story 唯一共用前置。

## Parallel Execution

- **跨 story**：T012(US2 RouteMeta)與 T004(US1 MenuInput)分屬不同檔(`output/sys_menu.rs` vs `input/sys_menu.rs`)、無相依 → 可平行;但 T012 仍依 T003(entity)。建議單 implementer 走 P1→P2 序列、batch build 一次(T010 與 T014 合)。
- **US1 內**：T004 與 T005 同檔(`input/sys_menu.rs`)、不可平行;T006/T007/T008/T009 各檔不同但有依賴鏈(T006 依 T004+T005、T007 依 T003+T004、T008 依 T003、T009 依 T008)—— 大致序列。
- **US2 內**：T012→T013 序列;T015 acceptance 依 T014。

## Implementation Strategy

- **MVP = US1**（Phase 1 + 2 + 3）：base-web 已有 UI（W-FW2 starter）+ 後端持久化 + admin round-trip 即達 MVP（可手動 round-trip 驗證、CDP 互動 OK）。
- **增量交付**: US1 → US2 依優先序;每 story phase 完成即為可獨立驗收增量。
- **build 批次**: tasks 列了 per-story build(T010 / T014)—— 執行時 controller 可批次（如 US1+US2 的 rust 改動一次 build），不必逐 story 重 build。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。建議執行單元：① rust-api foundational（T002-T003）② rust-api US1 寫入 + admin 讀回（T004-T009 同檔群聚 / 同 service 群聚）③ rust-api US2 runtime route（T012-T013）④ 一次 build（T010+T014 合）⑤ acceptance + 收尾（T011+T015+T016-T018）。
- **base-web 0 改動**：Phase 0 已驗證 modal UI 與 null 防護齊備、`Api.SystemManage.Menu` 型別涵蓋 3 欄。T019 為 contingency safety net，預期不觸發。
