# Data Model: W-FA3 — cicd-nestjs-build-job

**Phase 1 output** | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

> W-FA3 為 deploy automation feature、無業務 entity / DB schema / API 介面。本 data-model 列出 spec FR-* 描述的 **檔案層 entity**(shell script + doc edits)+ 結構契約。

---

## E-1:`deploy/build-nestjs.sh`(新建 bash script)

**Location**:`deploy/build-nestjs.sh`(workspace root 相對)— 對齊 `deploy/generate-dev-cert.sh` W-F6 既有 deploy/ 目錄 shell script 慣例

**Structure**(per spec FR-001 ~ FR-006 + FR-010 + R-1 ~ R-5):

```bash
#!/usr/bin/env bash
# W-FA3 — nestjs image build script(Track DESIGN-A transitional、F14 cutover 整支刪)
# 對齊 W-FA1 quickstart Step 1 inline cmd、自動化 build cmd + NODE_VERSION + tag 處理
set -euo pipefail

TAG=latest

usage() {
  cat <<EOF
Usage: bash deploy/build-nestjs.sh [--tag <name>] [--help]
  --tag <name>, -t <name>   Image tag (default: latest)
  --help, -h                Show this help
Build context: fork260509-soybean-admin-nestjs/backend/
Image:         nestjs:rev1-admin-nestjs:<tag>
NODE_VERSION:  22.11.0 (built-in、per W-FA1 implement-time A-002)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag|-t)
      [[ -n "${2:-}" ]] || { echo "[W-FA3 ERROR] --tag requires a value" >&2; exit 1; }
      TAG="$2"; shift 2 ;;
    --help|-h)
      usage; exit 0 ;;
    *)
      echo "[W-FA3 ERROR] unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

DOCKER_BUILDKIT=1 docker build \
  --build-arg NODE_VERSION=22.11.0 \
  -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
  -t "nestjs:rev1-admin-nestjs:${TAG}" \
  fork260509-soybean-admin-nestjs/backend/

docker images "nestjs:rev1-admin-nestjs:${TAG}" \
  --format "[W-FA3] Built {{.Repository}}:{{.Tag}} ({{.Size}})"
```

**LOC 估計**:~28 行(含 comment + blank line、實 code ~22 行)、對齊 NFR-001 SHOULD ≤ 30 行

**File mode**:755(`chmod +x deploy/build-nestjs.sh`、git tracked 含 mode、對齊 `generate-dev-cert.sh`)

**Cutover**:F14 階段 `rm deploy/build-nestjs.sh` + 改回 CLAUDE.md §5.2.1 移除 nestjs build 段落(對齊 W-FA2 marker block 整段刪設計)

---

## E-2:`CLAUDE.md` §5.2.1 改動

**Location**:`CLAUDE.md` §5.2.1 line 165-181 段「DESIGN-A 路線 dev」、把 W-FA1 加的 inline build cmd(line 167-172、6 行)換成 1 行 `bash deploy/build-nestjs.sh` + 保 NODE_VERSION reference comment

**Before**(W-FA1 落地、line 167-172):
```bash
# 第一次：build nestjs image（cold ~3-5 min；NODE_VERSION=22.11.0 為 pnpm 9.1.2 必要 override；
# spec assumption A-002「build 失敗於 NODE_VERSION 對齊 build-arg 處理」現實場景）
DOCKER_BUILDKIT=1 docker build \
  --build-arg NODE_VERSION=22.11.0 \
  -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
  -t nestjs:rev1-admin-nestjs \
  fork260509-soybean-admin-nestjs/backend/
```

**After**(W-FA3 落地、~3 行):
```bash
# 第一次：build nestjs image（cold ~3-5 min；NODE_VERSION 內建 22.11.0、tag 預設 latest;
# 細節 spec assumption A-002 + W-FA3 build script automation)
bash deploy/build-nestjs.sh
```

**Estimated LOC change**:減 6 行(去 inline build cmd)+ 加 3 行(script call + comment)= 淨減 ~3 行

**Note**:保留 NODE_VERSION reference comment(讓未來 fork upstream rebase 對齊 22.11.0 default 時、operator 仍知為何 build-arg override 存在);本身 script 內也有 reference comment(per E-1 structure)

---

## E-3:`docs/INTEGRATION-CHECKLIST.md` 改動

**Location**:`docs/INTEGRATION-CHECKLIST.md` 三段:

**1. Current Focus**(per spec FR-009):
```diff
- **Phase**:Phase W deploy P7 Track DESIGN-A 三件套(W-FA1 + W-FA2 ✅、剩 W-FA3)— DESIGN-A 路線 deploy chain 起點;application Phase 2 並行 F5.1 + F6 完成
+ **Phase**:Phase W deploy P7 Track DESIGN-A 三件套全完成(W-FA1 + W-FA2 + W-FA3 ✅)— DESIGN-A 路線 deploy 結構 wire-up 完整;application Phase 2 並行 F5.1 + F6 完成
- **Active feature**:無(W-FA2 全完成、merge `c5b7840` 已推 origin/rev1-admin-root)
+ **Active feature**:無(W-FA3 全完成、merge `<sha-pending>` 已推 origin/rev1-admin-root;Track DESIGN-A 三件套 deploy 結構收尾)
- **下一步**:F10 refresh-token-nestjs-bridge → W-FA3 cicd-nestjs-build-job;application 並行 F7 / F8 / F9 / W-F11 / W-F6b
+ **下一步**:F10 refresh-token-nestjs-bridge(application Phase 2 第三個 feature、nestjs sys_tokens prisma model 對齊 + Casbin pub-sub channel 訂閱);application 並行 F7 / F8 / F9 / W-F11 / W-F6b
```

**2. Phase W-7 deploy Roadmap 表 W-FA3 row**:
```diff
- | W-FA3 | `cicd-nestjs-build-job` | — | — | — | — | — | 未啟 |
+ | W-FA3 | `cicd-nestjs-build-job` | ✅ | ✅ | ✅ | ✅ | ✅ | **完成**(outer `<sha-pending>` + merge `<sha-pending>`、8/8 acceptance PASS)|
```

**3. 已完成里程碑**:加 W-FA3 條目(對齊 W-FA1 / W-FA2 / F6 風格、後 commit 完成填 SHA)

**Estimated LOC**:~10 行

---

## Entity Summary

| # | Entity | Location | Type | LOC 估計 | 改動類型 |
|---|---|---|---|---|---|
| E-1 | nestjs build script | `deploy/build-nestjs.sh` | bash shell script | ~28 行 | 新建 |
| E-2 | §5.2.1 inline cmd → script call | `CLAUDE.md` | markdown / bash code block | 淨減 ~3 行 | 改動 |
| E-3 | Phase W-7 row + Current Focus + 里程碑 | `docs/INTEGRATION-CHECKLIST.md` | markdown text | ~10 行 | 改動 |

**Total**:3 個 entity、~35 行 LOC 改動(對齊 plan.md NFR-001 SHOULD ≤ 30 行 script + ~10 行 doc = ~40 行 預估、輕度低估)。

**無 application code entity、無 DB schema entity、無 API endpoint entity**(W-FA3 純 shell script + doc layer)。

---

## Validation Rules

| Rule | 描述 | 對應 FR |
|---|---|---|
| V-1 | E-1 含 `#!/usr/bin/env bash` shebang + `set -euo pipefail` 首段 | FR-001 |
| V-2 | E-1 跑 docker build with `NODE_VERSION=22.11.0` build-arg + `-f ...Dockerfile` + `-t nestjs:rev1-admin-nestjs:${TAG}` + fork backend/ context | FR-002 |
| V-3 | E-1 支援 `--tag <name>` / `-t <name>` / `--help` / `-h` flag、`--tag` 缺值報 error + exit 非 0 | FR-003 / FR-010 / E-7 |
| V-4 | E-1 跑完印 image size feedback line(對齊 R-2 format) | FR-004 / NFR-003 |
| V-5 | E-1 chmod 755(executable、對齊 generate-dev-cert.sh) | FR-006 |
| V-6 | E-2 把 line 167-172 inline build cmd 換成 `bash deploy/build-nestjs.sh`、保 NODE_VERSION reference | FR-008 |
| V-7 | E-3 三段更新到位(Current Focus / Phase W-7 row / 已完成里程碑) | FR-009 |
| V-8 | 全 entity 改動為單段 outer commit | FR-007 |
| V-9 | 不引入 CI/CD platform 配置 | FR-011 |
| V-10 | 不引入 image registry push 命令 | FR-012 |
| V-11 | 不動 nestjs fork source / Dockerfile / .github/ | FR-013 / FR-014 |
| V-12 | 不改 docker-compose.yml / .dev.yml / .prod.yml | FR-015 |
| V-13 | 不引入 image size 優化 / multi-arch build | FR-016 |
| V-14 | 三邊 source(base-web / rust-api / nestjs fork)零改動 | FR-013 |
