# Contract: W-FA3 verification commands

**Feature**: W-FA3 — cicd-nestjs-build-job
**Contract type**: host bash / docker / git verification command set
**Date**: 2026-05-18

> 本契約定義 W-FA3 acceptance + zero-regression 階段跑的具體驗證命令。對齊 spec US1~US4 acceptance scenarios + SC-001~SC-007 + Edge Cases E-1~E-8。

---

## C-V1:Script syntax check(無 docker、快驗)

```bash
bash -n deploy/build-nestjs.sh
echo "exit: $?"
```

**預期**:exit 0(bash syntax OK)、無 stderr

**對應**:plan T1(pre-implement validation 階段、不需 docker)

---

## C-V2:Script `--help` 顯示 usage

```bash
bash deploy/build-nestjs.sh --help
echo "exit: $?"
```

**預期**:exit 0、stdout 含 5 行 usage(per C-S6)、stderr 空

**對應**:spec E-8 / FR-010

---

## C-V3:Script `--tag` 缺值 報 error

```bash
bash deploy/build-nestjs.sh --tag
echo "exit: $?"
```

**預期**:exit 1、stderr 含 `[W-FA3 ERROR] --tag requires a value`

**對應**:spec E-7 / FR-003 / C-S4

---

## C-V4:Cold build US1 P1 MVP

```bash
# Step 1:清掉現有 image
docker rmi nestjs:rev1-admin-nestjs 2>/dev/null || true

# Step 2:跑 script(cold ~3-5 min)
time bash deploy/build-nestjs.sh

# Step 3:驗 image 存在
docker images nestjs:rev1-admin-nestjs -q
docker images nestjs:rev1-admin-nestjs --format "{{.Repository}}:{{.Tag}} {{.Size}}"
```

**預期**:
- step 2 exit 0、stdout 最後 1 行符合 `[W-FA3] Built nestjs:rev1-admin-nestjs:latest (870MB)` pattern
- step 3 image SHA 非空、size ~870MB(對齊 W-FA1 baseline)

**對應**:US1.1 + US1.2 / SC-001 / FR-002 / FR-004

---

## C-V5:Idempotent / Docker cache hit

```bash
# 接 C-V4(image 已 build)
time bash deploy/build-nestjs.sh 2>&1 | tee /tmp/build-nestjs-run2.log
grep -c "CACHED" /tmp/build-nestjs-run2.log
```

**預期**:
- `real` time < 30s(per SC-003)
- `CACHED` keyword 多 step 命中(grep 結果 >= 5、視 Dockerfile layer 數)
- stdout 最後 1 行 image size feedback 仍對

**對應**:US2 / SC-003

---

## C-V6:Custom tag override

```bash
bash deploy/build-nestjs.sh --tag rev1-test 2>&1 | tail -3
docker images nestjs:rev1-admin-nestjs:rev1-test -q
docker images nestjs:rev1-admin-nestjs:latest -q
```

**預期**:
- script 跑 exit 0、最後 1 行符合 `[W-FA3] Built nestjs:rev1-admin-nestjs:rev1-test (<size>)`
- `rev1-test` tag image SHA 非空
- `latest` tag image SHA 仍是 C-V4 build 的版本(不被 `rev1-test` build 改寫;但 underlying image SHA 可能是 same content)

**對應**:US3 / SC-004 / FR-003 / C-S8

---

## C-V7:W-FA1 stack regression(after W-FA3 build)

```bash
# 用 W-FA3 build 出的 image 起 W-FA1 stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**預期**:
- 7 service healthy(對齊 W-FA1 baseline)
- 證 W-FA3 script build 的 image 與 W-FA1 quickstart Step 1 inline cmd 結果等義

**對應**:US1.3 / US4.2 / SC-002

---

## C-V8:W-FA2 refreshToken regression(after W-FA3 build)

```bash
# C-V7 stack 起後
curl -s -w "\n---HTTP %{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid-test-token"}' \
  http://127.0.0.1:11080/api/auth/refreshToken | head -c 400
```

**預期**:HTTP 4xx + nestjs envelope(對齊 W-FA2 落地、refreshToken endpoint 仍走通 nginx → nestjs;具體 status code 視 nestjs business logic、W-FA3 不負責、留 F10)

**對應**:US4.2 對 W-FA2 regression 驗

---

## C-V9:Three sides zero diff

```bash
git diff HEAD -- base-web/src/ rust-api/server/ rust-api/migration/ fork260509-soybean-admin-nestjs/ | wc -l
echo "(預期 0)"
```

**預期**:輸出 `0`(per FR-013 三邊零改動)

**對應**:US4.1 / SC-005

---

## C-V10:LOC ≤ 30(per NFR-001 / SC-007)

```bash
wc -l deploy/build-nestjs.sh
```

**預期**:行數 ≤ 30(對齊 `generate-dev-cert.sh` 簡潔風格)

**對應**:NFR-001 / SC-007

---

## C-V11:Doc grep verify

```bash
echo "=== W-FA3 references ==="
grep -cE "W-FA3|build-nestjs\.sh" CLAUDE.md docs/INTEGRATION-CHECKLIST.md
echo ""
echo "=== CLAUDE.md §5.2.1 內 inline build cmd 已替換 ==="
grep -A 2 "DESIGN-A 路線 dev" CLAUDE.md | head -10
echo ""
echo "=== INTEGRATION-CHECKLIST.md W-FA3 row ==="
grep "W-FA3" docs/INTEGRATION-CHECKLIST.md | head -5
```

**預期**:
- 至少 6 match(CLAUDE.md §5.2.1 內 `bash deploy/build-nestjs.sh` + INTEGRATION-CHECKLIST.md 4 段(Current Focus + Phase W-7 row + 已完成里程碑 + 可能 SPECKIT § 段))
- CLAUDE.md §5.2.1 內 inline build cmd 確實替換成 `bash deploy/build-nestjs.sh`
- INTEGRATION-CHECKLIST.md W-FA3 row 顯示「完成」狀態

**對應**:FR-008 / FR-009 / V-6 / V-7

---

## C-V12:Single-commit verify(per FR-007 + W-FA1 / W-FA2 慣例)

```bash
git log --oneline -1
git diff HEAD~1 HEAD --stat
```

**預期**:
- last commit 為 W-FA3 主要落地 commit(預期 `feat(deploy): W-FA3 加 nestjs image build script`)
- diff stat 顯示 4 個 outer file 改動(`deploy/build-nestjs.sh` 新建 + `CLAUDE.md` + `docs/INTEGRATION-CHECKLIST.md` + `.specify/feature.json` + spec docs)、無 worktree gitlink SHA 變動

**對應**:FR-007 / SC-006

---

## Contracts 數量

| Contract | 範疇 |
|---|---|
| C-V1 | Script syntax check(bash -n)|
| C-V2 | `--help` usage line |
| C-V3 | `--tag` missing value error |
| C-V4 | Cold build US1 P1 MVP |
| C-V5 | Idempotent / Docker cache hit |
| C-V6 | Custom tag override |
| C-V7 | W-FA1 stack regression(7 service healthy)|
| C-V8 | W-FA2 refreshToken regression |
| C-V9 | Three sides zero diff |
| C-V10 | LOC ≤ 30 |
| C-V11 | Doc grep verify |
| C-V12 | Single-commit verify |

**12 個 verification command、涵蓋 W-FA3 全部 acceptance scenario + SC + FR + regression 驗證**。
