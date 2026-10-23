import { House, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Link } from 'wouter'
import { PageHeader } from '@/components/layout'
import { MachineFilter } from '@/components/machine-filter'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { projectName, relativeTime, shortPath } from '@/lib/format'
import { HOME, newChatUrl, useMachineFilter } from '@/lib/machines'
import { useStore } from '@/lib/store'

export function ProjectsPage() {
  const catalog = useStore((s) => s.catalog)
  // Com várias máquinas, os projetos são os da máquina do filtro do topo (sem "Todas").
  const machine = useMachineFilter() ?? HOME
  const [projects, setProjects] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setProjects(null)
    api.projects(machine).then(setProjects, (err) => toast.error(errorMessage(err)))
  }, [machine])

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; last: number }>()
    for (const c of catalog) {
      if (!c.cwd || (c.machine ?? HOME) !== machine) continue
      const s = map.get(c.cwd) ?? { count: 0, last: 0 }
      map.set(c.cwd, { count: s.count + 1, last: Math.max(s.last, c.lastModified) })
    }
    return map
  }, [catalog, machine])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (projects ?? [])
      .filter((p) => !q || p.toLowerCase().includes(q))
      .sort((a, b) => (stats.get(b)?.last ?? 0) - (stats.get(a)?.last ?? 0) || a.localeCompare(b))
  }, [projects, query, stats])

  return (
    <>
      <PageHeader title="Projetos" />
      <MachineFilter all={false} className="px-4 pb-3" />
      <div className="px-4 pb-3">
        <Input type="search" placeholder="Buscar projeto" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {projects === null ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y pb-4">
          {!query.trim() && (
            <Link href={newChatUrl(undefined, machine)} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
              <House className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Sem projeto</div>
                <div className="text-xs text-muted-foreground">Abre na pasta pessoal (~)</div>
              </div>
              <Plus className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
          {list.map((p) => {
            const s = stats.get(p)
            return (
              <Link key={p} href={newChatUrl(p, machine)} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{projectName(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s ? `${s.count} ${s.count === 1 ? 'sessão' : 'sessões'} · ${relativeTime(s.last)}` : shortPath(p)}
                  </div>
                </div>
                <Plus className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
          {list.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum projeto encontrado.</p>}
        </div>
      )}
    </>
  )
}
