import { Monitor, Pin, Plus, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { PageHeader } from '@/components/layout'
import { PcStatus } from '@/components/pc-status'
import { ProjectPicker } from '@/components/project-picker'
import { StateBadge } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { projectName, relativeTime } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { CatalogEntry } from '@/lib/types'

const RECENT_LIMIT = 30

function SessionRow({ s }: { s: CatalogEntry }) {
  return (
    <Link href={`/s/${s.sessionId}`} className="flex items-start gap-3 px-4 py-3 active:bg-muted">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {s.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Fixada" />}
          <span className="truncate">{s.title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{projectName(s.cwd)}</span>
          <span>·</span>
          <span className="shrink-0">{relativeTime(s.lastModified)}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {s.state !== 'stopped' && <StateBadge state={s.state} waitingFor={s.waitingFor} />}
        {s.owner && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {s.owner === 'pc' ? <Monitor className="size-3" /> : <Smartphone className="size-3" />}
            {s.owner === 'pc' ? 'no PC' : 'no painel'}
          </span>
        )}
      </div>
    </Link>
  )
}

function Group({ title, sessions }: { title: string; sessions: CatalogEntry[] }) {
  if (sessions.length === 0) return null
  return (
    <section className="mb-4">
      <h2 className="px-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y">
        {sessions.map((s) => (
          <SessionRow key={s.sessionId} s={s} />
        ))}
      </div>
    </section>
  )
}

export function SessionsPage() {
  const catalog = useStore((s) => s.catalog)
  const loaded = useStore((s) => s.catalogLoaded)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [picker, setPicker] = useState(false)
  const [, navigate] = useLocation()

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
      <PcStatus />
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
          <Group title="Precisam de você" sessions={attention} />
          <Group title="Fixadas" sessions={pinned} />
          <Group title="Abertas agora" sessions={open} />
          <Group title="Recentes" sessions={showAll ? recent : recent.slice(0, RECENT_LIMIT)} />
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
      <ProjectPicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(cwd) => navigate(cwd ? `/nova?cwd=${encodeURIComponent(cwd)}` : '/nova')}
      />
    </>
  )
}
