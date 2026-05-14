#!/usr/bin/env bash
# Claude Code SessionStart hook — 自動執行 CLAUDE.md §6.4 + §8 進度追蹤 SOP
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
echo "=== docs/INTEGRATION-CHECKLIST.md（進度追蹤 + brainstorming 決策快照）==="
# 只 cat 到 backlog 之前的高價值 head section（Current Focus + 已完成 + Roadmap + 決策快照）
# 避免 Deferred backlog / 維護指引等冗長 section 灌爆 session context
sed -n '1,/^## Deferred/p' docs/INTEGRATION-CHECKLIST.md | sed '$d'
