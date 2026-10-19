import { CheckCircle2, XCircle } from 'lucide-react'
import { useMemo } from 'react'
import { ImageThumb } from '@/components/image-viewer'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { imageUrl } from '@/lib/api'
import { FILE_TOOLS, TEST_COMMAND, shortPath } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Keyed } from './items'

type Summary = {
  files: { path: string; edits: number }[]
  commands: { command: string; failed: boolean }[]
  errors: { tool: string; text: string }[]
  tests: { command: string; failed: boolean }[]
  /** Chaves das imagens, na ordem do chat: anexadas pela pessoa e devolvidas por ferramentas (prints, imagens lidas). */
  media: { mine: string[]; claude: string[] }
}

function summarize(events: Keyed[]): Summary {
  const failed = new Map<string, string | null>()
  const media: Summary['media'] = { mine: [], claude: [] }
  for (const e of events) {
    if (e.kind === 'user' && e.images) media.mine.push(...e.images)
    if (e.kind !== 'tool_result') continue
    failed.set(e.toolUseId, e.isError ? e.text : null)
    if (e.images) media.claude.push(...e.images)
  }

  const files = new Map<string, number>()
  const commands: Summary['commands'] = []
  const errors: Summary['errors'] = []
  for (const e of events) {
    if (e.kind !== 'tool_use') continue
    const error = failed.get(e.id)
    if (error) errors.push({ tool: e.name, text: error.split('\n')[0] ?? '' })
    const path = e.input.file_path ?? e.input.notebook_path
    if (FILE_TOOLS.has(e.name) && typeof path === 'string' && !error) files.set(path, (files.get(path) ?? 0) + 1)
    if (e.name === 'Bash' && typeof e.input.command === 'string') {
      commands.push({ command: e.input.command, failed: Boolean(error) })
    }
  }
  return {
    files: [...files].map(([path, edits]) => ({ path, edits })),
    commands,
    errors,
    tests: commands.filter((c) => TEST_COMMAND.test(c.command)),
    media,
  }
}

function Section({ title, count, className, children }: { title: string; count: number; className?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {title} <span className="text-muted-foreground">({count})</span>
      </h3>
      {count === 0 ? <p className="text-xs text-muted-foreground">Nada por aqui.</p> : <ul className={cn('space-y-1', className)}>{children}</ul>}
    </section>
  )
}

/** Grade de miniaturas; tocar abre a imagem em tela cheia, como no chat. */
function MediaGroup({ sessionId, title, keys }: { sessionId: string; title: string; keys: string[] }) {
  if (keys.length === 0) return null
  return (
    <li className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {title} ({keys.length})
      </p>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {keys.map((key) => (
          <ImageThumb key={key} src={imageUrl(sessionId, key)} className="aspect-square w-full" />
        ))}
      </div>
    </li>
  )
}

const Status = ({ failed }: { failed: boolean }) =>
  failed ? (
    <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
  ) : (
    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
  )

export function SummarySheet({
  sessionId,
  events,
  cwd,
  open,
  onOpenChange,
}: {
  sessionId: string
  events: Keyed[]
  cwd?: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const s = useMemo(() => summarize(events), [events])
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Resumo da sessão</SheetTitle>
          <SheetDescription>Com base nas mensagens carregadas.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <Section title="Mídia" count={s.media.mine.length + s.media.claude.length} className="space-y-3">
            <MediaGroup sessionId={sessionId} title="Enviadas por você" keys={s.media.mine} />
            <MediaGroup sessionId={sessionId} title="Do Claude" keys={s.media.claude} />
          </Section>
          <Section title="Arquivos alterados" count={s.files.length}>
            {s.files.map((f) => {
              const rel = cwd && f.path.startsWith(`${cwd}/`) ? f.path.slice(cwd.length + 1) : shortPath(f.path)
              const slash = rel.lastIndexOf('/')
              return (
                <li key={f.path} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-mono font-medium">{rel.slice(slash + 1)}</div>
                    {slash > 0 && <div className="truncate font-mono text-muted-foreground">{rel.slice(0, slash)}</div>}
                  </div>
                  <span className="shrink-0 text-muted-foreground">{f.edits}×</span>
                </li>
              )
            })}
          </Section>
          <Section title="Testes" count={s.tests.length}>
            {s.tests.map((t, i) => (
              <li key={i} className="flex items-start gap-2 font-mono text-xs">
                <Status failed={t.failed} />
                <span className="line-clamp-3 break-all">{t.command}</span>
              </li>
            ))}
          </Section>
          <Section title="Erros" count={s.errors.length}>
            {s.errors.map((e, i) => (
              <li key={i} className="text-xs">
                <span className="font-medium">{e.tool}: </span>
                <span className="text-red-700 dark:text-red-300">{e.text}</span>
              </li>
            ))}
          </Section>
          <Section title="Comandos" count={s.commands.length}>
            {s.commands.map((c, i) => (
              <li key={i} className="flex items-start gap-2 font-mono text-xs">
                <Status failed={c.failed} />
                <span className="line-clamp-3 break-all">{c.command}</span>
              </li>
            ))}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
