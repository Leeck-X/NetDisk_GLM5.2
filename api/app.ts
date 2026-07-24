/**
 * WebFtp API server
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import morgan from 'morgan'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'

import { getDb, ROOT_DIR } from './db.js'
import { writeAccess, writeError } from './logger.js'
import { recordRequest } from './stats.js'
import authRoutes from './routes/auth.js'
import fileRoutes from './routes/files.js'
import shareRoutes from './routes/shares.js'
import adminRoutes from './routes/admin.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载环境变量
dotenv.config()

// 触发数据库初始化（首次启动自动建表 + 创建默认 admin）
getDb()

const app: express.Application = express()

// 信任代理（反向代理场景下获取真实 IP）
app.set('trust proxy', 1)

// 中间件
app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))
app.use(cookieParser())
app.use(morgan('tiny'))

/** 请求统计 + 文件日志中间件 */
app.use((req, _res, next) => {
  const start = Date.now()
  const bytesIn = Number(req.headers['content-length'] ?? 0)
  const res = _res as express.Response & { __sent?: boolean }
  const finish = () => {
    if (res.__sent) return
    res.__sent = true
    const duration = Date.now() - start
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || ''
    const line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${ip} "${req.headers['user-agent'] ?? ''}"`
    writeAccess(line)
    recordRequest({
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      bytesIn,
      bytesOut: Number(res.getHeader('Content-Length') ?? 0),
    })
  }
  res.on('finish', finish)
  res.on('close', finish)
  next()
})

// 登录接口限流
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 1, message: '登录尝试过于频繁，请稍后再试', data: null },
})
app.use('/api/auth/login', loginLimiter)

// 分片上传限流（宽松）
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/files/upload/chunk', uploadLimiter)

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/shares', shareRoutes)
app.use('/api/admin', adminRoutes)

/**
 * health check
 */
app.use('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ code: 0, message: 'ok', data: { status: 'healthy', time: new Date().toISOString() } })
})

/**
 * 托管前端静态资源（生产构建产物）
 */
const distDir = path.join(ROOT_DIR, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '7d', index: false }))
  // SPA 回退：非 /api 路由全部交给前端路由
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    // 分享访客页 /s/:token 需要返回 index.html
    if (req.path.startsWith('/s/') || req.path.startsWith('/login') || req.path.startsWith('/admin') ||
        req.path.startsWith('/recent') || req.path.startsWith('/category') ||
        req.path.startsWith('/share') || req.path.startsWith('/trash') || req.path === '/') {
      res.sendFile(path.join(distDir, 'index.html'))
      return
    }
    next()
  })
  // 兜底
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ code: 1, message: 'API not found', data: null })
    } else {
      res.sendFile(path.join(distDir, 'index.html'))
    }
  })
}

/**
 * 错误处理中间件
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[WebFtp Error]', error)
  writeError(error, `${req.method} ${req.originalUrl}`)
  // multer 文件超限
  if (error.message && error.message.includes('File too large')) {
    res.status(413).json({ code: 1, message: '分片大小超过 10MB 限制', data: null })
    return
  }
  res.status(500).json({ code: 1, message: '服务器内部错误', data: null })
})

export default app
