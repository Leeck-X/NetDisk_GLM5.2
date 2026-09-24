import { NavLink, useNavigate } from 'react-router-dom'
import {
  Cloud,
  FolderTree,
  Clock,
  Share2,
  Trash2,
  Image as ImageIcon,
  FileText,
  Film,
  Settings,
  Users,
  LayoutDashboard,
  LogOut,
  ChevronLeft,
  Star,
} from 'lucide-react'
import { GlassPanel } from '@/components/ui/Glass'
import { useAuthStore } from '@/store/auth'
import { useSiteStore } from '@/store/site'
import { confirm } from '@/components/ui/Confirm'
import { toast } from '@/components/ui/Toast'
import { formatBytes } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const NAV = [
  { to: '/', label: '全部文件', icon: FolderTree, exact: true },
  { to: '/recent', label: '最近访问', icon: Clock },
  { to: '/category/starred', label: '收藏', icon: Star },
  { to: '/category/image', label: '图片', icon: ImageIcon },
  { to: '/category/video', label: '视频', icon: Film },
  { to: '/category/doc', label: '文档', icon: FileText },
]

const NAV_SECONDARY = [
  { to: '/share', label: '我的分享', icon: Share2 },
  { to: '/trash', label: '回收站', icon: Trash2 },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const siteName = useSiteStore((s) => s.info.siteName)

  const onLogout = () => {
    confirm({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmText: '退出',
      onConfirm: async () => {
        await logout()
        toast.success('已退出登录')
        navigate('/login', { replace: true })
      },
    })
  }

  const usedBytes = user?.used_bytes || 0
  const quotaBytes = user?.quota_bytes || 0
  const remainBytes = Math.max(0, quotaBytes - usedBytes)

  const usedPercent =
    quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0

  return (
    <>
      {/* 移动端遮罩 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed lg:static top-0 left-0 z-40 h-[100dvh] lg:h-auto w-72 max-w-[85vw] p-4 flex flex-col gap-4 transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl glass-strong flex items-center justify-center">
              <Cloud className="w-5 h-5 text-cyan-glow" />
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-lg leading-none truncate max-w-[9rem]">{siteName}</h1>
              <p className="text-[10px] text-slate-500 mt-0.5">自托管网盘</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* 主导航 */}
        <GlassPanel className="p-2 flex-1 overflow-y-auto scroll-glass">
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} onClick={onClose} />
            ))}
          </nav>

          <div className="my-3 px-3 py-1 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            管理
          </div>
          <nav className="space-y-0.5">
            {NAV_SECONDARY.map((item) => (
              <NavItem key={item.to} {...item} onClick={onClose} />
            ))}
            {user?.role === 'admin' && (
              <>
                <NavItem to="/admin/stats" label="系统统计" icon={LayoutDashboard} onClick={onClose} />
                <NavItem to="/admin/users" label="用户管理" icon={Users} onClick={onClose} />
                <NavItem to="/admin/config" label="系统配置" icon={Settings} onClick={onClose} />
              </>
            )}
          </nav>
        </GlassPanel>

        {/* 存储配额 */}
        <GlassPanel variant="subtle" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">存储空间</span>
            <span className="text-xs font-mono text-cyan-glow">{usedPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-deep to-cyan-glow transition-all duration-500"
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
            <span>已用 {formatBytes(usedBytes)}</span>
            <span>/ {formatBytes(quotaBytes)}</span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
            <span className="text-[10px] text-slate-400">剩余空间</span>
            <span className="text-xs font-mono text-emerald-400">{formatBytes(remainBytes)}</span>
          </div>
        </GlassPanel>

        {/* 用户卡片 */}
        <GlassPanel variant="subtle" className="p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-glow to-cyan-deep flex items-center justify-center text-midnight-900 font-bold text-sm shrink-0">
            {(user?.username || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.username}</p>
            <p className="text-[10px] text-slate-500">
              {user?.role === 'admin' ? '管理员' : '普通用户'}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="w-8 h-8 rounded-lg glass-subtle flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </GlassPanel>
      </aside>
    </>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  exact,
  onClick,
}: {
  to: string
  label: string
  icon: typeof FolderTree
  exact?: boolean
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 relative group',
          isActive
            ? 'text-white bg-cyan-glow/10 border border-cyan-glow/30'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-cyan-glow shadow-glow-cyan" />
          )}
          <Icon className="w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}
