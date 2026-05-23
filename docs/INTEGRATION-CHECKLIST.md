# INTEGRATION-CHECKLIST — rev1 整合進度追蹤

> **此檔 = 整合進度的單一真相**：Current Focus（現狀）+ Follow-up Backlog（衍生工作）+ 已完成里程碑 + Roadmap 狀態 + 跨 feature 待驗證項。
> 不放原則（→ `.specify/memory/constitution.md`）、不放規格細節（→ `specs/<NNN>/`）、不放 brainstorm 決策（→ `docs/superpowers/<NNN>-feature.md`）、不放操作參考事實（如預設帳號 → CLAUDE.md §8）。
> 每次 session SOP hook（`.claude/hook-git-submodule-SOP.sh`）自動 cat 全檔注入 Claude session 第一輪 additional context —— 故各節須維持精簡。

---

## 🎯 Current Focus

**現狀**：DESIGN-A §6.1 全 14 application feature（F1–F14）+ Phase W deploy（W-F1~W-F7、W-F11、Track DESIGN-A W-FA1/2/3）全部落地，**DESIGN-B（rust-only）形態生效**。**W-WEBUI 軌道（base-web 管理後台接線）已完成** —— 031 user-crud、032 menu-crud、033 role-crud、034 role-authorization 四 feature 全部落地。**W-WEBUI follow-up 軌道已全部清空** —— 035 user-role-and-password-wiring（W-FW5）+ 036 menu-field-persistence（W-FW7）+ 037 role-authorization-completion（W-FW6）+ 038 button-auth-completion（W-FW8）全部落地。

**Active feature**：—（無進行中 feature）

**下一步**：observability（W-F12/13/14）—— Phase W deploy 最後一個 phase。

---

## 📋 Follow-up Backlog

> 各 feature 在 brainstorm / implement / acceptance / review 階段發現、需另開 feature 或 follow-up 處理的衍生工作項 —— 整合進度的「不遺漏」權威清單。新發現一律登記於此（per 維護指引）；排程成 feature 並完成後從本節移除（「已完成里程碑」會留紀錄）。

### 衍生 follow-up（feature 執行中發現）

| ID | 發現來源 | 項目 | 規劃去向 |
|---|---|---|---|
| R2 | F14 DESIGN-B cutover review | F5.1 登入失敗無 audit —— `pwd_login` 只在成功路徑呼 `send_login_event`，密碼錯誤不寫 row（spec 005 FR-007 / SC-009 未實作） | follow-up（DESIGN-B 若要求 audit 完整性則須補） |
| F3-N1 | F3 implement | `sys_endpoint::insert_many` 繞 facade fully-qualified 呼叫（facade 只封 SELECT/DELETE） | 評估（audit path 若納 INSERT，facade 補 `insert_many` wrapper） |
| F3-N2 | F3 implement | `sys_access_key` delete atomicity gap —— facade commit → `sign::remove_key` 兩步間 crash 留 orphan key | 評估（改 DB-as-truth + reload pattern） |
| F3-N3 | F3 implement | `sys_endpoint::batch_remove_endpoints` partial-failure 失去 atomicity | 評估（outbox 模式可重整） |
| F3-N4 | F3 G6 review | pre-existing `print!("user is {:#?}", user)` debug 痕 3 處（sys_user_api / sys_menu_api / sys_authorization_service） | 任一後續 feature 順手清 |
| F3-N5 | F3 analyse | `specs/002` data-model §E4 範例 path 與實際 impl 位置 drift（impl 落 `server-model/soft_delete_impls.rs`） | spec hygiene（補 errata 一行） |
| F3-N6 | F3 implement | F2 audit-log schema 升級後 F3 helper 對齊（F3 FR-022 預告 callsite 不需動） | F2.1 內處理 —— F2.1 已完成、本項應已結案、待查證後移除 |
| 035-N1 | 035 final review | `add/update_user_for_systemmanage` 的 `create_user`/`update_user`（各自 txn）與 `assign_roles_to_user`（另一 txn）跨 service call 非單一 atomic —— 角色指派失敗時 user row + audit 已 commit。各寫入路徑自身 txn+audit 完整（Constitution II 逐 path 滿足）；真正單 txn 需把 `&txn` 穿過 service trait（較大重構） | 評估（service-layering 限制，比照既有 `assign_users` 體例；admin 低頻操作、失敗可重編輯） |

> ⚠️ F3-N1~N5 為 F3 階段（2026-05-14）所留、迄今未正式 review 結案 —— 下次觸及 audit / endpoint facade / `sys_access_key` 區域時應逐項查證並結案。
> 另有 minor 技術債（`docker-compose.yml` 檔頭 service 數註解 stale）—— 非 feature 級、任一相關 feature 順手清。
> **base-web TS `id` 型別債**（030–034 回顧 review 三處命中）：`src/typings` 的 `CommonRecord.id` 宣告 `number`、`Menu.parentId` 宣告 `number`，但 rust-api runtime 實際回字串（user / role id 為 ULID、menu `parentId` 為字串；另 `MenuRoute.id` rust `i32` ↔ base-web TS `string` 同類）。runtime 靠 JS 動態型別恰好可運作，TS 編譯器無法捕捉未來 regression。**032 的 `parentId` 字串/數字 deserializer fix（`149dc52`）本質即此型別債的後果**。W-WEBUI 軌道因 FR-015 禁碰 `src/typings` 無法修。建議 base-web cleanup sprint 統一：`CommonRecord.id` / `parentId` 改 `string`、複查相依比較邏輯（如 `parentId === 0`）。

### 規劃中、未排程（design 規劃、待排 feature）

| ID | 出處 | 項目 | 備註 |
|---|---|---|---|
| F1.2 | F1 拆分（F1.1 已交） | JWT algorithm 升級 + key versioning + refresh-token 預埋 | 原規劃 with F10；refresh token 已由 F10 / F13 另路完成，F1.2 剩餘範圍（algorithm / key versioning）待重新界定 |
| F2.2 | F2 拆分（F2.1 已交） | audit-log outbox + Redis subscriber TTL fallback | F2.1 只交 schema + transaction 紀律 + 統一 audit path |
| W-F6b | W-F6 留下 | acme.sh 真實 cert acquisition / renew 流程 | 需公網 + 真實 domain + DNS provider creds |
| W-F12/13/14 | DESIGN-W-DEPLOYMENT §11 | observability 三件套（Phase W deploy P5） | Phase W deploy 最後一個 phase、未排程 |

---

## ✅ 已完成里程碑

- [x] outer git init + push（`miso168net/fork260509-rev1`、default branch `rev1-admin-root`）
- [x] worktree + submodule 配置（`base-web` / `rust-api` 雙重身分；CLAUDE.md §4 操作手冊）
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
- [x] **F11 extracted-stubs** ✅（2026-05-19 完成；outer `6299640` + merge `81ecb0d`、rust-api `c58e619`；spec `specs/020-extracted-stubs/`）— DESIGN-A 抽離項清單 4 條 stub endpoint
- [x] **F10.2 rust-tokenstatus-string-align** ✅（2026-05-19 完成；outer `d53e724` + merge `851ec79`、rust-api `cb97224`；spec `specs/019-rust-tokenstatus-string-align/`）— rust TokenStatus `unused`/`used` 字串對齊
- [x] **F10.1 rust-jwt-refresh-token-signing** ✅（2026-05-19 完成；outer `bd11d2b` + merge `48b70e6`、rust-api `211ef74`；spec `specs/018-rust-jwt-refresh-token-signing/`）— rust 簽 HS256 JWT refresh token
- [x] **F10 refresh-token-nestjs-bridge** ✅（2026-05-19 完成；outer `4d6fc28` + merge `8f0e84c`；spec `specs/017-refresh-token-nestjs-bridge/`）— refreshToken→nestjs bridge wire-up，application Phase 4 起點
- [x] **F7.1 fix-route-getuserroutes-wiring** ✅（2026-05-20 完成；outer `554436f` + merge `efe910e`、rust-api `4de171a`；spec `specs/023-fix-route-getuserroutes-wiring/`）— 修 `/route/getUserRoutes` 500 wiring + menu paginated wrapper
- [x] **F7.2 role-code-alignment** ✅（2026-05-20 完成；outer `68410df` + merge `476ca88`、rust-api `84cbc19`；spec `specs/024-role-code-alignment/`）— getUserInfo role code alias 映射（ROLE_*→R_*）
- [x] **F8 assign-users** ✅（2026-05-20 完成；outer `f1bfff7` + merge `c2b0912`、rust-api `90f37d1`；spec `specs/025-assign-users/`）— assign-users user-role 指派 endpoint，application Phase 3 收尾
- [x] **F7 manage-crud-alignment** ✅（2026-05-20 完成；outer `44c7424` + merge `136b1eb`、rust-api `11b888c`；spec `specs/022-manage-crud-alignment/`）— manage/* 4 模組 CRUD 讀側形狀對齊
- [x] **F9 systemManage-alias-router** ✅（2026-05-20 完成；outer `260f2c6` + merge `b2f910c`、rust-api `b744c8e`；spec `specs/021-systemmanage-alias-router/`）— `/systemManage/*` alias router（10 條 alias endpoint）
- [x] **W-F11 rust-horizontal-scaling** ✅（2026-05-21 完成；outer `d02c7c9` + merge `d2d4c4c`、rust-api `d122b23`；spec `specs/026-rust-horizontal-scaling/`）— rust-api 水平擴展（Casbin redis pub-sub + 多 replica），Phase W-4
- [x] **F12 cleanup-job** ✅（2026-05-21 完成；outer `78e585c` + merge `86e56e5`、rust-api `30c8dd4`；spec `specs/027-cleanup-job/`）— cleanup binary 物理清除過期軟刪 row，DESIGN-A 本體 F1–F12 收尾
- [x] **F14 design-a-to-b-cutover** ✅（2026-05-21 完成；outer `33758f0` + merge `1f20a0d`、rust-api `729d3c6`；spec `specs/029-design-a-to-b-cutover/`）— DESIGN-A→B cutover、nestjs 完全退場，DESIGN-B 形態生效
- [x] **030 systemmanage-status-gender-alignment** ✅（2026-05-21 完成；outer `681dcbe` + merge `0ed2e85`、rust-api `0e1fb95`；spec `specs/030-systemmanage-status-gender-alignment/`）— systemManage status/gender enum 契約對齊
- [x] **F13 rust-refresh-token-impl** ✅（2026-05-21 完成；outer `a1e739c` + merge `4e9cf07`、rust-api `d019d8f`；spec `specs/028-rust-refresh-token-impl/`）— rust 自實作 refresh token 輪替，DESIGN-A §6.1 P5 起點
- [x] **034 role-authorization-wiring** ✅（2026-05-22 完成；outer `bead3fd` + merge `ff5ea63`、rust-api `e9787ed`、base-web `7325b091`；spec `specs/034-role-authorization-wiring/`）— base-web 角色菜單授權接線（menu-auth-modal 讀/寫接 rust `/systemManage/{getRoleMenuIds,assignRoleMenus}` 2 alias）+ assign_routes 空清單 clear-all 修正，13/13 C-V PASS，W-WEBUI 軌道第四個也是最後一個 feature
- [x] **033 role-crud-wiring** ✅（2026-05-22 完成；outer `fcf7280` + merge `729dbf9`、rust-api `536bf88`、base-web `ceafe62a`；spec `specs/033-role-crud-wiring/`）— base-web role CRUD 接線 + update_role status-drop 修正 + roleCode code-lock，W-WEBUI 軌道第三個 feature
- [x] **032 menu-crud-wiring** ✅（2026-05-22 完成；outer `d96aafa` + merge `8ccc4b4`、rust-api `149dc52`、base-web `b43634c0`；spec `specs/032-menu-crud-wiring/`）— base-web menu CRUD 接線，W-WEBUI 軌道第二個 feature
- [x] **031 user-crud-wiring** ✅（2026-05-22 完成；outer `10edf43` + merge `a09d316`、rust-api `2a24e9d`、base-web `1793b361`；spec `specs/031-user-crud-wiring/`）— base-web user CRUD 接線，W-WEBUI 軌道第一個 feature
- [x] **035 user-role-and-password-wiring** ✅（2026-05-23 完成；outer `4332a49` + merge `7020899`、rust-api `1de553e`、base-web `003de689`；spec `specs/035-user-role-and-password-wiring/`）— W-FW5；補完 W-FW1 留下的 user→roles 指派（rust `SystemManageUserOutput.user_roles` 真實批次填充 + transform DTO 收 `userRoles` delta 寫 `sys_user_role` 含 audit）+ 密碼 UX（修 `update_user` 密碼未 hash pre-existing bug + user 抽屜選填 password 欄 + 新增 `POST /auth/changePassword` 自助改密碼端點 + user-center 修改密碼面板），20/20 C-V PASS，W-WEBUI follow-up 軌道第一個 feature；含 `change_password` audit actor 型別 build-gate 修正 + user 抽屜角色欄 mock scaffolding 殘留去重（W-FW1 遺留、被 user_roles 真實填充曝出）2 個收尾修正
- [x] **036 menu-field-persistence** ✅（2026-05-23 完成；outer `1a77cff` + merge `dd7de46`、rust-api `8116080`、base-web 0 改動；spec `specs/036-menu-field-persistence/`）— W-FW7；補完 W-FW2 留下的 menu 欄位持久化缺口（W-FW2-N1）—— `sys_menu` 加 `query`/`buttons` (JSONB nullable) + `fixed_index_in_tab` (INTEGER nullable) 三欄、entity 同步、寫入路徑透傳（systemManage transform → native MenuInput → menu service）、admin CRUD 讀回（`SystemManageMenuOutput.From<MenuTree>` 填真值）、runtime 動態路由 `RouteMeta` 加 `query`+`fixedIndexInTab`（buttons 不進、Q2 拍板），20/20 C-V PASS（含 CDP modal 預填驗證），W-WEBUI follow-up 軌道第二個 feature；base-web 0 改動（exploration + Phase 0 R-Q1/R-Q2 驗證 modal UI 與 null 防護齊備）；Constitution v1.2.0「W-WEBUI 受管例外」第二次行使；既有 audit 路徑（`audit_log::write_in_txn` + `audit_snapshot`）自動涵蓋新 3 欄無需新邏輯
- [x] **037 role-authorization-completion** ✅（2026-05-23 完成；outer `90128e1` + merge `10b5bee`、rust-api `81c31d11`、base-web `bfa1494d`；spec `specs/037-role-authorization-completion/`）— W-FW6；整併 W-FW3/W-FW4 過渡留下的 3 個 follow-up：**N2 role home 持久化**（`sys_role` 加 `home_route_name VARCHAR NULL` + Casbin policy seed 4 row + 2 systemManage 端點 `getRoleHome/:roleId` GET + `updateRoleHome` POST + validation reject 不存在 / soft-deleted / constant menu + base-web menu-auth-modal `getHome`/`updateHome` 接真 API + 'home' sentinel → NULL）；**N3 `assign_routes`/`assign_users` audit gap**（trait signature 末尾 append `actor: &Actor` + `audit_log::write_in_txn` 於 txn commit 前 + whole-snapshot before/after `menuIds`/`userIds` camelCase + cascade 3 callsite + `assign_permission` 不動推遲 W-FW8）；**N4 role code 安全改名**（`update_role` detect `before.code != updated_role.code` 時 txn 內 `UPDATE casbin_rule SET v0=$1 WHERE ptype='p' AND v0=$2` + commit 後 `notify_casbin_changed()` 經 W-F11 redis pub-sub 觸發 enforcer reload + 拿掉 W-FW3 transform-layer code-lock）；C-V1~C-V27 全 27 條 PASS（curl + psql + Casbin reload log + CDP browser smoke via Edge :9229；C-V23 menu-auth-modal home dropdown E-1 fallback + pick + reopen pre-fill + clear；C-V24 role 編輯抽屜 roleCode editable + rename + 列表反映新 code + audit trail）；W-WEBUI follow-up 軌道第三個 feature；Constitution v1.2.0「W-WEBUI 受管例外」第三次行使（base-web 改 2 檔：system-manage.ts + menu-auth-modal.vue）；rust-api 改 14 處 + 2 新 migration；含 Code Quality Review feedback fix（assign_routes/assign_users audit payload JSON keys 改 camelCase 對齊 rev1 慣例）
- [x] **038 button-auth-completion** ✅（2026-05-23 完成；outer `fed76b5` + merge `<待回填>`、rust-api `610e136`、base-web `08bbe315`；spec `specs/038-button-auth-completion/`）— W-FW8；W-WEBUI follow-up 軌道收尾 feature；整併 W-FW4/W-FW6 過渡留下的最後 2 follow-up：**US1 button-auth modal 接通**（3 systemManage alias 端點 `getAllEndpoints` GET + `getRoleEndpointIds/:roleId` GET + `assignRoleEndpoints` POST + Casbin policy seed 6 row + base-web `button-auth-modal.vue` 拿掉 10 mock + 接通 3 endpoint API + Promise.all 並行 fetch + setLoading + toast + Casbin server-side enforce 真實生效）；**US2 assign_permission audit 補寫**（trait + impl signature 末尾 append `actor: &Actor` + `audit_log::write_in_txn`（payload camelCase `{roleId, domain, endpointIds:[...]}`, entity_type='sys_role', operation=Update, source=Internal）+ 空陣列允許清空 reconciliation（reject 條件改 `if !raw_input.is_empty() && valid_permissions.is_empty()` 同 assign_routes 體例）+ cascade 2 callsite handler；落地後 grep `audit_log::write_in_txn` in sys_authorization_service.rs 命中 3 次，W-FW6 N3 留下的最後 audit gap 補齊）；C-V1~C-V27 全 27 條 PASS（curl + psql + Casbin reload log + CDP browser smoke via Edge :9229；C-V19 ROLE_SUPER 編輯抽屜 + 按钮权限 modal 開 + tree 12 group render；C-V20 R_WFW8_TEST modal submit + 「修改成功」toast；audit C-V13/14/15/16 + 軟刪 edge case C-V26/27）；W-WEBUI follow-up 軌道第四個也是最後一個 feature（**軌道全部清空**）；Constitution v1.3.0「W-WEBUI 受管例外擴 W-FW1–W-FW8」首次行使（base-web 改 2 檔：system-manage.ts + button-auth-modal.vue）；rust-api 改 12 處 + 1 新 data migration；0 schema migration、0 新 table、0 nestjs；下一步：observability（W-F12/13/14）

---

## 📐 Roadmap & Phase 狀態

DESIGN-A §6.1 application features（F1–F14）與 Phase W deploy（W-F1~W-F7、W-F11、Track DESIGN-A W-FA1/2/3）**全部 ✅ 完成** —— 逐 feature 完成日 / commit SHA 見「已完成里程碑」，brainstorm / spec / plan / tasks 設計鏈見 `specs/<NNN>/`。

| Phase | 範圍 | 狀態 |
|---|---|---|
| Application P1 | F1–F4（jwt-secrets / audit-log / soft-delete / response-shape） | ✅ 2026-05-15 全完成 |
| Application P2–P3 | F5.1–F9（login+menu / route-guard / manage-crud / alias-router / assign-users） | ✅ |
| Application P4 | F10–F12（refresh-token 三件套 / extracted-stubs / cleanup-job） | ✅ DESIGN-A 本體 F1–F12 收尾 |
| Application P5 | F13–F14（rust-refresh-token-impl / design-a-to-b-cutover） | ✅ DESIGN-B 形態生效 |
| Phase W deploy P1–P2 | W-F1~W-F7（dockerfile / compose / secret / nginx / port / TLS） | ✅ |
| Phase W deploy P4 | W-F11（rust 水平擴展） | ✅ |
| Phase W-7 Track DESIGN-A | W-FA1/2/3（nestjs compose / nginx transitional / cicd） | ✅ 完成 —— F14 後 nestjs 已退場（歷史） |

Phase 推進規則（P1 全完成才動 P2 等）見 design 文件 `DESIGN-A §6.1 / §6.2`、`DESIGN-W-DEPLOYMENT §11`。

**未排程**：observability W-F12/13/14、W-F6b —— 見 Follow-up Backlog。

---

## 🔬 跨 feature 待驗證項

依 constitution Principle IV「上游驗證」—— feature spec.md Assumptions 段帶上、實作時驗、驗完勾掉並回填結果。

- [x] 預設密碼 `123456` / rev1 dev stack 起動 + migration 套用 —— 後續多個 feature acceptance 已實證（dev stack 自 W-F3 起常態運行）
- [ ] **F3 acceptance tests**（`cargo test --test soft_delete_basics -- --ignored`，3 檔共 9 個 `#[ignore]` test）—— 需 `TEST_DATABASE_URL` + migration up；迄今未正式跑
- [ ] **CI lint workflow 實際觸發**（`.github/workflows/ci-soft-delete-lint.yml`）—— rev1 走 worktree + merge 流程、無 PR，此驗證項須另定觸發方式或評估廢止

**F14 DESIGN-B cutover 前完整性盤點**（specs 001–028、2026-05-21）：28 feature 全 COMPLETE / COMPLETE-WITH-NOTES、0 GAPS；R1 / R3 / R4 已於 F14 處理（詳見 `specs/029-design-a-to-b-cutover/` 與 git history）。**R2（F5.1 登入失敗無 audit）未結 → 見 Follow-up Backlog。**

---

## 📎 Brainstorming 決策快照

各 feature 的 brainstorm 拍板決策為 `docs/superpowers/<NNN>-feature.md`（spec-kit 設計鏈起點，與 `specs/<NNN>/` 對應）。本檔不重複 —— 查特定 feature 的決策請開該檔。

---

## 🛠 維護指引

feature 推進時，**在同一個 commit 內**更新本檔對應節：

| 時機 | 更新 |
|---|---|
| feature merge 回 default | 「已完成里程碑」加一條 entry（格式見下）；「Roadmap & Phase 狀態」對應 Phase 視需要更新 |
| brainstorm / implement / acceptance / review 發現衍生工作 | 「Follow-up Backlog」登記一條（標發現來源 + 階段） |
| follow-up 排程成 feature 並完成 | 從「Follow-up Backlog」移除（「已完成里程碑」會留紀錄） |
| 上游待驗證項驗完 | 「跨 feature 待驗證項」勾掉、結果回填 CLAUDE.md（操作事實）或 spec.md（feature-specific） |
| 每個 feature 收尾 | 「Current Focus」更新「現狀 + 下一步」 |

**里程碑 entry 格式規則**：「已完成里程碑」每條 feature entry 限**一行** —— 只記完成日期、outer / merge / worktree commit SHA、`specs/<NNN>/` 連結、一句話功能描述（體例見 F4 / F3 早期 entry）。**不抄**規格細節（user story 拆解、改動檔案清單、DTO / handler / helper 名、acceptance C-V 矩陣、R-Q、implement-time findings、Constitution Check 計數）—— 那些 `specs/<NNN>/` 已完整。

**精簡紀律**：本檔每 session 由 SOP hook 全檔注入 additional context，膨脹即是固定 context 稅。驗證證據（cargo test log、curl 輸出、psql 結果）→ spec.md / quickstart.md；feature 規格細節 → `specs/<NNN>/`；brainstorm 決策 → `docs/superpowers/`。本檔只留「現狀 + 衍生工作 + 完成索引 + 待驗證」四類精簡資訊。
