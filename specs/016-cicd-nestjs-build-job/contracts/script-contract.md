# Contract: W-FA3 `deploy/build-nestjs.sh` CLI 契約

**Feature**: W-FA3 — cicd-nestjs-build-job
**Contract type**: shell script CLI interface
**Date**: 2026-05-18

> 本契約定義 `deploy/build-nestjs.sh` 的 operator-facing CLI:flag、exit code、stdout/stderr 行為。

---

## C-S1:Script invocation

**Invocation**:`bash deploy/build-nestjs.sh [FLAGS]`

**Workspace**:operator MUST 在 workspace root(`fork260509-rev1/`)跑、不在 fork repo 內(對齊 A-001)

**No env vars expected**(NODE_VERSION 為 script 內固定值、不從 env 讀)

---

## C-S2:Supported flags

| Flag | Long | Short | Value | Default | Effect |
|---|---|---|---|---|---|
| `--tag <name>` | `--tag` | `-t` | image tag string | `latest` | Override image tag(`nestjs:rev1-admin-nestjs:<name>`) |
| `--help` | `--help` | `-h` | (none) | — | 印 usage 到 stdout + exit 0 |

**Unknown flag**:script MUST 報 `[W-FA3 ERROR] unknown arg: <arg>` 到 stderr + 印 usage 到 stderr + exit 1(per FR-003 strict parsing)

**`--tag` missing value**:script MUST 報 `[W-FA3 ERROR] --tag requires a value` 到 stderr + exit 1(per FR-003 + E-7)

---

## C-S3:Stdout output format

**Build success**(per spec FR-004 + NFR-003 + R-2):

最後 1 行 stdout MUST 符合此 pattern:
```
[W-FA3] Built nestjs:rev1-admin-nestjs:<tag> (<size>)
```

範例:
```
[W-FA3] Built nestjs:rev1-admin-nestjs:latest (870MB)
[W-FA3] Built nestjs:rev1-admin-nestjs:rev1-test (870MB)
```

**Build process output**:docker build 自身 progress / layer 狀態 / `CACHED` keyword 等(per docker BuildKit 預設 output)— script 不過濾或重 format、直接 propagate

---

## C-S4:Stderr output format

**Error message pattern**:
```
[W-FA3 ERROR] <message>
```

範例:
```
[W-FA3 ERROR] --tag requires a value
[W-FA3 ERROR] unknown arg: --foo
```

**Build failure**:docker build 自身 stderr propagate(per A-001 + E-1/E-2/E-3、不主動防呆)、script `set -euo pipefail` 保 exit code propagate

---

## C-S5:Exit codes

| Code | Meaning | Source |
|---|---|---|
| 0 | Build succeeded、image 落地、size feedback 印出 | normal path |
| 0 | `--help` printed | usage exit |
| 1 | Argument parsing error(unknown flag / `--tag` missing value) | script self |
| non-0 | docker build failure / docker daemon down / fork dir missing / Dockerfile invalid | docker propagate via `set -e` |

**Note**:`set -e` 保證任何 command 失敗 propagate exit code、`set -u` 保未定義變數即 error、`set -o pipefail` 保 piped command failure propagate

---

## C-S6:Help output

**Trigger**:`--help` 或 `-h`

**Output**(對齊 R-3 + FR-010、stdout):
```
Usage: bash deploy/build-nestjs.sh [--tag <name>] [--help]
  --tag <name>, -t <name>   Image tag (default: latest)
  --help, -h                Show this help
Build context: fork260509-soybean-admin-nestjs/backend/
Image:         nestjs:rev1-admin-nestjs:<tag>
NODE_VERSION:  22.11.0 (built-in、per W-FA1 implement-time A-002)
```

**Exit code**:0(usage shown = 預期使用、非 error)

---

## C-S7:Side effects

**Produces**:
- docker image `nestjs:rev1-admin-nestjs:<tag>`(預設 `latest`、可被 `--tag` override)
- docker build layer cache(BuildKit 自動管理)

**Does NOT produce**:
- ❌ image push 到 registry(per FR-012)
- ❌ docker-compose service start / stop(W-FA3 純 build、不 deploy)
- ❌ 任何 file system 改動(除了 docker daemon 內部 storage)
- ❌ git operations(commit / push 都不做)

---

## C-S8:Idempotency

**第二次跑同樣 flag**:script MUST 重跑 docker build,docker BuildKit MUST 利用 layer cache、實際時間 < 30s(per SC-003、`CACHED` keyword propagate 到 stdout)

**Image SHA**:若 fork backend/ 內容無變、新 build 產出 image SHA 與第一次相同(BuildKit cache hit);`nestjs:rev1-admin-nestjs:latest` tag pointer 不變

**Tag override**:`--tag rev1-test` 跑後、`:rev1-test` tag 落地、`:latest` tag 不受影響(per SC-004、不主動 retag)

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-S1 | Script invocation conventions |
| C-S2 | Supported flags(--tag / --help)|
| C-S3 | Stdout output format(success 路徑 + image size feedback line)|
| C-S4 | Stderr output format(error pattern)|
| C-S5 | Exit codes(0 / 1 / non-0)|
| C-S6 | Help output format |
| C-S7 | Side effects(produces / not produces)|
| C-S8 | Idempotency(BuildKit cache + tag override 不影響 latest)|

**8 個 script contract、涵蓋 W-FA3 對 operator CLI 全部觸及點**。
