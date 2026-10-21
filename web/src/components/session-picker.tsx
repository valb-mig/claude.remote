import { useMemo, useState } from 'react'
import { SessionInfo } from '@/components/session-info'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { projectName } from '@/lib/format'
import { useStore } from '@/lib/store'

/**
 * Escolha de outra conversa para abrir ao lado (split), na ordem da lista de sessões: as que precisam
 * de você, as fixadas, as abertas agora e as recentes.
 */
export function SessionPicker({
  open,
  onOpenChange,
  exclude,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Conversas que já estão na tela. */
  exclude: string[]
  onPick: (sessionId: string) => void
}) {
  const catalog = useStore((s) => s.catalog)
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rank = (c: (typeof catalog)[number]) => (c.state === 'waiting' ? 0 : c.pinned ? 1 : c.owner ? 2 : 3)
    return catalog
      .filter((c) => !exclude.includes(c.sessionId))
      .filter((c) => !q || `${c.title} ${projectName(c.cwd)}`.toLowerCase().includes(q))
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
      .map(({ c }) => c)
  }, [catalog, exclude, query])

  const pick = (sessionId: string) => {
    onOpenChange(false)
    onPick(sessionId)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 p-0 data-[side=bottom]:h-[85dvh] lg:mx-auto lg:max-w-2xl lg:rounded-t-xl lg:border-x">
        <SheetHeader>
          <SheetTitle>Abrir ao lado</SheetTitle>
          <SheetDescription>Qual conversa vai dividir a tela com esta?</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-2">
          <Input type="search" placeholder="Buscar por título ou projeto" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="min-h-0 flex-1 divide-y overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {list.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => pick(s.sessionId)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 active:bg-muted"
            >
              <SessionInfo s={s} />
            </button>
          ))}
          {list.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {query.trim() ? `Nada encontrado para “${query}”.` : 'Nenhuma outra conversa.'}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
