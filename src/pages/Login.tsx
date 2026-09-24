import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Cloud, Lock, User as UserIcon, Eye, EyeOff, ArrowRight, UserPlus } from 'lucide-react'
import { GlassPanel, GlassButton, GlassInput } from '@/components/ui/Glass'
import { useAuthStore } from '@/store/auth'
import { useSiteStore } from '@/store/site'
import { authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toast'

type Mode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, initialized } = useAuthStore()
  const site = useSiteStore((s) => s.info)
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
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
    if (mode === 'register' && password !== confirmPwd) {
      toast.error('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      if (mode === 'register') {
        await authApi.register(username, password)
        toast.success('注册成功，请登录')
        setMode('login')
        setPassword('')
        setConfirmPwd('')
        return
      }
      const { forceChangePassword } = await useAuthStore.getState().login(username, password, remember)
      toast.success('登录成功')
      if (forceChangePassword) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : mode === 'register' ? '注册失败' : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6 py-10">
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-3xl glass-strong animate-pulse-glow">
            <Cloud className="w-10 h-10 text-cyan-glow" />
          </div>
          <h1 className="font-display text-4xl font-bold mb-2">
            <span className="text-gradient-cyan">{site.siteName}</span>
          </h1>
          <p className="text-sm text-slate-400">{site.siteDescription}</p>
        </div>

        <GlassPanel variant="strong" className="p-8">
          {/* 登录 / 注册切换 */}
          {site.allowRegister && (
            <div className="grid grid-cols-2 gap-1 p-1 mb-6 glass-subtle rounded-xl">
              {(['login', 'register'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    'py-2 rounded-lg text-sm transition-all ' +
                    (mode === m ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-slate-400 hover:text-white')
                  }
                >
                  {m === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <GlassInput
              label="账号"
              icon={<UserIcon className="w-4 h-4" />}
              placeholder={isRegister ? '3-20 个字符' : '请输入用户名'}
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
                  placeholder={isRegister ? '至少 6 位' : '请输入密码'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
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

            {isRegister && (
              <GlassInput
                label="确认密码"
                icon={<Lock className="w-4 h-4" />}
                type="password"
                placeholder="再次输入密码"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
            )}

            {!isRegister && (
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 accent-cyan-glow"
                />
                记住我（7 天免登录）
              </label>
            )}

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
              icon={!loading ? (isRegister ? <UserPlus className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />) : undefined}
            >
              {isRegister ? '注 册' : '登 录'}
            </GlassButton>
          </form>
        </GlassPanel>
      </div>
    </div>
  )
}
