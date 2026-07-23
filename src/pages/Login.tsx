import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Cloud, Lock, User as UserIcon, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { GlassPanel, GlassButton, GlassInput } from '@/components/ui/Glass'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/Toast'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, initialized } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!initialized) useAuthStore.getState().initialize()
  }, [initialized])

  useEffect(() => {
    if (user) {
      const from = (location.state as { from?: string })?.from || '/'
      navigate(from, { replace: true })
    }
  }, [user, navigate, location.state])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('请输入账号与密码')
      return
    }
    setLoading(true)
    try {
      const { forceChangePassword } = await useAuthStore.getState().login(username, password, remember)
      toast.success('登录成功')
      if (forceChangePassword) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 py-10">
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-3xl glass-strong animate-pulse-glow">
            <Cloud className="w-10 h-10 text-cyan-glow" />
          </div>
          <h1 className="font-display text-4xl font-bold mb-2">
            <span className="text-gradient-cyan">WebFtp</span>
          </h1>
          <p className="text-sm text-slate-400">自托管网盘系统 · 数据尽在掌握</p>
        </div>

        <GlassPanel variant="strong" className="p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            <GlassInput
              label="账号"
              icon={<UserIcon className="w-4 h-4" />}
              placeholder="请输入用户名"
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="glass-input pl-10 pr-10"
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-glow transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 accent-cyan-glow"
              />
              记住我（7 天免登录）
            </label>

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
              icon={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
            >
              登 录
            </GlassButton>
          </form>
        </GlassPanel>
      </div>
    </div>
  )
}
