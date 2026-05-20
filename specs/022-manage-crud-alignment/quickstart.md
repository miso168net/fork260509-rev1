# Quickstart: F7 — manage-crud-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

F7 acceptance 走法總覽(對齊 F9 既有 quickstart 慣例、step-by-step + 故障排查段)。

---

## Prerequisites

### Stack 已起 + W-FA1 baseline

```bash
# 確認 W-FA1 stack with --profile track-a 7 service expected state:
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a ps
# 預期 6 service healthy + migration exited 0

# 確認 outer branch 在 022-manage-crud-alignment:
git branch --show-current

# 確認 rust-api worktree branch = rev1-admin-rust-api:
(cd rust-api && git branch --show-current)
```

### 預期 seed user 可用

| Username | Role | Password | F7 用途 |
|---|---|---|---|
| Soybean | ROLE_SUPER | 123456 | C-V3 5 條 read alias shape 對齊 + C-V10 CDP smoke 主 navigate user |
| Administrator | ROLE_ADMIN | 123456 | C-V4 5 條 read alias + C-V5 既有 path admin + C-V6 Menu CRUD admin path |
| GeneralUser | ROLE_USER | 123456 | C-V7 deny regression |

---

## Step 1:Implement rust source patch(per data-model.md E1-E8)

按 implement order:

1. **E1-E5 5 個 Output DTO**:新建 `rust-api/server/model/src/admin/output/sys_system_manage.rs`(~120 LOC)
2. **E1-E5 mod register**:改 `rust-api/server/model/src/admin/output/mod.rs`(+1 LOC `pub mod sys_system_manage;` + re-export `SystemManage*`)
3. **E6 5 個 alias wrapper handler**:新建 `rust-api/server/api/src/admin/sys_system_manage_api.rs`(~80 LOC)
4. **E6 mod register**:改 `rust-api/server/api/src/admin/mod.rs`(+2 LOC mod + re-export `SysSystemManageApi`)
5. **E7 router 5 條 mount 換 handler**:改 `rust-api/server/router/src/admin/sys_system_manage_route.rs`(~10 LOC + import 加 SysSystemManageApi)
6. **E8 Casbin migration**:新建 `rust-api/migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs`(~60 LOC)
7. **E8 migration register**:改 `rust-api/migration/src/datas/mod.rs`(+1 LOC)+ `rust-api/migration/src/lib.rs`(+2 LOC Migrator vec)

---

## Step 2:Build rust-api docker image

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -10
```

預期 warm cache build ~3-5 min;cold ~5-7 min。**若 build fail 看 cargo 錯誤**(常見:unused import / DTO field 拼字 / From impl mismatch)。

---

## Step 3:Restart stack with new image

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate migration rust-api 2>&1 | tail -10

# 確認 migration log:
docker compose logs migration --tail=10
# 預期含 "Applying migration 'm20260521_a_f7_admin_role_existing_paths_seed'"

# 確認 stack healthy:
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
# 預期 6 healthy + rust-api uptime 較短
```

---

## Step 4:Run acceptance C-V series

按 C-V1 ~ C-V10 順序跑(per `contracts/verification-commands.md`):

```bash
# C-V1 build 已在 Step 2 跑過

# C-V2 migration rerun + 15 row 落 DB:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT COUNT(*) FROM casbin_rule WHERE v0='ROLE_ADMIN' AND v1='built-in' AND (v2 LIKE '/user%' OR v2 LIKE '/role%' OR v2 LIKE '/route%') AND v2 NOT LIKE '/systemManage/%'"
# 預期 15

# C-V3 Soybean 5 read alias:見 verification-commands.md C-V3
# C-V4 Administrator 5 read alias:見 verification-commands.md C-V4
# C-V5 Administrator 既有 path:見 verification-commands.md C-V5
# C-V6 Menu CRUD admin path:見 verification-commands.md C-V6
# C-V7 GeneralUser deny regression:見 verification-commands.md C-V7
# C-V8 three-side scope:見 verification-commands.md C-V8
# C-V9 W-FA1 stack regression:已在 Step 3 跑過
# C-V10 CDP browser smoke test:見 verification-commands.md C-V10
```

**預期跑時間**:~25-30s 全 C-V series(C-V1 build 不計、C-V10 CDP ~5-10s)

---

## Step 5:Two-stage commit + push wait

per CLAUDE.md §6.1 兩段式 commit + push 等 user 同意。

### Stage 1 — rust-api worktree

```bash
cd rust-api
git status --short
# 預期:
#  M migration/src/datas/mod.rs
#  M migration/src/lib.rs
#  M server/api/src/admin/mod.rs
#  M server/model/src/admin/output/mod.rs
#  M server/router/src/admin/sys_system_manage_route.rs
# ?? migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs
# ?? server/api/src/admin/sys_system_manage_api.rs
# ?? server/model/src/admin/output/sys_system_manage.rs

git add server/model/src/admin/output/sys_system_manage.rs \
        server/model/src/admin/output/mod.rs \
        server/api/src/admin/sys_system_manage_api.rs \
        server/api/src/admin/mod.rs \
        server/router/src/admin/sys_system_manage_route.rs \
        migration/src/datas/m20260521_a_f7_admin_role_existing_paths_seed.rs \
        migration/src/datas/mod.rs \
        migration/src/lib.rs

# Commit message 對齊 F9/F11 既有風格(中文 subject + 詳細 body + Co-Authored-By Claude)
git commit -m "feat(rust-api): F7 manage/* base view shape 對齊 + admin path Casbin 補位..."

# push 等 user 同意
cd ..
```

### Stage 2 — outer 022 feature branch

```bash
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
sed -i "s/rust-api \`<sha-pending>\`/rust-api \`${RUST_API_SHA}\`/g" docs/INTEGRATION-CHECKLIST.md

git add docs/INTEGRATION-CHECKLIST.md rust-api

git commit -m "feat(spec): F7 manage-crud-alignment — 5 read alias shape 對齊 + 15 row admin Casbin 補位..."
```

### Stage 3 — Push wait + merge

```bash
# 告知 user:F7 兩段式 commit 已落、push 等同意
# user 同意後:
cd rust-api && git push origin rev1-admin-rust-api && cd ..
git push origin 022-manage-crud-alignment
git switch rev1-admin-root
git merge --no-ff 022-manage-crud-alignment -m "Merge branch '022-manage-crud-alignment' into rev1-admin-root: F7 完成"
# SHA fill follow-up(對齊 F9/F11 pattern)
git push origin rev1-admin-root  # 等 user 二次同意 default branch push
```

---

## 故障排查

### Cargo build fail in Step 2

**症狀**:`docker build` 在 `[builder 5/5] RUN cargo build --release` step fail。

**Diagnosis**:
- `unused import` 錯誤 → cargo `-D warnings` 嚴格,check `output/sys_system_manage.rs` + `sys_system_manage_api.rs` imports 是否 referenced
- `cannot find type SystemManageXxxOutput` → check `output/mod.rs` re-export + `sys_system_manage.rs` struct 拼字
- `mismatched types` in From impl → check `entities/sys_role.rs` / `sys_user.rs` / `sys_menu.rs` column 真實 type vs F7 Output DTO field type
- `the trait bound ... is not satisfied` 對 `.into()` call → check From impl 完整(struct + impl 都有)
- `tracing::warn!` macro 未 import → check `use tracing::warn;` 在 sys_system_manage.rs

**Fix**:對應 imports / struct field / From impl,然後 re-run `docker build`(warm cache 第二次 ~1-2 min)

### Migration not run in Step 3

**症狀**:`docker compose logs migration --tail=10` 沒 `Applying migration 'm20260521_a_f7...'`。

**Diagnosis**:
- migration register 漏 → check `rust-api/migration/src/datas/mod.rs` 是否含 `pub mod m20260521_a_f7_admin_role_existing_paths_seed;`
- Migrator vec 漏 → check `rust-api/migration/src/lib.rs` 是否含 `Box::new(m20260521_a_f7_admin_role_existing_paths_seed::Migration),`
- migration filename 拼字錯 → check struct DeriveMigrationName 是否生對 name

**Fix**:對應 register、再跑 `docker compose ... up -d --wait --force-recreate migration rust-api`(會 rerun migration init container)

### C-V3 shape 不對齊 base TS type

**症狀**:C-V3a roleName 為 undefined / "" / 仍為 rust `name` 字段。

**Diagnosis**:
- F7 wrapper handler 沒 call `.into()` → check `sys_system_manage_api.rs::list_roles_for_systemmanage` 是否做 `model.into()` map
- F7 router mount 仍指 F9 既有 handler → check `sys_system_manage_route.rs` 5 條 mount 是否確實換 handler
- F7 Output DTO field rename 漏 → check `SystemManageRoleOutput` 是否 `pub role_name: String` + struct-level `#[serde(rename_all = "camelCase")]`

**Fix**:對應 wrapper handler `.into()` / router mount / DTO struct;rebuild + restart rust-api + 重跑 C-V3

### C-V5 envelope code:5001(A-006 未解)

**症狀**:Administrator 對 `/api/user/` 收 envelope code:5001。

**Diagnosis**:
- F7 m20260521 migration 沒跑 → check C-V2 row count
- m20260521 對應 row 漏 → psql 詳細查 `SELECT * FROM casbin_rule WHERE v0='ROLE_ADMIN' AND v2='/user/' AND v3='GET'`
- F7 migration register 漏 → check `migration/src/datas/mod.rs` + `migration/src/lib.rs`

**Fix**:對應 migration register / m20260521 INSERT row 完整性、rerun migration init container

### C-V6 Menu CRUD endpoint envelope code:5001

**症狀**:Administrator POST/PUT/DELETE `/api/route/` 收 envelope code:5001。

**Diagnosis**:
- F7 m20260521 對 `/route/*` 4 row 漏(POST `/route/` / PUT `/route/` / DELETE `/route/:id` / GET `/route/:id`)
- 既有 m20241024 對 `/route/` ROLE_SUPER 也沒 row → 既有 `/api/route/` 對任何 role 都 deny → F5.1 m20260515 read row 之外、write row 沒 seed → F7 補

**Fix**:確認 m20260521 INSERT 12-15 row(`/route/*` × 4)+ run migration

### C-V6d soft delete / audit 沒觸發

**症狀**:`sys_menu.deleted_at IS NULL` 或 `sys_operation_log` 0 row。

**Diagnosis**:
- 既有 `SysMenuService::delete_menu` 沒 trigger F3 facade(`soft_delete` 沒 call)→ implement-time finding、不歸 F7
- 既有 service 沒 trigger F2.1 audit hook → implement-time finding、不歸 F7

**Fix**:留 follow-up feature(F7 不負責 service-layer behavior、只負責 alias mount + Casbin allow)

### C-V10 CDP smoke test column 顯示 undefined

**症狀**:CDP DOM query 拿到 row.userName / roleName / menuName = `undefined`。

**Diagnosis**:
- F7 Output DTO 漏 field(per C-V3 同診斷)
- F9 alias mount 仍指既有 handler(per C-V3 同診斷)
- base example view column key 與 F7 DTO field name 不對齊 → check `base-web/src/views/manage/{user,role,menu}/index.vue` column key vs F7 `SystemManage*Output` field
- column 用 `row.<key>` 但 F7 DTO 用 `key_snake_case` 沒 camelCase rename → check `#[serde(rename_all = "camelCase")]` 在 struct

**Fix**:對應 F7 Output DTO field rename / handler `.into()`;若 base example view 用 unanticipated column key → 屬 follow-up(per E-10、F7 不阻 PASS)

### C-V10 CDP setup fail / Edge crash

**症狀**:CDP 連 9222 port 失敗 / Page.navigate timeout。

**Diagnosis**:
- WSL2 host Edge 148 沒 launched with `--remote-debugging-port=9222`
- Edge 沒 access `127.0.0.1:11080`(WSL2 NAT vs mirrored networking 差異)
- F5.1 follow-up CDP script 不適用 F7 sub-case

**Fix**:
- Launch Edge:`/path/to/msedge.exe --remote-debugging-port=9222`(Windows host)
- 切 WSL2 mirrored networking(per CLAUDE.md §5.2)
- 降級為「手動 browser navigate + visual eyeball 確認 column 不空白」(per R-Q4 graceful degradation)

---

## 完成標誌

- ✅ Step 1 rust source 8 file patch 完成
- ✅ Step 2 docker build pass + image SHA 新
- ✅ Step 3 migration rerun + 15 row 落 DB + stack 6 healthy
- ✅ Step 4 C-V1-V10 全 PASS(11/11)
- ✅ Step 5 兩段式 commit + push wait

**F7 acceptance**:11 C-V PASS = **13/13 US scenarios PASS**(per spec NFR-004:US1 5 + US2 3 + US3 5 = 13)

**下一步**:`/speckit-tasks` 生 tasks.md(~22 task、per NFR-002)
