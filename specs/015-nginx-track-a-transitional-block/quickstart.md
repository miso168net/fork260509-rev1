# Quickstart: W-FA2 — nginx-track-a-transitional-block

**Phase 1 output** | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

> operator 跑 W-FA2 implement + acceptance 的最小步驟。對齊 W-FA1 quickstart 風格。

---

## Prerequisites

1. Outer branch = `015-nginx-track-a-transitional-block`(speckit.git.feature pre-hook 已建)
2. W-FA1 image `nestjs:rev1-admin-nestjs` 已 build(per W-FA1 落地、若無 → 跑 W-FA1 quickstart Step 1-2 build)
3. `deploy/secrets/refresh_token_secret.txt` 已備(per W-FA1 落定)
4. dev cert 已 seed(若要驗 prod modes、per W-F6 quickstart)

---

## Implement Steps(估 ~15-20 分鐘)

### Step 1:改 `default.conf`(dev 80 + dev 443 兩 server block 加 TRANSITIONAL inline block)

`deploy/front-nginx/conf.d/default.conf`、在既有 `server { listen 80; ... }` 內 `location /api/ { ... }` 之後加 ~9 行;在既有 `server { listen 443 ssl; ... }` 內同位置加 ~9 行。具體內容見 [contracts/nginx-contract.md](contracts/nginx-contract.md) C-N1。

### Step 2:改 `default.conf.prod`(prod 443 server block 加 TRANSITIONAL inline block)

`deploy/front-nginx/conf.d/default.conf.prod`、在既有 `server { listen 443 ssl; ... }` 內 `location /api/ { ... }` 之後加 ~9 行(prod 80 server 只 redirect、**不加**)。

### Step 3:改 `CLAUDE.md` §5.2.1

加 track-a 模式下 curl POST refreshToken 範例(對齊 dev 啟動範例風格、放第 4 個範例「DESIGN-A 路線 dev」之後)。具體見 [data-model.md](data-model.md) E-4。

### Step 4:改 `docs/INTEGRATION-CHECKLIST.md`

更新 3 段:Current Focus、Phase W-7 W-FA2 row、已完成里程碑(SHA 留 commit 後填)。具體見 [data-model.md](data-model.md) E-5。

### Step 5:Reload nginx + verify syntax

```bash
# track-a 模式 reload(nestjs container 已啟)
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose exec -T front-nginx nginx -s reload
docker compose exec -T front-nginx nginx -t
```

預期:nginx -t exit 0、7 service 全 healthy。

若 nginx -t fail、回 Step 1-2 檢 marker block syntax;若 reload 後 config 未生效(舊 config cached)→ `docker compose restart front-nginx`。

### Step 6:Acceptance scenarios(US1~US4、12 個 scenario)

跑 [contracts/verification-commands.md](contracts/verification-commands.md) C-V1 ~ C-V12 全部 12 個驗證命令。預期全 PASS。

### Step 7:單段 outer commit(per FR-009)

```bash
git status --short
# 預期:
#   modified: deploy/front-nginx/conf.d/default.conf
#   modified: deploy/front-nginx/conf.d/default.conf.prod
#   modified: CLAUDE.md
#   modified: docs/INTEGRATION-CHECKLIST.md
#   modified: .specify/feature.json
#   untracked: specs/015-nginx-track-a-transitional-block/

git add deploy/front-nginx/conf.d/default.conf \
        deploy/front-nginx/conf.d/default.conf.prod \
        CLAUDE.md \
        docs/INTEGRATION-CHECKLIST.md \
        .specify/feature.json \
        specs/015-nginx-track-a-transitional-block/

git commit -m "$(cat <<'EOF'
feat(deploy): W-FA2 加 nginx TRANSITIONAL marker block + refreshToken → nestjs upstream

rev1 deploy 階段 Track DESIGN-A 三件套第二個 feature(W-FA1 後接續、F10 / F13 / F14
之前)。把 POST /api/auth/refreshToken 補上 nginx 反代到 nestjs upstream、用
inline TRANSITIONAL marker block(per DESIGN-A §2.2 convention)+ variable
proxy_pass + resolver lazy DNS 設計(default profile / DESIGN-B 退場 nginx 仍可
啟動)。

改動範圍(4 個 outer file、~52 LOC):
- deploy/front-nginx/conf.d/default.conf:dev 80 + dev 443 兩 server block 各加
  inline TRANSITIONAL block(~9 行/block)
- deploy/front-nginx/conf.d/default.conf.prod:prod 443 server block 加 inline
  TRANSITIONAL block(prod 80 只 redirect、不加)
- CLAUDE.md §5.2.1:加 track-a 模式下 curl POST refreshToken 範例
- docs/INTEGRATION-CHECKLIST.md:Phase W-7 W-FA2 row + Current Focus + 已完成里程碑

設計拍板(brainstorm 階段 3 顯式 Q + 5 自然推論、見 docs/superpowers/012):
- Q1 scope:refreshToken-only(對齊 DESIGN-A §3.2)
- Q2 機制:variable proxy_pass + inline + resolver lazy DNS(失 keepalive、低頻可接受)
- Q3 dev/prod:都加(對齊 W-FA1 FR-012 prod 透 nginx routing intent)
- 5 自然推論:nestjs port 9528(非 DESIGN-W 草稿 3000)+ /v1 prefix + resolver
  127.0.0.11 + 沿用 proxy_headers.inc + marker 每 server inline(不抽 snippet)

Acceptance:US1 P1 MVP 3/3 + US2 P2 3/3 + US3 P2 3/3 + US4 P2 3/3 = 12/12 PASS;
base-web/rust-api/nestjs fork 三邊零改動(per FR-013 + Constitution Principle IV/V
延伸);default profile 下 nginx -t 仍 OK、refreshToken 回 502/504 不 crash
(per FR-017 + Q2 lazy DNS 設計);F14 cutover dry-run sed + nginx -t exit 0
(per SC-005、證 marker convention 機械刪除路徑乾淨)。

Constitution Check 8 PASS / 15 N/A / 0 violation;DESIGN-A → DESIGN-B 遷移時
整組刪除 3 處 marker block + 改 proxy_pass 指 rust_api 即可、無 DB / application
改動。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 8:Push 等 user 同意

- 告知 user:「W-FA2 單段 outer commit 已落、要不要 push origin 015-nginx-track-a-transitional-block?」
- 不主動 push(per CLAUDE.md §5)
- user 同意後跑 `git push origin 015-nginx-track-a-transitional-block` + 對齊 W-FA1 模式 merge `--no-ff` 回 `rev1-admin-root` + follow-up `docs(checklist)` commit 填 SHA

---

## 故障排查

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| `nginx -t` 報 `unknown directive "ipv6"` | nginx 版本太舊(< 1.5.8) | 升 image 到 1.27-alpine(W-F5 既有、應無此問題)|
| `nginx -t` 報 `host not found in upstream` | 用了 upstream block 而非 variable proxy_pass | 重檢 marker block 是否誤加 `upstream { ... }`(per FR-012 禁止)|
| Curl POST refreshToken 回 404 | nginx 沒 reload、或 location 順序錯 | `docker compose exec front-nginx nginx -s reload`;若仍 404、檢 marker block 是否在 server block 內 |
| Curl POST refreshToken 回 502 in track-a mode | nestjs container 不健康 | `docker compose ps nestjs` + `docker compose logs nestjs --tail 50` |
| Curl POST refreshToken in default profile 回 nginx 500 而非 502 | resolver directive 漏或寫錯 | 檢 `resolver 127.0.0.11 valid=10s ipv6=off;` 是否在 location 內 |
| `sed` 刪除後 `nginx -t` fail | marker comment 不在獨佔行 / pattern 不對 | 重檢 marker comment 是否獨佔單行(per FR-003 strict format) |

---

## Acceptance Phase 預期時程

- Implement Step 1-4:~10 分鐘
- Step 5 reload + nginx -t:~30 秒
- Step 6 跑 12 個 C-V*:~5-10 分鐘
- Step 7 commit + push wait:~3 分鐘

**Total**:~20-25 分鐘(對齊 NFR-004 spec / plan / tasks 規模 SHOULD 小於 W-FA1 ~60-90 分鐘預估)
