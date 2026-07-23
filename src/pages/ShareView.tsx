import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  Cloud, Lock, Download, Clock, Globe, AlertCircle,
  Infinity as InfinityIcon,
} from 'lucide-react'
import { GlassPanel, GlassButton, GlassInput, LoadingSpinner } from '@/components/ui/Glass'
import { FileIcon } from '@/components/FileIcon'
import { sharesApi } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { formatBytes, formatDate, type ShareView as ShareViewType } from '@/lib/types'

export default function ShareView() {
  const { token } = useParams<{ token: string }>()
  const [view, setView] = useState<ShareViewType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needPassword, setNeedPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const v = await sharesApi.view(token)
        if (cancelled) return
        setView(v)
        setNeedPassword(v.hasPassword && !verified)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '分享不存在')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const onSubmitPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !password) return
    try {
      await sharesApi.verify(token, password)
      setVerified(true)
      setNeedPassword(false)
      toast.success('验证成功')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '验证失败')
    }
  }

  const onDownload = () => {
    if (!token) return
    const a = document.createElement('a')
    a.href = sharesApi.downloadUrl(token, verified ? password : undefined)
    a.click()
    toast.info('开始下载...')
  }

  return (
    <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 py-10">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-3 rounded-3xl glass-strong animate-pulse-glow">
            <Cloud className="w-8 h-8 text-cyan-glow" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">WebFtp 分享</h1>
        </div>

        {loading ? (
          <GlassPanel variant="strong" className="p-12 flex flex-col items-center gap-3">
            <LoadingSpinner size={32} />
            <p className="text-sm text-slate-400">正在加载分享...</p>
          </GlassPanel>
        ) : error ? (
          <GlassPanel variant="strong" className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
            <h2 className="text-lg font-display font-semibold text-white mb-1">分享不可用</h2>
            <p className="text-sm text-slate-400">{error}</p>
          </GlassPanel>
        ) : view ? (
          needPassword ? (
            <GlassPanel variant="strong" className="p-8 animate-fade-up">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 mb-3 rounded-2xl glass-subtle">
                  <Lock className="w-7 h-7 text-amber-glow" />
                </div>
                <h2 className="font-display text-lg font-semibold text-white mb-1">需要提取码</h2>
                <p className="text-sm text-slate-400">此分享设置了访问密码</p>
              </div>
              <form onSubmit={onSubmitPassword} className="space-y-4">
                <GlassInput
                  autoFocus
                  type="text"
                  icon={<Lock className="w-4 h-4" />}
                  placeholder="请输入提取码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <GlassButton type="submit" variant="primary" className="w-full">
                  验证
                </GlassButton>
              </form>
            </GlassPanel>
          ) : (
            <GlassPanel variant="strong" className="p-8 animate-fade-up">
              {/* 文件预览 */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-20 h-20 mb-4 rounded-3xl glass-subtle flex items-center justify-center">
                  <FileIcon
                    file={{ type: view.file.type as 'file' | 'folder', mimeType: view.file.mimeType, ext: view.file.ext }}
                    size={64}
                  />
                </div>
                <h2 className="font-display text-lg font-semibold text-white mb-1 break-all px-4">
                  {view.file.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {view.file.type === 'folder' ? '文件夹' : formatBytes(view.file.size)}
                  {' · '}
                  分享于 {formatDate(view.createdAt)}
                </p>
              </div>

              {/* 信息标签 */}
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {view.hasPassword && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-amber-500/10 text-amber-glow border border-amber-glow/20">
                    <Lock className="w-3 h-3" /> 需密码
                  </span>
                )}
                {view.expireAt ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-cyan-500/10 text-cyan-glow border border-cyan-glow/20">
                    <Clock className="w-3 h-3" /> 有效期至 {formatDate(view.expireAt)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-cyan-500/10 text-cyan-glow border border-cyan-glow/20">
                    <InfinityIcon className="w-3 h-3" /> 永久有效
                  </span>
                )}
                {view.downloadLimit && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-violet-500/10 text-violet-300 border border-violet-400/20">
                    <Globe className="w-3 h-3" /> 剩余 {Math.max(0, view.downloadLimit - view.downloads)} 次下载
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-white/5 text-slate-400 border border-white/10">
                  已下载 {view.downloads} 次
                </span>
              </div>

              <GlassButton variant="primary" size="lg" className="w-full" icon={<Download className="w-4 h-4" />} onClick={onDownload}>
                下载文件
              </GlassButton>

              <p className="text-center text-xs text-slate-500 mt-4">
                通过 WebFtp 自托管网盘系统分享
              </p>
            </GlassPanel>
          )
        ) : null}
      </div>
    </div>
  )
}
