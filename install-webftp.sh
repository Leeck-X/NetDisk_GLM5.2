#!/usr/bin/env bash
#
# WebFtp / NetDisk Linux 一键部署脚本
#
# 用法（需 root 权限）：
#   sudo ./install-webftp.sh                  # 完整部署：检查依赖 → 同步 → 构建 → 注册服务 → 启动
#   sudo ./install-webftp.sh --uninstall      # 卸载服务（保留数据）
#   sudo ./install-webftp.sh --build-only     # 仅构建，不注册服务
#   sudo ./install-webftp.sh --skip-build     # 跳过构建，直接注册服务
#   sudo ./install-webftp.sh --pm2            # 使用 PM2 守护（默认 systemd）
#   sudo ./install-webftp.sh --webpan-root /opt/WebPan --port 3000 --user root
#
# 目录约定：${WEBPAN_ROOT}/{app,data,files}
#   app    程序代码（本脚本会把当前项目同步到这里）
#   data   数据库、上传分片、运行日志
#   files  用户文件
#
# 卸载不会删除 data/ 与 files/，可安全重装。

set -euo pipefail

# ---------- 默认参数 ----------
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBPAN_ROOT="/opt/WebPan"
PORT="3000"
HOST="0.0.0.0"
SVC_NAME="webftp"
MODE="systemd"
SVC_USER=""
UNINSTALL=0
BUILD_ONLY=0
SKIP_BUILD=0

# ---------- 输出helper ----------
if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_CYAN=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
step() { printf '\n%s[步骤] %s%s\n' "$C_CYAN" "$1" "$C_RESET"; }
ok()   { printf '%s  [√] %s%s\n' "$C_GREEN" "$1" "$C_RESET"; }
warn() { printf '%s  [!] %s%s\n' "$C_YELLOW" "$1" "$C_RESET"; }
err()  { printf '%s  [X] %s%s\n' "$C_RED" "$1" "$C_RESET" >&2; }
die()  { err "$1"; exit 1; }

usage() {
  sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

# ---------- 参数解析 ----------
ORIG_ARGS="$*"
while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall)   UNINSTALL=1 ;;
    --build-only)  BUILD_ONLY=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --pm2)         MODE="pm2" ;;
    --systemd)     MODE="systemd" ;;
    --webpan-root) WEBPAN_ROOT="${2:?--webpan-root 需要一个路径}"; shift ;;
    --port)        PORT="${2:?--port 需要一个端口号}"; shift ;;
    --user)        SVC_USER="${2:?--user 需要一个用户名}"; shift ;;
    -h|--help)     usage ;;
    *) die "未知参数：$1（使用 --help 查看用法）" ;;
  esac
  shift
done

case "$PORT" in
  ''|*[!0-9]*) die "端口必须是数字：$PORT" ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "端口超出范围：$PORT"

APP_DIR="${WEBPAN_ROOT}/app"
DATA_DIR="${WEBPAN_ROOT}/data"
FILES_DIR="${WEBPAN_ROOT}/files"
LOG_DIR="${DATA_DIR}/logs"

# ---------- 1. root 检测 ----------
[ "$(id -u)" -eq 0 ] || die "请以 root 运行此脚本：sudo $0 $ORIG_ARGS"

if [ -z "$SVC_USER" ]; then
  SVC_USER="root"
fi
if ! id "$SVC_USER" >/dev/null 2>&1; then
  die "用户不存在：$SVC_USER"
fi
HOME_DIR="$(getent passwd "$SVC_USER" 2>/dev/null | cut -d: -f6)"
[ -n "$HOME_DIR" ] || HOME_DIR="/root"

printf '%sWebFtp / NetDisk Linux 一键部署%s\n' "$C_CYAN" "$C_RESET"
ok "项目根目录: $SRC_DIR"
ok "主目录:     $WEBPAN_ROOT  (app / data / files)"
ok "运行用户:   $SVC_USER"
ok "守护方式:   $MODE"

# ---------- 2. 卸载分支 ----------
if [ "$UNINSTALL" -eq 1 ]; then
  step "卸载 WebFtp 服务"

  UNIT_FILE="/etc/systemd/system/${SVC_NAME}.service"
  if [ -f "$UNIT_FILE" ]; then
    if command -v systemctl >/dev/null 2>&1; then
      systemctl stop "$SVC_NAME" >/dev/null 2>&1 || true
      systemctl disable "$SVC_NAME" >/dev/null 2>&1 || true
    fi
    rm -f "$UNIT_FILE"
    if command -v systemctl >/dev/null 2>&1; then
      systemctl daemon-reload >/dev/null 2>&1 || true
      systemctl reset-failed "$SVC_NAME" >/dev/null 2>&1 || true
    fi
    ok "systemd 服务已卸载"
  fi

  if command -v pm2 >/dev/null 2>&1; then
    if pm2 describe "$SVC_NAME" >/dev/null 2>&1; then
      pm2 delete "$SVC_NAME" >/dev/null 2>&1 || true
      pm2 save >/dev/null 2>&1 || true
      ok "PM2 进程已移除"
    fi
  fi

  printf '\n%s卸载完成。数据目录 %s 与文件目录 %s 未被删除。%s\n' \
    "$C_CYAN" "$DATA_DIR" "$FILES_DIR" "$C_RESET"
  exit 0
fi

# ---------- 3. 依赖检测 ----------
step "检测运行依赖"

command -v node >/dev/null 2>&1 || die "未检测到 Node.js，请先安装 Node.js 18+（推荐 https://github.com/nodesource）"
NODE_BIN="$(command -v node)"
NODE_VER="$("$NODE_BIN" -v)"
NODE_MAJOR="${NODE_VER#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 版本过低（$NODE_VER），需要 18+"
ok "Node.js: $NODE_VER  ($NODE_BIN)"

command -v npm >/dev/null 2>&1 || die "未检测到 npm"
ok "npm: $(npm -v)"

command -v tar >/dev/null 2>&1 || die "未检测到 tar"
[ -f "$SRC_DIR/package.json" ] || die "未找到 package.json，请在项目根目录运行本脚本"
ok "package.json 就绪"

# ---------- 4. 目录准备与代码同步 ----------
step "准备目录并同步代码"
mkdir -p "$APP_DIR" "$DATA_DIR" "$LOG_DIR" "$FILES_DIR"
ok "已创建 ${WEBPAN_ROOT}/{app,data,files}"

if [ "$SRC_DIR" != "$APP_DIR" ]; then
  tar -C "$SRC_DIR" -cf - \
    --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./_deploy_tmp' \
    --exclude='./data' \
    --exclude='./files' \
    --exclude='./logs' \
    --exclude='./dist' \
    --exclude='./publish' \
    --exclude='./WebFtpManager/bin' \
    --exclude='./WebFtpManager/obj' \
    --exclude='./.env' \
    . | tar -C "$APP_DIR" -xf -
  ok "代码已同步: $SRC_DIR → $APP_DIR"
else
  ok "就地部署，无需同步"
fi

if [ "$SVC_USER" != "root" ]; then
  chown -R "$SVC_USER" "$WEBPAN_ROOT" 2>/dev/null || warn "chown 失败，请确认 $SVC_USER 对 $WEBPAN_ROOT 有读写权限"
  ok "已将 $WEBPAN_ROOT 归属调整为 $SVC_USER"
fi

cd "$APP_DIR"

# ---------- 5. 构建 ----------
# 注意：运行期依赖 tsx（--import tsx/esm），它在 devDependencies 中，
# 因此这里必须完整安装依赖，不能加 --omit=dev。
if [ "$SKIP_BUILD" -eq 0 ]; then
  step "安装依赖（npm install）"
  npm install --no-audit --no-fund
  ok "npm install 完成"

  step "构建前端（npm run build）"
  npm run build
  [ -f "$APP_DIR/dist/index.html" ] || die "前端构建失败，未生成 dist/index.html，请手动排查"
  ok "前端构建完成 → dist/"
else
  step "跳过构建"
  [ -f "$APP_DIR/dist/index.html" ] || warn "未发现 dist/index.html，服务可能无法提供前端页面"
  ok "已跳过依赖安装与构建"
fi

# ---------- 6. .env 配置 ----------
set_env() {
  local key="$1" val="$2" file="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$val" '
    BEGIN { done = 0 }
    !done && $0 ~ "^[#[:space:]]*" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

ENV_FILE="$APP_DIR/.env"
[ -f "$APP_DIR/.env.example" ] || die "缺少 .env.example，无法生成配置"

if [ ! -f "$ENV_FILE" ]; then
  step "初始化 .env"
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  JWT_SECRET="$(gen_secret)"
  sed -i "s|your-random-secret-key-here|$JWT_SECRET|" "$ENV_FILE"
  set_env PORT "$PORT" "$ENV_FILE"
  set_env HOST "$HOST" "$ENV_FILE"
  set_env WEBPAN_ROOT "$WEBPAN_ROOT" "$ENV_FILE"
  if grep -q 'your-random-secret-key-here' "$ENV_FILE"; then
    die "JWT_SECRET 替换失败，请手动编辑 $ENV_FILE 设置随机密钥"
  fi
  ok "已生成 .env（JWT_SECRET 已随机化）"
else
  ok ".env 已存在，跳过"
fi

# ---------- 7. 初始化管理员 ----------
step "初始化数据库与管理员"
if npm run init:admin; then
  ok "管理员账号已就绪"
else
  warn "init:admin 失败，可稍后手动执行：cd $APP_DIR && npm run init:admin"
fi

# ---------- 8. 注册守护服务 ----------
if [ "$BUILD_ONLY" -eq 1 ]; then
  printf '\n%s--build-only 模式：跳过服务注册%s\n' "$C_CYAN" "$C_RESET"
  SKIP_SERVICE=1
else
  SKIP_SERVICE=0
fi

if [ "$SKIP_SERVICE" -eq 0 ] && [ "$MODE" = "systemd" ]; then
  command -v systemctl >/dev/null 2>&1 || die "未检测到 systemctl，请改用 --pm2，或手动配置守护进程"

  step "注册 systemd 服务（$SVC_NAME）"
  UNIT="/etc/systemd/system/${SVC_NAME}.service"
  cat > "$UNIT" <<EOF
[Unit]
Description=WebFtp 自托管网盘服务（Node.js + Express）
Documentation=file://${APP_DIR}/README.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SVC_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${ENV_FILE}
ExecStart=${NODE_BIN} --no-warnings --import tsx/esm api/server.ts
Restart=always
RestartSec=3
StandardOutput=append:${LOG_DIR}/webftp-out.log
StandardError=append:${LOG_DIR}/webftp-error.log

[Install]
WantedBy=multi-user.target
EOF
  ok "已写入 $UNIT"

  systemctl daemon-reload
  systemctl enable "$SVC_NAME" >/dev/null 2>&1 || warn "设置开机自启失败"
  systemctl restart "$SVC_NAME"
  sleep 2
  if systemctl is-active --quiet "$SVC_NAME"; then
    ok "服务已启动并设置开机自启"
  else
    warn "服务未运行，查看日志：journalctl -u ${SVC_NAME} -n 50 --no-pager"
  fi
fi

if [ "$SKIP_SERVICE" -eq 0 ] && [ "$MODE" = "pm2" ]; then
  step "使用 PM2 守护（$SVC_NAME）"
  if [ "$PORT" != "3000" ]; then
    warn "--pm2 模式下端口由 ecosystem.config.cjs 决定（3000），--port 已忽略"
  fi
  if ! command -v pm2 >/dev/null 2>&1; then
    warn "未检测到 pm2，正在全局安装"
    npm install -g pm2
  fi
  [ -f "$APP_DIR/ecosystem.config.cjs" ] || die "缺少 ecosystem.config.cjs"
  pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env
  pm2 save >/dev/null 2>&1 || true
  if pm2 startup systemd -u "$SVC_USER" --hp "$HOME_DIR" >/dev/null 2>&1; then
    ok "已生成 PM2 开机自启配置"
  else
    warn "pm2 startup 未成功，可手动执行：pm2 startup systemd -u ${SVC_USER} --hp ${HOME_DIR}"
  fi
  sleep 1
  if pm2 describe "$SVC_NAME" >/dev/null 2>&1; then
    ok "PM2 进程已启动"
  else
    warn "PM2 进程未就绪，查看日志：pm2 logs ${SVC_NAME}"
  fi
fi

# ---------- 9. 完成 ----------
EFFECTIVE_PORT="$PORT"
if [ -f "$ENV_FILE" ]; then
  ENV_PORT="$(sed -n 's/^[[:space:]]*PORT=//p' "$ENV_FILE" | tail -n1 | tr -d '[:space:]')"
  [ -n "$ENV_PORT" ] && EFFECTIVE_PORT="$ENV_PORT"
fi

printf '\n%s========================================%s\n' "$C_CYAN" "$C_RESET"
printf '%s  部署完成！%s\n' "$C_GREEN" "$C_RESET"
printf '%s========================================%s\n' "$C_CYAN" "$C_RESET"
printf '  Web 访问:    http://localhost:%s\n' "$EFFECTIVE_PORT"
printf '  程序目录:    %s\n' "$APP_DIR"
printf '  数据目录:    %s\n' "$DATA_DIR"
printf '  文件目录:    %s\n' "$FILES_DIR"
printf '  默认账号:    admin / admin123 （首次登录强制改密）\n'
printf '  日志目录:    %s\n' "$LOG_DIR"
if [ "$MODE" = "pm2" ]; then
  printf '  服务管理:    pm2 status %s / pm2 logs %s / pm2 restart %s\n' "$SVC_NAME" "$SVC_NAME" "$SVC_NAME"
else
  printf '  服务管理:    systemctl status %s / journalctl -u %s -f\n' "$SVC_NAME" "$SVC_NAME"
fi
printf '  卸载命令:    sudo %s --uninstall\n' "${BASH_SOURCE[0]}"
printf '%s========================================%s\n' "$C_CYAN" "$C_RESET"
