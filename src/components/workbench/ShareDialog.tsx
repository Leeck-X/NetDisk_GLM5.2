import { useEffect, useMemo, useState } from 'react'
import { Copy, Check, Link2, Lock, Clock, Globe } from 'lucide-react'
import { GlassModal, GlassButton, GlassInput } from '@/components/ui/Glass'
import { sharesApi } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { useSiteStore } from '@/store/site'
import { cn } from '@/lib/utils'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  fileId: string | null
  fileName?: string
}

const BASE_EXPIRE_OPTIONS = [
  { label: '永久', days: 0 },
  { label: '1 天', days: 1 },
  { label: '7 天', days: 7 },
  { label: '30 天', days: 30 },
]

/** 选项按天数升序排列，便于把后台配置的默认值插入到正确位置 */
function buildExpireOptions(defaultDays: number) {
  const days = new Set(BASE_EXPIRE_OPTIONS.map((o) => o.days))
  if (defaultDays > 0 && !days.has(defaultDays)) {
    days.add(defaultDays)
  }
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => ({ days: d, label: d === 0 ? '永久' : `${d} 天` }))
}

export function ShareDialog({ open, onClose, fileId, fileName }: ShareDialogProps) {
  const defaultExpireDays = useSiteStore((s) => s.info.shareDefaultExpireDays)
  const expireOptions = useMemo(() => buildExpireOptions(defaultExpireDays), [defaultExpireDays])
  const [password, setPassword] = useState('')
  const [expireDays, setExpireDays] = useState(defaultExpireDays)
  const [downloadLimit, setDownloadLimit] = useState('')
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ token: string; expireAt: string | null; hasPassword: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setExpireDays(defaultExpireDays)
      setDownloadLimit('')
      setResult(null)
      setCopied(false)
    }
  }, [open, defaultExpireDays])

  const onCreate = async () => {
    if (!fileId) return
    setCreating(true)
    try {
      const r = await sharesApi.create({
        fileId,
        password: password || undefined,
        expireDays,
        downloadLimit: downloadLimit ? parseInt(downloadLimit, 10) : undefined,
      })
      setResult(r)
      toast.success('分享链接已生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const shareUrl = result ? `${window.location.origin}/s/${result.token}` : ''

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('链接已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title={result ? '分享已创建' : '创建分享'} width="max-w-lg">
      {!result ? (
        <div className="space-y-5">
          {fileName && (
            <div className="px-4 py-3 rounded-xl glass-subtle">
              <p className="text-xs text-slate-500 mb-0.5">分享文件</p>
              <p className="text-sm text-white font-medium truncate">{fileName}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 ml-1">有效期</label>
            <div className="grid grid-cols-4 gap-2">
              {expireOptions.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => setExpireDays(opt.days)}
                  className={cn(
                    'py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border',
                    expireDays === opt.days
                      ? 'bg-cyan-glow/15 border-cyan-glow/50 text-cyan-glow'
                      : 'glass-subtle border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <GlassInput
            label="访问密码（可选，留空则无密码）"
            type="text"
            icon={<Lock className="w-4 h-4" />}
            placeholder="设置提取码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <GlassInput
            label="下载次数限制（可选，留空则不限）"
            type="number"
            icon={<Globe className="w-4 h-4" />}
            placeholder="如 100"
            value={downloadLimit}
            onChange={(e) => setDownloadLimit(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <GlassButton variant="glass" onClick={onClose} className="flex-1">
              取消
            </GlassButton>
            <GlassButton variant="primary" onClick={onCreate} loading={creating} className="flex-1">
              生成链接
            </GlassButton>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">分享链接已就绪</p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                {result.hasPassword && <><Lock className="w-3 h-3" /> 需密码</>}
                {result.expireAt && <><Clock className="w-3 h-3" /> 至 {new Date(result.expireAt).toLocaleDateString()}</>}
                {!result.expireAt && !result.hasPassword && '永久有效 · 无密码'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">分享链接</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                readOnly
                value={shareUrl}
                className="glass-input pl-10 pr-24 font-mono text-xs"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={onCopy}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-cyan-glow/20 text-cyan-glow text-xs font-medium hover:bg-cyan-glow/30 transition-colors flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          <GlassButton variant="primary" onClick={onClose} className="w-full">
            完成
          </GlassButton>
        </div>
      )}
    </GlassModal>
  )
}
