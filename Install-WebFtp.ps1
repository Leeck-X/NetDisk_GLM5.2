# WebFtp Windows Server 部署脚本
#
# 用法（以管理员身份运行 PowerShell）：
#   .\Install-WebFtp.ps1                # 完整部署：检查依赖 → 构建 → 安装服务 → 启动
#   .\Install-WebFtp.ps1 -Uninstall     # 卸载服务并清理
#   .\Install-WebFtp.ps1 -BuildOnly     # 仅构建，不安装服务
#   .\Install-WebFtp.ps1 -SkipBuild     # 跳过构建直接安装（已构建过）
#
# 部署完成后会自动打开 WebFtpManager.exe 进行管理。

[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$BuildOnly,
    [switch]$SkipBuild,
    [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n[步骤] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [√] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [X] $msg" -ForegroundColor Red }

# --- 1. 管理员检测 ---
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Err "请以管理员身份运行此脚本（右键 PowerShell → 以管理员身份运行）"
    exit 1
}

Set-Location $ProjectRoot
Write-Ok "项目根目录: $ProjectRoot"

# --- 2. 卸载分支 ---
if ($Uninstall) {
    Write-Step "卸载 WebFtp 服务"
    if (Test-Path "service\manage.mjs") {
        try {
            node service\manage.mjs uninstall
            Write-Ok "服务已卸载"
        } catch {
            Write-Warn "卸载脚本异常: $_"
        }
    } else {
        sc.exe stop WebFtp 2>$null
        sc.exe delete WebFtp 2>$null
        Write-Ok "已通过 sc.exe 卸载"
    }
    Write-Host "`n卸载完成。数据目录 data/ 与 storage/ 未被删除。" -ForegroundColor Cyan
    exit 0
}

# --- 3. 依赖检测 ---
Write-Step "检测运行依赖"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "未检测到 Node.js，请先安装 Node.js 18+ (https://nodejs.org/)"
    exit 1
}
$nodeVer = (node -v)
Write-Ok "Node.js: $nodeVer"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "未检测到 npm"
    exit 1
}
Write-Ok "npm: $(npm -v)"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Warn "未检测到 .NET SDK，将跳过 WebFtpManager.exe 构建"
} else {
    Write-Ok ".NET SDK: $(dotnet --version)"
}

# --- 4. 构建 ---
if (-not $SkipBuild) {
    Write-Step "安装后端依赖"
    npm install --omit=dev 2>&1 | Out-Null
    Write-Ok "npm install 完成"

    Write-Step "构建前端（vite build）"
    npm run build 2>&1 | Out-Null
    if (Test-Path "dist\index.html") {
        Write-Ok "前端构建完成 → dist/"
    } else {
        Write-Err "前端构建失败，请手动运行 npm run build 排查"
        exit 1
    }

    if (Get-Command dotnet -ErrorAction SilentlyContinue) {
        Write-Step "构建 WebFtpManager.exe（WPF 管理面板）"
        dotnet publish WebFtpManager\WebFtpManager.csproj -c Release -o "$ProjectRoot\publish" 2>&1 | Out-Null
        if (Test-Path "publish\WebFtpManager.exe") {
            Write-Ok "管理面板已构建 → publish\WebFtpManager.exe"
        } else {
            Write-Warn "管理面板构建失败，继续后续步骤"
        }
    }
} else {
    Write-Ok "跳过构建"
}

# --- 5. .env 配置 ---
if (-not (Test-Path ".env")) {
    Write-Step "初始化 .env"
    Copy-Item ".env.example" ".env"
    # 生成随机 JWT 密钥
    $jwt = -join ((48..57 + 65..90 + 97..122) * 4 | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    (Get-Content .env) -replace 'your-random-secret-key-here', $jwt | Set-Content .env
    Write-Ok "已生成 .env（JWT_SECRET 已随机化）"
} else {
    Write-Ok ".env 已存在，跳过"
}

# --- 6. 初始化管理员 ---
Write-Step "初始化数据库与管理员"
try {
    npm run init:admin 2>&1 | Out-Null
    Write-Ok "管理员账号已就绪"
} catch {
    Write-Warn "init:admin 失败: $_"
}

# --- 7. 注册 Windows 服务 ---
if ($BuildOnly) {
    Write-Host "`n-BuildOnly 模式：跳过服务注册" -ForegroundColor Cyan
    exit 0
}

Write-Step "注册 Windows 服务（WebFtp）"
node service\manage.mjs install
Start-Sleep -Seconds 2
$status = node service\manage.mjs status
Write-Host $status
if ($status -match 'RUNNING') {
    Write-Ok "服务已启动"
} else {
    Write-Warn "服务未运行，可通过 WebFtpManager.exe 或 sc.exe start WebFtp 启动"
}

# --- 8. 启动管理面板 ---
if (Test-Path "publish\WebFtpManager.exe") {
    Write-Step "启动 WebFtpManager.exe"
    Start-Process "publish\WebFtpManager.exe"
    Write-Ok "管理面板已启动"
}

# --- 9. 完成 ---
$port = if (Test-Path .env) { (Get-Content .env | Where-Object { $_ -match '^PORT=' }) -replace 'PORT=', '' } else { '3000' }
if (-not $port) { $port = '3000' }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Web 访问:    http://localhost:$port" -ForegroundColor White
Write-Host "  管理面板:    $ProjectRoot\publish\WebFtpManager.exe" -ForegroundColor White
Write-Host "  默认账号:    admin / admin123 （首次登录强制改密）" -ForegroundColor White
Write-Host "  日志目录:    $ProjectRoot\logs" -ForegroundColor White
Write-Host "  卸载命令:    .\Install-WebFtp.ps1 -Uninstall" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
