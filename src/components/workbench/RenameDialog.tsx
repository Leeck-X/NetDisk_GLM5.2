import { useEffect, useState, type FormEvent } from 'react'
import { GlassModal, GlassButton, GlassInput } from '@/components/ui/Glass'
import { FolderPlus, Pencil } from 'lucide-react'

interface RenameDialogProps {
  open: boolean
  onClose: () => void
  initialName: string
  title: string
  isFolder?: boolean
  onConfirm: (name: string) => Promise<void>
}

export function RenameDialog({ open, onClose, initialName, title, isFolder, onConfirm }: RenameDialogProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setName(initialName)
  }, [open, initialName])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await onConfirm(name.trim())
      onClose()
    } catch {
      // 错误由调用方处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="flex justify-center mb-2">
          <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center">
            {isFolder ? <FolderPlus className="w-7 h-7 text-cyan-glow" /> : <Pencil className="w-7 h-7 text-cyan-glow" />}
          </div>
        </div>
        <GlassInput
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="请输入名称"
          onFocus={(e) => e.target.select()}
        />
        <div className="flex gap-3">
          <GlassButton type="button" variant="glass" onClick={onClose} className="flex-1">
            取消
          </GlassButton>
          <GlassButton type="submit" variant="primary" loading={loading} className="flex-1">
            确认
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  )
}
