---

description: "Task list for 040 wire-id-consistency implementation"
---

# Tasks: 040 — wire-id-consistency

**Input**: Design documents from `/specs/040-wire-id-consistency/`  
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/verification-commands.md、quickstart.md

**Tests**: acceptance-only —— 本 feature 為 wire 形狀對映 + 移除既有 workaround + service annotation 對齊類、無新純函式邏輯、由 acceptance matrix（curl + CDP browser smoke + 039 regression）覆蓋。比照 039 / W-FW7 慣例，理由見 plan.md「Technical Context · Testing」。

**Organization**: 任務依 user story 分相（US1 P1 MVP = base-web critical modal body roleId 修；US2 P2 = rust raw endpoint wire DTO wrap；US3 P3 = parentId deserializer drop）。Setup 階段 = 環境確認；無 Foundational（各 theme 互不相依、可獨立執行）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔、無未完成相依）
- **[Story]**: 該任務所屬 user story（US1 / US2 / US3）
- 路徑相對 worktree root（`base-web/` / `rust-api/`）

---

## Phase 1: Setup

- [ ] T001 確認環境：outer 在 `040-wire-id-consistency` feature branch、base-web worktree 在 `rev1-admin-base-web`、rust-api worktree 在 `rev1-admin-rust-api`、Constitution v1.4.0（grep Principle IV 軌道權威為 INTEGRATION-DESIGN-W-WEBUI 文件、版本 1.4.0）、dev stack `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` healthy（quickstart.md Step 0）

---

## Phase 2: Foundational

**無 Foundational task** —— 本 feature 3 個 theme（A+B base-web / C rust deserializer / D rust wire wrap）互不相依、各自可獨立執行。spec 階段研究 R-Q1~R-Q5 已 resolved、無共用前置邏輯需先建。

---

## Phase 3: User Story 1 — base-web modal body roleId number wire 正確工作（P1）🎯 MVP

**Goal**：base-web 2 modal（button-auth + menu-auth）body 內 `roleId: String(props.roleId)` 拿掉、直送 number、TS 編譯 clean、CDP browser smoke 端到端「修改成功」toast。修 039 acceptance 漏掉的 critical 422 bug。

**Independent test**: CDP via Edge :9229 開瀏覽器 → 登入 Soybean → `/manage/role` → ROLE_SUPER 編輯抽屜 → 按钮权限 / 菜单授权 modal 端到端「修改成功」toast；nginx access log 200、rust log 0 「expected i64 got string」serde 錯；base-web `pnpm typecheck` exit 0。

- [ ] T002 [P] [US1] base-web `src/service/api/system-manage.ts` 4 處 inline type annotation 改：
  - line ~147 `fetchGetRoleHome(roleId: string)` → `roleId: Api.SystemManage.Role['id']`
  - line ~155 `fetchUpdateRoleHome(data: { roleId: string; home: ... })` → `roleId: Api.SystemManage.Role['id']`
  - line ~178 `fetchGetRoleEndpointIds(roleId: string)` + return `string[]` → `roleId: Api.SystemManage.Role['id']` + return `number[]`
  - line ~186 `fetchAssignRoleEndpoints(data: { roleId: string; endpointIds: string[] })` → `roleId: Api.SystemManage.Role['id']` + `endpointIds: number[]`
  （data-model.md A1；FR-002）

- [ ] T003 [P] [US1] base-web `src/views/manage/role/modules/button-auth-modal.vue`:
  - line 33 `fetchGetRoleEndpointIds(String(props.roleId))` → `fetchGetRoleEndpointIds(props.roleId)`
  - line 45 `{ roleId: String(props.roleId), endpointIds: checks.value }` → `{ roleId: props.roleId, endpointIds: checks.value }`
  - `checks` 型 `shallowRef<string[]>` → `shallowRef<number[]>`（隨 T002 fetchGetRoleEndpointIds 返回型 `number[]` 對齊；若有 cast / template usage 同步調整）
  （依 T002；data-model.md A2；FR-003/005）

- [ ] T004 [P] [US1] base-web `src/views/manage/role/modules/menu-auth-modal.vue`:
  - line 37 `fetchGetRoleHome(String(props.roleId))` → `fetchGetRoleHome(props.roleId)`
  - line 46 `{ roleId: String(props.roleId), home: ... }` → `{ roleId: props.roleId, home: ... }`
  （依 T002；data-model.md A2；FR-003/005）

- [ ] T005 [US1] base-web build + typecheck gate（依 T002 + T003 + T004）：
  - `cd base-web && pnpm install && pnpm typecheck` → exit 0、無 error 輸出
  - `pnpm build` → clean
  - 預期 E-1 場景（cascade type error 超出 §4 邊界）若觸發、停 + 按 plan E-7 紀律處理（W-FW9 §4 邊界內必修、外留 backlog）
  - 完成 US1 acceptance C-V3/C-V4/C-V5（contracts/verification-commands.md）

**Checkpoint**: US1 可獨立交付 —— base-web TS 編譯 clean + grep `String(<idField>)` 餘料 0 命中 + （下個 phase T015 rebuild base-web image 後）CDP smoke C-V1/C-V2 即可跑。

---

## Phase 4: User Story 2 — rust raw endpoint wire 表示一致 numeric id（P2）

**Goal**：3 entity（sys_role / sys_user / sys_access_key）raw endpoint output 透過新 wire DTO（`RoleDetail` / `UserDetail` / `AccessKeyDetail`）`.map(Detail::from)` wrap、wire 上 `id: i64` 從 `model.display_id`、**無** `displayId: i64` 重複欄位。Sea-ORM Model 0 改動。

**Independent test**: curl `GET /api/role/<i64>` / `GET /api/role/list` / `GET /api/user/<i64>` / `GET /api/user/list` / `GET /api/access-key/list`：response `data.id`（或 `data.records[].id`）100% JSON number、**無** `displayId` 欄、其他業務欄位完整。

### Phase 4a: Output struct + From impl（[P] 各 entity 互不相關）

- [ ] T006 [P] [US2] rust-api 新增 `RoleDetail` output struct（建議 new file `server/model/src/admin/output/sys_role.rs`，sibling 既有 sys_user.rs / sys_endpoint.rs 模式對齊）+ `From<sys_role::Model>` impl 內 `id: m.display_id`；含其他 role 業務欄位 mirror Sea-ORM Model（pid / code / name / description / status / home_route_name / created_at / created_by / updated_at / updated_by）；implementer 開 file 前先 read entity sys_role::Model 確認欄位列表 + status enum 字串轉換體例（grep `impl Display` 或 `format!("{:?}"` for Status）（data-model.md D1；FR-008）

- [ ] T007 [P] [US2] rust-api 擴展 `server/model/src/admin/output/sys_user.rs` 加 `UserDetail` output struct（與既有 `UserWithoutPassword` 並存、不重用）+ `From<sys_user::Model>` impl 內 `id: m.display_id`；含其他 user 業務欄位 mirror Sea-ORM Model（domain / username / nick_name / avatar / email / phone_number / status / gender / created_at 等；**不含 password**）（data-model.md D2；FR-009）

- [ ] T008 [P] [US2] rust-api 新增 `server/model/src/admin/output/sys_access_key.rs` 新檔（sibling output dir 尚無此 entity 對應檔）含 `AccessKeyDetail` output struct + `From<sys_access_key::Model>` impl 內 `id: m.display_id`；implementer 開 file 前 read entity sys_access_key::Model 確認欄位列表（access_key_id / status / description / created_at 等；**不含 secret 等敏感欄**，sibling existing endpoint behavior 對齊）（data-model.md D3；FR-010）

- [ ] T009 [US2] rust-api `server/model/src/admin/output/mod.rs` 註冊新模組 `pub mod sys_role;`（若 T006 開新檔）+ `pub mod sys_access_key;`（T008 新檔）；T007 既有 `pub mod sys_user;` 已註冊不動（依 T006/T008）

### Phase 4b: Handler `.map(Detail::from)` wrap（[P] 各 api file 互不相關）

- [ ] T010 [P] [US2] rust-api `server/api/src/admin/sys_role_api.rs` 5 handler 改 `.map(RoleDetail::from)` wrap（依 T006）：
  - `get_paginated_roles` (line ~18) — `Res<PaginatedData<RoleDetail>>`（map `records.into_iter().map(RoleDetail::from)`、保留 page meta）
  - `create_role` (line ~28) — `Res<RoleDetail>`（map RoleDetail::from）
  - `get_role` (line ~38) — `Res<RoleDetail>`
  - `update_role` (line ~47) — `Res<RoleDetail>`
  - `get_all_roles` (line ~73) — `Res<Vec<RoleDetail>>`（map collect）
  `delete_role` (line ~61) 返 `Res<()>` 不動
  （data-model.md D4；FR-011；research.md R-Q3 補完）

- [ ] T011 [P] [US2] rust-api `server/api/src/admin/sys_user_api.rs` 5 handler 改 `.map(UserDetail::from)` wrap（依 T007）：
  - `get_all_users` (line ~22) — `Res<Vec<UserDetail>>`
  - `get_paginated_users` (line ~28) — `Res<PaginatedData<UserDetail>>`
  - `create_user` (line ~72) — `Res<UserDetail>`
  - `get_user` (line ~82) — `Res<UserDetail>`
  - `update_user` (line ~91) — `Res<UserDetail>`
  3 個 delete handler（`delete_user` / `delete_user_by_body` / `batch_delete_users`）+ 2 個 policy handler（`remove_policies` / `add_policies`）返 `Res<()>` 或 `Res<bool>` 不動
  （data-model.md D5；FR-012；research.md R-Q3 補完）

- [ ] T012 [P] [US2] rust-api `server/api/src/admin/sys_access_key_api.rs` 2 handler 改 `.map(AccessKeyDetail::from)` wrap（依 T008）：
  - `get_paginated_access_keys` (line ~19) — `Res<PaginatedData<AccessKeyDetail>>`
  - `create_access_key` (line ~29) — `Res<AccessKeyDetail>`
  `delete_access_key` (line ~39) 返 `Res<()>` 不動
  （data-model.md D6；FR-013；research.md R-Q3 補完）

**Checkpoint**: US2 可獨立交付 —— rust raw endpoint wire shape 對齊 numeric id、Model 0 改動、internal SoT 完整保留。

---

## Phase 5: User Story 3 — rust 內部 deserializer workaround 拆乾淨（P3）

**Goal**：rust-api `sys_menu` input parentId 接收路徑乾淨、只接受 number 型 parentId、不再有「number or string」雙路徑 workaround；code 行數少 17 行。

**Independent test**: grep `deserialize_parent_id_compat` in `rust-api/server/` → 0 命中；curl `POST /api/systemManage/addMenu` body number parentId → envelope 0；同 body string parentId → envelope 4xx serde deser error。

- [ ] T013 [US3] rust-api `server/model/src/admin/input/sys_menu.rs` 拆 parentId deserializer workaround：
  - 刪除 `deserialize_parent_id_compat` 函式（line ~7-23、~17 行）
  - 對應 `MenuInput.parent_id` (line ~127) + `UpdateMenuInput.parent_id` (line ~157) 拆 `#[serde(deserialize_with = "deserialize_parent_id_compat")]` 屬性
  - `parent_id: i32` 改 plain serde default（無 deserializer attribute）
  - implementer 開 file 前 grep 確認其他 file 無依賴此函式（`grep -rn "deserialize_parent_id_compat" rust-api/server/`、預期僅 sys_menu.rs 1 個 callsite）
  （data-model.md C1；FR-006/007）

**Checkpoint**: US3 可獨立交付 —— deserializer workaround 已拆、code 簡化、base-web typings 已對齊 number-only 保證 consumer 不撞 422。

---

## Phase 6: Polish & 收尾

- [ ] T014 build rust-api image：`DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api`（依 T009-T013）

- [ ] T015 build base-web image：`DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web ./base-web`（依 T005）

- [ ] T016 dev stack 重啟：`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`；本 feature 0 schema migration、migration 容器 0 套用（依 T014 + T015）

- [ ] T017 全 C-V matrix C-V1~C-V28 跑完一輪：
  - **C-V1/C-V2** CDP browser smoke 必過：button-auth modal + menu-auth modal 「修改成功」toast（rust log 0 serde 錯）
  - **C-V3/C-V4/C-V5** base-web TS clean + 餘料 0 命中
  - **C-V6/C-V7/C-V8** rust parentId deserializer drop 正確
  - **C-V9~C-V14** 3 entity raw endpoint wire DTO wrap（單筆 / list / create+update）
  - **C-V15~C-V22** 039 regression + internal SoT 不退化
  - **C-V23~C-V28** scope discipline（§4 邊界 / Model 不動 / 0 schema migration / 0 input 改 / DESIGN-W-WEBUI 含 W-FW9）
  （依 T016；contracts/verification-commands.md）

- [ ] T018 outer 更新 `docs/INTEGRATION-DESIGN-W-WEBUI.md`：§7 加 `§7.4 W-FW9 wire-id-consistency` 條目（既 §7.4 執行順序 → §7.5）；內容含 W-FW9 範疇 + §4 邊界內 base-web 4 檔清單 + 修 W-FW6/W-FW8 留下 modal body 餘料的歷史關係（data-model.md E1；FR-019）

- [ ] T019 三段式 commit + push（base-web + rust-api 都有改動、走完 3 段）：
  - **第一段** base-web worktree commit + push fork（`rev1-admin-base-web`、push 前 user 同意 gate per CLAUDE.md §5）
  - **第二段** rust-api worktree commit + push fork（`rev1-admin-rust-api`、push 前同意 gate）
  - **第三段** outer `git add base-web rust-api docs/ CLAUDE.md` 更新 SHA pin 雙 worktree + DESIGN-W-WEBUI doc + INTEGRATION-CHECKLIST.md Current Focus + 已完成里程碑 + CLAUDE.md SPECKIT marker reset + commit on `040-wire-id-consistency` feature branch + push origin（同意 gate）
  CLAUDE.md §4.1

- [ ] T020 invoke `superpowers:finishing-a-development-branch` —— merge 040 feature branch 回 `rev1-admin-root`（CLAUDE.md §3 step 標準收尾）+ 刪 feature branch + 回填 outer/merge SHA commit（同 039 體例：base-web push fork → rust-api push fork → outer feature branch push → outer git switch rev1-admin-root → git merge --no-ff → 刪 feature branch local + remote → 回填 SHA + push rev1-admin-root）

---

## Dependencies

```text
T001 (Setup) → 各 US 起點
                  │
                  ▼
              Phase 3 US1（P1 MVP、base-web critical 修）
              ├── T002 [P] service.ts 4 處 inline type
              ├── T003 [P] button-auth-modal.vue（依 T002）
              ├── T004 [P] menu-auth-modal.vue（依 T002）
              └── T005 base-web typecheck/build（依 T003 + T004）
              │
              │   並行（互不相依）
              │
              ▼
              Phase 4 US2（P2、rust raw endpoint wire DTO wrap）
              ├── Phase 4a Output struct [P 3 個]
              │     T006 [P] RoleDetail（sys_role.rs new）
              │     T007 [P] UserDetail（sys_user.rs extend）
              │     T008 [P] AccessKeyDetail（sys_access_key.rs new）
              │     T009 output/mod.rs register（依 T006/T008）
              └── Phase 4b Handler wrap [P 3 個]
                    T010 [P] sys_role_api（依 T006）
                    T011 [P] sys_user_api（依 T007）
                    T012 [P] sys_access_key_api（依 T008）
              │
              │   並行（互不相依）
              │
              ▼
              Phase 5 US3（P3、rust deserializer drop）
              └── T013 sys_menu.rs parentId workaround drop
              │
              ▼
              Phase 6 Polish & 收尾
                    T014 build rust-api image（依 T009-T013）
                    T015 build base-web image（依 T005）
                    T016 dev stack 重啟（依 T014 + T015）
                    T017 全 C-V matrix（依 T016）
                    T018 DESIGN-W-WEBUI doc 加 W-FW9（獨立、可平行 T014/T015）
                    T019 三段式 commit + push（依 T017 + T018）
                    T020 finishing-a-development-branch（依 T019）
```

**Story 獨立性**: 
- US1（P1）為主要實作；US2 / US3 為平行可獨立進行
- US1 + US2 + US3 三者可同時 dispatch 給多 implementer subagent（base-web + rust-api 工作互不相干、各 theme 不重疊）
- US1 失敗 / 退出不影響 US2 / US3 可獨立交付

**檔案重疊**：
- US1 跨 3 檔（service.ts + 2 modal vue）—— 純 base-web
- US2 跨 7 檔（3 output struct + 1 mod.rs + 3 api file）—— 純 rust-api
- US3 跨 1 檔（sys_menu.rs）—— 純 rust-api
- 0 base-web ↔ rust-api 共用檔；0 跨 US 共用檔

## Parallel Execution

- **Phase 1 T001**：單 task、無 [P]
- **Phase 3 US1 T002-T004 [P]**：service.ts + 2 modal、互不相干、可平行 dispatch；T005 typecheck 必須序列在後
- **Phase 4 US2 T006-T008 [P]**（3 output struct）+ T010-T012 [P]（3 handler wrap）：可全 [P] dispatch；T009 mod.rs register 介於 output 和 handler 之間（序列、依 T006/T008）
- **Phase 5 US3 T013**：單 task、與 US1 + US2 全平行（純 rust-api 單檔）
- **Phase 6 polish T014-T016 序列**（build → 重啟 → acceptance）；T017 / T018 可平行；T019/T020 序列

**跨 US 並行**：US1（base-web）+ US2（rust 7 檔）+ US3（rust 1 檔）三 user story 完全互不相干、可同時跑 3 個 implementer subagent；只有 Phase 6 polish 階段需序列等所有 US 完成。

## Implementation Strategy

- **MVP = US1**（Phase 1 + 3）：base-web 2 modal body roleId String→number 即達 MVP（修 039 critical bug，可獨立驗收）。
- **增量交付**: US1 → US2 + US3 並行 → 一次 polish。每 US phase 完成即為可獨立驗收增量。
- **build 批次**: T014（rust-api）+ T015（base-web）平行 build、T016 一次重啟、T017 全 C-V matrix；最 efficient 流程。
- **執行**: 交棒 `superpowers:executing-plans` → `subagent-driven-development`，每單元 fresh implementer subagent + 兩階段 review（spec compliance → code quality）。建議執行單元：
  - ① US1 Phase 3 base-web critical 修（T002 + T003 + T004 + T005）—— 1 subagent batch base-web 3 檔 + typecheck gate
  - ② US2 Phase 4a Output struct（T006 + T007 + T008 + T009）—— 1 subagent batch 3 entity output struct + mod register
  - ③ US2 Phase 4b Handler wrap（T010 + T011 + T012）—— 1 subagent batch 3 api file handler wrap
  - ④ US3 Phase 5 deserializer drop（T013）—— 1 subagent，small isolated task
  - ⑤ Phase 6 build + acceptance + 收尾（T014-T020）—— controller 自跑 build + acceptance + commit + finishing-a-development-branch
- **base-web + rust-api 各自改動**：本 feature 三段式 commit 全套使用（base-web 第一段 + rust-api 第二段 + outer 第三段）；CLAUDE.md §4.1 完整 pattern。
- **比照 039 規模**（中等 rust-only feature）小：base-web 3 檔 + rust-api 8 檔 + 1 doc、20 task；無 schema migration、無 service 邏輯改動。
