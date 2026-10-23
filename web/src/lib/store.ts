import { create } from 'zustand'
import { HOME, baseOf, machineOf, noteSession, noteSessions, useMachines } from './machines'
import type { CatalogEntry, LoggedEvent, SessionSettings, SessionState, SystemSnapshot, UsageSnapshot } from './types'

export type Connection = 'connecting' | 'open' | 'closed'

/** Estado ao vivo de uma sessão aberta no painel (vindo do WebSocket). */
export type LiveView = {
  runId?: string
  events: LoggedEvent[]
  lastSeq: number
  state?: SessionState
  waitingFor?: string
  /** Texto parcial do turno em andamento. */
  streaming: string
  /** Processo do painel ativo? `null` enquanto não se sabe. */
  open: boolean | null
  /** Modelo, esforço e modo vigentes (último evento `settings`). */
  settings: SessionSettings
}

type Store = {
  /** Conexão com a máquina desta página (a faixa "Sem conexão" no topo). */
  connection: Connection
  /** Conexão com cada máquina (ver machines.ts). */
  connections: Record<string, Connection>
  /** Conversas de todas as máquinas, cada uma com `machine`. */
  catalog: CatalogEntry[]
  catalogLoaded: boolean
  live: Record<string, LiveView>
  /** Sessões bifurcadas que ganharam ID novo: antigo → novo. */
  rekeys: Record<string, string>
  /** CPU, memória e processos do Claude em cada máquina (a cada ~3 s). */
  systems: Record<string, SystemSnapshot>
  /** Limites do plano e gasto da semana, por máquina. */
  usages: Record<string, UsageSnapshot>
}

export const useStore = create<Store>(() => ({
  connection: 'connecting',
  connections: {},
  catalog: [],
  catalogLoaded: false,
  live: {},
  rekeys: {},
  systems: {},
  usages: {},
}))

const emptyView = (): LiveView => ({ events: [], lastSeq: 0, streaming: '', open: null, settings: {} })

const settingsOf = (events: LoggedEvent[], fallback: SessionSettings): SessionSettings => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!
    if (e.kind === 'settings') return { model: e.model, effort: e.effort, permissionMode: e.permissionMode }
  }
  return fallback
}

export const selectView = (id: string) => (s: Store) => s.live[id] ?? EMPTY
const EMPTY = emptyView()

function patchView(id: string, fn: (v: LiveView) => LiveView): void {
  useStore.setState((s) => ({ live: { ...s.live, [id]: fn(s.live[id] ?? emptyView()) } }))
}

// ---------------------------------------------------------------------------
// Conexões WebSocket, uma por máquina (ver machines.ts): reconectam sozinhas e retomam cada
// sessão do último seq visto.
// ---------------------------------------------------------------------------

const STALE_MS = 60_000

/** Sessões acompanhadas e a máquina em cuja conexão cada uma está inscrita. */
const subscribed = new Map<string, string>()
// Conversas de cada máquina; o catálogo do store junta todas.
const catalogs = new Map<string, CatalogEntry[]>()

function setConnection(machine: string, state: Connection): void {
  useStore.setState((s) => ({
    connections: { ...s.connections, [machine]: state },
    ...(machine === HOME ? { connection: state } : {}),
  }))
}

class MachineSocket {
  machine: string
  ws: WebSocket | null = null
  retry = 0
  retryTimer: ReturnType<typeof setTimeout> | undefined
  lastMessageAt = 0
  /** Saiu da lista de máquinas: não reconecta mais. */
  disposed = false

  constructor(machine: string) {
    this.machine = machine
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private url(): string {
    const base = baseOf(this.machine)
    if (base) return `${base.replace(/^http/, 'ws')}/ws`
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  }

  connect(): void {
    if (this.ws || this.disposed) return
    clearTimeout(this.retryTimer)
    setConnection(this.machine, 'connecting')
    const socket = new WebSocket(this.url())
    this.ws = socket

    socket.onopen = () => {
      this.retry = 0
      this.lastMessageAt = Date.now()
      setConnection(this.machine, 'open')
      for (const [id, machine] of subscribed) if (machine === this.machine) this.sendSubscribe(id)
    }
    socket.onmessage = (e) => {
      this.lastMessageAt = Date.now()
      handle(this.machine, JSON.parse(String(e.data)))
    }
    socket.onclose = () => {
      if (this.ws !== socket) return
      this.ws = null
      setConnection(this.machine, 'closed')
      if (!this.disposed) this.retryTimer = setTimeout(() => this.connect(), Math.min(15_000, 1_000 * 2 ** this.retry++))
    }
  }

  /** Derruba a conexão atual (se parecer morta) e reconecta já, sem esperar o backoff. */
  reconnectNow(force: boolean): void {
    const stale = Date.now() - this.lastMessageAt > STALE_MS
    if (this.ws && (force || stale)) {
      const old = this.ws
      this.ws = null
      old.close()
    }
    this.retry = 0
    this.connect()
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.retryTimer)
    const old = this.ws
    this.ws = null
    old?.close()
  }

  send(msg: unknown): void {
    if (this.open) this.ws!.send(JSON.stringify(msg))
  }

  sendSubscribe(id: string): void {
    const v = useStore.getState().live[id]
    this.send({ type: 'subscribe', sessionId: id, sinceSeq: v?.lastSeq ?? 0, runId: v?.runId })
  }
}

const sockets = new Map<string, MachineSocket>()

const socketOf = (sessionId: string) => sockets.get(subscribed.get(sessionId) ?? machineOf(sessionId))

/** Uma conexão para cada máquina da lista; a que sai da lista é fechada e some do catálogo. */
function syncSockets(): void {
  const ids = new Set(useMachines.getState().machines.map((m) => m.id))
  for (const id of ids) {
    if (sockets.has(id)) continue
    const socket = new MachineSocket(id)
    sockets.set(id, socket)
    socket.connect()
  }
  for (const [id, socket] of sockets) {
    if (ids.has(id)) continue
    socket.dispose()
    sockets.delete(id)
    catalogs.delete(id)
    mergeCatalogs()
  }
}

let started = false

export function connect(): void {
  if (started) return
  started = true
  syncSockets()
  useMachines.subscribe(syncSockets)
}

/** Reconecta já com todas as máquinas: `force` derruba até as que parecem vivas. */
export function reconnectNow(force = false): void {
  for (const socket of sockets.values()) socket.reconnectNow(force)
}

// Celular voltando do bloqueio ou da falta de rede: as conexões antigas podem estar mortas.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reconnectNow()
})
window.addEventListener('online', () => reconnectNow(true))
setInterval(() => {
  for (const socket of sockets.values()) {
    if (socket.open && Date.now() - socket.lastMessageAt > STALE_MS) socket.reconnectNow(true)
  }
}, 15_000)

/** Pede o log inteiro da execução atual, descartando o que o cliente tem. */
function resync(id: string): void {
  socketOf(id)?.send({ type: 'subscribe', sessionId: id, sinceSeq: 0 })
}

export function subscribe(id: string): void {
  const machine = machineOf(id)
  subscribed.set(id, machine)
  sockets.get(machine)?.sendSubscribe(id)
}

export function unsubscribe(id: string): void {
  const machine = subscribed.get(id)
  subscribed.delete(id)
  if (machine !== undefined) sockets.get(machine)?.send({ type: 'unsubscribe', sessionId: id })
}

// ---------------------------------------------------------------------------
// Mensagens do servidor
// ---------------------------------------------------------------------------

type ServerMsg =
  | { type: 'hello' | 'tick' }
  | { type: 'catalog'; sessions: CatalogEntry[] }
  | {
      type: 'snapshot'
      sessionId: string
      runId: string
      state: SessionState
      waitingFor?: string
      reset: boolean
      events: LoggedEvent[]
    }
  | { type: 'not_open'; sessionId: string }
  | { type: 'event'; sessionId: string; runId: string; event: LoggedEvent }
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'rekey'; from: string; to: string }
  | { type: 'system'; system: SystemSnapshot }
  | { type: 'usage'; usage: UsageSnapshot }

type LiveListener = (sessionId: string, runId: string, event: LoggedEvent) => void
const liveListeners = new Set<LiveListener>()

/** Eventos que chegam ao vivo pelo WebSocket, uma vez cada; não inclui o histórico nem o snapshot. */
export function onLiveEvent(listener: LiveListener): () => void {
  liveListeners.add(listener)
  return () => {
    liveListeners.delete(listener)
  }
}

function handle(machine: string, m: ServerMsg): void {
  switch (m.type) {
    case 'catalog':
      return onCatalog(machine, m.sessions)
    case 'system':
      return useStore.setState((s) => ({ systems: { ...s.systems, [machine]: m.system } }))
    case 'usage':
      return useStore.setState((s) => ({ usages: { ...s.usages, [machine]: m.usage } }))
    case 'snapshot':
      return patchView(m.sessionId, (v) => {
        const sameRun = v.runId === m.runId && !m.reset
        const base = sameRun ? v.events : []
        const since = sameRun ? v.lastSeq : 0
        const events = [...base, ...m.events.filter((e) => e.seq > since)]
        return {
          ...v,
          runId: m.runId,
          events,
          lastSeq: events.at(-1)?.seq ?? 0,
          state: m.state,
          waitingFor: m.waitingFor,
          open: m.state !== 'exited',
          streaming: m.state === 'running' ? v.streaming : '',
          settings: settingsOf(events, sameRun ? v.settings : {}),
        }
      })
    case 'not_open':
      return patchView(m.sessionId, (v) => ({ ...v, open: false, streaming: '' }))
    case 'event': {
      const before = useStore.getState().live[m.sessionId]
      patchView(m.sessionId, (v) => applyEvent(v, m.runId, m.event))
      // Repetido (já veio no snapshot ou num reenvio): não é novidade.
      if (before?.runId !== m.runId || m.event.seq > before.lastSeq) {
        for (const listener of liveListeners) listener(m.sessionId, m.runId, m.event)
      }
      if (before?.runId === m.runId) {
        // Buraco na sequência (mensagem perdida): pede o que falta.
        if (m.event.seq > before.lastSeq + 1) socketOf(m.sessionId)?.sendSubscribe(m.sessionId)
      } else if (m.event.seq > 1) {
        // Execução nova pega pela metade (ex.: eventos gravados antes de a sessão ser anunciada): pede tudo.
        resync(m.sessionId)
      }
      return
    }
    case 'delta':
      return patchView(m.sessionId, (v) => ({ ...v, streaming: v.streaming + m.text }))
    case 'rekey':
      useStore.setState((s) => {
        const { [m.from]: moved, ...rest } = s.live
        return { live: moved ? { ...rest, [m.to]: moved } : rest, rekeys: { ...s.rekeys, [m.from]: m.to } }
      })
      noteSession(m.to, machine)
      if (subscribed.delete(m.from)) subscribed.set(m.to, machine)
      return
  }
}

function applyEvent(view: LiveView, runId: string, e: LoggedEvent): LiveView {
  // Primeiro evento de um processo novo da mesma conversa: começa do zero.
  const v = view.runId === runId ? view : { ...emptyView(), runId }
  if (e.seq <= v.lastSeq) return v
  const next: LiveView = { ...v, events: [...v.events, e], lastSeq: e.seq, open: true }
  if (e.kind === 'state') {
    next.state = e.state
    next.waitingFor = e.waitingFor
    if (e.state !== 'running') next.streaming = ''
  }
  if (e.kind === 'assistant' && !e.parentToolUseId) next.streaming = ''
  if (e.kind === 'settings') next.settings = { model: e.model, effort: e.effort, permissionMode: e.permissionMode }
  if (e.kind === 'exit') {
    next.open = false
    next.streaming = ''
  }
  return next
}

function mergeCatalogs(): void {
  // A mesma conversa em duas máquinas (pastas do Claude sincronizadas): fica a primeira da lista.
  const seen = new Set<string>()
  const catalog = [...catalogs.values()]
    .flat()
    .filter((s) => !seen.has(s.sessionId) && seen.add(s.sessionId))
    .sort((a, b) => b.lastModified - a.lastModified)
  useStore.setState({ catalog })
}

function onCatalog(machine: string, sessions: CatalogEntry[]): void {
  const before = new Map(useStore.getState().catalog.map((s) => [s.sessionId, s.owner]))
  catalogs.set(machine, sessions.map((s) => ({ ...s, machine })))
  noteSessions(machine, sessions.map((s) => s.sessionId))
  mergeCatalogs()
  useStore.setState({ catalogLoaded: true })
  for (const s of sessions) {
    const at = subscribed.get(s.sessionId)
    if (at === undefined) continue
    if (at !== machine) {
      // Aberta antes de se saber a máquina dela (link direto, notificação): passa para a conexão certa.
      sockets.get(at)?.send({ type: 'unsubscribe', sessionId: s.sessionId })
      subscribed.set(s.sessionId, machine)
      sockets.get(machine)?.sendSubscribe(s.sessionId)
    } else if (s.owner === 'panel' && before.get(s.sessionId) !== 'panel') {
      // Sessão acompanhada que acabou de abrir no painel: pede o snapshot para saber o estado inicial.
      sockets.get(machine)?.sendSubscribe(s.sessionId)
    }
  }
}
