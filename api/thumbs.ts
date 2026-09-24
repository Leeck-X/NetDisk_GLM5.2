/**
 * 缩略图模块
 *
 * 列表/详情里的图片原先直接请求 /preview 加载原图，手机拍摄的照片动辄数 MB，
 * 一屏十几张就会卡住。这里改为按需生成小尺寸 WebP 缩略图并落盘缓存，
 * 缓存文件名带上文件更新时间，原图被覆盖后缓存自动失效。
 *
 * sharp 是可选依赖：若未安装或加载失败，路由会回退为直接返回原图，
 * 保证服务不会因为缺一个图片处理库而启动失败。
 */
import fs from 'fs'
import path from 'path'
import { THUMBS_DIR } from './db.js'
import { writeError } from './logger.js'

/** 缩略图最长边（px） */
export const THUMB_MAX_SIZE = 480

type SharpPipeline = {
  rotate: () => SharpPipeline
  resize: (width: number, height: number, options?: Record<string, unknown>) => SharpPipeline
  webp: (options?: Record<string, unknown>) => SharpPipeline
  toFile: (file: string) => Promise<unknown>
}
type SharpFactory = (input: string, options?: Record<string, unknown>) => SharpPipeline

let sharpFactory: SharpFactory | null = null
let sharpUnavailable = false

/** 惰性加载 sharp：缺失时只记录一次日志并永久回退 */
async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpFactory) return sharpFactory
  if (sharpUnavailable) return null
  try {
    const mod = (await import('sharp')) as unknown as { default?: SharpFactory } & SharpFactory
    sharpFactory = (mod.default ?? mod) as SharpFactory
    return sharpFactory
  } catch (err) {
    sharpUnavailable = true
    writeError(err as Error, 'thumbs: 加载 sharp 失败，缩略图将回退为原图')
    return null
  }
}

/** 缩略图缓存路径 */
export function thumbPath(fileId: string, stamp: string): string {
  return path.join(THUMBS_DIR, `${fileId}-${stamp}.webp`)
}

/** 命中缓存则返回缓存路径 */
export function findThumb(fileId: string, stamp: string): string | null {
  const target = thumbPath(fileId, stamp)
  return fs.existsSync(target) ? target : null
}

/** 生成缩略图，失败或 sharp 不可用时返回 null */
export async function createThumb(source: string, fileId: string, stamp: string): Promise<string | null> {
  const sharp = await loadSharp()
  if (!sharp) return null
  const target = thumbPath(fileId, stamp)
  try {
    fs.mkdirSync(THUMBS_DIR, { recursive: true })
    await sharp(source, { failOn: 'none' })
      .rotate()
      .resize(THUMB_MAX_SIZE, THUMB_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(target)
    return target
  } catch (err) {
    writeError(err as Error, 'thumbs: 生成缩略图失败')
    return null
  }
}
