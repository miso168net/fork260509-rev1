# Quickstart — W-FW8 button-auth-completion 驗證

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

1. **取 token**：`POST http://127.0.0.1:11080/api/auth/login`（`{"userName":"Soybean","password":"123456"}`）。
2. **逐條跑** [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V25。
3. **psql** 命令模板：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
     psql -U soybean -d soybean_admin_rust -c "<query>"
   ```

   常用 query：
   - **A1 seed 驗證**：`SELECT v0, v2, v3 FROM casbin_rule WHERE v2 LIKE '/systemManage/%Endpoint%' OR v2 LIKE '/systemManage/%RoleEndpoint%' ORDER BY v0, v2;`（應 6 row）
   - **assign_permission 結果**：`SELECT v2, v3 FROM casbin_rule WHERE v0 = '<roleCode>' AND ptype = 'p' ORDER BY v2;`
   - **audit row**：`SELECT operation, module_name, entity_id, payload_before->'endpointIds' AS bf, payload_after->'endpointIds' AS af, created_at FROM sys_operation_log WHERE module_name='sys_role' AND payload_after ? 'endpointIds' ORDER BY created_at DESC LIMIT 5;`
   - **grep audit_log::write_in_txn**（host shell from outer root）：`grep -n "audit_log::write_in_txn" rust-api/server/service/src/admin/sys_authorization_service.rs`（應 3 次）

4. **Casbin reload 驗證**：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml logs rust-api --since 5m 2>&1 \
     | grep -iE "casbin sync subscriber|invalidate" | tail -10
   ```

5. **CDP browser smoke**（per CLAUDE.md memory `reference_cdp_smoke_technique.md`）：開 Edge :9229 debug → 走訪 `http://127.0.0.1:11080`、登入 Soybean / 123456：
   - `/manage/role` → 對某 role 開「編輯」抽屜 → 點「按钮权限」 → modal 開、NTree 13 group、可展開、勾選 + 確認；
   - 新建 W-FW8 test role → modal 開 → 全 unchecked → 勾 2 個 → 确认 → toast「更新成功」 → 重開預填一致；
   - 回 regression: `/manage/role` 既有 menu-auth-modal home + role drawer roleCode（W-FW6）皆不退化。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：
  - A1 Casbin seed migration `m20260524_c_wfw8_endpoint_alias_seed.rs` + lib.rs register
  - A2 input DTO `SystemManageAssignRoleEndpointsInput`
  - A3 output DTO `EndpointTreeNode`
  - A4–A6 3 transform handler in sys_system_manage_api.rs
  - A7 router 3 條 RouteInfo + Router::route
  - B1 sys_authorization_service.rs `assign_permission` trait + impl signature 末尾 append `actor: &Actor` + audit_log::write_in_txn（txn commit 前）
  - B2 sys_authentication_api.rs `assign_permission` handler cascade（Extension<User> + Actor::from + 傳 &actor）

- **base-web worktree**（branch `rev1-admin-base-web`）：
  - E1 system-manage.ts 加 3 service function（inline EndpointTreeNode type + 3 fetch fn）
  - E2 button-auth-modal.vue 拿掉硬編 mock + 接 3 endpoint + onMounted Promise.all + setLoading + confirm 送出 + toast

- **多段式 commit**（CLAUDE.md §4.1）：base-web worktree commit + push fork → rust-api worktree commit + push fork → outer repo `git add base-web rust-api` 更新 SHA pin + 第三段 commit。
