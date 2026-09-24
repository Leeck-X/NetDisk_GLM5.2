# NetDisk · 自托管网盘系统

支持 PC 与移动端 Web 访问的私有网盘。毛玻璃（Glassmorphism）质感界面。

## 功能

- 用户体系：管理员 / 普通用户，JWT 鉴权，存储配额，可开关的自主注册
- 文件管理：文件夹、网格/列表视图、拖拽分片上传、断点续传、秒传、批量下载、打包下载
- 文件操作：重命名、移动（目录选择器）、复制、收藏（独立分类视图）、回收站恢复/彻底删除
- 文件预览：图片走服务端 WebP 缩略图（列表秒开），视频/音频/PDF 内联播放，一键新标签页打开原文件
- 文件分享：链接分享、提取码、有效期、下载次数限制，分享页支持在线预览
- 管理后台：用户管理、系统统计（饼图/柱状图）、运行时系统配置
- 磁盘保护：按磁盘总量动态预留空间，空间不足时拒绝写入（HTTP 507）
- 垃圾回收：自动清理超时未完成的分片、孤儿分片记录、无主文件、过期回收站与孤儿缩略图
- 配额与隔离：新用户默认配额可在后台配置，用户文件按 `<userId>/` 分目录存放
- 响应式：桌面三栏、平板两栏、手机单栏底部 Tab

## 技术栈

- 前端：React 18 + Vite + Tailwind CSS + Zustand + Framer Motion + lucide-react
- 后端：Node.js + Express + better-sqlite3 + multer + jsonwebtoken + bcryptjs + archiver
- 图像处理：sharp（生成列表缩略图，惰性加载，缺失时自动回退为原图）
- 数据库：SQLite（单文件，零依赖）
- 服务管理：Windows 用 node-windows 注册系统服务；Linux 用 systemd（或 PM2）
- 管理面板：C# WPF (.NET 8) 单文件 exe（WebFtpManager.exe）

## 目录结构

源码仓库：

```
WebFtp/
├── api/              后端源码（Express 路由 + 服务 + 空间检测/垃圾回收）
├── src/              前端源码（React 页面 + 组件）
├── service/          Windows 服务管理脚本（node-windows）
│   └── manage.mjs    安装/卸载/启停/状态
├── WebFtpManager/    C# WPF 管理面板源码
├── dist/             前端构建产物（由 server 静态托管）
├── publish/          WebFtpManager.exe 发布产物
├── ecosystem.config.cjs   PM2 配置（Linux 部署）
├── Install-WebFtp.ps1    Windows Server 一键部署脚本
├── install-webftp.sh     Linux 一键部署脚本
└── .env              环境变量（从 .env.example 复制创建）
```

运行时数据（由 `WEBPAN_ROOT` 决定，默认取程序目录的上一级）：

```
${WEBPAN_ROOT}/
├── app/    程序代码（部署时放在此，如 /opt/WebPan/app）
├── data/   数据库、上传分片、运行日志、缩略图（首次启动自动创建）
│   ├── webftp.db
│   ├── chunks/           未完成上传的分片
│   ├── thumbs/           图片缩略图缓存（WebP，可随时删除后自动重建）
│   └── logs/             access / error / stats
└── files/  用户文件（按 <userId>/ 分目录隔离，首次启动自动创建）
```

> 一个主目录下只放 `app` / `data` / `files` 三个子目录，程序、数据、用户文件互不混杂，便于整体迁移与备份。

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

### 4. PM2 守护（适用于 Linux）

> Windows Server 推荐使用**原生系统服务**方案（见下一节）；Linux 推荐直接使用 [`install-webftp.sh`](#linux-一键部署) 一键部署，默认走 systemd，也可加 `--pm2` 改用 PM2。

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root   # 注册开机自启（Linux）
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
| 日志 | access / error / stats 三类日志切换、行数选择、3 秒自动刷新（读取 `WEBPAN_ROOT/data/logs`） |
| 配置 | 编辑 `.env`（PORT / HOST / JWT_SECRET）、运行时配置（站点名称/描述、开放注册、新用户默认配额、上传上限、分享默认有效期、回收站保留天数，保存即时生效）、原始内容高级编辑 |
| 系统 | 服务版本/PID/启动时间/运行时长、主机信息、存储与磁盘占用（用户文件/分片/缩略图/预留空间）、垃圾清理策略与一键清理、关键目录 |

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

## Linux 一键部署（推荐）

适用于 Ubuntu / Debian / CentOS 等主流发行版。脚本把程序、数据、用户文件统一收敛到 `${WEBPAN_ROOT}`（默认 `/opt/WebPan`）下的 `app` / `data` / `files` 三个子目录，并注册为 systemd 服务（开机自启、崩溃自动重启）。

### 一键部署

把项目放到服务器上（如 `git clone`），然后以 **root** 身份执行：

```bash
sudo bash install-webftp.sh
```

脚本会自动完成：

1. 检查 root 权限与 Node.js（≥18）/ npm / tar 依赖
2. 创建 `${WEBPAN_ROOT}/{app,data,files}`
3. 同步代码到 `${WEBPAN_ROOT}/app`（若已在 `app/` 内执行则就地部署）
4. `npm install` 安装依赖（运行期需要 `tsx`，它位于 devDependencies，因此不加 `--omit=dev`）
5. `npm run build` 构建前端，并校验 `dist/index.html`
6. 生成 `.env`（`JWT_SECRET` 随机化，并写入 `WEBPAN_ROOT` / `PORT` / `HOST`）
7. 初始化数据库与默认管理员
8. 写入 `/etc/systemd/system/webftp.service`，设置开机自启并启动

### 其他用法

```bash
sudo bash install-webftp.sh --uninstall    # 停止并卸载服务（保留 data/ 与 files/）
sudo bash install-webftp.sh --build-only   # 仅构建，不注册服务
sudo bash install-webftp.sh --skip-build   # 跳过构建，直接注册服务
sudo bash install-webftp.sh --pm2          # 改用 PM2 守护（复用 ecosystem.config.cjs）
sudo bash install-webftp.sh --webpan-root /opt/WebPan --port 3000 --user root
```

### 常用参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--webpan-root` | `/opt/WebPan` | 主目录，代码落到其 `app/` 子目录 |
| `--port` | `3000` | 服务端口（写入 `.env`） |
| `--user` | `root` | 服务运行用户，会 `chown` 主目录 |
| `--pm2` | 关 | 用 PM2 而非 systemd；此时端口由 `ecosystem.config.cjs` 决定（3000） |

### 服务管理（systemd）

```bash
systemctl status webftp      # 查看状态
systemctl restart webftp     # 重启
systemctl stop webftp        # 停止
systemctl start webftp       # 启动
systemctl disable webftp     # 关闭开机自启
journalctl -u webftp -f      # 跟踪 stdout / stderr 日志
```

> 应用自身日志（access / error / stats）写入 `${WEBPAN_ROOT}/data/logs`，即 `journalctl` 之外另有落盘日志。

## 默认账号

首次启动自动创建管理员：

- 账号：`admin`
- 密码：`admin123`

首次登录强制要求修改密码。重置密码：

```bash
npm run init:admin
```

## 配置

编辑 `.env`（完整示例见 `.env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `JWT_SECRET` | （需修改） | JWT 签名密钥 |
| `WEBPAN_ROOT` | 程序目录的上一级 | `app`/`data`/`files` 的父目录，留空则取程序目录的上一级 |
| `DISK_RESERVE_RATIO` | 0.05 | 磁盘预留比例，始终保留磁盘总量的该比例不参与写入（上限 0.5） |
| `CHUNK_TTL_HOURS` | 24 | 未完成上传的分片保留时长（小时），0 表示不清理 |
| `ORPHAN_TTL_HOURS` | 24 | 无主文件保留时长（小时），0 表示不清理 |
| `GC_INTERVAL_MINUTES` | 60 | 垃圾回收执行间隔（分钟） |
| `UPLOAD_MAX_SIZE_MB` | 2048 | 单文件上传上限（MB），后台「系统配置」的 `upload_max_size` 优先生效 |

数据库与用户文件分别位于 `${WEBPAN_ROOT}/data` 与 `${WEBPAN_ROOT}/files`。

### 后台可配置项（运行时生效，无需改代码）

登录管理员账号后进入「系统配置」页即可编辑，配置写入数据库 `config` 表，保存后立即生效：

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `site_name` | WebFtp | 站点名称，作用于登录页、侧边栏、分享页与浏览器标题 |
| `site_description` | 自托管网盘系统 · 数据尽在掌握 | 站点副标题 / 简介 |
| `allow_register` | `0`（关闭） | 是否开放自主注册；关闭时 `/api/auth/register` 直接返回 403 |
| `default_quota_gb` | `1` | 新用户默认空间配额（GB），对注册与后台新建用户同时生效 |
| `upload_max_size` | `2048` | 单文件上传上限（MB），优先于 `UPLOAD_MAX_SIZE_MB` |
| `share_default_expire_days` | `7` | 新建分享的默认有效期（天） |
| `trash_retention_days` | `30` | 回收站保留天数，超过后由垃圾回收彻底删除；填 `0` 表示永不自动清理 |

配置页的「存储与目录」面板会实时展示当前服务进程实际使用的 `data` / `thumbs` / `files` / 分片 / 日志目录与各自占用，避免文档描述与真实路径脱节。

## 磁盘空间保护与垃圾回收

**空间保护**：每次上传（分片预检与整体上传）前都会检查目标磁盘的可用空间。

- 预留空间 = 磁盘总量 × `DISK_RESERVE_RATIO`（默认 5%），该部分始终不参与写入
- 实际可写 = 非 root 可用空间 − 预留空间
- 可用空间不足时直接拒绝写入并返回 `507`，避免磁盘写满导致数据库与系统异常

**回收站保留**：删除的文件先进入回收站（`deleted = 1`），超过 `trash_retention_days` 后由垃圾回收连同磁盘文件一并彻底删除；该值为 `0` 时只保留手动清理，不自动删除。

**垃圾回收**：服务启动 10 秒后执行首轮，之后每 `GC_INTERVAL_MINUTES`（默认 60 分钟）执行一次，清理五类垃圾：

| 类型 | 位置 | 判定 |
|------|------|------|
| 孤儿分片目录 | `data/chunks/` | 超过 `CHUNK_TTL_HOURS` 仍未完成上传的残留 |
| 孤儿分片记录 | `file_chunks` 表 | 已无对应分片目录的行 |
| 无主文件 | `files/` | 磁盘存在但数据库无记录，且超过 `ORPHAN_TTL_HOURS` |
| 过期回收站 | `files/` + `files` 表 | 已删除且超过 `trash_retention_days`（`0` 表示不清理） |
| 孤儿缩略图 | `data/thumbs/` | 对应的文件记录已不存在（含被彻底删除的文件） |

进行中的上传会被跳过，不会误删；同时会统计「数据库有记录但磁盘文件已丢失」的数量并输出告警日志（只上报，不自动删记录）。

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

定期备份以下内容（均位于 `${WEBPAN_ROOT}`）：

- `data/webftp.db`（数据库）
- `files/`（用户文件）

`data/thumbs/` 与 `data/chunks/` 属于可重建的缓存/中间态，无需备份；删除 `thumbs/` 后缩略图会在下次访问时自动重新生成。
