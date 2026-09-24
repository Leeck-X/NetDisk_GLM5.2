import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import { pipeline, finished } from 'node:stream/promises'
import multer from 'multer'
import archiver from 'archiver'
import { nanoid } from 'nanoid'
import { getDb, userStorageDir, CHUNKS_DIR, STORAGE_DIR } from '../db.js'
import { ok, fail, isForbiddenExt, getFileCategory, formatBytes } from '../utils.js'
import { getConfigNumber } from '../config.js'
import { createThumb, findThumb } from '../thumbs.js'
import { checkDiskSpace } from '../space.js'
import { activeUploads } from '../gc.js'
import { writeError } from '../logger.js'
import type { AuthRequest } from '../middleware.js'
import { authRequired } from '../middleware.js'

const router = Router()
router.use(authRequired)

const DB_FILE_FIELDS = `
  id, user_id as userId, name, type, size, parent_id as parentId,
  mime_type as mimeType, ext, storage_path as storagePath,
  created_at as createdAt, updated_at as updatedAt, deleted, deleted_at as deletedAt, starred
`

/* ========== 子树与配额工具 ========== */

/** 递归收集若干节点及其全部后代的 id（含自身） */
function collectSubtreeIds(ids: string[], userId: string): string[] {
  if (ids.length === 0) return []
  const db = getDb()
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id = ?
         UNION ALL
         SELECT f.id FROM files f JOIN sub s ON f.parent_id = s.id
       )
       SELECT id FROM sub`,
    )
    .all(...ids, userId) as { id: string }[]
  return rows.map((r) => r.id)
}

/** 递归收集若干节点及其全部后代中位于磁盘上的文件路径 */
function collectSubtreePaths(ids: string[], userId: string): string[] {
  if (ids.length === 0) return []
  const db = getDb()
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id = ?
         UNION ALL
         SELECT f.id FROM files f JOIN sub s ON f.parent_id = s.id
       )
       SELECT storage_path FROM files
       WHERE id IN (SELECT id FROM sub) AND storage_path IS NOT NULL`,
    )
    .all(...ids, userId) as { storage_path: string }[]
  return rows.map((r) => r.storage_path)
}

/** 统计某节点及其后代中所有文件的总大小 */
function subtreeFileSize(id: string): number {
  const db = getDb()
  const row = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM files WHERE id = ?
         UNION ALL
         SELECT f.id FROM files f JOIN sub s ON f.parent_id = s.id
       )
       SELECT COALESCE(SUM(size), 0) as total FROM files
       WHERE id IN (SELECT id FROM sub) AND type = 'file'`,
    )
    .get(id) as { total: number }
  return row.total
}

/** 校验用户配额，通过返回 null，否则返回错误文案 */
function checkQuota(userId: string, bytes: number): string | null {
  const db = getDb()
  const user = db
    .prepare('SELECT used_bytes, quota_bytes FROM users WHERE id = ?')
    .get(userId) as { used_bytes: number; quota_bytes: number } | undefined
  if (!user) return '用户不存在'
  if (user.used_bytes + bytes > user.quota_bytes) return '存储空间不足'
  return null
}

/** 删除磁盘上的文件，失败仅记录不中断 */
function unlinkQuietly(files: string[]): void {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch (err) {
      writeError(err as Error, 'unlinkQuietly')
    }
  }
}

/** 回滚一次失败的复制：删掉以 rootId 为根的整棵新子树（含磁盘文件） */
function rollbackCopy(rootId: string, userId: string): void {
  const db = getDb()
  unlinkQuietly(collectSubtreePaths([rootId], userId))
  try {
    db.prepare('DELETE FROM files WHERE id = ?').run(rootId)
  } catch (err) {
    writeError(err as Error, 'rollbackCopy')
  }
}

/* ========== 上传会话登记 ========== */

interface PendingUpload {
  userId: string
  size: number
  totalChunks: number
  expiresAt: number
}

/** 单次上传的有效期 */
const UPLOAD_TTL_MS = 24 * 3600 * 1000
/** 分片数量上限，防止 complete 阶段的大数循环 */
const MAX_TOTAL_CHUNKS = 20000
/** 分片请求体上限（4MB 分片 + multipart 开销） */
const CHUNK_BODY_LIMIT = 11 * 1024 * 1024
/** 单个分片的大小上限，与 multer limits 保持一致 */
const CHUNK_SIZE_LIMIT = 10 * 1024 * 1024

const pendingUploads = new Map<string, PendingUpload>()

/** uploadId 白名单，避免路径穿越 */
function isValidUploadId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(id)
}

/** 清理过期的上传会话 */
function sweepPendingUploads(): void {
  const now = Date.now()
  for (const [id, info] of pendingUploads) {
    if (info.expiresAt <= now) {
      pendingUploads.delete(id)
      activeUploads.delete(id)
    }
  }
}

/** 单文件大小上限：优先取后台配置 upload_max_size（MB），其次环境变量，默认 2048MB */
function maxUploadBytes(): number {
  const fromConfig = getConfigNumber('upload_max_size')
  const fromEnv = Number(process.env.UPLOAD_MAX_SIZE_MB)
  const mb =
    fromConfig > 0
      ? fromConfig
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? fromEnv
        : 2048
  return mb * 1024 * 1024
}

/** 列出目录 */
router.get('/list', (req: AuthRequest, res) => {
  const parentId = (req.query.parentId as string) || null
  const db = getDb()
  const items = db
    .prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND parent_id IS ? AND deleted = 0 ORDER BY type DESC, name ASC`)
    .all(req.user!.id, parentId) as AppFile[]
  ok(res, items)
})

/** 分类列表 */
router.get('/category/:type', (req: AuthRequest, res) => {
  const type = req.params.type
  const db = getDb()
  let items: AppFile[] = []
  if (type === 'recent') {
    items = db
      .prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND type = 'file' AND deleted = 0 ORDER BY updated_at DESC LIMIT 100`)
      .all(req.user!.id) as AppFile[]
  } else if (type === 'starred') {
    items = db
      .prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND starred = 1 AND deleted = 0 ORDER BY name ASC`)
      .all(req.user!.id) as AppFile[]
  } else {
    // image / video / doc / archive / audio
    const cats: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
      video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
      audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'],
      doc: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/markdown', 'text/csv'],
      archive: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip'],
    }
    const mimes = cats[type] || []
    if (mimes.length === 0) {
      ok(res, [])
      return
    }
    const placeholders = mimes.map(() => '?').join(',')
    items = db
      .prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND type = 'file' AND deleted = 0 AND mime_type IN (${placeholders}) ORDER BY updated_at DESC`)
      .all(req.user!.id, ...mimes) as AppFile[]
  }
  ok(res, items)
})

/** 新建文件夹 */
router.post('/mkdir', (req: AuthRequest, res) => {
  const { name, parentId } = req.body as { name: string; parentId: string | null }
  if (!name || !name.trim()) {
    fail(res, '请输入文件夹名称')
    return
  }
  const db = getDb()
  const id = nanoid()
  db.prepare(
    `INSERT INTO files (id, user_id, name, type, parent_id) VALUES (?, ?, ?, 'folder', ?)`,
  ).run(id, req.user!.id, name.trim(), parentId || null)
  const folder = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ?`).get(id) as AppFile
  ok(res, folder, '文件夹已创建')
})

/** 重命名 */
router.post('/rename', (req: AuthRequest, res) => {
  const { id, name } = req.body as { id: string; name: string }
  if (!name || !name.trim()) {
    fail(res, '请输入名称')
    return
  }
  const db = getDb()
  const file = db.prepare('SELECT user_id FROM files WHERE id = ?').get(id) as { user_id: string } | undefined
  if (!file || file.user_id !== req.user!.id) {
    fail(res, '文件不存在或无权限', 403, 403)
    return
  }
  const ext = path.extname(name)
  db.prepare(`UPDATE files SET name = ?, ext = ?, updated_at = datetime('now') WHERE id = ?`).run(name.trim(), ext.toLowerCase(), id)
  ok(res, null, '已重命名')
})

/** 移动 */
router.post('/move', (req: AuthRequest, res) => {
  const { ids, targetId } = req.body as { ids: string[]; targetId: string | null }
  if (!ids || ids.length === 0) {
    fail(res, '未选择文件')
    return
  }
  const db = getDb()
  const stmt = db.prepare(`UPDATE files SET parent_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
  const tx = db.transaction(() => {
    for (const id of ids) {
      if (id === targetId) continue
      stmt.run(targetId || null, id, req.user!.id)
    }
  })
  tx()
  ok(res, null, '已移动')
})

/** 复制（仅文件，文件夹复制递归处理） */
router.post('/copy', async (req: AuthRequest, res) => {
  const { id, targetId } = req.body as { id: string; targetId: string | null }
  const db = getDb()
  const src = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ? AND user_id = ?`).get(id, req.user!.id) as AppFile | undefined
  if (!src) {
    fail(res, '文件不存在', 404, 404)
    return
  }
  // 复制会真实占用空间，必须先校验配额与磁盘余量
  const totalBytes = src.type === 'folder' ? subtreeFileSize(src.id) : src.size
  const quotaErr = checkQuota(req.user!.id, totalBytes)
  if (quotaErr) {
    fail(res, quotaErr)
    return
  }
  const space = checkDiskSpace(totalBytes)
  if (!space.ok) {
    fail(res, space.message!, 1, 507)
    return
  }

  const newId = nanoid()
  let copiedPath: string | null = null
  try {
    if (src.type === 'folder') {
      await copyFolderRecursive(src, newId, targetId, req.user!.id)
    } else {
      const oldPath = src.storagePath!
      const newPath = path.join(userStorageDir(req.user!.id), `${nanoid()}${src.ext}`)
      copiedPath = newPath
      fs.copyFileSync(oldPath, newPath)
      db.prepare(
        `INSERT INTO files (id, user_id, name, type, size, parent_id, mime_type, ext, storage_path) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`,
      ).run(newId, req.user!.id, src.name, src.size, targetId || null, src.mimeType, src.ext, newPath)
    }
  } catch (err) {
    // 失败必须回滚：否则留下半棵子树与磁盘残片，配额却未同步
    rollbackCopy(newId, req.user!.id)
    if (copiedPath) unlinkQuietly([copiedPath])
    writeError(err as Error, 'copy')
    const enospc = (err as NodeJS.ErrnoException).code === 'ENOSPC'
    fail(res, enospc ? '服务器磁盘空间不足，复制失败' : '复制失败', 1, enospc ? 507 : 500)
    return
  }
  syncUsedBytes(req.user!.id)
  ok(res, null, '已复制')
})

async function copyFolderRecursive(src: AppFile, newId: string, parentId: string | null, userId: string): Promise<void> {
  const db = getDb()
  db.prepare(
    `INSERT INTO files (id, user_id, name, type, parent_id) VALUES (?, ?, ?, 'folder', ?)`,
  ).run(newId, userId, src.name, parentId || null)
  const children = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE parent_id = ? AND deleted = 0`).all(src.id) as AppFile[]
  for (const child of children) {
    const childNewId = nanoid()
    if (child.type === 'folder') {
      await copyFolderRecursive(child, childNewId, newId, userId)
    } else {
      const oldPath = child.storagePath!
      const newPath = path.join(userStorageDir(userId), `${nanoid()}${child.ext}`)
      fs.copyFileSync(oldPath, newPath)
      db.prepare(
        `INSERT INTO files (id, user_id, name, type, size, parent_id, mime_type, ext, storage_path) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`,
      ).run(childNewId, userId, child.name, child.size, newId, child.mimeType, child.ext, newPath)
    }
  }
}

/** 移入回收站（必须连同整棵子树，否则子项会变成不可见的孤儿占着磁盘） */
router.post('/delete', (req: AuthRequest, res) => {
  const { ids } = req.body as { ids: string[] }
  if (!ids || ids.length === 0) {
    fail(res, '未选择文件')
    return
  }
  const db = getDb()
  const allIds = collectSubtreeIds(ids, req.user!.id)
  if (allIds.length === 0) {
    ok(res, null, '已移入回收站')
    return
  }
  const stmt = db.prepare(`UPDATE files SET deleted = 1, deleted_at = datetime('now') WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const id of allIds) stmt.run(id)
  })
  tx()
  ok(res, null, '已移入回收站')
})

/** 恢复（与 delete 对称：整棵子树一起恢复，否则子项会继续停留在回收站） */
router.post('/restore', (req: AuthRequest, res) => {
  const { ids } = req.body as { ids: string[] }
  if (!ids || ids.length === 0) {
    fail(res, '未选择文件')
    return
  }
  const db = getDb()
  const allIds = collectSubtreeIds(ids, req.user!.id)
  if (allIds.length === 0) {
    ok(res, null, '已恢复')
    return
  }
  const stmt = db.prepare(`UPDATE files SET deleted = 0, deleted_at = NULL WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const id of allIds) stmt.run(id)
  })
  tx()
  ok(res, null, '已恢复')
})

/** 彻底删除（连同整棵子树：外键级联会静默删掉子行，必须先取磁盘路径） */
router.post('/purge', (req: AuthRequest, res) => {
  const { ids } = req.body as { ids: string[] }
  if (!ids || ids.length === 0) {
    fail(res, '未选择文件')
    return
  }
  const db = getDb()
  const paths = collectSubtreePaths(ids, req.user!.id)
  const allIds = collectSubtreeIds(ids, req.user!.id)
  if (allIds.length === 0) {
    ok(res, null, '已彻底删除')
    return
  }
  // 先删磁盘、再删记录，顺序反了就再也找不到文件路径
  unlinkQuietly(paths)
  const stmt = db.prepare(`DELETE FROM files WHERE id = ? AND user_id = ?`)
  const tx = db.transaction(() => {
    for (const id of allIds) stmt.run(id, req.user!.id)
  })
  tx()
  // 同步用户配额
  syncUsedBytes(req.user!.id)
  ok(res, null, '已彻底删除')
})

/** 回收站列表 */
router.get('/trash', (req: AuthRequest, res) => {
  const db = getDb()
  const items = db
    .prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND deleted = 1 ORDER BY deleted_at DESC`)
    .all(req.user!.id) as AppFile[]
  ok(res, items)
})

/** 清空回收站（回收站里全是 deleted=1 的行，直接取它们的子树路径即可） */
router.post('/trash/clear', (req: AuthRequest, res) => {
  const db = getDb()
  const rows = db.prepare(`SELECT id FROM files WHERE user_id = ? AND deleted = 1`).all(req.user!.id) as { id: string }[]
  if (rows.length === 0) {
    ok(res, null, '回收站已清空')
    return
  }
  const ids = rows.map((r) => r.id)
  const paths = collectSubtreePaths(ids, req.user!.id)
  unlinkQuietly(paths)
  const stmt = db.prepare(`DELETE FROM files WHERE id = ? AND user_id = ?`)
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(id, req.user!.id)
  })
  tx()
  syncUsedBytes(req.user!.id)
  ok(res, null, '回收站已清空')
})

/** 收藏/取消收藏 */
router.post('/star', (req: AuthRequest, res) => {
  const { id, starred } = req.body as { id: string; starred: boolean }
  const db = getDb()
  db.prepare(`UPDATE files SET starred = ? WHERE id = ? AND user_id = ?`).run(starred ? 1 : 0, id, req.user!.id)
  ok(res, null, starred ? '已收藏' : '已取消收藏')
})

/** 搜索 */
router.get('/search', (req: AuthRequest, res) => {
  const q = (req.query.q as string || '').trim()
  if (!q) {
    ok(res, [])
    return
  }
  const db = getDb()
  const items = db
    .prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND deleted = 0 AND name LIKE ? ORDER BY updated_at DESC LIMIT 100`)
    .all(req.user!.id, `%${q}%`) as AppFile[]
  ok(res, items)
})

/* ========== 分片上传 ========== */

interface InitUploadBody {
  name: string
  size: number
  parentId: string | null
  chunkSize: number
  totalChunks: number
  mimeType: string
  hash?: string
}

/** 初始化分片上传 */
router.post('/upload/init', (req: AuthRequest, res) => {
  const { name, size, parentId, chunkSize, totalChunks, mimeType, hash } = req.body as InitUploadBody
  if (!name || !size || !totalChunks || !chunkSize) {
    fail(res, '参数不完整')
    return
  }
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(chunkSize) || chunkSize <= 0 || !Number.isFinite(totalChunks)) {
    fail(res, '参数不合法')
    return
  }
  const ext = path.extname(name).toLowerCase()
  if (isForbiddenExt(ext)) {
    fail(res, '不允许上传此类型文件')
    return
  }

  // 秒传：hash 命中
  if (hash) {
    const db = getDb()
    const existing = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE user_id = ? AND name = ? AND size = ? AND deleted = 0`).get(req.user!.id, name, size) as AppFile | undefined
    if (existing && existing.storagePath && fs.existsSync(existing.storagePath)) {
      ok(res, { uploadId: '', uploaded: [], exist: true })
      return
    }
  }

  // 分片参数必须自洽，否则后续按 totalChunks 循环校验会失去意义
  if (totalChunks !== Math.ceil(size / chunkSize)) {
    fail(res, '分片参数不一致')
    return
  }
  if (totalChunks > MAX_TOTAL_CHUNKS) {
    fail(res, '文件过大，请减少分片数量')
    return
  }
  const limit = maxUploadBytes()
  if (size > limit) {
    fail(res, `单文件不能超过 ${formatBytes(limit)}`)
    return
  }

  // 校验配额
  const quotaErr = checkQuota(req.user!.id, size)
  if (quotaErr) {
    fail(res, quotaErr)
    return
  }
  // 校验磁盘空间：分片会先落到 data/chunks，写满同样是不可恢复的
  const space = checkDiskSpace(size)
  if (!space.ok) {
    fail(res, space.message!, 1, 507)
    return
  }

  sweepPendingUploads()
  const uploadId = nanoid()
  const tempDir = path.join(CHUNKS_DIR, uploadId)
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  pendingUploads.set(uploadId, {
    userId: req.user!.id,
    size,
    totalChunks,
    expiresAt: Date.now() + UPLOAD_TTL_MS,
  })
  activeUploads.add(uploadId)
  // 已上传分片记录（断点续传）
  const uploaded: number[] = []
  ok(res, { uploadId, uploaded, exist: false })
})

/** 分片请求预检：此时 multipart 还没解析，只能依赖 Content-Length 拦截超大请求 */
function precheckChunk(req: AuthRequest, res: Response, next: NextFunction): void {
  const len = Number(req.headers['content-length'])
  if (Number.isFinite(len) && len > CHUNK_BODY_LIMIT) {
    fail(res, '分片过大', 1, 413)
    return
  }
  if (Number.isFinite(len) && len > 0) {
    const space = checkDiskSpace(len, CHUNKS_DIR)
    if (!space.ok) {
      fail(res, space.message!, 1, 507)
      return
    }
  }
  next()
}

/** 上传分片 */
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = (req.body as { uploadId?: string }).uploadId || ''
      // 白名单校验，否则 uploadId 里的 ../ 可以把分片写到任意目录
      if (!isValidUploadId(uploadId)) {
        cb(new Error('上传标识不合法'), '')
        return
      }
      const dir = path.join(CHUNKS_DIR, uploadId)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (req, _file, cb) => {
      const idx = String((req.body as { chunkIndex?: string }).chunkIndex ?? '')
      if (!/^\d{1,6}$/.test(idx)) {
        cb(new Error('分片序号不合法'), '')
        return
      }
      cb(null, `chunk-${idx}`)
    },
  }),
  limits: { fileSize: CHUNK_SIZE_LIMIT },
})

router.post('/upload/chunk', precheckChunk, chunkUpload.single('chunk'), (req: AuthRequest, res) => {
  const { uploadId, chunkIndex } = req.body as { uploadId: string; chunkIndex: string }
  if (!req.file) {
    fail(res, '未收到分片')
    return
  }
  const dropChunk = () => {
    try { fs.rmSync(req.file!.path, { force: true }) } catch { /* ignore */ }
  }
  // 必须是 init 登记过的会话，否则任何人都能无限写分片把磁盘塞满
  const pending = pendingUploads.get(uploadId)
  if (!pending || pending.userId !== req.user!.id) {
    dropChunk()
    // multer 落盘时已建好 chunks/<uploadId>/，未登记的会话要连目录一起清掉，避免留下孤儿目录
    // 仅在会话完全不存在时清理；他人会话（userId 不匹配）不动，防止误删进行中的上传
    if (!pending && isValidUploadId(uploadId)) {
      try {
        fs.rmSync(path.join(CHUNKS_DIR, uploadId), { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    fail(res, '上传已过期，请重新上传', 404, 404)
    return
  }
  const idx = Number.parseInt(chunkIndex, 10)
  if (!Number.isInteger(idx) || idx < 0 || idx >= pending.totalChunks) {
    dropChunk()
    fail(res, '分片序号越界')
    return
  }
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO file_chunks (id, upload_id, chunk_index, temp_path, uploaded) VALUES (?, ?, ?, ?, 1)`,
  ).run(nanoid(), uploadId, idx, req.file.path)
  ok(res, { uploaded: idx })
})

/** 合并分片完成 */
router.post('/upload/complete', async (req: AuthRequest, res) => {
  const { uploadId, name, parentId, mimeType } = req.body as {
    uploadId: string
    name: string
    size?: number
    parentId: string | null
    mimeType: string
    totalChunks?: number
  }
  // 一切以服务端登记的会话为准，客户端传来的 size/totalChunks 一概不采信
  const pending = pendingUploads.get(uploadId)
  if (!pending || pending.userId !== req.user!.id) {
    fail(res, '上传已过期，请重新上传', 404, 404)
    return
  }
  if (!name) {
    fail(res, '参数不完整')
    return
  }
  const ext = path.extname(name).toLowerCase()
  if (isForbiddenExt(ext)) {
    fail(res, '不允许上传此类型文件')
    return
  }
  const tempDir = path.join(CHUNKS_DIR, uploadId)
  if (!fs.existsSync(tempDir)) {
    fail(res, '上传已过期，请重新上传', 404, 404)
    return
  }
  // 按实际字节数核对，避免"少传也能入库"导致配额与真实占用长期不一致
  let actualBytes = 0
  for (let i = 0; i < pending.totalChunks; i++) {
    try {
      actualBytes += fs.statSync(path.join(tempDir, `chunk-${i}`)).size
    } catch {
      fail(res, `分片 ${i} 缺失`)
      return
    }
  }
  if (actualBytes !== pending.size) {
    fail(res, '上传数据不完整，请重新上传')
    return
  }
  const space = checkDiskSpace(actualBytes, STORAGE_DIR)
  if (!space.ok) {
    fail(res, space.message!, 1, 507)
    return
  }

  const dest = path.join(userStorageDir(req.user!.id), `${nanoid()}${ext}`)
  const out = fs.createWriteStream(dest)
  try {
    // 逐片流式合并、边合并边删：内存占用恒定，中途失败也不会留下整份临时副本
    for (let i = 0; i < pending.totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk-${i}`)
      await pipeline(fs.createReadStream(chunkPath), out, { end: false })
      fs.rmSync(chunkPath, { force: true })
    }
    out.end()
    await finished(out)
  } catch (err) {
    out.destroy()
    try { fs.rmSync(dest, { force: true }) } catch { /* ignore */ }
    writeError(err as Error, 'upload/complete')
    fail(res, '文件合并失败', 1, 500)
    return
  }

  try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  pendingUploads.delete(uploadId)
  activeUploads.delete(uploadId)

  const db = getDb()
  db.prepare('DELETE FROM file_chunks WHERE upload_id = ?').run(uploadId)
  const id = nanoid()
  db.prepare(
    `INSERT INTO files (id, user_id, name, type, size, parent_id, mime_type, ext, storage_path) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`,
  ).run(id, req.user!.id, name, actualBytes, parentId || null, mimeType || 'application/octet-stream', ext, dest)
  syncUsedBytes(req.user!.id)
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ?`).get(id) as AppFile
  ok(res, file, '上传完成')
})

/** 下载文件 */
router.get('/download', (req: AuthRequest, res) => {
  const id = req.query.id as string
  const db = getDb()
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ? AND user_id = ?`).get(id, req.user!.id) as AppFile | undefined
  if (!file || file.type !== 'file') {
    fail(res, '文件不存在', 404, 404)
    return
  }
  if (!file.storagePath || !fs.existsSync(file.storagePath)) {
    fail(res, '文件已丢失', 404, 404)
    return
  }
  res.download(file.storagePath, file.name)
})

/** 打包下载文件夹 */
router.get('/download/folder', (req: AuthRequest, res) => {
  const id = req.query.id as string
  const db = getDb()
  const folder = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ? AND user_id = ?`).get(id, req.user!.id) as AppFile | undefined
  if (!folder || folder.type !== 'folder') {
    fail(res, '文件夹不存在', 404, 404)
    return
  }
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folder.name)}.zip"`)
  const archive = archiver('zip', { zlib: { level: 5 } })
  archive.on('error', (err) => {
    console.error(err)
    fail(res, '打包失败', 1, 500)
  })
  archive.pipe(res)
  appendFolderToArchive(archive, folder.id, folder.name, req.user!.id)
  archive.finalize()
})

function appendFolderToArchive(archive: archiver.Archiver, folderId: string, folderName: string, userId: string): void {
  const db = getDb()
  const children = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE parent_id = ? AND deleted = 0`).all(folderId) as AppFile[]
  for (const child of children) {
    if (child.type === 'folder') {
      appendFolderToArchive(archive, child.id, path.join(folderName, child.name), userId)
    } else if (child.storagePath && fs.existsSync(child.storagePath)) {
      archive.file(child.storagePath, { name: path.join(folderName, child.name) })
    }
  }
}

/** 预览（图片/视频/音频/PDF） */
router.get('/preview', (req: AuthRequest, res) => {
  const id = req.query.id as string
  const db = getDb()
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ? AND user_id = ?`).get(id, req.user!.id) as AppFile | undefined
  if (!file || file.type !== 'file') {
    fail(res, '文件不存在', 404, 404)
    return
  }
  if (!file.storagePath || !fs.existsSync(file.storagePath)) {
    fail(res, '文件已丢失', 404, 404)
    return
  }
  const category = getFileCategory(file.mimeType, file.ext)
  if (!['image', 'video', 'audio'].includes(category) && file.mimeType !== 'application/pdf') {
    fail(res, '此文件不支持预览')
    return
  }
  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  fs.createReadStream(file.storagePath).pipe(res)
})

/**
 * 缩略图（列表/详情专用）
 * 原图动辄数 MB，列表一次要加载十几张，这里统一改走小尺寸 WebP 缓存。
 */
router.get('/thumb', async (req: AuthRequest, res) => {
  const id = req.query.id as string
  const db = getDb()
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ? AND user_id = ?`).get(id, req.user!.id) as AppFile | undefined
  if (!file || file.type !== 'file') {
    fail(res, '文件不存在', 404, 404)
    return
  }
  if (!file.storagePath || !fs.existsSync(file.storagePath)) {
    fail(res, '文件已丢失', 404, 404)
    return
  }
  if (getFileCategory(file.mimeType, file.ext) !== 'image') {
    fail(res, '此文件不支持生成缩略图')
    return
  }
  // 缓存键带上更新时间：原图被替换后旧缩略图自动失效
  const stamp = String(new Date(file.updatedAt).getTime() || 0)
  const target = findThumb(file.id, stamp) || (await createThumb(file.storagePath, file.id, stamp))
  if (!target) {
    // sharp 不可用时回退为原图，保证前端仍能显示
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=600')
    fs.createReadStream(file.storagePath).pipe(res)
    return
  }
  res.setHeader('Content-Type', 'image/webp')
  res.setHeader('Cache-Control', 'private, max-age=86400')
  fs.createReadStream(target).pipe(res)
})

/** 同步用户已用空间（口径含回收站：回收站里的文件同样占着磁盘） */
function syncUsedBytes(userId: string): void {
  const db = getDb()
  const row = db.prepare(`SELECT COALESCE(SUM(size), 0) as total FROM files WHERE user_id = ? AND type = 'file'`).get(userId) as { total: number }
  db.prepare('UPDATE users SET used_bytes = ? WHERE id = ?').run(row.total, userId)
}

export interface AppFile {
  id: string
  userId: string
  name: string
  type: 'file' | 'folder'
  size: number
  parentId: string | null
  mimeType: string | null
  ext: string | null
  storagePath: string | null
  createdAt: string
  updatedAt: string
  deleted: number
  deletedAt: string | null
  starred: number
}

export default router
