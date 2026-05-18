# Quickstart: W-FA3 — cicd-nestjs-build-job

**Phase 1 output** | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

> operator 跑 W-FA3 implement + acceptance 的最小步驟。對齊 W-FA1 / W-FA2 quickstart 風格。

---

## Prerequisites

1. Outer branch = `016-cicd-nestjs-build-job`(speckit.git.feature pre-hook 已建)
2. W-FA1 落地完成(per merge `b095d55`、nestjs:rev1-admin-nestjs image 可手動 build via inline cmd)
3. W-FA2 落地完成(per merge `c5b7840`、track-a profile + refreshToken routing 就位)
4. docker daemon 啟動 + BuildKit 可用(docker 24+ 預設、per A-003)
5. `fork260509-soybean-admin-nestjs/backend/` 源倉本機留(per A-002)

---

## Implement Steps(估 ~5-10 分鐘 W-FA3 implementation 本身,~5-10 分鐘 acceptance verification)

### Step 1:新建 `deploy/build-nestjs.sh`

依 [data-model.md](data-model.md) E-1 結構寫 ~28 行 bash script(shebang + set -euo pipefail + tag parsing + --help + docker build + image size feedback)。詳見 [contracts/script-contract.md](contracts/script-contract.md) C-S1 ~ C-S8 各 contract。

### Step 2:`chmod +x deploy/build-nestjs.sh`

```bash
chmod +x deploy/build-nestjs.sh
ls -la deploy/build-nestjs.sh   # 預期 mode 755
```

### Step 3:Script syntax check + help verify(無 docker、快驗)

跑 [contracts/verification-commands.md](contracts/verification-commands.md) C-V1 + C-V2 + C-V3。

預期:`bash -n` exit 0、`--help` 印 5 行 usage、`--tag` 缺值報 error + exit 1。

### Step 4:改 `CLAUDE.md` §5.2.1

依 [data-model.md](data-model.md) E-2 把 line 167-172 inline build cmd 換成 1 行 `bash deploy/build-nestjs.sh` + 保 NODE_VERSION reference comment。

### Step 5:改 `docs/INTEGRATION-CHECKLIST.md`

依 [data-model.md](data-model.md) E-3 更新 3 段:Current Focus、Phase W-7 W-FA3 row、已完成里程碑(SHA 留 commit 後填)。

### Step 6:Cold build acceptance(US1 P1 MVP)

跑 [contracts/verification-commands.md](contracts/verification-commands.md) C-V4。預期 cold ~3-5 min、stdout 最後 1 行 image size feedback 對齊 `[W-FA3] Built nestjs:rev1-admin-nestjs:latest (870MB)`。

### Step 7:Idempotent + tag override(US2 + US3 acceptance)

跑 C-V5(idempotent < 30s + `CACHED` keyword)+ C-V6(`--tag rev1-test` 驗)。

### Step 8:W-FA1 / W-FA2 stack regression(US4 acceptance)

跑 C-V7(W-FA1 stack 7 service healthy)+ C-V8(W-FA2 refreshToken endpoint 仍走通 nginx → nestjs)。

### Step 9:Zero-regression + LOC + doc grep(US4 + NFR + SC)

跑 C-V9(three sides zero diff)+ C-V10(LOC ≤ 30)+ C-V11(doc grep verify)。

### Step 10:單段 outer commit(per FR-007)

```bash
git status --short
# 預期:
#   modified: CLAUDE.md
#   modified: docs/INTEGRATION-CHECKLIST.md
#   modified: .specify/feature.json
#   untracked: deploy/build-nestjs.sh
#   untracked: specs/016-cicd-nestjs-build-job/

git add deploy/build-nestjs.sh \
        CLAUDE.md \
        docs/INTEGRATION-CHECKLIST.md \
        .specify/feature.json \
        specs/016-cicd-nestjs-build-job/

git commit -m "$(cat <<'EOF'
feat(deploy): W-FA3 加 nestjs image build script + Track DESIGN-A 三件套收尾

rev1 deploy 階段 Track DESIGN-A 三件套第三個也是最後一個 feature(W-FA1 + W-FA2
後接續、Track DESIGN-A deploy 結構收尾、F10/F13/F14 之前)。把 W-FA1 落地的
nestjs image build cmd(DOCKER_BUILDKIT=1 docker build --build-arg
NODE_VERSION=22.11.0 ...)抽象成 local shell script deploy/build-nestjs.sh、
自動化 build cmd + NODE_VERSION build-arg 內建 + --tag <name> 選項 + 結尾印
image size feedback。

改動範圍(3 個 outer file、~50 LOC):
- deploy/build-nestjs.sh:新建 ~28 行 bash script(shebang + set -euo pipefail
  + tag parsing + --help + docker build + image size feedback、mode 755)
- CLAUDE.md §5.2.1:把 inline build cmd(line 167-172)換成 `bash deploy/build-nestjs.sh`
- docs/INTEGRATION-CHECKLIST.md:Phase W-7 W-FA3 row「未啟」→「完成」+ Current
  Focus 更新(三件套全完成)+ 已完成里程碑

設計拍板(brainstorm 3 顯式 Q + 5 自然推論、見 docs/superpowers/013):
- Q1 模式:Local docker build script(無 CI/CD 平台、不 push registry;rev1 是
  個人整合研究 workspace、非 production、不投資 CI 自動化 overhead)
- Q2 nestjs fork 零改動:不放 workflow yaml(per Q1 mooted),且 nestjs fork repo
  完全零改動(包含 .github/ metadata)
- Q3 image size 優化:不納入、留 backlog(YAGNI、nestjs transitional ROI 低)
- 5 自然推論:script 路徑 deploy/build-nestjs.sh + image tag 預設 latest + NODE
  _VERSION=22.11.0 內建(per W-FA1 implement-time)+ script 不主動驗 prereq +
  結尾印 image size

Acceptance:US1 P1 MVP 3/3 + US2 P2 1/1 + US3 P3 2/2 + US4 P2 2/2 = 8/8 PASS;
base-web/rust-api/nestjs fork 三邊零改動(per FR-013 + Constitution Principle IV/V
延伸);W-FA1 stack 7 service healthy(per US1.3 / US4.2、證 W-FA3 build 與 W-FA1
inline cmd 等義);W-FA2 refreshToken endpoint 仍走通(per US4.2 對 W-FA2 regression);
LOC = ~28 行(per NFR-001 SHOULD ≤ 30、SC-007 PASS);docker cache hit 第二次跑 < 30s
(per SC-003)。

Constitution Check 6 PASS / 17 N/A / 0 violation;DESIGN-A → DESIGN-B 遷移時整支
刪除 `rm deploy/build-nestjs.sh` + 改回 CLAUDE.md §5.2.1 即可、無 DB / application
改動。Track DESIGN-A 三件套(W-FA1/W-FA2/W-FA3)deploy 結構 wire-up 完整、
下一步 F10 refresh-token-nestjs-bridge(application Phase 2 第三個 feature)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 11:Push 等 user 同意

- 告知 user:「W-FA3 單段 outer commit 已落、要不要 push origin 016-cicd-nestjs-build-job?」
- 不主動 push(per CLAUDE.md §5)
- user 同意後跑 `git push origin 016-cicd-nestjs-build-job` + 對齊 W-FA1 / W-FA2 模式 merge `--no-ff` 回 `rev1-admin-root` + follow-up `docs(checklist)` commit 填 SHA

---

## 故障排查

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| `bash deploy/build-nestjs.sh` 報 `permission denied` | 沒 chmod | `chmod +x deploy/build-nestjs.sh`(per FR-006)|
| `bash deploy/build-nestjs.sh` 跑時報 `unable to prepare context` | `fork260509-soybean-admin-nestjs/backend/` 不存在 | operator 補拉 fork repo;script 不主動防呆(per E-1 + 自然推論)|
| Script 跑後 image size = 0B 或極小 | docker build 失敗、但 script 沒 propagate exit | 檢 `set -euo pipefail` 是否在 script 內;`set -e` 應自動 propagate |
| `--tag rev1-test` 後 image 落地但 `latest` 也被改 | docker build `-t` 行為理解錯 | docker `-t` 多 tag 是「也 tag」、不是「override」;若用 `--tag rev1-test` 跑、`latest` 應該保留前次 build 的 SHA(per C-S8)|
| Second run 不走 cache(> 30s) | BuildKit cache invalidated(Dockerfile 改動 / build context 變)| 檢 fork backend/ 是否有改動;若 fork rebase 過、cache miss 是預期 |
| `bash -n deploy/build-nestjs.sh` 報 syntax error | shebang / 括號 / case 語法錯 | 用 `shellcheck deploy/build-nestjs.sh`(若有裝)查、或對照 [data-model.md](data-model.md) E-1 樣板 |

---

## Acceptance Phase 預期時程

- Implement Step 1-5(寫 script + chmod + 改 doc):~5 分鐘
- Step 6 cold build(US1):~3-5 分鐘
- Step 7 idempotent + tag override(US2 + US3):~1-2 分鐘
- Step 8 W-FA1 stack regression(US4.2):~3-5 分鐘(stack up wait)
- Step 9 zero-regression + LOC + doc grep:~30 秒
- Step 10 single-commit:~1 分鐘
- Step 11 push wait:~30 秒

**Total**:~15-20 分鐘(對齊 NFR-004 spec / plan / tasks 規模 SHOULD 小於 W-FA2 ~20-25 分鐘)
