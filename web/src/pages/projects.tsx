import { ArrowDown, ArrowUp, GitBranch, House, Loader2, Plus } from 'lucide-react'
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
import type { GitSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

type Stats = { count: number; last: number }

const pending = (g: GitSummary | undefined) => Boolean(g && (g.changed > 0 || g.ahead > 0 || g.behind > 0))

const BADGE = 'flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-medium'

/** Arquivos alterados, commits a enviar (↑) e commits novos no remoto (↓). */
function GitBadges({ g }: { g: GitSummary }) {
  return (
    <>
      {g.changed > 0 && (
        <span className={cn(BADGE, 'bg-sky-500/15 text-sky-700 dark:text-sky-300')}>
          {g.changed} {g.changed === 1 ? 'alterado' : 'alterados'}
        </span>
      )}
      {g.ahead > 0 && (
        <span
          className={cn(BADGE, 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}
          title={`${g.ahead} ${g.ahead === 1 ? 'commit para enviar' : 'commits para enviar'}`}
        >
          <ArrowUp className="size-3" />
          {g.ahead}
        </span>
      )}
      {g.behind > 0 && (
        <span
          className={cn(BADGE, 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300')}
          title={`${g.behind} ${g.behind === 1 ? 'commit novo' : 'commits novos'} em ${g.upstream}`}
        >
          <ArrowDown className="size-3" />
          {g.behind}
        </span>
      )}
    </>
  )
}

function ProjectRow({ cwd, machine, stats, git }: { cwd: string; machine: string; stats?: Stats; git?: GitSummary }) {
  const changes = pending(git)
  return (
    <Link href={newChatUrl(cwd, machine)} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{projectName(cwd)}</span>
          {git && <GitBadges g={git} />}
        </div>
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {changes && git?.branch && (
            <>
              <GitBranch className="size-3 shrink-0" />
              <span className="max-w-[40%] shrink-0 truncate">{git.branch}</span>
              <span className="shrink-0">·</span>
            </>
          )}
          <span className="truncate">
            {stats ? `${stats.count} ${stats.count === 1 ? 'sessão' : 'sessões'} · ${relativeTime(stats.last)}` : shortPath(cwd)}
          </span>
        </div>
      </div>
      <Plus className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

export function ProjectsPage() {
  const catalog = useStore((s) => s.catalog)
  // Com várias máquinas, os projetos são os da máquina do filtro do topo (sem "Todas").
  const machine = useMachineFilter() ?? HOME
  const [projects, setProjects] = useState<string[] | null>(null)
  const [git, setGit] = useState<Record<string, GitSummary>>({})
  const [checking, setChecking] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setProjects(null)
    api.projects(machine).then(setProjects, (err) => toast.error(errorMessage(err)))
  }, [machine])

  // Primeiro o git local, que é rápido; depois de novo, com o remoto consultado (git fetch).
  useEffect(() => {
    let alive = true
    setGit({})
    setChecking(true)
    api
      .projectsGit(machine)
      .then((g) => {
        if (alive) setGit(g)
        return api.projectsGit(machine, true)
      })
      .then((g) => alive && setGit(g))
      // Máquina com servidor antigo, sem a rota: a lista segue sem o git.
      .catch(() => {})
      .finally(() => alive && setChecking(false))
    return () => {
      alive = false
    }
  }, [machine])

  const stats = useMemo(() => {
    const map = new Map<string, Stats>()
    for (const c of catalog) {
      if (!c.cwd || (c.machine ?? HOME) !== machine) continue
      const s = map.get(c.cwd) ?? { count: 0, last: 0 }
      map.set(c.cwd, { count: s.count + 1, last: Math.max(s.last, c.lastModified) })
    }
    return map
  }, [catalog, machine])

  const { changed, rest } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (projects ?? [])
      .filter((p) => !q || p.toLowerCase().includes(q))
      .sort((a, b) => (stats.get(b)?.last ?? 0) - (stats.get(a)?.last ?? 0) || a.localeCompare(b))
    return { changed: list.filter((p) => pending(git[p])), rest: list.filter((p) => !pending(git[p])) }
  }, [projects, query, stats, git])

  return (
    <>
      <PageHeader
        title="Projetos"
        action={
          checking && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Conferindo o remoto
            </span>
          )
        }
      />
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
        <>
          {changed.length > 0 && (
            <section className="mb-4">
              <h2 className="px-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Com mudanças</h2>
              <div className="divide-y">
                {changed.map((p) => (
                  <ProjectRow key={p} cwd={p} machine={machine} stats={stats.get(p)} git={git[p]} />
                ))}
              </div>
            </section>
          )}
          <section className="pb-4">
            {changed.length > 0 && (
              <h2 className="px-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Outros projetos</h2>
            )}
            <div className="divide-y">
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
              {rest.map((p) => (
                <ProjectRow key={p} cwd={p} machine={machine} stats={stats.get(p)} git={git[p]} />
              ))}
              {changed.length + rest.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum projeto encontrado.</p>}
            </div>
          </section>
        </>
      )}
    </>
  )
}
