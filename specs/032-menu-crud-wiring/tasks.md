---
description: "Task list for 032 — W-FW2 menu-crud-wiring implementation"
---

# Tasks: 032 — W-FW2 menu-crud-wiring（base-web menu CRUD 接線）

**Input**: Design documents from `/specs/032-menu-crud-wiring/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- 本 feature **無新純函式測試** — transform handler / `map_menu_type` / `map_icon_type` 為形狀對映,皆以 acceptance 覆蓋（比照 W-FW1 / F8 / F13 wiring feature 慣例,spec 未要求單元測試）。
- **Acceptance**:CDP browser smoke + curl + psql（per spec FR-019）→ 對齊 11 個 C-V（C-V1~C-V11、見 contracts/verification-commands.md）。

**Organization**:032 = 3 user story（US1 建立含加子菜單 P1 MVP / US2 刪除+批次刪除 P2 / US3 編輯 P3）。雙 worktree feature。Setup(2)+ Foundational(2)+ US1(5)+ US2(5)+ US3(5)+ build/acceptance(10)+ 多段式 Commit(4)= **33 task**。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行（獨立檔案 / 獨立命令）
- **[Story]**:US1/US2/US3 標籤;Setup / Foundational / build/acceptance / Commit 無標籤
- 路徑:rust-api worktree（`rust-api/`）、base-web worktree（`base-web/`）、outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`

## Path Conventions

- **改(rust-api worktree)**:
  - `rust-api/server/model/src/admin/input/sys_menu.rs`（4 個 alias DTO）+ `input/mod.rs`（re-export）
  - `rust-api/server/service/src/admin/mod.rs`（`MenuType` re-export）
  - `rust-api/server/api/src/admin/sys_system_manage_api.rs`（4 transform handler + 對映 helper）
  - `rust-api/server/router/src/admin/sys_system_manage_route.rs`（4 條 menu 寫入 route + RouteInfo）
- **新建(rust-api worktree)**:`rust-api/server/migration/src/datas/m20260522_*_menu_alias_seed.rs`（Casbin policy seed）+ register（`datas/mod.rs` + `lib.rs`）
- **改(base-web worktree)**:
  - `base-web/src/service/api/system-manage.ts`（4 個寫入 service function）
  - `base-web/src/views/manage/menu/modules/menu-operate-modal.vue`（handleSubmit）
  - `base-web/src/views/manage/menu/index.vue`（handleDelete / handleBatchDelete）
- **不動**:`sys_menu` schema（無 schema migration）;`sys_menu_service.rs`;`MenuInput`/`UpdateMenuInput`;base-web 型別 / 表格 render / `shared.ts` / router / store / i18n;nestjs fork
- **Acceptance 執行**:outer repo root host-side bash、**dev stack**

---

## Phase 1: Setup（Shared Infrastructure）

- [ ] T001 確認 worktree 狀態,執行 `git branch --show-current`(預期 outer=`032-menu-crud-wiring`)+ `(cd rust-api && git branch --show-current)`(預期 `rev1-admin-rust-api`)+ `(cd base-web && git branch --show-current)`(預期 `rev1-admin-base-web`)

- [ ] T002 [P] 確認 acceptance 前置就位,執行 `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"`(預期 5 service running)+ 取 token curl `/api/auth/login`（Soybean/123456）回 `code:0`

---

## Phase 2: Foundational（Blocking Prerequisites）

**Purpose**:確認 032 改動標的存在於 research 指出的位置;建立跨 3 story 共用的 Casbin policy seed。

- [ ] T010 確認 032 改動標的就位,執行:
  ```bash
  grep -nE "struct MenuInput|struct UpdateMenuInput|pub pid" rust-api/server/model/src/admin/input/sys_menu.rs
  grep -nE "fn create_menu|fn update_menu|fn delete_menu" rust-api/server/service/src/admin/sys_menu_service.rs
  grep -nE "addMenu|updateMenu|deleteMenu|getMenuList" rust-api/server/router/src/admin/sys_system_manage_route.rs
  grep -nE "for_systemmanage|fn map_status" rust-api/server/api/src/admin/sys_system_manage_api.rs
  grep -nE "Gender|Status|MenuType" rust-api/server/service/src/admin/mod.rs
  grep -nE "fetchGetMenuList|handleSubmit|handleDelete" base-web/src/service/api/system-manage.ts base-web/src/views/manage/menu/modules/menu-operate-modal.vue base-web/src/views/manage/menu/index.vue
  ```
  預期:`sys_menu.rs` 有 `MenuInput`/`UpdateMenuInput`/`pid`;`sys_menu_service.rs` 有 3 個 menu CRUD service;route 有 menu 讀 alias、**無** menu 寫入 alias;`sys_system_manage_api.rs` 有 W-FW1 `map_status`、無 menu 寫入 handler;`service/admin/mod.rs` re-export `Gender,Status`、**無** `MenuType`;base-web 有 stub `handleSubmit`/`handleDelete` — per research R-Q1~R-Q6

- [ ] T011 依 data-model E4 新建 Casbin policy seed migration `rust-api/server/migration/src/datas/m20260522_*_menu_alias_seed.rs`（命名比照 F9 `m20260520_a_f9_system_manage_alias_seed.rs`）:INSERT `casbin_rule` policy row 覆蓋 4 條新 path（`/systemManage/{addMenu,updateMenu,deleteMenu,batchDeleteMenu}`）× Soybean ROLE_SUPER + Administrator ROLE_ADMIN allow、`v4=''`;含 scope-limited 反向 DELETE（冪等）;register 進 `rust-api/server/migration/src/datas/mod.rs`（加 mod）+ `rust-api/server/migration/src/lib.rs`（Migrator vec 末端加）

**Checkpoint**:Foundational 完成 — 改動標的確認、Casbin seed migration 就位（4 條 path 涵蓋 US1/US2/US3）

---

## Phase 3: User Story 1 — 建立菜單（含加子菜單）（Priority: P1）🎯 MVP

**Goal**:base-web menu 新增 / 加子菜單 modal 送出接上 `/systemManage/addMenu`,新菜單落 DB（含正確父菜單歸屬）、列表 refresh。

**Independent Test**:CDP 在 `/manage/menu` 開新增 modal 填表送出、對目錄型菜單開加子菜單 modal 送出 → curl `getMenuList` / psql 確認新菜單落 DB、pid 正確、列表顯示。

### US1 implementation

- [ ] T020 [US1] 依 data-model E1 在 `rust-api/server/model/src/admin/input/sys_menu.rs` 新增 `SystemManageAddMenuInput`（`#[serde(rename_all="camelCase")]`、17 欄:`menu_type:String`/`menu_name`/`route_name`/`route_path`/`component`/`order:i32`/`i18n_key:Option`/`icon:Option`/`icon_type:Option<String>`/`status:String`/`parent_id:i32`/`keep_alive:Option`/`constant:bool`/`href:Option`/`hide_in_menu:Option`/`active_menu:Option`/`multi_tab:Option`;`query`/`buttons`/`fixedIndexInTab` 不宣告 → serde 忽略）;`input/mod.rs` re-export

- [ ] T021 [US1] 依 data-model E2 在 `rust-api/server/service/src/admin/mod.rs` entity re-export 加 `MenuType`;在 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 新增 `add_menu_for_systemmanage` transform handler（extractor `Extension<Arc<SysMenuService>>` + `Extension<User>` + `Json<SystemManageAddMenuInput>`):轉 `CreateMenuInput`（`menu_type`/`status` 經對映、`icon_type` 經對映、`parent_id.to_string()→pid`、`order→sequence`、`path_param=None`）→ 呼既有 `SysMenuService::create_menu`;新增 `map_menu_type`（`"1"→Directory`/`"2"→Menu`/其他→驗證錯誤）+ `map_icon_type`（`Some("1")→Some(1)`/`Some("2")→Some(2)`/`None→None`/其他→驗證錯誤）helper、`map_status` 重用 W-FW1 既有;接 T020

- [ ] T022 [US1] 依 data-model E3 在 `rust-api/server/router/src/admin/sys_system_manage_route.rs` 新增 `/addMenu` route `post(SysSystemManageApi::add_menu_for_systemmanage)` + 對應 `RouteInfo`;接 T021

- [ ] T023 [P] [US1] 依 data-model E5 在 `base-web/src/service/api/system-manage.ts` 新增 `fetchAddMenu(data)` → `request({ url:'/systemManage/addMenu', method:'post', data })`（比照 W-FW1 `fetchAddUser` 體例）;可平行於 rust 改動

- [ ] T024 [US1] 依 data-model E6-a 改 `base-web/src/views/manage/menu/modules/menu-operate-modal.vue` 的 `handleSubmit`:既有 `validate()` + `getSubmitParams()` 保留,`operateType` 為 `add` / `addChild` 時呼 `fetchAddMenu(params)`、檢 `error`,成功則 `$message.success` + `closeModal` + `emit('submitted')`、失敗不關 modal;接 T023（edit branch 留 T044）

**Checkpoint**:US1 完成 — base-web 可建立頂層菜單與子菜單（依賴 Phase 6 build）

---

## Phase 4: User Story 2 — 刪除 / 批次刪除菜單（Priority: P2）

**Goal**:base-web menu 列表的單筆 / 批次刪除接上 `/systemManage/{deleteMenu,batchDeleteMenu}`。

**Independent Test**:CDP 在 `/manage/menu` 對 menu 點刪除 / 批次刪除 → psql 確認軟刪、列表移除。

**Note**:W-FW2 US2 **有後端改動** —— `deleteMenu` 為 body-id 變形 handler、`batchDeleteMenu` 為 native 無對應的新 alias（per data-model E2 / research R-Q3/R-Q4）。

### US2 implementation

- [ ] T030 [US2] 依 data-model E1 在 `rust-api/server/model/src/admin/input/sys_menu.rs` 新增 `DeleteMenuByBodyInput { id: i32 }` + `BatchDeleteMenuInput { ids: Vec<i32> }`（`#[serde(rename_all="camelCase")]`、比照 F9 `DeleteUserByBodyInput`）;`input/mod.rs` re-export;接 T020（同檔序列）

- [ ] T031 [US2] 依 data-model E2 在 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 新增 `delete_menu_for_systemmanage`（收 `Json<DeleteMenuByBodyInput>` → 呼既有 `delete_menu`）+ `batch_delete_menu_for_systemmanage`（收 `Json<BatchDeleteMenuInput>` → per-row loop 呼 `delete_menu` + `deletedCount` counter、回 `Res::new_data(json!({"deletedCount":n}))`,比照 F9 `batch_delete_users`）;接 T030、T021（同檔序列）

- [ ] T032 [US2] 依 data-model E3 在 `rust-api/server/router/src/admin/sys_system_manage_route.rs` 新增 `/deleteMenu` route `delete(SysSystemManageApi::delete_menu_for_systemmanage)` + `/batchDeleteMenu` route `delete(SysSystemManageApi::batch_delete_menu_for_systemmanage)` + 對應 2 個 `RouteInfo`;接 T031、T022（同檔序列）

- [ ] T033 [P] [US2] 依 data-model E5 在 `base-web/src/service/api/system-manage.ts` 新增 `fetchDeleteMenu({id})` → `request({url:'/systemManage/deleteMenu',method:'delete',data})` + `fetchBatchDeleteMenu({ids})` → `request({url:'/systemManage/batchDeleteMenu',method:'delete',data})`;接 T023（同檔序列）、可平行於 rust

- [ ] T034 [US2] 依 data-model E6-b 改 `base-web/src/views/manage/menu/index.vue`:`handleDelete(id)` 呼 `fetchDeleteMenu({id})`、成功 `onDeleted()`;`handleBatchDelete()` 呼 `fetchBatchDeleteMenu({ids:checkedRowKeys.value})`、成功 `onBatchDeleted()`;失敗皆不續行;接 T033

**Checkpoint**:US2 完成 — base-web 可刪除 / 批次刪除 menu（依賴 Phase 6 build）

---

## Phase 5: User Story 3 — 編輯菜單（Priority: P3）

**Goal**:base-web menu 編輯 modal 送出接上 `/systemManage/updateMenu`,變更落 DB。

**Independent Test**:CDP 對既有 menu 點編輯 → modal 預填現值 → 改欄送出 → psql 確認變更生效。

**Note**:FR-006（編輯 modal 開啟預填現值）由 base-web `menu-operate-modal.vue` 既有 `handleInitModel`（`operateType==='edit'` 指派 `rowData`）滿足、無 implementation task（per spec A-002,比照 W-FW1 FR-006）;C-V5 + C-V10 step③ 驗證預填。

### US3 implementation

- [ ] T040 [US3] 依 data-model E1 在 `rust-api/server/model/src/admin/input/sys_menu.rs` 新增 `SystemManageUpdateMenuInput`（同 `SystemManageAddMenuInput` 17 欄 + `id: i32`）;`input/mod.rs` re-export;接 T030（同檔序列）

- [ ] T041 [US3] 依 data-model E2 在 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 新增 `update_menu_for_systemmanage` transform handler:收 `Json<SystemManageUpdateMenuInput>` → 轉 `UpdateMenuInput { id, menu: MenuInput {...} }`（同 T021 對映;在 Rust 端直接構造、`UpdateMenuInput` 不需 un-flatten）→ 呼既有 `SysMenuService::update_menu`;接 T040、T031（同檔序列）

- [ ] T042 [US3] 依 data-model E3 在 `rust-api/server/router/src/admin/sys_system_manage_route.rs` 新增 `/updateMenu` route `post(SysSystemManageApi::update_menu_for_systemmanage)` + 對應 `RouteInfo`;接 T041、T032（同檔序列）

- [ ] T043 [P] [US3] 依 data-model E5 在 `base-web/src/service/api/system-manage.ts` 新增 `fetchUpdateMenu(data)` → `request({url:'/systemManage/updateMenu',method:'post',data})`;接 T033（同檔序列）、可平行於 rust

- [ ] T044 [US3] 依 data-model E6-a 改 `base-web/src/views/manage/menu/modules/menu-operate-modal.vue` 的 `handleSubmit`:補 `operateType==='edit'` 分支 — 呼 `fetchUpdateMenu({ ...getSubmitParams(), id: props.rowData.id })`、成功 / 失敗處理同 add branch;接 T024、T043

**Checkpoint**:US3 完成 — base-web 可編輯 menu（依賴 Phase 6 build）

---

## Phase 6: Shared Build + Acceptance

### Build

- [ ] T060 **C-V1** rebuild rust-api docker image:
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 build exit 0。fail → check alias DTO / transform handler / 對映 helper / Casbin seed migration。接 T020-T042（全 rust 改動）

- [ ] T061 **C-V2** rebuild base-web image + 起 dev stack:
  ```bash
  DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web -f base-web/Dockerfile base-web/ 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"
  ```
  預期:兩 image build exit 0;5 service healthy + migration exited 0（含新 Casbin seed migration）。接 T060、T023-T044（全 base-web 改動）

### Acceptance（對齊 contracts/verification-commands.md C-V3~C-V11）

- [ ] T062 [US1] **C-V3 + C-V4** addMenu:curl `addMenu` 建頂層 `WFW2Test`（menuType '2' / parentId 0）→ psql 驗 `menu_type=menu`/`status=enabled`/`pid=0`;curl `addMenu` 建子菜單 `WFW2Child`（parentId=既有 directory id、payload 帶 `query`/`buttons`/`fixedIndexInTab`）→ `code:0`、psql 驗 `pid`=父 id、三欄被忽略。接 T061

- [ ] T063 [P] [US3] **C-V5** updateMenu:curl `updateMenu` 改 `WFW2Test`（menuName/status/order）→ psql 驗 `menu_name`/`status`/`sequence` 變更。接 T061、可平行

- [ ] T064 [P] [US2] **C-V6 + C-V7** delete:curl `deleteMenu` 刪 `WFW2Test` → psql 驗 `deleted_at` 標記、row 留表;curl `batchDeleteMenu` 刪 `WFW2Child` → psql 驗批次軟刪（count=2）。接 T061、可平行

- [ ] T065 [P] **C-V8** audit log:psql 查 `sys_operation_log` `module_name='sys_menu'` 近 6 筆 → 含 C-V3~C-V7 的 INSERT/UPDATE/刪除 紀錄（module_name 實際值若不同,以實際修正 contract）。接 T062-T064、可平行

- [ ] T066 [P] **C-V9** Casbin seed + deny:psql 查 `casbin_rule` 含 4 條新 menu 寫入 path policy row;curl GeneralUser token 打 `addMenu` → `code:5001`。接 T061、可平行

- [ ] T067 **C-V10** CDP smoke:CDP 控制 Edge（127.0.0.1:9229）登入 base-web、走訪 `/manage/menu`,完成 ① 新增 modal 建菜單 ② 加子菜單 ③ 編輯 ④ 單筆刪除 ⑤ 批次刪除 —— 每步驟確認列表即時 refresh、無 console error;⑥ **錯誤路徑(驗 FR-013/E-2)**:填重複 routeName 送出 → 確認 modal 不關 + 顯示錯誤;⑦ **regression(驗 SC-007)**:走訪 `/home` 確認 dashboard+動態 menu、`/manage/user`+`/manage/role` 確認列表渲染;測試菜單測完清除。Edge debug port 不通則 deferred manual-eyeball（比照 W-FW1 / F7）。接 T061

- [ ] T068 [P] **C-V11** 三邊 scope verify:
  ```bash
  (cd base-web && git diff HEAD --stat)                           # 預期 3 檔
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l   # 預期 0
  (cd rust-api && git diff HEAD --stat)                            # 預期 ~8 檔、無 sys_menu schema migration
  ```
  預期:base-web 限 `system-manage.ts`+`menu-operate-modal.vue`+`menu/index.vue`;nestjs 0 diff;rust-api 限 research/data-model 指出的 ~8 檔、唯一新 migration 為 Casbin seed。接 T020-T044、可平行

- [ ] T069 [P] 清測試資料:psql `DELETE FROM sys_menu WHERE menu_name LIKE 'WFW2%';`(若 CDP / curl 測試菜單殘留)。接 T062-T067、可平行

**Checkpoint**:Phase 6 完成 — C-V1~C-V11 acceptance PASS;測試菜單已清、無 seed 污染。

---

## Phase 7: Polish & 多段式 Commit + Push wait（per CLAUDE.md §6.1）

### Stage 1a — rust-api worktree commit

- [ ] T100 在 rust-api worktree 內 commit:
  ```bash
  cd rust-api
  git status --short                              # 預期 ~8 檔 modified/new
  git add server/
  git commit -m "feat(rust-api): W-FW2 menu CRUD systemManage alias 轉換層"
  # push 等 user 同意（per CLAUDE.md §5）
  cd ..
  ```

### Stage 1b — base-web worktree commit

- [ ] T101 在 base-web worktree 內 commit:
  ```bash
  cd base-web
  git status --short                              # 預期 3 檔 modified
  git add src/
  git commit -m "feat(base-web): W-FW2 menu CRUD 接線 — modal/list submit 接 systemManage"
  # push 等 user 同意
  cd ..
  ```

### Stage 2 — outer commit（032 feature branch）

- [ ] T102 回 outer + 單段 outer commit（spec docs + 兩 SHA pin）:
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 032-menu-crud-wiring
  git add specs/032-menu-crud-wiring/ docs/superpowers/032-feature-menu-crud-wiring.md \
          docs/INTEGRATION-CHECKLIST.md .specify/feature.json CLAUDE.md rust-api base-web
  git commit -m "feat(spec): 032 menu-crud-wiring — spec docs + rust-api/base-web SHA pin"
  ```
  > brainstorm doc `032-feature-*.md` + INTEGRATION-CHECKLIST W-FW2-N1 若已於前置 commit 落則不重複 add;outer + merge SHA 留 `<sha-pending>`、merge 後 T103 補

- [ ] T103 Push 等 user 同意:
  - 告知 user:「032 多段式 commit 已落（rust-api / base-web 已 commit、outer 在本機），要不要 push（3 個 branch）+ merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push**（per CLAUDE.md §5）
  - user 同意後:`cd rust-api && git push origin rev1-admin-rust-api && cd ..` → `cd base-web && git push origin rev1-admin-base-web && cd ..` → `git push origin 032-menu-crud-wiring` → `git switch rev1-admin-root` → `git merge --no-ff 032-menu-crud-wiring` → SHA fill 進 INTEGRATION-CHECKLIST + CLAUDE.md §10 marker → commit `docs(checklist): 032 SHA 填入` → `git push origin rev1-admin-root`（等 user 二次同意）

**Checkpoint**:Phase 7 完成 — 032 落地、多段式 commit 紀律遵守、base-web 限 3 檔 + nestjs 0 改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup（T001+T002） | Phase 2-7 | — |
| Phase 2 Foundational（T010+T011） | Phase 3-5 | Phase 1 |
| Phase 3 US1（T020-T024） | Phase 6 build | Phase 2 |
| Phase 4 US2（T030-T034） | Phase 6 build | Phase 2 + US1（同檔序列） |
| Phase 5 US3（T040-T044） | Phase 6 build | Phase 2 + US1/US2（同檔序列） |
| Phase 6 build（T060-T061） | Phase 6 acceptance + Phase 7 | T020-T044 全到位 |
| Phase 6 acceptance（T062-T069） | Phase 7 | T061 |
| Phase 7 Commit（T100-T103） | — | 全 6 phase PASS |

**Story 獨立性**:US1 / US2 / US3 共用 `input/sys_menu.rs`、`sys_system_manage_api.rs`、`sys_system_manage_route.rs`、`system-manage.ts`、`menu-operate-modal.vue` → 同檔序列。整個 image build（T060/T061）需三 story 程式碼皆編譯通過。Casbin seed migration（T011）涵蓋三 story 全部 path。

**內部依賴**:T020→T030→T040（`sys_menu.rs` 同檔序列）;T021→T031→T041（`sys_system_manage_api.rs` 同檔序列）;T022→T032→T042（route 同檔序列）;T023→T033→T043（`system-manage.ts` 同檔序列）;T024→T044（`menu-operate-modal.vue` 同檔序列）;T034 接 T033;T060→T061。

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 2**:T010 序列、T011 [P]（獨立新檔 migration）
- **Phase 3 US1**:T020→T021→T022 rust 序列;T023 [P]（base-web、可平行於 rust）;T024 接 T023
- **Phase 4 US2**:T030→T031→T032 rust 序列;T033 [P];T034 接 T033
- **Phase 5 US3**:T040→T041→T042 rust 序列;T043 [P];T044 接 T024+T043
- **Phase 6**:T060→T061 序列;T062 序列鏈 T061;T063/T064/T065/T066/T068/T069 [P];T067 接 T061
- **Phase 7**:T100→T101→T102→T103 嚴格序列（多段式 commit）

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3（US1）— 完成後 base-web 可建立菜單。US2（刪除）+ US3（編輯）為增量交付。032 推薦走完整 Phase 1-7 一次到位（對齊 W-FW1/F7/F8/F12/F13 同 session 模式）。

> ⚠️ 注意:三 story 程式碼同在一個 rust crate / 一個 base-web bundle — Phase 6 build（T060/T061）需 US1+US2+US3 全部編譯通過才能 rebuild image。

**全 33 task 預估時間**:50-70 分鐘（無複雜邏輯 — DTO/形狀對映/接線 + 1 個 Casbin seed migration;rust + base-web 兩 image rebuild 占 ~5 min warm cache;acceptance C-V 為 curl/psql/CDP）。

**Critical path**:T001 → T002 → T010 → T011 → T020 → T021 → T022 → T030 → T031 → T032 → T040 → T041 → T042 →（T023/T033/T043 base-web 並行鏈）→ T024 → T034 → T044 → T060 → T061 → T062 →（T063-T069 並行）→ T100 → T101 → T102 → T103

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1]/[US2]/[US3] | ✓（T020-T024 US1 / T030-T034 US2 / T040-T044 US3 / 部分 acceptance 帶 story 標籤） |
| Setup / Foundational / build / Commit 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓ |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或 `/speckit-implement`**。
