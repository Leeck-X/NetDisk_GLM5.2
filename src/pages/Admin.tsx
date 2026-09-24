import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Users, Settings, Cloud, HardDrive, FileText,
  Share2, FolderPlus, TrendingUp, ArrowLeft, UserPlus, KeyRound,
  Power, Trash2, ShieldAlert, ShieldCheck, Database, Server, RefreshCw, Menu,
} from 'lucide-react'
import { Sidebar } from '@/components/workbench/Sidebar'
import { GlassPanel, GlassButton, GlassInput, EmptyState, LoadingSpinner } from '@/components/ui/Glass'
import { GlassModal } from '@/components/ui/Glass'
import { PieChart, type PieSlice } from '@/components/ui/PieChart'
import { confirm } from '@/components/ui/Confirm'
import { toast } from '@/components/ui/Toast'
import { adminApi } from '@/lib/api'
import type { AdminStats, AdminUser, SystemInfo } from '@/lib/types'
import { formatBytes, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function Admin() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="relative z-10 h-[100dvh] flex overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-h-0 overflow-y-auto scroll-glass p-4 lg:pl-0">
        <AdminNav onMenu={() => setSidebarOpen(true)} />
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

function AdminNav({ onMenu }: { onMenu: () => void }) {
  const location = useLocation()
  const items = [
    { to: '/admin/stats', label: '系统统计', icon: LayoutDashboard },
    { to: '/admin/users', label: '用户管理', icon: Users },
    { to: '/admin/config', label: '系统配置', icon: Settings },
  ]
  return (
    <GlassPanel variant="strong" className="px-3 py-2 flex items-center gap-1 overflow-x-auto scroll-glass">
      <button
        onClick={onMenu}
        className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
        title="打开菜单"
      >
        <Menu className="w-4 h-4" />
      </button>
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
/** 饼图配色：纯 SVG 需使用具体色值，不能用 Tailwind 类名 */
const PIE_COLORS = ['#22d3ee', '#a78bfa', '#fb7185', '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#94a3b8']

/** 文件类型展示元数据 */
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  image: { label: '图片', color: '#a78bfa' },
  video: { label: '视频', color: '#fb7185' },
  audio: { label: '音频', color: '#fbbf24' },
  doc: { label: '文档', color: '#38bdf8' },
  archive: { label: '压缩包', color: '#34d399' },
  other: { label: '其它', color: '#94a3b8' },
}

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
  const diskKnown = stats.disk.total > 0
  // 磁盘构成：已使用 + 可用 + 系统预留 = 总容量
  const diskSlices: PieSlice[] = [
    { label: '已使用', value: stats.disk.used, color: '#fb7185' },
    { label: '剩余可用', value: stats.disk.usable, color: '#22d3ee' },
    { label: '系统预留', value: stats.disk.reserve, color: '#64748b' },
  ]
  // 用户空间占用：按已用字节降序，最多取前 6 个避免图例过长
  const userSlices: PieSlice[] = stats.usersSpace
    .filter((u) => u.usedBytes > 0)
    .slice(0, 6)
    .map((u, i) => ({ label: u.username, value: u.usedBytes, color: PIE_COLORS[i % PIE_COLORS.length] }))
  const categorySlices: PieSlice[] = stats.category
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      label: CATEGORY_META[c.cat]?.label || c.cat,
      value: c.count,
      color: CATEGORY_META[c.cat]?.color || '#94a3b8',
    }))

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
        {/* 磁盘空间（真实文件系统容量 + 预留策略） */}
        <GlassPanel variant="strong" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">磁盘空间</h3>
            <HardDrive className="w-4 h-4 text-cyan-glow" />
          </div>
          {diskKnown ? (
            <>
              <PieChart
                data={diskSlices}
                centerLabel={`${stats.disk.usedPercent}%`}
                centerSub="已使用"
                formatValue={(s) => formatBytes(s.value)}
              />
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <InfoItem label="总容量" value={stats.diskTotalHuman} />
                <InfoItem label="已使用" value={stats.diskUsedHuman} />
                <InfoItem label="剩余可用" value={stats.diskUsableHuman} accent />
                <InfoItem label="系统预留" value={stats.diskReserveHuman} />
              </dl>
            </>
          ) : (
            <EmptyState icon={<HardDrive className="w-6 h-6" />} title="无法读取磁盘信息" />
          )}
        </GlassPanel>

        {/* 用户空间占用 */}
        <GlassPanel variant="strong" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">用户空间占用</h3>
            <Users className="w-4 h-4 text-cyan-glow" />
          </div>
          {userSlices.length === 0 ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="暂无用户数据" />
          ) : (
            <PieChart
              data={userSlices}
              centerLabel={stats.totalSizeHuman}
              centerSub="已用空间"
              formatValue={(s) => formatBytes(s.value)}
            />
          )}
        </GlassPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 文件类型分布 */}
        <GlassPanel variant="strong" className="p-5">
          <h3 className="font-display font-semibold text-white mb-4">文件类型分布</h3>
          {categorySlices.length === 0 ? (
            <EmptyState icon={<FolderPlus className="w-6 h-6" />} title="暂无数据" />
          ) : (
            <PieChart data={categorySlices} centerLabel={String(stats.fileCount)} centerSub="个文件" />
          )}
        </GlassPanel>

        {/* 配额与回收站 */}
        <GlassPanel variant="strong" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-white">配额与回收站</h3>
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
          <p className="text-xs text-slate-400 mt-2">用户已用占配额 {stats.usedPercent}%</p>
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400">回收站占用</p>
              <p className="text-sm text-white font-mono">{stats.trashSizeHuman}</p>
            </div>
            <span className="text-xs text-slate-500">{stats.trashCount} 项</span>
          </div>
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

function InfoItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('font-mono', accent ? 'text-cyan-glow' : 'text-slate-200')}>{value}</dd>
    </div>
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
/** 秒 → 人类可读时长 */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分 ${s % 60} 秒`
}

/** 目录路径展示行 */
function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
      <span className="text-slate-500 sm:w-20 shrink-0">{label}</span>
      <span className="font-mono text-slate-200 break-all">{value}</span>
    </div>
  )
}

/** 目录占用统计块 */
function SizeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-subtle rounded-xl px-3 py-2.5 text-center">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-mono text-white mt-0.5">{value}</p>
    </div>
  )
}

function ConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gcLoading, setGcLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfg, sys] = await Promise.all([adminApi.config(), adminApi.systemInfo()])
      setConfig(cfg)
      setInfo(sys)
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

  // 手动触发一次垃圾清理，完成后刷新目录占用
  const onRunGc = () => {
    confirm({
      title: '立即清理垃圾',
      message: '将清理孤儿分片目录、过期上传分片与无主文件，不会删除任何正常文件，确定继续？',
      confirmText: '开始清理',
      onConfirm: async () => {
        setGcLoading(true)
        try {
          const result = await adminApi.runGc()
          toast.success(`清理完成，释放 ${result.freedHuman}`)
          setInfo(await adminApi.systemInfo())
        } catch (e) {
          toast.error(e instanceof Error ? e.message : '清理失败')
        } finally {
          setGcLoading(false)
        }
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

  /** 配置项：type 为 switch 时渲染开关，否则渲染输入框 */
  const configItems: Array<{
    key: string
    label: string
    placeholder?: string
    desc: string
    type?: 'text' | 'number' | 'switch'
  }> = [
    { key: 'site_name', label: '站点名称', placeholder: 'WebFtp', desc: '显示在浏览器标签、登录页与分享页' },
    { key: 'site_description', label: '站点描述', placeholder: '自托管网盘系统 · 数据尽在掌握', desc: '登录页与分享页的副标题文案' },
    { key: 'allow_register', label: '开放注册', desc: '开启后任何人都可在登录页自助注册账号', type: 'switch' },
    { key: 'default_quota_gb', label: '新用户默认配额（GB）', placeholder: '1', desc: '创建新用户与自助注册时的默认存储配额', type: 'number' },
    { key: 'upload_max_size', label: '单文件大小上限（MB）', placeholder: '2048', desc: '单个上传文件大小限制', type: 'number' },
    { key: 'share_default_expire_days', label: '分享默认有效期（天）', placeholder: '7', desc: '创建分享时的默认有效天数，0 为永久', type: 'number' },
    { key: 'trash_retention_days', label: '回收站保留天数', placeholder: '30', desc: '回收站中的文件超过该天数会被自动清理，0 为不清理', type: 'number' },
  ]

  const isOn = (v?: string) => v === '1' || v === 'true'

  return (
    <div className="space-y-4">
      <GlassPanel variant="strong" className="px-5 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl glass-subtle flex items-center justify-center">
          <Settings className="w-5 h-5 text-cyan-glow" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-white">系统配置</h2>
          <p className="text-xs text-slate-400 mt-0.5">站点配置、运行环境与存储信息</p>
        </div>
      </GlassPanel>

      <GlassPanel variant="strong" className="p-5 space-y-4">
        {configItems.map((item) =>
          item.type === 'switch' ? (
            <div key={item.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-slate-200 mb-1">{item.label}</label>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isOn(config[item.key])}
                onClick={() => setConfig({ ...config, [item.key]: isOn(config[item.key]) ? '0' : '1' })}
                className={cn(
                  'relative w-11 h-6 rounded-full shrink-0 transition-colors',
                  isOn(config[item.key]) ? 'bg-cyan-glow/70' : 'bg-white/10'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                    isOn(config[item.key]) && 'translate-x-5'
                  )}
                />
              </button>
            </div>
          ) : (
            <div key={item.key}>
              <label className="block text-sm font-medium text-slate-200 mb-1">{item.label}</label>
              <p className="text-xs text-slate-500 mb-2">{item.desc}</p>
              <input
                className="glass-input"
                type={item.type === 'number' ? 'number' : 'text'}
                min={item.type === 'number' ? 0 : undefined}
                placeholder={item.placeholder}
                value={config[item.key] || ''}
                onChange={(e) => setConfig({ ...config, [item.key]: e.target.value })}
              />
            </div>
          )
        )}
        <div className="flex justify-end pt-2">
          <GlassButton variant="primary" loading={saving} onClick={onSave}>保存配置</GlassButton>
        </div>
      </GlassPanel>

      {info && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 运行环境 */}
            <GlassPanel variant="strong" className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center">
                  <Server className="w-4 h-4 text-cyan-glow" />
                </div>
                <h3 className="font-display font-semibold text-white">运行环境</h3>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs">
                <InfoItem label="版本" value={info.version} />
                <InfoItem label="Node.js" value={info.nodeVersion} />
                <InfoItem label="平台" value={info.platform} />
                <InfoItem label="主机名" value={info.hostname} />
                <InfoItem label="CPU 核心" value={`${info.cpus} 核`} />
                <InfoItem label="监听地址" value={`${info.host}:${info.port}`} />
                <InfoItem label="内存" value={`${formatBytes(info.freeMem)} / ${formatBytes(info.totalMem)}`} />
                <InfoItem label="进程运行" value={formatDuration(info.processUptime)} />
                <InfoItem label="进程 PID" value={String(info.pid)} />
              </dl>
            </GlassPanel>

            {/* 空间保护与垃圾清理 */}
            <GlassPanel variant="strong" className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-cyan-glow" />
                  </div>
                  <h3 className="font-display font-semibold text-white">空间保护与垃圾清理</h3>
                </div>
                <GlassButton
                  variant="glass"
                  size="sm"
                  loading={gcLoading}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={onRunGc}
                >
                  立即清理
                </GlassButton>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <InfoItem label="磁盘预留比例" value={`${Math.round(info.diskReserveRatio * 100)}%`} />
                <InfoItem label="磁盘总容量" value={info.diskTotalHuman} />
                <InfoItem label="剩余可用" value={info.diskUsableHuman} accent />
                <InfoItem label="系统预留" value={info.diskReserveHuman} />
                <InfoItem label="分片保留时长" value={`${info.chunkTtlHours} 小时`} />
                <InfoItem label="孤儿文件保留" value={`${info.orphanTtlHours} 小时`} />
                <InfoItem label="回收站保留" value={info.trashRetentionDays > 0 ? `${info.trashRetentionDays} 天` : '不清理'} />
                <InfoItem label="自动清理周期" value={`${info.gcIntervalMinutes} 分钟`} />
              </dl>
            </GlassPanel>
          </div>

          {/* 存储与目录 */}
          <GlassPanel variant="strong" className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center">
                <Database className="w-4 h-4 text-cyan-glow" />
              </div>
              <h3 className="font-display font-semibold text-white">存储与目录</h3>
            </div>
            <div className="space-y-2.5 text-xs">
              <PathRow label="数据根目录" value={info.webpanRoot} />
              <PathRow label="用户文件" value={info.storageDir} />
              <PathRow label="上传分片" value={info.chunksDir} />
              <PathRow label="缩略图缓存" value={info.thumbsDir} />
              <PathRow label="数据库" value={info.dbPath} />
              <PathRow label="日志目录" value={info.logsDir} />
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SizeCell label="用户文件" value={info.storageSizeHuman} />
              <SizeCell label="待合并分片" value={info.chunksSizeHuman} />
              <SizeCell label="缩略图" value={info.thumbsSizeHuman} />
              <SizeCell label="数据库" value={info.dbSizeHuman} />
            </div>
          </GlassPanel>

          <GlassPanel variant="subtle" className="p-4 flex items-start gap-3">
            <Cloud className="w-5 h-5 text-cyan-glow shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 leading-relaxed">
              <p className="text-slate-300 font-medium mb-1">备份提示</p>
              所有数据均存储在服务器本地，数据目录 <span className="font-mono text-cyan-glow">{info.dataDir}</span>，
              文件目录 <span className="font-mono text-cyan-glow">{info.storageDir}</span>，建议定期备份这两个目录。
            </div>
          </GlassPanel>
        </>
      )}
    </div>
  )
}
