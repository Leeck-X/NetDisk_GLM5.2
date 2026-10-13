import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { AppFile } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface MenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  file: AppFile
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, file, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  // 调整位置防止溢出
  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 40 - 20)

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[60] glass-strong rounded-2xl p-1.5 min-w-[200px] animate-fade-up"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="px-3 py-2 mb-1 border-b border-white/10">
        <p className="text-xs text-slate-400 truncate">{file.name}</p>
      </div>
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <div className="my-1 border-t border-white/10" />}
          <button
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              item.danger
                ? 'text-slate-300 hover:bg-rose-500/15 hover:text-rose-300'
                : 'text-slate-300 hover:bg-cyan-glow/10 hover:text-cyan-glow'
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
