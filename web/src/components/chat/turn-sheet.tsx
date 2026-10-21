import { CheckCircle2, ChevronRight, ExternalLink, FilePen, Globe, Loader2, Search, XCircle } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { shortPath } from '@/lib/format'
import { ToolDetails } from './activity'
import { hostOf, type ToolEntry, type TurnInfo } from './turn'

export type TurnSection = 'files' | 'commands' | 'links'

function Section({ id, open, title, count, children }: { id: TurnSection; open: TurnSection; title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    // O atalho tocado (arquivos, comandos ou links) abre o painel já na seção dele.
    <section ref={(el) => void (el && id === open && el.scrollIntoView({ block: 'start' }))} className="scroll-mt-2 space-y-1">
      <h3 className="px-2 text-sm font-medium">
        {title} <span className="text-muted-foreground">({count})</span>
      </h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

/** Linha que abre para mostrar os detalhes (o diff da edição, a saída do comando). */
function Expandable({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60">
          {trigger}
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 px-2 pt-1 pb-2">{children}</CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function Status({ tool }: { tool: ToolEntry }) {
  if (!tool.result) return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
  return tool.result.isError ? (
    <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
  ) : (
    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
  )
}

/** O que o Claude fez num turno: arquivos que mudou (com o diff), comandos que rodou e links que acessou. */
export function TurnSheet({
  turn,
  cwd,
  section,
  open,
  onOpenChange,
}: {
  turn: TurnInfo
  cwd?: string
  section: TurnSection
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const rel = (path: string) => (cwd && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : shortPath(path))
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto lg:mx-auto lg:max-w-2xl lg:rounded-t-xl lg:border-x">
        <SheetHeader>
          <SheetTitle>Nesta resposta</SheetTitle>
          <SheetDescription>O que o Claude fez neste turno, da sua mensagem até a resposta.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-2 pb-6">
          <Section id="files" open={section} title="Arquivos alterados" count={turn.files.length}>
            {turn.files.map((f) => {
              const path = rel(f.path)
              const slash = path.lastIndexOf('/')
              return (
                <Expandable
                  key={f.path}
                  trigger={
                    <>
                      <FilePen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-medium">{path.slice(slash + 1)}</div>
                        {slash > 0 && <div className="truncate font-mono text-xs text-muted-foreground">{path.slice(0, slash)}</div>}
                      </div>
                      <span className="shrink-0 font-mono text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">+{f.added}</span>{' '}
                        <span className="text-red-600 dark:text-red-400">−{f.removed}</span>
                      </span>
                    </>
                  }
                >
                  {f.changes.map((c) => (
                    <div key={c.key} className="space-y-1">
                      <ToolDetails use={c.use} result={c.result} />
                    </div>
                  ))}
                </Expandable>
              )
            })}
          </Section>

          <Section id="commands" open={section} title="Comandos" count={turn.commands.length}>
            {turn.commands.map((c) => {
              const description = typeof c.use.input.description === 'string' ? c.use.input.description : ''
              const command = typeof c.use.input.command === 'string' ? c.use.input.command : ''
              return (
                <Expandable
                  key={c.key}
                  trigger={
                    <>
                      <Status tool={c} />
                      <div className="min-w-0 flex-1">
                        {description && <div className="truncate text-xs font-medium">{description}</div>}
                        <div className="line-clamp-2 font-mono text-xs break-all text-muted-foreground">{command}</div>
                      </div>
                    </>
                  }
                >
                  <ToolDetails use={c.use} result={c.result} />
                </Expandable>
              )
            })}
          </Section>

          <Section id="links" open={section} title="Links" count={turn.visited.length + turn.cited.length}>
            {turn.visited.map(({ tool, url, query }) =>
              url ? (
                <li key={tool.key}>
                  <a href={url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                    <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">Acessou {hostOf(url)}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{url}</div>
                    </div>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ) : (
                <Expandable
                  key={tool.key}
                  trigger={
                    <>
                      <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="font-medium">Pesquisou</span> <span className="text-muted-foreground">“{query}”</span>
                      </div>
                    </>
                  }
                >
                  <ToolDetails use={tool.use} result={tool.result} />
                </Expandable>
              ),
            )}
            {turn.cited.map(({ url, label }) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                  <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">Citado: {label}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{url}</div>
                  </div>
                </a>
              </li>
            ))}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
