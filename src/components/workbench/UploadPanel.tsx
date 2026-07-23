import { useCallback, useRef, useState } from 'react'
import { UploadCloud, X, CheckCircle2, File as FileIcon, AlertCircle, Loader2 } from 'lucide-react'
import { GlassPanel } from '@/components/ui/Glass'
import { filesApi } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { formatBytes } from '@/lib/types'
import { cn } from '@/lib/utils'

interface UploadTask {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'merging' | 'done' | 'error'
  error?: string
}

interface UploadPanelProps {
  open: boolean
  onClose: () => void
  parentId: string | null
  onUploaded: () => void
}

const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB 分片
const CONCURRENCY = 3

export function UploadPanel({ open, onClose, parentId, onUploaded }: UploadPanelProps) {
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadingCount = tasks.filter((t) => t.status === 'uploading' || t.status === 'pending' || t.status === 'merging').length

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) => !f.name.startsWith('.'))
      if (files.length === 0) return
      const newTasks: UploadTask[] = files.map((f) => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        progress: 0,
        status: 'pending',
      }))
      setTasks((prev) => [...prev, ...newTasks])
      // 启动上传队列
      for (const t of newTasks) startUpload(t)
    },
    [parentId]
  )

  const updateTask = (id: string, patch: Partial<UploadTask>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const startUpload = async (task: UploadTask) => {
    updateTask(task.id, { status: 'uploading', progress: 0 })
    try {
      const totalChunks = Math.ceil(task.file.size / CHUNK_SIZE)
      const mimeType = task.file.type || 'application/octet-stream'
      const init = await filesApi.initUpload({
        name: task.file.name,
        size: task.file.size,
        parentId,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        mimeType,
      })
      // 秒传
      if (init.exist) {
        updateTask(task.id, { status: 'done', progress: 100 })
        toast.success(`秒传成功：${task.file.name}`)
        onUploaded()
        return
      }
      // 并发上传分片
      const chunkIndexes = Array.from({ length: totalChunks }, (_, i) => i).filter(
        (i) => !init.uploaded.includes(i)
      )
      let completed = init.uploaded.length
      const queue = [...chunkIndexes]
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
          const idx = queue.shift()
          if (idx === undefined) break
          const start = idx * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, task.file.size)
          const blob = task.file.slice(start, end)
          const formData = new FormData()
          formData.append('uploadId', init.uploadId)
          formData.append('chunkIndex', String(idx))
          formData.append('chunk', blob, `chunk-${idx}`)
          await filesApi.uploadChunk(formData)
          completed++
          updateTask(task.id, { progress: Math.round((completed / totalChunks) * 100) })
        }
      })
      await Promise.all(workers)
      // 合并
      updateTask(task.id, { status: 'merging' })
      await filesApi.completeUpload({
        uploadId: init.uploadId,
        name: task.file.name,
        size: task.file.size,
        parentId,
        mimeType,
        totalChunks,
      })
      updateTask(task.id, { status: 'done', progress: 100 })
      onUploaded()
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败'
      updateTask(task.id, { status: 'error', error: message })
      toast.error(`${task.file.name} 上传失败：${message}`)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const clearDone = () => {
    setTasks((prev) => prev.filter((t) => t.status !== 'done' && t.status !== 'error'))
  }

  const doneCount = tasks.filter((t) => t.status === 'done').length
  const errorCount = tasks.filter((t) => t.status === 'error').length

  if (!open) return null

  return (
    <>
      {dragging && (
        <div className="fixed inset-4 z-50 rounded-3xl border-2 border-dashed border-cyan-glow/60 bg-cyan-glow/5 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <UploadCloud className="w-16 h-16 text-cyan-glow mx-auto mb-3 animate-bounce" />
            <p className="text-lg font-display font-semibold text-white">松开以上传文件</p>
          </div>
        </div>
      )}
      {/* 拖拽接收层（全屏） */}
      <div
        className="fixed inset-0 z-40"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      />
      {/* 底部抽屉 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:left-72 p-4">
        <GlassPanel variant="strong" className="max-w-3xl mx-auto overflow-hidden animate-fade-up">
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-glow" />
              <span className="font-display font-semibold text-white">上传队列</span>
              <span className="text-xs text-slate-400">
                ({doneCount}/{tasks.length} 完成{errorCount > 0 ? ` · ${errorCount} 失败` : ''})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearDone}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded transition-colors"
              >
                清除已完成
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 拖拽提示区 */}
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full px-5 py-6 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-cyan-glow hover:bg-cyan-glow/5 transition-all border-b border-white/5"
          >
            <UploadCloud className="w-8 h-8" />
            <span className="text-sm">点击选择文件，或将文件拖拽到此处上传</span>
            <span className="text-[10px] text-slate-500">单文件最大 2GB · 分片上传 · 支持断点续传</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          {/* 任务列表 */}
          <div className="max-h-64 overflow-y-auto scroll-glass">
            {tasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">暂无上传任务</div>
            ) : (
              tasks.map((t) => <UploadRow key={t.id} task={t} />)
            )}
          </div>
        </GlassPanel>
      </div>
    </>
  )
}

function UploadRow({ task }: { task: UploadTask }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 last:border-0">
      <div className="w-8 h-8 rounded-lg glass-subtle flex items-center justify-center shrink-0">
        <FileIcon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-200 truncate">{task.file.name}</span>
          <span className="text-xs text-slate-500 font-mono shrink-0">{formatBytes(task.file.size)}</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              task.status === 'error'
                ? 'bg-rose-500'
                : task.status === 'done'
                ? 'bg-emerald-400'
                : 'bg-gradient-to-r from-cyan-deep to-cyan-glow'
            )}
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 w-8 flex justify-center">
        {task.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {task.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
        {task.status === 'uploading' && <span className="text-xs font-mono text-cyan-glow">{task.progress}%</span>}
        {task.status === 'merging' && <Loader2 className="w-4 h-4 text-cyan-glow animate-spin" />}
        {task.status === 'pending' && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
      </div>
    </div>
  )
}
