import type { Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { getDb } from './db.js'

/** 统一 API 响应 */
export function ok<T>(res: Response, data: T, message = 'ok'): void {
  res.json({ code: 0, message, data })
}

export function fail(res: Response, message: string, code = 1, status = 400): void {
  res.status(status).json({ code, message, data: null })
}

/** JWT 签发 */
export function signToken(userId: string, role: string): string {
  const secret = process.env.JWT_SECRET || 'webftp-default-secret-change-me'
  return jwt.sign({ id: userId, role }, secret, { expiresIn: '7d' })
}

export function verifyToken(token: string): { id: string; role: string } | null {
  try {
    const secret = process.env.JWT_SECRET || 'webftp-default-secret-change-me'
    const payload = jwt.verify(token, secret) as { id: string; role: string }
    return payload
  } catch {
    return null
  }
}

/** 密码哈希 */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

export function comparePassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash)
}

/** 生成随机 token */
export function genToken(len = 16): string {
  return nanoid(len)
}

/** 格式化字节 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/** 安全扩展名黑名单（防止可执行脚本被上传后直接访问） */
const FORBIDDEN_EXT = new Set(['.exe', '.bat', '.cmd', '.ps1', '.sh', '.vbs', '.msi'])

export function isForbiddenExt(ext: string): boolean {
  return FORBIDDEN_EXT.has(ext.toLowerCase())
}

/** 通过扩展名获取文件类型分类 */
export function getFileCategory(mimeType: string, ext: string): 'image' | 'video' | 'audio' | 'doc' | 'archive' | 'other' {
  const e = ext.toLowerCase()
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'].includes(e)) return 'doc'
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(e)) return 'archive'
  return 'other'
}

/** 校验用户是否需要强制改密 */
export function needForceChangePassword(userId: string): boolean {
  const db = getDb()
  const row = db
    .prepare('SELECT value FROM config WHERE key = ?')
    .get(`force_change_password:${userId}`) as { value: string } | undefined
  return row?.value === '1'
}

/** 清除强制改密标记 */
export function clearForceChangePassword(userId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM config WHERE key = ?').run(`force_change_password:${userId}`)
}
