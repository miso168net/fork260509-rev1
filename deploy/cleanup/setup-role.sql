-- =============================================================================
-- deploy/cleanup/setup-role.sql
-- 建立 cleanup_job 最小權限 Postgres 角色（F12 cleanup-job 專用）
--
-- 用途：ops 初次部署時執行一次，建立供 cleanup binary 連線的受限角色。
--
-- 執行方式（ops，初次部署）：
--   psql -U <admin> -d <db> -v cleanup_pw="'<password>'" -f deploy/cleanup/setup-role.sql
--
--   密碼值必須在雙引號內再包一層單引號，例如：
--     -v cleanup_pw="'mysecret'"
--   這樣 :cleanup_pw（bare 形式）展開後即為合法 SQL 字串字面量 'mysecret'。
--
-- 密碼對齊：此處設定的密碼 MUST 與
--   deploy/secrets/cleanup_database_url.txt 內 DATABASE_URL 的密碼完全相同
--   （cleanup binary 以該 URL 連線 Postgres）。
--
-- 冪等性：可安全重複執行。
--   • 重跑時不帶 -v cleanup_pw：\if :{?cleanup_pw} 跳過密碼設定（密碼不變）、
--     GRANT 照常重套（天然冪等）。
--   • 重跑時帶 -v cleanup_pw：重設密碼並重套 GRANT。
--
-- 最小權限：cleanup_job 僅具備
--   • USAGE ON SCHEMA public
--   • SELECT, DELETE 於 7 張軟刪除資料表
--   • SELECT, INSERT 於 sys_operation_log（稽核，不可 DELETE）
--   — 無其他任何權限。
--
-- ⚠ 注意（偏離 spec data-model E6 / research R-Q5）：
--   spec 原提案使用 DO $$ $$ block 做條件式 CREATE ROLE。
--   實測（postgres:17.4）證明 psql 變數插值（:var 與 :'var'）在 DO $$ $$ dollar-quoted
--   block 內均不生效（syntax error at or near ":"）。
--   本腳本改為頂層 SELECT ... WHERE NOT EXISTS + \gexec 條件執行，
--   以及頂層 ALTER ROLE + \if :{?cleanup_pw} 條件密碼設定 — 此為唯一可行方案。
-- =============================================================================

-- 1. 條件式建立 cleanup_job role
--    PostgreSQL 的 CREATE ROLE 無原生 IF NOT EXISTS；psql 變數插值在 DO $$ $$ block 內
--    不生效（實測 syntax error）→ 改用頂層 SELECT ... WHERE NOT EXISTS + \gexec 條件執行。
SELECT 'CREATE ROLE cleanup_job LOGIN'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cleanup_job')
\gexec

-- 2. 設定 role 密碼
--    僅在呼叫端有以 -v cleanup_pw=... 帶入時執行；idempotent 重跑（不帶變數）則跳過、密碼不變。
--    :cleanup_pw 為 bare 形式 — 呼叫端帶入的值「已含外層單引號」（見檔頭說明），
--    psql 在頂層 ALTER ROLE 陳述句正常插值。
\if :{?cleanup_pw}
ALTER ROLE cleanup_job PASSWORD :cleanup_pw;
\else
\echo 'NOTE: cleanup_pw 未提供 — 跳過密碼設定（idempotent re-run 模式、role 密碼不變）'
\endif

-- 3. 最小權限 GRANT（GRANT 天然 idempotent、重跑無害）
GRANT USAGE ON SCHEMA public TO cleanup_job;
GRANT SELECT, DELETE ON sys_user, sys_role, sys_menu, sys_domain, sys_organization, sys_endpoint, sys_access_key TO cleanup_job;
GRANT SELECT, INSERT ON sys_operation_log TO cleanup_job;
