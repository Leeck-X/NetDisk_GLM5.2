import { create } from 'zustand'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions | null
  loading: boolean
  show: (opts: ConfirmOptions) => void
  hide: () => void
  setLoading: (v: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  open: false,
  options: null,
  loading: false,
  show: (opts) => set({ open: true, options: opts, loading: false }),
  hide: () => set({ open: false, options: null, loading: false }),
  setLoading: (v) => set({ loading: v }),
}))

export const confirm = (opts: ConfirmOptions) => useConfirmStore.getState().show(opts)
