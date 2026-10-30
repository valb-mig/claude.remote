import { createContext, useContext, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { navigate } from 'wouter/use-browser-location'
import { create } from 'zustand'
import { useWindowWidth } from './hooks'
import { useSidebar } from './sidebar'

/**
 * Conversas lado a lado (split). A URL guarda as abertas, na ordem da tela: `/s/A?com=B,C`. Assim o
 * voltar desfaz a última abertura ou fechamento, e um link para `/s/A` (notificação) abre só ela.
 */

/** Largura mínima de cada conversa no PC: a de um celular pequeno, para o qual o chat foi feito. */
const MIN_CHAT = 340
/** No PC, a alça (`w-16`) fica sempre; a lista de conversas (`w-80` com conversas lado a lado) recolhe. */
const SIDEBAR = 320
const RAIL = 64
const MAX_CHATS = 4

export function splitUrl(ids: string[]): string {
  const [first, ...rest] = ids
  if (!first) return '/'
  return rest.length ? `/s/${first}?com=${rest.join(',')}` : `/s/${first}`
}

function parseChats(pathname: string, search: string): string[] {
  const match = /^\/s\/([^/]+)$/.exec(pathname)
  if (!match) return []
  const rest = new URLSearchParams(search).get('com')?.split(',').filter(Boolean) ?? []
  return [...new Set([match[1], ...rest])]
}

// Conversa em foco: a que recebe o que é escolhido na lista ao lado. Tocar numa conversa a põe em foco.
const useFocus = create<{ id: string | null }>(() => ({ id: null }))
export const focusChat = (id: string) => useFocus.setState({ id })

// ---- ações: leem a URL na hora, então servem em efeitos e callbacks sem ficar velhas ----

const current = () => parseChats(location.pathname, location.search)
const focusedOf = (ids: string[]) => {
  const id = useFocus.getState().id
  return id && ids.includes(id) ? id : ids[0]
}
const go = (ids: string[], replace = false) => navigate(splitUrl(ids), { replace })

/** Abre `id` logo depois da conversa `after` (ou da em foco); se já está aberta, só ganha o foco. */
export function openBeside(id: string, after?: string): void {
  const ids = current()
  focusChat(id)
  if (ids.includes(id)) return
  const at = ids.indexOf(after ?? focusedOf(ids)) + 1 || ids.length
  go([...ids.slice(0, at), id, ...ids.slice(at)])
}

/** Troca a conversa `old` por `id` no mesmo lugar (cópia, sessão que ganhou id novo). */
export function swapChat(old: string, id: string, replace = false): void {
  const ids = current()
  focusChat(id)
  go(ids.includes(id) ? ids : ids.map((x) => (x === old ? id : x)), replace)
}

/** Tira a conversa da tela; fechar a última volta para a lista. Fora da tela, não faz nada. */
export function closeChat(id: string, replace = false): void {
  const ids = current()
  if (!ids.includes(id)) return
  const rest = ids.filter((x) => x !== id)
  if (focusedOf(ids) === id && rest.length) focusChat(rest[Math.max(0, ids.indexOf(id) - 1)])
  go(rest, replace)
}

/**
 * Leva a conversa `id` para antes ou depois de `target`, arrastando pelo topo dela. Troca a URL sem
 * criar entrada no histórico: arrumar a tela não é um passo que o voltar deva desfazer.
 */
export function moveChat(id: string, target: string, after: boolean): void {
  const ids = current()
  if (id === target || !ids.includes(id) || !ids.includes(target)) return
  const rest = ids.filter((x) => x !== id)
  const at = rest.indexOf(target) + (after ? 1 : 0)
  go([...rest.slice(0, at), id, ...rest.slice(at)], true)
}

/** Tipo do arrasto de uma conversa pelo topo; só ele é aceito como soltura entre os painéis. */
export const CHAT_DRAG = 'application/x-claude-remote-chat'

/** A conversa sendo arrastada pelo topo, para as outras saberem mostrar onde ela vai cair. */
export const useDraggingChat = create<{ id: string | null }>(() => ({ id: null }))

// ---- tamanho de cada conversa lado a lado ----

/**
 * Quanto cada conversa ocupa, em peso relativo (1 é a parte igual). Arrastar a divisória passa peso
 * de uma para a vizinha. Fica salvo só das conversas abertas, para a lista não crescer para sempre.
 */
const SIZES_KEY = 'cr:split-sizes'

function savedSizes(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SIZES_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0))
  } catch {
    return {}
  }
}

export const useSplitSizes = create<{ weights: Record<string, number> }>(() => ({ weights: savedSizes() }))

export function setSplitWeights(patch: Record<string, number>): void {
  useSplitSizes.setState((s) => ({ weights: { ...s.weights, ...patch } }))
}

/** Grava os tamanhos no fim do arrasto, não a cada movimento do mouse. */
export function saveSplitSizes(): void {
  const open = new Set(current())
  const weights = Object.fromEntries(Object.entries(useSplitSizes.getState().weights).filter(([id]) => open.has(id)))
  try {
    localStorage.setItem(SIZES_KEY, JSON.stringify(weights))
  } catch {
    // localStorage indisponível (modo privado): vale só até fechar o app.
  }
}

// ---- leitura para a tela ----

/** Quantas conversas cabem lado a lado: até 2 no celular; no PC, conforme a largura (até 4). */
export function useMaxChats(): number {
  const width = useWindowWidth()
  const sidebar = useSidebar((s) => (s.collapsed ? RAIL : RAIL + SIDEBAR))
  if (width < 1024) return 2
  return Math.min(MAX_CHATS, Math.max(1, Math.floor((width - sidebar) / MIN_CHAT)))
}

/** Conversas na tela (vazio fora do chat), a em foco, quantas cabem e o link de cada conversa da lista. */
export function useSplit() {
  const [pathname] = useLocation()
  const search = useSearch()
  const ids = useMemo(() => parseChats(pathname, search), [pathname, search])
  const max = useMaxChats()
  const focusedId = useFocus((s) => s.id)
  const focused = focusedId && ids.includes(focusedId) ? focusedId : ids[0]
  return {
    ids,
    max,
    focused,
    canAdd: ids.length < max,
    /** Link de uma conversa na lista ao lado: já na tela, fica onde está; senão, toma o lugar da em foco. */
    hrefFor: (id: string) =>
      !ids.length ? `/s/${id}` : splitUrl(ids.includes(id) ? ids : ids.map((x) => (x === focused ? id : x))),
  }
}

/** Lugar de uma conversa na tela: se divide a tela com outras, se está em foco e se está encolhida. */
export type Pane = { split: boolean; focused: boolean; collapsed: boolean }

export const PaneContext = createContext<Pane>({ split: false, focused: true, collapsed: false })

export const usePane = () => useContext(PaneContext)
