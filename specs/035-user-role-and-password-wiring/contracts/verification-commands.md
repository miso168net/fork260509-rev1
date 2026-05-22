# Acceptance Contract — W-FW5 user-role-and-password-wiring

C-V 驗證矩陣（CDP browser smoke + curl + psql）。dev stack 啟動見 [`../quickstart.md`](../quickstart.md)。

| ID | 對應 | 驗證 |
|---|---|---|
| C-V1 | build | rust-api + base-web image build 成功、dev stack `up -d --wait` 起 |
| C-V2 | US1 / FR-004 | curl `GET /api/systemManage/getUserList`（Soybean token）→ 回傳的 user 含真實 `userRoles`（role code 陣列）；對照 psql `sys_user_role JOIN sys_role` 一致 |
| C-V3 | US1 / FR-002,003 | curl `POST /api/systemManage/updateUser`（某 user 改 `userRoles`，加一個 / 去一個）→ code 0；psql `sys_user_role` delta 正確（新增 row 增、移除 row 減） |
| C-V4 | US1 / FR-002 / E-2 | curl updateUser 送空 `userRoles: []` → code 0；psql 該 user 的 `sys_user_role` row 全清 |
| C-V5 | US1 / FR-002 | curl `POST /api/systemManage/addUser`（帶 `userRoles`）→ code 0；psql 新 user 的 `sys_user_role` 含指定角色 |
| C-V6 | US1 / E-6 | curl updateUser 送一個不存在的 role code → 後端拒絕（非 0 envelope）、psql 不寫入無效關聯 |
| C-V7 | US1 / SC-003 | 對某 user 改角色後，該 user 重新登入（curl `/api/auth/login`）→ getUserInfo / 動態選單反映新角色集合 |
| C-V8 | US2 / FR-007 / SC-004 | curl addUser 帶 `password` → 新 user 可用該密碼 curl `/api/auth/login` 成功；addUser 不帶 password → 新 user 以預設密碼登入成功 |
| C-V9 | US2 / FR-008 / SC-004 | curl updateUser 帶新 `password` → 該 user 可用新密碼登入、舊密碼登入失敗；updateUser 不帶 password → 密碼不變（仍可用原密碼登入） |
| C-V10 | US2 / FR-009 / SC-006 | psql 查經 addUser / updateUser 寫入的 user `sys_user.password` → 為 argon2 hash 格式（`$argon2...`）、非明文 |
| C-V11 | US3 / FR-011 / SC-005 | curl `POST /api/auth/changePassword`（某 user token，正確舊密碼 + 新密碼）→ code 0；該 user 可用新密碼登入、舊密碼失效 |
| C-V12 | US3 / FR-011 / E-5 | curl changePassword 送**錯誤**舊密碼 → 後端拒絕（非 0 envelope）；psql 該 user 密碼不變 |
| C-V13 | US3 / FR-013 / SC-006 | psql 查 changePassword 後的 `sys_user.password` → argon2 hash 格式、非明文 |
| C-V14 | FR-014 / SC-007 | curl updateUser / changePassword 用無權限 token → 被拒（非 0 envelope）|
| C-V15 | US1+US2 / SC-001,002 | CDP 走訪 `/manage/user`：對某 user 開編輯抽屜 → 角色欄預填現有角色 → 調整角色 + 填新密碼送出 → UI 成功 + DB `sys_user_role` 與 `sys_user.password` 一致 |
| C-V16 | US1 / SC-001 | CDP：C-V15 送出後再次開啟同一 user 編輯抽屜 → 角色欄勾選與剛送出的一致 |
| C-V17 | US3 / SC-005 | CDP 走訪帳號中心：修改密碼面板 —— 舊密碼錯→顯示錯誤不誤報、舊密碼對→成功；新密碼≠確認→前端阻擋送出（FR-012）|
| C-V18 | FR-010 / FR-015 / SC-007 | CDP：後端拒絕情境（changePassword 舊密碼錯、updateUser 後端拒）→ base-web 呈現錯誤、抽屜 / 面板不關閉、不誤報成功 |
| C-V19 | SC-009 regression | CDP 登入 + 動態 menu + user / menu / role 三表 CRUD 仍正常 |
| C-V20 | FR-017,018,019 / SC-008 | git diff：base-web 限 4 受控檔（`user-operate-drawer.vue` / `user-center/index.vue` / `system-manage.ts` / `auth.ts`）、且 UI 新增限 §4 amendment 授權範圍（password 欄 / 修改密碼面板）；rust-api 限 plan 列元件；0 nestjs；0 型別 / render / router / store / i18n / 版面重構；後端 user / role / sys_user_role 0 schema 變更 |

> 針對性 C-V：**C-V7**（角色變更對權限生效、R-Q1 既有 JWT 機制）、**C-V10 / C-V13**（密碼 argon2 hash 落庫、FR-009/013 修正驗證）、**C-V12**（舊密碼錯誤拒絕）為 W-FW5-specific 重點、必跑。
