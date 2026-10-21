import {
  ArrowLeft,
  ChevronDown,
  Copy,
  EllipsisVertical,
  GitBranch,
  GitFork,
  ListChecks,
  Lock,
  LockOpen,
  LogOut,
  Menu,
  Monitor,
  Pencil,
  Pin,
  PinOff,
  Smartphone,
  Trash2,
  Volume2,
  VolumeOff,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link, useLocation } from 'wouter'
import { Composer } from '@/components/chat/composer'
import { buildItems, type Keyed } from '@/components/chat/items'
import { MessageList } from '@/components/chat/message-list'
import { SpeechPlayer } from '@/components/chat/speech-player'
import { SummarySheet } from '@/components/chat/summary-sheet'
import { ExplorerSheet } from '@/components/explorer'
import { GitSheet } from '@/components/git-panel'
import { RepoLink } from '@/components/repo-link'
import { StateBadge } from '@/components/state-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { projectName } from '@/lib/format'
import { useGitStatus, useHome } from '@/lib/hooks'
import { enqueue, useOutbox } from '@/lib/outbox'
import { clearNotifications } from '@/lib/push'
import { setAutoSpeech, speakNew, speechSupported, useSpeech } from '@/lib/speech'
import { onLiveEvent, selectView, subscribe, unsubscribe, useStore } from '@/lib/store'
import type { ContextUsage, LoggedEvent, RunOptions } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Histórico salvo da conversa. Com a sessão aberta no painel, o servidor devolve só o que
 * existia antes do processo (o resto vem ao vivo). Aberta no PC, atualiza periodicamente.
 */
function useHistory(id: string, panelOpen: boolean, pcOwned: boolean, pcWorking: boolean) {
  const [events, setEvents] = useState<LoggedEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const load = useCallback(async () => {
    const ticket = ++latest.current
    try {
      const result = await api.history(id)
      if (ticket === latest.current) {
        setEvents(result)
        setError(null)
      }
    } catch (err) {
      if (ticket === latest.current) setError(errorMessage(err))
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load, panelOpen])

  useEffect(() => {
    if (!pcOwned) return
    const timer = setInterval(load, pcWorking ? 4_000 : 15_000)
    return () => clearInterval(timer)
  }, [load, pcOwned, pcWorking])

  return { events, error }
}

/** Ocupação do contexto da sessão aberta no painel; relida a cada turno concluído. */
function useContextUsage(id: string, enabled: boolean, turns: number): ContextUsage | null {
  const [context, setContext] = useState<ContextUsage | null>(null)
  useEffect(() => {
    if (!enabled) return setContext(null)
    api.context(id).then(setContext, () => {})
  }, [id, enabled, turns])
  return context
}

/** Chave de um evento ao vivo no chat; a resposta lida sozinha precisa da mesma, para o destaque. */
const liveKey = (runId: string | undefined, seq: number) => `l${runId}-${seq}`

// Preferência (o "cadeado") de acompanhar o fim da conversa; vale para todas as sessões.
const FOLLOW_KEY = 'cr:chat-follow'

/**
 * Mantém o feed acompanhando o fim da conversa, de forma robusta.
 * - `follow` (o cadeado) liga/desliga o acompanhamento automático e fica salvo.
 * - Ligado, novas mensagens, streaming, imagens e blocos que crescem grudam no fim. Se o usuário
 *   rola para cima para ler, pausa até ele voltar ao fim (ou tocar em "descer").
 * - `atBottom` diz se já dá para esconder o botão flutuante de "descer".
 */
function useAutoScroll(deps: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [follow, setFollowState] = useState(() => {
    try {
      return localStorage.getItem(FOLLOW_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [atBottom, setAtBottom] = useState(true)
  // Rolou para cima para ler: segura o acompanhamento até voltar ao fim.
  const paused = useRef(false)

  const nearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const onScroll = useCallback(() => {
    const near = nearBottom()
    paused.current = !near
    setAtBottom(near)
  }, [nearBottom])

  // Conteúdo cresceu (markdown, imagens, atividade): gruda no fim se estiver acompanhando.
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (follow && !paused.current) scrollToBottom()
      setAtBottom(nearBottom())
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [follow, nearBottom, scrollToBottom])

  // Novo item/turno/streaming: gruda no fim se estiver acompanhando.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && follow && !paused.current) el.scrollTop = el.scrollHeight
  }, deps)

  const jumpToBottom = useCallback(() => {
    paused.current = false
    scrollToBottom('smooth')
    setAtBottom(true)
  }, [scrollToBottom])

  const setFollow = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(FOLLOW_KEY, next ? '1' : '0')
      } catch {
        // localStorage indisponível (modo privado): segue só em memória.
      }
      setFollowState(next)
      if (next) {
        paused.current = false
        scrollToBottom('smooth')
        setAtBottom(true)
      }
    },
    [scrollToBottom],
  )

  return { scrollRef, contentRef, onScroll, atBottom, follow, setFollow, jumpToBottom }
}

export function ChatPage({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const view = useStore(selectView(id))
  const entry = useStore((s) => s.catalog.find((c) => c.sessionId === id))
  const rekeyed = useStore((s) => s.rekeys[id])
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [confirmTakeover, setConfirmTakeover] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const home = useHome()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    subscribe(id)
    return () => unsubscribe(id)
  }, [id])

  // Conversa na tela: os avisos dela na barra de notificações já foram vistos.
  useEffect(() => {
    const clear = () => document.visibilityState === 'visible' && void clearNotifications(id).catch(() => {})
    clear()
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [id])

  useEffect(() => {
    if (rekeyed) navigate(`/s/${rekeyed}`, { replace: true })
  }, [rekeyed, navigate])

  // Leitura automática (o alto-falante no topo): as respostas que chegam ao vivo, nunca o histórico.
  const autoSpeech = useSpeech((s) => s.auto)
  useEffect(
    () =>
      onLiveEvent((sessionId, runId, e) => {
        if (sessionId === id && e.kind === 'assistant' && !e.parentToolUseId) speakNew(liveKey(runId, e.seq), e.text)
      }),
    [id],
  )

  // O WebSocket sabe primeiro quando o processo do painel abre ou fecha; o catálogo cobre o resto.
  const panelOpen = view.open === true || (view.open === null && entry?.owner === 'panel')
  const owner = panelOpen ? 'panel' : entry?.owner === 'pc' ? 'pc' : null
  const state = panelOpen ? view.state : entry?.state
  const waitingFor = panelOpen ? view.waitingFor : entry?.waitingFor
  const working = panelOpen && (state === 'running' || state === 'starting')

  const history = useHistory(id, panelOpen, owner === 'pc', entry?.state === 'running')

  const events: Keyed[] = useMemo(
    () => [
      ...(history.events ?? []).map((e, i) => ({ ...e, key: `h${i}` })),
      ...(panelOpen ? view.events.map((e) => ({ ...e, key: liveKey(view.runId, e.seq) })) : []),
    ],
    [history.events, panelOpen, view.events, view.runId],
  )
  const items = useMemo(() => buildItems(events), [events])
  const outbox = useOutbox((s) => s.items)
  const queued = useMemo(() => {
    // O evento da mensagem costuma chegar pelo WebSocket antes da resposta do envio: aí ela já saiu da fila.
    const delivered = new Set(view.events.flatMap((e) => (e.kind === 'user' && e.clientId ? [e.clientId] : [])))
    return outbox.filter((i) => i.sessionId === id && !delivered.has(i.id))
  }, [outbox, id, view.events])
  const turns = useMemo(() => view.events.filter((e) => e.kind === 'result').length, [view.events])
  const context = useContextUsage(id, panelOpen, turns)
  // Com projeto (não a pasta pessoal): explorador de arquivos e git no topo.
  const project = entry?.cwd && home && entry.cwd !== home ? entry.cwd : undefined
  const git = useGitStatus(project, turns)
  // Conversa parada: modelo/esforço/modo escolhidos agora valem quando ela for retomada.
  const [pending, setPending] = useState<RunOptions>({})
  const { scrollRef, contentRef, onScroll, atBottom, follow, setFollow, jumpToBottom } = useAutoScroll([
    items.length,
    queued.length,
    view.streaming,
    history.events === null,
  ])

  const resumeCommand = entry?.cwd ? `cd '${entry.cwd}' && claude --resume ${id}` : `claude --resume ${id}`

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const release = () =>
    run(async () => {
      const { resumeCommand: cmd } = await api.release(id)
      toast.success('Sessão liberada. No PC, rode:', {
        description: cmd,
        duration: 15_000,
        action: { label: 'Copiar', onClick: () => navigator.clipboard.writeText(cmd) },
      })
    })

  const fork = () =>
    run(async () => {
      const { sessionId } = await api.open(id, { fork: true })
      navigate(`/s/${sessionId}`)
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        {project && (
          <Button variant="ghost" size="icon" onClick={() => setExplorerOpen(true)} aria-label="Arquivos do projeto">
            <Menu />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{entry?.title ?? 'Sessão'}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{projectName(entry?.cwd)}</span>
            {owner === 'pc' && <Monitor className="size-3 shrink-0" />}
            {owner === 'panel' && <Smartphone className="size-3 shrink-0" />}
            <StateBadge state={state} waitingFor={waitingFor} className="h-5 shrink-0 px-1.5 text-[10px]" />
          </div>
        </div>
        {speechSupported && (
          <Button
            variant={autoSpeech ? 'default' : 'ghost'}
            size="icon"
            className={cn(autoSpeech && 'rounded-full')}
            onClick={() => {
              setAutoSpeech(!autoSpeech)
              if (autoSpeech) toast('Leitura automática desligada')
              else toast('Leitura automática ligada', { description: 'As respostas novas do Claude serão lidas em voz alta.' })
            }}
            aria-pressed={autoSpeech}
            aria-label={autoSpeech ? 'Leitura automática ligada: tocar para desligar' : 'Ler as respostas novas em voz alta'}
          >
            {autoSpeech ? <Volume2 /> : <VolumeOff />}
          </Button>
        )}
        {project && git.status?.remote && <RepoLink url={git.status.remote} />}
        {project && git.status && (
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => {
              git.reload()
              setGitOpen(true)
            }}
            aria-label={`Git: ${git.status.files.length} arquivos alterados`}
          >
            <GitBranch />
            {git.status.files.length > 0 && (
              <span className="absolute top-0.5 right-0 min-w-4 rounded-full bg-sky-600 px-1 text-center text-[9px] leading-4 font-semibold text-white">
                {git.status.files.length > 99 ? '99+' : git.status.files.length}
              </span>
            )}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {owner === 'panel' && (
              <DropdownMenuItem disabled={busy || state === 'running' || state === 'waiting'} onSelect={release}>
                <LogOut /> Liberar para o PC
              </DropdownMenuItem>
            )}
            {owner === 'pc' && (
              <DropdownMenuItem disabled={busy || state !== 'idle'} onSelect={() => setConfirmTakeover(true)}>
                <Smartphone /> Assumir sessão
              </DropdownMenuItem>
            )}
            {owner !== 'panel' && (
              <DropdownMenuItem disabled={busy} onSelect={fork}>
                <GitFork /> Continuar numa cópia
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setSummaryOpen(true)}>
              <ListChecks /> Resumo da sessão
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={busy || !entry}
              onSelect={() => run(() => api.pin(id, !entry?.pinned), entry?.pinned ? 'Desafixada' : 'Fixada no topo')}
            >
              {entry?.pinned ? <PinOff /> : <Pin />} {entry?.pinned ? 'Desafixar' : 'Fixar no topo'}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onSelect={() => setRenaming(entry?.title ?? '')}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigator.clipboard.writeText(resumeCommand).then(() => toast.success('Comando copiado'))}>
              <Copy /> Copiar comando de retomada
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={busy || owner === 'pc'} onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> {owner === 'pc' ? 'Apagar (feche no PC antes)' : 'Apagar conversa'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto">
          <div ref={contentRef}>
            {history.events === null && !history.error ? (
              <div className="space-y-4 p-4">
                <Skeleton className="ml-auto h-10 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <>
                {history.error && <p className="p-4 text-sm text-red-600 dark:text-red-400">{history.error}</p>}
                {items.length === 0 && queued.length === 0 && !working && !history.error && (
                  <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                )}
                <MessageList
                  items={items}
                  queued={queued}
                  sessionId={id}
                  actionable={panelOpen}
                  streaming={view.streaming}
                  working={working}
                />
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
          {!atBottom && (
            <Button
              variant="secondary"
              size="icon"
              onClick={jumpToBottom}
              aria-label="Ir para a última mensagem"
              className="pointer-events-auto size-10 rounded-full border shadow-lg"
            >
              <ChevronDown />
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setFollow(!follow)}
            aria-pressed={follow}
            aria-label={follow ? 'Acompanhando o fim: tocar para soltar o scroll' : 'Scroll solto: tocar para travar no fim'}
            className={cn(
              'pointer-events-auto size-9 rounded-full border shadow-md backdrop-blur',
              follow ? 'bg-background/70 text-muted-foreground' : 'bg-background text-foreground',
            )}
          >
            {follow ? <Lock /> : <LockOpen />}
          </Button>
        </div>
      </div>

      <SpeechPlayer />

      {owner === 'pc' ? (
        <div className="shrink-0 space-y-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-xs text-muted-foreground">
            {state === 'idle'
              ? 'Aberta no PC e ociosa. Assumir encerra a sessão no PC e a continua aqui, com todo o contexto.'
              : 'Aberta no PC e ocupada. Dá para assumir quando ela ficar ociosa.'}
          </p>
          <Button className="h-11 w-full" disabled={busy || state !== 'idle'} onClick={() => setConfirmTakeover(true)}>
            <Smartphone /> Assumir sessão
          </Button>
        </div>
      ) : owner === 'panel' ? (
        <Composer
          sessionId={id}
          cwd={entry?.cwd}
          branch={git.status?.branch}
          working={working || state === 'waiting'}
          // Logo após retomar, enquanto o primeiro evento de ajustes não chega, vale o que foi escolhido.
          settings={Object.keys(view.settings).length ? view.settings : pending}
          context={context}
          onChangeSettings={async (patch) => {
            await api.settings(id, patch)
          }}
          onCompact={() => api.send(id, { text: '/compact' }).then(() => undefined)}
          onSend={(text, attachments) => enqueue(id, text, attachments)}
          onInterrupt={() => api.interrupt(id).then(() => undefined)}
        />
      ) : (
        <Composer
          sessionId={id}
          cwd={entry?.cwd}
          branch={git.status?.branch}
          working={false}
          hint="Enviar retoma esta conversa aqui pelo celular."
          settings={pending}
          context={null}
          onChangeSettings={(patch) => setPending((p) => ({ ...p, ...patch }))}
          onSend={(text, attachments) => enqueue(id, text, attachments, pending)}
        />
      )}

      <SummarySheet sessionId={id} events={events} cwd={entry?.cwd} open={summaryOpen} onOpenChange={setSummaryOpen} />

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear sessão</DialogTitle>
          </DialogHeader>
          <form
            id="rename"
            onSubmit={(e) => {
              e.preventDefault()
              const title = renaming?.trim()
              if (!title) return
              setRenaming(null)
              void run(() => api.rename(id, title), 'Título salvo')
            }}
          >
            <Input value={renaming ?? ''} onChange={(e) => setRenaming(e.target.value)} autoFocus maxLength={200} />
          </form>
          <p className="text-xs text-muted-foreground">O título vale também no /resume do terminal e no VSCode.</p>
          <DialogFooter>
            <Button type="submit" form="rename" disabled={!renaming?.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {project && <ExplorerSheet cwd={project} open={explorerOpen} onOpenChange={setExplorerOpen} />}
      {project && git.status && (
        <GitSheet cwd={project} status={git.status} open={gitOpen} onOpenChange={setGitOpen} onRefresh={git.reload} />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              O histórico é removido do Claude Code: some também do /resume no terminal e do VSCode. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                run(async () => {
                  await api.remove(id)
                  navigate('/', { replace: true })
                }, 'Conversa apagada')
              }
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmTakeover} onOpenChange={setConfirmTakeover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assumir esta sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão aberta no PC será encerrada e a conversa continua aqui, com todo o contexto. Para voltar ao PC depois, use
              “Liberar para o PC”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => api.takeover(id), 'Sessão assumida')}>Assumir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
