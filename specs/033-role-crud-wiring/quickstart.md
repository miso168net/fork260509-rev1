# Quickstart — W-FW3 role-crud-wiring 驗證

## dev stack 啟動

```bash
cd <workspace root>
bash deploy/generate-dev-cert.sh   # 首次（每年 renew）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

rust-api 改動（E1–E5）後重 build：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build rust-api
```

base-web 改動後重 build：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build base-web
```

## 帳號（CLAUDE.md §8.1）

| 帳號 | 角色 | 密碼 |
|---|---|---|
| `Soybean` | 超級管理員 | `123456` |
| `Administrator` | admin | `123456` |
| `GeneralUser` | 一般 | `123456` |

## 驗證流程

1. curl 取 token：`POST http://127.0.0.1:11080/api/auth/login`（`{"userName":"Soybean","password":"123456"}`）。
2. 逐條跑 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V14。
3. psql：`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "<query>"`。
4. CDP browser smoke：開 `http://127.0.0.1:11080`、登入、走訪 `/manage/role`，新增 / 編輯 / 刪除 role，確認 UI 與 DB 一致。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：E1–E5。
- **base-web worktree**（branch `rev1-admin-base-web`）：3 檔（`system-manage.ts` / `role-operate-drawer.vue` / `role/index.vue`）。
- **多段式 commit**（CLAUDE.md §4.1）：各 worktree 內 conventional commit + push fork → outer repo `git add base-web rust-api` 更新 SHA pin + 第二段 commit。
