# Phase 1 Data Model: W-F7 port-mapping

**Feature**: W-F7 — port-mapping(dev host port forward)
**Date**: 2026-05-17

> 本 feature 為 **deploy 層配置 feature**、無資料庫 entity / 無 ORM model。本檔以「**配置 entity**」形式描述本 feature 觸及的 3 個檔案 + 各檔內邏輯 entity(struct / sub-section)。

---

## E-1:`docker-compose.dev.yml`(★ 新建檔)

**Type**:Docker Compose YAML v2 override 檔
**Location**:outer repo root(`./docker-compose.dev.yml`)
**Git status**:tracked
**File size 目標**:≤ 30 行(per NFR-001)

### Top-level Schema

| Key | Type | Required | Value | Note |
|---|---|---|---|---|
| `services` | map | yes | 4 entries | front-nginx / rust-api / postgres / redis |
| (其他 top-level)| — | no | omit | 不寫 `name` / `networks` / `volumes` / `secrets` / `version`(用主 compose 即可) |

### Services 4 entry sub-schema

每個 service entry 結構**極簡**:只列 service name + 1 個 `ports` 區塊、不寫其他欄位(其他欄位由主 compose 提供)。

#### `services.front-nginx`

```yaml
services:
  front-nginx:
    ports:
      - "127.0.0.1:11080:80"
```

| Field | Value | Source / 對齊 |
|---|---|---|
| service name | `front-nginx` | 對齊 W-F5 主 compose service name |
| host_ip | `127.0.0.1` | per FR-004 / Q2 / R-2 |
| host_port | `11080` | per CLAUDE.md §5.2 / DESIGN-W §6.1 |
| container_port | `80` | 對齊 W-F5 front-nginx listen 80 |
| 註解 | `# SPA + /api/ 反向代理對外入口` | 1 行行末註解 |

#### `services.rust-api`

```yaml
services:
  rust-api:
    ports:
      - "127.0.0.1:11081:11081"
```

| Field | Value | Source / 對齊 |
|---|---|---|
| service name | `rust-api` | 對齊主 compose |
| host_ip | `127.0.0.1` | per FR-004 |
| host_port | `11081` | per CLAUDE.md §5.2 |
| container_port | `11081` | 對齊 W-F1 rust-api `APP_SERVER_PORT=11081` |
| 註解 | `# rust-api 直連(跳過 nginx debug)` | 1 行行末註解 |

#### `services.postgres`

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:15432:5432"
```

| Field | Value | Source / 對齊 |
|---|---|---|
| service name | `postgres` | 對齊主 compose |
| host_ip | `127.0.0.1` | per FR-004 |
| host_port | `15432` | per CLAUDE.md §5.2(避開 fork260509 預設 5432) |
| container_port | `5432` | 對齊 postgres image 預設 |
| 註解 | `# psql / DBeaver 直連` | 1 行行末註解 |

#### `services.redis`

```yaml
services:
  redis:
    ports:
      - "127.0.0.1:16379:6379"
```

| Field | Value | Source / 對齊 |
|---|---|---|
| service name | `redis` | 對齊主 compose |
| host_ip | `127.0.0.1` | per FR-004 |
| host_port | `16379` | per CLAUDE.md §5.2(避開 fork260509 預設 6379) |
| container_port | `6379` | 對齊 redis-stack image 預設 |
| 註解 | `# redis-cli / RedisInsight 直連` | 1 行行末註解 |

### Top-level 註解區塊(預期 5-6 行)

```yaml
# docker-compose.dev.yml — W-F7 dev 用 host port forward(per specs/011-port-mapping/)
# 用法:docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
# 不寫進主 docker-compose.yml(避免 prod 誤暴露);僅 dev / debug 場景使用
# 4 個 port 全綁 127.0.0.1(loopback only、不暴露 LAN)
# 11443 HTTPS 留 W-F6 TLS feature;0.0.0.0 LAN binding 不支援
```

### Entity 行為

| 行為 | 描述 |
|---|---|
| 載入時機 | 僅 `docker compose -f docker-compose.yml -f docker-compose.dev.yml ...` 顯式 -f 指定時 |
| Merge 行為 | per R-1:`ports` list append 進主 compose(主 compose 無既有 ports → 純新增) |
| 生效範圍 | 4 個 service 各加 1 條 host port forward;其他 service(base-web / migration)不受影響 |
| Lifecycle | tracked、無 secret / state — `docker compose down` 不破壞、`docker compose up` 帶 -f 即生效 |

---

## E-2:`CLAUDE.md` §5.2(既有檔、更新範圍)

**Type**:Markdown 文件 section
**Location**:`./CLAUDE.md` 第 5.2 節
**Git status**:tracked、既有
**Lines affected**:預估改動 ~30 行(原段保留結構、改文字 + 新增子節)

### 既有結構(W-F5 結束時)

```markdown
### 5.2 對外 endpoint 與 port 規劃(rev1 提議,待 INTEGRATION-PLAN 確認)

> 以下 port 編排為 rev1 提議值(刻意避開 fork260509 既有 port,方便兩個 workspace 並存)...

| 角色 | 參考專案 fork260509(既有)| rev1 提議 |
|...|...|...|

**目前現況**(rev1 提議尚未套用):
- `rust-api/server/resources/application.yaml` 仍是 fork260509 預設:...
- 直連 rust-api(dev 場景,未經 reverse proxy):`POST http://127.0.0.1:10001/api/auth/login` body ...
- 套用 rev1 port 規劃前須先建 `deploy/`、改 `application.yaml` 與 compose 配置
```

### 改動 1:「目前現況」段落改寫

**Before**(W-F5 結束時):
```markdown
**目前現況**(rev1 提議尚未套用):
- ...3 條 outdated 描述
```

**After**(W-F7 落地):
```markdown
**目前現況**(W-F7 落地、dev 4 port 已暴露、prod 維持 internal-only):
- **dev 啟動**:走 `docker-compose.dev.yml` 拆檔 + `-f -f` 啟動(範例見下節 5.2.1)
- **dev 4 port 全綁 `127.0.0.1`**:11080 front-nginx HTTP / 11081 rust-api 直連 / 15432 postgres / 16379 redis(均 loopback only、不暴露 LAN)
- **prod baseline**(`docker compose up -d` 不帶 dev 檔)維持 internal-only、無 host port — 對外 11080 / 11443 暴露屬 W-F6 TLS feature 範疇
```

### 改動 2:新增 §5.2.1「dev 啟動命令範例」子節

```markdown
### 5.2.1 dev 啟動命令範例(W-F7 落地後)

```bash
# === dev 啟動(暴露 4 個 host port、限 127.0.0.1)===
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# === host 機驗證(WSL2 內 shell 或 Win11 mirrored networking 下從 Windows host)===
curl -fsS http://127.0.0.1:11080/health                              # front-nginx self
curl -fsS http://127.0.0.1:11081/health                              # rust-api 直連
pg_isready -h 127.0.0.1 -p 15432                                    # postgres
redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" ping  # redis

# === prod baseline 啟動(無 host port)===
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose up -d --wait
```

> WSL2 NAT mode 不可用 `127.0.0.1` — 設 `.wslconfig` `[wsl2] networkingMode=mirrored`(Win11 22H2+ 預設)、或用 `wsl hostname -I` 拿 WSL IP。
\`\`\`

### Entity 行為

| 行為 | 描述 |
|---|---|
| 載入時機 | session hook(`.claude/hook-git-submodule-SOP.sh`)注入 + Claude session 開頭 |
| 影響 | 本檔內容直接餵 Claude / operator 視覺、改動須立即看得到差 |
| 驗證 | `grep "W-F7 落地" CLAUDE.md` 有命中 / `grep "dev 啟動命令範例" CLAUDE.md` 有命中 |

---

## E-3:`docs/INTEGRATION-CHECKLIST.md`(既有檔、更新範圍)

**Type**:Markdown 進度追蹤文件
**Location**:`./docs/INTEGRATION-CHECKLIST.md`
**Git status**:tracked、既有
**Lines affected**:預估改動 ~15 行

### 改動範圍

#### 改動 1:「Current Focus」段更新

**Before**(W-F5 結束):
```markdown
**Phase**:W deploy(per DESIGN-W §11)— **W-2 P2:1/4 ✅(W-F5 完成)、剩 W-F6 / W-F7 / W-F11**
**Active feature**:無(W-F5 全完成、**Phase W P2 第一個 feature 達成**)
**下一步**:Phase W P2 剩餘 — W-F6 / W-F7 / W-F11;依 §11.2 P2 任一可平行 spec-kit
```

**After**(W-F7 落地):
```markdown
**Phase**:W deploy(per DESIGN-W §11)— **W-2 P2:2/4 ✅(W-F5 + W-F7 完成)、剩 W-F6 / W-F11**
**Active feature**:無(W-F7 全完成、dev 環境對外可達)
**下一步**:W-F6(prod TLS + 對外 port 暴露)/ W-F11(observability);W-F6 是 prod 對外 prerequisite、W-F11 純監控可平行
```

#### 改動 2:Phase W deploy Roadmap 表 W-F7 row

**Before**(W-F5 結束):
```markdown
| W-F7 | `port-mapping` | 對外 port(11080/11443)+ 容器內 port;CLAUDE.md §5.2 配置落地 | W-F3 | 共用 |
```

**After**(W-F7 落地):
```markdown
| W-F7 | `port-mapping` | — | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;dev 4 port 已落地、prod baseline 仍 internal-only)|
```

(對齊 W-F5 row 的 ✅ 完成樣式;DESIGN-W §6.1 為 authoritative source、無 brainstorm 階段?— **W-F7 走完整 brainstorm 階段**、與 W-F5 不同 — 故 row 第一個 ✅ 應顯示為 brainstorm 完成,需確認。)

> **Note for implement**:確認 W-F7 row 是否寫成「**brainstorm ✅** | spec ✅ | plan ✅ | tasks ✅ | impl ✅ | **完成**」(走完整 5 段流程)。

#### 改動 3:已完成里程碑段加 W-F7 條目

```markdown
- [x] **W-F7 port-mapping** ✅(2026-05-17 完成;outer `<sha>` + merge `<sha>`;spec `specs/011-port-mapping/`;Phase W deploy **P2 第二個 feature**(2/4)— 新增 `docker-compose.dev.yml` 拆檔 + 4 個 host port forward(全綁 127.0.0.1)+ CLAUDE.md §5.2 / INTEGRATION-CHECKLIST.md 文件更新;主 docker-compose.yml 不動(prod safe baseline);dev `docker compose -f -f up`、prod `docker compose up` 顯式切換;**單段 commit**(只動 outer);acceptance 13/13 scenario PASS;dev/WSL 本機驗工作流解鎖 — 解鎖 W-F6 / W-F11 後續 P2)
```

### Entity 行為

| 行為 | 描述 |
|---|---|
| 載入時機 | session hook(`.claude/hook-git-submodule-SOP.sh`)注入第一輪 context、SPECKIT marker 不在此檔 |
| 用途 | 跨 feature 進度追蹤、brainstorming 決策快照、跨 feature 待驗證項 |
| 驗證 | `grep -E "W-F7.*✅" docs/INTEGRATION-CHECKLIST.md` 至少 2 match(row + 里程碑) |

---

## 跨 entity 關係

```
E-1 docker-compose.dev.yml ──merge with──> docker-compose.yml(W-F5 baseline,不動)
                                                │
                                                └─> 啟用 4 個 service 的 host port forward
                                                       │
                                                       └─> E-2 CLAUDE.md §5.2「dev 啟動命令範例」就近文檔化
                                                              │
                                                              └─> E-3 INTEGRATION-CHECKLIST.md 進度追蹤同步
```

3 個 entity **強耦合**:E-1 是技術實作核心、E-2 是 user-facing 操作指南、E-3 是進度追蹤透明度。implement 階段 3 個檔案在**同一 commit** 中更新(per FR-011 單段 commit + Constitution「兩段式 commit 紀律」)。

---

## State / Lifecycle(N/A)

本 feature 無 stateful entity — `docker-compose.dev.yml` 為純配置檔、`CLAUDE.md` / `INTEGRATION-CHECKLIST.md` 為純文件。無 state 遷移、無 lifecycle。

---

**Phase 1 data-model 完成、contracts 與 quickstart 啟動條件滿足**。
