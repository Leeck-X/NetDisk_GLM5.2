/**
 * 运行时配置读取
 *
 * config 表中的键值对由「系统配置」页写入，后端逻辑在此统一读取，
 * 避免各路由各自拼 SQL，也便于给出统一的默认值。
 */
import { getDb } from './db.js'

/** 配置项默认值：配置页留空时按此回退 */
export const CONFIG_DEFAULTS = {
  site_name: 'WebFtp',
  site_description: '自托管网盘系统 · 数据尽在掌握',
  /** 是否开放注册 */
  allow_register: '0',
  /** 新用户默认配额（GB） */
  default_quota_gb: '1',
  /** 单文件上传上限（MB） */
  upload_max_size: '2048',
  /** 分享默认有效期（天），0 为永久 */
  share_default_expire_days: '7',
  /** 回收站保留天数，0 为不自动清理 */
  trash_retention_days: '30',
} as const

export type ConfigKey = keyof typeof CONFIG_DEFAULTS

/** 读取单个配置项（读库失败时回退默认值，不影响主流程） */
export function getConfig(key: ConfigKey): string {
  const fallback = CONFIG_DEFAULTS[key]
  try {
    const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    const value = row?.value
    return value === undefined || value === '' ? fallback : value
  } catch {
    return fallback
  }
}

/** 读取数值型配置项，非法值回退默认值 */
export function getConfigNumber(key: ConfigKey): number {
  const n = Number(getConfig(key))
  return Number.isFinite(n) ? n : Number(CONFIG_DEFAULTS[key])
}

/** 读取开关型配置项（'1' / 'true' 视为开启） */
export function getConfigBool(key: ConfigKey): boolean {
  const raw = getConfig(key).trim().toLowerCase()
  return raw === '1' || raw === 'true'
}
