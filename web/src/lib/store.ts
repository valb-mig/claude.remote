import { create } from 'zustand'
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
  connection: Connection
  catalog: CatalogEntry[]
  catalogLoaded: boolean
  live: Record<string, LiveView>
  /** Sessões bifurcadas que ganharam ID novo: antigo → novo. */
  rekeys: Record<string, string>
  /** CPU, memória e processos do Claude no PC (a cada ~3 s). */
  system: SystemSnapshot | null
  /** Limites do plano e gasto da semana. */
  usage: UsageSnapshot | null
}

export const useStore = create<Store>(() => ({
  connection: 'connecting',
  catalog: [],
  catalogLoaded: false,
  live: {},
  rekeys: {},
  system: null,
  usage: null,
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
// Conexão WebSocket: reconecta sozinha e retoma cada sessão do último seq visto.
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null
let retry = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let lastMessageAt = 0
const subscriptions = new Set<string>()

const STALE_MS = 60_000

function wsUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
}

export function connect(): void {
  if (ws) return
  clearTimeout(retryTimer)
  useStore.setState({ connection: 'connecting' })
  const socket = new WebSocket(wsUrl())
  ws = socket

  socket.onopen = () => {
    retry = 0
    lastMessageAt = Date.now()
    useStore.setState({ connection: 'open' })
    for (const id of subscriptions) sendSubscribe(id)
  }
  socket.onmessage = (e) => handle(JSON.parse(String(e.data)))
  socket.onclose = () => {
    if (ws !== socket) return
    ws = null
    useStore.setState({ connection: 'closed' })
    retryTimer = setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++))
  }
}

/** Derruba a conexão atual (se parecer morta) e reconecta já, sem esperar o backoff. */
export function reconnectNow(force = false): void {
  const stale = Date.now() - lastMessageAt > STALE_MS
  if (ws && (force || stale)) {
    const old = ws
    ws = null
    old.close()
  }
  retry = 0
  connect()
}

// Celular voltando do bloqueio ou da falta de rede: a conexão antiga pode estar morta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reconnectNow()
})
window.addEventListener('online', () => reconnectNow(true))
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN && Date.now() - lastMessageAt > STALE_MS) reconnectNow(true)
}, 15_000)

function sendSubscribe(id: string): void {
  if (ws?.readyState !== WebSocket.OPEN) return
  const v = useStore.getState().live[id]
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: id, sinceSeq: v?.lastSeq ?? 0, runId: v?.runId }))
}

/** Pede o log inteiro da execução atual, descartando o que o cliente tem. */
function resync(id: string): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subscribe', sessionId: id, sinceSeq: 0 }))
}

export function subscribe(id: string): void {
  subscriptions.add(id)
  sendSubscribe(id)
}

export function unsubscribe(id: string): void {
  subscriptions.delete(id)
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'unsubscribe', sessionId: id }))
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

function handle(m: ServerMsg): void {
  lastMessageAt = Date.now()
  switch (m.type) {
    case 'catalog':
      return onCatalog(m.sessions)
    case 'system':
      return useStore.setState({ system: m.system })
    case 'usage':
      return useStore.setState({ usage: m.usage })
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
      if (before?.runId === m.runId) {
        // Buraco na sequência (mensagem perdida): pede o que falta.
        if (m.event.seq > before.lastSeq + 1) sendSubscribe(m.sessionId)
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
      if (subscriptions.delete(m.from)) subscriptions.add(m.to)
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

function onCatalog(sessions: CatalogEntry[]): void {
  const before = new Map(useStore.getState().catalog.map((s) => [s.sessionId, s.owner]))
  useStore.setState({ catalog: sessions, catalogLoaded: true })
  // Sessão acompanhada que acabou de abrir no painel: pede o snapshot para saber o estado inicial.
  for (const s of sessions) {
    if (subscriptions.has(s.sessionId) && s.owner === 'panel' && before.get(s.sessionId) !== 'panel') {
      sendSubscribe(s.sessionId)
    }
  }
}
