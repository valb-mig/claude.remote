import { useCallback, useState } from 'react'
import { create } from 'zustand'

/** Como a conversa aparece: o chat, o mapa mental no lugar dele, ou os dois lado a lado (tela larga). */
export type ChatDisplay = 'chat' | 'map' | 'both'

// Preferência que vale para todas as conversas, como o cadeado de acompanhar o fim.
const KEY = 'cr:chat-display'

export function useChatDisplay(): [ChatDisplay, (next: ChatDisplay) => void] {
  const [display, setDisplay] = useState<ChatDisplay>(() => {
    try {
      const saved = localStorage.getItem(KEY)
      return saved === 'map' || saved === 'both' ? saved : 'chat'
    } catch {
      return 'chat'
    }
  })
  const set = useCallback((next: ChatDisplay) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // localStorage indisponível (modo privado): segue só em memória.
    }
    setDisplay(next)
  }, [])
  return [display, set]
}

/**
 * Quanto o mapa ocupa lado a lado com o chat, em fração da largura dos dois. Arrastar a divisória
 * muda; é uma preferência só, como a de cima, e em fração para servir a qualquer tamanho de janela.
 */
export const MAP_WIDTH = 0.46
const WIDTH_KEY = 'cr:map-width'

function savedWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    return saved > 0 && saved < 1 ? saved : MAP_WIDTH
  } catch {
    return MAP_WIDTH
  }
}

export const useMapWidth = create<{ width: number }>(() => ({ width: savedWidth() }))

export const setMapWidth = (width: number) => useMapWidth.setState({ width })

/** Grava a largura no fim do arrasto, não a cada movimento do mouse. */
export function saveMapWidth(): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(useMapWidth.getState().width))
  } catch {
    // localStorage indisponível (modo privado): vale só até fechar o app.
  }
}
