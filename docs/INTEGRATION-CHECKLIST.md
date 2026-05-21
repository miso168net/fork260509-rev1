# INTEGRATION-CHECKLIST — rev1 整合進度追蹤

> 此檔 = 進度追蹤 + brainstorming 決策快照 + 跨 feature 待驗證項。
> 不放原則（→ `.specify/memory/constitution.md`）、不放規格細節（→ `specs/<NNN>/`）、不放操作參考事實（如預設帳號 → CLAUDE.md §5）。
> 每次 session SOP hook（`.claude/hook-git-submodule-SOP.sh`）自動 cat 本檔 head section 注入到 Claude session 第一輪 additional context。

---

## 🎯 Current Focus

**Phase**:**DESIGN-A §6.1 Phase 5(P5)完成 — F14 `design-a-to-b-cutover` 落地** — DESIGN-A §6.1 完整 14-feature 集(F1–F14)全部落地;F14 完成 nginx routing 從 nestjs 改指 rust、刪 W-FA2 TRANSITIONAL block、移除 nestjs container、nestjs 完全退場。**DESIGN-B(rust-only)形態正式生效**。Phase 1–4 全部 application feature(F1–F12)+ Track DESIGN-A 部署三件套(W-FA1/W-FA2/W-FA3)+ Phase W deploy P1/P2/P4 + P5(F13+F14)全部完成。
**Active feature**:—(無進行中 feature;032 menu-crud-wiring(W-WEBUI 軌道第二個 feature)落地完成、多段式 commit + push + merge `8ccc4b4` done)
**下一步**:DESIGN-A §6.1 全 14 feature 完成、DESIGN-B 現行。032 完成 W-WEBUI 軌道第二個 feature(base-web menu CRUD 接線)。後續候選:W-FW2-N1 menu query/buttons/fixedIndexInTab 持久化、W-FW1-N1 userRoles 接線、W-FW1-N2 password UX、W-F6b acme-cert-acquisition、observability W-F12/W-F13/W-F14(DESIGN-W Phase W-5)。

> **F5.1 階段同期(P2 主體解鎖)**:F5.1 base-web auth-login-and-dynamic-menu 已完成 merge(2026-05-15、outer `be6e237` + merge `e71aefe`、rust-api `a85e88c`),F5.2 Casbin redis pub-sub 與 F10/F14 同期。
>
> ✅ **W-F1 acceptance 階段發現 F5.1 pre-existing wiring bug — 已由 F7.1 修復**:`/route/getUserRoutes` 在 `sys_menu_route.rs:73` mount 但 handler `SysAuthenticationApi::get_user_routes` 期 `Extension<Arc<SysAuthService>>`、SysMenuRouter 原只用 SysMenuService 注入致 HTTP 500。F7.1 fix-route-getuserroutes-wiring US1 把 `init_protected_menu_router` 改 multi-service manual layer pattern 補上 `Arc<SysAuthService>` Extension layer、`/route/getUserRoutes` 對 3 role 全回 HTTP 200(見下方 F7.1 里程碑)。

---

## 已完成里程碑

- [x] outer git init + push（`miso168net/fork260509-rev1`、default branch `rev1-admin-root`）
- [x] worktree + submodule 配置（`base-web` / `rust-api` 雙重身分；CLAUDE.md §9 操作手冊）
- [x] spec-kit v0.8.7 + extensions（before_specify pre-hook → `speckit.git.feature`）
- [x] constitution v1.0.0（`.specify/memory/constitution.md`、Principle I-V）
- [x] **F4 response-shape-alignment** ✅（2026-05-12 完成；outer `3d357e5`、rust-api `82bbde5`；spec `specs/001-response-shape-alignment/`）— rust↔base-web API 回應 envelope 形狀對齊
- [x] **F3 soft-delete-infrastructure** ✅（2026-05-14 完成；outer `6941788` + merge `0f1c5c3`、rust-api `2a65e2c`；spec `specs/002-soft-delete-infrastructure/`）— 7 張 admin 表加 deleted_at 軟刪基礎設施
- [x] **F2.1 audit-log-infrastructure** ✅（2026-05-14 完成；outer `3c9c689` + merge `209a2c8`、rust-api `6bfa674`；spec `specs/003-audit-log-infrastructure/`）— audit log 基礎設施（F2.2 outbox + Redis TTL 留後續）
- [x] **F1.1 jwt-secrets** ✅（2026-05-15 完成；outer `c582db4` + merge `5f82df3`、rust-api `65ce06a`；spec `specs/004-jwt-secrets/`）— JWT secret 外部化（F1.2 algorithm 升級 / key versioning 留後續）
- [x] **F5.1 auth-login-and-dynamic-menu** ✅（2026-05-15 完成；outer `be6e237` + merge `e71aefe`、rust-api `a85e88c`；2026-05-18 follow-up patch outer `1bdbc2f` + rust-api `1219418`；spec `specs/005-auth-login-and-dynamic-menu/`）— base-web 登入 + 動態 menu，P2 主體解鎖
- [x] **W-F1 dockerfile-rust-api** ✅（2026-05-15 完成；outer `bdbfb3c` + merge `430ada9`、rust-api `6831677`；spec `specs/006-dockerfile-rust-api/`）— rust-api Dockerfile + /health endpoint，Phase W deploy P1
- [x] **W-F2 dockerfile-base-web** ✅（2026-05-15 完成；outer `de1df10` + merge `ac79ed0`、base-web `cb897e9`；spec `specs/007-dockerfile-base-web/`）— base-web Dockerfile（node builder + nginx runtime）
- [x] **W-F3 compose-base-structure** ✅（2026-05-15 完成；outer `aa23840` + merge `04671d0`、base-web W-F2 followup `d56b9f8`；spec `specs/008-compose-base-structure/`）— outer docker-compose 基礎結構（5 service stack）
- [x] **W-F4 secret-injection** ✅（2026-05-15 完成；outer `b3d027e` + merge `ab658d7`、rust-api `4057770` + `adf5f4c`；spec `specs/009-secret-injection/`）— Docker secrets `_FILE` pattern，Phase W deploy P1 收尾
- [x] **W-F5 front-nginx** ✅（2026-05-16 完成；outer `101c9ac` + merge `dff14c2`；spec `specs/010-front-nginx/`）— front-nginx 反向代理 + SPA gateway，Phase W deploy P2
- [x] **W-F7 port-mapping** ✅（2026-05-17 完成；outer `ad239c4` + merge `62b3475`；spec `specs/011-port-mapping/`）— dev host port mapping（docker-compose.dev.yml）
- [x] **W-F6 tls-cert-management** ✅（2026-05-18 完成；outer `38cd074` + merge `5e38030`；spec `specs/012-tls-cert-management/`）— TLS 終止 + prod cert lifecycle skeleton
- [x] **F6 route-guard** ✅（2026-05-18 完成；outer `b079248` + merge `a431215`、rust-api `1649aa9`；spec `specs/013-route-guard/`）— rust-api `/route/isRouteExist` endpoint 補完 vue-router guard
- [x] **W-FA1 compose-nestjs-service** ✅（2026-05-18 完成；outer `b2c3ff7` + merge `b095d55`；spec `specs/014-compose-nestjs-service/`）— nestjs service 加進 compose（profile track-a）
- [x] **W-FA3 cicd-nestjs-build-job** ✅（2026-05-18 完成；outer `68c5c4e` + merge `f23f38e`；spec `specs/016-cicd-nestjs-build-job/`）— nestjs image build script，Track DESIGN-A 三件套收尾
- [x] **W-FA2 nginx-track-a-transitional-block** ✅（2026-05-18 完成；outer `e8f4dac` + merge `c5b7840`；spec `specs/015-nginx-track-a-transitional-block/`）— nginx refreshToken→nestjs TRANSITIONAL block
- [x] **F7.1 fix-route-getuserroutes-wiring** ✅（2026-05-20 完成；outer `554436f` + merge `efe910e`、rust-api `4de171a`；spec `specs/023-fix-route-getuserroutes-wiring/`）— 修 `/route/getUserRoutes` 500 wiring + menu paginated wrapper
- [x] **F7.2 role-code-alignment** ✅（2026-05-20 完成；outer `68410df` + merge `476ca88`、rust-api `84cbc19`；spec `specs/024-role-code-alignment/`）— getUserInfo role code alias 映射（ROLE_*→R_*）
- [x] **F8 assign-users** ✅（2026-05-20 完成；outer `f1bfff7` + merge `c2b0912`、rust-api `90f37d1`；spec `specs/025-assign-users/`）— assign-users user-role 指派 endpoint，application Phase 3 收尾
- [x] **W-F11 rust-horizontal-scaling** ✅（2026-05-21 完成；outer `d02c7c9` + merge `d2d4c4c`、rust-api `d122b23`；spec `specs/026-rust-horizontal-scaling/`）— rust-api 水平擴展（Casbin redis pub-sub + 多 replica），Phase W-4
- [x] **F12 cleanup-job** ✅（2026-05-21 完成；outer `78e585c` + merge `86e56e5`、rust-api `30c8dd4`；spec `specs/027-cleanup-job/`）— cleanup binary 物理清除過期軟刪 row，DESIGN-A 本體 F1–F12 收尾
- [x] **F14 design-a-to-b-cutover** ✅（2026-05-21 完成；outer `33758f0` + merge `1f20a0d`、rust-api `729d3c6`；spec `specs/029-design-a-to-b-cutover/`）— DESIGN-A→B cutover、nestjs 完全退場，DESIGN-B 形態生效
- [x] **030 systemmanage-status-gender-alignment** ✅（2026-05-21 完成；outer `681dcbe` + merge `0ed2e85`、rust-api `0e1fb95`；spec `specs/030-systemmanage-status-gender-alignment/`）— systemManage status/gender enum 契約對齊
- [x] **032 menu-crud-wiring** ✅（2026-05-22 完成；outer `d96aafa` + merge `8ccc4b4`、rust-api `149dc52`、base-web `b43634c0`；spec `specs/032-menu-crud-wiring/`）— base-web menu CRUD 接線，W-WEBUI 軌道第二個 feature
- [x] **031 user-crud-wiring** ✅（2026-05-22 完成；outer `10edf43` + merge `a09d316`、rust-api `2a24e9d`、base-web `1793b361`；spec `specs/031-user-crud-wiring/`）— base-web user CRUD 接線，W-WEBUI 軌道第一個 feature
- [x] **F13 rust-refresh-token-impl** ✅（2026-05-21 完成；outer `a1e739c` + merge `4e9cf07`、rust-api `d019d8f`；spec `specs/028-rust-refresh-token-impl/`）— rust 自實作 refresh token 輪替，DESIGN-A §6.1 P5 起點
- [x] **F7 manage-crud-alignment** ✅（2026-05-20 完成；outer `44c7424` + merge `136b1eb`、rust-api `11b888c`；spec `specs/022-manage-crud-alignment/`）— manage/* 4 模組 CRUD 讀側形狀對齊
- [x] **F9 systemManage-alias-router** ✅（2026-05-20 完成；outer `260f2c6` + merge `b2f910c`、rust-api `b744c8e`；spec `specs/021-systemmanage-alias-router/`）— `/systemManage/*` alias router（10 條 alias endpoint）
- [x] **F11 extracted-stubs** ✅（2026-05-19 完成；outer `6299640` + merge `81ecb0d`、rust-api `c58e619`；spec `specs/020-extracted-stubs/`）— DESIGN-A 抽離項清單 4 條 stub endpoint
- [x] **F10.2 rust-tokenstatus-string-align** ✅（2026-05-19 完成；outer `d53e724` + merge `851ec79`、rust-api `cb97224`；spec `specs/019-rust-tokenstatus-string-align/`）— rust TokenStatus `unused`/`used` 字串對齊
- [x] **F10.1 rust-jwt-refresh-token-signing** ✅（2026-05-19 完成；outer `bd11d2b` + merge `48b70e6`、rust-api `211ef74`；spec `specs/018-rust-jwt-refresh-token-signing/`）— rust 簽 HS256 JWT refresh token
- [x] **F10 refresh-token-nestjs-bridge** ✅（2026-05-19 完成；outer `4d6fc28` + merge `8f0e84c`；spec `specs/017-refresh-token-nestjs-bridge/`）— refreshToken→nestjs bridge wire-up，application Phase 4 起點

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
| W-F11 | `rust-horizontal-scaling` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(commit 上方;**Phase W-4 (P4) 第一個 feature** — Casbin redis pub-sub 跨 instance 一致性 + compose `replicas: 2` + nginx resolver-based upstream;observability(W-F12/W-F13/W-F14、Phase W-5 P5)為後續候選)|

§11.2 規則:**W-1 P1 4 個(W-F1 / W-F2 / W-F3 / W-F4)為部署最低基礎、必先全部完成才能動 W-2 P2(W-F5 nginx 反向代理 / W-F6 TLS / W-F7 對外 port)**。**P1 全 4 個完成、P2 解鎖**(2026-05-15);**P2 W-F5 + W-F7 + W-F6 完成**(2026-05-18)。**W-2 P2:3/3 完成(W-F5 / W-F6 / W-F7)**。W-F11 `rust-horizontal-scaling`(水平擴展能力)屬 **Phase W-4 (P4)**、非 P2(per `INTEGRATION-DESIGN-W-DEPLOYMENT.md §11` authoritative source);observability(W-F12 / W-F13 / W-F14)屬 **Phase W-5 (P5)**、為後續候選。

---

## Phase W-7 deploy Roadmap — Track DESIGN-A 三件套(per DESIGN-W §11 line 1114-1116)

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| W-FA1 | `compose-nestjs-service` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `b2c3ff7` + merge `b095d55`、17/17 acceptance PASS)|
| W-FA2 | `nginx-track-a-transitional-block` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `e8f4dac` + merge `c5b7840`、12/12 acceptance PASS)|
| W-FA3 | `cicd-nestjs-build-job` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `68c5c4e` + merge `f23f38e`、8/8 acceptance PASS)|

**W-FA1 implement-time discoveries**(2026-05-18):
- **NODE_VERSION build-arg override**:fork Dockerfile `ARG NODE_VERSION=20.11.1` 配 `pnpm@9.1.2` 觸 `ERR_UNKNOWN_BUILTIN_MODULE`(pnpm 用 Node 20.12+ 才有的 `node:sea-config`)。Spec A-002 anticipated;build cmd 加 `--build-arg NODE_VERSION=22.11.0`(LTS)解。
- **healthcheck endpoint amendment**(R-1):spec FR-008 原 `/v1/route/getConstantRoutes` 假設只觸 sys_menu 不依賴 schema 對齊;實際發現 nestjs prisma 期 `public.Status` PG enum、rust-api 用 SMALLINT 致 PG 42704 type-not-exist。**改 healthcheck 到 `/v1` root(`@Public @BypassTransform getHello()` 不查 DB)**。對齊 W-F4 R-001 amendment 模式、保證 healthcheck PASS 與 schema 對齊無關。spec FR-008 / contract C-C4 / verification C-V2/C-V7 同步調整(此次 commit 一起落)。
- **image size 870MB**:NFR-001 SHOULD ≤ 500MB 偏大(Node 22 + multi-stage 含完整 node_modules)、屬 SHOULD 非 MUST、留 W-FA3 build 優化階段精修。
- **sys_menu / sys_tokens schema 對齊**:sys_tokens 表存在(rust-api 已 migrate)、但 nestjs prisma model 用 PG enum `Status` 與 rust-api SMALLINT 分歧 — F10 範疇對齊 nestjs prisma model 到 rust-api schema(spec OOS-005)。

---

## Application Phase 4 Roadmap(per DESIGN-A §6.4 / DESIGN-W 三件套後)

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| F10 | `refresh-token-nestjs-bridge` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `4d6fc28` + merge `8f0e84c`、5/5 acceptance PASS、wire-up + friction baseline)|
| F10.1 | `rust-jwt-refresh-token-signing` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `bd11d2b` + merge `48b70e6`、rust-api `211ef74`、9/9 acceptance PASS、R-8 修 + R-7 surface as F10.2 baseline)|
| F10.2 | `rust-tokenstatus-string-align` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `d53e724` + merge `851ec79`、rust-api `cb97224`、8/8 acceptance PASS + unit test、R-7 修、Phase 4 整套收尾)|
| F11 | `extracted-stubs` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `6299640` + merge `81ecb0d`、rust-api `c58e619`、7/7 acceptance PASS、4 條 stub + Casbin policy seed、DESIGN-A §4.2 抽離項 4/5 完成)|
| F9 | `systemManage-alias-router` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `260f2c6` + merge `b2f910c`、rust-api `b744c8e`、10/10 acceptance PASS、10 條 alias + Casbin policy seed 20 row、**DESIGN-A §4.2 抽離項 5/5 收尾完成**)|
| F7 | `manage-crud-alignment` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `44c7424` + merge `136b1eb`、rust-api `11b888c`、10/11 acceptance PASS + 1 deferred CDP smoke、5 個 Output DTO + 5 wrapper handler + Casbin policy seed 15 row、**application Phase 3 進度 2/3**、解 A-006、F7 R-Q-AT1 spec drift refinement(base path trailing slash 移除))|
| F8 | `assign-users` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `f1bfff7` + merge `c2b0912`、rust-api `90f37d1`、12/12 acceptance PASS、assign_users handler + route mount + Casbin policy seed 1 row、**application Phase 3 收尾 3/3**、補齊 `/authorization/assign-*` 三件套)|
| F12 | `cleanup-job` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `78e585c` + merge `86e56e5`、rust-api `30c8dd4`、9/9 acceptance PASS、新 crate `server/cleanup` cleanup binary + docker-compose `cleanup` service(profile jobs)+ `cleanup_job` 最小權限 PG role、物理刪 7 張軟刪表過期 row + per-row txn 寫 `HARD_DELETE` audit、無 migration、**DESIGN-A 本體(F1–F12)收尾**)|

**DESIGN-A §4.2 抽離項清單交付進度**:**5 / 5 完成**(F11 4 條 sendCaptcha / verifyCaptcha / auth/error / mock/getLastTime + F9 1 條 batchDeleteUser);抽離項清單收尾、F11 + F9 兩 feature 合計補完 DESIGN-A §3.1 + §4.2 全部 stub endpoint、解鎖 F13 rust-refresh-token-impl + F14 DESIGN-A→B cutover、可並行 F12 / W-F11 / W-F6b。F9 R-Q1 spec correction(既有 `update_user` handler method-agnostic、F9 alias 直接 mount POST 不需新做 `update_user_post` wrapper)為 F11 R-Q5/R-Q6 之後第 3 個 implement-time spec drift refinement、modal pattern「acceptance 階段 catch + spec inline 修」延續。

**Application Phase 3 進度**:**3 / 3 完成**(F9 systemManage-alias-router、10 條 alias 完整交付 + F7 manage-crud-alignment、5 read alias shape 對齊 + admin path Casbin 補位 15 row + F8 assign-users、`POST /authorization/assign-users` user-role 指派 endpoint wiring + Casbin policy seed 1 row、收尾 Phase 3)。**F7 解 spec A-006 已知差異**(F9 baseline、ROLE_ADMIN 對既有 `/user/* /role/* /route/*` path Casbin 補位完整);F7 R-Q-AT1 spec drift refinement(base path trailing slash 移除、acceptance 階段 catch + 修齊 migration source + in-DB UPDATE 8 row)為 F11 R-Q5/R-Q6 + F9 R-Q1 之後第 4 個 implement-time spec correction、modal pattern「acceptance 階段 catch + spec inline 修」延續。F7 解鎖 F8 + base manage/* 4 view 跑通(精化定義為 3 view + admin path、not 4 view + UI CRUD per Q1)、並行可選 F12 / W-F11 / W-F6b。F7.2 role-code-alignment(F7.1 後 follow-up)收掉 F7.1 CDP demo 的 role alias workaround — rust `getUserInfo` 回傳 role code 套 `ROLE_*`→`R_*` alias 映射純函式、base-web static 模式 manage/* 3 view CDP smoke 不帶 workaround 原生 render;F7.2 為 F7/F7.1 base manage/* 跑通收尾 follow-up、非獨立 Phase 3 feature(F7.2 落地時進度 2/3、F8 落地後 Phase 3 收尾 3/3)。

**Plan Phase 0 R-7 / R-8 finding** 推動 F10 scope reset(Option A 拍板):
- R-7: rust `TokenStatus` SCREAMING_SNAKE_CASE(`"ACTIVE"` / `"REFRESHED"` / `"REVOKED"`)vs nestjs lowercase(`"unused"` / `"used"`)完全不對齊 — F10.2 rust-tokenstatus-string-align 解
- R-8: rust 簽 `refresh_token` 用 `Ulid::new().to_string()`(26 char 明文 Ulid)vs nestjs `jwtService.verifyAsync` 期 JWT 三段 — F10.1 rust-jwt-refresh-token-signing 解
- 加總 5-9 處 rust patch 超 brainstorm Q3 1-3 處上限、觸發 R-4 abort path、reset F10 為 wire-up + friction 紀錄 feature
- F10.1 + F10.2 完成後 nestjs refreshToken end-to-end 跑通、後續 F11 + F13 + F14 解鎖

## Application Phase 5 Roadmap(per DESIGN-A §6.1 — DESIGN-A→DESIGN-B 遷移)

| # | Feature | Brainstorm | spec | plan | tasks | impl | 狀態 |
|---|---|---|---|---|---|---|---|
| F13 | `rust-refresh-token-impl` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `a1e739c` + merge `4e9cf07`、rust-api `d019d8f`、10/10 acceptance PASS、rust 新增 `POST /auth/refreshToken` refresh token 輪替 endpoint)|
| F14 | `design-a-to-b-cutover` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `33758f0` + merge `1f20a0d`、nginx routing nestjs→rust + 刪 TRANSITIONAL block + 移除 nestjs container + R3/R4 cleanup;DESIGN-B(rust-only)正式生效)|

**Phase 5(P5)= DESIGN-A→DESIGN-B(rust-only)遷移**:F13 補上 rust 自身的 refresh token 消費/驗證/輪替能力(rust 與 nestjs 兩 `/auth/refreshToken` endpoint 共存、F13 階段以直連 rust port 驗證);F14 把 nginx routing 從 nestjs 改指 rust、刪 W-FA2 TRANSITIONAL block、移除 nestjs container,DESIGN-B 形態正式生效。F13 為設計先行產出,2026-05-21 經 user 明示覆寫 §6.2「過渡橋 F10 運行 N 週」time gate 後 implement(F10 merge `8f0e84c` 當時僅運行 2 天)。

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

### DESIGN-B cutover 前完整性盤點(2026-05-21、specs 001–028 全 28 feature spec 對照 review)

對 specs 001–028 全 28 個 feature 做 spec.md 對照 conformance review(7 批平行 review、`superpowers:requesting-code-review` 流程)。**結論:28 feature 全部 COMPLETE(15)或 COMPLETE-WITH-NOTES(13)、0 GAPS / 0 CANNOT-VERIFY** — DESIGN-A 本體在 spec 層面完整,無「規格要求但未做」硬缺口。以下為 review 抓出、需在 F14 cutover 前或同步處理的項目:

- [x] **R1 已查證(2026-05-21)— SAFE,F14 反而修復一個潛在 break** — base-web HTTP 層成功判定為 `String(response.data.code) === VITE_SERVICE_SUCCESS_CODE`(`base-web/.env` `VITE_SERVICE_SUCCESS_CODE=0`、`base-web/src/service/request/index.ts:37`);`fetchRefreshToken` 走同一 `request` interceptor、無 hardcoded `200`、無特殊處理(`api/auth.ts` + `request/shared.ts:18-27`)。rust F13 回 `code:0` → 判定 success ✓;nestjs 回 `code:200` → 判定 **fail** → silent refresh 觸發 `resetStore()` 登出。即:**DESIGN-A 過渡期經 nginx→nestjs 的 SPA silent refresh 實際上是壞的**(W-FA2 只驗 nginx routing 接通、未驗 SPA 端到端);F14 把 routing 切到 rust 反而讓 silent refresh 第一次真正可用。→ **F14 無此 cutover 阻擋風險**;base-web CDP silent-refresh smoke 仍建議做為 F14 落地確認、但非 go/no-go gate。
- [ ] **R2 — F5.1 登入失敗無 audit** — `pwd_login` 只在成功路徑呼叫 `send_login_event`;密碼錯誤時 `sys_login_log` / `sys_operation_log` 皆不寫 row,spec 005 FR-007 / SC-009「登入失敗寫 login_failed row」未實作。若 DESIGN-B 要求 audit 完整性需補。
- [x] **R3 — `1xxx` legacy error code 游離於 F4 namespace 外** — `sys_user_error.rs` 的 1001–1005 不在 F4 23-code 表內,技術上違反 F4 FR-005 + SC-006;軟刪 user 登入回 1001(F3 Scenario 9 期望 6001)。功能無害(base-web 無特殊 handler),屬跨 feature 待清理項。**F14 US2 處理**:在 `code.rs` namespace 登記 `1xxx` legacy range + `sys_user_error.rs` 加 inline TODO DESIGN-B block,零行為改變(R3 設計先行、不改 1001–1005 數值)。
- [x] **R4 — `cleanup_database_url.txt.example` 缺失** — `deploy/secrets/` 其他 7 個 secret 皆有 `.txt.example`、僅 F12 `cleanup_database_url` 無。非 spec 違反(F12 FR-018 未明文要求),但破壞慣例、新機器 onboarding 缺範本。**F14 US3 T040 處理**:新建 `deploy/secrets/cleanup_database_url.txt.example`、格式對齊 `database_url.txt.example`、`.gitignore` `!/deploy/secrets/*.txt.example` 已覆蓋。

**F14 nestjs 拔除面**(Track DESIGN-A 三件套 W-FA1/2/3 邊界乾淨):W-FA1 nestjs service(`docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.prod.yml` 移除 `nestjs:` block、`profiles:["track-a"]` 隔離)/ W-FA2 nginx TRANSITIONAL(`sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'` — 3 個 block 跨 `default.conf` 80+443 server 與 `default.conf.prod` 443 server)/ W-FA3 `rm deploy/build-nestjs.sh` + 還原 `CLAUDE.md` §5.2.1。**⚠️ `refresh_token_secret` secret 不可刪** — rust 自身 `APP_JWT_REFRESH_SECRET_FILE` 仍指向它(F10.1/F13 用);F14 只移除 nestjs 對它的引用。

**cutover 前置鏈確認**:F10.1(rust 簽 HS256 JWT refresh token)+ F10.2(`unused`/`used` 字串對齊)+ F13(rust 自驗 + 輪替)三者一致 — rust refresh 實作功能上對得上 nestjs(同 refresh secret / HS256、同 status 字串值、同輪替語意),唯一行為差異即 R1 的 envelope `code`。

**其他 minor notes(不阻 cutover)**:F5.1 FR-006 登入成功寫 `sys_login_log` 非 spec 寫的 `sys_operation_log`(收尾時接受)/ `MenuRoute.id` rust `i32` 序列化為 JSON number、base-web TS 宣告 `string`(靠 JS 弱型別吞)/ F13 FR-008 軟刪 user 回 `8888`、token 失敗回 `3333`(刻意分類、已驗收、非 token 存在性洩漏)/ `docker-compose.yml` 檔頭註解 stale(寫「5 service」實際 8 service)。

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

### W-FW1 `user-crud-wiring` brainstorm 拆出的 follow-up（2026-05-22）

| ID | 範疇 | 處理 | 備註 |
|---|---|---|---|
| W-FW1-N1 | base-web user `userRoles` 接線(讀 + 寫 + Casbin `g` rule 同步) | 獨立 feature(暫定 W-FW5 `user-role-assignment`) | `SystemManageUserOutput.user_roles` 目前硬寫 `vec![]`、rust 無「設定 user 的 roles」寫入路徑(`assign_users` 為 role→users 反方向);接它需 `sys_user_role` 讀+寫+Casbin `g` sync,為獨立 feature 體量。W-FW1 的 drawer `userRoles` 多選欄提交時由後端 transform DTO 忽略 |
| W-FW1-N2 | user password UX(改密碼 / 重設密碼流程 / drawer password 欄) | 獨立 follow-up | W-FW1 拍板 `addUser` 用後端固定預設密碼(drawer 無 password 欄、純接線);完整密碼 UX(建立時設密碼、admin 重設、user 自改)另案。`update_user` service 現況 `password` 設值未 hash(pre-existing TODO)、此 follow-up 一併處理 |

### W-FW2 `menu-crud-wiring` brainstorm 拆出的 follow-up（2026-05-22）

| ID | 範疇 | 處理 | 備註 |
|---|---|---|---|
| W-FW2-N1 | base-web menu `query` / `buttons` / `fixedIndexInTab` 持久化 | 獨立 follow-up | base-web menu modal 送出這 3 欄、後端 `MenuInput` DTO 無對應欄位、`SystemManageMenuOutput`(讀側)亦硬回 `None`;W-FW2 brainstorm Q1 拍板 thin wrapper、scope out — transform handler 不對映、提交時由 serde 忽略。完整持久化需擴 `sys_menu` schema(migration)+ entity + `MenuInput` + Output DTO 解除 `None` 硬寫,讀寫雙向接通,為獨立 feature 體量。modal 這 3 個 UI 欄在 W-FW2 落地後變擺設(編輯無持久化效果) |

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

**里程碑 entry 格式規則**：`已完成里程碑` 每條 feature entry 限**一行**，只記四項 —— 完成日期、outer / merge / worktree 的 commit SHA、`specs/<NNN>/` 連結、一句話功能描述（體例見 F4 / F3 等早期 entry）。**不抄**規格細節（user story 拆解、改動檔案清單、DTO / handler / helper 名、acceptance C-V 矩陣、R-Q、implement-time findings、Constitution Check 計數）—— 那些 `specs/<NNN>/` 已完整，且本檔 head section 每 session 被 SOP hook 注入，entry 膨脹即是固定 context 稅。跨 feature 後果（別的 feature 需知的 bug／待驗證項）寫進「跨 feature 的待驗證項」或「Deferred / future backlog」，不寫進里程碑 entry。
