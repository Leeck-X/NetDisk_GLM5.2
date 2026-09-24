import { useCallback, useEffect, useState } from 'react'
import { Folder, FolderOpen, ChevronRight, Move } from 'lucide-react'
import { GlassModal, GlassButton, LoadingSpinner } from '@/components/ui/Glass'
import { toast } from '@/components/ui/Toast'
import { filesApi } from '@/lib/api'
import type { AppFile } from '@/lib/types'

interface MoveDialogProps {
  /** 待移动的文件/文件夹；为空表示关闭 */
  files: AppFile[]
  onClose: () => void
  onMoved: () => void
}

/**
 * 移动目标选择器
 * 逐层浏览文件夹并选定目标目录，用于右键菜单与批量工具栏的「移动到」。
 */
export function MoveDialog({ files, onClose, onMoved }: MoveDialogProps) {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [folders, setFolders] = useState<AppFile[]>([])
  const [loading, setLoading] = useState(false)
  const [moving, setMoving] = useState(false)
  // 已进入过的层级，用于面包屑回退
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: '全部文件' },
  ])

  const movingIds = files.map((f) => f.id)
  const open = files.length > 0

  const loadFolders = useCallback(async (parentId: string | null) => {
    setLoading(true)
    try {
      const list = await filesApi.list(parentId)
      // 不能移动到自身，避免形成环
      setFolders(list.filter((f) => f.type === 'folder' && !movingIds.includes(f.id)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  useEffect(() => {
    if (!open) return
    setCurrentId(null)
    setTrail([{ id: null, name: '全部文件' }])
    loadFolders(null)
  }, [open, loadFolders])

  const enterFolder = (folder: AppFile) => {
    setCurrentId(folder.id)
    setTrail((prev) => [...prev, { id: folder.id, name: folder.name }])
    loadFolders(folder.id)
  }

  const goTo = (index: number) => {
    const target = trail[index]
    setTrail((prev) => prev.slice(0, index + 1))
    setCurrentId(target.id)
    loadFolders(target.id)
  }

  const onConfirm = async () => {
    if (movingIds.length === 0) return
    setMoving(true)
    try {
      await filesApi.move(movingIds, currentId)
      toast.success(`已移动 ${movingIds.length} 项`)
      onMoved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移动失败')
    } finally {
      setMoving(false)
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title={`移动到…（已选 ${movingIds.length} 项）`}>
      <div className="space-y-4">
        {/* 面包屑 */}
        <div className="flex items-center gap-1 flex-wrap text-xs glass-subtle rounded-xl px-3 py-2">
          {trail.map((t, i) => (
            <span key={`${t.id ?? 'root'}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
              <button
                onClick={() => goTo(i)}
                className={
                  i === trail.length - 1
                    ? 'text-cyan-glow'
                    : 'text-slate-400 hover:text-white transition-colors'
                }
              >
                {t.name}
              </button>
            </span>
          ))}
        </div>

        {/* 文件夹列表 */}
        <div className="h-56 overflow-y-auto scroll-glass space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner size={28} />
            </div>
          ) : folders.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-16">
              当前目录下没有子文件夹，可直接移动到这里
            </p>
          ) : (
            folders.map((f) => (
              <button
                key={f.id}
                onClick={() => enterFolder(f)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-cyan-glow/10 hover:text-cyan-glow transition-colors"
              >
                <Folder className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1 text-left">{f.name}</span>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            ))
          )}
        </div>

        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5" />
          目标目录：{trail[trail.length - 1].name}
        </p>

        <div className="flex gap-3">
          <GlassButton variant="glass" onClick={onClose} className="flex-1">取消</GlassButton>
          <GlassButton
            variant="primary"
            loading={moving}
            onClick={onConfirm}
            className="flex-1"
            icon={<Move className="w-4 h-4" />}
          >
            移动到这里
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  )
}
