import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { FolderX, Inbox } from 'lucide-react'
import { Sidebar } from '@/components/workbench/Sidebar'
import { TopBar } from '@/components/workbench/TopBar'
import { FileCard } from '@/components/workbench/FileCard'
import { UploadPanel } from '@/components/workbench/UploadPanel'
import { ShareDialog } from '@/components/workbench/ShareDialog'
import { DetailDrawer } from '@/components/workbench/DetailDrawer'
import { RenameDialog } from '@/components/workbench/RenameDialog'
import { ContextMenu, buildFileMenuItems, type MenuItem } from '@/components/workbench/ContextMenu'
import { GlassPanel, GlassButton, EmptyState, LoadingSpinner } from '@/components/ui/Glass'
import { confirm } from '@/components/ui/Confirm'
import { toast } from '@/components/ui/Toast'
import { filesApi } from '@/lib/api'
import type { AppFile } from '@/lib/types'

interface WorkbenchProps {
  view?: 'all' | 'recent' | 'category'
}

const CATEGORY_TITLES: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  doc: '文档',
  archive: '压缩包',
  other: '其他',
  starred: '收藏',
}

export default function Workbench({ view = 'all' }: WorkbenchProps) {
  const params = useParams<{ type: string }>()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [files, setFiles] = useState<AppFile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('webftp_view') as 'grid' | 'list') || 'grid')
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailFile, setDetailFile] = useState<AppFile | null>(null)
  const [shareFile, setShareFile] = useState<AppFile | null>(null)
  const [renameFile, setRenameFile] = useState<AppFile | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; file: AppFile } | null>(null)

  const title = useMemo(() => {
    if (view === 'recent') return '最近访问'
    if (view === 'category' && params.type) return CATEGORY_TITLES[params.type] || '分类'
    return '全部文件'
  }, [view, params.type])

  const isBrowsing = view === 'all'

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      let list: AppFile[]
      if (view === 'recent') {
        list = await filesApi.category('recent')
      } else if (view === 'category' && params.type) {
        list = await filesApi.category(params.type)
      } else if (search.trim()) {
        list = await filesApi.search(search.trim())
      } else {
        list = await filesApi.list(currentFolder)
      }
      setFiles(list)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [view, params.type, currentFolder, search])

  useEffect(() => {
    loadFiles()
    setSelected(new Set())
  }, [loadFiles])

  // 路由切换时重置目录
  useEffect(() => {
    if (location.pathname === '/') {
      setCurrentFolder(null)
      setBreadcrumbs([])
    }
  }, [location.pathname])

  // 构建面包屑
  const buildBreadcrumbs = async (folderId: string) => {
    const chain: { id: string; name: string }[] = []
    let curId: string | null = folderId
    while (curId) {
      const folder = files.find((f) => f.id === curId) || (await fetchFolderName(curId))
      if (!folder) break
      chain.unshift({ id: folder.id, name: folder.name })
      curId = (files.find((f) => f.id === folder.id) || ({} as AppFile)).parentId
    }
    setBreadcrumbs(chain)
  }

  const fetchFolderName = async (id: string): Promise<AppFile | null> => {
    try {
      const list = await filesApi.list(null)
      return list.find((f) => f.id === id) || null
    } catch {
      return null
    }
  }

  const handleOpen = (file: AppFile) => {
    if (file.type === 'folder') {
      setCurrentFolder(file.id)
      buildBreadcrumbs(file.id)
      setBreadcrumbs([{ id: file.id, name: file.name }])
    } else {
      setDetailFile(file)
    }
  }

  const handleSelect = (id: string, multi: boolean) => {
    setSelected((prev) => {
      const next = new Set(multi ? prev : [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = () => {
    if (selected.size === 0) return
    confirm({
      title: `移入回收站`,
      message: `确定要将选中的 ${selected.size} 个项目移入回收站？`,
      danger: true,
      onConfirm: async () => {
        await filesApi.remove(Array.from(selected))
        toast.success(`已移入回收站 ${selected.size} 项`)
        setSelected(new Set())
        loadFiles()
      },
    })
  }

  const handleDownload = (file: AppFile) => {
    if (file.type === 'file') {
      const a = document.createElement('a')
      a.href = filesApi.downloadUrl(file.id)
      a.download = file.name
      a.click()
    } else {
      const a = document.createElement('a')
      a.href = filesApi.downloadFolderUrl(file.id)
      a.click()
      toast.info('正在打包下载...')
    }
  }

  const handleStarToggle = async (file: AppFile) => {
    try {
      await filesApi.star(file.id, !file.starred)
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, starred: file.starred ? 0 : 1 } : f)))
      if (detailFile?.id === file.id) setDetailFile({ ...file, starred: file.starred ? 0 : 1 })
      toast.success(file.starred ? '已取消收藏' : '已收藏')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleRename = async (name: string) => {
    if (!renameFile) return
    await filesApi.rename(renameFile.id, name)
    toast.success('已重命名')
    loadFiles()
  }

  const handleDelete = (file: AppFile) => {
    confirm({
      title: '移入回收站',
      message: `确定要将「${file.name}」移入回收站？`,
      danger: true,
      onConfirm: async () => {
        await filesApi.remove([file.id])
        toast.success('已移入回收站')
        loadFiles()
        if (detailFile?.id === file.id) setDetailFile(null)
      },
    })
  }

  const menuItems = (file: AppFile): MenuItem[] =>
    buildFileMenuItems(file, {
      onDownload: () => handleDownload(file),
      onShare: () => setShareFile(file),
      onRename: () => setRenameFile(file),
      onDelete: () => handleDelete(file),
      onStar: () => handleStarToggle(file),
      onDetail: () => setDetailFile(file),
    })

  return (
    <div className="relative z-10 h-[100dvh] flex overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 lg:pl-0 overflow-hidden">
        <TopBar
          onMenuClick={() => setSidebarOpen(true)}
          search={search}
          onSearchChange={setSearch}
          onUploadClick={() => setUploadOpen(true)}
          onNewFolder={() => setNewFolderOpen(true)}
          view={viewMode}
          onViewChange={(v) => {
            setViewMode(v)
            localStorage.setItem('webftp_view', v)
          }}
          breadcrumbs={breadcrumbs}
          onBreadcrumb={(id) => {
            setCurrentFolder(id)
            setSelected(new Set())
          }}
          title={title}
        />

        {/* 多选工具栏 */}
        {selected.size > 0 && (
          <GlassPanel variant="subtle" className="px-4 py-2.5 flex items-center justify-between animate-fade-up">
            <span className="text-sm text-slate-300">已选中 {selected.size} 项</span>
            <div className="flex gap-2">
              <GlassButton size="sm" variant="danger" onClick={handleBulkDelete}>
                移入回收站
              </GlassButton>
              <GlassButton size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                取消
              </GlassButton>
            </div>
          </GlassPanel>
        )}

        {/* 文件区域 */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-glass" onClick={() => setSelected(new Set())}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner size={36} />
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={search.trim() ? <Inbox className="w-8 h-8" /> : <FolderX className="w-8 h-8" />}
              title={search.trim() ? '没有找到匹配的文件' : '此文件夹为空'}
              description={search.trim() ? '试试其他关键词' : '点击右上角上传按钮，或新建文件夹开始使用'}
              action={
                !search.trim() && (
                  <GlassButton variant="primary" onClick={() => setUploadOpen(true)}>
                    上传文件
                  </GlassButton>
                )
              }
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {files.map((f, i) => (
                <FileCard
                  key={f.id}
                  file={f}
                  index={i}
                  selected={selected.has(f.id)}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                  onMenu={(file, x, y) => setMenu({ x, y, file })}
                  onShare={setShareFile}
                  onRename={setRenameFile}
                  onDelete={handleDelete}
                  onStarToggle={handleStarToggle}
                  view="grid"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((f, i) => (
                <FileCard
                  key={f.id}
                  file={f}
                  index={i}
                  selected={selected.has(f.id)}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                  onMenu={(file, x, y) => setMenu({ x, y, file })}
                  onShare={setShareFile}
                  onRename={setRenameFile}
                  onDelete={handleDelete}
                  onStarToggle={handleStarToggle}
                  view="list"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 上传面板 */}
      <UploadPanel
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        parentId={currentFolder}
        onUploaded={loadFiles}
      />

      {/* 详情抽屉 */}
      <DetailDrawer
        file={detailFile}
        onClose={() => setDetailFile(null)}
        onShare={(f) => setShareFile(f)}
        onRename={(f) => setRenameFile(f)}
        onDelete={handleDelete}
        onStarToggle={handleStarToggle}
      />

      {/* 分享弹窗 */}
      <ShareDialog
        open={!!shareFile}
        onClose={() => setShareFile(null)}
        fileId={shareFile?.id || null}
        fileName={shareFile?.name}
      />

      {/* 重命名弹窗 */}
      <RenameDialog
        open={!!renameFile}
        onClose={() => setRenameFile(null)}
        initialName={renameFile?.name || ''}
        title="重命名"
        isFolder={renameFile?.type === 'folder'}
        onConfirm={handleRename}
      />

      {/* 新建文件夹弹窗 */}
      <RenameDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        initialName=""
        title="新建文件夹"
        isFolder
        onConfirm={async (name) => {
          await filesApi.mkdir(name, currentFolder)
          toast.success('文件夹已创建')
          loadFiles()
        }}
      />

      {/* 右键菜单 */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          file={menu.file}
          items={menuItems(menu.file)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
