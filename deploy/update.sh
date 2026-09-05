#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env.server ]; then
  echo "✗ 缺少 .env.server"
  echo "  请执行：cp .env.server.example .env.server"
  echo "  然后设置一个足够长的 POSTGRES_PASSWORD。"
  exit 1
fi
if grep -q 'replace-with-a-long-random-password' .env.server; then
  echo "✗ .env.server 仍在使用示例密码，请先修改 POSTGRES_PASSWORD。"
  exit 1
fi

command -v docker >/dev/null || { echo "✗ 未安装 Docker"; exit 1; }
command -v node >/dev/null || { echo "✗ 未安装 Node.js"; exit 1; }
node -e "if(Number(process.versions.node.split('.')[0])<20){console.error('✗ 需要 Node.js 20+');process.exit(1)}"

echo "==> 拉取代码"
git pull --ff-only

echo "==> 构建前端"
npm ci --no-audit --no-fund
npm run build

echo "==> 更新 PostgreSQL 与 API"
docker compose --env-file .env.server up -d --build

echo "==> 检查服务"
docker compose --env-file .env.server ps
echo "✅ 更新完成"
