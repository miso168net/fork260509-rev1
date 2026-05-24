# Quickstart: 047 sandbox-protect-route-fix

**Phase**：1（Design & Contracts）
**日期**：2026-05-25

Implementer 操作手冊 —— 2 US 落地步驟 + 多段式 commit + merge 順序。對齊 [`CLAUDE.md §3 / §4.1`](../../CLAUDE.md) feature 開發紀律。

---

## Step 0：前置確認

```bash
cd /mnt/d/AnewSpaces/x_Project/fork260509-rev1
git branch --show-current     # expect: 047-sandbox-protect-route-fix
(cd rust-api && git branch --show-current)   # expect: rev1-admin-rust-api
export PC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
$PC ps --format "{{.Service}}: {{.Status}}" | head -15
# expect: 12 service Up healthy
```

---

## Step 1：US1 + US2 production fix + unit test（單 commit 一體交付）

依 [`data-model.md §E1 / §E2 / §E3`](./data-model.md) 落地：

### 1.1 改 `rust-api/server/core/Cargo.toml`

per data-model §E2.1 加 `[dev-dependencies]` 段 1 行：

```toml
[dev-dependencies]
tower = { workspace = true, features = ["util"] }
```

### 1.2 改 `rust-api/server/core/src/sign/api_key_middleware.rs`

**use 段補**（per data-model §E1.3）：

```rust
use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderMap, HeaderValue, Response, StatusCode, Uri},
    middleware::Next,
    response::IntoResponse,
    Json,
};
```

**加 helper `unauthorized_response`**（per data-model §E1.1、放在既有 `validate_request` fn 之前 or 之後皆可）：

```rust
fn unauthorized_response(code: u16, msg: &str) -> Response<Body> {
    let mut resp = (
        StatusCode::UNAUTHORIZED,
        Json(Res::<()>::new_error(code, msg)),
    )
        .into_response();
    resp.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        HeaderValue::from_static("ApiKey"),
    );
    resp
}
```

**改 caller**（per data-model §E1.2、`api_key_middleware` fn 內 `match validate_request` 兩 error 分支）：

```rust
match validate_request(&validator, &req) {
    Ok(true) => next.run(req).await.into_response(),
    Ok(false) => unauthorized_response(
        code::CODE_PERMISSION_API_KEY_SIGNATURE_INVALID,
        "Invalid API key or signature",
    ),
    Err(e) => unauthorized_response(code::CODE_PERMISSION_API_KEY_MISSING, e),
}
```

### 1.3 加 8 個 unit test（同檔 `#[cfg(test)] mod tests`）

per data-model §E3.1（共用 helper）+ §E3.2（8 scenarios table）+ §E3.3 / §E3.4（樣本 source）。

關鍵紀律：
- 每 test 用 unique path（`/test-simple-missing` / `/test-simple-invalid` / ... / `/test-complex-invalid-ts`、共 8 個 path）
- Simple 4 test 用 `SimpleApiKeyValidator::new() + add_key("valid-key")` setup
- Complex 4 test 用 `ComplexApiKeyValidator::new(None) + add_key_secret(...)` + memory nonce store
- Complex valid signed case (test 7) 用 `test_api_key_sign` 既有 pattern build HMAC sig
- 共用 `parse_body_envelope(response)` helper 解 JSON

### 1.4 本機 cargo check verify

```bash
docker run --rm -v "$(pwd)/rust-api:/work" -v rev1-admin_cargo_cache:/usr/local/cargo/registry -w /work rust:1.86-slim-bookworm bash -c "cargo check -p server-core --tests 2>&1 | tail -20"
```

**Expected**：`Finished dev profile`、無 error / warning。

### 1.5 本機 cargo test verify（C-V2 預跑）

```bash
docker run --rm -v "$(pwd)/rust-api:/work" -v rev1-admin_cargo_cache:/usr/local/cargo/registry -w /work rust:1.86-slim-bookworm bash -c "cargo test -p server-core sign::api_key_middleware -- --nocapture 2>&1 | tail -20"
```

**Expected**：`test result: ok. 9 passed; 0 failed`（既有 1 + 本 feature 加 8）。

### 1.6 rust-api worktree commit 1（單 commit US1+US2）

```bash
cd rust-api
git status                    # expect modified server/core/Cargo.toml + server/core/src/sign/api_key_middleware.rs
git add server/core/Cargo.toml server/core/src/sign/api_key_middleware.rs
git commit -m "$(cat <<'EOF'
feat(rust-api): sandbox protect_route HTTP 401 + WWW-Authenticate + 8 unit test (047 US1+US2)

US1 production fix：api_key_middleware 兩 error 分支（missing 5003 / invalid 5004）
抽 helper unauthorized_response、用 (StatusCode::UNAUTHORIZED, Json(envelope))
tuple form 構造 + WWW-Authenticate: ApiKey header（RFC 7235/9110 標準合規）。
body envelope (code/msg/success/data) 完全保留、對既有 client 不破壞。
production fix 同時覆蓋 Simple validator 與 Complex validator 兩 path
（同一 match block、覆蓋 /sandbox/{simple,complex}-api-key 雙端點）。

US2 unit test：同檔 #[cfg(test)] mod tests 加 8 個 unit test（Simple 4 +
Complex 4、Q1 clarification 拍板雙覆蓋）：
  - simple_missing/invalid/valid/non-protected
  - complex_missing-field/invalid-signature/valid-signed/invalid-timestamp
test 用 tower::ServiceExt::oneshot 驅 minimal axum::Router + dummy handler、
每 test unique path 避免 PROTECTED_PATHS 靜態跨 test 污染。Complex valid case
用既有 test_api_key_sign 的 HMAC sig build pattern。

server-core dev-deps 加 tower = { workspace = true, features = ["util"] }
（per-crate change、非 workspace 新 dep）— tower::ServiceExt 在 tower::util
模組、workspace tower 預設 features=["log"] 不含 util、需顯式啟動。

A1 scope 拍板：jwt + casbin envelope adapter 不動（保留 F4 envelope flow +
base-web onBackendFail logout/refresh-token path）。0 base-web / 0 schema /
0 workspace dep（FR-005~007/010）。Constitution 5/5 PASS、0 amendment。

cargo test -p server-core sign::api_key_middleware PASS（8 new + 1 existing
= 9 tests）。結案 045-N1。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 1.7 push origin（**須 user 同意**、per CLAUDE.md §5）

```bash
git push origin rev1-admin-rust-api    # 須 user 同意
```

---

## Step 2：docker build + rust-api restart + C-V3 real-wire acceptance

```bash
cd ..
docker build -t rust-api:rev1-admin-rust-api ./rust-api 2>&1 | tail -10
# expect: 最後 "naming to docker.io/library/rust-api:rev1-admin-rust-api done"

$PC up -d --force-recreate --no-deps rust-api 2>&1 | tail -5
sleep 12
$PC ps --format "{{.Service}}: {{.Status}}" | grep rust-api
# expect: Up X seconds (healthy)
```

跑 [contracts/verification-commands.md C-V3](./contracts/verification-commands.md) 雙端點 8 case curl 驗證。

---

## Step 3：Outer feature branch 多段 commit（per CLAUDE.md §4.1）

### 3.1 outer commit 1：rust-api SHA pin bump

```bash
git status      # expect "modified: rust-api" (gitlink change)
RUST_API_SHA=$(cd rust-api && git rev-parse --short HEAD)
git add rust-api
git commit -m "$(cat <<EOF
chore(submodule): bump rust-api 到 ${RUST_API_SHA} — 047 US1+US2 sandbox protect_route HTTP 401

US1 api_key_middleware 兩 error 分支 HTTP 200 → HTTP 401 + WWW-Authenticate:
ApiKey header + body envelope 保留（RFC 7235/9110 合規、覆蓋 Simple+Complex
validator 兩 path、雙 sandbox endpoint 同步生效）。

US2 加 8 unit test（Simple 4 + Complex 4）+ server-core dev-deps tower util
feature。

cargo test PASS、docker build PASS、rust-api service restart healthy。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 3.2 outer commit 2：INTEGRATION-CHECKLIST cleanup + CLAUDE.md SPECKIT marker

per data-model §E4：
- 衍生 follow-up 移除 045-N1 row
- 已完成里程碑加 047 entry（SHA placeholder）
- Current Focus 「現狀」加 047 + 「下一步」改向 base-web TS id sprint
- CLAUDE.md SPECKIT marker idle

```bash
# 編 docs/INTEGRATION-CHECKLIST.md + CLAUDE.md SPECKIT marker
git add docs/INTEGRATION-CHECKLIST.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: 047 收尾 INTEGRATION-CHECKLIST + CLAUDE.md SPECKIT marker (047 Polish)

INTEGRATION-CHECKLIST.md：
  - 衍生 follow-up backlog 移除 045-N1 row（047 US1+US2 全清 sandbox
    /sandbox/{simple,complex}-api-key HTTP 401 + WWW-Authenticate +
    8 unit test 雙端點覆蓋）。
  - 已完成里程碑加 047 entry（outer/merge/rust-api SHA placeholder 留
    backfill）。
  - Current Focus 「現狀」更新含 047 + 「下一步」改向 base-web TS id
    型別債 cleanup sprint（user 2026-05-25 拍板的 5 階段順序第 3 段）。

CLAUDE.md SPECKIT marker：Active Spec / Active Plan idle、Phase idle、
下一步指向 base-web sprint。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 3.3 outer commit 3（optional）：implementer-stage expansion 拾取

若 user 確認後拾取 candidate (a)（per research R-6.1）：045 自家 `contracts/verification-commands.md` C-V5 inline comment 標示「post-047 PASS」（~1-3 line spec docs 改）。

否則跳過此 commit。

### 3.4 push origin（**須 user 同意**）

```bash
git push origin 047-sandbox-protect-route-fix    # 須 user 同意
```

---

## Step 4：merge 回 rev1-admin-root（**須 user 同意**、per CLAUDE.md §5）

```bash
git checkout rev1-admin-root
git pull --ff-only origin rev1-admin-root
git merge --no-ff 047-sandbox-protect-route-fix -m "Merge feature 047-sandbox-protect-route-fix"

# push rev1-admin-root 須 user 再次同意
git push origin rev1-admin-root
```

---

## Step 5：SHA backfill post-merge（**須 user 同意**）

```bash
# 拿 outer (feature branch last) / merge / rust-api SHA
OUTER_SHA=$(git log --first-parent rev1-admin-root --oneline | grep -m1 "047 收尾" | awk '{print $1}')
MERGE_SHA=$(git log --merges -1 --format=%h)
RUSTAPI_SHA=$(cd rust-api && git rev-parse --short HEAD)
echo "outer=$OUTER_SHA merge=$MERGE_SHA rust-api=$RUSTAPI_SHA"

# 編 docs/INTEGRATION-CHECKLIST.md 047 entry placeholder 換成真 SHA
# git add docs/INTEGRATION-CHECKLIST.md
# git commit -m "chore: backfill 047 milestone entry SHA (outer $OUTER_SHA + merge $MERGE_SHA + rust-api $RUSTAPI_SHA)"
# git push origin rev1-admin-root    # 須 user 同意
```

---

## Step 6：Acceptance final verification

跑 [contracts/verification-commands.md](./contracts/verification-commands.md) C-V1~C-V5 全 5 條：

| C-V | 內容 | PASS criterion |
|---|---|---|
| C-V1 | dev stack 12 service healthy + drainer | 12 service Up healthy + drainer log |
| C-V2 | cargo test 9 tests PASS | `test result: ok. 9 passed; 0 failed` |
| C-V3 | 雙端點 8 case curl | 8 case 全對應 (200/401) + header + body envelope |
| C-V4 | boundary verify | 0 base-web / 0 schema / 0 dep + jwt+casbin 0 改動 + Res 0 改動 |
| C-V5 | INTEGRATION-CHECKLIST cleanup | 045-N1 移除 + 047 entry + 下一步 base-web sprint |

C-V1~C-V5 全 PASS = 047 acceptance PASS、ready for `superpowers:executing-plans`（per CLAUDE.md §3）→ subagent-driven-development。

---

## 預估時間

| 階段 | 估時 |
|---|---|
| Step 1 (US1+US2 code + unit test + worktree commit) | ~45-60 min |
| Step 2 (docker build + restart + C-V3 wire test) | ~20-30 min |
| Step 3-4 (outer commits + merge + push 同意關卡) | ~20-30 min |
| Step 5-6 (SHA backfill + acceptance final) | ~10-15 min |
| **合計** | **~1.5-2.5 hr**（含 user 同意等待）|

---

## 紀律總結

- **0 base-web 改動**（FR-007）—— `git diff base-web/` 0 行
- **0 schema migration / 0 新 entity / 0 新 workspace dep**（FR-006）
- **jwt + casbin envelope adapter 不動**（FR-010）—— 保留 base-web `onBackendFail` flow
- **`Res<T>::IntoResponse` 不動**（FR-005）—— rev1 envelope contract 保留
- **`api_key_middleware` function signature 不變**（SC-004）—— 僅內部 error response 構造改
- **implementer-stage expansion ≤3**（FR-011）—— Phase 0 grep 拾取 candidate (a) 1 個、其餘拒
- **push / merge 須 user 同意**（per CLAUDE.md §5）
