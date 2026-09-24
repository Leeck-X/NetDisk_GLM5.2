import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Download,
  Share2,
  Pencil,
  Trash2,
  Star,
  FolderDown,
  Info,
  Move,
  ExternalLink,
} from 'lucide-react'
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

export function buildFileMenuItems(
  file: AppFile,
  actions: {
    onDownload: () => void
    onShare: () => void
    onRename: () => void
    onDelete: () => void
    onStar: () => void
    onDetail: () => void
    /** 打开移动对话框（与「详情」是两个不同功能，不能共用回调） */
    onMove: () => void
    /** 在新标签页打开预览，仅图片/视频/音频/PDF 可用 */
    onOpenNewTab?: () => void
  }
): MenuItem[] {
  const items: MenuItem[] = []
  if (file.type === 'file') {
    items.push({ label: '下载', icon: <Download className="w-4 h-4" />, onClick: actions.onDownload })
  } else {
    items.push({ label: '打包下载', icon: <FolderDown className="w-4 h-4" />, onClick: actions.onDownload })
  }
  if (actions.onOpenNewTab) {
    items.push({ label: '新标签页打开', icon: <ExternalLink className="w-4 h-4" />, onClick: actions.onOpenNewTab })
  }
  items.push({ label: '分享', icon: <Share2 className="w-4 h-4" />, onClick: actions.onShare })
  items.push({ label: '重命名', icon: <Pencil className="w-4 h-4" />, onClick: actions.onRename })
  items.push({
    label: file.starred ? '取消收藏' : '收藏',
    icon: <Star className="w-4 h-4" />,
    onClick: actions.onStar,
  })
  items.push({ label: '移动到…', icon: <Move className="w-4 h-4" />, onClick: actions.onMove, divider: true })
  items.push({ label: '详情', icon: <Info className="w-4 h-4" />, onClick: actions.onDetail })
  items.push({ label: '移入回收站', icon: <Trash2 className="w-4 h-4" />, onClick: actions.onDelete, danger: true, divider: true })
  return items
}
