# Contract: cert lifecycle(W-F6)

**Feature**: W-F6 tls-cert-management
**Contract type**: cert生命週期 + 來源契約
**Date**: 2026-05-18

> 本契約定義 dev 自簽 cert 與 prod acme.sh skeleton 的 cert lifecycle、cert source / target path / handoff 機制。

---

## C-C1:Cert path 統一 `/etc/nginx/certs/{fullchain,privkey}.pem`

**Contract**:無論 dev 還是 prod,nginx 永遠讀同一 path,**不**做 conditional logic;dev/prod 差別僅在「volume 內容怎麼來」。

**File names**:
- `fullchain.pem`(public、cert + chain)
- `privkey.pem`(private、RSA 4096、permissions 600 in dev)

**Verification**(implement 階段 — dev mode):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec front-nginx ls -la /etc/nginx/certs/
# 預期:含 fullchain.pem + privkey.pem;privkey.pem perm = 600
```

prod mode 同上(cert 從 named volume、acme 寫進、未實際 issue 前手動 seed)。

---

## C-C2:Dev cert source — host file mount

**Contract**:dev mode 透過 `docker-compose.dev.yml` mount `./deploy/dev-certs:/etc/nginx/certs:ro` **覆蓋**主 compose 的 `front_nginx_certs` named volume mount(per R-2)。

**Generation**:operator 跑 `bash deploy/generate-dev-cert.sh` 一次生成 365 天 cert。

**Verification**:
```bash
# 1. 生成
bash deploy/generate-dev-cert.sh
ls -la deploy/dev-certs/*.pem
# 預期:fullchain.pem + privkey.pem(privkey 600、fullchain 644)

# 2. mount 進 container 覆蓋 named volume
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | \
  yq '.services.front-nginx.volumes[] | select(.target == "/etc/nginx/certs")'
# 預期單一 entry:type=bind、source=./deploy/dev-certs

# 3. container 內讀到 cert
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec front-nginx \
  openssl x509 -in /etc/nginx/certs/fullchain.pem -noout -subject
# 預期:subject=CN = localhost
```

---

## C-C3:Prod cert source — named volume `front_nginx_certs`

**Contract**:prod mode 透過主 compose `front_nginx_certs:/etc/nginx/certs:ro` mount,cert 由 acme.sh 寫進 named volume(W-F6 範疇 skeleton、cert 由 operator 手動 seed;W-F6b 落地後 acme.sh 自動 issue / renew)。

**Volume 內結構**:
```
/etc/nginx/certs/  (= /acme.sh 從 acme container 視角)
├── account.conf       # acme.sh init(W-F6b 啟用)
├── <domain>/          # 每個 domain 一個 dir
│   ├── fullchain.pem  # acme 寫
│   └── privkey.pem    # acme 寫
└── ...
```

> **W-F6 階段簡化**:nginx 直接讀 `/etc/nginx/certs/fullchain.pem` + `privkey.pem`,默認 cert 位於 root path、不是 domain 子 dir。W-F6b 落地後改 nginx config 讀 `<domain>/fullchain.pem` 或加 symlink。

**Verification**(W-F6 階段 — 用 dev cert seed 模擬 prod):
```bash
# 把 dev cert 內容塞進 named volume
docker run --rm -v rev1-admin_front_nginx_certs:/certs -v "$PWD/deploy/dev-certs":/src alpine \
  cp /src/fullchain.pem /src/privkey.pem /certs/

# 啟 prod baseline 驗 cert 來自 named volume
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
docker compose exec front-nginx ls -la /etc/nginx/certs/
# 預期:fullchain.pem + privkey.pem
```

---

## C-C4:Dev cert SAN — DNS:localhost + IP:127.0.0.1

**Contract**(per FR-006 + SC-004):自簽 cert MUST 含 SAN extension、同時涵蓋 `DNS:localhost` + `IP:127.0.0.1`。

**Verification**:
```bash
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -ext subjectAltName
# 預期輸出含:
#   X509v3 Subject Alternative Name:
#       DNS:localhost, IP Address:127.0.0.1
```

**Rationale**:
- `curl https://localhost:11443/...` 需 DNS:localhost
- `curl https://127.0.0.1:11443/...` 需 IP:127.0.0.1
- 缺一 = 該訪問形式 cert 驗證 fail(雖然 `-k` 跳過但不該預期)

---

## C-C5:Dev cert 有效期 365 天

**Contract**:`generate-dev-cert.sh` 用 `openssl req -days 365`、生成 cert 有效期 365 天。

**Verification**:
```bash
openssl x509 -in deploy/dev-certs/fullchain.pem -noout -dates
# 預期:
#   notBefore=<today>
#   notAfter=<today + 1 year>
```

**Lifecycle policy**(per spec edge case E-3):cert 過期 365 天後 user 重跑 `generate-dev-cert.sh` 即可、不自動 renew。

---

## C-C6:Dev cert privkey permissions 600

**Contract**:`generate-dev-cert.sh` `chmod 600 privkey.pem`、private key 只 owner 可讀。

**Verification**:
```bash
stat -c "%a" deploy/dev-certs/privkey.pem
# 預期:600
```

---

## C-C7:Acme.sh secret email 注入(W-F4 `_FILE` pattern)

**Contract**:`acme` service 透過 `ACME_EMAIL_FILE=/run/secrets/acme_email` env(per FR-003 + W-F4 既有 `_FILE` pattern);**不**直接 env var 注入。

**Verification**(prod + acme mode):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait

# 1. secret file mount 進 container
docker compose exec acme cat /run/secrets/acme_email
# 預期:email content(per deploy/secrets/acme_email.txt)

# 2. env 含 _FILE 變量
docker compose exec acme env | grep ACME_EMAIL_FILE
# 預期:ACME_EMAIL_FILE=/run/secrets/acme_email

# 3. env 不含明文(W-F4 紀律 — secret 不進 process env)
docker compose exec acme env | grep -v "_FILE" | grep -i "@"
# 預期無輸出(email 明文不該出現在 env)
```

---

## C-C8:Acme.sh sanity — `--version` work

**Contract**(per US-3 scenario 2):acme container `acme.sh --version` 命令成功執行、印版本。

**Verification**:
```bash
docker compose exec acme acme.sh --version
# 預期:exit 0 + stdout 含版本字串(如 "v3.0.x")
```

**Failure 判讀**:
- `acme.sh: not found`:image pull 失敗或 PATH 問題 → check `docker compose logs acme`
- exit 非 0:image 變動 / binary path 改 → check neilpang/acme.sh release notes

---

## C-C9:Acme.sh skeleton 不 crash loop

**Contract**(per spec A-008 + R-6):`command: ["daemon"]` 模式啟動後 container 進入 idle 等待,**不**crash loop。

**Verification**:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
sleep 15  # 給 daemon 起 + idle
docker compose ps acme | grep -E "running|Up"
# 預期:status running、非 restarting

docker compose logs acme --tail 20
# 預期:無 "panic"、"fatal"、"error" 訊息;含 "[start]" 或類似 entry point log
```

**Fallback**(若實測 crash loop):改 `command: ["sleep", "infinity"]` 純 idle、W-F6b 啟用真實 cert 時切回 `["daemon"]`。

---

## C-C10:W-F6 階段 acme.sh **不**實際 issue cert(deferred)

**Contract**:W-F6 範疇明確排除 acme.sh `--issue` / `--renew` 命令。`/acme.sh` volume 在 W-F6 完成時為空 / 只含 init files、不含 issued cert。

**Verification**:
```bash
docker compose exec acme ls -la /acme.sh
# 預期:dir 存在;空 / 只含 acme.sh 預設 init files(如 account.conf);不含 <domain>/fullchain.pem

# 確認 W-F6 acceptance 不嘗試 issue cert
docker compose exec acme acme.sh --list
# 預期:0 cert listed
```

---

## Contracts 數量

| Contract | 規範範疇 |
|---|---|
| C-C1 | cert path 統一(無 conditional) |
| C-C2 | dev cert source(host file mount) |
| C-C3 | prod cert source(named volume) |
| C-C4 | SAN extension(DNS + IP) |
| C-C5 | 有效期 365 天 |
| C-C6 | privkey permissions 600 |
| C-C7 | acme secret 注入 W-F4 pattern |
| C-C8 | acme.sh --version sanity |
| C-C9 | acme daemon 不 crash loop |
| C-C10 | W-F6 不實際 issue(deferred W-F6b) |

**10 個 cert lifecycle contract、涵蓋 dev / prod / acme 三段**。
