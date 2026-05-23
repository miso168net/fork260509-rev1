# Quickstart — W-FW6 role-authorization-completion 驗證

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
| `Soybean` | 超級管理員 ROLE_SUPER | `123456` |
| `Administrator` | admin ROLE_ADMIN | `123456` |
| `GeneralUser` | 一般 ROLE_USER | `123456` |

## 驗證流程

1. curl 取 token：`POST http://127.0.0.1:11080/api/auth/login`（`{"userName":"Soybean","password":"123456"}`）。
2. 逐條跑 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V27。
3. psql：`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "<query>"`
   - schema 檢查：`\d sys_role` 確認 home_route_name VARCHAR NULL 欄存在
   - N2 round-trip 對照：`SELECT id, name, code, home_route_name FROM sys_role WHERE id='<id>';`
   - N2 audit：`SELECT operation, entity_id, payload_after->'homeRouteName' FROM sys_operation_log WHERE entity_type='sys_role' AND entity_id='<id>' ORDER BY created_at DESC LIMIT 3;`
   - N3 audit：`SELECT operation, entity_id, payload_before->'menu_ids' AS before_menus, payload_after->'menu_ids' AS after_menus FROM sys_operation_log WHERE entity_type='sys_role' AND entity_id='<id>' AND (payload_after->'menu_ids' IS NOT NULL OR payload_before->'menu_ids' IS NOT NULL) ORDER BY created_at DESC LIMIT 3;`
   - N4 Casbin sync：`SELECT ptype, v0, v2 FROM casbin_rule WHERE v0 = '<new_code>' OR v0 = '<old_code>' ORDER BY v0;`
4. CDP browser smoke：開 `http://127.0.0.1:11080`、登入，走訪：
   - `/manage/role`：對某 role 開「菜單授權」抽屜 → 確認 home 下拉 render + 預填正確；改 home 送出；再開預填一致。
   - `/manage/role`：對某 role 開編輯抽屜 → 修改 roleCode 送出 → 列表新值顯示。
   - regression: `/manage/role` 既有 CRUD、`/manage/menu` 既有 CRUD、`/manage/user` 既有 CRUD。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：A1 migration + A2 Casbin seed migration + A3 entity + B1 input DTO + B2 service get_role_home/update_role_home + B3 update_role detect code 變動 + Casbin sync + notify_casbin_changed + B4/B5 assign_routes/users 補 audit + trait signature 加 actor + C1/C2/C3/C4/C5 api handlers + D1 router 註冊。
- **base-web worktree**（branch `rev1-admin-base-web`）：E1 system-manage.ts 加 2 service function + E2 menu-auth-modal.vue getHome/updateHome 接真 API。
- **多段式 commit**（CLAUDE.md §4.1）：base-web worktree commit + push fork → rust-api worktree commit + push fork → outer repo `git add base-web rust-api` 更新 SHA pin + 第三段 commit。
