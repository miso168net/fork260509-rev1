# Quickstart: F11 — extracted-stubs

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-19

從 0 到 F11 acceptance PASS 的 5 個 step,適合單人從 spec.md / plan.md / data-model.md / research.md 讀完後動手。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、Linux WSL2 / macOS、Docker Desktop running。

---

## Step 1: Prerequisites verify(~1 min)

確認 F10.2 已 merge + stack 可起 + Soybean / GeneralUser 在 DB。

```bash
echo "=== A-001 + A-002 check: F10.2 + F6 在 main branch ==="
git -C /mnt/d/AnewSpaces/x_Project/fork260509-rev1 log --oneline | grep -E "F10\.2|F6" | head -3
# 預期: F10.2 merge 851ec79 + F6 merge a431215 在 history

echo ""
echo "=== A-003 + A-005 check: W-FA1 stack 啟動 ==="
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
# 預期: 6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)

echo ""
echo "=== A-003 check: seed user F5.1 在 DB ==="
# 啟 stack 後跑:
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT username FROM sys_user WHERE username IN ('Soybean','Administrator','GeneralUser') ORDER BY username"
# 預期 3 row(F5.1 seed)
```

**Pass criteria**: F10.2 + F6 merge 在 history + 6 service healthy + 3 seed user 在 DB。

**Failure handling**: F10.2 / F6 未 merge → 補跑;stack 沒起 → `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`;seed user 缺 → F5.1 migration 沒跑、檢 `seaql_migrations` 表。

---

## Step 2: 改 rust source + 新建 Casbin migration(~30-45 min)

實作 F11 10 file 改動(per data-model.md E1-E6 + analyze G2 grounding)。

```bash
# 改 / 新建順序建議:
# 1) 先寫 DTO (server/model/src/admin/input/sys_authentication.rs +3 struct、對齊既有 LoginInput)
# 2) 寫 stub handler in sys_authentication_api.rs (+3 fn)
# 3) 新建 sys_mock_api.rs + register in admin/mod.rs
# 4) 改 sys_authentication_route.rs (+3 route + RouteInfo)
# 5) 新建 sys_mock_route.rs + register in router/admin/mod.rs + 主 router merge
# 6) 寫 migration m20260519_a_f11_extracted_stubs_seed.rs + register in migration/src/datas/mod.rs + lib register

# Verify 改動 stat:
(cd rust-api && git diff HEAD --stat)
# 預期: 10 file ~170-205 LOC
```

**Pass criteria**: `git diff HEAD --stat` 顯示 10 file changes、共 ~170-205 LOC。

**Failure handling**:
- DTO derive 缺失 → 加 `use serde::Deserialize;`
- handler signature 不對齊 axum → 檢 既有 `login_handler` signature shape(per data-model E1)
- module register 漏 → grep `mod sys_mock_api` 確認 mod.rs 改齊
- migration register 漏 → grep `m20260519_a_f11` 確認 lib.rs register

---

## Step 3: Rebuild rust-api image with F11 patches(~3-5 min warm)

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -5
# 預期 cold ~5-7 min / warm ~3-5 min(per NFR-005;若 fail → check cargo build output)
```

**Pass criteria**: docker build exit 0 + image 重 tag `rust-api:rev1-admin-rust-api`。

**Failure handling**: cargo compile error → 檢 strum / serde / chrono / sea-orm import + cargo.lock + 既有 DTO 是否衝突。

---

## Step 4: Restart W-FA1 stack with new rust-api image(~1 min)

force-recreate rust-api container 載入新 image、migration init container 自動 rerun 跑 F11 migration、其他 service 不動。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Pass criteria**: rust-api 重啟 healthy + 其他 5 service 仍 healthy + migration init container exited 0(F11 migration rerun)。

**Failure handling**:
- rust-api restart loop → 檢 docker compose logs rust-api(可能 handler panic / Casbin enforce middleware 退化、F11 不該觸)
- migration container exited 非 0 → SQL syntax error / column name 對不上 schema、檢 docker compose logs migration

---

## Step 5: 跑 C-V1 ~ C-V7 acceptance(~3-5 min)

依 contracts/verification-commands.md 順序跑 7 個 verification。

```bash
# C-V1 已在 Step 3 隱含驗(rust-api image 重新 build)
# C-V2 (migration rerun + 8 row):
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT COUNT(*) FROM casbin_rule WHERE v2 IN ('/auth/sendCaptcha','/auth/verifyCaptcha','/auth/error','/mock/getLastTime') AND v4='allow'"
# 預期: count = 8

# C-V3 (Soybean 4 endpoint 200):
LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000"}' \
  http://127.0.0.1:11080/api/auth/sendCaptcha

# (其他 4 個 sub-case 見 contracts/verification-commands.md)

# C-V4 (GeneralUser deny):
GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Authorization: Bearer $GU_TOKEN" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000"}' \
  http://127.0.0.1:11080/api/auth/sendCaptcha
# 預期 HTTP 403

# C-V5 (tracing log):
docker compose logs rust-api --tail=200 2>&1 | grep "F11 stub: sendCaptcha"
# 預期 ≥ 1 line + phone=

# C-V6 (three-side scope):
git diff HEAD -- base-web/src/ | wc -l                                       # 預期 0
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l               # 預期 0
(cd rust-api && git diff HEAD --stat)                                         # 預期 10 file
git diff HEAD -- docker-compose*.yml | wc -l                                  # 預期 0

# C-V7 (W-FA1 stack regression):
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
# 預期 6 healthy + rust-api uptime 較短
```

**Pass criteria**: 7/7 PASS、預期值見 contracts/verification-commands.md。

**Failure handling**: 見 contracts/verification-commands.md 各 C-V failure handling 段。

---

## Step 6: 紀錄 F11 完成里程碑 + 故障排查(~3 min)

### 完成標誌

- ✅ C-V1 rust-api image rebuild OK + 新 SHA
- ✅ C-V2 Casbin migration rerun + 8 row 落 DB
- ✅ C-V3 Soybean 4 endpoint(5 sub-case)全 HTTP 200 + 預期 response shape
- ✅ C-V4 GeneralUser 1 endpoint HTTP 403(Casbin enforce fail-safe)
- ✅ C-V5 tracing log 含 `phone=` field
- ✅ C-V6 三邊 scope 對齊:base-web/nestjs 0 diff + rust-api 10 file + 0 docker-compose
- ✅ C-V7 W-FA1 stack 6 service healthy + rust-api 剛 recreated + migration exited 0
- ✅ Total 7/7 acceptance(無 unit test、per Q3 拍板、tracing log compensate)

### Application Phase 4 後續紀錄

F11 完成 = DESIGN-A §4.2 抽離項清單 **4 / 5 條 stub 已交付**(剩 `batchDeleteUser` 留 F9 統一交付)。F11 後可平行:
- **F9** `systemManage-alias-router`(含 batchDeleteUser stub 收尾抽離項清單)
- **F7** `manage-crud-alignment`(Phase 3、scope 重)
- **F12** `cleanup-job`(Phase 4 並行、scope 獨立)
- **W-F11** `observability`(Phase W deploy P2 剩餘)
- **W-F6b** `acme-cert-acquisition`(W-F6 follow-up)
- **F13** `rust-refresh-token-impl`(DESIGN-B 階段)
- **F14** `design-a-to-b-cutover`(DESIGN-B 階段)

### 故障排查段

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| Step 2 cargo compile error | strum / serde / chrono / sea-orm import 缺 / DTO derive 缺失 | 檢 file 頭 use 是否齊備 |
| Step 4 rust-api restart loop | handler panic / Casbin middleware 退化 / migration 失敗 | docker compose logs rust-api 查 root cause |
| C-V2 COUNT < 8 | migration 沒跑 / lib register 漏 | 檢 mod.rs + lib.rs register + docker compose logs migration |
| C-V2 COUNT > 8 | rerun INSERT 重複(idempotency bug) | 檢 `seaql_migrations` 表是否有重跑紀錄、可能 migration name 重複 |
| C-V3 HTTP 404 | endpoint 未註冊、router mount 漏 | 檢 sys_authentication_route + sys_mock_route 的 `.route(...)` |
| C-V3 HTTP 401 | access_token 失效 / Authorization header 漏帶 | 確認 login response 含 `data.token` + curl `-H "Authorization: Bearer $TOKEN"` 有帶 |
| C-V3 HTTP 403 | Casbin policy 未生效對 ROLE_SUPER、或 ROLE_SUPER 不在 user-role assignment | 檢 C-V2 row + F5.1 `g` rule(SELECT * FROM casbin_rule WHERE ptype='g' AND v0='Soybean') |
| C-V3 HTTP 500 | handler panic | docker compose logs rust-api 查 stack trace |
| C-V3 response shape mismatch | `Res::new_data(json!(...))` 內 field 名錯 | 對比 data-model E9 + research R-Q4 |
| C-V4 HTTP 200(該 403)| Casbin policy 對 GeneralUser/ROLE_USER 也 allow(誤加 row)| 檢 C-V2 row 是否含 ROLE_USER 的 endpoint allow row(不該有) |
| C-V5 grep 0 line | sendCaptcha handler 沒被 invoke、或 tracing level INFO 未開 | 檢 C-V3 同時 fail / 檢 rust-api tracing subscriber 配置 |
| C-V6 rust-api scope > 10 file | 意外改其他 file | 檢 git diff、stash 或 abort |
| C-V6 outer 有 docker-compose.yml diff | F11 範疇外改動 | 確認後 stash 或 abort |

---

## 完成標誌

完成 6 step 後:
- F11 acceptance 7/7 PASS
- ready for Phase 8 兩段式 commit(per CLAUDE.md §6.1)
  - Stage 1: rust-api worktree 10 file 1 commit
  - Stage 2: outer commit on 020 feature branch(spec docs + INTEGRATION-CHECKLIST.md + CLAUDE.md SOP marker + .specify/feature.json + rust-api SHA pin)
  - Stage 3: push wait + merge --no-ff + SHA fill follow-up
