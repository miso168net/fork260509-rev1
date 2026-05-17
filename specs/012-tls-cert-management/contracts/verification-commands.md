# Contract: host 驗證命令(W-F6)

**Feature**: W-F6 tls-cert-management
**Contract type**: verification command interface
**Date**: 2026-05-18

> 本契約定義 W-F6 acceptance 階段 host 機驗證命令的**標準形式**、**預期輸出**、**失敗判讀**。implement 階段 task 與 acceptance scenario(US1 7 / US2 4 / US3 4)以此契約為基準。

---

## C-V1:Dev cert script 生成(US1.1)

**Command**:
```bash
bash deploy/generate-dev-cert.sh
ls -la deploy/dev-certs/*.pem
```

**Expected**:
- Exit code: 0
- stdout: `✓ Dev cert generated at ...` + 操作指引
- 2 個 .pem 檔生成:`fullchain.pem`(644 perm)+ `privkey.pem`(600 perm)

**Failure 判讀**:
- `openssl: command not found` → host 機需裝 openssl(`apt install openssl` / `brew install openssl` / WSL 預裝)
- privkey perm ≠ 600 → 腳本 chmod 邏輯有問題

---

## C-V2:Dev stack 啟動 6 service healthy(US1.2)

**Command**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps
```

**Expected**:
- Exit code: 0(60-90s 內完成)
- `docker compose ps`:6 service(postgres / redis / migration exited 0 / rust-api / base-web / front-nginx)healthy 或 exited 0

**Failure 判讀**:
- front-nginx unhealthy → 可能 dev cert 沒生成、nginx 443 server fail;check `docker compose logs front-nginx`
- 啟動 > 90s → 可能 cert mount path 錯、image rebuild;檢 NFR-003

---

## C-V3:Dev HTTP `:11080/health`(W-F7 既有不破、US1.3)

**Command**:
```bash
curl -fsS http://127.0.0.1:11080/health
```

**Expected**:
- Exit code: 0
- stdout: `ok`

**Failure 判讀**:
- Connection refused → dev.yml ports entry 漏 11080(W-F7 既有應保留)
- HTTPS handshake error response → 誤訪 443(dev 80 仍應 serve、無 redirect)

---

## C-V4:Dev HTTPS `:11443/health`(US1.4)

**Command**:
```bash
curl -kfsS https://127.0.0.1:11443/health
```

**Expected**:
- Exit code: 0
- stdout: `ok`
- 注意 `-k` flag(忽略自簽 cert warning)

**Failure 判讀**:
- `SSL certificate problem` 但加 `-k` 還 fail → cert SAN 缺 IP:127.0.0.1(C-C4)
- Connection refused → dev.yml ports entry 漏 11443(W-F6 新加)
- 502 Bad Gateway → backend 沒起;check `docker compose ps`

---

## C-V5:Dev HTTPS login e2e(US1.5)

**Command**:
```bash
curl -kfsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' \
  https://127.0.0.1:11443/api/auth/login
```

**Expected**:
- Exit code: 0
- HTTP status:200
- stdout: JSON body 含 `"token"` 欄位

**Failure 判讀**:
- 401 → 密碼錯;check CLAUDE.md §5.1 預設帳號
- 404 → /api/ proxy_pass 配置壞(W-F5 既有路徑)
- 502 → rust-api unhealthy

---

## C-V6:TLS handshake + cert subject(US1.6)

**Command**:
```bash
openssl s_client -connect 127.0.0.1:11443 -servername localhost </dev/null 2>&1 | \
  grep -E "subject=|Cipher|TLSv"
```

**Expected**:
- stdout 含 `subject=CN = localhost`(或 `subject=CN=localhost`)
- stdout 含 `Protocol  : TLSv1.3`(或 `TLSv1.2`)
- stdout 含 `Cipher    : <one of TLS_AES_256_GCM_SHA384 / TLS_CHACHA20_POLY1305_SHA256 / ...>`

**Failure 判讀**:
- `Protocol  : TLSv1.0` 或 `TLSv1.1` → nginx config `ssl_protocols` 配置壞;檢 C-N6
- `verify return code: 18 (self signed certificate)` → 預期(自簽 cert、正常)

---

## C-V7:Cert SAN 驗(US1.7 + SC-004)

**Command**:
```bash
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName
```

**Expected**:
- Exit code: 0
- stdout 含:
  ```
  X509v3 Subject Alternative Name:
      DNS:localhost, IP Address:127.0.0.1
  ```

**Failure 判讀**:
- 只含 `DNS:localhost` 缺 `IP Address` → `generate-dev-cert.sh` `-addext` 寫法有問題;檢 R-4
- 完全無 SAN extension → 同上

---

## C-V8:Prod baseline 80 → 443 redirect(US2.2 + SC-003)

**Command**(在 prod baseline mode 起 stack 後):
```bash
curl -fsSI http://127.0.0.1:11080/health
# 注意:-I 看 header(不 follow redirect)、不可加 -L
```

**Expected**:
- Exit code: 0
- HTTP status:**301**
- Header `Location:` 開頭為 `https://...`(如 `https://127.0.0.1/health` 或 `https://127.0.0.1:11080/health`)

**Failure 判讀**:
- 回 200 + body `ok` → prod nginx config 沒切換到 default.conf.prod;檢 C-M5
- 回 301 但 Location 為 http:// → nginx redirect target 配置壞;檢 C-N3

---

## C-V9:Prod baseline `/.well-known/acme-challenge/` 例外不 redirect(US2.3)

**Command**:
```bash
curl -fsSI http://127.0.0.1:11080/.well-known/acme-challenge/dummy
```

**Expected**:
- HTTP status:**非 301**(預期 404、表示 `^~` location 攔到、不被 redirect)
- 注意:**不該回 301**(若回 301 表示 redirect 機制把 acme 路徑也吃掉)

**Failure 判讀**:
- 回 301 → nginx config `^~ /.well-known/acme-challenge/` location 沒生效;檢 C-N3 寫法
- 回 200 / 503 → 預期 404 因為 path 對應 file 不存在;不影響 acme.sh 未來 acquisition

---

## C-V10:Prod baseline HTTPS work(US2.4)

**Command**:
```bash
curl -kfsS https://127.0.0.1:11443/health
```

**Expected**:
- Exit code: 0
- stdout: `ok`

**Failure 判讀**:
- Connection refused → prod.yml ports entry 漏 11443
- SSL handshake fail → cert 沒 pre-seed 進 named volume;檢 C-C3

---

## C-V11:Acme service `--version` sanity(US3.2 + SC-007)

**Command**(prod + acme mode 起 stack 後):
```bash
docker compose exec acme acme.sh --version
```

**Expected**:
- Exit code: 0
- stdout 含 acme.sh 版本字串(如 `v3.0.x`)

**Failure 判讀**:
- `acme.sh: not found` → image 拉 fail 或 PATH 異常;`docker compose logs acme`
- exit 非 0 → image 變動;檢 neilpang/acme.sh release notes

---

## C-V12:Acme service secret 注入 sanity(US3.3)

**Command**:
```bash
docker compose exec acme cat /run/secrets/acme_email
```

**Expected**:
- Exit code: 0
- stdout: email content(per `deploy/secrets/acme_email.txt`)

**Failure 判讀**:
- `No such file or directory` → secret 沒 mount;檢 C-M9 + C-C7
- 空輸出 → secret 檔案空;檢 `deploy/secrets/acme_email.txt` 內容

---

## C-V13:Acme service volume mount sanity(US3.4)

**Command**:
```bash
docker compose exec acme ls -la /acme.sh
```

**Expected**:
- Exit code: 0
- stdout 顯示 dir 存在;W-F6 階段空 / 只含 acme.sh 預設 init files(如 `account.conf` placeholder)

**Failure 判讀**:
- `No such directory` → volume 沒 mount;檢 C-M7 + data-model E1

---

## C-V14:Binding 範圍 — Dev loopback only(US3 補強 / W-F7 對齊)

**Command**(dev mode):
```bash
ss -tlnp 2>/dev/null | grep -E ":(11080|11081|11443|15432|16379)\b"
```

**Expected**:
- 5 行輸出
- 每行 Local Address 都是 `127.0.0.1:<port>`(非 0.0.0.0)

**Failure 判讀**:
- 任一行 Local Address 開頭 `0.0.0.0` → dev.yml ports 配置壞、binding 漏 IP 前綴

---

## C-V15:Binding 範圍 — Prod 0.0.0.0(對外可達)

**Command**(prod mode):
```bash
ss -tlnp 2>/dev/null | grep -E ":(11080|11443)\b"
```

**Expected**:
- 2 行輸出
- 每行 Local Address 為 `0.0.0.0:11080` + `0.0.0.0:11443`

**Failure 判讀**:
- Local Address 為 `127.0.0.1` → prod.yml ports 配置誤加 IP 前綴
- 無輸出 → prod.yml ports 沒生效;檢 C-M3

---

## C-V16:`docker compose config` yaml 驗(FR-010 對齊)

**Command**(三種 -f 組合):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config > /dev/null
docker compose -f docker-compose.yml -f docker-compose.prod.yml config > /dev/null
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod config > /dev/null
```

**Expected**:
- 三條命令全 exit 0、無 stdout(config render 成功、無 warning 寫到 stderr 也接受 但 error 寫 stderr 不接受)

**Failure 判讀**:
- yaml syntax error → 修對應 -f 檔
- service refers to undefined → service name 拼錯;檢主 compose / dev.yml / prod.yml

---

## Contracts 數量

| Contract | 對應 US scenario | 場景 |
|---|---|---|
| C-V1 | US1.1 | dev cert script 生成 |
| C-V2 | US1.2 | dev stack healthy |
| C-V3 | US1.3 | dev HTTP 11080(W-F7 不破)|
| C-V4 | US1.4 | dev HTTPS 11443 |
| C-V5 | US1.5 | dev HTTPS login e2e |
| C-V6 | US1.6 | TLS handshake + protocol |
| C-V7 | US1.7 + SC-004 | cert SAN 驗 |
| C-V8 | US2.2 | prod 80 redirect |
| C-V9 | US2.3 | prod acme-challenge 例外 |
| C-V10 | US2.4 | prod HTTPS work |
| C-V11 | US3.2 | acme --version |
| C-V12 | US3.3 | acme secret 注入 |
| C-V13 | US3.4 | acme volume mount |
| C-V14 | US3 補強 | dev binding loopback |
| C-V15 | US2 補強 | prod binding 0.0.0.0 |
| C-V16 | FR-010 | yaml config 驗 |

**16 個 verification contract、涵蓋 US1 7 / US2 4 / US3 4 scenarios 共 15 個 acceptance scenario + 4 個補強驗**。
