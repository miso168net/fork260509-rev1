# Research: F1.1 — jwt-secrets

**Phase**: 0 (Outline & Research)
**Date**: 2026-05-14
**Source**: [`spec.md`](./spec.md) + [`plan.md`](./plan.md) + 2026-05-14 rust-api server-config / server-core / server-initialize codebase audit

## Audit Summary（執行於 2026-05-14）

| Audit Item | 結果 |
|---|---|
| `server-config` crate structure | 含 `config_init.rs`（main load fn）+ `env_config.rs`（envvar override loader）+ `multi_instance_env.rs`（multi-instance env processor）+ `model/jwt_config.rs`（JwtConfig struct）|
| `JwtConfig` struct 既有 3 fields | `jwt_secret: String` / `issuer: String` / `expire: i64`、derive(Deserialize, Debug, Clone) |
| Envvar mapping 機制 | `envy` crate workspace dep；nested config 內 `jwt.jwt_secret` 自動 derive 為 `APP_JWT_JWT_SECRET`（envy 之 flat env override pattern）|
| 既有 `assert!(!jwt_secret.is_empty())` callsite | **位於 test 內**（line 522, 590 是 `#[tokio::test]` fn 內驗 config 載入後 field 非空）— **不是** production validation；F1.1 production strict validation 需要**新增**、不是「取代既有 production assert」（spec FR-004 wording 需 plan 階段微調 — 視為「保留 test assert + 新增 production validation」）|
| `global::init_config::<JwtConfig>` callsite | `config_init.rs:66`、production 真正載入點 — F1.1 strict validation 應插在此後（或包進 `init_from_file` 內 unified post-load hook）|
| `JwtUtils::generate_token` / `validate_token` | `server/core/src/web/jwt.rs` 既有、F4 + F3 G9 已 layer FR-028 軟刪 user 8888 check；F1.1 **不**改此 path |
| `Claims` struct 既有 11 fields | `server/core/src/web/auth.rs:8` — F1.1 **不**改 struct（per spec FR-014）|
| Existing `application.yaml` jwt_secret | `"soybean-admin-rust"` (hardcoded、屬 placeholder) — F1.1 改為 `"change-me-jwt-secret"`（仍 placeholder、會被 F1.1 blacklist 攔）|
| Existing `application-test.yaml` jwt_secret | `"soybean-admin-rust"` 同上 — F1.1 改為合規 32-char dev secret（無 env override 也能 test 通過）|
| `application.yaml.example` 既有 | **不存在** — F1.1 NEW template |
| `dotenvy` / .env file loader | **未 used** in server-config crate；F1.1 維持只 envvar（per Constitution 預設 + Constitution dev fallback 走 bare envvar 已涵蓋）|
| `migration` binary 是否載入 JwtConfig | 看 `migration/src/main.rs` — migration 走獨立 main、不 load full Config / JwtConfig；F1.1 strict validation 僅在 server binary boot 時觸發 |
| `tracing` / `project_error!` macros | 既有 `server-global` 提供 `project_error!` / `project_info!` macros；F1.1 panic msg 用 `panic!()` 直接、不走 macro（panic msg 走 stderr 自然 ops 看得到）|

---

## Resolved Decisions（R1 ~ R6）

### R1 — Strict validation 三條 rule 的精確定義

- **Decision**：
  - `secret.is_empty()` — 純 Rust `String::is_empty()`
  - `PLACEHOLDER_SECRETS.contains(&secret.as_str())` — 對 `&'static [&'static str]` 用 `contains`、case-sensitive、exact match
  - `secret.len() < 32` — Rust `String::len()` 返 bytes count（多 byte UTF-8 自動算 bytes、HS256 真實 security baseline 是 bytes）
- **Rationale**: 三條 rule 都是 deterministic pure function、無 IO、無 dependency；panic msg 含三條 source label（envvar / _FILE path / yaml）+ 修正建議；case-sensitive blacklist match 簡單 deterministic（無 surface-level confusion）
- **Alternatives considered**:
  - case-insensitive blacklist：未必有 ROI、會 catch `"SOYBEAN-ADMIN-RUST"` 等 typo case；但常見 placeholder 名都 lowercase、增加 complexity 無 ROI
  - char-count length check：對 UTF-8 secret 反而過鬆；bytes count 是 HS256 security 真實單位

### R2 — `_FILE` loader 行為 + precedence rule

- **Decision**：
  - 函式簽名：`pub fn load_secret_from_file_if_set(base_envvar: &str) -> Option<String>`
  - 行為：讀 `<base_envvar>_FILE` env var、若 set 則 `std::fs::read_to_string(path).trim().to_string()` → 返 `Some(value)`；未 set 返 `None`
  - Read failure（file 不存在 / permission denied / IO error）panic with file path + os::Error 原因 + "check Docker secrets mount / file permissions" hint
  - Precedence integration：在 `config_init` JwtConfig 載入後、validation 前呼叫 `load_secret_from_file_if_set("APP_JWT_JWT_SECRET")`；若 `Some(v)` 則 override `jwt_config.jwt_secret = v`（bare envvar 值被覆寫、忽略）
- **Rationale**: precedence override 在 single function 內、邏輯顯式不分散；`.trim()` 移除常見 `echo ... > file` 引入的 trailing `\n`；read failure panic 是「靜默讀失敗就用 fallback」反 pattern（per spec edge case 「_FILE 指 file 不存在 → boot panic」明示）
- **Alternatives considered**:
  - `Result<Option<String>, IoError>` 返 type：caller 需 unwrap + handle、增加 boilerplate；F1.1 panic on read failure 更簡單一致
  - 不 trim：strict 一些、但 `echo "secret" > file` 加 \n 會讓 length check 多 1 byte（lower-trip-wire）；trim 是合理 dev ergonomic
  - 中間 whitespace 也 trim：可能 corrupt real secret（高熵 secret 可能含空格）— 保留 internal whitespace

### R3 — Panic 行為 + error message 設計

- **Decision**：
  - 用 Rust `panic!(...)` macro 直接、不走 `project_error!` + `std::process::exit(1)`
  - Panic msg 三段：(a) 失敗原因（empty / placeholder=val / length=N）(b) source label（envvar / _FILE path / yaml）(c) 修正建議（`openssl rand -hex 32` 範例 + 該設哪個 envvar）
  - panic msg 對 placeholder fail 場景**可包含 value**（placeholder 是已知公開值、無 leak risk）；對 length fail 場景**只**含 byte count（無 secret content leak）
- **Rationale**: 既有 codebase boot config error 偏 panic（per existing config_init tests + F4 / F3 風格）；orchestrator (docker/k8s) 看 exit code != 0 觸發 restart loop；panic stderr message 對 ops 友善
- **Alternatives considered**:
  - `Result<JwtConfig, ConfigError>` 返 type + caller exit：較 idiomatic Rust、但既有 codebase 沒走此 path、增加調用方改動範圍
  - `project_error!` + `std::process::exit(1)`：log 經 tracing layer 但 exit 不走 panic stack trace；boot config error 不需要 stack trace、panic 訊息夠

### R4 — `application.yaml` jwt_secret value 應該設什麼

- **Decision**：value = `"change-me-jwt-secret"`（與 PLACEHOLDER_SECRETS blacklist 內值一致）
- **Rationale**: 此值會被 F1.1 blacklist 攔 panic、避免 placeholder 誤啟動 prod；命名清楚指示「該改」；value 是 < 32 chars 也會被 length check 攔（雙保險）
- **Alternatives considered**:
  - empty value `""`：直接觸發 empty rule、但 yaml empty string 在 serde 載入時可能歧義
  - 留 yaml jwt_secret field 整段註解：env override 必填、no fallback；但 yaml 結構不完整不容易 review

### R5 — `application-test.yaml` test secret value

- **Decision**：value = 32-char dev-friendly secret（推薦：`"dev-test-secret-padded-to-thirty-two!"` 38 chars or shorter 32-char variant）— 真實 32-char 通過 length + placeholder check
- **Rationale**: cargo test 跑 application-test.yaml 走同 strict validation path（per spec FR-012 + Edge Case「無 env-mode 分支」）；test secret 公開不影響 prod；明確標明這是 test-only
- **Alternatives considered**:
  - 為 test 加 env-mode 豁免（`#[cfg(test)]` skip validation）：違 spec FR-019「無 env-mode 分支」；增加 production / test path 分歧
  - 用 `openssl rand` 真隨機 + test setup hook 寫進 env：每次跑 test 需要 setup、不適合 yaml-driven test pattern

### R6 — F1.2 / F10 future extensions reserved 細節

- **Decision**：F1.1 `claim-contract.md` 內 reserved 三個 future field（不在 F1.1 加實作、僅 doc）：
  - `token_type: "access" | "refresh"` — F10 refresh-token-bridge 加（access vs refresh token 分類）
  - `kid` (header) — F1.2 key versioning + multi-secret rotation 加
  - `family_id` — F10 refresh token rotation chain 加（per OWASP refresh token rotation pattern）
- **Rationale**: claim contract 早寫清楚、F10 / F1.2 階段 implementer 不需重新 brainstorming 命名；serde Deserialize 對 F1.1 既有 11 fields 仍 backward compat（Option<未來欄> 不破壞舊 token）
- **Alternatives considered**:
  - 在 F1.1 直接加 `token_type` claim（預埋）：rev1 現階段無 refresh use case、是 dead weight 到 F10；per Clarifications 已拒絕（Q3 brainstorm）
  - F1.1 不 reserve doc、F10 / F1.2 階段才命名：增加 future feature 命名分歧風險

---

## Outstanding Items（plan 階段未拍板、留 `/speckit-tasks` 階段處理）

| Item | 為何 defer | Owner phase |
|---|---|---|
| `secret_loader.rs` 是否獨立檔 vs inline in `config_init.rs` | 集中模組 (secret_loader.rs) 更清晰；inline 改動最少；tasks 階段量化選擇（推薦：獨立檔、便於 unit test 直接 import）| `/speckit-tasks` |
| `validate_jwt_secret` 是否同時加 `#[cfg(test)]` 公開測試 helper 或保 private | 私有 + tests 跑 inline 在 same crate `pub(crate)` 即可、不需 public；tasks 階段量化 | `/speckit-tasks` |
| `application.yaml.example` 內容詳細度 | spec FR-011 已列 (a) jwt section placeholder (b) 4 個 envvar 範例 (c) openssl rand 指引；具體措詞 tasks 階段量化 | `/speckit-tasks` |
| `init_from_file` integration 在哪行插入 strict validation call | `config_init.rs:66 global::init_config::<JwtConfig>` 之後 OR 在 `init_from_file` end 之前 unified post-load；tasks 階段選一致位置 | `/speckit-tasks` |
| `application-test.yaml` test secret 確切字串 | spec FR-012 例 `"dev-test-secret-padded-to-thirty-two!"`、可選其他 32-char 合規值；tasks 階段定 | `/speckit-tasks` |
| `migration` binary 是否需獨立 validation | 既有 codebase migration 不載 JwtConfig → strict validation 不觸發；F1.1 不需特別處理；tasks 階段 verify migration `main.rs` 不調用 `init_from_file` 即可 | `/speckit-tasks` confirmation |
| spec FR-004 wording 「取代既有 assert!」實際應該是 「保留 test assert + 新增 production validation」 | spec wording 微誤（既有 assert! 在 test 內、非 production）；tasks 階段 implementer 自然理解、不需 spec patch | `/speckit-tasks` |

---

**Phase 0 結論**：✅ 所有 spec-level decision 都已在 brainstorming + specify 階段 resolve；codebase audit 確認 server-config 結構 + envvar mapping + JwtUtils 路徑 + 既有 assert! 在 test 內；可進入 Phase 1（data-model / contracts / quickstart）。
