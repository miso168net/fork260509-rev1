# Contract: docker compose overlay merge(W-F6)

**Feature**: W-F6 tls-cert-management
**Contract type**: docker compose overlay 行為契約
**Date**: 2026-05-18

> 本契約定義 W-F6 主 compose + dev.yml + prod.yml 三個檔在 `-f` 各種組合下的 merge 行為:特別針對 ports / volumes / services 的衝突避免機制(per Clarify Q1 + R-1 + R-2)。

---

## C-M1:主 compose `ports` baseline = 空(對齊 W-F7 紀律)

**Contract**:主 `docker-compose.yml` 對 front-nginx **不**含 `ports:` 區段 — 對齊 W-F7 FR-005 主 compose internal-only baseline。

**Verification**:
```bash
yq '.services.front-nginx.ports' docker-compose.yml
# 預期:null

grep -A 30 "^  front-nginx:" docker-compose.yml | grep -E "^\s+ports:"
# 預期:無輸出
```

---

## C-M2:Dev mode ports list — 5 條 entry 全 127.0.0.1

**Contract**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml config` 後 front-nginx ports 含 2 條 entry,其他 service 沿用 W-F7 既有 3 條:
- front-nginx: `127.0.0.1:11080:80`(W-F7 既有)+ `127.0.0.1:11443:443`(W-F6 新加)
- rust-api: `127.0.0.1:11081:11081`(W-F7 既有)
- postgres: `127.0.0.1:15432:5432`(W-F7 既有)
- redis: `127.0.0.1:16379:6379`(W-F7 既有)

**Verification**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | yq '.services.front-nginx.ports'
# 預期 list 含 2 條 entry:
# - "127.0.0.1:11080:80"
# - "127.0.0.1:11443:443"
```

**MUST NOT**:任何 `0.0.0.0` / `*` / `[::]` / 省略 IP 前綴(per Clarify Q1 + W-F7 FR-004 紀律)。

---

## C-M3:Prod mode ports list — 2 條 entry 0.0.0.0

**Contract**:`docker compose -f docker-compose.yml -f docker-compose.prod.yml config` 後 front-nginx ports 含 2 條 entry:
- `11080:80`(short syntax、= 0.0.0.0:11080)
- `11443:443`(short syntax、= 0.0.0.0:11443)

**Verification**:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | yq '.services.front-nginx.ports'
# 預期:[11080:80, 11443:443](或 long-form 等價)

# 確認對外 0.0.0.0 binding
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
ss -tlnp | grep -E ":(11080|11443)\b"
# 預期 2 行、Local Address 為 0.0.0.0:11080 + 0.0.0.0:11443(非 127.0.0.1)
```

---

## C-M4:Cert volume mount override 行為(dev mode dev-certs wins)

**Contract**:dev mode 下 `docker-compose.dev.yml` 加 `./deploy/dev-certs:/etc/nginx/certs:ro` **覆蓋** 主 compose 的 `front_nginx_certs` named volume mount(同 container path、後者 wins、per R-2)。

**Verification**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | \
  yq '.services.front-nginx.volumes[] | select(.target == "/etc/nginx/certs")'
# 預期:單一 entry、type=bind、source 含 ./deploy/dev-certs(非 volume type)

# 動態確認 — dev mode container 內 cert 來自 host file
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec front-nginx \
  cat /etc/nginx/certs/fullchain.pem | head -1
# 預期:含 "-----BEGIN CERTIFICATE-----" + 與 host file 內容相符
```

**Failure mode**:若 docker compose v2 對同 path 兩 mount 不是 "後者 wins" 而是 error(罕見、舊 v1 或 pre-v2.21),則重新設計 — 主 compose 不加 cert mount、dev.yml + prod.yml 各自加(per spec A-002)。

---

## C-M5:Prod mode default.conf.prod mount override

**Contract**:prod mode 下 `docker-compose.prod.yml` mount `./deploy/front-nginx/conf.d/default.conf.prod:/etc/nginx/conf.d/default.conf:ro` **替換** 主 compose 的 `./deploy/front-nginx/conf.d/default.conf` 目錄 mount(per R-2 同 path 後者 wins)。

**Verification**:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | \
  yq '.services.front-nginx.volumes[] | select(.target | contains("conf.d"))'
# 預期:single entry pointing to default.conf.prod
#       (不該有 conf.d dir mount + default.conf.prod file mount 同時存在)

# 動態確認 — prod mode container 讀 prod variant config
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
docker compose exec front-nginx cat /etc/nginx/conf.d/default.conf | grep -c "return 301"
# 預期:≥ 1(prod variant 含 redirect)
```

---

## C-M6:Acme service profile 隔離

**Contract**:`acme` service `profiles: ["prod"]` — `docker compose up` 不帶 `--profile prod` 時 **不**啟動。

**Verification**:
```bash
# dev mode 不啟 acme
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps acme
# 預期:無輸出(acme service 未啟動)

# prod baseline 不帶 profile 也不啟 acme
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --wait
docker compose ps acme
# 預期:無輸出

# prod + --profile prod 才啟 acme
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose ps acme
# 預期:狀態 running(或 healthy 若有 healthcheck)
```

---

## C-M7:Named volume `front_nginx_certs` 始終存在 + ro mount

**Contract**:主 compose 加 named volume `front_nginx_certs`、front-nginx 永遠 `:ro` mount(read-only、避免 nginx 誤寫 cert)。

**Verification**:
```bash
# Volume 存在
yq '.volumes.front_nginx_certs' docker-compose.yml
# 預期:non-null

# nginx ro mount
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | \
  yq '.services.front-nginx.volumes[] | select(.target == "/etc/nginx/certs") | .read_only'
# 預期:true

# acme rw mount(寫 cert 用)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod config | \
  yq '.services.acme.volumes[] | select(.target == "/acme.sh") | .read_only'
# 預期:false 或 null(預設 rw)
```

---

## C-M8:三種啟動模式 service count

**Contract**(per US-1 / US-2 / US-3 acceptance):

| 模式 | -f options | --profile | service count(running)|
|---|---|---|---|
| dev | `-f main -f dev` | (none)| **6**(postgres / redis / migration(exited 0)/ rust-api / base-web / front-nginx)|
| prod baseline | `-f main -f prod` | (none)| **6** 同 dev、無 acme |
| prod + acme | `-f main -f prod` | `--profile prod` | **7**(6 + acme container)|

**Verification**:
```bash
# dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
docker compose ps --status=running | wc -l   # 預期 6 (header 1 + 5 service;migration exited 不算 running)

# prod + acme
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --wait
docker compose ps --status=running | grep -c acme   # 預期 1
```

---

## C-M9:`acme_email` secret 加進 secrets list(W-F4 對齊)

**Contract**:主 compose `secrets:` top-level 加第 6 個 entry `acme_email`(對齊既有 5 個 W-F4 secret 模式)。

**Verification**:
```bash
yq '.secrets | keys' docker-compose.yml
# 預期 6 個:
# - jwt_secret
# - database_url
# - redis_url
# - postgres_password
# - redis_password
# - acme_email

yq '.secrets.acme_email.file' docker-compose.yml
# 預期:./deploy/secrets/acme_email.txt
```

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-M1 | 主 compose ports baseline 空(對齊 W-F7) |
| C-M2 | Dev mode 5 ports 全 127.0.0.1 |
| C-M3 | Prod mode 2 ports 全 0.0.0.0 |
| C-M4 | Dev cert volume mount override |
| C-M5 | Prod default.conf.prod mount override |
| C-M6 | Acme profile=prod 隔離 |
| C-M7 | Named volume + ro/rw 區分 |
| C-M8 | 三啟動模式 service count(6/6/7) |
| C-M9 | acme_email secret 加進 secrets list |

**9 個 compose overlay contract、3 個 yaml 檔 × 4 種啟動組合 = 12 種狀態空間全涵蓋**。
