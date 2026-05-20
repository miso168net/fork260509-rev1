# Verification Commands: W-F11 — rust-horizontal-scaling

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-20

9 個 C-V contract = W-F11 的 verification scenario(US1 P1 7 acceptance scenario → C-V mapping + zero-regression)。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)。

> **W-F11 acceptance 跑 prod stack** — 因 `deploy.replicas: 2` 只在 `docker-compose.prod.yml`、replica 只在 prod 環境(per spec FR-009/FR-010)。prod baseline 啟動前須 seed dev 自簽 cert 進 named volume(per CLAUDE.md §5.2.1、W-F6 已備 `deploy/dev-certs/`)。dev regression(C-V8)另跑 dev stack。
> psql 連線經 `docker compose exec postgres`(DB `soybean_admin_rust`、user `soybean`);Casbin 異動的實際 role / path / permission id 以 seed 為準、implement 階段先 psql 確認(per F8 contracts 同慣例)。
> 整組覆蓋語意:`assign-permission` 為 set-semantics、coherence 測試採 capture → mutate → verify → restore(per spec FR-021)。

---

## C-V1: rust-api image rebuild OK

**Goal**:驗 W-F11 新增的 Casbin pub-sub code(publisher + subscriber)cargo build 成功。

**Command**:
```bash
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api -f rust-api/Dockerfile rust-api/ 2>&1 | tail -5
docker images rust-api:rev1-admin-rust-api --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}"
```

**Expected**:exit 0 + image 重 tag。
**Pass criteria**:cargo build exit 0、新 image SHA。
**Failure handling**:check `notify_casbin_changed()` / subscriber task / redis pub-sub API 用法 / `casbin_sync_initialization` 註冊。

---

## C-V2: prod stack 起 — 2 個 rust-api replica healthy

**Goal**:驗 `deploy.replicas: 2` 生效、prod stack 全 service healthy。

**Command**:
```bash
# seed dev 自簽 cert 進 named volume(prod baseline 前置、per CLAUDE.md §5.2.1)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans 2>&1 | tail -2
docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  sh -c "cp /src/fullchain.pem /src/privkey.pem /certs/"
# 起 prod baseline
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait 2>&1 | tail -8
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Expected**:`docker compose ps` 出現 2 個 rust-api replica 容器(`rev1-admin-rust-api-1` / `-2`)、皆 healthy;migration init-container exited 0;postgres / redis / base-web / front-nginx healthy。
**Pass criteria**:rust-api replica = 2、皆 healthy。
**Failure handling**:replica 未起 → check `docker-compose.prod.yml` `deploy.replicas`;port 衝突 → 確認 prod 未對 rust-api 綁 host port。

---

## C-V3: nginx upstream auto-discovery — 解析到 2 個 backend

**Goal**:驗 front-nginx `rust_api` upstream 用 resolver 自動發現 2 個 replica。

**Command**:
```bash
# nginx 載入的 config 含 resolve upstream
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec front-nginx nginx -T 2>/dev/null | grep -A4 "upstream rust_api"
# Docker DNS 對 rust-api 回多個 IP
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec front-nginx getent hosts rust-api
# 經 nginx 的 API 請求可被服務(login)
curl -kfsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' https://127.0.0.1:11443/api/auth/login -o /dev/null -w "HTTP %{http_code}\n"
```

**Expected**:`nginx -T` 顯示 `upstream rust_api` 含 `zone` + `server rust-api:11081 resolve`;`getent hosts rust-api` 回 ≥ 2 個 IP;經 nginx 的 login 回 HTTP 200。
**Pass criteria**:upstream 為 resolve 形態 + Docker DNS 回 ≥ 2 IP + 經 nginx 請求成功。

---

## C-V4: Casbin 跨 instance 一致性(核心、US1.3-1.4)

**Goal**:驗 policy 異動經 pub-sub 傳播到未處理該異動的 replica。

**Command**(capture → mutate-on-replica-1 → verify-replica-2 → restore;實際 role/path/permission id implement 階段 psql 確認):
```bash
# capture:psql 擷取受測 role 對某 path 的現有 Casbin policy(baseline:該 role 對該 path 無 allow)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U soybean -d soybean_admin_rust -tAc \
  "SELECT v0,v1,v2,v3 FROM casbin_rule WHERE ptype='p' AND v2='<probe-path>';"

# pre-check:exec 進 rust-api-2 直打 <probe-path>、受測 role token → 預期 deny(envelope code:5001)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-2 \
  curl -s -o - -H "Authorization: Bearer <role-token>" http://localhost:11081/<probe-path> | head -c 120

# mutate:exec 進 rust-api-1 由 ROLE_SUPER 執行 assign-permission 授予受測 role 對 <probe-path> 的權限
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-1 \
  curl -s -X POST -H "Authorization: Bearer <super-token>" -H "Content-Type: application/json" \
  -d '<assign-permission body>' http://localhost:11081/authorization/assign-permission

# verify:exec 進 rust-api-2(未處理該異動)再打 <probe-path> → 預期 allow(envelope code:0)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-2 \
  curl -s -o - -H "Authorization: Bearer <role-token>" http://localhost:11081/<probe-path> | head -c 120
# verify:rust-api-1(處理該異動、self-receive reload)亦 allow
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-1 \
  curl -s -o - -H "Authorization: Bearer <role-token>" http://localhost:11081/<probe-path> | head -c 120

# restore:exec 進 rust-api-1 assign-permission 還原受測 role 原權限集;verify rust-api-2 回 deny
```

**Expected**:mutate 前 rust-api-2 對 `<probe-path>` 回 deny(`code:5001`);mutate 後 rust-api-2 **與** rust-api-1 皆回 allow(`code:0`)— rust-api-2 未親自處理該異動、其 enforcer 經 redis pub-sub `casbin:policy:invalidate` 收到訊息 `load_policy()` reload;restore 後 rust-api-2 回 deny。
**Pass criteria**:rust-api-2 的 enforce 決策在 mutate 後反映新 policy(證明 pub-sub 傳播);restore 後 seed 無污染。
**Failure handling**:rust-api-2 mutate 後仍 deny → check subscriber task 是否連上 redis、`notify_casbin_changed()` 是否在 mutate 點呼叫、channel 名一致。

> `<probe-path>` / `<assign-permission body>` / role token:implement 階段先 psql 查 `casbin_rule` + `sys_endpoint` 選一個受測 role 現缺、可由 assign-permission 授予的 path,並用 capture→restore 保 seed 不污染。

---

## C-V5: JWT 跨 replica 共享(US1.5)

**Goal**:驗某 replica 簽發的 token 在另一 replica 被接受。

**Command**:
```bash
# 經 nginx login 拿 token(由某 replica 簽發)
TOKEN=$(curl -kfsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' https://127.0.0.1:11443/api/auth/login \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
# 該 token exec 到兩個 replica 各直打受保護 endpoint
for R in rust-api-1 rust-api-2; do
  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec $R \
    curl -s -o /dev/null -w "$R HTTP %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" http://localhost:11081/auth/getUserInfo
done
```

**Expected**:兩個 replica 對同一 token 皆 HTTP 200。
**Pass criteria**:token 跨 replica 通用(JWT secret 為共享 Docker secret)。

---

## C-V6: publish 失敗不阻斷 policy 異動(SC-005、edge case E-1)

**Goal**:驗 redis 不可用時 Casbin policy 異動主流程仍成功。

**Command**:
```bash
# 暫停 redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop redis 2>&1 | tail -1
# exec 進 rust-api-1 執行一次 Casbin policy 異動(assign-permission)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-1 \
  curl -s -o - -X POST -H "Authorization: Bearer <super-token>" -H "Content-Type: application/json" \
  -d '<assign-permission body>' http://localhost:11081/authorization/assign-permission | head -c 120
# 查 rust-api-1 log 有 publish 失敗 warning
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs rust-api-1 2>&1 | grep -i "casbin.*invalidate\|publish" | tail -3
# 還原 redis + restore policy
docker compose -f docker-compose.yml -f docker-compose.prod.yml start redis 2>&1 | tail -1
```

**Expected**:redis 停的情況下 assign-permission 仍回 envelope `code:0`(異動寫入 DB 成功);rust-api log 出現 publish 失敗 warning。
**Pass criteria**:policy 異動成功(`code:0`)+ warning log — publish 失敗未阻斷主流程。

---

## C-V7: subscriber reconnect(edge case E-2)

**Goal**:驗 redis 斷線後 subscriber task 重連、恢復一致性。

**Command**:
```bash
# 承 C-V6:redis 重啟後,exec 進 rust-api-1 做一次新異動 → rust-api-2 應仍能收到並 reload
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-1 \
  curl -s -X POST -H "Authorization: Bearer <super-token>" -H "Content-Type: application/json" \
  -d '<assign-permission body>' http://localhost:11081/authorization/assign-permission
sleep 2
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec rust-api-2 \
  curl -s -o - -H "Authorization: Bearer <role-token>" http://localhost:11081/<probe-path> | head -c 120
```

**Expected**:redis 重啟後 subscriber task 重連成功;新異動仍能傳播到 rust-api-2(reconnect loop 生效)。
**Pass criteria**:redis 恢復後 coherence 恢復(rust-api-2 反映新異動)。

---

## C-V8: dev regression(US1.6)

**Goal**:驗 dev stack 仍單實例、不退化。

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans 2>&1 | tail -2
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait 2>&1 | tail -5
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
curl -fsS http://127.0.0.1:11081/health -w " <- rust-api direct\n"
curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login -o /dev/null -w "HTTP %{http_code} <- login via nginx\n"
```

**Expected**:dev stack rust-api **單一**容器(非 -1/-2)、`127.0.0.1:11081` debug port 直連 `/health` OK、經 nginx login HTTP 200;6 service healthy。
**Pass criteria**:dev rust-api 單實例 + debug port 正常 + 功能不退化。

---

## C-V9: three-side scope verify(zero-regression)

**Command**:
```bash
echo "base-web/ diff (預期 0):" && git diff HEAD -- base-web/ | wc -l
echo "nestjs fork diff (預期 0):" && git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l
echo "docker-compose.dev.yml diff (預期 0):" && git diff HEAD -- docker-compose.dev.yml | wc -l
echo "default.conf (dev/共用) diff (預期 0):" && git diff HEAD -- deploy/front-nginx/conf.d/default.conf | wc -l
echo "rust-api scope:" && (cd rust-api && git diff HEAD --stat && git status --short)
echo "outer scope:" && git status --short
```

**Expected**:
- base-web/ + nestjs fork + `docker-compose.dev.yml` + 共用 `default.conf` 各 **0 line** diff
- rust-api scope = pub-sub publisher + subscriber + 3 call-site instrumentation + 註冊(預期 ~7-8 file)
- outer scope:`docker-compose.prod.yml` + `default.conf.prod` + rust-api SHA pin + spec docs + `CLAUDE.md` + `INTEGRATION-CHECKLIST.md`(含 W-F11 mislabel 修正)

**Pass criteria**:base-web/nestjs/dev compose/共用 nginx conf 各 0 diff;rust-api 改動限 pub-sub + instrumentation;無 migration、無 DB schema 改。

---

## 完成標誌

9 個 verification 全 PASS = W-F11 acceptance 9/9 PASS、ready for 兩段式 commit。

| ID | Goal | Pass criteria |
|---|---|---|
| C-V1 | rust-api image rebuild OK | cargo build exit 0 + 新 image SHA |
| C-V2 | prod stack 2 replica healthy | rust-api replica = 2、皆 healthy |
| C-V3 | nginx upstream auto-discovery | resolve upstream + Docker DNS ≥ 2 IP + 經 nginx 請求成功 |
| C-V4 | Casbin 跨 instance 一致性(核心) | mutate-on-replica-1 後 rust-api-2 enforce 反映新 policy |
| C-V5 | JWT 跨 replica 共享 | token 跨 2 replica 皆 HTTP 200 |
| C-V6 | publish 失敗不阻斷 | redis 停時 policy 異動仍 `code:0` + warning log |
| C-V7 | subscriber reconnect | redis 恢復後 coherence 恢復 |
| C-V8 | dev regression | dev rust-api 單實例 + debug port + 功能不退化 |
| C-V9 | three-side scope | base-web/nestjs/dev-compose/共用-nginx-conf 0 diff + rust-api 限 pub-sub |
