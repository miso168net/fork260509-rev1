---
description: "Task list for W-F2 dockerfile-base-web implementation"
---

# Tasks: W-F2 — dockerfile-base-web

**Input**: Design documents from `/specs/007-dockerfile-base-web/`
**Prerequisites**: [`plan.md`](plan.md) ✓ / [`spec.md`](spec.md) ✓ / [`research.md`](research.md) ✓ / [`data-model.md`](data-model.md) ✓ / [`contracts/`](contracts/) ✓ / [`quickstart.md`](quickstart.md) ✓

**Tests**: 走 `docker build` / `docker run` / `docker exec` / `curl` 運行時驗證(per quickstart.md 12 scenarios);**unit test** 不適用(W-F2 為 infrastructure feature、不寫 application code)。

**Organization**: W-F2 為單一 P1 user story feature;Setup + Foundational(pre-implement validation T1/T2/T3)+ US1(3 implementation + 12 acceptance)+ Polish(兩段式 commit / merge / checklist 更新)四階段。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel(different files / different docker commands / 不互依)
- **[Story]**: 僅 User Story phase 用 [US1] 標籤
- 路徑:outer = `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`,base-web worktree = outer 內 `base-web/`

## Path Conventions

- **Outer (rev1-admin-root + feature branch)**: `specs/007-dockerfile-base-web/*` / `CLAUDE.md` / `.specify/feature.json` / `docs/INTEGRATION-CHECKLIST.md`
- **base-web worktree (rev1-admin-base-web 分支)**: `base-web/Dockerfile` / `base-web/.dockerignore` / `base-web/deploy/nginx.conf`(全新建)
- **acceptance test execution**: docker host(outer repo root)

---

## Phase 1: Setup(Shared Infrastructure)

**Purpose**: 環境前置 / branch state 檢查 / docker 工具就位

- [ ] T001 確認 outer 在 feature branch `007-dockerfile-base-web`:`git -C . branch --show-current` 應 output `007-dockerfile-base-web`;若不在 → `git switch 007-dockerfile-base-web`(spec-kit pre-hook 應該已建)
- [ ] T002 [P] 確認 base-web worktree 在 `rev1-admin-base-web` 分支:`git -C base-web branch --show-current` 應 output `rev1-admin-base-web`(per CLAUDE.md §1 worktree+submodule 雙重身分);驗 `.git` 是 file(`ls -la base-web/.git` 應 ~106 bytes)
- [ ] T003 [P] 確認 docker BuildKit 可用:`docker buildx version` exit 0(per quickstart.md Prerequisites)
- [ ] T004 [P] 確認 host arch:`uname -m` 應 `x86_64`(per W-F1 Q2 inherit、W-F2 target = linux/amd64)
- [ ] T005 [P] docker host disk 至少 3GB free:`df -h /` 或 `df -h /var/lib/docker`(per quickstart.md;builder cache + image storage)

---

## Phase 2: Foundational(Blocking Prerequisites)

**Purpose**: 解 spec.md Assumption + research.md R-001 / R-002 / R-003 / R-004;**完成後才能進 US1 實作**

**⚠️ CRITICAL**: T010 必須 pass 才能進 Phase 3 implementation;若 fail,W-F2 範疇可能需要 case-by-case 擴大(per research.md plan-stage action)

- [ ] T010 在 docker container 內驗 host pnpm install + Vite build 在 `node:22-slim` 環境可跑(R-001):`docker run --rm -v "$(pwd)/base-web:/app" -w /app node:22-slim sh -c "corepack enable && corepack prepare pnpm@10.18.0 --activate && pnpm install --frozen-lockfile && pnpm build"` — exit 0 為 pass;若 fail → audit stderr 找 missing apt(可能要 python3 / make / g++)或 node version 衝突、plan 階段 case-by-case 補
- [ ] T011 [P] grep audit `base-web/package.json` 無 `packageManager` field(per R-003 確認 corepack pin 在 Dockerfile 處理):`grep '"packageManager"' base-web/package.json` 應 0 命中;若有(F1-F5 期間可能補)→ Dockerfile ARG PNPM_VERSION 對齊 field 值
- [ ] T012 [P] 驗 nginx alpine user uid(per R-004):`docker run --rm --entrypoint id nginx:1.27-alpine` → 觀察實際 uid 數值;spec FR-013 / AC-4 期 uid=101,若實際為 100 或其他、acceptance log 紀錄(屬 image 預設值差異、非 W-F2 缺陷)
- [ ] T013 grep audit `base-web/.env.prod` 確認 `VITE_SERVICE_BASE_URL` 仍是 mock URL 不動(per Q2 拍板 W-F2 不動 .env.prod):`grep "VITE_SERVICE_BASE_URL" base-web/.env.prod` 應命中 mock URL `https://mock.apifox.cn/...`;這是 W-F2 build-arg pattern 的驗證起點(spec FR-026 紀律)

**Checkpoint**: Foundational ready — US1 implementation 可開始

---

## Phase 3: User Story 1 — operator 在乾淨 docker 環境 build + run rev1 base-web image(Priority: P1)🎯 MVP

**Story 來源**: spec.md `## User Story 1`(唯一 US,P1)

**Goal**: 產出可運行的 rev1 base-web Docker image(node:22-slim builder + nginx:1.27-alpine runtime、含 SPA dist + nginx config + /health endpoint),透過 12 個 acceptance scenarios(AC-1 ~ AC-12 對應 Dimension A-E)100% pass 驗證,解鎖 W-F3 / W-F4 後續 P1 feature

**Independent Test**: 跑 quickstart.md 全 12 個 scenario(Scenario 1-3 Dimension A / 4-5 B / 6-7 C / 8-10 D / 11-12 E)100% pass + SC-001 ~ SC-005 量化目標達標。**比 W-F1 更獨立** — 不需 minimal stack(postgres / redis / rust-api),純 standalone container 即可驗

### Implementation tasks(base-web worktree — `rev1-admin-base-web` 分支)

- [ ] T020 [US1] 新建 `base-web/Dockerfile`(主檔)— 內容嚴格對齊 [contracts/dockerfile-structure.md](contracts/dockerfile-structure.md) C-D1(ARG 宣告 7 個:NODE_VERSION=22 / NGINX_VERSION=1.27 / PNPM_VERSION=10.18.0 / APP_PORT=8080 / TZ=Asia/Shanghai / VITE_SERVICE_BASE_URL=/api / VITE_SERVICE_SUCCESS_CODE=0)+ C-D2(builder stage:node:22-slim + corepack prepare pnpm + deps-first COPY + BuildKit cache mount + ENV override + pnpm build)+ C-D3(runtime stage:nginx:1.27-alpine + apk tzdata curl + TZ symlink + COPY dist/nginx.conf + USER nginx + EXPOSE 8080 + ENV TZ + CMD)+ C-D5 forbidden patterns(無 HEALTHCHECK / 無 :latest / 無 --platform / 無 proxy_pass)
- [ ] T021 [US1] 新建 `base-web/deploy/nginx.conf`(含新子目錄 `deploy/`)— 內容對齊 [contracts/dockerfile-structure.md](contracts/dockerfile-structure.md) C-D4:`listen 8080` + `root /usr/share/nginx/html` + 3 個 location block(`= /health` 返 200 "ok" + Content-Type text/plain;`~* \.(js|css|...)$` 套 30d immutable cache;`/` SPA fallback + try_files + Cache-Control no-cache + Pragma no-cache per R-007)
- [ ] T022 [P] [US1] 新建 `base-web/.dockerignore` — 排除 list per [contracts/dockerfile-structure.md](contracts/dockerfile-structure.md) C-D6:`node_modules/` / `dist/` / `.env` / `.env.test` / `.git` / `.github` / `.vscode` / `.idea` / `CHANGELOG*.md` / `README*.md` / `LICENSE` / `*.log` / `.DS_Store` / `coverage/` / `**/Dockerfile*`;**不**排除 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `packages/` / `src/` / `public/` / `build/` / `index.html` / `vite.config.ts` / `tsconfig.json` / `.env.prod` / `deploy/nginx.conf`

### Acceptance verification(走 quickstart.md — outer repo root 執行 docker)

#### Dimension A — Dockerfile 結構建立(per quickstart.md Scenario 1-3)

- [ ] T030 [US1] Scenario 1:`docker builder prune -f` + `cd base-web && time docker build -t base-web:test --build-arg VITE_SERVICE_BASE_URL=/api --build-arg VITE_SERVICE_SUCCESS_CODE=0 .` → exit 0、output 顯示 builder(node:22-slim)+ runtime(nginx:1.27-alpine)兩 stage、第一次 build 5-10 分鐘(per SC-001);**記 wall clock time**
- [ ] T030b [US1] Scenario 3(SC-003 cache hit):`time docker build -t base-web:test base-web/`(不 prune cache、第二次)→ 預期 < 30 sec、大量 CACHED layer 標記、manifest sha 與 T030 一致;若 > 30 sec 紀錄到 acceptance log + audit cache mount 配置
- [ ] T030c [P] [US1] Scenario tagging FR audit(SC-005 + FR-022/023/024,解 analyze remediation E2):`grep -E "^- \*\*FR-02[234]\*\*" specs/007-dockerfile-base-web/spec.md` → 應 3 行命中(分別對應 FR-022 短 SHA tag / FR-023 branch tag + prod tag / FR-024 不用 :latest)
- [ ] T030d [P] [US1] Scenario tag pattern 合法驗(FR-022/023,解 analyze remediation E2):`SHA=$(cd base-web && git rev-parse --short=7 HEAD) && docker build -t base-web:${SHA} base-web/` → tag 創建成功;`docker build -t base-web:rev1-admin-base-web base-web/` → branch tag 合法;`docker images base-web --format '{{.Tag}}'` 應顯示 `test / ${SHA} / rev1-admin-base-web` 三個 tag
- [ ] T031 [US1] Scenario 2:`docker image inspect base-web:test --format='{{.Size}}'` → < 100MB(SC-002 target);100-130MB acceptable;> 130MB plan 階段 audit `docker history base-web:test` 找哪層大、考慮 Vite manualChunks
- [ ] T032 [P] [US1] Scenario 3(多 stage 結構驗):`docker history base-web:test --no-trunc` → 看不到 builder stage 中間 layer(只看到 runtime stage steps + COPY --from=builder 引用)

#### Dimension B — Non-root user + nginx config(per quickstart.md Scenario 4-5)

- [ ] T033 [P] [US1] Scenario 4:`docker run --rm --entrypoint id base-web:test` → 含 `uid=NNN(nginx) gid=NNN(nginx)`,NNN 為 nginx alpine image 內建 user uid(預期 101、實際 100 也接受、acceptance log 紀錄);user name MUST = `nginx`
- [ ] T034 [P] [US1] Scenario 5:`docker run --rm --entrypoint nginx base-web:test -t` → stderr 含 `test is successful`(nginx config 語法 OK,代表 T021 nginx.conf 寫得對)

#### Dimension C — Runtime + healthcheck(per quickstart.md Scenario 6-7)

- [ ] T035 [US1] Scenario 6:`docker run -d --name w-f2-test -p 8080:8080 base-web:test` + `sleep 3` + `nc -zv localhost 8080` → connection succeeded(nginx 確實 listen 8080)
- [ ] T036 [US1] Scenario 7:`docker exec w-f2-test curl -fsS http://localhost:8080/health` 或 host `curl -fsS http://localhost:8080/health` → 200 + body `ok`;`curl -I http://localhost:8080/health` 看 Content-Type 應 `text/plain`
- [ ] T036b [US1] Scenario 7b(SC-004 p99 latency 量化驗,解 analyze remediation E1 + B1):**從 host 跑 N=100 次 latency 量化**:`for i in {1..10}; do curl -s http://localhost:8080/health > /dev/null; done`(warmup、丟棄)+ `rm -f /tmp/health-latency.log && for i in $(seq 1 100); do /usr/bin/time -f "%e" curl -s http://localhost:8080/health -o /dev/null 2>> /tmp/health-latency.log; done` + `sort -n /tmp/health-latency.log | awk 'NR==95'` 看 p95、`awk 'NR==99'` 看 p99 → **p99 < 0.05 秒(50ms)per SC-004**。Methodology:warmup 10 次跳過、N=100 樣本、從 host 直連 port forward 不含 docker exec overhead;若 `ab` 工具可用、改 `ab -n 100 -c 1 http://localhost:8080/health` 看 "99% line" 也可

#### Dimension D — SPA 路由 + assets cache(per quickstart.md Scenario 8-10)

- [ ] T037 [US1] Scenario 8:`curl -fsS http://localhost:8080/ | grep -E "<title>|<div id=\"app\""` → 至少 1 行命中(SPA shell HTML 返回);`curl -I http://localhost:8080/ | grep Cache-Control` → 含 `no-cache, no-store, must-revalidate`(R-007 補強)
- [ ] T038 [P] [US1] Scenario 9:`diff <(curl -fsS http://localhost:8080/) <(curl -fsS http://localhost:8080/some/unknown/spa/route)` → 無差異(SPA fallback 對任何 path 返同 index.html、SPA route 由前端 vue-router 處理);證明 FR-018 try_files 正確
- [ ] T039 [P] [US1] Scenario 10:找一個 hashed asset 名 `ASSET=$(docker exec w-f2-test sh -c 'ls /usr/share/nginx/html/assets/*.js | head -1' | xargs basename)`;`curl -I http://localhost:8080/assets/$ASSET` → header 含 `Cache-Control: public, immutable` + `Expires`(30 天後)

#### Dimension E — VITE 注入驗證 + TZ(per quickstart.md Scenario 11-12)

- [ ] T040 [US1] Scenario 11(R-002 + SC-007):`docker exec w-f2-test sh -c 'grep "\"/api\"" /usr/share/nginx/html/assets/*.js | head -3'` → ≥ 1 命中(證明 `VITE_SERVICE_BASE_URL=/api` build-arg 真的注入 SPA bundle、override .env.prod mock URL);若 0 命中 → fallback 改寫 `.env.prod.local`(per quickstart.md troubleshooting)
- [ ] T041 [P] [US1] Scenario 12:`docker exec w-f2-test date` → 顯示 `CST 2026`(Asia/Shanghai 時區);`docker exec w-f2-test date -u` → UTC 時間(與 CST 差 8 小時)
- [ ] T042 [US1] minimal stack cleanup:`docker stop w-f2-test && docker rm w-f2-test`

**Checkpoint**: 12 個 acceptance scenarios + SC-001 ~ SC-005 全 pass → US1 完成、解鎖 Polish

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: 兩段式 commit(per CLAUDE.md §6.1)+ SHA pin update + merge + checklist + 解鎖後續 feature

### 第一段 commit:base-web worktree → rev1-admin-base-web 分支

- [ ] T050 在 base-web worktree 內 review changes:`cd base-web && git status` 應顯示 untracked `Dockerfile` + `.dockerignore` + `deploy/nginx.conf`(3 個新建檔)
- [ ] T051 在 base-web worktree 內 stage + commit(conventional commit、中文 subject):`cd base-web && git add Dockerfile .dockerignore deploy/nginx.conf` + `git commit -m "feat(base-web): W-F2 dockerfile-base-web 落地（multi-stage Vite + nginx + /health endpoint）

實作 W-F2（per specs/007-dockerfile-base-web/）:

- 新建 Dockerfile multi-stage(node:22-slim builder + nginx:1.27-alpine runtime)
- 新建 deploy/nginx.conf(SPA fallback + /health + 30d assets immutable + index.html no-cache)
- 新建 .dockerignore
- corepack prepare pnpm@10.18.0 顯式 pin(reproducibility per R-003)
- deps-first COPY 含 packages/ workspace 8 個 sub-package
- BuildKit cache mount /root/.local/share/pnpm/store(per R-008)
- Vite build-arg ENV override .env.prod mock URL(per R-002 Vite loadEnv merge process.env)
- nginx user(uid 由 image 內建決定、預期 101)
- linux/amd64 only(per W-F1 Q2 inherit)

Acceptance 12/12 PASS(per quickstart.md Dimension A-E);base-web 源碼 0 改動(per FR-025 + Constitution Principle IV)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"`
- [ ] T052 在 base-web worktree 內 push(**需 user 同意,per CLAUDE.md §5**):`cd base-web && git push origin rev1-admin-base-web`

### 第二段 commit:outer feature branch 007-dockerfile-base-web

- [ ] T053 回 outer review:`cd .. && git status` 應顯示 modified `base-web`(submodule SHA changed)+ untracked `specs/007-dockerfile-base-web/`(若尚未 tracked)+ modified `.specify/feature.json` / `CLAUDE.md`
- [ ] T054 outer stage + commit:`git add base-web specs/007-dockerfile-base-web/ .specify/feature.json CLAUDE.md` + `git commit -m "chore(submodule): bump base-web 到 $(cd base-web && git rev-parse --short=7 HEAD) — W-F2 dockerfile-base-web 完整落地 + spec-kit 全套

W-F2 為 rev1 deploy 階段第二個 feature（per DESIGN-W §11.1 Phase W-1 P1）。

Spec-kit 全套文件落 specs/007-dockerfile-base-web/:
- spec.md(3 brainstorm 拍板 + 28 FR + 8 SC + 12 AC)
- plan.md(Constitution Check 23 gate PASS、0 violation)
- research.md(9 個 R-XXX 解 Assumption + R-007 spec 補強)
- data-model.md(7 entity)
- contracts/(/health OpenAPI + Dockerfile + nginx structure C-D1~C-D7)
- quickstart.md(12 acceptance scenarios reproducer)
- tasks.md(~32 task 四階段)
- checklists/requirements.md(spec quality validation PASS)

base-web SHA pin 更新對應 W-F2 落地的 Dockerfile + deploy/nginx.conf + .dockerignore。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"`
- [ ] T055 outer push(**需 user 同意**):`git push origin 007-dockerfile-base-web`

### Merge 回 rev1-admin-root + 解鎖

- [ ] T056 切回 rev1-admin-root + merge feature branch:`git switch rev1-admin-root && git merge --no-ff 007-dockerfile-base-web -m "Merge branch '007-dockerfile-base-web' into rev1-admin-root"`(merge --no-ff 保留 feature branch 結構、對齊 F1.1-F5.1 + W-F1 既有 merge pattern)
- [ ] T057 merge push(**需 user 同意**):`git push origin rev1-admin-root`
- [ ] T058 更新 `docs/INTEGRATION-CHECKLIST.md`:加 W-F2 完成里程碑(模仿 F1.1 / W-F1 紀錄模式 — 「W-F2 dockerfile-base-web ✅ 完成(2026-05-15 完成;outer <short-sha>、base-web <short-sha>;spec specs/007-dockerfile-base-web/)」)+ 更新 Phase W deploy Roadmap 表(W-F2 完成、W-F3 / W-F4 待動)+ 更新 Current Focus 段反映 W-F2 完成、進度 2/4
- [ ] T059 commit checklist 更新:`git add docs/INTEGRATION-CHECKLIST.md && git commit -m "docs(checklist): W-F2 dockerfile-base-web 完成、Phase W deploy P1 進度 2/4"` + push(需 user 同意)

### 結束 / 後續準備

- [ ] T060 [P] 通知 user W-F2 完成 + 提示下一步:可選 W-F3(`compose-base-structure`)或 W-F4(`secret-injection`)為下個 spec-kit feature 入口(per DESIGN-W §11.2 依賴序;W-F3 依賴 W-F1 + W-F2 都完成、現已就緒;W-F4 依賴 W-F3)

---

## Dependencies

```
T001 ─┬─ T002 [P]
      ├─ T003 [P]
      ├─ T004 [P]   ─── Phase 1 ───
      └─ T005 [P]
          │
          ▼
       T010(R-001 host pnpm install + build 驗)
       T011 [P](R-003 packageManager field audit)
       T012 [P](R-004 nginx user uid 驗)
       T013(.env.prod 不動驗)
          │
          ▼            ─── Phase 2 ───
       T020(Dockerfile 新建)─┬─→ T022 [P](.dockerignore)
       T021(nginx.conf 新建)─┘
                 │
                 ▼
       T030 → T030b → T030c [P] / T030d [P] → T031 → T032 [P]   ─ Dimension A + tagging ─
       T033 [P]
       T034 [P]                           ─ Dimension B ─
       T035 → T036 → T036b                ─ Dimension C(含 p99 量化)─
       T037 → T038 [P]
              T039 [P]                    ─ Dimension D ─
       T040 → T041 [P]                    ─ Dimension E ─
       T042                                ─── Phase 3 ───
                 │
                 ▼
       T050 → T051 → T052 (user push)   ─ 第一段 commit ─
                 │
                 ▼
       T053 → T054 → T055 (user push)   ─ 第二段 commit ─
                 │
                 ▼
       T056 → T057 (user push)            ─ Merge to root ─
                 │
                 ▼
       T058 → T059 (user push)            ─ Checklist 更新 ─
                 │
                 ▼
       T060 [P]                            ─ notify
                                          ─── Phase 4 ───
```

**Story dependencies**: 單一 US1、無 cross-story 依賴。

**Critical path**(必經、不可平行):
T001 → T010 → T020 → T021 → T030 → T030b → T031 → T035 → T036 → T036b → T037 → T038 → T040 → T042 → T050 → T051 → T053 → T054 → T056 → T058 → T059

**Parallel opportunities**:
- Phase 1: T002-T005 全 [P]
- Phase 2: T011 / T012 [P] 與 T010 並行
- Phase 3 implementation: T022 [P] 與 T020/T021 並行
- Phase 3 acceptance: T032 / T033 / T034 / T038 / T039 / T041 [P]
- Phase 4: T060 [P]

---

## Independent Test 對照

| Dimension | quickstart scenarios | Tasks | Test 標準 |
|---|---|---|---|
| A. Dockerfile 結構 + tagging | 1-3 + tagging FR | T030 / T030b / **T030c** / **T030d** / T031 / T032 | exit 0 + cache hit < 30s + spec FR-022/023/024 grep ≥ 3 + SHA/branch tag 合法 + image < 100MB + history 看不到 builder layer |
| B. Non-root + nginx config | 4-5 | T033 / T034 | uid=NNN(nginx) name nginx / nginx -t test successful |
| C. Runtime + healthcheck | 6-7 + p99 量化 | T035 / T036 / **T036b** | port 8080 listen / /health 200+ok+text-plain / **p99 < 50ms** |
| D. SPA + assets cache | 8-10 | T037 / T038 / T039 | SPA root index.html + no-cache header / SPA fallback 同內容 / assets immutable cache |
| E. VITE 注入 + TZ | 11-12 | T040 / T041 | grep `/api` ≥ 1 命中 / date 顯示 CST 2026 |

---

## MVP Scope

**MVP = T001 ~ T042**(Setup + Foundational + US1)即可宣布 W-F2 deliverable 完成。

**Phase 4 (Polish)** 屬合併到 main 流程、與實際 deliverable 分開:
- T050-T055:必經(兩段 commit + push 後 W-F2 才落 git history)
- T056-T057:必經(merge 後 rev1-admin-root 含 W-F2 / 後續 feature 解鎖)
- T058-T059:必經(INTEGRATION-CHECKLIST.md 更新追蹤 Phase W 進度)
- T060:可選(notify)

**最小可交付狀態**:T001~T042 + T050-T057 完成 = W-F2 已 merged 到 rev1-admin-root、W-F3 / W-F4 可開新 feature branch。

---

✓ All **40** tasks 使用 `- [ ] T###[a-z]?` 格式(含 analyze remediation 3 新 task:T030c / T030d / T036b)
✓ Setup phase(T001-T005,5 個)無 [US1] 標籤 — 對
✓ Foundational phase(T010-T013,4 個)無 [US1] 標籤 — 對
✓ User Story phase(T020-T042 含新增 3 個,共 **20** 個)全部 [US1] 標籤 — 對
✓ Polish phase(T050-T060,11 個)無 [US1] 標籤 — 對
✓ [P] marker 標在獨立檔案 / 獨立 docker command / 獨立 grep 操作上(共 **16** 個 [P])
✓ 每個 task 含具體 file path 或 docker command 或 grep target

**Total**: **40** tasks(Setup 5 + Foundational 4 + US1 implementation 3 + US1 acceptance 16 + cleanup 1 + Polish 11)

**Parallel opportunities identified**: 16 個 [P] task

**Analyze remediation tasks(2026-05-15)**:
- **T030c**(spec FR-022/023/024 grep 驗 image tagging convention 明示)解 analyze E2
- **T030d**(SHA tag + branch tag build 合法驗)解 analyze E2
- **T036b**(N=100 curl p99 量化、SC-004 p99 < 50ms 驗)解 analyze E1 + B1
- (spec.md FR-003 + FR-019 wording 直接修)解 analyze I1 + I2
