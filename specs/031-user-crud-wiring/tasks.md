---
description: "Task list for 031 — W-FW1 user-crud-wiring implementation"
---

# Tasks: 031 — W-FW1 user-crud-wiring（base-web user CRUD 接線）

**Input**: Design documents from `/specs/031-user-crud-wiring/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- 本 feature **無新純函式測試** — transform handler 為形狀對映、`update_user` 為條件式調整,皆以 acceptance 覆蓋（比照 F8 / F13 wiring feature 慣例,spec 未要求單元測試）。
- **Acceptance**:CDP browser smoke + curl + psql（per spec FR-020）→ 對齊 11 個 C-V（C-V1~C-V11、見 contracts/verification-commands.md）。

**Organization**:031 = 3 user story（US1 建立 P1 MVP / US2 刪除+批次刪除 P2 / US3 編輯 P3）。雙 worktree feature。Setup(2)+ Foundational(1)+ US1(5)+ US2(2)+ US3(6)+ build/acceptance(10)+ 多段式 Commit(4)= **30 task**。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行（獨立檔案 / 獨立命令)
- **[Story]**:US1/US2/US3 標籤;Setup / Foundational / build/acceptance / Commit 無標籤
- 路徑:rust-api worktree（`rust-api/`)、base-web worktree（`base-web/`)、outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`

## Path Conventions

- **改(rust-api worktree)**:
  - `rust-api/server/model/src/admin/input/sys_user.rs`（alias DTO + `UpdateUserInput` un-flatten)
  - `rust-api/server/service/src/admin/sys_user_service.rs`（`update_user` password 條件式)
  - `rust-api/server/api/src/admin/sys_system_manage_api.rs`（transform handler)
  - `rust-api/server/router/src/admin/sys_system_manage_route.rs`（addUser/updateUser route 重指)
- **改(base-web worktree)**:
  - `base-web/src/service/api/system-manage.ts`（4 個寫入 service function)
  - `base-web/src/views/manage/user/modules/user-operate-drawer.vue`（handleSubmit)
  - `base-web/src/views/manage/user/index.vue`（handleDelete / handleBatchDelete)
- **不動**:DB schema（無 migration);base-web 型別 / 表格 render / router / store / i18n;Casbin policy seed;nestjs fork;`deleteUser`/`batchDeleteUser` alias
- **Acceptance 執行**:outer repo root host-side bash、**dev stack**

---

## Phase 1: Setup（Shared Infrastructure）

- [ ] T001 確認 worktree 狀態,執行 `git branch --show-current`(預期 outer=`031-user-crud-wiring`)+ `(cd rust-api && git branch --show-current)`(預期 `rev1-admin-rust-api`)+ `(cd base-web && git branch --show-current)`(預期 `rev1-admin-base-web`)

- [ ] T002 [P] 確認 acceptance 前置就位,執行 `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"`(預期 5 service running)+ 取 token curl `/api/auth/login`（Soybean/123456）回 `code:0`

---

## Phase 2: Foundational（Blocking Prerequisites）

**Purpose**:確認 031 改動標的存在於 research 指出的位置（改動前 baseline)。

- [ ] T010 確認 031 改動標的就位,執行:
  ```bash
  grep -nE "struct UserInput|struct UpdateUserInput|DeleteUserByBodyInput" rust-api/server/model/src/admin/input/sys_user.rs
  grep -nE "fn update_user|input.user.password" rust-api/server/service/src/admin/sys_user_service.rs
  grep -nE "addUser|updateUser|deleteUser|batchDeleteUser" rust-api/server/router/src/admin/sys_system_manage_route.rs
  grep -nE "for_systemmanage" rust-api/server/api/src/admin/sys_system_manage_api.rs
  grep -nE "fetchGetUserList|handleSubmit" base-web/src/service/api/system-manage.ts base-web/src/views/manage/user/modules/user-operate-drawer.vue
  ```
  預期:`sys_user.rs` 有 `UserInput`/`UpdateUserInput`/F9 alias DTO;`update_user` 有 `input.user.password`;route 有 4 個 alias;`sys_system_manage_api.rs` 有 F9 `*_for_systemmanage` handler;base-web 有 `fetchGetUserList` + stub `handleSubmit` — per research R-Q1~R-Q4

---

## Phase 3: User Story 1 — 建立使用者（Priority: P1）🎯 MVP

**Goal**:base-web user 新增抽屜送出接上 `/systemManage/addUser`,新 user 落 DB、列表 refresh。

**Independent Test**:CDP 在 `/manage/user` 開新增抽屜填表送出 → curl `getUserList` / psql 確認新 user 落 DB、列表顯示。

### US1 implementation

- [ ] T020 [US1] 依 data-model E1-a 在 `rust-api/server/model/src/admin/input/sys_user.rs` 新增 `SystemManageAddUserInput`（`#[serde(rename_all="camelCase")]`、欄位 `user_name`/`user_gender:Option<String>`/`nick_name`/`user_phone:Option<String>`/`user_email:Option<String>`/`status:String`;serde 自動忽略 `userRoles` 等未知欄)

- [ ] T021 [US1] 依 data-model E3 在 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 新增 `add_user_for_systemmanage` transform handler（比照 F9 `*_for_systemmanage` extractor 體例):收 `SystemManageAddUserInput` → 轉 `CreateUserInput`（`domain="built-in"`、`username=user_name`、`password="123456"` per R-Q5、`email`/`phone_number` 對映、`status`/`gender` 值域對映 per R-Q6、`avatar=None`）→ 呼既有 `SysUserService::create_user`;`status`/`gender` 非法值回驗證錯誤 envelope;接 T020

- [ ] T022 [US1] 依 data-model E4 改 `rust-api/server/router/src/admin/sys_system_manage_route.rs`:`/addUser` route 由 `post(SysUserApi::create_user)` 改 `post(SysSystemManageApi::add_user_for_systemmanage)`;接 T021

- [ ] T023 [P] [US1] 依 data-model E5 在 `base-web/src/service/api/system-manage.ts` 新增 `fetchAddUser(data)` → `request({ url:'/systemManage/addUser', method:'post', data })`（比照同檔 `fetchGetRoleList` 體例);可平行於 rust 改動

- [ ] T024 [US1] 依 data-model E6-a 改 `base-web/src/views/manage/user/modules/user-operate-drawer.vue` 的 `handleSubmit`:`await validate()` 後,`operateType==='add'` 時呼 `fetchAddUser(model.value)`、檢 `error`,成功則 `$message.success` + `closeDrawer` + `emit('submitted')`、失敗不關抽屜;接 T023（edit branch 留 T045）

**Checkpoint**:US1 完成 — base-web 可建立 user（依賴 Phase 6 build)

---

## Phase 4: User Story 2 — 刪除 / 批次刪除使用者（Priority: P2）

**Goal**:base-web user 列表的單筆 / 批次刪除接上 `/systemManage/{deleteUser,batchDeleteUser}`。

**Independent Test**:CDP 在 `/manage/user` 對 user 點刪除 / 批次刪除 → psql 確認軟刪、列表移除。

**Note**:US2 **零後端改動** —— `deleteUser`/`batchDeleteUser` alias 既有 `{id}`/`{ids}` 形狀已適用（per data-model E4）。

### US2 implementation

- [ ] T030 [P] [US2] 依 data-model E5 在 `base-web/src/service/api/system-manage.ts` 新增 `fetchDeleteUser({id})` → `request({url:'/systemManage/deleteUser',method:'delete',data})` + `fetchBatchDeleteUser({ids})` → `request({url:'/systemManage/batchDeleteUser',method:'delete',data})`;可平行

- [ ] T031 [US2] 依 data-model E6-b 改 `base-web/src/views/manage/user/index.vue`:`handleDelete(id)` 呼 `fetchDeleteUser({id})`、成功 `onDeleted()`;`handleBatchDelete()` 呼 `fetchBatchDeleteUser({ids:checkedRowKeys.value})`、成功 `onBatchDeleted()`;失敗皆不續行;接 T030

**Checkpoint**:US2 完成 — base-web 可刪除 / 批次刪除 user（依賴 Phase 6 build)

---

## Phase 5: User Story 3 — 編輯使用者（Priority: P3）

**Goal**:base-web user 編輯抽屜送出接上 `/systemManage/updateUser`,變更落 DB、密碼不被動。

**Independent Test**:CDP 對既有 user 點編輯 → 抽屜預填現值 → 改欄送出 → psql 確認變更生效、`password` hash 未變。

### US3 implementation

- [ ] T040 [US3] 依 data-model E1-a + E1-b 改 `rust-api/server/model/src/admin/input/sys_user.rs`:① 新增 `SystemManageUpdateUserInput`（同 `SystemManageAddUserInput` 欄位 + `id:String`)② `UpdateUserInput` **un-flatten**（移除 `#[serde(flatten)] user: UserInput`、改獨立欄位集),`password` 改 `Option<String>`(validator `length(min=6,max=100)` 維持);接 T020（同檔序列)

- [ ] T041 [US3] 依 data-model E2 改 `rust-api/server/service/src/admin/sys_user_service.rs` 的 `update_user`:取值由 `input.user.X` 改 `input.X`(un-flatten 後);`password` 改 `if let Some(pw)=input.password { user.password = Set(pw); }`(None 則不 touch);**原生 `/user` PUT 路徑共用 `UpdateUserInput` —— un-flatten 後該路徑(handler / service)任何 `input.user.X` 引用同步改為 `input.X`,由 T060 rust build 驗證無遺漏**;接 T040

- [ ] T042 [US3] 依 data-model E3 在 `rust-api/server/api/src/admin/sys_system_manage_api.rs` 新增 `update_user_for_systemmanage` transform handler:收 `SystemManageUpdateUserInput` → 轉 `UpdateUserInput`（`id` 帶入、同 T021 值域對映、`password=None` 不改密碼)→ 呼既有 `SysUserService::update_user`;接 T040、T041、T021（同檔序列)

- [ ] T043 [US3] 依 data-model E4 改 `rust-api/server/router/src/admin/sys_system_manage_route.rs`:`/updateUser` route 由 `post(SysUserApi::update_user)` 改 `post(SysSystemManageApi::update_user_for_systemmanage)`;接 T042、T022（同檔序列)

- [ ] T044 [P] [US3] 依 data-model E5 在 `base-web/src/service/api/system-manage.ts` 新增 `fetchUpdateUser(data)` → `request({url:'/systemManage/updateUser',method:'post',data})`;接 T023（同檔序列)、可平行於 rust

- [ ] T045 [US3] 依 data-model E6-a 改 `base-web/src/views/manage/user/modules/user-operate-drawer.vue` 的 `handleSubmit`:補 `operateType==='edit'` 分支 — 呼 `fetchUpdateUser({ ...model.value, id: props.rowData.id })`、成功 / 失敗處理同 add branch;接 T024、T044

**Checkpoint**:US3 完成 — base-web 可編輯 user（依賴 Phase 6 build)

---

## Phase 6: Shared Build + Acceptance

### Build

- [ ] T060 **C-V1** rebuild rust-api docker image:
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 build exit 0。fail → check alias DTO / transform handler / `UpdateUserInput` un-flatten / `update_user` 取值。接 T020-T043（全 rust 改動)

- [ ] T061 **C-V2** rebuild base-web image + 起 dev stack:
  ```bash
  DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web -f base-web/Dockerfile base-web/ 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait 2>&1 | tail -5
  docker compose -f docker-compose.yml -f docker-compose.dev.yml ps --format "table {{.Service}}\t{{.State}}"
  ```
  預期:兩 image build exit 0;5 service healthy + migration exited 0。接 T060、T023-T045（全 base-web 改動)

### Acceptance（對齊 contracts/verification-commands.md C-V3~C-V11)

- [ ] T062 [US1] **C-V3 + C-V4** addUser:curl `addUser` base-web 形狀建 `WFW1Test`（帶 userRoles 驗忽略)→ `code:0`;預設密碼 `123456` 登入通;不帶 `userGender` 建 `WFW1NoG` → psql 驗 `gender` NULL;`WFW1Test` 驗 `gender=male`/`status=enabled`。接 T061

- [ ] T063 [P] [US3] **C-V5** updateUser:curl `updateUser` 改 `WFW1Test`（不帶 password)→ psql 驗 `nick_name`/`gender`/`status` 變更 + `password` hash 前後一致(不改密碼)。接 T061、可平行

- [ ] T064 [P] [US2] **C-V6 + C-V7** delete:curl `deleteUser` 刪 `WFW1Test` → psql 驗 `deleted_at` 標記、row 留表;curl `batchDeleteUser` 刪 `WFW1NoG` → psql 驗批次軟刪。接 T061、可平行

- [ ] T065 [P] **C-V8** audit log:psql 查 `sys_operation_log` `module_name='sys_user'` 近 5 筆 → 含 C-V3~C-V7 的 INSERT/UPDATE/刪除 紀錄。接 T062-T064、可平行

- [ ] T066 [P] **C-V9** Casbin deny:curl GeneralUser token 打 `addUser` → `code:5001`。接 T061、可平行

- [ ] T067 **C-V10** CDP smoke:CDP 控制 Edge（127.0.0.1:9229）登入 base-web、走訪 `/manage/user`,完成 ① 新增抽屜建 user ② 編輯該 user ③ 單筆刪除 ④ 批次刪除 —— 每步驟確認列表即時 refresh、無 console error;⑤ **錯誤路徑(驗 FR-014/E-2)**:填重複帳號送出 → 確認抽屜不關 + 顯示錯誤;⑥ **regression(驗 SC-007)**:走訪 `/home` 確認 dashboard+動態 menu、`/manage/role` 確認列表渲染;測試 user 測完清除。Edge debug port 不通則 deferred manual-eyeball（比照 F7 / DESIGN-B §7）。接 T061

- [ ] T068 [P] **C-V11** 三邊 scope verify:
  ```bash
  (cd base-web && git diff HEAD --stat)                           # 預期 3 檔
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l   # 預期 0
  (cd rust-api && git diff HEAD --stat)                            # 預期 ~4 檔、無 migration
  ```
  預期:base-web 限 `system-manage.ts`+`user-operate-drawer.vue`+`user/index.vue`;nestjs 0 diff;rust-api 限 research 指出的 4 檔。接 T020-T045、可平行

- [ ] T069 [P] 清測試資料:psql `DELETE FROM sys_user WHERE username LIKE 'WFW1%';`(若 CDP / curl 測試 user 殘留)。接 T062-T067、可平行

**Checkpoint**:Phase 6 完成 — C-V1~C-V11 acceptance PASS;測試 user 已清、無 seed 污染。

---

## Phase 7: Polish & 多段式 Commit + Push wait（per CLAUDE.md §6.1）

### Stage 1a — rust-api worktree commit

- [ ] T100 在 rust-api worktree 內 commit:
  ```bash
  cd rust-api
  git status --short                              # 預期 4 檔 modified
  git add server/
  git commit -m "feat(rust-api): W-FW1 user CRUD systemManage alias 轉換層"
  # push 等 user 同意（per CLAUDE.md §5）
  cd ..
  ```

### Stage 1b — base-web worktree commit

- [ ] T101 在 base-web worktree 內 commit:
  ```bash
  cd base-web
  git status --short                              # 預期 3 檔 modified
  git add src/
  git commit -m "feat(base-web): W-FW1 user CRUD 接線 — drawer/list submit 接 systemManage"
  # push 等 user 同意
  cd ..
  ```

### Stage 2 — outer commit（031 feature branch）

- [ ] T102 回 outer + 單段 outer commit（spec docs + 兩 SHA pin):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 031-user-crud-wiring
  git add specs/031-user-crud-wiring/ docs/superpowers/031-feature-user-crud-wiring.md \
          docs/INTEGRATION-CHECKLIST.md .specify/feature.json CLAUDE.md rust-api base-web
  git commit -m "feat(spec): 031 user-crud-wiring — spec docs + rust-api/base-web SHA pin"
  ```
  > brainstorm doc `031-feature-*.md` + INTEGRATION-CHECKLIST follow-up 若已於前置 commit 落則不重複 add;outer + merge SHA 留 `<sha-pending>`、merge 後 T103 補

- [ ] T103 Push 等 user 同意:
  - 告知 user:「031 多段式 commit 已落（rust-api / base-web 已 commit、outer 在本機),要不要 push（3 個 branch）+ merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push**（per CLAUDE.md §5）
  - user 同意後:`cd rust-api && git push origin rev1-admin-rust-api && cd ..` → `cd base-web && git push origin rev1-admin-base-web && cd ..` → `git push origin 031-user-crud-wiring` → `git switch rev1-admin-root` → `git merge --no-ff 031-user-crud-wiring` → SHA fill 進 INTEGRATION-CHECKLIST + CLAUDE.md §10 marker → commit `docs(checklist): 031 SHA 填入` → `git push origin rev1-admin-root`（等 user 二次同意)

**Checkpoint**:Phase 7 完成 — 031 落地、多段式 commit 紀律遵守、base-web 限 3 檔 + nestjs 0 改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup（T001+T002） | Phase 2-7 | — |
| Phase 2 Foundational（T010） | Phase 3-5 | Phase 1 |
| Phase 3 US1（T020-T024） | Phase 6 build | Phase 2 |
| Phase 4 US2（T030-T031） | Phase 6 build | Phase 2 |
| Phase 5 US3（T040-T045） | Phase 6 build | Phase 2 + US1（T020 同檔、T021/T022 同檔序列) |
| Phase 6 build（T060-T061） | Phase 6 acceptance + Phase 7 | T020-T045 全到位 |
| Phase 6 acceptance（T062-T069） | Phase 7 | T061 |
| Phase 7 Commit（T100-T103） | — | 全 6 phase PASS |

**Story 獨立性**:US2（刪除、純 base-web、零後端)完全獨立。US1（建立)與 US3（編輯)共用 `input/sys_user.rs`、`sys_system_manage_api.rs`、`sys_system_manage_route.rs`、`user-operate-drawer.vue` → 同檔序列、US3 接 US1。整個 image build（T060/T061)需三 story 程式碼皆編譯通過。

**內部依賴**:T020→T021→T022（US1 rust 序列）;T023→T024（US1 base-web）;T040→T041→T042→T043（US3 rust 序列、T040 接 T020 同檔、T042 接 T021 同檔）;T044 接 T023 同檔;T045 接 T024+T044;T030→T031（US2）;T060→T061。

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 3 US1**:T020→T021→T022 rust 序列;T023 [P]（base-web、可平行於 rust）;T024 接 T023
- **Phase 4 US2**:T030 [P]、T031 接 T030 —— US2 整體可平行於 US1/US3 的 rust 工作（US2 零後端、base-web 僅動 `index.vue`、不與 drawer 衝突;`system-manage.ts` 與 US1/US3 同檔 → T030 與 T023/T044 同檔序列)
- **Phase 5 US3**:T040→T041→T042→T043 rust 序列;T044 [P];T045 接 T024+T044
- **Phase 6**:T060→T061 序列;T062 序列鏈 T061;T063/T064/T065/T066/T068/T069 [P];T067 接 T061
- **Phase 7**:T100→T101→T102→T103 嚴格序列（多段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3（US1）— 完成後 base-web 可建立 user（核心接線能力 + 確立 W-WEBUI 接線模式)。US2（刪除)+ US3（編輯)為增量交付。031 推薦走完整 Phase 1-7 一次到位（對齊 F7/F8/F12/F13/F030 同 session 模式)。

> ⚠️ 注意:三 story 程式碼同在一個 rust crate / 一個 base-web bundle — Phase 6 build（T060/T061)需 US1+US2+US3 全部編譯通過才能 rebuild image。

**全 30 task 預估時間**:40-60 分鐘（無複雜邏輯 — DTO/形狀對映/接線;rust + base-web 兩 image rebuild 占 ~5 min warm cache;acceptance C-V 為 curl/psql/CDP)。

**Critical path**:T001 → T002 → T010 → T020 → T021 → T022 →（T040 → T041 → T042 → T043 / T023 → T024 / T030 → T031）→ T044 → T045 → T060 → T061 → T062 →（T063-T069 並行)→ T100 → T101 → T102 → T103

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1]/[US2]/[US3] | ✓（T020-T024 US1 / T030-T031 US2 / T040-T045 US3 / 部分 acceptance 帶 story 標籤) |
| Setup / Foundational / build / Commit 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓ |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或 `/speckit-implement`**。
