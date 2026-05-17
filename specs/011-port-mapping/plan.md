# Implementation Plan: W-F7 — port-mapping(dev host port forward)

**Branch**: `011-port-mapping` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-port-mapping/spec.md`

## Summary

新增 outer repo root **1 個檔案** `docker-compose.dev.yml`、用 docker compose merge 機制 deep-merge 進主 `docker-compose.yml`,為 4 個既有 service 顯式加 host port 暴露(`127.0.0.1:11080:80` front-nginx + `127.0.0.1:11081:11081` rust-api 直連 + `127.0.0.1:15432:5432` postgres + `127.0.0.1:16379:6379` redis)。**主 compose 不動**(維持 W-F5 結束的 internal-only baseline、prod safe by default)。dev 啟動命令:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`;prod baseline 啟動:`docker compose up -d --wait`。同步更新 [`CLAUDE.md`](../../CLAUDE.md) §5.2「目前現況」段 + 新增「dev 啟動命令範例」、更新 [`docs/INTEGRATION-CHECKLIST.md`](../../docs/INTEGRATION-CHECKLIST.md) W-F7 row + Current Focus。

**Technical approach**(per [research.md](research.md)):

- **Compose v2 deep-merge 行為**:`-f -f` 兩個 yaml 在同 service name 下、`ports` list 由 override 檔**追加**而非 replace(per Docker compose v2 spec、已驗 W-F5 主 compose 無既有 ports → 純新增無衝突)。
- **127.0.0.1 binding 語法**:`"<ip>:<host_port>:<container_port>"` 三元組,**ip 必明寫** — 省略 ip 在 docker engine 預設等於 `0.0.0.0`(per FR-004)。
- **Port 規劃對齊 CLAUDE.md §5.2**:11080(front-nginx HTTP)+ 11081(rust-api 直連)+ 15432(postgres)+ 16379(redis);全 `1XXXX` 前綴避開 fork260509 預設(對齊 Constitution 架構約束「Port 規劃」)。
- **dev/prod 切換**:純啟動命令層 — dev 多帶 `-f docker-compose.dev.yml`、prod 不帶。**不用** `docker-compose.override.yml`(auto-load 在 prod CI 不加 `-f` 顯式主檔時誤暴露風險顯著)。
- **單段 commit**(per CLAUDE.md §6.1):只動 outer(`docker-compose.dev.yml` 新建 + CLAUDE.md / INTEGRATION-CHECKLIST.md 更新)、不動 worktree。

**Pre-implement validation tasks**:

- **T1**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml config` 渲染驗 yaml syntax + merge 正確(per FR-010 + SC-007)
- **T2**:dev 啟動 + `docker compose ps` + 6 service healthy(per FR-006 / AC US1.1)
- **T3**:host 機 4 條 curl/psql/redis-cli 命令全成功(per AC US1.2-6)
- **T4**:`ss -tlnp` 確認 4 行全 `127.0.0.1:<port>` 樣式(per AC US3.1 + FR-004)
- **T5**:prod baseline 啟動 + `ss` 無命中 + curl refused(per AC US2.2-3 + FR-007)

## Technical Context

**Language/Version**:Docker Compose YAML v2(`compose-spec/compose-spec`,對齊 W-F3 / W-F4 / W-F5 既有 compose 風格);shell(POSIX、僅用於 quickstart 驗證命令)

**Primary Dependencies**:
- **`docker-compose.yml`**(W-F5 結束狀態)— 6 service / 1 network / 2 volume / 5 secrets;W-F7 嚴格不動
- **Docker Compose v2.x plugin**(per A-008):支援 `-f -f` merge + deep-merge `ports` list 行為
- **W-F4 secret files**(`deploy/secrets/<name>.txt`):host 直連 postgres / redis 時 user 自行 cat 取得密碼;W-F7 不增不減 secret

**Storage**:
- **`docker-compose.dev.yml`**(outer git-tracked、新建檔)— outer repo root、體積預估 25 行(含 4-5 行頂部註解 + 4 個 service × 5 行)
- 無新 volume、無新網路、無新 secret

**Testing**:
- **Compose syntax + merge**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml config`(per FR-010)
- **Stack startup**:`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`(per FR-006)
- **Host 可達性**:4 條 curl / pg_isready / redis-cli(per US1 scenarios 2-6)
- **Binding 範圍**:`ss -tlnp | grep -E ':(11080|11081|15432|16379)\b'`(per US3 scenario 1)
- **Prod baseline 不暴露**:`docker compose up -d --wait` + `ss` 無輸出 + `curl --max-time 5` refused(per US2 scenarios 2-3)
- **e2e SPA login**:host 瀏覽器訪問 `http://127.0.0.1:11080`(per US1 scenario 7、人工驗、不自動化)

**Target Platform**:**dev 環境** — WSL2 + Win11 22H2+(mirrored networking 預設)、或 pure Linux dev host;**prod 環境** — Linux server(per Constitution 「部署形態 docker-compose 單機」)。本 feature **僅 dev 機觸發 host port forward**,prod baseline 不受影響(無 host port)。

**Project Type**:infrastructure / deploy feature(rev1 deploy Phase W **P2 第二個 feature** — dev 對外可達層;純 outer-repo 配置 layer feature、無 source code 改動、無 service 增減)

**Performance Goals**:
- Stack startup with dev override: ≤ W-F5 baseline + 5%(per NFR-002 / SC-001)
- Host curl/psql/redis-cli 延遲: < 10ms(localhost + docker bridge port forward,可忽略)
- dev → prod 切換(`down` + `up`):≤ 2 條命令(per SC-006)

**Constraints**:
- `MUST NOT` 動主 `docker-compose.yml`(per FR-005、prod safety baseline)
- `MUST NOT` 動 worktree(base-web / rust-api)、不增減 secret / TLS / network / volume
- `MUST NOT` 加 `0.0.0.0` / `*` / `[::]` binding(per FR-004、user-memory `feedback_no_localhost` 延伸)
- `MUST NOT` 加 `11443` HTTPS port(per OOS-001 / W-F6 範疇)
- `MUST NOT` 加 `docker-compose.override.yml` auto-load(per Q3 拍板、prod 誤暴露風險)
- `MUST NOT` 動 base-web / migration 服務 ports(base-web 透過 front-nginx 反向代理、migration 為一次性 exited 0)

**Scale/Scope**:
- 改動檔案數:**3 個檔**(`docker-compose.dev.yml` 新建 + CLAUDE.md / INTEGRATION-CHECKLIST.md 更新)
- LOC 量級:`docker-compose.dev.yml` ~25 行(含註解);CLAUDE.md §5.2 改 ~30 行(含新加範例段);INTEGRATION-CHECKLIST.md 改 ~10 行(W-F7 row + Current Focus)
- **Commit 模式**:**單段 commit**(per CLAUDE.md §6.1)— 只動 outer

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ❌ **N/A**(W-F7 純 port forward、無 endpoint authorization 改動)
- **II. Soft Delete + Audit Log** — ❌ **N/A**(W-F7 無 DB 寫入、無 audit log 新增點)
- **III. 嚴版禁 Forward + 單一職責** — ❌ **N/A**(W-F7 為 docker host port forward、不是 backend ↔ backend 的 HTTP/RPC 呼叫;反向代理由 W-F5 front-nginx 處理、本 feature 不動)
- **IV. base 不改動邊界** — ✅ **PASS**(W-F7 不動 base-web 任何 `src/` / `.env*` / 內部 nginx config、不動 rust-api source、不動 secret)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-F7 為 deploy 層 dev 工具、與 DESIGN-A / DESIGN-B 過渡無耦合;dev 拆檔機制對未來 nestjs 加入 stack 中性)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **PASS**
- **資料庫 PostgreSQL** — ❌ **N/A**
- **快取 redis 必要** — ❌ **N/A**
- **TLS 對外** — ❌ **N/A**(W-F7 dev 場景、Constitution「HTTP only 僅限本機 dev」明確允許;prod 11080/11443 對外暴露屬 W-F6 範疇、含 TLS;W-F7 完成後 prod baseline internal-only、無對外明文窗口)
- **Secret 注入** — ❌ **N/A**(W-F7 不增減 secret)
- **DB migration trigger** — ❌ **N/A**
- **Port 規劃 `1XXXX`** — ✅ **PASS**(11080 / 11081 / 15432 / 16379 全 `1XXXX` 前綴、嚴格對齊 CLAUDE.md §5.2 與 DESIGN-W §6.1)
- **Observability promtail/Loki/prometheus** — ❌ **N/A**(W-F11 / W-F12+ 範疇)
- **結構化 log JSON** — ❌ **N/A**(W-F7 不改 log 配置)
- **Backup PITR** — ❌ **N/A**(W-F7 stateless)
- **背景工作** — ❌ **N/A**
- **CI/CD platform** — ❌ **N/A**(本 feature 不改 CI;W-F18 落地時須在 pipeline 文檔明寫「prod 啟動不帶 `-f docker-compose.dev.yml`」、屬 W-F18 範疇)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(brainstorm → /speckit-specify → /speckit-clarify(no critical Q)→ /speckit-plan 流程完整)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、0 violation、0 partial)
- **兩段式 commit 紀律** — ✅ **PASS**(W-F7 走**單段** commit、只動 outer、不動 worktree)
- **Conventional Commits 中文 subject** — ✅ **PASS**(plan 階段預期 commit message:`feat(deploy): W-F7 dev host port forward...`)
- **Push 確認紀律** — ✅ **PASS**(implement 完成後 push 需 user 同意、不主動推)
- **TLS 紀律** — ❌ **N/A**(W-F7 dev 場景、Constitution 「HTTP only 僅限本機 dev」明確允許;prod TLS 留 W-F6)

**Gate result**:**5 PASS / 18 N/A / 0 Partial / 0 violation**。Phase 0 起 gate 通過、無 Complexity Tracking entry 需要。

## Project Structure

### Documentation (this feature)

```text
specs/011-port-mapping/
├── plan.md                              # This file (/speckit-plan output)
├── research.md                          # Phase 0 output(brainstorm 決策摘要 + compose merge 行為驗證)
├── data-model.md                        # Phase 1 output(3 entity:dev.yml + CLAUDE.md §5.2 + checklist 段)
├── quickstart.md                        # Phase 1 output(operator dev 啟動 + 驗證 guide)
├── contracts/                           # Phase 1 output
│   ├── dev-override-merge.md            #   docker-compose.dev.yml + 主 compose merge 行為契約
│   └── verification-commands.md         #   host 驗證命令契約(curl / ss / pg_isready / redis-cli)
├── checklists/
│   └── requirements.md                  # /speckit-specify 階段已產出
├── spec.md                              # /speckit-specify 階段已產出
└── tasks.md                             # Phase 2 output(/speckit-tasks 階段、NOT in this command)
```

### Outer repo changes(W-F7 implement 階段預期變動範圍)

```text
fork260509-rev1/                         # outer repo root
├── docker-compose.yml                   # W-F5 baseline — MUST NOT modify(per FR-005)
├── docker-compose.dev.yml               # ★ W-F7 新建 ~25 行
├── CLAUDE.md                            # W-F7 update §5.2「目前現況」+ 新增「dev 啟動命令範例」段
└── docs/INTEGRATION-CHECKLIST.md        # W-F7 update W-F7 row ✅ + Current Focus + 已完成里程碑
```

**worktree 不動**:`base-web/` / `rust-api/` 兩個 worktree 全程零改動(per FR-011 單段 commit + Constitution Principle IV)。

**Structure Decision**:本 feature 為**純 outer-repo config 增量**,無 source code、無 service 增減、無 secret 改動。檔案結構嚴格收緊在「outer / docs / spec」三類,實作階段預期影響面 ≤ 3 個檔案、commit 為 single atomic outer commit。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**無 violation、本表保留為空**(per Gate result 0 violation / 0 partial)。

---

**Phase 0 / 1 outputs**:見同目錄 [`research.md`](research.md)、[`data-model.md`](data-model.md)、[`quickstart.md`](quickstart.md)、[`contracts/`](contracts/)。
