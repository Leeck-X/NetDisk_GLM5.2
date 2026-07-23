import {
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  File as FileIconBase,
  FileType2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getFileCategory, type AppFile } from '@/lib/types'

const ICON_COLOR: Record<string, string> = {
  folder: 'text-cyan-glow',
  image: 'text-violet-400',
  video: 'text-rose-400',
  audio: 'text-amber-glow',
  doc: 'text-sky-400',
  archive: 'text-emerald-400',
  other: 'text-slate-400',
}

const BG_COLOR: Record<string, string> = {
  folder: 'bg-cyan-500/10',
  image: 'bg-violet-500/10',
  video: 'bg-rose-500/10',
  audio: 'bg-amber-500/10',
  doc: 'bg-sky-500/10',
  archive: 'bg-emerald-500/10',
  other: 'bg-white/5',
}

export function FileIcon({ file, size = 48, className }: { file: Pick<AppFile, 'type' | 'mimeType' | 'ext'>; size?: number; className?: string }) {
  const category = file.type === 'folder' ? 'folder' : getFileCategory(file.mimeType, file.ext)
  let Icon: typeof Folder = FileIconBase
  if (category === 'folder') Icon = Folder
  else if (category === 'image') Icon = ImageIcon
  else if (category === 'video') Icon = Film
  else if (category === 'audio') Icon = Music
  else if (category === 'archive') Icon = FileArchive
  else if (category === 'doc') Icon = FileText
  else if (category === 'other') Icon = FileType2
  return (
    <div
      className={`rounded-xl flex items-center justify-center ${BG_COLOR[category]} ${ICON_COLOR[category]} ${className || ''}`}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}

export function FileIconSmall({ file, className }: { file: Pick<AppFile, 'type' | 'mimeType' | 'ext'>; className?: string }): ReactNode {
  const category = file.type === 'folder' ? 'folder' : getFileCategory(file.mimeType, file.ext)
  let Icon: typeof Folder = FileIconBase
  if (category === 'folder') Icon = Folder
  else if (category === 'image') Icon = ImageIcon
  else if (category === 'video') Icon = Film
  else if (category === 'audio') Icon = Music
  else if (category === 'archive') Icon = FileArchive
  else if (category === 'doc') Icon = FileText
  return <Icon className={`w-4 h-4 ${ICON_COLOR[category]} ${className || ''}`} />
}
