---
description: "Task list for 030 — systemManage status/gender alignment implementation"
---

# Tasks: 030 — systemManage status/gender alignment

**Input**: Design documents from `/specs/030-systemmanage-status-gender-alignment/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/verification-commands.md`](contracts/verification-commands.md) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**:
- 本 feature **有可測純函式面** — `map_status` / `map_gender` 為 O(1) 純函式映射,依 spec FR-017 + CLAUDE.md §4「production logic → 寫測試」**寫 rust 單元測試**(比照 F7.2 `test_map_role_alias` precedent)。
- **Acceptance**:curl + psql + `docker compose exec` + CDP browser smoke(per spec FR-018)→ 對齊 13 個 C-V(C-V1~C-V13、見 contracts/verification-commands.md)。

**Organization**:030 = 3 user story(US1 status 對齊 P1 MVP / US2 gender 顯示+篩選 P2 / US3 gender create-update P3)。Setup(2)+ Foundational(1)+ US1(3)+ US2(9)+ US3(2)+ shared build/acceptance(12)+ 兩段式 Commit(3)= **32 task**。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**:可並行(獨立檔案 / 獨立命令)
- **[Story]**:US1/US2/US3 標籤;Setup / Foundational / build/acceptance / Commit 無標籤
- 路徑:全部在 rust-api worktree(`rust-api/`);outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`

## Path Conventions

- **改(rust-api worktree)**:
  - `rust-api/server/model/src/admin/entities/sea_orm_active_enums.rs`(加 `Gender` enum)
  - `rust-api/server/model/src/admin/entities/sys_user.rs`(entity 加 `gender`)
  - `rust-api/server/model/src/admin/output/sys_system_manage.rs`(`map_status` / `map_gender` + 3 DTO)
  - `rust-api/server/model/src/admin/output/sys_user.rs`(`UserWithoutPassword` 加 `gender`)
  - `rust-api/server/model/src/admin/input/sys_user.rs`(`UserPageRequest` + `UserInput` 加 `gender`)
  - `rust-api/server/service/src/admin/sys_user_service.rs`(`find_paginated_users` 篩選 + create/update 寫入)
- **新增(rust-api worktree)**:`rust-api/migration/src/datas/m20260523_a_030_user_gender.rs`(+ 註冊於 `datas/mod.rs` / `lib.rs`)
- **不動**:`base-web/` 全程(per FR-012);nestjs fork;`menuType`/`iconType` 映射;`Status` enum 定義;Casbin/audit/soft-delete 路徑
- **Acceptance 執行**:outer repo root host-side bash、**dev stack**

---

## Phase 1: Setup（Shared Infrastructure）

- [ ] T001 確認當前 outer branch = `030-systemmanage-status-gender-alignment` + rust-api worktree branch = `rev1-admin-rust-api`、F14 已 merge in history,執行 `git branch --show-current && git log --oneline | grep -E 'F14' | head -1 && (cd rust-api && git branch --show-current)`(預期 outer=030-*、rust-api=rev1-admin-rust-api、history 含 F14 merge `1f20a0d`)

- [ ] T002 [P] 確認 acceptance 前置就位,執行 `docker images rust-api:rev1-admin-rust-api -q && curl -fsS "http://127.0.0.1:11080/api/systemManage/getRoleList?current=1&size=1" -H "Authorization: Bearer $(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"Soybean","password":"123456"}' | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)" | grep -o '"status":"[^"]*"'`(預期 rust-api image SHA 非空;getRoleList `status` 目前回 `"enabled"` — 拔除前 baseline)

---

## Phase 2: Foundational（Blocking Prerequisites）

**Purpose**:確認 030 的改動標的存在於 research 指出的位置(改動前 baseline)。

- [ ] T010 確認 030 改動標的就位,執行:
  ```bash
  grep -nE "pub status: Status" rust-api/server/model/src/admin/output/sys_system_manage.rs   # 預期 3 行(role/user/menu DTO)
  grep -n "user_gender: None" rust-api/server/model/src/admin/output/sys_system_manage.rs      # 預期 1 行(F7 硬寫)
  grep -nE "fn map_menu_type|fn map_icon_type" rust-api/server/model/src/admin/output/sys_system_manage.rs  # 既有 mapping pattern
  grep -nE "enum Status|enum MenuType" rust-api/server/model/src/admin/entities/sea_orm_active_enums.rs
  grep -n "pub status: Status" rust-api/server/model/src/admin/entities/sys_user.rs            # entity 既有 status 欄(gender 加在其後)
  grep -nE "struct UserInput|struct UserPageRequest" rust-api/server/model/src/admin/input/sys_user.rs
  ```
  預期:`sys_system_manage.rs` 3 個 `pub status: Status` + 1 個 `user_gender: None` + `map_menu_type`/`map_icon_type` 在;`sea_orm_active_enums.rs` 有 `Status`/`MenuType` enum;`sys_user` entity 有 `status` 欄;input DTO 有 `UserInput`/`UserPageRequest` — per research R-Q1~R-Q6

---

## Phase 3: User Story 1 — status 對齊、消除 i18n 錯誤（Priority: P1）🎯 MVP

**Goal**:`systemManage` 三個 Output DTO 的 `status` 經 `map_status` 映射成 base-web `EnableStatus` 的 `'1'/'2'`,消除 vue-i18n `INVALID_ARGUMENT`。

**Independent Test**:rebuild rust image → curl `getRoleList`/`getUserList`/`getMenuList` 確認 `status` 為 `"1"/"2"` → CDP 三表狀態欄渲染標籤、console `INVALID_ARGUMENT` 歸零。

### US1 implementation — status 對齊（rust-api worktree）

- [ ] T020 [US1] 依 data-model E3 在 `rust-api/server/model/src/admin/output/sys_system_manage.rs` 新增 `fn map_status(Status) -> String`:`Enabled→"1"` / `Disabled→"2"` / `Banned→"2"`(`Banned` arm 加 `warn!`,比照同檔 `map_icon_type` unexpected-arm warn 慣例);`map_status` 為 total function

- [ ] T021 [US1] 依 data-model E3 改 `rust-api/server/model/src/admin/output/sys_system_manage.rs` 三個 Output DTO:`SystemManageRoleOutput` / `SystemManageUserOutput` / `SystemManageMenuOutput` 的 `pub status: Status` → `pub status: String`;三個 `From` impl 的 `status: m.status` → `status: map_status(m.status)`;接 T020、同檔序列

- [ ] T022 [P] [US1] 在 `rust-api/server/model/src/admin/output/sys_system_manage.rs` 加 `#[cfg(test)] mod tests` 的 `map_status` 單元測試:`Enabled→"1"` / `Disabled→"2"` / `Banned→"2"` 三 case(per FR-017);接 T020、可平行於 acceptance

---

## Phase 4: User Story 2 — gender 欄位顯示與篩選（Priority: P2）

**Goal**:rust 補 `Gender` domain enum + `sys_user.gender` 欄位(migration + seed),`systemManage` user 列表回真實 `userGender`、支援 `userGender` 篩選。

**Independent Test**:migration apply → curl `getUserList` 確認 seed 用戶 `userGender` 為 `"1"/"2"` → curl `getUserList?userGender=1` 只回男性 → CDP user 表性別欄顯示標籤。

### US2 — gender domain type + schema（rust-api worktree)

- [ ] T030 [US2] 依 data-model E1 在 `rust-api/server/model/src/admin/entities/sea_orm_active_enums.rs` 新增 `Gender` active enum(變體 `Male`/`Female`、`string_value = "male"/"female"`、`enum_name = "gender"`、`#[serde(rename)]`),比照同檔 `Status`/`MenuType` 建模

- [ ] T031 [US2] 依 data-model E2-a 改 `rust-api/server/model/src/admin/entities/sys_user.rs`:`status: Status` 後加 `#[sea_orm(nullable)] pub gender: Option<Gender>`;import 加 `Gender`;接 T030

- [ ] T032 [US2] 依 data-model E2-b 新增 migration `rust-api/migration/src/datas/m20260523_a_030_user_gender.rs`:`up()` 三步 — ① Postgres 分支 `CREATE TYPE gender AS ENUM ('male','female')`(MySql/Sqlite 跳過、比照 `m20240815`)② `ALTER TABLE sys_user ADD COLUMN gender gender NULL` ③ `UPDATE sys_user` seed Soybean→`male`/Administrator→`male`/GeneralUser→`female`;`down()` 對應 drop column + drop type

- [ ] T033 [US2] 依 data-model E2-b 註冊 migration:`rust-api/migration/src/datas/mod.rs` 加 `mod` 宣告 + `rust-api/migration/src/lib.rs` 的 `Migrator` vec 加入;接 T032

### US2 — gender 讀路徑（rust-api worktree)

- [ ] T034 [P] [US2] 依 data-model E5-a 改 `rust-api/server/model/src/admin/output/sys_user.rs`:`UserWithoutPassword` struct 加 `pub gender: Option<Gender>`、`From<SysUserModel>` impl 加 `gender: model.gender`;import 加 `Gender`;接 T030

- [ ] T035 [US2] 依 data-model E4 改 `rust-api/server/model/src/admin/output/sys_system_manage.rs`:新增 `fn map_gender(Option<Gender>) -> Option<String>`(`Some(Male)→Some("1")` / `Some(Female)→Some("2")` / `None→None`);`SystemManageUserOutput` 的 `From` impl 既有 `user_gender: None` 改 `user_gender: map_gender(m.gender)`;import 加 `Gender`;接 T030、T034

- [ ] T036 [P] [US2] 依 data-model E5-b 改 `rust-api/server/model/src/admin/input/sys_user.rs`:`UserPageRequest` struct 加 `pub user_gender: Option<String>`(`#[serde(rename_all="camelCase")]` → 接 base-web 既送的 `userGender=` query param);可平行

- [ ] T037 [US2] 依 data-model E5-c 改 `rust-api/server/service/src/admin/sys_user_service.rs` 的 `find_paginated_users`:`params.user_gender` 為 `Some("1")` → 加 `gender = Gender::Male` Condition、`Some("2")` → `Gender::Female`、空/非法 → 不加條件(per spec E-3);接 T031、T036

- [ ] T038 [P] [US2] 在 `rust-api/server/model/src/admin/output/sys_system_manage.rs` 的 `#[cfg(test)] mod tests` 加 `map_gender` 單元測試:`Some(Male)→Some("1")` / `Some(Female)→Some("2")` / `None→None` 三 case(per FR-017);接 T030、T035、可平行

---

## Phase 5: User Story 3 — create/update 接受 gender（Priority: P3）

**Goal**:rust 的 user create/update 輸入接受 optional `gender`、寫入 `sys_user.gender`。

**Independent Test**:curl 建立帶 `gender` 的 user → `getUserList` 確認 `userGender` 反映;curl 更新既有 user gender → 確認生效。

### US3 — gender 寫路徑（rust-api worktree)

- [ ] T040 [US3] 依 data-model E6-a 改 `rust-api/server/model/src/admin/input/sys_user.rs`:`UserInput` struct 加 `pub gender: Option<Gender>`(optional;`CreateUserInput = UserInput`、`UpdateUserInput` 內含 `UserInput`、自動涵蓋);import 加 `Gender`;接 T030

- [ ] T041 [US3] 依 data-model E6-b 改 `rust-api/server/service/src/admin/sys_user_service.rs` 的 `create_user` 與 `update_user`:`SysUserActiveModel` 加 `gender: Set(input.gender)`;接 T031、T040

---

## Phase 6: Shared Build + Acceptance

### Build

- [ ] T060 **C-V1** rebuild rust-api docker image:
  ```bash
  DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
  ```
  預期 build exit 0。fail → check `Gender` enum 語法 / `map_status`/`map_gender` / entity / DTO / service import。接 T020-T041(全 US 改動)

- [ ] T061 **C-V2 + C-V3** 起 dev stack、migration apply:
  ```bash
  PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
  $PC up -d --wait 2>&1 | tail -5
  $PC ps --format "table {{.Service}}\t{{.State}}"
  $PC exec -T postgres psql -U soybean -d soybean_admin_rust -tAc "SELECT username,gender FROM sys_user WHERE username IN ('Soybean','Administrator','GeneralUser') ORDER BY username;"
  ```
  預期:5 service healthy + migration exited 0;`gender` PG enum + `sys_user.gender` 欄位 + 3 用戶 seed 落 DB。接 T060

### Acceptance（對齊 contracts/verification-commands.md C-V4~C-V13）

- [ ] T062 [US1] **C-V4** getRoleList status:curl `getRoleList` → 所有 `status` ∈ `{"1","2"}`、無 `"enabled"/"disabled"/"banned"`。接 T061

- [ ] T063 [US1] **C-V5** getUserList status + gender:curl `getUserList` → 每筆 `status` ∈ `{"1","2"}`、`userGender` ∈ `{"1","2",null}`、3 預設用戶 `userGender` 反映 seed。接 T061

- [ ] T064 [P] [US1] **C-V6** getMenuList status:curl `getMenuList/v2` → 所有 `status` ∈ `{"1","2"}`。接 T061、可平行

- [ ] T065 [P] [US2] **C-V7** userGender 篩選:curl `getUserList?userGender=1` 結果只含 `"1"`、`?userGender=2` 只含 `"2"`。接 T061、可平行

- [ ] T066 [US3] **C-V8** create user 帶/不帶 gender:① curl `POST /api/systemManage/addUser` 帶 `gender:"male"` 建 `GenderTest030` → psql 驗 `sys_user.gender='male'` ② curl 再建一個**不帶 `gender` 欄**的 user `GenderTest030NoG` → psql 驗其 `gender IS NULL`、`getUserList` 回 `userGender:null`(驗 SC-008 未填 gender user 相容 + US3 AS-3「gender optional 不破壞既有建立流程」)。2 個測試 user 於 T067 後一併清除。接 T061

- [ ] T067 [US3] **C-V9** update user gender:curl `PUT /api/systemManage/updateUser` 改 `GenderTest030` gender → psql 驗變更;測完 psql `DELETE` 清 2 個測試 user(`GenderTest030` + `GenderTest030NoG`)。接 T066

- [ ] T068 [P] [US1] **C-V10** Banned 收斂:psql 暫設一 role `status='banned'` → curl `getRoleList` 該 role `status` 回 `"2"` + rust-api log 有 `Banned` 收斂 `warn` → psql 還原。接 T061、可平行

- [ ] T069 [P] **C-V11** rust unit test:於 rust 容器內跑 `map_status` / `map_gender` 單元測試(host 無 cargo、比照 F7.2/F12 precedent);預期 test ok。接 T060、可平行

- [ ] T070 [US1] **C-V12** CDP smoke:CDP 控制 Edge(127.0.0.1:9229)登入 base-web、走訪 `/manage/user`+`/manage/role`+`/manage/menu`,擷取 console error;預期三表狀態欄渲染「啟用/禁用」標籤、vue-i18n `INVALID_ARGUMENT` 歸零、user 表性別欄對 seed 用戶顯示「男/女」。Edge debug port 不通則 deferred manual-eyeball(比照 F7 C-V10)。接 T061

- [ ] T071 [P] **C-V13** 三邊 scope verify:
  ```bash
  git diff HEAD -- base-web/ | wc -l                                   # 預期 0
  git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l        # 預期 0
  (cd rust-api && git diff HEAD --stat)                                 # 預期 ~7 檔改 + 1 migration 新增
  git status --short
  ```
  預期:base-web / nestjs fork 各 0 diff;rust-api scope 限 research 指出的檔。接 T020-T041、可平行

**Checkpoint**:Phase 6 完成 — C-V1~C-V13 acceptance PASS;測試 user(`GenderTest030`)已清除、無 seed 污染;C-V10 的 role status 已還原。

---

## Phase 7: Polish & 兩段式 Commit + Push wait（per CLAUDE.md §6.1）

### Stage 1 — worktree commit（rust-api）

- [ ] T100 在 rust-api worktree 內 commit + push wait:
  ```bash
  cd rust-api
  git status --short                              # 預期 ~7 檔 modified + 1 migration 新增
  git add server/ migration/
  git commit -m "feat(rust-api): 030 systemManage status/gender 對齊 — Status 映射 + gender 欄位"
  # push 等 user 同意(per CLAUDE.md §5)
  cd ..
  ```

### Stage 2 — outer commit（030 feature branch）

- [ ] T101 回 outer + stage outer 改動 + 單段 outer commit(spec docs + rust-api SHA pin):
  ```bash
  cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
  git branch --show-current                       # 預期 030-systemmanage-status-gender-alignment
  git add specs/030-systemmanage-status-gender-alignment/ docs/superpowers/030-feature-systemmanage-status-gender-alignment.md \
          .specify/feature.json CLAUDE.md rust-api
  git commit -m "feat(spec): 030 systemmanage-status-gender-alignment — spec docs + rust-api SHA pin"
  ```
  > brainstorm doc `030-feature-*.md` 若已於前置 commit 落則不重複 add;outer + merge SHA 留 `<sha-pending>`、merge 後 T102 補

- [ ] T102 Push 等 user 同意:
  - 告知 user:「030 兩段式 commit 已落(rust-api 已 commit、outer 在本機),要不要 push + merge --no-ff 回 rev1-admin-root + SHA fill follow-up?」
  - **不主動 push**(per CLAUDE.md §5)
  - user 同意後:`cd rust-api && git push origin rev1-admin-rust-api && cd ..` → `git push origin 030-systemmanage-status-gender-alignment` → `git switch rev1-admin-root` → `git merge --no-ff 030-systemmanage-status-gender-alignment` → SHA fill 進 INTEGRATION-CHECKLIST + CLAUDE.md §10 marker → commit `docs(checklist): 030 SHA 填入` → `git push origin rev1-admin-root`(等 user 二次同意)

**Checkpoint**:Phase 7 完成 — 030 落地、兩段式 commit 紀律遵守、base-web + nestjs fork 零改動、push 等 user 同意。

---

## Dependencies

| Phase | Blocks | Blocked by |
|---|---|---|
| Phase 1 Setup(T001+T002) | Phase 2-7 | — |
| Phase 2 Foundational(T010) | Phase 3-5 | Phase 1 |
| Phase 3 US1(T020-T022) | Phase 6 build | Phase 2 |
| Phase 4 US2(T030-T038) | Phase 6 build | Phase 2 |
| Phase 5 US3(T040-T041) | Phase 6 build | Phase 2 + US2(T030/T031 — Gender enum + entity) |
| Phase 6 build(T060-T061) | Phase 6 acceptance + Phase 7 | T020-T041 全到位 |
| Phase 6 acceptance(T062-T071) | Phase 7 | T061 |
| Phase 7 Commit(T100-T102) | — | 全 6 phase PASS |

**Story 獨立性**:US1(status、純 `sys_system_manage.rs`)完全獨立於 gender;US2(gender 讀、含 `Gender` enum + migration + entity)為 gender 基礎;US3(gender 寫)依賴 US2 的 `Gender` enum(T030)+ entity 欄位(T031)。整個 image build(T060)需三 story 程式碼皆編譯通過。

**內部依賴**:T020→T021(同檔 status)、T022 接 T020 [P];T030→T031(enum→entity)、T030→T034/T035/T040 [P];T032→T033(migration→註冊);T036→T037;T060→T061(build→stack)。

## Parallel Execution

- **Phase 1**:T001 序列、T002 [P]
- **Phase 3 US1**:T020→T021 序列;T022 [P]
- **Phase 4 US2**:T030 先;T031 / T034 接 T030;T032→T033 序列;T035 接 T030+T034;T036 [P];T037 接 T031+T036;T038 [P]
- **Phase 5 US3**:T040 接 T030;T041 接 T031+T040
- **跨 story**:US1 與 US2/US3 檔案僅 `sys_system_manage.rs` 重疊(US1 的 `map_status`/3 DTO 與 US2 的 `map_gender`/user DTO 同檔)→ 同檔序列、跨 story 不完全並行
- **Phase 6**:T060→T061 序列;T062/T063 序列鏈接 T061;T064/T065/T068/T069/T071 [P];T066→T067 序列
- **Phase 7**:T100→T101→T102 嚴格序列(兩段式 commit)

## Implementation Strategy

**MVP scope**:Phase 1 + 2 + 3(US1)— 完成後 `systemManage` 三端點 `status` 回 base-web `'1'/'2'`、vue-i18n `INVALID_ARGUMENT` 消除(核心 bug fix)。US2(gender 讀)+ US3(gender 寫)為功能新增、可在 MVP 後增量交付,但 030 推薦走完整 Phase 1-7 一次到位(對齊 F7/F8/F12/F13 同 session 模式)。

> ⚠️ 注意:三 story 程式碼同在一個 rust crate / 一個 image — Phase 6 build(T060)需 US1+US2+US3 全部編譯通過才能 rebuild image。「MVP 只交 US1」在邏輯分層上成立,但實務上 image 一次 build 含三者。

**全 32 task 預估時間**:30-45 分鐘(無複雜邏輯 — enum/欄位/映射函式/migration;rust image rebuild 占 2-3 min warm cache;acceptance C-V 為 curl/psql/CDP ~數分鐘)。

**Critical path**:T001 → T002 → T010 → T030 →(US1 T020-T022 / US2 T031-T038 / US3 T040-T041)→ T060 → T061 → T062 → T063 →(T064-T071 並行)→ T100 → T101 → T102

## Format Validation

| Check | 結果 |
|---|---|
| 所有 task 含 `- [ ]` checkbox | ✓ |
| 所有 task 含 T### ID | ✓ |
| User story phase task 含 [US1]/[US2]/[US3] | ✓(T020-T022 US1 / T030-T038 US2 / T040-T041 US3 / 部分 acceptance 帶 story 標籤) |
| Setup / Foundational / build / Commit 無 story 標籤 | ✓ |
| [P] marker 只用於可並行 task | ✓ |
| 每個 task 含明確檔案路徑或具體命令 | ✓ |

**Tasks 完成、ready for `/speckit-analyze` 或 `/speckit-implement`**。
