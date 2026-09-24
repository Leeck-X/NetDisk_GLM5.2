import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Users, Settings, Cloud, HardDrive, FileText,
  Share2, FolderPlus, TrendingUp, ArrowLeft, UserPlus, KeyRound,
  Power, Trash2, ShieldAlert, ShieldCheck,
} from 'lucide-react'
import { Sidebar } from '@/components/workbench/Sidebar'
import { GlassPanel, GlassButton, GlassInput, EmptyState, LoadingSpinner } from '@/components/ui/Glass'
import { GlassModal } from '@/components/ui/Glass'
import { confirm } from '@/components/ui/Confirm'
import { toast } from '@/components/ui/Toast'
import { adminApi } from '@/lib/api'
import type { AdminStats, AdminUser } from '@/lib/types'
import { formatBytes, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function Admin() {
  return (
    <div className="relative z-10 h-[100dvh] flex overflow-hidden">
      <Sidebar open={false} onClose={() => {}} />
      <div className="flex-1 min-h-0 overflow-y-auto scroll-glass p-4 lg:pl-0">
        <AdminNav />
        <div className="mt-4">
          <Routes>
            <Route path="stats" element={<StatsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="config" element={<ConfigPage />} />
            <Route path="*" element={<StatsPage />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

function AdminNav() {
  const location = useLocation()
  const items = [
    { to: '/admin/stats', label: '系统统计', icon: LayoutDashboard },
    { to: '/admin/users', label: '用户管理', icon: Users },
    { to: '/admin/config', label: '系统配置', icon: Settings },
  ]
  return (
    <GlassPanel variant="strong" className="px-3 py-2 flex items-center gap-1 overflow-x-auto scroll-glass">
      <Link to="/" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0">
        <ArrowLeft className="w-4 h-4" />
      </Link>
      <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
      {items.map((item) => {
        const active = location.pathname.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors shrink-0',
              active ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-slate-400 hover:text-white hover:bg-white/5'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        )
      })}
    </GlassPanel>
  )
}

/* ============ 统计页 ============ */
function StatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.stats().then(setStats).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size={36} />
      </div>
    )
  }

  const maxDaily = Math.max(...stats.daily.map((d) => d.count), 1)
  const categoryColors: Record<string, string> = {
    image: 'bg-violet-400',
    video: 'bg-rose-400',
    audio: 'bg-amber-400',
    doc: 'bg-sky-400',
    archive: 'bg-emerald-400',
    other: 'bg-slate-400',
  }
  const totalCat = stats.category.reduce((s, c) => s + c.count, 0) || 1

  return (
    <div className="space-y-4">
      {/* 数据卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="用户数" value={stats.userCount} color="cyan" />
        <StatCard icon={FileText} label="文件数" value={stats.fileCount} color="violet" />
        <StatCard icon={Share2} label="分享数" value={stats.shareCount} color="amber" />
        <StatCard icon={HardDrive} label="存储用量" value={stats.totalSizeHuman} color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 存储用量 */}
        <GlassPanel variant="strong" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">存储空间</h3>
            <TrendingUp className="w-4 h-4 text-cyan-glow" />
          </div>
          <div className="flex items-end justify-between mb-3">
            <span className="text-3xl font-display font-bold text-white">{stats.totalSizeHuman}</span>
            <span className="text-xs text-slate-500">/ {stats.totalQuotaHuman}</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-deep to-cyan-glow transition-all duration-500"
              style={{ width: `${stats.usedPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">已使用 {stats.usedPercent}% · 总配额 {stats.totalQuotaHuman}</p>
        </GlassPanel>

        {/* 文件类型分布 */}
        <GlassPanel variant="strong" className="p-5">
          <h3 className="font-display font-semibold text-white mb-4">文件类型分布</h3>
          {totalCat === 1 && stats.fileCount === 0 ? (
            <EmptyState icon={<FolderPlus className="w-6 h-6" />} title="暂无数据" />
          ) : (
            <div className="space-y-2.5">
              {stats.category.map((c) => (
                <div key={c.cat} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-12 capitalize">{c.cat}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', categoryColors[c.cat] || 'bg-slate-400')}
                      style={{ width: `${(c.count / totalCat) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-300 font-mono w-10 text-right">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      {/* 近 7 天上传趋势 */}
      <GlassPanel variant="strong" className="p-5">
        <h3 className="font-display font-semibold text-white mb-4">近 7 天上传趋势</h3>
        {stats.daily.length === 0 ? (
          <EmptyState icon={<TrendingUp className="w-6 h-6" />} title="暂无上传记录" />
        ) : (
          <div className="flex items-end gap-2 h-40">
            {stats.daily.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group">
                <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.count} 个
                </span>
                <div className="w-full bg-white/5 rounded-t-lg overflow-hidden flex items-end" style={{ height: '120px' }}>
                  <div
                    className="w-full bg-gradient-to-t from-cyan-deep to-cyan-glow rounded-t-lg transition-all duration-500 group-hover:shadow-glow-cyan"
                    style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: '2px' }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    cyan: 'text-cyan-glow bg-cyan-glow/10',
    violet: 'text-violet-400 bg-violet-500/10',
    amber: 'text-amber-glow bg-amber-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
  }
  return (
    <GlassPanel className="p-4 flex items-center gap-3 animate-fade-up">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colors[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-lg font-display font-bold text-white">{value}</p>
      </div>
    </GlassPanel>
  )
}

/* ============ 用户管理页 ============ */
function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await adminApi.users())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = (u: AdminUser) => {
    if (u.isSuper) {
      toast.error('超级管理员不可删除')
      return
    }
    if (u.role === 'admin') {
      toast.error('请先将该管理员降级为普通用户，再进行删除')
      return
    }
    // 二次确认：第一层确认后，延迟弹出第二层最终确认
    confirm({
      title: '删除用户',
      message: `确定要删除用户「${u.username}」吗？该用户的所有文件将被永久清除。`,
      danger: true,
      confirmText: '继续',
      onConfirm: () => {
        setTimeout(() => {
          confirm({
            title: '二次确认',
            message: `即将永久删除用户「${u.username}」及其全部文件，此操作不可恢复。请再次确认。`,
            danger: true,
            confirmText: '我确认删除',
            onConfirm: async () => {
              await adminApi.deleteUser(u.id)
              toast.success('用户已删除')
              load()
            },
          })
        }, 60)
      },
    })
  }

  const handleToggleEnabled = async (u: AdminUser) => {
    if (u.isSuper && u.enabled) {
      toast.error('超级管理员不可禁用')
      return
    }
    try {
      await adminApi.updateUser(u.id, { enabled: !u.enabled })
      toast.success(u.enabled ? '已禁用' : '已启用')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleForceChange = (u: AdminUser) => {
    confirm({
      title: '要求强制改密',
      message: `用户「${u.username}」下次登录时将被强制修改密码，确定继续？`,
      danger: true,
      confirmText: '确定',
      onConfirm: async () => {
        await adminApi.forceChange(u.id, true)
        toast.success('已要求下次登录改密')
        load()
      },
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size={36} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <GlassPanel variant="strong" className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-cyan-glow" />
          <span className="font-display font-semibold text-white">用户管理</span>
          <span className="text-xs text-slate-400">（{users.length}）</span>
        </div>
        <GlassButton variant="primary" size="sm" icon={<UserPlus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
          新建用户
        </GlassButton>
      </GlassPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {users.map((u) => (
          <GlassPanel key={u.id} className="p-4 animate-fade-up">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-glow to-cyan-deep flex items-center justify-center text-midnight-900 font-bold shrink-0">
                {u.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate">{u.username}</span>
                  {u.isSuper ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-glow/15 text-cyan-glow border border-cyan-glow/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> 超级管理员
                    </span>
                  ) : u.role === 'admin' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-glow border border-amber-glow/20">
                      管理员
                    </span>
                  )}
                  {!u.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-400/20">
                      禁用
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{formatDate(u.created_at)}</p>
              </div>
            </div>

            {/* 配额 */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">存储</span>
                <span className="text-slate-300 font-mono">{u.usedHuman} / {u.quotaHuman}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-deep to-cyan-glow"
                  style={{ width: `${u.usedPercent}%` }}
                />
              </div>
            </div>

            {/* 操作 */}
            <div className="flex flex-wrap gap-1.5">
              <GlassButton size="sm" variant="glass" onClick={() => setEditUser(u)}>
                <KeyRound className="w-3.5 h-3.5" /> 编辑
              </GlassButton>
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => handleToggleEnabled(u)}
                disabled={u.isSuper && u.enabled}
                title={u.isSuper ? '超级管理员不可禁用' : (u.enabled ? '禁用' : '启用')}
              >
                <Power className="w-3.5 h-3.5" />
              </GlassButton>
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => handleForceChange(u)}
                title="要求改密"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
              </GlassButton>
              <GlassButton
                size="sm"
                variant="danger"
                onClick={() => handleDelete(u)}
                disabled={u.isSuper || u.role === 'admin'}
                title={u.isSuper ? '超级管理员不可删除' : (u.role === 'admin' ? '请先降级为普通用户' : '删除')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </GlassButton>
            </div>
          </GlassPanel>
        ))}
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />
    </div>
  )
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [quotaGB, setQuotaGB] = useState('1')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)

  const onSubmit = async () => {
    if (!username || !password) {
      toast.error('请填写完整')
      return
    }
    setLoading(true)
    try {
      await adminApi.createUser({
        username,
        password,
        role,
        quotaBytes: parseInt(quotaGB, 10) * 1024 * 1024 * 1024,
      })
      toast.success('用户已创建')
      setUsername('')
      setPassword('')
      setQuotaGB('1')
      setRole('user')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title="新建用户">
      <div className="space-y-4">
        <GlassInput label="用户名" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="登录账号" />
        <GlassInput label="初始密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">角色</label>
          <div className="grid grid-cols-2 gap-2">
            {['user', 'admin'].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  'py-2 rounded-xl text-sm border transition-all',
                  role === r ? 'bg-cyan-glow/15 border-cyan-glow/50 text-cyan-glow' : 'glass-subtle border-white/10 text-slate-400 hover:text-white'
                )}
              >
                {r === 'user' ? '普通用户' : '管理员'}
              </button>
            ))}
          </div>
        </div>
        <GlassInput label="存储配额（GB）" type="number" value={quotaGB} onChange={(e) => setQuotaGB(e.target.value)} />
        <div className="flex gap-3">
          <GlassButton variant="glass" onClick={onClose} className="flex-1">取消</GlassButton>
          <GlassButton variant="primary" loading={loading} onClick={onSubmit} className="flex-1">创建</GlassButton>
        </div>
      </div>
    </GlassModal>
  )
}

function EditUserModal({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('')
  const [quotaGB, setQuotaGB] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setPassword('')
      setQuotaGB(String(Math.round(user.quotaBytes / 1024 / 1024 / 1024)))
      setRole(user.role)
    }
  }, [user])

  const onSave = async () => {
    if (!user) return
    setLoading(true)
    try {
      const updates: { password?: string; quotaBytes?: number; role?: string } = {}
      if (password) updates.password = password
      if (quotaGB) updates.quotaBytes = parseInt(quotaGB, 10) * 1024 * 1024 * 1024
      if (role !== user.role) updates.role = role
      if (Object.keys(updates).length === 0) {
        toast.info('未做修改')
        onClose()
        return
      }
      await adminApi.updateUser(user.id, updates)
      toast.success('已保存')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const roleLocked = !!user?.isSuper

  return (
    <GlassModal open={!!user} onClose={onClose} title={`编辑用户 · ${user?.username}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">重置密码</label>
          <input
            type="password"
            className="glass-input"
            placeholder="留空则不修改"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <GlassInput label="存储配额（GB）" type="number" value={quotaGB} onChange={(e) => setQuotaGB(e.target.value)} />
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">角色</label>
          {roleLocked ? (
            <div className="text-xs text-cyan-glow/80 glass-subtle border border-cyan-glow/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" /> 超级管理员角色不可更改
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {['user', 'admin'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    'py-2 rounded-xl text-sm border transition-all',
                    role === r ? 'bg-cyan-glow/15 border-cyan-glow/50 text-cyan-glow' : 'glass-subtle border-white/10 text-slate-400 hover:text-white'
                  )}
                >
                  {r === 'user' ? '普通用户' : '管理员'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <GlassButton variant="glass" onClick={onClose} className="flex-1">取消</GlassButton>
          <GlassButton variant="primary" loading={loading} onClick={onSave} className="flex-1">保存</GlassButton>
        </div>
      </div>
    </GlassModal>
  )
}

/* ============ 配置页 ============ */
function ConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConfig(await adminApi.config())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onSave = async () => {
    setSaving(true)
    try {
      await adminApi.updateConfig(config)
      toast.success('配置已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size={36} />
      </div>
    )
  }

  const configItems = [
    { key: 'site_name', label: '站点名称', placeholder: 'WebFtp', desc: '显示在浏览器标签与登录页' },
    { key: 'upload_max_size', label: '单文件大小上限（MB）', placeholder: '2048', desc: '单个上传文件大小限制' },
    { key: 'default_quota_gb', label: '新用户默认配额（GB）', placeholder: '1', desc: '创建新用户时的默认存储配额' },
    { key: 'share_default_expire_days', label: '分享默认有效期（天）', placeholder: '7', desc: '创建分享时的默认有效天数，0 为永久' },
  ]

  return (
    <div className="space-y-4">
      <GlassPanel variant="strong" className="px-5 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl glass-subtle flex items-center justify-center">
          <Settings className="w-5 h-5 text-cyan-glow" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-white">系统配置</h2>
          <p className="text-xs text-slate-400 mt-0.5">站点与上传相关的全局配置</p>
        </div>
      </GlassPanel>

      <GlassPanel variant="strong" className="p-5 space-y-4">
        {configItems.map((item) => (
          <div key={item.key}>
            <label className="block text-sm font-medium text-slate-200 mb-1">{item.label}</label>
            <p className="text-xs text-slate-500 mb-2">{item.desc}</p>
            <input
              className="glass-input"
              placeholder={item.placeholder}
              value={config[item.key] || ''}
              onChange={(e) => setConfig({ ...config, [item.key]: e.target.value })}
            />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <GlassButton variant="primary" loading={saving} onClick={onSave}>保存配置</GlassButton>
        </div>
      </GlassPanel>

      <GlassPanel variant="subtle" className="p-4 flex items-start gap-3">
        <Cloud className="w-5 h-5 text-cyan-glow shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <p className="text-slate-300 font-medium mb-1">部署信息</p>
          存储根目录：<span className="font-mono text-cyan-glow">./storage/</span>
          {' · '}数据库：<span className="font-mono text-cyan-glow">./data/webftp.db</span>
          <br />
          所有数据均存储在服务器本地，建议定期备份 <span className="font-mono">data/</span> 与 <span className="font-mono">storage/</span> 目录。
        </div>
      </GlassPanel>
    </div>
  )
}
