import { Columns2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Link, useLocation } from 'wouter'
import { DeleteSessionDialog } from '@/components/delete-session-dialog'
import { PageHeader } from '@/components/layout'
import { MachineFilter } from '@/components/machine-filter'
import { PcStatus } from '@/components/pc-status'
import { ProjectPicker } from '@/components/project-picker'
import { SessionInfo } from '@/components/session-info'
import { SessionMenu, type MenuAt } from '@/components/session-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { projectName } from '@/lib/format'
import { usePressMenu, useWide } from '@/lib/hooks'
import { HOME, newChatUrl, useMachineFilter } from '@/lib/machines'
import { focusChat, openBeside, useSplit } from '@/lib/split'
import { useStore } from '@/lib/store'
import type { CatalogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

const RECENT_LIMIT = 30

type OnMenu = (s: CatalogEntry, x: number, y: number) => void

function SessionRow({ s, onMenu }: { s: CatalogEntry; onMenu: OnMenu }) {
  // No PC a lista fica ao lado do chat: as conversas na tela ficam marcadas, a em foco mais forte.
  const split = useSplit()
  const wide = useWide()
  // Botão direito ou dedo segurado: o menu da conversa (apagar).
  const press = usePressMenu((x, y) => onMenu(s, x, y))
  const shown = split.ids.includes(s.sessionId)
  const focused = split.focused === s.sessionId
  return (
    <div className="group relative">
      <Link
        href={split.hrefFor(s.sessionId)}
        onClick={(e) => {
          focusChat(s.sessionId)
          if (shown) e.preventDefault()
        }}
        aria-current={focused ? 'page' : undefined}
        {...press}
        className={cn(
          // Segurar o dedo não seleciona o texto nem abre o menu de link do iPhone.
          'flex items-start gap-3 px-4 py-3 select-none [-webkit-touch-callout:none] hover:bg-muted/50 active:bg-muted',
          shown && 'bg-muted/50',
          focused && 'bg-muted hover:bg-muted',
        )}
      >
        <SessionInfo s={s} />
      </Link>
      {wide && split.ids.length > 0 && !shown && (
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() =>
            split.canAdd ? openBeside(s.sessionId) : toast(`Cabem ${split.max} conversas lado a lado nesta tela. Feche uma para abrir outra.`)
          }
          aria-label="Abrir ao lado"
          title="Abrir ao lado"
          className="absolute top-1/2 right-3 -translate-y-1/2 border opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <Columns2 />
        </Button>
      )}
    </div>
  )
}

function Group({ title, sessions, onMenu }: { title: string; sessions: CatalogEntry[]; onMenu: OnMenu }) {
  if (sessions.length === 0) return null
  return (
    <section className="mb-4">
      <h2 className="px-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y">
        {sessions.map((s) => (
          <SessionRow key={s.sessionId} s={s} onMenu={onMenu} />
        ))}
      </div>
    </section>
  )
}

export function SessionsPage() {
  const all = useStore((s) => s.catalog)
  const loaded = useStore((s) => s.catalogLoaded)
  const filter = useMachineFilter()
  const catalog = useMemo(() => (filter === null ? all : all.filter((c) => (c.machine ?? HOME) === filter)), [all, filter])
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [picker, setPicker] = useState(false)
  const [, navigate] = useLocation()
  // Menu e confirmação ficam com a última conversa enquanto fecham, para não esvaziar na animação.
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState<CatalogEntry | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const onMenu: OnMenu = (session, x, y) => {
    setMenu({ session, x, y })
    setMenuOpen(true)
  }

  const { attention, pinned, open, recent } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? catalog.filter((c) => `${c.title} ${projectName(c.cwd)}`.toLowerCase().includes(q)) : catalog
    const rest = list.filter((c) => c.state !== 'waiting' && !c.pinned)
    return {
      attention: list.filter((c) => c.state === 'waiting'),
      pinned: list.filter((c) => c.pinned && c.state !== 'waiting'),
      open: rest.filter((c) => c.owner),
      recent: rest.filter((c) => !c.owner),
    }
  }, [catalog, query])

  return (
    <>
      <PageHeader
        title="Sessões"
        action={
          <Button size="sm" onClick={() => setPicker(true)}>
            <Plus /> Nova
          </Button>
        }
      />
      <MachineFilter className="px-4 pb-3" />
      <PcStatus machine={filter ?? HOME} />
      <div className="px-4 pb-3">
        <Input type="search" placeholder="Buscar por título ou projeto" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!loaded ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Group title="Precisam de você" sessions={attention} onMenu={onMenu} />
          <Group title="Fixadas" sessions={pinned} onMenu={onMenu} />
          <Group title="Abertas agora" sessions={open} onMenu={onMenu} />
          <Group title="Recentes" sessions={showAll ? recent : recent.slice(0, RECENT_LIMIT)} onMenu={onMenu} />
          {recent.length > RECENT_LIMIT && !showAll && (
            <div className="px-4 pb-6">
              <Button variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
                Mostrar todas ({recent.length})
              </Button>
            </div>
          )}
          {catalog.length > 0 && attention.length + pinned.length + open.length + recent.length === 0 && (
            <p className="px-4 text-sm text-muted-foreground">Nada encontrado para “{query}”.</p>
          )}
        </>
      )}
      <SessionMenu
        at={menu}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onDelete={(session) => {
          setDeleting(session)
          setConfirmOpen(true)
        }}
      />
      {deleting && (
        <DeleteSessionDialog sessionId={deleting.sessionId} title={deleting.title} open={confirmOpen} onOpenChange={setConfirmOpen} />
      )}
      <ProjectPicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(cwd, machine) => navigate(newChatUrl(cwd, machine))}
      />
    </>
  )
}
