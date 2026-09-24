import { Download, Share2, Star, Trash2, Pencil, FolderDown, ExternalLink } from 'lucide-react'
import { GlassPanel, GlassButton } from '@/components/ui/Glass'
import { FileIcon } from '@/components/FileIcon'
import { filesApi } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { formatBytes, formatDate, getFileCategory, type AppFile } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DetailDrawerProps {
  file: AppFile | null
  onClose: () => void
  onShare: (file: AppFile) => void
  onRename: (file: AppFile) => void
  onDelete: (file: AppFile) => void
  onStarToggle: (file: AppFile) => void
}

export function DetailDrawer({ file, onClose, onShare, onRename, onDelete, onStarToggle }: DetailDrawerProps) {
  if (!file) return null
  const category = getFileCategory(file.mimeType, file.ext)
  const isImage = category === 'image'
  const isVideo = category === 'video'
  const isAudio = category === 'audio'
  const isPdf = file.mimeType === 'application/pdf'
  const isPreviewable = isImage || isVideo || isAudio || isPdf

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 p-4 animate-fade-up">
        <GlassPanel variant="strong" className="h-full flex flex-col overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h3 className="font-display font-semibold text-white">文件详情</h3>
            <div className="flex items-center gap-1">
              {isPreviewable && (
                <button
                  onClick={() => window.open(filesApi.previewUrl(file.id), '_blank', 'noopener')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-glow hover:bg-white/5 transition-colors"
                  title="在新标签页打开原图"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none px-1">×</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-glass p-5 space-y-5">
            {/* 预览区：图片用缩略图秒开，视频/音频/PDF 内联播放，看原图走右上角「新标签页打开」 */}
            {isImage && (
              <div className="aspect-video rounded-2xl overflow-hidden glass-subtle flex items-center justify-center">
                <img
                  src={filesApi.thumbUrl(file.id)}
                  alt={file.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
            {isVideo && (
              <video src={filesApi.previewUrl(file.id)} controls preload="metadata" className="w-full rounded-2xl bg-black" />
            )}
            {isAudio && (
              <div className="rounded-2xl glass-subtle p-4 flex flex-col items-center gap-3">
                <FileIcon file={file} size={48} />
                <audio src={filesApi.previewUrl(file.id)} controls preload="metadata" className="w-full" />
              </div>
            )}
            {isPdf && (
              <iframe
                src={filesApi.previewUrl(file.id)}
                title={file.name}
                className="w-full h-72 rounded-2xl bg-white"
              />
            )}
            {!isImage && !isVideo && !isAudio && !isPdf && (
              <div className="aspect-video rounded-2xl overflow-hidden glass-subtle flex items-center justify-center">
                <FileIcon file={file} size={72} />
              </div>
            )}

            {/* 名称 */}
            <div>
              <div className="flex items-start gap-2">
                <FileIcon file={file} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white break-all">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{file.ext || '无扩展名'}</p>
                </div>
                <button
                  onClick={() => onStarToggle(file)}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    file.starred ? 'text-amber-glow' : 'text-slate-500 hover:text-amber-glow'
                  )}
                  title={file.starred ? '取消收藏' : '收藏'}
                >
                  <Star className={cn('w-4 h-4', file.starred && 'fill-current')} />
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="grid grid-cols-4 gap-2">
              {isPreviewable && (
                <ActionButton
                  icon={<ExternalLink className="w-4 h-4" />}
                  label="新标签页"
                  onClick={() => window.open(filesApi.previewUrl(file.id), '_blank', 'noopener')}
                />
              )}
              <ActionButton icon={<Download className="w-4 h-4" />} label="下载" onClick={() => downloadFile(file)} />
              {file.type === 'folder' && (
                <ActionButton icon={<FolderDown className="w-4 h-4" />} label="打包" onClick={() => downloadFolder(file)} />
              )}
              <ActionButton icon={<Share2 className="w-4 h-4" />} label="分享" onClick={() => onShare(file)} />
              <ActionButton icon={<Pencil className="w-4 h-4" />} label="重命名" onClick={() => onRename(file)} />
            </div>

            {/* 元信息 */}
            <GlassPanel variant="subtle" className="p-4 space-y-3">
              <InfoRow label="类型" value={file.type === 'folder' ? '文件夹' : file.mimeType || '文件'} />
              {file.type === 'file' && <InfoRow label="大小" value={formatBytes(file.size)} mono />}
              <InfoRow label="创建时间" value={formatDate(file.createdAt)} mono />
              <InfoRow label="修改时间" value={formatDate(file.updatedAt)} mono />
            </GlassPanel>

            {/* 危险操作 */}
            <GlassButton
              variant="danger"
              className="w-full"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => onDelete(file)}
            >
              移入回收站
            </GlassButton>
          </div>
        </GlassPanel>
      </aside>
    </>
  )
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-3 rounded-xl glass-subtle hover:bg-cyan-glow/10 hover:border-cyan-glow/30 text-slate-300 hover:text-cyan-glow transition-all duration-200"
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={cn('text-xs text-slate-200 text-right break-all', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function downloadFile(file: AppFile) {
  if (file.type === 'file') {
    const a = document.createElement('a')
    a.href = filesApi.downloadUrl(file.id)
    a.download = file.name
    a.click()
  } else {
    downloadFolder(file)
  }
}

function downloadFolder(file: AppFile) {
  const a = document.createElement('a')
  a.href = filesApi.downloadFolderUrl(file.id)
  a.click()
  toast.info('正在打包下载...')
}
