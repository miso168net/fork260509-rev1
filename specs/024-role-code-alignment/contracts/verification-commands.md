# Verification Commands: F7.2 — role-code-alignment

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

9 個 C-V contract = 9 個 verification scenario(US1 P1 5 acceptance scenario → C-V mapping、curl + CDP smoke + unit test + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、W-FA1 stack + `--profile track-a` 起、F7.2 rust-api image 已 rebuild + container recreate;CDP smoke via WSL2 host Edge 148 + `--remote-debugging-port=9229`(per research R-Q3)。

> 注意:F7.2 不改 envelope 紀律 — `getUserInfo` 回 `{code:0, data, msg:"success", success:true}`(per F4)。

---

## C-V1: rust-api image rebuild OK

**Goal**:驗 F7.2 rust source 1 file patch 後 cargo build 成功(含 unit test 編譯)。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:exit 0 + image 重 tag + warm ≤ 5 min。

**Failure handling**:cargo error → check `sys_authentication_api.rs` `map_role_alias` 語法 / `#[cfg(test)] mod tests` import。

---

## C-V2: Soybean `getUserInfo` role code = R_SUPER(US1.1)

**Goal**:驗 F7.2 role code 映射對 `ROLE_SUPER` 生效。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -5

LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -s -o /tmp/f72-cv2.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:11080/api/auth/getUserInfo
python3 -c "import json; r=json.load(open('/tmp/f72-cv2.json')); d=r.get('data',{}); \
  print(f'code={r[\"code\"]} userName={d.get(\"userName\")} roles={d.get(\"roles\")}')"
```

**Expected**:HTTP 200 + envelope `code=0` + `data.roles` = `["R_SUPER"]`(不含 `ROLE_SUPER`)。

**Pass criteria**:`data.roles` 含 `R_SUPER`、不含 `ROLE_SUPER`。

**Failure handling**:`roles` 仍 `ROLE_SUPER` → 映射沒生效、check `sys_authentication_api.rs` E2 handler 改動。

---

## C-V3: Administrator `getUserInfo` role code = R_ADMIN(US1.2)

**Command**:
```bash
ADMIN_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Administrator","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s -o /tmp/f72-cv3.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:11080/api/auth/getUserInfo
python3 -c "import json; r=json.load(open('/tmp/f72-cv3.json')); print(f'code={r[\"code\"]} roles={r.get(\"data\",{}).get(\"roles\")}')"
```

**Expected**:HTTP 200 + envelope code:0 + `data.roles` 含 `R_ADMIN`。

**Pass criteria**:`data.roles` 含 `R_ADMIN`、不含 `ROLE_ADMIN`。

---

## C-V4: GeneralUser `getUserInfo` role code = R_USER(US1.3)

**Command**:
```bash
GU_LOGIN=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"GeneralUser","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
GU_TOKEN=$(echo "$GU_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s -o /tmp/f72-cv4.json -w "HTTP %{http_code}\n" -H "Authorization: Bearer $GU_TOKEN" \
  http://127.0.0.1:11080/api/auth/getUserInfo
python3 -c "import json; r=json.load(open('/tmp/f72-cv4.json')); print(f'code={r[\"code\"]} roles={r.get(\"data\",{}).get(\"roles\")}')"
```

**Expected**:HTTP 200 + envelope code:0 + `data.roles` 含 `R_USER`。

**Pass criteria**:`data.roles` 含 `R_USER`、不含 `ROLE_USER`。

---

## C-V5: CDP smoke manage 3 view — 不帶 role alias workaround(US1.4)

**Goal**:驗 base-web static 模式 role-gated 路由用 rust 原生回傳的 `R_*` 通過、F7.1 CDP role alias workaround 不再需要。

**Pre-requisite**:WSL2 host Edge 148 + `--remote-debugging-port=9229`;CDP node script + `ws` driver。**關鍵差異**:F7.2 的 node script **移除** F7.1 的 `Fetch.enable` / `Fetch.requestPaused` / role alias 注入整段(per research R-Q3)。

**Command**(沿用 F7.1 CDP setup、移除 Fetch 攔截段):
```bash
# node script:clear storage → POST login + inject SOY_token → navigate
#   /manage/menu + /manage/user + /manage/role → count .n-data-table-tr
#   (不含 Fetch domain 攔截 / role alias 注入)
node /tmp/cdp-f72-smoke.js
```

**Expected**:`/manage/menu` row ≥ 5、`/manage/user` row ≥ 3、`/manage/role` row ≥ 3、皆不顯示「无数据」。

**Pass criteria**:3 view DOM row count 各達標、無 workaround。

**Failure handling**:
- row count 0 / 「无数据」→ role code 映射沒生效(C-V2~C-V4 應先 PASS)或 base-web static filter 仍不認
- CDP setup fail → graceful degradation(per spec A-004):C-V2~C-V4 curl 驗 role code 已是 `R_*` 即視為 US1 核心通過、C-V5 標 deferred manual

---

## C-V6: Casbin enforce regression(US1.5)

**Goal**:驗 F7.2 不破壞後端 Casbin enforce — role code 映射只在 getUserInfo response、enforce 路徑維持 `ROLE_*`。

**Command**:
```bash
for U in Soybean Administrator GeneralUser; do
  L=$(curl -fsS -X POST -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$U\",\"password\":\"123456\"}" http://127.0.0.1:11080/api/auth/login)
  T=$(echo "$L" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  C=$(curl -s -o /tmp/f72-cv6-$U.json -w "%{http_code}" -H "Authorization: Bearer $T" \
    http://127.0.0.1:11080/api/route/getUserRoutes)
  CODE=$(python3 -c "import json; print(json.load(open('/tmp/f72-cv6-$U.json'))['code'])")
  echo "$U: HTTP $C envelope code=$CODE"
done
```

**Expected**:三 user `/route/getUserRoutes` 各 HTTP 200 + envelope code:0(Casbin enforce 仍用 `ROLE_*` × `casbin_rule.v0`、不退化)。

**Pass criteria**:3/3 user HTTP 200 + envelope code:0。

**Failure handling**:envelope code:5001 → Casbin enforce 異常(F7.2 不應影響 enforce、check 是否誤動 JWT / `User::subject`)。

---

## C-V7: rust unit test(US1、per FR-013)

**Goal**:驗 `map_role_alias` 純函式 unit test PASS。

**Command**(於 rust-api 容器內、host-mounted cargo cache、對齊 F10.1/F10.2):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a exec rust-api \
  sh -c "cd /app && cargo test -p server-api map_role_alias 2>&1 | tail -15" \
  || echo "（若 runtime container 無 cargo:改於 build 階段驗、見 quickstart）"
```

**Expected**:`test_map_role_alias` PASS(3 known 映射 + 1 unknown pass-through)。

**Pass criteria**:`test_map_role_alias` result: ok。

> 註:rust-api runtime image 為 slim、可能無 cargo;此情況下 unit test 於 C-V1 docker build 階段隨 `cargo test` / `cargo build` 編譯驗證,或於 host cargo 環境跑(對齊 F10.1 observation)。quickstart 列實際執行方式。

---

## C-V8: three-side scope verify(zero-regression)

**Goal**:驗 F7.2 base-web + nestjs + docker-compose + migration 零改動、rust-api scope 收緊到 1 file。

**Command**:
```bash
echo "=== base-web/ diff (預期 0、含 .env) ==="
git diff HEAD -- base-web/ | wc -l
echo "=== nestjs fork diff (預期 0) ==="
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "=== rust-api scope (預期 1 file) ==="
(cd rust-api && git diff HEAD --stat)
echo "=== migration 變動 (預期 空) ==="
(cd rust-api && git diff HEAD --stat -- migration/)
echo "=== docker-compose 變動 (預期 0) ==="
git diff HEAD -- docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml | wc -l
echo "=== outer scope ==="
git status --short
```

**Expected**:
- base-web/ diff = **0 line**(含 `.env`)
- nestjs fork diff = **0 line**
- rust-api scope = **1 file**(`server/api/src/admin/sys_authentication_api.rs`)
- docker-compose*.yml diff = 0 line
- migration diff = 0 line(空輸出)
- outer scope:`CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + `rust-api` gitlink + `specs/024-*` + `docs/superpowers/024-*`

**Pass criteria**:base-web/nestjs/docker-compose/migration 各 0 diff + rust-api 1 file。

---

## C-V9: W-FA1 stack regression

**Command**:
```bash
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Expected**:6 service healthy(base-web + front-nginx + nestjs + postgres + redis + rust-api)+ rust-api uptime 較短(剛 recreated)+ migration init container 若顯示:exited 0。

**Pass criteria**:6 long-running service healthy + rust-api 剛 recreated。

---

## 完成標誌

9 個 verification 全 PASS = F7.2 acceptance 9/9 PASS、ready for 兩段式 commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | exit 0 + 新 image SHA + ≤ 5 min warm |
| C-V2 | Soybean `getUserInfo`(US1.1) | `data.roles` 含 `R_SUPER` |
| C-V3 | Administrator `getUserInfo`(US1.2) | `data.roles` 含 `R_ADMIN` |
| C-V4 | GeneralUser `getUserInfo`(US1.3) | `data.roles` 含 `R_USER` |
| C-V5 | CDP smoke manage 3 view 無 workaround(US1.4) | menu ≥ 5 / user ≥ 3 / role ≥ 3 row |
| C-V6 | Casbin enforce regression(US1.5) | 3 user `/route/getUserRoutes` HTTP 200 + code:0 |
| C-V7 | rust unit test | `test_map_role_alias` ok |
| C-V8 | three-side scope | base-web/nestjs/docker-compose/migration 0 diff + rust-api 1 file |
| C-V9 | W-FA1 stack regression | 6 service healthy + rust-api 剛 recreated |

**graceful degradation**:C-V5 CDP smoke 若 setup 異常 → 降級為 deferred manual(per spec A-004),C-V2~C-V4 curl 層 PASS 即視為 F7.2 US1 核心驗收通過。
