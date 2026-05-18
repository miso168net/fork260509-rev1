# Feature Specification: W-F7 — port-mapping

**Feature ID**: W-F7(per [`DESIGN-W-DEPLOYMENT`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11.1 Phase W-2 P2 — deploy 階段第三個 P2 feature)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `011-port-mapping`)
**Created**: 2026-05-17
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-17 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §6.1(對外 / 容器內 Port 規劃 — dev 4 個 host port 表)、§6.3(dev vs prod host port 暴露差異)、§11.1(W-F7 scope:「對外 port(11080/11443)+ 容器內 port;CLAUDE.md §5.2 配置落地」)、§11.2(W-F7 依賴 W-F3;P2 序 W-F5 → W-F6 → W-F7)、§11.3(Day 1 dev 部署形態包含 W-F7)
- [`CLAUDE.md`](../../CLAUDE.md) §5.2(對外 endpoint 與 port 規劃 — rev1 提議 port 表 + 「目前現況:rev1 提議尚未套用」段落待 W-F7 落地後更新)
- [`docs/INTEGRATION-CHECKLIST.md`](../INTEGRATION-CHECKLIST.md) Current Focus(「dev / WSL 本機驗:直接走 W-F7」建議)、Phase W deploy Roadmap(W-F7 row)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I「最小變動範圍」、Principle II「dev/prod 明確分離」— W-F7 走拆檔 `docker-compose.dev.yml` 模式體現)
- [`specs/008-compose-base-structure/`](../../specs/008-compose-base-structure/)(W-F3 主 compose 結構 — W-F7 不動主檔、僅新增 dev override 拆檔)
- [`specs/010-front-nginx/`](../../specs/010-front-nginx/)(W-F5 front-nginx service — W-F7 對它加 host port `127.0.0.1:11080:80`、不動其他配置)

**Scope summary**:rev1 deploy 階段 Phase W-2 P2 第二個 feature(W-F5 之後)— **新建** `docker-compose.dev.yml` 拆檔、為 dev 場景顯式暴露 4 個 host port。範疇刻意收緊:**只新增 1 個 outer-repo root 檔案**(docker-compose.dev.yml)+ 2 個既有檔案文件更新(CLAUDE.md §5.2、INTEGRATION-CHECKLIST.md)、**不動**主 `docker-compose.yml`(維持 W-F5 結束的 internal-only baseline、prod safe)、**不動** worktree(base-web / rust-api)、**不動** secret / TLS / nginx config。Host port 全綁 `127.0.0.1` loopback、不暴露 LAN。Dev 啟動:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`;Prod 啟動:`docker compose up -d`(不帶 dev 檔)。範疇外:HTTPS `11443`(W-F6 TLS)、自簽 / Let's Encrypt cert(W-F6)、`docker-compose.prod.yml`(後續 deploy hardening)、rate limiting / WAF(後續)、0.0.0.0 binding(不支援、需要時手動編輯本機 dev 檔)、WSL2 networking mode 自動偵測(不做、文檔提示)。

## Clarifications

### Session 2026-05-17(brainstorming 階段拍板、3 項)

- **Q1**: dev 場景要暴露哪些 host port?CLAUDE.md §5.2 與 DESIGN-W §6.1 列了完整 dev 4 port 表、但 INTEGRATION-CHECKLIST Current Focus 建議「給 front-nginx 加 ports: - 11080:80,3-5 行 yaml」最小化版。 → **A: DESIGN-W §6.1 dev 全套 4 ports**(`127.0.0.1:11080:80` front-nginx + `127.0.0.1:11081:11081` rust-api 直連 + `127.0.0.1:15432:5432` postgres + `127.0.0.1:16379:6379` redis;`11443` HTTPS 留 W-F6)。理由:W-F7 既然要落地 DESIGN-W §6.1,一次到位 dev 完整 port mapping,後續 prod 透過 不帶 `-f docker-compose.dev.yml` 的啟動命令自動收緊到 baseline、無 yaml 改動風險;避免後續再開 feature 加 port。代價接受:dev 機若有 port 衝突一次撞 4 個、但每個 port 都用 `1XXXX` 前綴避開 fork260509 既有 port(per CLAUDE.md §5.2 設計理由)。

- **Q2**: Host port binding 要綁 127.0.0.1 還是 0.0.0.0?Docker compose 預設 0.0.0.0(all interfaces)、LAN 其他機可達。 → **A: 127.0.0.1 (loopback only)**。理由:符合 workspace memory 偏好「文件、範例、設定一律寫 127.0.0.1」延伸到 binding;dev 場景只需 host 機本身可達(WSL2 + Windows host)、不需 LAN 其他機;LAN binding 在公共 wifi / 共用網路有風險(W-F4 secrets 雖已對 redis / postgres 加密碼、但 redis-stack 暴露 RedisInsight 端口、postgres 暴露 metadata 仍是攻擊面)。WSL2 兼容:Win11 22H2+ 預設 mirrored networking mode 下 `127.0.0.1` 可從 Windows host 達;NAT 模式則需 wsl IP — spec 邊界檔文檔提示。代價接受:LAN 其他機(手機、同網段同事機)不能訪問 dev 環境,需要時 user 手動把單一 service binding 改 `0.0.0.0` 即可。

- **Q3**: dev/prod 切換機制 — 拆檔(`docker-compose.dev.yml` 手動 -f)vs auto-load override(`docker-compose.override.yml`)vs 直接寫主 compose 配 profile? → **A: docker-compose.dev.yml 拆檔、手動 -f 切換**。理由:Docker compose `override.yml` 預設 auto-load、prod CI 若忘記加 `-f docker-compose.yml` 顯式指定主檔會誤暴露 host port — 安全風險顯著;profile 機制只控制 service 啟動、無法控制單一 service 的 ports 區段(技術上不可行,排除);直接寫主檔簡單但 prod 部署要記得改 yaml 註解或刪除、容易忘。拆檔 + 手動 -f 是最明確的「dev / prod 顯式選擇」紀律:dev 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`、prod 跑 `docker compose up -d`(不帶 dev 檔);主 compose 維持 internal-only baseline、prod safe by default。代價接受:dev 啟動命令長一截(但可以寫進 CLAUDE.md §5.2 / 將來 deploy/README 或 Makefile)。

## User Scenarios & Testing *(mandatory)*

### US-1:Dev 環境啟動 + host 機驗證 stack 對外可達(最主要場景)

**Actor**:rev1 dev / 整合測試者
**Goal**:從 host 機(WSL2 Linux shell 或 Windows host)透過 `127.0.0.1` 訪問 stack 各 service、進行 SPA / API / DB / redis 的 dev 與 debug
**Trigger**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` 在 outer repo root 執行
**Steps**:
1. operator 在 outer repo root(`/mnt/d/AnewSpaces/x_Project/fork260509-rev1`)cd 過去
2. 確認 `deploy/secrets/*.txt` 已就位(W-F4 既存要求)
3. 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
4. 等 6 service 全 `healthy`(`docker compose ps` 或 `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps` 都可)
5. host 機 `curl -fsS http://127.0.0.1:11080/health` 預期回 200 + body 包含 `ok`(front-nginx self health)
6. host 機 `curl -fsS http://127.0.0.1:11080/api/auth/login -X POST -d '{"identifier":"Soybean","password":"123456"}' -H 'Content-Type: application/json'` 預期回 200 + JWT token(走 front-nginx /api/ 反向代理到 rust-api,W-F5 已驗 routing、W-F7 只開對外 port)
7. host 機 `curl -fsS http://127.0.0.1:11081/health` 預期回 200(rust-api 直連跳過 nginx)
8. host 機 `pg_isready -h 127.0.0.1 -p 15432`(或 psql)預期成功(W-F4 password 在 `deploy/secrets/postgres_password.txt`)
9. host 機 `redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" ping` 預期回 `PONG`
10. host 瀏覽器訪問 `http://127.0.0.1:11080` 預期載入 SPA、能 login Soybean/123456 進入 dashboard(整合驗證、等同 W-F5 + W-F7 e2e)

**Acceptance**:步驟 5-10 全成功。

### US-2:Prod baseline 啟動 — 確認不誤暴露 host port

**Actor**:rev1 prod 部署者 / CI/CD pipeline(將來 W-F18)
**Goal**:用 prod 啟動命令 `docker compose up -d` 起 stack 時,確認**沒有任何 host port 暴露**(internal-only baseline、符合 DESIGN-W §6.3 prod 規範)
**Trigger**:`docker compose up -d` 在 outer repo root 執行(不帶 `-f docker-compose.dev.yml`)
**Steps**:
1. operator 在 outer repo root 跑 `docker compose up -d`(乾淨啟動,先 `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans` 清掉 dev 殘留)
2. 等 6 service 全 `healthy`(同 US-1)
3. host 機 `ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'` 預期**無任何輸出**(無 listener)
4. host 機 `curl -fsS http://127.0.0.1:11080/health --max-time 5` 預期 `Connection refused`(prod baseline 不暴露)
5. 從 container 內驗 stack 仍 work:`docker compose exec front-nginx wget -qO- http://localhost/health` 預期回 `ok`(stack 內部仍正常)

**Acceptance**:步驟 3 無輸出、步驟 4 connection refused、步驟 5 ok。

### US-3:Binding 限 loopback 驗證 — host port 不暴露到 LAN

**Actor**:dev / 安全驗證者
**Goal**:確認 W-F7 暴露的 4 個 dev port 都綁 127.0.0.1、不會被 LAN 其他機訪問
**Trigger**:dev 環境(US-1 已起好)後執行驗證
**Steps**:
1. host 機 `ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'` 預期 4 行、每行 Local Address 都是 `127.0.0.1:<port>`(**非** `0.0.0.0:<port>` 或 `*:<port>` 或 `[::]:<port>`)
2.(可選)若有 LAN 第二台機在同網段、host 機 IP 為 `192.168.x.y`:第二台機 `curl http://192.168.x.y:11080/health --max-time 3` 預期 timeout / connection refused

**Acceptance**:步驟 1 全 4 行都 `127.0.0.1:<port>`、步驟 2 不可達。

### Edge Cases

| # | 情境 | 對策 / 文檔提示 |
|---|---|---|
| E-1 | WSL2 NAT 模式(舊版 / 未設 mirrored)下 Windows host `127.0.0.1` 不通 | spec 邊界檔提示:`.wslconfig` 設 `networkingMode=mirrored`(Win11 22H2+ 預設);否則改 `wsl hostname -I` 拿 WSL IP 訪問 |
| E-2 | host 機既有服務占用 `11080` / `11081` / `15432` / `16379` 其一 | `docker compose up` 啟動失敗回 `bind: address already in use`;排查:`ss -tlnp \| grep ':<port>'`;解決:停用占用者或臨時改 dev 檔對應 host port(`127.0.0.1:11080` → `127.0.0.1:11090`,只動 host 側、container 側不動) |
| E-3 | host 直連 postgres / redis 需要密碼但 secret file 路徑 | W-F4 secrets 在 `deploy/secrets/<name>.txt`,host operator `cat deploy/secrets/postgres_password.txt` 即可取得;spec 文檔在 US-1 步驟 8/9 直接示範 |
| E-4 | dev override 檔不慎被 prod CI 拉進啟動命令 | docker-compose.dev.yml tracked(別人 clone 可重現 dev)但 prod 啟動命令明確不帶 `-f docker-compose.dev.yml`;CI/CD pipeline(W-F18)文檔須明寫;短期內無 CI 機制故主要靠紀律 |
| E-5 | dev 啟動命令過長、operator 容易忘 -f flag | spec 在 CLAUDE.md §5.2 文檔化「dev 啟動範例」段落;將來 W-F17 / W-F18 可加 Makefile target(留後續、不在 W-F7 範疇) |
| E-6 | postgres 15432 / redis 16379 與 fork260509 並存衝突 | per CLAUDE.md §5.2「rev1 提議 port」設計理由 — `1XXXX` 前綴避開 fork260509 預設(8080 / 10001 / 5432 等);本 spec 不額外處理、若衝突則 fork260509 stack 應自行避讓或停掉 |

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: outer repo root **新增** `docker-compose.dev.yml` 1 個檔、tracked。
- **FR-002**: docker-compose.dev.yml **新增 4 個 service 的 ports 區塊** — front-nginx(`127.0.0.1:11080:80`)、rust-api(`127.0.0.1:11081:11081`)、postgres(`127.0.0.1:15432:5432`)、redis(`127.0.0.1:16379:6379`)。
- **FR-003**: docker-compose.dev.yml **不重複定義主 compose 的 service body**,只用 docker compose merge 模式(同 service name + 只列 ports 區塊;compose 自動 deep-merge)。
- **FR-004**: **不動** outer repo root 的主 `docker-compose.yml`(維持 W-F5 結束時的 internal-only 狀態)。
- **FR-005**: 所有 host port binding 必須 **限 `127.0.0.1`**(不可 `0.0.0.0` / `*` / `[::]`)。
- **FR-006**: dev 啟動命令 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` 後 6 service(postgres / redis / migration / rust-api / base-web / front-nginx)全 `healthy`(等同 W-F5 baseline)、且 4 個 host port 在 host 機可達。
- **FR-007**: prod baseline 啟動 `docker compose up -d`(不帶 dev 檔)後,4 個 host port **無任何 listener**、stack 仍 internal-only 工作正常。
- **FR-008**: CLAUDE.md §5.2 文件更新 — 「目前現況」段落改為「W-F7 落地、dev 環境 4 port 已暴露(127.0.0.1)、prod 維持 internal-only」;追加「dev 啟動命令範例」段落示範 `-f -f` 雙檔啟動 + 4 個 curl/psql/redis-cli 驗證命令。
- **FR-009**: docs/INTEGRATION-CHECKLIST.md 文件更新 — W-F7 row 從待辦改 ✅ 完成、Current Focus 段落改下一步為 W-F6 / W-F11(任一)、Phase W deploy P2 進度從 1/4 改 2/4。
- **FR-010**: spec 必須在 `Out of scope` 段明列以下範疇**不包含**:HTTPS `:11443` port、TLS cert(自簽 / acme)、`docker-compose.prod.yml`、rate limiting / WAF、`0.0.0.0` LAN binding 模式、WSL2 networking mode 自動偵測、Makefile target 化、CI/CD pipeline 改動。

### Non-Functional Requirements

- **NFR-001**: docker-compose.dev.yml YAML 大小不超過 30 行(預估 ~25 行含註解)— 體現「最小變動範圍」紀律。
- **NFR-002**: 啟動延遲與 W-F5 baseline 比較不增 5%(host port forward 是 docker bridge 額外一層、但 dev 容忍開銷)。
- **NFR-003**: spec 主 markdown 檔(docs/superpowers/011-feature-port-mapping.md)字數預估 4000-6000 字(W-F1/W-F2 量級,W-F3/W-F4/W-F5 因 source authoritative 較短;W-F7 重新進 brainstorming 故與 W-F1/W-F2 同量級)。
- **NFR-004**: spec 須對 WSL2 兼容性、port 衝突、prod CI 誤暴露 3 個風險點都有對策或紀律建議(對應 Edge Cases E-1 / E-2 / E-4)。

### Out of Scope(per Q1/Q2/Q3 + DESIGN-W 邊界 + 風險控制)

- **OOS-001**: HTTPS `127.0.0.1:11443:443` port 暴露 — 屬 W-F6 TLS feature。
- **OOS-002**: TLS cert 管理(自簽 mkcert / Let's Encrypt acme.sh container)— 屬 W-F6。
- **OOS-003**: `docker-compose.prod.yml` 顯式 prod 拆檔 — 主 compose 即 prod baseline、暫不需 prod 拆檔;若將來要加 prod-specific 配置(如 replicas / resource limits / logging driver)再開後續 feature。
- **OOS-004**: nginx-level rate limiting / WAF — 屬將來 prod hardening feature(暫未排序)。
- **OOS-005**: `0.0.0.0` LAN binding 模式 — 不支援、需要時 user 手動編輯本機 dev 檔(spec 文檔不阻止、但不提供官方支援路徑)。
- **OOS-006**: WSL2 networking mode 自動偵測 / 切換腳本 — 不做,spec 邊界檔文檔提示 mirrored mode 即可。
- **OOS-007**: Makefile / justfile / task runner target 化(`make dev` / `just up`)— 留 W-F17 或 deploy/README 後續 feature。
- **OOS-008**: CI/CD pipeline 改動 — 屬 W-F17 / W-F18。
- **OOS-009**: worktree(base-web / rust-api)source code 改動 — W-F7 純 outer repo 變動、不動 worktree。
- **OOS-010**: secret / W-F4 機制改動 — W-F7 不增不減 secret;host 直連 DB / redis 用既有 secret 取得密碼。
- **OOS-011**: **prod 對外 host port 暴露**(主 docker-compose.yml 加 front-nginx `11080:80` / `11443:443`)— 屬 W-F6 TLS feature 範疇(W-F6 brainstorm 時拍板 prod 主 compose port + cert + redirect 一起做);W-F7 完成後 prod baseline 仍 internal-only、prod 部署在 W-F6 完成前不可達(可接受、prod 部署本就在 W-F6 之後)。

---

## Key Entities *(mandatory)*

### E-1:docker-compose.dev.yml(新建檔、outer repo root tracked)

**Purpose**:Docker compose merge override 檔、為 dev 場景顯式暴露 4 個 host port,僅 dev 啟動命令 `-f -f` 顯式指定時生效。

**Schema**(預估結構,brainstorm 拍板):
```yaml
# docker-compose.dev.yml — W-F7 dev 用 host port forward(per docs/superpowers/011-feature-port-mapping.md)
# 用法:docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# 不寫進主 docker-compose.yml(避免 prod 誤暴露);僅 dev / debug 場景使用
# 4 個 port 全綁 127.0.0.1(loopback only、不暴露 LAN)
# 11443 HTTPS 留 W-F6 TLS feature

services:
  front-nginx:
    ports:
      - "127.0.0.1:11080:80"          # SPA + /api/ 反向代理對外入口

  rust-api:
    ports:
      - "127.0.0.1:11081:11081"       # rust-api 直連(跳過 nginx debug)

  postgres:
    ports:
      - "127.0.0.1:15432:5432"        # psql / DBeaver 直連

  redis:
    ports:
      - "127.0.0.1:16379:6379"        # redis-cli / RedisInsight 直連
```

**Lifecycle**:
- W-F7 spec-kit `/speckit-implement` 階段建立、tracked、commit 到 outer repo
- 永遠不在主 `docker compose up -d` 命令載入(prod safe by default)
- 別人 clone outer repo 後可直接 dev 啟動、無需額外設定
- 將來若需 LAN 暴露,user 個人本機編輯改 `127.0.0.1` 為 `0.0.0.0`(本檔仍 tracked、改動算 dirty;不鼓勵)

### E-2:CLAUDE.md §5.2 「目前現況」段落 + 「dev 啟動命令」段落(既有檔、文件更新)

**Purpose**:讓 session 開頭 SOP hook 注入 CLAUDE.md 時、Claude / operator 立即看到 W-F7 已落地、dev 啟動命令範例就在手邊。

**改動範圍**:
- 「目前現況」段落:從「rev1 提議尚未套用」改為「W-F7 落地、dev 4 port 已暴露(127.0.0.1)、prod 維持 internal-only」
- 新增「dev 啟動命令範例」段落:列 2 行 docker compose 啟動命令(dev / prod 對照)+ 4 個 host 驗證命令(curl front-nginx / curl rust-api / pg_isready / redis-cli)

### E-3:docs/INTEGRATION-CHECKLIST.md(既有檔、文件更新)

**Purpose**:跨 feature 進度追蹤、SOP hook 自動注入第一輪 context。

**改動範圍**:
- 已完成里程碑段加 W-F7 ✅ 條目
- Phase W deploy Roadmap 表 W-F7 row 改 ✅ 完成
- Current Focus 段落改下一步為 W-F6 / W-F11(任一)、P2 進度從 1/4 改 2/4

---

## Implementation Hints *(non-binding, for /speckit-plan)*

### 步驟順序(預估、待 /speckit-plan 確認)

1. 新增 `docker-compose.dev.yml`(主要改動)
2. `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` 驗 yaml 解析 + merge 正確
3. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 起 stack
4. 跑 US-1 acceptance(curl + pg_isready + redis-cli + 瀏覽器 login)
5. `docker compose -f docker-compose.yml -f docker-compose.dev.yml down` + `docker compose up -d --wait` 驗 prod baseline
6. 跑 US-2 acceptance(ss + curl refused)
7. 跑 US-3 acceptance(loopback binding verification)
8. 改 CLAUDE.md §5.2 + INTEGRATION-CHECKLIST.md
9. **單段 commit**(只動 outer、不動 worktree)— `feat(deploy): W-F7 dev host port forward(docker-compose.dev.yml + CLAUDE/checklist 更新)`

### 風險點 / 已知限制

- WSL2 networking mode 必須 mirrored(Win11 22H2+ 預設)— spec 邊界檔在 E-1 提示;若 user 環境 NAT,acceptance 步驟 5-10 從 Windows host 不通,但從 WSL2 內 shell 訪問仍通(可驗 dev 功能)
- 主 compose 不動是核心紀律 — 若 implement 階段發現需要動主 compose(例如 service name 對齊),須 escalate brainstorm 重審
- `docker compose` v2 plugin 的 merge 行為:同 service 同 key(`ports`)是 replace、不是 append — W-F5 既有 front-nginx 在主 compose 沒 `ports` 區塊,故 dev 檔加 `ports` 是純新增不衝突(已 grep 確認)

---

## Dependencies *(mandatory)*

### Inbound(本 feature 依賴)

- **W-F3** `compose-base-structure`:主 docker-compose.yml 存在、6 service 結構穩定。✅(已完成、outer `04671d0`)
- **W-F5** `front-nginx`:front-nginx service 存在、`:80` 為 SPA / API gateway 入口。✅(已完成、outer `dff14c2`)
- **W-F4** `secret-injection`:postgres / redis password secrets 已落地(host 直連需要密碼)。✅(已完成、outer `ab658d7`)

### Outbound(本 feature 解鎖)

- **dev / WSL 本機驗** — 整個 stack 從 host 機可達、SPA + API + DB / redis debug 工作流解鎖。
- **W-F6** `tls-cert-management`:可平行進行(W-F6 暴露 11443、W-F7 已暴露 11080 / 11081 / 15432 / 16379,兩者不衝突)、但 W-F6 對 prod 而言應在 W-F7 之前完成(避免明文期窗口);dev 場景 W-F7 先行可接受。
- **W-F11** `rust-horizontal-scaling`:獨立、可平行。
- **W-F17** `cicd-build-pipeline` / **W-F18** `cicd-deploy-pipeline`:文檔需明寫 prod 啟動命令不帶 dev 檔。

---

## Acceptance Criteria *(mandatory、per US-1 / US-2 / US-3 整理)*

| # | Acceptance | 驗證命令 | 預期結果 |
|---|---|---|---|
| AC-1 | dev compose 起 stack 全 healthy | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`(或 up 後 `docker compose ps`) | 6 service 全 `healthy`(postgres / redis / migration `exited (0)` / rust-api / base-web / front-nginx)|
| AC-2 | front-nginx 11080 對外可達 | `curl -fsS http://127.0.0.1:11080/health` | HTTP 200 + body `ok` |
| AC-3 | rust-api 11081 直連可達 | `curl -fsS http://127.0.0.1:11081/health` | HTTP 200 |
| AC-4 | postgres 15432 可連 | `pg_isready -h 127.0.0.1 -p 15432` | exit code 0 |
| AC-5 | redis 16379 可連 | `redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" ping` | `PONG` |
| AC-6 | prod baseline 不暴露 | `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v && docker compose up -d --wait`、`ss -tlnp 2>/dev/null \| grep -E ':(11080\|11081\|15432\|16379)\b'` | 無輸出 |
| AC-7 | binding 限 loopback | `ss -tlnp 2>/dev/null \| grep -E ':(11080\|11081\|15432\|16379)\b'`(dev mode) | 4 行、每行 Local Address `127.0.0.1:<port>`(非 0.0.0.0 / * / [::])|
| AC-8 | SPA → API e2e | host 瀏覽器 `http://127.0.0.1:11080` → login `Soybean / 123456` | 進入 dashboard、看到 menu |
| AC-9 | CLAUDE.md §5.2 已更新 | `grep -A 5 "目前現況" CLAUDE.md`(或人工檢視) | 包含「W-F7 落地」/「dev 4 port 已暴露」字眼 |
| AC-10 | INTEGRATION-CHECKLIST.md 已更新 | `grep -E "W-F7.*✅" docs/INTEGRATION-CHECKLIST.md` | 至少 1 match |

---

## Decisions Log

| 決策 | 拍板於 | Source |
|---|---|---|
| Port 範疇:DESIGN-W §6.1 dev 全套 4 ports | 2026-05-17 brainstorm Q1 | DESIGN-W §6.1 + CLAUDE.md §5.2 |
| Host binding:127.0.0.1 loopback only | 2026-05-17 brainstorm Q2 | workspace memory feedback_no_localhost + 安全考量 |
| dev/prod 切換:`docker-compose.dev.yml` 拆檔 + 手動 -f | 2026-05-17 brainstorm Q3 | prod safe by default 紀律 |
| 11443 HTTPS port 不在範疇 | 自然推論 | DESIGN-W §11.1 W-F6 範疇 |
| 主 compose 不動(prod 對外暴露留 W-F6)| Self-review 補強 | W-F7 範疇純 dev 拆檔;prod 11080 / 11443 由 W-F6 一起做 |
| 主 compose 不動 | 自然推論 | Constitution Principle I 最小變動 + prod safe baseline |

---

## Open Questions(留 /speckit-plan 階段解)

- **OQ-1**: dev 啟動命令是否提供 alias / function 寫進 deploy/README?或留 user 自行寫 shell alias?(brainstorm Q3 提到留 W-F17 / Makefile feature、本 spec 暫不處理)
- **OQ-2**: WSL2 networking mode 是否要在 spec 文檔加「mirrored 設定步驟」?還是只提示讓 user 自己查?(brainstorm 偏向只提示)
- **OQ-3**: AC-8 e2e 瀏覽器 login 是否要自動化(playwright / cypress)?(本 spec 不要求、人工驗即可、留將來 e2e suite feature)

---

**Brainstorm session 結束、產出 spec 草稿**。下一步:`/speckit-specify` 將本檔轉為 `specs/011-port-mapping/spec.md` 正式 feature spec、自動處理 feature branch(`011-port-mapping`)+ spec 模板對齊。
