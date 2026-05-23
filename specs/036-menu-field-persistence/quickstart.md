# Quickstart — W-FW7 menu-field-persistence 驗證

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

base-web **本 feature 不需重 build**（0 改動）—— 若 contingency 觸發單檔微調再 build：

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
2. 逐條跑 [`contracts/verification-commands.md`](./contracts/verification-commands.md) 的 C-V1–C-V20。
3. psql：`docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres psql -U soybean -d soybean_admin_rust -c "<query>"`。
   - schema 檢查：`\d sys_menu` 確認 `query` / `buttons` / `fixed_index_in_tab` 三欄存在、型別正確（JSONB / JSONB / INTEGER nullable）。
   - 寫入後 round-trip 對照：`SELECT id, menu_name, query, buttons, fixed_index_in_tab FROM sys_menu WHERE id=<id>;`
   - audit 自動涵蓋驗證：`SELECT operation, entity_id, payload_after->'query', payload_after->'buttons', payload_after->'fixedIndexInTab' FROM sys_operation_log WHERE entity_type='sys_menu' AND entity_id='<id>' ORDER BY created_at DESC LIMIT 3;`
4. CDP browser smoke：開 `http://127.0.0.1:11080`、登入,走訪：
   - `/manage/menu`：對某 menu 開編輯 modal，確認 3 個 UI 元件已 render（NDynamicInput query / NDynamicInput buttons / NInputNumber fixedIndexInTab）；填值送出；再開預填一致；新增 menu 帶 / 不帶 3 欄都正常。
   - 動態 menu 載入：登入後左側 menu / 路由系統正常運作；對有設 `fixedIndexInTab` 的 menu，導覽到對應路由觀察 tab 固定行為（若 frontend 已實作該行為）;對有設 `query` 的 menu，導覽到對應路由觀察 query 參數注入。

## 落點與 commit

- **rust-api worktree**（branch `rev1-admin-rust-api`）：A1 migration + A2 entity + B1 native MenuInput + B2 transform DTO + B3 transform handler + B4 menu service + C1/C2 SystemManageMenuOutput.From + MenuTree + D1 RouteMeta + D2 MenuRoute 組裝。
- **base-web worktree**（branch `rev1-admin-base-web`）：**0 改動**（contingency 才動 `menu-operate-drawer-modal.vue` 單檔）。
- **多段式 commit**（CLAUDE.md §4.1）：rust-api worktree commit + push fork → outer repo `git add rust-api`（base-web 0 改動故不 add）更新 SHA pin + 第二段 commit。
