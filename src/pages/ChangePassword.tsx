import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, ArrowLeft, ShieldAlert } from 'lucide-react'
import { GlassPanel, GlassButton, GlassInput } from '@/components/ui/Glass'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/Toast'

export default function ChangePassword() {
  const navigate = useNavigate()
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!oldPassword || !newPassword) {
      toast.error('请填写完整')
      return
    }
    if (newPassword.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次密码不一致')
      return
    }
    setLoading(true)
    try {
      await authApi.changePassword(oldPassword, newPassword)
      await fetchMe()
      toast.success('密码修改成功')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-3xl glass-strong">
            <KeyRound className="w-8 h-8 text-amber-glow" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white mb-1">修改密码</h1>
          <p className="text-sm text-slate-400">为了账号安全，请设置新密码</p>
        </div>

        <GlassPanel variant="strong" className="p-6 mb-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-glow shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            检测到当前使用默认密码，存在安全风险。请立即修改为强密码后再继续使用系统。
          </p>
        </GlassPanel>

        <GlassPanel variant="strong" className="p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            <GlassInput
              label="原密码"
              type="password"
              placeholder="请输入当前密码"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <GlassInput
              label="新密码"
              type="password"
              placeholder="至少 6 位"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <GlassInput
              label="确认新密码"
              type="password"
              placeholder="再次输入新密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="flex gap-3">
              <GlassButton type="button" variant="glass" onClick={() => navigate('/')} className="flex-1">
                <ArrowLeft className="w-4 h-4" /> 稍后
              </GlassButton>
              <GlassButton type="submit" variant="primary" loading={loading} className="flex-1">
                确认修改
              </GlassButton>
            </div>
          </form>
        </GlassPanel>
      </div>
    </div>
  )
}
