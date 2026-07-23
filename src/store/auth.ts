import { create } from 'zustand'
import type { User } from '@/lib/types'
import { authApi, getToken, setToken } from '@/lib/api'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  login: (username: string, password: string, remember?: boolean) => Promise<{ forceChangePassword: boolean }>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (username, password, remember = false) => {
    const result = await authApi.login(username, password, remember)
    setToken(result.token)
    set({ user: { ...result.user, id: result.user.id, username: result.user.username, role: result.user.role } as User })
    return { forceChangePassword: result.forceChangePassword }
  },

  logout: async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    setToken(null)
    set({ user: null })
  },

  fetchMe: async () => {
    if (!getToken()) {
      set({ user: null, initialized: true })
      return
    }
    try {
      const user = await authApi.me()
      set({ user, initialized: true })
    } catch {
      setToken(null)
      set({ user: null, initialized: true })
    }
  },

  initialize: async () => {
    set({ loading: true })
    await useAuthStore.getState().fetchMe()
    set({ loading: false })
  },
}))
