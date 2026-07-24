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
- 服务管理：node-windows 注册为 Windows 系统服务（原生开机自启）
- 管理面板：C# WPF (.NET 8) 单文件 exe（WebFtpManager.exe）

## 目录结构

```
WebFtp/
├── api/              后端源码（Express 路由 + 服务 + 统计/日志）
├── src/              前端源码（React 页面 + 组件）
├── service/          Windows 服务管理脚本（node-windows）
│   └── manage.mjs    安装/卸载/启停/状态
├── WebFtpManager/    C# WPF 管理面板源码
├── data/             SQLite 数据库与分片临时目录（运行时生成）
├── storage/          用户文件存储根目录（运行时生成）
├── dist/             前端构建产物（由 server 静态托管）
├── logs/             运行日志（access/error/stats）
├── publish/          WebFtpManager.exe 发布产物
├── ecosystem.config.cjs   PM2 配置（可选，已不推荐用于 Windows Server）
├── Install-WebFtp.ps1    Windows Server 一键部署脚本
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

### 4. PM2 守护（已不推荐用于 Windows Server）

> 在 Windows Server 上推荐使用**原生系统服务**方案，见下一节。

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

## Windows Server 一键部署（推荐）

将 WebFtp 注册为 Windows 原生系统服务，开机自启，崩溃自动重启。配套 `WebFtpManager.exe` GUI 面板用于日常管理。

### 一键部署

以**管理员身份**运行 PowerShell：

```powershell
.\Install-WebFtp.ps1
```

脚本会自动完成：

1. 检查 Node.js / npm / .NET SDK 依赖
2. `npm install` 安装后端依赖
3. `npm run build` 构建前端
4. `dotnet publish` 构建 WebFtpManager.exe
5. 自动生成 `.env`（JWT_SECRET 随机化）
6. 初始化数据库与默认管理员
7. 注册 Windows 服务（名称 `WebFtp`），设置开机自启并启动
8. 自动打开 WebFtpManager.exe 管理面板

### 其他用法

```powershell
.\Install-WebFtp.ps1 -Uninstall    # 卸载服务（保留数据）
.\Install-WebFtp.ps1 -BuildOnly    # 仅构建，不注册服务
.\Install-WebFtp.ps1 -SkipBuild    # 跳过构建，直接注册服务
```

### WebFtpManager.exe 管理面板功能

| Tab | 功能 |
|-----|------|
| 服务 | 安装/卸载/启动/停止/重启服务、开关开机自启、查看 PID 与 API 健康状态、命令输出日志、一键打开 Web/项目目录/日志目录/重建前端 |
| 统计 | 最近 1 分钟/1 小时请求量、服务运行时长、60 分钟 + 24 小时柱状趋势图、Top 15 请求路径、5 秒自动刷新 |
| 用户 | 管理员登录（凭据持久化）、用户列表、新建/改密/配额/启用禁用/删除（双步确认） |
| 日志 | access / error / stats 三类日志切换、行数选择、3 秒自动刷新 |
| 配置 | 编辑 `.env`（PORT / HOST / JWT_SECRET），原始内容高级编辑 |
| 系统 | 服务版本/PID/启动时间/运行时长、主机信息、存储大小、关键目录 |

最小化窗口会自动隐藏到系统托盘（右键托盘图标可打开 Web/显示窗口/退出）。

> **注意**：管理面板需要管理员权限运行（已通过 `app.manifest` 配置 UAC `requireAdministrator`）。

### 手动服务管理（替代方案）

如果不使用 GUI，可命令行操作：

```powershell
npm run service:install      # 安装并启动
npm run service:status       # 查询状态
npm run service:start
npm run service:stop
npm run service:restart
npm run service:uninstall    # 卸载
```

或用 Windows 自带工具：

```powershell
sc.exe query WebFtp          # 查看状态
sc.exe stop WebFtp
sc.exe start WebFtp
sc.exe config WebFtp start= auto       # 开机自启
sc.exe config WebFtp start= demand     # 手动
sc.exe delete WebFtp         # 删除服务
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
