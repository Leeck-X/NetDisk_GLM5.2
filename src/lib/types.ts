/** 共享类型定义 */

export interface User {
  id: string
  username: string
  role: 'admin' | 'user'
  quota_bytes: number
  used_bytes: number
  created_at: string
  forceChangePassword?: boolean
}

export interface AppFile {
  id: string
  userId: string
  name: string
  type: 'file' | 'folder'
  size: number
  parentId: string | null
  mimeType: string | null
  ext: string | null
  storagePath: string | null
  createdAt: string
  updatedAt: string
  deleted: number
  deletedAt: string | null
  starred: number
}

export interface Share {
  id: string
  token: string
  fileId: string
  userId: string
  hasPassword: boolean
  expireAt: string | null
  downloadLimit: number | null
  downloads: number
  createdAt: string
  fileName: string
  fileType: string
  fileSize: number
}

export interface ShareView {
  token: string
  hasPassword: boolean
  expireAt: string | null
  downloadLimit: number | null
  downloads: number
  createdAt: string
  file: {
    id: string
    name: string
    type: string
    size: number
    ext: string
    mimeType: string
  }
}

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface AdminUser {
  id: string
  username: string
  role: string
  quota_bytes: number
  used_bytes: number
  enabled: boolean
  created_at: string
  quotaBytes: number
  usedBytes: number
  quotaHuman: string
  usedHuman: string
  usedPercent: number
  isSuper: boolean
}

export interface AdminStats {
  userCount: number
  fileCount: number
  folderCount: number
  shareCount: number
  totalSize: number
  totalSizeHuman: string
  totalQuota: number
  totalQuotaHuman: string
  usedPercent: number
  daily: Array<{ date: string; count: number; size: number }>
  category: Array<{ cat: string; count: number }>
}

export type FileCategory = 'image' | 'video' | 'audio' | 'doc' | 'archive' | 'other'

export function getFileCategory(mimeType: string | null, ext: string | null): FileCategory {
  const m = (mimeType || '').toLowerCase()
  const e = (ext || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'].includes(e)) return 'doc'
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(e)) return 'archive'
  return 'other'
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
