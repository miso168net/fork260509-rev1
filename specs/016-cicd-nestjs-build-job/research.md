# Phase 0 Research: W-FA3 — cicd-nestjs-build-job

**Phase 0 output** | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

> 此檔列 plan 階段「Pre-implement validation tasks T1~T6」之 research decisions、解釋 brainstorm 沒明示的 implementation-level 拍板細節。W-FA3 範疇緊湊、research 量極少(主要是 bash argument parsing 慣例 + image size feedback line format)。

---

## R-1:Bash `--tag <name>` 參數 parsing 方式

**Decision**:用 **manual while-case parsing**(對齊 `deploy/generate-dev-cert.sh` 既有風格、避免 `getopts` 對長選項處理較複雜)

**Rationale**:
- W-FA3 script ~25 行、只有 2-3 個 flag(`--tag` / `-t` / `--help` / `-h`)、用 `getopts` 對「long-flag(`--tag`)」處理較囉嗦(`getopts` 內建只支援單字 flag)
- Manual `while [[ $# -gt 0 ]]; do case "$1" in ... esac; shift; done` 結構清晰、~10-15 行 code、支援 long + short flag + 缺值檢查
- 對齊 `deploy/generate-dev-cert.sh` W-F6 既有 shell script 風格、降 review burden

**Alternatives considered**:
- **Option A**: `getopts` builtin — 內建、跨 shell 兼容,但長 flag(`--tag`)需要手動處理 + 多寫 wrapper、對 2-3 個 flag 來說反而複雜
- **Option B**: `getopt` external command(GNU coreutils 版)— 完整支援長 flag,但 macOS 上預設是 BSD getopt(行為不同)、跨平台脆弱、rev1 WSL2 + Linux 為主可用但對齊既有 shell script 風格還是 manual case 較簡
- **Option C**: 用 python helper — overkill、對 shell wrapper feature 來說增 dependency 不值

**Reference**:`deploy/generate-dev-cert.sh`(W-F6 落地、約 25 行)— 沿用其 manual case 風格

---

## R-2:Image size feedback line format

**Decision**:用 `docker images <image>:<tag> --format "[W-FA3] Built {{.Repository}}:{{.Tag}} ({{.Size}})"`(對齊 spec FR-004 + NFR-003 含 image name + tag + size、加 `[W-FA3]` prefix 易識別)

**Rationale**:
- spec FR-004 + NFR-003 + acceptance US1.2 要 line 含 image name + tag + size
- `docker images --format` 內建 Go template、輸出 controllable + parseable、不需後處理
- `[W-FA3]` prefix 識別 W-FA3 落地的 output(W-FA1 quickstart Step 1 inline cmd 沒此 prefix)、便於 operator 分辨 + 未來 W-F12 observability 階段 log filter
- `{{.Repository}}:{{.Tag}}` 顯示完整 image:tag、`({{.Size}})` 括號內 humanize size(如 `870MB`)

**Alternatives considered**:
- **Option A**: 純 `docker images <image>` 預設輸出 table — 但格式有 header + 對 operator 視覺 noise 大
- **Option B**: `docker inspect <image> | jq '.Size'` — 用 jq 太重、對 shell script 增依賴(jq 不一定可用)
- **Option C**: 不印 size、只印 `[W-FA3] Built <image>:<tag>` — 失去 W-FA1 NFR-001 implement-time discovery「870MB 偏大」的 baseline feedback、未來 image 優化時無對比基準

**Output 範例**(預期):
```
[W-FA3] Built nestjs:rev1-admin-nestjs:latest (870MB)
```

---

## R-3:`--help` usage line format

**Decision**:對齊 `deploy/generate-dev-cert.sh` W-F6 既有 usage pattern — 印 1 行短 usage + 列出 supported flags + exit 0

**Rationale**:
- spec FR-010 + E-8 要求 `--help` 支援、對 operator 友善
- 不需詳細 man page、~5 行 usage 即足:
  - `Usage: bash deploy/build-nestjs.sh [--tag <name>] [--help]`
  - Default tag = `latest`
  - Build context = `fork260509-soybean-admin-nestjs/backend/`
- 對齊 `deploy/generate-dev-cert.sh` 既有 minimal usage style(若 W-F6 有 `--help` 支援、若無也屬 W-FA3 自行拍板)

**Alternatives considered**:
- **Option A**: 詳細 man page(印 5-10 行 description + 範例)— W-FA3 script ~25 行、詳細 usage 反而比 script 大
- **Option B**: 不支援 `--help`、operator 看 source code — 對「W-FA3 是 operator-facing automation tool」現實不友善

---

## R-4:Script 失敗時的 error message 風格

**Decision**:用 `echo "[W-FA3 ERROR] <message>" >&2; exit 1` 標準 pattern;**不**做主動 prereq 防呆(per 自然推論 YAGNI)

**Rationale**:
- spec 自然推論 + FR-005 + E-1/E-2 明示「不主動防呆、docker build 自己會報 clear error」
- script 自身需處理的 error 只有「`--tag` 後缺值」(E-7、FR-003)— 此情況 manual case parsing 內判斷 + 用 `echo >&2; exit 1` 顯式報
- 其他 error(docker daemon down / fork dir missing / etc)由 docker build 自己 propagate、`set -e` 保 exit code propagate

**Alternatives considered**:
- **Option A**: 在 script 開頭加 `command -v docker >/dev/null || { echo "docker not found"; exit 1; }` — 對「BuildKit 可用」/「fork dir 存在」/ etc 一連串 prereq 驗,script 變長 + 不 align YAGNI
- **Option B**: 用 trap ERR 印 custom error message — overkill、`set -e` 已足夠

---

## R-5:Script 預設 image tag 拍板

**Decision**:`TAG=${TAG:-latest}`(預設 `latest`、對齊 W-FA1 docker-compose.yml `image: nestjs:rev1-admin-nestjs` reference)

**Rationale**:
- W-FA1 落定 docker-compose.yml 用 `image: nestjs:rev1-admin-nestjs`(無 tag = `latest`)
- script 預設 `TAG=latest` 對齊 — operator 跑 default script 後 compose 直接可用
- 對 `--tag rev1-test` override 場景,operator 要手動改 compose 或用 `docker tag` retag 為 `latest`(W-FA3 不主動 retag、保 single responsibility per FR-002 + FR-003)

**Note**:tag 拍板與 brainstorm 自然推論 5 一致(預設 `latest`、可選 `--tag` override)

---

## Research outputs(Phase 0 結論)

| R | 拍板 | spec 對齊 |
|---|---|---|
| R-1 | Manual while-case `--tag <name>` parsing | FR-003 |
| R-2 | `docker images --format "[W-FA3] Built ...({{.Size}})"` feedback line | FR-004 / NFR-003 |
| R-3 | Minimal 1-line usage + supported flags | FR-010 / E-8 |
| R-4 | `echo >&2; exit 1` standard error pattern + no prereq 防呆 | FR-005 / 自然推論 YAGNI |
| R-5 | `TAG=${TAG:-latest}` 預設、對齊 W-FA1 compose | FR-002 / 自然推論 5 |

**全 NEEDS CLARIFICATION 解** ✓(spec 階段 0 marker、plan 階段 0 marker、research 階段 0 new question)。

**Phase 1 next**:`/contracts/script-contract.md`(C-S* CLI 契約)+ `/contracts/verification-commands.md`(C-V* 驗)+ `data-model.md`(3 個 entity)+ `quickstart.md`(operator 指南)
