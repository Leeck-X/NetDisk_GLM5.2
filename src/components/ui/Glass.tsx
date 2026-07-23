import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========== GlassPanel ========== */
interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'strong' | 'subtle'
  glow?: boolean
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant = 'default', glow, children, ...props }, ref) => {
    const base = variant === 'strong' ? 'glass-strong' : variant === 'subtle' ? 'glass-subtle' : 'glass'
    return (
      <div
        ref={ref}
        className={cn(base, 'rounded-2xl', glow && 'shadow-glow-cyan', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
GlassPanel.displayName = 'GlassPanel'

/* ========== GlassButton ========== */
interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'glass', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    }
    const variants = {
      primary: 'btn-primary',
      glass: 'glass-btn',
      ghost: 'text-slate-300 hover:text-white hover:bg-white/5 transition-all duration-200',
      danger:
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 hover:border-rose-400/50',
    }
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed',
          sizes[size],
          variants[variant],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && icon}
        {children}
      </button>
    )
  }
)
GlassButton.displayName = 'GlassButton'

/* ========== GlassInput ========== */
interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
  label?: string
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, icon, label, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">{label}</label>}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn('glass-input', icon && 'pl-10', className)}
            {...props}
          />
        </div>
      </div>
    )
  }
)
GlassInput.displayName = 'GlassInput'

/* ========== GlassModal ========== */
interface GlassModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: string
}

export function GlassModal({ open, onClose, title, children, width = 'max-w-md' }: GlassModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        className={cn('glass-strong rounded-3xl w-full overflow-hidden animate-fade-up', width)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="text-lg font-display font-semibold text-white">{title}</h3>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

/* ========== EmptyState ========== */
interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {icon && (
        <div className="w-20 h-20 mb-4 rounded-3xl glass-subtle flex items-center justify-center text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-display font-semibold text-slate-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-400 max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  )
}

/* ========== LoadingSpinner ========== */
export function LoadingSpinner({ size = 24, className }: { size?: number; className?: string }) {
  return <Loader2 style={{ width: size, height: size }} className={cn('animate-spin text-cyan-glow', className)} />
}

/* ========== ProgressRing ========== */
export function ProgressRing({ progress, size = 60 }: { progress: number; size?: number }) {
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#22D3EE"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease', filter: 'drop-shadow(0 0 4px rgba(34,211,238,0.6))' }}
      />
    </svg>
  )
}
