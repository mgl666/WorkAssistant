#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env.server ]; then
  echo "✗ 缺少 .env.server，请先按 README 完成 VPS 配置。"
  exit 1
fi
if sudo grep -q 'replace-with-your-postgresql-password' .env.server; then
  echo "✗ .env.server 仍在使用示例数据库密码。"
  exit 1
fi

command -v node >/dev/null || { echo "✗ 未安装 Node.js"; exit 1; }
node -e "if(Number(process.versions.node.split('.')[0])<20){console.error('✗ 需要 Node.js 20+');process.exit(1)}"

echo "==> 拉取代码"
git pull --ff-only

echo "==> 安装依赖并构建前端"
npm ci --no-audit --no-fund
npm --prefix server ci --omit=dev --no-audit --no-fund
npm run build

echo "==> 重启 API"
sudo install -m 644 deploy/work-assistant-api.service /etc/systemd/system/work-assistant-api.service
sudo systemctl daemon-reload
sudo systemctl restart work-assistant-api
sudo systemctl --no-pager --full status work-assistant-api

echo "==> 健康检查"
curl --fail --silent --show-error http://127.0.0.1:3001/api/health
echo
echo "✅ 更新完成"
