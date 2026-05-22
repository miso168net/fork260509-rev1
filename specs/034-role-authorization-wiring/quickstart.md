# Quickstart — W-FW4 role-authorization-wiring 驗證

## dev stack 啟動

```bash
cd <workspace root>
bash deploy/generate-dev-cert.sh   # 首次（每年 renew）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

rust-api 改動（E1–E5）後重 build —— compose 無 `build:` 段，須手動 `docker build`：

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

## 驗證流程

1. curl 取 token：`POST http://127.0.0.1:11080/api/auth/login`（`{"userName":"Soybean","password":"123456"}`）。
2. 逐條跑 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V13。
3. psql：`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "<query>"`。
   - 角色菜單授權查詢：`SELECT role_id, menu_id, domain FROM sys_role_menu WHERE role_id='<id>' ORDER BY menu_id;`
4. CDP browser smoke：開 `http://127.0.0.1:11080`、登入、走訪 `/manage/role`，對某角色開「菜單授權」modal，調整菜單樹勾選並送出，確認 UI 與 DB 一致。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：E1–E5（input DTO / 2 transform handler / 2 route / Extension wiring / Casbin seed migration）。
- **base-web worktree**（branch `rev1-admin-base-web`）：2 檔（`system-manage.ts` / `menu-auth-modal.vue`）。
- **多段式 commit**（CLAUDE.md §4.1）：各 worktree 內 conventional commit + push fork → outer repo `git add base-web rust-api` 更新 SHA pin + 第二段 commit。
