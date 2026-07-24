/**
 * WebFtp Windows 服务管理脚本（基于 node-windows）
 *
 * 用法：
 *   node service/manage.mjs install     安装并启动服务
 *   node service/manage.mjs uninstall   停止并卸载服务
 *   node service/manage.mjs start       启动服务
 *   node service/manage.mjs stop        停止服务
 *   node service/manage.mjs restart     重启服务
 *   node service/manage.mjs status      查询服务状态
 *
 * 必须以管理员身份运行（建议通过 WebFtpManager.exe 调用）
 */
import { Service } from 'node-windows'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// 读取 .env（如果存在），把端口写进服务环境变量
const envFile = path.join(ROOT, '.env')
const env = {
  NODE_ENV: 'production',
  PORT: '3000',
  HOST: '0.0.0.0',
}
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/)
    if (m && (m[1] === 'PORT' || m[1] === 'HOST' || m[1] === 'JWT_SECRET')) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

// 工作目录：服务运行时的 cwd（必须能找到 .env / data / storage / dist）
const cwd = ROOT

// 启动命令：node --import tsx/esm api/server.ts
// 优先使用项目内的 node，避免系统路径不一致
const nodeExe = process.execPath
const scriptPath = path.join(ROOT, 'api', 'server.ts')

const svc = new Service({
  name: 'WebFtp',
  description: 'WebFtp 自托管网盘服务（Node.js + Express）',
  script: scriptPath,
  execPath: nodeExe,
  execArgs: ['--import', 'tsx/esm'],
  cwd,
  env,
  // node-windows 默认会把 stdout/stderr 写到 daemon 日志
  logpath: path.join(ROOT, 'logs'),
})

svc.on('install', () => {
  console.log('[install] WebFtp 服务已安装')
  try {
    svc.start()
    console.log('[install] 已发出启动指令')
  } catch (e) {
    console.warn('[install] 启动失败：', e.message)
  }
})
svc.on('uninstall', () => {
  console.log('[uninstall] WebFtp 服务已卸载')
  // 清理残留
  try {
    execSync('sc.exe delete WebFtp', { stdio: 'ignore' })
  } catch { /* ignore */ }
})
svc.on('start', () => console.log('[start] WebFtp 服务已启动'))
svc.on('stop', () => console.log('[stop] WebFtp 服务已停止'))
svc.on('error', (err) => console.error('[error]', err))
svc.on('alreadyinstalled', () => console.log('[install] 服务已存在，跳过安装'))
svc.on('invalidinstallation', () => console.warn('[warn] 服务安装无效'))

function status() {
  try {
    const out = execSync('sc.exe query WebFtp', { encoding: 'utf8' })
    const m = out.match(/STATE\s*:\s*\d+\s*([A-Z_]+)/)
    const state = m ? m[1] : 'UNKNOWN'
    const startType = execSync('sc.exe qc WebFtp', { encoding: 'utf8' })
    const sm = startType.match(/START_TYPE\s*:\s*\d+\s*([A-Z_]+)/)
    const start = sm ? sm[1] : 'UNKNOWN'
    const result = {
      name: 'WebFtp',
      state,
      startType: start,
      installed: state !== 'UNKNOWN',
      autoStart: start === 'AUTO_START',
      running: state === 'RUNNING',
      pid: null,
    }
    if (result.running) {
      try {
        const pidOut = execSync(
          `powershell -NoProfile -Command "(Get-CimInstance Win32_Service -Filter \\"Name='WebFtp'\\" | Select-Object -Expand ProcessId)"`,
          { encoding: 'utf8' }
        ).trim()
        result.pid = pidOut ? Number(pidOut) : null
      } catch { /* ignore */ }
    }
    console.log(JSON.stringify(result, null, 2))
    return result
  } catch {
    const result = { name: 'WebFtp', state: 'NOT_INSTALLED', installed: false, running: false, autoStart: false, pid: null }
    console.log(JSON.stringify(result, null, 2))
    return result
  }
}

const cmd = process.argv[2]?.toLowerCase()
switch (cmd) {
  case 'install':
    svc.install()
    break
  case 'uninstall':
    svc.uninstall()
    break
  case 'start':
    try { execSync('sc.exe start WebFtp', { stdio: 'inherit' }) } catch (e) { console.error(e.message) }
    break
  case 'stop':
    try { execSync('sc.exe stop WebFtp', { stdio: 'inherit' }) } catch (e) { console.error(e.message) }
    break
  case 'restart':
    try {
      execSync('sc.exe stop WebFtp', { stdio: 'inherit' })
    } catch { /* ignore */ }
    setTimeout(() => {
      try { execSync('sc.exe start WebFtp', { stdio: 'inherit' }) } catch (e) { console.error(e.message) }
    }, 1500)
    break
  case 'status':
    status()
    break
  case 'autostart-on':
    try { execSync('sc.exe config WebFtp start= auto', { stdio: 'inherit' }); console.log('已开启开机自启') } catch (e) { console.error(e.message) }
    break
  case 'autostart-off':
    try { execSync('sc.exe config WebFtp start= demand', { stdio: 'inherit' }); console.log('已关闭开机自启') } catch (e) { console.error(e.message) }
    break
  default:
    console.log('用法: node service/manage.mjs [install|uninstall|start|stop|restart|status|autostart-on|autostart-off]')
}
