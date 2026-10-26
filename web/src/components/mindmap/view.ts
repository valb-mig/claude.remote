import { useCallback, useState } from 'react'

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
