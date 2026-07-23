import axios, { type AxiosInstance } from 'axios'
import type { ApiResponse, User, AppFile, Share, ShareView, AdminUser, AdminStats } from './types'

const TOKEN_KEY = 'webftp_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

const client: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截：附带 token
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：统一解包 + 401 处理
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null)
      if (!window.location.pathname.startsWith('/s/') && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const res = await promise
  if (res.data.code !== 0) {
    throw new Error(res.data.message || '请求失败')
  }
  return res.data.data
}

/* ============ Auth ============ */
export const authApi = {
  login: (username: string, password: string, remember = false) =>
    unwrap<{ token: string; user: { id: string; username: string; role: string }; forceChangePassword: boolean }>(
      client.post('/auth/login', { username, password, remember })
    ),
  me: () => unwrap<User>(client.get('/auth/me')),
  changePassword: (oldPassword: string, newPassword: string) =>
    unwrap<null>(client.post('/auth/change-password', { oldPassword, newPassword })),
  logout: () => unwrap<null>(client.post('/auth/logout')),
}

/* ============ Files ============ */
export const filesApi = {
  list: (parentId: string | null) =>
    unwrap<AppFile[]>(client.get('/files/list', { params: { parentId } })),
  category: (type: string) => unwrap<AppFile[]>(client.get(`/files/category/${type}`)),
  trash: () => unwrap<AppFile[]>(client.get('/files/trash')),
  search: (q: string) => unwrap<AppFile[]>(client.get('/files/search', { params: { q } })),
  mkdir: (name: string, parentId: string | null) =>
    unwrap<AppFile>(client.post('/files/mkdir', { name, parentId })),
  rename: (id: string, name: string) => unwrap<null>(client.post('/files/rename', { id, name })),
  move: (ids: string[], targetId: string | null) => unwrap<null>(client.post('/files/move', { ids, targetId })),
  copy: (id: string, targetId: string | null) => unwrap<null>(client.post('/files/copy', { id, targetId })),
  remove: (ids: string[]) => unwrap<null>(client.post('/files/delete', { ids })),
  restore: (ids: string[]) => unwrap<null>(client.post('/files/restore', { ids })),
  purge: (ids: string[]) => unwrap<null>(client.post('/files/purge', { ids })),
  clearTrash: () => unwrap<null>(client.post('/files/trash/clear')),
  star: (id: string, starred: boolean) => unwrap<null>(client.post('/files/star', { id, starred })),
  // 上传
  initUpload: (body: {
    name: string; size: number; parentId: string | null
    chunkSize: number; totalChunks: number; mimeType: string; hash?: string
  }) => unwrap<{ uploadId: string; uploaded: number[]; exist: boolean }>(
    client.post('/files/upload/init', body)
  ),
  uploadChunk: (formData: FormData, onProgress?: (percent: number) => void) =>
    unwrap<{ uploaded: number }>(
      client.post('/files/upload/chunk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
        timeout: 120000,
      })
    ),
  completeUpload: (body: {
    uploadId: string; name: string; size: number; parentId: string | null
    mimeType: string; totalChunks: number
  }) => unwrap<AppFile>(client.post('/files/upload/complete', body, { timeout: 300000 })),
  // 下载 / 预览 URL
  downloadUrl: (id: string) => `/api/files/download?id=${id}&token=${getToken() || ''}`,
  previewUrl: (id: string) => `/api/files/preview?id=${id}&token=${getToken() || ''}`,
  downloadFolderUrl: (id: string) => `/api/files/download/folder?id=${id}&token=${getToken() || ''}`,
}

/* ============ Shares ============ */
export const sharesApi = {
  list: () => unwrap<Share[]>(client.get('/shares')),
  create: (body: { fileId: string; password?: string; expireDays?: number; downloadLimit?: number }) =>
    unwrap<{ id: string; token: string; expireAt: string | null; downloadLimit: number | null; hasPassword: boolean }>(
      client.post('/shares', body)
    ),
  remove: (id: string) => unwrap<null>(client.delete(`/shares/${id}`)),
  // 访客
  verify: (token: string, password?: string) =>
    unwrap<{ needPassword: boolean; verified: boolean; token: string }>(
      client.post('/shares/verify', { token, password })
    ),
  view: (token: string) => unwrap<ShareView>(client.get(`/shares/${token}`)),
  downloadUrl: (token: string, password?: string) =>
    `/api/shares/download/${token}${password ? `?password=${encodeURIComponent(password)}` : ''}`,
}

/* ============ Admin ============ */
export const adminApi = {
  users: () => unwrap<AdminUser[]>(client.get('/admin/users')),
  createUser: (body: { username: string; password: string; role?: string; quotaBytes?: number }) =>
    unwrap<{ id: string; username: string }>(client.post('/admin/users', body)),
  updateUser: (id: string, body: { password?: string; quotaBytes?: number; enabled?: boolean; role?: string }) =>
    unwrap<null>(client.patch(`/admin/users/${id}`, body)),
  deleteUser: (id: string) => unwrap<null>(client.delete(`/admin/users/${id}`)),
  forceChange: (id: string, enable: boolean) =>
    unwrap<null>(client.post(`/admin/users/${id}/force-change`, { enable })),
  stats: () => unwrap<AdminStats>(client.get('/admin/stats')),
  config: () => unwrap<Record<string, string>>(client.get('/admin/config')),
  updateConfig: (updates: Record<string, string>) => unwrap<null>(client.patch('/admin/config', updates)),
}
