# WorkAssistant

一个本地优先、支持多设备同步的个人工作助手，包含日历、待办事项、每日必做、番茄钟、备忘录和 AI 周报。

项目不依赖 Supabase，也不需要 Docker。前端、API 和 PostgreSQL 都部署在自己的 VPS 上：

```text
浏览器
  └─ HTTPS / 域名
       └─ Nginx
            ├─ /       → dist 静态前端
            └─ /api/   → 127.0.0.1:3001 Node.js API
                                      └─ 127.0.0.1:5432 PostgreSQL
```

公网只开放 80/443。API 和数据库仅监听 VPS 本机，不会与 Nginx 已托管的其他网站抢端口。

## VPS 要求

- Ubuntu 22.04/24.04 或类似 Linux
- 建议至少 1 核 CPU、1 GB 内存、10 GB 可用磁盘
- Node.js 20 或更高版本
- PostgreSQL 14 或更高版本
- Nginx
- 一个已解析到 VPS 的域名

下面以 Ubuntu、域名 `your-domain.com` 和目录 `/var/www/work-assistant` 为例。

## 一、安装软件

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib certbot python3-certbot-nginx curl
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

## 二、拉取项目

```bash
sudo mkdir -p /var/www/work-assistant
sudo chown -R "$USER":"$USER" /var/www/work-assistant
git clone https://github.com/mgl666/WorkAssistant.git /var/www/work-assistant
cd /var/www/work-assistant
```

## 三、创建 PostgreSQL 数据库

创建数据库用户。命令会提示输入两次密码，请使用长随机密码并保存好：

```bash
sudo -u postgres createuser --pwprompt work_assistant
sudo -u postgres createdb --owner=work_assistant work_assistant
```

确认可以连接：

```bash
psql -h 127.0.0.1 -U work_assistant -d work_assistant -c 'select now();'
```

这里输入刚才设置的密码。无需手动导入 SQL，API 第一次启动时会自动执行 `server/schema.sql` 创建数据表。

请确认 PostgreSQL 没有对公网开放 5432。Ubuntu 默认通常只监听本机，可用下面的命令检查：

```bash
sudo ss -lntp | grep 5432
```

## 四、配置 API 环境变量

```bash
cd /var/www/work-assistant
cp .env.server.example .env.server
nano .env.server
```

配置示例：

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=work_assistant
PGUSER=work_assistant
PGPASSWORD=这里填写刚才设置的数据库密码
PORT=3001
HOST=127.0.0.1
COOKIE_SECURE=true
SESSION_DAYS=30
```

保护配置文件，避免其他系统用户读取密码：

```bash
sudo chown root:www-data .env.server
sudo chmod 640 .env.server
```

`.env.server` 已加入 `.gitignore`，不要提交到 GitHub。

## 五、安装依赖并构建

前端与 API 使用独立依赖：

```bash
cd /var/www/work-assistant
npm ci
npm --prefix server ci --omit=dev
npm run build
```

构建结果位于 `/var/www/work-assistant/dist`。

## 六、使用 systemd 启动 API

复制服务文件：

```bash
sudo cp deploy/work-assistant-api.service /etc/systemd/system/work-assistant-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now work-assistant-api
sudo systemctl status work-assistant-api
```

检查 API：

```bash
curl http://127.0.0.1:3001/api/health
```

正常应返回：

```json
{"ok":true}
```

如果启动失败，查看日志：

```bash
sudo journalctl -u work-assistant-api -n 100 --no-pager
```

API 只需要监听 `127.0.0.1:3001` 的 Nginx 反向代理入口，不要在防火墙中开放 3001。

## 七、配置 Nginx

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/work-assistant
sudo nano /etc/nginx/sites-available/work-assistant
sudo ln -s /etc/nginx/sites-available/work-assistant /etc/nginx/sites-enabled/work-assistant
```

修改配置：

- 把 `your-domain.com` 换成真实域名。
- 确认 `root` 是 `/var/www/work-assistant/dist`。
- 保留 `/api/` 到 `127.0.0.1:3001` 的反向代理。

如果 Nginx 已经托管其他网站，不要删除原网站配置。多个网站可以共同监听 80/443，由不同的 `server_name` 区分。

启用配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 八、配置 HTTPS

```bash
sudo certbot --nginx -d your-domain.com
sudo nginx -t
sudo systemctl reload nginx
```

访问 `https://your-domain.com`，进入“设置”注册账号。注册时，当前浏览器的访客数据会上传到 VPS。

## 从旧 Supabase 版本迁移

新旧数据库结构不同，无法直接读取 Supabase 数据。推荐这样迁移：

1. 在旧版本“设置 → 数据管理”中导出 JSON 备份。
2. 部署新版本并注册 VPS 账号。
3. 在新版本导入备份，选择“合并到现有数据”。
4. 点击“立即同步”。
5. 在另一台设备登录检查数据，确认无误后再停用 Supabase。

即使浏览器本地缓存仍在，也建议先导出备份。

## 日常更新

```bash
cd /var/www/work-assistant
bash deploy/update.sh
sudo systemctl reload nginx
```

更新脚本会：

1. 从 GitHub 拉取最新代码。
2. 安装前端和 API 依赖。
3. 重新构建前端。
4. 重启并检查 API 服务。

更新不会删除 PostgreSQL 数据。

## 数据库备份

建议每天自动备份。手动备份：

```bash
sudo mkdir -p /var/backups/work-assistant
sudo chown postgres:postgres /var/backups/work-assistant
sudo -u postgres sh -c \
  'pg_dump -Fc work_assistant > "/var/backups/work-assistant/work-assistant-$(date +%F-%H%M).dump"'
```

只保留最近 30 天备份：

```bash
sudo find /var/backups/work-assistant -type f -name '*.dump' -mtime +30 -delete
```

可以将以上命令加入 root 的 `crontab`。

## 数据库恢复

恢复会覆盖现有内容，操作前请先再做一次备份：

```bash
sudo systemctl stop work-assistant-api
sudo -u postgres pg_restore \
  --clean --if-exists --no-owner \
  -d work_assistant \
  /var/backups/work-assistant/work-assistant-YYYY-MM-DD-HHMM.dump
sudo systemctl start work-assistant-api
```

## 防火墙

只开放 SSH、HTTP 和 HTTPS：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

不要开放端口 3001 和 5432。

## 本地开发

安装依赖：

```bash
npm ci
npm --prefix server ci
```

本地需要可用的 PostgreSQL，并复制配置：

```bash
cp .env.server.example .env.server
```

将 `.env.server` 中的 `COOKIE_SECURE` 改为 `false`，加载环境变量后启动 API：

```bash
set -a
source .env.server
set +a
npm --prefix server start
```

另开终端启动前端：

```bash
npm run dev
```

Vite 会把 `/api` 代理到 `127.0.0.1:3001`。

## 常用维护命令

```bash
sudo systemctl status work-assistant-api
sudo systemctl restart work-assistant-api
sudo journalctl -u work-assistant-api -f
sudo systemctl status postgresql
sudo -u postgres psql -d work_assistant
npm run typecheck
npm run build
```

用户密码使用 Node.js `scrypt` 哈希保存。登录凭证使用 `HttpOnly`、`SameSite=Strict` Cookie，前端 JavaScript 无法读取会话令牌。AI API Key 仍只保存在当前浏览器，不上传到 VPS。
