import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Share2, Trash2, Copy, ExternalLink, Lock, Clock, Globe,
  FolderX, Infinity as InfinityIcon, Link2,
} from 'lucide-react'
import { Sidebar } from '@/components/workbench/Sidebar'
import { GlassPanel, GlassButton, EmptyState, LoadingSpinner } from '@/components/ui/Glass'
import { confirm } from '@/components/ui/Confirm'
import { toast } from '@/components/ui/Toast'
import { sharesApi } from '@/lib/api'
import type { Share } from '@/lib/types'
import { formatBytes, formatDate } from '@/lib/types'

export default function ShareManage() {
  const navigate = useNavigate()
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setShares(await sharesApi.list())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`)
      toast.success('链接已复制')
    } catch {
      toast.error('复制失败')
    }
  }

  const handleRemove = (s: Share) => {
    confirm({
      title: '取消分享',
      message: `取消「${s.fileName}」的分享？链接将立即失效。`,
      danger: true,
      onConfirm: async () => {
        await sharesApi.remove(s.id)
        toast.success('已取消分享')
        load()
      },
    })
  }

  const isExpired = (s: Share) => s.expireAt && new Date(s.expireAt) < new Date()

  return (
    <div className="relative z-10 h-[100dvh] flex overflow-hidden">
      <Sidebar open={false} onClose={() => {}} />
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 lg:pl-0 overflow-hidden">
        <GlassPanel variant="strong" className="px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-glow/15 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-cyan-glow" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-white">我的分享</h2>
            <p className="text-xs text-slate-400 mt-0.5">管理你创建的分享链接</p>
          </div>
        </GlassPanel>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-glass">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner size={36} />
            </div>
          ) : shares.length === 0 ? (
            <EmptyState
              icon={<FolderX className="w-8 h-8" />}
              title="还没有分享"
              description="在文件列表中右键或点击分享按钮，即可生成分享链接"
              action={
                <RouterLink to="/">
                  <GlassButton variant="primary">去文件列表</GlassButton>
                </RouterLink>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shares.map((s) => {
                const expired = isExpired(s)
                return (
                  <GlassPanel key={s.id} className="p-4 group hover:border-cyan-glow/30 transition-all duration-300 animate-fade-up">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl glass-subtle flex items-center justify-center shrink-0">
                        <Share2 className="w-5 h-5 text-cyan-glow" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white truncate">{s.fileName}</span>
                          {expired && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 shrink-0">已过期</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>{s.fileType === 'folder' ? '文件夹' : formatBytes(s.fileSize)}</span>
                          <span>下载 {s.downloads} 次</span>
                          <span>{formatDate(s.createdAt)}</span>
                        </div>
                        {/* 标签 */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {s.hasPassword && (
                            <Tag icon={<Lock className="w-3 h-3" />} text="需密码" color="amber" />
                          )}
                          {s.expireAt ? (
                            <Tag icon={<Clock className="w-3 h-3" />} text={expired ? '已过期' : `至 ${formatDate(s.expireAt)}`} color={expired ? 'rose' : 'cyan'} />
                          ) : (
                            <Tag icon={<InfinityIcon className="w-3 h-3" />} text="永久" color="cyan" />
                          )}
                          {s.downloadLimit && (
                            <Tag icon={<Globe className="w-3 h-3" />} text={`限 ${s.downloadLimit} 次`} color="cyan" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 链接 */}
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl glass-subtle">
                      <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-xs font-mono text-slate-400 truncate flex-1">
                        {window.location.origin}/s/{s.token}
                      </span>
                      <button
                        onClick={() => handleCopy(s.token)}
                        className="text-slate-400 hover:text-cyan-glow shrink-0"
                        title="复制链接"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 操作 */}
                    <div className="mt-3 flex gap-2">
                      <GlassButton size="sm" variant="glass" className="flex-1" onClick={() => navigate(`/s/${s.token}`)}>
                        <ExternalLink className="w-3.5 h-3.5" /> 打开
                      </GlassButton>
                      <GlassButton size="sm" variant="glass" onClick={() => handleCopy(s.token)}>
                        <Copy className="w-3.5 h-3.5" /> 复制
                      </GlassButton>
                      <GlassButton size="sm" variant="danger" onClick={() => handleRemove(s)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </GlassButton>
                    </div>
                  </GlassPanel>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Tag({ icon, text, color }: { icon: React.ReactNode; text: string; color: 'cyan' | 'amber' | 'rose' }) {
  const colors = {
    cyan: 'bg-cyan-500/10 text-cyan-glow border-cyan-glow/20',
    amber: 'bg-amber-500/10 text-amber-glow border-amber-glow/20',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-400/20',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${colors[color]}`}>
      {icon}
      {text}
    </span>
  )
}
