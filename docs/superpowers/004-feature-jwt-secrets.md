# Feature Specification: F1.1 — jwt-secrets

**Feature ID**: F1（per [`DESIGN-A`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6.1）— **拆 F1.1 minimal 先交、F1.2 algorithm 升級 + key versioning 留與 F10 refresh-token-bridge 同期**
**Feature Branch**: TBD（spec-kit `/speckit-specify` 階段建立）
**Created**: 2026-05-14
**Status**: Draft（brainstorming 完成、待 spec-kit `/speckit-specify` 接手轉為正式 feature spec）
**Source**: superpowers:brainstorming 2026-05-14 session
**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §3.3（JWT 簽章共識）、§6.1 F1、§6.2 依賴序
- [`docs/INTEGRATION-DESIGN-B-RUST-ONLY.md`](../INTEGRATION-DESIGN-B-RUST-ONLY.md)（A/B 兩軌都需此基礎）
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0（架構約束 §Secret 注入：Docker secrets + _FILE pattern 為 prod 預設）
- [`docs/superpowers/001-feature-response-shape-alignment.md`](001-feature-response-shape-alignment.md)（F4，已完成）
- [`docs/superpowers/002-feature-soft-delete-infrastructure.md`](002-feature-soft-delete-infrastructure.md)（F3，已完成）
- [`docs/superpowers/003-feature-audit-log-infrastructure.md`](003-feature-audit-log-infrastructure.md)（F2.1，已完成）

**Scope summary**：rev1 rust-api JWT secret config 的 **prod hardening + envvar 注入機制 + claim 對齊 doc** 基礎建設。F1.1 範圍刻意縮限：(a) `jwt_secret` strict validation（fail-fast on empty / placeholder / length < 32）；(b) `_FILE` pattern support（per Constitution、`APP_JWT_JWT_SECRET_FILE > APP_JWT_JWT_SECRET` precedence）；(c) `application.yaml` placeholder 修 + `application.yaml.example` template 新建；(d) Claims 11 fields contract doc（Claims struct 不動於 F1.1）。Algorithm 升級（HS256 → RS256）+ key versioning（kid header）+ refresh token 預埋 全部留 F1.2 / F10 階段（拍板：F1.2 與 F10 refresh-token-bridge 同期交付、因 multi-service 共識才有 immediate caller）。

## Clarifications

### Session 2026-05-14（brainstorming 階段拍板、4 項）

- Q: F1 整體範圍要不要一次交付？rev1 階段無 nestjs container、§6.1 原註的「兩端共識」現無 immediate caller。 → A: **拆 F1.1 + F1.2 兩階**。F1.1 = minimal（secret hardening + claim doc + _FILE 注入機制）解鎖 P1（F5）；F1.2 = algorithm 升級（HS256 → RS256）+ key versioning（kid header）+ key rotation 預埋、與 F10 refresh-token-bridge 同期交付（multi-service 共識才有 immediate caller、現階段預埋是 over-engineer）。
- Q: jwt_secret 驗證嚴格度策略？ → A: **Strict always**。fail-fast on (1) empty (2) hardcoded placeholder 在黑名單內（"soybean-admin-rust" / "change-me-*" / 「your-secret-here」/ "PLACEHOLDER" / "TODO"）(3) length < 32 chars（HS256 minimum security baseline）。dev / staging / prod 統一 enforce、無 escape hatch（理由：prod hardening 在 dev 階段就被 catch、no surprise on prod deploy）。
- Q: claim 欄位 standardize 範圍？既有 11 個（sub/exp/iss/aud/iat/nbf/jti 標準 + username/role/domain/org custom）。 → A: **保留現狀 + 加 doc reference**。Claims struct 不動於 F1.1、只新增 contract spec doc 明示 11 fields 用途（sub=user_id / username/role/domain/org 用途 etc.）。F10 refresh-token-bridge 階段補 `token_type` claim 時可正常擴（不動 F1.1 既有、backward compat）。
- Q: envvar 注入機制 scope — Constitution 說「Docker secrets + `_FILE` pattern 為 prod 預設」、F1.1 是否實作 _FILE loader？ → A: **F1.1 實作 _FILE 支援**。config loader 補 _FILE fallback：`APP_JWT_JWT_SECRET_FILE` 指 file path、讀檔內容為 secret 值；bare `APP_JWT_JWT_SECRET` env var 仍可用（dev 便利）；兩者同時設、`_FILE` 優先。Strict secret validation 仍同步遞用（讀出來的 secret 仍需過 length / placeholder check）。
- Q: F1.1 採哪個 implementation approach？ → A: **Approach A**（config_init 載入點 + boot-time validate）。`_FILE` 讀取 + Strict validation 集中在 `server-config::config_init` 載入 JwtConfig 點、panic on fail；與既有 `assert!(!jwt_secret.is_empty())` 同位置擴展、與 codebase boot config error 偏好 panic 的風格一致。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — rust-api JWT secret prod hardening + envvar 注入機制（Priority: P1，唯一 US）🎯 MVP

operator 部署 rev1 rust-api 時、JWT secret 配置自此後**永遠**走 strict validation + `_FILE` pattern 雙軌：(a) 透過 `APP_JWT_JWT_SECRET_FILE` 從 Docker secret file 讀（prod）或 (b) 透過 `APP_JWT_JWT_SECRET` bare envvar（dev 便利）；任一路徑載入的 secret value MUST 通過 strict validation（!empty + !placeholder + length >= 32）才能 boot；任何失敗都 boot panic 並印出清晰 error message（標 envvar 名 + 修正方式）。整個 codebase 內、JWT secret 載入路徑**不可能**默默用 application.yaml hardcoded placeholder value 啟動服務 — 由 config_init boot-time validation 守護。

**Why this priority (P1，唯一 US，no further decomposition)**：

F1.1 的 4 個交付片段（_FILE loader / strict validation / yaml placeholder / claim contract doc + envvar template）**並非獨立可交付**：

- 單獨建 _FILE loader → 沒 strict validation → 仍可載入 placeholder secret（如 docker compose 設 `_FILE` 指 file、file 內含 `"soybean-admin-rust"`）→ prod 無安全保證
- 單獨加 strict validation → 沒 _FILE → prod 必須走 bare envvar → secret 進 process env → 違 Constitution 「secret 不進 process env」
- 單獨改 application.yaml placeholder → 沒 strict validation → boot 過去（empty / placeholder 不報錯）→ 真實 prod deployment 仍可能用 hardcoded fake 啟動
- 單獨寫 claim contract doc → 沒 secret hardening → spec 文件描述對齊 但實際 prod runtime 不安全

任一單一片段交付了、其他沒交付、整個 prod hardening goal 都沒達成。F1.1 是 **infrastructure 性質的原子 increment** — 4 個片段是同一個 user story 的 4 個 acceptance dimensions。

**Independent Test**：本機 dev 環境跑 `cargo run --bin server`：

1. 預設（無 env override）→ application.yaml jwt_secret = `"change-me-jwt-secret"`（placeholder）→ boot panic、error msg 含 "placeholder" + 修正建議 `openssl rand -hex 32`
2. `export APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"` + `cargo run --bin server` → boot 成功、JwtUtils::generate_token 可運行
3. `unset APP_JWT_JWT_SECRET && echo "$(openssl rand -hex 32)" > /tmp/jwt && export APP_JWT_JWT_SECRET_FILE=/tmp/jwt` + `cargo run --bin server` → boot 成功（_FILE pattern 觸發）
4. _FILE + bare envvar 都設 → _FILE 優先（bare value 被 ignore）
5. _FILE 指不存在 file → boot panic、msg 標 file path + Docker secret mount hint
6. F3 既有 acceptance test（含 G9 jwt_auth_middleware FR-028）仍 pass（既有 token 行為不變）

**Acceptance Scenarios**:

#### Dimension A：Strict secret validation（FR-001 ~ FR-004）

1. **Given** application.yaml `jwt.jwt_secret: "change-me-jwt-secret"` + 無 env override，**When** server boot，**Then** boot panic、error msg 含 "placeholder"（值 = `"change-me-jwt-secret"`）+ 修正建議含 `openssl rand -hex 32`
2. **Given** `APP_JWT_JWT_SECRET=""`（空字串），**When** server boot，**Then** boot panic、error msg 含 "empty" + 列 3 個 source（_FILE / bare / yaml）+ 修正建議
3. **Given** `APP_JWT_JWT_SECRET="abc"`（3 chars），**When** server boot，**Then** boot panic、error msg 含 "length = 3 bytes < 32" + 修正建議 `openssl rand -hex 32 produces 64-char hex = 32 bytes`
4. **Given** `APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"`（real 64-char hex），**When** server boot，**Then** boot 成功；後續 JwtUtils::generate_token + validate_token 流程正常

#### Dimension B：`_FILE` pattern + precedence（FR-005 ~ FR-007）

5. **Given** `APP_JWT_JWT_SECRET_FILE=/tmp/jwt`、file 內 `"real-32-char-secret-padded-here!"`、無 bare envvar，**When** server boot，**Then** boot 成功；config_init load_jwt_config 後 `jwt_secret == "real-32-char-secret-padded-here!"`
6. **Given** `APP_JWT_JWT_SECRET_FILE=/tmp/jwt`、file 內含 trailing newline `"abc...def\n"`，**When** server boot，**Then** trim newline 後通過 validation；jwt_secret == "abc...def"（無 newline）
7. **Given** `APP_JWT_JWT_SECRET_FILE` + `APP_JWT_JWT_SECRET` 都設、_FILE 內為 32-char real secret、bare 為 placeholder，**When** server boot，**Then** _FILE 優先、boot 成功（bare envvar value 被 ignore；不 warn — 設計簡化）

#### Dimension C：`_FILE` 讀取失敗 / 內容違反 validation（FR-008 ~ FR-009）

8. **Given** `APP_JWT_JWT_SECRET_FILE=/nonexistent/path`，**When** server boot，**Then** boot panic、error msg 含 file path + IO error 原因 + "check Docker secrets mount / file permissions" hint
9. **Given** `APP_JWT_JWT_SECRET_FILE=/tmp/jwt`、file 內含 `"soybean-admin-rust"`（placeholder），**When** server boot，**Then** trim 後仍命中 placeholder blacklist → boot panic、error msg 與 Scenario 1 同等品質

#### Dimension D：Resources files 修（FR-010 ~ FR-012）

10. **Given** F1.1 完成、查 `rust-api/server/resources/application.yaml`，**Then** `jwt.jwt_secret` 值為 placeholder（`"change-me-jwt-secret"` 或等同會被 blacklist 攔的值）；application.yaml 不再含 real-looking secret
11. **Given** F1.1 完成、查 `rust-api/server/resources/application.yaml.example`，**Then** template 存在；含 dev (bare envvar) + prod (Docker secrets + `_FILE`) 兩段 deployment 範例 + `openssl rand -hex 32` 產 secret 指引
12. **Given** F1.1 完成、查 `rust-api/server/resources/application-test.yaml`，**Then** `jwt.jwt_secret` 為合規 32-char dev secret（**不**是 "soybean-admin-rust" placeholder、test 跑同 validation path、無 env-mode 分支）

#### Dimension E：Claim contract spec doc（FR-013）

13. **Given** F1.1 完成、查 `specs/<NNN>-jwt-secrets/contracts/claim-contract.md`，**Then** doc 列 Claims 11 fields（sub/exp/iss/aud/iat/nbf/jti 標準 + username/role/domain/org custom）+ 用途說明 + F1.2 / F10 預留 future extensions（`token_type`、`kid`、`family_id`） 註記
14. **Given** F1.1 完成、查 `server-core::web::auth::Claims` struct，**Then** **11 fields 不動**（F1.1 不 refactor Claims、保 backward compat 既有 token）

#### Dimension F：Backward compat（FR-014）

15. **Given** F1.1 完成、F3 G9 既有 `jwt_auth_middleware.rs` + `jwt.rs` 軟刪 user FR-028 check 仍存在，**When** 跑 F3 既有 acceptance test，**Then** 全 pass（既有 token 簽 + 驗 + FR-028 check 行為皆不變）
16. **Given** F1.1 完成、既有 yaml `iss` / `aud` / `expire` value 未動，**When** server boot + 發 token，**Then** 既有舊 token（同 secret 簽的）仍可解（簽 algorithm = HS256 不變、secret 值不變）

### Edge Cases

- **既有 yaml hardcoded `"soybean-admin-rust"` deploy 過的環境**：F1.1 deploy 後既有 token 仍可解（同 secret 簽的）、但 application.yaml 改 placeholder 後 server 重啟必須 env override — 預期行為（hardcoded secret 本來就該被踢掉）
- **secret 含 multi-byte UTF-8**：length check 用 `.len()` 計 bytes（HS256 真實 security 是 bytes、不是 chars）；32 bytes 包含 UTF-8 算多少都通過
- **_FILE file 內含 leading/trailing whitespace**：`.trim()` 移除（避免 `echo "abc" > file` 加 \n 導致 length 錯）；中間 whitespace 保留為 secret 一部分
- **_FILE file 是 directory**：`fs::read_to_string` 報 error → panic with path + os::Error 原因
- **dev shell history leak**：`export APP_JWT_JWT_SECRET=xxx` 寫進 ~/.bash_history、dev 場景可接受（prod 走 _FILE 不過 process env、Constitution 對齊）
- **Test 環境 cargo test 跑時**：test 用 `application-test.yaml` 配 32-char dev secret（per FR-012）；無 env override 也能跑 strict validation 通過
- **F1.2 + F10 階段加 `kid` header / `token_type` claim**：F1.1 Claims 不改、F1.2 / F10 加 field 不破壞 F1.1（serde Deserialize 對缺欄位 optional 容忍）；新舊 token 可共存
- **server hot reload**：F1.1 不支援、validation 只在 boot 跑（與既有 config 行為一致）
- **panic 訊息 leak real secret value**：placeholder fail 訊息含 placeholder value（公開值）；length fail 訊息只含 byte count（無 secret content）；real secret 過 length check 後不會踩其他 validation panic → leak-free
- **既有 `assert!(!jwt_config.jwt_secret.is_empty())` 在 config_init:522 / 590**：F1.1 內取代為完整 strict validation；assert 移除以避免重複 check
- **PLACEHOLDER_SECRETS 黑名單擴張時舊 deploy 影響**：若 future F1.x 加新 placeholder（如 "test-secret"）、既有 deploy 已用該值（無此先例、但理論可能）會在升級後 boot fail — 公開 placeholder list 既為公開資產、用作 prod secret 本就不安全、攔 fail-fast 正向

---

## Requirements *(mandatory)*

### Functional Requirements

#### Strict secret validation（FR-001 ~ FR-004）

- **FR-001**：F1.1 MUST 在 `server-config::config_init` 載入 JwtConfig 點新增 `validate_jwt_secret(&str)` 函式、對 jwt_secret 跑 3 條 rule：
  - `secret.is_empty()` → panic with friendly error
  - `PLACEHOLDER_SECRETS.contains(&secret)` → panic
  - `secret.len() < 32` → panic
- **FR-002**：`PLACEHOLDER_SECRETS` 黑名單 MUST 至少含：`"soybean-admin-rust"`（既有 yaml hardcoded）、`"change-me"`、`"change-me-jwt-secret"`、`"your-secret-here"`、`"PLACEHOLDER"`、`"TODO"`
- **FR-003**：validation panic message MUST 提供：(a) 失敗原因（empty / placeholder / length）+ (b) 失敗 source label（envvar / _FILE path / yaml）+ (c) 修正建議（`openssl rand -hex 32` 範例 + 該設哪個 envvar）
- **FR-004**：既有 `config_init.rs:522` + `:590` 的 `assert!(!jwt_config.jwt_secret.is_empty())` callsite MUST 被取代為 `validate_jwt_secret(&jwt_config.jwt_secret)` 呼叫（取得更嚴格的 validation + 一致的 panic message 品質）

#### `_FILE` pattern + precedence（FR-005 ~ FR-009）

- **FR-005**：F1.1 MUST 新增 `load_secret_from_file_if_set(base_envvar: &str) -> Option<String>` helper：讀 `<base_envvar>_FILE` env var、若 set 則 `fs::read_to_string(path)` → `.trim()` → 返 Some(value)；未 set 返 None；read 失敗 panic
- **FR-006**：F1.1 MUST 在 `server-config::config_init` JwtConfig 載入流程內、`validate_jwt_secret` 呼叫之前、執行 `_FILE` precedence check：若 `APP_JWT_JWT_SECRET_FILE` set、覆寫 `jwt_config.jwt_secret` value
- **FR-007**：當 `APP_JWT_JWT_SECRET_FILE` + `APP_JWT_JWT_SECRET` 都 set 時、`_FILE` MUST precedence、bare envvar 值被 ignore（無 warn — 設計簡化）
- **FR-008**：當 `APP_JWT_JWT_SECRET_FILE` 指向不存在 file / permission denied / file is a directory 等 IO failure、F1.1 MUST panic with：(a) `_FILE` envvar 名 (b) file path (c) os::Error 原因 (d) "check Docker secrets mount / file permissions" hint
- **FR-009**：從 `_FILE` 讀出的 secret value MUST 與 bare envvar 走同樣 strict validation（不因 source 不同而豁免）

#### Resources files 修（FR-010 ~ FR-012）

- **FR-010**：F1.1 MUST 修 `rust-api/server/resources/application.yaml` 內 `jwt.jwt_secret` 值為 placeholder（`"change-me-jwt-secret"` 或等同會被 blacklist 攔的值）；application.yaml 不再含 real-looking secret
- **FR-011**：F1.1 MUST 新建 `rust-api/server/resources/application.yaml.example` template：含 (a) jwt section placeholder (b) 4 個 envvar override 範例（bare / `_FILE` × dev / prod）(c) `openssl rand -hex 32` 產 secret 指引
- **FR-012**：F1.1 MUST 修 `rust-api/server/resources/application-test.yaml` 內 `jwt.jwt_secret` 為合規 32-char dev secret（**不**改 strict validation 為 test-mode 豁免、test 跑同 validation path 一致）；推薦值例：`"dev-test-secret-padded-to-thirty-two!"`（32 chars exact）

#### Claim contract doc（FR-013 ~ FR-014）

- **FR-013**：F1.1 MUST 新建 `specs/<NNN>-jwt-secrets/contracts/claim-contract.md`：列 `server-core::web::auth::Claims` 既有 11 fields（sub / exp / iss / aud / iat / nbf / jti / username / role / domain / org）+ 用途 + F1.2 / F10 預留 future extensions（`token_type` / `kid` / `family_id`） 註記
- **FR-014**：F1.1 **MUST NOT** 改 `Claims` struct（不 add / remove / rename / re-type 任何 field）；保留現狀 11 fields backward compat

#### 範圍邊界（FR-015 ~ FR-019）

- **FR-015**：F1.1 **MUST NOT** 改 algorithm（保 HS256、`Header::default()` + `Validation::default()` 既有路徑）— 升級 RS256 留 F1.2
- **FR-016**：F1.1 **MUST NOT** 實作 key versioning（kid header / multi-key rotation）— 留 F1.2
- **FR-017**：F1.1 **MUST NOT** 引入 refresh token 邏輯（token_type / family_id / rotation chain）— 留 F10 refresh-token-bridge
- **FR-018**：F1.1 **MUST NOT** 改 `JwtUtils::generate_token` / `validate_token` 簽名與行為（per F4 envelope + F3 G9 FR-028 既有 layer 不動）
- **FR-019**：F1.1 **MUST NOT** 加 env-mode 分支邏輯（dev / staging / prod 統一 strict validation、per Clarifications Q2）

### Key Entities

#### `JwtConfig` struct（既有、不動 + doc 擴）

`server_config::JwtConfig`（既有、F1.1 不改 struct 結構）。3 fields：
- `jwt_secret: String` — JWT signing secret；envvar `APP_JWT_JWT_SECRET` or `APP_JWT_JWT_SECRET_FILE`（後者 precedence）；F1.1 加 strict validation
- `issuer: String` — JWT iss claim 值；envvar `APP_JWT_ISSUER`；非 secret、_FILE 不適用
- `expire: i64` — JWT 過期秒數；envvar `APP_JWT_EXPIRE`；非 secret

doc comment 擴充說明 _FILE precedence + validation rules（per FR-001/005/006）。

#### `validate_jwt_secret` 函式（NEW）

`server_config::config_init::validate_jwt_secret(secret: &str)`（F1.1 新增）：
- pure function、無 return value（panic on fail）
- 3 條 rule：empty / placeholder / length < 32
- error messages 涵蓋 source + fix instructions（per FR-003）

#### `load_secret_from_file_if_set` 函式（NEW）

`server_config::config_init::load_secret_from_file_if_set(base_envvar: &str) -> Option<String>`（F1.1 新增）：
- 讀 `<base_envvar>_FILE` env var
- `fs::read_to_string(path).trim()` 取 secret value
- read failure panic（per FR-008）
- 若 `_FILE` envvar 未 set 返 `None`

#### `Claims` struct（既有、不動）

`server_core::web::auth::Claims`（F4 + F3 既有、F1.1 完全不改）。11 fields per spec FR-013 contract doc。

#### Resources files

- `application.yaml` — jwt section jwt_secret value 改 placeholder
- `application.yaml.example` — NEW template
- `application-test.yaml` — jwt_secret 改合規 32-char dev secret
- `claim-contract.md` (in specs/) — NEW doc

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**：`validate_jwt_secret("")` panic — unit test 驗
- **SC-002**：`validate_jwt_secret("soybean-admin-rust")` panic（每個 PLACEHOLDER_SECRETS 黑名單值都 panic）— unit test 驗
- **SC-003**：`validate_jwt_secret(&"a".repeat(31))` panic / `validate_jwt_secret(&"a".repeat(32))` OK — unit test 驗
- **SC-004**：`load_secret_from_file_if_set` 從 valid file 讀出 trimmed content / 從 missing file panic — unit test 驗
- **SC-005**：F1.1 完成、無 env override 跑 `cargo run --bin server` 在 dev 機器 → boot panic、error msg 含 "placeholder" — integration test 或 quickstart Step 2 驗
- **SC-006**：F1.1 完成、`export APP_JWT_JWT_SECRET="$(openssl rand -hex 32)"` 跑 → boot 成功 — quickstart Step 3 驗
- **SC-007**：F1.1 完成、`export APP_JWT_JWT_SECRET_FILE=/tmp/jwt` 指 valid 64-char hex file → boot 成功；`_FILE` value precedence over bare envvar — quickstart Step 4 + unit test 驗
- **SC-008**：`application.yaml` jwt_secret 為 placeholder（grep 驗值在 PLACEHOLDER_SECRETS 黑名單內）；`application.yaml.example` 存在 + 含 dev / prod envvar / `_FILE` 範例 — grep + file existence 驗
- **SC-009**：F3 既有 acceptance test（`soft_delete_basics` + `soft_delete_audit_integration` + `soft_delete_auth_gate`）在 F1.1 後仍 pass — `cargo test --test soft_delete_* -- --ignored` 全綠
- **SC-010**：claim-contract.md 存在 + 含 11 fields 用途 — file existence + grep 驗
- **SC-011**：`cargo check` 全 workspace pass（無 `-D warnings` unused-imports / dead_code）

---

## Assumptions

- **`server-config::config_init` 既有 envy / config crate 載入路徑可擴 _FILE override**：既有 `assert!(!jwt_config.jwt_secret.is_empty())` callsite 是擴展點、不需改 envy crate 行為
- **既有 yaml `iss` / `aud` value 不動**：F1.1 不改 issuer / audience claim 值；既有 token validation iss 對齊 application.yaml 既有 issuer 不變
- **JwtUtils + jwt_initialization 不動於 F1.1**：global::Keys + Validation 載入路徑沿用既有 server-initialize::initialize_keys_and_validation；F1.1 只改 config 載入點
- **HS256 algorithm rev1 階段足夠**：rev1 為單服務 rust-api、無跨服務 secret 共識需求；HS256 symmetric 簡單足夠；RS256 升級為 F1.2 multi-service caller（F10 refresh bridge）出現時才有實際 ROI
- **dev shell history leak 對 dev 場景可接受**：`export APP_JWT_JWT_SECRET=xxx` 寫進 ~/.bash_history 等是 dev 自身負責的環境；prod 走 `_FILE` 不過 process env 守住 Constitution 邊界
- **既有 deployed token backward compat 透過「不改 algorithm + 不改 secret 載入路徑（仍 EncodingKey::from_secret）」自動成立**：F1.1 改的是 secret value 載入機制、不是 secret 值本身；既有 deploy 已透過 env override 給的 real secret 不變 → token 仍可解
- **PLACEHOLDER_SECRETS 黑名單初始 6 個值對 rev1 環境足夠**：覆蓋既有 yaml hardcoded fake + 常見 bait words；F1.x 階段可擴
- **Docker secrets + _FILE 機制是 prod 部署假設**：本 F1.1 假設 Constitution §架構約束 「Docker secrets + _FILE pattern 為 prod 預設」當作既定 deployment baseline；deploy/ compose stack 階段配對應 docker secrets 機制（不在 F1.1 scope）
- **`application-test.yaml` 32-char dev secret 不能 leak 到 prod**：dev / test profile 配 yaml-tracked secret 是接受的 risk（test secret 公開不影響 prod）；prod profile 不會載入 test yaml
- **F4 envelope code 對齊**：F1.1 不引入新 envelope code（沿 F4 既建構的 24 個 business code 常數）；boot panic 不走 envelope（panic 走 process exit code）
- **F1.2 + F10 將擴 Claims + algorithm 不破壞 F1.1**：F1.2 加 `kid` header / RS256 / `token_type` claim 時、serde Deserialize 對 F1.1 既有 11 fields 仍 backward compat；新舊 token 可共存
