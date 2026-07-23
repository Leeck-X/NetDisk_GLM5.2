import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { nanoid } from 'nanoid'
import archiver from 'archiver'
import { getDb } from '../db.js'
import { ok, fail, hashPassword, comparePassword, genToken } from '../utils.js'
import type { AuthRequest } from '../middleware.js'
import { authRequired } from '../middleware.js'
import type { AppFile } from './files.js'

const router = Router()

const DB_FILE_FIELDS = `
  id, user_id as userId, name, type, size, parent_id as parentId,
  mime_type as mimeType, ext, storage_path as storagePath,
  created_at as createdAt, updated_at as updatedAt, deleted, deleted_at as deletedAt, starred
`

/** 我的分享列表 */
router.get('/', authRequired, (req: AuthRequest, res) => {
  const db = getDb()
  const items = db.prepare(`
    SELECT s.id, s.token, s.file_id as fileId, s.user_id as userId, s.password_hash as hasPassword,
           s.expire_at as expireAt, s.download_limit as downloadLimit, s.downloads, s.created_at as createdAt,
           f.name as fileName, f.type as fileType, f.size as fileSize
    FROM shares s JOIN files f ON s.file_id = f.id
    WHERE s.user_id = ? ORDER BY s.created_at DESC
  `).all(req.user!.id)
  // hasPassword 转布尔
  const result = items.map((it: any) => ({ ...it, hasPassword: !!it.hasPassword }))
  ok(res, result)
})

/** 创建分享 */
router.post('/', authRequired, (req: AuthRequest, res) => {
  const { fileId, password, expireDays, downloadLimit } = req.body as {
    fileId: string
    password?: string
    expireDays?: number
    downloadLimit?: number
  }
  const db = getDb()
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ? AND user_id = ? AND deleted = 0`).get(fileId, req.user!.id) as AppFile | undefined
  if (!file) {
    fail(res, '文件不存在', 404, 404)
    return
  }
  const id = nanoid()
  const token = genToken(16)
  const passwordHash = password ? hashPassword(password) : null
  const expireAt = expireDays && expireDays > 0
    ? new Date(Date.now() + expireDays * 24 * 3600 * 1000).toISOString()
    : null
  db.prepare(
    `INSERT INTO shares (id, token, file_id, user_id, password_hash, expire_at, download_limit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, token, fileId, req.user!.id, passwordHash, expireAt, downloadLimit || null)
  ok(res, { id, token, expireAt, downloadLimit: downloadLimit || null, hasPassword: !!password }, '分享链接已生成')
})

/** 删除分享 */
router.delete('/:id', authRequired, (req: AuthRequest, res) => {
  const id = req.params.id
  const db = getDb()
  const result = db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(id, req.user!.id)
  if (result.changes === 0) {
    fail(res, '分享不存在', 404, 404)
    return
  }
  ok(res, null, '已取消分享')
})

/** 访客：校验提取码 */
router.post('/verify', (req, res) => {
  const { token, password } = req.body as { token: string; password?: string }
  if (!token) {
    fail(res, '无效的分享链接')
    return
  }
  const db = getDb()
  const share = db.prepare(`
    SELECT s.id, s.token, s.password_hash, s.expire_at, s.download_limit, s.downloads, f.id as fileId
    FROM shares s JOIN files f ON s.file_id = f.id
    WHERE s.token = ? AND f.deleted = 0
  `).get(token) as
    | { id: string; token: string; password_hash: string | null; expire_at: string | null; download_limit: number | null; downloads: number; fileId: string }
    | undefined
  if (!share) {
    fail(res, '分享不存在或已失效')
    return
  }
  if (share.expire_at && new Date(share.expire_at) < new Date()) {
    fail(res, '分享已过期')
    return
  }
  if (share.download_limit && share.downloads >= share.download_limit) {
    fail(res, '下载次数已用尽')
    return
  }
  if (share.password_hash) {
    if (!password || !comparePassword(password, share.password_hash)) {
      fail(res, '提取码错误')
      return
    }
  }
  ok(res, { needPassword: false, verified: true, token: share.token })
})

/** 访客：获取分享内容 */
router.get('/:token', (req, res) => {
  const token = req.params.token
  const db = getDb()
  const share = db.prepare(`
    SELECT s.id, s.token, s.password_hash as hasPassword, s.expire_at, s.download_limit, s.downloads, s.created_at, f.id as fileId
    FROM shares s JOIN files f ON s.file_id = f.id
    WHERE s.token = ? AND f.deleted = 0
  `).get(token) as
    | { id: string; token: string; hasPassword: string | null; expire_at: string | null; download_limit: number | null; downloads: number; created_at: string; fileId: string }
    | undefined
  if (!share) {
    fail(res, '分享不存在或已失效', 404, 404)
    return
  }
  if (share.expire_at && new Date(share.expire_at) < new Date()) {
    fail(res, '分享已过期')
    return
  }
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ?`).get(share.fileId) as AppFile
  ok(res, {
    token: share.token,
    hasPassword: !!share.hasPassword,
    expireAt: share.expire_at,
    downloadLimit: share.download_limit,
    downloads: share.downloads,
    createdAt: share.created_at,
    file: {
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      ext: file.ext,
      mimeType: file.mimeType,
    },
  })
})

/** 访客：下载分享文件 */
router.get('/download/:token', (req, res) => {
  const token = req.params.token
  const password = (req.query.password as string) || undefined
  const db = getDb()
  const share = db.prepare(`
    SELECT s.id, s.password_hash, s.expire_at, s.download_limit, s.downloads, f.id as fileId, f.name, f.type
    FROM shares s JOIN files f ON s.file_id = f.id
    WHERE s.token = ? AND f.deleted = 0
  `).get(token) as
    | { id: string; password_hash: string | null; expire_at: string | null; download_limit: number | null; downloads: number; fileId: string; name: string; type: string }
    | undefined
  if (!share) {
    fail(res, '分享不存在或已失效', 404, 404)
    return
  }
  if (share.expire_at && new Date(share.expire_at) < new Date()) {
    fail(res, '分享已过期')
    return
  }
  if (share.download_limit && share.downloads >= share.download_limit) {
    fail(res, '下载次数已用尽')
    return
  }
  if (share.password_hash) {
    if (!password || !comparePassword(password, share.password_hash)) {
      fail(res, '提取码错误', 403, 403)
      return
    }
  }
  const file = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE id = ?`).get(share.fileId) as AppFile
  if (!file.storagePath || !fs.existsSync(file.storagePath)) {
    fail(res, '文件已丢失', 404, 404)
    return
  }
  if (file.type === 'folder') {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}.zip"`)
    const archive = archiver('zip', { zlib: { level: 5 } })
    archive.on('error', () => fail(res, '打包失败', 1, 500))
    archive.pipe(res)
    appendFolderToArchive(archive, file.id, file.name)
    archive.finalize()
  } else {
    db.prepare('UPDATE shares SET downloads = downloads + 1 WHERE id = ?').run(share.id)
    res.download(file.storagePath, file.name)
  }
})

function appendFolderToArchive(archive: archiver.Archiver, folderId: string, folderName: string): void {
  const db = getDb()
  const children = db.prepare(`SELECT ${DB_FILE_FIELDS} FROM files WHERE parent_id = ? AND deleted = 0`).all(folderId) as AppFile[]
  for (const child of children) {
    if (child.type === 'folder') {
      appendFolderToArchive(archive, child.id, path.join(folderName, child.name))
    } else if (child.storagePath && fs.existsSync(child.storagePath)) {
      archive.file(child.storagePath, { name: path.join(folderName, child.name) })
    }
  }
}

export default router
