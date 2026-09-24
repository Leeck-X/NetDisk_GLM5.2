import { create } from 'zustand'
import { authApi } from '@/lib/api'
import type { SiteInfo } from '@/lib/types'

/** 站点名称与描述的兜底值：接口未返回时使用 */
const FALLBACK: SiteInfo = {
  siteName: 'WebFtp',
  siteDescription: '自托管网盘系统 · 数据尽在掌握',
  allowRegister: false,
}

interface SiteState {
  info: SiteInfo
  loaded: boolean
  load: () => Promise<void>
}

/** 站点公开信息：由后台「系统配置」决定，全局只拉取一次 */
export const useSiteStore = create<SiteState>((set, get) => ({
  info: FALLBACK,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const info = await authApi.site()
      set({ info, loaded: true })
      document.title = `${info.siteName} · 自托管网盘`
    } catch {
      // 接口不可用时保持兜底文案，不影响页面渲染
      set({ loaded: true })
      document.title = `${FALLBACK.siteName} · 自托管网盘`
    }
  },
}))
