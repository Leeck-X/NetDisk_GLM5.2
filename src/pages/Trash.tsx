import { useCallback, useEffect, useState } from 'react'
import { Trash2, RotateCcw, XCircle, FolderX, AlertTriangle } from 'lucide-react'
import { Sidebar } from '@/components/workbench/Sidebar'
import { FileCard } from '@/components/workbench/FileCard'
import { GlassPanel, GlassButton, EmptyState, LoadingSpinner } from '@/components/ui/Glass'
import { confirm } from '@/components/ui/Confirm'
import { toast } from '@/components/ui/Toast'
import { filesApi } from '@/lib/api'
import type { AppFile } from '@/lib/types'

export default function Trash() {
  const [files, setFiles] = useState<AppFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setFiles(await filesApi.trash())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRestore = async (ids: string[]) => {
    confirm({
      title: '恢复文件',
      message: `确定要恢复 ${ids.length} 个项目？`,
      onConfirm: async () => {
        await filesApi.restore(ids)
        toast.success(`已恢复 ${ids.length} 项`)
        load()
        setSelected(new Set())
      },
    })
  }

  const handlePurge = (ids: string[]) => {
    confirm({
      title: '彻底删除',
      message: `确定要彻底删除 ${ids.length} 个项目？此操作不可恢复！`,
      danger: true,
      onConfirm: async () => {
        await filesApi.purge(ids)
        toast.success('已彻底删除')
        load()
        setSelected(new Set())
      },
    })
  }

  const handleClearAll = () => {
    confirm({
      title: '清空回收站',
      message: '将永久删除回收站中的所有文件，且不可恢复。确定继续？',
      danger: true,
      confirmText: '全部清空',
      onConfirm: async () => {
        await filesApi.clearTrash()
        toast.success('回收站已清空')
        load()
      },
    })
  }

  return (
    <div className="relative z-10 h-[100dvh] flex overflow-hidden">
      <Sidebar open={false} onClose={() => {}} />
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 lg:pl-0 overflow-hidden">
        <GlassPanel variant="strong" className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-white">回收站</h2>
              <p className="text-xs text-slate-400 mt-0.5">回收站文件将在 30 天后自动清理</p>
            </div>
          </div>
          {files.length > 0 && (
            <GlassButton variant="danger" icon={<XCircle className="w-4 h-4" />} onClick={handleClearAll}>
              清空回收站
            </GlassButton>
          )}
        </GlassPanel>

        {selected.size > 0 && (
          <GlassPanel variant="subtle" className="px-4 py-2.5 flex items-center justify-between animate-fade-up">
            <span className="text-sm text-slate-300">已选中 {selected.size} 项</span>
            <div className="flex gap-2">
              <GlassButton size="sm" variant="primary" icon={<RotateCcw className="w-4 h-4" />} onClick={() => handleRestore(Array.from(selected))}>
                恢复
              </GlassButton>
              <GlassButton size="sm" variant="danger" onClick={() => handlePurge(Array.from(selected))}>
                彻底删除
              </GlassButton>
              <GlassButton size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                取消
              </GlassButton>
            </div>
          </GlassPanel>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto scroll-glass" onClick={() => setSelected(new Set())}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner size={36} />
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<FolderX className="w-8 h-8" />}
              title="回收站为空"
              description="删除的文件会进入回收站，可在此恢复或彻底删除"
            />
          ) : (
            <>
              <GlassPanel variant="subtle" className="mb-3 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-glow shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">回收站中的文件仍占用存储空间，彻底删除后才会释放配额。</p>
              </GlassPanel>
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={f.id} className="opacity-70 hover:opacity-100 transition-opacity">
                    <FileCard
                      file={f}
                      index={i}
                      selected={selected.has(f.id)}
                      onSelect={(id) => setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(id)) next.delete(id)
                        else next.add(id)
                        return next
                      })}
                      onOpen={(f) => {
                        if (f.type === 'folder') return
                        confirm({
                          title: '恢复此文件？',
                          message: `恢复「${f.name}」后即可正常访问。`,
                          confirmText: '恢复',
                          onConfirm: async () => {
                            await filesApi.restore([f.id])
                            toast.success('已恢复')
                            load()
                          },
                        })
                      }}
                      onMenu={(file, x, y) => {
                        confirm({
                          title: '彻底删除',
                          message: `彻底删除「${file.name}」？此操作不可恢复。`,
                          danger: true,
                          onConfirm: async () => {
                            await filesApi.purge([file.id])
                            toast.success('已彻底删除')
                            load()
                          },
                        })
                      }}
                      onShare={() => toast.info('回收站文件无法分享')}
                      onRename={() => toast.info('请先恢复文件')}
                      onDelete={() => handlePurge([f.id])}
                      onStarToggle={() => toast.info('请先恢复文件')}
                      view="list"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
