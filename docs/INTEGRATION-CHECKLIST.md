# INTEGRATION-CHECKLIST — rev1 整合進度追蹤

> 此檔 = 進度追蹤 + brainstorming 決策快照 + 跨 feature 待驗證項。
> 不放原則（→ `.specify/memory/constitution.md`）、不放規格細節（→ `specs/<NNN>/`）、不放操作參考事實（如預設帳號 → CLAUDE.md §5）。
> 每次 session SOP hook（`.claude/hook-git-submodule-SOP.sh`）自動 cat 本檔 head section 注入到 Claude session 第一輪 additional context。

---

## 🎯 Current Focus

**Phase**:W deploy(per DESIGN-W §11)— **W-2 P2:3/4 ✅(W-F5 + W-F7 + W-F6 完成)、剩 W-F11**
**Active feature**:無(W-F6 全完成、TLS 結構就位 + prod 對外可達)
**下一步**:W-F11(observability;rust-api 多 instance + Casbin pub-sub 跨 instance 驗) + W-F6b(acme.sh 真實 cert acquisition、需真實 domain + DNS provider creds、留 prod VPS 部署時觸發)

> **F5.1 階段同期(P2 主體解鎖)**:F5.1 base-web auth-login-and-dynamic-menu 已完成 merge(2026-05-15、outer `be6e237` + merge `e71aefe`、rust-api `a85e88c`),F5.2 Casbin redis pub-sub 與 F10/F14 同期。
>
> ⚠️ **W-F1 acceptance 階段發現 F5.1 pre-existing wiring bug**(非 W-F1 regression):`/route/getUserRoutes` 在 `sys_menu_route.rs:73` mount 但 handler `SysAuthenticationApi::get_user_routes` 期 `Extension<Arc<SysAuthService>>`、SysMenuRouter 用 SysMenuService 注入。F5.1 e2e test 用 `#[ignore]` 沒實際跑、bug 漏網。**留 F5.1 follow-up / 新 feature 處理、不在 W 系列範疇**。

---

## 已完成里程碑

- [x] outer git init + push（`miso168net/fork260509-rev1`、default branch `rev1-admin-root`）
- [x] worktree + submodule 配置（`base-web` / `rust-api` 雙重身分；CLAUDE.md §9 操作手冊）
- [x] spec-kit v0.8.7 + extensions（before_specify pre-hook → `speckit.git.feature`）
- [x] constitution v1.0.0（`.specify/memory/constitution.md`、Principle I-V）
- [x] **F4 response-shape-alignment** ✅（2026-05-12 完成；outer `3d357e5`、rust-api `82bbde5`；spec `specs/001-response-shape-alignment/`）
- [x] **F3 soft-delete-infrastructure** ✅（2026-05-14 完成；outer `6941788` + merge `0f1c5c3`、rust-api `2a65e2c`；spec `specs/002-soft-delete-infrastructure/`）
- [x] **F2.1 audit-log-infrastructure** ✅（2026-05-14 完成；outer `3c9c689` + merge `209a2c8`、rust-api `6bfa674`；spec `specs/003-audit-log-infrastructure/`；F2.2 outbox + Redis TTL 留後續）
- [x] **F1.1 jwt-secrets** ✅（2026-05-15 完成；outer `c582db4` + merge `5f82df3`、rust-api `65ce06a`；spec `specs/004-jwt-secrets/`；F1.2 algorithm 升級 + key versioning + refresh-token 預埋 留 with F10 refresh-token-bridge 同期）
- [x] **F5.1 auth-login-and-dynamic-menu** ✅(2026-05-15 完成;outer `be6e237` + merge `e71aefe`、rust-api `a85e88c`;spec `specs/005-auth-login-and-dynamic-menu/`;P2 第一個 feature 解鎖 base-web 主體)
- [x] **W-F1 dockerfile-rust-api** ✅(2026-05-15 完成;outer `bdbfb3c` + merge `430ada9`、rust-api `6831677`;spec `specs/006-dockerfile-rust-api/`;Phase W deploy P1 第一個 feature — debian+glibc multi-stage Dockerfile + /health endpoint + ENV APP_SERVER_PORT=11081 走 F1.1 env-override;acceptance 21/22 PASS、image 184MB、build 5m25s / cache hit 2s;1 partial = pre-existing F5.1 wiring bug 已記到 Current Focus)
- [x] **W-F2 dockerfile-base-web** ✅(2026-05-15 完成;outer `de1df10` + merge `ac79ed0`、base-web `cb897e9`;spec `specs/007-dockerfile-base-web/`;Phase W deploy P1 第二個 feature — node:22-slim builder + nginx:1.27-alpine runtime multi-stage Dockerfile + deploy/nginx.conf + .dockerignore 新建 3 個檔;corepack prepare pnpm@10.18.0 顯式 pin;Vite build-arg `VITE_SERVICE_BASE_URL=/api` 透過 process.env override .env.prod mock URL;nginx user pid permission 修;acceptance 12/12 + 4 remediation 全 PASS、image 24.3MB、build 65s cold / cache hit 4s)
- [x] **W-F3 compose-base-structure** ✅(2026-05-15 完成;outer `aa23840` + merge `04671d0`、base-web W-F2 followup `d56b9f8`;spec `specs/008-compose-base-structure/`;Phase W deploy P1 第三個 feature — 新建 outer repo root `docker-compose.yml` + `.env.example` + base-web Dockerfile W-F2 followup fix nginx cache subdir;5 service stack(postgres:17.4 / redis-stack:7.4.0-v3 / migration / rust-api / base-web)+ 1 internal network + 2 named volumes;Q1 postgres + Q2 redis 沿用 W-F1 verified、Q3 嚴守 W-F7 邊界不開 host port;acceptance 18/18 全 PASS、stack up-to-healthy 71s、/health p99 0.45ms、SC-001~SC-006 全達標)
- [x] **W-F4 secret-injection** ✅(2026-05-15 完成;outer `b3d027e` + merge `ab658d7`、rust-api `4057770` + `adf5f4c`;spec `specs/009-secret-injection/`;Phase W deploy P1 **最後一個**(4/4)— Docker secrets + `_FILE` pattern 升級 W-F3 過渡 secret 模式;5 secret entries(jwt_secret / database_url / redis_url / postgres_password / redis_password)+ 4 service secrets ref + rust-api 2 type-specific helper + 既有 callsite 並列加 call + EnvConfigLoader filter `APP_*_FILE` 解 config-rs `_` separator ambiguity(W-F4 implement 階段發現、R-001 amendment);acceptance 13/13 task / 18/18 scenario 全 PASS、4 long-running services healthy + migration exited 0、redis ps 完全不洩 password、/health rust-api+base-web 都 ok、image rebuild 3m51s。**Phase W deploy P1 達 100%、解鎖 P2**)
- [x] **W-F5 front-nginx** ✅(2026-05-16 完成;outer `101c9ac` + merge `dff14c2`;spec `specs/010-front-nginx/`;Phase W deploy **P2 第一個 feature**(1/4)— stack 內反向代理 + SPA gateway、解決 base-web `/api/` prefix vs rust-api root path mismatch;新增 `front-nginx` service(`nginx:1.27-alpine`、internal-only)+ `deploy/front-nginx/conf.d/default.conf`(2 upstream + 3 location + 5 header);5 routing path 全通(SPA `/` → base-web / `/api/auth/login` → rust-api 切前綴 200+JWT / `/api/nonexistent` 透傳 404 / SPA fallback / front-nginx self `/health`);`sys_login_log` 抓到真實 client IP `172.20.0.5` + `curl/7.88.1` UA(X-Forwarded-For 機制 work);6 service stack 起動正常、nginx -t syntax OK、無 ports/TLS/secrets/nestjs/rate limiting(嚴守邊界);**單段 commit**(只動 outer、不動 worktree)。**Phase W deploy P2 第一個 feature 達成、解鎖 W-F6 TLS + W-F7 對外 port**)
- [x] **W-F7 port-mapping** ✅(2026-05-17 完成;outer `ad239c4` + merge `62b3475`;spec `specs/011-port-mapping/`;Phase W deploy **P2 第二個 feature**(2/4)— 新增 outer-repo root `docker-compose.dev.yml` 拆檔(1 個新檔 ~22 行)+ 4 個 host port forward(`127.0.0.1:11080:80` front-nginx + `127.0.0.1:11081:11081` rust-api 直連 + `127.0.0.1:15432:5432` postgres + `127.0.0.1:16379:6379` redis),全綁 127.0.0.1 loopback;主 docker-compose.yml 嚴格不動(prod safe baseline);dev `docker compose -f -f up`、prod `docker compose up` 顯式切換;同步更新 CLAUDE.md §5.2 + INTEGRATION-CHECKLIST.md;US1 7/7 + US2 4/4 + US3 1/2 acceptance PASS(T036 SPA 瀏覽器 e2e + T051 LAN 跨機驗 deferred manual);**單段 commit**(只動 outer);dev/WSL 本機驗工作流解鎖、解鎖 W-F6 / W-F11 後續 P2)
- [x] **W-F6 tls-cert-management** ✅(2026-05-18 完成;outer `38cd074` + merge `5e38030`;spec `specs/012-tls-cert-management/`;Phase W deploy **P2 第三個 feature**(3/4)— 加 TLS 終止 + 對外 port + prod cert lifecycle skeleton(11 個檔);主 compose 加 named volume front_nginx_certs + acme.sh service(profile=prod)+ acme_email secret(per W-F4 _FILE pattern)+ front-nginx cert mount(**不**加 ports、per Clarify Q1 避 binding 衝突);dev.yml 加 127.0.0.1:11443:443 + dev-certs mount(覆蓋 named volume);prod.yml 新建(0.0.0.0:11080+11443 + default.conf.prod mount override);nginx config 加 443 ssl server block(http2 on / TLSv1.2/1.3 / HIGH cipher) + 抽 snippets/proxy_headers.inc DRY;新建 default.conf.prod variant(80 redirect 443 + 保 /.well-known/acme-challenge/);新建 deploy/generate-dev-cert.sh(openssl RSA 4096 自簽、SAN DNS:localhost + IP:127.0.0.1、365 天);新建 deploy/dev-certs/ + deploy/secrets/acme_email.txt.example;.gitignore 加 dev-certs/*.pem;同步 CLAUDE.md §5.2 + INTEGRATION-CHECKLIST.md;US1 P1 MVP 7/7 + US2 P2 4/4 + US3 P3 4/4 = 15/15 acceptance PASS;cert SAN 含 DNS+IP 雙覆;TLSv1.3 + AES-256-GCM cipher 驗成;nginx -t syntax OK;dev/prod 3 mode 切換 work;**單段 commit**(只動 outer);Constitution Check 7 PASS / 14 N/A / 2 Partial(TLS — acme acquisition 留 W-F6b、Complexity Tracking 已合理化)/ 0 violation;解鎖 W-F6b 真實 cert acquisition + W-F11 observability)

---

## Phase 1 P1 Roadmap（per DESIGN-A §6.1）

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| F1 | `jwt-secrets` (拆 F1.1 + F1.2) | ✅ | ✅ | ✅ | ✅ | ✅（F1.1）| **完成** F1.1（F1.2 留 with F10）|
| F2 | `audit-log-infrastructure` | ✅ | ✅ | ✅ | ✅ | ✅（F2.1）| **完成** F2.1 |
| F3 | `soft-delete-infrastructure` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**（commits 上方） |
| F4 | `response-shape-alignment` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**（commits 上方） |

§6.2 規則：**P1 4 個任一順序皆可（平行 spec-kit）、但必須全部完成才能動 P2**。

**Phase 1 P1 全 4 個基礎設施 ✅ 完成（2026-05-15）— Phase 2-5 features（F5-F14）解鎖**。

---

## Phase W deploy Roadmap(per DESIGN-W §11)

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| W-F1 | `dockerfile-rust-api` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方) |
| W-F2 | `dockerfile-base-web` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方) |
| W-F3 | `compose-base-structure` | — | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;DESIGN-W §3 為 authoritative source、無 brainstorm 階段) |
| W-F4 | `secret-injection` | — | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;DESIGN-W §5 + F1.1 為 authoritative source、無 brainstorm 階段) |
| W-F5 | `front-nginx` | — | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;DESIGN-W §4 為 authoritative source、無 brainstorm 階段;**P2 第一個 feature**) |
| W-F7 | `port-mapping` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;dev 4 port 已落地、127.0.0.1 binding、prod baseline 仍 internal-only)|
| W-F6 | `tls-cert-management` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;TLS 結構 + dev 自簽 + prod 80 redirect 443 + acme.sh skeleton;cert acquisition 留 W-F6b)|

§11.2 規則:**W-1 P1 4 個(W-F1 / W-F2 / W-F3 / W-F4)為部署最低基礎、必先全部完成才能動 W-2 P2(W-F5 nginx 反向代理 / W-F6 TLS / W-F7 對外 port)**。**P1 全 4 個完成、P2 解鎖**(2026-05-15);**P2 W-F5 + W-F7 + W-F6 完成、剩 W-F11**(2026-05-18)。**W-2 P2:3/4**。

---

## Brainstorming 決策快照

### F2.1 `audit-log-infrastructure`（進行中、brainstorm 2026-05-14 起）

> Source: `docs/superpowers/003-feature-audit-log-infrastructure.md`（brainstorm 完成後存檔）
> Parent design：DESIGN-A §1.5（全域 audit 紀律）+ §5.2.1（audit 完整性）

| # | Decision | Choice |
|---|---|---|
| 1 | F2 scope 拆分 | **F2.1 先交**：schema 擴 + transaction 紀律 + INSERT/UPDATE audit + 統一 audit path；outbox + Redis subscriber TTL fallback 留 F2.2 |
| 2 | audit 寫入路徑 | 統一為單一 audit context API（取代 HTTP middleware path + F3 `method="INTERNAL"` sentinel hack 並存）|
| 3 | sys_operation_log schema 新欄 | 4 個：`operation` enum（INSERT/UPDATE/SOFT_DELETE/RESTORE/HARD_DELETE）+ `entity_id` + `payload_before` JSONB + `payload_after` JSONB |
| 4 | INSERT/UPDATE 觸發 | Manual — service handler 顯式呼叫（同 F3 facade soft_delete 風格）|
| 5 | payload 內容格式 | Entity 完整 snapshot（`serde_json::to_value(&model)`、storage 成本 admin-heavy 場景可接受）|
| 6 | sensitive field redaction | Trait-based — `AuditSerialize::redacted_fields() -> &[&str]`、sys_user 含 `password`、sys_access_key 含 `access_key_secret` |
| 7 | Implementation approach | **Approach A**：`AuditEvent` struct + `audit_log::write_in_txn` helper（漸進演進 F3 既有 pattern）|

#### `/speckit-clarify` Session 2026-05-14 額外 3 個拍板

| # | Decision | Choice |
|---|---|---|
| 8 | HTTP middleware + service-level audit 雙寫 row 怎麼鎖？ | **Always double-write** — 同一 admin HTTP write 留 2 row（HTTP 視角 method=POST 等 + service-level method=INTERNAL）、middleware 不 dedupe |
| 9 | HTTP middleware audit row entity_type 怎麼填？ | **Hybrid rule** — URL match 7 條 admin pattern `/api/sys-(user|role|menu|domain|organization|endpoint|access-key)/*` 對應 `sys_<x>`、不 match fallback `"http_event"` |
| 10 | Migration `datas/*` seeding INSERT 是否 audit？ | **Exempt** — F2.1 audit 範圍只含 application runtime write（service + middleware）；seeding 走 git tracked migration 檔留紀錄 |

→ Spec / plan / research / data-model / contracts / quickstart / tasks 全在 `specs/003-audit-log-infrastructure/`；F2.1 已 implement 完成（10 commits in rust-api + 2 commits outer + merge to rev1-admin-root）。

### F2.1 `audit-log-infrastructure`（已完成、archived）

→ `docs/superpowers/003-feature-audit-log-infrastructure.md`

### F1.1 `jwt-secrets`（已完成、archived）

→ `docs/superpowers/004-feature-jwt-secrets.md`；spec-kit 全套 + impl 在 `specs/004-jwt-secrets/`

### F3 `soft-delete-infrastructure`（已完成、archived）

→ `docs/superpowers/002-feature-soft-delete-infrastructure.md`

### F4 `response-shape-alignment`（已完成、archived）

→ `docs/superpowers/001-feature-response-shape-alignment.md`

---

## 跨 feature 的待驗證項（Assumptions）

依 constitution §IV「上游驗證」規則 — 帶上 feature spec.md Assumptions 段、實作時驗、驗完勾掉並回填結果。

- [x] **預設密碼 = `123456`** — 舊 workspace fork260509 已驗、CLAUDE.md §5.1 已記錄；rev1 第一個 login flow feature 跑通時再次動態驗證
- [ ] **rev1 dev DB 起動 + migrations 套用 OK** — F3 G11 acceptance test 需此；deploy/ stack 起來才能驗
- [ ] **F3 quickstart Step 7 端到端**（curl login + admin soft-delete + 8888 envelope）— 需 real postgres + redis + rust-api server 起；目前 deploy/ 尚未建立
- [ ] **F3 acceptance tests 跑通**（`cargo test --test soft_delete_basics -- --ignored` × 3 test files、共 9 個 `#[ignore]` test fn）— 需 export `TEST_DATABASE_URL` + migration up
- [ ] **CI lint workflow 在實際 PR 觸發 + block merge** — `.github/workflows/ci-soft-delete-lint.yml` 已建、待第一個 PR 觸發驗證

---

## Deferred / future backlog

### F3 完成後留下的 follow-up

| ID | 範疇 | 處理 | 備註 |
|---|---|---|---|
| F3-N1 | `sys_endpoint::insert_many` fully-qualified | F2.1 評估 | 服務內 `server_model::admin::entities::sys_endpoint::Entity::insert_many(...)` 繞 facade、註解明示合規（facade 只封 SELECT/DELETE）；若 F2.1 audit path 要納 INSERT，facade 補 `insert_many` wrapper 是自然動作 |
| F3-N2 | `sys_access_key` delete atomicity gap | F2.2 / F12 評估 | facade commit → `sign::remove_key` validator 兩行間 process crash 留 validator orphan key；改 DB-as-truth + initialize 重 reload pattern；F2.2 outbox 模式或 F12 cleanup-job 階段處理 |
| F3-N3 | `sys_endpoint::batch_remove_endpoints` partial-failure | F2.1 / F2.2 | 改 log-and-continue 後失去 atomicity；F2.2 outbox 模式可重整 |
| F3-N4 | pre-existing `print!("user is {:#?}", user)` debug 痕 | 任一後續 feature 順手清 | F3 G6 review 發現既有 pre-F3 code、F3 沒清；3 處：sys_user_api / sys_menu_api / sys_authorization_service |
| F3-N5 | `data-model.md §E4` 範例 path 與實際 impl 位置 drift | spec hygiene | spec §E4 範例假設 impls 在 server-core、實際因循環 dep 落在 server-model/src/admin/soft_delete_impls.rs（per analyse C3 precedent）；建議補 errata 一行 |
| F3-N6 | F2 audit-log schema 升級後 F3 helper 對齊 | F2.1 內處理 | F3 FR-022 已預告「F2 升級 sys_operation_log schema 時、F3 callsite 不需動」— F2.1 refactor write_in_txn 時順帶完成 |

---

## 維護指引

每次 feature 推進後，**在同一個 commit 內**更新本檔：

| 階段 | 改 roadmap 表的哪欄 |
|---|---|
| brainstorm 完成（`docs/superpowers/<NNN>-feature.md` 寫定）| Brainstorm 欄改 ✅ + 決策快照寫入本檔對應 section |
| `/speckit-specify` 完成 | spec 欄改 ✅ |
| `/speckit-plan` 完成 | plan 欄改 ✅ |
| `/speckit-tasks` 完成 | tasks 欄改 ✅ |
| 實作 merge 回 default | impl 欄改 ✅、狀態欄改「完成」、加 outer + worktree commit SHA |
| 上游驗證項 done | 把對應勾選改 ✅、結果回填 CLAUDE.md（操作事實）或 spec.md（feature-specific）|

驗證證據（cargo test log、curl 輸出、psql 結果）放在 spec.md / plan.md / quickstart.md、本檔僅勾選與簡述。
