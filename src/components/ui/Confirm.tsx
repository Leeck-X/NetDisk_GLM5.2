import { create } from 'zustand'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { GlassButton, GlassModal } from './Glass'

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

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  loading: false,
  show: (opts) => set({ open: true, options: opts, loading: false }),
  hide: () => set({ open: false, options: null, loading: false }),
  setLoading: (v) => set({ loading: v }),
}))

export const confirm = (opts: ConfirmOptions) => useConfirmStore.getState().show(opts)

export function ConfirmDialog() {
  const { open, options, loading, hide, setLoading } = useConfirmStore()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, hide])

  if (!options) return null

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await options.onConfirm()
      hide()
    } catch {
      // 错误由调用方 toast
      setLoading(false)
    }
  }

  return createPortal(
    <GlassModal open={open} onClose={() => !loading && hide()} width="max-w-sm">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl glass-subtle flex items-center justify-center">
          <AlertTriangle className={`w-7 h-7 ${options.danger ? 'text-rose-400' : 'text-amber-glow'}`} />
        </div>
        <h3 className="text-lg font-display font-semibold text-white mb-2">{options.title}</h3>
        <p className="text-sm text-slate-400 mb-6">{options.message}</p>
        <div className="flex gap-3 justify-center">
          <GlassButton variant="glass" onClick={hide} disabled={loading}>
            {options.cancelText || '取消'}
          </GlassButton>
          <GlassButton
            variant={options.danger ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
          >
            {options.confirmText || '确认'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>,
    document.body
  )
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ConfirmDialog />
    </>
  )
}
