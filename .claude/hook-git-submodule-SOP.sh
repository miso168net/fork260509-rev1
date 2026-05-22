#!/usr/bin/env bash
# Claude Code SessionStart hook — 自動執行 CLAUDE.md §4.3 + §6 進度追蹤 SOP
# stdout 會被 Claude Code harness 以 additional context 注入到 session 第一輪
# 修改本檔不需重啟 CLI，下次新 session 就生效

set -u

cd "$(dirname "$0")/.."

echo "=== git status ==="
git status

echo
echo "=== git submodule status ==="
echo "(行首空格 = clean / + = SHA 不一致 / - = 未 init)"
git submodule status

echo
echo "=== worktree .git（應為檔案 = worktree 模式正確）==="
ls -la base-web/.git rust-api/.git 2>&1

echo
echo "=== 最近 5 個外層 commit ==="
git log --oneline -5

echo
echo
echo "=== docs/INTEGRATION-CHECKLIST.md（整合進度單一真相）==="
# 重構後全檔精簡（~150 行）、Follow-up Backlog 升為第 2 節須每 session 可見 —— 全檔注入
cat docs/INTEGRATION-CHECKLIST.md
