# WorkAssistant

一个本地优先、支持多设备同步的个人工作助手，包含日历、待办事项、每日必做、番茄钟、备忘录和 AI 周报。

当前版本不再依赖 Supabase。网站前端由 Nginx 提供，账号 API 和 PostgreSQL 数据库运行在自己的 VPS 上。

## 部署结构

```text
浏览器
  └─ HTTPS / 域名
       └─ Nginx
            ├─ /       → dist 静态前端
            └─ /api/   → 127.0.0.1:3001 自托管 API
                              └─ Docker 内部 PostgreSQL
```

PostgreSQL 没有映射公网端口，API 也只监听 VPS 的 `127.0.0.1:3001`，公网只开放 Nginx 的 80/443。

## VPS 配置要求

- Ubuntu 22.04/24.04 或类似 Linux
- 建议至少 1 核 CPU、1 GB 内存、10 GB 可用磁盘
- Node.js 20 或更高版本
- Docker Engine 与 Docker Compose Plugin
- Nginx
- 一个已解析到 VPS 的域名

## 首次部署

以下命令以 Ubuntu 和目录 `/var/www/work-assistant` 为例。

### 1. 安装基础软件

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

执行 `usermod` 后重新登录 SSH，使 Docker 用户组生效。

### 2. 拉取项目

```bash
sudo mkdir -p /var/www/work-assistant
sudo chown -R "$USER":"$USER" /var/www/work-assistant
git clone https://github.com/mgl666/WorkAssistant.git /var/www/work-assistant
cd /var/www/work-assistant
```

### 3. 配置数据库密码

```bash
cp .env.server.example .env.server
nano .env.server
```

必须把 `POSTGRES_PASSWORD` 改成长随机密码。例如可生成一个：

```bash
openssl rand -base64 36
```

`.env.server` 已被 Git 忽略，不要上传或发送给别人。正式 HTTPS 部署保持 `COOKIE_SECURE=true`。

### 4. 构建前端并启动 API、数据库

```bash
npm ci
npm run build
docker compose --env-file .env.server up -d --build
docker compose --env-file .env.server ps
curl http://127.0.0.1:3001/api/health
```

最后一个命令应返回：

```json
{"ok":true}
```

数据库表会在 API 第一次启动时自动创建。

### 5. 配置 Nginx

复制示例配置并替换域名：

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/work-assistant
sudo nano /etc/nginx/sites-available/work-assistant
sudo ln -s /etc/nginx/sites-available/work-assistant /etc/nginx/sites-enabled/work-assistant
```

至少修改以下两项：

- 把所有 `your-domain.com` 改为真实域名。
- 确认 `root` 为 `/var/www/work-assistant/dist`。

如果 Nginx 已托管其他网站，不会抢占端口。每个网站使用不同 `server_name`，共同监听 80/443；不要删除原网站配置。

先启用 HTTP 配置，再让 Certbot 自动添加 HTTPS：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

访问 `https://your-domain.com`，进入“设置”注册账号。注册时当前浏览器中的访客数据会上传到 VPS。

## 从旧 Supabase 版本迁移

新旧后端结构不同，不会自动读取 Supabase 数据。升级前建议：

1. 在旧版本“设置 → 数据管理”中导出 JSON 备份。
2. 部署新版本并注册 VPS 账号。
3. 在新版本中导入备份，选择“合并到现有数据”。
4. 点击“立即同步”，确认其他设备能看到数据后再停用 Supabase。

如果域名和浏览器没有变化，本地缓存通常仍在，但仍建议先导出备份。

## 日常更新

在项目目录运行：

```bash
bash deploy/update.sh
sudo systemctl reload nginx
```

脚本会拉取 GitHub 最新代码、重新构建前端，并重建 API 容器。PostgreSQL 使用 Docker volume，更新代码不会删除数据。

## 数据库备份与恢复

创建备份：

```bash
cd /var/www/work-assistant
docker compose --env-file .env.server exec -T db \
  pg_dump -U work_assistant -d work_assistant -Fc > "work-assistant-$(date +%F).dump"
```

恢复前先停止 API，避免恢复过程中继续写入：

```bash
docker compose --env-file .env.server stop api
docker compose --env-file .env.server exec -T db \
  pg_restore -U work_assistant -d work_assistant --clean --if-exists < work-assistant-YYYY-MM-DD.dump
docker compose --env-file .env.server start api
```

如果修改了 `.env.server` 中的数据库用户名或数据库名，请同步替换命令参数。

## 防火墙建议

只开放 SSH、HTTP 和 HTTPS，不要开放 3001 或 5432：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 本地开发

前端：

```bash
npm ci
npm run dev
```

如需同时测试登录和同步，将 `.env.server.example` 复制为 `.env.server`，把 `COOKIE_SECURE` 临时改为 `false`，然后启动后端：

```bash
docker compose --env-file .env.server up -d --build
```

Vite 已把 `/api` 代理到本机 3001 端口，启动容器后即可直接测试登录与同步；正式 VPS 部署由 Nginx 完成代理。

## 常用检查

```bash
npm run typecheck
npm run build
docker compose --env-file .env.server logs -f api
docker compose --env-file .env.server logs -f db
```

用户密码使用 Node.js `scrypt` 哈希保存；登录凭证使用 `HttpOnly`、`SameSite=Strict` Cookie，前端 JavaScript 无法读取会话令牌。AI API Key 仍只保存在当前浏览器，不上传到 VPS。
