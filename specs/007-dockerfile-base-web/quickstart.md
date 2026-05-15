# Quickstart: W-F2 dockerfile-base-web

**Feature**: 007-dockerfile-base-web
**Phase**: 1 (design - validation steps)
**Date**: 2026-05-15
**Audience**: 跑 W-F2 acceptance test / verify implementation 的 dev 或 CI agent

**Goal**: 在乾淨環境跑通 spec.md 的 12 個 acceptance scenario(AC-1 ~ AC-12 對應 Dimension A-E)。

---

## Prerequisites

| Item | Version | Note |
|---|---|---|
| Docker | >= 20.10 | BuildKit 預設啟用 |
| Host arch | `linux/amd64` | W-F2 inherit W-F1 Q2、amd64 only |
| Disk | >= 3GB free | builder + image |
| Network | 可 pull `node:22-slim` + `nginx:1.27-alpine` + pnpm registry | 第一次 build |

驗證 docker BuildKit:`docker buildx version`(exit 0 為 pass)

---

## Acceptance Plan(對應 spec.md 12 scenarios)

### Dimension A — Dockerfile 結構建立(scenarios 1-3)

#### Scenario 1 — Build success

```bash
docker builder prune -f       # 確保 cache 乾淨(可選)

cd base-web/
time docker build \
    --build-arg VITE_SERVICE_BASE_URL=/api \
    --build-arg VITE_SERVICE_SUCCESS_CODE=0 \
    -t base-web:test .

# 預期:
# - exit 0
# - output 含 [builder X/Y] + [runtime X/Y] step 標籤
# - 第一次無 cache build 預計 5-10 分鐘(pnpm install + Vite build,依 host CPU)
```

#### Scenario 2 — Image size < 100MB

```bash
docker image inspect base-web:test --format='{{.Size}}' | awk '{printf "%.1f MB\n", $1/1024/1024}'

# 預期:< 100MB target / 100-130MB acceptable / > 150MB 須優化
```

#### Scenario 3 — Cache hit < 30s

```bash
time docker build -t base-web:test base-web/         # 不 prune,立即重 build
# 預期:< 30 sec、大量 CACHED layer 標記、manifest sha 與第一次相同
```

---

### Dimension B — Non-root user + nginx config valid(scenarios 4-5)

#### Scenario 4 — Non-root user(uid 對齊 spec 預期 101)

```bash
docker run --rm --entrypoint id base-web:test

# 預期:uid=101(nginx) gid=101(nginx)
# 若實際 uid 為 100 而非 101(alpine system user 範圍視 nginx image 版本),
# acceptance scenario 接受 100-110 範圍、user name = nginx 即 OK
```

#### Scenario 5 — nginx -t

```bash
docker run --rm --entrypoint nginx base-web:test -t

# 預期:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

### Dimension C — Runtime + healthcheck(scenarios 6-7)

#### Scenario 6 — port 8080 listening

```bash
docker run -d --name w-f2-test -p 8080:8080 base-web:test
sleep 3

nc -zv localhost 8080
# 預期:Connection to localhost (127.0.0.1) 8080 port [tcp/*] succeeded!
```

#### Scenario 7 — /health endpoint

```bash
curl -fsS http://localhost:8080/health
# 預期 stdout: ok

curl -I http://localhost:8080/health
# 預期 header 含:
#   HTTP/1.1 200 OK
#   Content-Type: text/plain
```

---

### Dimension D — SPA 路由 + assets cache(scenarios 8-10)

#### Scenario 8 — SPA root index.html

```bash
curl -fsS http://localhost:8080/ | grep -E "<title>|<div id=\"app\""
# 預期:
# - 至少 1 行命中 <title>...</title>
# - 至少 1 行命中 <div id="app"> 或類似 Vue mount point

curl -I http://localhost:8080/ | grep -E "Cache-Control"
# 預期:Cache-Control: no-cache, no-store, must-revalidate(per R-007 / FR-019)
```

#### Scenario 9 — SPA fallback unknown path

```bash
RESPONSE_1=$(curl -fsS http://localhost:8080/)
RESPONSE_2=$(curl -fsS http://localhost:8080/some/unknown/spa/route)

# 預期:RESPONSE_1 == RESPONSE_2(SPA fallback 對任何 path 返同 index.html)
diff <(echo "$RESPONSE_1") <(echo "$RESPONSE_2")
# 預期:無差異(exit 0)
```

#### Scenario 10 — Assets cache header

```bash
# 找一個 hashed asset 名稱
ASSET=$(docker exec w-f2-test sh -c 'ls /usr/share/nginx/html/assets/*.js | head -1' | xargs basename)
echo "Asset under test: $ASSET"

curl -I http://localhost:8080/assets/$ASSET 2>&1 | grep -E "Cache-Control|Expires"
# 預期 header 含:
#   Cache-Control: public, immutable
#   Expires: (30 天後的日期)
```

---

### Dimension E — VITE 注入 + TZ(scenarios 11-12)

#### Scenario 11 — VITE_SERVICE_BASE_URL = /api 真注入

```bash
docker exec w-f2-test sh -c 'grep "\"/api\"" /usr/share/nginx/html/assets/*.js | head -3'

# 預期:≥ 1 命中
# 形式類似:assets/main.abc123.js: ..."baseURL":"/api"...
# 證明:
# - .env.prod 內 mock URL 已被 process.env override
# - bundle 內含 literal /api
# - Q2 build-arg pattern 成功
```

#### Scenario 12 — TZ

```bash
docker exec w-f2-test date
# 預期:Fri May 15 06:xx:xx CST 2026(Asia/Shanghai timezone)

docker exec w-f2-test date -u
# 預期:Thu May 14 22:xx:xx UTC 2026(UTC、與 CST 差 8 小時)
```

#### Cleanup

```bash
docker stop w-f2-test && docker rm w-f2-test
```

---

## SC verification 對照

| SC | Verification 命令 | Pass criteria |
|---|---|---|
| SC-001 | Scenario 1 + `time docker build` | 5-10 分鐘(乾淨 cache) |
| SC-002 | Scenario 2 | < 100MB target、100-130MB acceptable |
| SC-003 | Scenario 3 | < 30 sec(cache hit) |
| SC-004 | Scenario 7 + `for i in {1..100}; do time curl -s http://localhost:8080/health > /dev/null; done` + p99 量化 | p99 < 50ms(local docker network) |
| SC-005 | Dimension A-E 全 12 scenarios | 100% pass |
| SC-006 | Scenario 9 + curl 多個 unknown path | 全返同 index.html |
| SC-007 | Scenario 11 | grep ≥ 1 命中 /api |
| SC-008 | (post-implement)W-F3 / W-F4 spec/plan 階段檢查 W-F2 是否成為 blocker | 無 referrer block |

---

## Troubleshooting

### `pnpm install` 失敗
- 看 stderr,可能 native binding 需 python3 / make / g++ → Dockerfile builder stage 加 `RUN apt install -y python3 make g++`
- 或:lockfile 過時、用 `pnpm install --no-frozen-lockfile` 一次更新 lockfile + commit(但這違反 spec FR-004 "frozen lockfile")
- 重 build:`docker builder prune -f && docker build ...`

### `pnpm build` 失敗
- 看 stderr,可能 TypeScript / ESLint 錯誤 → 修 base source(但這違反 FR-025)
- 或:Vite plugin 不相容 node 22 → 降回 `node:20-slim`(改 Dockerfile ARG NODE_VERSION=20)
- 或:OOM(out of memory)→ docker daemon 加 memory limit、或 base-web manualChunks

### Image size > 130MB
- `docker history base-web:test` 看哪層大
- 常見:nginx alpine ~30MB + tzdata/curl ~10MB + SPA dist ~80-100MB(NaiveUI + AntV charts 等)
- 優化:Vite manualChunks 拆 vendor chunk(改 vite.config.ts、屬 FR-025 例外、需 plan 階段 justify)
- 或:dynamic import 大 chart 模組、減 initial bundle

### `/health` 永遠 404
- 確認 nginx config COPY 成功:`docker exec w-f2-test cat /etc/nginx/conf.d/default.conf | head -20`
- 確認 nginx 起著:`docker logs w-f2-test 2>&1 | tail -5`(無 error)
- 確認 location order:`location = /health` MUST 在 `location /` 之前(語法上順序不重要、優先級看 prefix 類型,但編輯時放前面可讀性更好)

### `/api` 未在 bundle 內(Scenario 11 fail)
- per R-002:Vite loadEnv 應 merge process.env、override .env.prod
- 確認 builder ENV 正確設:`docker run --rm builder-image-tag env | grep VITE`(若用中間 image)
- Fallback:寫 `.env.prod.local`(Vite 載入優先級高於 `.env.prod`):
  ```dockerfile
  RUN echo "VITE_SERVICE_BASE_URL=$VITE_SERVICE_BASE_URL" > .env.prod.local && \
      echo "VITE_SERVICE_SUCCESS_CODE=$VITE_SERVICE_SUCCESS_CODE" >> .env.prod.local && \
      pnpm build
  ```

### `Cache-Control` no-cache 不生效(瀏覽器拉到舊 index.html)
- 確認 nginx config 內 `location /` 含 `add_header Cache-Control "no-cache, no-store, must-revalidate"`
- 確認 build 真的把 nginx config COPY 進去:`docker exec w-f2-test cat /etc/nginx/conf.d/default.conf | grep Cache-Control`

---

## 兩段式 commit / git workflow(per CLAUDE.md §6.1)

W-F2 implementation 完成時:

```bash
# === 第一段:base-web worktree ===
cd base-web/
git status        # 確認在 rev1-admin-base-web 分支
git add Dockerfile deploy/nginx.conf .dockerignore
git commit -m "feat(base-web): W-F2 dockerfile-base-web 落地（multi-stage Vite + nginx + /health endpoint）"
git push origin rev1-admin-base-web

# === 第二段:outer feature branch ===
cd ..
git branch --show-current   # 應 006-dockerfile-rust-api 或 007-dockerfile-base-web
git add base-web specs/007-dockerfile-base-web/
git commit -m "chore(submodule): bump base-web 到 <short-sha> — W-F2 dockerfile-base-web 完整落地 + spec-kit 全套"
# push 須 user 同意(per CLAUDE.md §5)
```

Feature 完成後 merge `007-dockerfile-base-web` → `rev1-admin-root`,Phase W deploy P1 進度 2/4(W-F1 ✅ + W-F2 ✅;W-F3 / W-F4 待動)。
