/**
 * 垃圾清理模块
 *
 * 三类垃圾：
 * 1. 孤儿分片目录 —— data/chunks/ 下超时未完成的上传残留
 * 2. 孤儿分片记录 —— file_chunks 中已无对应目录的行
 * 3. 孤儿文件    —— files/ 下磁盘存在但数据库无记录的文件
 *
 * 由 api/server.ts 启动时执行一次，之后每小时执行一次。
 */
import fs from 'fs'
import path from 'path'
import { CHUNKS_DIR, STORAGE_DIR, getDb } from './db.js'
import { writeError } from './logger.js'
import { formatBytes } from './utils.js'

/** 分片保留时长（小时），0 表示不清理 */
const CHUNK_TTL_HOURS = Number(process.env.CHUNK_TTL_HOURS ?? 24)
/** 孤儿文件保留时长（小时），0 表示不清理 */
const ORPHAN_TTL_HOURS = Number(process.env.ORPHAN_TTL_HOURS ?? 24)

/** 正在上传中的 uploadId，清理时跳过，避免扫掉进行中的上传 */
export const activeUploads = new Set<string>()

export interface GcResult {
  /** 清理的分片目录数 */
  chunkDirs: number
  /** 清理的分片记录行数 */
  chunkRows: number
  /** 清理的孤儿文件数 */
  orphanFiles: number
  /** 释放的字节数 */
  freedBytes: number
  /** 数据库有记录但磁盘文件丢失的数量（仅统计上报，不删记录） */
  missingFiles: number
}

function ttlCutoff(hours: number): number {
  return Date.now() - hours * 3600 * 1000
}

/**
 * 目录的最新修改时间：取目录自身与其子项 mtime 的最大值。
 * multer 重传同名 chunk-<i> 不会更新目录 mtime，只看目录 mtime 会误判为过期。
 */
function latestMtime(dir: string): number {
  let latest = 0
  try {
    latest = fs.statSync(dir).mtimeMs
  } catch {
    return 0
  }
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return latest
  }
  for (const name of entries) {
    try {
      const m = fs.statSync(path.join(dir, name)).mtimeMs
      if (m > latest) latest = m
    } catch {
      /* 子项已消失，忽略 */
    }
  }
  return latest
}

/** 目录占用字节数 */
function dirSize(dir: string): number {
  let total = 0
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) total += dirSize(full)
      else total += fs.statSync(full).size
    } catch {
      /* ignore */
    }
  }
  return total
}

/** 清理超时未完成的孤儿分片目录 */
function cleanupChunks(cutoff: number, result: GcResult): void {
  if (!(CHUNK_TTL_HOURS > 0) || !fs.existsSync(CHUNKS_DIR)) return
  const db = getDb()
  for (const name of fs.readdirSync(CHUNKS_DIR)) {
    if (activeUploads.has(name)) continue
    const dir = path.join(CHUNKS_DIR, name)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (latestMtime(dir) >= cutoff) continue
    result.freedBytes += dirSize(dir)
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      db.prepare('DELETE FROM file_chunks WHERE upload_id = ?').run(name)
      result.chunkDirs++
    } catch (err) {
      writeError(err as Error, 'gc: cleanupChunks')
    }
  }
}

/** 清理 file_chunks 中已无对应目录的记录 */
function cleanupChunkRows(result: GcResult): void {
  const db = getDb()
  const rows = db.prepare('SELECT DISTINCT upload_id FROM file_chunks').all() as { upload_id: string }[]
  const del = db.prepare('DELETE FROM file_chunks WHERE upload_id = ?')
  for (const row of rows) {
    if (activeUploads.has(row.upload_id)) continue
    if (fs.existsSync(path.join(CHUNKS_DIR, row.upload_id))) continue
    result.chunkRows += del.run(row.upload_id).changes
  }
}

/** 清理 files/ 下数据库无记录的孤儿文件 */
function cleanupOrphanFiles(cutoff: number, result: GcResult): void {
  if (!(ORPHAN_TTL_HOURS > 0) || !fs.existsSync(STORAGE_DIR)) return
  const db = getDb()
  const known = new Set<string>()
  const rows = db
    .prepare('SELECT storage_path FROM files WHERE storage_path IS NOT NULL')
    .all() as { storage_path: string }[]
  for (const row of rows) known.add(path.resolve(row.storage_path))

  /** 删除单个孤儿文件（无数据库记录且已过保留时长） */
  const sweep = (file: string): void => {
    if (known.has(path.resolve(file))) return
    let size = 0
    let mtime = 0
    try {
      const st = fs.statSync(file)
      if (!st.isFile()) return
      size = st.size
      mtime = st.mtimeMs
    } catch {
      return
    }
    if (mtime >= cutoff) return
    try {
      fs.unlinkSync(file)
      result.freedBytes += size
      result.orphanFiles++
    } catch (err) {
      writeError(err as Error, 'gc: cleanupOrphanFiles')
    }
  }

  for (const entry of fs.readdirSync(STORAGE_DIR)) {
    const full = path.join(STORAGE_DIR, entry)
    let st: fs.Stats
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    // 正式文件一律落在 files/<userId>/ 下，根目录的散落文件不属于任何用户，必为垃圾
    if (!st.isDirectory()) {
      sweep(full)
      continue
    }
    let names: string[] = []
    try {
      names = fs.readdirSync(full)
    } catch {
      continue
    }
    for (const name of names) sweep(path.join(full, name))
  }
}

/** 统计数据库有记录但磁盘文件已丢失的数量（只上报，不删记录） */
function countMissingFiles(result: GcResult): void {
  const db = getDb()
  const rows = db
    .prepare('SELECT storage_path FROM files WHERE storage_path IS NOT NULL')
    .all() as { storage_path: string }[]
  for (const row of rows) {
    if (!fs.existsSync(row.storage_path)) result.missingFiles++
  }
}

/** 执行一轮垃圾清理，返回清理结果 */
export function runGc(): GcResult {
  const result: GcResult = { chunkDirs: 0, chunkRows: 0, orphanFiles: 0, freedBytes: 0, missingFiles: 0 }
  try {
    cleanupChunks(ttlCutoff(CHUNK_TTL_HOURS), result)
    cleanupChunkRows(result)
    cleanupOrphanFiles(ttlCutoff(ORPHAN_TTL_HOURS), result)
    countMissingFiles(result)
  } catch (err) {
    writeError(err as Error, 'gc: runGc')
    return result
  }
  const touched = result.chunkDirs + result.chunkRows + result.orphanFiles
  if (touched > 0) {
    console.log(
      `[WebFtp] 垃圾清理：分片目录 ${result.chunkDirs} 个、分片记录 ${result.chunkRows} 行、` +
        `孤儿文件 ${result.orphanFiles} 个，释放 ${formatBytes(result.freedBytes)}`,
    )
  }
  if (result.missingFiles > 0) {
    console.warn(`[WebFtp] 有 ${result.missingFiles} 条文件记录在磁盘上已找不到对应文件，请人工确认`)
  }
  return result
}
