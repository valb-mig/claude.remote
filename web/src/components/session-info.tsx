import { Monitor, Pin, Smartphone } from 'lucide-react'
import { StateBadge } from '@/components/state-badge'
import { projectName, relativeTime } from '@/lib/format'
import type { CatalogEntry } from '@/lib/types'

/** Conteúdo de uma conversa numa lista: título, projeto, quando mexeu por último, estado e onde está aberta. */
export function SessionInfo({ s }: { s: CatalogEntry }) {
  return (
    <>
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
    </>
  )
}
