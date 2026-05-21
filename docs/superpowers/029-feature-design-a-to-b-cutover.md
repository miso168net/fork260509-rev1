# F14 — design-a-to-b-cutover

**Date**: 2026-05-21
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-21(3 拍板點 + 1 途徑選擇;F13 `rust-refresh-token-impl` 落地後啟動 DESIGN-A §6.1 Phase 5(P5)第二個、也是最後一個 feature — DESIGN-A→DESIGN-B 遷移收尾)

> ⚠️ **Time gate**:F14 屬 DESIGN-A §6.1 Phase 5(P5),依 §6.2 拍板原則「過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」後才應 implement。本 brainstorm 為**設計先行**(design ahead of gate);`/speckit-specify`→`implement` 的實際落地時機由 time gate 決定。盤點(`INTEGRATION-CHECKLIST.md`「DESIGN-B cutover 前完整性盤點」)即 time gate 想要的驗證證據:28 feature 全 spec-complete、0 GAPS。

---

## Scope summary

F14 = **nestjs 退場、DESIGN-B(rust-only)形態正式生效**。F13 已在 rust-api 補實作 `POST /auth/refreshToken`(rust 與 nestjs 兩端點共存、F13 階段以直連 rust port 驗證);F14 把 nginx routing 從 nestjs 切到 rust、移除 nestjs container、刪除 Track DESIGN-A 三件套(W-FA1/W-FA2/W-FA3)留下的過渡結構。

DESIGN-A §6.1 對 F14 的字面定義:「nginx routing 從 nestjs 改 rust;docker-compose 移除 nestjs container;redis pub-sub 可選保留或拔除;TRANSITIONAL block 整段刪除」。

| 面向 | 內容 |
|---|---|
| **交付** | nestjs 退出運行 stack — nginx TRANSITIONAL block 刪除、docker-compose nestjs service 移除、W-FA3 build script 刪除、相關 doc 清理 |
| **routing** | `/api/auth/refreshToken` 不再有 exact-match TRANSITIONAL block → 自然落到 `location /api/` → `rust_api` upstream(R1 已靜態證明 base-web 吃 rust 的 `code:0`) |
| **附帶清理** | R3(1xxx legacy error code 登記進 F4 namespace)+ R4(補 `cleanup_database_url.txt.example`)— 均來自 pre-cutover 盤點 |
| **設計文件收尾** | DESIGN-A doc 標註已被 DESIGN-B 取代;DESIGN-B doc 提為現行設計;`INTEGRATION-CHECKLIST.md` 更新(途徑 2) |
| **保留** | Casbin redis pub-sub channel、`refresh_token_secret` secret 本身、rust refresh endpoint、base-web、DB / migration — 皆不動 |

**Commit 模式**(F14 固定,因納入 R3 而為兩段式):
- **兩段式** commit(per CLAUDE.md §6.1):rust-api worktree 1 commit(R3 — `code.rs` + `sys_user_error.rs`)+ outer 1 commit(nginx + docker-compose×3 + 刪 build script + R4 + CLAUDE.md + 3 份 design doc + spec docs)+ merge `--no-ff` + SHA fill follow-up。
- **無 DB migration、無 base-web 改動、無新 secret**。

---

## Authoritative parents

- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md):
  - §6.1 — F14 `design-a-to-b-cutover`:「nginx routing 從 nestjs 改 rust;docker-compose 移除 nestjs container;redis pub-sub 可選保留或拔除;TRANSITIONAL block 整段刪除」;完成標誌「DESIGN-B 形態正式生效」;依賴「F13」、Phase 5(P5)
  - §6.2 — 拍板原則:「P5 在 P1-P4 全部穩定 + spec-kit feature 完成後才啟動;過渡橋 F10 至少在 DESIGN-A 形態下完整運行 N 週驗證」— **F14 的 time gate**
  - §3.2 — nestjs 補位 endpoint:`POST /auth/refreshToken` 唯一一條,拔除策略「rust 補齊後 nginx 改路由、刪 TRANSITIONAL block」
  - §3.3 — 共識資源:JWT 簽章「nestjs 退場後 rust 持續用同一 secret 簽 + 驗,零遷移成本」;`sys_tokens` 表「rust 接手 refresh handler,繼續用同表」;Casbin redis pub-sub「nestjs 退場後 channel 無訂閱者,rust 可選保留 publish 或一併拔除」
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md):F14 完成後正式生效的目標形態
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:
  - Principle III「嚴版禁 Forward + 單一職責」— F14 拔除 nestjs 後,所有 enforcement 由 rust 單一負責
  - Principle V「漸進收縮」— F14 是 DESIGN-A→DESIGN-B 收縮的最後一步
  - Principle IV「base 不改動邊界」— F14 不動 base-web src / `.env`
- Track DESIGN-A 三件套(F14 拔除對象):
  - W-FA1 `compose-nestjs-service`(merge `b095d55`)— nestjs docker-compose service(`profiles: ["track-a"]`)
  - W-FA2 `nginx-track-a-transitional-block`(merge `c5b7840`)— nginx TRANSITIONAL block(machine-deletable marker)
  - W-FA3 `cicd-nestjs-build-job`(merge `f23f38e`)— `deploy/build-nestjs.sh`
- 直接前置 feature:F13 `rust-refresh-token-impl`(merge `4e9cf07`)— rust `POST /auth/refreshToken` endpoint
- pre-cutover 盤點:`INTEGRATION-CHECKLIST.md`「DESIGN-B cutover 前完整性盤點」— 28 feature spec 對照 review、R1(SAFE)/ R3 / R4 來源
- F8 / W-F11 / F12 / F13 implement-time pattern「兩段式 commit、curl + psql + docker exec acceptance、無 e2e framework」— F14 沿用

---

## 既有現況(brainstorm 階段確認、2026-05-21)

**nestjs 在 outer 追蹤檔的引用面**(`grep nestjs|track-a`):

| 檔案 | 引用內容 |
|---|---|
| `docker-compose.yml` | `nestjs:` service block(`profiles: ["track-a"]`、entrypoint sh wrapper、4 secret ref);top-level `secrets:` 含 `refresh_token_secret`(nestjs + rust-api 共用) |
| `docker-compose.dev.yml` | nestjs service `ports: "127.0.0.1:11082:9528"` |
| `docker-compose.prod.yml` | nestjs service override(`restart: always`) |
| `deploy/front-nginx/conf.d/default.conf` | 2 個 TRANSITIONAL block(80 server + 443 server),`>>>>> TRANSITIONAL BEGIN — DESIGN-A → DESIGN-B 拔除點(per W-FA2) <<<<<` / `<<<<< TRANSITIONAL END >>>>>` marker 包覆 |
| `deploy/front-nginx/conf.d/default.conf.prod` | 1 個 TRANSITIONAL block(443 server) |
| `deploy/front-nginx/README.md` | nestjs / TRANSITIONAL 說明文字 |
| `CLAUDE.md` | §5.2 port 表 nestjs `:11082` 列 + track-a 行;§5.2.1 `--profile track-a` 啟動變體 + `build-nestjs.sh` 段 |
| `deploy/build-nestjs.sh` | W-FA3 的 nestjs image build script(整檔) |

**R3 現況**:`server` 的 `sys_user_error.rs` 定義 5 個 `1xxx` error code(1001 UserNotFound / 1002 WrongPassword / 1003 AuthenticationFailed / 1004 UsernameAlreadyExists / 1005 InvalidUserStatus),游離於 F4 的 `code.rs` namespace 表外 — 違反 F4 FR-005(所有 code 來自 namespace)/ SC-006(0 magic number)。

**R4 現況**:`deploy/secrets/` 有 7 個 `.txt.example`(jwt_secret / database_url / redis_url / postgres_password / redis_password / acme_email / refresh_token_secret),**唯獨缺** `cleanup_database_url.txt.example`(F12 引入 `cleanup_database_url` secret 時未補範本)。

**R1 結論(已查證、SAFE)**:base-web HTTP 層成功判定為 `String(response.data.code) === VITE_SERVICE_SUCCESS_CODE`(`=0`);rust F13 回 `code:0` → success ✓、nestjs 回 `code:200` → fail。即過渡期經 nestjs 的 SPA silent refresh 實際是壞的,F14 切到 rust 反而修復。→ F14 無此 cutover 阻擋風險。

**Casbin redis pub-sub**:W-F11 已讓 `casbin:policy:invalidate` channel 變 rust-to-rust(rust 既 publish 又 subscribe、供水平擴展多 instance 一致性),非 nestjs 專用。DESIGN-A §3.3 當初寫的「nestjs 退場後 channel 無訂閱者、可選拔除」因 W-F11 已 moot — **F14 保留不動**。

---

## Clarifications(brainstorm 2026-05-21、3 拍板點 + 1 途徑選擇)

- **Q1 (brainstorm)**: pre-cutover 盤點抓到的 R3 / R4 兩個 cleanup 項,要不要納入 F14?→ **A:R3 + R4 都納入**。F14 一次清掉兩者。代價:R3 動 rust-api worktree,F14 從 outer-only 單段 commit 變兩段式 commit;範圍與風險都比純 cutover 大。理由:cutover 是 DESIGN-A 收尾的最後一步,順手把盤點抓到的兩個違反 / 缺漏一併清理,避免另開 feature。

- **Q2 (brainstorm)**: R3 的 5 個 `1xxx` legacy code 要做到什麼程度?→ **A:最小 — 登記進 namespace**。把 5 個 `1xxx` 常數正式納入 `code.rs` namespace 表(named constant)、`sys_user_error.rs` 改引用之。**runtime 值與行為完全不變、base-web 零影響**,只消除「游離於 F4 namespace 外」這個違反。對比「額外修 F3 Scenario 9 軟刪 user 登入碼」(behavioral 改動、需驗 base-web)與「完整重構 auth-failure 碼子段」(範圍最大)— 兩者都不做。F3 Scenario 9 的 1001-vs-6001 差異盤點判定 functionally benign,F14 不碰。

- **Q3 (brainstorm)**: F14 cutover 的驗收深度?→ **A:curl 載重 + CDP best-effort**。`curl`-through-nginx(`:11080/api/auth/refreshToken` 完整 login→refresh 循環 + dev stack 無 nestjs healthy)為**載重驗收**;base-web CDP SPA silent-refresh smoke 為 **best-effort** — Edge debug port 不通則記為 deferred manual-eyeball(比照 F7 C-V10 慣例)。理由:R1 已靜態證明 base-web 相容,curl 走的就是 SPA 同一條 nginx 路徑、功能正確性已覆蓋;CDP 為確認性、非 go/no-go gate。

- **途徑選擇 (brainstorm)**: 「DESIGN-B 正式生效」做到哪個程度?→ **途徑 2 — 拔除 + 設計文件收尾**。F14 除了機械拔除,另更新 `INTEGRATION-DESIGN-A-RUST-NESTJS.md` 標註已被 DESIGN-B 取代、把 `INTEGRATION-DESIGN-B-RUST-ONLY.md` 提為現行設計、更新 `INTEGRATION-CHECKLIST.md`。對比途徑 1(純機械拔除、設計文件留原樣)。理由:讓設計文件狀態與實際形態一致,避免讀者誤把 DESIGN-A doc 當現行設計。

---

## 設計(途徑 2 — 拔除 + 設計文件收尾)

### 1. R3 — 1xxx legacy code 登記進 namespace(rust-api worktree、Stage 1 commit)

| 檔案 | 改動 |
|---|---|
| `server` 的 `code.rs`(F4 namespace 表) | 新增 5 個 named constant 對應 1001–1005(命名比照既有 `CODE_*` 慣例,如 `CODE_USER_NOT_FOUND` 等;exact 命名留 `/speckit-plan` Phase 0、見 R-Q3) |
| `sys_user_error.rs` | 5 個 `1xxx` 改引用 `code.rs` 常數,不再硬編數字 |

**runtime 值不變、行為零改變** — 純粹消除 F4 FR-005 / SC-006 違反。`sys_user_error.rs` 對外回的 business code 數值與改動前完全相同。

### 2. nginx TRANSITIONAL block 拔除(outer、Stage 2 commit)

- `deploy/front-nginx/conf.d/default.conf`:刪除 2 個 TRANSITIONAL block(80 server + 443 server)。
- `deploy/front-nginx/conf.d/default.conf.prod`:刪除 1 個 TRANSITIONAL block(443 server)。
- 刪法:W-FA2 設計的 machine-deletable marker → `sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'`(per W-FA2 spec US4.3 已驗證的刪除 pattern)。
- 刪後 `/api/auth/refreshToken`(原 exact-match `location =`)自然落到 `location /api/` → `proxy_pass http://rust_api/`(`/api/` 前綴 strip)→ rust。
- `deploy/front-nginx/README.md`:移除 nestjs / TRANSITIONAL 相關說明段落。
- W-F11 在 `default.conf.prod` http context 加的 top-level `resolver`(供 `upstream rust_api ... resolve`)**保留** — 與 nestjs 無關。

### 3. docker-compose nestjs service 移除(outer、Stage 2 commit)

- `docker-compose.yml`:移除整個 `nestjs:` service block;`track-a` profile 隨之失去唯一成員、自然消失。**top-level `secrets:` 內的 `refresh_token_secret` 條目保留**(rust-api service 的 `APP_JWT_REFRESH_SECRET_FILE` 仍引用)— F14 只移除 nestjs service 對它的 `secrets:` 引用。檔頭 stale 註解(「5 service stack」實際 service 數)一併修正。
- `docker-compose.dev.yml`:移除 nestjs service 的 `ports:` entry(`127.0.0.1:11082:9528`)。
- `docker-compose.prod.yml`:移除 nestjs service override(`restart: always`)。

### 4. W-FA3 build script 移除(outer、Stage 2 commit)

- 刪除 `deploy/build-nestjs.sh`。

### 5. R4 — 補 secret 範本(outer、Stage 2 commit)

- 新增 `deploy/secrets/cleanup_database_url.txt.example`(內容比照其他 `.txt.example` 慣例 — 單行 placeholder、無註解;`.gitignore` 的 `!/deploy/secrets/*.txt.example` 規則已涵蓋追蹤)。

### 6. doc 清理 + 設計文件收尾(outer、Stage 2 commit)

- `CLAUDE.md`:§5.2 port 表移除 nestjs `:11082` 列 + track-a 相關行;§5.2.1 移除 `--profile track-a` 啟動變體 + `build-nestjs.sh` 段;§5.2「目前現況」3 種啟動模式描述移除 DESIGN-A track-a 變體。
- `INTEGRATION-DESIGN-A-RUST-NESTJS.md`:檔頭加註「**已被 DESIGN-B 取代(F14 cutover 完成);本檔保留作歷史設計紀錄**」(實際完成日期於 implement 階段填入)。
- `INTEGRATION-DESIGN-B-RUST-ONLY.md`:檔頭加註「**現行設計(F14 cutover 後生效)**」。
- `INTEGRATION-CHECKLIST.md`:F14 row 推進、Current Focus 更新(DESIGN-A §6.1 全 14 feature 完成、DESIGN-B 生效)、加 F14 完成里程碑、R3 / R4 待辦項勾掉。
- `project_nestjs_transitional` memory:F14 完成後順手更新為「nestjs 已於 F14 退場」(非 git scope、不在 commit 內)。

### 7. 保留不動

- Casbin redis pub-sub channel `casbin:policy:invalidate`(W-F11 rust-to-rust、非 nestjs 專用)。
- `refresh_token_secret` secret 條目本身 + `deploy/secrets/refresh_token_secret.txt.example`(rust 用)。
- rust refresh endpoint(F13 已做)、`/auth/login`、所有 rust-api 業務邏輯。
- `base-web/` 任何檔、DB schema、migration。
- `fork260509-soybean-admin-nestjs/` 源碼目錄 — gitignored,留作歷史參考;F14 只停止使用、不刪目錄。

### 8. Data flow(cutover 後)

```
base-web SPA  ─ POST /api/auth/refreshToken ─▶  front-nginx
                                                  │  location /api/  (TRANSITIONAL block 已刪)
                                                  ▼
                                            rust_api upstream  ─▶  rust POST /auth/refreshToken (F13)
                                                  │  /api/ 前綴 strip
                                                  ▼
                                            回 F4 envelope { code:0, data:{token, refreshToken} }
                                                  │
base-web  ◀───────────────────────────────────────┘  String(0)==="0" → success ✓ (R1)
```

### 9. Error handling / 回滾

- cutover 為 config 改動,無 runtime error handling 新面;nginx config 刪 block 後 `nginx -t` 須 syntax OK。
- 回滾:`git revert` F14 commit + 重啟 stack 即回到 DESIGN-A 共存形態(nestjs service / TRANSITIONAL block 復原);nestjs image 仍在本機、`fork260509-soybean-admin-nestjs/` 源碼目錄仍在。

### 10. 測試 / 驗收(curl 載重 + CDP best-effort、per Q3)

- **acceptance = curl + psql + `docker compose exec`**(沿用 F8 / W-F11 / F12 / F13 慣例)。
- C-V 草案(實際 C-V 編號與命令於 `/speckit-plan` contracts 定):
  - rust-api image rebuild OK(R3 改 `code.rs`,cargo build exit 0)
  - dev stack 起動、**無 nestjs**、6 service healthy(原 7 service 含 nestjs)
  - nginx `nginx -t` syntax OK、無 nestjs upstream 殘留;`grep TRANSITIONAL default.conf*` = 0
  - `/api/auth/refreshToken` 經 `:11080`(front-nginx)→ 走到 rust → 回 rust F4 envelope `code:0`
  - 完整 login → refresh 循環經 nginx(`:11080/api/`):取新 token pair、psql 驗 `sys_tokens` 輪替(舊 row `used` / 新 row `unused`)
  - `--profile track-a` 不再帶起 nestjs(profile 已無成員)
  - R3:`code.rs` 有 5 個新 named constant、`sys_user_error.rs` 引用之、grep 確認無殘留 magic number
  - R4:`deploy/secrets/cleanup_database_url.txt.example` 存在且 git-tracked
  - base-web CDP SPA silent-refresh smoke(**best-effort** — Edge debug port 不通則記 deferred manual-eyeball)
  - 三邊 scope:base-web src 0 diff + nestjs fork 0 diff;無 migration、無 DB schema 改;rust-api scope = `code.rs` + `sys_user_error.rs`

---

## Research-time 確認項(交 `/speckit-plan` Phase 0)

- **R-Q1**:`default.conf` / `default.conf.prod` 的 3 個 TRANSITIONAL block 確切行範圍;確認 `>>>>> TRANSITIONAL BEGIN` / `<<<<< TRANSITIONAL END` marker 文字完全一致、`sed` range delete 可乾淨刪除;刪後該位置無孤兒 directive、`location /api/` 確實接手 `/api/auth/refreshToken`。
- **R-Q2**:`docker-compose.yml` / `dev.yml` / `prod.yml` 的 `nestjs:` service block 確切邊界;`track-a` profile 除 nestjs 外有無其他成員(預期無);`refresh_token_secret` 在 top-level `secrets:` + `rust-api` service `secrets:` 的引用點確認(必留)vs `nestjs` service 的引用點(移除)。
- **R-Q3**:`sys_user_error.rs` 的 5 個 `1xxx` 確切定義與 `code.rs` namespace 表的位置 / 結構;新 named constant 命名(對齊既有 `CODE_*` 慣例);確認改後 `sys_user_error.rs` 對外回傳的數值與行為與改動前完全相同(zero behavioral change)。
- **R-Q4**:`CLAUDE.md` §5.2 / §5.2.1 內 nestjs / track-a / `:11082` / `build-nestjs.sh` 的確切引用點清單。
- **R-Q5**:`deploy/front-nginx/README.md` 內 nestjs / TRANSITIONAL 說明段落範圍。
- **R-Q6**:cutover 後 nginx 啟動行為 — 確認移除 TRANSITIONAL block(含其內 `resolver` / `set $nestjs_upstream` directive)後,其餘 config 不需那些 directive 即可 `nginx -t` 通過、nginx 正常啟動。
- **R-Q7**:`INTEGRATION-DESIGN-A` / `DESIGN-B` doc 的檔頭結構 — 確認加註「已被取代」/「現行設計」的位置與格式。

---

## 範疇外

- ❌ 不改 rust refresh endpoint 業務邏輯(F13 已做、cutover 只切 routing)
- ❌ 不改 base-web SPA src / `.env`(per Constitution Principle IV;R1 已證 base-web 吃 rust `code:0`、無需動)
- ❌ 不刪 `fork260509-soybean-admin-nestjs/` 源碼目錄(gitignored、留歷史參考)
- ❌ 不刪 `refresh_token_secret` secret(rust 仍用)
- ❌ 不拔 Casbin redis pub-sub channel(W-F11 rust-to-rust、非 nestjs 專用)
- ❌ 無 DB migration、不改 DB schema
- ❌ R3 不修 F3 Scenario 9 軟刪 user 登入碼、不重構 auth-failure 碼子段(per Q2 — 只登記進 namespace)
- ❌ R2(F5.1 登入失敗無 audit)不納入 F14 — 屬獨立 audit 完整性議題、另行處理
- ❌ logout / 主動 token revocation endpoint — 非 DESIGN-A 範疇、YAGNI
- ❌ DESIGN-W observability(W-F12/13/14)/ acme 真實 cert(W-F6b)— 非 F14 範疇

---

## DESIGN-A → DESIGN-B 一致性

F14 是 DESIGN-A→DESIGN-B 收縮的**最後一步**:拔掉 nestjs 後,系統進入 DESIGN-B(rust-only)形態 — 所有 endpoint 由 rust 單一負責、enforcement 單一權威、無服務間 forward。F13 已使 rust `/auth/refreshToken` 就緒,F14 完成後 DESIGN-B 形態原樣生效、無額外遷移成本(per DESIGN-A §3.3「nestjs 退場後 rust 持續用同一 secret + 同一表,零遷移成本」)。F14 完成 = DESIGN-A §6.1 全 14 個 application feature(F1–F14)收尾。

---

## Naming / 編號

- Brainstorm doc:`docs/superpowers/029-feature-design-a-to-b-cutover.md`(本檔)
- Spec 目錄:`specs/029-design-a-to-b-cutover/`(`/speckit-specify` 產生)
- Feature branch:`029-design-a-to-b-cutover`(`before_specify` pre-hook 產生)
- 兩段式 commit:Stage 1 rust-api(R3、`code.rs` + `sys_user_error.rs`)+ Stage 2 outer(nginx + docker-compose×3 + 刪 `build-nestjs.sh` + R4 + `CLAUDE.md` + 3 份 design doc + spec docs)
- 無新 endpoint、無新 crate、無 DB migration、無新 secret(R4 為補既有 secret 的範本檔)
