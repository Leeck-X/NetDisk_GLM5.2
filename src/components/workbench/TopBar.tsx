import { Menu, Search, UploadCloud, LayoutGrid, List, ChevronRight, FolderPlus, X } from 'lucide-react'
import { GlassPanel } from '@/components/ui/Glass'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  id: string | null
  name: string
}

interface TopBarProps {
  onMenuClick: () => void
  search: string
  onSearchChange: (v: string) => void
  onUploadClick: () => void
  onNewFolder: () => void
  view: 'grid' | 'list'
  onViewChange: (v: 'grid' | 'list') => void
  breadcrumbs: BreadcrumbItem[]
  onBreadcrumb: (id: string | null) => void
  title: string
}

export function TopBar({
  onMenuClick,
  search,
  onSearchChange,
  onUploadClick,
  onNewFolder,
  view,
  onViewChange,
  breadcrumbs,
  onBreadcrumb,
  title,
}: TopBarProps) {
  return (
    <GlassPanel variant="strong" className="px-4 py-3 flex items-center gap-3">
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-slate-300">
        <Menu className="w-5 h-5" />
      </button>

      {/* 面包屑 */}
      <div className="hidden md:flex items-center gap-1.5 min-w-0 flex-1">
        <span className="font-display font-semibold text-white whitespace-nowrap">{title}</span>
        {breadcrumbs.length > 0 && (
          <>
            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex items-center gap-1 overflow-x-auto scroll-glass min-w-0">
              <button
                onClick={() => onBreadcrumb(null)}
                className="text-sm text-slate-400 hover:text-cyan-glow px-1.5 py-0.5 rounded shrink-0"
              >
                根目录
              </button>
              {breadcrumbs.map((b) => (
                <div key={b.id} className="flex items-center gap-1 shrink-0">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                  <button
                    onClick={() => onBreadcrumb(b.id)}
                    className="text-sm text-slate-300 hover:text-cyan-glow px-1.5 py-0.5 rounded truncate max-w-[120px]"
                  >
                    {b.name}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 移动端标题 */}
      <span className="md:hidden font-display font-semibold text-white flex-1 truncate">{title}</span>

      {/* 搜索框 */}
      <div className="relative flex-1 md:flex-initial md:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          className="glass-input pl-10 pr-8 py-2 text-sm"
          placeholder="搜索文件..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 视图切换 */}
      <div className="hidden sm:flex glass-subtle rounded-xl p-1 gap-1">
        <button
          onClick={() => onViewChange('grid')}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            view === 'grid' ? 'bg-cyan-glow/20 text-cyan-glow' : 'text-slate-400 hover:text-white'
          )}
          title="网格视图"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          onClick={() => onViewChange('list')}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            view === 'list' ? 'bg-cyan-glow/20 text-cyan-glow' : 'text-slate-400 hover:text-white'
          )}
          title="列表视图"
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      {/* 新建文件夹 */}
      <button
        onClick={onNewFolder}
        className="glass-btn !px-3 !py-2"
        title="新建文件夹"
      >
        <FolderPlus className="w-4 h-4" />
        <span className="hidden sm:inline">新建</span>
      </button>

      {/* 上传按钮 */}
      <button
        onClick={onUploadClick}
        className="btn-primary !px-4 !py-2"
      >
        <UploadCloud className="w-4 h-4" />
        <span className="hidden sm:inline">上传</span>
      </button>
    </GlassPanel>
  )
}
