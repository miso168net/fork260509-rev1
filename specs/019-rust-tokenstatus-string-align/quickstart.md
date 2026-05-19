# Quickstart: F10.2 — rust-tokenstatus-string-align

**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-19

從 0 到 F10.2 acceptance PASS 的 5 個 step,適合單人從 spec.md / plan.md / data-model.md 讀完後動手。

執行環境:host bash(outer cwd `/mnt/d/AnewSpaces/x_Project/fork260509-rev1/`)、Linux WSL2 / macOS、Docker Desktop running。

---

## Step 1: Prerequisites verify(~1 min)

確認 F10/F10.1 已 merge + stack 可起 + Soybean user 在 DB。

```bash
echo "=== A-001 + A-002 check: F10 + F10.1 在 main branch ==="
git -C /mnt/d/AnewSpaces/x_Project/fork260509-rev1 log --oneline | grep -E "F10 完成|F10\.1" | head -3
# 預期: F10 merge 8f0e84c + F10.1 merge 48b70e6 在 history

echo ""
echo "=== A-003 check: W-FA1 + W-FA2 + W-FA3 image / config 就位 ==="
docker images nestjs:rev1-admin-nestjs -q
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a config 2>&1 | tail -3
# 預期: nestjs image SHA 非空 + compose config 無 error

echo ""
echo "=== R-6 + A-011 check: 舊 sys_tokens row 不阻塞 acceptance ==="
# 啟 stack 才能驗;若還沒起、跳到 Step 3 後再回來確認
# 啟後跑: docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
#   -c "SELECT COUNT(*) FROM sys_tokens WHERE username='Soybean'"
# 預期數量 ≥ 0(F10.1 acceptance 已留若干 row、C-V5 LIMIT 2 取最新 2、舊 row 不干擾)
```

**Pass criteria**: F10 + F10.1 merge 在 history + nestjs image 存在 + compose config 無 error。

**Failure handling**: F10 / F10.1 未 merge → 補跑;nestjs image 缺 → `bash deploy/build-nestjs.sh`;compose config error → 檢 W-FA1 / W-FA2 spec + diff。

---

## Step 2: Rebuild rust-api image with F10.2 patches(~5-7 min cold / ~2-3 min warm)

實作 F10.2 enum 改動(per data-model.md E1)→ rebuild rust-api image。

```bash
# 改檔: rust-api/server/constant/src/definition/consts.rs (per data-model.md E1)
# - serialize_all: SCREAMING_SNAKE_CASE → snake_case
# - Active +#[strum(serialize = "unused")]
# - Refreshed +#[strum(serialize = "used")]
# - Revoked 不動
# - 加 #[cfg(test)] mod tests with 1 fn 3 forward + 3 reverse assert

# Verify 改動 stat:
(cd rust-api && git diff HEAD --stat)
# 預期: 1 file (consts.rs) ~18 LOC

# Rebuild image:
DOCKER_BUILDKIT=1 docker build -t rust-api:rev1-admin-rust-api ./rust-api/ 2>&1 | tail -3
# 預期 cold ~5-7 min / warm ~2-3 min(per NFR-005)
```

**Pass criteria**: docker build exit 0 + image 重 tag `rust-api:rev1-admin-rust-api`。

**Failure handling**: cargo compile error → 檢 strum derive syntax + Cargo.toml `strum_macros` 版本(F10.2 假設 0.x、不引入新 dep)。

---

## Step 3: Restart W-FA1 stack with new rust-api image(~1 min)

force-recreate rust-api container 載入新 image、其他 service 不動。

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile track-a up -d --wait --force-recreate rust-api 2>&1 | tail -10
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Pass criteria**: rust-api 重啟 healthy + 其他 5 service 仍 healthy + migration init container exited 0。

**Failure handling**: rust-api restart loop → 檢 docker compose logs rust-api(可能 strum derive expand panic 或 secret_loader 退化、F10.2 不應觸)。

---

## Step 4: 跑 C-V1 ~ C-V7 acceptance(~3-5 min)

依 contracts/verification-commands.md 順序跑 7 個 verification。

```bash
# C-V1 (unit test、~3 min cold compile + ~30s test):
mkdir -p /tmp/cargo-cache-rev1/{registry,git}
docker run --rm \
  -v /mnt/d/AnewSpaces/x_Project/fork260509-rev1/rust-api:/work \
  -v /tmp/cargo-cache-rev1/registry:/usr/local/cargo/registry \
  -v /tmp/cargo-cache-rev1/git:/usr/local/cargo/git \
  -w /work rust:1.86-slim-bookworm \
  bash -c "apt-get update -qq && apt-get install -y --no-install-recommends pkg-config libssl-dev git >/dev/null 2>&1 && cargo test -p server-constant test_token_status_serialize_aligns_with_nestjs -- --nocapture 2>&1 | tail -15"

# C-V2 + C-V3 一氣跑 (login → refreshToken):
LOGIN_RESPONSE=$(curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"identifier":"Soybean","password":"123456"}' http://127.0.0.1:11080/api/auth/login)
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['refreshToken'])")
echo "C-V2: refresh_token length=${#REFRESH_TOKEN}, dots=$(echo -n $REFRESH_TOKEN | tr -dc . | wc -c)"
echo "---"
echo "C-V3: refreshToken HTTP test"
curl -s -w "\n---HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" http://127.0.0.1:11080/api/auth/refreshToken | head -c 800

# C-V4 (nestjs log grep):
echo "C-V4 R-7+R-8 evidence count (應 0):"
docker compose logs nestjs --tail=200 2>&1 | grep -cE "Token has already been used|JsonWebTokenError|jwt malformed"

# C-V5 (psql sys_tokens):
docker compose exec -T postgres psql -h 127.0.0.1 -p 5432 -U soybean -d soybean_admin_rust \
  -c "SELECT status, char_length(refresh_token) AS rt_len, to_char(created_at,'HH24:MI:SS') AS created FROM sys_tokens WHERE username='Soybean' ORDER BY created_at DESC LIMIT 2"

# C-V6 (nestjs PID 1 env secret 對齊):
docker compose exec nestjs sh -c "cat /proc/1/environ | tr '\0' '\n' | grep -E 'JWT_SECRET|REFRESH_TOKEN_SECRET'"

# C-V7a (three-side scope):
git diff HEAD -- base-web/src/ | wc -l                                       # 預期 0
git diff HEAD -- fork260509-soybean-admin-nestjs/ 2>&1 | wc -l               # 預期 0
(cd rust-api && git diff HEAD --stat)                                         # 預期 1 file consts.rs

# C-V7b (W-FA1 stack regression):
docker compose ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
```

**Pass criteria**: 7/7 PASS、預期值見 contracts/verification-commands.md。

**Failure handling**: 見 contracts/verification-commands.md 各 C-V failure handling 段。

---

## Step 5: 紀錄 F10.2 完成里程碑 + 故障排查(~3 min)

### 完成標誌

- ✅ C-V1 unit test 1/1 PASS(3 forward + 3 reverse)
- ✅ C-V2 + C-V3 + C-V4 R-7 修確認:HTTP 200 + 新 token pair + nestjs log no error
- ✅ C-V5 DB state transition:最新 row `status='unused'` + 次新 `status='used'`
- ✅ C-V6 F10.1 secret 對齊 regression PASS
- ✅ C-V7a + C-V7b zero-regression PASS
- ✅ Total 7/7 acceptance + 1 unit test(對應 spec NFR-004)

### Application Phase 4 收尾紀錄

F10 wire-up + F10.1 R-8 修 + F10.2 R-7 修 = **Application Phase 4 整套完成**:
- refreshToken end-to-end pass(login → refreshToken HTTP 200 + 新 token pair + DB state transition 對齊)
- base-web + nestjs fork **三邊零改動**(rust-only 收尾改動)
- 解鎖 **F11**(extracted stubs)、**F13**(rust-refresh-token-impl,DESIGN-B 階段 rust 自驗)、**F14**(DESIGN-A→B cutover)

### 故障排查段

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| C-V1 unit test fail | strum derive 對 per-variant override 行為與預期不符(R-1) | 改 Option B 全 per-variant override(`Revoked` 也加 `#[strum(serialize = "revoked")]`)或加 `to_string` attribute 雙重 |
| Step 2 cargo compile error | strum_macros 版本不相容 / `serialize_all = "snake_case"` 拼字錯 | 檢 Cargo.toml strum_macros 版本 + cargo build 完整 log |
| Step 3 rust-api restart loop | secret_loader / config 退化 / enum derive expand panic | docker compose logs rust-api 查 root cause |
| C-V3 HTTP 500 with "Token has already been used" | F10.2 enum 改未生效(image 未 rebuild / container 未 recreate) | 檢 `docker images rust-api` 新 SHA + force-recreate |
| C-V3 HTTP 500 with "jwt malformed" | F10.1 R-8 退化(image rebuild 過程 enum 改連帶觸 jwt.rs / config 退化) | 不應發生、abort F10.2 + 檢 F10.1 source |
| C-V5 最新 row status='ACTIVE' | F10.2 enum 改未生效、同上 C-V3 HTTP 500 模式 | 同 |
| C-V5 只有 1 row | C-V2 完成 + C-V3 未跑 / 沒成 | 重跑 C-V2 + C-V3 順序 |
| C-V6 nestjs env 為空 | nestjs entrypoint 失效、F10.1 部署退化 | abort F10.2 + 檢 F10.1 + W-FA1 |
| C-V7a rust-api scope > 1 file | 意外改其他 file(R-2 reverse case) | 檢 git diff、stash 或 abort |

---

## 完成標誌

完成 5 step 後:
- F10.2 acceptance 7/7 PASS
- ready for Phase 8 兩段式 commit(per CLAUDE.md §6.1)
  - Stage 1: rust-api worktree `consts.rs` 1 commit
  - Stage 2: outer commit on 019 feature branch(spec docs + INTEGRATION-CHECKLIST.md + CLAUDE.md SOP marker + .specify/feature.json + rust-api SHA pin)
  - Stage 3: push wait + merge --no-ff + SHA fill follow-up
