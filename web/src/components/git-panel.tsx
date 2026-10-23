import { ArrowDown, ArrowLeft, ArrowUp, GitBranch, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api, errorMessage } from '@/lib/api'
import { useMachine } from '@/lib/machines'
import type { GitFile, GitStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX_DIFF_LINES = 4_000

/** Letra e cor como no VSCode: U novo, M modificado, A adicionado, D apagado, R renomeado. */
function badge(f: GitFile): { letter: string; className: string; label: string } {
  if (f.untracked) return { letter: 'U', className: 'text-emerald-600 dark:text-emerald-400', label: 'novo' }
  const code = f.worktree !== '.' ? f.worktree : f.index
  switch (code) {
    case 'M':
      return { letter: 'M', className: 'text-amber-600 dark:text-amber-400', label: 'modificado' }
    case 'A':
      return { letter: 'A', className: 'text-emerald-600 dark:text-emerald-400', label: 'adicionado' }
    case 'D':
      return { letter: 'D', className: 'text-red-600 dark:text-red-400', label: 'apagado' }
    case 'R':
    case 'C':
      return { letter: 'R', className: 'text-sky-600 dark:text-sky-400', label: 'renomeado' }
    default:
      return { letter: '!', className: 'text-red-600 dark:text-red-400', label: 'em conflito' }
  }
}

function DiffView({ cwd, path, onBack }: { cwd: string; path: string; onBack: () => void }) {
  const [diff, setDiff] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const machine = useMachine()
  useEffect(() => {
    api.gitDiff(machine, cwd, path).then((r) => setDiff(r.diff), (err) => setError(errorMessage(err)))
  }, [machine, cwd, path])

  const lines = diff?.split('\n') ?? []
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar à lista">
          <ArrowLeft />
        </Button>
        <span className="truncate font-mono text-xs">{path}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!diff && !error && <Loader2 className="m-4 size-5 animate-spin text-muted-foreground" />}
        {diff === '' && <p className="p-4 text-sm text-muted-foreground">Sem diferenças em texto (arquivo binário ou só permissões).</p>}
        {diff && (
          <pre className="min-w-full py-1 font-mono text-[11.5px] leading-5">
            {lines.slice(0, MAX_DIFF_LINES).map((line, i) => (
              <div
                key={i}
                className={cn(
                  'px-3 whitespace-pre',
                  /^(diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(line)
                    ? 'text-muted-foreground'
                    : line.startsWith('@@')
                      ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                      : line.startsWith('+')
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                        : line.startsWith('-')
                          ? 'bg-red-500/15 text-red-800 dark:text-red-200'
                          : '',
                )}
              >
                {line || ' '}
              </div>
            ))}
            {lines.length > MAX_DIFF_LINES && <div className="px-3 py-2 text-muted-foreground">… diff com {lines.length} linhas, cortado</div>}
          </pre>
        )}
      </div>
    </div>
  )
}

/** Branch atual e arquivos alterados; tocar num arquivo mostra o diff (só leitura). */
export function GitSheet({
  cwd,
  status,
  open,
  onOpenChange,
  onRefresh,
}: {
  cwd: string
  status: GitStatus
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
}) {
  const [diffPath, setDiffPath] = useState<string | null>(null)

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (o) onRefresh()
        else setDiffPath(null)
      }}
    >
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-[94vw] data-[side=right]:max-w-lg data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b pt-[max(1rem,env(safe-area-inset-top))]">
          <SheetTitle className="flex items-center gap-2 pr-8">
            <GitBranch className="size-4 shrink-0" />
            <span className="truncate font-mono text-sm">{status.branch ?? 'HEAD destacado'}</span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-3 text-xs">
            <span>{status.files.length === 0 ? 'Nada alterado' : `${status.files.length} ${status.files.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}`}</span>
            {status.upstream && (
              <span className="flex items-center gap-1.5">
                <ArrowUp className="size-3" />
                {status.ahead}
                <ArrowDown className="size-3" />
                {status.behind}
                <span className="truncate">{status.upstream}</span>
              </span>
            )}
            <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={onRefresh} aria-label="Atualizar">
              <RefreshCw />
            </Button>
          </SheetDescription>
        </SheetHeader>

        {diffPath ? (
          <DiffView cwd={cwd} path={diffPath} onBack={() => setDiffPath(null)} />
        ) : (
          <div className="min-h-0 flex-1 divide-y overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {status.files.map((f) => {
              const b = badge(f)
              const slash = f.path.lastIndexOf('/')
              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setDiffPath(f.path)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted"
                >
                  <span className={cn('w-3 shrink-0 font-mono text-xs font-semibold', b.className)} title={b.label}>
                    {b.letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{f.path.slice(slash + 1)}</div>
                    {slash > 0 && <div className="truncate font-mono text-xs text-muted-foreground">{f.path.slice(0, slash)}</div>}
                  </div>
                  {(f.additions !== null || f.deletions !== null) && (
                    <span className="shrink-0 font-mono text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">+{f.additions ?? 0}</span>{' '}
                      <span className="text-red-600 dark:text-red-400">−{f.deletions ?? 0}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
