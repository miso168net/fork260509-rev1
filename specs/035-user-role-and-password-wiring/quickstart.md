# Quickstart — W-FW5 user-role-and-password-wiring 驗證

## dev stack 啟動

```bash
cd <workspace root>
bash deploy/generate-dev-cert.sh   # 首次（每年 renew）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

rust-api 改動後重 build —— compose 無 `build:` 段，須手動 `docker build`：

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait   # 重建容器 + 重跑 migration
```

base-web 改動後重 build：

```bash
DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web ./base-web
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

## 帳號（CLAUDE.md §8.1）

| 帳號 | 角色 | 密碼 |
|---|---|---|
| `Soybean` | 超級管理員 | `123456` |
| `Administrator` | admin | `123456` |
| `GeneralUser` | 一般 | `123456` |

> ⚠️ 驗證 US2 / US3 會改動測試 user 的密碼與角色 —— 請挑**非超管**測試 user（或先 `getUserList` 看有哪些 user），改完後還原；**勿把超管 user 改到無法登入**。

## 驗證流程

1. curl 取 token：`POST http://127.0.0.1:11080/api/auth/login`（`{"userName":"Soybean","password":"123456"}`）。
2. 逐條跑 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V20。
3. psql：`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "<query>"`。
   - 使用者角色查詢：`SELECT ur.user_id, ur.role_id, r.code FROM sys_user_role ur JOIN sys_role r ON r.id = ur.role_id WHERE ur.user_id='<id>';`
   - 密碼 hash 格式檢查：`SELECT username, left(password, 12) FROM sys_user WHERE id='<id>';`（argon2 hash 以 `$argon2` 開頭）
4. CDP browser smoke：開 `http://127.0.0.1:11080`、登入，走訪：
   - `/manage/user`：對某 user 開編輯抽屜，確認角色欄預填、調整角色 + 填密碼送出，確認 UI 與 DB 一致；再開一次確認角色勾選一致。
   - 帳號中心（user-center）：修改密碼面板 —— 舊密碼錯 / 對、新密碼≠確認 三情境。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：A1 user_roles 填充 / A2 transform DTO + userRoles / A3 user→roles delta service / B1 update_user hash 修正 / B2 transform DTO + password / B3 changePassword DTO+service+route+handler + `/auth/changePassword` Casbin seed。
- **base-web worktree**（branch `rev1-admin-base-web`）：4 檔（`user-operate-drawer.vue` / `user-center/index.vue` / `system-manage.ts` / `auth.ts`）。
- **多段式 commit**（CLAUDE.md §4.1）：各 worktree 內 conventional commit + push fork → outer repo `git add base-web rust-api` 更新 SHA pin + 第二段 commit。
