import { useState, type MouseEvent } from 'react'
import { Check, MoreVertical, Star, Share2, Download, Trash2, Pencil, FolderDown } from 'lucide-react'
import { GlassPanel } from '@/components/ui/Glass'
import { FileIcon } from '@/components/FileIcon'
import { filesApi } from '@/lib/api'
import { formatBytes, formatDate, getFileCategory, type AppFile } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FileCardProps {
  file: AppFile
  selected: boolean
  onSelect: (id: string, multi: boolean) => void
  onOpen: (file: AppFile) => void
  onMenu: (file: AppFile, x: number, y: number) => void
  onShare: (file: AppFile) => void
  onRename: (file: AppFile) => void
  onDelete: (file: AppFile) => void
  onStarToggle: (file: AppFile) => void
  view: 'grid' | 'list'
  index: number
}

export function FileCard({
  file,
  selected,
  onSelect,
  onOpen,
  onMenu,
  onShare,
  onRename,
  onDelete,
  onStarToggle,
  view,
  index,
}: FileCardProps) {
  const [imgError, setImgError] = useState(false)
  const isImage = getFileCategory(file.mimeType, file.ext) === 'image'
  const showThumb = isImage && !imgError

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onSelect(file.id, e.ctrlKey || e.metaKey || e.shiftKey)
  }

  const handleDoubleClick = () => onOpen(file)

  const handleMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onMenu(file, e.clientX, e.clientY)
  }

  if (view === 'list') {
    return (
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleMenu}
        className={cn(
          'group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 animate-fade-up',
          selected ? 'glass-strong border border-cyan-glow/40' : 'hover:bg-white/5'
        )}
        style={{ animationDelay: `${Math.min(index * 0.02, 0.3)}s` }}
      >
        <FileIcon file={file} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-100 truncate">{file.name}</span>
            {file.starred === 1 && <Star className="w-3 h-3 text-amber-glow fill-current shrink-0" />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{formatDate(file.updatedAt)}</p>
        </div>
        <span className="text-xs text-slate-500 font-mono w-20 text-right shrink-0">
          {file.type === 'folder' ? '-' : formatBytes(file.size)}
        </span>
        <button
          onClick={handleMenu}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleMenu}
      className={cn(
        'group relative glass rounded-2xl p-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 animate-fade-up',
        selected
          ? 'border-cyan-glow/60 shadow-glow-cyan'
          : 'hover:border-cyan-glow/30 hover:shadow-glass-sm'
      )}
      style={{ animationDelay: `${Math.min(index * 0.03, 0.4)}s` }}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-cyan-glow flex items-center justify-center shadow-glow-cyan">
          <Check className="w-3 h-3 text-midnight-900" strokeWidth={3} />
        </div>
      )}
      {/* 缩略图区 */}
      <div className="aspect-[4/3] rounded-xl overflow-hidden glass-subtle flex items-center justify-center mb-3 relative">
        {showThumb ? (
          <img
            src={filesApi.previewUrl(file.id)}
            alt={file.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <FileIcon file={file} size={56} />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStarToggle(file)
          }}
          className={cn(
            'absolute bottom-2 left-2 w-7 h-7 rounded-lg glass-subtle flex items-center justify-center transition-all',
            file.starred ? 'text-amber-glow opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100'
          )}
        >
          <Star className={cn('w-3.5 h-3.5', file.starred && 'fill-current')} />
        </button>
      </div>
      {/* 信息区 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-100 truncate" title={file.name}>{file.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {file.type === 'folder' ? '文件夹' : formatBytes(file.size)}
          </p>
        </div>
        <button
          onClick={handleMenu}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* 悬停快捷操作 */}
      <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
        <div className="flex gap-1 mx-auto glass-strong rounded-full px-1 py-1 pointer-events-auto">
          {file.type === 'file' && (
            <QuickBtn title="下载" onClick={(e) => { e.stopPropagation(); quickDownload(file) }}>
              <Download className="w-3.5 h-3.5" />
            </QuickBtn>
          )}
          {file.type === 'folder' && (
            <QuickBtn title="打包下载" onClick={(e) => { e.stopPropagation(); quickDownloadFolder(file) }}>
              <FolderDown className="w-3.5 h-3.5" />
            </QuickBtn>
          )}
          <QuickBtn title="分享" onClick={(e) => { e.stopPropagation(); onShare(file) }}>
            <Share2 className="w-3.5 h-3.5" />
          </QuickBtn>
          <QuickBtn title="重命名" onClick={(e) => { e.stopPropagation(); onRename(file) }}>
            <Pencil className="w-3.5 h-3.5" />
          </QuickBtn>
          <QuickBtn title="删除" onClick={(e) => { e.stopPropagation(); onDelete(file) }} danger>
            <Trash2 className="w-3.5 h-3.5" />
          </QuickBtn>
        </div>
      </div>
    </div>
  )
}

function QuickBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode
  title: string
  onClick: (e: MouseEvent) => void
  danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'p-1.5 rounded-full transition-colors',
        danger ? 'text-slate-400 hover:text-rose-400' : 'text-slate-400 hover:text-cyan-glow'
      )}
    >
      {children}
    </button>
  )
}

function quickDownload(file: AppFile) {
  const a = document.createElement('a')
  a.href = filesApi.downloadUrl(file.id)
  a.download = file.name
  a.click()
}

function quickDownloadFolder(file: AppFile) {
  const a = document.createElement('a')
  a.href = filesApi.downloadFolderUrl(file.id)
  a.click()
}
