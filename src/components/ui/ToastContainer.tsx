import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToastStore } from './Toast'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const COLORS = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-cyan-400',
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className="glass-strong rounded-2xl px-4 py-3 min-w-[260px] max-w-[400px] flex items-center gap-3 animate-fade-up pointer-events-auto"
          >
            <Icon className={cn('w-5 h-5 shrink-0', COLORS[t.type])} />
            <span className="text-sm text-slate-100 flex-1">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
