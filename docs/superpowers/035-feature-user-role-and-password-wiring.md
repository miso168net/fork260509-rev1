# 035 — W-FW5 user-role-and-password-wiring（base-web user 角色指派 + 密碼 UX）

**Date**: 2026-05-22
**Status**: Brainstorm 完成、ready for `/speckit-specify`
**Brainstorm Session**: 2026-05-22（W-WEBUI follow-up 軌道第一個 feature；3 個釐清問題）

> 軌道：**W-WEBUI follow-up**（[`docs/INTEGRATION-DESIGN-W-WEBUI.md`](../INTEGRATION-DESIGN-W-WEBUI.md) §7.1）。W-FW5 整併 W-FW1-N1（user→roles 指派）+ W-FW1-N2（password UX）兩個 follow-up；是 W-FW1~W-FW4 完成後、3-feature follow-up 切分（W-FW5/6/7）的第一個。

---

## 緣由

W-FW1 `user-crud-wiring`（031）把 base-web `manage/user` 的新增/編輯/刪除/批次刪除接通，但當時刻意把兩塊切為 follow-up：

- **W-FW1-N1**：user→roles 指派 —— drawer 的角色多選欄 UI 已在、但後端 `SystemManageUserOutput.user_roles` 硬寫 `vec![]`、transform DTO 不收 `userRoles`，整條讀寫未接。
- **W-FW1-N2**：password UX —— 建立用後端硬寫預設密碼（`123456`，W-FW1 A-004 拍板的整合期過渡），無 admin 重設、無 user 自改 UI。

W-FW5 把這兩塊補完，讓 base-web user 管理「完整可用」。

## 探勘現況（2026-05-22）

**Part A — 角色欄（base-web 已接、後端未接）**
- `user-operate-drawer.vue`：`userRoles` 多選欄完整接線 —— `fetchGetAllRoles()` 填選項、`handleSubmit` 送出含 `userRoles`、edit 模式 `Object.assign` 預填。base-web 側無缺口。
- rust-api `SystemManageUserOutput.user_roles` 硬寫 `vec![]`（`output/sys_system_manage.rs`）—— 讀側假實作。
- `add_user_for_systemmanage` / `update_user_for_systemmanage` transform DTO 無 `user_roles` 欄 —— drawer 送的 `userRoles` 被 serde 靜默丟棄。
- `sys_user_role` 表存在（複合鍵 `user_id` + `role_id`）。`assign_users`（F8，role→users 反方向）有 delta insert/delete `sys_user_role` 的體例可參照，**但它不同步 Casbin `g` rule**。
- `/systemManage/getAllRoles` 端點存在（W-FW3，回 `id`/`roleName`/`roleCode`）。

**Part B — 密碼**
- `create_user`：密碼有 hash（`SecureUtil::hash_password`）。`add_user_for_systemmanage` transform 硬寫 `"123456"`。
- `update_user`（`sys_user_service.rs:213`）：若收到 password **直接 `Set(pw)` 未 hash**，帶 `// TODO: ... you should hash the password` 註解。`update_user_for_systemmanage` 目前傳 `password: None`，故此 bug path 尚未被觸發。
- user 列表頁無「重設密碼」按鈕；drawer 無 password 欄；`user-center/index.vue` 為 stub（`<LookForward/>`）。

## Brainstorm 釐清紀錄（Session 2026-05-22）

- **Q1（password 範疇）**：Part B 的 3 個 UI flow（建立設密碼 / admin 重設 / user 自改）都需 base-web 新增 UI、超出 W-WEBUI §4「只接線、不改 UI」邊界。→ **A：含完整密碼 UX**。3 個 flow 全做，接受擴 §4 base-web 邊界。
- **Q2（admin 重設機制）**：→ **A：drawer password 欄共用**。user drawer 加一個選填 password 欄 —— 建立時填=設初始密碼、編輯時留空=不改/填入=重設。一個欄位涵蓋「建立設密碼」+「admin 重設」兩個 flow，不需獨立 reset modal/按鈕/endpoint。
- **Q3（user 自改範疇）**：→ **A：補進 user-center stub 頁**。把現有 `user-center` stub 頁補成一個最小「修改密碼」面板（舊密碼+新密碼+確認）；路由已存在、不動 router；不做個人資料/頭像等非密碼功能（YAGNI）。

設計呈現後 user 確認：① 兩半合為一個 feature、② Casbin g 同步留 Phase 0 research、③ §4 amendment 走「只改 DESIGN-W-WEBUI §4、不動 Constitution」—— 三點皆同意。

## Scope summary

W-FW5 = 補完 base-web user 管理的兩塊缺口，分兩個 user story / 增量：

- **US1 — 使用者角色指派**：base-web user drawer 角色多選欄端到端接通（讀回現有角色 + 寫入變更）。純 rust-api 後端（drawer 已接線）。為最乾淨的 MVP。
- **US2 — 密碼 UX**：admin 建立/重設使用者密碼 + 使用者自助修改密碼 + 修 `update_user` 密碼未 hash 的 pre-existing bug。含 base-web UI 新增。

兩半相對獨立、可各自增量交付。

---

## 設計

### Part A — 使用者角色指派（US1，rust-api only、base-web 0 改動）

- **讀**：`SystemManageUserOutput.user_roles` 由硬寫 `vec![]` 改為實查 `sys_user_role`（該 user 的 role 集合）。`getUserList` 回的每筆 user 帶真實 `userRoles`，drawer edit 預填即正確。
- **寫**：`SystemManageAddUserInput` / `SystemManageUpdateUserInput` transform DTO 補 `user_roles` 欄；transform handler 在 create/update user 後對 `sys_user_role` 做 delta 更新（比照 `assign_users` 的 delta insert/delete 體例、user→roles 方向）。
- **Casbin `g` 同步**：`assign_users` 現不同步 Casbin `g` rule。W-FW5 寫 `sys_user_role` 後是否需同步 `casbin_rule` 的 `g` policy，取決於 enforcement 如何解析 user role —— 列為 spec-kit **Phase 0 research（R-Q）**。

### Part B — 密碼 UX（US2）

- **B1 · `update_user` 密碼 hash 修正**（rust-api native bug fix）：`sys_user_service.rs:213` 收到 password 時直接 `Set(pw)` 未 hash → 改為比照 `create_user` 用 `SecureUtil::hash_password`。pre-existing 安全 bug；密碼寫入路徑須先正確才能做 B2/B3。
- **B2 · admin 建立/重設密碼**（drawer password 欄）：user drawer 加一個**選填** password 欄 —— 建立模式填入即初始密碼、留空 fallback W-FW1 既有預設（`123456`，不破壞 A-004）；編輯模式留空=不改、填入=重設。`add`/`update` transform DTO 補 optional `password`；updateUser transform 把 password 傳進（經 B1 修正後正確 hash 的）`update_user`。
- **B3 · 使用者自助修改密碼**（user-center 頁）：`user-center/index.vue` stub 補成最小「修改密碼」面板（舊密碼 + 新密碼 + 確認新密碼）；新增 self-service change-password endpoint（驗證舊密碼 → hash 新密碼寫入），屬 `/auth/` 域（非 `/systemManage/` admin alias），端點路徑/體例由 Phase 0 / plan 定；base-web 新增對應 service function。

### §4 base-web 邊界 amendment（前置動作）

W-WEBUI §4 現範圍是「只接線、不改 UI」。B2（drawer 加 password 欄）/ B3（user-center 補面板）**新增 UI**，超出 §4。

→ **前置**：W-FW5 `/speckit-specify` 前先 amend `DESIGN-W-WEBUI §4`，加一類准動：「user 管理 / 帳號 password 相關的必要 UI 新增（drawer password 欄、user-center 修改密碼面板）」。Constitution Principle IV **不需改版**（其已將 W-WEBUI 精確範圍 defer 至 DESIGN-W-WEBUI §4）。比照 W-FW1 啟動前的 Constitution IV amendment 前置動作。此 amendment 是「W-WEBUI 受管例外」從「只接線」擴及「必要 UI 新增」的一次有意識放寬 —— §4 amendment 文字須明白寫出此放寬、spec-kit Constitution Check 會據以驗。

### 範疇外

- user-center 的個人資料編輯 / 頭像等非密碼功能（YAGNI）。
- 驗證碼登入 / 註冊 / 忘記密碼（reset-pwd）—— DESIGN-W-WEBUI §3.2 登入類 3 表單，「後端先行」性質、另立 follow-up。
- role / menu 相關（W-FW6 / W-FW7）。
- 後端角色 / 使用者資料表結構變更（`sys_user_role` 既有、不改 schema）。

### 驗收方向（CDP + curl + psql）

- **US1**：drawer 對某 user 改角色送出 → `sys_user_role` delta 正確；`getUserList` 回的 `userRoles` 與 DB 一致；Casbin g 視 research 結論驗。
- **US2**：admin drawer 建立帶密碼 user / 編輯重設密碼 → 能用新密碼登入；user-center 改密碼（舊密碼錯→拒、對→成功、新密碼可登入、舊密碼失效）；psql 查 `sys_user.password` 為 argon2 格式、非明文。

## Phase 0 research 預告（交 spec-kit `/speckit-plan`）

- **R-Q（Casbin g）**：enforcement 如何解析 user 的 role —— Casbin `g` rule（`casbin_rule` `ptype='g'`）驅動，還是 enforcement / login 另從 `sys_user_role` 解析？決定 Part A 寫 `sys_user_role` 後是否須同步 `g` policy。連帶查證 `assign_users`（F8）是否因此有 latent gap。
- **R-Q（self-service endpoint）**：rust-api 是否已有自助改密碼端點；無則新增 —— 端點域（`/auth/` vs 其他）、是否需現行 JWT actor 身分、舊密碼驗證體例。

## 與 spec-kit 的銜接

- 本文件餵 `/speckit-specify` 產 `specs/035-user-role-and-password-wiring/spec.md`。
- `/speckit-plan` 的 Phase 0 處理上述 2 個 R-Q。
- `/speckit-plan` 的 Constitution Check 須驗 §4 amendment 已落地（前置動作）。
- 比照 W-FW1~W-FW4：兩段式 commit、CDP + curl + psql 驗收、merge 回 `rev1-admin-root`。
