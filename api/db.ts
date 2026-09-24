import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import dotenv from 'dotenv'

// 必须在此处加载 .env：ESM 的 import 全部先于模块体求值，
// 若依赖 app.ts 里的 dotenv.config()，这里读 process.env 永远是 undefined
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 程序目录（api/ 的上一级）
export const ROOT_DIR = path.resolve(__dirname, '..')

// 主目录：程序(app)、数据(data)、文件(files) 三者的父级
export const WEBPAN_ROOT = process.env.WEBPAN_ROOT
  ? path.resolve(process.env.WEBPAN_ROOT)
  : path.resolve(ROOT_DIR, '..')

// 数据目录（数据库 + 上传分片 + 日志）
export const DATA_DIR = path.join(WEBPAN_ROOT, 'data')
// 用户文件目录（按 <userId>/ 分目录存放）
export const STORAGE_DIR = path.join(WEBPAN_ROOT, 'files')
export const CHUNKS_DIR = path.join(DATA_DIR, 'chunks')
export const LOGS_DIR = path.join(DATA_DIR, 'logs')
export const DB_PATH = path.join(DATA_DIR, 'webftp.db')

let db: Database.Database | null = null

/** 初始化目录结构 */
export function ensureDirs(): void {
  for (const dir of [WEBPAN_ROOT, DATA_DIR, STORAGE_DIR, CHUNKS_DIR, LOGS_DIR]) {
    if (fs.existsSync(dir)) continue
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      console.error(`[WebFtp] 无法创建目录 ${dir}（${code}），请检查运行用户对该路径的写权限`)
      throw err
    }
  }
}

/** 获取数据库实例（单例） */
export function getDb(): Database.Database {
  if (db) return db
  ensureDirs()
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  bootstrapAdmin(db)
  return db
}

/** 初始化数据库 schema */
function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      quota_bytes INTEGER NOT NULL DEFAULT 1073741824,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT,
      mime_type TEXT,
      ext TEXT,
      storage_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      starred INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES files(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_files_user_parent ON files(user_id, parent_id, deleted);
    CREATE INDEX IF NOT EXISTS idx_files_user_type ON files(user_id, type, deleted);

    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      file_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      password_hash TEXT,
      expire_at TEXT,
      download_limit INTEGER,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
    CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);

    CREATE TABLE IF NOT EXISTS file_chunks (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      temp_path TEXT NOT NULL,
      uploaded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_upload ON file_chunks(upload_id);

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

/** 首次启动时创建默认管理员，并维护超级管理员标记 */
function bootstrapAdmin(database: Database.Database): void {
  // 1. 若不存在任何管理员，则创建默认 admin/admin123（也用于意外删除后的恢复）
  const row = database.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }
  if (row.c === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    const id = nanoid()
    database.prepare(
      'INSERT INTO users (id, username, password_hash, role, quota_bytes) VALUES (?, ?, ?, ?, ?)',
    ).run(id, 'admin', hash, 'admin', 107374182400)
    database.prepare(
      `INSERT OR IGNORE INTO config (key, value) VALUES ('force_change_password:${id}', '1')`,
    ).run()
    // 直接登记为超级管理员
    database.prepare(
      `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('super_admin_id', ?, datetime('now'))`,
    ).run(id)
    console.log('[WebFtp] 未检测到管理员，已创建默认账号 -> 账号: admin  密码: admin123')
  }

  // 2. 校验 super_admin_id 配置：缺失或指向无效/非管理员用户时，重新指派为最早创建的管理员
  const superRow = database.prepare("SELECT value FROM config WHERE key = 'super_admin_id'").get() as
    | { value: string }
    | undefined
  let superId: string | null = superRow?.value ?? null
  if (superId) {
    const hit = database.prepare('SELECT id, role FROM users WHERE id = ?').get(superId) as
      | { id: string; role: string }
      | undefined
    if (!hit || hit.role !== 'admin') superId = null
  }
  if (!superId) {
    const first = database
      .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
      .get() as { id: string } | undefined
    if (first) {
      database.prepare(
        `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('super_admin_id', ?, datetime('now'))`,
      ).run(first.id)
    }
  }
}

/** 获取超级管理员用户 ID（不可删除、不可降级、不可禁用） */
export function getSuperAdminId(): string | null {
  const db = getDb()
  const row = db.prepare("SELECT value FROM config WHERE key = 'super_admin_id'").get() as
    | { value: string }
    | undefined
  return row?.value ?? null
}

/** 判断指定用户是否为超级管理员 */
export function isSuperAdmin(userId: string): boolean {
  return getSuperAdminId() === userId
}

/** 用户存储目录 */
export function userStorageDir(userId: string): string {
  const dir = path.join(STORAGE_DIR, userId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}
