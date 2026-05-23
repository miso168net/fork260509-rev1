# Quickstart — 039 rust-entity-id-numeric-migration 驗證

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

base-web **0 改動**（本 feature scope）— 不需重 build base-web image。

## 帳號（CLAUDE.md §8.1）

| 帳號 | 角色 | 密碼 |
|---|---|---|
| `Soybean` | 超級管理員 ROLE_SUPER | `123456` |
| `Administrator` | admin ROLE_ADMIN | `123456` |
| `GeneralUser` | 一般 ROLE_USER | `123456` |

## 驗證流程

1. **取 token**：`POST http://127.0.0.1:11080/api/auth/login`（`{"userName":"Soybean","password":"123456"}`）。
2. **逐條跑** [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V31。
3. **psql** 命令模板：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
     psql -U soybean -d soybean_admin_rust -c "<query>"
   ```

   常用 query：
   - **5 entity 加 display_id 欄驗證**：`\d sys_user` / `\d sys_role` / `\d sys_endpoint` / `\d sys_organization` / `\d sys_access_key` 各應顯示 `display_id | bigint | not null` + `idx_<table>_display_id` INDEX
   - **5 entity backfill 唯一性**：
     ```sql
     SELECT 'sys_user' AS tab, COUNT(*) AS total, COUNT(DISTINCT display_id) AS uniq FROM sys_user
     UNION ALL SELECT 'sys_role', COUNT(*), COUNT(DISTINCT display_id) FROM sys_role
     UNION ALL SELECT 'sys_endpoint', COUNT(*), COUNT(DISTINCT display_id) FROM sys_endpoint
     UNION ALL SELECT 'sys_organization', COUNT(*), COUNT(DISTINCT display_id) FROM sys_organization
     UNION ALL SELECT 'sys_access_key', COUNT(*), COUNT(DISTINCT display_id) FROM sys_access_key;
     ```
     每 row 必須 `total = uniq`、且 `display_id != 0`
   - **display_id range 驗證**（C-V4）：
     ```sql
     SELECT MIN(display_id), MAX(display_id), COUNT(*) FROM sys_user;
     ```
     MIN/MAX 應在 `[1, 2^53)` 範圍內、高位 41bit 對應 2024-2026 epoch ms（從 EPOCH_2020 offset）
   - **5 entity 全有 display_id**（C-V27）：
     ```sql
     SELECT table_name, column_name FROM information_schema.columns
     WHERE column_name='display_id' AND table_schema='public' ORDER BY table_name;
     ```
     應顯示 5 row（sys_access_key / sys_endpoint / sys_organization / sys_role / sys_user）
   - **不該動的 schema 不退化**（C-V26）：
     ```sql
     SELECT table_name FROM information_schema.columns
     WHERE column_name='display_id' AND table_schema='public';
     ```
     **不能**含 sys_menu / sys_domain / sys_login_log / sys_operation_log / sys_tokens / casbin_rule / sys_user_role / sys_role_menu
   - **audit_log payload 仍 ULID**（C-V19）：
     ```sql
     SELECT operation, module_name, entity_id,
            payload_before::text AS bf, payload_after::text AS af, created_at
     FROM sys_operation_log
     WHERE module_name='sys_role' AND payload_after ? 'endpointIds'
     ORDER BY created_at DESC LIMIT 5;
     ```
     entity_id 應為 ULID 字串；payload_before/after 內 `endpointIds` 應為 ULID 字串集合

4. **Snowflake helper unit test**（C-V1）：

   ```bash
   cd rust-api
   cargo test --package server-global snowflake::tests::test_unique_and_time_ordered --release
   # 或於 docker 內：
   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec rust-api cargo test snowflake
   ```

5. **API output wire 型驗證**（C-V6 / C-V7 / C-V8）：

   ```bash
   TOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"userName":"Soybean","password":"123456"}' \
     | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])")
   
   # C-V6: getUserList id 為 JSON number
   curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:11080/api/systemManage/getUserList | python3 -c "
   import sys, json
   d = json.load(sys.stdin)
   first = d['data']['records'][0]
   print(f\"id type: {type(first['id']).__name__}, value: {first['id']}\")
   assert isinstance(first['id'], int), f'id should be int, got {type(first[\"id\"]).__name__}'"
   
   # C-V7: getRoleList id 為 JSON number
   curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:11080/api/systemManage/getRoleList | python3 -c "
   import sys, json
   d = json.load(sys.stdin)
   first = d['data']['records'][0]
   assert isinstance(first['id'], int), f'role id should be int, got {type(first[\"id\"]).__name__}'"
   ```

6. **CDP browser smoke**（per CLAUDE.md memory `reference_cdp_smoke_technique.md`，C-V29 / C-V30 / C-V31）：開 Edge :9229 debug → 走訪 `http://127.0.0.1:11080`、登入 Soybean / 123456：
   - `/manage/role` → 對 ROLE_SUPER 開「编辑」抽屜 → 點「按钮权限」→ modal 開、tree 12 group、勾 2 endpoint → 「确认」 → 「修改成功」 toast（W-FW8 端到端不退化、endpoint id 改 number 後 base-web JS 仍 work）；
   - `/manage/user` → user 列表正確 render、row 編輯/刪除工作；
   - `/manage/menu` → menu tree 正確 render（W-FW7 既有不退化）；
   - `/manage/role` → 角色 home dropdown（W-FW6 N2）、roleCode 改名（W-FW6 N4）不退化。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：
  - A1 Snowflake helper `server/global/src/snowflake.rs` + `lib.rs` 加 `pub mod snowflake;`
  - A2 5 entity Sea-ORM entity 加 `pub display_id: i64`
  - A3 schema migration `m20260524_d_add_display_id_to_business_entities.rs` + lib.rs register
  - A4 backfill migration `m20260524_e_backfill_display_id.rs` + lib.rs register
  - A5 5 entity service create path 加 `display_id: Set(snowflake::next_display_id())` + sys_endpoint sync 階段補
  - A6 input DTO 改型（sys_authorization.rs / sys_role.rs 等 ~9 處）
  - A7 handler Path<String> → Path<i64>（~6-8 處）
  - A8 5 service 加 `lookup_ulid_by_display_id` trait method
  - A9 5 entity output struct id 改 i64 + From impl 改 model.display_id（~6 處）

- **base-web worktree**（branch `rev1-admin-base-web`）：**0 改動**
- **nestjs**：0 改動（DESIGN-B、退場）

- **多段式 commit**（CLAUDE.md §4.1，本 feature 為 rust-only 簡化版）：
  1. **第一段** rust-api worktree commit + push fork（`rev1-admin-rust-api`）
  2. **第二段** outer `git add rust-api` 更新 SHA pin + commit on `039-rust-entity-id-numeric-migration` feature branch
  3. **無第三段**：base-web 0 改動、無 fork push needed
- **收尾**：finishing-a-development-branch → outer push → switch `rev1-admin-root` → `git merge --no-ff` → 刪 feature branch + 回填 merge SHA in INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker
