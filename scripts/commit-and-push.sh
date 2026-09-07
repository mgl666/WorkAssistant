#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ "$#" -eq 0 ] || [ -z "${1//[[:space:]]/}" ]; then
  echo "用法：./scripts/commit-and-push.sh \"提交说明\""
  echo "示例：./scripts/commit-and-push.sh \"feat: improve calendar\""
  exit 1
fi

command -v git >/dev/null || { echo "✗ 未安装 Git"; exit 1; }
command -v npm >/dev/null || { echo "✗ 未安装 npm"; exit 1; }

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "✗ 当前不在一个 Git 分支上"
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "✗ 没有配置 origin 远程仓库"
  exit 1
fi

echo "==> 构建生产版前端"
npm run build

echo "==> 暂存项目改动"
git add -A

# 示例配置可以提交，真实环境文件和密码文件不可以提交。
sensitive_files="$(git diff --cached --name-only | grep -E '(^|/)\.env$|(^|/)\.env\.server$|(^|/)\.env\.production$' || true)"
if [ -n "$sensitive_files" ]; then
  echo "✗ 发现可能包含密码的文件，已停止提交："
  echo "$sensitive_files"
  echo "请先将这些文件取消暂存并加入 .gitignore。"
  exit 1
fi

if git diff --cached --quiet; then
  echo "✓ 没有需要提交的改动"
  exit 0
fi

echo "==> 创建提交"
git commit -m "$1"

echo "==> 推送到 origin/$branch"
git push origin "$branch"

echo "✅ 提交并推送完成"
