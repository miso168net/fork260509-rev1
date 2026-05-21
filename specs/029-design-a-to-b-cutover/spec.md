# Feature Specification: F14 — design-a-to-b-cutover

**Feature Branch**: `029-design-a-to-b-cutover`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "F14 design-a-to-b-cutover — nestjs 退場、DESIGN-B(rust-only)形態正式生效。拔除 nginx TRANSITIONAL block + docker-compose nestjs service + W-FA3 build script;附帶清理 R3(1xxx error code 登記進 namespace)+ R4(補 cleanup_database_url.txt.example);設計文件收尾。per docs/superpowers/029-feature-design-a-to-b-cutover.md brainstorm doc(3 拍板點 + 途徑 2 選擇)。"

**Source**: [`docs/superpowers/029-feature-design-a-to-b-cutover.md`](../../docs/superpowers/029-feature-design-a-to-b-cutover.md)(brainstorming 2026-05-21 session、3 拍板點 + 途徑 2 選擇)

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../../docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §6.1 — F14 `design-a-to-b-cutover`:「nginx routing 從 nestjs 改 rust;docker-compose 移除 nestjs container;redis pub-sub 可選保留或拔除;TRANSITIONAL block 整段刪除」;完成標誌「DESIGN-B 形態正式生效」;依賴 F13、Phase 5(P5)
  - §6.2 — 拍板原則:「P5 在 P1-P4 全部穩定 + spec-kit feature 完成後才啟動;過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」— **F14 的 time gate**
  - §3.2 — nestjs 補位 endpoint:`POST /auth/refreshToken` 唯一一條,拔除策略「rust 補齊後 nginx 改路由、刪 TRANSITIONAL block」
  - §3.3 — 共識資源:「nestjs 退場後 rust 持續用同一 secret 簽 + 驗,零遷移成本」;`sys_tokens` 表「rust 接手 refresh handler,繼續用同表」
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../../docs/INTEGRATION-DESIGN-B-RUST-ONLY.md):F14 完成後正式生效的目標形態
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:Principle III「嚴版禁 Forward + 單一職責」、Principle IV「base 不改動邊界」、Principle V「漸進收縮」
- Track DESIGN-A 三件套(F14 拔除對象):W-FA1 `compose-nestjs-service`(merge `b095d55`)/ W-FA2 `nginx-track-a-transitional-block`(merge `c5b7840`)/ W-FA3 `cicd-nestjs-build-job`(merge `f23f38e`)
- 直接前置:F13 `rust-refresh-token-impl`(merge `4e9cf07`)— rust `POST /auth/refreshToken` endpoint
- pre-cutover 盤點:`INTEGRATION-CHECKLIST.md`「DESIGN-B cutover 前完整性盤點」— R1(SAFE)/ R3 / R4 來源

> ⚠️ **Time gate**:F14 屬 DESIGN-A §6.1 Phase 5(P5),依 §6.2「過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」後才應 implement。本 spec 為**設計先行**(spec/plan 先備);`/speckit-implement` 的實際落地時機由 time gate 決定。pre-cutover 盤點(28 feature 全 spec-complete、0 GAPS)即 time gate 想要的驗證證據。

**Scope summary**:F14 = **nestjs 退場、DESIGN-B(rust-only)形態正式生效** — DESIGN-A §6.1 Phase 5(P5)第二個、也是最後一個 feature。F13 已在 rust-api 補實作 `POST /auth/refreshToken`(rust 與 nestjs 兩端點共存);F14 把 nginx routing 從 nestjs 切到 rust、移除 nestjs container、刪除 Track DESIGN-A 三件套(W-FA1/W-FA2/W-FA3)留下的過渡結構,並附帶清理 pre-cutover 盤點抓到的 R3 / R4。

| 面向 | F14 deliverable |
|---|---|
| **nginx** | 刪除 `default.conf`(80+443 server)+ `default.conf.prod`(443 server)共 3 個 TRANSITIONAL block;`/api/auth/refreshToken` 自然落到 `location /api/` → rust |
| **docker-compose** | `docker-compose.yml` / `dev.yml` / `prod.yml` 移除 nestjs service;`track-a` profile 隨之消失 |
| **build script** | 刪除 `deploy/build-nestjs.sh`(W-FA3) |
| **R3** | `sys_user_error.rs` 的 5 個 `1xxx` legacy error code 登記進 `server` 的 `code.rs` F4 namespace 表(named constant、零行為改變) |
| **R4** | 新增 `deploy/secrets/cleanup_database_url.txt.example` |
| **doc 收尾** | `CLAUDE.md` §5.2/§5.2.1 + `deploy/front-nginx/README.md` 清理;DESIGN-A doc 標註已被取代;DESIGN-B doc 提為現行設計;`INTEGRATION-CHECKLIST.md` 更新 |

**Commit 模式**(F14 固定):**兩段式** commit(per CLAUDE.md §6.1、因納入 R3 而動 rust-api worktree):rust-api worktree 1 commit(R3 — `code.rs` + `sys_user_error.rs`)+ outer 1 commit(nginx + docker-compose×3 + 刪 build script + R4 + `CLAUDE.md` + 3 份 design doc + spec docs)+ merge `--no-ff` + SHA fill follow-up。**無 DB migration、無 base-web 改動、無新 secret**。

**範疇外**:
- ❌ 不改 rust refresh endpoint 業務邏輯(F13 已做、cutover 只切 routing)
- ❌ 不改 `base-web/` SPA src / `.env`(R1 已證 base-web 吃 rust `code:0`、無需動)
- ❌ 不刪 `fork260509-soybean-admin-nestjs/` 源碼目錄(gitignored、留歷史參考、只停止使用)
- ❌ 不刪 `refresh_token_secret` secret(rust `APP_JWT_REFRESH_SECRET_FILE` 仍用)
- ❌ 不拔 Casbin redis pub-sub channel `casbin:policy:invalidate`(W-F11 已改 rust-to-rust、非 nestjs 專用)
- ❌ 無 DB migration、不改 DB schema
- ❌ R3 不修 F3 Scenario 9 軟刪 user 登入碼、不重構 auth-failure 碼子段(只登記進 namespace)
- ❌ R2(F5.1 登入失敗無 audit)不納入 — 屬獨立 audit 完整性議題
- ❌ logout / 主動 token revocation endpoint、observability(W-F12/13/14)、acme 真實 cert(W-F6b)

## Clarifications

### Session 2026-05-21(brainstorming 階段拍板、3 拍板點 + 1 途徑選擇)

- **Q1 (brainstorm)**: pre-cutover 盤點抓到的 R3 / R4 兩個 cleanup 項,要不要納入 F14?→ **A:R3 + R4 都納入**。F14 一次清掉兩者;代價是 R3 動 rust-api worktree,F14 從 outer-only 單段 commit 變兩段式 commit。
- **Q2 (brainstorm)**: R3 的 5 個 `1xxx` legacy code 要做到什麼程度?→ **A:最小 — 登記進 namespace**。把 5 個 `1xxx` 常數正式納入 `code.rs` namespace 表、`sys_user_error.rs` 改引用之;runtime 值與行為完全不變、base-web 零影響,只消除「游離於 F4 namespace 外」的違反。不修 F3 Scenario 9、不重構 auth-failure 碼。
- **Q3 (brainstorm)**: F14 cutover 的驗收深度?→ **A:curl 載重 + CDP best-effort**。`curl`-through-nginx(完整 login→refresh 循環 + dev stack 無 nestjs healthy)為載重驗收;base-web CDP SPA silent-refresh smoke 為 best-effort(Edge debug port 不通則 deferred manual-eyeball、比照 F7 C-V10 慣例)。
- **途徑選擇 (brainstorm)**: 「DESIGN-B 正式生效」做到哪個程度?→ **途徑 2 — 拔除 + 設計文件收尾**。F14 除機械拔除,另更新 DESIGN-A doc 標註已被取代、DESIGN-B doc 提為現行設計、`INTEGRATION-CHECKLIST.md` 更新。

- **C1 (`/speckit-analyze`)**: F14 納入 R3(改 rust-api `code.rs` + `sys_user_error.rs`)與 Constitution Principle V line 87「DESIGN-A→DESIGN-B 遷移路徑 … 應用層 code 零改動」有 tension。`/speckit-analyze` 列為 C1(HIGH)。經 user 於 2026-05-21 **明示裁定:接受 R3 留在 F14** — R3 為零行為改變的 error code namespace 登記、非業務邏輯,且 cutover 本體(FR-001~FR-012)仍 0 應用層改動;line 87 描述的是遷移本身的範圍,不禁止同一 feature 內附帶 code-hygiene 修補(比照 F12 D1 「user 明示裁定接受」處理模式)。**C1 resolved**。

### User Story 1 — nestjs 退場、refresh 由 rust 經 nginx 服務(Priority: P1)🎯 MVP

系統運維者要把整合堆疊從 DESIGN-A(rust-api + nestjs 共存)收斂成 DESIGN-B(rust-only)。F14 之前,`/api/auth/refreshToken` 經 nginx 的 TRANSITIONAL block 路由到 nestjs container;F14 把該 block 整段刪除,流量自然落到既有 `location /api/` → rust-api(F13 已實作該端點)。同時 nestjs container 從 docker-compose 各檔移除、不再隨 stack 啟動。完成後,base-web SPA 的 silent token refresh 經 nginx 直接由 rust 處理,運行 stack 不再含 nestjs。

**Why this priority**: F14 的核心 deliverable,也是 DESIGN-A §6.1 Phase 5「DESIGN-A→DESIGN-B 遷移」的收尾。沒有它,系統永遠停在過渡共存形態、nestjs 無法退場、DESIGN-B(rust-only)無法達成。

**Independent Test**: 刪除 nginx TRANSITIONAL block + 移除 docker-compose nestjs service 後,起 dev stack(不含 nestjs)→ `nginx -t` syntax OK、stack 6 service healthy → 經 front-nginx(`:11080`)`/api/auth/login` 取 token → `/api/auth/refreshToken` 換發新 token pair、回 rust F4 envelope `code:0` → psql 確認 `sys_tokens` 輪替正確。

**Acceptance Scenarios**:

1. **Given** F14 已刪除 nginx TRANSITIONAL block,**When** 經 front-nginx 呼叫 `POST /api/auth/refreshToken`,**Then** 請求由 rust-api 處理(非 nestjs)、回 HTTP 200 + F4 envelope `code:0` + 新 token pair。
2. **Given** F14 已從 docker-compose 移除 nestjs service,**When** 起 dev stack,**Then** 啟動的 service 不含 nestjs、其餘 service 全 healthy。
3. **Given** F14 已刪除 TRANSITIONAL block,**When** 執行 `nginx -t`,**Then** 設定語法正確、nginx 正常啟動,無 nestjs upstream 殘留。
4. **Given** F14 完成,**When** 以 `--profile track-a` 啟動 stack,**Then** 不再帶起 nestjs container(profile 已無成員)。
5. **Given** 一組由 rust-api 經 nginx 登入取得的 refresh token,**When** base-web SPA 在 access token 過期後自動 silent refresh,**Then** refresh 成功、使用者工作階段延續(不被登出)。

### User Story 2 — legacy error code 收進 F4 namespace(Priority: P2)

開發者維護 rust-api 的錯誤碼時,應能在單一 namespace 表(`code.rs`)看到所有 business code。F14 之前,`sys_user_error.rs` 的 5 個 `1xxx` code 獨立定義、游離於 F4 namespace 表外。F14 把這 5 個常數登記進 `code.rs`,`sys_user_error.rs` 改引用之 —— 數值與行為完全不變,只是讓它們成為 namespace 正式成員。

**Why this priority**: pre-cutover 盤點抓到的 F4 FR-005 / SC-006 違反清理;P2,不阻 cutover 本體,但在 F14 一併清掉。

**Independent Test**: grep `code.rs` 確認新增 5 個對應 1001–1005 的 named constant;grep `sys_user_error.rs` 確認改引用常數、無殘留硬編數字;rust-api image rebuild build OK;登入失敗等路徑回傳的 business code 數值與改動前一致。

**Acceptance Scenarios**:

1. **Given** F14 已登記 legacy code,**When** 檢查 `code.rs`,**Then** 含 5 個對應 1001–1005 的 named constant。
2. **Given** F14 已改 `sys_user_error.rs`,**When** 檢查其定義,**Then** 5 個 error 引用 `code.rs` 常數、無硬編 `1xxx` 數字。
3. **Given** F14 的 R3 改動,**When** 觸發任一 user error 路徑,**Then** 回傳的 business code 數值與 F14 之前完全相同(零行為改變)。

### User Story 3 — secret 範本補齊 + 設計文件狀態同步(Priority: P3)

新機器的維運者 clone repo 後,`deploy/secrets/` 應為每個 secret 都有 `.txt.example` 範本。F14 之前缺 `cleanup_database_url.txt.example`。同時,讀設計文件的人應能一眼分辨 DESIGN-A(已被取代)與 DESIGN-B(現行)。F14 補上範本、並在兩份設計文件檔頭標註狀態。

**Why this priority**: 維運便利性 + 文件狀態一致性;P3,純文件 / 範本補齊。

**Independent Test**: 確認 `deploy/secrets/cleanup_database_url.txt.example` 存在且 git-tracked;確認 DESIGN-A doc 檔頭有「已被 DESIGN-B 取代」註記、DESIGN-B doc 檔頭有「現行設計」註記;`INTEGRATION-CHECKLIST.md` F14 row 與 Current Focus 更新。

**Acceptance Scenarios**:

1. **Given** F14 完成,**When** 檢查 `deploy/secrets/`,**Then** 每個 secret 都有對應 `.txt.example`(含新增的 `cleanup_database_url.txt.example`)。
2. **Given** F14 完成,**When** 讀 DESIGN-A / DESIGN-B 設計文件檔頭,**Then** 可分辨 DESIGN-A 已被取代、DESIGN-B 為現行設計。

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | 刪 TRANSITIONAL block 後 nginx 啟動 | `nginx -t` syntax OK;`/api/auth/refreshToken` 由 `location /api/` 接手 → rust;無孤兒 directive |
| E-2 | 以 `--profile track-a` 啟動 stack | 不帶起 nestjs(service 已移除、profile 無成員);其餘 service 正常 |
| E-3 | 既有運行中的 nestjs container(F14 deploy 前殘留) | F14 deploy 時 `docker compose up` 不再含 nestjs;舊 container 由運維 `down` 清掉 |
| E-4 | 經 nginx 呼叫 `/api/auth/refreshToken` | 路由到 rust、回 rust F4 envelope(`code:0` 成功);base-web 成功判定 `String(code)==="0"` 通過(per R1) |
| E-5 | F14 需回滾 | `git revert` F14 commit + 重啟 stack → 回 DESIGN-A 共存形態(nestjs service / TRANSITIONAL block 復原);nestjs image 與 fork 源碼目錄仍在本機 |
| E-6 | `refresh_token_secret` secret 是否被誤刪 | 保留 — rust-api service 的 `APP_JWT_REFRESH_SECRET_FILE` 仍引用;F14 只移除 nestjs service 對它的引用 |

## Requirements *(mandatory)*

### Functional Requirements

**A. nginx TRANSITIONAL block 拔除**

- **FR-001**: F14 MUST 刪除 `deploy/front-nginx/conf.d/default.conf` 內 2 個 TRANSITIONAL block(80 server + 443 server)。
- **FR-002**: F14 MUST 刪除 `deploy/front-nginx/conf.d/default.conf.prod` 內 1 個 TRANSITIONAL block(443 server)。
- **FR-003**: 刪除後 `/api/auth/refreshToken` MUST 由既有 `location /api/`(`proxy_pass` 到 rust upstream)接手 — 不再有 exact-match block 路由到 nestjs。
- **FR-004**: F14 MUST 移除 `deploy/front-nginx/README.md` 內 nestjs / TRANSITIONAL 相關說明段落。
- **FR-005**: 刪除 TRANSITIONAL block 後,nginx 設定 MUST 通過 `nginx -t` 語法檢查、nginx MUST 能正常啟動(無遺留依賴 nestjs 的 directive)。

**B. docker-compose nestjs service 移除**

- **FR-006**: F14 MUST 從 `docker-compose.yml` 移除整個 `nestjs:` service block。
- **FR-007**: F14 MUST 從 `docker-compose.dev.yml` 移除 nestjs service 的 host port entry。
- **FR-008**: F14 MUST 從 `docker-compose.prod.yml` 移除 nestjs service override。
- **FR-009**: nestjs service 移除後,`track-a` profile MUST 不再有任何成員(profile 自然失效)。
- **FR-010**: F14 MUST 保留 top-level `secrets:` 內的 `refresh_token_secret` 條目(rust-api service 仍引用);F14 MUST 僅移除 `nestjs` service 對 secret 的 `secrets:` 引用,不移除 secret 本身。
- **FR-011**: F14 MUST 修正 `docker-compose.yml` 檔頭已過時的 service 數量註解。

**C. W-FA3 build script 移除**

- **FR-012**: F14 MUST 刪除 `deploy/build-nestjs.sh`。

**D. R3 — legacy error code 登記進 F4 namespace**

- **FR-013**: F14 MUST 在 `server` 的 `code.rs`(F4 namespace 表)新增 5 個 named constant,分別對應 `sys_user_error.rs` 既有的 1001 / 1002 / 1003 / 1004 / 1005,命名對齊既有 `CODE_*` 慣例。
- **FR-014**: F14 MUST 改 `sys_user_error.rs`,使 5 個 error 引用 `code.rs` 的 named constant,不再硬編 `1xxx` 數字。
- **FR-015**: R3 改動 MUST 為零行為改變 — `sys_user_error.rs` 對外回傳的 business code 數值與 F14 之前完全相同。

**E. R4 — secret 範本補齊**

- **FR-016**: F14 MUST 新增 `deploy/secrets/cleanup_database_url.txt.example`,格式對齊既有 `.txt.example`(單行 placeholder、無註解),並為 git-tracked(`.gitignore` 既有 `!/deploy/secrets/*.txt.example` 規則涵蓋)。

**F. doc 清理 + 設計文件收尾**

- **FR-017**: F14 MUST 清理 `CLAUDE.md` §5.2(port 表移除 nestjs `:11082` 與 track-a 行)與 §5.2.1(移除 `--profile track-a` 啟動變體與 `build-nestjs.sh` 段)內所有 nestjs / track-a 引用。
- **FR-018**: F14 MUST 在 `docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md` 檔頭加註「已被 DESIGN-B 取代、保留作歷史設計紀錄」。
- **FR-019**: F14 MUST 在 `docs/INTEGRATION-DESIGN-B-RUST-ONLY.md` 檔頭加註「現行設計(F14 cutover 後生效)」。
- **FR-020**: F14 MUST 更新 `docs/INTEGRATION-CHECKLIST.md`(F14 row、Current Focus、完成里程碑、R3 / R4 待辦項勾掉)。

**G. 保留 / 範疇紀律**

- **FR-021**: F14 MUST NOT 改動 Casbin redis pub-sub channel `casbin:policy:invalidate`(W-F11 rust-to-rust、非 nestjs 專用)。
- **FR-022**: F14 MUST NOT 移除 `refresh_token_secret` secret 條目或其 `.txt.example`。
- **FR-023**: F14 MUST NOT 改動 rust refresh endpoint 業務邏輯、`base-web/` 任何 file、DB schema、或新增 migration。
- **FR-024**: F14 MUST NOT 刪除 `fork260509-soybean-admin-nestjs/` 源碼目錄(僅停止使用)。
- **FR-025**: R3 MUST NOT 修改 F3 Scenario 9 的軟刪 user 登入碼、MUST NOT 重構 auth-failure 碼子段(只做 namespace 登記)。

**H. commit 模式 / 驗收**

- **FR-026**: F14 commit 模式 = 兩段式(per CLAUDE.md §6.1):rust-api worktree 1 commit(R3)+ outer 1 commit(其餘)+ merge `--no-ff` + SHA fill follow-up。
- **FR-027**: F14 acceptance MUST 用 inline bash(`curl` + `psql` + `docker compose exec`),curl-through-nginx 為載重驗收;base-web CDP SPA silent-refresh smoke 為 best-effort(Edge debug port 不通則 deferred manual-eyeball);不新建 deploy script、不引入 e2e test framework。
- **FR-028**: F14 完成 = DESIGN-A §6.1 全 14 個 application feature(F1–F14)收尾、DESIGN-B 形態正式生效。

### Key Entities

- **TRANSITIONAL block** — nginx config 內以 `>>>>> TRANSITIONAL BEGIN ... <<<<< TRANSITIONAL END` marker 包覆的區塊(W-FA2 建立),內含 `location = /api/auth/refreshToken` 路由到 nestjs。F14 將其整段刪除。
- **nestjs service** — docker-compose 內的 nestjs container 定義(W-FA1 建立、`profiles: ["track-a"]`)。F14 從 3 個 compose 檔移除。
- **`1xxx` legacy error code** — `sys_user_error.rs` 定義的 5 個 user-domain 錯誤碼(1001–1005),F14 之前游離於 F4 `code.rs` namespace 外。F14 將其登記進 namespace、數值不變。
- **`cleanup_database_url` secret 範本** — `deploy/secrets/` 下唯一缺少的 `.txt.example`;F14 補齊。
- **設計文件** — `INTEGRATION-DESIGN-A` / `INTEGRATION-DESIGN-B` 兩份;F14 在檔頭標註取代 / 現行狀態。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: F14 落地後,經 front-nginx 呼叫 `POST /api/auth/refreshToken` 由 rust-api 處理、回 F4 envelope `code:0` + 新 token pair(不再經 nestjs)。
- **SC-002**: F14 落地後,起 dev stack 啟動的 service 不含 nestjs、其餘 service 全 healthy。
- **SC-003**: F14 落地後,`grep TRANSITIONAL` 對 `default.conf` 與 `default.conf.prod` 結果為 0;`nginx -t` 語法檢查通過。
- **SC-004**: F14 落地後,以 `--profile track-a` 啟動不再帶起 nestjs container。
- **SC-005**: F14 落地後,`code.rs` 含 5 個對應 1001–1005 的 named constant;`sys_user_error.rs` 引用之、無硬編 `1xxx`;任一 user error 路徑回傳的 business code 數值與 F14 之前一致。
- **SC-006**: F14 落地後,`deploy/secrets/` 內每個 secret 皆有對應 `.txt.example`。
- **SC-007**: F14 落地後,`deploy/build-nestjs.sh` 不存在。
- **SC-008**: F14 落地後,DESIGN-A 設計文件檔頭標註已被取代、DESIGN-B 設計文件檔頭標註現行設計。
- **SC-009**: F14 不動 `base-web/`(`git diff` 無輸出)、不動 `fork260509-soybean-admin-nestjs/` 源碼、無新 DB migration、不改 DB schema。
- **SC-010**: F14 不移除 `refresh_token_secret` secret、不改 Casbin redis pub-sub channel。
- **SC-011**: F14 完成里程碑 commit 數 = 兩段式(rust-api worktree 1 commit + outer 1 commit + merge + SHA fill follow-up)。
- **SC-012**: `docs/INTEGRATION-CHECKLIST.md` 的 F14 row、Current Focus 獲更新,R3 / R4 待辦項勾掉。

## Assumptions

- **A-001**: F13 已使 rust `POST /auth/refreshToken` 就緒(merge `4e9cf07`);F14 只切 routing、不改 rust endpoint。
- **A-002**: R1 已查證 — base-web HTTP 層成功判定為 `String(code) === "0"`,rust 回 `code:0` 通過;F14 cutover 無 base-web 相容性風險(過渡期經 nestjs 的 `code:200` 反而是 base-web 判 fail 的)。
- **A-003**: W-FA2 的 TRANSITIONAL block 以 machine-deletable marker 包覆(`>>>>> TRANSITIONAL BEGIN` / `<<<<< TRANSITIONAL END`),可乾淨整段刪除。
- **A-004**: W-FA1 的 nestjs service 以 `profiles: ["track-a"]` 隔離;`track-a` profile 除 nestjs 外無其他成員。
- **A-005**: `refresh_token_secret` secret 由 rust-api(`APP_JWT_REFRESH_SECRET_FILE`)與 nestjs 共用;F14 後僅 rust-api 引用,secret 條目保留。
- **A-006**: Casbin redis pub-sub channel 經 W-F11 已成 rust-to-rust(rust 既 publish 又 subscribe),非 nestjs 專用;DESIGN-A §3.3 當初的「可選拔除」因 W-F11 已 moot。
- **A-007**: `sys_user_error.rs` 的 5 個 `1xxx` 為現役錯誤碼;R3 為純 namespace 登記、不改數值,故無 base-web 影響(base-web 對這些碼無特殊 handler)。
- **A-008**: F14 屬 DESIGN-A §6.1 Phase 5(P5)、有 time gate;本 spec 為設計先行。

## Dependencies

### Inbound(本 feature 依賴)

- **F13** `rust-refresh-token-impl`(merge `4e9cf07`):rust `POST /auth/refreshToken` endpoint。✅
- **W-FA1** `compose-nestjs-service`(merge `b095d55`)/ **W-FA2** `nginx-track-a-transitional-block`(merge `c5b7840`)/ **W-FA3** `cicd-nestjs-build-job`(merge `f23f38e`):F14 的拔除對象(三件套 Track DESIGN-A 結構)。✅
- **W-F11** `rust-horizontal-scaling`(merge `d2d4c4c`):使 Casbin redis pub-sub 成 rust-to-rust,讓 F14 可保留該 channel。✅
- pre-cutover 盤點(`INTEGRATION-CHECKLIST.md`):R1 / R3 / R4 來源。✅

### Outbound(本 feature 解鎖 / 收尾)

- F14 完成 = **DESIGN-A §6.1 全 14 個 application feature(F1–F14)收尾、DESIGN-B(rust-only)形態正式生效**。後續為非 DESIGN-A §6.1 範疇:observability(W-F12/W-F13/W-F14)、W-F6b acme 真實 cert。

### Follow-up(F14 範疇外、留後續)

- R2(F5.1 登入失敗無 audit)— 獨立 audit 完整性議題。
- `project_nestjs_transitional` memory 更新為「nestjs 已退場」(非 git scope、F14 完成後順手處理)。
