# Quickstart: 030 — systemManage status/gender alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

本 feature 落地操作摘要 —— 給 implement 階段參考。詳細任務拆解見 `/speckit-tasks` 產出的 `tasks.md`。

純 rust-api worktree feature、base-web 0 diff、兩段式 commit、**有 migration**。

---

## 1. 改動清單（全 rust-api worktree）

```text
server/model/src/admin/entities/sea_orm_active_enums.rs   # E1: 加 Gender enum
server/model/src/admin/entities/sys_user.rs               # E2a: entity 加 gender: Option<Gender>
migration/src/datas/m20260523_a_030_user_gender.rs        # E2b: 新 migration（建 enum + 加欄 + seed）
migration/src/datas/mod.rs + migration/src/lib.rs         # E2b: 註冊 migration
server/model/src/admin/output/sys_system_manage.rs        # E3+E4: map_status / map_gender + 3 DTO
server/model/src/admin/output/sys_user.rs                 # E5a: UserWithoutPassword 加 gender
server/model/src/admin/input/sys_user.rs                  # E5b+E6a: UserPageRequest + UserInput 加 gender
server/service/src/admin/sys_user_service.rs              # E5c+E6b: find_paginated_users 篩選 + create/update 寫入
```

**不動**:`base-web/`、nestjs fork、`menuType`/`iconType` 既有映射、`Status` enum 定義、Casbin/audit/soft-delete 路徑。

---

## 2. 實作順序（建議）

1. **E1** `Gender` enum（`sea_orm_active_enums.rs`）—— 比照 `Status`。
2. **E2** `sys_user` entity 加 `gender` + 新 migration（建 PG enum + ALTER TABLE + seed 3 用戶）+ 註冊。
3. **E3** `map_status` + 三 Output DTO `status` 型別 `Status`→`String`。
4. **E4** `map_gender` + `SystemManageUserOutput` From impl。
5. **E5** `UserWithoutPassword.gender` + `UserPageRequest.user_gender` + `find_paginated_users` 篩選。
6. **E6** `UserInput.gender` + `create_user`/`update_user` 寫入。
7. **unit test** `map_status` / `map_gender`。

---

## 3. Build + 驗證

```bash
# rebuild rust-api image
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/

# 起 dev stack（migration 自動 apply gender enum + 欄位 + seed）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# 快驗
TOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"Soybean","password":"123456"}' | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -fsS "http://127.0.0.1:11080/api/systemManage/getUserList?current=1&size=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E '"status"|"userGender"'
# 預期:status "1"/"2"、userGender "1"/"2"/null
```

acceptance 依 `contracts/verification-commands.md` C-V1~C-V13 逐項驗(含 CDP smoke 確認 vue-i18n `INVALID_ARGUMENT` 歸零)。

---

## 4. 兩段式 commit（per CLAUDE.md §6.1）

```bash
# === Stage 1:rust-api worktree ===
cd rust-api
git add server/ migration/
git commit -m "feat(rust-api): 030 systemManage status/gender 對齊 — Status 映射 + gender 欄位"
# push 等 user 同意
cd ..

# === Stage 2:outer ===
git add specs/030-systemmanage-status-gender-alignment/ .specify/feature.json rust-api
git commit -m "feat(spec): 030 systemmanage-status-gender-alignment — spec docs + rust-api SHA pin"
# push + merge --no-ff + SHA fill follow-up — 等 user 同意
```

---

## 完成標誌

- ✅ `Gender` enum + `sys_user.gender` 欄位 + migration（建 enum + 加欄 + seed 3 用戶）
- ✅ `map_status`：三 systemManage Output DTO 的 `status` 回 base-web `'1'/'2'`
- ✅ `map_gender`：getUserList 回真實 `userGender`
- ✅ `userGender` 查詢篩選接線
- ✅ create/update user 接受並寫入 `gender`
- ✅ `map_status` / `map_gender` 單元測試
- ✅ C-V1~C-V13 acceptance PASS（CDP smoke 確認 vue-i18n `INVALID_ARGUMENT` 歸零）
- ✅ base-web 0 diff、nestjs 0 diff、兩段式 commit
