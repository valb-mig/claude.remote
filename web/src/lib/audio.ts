import { create } from 'zustand'

/**
 * O espectro do que sai pelas caixas do PC, para o tema de som do fundo da conversa (ver
 * components/wallpaper/som.ts). Quem captura é o servidor (server/src/audio.ts); aqui só chega o
 * resultado, umas 25 vezes por segundo, pelo WebSocket que já existe.
 *
 * O som é sempre o da máquina que serve o painel: é o PC que está na sua frente tocando, não o da
 * conversa aberta, que pode ser de outra máquina.
 */
export type Spectrum = {
  /** Altura de cada banda, do grave ao agudo, em 0–255. */
  bands: number[]
  /** Forma de onda da janela, 0–255 com 128 no silêncio. */
  wave: number[]
  /** Volume geral, 0–255. */
  level: number
}

const BANDS = 20
const WAVE = 40
const QUIET: Spectrum = { bands: Array<number>(BANDS).fill(0), wave: Array<number>(WAVE).fill(128), level: 0 }

type AudioState = {
  spectrum: Spectrum
  /** O PC consegue capturar o som? `null` enquanto o servidor não respondeu. */
  available: boolean | null
  /** Quando chegou o último quadro; serve para a cena saber que a ligação caiu. */
  at: number
}

export const useAudio = create<AudioState>(() => ({ spectrum: QUIET, available: null, at: 0 }))

export function onAudio(spectrum: Spectrum): void {
  useAudio.setState({ spectrum, at: Date.now() })
}

export function onAudioReady(available: boolean): void {
  useAudio.setState({ available })
}

/** Volta ao repouso quando ninguém está mais ouvindo. */
export function quietAudio(): void {
  useAudio.setState({ spectrum: QUIET, at: 0 })
}
