import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Loader2,
  WrapText,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { CopyButton, Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api, errorMessage, fileRawUrl } from '@/lib/api'
import { formatSize } from '@/lib/attachments'
import { useMachine } from '@/lib/machines'
import { projectName, shortPath } from '@/lib/format'
import type { FileView, TreeEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX_LINES = 5_000
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt|swift|c|cc|cpp|h|hpp|cs|php|rb|sh|zsh|bash|css|scss|html|vue|svelte|sql|toml|yaml|yml|xml|lua|dart)$/i

function fileIcon(name: string) {
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name)) return FileImage
  if (/\.json5?$/i.test(name)) return FileJson
  if (/\.(md|mdx|txt|rst)$/i.test(name)) return FileText
  if (CODE.test(name)) return FileCode
  return File
}

// Pastas abertas por projeto: fechar e reabrir a barra mantém a árvore como estava.
const expanded = new Set<string>()
const rowClass = 'flex w-full min-w-0 items-center gap-1.5 py-1.5 pr-3 text-left text-sm hover:bg-muted active:bg-muted'
const indent = (depth: number) => ({ paddingLeft: 8 + depth * 14 })

function TreeLevel({ cwd, path, depth, onOpenFile }: { cwd: string; path: string; depth: number; onOpenFile: (path: string) => void }) {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const machine = useMachine()
  useEffect(() => {
    api.tree(machine, cwd, path).then(setEntries, (err) => setError(errorMessage(err)))
  }, [machine, cwd, path])

  if (error) return <p className="py-1 text-xs text-red-600 dark:text-red-400" style={indent(depth + 1)}>{error}</p>
  if (!entries) {
    return (
      <div className="py-1.5" style={indent(depth + 1)}>
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (entries.length === 0) return <p className="py-1 text-xs text-muted-foreground" style={indent(depth + 1)}>vazia</p>
  return entries.map((e) =>
    e.type === 'dir' ? (
      <DirNode key={e.path} cwd={cwd} entry={e} depth={depth} onOpenFile={onOpenFile} />
    ) : (
      <button key={e.path} type="button" className={rowClass} style={indent(depth + 1)} onClick={() => onOpenFile(e.path)}>
        {(() => {
          const Icon = fileIcon(e.name)
          return <Icon className="size-4 shrink-0 text-muted-foreground" />
        })()}
        <span className={cn('truncate', e.ignored && 'opacity-50')}>{e.name}</span>
      </button>
    ),
  )
}

function DirNode({ cwd, entry, depth, onOpenFile }: { cwd: string; entry: TreeEntry; depth: number; onOpenFile: (path: string) => void }) {
  const key = `${cwd}\n${entry.path}`
  const [open, setOpen] = useState(expanded.has(key))
  const toggle = () => {
    if (open) expanded.delete(key)
    else expanded.add(key)
    setOpen(!open)
  }
  const Icon = open ? FolderOpen : Folder
  return (
    <>
      <button type="button" className={rowClass} style={indent(depth)} onClick={toggle}>
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn('truncate', entry.ignored && 'opacity-50')}>{entry.name}</span>
      </button>
      {open && <TreeLevel cwd={cwd} path={entry.path} depth={depth + 1} onOpenFile={onOpenFile} />}
    </>
  )
}

function TextContent({ content, wrap }: { content: string; wrap: boolean }) {
  const lines = content.split('\n')
  const shown = lines.slice(0, MAX_LINES)
  return (
    <pre className="min-w-full py-2 font-mono text-[12px] leading-5">
      {shown.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-12 shrink-0 pr-3 text-right text-muted-foreground/60 select-none">{i + 1}</span>
          <span className={cn('pr-4', wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre')}>{line || ' '}</span>
        </div>
      ))}
      {lines.length > MAX_LINES && (
        <div className="px-4 py-2 text-muted-foreground">… mostrando {MAX_LINES} de {lines.length} linhas</div>
      )}
    </pre>
  )
}

/** Visualizador de arquivo em tela cheia, só leitura. */
function FileViewer({ cwd, path, onClose }: { cwd: string; path: string | null; onClose: () => void }) {
  const machine = useMachine()
  const [view, setView] = useState<FileView | { kind: 'error'; message: string } | null>(null)
  const [wrap, setWrap] = useState(false)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    if (!path) return
    setView(null)
    setRendered(false)
    api.file(machine, cwd, path).then(setView, (err) => setView({ kind: 'error', message: errorMessage(err) }))
  }, [machine, cwd, path])

  const name = path?.split('/').pop() ?? ''
  const dir = path?.split('/').slice(0, -1).join('/')
  const markdown = /\.mdx?$/i.test(name) && view?.kind === 'text'
  const raw = path ? fileRawUrl(machine, cwd, path) : ''

  return (
    <Dialog open={path !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 ring-0 sm:max-w-none"
      >
        <header className="flex shrink-0 items-center gap-1 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar">
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate font-mono text-sm">{name}</DialogTitle>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {dir || projectName(cwd)}
              {view && 'size' in view && ` · ${formatSize(view.size)}`}
            </div>
          </div>
          {markdown && (
            <Button variant={rendered ? 'secondary' : 'ghost'} size="sm" onClick={() => setRendered((r) => !r)}>
              {rendered ? 'Código' : 'Formatado'}
            </Button>
          )}
          {view?.kind === 'text' && !rendered && (
            <Button variant={wrap ? 'secondary' : 'ghost'} size="icon" onClick={() => setWrap((w) => !w)} aria-label="Quebrar linhas">
              <WrapText />
            </Button>
          )}
          {path && <CopyButton text={path} className="size-8" />}
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {!view && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {view?.kind === 'text' &&
            (rendered ? <Markdown text={view.content} className="p-4" /> : <TextContent content={view.content} wrap={wrap} />)}
          {view?.kind === 'text' && view.truncated && (
            <p className="px-4 pb-4 text-xs text-muted-foreground">Arquivo grande: mostrando só o primeiro 1 MB.</p>
          )}
          {view?.kind === 'image' && (
            <div className="flex min-h-full items-center justify-center bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-4">
              <img src={raw} alt={name} className="max-w-full" />
            </div>
          )}
          {(view?.kind === 'pdf' || view?.kind === 'binary' || view?.kind === 'large' || view?.kind === 'error') && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>
                {view.kind === 'pdf' && 'PDF'}
                {view.kind === 'binary' && 'Arquivo binário: não dá para mostrar como texto.'}
                {view.kind === 'large' && 'Arquivo grande demais para mostrar.'}
                {view.kind === 'error' && view.message}
              </p>
              {view.kind === 'pdf' && (
                <Button asChild>
                  <a href={raw} target="_blank" rel="noreferrer">
                    <ExternalLink /> Abrir PDF
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Barra lateral com a árvore do projeto (só leitura); tocar num arquivo abre o conteúdo. */
export function ExplorerSheet({ cwd, open, onOpenChange }: { cwd: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [file, setFile] = useState<string | null>(null)
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-[88vw] data-[side=left]:max-w-sm">
          <SheetHeader className="border-b pt-[max(1rem,env(safe-area-inset-top))]">
            <SheetTitle className="flex items-center gap-2">
              <FolderTree className="size-4" />
              {projectName(cwd)}
            </SheetTitle>
            <SheetDescription className="truncate font-mono text-xs">{shortPath(cwd)}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto py-1 pb-[env(safe-area-inset-bottom)]">
            <TreeLevel cwd={cwd} path="" depth={0} onOpenFile={setFile} />
          </div>
        </SheetContent>
      </Sheet>
      <FileViewer cwd={cwd} path={file} onClose={() => setFile(null)} />
    </>
  )
}
