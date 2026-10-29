import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { WakaToday } from './types'

/**
 * O tempo que você passa no painel, para o WakaTime. O PC já manda sozinho o que o Claude escreve
 * (ele lê os transcritos), mas o seu lado — ler a resposta, conferir um diff, pensar na próxima
 * mensagem — não deixa rastro nenhum. Aqui o app avisa o PC enquanto você mexe nele.
 *
 * Como nos plugins de editor, vale a interação: toque, tecla, rolagem. Parou de mexer, para de
 * contar; com o app em segundo plano, também não conta.
 */

const EVERY_MS = 2 * 60_000
// Depois disso sem um toque, você saiu de perto: o próximo só sai quando voltar a mexer.
const IDLE_MS = 2 * 60_000
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchmove', 'scroll'] as const

/** Avisa o PC que você está na conversa deste projeto, no máximo uma vez a cada dois minutos. */
export function useActivityPing(machine: string, cwd?: string, category: 'code reviewing' | 'planning' = 'planning'): void {
  const touched = useRef(0)
  const sent = useRef(0)

  useEffect(() => {
    if (!cwd) return
    const touch = () => (touched.current = Date.now())
    for (const e of EVENTS) document.addEventListener(e, touch, { passive: true, capture: true })
    // Chegar na tela já conta como mexer: abrir a conversa é o começo do seu tempo nela.
    touch()

    const tick = () => {
      const now = Date.now()
      if (document.visibilityState !== 'visible') return
      if (now - touched.current > IDLE_MS) return
      if (now - sent.current < EVERY_MS) return
      sent.current = now
      void api.wakatime(machine, { cwd, category }).catch(() => {
        // Servidor antigo (sem a rota) ou PC fora do ar: o tempo deste intervalo se perde, e tudo bem.
      })
    }
    tick()
    const timer = setInterval(tick, 15_000)
    return () => {
      clearInterval(timer)
      for (const e of EVENTS) document.removeEventListener(e, touch, { capture: true })
    }
  }, [machine, cwd, category])
}

/** O total de hoje, perguntado ao PC de dois em dois minutos enquanto a tela está à vista. */
export function useWakatimeToday(machine: string): WakaToday | null | undefined {
  const [today, setToday] = useState<WakaToday | null>()
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') {
        api.wakatimeToday(machine).then(
          (r) => alive && setToday(r.today),
          // Máquina sem a rota (servidor antigo) ou fora do ar: o anel simplesmente não aparece.
          () => alive && setToday(null),
        )
      }
      if (alive) timer = setTimeout(load, 2 * 60_000)
    }
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [machine])
  return today
}
