# Implementation Plan: W-FA1 — compose-nestjs-service

**Branch**: `014-compose-nestjs-service` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-compose-nestjs-service/spec.md`

## Summary

W-FA1 是 rev1 deploy 階段 Track DESIGN-A 專屬第一個 feature(P7 Track-A 三件套 W-FA1/W-FA2/W-FA3 中最先動)— 把 nestjs service 加進 rev1 docker compose stack、走 profile=track-a 啟動模式、共享 rev1 既有 postgres + redis、JWT secret 透過 W-F4 _FILE pattern 與 rust-api 共享。**Plan 階段解開 brainstorm 4 個 OQ + 確認 deploy 細節**,範疇對齊 spec FR-001~022。

**Technical approach**(per [research.md](research.md)):

- **Nestjs Dockerfile 沿用 fork**(per Q2)— `fork260509-soybean-admin-nestjs/backend/Dockerfile` alpine + node 20.11.1 + pnpm 9.1.2 + multi-stage、無需改 fork source、image tag `nestjs:rev1-admin-nestjs`
- **JWT secret bridge via entrypoint sh wrapper**(自然推論)— `entrypoint: ["sh", "-c", "export JWT_SECRET=$(cat $JWT_SECRET_FILE) && ... && exec node dist/apps/base-system/src/main"]` 對 4 個 secret(jwt_secret / refresh_token_secret / database_url / redis_password)做 _FILE → env 轉換、不動 nestjs source
- **DB shared 同 instance 同 DB 同 schema**(per Q3)— nestjs `DATABASE_URL` 指 rev1 既有 `soybean_admin_rust` DB、不跑 nestjs prisma migrate / db seed(per Q4)避免 break rust-api migration、sys_tokens schema 對齊驗 by acceptance manual SQL
- **profile=track-a**(per DESIGN-W §11.5)— `docker compose --profile track-a -f docker-compose.yml -f docker-compose.dev.yml up`;不帶 profile 維持 DESIGN-B 形態(6 service);prod 啟動 `--profile track-a --profile prod`
- **Port 規約**:container 9528 + host 127.0.0.1:11082 dev only(per 自然推論)
- **單段 commit**(per W-F1~W-F7 慣例)— 只動 outer repo、`docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.prod.yml` + `deploy/secrets/refresh_token_secret.txt.example` + `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` 同一 commit

**Pre-implement validation tasks**(per [research.md](research.md)):

- **T1**:nestjs image build 通(`DOCKER_BUILDKIT=1 docker build ... fork260509-soybean-admin-nestjs/backend/`)、image size 確認 ≤ 500MB
- **T2**:dev stack `--profile track-a up` 7 service 全 healthy、nestjs 啟動 ≤ 90s
- **T3**:nestjs container 內 `env | grep -E "(JWT_SECRET|DATABASE_URL|REDIS_PASSWORD)="` 4 個 env 存在 + JWT_SECRET 長度 64
- **T4**:F6 browser login regression 仍 PASS(via CDP or manual)
- **T5**:`git diff` base-web / rust-api / nestjs fork 三邊零改動

## Technical Context

**Language/Version**:Docker compose v2.x(已驗 v5.1.1)+ nestjs Node.js 20.11.1 + Alpine Linux + pnpm 9.1.2(由 nestjs fork Dockerfile 鎖定、W-FA1 不改)

**Primary Dependencies**:
- **fork260509-soybean-admin-nestjs/backend/Dockerfile**:nestjs image build context、alpine + node 20 + pnpm + prisma + Fastify multi-stage(W-FA1 不改)
- **W-F3 既有 `docker-compose.yml`**:`internal` network、`depends_on` 機制、healthcheck pattern、restart policy
- **W-F4 既有 docker secrets + `_FILE` pattern**:5 個既有 secret + W-FA1 加 1 個 `refresh_token_secret`
- **rev1 既有 postgres 17.4 + redis 7.4.0**:nestjs connect 用 rev1 stack 內 hostname-based discovery

**Storage**:
- **`docker-compose.yml`**(改)— 加 `nestjs` service block(~30 行)+ `secrets:` section 加 `refresh_token_secret:` 條目(~2 行)
- **`docker-compose.dev.yml`**(改)— 加 `nestjs` ports override block(`127.0.0.1:11082:9528`、~3 行)
- **`docker-compose.prod.yml`**(改)— 加 `nestjs` prod override block(空 / 最簡 placeholder、~1-3 行)
- **`deploy/secrets/refresh_token_secret.txt`**(新建、gitignored)— refresh token signing secret、本機備
- **`deploy/secrets/refresh_token_secret.txt.example`**(新建、tracked)— example placeholder
- **`CLAUDE.md`**(改)— §5.2 / §5.2.1 加 track-a profile 啟動命令範例 + port 11082 條目;§10 SPECKIT marker 更新 Active feature
- **`docs/INTEGRATION-CHECKLIST.md`**(改)— W-FA1 row ✅ + Current Focus + 已完成里程碑加 W-FA1 條目

**Testing**:
- **Image build verification**:`docker images rust-api nestjs --format ...` + `docker history nestjs:rev1-admin-nestjs` 驗 layer 結構
- **Stack startup acceptance**:`docker compose --profile track-a up -d --wait` + `docker compose ps` 7 service healthy
- **Secret bridge verification**:`docker compose exec nestjs sh -c 'env | grep ...'` + `docker compose config | grep ...` 驗 plaintext 不洩
- **DB connectivity acceptance**:`docker compose exec postgres psql -U soybean -d soybean_admin_rust -c "\d sys_tokens"` + `docker compose logs nestjs --tail 50` 無 connection error
- **Browser login regression**:CDP Edge 148 or manual browser 跑 F6 acceptance(Soybean/123456 → /home + menuCount=43)
- **Zero-diff verification**:`git diff HEAD~1 -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 應 empty

**Target Platform**:docker compose v2 + Linux host(WSL2 mirrored networking、Win11 22H2+)+ Edge browser host(CDP 127.0.0.1:9229)

**Project Type**:**deploy-track feature**(不是 application feature)— rev1 docker compose stack 結構改動、無 rust/nestjs source code 改動

**Performance Goals**:
- nestjs image build cold ≤ 5min / warm cache ≤ 30s(per NFR-001 image size ≤ 500MB)
- nestjs container 啟動到 healthy ≤ 90s(per NFR-002、start_period: 60s + 1-2 healthcheck cycle)
- nestjs runtime memory ≤ 512MB(per NFR-003)
- `--profile track-a up` 相比 default 額外 +60-90s(per NFR-005)

**Constraints**:
- `MUST NOT` 動 base-web src(per Constitution Principle IV + FR-018)
- `MUST NOT` 動 rust-api worktree(per Constitution Principle IV + FR-018)
- `MUST NOT` 動 nestjs fork source(per Constitution Principle IV 延伸 + FR-018)
- `MUST NOT` 跑 nestjs prisma migrate / db seed(per Q4 + FR-019)
- `MUST NOT` 加 nginx routing(W-FA2 範疇 + FR-020)
- `MUST NOT` 加 application 邏輯(F10 範疇 + FR-020)
- `MUST` 走 _FILE pattern bridge secrets(per W-F4 + FR-003 / FR-004)
- `MUST` 走 profile=track-a 啟動模式(per DESIGN-W §11.5 + FR-001)
- `MUST` 為單段 commit(per FR-015 + W-F1~W-F7 慣例)
- `MUST` 不暴露 prod nestjs host port(per FR-012 + W-F6 既有 prod 部署紀律)

**Scale/Scope**:
- 改動 / 新建檔案數:**6 個 outer file**(`docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml` / `deploy/secrets/refresh_token_secret.txt.example` / `CLAUDE.md` / `docs/INTEGRATION-CHECKLIST.md`)+ **1 個 nestjs image artifact**(non-tracked、`nestjs:rev1-admin-nestjs`)= 7 觸及點
- LOC 量級:~50 行 yaml 改動(主 compose 30 行 + dev override 3 行 + prod override 1-3 行 + secrets 2 行 + 加上 newlines)+ ~15 行 CLAUDE.md + ~15 行 INTEGRATION-CHECKLIST.md = ~80 行 doc 改動
- Commit 模式:**單段 commit**(per W-F1~W-F7 慣例)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ✅ **N/A**(W-FA1 不涉 Casbin enforcement、不寫 policy;rust 主導 Casbin policy 紀律維持、nestjs 屬 transitional 過渡讀方;W-FA2 / F10 nginx routing + Casbin pub-sub 才觸及)
- **II. Soft Delete + Audit Log** — ✅ **N/A**(W-FA1 為 deploy stack 配置改動、不涉業務寫入 / soft delete / audit log)
- **III. 嚴版禁 Forward + 單一職責** — ✅ **PASS**(W-FA1 加 nestjs service 進 stack、不引入 backend ↔ backend HTTP forward;nginx routing 屬 W-FA2 範疇,W-FA2 才會在 nginx config 加 TRANSITIONAL marker block;W-FA1 嚴守 endpoint ownership 單一職責、不混淆)
- **IV. base 不改動邊界** — ✅ **PASS**(W-FA1 不動 base-web src;延伸至 nestjs fork source 也不動、per Principle V「nestjs source code 不改、只用既有 build artifact」;Constitution 明示「nestjs source code **不改**;只用既有 build artifact / docker image」、W-FA1 完全遵循)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-FA1 為 DESIGN-A 過渡 deploy chain 起點;設計遵循「nestjs 退場時 zero schema 改動」紀律 — nestjs 共享 rev1 既有 DB / schema / Casbin policy / redis pub-sub channel、不引入 nestjs-specific schema;DESIGN-A → DESIGN-B 遷移只需移除 nestjs service + secret + host port 3 處改動、無 DB / application 改動;通過「未來 nestjs 拔掉時順嗎」濾鏡)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **PASS**(W-FA1 直接加 nestjs service 進 `docker-compose.yml`、走 docker compose v2 profile 機制)
- **資料庫 PostgreSQL** — ✅ **PASS**(nestjs 共享 rev1 既有 postgres 17.4、`DATABASE_URL` 指同 instance 同 DB、不跑 nestjs prisma migrate per Q4、rust 主導 schema 紀律維持)
- **快取 redis** — ✅ **PASS**(nestjs 共享 rev1 既有 redis 7.4.0、`REDIS_DB=0` 避開 nestjs fork 自帶 db 1、Casbin pub-sub channel `casbin:policy:invalidate` 在 F10 範疇訂閱、W-FA1 不涉)
- **TLS 對外** — ✅ **N/A**(W-FA1 不改 TLS、走 W-F6 既有;prod 啟動命令 `--profile track-a --profile prod` 自動套用 W-F6 的 TLS 配置;nestjs 端僅內部訪問、不直接對外)
- **Secret 注入** — ✅ **PASS**(W-FA1 nestjs container 透過 docker secrets + `_FILE` pattern + entrypoint sh wrapper 對齊 W-F4 紀律;新增 `refresh_token_secret.txt` 對齊既有 5 個 secret 慣例;secret 不進 plaintext env)
- **DB migration trigger init container** — ✅ **PASS**(W-FA1 nestjs `depends_on: migration: service_completed_successfully` 確保 rust-api migration 跑完才起;nestjs **不**跑自己的 prisma migrate per Q4 + FR-019;rev1 整體 schema 由 rust-api migration init container 主導)
- **Port 規劃 `1XXXX`** — ✅ **PASS**(W-FA1 nestjs host port `11082` 對齊 rev1 規約、避開既有 `11080` `11081` `11443` `15432` `16379`)
- **Observability(Loki + grafana + prometheus)** — ✅ **N/A**(W-FA1 不改 log/metric 配置;rev1 整體 observability stack 屬 W-F12 / W-F13 範疇、目前未啟;nestjs container log 透過 docker compose 預設 driver 走 stdout、未來 W-F12 promtail 啟動時自動 picked up;W-FA1 不引入 observability 配置)
- **結構化 log JSON** — ✅ **N/A**(W-F12 範疇、nestjs fork 既有 log 格式維持、未來 promtail 處理 parsing)
- **Backup PITR** — ✅ **N/A**(W-FA1 不涉 backup;nestjs 不寫 schema、不影響 rev1 既有 backup 範圍)
- **背景工作** — ✅ **N/A**(W-FA1 不引入 background job;nestjs container 為 long-running web service、無 cron)
- **CI/CD platform** — ✅ **N/A**(W-FA1 純 local image build、未 push registry;W-FA3 範疇)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(brainstorm → /speckit-specify → /speckit-clarify(0 Q)→ /speckit-plan 流程完整;tasks + implement 流程後續)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、0 violation、0 partial)
- **兩段式 commit 紀律** — ✅ **N/A**(W-FA1 單段 commit、只動 outer repo、不動 worktree;對齊 W-F1~W-F7 慣例)
- **Conventional Commits 中文 subject** — ✅ **PASS**(預期 commit subject:`feat(deploy): W-FA1 加 nestjs service + profile=track-a + JWT secret _FILE bridge`)
- **Push 確認紀律** — ✅ **PASS**(implement 完成後 push 需 user 同意;對齊 F6 / 全 W-F* 既有紀律)
- **TLS 紀律** — ✅ **N/A**(W-FA1 不改 TLS 配置、走 W-F6 既有)

**Gate result**:**13 PASS / 16 N/A / 0 Partial / 0 violation**。Phase 0 起 gate 通過、無 Complexity Tracking entry 需要。

## Project Structure

### Documentation (this feature)

```text
specs/014-compose-nestjs-service/
├── plan.md                              # This file(/speckit-plan output)
├── research.md                          # Phase 0 — OQ-1~OQ-4 解 + deploy 細節
├── data-model.md                        # Phase 1 — 7 個 entity(compose blocks / secrets / docs)
├── quickstart.md                        # Phase 1 — operator implement + acceptance guide
├── contracts/                           # Phase 1
│   ├── compose-contract.md              #   C-C* docker compose service / secrets / network 契約
│   ├── secret-contract.md               #   C-S* W-F4 _FILE pattern 對齊 + entrypoint wrapper
│   └── verification-commands.md         #   C-V* host docker / curl / psql 驗
├── checklists/
│   └── requirements.md                  # /speckit-specify 階段已產出
├── spec.md                              # /speckit-specify 階段已產出
└── tasks.md                             # Phase 2 output(/speckit-tasks、NOT in this command)
```

### Outer repo 改動(W-FA1 implement 階段預期變動範圍 — 純 outer、不動 worktree)

```text
fork260509-rev1/                         # outer repo root(動;單段 commit)
├── docker-compose.yml                   # ★ W-FA1 改:加 nestjs service block + refresh_token_secret 條目
├── docker-compose.dev.yml               # ★ W-FA1 改:加 nestjs ports override(127.0.0.1:11082:9528)
├── docker-compose.prod.yml              # ★ W-FA1 改:加 nestjs prod override(空 / 最簡)
├── deploy/
│   └── secrets/
│       └── refresh_token_secret.txt.example  # ★ W-FA1 新建
├── CLAUDE.md                            # ★ W-FA1 改:§5.2/§5.2.1 加 track-a + port 11082 + §10 SPECKIT marker
└── docs/
    └── INTEGRATION-CHECKLIST.md         # ★ W-FA1 改:W-FA1 row ✅ + Current Focus + 已完成里程碑
```

### Worktree 改動(無)

```text
base-web/                                # 不動(per FR-018)
rust-api/                                # 不動(per FR-018)
fork260509-soybean-admin-nestjs/         # 不動(per FR-018 + Constitution Principle IV/V 延伸)
```

### Image artifact(non-tracked)

- `nestjs:rev1-admin-nestjs` — W-FA1 範疇 local build、未 push registry(留 W-FA3 cicd-nestjs-build-job)

**Structure Decision**:W-FA1 為 **deploy-track outer-only feature**(對齊 W-F5/W-F6/W-F7 純 outer single-commit 慣例)。改動範圍緊湊:6 個 outer file + 1 個 local image artifact;無 worktree 改動、無 application source 改動。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**無 violation、本表保留為空**(per Gate result 13 PASS / 16 N/A / 0 partial / 0 violation)。

---

**Phase 0 / 1 outputs**:見同目錄 [`research.md`](research.md)、[`data-model.md`](data-model.md)、[`quickstart.md`](quickstart.md)、[`contracts/`](contracts/)。
