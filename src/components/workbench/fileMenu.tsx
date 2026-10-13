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
import type { MenuItem } from './ContextMenu'

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
