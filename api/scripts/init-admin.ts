/**
 * 初始化默认管理员（手动触发版）
 * 用法：npm run init:admin
 * 正常情况下首次启动 server 会自动创建默认 admin/admin123，
 * 此脚本仅用于重置或诊断场景。
 */
import { getDb } from '../db.js'
import { hashPassword } from '../utils.js'
import { nanoid } from 'nanoid'

const db = getDb()
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: string } | undefined

let adminId: string
if (existing) {
  console.log('[init-admin] admin 账号已存在，重置密码为 admin123')
  adminId = existing.id
  db.prepare('UPDATE users SET password_hash = ?, enabled = 1, role = ? WHERE username = ?').run(
    hashPassword('admin123'),
    'admin',
    'admin',
  )
  db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, '1')`).run(`force_change_password:${adminId}`)
} else {
  adminId = nanoid()
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, quota_bytes) VALUES (?, ?, ?, ?, ?)',
  ).run(adminId, 'admin', hashPassword('admin123'), 'admin', 100 * 1024 * 1024 * 1024)
  db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, '1')`).run(`force_change_password:${adminId}`)
  console.log('[init-admin] 已创建默认管理员 admin / admin123')
}

// 若尚未登记超级管理员，则将当前 admin 标记为超级管理员（防止误删导致无法登录）
const superRow = db.prepare("SELECT value FROM config WHERE key = 'super_admin_id'").get() as
  | { value: string }
  | undefined
if (!superRow?.value) {
  db.prepare(
    "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('super_admin_id', ?, datetime('now'))",
  ).run(adminId)
  console.log('[init-admin] 已将该 admin 设为超级管理员（不可删除/降级/禁用）')
}

console.log('[init-admin] 完成。请尽快登录并修改密码。')

