# Phase 0 Research: W-F7 port-mapping

**Feature**: W-F7 — port-mapping(dev host port forward)
**Date**: 2026-05-17
**Source**: [spec.md](spec.md) + [docs/superpowers/008-feature-port-mapping.md](../../docs/superpowers/008-feature-port-mapping.md)

> 本檔結構:對 spec / brainstorm 階段未完全消化的「技術細節 / 行為假設」做最終驗證。本 feature brainstorm 3 個 Q 已拍板,research 主要驗證 docker compose 機制細節。

---

## R-1:Docker Compose v2 `-f -f` merge 行為 — 特別針對 `ports` list

### Decision

`docker compose -f docker-compose.yml -f docker-compose.dev.yml` 對同 service name 下的 `ports` 區段:**list append**(override 檔的 ports 條目追加進主 compose 的 ports list、不 replace)。

### Rationale(per Docker compose v2 spec)

- [Docker Compose Merge specification](https://docs.docker.com/compose/multiple-compose-files/merge/):"For sequences like `ports`, `volumes`, `environment` (list form), Compose appends the second file's values to the first."
- W-F5 結束時主 `docker-compose.yml` 對 4 個目標 service(front-nginx / rust-api / postgres / redis)**全無** `ports` 區段(grep 確認 W-F5 commit `101c9ac`)、純新增無覆蓋衝突。

### Verification(implement 階段)

`docker compose -f docker-compose.yml -f docker-compose.dev.yml config | yq '.services.front-nginx.ports'` 預期輸出 1 條 `127.0.0.1:11080:80`(無 dev.yml 時則為 null)。

### Alternatives considered

- **`docker-compose.override.yml` auto-load**:被 Q3 brainstorm 駁回(prod CI 不加 `-f` 顯式主檔時誤暴露風險顯著)。
- **Compose profile**:技術上 profile 只控制 service 是否啟動、**無法控制單一 service 的 ports 區段** — 排除。
- **直接寫主 compose**:被 Q3 駁回(prod 部署要記得改 yaml、易忘)。

---

## R-2:`127.0.0.1:<host>:<container>` 三元組 binding 語法

### Decision

`docker-compose.dev.yml` 每條 ports entry 用 **明確 `127.0.0.1:` 前綴**的長字串形式:`"127.0.0.1:11080:80"`,**不**用省略前綴 `"11080:80"` 或 long-form 字典形式(`{ host_ip: 127.0.0.1, ... }`)。

### Rationale

- Docker engine 預設行為:省略 IP 等於 `0.0.0.0`(per [Compose ports spec short syntax](https://docs.docker.com/compose/compose-file/05-services/#short-syntax-3))— FR-004 嚴禁。
- 短字串形式(`"127.0.0.1:11080:80"`)是 docker-compose 最常見、最易讀的寫法(對齊 fork260509 既有風格、社群慣例)。
- Long-form 字典形式可讀性略差、且本 feature 不需 `protocol` / `mode` 等額外欄位,短形式足夠。

### Verification(implement 階段)

`ss -tlnp 2>/dev/null | grep ':<port>'` 應顯示 `127.0.0.1:<port>` 而非 `*:<port>` / `0.0.0.0:<port>` / `[::]:<port>`(per AC US3.1)。

### Alternatives considered

- **Long-form 字典**:可讀性差;留至需要 `protocol` 區分時再用。
- **Compose `ports.host_ip` env var**:有些 setup 用 `${HOST_IP:-127.0.0.1}:<port>:<port>` 樣式,本 feature 不需可配置性(per spec OOS-005 不支援 LAN binding)。

---

## R-3:WSL2 networking mode 對 `127.0.0.1` 可達性影響

### Decision

**假設 mirrored networking mode**(Win11 22H2+ 預設、由 `.wslconfig` `[wsl2] networkingMode=mirrored` 設定)。NAT 模式下 Windows host 訪問 WSL2 內 `127.0.0.1` 不可達 — 屬 edge case E-1、quickstart 文檔提示、不在 W-F7 範疇自動處理。

### Rationale

- Mirrored mode(WSL2 ≥ 2.0.0、Win11 22H2+):Windows host 與 WSL2 共用 loopback、`127.0.0.1` 在兩側互通。
- NAT mode(舊版預設):WSL2 有獨立 IP(可用 `wsl hostname -I` 拿到),Windows host 訪問需用該 IP 而非 `127.0.0.1`。
- 本 workspace 路徑 `/mnt/d/AnewSpaces/x_Project/fork260509-rev1` 確認為 WSL2 + Windows drive 掛載、Win11(per 2026-05-12 graphify session 紀錄)→ 預期 mirrored mode。

### Verification(implement 階段)

- WSL shell 內:`curl http://127.0.0.1:11080/health` → 200(必通)
- Windows host(PowerShell):`curl http://127.0.0.1:11080/health` → 200 (mirrored mode 必通;NAT mode 會失敗 — 屬 edge case)

### Alternatives considered

- **依賴 WSL hostname 而非 127.0.0.1**:per workspace memory `feedback_no_localhost` user 偏好 127.0.0.1,且 mirrored mode 是現代預設、其他 user 自行調整不在本 feature 範疇。

---

## R-4:Docker compose v2 plugin 最低版本 requirement

### Decision

預期 Docker Compose ≥ v2.0(支援 `-f -f` merge + `--wait` flag + 短字串 ports binding)。Docker Compose v1(`docker-compose` 獨立 binary)行為相同但 EOL — 不主動支援、若 user 用 v1 自行升級。

### Rationale

- `docker compose --wait` 加在 v2.1.0(2021-12)— 本 feature US1.1 / US2.1 用了 `--wait`。
- `-f -f` merge 機制 v1 / v2 都支援、行為一致(append for list)。
- rev1 W-F1 ~ W-F5 均假設 docker compose v2 plugin、無回頭看 v1 必要。

### Verification(implement 階段)

`docker compose version` 顯示 `Docker Compose version v2.x.x`(若 v1 則為 `docker-compose version 1.x.x`、提示升級)。

---

## R-5:`docker compose up --wait` 健康等待行為

### Decision

`docker compose up -d --wait` 等待所有 `healthcheck` 配置的 service 進 `healthy` 狀態(或 dependency 配 `condition: service_completed_successfully` 的 service 完成、如 migration)、預設 timeout 視 compose 實作而定(typically 配 healthcheck `interval × retries`,W-F5 配 10s × 5 ≈ 50s)。

### Rationale

- W-F5 / W-F4 spec 已用 `--wait`,行為一致 — 本 feature 沿用、無新風險。
- 若 60 秒內未全 healthy,`--wait` 回 non-zero exit code、CI 應該失敗 — 對齊 SC-001(60s 內 healthy)。

### Verification(implement 階段)

`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait; echo "exit: $?"` 預期 60-75s 內回 `exit: 0`。

---

## R-6:Port 衝突檢測機制(host 機既有服務占用)

### Decision

**不在 W-F7 範疇做自動偵測**。`docker compose up` 啟動失敗時 docker engine 會回 `bind: address already in use`、user 自行用 `ss -tlnp | grep ':<port>'` 排查並停用占用者或臨時改 dev.yml host port — 屬 edge case E-2、quickstart 文檔列範例命令。

### Rationale

- 自動偵測腳本會擴大 W-F7 範疇(增複雜度、增腳本維護)— 違反 Constitution Principle I「最小變動範圍」。
- `1XXXX` 前綴 port 在預設 dev 機很少衝突(per CLAUDE.md §5.2 設計理由)。

### Verification(implement 階段)

`ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'` 啟動前應**無輸出**;若有則告知 user。

---

## R-7:host 直連 postgres / redis 密碼取得 path

### Decision

User 從 W-F4 既有 `deploy/secrets/<name>.txt` 自行 `cat` 取得密碼。**不**在 dev.yml / quickstart 用 `<paste-password>` placeholder、改用 shell command substitution 示範:`-a "$(cat deploy/secrets/redis_password.txt)"`。

### Rationale

- W-F4 secret files 已 gitignored(`deploy/secrets/*.txt` 在 `.gitignore`)、user 機本機有檔。
- Shell substitution 形式(`$(cat ...)`)讓 quickstart 命令可直接 copy-paste 跑、不用人工複製密碼 — 對齊「dev friendly」原則。

### Verification(implement 階段)

`redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" ping` 預期回 `PONG`(per AC US1.6)。

---

## Open questions(無)

Brainstorm 3 個 Q + self-review OOS-011 已涵蓋所有需要 user 拍板的決策。Research 6 個技術細節點均有明確 decision 與 verification 路徑,無 [NEEDS CLARIFICATION] 留給 user。

**Phase 0 完成、Phase 1 啟動條件滿足**。
