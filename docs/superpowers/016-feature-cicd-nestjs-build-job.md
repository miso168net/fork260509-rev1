# Feature Specification: W-FA3 — cicd-nestjs-build-job

**Feature ID**: W-FA3(per [`DESIGN-W-DEPLOYMENT`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11 line 1116 — Phase W-7 Track DESIGN-A 專屬、deploy 階段第三個 A-track feature)
**Feature Branch**: TBD(spec-kit `/speckit-specify` 階段建立,預期 `016-cicd-nestjs-build-job`)
**Created**: 2026-05-18
**Status**: Draft(brainstorming 完成、待 `/speckit-specify` 接手轉為正式 feature spec)
**Source**: superpowers:brainstorming 2026-05-18 session

**Authoritative parents**:
- [`docs/INTEGRATION-DESIGN-W-DEPLOYMENT.md`](../INTEGRATION-DESIGN-W-DEPLOYMENT.md) §11 line 1116(W-FA3 scope 描述:nestjs image build pipeline)
- [`docs/INTEGRATION-DESIGN-A-RUST-NESTJS.md`](../INTEGRATION-DESIGN-A-RUST-NESTJS.md) §6 F10 / Principle V「漸進收縮 DESIGN-A → DESIGN-B」— nestjs 屬 transitional、W-FA3 build script 在 cutover 時整支刪
- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0(Principle IV「base 不改動邊界」延伸至 nestjs fork repo 完全零改動;Principle V「漸進收縮」— W-FA3 設計直接服務未來退場)
- [`docs/superpowers/014-feature-compose-nestjs-service.md`](014-feature-compose-nestjs-service.md) W-FA1(brainstorm 階段為 nestjs container 落地、quickstart Step 1-2 含 build cmd 與 NODE_VERSION discovery)
- 既有 [`fork260509-soybean-admin-nestjs/backend/Dockerfile`](../../fork260509-soybean-admin-nestjs/backend/Dockerfile)(W-FA1 build context、W-FA3 沿用不動)
- 既有 W-FA1 落定的 build cmd(per `CLAUDE.md` §5.2.1 line 167-172 與 W-FA1 quickstart):
  ```
  DOCKER_BUILDKIT=1 docker build \
    --build-arg NODE_VERSION=22.11.0 \
    -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
    -t nestjs:rev1-admin-nestjs \
    fork260509-soybean-admin-nestjs/backend/
  ```
- 既有 [`deploy/generate-dev-cert.sh`](../../deploy/generate-dev-cert.sh)(W-F6 落地、shell script 風格參考)

**Scope summary**:rev1 deploy 階段 Track DESIGN-A 三件套**第三個也是最後一個** feature(W-FA1 + W-FA2 後接續、Track DESIGN-A 完成標誌)。**把 W-FA1 落地的 nestjs image build cmd 抽象成 local shell script** — 自動化 build cmd + NODE_VERSION build-arg + tag 處理 + 驗 image 結果 + size 印出。範疇刻意收緊到「**local script 自動化 + 不引 CI/CD 平台 + 不 push image registry**」、不含 image size 優化(留 backlog)、不含 GitHub Actions workflow(per Q1 拍板)、不動 nestjs fork repo 任何檔(包含 `.github/` metadata、per Q2 拍板與 Constitution Principle IV/V 延伸)。

**Commit 模式**:**單段 commit**(per W-F1~W-F7 + W-FA1 + W-FA2 慣例)— 只動 outer repo、新建 1 個 shell script + 改 2 個 doc。

**範疇外**:
- ❌ GitHub Actions / GitLab CI / 其他 CI/CD platform(per Q1 拍板;rev1 是個人整合研究 workspace、非 production、不投資 CI 自動化)
- ❌ Image registry push(GHCR / Docker Hub / 其他;per Q1 拍板)
- ❌ Image size 優化(W-FA1 NFR-001 SHOULD ≤ 500MB 但實際 870MB、留 backlog、per Q3 拍板;nestjs transitional ROI 低)
- ❌ nestjs fork repo 任何改動(包含 `.github/workflows/` metadata、per Q2 拍板)
- ❌ docker-compose 改動(W-FA1 既有 `image: nestjs:rev1-admin-nestjs` 不改;W-FA3 只負責 image build、不改 compose)
- ❌ W-F17 cicd-build-pipeline 共用抽象 / W-F18 cicd-deploy-pipeline(都留後續、本機 local 模式不需)
- ❌ rust-api / base-web 對應 build script(rev1 既有 `Dockerfile` 已就位、worktree+submodule 模式下 docker build 直接走、不需 script;若未來需要可另開 W-F1b / W-F2b)
- ❌ Image clean-up(老 tag 刪除、disk space mgmt)留 operator 手動

## Clarifications

### Session 2026-05-18(brainstorming 階段拍板、3 顯式 Q + 5 自然推論)

- **Q1**: W-FA3 跑哪個 CI/CD 模式? → **A: Local docker build script(無 CI 平台)**。rev1 是個人整合研究 workspace、非 production、不投資 CI 自動化 overhead。Script 把 W-FA1 落地的 build cmd + NODE_VERSION build-arg + tag 處理抽象成 1 支 shell script(`deploy/build-nestjs.sh`)。對比 Option A「GitHub Actions + GHCR」:GHA platform 需要 cross-repo checkout、GHCR storage + auth 設定、且 nestjs 是 transitional(DESIGN-B 退場)、ROI 不值;Option C「GHA + GHCR 但 compose 不指向 GHCR」:retain CI overhead 但失去 deploy 自動化 benefits、最差選項。

- **Q2**: workflow yaml 放哪? → **A: 完全不放 workflow(per Q1 既無 CI 平台、此問題 mooted),且 nestjs fork repo 零改動**。對齊 W-FA1 / W-FA2 三邊零改動紀律(per Constitution Principle IV/V 延伸)+ user reinforce「nestjs fork 零改動」邊界 — 即便未來改 Q1 為 GHA 模式,workflow yaml MUST 在 outer rev1-admin-root `.github/workflows/`、不在 nestjs fork。

- **Q3**: image size 優化(W-FA1 落定 870MB、NFR-001 SHOULD ≤ 500MB)納入 W-FA3 範疇? → **A: 不納入、留 backlog(YAGNI)**。W-FA3 focus on pipeline mechanism、image 優化是獨立議題;nestjs 是 transitional(DESIGN-B 退場、F14 cutover)、投資 image 優化 ROI 低;backlog 中可能留 OOS 條目記;不污染 W-FA3 緊湊範疇。

- **自然推論**:**Script 路徑 = `deploy/build-nestjs.sh`** — 對齊 `deploy/generate-dev-cert.sh`(W-F6)既有 deploy/ 目錄 shell script 慣例;不用 root-level Makefile(rev1 無 Makefile 既有結構、避免引入新 tooling 慣例)。

- **自然推論**:**Image tag 預設 = `nestjs:rev1-admin-nestjs`(沿用 W-FA1)** — 對齊既有 docker-compose.yml `image: nestjs:rev1-admin-nestjs` 條目、不需改 compose;script 可選 `--tag <name>` 參數 override 為其他 tag(便於對比測試多版本、預設 latest 行為)。

- **自然推論**:**NODE_VERSION build-arg 內建為 22.11.0**(per W-FA1 implement-time discovery)— W-FA1 spec A-002 anticipated 該 build-arg override 為 pnpm 9.1.2 + Node 22.11.0 LTS 對齊必要;script 內固定值即可,不暴露為參數(避免 operator 誤改);若未來 fork Dockerfile 改 ARG default 對齊 22.11.0、可移除 script 內 `--build-arg`(屬 fork upstream 改動範疇、不在 W-FA3)。

- **自然推論**:**Script 不主動驗 prereq 過深** — script 假設 docker daemon 啟動 + nestjs fork repo source 存在 + BuildKit 可用;若任一條件失敗、docker build 自己會報 clear error。Script focus on「跑 + 印 size」、不做防呆 wrapper(YAGNI、對齊 W-F6 `generate-dev-cert.sh` 簡潔風格)。

- **自然推論**:**Script 結尾印 image size**(對齊 W-FA1 NFR-001 「image 870MB 偏大」implement-time observation)— 跑完印 `docker images nestjs:rev1-admin-nestjs --format ...` 給 operator 一個明確 size feedback、未來 image 優化時 baseline 可對比。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — operator 跑 build script 一次性 build nestjs image(Priority: P1)🎯 MVP

operator 在 workspace root 跑 `./deploy/build-nestjs.sh`,script 跑 `DOCKER_BUILDKIT=1 docker build --build-arg NODE_VERSION=22.11.0 -f fork260509-soybean-admin-nestjs/backend/Dockerfile -t nestjs:rev1-admin-nestjs fork260509-soybean-admin-nestjs/backend/`,image `nestjs:rev1-admin-nestjs:latest` 落地、image size 印出、exit 0。

**Why this priority**:

W-FA3 唯一 implementation-bearing scenario、沒 script,operator 每次重 build 都要記 W-FA1 quickstart Step 1 的完整 cmd + NODE_VERSION build-arg + Dockerfile path + 對 fork260509-soybean-admin-nestjs/backend/ context path 一字不漏 copy-paste、易錯。US1 證明 W-FA3 wire-up 完整、build 自動化目標達成。

**Independent Test**:刪 image `docker rmi nestjs:rev1-admin-nestjs` 後 跑 `./deploy/build-nestjs.sh` → `docker images nestjs:rev1-admin-nestjs --format "{{.Size}}"` 預期 看到 image size(~870MB)、與 W-FA1 落地 baseline 一致。

**Acceptance Scenarios**:

1. **Given** `nestjs:rev1-admin-nestjs` image 不存在(`docker rmi`),**When** `./deploy/build-nestjs.sh`,**Then** exit 0、image 存在(`docker images nestjs:rev1-admin-nestjs -q` 非空)
2. **Given** stack 未啟,**When** `./deploy/build-nestjs.sh`,**Then** stdout 印出 image size feedback line(如 `[W-FA3] Built nestjs:rev1-admin-nestjs latest 870MB`)
3. **Given** W-FA3 落地後 image 已 build,**When** `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`,**Then** 7 service healthy(對齊 W-FA1 baseline、證 image content 等義)

---

### User Story 2 — Script 第二次跑走 docker cache(Priority: P2)

**Goal**:Idempotent verification — script 多次跑同樣參數、第二次走 docker layer cache、顯著比第一次快。

**Why this priority**:

證明 script 不會破壞 docker cache 機制(`COPY` 順序 / build-arg 等);若 cache 不命中、operator 重 build 體驗極差(每次 ~3-5 min cold build)。

**Acceptance Scenarios**:

1. **Given** `nestjs:rev1-admin-nestjs` 已 build,**When** 再跑 `./deploy/build-nestjs.sh`,**Then** 跑時間 < 30s(`time ./deploy/build-nestjs.sh` real time)、stdout 含 `CACHED` keyword 多 step

---

### User Story 3 — Custom tag override(Priority: P3)

**Goal**:operator 可選 `--tag <name>` 或 `-t <name>` 把 build 結果 tag 成不同 name(便於對比測試或保留某版本)。

**Why this priority**:

對齊 W-FA1 落定的 image tag pattern + operator 偶爾需要保留某 commit 對應的 image snapshot(避免被新 build 覆蓋);非 MVP 但 nice-to-have、實作簡單(`getopts` 或 simple parsing)。

**Acceptance Scenarios**:

1. **Given** script 接受 `--tag` 參數,**When** `./deploy/build-nestjs.sh --tag rev1-test`,**Then** image tag = `nestjs:rev1-admin-nestjs:rev1-test`(透過 `-t` flag 串到 docker build)、`docker images nestjs:rev1-admin-nestjs:rev1-test -q` 非空
2. **Given** script 不接 `--tag`,**When** 跑 default,**Then** image tag = `nestjs:rev1-admin-nestjs:latest`(對齊 W-FA1 既有 docker-compose.yml `image: nestjs:rev1-admin-nestjs` reference)

---

### User Story 4 — Zero-regression W-FA1 stack + nestjs fork 零改動(Priority: P2)

**Goal**:W-F* / W-FA* 標配零回歸 + 三邊源零改動驗。

**Why this priority**:

W-FA3 改動極小(1 個新 script + 2 個 doc)、但仍對齊 Constitution Principle IV/V「base/rust/nestjs 不改動邊界」延伸至 nestjs fork repo。

**Acceptance Scenarios**:

1. **Given** W-FA3 落地,**When** `git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/`,**Then** 無輸出(per FR-013 三邊零改動)
2. **Given** W-FA3 落地後跑 script build image,**When** W-FA1 / W-FA2 既有 stack 啟動(`docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait`),**Then** 7 service healthy(對齊 W-FA1 baseline)、refreshToken endpoint 仍 work(對齊 W-FA2)

---

### Edge Cases

| # | 場景 | 期望 |
|---|---|---|
| E-1 | `fork260509-soybean-admin-nestjs/backend/` 目錄不存在(operator 沒留源倉) | docker build 自己報 `unable to prepare context` error + exit 非 0;不需 script 主動防呆(per 自然推論 YAGNI)|
| E-2 | docker daemon 未啟 | docker build 自己報 `cannot connect to the Docker daemon` + exit 非 0 |
| E-3 | nestjs fork rebase 升 Node major(如 24)、`NODE_VERSION=22.11.0` build-arg 變不相容 | docker build fail、operator 改 script 內 `NODE_VERSION` 值對齊新需求(屬 fork drift、W-FA3 不負責 future-proof) |
| E-4 | BuildKit 未支援 / DOCKER_BUILDKIT=1 失敗 | docker build 用 legacy builder、仍可 work、script 行為一致(實際上 docker 24+ 已預設 BuildKit、`DOCKER_BUILDKIT=1` 變保險)|
| E-5 | Image 已存在、tag 一致 | docker build 走 cache、image SHA 可能改變(若 layer cache 部分失效),但 `nestjs:rev1-admin-nestjs:latest` tag 仍指向新 SHA |
| E-6 | DESIGN-B 退場時整支刪 | `rm deploy/build-nestjs.sh` + 改回 CLAUDE.md §8.2.1 + INTEGRATION-CHECKLIST.md;對齊 marker convention(本 script 整支即等於 W-FA2 nginx marker block 在 deploy/ 目錄的 transitional 角色) |

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: W-FA3 MUST 新建 `deploy/build-nestjs.sh` bash shell script、含 shebang `#!/usr/bin/env bash` + `set -euo pipefail` 防呆。
- **FR-002**: script MUST 跑 `DOCKER_BUILDKIT=1 docker build --build-arg NODE_VERSION=22.11.0 -f fork260509-soybean-admin-nestjs/backend/Dockerfile -t nestjs:rev1-admin-nestjs[:${TAG}] fork260509-soybean-admin-nestjs/backend/`、預設 TAG=`latest`。
- **FR-003**: script MUST 接受 `--tag <name>` / `-t <name>` 參數 override 預設 tag(per US3);沒給時 = `latest`。
- **FR-004**: script MUST 在跑完 docker build 後印出 image size feedback line(對齊 `docker images nestjs:rev1-admin-nestjs --format "..."` 輸出)。
- **FR-005**: script MUST 在 docker build 失敗時 exit 非 0(`set -e` 保證、`pipefail` 保 piped command failure propagate)。
- **FR-006**: script MUST `chmod +x deploy/build-nestjs.sh` 為 executable(commit 時 git 記 file mode 755、對齊 deploy/generate-dev-cert.sh 既有 755 mode)。
- **FR-007**: W-FA3 MUST 為 **單段 commit**(對齊 W-F1~W-F7 + W-FA1 + W-FA2 慣例、只動 outer repo)。
- **FR-008**: `CLAUDE.md` §5.2.1 MUST 把 inline build cmd(line 167-172)換成 `bash deploy/build-nestjs.sh # 第一次:build nestjs image(cold ~3-5 min;NODE_VERSION 內建 22.11.0、tag 預設 latest)`、保留 W-FA1 spec A-002 reference comment。
- **FR-009**: `docs/INTEGRATION-CHECKLIST.md` MUST 更新:Phase W-7 roadmap 表 W-FA3 row 「未啟」→「完成」+ Current Focus 更新(Phase 改 W-FA1+W-FA2+W-FA3 三件套全完成、Active feature 改無、下一步改 F10 為主)+ 已完成里程碑加 W-FA3 條目。
- **FR-010**: W-FA3 MUST 不引入任何 CI/CD platform 配置(GitHub Actions / GitLab CI / 其他、per Q1 拍板)。
- **FR-011**: W-FA3 MUST 不引入 image registry push 命令(GHCR / Docker Hub / 其他、per Q1 拍板)。
- **FR-012**: W-FA3 MUST 不動 base-web src(per Constitution Principle IV)、不動 rust-api worktree、不動 nestjs fork source(per Q2 + Constitution Principle IV 延伸 + 沿襲 W-FA1 FR-018 / W-FA2 FR-013)。
- **FR-013**: W-FA3 MUST 不改 `fork260509-soybean-admin-nestjs/Dockerfile`(per FR-012;若未來 fork upstream rebase 改 `ARG NODE_VERSION` default 對齊 22.11.0、可移除 script 內 `--build-arg`、屬 fork drift 範疇、不在 W-FA3)。
- **FR-014**: W-FA3 MUST 不改 `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.prod.yml` 任何條目(compose 仍用 W-FA1 落定的 `image: nestjs:rev1-admin-nestjs`、W-FA3 只負責 build、不負責 deploy)。
- **FR-015**: W-FA3 MUST 不引入 image size 優化 / Dockerfile 改動(per Q3 拍板)、不引入 multi-arch build / cross-platform build(留 OOS、單 platform local build 對 rev1 dev 場景已夠)。

### Non-Functional Requirements

- **NFR-001**: script LOC SHOULD ≤ 30 行(對齊 `deploy/generate-dev-cert.sh` ~20-30 行既有風格、避免 over-engineering)。
- **NFR-002**: script 跑時間 SHOULD 對齊 docker build 本身(cold ~3-5 min、warm cache ~30s);script wrapper overhead SHOULD ≤ 1s。
- **NFR-003**: script 印的 image size feedback line SHOULD 含 image name + tag + size(便於 operator quick visual confirm + 未來 image 優化 baseline 對比)。
- **NFR-004**: W-FA3 spec / plan / tasks 規模 SHOULD 小於 W-FA2(估 ~15-20 task、~3 個檔案改動;W-FA2 ~32 task)。

### Key Entities

- **`deploy/build-nestjs.sh`**(新建)— ~20-30 行 bash script、含 shebang + set -euo pipefail + tag parsing + docker build cmd + image size feedback
- **`CLAUDE.md` §5.2.1**(改)— 把 line 167-172 inline build cmd 換成 `bash deploy/build-nestjs.sh` + 保 NODE_VERSION reference 註解
- **`docs/INTEGRATION-CHECKLIST.md`**(改)— Phase W-7 W-FA3 row + Current Focus + 已完成里程碑
- **`fork260509-soybean-admin-nestjs/`**(**不動**、per FR-012)— nestjs fork repo 完全零改動(包含 `.github/` metadata)
- **base-web / rust-api**(**不動**、per FR-012)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 刪 `nestjs:rev1-admin-nestjs` image 後跑 `./deploy/build-nestjs.sh` → `docker images nestjs:rev1-admin-nestjs --format "{{.Size}}"` 顯示 image size 非空、且 W-FA1 baseline(~870MB)等義。
- **SC-002**: W-FA3 落地後跑 `docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait` → 7 service healthy(對齊 W-FA1 baseline);證 W-FA3 image build artifact 與 W-FA1 quickstart Step 1 inline cmd 結果等義。
- **SC-003**: script 第二次跑 < 30s(`time ./deploy/build-nestjs.sh` real)、stdout 含 docker cache hit feedback(`CACHED` keyword)。
- **SC-004**: `./deploy/build-nestjs.sh --tag rev1-test` → `docker images nestjs:rev1-admin-nestjs:rev1-test -q` 非空 + `nestjs:rev1-admin-nestjs:latest` 不受影響(per US3)。
- **SC-005**: `git diff HEAD -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 無輸出(per FR-012 三邊零改動)。
- **SC-006**: W-FA3 為單段 commit、`git log --oneline -1` 為 W-FA3 主要落地 commit、無「兩段式」紀律(對齊 W-FA1 / W-FA2 模式)。
- **SC-007**: script LOC ≤ 30(`wc -l < deploy/build-nestjs.sh`、per NFR-001)。

## Assumptions

- **A-001**: docker daemon 已啟、operator 在 workspace root 跑 script(對齊 CLAUDE.md §4.1 / §4 所有命令在 workspace root 慣例)。
- **A-002**: `fork260509-soybean-admin-nestjs/backend/Dockerfile` 既有結構(W-FA1 brainstorm 階段 2026-05-18 已驗、`ARG NODE_VERSION=20.11.1` + multi-stage build + USER node + EXPOSE 9528 + 含 curl)、W-FA3 落地時不變。
- **A-003**: BuildKit available(docker 24+ 預設啟用;`DOCKER_BUILDKIT=1` 顯式重申不會 break legacy docker)。
- **A-004**: W-FA1 落定的 NODE_VERSION=22.11.0 build-arg override 在 W-FA3 落地時仍適用(若 fork Dockerfile 升 Node major、屬 fork drift、W-FA3 不負責、operator 改 script 即可)。
- **A-005**: nestjs:rev1-admin-nestjs image tag 不被其他 build pipeline 用(rev1 是個人 workspace、無 conflict 風險)。

## Dependencies

### Inbound(本 feature 依賴)

- **W-FA1** `compose-nestjs-service`:nestjs Dockerfile build target / NODE_VERSION build-arg override discovery / image tag pattern `nestjs:rev1-admin-nestjs`。✅(merge `b095d55`)
- **W-FA2** `nginx-track-a-transitional-block`:可選 — 完成 Track DESIGN-A 三件套順序對齊(W-FA1 → W-FA2 → W-FA3);技術依賴鬆耦合(W-FA3 script 不依賴 nginx routing、W-FA2 不依賴 build script),但 brainstorm 階段對齊「三件套順序」慣例。✅(merge `c5b7840`)

### Outbound(本 feature 解鎖)

- **W-F17** `cicd-build-pipeline` 後續抽象階段:W-FA3 local script + W-F1 local docker build + W-F2 local docker build 三者可作為 W-F17 抽象 base — W-F17 把這些 local 模式統一升 CI/CD platform(若有此需求)。
- **F14** `design-a-to-b-cutover`:W-FA3 build script 為 transitional script、F14 cutover 時 `rm deploy/build-nestjs.sh` + 改 CLAUDE.md §8.2.1 移除 nestjs build 段落(對齊 W-FA1 / W-FA2 marker block 整段刪設計、本 script 整支即為 cutover 點)。
- **Phase W deploy P7 Track DESIGN-A 全部完成**:W-FA1 + W-FA2 + W-FA3 三件套全 done 後、Track DESIGN-A deploy 結構完整;後續 application Phase 進入 F10 refresh-token-nestjs-bridge(F10 在 nestjs 補實作 sys_tokens prisma + JWT bridge、屬 application Phase Phase 2 與 W-F* deploy 分軌)。

## Out of Scope

- **OOS-001**: GitHub Actions / GitLab CI / 其他 CI/CD platform — per Q1 拍板、未來需要可另開 W-F17 Track DESIGN-A 變體 feature。
- **OOS-002**: Image registry push(GHCR / Docker Hub / 其他)— per Q1 拍板;若未來 W-FA3 升 CI/CD 模式可一併納入。
- **OOS-003**: Image size 優化(W-FA1 870MB → ≤ 500MB)— per Q3 拍板、留 backlog。nestjs 是 transitional ROI 低、F14 cutover 前不投資;若操作體驗痛點(disk 滿 / pull 慢)可另開 W-FA3-followup。
- **OOS-004**: nestjs fork repo 任何改動(包含 `.github/workflows/` metadata)— per Q2 + Constitution Principle IV 延伸。
- **OOS-005**: docker-compose 改動(image reference / deploy 機制)— per FR-014、W-FA3 只負責 build、不負責 deploy(deploy 由 W-FA1 既有 compose pattern 處理)。
- **OOS-006**: rust-api / base-web build script 對應 feature — rev1 既有 Dockerfile + worktree+submodule 模式下 docker build 直接走、不需 script;若未來需要可另開 W-F1b / W-F2b 對應 feature。
- **OOS-007**: Multi-arch build / cross-platform build(linux/amd64 + linux/arm64)— per FR-015、單 platform local build 對 rev1 dev 場景已夠;若未來 prod 部署到不同 arch 機需要可加 `--platform` 參數。
- **OOS-008**: Image clean-up(老 tag 自動刪除 / disk space mgmt)— 留 operator 手動 `docker image prune` 處理。
- **OOS-009**: W-F17 抽象 build pipeline / W-F18 deploy pipeline 共用設計 — W-FA3 是 Track DESIGN-A 專屬 local script、不抽象;W-F17 後續做時可參考 W-FA3 / W-F1 / W-F2 三個 local case、自然成形 CI/CD platform 拍板。

## Open Questions(brainstorming 階段保留、`/speckit-plan` 階段解)

- 暫無。brainstorm 3 顯式 Q 全拍板 + 5 自然推論 dovetail、無 OQ 需 plan 階段解。

---

## brainstorming session 結束

W-FA3 範疇緊湊到極致(~3 file、~30 LOC script + ~10 LOC doc)、是 Phase W deploy 階段最 minimal feature。設計與 W-FA1 / W-FA2 模式對齊(單段 outer commit、三邊零改動、DESIGN-B 退場易整段刪)、但 scope 更輕(無 nginx config / 無 application code / 無 docker-compose 改動)、實作預估 < 15-20 task。

**下一步**:跑 `/speckit-specify "W-FA3 cicd-nestjs-build-job ..."` 轉為正式 feature spec。
