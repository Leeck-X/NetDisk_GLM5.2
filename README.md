# NetDisk · 自托管网盘系统

支持 PC 与移动端 Web 访问的私有网盘。毛玻璃（Glassmorphism）质感界面。

## 功能

- 用户体系：管理员 / 普通用户，JWT 鉴权，存储配额
- 文件管理：文件夹、网格/列表视图、拖拽分片上传、断点续传、秒传、批量下载、打包下载
- 文件操作：重命名、移动、复制、收藏、回收站恢复/彻底删除
- 文件分享：链接分享、提取码、有效期、下载次数限制
- 管理后台：用户管理、系统统计、存储配置
- 响应式：桌面三栏、平板两栏、手机单栏底部 Tab

## 技术栈

- 前端：React 18 + Vite + Tailwind CSS + Zustand + Framer Motion + lucide-react
- 后端：Node.js + Express + better-sqlite3 + multer + jsonwebtoken + bcryptjs + archiver
- 数据库：SQLite（单文件，零依赖）
- 部署：PM2 守护 + Windows 开机自启

## 目录结构

```
NetDisk/
├── api/              后端源码（Express 路由 + 服务）
├── src/              前端源码（React 页面 + 组件）
├── data/             SQLite 数据库与分片临时目录（运行时生成）
├── storage/          用户文件存储根目录（运行时生成）
├── dist/             前端构建产物（由 server 静态托管）
├── logs/             PM2 日志
├── ecosystem.config.cjs   PM2 配置
└── .env              环境变量（从 .env.example 复制创建）
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式（前后端热重载）

```bash
npm run dev
# 前端 http://localhost:5173（代理 /api 到 3001）
# 后端 http://localhost:3001
```

### 3. 生产构建与启动

```bash
npm run build          # 构建前端到 dist/
npm run server:prod    # 启动后端（托管 dist + API），默认端口 3000
```

访问 `http://localhost:3000`

### 4. PM2 守护（推荐生产部署）

```bash
npm install -g pm2 pm2-windows-startup
pm2 start ecosystem.config.cjs
pm2 save
pm2-startup install    # 注册开机自启
```

常用命令：

```bash
pm2 list              # 查看进程
pm2 logs webftp       # 查看日志
pm2 restart webftp    # 重启
pm2 stop webftp       # 停止
pm2 delete webftp     # 移除
```

## 默认账号

首次启动自动创建管理员：

- 账号：`admin`
- 密码：`admin123`

首次登录强制要求修改密码。重置密码：

```bash
npm run init:admin
```

## 配置

编辑 `.env`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `JWT_SECRET` | （需修改） | JWT 签名密钥 |

存储与数据目录默认在项目根目录下 `storage/` 与 `data/webftp.db`。

## 反向代理（可选 HTTPS）

可使用 IIS / Nginx 将 80/443 转发到 3000。示例 Nginx：

```nginx
server {
    listen 443 ssl;
    server_name your-domain;
    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    client_max_body_size 2g;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

## 备份

定期备份以下目录：

- `data/webftp.db`（数据库）
- `storage/`（用户文件）
