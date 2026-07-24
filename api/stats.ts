/**
 * 请求统计模块
 * - 内存中维护 60 个 1 分钟桶（最近 1 小时）+ 24 个 1 小时桶（最近 1 天）
 * - 每分钟把上一分钟的数据写入 stats.log（GUI 可绘制趋势图）
 */
import { writeStats } from './logger.js'

interface Bucket {
  ts: number       // 桶开始时间戳（毫秒）
  count: number    // 请求总数
  errCount: number // 错误数（>=400）
  totalMs: number  // 总耗时
  bytesIn: number  // 入站字节
  bytesOut: number // 出站字节
  paths: Map<string, number> // 路径 -> 计数（仅保留 top N）
}

function newBucket(ts: number): Bucket {
  return { ts, count: 0, errCount: 0, totalMs: 0, bytesIn: 0, bytesOut: 0, paths: new Map() }
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

// 1 分钟桶 × 60 = 1 小时
const minuteBuckets: Bucket[] = []
// 1 小时桶 × 24 = 1 天
const hourBuckets: Bucket[] = []

let lastFlushMinute = 0
let lastFlushHour = 0

function currentMinuteTs(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS
}
function currentHourTs(): number {
  return Math.floor(Date.now() / HOUR_MS) * HOUR_MS
}

function ensureBuckets(): void {
  const mTs = currentMinuteTs()
  if (minuteBuckets.length === 0 || minuteBuckets[minuteBuckets.length - 1].ts < mTs) {
    minuteBuckets.push(newBucket(mTs))
    // 桶切换时刷新上一分钟到文件
    if (minuteBuckets.length > 1 && lastFlushMinute < mTs) {
      const prev = minuteBuckets[minuteBuckets.length - 2]
      flushMinuteBucket(prev)
      lastFlushMinute = mTs
    }
    while (minuteBuckets.length > 60) minuteBuckets.shift()
  }
  const hTs = currentHourTs()
  if (hourBuckets.length === 0 || hourBuckets[hourBuckets.length - 1].ts < hTs) {
    hourBuckets.push(newBucket(hTs))
    while (hourBuckets.length > 24) hourBuckets.shift()
  }
}

function flushMinuteBucket(b: Bucket): void {
  const avg = b.count > 0 ? Math.round(b.totalMs / b.count) : 0
  const topPaths = Array.from(b.paths.entries()).sort((a, c) => c[1] - a[1]).slice(0, 10).map(([p, n]) => `${p}:${n}`).join(',')
  writeStats(JSON.stringify({
    type: 'minute',
    ts: b.ts,
    count: b.count,
    errCount: b.errCount,
    avgMs: avg,
    bytesIn: b.bytesIn,
    bytesOut: b.bytesOut,
    topPaths,
  }))
}

/** 记录一次请求 */
export function recordRequest(opts: {
  method: string
  path: string
  status: number
  durationMs: number
  bytesIn: number
  bytesOut: number
}): void {
  ensureBuckets()
  const m = minuteBuckets[minuteBuckets.length - 1]
  const h = hourBuckets[hourBuckets.length - 1]
  for (const b of [m, h]) {
    b.count++
    if (opts.status >= 400) b.errCount++
    b.totalMs += opts.durationMs
    b.bytesIn += opts.bytesIn
    b.bytesOut += opts.bytesOut
    // 路径按粗粒度聚合（去掉数字 ID）
    const p = normalizePath(opts.path)
    b.paths.set(p, (b.paths.get(p) ?? 0) + 1)
  }
}

function normalizePath(p: string): string {
  return p
    .replace(/\/[0-9a-zA-Z]{8,}/g, '/:id')
    .replace(/\?.*$/, '')
    .slice(0, 64)
}

/** 汇总统计 */
export function getStatsSummary() {
  ensureBuckets()
  const now = Date.now()

  // 最近 60 分钟的每分钟统计
  const minutes = minuteBuckets.map((b) => ({
    ts: b.ts,
    count: b.count,
    errCount: b.errCount,
    avgMs: b.count > 0 ? Math.round(b.totalMs / b.count) : 0,
    bytesIn: b.bytesIn,
    bytesOut: b.bytesOut,
  }))

  // 最近 24 小时的每小时统计
  const hours = hourBuckets.map((b) => ({
    ts: b.ts,
    count: b.count,
    errCount: b.errCount,
    avgMs: b.count > 0 ? Math.round(b.totalMs / b.count) : 0,
  }))

  // 最近 1 分钟实时
  const lastMin = minuteBuckets[minuteBuckets.length - 1]
  const lastHour = hourBuckets[hourBuckets.length - 1]

  // top 路径（取最近 1 小时桶合并）
  const mergedPaths = new Map<string, number>()
  for (const b of minuteBuckets) {
    for (const [p, n] of b.paths) mergedPaths.set(p, (mergedPaths.get(p) ?? 0) + n)
  }
  const topPaths = Array.from(mergedPaths.entries())
    .sort((a, c) => c[1] - a[1])
    .slice(0, 15)
    .map(([path, count]) => ({ path, count }))

  return {
    uptime: now - START_TIME,
    totalMinute: minutes.reduce((s, b) => s + b.count, 0),
    totalHour: hours.reduce((s, b) => s + b.count, 0),
    lastMinuteCount: lastMin?.count ?? 0,
    lastMinuteError: lastMin?.errCount ?? 0,
    lastMinuteAvgMs: lastMin && lastMin.count > 0 ? Math.round(lastMin.totalMs / lastMin.count) : 0,
    lastHourCount: lastHour?.count ?? 0,
    lastHourError: lastHour?.errCount ?? 0,
    minutes,
    hours,
    topPaths,
  }
}

export const START_TIME = Date.now()
