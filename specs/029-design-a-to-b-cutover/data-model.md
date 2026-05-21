# Data Model: F14 — design-a-to-b-cutover

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-21

F14 **不動 DB schema、不增表、不改 entity、無 migration**。「data model」此處為 F14 的**變更模型** — cutover 拔除的 6 組元件、每組的精確改動。唯一觸碰的「資料」是 error code 常數值(R3 — 純常數登記、值不變)。

元件總覽:

| # | 元件 | 位置 | 性質 | commit stage |
|---|---|---|---|---|
| E1 | nginx TRANSITIONAL block 拔除 | `deploy/front-nginx/conf.d/default.conf` + `default.conf.prod` | 刪 | Stage 2 |
| E2 | docker-compose nestjs service 移除 | `docker-compose.yml` + `dev.yml` + `prod.yml` | 刪 | Stage 2 |
| E3 | W-FA3 build script 刪除 | `deploy/build-nestjs.sh` | 刪 | Stage 2 |
| E4 | R3 — error code namespace 登記 | `rust-api` `core/src/web/code.rs` + `service/src/admin/errors/sys_user_error.rs` | 改 | **Stage 1** |
| E5 | R4 — secret 範本補齊 | `deploy/secrets/cleanup_database_url.txt.example` | 新增 | Stage 2 |
| E6 | doc 收尾 | `CLAUDE.md` + `deploy/front-nginx/README.md` + 3 份 `docs/INTEGRATION-*` | 改 | Stage 2 |

---

## E1: nginx TRANSITIONAL block 拔除(刪、Stage 2)

刪除 3 個 W-FA2 machine-deletable marker block:

| 檔案 | block 位置 | server |
|---|---|---|
| `deploy/front-nginx/conf.d/default.conf` | 行 38-48 | 80 server |
| `deploy/front-nginx/conf.d/default.conf` | 行 82-92 | 443 server |
| `deploy/front-nginx/conf.d/default.conf.prod` | 行 52-62 | 443 server |

- 刪法:`sed '/>>>>> TRANSITIONAL BEGIN/,/<<<<< TRANSITIONAL END/d'`(W-FA2 spec US4.3 已驗證的 range-delete pattern)。
- block 內容:`location = /api/auth/refreshToken` + `resolver` + `set $nestjs_upstream` + `proxy_pass http://$nestjs_upstream/v1/auth/refreshToken` + `include proxy_headers.inc`。
- 刪後行為:`/api/auth/refreshToken` 失去 exact-match `location =`,落到既有 `location /api/`(`proxy_pass http://rust_api/;` + `include proxy_headers.inc;`)→ `/api/` 前綴 strip → rust `/auth/refreshToken`。

**設計要點**:
| 項目 | 決策 |
|---|---|
| `default.conf` resolver | `resolver` 只在被刪 block 內 → 刪後零殘留、亦不需 resolver(`upstream rust_api` 用 plain `server`) |
| `default.conf.prod` resolver | http-context resolver(line 3)**保留** — W-F11 `upstream rust_api ... resolve` 需要;只刪 block 內冗餘的 server-context resolver |
| 刪後驗證 | `nginx -t` syntax OK + `grep -c TRANSITIONAL`=0 + `grep nestjs`=0 |

---

## E2: docker-compose nestjs service 移除(刪、Stage 2)

| 檔案 | nestjs 區塊 | 改動 |
|---|---|---|
| `docker-compose.yml` | service block 行 240-291(`profiles: ["track-a"]`) | 整段刪除 |
| `docker-compose.dev.yml` | nestjs stanza 行 28-30(`ports: ["127.0.0.1:11082:9528"]`) | 整段刪除 |
| `docker-compose.prod.yml` | nestjs stanza 行 21-23(`restart: always`) | 整段刪除 |

**設計要點**:
| 項目 | 決策 |
|---|---|
| `track-a` profile | 唯 nestjs 用 → 移除 nestjs 後自然失效;不需另外刪 profile 定義(profile 無集中宣告、靠 service 的 `profiles:` 欄存在) |
| `refresh_token_secret` secret | **保留** top-level `secrets:` 條目(行 311-312)+ `rust-api` service 的引用(行 118 / 123);**僅移除** `nestjs` service 對它的引用(行 248 entrypoint + 行 268 `secrets:`) |
| 檔頭註解 | 3 個 compose 檔頭過時註解修正(`docker-compose.yml` 行 4「5 service stack」→ 實際 F14 後 8 service;`dev.yml` 行 3/5、`prod.yml` 行 3 移除 track-a 字樣) |
| `refresh_token_secret.txt.example` | 首行註解「for nestjs」改指 rust-api `APP_JWT_REFRESH_SECRET_FILE` |

---

## E3: W-FA3 build script 刪除(刪、Stage 2)

- `deploy/build-nestjs.sh` 整檔刪除(該檔行 2 自註「F14 cutover 整支刪」)。

---

## E4: R3 — error code namespace 登記(改、Stage 1)

`sys_user_error.rs` 的 5 個 `1xxx` legacy code 登記進 `code.rs` F4 namespace 表。

**E4-a `code.rs`**(`rust-api/server/core/src/web/code.rs`):新增 5 個常數,命名對齊既有 `pub const CODE_<group>_<semantic>: u16` 慣例:

```
pub const CODE_USER_NOT_FOUND: u16 = 1001;
pub const CODE_USER_WRONG_PASSWORD: u16 = 1002;
pub const CODE_USER_AUTHENTICATION_FAILED: u16 = 1003;
pub const CODE_USER_USERNAME_ALREADY_EXISTS: u16 = 1004;
pub const CODE_USER_INVALID_STATUS: u16 = 1005;
```

(確切常數名 implement 時對齊 `code.rs` 既有命名風格微調;`1xxx` 與既有 group 值域 `0/3333/4001-4003/5001-5004/6001-6004/7777-7778/8888-8889/9001-9005/9998-9999` 無衝突。)

**E4-b `sys_user_error.rs`**(`rust-api/server/service/src/admin/errors/sys_user_error.rs`):`fn code(&self) -> u16` 內 5 個 inline integer literal 改引用 `code.rs` 常數(加 `use server_core::web::code;`):

```
UserError::UserNotFound          => code::CODE_USER_NOT_FOUND,        // 原 1001
UserError::WrongPassword         => code::CODE_USER_WRONG_PASSWORD,   // 原 1002
... (5 個)
```

**設計要點**:
| 項目 | 決策 |
|---|---|
| 行為 | **零改變** — `fn code()` 對外回的 `u16` 數值與 F14 前完全相同(1001-1005);只是定義從 inline literal 變 namespace 常數引用 |
| 範疇 | 嚴格限 `sys_user_error.rs` 5 個 `1xxx`(per spec FR-013/014/025);其他 service error 檔的 inline literal 不在 F14 範疇 |
| F3 Scenario 9 | 不修(spec FR-025、per brainstorm Q2 — 軟刪 user 登入回 1001 vs 期望 6001 的差異 functionally benign、不碰) |

---

## E5: R4 — secret 範本補齊(新增、Stage 2)

- 新增 `deploy/secrets/cleanup_database_url.txt.example`,格式對齊既有 6 個 `.txt.example`(單行 placeholder、無註解);`.gitignore` 既有 `!/deploy/secrets/*.txt.example` 規則自動涵蓋追蹤。

---

## E6: doc 收尾(改、Stage 2)

| 檔案 | 改動 |
|---|---|
| `CLAUDE.md` §5.2 | port 表移除 nestjs `:11082` 列;「目前現況」描述移除 DESIGN-A track-a 變體 |
| `CLAUDE.md` §5.2.1 | 移除整段「DESIGN-A 路線 dev」(`--profile track-a` 啟動變體 + `build-nestjs.sh` + nestjs refreshToken 驗命令),只餘 dev / prod baseline / prod+acme 三模式 |
| `CLAUDE.md` §10 | SPECKIT marker 指向 029(`/speckit-plan` agent context update 處理) |
| `deploy/front-nginx/README.md` | 移除 line 86 nestjs/TRANSITIONAL boundary note(或改為「TRANSITIONAL block 已於 F14 移除」歷史註記) |
| `docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md` | 檔頭 line 1 後插入 `>` blockquote「**[F14 已封存]** DESIGN-A 過渡期結束、保留為歷史參考、現行架構見 DESIGN-B」 |
| `docs/INTEGRATION-DESIGN-B-RUST-ONLY.md` | 檔頭 line 1 後插入 `>` blockquote「**[F14 現行設計]** DESIGN-A cutover 完成、本檔為 rev1 現行架構」 |
| `docs/INTEGRATION-CHECKLIST.md` | F14 row 推進、Current Focus 更新(DESIGN-A §6.1 全 14 feature 完成、DESIGN-B 生效)、加 F14 里程碑、R3/R4 待辦項勾掉 |

---

## 元件互動 — cutover 後 refresh data flow

```
base-web SPA  ── POST /api/auth/refreshToken ──▶  front-nginx(:11080 dev / :11443 prod)
                                                     │  E1 後:無 TRANSITIONAL exact-match block
                                                     │  → location /api/  proxy_pass http://rust_api/
                                                     ▼
                                               rust-api  POST /auth/refreshToken(F13 已實作)
                                                     │  /api/ 前綴 strip;refresh token 輪替
                                                     ▼
                                               F4 envelope { code:0, data:{ token, refreshToken } }
                                                     │
base-web  ◀──────────────────────────────────────────┘  String(0)==="0" → success ✓(R1 已證)

（nestjs container 已從 stack 移除;refresh_token_secret 仍由 rust-api 用;
  Casbin redis pub-sub channel 保留 rust-to-rust）
```

---

## Data Model 完成標誌

- ✅ E1 nginx TRANSITIONAL block 拔除(3 block、sed range-delete、刪後落 `location /api/`)
- ✅ E2 docker-compose nestjs service 移除(3 檔、`refresh_token_secret` 保留、檔頭註解修正)
- ✅ E3 W-FA3 build script 刪除
- ✅ E4 R3 error code namespace 登記(5 個 `CODE_USER_*` 常數、零行為改變)
- ✅ E5 R4 secret 範本補齊
- ✅ E6 doc 收尾(CLAUDE.md / README / DESIGN-A / DESIGN-B / CHECKLIST)
- ✅ 無 DB schema 改、無 migration、無 base-web 改、不刪 `refresh_token_secret`、不拔 Casbin pub-sub、不刪 nestjs fork 源碼目錄
- ✅ Ready for contracts/verification-commands.md + quickstart.md

**Constitution Re-check(post data-model)**:E1-E6 確認 — cutover 本體(E1/E2/E3/E5/E6)符合 Principle V line 87 遷移路徑(只動 nginx + docker-compose);E4(R3)為零行為改變的 error code 常數登記、非業務邏輯改動;無 DB 寫入(II)、無服務間 forward(III、且 F14 即移除 nestjs)、base-web 0 diff(IV)、不碰 Casbin enforce(I)。**5 PASS / 0 violation 維持**。
