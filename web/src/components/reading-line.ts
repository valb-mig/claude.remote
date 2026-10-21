import { createContext } from 'react'

/**
 * Linha do markdown que está sendo lida em voz alta (ver lib/speech.ts); `null` quando a mensagem
 * não está sendo lida. O bloco dessa linha fica em destaque, como a letra no Spotify.
 */
export const ReadingLine = createContext<number | null>(null)
