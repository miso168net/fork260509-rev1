# Contract: W-FA1 secret + entrypoint wrapper 契約

**Feature**: W-FA1 — compose-nestjs-service
**Contract type**: W-F4 `_FILE` pattern 對齊 + nestjs entrypoint wrapper interface
**Date**: 2026-05-18

> 本契約定義 W-FA1 對 docker secrets 的使用方式 + entrypoint sh wrapper bridge `_FILE` → env 的具體 shape。

---

## C-S1:nestjs container `secrets:` 4 個 ref

```yaml
secrets:
  - jwt_secret             # W-F4 既有(64 hex chars)
  - database_url           # W-F4 既有(postgresql://soybean:...@postgres:5432/soybean_admin_rust)
  - redis_password         # W-F4 既有
  - refresh_token_secret   # W-FA1 新增(可為空、fallback JWT_SECRET)
```

**契約**(per spec FR-004):
- nestjs container `secrets:` block 必含此 4 個 secret(其他既有 secret like postgres_password / redis_url / acme_email 不需 ref 到 nestjs)
- 每 secret file mount 在 nestjs container 路徑 `/run/secrets/<name>`(docker engine default、不可改)
- nestjs container USER `node`(per fork Dockerfile line 70)有 read 權限(docker secret 預設 0444 + root owner、所有 user readable)

---

## C-S2:entrypoint sh wrapper bridge shape

```yaml
entrypoint:
  - sh
  - -c
  - |
    export JWT_SECRET=$$(cat /run/secrets/jwt_secret)
    export REFRESH_TOKEN_SECRET=$$(cat /run/secrets/refresh_token_secret 2>/dev/null || echo "$$JWT_SECRET")
    export DATABASE_URL=$$(cat /run/secrets/database_url)
    export REDIS_PASSWORD=$$(cat /run/secrets/redis_password)
    exec node dist/apps/base-system/src/main
```

**契約**(per spec FR-003 + research R-5):

### Shell escape 規則

| YAML literal | docker compose 解析 | Shell 執行 |
|---|---|---|
| `$$(cat ...)` | `$(cat ...)` | sh 執行 `$(...)` command substitution |
| `$$JWT_SECRET` | `$JWT_SECRET` | sh 拿 shell var |
| `"$$JWT_SECRET"` | `"$JWT_SECRET"` | sh 拿 shell var(雙引號內) |

**為何 `$$`**:yaml literal block 內 `$` 被 docker compose 解釋為環境變數 interpolation;`$$` escape 為 literal `$`、傳給 sh、再被 sh interpret。

### Fallback 邏輯(refresh_token_secret 缺 / 空)

```sh
export REFRESH_TOKEN_SECRET=$(cat /run/secrets/refresh_token_secret 2>/dev/null || echo "$JWT_SECRET")
```

- 若 file 不存在:`cat` 報錯到 stderr、`2>/dev/null` 丟掉、`||` 觸發 fallback `echo "$JWT_SECRET"` — **但實際情況**:若 file 不存在,docker compose 啟動已經 fail-fast(per C-C5),此分支不會跑
- 若 file 存在但內容空:`cat` 成功 + 拿到空字串、`||` **不**觸發 fallback(因 cat exit 0)、`REFRESH_TOKEN_SECRET=""`、nestjs 啟動但 refresh token 可能用 empty string sign(security 風險、但屬 dev 階段 acceptable、F10 階段嚴格化)
- 若 file 存在 + 有內容:正常拿到 secret 字串

**改進 fallback 邏輯**(可選):
```sh
RTS=$(cat /run/secrets/refresh_token_secret 2>/dev/null)
export REFRESH_TOKEN_SECRET="${RTS:-$JWT_SECRET}"
```
這版確實處理「file 存在但空」也 fallback 到 JWT_SECRET。**W-FA1 implement 階段拍板用此 robust 版**(W-FA1 範疇內小調整、不影響整體設計)。

### exec node 行為

- `exec` 替換 sh process、nestjs 收 SIGTERM(docker stop)直接 graceful shutdown、不留 sh in process tree
- `node dist/apps/base-system/src/main` 對齊 nestjs fork package.json `start:prod`(per R-5)、不用 `cross-env`(NODE_ENV 由 compose `environment:` block 設、不需 cross-env)

---

## C-S3:`refresh_token_secret.txt` 內容規格

**Tracked file**(`deploy/secrets/refresh_token_secret.txt.example`)— per spec FR-005

```
# Refresh token signing secret for nestjs (W-FA1 / F10 future use)
# Generate via: openssl rand -hex 32
# Or leave file empty / missing → entrypoint fallback JWT_SECRET (per W-FA1 spec FR-005 / E-1)
REPLACE_WITH_64_HEX_CHARS_OR_LEAVE_EMPTY_FOR_FALLBACK
```

**Gitignored file**(`deploy/secrets/refresh_token_secret.txt`)— 本機 ad-hoc 備:

機器操作選項:
- 選項 A(推薦):`touch deploy/secrets/refresh_token_secret.txt`(空檔、走 fallback、W-FA1 acceptance 階段測 fallback 路徑)
- 選項 B:`openssl rand -hex 32 > deploy/secrets/refresh_token_secret.txt`(64 hex chars、獨立 secret;F10 階段 nestjs sys_tokens rotation 需要時的最終形態)

W-FA1 acceptance 允許兩種狀態(per E-1)、F10 階段強制選項 B。

---

## C-S4:secret 不洩到 docker config / env / inspect

**契約**(per spec FR-003 + SC-005):

| Verification command | Expected output |
|---|---|
| `docker compose config | grep -iE "<actual_jwt_secret_first_8_chars>"` | 無 hit(plaintext 不洩) |
| `docker inspect rev1-admin-nestjs-1 | jq '.[0].Config.Env'` | 只顯示 `JWT_SECRET_FILE` 等 `_FILE` reference、不顯示 plaintext |
| `docker compose exec nestjs sh -c 'env | grep JWT_SECRET'` | `JWT_SECRET=<actual_value>`(這是 runtime env、預期會洩、但僅 container 內可訪、不洩到 docker daemon level) |

注意 nuance:
- `_FILE` pattern 保證 secret **不存在於 image layer / docker inspect Config.Env / docker compose config output**
- secret **仍存在於 container 內 process env**(因為 entrypoint wrapper 把它 export 進 env、nestjs 透 `process.env.JWT_SECRET` 拿)
- 防護目標是「不洩到外圍 metadata」、不是「不存在於 container 內 memory」

---

## C-S5:secret rotation 紀律(未來)

W-FA1 不處理 rotation、屬 follow-up:
- 若 JWT_SECRET rotation,操作:換 `deploy/secrets/jwt_secret.txt` 內容 → `docker compose restart nestjs`(或全 stack)
- 若 REFRESH_TOKEN_SECRET rotation,F10 階段定義(可能影響 sys_tokens 表內既有 token 全失效、屬 token rotation chain design)

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-S1 | nestjs secrets ref 4 個 |
| C-S2 | entrypoint sh wrapper shape |
| C-S3 | refresh_token_secret.txt 內容規格 |
| C-S4 | secret 不洩防護紀律 |
| C-S5 | rotation 紀律(W-FA1 範疇外) |

**5 個 secret/entrypoint contract、涵蓋 W-FA1 對 W-F4 _FILE pattern 的擴展**。
