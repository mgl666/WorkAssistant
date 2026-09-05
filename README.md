# WorkAssistant

一个本地优先、支持多设备同步的个人工作助手，包含日历、待办事项、每日必做、番茄钟、备忘录和 AI 周报。

项目不依赖 Supabase，也不需要 Docker。前端在本地电脑构建并随 GitHub 仓库发布，VPS 只负责运行 Node.js API、PostgreSQL 和 Nginx，不需要在服务器上构建前端。

```text
浏览器访问 http://VPS-IP:190
  └─ Nginx :190
       ├─ /       → dist 静态前端
       └─ /api/   → 127.0.0.1:3100 Node.js API
                                  └─ 127.0.0.1:5432 PostgreSQL
```

## 一、本地构建并发布到 GitHub

本地电脑建议使用 Node.js 22 或更高版本：

```bash
git clone https://github.com/mgl666/WorkAssistant.git
cd WorkAssistant
npm ci
npm run build
git add dist
git commit -m "build: update production frontend"
git push origin main
```

`dist` 是可以直接由 Nginx 托管的静态文件，项目已将它纳入版本管理，以便 VPS 拉取后直接部署。

不要提交 `.env.server`、数据库密码或 `node_modules`。后端依赖仍需在 VPS 安装，因为依赖可能与操作系统平台有关。

## 二、VPS 安装必要软件

下面以 Ubuntu、部署目录 `/var/www/work-assistant` 为例：

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

检查版本：

```bash
node -v
npm -v
psql --version
nginx -v
```

VPS 不需要执行根目录的 `npm ci` 或 `npm run build`。

## 三、拉取项目

```bash
sudo mkdir -p /var/www/work-assistant
sudo chown -R "$USER":"$USER" /var/www/work-assistant
git clone https://github.com/mgl666/WorkAssistant.git /var/www/work-assistant
cd /var/www/work-assistant
```

如果项目已经位于 `/root/Project/WorkAssistant`，建议复制到 `/var/www`，避免 Nginx 无权访问 `/root`：

```bash
sudo mkdir -p /var/www/work-assistant
sudo cp -a /root/Project/WorkAssistant/. /var/www/work-assistant/
cd /var/www/work-assistant
```

确认仓库包含本地生成的前端：

```bash
test -f dist/index.html && echo "dist 已就绪"
```

## 四、创建 PostgreSQL 数据库

```bash
sudo -u postgres createuser --pwprompt work_assistant
sudo -u postgres createdb --owner=work_assistant work_assistant
psql -h 127.0.0.1 -U work_assistant -d work_assistant -c 'select now();'
```

API 第一次启动时会自动执行 `server/schema.sql`，无需手动导入 SQL。数据库 5432 端口不要开放到公网。

## 五、配置并启动 API

```bash
cd /var/www/work-assistant
cp .env.server.example .env.server
nano .env.server
```

配置内容：

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=work_assistant
PGUSER=work_assistant
PGPASSWORD=这里填写数据库密码
PORT=3100
HOST=127.0.0.1
COOKIE_SECURE=false
SESSION_DAYS=30
```

通过普通 HTTP 的 190 端口访问时，`COOKIE_SECURE` 必须为 `false`；以后启用 HTTPS 后再改成 `true`。

安装后端依赖并启动服务：

```bash
sudo chown root:www-data .env.server
sudo chmod 640 .env.server
npm --prefix server ci --omit=dev
sudo cp deploy/work-assistant-api.service /etc/systemd/system/work-assistant-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now work-assistant-api
curl http://127.0.0.1:3100/api/health
```

正常应返回 `{"ok":true}`。如果失败：

```bash
sudo journalctl -u work-assistant-api -n 100 --no-pager
```

## 六、配置 Nginx 190 端口

已有的 180 端口网站不需要修改。为 WorkAssistant 新增独立配置：

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/work-assistant
sudo ln -s /etc/nginx/sites-available/work-assistant /etc/nginx/sites-enabled/work-assistant
sudo nginx -t
sudo systemctl reload nginx
```

配置默认使用：

- 网站地址：`http://VPS公网IP:190`
- 静态目录：`/var/www/work-assistant/dist`
- API：`127.0.0.1:3100`
- PostgreSQL：`127.0.0.1:5432`

如果启用了 UFW：

```bash
sudo ufw allow 190/tcp
sudo ufw status
```

云服务器控制台如果有安全组，也需要允许 TCP 190。不要开放 3100 和 5432。

## 七、日常更新

先在本地电脑构建并推送：

```bash
npm ci
npm run build
git add dist
git commit -m "build: update production frontend"
git push origin main
```

然后在 VPS 执行：

```bash
cd /var/www/work-assistant
bash deploy/update.sh
```

更新脚本只会拉取已经构建好的 `dist`、安装 API 生产依赖并重启 API，不会在 VPS 构建前端，也不会删除 PostgreSQL 数据。

## 数据库备份

```bash
sudo mkdir -p /var/backups/work-assistant
sudo chown postgres:postgres /var/backups/work-assistant
sudo -u postgres sh -c \
  'pg_dump -Fc work_assistant > "/var/backups/work-assistant/work-assistant-$(date +%F-%H%M).dump"'
```

只保留最近 30 天：

```bash
sudo find /var/backups/work-assistant -type f -name '*.dump' -mtime +30 -delete
```

## 从旧 Supabase 版本迁移

1. 在旧版本“设置 → 数据管理”导出 JSON 备份。
2. 在 VPS 版本注册并登录账号。
3. 导入备份，选择“合并到现有数据”。
4. 点击“立即同步”，再到其他设备登录检查数据。
