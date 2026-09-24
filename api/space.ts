/**
 * 磁盘空间检测模块
 *
 * 本模块在 import 期不做任何 IO —— app.ts 被 api/index.ts（Vercel serverless 入口）
 * 复用，import 期抛错会直接拖垮整个应用。
 */
import fs from 'fs'
import path from 'path'
import { STORAGE_DIR } from './db.js'
import { formatBytes } from './utils.js'

/** 预留比例：始终保留磁盘总量的该比例不参与写入，默认 5% */
const RESERVE_RATIO = clampRatio(process.env.DISK_RESERVE_RATIO)

function clampRatio(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0.05
  return Math.min(0.5, n)
}

export interface DiskUsage {
  /** 文件系统总容量 */
  total: number
  /** 非 root 可用字节数 */
  available: number
  /** 需要为系统保留的字节数 */
  reserve: number
  /** 实际允许应用写入的字节数 = available - reserve */
  usable: number
  /** 已使用字节数 */
  used: number
  /** 已使用百分比 */
  usedPercent: number
}

/** 统计失败时的兜底值：不阻断正常上传 */
const UNKNOWN_USAGE: DiskUsage = {
  total: 0,
  available: 0,
  reserve: 0,
  usable: Number.MAX_SAFE_INTEGER,
  used: 0,
  usedPercent: 0,
}

/** 向上找到最近的已存在目录，避免 statfs 抛 ENOENT */
function nearestExisting(target: string): string {
  let cur = path.resolve(target)
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur)
    if (parent === cur) return cur
    cur = parent
  }
  return cur
}

/** 读取目标路径所在文件系统的容量信息 */
export function getDiskUsage(target: string = STORAGE_DIR): DiskUsage {
  try {
    // frsize 是 Node 运行时真实提供的字段，但 @types/node 的 StatsFs 未声明，故此处收窄断言
    const st = fs.statfsSync(nearestExisting(target)) as unknown as {
      frsize?: number | bigint
      bsize?: number | bigint
      blocks?: number | bigint
      bavail?: number | bigint
    }
    // frsize 是基本块大小；bsize 是推荐传输块大小，个别文件系统上两者不等
    const unit = Number(st.frsize) || Number(st.bsize)
    // bavail 是非 root 可用块；bfree 含 root 保留块，会高估可用空间
    const total = Number(st.blocks) * unit
    const available = Number(st.bavail) * unit
    // 字段缺失会算出 NaN，而 `bytes > NaN` 恒为 false 会让检查静默通过
    if (!Number.isFinite(total) || !Number.isFinite(available) || total <= 0 || available < 0) {
      console.warn('[WebFtp] 磁盘容量信息异常，本次跳过空间校验', { total, available })
      return UNKNOWN_USAGE
    }
    const reserve = Math.floor(total * RESERVE_RATIO)
    const usable = Math.max(0, available - reserve)
    const used = total - available
    return {
      total,
      available,
      reserve,
      usable,
      used,
      usedPercent: Math.round((used / total) * 100),
    }
  } catch (err) {
    console.warn('[WebFtp] 读取磁盘容量失败，本次跳过空间校验', err)
    return UNKNOWN_USAGE
  }
}

export interface SpaceCheck {
  ok: boolean
  message?: string
  usage: DiskUsage
}

/** 判断目标路径所在磁盘能否再写入 bytes 字节 */
export function checkDiskSpace(bytes: number, target: string = STORAGE_DIR): SpaceCheck {
  const usage = getDiskUsage(target)
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: true, usage }
  if (bytes > usage.usable) {
    return {
      ok: false,
      usage,
      message: `服务器磁盘空间不足（剩余可用 ${formatBytes(usage.usable)}，本次需要 ${formatBytes(bytes)}），请联系管理员`,
    }
  }
  return { ok: true, usage }
}
