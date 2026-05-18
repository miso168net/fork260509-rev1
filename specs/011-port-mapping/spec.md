# Feature Specification: W-F7 — port-mapping(dev host port forward)

**Feature Branch**: `011-port-mapping`
**Created**: 2026-05-17
**Status**: Draft
**Input**: User description: "W-F7 port-mapping — dev docker-compose.dev.yml + 4 host port forward + CLAUDE.md/INTEGRATION-CHECKLIST 文件更新"

**Source**: [`docs/superpowers/011-feature-port-mapping.md`](../../docs/superpowers/011-feature-port-mapping.md)(brainstorming 2026-05-17 session 完成、3 個 Q 拍板 + 1 處 self-review 補強)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../../docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md) §6.1(對外 / 容器內 Port 規劃 — dev 4 個 host port 表)、§6.3(dev vs prod host port 暴露差異)、§11.1(W-F7 scope 描述)、§11.2(P2 依賴序、W-F7 依賴 W-F3)、§11.3(Day 1 dev 部署形態含 W-F7)
- [`CLAUDE.md`](../../CLAUDE.md) §5.2(對外 endpoint 與 port 規劃 — rev1 提議 port 表 + 「目前現況:rev1 提議尚未套用」段落待 W-F7 落地後更新)
- [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) Current Focus(「dev / WSL 本機驗:直接走 W-F7」建議)、Phase W deploy Roadmap(W-F7 row)
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle I 最小變動;dev/prod 明確分離由本 feature 拆檔機制體現)
- [`specs/008-compose-base-structure/`](../008-compose-base-structure/)(W-F3 主 compose 結構 — W-F7 不動主檔、僅新增 dev override 拆檔)
- [`specs/010-front-nginx/`](../010-front-nginx/)(W-F5 front-nginx service — W-F7 對它加 host port `127.0.0.1:11080:80`、不動其他配置)
- [`docker-compose.yml`](../../docker-compose.yml)(W-F5 結束狀態、internal-only baseline — W-F7 嚴格不動本檔)

**Scope summary**:rev1 deploy Phase W **P2 第二個 feature**(W-F5 之後、per DESIGN-W §11.2)— **新增** outer repo root 檔案 `docker-compose.dev.yml` 1 個拆檔、為 dev 場景顯式暴露 4 個 host port(`127.0.0.1:11080:80` front-nginx + `127.0.0.1:11081:11081` rust-api 直連 + `127.0.0.1:15432:5432` postgres + `127.0.0.1:16379:6379` redis)、全綁 `127.0.0.1` loopback、不暴露 LAN。**主 `docker-compose.yml` 不動**(維持 W-F5 結束的 internal-only baseline、prod safe by default)。dev 啟動:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`;prod baseline 啟動:`docker compose up -d`(不帶 dev 檔)。同步更新 [`CLAUDE.md`](../../CLAUDE.md) §5.2「目前現況」段 + 新增「dev 啟動命令範例」段、更新 [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) W-F7 row ✅ + Current Focus 進度。**範疇外**:HTTPS `:11443` port(W-F6 TLS)、TLS cert 管理(W-F6)、prod 主 compose 對外暴露(歸 W-F6)、`docker-compose.prod.yml`(後續 deploy hardening)、rate limiting / WAF、`0.0.0.0` LAN binding 模式、WSL2 networking mode 自動偵測、Makefile / task runner、CI/CD pipeline 改動、worktree(base-web / rust-api)source code 改動、secret 機制改動。**單段 commit**(只動 outer、不動 worktree)。

## Clarifications

### Session 2026-05-17(brainstorming 階段拍板、3 項)

- **Q1**: Port 範疇 — DESIGN-W §6.1 dev 全套 4 ports vs INTEGRATION-CHECKLIST 建議最小化(只 front-nginx 11080) → **A: DESIGN-W §6.1 dev 全套 4 ports**(11080 + 11081 + 15432 + 16379;11443 留 W-F6)。理由:一次到位 DESIGN-W §6.1 設計、避免後續再開 feature 補 port;`1XXXX` 前綴避開 fork260509 既有 port 設計理由保持。
- **Q2**: Host binding — `127.0.0.1` loopback vs `0.0.0.0` LAN → **A: 127.0.0.1 (loopback only)**。理由:符合 workspace memory 偏好「文件、範例、設定一律寫 127.0.0.1」延伸 binding 範疇;dev 只需 host 機本身可達、不需 LAN;LAN binding 公共 wifi 有風險。WSL2 兼容:Win11 22H2+ mirrored networking 預設下從 Windows host 可達。
- **Q3**: dev/prod 切換機制 — `docker-compose.dev.yml` 拆檔手動 -f vs `docker-compose.override.yml` auto-load vs compose profile → **A: docker-compose.dev.yml 拆檔、手動 -f**。理由:`override.yml` auto-load 在 prod CI 不加 `-f` 顯式主檔時誤暴露風險顯著;profile 機制無法控制單一 service 的 ports 區段(技術上不可行);拆檔 + 手動 -f 是「dev / prod 顯式選擇」最明確紀律,主 compose 為 prod safe baseline by default。

### Self-review 補強(brainstorm self-review 2026-05-17)

- **OOS-011 補強**:「prod 對外 host port 暴露」(主 docker-compose.yml 加 front-nginx `11080:80` / `11443:443`)明確屬 **W-F6 TLS feature 範疇**(W-F6 brainstorm 時拍板 prod 主 compose port + cert + redirect 一起做)。W-F7 完成後 prod baseline 仍 internal-only、prod 部署在 W-F6 完成前不可達 — 可接受、prod 部署本就在 W-F6 之後。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dev 環境啟動 + host 機驗證 stack 對外可達(Priority: P1)🎯 MVP

dev / 整合測試者在 outer repo root 跑 dev 啟動命令、stack 6 service 全 healthy、從 host 機透過 `127.0.0.1` 可訪問 SPA / API / DB / redis,進行 dev 與 debug。

**Why this priority**:

W-F7 的核心價值是「對外可達」— stack 在 W-F5 結束時內部 routing 全通但 host 機完全無法訪問(per W-F5 acceptance 全在 `docker compose exec` 內部驗)。本 US 是 W-F7 唯一 MVP:沒有它整個 feature 無價值,即使 US2/US3 不做,只要 US1 work、user 就能本機 dev。

**Independent Test**:6 service stack 起來、host 機 4 條 curl/psql/redis-cli 命令全成功 + 1 條 host 瀏覽器 login 整合驗證 — 不需 W-F6 / W-F8 / 後續 feature 任何依賴、純 W-F5 stack + W-F7 dev override 配 4 port。

**Acceptance Scenarios**:

1. **Given** operator 在 outer repo root(`fork260509-rev1/`)、`deploy/secrets/*.txt` 已就位(W-F4 既存要求),**When** 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`,**Then** 6 service(postgres healthy / redis healthy / migration `exited (0)` / rust-api healthy / base-web healthy / front-nginx healthy)全進預期狀態
2. **Given** stack healthy,**When** host 機跑 `curl -fsS http://127.0.0.1:11080/health`,**Then** HTTP 200 + body 含 `ok`(front-nginx self health,W-F5 既有 route)
3. **Given** stack healthy,**When** host 機跑 `curl -fsS -X POST -H "Content-Type: application/json" -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login`,**Then** HTTP 200 + body 含 JWT token(走 front-nginx /api/ 反向代理到 rust-api、W-F5 已驗 routing、W-F7 新加對外 port 後外部可達)
4. **Given** stack healthy,**When** host 機跑 `curl -fsS http://127.0.0.1:11081/health`(rust-api 直連跳過 nginx),**Then** HTTP 200(rust-api 自身 /health)
5. **Given** stack healthy,**When** host 機跑 `pg_isready -h 127.0.0.1 -p 15432`,**Then** exit code 0、connection ok
6. **Given** stack healthy,**When** host 機跑 `redis-cli -h 127.0.0.1 -p 16379 -a "$(cat deploy/secrets/redis_password.txt)" ping`,**Then** 回 `PONG`
7. **Given** stack healthy,**When** host 機瀏覽器訪問 `http://127.0.0.1:11080`,**Then** SPA 載入、login Soybean/123456 進 dashboard、看到 menu(W-F5 + W-F7 e2e 整合驗證)

---

### User Story 2 — Prod baseline 啟動不誤暴露 host port(Priority: P2)

prod 部署者 / CI 用 `docker compose up -d`(不帶 `-f docker-compose.dev.yml`)起 stack 時,**確認 4 個 dev port 都沒 listener**(internal-only baseline、符合 DESIGN-W §6.3 prod 規範)。

**Why this priority**:

Prod safety invariant — 若 dev 拆檔機制不可靠,W-F7 反而引入 prod 誤暴露風險。本 US 是「拆檔安全紀律」的可驗證證明。次優先於 US1(US1 work 就有 dev 可用價值;US2 fail 代表機制設計有問題、必須修)。

**Independent Test**:單獨啟動 prod baseline(同 W-F5 完成時的命令),驗 host 機沒有任何 listener;不需 dev override 檔存在性。

**Acceptance Scenarios**:

1. **Given** operator 跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans`(清掉 dev 殘留),**When** 跑 `docker compose up -d --wait`(不帶 dev 檔),**Then** 6 service 全 healthy(同 W-F5 baseline acceptance)
2. **Given** prod baseline stack 起來,**When** host 機跑 `ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'`,**Then** **無任何輸出**(沒有 host listener)
3. **Given** prod baseline stack 起來,**When** host 機跑 `curl -fsS http://127.0.0.1:11080/health --max-time 5`,**Then** 回 `Connection refused` 或 timeout(prod baseline 不暴露)
4. **Given** prod baseline stack 起來,**When** 從 container 內驗 stack 仍 work `docker compose exec front-nginx wget -qO- http://localhost/health`,**Then** 回 `ok`(stack 內部仍正常,W-F5 routing 不受影響)

---

### User Story 3 — Binding 限 loopback 驗證(Priority: P3)

dev / 安全驗證者確認 W-F7 暴露的 4 個 dev port 都綁 `127.0.0.1`、**不會被 LAN 其他機訪問**。

**Why this priority**:

安全細節驗證 — US1 acceptance 涵蓋「host 機可達」、但沒明確驗「LAN 不可達」。技術上 docker compose 預設 `0.0.0.0` 是常見 footgun,本 US 是 Q2 拍板的可驗證證明,給 user 信心 dev binding 範圍正確。P3 因為 US1/US2 已涵蓋核心、本 US 是補強驗證。

**Independent Test**:dev 環境(US1 已起好)後跑 `ss` 命令檢 binding;若有 LAN 第二台機可選擇性驗 cross-machine 不可達(優先 ss 即可)。

**Acceptance Scenarios**:

1. **Given** dev 環境啟動完成(US1 scenario 1 已 pass),**When** host 機跑 `ss -tlnp 2>/dev/null | grep -E ':(11080|11081|15432|16379)\b'`,**Then** 4 行輸出、每行 Local Address 都是 `127.0.0.1:<port>` 樣式、**非** `0.0.0.0:<port>` / `*:<port>` / `[::]:<port>`
2. **Given**(可選)有 LAN 第二台機在同網段、host 機 IP 為 `192.168.x.y`,**When** 從第二台機跑 `curl http://192.168.x.y:11080/health --max-time 3`,**Then** timeout 或 connection refused

---

### Edge Cases

- **WSL2 NAT 模式 / 舊版**:Windows host 從 `127.0.0.1` 訪問 dev port 不通(loopback 在 Linux side 但 Windows side 看不到)。**對策**:user 須在 `.wslconfig` 設 `networkingMode=mirrored`(Win11 22H2+ 預設);或改用 `wsl hostname -I` 拿 WSL IP 訪問。**spec 邊界檔在 quickstart.md 文檔提示、不在 W-F7 範疇自動偵測**。
- **host 機 port 衝突**:`11080` / `11081` / `15432` / `16379` 其一被既有服務占用,`docker compose up` 失敗回 `bind: address already in use`。**對策**:`ss -tlnp | grep ':<port>'` 排查占用者;停用占用者 或 user 本機臨時改 dev 檔 host port(改 dev 檔對應 entry 即可、container 側不動)。
- **host 直連 postgres / redis 需密碼**:W-F4 secrets 已在 `deploy/secrets/<name>.txt`、host operator 自行 `cat` 取得密碼。spec quickstart 範例命令 inline 示範。
- **dev override 檔誤被 prod 啟動命令拉進**:`docker-compose.dev.yml` tracked(別人 clone 可重現 dev)、但 prod 啟動命令明確不帶 `-f docker-compose.dev.yml`;CI/CD pipeline(W-F18)文檔須明寫;短期內無 CI、靠紀律。
- **dev 啟動命令過長 user 容易忘 -f**:**對策**:CLAUDE.md §5.2 文檔化「dev 啟動範例」段就近放;Makefile / task runner target 化留 W-F17 後續 feature。
- **postgres 15432 / redis 16379 與 fork260509 並存衝突**:per CLAUDE.md §5.2「rev1 提議 port」設計理由 — `1XXXX` 前綴避開 fork260509 預設 `5432` / `6379`;本 spec 不處理、若 user 有非標準 fork260509 配置,自行避讓。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 在 outer repo root **新建** `docker-compose.dev.yml` 1 個檔、git tracked(別人 clone outer repo 後可直接 dev 啟動、不需額外設定)。
- **FR-002**: `docker-compose.dev.yml` MUST 為 4 個既有 service 加 `ports` 區塊 — front-nginx 加 `127.0.0.1:11080:80`、rust-api 加 `127.0.0.1:11081:11081`、postgres 加 `127.0.0.1:15432:5432`、redis 加 `127.0.0.1:16379:6379`。
- **FR-003**: `docker-compose.dev.yml` MUST **不重複定義** 主 compose 的 service body — 只列 service name + `ports` 區塊,讓 docker compose merge 機制自動 deep-merge。
- **FR-004**: 所有 host port binding MUST 限 `127.0.0.1`(loopback only)、不可 `0.0.0.0` / `*` / `[::]` / 省略前綴(省略前綴在 docker 預設等於 `0.0.0.0`)。
- **FR-005**: 主 `docker-compose.yml` MUST **不動**(維持 W-F5 結束的 internal-only 狀態、prod safe baseline、不出現任何 host port forward 區塊)。
- **FR-006**: dev 啟動命令 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` 後 6 service(postgres / redis / migration / rust-api / base-web / front-nginx)MUST 全 healthy(等同 W-F5 baseline)、且 4 個 host port 在 host 機可達。
- **FR-007**: prod baseline 啟動 `docker compose up -d --wait`(不帶 dev 檔)後,4 個 host port MUST **無任何 listener**(`ss -tlnp` 不命中)、stack MUST 仍 internal-only 工作正常。
- **FR-008**: CLAUDE.md §5.2 MUST 更新「目前現況」段落 — 改為「W-F7 落地、dev 環境 4 port 已暴露(127.0.0.1)、prod 維持 internal-only」字眼;MUST 追加「dev 啟動命令範例」段落示範雙檔啟動 + 4 個 host 驗證命令(curl front-nginx / curl rust-api / pg_isready / redis-cli)。
- **FR-009**: docs/INTEGRATION-CHECKLIST.md MUST 更新 W-F7 row 從待辦改 ✅ 完成、Current Focus 段落改下一步為 W-F6 / W-F11(任一)、Phase W deploy P2 進度從 1/4 改 2/4、已完成里程碑段加 W-F7 條目。
- **FR-010**: `docker-compose.dev.yml` MUST 通過 `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` yaml 解析 + merge 驗證(無 syntax / merge error)。
- **FR-011**: 本 feature MUST 為 **單段 commit**(只動 outer repo、不動 worktree base-web / rust-api)— 與 W-F5 commit 模式一致(W-F5 也單段)。

### Non-Functional Requirements

- **NFR-001**: `docker-compose.dev.yml` YAML 體積 SHOULD ≤ 30 行(預估 25 行含註解)— 體現「最小變動範圍」紀律(Constitution Principle I)。
- **NFR-002**: dev 啟動延遲與 W-F5 baseline 相比增幅 SHOULD ≤ 5%(host port forward 是 docker bridge 多一層、dev 容忍開銷)。
- **NFR-003**: spec 文檔(本檔 + plan + tasks)總字數 SHOULD 與 W-F1/W-F2 同量級(brainstorm 進行的 feature 量級)。

### Key Entities

- **`docker-compose.dev.yml`(新建檔)**:Docker compose merge override 檔、outer repo root tracked、僅 dev 啟動命令 `-f -f` 顯式指定時生效。內容:4 個既有 service name + 各自 1 行 ports 區塊、127.0.0.1 binding、頂部註解標明用法 + 「不寫主 compose 原因」。
- **`CLAUDE.md` §5.2 文件**(既有檔、更新範圍):「目前現況」段落表述改 W-F7 已落地;新增「dev 啟動命令範例」段落含 dev / prod 對照啟動命令 + 4 條 host 驗證命令。
- **`docs/INTEGRATION-CHECKLIST.md`**(既有檔、更新範圍):已完成里程碑段加 W-F7 ✅ 條目;Roadmap 表 W-F7 row 改 ✅;Current Focus 段落更新進度 + 下一步指向。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: dev 啟動命令執行後 60 秒內、6 service 全進 healthy 狀態(W-F5 baseline ~71s,W-F7 額外只是 port forward、不增 service)。
- **SC-002**: host 機從 4 個 dev port 訪問對應 service,4/4 成功率 100%(SPA / API / DB / redis 全可達)。
- **SC-003**: prod baseline 啟動後、`ss -tlnp` 對 4 個 dev port 的命中數 = 0(零 host listener、prod safety 100%)。
- **SC-004**: 4 個 dev port 的 binding interface 100% 為 `127.0.0.1`(無 `0.0.0.0` / `*` / `[::]` 出現)。
- **SC-005**: 從 host 瀏覽器訪問 `http://127.0.0.1:11080`、login Soybean/123456 進 dashboard 的整合 e2e 流程在 30 秒內完成。
- **SC-006**: 切換 dev → prod 模式(`down` + `up`)操作步驟 ≤ 2 條命令、無需手動編輯任何 compose / env 檔。
- **SC-007**: 新建 + 改動檔案總數 ≤ 3 個(`docker-compose.dev.yml` 新建 + CLAUDE.md / INTEGRATION-CHECKLIST.md 更新),體現最小變動。

## Assumptions

- **A-001**:operator dev 環境為 WSL2 + Win11 22H2+ 預設 mirrored networking mode(`127.0.0.1` 從 Windows host 可達 WSL2 內 Linux loopback);若 NAT mode 則 quickstart 文檔提示改用 `wsl hostname -I` 拿 WSL IP — 但本 W-F7 不為 NAT mode 提供官方支援路徑。
- **A-002**:operator 已完成 W-F4 既有準備(`deploy/secrets/*.txt` 5 個檔填值)、W-F5 stack 可正常 internal up — 本 feature 不重新驗 W-F1 ~ W-F5 acceptance。
- **A-003**:operator dev 機沒有既有服務占用 `11080` / `11081` / `15432` / `16379` 任一 port;若衝突 user 自行排除(per Edge Cases)。
- **A-004**:host 直連 postgres / redis 時 user 自行從 `deploy/secrets/<name>.txt` 取得密碼(W-F4 既有機制);本 spec 不另提 cred 管理。
- **A-005**:prod 啟動命令紀律「不帶 `-f docker-compose.dev.yml`」by convention — 短期無 CI/CD pipeline(W-F18 未完成),靠 operator / 文檔紀律;CI 落地後 W-F18 需明寫不拉 dev 檔。
- **A-006**:LAN 暴露(`0.0.0.0` binding)場景不在本 feature 支援範圍 — 需要時 user 自行編輯本機 `docker-compose.dev.yml`(本檔仍 tracked、改動算 dirty;不鼓勵)。
- **A-007**:`11443` HTTPS port 屬 W-F6 範疇、本 spec 不處理;prod 主 compose 加 `11080` / `11443` 對外暴露也屬 W-F6 範疇(per OOS-011 self-review 補強)。
- **A-008**:Docker compose 版本 ≥ v2.x(支援 `-f -f` merge 與 deep-merge ports 區塊行為);rev1 預期 docker compose plugin 為 v2.x。

## Dependencies

### Inbound(本 feature 依賴)

- **W-F3** `compose-base-structure`:主 docker-compose.yml 存在、6 service 結構穩定。✅(outer `04671d0`)
- **W-F4** `secret-injection`:postgres / redis password secrets 已落地(host 直連需密碼)。✅(outer `ab658d7`)
- **W-F5** `front-nginx`:front-nginx service 存在、`:80` 為 SPA / API gateway 入口。✅(outer `dff14c2`)

### Outbound(本 feature 解鎖)

- **dev / WSL 本機驗** — 整個 stack 從 host 機可達、SPA + API + DB / redis debug 工作流解鎖(主要價值)。
- **W-F6** `tls-cert-management`:可平行進行(不衝突)、但 W-F6 拍板時應吸納「prod 主 compose 加 11080 / 11443 對外暴露」決策(per OOS-011)。
- **W-F11** `rust-horizontal-scaling`:獨立、可平行。
- **W-F17 / W-F18** CI/CD:本 feature 完成後 CI 文檔須明寫 prod 啟動不帶 dev 檔。

## Out of Scope

- **OOS-001**: HTTPS `:11443` port 暴露 — W-F6 TLS。
- **OOS-002**: TLS cert 管理(自簽 mkcert / Let's Encrypt acme.sh container)— W-F6。
- **OOS-003**: `docker-compose.prod.yml` 顯式 prod 拆檔 — 主 compose 即 prod baseline;後續若需 prod-specific 配置(replicas / resource limits / logging driver)再開後續 feature。
- **OOS-004**: nginx-level rate limiting / WAF — 後續 prod hardening feature。
- **OOS-005**: `0.0.0.0` LAN binding 模式 — 不支援、需要時 user 手動編輯(不鼓勵)。
- **OOS-006**: WSL2 networking mode 自動偵測 / 切換腳本 — 不做、quickstart 文檔提示即可。
- **OOS-007**: Makefile / justfile / task runner target 化(`make dev` / `just up`)— 留 W-F17 或 deploy/README 後續 feature。
- **OOS-008**: CI/CD pipeline 改動 — W-F17 / W-F18。
- **OOS-009**: worktree(base-web / rust-api)source code 改動 — W-F7 純 outer 變動。
- **OOS-010**: secret / W-F4 機制改動 — W-F7 不增不減 secret。
- **OOS-011**: **prod 對外 host port 暴露**(主 docker-compose.yml 加 front-nginx `11080:80` / `11443:443`)— 屬 W-F6 範疇;W-F7 完成後 prod baseline 仍 internal-only、W-F6 完成前 prod 不可達(可接受)。
