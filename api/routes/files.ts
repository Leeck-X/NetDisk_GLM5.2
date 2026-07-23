import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import archiver from 'archiver'
import { nanoid } from 'nanoid'
import { getDb, userStorageDir, CHUNKS_DIR, STORAGE_DIR } from '../db.js'
import { ok, fail, isForbiddenExt, getFileCategory } from '../utils.js'
import type { AuthRequest } from '../middleware.js'
import { authRequired } from '../middleware.js'

const router = Router()
router.use(authRequired)

const DB_FILE_FIELDS = `
  id, user_id as userId, name, type, size, parent_id as parentId,
  mime_type as mimeType, ext, storage_path as storagePath,
  created_at as createdAt, updated_at as updatedAt, deleted, deleted_at as deletedAt, starred
`

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
  const newId = nanoid()
  if (src.type === 'folder') {
    await copyFolderRecursive(src, newId, targetId, req.user!.id)
  } else {
    const oldPath = src.storagePath!
    const newPath = path.join(userStorageDir(req.user!.id), `${nanoid()}${src.ext}`)
    fs.copyFileSync(oldPath, newPath)
    db.prepare(
      `INSERT INTO files (id, user_id, name, type, size, parent_id, mime_type, ext, storage_path) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?)`,
    ).run(newId, req.user!.id, src.name, src.size, targetId || null, src.mimeType, src.ext, newPath)
  }
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
        `INSERT INTO files (id, user_id, name, type, size, parent_id, mime_type, ext, storage_path) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?)`,
      ).run(childNewId, userId, child.name, child.size, newId, child.mimeType, child.ext, newPath)
    }
  }
}

/** 移入回收站 */
router.post('/delete', (req: AuthRequest, res) => {
  const { ids } = req.body as { ids: string[] }
  if (!ids || ids.length === 0) {
    fail(res, '未选择文件')
    return
  }
  const db = getDb()
  const stmt = db.prepare(`UPDATE files SET deleted = 1, deleted_at = datetime('now') WHERE id = ? AND user_id = ?`)
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(id, req.user!.id)
  })
  tx()
  ok(res, null, '已移入回收站')
})

/** 恢复 */
router.post('/restore', (req: AuthRequest, res) => {
  const { ids } = req.body as { ids: string[] }
  const db = getDb()
  const stmt = db.prepare(`UPDATE files SET deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?`)
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(id, req.user!.id)
  })
  tx()
  ok(res, null, '已恢复')
})

/** 彻底删除 */
router.post('/purge', (req: AuthRequest, res) => {
  const { ids } = req.body as { ids: string[] }
  const db = getDb()
  const files = db.prepare(`SELECT storage_path FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id = ?`).all(...ids, req.user!.id) as { storage_path: string | null }[]
  // 删除磁盘文件
  for (const f of files) {
    if (f.storage_path && fs.existsSync(f.storage_path)) {
      try { fs.unlinkSync(f.storage_path) } catch { /* ignore */ }
    }
  }
  db.prepare(`DELETE FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id = ?`).run(...ids, req.user!.id)
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

/** 清空回收站 */
router.post('/trash/clear', (req: AuthRequest, res) => {
  const db = getDb()
  const files = db.prepare(`SELECT storage_path FROM files WHERE user_id = ? AND deleted = 1 AND type = 'file'`).all(req.user!.id) as { storage_path: string | null }[]
  for (const f of files) {
    if (f.storage_path && fs.existsSync(f.storage_path)) {
      try { fs.unlinkSync(f.storage_path) } catch { /* ignore */ }
    }
  }
  db.prepare(`DELETE FROM files WHERE user_id = ? AND deleted = 1`).run(req.user!.id)
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

  // 校验配额
  const db = getDb()
  const user = db.prepare('SELECT used_bytes, quota_bytes FROM users WHERE id = ?').get(req.user!.id) as { used_bytes: number; quota_bytes: number }
  if (user.used_bytes + size > user.quota_bytes) {
    fail(res, '存储空间不足')
    return
  }

  const uploadId = nanoid()
  const tempDir = path.join(CHUNKS_DIR, uploadId)
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  // 已上传分片记录（断点续传）
  const uploaded: number[] = []
  ok(res, { uploadId, uploaded, exist: false })
})

/** 上传分片 */
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = (req.body as { uploadId: string }).uploadId
      const dir = path.join(CHUNKS_DIR, uploadId)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (req, _file, cb) => {
      const idx = (req.body as { chunkIndex: string }).chunkIndex
      cb(null, `chunk-${idx}`)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
})

router.post('/upload/chunk', chunkUpload.single('chunk'), (req: AuthRequest, res) => {
  const { uploadId, chunkIndex } = req.body as { uploadId: string; chunkIndex: string }
  if (!req.file) {
    fail(res, '未收到分片')
    return
  }
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO file_chunks (id, upload_id, chunk_index, temp_path, uploaded) VALUES (?, ?, ?, ?, 1)`,
  ).run(nanoid(), uploadId, parseInt(chunkIndex, 10), req.file.path)
  ok(res, { uploaded: parseInt(chunkIndex, 10) })
})

/** 合并分片完成 */
router.post('/upload/complete', (req: AuthRequest, res) => {
  const { uploadId, name, size, parentId, mimeType, totalChunks } = req.body as {
    uploadId: string
    name: string
    size: number
    parentId: string | null
    mimeType: string
    totalChunks: number
  }
  const tempDir = path.join(CHUNKS_DIR, uploadId)
  if (!fs.existsSync(tempDir)) {
    fail(res, '上传已过期，请重新上传')
    return
  }
  // 校验分片完整性
  for (let i = 0; i < totalChunks; i++) {
    if (!fs.existsSync(path.join(tempDir, `chunk-${i}`))) {
      fail(res, `分片 ${i} 缺失`)
      return
    }
  }
  const ext = path.extname(name).toLowerCase()
  const fileName = `${nanoid()}${ext}`
  const dest = path.join(userStorageDir(req.user!.id), fileName)
  const writeStream = fs.createWriteStream(dest)
  for (let i = 0; i < totalChunks; i++) {
    const chunkBuffer = fs.readFileSync(path.join(tempDir, `chunk-${i}`))
    writeStream.write(chunkBuffer)
  }
  writeStream.end()
  writeStream.on('close', () => {
    // 清理临时分片
    fs.rmSync(tempDir, { recursive: true, force: true })
    const db = getDb()
    db.prepare('DELETE FROM file_chunks WHERE upload_id = ?').run(uploadId)
    const id = nanoid()
    db.prepare(
      `INSERT INTO files (id, user_id, name, type, size, parent_id, mime_type, ext, storage_path) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`,
    ).run(id, req.user!.id, name, size, parentId || null, mimeType || 'application/octet-stream', ext, dest)
    syncUsedBytes(req.user!.id)
    const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ?`).get(id) as AppFile
    ok(res, file, '上传完成')
  })
  writeStream.on('error', (err) => {
    console.error('合并失败', err)
    fail(res, '文件合并失败', 1, 500)
  })
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

/** 同步用户已用空间 */
function syncUsedBytes(userId: string): void {
  const db = getDb()
  const row = db.prepare(`SELECT COALESCE(SUM(size), 0) as total FROM files WHERE user_id = ? AND type = 'file' AND deleted = 0`).get(userId) as { total: number }
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
