import { Router } from 'express'
import { nanoid } from 'nanoid'
import { getDb, userStorageDir } from '../db.js'
import { ok, fail, signToken, comparePassword, hashPassword, needForceChangePassword, clearForceChangePassword } from '../utils.js'
import { getConfig, getConfigBool, getConfigNumber } from '../config.js'
import type { AuthRequest } from '../middleware.js'
import { authRequired } from '../middleware.js'
import cookieParser from 'cookie-parser'

const router = Router()
router.use(cookieParser())

/** 站点公开信息：登录页/分享页的品牌文案与注册开关 */
router.get('/site', (req, res) => {
  ok(res, {
    siteName: getConfig('site_name'),
    siteDescription: getConfig('site_description'),
    allowRegister: getConfigBool('allow_register'),
  })
})

/** 注册（由后台「开放注册」开关控制） */
router.post('/register', (req, res) => {
  if (!getConfigBool('allow_register')) {
    fail(res, '本站已关闭注册', 403, 403)
    return
  }
  const { username, password } = req.body as { username: string; password: string }
  const name = (username || '').trim()
  if (!name || !password) {
    fail(res, '请填写用户名与密码')
    return
  }
  if (name.length < 3 || name.length > 20) {
    fail(res, '用户名长度需在 3-20 个字符之间')
    return
  }
  if (password.length < 6) {
    fail(res, '密码至少 6 位')
    return
  }
  const db = getDb()
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(name) as { id: string } | undefined
  if (exists) {
    fail(res, '用户名已存在')
    return
  }
  const quotaBytes = Math.max(0, getConfigNumber('default_quota_gb')) * 1024 * 1024 * 1024
  const id = nanoid()
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, quota_bytes) VALUES (?, ?, ?, ?, ?)',
  ).run(id, name, hashPassword(password), 'user', quotaBytes)
  // 提前建好用户目录，避免首次上传时才创建
  userStorageDir(id)
  ok(res, null, '注册成功，请登录')
})

/** 登录 */
router.post('/login', (req: AuthRequest, res) => {
  const { username, password, remember } = req.body as { username: string; password: string; remember?: boolean }
  if (!username || !password) {
    fail(res, '请输入账号与密码')
    return
  }
  const db = getDb()
  const user = db
    .prepare('SELECT id, username, password_hash, role, enabled FROM users WHERE username = ?')
    .get(username.trim()) as
    | { id: string; username: string; password_hash: string; role: string; enabled: number }
    | undefined
  if (!user || !user.enabled) {
    fail(res, '账号不存在或已禁用')
    return
  }
  if (!comparePassword(password, user.password_hash)) {
    fail(res, '账号或密码错误')
    return
  }
  const token = signToken(user.id, user.role)
  if (remember) {
    res.cookie('token', token, { maxAge: 7 * 24 * 3600 * 1000, httpOnly: true, sameSite: 'lax' })
  }
  const forceChange = needForceChangePassword(user.id)
  ok(res, {
    token,
    user: { id: user.id, username: user.username, role: user.role },
    forceChangePassword: forceChange,
  })
})

/** 获取当前用户信息 */
router.get('/me', authRequired, (req: AuthRequest, res) => {
  const db = getDb()
  const user = db
    .prepare('SELECT id, username, role, quota_bytes, used_bytes, created_at FROM users WHERE id = ?')
    .get(req.user!.id) as
    | { id: string; username: string; role: string; quota_bytes: number; used_bytes: number; created_at: string }
    | undefined
  if (!user) {
    fail(res, '用户不存在', 401, 401)
    return
  }
  ok(res, {
    ...user,
    forceChangePassword: needForceChangePassword(user.id),
  })
})

/** 修改密码 */
router.post('/change-password', authRequired, (req: AuthRequest, res) => {
  const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string }
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    fail(res, '新密码至少 6 位')
    return
  }
  const db = getDb()
  const user = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined
  if (!user || !comparePassword(oldPassword, user.password_hash)) {
    fail(res, '原密码错误')
    return
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user!.id)
  clearForceChangePassword(req.user!.id)
  ok(res, null, '密码修改成功')
})

/** 登出 */
router.post('/logout', (req, res) => {
  res.clearCookie('token')
  ok(res, null, '已登出')
})

export default router
