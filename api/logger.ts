/**
 * 文件日志模块
 * - access.log: 每个请求一行（时间 方法 路径 状态 耗时 IP UA）
 * - error.log: 错误堆栈
 * - stats.log: 每分钟汇总一次（用于 GUI 绘制趋势图）
 */
import fs from 'fs'
import path from 'path'
import { ROOT_DIR } from './db.js'

export const LOGS_DIR = path.join(ROOT_DIR, 'logs')
const ACCESS_LOG = path.join(LOGS_DIR, 'webftp-access.log')
const ERROR_LOG = path.join(LOGS_DIR, 'webftp-error.log')
const STATS_LOG = path.join(LOGS_DIR, 'webftp-stats.log')

const MAX_SIZE = 5 * 1024 * 1024 // 单文件 5MB
const KEEP_LINES = 50000         // 单文件最多保留行数

let initialized = false

function ensureLogDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  }
  if (!initialized) {
    for (const f of [ACCESS_LOG, ERROR_LOG, STATS_LOG]) {
      if (!fs.existsSync(f)) fs.writeFileSync(f, '')
    }
    initialized = true
  }
}

/** 简单的轮转：超出大小则截断保留尾部 */
function rotateIfNeeded(file: string): void {
  try {
    const stat = fs.statSync(file)
    if (stat.size > MAX_SIZE) {
      const content = fs.readFileSync(file, 'utf8').split('\n')
      const kept = content.slice(-KEEP_LINES).join('\n')
      fs.writeFileSync(file, kept)
    }
  } catch {
    /* ignore */
  }
}

export function writeAccess(line: string): void {
  ensureLogDir()
  rotateIfNeeded(ACCESS_LOG)
  fs.appendFile(ACCESS_LOG, line + '\n', () => {})
}

export function writeError(err: Error | string, context?: string): void {
  ensureLogDir()
  rotateIfNeeded(ERROR_LOG)
  const time = new Date().toISOString()
  const text = typeof err === 'string' ? err : `${err.message}\n${err.stack ?? ''}`
  fs.appendFile(ERROR_LOG, `[${time}]${context ? ' [' + context + ']' : ''} ${text}\n`, () => {})
}

export function writeStats(line: string): void {
  ensureLogDir()
  rotateIfNeeded(STATS_LOG)
  fs.appendFile(STATS_LOG, line + '\n', () => {})
}

/** 读取日志尾部 */
export function readLogTail(name: 'access' | 'error' | 'stats', lines = 500): string {
  ensureLogDir()
  const map = { access: ACCESS_LOG, error: ERROR_LOG, stats: STATS_LOG } as const
  const file = map[name]
  if (!fs.existsSync(file)) return ''
  const content = fs.readFileSync(file, 'utf8')
  const arr = content.split('\n').filter(Boolean)
  return arr.slice(-lines).join('\n')
}

export { ACCESS_LOG, ERROR_LOG, STATS_LOG }
