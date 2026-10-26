import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api } from './api'
import type { GitStatus } from './types'

/** Se a media query vale agora, acompanhando mudanças (girar o celular, redimensionar a janela). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
  )
}

/** Tela larga (PC, tablet deitado): a lista de conversas fica fixa ao lado. Mesmo limite do `lg:` do Tailwind. */
export const useWide = () => useMediaQuery('(min-width: 64rem)')

/** Largura de um elemento, acompanhando a tela (girar o celular, abrir outra conversa ao lado). */
export function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** Largura da janela, acompanhando o redimensionamento. */
export function useWindowWidth(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange)
      return () => window.removeEventListener('resize', onChange)
    },
    () => window.innerWidth,
  )
}

const homeRequests = new Map<string, Promise<string>>()

/** Pasta pessoal na máquina (uma consulta por máquina por carregamento do app). */
export function useHome(machine: string): string | undefined {
  const [home, setHome] = useState<string>()
  useEffect(() => {
    let request = homeRequests.get(machine)
    if (!request) homeRequests.set(machine, (request = api.health(machine).then((h) => h.home)))
    request.then(setHome, () => homeRequests.delete(machine))
  }, [machine])
  return home
}

/** Estado do git do projeto; relido quando `refresh` muda (ex.: a cada turno concluído). */
export function useGitStatus(
  machine: string,
  cwd: string | undefined,
  refresh: unknown,
): { status: GitStatus | null; reload: () => void } {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!cwd) return setStatus(null)
    let alive = true
    api.git(machine, cwd).then(
      (s) => alive && setStatus(s),
      () => alive && setStatus(null),
    )
    return () => {
      alive = false
    }
  }, [machine, cwd, refresh, tick])
  return { status, reload: () => setTick((t) => t + 1) }
}

const LONG_PRESS_MS = 500
// Dedo que andou mais que isso está rolando a lista, não segurando.
const MOVE_TOLERANCE = 10

/**
 * Abre um menu com o botão direito (PC) ou segurando o dedo (celular). O toque longo é feito aqui, e
 * não pelo do navegador: no iPhone ele não vira `contextmenu`, e no Android o menu do próprio Chrome
 * para links apareceria. Depois de um toque longo, o toque que segue não abre a conversa.
 */
export function usePressMenu(open: (x: number, y: number) => void) {
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const touch = useRef(false)
  // O toque longo já abriu o menu: o `contextmenu` do Android e o clique ao soltar ficam de fora.
  const opened = useRef(false)
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      cancel()
      opened.current = false
      touch.current = e.pointerType !== 'mouse'
      if (!touch.current) return
      const { clientX: x, clientY: y } = e
      const timer = setTimeout(() => {
        press.current = null
        opened.current = true
        navigator.vibrate?.(10)
        open(x, y)
      }, LONG_PRESS_MS)
      press.current = { timer, x, y }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancel()
    },
    onPointerUp: cancel,
    // A lista começou a rolar.
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancel()
      if (opened.current) return
      if (touch.current) opened.current = true
      // Tecla de menu do teclado: sem ponteiro, abre embaixo do item.
      if (e.clientX === 0 && e.clientY === 0) {
        const r = e.currentTarget.getBoundingClientRect()
        open(r.left + 16, r.bottom)
      } else {
        open(e.clientX, e.clientY)
      }
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!opened.current) return
      opened.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
