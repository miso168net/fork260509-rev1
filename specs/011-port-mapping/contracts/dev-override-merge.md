# Contract: docker-compose.dev.yml + 主 compose merge 行為

**Feature**: W-F7 port-mapping
**Contract type**: deployment configuration interface
**Date**: 2026-05-17

> 本契約定義 `docker-compose.dev.yml` 與主 `docker-compose.yml` 在 `docker compose -f -f` 啟動下的 merge 行為預期、以及 W-F7 對既有 W-F5 配置的不變式保證。

---

## C-M1:`-f -f` merge 順序與優先級

**Contract**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml ...` 兩個 yaml 按命令列順序合併,**第二個檔的內容**對同 key:
- **scalar / map**:override(後者覆蓋前者)
- **list**(`ports` / `volumes` / `environment` list form / `depends_on` 等):**append**(後者追加進前者)

**Source of truth**:[Docker Compose Merge specification](https://docs.docker.com/compose/multiple-compose-files/merge/)

**Verification**(implement 階段 T1):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | yq '.services.front-nginx.ports'
# 預期輸出(YAML list):
# - 127.0.0.1:11080:80
```

---

## C-M2:主 compose `ports` baseline = 空

**Contract**:W-F5 結束時主 `docker-compose.yml` 對 4 個目標 service(front-nginx / rust-api / postgres / redis)**全無** `ports` 區塊。`-f -f` merge 後 ports list = `[<dev.yml 的 1 條 entry>]`(純新增、無與主 compose 既有 ports 共存的情境)。

**Verification**(implement 階段 T1 前置 sanity):
```bash
grep -A 30 "^  front-nginx:" docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
grep -A 30 "^  rust-api:"    docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
grep -A 30 "^  postgres:"    docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
grep -A 30 "^  redis:"       docker-compose.yml | grep -E "^\s+ports:"  # 預期無輸出
```

若 W-F7 implement 前發現主 compose 已有任一 service 的 ports 區塊(例如 W-F6 / 其他 feature 已先動)— 須停止 implement、重新評估 merge 行為(append 後可能有重複 port、需 review)。

---

## C-M3:dev.yml 不可重複定義主 compose 已有的 service body

**Contract**:`docker-compose.dev.yml` 對每個 service entry 只列 service name + `ports` 區塊,**不列**:
- `image` / `build`
- `environment` / `secrets`
- `depends_on`
- `networks` / `volumes`
- `healthcheck`
- `restart`

**Rationale**:這些欄位由主 compose 提供;dev.yml 重複定義會產生 merge 不一致或意外覆蓋(per FR-003)。

**Verification**(implement 階段 T1):
```bash
# 對每個 service、dev.yml 內只允許 ports 區塊
for svc in front-nginx rust-api postgres redis; do
  yq ".services.$svc | keys" docker-compose.dev.yml
  # 預期輸出:
  # - ports
done
```

---

## C-M4:127.0.0.1 binding 嚴格性

**Contract**:`docker-compose.dev.yml` 內每條 ports entry **MUST** 為 `"127.0.0.1:<host_port>:<container_port>"` 三元組短字串形式。**不可**:
- 省略 IP 前綴(`"11080:80"` → 預設 0.0.0.0)
- 用 `0.0.0.0:` / `*:` / `[::]:` 開頭
- 用 long-form dict(`{ host_ip: 127.0.0.1, ... }`)

**Verification**(implement 階段 T1 + T4):
```bash
# 靜態檢查 yaml
grep -E '^\s+- "' docker-compose.dev.yml | grep -vE '^\s+- "127\.0\.0\.1:[0-9]+:[0-9]+"$'
# 預期無輸出(任何不合格的 entry 都不能命中)

# 動態檢查 runtime binding(per AC US3.1)
ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
# 預期 4 行、Local Address 全 127.0.0.1:<port>
```

---

## C-M5:Prod baseline 不暴露不變式

**Contract**:不帶 `-f docker-compose.dev.yml` 的 `docker compose up -d` 啟動後,host 機**不可有任何**:
- TCP listener 在 11080 / 11081 / 15432 / 16379
- iptables DNAT rule 將 host port 轉發到 container

**Verification**(implement 階段 T5):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose up -d --wait

# 必驗 1:host 無 listener
ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'
# 預期無輸出

# 必驗 2:host curl refused
curl -fsS http://127.0.0.1:11080/health --max-time 5
# 預期 exit code != 0 + Connection refused / timeout

# 必驗 3:stack 內部仍 work
docker compose exec front-nginx wget -qO- http://localhost/health
# 預期回 "ok"
```

---

## C-M6:dev / prod 切換無 stack 重 build

**Contract**:dev 模式 → prod baseline 切換、或 prod → dev,**不應**觸發任何 image rebuild(不動 Dockerfile、不改 build context)、不應變動 named volume(postgres_data / redis_data)的內容。

**Verification**(implement 階段 T6 — 切換時序):
```bash
# Step 1:dev mode 起、寫一筆測試資料
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
psql -h 127.0.0.1 -p 15432 -U postgres -c "CREATE TABLE IF NOT EXISTS wf7_test (val text); INSERT INTO wf7_test VALUES ('alive');"

# Step 2:切 prod baseline(只 down + up、不 down -v)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans  # 不帶 -v 保留 volume
docker compose up -d --wait

# Step 3:從 container 內驗資料還在
docker compose exec postgres psql -U postgres -c "SELECT val FROM wf7_test;"
# 預期回 'alive'(volume 持久、dev → prod 切換不破壞資料)

# Cleanup
docker compose down -v --remove-orphans
```

---

## C-M7:base-web / migration 不暴露 host port

**Contract**:`docker-compose.dev.yml` **不可**為 `base-web` / `migration` 加 ports 區塊。

**Rationale**:
- `base-web` 是 internal-only SPA service、透過 front-nginx 反向代理對外(W-F5 既有),host 直訪 base-web 不必要、且若加 port 會繞過 front-nginx routing logic。
- `migration` 是 one-shot job、`exited (0)` 後不再 listen,加 host port 無意義。

**Verification**(implement 階段 T1):
```bash
yq '.services.base-web.ports'   docker-compose.dev.yml  # 預期 null
yq '.services.migration.ports' docker-compose.dev.yml  # 預期 null
```

---

## Contracts 數量

| Contract | 名稱 | 影響範圍 |
|---|---|---|
| C-M1 | `-f -f` merge 行為 | 全 yaml 配置語意 |
| C-M2 | 主 compose ports baseline 空 | 4 個目標 service |
| C-M3 | dev.yml 不重複 body | 4 個 service entry |
| C-M4 | 127.0.0.1 binding 嚴格 | 4 條 ports entry |
| C-M5 | Prod baseline 不暴露 | runtime invariant |
| C-M6 | dev/prod 切換不破壞 stack | volume / build invariant |
| C-M7 | base-web / migration 不暴露 | exclusion 邊界 |

**契約全部由 implement 階段 task T1 / T4 / T5 / T6 驗證**(無 production runtime 監控需求、本 feature 為 dev 工具)。
