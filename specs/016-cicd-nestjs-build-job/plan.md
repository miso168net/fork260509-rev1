# Implementation Plan: W-FA3 — cicd-nestjs-build-job

**Branch**: `016-cicd-nestjs-build-job` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-cicd-nestjs-build-job/spec.md`

## Summary

W-FA3 是 rev1 deploy 階段 Track DESIGN-A 三件套**第三個也是最後一個** feature(W-FA1 + W-FA2 後接續、收尾 Track DESIGN-A deploy 結構)— 把 W-FA1 落地的 nestjs image build cmd(per CLAUDE.md §5.2.1 line 167-172、`DOCKER_BUILDKIT=1 docker build --build-arg NODE_VERSION=22.11.0 -f ... -t nestjs:rev1-admin-nestjs ...`)抽象成 local shell script `deploy/build-nestjs.sh`,自動化 build cmd + NODE_VERSION build-arg 內建 + `--tag <name>` 選項 + 結尾印 image size feedback。**Plan 階段對齊 brainstorm + spec 拍板(無新 OQ)**,範疇對齊 spec FR-001~016。

**Technical approach**(per [research.md](research.md)):

- **Bash shell script `deploy/build-nestjs.sh`**(per Q1 + 自然推論)— `#!/usr/bin/env bash` + `set -euo pipefail` 防呆 + tag parsing(支援 `--tag <name>` / `-t <name>` / `--help` / `-h`)+ docker build cmd + image size feedback line
- **No CI/CD platform**(per Q1)— 不引入 GitHub Actions / GitLab CI / 其他;不 push GHCR / Docker Hub
- **nestjs fork repo 零改動**(per Q2 + Constitution Principle IV/V 延伸)— 不動 fork 內任何檔(包含 `.github/` metadata、Dockerfile)
- **NODE_VERSION build-arg 內建為 22.11.0**(per 自然推論、W-FA1 implement-time A-002)— script 內固定值、不暴露為參數;若未來 fork upstream rebase 對齊 22.11.0 default 可移除 `--build-arg`(屬 fork drift、不在 W-FA3 範疇)
- **單段 commit**(per W-F1~W-F7 + W-FA1 + W-FA2 慣例)— 只動 outer repo、新建 `deploy/build-nestjs.sh` + 改 `CLAUDE.md` + 改 `docs/INTEGRATION-CHECKLIST.md` 同一 commit

**Pre-implement validation tasks**(per [research.md](research.md)):

- **T1**:bash `set -euo pipefail` + `getopts` 或 manual parsing 對 `--tag <name>` 支援(per R-1、FR-003)— acceptance 階段 `bash deploy/build-nestjs.sh --tag rev1-test` 驗
- **T2**:跑 script cold build → image `nestjs:rev1-admin-nestjs:latest` 落地 + size 印出(per US1、SC-001)
- **T3**:跑 script second time → < 30s + `CACHED` keyword(per US2、SC-003)
- **T4**:跑 `--tag rev1-test` → image tag = `nestjs:rev1-admin-nestjs:rev1-test`(per US3、SC-004)
- **T5**:`git diff HEAD -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 無輸出(per US4、SC-005)
- **T6**:W-FA1 stack regression — `docker compose --profile track-a up -d --wait` 7 service healthy(per US1.3、US4.2、SC-002)

## Technical Context

**Language/Version**:bash(POSIX-extensible、WSL2 / Linux 主流 shell;對齊 `deploy/generate-dev-cert.sh` 既有風格)

**Primary Dependencies**:
- **docker**(v24+ 預設 BuildKit、per A-003)
- **fork260509-soybean-admin-nestjs/backend/Dockerfile**(W-FA1 build context、per A-002 既有 multi-stage build + USER node + EXPOSE 9528)
- **既有 W-FA1 image tag pattern**:`nestjs:rev1-admin-nestjs`(對齊 docker-compose.yml `image:` reference)

**Storage**:
- **`deploy/build-nestjs.sh`**(新建、~20-30 行 bash)— 唯一 outer artifact
- **`CLAUDE.md`**(改)— §5.2.1 line 167-172 inline build cmd 換成 `bash deploy/build-nestjs.sh`
- **`docs/INTEGRATION-CHECKLIST.md`**(改)— Phase W-7 W-FA3 row + Current Focus + 已完成里程碑

**Testing**:
- **script syntax verification**:`bash -n deploy/build-nestjs.sh`(shellcheck-like syntax check、不跑 docker)
- **script execution verification**:`bash deploy/build-nestjs.sh` → exit 0 + image 落地 + size feedback line
- **idempotent verification**:第二次跑 < 30s + `CACHED` keyword
- **tag override verification**:`bash deploy/build-nestjs.sh --tag rev1-test` → image tag 對齊
- **help / error verification**:`--help` 印 usage、`--tag` 後缺值 報 error + exit 非 0
- **W-FA1 stack regression**:script build 完 image 後 `docker compose --profile track-a up -d --wait` 7 service healthy
- **Zero-diff verification**:`git diff HEAD -- base-web/ rust-api/ fork260509-soybean-admin-nestjs/` 應 empty

**Target Platform**:bash shell(WSL2 / Linux host)+ docker daemon + BuildKit(v24+);**單 platform local build**(per FR-016、不引入 multi-arch)

**Project Type**:**deploy-track feature**(對齊 W-F5/W-F6/W-F7 + W-FA1 + W-FA2)— rev1 deploy/ 目錄 shell script、無 application source code 改動;最小範疇純 outer 新建 1 個 script + 改 2 個 doc

**Performance Goals**:
- script wrapper overhead SHOULD ≤ 1s(per NFR-002;真實時間取決於 docker build 本身)
- script LOC ≤ 30 行(per NFR-001;對齊 `generate-dev-cert.sh` ~20-30 行既有風格)
- Second run < 30s(per NFR-002 + SC-003 docker cache hit)

**Constraints**:
- `MUST NOT` 動 base-web src(per Constitution Principle IV + FR-013)
- `MUST NOT` 動 rust-api worktree(per Constitution Principle IV + FR-013)
- `MUST NOT` 動 nestjs fork source / Dockerfile / `.github/`(per Q2 + FR-013 / FR-014 + Constitution Principle IV 延伸)
- `MUST NOT` 引入 CI/CD platform 配置(per Q1 + FR-011)
- `MUST NOT` 引入 image registry push 命令(per Q1 + FR-012)
- `MUST NOT` 改 docker-compose.yml / .dev.yml / .prod.yml 任何條目(per FR-015)
- `MUST NOT` 引入 image size 優化 / multi-arch build(per Q3 + FR-016)
- `MUST` 為單段 commit(per FR-007 + W-F1~W-F7 + W-FA1 + W-FA2 慣例)
- `MUST` script chmod +x = 755(per FR-006、對齊 `generate-dev-cert.sh`)
- `MUST` script 含 `set -euo pipefail` 防呆(per FR-001 + FR-005)

**Scale/Scope**:
- 改動 / 新建檔案數:**3 個 outer file**(1 個新檔 + 2 個改檔)、**0 個 worktree 動**(per FR-013)
- LOC 量級:~25 行 bash script + ~10 行 CLAUDE.md 改 + ~15 行 INTEGRATION-CHECKLIST.md = ~50 行 total
- Acceptance scenario 數:US1 P1 MVP 3 + US2 P2 1 + US3 P3 2 + US4 P2 2 = **8 個 scenario**(spec 已列)
- 預估 task 數:~15-20 task(per NFR-004、小於 W-FA2 ~32 task)
- Commit 模式:**單段 commit**(per W-FA1 + W-FA2 同模式)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

對照 [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

### Core Principles(5 個)

- **I. RBAC Fail-safe** — ✅ **N/A**(W-FA3 純 build script、不涉 Casbin enforcement 或業務 RBAC)
- **II. Soft Delete + Audit Log** — ✅ **N/A**(W-FA3 不涉業務寫入 / soft delete / audit log)
- **III. 嚴版禁 Forward + 單一職責** — ✅ **PASS**(W-FA3 是 build automation script、單一職責 = 跑 nestjs image build;不引 backend ↔ backend forward;script 內邏輯 minimal、不混業務 / deploy 邏輯)
- **IV. base 不改動邊界** — ✅ **PASS**(W-FA3 不動 base-web src 任何 file;延伸至 rust-api worktree + nestjs fork source / Dockerfile / `.github/` 也不動 — per FR-013 / FR-014 + 沿襲 W-FA1 FR-018 / W-FA2 FR-013)
- **V. 漸進收縮(DESIGN-A → DESIGN-B)** — ✅ **PASS**(W-FA3 script 直接服務 DESIGN-B 退場 — F14 cutover 時 `rm deploy/build-nestjs.sh` + 改回 CLAUDE.md §5.2.1 即可;對齊 W-FA2 marker block 整段刪設計、本 script 整支即為 transitional artifact;通過「未來 nestjs 拔掉時順嗎」濾鏡 — 拔掉就刪 script、不需保留)

### 架構約束(12 個)

- **部署形態 docker-compose 單機** — ✅ **N/A**(W-FA3 為 build script、不影響 deploy 形態;build artifact 是 docker image、由既有 docker-compose 引用)
- **資料庫 PostgreSQL** — ✅ **N/A**(W-FA3 不涉 DB)
- **快取 redis** — ✅ **N/A**(W-FA3 不涉 redis)
- **TLS 對外** — ✅ **N/A**(W-FA3 不涉 TLS / 對外 endpoint)
- **Secret 注入** — ✅ **N/A**(W-FA3 不涉 secret;build 過程也不需 secret、Dockerfile 內 secret handling 由 W-FA1 處理)
- **DB migration trigger init container** — ✅ **N/A**(W-FA3 不涉 DB migration)
- **Port 規劃 `1XXXX`** — ✅ **N/A**(W-FA3 不開新 port)
- **Observability(Loki + grafana + prometheus)** — ✅ **N/A**(W-FA3 不引入 observability)
- **結構化 log JSON** — ✅ **N/A**(W-FA3 是 build script、script 輸出對 operator console、不需結構化 log)
- **Backup PITR** — ✅ **N/A**(W-FA3 不涉 backup)
- **背景工作** — ✅ **N/A**(W-FA3 不引入 background job)
- **CI/CD platform** — ✅ **PASS**(W-FA3 明示拍板 local script、不引入 CI/CD platform、per Q1;對齊「rev1 是個人整合研究 workspace、非 production」現實;未來 W-F17 抽象階段可選擇是否升 CI/CD)

### 開發流程(6 個)

- **spec-kit 流程紀律** — ✅ **PASS**(brainstorm → /speckit-specify → /speckit-clarify(0 Q)→ /speckit-plan 流程完整;tasks + implement 流程後續)
- **Constitution Check 紀律** — ✅ **PASS**(本節 23 gate 對照、0 violation、0 partial)
- **兩段式 commit 紀律** — ✅ **N/A**(W-FA3 單段 commit、只動 outer repo、不動 worktree;對齊 W-F1~W-F7 + W-FA1 + W-FA2 慣例)
- **Conventional Commits 中文 subject** — ✅ **PASS**(預期 commit subject:`feat(deploy): W-FA3 加 nestjs image build script`)
- **Push 確認紀律** — ✅ **PASS**(implement 完成後 push 需 user 同意;對齊 W-F* + W-FA1 + W-FA2 既有紀律)
- **TLS 紀律** — ✅ **N/A**(W-FA3 不涉 TLS)

**Gate result**:**6 PASS / 17 N/A / 0 Partial / 0 violation**。Phase 0 起 gate 通過、無 Complexity Tracking entry 需要。

## Project Structure

### Documentation (this feature)

```text
specs/016-cicd-nestjs-build-job/
├── plan.md                              # This file(/speckit-plan output)
├── research.md                          # Phase 0 — R-1 bash --tag parsing + R-2 image size feedback line format
├── data-model.md                        # Phase 1 — 3 個 entity(script / doc edits)
├── quickstart.md                        # Phase 1 — operator implement + acceptance guide
├── contracts/                           # Phase 1
│   ├── script-contract.md               #   C-S* shell script CLI contract(--tag / --help / exit code)
│   └── verification-commands.md         #   C-V* host bash / docker / git 驗
├── checklists/
│   └── requirements.md                  # /speckit-specify 階段已產出
├── spec.md                              # /speckit-specify 階段已產出
└── tasks.md                             # Phase 2 output(/speckit-tasks、NOT in this command)
```

### Outer repo 改動(W-FA3 implement 階段預期變動範圍 — 純 outer、不動 worktree)

```text
fork260509-rev1/                                  # outer repo root(動;單段 commit)
├── deploy/
│   └── build-nestjs.sh                          # ★ W-FA3 新建:bash script ~25 行(shebang + set -euo pipefail + --tag parsing + --help + docker build + image size feedback)
├── CLAUDE.md                                     # ★ W-FA3 改:§5.2.1 line 167-172 inline build cmd 換成 `bash deploy/build-nestjs.sh`
└── docs/
    └── INTEGRATION-CHECKLIST.md                  # ★ W-FA3 改:Phase W-7 W-FA3 row「未啟」→「完成」+ Current Focus + 已完成里程碑
```

### Worktree 改動(無)

```text
base-web/                                # 不動(per FR-013)
rust-api/                                # 不動(per FR-013)
fork260509-soybean-admin-nestjs/         # 不動(per FR-013 / FR-014 + Constitution Principle IV 延伸)
```

### Image / artifact 改動(無新)

W-FA3 不 build 任何 image **本身**、不引入新 image artifact;W-FA3 是 build automation、build 出的 image 對齊 W-FA1 既有 `nestjs:rev1-admin-nestjs` tag、operator 跑 script 後 image 落地(W-FA1 落地後可重複跑 script 重 build)。

**Structure Decision**:W-FA3 為 **deploy-track outer-only feature**(對齊 W-F5/W-F6/W-F7 + W-FA1 + W-FA2 純 outer single-commit 慣例)。改動範圍極緊湊:3 個 outer file(1 個新 script + 2 個 doc edit)、~50 LOC;無 worktree 改動、無 application source 改動、無 image build artifact、無 CI/CD platform 配置。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**無 violation、本表保留為空**(per Gate result 6 PASS / 17 N/A / 0 partial / 0 violation)。

---

**Phase 0 / 1 outputs**:見同目錄 [`research.md`](research.md)、[`data-model.md`](data-model.md)、[`quickstart.md`](quickstart.md)、[`contracts/`](contracts/)。
