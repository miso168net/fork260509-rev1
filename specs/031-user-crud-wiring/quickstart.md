# Quickstart: W-FW1 — user-crud-wiring

**Phase**: 1（Design & Contracts）
**Date**: 2026-05-22

本 feature 落地操作摘要 —— 給 implement 階段參考。詳細任務拆解見 `/speckit-tasks` 產出的 `tasks.md`。

雙 worktree feature（rust-api + base-web）、base-web 0→3 檔改、**無 migration**、多段式 commit。

---

## 1. 改動清單

```text
# rust-api worktree（後端 alias 轉換層）
server/model/src/admin/input/sys_user.rs            # E1: + SystemManageAddUserInput/UpdateUserInput;UpdateUserInput un-flatten + password→Option
server/service/src/admin/sys_user_service.rs        # E2: update_user password 條件式 Set + un-flatten 取值
server/api/src/admin/sys_system_manage_api.rs       # E3: + add_user/update_user_for_systemmanage transform handler
server/router/src/admin/sys_system_manage_route.rs  # E4: addUser/updateUser route → 新 transform handler

# base-web worktree（前端接線）
src/service/api/system-manage.ts                    # E5: + fetchAddUser/fetchUpdateUser/fetchDeleteUser/fetchBatchDeleteUser
src/views/manage/user/modules/user-operate-drawer.vue  # E6: handleSubmit 接 add/update
src/views/manage/user/index.vue                     # E6: handleDelete/handleBatchDelete 接 delete/batchDelete
```

**不動**:DB schema（無 migration)、base-web 型別 / 表格 render / router / store / i18n、Casbin policy seed、nestjs fork、`deleteUser`/`batchDeleteUser` alias。

---

## 2. 實作順序（建議）

1. **E1** rust input DTO —— 加 2 個 alias DTO + `UpdateUserInput` un-flatten（`password: Option`）。
2. **E2** `update_user` —— 取值改 un-flatten、`password` 條件式 `Set`;原生 `/user` PUT handler 連帶調整取值。
3. **E3** transform handler —— `add_user`/`update_user_for_systemmanage`（形狀對映 + `domain`/`password` 預設）。
4. **E4** route —— `addUser`/`updateUser` 改 mount 新 handler。
5. rust cargo build 通過。
6. **E5** base-web 4 個 service function。
7. **E6** `handleSubmit` + `handleDelete` / `handleBatchDelete` 接線。

---

## 3. Build + 驗證

```bash
# rebuild 兩 image
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/
DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web -f base-web/Dockerfile base-web/

# 起 dev stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

acceptance 依 `contracts/verification-commands.md` C-V1~C-V11 逐項驗（含 CDP smoke 確認 4 操作端到端通)。

---

## 4. 多段式 commit（per CLAUDE.md §6.1）

```bash
# === Stage 1a:rust-api worktree ===
cd rust-api
git add server/
git commit -m "feat(rust-api): W-FW1 user CRUD systemManage alias 轉換層"
# push 等 user 同意
cd ..

# === Stage 1b:base-web worktree ===
cd base-web
git add src/
git commit -m "feat(base-web): W-FW1 user CRUD 接線 — drawer/list submit 接 systemManage"
# push 等 user 同意
cd ..

# === Stage 2:outer ===
git add specs/031-user-crud-wiring/ .specify/feature.json rust-api base-web
git commit -m "feat(spec): 031 user-crud-wiring — spec docs + rust-api/base-web SHA pin"
# push + merge --no-ff + SHA fill follow-up — 等 user 同意
```

---

## 完成標誌

- ✅ rust-api systemManage `addUser`/`updateUser` alias 轉換層（base-web 形狀 → domain 形狀)
- ✅ `update_user` password optional（不送不改)
- ✅ base-web 4 個寫入 service function
- ✅ user 抽屜 handleSubmit + 列表 delete/batchDelete 接線
- ✅ C-V1~C-V11 acceptance PASS（含 CDP smoke 建立/編輯/刪除/批次刪除）
- ✅ base-web 改動限 3 檔、nestjs 0 diff、無 migration、多段式 commit
