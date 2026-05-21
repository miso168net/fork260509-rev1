# Quickstart: W-FW2 — menu-crud-wiring

**Phase**: 1（Design & Contracts）
**Date**: 2026-05-22

落地操作速查 —— 改動清單、實作順序、build/驗證、多段式 commit。

## 改動清單

### rust-api worktree（~8 檔）

| 檔 | 改動 |
|---|---|
| `server/model/src/admin/input/sys_menu.rs` | 新增 4 DTO:`SystemManageAddMenuInput` / `SystemManageUpdateMenuInput` / `DeleteMenuByBodyInput` / `BatchDeleteMenuInput` |
| `server/model/src/admin/input/mod.rs` | re-export 上述 4 DTO |
| `server/service/src/admin/mod.rs` | entity re-export 加 `MenuType`（現只 `Gender, Status`） |
| `server/api/src/admin/sys_system_manage_api.rs` | 新增 4 transform handler + `map_menu_type` / `map_icon_type` helper（`map_status` 重用 W-FW1 既有） |
| `server/router/src/admin/sys_system_manage_route.rs` | 新增 4 條 menu 寫入 route mount + RouteInfo |
| `server/migration/src/datas/m20260522_*_menu_alias_seed.rs` | **新建** —— Casbin policy seed（4 path × allow） |
| `server/migration/src/datas/mod.rs` | register 新 migration mod |
| `server/migration/src/lib.rs` | Migrator vec 末端加新 migration |

> 無 `sys_menu` schema 改、無 entity 改、`sys_menu_service.rs` 零改動。

### base-web worktree（3 檔）

| 檔 | 改動 |
|---|---|
| `src/service/api/system-manage.ts` | 新增 `fetchAddMenu` / `fetchUpdateMenu` / `fetchDeleteMenu` / `fetchBatchDeleteMenu` |
| `src/views/manage/menu/modules/menu-operate-modal.vue` | `handleSubmit` 依 `operateType` 接 add/update |
| `src/views/manage/menu/index.vue` | `handleDelete` / `handleBatchDelete` 接 delete/batchDelete |

> 不動 `src/typings/`、表格 render、`shared.ts`、router、store、i18n。

## 實作順序（建議）

1. **rust-api E1** —— `sys_menu.rs` 4 DTO + `input/mod.rs` re-export。
2. **rust-api E2** —— `service/admin/mod.rs` 補 `MenuType` re-export;`sys_system_manage_api.rs` 4 handler + `map_menu_type`/`map_icon_type`。
3. **rust-api E3** —— `sys_system_manage_route.rs` 4 route + RouteInfo。
4. **rust-api E4** —— 新 Casbin seed migration + register。
5. **base-web E5** —— `system-manage.ts` 4 service function（可平行於 rust）。
6. **base-web E6** —— `menu-operate-modal.vue` handleSubmit + `menu/index.vue` delete handler。
7. **build** —— rust-api image + base-web image rebuild、dev stack `up -d --wait`。
8. **acceptance** —— C-V1~C-V11（見 `contracts/verification-commands.md`）。

## Build / 驗證

```bash
# rust-api image
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
# base-web image
DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web -f base-web/Dockerfile base-web/ 2>&1 | tail -5
# dev stack（migration init container 跑新 Casbin seed）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

acceptance:curl + psql + CDP（`127.0.0.1:9229`）走 C-V1~C-V11。測試菜單命名 `WFW2*`、測完清:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_menu WHERE menu_name LIKE 'WFW2%';"
```

## 多段式 commit（per CLAUDE.md §6.1）

- **Stage 1a** —— rust-api worktree commit（4 DTO + 4 handler + route + Casbin seed migration）。
- **Stage 1b** —— base-web worktree commit（4 service function + handleSubmit + delete handler）。
- **Stage 2** —— outer commit（兩個 SHA pin + spec docs）。

push 等 user 同意（per CLAUDE.md §5）。

## 注意

- `MenuType` 不接受 base-web 的 `'1'/'2'` —— 必經 transform handler（research R-Q1）。
- `pid` validator `min=1` —— root 菜單 `parentId 0` → `pid "0"`（長度 1、剛好通過,research R-Q2）。
- `UpdateMenuInput` 雖 `#[serde(flatten)]`,transform handler 在 Rust 端直接構造、不需 un-flatten（research 補充發現）。
- `query` / `buttons` / `fixedIndexInTab` 三欄 base-web 仍送出、後端 DTO serde 自動忽略（spec Q1、W-FW2-N1 follow-up）。
