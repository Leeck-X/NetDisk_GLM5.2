import type { Request, Response, NextFunction } from 'express'
import { verifyToken, fail, needForceChangePassword } from './utils.js'
import { getDb } from './db.js'

export interface AuthRequest extends Request {
  user?: { id: string; username: string; role: string }
}

/** JWT 鉴权中间件 */
export function authRequired(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.token as string | undefined)
  if (!token) {
    fail(res, '未登录', 401, 401)
    return
  }
  const payload = verifyToken(token)
  if (!payload) {
    fail(res, '登录已过期，请重新登录', 401, 401)
    return
  }
  const db = getDb()
  const user = db
    .prepare('SELECT id, username, role, enabled FROM users WHERE id = ?')
    .get(payload.id) as { id: string; username: string; role: string; enabled: number } | undefined
  if (!user || !user.enabled) {
    fail(res, '账号不存在或已禁用', 401, 401)
    return
  }
  req.user = { id: user.id, username: user.username, role: user.role }
  next()
}

/** 仅管理员 */
export function adminOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    fail(res, '需要管理员权限', 403, 403)
    return
  }
  next()
}

/** 登录后需改密检测（写入响应头供前端读取） */
export function checkForcePassword(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user && needForceChangePassword(req.user.id)) {
    res.setHeader('X-Force-Change-Password', '1')
  }
  next()
}
