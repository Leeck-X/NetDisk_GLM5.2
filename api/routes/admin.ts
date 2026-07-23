import { Router } from 'express'
import { nanoid } from 'nanoid'
import { getDb, STORAGE_DIR, getSuperAdminId, isSuperAdmin } from '../db.js'
import { ok, fail, hashPassword, formatBytes } from '../utils.js'
import type { AuthRequest } from '../middleware.js'
import { authRequired, adminOnly } from '../middleware.js'
import fs from 'fs'

const router = Router()
router.use(authRequired, adminOnly)

/** 用户列表 */
router.get('/users', (req: AuthRequest, res) => {
  const db = getDb()
  const superId = getSuperAdminId()
  const users = db.prepare(`
    SELECT id, username, role, quota_bytes, used_bytes, enabled, created_at
    FROM users ORDER BY created_at ASC
  `).all() as Array<{
    id: string
    username: string
    role: string
    quota_bytes: number
    used_bytes: number
    enabled: number
    created_at: string
  }>
  ok(res, users.map((u) => ({
    ...u,
    enabled: !!u.enabled,
    quotaBytes: u.quota_bytes,
    usedBytes: u.used_bytes,
    quotaHuman: formatBytes(u.quota_bytes),
    usedHuman: formatBytes(u.used_bytes),
    usedPercent: u.quota_bytes > 0 ? Math.min(100, Math.round((u.used_bytes / u.quota_bytes) * 100)) : 0,
    isSuper: u.id === superId,
  })))
})

/** 创建用户 */
router.post('/users', (req: AuthRequest, res) => {
  const { username, password, role, quotaBytes } = req.body as {
    username: string
    password: string
    role?: string
    quotaBytes?: number
  }
  if (!username || !password) {
    fail(res, '请填写用户名和密码')
    return
  }
  if (password.length < 6) {
    fail(res, '密码至少 6 位')
    return
  }
  const db = getDb()
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim()) as { id: string } | undefined
  if (exists) {
    fail(res, '用户名已存在')
    return
  }
  const id = nanoid()
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, quota_bytes) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, username.trim(), hashPassword(password), role || 'user', quotaBytes || 10 * 1024 * 1024 * 1024)
  ok(res, { id, username: username.trim() }, '用户已创建')
})

/** 更新用户（密码/配额/状态/角色） */
router.patch('/users/:id', (req: AuthRequest, res) => {
  const id = req.params.id
  const { password, quotaBytes, enabled, role } = req.body as {
    password?: string
    quotaBytes?: number
    enabled?: boolean
    role?: string
  }
  const db = getDb()
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as { id: string } | undefined
  if (!user) {
    fail(res, '用户不存在', 404, 404)
    return
  }

  // 超级管理员保护：不可降级、不可禁用
  if (isSuperAdmin(id)) {
    if (role && role !== 'admin') {
      fail(res, '超级管理员不可降级', 403, 403)
      return
    }
    if (enabled === false) {
      fail(res, '超级管理员不可禁用', 403, 403)
      return
    }
  }

  if (password) {
    if (password.length < 6) {
      fail(res, '密码至少 6 位')
      return
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id)
    // 重置密码后清除强制改密标记
    db.prepare(`DELETE FROM config WHERE key = ?`).run(`force_change_password:${id}`)
  }
  if (typeof quotaBytes === 'number') {
    db.prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(quotaBytes, id)
  }
  if (typeof enabled === 'boolean') {
    db.prepare('UPDATE users SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }
  if (role && ['admin', 'user'].includes(role)) {
    // 防止取消最后一个管理员
    if (role === 'user') {
      const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND enabled = 1").get() as { c: number }
      const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string }
      if (target.role === 'admin' && adminCount.c <= 1) {
        fail(res, '至少保留一个管理员')
        return
      }
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  }
  ok(res, null, '已更新')
})

/** 删除用户 */
router.delete('/users/:id', (req: AuthRequest, res) => {
  const id = req.params.id
  if (id === req.user!.id) {
    fail(res, '不能删除当前登录账号')
    return
  }
  // 超级管理员不可删除
  if (isSuperAdmin(id)) {
    fail(res, '超级管理员不可删除', 403, 403)
    return
  }
  const db = getDb()
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined
  if (!target) {
    fail(res, '用户不存在', 404, 404)
    return
  }
  // 管理员必须先降级为普通用户才能删除
  if (target.role === 'admin') {
    fail(res, '请先将该管理员降级为普通用户，再进行删除', 403, 403)
    return
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  // 清理用户存储
  const userDir = `${STORAGE_DIR}/${id}`
  if (fs.existsSync(userDir)) {
    try { fs.rmSync(userDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  ok(res, null, '用户已删除')
})

/** 重置用户强制改密标记 */
router.post('/users/:id/force-change', (req: AuthRequest, res) => {
  const id = req.params.id
  const { enable } = req.body as { enable: boolean }
  const db = getDb()
  if (enable) {
    db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, '1')`).run(`force_change_password:${id}`)
  } else {
    db.prepare(`DELETE FROM config WHERE key = ?`).run(`force_change_password:${id}`)
  }
  ok(res, null, '已更新')
})

/** 系统统计 */
router.get('/stats', (req: AuthRequest, res) => {
  const db = getDb()
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  const fileCount = (db.prepare("SELECT COUNT(*) as c FROM files WHERE type = 'file' AND deleted = 0").get() as { c: number }).c
  const folderCount = (db.prepare("SELECT COUNT(*) as c FROM files WHERE type = 'folder' AND deleted = 0").get() as { c: number }).c
  const shareCount = (db.prepare('SELECT COUNT(*) as c FROM shares').get() as { c: number }).c
  const totalSize = (db.prepare("SELECT COALESCE(SUM(size), 0) as t FROM files WHERE type = 'file' AND deleted = 0").get() as { t: number }).t
  const totalQuota = (db.prepare("SELECT COALESCE(SUM(quota_bytes), 0) as t FROM users").get() as { t: number }).t
  // 近 7 天每日上传量
  const daily = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count, COALESCE(SUM(size),0) as size
    FROM files WHERE type = 'file' AND deleted = 0 AND created_at >= date('now','-7 days')
    GROUP BY date(created_at) ORDER BY date ASC
  `).all() as Array<{ date: string; count: number; size: number }>
  // 按文件类型分布
  const category = db.prepare(`
    SELECT
      CASE
        WHEN mime_type LIKE 'image/%' THEN 'image'
        WHEN mime_type LIKE 'video/%' THEN 'video'
        WHEN mime_type LIKE 'audio/%' THEN 'audio'
        WHEN mime_type IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/csv') THEN 'doc'
        WHEN mime_type IN ('application/zip','application/x-rar-compressed','application/x-7z-compressed','application/gzip') THEN 'archive'
        ELSE 'other'
      END as cat,
      COUNT(*) as count
    FROM files WHERE type = 'file' AND deleted = 0
    GROUP BY cat
  `).all() as Array<{ cat: string; count: number }>
  ok(res, {
    userCount,
    fileCount,
    folderCount,
    shareCount,
    totalSize,
    totalSizeHuman: formatBytes(totalSize),
    totalQuota,
    totalQuotaHuman: formatBytes(totalQuota),
    usedPercent: totalQuota > 0 ? Math.round((totalSize / totalQuota) * 100) : 0,
    daily,
    category,
  })
})

/** 系统配置 */
router.get('/config', (req: AuthRequest, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM config').all() as Array<{ key: string; value: string }>
  const config: Record<string, string> = {}
  for (const r of rows) {
    if (!r.key.startsWith('force_change_password:')) {
      config[r.key] = r.value
    }
  }
  ok(res, config)
})

/** 更新系统配置 */
router.patch('/config', (req: AuthRequest, res) => {
  const updates = req.body as Record<string, string>
  const db = getDb()
  const stmt = db.prepare(`INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      if (!k.startsWith('force_change_password:')) {
        stmt.run(k, String(v))
      }
    }
  })
  tx()
  ok(res, null, '配置已保存')
})

export default router
