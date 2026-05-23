# Quickstart — 040 wire-id-consistency 驗證

## dev stack 啟動

```bash
cd <workspace root>
bash deploy/generate-dev-cert.sh   # 首次（每年 renew）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

## base-web 改動後重 build

base-web 改 4 檔（typings/api 0 改 + service.ts 4 處 + 2 modal）後需 rebuild base-web image：

```bash
DOCKER_BUILDKIT=1 docker build -t base-web:rev1-admin-base-web ./base-web
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

## rust-api 改動後重 build

rust-api 改 ~7 檔（1 deserializer drop + 3 output struct + 3 api handler）後需 rebuild：

```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

**注意**：本 feature 0 schema migration、migration 容器跑完 0 套用。

## 帳號（CLAUDE.md §8.1）

| 帳號 | 角色 | 密碼 |
|---|---|---|
| `Soybean` | 超級管理員 ROLE_SUPER | `123456` |
| `Administrator` | admin ROLE_ADMIN | `123456` |
| `GeneralUser` | 一般 ROLE_USER | `123456` |

## 驗證流程

### Step 1: base-web TS 編譯 gate（C-V3 / C-V4 / C-V5）

```bash
# host 側（推薦）
cd base-web && pnpm install && pnpm typecheck
# 或 container 內
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec base-web pnpm typecheck

# 預期：exit 0、無 error 輸出

# B 餘料 grep
grep -rn "String(props\.roleId)\|String(.*RoleId)" base-web/src/views/manage/role/modules/{button-auth-modal,menu-auth-modal}.vue
# 預期：0 命中
```

### Step 2: 取 token

```bash
TOKEN=$(curl -fsS -X POST http://127.0.0.1:11080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Soybean","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
```

### Step 3: D raw endpoint wire wrap 驗證（C-V9 ~ C-V14）

```bash
# C-V9 sys_role 單筆
ROLE_DISPLAY_ID=$(curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:11080/api/systemManage/getRoleList \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['records'][0]['id'])")
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/role/$ROLE_DISPLAY_ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert isinstance(d['data']['id'], int), f'role id should be int, got {type(d[\"data\"][\"id\"]).__name__}'
assert 'displayId' not in d['data'], 'displayId should NOT be in wire response (wrap should hide it)'
print(f'C-V9 OK: id type={type(d[\"data\"][\"id\"]).__name__} val={d[\"data\"][\"id\"]}')
"

# C-V10 sys_role list
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/role/list?current=1&size=10" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d['data']['records']:
    assert isinstance(r['id'], int)
    assert 'displayId' not in r
print('C-V10 OK')"

# 同樣 C-V12 sys_user / C-V13 sys_access_key 比照
```

### Step 4: C parentId workaround drop（C-V6 / C-V7 / C-V8）

```bash
# C-V6 grep
grep -rn "deserialize_parent_id_compat\|deserialize_with" rust-api/server/model/src/admin/input/sys_menu.rs
# 預期：0 命中

# C-V7 number parentId OK
curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST \
  http://127.0.0.1:11080/api/systemManage/addMenu \
  -d '{"parentId": 0, "menuType": "1", "menuName": "test_v7", "routeName": "test_v7", "iconType": "1"}' \
  | python3 -m json.tool
# 預期：envelope 0、menu 建立成功

# C-V8 string parentId 拒絕
curl -sS -i -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST \
  http://127.0.0.1:11080/api/systemManage/addMenu \
  -d '{"parentId": "0", "menuName": "test_v8", ...}' | head -10
# 預期：HTTP 4xx、serde "expected i32, got string"
```

### Step 5: CDP browser smoke（C-V1 / C-V2）

per CLAUDE.md memory `reference_cdp_smoke_technique.md`，開 Edge :9229 debug → 走訪 `http://127.0.0.1:11080`、登入 Soybean / 123456：

- `/manage/role` → 對 ROLE_SUPER 開「编辑」抽屜 → 點「菜单授权」→ modal 開、角色首頁 dropdown 改值 → 「确认」→ 「修改成功」toast（**C-V1** updateRoleHome 修通）
- 同 ROLE_SUPER 編輯抽屜 → 點「按钮权限」→ modal 開、tree render、勾 2 endpoint → 「确认」→ 「修改成功」toast（**C-V2** assignRoleEndpoints 修通）

### Step 6: 039 regression（C-V15 ~ C-V22）

跑 039 C-V matrix 子集：

```bash
# C-V15 / C-V16 systemManage alias id 仍為 number
for ep in getUserList getRoleList; do
  curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:11080/api/systemManage/$ep" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert isinstance(d['data']['records'][0]['id'], int)
print('$ep OK')"
done

# C-V19 audit_log ULID 不退化（執行 C-V18 後查）
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres \
  psql -U soybean -d soybean_admin_rust -c "
SELECT entity_id, payload_after::text 
FROM sys_operation_log WHERE module_name='sys_role' AND payload_after::text LIKE '%endpointIds%' 
ORDER BY created_at DESC LIMIT 1;"
# 預期：entity_id 為 ULID 字串、payload 內 roleId/endpointIds 為 ULID 字串集合
```

### Step 7: Scope discipline（C-V23 ~ C-V28）

```bash
# C-V23 base-web §4 邊界外 0 改動
git -C base-web diff --name-only main...HEAD -- src/ | grep -vE "src/typings/api/system-manage\.d\.ts|src/service/api/system-manage\.ts|src/views/manage/role/modules/(button-auth|menu-auth)-modal\.vue"
# 預期：0 行（W-FW9 §4 邊界紀律）

# C-V24 Sea-ORM Model 不動
git diff main...HEAD -- rust-api/server/model/src/admin/entities/{sys_role,sys_user,sys_access_key}.rs
# 預期：0 行（Model 完全保留）

# C-V28 DESIGN-W-WEBUI 加 W-FW9
grep -c "W-FW9\|wire-id-consistency" docs/INTEGRATION-DESIGN-W-WEBUI.md
# 預期：>= 2 命中
```

## 落點與 commit

- **base-web worktree**（branch `rev1-admin-base-web`）：
  - A1 service.ts inline type 4 處
  - A3 2 modal `String(...)` 拿掉

- **rust-api worktree**（branch `rev1-admin-rust-api`）：
  - C1 sys_menu input drop parentId deserializer（~17 行 + 屬性）
  - D1/D2/D3 3 output struct（`RoleDetail` / `UserDetail` / `AccessKeyDetail`）
  - D4/D5/D6 3 api handler `.map(Detail::from)` wrap

- **outer**（branch `040-wire-id-consistency`）：
  - SHA pin 2 個 worktree
  - `docs/INTEGRATION-DESIGN-W-WEBUI.md` §7 加 W-FW9 條目
  - `docs/INTEGRATION-CHECKLIST.md` Current Focus + 已完成里程碑加 040
  - `CLAUDE.md` SPECKIT marker reset

- **nestjs**：0 改動

- **三段式 commit**（CLAUDE.md §4.1）：
  1. **第一段** base-web worktree commit + push fork（`rev1-admin-base-web`）
  2. **第二段** rust-api worktree commit + push fork（`rev1-admin-rust-api`）
  3. **第三段** outer `git add base-web rust-api docs/ CLAUDE.md` 更新 SHA pin + 文件 + commit on `040-wire-id-consistency` feature branch、push origin

- **收尾**：`superpowers:finishing-a-development-branch` → outer push → switch `rev1-admin-root` → `git merge --no-ff` → 刪 feature branch + 回填 outer/merge SHA in INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker
